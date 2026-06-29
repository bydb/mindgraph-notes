// Atomare Plugin-Installation (A1): verify → Kollisions-/Idempotenz-Prüfung → atomar materialisieren
// → Re-Verify + Load → erst dann aktiv schalten. Rollback lässt nie ein Teil-Install zurück.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type { PluginMainEntry } from '@mindgraph/plugin-api'
import { verifyPluginArtifact, verifyInstalledDir, type Keyring } from '../artifact/verify'
import { ArtifactError, type ArtifactLimits } from '../artifact/limits'
import { INTEGRITY_FILE } from '../artifact/format'
import { pluginPaths, versionDir } from './paths'
import { readActiveIndex, writeActiveIndexAtomic } from './activeIndex'

export interface InstallEnv {
  pluginsRoot: string
  keyring: Keyring
  appVersion: string
  /** Gebündelte + reservierte IDs, die nie überschrieben werden dürfen. */
  blockedIds: Set<string>
  limits?: ArtifactLimits
}

export interface InstallResult {
  id: string
  version: string
  versionDir: string
  /** true = `id@version` war bereits byte-identisch installiert (kein erneutes Materialisieren). */
  idempotent: boolean
}

const token = (): string => randomBytes(8).toString('hex')

/** Lädt main.js als CommonJS und prüft die ABI (PluginMainEntry mit passender id). Wirft load-failed. */
function loadEntrySmoke(dir: string, id: string): void {
  const req = createRequire(join(dir, '__loader.cjs'))
  let mod: unknown
  try {
    mod = req(join(dir, 'main.js'))
  } catch (e) {
    throw new ArtifactError('load-failed', `main.js konnte nicht geladen werden: ${(e as Error).message}`)
  }
  const entry = ((mod as { default?: PluginMainEntry }).default ?? mod) as PluginMainEntry
  if (!entry || typeof entry.register !== 'function' || entry.id !== id) {
    throw new ArtifactError('load-failed', `main.js exportiert keinen passenden PluginMainEntry (erwartet id '${id}')`)
  }
}

/**
 * Installiert ein `.mgxplugin`-Archiv. Schritte: verifizieren (Quarantäne) → ID-Kollision +
 * Idempotenz/Version-Conflict → atomar nach store/<id>/<version> → Re-Verify + Load → `active.json`
 * atomar auf die neue Version. Vorherige aktive Version bleibt für Rollback. Wirft `ArtifactError`.
 */
export async function installPluginArtifact(archive: Buffer, env: InstallEnv): Promise<InstallResult> {
  const paths = pluginPaths(env.pluginsRoot)
  const quarantineDir = join(paths.quarantineRoot, token())

  // 1) Verifizieren in die Quarantäne (vollständiges, re-verifizierbares Verzeichnis).
  let id: string
  let version: string
  try {
    const verified = await verifyPluginArtifact(archive, {
      keyring: env.keyring,
      appVersion: env.appVersion,
      quarantineDir,
      limits: env.limits,
    })
    id = verified.id
    version = verified.version
  } catch (e) {
    rmSync(quarantineDir, { recursive: true, force: true })
    throw e
  }

  try {
    // 2) Kern-Integrität: gebündelte/reservierte IDs nie überschreiben.
    if (env.blockedIds.has(id)) {
      throw new ArtifactError('id-collision', `Plugin-ID '${id}' ist reserviert/gebündelt und kann nicht installiert werden`)
    }
    // Defensive Pfadsegment-Prüfung (id/version stammen aus dem verifizierten Manifest, aber der
    // Pfadbau wird hier zusätzlich abgesichert).
    if (/[\\/]/.test(id) || /[\\/]/.test(version) || version.includes('..')) {
      throw new ArtifactError('path-invalid', `Unsichere id/version für den Pfadbau ('${id}'/'${version}')`)
    }

    const target = versionDir(paths, id, version)

    // 3) Idempotenz: bereits installiert → nur byte-identisch ok, sonst version-conflict.
    if (existsSync(target)) {
      const existing = readFileSync(join(target, INTEGRITY_FILE))
      const incoming = readFileSync(join(quarantineDir, INTEGRITY_FILE))
      if (existing.equals(incoming)) {
        return { id, version, versionDir: target, idempotent: true }
      }
      throw new ArtifactError('version-conflict', `'${id}@${version}' existiert bereits mit abweichendem Inhalt`)
    }

    // 4) Atomar materialisieren: Quarantäne → store/<id>/<version>.tmp → rename auf den finalen Pfad.
    mkdirSync(join(paths.storeDir, id), { recursive: true })
    const tmp = `${target}.tmp-${token()}`
    renameSync(quarantineDir, tmp)
    try {
      renameSync(tmp, target)
    } catch (e) {
      rmSync(tmp, { recursive: true, force: true })
      throw e
    }

    // 5) Re-Verify + Load der materialisierten Version; erst dann aktiv schalten.
    try {
      verifyInstalledDir(target, { keyring: env.keyring, appVersion: env.appVersion, limits: env.limits })
      loadEntrySmoke(target, id)
    } catch (e) {
      rmSync(target, { recursive: true, force: true }) // nie aktiviert → kein Teil-Install
      throw e
    }

    const idx = readActiveIndex(paths.activeIndexPath)
    idx.active[id] = version
    writeActiveIndexAtomic(paths.activeIndexPath, idx)
    return { id, version, versionDir: target, idempotent: false }
  } finally {
    // Quarantäne in jedem Fall aufräumen (nach erfolgreichem rename bereits weg → force ignoriert).
    rmSync(quarantineDir, { recursive: true, force: true })
  }
}
