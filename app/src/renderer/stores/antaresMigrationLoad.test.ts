// G01 (Live-GUI-Test 22.11.2026) über den ECHTEN Ladeweg `initializeUISettings`:
// Bestandsprofile bekommen die alte Antares-Adresse genau einmal festgeschrieben, nichts anderes
// ändert sich (Onboarding startet nicht neu, kein Feld geht verloren), und ein neues Profil bekommt
// den fremden Server auch nach Aktivieren + Neustart NICHT.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const saves: Array<Record<string, unknown>> = []
let fileOnDisk: Record<string, unknown> = {}

function installElectronApi() {
  vi.stubGlobal('window', {
    electronAPI: {
      loadUISettings: vi.fn(async () => JSON.parse(JSON.stringify(fileOnDisk))),
      // Wie der Main: mit der bestehenden Datei mergen.
      saveUISettings: vi.fn(async (s: Record<string, unknown>) => {
        saves.push(JSON.parse(JSON.stringify(s)))
        fileOnDisk = { ...fileOnDisk, ...JSON.parse(JSON.stringify(s)) }
        return true
      }),
      pruneUISettingsKeys: vi.fn(async () => true),
      imageGenSaveKey: vi.fn(async () => ({ success: true })),
    },
  })
}

beforeEach(() => {
  vi.resetModules()
  saves.length = 0
  installElectronApi()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function start() {
  const mod = await import('./uiStore')
  await mod.initializeUISettings()
  return mod.useUIStore.getState()
}

// Profil eines bestehenden Nutzers vor dem Update (kein antaresTargetMigrated).
const legacyProfile = () => ({
  onboardingCompleted: true,
  userProfile: 'office',
  notesRootFolder: '000 - Notizen',
  ollama: { enabled: true, backend: 'ollama', selectedModel: 'qwen3:8b', moduleModelOverrides: { brain: 'qwen3:8b' } },
  pluginConfig: {
    antares: { enabled: true },
    edoobox: { enabled: true, baseUrl: 'https://app1.edoobox.com', apiVersion: 'v2' },
    faktura: { enabled: true, nummernkreis: 'R-2026' },
  },
  unbekanntesFeldEinerNeuerenVersion: { x: 1 },
})

describe('Antares-Bestandsschutz beim Laden (G01)', () => {
  it('Bestandsprofil: einmal festgeschrieben, sofort gespeichert, sonst nichts verändert', async () => {
    fileOnDisk = legacyProfile()
    const st = await start()

    expect(st.pluginConfig.antares).toEqual({
      enabled: true,
      baseUrl: 'https://mzantares-he-16.datenbank-bildungsmedien.net',
      context: 'HE/16',
    })
    expect(st.antaresTargetMigrated).toBe(true)
    expect(st.onboardingCompleted).toBe(true)
    expect(st.userProfile).toBe('office')
    expect(st.notesRootFolder).toBe('000 - Notizen')
    expect(st.ollama.selectedModel).toBe('qwen3:8b')
    expect(st.ollama.moduleModelOverrides.brain).toBe('qwen3:8b')
    expect(st.pluginConfig.edoobox).toEqual({ enabled: true, baseUrl: 'https://app1.edoobox.com', apiVersion: 'v2' })
    expect(st.pluginConfig.faktura).toEqual({ enabled: true, nummernkreis: 'R-2026' })

    // Sofort gespeichert, Flag liegt in den persistierten Schlüsseln.
    expect(saves).toHaveLength(1)
    expect(saves[0].antaresTargetMigrated).toBe(true)
    expect(saves[0].onboardingCompleted).toBe(true)
    // Die Datei behält auch Felder, die diese Version nicht kennt (Main mergt).
    expect(fileOnDisk.unbekanntesFeldEinerNeuerenVersion).toEqual({ x: 1 })
  })

  it('zweiter Start nach der Migration: nichts mehr festgeschrieben, kein Extra-Speichern', async () => {
    fileOnDisk = { ...legacyProfile(), antaresTargetMigrated: true, pluginConfig: { antares: { enabled: true, baseUrl: 'https://eigene.datenbank-bildungsmedien.net', context: 'XX/NN' } } }
    const st = await start()
    expect(st.pluginConfig.antares).toEqual({ enabled: true, baseUrl: 'https://eigene.datenbank-bildungsmedien.net', context: 'XX/NN' })
    expect(saves).toHaveLength(0)
  })

  it('Bestandsprofil mit Antares AUS: Flag gesetzt, Felder bleiben leer — späteres Einschalten zieht nichts nach', async () => {
    fileOnDisk = { ...legacyProfile(), pluginConfig: { antares: { enabled: false } } }
    let st = await start()
    expect(st.pluginConfig.antares).toEqual({ enabled: false })
    expect(fileOnDisk.antaresTargetMigrated).toBe(true)

    // Nutzer schaltet Antares ein, Datei enthält { enabled: true } ohne Adresse → Neustart.
    fileOnDisk = { ...fileOnDisk, pluginConfig: { antares: { enabled: true } } }
    vi.resetModules(); saves.length = 0
    st = await start()
    expect(st.pluginConfig.antares).toEqual({ enabled: true })
  })

  it('neues Profil (Onboarding mit neuer Version): Aktivieren + Neustart trägt KEINEN fremden Server ein', async () => {
    // Die neue Version speichert das Flag von Anfang an (Default true).
    fileOnDisk = { onboardingCompleted: true, userProfile: 'school-admin', antaresTargetMigrated: true, pluginConfig: { antares: { enabled: true } } }
    const st = await start()
    expect(st.pluginConfig.antares).toEqual({ enabled: true })
    expect(st.userProfile).toBe('school-admin')
    expect(saves).toHaveLength(0)
  })
})
