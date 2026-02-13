import { create } from 'zustand'
import type { SyncProgress, SyncResult } from '../../shared/types'

const DEFAULT_RELAY_URL = ''
const DEFAULT_SYNC_INTERVAL = 300
const LEGACY_STORAGE_KEY = 'mindgraph-sync'

interface PersistedSyncConfig {
  syncEnabled: boolean
  vaultId: string
  vaultName: string
  relayUrl: string
  activationCode: string
  autoSync: boolean
  syncInterval: number
  lastSyncTime: number | null
  savedForVault: string  // vault path this config was saved for (safety check)
}

interface SyncState extends PersistedSyncConfig {
  // Transient state (not persisted)
  currentVaultPath: string
  syncStatus: SyncProgress['status']
  syncProgress: { current: number; total: number; fileName?: string }
  syncError: string | null

  // Actions
  loadForVault: (vaultPath: string) => Promise<void>
  initSync: (vaultPath: string, passphrase: string, activationCode: string) => Promise<string>
  joinSync: (vaultPath: string, vaultId: string, passphrase: string, activationCode: string) => Promise<void>
  restoreSync: (vaultPath: string) => Promise<boolean>
  triggerSync: () => Promise<SyncResult>
  disableSync: () => Promise<void>
  setAutoSync: (enabled: boolean) => void
  setSyncInterval: (seconds: number) => void
  setRelayUrl: (url: string) => void
  loadSyncState: () => void
  saveSyncState: () => void
}

function getStorageKey(vaultPath: string): string {
  return `mindgraph-sync::${vaultPath}`
}

function getVaultName(vaultPath: string): string {
  return vaultPath.split(/[/\\]/).filter(Boolean).pop() || 'Vault'
}

const DEFAULT_CONFIG: PersistedSyncConfig = {
  syncEnabled: false,
  vaultId: '',
  vaultName: '',
  relayUrl: DEFAULT_RELAY_URL,
  activationCode: '',
  autoSync: true,
  syncInterval: DEFAULT_SYNC_INTERVAL,
  lastSyncTime: null,
  savedForVault: ''
}

function loadPersistedStateForVault(vaultPath: string): PersistedSyncConfig {
  if (!vaultPath) return { ...DEFAULT_CONFIG }

  try {
    const key = getStorageKey(vaultPath)
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)

      // Safety check: if config was saved for a different vault, ignore it
      if (parsed.savedForVault && parsed.savedForVault !== vaultPath) {
        console.warn('[SyncStore] Config mismatch: saved for', parsed.savedForVault, 'but loading for', vaultPath, '— ignoring')
        localStorage.removeItem(key)
        return { ...DEFAULT_CONFIG }
      }

      return {
        syncEnabled: parsed.syncEnabled || false,
        vaultId: parsed.vaultId || '',
        vaultName: parsed.vaultName || '',
        relayUrl: parsed.relayUrl || DEFAULT_RELAY_URL,
        activationCode: parsed.activationCode || '',
        autoSync: parsed.autoSync ?? true,
        syncInterval: parsed.syncInterval || DEFAULT_SYNC_INTERVAL,
        lastSyncTime: parsed.lastSyncTime || null,
        savedForVault: vaultPath
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG }
}

function savePersistedStateForVault(vaultPath: string, config: PersistedSyncConfig): void {
  if (!vaultPath) return

  try {
    const key = getStorageKey(vaultPath)
    localStorage.setItem(key, JSON.stringify({
      syncEnabled: config.syncEnabled,
      vaultId: config.vaultId,
      vaultName: config.vaultName,
      relayUrl: config.relayUrl,
      activationCode: config.activationCode,
      autoSync: config.autoSync,
      syncInterval: config.syncInterval,
      lastSyncTime: config.lastSyncTime,
      savedForVault: vaultPath
    }))
  } catch {
    // ignore
  }
}

/** Migrate legacy global key to per-vault key if it exists */
function migrateLegacyConfig(vaultPath: string): PersistedSyncConfig | null {
  if (!vaultPath) return null

  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!legacy) return null

    const parsed = JSON.parse(legacy)
    if (!parsed.syncEnabled) {
      // Not active, just remove legacy key
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      return null
    }

    // Migrate: save under the per-vault key
    const config: PersistedSyncConfig = {
      syncEnabled: parsed.syncEnabled || false,
      vaultId: parsed.vaultId || '',
      vaultName: parsed.vaultName || '',
      relayUrl: parsed.relayUrl || DEFAULT_RELAY_URL,
      activationCode: parsed.activationCode || '',
      autoSync: parsed.autoSync ?? true,
      syncInterval: parsed.syncInterval || DEFAULT_SYNC_INTERVAL,
      lastSyncTime: parsed.lastSyncTime || null,
      savedForVault: vaultPath
    }
    savePersistedStateForVault(vaultPath, config)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    console.log('[SyncStore] Migrated legacy sync config to per-vault key:', vaultPath)
    return config
  } catch {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    return null
  }
}

function getCurrentConfig(state: SyncState): PersistedSyncConfig {
  return {
    syncEnabled: state.syncEnabled,
    vaultId: state.vaultId,
    vaultName: state.vaultName,
    relayUrl: state.relayUrl,
    activationCode: state.activationCode,
    autoSync: state.autoSync,
    syncInterval: state.syncInterval,
    lastSyncTime: state.lastSyncTime,
    savedForVault: state.currentVaultPath
  }
}

export const useSyncStore = create<SyncState>()((set, get) => ({
  // Persisted (per-vault)
  syncEnabled: false,
  vaultId: '',
  vaultName: '',
  relayUrl: DEFAULT_RELAY_URL,
  activationCode: '',
  autoSync: true,
  syncInterval: DEFAULT_SYNC_INTERVAL,
  lastSyncTime: null,

  // Transient
  currentVaultPath: '',
  syncStatus: 'idle',
  syncProgress: { current: 0, total: 0 },
  syncError: null,

  loadForVault: async (vaultPath: string) => {
    const { currentVaultPath, syncEnabled } = get()

    // Same vault, nothing to do
    if (vaultPath === currentVaultPath) return

    // ALWAYS disconnect any active sync first — wait for it to fully complete
    if (syncEnabled || currentVaultPath) {
      try {
        await window.electronAPI.syncDisable()
        console.log('[SyncStore] Disconnected sync before vault switch')
      } catch {
        // ignore disconnect errors
      }
    }

    // Try migration first (legacy global key → per-vault key)
    const migrated = migrateLegacyConfig(vaultPath)
    const config = migrated || loadPersistedStateForVault(vaultPath)

    // Safety: verify config belongs to this vault
    if (config.syncEnabled && config.savedForVault && config.savedForVault !== vaultPath) {
      console.error('[SyncStore] SAFETY: Config saved for different vault, ignoring!', config.savedForVault, '!=', vaultPath)
      set({
        ...DEFAULT_CONFIG,
        currentVaultPath: vaultPath,
        syncStatus: 'idle',
        syncProgress: { current: 0, total: 0 },
        syncError: null
      })
      return
    }

    set({
      ...config,
      currentVaultPath: vaultPath,
      syncStatus: 'idle',
      syncProgress: { current: 0, total: 0 },
      syncError: null
    })

    // Auto-restore sync ONLY if config is valid for this vault
    if (config.syncEnabled && config.vaultId && config.relayUrl) {
      const url = config.relayUrl
      const interval = config.autoSync ? config.syncInterval : 0
      try {
        console.log('[SyncStore] Auto-restoring sync for vault:', vaultPath, 'vaultId:', config.vaultId.slice(0, 12) + '...')
        const success = await window.electronAPI.syncRestore(vaultPath, config.vaultId, url, interval)
        if (success) {
          set({ syncStatus: 'idle' })
          console.log('[SyncStore] Auto-restored sync for vault:', vaultPath)
        } else {
          console.warn('[SyncStore] Could not auto-restore sync for vault:', vaultPath)
        }
      } catch (err) {
        console.error('[SyncStore] Auto-restore failed:', err)
      }
    }
  },

  initSync: async (vaultPath: string, passphrase: string, activationCode: string) => {
    const { relayUrl, autoSync, syncInterval } = get()
    const url = relayUrl
    const interval = autoSync ? syncInterval : 0
    const result = await window.electronAPI.syncSetup(vaultPath, passphrase, url, interval, activationCode)
    await window.electronAPI.syncSavePassphrase(passphrase)

    set({
      syncEnabled: true,
      vaultId: result.vaultId,
      vaultName: getVaultName(vaultPath),
      relayUrl: url,
      activationCode,
      currentVaultPath: vaultPath,
      syncStatus: 'idle'
    })
    savePersistedStateForVault(vaultPath, getCurrentConfig(get()))

    return result.vaultId
  },

  joinSync: async (vaultPath: string, vaultId: string, passphrase: string, activationCode: string) => {
    const { relayUrl, autoSync, syncInterval } = get()
    const url = relayUrl
    const interval = autoSync ? syncInterval : 0
    await window.electronAPI.syncJoin(vaultPath, vaultId, passphrase, url, interval, activationCode)
    await window.electronAPI.syncSavePassphrase(passphrase)

    set({
      syncEnabled: true,
      vaultId,
      vaultName: getVaultName(vaultPath),
      relayUrl: url,
      activationCode,
      currentVaultPath: vaultPath,
      syncStatus: 'idle'
    })
    savePersistedStateForVault(vaultPath, getCurrentConfig(get()))
  },

  restoreSync: async (vaultPath: string) => {
    const { syncEnabled, vaultId, relayUrl, autoSync, syncInterval, vaultName } = get()
    if (!syncEnabled || !vaultId) return false

    const url = relayUrl || DEFAULT_RELAY_URL
    const interval = autoSync ? syncInterval : 0

    try {
      const success = await window.electronAPI.syncRestore(vaultPath, vaultId, url, interval)
      if (success) {
        const currentName = getVaultName(vaultPath)
        if (currentName !== vaultName) {
          set({ vaultName: currentName })
          savePersistedStateForVault(vaultPath, getCurrentConfig(get()))
        }
        set({ syncStatus: 'idle', currentVaultPath: vaultPath })
      }
      return success
    } catch (err) {
      console.error('[SyncStore] Restore failed:', err)
      return false
    }
  },

  triggerSync: async () => {
    const vaultPathBefore = get().currentVaultPath
    set({ syncStatus: 'connecting' })
    const result = await window.electronAPI.syncNow()

    // Safety: if vault changed during sync, don't update state
    const { currentVaultPath } = get()
    if (currentVaultPath !== vaultPathBefore) {
      console.warn('[SyncStore] Vault changed during sync, discarding result')
      return result
    }

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

    savePersistedStateForVault(currentVaultPath, getCurrentConfig(get()))
    return result
  },

  disableSync: async () => {
    await window.electronAPI.syncDisable()
    const { currentVaultPath } = get()
    set({
      syncEnabled: false,
      vaultId: '',
      vaultName: '',
      syncStatus: 'idle',
      lastSyncTime: null,
      syncError: null,
      syncProgress: { current: 0, total: 0 }
    })
    savePersistedStateForVault(currentVaultPath, getCurrentConfig(get()))
  },

  setAutoSync: (enabled: boolean) => {
    set({ autoSync: enabled })
    const { currentVaultPath, syncEnabled, syncInterval } = get()
    savePersistedStateForVault(currentVaultPath, getCurrentConfig(get()))
    if (syncEnabled) {
      window.electronAPI.syncSetAutoSync(enabled ? syncInterval : 0)
    }
  },

  setSyncInterval: (seconds: number) => {
    const interval = Math.max(60, seconds)
    set({ syncInterval: interval })
    const { currentVaultPath, syncEnabled, autoSync } = get()
    savePersistedStateForVault(currentVaultPath, getCurrentConfig(get()))
    if (syncEnabled && autoSync) {
      window.electronAPI.syncSetAutoSync(interval)
    }
  },

  setRelayUrl: (url: string) => {
    set({ relayUrl: url })
    const { currentVaultPath } = get()
    savePersistedStateForVault(currentVaultPath, getCurrentConfig(get()))
  },

  loadSyncState: () => {
    const { currentVaultPath } = get()
    if (currentVaultPath) {
      const config = loadPersistedStateForVault(currentVaultPath)
      set(config)
    }
  },

  saveSyncState: () => {
    const { currentVaultPath } = get()
    savePersistedStateForVault(currentVaultPath, getCurrentConfig(get()))
  }
}))

// Set up sync progress listener
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.onSyncProgress((data: SyncProgress) => {
    const state = useSyncStore.getState()
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

    // Persist lastSyncTime when sync completes — only if vault didn't change
    if (data.status === 'done' && state.currentVaultPath && state.syncEnabled) {
      const currentState = useSyncStore.getState()
      // Only persist if vault path hasn't changed since the sync started
      if (currentState.currentVaultPath === state.currentVaultPath) {
        savePersistedStateForVault(state.currentVaultPath, getCurrentConfig({
          ...currentState,
          syncStatus: data.status,
          lastSyncTime: Date.now()
        } as SyncState))
      }
    }
  })
}
