import { create } from 'zustand'
import type { SyncProgress, SyncResult, SyncLogEntry, SyncFailure, SecretStorageProblem } from '../../shared/types'

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
  excludeFolders: string[]
  excludeExtensions: string[]
}

/**
 * Alles, was zum LETZTEN Vault gehört und beim Wechsel mitwandern würde.
 *
 * Der Wechsel überschrieb bisher nur die Grundfelder; Fehlerliste, Protokollpfad,
 * Ereignisliste und Speicherwarnung blieben stehen. Der Nutzer sah damit Fehler und
 * absolute Pfade eines anderen Vaults und ordnete sie dem falschen zu.
 */
const TRANSIENTER_LEERSTAND = {
  syncStatus: 'idle' as const,
  syncProgress: { current: 0, total: 0 },
  syncError: null,
  syncLog: [],
  syncFailures: [],
  syncLogFile: null,
  syncPreviousLogFile: null,
  secretStorageIssue: null
}

interface SyncState extends PersistedSyncConfig {
  // Transient state (not persisted)
  currentVaultPath: string
  syncStatus: SyncProgress['status']
  syncProgress: { current: number; total: number; fileName?: string }
  syncError: string | null
  syncLog: SyncLogEntry[]
  /** Alle Dateien des letzten Laufs, die nicht übertragen wurden — nicht nur die erste. */
  syncFailures: SyncFailure[]
  /** Pfad des Protokolls auf der Platte (überlebt den Neustart). */
  syncLogFile: string | null
  /** Pfad des vorherigen Protokollstands — das Protokoll rotiert bei 2 MB. */
  syncPreviousLogFile: string | null
  /**
   * Der geschützte Speicher hat die Passphrase nicht angenommen bzw. nicht mehr
   * hergegeben. Eigenes Feld und NICHT `syncError`: der Fehler gehört zur Einrichtung,
   * nicht zu einem Lauf, und darf vom nächsten Sync-Status nicht überschrieben werden.
   */
  secretStorageIssue: { problem: SecretStorageProblem | 'no-credentials' | 'join-failed'; backend?: string } | null

  // Actions
  loadForVault: (vaultPath: string) => Promise<void>
  initSync: (vaultPath: string, passphrase: string, activationCode: string) => Promise<string>
  joinSync: (vaultPath: string, vaultId: string, passphrase: string, activationCode: string) => Promise<void>
  restoreSync: (vaultPath: string) => Promise<boolean>
  dismissSecretStorageIssue: () => void
  triggerSync: (force?: boolean) => Promise<SyncResult>
  disableSync: () => Promise<void>
  setAutoSync: (enabled: boolean) => void
  setSyncInterval: (seconds: number) => void
  setRelayUrl: (url: string) => void
  setExcludeFolders: (folders: string[]) => void
  setExcludeExtensions: (exts: string[]) => void
  addSyncLogEntry: (entry: Omit<SyncLogEntry, 'timestamp'>) => void
  clearSyncLog: () => void
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
  savedForVault: '',
  excludeFolders: [],
  excludeExtensions: []
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
        savedForVault: vaultPath,
        excludeFolders: parsed.excludeFolders || [],
        excludeExtensions: parsed.excludeExtensions || []
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
      savedForVault: vaultPath,
      excludeFolders: config.excludeFolders,
      excludeExtensions: config.excludeExtensions
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
      savedForVault: vaultPath,
      excludeFolders: parsed.excludeFolders || [],
      excludeExtensions: parsed.excludeExtensions || []
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
    savedForVault: state.currentVaultPath,
    excludeFolders: state.excludeFolders,
    excludeExtensions: state.excludeExtensions
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
  excludeFolders: [],
  excludeExtensions: [],
  savedForVault: '',

  // Transient
  currentVaultPath: '',
  syncStatus: 'idle',
  syncProgress: { current: 0, total: 0 },
  syncError: null,
  syncLog: [],
  syncFailures: [],
  syncLogFile: null,
  syncPreviousLogFile: null,
  secretStorageIssue: null,

  loadForVault: async (vaultPath: string) => {
    const { currentVaultPath, syncEnabled } = get()

    // Same vault, nothing to do
    if (vaultPath === currentVaultPath) return

    // Disconnect any active sync first — only if there's actually a sync running
    if (syncEnabled && currentVaultPath) {
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
        ...TRANSIENTER_LEERSTAND,
        currentVaultPath: vaultPath
      })
      return
    }

    set({
      ...config,
      ...TRANSIENTER_LEERSTAND,
      currentVaultPath: vaultPath
    })

    // Auto-restore sync ONLY if config is valid for this vault
    // Fire-and-forget: don't block vault loading while connecting to relay server
    if (config.syncEnabled && config.vaultId && config.relayUrl) {
      const url = config.relayUrl
      const interval = config.autoSync ? config.syncInterval : 0
      console.log('[SyncStore] Auto-restoring sync for vault:', vaultPath, 'vaultId:', config.vaultId.slice(0, 12) + '...')
      window.electronAPI.syncRestore(vaultPath, config.vaultId, url, interval)
        .then(ergebnis => {
          // Safety: check vault hasn't changed while we were connecting
          if (get().currentVaultPath !== vaultPath) return
          if (ergebnis.restored) {
            set({ syncStatus: 'idle', secretStorageIssue: null })
            // Push exclude config to engine after restore
            if (config.excludeFolders.length || config.excludeExtensions.length) {
              window.electronAPI.syncSetExcludeConfig({ folders: config.excludeFolders, extensions: config.excludeExtensions })
            }
            console.log('[SyncStore] Auto-restored sync for vault:', vaultPath)
          } else {
            // Bis hierher war das NUR eine Konsolenzeile. Der Nutzer sah einen
            // eingerichteten Sync, der nie lief, und beim Knopfdruck „Sync not
            // initialized" — die Ursache stand in einem Fenster, das niemand öffnet.
            console.warn('[SyncStore] Could not auto-restore sync for vault:', vaultPath, ergebnis.problem)
            set({ secretStorageIssue: { problem: ergebnis.problem ?? 'no-credentials', backend: ergebnis.backend } })
          }
        })
        .catch(err => {
          if (get().currentVaultPath !== vaultPath) return
          console.error('[SyncStore] Auto-restore failed:', err)
        })
    }
  },

  initSync: async (vaultPath: string, passphrase: string, activationCode: string) => {
    const { relayUrl, autoSync, syncInterval } = get()
    const url = relayUrl
    const interval = autoSync ? syncInterval : 0
    const result = await window.electronAPI.syncSetup(vaultPath, passphrase, url, interval, activationCode)
    const stored = await window.electronAPI.syncSavePassphrase(passphrase)

    set({
      secretStorageIssue: stored.saved ? null : { problem: stored.problem ?? 'write-failed', backend: stored.backend },
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
    // Der Rückgabewert wurde hier früher weggeworfen. Konnte der geschützte Speicher die
    // Passphrase nicht annehmen (unter Linux der Regelfall auf einem Desktop, den
    // Chromium nicht kennt), meldete die App trotzdem „eingerichtet" — und beim nächsten
    // Start stand nur „Sync not initialized" da, ohne Grund und ohne Weg zurück.
    const stored = await window.electronAPI.syncSavePassphrase(passphrase)

    set({
      secretStorageIssue: stored.saved ? null : { problem: stored.problem ?? 'write-failed', backend: stored.backend },
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
      const ergebnis = await window.electronAPI.syncRestore(vaultPath, vaultId, url, interval)
      if (ergebnis.restored) {
        const currentName = getVaultName(vaultPath)
        if (currentName !== vaultName) {
          set({ vaultName: currentName })
          savePersistedStateForVault(vaultPath, getCurrentConfig(get()))
        }
        set({ syncStatus: 'idle', currentVaultPath: vaultPath, secretStorageIssue: null })
      } else {
        set({ secretStorageIssue: { problem: ergebnis.problem ?? 'no-credentials', backend: ergebnis.backend } })
      }
      return ergebnis.restored
    } catch (err) {
      console.error('[SyncStore] Restore failed:', err)
      return false
    }
  },

  dismissSecretStorageIssue: () => set({ secretStorageIssue: null }),

  triggerSync: async (force?: boolean) => {
    const vaultPathBefore = get().currentVaultPath
    set({ syncStatus: 'connecting' })
    const result = await window.electronAPI.syncNow(force)

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
        syncError: null,
        syncFailures: [],
        syncLogFile: result.logFile ?? null,
        syncPreviousLogFile: result.previousLogFile ?? null,
        // F05: Ein geglückter Lauf beweist, dass die Verbindung wieder steht — also darf
        // ein `join-failed` von vorhin verschwinden. Ein `no-encryption` NICHT: der Sync
        // läuft dann zwar, die Passphrase ist aber weiterhin nicht abgelegt, und genau
        // diese Warnung muss bis zur Behebung stehen bleiben. Sonst entsteht die stille
        // Falle neu, gegen die diese ganze Änderung antritt.
        ...(get().secretStorageIssue?.problem === 'join-failed' ? { secretStorageIssue: null } : {})
      })
    } else {
      set({
        syncStatus: 'error',
        syncError: result.error || 'Sync failed',
        syncFailures: result.failures ?? [],
        syncLogFile: result.logFile ?? null,
        syncPreviousLogFile: result.previousLogFile ?? null
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
      syncFailures: [],
      syncLogFile: null,
      syncPreviousLogFile: null,
      secretStorageIssue: null,
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

  setExcludeFolders: (folders: string[]) => {
    set({ excludeFolders: folders })
    const { currentVaultPath, syncEnabled } = get()
    savePersistedStateForVault(currentVaultPath, getCurrentConfig(get()))
    if (syncEnabled) {
      window.electronAPI.syncSetExcludeConfig({ folders, extensions: get().excludeExtensions })
    }
  },

  setExcludeExtensions: (exts: string[]) => {
    set({ excludeExtensions: exts })
    const { currentVaultPath, syncEnabled } = get()
    savePersistedStateForVault(currentVaultPath, getCurrentConfig(get()))
    if (syncEnabled) {
      window.electronAPI.syncSetExcludeConfig({ folders: get().excludeFolders, extensions: exts })
    }
  },

  addSyncLogEntry: (entry: Omit<SyncLogEntry, 'timestamp'>) => {
    const { syncLog } = get()
    const newEntry: SyncLogEntry = { ...entry, timestamp: Date.now() }
    const newLog = [newEntry, ...syncLog].slice(0, 200)
    set({ syncLog: newLog })
  },

  clearSyncLog: () => {
    set({ syncLog: [] })
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

// Set up sync log listener
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.onSyncLog((entry) => {
    useSyncStore.getState().addSyncLogEntry(entry)
  })
}

// Set up sync progress listener
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.onSyncProgress((data: SyncProgress) => {
    const state = useSyncStore.getState()
    // Abschlussdaten eines Laufs, egal wer ihn gestartet hat (s. SyncProgress.failures).
    // Ein Lauf eines ANDEREN Vaults darf diese Felder nicht beschreiben.
    const eigenerVault = !data.vaultPath || data.vaultPath === state.currentVaultPath
    const abschluss =
      data.status === 'error' && eigenerVault
        ? {
            syncFailures: data.failures ?? [],
            syncLogFile: data.logFile ?? null,
            syncPreviousLogFile: data.previousLogFile ?? null
          }
        : data.status === 'done'
          ? {
              lastSyncTime: Date.now(),
              // Ein geglückter Lauf räumt die Liste des vorherigen ab — sonst steht sie
              // weiter als „letzter Lauf" da.
              syncFailures: [],
              // Nur `join-failed` verschwindet; `no-encryption` bleibt (s. triggerSync).
              ...(state.secretStorageIssue?.problem === 'join-failed' ? { secretStorageIssue: null } : {})
            }
          : {}
    useSyncStore.setState({
      syncStatus: data.status,
      syncProgress: {
        current: data.current,
        total: data.total,
        fileName: data.fileName
      },
      syncError: data.error || null,
      ...abschluss
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
