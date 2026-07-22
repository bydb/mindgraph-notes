import { describe, it, expect } from 'vitest'
import entry from './index'
import { manifest } from '../manifest'
import { PluginRegistry } from '../../../main/plugins/registry'
import { createHostFactory, type HostServices } from '../../../main/plugins/host'
import { validateManifest, validateManifestSemantics, validateAgainst } from '@mindgraph/plugin-api/validation'

function buildRegistry() {
  const secrets = new Map<string, string>()
  const services: HostServices = {
    readVaultFile: async () => { throw new Error('ENOENT') },
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
    // WordPress-Host ist user-konfiguriert (pluginConfig.wordpress.baseUrl) — im Test statisch.
    resolveExtraAllowedHosts: async () => ['example.org'],
  }
  const registry = new PluginRegistry(createHostFactory(services))
  registry.register([{ manifest, loadEntry: async () => ({ default: entry }) }])
  return { registry, secrets }
}

describe('wordpress-Plugin — Manifest', () => {
  it('ist schematisch und semantisch gültig', () => {
    expect(validateManifest(manifest)).toEqual({ valid: true, errors: [] })
    expect(validateManifestSemantics(manifest)).toEqual({ valid: true, errors: [] })
  })
})

describe('wordpress-Plugin — Vertikale durch Registry + Host', () => {
  it('aktiviert und registriert die Actions', async () => {
    const { registry } = buildRegistry()
    await registry.activate('wordpress')
    expect(registry.get('wordpress')?.activation).toBe('active')
  })

  it('Credentials: roundtrip über host.secrets (genamespacet)', async () => {
    const { registry, secrets } = buildRegistry()
    await registry.activate('wordpress')

    expect(await registry.invoke('wordpress', 'wordpress.loadCredentials', {})).toBeNull()

    expect(await registry.invoke('wordpress', 'wordpress.saveCredentials', { appPassword: 'xxxx yyyy' })).toBe(true)
    expect(secrets.get('plugin:wordpress:wpAppPassword')).toBe('xxxx yyyy')

    expect(await registry.invoke('wordpress', 'wordpress.loadCredentials', {})).toEqual({ wpAppPassword: 'xxxx yyyy' })
  })

  it('Publish ohne App-Passwort liefert {success:false}', async () => {
    const { registry } = buildRegistry()
    await registry.activate('wordpress')
    const res = await registry.invoke('wordpress', 'wordpress.publishPost', {
      siteUrl: 'https://example.org', username: 'admin', title: 't', content: 'c', status: 'draft',
    })
    expect(res).toEqual({ success: false, error: 'Kein WordPress App-Passwort gespeichert' })
  })
})

describe('wordpress-Plugin — Output-Schemas (Envelope-Validierung)', () => {
  const out = (id: string) => manifest.actions!.find((a) => a.id === id)!.outputSchema!

  it('JEDE Action deklariert ein outputSchema (Coverage erzwungen)', () => {
    for (const a of manifest.actions ?? []) expect(a.outputSchema, a.id).toBeDefined()
  })

  it('konsumierte Felder werden getypt: IDs/Texte mit passendem Typ', () => {
    expect(validateAgainst(out('wordpress.publishPost'), { success: true, postId: 7, postUrl: 'https://x', status: 'publish' }).valid).toBe(true)
    expect(validateAgainst(out('wordpress.publishPost'), { success: true, postId: 'sieben' }).valid).toBe(false)
    expect(validateAgainst(out('wordpress.uploadImage'), { success: true, mediaId: 'x' }).valid).toBe(false)
    expect(validateAgainst(out('wordpress.uploadImage'), { success: true, mediaId: 3, imageUrl: 'https://x' }).valid).toBe(true)
    expect(validateAgainst(out('wordpress.check'), { success: true, userName: 'admin' }).valid).toBe(true)
    expect(validateAgainst(out('wordpress.check'), '<html>error</html>').valid).toBe(false)
  })

  it('loadCredentials: null oder {wpAppPassword}; saveCredentials: Boolean', () => {
    expect(validateAgainst(out('wordpress.loadCredentials'), null).valid).toBe(true)
    expect(validateAgainst(out('wordpress.loadCredentials'), { wpAppPassword: 'x' }).valid).toBe(true)
    expect(validateAgainst(out('wordpress.loadCredentials'), { anything: 1 }).valid).toBe(false)
    expect(validateAgainst(out('wordpress.saveCredentials'), true).valid).toBe(true)
    expect(validateAgainst(out('wordpress.saveCredentials'), { success: true }).valid).toBe(false)
  })
})
