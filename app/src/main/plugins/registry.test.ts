import { describe, it, expect, vi } from 'vitest'
import { PluginRegistry, discoverMainPlugins, type MainPluginSource } from './registry'
import { definePluginMain, type PluginMainEntry } from '@mindgraph/plugin-api'
import type { PluginManifest } from '@mindgraph/plugin-api'
import type { AnyPluginHost } from '@mindgraph/plugin-api'

function mkManifest(id: string, over: Partial<PluginManifest> = {}): PluginManifest {
  return {
    manifestVersion: 2,
    id,
    version: '1.0.0',
    label: id,
    description: 'Test',
    category: 'ai',
    apiVersion: '^0.2.0',
    minAppVersion: '0.0.0',
    author: { name: 'Test' },
    entrypoints: { main: 'main.js' },
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

  it('kann einen transienten Aktivierungsfehler ohne Neustart erneut versuchen', async () => {
    let attempts = 0
    const stop = vi.fn(async () => {})
    const manifest = mkManifest('flaky')
    const entry = definePluginMain(
      { id: 'flaky', capabilities: [] },
      () => {
        attempts++
        if (attempts === 1) throw new Error('vorübergehend kaputt')
      },
      { stop }
    )
    const r = new PluginRegistry()
    r.register([{ manifest, loadEntry: async () => ({ default: entry }) }])

    expect((await r.activate('flaky')).activation).toBe('error')
    expect((await r.activate('flaky')).activation).toBe('active')
    expect(attempts).toBe(2)
    expect(stop).toHaveBeenCalledOnce()
  })

  it('räumt nach teilweise fehlgeschlagener Aktivierung über stop() auf', async () => {
    const stop = vi.fn(async () => {})
    const manifest = mkManifest('partial')
    const entry = definePluginMain(
      { id: 'partial', capabilities: [] },
      () => {
        throw new Error('Start nach Listener-Registrierung fehlgeschlagen')
      },
      { stop }
    )
    const r = new PluginRegistry()
    r.register([{ manifest, loadEntry: async () => ({ default: entry }) }])

    expect((await r.activate('partial')).activation).toBe('error')
    expect(stop).toHaveBeenCalledOnce()
  })

  it('behält den Entry, wenn das Aufräumen nach Aktivierungsfehler scheitert', async () => {
    let stopAttempts = 0
    const stop = vi.fn(async () => {
      stopAttempts++
      if (stopAttempts === 1) throw new Error('Cleanup hängt')
    })
    const manifest = mkManifest('partial-stuck')
    const entry = definePluginMain(
      { id: 'partial-stuck', capabilities: [] },
      () => {
        throw new Error('Start fehlgeschlagen')
      },
      { stop }
    )
    const r = new PluginRegistry()
    r.register([{ manifest, loadEntry: async () => ({ default: entry }) }])

    expect((await r.activate('partial-stuck')).activation).toBe('error')
    expect((await r.deactivate('partial-stuck')).activation).toBe('disabled')
    expect(stop).toHaveBeenCalledTimes(2)
  })

  it('startet keinen zweiten Entry, solange das Aufräumen vor dem Retry weiter scheitert', async () => {
    let registerAttempts = 0
    const stop = vi.fn(async () => {
      throw new Error('Cleanup hängt dauerhaft')
    })
    const manifest = mkManifest('partial-still-stuck')
    const entry = definePluginMain(
      { id: 'partial-still-stuck', capabilities: [] },
      () => {
        registerAttempts++
        throw new Error('Start fehlgeschlagen')
      },
      { stop }
    )
    const r = new PluginRegistry()
    r.register([{ manifest, loadEntry: async () => ({ default: entry }) }])

    expect((await r.activate('partial-still-stuck')).activation).toBe('error')
    expect((await r.activate('partial-still-stuck')).activation).toBe('error')
    expect(registerAttempts).toBe(1)
    expect(stop).toHaveBeenCalledTimes(2)
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

  it('ein LAUFZEIT-Aktivierungsfehler ist wiederholbar (Retry aktiviert)', async () => {
    let attempts = 0
    const m = mkManifest('flaky')
    const entry = definePluginMain({ id: 'flaky', capabilities: [] }, () => {
      attempts++
      if (attempts === 1) throw new Error('transient')
    })
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    expect((await r.activate('flaky')).activation).toBe('error')
    expect((await r.activate('flaky')).activation).toBe('active') // Retry setzt zurück
  })

  it('ein ungültiges Manifest bleibt TERMINAL (kein Aktivierungs-Retry, Entry nie geladen)', async () => {
    let entryLoaded = false
    const r = new PluginRegistry()
    r.register([{
      manifest: { id: 'Bad ID' } as PluginManifest,
      loadEntry: async () => { entryLoaded = true; return { default: {} as PluginMainEntry } },
    }])
    expect(r.get('Bad ID')?.activation).toBe('error')
    expect((await r.activate('Bad ID')).activation).toBe('error')
    expect((await r.activate('Bad ID')).activation).toBe('error')
    expect(entryLoaded).toBe(false)
  })

  it('best-effort stop() wenn start() nach Ressourcen-Anlage wirft', async () => {
    const stop = vi.fn(async () => {})
    const m = mkManifest('leakystart')
    const entry = definePluginMain(
      { id: 'leakystart', capabilities: [] },
      () => {},
      { start: async () => { throw new Error('start kaputt') }, stop }
    )
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    const state = await r.activate('leakystart')
    expect(state.activation).toBe('error')
    expect(stop).toHaveBeenCalledOnce() // angelegte Ressourcen best-effort gestoppt
  })

  it('fehlgeschlagener Start + fehlgeschlagener Stop behält Entry → Deactivate-Retry stoppt', async () => {
    let stopCalls = 0
    const stop = vi.fn(async () => { stopCalls++; if (stopCalls === 1) throw new Error('stop kaputt') })
    const m = mkManifest('leak2')
    const entry = definePluginMain(
      { id: 'leak2', capabilities: [] },
      () => {},
      { start: async () => { throw new Error('start kaputt') }, stop }
    )
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    expect((await r.activate('leak2')).activation).toBe('error')
    expect(stop).toHaveBeenCalledTimes(1) // best-effort scheiterte → Entry behalten
    expect((await r.deactivate('leak2')).activation).toBe('disabled') // Retry stoppt sauber
    expect(stop).toHaveBeenCalledTimes(2)
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

  it('unregister() stoppt + entfernt ein sauberes Plugin', async () => {
    const stop = vi.fn(async () => {})
    const m = mkManifest('clean')
    const entry = definePluginMain({ id: 'clean', capabilities: [] }, () => {}, { stop })
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    await r.activate('clean')
    await r.unregister('clean')
    expect(stop).toHaveBeenCalledOnce()
    expect(r.get('clean')).toBeUndefined() // aus der Map entfernt
  })

  it('unregister() WIRFT und BEHÄLT den Entry, wenn stop() fehlschlägt', async () => {
    const stop = vi.fn(async () => { throw new Error('stop kaputt') })
    const m = mkManifest('sticky')
    const entry = definePluginMain({ id: 'sticky', capabilities: [] }, () => {}, { stop })
    const r = new PluginRegistry()
    r.register([{ manifest: m, loadEntry: async () => ({ default: entry }) }])
    await r.activate('sticky')
    await expect(r.unregister('sticky')).rejects.toThrow(/stop kaputt|stoppen/)
    // NICHT gelöscht — der Entry mit evtl. laufenden Ressourcen bleibt für einen Retry erreichbar.
    expect(r.get('sticky')).toBeDefined()
    expect(r.get('sticky')?.activation).toBe('error')
  })

  it('unregister() einer unbekannten ID ist ein No-Op (wirft nicht)', async () => {
    const r = new PluginRegistry()
    await expect(r.unregister('ghost')).resolves.toBeUndefined()
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

describe('PluginRegistry — Readiness (needs-configuration)', () => {
  // In-Memory-Secrets-Host: simuliert host.secrets (safeStorage) für die Readiness-Prüfung.
  function secretsHostFactory(store: Map<string, string>): () => AnyPluginHost {
    return () =>
      ({
        log: () => {},
        secrets: {
          get: async (k: string) => store.get(k) ?? null,
          set: async (k: string, v: string) => { store.set(k, v) },
          delete: async (k: string) => { store.delete(k) },
        },
      }) as unknown as AnyPluginHost
  }

  const credManifest = mkManifest('cred', {
    capabilities: ['secrets'],
    credentials: [{ key: 'token', label: 'Token', secret: true }],
    actions: [
      {
        id: 'cred.saveCredentials',
        requiredCapabilities: ['secrets'],
        isWrite: true,
        inputSchema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } }, additionalProperties: false },
      },
      { id: 'cred.deleteCredentials', requiredCapabilities: ['secrets'], isWrite: true },
      { id: 'cred.use', requiredCapabilities: ['secrets'] },
    ],
  })

  function credEntry(): PluginMainEntry {
    return definePluginMain({ id: 'cred', capabilities: ['secrets'] as const }, ({ host, actions }) => {
      actions.register('cred.saveCredentials', async (p) => { await host.secrets.set('token', (p as { token: string }).token); return true })
      actions.register('cred.deleteCredentials', async () => { await host.secrets.delete('token'); return true })
      actions.register('cred.use', async () => ((await host.secrets.get('token')) ? 'ok' : 'nope'))
    })
  }

  it('Plugin ohne Credentials ist nach Aktivierung sofort ready', async () => {
    const r = new PluginRegistry()
    r.register([echoSource()])
    await r.activate('echo')
    expect(r.get('echo')?.readiness).toBe('ready')
  })

  it('ohne hinterlegte Credentials → needs-configuration; saveCredentials flippt zu ready', async () => {
    const store = new Map<string, string>()
    const r = new PluginRegistry(secretsHostFactory(store))
    r.register([{ manifest: credManifest, loadEntry: async () => ({ default: credEntry() }) }])

    await r.activate('cred')
    expect(r.get('cred')?.readiness).toBe('needs-configuration')

    // Kein Deadlock: die Setup-Action ist trotz needs-configuration aufrufbar …
    await r.invoke('cred', 'cred.saveCredentials', { token: 'abc' })
    // … und der Auto-Refresh nach isWrite+secrets meldet jetzt ready.
    expect(r.get('cred')?.readiness).toBe('ready')
  })

  it('eine normale Action ist auch bei needs-configuration aufrufbar (self-guard statt Gate)', async () => {
    const store = new Map<string, string>()
    const r = new PluginRegistry(secretsHostFactory(store))
    r.register([{ manifest: credManifest, loadEntry: async () => ({ default: credEntry() }) }])
    await r.activate('cred')
    expect(r.get('cred')?.readiness).toBe('needs-configuration')
    expect(await r.invoke('cred', 'cred.use', {})).toBe('nope') // Action selbst, nicht das Gate, antwortet
  })

  it('deleteCredentials kippt ready zurück auf needs-configuration', async () => {
    const store = new Map<string, string>([['token', 'abc']])
    const r = new PluginRegistry(secretsHostFactory(store))
    r.register([{ manifest: credManifest, loadEntry: async () => ({ default: credEntry() }) }])
    await r.activate('cred')
    expect(r.get('cred')?.readiness).toBe('ready')
    await r.invoke('cred', 'cred.deleteCredentials', {})
    expect(r.get('cred')?.readiness).toBe('needs-configuration')
  })

  it('optionale Credentials (required:false) zählen nicht in die Readiness', async () => {
    const store = new Map<string, string>([['token', 'abc']]) // nur das Pflicht-Credential
    const optManifest = mkManifest('opt', {
      capabilities: ['secrets'],
      credentials: [
        { key: 'token', label: 'Token', secret: true },
        { key: 'extra', label: 'Optional', secret: true, required: false },
      ],
    })
    const entry = definePluginMain({ id: 'opt', capabilities: ['secrets'] as const }, () => {})
    const r = new PluginRegistry(secretsHostFactory(store))
    r.register([{ manifest: optManifest, loadEntry: async () => ({ default: entry }) }])
    await r.activate('opt')
    expect(r.get('opt')?.readiness).toBe('ready') // 'extra' fehlt, blockt aber nicht
  })

  it('technischer Fehler beim Secrets-Lesen → unavailable (kein Fail-open auf ready)', async () => {
    const brokenHost = () =>
      ({
        log: () => {},
        secrets: {
          get: async () => { throw new Error('safeStorage kaputt') },
          set: async () => {},
          delete: async () => {},
        },
      }) as unknown as AnyPluginHost
    const r = new PluginRegistry(brokenHost)
    r.register([{ manifest: credManifest, loadEntry: async () => ({ default: credEntry() }) }])
    await r.activate('cred')
    // Plugin läuft (Code geladen), ist aber NICHT als ready ausgewiesen — der Speicher ist defekt.
    expect(r.get('cred')?.activation).toBe('active')
    expect(r.get('cred')?.readiness).toBe('unavailable')
  })

  it('refreshReadiness bewertet ein aktives Plugin neu', async () => {
    const store = new Map<string, string>()
    const r = new PluginRegistry(secretsHostFactory(store))
    r.register([{ manifest: credManifest, loadEntry: async () => ({ default: credEntry() }) }])
    await r.activate('cred')
    expect(r.get('cred')?.readiness).toBe('needs-configuration')
    store.set('token', 'xyz') // direkt am Host vorbei gesetzt
    expect((await r.refreshReadiness('cred')).readiness).toBe('ready')
  })
})

describe('PluginRegistry — Kompatibilitäts-Gate', () => {
  const noopEntry = (id: string) =>
    async () => ({ default: definePluginMain({ id, capabilities: [] }, () => {}) })

  it('inkompatible apiVersion ⇒ error/incompatible-api, terminal (kein Retry)', async () => {
    const r = new PluginRegistry()
    r.register([{ manifest: mkManifest('oldapi', { apiVersion: '^9.9.9' }), loadEntry: noopEntry('oldapi') }])
    expect(r.get('oldapi')?.activation).toBe('error')
    expect(r.get('oldapi')?.error?.kind).toBe('incompatible-api')
    expect((await r.activate('oldapi')).activation).toBe('error')
  })

  it('zu hohe minAppVersion ⇒ error/incompatible-app (App-Version per DI)', () => {
    const r = new PluginRegistry(undefined, undefined, '0.8.14')
    r.register([{ manifest: mkManifest('newapp', { minAppVersion: '999.0.0' }), loadEntry: noopEntry('newapp') }])
    expect(r.get('newapp')?.activation).toBe('error')
    expect(r.get('newapp')?.error?.kind).toBe('incompatible-app')
  })

  it('ohne appVersion wird das App-Gate übersprungen (nur API-Gate greift)', () => {
    const r = new PluginRegistry() // keine appVersion injiziert
    r.register([{ manifest: mkManifest('skipapp', { minAppVersion: '999.0.0' }), loadEntry: noopEntry('skipapp') }])
    expect(r.get('skipapp')?.activation).toBe('disabled')
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
