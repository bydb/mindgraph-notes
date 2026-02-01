import { create } from 'zustand'
import type { QuizQuestion, QuizResult, QuizSession, QuizAnalysis, LearningProgress } from '../../shared/types'

export type QuizPhase = 'idle' | 'generating' | 'quiz' | 'feedback' | 'results' | 'error'

interface QuizState {
  // Session State
  phase: QuizPhase
  currentSession: QuizSession | null
  currentQuestionIndex: number
  currentAnswer: string

  // Error State
  errorMessage: string | null

  // Generation Progress
  generationProgress: { current: number; total: number; status: string } | null

  // Feedback State (after each answer)
  currentFeedback: {
    score: number
    feedback: string
    correct: boolean
  } | null

  // Final Analysis
  finalAnalysis: QuizAnalysis | null

  // Learning Progress (persisted per vault)
  learningProgress: Record<string, LearningProgress>

  // Quiz Config
  quizConfig: {
    sourceType: 'file' | 'folder'
    sourcePath: string
    questionCount: number
    focusOnWeaknesses: boolean
  } | null

  // Actions
  startQuiz: (sourceType: 'file' | 'folder', sourcePath: string, questionCount: number, focusOnWeaknesses?: boolean) => void
  setPhase: (phase: QuizPhase) => void
  setQuestions: (questions: QuizQuestion[]) => void
  setCurrentAnswer: (answer: string) => void
  submitAnswer: () => void
  addResult: (result: QuizResult) => void
  setCurrentFeedback: (feedback: { score: number; feedback: string; correct: boolean } | null) => void
  nextQuestion: () => void
  setFinalAnalysis: (analysis: QuizAnalysis) => void
  setGenerationProgress: (progress: { current: number; total: number; status: string } | null) => void
  setError: (message: string) => void
  resetQuiz: () => void

  // Learning Progress
  setLearningProgress: (progress: Record<string, LearningProgress>) => void
  updateTopicProgress: (filePath: string, topic: string, correct: boolean) => void

  // Helpers
  getCurrentQuestion: () => QuizQuestion | null
  getProgress: () => { current: number; total: number }
  getSessionScore: () => number
}

function generateSessionId(): string {
  return `quiz-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export const useQuizStore = create<QuizState>()((set, get) => ({
  // Initial State
  phase: 'idle',
  currentSession: null,
  currentQuestionIndex: 0,
  currentAnswer: '',
  errorMessage: null,
  generationProgress: null,
  currentFeedback: null,
  finalAnalysis: null,
  learningProgress: {},
  quizConfig: null,

  // Actions
  startQuiz: (sourceType, sourcePath, questionCount, focusOnWeaknesses = false) => {
    const session: QuizSession = {
      id: generateSessionId(),
      sourceType,
      sourcePath,
      createdAt: new Date(),
      questions: [],
      results: [],
      weakTopics: [],
      completed: false
    }

    set({
      phase: 'generating',
      currentSession: session,
      currentQuestionIndex: 0,
      currentAnswer: '',
      errorMessage: null,
      currentFeedback: null,
      finalAnalysis: null,
      quizConfig: {
        sourceType,
        sourcePath,
        questionCount,
        focusOnWeaknesses
      }
    })
  },

  setPhase: (phase) => set({ phase }),

  setQuestions: (questions) => set((state) => ({
    currentSession: state.currentSession
      ? { ...state.currentSession, questions }
      : null,
    phase: questions.length > 0 ? 'quiz' : 'idle'
  })),

  setCurrentAnswer: (answer) => set({ currentAnswer: answer }),

  submitAnswer: () => {
    // This triggers the evaluation - actual result is added via addResult
    set({ phase: 'feedback' })
  },

  addResult: (result) => set((state) => ({
    currentSession: state.currentSession
      ? { ...state.currentSession, results: [...state.currentSession.results, result] }
      : null
  })),

  setCurrentFeedback: (feedback) => set({ currentFeedback: feedback }),

  nextQuestion: () => {
    const state = get()
    const nextIndex = state.currentQuestionIndex + 1
    const totalQuestions = state.currentSession?.questions.length || 0

    if (nextIndex >= totalQuestions) {
      // Quiz complete
      set({
        phase: 'results',
        currentSession: state.currentSession
          ? { ...state.currentSession, completed: true }
          : null
      })
    } else {
      set({
        currentQuestionIndex: nextIndex,
        currentAnswer: '',
        currentFeedback: null,
        phase: 'quiz'
      })
    }
  },

  setFinalAnalysis: (analysis) => set((state) => ({
    finalAnalysis: analysis,
    currentSession: state.currentSession
      ? { ...state.currentSession, weakTopics: analysis.weakTopics }
      : null
  })),

  setGenerationProgress: (progress) => set({ generationProgress: progress }),

  setError: (message) => set({ phase: 'error', errorMessage: message, generationProgress: null }),

  resetQuiz: () => set({
    phase: 'idle',
    currentSession: null,
    currentQuestionIndex: 0,
    errorMessage: null,
    currentAnswer: '',
    generationProgress: null,
    currentFeedback: null,
    finalAnalysis: null,
    quizConfig: null
  }),

  // Learning Progress
  setLearningProgress: (progress) => set({ learningProgress: progress }),

  updateTopicProgress: (filePath, topic, correct) => set((state) => {
    const existing = state.learningProgress[filePath]?.topics[topic]
    const now = new Date()

    // Simplified SM-2 algorithm
    const newCorrect = (existing?.correctCount || 0) + (correct ? 1 : 0)
    const newTotal = (existing?.totalCount || 0) + 1
    const score = (newCorrect / newTotal) * 100

    // Calculate next review interval
    const previousInterval = existing
      ? (now.getTime() - existing.lastAsked.getTime()) / (1000 * 60 * 60 * 24)
      : 0

    let nextInterval: number
    if (score < 50) {
      nextInterval = 1 // Tomorrow
    } else if (previousInterval === 0) {
      nextInterval = 1
    } else if (previousInterval <= 1) {
      nextInterval = 3
    } else {
      const easeFactor = score >= 80 ? 2.5 : score >= 60 ? 2.0 : 1.5
      nextInterval = Math.round(previousInterval * easeFactor)
    }

    const nextReview = new Date(now.getTime() + nextInterval * 24 * 60 * 60 * 1000)

    return {
      learningProgress: {
        ...state.learningProgress,
        [filePath]: {
          filePath,
          topics: {
            ...(state.learningProgress[filePath]?.topics || {}),
            [topic]: {
              correctCount: newCorrect,
              totalCount: newTotal,
              lastAsked: now,
              nextReview
            }
          }
        }
      }
    }
  }),

  // Helpers
  getCurrentQuestion: () => {
    const state = get()
    if (!state.currentSession) return null
    return state.currentSession.questions[state.currentQuestionIndex] || null
  },

  getProgress: () => {
    const state = get()
    return {
      current: state.currentQuestionIndex + 1,
      total: state.currentSession?.questions.length || 0
    }
  },

  getSessionScore: () => {
    const state = get()
    if (!state.currentSession || state.currentSession.results.length === 0) return 0
    const total = state.currentSession.results.reduce((sum, r) => sum + r.score, 0)
    return Math.round(total / state.currentSession.results.length)
  }
}))
