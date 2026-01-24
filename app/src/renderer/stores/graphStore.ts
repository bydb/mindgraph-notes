import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { NodePosition, ManualEdge } from '../../shared/types'

// Canvas Label (Überschrift ohne Datei)
export interface CanvasLabel {
  id: string
  text: string
  x: number
  y: number
  width?: number
  height?: number
  color?: string
  fontSize?: 'small' | 'medium' | 'large'
  folderContext?: string | null  // Ordner-Kontext für gefilterte Ansichten
}

interface GraphState {
  positions: Record<string, NodePosition>
  manualEdges: ManualEdge[]
  labels: CanvasLabel[]
  viewport: { x: number; y: number; zoom: number }
  vaultPath: string | null
  isDirty: boolean

  // Actions
  setVaultPath: (path: string | null) => void
  loadFromVault: (vaultPath: string) => Promise<void>
  saveToVault: () => Promise<void>

  setNodePosition: (nodeId: string, x: number, y: number) => void
  pinNode: (nodeId: string, pinned: boolean) => void
  setNodeColor: (nodeId: string, color: string | undefined) => void
  setNodeSize: (nodeId: string, size: 'small' | 'medium' | 'large') => void
  setNodeDimensions: (nodeId: string, width: number, height: number) => void
  removeNodePosition: (nodeId: string) => void

  addManualEdge: (edge: Omit<ManualEdge, 'id'>) => void
  updateManualEdge: (edgeId: string, updates: Partial<ManualEdge>) => void
  removeManualEdge: (edgeId: string) => void

  // Label Actions
  addLabel: (label: Omit<CanvasLabel, 'id'>) => string
  updateLabel: (labelId: string, updates: Partial<Omit<CanvasLabel, 'id'>>) => void
  removeLabel: (labelId: string) => void

  setViewport: (viewport: { x: number; y: number; zoom: number }) => void

  reset: () => void
}

const initialState = {
  positions: {} as Record<string, NodePosition>,
  manualEdges: [] as ManualEdge[],
  labels: [] as CanvasLabel[],
  viewport: { x: 0, y: 0, zoom: 1 },
  vaultPath: null as string | null,
  isDirty: false
}

// Debounce-Timer für Auto-Save
let saveTimeout: NodeJS.Timeout | null = null

export const useGraphStore = create<GraphState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setVaultPath: (path) => set({ vaultPath: path }),

    loadFromVault: async (vaultPath: string) => {
      try {
        const data = await window.electronAPI.loadGraphData(vaultPath)
        if (data) {
          set({
            positions: (data as any).positions || {},
            manualEdges: (data as any).manualEdges || [],
            labels: (data as any).labels || [],
            viewport: (data as any).viewport || { x: 0, y: 0, zoom: 1 },
            vaultPath,
            isDirty: false
          })
          console.log('Graph-Daten geladen:', Object.keys((data as any).positions || {}).length, 'Positionen,', ((data as any).labels || []).length, 'Labels')
        } else {
          set({ vaultPath, isDirty: false })
          console.log('Keine vorhandenen Graph-Daten gefunden')
        }
      } catch (error) {
        console.error('Fehler beim Laden der Graph-Daten:', error)
        set({ vaultPath, isDirty: false })
      }
    },

    saveToVault: async () => {
      const state = get()
      console.log('saveToVault called:', { vaultPath: state.vaultPath, isDirty: state.isDirty })
      if (!state.vaultPath) {
        console.log('Kein vaultPath - Speichern übersprungen')
        return
      }
      if (!state.isDirty) {
        console.log('Keine Änderungen - Speichern übersprungen')
        return
      }

      try {
        const data = {
          version: '1.1',
          lastModified: new Date().toISOString(),
          positions: state.positions,
          manualEdges: state.manualEdges,
          labels: state.labels,
          viewport: state.viewport
        }
        console.log('Speichere Graph-Daten nach:', state.vaultPath)
        await window.electronAPI.saveGraphData(state.vaultPath, data)
        set({ isDirty: false })
        console.log('Graph-Daten gespeichert:', Object.keys(state.positions).length, 'Positionen,', state.labels.length, 'Labels')
      } catch (error) {
        console.error('Fehler beim Speichern der Graph-Daten:', error)
      }
    },

    setNodePosition: (nodeId, x, y) => {
      set((state) => ({
        positions: {
          ...state.positions,
          [nodeId]: {
            ...state.positions[nodeId],
            x,
            y,
            pinned: state.positions[nodeId]?.pinned ?? false
          }
        },
        isDirty: true
      }))
      scheduleSave()
    },

    pinNode: (nodeId, pinned) => {
      set((state) => ({
        positions: {
          ...state.positions,
          [nodeId]: {
            ...state.positions[nodeId],
            x: state.positions[nodeId]?.x ?? 0,
            y: state.positions[nodeId]?.y ?? 0,
            pinned
          }
        },
        isDirty: true
      }))
      scheduleSave()
    },

    setNodeColor: (nodeId, color) => {
      set((state) => ({
        positions: {
          ...state.positions,
          [nodeId]: {
            ...state.positions[nodeId],
            x: state.positions[nodeId]?.x ?? 0,
            y: state.positions[nodeId]?.y ?? 0,
            pinned: state.positions[nodeId]?.pinned ?? false,
            color
          }
        },
        isDirty: true
      }))
      scheduleSave()
    },

    setNodeSize: (nodeId, size) => {
      set((state) => ({
        positions: {
          ...state.positions,
          [nodeId]: {
            ...state.positions[nodeId],
            x: state.positions[nodeId]?.x ?? 0,
            y: state.positions[nodeId]?.y ?? 0,
            pinned: state.positions[nodeId]?.pinned ?? false,
            size
          }
        },
        isDirty: true
      }))
      scheduleSave()
    },

    setNodeDimensions: (nodeId, width, height) => {
      set((state) => ({
        positions: {
          ...state.positions,
          [nodeId]: {
            ...state.positions[nodeId],
            x: state.positions[nodeId]?.x ?? 0,
            y: state.positions[nodeId]?.y ?? 0,
            pinned: state.positions[nodeId]?.pinned ?? false,
            width,
            height
          }
        },
        isDirty: true
      }))
      scheduleSave()
    },

    removeNodePosition: (nodeId) => {
      set((state) => {
        const { [nodeId]: _, ...rest } = state.positions
        return { positions: rest, isDirty: true }
      })
      scheduleSave()
    },

    addManualEdge: (edge) => {
      set((state) => ({
        manualEdges: [
          ...state.manualEdges,
          { ...edge, id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` }
        ],
        isDirty: true
      }))
      scheduleSave()
    },

    updateManualEdge: (edgeId, updates) => {
      set((state) => ({
        manualEdges: state.manualEdges.map((e) =>
          e.id === edgeId ? { ...e, ...updates } : e
        ),
        isDirty: true
      }))
      scheduleSave()
    },

    removeManualEdge: (edgeId) => {
      set((state) => ({
        manualEdges: state.manualEdges.filter((e) => e.id !== edgeId),
        isDirty: true
      }))
      scheduleSave()
    },

    // Label Actions
    addLabel: (label) => {
      const id = `label-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      set((state) => ({
        labels: [...state.labels, { ...label, id }],
        isDirty: true
      }))
      scheduleSave()
      return id
    },

    updateLabel: (labelId, updates) => {
      set((state) => ({
        labels: state.labels.map((l) =>
          l.id === labelId ? { ...l, ...updates } : l
        ),
        isDirty: true
      }))
      scheduleSave()
    },

    removeLabel: (labelId) => {
      set((state) => ({
        labels: state.labels.filter((l) => l.id !== labelId),
        isDirty: true
      }))
      scheduleSave()
    },

    setViewport: (viewport) => {
      set({ viewport, isDirty: true })
      scheduleSave()
    },

    reset: () => set({ ...initialState, isDirty: false })
  }))
)

// Auto-Save mit Debounce (500ms)
function scheduleSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = setTimeout(() => {
    useGraphStore.getState().saveToVault()
  }, 500)
}

// Speichern vor dem Schließen
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const state = useGraphStore.getState()
    if (state.isDirty && state.vaultPath) {
      // Synchrones Speichern ist nicht möglich, aber wir versuchen es
      state.saveToVault()
    }
  })
}
