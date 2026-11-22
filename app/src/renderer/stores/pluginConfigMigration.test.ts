import { describe, it, expect } from 'vitest'
import { migrateLegacyPluginConfig, pinLegacyAntaresTarget, migrateAntaresTargetOnce, ANTARES_LEGACY_TARGET } from './uiStore'

describe('migrateLegacyPluginConfig — A-pre Schritt 3', () => {
  it('zieht alte Top-Level-Configs der Vertikalen nach pluginConfig.<id>', () => {
    const saved = {
      edoobox: { enabled: true, baseUrl: 'https://app1.edoobox.com', apiVersion: 'v2', webhookUrl: '' },
      marketing: { enabled: true, wordpressUrl: 'https://x.de' },
      remarkable: { enabled: true, transport: 'usb', autoRefreshOnOpen: false },
      antares: { enabled: true, baseUrl: 'https://mz.example', context: 'HE/16' },
      somethingElse: { ignored: true },
    }
    const pc = migrateLegacyPluginConfig(saved, {})
    expect(pc.edoobox?.enabled).toBe(true)
    expect(pc.marketing?.wordpressUrl).toBe('https://x.de')
    expect(pc.remarkable?.autoRefreshOnOpen).toBe(false)
    expect(pc.antares?.context).toBe('HE/16')
    expect(pc.somethingElse).toBeUndefined() // nur die bekannten Vertikalen
  })

  it('überschreibt eine bereits vorhandene pluginConfig.<id> NICHT (idempotent)', () => {
    const saved = { edoobox: { enabled: true, baseUrl: 'https://old.example' } }
    const pc = migrateLegacyPluginConfig(saved, { edoobox: { enabled: false, baseUrl: 'https://new.example' } })
    expect(pc.edoobox?.baseUrl).toBe('https://new.example')
    expect(pc.edoobox?.enabled).toBe(false)
  })

  it('normalisiert die edoobox-baseUrl (v-Suffix, app2→app1, Default apiVersion)', () => {
    const pc = migrateLegacyPluginConfig(
      { edoobox: { baseUrl: 'https://app2.edoobox.com/v2' } },
      {}
    )
    expect(pc.edoobox?.baseUrl).toBe('https://app1.edoobox.com')
    expect(pc.edoobox?.apiVersion).toBe('v1')
  })

  // Regression: der v1-Default galt früher für JEDE edoobox-Config. Der Modul-Schalter legt aber
  // nur `{ enabled: true }` an — die bekam damit still v1 gespeichert und überstimmte den Default
  // v2 dauerhaft. Folge: 401 beim Verbindungstest trotz gültiger Zugangsdaten.
  it('nagelt frisch aktivierte Module NICHT auf v1 (Default v2 muss greifen)', () => {
    const pc = migrateLegacyPluginConfig({}, { edoobox: { enabled: true } })
    expect(pc.edoobox?.apiVersion).toBeUndefined()
  })

  it('lässt eine bereits gespeicherte apiVersion unangetastet', () => {
    const pc = migrateLegacyPluginConfig(
      { edoobox: { enabled: true, apiVersion: 'v2', baseUrl: 'https://app1.edoobox.com' } },
      {}
    )
    expect(pc.edoobox?.apiVersion).toBe('v2')
  })

  it('ist ein No-op ohne Legacy-Keys', () => {
    expect(migrateLegacyPluginConfig({}, {})).toEqual({})
  })
})

describe('pinLegacyAntaresTarget — Bestandsschutz nach leeren Antares-Defaults', () => {
  it('aktive Installation ohne Adresse/Kontext bekommt die bisherigen Werte fest eingetragen', () => {
    const pc = pinLegacyAntaresTarget({ antares: { enabled: true } })
    expect(pc.antares).toEqual({ enabled: true, ...ANTARES_LEGACY_TARGET })
  })
  it('eigene Adresse und eigener Kontext bleiben unverändert', () => {
    const own = { antares: { enabled: true, baseUrl: 'https://mzantares-xx-nn.datenbank-bildungsmedien.net', context: 'XX/NN' } }
    expect(pinLegacyAntaresTarget(own)).toBe(own)
  })
  it('fehlt nur ein Feld, wird nur dieses ergänzt', () => {
    const pc = pinLegacyAntaresTarget({ antares: { enabled: true, baseUrl: 'https://eigene.datenbank-bildungsmedien.net' } })
    expect(pc.antares.baseUrl).toBe('https://eigene.datenbank-bildungsmedien.net')
    expect(pc.antares.context).toBe(ANTARES_LEGACY_TARGET.context)
  })
  it('ausgeschaltete oder nie genutzte Installation bleibt leer', () => {
    expect(pinLegacyAntaresTarget({ antares: { enabled: false } }).antares).toEqual({ enabled: false })
    expect(pinLegacyAntaresTarget({}).antares).toBeUndefined()
  })
  it('ein absichtlich geleertes Feld ("") wird nicht überschrieben', () => {
    const pc = pinLegacyAntaresTarget({ antares: { enabled: true, baseUrl: '', context: '' } })
    expect(pc.antares).toEqual({ enabled: true, baseUrl: '', context: '' })
  })
  it('zweiter Lauf ändert nichts (idempotent)', () => {
    const once = pinLegacyAntaresTarget({ antares: { enabled: true } })
    expect(pinLegacyAntaresTarget(once)).toBe(once)
  })
})

describe('migrateAntaresTargetOnce — nur einmal je Profil (G01)', () => {
  it('Profil ohne Flag (vor dem Update): Bestandsschutz läuft', () => {
    const r = migrateAntaresTargetOnce({}, { antares: { enabled: true } })
    expect(r.ranNow).toBe(true)
    expect(r.pluginConfig.antares).toEqual({ enabled: true, ...ANTARES_LEGACY_TARGET })
  })
  it('Profil mit Flag: nichts wird nachgetragen, auch wenn Antares eingeschaltet und leer ist', () => {
    const pc = { antares: { enabled: true } }
    const r = migrateAntaresTargetOnce({ antaresTargetMigrated: true }, pc)
    expect(r.ranNow).toBe(false)
    expect(r.pluginConfig).toBe(pc)
  })
  it('nur ein echtes true zählt als migriert', () => {
    expect(migrateAntaresTargetOnce({ antaresTargetMigrated: 'true' }, {}).ranNow).toBe(true)
  })
})
