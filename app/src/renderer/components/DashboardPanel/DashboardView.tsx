import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildBrainSensors, getDayBoundsMs } from '../../utils/brainSensors'
import { createNoteFromFile, useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useEmailStore } from '../../stores/emailStore'
import { useAgentStore } from '../../stores/agentStore'
import { useAntaresStore } from '../../stores/antaresStore'
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
import type { FileEntry, Note } from '../../../shared/types'
import {
  getNoteKind,
  getNoteKindFromContent,
  getNoteKindFromTitleStrict,
  stripNoteKindMarker,
  getNoteStatus,
  getNoteRelevance
} from '../../utils/noteKind'
import { ErrorBoundary } from '../ErrorBoundary'
import { isHardLocked } from '../../../shared/modelCompatibility'
import './DashboardView.css'

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string

type RadarFeedbackValue = 'positive' | 'negative'

const SLEEPING_THRESHOLD_DAYS = 14
const RADAR_HISTORY_RETAIN_DAYS = 7

// The radar widget can be mounted/unmounted quickly when the user switches views.
// Keep the expensive Ollama relevance worker singleton at module level so a new
// widget instance does not start a second batch while the previous one is still running.
let radarAiWorkerRunning = false

const getRadarHistoryKey = (vaultPath: string | null): string => `mindgraph:radar-history:${vaultPath || 'default'}`

const getRadarUiKey = (vaultPath: string | null): string => `mindgraph:radar-ui:${vaultPath || 'default'}`

// KI-Relevanz wird pro Gerät lokal in localStorage gehalten — vorher schrieb der AI-Worker die
// Felder direkt ins Notiz-Frontmatter, was bei Multi-Device-Setups Sync-Konflikte produzierte
// (jedes Gerät analysiert unabhängig → beide schreiben → Konflikt). Der Cache ist deviceintern,
// die Notiz-Datei selbst wird durch eine Analyse nicht mehr verändert. Frontmatter-Reader bleibt
// als Fallback für vor 0.5.34-beta analysierte Notizen.
interface RelevanceCacheEntry {
  score: number
  reason: string
  checkedAt: string
  model: string
}
type RelevanceCacheMap = Record<string, RelevanceCacheEntry>

const getRelevanceCacheKey = (vaultPath: string | null): string => `mindgraph:relevance-cache:${vaultPath || 'default'}`

const loadRelevanceCache = (vaultPath: string | null): RelevanceCacheMap => {
  try {
    const raw = localStorage.getItem(getRelevanceCacheKey(vaultPath))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveRelevanceCache = (vaultPath: string | null, cache: RelevanceCacheMap): void => {
  try {
    localStorage.setItem(getRelevanceCacheKey(vaultPath), JSON.stringify(cache))
  } catch {
    // localStorage voll/gesperrt — kein kritisches Problem
  }
}


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
  onOpenSmartConnections?: (noteId: string) => void
}

const collectMarkdownPaths = (entries: FileEntry[], includePdfCompanions: boolean): string[] => {
  const paths: string[] = []
  const walk = (items: FileEntry[]) => {
    for (const item of items) {
      if (item.isDirectory) {
        if (item.children) walk(item.children)
        continue
      }
      if (!item.path.endsWith('.md')) continue
      if (!includePdfCompanions && item.path.endsWith('.pdf.md')) continue
      paths.push(item.path)
    }
  }
  walk(entries)
  return paths
}

const reloadVaultNotesForDashboard = async (vaultPath: string): Promise<Note[]> => {
  const tree = await window.electronAPI.readDirectory(vaultPath) as FileEntry[]
  useNotesStore.getState().setFileTree(tree)

  const includePdfCompanions = useUIStore.getState().pdfCompanionEnabled
  const paths = collectMarkdownPaths(tree, includePdfCompanions)
  const contents = await window.electronAPI.readFilesBatch(vaultPath, paths) as Record<string, string | null>
  const notes = (await Promise.all(paths.map(async (relativePath) => {
    const content = contents[relativePath]
    if (content === null || content === undefined) return null
    try {
      return await createNoteFromFile(`${vaultPath}/${relativePath}`, relativePath, content)
    } catch (error) {
      console.error('[Dashboard] failed to refresh note from disk', relativePath, error)
      return null
    }
  }))).filter((note): note is Note => note !== null)

  notes.sort((a, b) => a.path.localeCompare(b.path))
  useNotesStore.getState().setNotes(notes)
  return notes
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenInbox, onOpenAgent, onOpenSmartConnections }) => {
  const { t } = useTranslation()
  const { notes, vaultPath, selectNote } = useNotesStore()
  const { taskExcludedFolders, dashboard, taskLeadTime } = useUIStore()
  const emails = useEmailStore(state => state.emails)
  const loadDashboardOffers = useAgentStore(state => state.loadDashboard)

  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Refs für robustes Reload-Verhalten:
  // - isInitialLoadRef: setIsLoading(true) nur beim ersten Load, sonst silent reload
  // - loadDebounceTimer: viele schnelle updateNote-Calls (KI-Worker) lösen sonst pro Notiz einen Full-Reload
  //   aus → Dashboard flackert permanent. Debounce sammelt Updates auf 800ms.
  // - didInitialReloadRef: beim ersten Mount einmalig den Vault frisch von Disk laden, damit auch
  //   Notizen mit `category: problem` im Frontmatter (ohne 🔴-Prefix im Titel) im Radar erscheinen.
  //   Ohne das hatte Cmd+R systematisch weniger Kandidaten als der Aktualisieren-Button.
  const isInitialLoadRef = useRef(true)
  const didInitialReloadRef = useRef(false)
  const loadDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadRequestIdRef = useRef(0)

  const loadSnapshot = useCallback(async (options?: { reloadVault?: boolean }) => {
    const requestId = ++loadRequestIdRef.current
    if (isInitialLoadRef.current) setIsLoading(true)
    if (options?.reloadVault) setIsRefreshing(true)
    try {
      const snapshotNotes = options?.reloadVault && vaultPath
        ? await reloadVaultNotesForDashboard(vaultPath)
        : notes
      await loadDashboardOffers({ includeBookings: true })
      const latestOffers = useAgentStore.getState().dashboardOffers
      const snap = await buildDashboardSnapshot({
        notes: snapshotNotes,
        vaultPath,
        excludedFolders: taskExcludedFolders,
        emails,
        dashboardOffers: latestOffers,
        bookingsSinceIso: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        calendarDaysAhead: dashboard.calendarDaysAhead,
        includeCalendar: true,
        taskLeadTime
      })
      if (requestId === loadRequestIdRef.current) setSnapshot(snap)
    } catch (error) {
      // Defensive: ein einzelner fehlerhafter Sub-Call (edoobox-Timeout, Kalender-Permission-Race,
      // korruptes Frontmatter in einer Notiz) hat vorher die ganze Promise abgebrochen — der Effect
      // nicht await-ete sie, also wurde es eine Unhandled Rejection und der Loading-Spinner blieb
      // hängen. Jetzt loggen wir und behalten den letzten gültigen Snapshot.
      console.error('[Dashboard] loadSnapshot failed', error)
    } finally {
      if (requestId === loadRequestIdRef.current) setIsRefreshing(false)
      if (isInitialLoadRef.current) {
        setIsLoading(false)
        isInitialLoadRef.current = false
      }
    }
  }, [notes, vaultPath, taskExcludedFolders, emails, loadDashboardOffers, dashboard.calendarDaysAhead, taskLeadTime])

  useEffect(() => {
    // Initial: sofort laden, einmalig mit reloadVault damit alle Notizen Content haben (sonst
    // werden frontmatter-markierte Probleme nicht erkannt). Re-Triggers (z.B. durch updateNote
    // vom KI-Worker): 800ms debounce, ohne reloadVault.
    if (loadDebounceTimer.current) clearTimeout(loadDebounceTimer.current)
    if (!didInitialReloadRef.current) {
      didInitialReloadRef.current = true
      loadSnapshot({ reloadVault: true })
    } else if (isInitialLoadRef.current) {
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
    // Jedes Widget bekommt seine eigene ErrorBoundary, damit ein Render-Crash in z.B. dem Radar
    // nicht die anderen Widgets mitreißt. Ohne Boundary war ein einzelner Exception-Pfad genug,
    // um die ganze Dashboard-Sicht weiß zu setzen.
    let inner: React.ReactNode = null
    let label = id as string
    switch (id) {
      case 'focus':
        inner = <FocusWidget snapshot={snapshot} onTaskClick={handleTaskClick} onRefresh={loadSnapshot} t={t} />
        label = t('dashboard.widgets.focus')
        break
      case 'radar':
        inner = (
          <RadarWidget
            snapshot={snapshot}
            notes={notes}
            vaultPath={vaultPath}
            onNoteClick={selectNote}
            onOpenSmartConnections={onOpenSmartConnections}
            t={t}
          />
        )
        label = t('dashboard.widgets.radar')
        break
      case 'activity':
        inner = <ActivityWidget snapshot={snapshot} t={t} vaultPath={vaultPath} notes={notes} emails={emails} onNoteOpen={selectNote} />
        label = t('dashboard.widgets.activity')
        break
      case 'tasks':
        inner = <TasksWidget snapshot={snapshot} onTaskClick={handleTaskClick} t={t} />
        label = t('dashboard.widgets.tasks')
        break
      case 'emails':
        inner = <EmailsWidget snapshot={snapshot} onEmailClick={handleEmailClick} onEmailHandled={handleEmailHandled} t={t} />
        label = t('dashboard.widgets.emails')
        break
      case 'calendar':
        inner = <CalendarWidget snapshot={snapshot} t={t} onRefresh={loadSnapshot} />
        label = t('dashboard.widgets.calendar')
        break
      case 'bookings':
        inner = <BookingsWidget snapshot={snapshot} onBookingClick={handleBookingClick} t={t} />
        label = t('dashboard.widgets.bookings')
        break
      case 'antares':
        inner = <AntaresWidget t={t} />
        label = t('dashboard.widgets.antares')
        break
      case 'sync':
        return null
    }
    return <ErrorBoundary key={id} label={label}>{inner}</ErrorBoundary>
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
        <button className="dashboard-view-refresh" onClick={() => loadSnapshot({ reloadVault: true })} disabled={isRefreshing} title={t('dashboard.refresh')}>
          <svg className={isRefreshing ? 'spinning' : undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

interface ActivityWidgetProps extends WidgetProps {
  vaultPath: string | null
  notes: Note[]
  emails: import('../../../shared/types').EmailMessage[]
  onNoteOpen: (id: string) => void
}

const ActivityWidget: React.FC<ActivityWidgetProps> = ({ snapshot, t, vaultPath, notes, emails, onNoteOpen }) => {
  const activity = snapshot.activity
  const memory = activity.memory
  const maxFolderCount = Math.max(1, ...activity.topFolders.map(folder => folder.changed))
  const hasFrequentContexts = memory.topNotes7d.length > 0
  const visibleContexts = hasFrequentContexts ? memory.topNotes7d : memory.recentNotes7d
  const maxContextScore = Math.max(1, ...visibleContexts.map(note => note.score))
  const { ollamaEnabled, ollamaSelectedModel, brainModelOverride, language, brainFolderPath, dailyNoteFolderPath, dailyNoteDateFormat } = useUIStore(useShallow(s => ({
    ollamaEnabled: s.ollama.enabled,
    ollamaSelectedModel: s.ollama.selectedModel,
    brainModelOverride: s.ollama.moduleModelOverrides?.brain || '',
    language: s.language,
    brainFolderPath: s.brain.folderPath,
    dailyNoteFolderPath: s.dailyNote.folderPath,
    dailyNoteDateFormat: s.dailyNote.dateFormat
  })))
  const brainModel = brainModelOverride || ollamaSelectedModel
  const [brainLoading, setBrainLoading] = useState(false)
  const [brainError, setBrainError] = useState<string>('')
  const [brainNotePath, setBrainNotePath] = useState<string>('')

  const runBrainConsolidation = async () => {
    if (!vaultPath || !ollamaEnabled || !brainModel || brainLoading) return
    setBrainLoading(true)
    setBrainError('')
    setBrainNotePath('')
    try {
      const { startMs, endMs, isoDate } = getDayBoundsMs()
      const { sensors, hasContent } = buildBrainSensors({
        notes, emails, vaultPath, dayStartMs: startMs, dayEndMs: endMs,
        dailyNote: { folderPath: dailyNoteFolderPath, dateFormat: dailyNoteDateFormat }
      })
      if (!hasContent) {
        setBrainError(t('dashboard.activity.brainEmpty'))
        return
      }
      const result = await window.electronAPI.brainConsolidateDay({
        vaultPath,
        folderPath: brainFolderPath || '800 - 🧠 brain',
        date: isoDate,
        generatedAtIso: new Date().toISOString(),
        model: brainModel,
        language,
        sensors
      })
      if (result.success && result.notePath) {
        setBrainNotePath(result.notePath)
      } else {
        setBrainError(result.error || t('dashboard.activity.brainError'))
      }
    } catch (error) {
      setBrainError(error instanceof Error ? error.message : t('dashboard.activity.brainError'))
    } finally {
      setBrainLoading(false)
    }
  }

  const openBrainNoteInEditor = (notePath: string) => {
    if (!notePath) return
    // Notiz im Store finden — Path-Vergleich tolerant gegen absolute/relative Varianten.
    const note = notes.find(n => n.path === notePath || notePath.endsWith(n.path) || n.path.endsWith(notePath))
    if (note) {
      onNoteOpen(note.id)
      return
    }
    // Fallback: Datei wurde gerade geschrieben, Watcher hat sie noch nicht aufgenommen
    window.electronAPI.showInFolder(notePath).catch(() => {})
  }

  const openBrainNote = () => {
    if (brainNotePath) openBrainNoteInEditor(brainNotePath)
  }

  // Status: hat heute schon eine Brain-Notiz? — leitet sich aus den geladenen Notizen ab
  const todayBrainNote = useMemo(() => {
    if (!brainFolderPath) return null
    const { isoDate, startMs, endMs } = getDayBoundsMs()
    const [year, month, day] = isoDate.split('-')
    const dirSuffix = `${brainFolderPath}/${year}/${month}/`
    const todayNotes = notes.filter(n => {
      if (!n.path.includes(dirSuffix)) return false
      const filename = n.path.split('/').pop() || ''
      return filename === `${day}.md` || filename.startsWith(`${day} (`)
    })
    if (todayNotes.length === 0) return null
    const latest = todayNotes
      .map(n => ({
        n,
        time: n.modifiedAt instanceof Date ? n.modifiedAt.getTime() : new Date(n.modifiedAt as unknown as string).getTime()
      }))
      .filter(x => Number.isFinite(x.time) && x.time >= startMs && x.time < endMs)
      .sort((a, b) => b.time - a.time)[0]
    return latest ? { note: latest.n, time: latest.time } : null
  }, [notes, brainFolderPath])

  const formatStatusTime = (ms: number): string => {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const openTodayBrainNote = () => {
    if (todayBrainNote?.note) onNoteOpen(todayBrainNote.note.id)
  }

  return (
    <section className="dv-widget dv-activity dv-brain">
      <header className="dv-widget-header dv-brain-header">
        <div className="dv-brain-header-title">
          <span className="dv-brain-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 3.5c-2.5 0-4 1.7-4 3.6 0 .5.1 1 .3 1.4-1.5.5-2.5 1.8-2.5 3.3 0 1.2.6 2.3 1.6 3 0 1.5 1.2 2.7 2.7 2.7.6 0 1.2-.2 1.7-.5.5.7 1.4 1.2 2.5 1.2 1.7 0 3-1.2 3-2.7 0-.2 0-.4-.1-.6 1.1-.5 1.9-1.6 1.9-2.9 0-1.3-.7-2.5-1.9-3 .1-.4.2-.8.2-1.2 0-2-1.6-3.6-3.6-3.6-.4 0-.8.1-1.2.2-.4-.5-1-.9-1.6-.9z"
                stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M12 7v10M9.5 10c1.2 1.2 3.8 1.2 5 0M9.5 14c1.2 1.2 3.8 1.2 5 0"
                stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </span>
          <div className="dv-brain-header-text">
            <h3>{t('dashboard.brain.title')}</h3>
            <span className="dv-brain-subtitle">{t('dashboard.brain.subtitle')}</span>
          </div>
        </div>
        <span className="dv-widget-count">{activity.changed7d}</span>
      </header>
      <div className="dv-brain-status">
        {todayBrainNote ? (
          <>
            <span className="dv-brain-status-dot dv-brain-status-dot-ready" aria-hidden="true" />
            <span className="dv-brain-status-text">
              {t('dashboard.brain.statusReady', { time: formatStatusTime(todayBrainNote.time) })}
            </span>
            <button className="dv-brain-status-link" onClick={openTodayBrainNote}>
              {t('dashboard.brain.statusOpen')}
            </button>
          </>
        ) : (
          <>
            <span className="dv-brain-status-dot dv-brain-status-dot-pending" aria-hidden="true" />
            <span className="dv-brain-status-text">{t('dashboard.brain.statusPending')}</span>
          </>
        )}
      </div>
      <div className="dv-widget-body">
        <div className="dv-brain-section-label">{t('dashboard.brain.statsLabel')}</div>
        <div className="dv-activity-stats">
          <div className="dv-activity-stat">
            <span>{activity.totalNotes}</span>
            <small>{t('dashboard.activity.total')}</small>
          </div>
          <div className="dv-activity-stat">
            <span>{activity.touchedToday}</span>
            <small>{t('dashboard.activity.today')}</small>
          </div>
          <div className="dv-activity-stat">
            <span>{activity.created7d}</span>
            <small>{t('dashboard.activity.created7d')}</small>
          </div>
          <div className="dv-activity-stat">
            <span>{activity.changed30d}</span>
            <small>{t('dashboard.activity.changed30d')}</small>
          </div>
          <div className="dv-activity-stat">
            <span>{memory.events7d}</span>
            <small>{t('dashboard.activity.contextEvents7d')}</small>
          </div>
          <div className="dv-activity-stat">
            <span>{memory.taskEvents7d}</span>
            <small>{t('dashboard.activity.taskEvents7d')}</small>
          </div>
        </div>

        <div className="dv-activity-section-title">{t('dashboard.activity.changed7d')}</div>
        {activity.topFolders.length === 0 ? (
          <div className="dv-widget-empty">{t('dashboard.activity.empty')}</div>
        ) : (
          <div className="dv-activity-folders">
            {activity.topFolders.map(folder => (
              <div key={folder.folder} className="dv-activity-folder">
                <div className="dv-activity-folder-row">
                  <span>{folder.folder}</span>
                  <strong>{folder.changed}</strong>
                </div>
                <div className="dv-activity-bar">
                  <div style={{ width: `${Math.max(8, (folder.changed / maxFolderCount) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="dv-activity-section-title">
          {hasFrequentContexts ? t('dashboard.activity.contextTitle') : t('dashboard.activity.recentContextTitle')}
        </div>
        {visibleContexts.length === 0 ? (
          <div className="dv-widget-empty">{t('dashboard.activity.contextEmpty')}</div>
        ) : (
          <div className="dv-activity-folders">
            {visibleContexts.map(note => (
              <div key={`${note.noteId || note.path || note.title}`} className="dv-activity-folder">
                <div className="dv-activity-folder-row">
                  <span>{note.title}</span>
                  <strong>{note.count}</strong>
                </div>
                <div className="dv-activity-bar context">
                  <div style={{ width: `${Math.max(8, (note.score / maxContextScore) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="dv-activity-ai">
          <div className="dv-activity-ai-buttons">
            <button
              className="dv-activity-ai-btn dv-activity-ai-btn-primary"
              onClick={runBrainConsolidation}
              disabled={!ollamaEnabled || !brainModel || brainLoading || !vaultPath}
            >
              {brainLoading ? t('dashboard.activity.brainRunning') : t('dashboard.activity.brainButton')}
            </button>
          </div>
          {brainNotePath ? (
            <div className="dv-activity-ai-result dv-activity-ai-success">
              {t('dashboard.activity.brainDone')}
              {' · '}
              <button className="dv-activity-ai-link" onClick={openBrainNote}>
                {t('dashboard.activity.brainOpen')}
              </button>
            </div>
          ) : brainError ? (
            <div className="dv-activity-ai-error">{brainError}</div>
          ) : null}
          {!ollamaEnabled || !brainModel ? (
            <div className="dv-activity-ai-hint">{t('dashboard.activity.aiNeedsModel')}</div>
          ) : null}
        </div>
      </div>
    </section>
  )
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

const textMatchesNote = (text: string, keywords: string[]) => {
  const haystack = text.toLowerCase()
  return keywords.some(keyword => haystack.includes(keyword))
}

const collectRadarSnapshot = (
  notes: Note[],
  snapshot: DashboardSnapshot,
  t: TFn,
  previousScores: Record<string, number> | null,
  relevanceCache: RelevanceCacheMap
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
  // 'upcoming' im Radar-Score = soon + later kombiniert
  snapshot.tasks.soon.forEach(task => addTask(task, 'upcoming'))
  snapshot.tasks.later.forEach(task => addTask(task, 'upcoming'))

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
    // Lösungs-/Kontext-Vorschläge wurden 2026-05 entfernt — sowohl die Keyword-Variante als auch
    // die Embedding-Variante haben für das Radar-UI keinen Mehrwert geliefert (z.B. „Termin mit
    // Jens" — die App weiß nichts über die Person, ein Vorschlag ist Spekulation). Stattdessen
    // gibt es jetzt pro Radar-Item Buttons für Web-Recherche und Smart-Connections, die der
    // Nutzer bewusst klickt, wenn er nach einer Lösung sucht.
    const solution: RadarConnection | undefined = undefined
    const context: RadarConnection | undefined = undefined
    const hasPositiveFeedback = false

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

    // Smart-Pairing-Score-Booster wurde 2026-05 zusammen mit den Auto-Lösungsvorschlägen entfernt:
    // er hatte die unzuverlässigen Keyword/Embedding-Treffer ins Ranking gehoben und damit den
    // gleichen Quatsch wie das UI produziert.
    const inScope = hasActionSignal || hasPositiveFeedback

    // KI-Relevanz aus dem deviceintern persistierten Cache (Stufe 2): primäre Quelle ist
    // localStorage, weil das Frontmatter sonst pro Analyse churnt und Sync-Konflikte produziert.
    // Frontmatter-Reader bleibt als Fallback für Notizen, die vor 0.5.34-beta analysiert wurden.
    const cached = relevanceCache[note.path]
    const ai = cached
      ? { score: cached.score, reason: cached.reason, checkedAt: cached.checkedAt, model: cached.model }
      : getNoteRelevance(note)
    const aiScore = typeof ai.score === 'number' ? ai.score : undefined
    const heuristicScore = inScope ? score : 0
    const hasMeaningfulAi = aiScore !== undefined && aiScore >= 40
    // Score-Mischung: KI liefert die Hauptbewertung (Skala 0–100), Heuristik addiert einen
    // gedeckelten Tagesdringlichkeits-Bonus oben drauf. Vorher Math.max — KI dominierte alles,
    // Tagessignale unsichtbar. Erste Iteration mit Multiplikator 3 ohne Deckel — Heuristik
    // explodierte (40+ Rohpunkte × 3 = +120), Endscores >150, KI hatte keinen Einfluss mehr.
    // Jetzt: Boost mit Cap, sodass die KI-Skala intakt bleibt und der Bonus klar erkennbar oben
    // draufkommt. Notizen ohne KI-Analyse mit aktivem Trigger bekommen einen Default-Sockel.
    const heuristicBoostCap = 25
    const aiFallback = 35
    const heuristicBoost = Math.min(heuristicScore, heuristicBoostCap)
    const aiBase = aiScore !== undefined
      ? aiScore
      : (heuristicScore > 0 ? aiFallback : 0)
    const finalScore = aiBase + heuristicBoost

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
  const { overdue, today, soon, later } = snapshot.tasks
  const total = overdue.length + today.length + soon.length + later.length
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
            {soon.length > 0 && (
              <Group label={t('dashboard.soon')}>
                {soon.slice(0, 6).map(task => (
                  <TaskRow key={`${task.noteId}-${task.line}`} task={task} onClick={() => onTaskClick?.(task)} showDate />
                ))}
              </Group>
            )}
            {later.length > 0 && (
              <Group label={t('dashboard.later')}>
                {later.slice(0, 6).map(task => (
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
  <div className={`dv-task-row${task.isCritical ? ' dv-task-urgent' : ''}`} onClick={onClick}>
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
  onOpenSmartConnections?: (noteId: string) => void
  t: TFn
}

const renderDelta = (delta: number | null, isNew: boolean): React.ReactNode => {
  if (isNew) return <span className="dv-radar-delta new" aria-label="neu im Radar">★</span>
  if (delta === null || delta === 0) return <span className="dv-radar-delta neutral" aria-hidden="true">·</span>
  if (delta > 0) return <span className="dv-radar-delta up" aria-label={`${delta} mehr Druck als gestern`}>▴ {delta}</span>
  return <span className="dv-radar-delta down" aria-label={`${Math.abs(delta)} weniger Druck als gestern`}>▾ {Math.abs(delta)}</span>
}

const RadarWidget: React.FC<RadarWidgetProps> = ({ snapshot, notes, vaultPath, onNoteClick, onOpenSmartConnections, t }) => {
  const radarHistory = React.useMemo(() => loadRadarHistory(vaultPath), [vaultPath])
  const previousScores = React.useMemo(() => getPreviousScores(radarHistory), [radarHistory])

  // Deviceinterner Relevanz-Cache. Wird beim AI-Worker-Lauf gefüllt; das Notiz-File wird nicht
  // mehr durch eine Analyse verändert (vorher Sync-Konflikte auf 🔴-Notizen).
  const [relevanceCache, setRelevanceCache] = useState<RelevanceCacheMap>(() => loadRelevanceCache(vaultPath))
  useEffect(() => {
    setRelevanceCache(loadRelevanceCache(vaultPath))
  }, [vaultPath])

  const radarSnapshot = React.useMemo(
    () => collectRadarSnapshot(notes, snapshot, t, previousScores, relevanceCache),
    [notes, snapshot, t, previousScores, relevanceCache]
  )

  // Heutigen Snapshot persistieren — mit Dedupe-Ref, damit identische Score-Maps nicht jeden Render
  // einen localStorage-Write auslösen. Vorher: bei instabilem `t` aus useTranslation wurde
  // radarSnapshot pro Render neu gebaut → Effect feuerte ständig → Schreib-Storm in localStorage.
  const lastPersistedKeyRef = useRef<string>('')
  useEffect(() => {
    if (!vaultPath) return
    const todaysScores: Record<string, number> = {}
    radarSnapshot.active.forEach(item => { todaysScores[item.note.id] = item.score })
    if (Object.keys(todaysScores).length === 0) return
    const key = `${vaultPath}::${JSON.stringify(todaysScores)}`
    if (key === lastPersistedKeyRef.current) return
    lastPersistedKeyRef.current = key
    persistRadarSnapshot(vaultPath, todaysScores)
  }, [vaultPath, radarSnapshot])

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
  const { ollamaEnabled, ollamaSelectedModel, dashboardOverride } = useUIStore(useShallow(s => ({
    ollamaEnabled: s.ollama.enabled,
    ollamaSelectedModel: s.ollama.selectedModel,
    dashboardOverride: s.ollama.moduleModelOverrides?.['dashboard-snapshot'] || ''
  })))
  // Priorität: radarAiModel (Dashboard-Tab) → Modul-Override (Kompatibilitäts-Sektion) → globales selectedModel.
  const aiModel = radarAiModel || dashboardOverride || ollamaSelectedModel
  const aiHardLocked = aiModel ? isHardLocked(aiModel, 'dashboard-snapshot') : false
  const aiEnabled = !!(radarAiEnabled && ollamaEnabled && aiModel && !aiHardLocked)

  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set())
  const [forceRefreshTick, setForceRefreshTick] = useState(0)

  // Refs für aktuellste Werte ohne Effect-Re-Trigger
  const notesRef = useRef(notes)
  notesRef.current = notes
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  const consumedForceRefreshTickRef = useRef(0)
  // Spiegel des aktuellen Tick-Werts, damit der Batch-Finally erkennen kann, ob während des Laufs
  // ein weiterer Refresh-Klick eingegangen ist (und entsprechend einen erneuten Lauf triggern muss).
  const forceRefreshTickRef = useRef(forceRefreshTick)
  forceRefreshTickRef.current = forceRefreshTick

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
    // Re-Analyze-Bedingung prüft primär den Cache (jetzige Wahrheit), fällt für Altdaten auf
    // das Frontmatter zurück.
    const cacheAtTrigger = loadRelevanceCache(vaultPath)
    const candidates = notesRef.current.filter(note => {
      const kind = getNoteKindFromContent(note.content) || getNoteKindFromTitleStrict(note.title)
      if (kind?.id !== 'problem') return false
      if (getNoteStatus(note).status !== 'open') return false
      if (forceRefresh) return true
      const cached = cacheAtTrigger[note.path]
      const checkedAtIso = cached?.checkedAt ?? getNoteRelevance(note).checkedAt
      if (!checkedAtIso) return true
      const checkedAtMs = new Date(checkedAtIso).getTime()
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
            // Statt das Notiz-Frontmatter zu schreiben (vorher: Sync-Konflikt-Quelle Nr. 1 bei
            // Multi-Device-Setups), legen wir das Ergebnis nur lokal in localStorage ab. Die Datei
            // selbst wird durch eine Analyse nicht mehr verändert → kein modifiedAt-Bump → kein
            // Sync-Push. State-Update triggert Re-Render des Radar-Snapshots.
            if (canUpdateLocalState) {
              setRelevanceCache(prev => {
                const next = {
                  ...prev,
                  [note.path]: {
                    score: result.score,
                    reason: result.reason,
                    checkedAt: result.checkedAt,
                    model: result.model
                  }
                }
                saveRelevanceCache(vaultPath, next)
                return next
              })
            }
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
      // Defensive Spinner-Aufräumung: wenn der Effect während des Batches ein zweites Mal
      // gefeuert hat (z.B. weil sich aiEnabled/aiModel kurzzeitig ändert), wird canUpdateLocalState
      // im ALTEN Closure auf false gesetzt — dadurch sprangen die per-Note `setAnalyzingIds(...delete)`
      // ins Leere, und der Spinner-Counter blieb endlos hochgezählt, obwohl die Analyse längst
      // durch war. Am Batch-Ende garantiert alle eigenen Kandidaten-IDs entfernen, damit der
      // Spinner zuverlässig verschwindet.
      setAnalyzingIds(prev => {
        if (prev.size === 0) return prev
        const next = new Set(prev)
        let changed = false
        for (const id of candidateIds) {
          if (next.delete(id)) changed = true
        }
        return changed ? next : prev
      })
      console.log('[Radar] AI worker batch finished')
      // Wenn während des Batches ein weiterer Force-Refresh-Klick einging (Tick > consumed),
      // diesen jetzt nachholen — sonst geht der Klick verloren, weil der Effect beim Klick
      // wegen radarAiWorkerRunning early-returnt hatte ohne consumed zu aktualisieren.
      if (canUpdateLocalState && forceRefreshTickRef.current !== consumedForceRefreshTickRef.current) {
        console.log('[Radar] Pending force-refresh detected, re-triggering')
        setForceRefreshTick(prev => prev + 1)
      }
    })

    return () => {
      canUpdateLocalState = false
      // The batch intentionally keeps running after unmount. A quick dashboard re-open should
      // reuse the singleton lock instead of aborting and starting another Ollama batch.
    }
  }, [vaultPath, aiEnabled, aiModel, forceRefreshTick, radarAiRefreshIntervalHours])

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
                </span>
                <span className="dv-radar-actions" onClick={event => event.stopPropagation()}>
                  <button
                    type="button"
                    className="dv-radar-action"
                    title={t('dashboard.radar.actionWebSearch')}
                    aria-label={t('dashboard.radar.actionWebSearch')}
                    onClick={() => {
                      // Zettelkasten-ID-Präfix (12-stellige Zahl + optionaler Bindestrich) raus,
                      // sonst sucht Google nach der ID statt nach dem Thema.
                      const cleanTitle = getCleanNoteTitle(item.note).replace(/^\d{12}\s*-?\s*/, '').trim()
                      const q = encodeURIComponent(cleanTitle || getCleanNoteTitle(item.note))
                      window.electronAPI.openExternal(`https://www.google.com/search?q=${q}`)
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                  </button>
                  {onOpenSmartConnections && (
                    <button
                      type="button"
                      className="dv-radar-action"
                      title={t('dashboard.radar.actionSmartConnections')}
                      aria-label={t('dashboard.radar.actionSmartConnections')}
                      onClick={() => onOpenSmartConnections(item.note.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="6" cy="6" r="2"/>
                        <circle cx="18" cy="6" r="2"/>
                        <circle cx="12" cy="18" r="2"/>
                        <line x1="6" y1="8" x2="11" y2="16"/>
                        <line x1="18" y1="8" x2="13" y2="16"/>
                        <line x1="8" y1="6" x2="16" y2="6"/>
                      </svg>
                    </button>
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
    </section>
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

// ─── Antares Widget ───────────────────────────────────────────────────────

interface AntaresWidgetProps {
  t: (key: TranslationKey) => string
}

const AntaresWidget: React.FC<AntaresWidgetProps> = ({ t }) => {
  const antaresEnabled = useUIStore(s => s.antares.enabled)
  const {
    counts,
    mahnungenGeraete,
    mahnungenMedien,
    loading,
    lastError,
    lastFetchedAt,
    loadAll
  } = useAntaresStore(useShallow(s => ({
    counts: s.counts,
    mahnungenGeraete: s.mahnungenGeraete,
    mahnungenMedien: s.mahnungenMedien,
    loading: s.loading,
    lastError: s.lastError,
    lastFetchedAt: s.lastFetchedAt,
    loadAll: s.loadAll
  })))

  useEffect(() => {
    if (antaresEnabled && lastFetchedAt === null) {
      loadAll()
    }
  }, [antaresEnabled, lastFetchedAt, loadAll])

  if (!antaresEnabled) {
    return (
      <section className="dv-widget dv-widget-antares">
        <header className="dv-widget-header">
          <h3 className="dv-widget-title">{t('dashboard.widgets.antares')}</h3>
        </header>
        <p className="dv-empty">{t('dashboard.antares.disabled')}</p>
      </section>
    )
  }

  const fetchedAgo = lastFetchedAt
    ? new Date(lastFetchedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <section className="dv-widget dv-widget-antares">
      <header className="dv-widget-header">
        <h3 className="dv-widget-title">{t('dashboard.widgets.antares')}</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {fetchedAgo && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fetchedAgo}</span>}
          <button
            className="dv-widget-refresh"
            onClick={() => loadAll()}
            disabled={loading}
            title={t('dashboard.refresh')}
          >
            <svg className={loading ? 'spinning' : undefined} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
      </header>

      {lastError && (
        <p style={{ color: 'var(--color-red, #c0392b)', fontSize: '12px', margin: '4px 0 8px' }}>
          {lastError}
        </p>
      )}

      {/* Drei-Spalten-Layout wie das Antares-Original-Dashboard */}
      <div className="dv-antares-columns">
        <div className="dv-antares-column">
          <h4 className="dv-antares-coltitle">{t('dashboard.antares.colNutzer')}</h4>
          <AntaresStatusButton label={t('dashboard.antares.offeneRegistrierungen')} count={counts.offeneRegistrierungen} />
        </div>

        <div className="dv-antares-column">
          <h4 className="dv-antares-coltitle">{t('dashboard.antares.colTechnik')}</h4>
          <AntaresStatusButton label={t('dashboard.antares.offeneAnfragen')} count={counts.offeneAnfragenGeraete} />
          <AntaresStatusButton label={t('dashboard.antares.offeneVorbestellungen')} count={counts.offeneVorbestellungenGeraete} />
          <AntaresStatusButton label={t('dashboard.antares.stornierteVorbestellungen')} count={counts.stornierteVorbestellungen} />
          <AntaresStatusButton label={t('dashboard.antares.ueberfaelligeRueckgaben')} count={counts.ueberfaelligeGeraete} />
        </div>

        <div className="dv-antares-column">
          <h4 className="dv-antares-coltitle">{t('dashboard.antares.colMedien')}</h4>
          <AntaresStatusButton label={t('dashboard.antares.offeneVorbestellung')} count={counts.offeneVorbestellungenMedien} />
          <AntaresStatusButton label={t('dashboard.antares.ueberfaelligeRueckgaben')} count={counts.ueberfaelligeMedien} />
        </div>
      </div>

      {/* Mahnungs-Details */}
      {(mahnungenGeraete.length > 0 || mahnungenMedien.length > 0) && (
        <div className="dv-antares-details">
          {mahnungenGeraete.length > 0 && (
            <details open>
              <summary className="dv-antares-summary">
                {t('dashboard.antares.mahnungenGeraete')} ({mahnungenGeraete.length})
              </summary>
              <table className="dv-antares-table">
                <thead>
                  <tr>
                    <th>{t('dashboard.antares.colLeihnr')}</th>
                    <th>{t('dashboard.antares.colTitel')}</th>
                    <th>{t('dashboard.antares.colEntleiher')}</th>
                    <th>{t('dashboard.antares.colSchule')}</th>
                    <th>{t('dashboard.antares.colRueck')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mahnungenGeraete.map(v => <AntaresVerleihRow key={v.identifier} row={v} />)}
                </tbody>
              </table>
            </details>
          )}

          {mahnungenMedien.length > 0 && (
            <details>
              <summary className="dv-antares-summary">
                {t('dashboard.antares.mahnungenMedien')} ({mahnungenMedien.length})
              </summary>
              <table className="dv-antares-table">
                <thead>
                  <tr>
                    <th>{t('dashboard.antares.colLeihnr')}</th>
                    <th>{t('dashboard.antares.colTitel')}</th>
                    <th>{t('dashboard.antares.colEntleiher')}</th>
                    <th>{t('dashboard.antares.colSchule')}</th>
                    <th>{t('dashboard.antares.colRueck')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mahnungenMedien.map(v => <AntaresVerleihRow key={v.identifier} row={v} />)}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

const AntaresStatusButton: React.FC<{ label: string; count: number }> = ({ label, count }) => {
  const accent = count > 0
  return (
    <div className={`dv-antares-statusbtn ${accent ? 'dv-antares-statusbtn-accent' : ''}`}>
      <span className="dv-antares-statusbtn-count">{count}</span>
      <span className="dv-antares-statusbtn-label">{label}</span>
    </div>
  )
}

const AntaresVerleihRow: React.FC<{ row: import('../../../shared/types').AntaresVerleihRow }> = ({ row }) => {
  const overdue = row.fn_rueckdatum && row.fn_rueckdatum < new Date().toISOString().slice(0, 10)
  return (
    <tr>
      <td className="dv-antares-leihnr">{row.fn_leihnr}</td>
      <td className="dv-antares-titel" title={row.fn_titel}>{row.fn_titel}</td>
      <td>{(row.fn_vorname || '').trim()} {row.fn_ename}</td>
      <td className="dv-antares-schule">{row.fn_schulname}</td>
      <td className={overdue ? 'dv-antares-overdue' : ''}>{row.fn_rueckdatum}</td>
    </tr>
  )
}
