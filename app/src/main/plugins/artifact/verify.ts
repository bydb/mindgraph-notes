// Plugin-Artefakt-Verifier (A0/3) — der Sicherheitskern. Reine Funktion:
//   verify(archive, { keyring, appVersion, quarantineDir }) → VerifiedPluginPackage
// Entpackt in die Quarantäne, prüft Signatur → Limits/Hashes → Manifest + Kompat-Gates (A0/2) →
// entrypoint-Existenz und gibt das verifizierte Paket zurück. **Installiert NICHT** (atomar erst
// A1/A2). Siehe docs/plugin-artifact-format-plan.md.

import { createHash, verify as cryptoVerify, type KeyObject } from 'node:crypto'
import { createGunzip } from 'node:zlib'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import {
  validateManifest,
  validateManifestSemantics,
  isApiCompatible,
  isAppCompatible,
} from '@mindgraph/plugin-api/validation'
import type { PluginManifest } from '@mindgraph/plugin-api'
import { ARTIFACT_LIMITS, ArtifactError, type ArtifactLimits } from './limits'
import {
  artifactPathError,
  parseUtf8Json,
  validateIntegrityDoc,
  validateSigEnvelope,
  MANIFEST_FILE,
  INTEGRITY_FILE,
  SIG_FILE,
  type IntegrityEntry,
} from './format'

/** Liefert den Public Key (Ed25519, KeyObject) zu einer keyId oder undefined. Per DI injiziert. */
export interface Keyring {
  get(keyId: string): KeyObject | undefined
}

export interface VerifyOptions {
  keyring: Keyring
  /** Laufende App-Version für das App-Kompat-Gate (A0/2). */
  appVersion: string
  /** Zielordner für die verifizierten Dateien (Quarantäne). Wird angelegt. */
  quarantineDir: string
  limits?: ArtifactLimits
}

/** Ergebnis einer erfolgreichen Verifikation — verifiziertes Paket in der Quarantäne (KEIN Install). */
export interface VerifiedPluginPackage {
  id: string
  version: string
  manifest: PluginManifest
  quarantineDir: string
  files: IntegrityEntry[]
}

function perFileCap(path: string, limits: ArtifactLimits): number {
  if (path === SIG_FILE) return limits.maxSigBytes
  if (path === INTEGRITY_FILE) return limits.maxIntegrityBytes
  if (path === MANIFEST_FILE) return limits.maxManifestBytes
  return limits.maxFileBytes
}

/** Streaming-Gunzip mit hartem Byte-Cap (Archive-Bomb-Schutz vor dem tar-Parsen). */
async function gunzipCapped(archive: Buffer, maxOut: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      total += chunk.length
      if (total > maxOut) {
        cb(new ArtifactError('limit-total-size', `Dekomprimierter Inhalt überschreitet ${maxOut} Bytes`))
        return
      }
      chunks.push(chunk)
      cb()
    },
  })
  await pipeline(Readable.from(archive), createGunzip(), sink)
  return Buffer.concat(chunks)
}

/** Parst das (entpackte) Tar in eine Map path→Bytes; nur reguläre Files, alle Limits/Pfadregeln. */
async function extractEntries(plainTar: Buffer, limits: ArtifactLimits): Promise<Map<string, Buffer>> {
  const tar = await import('tar')
  const files = new Map<string, Buffer>()
  let count = 0
  let contentTotal = 0
  let pending: ArtifactError | null = null
  const fail = (e: ArtifactError): void => {
    if (!pending) pending = e
  }

  const parser = new tar.Parser()
  parser.on('entry', (entry) => {
    if (pending) {
      entry.resume()
      return
    }
    if (entry.type !== 'File') {
      fail(new ArtifactError('entry-type', `Eintrag '${entry.path}' ist kein reguläres File (${entry.type})`))
      entry.resume()
      return
    }
    const pErr = artifactPathError(entry.path, limits)
    if (pErr) {
      fail(new ArtifactError('path-invalid', `Eintrag '${entry.path}': ${pErr}`))
      entry.resume()
      return
    }
    if (files.has(entry.path)) {
      fail(new ArtifactError('duplicate-path', `Doppelter Eintrag '${entry.path}'`))
      entry.resume()
      return
    }
    if (++count > limits.maxFiles) {
      fail(new ArtifactError('limit-files', `Mehr als ${limits.maxFiles} Dateien`))
      entry.resume()
      return
    }
    const cap = perFileCap(entry.path, limits)
    const chunks: Buffer[] = []
    let n = 0
    entry.on('data', (d: Buffer) => {
      n += d.length
      contentTotal += d.length
      chunks.push(d)
    })
    entry.on('end', () => {
      if (pending) return
      if (n > cap) {
        fail(new ArtifactError('limit-file-size', `'${entry.path}' überschreitet ${cap} Bytes`))
        return
      }
      if (contentTotal > limits.maxTotalUnpackedBytes) {
        fail(new ArtifactError('limit-total-size', `Gesamtinhalt überschreitet ${limits.maxTotalUnpackedBytes} Bytes`))
        return
      }
      files.set(entry.path, Buffer.concat(chunks))
    })
  })

  await new Promise<void>((res, rej) => {
    parser.on('end', res)
    parser.on('error', rej)
    parser.end(plainTar)
  })
  if (pending) throw pending
  return files
}

function readManifest(files: Map<string, Buffer>): PluginManifest {
  const buf = files.get(MANIFEST_FILE)
  if (!buf) throw new ArtifactError('fileset-mismatch', `'${MANIFEST_FILE}' fehlt im Archiv`)
  const value = parseUtf8Json(buf, 'manifest-invalid', MANIFEST_FILE)
  const shape = validateManifest(value)
  if (!shape.valid) throw new ArtifactError('manifest-invalid', `Ungültiges Manifest: ${shape.errors.join('; ')}`)
  const semantics = validateManifestSemantics(value as PluginManifest)
  if (!semantics.valid) throw new ArtifactError('manifest-invalid', `Ungültiges Manifest: ${semantics.errors.join('; ')}`)
  return value as PluginManifest
}

function assertCompatible(manifest: PluginManifest, appVersion: string): void {
  const api = isApiCompatible(manifest.apiVersion)
  if (!api.compatible) {
    throw new ArtifactError(api.kind === 'incompatible-api' ? 'incompatible-api' : 'manifest-invalid', api.reason ?? 'API inkompatibel')
  }
  const app = isAppCompatible(manifest.minAppVersion, appVersion)
  if (!app.compatible) {
    throw new ArtifactError(app.kind === 'incompatible-app' ? 'incompatible-app' : 'manifest-invalid', app.reason ?? 'App inkompatibel')
  }
}

function assertEntrypointsPresent(manifest: PluginManifest, payload: Set<string>): void {
  for (const key of ['main', 'renderer', 'styles'] as const) {
    const ep = manifest.entrypoints?.[key]
    if (ep && !payload.has(ep)) {
      throw new ArtifactError('entrypoint-missing', `entrypoints.${key} '${ep}' fehlt im Paket`)
    }
  }
}

function writeQuarantine(quarantineDir: string, files: Map<string, Buffer>, entries: IntegrityEntry[]): void {
  const root = resolve(quarantineDir)
  mkdirSync(root, { recursive: true })
  for (const e of entries) {
    const abs = resolve(root, e.path)
    // Defense-in-Depth: Pfade sind bereits streng validiert (kein ..), hier nochmals einsperren.
    if (abs !== root && !abs.startsWith(root + sep)) {
      throw new ArtifactError('path-invalid', `Pfad verlässt die Quarantäne: '${e.path}'`)
    }
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, files.get(e.path)!)
  }
}

/**
 * Verifiziert ein `.mgxplugin`-Archiv vollständig und gibt ein `VerifiedPluginPackage` zurück.
 * Wirft `ArtifactError(code)` bei jedem Verstoß. **Kein Install** — das Verschieben aus der
 * Quarantäne ist A1/A2.
 */
export async function verifyPluginArtifact(archive: Buffer, opts: VerifyOptions): Promise<VerifiedPluginPackage> {
  const limits = opts.limits ?? ARTIFACT_LIMITS
  if (archive.length > limits.maxArchiveBytes) {
    throw new ArtifactError('archive-too-large', `Archiv überschreitet ${limits.maxArchiveBytes} Bytes`)
  }

  // 1) Entpacken (bomb-sicher) → Einträge mit Limits/Pfadregeln.
  const headroom = limits.maxFiles * 1024 + 2 * 512
  const plainTar = await gunzipCapped(archive, limits.maxTotalUnpackedBytes + headroom)
  const files = await extractEntries(plainTar, limits)

  // 2) integrity.json + .sig vorhanden?
  const integrityBytes = files.get(INTEGRITY_FILE)
  const sigBytes = files.get(SIG_FILE)
  if (!integrityBytes) throw new ArtifactError('fileset-mismatch', `'${INTEGRITY_FILE}' fehlt`)
  if (!sigBytes) throw new ArtifactError('fileset-mismatch', `'${SIG_FILE}' fehlt`)

  // 3) Signatur über die EXAKTEN integrity.json-Bytes (Verifier serialisiert nichts neu).
  const sigValue = parseUtf8Json(sigBytes, 'sig-invalid', SIG_FILE)
  const { envelope, signature } = validateSigEnvelope(sigValue)
  const publicKey = opts.keyring.get(envelope.keyId)
  if (!publicKey) throw new ArtifactError('sig-unknown-key', `Unbekannte keyId '${envelope.keyId}'`)
  if (!cryptoVerify(null, integrityBytes, publicKey, signature)) {
    throw new ArtifactError('sig-mismatch', 'Signatur passt nicht zu integrity.json')
  }

  // 4) integrity.json parsen + Dateimenge/Hashes/Größen prüfen.
  const doc = validateIntegrityDoc(parseUtf8Json(integrityBytes, 'integrity-invalid', INTEGRITY_FILE), limits)
  const payloadPaths = new Set([...files.keys()].filter((p) => p !== INTEGRITY_FILE && p !== SIG_FILE))
  const listed = new Set(doc.files.map((f) => f.path))
  for (const p of payloadPaths) {
    if (!listed.has(p)) throw new ArtifactError('fileset-mismatch', `Datei '${p}' nicht in integrity.json gelistet`)
  }
  for (const e of doc.files) {
    const buf = files.get(e.path)
    if (!buf) throw new ArtifactError('fileset-mismatch', `In integrity.json gelistete Datei '${e.path}' fehlt`)
    if (buf.length !== e.size) throw new ArtifactError('size-mismatch', `Größe von '${e.path}' weicht ab`)
    const actual = createHash('sha256').update(buf).digest('hex')
    if (actual !== e.sha256) throw new ArtifactError('hash-mismatch', `Hash von '${e.path}' weicht ab`)
  }

  // 5) Manifest + Kompat-Gates (A0/2) + entrypoint-Existenz — alles noch in Quarantäne.
  const manifest = readManifest(files)
  assertCompatible(manifest, opts.appVersion)
  assertEntrypointsPresent(manifest, payloadPaths)

  // 6) Verifizierte Nutzdateien in die Quarantäne schreiben (KEIN Install).
  writeQuarantine(opts.quarantineDir, files, doc.files)

  return {
    id: manifest.id,
    version: manifest.version,
    manifest,
    quarantineDir: resolve(opts.quarantineDir),
    files: doc.files,
  }
}
