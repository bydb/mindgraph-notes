/**
 * Vault-Index: Container-Format, Metadaten-Typen, Identität und Filter.
 *
 * Reine Logik ohne FS/Ollama/Node-Buffer (Uint8Array + DataView), damit Main und
 * Tests dieselbe Datei nutzen. Hashes (SHA-256) berechnet der Main mit `crypto`;
 * hier stehen nur die Formen, in die sie eingetragen werden.
 *
 * Container (Vault-Chat-Plan Rev. 3, Entscheidung 4): EINE Datei, damit ein
 * einziges `rename` den Wechsel atomar macht. Aufbau:
 *   Header (44 Byte, little-endian)
 *     0  magic "MGRAGBIN"
 *     8  u32 formatVersion
 *    12  u32 generation
 *    16  u32 chunkCount
 *    20  u32 dim
 *    24  u32 metaBytes
 *    28  u32 vecBytes
 *    32  u32 metaCrc32
 *    36  u32 vecCrc32
 *    40  u32 headerCrc32 (über Byte 0..40)
 *   Meta-Block (UTF-8 JSON, VaultIndexMeta)
 *   Vektor-Block (Float32, little-endian, chunkCount × dim)
 *
 * Beim Laden werden Magic, Längen und alle drei Prüfsummen geprüft. Passt etwas
 * nicht, gilt die Datei als fehlend — es wird nicht geraten (F02).
 */

import type { NoteKindId } from '../noteKind'

export const RAG_VAULT_FORMAT_VERSION = 1
const MAGIC = 'MGRAGBIN'
export const VAULT_INDEX_HEADER_SIZE = 44

export type NoteDateSource = 'frontmatter' | 'filename' | 'mtime'

/** Woraus die Identität eines Index besteht — jede Abweichung heißt Voll-Rebuild. */
export interface VaultIndexIdentity {
  model: string
  /** Ollama-Digest aus `/api/tags` (F20). Leer = ungültig, nie „egal". */
  digest: string
  dim: number
  formatVersion: number
  chunkingVersion: number
  /** Normalisierte, sortierte Ausschlussordner — Teil der Identität (F19). */
  excludeKey: string
}

export interface VaultFileMeta {
  /** SHA-256 (hex) der kanonischen Datei. Die einzige Frische-Wahrheit (F01). */
  sourceHash: string
  mtime: number
  size: number
  kind: NoteKindId | null
  dateValue: number | null
  dateSource: NoteDateSource
}

export interface VaultChunkMeta {
  fileRel: string
  chunkIndex: number
  heading: string
  sourceStart: number
  sourceEnd: number
  startLine: number
  /** SHA-256 (hex) des Chunk-Texts — für die Relokalisierung nach Änderung. */
  chunkHash: string
  text: string
}

export interface VaultIndexMeta {
  identity: VaultIndexIdentity
  createdAt: number
  files: Record<string, VaultFileMeta>
  chunks: VaultChunkMeta[]
}

export interface VaultIndexContainer {
  meta: VaultIndexMeta
  /** chunkCount × dim, zeilenweise. */
  vectors: Float32Array
  generation: number
}

export class VaultIndexFormatError extends Error {
  constructor(public reason: string) {
    super(`Vault-Index unlesbar: ${reason}`)
    this.name = 'VaultIndexFormatError'
  }
}

// ─── CRC32 (IEEE) ─────────────────────────────────────────────────────────────

let crcTable: Uint32Array | null = null
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  crcTable = t
  return t
}

/** Inkrementell: `crc32Update(crc32Init(), teil1)` … `crc32Final(state)`. */
export function crc32Init(): number {
  return 0xffffffff
}

export function crc32Update(state: number, bytes: Uint8Array): number {
  const t = getCrcTable()
  let crc = state
  for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return crc
}

export function crc32Final(state: number): number {
  return (state ^ 0xffffffff) >>> 0
}

export function crc32(bytes: Uint8Array): number {
  return crc32Final(crc32Update(crc32Init(), bytes))
}

// ─── Identität ────────────────────────────────────────────────────────────────

/** Stabile Textform der Identität (Schlüsselreihenfolge fest) — Basis für den Datei-Hash. */
export function identityString(id: VaultIndexIdentity): string {
  return JSON.stringify({
    model: id.model,
    digest: id.digest,
    dim: id.dim,
    formatVersion: id.formatVersion,
    chunkingVersion: id.chunkingVersion,
    excludeKey: id.excludeKey
  })
}

export function identitiesEqual(a: VaultIndexIdentity, b: VaultIndexIdentity): boolean {
  return identityString(a) === identityString(b)
}

/**
 * Dürfen Embeddings aus `a` in einem Index mit Identität `b` wiederverwendet werden? Das hängt
 * nur von Modell, Digest, Dimension und Format-/Chunking-Version ab — NICHT von der
 * Ausschlussliste: ein geänderter Ausschluss wechselt den Dateinamen des Index, die
 * Vektoren unveränderter Chunks bleiben gültig (real, 20.09.2026: Archiv-Ausschluss
 * korrigiert → alle 19 037 Chunks wurden unnötig neu eingebettet).
 */
export function embeddingsCompatible(a: VaultIndexIdentity, b: VaultIndexIdentity): boolean {
  return a.model === b.model && a.digest === b.digest && a.dim === b.dim
    && a.formatVersion === b.formatVersion && a.chunkingVersion === b.chunkingVersion
}

/** Lesbarer, nicht eindeutiger Slug für den Dateinamen (Windows: kein `:`/`/`). */
export function modelSlug(model: string): string {
  return model.replace(/[/\\:]+/g, '-').replace(/\s+/g, '_').replace(/[^\w.\-]/g, '').slice(0, 60) || 'model'
}

// ─── Ausschlüsse und Filter ───────────────────────────────────────────────────

/** Vault-relativer Pfad in Posix-Form ohne führende/abschließende Schrägstriche. */
export function normalizeRelPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

/** Ordnerpräfix normalisiert und mit abschließendem `/` (leer bleibt leer). */
export function normalizeFolderPrefix(p: string): string {
  const n = normalizeRelPath(p)
  return n ? `${n}/` : ''
}

/**
 * Vergleichsform für Ordner-Abgleiche (NICHT für gespeicherte Pfade): Unicode-NFC und ohne
 * Variantenselektoren. Real (20.09.2026): der Ausschluss „400 - 🏛️ Archiv“ (Emoji mit U+FE0F)
 * traf den Ordner „400 - 🏛 Archiv“ (ohne) nie — das Archiv wurde trotz Ausschluss indexiert.
 */
export function foldPathForMatch(p: string): string {
  return normalizeRelPath(p).normalize('NFC').replace(/[\uFE0E\uFE0F]/g, '')
}

function foldedFolderPrefix(p: string): string {
  const n = foldPathForMatch(p)
  return n ? `${n}/` : ''
}

/** Sortierter, deduplizierter Schlüssel der Ausschlussliste (Teil der Identität), in Vergleichsform. */
export function excludeKeyFor(excludeFolders: string[]): string {
  return [...new Set(excludeFolders.map(foldedFolderPrefix).filter(Boolean))].sort().join('\n')
}

// Vorlagen und Abhängigkeitsordner: nie Notizen (ein `node_modules/…/CHANGELOG.md` aus einem
// Projektordner im Vault tauchte real als Quelle auf).
const ALWAYS_EXCLUDED_SEGMENTS = new Set(['templates', 'template', 'vorlagen', 'node_modules'])

/**
 * Gilt für Vollscan UND Watcher identisch (F16): Markdown, keine versteckten
 * Ordner/Dateien (deckt `.mindgraph`, `.trash`, `.sync-trash` ab), keine
 * Vorlagen-Ordner, keine konfigurierten Ausschlüsse.
 */
export function isIndexable(relPath: string, excludeFolders: string[]): boolean {
  const rel = normalizeRelPath(relPath)
  if (!rel || !/\.md$/i.test(rel)) return false
  const segments = rel.split('/')
  for (const seg of segments) {
    if (seg.startsWith('.')) return false
  }
  for (const seg of segments.slice(0, -1)) {
    if (ALWAYS_EXCLUDED_SEGMENTS.has(seg.toLowerCase())) return false
  }
  // Der Agent-Skills-Ordner der App (`Skills/` auf oberster Ebene): Anweisungen und
  // Beispielmaterial des Notiz-Agenten, keine Notizen — ein Beispielbrief daraus tauchte real als
  // Quelle auf (Abnahme 19.09.2026). Nur oberste Ebene, ein Unterordner „Skills“ bleibt Notizen.
  if (segments.length > 1 && segments[0].toLowerCase() === 'skills') return false
  const folded = foldPathForMatch(rel)
  for (const ex of excludeFolders) {
    const prefix = foldedFolderPrefix(ex)
    if (prefix && folded.startsWith(prefix)) return false
  }
  return true
}

export interface VaultQueryFilters {
  /** Vault-relative Ordnerpräfixe; leer = alle. */
  folders?: string[]
  /** Kategorien; leer = alle. */
  kinds?: NoteKindId[]
  /** Zeitbereich (Ortszeit-Millis, inklusiv). Nur wenn beide oder eine Grenze gesetzt. */
  dateFrom?: number | null
  dateTo?: number | null
}

/** Vorfilter auf Metadaten — läuft vor jedem Vektorvergleich. */
export function matchesFilters(fileRel: string, file: VaultFileMeta, filters: VaultQueryFilters | undefined): boolean {
  if (!filters) return true
  if (filters.folders && filters.folders.length > 0) {
    const rel = foldPathForMatch(fileRel)
    const hit = filters.folders.some((f) => {
      const prefix = foldedFolderPrefix(f)
      return prefix ? rel.startsWith(prefix) : true
    })
    if (!hit) return false
  }
  if (filters.kinds && filters.kinds.length > 0) {
    if (!file.kind || !filters.kinds.includes(file.kind)) return false
  }
  const hasFrom = typeof filters.dateFrom === 'number'
  const hasTo = typeof filters.dateTo === 'number'
  if (hasFrom || hasTo) {
    if (file.dateValue === null) return false
    if (hasFrom && file.dateValue < (filters.dateFrom as number)) return false
    if (hasTo && file.dateValue > (filters.dateTo as number)) return false
  }
  return true
}

// ─── Container: kodieren / dekodieren ─────────────────────────────────────

function isLittleEndian(): boolean {
  return new Uint8Array(new Uint32Array([1]).buffer)[0] === 1
}

export interface VaultIndexHeader {
  formatVersion: number
  generation: number
  chunkCount: number
  dim: number
  metaBytes: number
  vecBytes: number
  metaCrc: number
  vecCrc: number
}

/** Baut die 44 Header-Bytes (inkl. Header-Prüfsumme). */
export function encodeVaultIndexHeader(h: VaultIndexHeader): Uint8Array {
  const out = new Uint8Array(VAULT_INDEX_HEADER_SIZE)
  const view = new DataView(out.buffer)
  for (let i = 0; i < MAGIC.length; i++) out[i] = MAGIC.charCodeAt(i)
  view.setUint32(8, h.formatVersion, true)
  view.setUint32(12, h.generation >>> 0, true)
  view.setUint32(16, h.chunkCount, true)
  view.setUint32(20, h.dim, true)
  view.setUint32(24, h.metaBytes, true)
  view.setUint32(28, h.vecBytes, true)
  view.setUint32(32, h.metaCrc, true)
  view.setUint32(36, h.vecCrc, true)
  view.setUint32(40, crc32(out.subarray(0, 40)), true)
  return out
}

/** Liest und prüft den Header (Magic, Header-Prüfsumme, Formatversion, Blockgrößen). */
export function decodeVaultIndexHeader(bytes: Uint8Array): VaultIndexHeader {
  if (!isLittleEndian()) throw new VaultIndexFormatError('Big-Endian-Plattform wird nicht unterstützt')
  if (bytes.length < VAULT_INDEX_HEADER_SIZE) throw new VaultIndexFormatError('Datei kürzer als der Header')
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) throw new VaultIndexFormatError('Magic stimmt nicht')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerCrc = view.getUint32(40, true)
  if (crc32(bytes.subarray(0, 40)) !== headerCrc) throw new VaultIndexFormatError('Header-Prüfsumme falsch')
  const h: VaultIndexHeader = {
    formatVersion: view.getUint32(8, true),
    generation: view.getUint32(12, true),
    chunkCount: view.getUint32(16, true),
    dim: view.getUint32(20, true),
    metaBytes: view.getUint32(24, true),
    vecBytes: view.getUint32(28, true),
    metaCrc: view.getUint32(32, true),
    vecCrc: view.getUint32(36, true)
  }
  if (h.formatVersion !== RAG_VAULT_FORMAT_VERSION) throw new VaultIndexFormatError(`Formatversion ${h.formatVersion} unbekannt`)
  if (h.vecBytes !== h.chunkCount * h.dim * 4) throw new VaultIndexFormatError('Vektorblock passt nicht zu chunkCount × dim')
  return h
}

/** Parst den Metadaten-Block und prüft ihn gegen den Header. */
export function parseVaultIndexMeta(metaBytes: Uint8Array, header: VaultIndexHeader, opts: { crcVerified?: boolean } = {}): VaultIndexMeta {
  if (metaBytes.length !== header.metaBytes) throw new VaultIndexFormatError('Metadatenblock hat die falsche Länge')
  // Der Main-Lader prüft die Prüfsumme vorab in Stücken (Ereignisschleife frei) und meldet das hier.
  if (!opts.crcVerified && crc32(metaBytes) !== header.metaCrc) throw new VaultIndexFormatError('Metadaten-Prüfsumme falsch')
  let meta: VaultIndexMeta
  try {
    meta = JSON.parse(new TextDecoder().decode(metaBytes)) as VaultIndexMeta
  } catch {
    throw new VaultIndexFormatError('Metadaten kein gültiges JSON')
  }
  if (!meta || typeof meta !== 'object' || !meta.identity || !Array.isArray(meta.chunks) || !meta.files) {
    throw new VaultIndexFormatError('Metadaten unvollständig')
  }
  if (meta.chunks.length !== header.chunkCount) throw new VaultIndexFormatError('chunkCount ≠ Metadaten')
  if (meta.identity.dim !== header.dim) throw new VaultIndexFormatError('Dimension ≠ Metadaten')
  return meta
}

export function encodeVaultIndexMeta(meta: VaultIndexMeta): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(meta))
}

export function encodeVaultIndex(container: VaultIndexContainer): Uint8Array {
  if (!isLittleEndian()) throw new VaultIndexFormatError('Big-Endian-Plattform wird nicht unterstützt')
  const { meta, vectors, generation } = container
  const dim = meta.identity.dim
  const chunkCount = meta.chunks.length
  if (dim <= 0) throw new VaultIndexFormatError('Dimension muss > 0 sein')
  if (vectors.length !== chunkCount * dim) {
    throw new VaultIndexFormatError(`Vektorzahl ${vectors.length} ≠ ${chunkCount} × ${dim}`)
  }

  const metaBytes = encodeVaultIndexMeta(meta)
  const vecBytes = new Uint8Array(vectors.buffer, vectors.byteOffset, vectors.byteLength)
  const header = encodeVaultIndexHeader({
    formatVersion: RAG_VAULT_FORMAT_VERSION,
    generation,
    chunkCount,
    dim,
    metaBytes: metaBytes.length,
    vecBytes: vecBytes.length,
    metaCrc: crc32(metaBytes),
    vecCrc: crc32(vecBytes)
  })
  const out = new Uint8Array(VAULT_INDEX_HEADER_SIZE + metaBytes.length + vecBytes.length)
  out.set(header, 0)
  out.set(metaBytes, VAULT_INDEX_HEADER_SIZE)
  out.set(vecBytes, VAULT_INDEX_HEADER_SIZE + metaBytes.length)
  return out
}

/** Wirft `VaultIndexFormatError` bei jeder Abweichung — der Aufrufer behandelt das als „kein Index". */
export function decodeVaultIndex(bytes: Uint8Array): VaultIndexContainer {
  const header = decodeVaultIndexHeader(bytes)
  const expectedTotal = VAULT_INDEX_HEADER_SIZE + header.metaBytes + header.vecBytes
  if (bytes.length !== expectedTotal) {
    throw new VaultIndexFormatError(`Länge ${bytes.length} ≠ erwartet ${expectedTotal} (abgeschnitten oder angehängt)`)
  }
  const metaBytes = bytes.subarray(VAULT_INDEX_HEADER_SIZE, VAULT_INDEX_HEADER_SIZE + header.metaBytes)
  const vecBytes = bytes.subarray(VAULT_INDEX_HEADER_SIZE + header.metaBytes)
  const meta = parseVaultIndexMeta(metaBytes, header)
  if (crc32(vecBytes) !== header.vecCrc) throw new VaultIndexFormatError('Vektor-Prüfsumme falsch')

  // Float32Array braucht 4-Byte-Ausrichtung — Kopie in einen frischen Puffer,
  // weil der Vektorblock hinter beliebig langem JSON liegt.
  const aligned = new Uint8Array(header.vecBytes)
  aligned.set(vecBytes)
  const vectors = new Float32Array(aligned.buffer)
  return { meta, vectors, generation: header.generation }
}

// ─── Vektor-Hilfen ────────────────────────────────────────────────────────────

/** Cosine über eine Zeile des Float32-Blocks (Vektor wird nicht kopiert). */
export function cosineRow(vectors: Float32Array, row: number, dim: number, query: Float32Array, queryNorm: number): number {
  const base = row * dim
  let dot = 0
  let norm = 0
  for (let i = 0; i < dim; i++) {
    const v = vectors[base + i]
    dot += v * query[i]
    norm += v * v
  }
  if (norm === 0 || queryNorm === 0) return 0
  return dot / (Math.sqrt(norm) * queryNorm)
}

export function vectorNorm(v: Float32Array): number {
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  return Math.sqrt(n)
}
