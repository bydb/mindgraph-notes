import { describe, it, expect } from 'vitest'
import { migrateLegacyPluginConfig } from './uiStore'

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
