import React, { useState, useCallback } from 'react'
import { useEmailStore } from '../../stores/emailStore'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { sanitizeHtml } from '../../utils/sanitize'

const isMac = window.electronAPI.platform === 'darwin'

interface InboxPanelProps {
  onClose: () => void
}

export const InboxPanel: React.FC<InboxPanelProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const { vaultPath } = useNotesStore()
  const {
    isFetching,
    isAnalyzing,
    fetchProgress,
    analysisProgress,
    activeFilter,
    getFilteredEmails,
    setFilter,
    fetchEmails,
    selectedEmailId,
    setSelectedEmail
  } = useEmailStore()
  const { email: emailSettings } = useUIStore()

  const emails = useEmailStore(state => state.emails)
  const [searchQuery, setSearchQuery] = useState('')
  const [reminderStatus, setReminderStatus] = useState<Record<number, 'loading' | 'success' | 'error'>>({})

  const filteredEmails = getFilteredEmails()

  // Suchfilter anwenden
  const displayEmails = searchQuery
    ? filteredEmails.filter(e =>
        e.from.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.from.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.subject.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : filteredEmails

  const selectedEmail = selectedEmailId
    ? emails.find(e => e.id === selectedEmailId)
    : null

  const handleRefresh = useCallback(async () => {
    if (!vaultPath || isFetching) return
    // Manueller Refresh = voller 30-Tage-Fetch
    await fetchEmails(vaultPath, true)
  }, [vaultPath, isFetching, fetchEmails])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Gestern'
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    }
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
  }

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return '#22c55e'
      case 'negative': return '#ef4444'
      case 'urgent': return '#f59e0b'
      default: return '#94a3b8'
    }
  }

  const getSentimentLabel = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return t('inbox.sentiment.positive')
      case 'negative': return t('inbox.sentiment.negative')
      case 'urgent': return t('inbox.sentiment.urgent')
      default: return t('inbox.sentiment.neutral')
    }
  }

  const handleCreateReminder = useCallback(async (action: Record<string, unknown> | string, index: number) => {
    if (!selectedEmail) return
    setReminderStatus(prev => ({ ...prev, [index]: 'loading' }))

    try {
      let title: string
      let dueDate: string | undefined
      let dueTime: string | undefined

      if (typeof action === 'object' && action !== null) {
        title = String(action.action || action.beschreibung || '')
        const rawDate = String(action.date || action.datum || '')
        const rawTime = String(action.time || action.uhrzeit || '')
        dueDate = rawDate.match(/^\d{4}-\d{2}-\d{2}$/) ? rawDate : undefined
        const timeMatch = rawTime.match(/(\d{1,2}:\d{2})/)
        dueTime = timeMatch ? timeMatch[1] : undefined
      } else {
        title = String(action)
        const isoMatch = title.match(/(\d{4}-\d{2}-\d{2})/)
        dueDate = isoMatch ? isoMatch[1] : undefined
        const timeMatch = title.match(/(\d{1,2}:\d{2})/)
        dueTime = timeMatch ? timeMatch[1] : undefined
      }

      const notes = `Von: ${selectedEmail.from.name || selectedEmail.from.address}\nBetreff: ${selectedEmail.subject}`

      const result = await window.electronAPI.createAppleReminder({
        title: title.substring(0, 200),
        notes,
        dueDate,
        dueTime
      })

      setReminderStatus(prev => ({ ...prev, [index]: result.success ? 'success' : 'error' }))
    } catch {
      setReminderStatus(prev => ({ ...prev, [index]: 'error' }))
    }
  }, [selectedEmail])

  // Detail-Ansicht
  if (selectedEmail) {
    return (
      <div className="inbox-panel">
        <div className="inbox-panel-header">
          <div className="inbox-panel-title">
            <button
              className="inbox-panel-close"
              onClick={() => setSelectedEmail(null)}
              title={t('inbox.detail.back')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span>{t('inbox.detail.back')}</span>
          </div>
          <button className="inbox-panel-close" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="inbox-panel-content">
          <div className="inbox-email-detail">
            <div className="inbox-email-detail-header">
              <h3>{selectedEmail.subject}</h3>
              <div className="inbox-email-detail-meta">
                <span className="inbox-email-from">{selectedEmail.from.name || selectedEmail.from.address}</span>
                <span className="inbox-email-date">{formatDate(selectedEmail.date)}</span>
              </div>
            </div>

            {selectedEmail.analysis && (() => {
              const criticalCategories = ['phishing', 'spam', 'scam', 'malware', 'betrug']
              const hasCritical = selectedEmail.analysis.categories.some(cat => {
                const catStr = (typeof cat === 'string' ? cat : String(cat)).toLowerCase()
                return criticalCategories.some(c => catStr.includes(c))
              })

              return (
                <div className={`inbox-email-analysis ${hasCritical ? 'inbox-analysis-critical' : ''}`}>
                  {hasCritical && (
                    <div className="inbox-critical-warning">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span>Kritisch — möglicher Phishing/Spam</span>
                    </div>
                  )}

                  <div className="inbox-analysis-row">
                    <span className="inbox-analysis-label">{t('inbox.detail.relevance')}</span>
                    <div className="inbox-analysis-value">
                      <div className="inbox-relevance-bar">
                        <div
                          className="inbox-relevance-fill"
                          style={{ width: `${selectedEmail.analysis.relevanceScore}%` }}
                        />
                      </div>
                      <span>{selectedEmail.analysis.relevanceScore}%</span>
                    </div>
                  </div>

                  <div className="inbox-analysis-row">
                    <span className="inbox-analysis-label">{t('inbox.detail.sentiment')}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="inbox-sentiment-dot" style={{ background: getSentimentColor(selectedEmail.analysis.sentiment) }} />
                      {getSentimentLabel(selectedEmail.analysis.sentiment)}
                    </span>
                  </div>

                  {selectedEmail.analysis.summary && (
                    <div className="inbox-analysis-section">
                      <h4>{t('inbox.detail.summary')}</h4>
                      <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(
                        selectedEmail.analysis.summary
                          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\*(.+?)\*/g, '<em>$1</em>')
                      ) }} />
                    </div>
                  )}

                  {selectedEmail.analysis.categories.length > 0 && (
                    <div className="inbox-analysis-row">
                      <span className="inbox-analysis-label">{t('inbox.detail.categories')}</span>
                      <div className="inbox-categories">
                        {selectedEmail.analysis.categories.map((cat, i) => {
                          const catStr = typeof cat === 'string' ? cat : String(cat)
                          const isCritical = criticalCategories.some(c => catStr.toLowerCase().includes(c))
                          return (
                            <span key={i} className={`inbox-category-tag ${isCritical ? 'inbox-category-critical' : ''}`}>{catStr}</span>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {selectedEmail.analysis.suggestedActions && selectedEmail.analysis.suggestedActions.length > 0 && (
                    <div className="inbox-analysis-section">
                      <h4>{t('inbox.detail.suggestedActions')}</h4>
                      <div className="inbox-actions-list">
                        {selectedEmail.analysis.suggestedActions.map((action, i) => {
                          const isObj = typeof action === 'object' && action !== null
                          const obj = isObj ? action as Record<string, unknown> : null
                          const text = obj ? String(obj.action || obj.beschreibung || '') : String(action)
                          const date = obj ? String(obj.date || obj.datum || '') : ''
                          const time = obj ? String(obj.time || obj.uhrzeit || '') : ''
                          const timeMatch = time.match(/(\d{1,2}:\d{2})/)
                          const status = reminderStatus[i]

                          if (!text || text === '{}') return null

                          return (
                            <div key={i} className="inbox-action-item">
                              <span className="inbox-action-text">{text}</span>
                              <div className="inbox-action-meta">
                                {date && date.match(/^\d{4}-\d{2}-\d{2}$/) && (
                                  <span className="inbox-action-date">
                                    {date}{timeMatch ? ` ${timeMatch[1]}` : ''}
                                  </span>
                                )}
                                {isMac && (
                                  <button
                                    className={`inbox-reminder-btn ${status || ''}`}
                                    onClick={() => handleCreateReminder(action, i)}
                                    disabled={status === 'loading' || status === 'success'}
                                    title={status === 'success' ? t('inbox.detail.reminderCreated') : status === 'error' ? t('inbox.detail.reminderFailed') : 'Apple Reminder'}
                                  >
                                    {status === 'loading' ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinning">
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                      </svg>
                                    ) : status === 'success' ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    ) : status === 'error' ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                      </svg>
                                    ) : (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                      </svg>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    )
  }

  // Listen-Ansicht
  return (
    <div className="inbox-panel">
      <div className="inbox-panel-header">
        <div className="inbox-panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <span>{t('inbox.title')}</span>
          {displayEmails.length > 0 && (
            <span className="inbox-count">{displayEmails.length}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="inbox-panel-close"
            onClick={handleRefresh}
            disabled={isFetching}
            title={t('inbox.refresh')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isFetching ? 'spinning' : ''}>
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </button>
          <button className="inbox-panel-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Experimental Warning */}
      <div className="inbox-experimental-warning">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>{t('inbox.experimentalWarning')}</span>
      </div>

      {/* Filter Bar */}
      <div className="inbox-filter-bar">
        <input
          type="text"
          className="inbox-search"
          placeholder={t('inbox.search')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <label className="inbox-filter-checkbox">
          <input
            type="checkbox"
            checked={activeFilter.onlyRelevant || false}
            onChange={e => setFilter({ onlyRelevant: e.target.checked })}
          />
          <span>{t('inbox.onlyRelevant')}</span>
        </label>
      </div>

      {/* Progress */}
      {isFetching && fetchProgress && (
        <div className="inbox-progress">
          <span>{fetchProgress.status}</span>
          {fetchProgress.total > 0 && (
            <div className="inbox-progress-bar">
              <div style={{ width: `${(fetchProgress.current / fetchProgress.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}
      {isAnalyzing && analysisProgress && (
        <div className="inbox-progress">
          <span>{t('inbox.analyzing')} {analysisProgress.current}/{analysisProgress.total}</span>
          <div className="inbox-progress-bar">
            <div style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Email List */}
      <div className="inbox-panel-content">
        {displayEmails.length === 0 ? (
          <div className="inbox-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <p>{emailSettings.accounts.length === 0 ? t('inbox.empty') : (activeFilter.onlyRelevant ? t('inbox.noRelevant') : t('inbox.empty'))}</p>
            <span>{emailSettings.accounts.length === 0 ? t('inbox.emptyHint') : (activeFilter.onlyRelevant ? t('inbox.noRelevantHint') : '')}</span>
          </div>
        ) : (
          <div className="inbox-list">
            {displayEmails.map(email => (
              <div
                key={email.id}
                className={`inbox-email-item ${!email.flags.includes('\\Seen') ? 'unread' : ''}`}
                onClick={() => setSelectedEmail(email.id)}
              >
                <div className="inbox-email-avatar">
                  {(email.from.name || email.from.address).charAt(0).toUpperCase()}
                </div>
                <div className="inbox-email-content">
                  <div className="inbox-email-top">
                    <span className="inbox-email-sender">
                      {email.from.name || email.from.address}
                    </span>
                    <span className="inbox-email-time">{formatDate(email.date)}</span>
                  </div>
                  <div className="inbox-email-subject">{email.subject}</div>
                  <div className="inbox-email-snippet">{email.snippet}</div>
                </div>
                {email.analysis && (
                  <span
                    className="inbox-sentiment-dot"
                    style={{ background: getSentimentColor(email.analysis.sentiment) }}
                    title={getSentimentLabel(email.analysis.sentiment)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
