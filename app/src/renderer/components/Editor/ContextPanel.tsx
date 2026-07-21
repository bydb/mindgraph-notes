import React, { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useFlashcardStore, isCardDue } from '../../stores/flashcardStore'
import { useTranslation } from '../../utils/translations'
import { getNoteKind } from '../../utils/noteKind'
import { resolveLink } from '../../utils/linkExtractor'
import { isBrainNote, brainNoteLabel } from '../../utils/brainNote'
import { BrainIcon } from '../BrainIcon'
import {
  EMBEDDINGS_CACHE_VERSION,
  cosineSimilarity,
  normalizeEmbeddingScore,
  pickPreferredEmbeddingModel,
  type EmbeddingsCache
} from '../../utils/embeddingSimilarity'
import type { Note } from '../../../shared/types'

// Kontextspalte rechts im Editor: vereint Backlinks, ausgehende Links,
// Smart-Connections-Ähnlichkeit und fällige Karteikarten an EINEM Ort
// (Design-Variante „Fokus + Kontextspalte", Befund E4: vorher drei Orte).
//
// Ähnlichkeit ist bewusst NUR Cache-basiert: es werden keine Embeddings
// berechnet, nur der bestehende Smart-Connections-Cache gelesen (Cosine +
// Normalisierung aus utils/embeddingSimilarity — Single-Source mit dem Panel).

interface ContextPanelProps {
  note: Note
}

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
  const { smartConnectionsEnabled, flashcardsEnabled, llmSettings, brainFolder, setEditorShowContextPanel } = useUIStore(
    useShallow(s => ({
      smartConnectionsEnabled: s.smartConnectionsEnabled,
      flashcardsEnabled: s.flashcardsEnabled,
      llmSettings: s.ollama,
      brainFolder: s.brain.folderPath,
      setEditorShowContextPanel: s.setEditorShowContextPanel
    }))
  )
  const { flashcards, startStudySession, setPanel } = useFlashcardStore(
    useShallow(s => ({ flashcards: s.flashcards, startStudySession: s.startStudySession, setPanel: s.setPanel }))
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
        <span className="context-link-title">{brain ? brainNoteLabel(target) : target.title}</span>
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
                    <span className="context-link-title">{entry.title}</span>
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

      {flashcardsEnabled && noteCards.length > 0 && (
        <section className="context-section">
          <div className="context-section-head">
            {t('context.flashcards')}
            <span className={`context-count${dueCards.length > 0 ? ' context-count-due' : ''}`}>
              {dueCards.length > 0
                ? t('context.flashcardsDue', { count: dueCards.length })
                : t('context.flashcardsNoneDue')}
            </span>
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
