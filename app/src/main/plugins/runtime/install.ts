// Atomare Plugin-Installation (A1): verify → Kollisions-/Idempotenz-/Conflict-Prüfung → atomar
// materialisieren → Re-Verify (KEINE Code-Ausführung) → Version atomar aktiv schalten. Rollback
// lässt nie ein Teil-Install zurück; die vorherige aktive Version bleibt erhalten.
//
// WICHTIG (P1.3): Hier wird `main.js` NICHT geladen/ausgeführt. Das Laden des Entry passiert
// ausschließlich im Registry-Aktivierungspfad; scheitert es dort, rollt der Aufrufer `active.json`
// über `previousVersion` auf den Vorgänger zurück.
import { existsSync, mkdirSync, lstatSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { verifyPluginArtifact, verifyInstalledDir, type Keyring } from '../artifact/verify'
import { ArtifactError, type ArtifactLimits } from '../artifact/limits'
import { INTEGRITY_FILE, SIG_FILE } from '../artifact/format'
import { pluginPaths } from './paths'
import { assertSafeStoreVersionDir } from './safepath'
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
  /** true = `id@version` war bereits byte-identisch + verifizierbar installiert. */
  idempotent: boolean
  /** Vorher aktive Version dieser ID (für Rollback durch den Aufrufer); undefined = war nicht aktiv. */
  previousVersion?: string
}

const token = (): string => randomBytes(8).toString('hex')

/** Setzt die aktive Version einer ID atomar (oder entfernt sie bei `null`). Für Install + Rollback. */
export function setActiveVersion(pluginsRoot: string, id: string, version: string | null): void {
  const paths = pluginPaths(pluginsRoot)
  const idx = readActiveIndex(paths.activeIndexPath)
  if (version === null) delete idx.active[id]
  else idx.active[id] = version
  writeActiveIndexAtomic(paths.activeIndexPath, idx)
}

/**
 * Installiert ein `.mgxplugin`-Archiv. Verifiziert in die Quarantäne, prüft ID-Kollision +
 * Idempotenz/Conflict, materialisiert atomar, re-verifiziert (ohne Ausführung) und schaltet die
 * gewünschte Version atomar aktiv. Wirft `ArtifactError`.
 */
export async function installPluginArtifact(archive: Buffer, env: InstallEnv): Promise<InstallResult> {
  const paths = pluginPaths(env.pluginsRoot)
  const quarantineDir = join(paths.quarantineRoot, token())

  // 1) Verifizieren in die Quarantäne (vollständiges, re-verifizierbares Verzeichnis).
  let id: string
  let version: string
  let mainEntry: string | undefined
  try {
    const verified = await verifyPluginArtifact(archive, {
      keyring: env.keyring,
      appVersion: env.appVersion,
      quarantineDir,
      limits: env.limits,
    })
    id = verified.id
    version = verified.version
    mainEntry = verified.manifest.entrypoints?.main
  } catch (e) {
    rmSync(quarantineDir, { recursive: true, force: true })
    throw e
  }

  try {
    // 2) Kern-Integrität: gebündelte/reservierte IDs nie überschreiben.
    if (env.blockedIds.has(id)) {
      throw new ArtifactError('id-collision', `Plugin-ID '${id}' ist reserviert/gebündelt und kann nicht installiert werden`)
    }
    // 3) Main-only-Loader: ein Manifest ohne main-Entrypoint (z.B. Renderer-only) wird abgelehnt.
    if (!mainEntry) {
      throw new ArtifactError('entrypoint-unsupported', `'${id}' hat keinen main-Entrypoint (Renderer-only wird in A1 nicht unterstützt)`)
    }
    // 4) Symlink-/Traversal-sicherer Zielpfad (id/version aus dem verifizierten Manifest).
    const target = assertSafeStoreVersionDir(paths.storeDir, id, version)
    const previousVersion = readActiveIndex(paths.activeIndexPath).active[id]

    // 5) Bereits installiert? Vollständig re-verifizieren + integrity.json UND .sig byte-vergleichen.
    if (existsSync(target)) {
      try {
        verifyInstalledDir(target, { keyring: env.keyring, appVersion: env.appVersion, limits: env.limits })
      } catch {
        throw new ArtifactError('version-conflict', `'${id}@${version}' existiert, ist aber nicht (mehr) verifizierbar`)
      }
      const sameIntegrity = readFileSync(join(target, INTEGRITY_FILE)).equals(readFileSync(join(quarantineDir, INTEGRITY_FILE)))
      const sameSig = readFileSync(join(target, SIG_FILE)).equals(readFileSync(join(quarantineDir, SIG_FILE)))
      if (!sameIntegrity || !sameSig) {
        throw new ArtifactError('version-conflict', `'${id}@${version}' existiert bereits mit abweichendem Inhalt`)
      }
      // Identisch + verifiziert → gewünschte Version atomar aktiv schalten (auch wenn vorher inaktiv).
      setActiveVersion(env.pluginsRoot, id, version)
      return { id, version, versionDir: target, idempotent: true, previousVersion }
    }

    // 6) Frisch: atomar materialisieren (Quarantäne → store/<id>/<version>.tmp → rename).
    mkdirSync(join(paths.storeDir, id), { recursive: true })
    if (lstatSync(join(paths.storeDir, id)).isSymbolicLink()) {
      throw new ArtifactError('path-invalid', `Symlink im Store-Pfad nicht erlaubt: '${join(paths.storeDir, id)}'`)
    }
    const tmp = `${target}.tmp-${token()}`
    renameSync(quarantineDir, tmp)
    try {
      renameSync(tmp, target)
    } catch (e) {
      rmSync(tmp, { recursive: true, force: true })
      throw e
    }

    // 7) Re-Verify der materialisierten Version (KEINE Ausführung); dann atomar aktiv schalten.
    try {
      verifyInstalledDir(target, { keyring: env.keyring, appVersion: env.appVersion, limits: env.limits })
    } catch (e) {
      rmSync(target, { recursive: true, force: true }) // nie aktiviert → kein Teil-Install
      throw e
    }
    setActiveVersion(env.pluginsRoot, id, version)
    return { id, version, versionDir: target, idempotent: false, previousVersion }
  } finally {
    rmSync(quarantineDir, { recursive: true, force: true })
  }
}
