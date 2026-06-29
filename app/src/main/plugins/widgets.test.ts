import { describe, expect, it, vi } from 'vitest'
import type { PluginManifest, WidgetView } from '@mindgraph/plugin-api'
import { ExternalWidgetRuntime, WIDGET_RUNTIME_LIMITS } from './widgets'

const manifest = (over: Partial<PluginManifest> = {}): PluginManifest => ({
  manifestVersion: 2,
  id: 'external-demo',
  version: '1.0.0',
  label: 'External Demo',
  description: '',
  category: 'ai',
  apiVersion: '^0.2.0',
  minAppVersion: '0.8.14',
  author: { name: 'Test' },
  entrypoints: { main: 'main.js' },
  capabilities: [],
  actions: [{
    id: 'external-demo.widget',
    requiredCapabilities: [],
    widgetProvider: true,
    isWrite: false,
  }],
  ui: {
    dashboardWidget: { slot: 'dashboard.widget', fromAction: 'external-demo.widget' },
  },
  ...over,
})

describe('ExternalWidgetRuntime', () => {
  it('bindet instanceId main-seitig an Plugin, Action und Slot', async () => {
    const invoke = vi.fn(async () => ({ kind: 'badge', text: 'OK' } satisfies WidgetView))
    const runtime = new ExternalWidgetRuntime({ invoke })
    runtime.sync([manifest()])
    const [descriptor] = runtime.list()
    expect(descriptor).toMatchObject({
      pluginId: 'external-demo',
      pluginLabel: 'External Demo',
      slot: 'dashboard.widget',
    })
    await expect(runtime.invoke(descriptor.instanceId)).resolves.toEqual({ kind: 'badge', text: 'OK' })
    expect(invoke).toHaveBeenCalledWith('external-demo', 'external-demo.widget', {})
  })

  it('verwirft Provider ohne beide expliziten Marker defense-in-depth', () => {
    const runtime = new ExternalWidgetRuntime({ invoke: vi.fn() })
    const missingFalse = manifest({
      actions: [{ id: 'external-demo.widget', requiredCapabilities: [], widgetProvider: true }],
    })
    runtime.sync([missingFalse])
    expect(runtime.list()).toEqual([])
  })

  it('validiert Output strikt gegen WIDGET_VIEW_SCHEMA', async () => {
    const runtime = new ExternalWidgetRuntime({ invoke: async () => ({ kind: 'badge', text: 'x', html: '<b>x</b>' }) })
    runtime.sync([manifest()])
    await expect(runtime.invoke(runtime.list()[0].instanceId)).rejects.toThrow(/Ungültige Widget-Daten/)
  })

  it('begrenzt Payload-Größe', async () => {
    const runtime = new ExternalWidgetRuntime({
      invoke: async () => ({ kind: 'badge', text: 'x'.repeat(WIDGET_RUNTIME_LIMITS.maxPayloadBytes) }),
    })
    runtime.sync([manifest()])
    await expect(runtime.invoke(runtime.list()[0].instanceId)).rejects.toThrow(/Größenlimit/)
  })

  it('dedupliziert parallele Aufrufe und cached innerhalb des Refresh-Limits', async () => {
    let resolve!: (value: WidgetView) => void
    const invoke = vi.fn(() => new Promise<WidgetView>((res) => { resolve = res }))
    let now = 10_000
    const runtime = new ExternalWidgetRuntime({ invoke }, () => now)
    runtime.sync([manifest()])
    const id = runtime.list()[0].instanceId
    const first = runtime.invoke(id)
    const parallel = runtime.invoke(id)
    expect(invoke).toHaveBeenCalledTimes(1)
    resolve({ kind: 'badge', text: 'OK' })
    await expect(Promise.all([first, parallel])).resolves.toEqual([
      { kind: 'badge', text: 'OK' },
      { kind: 'badge', text: 'OK' },
    ])
    now += 100
    await runtime.invoke(id)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('entfernt Instanzen, die beim Sync nicht mehr aktiv sind', async () => {
    const runtime = new ExternalWidgetRuntime({ invoke: vi.fn() })
    runtime.sync([manifest()])
    const id = runtime.list()[0].instanceId
    runtime.sync([])
    expect(runtime.list()).toEqual([])
    await expect(runtime.invoke(id)).rejects.toThrow(/nicht aktiv/)
  })

  it('liefert kein spätes Ergebnis nach Runtime-Unload', async () => {
    let resolve!: (value: WidgetView) => void
    const runtime = new ExternalWidgetRuntime({
      invoke: () => new Promise<WidgetView>((res) => { resolve = res }),
    })
    runtime.sync([manifest()])
    const pending = runtime.invoke(runtime.list()[0].instanceId)
    runtime.sync([])
    resolve({ kind: 'badge', text: 'zu spät' })
    await expect(pending).rejects.toThrow(/entladen/)
  })

  it('behält einen laufenden Request bei einem inhaltlich identischen Sync', async () => {
    let resolve!: (value: WidgetView) => void
    const runtime = new ExternalWidgetRuntime({
      invoke: () => new Promise<WidgetView>((res) => { resolve = res }),
    })
    const same = manifest()
    runtime.sync([same])
    const id = runtime.list()[0].instanceId
    const pending = runtime.invoke(id)
    runtime.sync([same])
    expect(runtime.list()[0].instanceId).toBe(id)
    resolve({ kind: 'badge', text: 'OK' })
    await expect(pending).resolves.toEqual({ kind: 'badge', text: 'OK' })
  })

  it('invalidiert instanceId und Cache bei Plugin-Upgrade', () => {
    const runtime = new ExternalWidgetRuntime({ invoke: vi.fn() })
    runtime.sync([manifest()])
    const oldId = runtime.list()[0].instanceId
    runtime.sync([manifest({ version: '2.0.0' })])
    expect(runtime.list()[0].instanceId).not.toBe(oldId)
  })
})
