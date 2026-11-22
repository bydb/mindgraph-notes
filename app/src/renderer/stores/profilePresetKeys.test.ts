import { describe, it, expect } from 'vitest'
import { useUIStore } from './uiStore'
import { PROFILE_PRESETS, type PresetObject } from '../../shared/profilePresets'

// Schützt vor Tippfehlern: Jeder Schlüssel eines Profils muss ein echtes uiStore-Feld sein —
// sonst setzt das Profil still ein Feld, das niemand liest. pluginConfig.<id> ist frei.
// Optionale Store-Felder (im Typ `?:`, daher im Startzustand nicht vorhanden).
const OPTIONAL_KEYS = new Set(['ollama.defaultCloudProvider'])

function missingKeys(state: Record<string, unknown>, preset: PresetObject, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(preset)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (!(k in state)) { if (!OPTIONAL_KEYS.has(path)) out.push(path); continue }
    if (path === 'pluginConfig') continue
    if (v && typeof v === 'object') out.push(...missingKeys(state[k] as Record<string, unknown>, v as PresetObject, path))
  }
  return out
}

describe('PROFILE_PRESETS ↔ uiStore', () => {
  for (const [id, preset] of Object.entries(PROFILE_PRESETS)) {
    it(`${id}: alle Schlüssel existieren im Store`, () => {
      expect(missingKeys(useUIStore.getState() as unknown as Record<string, unknown>, preset)).toEqual([])
    })
  }
})
