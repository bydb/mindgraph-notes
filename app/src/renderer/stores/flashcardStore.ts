import { create } from 'zustand'
import type { Flashcard } from '../../shared/types'

// SM-2 Quality ratings
export type ReviewQuality = 0 | 1 | 2 | 3  // 0=Again, 1=Hard, 2=Good, 3=Easy

export type FlashcardFilter = 'all' | 'due' | 'pending' | 'suspended'

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
    const { studyQueue, currentStudyIndex, updateFlashcard } = get()
    const currentCard = studyQueue[currentStudyIndex]

    if (!currentCard) return

    // Apply SM-2 algorithm
    const updates = updateSM2(quality, currentCard)
    updateFlashcard(currentCard.id, updates)

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
