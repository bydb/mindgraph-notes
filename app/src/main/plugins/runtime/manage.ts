// Verwaltungs-Kern für Disk-installierte Plugins (A1 Wiring) — die Brücke zwischen dem reinen
// Install/Discover-Kern und der lebenden PluginRegistry. Reine Logik per Dependency Injection:
// kennt weder electron noch den Dialog, nur eine schmale Registry-Schnittstelle + den Workflow-
// Action-Registrar/-Entferner. So testbar mit echten Artefakten in einem Temp-Store (manage.test.ts).
//
// Drei Operationen:
//   • discoverAndRegisterInstalled — Startup: aktive, re-verifizierte Disk-Plugins als Quellen
//     registrieren (+ ihre workflowActions); Re-Verify-Fehler zurückgeben (UI: Fehlerliste).
//   • installAndActivate — Datei installieren, Kandidaten aktivieren und ERST DANN den
//     Aktivierungsindex committen (ADR). Scheitert die Aktivierung, bleibt der Index auf dem
//     Vorgänger; die vorherige Version wird — wenn die neue sich sauber stoppen ließ — wieder live.
//   • uninstallPlugin — deaktivieren, aus active.json + Workflow-Registry + require-Cache entfernen,
//     Store-Verzeichnis löschen.
import { rmSync } from 'node:fs'
import type { PluginManifest } from '@mindgraph/plugin-api'
import type { PluginRuntimeState } from '../../../shared/plugins/state'
import type { MainPluginSource } from '../registry'
import { findWorkflowActionCollisions } from '../../../shared/workflow/registry'
import { ArtifactError } from '../artifact/limits'
import { installPluginArtifact, setActiveVersion, type InstallEnv, type InstallResult } from './install'
import { discoverInstalledPlugins, discoverVersion, type DiscoverEnv, type DiscoverError } from './discover'
import { pluginPaths } from './paths'
import { assertSafeStoreIdDir } from './safepath'
import { purgeRequireCacheUnder } from './requireCache'

/** Install- und Discover-Env teilen sich exakt diese Felder (pluginsRoot/keyring/appVersion/...). */
export type RuntimeEnv = InstallEnv & DiscoverEnv

/** Schmale Sicht auf die Registry — genau die Methoden, die der Verwaltungs-Kern braucht.
 *  `unregister` WIRFT, wenn das Plugin sich nicht sauber stoppen lässt (Entry bleibt dann erhalten,
 *  für einen späteren Stop-Retry). */
export interface RegistryHandle {
  register(sources: MainPluginSource[]): void
  activate(id: string): Promise<PluginRuntimeState>
  unregister(id: string): Promise<void>
  get(id: string): PluginRuntimeState | undefined
}

export interface ManageDeps {
  env: RuntimeEnv
  registry: RegistryHandle
  /** Spielt die `workflowActions` eines Plugins (Owner = Plugin-Id) in die geteilte Registry ein. */
  registerWorkflowActions: (defs: NonNullable<PluginManifest['workflowActions']>, ownerId: string) => void
  /** Entfernt alle Workflow-Actions eines Plugins wieder (Upgrade-Vorgängerversion / Uninstall). */
  unregisterWorkflowActions: (ownerId: string) => void
  /** Schreibt den Aktivierungsindex (Commit nach Aktivierung / Uninstall). Default = echte
   *  setActiveVersion; injizierbar, um den Commit-Fehlerpfad zu testen. */
  commitActiveVersion?: (pluginsRoot: string, id: string, version: string | null) => void
}

export interface InstallOutcome {
  id: string
  version: string
  /** true = war bereits byte-identisch installiert (nur (re)aktiviert). */
  idempotent: boolean
  state: PluginRuntimeState
}

/**
 * Signalisiert: eine Aktivierung scheiterte UND die gescheiterte (evtl. mit laufenden Timern
 * leakende) Version ließ sich nicht stoppen. Die Vorgängerversion wird NICHT in-Process reaktiviert
 * (sonst liefen zwei Versionen gleichzeitig) — der persistente Index zeigt weiter auf den Vorgänger,
 * der beim nächsten App-Start sauber geladen wird. Die UI soll „Neustart erforderlich" melden.
 */
export class PluginRestartRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginRestartRequiredError'
  }
}

/** Registriert eine entdeckte Quelle samt ihrer Workflow-Bausteine (Owner = manifest.id). */
function registerSource(deps: ManageDeps, source: MainPluginSource): void {
  deps.registry.register([source])
  if (source.manifest.workflowActions?.length) {
    deps.registerWorkflowActions(source.manifest.workflowActions, source.manifest.id)
  }
}

/**
 * Startup: entdeckt alle aktiven, re-verifizierten Disk-Plugins und registriert sie als Quellen.
 * Die eigentliche Aktivierung übernimmt der gemeinsame `activateAll`-Pfad (respektiert den
 * Modulschalter). Gibt die Re-Verify-/Kollisions-Fehler für die Verwaltungs-UI zurück.
 *
 * Workflow-Action-Kollision (z.B. eine durch ein App-Update neu hinzugekommene Kern-ID, die mit
 * einer bereits installierten Plugin-Action kollidiert) wird HIER GENAUSO terminal behandelt wie
 * beim Install: das Plugin wird NICHT registriert (kein still-degradierter Vertrag) und als
 * Discover-Fehler gemeldet. Sequentiell registrieren, damit eine Kollision zwischen zwei Disk-
 * Plugins gegen den bereits registrierten Stand geprüft wird.
 */
export function discoverAndRegisterInstalled(deps: ManageDeps): DiscoverError[] {
  const { sources, errors } = discoverInstalledPlugins(deps.env)
  const allErrors = [...errors]
  for (const source of sources) {
    const collision = workflowCollisionError(source)
    if (collision) {
      allErrors.push(collision)
      continue // NICHT registrieren — kein Plugin mit teilweise registriertem Vertrag
    }
    registerSource(deps, source)
  }
  return allErrors
}

/**
 * Read-only: ALLE aktuellen Discover-Fehler einer Installation — Re-Verify-/Kollisions-Fehler aus
 * {@link discoverInstalledPlugins} PLUS `workflow-collision` (gegen den LIVE registrierten Stand).
 * Für die Verwaltungs-UI, damit auch beim Startup entstandene Kollisionen erscheinen (nicht nur die
 * reinen Artefaktfehler). Keine Registrierung/Seiteneffekte.
 */
export function computeInstalledErrors(env: RuntimeEnv): DiscoverError[] {
  const { sources, errors } = discoverInstalledPlugins(env)
  const out = [...errors]
  for (const source of sources) {
    const collision = workflowCollisionError(source)
    if (collision) out.push(collision)
  }
  return out
}

/** `workflow-collision`-Discover-Fehler für eine Quelle, falls ihre Workflow-Actions kollidieren. */
function workflowCollisionError(source: MainPluginSource): DiscoverError | null {
  const collisions = source.manifest.workflowActions?.length
    ? findWorkflowActionCollisions(source.manifest.workflowActions, source.manifest.id)
    : []
  if (!collisions.length) return null
  return {
    id: source.manifest.id,
    version: source.manifest.version ?? '?',
    code: 'workflow-collision',
    message: `Kollidierende Workflow-Action-IDs (mit Kern-/anderen Plugins): ${collisions.join(', ')}`,
  }
}

/**
 * Re-discovert die aktuell in `active.json` hinterlegte Version von `id` und bringt sie wieder live
 * (register + activate) — für die Wiederherstellung der Vorgängerversion, nachdem eine neue Version
 * SAUBER (vollständig gestoppt) entfernt wurde. No-op, wenn keine aktive Version (mehr) existiert.
 * Wirft NICHT (best-effort). Voraussetzung des Aufrufers: der Slot ist frei (kein hängender Entry).
 */
async function restoreActiveVersion(deps: ManageDeps, id: string): Promise<void> {
  try {
    const source = discoverInstalledPlugins(deps.env).sources.find((s) => s.manifest.id === id)
    if (!source) return // keine Vorgängerversion aktiv → nichts wiederherzustellen
    registerSource(deps, source)
    const state = await deps.registry.activate(id)
    if (state.activation !== 'active') {
      console.error(
        `[plugin] Wiederherstellung der Vorgängerversion '${id}' fehlgeschlagen: ${state.error?.message ?? state.activation}`
      )
    }
  } catch (err) {
    console.error(`[plugin] Wiederherstellung von '${id}' warf: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Installiert ein `.mgxplugin`-Archiv und schaltet es live aktiv. Reihenfolge (ADR-konform —
 * Index-Commit ZULETZT):
 *   1) materialisieren + re-verifizieren (installPluginArtifact; active.json bleibt auf Vorgänger)
 *   2) den frisch materialisierten KANDIDATEN direkt re-discovern (discoverVersion, nicht via Index)
 *   3) Workflow-Action-Kollisionen prüfen → bei Konflikt TERMINAL ablehnen (kein still-degradiertes
 *      Plugin mit nur teilweise registriertem Manifest-Vertrag)
 *   4) Upgrade: laufende Vorgängerversion sauber stoppen + entfernen; stop-Fehler → Upgrade abbrechen
 *   5) Kandidat registrieren + aktivieren. Erfolg → JETZT erst `setActiveVersion` (Commit).
 *      Aktivierungsfehler: neue Version sauber entfernen + Vorgänger live zurück; lässt sie sich
 *      NICHT stoppen (Doppelfehler) → Vorgänger NICHT reaktivieren, `PluginRestartRequiredError`.
 * Wirft `ArtifactError` (verify/Kollision/Konflikt) oder Error (stop/Aktivierung/Discovery/Kollision).
 */
export async function installAndActivate(deps: ManageDeps, archive: Buffer): Promise<InstallOutcome> {
  const result = await installPluginArtifact(archive, deps.env) // materialisiert NUR; Index unverändert

  // Kandidatenversion DIREKT entdecken (active.json zeigt noch auf den Vorgänger).
  const { source, error } = discoverVersion(deps.env, result.id, result.version)
  if (!source) {
    // Registry noch nicht angefasst, evtl. laufende Vorgängerversion unberührt. Nur den frisch
    // materialisierten Ordner entfernen — der Index wurde nie umgeschaltet.
    cleanupFreshVersion(result)
    throw new Error(error?.message ?? `Installiertes Plugin '${result.id}' ließ sich nicht verifizieren`)
  }

  // Vertrags-Integrität: kollidierende Workflow-Action-IDs (mit Kern- oder fremden Plugin-Actions)
  // sind ein TERMINALER Vertragsbruch — nicht still überspringen, sondern Aktivierung ablehnen.
  const collisions = source.manifest.workflowActions?.length
    ? findWorkflowActionCollisions(source.manifest.workflowActions, source.manifest.id)
    : []
  if (collisions.length) {
    cleanupFreshVersion(result)
    throw new ArtifactError(
      'workflow-collision',
      `Plugin '${result.id}' deklariert kollidierende Workflow-Action-IDs (mit Kern-/anderen Plugins): ${collisions.join(', ')}`
    )
  }

  // Upgrade/Reinstall: die noch laufende Vorgängerversion sauber stoppen + entfernen, BEVOR die neue
  // startet. unregister() wirft, wenn stop() fehlschlägt → Upgrade abbrechen, Vorgänger bleibt aktiv.
  if (deps.registry.get(result.id)) {
    try {
      await deps.registry.unregister(result.id)
    } catch (stopErr) {
      cleanupFreshVersion(result) // Index zeigt weiter auf den (laufenden) Vorgänger → kein Rollback nötig
      throw new Error(
        `Upgrade von '${result.id}' abgebrochen: vorherige Version ließ sich nicht stoppen (${stopErr instanceof Error ? stopErr.message : String(stopErr)})`
      )
    }
    deps.unregisterWorkflowActions(result.id) // Workflow-Actions der alten Version entfernen
  }

  registerSource(deps, source)
  const state = await deps.registry.activate(result.id)
  if (state.activation !== 'active') {
    await rollbackStartedVersion(deps, result, state.error?.message ?? `Aktivierung von '${result.id}' fehlgeschlagen`)
  }

  // ERFOLG → JETZT erst den Aktivierungsindex committen (letzter Schritt, ADR-konform). Scheitert
  // der Commit (I/O/Permissions/Disk-voll), läuft die neue Version zwar bereits, ist aber NICHT
  // persistiert → Live- und Disk-Zustand liefen auseinander. Darum derselbe Recovery-Pfad wie bei
  // einem Aktivierungsfehler (neue Version sauber stoppen + Vorgänger zurück, sonst Neustart).
  try {
    commitIndex(deps, result.id, result.version)
  } catch (commitErr) {
    await rollbackStartedVersion(
      deps,
      result,
      `Index-Commit für '${result.id}' fehlgeschlagen: ${commitErr instanceof Error ? commitErr.message : String(commitErr)}`
    )
  }
  return { id: result.id, version: result.version, idempotent: result.idempotent, state }
}

/**
 * Rollt eine bereits GESTARTETE (oder im Aktivierungs-/Commit-Schritt gescheiterte) neue Version
 * zurück. Versucht sie SAUBER zu stoppen:
 *   • gelingt der Stop → Versionsordner entfernen und die Vorgängerversion wieder live; wirft `Error`.
 *   • scheitert der Stop (Doppelfehler) → Entry BLEIBT (für Stop-Retry) und der Versionsordner BLEIBT
 *     (der evtl. weiterlaufende Entry greift darauf zu); Vorgänger NICHT reaktivieren (sonst zwei
 *     Versionen gleichzeitig); wirft `PluginRestartRequiredError`. Der dormante Ordner bleibt als
 *     inaktive Version liegen (Mehrversions-Design); sicheres GC erst später via Tombstones. Wirft IMMER.
 */
async function rollbackStartedVersion(deps: ManageDeps, result: InstallResult, failure: string): Promise<never> {
  let cleanlyStopped = true
  try {
    await deps.registry.unregister(result.id)
  } catch {
    cleanlyStopped = false
  }
  deps.unregisterWorkflowActions(result.id)
  if (!cleanlyStopped) {
    throw new PluginRestartRequiredError(
      `${failure} und die neue Version ließ sich nicht stoppen — Neustart erforderlich, damit die vorherige Version wieder geladen wird`
    )
  }
  cleanupFreshVersion(result) // nur nach sauberem Stop — sonst greift der laufende Entry evtl. noch zu
  await restoreActiveVersion(deps, result.id)
  throw new Error(failure)
}

/**
 * Deinstalliert ein Disk-Plugin: aus der Registry nehmen (sauber stoppen), seine Workflow-Actions
 * entfernen, aus active.json austragen, den require-Cache leeren und das Store-Verzeichnis
 * `store/<id>/` (alle Versionen) löschen. `id` wird als sicheres Pfadsegment validiert.
 *
 * Lässt sich das Plugin NICHT stoppen (unregister wirft), bricht der Uninstall ab und Registry,
 * Index UND Dateien bleiben vollständig unverändert — es werden keine Dateien unter einem noch
 * laufenden Plugin gelöscht.
 *
 * Scheitert der Index-Commit (active.json-Austrag), wurde das Plugin zwar schon gestoppt + aus der
 * Registry entfernt, der Index behauptet aber weiter „aktiv" → die noch persistierte aktive Version
 * wird wieder registriert + aktiviert (Live-/Disk-Zustand zusammenführen), und der Uninstall wirft.
 */
export async function uninstallPlugin(deps: ManageDeps, id: string): Promise<void> {
  // Erst die ID als sicheres Pfadsegment prüfen (fail-fast, bevor irgendetwas mutiert wird).
  const idDir = assertSafeStoreIdDir(pluginPaths(deps.env.pluginsRoot).storeDir, id)
  await deps.registry.unregister(id) // wirft bei stop-Fehler → Uninstall bricht ab, nichts mutiert
  deps.unregisterWorkflowActions(id)
  try {
    commitIndex(deps, id, null)
  } catch (commitErr) {
    // active.json sagt weiterhin „aktiv": die noch persistierte Version wieder live bringen.
    await restoreActiveVersion(deps, id)
    throw new Error(
      `Uninstall von '${id}' fehlgeschlagen (Index-Commit): ${commitErr instanceof Error ? commitErr.message : String(commitErr)}`
    )
  }
  purgeRequireCacheUnder(idDir) // VOR dem Löschen: Entry aus Nodes require-Cache (realpath) entfernen
  rmSync(idDir, { recursive: true, force: true })
}

/** Schreibt den Aktivierungsindex über den (testbar) injizierbaren Writer (Default: echte setActiveVersion). */
function commitIndex(deps: ManageDeps, id: string, version: string | null): void {
  ;(deps.commitActiveVersion ?? setActiveVersion)(deps.env.pluginsRoot, id, version)
}

/**
 * Entfernt den FRISCH materialisierten neuen Versionsordner nach einem fehlgeschlagenen Install/
 * Upgrade — sonst bliebe er als Waise liegen und ein später korrigiertes, gleichnamiges Artefakt
 * würde dauerhaft mit `version-conflict` abgelehnt. NUR bei frisch materialisierter Version
 * (`!idempotent`); eine idempotent wiederverwendete (vorbestehende, evtl. noch aktive) Version wird
 * NIE angefasst.
 */
function cleanupFreshVersion(result: InstallResult): void {
  if (result.idempotent) return
  try {
    rmSync(result.versionDir, { recursive: true, force: true })
  } catch (err) {
    console.error(
      `[plugin] Aufräumen des Versionsordners '${result.versionDir}' warf: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}
