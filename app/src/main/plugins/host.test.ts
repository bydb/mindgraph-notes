import { describe, it, expect, vi } from 'vitest'
import { createHostFactory, isHostAllowed, type HostServices } from './host'
import type { PluginManifest } from '../../shared/plugins/manifest'

function fakeServices(over: Partial<HostServices> = {}): HostServices {
  return {
    readVaultFile: vi.fn(async () => 'inhalt'),
    writeVaultFile: vi.fn(async () => {}),
    secretGet: vi.fn(async () => null),
    secretSet: vi.fn(async () => {}),
    secretDelete: vi.fn(async () => {}),
    llmGenerate: vi.fn(async () => 'antwort'),
    httpFetch: vi.fn(async () => new Response('ok')),
    emitWorkflow: vi.fn(async () => {}),
    ...over,
  }
}

function manifest(over: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'p',
    version: '1.0.0',
    label: 'P',
    description: 'x',
    category: 'ai',
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
