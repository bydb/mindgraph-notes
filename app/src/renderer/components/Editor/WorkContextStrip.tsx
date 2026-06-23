import React, { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useProjectStatusStore } from '../../stores/projectStatusStore'
import { useTranslation } from '../../utils/translations'
import { getNoteKind } from '../../utils/noteKind'
import { annotationRelPathFor, parseAnnotationAnchors, type AnnotationAnchor } from '../../utils/annotations'
import { extractTasks, type ExtractedTask } from '../../../shared/taskExtractor'
import { matchEmailToProjects, gateProjectMatch, GENERIC_STOPWORDS } from '../../../shared/projectMatch'
import { isBrainNote, brainNoteLabel } from '../../utils/brainNote'
import { BrainIcon } from '../BrainIcon'
import type { DiscoveredProject, Note } from '../../../shared/types'

// Phase 1.5 des "Arbeitskontext"-Streifens.
//
// Erscheint NUR bei 🔴-Problem-Notizen. Zeigt rein deterministisch (kein LLM,
// kein Embedding) Kontext von AUSSERHALB der Notiz:
//   1. Zugeordnetes Projekt — per KEYWORD-Match (matchEmailToProjects + gate),
//      nicht per Pfad. So finden auch Inbox-/Mail-Notizen ihr Projekt.
//   2. Verwandte Notizen desselben Projekts (Titel-Match) — das Vergessene.
//   3. Rote Annotationen der Notiz.
//   4. Offene Aufgaben der Notiz (nachrangig).
// Ändert nichts, schreibt nichts. Bei fehlendem Match erscheint gar nichts.
//
// Projekte werden EINMAL pro Sitzung lazy geladen (discover liest nur die
// markierten _STATUS.md — billig, kein Voll-Scan, kein LLM). Modul-weite Sperre
// verhindert wiederholte Discover-Läufe bei jedem Notiz-Öffnen.
let projectLoadTriedFor: string | null = null

// Generische Wörter, die zwar im Projektnamen stehen können ("AIS chat change"),
// im Titel-Match aber Fremdtreffer erzeugen ("Change Log", "PDF Format Chat …").
const EXTRA_GENERIC_TITLE_TERMS = new Set([
  'chat', 'change', 'update', 'status', 'info', 'team', 'format', 'log', 'pdf', 'note', 'notiz'
])

const shortQuote = (q: string): string => {
  const c = (q || '').replace(/\s+/g, ' ').trim()
  return c.length > 140 ? `${c.slice(0, 140)}…` : c
}

// Identifizierende Wörter eines Projekts (Name + Ordner + Keywords), entstopwortet.
const buildProjectTerms = (project: DiscoveredProject): string[] => {
  const raw = [project.marker.project, project.folderName, ...(project.marker.keywords || [])]
  const set = new Set<string>()
  for (const phrase of raw) {
    for (const w of (phrase || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      const t = w.trim()
      if (t.length >= 4 && !GENERIC_STOPWORDS.has(t) && !EXTRA_GENERIC_TITLE_TERMS.has(t)) set.add(t)
    }
  }
  return [...set]
}

// Unicode-bewusste Wortgrenze statt Substring: Term muss von Nicht-Buchstaben/
// -Ziffer umgeben sein. Verhindert Rauschen wie „change" in „Changelog".
const buildTermRegex = (terms: string[]): RegExp | null => {
  if (!terms.length) return null
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${escaped.join('|')})(?:$|[^\\p{L}\\p{N}])`, 'iu')
}

// Numerisches Ordner-Präfix für die Anzeige entfernen ("134 - AIS chat change" → "AIS chat change").
const cleanProjectName = (name: string): string =>
  name.replace(/^\s*\d+\s*[-–—]\s*/, '').trim() || name

interface MatchedProject {
  project: DiscoveredProject
  confidence: 'high' | 'low'
}

export const WorkContextStrip: React.FC = () => {
  const { t } = useTranslation()
  const { selectedNoteId, notes, vaultPath, selectNote } = useNotesStore(
    useShallow(s => ({
      selectedNoteId: s.selectedNoteId,
      notes: s.notes,
      vaultPath: s.vaultPath,
      selectNote: s.selectNote
    }))
  )
  const projectsRootFolder = useUIStore(s => s.projectsRootFolder)
  const brainFolder = useUIStore(s => s.brain.folderPath)
  const projects = useProjectStatusStore(s => s.projects)
  const synonyms = useProjectStatusStore(s => s.synonyms)

  const note = useMemo(
    () => (selectedNoteId ? notes.find(n => n.id === selectedNoteId) ?? null : null),
    [notes, selectedNoteId]
  )
  const kind = note ? getNoteKind(note) : null
  const isProblem = kind?.id === 'problem'

  // Projekte EINMAL pro Sitzung lazy laden (discover = nur markierte _STATUS.md lesen).
  useEffect(() => {
    if (!vaultPath) return
    const st = useProjectStatusStore.getState()
    if (projectLoadTriedFor !== vaultPath && st.projects.length === 0 && !st.loading && st.lastLoadedAt === null) {
      projectLoadTriedFor = vaultPath
      void st.load(vaultPath, projectsRootFolder || undefined)
    }
  }, [vaultPath, projectsRootFolder])

  // Signal 1 — Projekt per Keyword (oder Pfad als starkes Fallback), synchron.
  const matchedProject = useMemo<MatchedProject | null>(() => {
    // Projekt-/Aufgaben-Kontext bleibt auf 🔴-Notizen beschränkt (Arbeitskontext);
    // die Brain-Sektion unten ist universell.
    if (!note || !isProblem || projects.length === 0) return null
    const byPath = projects.find(p => note.path.startsWith(`${p.folderRel}/`))
    if (byPath) return { project: byPath, confidence: 'high' }
    const matches = matchEmailToProjects({ subject: note.title, bodyText: note.content }, projects, synonyms)
    const gate = gateProjectMatch(matches)
    if (gate.top && (gate.confidence === 'high' || gate.confidence === 'low')) {
      return { project: gate.top.project, confidence: gate.confidence }
    }
    return null
  }, [note?.path, note?.title, note?.content, isProblem, projects, synonyms])

  // Signal 1b — verwandte Notizen desselben Projekts (Titel-Match, kein Content-Load).
  const relatedNotes = useMemo(() => {
    if (!matchedProject || !note) return []
    const folderRel = matchedProject.project.folderRel
    const re = buildTermRegex(buildProjectTerms(matchedProject.project))
    const seen = new Set<string>([note.id])
    const out: Note[] = []
    const consider = (n: Note) => {
      if (seen.has(n.id)) return
      const base = n.path.split('/').pop() || ''
      if (base.startsWith('_')) return // _STATUS-Entwürfe etc. raus
      seen.add(n.id)
      out.push(n)
    }
    // 1) Notizen IM Projektordner — deterministisch, garantiert zugehörig.
    for (const n of notes) {
      if (n.path.startsWith(`${folderRel}/`)) consider(n)
    }
    // 2) Notizen AUSSERHALB mit distinktivem Projekt-Term im Titel (verstreute Inbox-/Mail-Notizen).
    if (re) {
      for (const n of notes) {
        if (!n.path.startsWith(`${folderRel}/`) && re.test(n.title)) consider(n)
      }
    }
    return out.slice(0, 6)
  }, [matchedProject, notes, note?.id])

  // Brain im Kontext: welche Brain-Tage haben diese Notiz in ihren Tag aufgenommen?
  // (Backlinks der Notiz, gefiltert auf Brain-Notizen — das stille „17"-Signal wird sichtbar.)
  const brainMentions = useMemo(() => {
    if (!note) return []
    return note.incomingLinks
      .map(id => notes.find(n => n.id === id))
      .filter((n): n is Note => !!n && isBrainNote(n, brainFolder))
      .sort((a, b) => b.path.localeCompare(a.path)) // neueste zuerst (Pfad = …/JJJJ/MM/TT)
      .slice(0, 3)
  }, [note, notes, brainFolder])

  // Signal 3 (rote Annotationen) + Signal 2 (offene Aufgaben) — ein IPC-Call.
  const [redAnno, setRedAnno] = useState<AnnotationAnchor[]>([])
  const [openTasks, setOpenTasks] = useState<ExtractedTask[]>([])
  const [loaded, setLoaded] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!note || !vaultPath || !isProblem) {
      // Nicht-🔴-Notizen: nichts nachzuladen → sofort „geladen", damit die
      // universelle Brain-Sektion trotzdem rendern kann.
      setRedAnno([])
      setOpenTasks([])
      setLoaded(true)
      return
    }
    setLoaded(false)
    const notePath = note.path
    ;(async () => {
      let red: AnnotationAnchor[] = []
      let tasks: ExtractedTask[] = []
      try {
        const annoRel = annotationRelPathFor(notePath)
        const res = await window.electronAPI.readFilesBatch(vaultPath, [annoRel, notePath])
        const annoContent = res[annoRel] || ''
        const body = res[notePath] || ''
        red = parseAnnotationAnchors(annoContent).filter(a => a.color === 'red')
        tasks = extractTasks(body).tasks.filter(task => !task.completed)
      } catch {
        /* Sidecar fehlt o. Lesefehler → leer, Streifen bleibt still */
      }
      if (cancelled) return
      setRedAnno(red)
      setOpenTasks(tasks)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [note?.id, note?.path, vaultPath, isProblem])

  if (!note) return null
  if (!loaded) return null
  if (!matchedProject && !relatedNotes.length && !brainMentions.length && !redAnno.length && !openTasks.length) return null

  const status = matchedProject?.project.marker.status ?? 'active'
  const statusLabel = status === 'done' ? t('workContext.statusDone') : t('workContext.statusActive')

  return (
    <div className={`work-context-strip ${collapsed ? 'collapsed' : ''}`}>
      <div className="work-context-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="work-context-header-left">
          {kind
            ? <span className={`note-kind-dot note-kind-${kind.id}`} />
            : <BrainIcon size={12} />}
          {t('workContext.title')}
        </div>
        <span className="work-context-toggle">▼</span>
      </div>
      <div className="work-context-content">
        {brainMentions.length > 0 && (
          <div className="work-context-section work-context-brain-section">
            <div className="work-context-section-label">
              <BrainIcon size={12} />
              {t('workContext.brainHeading')}
            </div>
            <ul className="work-context-list">
              {brainMentions.map(b => (
                <li key={b.id} className="work-context-related" onClick={() => selectNote(b.id)}>
                  <BrainIcon size={13} />
                  <span className="work-context-related-title">{t('workContext.partOfDay')} {brainNoteLabel(b)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {matchedProject && (
          <div className="work-context-section">
            <div className="work-context-section-label">{t('workContext.project')}</div>
            <div className="work-context-project">
              <span className="work-context-project-name">{cleanProjectName(matchedProject.project.marker.project)}</span>
              <span className={`work-context-status work-context-status-${status}`}>{statusLabel}</span>
              {matchedProject.confidence === 'low' && (
                <span className="work-context-likely">{t('workContext.likely')}</span>
              )}
            </div>
          </div>
        )}

        {relatedNotes.length > 0 && (
          <div className="work-context-section">
            <div className="work-context-section-label">
              {t('workContext.related')}
              <span className="work-context-count">{relatedNotes.length}</span>
            </div>
            <ul className="work-context-list">
              {relatedNotes.map(n => {
                const brain = isBrainNote(n, brainFolder)
                return (
                  <li key={n.id} className="work-context-related" onClick={() => selectNote(n.id)}>
                    {brain
                      ? <BrainIcon size={13} title={t('brain.noteLabel')} />
                      : <span className="work-context-related-icon">📄</span>}
                    <span className="work-context-related-title">{brain ? brainNoteLabel(n) : n.title}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {redAnno.length > 0 && (
          <div className="work-context-section">
            <div className="work-context-section-label">
              <span className="work-context-anno-dot" />
              {t('workContext.redAnnotations')}
              <span className="work-context-count">{redAnno.length}</span>
            </div>
            <ul className="work-context-list">
              {redAnno.slice(0, 6).map(a => (
                <li key={a.id} className="work-context-anno">
                  {a.page != null && <span className="work-context-page">S. {a.page}</span>}
                  <span className="work-context-quote">{shortQuote(a.quote)}</span>
                </li>
              ))}
              {redAnno.length > 6 && (
                <li className="work-context-more">
                  +{redAnno.length - 6} {t('workContext.more')}
                </li>
              )}
            </ul>
          </div>
        )}

        {openTasks.length > 0 && (
          <div className="work-context-section">
            <div className="work-context-section-label">
              {t('workContext.openTasks')}
              <span className="work-context-count">{openTasks.length}</span>
            </div>
            <ul className="work-context-list">
              {openTasks.slice(0, 6).map((task, i) => (
                <li key={i} className={`work-context-task ${task.isCritical ? 'critical' : ''} ${task.isOverdue ? 'overdue' : ''}`}>
                  <span className="work-context-task-box">☐</span>
                  <span className="work-context-task-text">{task.text}</span>
                  {task.isCritical && <span className="work-context-urgent">{t('workContext.urgent')}</span>}
                </li>
              ))}
              {openTasks.length > 6 && (
                <li className="work-context-more">
                  +{openTasks.length - 6} {t('workContext.more')}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
