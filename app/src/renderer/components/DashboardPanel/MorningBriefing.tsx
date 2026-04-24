import React, { useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useEmailStore } from '../../stores/emailStore'
import { useAgentStore } from '../../stores/agentStore'
import { useTranslation } from '../../utils/translations'
import { buildDashboardSnapshot, formatRelativeDay, type DashboardSnapshot } from '../../utils/dashboardData'
import './MorningBriefing.css'

interface MorningBriefingProps {
  onClose: () => void
  onOpenDashboard: () => void
}

export const MorningBriefing: React.FC<MorningBriefingProps> = ({ onClose, onOpenDashboard }) => {
  const { t } = useTranslation()
  const { notes, vaultPath } = useNotesStore()
  const { taskExcludedFolders, dashboard, setDashboard } = useUIStore()
  const emails = useEmailStore(state => state.emails)
  const loadDashboardOffers = useAgentStore(state => state.loadDashboard)

  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await loadDashboardOffers({ includeBookings: true })
      if (cancelled) return
      const latestOffers = useAgentStore.getState().dashboardOffers
      const snap = await buildDashboardSnapshot({
        notes,
        vaultPath,
        excludedFolders: taskExcludedFolders,
        emails,
        dashboardOffers: latestOffers,
        bookingsSinceIso: dashboard.lastBriefingDate
          ? `${dashboard.lastBriefingDate}T00:00:00.000Z`
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        calendarDaysAhead: dashboard.calendarDaysAhead,
        includeCalendar: dashboard.briefingIncludeCalendar
      })
      if (!cancelled) setSnapshot(snap)
    })()
    return () => { cancelled = true }
  }, [notes, vaultPath, taskExcludedFolders, emails, loadDashboardOffers, dashboard.lastBriefingDate, dashboard.calendarDaysAhead, dashboard.briefingIncludeCalendar])

  const markSeen = () => {
    const todayIso = new Date().toISOString().slice(0, 10)
    setDashboard({ lastBriefingDate: todayIso })
  }

  const handleClose = () => {
    markSeen()
    onClose()
  }

  const handleOpenDashboard = () => {
    markSeen()
    onOpenDashboard()
  }

  if (!snapshot) {
    return (
      <div className="briefing-overlay" onClick={handleClose}>
        <div className="briefing-modal" onClick={e => e.stopPropagation()}>
          <div className="briefing-loading">
            <div className="briefing-spinner"/>
          </div>
        </div>
      </div>
    )
  }

  const tasksTotal = snapshot.tasks.overdue.length + snapshot.tasks.today.length
  const emailsTotal = snapshot.emails.length
  const calendarToday = snapshot.calendar.filter(c => c.dayOffset === 0).length
  const bookingsTotal = snapshot.bookings.length

  const nothing = tasksTotal === 0 && emailsTotal === 0 && calendarToday === 0 && bookingsTotal === 0

  const formatTime = (iso: string) => {
    const d = new Date(iso.replace(' ', 'T'))
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <div className="briefing-overlay" onClick={handleClose}>
      <div className="briefing-modal" onClick={e => e.stopPropagation()}>
        <button className="briefing-close" onClick={handleClose} aria-label="close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <header className="briefing-header">
          <h1>{t('briefing.title')}</h1>
          <p className="briefing-date">{dateStr}</p>
          <p className="briefing-subtitle">{t('briefing.subtitle')}</p>
        </header>

        <div className="briefing-body">
          {nothing ? (
            <p className="briefing-empty">{t('briefing.nothingToday')}</p>
          ) : (
            <div className="briefing-grid">
              {tasksTotal > 0 && (
                <div className="briefing-card tasks">
                  <div className="briefing-card-value">{tasksTotal}</div>
                  <div className="briefing-card-label">
                    {t('briefing.tasksSummary', { count: tasksTotal, overdue: snapshot.tasks.overdue.length })}
                  </div>
                  <ul className="briefing-card-list">
                    {snapshot.tasks.overdue.slice(0, 2).map(task => (
                      <li key={`${task.noteId}-${task.line}`} className="overdue">{task.text}</li>
                    ))}
                    {snapshot.tasks.today.slice(0, 3).map(task => (
                      <li key={`${task.noteId}-${task.line}`}>{task.text}</li>
                    ))}
                  </ul>
                </div>
              )}

              {emailsTotal > 0 && (
                <div className="briefing-card emails">
                  <div className="briefing-card-value">{emailsTotal}</div>
                  <div className="briefing-card-label">{t('briefing.emailsSummary', { count: emailsTotal })}</div>
                  <ul className="briefing-card-list">
                    {snapshot.emails.slice(0, 3).map(item => (
                      <li key={item.email.id}>
                        <strong>{item.email.from.name || item.email.from.address}</strong> — {item.email.subject}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {calendarToday > 0 && (
                <div className="briefing-card calendar">
                  <div className="briefing-card-value">{calendarToday}</div>
                  <div className="briefing-card-label">{t('briefing.calendarSummary', { count: calendarToday })}</div>
                  <ul className="briefing-card-list">
                    {snapshot.calendar.filter(c => c.dayOffset === 0).slice(0, 4).map((item, i) => (
                      <li key={i}>
                        <strong>{item.event.allDay ? formatRelativeDay(0, t) : formatTime(item.event.startDate)}</strong> — {item.event.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {bookingsTotal > 0 && (
                <div className="briefing-card bookings">
                  <div className="briefing-card-value">{bookingsTotal}</div>
                  <div className="briefing-card-label">{t('briefing.bookingsSummary', { count: bookingsTotal })}</div>
                  <ul className="briefing-card-list">
                    {snapshot.bookings.slice(0, 3).map(item => (
                      <li key={item.booking.id}>
                        <strong>{item.booking.userName || item.booking.userEmail}</strong> → {item.offer.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="briefing-footer">
          <button className="briefing-btn-secondary" onClick={handleClose}>{t('briefing.close')}</button>
          <button className="briefing-btn-primary" onClick={handleOpenDashboard}>{t('briefing.openDashboard')}</button>
        </footer>
      </div>
    </div>
  )
}
