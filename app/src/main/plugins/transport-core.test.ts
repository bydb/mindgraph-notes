import { describe, it, expect } from 'vitest'
import { dispatchInvoke, type InvokableRegistry } from './transport-core'
import { PluginRegistry, type MainPluginSource } from './registry'
import { definePluginMain } from '@mindgraph/plugin-api'
import type { PluginManifest } from '@mindgraph/plugin-api'
import type { AnyPluginHost } from '@mindgraph/plugin-api'

// Eine echte Registry mit einer reinen Action + einer host-abhängigen Action.
function buildRegistry(): PluginRegistry {
  const manifest: PluginManifest = {
    id: 'demo',
    version: '1.0.0',
    label: 'Demo',
    description: 'x',
    category: 'ai',
    capabilities: ['llm.generate'],
    actions: [
      {
        id: 'demo.echo',
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
      { id: 'demo.boom', requiredCapabilities: [] },
    ],
  }
  const entry = definePluginMain(
    { id: 'demo', capabilities: ['llm.generate'] as const },
    ({ actions }) => {
      actions.register('demo.echo', async (p) => ({ echo: (p as { text: string }).text }))
      actions.register('demo.boom', async () => {
        throw new Error('Executor explodiert')
      })
    }
  )
  const source: MainPluginSource = { manifest, loadEntry: async () => ({ default: entry }) }
  const registry = new PluginRegistry(
    () => ({ log: () => {} }) as unknown as AnyPluginHost
  )
  registry.register([source])
  return registry
}

describe('dispatchInvoke — Argument-Härtung', () => {
  const stub: InvokableRegistry = { invoke: async () => 'unerreichbar' }

  it('lehnt nicht-String pluginId ab, ohne die Registry zu rufen', async () => {
    const r = await dispatchInvoke(stub, 123, 'demo.echo', {})
    expect(r).toEqual({ ok: false, error: expect.stringContaining('Strings') })
  })

  it('lehnt nicht-String actionId ab', async () => {
    const r = await dispatchInvoke(stub, 'demo', null, {})
    expect(r.ok).toBe(false)
  })
})

describe('dispatchInvoke — Normalisierung gegen echte Registry', () => {
  it('liefert {ok:true,data} für einen gültigen Aufruf', async () => {
    const registry = buildRegistry()
    await registry.activate('demo')
    const r = await dispatchInvoke(registry, 'demo', 'demo.echo', { text: 'hi' })
    expect(r).toEqual({ ok: true, data: { echo: 'hi' } })
  })

  it('packt einen Schema-Verstoß in {ok:false,error}', async () => {
    const registry = buildRegistry()
    await registry.activate('demo')
    const r = await dispatchInvoke(registry, 'demo', 'demo.echo', { text: 5 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Ungültige Eingabe')
  })

  it('packt eine Executor-Exception in {ok:false,error}', async () => {
    const registry = buildRegistry()
    await registry.activate('demo')
    const r = await dispatchInvoke(registry, 'demo', 'demo.boom', {})
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Executor explodiert')
  })

  it('packt einen Aufruf an ein nicht aktiviertes Plugin in {ok:false,error}', async () => {
    const registry = buildRegistry() // nicht aktiviert
    const r = await dispatchInvoke(registry, 'demo', 'demo.echo', { text: 'x' })
    expect(r.ok).toBe(false)
  })

  it('packt eine unbekannte Action in {ok:false,error}', async () => {
    const registry = buildRegistry()
    await registry.activate('demo')
    const r = await dispatchInvoke(registry, 'demo', 'demo.ghost', {})
    expect(r.ok).toBe(false)
    expect(r.error).toContain('demo.ghost')
  })
})
