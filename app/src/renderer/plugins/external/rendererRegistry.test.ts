// Tests für den sicherheitssensibelsten Renderer-Pfad: Laden/Staging/Teardown externer Renderer-Plugins
// (ADR plugin-renderer-host §6/§7, F06/F10/F11). Der echte Blob-`import()` ist über `RendererLoaderEnv`
// abstrahiert → vollständig in Node testbar, ohne DOM/Electron.

import { describe, it, expect, vi } from 'vitest'
import type {
  PluginRendererHost,
  PluginRendererModule,
} from '@mindgraph/plugin-api'
import type {
  RendererActivateAck,
  RendererDescriptor,
  RendererListResult,
  RendererServeResult,
} from '../../../shared/plugins/renderer'
import { ExternalRendererRegistry, type RendererLoaderEnv } from './rendererRegistry'

interface FakePlugin {
  pluginId: string
  version?: string
  instanceId: string
  editorIds: string[] // im Manifest deklariert
  styles?: string
  /** Test-Hook: was das Modul beim activate tut (Default: alle deklarierten editorIds 1× registrieren). */
  module?: unknown
}

// Minimaler Fake-HTMLElement-Ersatz (vitest läuft im node-Env ohne DOM — bewusst pure-logic).
const fakeEl = (): HTMLElement => ({ dataset: {} } as unknown as HTMLElement)

function descriptorOf(p: FakePlugin): RendererDescriptor {
  return {
    pluginId: p.pluginId,
    pluginLabel: p.pluginId,
    version: p.version ?? '1.0.0',
    rendererInstanceId: p.instanceId,
    fileEditors: p.editorIds.map((editorId) => ({ editorId, extensions: [`.${editorId}`] })),
  }
}

function wellBehavedModule(pluginId: string, editorIds: string[]): PluginRendererModule {
  return {
    id: pluginId,
    activate: (host: PluginRendererHost) => {
      for (const editorId of editorIds) {
        host.registerFileEditor({ editorId, mount: (el) => { el.dataset.mounted = editorId; return () => { el.dataset.mounted = '' } } })
      }
    },
    deactivate: vi.fn(),
  }
}

function makeEnv(plugins: FakePlugin[]) {
  const acks: RendererActivateAck[] = []
  const revoked: string[] = []
  const stylesApplied = new Map<string, string>()
  const stylesRemoved: string[] = []
  const hostCalls: Array<{ instanceId: string; op: string; args: unknown[] }> = []
  // Die Blob-URL kodiert deterministisch die pluginId (über den code-Kommentar) → importUrl ist eindeutig.
  const codeFor = (pluginId: string): string => `/* ${pluginId} */`

  const env: RendererLoaderEnv = {
    fetchList: async (): Promise<RendererListResult> => ({ ok: true, data: plugins.map(descriptorOf) }),
    fetchEntry: async (pluginId): Promise<RendererServeResult> => {
      const p = plugins.find((x) => x.pluginId === pluginId)
      if (!p) return { ok: false, error: 'not found' }
      return {
        ok: true,
        data: {
          rendererInstanceId: p.instanceId,
          pluginId: p.pluginId,
          pluginLabel: p.pluginId,
          version: p.version ?? '1.0.0',
          code: codeFor(pluginId),
          styles: p.styles,
          fileEditors: p.editorIds.map((editorId) => ({ editorId, extensions: [`.${editorId}`] })),
        },
      }
    },
    invokeHost: async (instanceId, op, args) => {
      hostCalls.push({ instanceId, op, args })
      // Nur die jeweils aktuell deklarierte instanceId ist „aktiv" (simuliert main-seitiges Gate, F10).
      const active = plugins.some((p) => p.instanceId === instanceId)
      return active ? { ok: true, data: `${op}-ok` } : { ok: false, error: 'Renderer-Instanz nicht aktiv' }
    },
    ackActivated: async (ack) => { acks.push(ack) },
    createModuleUrl: (code) => `fake:${encodeURIComponent(code)}`,
    importUrl: async (url) => {
      const code = decodeURIComponent(url.slice('fake:'.length))
      const pluginId = /\/\* (.+?) \*\//.exec(code)?.[1]
      const p = plugins.find((x) => x.pluginId === pluginId)
      if (!p) throw new Error(`kein Modul für ${url}`)
      if (p.module === '__throw__') throw new Error('import boom')
      return { default: p.module ?? wellBehavedModule(p.pluginId, p.editorIds) }
    },
    revokeModuleUrl: (url) => { revoked.push(url) },
    applyStyles: (pluginId, css) => { stylesApplied.set(pluginId, css) },
    removeStyles: (pluginId) => { stylesRemoved.push(pluginId) },
    getTheme: () => 'light',
    onThemeChange: () => () => {},
  }

  return { env, acks, revoked, stylesApplied, stylesRemoved, hostCalls }
}

describe('ExternalRendererRegistry — Laden + Staging (F06/F11)', () => {
  it('lädt ein wohlgeformtes Plugin, ackt ok, und stellt den Mount bereit', async () => {
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'] }]
    const { env, acks, stylesApplied } = makeEnv(plugins)
    plugins[0].styles = '.x{}'
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()

    expect(reg.isLoaded('demo', 'draw')).toBe(true)
    expect(acks).toEqual([{ ok: true, rendererInstanceId: 'i1' }])
    expect(stylesApplied.get('demo')).toBe('.x{}')

    const el = fakeEl()
    const dispose = reg.mountEditor('demo', 'draw', el, 'sketch.draw')
    expect(dispose).toBeTypeOf('function')
    expect(el.dataset.mounted).toBe('draw')
  })

  it('lehnt ein Modul ohne gültigen { id, activate }-Export ab (contract)', async () => {
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: { id: 'demo' } }]
    const { env, acks, revoked } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()

    expect(reg.isLoaded('demo')).toBe(false)
    expect(acks[0]).toMatchObject({ ok: false, phase: 'contract' })
    expect(revoked.length).toBe(1) // Blob-URL freigegeben
  })

  it('lehnt id-Mismatch zwischen Export und Descriptor ab (contract)', async () => {
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: wellBehavedModule('evil', ['draw']) }]
    const { env, acks } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(acks[0]).toMatchObject({ ok: false, phase: 'contract' })
    expect(reg.isLoaded('demo')).toBe(false)
  })

  it('import-Wurf → ack import + Blob revoke', async () => {
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: '__throw__' }]
    const { env, acks, revoked } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(acks[0]).toMatchObject({ ok: false, phase: 'import' })
    expect(revoked.length).toBe(1)
    expect(reg.isLoaded('demo')).toBe(false)
  })

  it('activate-Wurf → ack activate, Styles entfernt, Blob revoke, nicht geladen', async () => {
    const mod: PluginRendererModule = { id: 'demo', activate: () => { throw new Error('activate boom') } }
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: mod, styles: '.x{}' }]
    const { env, acks, revoked, stylesRemoved } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(acks[0]).toMatchObject({ ok: false, phase: 'activate' })
    expect(stylesRemoved).toContain('demo')
    expect(revoked.length).toBe(1)
    expect(reg.isLoaded('demo')).toBe(false)
  })

  it('unbekannte editorId in registerFileEditor → ack register', async () => {
    const mod: PluginRendererModule = {
      id: 'demo',
      activate: (h) => h.registerFileEditor({ editorId: 'unknown', mount: () => () => {} }),
    }
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: mod }]
    const { env, acks } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(acks[0]).toMatchObject({ ok: false, phase: 'register' })
    expect(reg.isLoaded('demo')).toBe(false)
  })

  it('doppelte editorId → ack register', async () => {
    const mod: PluginRendererModule = {
      id: 'demo',
      activate: (h) => {
        h.registerFileEditor({ editorId: 'draw', mount: () => () => {} })
        h.registerFileEditor({ editorId: 'draw', mount: () => () => {} })
      },
    }
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: mod }]
    const { env, acks } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(acks[0]).toMatchObject({ ok: false, phase: 'register' })
  })

  it('fehlender deklarierter Beitrag (nicht registriert) → ack register', async () => {
    const mod: PluginRendererModule = { id: 'demo', activate: () => { /* registriert nichts */ } }
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: mod }]
    const { env, acks } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(acks[0]).toMatchObject({ ok: false, phase: 'register' })
    expect(reg.isLoaded('demo')).toBe(false)
  })
})

describe('ExternalRendererRegistry — Lifecycle (F10/§5.5)', () => {
  it('captured instanceId: vault-Calls gehen an die Lade-instanceId', async () => {
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'] }]
    const { env, hostCalls } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    // Modul, das beim Mount einen vault-Call macht.
    plugins[0].module = {
      id: 'demo',
      activate: (h: PluginRendererHost) =>
        h.registerFileEditor({
          editorId: 'draw',
          mount: (_el, ctx) => { void ctx.host.vault.read('a.md'); return () => {} },
        }),
    }
    await reg.sync()
    const el = fakeEl()
    reg.mountEditor('demo', 'draw', el, 'x.draw')
    await Promise.resolve()
    expect(hostCalls).toContainEqual({ instanceId: 'i1', op: 'vault.read', args: ['a.md'] })
  })

  it('instanceId-Wechsel (Upgrade): alter Eintrag wird gedraint/disposed, neuer geladen', async () => {
    const deactivate = vi.fn()
    const plugins: FakePlugin[] = [
      { pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: { id: 'demo', activate: (h: PluginRendererHost) => h.registerFileEditor({ editorId: 'draw', mount: () => () => {} }), deactivate } },
    ]
    const { env, revoked, stylesRemoved } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(reg.getInstanceId('demo')).toBe('i1')

    // Upgrade: gleiche pluginId, neue instanceId.
    plugins[0] = { pluginId: 'demo', instanceId: 'i2', editorIds: ['draw'] }
    await reg.sync()

    expect(deactivate).toHaveBeenCalledTimes(1) // alter Eintrag deaktiviert
    expect(stylesRemoved).toContain('demo')
    expect(revoked.length).toBeGreaterThanOrEqual(1) // alte Blob-URL freigegeben
    expect(reg.getInstanceId('demo')).toBe('i2')
    expect(reg.isLoaded('demo', 'draw')).toBe(true)
  })

  it('entferntes Plugin: Teardown (deactivate + Styles + Blob), danach nicht geladen', async () => {
    const deactivate = vi.fn()
    const plugins: FakePlugin[] = [
      { pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], styles: '.x{}', module: { id: 'demo', activate: (h: PluginRendererHost) => h.registerFileEditor({ editorId: 'draw', mount: () => () => {} }), deactivate } },
    ]
    const { env, revoked, stylesRemoved } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(reg.isLoaded('demo')).toBe(true)

    plugins.length = 0 // alles entfernt
    await reg.sync()

    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(stylesRemoved).toContain('demo')
    expect(revoked.length).toBe(1)
    expect(reg.isLoaded('demo')).toBe(false)
  })

  it('Teardown disposed aktive Mounts; dispose ist idempotent', async () => {
    const mountDispose = vi.fn()
    const plugins: FakePlugin[] = [
      { pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: { id: 'demo', activate: (h: PluginRendererHost) => h.registerFileEditor({ editorId: 'draw', mount: () => mountDispose }), deactivate: vi.fn() } },
    ]
    const { env } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    const el = fakeEl()
    const dispose = reg.mountEditor('demo', 'draw', el, 'x.draw')
    expect(dispose).toBeTypeOf('function')

    plugins.length = 0
    await reg.sync() // Teardown disposed den aktiven Mount
    expect(mountDispose).toHaveBeenCalledTimes(1)

    dispose?.() // erneuter dispose durch den Tab → idempotent
    expect(mountDispose).toHaveBeenCalledTimes(1)
  })
})

describe('ExternalRendererRegistry — gerichteter Teardown + Acks (F15/F16/F17/F19)', () => {
  const draws = (deactivate?: () => unknown): unknown => ({
    id: 'demo',
    activate: (h: PluginRendererHost) => h.registerFileEditor({ editorId: 'draw', mount: () => () => {} }),
    deactivate,
  })

  it('teardownInstance success: deactivate sauber → success, entladen, Chrome weg', async () => {
    const deactivate = vi.fn()
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], styles: '.x{}', module: draws(deactivate) }]
    const { env, revoked, stylesRemoved } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(await reg.teardownInstance('i1')).toBe('success')
    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(reg.isLoaded('demo')).toBe(false)
    expect(stylesRemoved).toContain('demo')
    expect(revoked.length).toBe(1)
  })

  it('teardownInstance error: deactivate wirft → error, dennoch entladen + Chrome weg', async () => {
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], styles: '.x{}', module: draws(() => { throw new Error('deactivate boom') }) }]
    const { env, revoked, stylesRemoved } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(await reg.teardownInstance('i1')).toBe('error')
    expect(reg.isLoaded('demo')).toBe(false)
    expect(stylesRemoved).toContain('demo')
    expect(revoked.length).toBe(1)
  })

  it('teardownInstance timeout: deactivate hängt → timeout, Eintrag + Chrome BLEIBEN (fail-closed)', async () => {
    vi.useFakeTimers()
    try {
      const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], styles: '.x{}', module: draws(() => new Promise(() => {})) }]
      const { env, revoked, stylesRemoved } = makeEnv(plugins)
      const reg = new ExternalRendererRegistry(env)
      await reg.sync()
      const p = reg.teardownInstance('i1')
      await vi.advanceTimersByTimeAsync(5000)
      expect(await p).toBe('timeout')
      expect(reg.isLoaded('demo')).toBe(true) // bleibt geladen (fail-closed)
      expect(stylesRemoved).not.toContain('demo')
      expect(revoked.length).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('teardownInstance unbekannte instanceId → success (idempotent)', async () => {
    const { env } = makeEnv([])
    const reg = new ExternalRendererRegistry(env)
    expect(await reg.teardownInstance('does-not-exist')).toBe('success')
  })

  it('F19: Entladen des LETZTEN Plugins benachrichtigt Abonnenten', async () => {
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: draws(vi.fn()) }]
    const { env } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    const before = reg.getRevision()
    const cb = vi.fn()
    const unsub = reg.subscribe(cb)
    plugins.length = 0
    await reg.sync()
    expect(cb).toHaveBeenCalled()
    expect(reg.getRevision()).toBeGreaterThan(before)
    unsub()
  })

  it('F18: Erfolgs-Ack-Zustellung scheitert → Kandidat wird lokal vollständig zurückgenommen', async () => {
    const deactivate = vi.fn()
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], styles: '.x{}', module: draws(deactivate) }]
    const { env, revoked, stylesRemoved } = makeEnv(plugins)
    env.ackActivated = async (ack) => {
      if (ack.ok) throw new Error('ipc down') // Erfolgs-Ack lässt sich nicht zustellen
    }
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(reg.isLoaded('demo')).toBe(false) // zurückgenommen, kein Zombie
    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(stylesRemoved).toContain('demo')
    expect(revoked.length).toBe(1)
  })

  it('F17: missing-contribution-Fehler → best-effort module.deactivate läuft', async () => {
    const deactivate = vi.fn()
    // activate registriert NICHT die deklarierte editorId → register-Fehler, aber Code lief → deactivate.
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: { id: 'demo', activate: () => { /* nichts */ }, deactivate } }]
    const { env, acks } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(acks[0]).toMatchObject({ ok: false, phase: 'register' })
    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(reg.isLoaded('demo')).toBe(false)
  })
})

describe('ExternalRendererRegistry — Outcome-Tombstone + Matrix-treuer Timeout (F22/F25/F26/F27)', () => {
  it('F22: Aktivierungsfehler + werfendes deactivate → Tombstone; gerichteter Teardown liefert error', async () => {
    const mod = { id: 'demo', activate: () => { throw new Error('activate boom') }, deactivate: () => { throw new Error('deactivate boom') } }
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: mod }]
    const { env, acks } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(acks[0]).toMatchObject({ ok: false, phase: 'activate' })
    expect(reg.isLoaded('demo')).toBe(false) // nie geladen
    // Mains späterer gerichteter Teardown derselben instanceId MUSS den echten Ausgang liefern (nicht success).
    expect(await reg.teardownInstance('i1')).toBe('error')
  })

  it('F25: timeout entfernt NICHTS renderer-seitig — auch Mounts bleiben (Matrix-treu)', async () => {
    vi.useFakeTimers()
    try {
      const mountDispose = vi.fn()
      const mod = { id: 'demo', activate: (h: PluginRendererHost) => h.registerFileEditor({ editorId: 'draw', mount: () => mountDispose }), deactivate: () => new Promise(() => {}) }
      const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], styles: '.x{}', module: mod }]
      const { env, revoked, stylesRemoved } = makeEnv(plugins)
      const reg = new ExternalRendererRegistry(env)
      await reg.sync()
      reg.mountEditor('demo', 'draw', fakeEl(), 'x.draw')
      const p = reg.teardownInstance('i1')
      await vi.advanceTimersByTimeAsync(5000)
      expect(await p).toBe('timeout')
      expect(mountDispose).not.toHaveBeenCalled() // F25: Mount NICHT disposed bei timeout
      expect(reg.isLoaded('demo')).toBe(true)
      expect(stylesRemoved).not.toContain('demo')
      expect(revoked.length).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('F26: werfender Mount-Disposer → Outcome error (nicht success), dennoch entladen', async () => {
    const mod = { id: 'demo', activate: (h: PluginRendererHost) => h.registerFileEditor({ editorId: 'draw', mount: () => () => { throw new Error('dispose boom') } }), deactivate: vi.fn() }
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: mod }]
    const { env } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    reg.mountEditor('demo', 'draw', fakeEl(), 'x.draw')
    expect(await reg.teardownInstance('i1')).toBe('error')
    expect(reg.isLoaded('demo')).toBe(false) // Host-Chrome dennoch entfernt
  })

  it('F27: Erfolgs-Ack rejectet + lokales deactivate wirft → Tombstone error; gerichteter Teardown liefert error', async () => {
    const mod = { id: 'demo', activate: (h: PluginRendererHost) => h.registerFileEditor({ editorId: 'draw', mount: () => () => {} }), deactivate: () => { throw new Error('deactivate boom') } }
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: mod }]
    const { env } = makeEnv(plugins)
    env.ackActivated = async (ack) => { if (ack.ok) throw new Error('ipc down') }
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()
    expect(reg.isLoaded('demo')).toBe(false) // lokal zurückgenommen
    expect(await reg.teardownInstance('i1')).toBe('error') // echter Ausgang via Tombstone (nicht success)
  })

  it('timeout-Eintrag bleibt; erneuter gerichteter Teardown liefert weiter timeout (Tombstone)', async () => {
    vi.useFakeTimers()
    try {
      const mod = { id: 'demo', activate: (h: PluginRendererHost) => h.registerFileEditor({ editorId: 'draw', mount: () => () => {} }), deactivate: () => new Promise(() => {}) }
      const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: mod }]
      const { env } = makeEnv(plugins)
      const reg = new ExternalRendererRegistry(env)
      await reg.sync()
      const p1 = reg.teardownInstance('i1')
      await vi.advanceTimersByTimeAsync(5000)
      expect(await p1).toBe('timeout')
      expect(await reg.teardownInstance('i1')).toBe('timeout') // erneut → weiterhin timeout
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ExternalRendererRegistry — Read-only-Embeds (R2)', () => {
  /** Modul, das Editor UND Embed für 'draw' registriert. */
  const withEmbedModule = (pluginId: string): PluginRendererModule => ({
    id: pluginId,
    activate: (host: PluginRendererHost) => {
      host.registerFileEditor({ editorId: 'draw', mount: (el) => { el.dataset.mounted = 'editor'; return () => { el.dataset.mounted = '' } } })
      host.registerFileEmbed?.({ editorId: 'draw', mount: (el) => { el.dataset.mounted = 'embed'; return () => { el.dataset.mounted = '' } } })
    },
    deactivate: vi.fn(),
  })

  it('registriertes Embed: hasEmbed true, mountEmbed mountet + dispose räumt', async () => {
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: withEmbedModule('demo') }]
    const { env } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()

    expect(reg.hasEmbed('demo', 'draw')).toBe(true)
    const el = fakeEl()
    const dispose = reg.mountEmbed('demo', 'draw', el, 'sketch.draw')
    expect(dispose).toBeTypeOf('function')
    expect(el.dataset.mounted).toBe('embed')
    dispose!()
    expect(el.dataset.mounted).toBe('')
    dispose!() // idempotent
  })

  it('ohne Embed-Registrierung: hasEmbed false, mountEmbed null (Editor unberührt)', async () => {
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'] }]
    const { env, acks } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()

    expect(acks).toEqual([{ ok: true, rendererInstanceId: 'i1' }]) // Embed ist OPT-IN, kein Pflicht-Beitrag
    expect(reg.hasEmbed('demo', 'draw')).toBe(false)
    expect(reg.mountEmbed('demo', 'draw', fakeEl(), 'sketch.draw')).toBeNull()
    expect(reg.mountEditor('demo', 'draw', fakeEl(), 'sketch.draw')).toBeTypeOf('function')
  })

  it('registerFileEmbed mit nicht deklarierter editorId → ack register', async () => {
    const mod: PluginRendererModule = {
      id: 'demo',
      activate: (host) => {
        host.registerFileEditor({ editorId: 'draw', mount: () => () => {} })
        host.registerFileEmbed?.({ editorId: 'unbekannt', mount: () => () => {} })
      },
    }
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: mod }]
    const { env, acks } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()

    expect(reg.isLoaded('demo')).toBe(false)
    expect(acks[0]).toMatchObject({ ok: false, phase: 'register' })
  })

  it('doppelte Embed-Registrierung → ack register', async () => {
    const mod: PluginRendererModule = {
      id: 'demo',
      activate: (host) => {
        host.registerFileEditor({ editorId: 'draw', mount: () => () => {} })
        host.registerFileEmbed?.({ editorId: 'draw', mount: () => () => {} })
        host.registerFileEmbed?.({ editorId: 'draw', mount: () => () => {} })
      },
    }
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: mod }]
    const { env, acks } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()

    expect(reg.isLoaded('demo')).toBe(false)
    expect(acks[0]).toMatchObject({ ok: false, phase: 'register' })
  })

  it('registerFileEmbed nach activate (Staging zu) wirft', async () => {
    let captured: PluginRendererHost | null = null
    const mod: PluginRendererModule = {
      id: 'demo',
      activate: (host) => {
        captured = host
        host.registerFileEditor({ editorId: 'draw', mount: () => () => {} })
      },
    }
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: mod }]
    const { env } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()

    expect(reg.isLoaded('demo')).toBe(true)
    expect(() => captured!.registerFileEmbed!({ editorId: 'draw', mount: () => () => {} })).toThrow(/nur während activate/)
  })

  it('Teardown disposed auch aktive Embed-Mounts', async () => {
    const plugins: FakePlugin[] = [{ pluginId: 'demo', instanceId: 'i1', editorIds: ['draw'], module: withEmbedModule('demo') }]
    const { env } = makeEnv(plugins)
    const reg = new ExternalRendererRegistry(env)
    await reg.sync()

    const el = fakeEl()
    reg.mountEmbed('demo', 'draw', el, 'sketch.draw')
    expect(el.dataset.mounted).toBe('embed')
    expect(await reg.teardownInstance('i1')).toBe('success')
    expect(el.dataset.mounted).toBe('')
    expect(reg.hasEmbed('demo', 'draw')).toBe(false)
  })
})
