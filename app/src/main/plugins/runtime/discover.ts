// Disk-Discovery (A1): liest active.json, validiert die (UNTRUSTED) Indexwerte, re-verifiziert NUR
// die aktive Version je Plugin (fail-closed) und baut MainPluginSource-Einträge. Re-Verify-Fehler,
// ID-Kollisionen und Renderer-only-Manifeste → kein Source, Fehler gemeldet (UI: error/unavailable).
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { PluginMainEntry } from '@mindgraph/plugin-api'
import type { MainPluginSource } from '../registry'
import { verifyInstalledDir, type Keyring } from '../artifact/verify'
import { ArtifactError, type ArtifactErrorCode, type ArtifactLimits } from '../artifact/limits'
import { pluginPaths } from './paths'
import { assertSafeStoreVersionDir } from './safepath'
import { readActiveIndex } from './activeIndex'
import { purgeRequireCacheUnder } from './requireCache'

export interface DiscoverEnv {
  pluginsRoot: string
  keyring: Keyring
  appVersion: string
  /** Gebündelte + reservierte IDs; eine kollidierende Disk-ID wird verworfen (gebündelt gewinnt). */
  blockedIds: Set<string>
  limits?: ArtifactLimits
}

export interface DiscoverError {
  id: string
  version: string
  code: ArtifactErrorCode
  message: string
}

export interface DiscoverResult {
  sources: MainPluginSource[]
  errors: DiscoverError[]
}

/**
 * Re-verifiziert eine BESTIMMTE `(id, version)` im Store und baut daraus eine Registry-Quelle —
 * unabhängig von active.json. Für den Install-Pfad: den frisch materialisierten Kandidaten
 * entdecken + aktivieren, BEVOR der Aktivierungsindex committet wird. Liefert `{ source }` ODER
 * `{ error }` (fail-closed; wirft nicht).
 */
export function discoverVersion(
  env: DiscoverEnv,
  id: string,
  version: string
): { source?: MainPluginSource; error?: DiscoverError } {
  try {
    if (env.blockedIds.has(id)) {
      throw new ArtifactError('id-collision', `'${id}' kollidiert mit einem gebündelten/reservierten Plugin`)
    }
    // UNTRUSTED Werte strikt validieren + symlink-/traversal-sicheren Zielpfad bilden.
    const dir = assertSafeStoreVersionDir(pluginPaths(env.pluginsRoot).storeDir, id, version)
    if (!existsSync(dir)) {
      throw new ArtifactError('fileset-mismatch', `Version '${id}@${version}' fehlt auf der Platte`)
    }
    // Fail-closed Re-Verify (Hash/Signatur/Manifest/Gates/entrypoints) des Install-Verzeichnisses.
    const { manifest } = verifyInstalledDir(dir, {
      keyring: env.keyring,
      appVersion: env.appVersion,
      limits: env.limits,
    })
    if (manifest.id !== id) {
      throw new ArtifactError('manifest-invalid', `Manifest-ID '${manifest.id}' ≠ '${id}'`)
    }
    // Renderer-Plugin-Host (ADR plugin-renderer-host §5.1): gültig mit main ODER renderer.
    // Ein main-Entry liefert eine lazy `loadEntry` (require); renderer-only kommt OHNE loadEntry
    // durch (Manifest + ui.fileEditors sichtbar) — die Renderer-Aktivierung läuft über den
    // Renderer-Pfad (plugin:rendererEntry), nicht über require().
    const mainEntry = manifest.entrypoints?.main
    const rendererEntry = manifest.entrypoints?.renderer
    if (!mainEntry && !rendererEntry) {
      throw new ArtifactError('entrypoint-unsupported', `'${id}' hat weder main- noch renderer-Entrypoint`)
    }
    const source: MainPluginSource = { manifest }
    if (mainEntry) {
      // Den verifizierten Manifest-Entrypoint laden (NICHT hartcodiert 'main.js').
      const mainAbs = join(dir, mainEntry)
      source.loadEntry = async () => {
        // Frisch von der Platte laden: einen evtl. veralteten Cache-Teilbaum dieses Versions-
        // ordners (Uninstall/Reinstall gleicher Pfad, Re-Aktivierung) vorher leeren.
        purgeRequireCacheUnder(dir)
        const req = createRequire(join(dir, '__loader.cjs'))
        const mod = req(mainAbs) as { default?: PluginMainEntry }
        return mod.default ?? (mod as unknown as PluginMainEntry)
      }
    }
    return { source }
  } catch (e) {
    const err = e instanceof ArtifactError ? e : new ArtifactError('load-failed', (e as Error).message)
    return { error: { id, version, code: err.code, message: err.message } }
  }
}

/** Entdeckt installierte (aktive, re-verifizierte) Plugins als Registry-Quellen — je aktive Version
 *  aus active.json über {@link discoverVersion}. Für den Startup-/Verwaltungs-Pfad. */
export function discoverInstalledPlugins(env: DiscoverEnv): DiscoverResult {
  const index = readActiveIndex(pluginPaths(env.pluginsRoot).activeIndexPath)
  const sources: MainPluginSource[] = []
  const errors: DiscoverError[] = []
  for (const [id, version] of Object.entries(index.active)) {
    const { source, error } = discoverVersion(env, id, version)
    if (source) sources.push(source)
    if (error) errors.push(error)
  }
  return { sources, errors }
}
