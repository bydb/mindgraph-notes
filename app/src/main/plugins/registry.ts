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
import type { PluginManifest } from '@mindgraph/plugin-api'
import type {
  PluginActionExecutor,
  PluginActionRegistry,
  PluginMainEntry,
} from '@mindgraph/plugin-api'
import type { AnyPluginHost } from '@mindgraph/plugin-api'
import {
  initialPluginState,
  isPluginInvokable,
  pluginBlockedReason,
  type PluginRuntimeState,
  type ReadinessState,
} from '../../shared/plugins/state'
import {
  validateManifest,
  validateManifestSemantics,
  validateAgainst,
} from '@mindgraph/plugin-api/validation'

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
  /** Der bei der Aktivierung gebaute Capability-Host — für die Readiness-Prüfung (host.secrets). */
  host?: AnyPluginHost
  actions: Map<string, PluginActionExecutor>
  /** Zuletzt GEWÜNSCHTER Zustand (synchron beim activate/deactivate-Aufruf gesetzt).
   *  Eine laufende Transition prüft ihn und bricht ab, wenn sie überholt wurde. */
  desired: 'active' | 'disabled'
  /** Serialisiert Transitionen pro Plugin — verhindert verschränkte activate/deactivate. */
  lifecycle?: Promise<void>
  /** Manifest war beim Register ungültig ⇒ TERMINAL (kein Aktivierungs-Retry). Ein reiner
   *  Laufzeitfehler (entry.register/start wirft) ist dagegen wiederholbar. */
  manifestInvalid: boolean
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
          desired: 'disabled',
          manifestInvalid: true,
        })
        console.error(`[plugin] '${id}' abgewiesen: ${errors.join('; ')}`)
        continue
      }

      this.plugins.set(id, {
        manifest,
        source,
        state: initialPluginState(id, manifest.version),
        actions: new Map(),
        desired: 'disabled',
        manifestInvalid: false,
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
   * Reiht eine Transition pro Plugin serialisiert ein. Mehrere parallele activate/deactivate-
   * Aufrufe (schnelles Umschalten) können sich so nicht verschränken; `p.desired` wird synchron
   * gesetzt, sodass die zuletzt gewünschte Absicht gewinnt ("last desired wins").
   */
  private chain<T>(p: LoadedPlugin, fn: () => Promise<T>): Promise<T> {
    const result = (p.lifecycle ?? Promise.resolve()).then(fn, fn)
    p.lifecycle = result.then(
      () => {},
      () => {}
    )
    return result
  }

  /**
   * Lädt (lazy) den Main-Entry, ruft sein `register`/`start` mit einem Capability-Host und
   * sammelt die Action-Executoren. Jeder Fehler → `error`-Zustand, andere Plugins bleiben heil.
   */
  async activate(id: string): Promise<PluginRuntimeState> {
    const p = this.plugins.get(id)
    if (!p) throw new Error(`Unbekanntes Plugin '${id}'`)
    p.desired = 'active'
    return this.chain(p, () => this.doActivate(p))
  }

  private async doActivate(p: LoadedPlugin): Promise<PluginRuntimeState> {
    const id = p.manifest.id
    if (p.desired !== 'active') return p.state // von einem späteren deactivate überholt
    if (p.manifestInvalid) return p.state // defektes Manifest bleibt TERMINAL (kein Retry)
    if (p.state.activation === 'active') return p.state
    // Ein reiner LAUFZEIT-Fehler (error aus entry.register/start) ist wiederholbar: erneutes
    // Aktivieren setzt zurück. Hängt noch ein Entry aus einem fehlgeschlagenen Start (Ressourcen
    // evtl. geleakt), erst best-effort stoppen + verwerfen, damit nicht doppelt registriert wird.
    if (p.entry) {
      try {
        if (p.entry.stop) await p.entry.stop()
      } catch (stopErr) {
        console.error(`[plugin] stop() vor Retry von '${id}' warf: ${errMessage(stopErr)}`)
        p.state = {
          ...p.state,
          activation: 'error',
          readiness: 'unavailable',
          error: {
            message: `Erneute Aktivierung blockiert, weil vorheriges Aufräumen fehlschlug: ${errMessage(stopErr)}`,
            at: nowIso(),
          },
        }
        return p.state
      }
      p.entry = undefined
      p.host = undefined
      p.actions = new Map()
    }

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

      p.host = host
      p.actions = actionMap
      // Readiness ehrlich aus der Konfiguration ableiten (nicht mehr pauschal 'ready').
      const readiness = await this.evaluateReadiness(p)
      p.state = { ...p.state, activation: 'active', readiness, error: undefined }
    } catch (err) {
      // register/start kann bereits Timer/Listener angelegt haben → best-effort stoppen.
      // Schlägt stop() fehl, Entry für einen späteren Deaktivierungs-Retry BEHALTEN (sonst sind
      // die geleakten Ressourcen unerreichbar); sonst sauber verwerfen.
      let stopFailed = false
      if (p.entry?.stop) {
        try {
          await p.entry.stop()
        } catch (stopErr) {
          stopFailed = true
          console.error(`[plugin] stop() nach fehlgeschlagener Aktivierung von '${id}' warf: ${errMessage(stopErr)}`)
        }
      }
      if (!stopFailed) p.entry = undefined
      p.host = undefined
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

  /**
   * Aktiviert alle registrierten Plugins; sammelt keine Fehler (jeder ist isoliert im Zustand).
   * `isEnabled` (optional): liefert sie für ein Plugin `false`, wird es übersprungen und bleibt
   * im Ausgangszustand `disabled` — so respektiert der App-Start den Modulschalter (A-pre #1).
   * Ohne Argument bleibt das alte Verhalten „alles aktivieren".
   */
  async activateAll(isEnabled?: (id: string, manifest: PluginManifest) => boolean): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      if (isEnabled && !isEnabled(id, plugin.manifest)) continue
      await this.activate(id)
    }
  }

  async deactivate(id: string): Promise<PluginRuntimeState> {
    const p = this.plugins.get(id)
    if (!p) throw new Error(`Unbekanntes Plugin '${id}'`)
    p.desired = 'disabled'
    return this.chain(p, () => this.doDeactivate(p))
  }

  private async doDeactivate(p: LoadedPlugin): Promise<PluginRuntimeState> {
    const id = p.manifest.id
    if (p.desired !== 'disabled') return p.state // von einem späteren activate überholt

    // Solange ein Entry mit stop() hängt, MUSS stop() (erneut) laufen — auch nach einem früheren
    // fehlgeschlagenen Stop. Der Entry bleibt erhalten, bis stop() wirklich durchläuft; sonst
    // würde ein weiterlaufender Timer/Listener bei „nochmal ausschalten" weggeklickt.
    if (p.entry?.stop) {
      p.actions = new Map() // Actions sofort sperren — kein Aufruf mehr während/nach dem Stop
      p.state = { ...p.state, activation: 'stopping' }
      try {
        await p.entry.stop()
      } catch (err) {
        // Stop gescheitert: Entry BEHALTEN (Retry beim nächsten Ausschalten), error halten.
        console.error(`[plugin] stop() von '${id}' warf: ${errMessage(err)}`)
        p.state = {
          ...p.state,
          activation: 'error',
          readiness: 'unavailable',
          error: { message: `Stoppen fehlgeschlagen: ${errMessage(err)}`, at: nowIso() },
        }
        return p.state
      }
    }

    // Sauber gestoppt (oder es gab nie einen Entry/stop) → endgültig `disabled`. Erst JETZT
    // Entry + Host + Fehler löschen; das räumt auch einen reinen Aktivierungsfehler (kein Entry) auf.
    p.entry = undefined
    p.host = undefined
    p.actions = new Map()
    p.state = { ...p.state, activation: 'disabled', readiness: 'unavailable', error: undefined }
    return p.state
  }

  /**
   * Leitet die Readiness aus der Konfiguration ab: alle als `required` (Default) deklarierten
   * Credentials müssen in host.secrets hinterlegt sein. Keine Credentials ⇒ sofort `ready`.
   * Bewusst nur Anwesenheits-Check (kein Verbindungstest) — ein FALSCHES Credential ist ein
   * Laufzeitfehler der Action, kein „needs-configuration". Wirft nie; im Zweifel `ready`
   * (kein Falsch-Blockieren eines konfigurierten Plugins).
   */
  private async evaluateReadiness(p: LoadedPlugin): Promise<ReadinessState> {
    const required = (p.manifest.credentials ?? []).filter((c) => c.required !== false)
    if (required.length === 0) return 'ready'
    // Credentials deklariert, aber keine secrets-Capability ⇒ kann NICHT geprüft/geladen werden.
    // Das ist ein Defekt, kein Einsatzbereit — KEIN Fail-open auf ready.
    const secrets = (p.host as { secrets?: { get(key: string): Promise<string | null> } } | undefined)?.secrets
    if (!secrets) return 'unavailable'
    try {
      for (const c of required) {
        const value = await secrets.get(c.key)
        if (!value) return 'needs-configuration'
      }
      return 'ready'
    } catch (err) {
      // Technischer Fehler beim Lesen (z.B. safeStorage/Secrets-Speicher defekt): ehrlich
      // `unavailable` melden statt einen Defekt als Einsatzbereitschaft zu kaschieren.
      console.error(`[plugin] Readiness-Check '${p.manifest.id}' warf: ${errMessage(err)}`)
      return 'unavailable'
    }
  }

  /** Bewertet die Readiness eines aktiven Plugins neu (z.B. nachdem Credentials gespeichert wurden). */
  async refreshReadiness(id: string): Promise<PluginRuntimeState> {
    const p = this.plugins.get(id)
    if (!p) throw new Error(`Unbekanntes Plugin '${id}'`)
    if (p.state.activation !== 'active') return p.state
    p.state = { ...p.state, readiness: await this.evaluateReadiness(p) }
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
    // Gate auf Installation + Aktivierung (NICHT Readiness): eine unkonfigurierte Action
    // wirft selbst einen klaren Fehler, und needs-configuration darf die eigenen Setup-
    // Actions (saveCredentials) nicht sperren.
    if (!isPluginInvokable(p.state)) {
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

    // Credential-mutierende Actions (saveCredentials/deleteCredentials: isWrite + 'secrets')
    // ändern die Readiness — sofort neu bewerten, damit der gemeldete Zustand ehrlich bleibt
    // (needs-configuration → ready, sobald die Zugangsdaten hinterlegt sind).
    if (def.isWrite && def.requiredCapabilities.includes('secrets')) {
      p.state = { ...p.state, readiness: await this.evaluateReadiness(p) }
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
