import React, { useState, useEffect, useCallback } from 'react'
import { useAgentStore } from '../../stores/agentStore'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import type { EdooboxEvent, EdooboxEventDate, EdooboxOfferDashboard, AttendanceListData, AttendanceParticipant } from '../../../shared/types'

const MAX_ATTENDANCE_PARTICIPANTS = 100
const MAX_ATTENDANCE_DATES = 8

function splitFullName(full: string): { name: string; vorname: string } {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { name: '', vorname: '' }
  if (parts.length === 1) return { name: parts[0], vorname: '' }
  return { name: parts[parts.length - 1], vorname: parts.slice(0, -1).join(' ') }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Teilnehmerliste'
}

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
  const edooboxBaseUrl = useUIStore(s => s.edoobox.baseUrl)
  const edooboxApiVersion = useUIStore(s => s.edoobox.apiVersion)
  const [expanded, setExpanded] = useState(false)
  const [loadingBookings, setLoadingBookings] = useState(false)
  const [generatingList, setGeneratingList] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const handleExpand = useCallback(async () => {
    if (!expanded && offer.bookings.length === 0 && offer.bookingCount > 0) {
      setLoadingBookings(true)
      await loadBookingsForOffer(offer.id)
      setLoadingBookings(false)
    }
    setExpanded(!expanded)
  }, [expanded, offer.id, offer.bookings.length, offer.bookingCount, loadBookingsForOffer])

  const handleDownloadAttendanceList = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    setListError(null)
    setGeneratingList(true)
    try {
      // Immer frisch nachladen, damit neue Felder (Schule/Personalnummer) sicher
      // aktuell sind und kein Cache aus älteren Sessions verwendet wird.
      await loadBookingsForOffer(offer.id)
      const refreshed = useAgentStore.getState().dashboardOffers.find(o => o.id === offer.id)
      let bookings = refreshed?.bookings || offer.bookings
      if (bookings.length > MAX_ATTENDANCE_PARTICIPANTS) {
        setListError(t('agent.attendanceList.tooMany', { max: String(MAX_ATTENDANCE_PARTICIPANTS), count: String(bookings.length) }))
        return
      }

      let dates: string[] = []
      const datesResult = await window.electronAPI.edooboxListDates(edooboxBaseUrl, edooboxApiVersion, offer.id)
      if (datesResult.success && datesResult.dates && datesResult.dates.length > 0) {
        dates = datesResult.dates.slice(0, MAX_ATTENDANCE_DATES).map(d => d.date)
      } else if (offer.dateStart) {
        dates = [offer.dateStart]
      }

      const participants: AttendanceParticipant[] = bookings
        .map(b => {
          const { name, vorname } = splitFullName(b.userName)
          return { name, vorname, personalNr: b.personalNr, schule: b.schule }
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))

      const data: AttendanceListData = {
        title: offer.name,
        location: offer.location,
        laNr: offer.number,
        akkrNr: '',
        dates,
        participants
      }

      const fileName = `Teilnehmerliste - ${sanitizeFileName(offer.name)}.docx`
      const result = await window.electronAPI.attendanceListGenerate(data, fileName)
      if (!result.success && !result.canceled) {
        setListError(result.error || t('agent.attendanceList.generateFailed'))
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : t('agent.attendanceList.generateFailed'))
    } finally {
      setGeneratingList(false)
    }
  }, [offer, loadBookingsForOffer, edooboxBaseUrl, edooboxApiVersion, t])

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
          <div className="agent-dashboard-actions">
            <button
              type="button"
              className="agent-dashboard-action-btn"
              onClick={handleDownloadAttendanceList}
              disabled={generatingList || loadingBookings}
              title={t('agent.attendanceList.download')}
            >
              {generatingList ? (
                <svg className="spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
              <span>{t('agent.attendanceList.download')}</span>
            </button>
          </div>
          {listError && <div className="agent-dashboard-action-error">{listError}</div>}
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
          onClick={() => loadDashboard()}
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

// ---- Marketing View ----

const MarketingOfferCard: React.FC<{ offer: EdooboxOfferDashboard; onSelect: () => void }> = ({ offer, onSelect }) => {
  const { marketingPublishStatus } = useAgentStore()
  const status = marketingPublishStatus[offer.id]

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <button className="agent-marketing-card" onClick={onSelect}>
      <div className="agent-marketing-card-body">
        <div className="agent-marketing-card-title">{offer.name}</div>
        <div className="agent-marketing-card-meta">
          {offer.dateStart && <span>{formatDate(offer.dateStart)}</span>}
          {offer.location && <span>{offer.location}</span>}
          {offer.number && <span>{offer.number}</span>}
        </div>
        <div className="agent-marketing-card-status">
          {status?.wordpress && (
            <span className="agent-marketing-badge wp" title={status.wordpress.postUrl}>WP</span>
          )}
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  )
}

const MarketingPublishDetail: React.FC<{ offer: EdooboxOfferDashboard; onBack: () => void }> = ({ offer, onBack }) => {
  const { t } = useTranslation()
  const {
    generatedBlogPost, generatedIgCaption, isGenerating, isPublishing,
    generateContent, setGeneratedBlogPost, setGeneratedIgCaption,
    publishToWordpress, selectImage, generateImage, isGeneratingImage,
    selectedImagePath, imagePreviewDataUrl, imageGeneratedInfo, marketingPublishStatus
  } = useAgentStore()
  const marketing = useUIStore(s => s.marketing)
  const edooboxBaseUrl = useUIStore(s => s.edoobox.baseUrl)
  const status = marketingPublishStatus[offer.id]
  const [bookingUrl, setBookingUrl] = useState(
    offer.epHash ? `${edooboxBaseUrl.replace(/\/$/, '')}/ed/${offer.epHash}` : ''
  )

  const handleGenerate = useCallback(() => {
    generateContent(offer, bookingUrl || undefined)
  }, [offer, bookingUrl, generateContent])

  const handlePublishWp = useCallback(async () => {
    if (!generatedBlogPost) return
    await publishToWordpress(offer.id, offer.name, generatedBlogPost)
  }, [offer.id, offer.name, generatedBlogPost, publishToWordpress])

  const [igCopied, setIgCopied] = useState(false)
  const handleCopyIgCaption = useCallback(() => {
    if (!generatedIgCaption) return
    navigator.clipboard.writeText(generatedIgCaption)
    setIgCopied(true)
    setTimeout(() => setIgCopied(false), 2000)
  }, [generatedIgCaption])

  return (
    <div className="agent-marketing-detail">
      <button className="agent-back-btn" onClick={onBack}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
        </svg>
        {t('agent.detail.back')}
      </button>

      <h3 className="agent-marketing-detail-title">{offer.name}</h3>

      <div className="agent-marketing-link-input">
        <label>{t('agent.marketing.bookingUrl')}</label>
        <input
          type="url"
          value={bookingUrl}
          onChange={e => setBookingUrl(e.target.value)}
          placeholder="https://..."
          className="agent-marketing-url-field"
        />
      </div>

      <button
        className="agent-marketing-generate-btn"
        onClick={handleGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <>
            <svg className="spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {t('agent.marketing.generating')}
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            {t('agent.marketing.generate')}
          </>
        )}
      </button>

      {/* Bild-Sektion (für WP Featured Image + IG) */}
      {(generatedBlogPost || generatedIgCaption) && (
        <div className="agent-marketing-section">
          <div className="agent-marketing-section-header">
            <label>{t('agent.marketing.image')}</label>
          </div>
          <div className="agent-marketing-image-row">
            <button className="agent-marketing-image-btn" onClick={selectImage}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              {selectedImagePath ? selectedImagePath.split('/').pop() : t('agent.marketing.selectImage')}
            </button>
            {marketing.googleImagenApiKey && (
              <button
                className="agent-marketing-image-btn"
                onClick={() => generateImage(offer)}
                disabled={isGeneratingImage}
              >
                {isGeneratingImage ? (
                  <svg className="spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                  </svg>
                )}
                {t('agent.marketing.generateImage')}
              </button>
            )}
          </div>
          {imagePreviewDataUrl && (
            <div className="agent-marketing-image-preview">
              <img src={imagePreviewDataUrl} alt="Preview" />
              {imageGeneratedInfo && (
                <div className="agent-marketing-image-info">{imageGeneratedInfo}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* WordPress Section */}
      {generatedBlogPost && (
        <div className="agent-marketing-section">
          <div className="agent-marketing-section-header">
            <label>{t('agent.marketing.wordpress')}</label>
            {status?.wordpress && (
              <a className="agent-marketing-link" href={status.wordpress.postUrl} target="_blank" rel="noreferrer">
                {status.wordpress.status === 'draft' ? t('agent.marketing.draft') : t('agent.marketing.published')}
              </a>
            )}
          </div>
          <textarea
            className="agent-marketing-textarea"
            value={generatedBlogPost}
            onChange={e => setGeneratedBlogPost(e.target.value)}
            rows={8}
          />
          <button
            className="agent-marketing-publish-btn wp"
            onClick={handlePublishWp}
            disabled={isPublishing || !marketing.wordpressUrl}
          >
            {isPublishing ? t('agent.marketing.publishing') : t('agent.marketing.publishWp')}
          </button>
        </div>
      )}

      {/* Instagram Caption (Copy & Paste) */}
      {generatedIgCaption && (
        <div className="agent-marketing-section">
          <div className="agent-marketing-section-header">
            <label>{t('agent.marketing.instagram')}</label>
          </div>
          <textarea
            className="agent-marketing-textarea"
            value={generatedIgCaption}
            onChange={e => setGeneratedIgCaption(e.target.value)}
            rows={6}
          />
          <button
            className="agent-marketing-publish-btn ig"
            onClick={handleCopyIgCaption}
          >
            {igCopied ? t('agent.marketing.copied') : t('agent.marketing.copyCaption')}
          </button>
        </div>
      )}
    </div>
  )
}

const MarketingView: React.FC = () => {
  const { t } = useTranslation()
  const {
    marketingOffers, isMarketingLoading, loadMarketingOffers,
    selectedMarketingOfferId, setSelectedMarketingOfferId
  } = useAgentStore()

  useEffect(() => {
    loadMarketingOffers()
  }, [loadMarketingOffers])

  const selectedOffer = selectedMarketingOfferId
    ? marketingOffers.find(o => o.id === selectedMarketingOfferId)
    : null

  if (selectedOffer) {
    return <MarketingPublishDetail offer={selectedOffer} onBack={() => setSelectedMarketingOfferId(null)} />
  }

  return (
    <div className="agent-marketing">
      <div className="agent-marketing-header">
        <span className="agent-marketing-header-title">{t('agent.marketing.title')}</span>
        <button
          className="agent-dashboard-refresh"
          onClick={loadMarketingOffers}
          disabled={isMarketingLoading}
          title={t('agent.dashboard.refresh')}
        >
          <svg
            className={isMarketingLoading ? 'spinning' : ''}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </button>
      </div>

      {isMarketingLoading && marketingOffers.length === 0 ? (
        <div className="agent-dashboard-empty">
          <svg className="spinning" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <p>{t('agent.dashboard.loading')}</p>
        </div>
      ) : marketingOffers.length === 0 ? (
        <div className="agent-dashboard-empty">
          <p>{t('agent.marketing.noOffers')}</p>
        </div>
      ) : (
        <div className="agent-marketing-list">
          {marketingOffers.map(offer => (
            <MarketingOfferCard
              key={offer.id}
              offer={offer}
              onSelect={() => setSelectedMarketingOfferId(offer.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- IQ-Auswertung View ----

const IqOfferCard: React.FC<{ offer: EdooboxOfferDashboard; onSelect: () => void }> = ({ offer, onSelect }) => {
  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  return (
    <button className="agent-marketing-card" onClick={onSelect}>
      <div className="agent-marketing-card-body">
        <div className="agent-marketing-card-title">{offer.name}</div>
        <div className="agent-marketing-card-meta">
          {offer.dateStart && <span>{formatDate(offer.dateStart)}</span>}
          {offer.location && <span>{offer.location}</span>}
          {offer.number && <span>LA-Nr. {offer.number}</span>}
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  )
}

const IqReportDetail: React.FC<{ offer: EdooboxOfferDashboard; onBack: () => void }> = ({ offer, onBack }) => {
  const { t } = useTranslation()
  const { iqForm, updateIqForm, generateIqReport, isGeneratingIq, iqLastFilePath } = useAgentStore()

  const toLocalDT = (iso?: string): string => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const fromLocalDT = (v: string): string | undefined => {
    if (!v) return undefined
    const d = new Date(v)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }

  return (
    <div className="agent-event-detail">
      <button className="agent-back-btn" onClick={onBack}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
        </svg>
        {t('agent.detail.back')}
      </button>

      <div className="agent-detail-header">
        <h3>{offer.name}</h3>
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.iq.fieldTitle')}</label>
        <input
          className="agent-edit-input"
          value={iqForm.title || ''}
          onChange={e => updateIqForm({ title: e.target.value })}
        />
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.iq.fieldStart')}</label>
        <div className="agent-date-edit">
          <input
            type="datetime-local"
            value={toLocalDT(iqForm.dateStart)}
            onChange={e => updateIqForm({ dateStart: fromLocalDT(e.target.value) })}
          />
          <span>–</span>
          <input
            type="datetime-local"
            value={toLocalDT(iqForm.dateEnd)}
            onChange={e => updateIqForm({ dateEnd: fromLocalDT(e.target.value) })}
          />
        </div>
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.iq.fieldLocation')}</label>
        <input
          className="agent-edit-input"
          value={iqForm.location || ''}
          onChange={e => updateIqForm({ location: e.target.value })}
        />
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.iq.fieldLaNr')}</label>
        <input
          className="agent-edit-input"
          value={iqForm.laNr || ''}
          onChange={e => updateIqForm({ laNr: e.target.value })}
          placeholder="z.B. 0261694101"
        />
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.iq.fieldVeranstaltungsNr')}</label>
        <input
          className="agent-edit-input"
          value={iqForm.veranstaltungsNr || ''}
          onChange={e => updateIqForm({ veranstaltungsNr: e.target.value })}
          placeholder="optional"
        />
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.iq.fieldCountTotal')}</label>
        <input
          className="agent-edit-input"
          type="number"
          min={0}
          value={iqForm.countTotal ?? 0}
          onChange={e => updateIqForm({ countTotal: parseInt(e.target.value, 10) || 0 })}
        />
        <div className="agent-iq-hint">{t('agent.iq.teachersNote')}</div>
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.iq.fieldCountPrincipals')}</label>
        <input
          className="agent-edit-input"
          type="number"
          min={0}
          value={iqForm.countPrincipals ?? 0}
          onChange={e => updateIqForm({ countPrincipals: parseInt(e.target.value, 10) || 0 })}
        />
      </div>

      <div className="agent-detail-section">
        <label>{t('agent.iq.evaluationInstruments')}</label>
        <label className="agent-iq-checkbox">
          <input type="checkbox" checked={iqForm.checkFragebogen ?? true} onChange={e => updateIqForm({ checkFragebogen: e.target.checked })} />
          <span>{t('agent.iq.instrFragebogen')}</span>
        </label>
        <label className="agent-iq-checkbox">
          <input type="checkbox" checked={iqForm.checkZielscheibe ?? false} onChange={e => updateIqForm({ checkZielscheibe: e.target.checked })} />
          <span>{t('agent.iq.instrZielscheibe')}</span>
        </label>
        <label className="agent-iq-checkbox">
          <input type="checkbox" checked={iqForm.checkPositionieren ?? false} onChange={e => updateIqForm({ checkPositionieren: e.target.checked })} />
          <span>{t('agent.iq.instrPositionieren')}</span>
        </label>
        <label className="agent-iq-checkbox">
          <input type="checkbox" checked={iqForm.checkMuendlich ?? false} onChange={e => updateIqForm({ checkMuendlich: e.target.checked })} />
          <span>{t('agent.iq.instrMuendlich')}</span>
        </label>
        <label className="agent-iq-checkbox">
          <input type="checkbox" checked={iqForm.checkSonstiges ?? false} onChange={e => updateIqForm({ checkSonstiges: e.target.checked })} />
          <span>{t('agent.iq.instrSonstiges')}</span>
        </label>
      </div>

      <div className="agent-detail-section">
        <label className="agent-iq-checkbox">
          <input type="checkbox" checked={iqForm.checkDokumentiert ?? true} onChange={e => updateIqForm({ checkDokumentiert: e.target.checked })} />
          <span>{t('agent.iq.checkDokumentiert')}</span>
        </label>
      </div>

      <div className="agent-detail-actions">
        <button
          className="agent-push-btn"
          onClick={generateIqReport}
          disabled={isGeneratingIq}
        >
          {isGeneratingIq ? t('agent.iq.generating') : t('agent.iq.download')}
        </button>
      </div>

      {iqLastFilePath && (
        <div className="agent-iq-success">
          {t('agent.iq.saved')}: {iqLastFilePath}
        </div>
      )}
    </div>
  )
}

const IqView: React.FC = () => {
  const { t } = useTranslation()
  const { iqOffers, isIqLoading, loadIqOffers, selectedIqOfferId, selectIqOffer } = useAgentStore()

  useEffect(() => {
    loadIqOffers()
  }, [loadIqOffers])

  const selectedOffer = selectedIqOfferId ? iqOffers.find(o => o.id === selectedIqOfferId) : null

  if (selectedOffer) {
    return <IqReportDetail offer={selectedOffer} onBack={() => selectIqOffer(null)} />
  }

  return (
    <div className="agent-marketing">
      <div className="agent-marketing-header">
        <span className="agent-marketing-header-title">{t('agent.iq.title')}</span>
        <button
          className="agent-dashboard-refresh"
          onClick={loadIqOffers}
          disabled={isIqLoading}
          title={t('agent.dashboard.refresh')}
        >
          <svg
            className={isIqLoading ? 'spinning' : ''}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </button>
      </div>

      {isIqLoading && iqOffers.length === 0 ? (
        <div className="agent-dashboard-empty">
          <svg className="spinning" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <p>{t('agent.dashboard.loading')}</p>
        </div>
      ) : iqOffers.length === 0 ? (
        <div className="agent-dashboard-empty">
          <p>{t('agent.iq.noOffers')}</p>
        </div>
      ) : (
        <div className="agent-marketing-list">
          {iqOffers.map(offer => (
            <IqOfferCard key={offer.id} offer={offer} onSelect={() => selectIqOffer(offer.id)} />
          ))}
        </div>
      )}
    </div>
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
        <button
          className={`agent-tab ${dashboardView === 'marketing' ? 'active' : ''}`}
          onClick={() => setDashboardView('marketing')}
        >
          {t('agent.tab.marketing')}
        </button>
        <button
          className={`agent-tab ${dashboardView === 'iq' ? 'active' : ''}`}
          onClick={() => setDashboardView('iq')}
        >
          {t('agent.tab.iq')}
        </button>
      </div>

      <div className="agent-panel-content">
        {dashboardView === 'events' ? <EventsView />
          : dashboardView === 'dashboard' ? <DashboardView />
          : dashboardView === 'marketing' ? <MarketingView />
          : <IqView />}
      </div>
    </div>
  )
}
