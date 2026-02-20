import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { NodePosition, ManualEdge, FileCustomization } from '../../shared/types'

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
  fileCustomizations: Record<string, FileCustomization>
  viewport: { x: number; y: number; zoom: number }
  vaultPath: string | null
  isDirty: boolean
  showHiddenFolders: boolean  // Transient (not persisted)

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

  // FileTree Customization Actions
  setFileCustomization: (path: string, customization: FileCustomization) => void
  removeFileCustomization: (path: string) => void
  toggleFolderHidden: (path: string) => void
  setShowHiddenFolders: (show: boolean) => void

  setViewport: (viewport: { x: number; y: number; zoom: number }) => void

  reset: () => void
}

const initialState = {
  positions: {} as Record<string, NodePosition>,
  manualEdges: [] as ManualEdge[],
  labels: [] as CanvasLabel[],
  fileCustomizations: {} as Record<string, FileCustomization>,
  viewport: { x: 0, y: 0, zoom: 1 },
  vaultPath: null as string | null,
  isDirty: false,
  showHiddenFolders: false
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
            fileCustomizations: (data as any).fileCustomizations || {},
            viewport: (data as any).viewport || { x: 0, y: 0, zoom: 1 },
            vaultPath,
            isDirty: false
          })
          console.log('Graph-Daten geladen:', Object.keys((data as any).positions || {}).length, 'Positionen,', ((data as any).labels || []).length, 'Labels,', Object.keys((data as any).fileCustomizations || {}).length, 'FileCustomizations')
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
          version: '1.2',
          lastModified: new Date().toISOString(),
          positions: state.positions,
          manualEdges: state.manualEdges,
          labels: state.labels,
          fileCustomizations: state.fileCustomizations,
          viewport: state.viewport
        }
        console.log('Speichere Graph-Daten nach:', state.vaultPath)
        await window.electronAPI.saveGraphData(state.vaultPath, data)
        set({ isDirty: false })
        console.log('Graph-Daten gespeichert:', Object.keys(state.positions).length, 'Positionen,', state.labels.length, 'Labels,', Object.keys(state.fileCustomizations).length, 'FileCustomizations')
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

    // FileTree Customization Actions
    setFileCustomization: (path, customization) => {
      console.log('[GraphStore] setFileCustomization:', path, customization)
      set((state) => {
        const existing = state.fileCustomizations[path] || {}
        const merged = { ...existing, ...customization }
        // Remove undefined/null values
        const cleaned: FileCustomization = {}
        if (merged.color) cleaned.color = merged.color
        if (merged.icon) cleaned.icon = merged.icon
        if (merged.hidden) cleaned.hidden = merged.hidden

        console.log('[GraphStore] Saving cleaned customization:', cleaned)
        return {
          fileCustomizations: {
            ...state.fileCustomizations,
            [path]: cleaned
          },
          isDirty: true
        }
      })
      scheduleSave()
    },

    removeFileCustomization: (path) => {
      set((state) => {
        const { [path]: _, ...rest } = state.fileCustomizations
        return { fileCustomizations: rest, isDirty: true }
      })
      scheduleSave()
    },

    toggleFolderHidden: (path) => {
      set((state) => {
        const existing = state.fileCustomizations[path] || {}
        const isHidden = !existing.hidden
        const cleaned: FileCustomization = {}
        if (existing.color) cleaned.color = existing.color
        if (existing.icon) cleaned.icon = existing.icon
        if (isHidden) cleaned.hidden = true

        // If no properties left, remove entry entirely
        if (!cleaned.color && !cleaned.icon && !cleaned.hidden) {
          const { [path]: _, ...rest } = state.fileCustomizations
          return { fileCustomizations: rest, isDirty: true }
        }

        return {
          fileCustomizations: {
            ...state.fileCustomizations,
            [path]: cleaned
          },
          isDirty: true
        }
      })
      scheduleSave()
    },

    setShowHiddenFolders: (show) => {
      set({ showHiddenFolders: show })
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
