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

  loadForVault: (vaultPath: string) => Promise<void>
  setFeatureActive: (key: keyof VaultFeatures, active: boolean) => Promise<void>
  isFeatureActive: (key: keyof VaultFeatures) => boolean
}

// Einmalige Migration: Wenn keine vault-settings.json existiert, global aktivierte Features
// automatisch für dieses Vault übernehmen (verhindert dass bestehende Vaults alles verlieren)
function migrateFromGlobalSettings(): VaultFeatures {
  try {
    // Dynamischer Import um zirkuläre Abhängigkeiten zu vermeiden
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useUIStore } = require('./uiStore')
    const state = useUIStore.getState()
    return {
      readwise: state.readwise?.enabled && state.readwise?.apiKey !== '' || false,
      email: state.email?.enabled && state.email?.accounts?.length > 0 || false,
      dailyNote: state.dailyNote?.enabled || false,
      edoobox: state.edoobox?.enabled || false,
      remarkable: state.remarkable?.enabled || false
    }
  } catch {
    return { ...DEFAULT_FEATURES }
  }
}

export const useVaultSettingsStore = create<VaultSettingsState>()((set, get) => ({
  currentVaultPath: '',
  features: { ...DEFAULT_FEATURES },
  isLoaded: false,

  loadForVault: async (vaultPath: string) => {
    // Reset bei Vault-Wechsel
    set({ currentVaultPath: vaultPath, features: { ...DEFAULT_FEATURES }, isLoaded: false })

    try {
      const saved = await window.electronAPI.loadVaultSettings(vaultPath) as VaultSettings | null
      if (saved && saved.features) {
        // Deep merge mit Defaults (Forward-Kompatibilität für neue Features)
        const merged = { ...DEFAULT_FEATURES, ...saved.features }
        set({ features: merged, isLoaded: true })
        console.log('[VaultSettings] Loaded for vault:', vaultPath, merged)
      } else {
        // Keine vault-settings.json vorhanden → Migration von globalen Settings
        const migrated = migrateFromGlobalSettings()
        const hasAnyActive = Object.values(migrated).some(v => v)

        if (hasAnyActive) {
          // Speichern damit die Migration nur einmal passiert
          const settings: VaultSettings = { schemaVersion: 1, features: migrated }
          await window.electronAPI.saveVaultSettings(vaultPath, settings)
          set({ features: migrated, isLoaded: true })
          console.log('[VaultSettings] Migrated from global settings:', migrated)
        } else {
          set({ isLoaded: true })
          console.log('[VaultSettings] No vault settings found, using defaults (all disabled)')
        }
      }
    } catch (error) {
      console.error('[VaultSettings] Failed to load:', error)
      set({ isLoaded: true })
    }
  },

  setFeatureActive: async (key: keyof VaultFeatures, active: boolean) => {
    const { currentVaultPath, features } = get()
    if (!currentVaultPath) return

    const updated = { ...features, [key]: active }
    set({ features: updated })

    const settings: VaultSettings = {
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
