// ExternalRendererRegistry — der Renderer-seitige Lade-/Lifecycle-Kern für SIGNIERTE externe
// Renderer-Plugins (ADR plugin-renderer-host §6/§7). Dies ist der sicherheitssensibelste Teil: hier
// läuft fremdes (signiertes) JS VOLL VERTRAUT im Haupt-Renderer (Option A, §4). Die Registry ist
// bewusst von einem `RendererLoaderEnv` entkoppelt (IPC, Blob-Import, DOM-Style, Theme) — damit ist
// die ganze Lade-/Staging-/Teardown-Logik in Node ohne echten Blob-Import testbar.
//
// Vertrag (revidierter Plan, Codex-Runde 2, F06/F10/F11/F12):
//  - EAGER aktivieren: auf `plugin:renderers-changed` lädt die Registry pro NEUER/geänderter
//    rendererInstanceId das Bundle, importiert es (Single-File-ESM via Blob), prüft den STRIKTEN
//    Export `{ id, activate }`, baut den Host und ruft `activate(host)` STAGED auf. Erst wenn alle im
//    Manifest deklarierten editorIds GENAU EINMAL registriert sind, werden die Mounts veröffentlicht
//    und ein `{ ok:true }`-Ack gesendet (Main committet active.json erst danach — F06).
//  - LAZY nur das MOUNT: der konkrete Editor wird erst beim Öffnen eines plugin-editor-Tabs gemountet.
//  - instanceId CAPTUREN (F10): der Host bindet seine vault-Calls an die zur Ladezeit gültige
//    rendererInstanceId. Nach einem Upgrade ist sie tot (Main: „Instanz nicht aktiv") — kein
//    v1-Code mit v2-Rechten. Bei instanceId-Wechsel wird hart entladen + neu geladen.
//  - Teardown best-effort (§9 I-S4): dispose der Editoren → module.deactivate? → Styles entfernen →
//    Blob-URL revoken. Zombie-Freiheit wird unter Option A NICHT versprochen.

import type {
  FileEditorMount,
  FileEmbedMount,
  PluginRendererHost,
  PluginRendererModule,
} from '@mindgraph/plugin-api'
import type {
  RendererActivateAck,
  RendererDescriptor,
  RendererHostOpResult,
  RendererListResult,
  RendererServeResult,
} from '../../../shared/plugins/renderer'

/** Die nach außen abstrahierten Seams (Produktion = window.electronAPI + Blob + DOM + Theme; Test = Fakes). */
export interface RendererLoaderEnv {
  fetchList(): Promise<RendererListResult>
  fetchEntry(pluginId: string): Promise<RendererServeResult>
  invokeHost(rendererInstanceId: string, op: string, args: unknown[]): Promise<RendererHostOpResult>
  ackActivated(ack: RendererActivateAck): Promise<void>
  /** Erzeugt eine ladbare URL für den verifizierten Code (Prod: Blob-URL). Wird bis zum Unload gehalten. */
  createModuleUrl(code: string): string
  importUrl(url: string): Promise<unknown>
  revokeModuleUrl(url: string): void
  /** Host-eigenes `<style data-plugin>` setzen/entfernen (Prod: document.head). */
  applyStyles(pluginId: string, css: string): void
  removeStyles(pluginId: string): void
  getTheme(): 'light' | 'dark'
  onThemeChange(cb: (theme: 'light' | 'dark') => void): () => void
}

/** Registrierungsfehler während `activate` (unbekannte/doppelte editorId) — vom generischen activate-Wurf
 *  unterscheidbar, damit der Ack die Phase 'register' korrekt meldet (F11). */
class RegisterError extends Error {}

/** Ausgang eines Renderer-Teardowns (§5.5-Matrix). `timeout` = `deactivate()` hängt → fail-closed. */
export type TeardownOutcome = 'success' | 'error' | 'timeout'

/** Max. Wartezeit auf ein asynchrones `module.deactivate()`, danach `timeout` (fail-closed, §5.5). */
const DEACTIVATE_TIMEOUT_MS = 4000

/** Wartet auf `value`, falls thenable; `'timeout'` wenn es `ms` überschreitet. Sync/undefined → sofort `'done'`. */
async function awaitWithTimeout(value: unknown, ms: number): Promise<'done' | 'timeout'> {
  if (!value || typeof (value as { then?: unknown }).then !== 'function') return 'done'
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms)
  })
  try {
    return await Promise.race([(value as Promise<unknown>).then(() => 'done' as const), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

interface LoadedRenderer {
  pluginId: string
  pluginLabel: string
  version: string
  instanceId: string
  moduleUrl: string
  module: PluginRendererModule
  host: PluginRendererHost
  /** Veröffentlichte editorId→mount (erst nach erfolgreichem Staging). */
  mounts: Map<string, FileEditorMount>
  /** OPT-IN Read-only-Embed-Mounts je editorId (R2, API ≥0.2.1) — leer, wenn das Plugin keine registriert. */
  embedMounts: Map<string, FileEmbedMount>
  /** Host-Theme-Subscriptions — beim Teardown abräumen, falls das Plugin es vergisst. */
  themeUnsubs: Set<() => void>
  /** Teardown läuft/lief (hängendes deactivate) — sperrt neue Mounts + verhindert Doppel-Teardown. */
  tearingDown: boolean
}

interface ActiveMount {
  pluginId: string
  /** Roher Plugin-Disposer (kann werfen) — bleibt für teardownEntry KLASSIFIZIERBAR (F26); die an den Tab
   *  zurückgegebene Fassade ist isolierend/idempotent, dieser nicht. */
  raw: () => void
  disposed: boolean
}

/** Schmaler Lese-Descriptor für die FileTree-/Tab-Schicht (welches Plugin/Editor bedient was). */
export interface LoadedRendererInfo {
  pluginId: string
  pluginLabel: string
  version: string
  instanceId: string
  editorIds: string[]
}

const isRendererModule = (v: unknown): v is PluginRendererModule =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { id?: unknown }).id === 'string' &&
  typeof (v as { activate?: unknown }).activate === 'function'

export class ExternalRendererRegistry {
  private readonly loaded = new Map<string, LoadedRenderer>()
  private readonly activeMounts = new Map<object, ActiveMount>()
  /**
   * Outcome-Tombstones je rendererInstanceId (F22/F27): der §5.5-Ausgang eines Teardowns überlebt das
   * Entfernen des Live-Eintrags. Ein späterer GERICHTETER Teardown derselben instanceId liefert damit den
   * ECHTEN Ausgang (`error`/`timeout`) statt idempotent `success` — sonst dürfte Main den Vorgänger
   * fälschlich reaktivieren, obwohl der Kandidat nicht sauber stoppte. Beschränkt (Ringpuffer).
   */
  private readonly tombstones = new Map<string, TeardownOutcome>()
  private revision = 0
  private readonly listeners = new Set<() => void>()
  /** Serialisiert ALLE mutierenden Operationen (sync + gerichteter Teardown) — keine Überlappung. */
  private opChain: Promise<unknown> = Promise.resolve()

  constructor(private readonly env: RendererLoaderEnv) {}

  /** Reiht eine mutierende Operation hinter die laufende ein (läuft unabhängig vom Vorgänger-Ausgang). */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.opChain.then(fn, fn)
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  // — React-Anbindung (useSyncExternalStore, analog ExternalWidgetRegistry) —
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getRevision = (): number => this.revision
  private changed(): void {
    this.revision++
    for (const l of this.listeners) l()
  }

  /** Welche Plugins/Editoren aktuell geladen sind (für Diagnose/Tab-Resolution). */
  listLoaded(): LoadedRendererInfo[] {
    return [...this.loaded.values()].map((lr) => ({
      pluginId: lr.pluginId,
      pluginLabel: lr.pluginLabel,
      version: lr.version,
      instanceId: lr.instanceId,
      editorIds: [...lr.mounts.keys()],
    }))
  }

  isLoaded(pluginId: string, editorId?: string): boolean {
    const lr = this.loaded.get(pluginId)
    if (!lr) return false
    return editorId ? lr.mounts.has(editorId) : true
  }

  /** Aktuelle rendererInstanceId eines geladenen Plugins (Tab-Effekt-Dep → harter Remount bei Wechsel, F10). */
  getInstanceId(pluginId: string): string | undefined {
    return this.loaded.get(pluginId)?.instanceId
  }

  /** Holt die autoritative Liste vom Main und gleicht den Ladezustand ab (eager laden/entladen).
   *  Serialisiert — paralleler Aufruf reiht sich an. */
  sync(): Promise<void> {
    return this.enqueue(() => this.doSync())
  }

  /**
   * Gerichteter Teardown EINER konkreten rendererInstanceId (Main-orchestriert, ADR §5.2/§5.5). Liefert
   * den §5.5-Ausgang (`success|error|timeout`) — der Renderer-Client ackt diesen an Main. Unbekannte/bereits
   * entladene Instanz → `success` (idempotent). Serialisiert gegen sync()/andere Teardowns.
   */
  teardownInstance(rendererInstanceId: string): Promise<TeardownOutcome> {
    return this.enqueue(async () => {
      const lr = [...this.loaded.values()].find((e) => e.instanceId === rendererInstanceId)
      if (!lr) {
        // Kein Live-Eintrag → den ECHTEN Ausgang aus dem Tombstone liefern (F22/F27); fehlt einer, war der
        // (lokale) Teardown sauber bzw. die Instanz existierte nie → `success`.
        return this.tombstones.get(rendererInstanceId) ?? 'success'
      }
      const outcome = await this.teardownEntry(lr)
      this.changed()
      return outcome
    })
  }

  /** Hält den §5.5-Ausgang je instanceId fest (beschränkter Ringpuffer). Nur `error`/`timeout` sind relevant. */
  private recordTombstone(rendererInstanceId: string, outcome: TeardownOutcome): void {
    this.tombstones.set(rendererInstanceId, outcome)
    if (this.tombstones.size > 64) {
      const oldest = this.tombstones.keys().next().value
      if (oldest !== undefined) this.tombstones.delete(oldest)
    }
  }

  private async doSync(): Promise<void> {
    const res = await this.env.fetchList()
    if (!res.ok) return
    const wantById = new Map(res.data.map((d) => [d.pluginId, d]))
    let mutated = false

    // 1) Entladen: entfernte ODER instanceId-gewechselte Plugins (Upgrade → harter Reload, F10).
    //    Backstop zum gerichteten Teardown (idempotent) — z.B. wenn Main nur die Liste ändert.
    for (const [, lr] of [...this.loaded]) {
      const want = wantById.get(lr.pluginId)
      if ((!want || want.rendererInstanceId !== lr.instanceId) && !lr.tearingDown) {
        await this.teardownEntry(lr)
        mutated = true
      }
    }

    // 2) Laden: neue oder (nach Teardown) ersetzte Plugins. Unveränderte überspringen.
    for (const desc of res.data) {
      const lr = this.loaded.get(desc.pluginId)
      if (lr && lr.instanceId === desc.rendererInstanceId) continue
      await this.loadAndActivate(desc)
      mutated = true
    }
    if (mutated) this.changed() // F19: auch ein reiner Teardown (loaded.size→0) benachrichtigt Abonnenten.
  }

  /** Lädt + aktiviert (staged) EIN Plugin und ackt den Ausgang an Main (F06/F11). */
  private async loadAndActivate(desc: RendererDescriptor): Promise<void> {
    const fail = (error: string, phase: 'import' | 'contract' | 'activate' | 'register'): void => {
      // Fehler-Acks sind best-effort (die lokale Bereinigung lief bereits); .catch() verhindert
      // unhandled rejections, falls die IPC-Zustellung scheitert (F18). Main bleibt fail-closed im Timeout.
      void this.env.ackActivated({ ok: false, rendererInstanceId: desc.rendererInstanceId, error, phase }).catch(() => {})
    }

    const serve = await this.env.fetchEntry(desc.pluginId)
    if (!serve.ok) return fail(serve.error, 'import')
    // Authoritativ ist die vom Serve gelieferte instanceId; weicht sie von der Push-Liste ab, hat sich der
    // Stand unter uns geändert → bewusst fail-closed (Timeout/nächster Push gleicht ab).
    if (serve.data.rendererInstanceId !== desc.rendererInstanceId) {
      return fail('rendererInstanceId hat sich während des Ladens geändert', 'import')
    }
    const instanceId = serve.data.rendererInstanceId

    // Single-File-ESM via Blob-URL importieren. Die URL wird bis zum Unload gehalten (F03/F12); ein
    // fehlschlagender Import (z. B. relativer Sub-Import in einem nicht-selbstenthaltenen Bundle) → Fehler.
    const url = this.env.createModuleUrl(serve.data.code)
    let mod: unknown
    try {
      mod = await this.env.importUrl(url)
    } catch (err) {
      this.env.revokeModuleUrl(url)
      return fail(err instanceof Error ? err.message : String(err), 'import')
    }

    const def = (mod as { default?: unknown } | null)?.default
    if (!isRendererModule(def) || def.id !== desc.pluginId) {
      this.env.revokeModuleUrl(url)
      return fail(
        `Default-Export erfüllt den Vertrag { id:'${desc.pluginId}', activate } nicht`,
        'contract',
      )
    }

    // Host-eigene Styles ZUERST (vor activate, damit das Plugin sie beim Mount voraussetzen darf).
    if (serve.data.styles) this.env.applyStyles(desc.pluginId, serve.data.styles)

    const declared = new Set(desc.fileEditors.map((f) => f.editorId))
    const staged = new Map<string, FileEditorMount>()
    const stagedEmbeds = new Map<string, FileEmbedMount>()
    const themeUnsubs = new Set<() => void>()
    const { host, closeStaging } = this.buildHost(desc.pluginId, instanceId, declared, staged, stagedEmbeds, themeUnsubs)

    try {
      await def.activate(host)
    } catch (err) {
      closeStaging()
      // F17/F22: activate hat ggf. schon globale Listener/Stores angelegt → klassifizierter Teardown +
      // Tombstone, damit ein hängendes/werfendes deactivate Mains späteren gerichteten Teardown nicht
      // fälschlich als `success` erscheinen lässt.
      await this.cleanupAfterActivateFailure(instanceId, desc.pluginId, url, def, themeUnsubs)
      const phase = err instanceof RegisterError ? 'register' : 'activate'
      return fail(err instanceof Error ? err.message : String(err), phase)
    }
    closeStaging() // ab jetzt wirft registerFileEditor (kein Mount-Zeit-Beitrag, F11).

    // Jeder deklarierte Beitrag muss GENAU EINMAL registriert sein (unbekannt/doppelt warf bereits in
    // registerFileEditor; hier bleibt nur „fehlend" — terminal, kein halb-aktiver Editor).
    const missing = [...declared].filter((id) => !staged.has(id))
    if (missing.length) {
      await this.cleanupAfterActivateFailure(instanceId, desc.pluginId, url, def, themeUnsubs)
      return fail(`Nicht registrierte Editor-Beiträge: ${missing.join(', ')}`, 'register')
    }

    this.loaded.set(desc.pluginId, {
      pluginId: desc.pluginId,
      pluginLabel: desc.pluginLabel,
      version: desc.version,
      instanceId,
      moduleUrl: url,
      module: def,
      host,
      mounts: staged,
      embedMounts: stagedEmbeds,
      themeUnsubs,
      tearingDown: false,
    })
    // F18: Erfolgs-Ack AWAITEN. Scheitert die Zustellung, bleibt sonst ein geladener Kandidat im Renderer,
    // während Main ins Timeout läuft → den Kandidaten lokal vollständig zurücknehmen (Main bleibt fail-closed).
    try {
      await this.env.ackActivated({ ok: true, rendererInstanceId: instanceId })
    } catch (err) {
      console.error(`[plugin:${desc.pluginId}] Aktivierungs-Ack-Zustellung scheiterte:`, err)
      const lr = this.loaded.get(desc.pluginId)
      if (lr && lr.instanceId === instanceId) await this.teardownEntry(lr)
    }
  }

  /** Ruft `module.deactivate()` isoliert (mit Timeout) und KLASSIFIZIERT den Ausgang (F17/F22). */
  private async deactivateOutcome(def: PluginRendererModule): Promise<TeardownOutcome> {
    try {
      return (await awaitWithTimeout(def.deactivate?.(), DEACTIVATE_TIMEOUT_MS)) === 'timeout' ? 'timeout' : 'success'
    } catch (err) {
      console.error(`[plugin:${def.id}] deactivate warf:`, err)
      return 'error'
    }
  }

  /**
   * Aufräumen nach einem Aktivierungsfehler NACH Beginn von `activate()` (F17/F22): best-effort
   * `deactivate()` mit klassifiziertem Ausgang. `timeout` → Styles/Blob bewusst NICHT entfernen (Matrix-treu)
   * + Tombstone, damit Mains späterer gerichteter Teardown dieser instanceId den ECHTEN Ausgang liest statt
   * idempotent `success`. `error` → Host-Chrome entfernen + Tombstone. `success` → nur Host-Chrome entfernen.
   */
  private async cleanupAfterActivateFailure(
    instanceId: string,
    pluginId: string,
    url: string,
    def: PluginRendererModule,
    themeUnsubs: Set<() => void>,
  ): Promise<void> {
    const outcome = await this.deactivateOutcome(def)
    if (outcome === 'timeout') {
      this.recordTombstone(instanceId, 'timeout')
      return
    }
    this.disposeHostResources(pluginId, url, themeUnsubs)
    if (outcome === 'error') this.recordTombstone(instanceId, 'error')
  }

  /** Baut das Host-Objekt für `activate` (ADR §6) + eine `closeStaging`-Funktion. `stagingOpen` gilt
   *  NUR während activate; danach wirft `registerFileEditor` (kein Mount-Zeit-Beitrag, F11). */
  private buildHost(
    pluginId: string,
    instanceId: string,
    declared: ReadonlySet<string>,
    staged: Map<string, FileEditorMount>,
    stagedEmbeds: Map<string, FileEmbedMount>,
    themeUnsubs: Set<() => void>,
  ): { host: PluginRendererHost; closeStaging: () => void } {
    const env = this.env
    let stagingOpen = true
    const hostOp = async (op: string, args: unknown[]): Promise<unknown> => {
      // instanceId CAPTUREN (F10) — nie frisch nachziehen, sonst schriebe v1-Code mit v2-Rechten.
      const r = await env.invokeHost(instanceId, op, args)
      if (!r.ok) throw new Error(r.error)
      return r.data
    }
    const host: PluginRendererHost = {
      id: pluginId,
      registerFileEditor: ({ editorId, mount }) => {
        if (!stagingOpen) throw new RegisterError('registerFileEditor ist nur während activate() erlaubt')
        if (typeof editorId !== 'string' || typeof mount !== 'function') {
          throw new RegisterError('registerFileEditor erwartet { editorId:string, mount:function }')
        }
        if (!declared.has(editorId)) {
          throw new RegisterError(`editorId '${editorId}' ist im Manifest nicht deklariert`)
        }
        if (staged.has(editorId)) {
          throw new RegisterError(`editorId '${editorId}' doppelt registriert`)
        }
        staged.set(editorId, mount)
      },
      // OPT-IN Read-only-Embed (R2): gleiche Staging-Regeln wie registerFileEditor, aber KEIN
      // Pflicht-Beitrag — die Vollständigkeits-Prüfung nach activate gilt nur für Editoren.
      registerFileEmbed: ({ editorId, mount }) => {
        if (!stagingOpen) throw new RegisterError('registerFileEmbed ist nur während activate() erlaubt')
        if (typeof editorId !== 'string' || typeof mount !== 'function') {
          throw new RegisterError('registerFileEmbed erwartet { editorId:string, mount:function }')
        }
        if (!declared.has(editorId)) {
          throw new RegisterError(`editorId '${editorId}' ist im Manifest nicht deklariert`)
        }
        if (stagedEmbeds.has(editorId)) {
          throw new RegisterError(`Embed für editorId '${editorId}' doppelt registriert`)
        }
        stagedEmbeds.set(editorId, mount)
      },
      vault: {
        read: (p) => hostOp('vault.read', [p]) as Promise<string>,
        readBytes: (p) => hostOp('vault.readBytes', [p]) as Promise<Uint8Array>,
        exists: (p) => hostOp('vault.exists', [p]) as Promise<boolean>,
        write: (p, c) => hostOp('vault.write', [p, c]) as Promise<void>,
        writeBytes: (p, b) => hostOp('vault.writeBytes', [p, b]) as Promise<void>,
      },
      get theme() {
        return env.getTheme()
      },
      onThemeChange: (cb) => {
        const unsub = env.onThemeChange(cb)
        themeUnsubs.add(unsub)
        return () => {
          themeUnsubs.delete(unsub)
          unsub()
        }
      },
      log: (...args) => console.log(`[plugin:${pluginId}]`, ...args),
    }
    return { host, closeStaging: () => { stagingOpen = false } }
  }

  /**
   * Mountet einen Editor in den Host-Container (LAZY, beim Tab-Öffnen). Liefert einen idempotenten
   * dispose. Ist das Plugin (noch) nicht geladen → `null` (der Tab zeigt einen Hinweis + reagiert auf
   * `subscribe`, sobald das Plugin lädt).
   */
  mountEditor(
    pluginId: string,
    editorId: string,
    container: HTMLElement,
    filePath: string,
  ): (() => void) | null {
    const lr = this.loaded.get(pluginId)
    if (!lr || lr.tearingDown) return null // kein Mount auf einem Plugin, das gerade entladen wird
    const mount = lr.mounts.get(editorId)
    if (!mount) return null
    return this.runMount(lr, mount, editorId, container, filePath)
  }

  /** Hat das Plugin für diese editorId einen Read-only-Embed registriert? (Für den Fallback-Chip.) */
  hasEmbed(pluginId: string, editorId: string): boolean {
    const lr = this.loaded.get(pluginId)
    return !!lr && !lr.tearingDown && lr.embedMounts.has(editorId)
  }

  /**
   * Mountet einen Read-only-Embed (R2) in den Host-Container — gleiche Lifecycle-Semantik wie
   * mountEditor (activeMounts-Tracking → Teardown disposed auch Embeds). `null` wenn Plugin nicht
   * geladen ODER kein Embed registriert (Aufrufer zeigt den Fallback-Chip).
   */
  mountEmbed(
    pluginId: string,
    editorId: string,
    container: HTMLElement,
    filePath: string,
  ): (() => void) | null {
    const lr = this.loaded.get(pluginId)
    if (!lr || lr.tearingDown) return null
    const mount = lr.embedMounts.get(editorId)
    if (!mount) return null
    return this.runMount(lr, mount, `embed:${editorId}`, container, filePath)
  }

  /** Gemeinsamer Mount-Kern für Editor + Embed: activeMounts-Tracking + idempotente Dispose-Fassade. */
  private runMount(
    lr: LoadedRenderer,
    mount: FileEditorMount | FileEmbedMount,
    label: string,
    container: HTMLElement,
    filePath: string,
  ): (() => void) | null {
    let raw: () => void = () => {}
    try {
      const d = mount(container, { filePath, host: lr.host })
      if (typeof d === 'function') raw = d
    } catch (err) {
      console.error(`[plugin:${lr.pluginId}] mount('${label}') warf:`, err)
      return null
    }

    const token = {}
    const entry: ActiveMount = { pluginId: lr.pluginId, raw, disposed: false }
    this.activeMounts.set(token, entry)
    // An den Tab zurückgegebene Fassade: idempotent + isolierend. Der rohe `entry.raw` bleibt für
    // teardownEntry klassifizierbar (F26 — der Wurf wird dort NICHT verschluckt, sondern → `error`).
    return (): void => {
      if (entry.disposed) return
      entry.disposed = true
      this.activeMounts.delete(token)
      try {
        entry.raw()
      } catch (err) {
        console.error(`[plugin:${lr.pluginId}] dispose warf:`, err)
      }
    }
  }

  /**
   * Vollständiger Teardown EINES Eintrags (§5.5-Matrix, best-effort). **Reihenfolge matrix-treu (F25):**
   * `module.deactivate()` läuft ZUERST gegen Timeout — VOR jedem irreversiblen Mount-Dispose.
   *   - `timeout` (deactivate hängt): renderer-seitig wird NICHTS entfernt (Mounts, Styles, Blob, Eintrag
   *     bleiben) → fail-closed, restart-required (Main). `tearingDown` bleibt gesetzt; Tombstone `timeout`.
   *   - sonst werden JETZT die Mounts disposed (roher Disposer, KLASSIFIZIERBAR — F26) und Eintrag +
   *     Host-Chrome (Styles, Blob) entfernt. `error` wenn deactivate ODER ein Mount-Disposer warf, sonst
   *     `success`. Bei `error` Tombstone `error` (F22/F27).
   * Benachrichtigt NICHT selbst — der Aufrufer (doSync/teardownInstance) ruft `changed()`.
   */
  private async teardownEntry(lr: LoadedRenderer): Promise<TeardownOutcome> {
    if (lr.tearingDown) return this.tombstones.get(lr.instanceId) ?? 'timeout' // bereits gelaufen → echter Ausgang
    lr.tearingDown = true

    // 1) module.deactivate() ZUERST gegen Timeout — VOR irreversiblem Mount-Dispose (F25).
    let deactivateThrew = false
    let deactivateTimedOut = false
    try {
      const result = lr.module.deactivate?.() // kann sync werfen
      deactivateTimedOut = (await awaitWithTimeout(result, DEACTIVATE_TIMEOUT_MS)) === 'timeout'
    } catch (err) {
      deactivateThrew = true
      console.error(`[plugin:${lr.pluginId}] deactivate warf:`, err)
    }

    if (deactivateTimedOut) {
      // Matrix-treu: NICHTS entfernen (auch keine Mounts). Eintrag bleibt (fail-closed), Tombstone halten.
      this.recordTombstone(lr.instanceId, 'timeout')
      return 'timeout'
    }

    // 2) success|error: JETZT Mounts disposen (roher Disposer, klassifizierbar — F26).
    let mountThrew = false
    for (const [token, m] of [...this.activeMounts]) {
      if (m.pluginId === lr.pluginId && !m.disposed) {
        m.disposed = true
        this.activeMounts.delete(token)
        try {
          m.raw()
        } catch (err) {
          mountThrew = true
          console.error(`[plugin:${lr.pluginId}] mount-dispose warf:`, err)
        }
      }
    }

    const outcome: TeardownOutcome = deactivateThrew || mountThrew ? 'error' : 'success'
    this.loaded.delete(lr.pluginId)
    this.disposeHostResources(lr.pluginId, lr.moduleUrl, lr.themeUnsubs)
    if (outcome === 'error') this.recordTombstone(lr.instanceId, 'error')
    return outcome
  }

  private disposeHostResources(pluginId: string, moduleUrl: string, themeUnsubs: Set<() => void>): void {
    for (const u of themeUnsubs) {
      try {
        u()
      } catch {
        /* best-effort */
      }
    }
    themeUnsubs.clear()
    this.env.removeStyles(pluginId)
    this.env.revokeModuleUrl(moduleUrl)
  }
}
