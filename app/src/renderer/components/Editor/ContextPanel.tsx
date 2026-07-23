import React, { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useProjectStatusStore } from '../../stores/projectStatusStore'
import { useFlashcardStore, isCardDue } from '../../stores/flashcardStore'
import { useTranslation } from '../../utils/translations'
import { getNoteKind, stripNoteKindMarker, splitZettelTitle } from '../../utils/noteKind'
import { resolveLink } from '../../utils/linkExtractor'
import { isBrainNote, brainNoteLabel } from '../../utils/brainNote'
import { BrainIcon } from '../BrainIcon'
import { annotationRelPathFor, parseAnnotationAnchors, type AnnotationAnchor } from '../../utils/annotations'
import { extractTasks, type ExtractedTask } from '../../../shared/taskExtractor'
import { matchEmailToProjects, gateProjectMatch } from '../../../shared/projectMatch'
import {
  EMBEDDINGS_CACHE_VERSION,
  cosineSimilarity,
  normalizeEmbeddingScore,
  pickPreferredEmbeddingModel,
  type EmbeddingsCache
} from '../../utils/embeddingSimilarity'
import type { DiscoveredProject, Note } from '../../../shared/types'

// Kontextspalte rechts im Editor: vereint Backlinks, ausgehende Links,
// Smart-Connections-Ähnlichkeit, Arbeitskontext (Projekt, offene Aufgaben,
// rote Annotationen — nur bei 🔴-Notizen) und fällige Karteikarten an EINEM
// Ort (Design-Variante „Fokus + Kontextspalte", Befund E4: vorher drei Orte).
// Der frühere WorkContextStrip unter dem Editor ist hierher eingefaltet;
// seine Brain-Sektion entfiel ersatzlos (Brain-Backlinks stehen in „Verknüpft").
//
// Ähnlichkeit ist bewusst NUR Cache-basiert: es werden keine Embeddings
// berechnet, nur der bestehende Smart-Connections-Cache gelesen (Cosine +
// Normalisierung aus utils/embeddingSimilarity — Single-Source mit dem Panel).

interface ContextPanelProps {
  note: Note
}

// Projekte EINMAL pro Sitzung lazy laden (discover = nur markierte _STATUS.md
// lesen). Modul-weite Sperre gegen wiederholte Discover-Läufe pro Notiz-Öffnen.
let projectLoadTriedFor: string | null = null

// Numerisches Ordner-Präfix für die Anzeige entfernen ("134 - AIS chat change" → "AIS chat change").
const cleanProjectName = (name: string): string =>
  name.replace(/^\s*\d+\s*[-–—]\s*/, '').trim() || name

const shortQuote = (q: string): string => {
  const c = (q || '').replace(/\s+/g, ' ').trim()
  return c.length > 110 ? `${c.slice(0, 110)}…` : c
}

interface MatchedProject {
  project: DiscoveredProject
  confidence: 'high' | 'low'
}

// Zeilentitel beruhigen: Kategorie-Emoji raus (der Dot zeigt die Kategorie,
// Konvention „Dot statt rohem Emoji") und Zettel-ID-Präfix ausblenden.
const rowTitle = (title: string): string =>
  splitZettelTitle(stripNoteKindMarker(title)).displayTitle

interface SimilarEntry {
  id: string
  title: string
  score: number // 0-1, normalisiert
}

type SimilarState = 'loading' | 'ready' | 'not-indexed' | 'unavailable'

// Cache-Laden nach Mount verzögern, damit der erste Notiz-Render nicht mit dem
// JSON-Parse des Embeddings-Caches (potenziell viele MB) konkurriert.
const CACHE_LOAD_DELAY_MS = 1500

export const ContextPanel: React.FC<ContextPanelProps> = ({ note }) => {
  const { t } = useTranslation()
  const { notes, vaultPath, selectNote } = useNotesStore(
    useShallow(s => ({ notes: s.notes, vaultPath: s.vaultPath, selectNote: s.selectNote }))
  )
  const { smartConnectionsEnabled, flashcardsEnabled, llmSettings, brainFolder, projectsRootFolder, setEditorShowContextPanel } = useUIStore(
    useShallow(s => ({
      smartConnectionsEnabled: s.smartConnectionsEnabled,
      flashcardsEnabled: s.flashcardsEnabled,
      llmSettings: s.ollama,
      brainFolder: s.brain.folderPath,
      projectsRootFolder: s.projectsRootFolder,
      setEditorShowContextPanel: s.setEditorShowContextPanel
    }))
  )
  const projects = useProjectStatusStore(s => s.projects)
  const synonyms = useProjectStatusStore(s => s.synonyms)
  const { flashcards, startStudySession, setPanel, setCreatingCard } = useFlashcardStore(
    useShallow(s => ({ flashcards: s.flashcards, startStudySession: s.startStudySession, setPanel: s.setPanel, setCreatingCard: s.setCreatingCard }))
  )

  // --- Verknüpft: Backlinks (←) + ausgehende Links (→) ---
  const backlinkNotes = useMemo(
    () => note.incomingLinks
      .map(id => notes.find(n => n.id === id))
      .filter((n): n is Note => Boolean(n)),
    [note.incomingLinks, notes]
  )

  const outgoingItems = useMemo(() => {
    const seen = new Set<string>()
    const items: Array<{ linkText: string; target: Note | null }> = []
    for (const linkText of note.outgoingLinks) {
      const target = resolveLink(linkText, notes)
      if (target && target.id === note.id) continue
      const key = target ? `n:${target.id}` : `t:${linkText.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ linkText, target })
    }
    return items
  }, [note.id, note.outgoingLinks, notes])

  const linkedCount = backlinkNotes.length + outgoingItems.length

  // --- Ähnlich: Cache-basierte Embedding-Ähnlichkeit ---
  const [embeddingsCache, setEmbeddingsCache] = useState<EmbeddingsCache | null>(null)
  const [similarState, setSimilarState] = useState<SimilarState>('loading')
  const [similarModel, setSimilarModel] = useState<string | null>(null)

  useEffect(() => {
    if (!smartConnectionsEnabled || !vaultPath) return
    let cancelled = false

    const timer = window.setTimeout(async () => {
      try {
        let models: Array<{ name: string }> = []
        if (llmSettings.backend === 'lm-studio') {
          const available = await window.electronAPI.lmstudioCheck(llmSettings.lmStudioPort)
          if (available) models = await window.electronAPI.lmstudioEmbeddingModels(llmSettings.lmStudioPort)
        } else {
          const available = await window.electronAPI.ollamaCheck()
          if (available) models = await window.electronAPI.ollamaEmbeddingModels()
        }
        if (cancelled) return

        const model = pickPreferredEmbeddingModel(models)
        if (!model) {
          setSimilarState('unavailable')
          return
        }
        setSimilarModel(model)

        const cache = await window.electronAPI.loadEmbeddingsCache?.(vaultPath, model) as EmbeddingsCache | null
        if (cancelled) return
        if (!cache || cache.version !== EMBEDDINGS_CACHE_VERSION || Object.keys(cache.files).length === 0) {
          setSimilarState('not-indexed')
          return
        }
        setEmbeddingsCache(cache)
      } catch (err) {
        console.error('[ContextPanel] Embeddings-Cache laden fehlgeschlagen:', err)
        if (!cancelled) setSimilarState('unavailable')
      }
    }, CACHE_LOAD_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [smartConnectionsEnabled, vaultPath, llmSettings.backend, llmSettings.lmStudioPort])

  const similarNotes: SimilarEntry[] = useMemo(() => {
    if (!embeddingsCache) return []
    const own = embeddingsCache.files[note.id]?.embedding
    if (!own || own.length === 0) return []

    const scored: SimilarEntry[] = []
    for (const other of notes) {
      if (other.id === note.id || !other.path.endsWith('.md')) continue
      const entry = embeddingsCache.files[other.id]?.embedding
      if (!entry || entry.length === 0) continue
      const score = normalizeEmbeddingScore(cosineSimilarity(own, entry))
      if (score <= 0.05) continue
      scored.push({ id: other.id, title: other.title, score })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 3)
  }, [embeddingsCache, note.id, notes])

  useEffect(() => {
    if (!embeddingsCache) return
    const own = embeddingsCache.files[note.id]?.embedding
    setSimilarState(own && own.length > 0 ? 'ready' : 'not-indexed')
  }, [embeddingsCache, note.id])

  // --- Arbeitskontext (nur 🔴-Notizen): Projekt, offene Aufgaben, rote Annotationen ---
  const noteKind = useMemo(() => getNoteKind(note), [note])
  const isProblem = noteKind?.id === 'problem'

  useEffect(() => {
    if (!vaultPath) return
    const st = useProjectStatusStore.getState()
    if (projectLoadTriedFor !== vaultPath && st.projects.length === 0 && !st.loading && st.lastLoadedAt === null) {
      projectLoadTriedFor = vaultPath
      void st.load(vaultPath, projectsRootFolder || undefined)
    }
  }, [vaultPath, projectsRootFolder])

  // Projekt per Pfad (starkes Signal) oder Keyword-Match (findet Inbox-/Mail-Notizen).
  const matchedProject = useMemo<MatchedProject | null>(() => {
    if (!isProblem || projects.length === 0) return null
    const byPath = projects.find(p => note.path.startsWith(`${p.folderRel}/`))
    if (byPath) return { project: byPath, confidence: 'high' }
    const matches = matchEmailToProjects({ subject: note.title, bodyText: note.content }, projects, synonyms)
    const gate = gateProjectMatch(matches)
    if (gate.top && (gate.confidence === 'high' || gate.confidence === 'low')) {
      return { project: gate.top.project, confidence: gate.confidence }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.path, note.title, note.content, isProblem, projects, synonyms])

  // Aufgaben + Annotationen frisch von Platte lesen (Store-Content kann aus dem
  // Cache leer sein) — ein readFilesBatch-Call, wie im früheren Streifen.
  const [redAnno, setRedAnno] = useState<AnnotationAnchor[]>([])
  const [openTasks, setOpenTasks] = useState<ExtractedTask[]>([])

  useEffect(() => {
    let cancelled = false
    if (!vaultPath || !isProblem) {
      setRedAnno([])
      setOpenTasks([])
      return
    }
    const notePath = note.path
    ;(async () => {
      let red: AnnotationAnchor[] = []
      let tasks: ExtractedTask[] = []
      try {
        const annoRel = annotationRelPathFor(notePath)
        const res = await window.electronAPI.readFilesBatch(vaultPath, [annoRel, notePath])
        red = parseAnnotationAnchors(res[annoRel] || '').filter(a => a.color === 'red')
        tasks = extractTasks(res[notePath] || '').tasks.filter(task => !task.completed)
      } catch {
        /* Sidecar fehlt o. Lesefehler → leer, Sektionen bleiben still */
      }
      if (cancelled) return
      setRedAnno(red)
      setOpenTasks(tasks)
    })()
    return () => {
      cancelled = true
    }
  }, [note.id, note.path, vaultPath, isProblem])

  // --- Karteikarten dieser Notiz ---
  const noteCards = useMemo(
    () => flashcards.filter(c => c.sourceNote === note.path),
    [flashcards, note.path]
  )
  const dueCards = useMemo(() => noteCards.filter(isCardDue), [noteCards])

  const renderNoteRow = (target: Note, direction: '←' | '→') => {
    const brain = isBrainNote(target, brainFolder)
    const kind = brain ? null : getNoteKind(target)
    return (
      <button
        key={`${direction}-${target.id}`}
        className="context-link-row"
        onClick={() => selectNote(target.id)}
        title={target.path}
      >
        <span className="context-link-arrow">{direction}</span>
        {brain ? (
          <BrainIcon size={12} title={t('brain.noteLabel')} />
        ) : target.sourcePdf ? (
          <span className="context-pdf-chip">PDF</span>
        ) : (
          <span className={`note-kind-dot${kind ? ` note-kind-${kind.id}` : ' context-dot-neutral'}`} />
        )}
        <span className="context-link-title">{brain ? brainNoteLabel(target) : rowTitle(target.title)}</span>
      </button>
    )
  }

  return (
    <aside className="context-panel">
      <div className="context-panel-header">
        <span className="context-panel-title">{t('context.title')}</span>
        <span className="context-panel-subtitle">{t('context.subtitle')}</span>
        <button
          className="context-panel-close"
          onClick={() => setEditorShowContextPanel(false)}
          title={t('editor.contextPanel.hide')}
          aria-label={t('editor.contextPanel.hide')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {matchedProject && (
        <section className="context-section">
          <div className="context-section-head">{t('workContext.project')}</div>
          <div className="context-project">
            <span className="context-project-name">{cleanProjectName(matchedProject.project.marker.project)}</span>
            <span className={`context-project-status context-project-status-${matchedProject.project.marker.status ?? 'active'}`}>
              {(matchedProject.project.marker.status ?? 'active') === 'done' ? t('workContext.statusDone') : t('workContext.statusActive')}
            </span>
            {matchedProject.confidence === 'low' && (
              <span className="context-project-likely">{t('workContext.likely')}</span>
            )}
          </div>
        </section>
      )}

      <section className="context-section">
        <div className="context-section-head">
          {t('context.linked')}
          <span className="context-count">{linkedCount}</span>
        </div>
        {linkedCount === 0 ? (
          <p className="context-empty">{t('context.linkedEmpty')}</p>
        ) : (
          <div className="context-link-list">
            {backlinkNotes.map(n => renderNoteRow(n, '←'))}
            {outgoingItems.map(item => item.target ? (
              renderNoteRow(item.target, '→')
            ) : (
              <div key={`u-${item.linkText}`} className="context-link-row context-link-unresolved">
                <span className="context-link-arrow">→</span>
                <span className="context-link-title">
                  {item.linkText} <span className="context-link-missing">({t('context.linkedNoNote')})</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {smartConnectionsEnabled && (
        <section className="context-section">
          <div className="context-section-head">
            {t('context.similar')}
            <span className="context-section-meta">
              {similarModel ? `${similarModel.split(':')[0]} · ` : ''}{t('context.similarLocal')}
            </span>
          </div>
          {similarState === 'ready' && similarNotes.length > 0 && (
            <div className="context-similar-list">
              {similarNotes.map(entry => (
                <button
                  key={entry.id}
                  className="context-similar-card"
                  onClick={() => selectNote(entry.id)}
                >
                  <span className="context-similar-row">
                    <span className="context-link-title">{rowTitle(entry.title)}</span>
                    <span className="context-similar-score">{Math.round(entry.score * 100)}%</span>
                  </span>
                  <span className="context-similar-bar">
                    <span className="context-similar-bar-fill" style={{ width: `${Math.round(entry.score * 100)}%` }} />
                  </span>
                </button>
              ))}
            </div>
          )}
          {similarState === 'ready' && similarNotes.length === 0 && (
            <p className="context-empty">{t('context.similarNone')}</p>
          )}
          {similarState === 'not-indexed' && (
            <p className="context-empty">{t('context.similarNotIndexed')}</p>
          )}
          {similarState === 'unavailable' && (
            <p className="context-empty">{t('context.similarUnavailable')}</p>
          )}
        </section>
      )}

      {openTasks.length > 0 && (
        <section className="context-section">
          <div className="context-section-head">
            {t('workContext.openTasks')}
            <span className="context-count">{openTasks.length}</span>
          </div>
          <ul className="context-task-list">
            {openTasks.slice(0, 4).map((task, i) => (
              <li key={i} className={`context-task${task.isCritical ? ' critical' : ''}${task.isOverdue ? ' overdue' : ''}`}>
                <span className="context-task-box">☐</span>
                <span className="context-task-text">{task.text}</span>
                {task.isCritical && <span className="context-task-urgent">{t('workContext.urgent')}</span>}
              </li>
            ))}
            {openTasks.length > 4 && (
              <li className="context-more">+{openTasks.length - 4} {t('workContext.more')}</li>
            )}
          </ul>
        </section>
      )}

      {redAnno.length > 0 && (
        <section className="context-section">
          <div className="context-section-head">
            <span className="context-anno-dot" />
            {t('workContext.redAnnotations')}
            <span className="context-count">{redAnno.length}</span>
          </div>
          <ul className="context-anno-list">
            {redAnno.slice(0, 3).map(a => (
              <li key={a.id} className="context-anno">
                {a.page != null && <span className="context-anno-page">S. {a.page}</span>}
                <span className="context-anno-quote">{shortQuote(a.quote)}</span>
              </li>
            ))}
            {redAnno.length > 3 && (
              <li className="context-more">+{redAnno.length - 3} {t('workContext.more')}</li>
            )}
          </ul>
        </section>
      )}

      {flashcardsEnabled && (
        <section className="context-section">
          <div className="context-section-head">
            {t('context.flashcards')}
            {noteCards.length > 0 && (
              <span className={`context-count${dueCards.length > 0 ? ' context-count-due' : ''}`}>
                {dueCards.length > 0
                  ? t('context.flashcardsDue', { count: dueCards.length })
                  : t('context.flashcardsNoneDue')}
              </span>
            )}
            {/* Karte direkt aus dem Lesekontext erstellen — öffnet das globale
                FlashcardEditor-Modal, Quell-Notiz + Thema füllt es selbst vor. */}
            <button
              className="context-add-btn"
              onClick={() => setCreatingCard(true)}
              title={t('context.flashcardsAdd')}
              aria-label={t('context.flashcardsAdd')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
          {dueCards.length > 0 && (
            <>
              <div className="context-flashcard-preview">{dueCards[0].front}</div>
              <button
                className="context-flashcard-learn"
                onClick={() => {
                  startStudySession(dueCards)
                  setPanel(true)
                }}
              >
                ▶ {t('context.flashcardsLearn', { count: dueCards.length })}
              </button>
            </>
          )}
        </section>
      )}

      <span className="context-panel-spacer" />
      <div className="context-panel-hint">{t('context.commandPaletteHint')}</div>
    </aside>
  )
}
