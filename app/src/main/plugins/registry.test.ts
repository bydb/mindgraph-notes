import { describe, it, expect, vi } from 'vitest'
import { PluginRegistry, discoverMainPlugins, type MainPluginSource } from './registry'
import { definePluginMain, type PluginMainEntry } from '../../shared/plugins/entry'
import type { PluginManifest } from '../../shared/plugins/manifest'
import type { AnyPluginHost } from '../../shared/plugins/host'

function mkManifest(id: string, over: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id,
    version: '1.0.0',
    label: id,
    description: 'Test',
    category: 'ai',
    capabilities: [],
    ...over,
  }
}

const echoManifest = mkManifest('echo', {
  actions: [
    {
      id: 'echo.do',
      requiredCapabilities: [],
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string' } },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['echo'],
        properties: { echo: { type: 'string' } },
        additionalProperties: false,
      },
    },
  ],
})

function echoSource(): MainPluginSource {
  const entry = definePluginMain({ id: 'echo', capabilities: [] }, ({ actions }) => {
    actions.register('echo.do', async (p) => ({ echo: (p as { text: string }).text }))
  })
  return { manifest: echoManifest, loadEntry: async () => ({ default: entry }) }
}

describe('PluginRegistry — Registrierung', () => {
  it('nimmt ein gültiges Manifest als deaktiviert auf', () => {
    const r = new PluginRegistry()
    r.register([echoSource()])
    expect(r.get('echo')).toMatchObject({
      installation: 'bundled',
      activation: 'disabled',
      readiness: 'unavailable',
    })
  })

  it('isoliert ein defektes Manifest, ohne zu werfen, und behält valide Plugins', () => {
    const r = new PluginRegistry()
    const broken: MainPluginSource = { manifest: { id: 'Bad ID' } as PluginManifest }
    expect(() => r.register([broken, echoSource()])).not.toThrow()
    expect(r.get('Bad ID')?.activation).toBe('error')
    expect(r.get('echo')?.activation).toBe('disabled')
  })
})

describe('PluginRegistry — Aktivierung & Aufruf', () => {
  it('aktiviert ein Plugin und ruft eine Action auf', async () => {
    const r = new PluginRegistry()
    r.register([echoSource()])
    const state = await r.activate('echo')
    expect(state).toMatchObject({ activation: 'active', readiness: 'ready' })
    expect(await r.invoke('echo', 'echo.do', { text: 'hi' })).toEqual({ echo: 'hi' })
  })

  it('lehnt eine schema-widrige Eingabe ab', async () => {
    const r = new PluginRegistry()
    r.register([echoSource()])
    await r.activate('echo')
    await expect(r.invoke('echo', 'echo.do', { text: 5 })).rejects.toThrow(/Ungültige Eingabe/)
  })

  it('lehnt eine schema-widrige Ausgabe ab', async () => {
    const m = mkManifest('badout', {
      actions: [
        {
          id: 'badout.do',
          requiredCapabilities: [],
          outputSchema: {
            type: 'object',
            required: ['echo'],
            properties: { echo: { type: 'string' } },
            additionalProperties: false,
          },
        },
      ],
    })
    const entry = definePluginMain({ id: 'badout', capabilities: [] }, ({ actions }) => {
      actions.register('badout.do', async () => ({ wrong: 1 }))
    })
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    await r.activate('badout')
    await expect(r.invoke('badout', 'badout.do', {})).rejects.toThrow(/Ungültige Ausgabe/)
  })

  it('blockiert Aufrufe an ein nicht aktiviertes Plugin', async () => {
    const r = new PluginRegistry()
    r.register([echoSource()])
    await expect(r.invoke('echo', 'echo.do', { text: 'x' })).rejects.toThrow()
  })

  it('reicht den Capability-Host an den Main-Entry durch', async () => {
    const m = mkManifest('llm', {
      capabilities: ['llm.generate'],
      actions: [{ id: 'llm.sum', requiredCapabilities: ['llm.generate'] }],
    })
    const entry = definePluginMain(
      { id: 'llm', capabilities: ['llm.generate'] as const },
      ({ host, actions }) => {
        actions.register('llm.sum', async (p) => host.llm.generate((p as { t: string }).t))
      }
    )
    const generate = vi.fn(async () => 'zusammengefasst')
    const hostFactory = (): AnyPluginHost =>
      ({ log: () => {}, llm: { generate } }) as unknown as AnyPluginHost
    const r = new PluginRegistry(hostFactory)
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    await r.activate('llm')
    expect(await r.invoke('llm', 'llm.sum', { t: 'lang' })).toBe('zusammengefasst')
    expect(generate).toHaveBeenCalledOnce()
  })
})

describe('PluginRegistry — Fehler-Isolation', () => {
  it('ein werfender Setup landet im error-Zustand; Geschwister aktivieren weiter', async () => {
    const boomManifest = mkManifest('boom')
    const boomEntry = definePluginMain({ id: 'boom', capabilities: [] }, () => {
      throw new Error('kaputt im Setup')
    })
    const r = new PluginRegistry()
    r.register([{ manifest: boomManifest, loadEntry: async () => ({ default: boomEntry }) }, echoSource()])
    await r.activateAll()
    expect(r.get('boom')).toMatchObject({ activation: 'error' })
    expect(r.get('boom')?.error?.message).toContain('kaputt im Setup')
    expect(r.get('echo')?.activation).toBe('active')
  })

  it('erkennt eine Entry-ID, die nicht zum Manifest passt', async () => {
    const m = mkManifest('mism')
    const wrong: PluginMainEntry = { id: 'other', register: async () => {} }
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: wrong }) }])
    const state = await r.activate('mism')
    expect(state.activation).toBe('error')
    expect(state.error?.message).toMatch(/passt nicht/)
  })

  it('verweigert eine Action, die nicht im Manifest deklariert ist', async () => {
    const m = mkManifest('undecl')
    const entry = definePluginMain({ id: 'undecl', capabilities: [] }, ({ actions }) => {
      actions.register('undecl.ghost', async () => 'x')
    })
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    const state = await r.activate('undecl')
    expect(state.activation).toBe('error')
    expect(state.error?.message).toMatch(/nicht deklariert/)
  })
})

describe('PluginRegistry — Deaktivierung', () => {
  it('ruft stop(), leert Actions und blockiert danach Aufrufe', async () => {
    const stop = vi.fn(async () => {})
    const entry = definePluginMain(
      { id: 'echo', capabilities: [] },
      ({ actions }) => {
        actions.register('echo.do', async (p) => ({ echo: (p as { text: string }).text }))
      },
      { stop }
    )
    const r = new PluginRegistry()
    r.register([{ manifest: echoManifest, loadEntry: async () => ({ default: entry }) }])
    await r.activate('echo')
    const state = await r.deactivate('echo')
    expect(state.activation).toBe('disabled')
    expect(stop).toHaveBeenCalledOnce()
    await expect(r.invoke('echo', 'echo.do', { text: 'x' })).rejects.toThrow()
  })
})

describe('discoverMainPlugins (import.meta.glob-Verdrahtung)', () => {
  it('findet das Demo-Plugin und kann es aktivieren', async () => {
    const sources = discoverMainPlugins()
    const demo = sources.find((s) => s.manifest.id === 'demo')
    expect(demo).toBeDefined()
    expect(demo?.loadEntry).toBeTypeOf('function')

    const generate = vi.fn(async () => 'kurz')
    const r = new PluginRegistry(
      () => ({ log: () => {}, llm: { generate } }) as unknown as AnyPluginHost
    )
    r.register(sources)
    await r.activate('demo')
    expect(r.get('demo')?.activation).toBe('active')
    expect(await r.invoke('demo', 'demo.echo', { text: 'hallo' })).toEqual({ echo: 'hallo' })
    expect(await r.invoke('demo', 'demo.summarize', { text: 'lang' })).toBe('kurz')
  })
})
