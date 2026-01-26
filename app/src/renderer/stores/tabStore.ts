import { create } from 'zustand'

export type TabType = 'editor' | 'canvas' | 'global-canvas'

export interface Tab {
  id: string
  type: TabType
  noteId: string  // Editor: selected note, Canvas: root note
  title: string
}

export interface CanvasTabState {
  rootNoteId: string
  expandedNoteIds: Set<string>  // Notes where user clicked "+"
  depth: number                  // Current expansion depth
  viewport: { x: number; y: number; zoom: number }
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
  canvasStates: Record<string, CanvasTabState>  // Keyed by tab ID

  // Actions
  openEditorTab: (noteId: string, title: string) => void
  openCanvasTab: (rootNoteId: string, title: string) => void
  openGlobalCanvasTab: () => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void

  // Canvas-specific actions
  expandNode: (tabId: string, noteId: string) => void
  collapseNode: (tabId: string, noteId: string) => void
  setCanvasViewport: (tabId: string, viewport: { x: number; y: number; zoom: number }) => void
  resetCanvasTab: (tabId: string) => void

  // Utility
  getCanvasState: (tabId: string) => CanvasTabState | undefined
  hasCanvasTabForNote: (noteId: string) => boolean
  clearAllTabs: () => void
}

// Generate unique tab ID
const generateTabId = () => `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const useTabStore = create<TabState>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  canvasStates: {},

  openEditorTab: (noteId, title) => {
    const state = get()

    // Check if editor tab for this note already exists
    const existingTab = state.tabs.find(t => t.type === 'editor' && t.noteId === noteId)
    if (existingTab) {
      set({ activeTabId: existingTab.id })
      return
    }

    const newTab: Tab = {
      id: generateTabId(),
      type: 'editor',
      noteId,
      title
    }

    set({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id
    })
  },

  openCanvasTab: (rootNoteId, title) => {
    const state = get()

    // Check if canvas tab for this note already exists
    const existingTab = state.tabs.find(t => t.type === 'canvas' && t.noteId === rootNoteId)
    if (existingTab) {
      set({ activeTabId: existingTab.id })
      return
    }

    const newTab: Tab = {
      id: generateTabId(),
      type: 'canvas',
      noteId: rootNoteId,
      title: `Canvas: ${title}`
    }

    // Initialize canvas state for this tab
    const canvasState: CanvasTabState = {
      rootNoteId,
      expandedNoteIds: new Set(),
      depth: 1,
      viewport: { x: 0, y: 0, zoom: 1 }
    }

    set({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
      canvasStates: {
        ...state.canvasStates,
        [newTab.id]: canvasState
      }
    })
  },

  openGlobalCanvasTab: () => {
    const state = get()

    // Check if global canvas tab already exists
    const existingTab = state.tabs.find(t => t.type === 'global-canvas')
    if (existingTab) {
      set({ activeTabId: existingTab.id })
      return
    }

    const newTab: Tab = {
      id: generateTabId(),
      type: 'global-canvas',
      noteId: '',  // Not used for global canvas
      title: 'Alle Notizen'
    }

    set({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id
    })
  },

  closeTab: (tabId) => {
    const state = get()
    const tabIndex = state.tabs.findIndex(t => t.id === tabId)
    if (tabIndex === -1) return

    const closedTab = state.tabs[tabIndex]
    const newTabs = state.tabs.filter(t => t.id !== tabId)

    // Clean up canvas state if it was a canvas tab
    const newCanvasStates = { ...state.canvasStates }
    if (closedTab.type === 'canvas') {
      delete newCanvasStates[tabId]
    }

    // Determine new active tab
    let newActiveTabId: string | null = null
    if (state.activeTabId === tabId && newTabs.length > 0) {
      // Activate the tab to the left, or the first tab if closing the first one
      const newIndex = Math.max(0, tabIndex - 1)
      newActiveTabId = newTabs[newIndex]?.id || null
    } else if (state.activeTabId !== tabId) {
      newActiveTabId = state.activeTabId
    }

    set({
      tabs: newTabs,
      activeTabId: newActiveTabId,
      canvasStates: newCanvasStates
    })
  },

  setActiveTab: (tabId) => {
    const state = get()
    if (state.tabs.some(t => t.id === tabId)) {
      set({ activeTabId: tabId })
    }
  },

  expandNode: (tabId, noteId) => {
    const state = get()
    const canvasState = state.canvasStates[tabId]
    if (!canvasState) return

    const newExpandedIds = new Set(canvasState.expandedNoteIds)
    newExpandedIds.add(noteId)

    set({
      canvasStates: {
        ...state.canvasStates,
        [tabId]: {
          ...canvasState,
          expandedNoteIds: newExpandedIds
        }
      }
    })
  },

  collapseNode: (tabId, noteId) => {
    const state = get()
    const canvasState = state.canvasStates[tabId]
    if (!canvasState) return

    const newExpandedIds = new Set(canvasState.expandedNoteIds)
    newExpandedIds.delete(noteId)

    set({
      canvasStates: {
        ...state.canvasStates,
        [tabId]: {
          ...canvasState,
          expandedNoteIds: newExpandedIds
        }
      }
    })
  },

  setCanvasViewport: (tabId, viewport) => {
    const state = get()
    const canvasState = state.canvasStates[tabId]
    if (!canvasState) return

    set({
      canvasStates: {
        ...state.canvasStates,
        [tabId]: {
          ...canvasState,
          viewport
        }
      }
    })
  },

  resetCanvasTab: (tabId) => {
    const state = get()
    const canvasState = state.canvasStates[tabId]
    if (!canvasState) return

    set({
      canvasStates: {
        ...state.canvasStates,
        [tabId]: {
          ...canvasState,
          expandedNoteIds: new Set(),
          depth: 1,
          viewport: { x: 0, y: 0, zoom: 1 }
        }
      }
    })
  },

  getCanvasState: (tabId) => {
    return get().canvasStates[tabId]
  },

  hasCanvasTabForNote: (noteId) => {
    return get().tabs.some(t => t.type === 'canvas' && t.noteId === noteId)
  },

  clearAllTabs: () => {
    set({
      tabs: [],
      activeTabId: null,
      canvasStates: {}
    })
  }
}))
