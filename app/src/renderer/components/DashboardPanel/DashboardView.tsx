import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildBrainSensors, getDayBoundsMs } from '../../utils/brainSensors'
import { createNoteFromFile, useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useEmailStore } from '../../stores/emailStore'
import { useEventAgentBridge } from '../../stores/eventAgentBridge'
import { useTranslation } from '../../utils/translations'
import { PluginSlot } from '../../plugins/slots'
import { ExternalWidgetSlot } from '../../plugins/external/ExternalWidgetSlot'
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
  getNoteStatus
} from '../../utils/noteKind'
import { ErrorBoundary } from '../ErrorBoundary'
import { ProjectStatusWidget } from '../ProjectStatusPanel/ProjectStatusWidget'
import { ActiveModelBadge } from '../Shared/ActiveModelBadge'
import './DashboardView.css'

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string

type RadarFeedbackValue = 'positive' | 'negative'

const SLEEPING_THRESHOLD_DAYS = 14
const RADAR_HISTORY_RETAIN_DAYS = 7

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

// Der Dashboard-Tab wird bei jedem Tab-Wechsel abgeräumt (App.tsx rendert ihn nur als aktiven
// Tab). Lag der Snapshot ausschließlich in Komponenten-State, war er danach weg: zurück auf dem
// Dashboard gab es erst einen Vollbild-Spinner und dann den kompletten Aufbau von vorn. Diese
// beiden Modul-Variablen überleben den Wechsel — der letzte Stand steht beim Zurückkommen sofort
// wieder da und wird nur noch leise im Hintergrund aufgefrischt.
let lastSnapshotCache: { vaultPath: string | null; snapshot: DashboardSnapshot } | null = null
// Der Vault-Neuladevorgang (readDirectory + readFilesBatch über alle Notizen) muss nur einmal pro
// Vault laufen, nicht bei jedem Öffnen des Tabs. Der Pfad wird mitgeführt, damit ein Vault-Wechsel
// den Reload wieder auslöst — sonst sähe das Dashboard im neuen Vault nur die Cache-Notizen mit
// leerem `content` und übersähe alle per Frontmatter markierten Probleme.
let vaultWithInitialReload: string | null = null

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
  const { taskExcludedFolders, taskIncludedFolders, dashboard, taskLeadTime } = useUIStore()
  const emails = useEmailStore(state => state.emails)
  const loadDashboardOffers = useEventAgentBridge(state => state.loadOffers)

  // Beim Zurückkommen auf den Tab: letzten Snapshot sofort zeigen statt Spinner.
  const cachedSnapshot = lastSnapshotCache && lastSnapshotCache.vaultPath === vaultPath
    ? lastSnapshotCache.snapshot
    : null
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(cachedSnapshot)
  const [isLoading, setIsLoading] = useState(cachedSnapshot === null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Snapshot zentral setzen, damit der Modul-Cache nie am State vorbeiläuft.
  const publishSnapshot = useCallback((snap: DashboardSnapshot) => {
    lastSnapshotCache = { vaultPath, snapshot: snap }
    setSnapshot(snap)
  }, [vaultPath])

  // Nur das Buchungs-Widget zeigt edoobox-Daten an. Ohne dieses Widget war der Abruf reine
  // Wartezeit: `listBookingsForOffer` fragt pro Veranstaltung erst die Buchungsliste, dann JEDE
  // Buchung und JEDEN Teilnehmer einzeln und nacheinander ab (plugins/edoobox/service.ts).
  // Bei ~120 ms pro Runde sind das mehrere Sekunden je Veranstaltung — für Daten, die niemand
  // anzeigt. Und weil `notes`/`emails` in den Abhängigkeiten stehen, lief das auch bei jeder
  // Notizänderung und jedem Mailabruf erneut.
  const needsBookings = dashboard.widgets.includes('bookings')

  // Refs für robustes Reload-Verhalten:
  // - isInitialLoadRef: Vollbild-Spinner nur, solange noch gar kein Snapshot da ist. Liegt einer
  //   aus dem Modul-Cache vor, wird stumm im Hintergrund aktualisiert.
  // - loadDebounceTimer: viele schnelle updateNote-Calls (KI-Worker) lösen sonst pro Notiz einen Full-Reload
  //   aus → Dashboard flackert permanent. Debounce sammelt Updates auf 800ms.
  // - Der einmalige Vault-Neuladevorgang (damit auch Notizen mit `category: problem` im
  //   Frontmatter erkannt werden) hängt an `vaultWithInitialReload` auf Modulebene, nicht an einem
  //   Ref: ein Ref startet bei jedem Tab-Wechsel wieder bei null und hätte den ganzen Vault
  //   jedes Mal neu von der Platte gelesen.
  const isInitialLoadRef = useRef(cachedSnapshot === null)
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
      const latestOffers = needsBookings ? await loadDashboardOffers({ includeBookings: true }) : []
      const snap = await buildDashboardSnapshot({
        notes: snapshotNotes,
        vaultPath,
        excludedFolders: taskExcludedFolders,
        includedFolders: taskIncludedFolders,
        emails,
        dashboardOffers: latestOffers,
        bookingsSinceIso: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        calendarDaysAhead: dashboard.calendarDaysAhead,
        includeCalendar: true,
        taskLeadTime
      })
      if (requestId === loadRequestIdRef.current) publishSnapshot(snap)
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
  }, [notes, vaultPath, taskExcludedFolders, taskIncludedFolders, emails, loadDashboardOffers, needsBookings, publishSnapshot, dashboard.calendarDaysAhead, taskLeadTime])

  useEffect(() => {
    // Initial: sofort laden, einmalig mit reloadVault damit alle Notizen Content haben (sonst
    // werden frontmatter-markierte Probleme nicht erkannt). Re-Triggers (z.B. durch updateNote
    // vom KI-Worker): 800ms debounce, ohne reloadVault.
    if (loadDebounceTimer.current) clearTimeout(loadDebounceTimer.current)
    if (vaultPath && vaultWithInitialReload !== vaultPath) {
      vaultWithInitialReload = vaultPath
      loadSnapshot({ reloadVault: true })
    } else if (isInitialLoadRef.current) {
      loadSnapshot()
    } else {
      loadDebounceTimer.current = setTimeout(() => loadSnapshot(), 800)
    }
    return () => {
      if (loadDebounceTimer.current) clearTimeout(loadDebounceTimer.current)
    }
  }, [loadSnapshot, vaultPath])

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
    // Optimistisches Lokalpatch: Eintrag sofort aus dem Snapshot filtern,
    // damit das Häkchen wirkt, bevor saveEmails() durchläuft.
    setSnapshot(prev => {
      if (!prev) return prev
      const next = { ...prev, emails: prev.emails.filter(e => e.email.id !== item.email.id) }
      lastSnapshotCache = { vaultPath, snapshot: next }
      return next
    })
    // Async im Hintergrund: Store-Update + Persistenz nach emails.json.
    // Fehler werden ignoriert — Snapshot wird beim nächsten regulären
    // loadSnapshot() ohnehin aus dem persistierten Stand rekonstruiert.
    void markReplyHandled(vaultPath, item.email.id, true)
  }, [vaultPath, markReplyHandled])

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
        // Plugin-Vertikale: Widget kommt aus src/plugins/antares/renderer über den
        // Renderer-Slot. Kein harter Import mehr — Deletion Test (Ordner weg → Slot leer).
        inner = <PluginSlot slotId="dashboard.widget.antares" />
        label = t('dashboard.widgets.antares')
        break
      case 'project-status':
        inner = <ProjectStatusWidget t={t} />
        label = t('dashboard.widgets.projectStatus')
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
            {/* Bestand ist ein volles-Breite-Zahlenband direkt unter dem Fokus-Streifen (aus dem
                Gehirn-Widget herausgelöst, Claude-Design-Layout). Bei fehlendem Fokus-Widget ans Ende. */}
            {dashboard.widgets.flatMap(id => {
              const nodes = [renderWidget(id)]
              if (id === 'focus') {
                nodes.push(
                  <ErrorBoundary key="bestand" label={t('dashboard.brain.statsLabel')}>
                    <BestandBand snapshot={snapshot} t={t} />
                  </ErrorBoundary>
                )
              }
              return nodes
            })}
            {!dashboard.widgets.includes('focus') && (
              <ErrorBoundary key="bestand" label={t('dashboard.brain.statsLabel')}>
                <BestandBand snapshot={snapshot} t={t} />
              </ErrorBoundary>
            )}
          </div>
        )}
        <ExternalWidgetSlot slot="dashboard.widget" />
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

// Petrol redesign (Claude-Design-Layout): „Bestand" ist ein eigenes, volles-Breite-Zahlenband
// am unteren Dashboard-Rand — nicht mehr im Gehirn-Widget eingebettet. 0-Werte werden gedämpft.
const BestandBand: React.FC<{ snapshot: DashboardSnapshot; t: TFn }> = ({ snapshot, t }) => {
  const a = snapshot.activity
  const m = a.memory
  const cells: Array<{ value: number; label: string }> = [
    { value: a.totalNotes, label: t('dashboard.activity.total') },
    { value: a.touchedToday, label: t('dashboard.activity.today') },
    { value: a.created7d, label: t('dashboard.activity.created7d') },
    { value: a.changed30d, label: t('dashboard.activity.changed30d') },
    { value: m.events7d, label: t('dashboard.activity.contextEvents7d') },
    { value: m.taskEvents7d, label: t('dashboard.activity.taskEvents7d') }
  ]
  return (
    <div className="dv-bestand-band">
      {cells.map((c, i) => (
        <div key={i} className="dv-bestand-cell">
          <div className={`dv-bestand-num${c.value === 0 ? ' zero' : ''}`}>{c.value}</div>
          <div className="dv-bestand-label">{c.label}</div>
        </div>
      ))}
    </div>
  )
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ActiveModelBadge moduleId="brain" />
          <span className="dv-widget-count">{activity.changed7d}</span>
        </div>
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
        {/* „Bestand" wanderte in ein eigenes volles-Breite-Band unten (BestandBand) — das
            Gehirn-Widget ist dadurch schlanker (Claude-Design-Layout). */}
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
                  <span>{getDisplayTitle(note.title)}</span>
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

// Petrol redesign (Stage 2): Karten/Zeilen zeigen den lesbaren Anzeigetitel, nicht den rohen
// Zettelkasten-Dateinamen. Strippt einen führenden Zeitstempel-/Zettel-Prefix ("202606222240 - ")
// und den 🔴🟢🔵-Marker (der Kategorie-Punkt wird separat gezeigt).
const ZETTEL_ID_PREFIX = /^\d{8,14}\s*[-–—]\s*/
const getDisplayTitle = (rawTitle: string): string => {
  const withoutId = stripNoteKindMarker(rawTitle.replace(ZETTEL_ID_PREFIX, '')).trim()
  return withoutId || stripNoteKindMarker(rawTitle).trim() || rawTitle
}
const getCleanNoteTitle = (note: Note): string => getDisplayTitle(note.title)

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

    // Score = die heuristischen Signale (überfällige/heutige Aufgaben, Backlinks aus Lösungs-
    // und Info-Notizen, passende Mails und Termine).
    //
    // Bis 08/2026 lag hier eine Mischung aus KI-Score und einem auf 25 gedeckelten Heuristik-
    // Bonus. Der Deckel existierte nur, damit die Heuristik die KI-Skala nicht überstrahlt. Mit
    // dem Wegfall der KI-Analyse wäre er schädlich geworden: alles ab 25 Rohpunkten hätte
    // denselben Endscore bekommen und die Rangfolge wäre flach geworden. Deshalb zählt jetzt der
    // Rohwert — er unterscheidet genau dort, wo die Liste sortiert wird.
    const finalScore = inScope ? score : 0

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
      hasOpenTasks: !!taskStats && (taskStats.overdue + taskStats.today + taskStats.upcoming) > 0,
      modifiedAt
    }
  })

  const active: RadarItem[] = candidates
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ note, score, triggers, solution, context, delta, isNew }) =>
      ({ note, score, triggers, solution, context, delta, isNew })
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

// Petrol redesign (Stage 2): leere Widgets kollabieren zu einer ruhigen einzeiligen Karte
// (Label links, gedämpfter Status rechts) statt einer großen leeren Box.
const CollapsedWidget: React.FC<{ label: string; status: string; className?: string }> = ({ label, status, className }) => (
  <section className={`dv-widget dv-widget-collapsed${className ? ` ${className}` : ''}`}>
    <div className="dv-collapsed-row">
      <h3>{label}</h3>
      <span className="dv-collapsed-status">{status}</span>
    </div>
  </section>
)

const TasksWidget: React.FC<WidgetProps> = ({ snapshot, onTaskClick, t }) => {
  const { overdue, today, soon, later, noDate } = snapshot.tasks
  const total = overdue.length + today.length + soon.length + later.length + noDate.length
  if (total === 0) {
    return <CollapsedWidget label={t('dashboard.widgets.tasks')} status={t('dashboard.tasksEmpty')} className="dv-widget-tasks" />
  }
  return (
    <section className="dv-widget dv-widget-tasks">
      <header className="dv-widget-header">
        <h3>{t('dashboard.widgets.tasks')}</h3>
        <span className="dv-widget-count">{total}</span>
      </header>
      <div className="dv-widget-body">
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
        {noDate.length > 0 && (
          <Group label={t('dashboard.noDate')}>
            {noDate.slice(0, 6).map(task => (
              <TaskRow key={`${task.noteId}-${task.line}`} task={task} onClick={() => onTaskClick?.(task)} />
            ))}
            {noDate.length > 6 && (
              <div className="dv-group-more">{t('dashboard.moreTasks', { count: noDate.length - 6 })}</div>
            )}
          </Group>
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
        <span>{getDisplayTitle(task.noteTitle)}</span>
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
  if (items.length === 0) {
    return <CollapsedWidget label={t('dashboard.widgets.emails')} status={t('dashboard.emailsEmpty')} className="dv-widget-emails" />
  }
  return (
    <section className="dv-widget dv-widget-emails">
      <header className="dv-widget-header">
        <h3>{t('dashboard.widgets.emails')}</h3>
        <span className="dv-widget-count">{items.length}</span>
      </header>
      <div className="dv-widget-body">
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

  const radarSnapshot = React.useMemo(
    () => collectRadarSnapshot(notes, snapshot, t, previousScores),
    [notes, snapshot, t, previousScores]
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

  // Petrol redesign (Stage 2): leeres Radar kollabiert zur Einzeile (kein KI-Refresh nötig,
  // wenn es keine Notiz zu prüfen gibt).
  if (radarSnapshot.active.length === 0 && radarSnapshot.sleeping.length === 0) {
    return <CollapsedWidget label={t('dashboard.widgets.radar')} status={t('dashboard.radar.empty')} className="dv-widget-radar" />
  }

  return (
    <section className="dv-widget dv-widget-radar">
      <header className="dv-widget-header">
        <h3>{t('dashboard.widgets.radar')}</h3>
        <span className="dv-widget-count">{radarSnapshot.active.length}</span>
      </header>
      <div className="dv-widget-body">
        <div className="dv-list">
          {radarSnapshot.active.map(item => (
            <div
              key={item.note.id}
                className="dv-radar-row"
                role="button"
                tabIndex={0}
                onClick={() => onNoteClick(item.note.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNoteClick(item.note.id) } }}
              >
                <span className="dv-radar-score">{item.score}</span>
                {renderDelta(item.delta, item.isNew)}
                <span className="dv-radar-body">
                  <span className="dv-radar-title">{getCleanNoteTitle(item.note)}</span>
                  <span className="dv-radar-triggers">
                    {item.triggers.slice(0, 2).join(' · ')}
                  </span>
                </span>
                <span className="dv-radar-actions" onClick={event => event.stopPropagation()}>
                  <button
                    type="button"
                    className="dv-radar-action"
                    title={t('dashboard.radar.actionWebSearch')}
                    aria-label={t('dashboard.radar.actionWebSearch')}
                    onClick={() => {
                      // getCleanNoteTitle strippt bereits den Zettelkasten-ID-Präfix + Marker,
                      // sonst würde Google nach der ID statt nach dem Thema suchen.
                      const q = encodeURIComponent(getCleanNoteTitle(item.note))
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

  // Petrol redesign (Stage 2): leerer Kalender kollabiert zur Einzeile — der Permission-Fall
  // behält seine große Karte, weil er den „Zugriff erteilen"-Button braucht.
  if (!needsPermission && events.length === 0) {
    return <CollapsedWidget label={t('dashboard.widgets.calendar')} status={t('dashboard.calendarEmpty')} className="dv-widget-calendar" />
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

  const dueCount = overdueCount + todayTasksCount

  // Petrol redesign (Stage 2): Ist nichts fällig, kollabiert „Fokus heute" zu einem kompakten
  // Streifen (hohler Kreis + Label + eine Zeile + „N fällig") statt einer großen leeren Karte.
  if (focusTasks.length === 0) {
    return (
      <section className="dv-widget dv-focus dv-focus-collapsed">
        <div className="dv-focus-strip">
          <span className="dv-focus-strip-check" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          <div className="dv-focus-strip-text">
            <div className="dv-focus-strip-label">{t('dashboard.widgets.focus')}</div>
            <div className="dv-focus-strip-line">{narrative}</div>
          </div>
          <span className="dv-focus-strip-due">{t('dashboard.focus.dueCount', { count: dueCount })}</span>
        </div>
      </section>
    )
  }

  return (
    <section className="dv-widget dv-focus">
      <header className="dv-widget-header">
        <h3>{t('dashboard.widgets.focus')}</h3>
        <span className="dv-widget-count">{focusTasks.length}</span>
      </header>
      <div className="dv-widget-body">
        <p className="dv-focus-narrative">{narrative}</p>
        <div className="dv-list">
          {focusTasks.map(task => (
              <div key={`${task.noteId}-${task.line}`} className={`dv-focus-row reason-${task.reason}`}>
                <div className="dv-focus-row-body" onClick={() => onTaskClick(task)}>
                  <div className="dv-focus-text">{task.text}</div>
                  <div className="dv-focus-meta">
                    <span className={`dv-focus-badge reason-${task.reason}`}>
                      {t(`dashboard.focus.reason.${task.reason}` as never)}
                    </span>
                    <span>{getDisplayTitle(task.noteTitle)}</span>
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
          <div className="dv-modal-task-note">{getDisplayTitle(task.noteTitle)}</div>

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
  if (items.length === 0) {
    return <CollapsedWidget label={t('dashboard.widgets.bookings')} status={t('dashboard.bookingsEmpty')} className="dv-widget-bookings" />
  }
  return (
    <section className="dv-widget dv-widget-bookings">
      <header className="dv-widget-header">
        <h3>{t('dashboard.widgets.bookings')}</h3>
        <span className="dv-widget-count">{items.length}</span>
      </header>
      <div className="dv-widget-body">
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
      </div>
    </section>
  )
}
