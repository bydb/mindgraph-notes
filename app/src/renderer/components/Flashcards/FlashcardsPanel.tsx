import React, { useEffect, useMemo, useState } from 'react'
import { useFlashcardStore, getDaysUntilReview, type FlashcardFilter } from '../../stores/flashcardStore'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { FlashcardStats } from './FlashcardStats'
import type { Flashcard } from '../../../shared/types'

interface FlashcardsPanelProps {
  onClose: () => void
}

interface GroupedCards {
  [topic: string]: Flashcard[]
}

export const FlashcardsPanel: React.FC<FlashcardsPanelProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const { vaultPath } = useNotesStore()

  const {
    flashcards,
    activeFilter,
    setFilter,
    getFilteredCards,
    getStats,
    loadFlashcards,
    saveFlashcards,
    loadStudyStats,
    startStudySession,
    setEditingCard,
    setCreatingCard,
    getDueCards,
    addFlashcards
  } = useFlashcardStore()

  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ count: number; decks: string[] } | null>(null)

  // Load flashcards and study stats when vault changes
  useEffect(() => {
    if (vaultPath) {
      loadFlashcards(vaultPath)
      loadStudyStats(vaultPath)
    }
  }, [vaultPath, loadFlashcards, loadStudyStats])

  const stats = useMemo(() => getStats(), [flashcards])
  const filteredCards = useMemo(() => getFilteredCards(), [flashcards, activeFilter])
  const dueCards = useMemo(() => getDueCards(), [flashcards])

  // Gruppiere Karten nach Thema
  const groupedCards = useMemo(() => {
    const groups: GroupedCards = {}
    for (const card of filteredCards) {
      const topic = card.topic || t('flashcards.noTopic')
      if (!groups[topic]) {
        groups[topic] = []
      }
      groups[topic].push(card)
    }
    // Sortiere Themen alphabetisch
    const sortedGroups: GroupedCards = {}
    Object.keys(groups).sort((a, b) => a.localeCompare(b)).forEach(key => {
      sortedGroups[key] = groups[key]
    })
    return sortedGroups
  }, [filteredCards, t])

  // State für aufgeklappte Themen (alle standardmäßig offen)
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())

  // Initialisiere expandedTopics wenn sich die Themen ändern
  useEffect(() => {
    setExpandedTopics(new Set(Object.keys(groupedCards)))
  }, [Object.keys(groupedCards).join(',')])

  const toggleTopic = (topic: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev)
      if (next.has(topic)) {
        next.delete(topic)
      } else {
        next.add(topic)
      }
      return next
    })
  }

  // Zähle fällige Karten pro Thema
  const getDueCountForTopic = (cards: Flashcard[]): number => {
    return cards.filter(card => {
      if (card.status !== 'active') return false
      if (!card.nextReview) return true
      return new Date(card.nextReview) <= new Date()
    }).length
  }

  const handleCardClick = (card: Flashcard) => {
    setEditingCard(card)
  }

  const handleStartStudy = () => {
    if (dueCards.length > 0) {
      startStudySession(dueCards)
    }
  }

  const handleImportAnki = async () => {
    if (!vaultPath || isImporting) return
    setIsImporting(true)

    try {
      const result = await window.electronAPI.importAnki(vaultPath)

      if (result.success && result.cards) {
        addFlashcards(result.cards)
        await saveFlashcards(vaultPath)
        setImportResult({ count: result.cardCount!, decks: result.deckNames! })
        setTimeout(() => setImportResult(null), 5000)
      } else if (result.error) {
        console.error('[AnkiImport] Error:', result.error)
      }
    } catch (error) {
      console.error('[AnkiImport] Failed:', error)
    } finally {
      setIsImporting(false)
    }
  }

  const getCardStatus = (card: Flashcard): string => {
    if (card.status === 'pending') return t('flashcards.statusPending')
    if (card.status === 'suspended') return t('flashcards.statusSuspended')

    const days = getDaysUntilReview(card)
    if (days === null) return t('flashcards.statusNew')
    if (days <= 0) return t('flashcards.statusDue')
    if (days === 1) return t('flashcards.inDays', { days: 1 })
    return t('flashcards.inDays', { days })
  }

  const filters: { key: FlashcardFilter; label: string; count?: number }[] = [
    { key: 'all', label: t('flashcards.filterAll') },
    { key: 'due', label: t('flashcards.filterDue'), count: stats.due },
    { key: 'pending', label: t('flashcards.filterPending'), count: stats.pending },
    { key: 'suspended', label: t('flashcards.filterSuspended') },
    { key: 'stats', label: t('flashcards.filterStats') }
  ]

  return (
    <div className="flashcards-panel">
      <div className="flashcards-panel-header">
        <div className="flashcards-panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M10 4v4" />
            <path d="M14 4v4" />
          </svg>
          <span>{t('flashcards.title')}</span>
          {stats.total > 0 && (
            <span className="flashcards-panel-count">{stats.total}</span>
          )}
        </div>
        <button
          className="flashcards-add-btn"
          onClick={handleImportAnki}
          disabled={isImporting}
          title={t('flashcards.importAnki')}
        >
          {isImporting ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinning">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
        </button>
        <button
          className="flashcards-add-btn"
          onClick={() => setCreatingCard(true)}
          title={t('flashcards.createCard')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button className="flashcards-panel-close" onClick={onClose} title={t('panel.close')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flashcards-filters">
        {filters.map(({ key, label, count }) => (
          <button
            key={key}
            className={`flashcards-filter-btn ${activeFilter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className="flashcards-filter-badge">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Import Success Notification */}
      {importResult && (
        <div className="flashcards-import-success">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{t('flashcards.importSuccess', { count: importResult.count })}</span>
          <button onClick={() => setImportResult(null)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Stats View or Card List */}
      {activeFilter === 'stats' ? (
        <div className="flashcards-list">
          <FlashcardStats />
        </div>
      ) : (
        <>
          {/* Card List - Grouped by Topic */}
          <div className="flashcards-list">
            {filteredCards.length === 0 ? (
              <div className="flashcards-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M10 4v4" />
                  <path d="M14 4v4" />
                </svg>
                <p>{t('flashcards.noCards')}</p>
                {activeFilter !== 'all' && (
                  <button
                    className="flashcards-show-all-btn"
                    onClick={() => setFilter('all')}
                  >
                    {t('flashcards.showAll')}
                  </button>
                )}
              </div>
            ) : (
              Object.entries(groupedCards).map(([topic, cards]) => {
                const isExpanded = expandedTopics.has(topic)
                const dueCount = getDueCountForTopic(cards)
                return (
                  <div key={topic} className="flashcards-topic-group">
                    <button
                      className="flashcards-topic-header"
                      onClick={() => toggleTopic(topic)}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        className={`flashcards-topic-chevron ${isExpanded ? 'expanded' : ''}`}
                      >
                        <path
                          d="M4.5 2.5L8 6L4.5 9.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="flashcards-topic-name">{topic}</span>
                      <span className="flashcards-topic-count">{cards.length}</span>
                      {dueCount > 0 && (
                        <span className="flashcards-topic-due">{dueCount} {t('flashcards.due')}</span>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="flashcards-topic-cards">
                        {cards.map((card) => (
                          <div
                            key={card.id}
                            className={`flashcards-card-item ${card.status}`}
                            onClick={() => handleCardClick(card)}
                          >
                            <div className="flashcards-card-content">
                              <div className="flashcards-card-front">
                                {card.front.length > 80 ? card.front.slice(0, 80) + '...' : card.front}
                              </div>
                              <div className="flashcards-card-meta">
                                <span className="flashcards-card-source">
                                  {card.sourceNote.split('/').pop()?.replace('.md', '')}
                                </span>
                                <span className={`flashcards-card-status status-${card.status}`}>
                                  {getCardStatus(card)}
                                </span>
                              </div>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Study Button */}
          {dueCards.length > 0 && (
            <div className="flashcards-panel-footer">
              <button
                className="flashcards-study-btn"
                onClick={handleStartStudy}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                {t('flashcards.startStudy', { count: dueCards.length })}
              </button>
            </div>
          )}

          {/* Activate Pending Cards Button */}
          {stats.pending > 0 && activeFilter === 'pending' && (
            <div className="flashcards-panel-footer">
              <p className="flashcards-pending-hint">
                {t('flashcards.pendingHint')}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
