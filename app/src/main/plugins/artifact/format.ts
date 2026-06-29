// Reine Format-/Normalisierungs-Logik des Plugin-Artefakts (A0/3) — KEIN I/O, keine Krypto.
// Single-Source der Regeln, die Writer (Packer) und Verifier identisch anwenden MÜSSEN:
// kanonische JSON-Bytes, Pfad-Normalisierung, integrity.json- und .sig-Form.
// Siehe docs/plugin-artifact-format-plan.md.

import { ArtifactError, type ArtifactErrorCode, type ArtifactLimits, ARTIFACT_LIMITS } from './limits'

// — Kanonische JSON-Bytes (verbindlich für manifest.json, integrity.json, .sig) —

/** `JSON.stringify(value, null, 2) + '\n'` — UTF-8/LF/kein BOM/feste Feldreihenfolge. */
export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

/** Kanonische UTF-8-Bytes eines Werts (das, was gehasht/signiert wird). */
export function canonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(canonicalJsonString(value), 'utf8')
}

/** Parst UTF-8-JSON streng: kein BOM, gültiges JSON. Wirft `ArtifactError(code)` bei Verstoß. */
export function parseUtf8Json(buf: Buffer, code: ArtifactErrorCode, what: string): unknown {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    throw new ArtifactError(code, `${what}: UTF-8-BOM nicht erlaubt`)
  }
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    throw new ArtifactError(code, `${what}: kein gültiges JSON`)
  }
}

// — Pfad-Normalisierung (Archiv-Einträge UND integrity.files[].path, identische Regel) —

/**
 * Gibt einen Fehlertext zurück, wenn der Pfad die strengen Artefakt-Regeln verletzt, sonst null:
 * lowercase ASCII POSIX (`a–z 0–9 . _ - /`), relativ, kein `./`, kein `..`/`.`-Segment, kein
 * absoluter Pfad, kein Backslash; Länge/Tiefe/Segment-Bytes innerhalb der Limits.
 */
export function artifactPathError(p: unknown, limits: ArtifactLimits = ARTIFACT_LIMITS): string | null {
  if (typeof p !== 'string' || p.length === 0) return 'leerer Pfad'
  if (p.length > limits.maxPathLength) return `Pfad länger als ${limits.maxPathLength} Zeichen`
  if (p.includes('\\')) return 'Backslash nicht erlaubt'
  if (p.startsWith('/')) return 'absoluter Pfad nicht erlaubt'
  if (/[A-Z]/.test(p)) return 'Großbuchstaben nicht erlaubt (nur lowercase ASCII)'
  if (!/^[a-z0-9._/-]+$/.test(p)) return 'unerlaubte Zeichen (nur a–z 0–9 . _ - /)'
  if (p.startsWith('./')) return "führendes './' nicht erlaubt"
  const segs = p.split('/')
  if (segs.length > limits.maxPathDepth) return `Pfadtiefe größer als ${limits.maxPathDepth}`
  for (const s of segs) {
    if (s.length === 0) return 'leeres Pfadsegment (// oder Slash am Ende)'
    if (s === '.' || s === '..') return `'${s}'-Segment nicht erlaubt`
    // Nur ASCII erlaubt → byteLength == length; explizit als Bytes geprüft (USTAR-Namensfeld).
    if (Buffer.byteLength(s, 'utf8') > limits.maxSegmentBytes) {
      return `Pfadsegment länger als ${limits.maxSegmentBytes} ASCII-Bytes`
    }
  }
  return null
}

/** Wirft `ArtifactError('path-invalid')`, wenn der Pfad ungültig ist. */
export function assertArtifactPath(p: unknown, limits: ArtifactLimits = ARTIFACT_LIMITS): string {
  const err = artifactPathError(p, limits)
  if (err) throw new ArtifactError('path-invalid', `Ungültiger Pfad '${String(p)}': ${err}`)
  return p as string
}

// — integrity.json —

export const INTEGRITY_FORMAT_VERSION = 1
export const INTEGRITY_ALGORITHM = 'sha256'

export interface IntegrityEntry {
  path: string
  size: number
  sha256: string
}

export interface IntegrityDoc {
  formatVersion: number
  algorithm: string
  files: IntegrityEntry[]
}

const SHA256_HEX = /^[0-9a-f]{64}$/
const PLAIN_OBJECT = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const hasExactKeys = (o: Record<string, unknown>, keys: string[]): boolean => {
  const k = Object.keys(o)
  return k.length === keys.length && keys.every((key) => key in o)
}

/**
 * Validiert ein bereits geparstes integrity-Dokument streng und gibt es typisiert zurück.
 * Regeln (ADR): formatVersion==1, algorithm=='sha256', `files` als **strikt nach path sortierte
 * und eindeutige** Liste; je Eintrag genau {path,size,sha256}, path gültig, size nichtnegativer
 * Safe-Integer, sha256 == 64 lowercase-hex. Keine Fremd-Keys.
 */
export function validateIntegrityDoc(value: unknown, limits: ArtifactLimits = ARTIFACT_LIMITS): IntegrityDoc {
  if (!PLAIN_OBJECT(value) || !hasExactKeys(value, ['formatVersion', 'algorithm', 'files'])) {
    throw new ArtifactError('integrity-invalid', 'integrity.json: erwartet {formatVersion, algorithm, files}')
  }
  if (value.formatVersion !== INTEGRITY_FORMAT_VERSION) {
    throw new ArtifactError('integrity-invalid', `integrity.json: formatVersion muss ${INTEGRITY_FORMAT_VERSION} sein`)
  }
  if (value.algorithm !== INTEGRITY_ALGORITHM) {
    throw new ArtifactError('integrity-invalid', `integrity.json: algorithm muss '${INTEGRITY_ALGORITHM}' sein`)
  }
  if (!Array.isArray(value.files)) {
    throw new ArtifactError('integrity-invalid', 'integrity.json: files muss eine Liste sein')
  }
  let prev: string | null = null
  const files: IntegrityEntry[] = value.files.map((raw, i) => {
    if (!PLAIN_OBJECT(raw) || !hasExactKeys(raw, ['path', 'size', 'sha256'])) {
      throw new ArtifactError('integrity-invalid', `integrity.files[${i}]: erwartet {path, size, sha256}`)
    }
    const pErr = artifactPathError(raw.path, limits)
    if (pErr) throw new ArtifactError('integrity-invalid', `integrity.files[${i}].path: ${pErr}`)
    if (
      typeof raw.size !== 'number' ||
      !Number.isSafeInteger(raw.size) ||
      raw.size < 0
    ) {
      throw new ArtifactError('integrity-invalid', `integrity.files[${i}].size: nichtnegativer Safe-Integer erwartet`)
    }
    if (typeof raw.sha256 !== 'string' || !SHA256_HEX.test(raw.sha256)) {
      throw new ArtifactError('integrity-invalid', `integrity.files[${i}].sha256: 64 lowercase-hex erwartet`)
    }
    const path = raw.path as string
    if (prev !== null && !(path > prev)) {
      throw new ArtifactError(
        'integrity-invalid',
        `integrity.files: nicht strikt nach path sortiert/eindeutig ('${prev}' vor '${path}')`
      )
    }
    prev = path
    return { path, size: raw.size, sha256: raw.sha256 }
  })
  return { formatVersion: INTEGRITY_FORMAT_VERSION, algorithm: INTEGRITY_ALGORITHM, files }
}

// — .sig-Hülle —

export const SIG_FORMAT_VERSION = 1
export const SIG_ALGORITHM = 'ed25519'
const ED25519_SIG_BYTES = 64

export interface SigEnvelope {
  formatVersion: number
  algorithm: string
  keyId: string
  signature: string
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
/** Kanonisches Base64: re-encode der dekodierten Bytes ergibt exakt den Eingabe-String. */
function isCanonicalBase64(s: string): boolean {
  if (!BASE64.test(s)) return false
  return Buffer.from(s, 'base64').toString('base64') === s
}

/** Validiert die geparste `.sig`-Hülle streng und gibt die dekodierte 64-Byte-Signatur mit zurück. */
export function validateSigEnvelope(value: unknown): { envelope: SigEnvelope; signature: Buffer } {
  if (!PLAIN_OBJECT(value) || !hasExactKeys(value, ['formatVersion', 'algorithm', 'keyId', 'signature'])) {
    throw new ArtifactError('sig-invalid', '.sig: erwartet {formatVersion, algorithm, keyId, signature}')
  }
  if (value.formatVersion !== SIG_FORMAT_VERSION) {
    throw new ArtifactError('sig-invalid', `.sig: formatVersion muss ${SIG_FORMAT_VERSION} sein`)
  }
  if (value.algorithm !== SIG_ALGORITHM) {
    throw new ArtifactError('sig-invalid', `.sig: algorithm muss '${SIG_ALGORITHM}' sein`)
  }
  if (typeof value.keyId !== 'string' || value.keyId.length === 0) {
    throw new ArtifactError('sig-invalid', '.sig: keyId muss ein nichtleerer String sein')
  }
  if (typeof value.signature !== 'string' || !isCanonicalBase64(value.signature)) {
    throw new ArtifactError('sig-invalid', '.sig: signature muss kanonisches Base64 sein')
  }
  const signature = Buffer.from(value.signature, 'base64')
  if (signature.length !== ED25519_SIG_BYTES) {
    throw new ArtifactError('sig-invalid', `.sig: signature muss nach Decode ${ED25519_SIG_BYTES} Bytes sein`)
  }
  return {
    envelope: {
      formatVersion: SIG_FORMAT_VERSION,
      algorithm: SIG_ALGORITHM,
      keyId: value.keyId as string,
      signature: value.signature as string,
    },
    signature,
  }
}

/** Reservierte Dateinamen, die NICHT in integrity.files stehen (sie tragen/sind die Integrität). */
export const MANIFEST_FILE = 'manifest.json'
export const INTEGRITY_FILE = 'integrity.json'
export const SIG_FILE = 'integrity.json.sig'
