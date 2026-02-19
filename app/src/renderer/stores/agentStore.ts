import { create } from 'zustand'
import type { EdooboxEvent, EdooboxOffer } from '../../shared/types'
import { useUIStore } from './uiStore'
import { useNotesStore } from './notesStore'

interface AgentState {
  events: EdooboxEvent[]
  offers: EdooboxOffer[]
  isConnected: boolean
  isImporting: boolean
  isPushing: boolean
  selectedEventId: string | null

  // Actions
  setSelectedEventId: (id: string | null) => void
  loadEvents: () => Promise<void>
  saveEvents: () => Promise<void>
  checkConnection: () => Promise<boolean>
  parseFormular: () => Promise<void>
  pushEvent: (eventId: string) => Promise<void>
  listOffers: () => Promise<void>
  deleteEvent: (eventId: string) => Promise<void>
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  events: [],
  offers: [],
  isConnected: false,
  isImporting: false,
  isPushing: false,
  selectedEventId: null,

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
      // Persist
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

      const { baseUrl, apiVersion, webhookUrl } = useUIStore.getState().edoobox
      const result = await window.electronAPI.edooboxImportEvent(baseUrl, apiVersion, event, webhookUrl)

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

  deleteEvent: async (eventId: string) => {
    set((state) => ({
      events: state.events.filter(e => e.id !== eventId),
      selectedEventId: state.selectedEventId === eventId ? null : state.selectedEventId
    }))
    await get().saveEvents()
  }
}))
