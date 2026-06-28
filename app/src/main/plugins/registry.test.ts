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

  it('serialisiert Transitionen: deactivate während laufender Aktivierung gewinnt (Endzustand disabled)', async () => {
    // register signalisiert seinen Start und hängt dann an einem Deferred — so kommt das
    // deactivate ECHT mitten in der Aktivierung (nach dem desired-Check, im await register).
    let releaseRegister!: () => void
    let signalStarted!: () => void
    const gate = new Promise<void>((res) => { releaseRegister = res })
    const started = new Promise<void>((res) => { signalStarted = res })
    const stop = vi.fn(async () => {})
    const m = mkManifest('slow')
    const entry = definePluginMain(
      { id: 'slow', capabilities: [] },
      async () => { signalStarted(); await gate },
      { stop }
    )
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])

    const pAct = r.activate('slow')     // bleibt in register hängen
    await started                       // Aktivierung ist jetzt wirklich in-flight
    const pDeact = r.deactivate('slow') // gewünschter Endzustand: disabled
    releaseRegister()
    await Promise.all([pAct, pDeact])

    expect(r.get('slow')?.activation).toBe('disabled')
    expect(stop).toHaveBeenCalledOnce() // sauber gestoppt, nicht hängen geblieben als active
  })

  it('serialisiert Transitionen: synchrones An/Aus → letzter Wunsch (disabled) gewinnt ohne Start', async () => {
    // activate + deactivate im selben Tick: das Plugin startet gar nicht erst (desired-Check
    // im doActivate sieht bereits 'disabled') — bewusst kein verschwendeter Start/Stop.
    const stop = vi.fn(async () => {})
    let registered = false
    const m = mkManifest('sync')
    const entry = definePluginMain(
      { id: 'sync', capabilities: [] },
      () => { registered = true },
      { stop }
    )
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])

    const pAct = r.activate('sync')
    const pDeact = r.deactivate('sync')
    await Promise.all([pAct, pDeact])

    expect(r.get('sync')?.activation).toBe('disabled')
    expect(registered).toBe(false)
    expect(stop).not.toHaveBeenCalled()
  })

  it('serialisiert Transitionen: activate nach deactivate gewinnt (Endzustand active)', async () => {
    const r = new PluginRegistry()
    r.register([echoSource()])
    await r.activate('echo')
    const pDeact = r.deactivate('echo')
    const pAct = r.activate('echo') // letzter Wunsch: active
    await Promise.all([pDeact, pAct])
    expect(r.get('echo')?.activation).toBe('active')
  })

  it('ein fehlgeschlagenes stop() markiert error statt fälschlich disabled', async () => {
    const stop = vi.fn(async () => { throw new Error('Timer hängt') })
    const m = mkManifest('leaky')
    const entry = definePluginMain({ id: 'leaky', capabilities: [] }, () => {}, { stop })
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    await r.activate('leaky')
    const state = await r.deactivate('leaky')
    expect(state.activation).toBe('error')
    expect(state.error?.message).toMatch(/Stoppen fehlgeschlagen.*Timer hängt/)
  })

  it('versucht stop() beim nächsten Ausschalten ERNEUT (Entry bleibt, bis Stop durchläuft)', async () => {
    let calls = 0
    const stop = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('Timer hängt') // erster Versuch scheitert
    })
    const m = mkManifest('retry')
    const entry = definePluginMain({ id: 'retry', capabilities: [] }, () => {}, { stop })
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    await r.activate('retry')

    const s1 = await r.deactivate('retry')
    expect(s1.activation).toBe('error') // Stop gescheitert, Plugin läuft evtl. weiter

    const s2 = await r.deactivate('retry') // erneutes Ausschalten → stop() wird ERNEUT versucht
    expect(stop).toHaveBeenCalledTimes(2)
    expect(s2.activation).toBe('disabled') // diesmal sauber gestoppt
    expect(s2.error).toBeUndefined()
  })

  it('hält error und ruft stop() bei dauerhaftem Fehler bei jedem Ausschalten erneut auf', async () => {
    const stop = vi.fn(async () => { throw new Error('hängt dauerhaft') })
    const m = mkManifest('stuck')
    const entry = definePluginMain({ id: 'stuck', capabilities: [] }, () => {}, { stop })
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    await r.activate('stuck')
    expect((await r.deactivate('stuck')).activation).toBe('error')
    expect((await r.deactivate('stuck')).activation).toBe('error')
    expect(stop).toHaveBeenCalledTimes(2) // Entry blieb erhalten → Retry, nicht weggeklickt
  })

  it('deactivate räumt einen error-Zustand zu disabled auf (bewusstes Ausschalten)', async () => {
    const m = mkManifest('boom2')
    const entry = definePluginMain({ id: 'boom2', capabilities: [] }, () => {
      throw new Error('kaputt')
    })
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    await r.activate('boom2')
    expect(r.get('boom2')?.activation).toBe('error')
    const state = await r.deactivate('boom2')
    expect(state.activation).toBe('disabled')
    expect(state.error).toBeUndefined()
  })

  it('activateAll(isEnabled) überspringt deaktivierte Plugins — sie bleiben disabled', async () => {
    const onManifest = mkManifest('on')
    const onEntry = definePluginMain({ id: 'on', capabilities: [] }, () => {})
    const offManifest = mkManifest('off')
    const offEntry = definePluginMain({ id: 'off', capabilities: [] }, () => {})
    const r = new PluginRegistry()
    r.register([
      { manifest: onManifest, loadEntry: async () => ({ default: onEntry }) },
      { manifest: offManifest, loadEntry: async () => ({ default: offEntry }) },
    ])
    await r.activateAll((id) => id !== 'off')
    expect(r.get('on')?.activation).toBe('active')
    expect(r.get('off')?.activation).toBe('disabled')
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

describe('PluginRegistry — Hard-Lock-Guard', () => {
  it('blockt eine Action mit hardLockModule, wenn der Guard einen Grund liefert', async () => {
    const m = mkManifest('lock', {
      actions: [{ id: 'lock.do', requiredCapabilities: [], hardLockModule: 'task-extraction' }],
    })
    const entry = definePluginMain({ id: 'lock', capabilities: [] }, ({ actions }) => {
      actions.register('lock.do', async () => 'sollte nie laufen')
    })
    const guard = vi.fn(async () => 'Modell gesperrt')
    const r = new PluginRegistry(undefined, guard)
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    await r.activate('lock')
    await expect(r.invoke('lock', 'lock.do', {})).rejects.toThrow(/Modell gesperrt/)
    expect(guard).toHaveBeenCalledWith('task-extraction')
  })

  it('lässt durch, wenn der Guard null liefert', async () => {
    const m = mkManifest('lock', {
      actions: [{ id: 'lock.do', requiredCapabilities: [], hardLockModule: 'task-extraction' }],
    })
    const entry = definePluginMain({ id: 'lock', capabilities: [] }, ({ actions }) => {
      actions.register('lock.do', async () => 'ok')
    })
    const r = new PluginRegistry(undefined, async () => null)
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    await r.activate('lock')
    expect(await r.invoke('lock', 'lock.do', {})).toBe('ok')
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
