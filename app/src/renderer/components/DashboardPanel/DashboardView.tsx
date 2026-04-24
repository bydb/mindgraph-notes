import React, { useEffect, useState, useCallback } from 'react'
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
import './DashboardView.css'

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string

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

  const loadSnapshot = useCallback(async () => {
    setIsLoading(true)
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
    setIsLoading(false)
  }, [notes, vaultPath, taskExcludedFolders, emails, loadDashboardOffers, dashboard.calendarDaysAhead])

  useEffect(() => {
    loadSnapshot()
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

const formatTime = (d: Date | string) => {
  const date = typeof d === 'string' ? new Date(d.replace(' ', 'T')) : d
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

const formatDate = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

const TasksWidget: React.FC<WidgetProps> = ({ snapshot, onTaskClick, t }) => {
  const { overdue, today, upcoming } = snapshot.tasks
  const total = overdue.length + today.length + upcoming.length
  return (
    <section className="dv-widget">
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
    <section className="dv-widget">
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
    <section className="dv-widget">
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
    <section className="dv-widget">
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
                <div className="dv-booking-meta">{item.offer.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
