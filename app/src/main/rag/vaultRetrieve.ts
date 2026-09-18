/**
 * Vault-Abfrage: Vorfilter → Cosine → Oversampling → exaktes Dedupe → Pro-Datei-Deckel
 * → Floor ohne Fallback → Frischeprüfung mit eindeutiger Relokalisierung
 * (Vault-Chat-Plan Rev. 3, Entscheidungen 5 und 10, F07, F13, Rückfrage 1).
 *
 * Digest wird VOR und NACH der Frage-Einbettung geprüft; erst dann läuft Cosine (F20).
 */

import * as path from 'path'
import { chunkMarkdown } from '../../shared/rag/chunking'
import { cosineRow, isIndexable, matchesFilters, vectorNorm, type VaultChunkMeta, type VaultIndexContainer, type VaultQueryFilters } from '../../shared/rag/vaultIndex'
import type { NoteKindId } from '../../shared/noteKind'
import { embedText } from './embed'
import { resolveLocalModel } from './localModel'
import { readCanonicalFile, sha256Hex } from './vaultStore'
import { getNoteKindStrict, resolveNoteDate } from '../../shared/noteKind'
import type { VaultFileMeta } from '../../shared/rag/vaultIndex'

type AssertSafePath = (p: string, op: string) => Promise<string>

export type HitFreshness = 'fresh' | 'relocated'

export interface VaultHit {
  fileRel: string
  chunkIndex: number
  heading: string
  text: string
  score: number
  sourceStart: number
  sourceEnd: number
  startLine: number
  sourceHash: string
  chunkHash: string
  fresh: HitFreshness
  kind: NoteKindId | null
  dateValue: number | null
}

export interface VaultQueryOptions {
  query: string
  embedModel: string
  filters?: VaultQueryFilters
  topK?: number
  minScore?: number
  perFileCap?: number
  oversample?: number
  signal?: AbortSignal
  /**
   * Aktuelle Ausschlussliste der Konfiguration. Greift SOFORT, auch wenn der Index
   * noch mit einer älteren Liste gebaut wurde — ein ausgeschlossener Ordner darf
   * nicht bis zum Neuaufbau weiter als Quelle erscheinen.
   */
  excludeFolders?: string[]
}

export interface VaultQueryResult {
  hits: VaultHit[]
  /** Bester Kandidat lag unter dem Floor → deterministisch „nichts gefunden". */
  belowFloor: boolean
  /** Es gab Treffer, aber keiner überlebte die Frischeprüfung → „keine passende Quelle". */
  noFreshSource: boolean
  bestScore: number | null
  candidatesConsidered: number
  /** Dateien, deren Inhalt sich seit dem Index geändert hat (für die Warteschlange). */
  staleFiles: string[]
  identity: { model: string; digest: string }
}

export const DEFAULT_VAULT_TOP_K = 8
// Startwert aus dem Projekt-RAG (gemessen 06.06.2026); wird in Phase 3 kalibriert.
export const DEFAULT_VAULT_MIN_SCORE = 0.3
export const DEFAULT_PER_FILE_CAP = 2
export const DEFAULT_OVERSAMPLE = 4

export class VaultIdentityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultIdentityError'
  }
}

function dedupeKey(text: string): string {
  return sha256Hex(text.toLowerCase().replace(/\s+/g, ' ').trim())
}

/** Reine Rangfolge über einen geladenen Container (ohne Frischeprüfung). */
export function rankCandidates(
  container: VaultIndexContainer,
  queryVec: Float32Array,
  filters: VaultQueryFilters | undefined,
  limit: number,
  excludeFolders: string[] = []
): Array<{ row: number; score: number }> {
  const { meta, vectors } = container
  const dim = meta.identity.dim
  const qNorm = vectorNorm(queryVec)
  const allowed = new Map<string, boolean>()
  const scored: Array<{ row: number; score: number }> = []
  for (let row = 0; row < meta.chunks.length; row++) {
    const rel = meta.chunks[row].fileRel
    let ok = allowed.get(rel)
    if (ok === undefined) {
      const file = meta.files[rel]
      ok = file ? matchesFilters(rel, file, filters) && (excludeFolders.length === 0 || isIndexable(rel, excludeFolders)) : false
      allowed.set(rel, ok)
    }
    if (!ok) continue
    scored.push({ row, score: cosineRow(vectors, row, dim, queryVec, qNorm) })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

/** Dedupe (exakt, normalisiert) und Pro-Datei-Deckel in Score-Reihenfolge bis Top-K. */
export function selectHits(
  container: VaultIndexContainer,
  ranked: Array<{ row: number; score: number }>,
  topK: number,
  perFileCap: number
): Array<{ chunk: VaultChunkMeta; score: number }> {
  const seen = new Set<string>()
  const perFile = new Map<string, number>()
  const out: Array<{ chunk: VaultChunkMeta; score: number }> = []
  for (const r of ranked) {
    const chunk = container.meta.chunks[r.row]
    const key = dedupeKey(chunk.text)
    if (seen.has(key)) continue
    const n = perFile.get(chunk.fileRel) ?? 0
    if (n >= perFileCap) continue
    seen.add(key)
    perFile.set(chunk.fileRel, n + 1)
    out.push({ chunk, score: r.score })
    if (out.length >= topK) break
  }
  return out
}

interface FreshFile {
  canonical: string
  sourceHash: string
  /** Metadaten aus demselben Snapshot — nach Änderung nie die alten aus dem Index (F36). */
  meta: VaultFileMeta
  chunksByHash?: Map<string, VaultChunkMeta[]>
}

/**
 * Frischeprüfung pro Treffer: Hash gleich → frisch. Sonst Datei neu chunken und den
 * Chunk per `chunkHash` relokalisieren — NUR bei genau einem Treffer. Alles andere
 * fällt weg und die Datei wird als „geändert" gemeldet.
 */
export async function verifyHits(
  vaultPath: string,
  container: VaultIndexContainer,
  selected: Array<{ chunk: VaultChunkMeta; score: number }>,
  assertSafePath: AssertSafePath,
  filters?: VaultQueryFilters
): Promise<{ hits: VaultHit[]; staleFiles: string[] }> {
  const cache = new Map<string, FreshFile | null>()
  const hits: VaultHit[] = []
  const stale = new Set<string>()

  for (const { chunk, score } of selected) {
    const fileMeta = container.meta.files[chunk.fileRel]
    if (!fileMeta) continue
    let fresh = cache.get(chunk.fileRel)
    if (fresh === undefined) {
      try {
        const safe = await assertSafePath(path.join(vaultPath, chunk.fileRel), 'vault-rag-verify')
        const f = await readCanonicalFile(safe)
        const date = resolveNoteDate(chunk.fileRel, f.canonical, f.mtime)
        fresh = {
          canonical: f.canonical,
          sourceHash: f.sourceHash,
          meta: { sourceHash: f.sourceHash, mtime: f.mtime, size: f.size, kind: getNoteKindStrict(chunk.fileRel, f.canonical), dateValue: date.dateValue, dateSource: date.dateSource }
        }
      } catch {
        fresh = null
      }
      cache.set(chunk.fileRel, fresh)
    }
    if (!fresh) {
      stale.add(chunk.fileRel)
      continue
    }
    // Aktive Filter gegen die FRISCHEN Metadaten prüfen — eine geänderte Kategorie oder
    // ein geändertes Datum darf keinen Treffer im falschen Filter liefern (F36).
    if (!matchesFilters(chunk.fileRel, fresh.meta, filters)) {
      if (fresh.sourceHash !== fileMeta.sourceHash) stale.add(chunk.fileRel)
      continue
    }
    const base = {
      fileRel: chunk.fileRel,
      chunkIndex: chunk.chunkIndex,
      score,
      chunkHash: chunk.chunkHash,
      kind: fresh.meta.kind,
      dateValue: fresh.meta.dateValue
    }
    if (fresh.sourceHash === fileMeta.sourceHash) {
      hits.push({
        ...base,
        heading: chunk.heading,
        text: chunk.text,
        sourceStart: chunk.sourceStart,
        sourceEnd: chunk.sourceEnd,
        startLine: chunk.startLine,
        sourceHash: fileMeta.sourceHash,
        fresh: 'fresh'
      })
      continue
    }
    // Relokalisieren: neu chunken, per chunkHash suchen — nur eindeutig.
    stale.add(chunk.fileRel)
    if (!fresh.chunksByHash) {
      fresh.chunksByHash = new Map()
      for (const c of chunkMarkdown(fresh.canonical)) {
        const h = sha256Hex(c.text)
        const arr = fresh.chunksByHash.get(h) ?? []
        arr.push({
          fileRel: chunk.fileRel,
          chunkIndex: c.chunkIndex,
          heading: c.heading,
          sourceStart: c.sourceStart,
          sourceEnd: c.sourceEnd,
          startLine: c.startLine,
          chunkHash: h,
          text: c.text
        })
        fresh.chunksByHash.set(h, arr)
      }
    }
    const found = fresh.chunksByHash.get(chunk.chunkHash)
    if (!found || found.length !== 1) continue
    const r = found[0]
    hits.push({
      ...base,
      chunkIndex: r.chunkIndex,
      heading: r.heading,
      text: r.text,
      sourceStart: r.sourceStart,
      sourceEnd: r.sourceEnd,
      startLine: r.startLine,
      sourceHash: fresh.sourceHash,
      fresh: 'relocated'
    })
  }
  return { hits, staleFiles: [...stale] }
}

export async function queryVaultIndex(
  container: VaultIndexContainer,
  vaultPath: string,
  opts: VaultQueryOptions,
  assertSafePath: AssertSafePath
): Promise<VaultQueryResult> {
  const topK = opts.topK ?? DEFAULT_VAULT_TOP_K
  const minScore = opts.minScore ?? DEFAULT_VAULT_MIN_SCORE
  const perFileCap = opts.perFileCap ?? DEFAULT_PER_FILE_CAP
  const oversample = opts.oversample ?? DEFAULT_OVERSAMPLE
  const identity = container.meta.identity
  const empty = (extra: Partial<VaultQueryResult>): VaultQueryResult => ({
    hits: [],
    belowFloor: false,
    noFreshSource: false,
    bestScore: null,
    candidatesConsidered: 0,
    staleFiles: [],
    identity: { model: identity.model, digest: identity.digest },
    ...extra
  })
  if (!opts.query.trim() || container.meta.chunks.length === 0) return empty({ belowFloor: true })

  const before = await resolveLocalModel(opts.embedModel, { fresh: true })
  if (before.digest !== identity.digest) {
    throw new VaultIdentityError(`Der Index wurde mit einer anderen Fassung von „${identity.model}" gebaut — bitte neu aufbauen`)
  }
  const qv = await embedText(opts.embedModel, opts.query, { signal: opts.signal })
  const after = await resolveLocalModel(opts.embedModel, { fresh: true })
  if (after.digest !== identity.digest) {
    throw new VaultIdentityError(`Modell „${identity.model}" hat sich während der Abfrage geändert — bitte Index neu aufbauen`)
  }
  if (qv.length !== identity.dim) {
    throw new VaultIdentityError(`Embedding-Dimension ${qv.length} passt nicht zum Index (${identity.dim})`)
  }

  const ranked = rankCandidates(container, Float32Array.from(qv), opts.filters, topK * oversample, opts.excludeFolders ?? [])
  const bestScore = ranked.length > 0 ? ranked[0].score : null
  if (bestScore === null || bestScore < minScore) {
    return empty({ belowFloor: true, bestScore, candidatesConsidered: ranked.length })
  }
  const passing = ranked.filter((r) => r.score >= minScore)
  const selected = selectHits(container, passing, topK, perFileCap)
  const { hits, staleFiles } = await verifyHits(vaultPath, container, selected, assertSafePath, opts.filters)
  return {
    hits,
    belowFloor: false,
    noFreshSource: hits.length === 0,
    bestScore,
    candidatesConsidered: ranked.length,
    staleFiles,
    identity: { model: identity.model, digest: identity.digest }
  }
}

// ─── Quellenklick (F28): Frischeprüfung + Relokalisierung für die Navigation ────

export interface SourceRef {
  fileRel: string
  sourceHash: string
  chunkHash: string
  sourceStart: number
  sourceEnd: number
  startLine: number
}

export type LocateSourceResult =
  | { status: 'fresh' | 'relocated'; fileRel: string; sourceHash: string; sourceStart: number; sourceEnd: number; startLine: number; heading: string }
  | { status: 'changed'; fileRel: string; sourceHash: string }
  | { status: 'missing'; fileRel: string }

/**
 * Vor dem Klick: Hash der Datei prüfen. Gleich → Stelle wie im Index. Sonst neu chunken
 * und per chunkHash relokalisieren — nur bei genau einem Treffer. Alles andere ist
 * „geändert" (Notiz öffnet oben, sichtbarer Hinweis) oder „fehlt" (kein Öffnen).
 */
export async function locateSource(vaultPath: string, ref: SourceRef, assertSafePath: AssertSafePath): Promise<LocateSourceResult> {
  let file: Awaited<ReturnType<typeof readCanonicalFile>>
  try {
    const safe = await assertSafePath(path.join(vaultPath, ref.fileRel), 'vault-rag-locate')
    file = await readCanonicalFile(safe)
  } catch {
    return { status: 'missing', fileRel: ref.fileRel }
  }
  if (file.sourceHash === ref.sourceHash) {
    return { status: 'fresh', fileRel: ref.fileRel, sourceHash: file.sourceHash, sourceStart: ref.sourceStart, sourceEnd: ref.sourceEnd, startLine: ref.startLine, heading: '' }
  }
  const matches = chunkMarkdown(file.canonical).filter((c) => sha256Hex(c.text) === ref.chunkHash)
  if (matches.length !== 1) return { status: 'changed', fileRel: ref.fileRel, sourceHash: file.sourceHash }
  const c = matches[0]
  return { status: 'relocated', fileRel: ref.fileRel, sourceHash: file.sourceHash, sourceStart: c.sourceStart, sourceEnd: c.sourceEnd, startLine: c.startLine, heading: c.heading }
}
