/**
 * Vault-Index auf der Platte: Pfade, Laden mit Validierung, atomares Schreiben,
 * Staging-Segmente und Checkpoints (Vault-Chat-Plan Rev. 3, Entscheidungen 4 + 6, F02, F19).
 *
 * Keine Elektron-Imports — `userDataPath` kommt vom Aufrufer, damit Tests ohne
 * Electron laufen.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { createHash, randomBytes } from 'crypto'
import {
  VAULT_INDEX_HEADER_SIZE,
  VaultIndexFormatError,
  crc32,
  crc32Final,
  crc32Init,
  crc32Update,
  decodeVaultIndex,
  decodeVaultIndexHeader,
  encodeVaultIndex,
  encodeVaultIndexHeader,
  encodeVaultIndexMeta,
  identityString,
  modelSlug,
  parseVaultIndexMeta,
  RAG_VAULT_FORMAT_VERSION,
  type VaultIndexContainer,
  type VaultIndexIdentity,
  type VaultIndexMeta
} from '../../shared/rag/vaultIndex'
import { canonicalizeMarkdown } from '../../shared/rag/chunking'

export const VAULT_RAG_DIR = path.join('.mindgraph', 'rag')
const INDEX_PREFIX = 'vault-'
const INDEX_EXT = '.ragbin'
const TEMP_MARK = '.tmp-'

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex')
}

export function vaultRagDir(vaultPath: string): string {
  return path.join(vaultPath, VAULT_RAG_DIR)
}

export function vaultIndexFileName(identity: VaultIndexIdentity): string {
  return `${INDEX_PREFIX}${modelSlug(identity.model)}--${sha256Hex(identityString(identity)).slice(0, 12)}${INDEX_EXT}`
}

export function vaultIndexPath(vaultPath: string, identity: VaultIndexIdentity): string {
  return path.join(vaultRagDir(vaultPath), vaultIndexFileName(identity))
}

/** Staging liegt in userData (gerätelokal), getrennt von den Commit-Temps im Vault (F19). */
export function stagingDirFor(userDataPath: string, vaultPath: string, identity: VaultIndexIdentity): string {
  const key = sha256Hex(`${vaultPath}\n${identityString(identity)}`).slice(0, 16)
  return path.join(userDataPath, 'rag-staging', key)
}

export interface CanonicalFile {
  canonical: string
  sourceHash: string
  mtime: number
  size: number
}

/** Liest eine Datei in kanonischer Form und hasht sie — die einzige Frische-Wahrheit. */
export async function readCanonicalFile(absPath: string): Promise<CanonicalFile> {
  const [raw, stats] = await Promise.all([fs.readFile(absPath, 'utf-8'), fs.stat(absPath)])
  const canonical = canonicalizeMarkdown(raw)
  return { canonical, sourceHash: sha256Hex(canonical), mtime: stats.mtimeMs, size: stats.size }
}

// ─── Laden ────────────────────────────────────────────────────────────────────

/**
 * Lädt und validiert einen Container. Liest Header und Metadaten getrennt und
 * den Vektorblock direkt in einen ausgerichteten Puffer (keine zweite Kopie).
 * Jede Formatabweichung → `null` (mit Log), fehlende Datei → `null` ohne Log.
 */
export async function loadVaultIndexFile(file: string): Promise<VaultIndexContainer | null> {
  let handle: fs.FileHandle
  try {
    handle = await fs.open(file, 'r')
  } catch {
    return null
  }
  try {
    const { size } = await handle.stat()
    const headerBuf = new Uint8Array(VAULT_INDEX_HEADER_SIZE)
    const hr = await handle.read(headerBuf, 0, VAULT_INDEX_HEADER_SIZE, 0)
    if (hr.bytesRead !== VAULT_INDEX_HEADER_SIZE) throw new VaultIndexFormatError('Datei kürzer als der Header')
    const header = decodeVaultIndexHeader(headerBuf)
    const expected = VAULT_INDEX_HEADER_SIZE + header.metaBytes + header.vecBytes
    if (size !== expected) throw new VaultIndexFormatError(`Länge ${size} ≠ erwartet ${expected} (abgeschnitten oder angehängt)`)

    const metaBuf = new Uint8Array(header.metaBytes)
    const mr = await handle.read(metaBuf, 0, header.metaBytes, VAULT_INDEX_HEADER_SIZE)
    if (mr.bytesRead !== header.metaBytes) throw new VaultIndexFormatError('Metadatenblock unvollständig')
    const meta = parseVaultIndexMeta(metaBuf, header)

    const vectors = new Float32Array(header.chunkCount * header.dim)
    const vecView = new Uint8Array(vectors.buffer)
    let offset = 0
    while (offset < header.vecBytes) {
      const r = await handle.read(vecView, offset, header.vecBytes - offset, VAULT_INDEX_HEADER_SIZE + header.metaBytes + offset)
      if (r.bytesRead === 0) throw new VaultIndexFormatError('Vektorblock unvollständig')
      offset += r.bytesRead
    }
    if (crc32(vecView) !== header.vecCrc) throw new VaultIndexFormatError('Vektor-Prüfsumme falsch')
    return { meta, vectors, generation: header.generation }
  } catch (err) {
    if (err instanceof VaultIndexFormatError) {
      console.warn(`[VaultRAG] Index ${path.basename(file)} verworfen: ${err.reason}`)
      return null
    }
    console.warn(`[VaultRAG] Index ${path.basename(file)} nicht lesbar:`, err)
    return null
  } finally {
    await handle.close().catch(() => undefined)
  }
}

// ─── Schreiben ────────────────────────────────────────────────────────────────

/**
 * Schreibt Header + Metadaten + Vektoren in eine Temp-Datei im selben Ordner,
 * `fsync`, dann EIN `rename` — atomar (F02). Die Vektoren kommen als Teile,
 * damit der Aufrufer sie nicht zu einem Block kopieren muss.
 */
export async function writeVaultIndexAtomic(
  file: string,
  meta: VaultIndexMeta,
  vectorParts: Float32Array[],
  generation: number
): Promise<{ bytes: number }> {
  const dim = meta.identity.dim
  const chunkCount = meta.chunks.length
  const totalFloats = vectorParts.reduce((n, p) => n + p.length, 0)
  if (totalFloats !== chunkCount * dim) {
    throw new VaultIndexFormatError(`Vektorzahl ${totalFloats} ≠ ${chunkCount} × ${dim}`)
  }
  const metaBytes = encodeVaultIndexMeta(meta)
  let vecState = crc32Init()
  let vecBytesTotal = 0
  for (const part of vectorParts) {
    const bytes = new Uint8Array(part.buffer, part.byteOffset, part.byteLength)
    vecBytesTotal += bytes.length
    vecState = crc32Update(vecState, bytes)
  }
  const header = encodeVaultIndexHeader({
    formatVersion: RAG_VAULT_FORMAT_VERSION,
    generation,
    chunkCount,
    dim,
    metaBytes: metaBytes.length,
    vecBytes: vecBytesTotal,
    metaCrc: crc32(metaBytes),
    vecCrc: crc32Final(vecState)
  })

  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}${TEMP_MARK}${process.pid}-${randomBytes(4).toString('hex')}`
  const handle = await fs.open(temp, 'w')
  try {
    await handle.write(header)
    await handle.write(metaBytes)
    for (const part of vectorParts) {
      await handle.write(new Uint8Array(part.buffer, part.byteOffset, part.byteLength))
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(temp, file)
  return { bytes: VAULT_INDEX_HEADER_SIZE + metaBytes.length + vecBytesTotal }
}

type AssertSafePath = (p: string, op: string) => Promise<string>
const passThrough: AssertSafePath = async (p) => p

/**
 * Entfernt liegen gebliebene Commit-Temps (Absturz zwischen Schreiben und Rename).
 * `dir` muss bereits geprüft sein; jede Datei wird vor dem Löschen erneut geprüft (F34).
 */
export async function cleanupVaultIndexTemps(dir: string, assertSafePath: AssertSafePath = passThrough): Promise<number> {
  let removed = 0
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return 0
  }
  for (const name of entries) {
    if (name.includes(TEMP_MARK)) {
      try {
        const safe = await assertSafePath(path.join(dir, name), 'vault-rag-cleanup')
        await fs.rm(safe, { force: true })
        removed++
      } catch {
        /* außerhalb oder schon weg */
      }
    }
  }
  return removed
}

/** Listet vorhandene Vault-Container (nur Header, kein Metadaten-Parse); jede Datei pfadgeprüft (F34). */
export async function listVaultIndexFiles(dir: string, assertSafePath: AssertSafePath = passThrough): Promise<Array<{ file: string; chunkCount: number; generation: number; bytes: number; mtime: number }>> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: Array<{ file: string; chunkCount: number; generation: number; bytes: number; mtime: number }> = []
  for (const name of entries) {
    if (!name.startsWith(INDEX_PREFIX) || !name.endsWith(INDEX_EXT) || name.includes(TEMP_MARK)) continue
    let file: string
    try {
      file = await assertSafePath(path.join(dir, name), 'vault-rag-list')
    } catch {
      continue
    }
    try {
      const handle = await fs.open(file, 'r')
      try {
        const buf = new Uint8Array(VAULT_INDEX_HEADER_SIZE)
        const r = await handle.read(buf, 0, VAULT_INDEX_HEADER_SIZE, 0)
        if (r.bytesRead !== VAULT_INDEX_HEADER_SIZE) continue
        const h = decodeVaultIndexHeader(buf)
        const st = await handle.stat()
        out.push({ file, chunkCount: h.chunkCount, generation: h.generation, bytes: st.size, mtime: st.mtimeMs })
      } finally {
        await handle.close().catch(() => undefined)
      }
    } catch {
      /* unlesbar → nicht auflisten */
    }
  }
  return out
}

/** Entfernt alle Container im Ordner außer `keepFile` (alte Identitäten nach erfolgreichem Commit). */
export async function removeOtherVaultIndexes(dir: string, keepFile: string, assertSafePath: AssertSafePath = passThrough): Promise<void> {
  const files = await listVaultIndexFiles(dir, assertSafePath)
  for (const f of files) {
    if (path.resolve(f.file) === path.resolve(keepFile)) continue
    await fs.rm(f.file, { force: true }).catch(() => undefined)
  }
}

// ─── Staging: Segmente + Checkpoint (F19) ─────────────────────────────────────

export interface StagingCheckpoint {
  identity: VaultIndexIdentity
  /** Dateien, deren Chunks vollständig in Segmenten liegen: rel → sourceHash. */
  files: Record<string, string>
  segments: Array<{ name: string; chunkCount: number }>
  updatedAt: number
}

const CHECKPOINT_NAME = 'checkpoint.json'

export async function loadCheckpoint(stagingDir: string, identity: VaultIndexIdentity): Promise<StagingCheckpoint | null> {
  try {
    const raw = await fs.readFile(path.join(stagingDir, CHECKPOINT_NAME), 'utf-8')
    const cp = JSON.parse(raw) as StagingCheckpoint
    if (!cp || typeof cp !== 'object' || !cp.identity || !cp.files || !Array.isArray(cp.segments)) return null
    if (identityString(cp.identity) !== identityString(identity)) return null
    return cp
  } catch {
    return null
  }
}

/** Schreiben mit fsync vor dem Rename — sonst ist die zugesagte Haltbarkeit nur nominell (F37). */
async function writeDurable(file: string, data: Uint8Array | string): Promise<void> {
  const temp = `${file}${TEMP_MARK}${randomBytes(4).toString('hex')}`
  const handle = await fs.open(temp, 'w')
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(temp, file)
}

export async function saveCheckpoint(stagingDir: string, cp: StagingCheckpoint): Promise<void> {
  await fs.mkdir(stagingDir, { recursive: true })
  await writeDurable(path.join(stagingDir, CHECKPOINT_NAME), JSON.stringify(cp))
}

export async function writeSegment(stagingDir: string, name: string, container: VaultIndexContainer): Promise<void> {
  await fs.mkdir(stagingDir, { recursive: true })
  await writeDurable(path.join(stagingDir, name), encodeVaultIndex(container))
}

/** Segment laden; Format- oder Identitätsfehler → `null` (Segment wird dann neu erzeugt). */
export async function loadSegment(stagingDir: string, name: string, identity: VaultIndexIdentity): Promise<VaultIndexContainer | null> {
  try {
    const bytes = await fs.readFile(path.join(stagingDir, name))
    const c = decodeVaultIndex(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    if (identityString(c.meta.identity) !== identityString(identity)) return null
    return c
  } catch {
    return null
  }
}

export async function removeStagingDir(stagingDir: string): Promise<void> {
  await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
}
