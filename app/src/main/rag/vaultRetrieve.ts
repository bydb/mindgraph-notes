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
import { chunkLexicalText, lexicalIndexFor, lexicalOverlap } from '../../shared/rag/lexical'
import { isDerivedAiNote } from '../../shared/rag/indexPolicy'
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
  /** Umsortierung der Kandidaten: Bedeutungsnähe + Gewicht × Wortabgleich (Floor bleibt auf der Bedeutungsnähe). */
  lexicalWeight?: number
  /** Cosine-Schwelle, ab der ein Kandidat als Near-Duplikat eines gewählten Treffers gilt (0 = aus). */
  nearDupCosine?: number
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
// Kalibriert am Tuning-Set (20.09.2026, 42 positiv / 12 negativ, bge-m3): 0,30 verweigerte keinen
// Negativfall; 0,50 verweigert 9/12 (die drei thematisch nahen verweigert das Antwortmodell)
// und kostet einen Positivfall; 0,55 kostet vier. Holdout-Bestätigung: siehe Plan, Phase 3.
export const DEFAULT_VAULT_MIN_SCORE = 0.5
/** Gewicht des seltenheitsgewichteten Wortabgleichs bei der Umsortierung (0 = aus). */
export const DEFAULT_LEXICAL_WEIGHT = 0.3
/**
 * Near-Duplikate über Dateien hinweg: ein Kandidat, dessen Embedding einem bereits gewählten
 * Treffer mit Cosine ≥ Schwelle gleicht, wird übersprungen (0 = aus). Real: Kopien einer
 * Statusnotiz („_STATUS-2026-W21“, „W21 (2)“, „W20 (6)“) und „10000 Euro Erlass“ neben
 * „… - Ueberprueft“ belegten je drei bis vier der acht Quellenplätze. Schwelle: Phase-3-Messung.
 */
export const DEFAULT_NEAR_DUP_COSINE = 0
// Gemessen 20.09.2026: die realen Kopien liegen im Embedding-Raum bei Cosine 0,64–0,90 (Erlass vs.
// „Ueberprueft“ max 0,77; Statusnotiz vs. „(2)“-Kopie 0,70–0,99) — eine Schwelle ≥ 0,93 änderte am
// Tuning-Set nichts (Ø Dateien je Antwort 5,9 in allen Stufen), niedrigere Schwellen träfen echte
// Nachbarabschnitte. Deshalb aus; stattdessen greift der Deckel pro Dateifamilie (`familyKey`).

/**
 * Dateifamilie: nur das maschinell erzeugte Kopie-Muster „Notiz (2).md“, „Notiz (6).md“ — so legen
 * Finder und die App selbst Kopien an. Real belegten vier Fassungen einer Statusnotiz vier der acht
 * Quellenplätze.
 *
 * BEWUSST NICHT gruppiert werden Endungen wie „- alt“, „- neu“, „- final“, „- v2“ oder
 * „- Ueberprueft“ (Codex F45): das sind vom Nutzer vergebene Namen für eigenständige Fassungen.
 * Da `selectHits` die zweite Datei einer Familie VOLLSTÄNDIG verwirft, würde eine solche Heuristik
 * einen legitimen Entwurf unsichtbar machen — teurer als die doppelte Quelle, die sie spart.
 */
export function familyKey(fileRel: string): string {
  return fileRel.replace(/\.md$/i, '').replace(/ \(\d+\)$/, '').toLowerCase()
}
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

export interface SelectForQueryOptions {
  topK: number
  minScore: number
  perFileCap: number
  oversample: number
  excludeFolders: string[]
  filters?: VaultQueryFilters
  lexicalWeight: number
  nearDupCosine: number
}

/**
 * Der produktive Auswahlpfad in EINER Funktion: Kandidaten (topK × oversample) → Floor →
 * Wortabgleich zur Umsortierung → Dedupe/Deckel. Das Eval-Skript ruft genau diese Funktion auf,
 * damit Messung und App nicht auseinanderlaufen (Codex F43: das Harness rerankte zuvor 100
 * Kandidaten und schnitt erst danach auf 32 — ein Treffer auf Rang 40 konnte dort in die Top 8
 * gelangen, im Produkt nie). `score` bleibt überall die Bedeutungsnähe.
 */
export function selectForQuery(
  container: VaultIndexContainer,
  queryVec: Float32Array,
  query: string,
  opts: SelectForQueryOptions
): { selected: Array<{ chunk: VaultChunkMeta; score: number }>; bestScore: number | null; belowFloor: boolean; candidatesConsidered: number } {
  const ranked = rankCandidates(container, queryVec, opts.filters, opts.topK * opts.oversample, opts.excludeFolders)
  const bestScore = ranked.length > 0 ? ranked[0].score : null
  if (bestScore === null || bestScore < opts.minScore) {
    return { selected: [], bestScore, belowFloor: true, candidatesConsidered: ranked.length }
  }
  const passing = rerankLexical(container, query, ranked.filter((r) => r.score >= opts.minScore), opts.lexicalWeight)
  const selected = selectHits(container, passing, opts.topK, opts.perFileCap, opts.nearDupCosine)
  return { selected, bestScore, belowFloor: false, candidatesConsidered: ranked.length }
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
      // `isIndexable` IMMER, nicht nur bei gesetzten Nutzer-Ausschlüssen: die permanenten Regeln
      // (Vorlagen, Skills, node_modules) müssen auch einen Altindex sofort filtern (Codex F42).
      ok = file ? matchesFilters(rel, file, filters) && isIndexable(rel, excludeFolders) : false
      allowed.set(rel, ok)
    }
    if (!ok) continue
    scored.push({ row, score: cosineRow(vectors, row, dim, queryVec, qNorm) })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

/**
 * Umsortierung der Floor-Kandidaten nach Bedeutungsnähe + Gewicht × seltenheitsgewichtetem
 * Wortabgleich (`shared/rag/lexical.ts`). `score` bleibt die Bedeutungsnähe (Anzeige, Floor).
 */
export function rerankLexical(
  container: VaultIndexContainer,
  query: string,
  ranked: Array<{ row: number; score: number }>,
  weight: number
): Array<{ row: number; score: number }> {
  if (weight <= 0 || ranked.length === 0) return ranked
  const index = lexicalIndexFor(container)
  return ranked
    .map((r) => {
      const ch = container.meta.chunks[r.row]
      return { ...r, combined: r.score + weight * lexicalOverlap(index, query, chunkLexicalText(ch.fileRel, ch.heading, ch.text)) }
    })
    .sort((a, b) => b.combined - a.combined)
    .map(({ row, score }) => ({ row, score }))
}

/** Dedupe (exakt, normalisiert) und Pro-Datei-Deckel in Score-Reihenfolge bis Top-K. */
export function selectHits(
  container: VaultIndexContainer,
  ranked: Array<{ row: number; score: number }>,
  topK: number,
  perFileCap: number,
  nearDupCosine = DEFAULT_NEAR_DUP_COSINE
): Array<{ chunk: VaultChunkMeta; score: number }> {
  const seen = new Set<string>()
  const perFile = new Map<string, number>()
  /** Je Dateifamilie zählt nur die zuerst gewählte Datei — Kopien bekommen keinen eigenen Platz. */
  const familyFile = new Map<string, string>()
  const out: Array<{ chunk: VaultChunkMeta; score: number }> = []
  const chosenRows: number[] = []
  const { vectors } = container
  const dim = container.meta.identity.dim
  for (const r of ranked) {
    const chunk = container.meta.chunks[r.row]
    const key = dedupeKey(chunk.text)
    if (seen.has(key)) continue
    const family = familyKey(chunk.fileRel)
    const owner = familyFile.get(family)
    if (owner !== undefined && owner !== chunk.fileRel) continue
    const n = perFile.get(family) ?? 0
    if (n >= perFileCap) continue
    if (nearDupCosine > 0 && chosenRows.length > 0) {
      // Near-Duplikat eines schon gewählten Treffers (Kopie derselben Notiz, leicht geändert)?
      const cand = vectors.subarray(r.row * dim, (r.row + 1) * dim)
      const candNorm = vectorNorm(cand)
      if (chosenRows.some((row) => cosineRow(vectors, row, dim, cand, candNorm) >= nearDupCosine)) continue
    }
    seen.add(key)
    perFile.set(family, n + 1)
    familyFile.set(family, chunk.fileRel)
    chosenRows.push(r.row)
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
    // Abgeleitete KI-Notizen (gespeicherte Antworten, Brain-Tage) sind keine Quellen. Die Prüfung
    // am FRISCHEN Inhalt wirkt sofort, auch wenn ein vor der Regel gebauter Index sie noch
    // enthält oder eine Notiz nachträglich zur Antwortnotiz wurde (Codex F42).
    if (isDerivedAiNote(fresh.canonical)) {
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

  const picked = selectForQuery(container, Float32Array.from(qv), opts.query, {
    topK, minScore, perFileCap, oversample,
    excludeFolders: opts.excludeFolders ?? [],
    filters: opts.filters,
    lexicalWeight: opts.lexicalWeight ?? DEFAULT_LEXICAL_WEIGHT,
    nearDupCosine: opts.nearDupCosine ?? DEFAULT_NEAR_DUP_COSINE
  })
  const { bestScore, selected } = picked
  if (picked.belowFloor) {
    return empty({ belowFloor: true, bestScore, candidatesConsidered: picked.candidatesConsidered })
  }
  const { hits, staleFiles } = await verifyHits(vaultPath, container, selected, assertSafePath, opts.filters)
  return {
    hits,
    belowFloor: false,
    noFreshSource: hits.length === 0,
    bestScore,
    candidatesConsidered: picked.candidatesConsidered,
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
