import { describe, it, expect } from 'vitest'
import entry from './index'
import { manifest } from '../manifest'
import { PluginRegistry } from '../../../main/plugins/registry'
import { createHostFactory, type HostServices } from '../../../main/plugins/host'
import { validateManifest, validateManifestSemantics, validateAgainst } from '@mindgraph/plugin-api/validation'

function buildRegistry() {
  const secrets = new Map<string, string>()
  const services: HostServices = {
    readVaultFile: async () => '',
    writeVaultFile: async () => {},
    readVaultBytes: async () => new Uint8Array(),
    writeVaultBytes: async () => {},
    vaultExists: async () => false,
    secretGet: async (k) => secrets.get(k) ?? null,
    secretSet: async (k, v) => { secrets.set(k, v) },
    secretDelete: async (k) => { secrets.delete(k) },
    llmGenerate: async () => '',
    httpFetch: async () => new Response('x'),
    httpFetchBasicAuth: async () => ({ statusCode: 200, text: '{}' }),
    deviceRequest: async () => ({ statusCode: 200, text: '[]' }),
    deviceDownload: async () => ({ ok: true, statusCode: 200, bytes: new Uint8Array() }),
    deviceUpload: async () => ({ statusCode: 200, body: '' }),
    listUsbDevices: async () => [],
    pdfHtmlToPdf: async () => new Uint8Array(),
    pdfOptimize: async () => ({ bytes: new Uint8Array(), method: 'unchanged' }),
    dialogOpenFile: async () => null,
    dialogSaveFile: async () => null,
    readResource: async () => new Uint8Array(),
    emitWorkflow: async () => {},
  }
  const registry = new PluginRegistry(createHostFactory(services))
  registry.register([{ manifest, loadEntry: async () => ({ default: entry }) }])
  return { registry, secrets }
}

describe('Antares-Plugin — Manifest', () => {
  it('ist schematisch und semantisch gültig', () => {
    expect(validateManifest(manifest)).toEqual({ valid: true, errors: [] })
    expect(validateManifestSemantics(manifest)).toEqual({ valid: true, errors: [] })
  })
})

describe('Antares-Plugin — Vertikale durch Registry + Host', () => {
  it('aktiviert und registriert die Actions', async () => {
    const { registry } = buildRegistry()
    await registry.activate('antares')
    expect(registry.get('antares')?.activation).toBe('active')
  })

  it('Credentials: roundtrip über host.secrets (genamespacet)', async () => {
    const { registry, secrets } = buildRegistry()
    await registry.activate('antares')

    expect(await registry.invoke('antares', 'antares.loadCredentials', {})).toBeNull()

    expect(await registry.invoke('antares', 'antares.saveCredentials', { username: 'u', password: 'p' })).toBe(true)
    expect(secrets.get('plugin:antares:username')).toBe('u')
    expect(secrets.get('plugin:antares:password')).toBe('p')

    expect(await registry.invoke('antares', 'antares.loadCredentials', {})).toEqual({ username: 'u', password: 'p' })
  })

  it('Daten-Action ohne Credentials wirft kontrolliert', async () => {
    const { registry } = buildRegistry()
    await registry.activate('antares')
    await expect(
      registry.invoke('antares', 'antares.dashboardCounts', { baseUrl: 'https://mz.datenbank-bildungsmedien.net', context: 'HE/16' })
    ).rejects.toThrow(/Zugangsdaten/)
  })
})

describe('Antares-Plugin — Output-Schemas (Envelope-Validierung)', () => {
  const out = (id: string) => manifest.actions!.find((a) => a.id === id)!.outputSchema!

  it('jede Action deklariert ein outputSchema', () => {
    for (const a of manifest.actions ?? []) expect(a.outputSchema, a.id).toBeDefined()
  })

  it('dashboardCounts: 7-Zahlen-Objekt ok, Fremdform abgewiesen', () => {
    const good = {
      offeneRegistrierungen: 0, offeneAnfragenGeraete: 0, offeneVorbestellungenGeraete: 0,
      stornierteVorbestellungen: 0, ueberfaelligeGeraete: 0, offeneVorbestellungenMedien: 0, ueberfaelligeMedien: 0,
    }
    expect(validateAgainst(out('antares.dashboardCounts'), good).valid).toBe(true)
    expect(validateAgainst(out('antares.dashboardCounts'), { offeneRegistrierungen: 'viele' }).valid).toBe(false)
    expect(validateAgainst(out('antares.dashboardCounts'), 'Server returned HTML').valid).toBe(false)
  })

  it('listEntleiher: {total,rows} ok, String (z.B. HTML-Fehlerseite) abgewiesen', () => {
    expect(validateAgainst(out('antares.listEntleiher'), { total: 2, rows: [{}, {}] }).valid).toBe(true)
    expect(validateAgainst(out('antares.listEntleiher'), '<html>SQL ERROR</html>').valid).toBe(false)
    expect(validateAgainst(out('antares.listEntleiher'), { rows: [] }).valid).toBe(false) // total fehlt
  })

  it('Zeilen sind lenient (Feld-Drift erlaubt), aber keine Nicht-Objekt-Zeile', () => {
    expect(validateAgainst(out('antares.listMahnungenGeraete'), { total: 1, rows: [{ neuesFeldVomServer: 1 }] }).valid).toBe(true)
    expect(validateAgainst(out('antares.listMahnungenGeraete'), { total: 1, rows: ['nur ein String'] }).valid).toBe(false)
  })

  it('loadCredentials: null oder das Paar; halbes Paar abgewiesen', () => {
    expect(validateAgainst(out('antares.loadCredentials'), null).valid).toBe(true)
    expect(validateAgainst(out('antares.loadCredentials'), { username: 'u', password: 'p' }).valid).toBe(true)
    expect(validateAgainst(out('antares.loadCredentials'), { username: 'u' }).valid).toBe(false)
  })
})
