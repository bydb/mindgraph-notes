// Disk-Discovery (A1): liest active.json, re-verifiziert NUR die aktive Version je Plugin
// (fail-closed) und baut MainPluginSource-Einträge für die Registry. Re-Verify-Fehler/Kollisionen
// werden NICHT als Quelle ausgegeben, sondern als Fehler gemeldet (UI: error/unavailable).
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { PluginMainEntry } from '@mindgraph/plugin-api'
import type { MainPluginSource } from '../registry'
import { verifyInstalledDir, type Keyring } from '../artifact/verify'
import { ArtifactError, type ArtifactErrorCode, type ArtifactLimits } from '../artifact/limits'
import { pluginPaths, versionDir } from './paths'
import { readActiveIndex } from './activeIndex'

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

/** Entdeckt installierte (aktive, re-verifizierte) Plugins als Registry-Quellen. */
export function discoverInstalledPlugins(env: DiscoverEnv): DiscoverResult {
  const paths = pluginPaths(env.pluginsRoot)
  const index = readActiveIndex(paths.activeIndexPath)
  const sources: MainPluginSource[] = []
  const errors: DiscoverError[] = []

  for (const [id, version] of Object.entries(index.active)) {
    const dir = versionDir(paths, id, version)
    try {
      if (env.blockedIds.has(id)) {
        throw new ArtifactError('id-collision', `'${id}' kollidiert mit einem gebündelten/reservierten Plugin`)
      }
      if (!existsSync(dir)) {
        throw new ArtifactError('fileset-mismatch', `Aktive Version '${id}@${version}' fehlt auf der Platte`)
      }
      // Fail-closed Re-Verify: Hash/Signatur/Manifest/Gates/entrypoints des Install-Verzeichnisses.
      const { manifest } = verifyInstalledDir(dir, {
        keyring: env.keyring,
        appVersion: env.appVersion,
        limits: env.limits,
      })
      if (manifest.id !== id) {
        throw new ArtifactError('manifest-invalid', `Manifest-ID '${manifest.id}' ≠ Index-ID '${id}'`)
      }
      sources.push({
        manifest,
        loadEntry: async () => {
          const req = createRequire(join(dir, '__loader.cjs'))
          const mod = req(join(dir, 'main.js')) as { default?: PluginMainEntry }
          return (mod.default ?? (mod as unknown as PluginMainEntry))
        },
      })
    } catch (e) {
      const err = e instanceof ArtifactError ? e : new ArtifactError('load-failed', (e as Error).message)
      errors.push({ id, version, code: err.code, message: err.message })
    }
  }

  return { sources, errors }
}
