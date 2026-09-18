import { create } from 'zustand'
import type { VaultFeatures, VaultSettings } from '../../shared/types'

const DEFAULT_FEATURES: VaultFeatures = {
  readwise: false,
  email: false,
  dailyNote: false,
  edoobox: false,
  remarkable: false
}

interface VaultSettingsState {
  currentVaultPath: string
  features: VaultFeatures
  isLoaded: boolean
  /** Alles, was Main-seitige Teile in der Datei halten (z.B. `vaultRag`) — wird beim Speichern erhalten. */
  extra: Record<string, unknown>

  loadForVault: (vaultPath: string) => Promise<void>
  setFeatureActive: (key: keyof VaultFeatures, active: boolean) => Promise<void>
  isFeatureActive: (key: keyof VaultFeatures) => boolean
}


export const useVaultSettingsStore = create<VaultSettingsState>()((set, get) => ({
  currentVaultPath: '',
  features: { ...DEFAULT_FEATURES },
  isLoaded: false,
  extra: {},

  loadForVault: async (vaultPath: string) => {
    // Reset bei Vault-Wechsel
    set({ currentVaultPath: vaultPath, features: { ...DEFAULT_FEATURES }, isLoaded: false, extra: {} })

    try {
      const saved = await window.electronAPI.loadVaultSettings(vaultPath) as (VaultSettings & Record<string, unknown>) | null
      if (saved && saved.features) {
        // Deep merge mit Defaults (Forward-Kompatibilität für neue Features)
        const merged = { ...DEFAULT_FEATURES, ...saved.features }
        const { schemaVersion: _sv, features: _f, ...extra } = saved
        void _sv; void _f
        set({ features: merged, isLoaded: true, extra })
        console.log('[VaultSettings] Loaded for vault:', vaultPath, merged)
      } else {
        // Keine vault-settings.json → Defaults verwenden (alle Features deaktiviert)
        set({ isLoaded: true })
        console.log('[VaultSettings] No vault settings found, using defaults (all disabled)')
      }
    } catch (error) {
      console.error('[VaultSettings] Failed to load:', error)
      set({ isLoaded: true })
    }
  },

  setFeatureActive: async (key: keyof VaultFeatures, active: boolean) => {
    const { currentVaultPath, features, extra } = get()
    if (!currentVaultPath) return

    const updated = { ...features, [key]: active }
    set({ features: updated })

    // Fremde Schlüssel mitschreiben — sonst löscht ein Feature-Toggle das Vault-RAG-Opt-in.
    const settings: VaultSettings & Record<string, unknown> = {
      ...extra,
      schemaVersion: 1,
      features: updated
    }
    await window.electronAPI.saveVaultSettings(currentVaultPath, settings)
    console.log(`[VaultSettings] ${key} = ${active} for vault:`, currentVaultPath)
  },

  isFeatureActive: (key: keyof VaultFeatures) => {
    return get().features[key]
  }
}))
