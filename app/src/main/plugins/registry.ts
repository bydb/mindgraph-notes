// Main-Plugin-Registry — der EINZIGE Einstiegspunkt zu Plugins im Main-Prozess.
//
// Aufgaben: Manifeste validieren (ajv), Lebenszyklus führen (3 Dimensionen), Action-
// Executoren sammeln, Aufrufe gegen Schema + Aktivierung + Capabilities prüfen. Jeder
// Schritt ist fehler-isoliert — ein defektes Plugin darf den App-Start NIE kippen.
//
// Erkennung läuft über `import.meta.glob` (Entscheidung #7): Manifeste eager (reine,
// JSON-fähige Daten — immer importierbar), Main-Entries LAZY (importieren ggf. electron,
// werden erst bei Aktivierung geladen). Die Kern-Klasse kennt keine Globs — sie nimmt eine
// fertige Quell-Liste entgegen (DI), damit Tests Fake-Plugins ohne Dateisystem einspeisen.
// Siehe docs/plugin-system-plan.md.

import type { ModuleId as CompatModuleId } from '../../shared/modelCompatibility'
import type { PluginManifest } from '../../shared/plugins/manifest'
import type {
  PluginActionExecutor,
  PluginActionRegistry,
  PluginMainEntry,
} from '../../shared/plugins/entry'
import type { AnyPluginHost } from '../../shared/plugins/host'
import {
  initialPluginState,
  isPluginUsable,
  pluginBlockedReason,
  type PluginRuntimeState,
} from '../../shared/plugins/state'
import {
  validateManifest,
  validateManifestSemantics,
  validateAgainst,
} from '../../shared/plugins/schemas'

/** Eine entdeckte Plugin-Quelle: reines Manifest + lazy Loader für den Main-Entry. */
export interface MainPluginSource {
  manifest: PluginManifest
  /** Lädt den Main-Entry (default-Export). Fehlt er, schlägt erst die Aktivierung fehl. */
  loadEntry?: () => Promise<{ default: PluginMainEntry } | PluginMainEntry>
}

/** Baut den Capability-Host für ein Plugin. Per DI injiziert (Stub bis der echte Host steht). */
export type HostFactory = (manifest: PluginManifest) => AnyPluginHost

/** Prüft vor einer LLM-Action mit `hardLockModule`, ob das aktive Modell gesperrt ist.
 *  Gibt den Sperrgrund zurück oder null. Per DI injiziert (kennt das App-Modell-State). */
export type HardLockGuard = (moduleId: CompatModuleId) => string | null | Promise<string | null>

interface LoadedPlugin {
  manifest: PluginManifest
  source: MainPluginSource
  state: PluginRuntimeState
  entry?: PluginMainEntry
  actions: Map<string, PluginActionExecutor>
}

/** Default-Host: log funktioniert, jeder Dienst wirft laut, solange Schritt 5 nicht verdrahtet ist. */
const STUB_HOST_FACTORY: HostFactory = () =>
  new Proxy(
    { log: (msg: string) => console.log(`[plugin] ${msg}`) },
    {
      get(target, prop) {
        if (prop in target) return (target as Record<string, unknown>)[prop as string]
        throw new Error(
          `Capability-Host nicht konfiguriert (Zugriff auf '${String(prop)}'). Erst ab Schritt 5 verdrahtet.`
        )
      },
    }
  ) as unknown as AnyPluginHost

export class PluginRegistry {
  private readonly plugins = new Map<string, LoadedPlugin>()

  constructor(
    private hostFactory: HostFactory = STUB_HOST_FACTORY,
    private hardLockGuard?: HardLockGuard
  ) {}

  /** Setzt den echten Capability-Host nachträglich (nach Aktivierung gebaut in index.ts). */
  setHostFactory(factory: HostFactory): void {
    this.hostFactory = factory
  }

  setHardLockGuard(guard: HardLockGuard): void {
    this.hardLockGuard = guard
  }

  /**
   * Nimmt entdeckte Quellen auf. Validiert jedes Manifest; ein ungültiges landet als
   * `error`-Zustand und wird übersprungen — wirft NIE. Doppelte IDs: erste gewinnt.
   */
  register(sources: MainPluginSource[]): void {
    for (const source of sources) {
      const { manifest } = source
      const id = typeof manifest?.id === 'string' ? manifest.id : '(unbekannt)'

      if (this.plugins.has(id)) {
        console.warn(`[plugin] doppelte ID '${id}' ignoriert`)
        continue
      }

      const shape = validateManifest(manifest)
      const semantics = shape.valid
        ? validateManifestSemantics(manifest)
        : { valid: false, errors: [] as string[] }

      if (!shape.valid || !semantics.valid) {
        const errors = [...shape.errors, ...semantics.errors]
        this.plugins.set(id, {
          manifest,
          source,
          state: {
            id,
            version: manifest?.version,
            installation: 'bundled',
            activation: 'error',
            readiness: 'unavailable',
            error: { message: `Ungültiges Manifest: ${errors.join('; ')}`, at: nowIso() },
          },
          actions: new Map(),
        })
        console.error(`[plugin] '${id}' abgewiesen: ${errors.join('; ')}`)
        continue
      }

      this.plugins.set(id, {
        manifest,
        source,
        state: initialPluginState(id, manifest.version),
        actions: new Map(),
      })
    }
  }

  list(): PluginRuntimeState[] {
    return [...this.plugins.values()].map((p) => p.state)
  }

  get(id: string): PluginRuntimeState | undefined {
    return this.plugins.get(id)?.state
  }

  /**
   * Lädt (lazy) den Main-Entry, ruft sein `register`/`start` mit einem Capability-Host und
   * sammelt die Action-Executoren. Jeder Fehler → `error`-Zustand, andere Plugins bleiben heil.
   */
  async activate(id: string): Promise<PluginRuntimeState> {
    const p = this.plugins.get(id)
    if (!p) throw new Error(`Unbekanntes Plugin '${id}'`)
    if (p.state.activation === 'error') return p.state // defektes Manifest bleibt defekt
    if (p.state.activation === 'active') return p.state

    p.state = { ...p.state, activation: 'starting' }
    try {
      const entry = await this.resolveEntry(p)
      if (entry.id !== p.manifest.id) {
        throw new Error(`Entry-ID '${entry.id}' passt nicht zum Manifest '${p.manifest.id}'`)
      }
      p.entry = entry

      const host = this.hostFactory(p.manifest)
      const declared = new Set((p.manifest.actions ?? []).map((a) => a.id))
      const actionMap = new Map<string, PluginActionExecutor>()
      const actions: PluginActionRegistry = {
        register(actionId, execute) {
          if (!declared.has(actionId)) {
            throw new Error(`Action '${actionId}' ist im Manifest nicht deklariert`)
          }
          if (actionMap.has(actionId)) {
            throw new Error(`Action '${actionId}' doppelt registriert`)
          }
          actionMap.set(actionId, execute)
        },
      }

      await entry.register({ host, actions })
      if (entry.start) await entry.start({ host, actions })

      p.actions = actionMap
      p.state = { ...p.state, activation: 'active', readiness: 'ready', error: undefined }
    } catch (err) {
      p.entry = undefined
      p.actions = new Map()
      p.state = {
        ...p.state,
        activation: 'error',
        readiness: 'unavailable',
        error: { message: errMessage(err), at: nowIso() },
      }
      console.error(`[plugin] Aktivierung von '${id}' fehlgeschlagen: ${errMessage(err)}`)
    }
    return p.state
  }

  /** Aktiviert alle registrierten Plugins; sammelt keine Fehler (jeder ist isoliert im Zustand). */
  async activateAll(): Promise<void> {
    for (const id of this.plugins.keys()) await this.activate(id)
  }

  async deactivate(id: string): Promise<PluginRuntimeState> {
    const p = this.plugins.get(id)
    if (!p) throw new Error(`Unbekanntes Plugin '${id}'`)
    if (p.state.activation !== 'active') return p.state

    p.state = { ...p.state, activation: 'stopping' }
    try {
      if (p.entry?.stop) await p.entry.stop()
    } catch (err) {
      console.error(`[plugin] stop() von '${id}' warf: ${errMessage(err)}`)
    }
    p.entry = undefined
    p.actions = new Map()
    p.state = { ...p.state, activation: 'disabled', readiness: 'unavailable', error: undefined }
    return p.state
  }

  /**
   * Ruft eine Action auf. NICHT-generisch: prüft Nutzbarkeit, Action-Existenz, Capability-
   * Subset und validiert In-/Output gegen die Schemas. Wirft bei jedem Verstoß; der IPC-
   * Transport (Schritt 4) normalisiert das zu {ok,error}.
   */
  async invoke(id: string, actionId: string, payload: unknown): Promise<unknown> {
    const p = this.plugins.get(id)
    if (!p) throw new Error(`Unbekanntes Plugin '${id}'`)
    if (!isPluginUsable(p.state)) {
      throw new Error(pluginBlockedReason(p.state) ?? `Plugin '${id}' nicht verfügbar`)
    }

    const def = (p.manifest.actions ?? []).find((a) => a.id === actionId)
    if (!def) throw new Error(`Plugin '${id}' hat keine Action '${actionId}'`)

    // Defense-in-Depth: Action darf nur deklarierte Capabilities verlangen.
    const granted = new Set(p.manifest.capabilities)
    for (const cap of def.requiredCapabilities) {
      if (!granted.has(cap)) {
        throw new Error(`Action '${actionId}' verlangt nicht gewährte Capability '${cap}'`)
      }
    }

    // Hard-Lock: LLM-Actions auf untrusted Input mit gesperrtem Modell blockieren —
    // analog zum Workflow-Runner (kein Backdoor um die Modell-Matrix herum).
    if (def.hardLockModule && this.hardLockGuard) {
      const reason = await this.hardLockGuard(def.hardLockModule)
      if (reason) throw new Error(reason)
    }

    const executor = p.actions.get(actionId)
    if (!executor) throw new Error(`Action '${actionId}' hat keinen registrierten Executor`)

    if (def.inputSchema) {
      const r = validateAgainst(def.inputSchema, payload, `${id}:${actionId}:in`)
      if (!r.valid) throw new Error(`Ungültige Eingabe für '${actionId}': ${r.errors.join('; ')}`)
    }

    const result = await executor(payload)

    if (def.outputSchema) {
      const r = validateAgainst(def.outputSchema, result, `${id}:${actionId}:out`)
      if (!r.valid) throw new Error(`Ungültige Ausgabe von '${actionId}': ${r.errors.join('; ')}`)
    }
    return result
  }

  private async resolveEntry(p: LoadedPlugin): Promise<PluginMainEntry> {
    if (p.entry) return p.entry
    if (!p.source.loadEntry) throw new Error(`Plugin '${p.manifest.id}' hat keinen Main-Entry`)
    const mod = await p.source.loadEntry()
    const entry = (mod as { default?: PluginMainEntry }).default ?? (mod as PluginMainEntry)
    if (!entry || typeof entry.register !== 'function') {
      throw new Error(`Main-Entry von '${p.manifest.id}' exportiert kein gültiges Entry`)
    }
    return entry
  }
}

// — Build-seitige Erkennung (Entscheidung #7): kein handgepflegtes Importregister —

/**
 * Sammelt alle Plugin-Quellen aus `src/plugins/*`. Manifeste eager (rein/serialisierbar),
 * Main-Entries lazy. Paarung über den Ordnernamen zwischen `manifest.ts` und `main/index.ts`.
 */
export function discoverMainPlugins(): MainPluginSource[] {
  const manifestModules = import.meta.glob<{ default?: PluginManifest; manifest?: PluginManifest }>(
    '../../plugins/*/manifest.ts',
    { eager: true }
  )
  const entryLoaders = import.meta.glob<{ default: PluginMainEntry }>('../../plugins/*/main/index.ts')

  const entryByDir = new Map<string, () => Promise<{ default: PluginMainEntry }>>()
  for (const [path, loader] of Object.entries(entryLoaders)) {
    const dir = pluginDir(path)
    if (dir) entryByDir.set(dir, loader as () => Promise<{ default: PluginMainEntry }>)
  }

  const sources: MainPluginSource[] = []
  for (const [path, mod] of Object.entries(manifestModules)) {
    const dir = pluginDir(path)
    const manifest = mod.default ?? mod.manifest
    if (!dir || !manifest) continue
    sources.push({ manifest, loadEntry: entryByDir.get(dir) })
  }
  return sources
}

/** Erzeugt eine fertig befüllte Registry aus dem Glob-Katalog. */
export function createMainRegistry(hostFactory?: HostFactory): PluginRegistry {
  const registry = new PluginRegistry(hostFactory)
  registry.register(discoverMainPlugins())
  return registry
}

function pluginDir(path: string): string | null {
  const m = path.match(/\/plugins\/([^/]+)\//)
  return m ? m[1] : null
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function nowIso(): string {
  return new Date().toISOString()
}
