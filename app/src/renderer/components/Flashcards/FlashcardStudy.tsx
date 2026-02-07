import React, { useEffect, useCallback } from 'react'
import { useFlashcardStore, getPreviewInterval, type ReviewQuality } from '../../stores/flashcardStore'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { MarkdownContent } from './MarkdownContent'

export const FlashcardStudy: React.FC = () => {
  const { t } = useTranslation()
  const { vaultPath } = useNotesStore()

  const {
    isStudying,
    studyQueue,
    currentStudyIndex,
    isFlipped,
    flipCard,
    rateCard,
    endStudySession,
    saveFlashcards,
    saveStudyStats
  } = useFlashcardStore()

  const currentCard = studyQueue[currentStudyIndex]
  const progress = {
    current: currentStudyIndex + 1,
    total: studyQueue.length
  }

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isStudying) return

    if (e.key === 'Escape') {
      endStudySession()
      if (vaultPath) {
        saveFlashcards(vaultPath)
        saveStudyStats(vaultPath)
      }
      return
    }

    if (!isFlipped) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        flipCard()
      }
    } else {
      // Rating shortcuts
      if (e.key === '1') rateCard(0) // Again
      if (e.key === '2') rateCard(1) // Hard
      if (e.key === '3') rateCard(2) // Good
      if (e.key === '4') rateCard(3) // Easy
    }
  }, [isStudying, isFlipped, flipCard, rateCard, endStudySession, saveFlashcards, saveStudyStats, vaultPath])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Save progress when session ends
  useEffect(() => {
    return () => {
      if (vaultPath) {
        saveFlashcards(vaultPath)
        saveStudyStats(vaultPath)
      }
    }
  }, [vaultPath, saveFlashcards, saveStudyStats])

  const handleRate = (quality: ReviewQuality) => {
    rateCard(quality)
    // Save after each rating
    if (vaultPath) {
      setTimeout(() => {
        saveFlashcards(vaultPath)
        saveStudyStats(vaultPath)
      }, 100)
    }
  }

  const handleClose = () => {
    endStudySession()
    if (vaultPath) {
      saveFlashcards(vaultPath)
      saveStudyStats(vaultPath)
    }
  }

  if (!isStudying || !currentCard) return null

  const ratingButtons: { quality: ReviewQuality; label: string; colorClass: string }[] = [
    { quality: 0, label: t('flashcards.rateAgain'), colorClass: 'again' },
    { quality: 1, label: t('flashcards.rateHard'), colorClass: 'hard' },
    { quality: 2, label: t('flashcards.rateGood'), colorClass: 'good' },
    { quality: 3, label: t('flashcards.rateEasy'), colorClass: 'easy' }
  ]

  return (
    <div className="flashcard-study-backdrop" onClick={handleClose}>
      <div className="flashcard-study-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flashcard-study-header">
          <div className="flashcard-study-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span>{t('flashcards.studyTitle')}</span>
          </div>
          <div className="flashcard-study-progress">
            <span>{progress.current}/{progress.total}</span>
            <div className="flashcard-study-progress-bar">
              <div
                className="flashcard-study-progress-fill"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
          <button className="flashcard-study-close" onClick={handleClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Card Content - Scrollable */}
        <div className="flashcard-study-content">
          {/* Question Section */}
          <div className="flashcard-study-question-section">
            <div className="flashcard-study-card-topic">{currentCard.topic}</div>
            <div className="flashcard-study-label">{t('flashcards.front')}</div>
            <MarkdownContent content={currentCard.front} className="flashcard-study-card-text" />
          </div>

          {/* Answer Section - only show when flipped */}
          {isFlipped ? (
            <div className="flashcard-study-answer-section">
              <div className="flashcard-study-label">{t('flashcards.back')}</div>
              <MarkdownContent content={currentCard.back} className="flashcard-study-answer" />
            </div>
          ) : (
            <button className="flashcard-show-answer-btn" onClick={flipCard}>
              {t('flashcards.showAnswer')}
              <span className="flashcard-shortcut">Space</span>
            </button>
          )}

          {/* Rating Buttons - only show when flipped */}
          {isFlipped && (
            <div className="flashcard-rating-section">
              <p className="flashcard-rating-prompt">{t('flashcards.ratePrompt')}</p>
              <div className="flashcard-rating-buttons">
                {ratingButtons.map(({ quality, label, colorClass }) => (
                  <button
                    key={quality}
                    className={`flashcard-rating-btn ${colorClass}`}
                    onClick={() => handleRate(quality)}
                  >
                    <span className="flashcard-rating-label">{label}</span>
                    <span className="flashcard-rating-interval">
                      {getPreviewInterval(quality, currentCard)}d
                    </span>
                    <span className="flashcard-rating-key">{quality + 1}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer with source */}
        <div className="flashcard-study-footer">
          <span className="flashcard-study-source">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {currentCard.sourceNote.split('/').pop()?.replace('.md', '')}
          </span>
        </div>
      </div>
    </div>
  )
}
