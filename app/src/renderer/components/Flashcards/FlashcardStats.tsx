import React, { useMemo } from 'react'
import { useFlashcardStore } from '../../stores/flashcardStore'
import { useTranslation } from '../../utils/translations'

export const FlashcardStats: React.FC = () => {
  const { t } = useTranslation()
  const {
    flashcards,
    studyDays,
    dailyReviews,
    getStreakStats,
    getProgressStats,
    getHeatmapData,
    getUpcomingReviews
  } = useFlashcardStore()

  const streakStats = useMemo(() => getStreakStats(), [studyDays])
  const progressStats = useMemo(() => getProgressStats(), [flashcards, dailyReviews])
  const heatmapData = useMemo(() => getHeatmapData(), [dailyReviews])
  const upcomingReviews = useMemo(() => getUpcomingReviews(), [flashcards])

  const hasData = studyDays.size > 0 || flashcards.length > 0

  if (!hasData) {
    return (
      <div className="flashcard-stats-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M7 16l4-8 4 4 4-6" />
        </svg>
        <p className="flashcard-stats-empty-title">{t('flashcards.stats.noData')}</p>
        <p className="flashcard-stats-empty-hint">{t('flashcards.stats.noDataHint')}</p>
      </div>
    )
  }

  // Heatmap: organize into columns (weeks), rows are days of week (Mon=0 ... Sun=6)
  const heatmapWeeks: Array<Array<{ date: string; level: number; count: number } | null>> = []
  for (let col = 0; col < 12; col++) {
    const week: Array<{ date: string; level: number; count: number } | null> = []
    for (let row = 0; row < 7; row++) {
      const idx = col * 7 + row
      week.push(idx < heatmapData.length ? heatmapData[idx] : null)
    }
    heatmapWeeks.push(week)
  }

  const maxUpcoming = Math.max(...upcomingReviews.map((r) => r.count), 1)

  return (
    <div className="flashcard-stats">
      {/* Streak Hero */}
      <div className="flashcard-stats-streak">
        <div className="flashcard-stats-streak-hero">
          <span className="flashcard-stats-streak-icon">
            {streakStats.currentStreak > 0 ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2c.5 3.5 2 6 3.5 7.5S19 13 19 16a7 7 0 1 1-14 0c0-3 1.5-5.5 3-7S11.5 5.5 12 2z" />
              </svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2c.5 3.5 2 6 3.5 7.5S19 13 19 16a7 7 0 1 1-14 0c0-3 1.5-5.5 3-7S11.5 5.5 12 2z" />
              </svg>
            )}
          </span>
          <span className="flashcard-stats-streak-number">{streakStats.currentStreak}</span>
          <span className="flashcard-stats-streak-label">{t('flashcards.stats.currentStreak')}</span>
        </div>
        <div className="flashcard-stats-streak-details">
          <div className="flashcard-stats-streak-detail">
            <span className="flashcard-stats-streak-detail-value">{streakStats.longestStreak}</span>
            <span className="flashcard-stats-streak-detail-label">{t('flashcards.stats.longestStreak')}</span>
          </div>
          <div className="flashcard-stats-streak-detail">
            <span className="flashcard-stats-streak-detail-value">{streakStats.totalStudyDays}</span>
            <span className="flashcard-stats-streak-detail-label">{t('flashcards.stats.totalDays')}</span>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="flashcard-stats-section">
        <h3 className="flashcard-stats-section-title">{t('flashcards.stats.activity')}</h3>
        <div className="flashcard-stats-heatmap">
          <div className="flashcard-stats-heatmap-labels">
            <span></span>
            <span>Mo</span>
            <span></span>
            <span>Mi</span>
            <span></span>
            <span>Fr</span>
            <span></span>
          </div>
          <div className="flashcard-stats-heatmap-grid">
            {heatmapWeeks.map((week, colIdx) => (
              <div key={colIdx} className="flashcard-stats-heatmap-col">
                {week.map((cell, rowIdx) => (
                  <div
                    key={rowIdx}
                    className={`flashcard-stats-heatmap-cell level-${cell?.level ?? 0}`}
                    title={cell ? `${cell.date}: ${cell.count} ${t('flashcards.stats.reviews')}` : ''}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flashcard-stats-heatmap-legend">
          <span>{t('flashcards.stats.less')}</span>
          <div className="flashcard-stats-heatmap-cell level-0" />
          <div className="flashcard-stats-heatmap-cell level-1" />
          <div className="flashcard-stats-heatmap-cell level-2" />
          <div className="flashcard-stats-heatmap-cell level-3" />
          <div className="flashcard-stats-heatmap-cell level-4" />
          <span>{t('flashcards.stats.more')}</span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="flashcard-stats-section">
        <div className="flashcard-stats-grid">
          <div className="flashcard-stats-card">
            <span className="flashcard-stats-card-value">{progressStats.totalCards}</span>
            <span className="flashcard-stats-card-label">{t('flashcards.stats.totalCards')}</span>
          </div>
          <div className="flashcard-stats-card">
            <span className="flashcard-stats-card-value">{progressStats.activeCards}</span>
            <span className="flashcard-stats-card-label">{t('flashcards.stats.activeCards')}</span>
          </div>
          <div className="flashcard-stats-card">
            <span className="flashcard-stats-card-value">{progressStats.reviewedToday}</span>
            <span className="flashcard-stats-card-label">{t('flashcards.stats.reviewedToday')}</span>
          </div>
          <div className="flashcard-stats-card">
            <span className="flashcard-stats-card-value">{progressStats.correctToday}</span>
            <span className="flashcard-stats-card-label">{t('flashcards.stats.correctToday')}</span>
          </div>
          <div className="flashcard-stats-card">
            <span className="flashcard-stats-card-value">{progressStats.matureCards}</span>
            <span className="flashcard-stats-card-label">{t('flashcards.stats.matureCards')}</span>
          </div>
          <div className="flashcard-stats-card">
            <span className="flashcard-stats-card-value">{progressStats.averageEase}</span>
            <span className="flashcard-stats-card-label">{t('flashcards.stats.averageEase')}</span>
          </div>
        </div>
      </div>

      {/* Upcoming Reviews */}
      <div className="flashcard-stats-section">
        <h3 className="flashcard-stats-section-title">{t('flashcards.stats.upcoming')}</h3>
        <div className="flashcard-stats-upcoming">
          {upcomingReviews.map(({ label, count }, i) => (
            <div key={i} className="flashcard-stats-upcoming-bar">
              <div className="flashcard-stats-upcoming-fill-wrapper">
                <div
                  className="flashcard-stats-upcoming-fill"
                  style={{ height: `${Math.max(count > 0 ? 15 : 0, (count / maxUpcoming) * 100)}%` }}
                />
              </div>
              <span className="flashcard-stats-upcoming-count">{count}</span>
              <span className="flashcard-stats-upcoming-label">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
