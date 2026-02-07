import { create } from 'zustand'
import type { Flashcard, DailyReview } from '../../shared/types'

// SM-2 Quality ratings
export type ReviewQuality = 0 | 1 | 2 | 3  // 0=Again, 1=Hard, 2=Good, 3=Easy

export type FlashcardFilter = 'all' | 'due' | 'pending' | 'suspended' | 'stats'

// Helper: local date string YYYY-MM-DD
function getLocalDateString(date?: Date): string {
  return (date || new Date()).toLocaleDateString('sv-SE')
}

interface FlashcardState {
  // Data
  flashcards: Flashcard[]
  isLoading: boolean

  // Filters
  activeFilter: FlashcardFilter

  // Study Session
  isStudying: boolean
  studyQueue: Flashcard[]
  currentStudyIndex: number
  isFlipped: boolean

  // Editor
  editingCard: Flashcard | null

  // Panel visibility
  isPanelOpen: boolean

  // Study Statistics
  studyDays: Set<string>
  dailyReviews: DailyReview[]

  // Actions
  setFlashcards: (cards: Flashcard[]) => void
  addFlashcard: (card: Flashcard) => void
  addFlashcards: (cards: Flashcard[]) => void
  updateFlashcard: (id: string, updates: Partial<Flashcard>) => void
  deleteFlashcard: (id: string) => void

  // Filter actions
  setFilter: (filter: FlashcardFilter) => void
  getFilteredCards: () => Flashcard[]
  getDueCards: () => Flashcard[]
  getPendingCards: () => Flashcard[]

  // Study actions
  startStudySession: (cards?: Flashcard[]) => void
  endStudySession: () => void
  flipCard: () => void
  rateCard: (quality: ReviewQuality) => void
  nextCard: () => void

  // Editor actions
  setEditingCard: (card: Flashcard | null) => void
  isCreatingCard: boolean
  setCreatingCard: (creating: boolean) => void

  // Panel actions
  togglePanel: () => void
  setPanel: (open: boolean) => void

  // Persistence
  loadFlashcards: (vaultPath: string) => Promise<void>
  saveFlashcards: (vaultPath: string) => Promise<void>

  // Stats
  getStats: () => { total: number; due: number; pending: number; suspended: number }

  // Study Statistics Actions
  recordReview: (quality: ReviewQuality) => void
  loadStudyStats: (vaultPath: string) => Promise<void>
  saveStudyStats: (vaultPath: string) => Promise<void>

  // Study Statistics Computed
  getStreakStats: () => { currentStreak: number; longestStreak: number; totalStudyDays: number }
  getProgressStats: () => {
    totalCards: number
    activeCards: number
    matureCards: number
    reviewedToday: number
    correctToday: number
    averageEase: number
  }
  getHeatmapData: () => Array<{ date: string; level: number; count: number }>
  getUpcomingReviews: () => Array<{ date: string; label: string; count: number }>
}

function generateId(): string {
  return `fc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function isCardDue(card: Flashcard): boolean {
  if (card.status !== 'active') return false
  if (!card.nextReview) return true // Never reviewed = due
  return new Date(card.nextReview) <= new Date()
}

// SM-2 Algorithm Implementation
function updateSM2(quality: ReviewQuality, card: Flashcard): Partial<Flashcard> {
  let { easeFactor, interval, repetitions } = card
  const now = new Date()

  if (quality < 1) {
    // Again - reset
    repetitions = 0
    interval = 1
  } else {
    // Hard, Good, Easy - successful review
    if (repetitions === 0) {
      interval = 1
    } else if (repetitions === 1) {
      interval = quality === 1 ? 2 : quality === 2 ? 3 : 4
    } else {
      const multiplier = quality === 1 ? 1.2 : quality === 2 ? easeFactor : easeFactor * 1.3
      interval = Math.round(interval * multiplier)
    }

    repetitions++

    // Adjust ease factor based on quality
    // EF' = EF + (0.1 - (3 - q) * (0.08 + (3 - q) * 0.02))
    const adjustment = 0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02)
    easeFactor = Math.max(1.3, Math.min(2.5, easeFactor + adjustment))
  }

  const nextReview = addDays(now, interval).toISOString()

  return {
    easeFactor,
    interval,
    repetitions,
    nextReview,
    lastReview: now.toISOString(),
    modified: now.toISOString()
  }
}

export const useFlashcardStore = create<FlashcardState>()((set, get) => ({
  // Initial state
  flashcards: [],
  isLoading: false,
  activeFilter: 'all',
  isStudying: false,
  studyQueue: [],
  currentStudyIndex: 0,
  isFlipped: false,
  editingCard: null,
  isCreatingCard: false,
  isPanelOpen: false,

  // Study Statistics
  studyDays: new Set<string>(),
  dailyReviews: [],

  // Basic actions
  setFlashcards: (cards) => set({ flashcards: cards }),

  addFlashcard: (card) => set((state) => ({
    flashcards: [...state.flashcards, card]
  })),

  addFlashcards: (cards) => set((state) => ({
    flashcards: [...state.flashcards, ...cards]
  })),

  updateFlashcard: (id, updates) => set((state) => ({
    flashcards: state.flashcards.map((card) =>
      card.id === id ? { ...card, ...updates, modified: new Date().toISOString() } : card
    )
  })),

  deleteFlashcard: (id) => set((state) => ({
    flashcards: state.flashcards.filter((card) => card.id !== id),
    editingCard: state.editingCard?.id === id ? null : state.editingCard
  })),

  // Filter actions
  setFilter: (filter) => set({ activeFilter: filter }),

  getFilteredCards: () => {
    const { flashcards, activeFilter } = get()
    switch (activeFilter) {
      case 'due':
        return flashcards.filter(isCardDue)
      case 'pending':
        return flashcards.filter((c) => c.status === 'pending')
      case 'suspended':
        return flashcards.filter((c) => c.status === 'suspended')
      case 'stats':
        return []
      default:
        return flashcards
    }
  },

  getDueCards: () => {
    const { flashcards } = get()
    return flashcards.filter(isCardDue)
  },

  getPendingCards: () => {
    const { flashcards } = get()
    return flashcards.filter((c) => c.status === 'pending')
  },

  // Study session actions
  startStudySession: (cards) => {
    const { getDueCards } = get()
    const studyCards = cards || getDueCards()

    if (studyCards.length === 0) return

    // Shuffle cards
    const shuffled = [...studyCards].sort(() => Math.random() - 0.5)

    set({
      isStudying: true,
      studyQueue: shuffled,
      currentStudyIndex: 0,
      isFlipped: false
    })
  },

  endStudySession: () => set({
    isStudying: false,
    studyQueue: [],
    currentStudyIndex: 0,
    isFlipped: false
  }),

  flipCard: () => set((state) => ({ isFlipped: !state.isFlipped })),

  rateCard: (quality) => {
    const { studyQueue, currentStudyIndex, updateFlashcard, recordReview } = get()
    const currentCard = studyQueue[currentStudyIndex]

    if (!currentCard) return

    // Apply SM-2 algorithm
    const updates = updateSM2(quality, currentCard)
    updateFlashcard(currentCard.id, updates)

    // Record stats
    recordReview(quality)

    // Move to next card
    get().nextCard()
  },

  nextCard: () => {
    const { studyQueue, currentStudyIndex } = get()

    if (currentStudyIndex >= studyQueue.length - 1) {
      // Session complete
      get().endStudySession()
    } else {
      set({
        currentStudyIndex: currentStudyIndex + 1,
        isFlipped: false
      })
    }
  },

  // Editor actions
  setEditingCard: (card) => set({ editingCard: card }),
  setCreatingCard: (creating) => set({ isCreatingCard: creating, editingCard: null }),

  // Panel actions
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
  setPanel: (open) => set({ isPanelOpen: open }),

  // Persistence
  loadFlashcards: async (vaultPath) => {
    set({ isLoading: true })
    try {
      const cards = await window.electronAPI.flashcardsLoad(vaultPath)
      set({ flashcards: cards || [], isLoading: false })
    } catch (error) {
      console.error('[Flashcards] Failed to load:', error)
      set({ flashcards: [], isLoading: false })
    }
  },

  saveFlashcards: async (vaultPath) => {
    const { flashcards } = get()
    try {
      await window.electronAPI.flashcardsSave(vaultPath, flashcards)
    } catch (error) {
      console.error('[Flashcards] Failed to save:', error)
    }
  },

  // Stats
  getStats: () => {
    const { flashcards } = get()
    return {
      total: flashcards.length,
      due: flashcards.filter(isCardDue).length,
      pending: flashcards.filter((c) => c.status === 'pending').length,
      suspended: flashcards.filter((c) => c.status === 'suspended').length
    }
  },

  // Study Statistics Actions
  recordReview: (quality) => {
    const today = getLocalDateString()
    const { studyDays, dailyReviews } = get()

    const newStudyDays = new Set(studyDays)
    newStudyDays.add(today)

    const existingIndex = dailyReviews.findIndex((r) => r.date === today)
    let newDailyReviews: DailyReview[]

    if (existingIndex >= 0) {
      newDailyReviews = [...dailyReviews]
      newDailyReviews[existingIndex] = {
        ...newDailyReviews[existingIndex],
        cardsReviewed: newDailyReviews[existingIndex].cardsReviewed + 1,
        cardsCorrect: newDailyReviews[existingIndex].cardsCorrect + (quality >= 2 ? 1 : 0)
      }
    } else {
      newDailyReviews = [...dailyReviews, {
        date: today,
        cardsReviewed: 1,
        cardsCorrect: quality >= 2 ? 1 : 0
      }]
    }

    set({ studyDays: newStudyDays, dailyReviews: newDailyReviews })
  },

  loadStudyStats: async (vaultPath) => {
    try {
      const data = await window.electronAPI.studyStatsLoad(vaultPath)
      if (data) {
        set({
          studyDays: new Set(data.studyDays),
          dailyReviews: data.dailyReviews
        })
      } else {
        // Backfill from existing flashcards lastReview data
        const { flashcards } = get()
        const backfilledDays = new Set<string>()
        for (const card of flashcards) {
          if (card.lastReview) {
            const day = getLocalDateString(new Date(card.lastReview))
            backfilledDays.add(day)
          }
        }
        set({ studyDays: backfilledDays, dailyReviews: [] })
      }
    } catch (error) {
      console.error('[StudyStats] Failed to load:', error)
    }
  },

  saveStudyStats: async (vaultPath) => {
    const { studyDays, dailyReviews } = get()
    try {
      await window.electronAPI.studyStatsSave(vaultPath, {
        studyDays: Array.from(studyDays),
        dailyReviews
      })
    } catch (error) {
      console.error('[StudyStats] Failed to save:', error)
    }
  },

  // Study Statistics Computed
  getStreakStats: () => {
    const { studyDays } = get()
    if (studyDays.size === 0) return { currentStreak: 0, longestStreak: 0, totalStudyDays: 0 }

    const sortedDays = Array.from(studyDays).sort()
    const today = getLocalDateString()
    const yesterday = getLocalDateString(addDays(new Date(), -1))

    // Current streak: count backwards from today (or yesterday)
    let currentStreak = 0
    let checkDate = studyDays.has(today) ? today : (studyDays.has(yesterday) ? yesterday : null)

    if (checkDate) {
      const d = new Date(checkDate + 'T00:00:00')
      while (studyDays.has(getLocalDateString(d))) {
        currentStreak++
        d.setDate(d.getDate() - 1)
      }
    }

    // Longest streak
    let longestStreak = 0
    let streak = 1
    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(sortedDays[i - 1] + 'T00:00:00')
      const curr = new Date(sortedDays[i] + 'T00:00:00')
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays === 1) {
        streak++
      } else {
        longestStreak = Math.max(longestStreak, streak)
        streak = 1
      }
    }
    longestStreak = Math.max(longestStreak, streak)

    return { currentStreak, longestStreak, totalStudyDays: studyDays.size }
  },

  getProgressStats: () => {
    const { flashcards, dailyReviews } = get()
    const today = getLocalDateString()
    const todayReview = dailyReviews.find((r) => r.date === today)
    const activeCards = flashcards.filter((c) => c.status === 'active')

    const easeSum = activeCards.reduce((sum, c) => sum + c.easeFactor, 0)

    return {
      totalCards: flashcards.length,
      activeCards: activeCards.length,
      matureCards: activeCards.filter((c) => c.interval >= 21).length,
      reviewedToday: todayReview?.cardsReviewed || 0,
      correctToday: todayReview?.cardsCorrect || 0,
      averageEase: activeCards.length > 0 ? Math.round((easeSum / activeCards.length) * 100) / 100 : 0
    }
  },

  getHeatmapData: () => {
    const { dailyReviews } = get()
    const today = new Date()
    const reviewMap = new Map<string, number>()

    for (const r of dailyReviews) {
      reviewMap.set(r.date, r.cardsReviewed)
    }

    // Build 84 days (12 weeks), ending on today's week's Saturday
    const dayOfWeek = today.getDay() // 0=Sun
    // Calculate days remaining until Saturday (6)
    const daysUntilSat = (6 - dayOfWeek + 7) % 7
    const endDate = addDays(today, daysUntilSat)
    const startDate = addDays(endDate, -83)

    // Find max for level calculation
    const counts: number[] = []
    const entries: Array<{ date: string; count: number }> = []

    for (let i = 0; i < 84; i++) {
      const d = addDays(startDate, i)
      const dateStr = getLocalDateString(d)
      const count = reviewMap.get(dateStr) || 0
      entries.push({ date: dateStr, count })
      if (count > 0) counts.push(count)
    }

    const maxCount = counts.length > 0 ? Math.max(...counts) : 1

    return entries.map(({ date, count }) => ({
      date,
      count,
      level: count === 0 ? 0 : Math.min(4, Math.ceil((count / maxCount) * 4))
    }))
  },

  getUpcomingReviews: () => {
    const { flashcards } = get()
    const today = new Date()
    const result: Array<{ date: string; label: string; count: number }> = []
    const weekdayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i)
      const dateStr = getLocalDateString(d)
      const dayName = i === 0 ? 'Heute' : weekdayNames[d.getDay()]

      const count = flashcards.filter((c) => {
        if (c.status !== 'active') return false
        if (!c.nextReview) return i === 0 // Never reviewed = due today
        const reviewDate = getLocalDateString(new Date(c.nextReview))
        if (i === 0) return reviewDate <= dateStr
        return reviewDate === dateStr
      }).length

      result.push({ date: dateStr, label: dayName, count })
    }

    return result
  }
}))

// Helper to create a new flashcard from quiz question
export function createFlashcardFromQuiz(
  question: string,
  answer: string,
  topic: string,
  sourceNote: string
): Flashcard {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    sourceNote,
    front: question,
    back: answer,
    topic,
    status: 'pending',
    created: now,
    modified: now,
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: null,
    lastReview: null
  }
}

// Helper to calculate days until next review
export function getDaysUntilReview(card: Flashcard): number | null {
  if (!card.nextReview) return null
  const now = new Date()
  const next = new Date(card.nextReview)
  const diffTime = next.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

// Helper to get preview interval for quality rating
export function getPreviewInterval(quality: ReviewQuality, card: Flashcard): number {
  const updates = updateSM2(quality, card)
  return updates.interval || 1
}
