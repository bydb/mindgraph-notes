import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateKeyPairSync, type KeyObject } from 'node:crypto'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packPluginArtifact } from '../artifact/pack'
import { canonicalJsonBytes } from '../artifact/format'
import { type Keyring } from '../artifact/verify'
import { keyringFromSpkiMap } from './keyring'
import { readActiveIndex } from './activeIndex'
import { pluginPaths, versionDir } from './paths'
import { installPluginArtifact, setActiveVersion } from './install'
import { discoverInstalledPlugins } from './discover'
import {
  discoverAndRegisterInstalled,
  installAndActivate,
  uninstallPlugin,
  computeInstalledErrors,
  PluginRestartRequiredError,
  type ManageDeps,
  type RegistryHandle,
} from './manage'
import { PluginRegistry, type MainPluginSource } from '../registry'
import type { PluginRuntimeState } from '../../../shared/plugins/state'

const KEY_ID = 'dev-manage-test'
let priv: KeyObject
let keyring: Keyring
let root: string
const tmpDirs: string[] = []

beforeEach(() => {
  const kp = generateKeyPairSync('ed25519')
  priv = kp.privateKey
  keyring = keyringFromSpkiMap({ [KEY_ID]: kp.publicKey.export({ type: 'spki', format: 'pem' }) as string })
  root = mkdtempSync(join(tmpdir(), 'mgx-manage-'))
  tmpDirs.push(root)
})
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const manifestBytes = (over: Record<string, unknown> = {}): Buffer =>
  canonicalJsonBytes({
    manifestVersion: 2,
    id: 'ext-plugin',
    version: '0.1.0',
    label: 'Ext',
    description: 'x',
    category: 'ai',
    apiVersion: '^0.2.0',
    minAppVersion: '0.8.14',
    author: { name: 'T' },
    entrypoints: { main: 'main.js' },
    capabilities: [],
    ...over,
  })

const mainJs = (id = 'ext-plugin', marker = '') =>
  Buffer.from(
    `module.exports = { id: ${JSON.stringify(id)}, marker: ${JSON.stringify(marker)}, register: function () {} }\n`,
    'utf8'
  )

async function archive(opts: { manifest?: Buffer; main?: Buffer } = {}): Promise<Buffer> {
  return packPluginArtifact({
    files: [
      { path: 'manifest.json', content: opts.manifest ?? manifestBytes() },
      { path: 'main.js', content: opts.main ?? mainJs() },
    ],
    signKey: priv,
    keyId: KEY_ID,
  })
}

/** Archiv für eine bestimmte Version (+ optionalem main-Marker / workflowActions). */
async function archiveVer(version: string, opts: { marker?: string; workflowActions?: unknown[] } = {}): Promise<Buffer> {
  const over: Record<string, unknown> = { version }
  if (opts.workflowActions) over.workflowActions = opts.workflowActions
  return archive({ manifest: manifestBytes(over), main: mainJs('ext-plugin', opts.marker ?? '') })
}

/** main.js mit echtem Lebenszyklus (register + optional werfendem start/stop) — für Tests gegen die echte Registry. */
const mainJsLifecycle = (opts: { startThrows?: boolean; stopThrows?: boolean } = {}): Buffer => {
  const parts = [`id: 'ext-plugin'`, `register: function () {}`]
  if (opts.startThrows) parts.push(`start: async function () { throw new Error('start boom') }`)
  if (opts.stopThrows) parts.push(`stop: async function () { throw new Error('stop boom') }`)
  return Buffer.from(`module.exports = { ${parts.join(', ')} }\n`, 'utf8')
}
async function archiveLifecycle(version: string, opts: { startThrows?: boolean; stopThrows?: boolean } = {}): Promise<Buffer> {
  return archive({ manifest: manifestBytes({ version }), main: mainJsLifecycle(opts) })
}

const env = (over: Record<string, unknown> = {}) => ({
  pluginsRoot: root,
  keyring,
  appVersion: '0.8.14',
  blockedIds: new Set<string>(),
  ...over,
})

/**
 * Version-bewusster Registry-Fake: protokolliert Aufrufe, entscheidet Aktivierung pro Version,
 * und kann unregister() für bestimmte IDs werfen lassen (simulierter stop-Fehler). `registered`
 * spiegelt den lebenden Zustand (register/unregister), `get` leitet daraus ab.
 */
function fakeRegistry(opts: {
  activate?: (id: string, version: string | undefined) => PluginRuntimeState['activation']
  unregisterThrows?: Set<string>
} = {}) {
  const registered = new Map<string, MainPluginSource>()
  const calls: string[] = []
  const handle: RegistryHandle = {
    register(sources) {
      for (const s of sources) {
        registered.set(s.manifest.id, s)
        calls.push(`register:${s.manifest.id}@${s.manifest.version}`)
      }
    },
    async activate(id) {
      const version = registered.get(id)?.manifest.version
      const activation = opts.activate?.(id, version) ?? 'active'
      calls.push(`activate:${id}@${version}:${activation}`)
      return {
        id,
        version,
        installation: 'bundled',
        activation,
        readiness: activation === 'active' ? 'ready' : 'unavailable',
        error: activation === 'active' ? undefined : { message: `activation=${activation}`, at: '2026-01-01T00:00:00Z' },
      }
    },
    async unregister(id) {
      if (opts.unregisterThrows?.has(id)) {
        calls.push(`unregister-throw:${id}`)
        throw new Error(`stop von '${id}' fehlgeschlagen`)
      }
      registered.delete(id)
      calls.push(`unregister:${id}`)
    },
    get(id) {
      const s = registered.get(id)
      return s ? ({ id, version: s.manifest.version } as PluginRuntimeState) : undefined
    },
  }
  return { handle, registered, calls }
}

function deps(over: Partial<ManageDeps> = {}): ManageDeps & { wfRegistered: Array<{ id: string; owner: string }>; wfUnregistered: string[] } {
  const wfRegistered: Array<{ id: string; owner: string }> = []
  const wfUnregistered: string[] = []
  return {
    env: env(),
    registry: over.registry ?? fakeRegistry().handle,
    registerWorkflowActions: (defs, ownerId) => { for (const d of defs) wfRegistered.push({ id: (d as { id: string }).id, owner: ownerId }) },
    unregisterWorkflowActions: (ownerId) => { wfUnregistered.push(ownerId) },
    wfRegistered,
    wfUnregistered,
    ...over,
  }
}

describe('discoverAndRegisterInstalled', () => {
  it('registriert aktive Disk-Plugins als Quellen, ohne Fehler', async () => {
    const res = await installPluginArtifact(await archive(), env())
    setActiveVersion(root, res.id, res.version) // Index-Commit (wie nach erfolgreicher Aktivierung)
    const reg = fakeRegistry()
    const errors = discoverAndRegisterInstalled(deps({ registry: reg.handle }))
    expect(errors).toEqual([])
    expect(reg.registered.has('ext-plugin')).toBe(true)
  })

  it('meldet Re-Verify-Fehler statt zu registrieren (manipuliertes main.js)', async () => {
    const res = await installPluginArtifact(await archive(), env())
    setActiveVersion(root, res.id, res.version)
    rmSync(join(res.versionDir, 'main.js'))
    const reg = fakeRegistry()
    const errors = discoverAndRegisterInstalled(deps({ registry: reg.handle }))
    expect(errors).toHaveLength(1)
    expect(reg.registered.size).toBe(0)
  })
})

describe('installAndActivate', () => {
  it('installiert, registriert und aktiviert live', async () => {
    const reg = fakeRegistry()
    const d = deps({ registry: reg.handle })
    const out = await installAndActivate(d, await archive())
    expect(out).toMatchObject({ id: 'ext-plugin', version: '0.1.0', idempotent: false })
    expect(out.state.activation).toBe('active')
    expect(reg.calls).toEqual(['register:ext-plugin@0.1.0', 'activate:ext-plugin@0.1.0:active'])
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
  })

  it('rollt active.json zurück und entfernt die Quelle, wenn die Aktivierung scheitert (Frischinstall)', async () => {
    const reg = fakeRegistry({ activate: () => 'error' })
    const d = deps({ registry: reg.handle })
    await expect(installAndActivate(d, await archive())).rejects.toThrow(/activation=error|fehlgeschlagen/)
    // kein Vorgänger → active.json leer, Quelle entfernt, Workflow-Actions wieder entfernt.
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
    expect(reg.registered.has('ext-plugin')).toBe(false)
    expect(reg.calls).toContain('unregister:ext-plugin')
    expect(d.wfUnregistered).toContain('ext-plugin')
  })

  it('verschickt die workflowActions des Plugins MIT Owner an den Registrar', async () => {
    const wf = [{ id: 'ext.do', label: 'Do', moduleId: 'ext', inputs: [], outputs: [] }]
    const d = deps({ registry: fakeRegistry().handle })
    await installAndActivate(d, await archiveVer('0.1.0', { workflowActions: wf }))
    expect(d.wfRegistered).toEqual([{ id: 'ext.do', owner: 'ext-plugin' }])
  })

  // ── Fix 1: fehlgeschlagenes Upgrade belebt die Vorgängerversion wieder ──
  it('reaktiviert die Vorgängerversion live, wenn das Upgrade fehlschlägt', async () => {
    // Aktivierung: 0.2.0 scheitert, alles andere (0.1.0) klappt.
    const reg = fakeRegistry({ activate: (_id, v) => (v === '0.2.0' ? 'error' : 'active') })
    const d = deps({ registry: reg.handle })
    await installAndActivate(d, await archiveVer('0.1.0')) // Vorgänger läuft
    reg.calls.length = 0
    d.wfUnregistered.length = 0

    await expect(installAndActivate(d, await archiveVer('0.2.0'))).rejects.toThrow(/activation=error|fehlgeschlagen/)

    // active.json zeigt wieder auf 0.1.0 …
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    // … und 0.1.0 ist im laufenden Prozess wieder registriert + aktiviert (nicht nur auf Platte).
    expect(reg.registered.get('ext-plugin')?.manifest.version).toBe('0.1.0')
    expect(reg.calls).toContain('register:ext-plugin@0.1.0') // Wiederherstellung
    expect(reg.calls).toContain('activate:ext-plugin@0.1.0:active')
  })

  // ── Fix 2: Upgrade bricht ab, wenn die alte Version sich nicht stoppen lässt ──
  it('bricht das Upgrade ab und lässt die Alt-Version laufen, wenn unregister wirft (stop-Fehler)', async () => {
    // 0.1.0 normal installieren …
    const setup = deps({ registry: fakeRegistry().handle })
    await installAndActivate(setup, await archiveVer('0.1.0'))

    // … dann eine Registry, deren unregister IMMER wirft (alte Version stoppt nicht).
    const reg = fakeRegistry({ unregisterThrows: new Set(['ext-plugin']) })
    reg.registered.set('ext-plugin', { manifest: { id: 'ext-plugin', version: '0.1.0' } as never }) // 0.1.0 läuft
    const d = deps({ registry: reg.handle })

    await expect(installAndActivate(d, await archiveVer('0.2.0'))).rejects.toThrow(/abgebrochen|nicht stoppen/)
    // Disk-Zeiger zurück auf den weiterhin laufenden Vorgänger; neue Version NIE aktiviert.
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    expect(reg.registered.get('ext-plugin')?.manifest.version).toBe('0.1.0') // Alt-Version unberührt
    expect(reg.calls.some(c => c.startsWith('activate:ext-plugin@0.2.0'))).toBe(false)
    expect(d.wfUnregistered).not.toContain('ext-plugin') // Actions der Alt-Version bleiben
  })
})

describe('uninstallPlugin', () => {
  it('entfernt Registry, Workflow-Actions, active.json und Platte', async () => {
    const reg = fakeRegistry()
    const d = deps({ registry: reg.handle })
    await installAndActivate(d, await archive())
    const idDir = join(pluginPaths(root).storeDir, 'ext-plugin')
    expect(existsSync(idDir)).toBe(true)

    await uninstallPlugin(d, 'ext-plugin')
    expect(reg.calls).toContain('unregister:ext-plugin')
    expect(d.wfUnregistered).toContain('ext-plugin')
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
    expect(existsSync(idDir)).toBe(false)
  })

  it('lehnt eine unsichere ID ab (kein Traversal)', async () => {
    const d = deps()
    await expect(uninstallPlugin(d, '../evil')).rejects.toMatchObject({ code: 'path-invalid' })
  })
})

// ── Fix 3: require-Cache wird bei Uninstall/Reinstall geleert (sonst stale Modulinhalt) ──
describe('require-Cache-Konsistenz bei Reinstall', () => {
  it('lädt nach Uninstall + Reinstall (gleicher Pfad, anderer Inhalt) den NEUEN Entry', async () => {
    const d = deps({ registry: fakeRegistry().handle })

    await installAndActivate(d, await archiveVer('0.1.0', { marker: 'A' }))
    const srcA = discoverInstalledPlugins(env()).sources.find(s => s.manifest.id === 'ext-plugin')!
    const entryA = (await srcA.loadEntry!()) as unknown as { marker: string }
    expect(entryA.marker).toBe('A')

    await uninstallPlugin(d, 'ext-plugin') // löscht Verzeichnis + leert require-Cache

    // Gleiche id@version, ANDERER main-Inhalt — ohne Cache-Purge käme weiterhin Marker 'A'.
    await installAndActivate(d, await archiveVer('0.1.0', { marker: 'B' }))
    const srcB = discoverInstalledPlugins(env()).sources.find(s => s.manifest.id === 'ext-plugin')!
    const entryB = (await srcB.loadEntry!()) as unknown as { marker: string }
    expect(entryB.marker).toBe('B')
  })

  it('uninstall leert den require-Cache des Plugin-Pfads (isoliert geprüft)', async () => {
    const d = deps({ registry: fakeRegistry().handle })
    await installAndActivate(d, await archiveVer('0.1.0', { marker: 'A' }))
    const src = discoverInstalledPlugins(env()).sources.find(s => s.manifest.id === 'ext-plugin')!
    await src.loadEntry!() // cached jetzt store/ext-plugin/0.1.0/main.js

    const verDir = versionDir(pluginPaths(root), 'ext-plugin', '0.1.0')
    // Vor dem Uninstall liegt der Entry real im require-Cache (realpath-Key).
    const { createRequire } = await import('node:module')
    const { realpathSync } = await import('node:fs')
    const cache = createRequire(join(verDir, '_probe.cjs')).cache!
    const realMain = realpathSync(join(verDir, 'main.js'))
    expect(Object.keys(cache)).toContain(realMain)

    await uninstallPlugin(d, 'ext-plugin')
    // Der uninstall-Purge (VOR rmSync) hat den Cache-Eintrag entfernt — kein toter Verweis.
    expect(Object.keys(cache)).not.toContain(realMain)
  })
})

// ── R2-B: verwaister neuer Versionsordner wird bei abgebrochenem Upgrade entfernt ──
describe('Aufräumen bei fehlgeschlagenem Upgrade', () => {
  it('entfernt den frisch materialisierten neuen Versionsordner, behält den Vorgänger', async () => {
    const reg = fakeRegistry({ activate: (_id, v) => (v === '0.2.0' ? 'error' : 'active') })
    const d = deps({ registry: reg.handle })
    await installAndActivate(d, await archiveVer('0.1.0'))
    await expect(installAndActivate(d, await archiveVer('0.2.0'))).rejects.toThrow()

    expect(existsSync(versionDir(pluginPaths(root), 'ext-plugin', '0.2.0'))).toBe(false) // Waise weg
    expect(existsSync(versionDir(pluginPaths(root), 'ext-plugin', '0.1.0'))).toBe(true) // Vorgänger bleibt
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
  })
})

// ── R3-P1: gegen die ECHTE PluginRegistry (Index-Commit-zuletzt + Doppelfehler-Semantik) ──
describe('installAndActivate gegen die echte PluginRegistry', () => {
  it('committet active.json ERST nach erfolgreicher Aktivierung', async () => {
    const registry = new PluginRegistry()
    const d = deps({ registry })
    await installAndActivate(d, await archiveLifecycle('0.1.0'))
    expect(registry.get('ext-plugin')).toMatchObject({ activation: 'active', version: '0.1.0' })
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
  })

  it('Upgrade: neue Version start scheitert, stop() OK → Vorgänger kommt LIVE zurück', async () => {
    const registry = new PluginRegistry()
    const d = deps({ registry })
    await installAndActivate(d, await archiveLifecycle('0.1.0'))

    // 0.2.0: start() wirft, KEIN stop() → die neue Version lässt sich sauber entfernen.
    await expect(installAndActivate(d, await archiveLifecycle('0.2.0', { startThrows: true })))
      .rejects.toThrow(/start boom|fehlgeschlagen/)

    // Vorgänger 0.1.0 ist wieder LIVE; Index zeigt auf 0.1.0; 0.2.0-Ordner aufgeräumt.
    expect(registry.get('ext-plugin')).toMatchObject({ activation: 'active', version: '0.1.0' })
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    expect(existsSync(versionDir(pluginPaths(root), 'ext-plugin', '0.2.0'))).toBe(false)
  })

  it('Upgrade-Doppelfehler (start+stop wirft) → KEINE Reaktivierung, Neustart erforderlich', async () => {
    const registry = new PluginRegistry()
    const d = deps({ registry })
    await installAndActivate(d, await archiveLifecycle('0.1.0'))

    // 0.2.0: start() UND stop() werfen → die neue Version leakt. Der Vorgänger DARF nicht
    // reaktiviert werden (sonst zwei Versionen gleichzeitig) → PluginRestartRequiredError.
    await expect(installAndActivate(d, await archiveLifecycle('0.2.0', { startThrows: true, stopThrows: true })))
      .rejects.toBeInstanceOf(PluginRestartRequiredError)

    // Persistenter Index zeigt weiter auf 0.1.0 (wird beim nächsten Start sauber geladen).
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    // Der Vorgänger wurde NICHT wieder in-Process aktiviert (kaputter 0.2.0-Entry bleibt für Stop-Retry).
    expect(registry.get('ext-plugin')?.version).toBe('0.2.0')
    expect(registry.get('ext-plugin')?.activation).not.toBe('active')
    // Das Kandidatenverzeichnis BLEIBT (der laufende kaputte Entry greift evtl. darauf zu) — es liegt
    // als inaktive Version weiter (Mehrversions-Design; sicheres GC erst später via Tombstones).
    expect(existsSync(versionDir(pluginPaths(root), 'ext-plugin', '0.2.0'))).toBe(true)
  })

  it('Frischinstall start scheitert, stop() OK → nichts aktiv, Index leer, Ordner weg', async () => {
    const registry = new PluginRegistry()
    const d = deps({ registry })
    await expect(installAndActivate(d, await archiveLifecycle('0.1.0', { startThrows: true })))
      .rejects.toThrow(/start boom|fehlgeschlagen/)
    expect(registry.get('ext-plugin')).toBeUndefined() // sauber entfernt
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
    expect(existsSync(versionDir(pluginPaths(root), 'ext-plugin', '0.1.0'))).toBe(false)
  })
})

// ── R3-P2: kollidierende Workflow-Action-ID → Aktivierung wird TERMINAL abgelehnt ──
describe('installAndActivate — Workflow-Action-Kollision', () => {
  it('lehnt ein Plugin terminal ab, das eine Kern-Action-ID deklariert', async () => {
    const reg = fakeRegistry()
    const d = deps({ registry: reg.handle })
    // 'tasks.dueSoon' ist eine Kern-Action (WORKFLOW_ACTIONS) → Kollision.
    const wf = [{ id: 'tasks.dueSoon', label: 'Hijack', moduleId: 'tasks', inputs: [], outputs: [] }]
    await expect(installAndActivate(d, await archiveVer('0.1.0', { workflowActions: wf })))
      .rejects.toMatchObject({ code: 'workflow-collision' })
    // Terminal: nicht registriert, nicht aktiviert, Index unverändert, Ordner aufgeräumt.
    expect(reg.registered.has('ext-plugin')).toBe(false)
    expect(reg.calls).toEqual([])
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
    expect(existsSync(versionDir(pluginPaths(root), 'ext-plugin', '0.1.0'))).toBe(false)
  })

  it('weist eine Kollision auch beim STARTUP zurück (Discover-Fehler statt partieller Quelle)', async () => {
    // Plugin mit Kern-kollidierender Workflow-Action installieren + Index committen.
    const wf = [{ id: 'tasks.dueSoon', label: 'Hijack', moduleId: 'tasks', inputs: [], outputs: [] }]
    const res = await installPluginArtifact(await archiveVer('0.1.0', { workflowActions: wf }), env())
    setActiveVersion(root, res.id, res.version)
    // (Simuliert ein App-Update, das die Kollision erst nachträglich entstehen lässt.)
    const reg = fakeRegistry()
    const errors = discoverAndRegisterInstalled(deps({ registry: reg.handle }))
    expect(reg.registered.has('ext-plugin')).toBe(false) // NICHT registriert
    expect(errors.some(e => e.code === 'workflow-collision' && e.id === 'ext-plugin')).toBe(true)

    // Die read-only Fehlerliste (IPC plugin:installErrors) zeigt die Kollision ebenfalls.
    const live = computeInstalledErrors(env())
    expect(live.some(e => e.code === 'workflow-collision' && e.id === 'ext-plugin')).toBe(true)
  })
})

// ── R5-P2: Uninstall-Commit-Fehler stellt den Live-Zustand wieder her ──
describe('uninstallPlugin — Commit-Fehler', () => {
  it('stellt die noch persistierte aktive Version wieder her, wenn der Index-Austrag wirft', async () => {
    const registry = new PluginRegistry()
    const commitActiveVersion = (rootPath: string, id: string, version: string | null) => {
      if (version === null) throw new Error('disk full') // nur der Uninstall-Austrag scheitert
      setActiveVersion(rootPath, id, version)
    }
    const d = deps({ registry, commitActiveVersion })
    await installAndActivate(d, await archiveLifecycle('0.1.0'))
    expect(registry.get('ext-plugin')).toMatchObject({ activation: 'active', version: '0.1.0' })

    await expect(uninstallPlugin(d, 'ext-plugin')).rejects.toThrow(/Uninstall.*fehlgeschlagen|disk full/)

    // Plugin ist wieder live, Index + Dateien unverändert (es behauptet weiterhin „aktiv").
    expect(registry.get('ext-plugin')).toMatchObject({ activation: 'active', version: '0.1.0' })
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    expect(existsSync(versionDir(pluginPaths(root), 'ext-plugin', '0.1.0'))).toBe(true)
  })
})

// ── R4-P1b: Fehler beim finalen Index-Commit → dieselbe Recovery (nicht Live/Disk auseinanderlaufen) ──
describe('installAndActivate — Commit-Fehler', () => {
  it('Commit wirft, neue Version stoppt sauber → Vorgänger live zurück, Index unverändert', async () => {
    const registry = new PluginRegistry()
    // 0.1.0 normal (echter Commit), 0.2.0 mit werfendem Commit.
    await installAndActivate(deps({ registry }), await archiveLifecycle('0.1.0'))

    let failNext = false
    const commitActiveVersion = (rootPath: string, id: string, version: string | null) => {
      if (failNext) throw new Error('disk full')
      setActiveVersion(rootPath, id, version)
    }
    failNext = true
    const d = deps({ registry, commitActiveVersion })
    // 0.2.0 startet sauber (kein start/stop-Throw) → activate OK, danach Commit-Fehler.
    await expect(installAndActivate(d, await archiveLifecycle('0.2.0')))
      .rejects.toThrow(/Index-Commit.*fehlgeschlagen|disk full/)

    // Vorgänger 0.1.0 wieder live, Index steht (unverändert) auf 0.1.0, 0.2.0-Ordner aufgeräumt.
    expect(registry.get('ext-plugin')).toMatchObject({ activation: 'active', version: '0.1.0' })
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    expect(existsSync(versionDir(pluginPaths(root), 'ext-plugin', '0.2.0'))).toBe(false)
  })

  it('Commit wirft UND stop() der neuen Version wirft → PluginRestartRequiredError', async () => {
    const registry = new PluginRegistry()
    await installAndActivate(deps({ registry }), await archiveLifecycle('0.1.0'))
    const commitActiveVersion = () => { throw new Error('disk full') }
    const d = deps({ registry, commitActiveVersion })
    // 0.2.0: start OK (aktiviert), stop wirft → bei Commit-Fehler kein sauberer Rollback möglich.
    await expect(installAndActivate(d, await archiveLifecycle('0.2.0', { stopThrows: true })))
      .rejects.toBeInstanceOf(PluginRestartRequiredError)
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
  })
})

// ── R4-Test: Index zeigt WÄHREND der Aktivierung noch auf den Vorgänger (Commit erst nach Erfolg) ──
describe('installAndActivate — Index-Commit-Timing', () => {
  it('committet erst nach erfolgreicher (pausierter) Aktivierung', async () => {
    // 0.1.0 vorab aktiv + committed.
    const r1 = await installPluginArtifact(await archiveVer('0.1.0'), env())
    setActiveVersion(root, r1.id, r1.version)
    // 0.2.0 materialisieren (ohne Commit).
    await installPluginArtifact(await archiveVer('0.2.0'), env())

    let releaseActivate!: () => void
    const gate = new Promise<void>((res) => { releaseActivate = res })
    let signalStarted!: () => void
    const started = new Promise<void>((res) => { signalStarted = res })

    const handle: RegistryHandle = {
      register() {},
      async activate(id) {
        signalStarted()
        await gate // Aktivierung pausiert
        return { id, version: '0.2.0', installation: 'bundled', activation: 'active', readiness: 'ready' }
      },
      async unregister() {},
      get: (id) => (id === 'ext-plugin' ? ({ id, version: '0.1.0' } as PluginRuntimeState) : undefined),
    }
    const d = deps({ registry: handle })

    const p = installAndActivate(d, await archiveVer('0.2.0'))
    await started
    // WÄHREND activate pending: Index zeigt noch auf den Vorgänger 0.1.0.
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    releaseActivate()
    await p
    // NACH Erfolg: Index committet auf 0.2.0.
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.2.0' })
  })
})

// R1-impl-F01: renderer-only muss durch den ECHTEN Manage-/Registry-Pfad aktivieren (nicht nur über
// den install.test-Bypass), sonst würfe registry.activate „kein Main-Entry" → Rollback, kein Commit.
describe('renderer-only Aktivierung (R1-impl-F01)', () => {
  const rendererOnlyArchive = () =>
    packPluginArtifact({
      files: [
        {
          path: 'manifest.json',
          content: manifestBytes({
            entrypoints: { renderer: 'renderer.js' },
            ui: { fileEditors: [{ editorId: 'draw', extensions: ['.excalidraw'] }] },
          }),
        },
        { path: 'renderer.js', content: Buffer.from('export default {}\n', 'utf8') },
      ],
      signKey: priv,
      keyId: KEY_ID,
    })

  it('aktiviert über den echten installAndActivate-Pfad + committet den Index (kein Rollback)', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    await installAndActivate(deps({ registry: real }), await rendererOnlyArchive())
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    expect(real.get('ext-plugin')?.activation).toBe('active')
  })

  it('aktiviert renderer-only beim Startup über die echte Registry', async () => {
    const res = await installPluginArtifact(await rendererOnlyArchive(), env())
    setActiveVersion(root, res.id, res.version)
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    expect(discoverAndRegisterInstalled(deps({ registry: real }))).toEqual([])
    await real.activateAll()
    expect(real.get('ext-plugin')?.activation).toBe('active')
  })
})

// R1-impl-F06: Eager-Activate-Handshake — der Renderer muss das Bundle importieren + activate(host) + Staging
// bestätigen, BEVOR active.json committet. Der Handshake ist via deps.activateRenderer injiziert (Impl in
// index.ts mit BrowserWindow/IPC). Ohne Injektion (main-only/Altests) läuft alles unverändert (siehe oben).
describe('Renderer-Aktivierungs-Handshake (R1-impl-F06)', () => {
  const rendererArchive = (version = '0.1.0') =>
    packPluginArtifact({
      files: [
        {
          path: 'manifest.json',
          content: manifestBytes({
            version,
            entrypoints: { renderer: 'renderer.js' },
            ui: { fileEditors: [{ editorId: 'draw', extensions: ['.excalidraw'] }] },
          }),
        },
        { path: 'renderer.js', content: Buffer.from('export default {}\n', 'utf8') },
      ],
      signKey: priv,
      keyId: KEY_ID,
    })

  it('Ack ok → committet den Index', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    const activateRenderer = vi.fn(async () => ({ ok: true as const }))
    await installAndActivate(deps({ registry: real, activateRenderer }), await rendererArchive())
    expect(activateRenderer).toHaveBeenCalledTimes(1)
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
  })

  it('Ack-Fehler → KEIN Commit, Rollback, Kandidat über tearDownRenderer gestoppt (Frischinstall)', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    const tearDownRenderer = vi.fn(async () => 'success' as const)
    const activateRenderer = vi.fn(async () => ({ ok: false as const, error: 'kaputtes Bundle (contract)' }))
    await expect(
      installAndActivate(deps({ registry: real, activateRenderer, tearDownRenderer }), await rendererArchive()),
    ).rejects.toThrow(/Renderer-Aktivierung.*kaputtes Bundle/)
    expect(tearDownRenderer).toHaveBeenCalledWith('ext-plugin') // F16: Kandidat sauber entladen
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
    expect(real.get('ext-plugin')).toBeUndefined()
  })

  it('Ack-Fehler + Kandidat-Teardown scheitert → restart-required, KEIN Vorgänger-Restore (F16)', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    const tearDownRenderer = vi.fn(async () => 'timeout' as const)
    const activateRenderer = vi.fn(async () => ({ ok: false as const, error: 'activate boom' }))
    await expect(
      installAndActivate(deps({ registry: real, activateRenderer, tearDownRenderer }), await rendererArchive()),
    ).rejects.toThrow(PluginRestartRequiredError)
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
  })

  it('activateRenderer wirft → wie Ack-Fehler behandelt (Rollback)', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    const activateRenderer = vi.fn(async () => { throw new Error('renderer-prozess weg') })
    await expect(
      installAndActivate(deps({ registry: real, activateRenderer }), await rendererArchive()),
    ).rejects.toThrow(/renderer-prozess weg/)
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
  })

  it('Upgrade: Kandidat-Ack scheitert → Vorgänger bleibt committet (0.1.0)', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    // 0.1.0 sauber installieren (Ack ok)
    await installAndActivate(deps({ registry: real, activateRenderer: vi.fn(async () => ({ ok: true as const })) }), await rendererArchive('0.1.0'))
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    // 0.2.0-Upgrade: Renderer-Ack scheitert → Rollback auf 0.1.0 (Teardowns sauber)
    const tearDownRenderer = vi.fn(async () => 'success' as const)
    await expect(
      installAndActivate(
        deps({ registry: real, activateRenderer: vi.fn(async () => ({ ok: false as const, error: 'activate boom' })), tearDownRenderer }),
        await rendererArchive('0.2.0'),
      ),
    ).rejects.toThrow(/Renderer-Aktivierung/)
    expect(tearDownRenderer).toHaveBeenCalledWith('ext-plugin') // Vorgänger (deactivate-previous) + Kandidat (rollback)
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    expect(real.get('ext-plugin')?.activation).toBe('active') // Vorgänger wieder live
  })

  it('F21: Commit-Fehler NACH erfolgreichem Ack → Kandidat über tearDownRenderer gestoppt, kein Commit', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    const tearDownRenderer = vi.fn(async () => 'success' as const)
    const commitActiveVersion = (): void => { throw new Error('disk full') }
    await expect(
      installAndActivate(
        deps({ registry: real, activateRenderer: vi.fn(async () => ({ ok: true as const })), tearDownRenderer, commitActiveVersion }),
        await rendererArchive(),
      ),
    ).rejects.toThrow(/Index-Commit/)
    expect(tearDownRenderer).toHaveBeenCalledWith('ext-plugin') // F21: Kandidat-Renderer im Commit-Fehlerpfad gestoppt
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
  })

  it('F21: Commit-Fehler + Kandidat-Teardown timeout → restart-required', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    const tearDownRenderer = vi.fn(async () => 'timeout' as const)
    const commitActiveVersion = (): void => { throw new Error('disk full') }
    await expect(
      installAndActivate(
        deps({ registry: real, activateRenderer: vi.fn(async () => ({ ok: true as const })), tearDownRenderer, commitActiveVersion }),
        await rendererArchive(),
      ),
    ).rejects.toThrow(PluginRestartRequiredError)
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
  })

  it('F23: Upgrade — Vorgänger-Renderer entladen (success), dann Main-unregister wirft → restart-required', async () => {
    const { handle } = fakeRegistry({ unregisterThrows: new Set(['ext-plugin']) })
    await installAndActivate(deps({ registry: handle }), await archiveVer('0.1.0')) // 0.1.0 committet
    const tearDownRenderer = vi.fn(async () => 'success' as const) // renderer-tragender Vorgänger
    await expect(
      installAndActivate(deps({ registry: handle, tearDownRenderer }), await archiveVer('0.2.0')),
    ).rejects.toThrow(PluginRestartRequiredError)
    expect(tearDownRenderer).toHaveBeenCalledWith('ext-plugin')
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' }) // Index unverändert
  })
})

// R1-impl-F07: Endungskollisions-Gate VOR Commit. R1-impl-F08/F14/F15: Renderer end-zu-ende entladen
// (tearDownRenderer = drain + dispose + Ack) vor Disable/Upgrade, nicht-`success` = fail-closed
// (restart-required). Beide via DI injiziert (Impl in index.ts) — hier wird die WIRING/Transaktions-Wirkung
// geprüft (die Resolver-Kollisionslogik deckt fileEditorResolver.test.ts ab, der Teardown-Ausgang rendererRegistry.test.ts).
describe('Datei-Editor-Kollision + Renderer-Teardown (R1-impl-F07/F08/F14/F15)', () => {
  it('F07: Claim-Kollision → terminal abgelehnt, Index/Registry unverändert', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    const validateFileEditorClaims = vi.fn(() => ({ ok: false as const, error: 'Datei-Editor-Endungskollision: .md (core-collision)' }))
    await expect(
      installAndActivate(deps({ registry: real, validateFileEditorClaims }), await archive()),
    ).rejects.toThrow(/Endungskollision/)
    expect(validateFileEditorClaims).toHaveBeenCalledTimes(1)
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
    expect(real.get('ext-plugin')).toBeUndefined() // Registry nie angefasst
  })

  it('F07: kollisionsfreier Claim → Aktivierung läuft normal durch', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    const validateFileEditorClaims = vi.fn(() => ({ ok: true as const }))
    await installAndActivate(deps({ registry: real, validateFileEditorClaims }), await archive())
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
  })

  it('F14: Teardown-Nicht-Erfolg beim Uninstall → restart-required, nichts mutiert', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    await installAndActivate(deps({ registry: real }), await archive())
    const tearDownRenderer = vi.fn(async () => 'timeout' as const)
    await expect(uninstallPlugin(deps({ registry: real, tearDownRenderer }), 'ext-plugin')).rejects.toThrow(
      PluginRestartRequiredError,
    )
    expect(tearDownRenderer).toHaveBeenCalledWith('ext-plugin')
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    expect(real.get('ext-plugin')).toBeDefined() // weiterhin registriert + aktiv
  })

  it('F14: Teardown success beim Uninstall → Uninstall läuft durch', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    await installAndActivate(deps({ registry: real }), await archive())
    const tearDownRenderer = vi.fn(async () => 'success' as const)
    await uninstallPlugin(deps({ registry: real, tearDownRenderer }), 'ext-plugin')
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({})
    expect(real.get('ext-plugin')).toBeUndefined()
  })

  it('F14/F15: Teardown-Nicht-Erfolg beim Upgrade (deactivate-previous) → restart-required, Vorgänger bleibt (0.1.0)', async () => {
    const real = new PluginRegistry(undefined, undefined, '0.8.14')
    await installAndActivate(deps({ registry: real }), await archiveVer('0.1.0'))
    const tearDownRenderer = vi.fn(async () => 'error' as const)
    await expect(
      installAndActivate(deps({ registry: real, tearDownRenderer }), await archiveVer('0.2.0')),
    ).rejects.toThrow(PluginRestartRequiredError)
    expect(tearDownRenderer).toHaveBeenCalledWith('ext-plugin')
    expect(readActiveIndex(pluginPaths(root).activeIndexPath).active).toEqual({ 'ext-plugin': '0.1.0' })
    expect(real.get('ext-plugin')?.activation).toBe('active')
  })
})

