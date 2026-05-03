import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useEmailStore } from '../../stores/emailStore'
import { useAgentStore } from '../../stores/agentStore'
import { useTranslation } from '../../utils/translations'
import {
  buildDashboardSnapshot,
  formatRelativeDay,
  collectFocusTasks,
  findNextFreeSlot,
  type DashboardSnapshot,
  type EmailActionItem,
  type BookingItem,
  type CalendarItem,
  type DashboardTask,
  type FocusTask
} from '../../utils/dashboardData'
import type { DashboardWidgetId } from '../../stores/uiStore'
import type { TranslationKey } from '../../utils/translations'
import type { Note } from '../../../shared/types'
import {
  getNoteKind,
  getNoteKindFromContent,
  getNoteKindFromTitleStrict,
  stripNoteKindMarker,
  getNoteStatus,
  getNoteRelevance,
  setNoteRelevanceInContent,
  markProblemSolvedInContent,
  addSolvedForBacklinkInContent,
  completeOpenTasksInContent
} from '../../utils/noteKind'
import './DashboardView.css'

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string

type RadarFeedbackValue = 'positive' | 'negative'
type RadarFeedback = Record<string, RadarFeedbackValue>

const SLEEPING_THRESHOLD_DAYS = 14
const RADAR_HISTORY_RETAIN_DAYS = 7

// The radar widget can be mounted/unmounted quickly when the user switches views.
// Keep the expensive Ollama relevance worker singleton at module level so a new
// widget instance does not start a second batch while the previous one is still running.
let radarAiWorkerRunning = false

const getRadarFeedbackKey = (vaultPath: string | null): string => `mindgraph:radar-feedback:${vaultPath || 'default'}`

const getRadarFeedbackId = (sourceId: string, targetId: string, role: 'solution' | 'context'): string =>
  `${sourceId}::${role}::${targetId}`

const getRadarHistoryKey = (vaultPath: string | null): string => `mindgraph:radar-history:${vaultPath || 'default'}`

const getRadarUiKey = (vaultPath: string | null): string => `mindgraph:radar-ui:${vaultPath || 'default'}`

interface RadarHistoryEntry {
  date: string  // YYYY-MM-DD
  scores: Record<string, number>
}

const todayKey = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const loadRadarHistory = (vaultPath: string | null): RadarHistoryEntry[] => {
  try {
    const raw = localStorage.getItem(getRadarHistoryKey(vaultPath))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.date === 'string' && e.scores) : []
  } catch {
    return []
  }
}

const persistRadarSnapshot = (vaultPath: string | null, scores: Record<string, number>): void => {
  const history = loadRadarHistory(vaultPath)
  const today = todayKey()
  const filtered = history.filter(e => e.date !== today)
  filtered.push({ date: today, scores })
  // Nur die letzten N Tage behalten
  filtered.sort((a, b) => a.date.localeCompare(b.date))
  const trimmed = filtered.slice(-RADAR_HISTORY_RETAIN_DAYS)
  try {
    localStorage.setItem(getRadarHistoryKey(vaultPath), JSON.stringify(trimmed))
  } catch {
    // localStorage voll oder gesperrt — kein kritisches Problem
  }
}

const getPreviousScores = (history: RadarHistoryEntry[]): Record<string, number> | null => {
  const today = todayKey()
  const older = history.filter(e => e.date !== today).sort((a, b) => b.date.localeCompare(a.date))
  return older.length > 0 ? older[0].scores : null
}

interface DashboardViewProps {
  onOpenInbox?: () => void
  onOpenAgent?: () => void
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenInbox, onOpenAgent }) => {
  const { t } = useTranslation()
  const { notes, vaultPath, selectNote } = useNotesStore()
  const { taskExcludedFolders, dashboard } = useUIStore()
  const emails = useEmailStore(state => state.emails)
  const loadDashboardOffers = useAgentStore(state => state.loadDashboard)

  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [radarFeedback, setRadarFeedback] = useState<RadarFeedback>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getRadarFeedbackKey(vaultPath))
      setRadarFeedback(raw ? JSON.parse(raw) : {})
    } catch {
      setRadarFeedback({})
    }
  }, [vaultPath])

  // Refs für robustes Reload-Verhalten:
  // - isInitialLoadRef: setIsLoading(true) nur beim ersten Load, sonst silent reload
  // - loadDebounceTimer: viele schnelle updateNote-Calls (KI-Worker) lösen sonst pro Notiz einen Full-Reload
  //   aus → Dashboard flackert permanent. Debounce sammelt Updates auf 800ms.
  const isInitialLoadRef = useRef(true)
  const loadDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSnapshot = useCallback(async () => {
    if (isInitialLoadRef.current) setIsLoading(true)
    await loadDashboardOffers({ includeBookings: true })
    const latestOffers = useAgentStore.getState().dashboardOffers
    const snap = await buildDashboardSnapshot({
      notes,
      vaultPath,
      excludedFolders: taskExcludedFolders,
      emails,
      dashboardOffers: latestOffers,
      bookingsSinceIso: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      calendarDaysAhead: dashboard.calendarDaysAhead,
      includeCalendar: true
    })
    setSnapshot(snap)
    if (isInitialLoadRef.current) {
      setIsLoading(false)
      isInitialLoadRef.current = false
    }
  }, [notes, vaultPath, taskExcludedFolders, emails, loadDashboardOffers, dashboard.calendarDaysAhead])

  useEffect(() => {
    // Initial: sofort laden. Re-Triggers (z.B. durch updateNote vom KI-Worker): 800ms debounce.
    if (loadDebounceTimer.current) clearTimeout(loadDebounceTimer.current)
    if (isInitialLoadRef.current) {
      loadSnapshot()
    } else {
      loadDebounceTimer.current = setTimeout(() => loadSnapshot(), 800)
    }
    return () => {
      if (loadDebounceTimer.current) clearTimeout(loadDebounceTimer.current)
    }
  }, [loadSnapshot])

  const handleTaskClick = (task: DashboardTask) => selectNote(task.noteId)

  const handleEmailClick = (item: EmailActionItem) => {
    if (onOpenInbox) {
      onOpenInbox()
      return
    }
    if (item.email.notePath) {
      const note = notes.find(n => n.path === item.email.notePath)
      if (note) selectNote(note.id)
    }
  }

  const handleBookingClick = (_item: BookingItem) => {
    if (onOpenAgent) onOpenAgent()
  }

  const markReplyHandled = useEmailStore(state => state.markReplyHandled)
  const handleEmailHandled = useCallback((item: EmailActionItem) => {
    if (!vaultPath) return
    markReplyHandled(vaultPath, item.email.id, true)
    loadSnapshot()
  }, [vaultPath, markReplyHandled, loadSnapshot])

  const renderWidget = (id: DashboardWidgetId) => {
    if (!snapshot) return null
    switch (id) {
      case 'focus':
        return <FocusWidget key={id} snapshot={snapshot} onTaskClick={handleTaskClick} onRefresh={loadSnapshot} t={t} />
      case 'radar':
        return (
          <RadarWidget
            key={id}
            snapshot={snapshot}
            notes={notes}
            vaultPath={vaultPath}
            onNoteClick={selectNote}
            onProblemSolved={loadSnapshot}
            t={t}
            feedback={radarFeedback}
            onFeedback={(sourceId, targetId, role, value) => {
              setRadarFeedback(current => {
                const next = { ...current, [getRadarFeedbackId(sourceId, targetId, role)]: value }
                localStorage.setItem(getRadarFeedbackKey(vaultPath), JSON.stringify(next))
                return next
              })
            }}
          />
        )
      case 'tasks':
        return <TasksWidget key={id} snapshot={snapshot} onTaskClick={handleTaskClick} t={t} />
      case 'emails':
        return <EmailsWidget key={id} snapshot={snapshot} onEmailClick={handleEmailClick} onEmailHandled={handleEmailHandled} t={t} />
      case 'calendar':
        return <CalendarWidget key={id} snapshot={snapshot} t={t} onRefresh={loadSnapshot} />
      case 'bookings':
        return <BookingsWidget key={id} snapshot={snapshot} onBookingClick={handleBookingClick} t={t} />
      case 'sync':
        return null
    }
  }

  const today = new Date()
  const dateStr = today.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="dashboard-view">
      <header className="dashboard-view-header">
        <div>
          <h1 className="dashboard-view-title">{t('dashboard.title')}</h1>
          <p className="dashboard-view-date">{dateStr}</p>
        </div>
        <button className="dashboard-view-refresh" onClick={loadSnapshot} title={t('dashboard.refresh')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </header>

      <div className="dashboard-view-content">
        {isLoading || !snapshot ? (
          <div className="dashboard-view-loading">
            <div className="dashboard-view-spinner"/>
            <p>{t('dashboard.loading')}</p>
          </div>
        ) : dashboard.widgets.length === 0 ? (
          <div className="dashboard-view-empty">
            <p>{t('dashboard.noWidgets')}</p>
          </div>
        ) : (
          <div className="dashboard-view-grid">
            {dashboard.widgets.map(id => renderWidget(id))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Widgets ────────────────────────────────────────────────────────────────

interface WidgetProps {
  snapshot: DashboardSnapshot
  t: TFn
  onTaskClick?: (task: DashboardTask) => void
  onEmailClick?: (item: EmailActionItem) => void
  onEmailHandled?: (item: EmailActionItem) => void
  onBookingClick?: (item: BookingItem) => void
}

interface RadarItem {
  note: Note
  score: number
  triggers: string[]
  solution?: RadarConnection
  context?: RadarConnection
  delta: number | null   // null = neu im Radar oder keine History
  isNew: boolean
  aiScore?: number       // 0-100 von Ollama (Stufe 2)
  aiReason?: string      // 1-Satz-Begründung von Ollama
  aiCheckedAt?: string   // ISO-Timestamp der KI-Analyse
}

interface SleepingItem {
  note: Note
  daysSilent: number
}

interface RadarSnapshot {
  active: RadarItem[]
  sleeping: SleepingItem[]
  solvedThisWeek: number
}

interface RadarConnection {
  note: Note
  score: number
  label: string
  role: 'solution' | 'context'
  feedback?: RadarFeedbackValue
}

const getCleanNoteTitle = (note: Note): string => stripNoteKindMarker(note.title).trim() || note.title

const RADAR_STOP_WORDS = new Set([
  'infos', 'info', 'termine', 'termin', 'login', 'zugang', 'zugänge', 'daten',
  'mail', 'mails', 'email', 'emails', 'team', 'update', 'projekt', 'notiz',
  'notes', 'frage', 'fragen', 'angebot', 'angebote', 'jahren', 'woche',
  'what', 'long', 'goal', 'tech'
])

const tokenizeRadarText = (text: string): string[] => text
  .toLowerCase()
  .replace(/\d{8,14}/g, ' ')
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .split(/\s+/)
  .map(word => word.trim().replace(/^-+|-+$/g, ''))
  .filter(word => word.length >= 4 && !RADAR_STOP_WORDS.has(word))

const getRadarKeywords = (note: Note): string[] => {
  const base = tokenizeRadarText(`${note.title} ${note.path} ${note.content.slice(0, 1600)}`)
  return Array.from(new Set(base)).slice(0, 8)
}

const scoreNoteConnection = (source: Note, target: Note, sourceKeywords: string[]): number => {
  const haystack = `${target.title} ${target.path} ${target.content.slice(0, 2200)}`.toLowerCase()
  const keywordHits = sourceKeywords.filter(keyword => haystack.includes(keyword)).length
  const targetTitleTokens = new Set(tokenizeRadarText(getCleanNoteTitle(target)))
  const sourceTitleTokens = tokenizeRadarText(getCleanNoteTitle(source))
  const titleHits = sourceTitleTokens.filter(token => targetTitleTokens.has(token)).length
  let score = keywordHits / Math.max(1, sourceKeywords.length)

  if (keywordHits < 2 && titleHits === 0) score *= 0.25
  if (titleHits > 0) score += Math.min(0.35, titleHits * 0.18)

  if (source.outgoingLinks.includes(target.id) || source.outgoingLinks.includes(target.path) || source.outgoingLinks.includes(target.title)) score += 0.35
  if (source.incomingLinks.includes(target.id)) score += 0.25

  const sourceFolder = source.path.split('/').slice(0, -1).join('/')
  const targetFolder = target.path.split('/').slice(0, -1).join('/')
  if (sourceFolder && sourceFolder === targetFolder) score += 0.12

  return Math.min(1, score)
}

const findRadarConnection = (
  source: Note,
  notes: Note[],
  kindId: 'solution' | 'info',
  label: string,
  sourceKeywords: string[],
  feedback: RadarFeedback
): RadarConnection | undefined => {
  const role: 'solution' | 'context' = kindId === 'solution' ? 'solution' : 'context'
  return notes
    .filter(candidate => candidate.id !== source.id && getNoteKind(candidate)?.id === kindId)
    .map(candidate => {
      const feedbackValue = feedback[getRadarFeedbackId(source.id, candidate.id, role)]
      const baseScore = scoreNoteConnection(source, candidate, sourceKeywords)
      const adjustedScore = feedbackValue === 'positive'
        ? Math.max(baseScore, 0.92)
        : feedbackValue === 'negative'
          ? Math.min(baseScore, 0.02)
          : baseScore
      return {
        note: candidate,
        score: adjustedScore,
        label,
        role,
        feedback: feedbackValue
      }
    })
    .filter(connection => connection.feedback === 'positive' || connection.score >= 0.32)
    .sort((a, b) => b.score - a.score)[0]
}

const textMatchesNote = (text: string, keywords: string[]) => {
  const haystack = text.toLowerCase()
  return keywords.some(keyword => haystack.includes(keyword))
}

const collectRadarSnapshot = (
  notes: Note[],
  snapshot: DashboardSnapshot,
  t: TFn,
  feedback: RadarFeedback,
  previousScores: Record<string, number> | null
): RadarSnapshot => {
  const notesById = new Map(notes.map(note => [note.id, note]))
  const tasksByNote = new Map<string, { overdue: number; today: number; upcoming: number; critical: number }>()

  const addTask = (task: DashboardTask, bucket: 'overdue' | 'today' | 'upcoming') => {
    const current = tasksByNote.get(task.noteId) || { overdue: 0, today: 0, upcoming: 0, critical: 0 }
    current[bucket]++
    if (task.isCritical) current.critical++
    tasksByNote.set(task.noteId, current)
  }
  snapshot.tasks.overdue.forEach(task => addTask(task, 'overdue'))
  snapshot.tasks.today.forEach(task => addTask(task, 'today'))
  snapshot.tasks.upcoming.forEach(task => addTask(task, 'upcoming'))

  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const sleepingThresholdMs = SLEEPING_THRESHOLD_DAYS * 24 * 60 * 60 * 1000

  // Alle Problem-Notizen mit Status.
  // Strikte Erkennung für den Radar: nur Frontmatter-`category:` ODER Titel der mit `🔴` BEGINNT.
  // Pfad-Fallback und Inline-Emoji-Match werden bewusst ausgeschlossen, damit Zettelkasten-Notizen
  // mit zufälligen Emojis im Inhalt/Pfad nicht im Radar landen.
  const problems = notes
    .filter(note => {
      const kind = getNoteKindFromContent(note.content) || getNoteKindFromTitleStrict(note.title)
      return kind?.id === 'problem'
    })
    .map(note => ({ note, status: getNoteStatus(note) }))

  // Solved-Counter (letzte 7 Tage)
  let solvedThisWeek = 0
  for (const { status } of problems) {
    if (status.status !== 'solved' || !status.solvedAt) continue
    const solvedAtMs = new Date(status.solvedAt).getTime()
    if (Number.isNaN(solvedAtMs)) continue
    if (solvedAtMs >= sevenDaysAgo) solvedThisWeek++
  }

  // Nur offene Probleme für aktive + schlafende Buckets
  const openProblems = problems.filter(({ status }) => status.status === 'open')

  const candidates = openProblems.map(({ note }) => {
    const triggers: string[] = []
    let score = 0
    let hasActionSignal = false
    const taskStats = tasksByNote.get(note.id)
    if (taskStats) {
      score += taskStats.overdue * 8 + taskStats.today * 5 + taskStats.upcoming * 2 + taskStats.critical * 4
      hasActionSignal = true
      if (taskStats.overdue > 0) triggers.push(t('dashboard.radar.trigger.overdue', { count: taskStats.overdue }))
      if (taskStats.today > 0) triggers.push(t('dashboard.radar.trigger.today', { count: taskStats.today }))
      if (taskStats.critical > 0) triggers.push(t('dashboard.radar.trigger.critical', { count: taskStats.critical }))
    }

    const semanticBacklinks = note.incomingLinks
      .map(id => notesById.get(id))
      .filter((source): source is Note => {
        const kind = getNoteKind(source)
        return kind?.id === 'solution' || kind?.id === 'info'
      }).length
    if (semanticBacklinks > 0) {
      score += semanticBacklinks * 2
      hasActionSignal = true
      triggers.push(t('dashboard.radar.trigger.backlinks', { count: semanticBacklinks }))
    }

    const keywords = getRadarKeywords(note)
    const solution = findRadarConnection(note, notes, 'solution', t('dashboard.radar.label.solution'), keywords, feedback)
    const context = findRadarConnection(note, notes, 'info', t('dashboard.radar.label.context'), keywords, feedback)
    const hasPositiveFeedback = solution?.feedback === 'positive' || context?.feedback === 'positive'

    const matchingEmails = snapshot.emails.filter(item => {
      const emailTime = new Date(item.email.date).getTime()
      if (Number.isNaN(emailTime) || emailTime < sevenDaysAgo) return false
      return textMatchesNote(`${item.email.subject} ${item.email.snippet} ${item.email.from.name}`, keywords)
    }).length
    if (matchingEmails > 0) {
      score += matchingEmails * 4
      hasActionSignal = true
      triggers.push(t('dashboard.radar.trigger.emails', { count: matchingEmails }))
    }

    const matchingEvents = snapshot.calendar.filter(item =>
      item.dayOffset >= 0 &&
      item.dayOffset <= 7 &&
      textMatchesNote(`${item.event.title} ${item.event.location || ''}`, keywords)
    ).length
    if (matchingEvents > 0) {
      score += matchingEvents * 5
      hasActionSignal = true
      triggers.push(t('dashboard.radar.trigger.calendar', { count: matchingEvents }))
    }

    const modifiedAt = new Date(note.modifiedAt).getTime()
    const hasOpenTasks = !!taskStats && (taskStats.overdue + taskStats.today + taskStats.upcoming) > 0
    if (hasOpenTasks && !Number.isNaN(modifiedAt) && now - modifiedAt > 7 * 24 * 60 * 60 * 1000) {
      score += 3
      triggers.push(t('dashboard.radar.trigger.stale'))
    }

    // Frische als Action-Signal: kürzlich erstellte/bearbeitete 🔴 sind aktuell, auch ohne Tasks/Mails
    const ageMs = Number.isNaN(modifiedAt) ? Infinity : now - modifiedAt
    if (ageMs < 3 * 24 * 60 * 60 * 1000) {
      score += 6
      hasActionSignal = true
      triggers.push(t('dashboard.radar.trigger.fresh'))
    } else if (ageMs < 7 * 24 * 60 * 60 * 1000) {
      score += 3
      hasActionSignal = true
      triggers.push(t('dashboard.radar.trigger.recent'))
    }

    // Datum-im-Titel-Heuristik: TT.MM erkennt implizite Termine wie "Fachforum 27.05"
    const dateMatch = note.title.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/)
    if (dateMatch) {
      const day = parseInt(dateMatch[1], 10)
      const month = parseInt(dateMatch[2], 10) - 1
      const yearRaw = dateMatch[3]
      const currentYear = new Date(now).getFullYear()
      const year = yearRaw
        ? (yearRaw.length === 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10))
        : currentYear
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        const titleDate = new Date(year, month, day).getTime()
        const daysAhead = Math.round((titleDate - now) / (24 * 60 * 60 * 1000))
        if (daysAhead >= 0 && daysAhead <= 30) {
          const boost = daysAhead <= 7 ? 6 : daysAhead <= 14 ? 3 : 1
          score += boost
          hasActionSignal = true
          triggers.push(t('dashboard.radar.trigger.titleDate', {
            date: `${String(day).padStart(2, '0')}.${String(month + 1).padStart(2, '0')}.`
          }))
        }
      }
    }

    // Smart-Pairing zählt nur als Score-Booster, nicht als eigenständiger Relevanz-Trigger.
    // Wird bewusst NACH allen anderen Signal-Quellen ausgewertet, damit hasActionSignal final ist.
    const inScope = hasActionSignal || hasPositiveFeedback
    if (inScope && solution) score += Math.round(solution.score * 5)
    if (inScope && context) score += Math.round(context.score * 3)

    // KI-Relevanz aus Frontmatter (Stufe 2): wenn Ollama die Notiz analysiert hat,
    // nutze den KI-Score als Primär-Wert. Heuristik bleibt als Floor (max(ki, heuristik)).
    // Wichtig: hoher KI-Score (>=40) zählt selbst als Action-Signal — so können auch Notizen
    // ohne Tasks/Mails/Termine in den Radar, wenn die KI sie als aktuell einstuft.
    const ai = getNoteRelevance(note)
    const aiScore = typeof ai.score === 'number' ? ai.score : undefined
    const heuristicScore = inScope ? score : 0
    const hasMeaningfulAi = aiScore !== undefined && aiScore >= 40
    const finalScore = aiScore !== undefined
      ? Math.max(aiScore, heuristicScore)
      : heuristicScore

    const previousScore = previousScores ? previousScores[note.id] : undefined
    const delta = previousScore === undefined ? null : finalScore - previousScore
    const isNew = previousScores !== null && previousScore === undefined && finalScore > 0

    return {
      note,
      score: finalScore,
      triggers,
      solution,
      context,
      delta,
      isNew,
      aiScore,
      aiReason: ai.reason,
      aiCheckedAt: ai.checkedAt,
      hasOpenTasks: !!taskStats && (taskStats.overdue + taskStats.today + taskStats.upcoming) > 0,
      modifiedAt,
      hasMeaningfulAi
    }
  })

  const active: RadarItem[] = candidates
    .filter(item => item.score > 0 || item.hasMeaningfulAi)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ note, score, triggers, solution, context, delta, isNew, aiScore, aiReason, aiCheckedAt }) =>
      ({ note, score, triggers, solution, context, delta, isNew, aiScore, aiReason, aiCheckedAt })
    )

  const activeIds = new Set(active.map(item => item.note.id))
  const sleeping: SleepingItem[] = candidates
    .filter(item => !activeIds.has(item.note.id) && item.score === 0)
    .filter(item => !item.hasOpenTasks)
    .filter(item => !Number.isNaN(item.modifiedAt) && now - item.modifiedAt > sleepingThresholdMs)
    .map(item => ({
      note: item.note,
      daysSilent: Math.floor((now - item.modifiedAt) / (24 * 60 * 60 * 1000))
    }))
    .sort((a, b) => b.daysSilent - a.daysSilent)

  return { active, sleeping, solvedThisWeek }
}

const formatTime = (d: Date | string) => {
  const date = typeof d === 'string' ? new Date(d.replace(' ', 'T')) : d
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

const formatDate = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

const formatBookedAt = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfBooking = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayDiff = Math.round((startOfToday.getTime() - startOfBooking.getTime()) / (24 * 60 * 60 * 1000))
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (dayDiff === 0) return `heute ${time}`
  if (dayDiff === 1) return `gestern ${time}`
  if (dayDiff > 1 && dayDiff < 7) return `vor ${dayDiff} Tagen`
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const TasksWidget: React.FC<WidgetProps> = ({ snapshot, onTaskClick, t }) => {
  const { overdue, today, upcoming } = snapshot.tasks
  const total = overdue.length + today.length + upcoming.length
  return (
    <section className="dv-widget dv-widget-tasks">
      <header className="dv-widget-header">
        <h3>{t('dashboard.widgets.tasks')}</h3>
        <span className="dv-widget-count">{total}</span>
      </header>
      <div className="dv-widget-body">
        {total === 0 ? (
          <div className="dv-widget-empty">{t('dashboard.tasksEmpty')}</div>
        ) : (
          <>
            {overdue.length > 0 && (
              <Group label={t('dashboard.overdue')} tone="overdue">
                {overdue.slice(0, 6).map(task => (
                  <TaskRow key={`${task.noteId}-${task.line}`} task={task} onClick={() => onTaskClick?.(task)} showDate />
                ))}
              </Group>
            )}
            {today.length > 0 && (
              <Group label={t('dashboard.today')}>
                {today.slice(0, 8).map(task => (
                  <TaskRow key={`${task.noteId}-${task.line}`} task={task} onClick={() => onTaskClick?.(task)} />
                ))}
              </Group>
            )}
            {upcoming.length > 0 && (
              <Group label={t('dashboard.upcoming')}>
                {upcoming.slice(0, 6).map(task => (
                  <TaskRow key={`${task.noteId}-${task.line}`} task={task} onClick={() => onTaskClick?.(task)} showDate />
                ))}
              </Group>
            )}
          </>
        )}
      </div>
    </section>
  )
}

const Group: React.FC<{ label: string; tone?: 'overdue'; children: React.ReactNode }> = ({ label, tone, children }) => (
  <div className={`dv-group ${tone || ''}`}>
    <div className="dv-group-label">{label}</div>
    {children}
  </div>
)

const TaskRow: React.FC<{ task: DashboardTask; onClick: () => void; showDate?: boolean }> = ({ task, onClick, showDate }) => (
  <div className="dv-task-row" onClick={onClick}>
    <div className="dv-task-checkbox"/>
    <div className="dv-task-body">
      <div className="dv-task-text">{task.text}</div>
      <div className="dv-task-meta">
        <span>{task.noteTitle}</span>
        {task.dueDate && (
          <>
            <span className="sep">•</span>
            <span>{showDate ? formatDate(task.dueDate) : formatTime(task.dueDate)}</span>
          </>
        )}
      </div>
    </div>
    {task.isCritical && <span className="dv-task-critical">!</span>}
  </div>
)

const EmailsWidget: React.FC<WidgetProps> = ({ snapshot, onEmailClick, onEmailHandled, t }) => {
  const items = snapshot.emails
  return (
    <section className="dv-widget dv-widget-emails">
      <header className="dv-widget-header">
        <h3>{t('dashboard.widgets.emails')}</h3>
        <span className="dv-widget-count">{items.length}</span>
      </header>
      <div className="dv-widget-body">
        {items.length === 0 ? (
          <div className="dv-widget-empty">{t('dashboard.emailsEmpty')}</div>
        ) : (
          <div className="dv-list">
            {items.slice(0, 10).map(item => {
              const urgencyLabel = item.urgency === 'high'
                ? t('dashboard.urgency.high')
                : item.urgency === 'medium'
                  ? t('dashboard.urgency.medium')
                  : t('dashboard.urgency.low')
              return (
                <div key={item.email.id} className={`dv-email-row urgency-${item.urgency}`} onClick={() => onEmailClick?.(item)}>
                  <div className="dv-email-badge" title={urgencyLabel}/>
                  <div className="dv-email-body">
                    <div className="dv-email-from">{item.email.from.name || item.email.from.address}</div>
                    <div className="dv-email-subject">{item.email.subject}</div>
                  </div>
                  {onEmailHandled && (
                    <button
                      className="dv-email-done-btn"
                      onClick={e => { e.stopPropagation(); onEmailHandled(item) }}
                      data-tooltip={t('dashboard.emailHandled')}
                      aria-label={t('dashboard.emailHandled')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

interface RadarWidgetProps {
  snapshot: DashboardSnapshot
  notes: Note[]
  vaultPath: string | null
  onNoteClick: (id: string) => void
  onProblemSolved: () => void
  t: TFn
  feedback: RadarFeedback
  onFeedback: (sourceId: string, targetId: string, role: 'solution' | 'context', value: RadarFeedbackValue) => void
}

const renderDelta = (delta: number | null, isNew: boolean): React.ReactNode => {
  if (isNew) return <span className="dv-radar-delta new" aria-label="neu im Radar">★</span>
  if (delta === null || delta === 0) return <span className="dv-radar-delta neutral" aria-hidden="true">·</span>
  if (delta > 0) return <span className="dv-radar-delta up" aria-label={`${delta} mehr Druck als gestern`}>▴ {delta}</span>
  return <span className="dv-radar-delta down" aria-label={`${Math.abs(delta)} weniger Druck als gestern`}>▾ {Math.abs(delta)}</span>
}

const RadarWidget: React.FC<RadarWidgetProps> = ({ snapshot, notes, vaultPath, onNoteClick, onProblemSolved, t, feedback, onFeedback }) => {
  const updateNote = useNotesStore(state => state.updateNote)
  const radarHistory = React.useMemo(() => loadRadarHistory(vaultPath), [vaultPath])
  const previousScores = React.useMemo(() => getPreviousScores(radarHistory), [radarHistory])
  const radarSnapshot = React.useMemo(
    () => collectRadarSnapshot(notes, snapshot, t, feedback, previousScores),
    [notes, snapshot, t, feedback, previousScores]
  )

  // Heutigen Snapshot persistieren (max 1× pro Tag — die Funktion dedupliziert intern)
  useEffect(() => {
    if (!vaultPath) return
    const todaysScores: Record<string, number> = {}
    radarSnapshot.active.forEach(item => { todaysScores[item.note.id] = item.score })
    if (Object.keys(todaysScores).length > 0) {
      persistRadarSnapshot(vaultPath, todaysScores)
    }
  }, [vaultPath, radarSnapshot])

  const [correction, setCorrection] = useState<{ sourceId: string; role: 'solution' | 'context'; currentTargetId?: string; query: string } | null>(null)
  const [solveDialog, setSolveDialog] = useState<{ item: RadarItem; connection: RadarConnection } | null>(null)
  const [sleepingOpen, setSleepingOpen] = useState<boolean>(() => {
    try {
      const ui = localStorage.getItem(getRadarUiKey(vaultPath))
      return ui ? JSON.parse(ui)?.sleepingOpen === true : false
    } catch { return false }
  })

  const toggleSleeping = () => {
    setSleepingOpen(prev => {
      const next = !prev
      try { localStorage.setItem(getRadarUiKey(vaultPath), JSON.stringify({ sleepingOpen: next })) } catch {/* */}
      return next
    })
  }

  // ─── KI-Relevanz Auto-Analyse (Stufe 2) ────────────────────────────────────
  // Selektive Subscriptions mit useShallow, damit der Effect nur bei tatsächlichen Setting-Änderungen re-triggert.
  // Vorher: state.dashboard als ganzes Objekt → bei jedem dashboard-Field-Update neue Ref → Effect läuft mehrfach parallel.
  const { radarAiEnabled, radarAiModel, radarAiRefreshIntervalHours } = useUIStore(useShallow(s => ({
    radarAiEnabled: s.dashboard.radarAiEnabled,
    radarAiModel: s.dashboard.radarAiModel,
    radarAiRefreshIntervalHours: s.dashboard.radarAiRefreshIntervalHours
  })))
  const { ollamaEnabled, ollamaSelectedModel } = useUIStore(useShallow(s => ({
    ollamaEnabled: s.ollama.enabled,
    ollamaSelectedModel: s.ollama.selectedModel
  })))
  const aiModel = radarAiModel || ollamaSelectedModel
  const aiEnabled = !!(radarAiEnabled && ollamaEnabled && aiModel)

  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set())
  const [forceRefreshTick, setForceRefreshTick] = useState(0)

  // Refs für aktuellste Werte ohne Effect-Re-Trigger
  const notesRef = useRef(notes)
  notesRef.current = notes
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  const consumedForceRefreshTickRef = useRef(0)

  useEffect(() => {
    if (!aiEnabled || !vaultPath) {
      console.log('[Radar] AI worker idle:', { aiEnabled, hasVault: !!vaultPath, model: aiModel, ollamaEnabled })
      return
    }
    if (radarAiWorkerRunning) {
      console.log('[Radar] AI worker already running, skipping re-trigger')
      return
    }

    let canUpdateLocalState = true
    const refreshMs = radarAiRefreshIntervalHours * 60 * 60 * 1000
    const now = Date.now()
    const forceRefresh = forceRefreshTick !== consumedForceRefreshTickRef.current

    // Re-Analyze-Bedingungen (vereinfacht & robust):
    // 1. Notiz hat kein relevanceCheckedAt im Frontmatter → noch nie analysiert
    // 2. relevanceCheckedAt älter als refreshIntervalHours (Default 6h) → Cache abgelaufen
    // 3. forceRefreshTick gesetzt → User hat manuellen Refresh-Button geklickt
    //
    // Modified-At-basiertes Re-Trigger absichtlich NICHT mehr drin: jeder Disk-Write des Workers
    // bzw. jedes Watcher-Echo bzw. jeder Sync-Push erzeugt frisches modifiedAt — das hat in
    // mehreren Hotfix-Iterationen zu Self-Trigger-Loops und Render-Crashes beim Tab-Wechsel
    // geführt. User-Edits werden nun verlässlich nach Cache-Expiry (6h) oder via Refresh-Button
    // analysiert; bei sofortigem Bedarf einfach den Refresh klicken.
    const candidates = notesRef.current.filter(note => {
      const kind = getNoteKindFromContent(note.content) || getNoteKindFromTitleStrict(note.title)
      if (kind?.id !== 'problem') return false
      if (getNoteStatus(note).status !== 'open') return false
      if (forceRefresh) return true
      const ai = getNoteRelevance(note)
      if (!ai.checkedAt) return true
      const checkedAtMs = new Date(ai.checkedAt).getTime()
      if (Number.isNaN(checkedAtMs)) return true
      if (now - checkedAtMs > refreshMs) return true
      return false
    })

    console.log(`[Radar] AI worker: ${candidates.length} candidates, model=${aiModel}, refreshIntervalH=${radarAiRefreshIntervalHours}, force=${forceRefresh}`)
    if (forceRefresh) consumedForceRefreshTickRef.current = forceRefreshTick
    if (candidates.length === 0) return

    const todayIso = new Date().toISOString().split('T')[0]
    const calendar = snapshotRef.current.calendar.slice(0, 8).map(c => ({
      title: c.event.title,
      startIso: typeof c.event.startDate === 'string' ? c.event.startDate : new Date(c.event.startDate).toISOString(),
      daysAhead: c.dayOffset,
      location: c.event.location
    }))
    const emails = snapshotRef.current.emails.slice(0, 6).map(e => ({
      from: e.email.from.name || e.email.from.address,
      subject: e.email.subject,
      snippet: e.email.snippet,
      date: e.email.date
    }))
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000
    const recentNoteTitles = notesRef.current
      .filter(n => {
        const m = new Date(n.modifiedAt).getTime()
        return !Number.isNaN(m) && m > fourteenDaysAgo
      })
      .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
      .slice(0, 8)
      .map(n => stripNoteKindMarker(n.title))

    const candidateIds = candidates.map(c => c.id)
    setAnalyzingIds(prev => {
      const next = new Set(prev)
      candidateIds.forEach(id => next.add(id))
      return next
    })

    radarAiWorkerRunning = true
    const runBatch = async () => {
      // Reduzierte Parallelität: 2 statt 3, damit Ollama nicht überlastet
      const batchSize = 2
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize)
        await Promise.all(batch.map(async (note) => {
          try {
            const result = await window.electronAPI.noteAnalyzeRelevance({
              vaultPath,
              noteRelativePath: note.path,
              model: aiModel,
              context: { todayIso, calendar, emails, recentNoteTitles }
            })
            if (!result.success) {
              console.warn('[Radar] AI analyze failed for', note.path, result.error)
              return
            }
            console.log(`[Radar] AI analyzed "${note.title}" → score=${result.score}, reason="${result.reason}"`)
            const fullPath = `${vaultPath}/${note.path}`
            const currentContent = note.content || await window.electronAPI.readFile(fullPath)
            const nextContent = setNoteRelevanceInContent(currentContent, {
              score: result.score,
              reason: result.reason,
              isoDate: result.checkedAt,
              model: result.model
            })
            await window.electronAPI.writeFile(fullPath, nextContent)
            // modifiedAt explizit auf checkedAt setzen (statt new Date()), damit das Worker-Update
            // selbst keine modifiedAt > checkedAt-Differenz erzeugt. Watcher kann später drüber
            // schreiben, aber dafür gibt es die 5-Minuten-Toleranz im Filter.
            updateNote(note.id, { content: nextContent, modifiedAt: new Date(result.checkedAt) })
          } catch (err) {
            console.error('[Radar] AI analyze threw for', note.path, err)
          } finally {
            if (canUpdateLocalState) {
              setAnalyzingIds(prev => {
                const next = new Set(prev)
                next.delete(note.id)
                return next
              })
            }
          }
        }))
      }
    }
    runBatch().finally(() => {
      radarAiWorkerRunning = false
      console.log('[Radar] AI worker batch finished')
    })

    return () => {
      canUpdateLocalState = false
      // The batch intentionally keeps running after unmount. A quick dashboard re-open should
      // reuse the singleton lock instead of aborting and starting another Ollama batch.
    }
  }, [vaultPath, aiEnabled, aiModel, forceRefreshTick, radarAiRefreshIntervalHours, updateNote])

  const correctionCandidates = React.useMemo(() => {
    if (!correction) return []
    const wantedKind = correction.role === 'solution' ? 'solution' : 'info'
    const query = correction.query.trim().toLowerCase()
    return notes
      .filter(note => note.id !== correction.sourceId && getNoteKind(note)?.id === wantedKind)
      .filter(note => {
        if (!query) return true
        const haystack = `${getCleanNoteTitle(note)} ${note.path}`.toLowerCase()
        return query.split(/\s+/).every(part => haystack.includes(part))
      })
      .slice(0, 7)
  }, [correction, notes])

  const renderConnection = (item: RadarItem, connection: RadarConnection) => (
    <span className={`dv-radar-connection ${connection.role} ${connection.feedback || ''}`}>
      <span className="dv-radar-connection-text">
        {connection.label}: {getCleanNoteTitle(connection.note)}
      </span>
      <span className="dv-radar-feedback" onClick={event => event.stopPropagation()}>
        <button
          type="button"
          className={connection.feedback === 'positive' ? 'active' : ''}
          aria-label={t('dashboard.radar.feedback.fits')}
          title={t('dashboard.radar.feedback.fits')}
          onClick={() => onFeedback(item.note.id, connection.note.id, connection.role, 'positive')}
        >
          ✓
        </button>
        <button
          type="button"
          className={connection.feedback === 'negative' ? 'active' : ''}
          aria-label={t('dashboard.radar.feedback.notFits')}
          title={t('dashboard.radar.feedback.notFits')}
          onClick={() => onFeedback(item.note.id, connection.note.id, connection.role, 'negative')}
        >
          ×
        </button>
        <button
          type="button"
          aria-label={t('dashboard.radar.feedback.better')}
          title={t('dashboard.radar.feedback.better')}
          onClick={() => setCorrection({
            sourceId: item.note.id,
            role: connection.role,
            currentTargetId: connection.note.id,
            query: ''
          })}
        >
          …
        </button>
        {connection.role === 'solution' && (
          <button
            type="button"
            className="solve-btn"
            aria-label={t('dashboard.radar.solveAria')}
            title={t('dashboard.radar.solve')}
            onClick={() => setSolveDialog({ item, connection })}
          >
            ✓✓
          </button>
        )}
      </span>
    </span>
  )

  const handleConfirmSolve = useCallback(async (
    item: RadarItem,
    connection: RadarConnection,
    options: { addBacklink: boolean; closeTasks: boolean }
  ) => {
    if (!vaultPath) return
    const isoDate = new Date().toISOString().slice(0, 10)
    const problemFullPath = `${vaultPath}/${item.note.path}`
    const solutionFullPath = `${vaultPath}/${connection.note.path}`
    const solutionTitle = getCleanNoteTitle(connection.note)
    const problemTitle = getCleanNoteTitle(item.note)

    try {
      // Problem-Notiz: status=solved + tasks (optional)
      let problemContent = item.note.content || await window.electronAPI.readFile(problemFullPath)
      let completedCount = 0
      if (options.closeTasks) {
        const result = completeOpenTasksInContent(problemContent)
        problemContent = result.content
        completedCount = result.completedCount
      }
      problemContent = markProblemSolvedInContent(problemContent, solutionTitle, isoDate)
      await window.electronAPI.writeFile(problemFullPath, problemContent)
      updateNote(item.note.id, { content: problemContent, modifiedAt: new Date() })

      // Solution-Notiz: solvedFor-Backlink (optional)
      if (options.addBacklink) {
        const solutionContent = connection.note.content || await window.electronAPI.readFile(solutionFullPath)
        const nextSolutionContent = addSolvedForBacklinkInContent(solutionContent, problemTitle)
        if (nextSolutionContent !== solutionContent) {
          await window.electronAPI.writeFile(solutionFullPath, nextSolutionContent)
          updateNote(connection.note.id, { content: nextSolutionContent, modifiedAt: new Date() })
        }
      }

      console.log(`[Radar] solved "${problemTitle}" via "${solutionTitle}", closed ${completedCount} tasks`)
      setSolveDialog(null)
      onProblemSolved()
    } catch (error) {
      console.error('[Radar] markProblemSolved failed:', error)
    }
  }, [vaultPath, updateNote, onProblemSolved])

  return (
    <section className="dv-widget dv-widget-radar">
      <header className="dv-widget-header">
        <h3>{t('dashboard.widgets.radar')}</h3>
        {aiEnabled && (
          <button
            type="button"
            className="dv-radar-ai-refresh"
            onClick={() => setForceRefreshTick(prev => prev + 1)}
            disabled={analyzingIds.size > 0}
            data-tooltip={analyzingIds.size > 0 ? t('dashboard.radar.aiRunning', { count: analyzingIds.size }) : t('dashboard.radar.aiRefresh')}
            aria-label={t('dashboard.radar.aiRefresh')}
          >
            {analyzingIds.size > 0 ? (
              <span className="dv-radar-ai-refresh-spinner" />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            )}
          </button>
        )}
        <span className="dv-widget-count">{radarSnapshot.active.length}</span>
      </header>
      <div className="dv-widget-body">
        {radarSnapshot.active.length === 0 && radarSnapshot.sleeping.length === 0 ? (
          <div className="dv-widget-empty">{t('dashboard.radar.empty')}</div>
        ) : (
          <div className="dv-list">
            {radarSnapshot.active.map(item => (
              <div
                key={item.note.id}
                className={`dv-radar-row ${item.aiReason ? 'with-ai' : ''} ${analyzingIds.has(item.note.id) ? 'analyzing' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onNoteClick(item.note.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNoteClick(item.note.id) } }}
              >
                <span className="dv-radar-score">{item.score}</span>
                {renderDelta(item.delta, item.isNew)}
                <span className="dv-radar-body">
                  <span className="dv-radar-title">{getCleanNoteTitle(item.note)}</span>
                  {item.aiReason ? (
                    <span className="dv-radar-ai-reason" title={item.aiCheckedAt ? `KI-Analyse: ${new Date(item.aiCheckedAt).toLocaleString('de-DE')}` : undefined}>
                      <span className="dv-radar-ai-badge">KI</span>
                      {item.aiReason}
                    </span>
                  ) : (
                    <span className="dv-radar-triggers">
                      {item.triggers.slice(0, 2).join(' · ')}
                    </span>
                  )}
                  {(item.solution || item.context) && (
                    <span className="dv-radar-connections">
                      {item.solution && renderConnection(item, item.solution)}
                      {item.context && renderConnection(item, item.context)}
                    </span>
                  )}
                  {correction?.sourceId === item.note.id && (
                    <span className="dv-radar-correction" onClick={event => event.stopPropagation()}>
                      <input
                        value={correction.query}
                        onChange={event => setCorrection({ ...correction, query: event.target.value })}
                        placeholder={correction.role === 'solution' ? t('dashboard.radar.searchSolution') : t('dashboard.radar.searchContext')}
                        autoFocus
                      />
                      <span className="dv-radar-correction-list">
                        {correctionCandidates.map(candidate => (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => {
                              if (correction.currentTargetId) {
                                onFeedback(item.note.id, correction.currentTargetId, correction.role, 'negative')
                              }
                              onFeedback(item.note.id, candidate.id, correction.role, 'positive')
                              setCorrection(null)
                            }}
                          >
                            {getCleanNoteTitle(candidate)}
                          </button>
                        ))}
                        {correctionCandidates.length === 0 && (
                          <span className="dv-radar-correction-empty">{t('dashboard.radar.noMatch')}</span>
                        )}
                      </span>
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {radarSnapshot.sleeping.length > 0 && (
          <div className={`dv-radar-sleeping ${sleepingOpen ? 'open' : ''}`}>
            <button type="button" className="dv-radar-sleeping-toggle" onClick={toggleSleeping}>
              <span className="dv-radar-sleeping-chevron">{sleepingOpen ? '▾' : '▸'}</span>
              <span>💤 {t('dashboard.radar.sleeping.title')} ({radarSnapshot.sleeping.length})</span>
            </button>
            {sleepingOpen && (
              <div className="dv-radar-sleeping-list">
                {radarSnapshot.sleeping.slice(0, 12).map(({ note, daysSilent }) => (
                  <button key={note.id} className="dv-radar-sleeping-row" onClick={() => onNoteClick(note.id)}>
                    <span className="dv-radar-sleeping-title">{getCleanNoteTitle(note)}</span>
                    <span className="dv-radar-sleeping-days">{t('dashboard.radar.sleeping.days', { count: daysSilent })}</span>
                  </button>
                ))}
                {radarSnapshot.sleeping.length > 12 && (
                  <div className="dv-radar-sleeping-more">{t('dashboard.radar.sleeping.more', { count: radarSnapshot.sleeping.length - 12 })}</div>
                )}
              </div>
            )}
          </div>
        )}

        {radarSnapshot.solvedThisWeek > 0 && (
          <div className="dv-radar-solved-footer">
            ✓ {t('dashboard.radar.solvedThisWeek', { count: radarSnapshot.solvedThisWeek })}
          </div>
        )}
      </div>
      {solveDialog && (
        <SolveProblemDialog
          item={solveDialog.item}
          connection={solveDialog.connection}
          onClose={() => setSolveDialog(null)}
          onConfirm={handleConfirmSolve}
          t={t}
        />
      )}
    </section>
  )
}

interface SolveProblemDialogProps {
  item: RadarItem
  connection: RadarConnection
  onClose: () => void
  onConfirm: (item: RadarItem, connection: RadarConnection, options: { addBacklink: boolean; closeTasks: boolean }) => void
  t: TFn
}

const SolveProblemDialog: React.FC<SolveProblemDialogProps> = ({ item, connection, onClose, onConfirm, t }) => {
  const [addBacklink, setAddBacklink] = useState(true)
  const [closeTasks, setCloseTasks] = useState(false)

  return (
    <div className="dv-modal-overlay" onClick={onClose}>
      <div className="dv-modal dv-modal-narrow" onClick={e => e.stopPropagation()}>
        <header className="dv-modal-header">
          <h3>{t('dashboard.radar.solveDialog.title')}</h3>
          <button className="dv-modal-close" onClick={onClose} aria-label="close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div className="dv-modal-body">
          <div className="dv-modal-task">{getCleanNoteTitle(item.note)}</div>
          <div className="dv-modal-task-note">
            {t('dashboard.radar.solveDialog.via')}: {getCleanNoteTitle(connection.note)}
          </div>

          <label className="dv-modal-checkbox">
            <input type="checkbox" checked={addBacklink} onChange={e => setAddBacklink(e.target.checked)} />
            <span>{t('dashboard.radar.solveDialog.backlink')}</span>
          </label>
          <label className="dv-modal-checkbox">
            <input type="checkbox" checked={closeTasks} onChange={e => setCloseTasks(e.target.checked)} />
            <span>{t('dashboard.radar.solveDialog.closeTasks')}</span>
          </label>
        </div>
        <footer className="dv-modal-footer">
          <button className="dv-modal-btn-secondary" onClick={onClose}>
            {t('dashboard.radar.solveDialog.cancel')}
          </button>
          <button className="dv-modal-btn-primary" onClick={() => onConfirm(item, connection, { addBacklink, closeTasks })}>
            {t('dashboard.radar.solveDialog.confirm')}
          </button>
        </footer>
      </div>
    </div>
  )
}

interface CalendarWidgetProps extends WidgetProps {
  onRefresh: () => void
}

const CalendarWidget: React.FC<CalendarWidgetProps> = ({ snapshot, t, onRefresh }) => {
  const events = snapshot.calendar
  const needsPermission = snapshot.calendarNeedsPermission
  const neverAsked = snapshot.calendarNeverAsked
  const [requesting, setRequesting] = useState(false)
  const [permissionMsg, setPermissionMsg] = useState<string | null>(null)

  const handleRequestAccess = async () => {
    setRequesting(true)
    setPermissionMsg(null)
    try {
      const res = await window.electronAPI.calendarRequestAccess()
      if (res.status === 'granted' || res.status === 'alreadyGranted') {
        onRefresh()
      } else if (res.status === 'deniedPersistent') {
        setPermissionMsg('Zugriff wurde früher verweigert. Bitte in Systemeinstellungen → Datenschutz & Sicherheit → Kalender aktivieren und App neu starten.')
      } else if (res.status === 'denied') {
        setPermissionMsg('Zugriff abgelehnt.')
      } else if (res.status === 'unsupported') {
        setPermissionMsg('Kalender-Integration ist nur unter macOS verfügbar.')
      } else {
        setPermissionMsg(res.error ?? 'Zugriff konnte nicht erteilt werden.')
      }
    } finally {
      setRequesting(false)
    }
  }

  return (
    <section className="dv-widget dv-widget-calendar">
      <header className="dv-widget-header">
        <h3>{t('dashboard.widgets.calendar')}</h3>
        <span className="dv-widget-count">{events.length}</span>
      </header>
      <div className="dv-widget-body">
        {needsPermission ? (
          <div className="dv-widget-empty" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <div>
              {neverAsked
                ? 'MindGraph braucht Zugriff auf deinen Kalender, um Termine hier anzuzeigen.'
                : 'Kalender-Zugriff wurde verweigert.'}
            </div>
            <button
              className="dv-button dv-button-primary"
              onClick={handleRequestAccess}
              disabled={requesting}
            >
              {requesting ? 'Warte auf macOS-Dialog …' : 'Zugriff erteilen'}
            </button>
            {permissionMsg && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{permissionMsg}</div>
            )}
          </div>
        ) : events.length === 0 ? (
          <div className="dv-widget-empty">{t('dashboard.calendarEmpty')}</div>
        ) : (
          <div className="dv-list">
            {events.slice(0, 12).map((item: CalendarItem, i) => (
              <div key={i} className="dv-calendar-row">
                <div className="dv-calendar-day">{formatRelativeDay(item.dayOffset, t)}</div>
                <div className="dv-calendar-body">
                  <div className="dv-calendar-title">{item.event.title}</div>
                  <div className="dv-calendar-meta">
                    <span>{item.event.allDay ? t('dashboard.allDay') : formatTime(item.event.startDate)}</span>
                    {item.event.location && <><span className="sep">•</span><span>{item.event.location}</span></>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Focus-Widget ───────────────────────────────────────────────────────────
interface FocusWidgetProps {
  snapshot: DashboardSnapshot
  t: TFn
  onTaskClick: (task: DashboardTask) => void
  onRefresh: () => void
}

const FocusWidget: React.FC<FocusWidgetProps> = ({ snapshot, t, onTaskClick, onRefresh }) => {
  const focusTasks = React.useMemo(() => collectFocusTasks(snapshot.tasks, 5), [snapshot.tasks])
  const [pendingBlock, setPendingBlock] = useState<FocusTask | null>(null)

  // Narrative-Zusammenfassung (statisch generiert)
  const overdueCount = snapshot.tasks.overdue.length
  const todayTasksCount = snapshot.tasks.today.length
  const todayEvents = snapshot.calendar.filter(c => c.dayOffset === 0).length
  const tomorrowEvents = snapshot.calendar.filter(c => c.dayOffset === 1).length
  const emailsOpen = snapshot.emails.length

  const parts: string[] = []
  if (overdueCount > 0) parts.push(t(overdueCount === 1 ? 'dashboard.focus.overdueOne' : 'dashboard.focus.overdueMany', { count: overdueCount }))
  if (todayTasksCount > 0) parts.push(t(todayTasksCount === 1 ? 'dashboard.focus.todayOne' : 'dashboard.focus.todayMany', { count: todayTasksCount }))
  if (emailsOpen > 0) parts.push(t(emailsOpen === 1 ? 'dashboard.focus.emailOne' : 'dashboard.focus.emailMany', { count: emailsOpen }))
  if (todayEvents > 0) parts.push(t(todayEvents === 1 ? 'dashboard.focus.eventOne' : 'dashboard.focus.eventMany', { count: todayEvents }))
  else if (tomorrowEvents > 0) parts.push(t(tomorrowEvents === 1 ? 'dashboard.focus.tomorrowEventOne' : 'dashboard.focus.tomorrowEventMany', { count: tomorrowEvents }))

  const narrative = parts.length > 0
    ? parts.join(', ') + '.'
    : t('dashboard.focus.allClear')

  return (
    <section className="dv-widget dv-focus">
      <header className="dv-widget-header">
        <h3>{t('dashboard.widgets.focus')}</h3>
        <span className="dv-widget-count">{focusTasks.length}</span>
      </header>
      <div className="dv-widget-body">
        <p className="dv-focus-narrative">{narrative}</p>
        {focusTasks.length === 0 ? (
          <div className="dv-widget-empty">{t('dashboard.focus.empty')}</div>
        ) : (
          <div className="dv-list">
            {focusTasks.map(task => (
              <div key={`${task.noteId}-${task.line}`} className={`dv-focus-row reason-${task.reason}`}>
                <div className="dv-focus-row-body" onClick={() => onTaskClick(task)}>
                  <div className="dv-focus-text">{task.text}</div>
                  <div className="dv-focus-meta">
                    <span className={`dv-focus-badge reason-${task.reason}`}>
                      {t(`dashboard.focus.reason.${task.reason}` as never)}
                    </span>
                    <span>{task.noteTitle}</span>
                  </div>
                </div>
                <button
                  className="dv-focus-block-btn"
                  onClick={(e) => { e.stopPropagation(); setPendingBlock(task) }}
                  title={t('dashboard.focus.blockTime')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                    <line x1="12" y1="14" x2="12" y2="18"/>
                    <line x1="9" y1="16" x2="15" y2="16"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {pendingBlock && (
        <TimeblockModal
          task={pendingBlock}
          calendar={snapshot.calendar.filter(c => c.dayOffset === 0).map(c => c.event)}
          onClose={() => setPendingBlock(null)}
          onCreated={() => { setPendingBlock(null); onRefresh() }}
          t={t}
        />
      )}
    </section>
  )
}

// ─── Timeblock-Modal ───────────────────────────────────────────────────────
const DURATION_OPTIONS = [30, 45, 60, 90, 120]

interface TimeblockModalProps {
  task: FocusTask
  calendar: import('../../../shared/types').CalendarEvent[]
  onClose: () => void
  onCreated: () => void
  t: TFn
}

const TimeblockModal: React.FC<TimeblockModalProps> = ({ task, calendar, onClose, onCreated, t }) => {
  const [duration, setDuration] = useState(60)
  const suggested = React.useMemo(() => findNextFreeSlot(calendar, duration), [calendar, duration])

  const [startInput, setStartInput] = useState<string>(() => {
    const d = suggested ?? new Date(Date.now() + 60 * 60 * 1000)
    return toLocalInputValue(d)
  })

  // Wenn Dauer ändert, neuen Vorschlag machen
  const onDurationChange = (d: number) => {
    setDuration(d)
    const slot = findNextFreeSlot(calendar, d)
    if (slot) setStartInput(toLocalInputValue(slot))
  }

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsPermission, setNeedsPermission] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    setNeedsPermission(false)
    const start = new Date(startInput)
    if (isNaN(start.getTime())) { setError(t('dashboard.focus.invalidStart')); setBusy(false); return }
    const res = await window.electronAPI.calendarCreateEvent({
      title: `⏱ ${task.text}`,
      startIso: start.toISOString(),
      durationMinutes: duration,
      notes: `${task.noteTitle}${task.notePath ? `\n${task.notePath}` : ''}`
    })
    if (res.success) {
      onCreated()
    } else {
      setError(res.error || 'Unbekannter Fehler')
      setNeedsPermission(res.needsPermission === true)
      setBusy(false)
    }
  }

  const openSystemSettings = () => {
    window.electronAPI.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars')
  }

  return (
    <div className="dv-modal-overlay" onClick={onClose}>
      <div className="dv-modal" onClick={e => e.stopPropagation()}>
        <header className="dv-modal-header">
          <h3>{t('dashboard.focus.timeblock')}</h3>
          <button className="dv-modal-close" onClick={onClose} aria-label="close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div className="dv-modal-body">
          <div className="dv-modal-task">{task.text}</div>
          <div className="dv-modal-task-note">{task.noteTitle}</div>

          <label className="dv-modal-label">{t('dashboard.focus.duration')}</label>
          <div className="dv-modal-durations">
            {DURATION_OPTIONS.map(d => (
              <button
                key={d}
                type="button"
                className={`dv-modal-duration ${duration === d ? 'active' : ''}`}
                onClick={() => onDurationChange(d)}
              >{d} min</button>
            ))}
          </div>

          <label className="dv-modal-label">{t('dashboard.focus.startTime')}</label>
          <input
            className="dv-modal-input"
            type="datetime-local"
            value={startInput}
            onChange={e => setStartInput(e.target.value)}
          />
          {suggested && (
            <p className="dv-modal-hint">
              {t('dashboard.focus.suggested', { time: suggested.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) })}
            </p>
          )}

          {error && (
            <div className="dv-modal-error">
              <p style={{ margin: 0 }}>{error}</p>
              {needsPermission && (
                <button
                  type="button"
                  className="dv-modal-permission-btn"
                  onClick={openSystemSettings}
                >
                  {t('dashboard.focus.openSettings')}
                </button>
              )}
            </div>
          )}
        </div>
        <footer className="dv-modal-footer">
          <button className="dv-modal-btn-secondary" onClick={onClose} disabled={busy}>
            {t('dashboard.focus.cancel')}
          </button>
          <button className="dv-modal-btn-primary" onClick={submit} disabled={busy}>
            {busy ? t('dashboard.focus.creating') : t('dashboard.focus.create')}
          </button>
        </footer>
      </div>
    </div>
  )
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const BookingsWidget: React.FC<WidgetProps> = ({ snapshot, onBookingClick, t }) => {
  const items = snapshot.bookings
  return (
    <section className="dv-widget dv-widget-bookings">
      <header className="dv-widget-header">
        <h3>{t('dashboard.widgets.bookings')}</h3>
        <span className="dv-widget-count">{items.length}</span>
      </header>
      <div className="dv-widget-body">
        {items.length === 0 ? (
          <div className="dv-widget-empty">{t('dashboard.bookingsEmpty')}</div>
        ) : (
          <div className="dv-list">
            {items.slice(0, 10).map(item => (
              <div key={item.booking.id} className="dv-booking-row" onClick={() => onBookingClick?.(item)}>
                <div className="dv-booking-name">{item.booking.userName || item.booking.userEmail}</div>
                <div className="dv-booking-meta">
                  <span>{item.offer.name}</span>
                  {item.booking.bookedAt && (
                    <>
                      <span className="sep">•</span>
                      <span>{formatBookedAt(item.booking.bookedAt)}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
