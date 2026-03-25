import { create } from 'zustand'
import type { EdooboxEvent, EdooboxOffer, EdooboxCategory, EdooboxOfferDashboard, EdooboxBooking } from '../../shared/types'
import { useUIStore } from './uiStore'
import { useNotesStore } from './notesStore'

interface AgentState {
  events: EdooboxEvent[]
  offers: EdooboxOffer[]
  categories: EdooboxCategory[]
  isConnected: boolean
  isImporting: boolean
  isPushing: boolean
  selectedEventId: string | null

  // Dashboard
  dashboardView: 'events' | 'dashboard'
  dashboardOffers: EdooboxOfferDashboard[]
  isDashboardLoading: boolean

  // Actions
  setSelectedEventId: (id: string | null) => void
  loadEvents: () => Promise<void>
  saveEvents: () => Promise<void>
  checkConnection: () => Promise<boolean>
  parseFormular: () => Promise<void>
  pushEvent: (eventId: string) => Promise<void>
  listOffers: () => Promise<void>
  loadCategories: () => Promise<void>
  updateEvent: (eventId: string, updates: Partial<EdooboxEvent>) => Promise<void>
  deleteEvent: (eventId: string) => Promise<void>

  // Dashboard Actions
  setDashboardView: (view: 'events' | 'dashboard') => void
  loadDashboard: () => Promise<void>
  loadBookingsForOffer: (offerId: string) => Promise<void>
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  events: [],
  offers: [],
  categories: [],
  isConnected: false,
  isImporting: false,
  isPushing: false,
  selectedEventId: null,

  // Dashboard
  dashboardView: 'events',
  dashboardOffers: [],
  isDashboardLoading: false,

  setSelectedEventId: (id) => set({ selectedEventId: id }),

  loadEvents: async () => {
    const vaultPath = useNotesStore.getState().vaultPath
    if (!vaultPath) return
    const events = await window.electronAPI.edooboxLoadEvents(vaultPath)
    set({ events })
  },

  saveEvents: async () => {
    const vaultPath = useNotesStore.getState().vaultPath
    if (!vaultPath) return
    await window.electronAPI.edooboxSaveEvents(vaultPath, get().events)
  },

  checkConnection: async () => {
    const { baseUrl, apiVersion } = useUIStore.getState().edoobox
    const result = await window.electronAPI.edooboxCheck(baseUrl, apiVersion)
    set({ isConnected: result.success })
    return result.success
  },

  parseFormular: async () => {
    set({ isImporting: true })
    try {
      const result = await window.electronAPI.edooboxParseFormular()
      if (!result) {
        set({ isImporting: false })
        return
      }
      const { event, warnings } = result
      const eventWithWarnings = { ...event, warnings }
      set((state) => ({
        events: [eventWithWarnings, ...state.events],
        selectedEventId: eventWithWarnings.id,
        isImporting: false
      }))
      const vaultPath = useNotesStore.getState().vaultPath
      if (vaultPath) {
        await window.electronAPI.edooboxSaveEvents(vaultPath, [eventWithWarnings, ...get().events.filter(e => e.id !== eventWithWarnings.id)])
      }
    } catch {
      set({ isImporting: false })
    }
  },

  pushEvent: async (eventId: string) => {
    set({ isPushing: true })
    try {
      const event = get().events.find(e => e.id === eventId)
      if (!event) return

      const { baseUrl, apiVersion } = useUIStore.getState().edoobox
      const result = await window.electronAPI.edooboxImportEvent(baseUrl, apiVersion, event)

      set((state) => ({
        events: state.events.map(e =>
          e.id === eventId
            ? {
                ...e,
                status: result.success ? 'pushed' as const : 'error' as const,
                edooboxOfferId: result.offerId,
                pushedAt: result.success ? new Date().toISOString() : undefined,
                error: result.error
              }
            : e
        ),
        isPushing: false
      }))
      await get().saveEvents()
    } catch (error) {
      set((state) => ({
        events: state.events.map(e =>
          e.id === eventId ? { ...e, status: 'error' as const, error: error instanceof Error ? error.message : 'Unbekannter Fehler' } : e
        ),
        isPushing: false
      }))
      await get().saveEvents()
    }
  },

  listOffers: async () => {
    const { baseUrl, apiVersion } = useUIStore.getState().edoobox
    const result = await window.electronAPI.edooboxListOffers(baseUrl, apiVersion)
    if (result.success && result.offers) {
      set({ offers: result.offers })
    }
  },

  loadCategories: async () => {
    const { baseUrl, apiVersion } = useUIStore.getState().edoobox
    const result = await window.electronAPI.edooboxListCategories(baseUrl, apiVersion)
    if (result.success && result.categories) {
      set({ categories: result.categories })
    }
  },

  updateEvent: async (eventId: string, updates: Partial<EdooboxEvent>) => {
    set((state) => ({
      events: state.events.map(e =>
        e.id === eventId ? { ...e, ...updates } : e
      )
    }))
    await get().saveEvents()
  },

  deleteEvent: async (eventId: string) => {
    set((state) => ({
      events: state.events.filter(e => e.id !== eventId),
      selectedEventId: state.selectedEventId === eventId ? null : state.selectedEventId
    }))
    await get().saveEvents()
  },

  // Dashboard
  setDashboardView: (view) => set({ dashboardView: view }),

  loadDashboard: async () => {
    set({ isDashboardLoading: true })
    try {
      const { baseUrl, apiVersion } = useUIStore.getState().edoobox
      const result = await window.electronAPI.edooboxListOffersDashboard(baseUrl, apiVersion)
      if (result.success && result.offers) {
        set({ dashboardOffers: result.offers, isDashboardLoading: false })
      } else {
        set({ isDashboardLoading: false })
      }
    } catch {
      set({ isDashboardLoading: false })
    }
  },

  loadBookingsForOffer: async (offerId: string) => {
    const { baseUrl, apiVersion } = useUIStore.getState().edoobox
    const result = await window.electronAPI.edooboxListBookings(baseUrl, apiVersion, offerId)
    if (result.success && result.bookings) {
      set((state) => ({
        dashboardOffers: state.dashboardOffers.map(o =>
          o.id === offerId ? { ...o, bookings: result.bookings as EdooboxBooking[] } : o
        )
      }))
    }
  }
}))
