import React, { useEffect, useCallback, useRef, useState } from 'react'
import { useQuizStore } from '../../stores/quizStore'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useFlashcardStore, createFlashcardFromQuiz } from '../../stores/flashcardStore'
import { useTranslation } from '../../utils/translations'
import { MarkdownContent } from '../Flashcards/MarkdownContent'

export const QuizModal: React.FC = () => {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    phase,
    currentSession,
    currentQuestionIndex,
    currentAnswer,
    generationProgress,
    currentFeedback,
    finalAnalysis,
    errorMessage,
    setCurrentAnswer,
    setPhase,
    setQuestions,
    addResult,
    setCurrentFeedback,
    nextQuestion,
    setFinalAnalysis,
    setGenerationProgress,
    setError,
    resetQuiz,
    quizConfig,
    updateTopicProgress
  } = useQuizStore()

  const { ollama } = useUIStore()
  const { notes, vaultPath, selectNote } = useNotesStore()
  const { addFlashcards, saveFlashcards, setPanel: setFlashcardsPanel } = useFlashcardStore()
  const [flashcardsSaved, setFlashcardsSaved] = useState(false)

  // Fragen generieren wenn Quiz gestartet wird
  useEffect(() => {
    if (phase === 'generating' && quizConfig) {
      generateQuestions()
    }
  }, [phase, quizConfig])

  // Auto-focus auf Textarea wenn Quiz-Phase aktiv
  useEffect(() => {
    if (phase === 'quiz' && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [phase, currentQuestionIndex])

  const generateQuestions = async () => {
    if (!quizConfig || !ollama.selectedModel) {
      resetQuiz()
      return
    }

    try {
      setGenerationProgress({ current: 0, total: 1, status: t('quiz.generatingQuestions') })

      // Inhalt sammeln basierend auf sourceType
      let content = ''
      let sourcePath = quizConfig.sourcePath

      if (quizConfig.sourceType === 'file') {
        // Content direkt von Datei laden (lazy loading im Store)
        const fullPath = `${vaultPath}/${sourcePath}`
        try {
          content = await window.electronAPI.readFile(fullPath)
        } catch (err) {
          console.error('[Quiz] Failed to load file:', err)
        }
      } else {
        // Ordner: alle Notizen im Ordner sammeln
        const folderNotes = notes.filter(n =>
          n.path.startsWith(quizConfig.sourcePath + '/') ||
          n.path === quizConfig.sourcePath
        )

        // Content für alle Notizen laden
        const contents: string[] = []
        for (const note of folderNotes.slice(0, 20)) { // Max 20 Notizen
          try {
            const fullPath = `${vaultPath}/${note.path}`
            const noteContent = await window.electronAPI.readFile(fullPath)
            if (noteContent) {
              contents.push(`# ${note.title}\n\n${noteContent}`)
            }
          } catch (err) {
            console.error('[Quiz] Failed to load note:', note.path, err)
          }
        }
        content = contents.join('\n\n---\n\n').slice(0, 30000)
      }

      if (!content.trim()) {
        console.error('[Quiz] No content found')
        resetQuiz()
        return
      }

      const result = await window.electronAPI.quizGenerateQuestions(
        ollama.selectedModel,
        content,
        quizConfig.questionCount,
        sourcePath
      )

      if (result.success && result.questions && result.questions.length > 0) {
        setQuestions(result.questions)
        setGenerationProgress(null)
      } else {
        console.error('[Quiz] Failed to generate questions:', result.error)
        setError(result.error || t('quiz.generationError'))
      }
    } catch (error) {
      console.error('[Quiz] Error generating questions:', error)
      setError(error instanceof Error ? error.message : t('quiz.generationError'))
    }
  }

  const handleSubmitAnswer = async () => {
    if (!currentSession || !ollama.selectedModel) return

    const question = currentSession.questions[currentQuestionIndex]
    if (!question) return

    setPhase('feedback')

    try {
      const result = await window.electronAPI.quizEvaluateAnswer(
        ollama.selectedModel,
        question.question,
        question.expectedAnswer,
        currentAnswer
      )

      if (result.success) {
        const quizResult = {
          questionId: question.id,
          userAnswer: currentAnswer,
          score: result.score || 0,
          feedback: result.feedback || '',
          correct: result.correct || false
        }

        addResult(quizResult)
        setCurrentFeedback({
          score: quizResult.score,
          feedback: quizResult.feedback,
          correct: quizResult.correct
        })

        // Learning Progress aktualisieren
        updateTopicProgress(question.sourceFile, question.topic, quizResult.correct)
      } else {
        // Fehler bei Bewertung - trotzdem Feedback zeigen
        setCurrentFeedback({
          score: 0,
          feedback: t('quiz.evaluationError'),
          correct: false
        })
      }
    } catch (error) {
      console.error('[Quiz] Error evaluating answer:', error)
      setCurrentFeedback({
        score: 0,
        feedback: t('quiz.evaluationError'),
        correct: false
      })
    }
  }

  const handleNextQuestion = async () => {
    const isLastQuestion = currentQuestionIndex >= (currentSession?.questions.length || 0) - 1

    if (isLastQuestion) {
      // Quiz beenden und analysieren
      setPhase('results')

      if (currentSession && ollama.selectedModel) {
        try {
          const result = await window.electronAPI.quizAnalyzeResults(
            ollama.selectedModel,
            currentSession.results,
            currentSession.questions
          )

          if (result.success && result.analysis) {
            setFinalAnalysis(result.analysis)
          }
        } catch (error) {
          console.error('[Quiz] Error analyzing results:', error)
        }
      }
    } else {
      nextQuestion()
    }
  }

  const handleSkip = () => {
    if (!currentSession) return

    const question = currentSession.questions[currentQuestionIndex]
    if (!question) return

    // Übersprungene Frage als falsch werten
    const quizResult = {
      questionId: question.id,
      userAnswer: '',
      score: 0,
      feedback: t('quiz.skipped'),
      correct: false
    }

    addResult(quizResult)
    updateTopicProgress(question.sourceFile, question.topic, false)
    handleNextQuestion()
  }

  const handleOpenNote = (filePath: string) => {
    const note = notes.find(n => n.path === filePath)
    if (note) {
      selectNote(note.id)
      resetQuiz()
    }
  }

  const handleSaveAsFlashcards = async () => {
    if (!currentSession || !vaultPath) return

    // Vault-Name als Fallback
    const vaultName = vaultPath.split('/').pop() || 'Flashcards'

    // Create flashcards from quiz questions
    // Topic = Ordnername (erster Teil des Pfades, oder sourceFile selbst wenn es ein Ordner ist)
    const flashcards = currentSession.questions.map((q) => {
      const pathParts = q.sourceFile.split('/')
      let topic: string

      if (pathParts.length > 1) {
        // Datei in Unterordner: verwende Ordnername
        topic = pathParts[0]
      } else if (!q.sourceFile.endsWith('.md')) {
        // Kein .md am Ende = wahrscheinlich ein Ordner als Quelle
        topic = q.sourceFile
      } else {
        // Einzelne .md Datei im Root: verwende Vault-Name
        topic = vaultName
      }

      return createFlashcardFromQuiz(
        q.question,
        q.expectedAnswer,
        topic,
        q.sourceFile
      )
    })

    // Add to store and save
    addFlashcards(flashcards)
    await saveFlashcards(vaultPath)
    setFlashcardsSaved(true)

    // Open flashcards panel after a short delay
    setTimeout(() => {
      setFlashcardsPanel(true)
    }, 500)
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (phase === 'quiz' && currentAnswer.trim()) {
        handleSubmitAnswer()
      } else if (phase === 'feedback') {
        handleNextQuestion()
      }
    }
    if (e.key === 'Escape') {
      resetQuiz()
    }
  }, [phase, currentAnswer])

  // Reset flashcardsSaved state when quiz resets
  useEffect(() => {
    if (phase === 'idle') {
      setFlashcardsSaved(false)
    }
  }, [phase])

  // Nicht rendern wenn kein Quiz aktiv
  if (phase === 'idle') return null

  const currentQuestion = currentSession?.questions[currentQuestionIndex]
  const progress = {
    current: currentQuestionIndex + 1,
    total: currentSession?.questions.length || 0
  }

  return (
    <div className="quiz-modal-backdrop" onClick={() => resetQuiz()}>
      <div
        className="quiz-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="quiz-modal-header">
          <div className="quiz-modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span>{t('quiz.title')}</span>
          </div>
          {phase === 'quiz' || phase === 'feedback' ? (
            <div className="quiz-modal-progress">
              <span>{progress.current}/{progress.total}</span>
              <div className="quiz-progress-bar">
                <div
                  className="quiz-progress-fill"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : null}
          <button className="quiz-modal-close" onClick={() => resetQuiz()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="quiz-modal-content">
          {/* Generating Phase */}
          {phase === 'generating' && (
            <div className="quiz-generating">
              <div className="quiz-spinner" />
              <p>{generationProgress?.status || t('quiz.generatingQuestions')}</p>
              <p className="quiz-generating-hint">{t('quiz.generatingHint')}</p>
            </div>
          )}

          {/* Error Phase */}
          {phase === 'error' && (
            <div className="quiz-error">
              <div className="quiz-error-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3>{t('quiz.errorTitle')}</h3>
              <p className="quiz-error-message">{errorMessage}</p>
              <div className="quiz-actions">
                <button className="quiz-button-secondary" onClick={() => resetQuiz()}>
                  {t('quiz.close')}
                </button>
                <button
                  className="quiz-button-primary"
                  onClick={() => {
                    if (quizConfig) {
                      resetQuiz()
                      setTimeout(() => {
                        useQuizStore.getState().startQuiz(
                          quizConfig.sourceType,
                          quizConfig.sourcePath,
                          Math.min(quizConfig.questionCount, 10),
                          false
                        )
                      }, 100)
                    }
                  }}
                >
                  {t('quiz.retry')}
                </button>
              </div>
            </div>
          )}

          {/* Quiz Phase */}
          {phase === 'quiz' && currentQuestion && (
            <div className="quiz-question-container">
              <div className="quiz-question-meta">
                <span className={`quiz-difficulty quiz-difficulty-${currentQuestion.difficulty}`}>
                  {t(`quiz.difficulty.${currentQuestion.difficulty}`)}
                </span>
                <span className="quiz-topic">{currentQuestion.topic}</span>
              </div>

              <div className="quiz-question">
                <MarkdownContent content={currentQuestion.question} vaultPath={vaultPath} />
              </div>

              <div className="quiz-answer">
                <textarea
                  ref={textareaRef}
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  placeholder={t('quiz.answerPlaceholder')}
                  rows={4}
                />
              </div>

              <div className="quiz-actions">
                <button className="quiz-button-secondary" onClick={handleSkip}>
                  {t('quiz.skip')}
                </button>
                <button
                  className="quiz-button-primary"
                  onClick={handleSubmitAnswer}
                  disabled={!currentAnswer.trim()}
                >
                  {t('quiz.submit')}
                  <span className="quiz-shortcut">⌘↵</span>
                </button>
              </div>
            </div>
          )}

          {/* Feedback Phase */}
          {phase === 'feedback' && currentFeedback && currentQuestion && (
            <div className="quiz-feedback-container">
              <div className={`quiz-feedback-score ${currentFeedback.correct ? 'correct' : 'incorrect'}`}>
                <div className="quiz-score-circle">
                  <span className="quiz-score-value">{currentFeedback.score}</span>
                  <span className="quiz-score-label">%</span>
                </div>
                <span className="quiz-score-text">
                  {currentFeedback.correct ? t('quiz.correct') : t('quiz.incorrect')}
                </span>
              </div>

              <div className="quiz-feedback-details">
                <div className="quiz-feedback-section">
                  <h4>{t('quiz.yourAnswer')}</h4>
                  <p>{currentAnswer || t('quiz.noAnswer')}</p>
                </div>

                <div className="quiz-feedback-section">
                  <h4>{t('quiz.feedback')}</h4>
                  <MarkdownContent content={currentFeedback.feedback} vaultPath={vaultPath} />
                </div>

                <div className="quiz-feedback-section quiz-expected-answer">
                  <h4>{t('quiz.expectedAnswer')}</h4>
                  <MarkdownContent content={currentQuestion.expectedAnswer} vaultPath={vaultPath} />
                </div>
              </div>

              <div className="quiz-actions">
                <button className="quiz-button-primary" onClick={handleNextQuestion}>
                  {currentQuestionIndex >= (currentSession?.questions.length || 0) - 1
                    ? t('quiz.showResults')
                    : t('quiz.nextQuestion')}
                  <span className="quiz-shortcut">⌘↵</span>
                </button>
              </div>
            </div>
          )}

          {/* Results Phase */}
          {phase === 'results' && currentSession && (
            <div className="quiz-results-container">
              <div className="quiz-results-score">
                <div className="quiz-score-big">
                  <span className="quiz-score-value">
                    {Math.round(currentSession.results.reduce((sum, r) => sum + r.score, 0) / currentSession.results.length)}
                  </span>
                  <span className="quiz-score-label">%</span>
                </div>
                <p className="quiz-results-summary">
                  {currentSession.results.filter(r => r.correct).length} {t('quiz.of')} {currentSession.results.length} {t('quiz.questionsCorrect')}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="quiz-results-bar">
                <div
                  className="quiz-results-bar-fill"
                  style={{
                    width: `${(currentSession.results.filter(r => r.correct).length / currentSession.results.length) * 100}%`
                  }}
                />
              </div>

              {/* Schwächen */}
              {finalAnalysis && finalAnalysis.weakTopics.length > 0 && (
                <div className="quiz-results-section">
                  <h4>{t('quiz.weakTopics')}</h4>
                  <div className="quiz-weak-topics">
                    {finalAnalysis.weakTopics.map((topic, i) => (
                      <span key={i} className="quiz-weak-topic">{topic}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Empfehlungen */}
              {finalAnalysis && finalAnalysis.recommendations.length > 0 && (
                <div className="quiz-results-section">
                  <h4>{t('quiz.recommendations')}</h4>
                  <ul className="quiz-recommendations">
                    {finalAnalysis.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Empfohlene Notizen */}
              {finalAnalysis && finalAnalysis.suggestedFiles.length > 0 && (
                <div className="quiz-results-section">
                  <h4>{t('quiz.suggestedNotes')}</h4>
                  <div className="quiz-suggested-files">
                    {finalAnalysis.suggestedFiles.map((file, i) => (
                      <button
                        key={i}
                        className="quiz-suggested-file"
                        onClick={() => handleOpenNote(file)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        {file.split('/').pop()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Save as Flashcards */}
              <div className="quiz-results-section quiz-flashcards-section">
                {flashcardsSaved ? (
                  <div className="quiz-flashcards-saved">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span>{t('quiz.flashcardsSaved', { count: currentSession.questions.length })}</span>
                  </div>
                ) : (
                  <button
                    className="quiz-save-flashcards-btn"
                    onClick={handleSaveAsFlashcards}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M10 4v4" />
                      <path d="M14 4v4" />
                    </svg>
                    {t('quiz.saveAsFlashcards')}
                  </button>
                )}
              </div>

              <div className="quiz-actions">
                {finalAnalysis && finalAnalysis.weakTopics.length > 0 && (
                  <button
                    className="quiz-button-secondary"
                    onClick={() => {
                      // Quiz mit Fokus auf Schwächen neu starten
                      if (quizConfig) {
                        resetQuiz()
                        setTimeout(() => {
                          useQuizStore.getState().startQuiz(
                            quizConfig.sourceType,
                            quizConfig.sourcePath,
                            quizConfig.questionCount,
                            true
                          )
                        }, 100)
                      }
                    }}
                  >
                    {t('quiz.practiceWeaknesses')}
                  </button>
                )}
                <button className="quiz-button-primary" onClick={() => resetQuiz()}>
                  {t('quiz.close')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
