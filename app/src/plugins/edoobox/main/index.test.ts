import { describe, it, expect } from 'vitest'
import entry from './index'
import { manifest } from '../manifest'
import { PluginRegistry } from '../../../main/plugins/registry'
import { createHostFactory, type HostServices } from '../../../main/plugins/host'
import { validateManifest, validateManifestSemantics } from '../../../shared/plugins/schemas'

function buildRegistry() {
  const secrets = new Map<string, string>()
  const vault = new Map<string, string>()
  const services: HostServices = {
    readVaultFile: async (rel) => {
      const v = vault.get(rel)
      if (v === undefined) throw new Error('ENOENT')
      return v
    },
    writeVaultFile: async (rel, content) => { vault.set(rel, content) },
    readVaultBytes: async () => new Uint8Array(),
    writeVaultBytes: async () => {},
    vaultExists: async (rel) => vault.has(rel),
    secretGet: async (k) => secrets.get(k) ?? null,
    secretSet: async (k, v) => { secrets.set(k, v) },
    secretDelete: async (k) => { secrets.delete(k) },
    llmGenerate: async () => '',
    httpFetch: async () => new Response('x'),
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
  return { registry, secrets, vault }
}

describe('edoobox-Plugin — Manifest', () => {
  it('ist schematisch und semantisch gültig', () => {
    expect(validateManifest(manifest)).toEqual({ valid: true, errors: [] })
    expect(validateManifestSemantics(manifest)).toEqual({ valid: true, errors: [] })
  })
})

describe('edoobox-Plugin — Vertikale durch Registry + Host', () => {
  it('aktiviert und registriert die Actions', async () => {
    const { registry } = buildRegistry()
    await registry.activate('edoobox')
    expect(registry.get('edoobox')?.activation).toBe('active')
  })

  it('Credentials: roundtrip über host.secrets (genamespacet)', async () => {
    const { registry, secrets } = buildRegistry()
    await registry.activate('edoobox')

    expect(await registry.invoke('edoobox', 'edoobox.loadCredentials', {})).toBeNull()

    expect(await registry.invoke('edoobox', 'edoobox.saveCredentials', { apiKey: 'k', apiSecret: 's' })).toBe(true)
    expect(secrets.get('plugin:edoobox:apiKey')).toBe('k')
    expect(secrets.get('plugin:edoobox:apiSecret')).toBe('s')

    expect(await registry.invoke('edoobox', 'edoobox.loadCredentials', {})).toEqual({ apiKey: 'k', apiSecret: 's' })
  })

  it('API-Action ohne Credentials liefert {success:false}', async () => {
    const { registry } = buildRegistry()
    await registry.activate('edoobox')
    const res = await registry.invoke('edoobox', 'edoobox.listOffers', { baseUrl: 'https://app1.edoobox.com', apiVersion: 'v2' })
    expect(res).toEqual({ success: false, error: 'Keine Zugangsdaten gespeichert' })
  })

  it('Events: leeres Laden ohne Datei, dann roundtrip über host.vault', async () => {
    const { registry, vault } = buildRegistry()
    await registry.activate('edoobox')

    expect(await registry.invoke('edoobox', 'edoobox.loadEvents', {})).toEqual([])

    const events = [{ id: 'e1', title: 'Test' }]
    expect(await registry.invoke('edoobox', 'edoobox.saveEvents', { events })).toBe(true)
    expect(vault.has('.mindgraph/edoobox-events.json')).toBe(true)

    expect(await registry.invoke('edoobox', 'edoobox.loadEvents', {})).toEqual(events)
  })
})
