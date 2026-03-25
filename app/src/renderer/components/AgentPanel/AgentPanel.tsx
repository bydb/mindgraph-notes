import React, { useState, useEffect, useCallback } from 'react'
import { useAgentStore } from '../../stores/agentStore'
import { useTranslation } from '../../utils/translations'
import type { EdooboxEvent, EdooboxEventDate, EdooboxOfferDashboard } from '../../../shared/types'

const edooboxLogoUrl = new URL('../../assets/edoobox-logo.png', import.meta.url).href

interface AgentPanelProps {
  onClose: () => void
}

const StatusBadge: React.FC<{ status: EdooboxEvent['status'] }> = ({ status }) => {
  const { t } = useTranslation()
  const label = t(`agent.status.${status}`)
  return <span className={`agent-status-badge agent-status-${status}`}>{label}</span>
}

// ---- Dashboard View ----

const OccupancyBadge: React.FC<{ booked: number; max: number }> = ({ booked, max }) => {
  const percent = max > 0 ? Math.min(1, booked / max) : 0
  const color = percent >= 0.9 ? '#ef4444' : percent >= 0.6 ? '#f59e0b' : 'var(--accent-color)'
  // Small ring, 28px
  const size = 28
  const sw = 3
  const radius = (size - sw) / 2
  const circumference = 2 * Math.PI * radius
  const filled = circumference * percent

  return (
    <div className="agent-dashboard-occupancy">
      <svg className="agent-dashboard-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-color)" strokeWidth={sw} />
        {max > 0 && filled > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={sw}
            strokeDasharray={`${filled} ${circumference - filled}`}
            strokeDashoffset={circumference / 4}
            strokeLinecap="round"
          />
        )}
      </svg>
      <span className="agent-dashboard-occupancy-text">
        <strong>{booked}</strong><span>/{max || '∞'}</span>
      </span>
    </div>
  )
}

const DashboardOfferCard: React.FC<{ offer: EdooboxOfferDashboard }> = ({ offer }) => {
  const { t } = useTranslation()
  const { loadBookingsForOffer } = useAgentStore()
  const [expanded, setExpanded] = useState(false)
  const [loadingBookings, setLoadingBookings] = useState(false)

  const handleExpand = useCallback(async () => {
    if (!expanded && offer.bookings.length === 0 && offer.bookingCount > 0) {
      setLoadingBookings(true)
      await loadBookingsForOffer(offer.id)
      setLoadingBookings(false)
    }
    setExpanded(!expanded)
  }, [expanded, offer.id, offer.bookings.length, offer.bookingCount, loadBookingsForOffer])

  const occupancyPercent = offer.maxParticipants > 0
    ? Math.min(100, Math.round((offer.bookingCount / offer.maxParticipants) * 100))
    : 0

  const freePlaces = offer.maxParticipants > 0
    ? offer.maxParticipants - offer.bookingCount
    : null

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const newBookings = offer.bookings.filter(b => b.bookedAt > sevenDaysAgo)

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={`agent-dashboard-card ${expanded ? 'expanded' : ''}`}>
      <button className="agent-dashboard-card-header" onClick={handleExpand}>
        <div className="agent-dashboard-card-body">
          <div className="agent-dashboard-card-title">{offer.name}</div>
          <div className="agent-dashboard-card-meta">
            {offer.dateStart && (
              <span>{formatDate(offer.dateStart)} {formatTime(offer.dateStart)}</span>
            )}
            {offer.number && <span>{offer.number}</span>}
            {newBookings.length > 0 && (
              <span className="agent-dashboard-new-badge">+{newBookings.length} neu</span>
            )}
          </div>
        </div>
        <OccupancyBadge booked={offer.bookingCount} max={offer.maxParticipants} />
        <svg
          className={`agent-dashboard-chevron ${expanded ? 'expanded' : ''}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="agent-dashboard-bookings">
          {loadingBookings ? (
            <div className="agent-dashboard-loading-bookings">
              <svg className="spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
          ) : offer.bookings.length === 0 ? (
            <div className="agent-dashboard-no-bookings">{t('agent.dashboard.noBookings')}</div>
          ) : (
            <>
              <div className="agent-dashboard-bookings-header">
                <span>{t('agent.dashboard.participants')}</span>
                <span>{offer.bookings.length}</span>
              </div>
              <div className="agent-dashboard-bookings-list">
              {offer.bookings.map(booking => {
                const isNew = booking.bookedAt > sevenDaysAgo
                return (
                  <div key={booking.id} className={`agent-dashboard-booking ${isNew ? 'is-new' : ''}`}>
                    <div className="agent-dashboard-booking-avatar">
                      {booking.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="agent-dashboard-booking-info">
                      <div className="agent-dashboard-booking-name">
                        {booking.userName}
                        {isNew && <span className="agent-dashboard-dot" />}
                      </div>
                      <div className="agent-dashboard-booking-email">{booking.userEmail}</div>
                    </div>
                    <div className="agent-dashboard-booking-date">
                      {new Date(booking.bookedAt).toLocaleDateString('de-DE')}
                    </div>
                  </div>
                )
              })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const DashboardView: React.FC = () => {
  const { t } = useTranslation()
  const { dashboardOffers, isDashboardLoading, loadDashboard } = useAgentStore()

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  return (
    <div className="agent-dashboard">
      <div className="agent-dashboard-header">
        <img src={edooboxLogoUrl} alt="edoobox" className="agent-dashboard-logo" />
        <button
          className="agent-dashboard-refresh"
          onClick={loadDashboard}
          disabled={isDashboardLoading}
          title={t('agent.dashboard.refresh')}
        >
          <svg
            className={isDashboardLoading ? 'spinning' : ''}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </button>
      </div>

      {isDashboardLoading && dashboardOffers.length === 0 ? (
        <div className="agent-dashboard-empty">
          <svg className="spinning" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <p>{t('agent.dashboard.loading')}</p>
        </div>
      ) : dashboardOffers.length === 0 ? (
        <div className="agent-dashboard-empty">
          <p>{t('agent.dashboard.noOffers')}</p>
        </div>
      ) : (
        <div className="agent-dashboard-list">
          {dashboardOffers.map(offer => (
            <DashboardOfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Event Detail View (existing) ----

const EventDetail: React.FC<{ event: EdooboxEvent; onBack: () => void }> = ({ event, onBack }) => {
  const { t } = useTranslation()
  const { pushEvent, isPushing, deleteEvent, updateEvent, categories, loadCategories } = useAgentStore()
  const [editing, setEditing] = useState(event.status === 'imported')
  const [title, setTitle] = useState(event.title)
  const [description, setDescription] = useState(event.description)
  const [location, setLocation] = useState(event.location || '')
  const [maxParticipants, setMaxParticipants] = useState(event.maxParticipants?.toString() || '')
  const [price, setPrice] = useState(event.price?.toString() || '')
  const [contact, setContact] = useState(event.contact || '')
  const [category, setCategory] = useState(
    event.category?.startsWith('category_') ? event.category : ''
  )
  const [dates, setDates] = useState<EdooboxEventDate[]>(event.dates)

  useEffect(() => {
    if (categories.length === 0) {
      loadCategories()
    }
  }, [categories.length, loadCategories])

  const handleSave = useCallback(async () => {
    await updateEvent(event.id, {
      title,
      description,
      location: location || undefined,
      maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : undefined,
      price: price ? parseFloat(price) : undefined,
      contact: contact || undefined,
      category: category || undefined,
      dates
    })
    setEditing(false)
  }, [event.id, title, description, location, maxParticipants, price, contact, category, dates, updateEvent])

  const handleDateChange = useCallback((index: number, field: keyof EdooboxEventDate, value: string) => {
    setDates(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d))
  }, [])

  const addDate = useCallback(() => {
    setDates(prev => [...prev, { date: new Date().toISOString().split('T')[0], startTime: '09:00', endTime: '17:00' }])
  }, [])

  const removeDate = useCallback((index: number) => {
    setDates(prev => prev.filter((_, i) => i !== index))
  }, [])

  const canEdit = event.status === 'imported'

  return (
    <div className="agent-event-detail">
      <button className="agent-back-btn" onClick={onBack} title={t('panel.back')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
        </svg>
        {t('agent.detail.back')}
      </button>

      <div className="agent-detail-header">
        {editing ? (
          <input className="agent-edit-input agent-edit-title" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('agent.detail.titlePlaceholder') || 'Titel'} />
        ) : (
          <h3>{event.title || 'Ohne Titel'}</h3>
        )}
        <StatusBadge status={event.status} />
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.detail.description') || 'Beschreibung'}</label>
        {editing ? (
          <textarea className="agent-edit-textarea" value={description} onChange={e => setDescription(e.target.value)} rows={4} />
        ) : (
          event.description && <p className="agent-detail-description">{event.description}</p>
        )}
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.detail.category') || 'Kategorie'}</label>
        {editing ? (
          <select className="agent-edit-select" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">{t('agent.detail.selectCategory') || '— Kategorie wählen —'}</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <div>{categories.find(c => c.id === event.category)?.name || event.category || '—'}</div>
        )}
      </div>

      <div className="agent-detail-section">
        <div className="agent-detail-section-header">
          <label>{t('agent.detail.dates')}</label>
          {editing && (
            <button className="agent-add-btn" onClick={addDate} title="Termin hinzufügen">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
        </div>
        {dates.map((d, i) => (
          <div key={i} className="agent-date-item">
            {editing ? (
              <div className="agent-date-edit">
                <input type="date" value={d.date} onChange={e => handleDateChange(i, 'date', e.target.value)} />
                <input type="time" value={d.startTime} onChange={e => handleDateChange(i, 'startTime', e.target.value)} />
                <span>–</span>
                <input type="time" value={d.endTime} onChange={e => handleDateChange(i, 'endTime', e.target.value)} />
                {dates.length > 1 && (
                  <button className="agent-remove-btn" onClick={() => removeDate(i)} title="Entfernen">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <>{d.date} &middot; {d.startTime}–{d.endTime}</>
            )}
          </div>
        ))}
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.detail.location')}</label>
        {editing ? (
          <input className="agent-edit-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Ort" />
        ) : (
          event.location && <div>{event.location}</div>
        )}
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.detail.participants')}</label>
        {editing ? (
          <input className="agent-edit-input" type="number" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} placeholder="Max. Teilnehmer" />
        ) : (
          event.maxParticipants && <div>{event.maxParticipants}</div>
        )}
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.detail.price')}</label>
        {editing ? (
          <input className="agent-edit-input" type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="Preis in €" />
        ) : (
          event.price !== undefined && event.price !== null && <div>{event.price} &euro;</div>
        )}
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.detail.contact')}</label>
        {editing ? (
          <input className="agent-edit-input" value={contact} onChange={e => setContact(e.target.value)} placeholder="Kontakt" />
        ) : (
          event.contact && <div>{event.contact}</div>
        )}
      </div>

      {event.speakers.length > 0 && (
        <div className="agent-detail-section">
          <label>{t('agent.detail.speakers')}</label>
          {event.speakers.map((s, i) => (
            <div key={i}>{s.name}{s.role ? ` (${s.role})` : ''}</div>
          ))}
        </div>
      )}

      {event.sourceFile && (
        <div className="agent-detail-section">
          <label>{t('agent.detail.source')}</label>
          <div className="agent-source-file">{event.sourceFile}</div>
        </div>
      )}

      {event.warnings && event.warnings.length > 0 && event.status === 'imported' && (
        <div className="agent-warnings">
          <label>{t('agent.importWarnings')}</label>
          {event.warnings.map((w, i) => (
            <div key={i} className="agent-warning-item">{w}</div>
          ))}
        </div>
      )}

      {event.error && <div className="agent-error">{event.error}</div>}

      <div className="agent-detail-actions">
        {canEdit && editing && (
          <button className="agent-save-btn" onClick={handleSave}>{t('agent.save') || 'Speichern'}</button>
        )}
        {canEdit && !editing && (
          <button className="agent-edit-btn" onClick={() => setEditing(true)}>{t('agent.edit') || 'Bearbeiten'}</button>
        )}
        {event.status !== 'pushed' && (
          <button className="agent-push-btn" onClick={() => pushEvent(event.id)} disabled={isPushing || !category} title={!category ? 'Bitte zuerst eine Kategorie wählen' : ''}>
            {isPushing ? t('agent.pushing') : t('agent.push')}
          </button>
        )}
        <button className="agent-delete-btn" onClick={() => { deleteEvent(event.id); onBack() }}>{t('agent.delete')}</button>
      </div>
    </div>
  )
}

// ---- Events View (existing) ----

const EventsView: React.FC = () => {
  const { t } = useTranslation()
  const { events, selectedEventId, setSelectedEventId } = useAgentStore()

  const selectedEvent = selectedEventId ? events.find(e => e.id === selectedEventId) : null

  if (selectedEvent) {
    return <EventDetail event={selectedEvent} onBack={() => setSelectedEventId(null)} />
  }

  return (
    <>
      {events.length === 0 ? (
        <div className="agent-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <p>{t('agent.empty')}</p>
          <p className="agent-empty-hint">{t('agent.emptyHint')}</p>
        </div>
      ) : (
        <div className="agent-event-list">
          {events.map(event => (
            <button key={event.id} className="agent-event-item" onClick={() => setSelectedEventId(event.id)}>
              <div className="agent-event-item-main">
                <div className="agent-event-item-title">{event.title || 'Ohne Titel'}</div>
                <div className="agent-event-item-meta">
                  {event.dates[0]?.date}
                  {event.location ? ` · ${event.location}` : ''}
                </div>
              </div>
              <StatusBadge status={event.status} />
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// ---- Main Panel ----

export const AgentPanel: React.FC<AgentPanelProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const { dashboardView, setDashboardView, isImporting, parseFormular } = useAgentStore()

  return (
    <div className="agent-panel">
      <div className="agent-panel-header">
        <div className="agent-panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {t('agent.title')}
        </div>
        <div className="agent-panel-header-actions">
          {dashboardView === 'events' && (
            <button
              className="agent-header-icon-btn"
              onClick={parseFormular}
              disabled={isImporting}
              title={t('agent.import')}
            >
              {isImporting ? (
                <svg className="spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
            </button>
          )}
          <button className="agent-panel-close" onClick={onClose} title={t('panel.close')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="agent-tab-switcher">
        <button
          className={`agent-tab ${dashboardView === 'events' ? 'active' : ''}`}
          onClick={() => setDashboardView('events')}
        >
          {t('agent.tab.events')}
        </button>
        <button
          className={`agent-tab ${dashboardView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setDashboardView('dashboard')}
        >
          {t('agent.tab.dashboard')}
        </button>
      </div>

      <div className="agent-panel-content">
        {dashboardView === 'events' ? <EventsView /> : <DashboardView />}
      </div>
    </div>
  )
}
