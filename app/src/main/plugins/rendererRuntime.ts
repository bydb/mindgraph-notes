// RendererRuntime — main-seitige Autoritätsgrenze für externe Renderer-Plugins
// (ADR plugin-renderer-host §5.1/§5.3/§5.4/§5.5). Hält die VERIFIZIERTEN Renderer-Bytes, mintet pro
// aktiver Version eine `generation` + `rendererInstanceId`, und ist alleiniger Eigentümer von:
//   - den Bytes (eigene Kopie, nur als utf8-String serviert — R1-impl-F03)
//   - dem Manifest/der Host-Erzeugung (Factory injiziert; das Manifest verlässt das Modul NIE — F09)
//   - dem Lifecycle: Call-Gate + In-Flight-Zähler je Generation + drain() (F08/§5.5)
//
// `rendererInstanceId` ist Routing-/Lifecycle-Mechanik (I-S1), KEINE Trust-Grenze: signierte
// Renderer-Plugins laufen voll vertraut im Haupt-Renderer (§4). Die `plugin:host`-Vault-Bridge ist
// Komfort, keine Sicherheits-Seam (die harte Grenze bleibt writeFileSafe/assertApprovedVault).

import { randomUUID } from 'node:crypto'
import type { FileEditorDecl, PluginManifest } from '@mindgraph/plugin-api'
import type { VerifiedRendererPayload } from './artifact/verify'

/** Capability-Host eines Plugins (createHostFactory(manifest)). Schmal getypt — nur was die Bridge nutzt. */
type CapabilityHost = { vault?: Record<string, (...a: unknown[]) => unknown> }
export type RendererHostFactory = (manifest: PluginManifest) => CapabilityHost

/** Erlaubte Vault-Operationen für `plugin:host` (Capability-Gating macht zusätzlich die Host-Factory). */
const VAULT_OPS = new Set(['read', 'readBytes', 'exists', 'write', 'writeBytes'])

interface RendererRuntimeEntry {
  pluginId: string
  pluginLabel: string
  version: string
  generation: number
  rendererInstanceId: string
  payload: VerifiedRendererPayload
  fileEditors: FileEditorDecl[]
  /** Verifiziertes Manifest — NUR modul-intern (Host-Erzeugung), wird nie herausgegeben (F09). */
  manifest: PluginManifest
  /** Lifecycle-Seam (F08/§5.5): laufende Host-Calls + Gate + Drain-Warter. */
  inFlight: number
  gateClosed: boolean
  drainWaiters: Array<() => void>
}

export interface RendererDescriptor {
  pluginId: string
  pluginLabel: string
  version: string
  rendererInstanceId: string
  fileEditors: FileEditorDecl[]
}

export interface RendererServe {
  rendererInstanceId: string
  pluginId: string
  pluginLabel: string
  version: string
  code: string
  styles?: string
  fileEditors: FileEditorDecl[]
}

export interface RendererInstanceRef {
  pluginId: string
  version: string
  generation: number
}

export interface RendererActivation {
  pluginId: string
  pluginLabel: string
  version: string
  payload: VerifiedRendererPayload
  fileEditors: FileEditorDecl[]
  manifest: PluginManifest
}

export type HostOpResult = { ok: true; data: unknown } | { ok: false; error: string }

const cloneFileEditors = (fe: FileEditorDecl[]): FileEditorDecl[] =>
  fe.map((f) => ({ editorId: f.editorId, extensions: [...f.extensions], ...(f.label ? { label: f.label } : {}) }))

export class RendererRuntime {
  private byPlugin = new Map<string, RendererRuntimeEntry>()
  private byInstance = new Map<string, RendererRuntimeEntry>()
  private generationCounter = 0

  constructor(
    private readonly mintId: () => string = randomUUID,
    private hostFactory?: RendererHostFactory,
  ) {}

  /** Setzt die capability-gated Host-Factory (in app.whenReady() — dieselbe wie der Main-Registry). */
  setHostFactory(factory: RendererHostFactory): void {
    this.hostFactory = factory
  }

  /** Aktiviert/ersetzt den Renderer-Beitrag eines Plugins; liefert den (byte-freien) Descriptor. */
  activate(a: RendererActivation): RendererDescriptor {
    const generation = ++this.generationCounter
    const rendererInstanceId = this.mintUniqueId()
    const entry: RendererRuntimeEntry = {
      pluginId: a.pluginId,
      pluginLabel: a.pluginLabel,
      version: a.version,
      generation,
      rendererInstanceId,
      // Eigene Kopie der verifizierten Bytes (F03) — externe Mutation darf die Serve-Bytes nicht ändern.
      payload: {
        code: Buffer.from(a.payload.code),
        styles: a.payload.styles ? Buffer.from(a.payload.styles) : undefined,
        hash: a.payload.hash,
      },
      fileEditors: cloneFileEditors(a.fileEditors),
      manifest: a.manifest,
      inFlight: 0,
      gateClosed: false,
      drainWaiters: [],
    }
    // Atomarer Swap: neuen Eintrag erst vollständig + ID-kollisionsfrei bauen, dann beide Indizes umsetzen.
    const prev = this.byPlugin.get(a.pluginId)
    if (prev) this.byInstance.delete(prev.rendererInstanceId)
    this.byPlugin.set(a.pluginId, entry)
    this.byInstance.set(rendererInstanceId, entry)
    return describe(entry)
  }

  /** Instanz-stabiler Abgleich: unveränderte Einträge (version + payload.hash) behalten ihre instanceId. */
  syncActive(activations: readonly RendererActivation[]): { changed: boolean } {
    const want = new Map(activations.map((a) => [a.pluginId, a]))
    let changed = false
    for (const id of [...this.byPlugin.keys()]) {
      if (!want.has(id)) {
        this.deactivate(id)
        changed = true
      }
    }
    for (const a of activations) {
      const prev = this.byPlugin.get(a.pluginId)
      if (prev && prev.version === a.version && prev.payload.hash === a.payload.hash) {
        prev.pluginLabel = a.pluginLabel
        prev.fileEditors = cloneFileEditors(a.fileEditors)
        prev.manifest = a.manifest
        continue
      }
      this.activate(a)
      changed = true
    }
    return { changed }
  }

  /** Entfernt den Renderer-Beitrag eines Plugins. (Den Drain steuert der Aufrufer via drain() vorab.) */
  deactivate(pluginId: string): void {
    const prev = this.byPlugin.get(pluginId)
    if (!prev) return
    this.byPlugin.delete(pluginId)
    this.byInstance.delete(prev.rendererInstanceId)
  }

  /** Serve-Gate (I-L2): Code/Styles als utf8-Strings + geklonte Metadaten, oder `undefined`. */
  servePayload(pluginId: unknown): RendererServe | undefined {
    if (typeof pluginId !== 'string') return undefined
    const e = this.byPlugin.get(pluginId)
    if (!e) return undefined
    return {
      rendererInstanceId: e.rendererInstanceId,
      pluginId: e.pluginId,
      pluginLabel: e.pluginLabel,
      version: e.version,
      code: e.payload.code.toString('utf8'),
      styles: e.payload.styles?.toString('utf8'),
      fileEditors: cloneFileEditors(e.fileEditors),
    }
  }

  /** Auflösung instanceId→Metadaten (KEINE Bytes/kein Manifest); `undefined` nach Invalidierung. */
  resolveInstance(rendererInstanceId: unknown): RendererInstanceRef | undefined {
    if (typeof rendererInstanceId !== 'string') return undefined
    const e = this.byInstance.get(rendererInstanceId)
    if (!e) return undefined
    return { pluginId: e.pluginId, version: e.version, generation: e.generation }
  }

  /** Byte-freie Liste für den `plugin:renderers-changed`-Push. */
  list(): RendererDescriptor[] {
    return [...this.byPlugin.values()].map(describe)
  }

  /**
   * `plugin:host`-Dispatch (F08/F09): instanceId→Eintrag (Main-gebunden, der Renderer nennt nie pluginId),
   * Call-Gate + In-Flight-Zählung, Host-Erzeugung INTERN (Manifest verlässt das Modul nicht). Nur `vault.<op>`;
   * das feine Capability-Gating (read* vs write*) macht die Host-Factory aus den Manifest-Capabilities.
   */
  async invokeHostOp(rendererInstanceId: unknown, op: unknown, args: unknown): Promise<HostOpResult> {
    if (typeof rendererInstanceId !== 'string') return { ok: false, error: 'Ungültige Instanz' }
    const e = this.byInstance.get(rendererInstanceId)
    if (!e) return { ok: false, error: 'Renderer-Instanz nicht aktiv' }
    if (e.gateClosed) return { ok: false, error: 'Plugin wird gerade entladen' }
    if (!this.hostFactory) return { ok: false, error: 'Host noch nicht bereit' }
    const [ns, method] = String(op).split('.')
    if (ns !== 'vault' || !VAULT_OPS.has(method)) return { ok: false, error: `Operation '${String(op)}' nicht erlaubt` }

    e.inFlight++
    try {
      const host = this.hostFactory(e.manifest)
      const fn = host.vault?.[method]
      if (typeof fn !== 'function') return { ok: false, error: `Capability für '${String(op)}' fehlt` }
      const data = await fn(...(Array.isArray(args) ? args : []))
      return { ok: true, data }
    } catch (err) {
      // Keine rohen Main-Exceptions/Stacks an den Renderer (F13) — nur die Message.
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      e.inFlight--
      if (e.inFlight === 0 && e.drainWaiters.length) {
        const waiters = e.drainWaiters.splice(0)
        for (const w of waiters) w()
      }
    }
  }

  /**
   * Schließt das Call-Gate (keine neuen Host-Calls) und wartet, bis laufende Calls dieser Generation
   * abgeschlossen sind (F08/§5.5). `'drained'` = sauber leer; `'timeout'` = es liefen noch Calls → der
   * Aufrufer behandelt das fail-closed (`restart-required`, nichts löschen). Unbekanntes Plugin = `'drained'`.
   */
  async drain(pluginId: string, timeoutMs: number): Promise<'drained' | 'timeout'> {
    const e = this.byPlugin.get(pluginId)
    if (!e) return 'drained'
    e.gateClosed = true
    if (e.inFlight === 0) return 'drained'
    return await new Promise<'drained' | 'timeout'>((resolve) => {
      const timer = setTimeout(() => {
        const i = e.drainWaiters.indexOf(onDrained)
        if (i >= 0) e.drainWaiters.splice(i, 1)
        resolve('timeout')
      }, timeoutMs)
      const onDrained = (): void => {
        clearTimeout(timer)
        resolve('drained')
      }
      e.drainWaiters.push(onDrained)
    })
  }

  private mintUniqueId(): string {
    for (let i = 0; i < 8; i++) {
      const id = this.mintId()
      if (!this.byInstance.has(id)) return id
    }
    throw new Error('RendererRuntime: konnte keine eindeutige rendererInstanceId minten')
  }
}

function describe(e: RendererRuntimeEntry): RendererDescriptor {
  return {
    pluginId: e.pluginId,
    pluginLabel: e.pluginLabel,
    version: e.version,
    rendererInstanceId: e.rendererInstanceId,
    fileEditors: cloneFileEditors(e.fileEditors),
  }
}
