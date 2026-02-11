import { create } from 'zustand'
import type { SyncProgress, SyncResult } from '../../shared/types'

const DEFAULT_RELAY_URL = 'wss://sync.mindgraph-notes.de'
const DEFAULT_SYNC_INTERVAL = 300

interface SyncState {
  // State
  syncEnabled: boolean
  vaultId: string
  relayUrl: string
  autoSync: boolean
  syncInterval: number
  lastSyncTime: number | null
  syncStatus: SyncProgress['status']
  syncProgress: { current: number; total: number; fileName?: string }
  syncError: string | null

  // Actions
  initSync: (vaultPath: string, passphrase: string) => Promise<string>
  joinSync: (vaultPath: string, vaultId: string, passphrase: string) => Promise<void>
  triggerSync: () => Promise<SyncResult>
  disableSync: () => Promise<void>
  setAutoSync: (enabled: boolean) => void
  setSyncInterval: (seconds: number) => void
  setRelayUrl: (url: string) => void
  loadSyncState: () => void
  saveSyncState: () => void
}

const STORAGE_KEY = 'mindgraph-sync'

function loadPersistedState(): Partial<SyncState> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        syncEnabled: parsed.syncEnabled || false,
        vaultId: parsed.vaultId || '',
        relayUrl: parsed.relayUrl || DEFAULT_RELAY_URL,
        autoSync: parsed.autoSync ?? true,
        syncInterval: parsed.syncInterval || DEFAULT_SYNC_INTERVAL,
        lastSyncTime: parsed.lastSyncTime || null
      }
    }
  } catch {
    // ignore
  }
  return {}
}

function savePersistedState(state: SyncState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      syncEnabled: state.syncEnabled,
      vaultId: state.vaultId,
      relayUrl: state.relayUrl,
      autoSync: state.autoSync,
      syncInterval: state.syncInterval,
      lastSyncTime: state.lastSyncTime
    }))
  } catch {
    // ignore
  }
}

export const useSyncStore = create<SyncState>()((set, get) => ({
  syncEnabled: false,
  vaultId: '',
  relayUrl: DEFAULT_RELAY_URL,
  autoSync: true,
  syncInterval: DEFAULT_SYNC_INTERVAL,
  lastSyncTime: null,
  syncStatus: 'idle',
  syncProgress: { current: 0, total: 0 },
  syncError: null,

  ...loadPersistedState(),

  initSync: async (vaultPath: string, passphrase: string) => {
    const { relayUrl, autoSync, syncInterval } = get()
    const url = relayUrl || DEFAULT_RELAY_URL
    const interval = autoSync ? syncInterval : 0
    const result = await window.electronAPI.syncSetup(vaultPath, passphrase, url, interval)
    await window.electronAPI.syncSavePassphrase(passphrase)

    set({
      syncEnabled: true,
      vaultId: result.vaultId,
      relayUrl: url,
      syncStatus: 'idle'
    })
    savePersistedState(get())

    return result.vaultId
  },

  joinSync: async (vaultPath: string, vaultId: string, passphrase: string) => {
    const { relayUrl, autoSync, syncInterval } = get()
    const url = relayUrl || DEFAULT_RELAY_URL
    const interval = autoSync ? syncInterval : 0
    await window.electronAPI.syncJoin(vaultPath, vaultId, passphrase, url, interval)
    await window.electronAPI.syncSavePassphrase(passphrase)

    set({
      syncEnabled: true,
      vaultId,
      relayUrl: url,
      syncStatus: 'idle'
    })
    savePersistedState(get())
  },

  triggerSync: async () => {
    set({ syncStatus: 'connecting' })
    const result = await window.electronAPI.syncNow()

    if (result.success) {
      set({
        syncStatus: 'done',
        lastSyncTime: Date.now(),
        syncError: null
      })
    } else {
      set({
        syncStatus: 'error',
        syncError: result.error || 'Sync failed'
      })
    }

    savePersistedState(get())
    return result
  },

  disableSync: async () => {
    await window.electronAPI.syncDisable()
    set({
      syncEnabled: false,
      vaultId: '',
      syncStatus: 'idle',
      lastSyncTime: null,
      syncError: null,
      syncProgress: { current: 0, total: 0 }
    })
    savePersistedState(get())
  },

  setAutoSync: (enabled: boolean) => {
    set({ autoSync: enabled })
    savePersistedState(get())
    const { syncEnabled, syncInterval } = get()
    if (syncEnabled) {
      window.electronAPI.syncSetAutoSync(enabled ? syncInterval : 0)
    }
  },

  setSyncInterval: (seconds: number) => {
    const interval = Math.max(60, seconds)
    set({ syncInterval: interval })
    savePersistedState(get())
    const { syncEnabled, autoSync } = get()
    if (syncEnabled && autoSync) {
      window.electronAPI.syncSetAutoSync(interval)
    }
  },

  setRelayUrl: (url: string) => {
    set({ relayUrl: url })
    savePersistedState(get())
  },

  loadSyncState: () => {
    const persisted = loadPersistedState()
    set(persisted)
  },

  saveSyncState: () => {
    savePersistedState(get())
  }
}))

// Set up sync progress listener
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.onSyncProgress((data: SyncProgress) => {
    useSyncStore.setState({
      syncStatus: data.status,
      syncProgress: {
        current: data.current,
        total: data.total,
        fileName: data.fileName
      },
      syncError: data.error || null,
      ...(data.status === 'done' ? { lastSyncTime: Date.now() } : {})
    })
  })
}
