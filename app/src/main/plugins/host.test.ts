import { describe, it, expect, vi } from 'vitest'
import { createHostFactory, isHostAllowed, type HostServices } from './host'
import type { PluginManifest } from '@mindgraph/plugin-api'

function fakeServices(over: Partial<HostServices> = {}): HostServices {
  return {
    readVaultFile: vi.fn(async () => 'inhalt'),
    writeVaultFile: vi.fn(async () => {}),
    readVaultBytes: vi.fn(async () => new Uint8Array()),
    writeVaultBytes: vi.fn(async () => {}),
    vaultExists: vi.fn(async () => false),
    secretGet: vi.fn(async () => null),
    secretSet: vi.fn(async () => {}),
    secretDelete: vi.fn(async () => {}),
    llmGenerate: vi.fn(async () => 'antwort'),
    httpFetch: vi.fn(async () => new Response('ok')),
    httpFetchBasicAuth: vi.fn(async () => ({ statusCode: 200, text: '{}' })),
    deviceRequest: vi.fn(async () => ({ statusCode: 200, text: '[]' })),
    deviceDownload: vi.fn(async () => ({ ok: true, statusCode: 200, bytes: new Uint8Array() })),
    deviceUpload: vi.fn(async () => ({ statusCode: 200, body: '' })),
    listUsbDevices: vi.fn(async () => []),
    pdfHtmlToPdf: vi.fn(async () => new Uint8Array()),
    pdfOptimize: vi.fn(async () => ({ bytes: new Uint8Array(), method: 'unchanged' as const })),
    dialogOpenFile: vi.fn(async () => null),
    dialogSaveFile: vi.fn(async () => null),
    readResource: vi.fn(async () => new Uint8Array()),
    emitWorkflow: vi.fn(async () => {}),
    recordActivity: vi.fn(async () => {}),
    ...over,
  }
}

function manifest(over: Partial<PluginManifest> = {}): PluginManifest {
  return {
    manifestVersion: 2,
    id: 'p',
    version: '1.0.0',
    label: 'P',
    description: 'x',
    category: 'ai',
    apiVersion: '^0.2.0',
    minAppVersion: '0.0.0',
    author: { name: 'Test' },
    entrypoints: { main: 'main.js' },
    capabilities: [],
    ...over,
  }
}

describe('createHostFactory — Capability-Gating', () => {
  it('exponiert nur deklarierte Capabilities', () => {
    const host = createHostFactory(fakeServices())(
      manifest({ capabilities: ['vault.read'] })
    ) as Record<string, unknown>
    expect(host.log).toBeTypeOf('function')
    expect((host.vault as Record<string, unknown>).read).toBeTypeOf('function')
    expect((host.vault as Record<string, unknown>).write).toBeUndefined()
    expect(host.secrets).toBeUndefined()
    expect(host.llm).toBeUndefined()
    expect(host.http).toBeUndefined()
  })

  it('verschmilzt vault.read + vault.write in EIN vault-Objekt', () => {
    const host = createHostFactory(fakeServices())(
      manifest({ capabilities: ['vault.read', 'vault.write'] })
    ) as Record<string, unknown>
    const vault = host.vault as Record<string, unknown>
    expect(vault.read).toBeTypeOf('function')
    expect(vault.write).toBeTypeOf('function')
  })
})

describe('createHostFactory — secrets-Namespacing', () => {
  it('präfixt Schlüssel mit plugin:<id>:', async () => {
    const services = fakeServices()
    const host = createHostFactory(services)(
      manifest({ id: 'antares', capabilities: ['secrets'] })
    ) as Record<string, unknown>
    const secrets = host.secrets as { set: (k: string, v: string) => Promise<void> }
    await secrets.set('apiKey', 'geheim')
    expect(services.secretSet).toHaveBeenCalledWith('plugin:antares:apiKey', 'geheim')
  })
})

describe('createHostFactory — http allowedHosts', () => {
  const http = (m: PluginManifest) =>
    (createHostFactory(fakeServices())(m) as Record<string, unknown>).http as {
      fetch: (u: string, i?: RequestInit) => Promise<Response>
    }

  it('lässt erlaubte Hosts durch', async () => {
    const services = fakeServices()
    const host = createHostFactory(services)(
      manifest({ capabilities: ['http.fetch'], http: { allowedHosts: ['api.example.net'] } })
    ) as Record<string, unknown>
    await (host.http as { fetch: (u: string) => Promise<Response> }).fetch('https://api.example.net/x')
    expect(services.httpFetch).toHaveBeenCalledOnce()
  })

  it('blockt nicht erlaubte Hosts', async () => {
    const f = http(manifest({ capabilities: ['http.fetch'], http: { allowedHosts: ['api.example.net'] } }))
    await expect(f.fetch('https://evil.example.com/')).rejects.toThrow(/nicht in allowedHosts/)
  })

  it('blockt komplett, wenn keine allowedHosts deklariert sind', async () => {
    const f = http(manifest({ capabilities: ['http.fetch'] }))
    await expect(f.fetch('https://api.example.net/')).rejects.toThrow(/keine allowedHosts/)
  })

  it('lässt user-konfigurierte Hosts via resolveExtraAllowedHosts durch (Antares-Fork)', async () => {
    const services = fakeServices({ resolveExtraAllowedHosts: async () => ['mz-xy.configured.net'] })
    const host = createHostFactory(services)(
      manifest({ id: 'antares', capabilities: ['http.fetch'] }) // keine statischen allowedHosts
    ) as Record<string, unknown>
    const f = host.http as { fetch: (u: string) => Promise<Response> }
    await f.fetch('https://mz-xy.configured.net/dashboard')
    expect(services.httpFetch).toHaveBeenCalledOnce()
    await expect(f.fetch('https://other.net/')).rejects.toThrow(/nicht in allowedHosts/)
  })
})

describe('isHostAllowed — Wildcards', () => {
  it('matcht Sub-Domains und die Wurzel bei *.', () => {
    expect(isHostAllowed(['*.example.com'], 'a.example.com')).toBe(true)
    expect(isHostAllowed(['*.example.com'], 'example.com')).toBe(true)
    expect(isHostAllowed(['*.example.com'], 'example.com.evil.net')).toBe(false)
    expect(isHostAllowed(['exact.com'], 'sub.exact.com')).toBe(false)
  })
})

describe('createHostFactory — llm-Weiterleitung', () => {
  it('reicht prompt + opts an die Primitive durch', async () => {
    const services = fakeServices()
    const host = createHostFactory(services)(
      manifest({ capabilities: ['llm.generate'] })
    ) as Record<string, unknown>
    await (host.llm as { generate: (p: string, o?: unknown) => Promise<string> }).generate('hi', {
      module: 'mail-summary',
    })
    expect(services.llmGenerate).toHaveBeenCalledWith('hi', { module: 'mail-summary' })
  })
})

describe('createHostFactory — activity (Arbeitsbilanz)', () => {
  it('existiert nur mit Capability und setzt Zeit + Plugin-ID selbst', async () => {
    const services = fakeServices()
    expect((createHostFactory(services)(manifest({ capabilities: ['dialog'] })) as Record<string, unknown>).activity).toBeUndefined()
    const host = createHostFactory(services)(manifest({ id: 'edoobox', capabilities: ['activity'] })) as Record<string, unknown>
    const activity = host.activity as { record: (e: unknown) => Promise<void> }
    await activity.record({ kind: 'job-outcome', jobId: 'mk-1', jobType: 'ig-caption', outcome: 'used', activeMs: 500, pluginId: 'fremd', at: 1 })
    expect(services.recordActivity).toHaveBeenCalledOnce()
    const event = (services.recordActivity as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    expect(event).toMatchObject({ kind: 'job-outcome', jobId: 'mk-1', jobType: 'ig-caption', outcome: 'used', pluginId: 'edoobox', activeMs: 500 })
    expect(typeof event.at).toBe('number')
    expect(event.at as number).toBeGreaterThan(1)
  })

  it('weist Ungültiges laut ab und schreibt nichts', async () => {
    const services = fakeServices()
    const host = createHostFactory(services)(manifest({ id: 'edoobox', capabilities: ['activity'] })) as Record<string, unknown>
    const activity = host.activity as { record: (e: unknown) => Promise<void> }
    await expect(activity.record({ kind: 'job-outcome', jobId: 'mk-1', jobType: 'wp-post', outcome: 'gedruckt' })).rejects.toThrow(/ungültig/)
    await expect(activity.record({ kind: 'agent-run-finished', runId: 'x' })).rejects.toThrow(/ungültig/)
    expect(services.recordActivity).not.toHaveBeenCalled()
  })

  it('hängt an eine Vorbereitung den Modellverbrauch der runId an', async () => {
    const totals = { calls: 2, callsWithoutTokens: 0, cloudCalls: 0, computeMs: 4000 }
    const services = fakeServices({ collectRunTotals: vi.fn(async () => totals) })
    const host = createHostFactory(services)(manifest({ id: 'edoobox', capabilities: ['activity'] })) as Record<string, unknown>
    await (host.activity as { record: (e: unknown) => Promise<void> }).record({ kind: 'job-started', jobId: 'mk-2', jobKind: 'marketing' })
    expect(services.collectRunTotals).toHaveBeenCalledWith('mk-2')
    expect((services.recordActivity as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ kind: 'job-started', llm: totals })
  })
})
