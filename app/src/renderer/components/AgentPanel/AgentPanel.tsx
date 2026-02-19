import React from 'react'
import { useAgentStore } from '../../stores/agentStore'
import { useTranslation } from '../../utils/translations'
import type { EdooboxEvent } from '../../../shared/types'

interface AgentPanelProps {
  onClose: () => void
}

const StatusBadge: React.FC<{ status: EdooboxEvent['status'] }> = ({ status }) => {
  const { t } = useTranslation()
  const label = t(`agent.status.${status}`)
  return <span className={`agent-status-badge agent-status-${status}`}>{label}</span>
}

const EventDetail: React.FC<{ event: EdooboxEvent; onBack: () => void }> = ({ event, onBack }) => {
  const { t } = useTranslation()
  const { pushEvent, isPushing, deleteEvent } = useAgentStore()

  return (
    <div className="agent-event-detail">
      <button className="agent-back-btn" onClick={onBack}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
        </svg>
        {t('agent.detail.back')}
      </button>

      <div className="agent-detail-header">
        <h3>{event.title || 'Ohne Titel'}</h3>
        <StatusBadge status={event.status} />
      </div>

      {event.description && (
        <div className="agent-detail-section">
          <p className="agent-detail-description">{event.description}</p>
        </div>
      )}

      {event.dates.length > 0 && (
        <div className="agent-detail-section">
          <label>{t('agent.detail.dates')}</label>
          {event.dates.map((d, i) => (
            <div key={i} className="agent-date-item">
              {d.date} &middot; {d.startTime}–{d.endTime}
            </div>
          ))}
        </div>
      )}

      {event.speakers.length > 0 && (
        <div className="agent-detail-section">
          <label>{t('agent.detail.speakers')}</label>
          {event.speakers.map((s, i) => (
            <div key={i}>{s.name}{s.role ? ` (${s.role})` : ''}</div>
          ))}
        </div>
      )}

      {event.location && (
        <div className="agent-detail-section">
          <label>{t('agent.detail.location')}</label>
          <div>{event.location}</div>
        </div>
      )}

      {event.maxParticipants && (
        <div className="agent-detail-section">
          <label>{t('agent.detail.participants')}</label>
          <div>{event.maxParticipants}</div>
        </div>
      )}

      {event.price !== undefined && event.price !== null && (
        <div className="agent-detail-section">
          <label>{t('agent.detail.price')}</label>
          <div>{event.price} &euro;</div>
        </div>
      )}

      {event.contact && (
        <div className="agent-detail-section">
          <label>{t('agent.detail.contact')}</label>
          <div>{event.contact}</div>
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

      {event.error && (
        <div className="agent-error">{event.error}</div>
      )}

      <div className="agent-detail-actions">
        {event.status !== 'pushed' && (
          <button
            className="agent-push-btn"
            onClick={() => pushEvent(event.id)}
            disabled={isPushing}
          >
            {isPushing ? t('agent.pushing') : t('agent.push')}
          </button>
        )}
        <button
          className="agent-delete-btn"
          onClick={() => { deleteEvent(event.id); onBack() }}
        >
          {t('agent.delete')}
        </button>
      </div>
    </div>
  )
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const { events, isImporting, selectedEventId, setSelectedEventId, parseFormular } = useAgentStore()

  const selectedEvent = selectedEventId ? events.find(e => e.id === selectedEventId) : null

  if (selectedEvent) {
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
          <button className="agent-panel-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="agent-panel-content">
          <EventDetail event={selectedEvent} onBack={() => setSelectedEventId(null)} />
        </div>
      </div>
    )
  }

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
          {events.length > 0 && <span className="agent-count">{events.length}</span>}
        </div>
        <div className="agent-panel-actions">
          <button
            className="agent-import-btn"
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
          <button className="agent-panel-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="agent-panel-content">
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
              <button
                key={event.id}
                className="agent-event-item"
                onClick={() => setSelectedEventId(event.id)}
              >
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
      </div>
    </div>
  )
}
