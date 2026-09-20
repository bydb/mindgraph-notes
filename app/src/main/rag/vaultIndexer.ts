/**
 * Vault-Indexer: streamend, unterbrechbar, mit dauerhaften Checkpoints
 * (Vault-Chat-Plan Rev. 3, Entscheidungen 4–8, F04, F05, F19, F20).
 *
 * Ablauf eines Laufs:
 *   1. Modell auflösen (Digest aus /api/tags) + Dimension per Probe-Embedding
 *   2. Vault scannen (isIndexable), vorhandenen Container und Checkpoint laden
 *   3. Pakete à 20 Dateien: lesen → hashen → unverändert? (Container/Staging)
 *      sonst chunken → einbetten (Pause VOR jedem Request, laufende Requests
 *      werden bei Vordergrundbeginn abgebrochen und wiederholt)
 *      → Segment auf die Platte → Checkpoint
 *   4. Digest erneut prüfen → Container atomar schreiben → Staging aufräumen
 *
 * Nichts hier kennt Electron oder IPC; der Manager reicht Pfade und Callbacks.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { chunkMarkdown } from '../../shared/rag/chunking'
import { prepareTextForEmbedding } from '../../shared/rag/similarity'
import { RAG_INDEX_VERSION } from '../../shared/rag/types'
import {
  RAG_VAULT_FORMAT_VERSION,
  excludeKeyFor,
  embeddingsCompatible,
  isIndexable,
  normalizeFolderPrefix,
  normalizeRelPath,
  type VaultChunkMeta,
  type VaultFileMeta,
  type VaultIndexContainer,
  type VaultIndexIdentity,
  type VaultIndexMeta
} from '../../shared/rag/vaultIndex'
import { isDerivedAiNote } from '../../shared/rag/indexPolicy'
import { getNoteKindStrict, resolveNoteDate } from '../../shared/noteKind'
import { embedText, EmbeddingAbortedError } from './embed'
import { resolveLocalModel } from './localModel'
import { ollamaForegroundCount, onOllamaActivityChange, waitForOllamaIdle } from './ollamaActivity'
import {
  loadCheckpoint,
  loadSegment,
  loadVaultIndexFile,
  readCanonicalFile,
  removeOtherVaultIndexes,
  removeStagingDir,
  saveCheckpoint,
  sha256Hex,
  stagingDirFor,
  vaultIndexPath,
  writeSegment,
  writeVaultIndexAtomic,
  cleanupVaultIndexTemps,
  type StagingCheckpoint
} from './vaultStore'

type AssertSafePath = (p: string, op: string) => Promise<string>

export type VaultBuildPhase = 'preparing' | 'scanning' | 'embedding' | 'writing' | 'done' | 'cancelled' | 'error'
export type VaultBuildMode = 'full' | 'incremental'

export interface VaultBuildProgress {
  jobId: string
  mode: VaultBuildMode
  phase: VaultBuildPhase
  filesTotal: number
  filesDone: number
  chunksPlanned: number
  chunksEmbedded: number
  chunksReused: number
  paused: null | 'user' | 'foreground'
  startedAt: number
  etaMs: number | null
  message?: string
  error?: string
}

export interface ScannedFile {
  rel: string
  abs: string
  mtime: number
  size: number
}

export interface VaultIndexJobOptions {
  jobId: string
  vaultPath: string
  userDataPath: string
  embedModel: string
  excludeFolders: string[]
  mode: VaultBuildMode
  /** Nur im inkrementellen Modus: geänderte/neue bzw. gelöschte Dateien (vault-relativ). */
  changed?: Set<string>
  /** Inkrementell, aber JEDE Datei neu hashen (Warteschlange lief über — Codex F32). */
  rescanAll?: boolean
  /** Bereits geladener Container (spart einen Parse); wird auf Identität geprüft. */
  existing?: VaultIndexContainer | null
  assertSafePath: AssertSafePath
  onProgress: (p: VaultBuildProgress) => void
  concurrency?: number
  packetSize?: number
  now?: () => number
}

export interface VaultIndexJobResult {
  status: 'done' | 'cancelled' | 'error'
  error?: string
  file?: string
  chunkCount?: number
  fileCount?: number
  durationMs: number
}

const DEFAULT_CONCURRENCY = 3
const DEFAULT_PACKET = 20
const PROGRESS_THROTTLE_MS = 400

class CancelledError extends Error {
  constructor() {
    super('Index-Aufbau abgebrochen')
    this.name = 'CancelledError'
  }
}

const yieldToLoop = (): Promise<void> => new Promise((r) => setImmediate(r))

/** Rekursiver Scan; Ausschlüsse greifen schon auf Ordnerebene (spart Tausende stat-Aufrufe). */
export async function scanVaultFiles(
  vaultPath: string,
  excludeFolders: string[],
  assertSafePath: AssertSafePath,
  signal?: AbortSignal
): Promise<ScannedFile[]> {
  const out: ScannedFile[] = []
  const excludePrefixes = excludeFolders.map(normalizeFolderPrefix).filter(Boolean)
  let counter = 0

  async function walk(dirAbs: string, dirRel: string): Promise<void> {
    if (signal?.aborted) throw new CancelledError()
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        const prefix = `${rel}/`
        if (excludePrefixes.some((p) => prefix.startsWith(p))) continue
        await walk(path.join(dirAbs, entry.name), rel)
        continue
      }
      if (!entry.isFile()) continue
      if (!isIndexable(rel, excludeFolders)) continue
      try {
        const safe = await assertSafePath(path.join(dirAbs, entry.name), 'vault-rag-scan')
        const st = await fs.stat(safe)
        out.push({ rel, abs: safe, mtime: st.mtimeMs, size: st.size })
      } catch {
        /* außerhalb des Vaults oder verschwunden */
      }
      if (++counter % 200 === 0) await yieldToLoop()
    }
  }

  await walk(vaultPath, '')
  out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  return out
}

/** Umfang für die Opt-in-Karte: Dateien, Bytes, grobe Chunkzahl (~1000 Zeichen je Chunk). */
export async function estimateVault(
  vaultPath: string,
  excludeFolders: string[],
  assertSafePath: AssertSafePath
): Promise<{ files: number; bytes: number; chunksApprox: number }> {
  const files = await scanVaultFiles(vaultPath, excludeFolders, assertSafePath)
  const bytes = files.reduce((n, f) => n + f.size, 0)
  return { files: files.length, bytes, chunksApprox: Math.round(bytes / 1000) }
}

interface PreparedChunk {
  meta: VaultChunkMeta
  embedInput: string
}

type Decision =
  | { kind: 'existing' }
  | { kind: 'staged'; segment: string }
  | { kind: 'embedded'; segment: string }

export class VaultIndexJob {
  private readonly cancelCtl = new AbortController()
  private cancelled = false
  /** Erster Worker-Fehler: alle anderen Requests abbrechen, KEIN Retry (Codex F31). */
  private failure: Error | null = null
  private userPaused = false
  private resumeWaiters: Array<() => void> = []
  private readonly inflight = new Set<AbortController>()
  private offActivity: (() => void) | null = null
  private progress: VaultBuildProgress
  private lastEmit = 0
  private embedMsTotal = 0
  private readonly now: () => number
  private readonly concurrency: number
  private readonly packetSize: number

  constructor(private readonly opts: VaultIndexJobOptions) {
    this.now = opts.now ?? Date.now
    this.concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY
    this.packetSize = opts.packetSize ?? DEFAULT_PACKET
    this.progress = {
      jobId: opts.jobId,
      mode: opts.mode,
      phase: 'preparing',
      filesTotal: 0,
      filesDone: 0,
      chunksPlanned: 0,
      chunksEmbedded: 0,
      chunksReused: 0,
      paused: null,
      startedAt: this.now(),
      etaMs: null
    }
  }

  get snapshot(): VaultBuildProgress {
    return { ...this.progress }
  }

  pause(): void {
    this.userPaused = true
    this.emit(true)
  }

  resume(): void {
    this.userPaused = false
    const waiters = this.resumeWaiters
    this.resumeWaiters = []
    for (const w of waiters) w()
    this.emit(true)
  }

  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    this.cancelCtl.abort(new CancelledError())
    for (const c of this.inflight) c.abort()
    this.resume()
  }

  private emit(force = false, patch: Partial<VaultBuildProgress> = {}): void {
    Object.assign(this.progress, patch)
    const t = this.now()
    if (!force && t - this.lastEmit < PROGRESS_THROTTLE_MS) return
    this.lastEmit = t
    this.opts.onProgress({ ...this.progress })
  }

  private throwIfCancelled(): void {
    if (this.cancelled) throw new CancelledError()
  }

  /** Vor JEDEM Embedding-Request: Nutzer-Pause und Vordergrund-Aktivität abwarten. */
  private async gate(): Promise<void> {
    for (;;) {
      this.throwIfCancelled()
      if (this.userPaused) {
        this.emit(true, { paused: 'user' })
        await new Promise<void>((resolve) => this.resumeWaiters.push(resolve))
        continue
      }
      if (ollamaForegroundCount() > 0) {
        this.emit(true, { paused: 'foreground' })
        await waitForOllamaIdle(this.cancelCtl.signal).catch(() => undefined)
        continue
      }
      if (this.progress.paused !== null) this.emit(true, { paused: null })
      return
    }
  }

  private async embedWithRetry(input: string): Promise<number[]> {
    for (;;) {
      await this.gate()
      const ctl = new AbortController()
      this.inflight.add(ctl)
      const started = this.now()
      try {
        const v = await embedText(this.opts.embedModel, input, { signal: ctl.signal })
        this.embedMsTotal += this.now() - started
        return v
      } catch (err) {
        if (err instanceof EmbeddingAbortedError) {
          this.throwIfCancelled()
          if (this.failure) throw this.failure // ein anderer Worker ist gescheitert → kein Retry
          continue // Vordergrund hat den Request unterbrochen → nach der Pause wiederholen
        }
        throw err
      } finally {
        this.inflight.delete(ctl)
      }
    }
  }

  private async embedChunks(chunks: PreparedChunk[], dim: number): Promise<Float32Array> {
    const vectors = new Float32Array(chunks.length * dim)
    let next = 0
    const worker = async (): Promise<void> => {
      for (;;) {
        if (this.failure) return
        const i = next++
        if (i >= chunks.length) return
        let v: number[]
        try {
          v = await this.embedWithRetry(chunks[i].embedInput)
        } catch (err) {
          // Gemeinsamer terminaler Zustand: erster Fehler stoppt alle Worker, laufende
          // Requests werden abgebrochen und NICHT wiederholt (Codex F31).
          if (!this.failure && !this.cancelled) this.failure = err instanceof Error ? err : new Error(String(err))
          for (const c of this.inflight) c.abort()
          return
        }
        if (v.length !== dim) {
          this.failure = new Error(`Embedding-Dimension ${v.length} ≠ ${dim} — Modell hat sich während des Laufs geändert`)
          for (const c of this.inflight) c.abort()
          return
        }
        vectors.set(v, i * dim)
        this.progress.chunksEmbedded++
        this.emit(false, { etaMs: this.eta() })
      }
    }
    // Alle Worker abwarten — auch nach einem Fehler darf keiner weiterarbeiten.
    await Promise.allSettled(Array.from({ length: Math.min(this.concurrency, chunks.length) }, worker))
    this.throwIfCancelled()
    if (this.failure) throw this.failure
    return vectors
  }

  private eta(): number | null {
    const p = this.progress
    if (p.chunksEmbedded < 10 || p.filesDone === 0) return null
    const msPerChunk = this.embedMsTotal / p.chunksEmbedded / this.concurrency
    const remainingFiles = Math.max(0, p.filesTotal - p.filesDone)
    const chunksPerFile = p.chunksPlanned / p.filesDone
    return Math.round(remainingFiles * chunksPerFile * msPerChunk)
  }

  private prepareChunks(rel: string, canonical: string): PreparedChunk[] {
    return chunkMarkdown(canonical).map((c) => ({
      meta: {
        fileRel: rel,
        chunkIndex: c.chunkIndex,
        heading: c.heading,
        sourceStart: c.sourceStart,
        sourceEnd: c.sourceEnd,
        startLine: c.startLine,
        chunkHash: sha256Hex(c.text),
        text: c.text
      },
      embedInput: prepareTextForEmbedding(c.text) || c.text
    }))
  }

  async run(): Promise<VaultIndexJobResult> {
    const started = this.now()
    const { vaultPath, userDataPath, embedModel, excludeFolders, assertSafePath } = this.opts
    this.offActivity = onOllamaActivityChange((n) => {
      if (n > 0) for (const c of this.inflight) c.abort()
    })
    let stagingDir: string | null = null
    try {
      // 1. Modell + Dimension
      this.emit(true, { phase: 'preparing', message: 'Modell prüfen' })
      const model = await resolveLocalModel(embedModel, { fresh: true })
      // Die Probe-Einbettung lädt das Modell in Ollama — neben einem großen Chatmodell real 42 s.
      this.emit(true, { phase: 'preparing', message: 'Embedding-Modell laden (beim ersten Mal bis zu einer Minute)' })
      const probe = await this.embedWithRetry('Dimension')
      const dim = probe.length
      const identity: VaultIndexIdentity = {
        model: model.name,
        digest: model.digest,
        dim,
        formatVersion: RAG_VAULT_FORMAT_VERSION,
        chunkingVersion: RAG_INDEX_VERSION,
        excludeKey: excludeKeyFor(excludeFolders)
      }
      // Ordner NUR unter einem geprüften Elternpfad anlegen (F34): erst `.mindgraph` prüfen
      // (Symlink nach außen → Ablehnung, kein mkdir), dann `rag` darunter anlegen, dann
      // den Zielpfad prüfen. Eine Pfadschutz-Ablehnung ist nie eine Erlaubnis zum Anlegen.
      const mindgraphDir = await assertSafePath(path.join(vaultPath, '.mindgraph'), 'vault-rag-dir')
      await fs.mkdir(path.join(mindgraphDir, 'rag'), { recursive: true })
      const ragDir = await assertSafePath(path.join(mindgraphDir, 'rag'), 'vault-rag-dir')
      const indexFile = await assertSafePath(path.join(ragDir, path.basename(vaultIndexPath(vaultPath, identity))), 'vault-rag-index-file')
      stagingDir = stagingDirFor(userDataPath, vaultPath, identity)

      // 2. Scan + Bestand
      this.emit(true, { phase: 'scanning', message: 'Vault durchsuchen' })
      const files = await scanVaultFiles(vaultPath, excludeFolders, assertSafePath, this.cancelCtl.signal)
      this.emit(true, { filesTotal: files.length })

      let existing: VaultIndexContainer | null = this.opts.existing ?? null
      // Wiederverwendung: gleiche Einbettung (Modell, Digest, Dimension, Versionen) genügt —
      // eine andere Ausschlussliste ändert nur, welche Dateien im Index landen.
      if (existing && !embeddingsCompatible(existing.meta.identity, identity)) existing = null
      if (!existing) existing = await loadVaultIndexFile(indexFile)
      if (existing && !embeddingsCompatible(existing.meta.identity, identity)) existing = null
      const existingRows = new Map<string, number[]>()
      if (existing) {
        existing.meta.chunks.forEach((c, i) => {
          const arr = existingRows.get(c.fileRel) ?? []
          arr.push(i)
          existingRows.set(c.fileRel, arr)
        })
      }

      let checkpoint: StagingCheckpoint | null = await loadCheckpoint(stagingDir, identity)
      if (!checkpoint) {
        await removeStagingDir(stagingDir)
        checkpoint = { identity, files: {}, segments: [], updatedAt: this.now() }
      }
      // Defekte Segmente konsequent aus dem Checkpoint entfernen (Codex F37): sonst bleibt
      // ihre Referenz stehen und das Zusammensetzen scheitert bei jedem Resume erneut.
      // Datei→Segment UND Datei→Hash werden aus den tatsächlich gültigen Segmenten
      // rekonstruiert (jüngstes gültiges gewinnt) — nie aus einem Hash, dessen Segment
      // defekt ist (Codex F37).
      const stagedIn = new Map<string, string>() // rel → Segmentname (jüngstes gültiges Segment gewinnt)
      const stagedHash: Record<string, string> = {}
      const validSegments: StagingCheckpoint['segments'] = []
      for (const seg of checkpoint.segments) {
        const c = await loadSegment(stagingDir, seg.name, identity)
        if (!c) continue
        validSegments.push(seg)
        for (const [rel, fm] of Object.entries(c.meta.files)) {
          stagedIn.set(rel, seg.name)
          stagedHash[rel] = fm.sourceHash
        }
      }
      const repaired = validSegments.length !== checkpoint.segments.length
        || Object.keys(checkpoint.files).length !== Object.keys(stagedHash).length
        || Object.entries(stagedHash).some(([rel, h]) => checkpoint.files[rel] !== h)
      if (repaired) {
        checkpoint.segments = validSegments
        checkpoint.files = stagedHash
        checkpoint.updatedAt = this.now()
        await saveCheckpoint(stagingDir, checkpoint)
      }

      // 3. Pakete
      this.emit(true, { phase: 'embedding', message: undefined })
      const decisions = new Map<string, Decision>()
      const changed = this.opts.changed
      // Segmentnamen unabhängig von der Listenlänge eindeutig (F37): nach einer Reparatur
      // darf ein neues Segment nie ein gültiges überschreiben.
      let segmentCounter = 0
      const segmentName = () => `seg-${this.now().toString(36)}-${(segmentCounter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}.ragbin`

      for (let start = 0; start < files.length; start += this.packetSize) {
        this.throwIfCancelled()
        const packet = files.slice(start, start + this.packetSize)
        const toEmbed: PreparedChunk[] = []
        const packetFiles: Record<string, VaultFileMeta> = {}

        for (const f of packet) {
          // Inkrementell: unveränderte, bekannte Dateien ohne Lesen übernehmen (außer rescanAll).
          if (this.opts.mode === 'incremental' && !this.opts.rescanAll && existing && existingRows.has(f.rel) && !(changed?.has(f.rel))) {
            decisions.set(f.rel, { kind: 'existing' })
            this.progress.chunksReused += existingRows.get(f.rel)!.length
            continue
          }
          let file
          try {
            file = await readCanonicalFile(f.abs)
          } catch {
            continue // verschwunden → nicht im Index
          }
          // Abgeleitete KI-Notizen (gespeicherte Chat-Antworten, Brain-Tagesnotizen) sind keine
          // Quellen — sonst zitiert die App ihre eigene Antwort (Phase 3, `indexPolicy.ts`).
          if (isDerivedAiNote(file.canonical)) continue
          const prevMeta = existing?.meta.files[f.rel]
          if (prevMeta && prevMeta.sourceHash === file.sourceHash && existingRows.has(f.rel)) {
            decisions.set(f.rel, { kind: 'existing' })
            this.progress.chunksReused += existingRows.get(f.rel)!.length
            continue
          }
          const stagedHash = checkpoint.files[f.rel]
          const stagedSeg = stagedIn.get(f.rel)
          if (stagedHash && stagedHash === file.sourceHash && stagedSeg) {
            decisions.set(f.rel, { kind: 'staged', segment: stagedSeg })
            continue
          }
          const chunks = this.prepareChunks(f.rel, file.canonical)
          const date = resolveNoteDate(f.rel, file.canonical, file.mtime)
          packetFiles[f.rel] = {
            sourceHash: file.sourceHash,
            mtime: file.mtime,
            size: file.size,
            kind: getNoteKindStrict(f.rel, file.canonical),
            dateValue: date.dateValue,
            dateSource: date.dateSource
          }
          toEmbed.push(...chunks)
          await yieldToLoop()
        }

        this.progress.chunksPlanned += toEmbed.length
        if (toEmbed.length > 0 || Object.keys(packetFiles).length > 0) {
          const vectors = toEmbed.length > 0 ? await this.embedChunks(toEmbed, dim) : new Float32Array(0)
          const segName = segmentName()
          const segMeta: VaultIndexMeta = {
            identity,
            createdAt: this.now(),
            files: packetFiles,
            chunks: toEmbed.map((c) => c.meta)
          }
          await writeSegment(stagingDir, segName, { meta: segMeta, vectors, generation: checkpoint.segments.length + 1 })
          for (const rel of Object.keys(packetFiles)) {
            checkpoint.files[rel] = packetFiles[rel].sourceHash
            stagedIn.set(rel, segName)
            decisions.set(rel, { kind: 'embedded', segment: segName })
          }
          checkpoint.segments.push({ name: segName, chunkCount: toEmbed.length })
          checkpoint.updatedAt = this.now()
          await saveCheckpoint(stagingDir, checkpoint)
        }
        this.progress.filesDone = Math.min(files.length, start + packet.length)
        this.emit(true, { etaMs: this.eta() })
      }

      // 4. Digest erneut prüfen, zusammensetzen, atomar schreiben
      this.throwIfCancelled()
      this.emit(true, { phase: 'writing', message: 'Index schreiben', etaMs: null })
      const writingStarted = this.now()
      const after = await resolveLocalModel(embedModel, { fresh: true })
      if (after.digest !== identity.digest) {
        throw new Error(`Modell „${embedModel}" hat sich während des Laufs geändert (Digest) — Lauf verworfen, bitte neu starten`)
      }

      const segments = new Map<string, VaultIndexContainer>()
      const segmentRows = new Map<string, Map<string, number[]>>()
      for (const seg of checkpoint.segments) {
        const c = await loadSegment(stagingDir, seg.name, identity)
        if (!c) throw new Error(`Staging-Segment ${seg.name} unlesbar — Lauf bitte neu starten`)
        segments.set(seg.name, c)
        const rows = new Map<string, number[]>()
        c.meta.chunks.forEach((ch, i) => {
          const arr = rows.get(ch.fileRel) ?? []
          arr.push(i)
          rows.set(ch.fileRel, arr)
        })
        segmentRows.set(seg.name, rows)
      }

      const metaFiles: Record<string, VaultFileMeta> = {}
      const metaChunks: VaultChunkMeta[] = []
      const parts: Float32Array[] = []
      const pushRows = (container: VaultIndexContainer, rows: number[]) => {
        for (const i of rows) {
          metaChunks.push(container.meta.chunks[i])
          parts.push(container.vectors.subarray(i * dim, (i + 1) * dim))
        }
      }
      for (const f of files) {
        const d = decisions.get(f.rel)
        if (!d) continue
        if (d.kind === 'existing' && existing) {
          metaFiles[f.rel] = existing.meta.files[f.rel]
          pushRows(existing, existingRows.get(f.rel) ?? [])
        } else if (d.kind === 'staged' || d.kind === 'embedded') {
          const seg = segments.get(d.segment)
          if (!seg) continue
          metaFiles[f.rel] = seg.meta.files[f.rel]
          pushRows(seg, segmentRows.get(d.segment)?.get(f.rel) ?? [])
        }
      }
      // chunkIndex bleibt pro Datei stabil; die globale Reihenfolge ist Dateireihenfolge.
      const meta: VaultIndexMeta = { identity, createdAt: this.now(), files: metaFiles, chunks: metaChunks }
      const generation = (existing?.generation ?? 0) + 1
      await writeVaultIndexAtomic(indexFile, meta, coalesceParts(parts), generation)
      await removeOtherVaultIndexes(ragDir, indexFile, assertSafePath)
      await cleanupVaultIndexTemps(ragDir, assertSafePath)
      await removeStagingDir(stagingDir)

      // Keine zusätzliche Vollkopie der Vektoren im Ergebnis (Messlauf 18.09.: Peak-RSS
      // 389 MB bei 19 030 Chunks) — der Manager lädt den Container aus der Datei (~300 ms).
      console.info(`[VaultRAG] Commit (Segmente zusammensetzen, schreiben, fsync, rename) in ${Math.round(this.now() - writingStarted)} ms`)
      this.emit(true, { phase: 'done', message: undefined })
      return {
        status: 'done',
        file: indexFile,
        chunkCount: metaChunks.length,
        fileCount: Object.keys(metaFiles).length,
        durationMs: this.now() - started
      }
    } catch (err) {
      if (this.cancelled || err instanceof CancelledError) {
        this.emit(true, { phase: 'cancelled', paused: null, message: undefined })
        return { status: 'cancelled', durationMs: this.now() - started }
      }
      const message = err instanceof Error ? err.message : String(err)
      this.emit(true, { phase: 'error', paused: null, error: message })
      return { status: 'error', error: message, durationMs: this.now() - started }
    } finally {
      this.offActivity?.()
      this.offActivity = null
      for (const c of this.inflight) c.abort()
      this.inflight.clear()
      void stagingDir
    }
  }
}

/** Benachbarte Teilstücke desselben Puffers zu einem zusammenfassen (weniger Schreibaufrufe). */
export function coalesceParts(parts: Float32Array[]): Float32Array[] {
  const out: Float32Array[] = []
  for (const p of parts) {
    const last = out[out.length - 1]
    if (last && last.buffer === p.buffer && last.byteOffset + last.byteLength === p.byteOffset) {
      out[out.length - 1] = new Float32Array(last.buffer, last.byteOffset, last.length + p.length)
    } else {
      out.push(p)
    }
  }
  return out
}

export { normalizeRelPath }
