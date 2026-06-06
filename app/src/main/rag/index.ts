/**
 * Projekt-RAG Index: On-demand pro Projektordner, inkrementell via mtime.
 *
 * Index-Datei: `<vault>/.mindgraph/rag/<sanitized-folder>.json` (geräte-lokal,
 * innerhalb der approved Vault-Root → assertSafePath greift).
 *
 * Invalidation-Trias:
 *   1. version ≠ RAG_INDEX_VERSION  → Voll-Rebuild
 *   2. model ≠ aktuelles Modell      → Voll-Rebuild (Vektoren modell-inkompatibel)
 *   3. Datei-mtime > Chunk-mtime      → nur diese Datei neu chunken+embedden;
 *      fehlende Datei → ihre Chunks droppen.
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { createHash } from 'crypto'
import { chunkMarkdown } from '../../shared/rag/chunking'
import { prepareTextForEmbedding } from '../../shared/rag/similarity'
import { RAG_INDEX_VERSION, type RagIndex, type RagChunk, type RagIndexStatus } from '../../shared/rag/types'
import { embedBatch } from './embed'

const RAG_DIR = path.join('.mindgraph', 'rag')

// Sicherheitsnetz gegen Mammut-Projekte: mehr Chunks würden Ollama und die
// JSON-Datei sprengen. Bei Überschreiten wird gewarnt und gedeckelt.
const MAX_CHUNKS_PER_PROJECT = 2000

type AssertSafePath = (p: string, op: string) => Promise<string>

/** Lesbarer (aber NICHT eindeutiger) Slug-Teil des Dateinamens. */
export function sanitizeProjectName(folderRel: string): string {
  return folderRel.replace(/[/\\:]+/g, '-').replace(/\s+/g, '_').replace(/[^\w.\-äöüÄÖÜß]/g, '').slice(0, 80)
}

// Dateiname = lesbarer Slug + 12-Hex-Hash des VOLLEN folderRel. Der Hash macht den
// Namen eindeutig — ohne ihn kollidierten z.B. „A/B", „A:B", „A-B" oder lange Namen
// nach dem Slice auf denselben Slug (→ gegenseitiges Überschreiben / falscher Kontext).
export function ragIndexPath(vaultPath: string, projectFolderRel: string): string {
  const hash = createHash('sha256').update(projectFolderRel).digest('hex').slice(0, 12)
  return path.join(vaultPath, RAG_DIR, `${sanitizeProjectName(projectFolderRel)}--${hash}.json`)
}

interface SourceFile {
  fileRel: string
  mtime: number
  read: () => Promise<string>
}

/**
 * Sammelt alle einzubettenden Quelldateien eines Projekts: alle `.md` außer
 * `_STATUS*` und versteckte Dateien/Ordner. Jeder Pfad wird via assertSafePath
 * geprüft (Defense-in-Depth gegen kompromittierten Renderer).
 */
export async function collectSourceFiles(
  projectAbs: string,
  vaultPath: string,
  assertSafePath: AssertSafePath
): Promise<SourceFile[]> {
  const out: SourceFile[] = []

  async function scan(dir: string): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await scan(full)
        continue
      }
      if (!entry.name.endsWith('.md')) continue
      if (entry.name.startsWith('_STATUS')) continue
      try {
        const safe = await assertSafePath(full, 'project-rag-collect')
        const stats = await fs.stat(safe)
        out.push({
          fileRel: path.relative(vaultPath, safe),
          mtime: stats.mtimeMs,
          read: () => fs.readFile(safe, 'utf-8')
        })
      } catch {
        // Pfad außerhalb Vault oder Datei verschwand → überspringen.
      }
    }
  }

  await scan(projectAbs)
  return out
}

export async function loadIndex(
  vaultPath: string,
  projectFolderRel: string
): Promise<RagIndex | null> {
  try {
    const content = await fs.readFile(ragIndexPath(vaultPath, projectFolderRel), 'utf-8')
    const idx = JSON.parse(content) as RagIndex
    if (!idx || !Array.isArray(idx.chunks)) return null
    // Defense-in-Depth: nur akzeptieren, wenn die Datei wirklich zu DIESEM Projekt
    // gehört (gegen Hash-/Slug-Kollisionen) → sonst als „nicht vorhanden" behandeln.
    if (idx.projectFolderRel !== projectFolderRel) return null
    return idx
  } catch {
    return null
  }
}

async function writeIndex(vaultPath: string, idx: RagIndex, assertSafePath: AssertSafePath): Promise<void> {
  const file = ragIndexPath(vaultPath, idx.projectFolderRel)
  await fs.mkdir(path.dirname(file), { recursive: true })
  const safe = await assertSafePath(file, 'project-rag-write-index')
  // Ohne Pretty-Print — Embeddings sind groß (bge-m3 = 1024 Dim/Chunk).
  await fs.writeFile(safe, JSON.stringify(idx), 'utf-8')
}

/** Liefert Status ohne Build (für Badges). `stale`, wenn eine Quelldatei jünger ist. */
export async function getIndexStatus(
  vaultPath: string,
  projectFolderRel: string,
  currentModel: string,
  assertSafePath: AssertSafePath
): Promise<RagIndexStatus> {
  const projectAbs = path.join(vaultPath, projectFolderRel)
  const idx = await loadIndex(vaultPath, projectFolderRel)
  const sources = await collectSourceFiles(projectAbs, vaultPath, assertSafePath)

  if (!idx) {
    return { exists: false, chunkCount: 0, fileCount: sources.length, model: null, lastUpdated: null, stale: sources.length > 0 }
  }

  const versionStale = idx.version !== RAG_INDEX_VERSION || idx.model !== currentModel
  const indexedFiles = new Map<string, number>()
  for (const c of idx.chunks) {
    indexedFiles.set(c.fileRel, Math.max(indexedFiles.get(c.fileRel) ?? 0, c.mtime))
  }
  let fileStale = false
  const seen = new Set<string>()
  for (const s of sources) {
    seen.add(s.fileRel)
    const indexedMtime = indexedFiles.get(s.fileRel)
    if (indexedMtime === undefined || s.mtime > indexedMtime + 1) {
      fileStale = true
      break
    }
  }
  // Gelöschte Dateien, die noch im Index stehen → ebenfalls stale.
  if (!fileStale) {
    for (const f of indexedFiles.keys()) {
      if (!seen.has(f)) {
        fileStale = true
        break
      }
    }
  }

  const fileCount = new Set(idx.chunks.map((c) => c.fileRel)).size
  return {
    exists: true,
    chunkCount: idx.chunks.length,
    fileCount,
    model: idx.model,
    lastUpdated: idx.lastUpdated,
    stale: versionStale || fileStale
  }
}

// In-Memory-Lock: zwei Surfaces (Widget + NotesChat) dürfen denselben Index nicht
// gleichzeitig bauen — der zweite Aufruf wartet auf den ersten.
const buildLocks = new Map<string, Promise<RagIndex>>()

/**
 * Baut oder aktualisiert den Index inkrementell.
 * @param now Zeitstempel (Date.now() im Aufrufer — Scripts/Tests können ihn injizieren).
 */
export async function buildOrUpdateIndex(
  vaultPath: string,
  projectFolderRel: string,
  model: string,
  assertSafePath: AssertSafePath,
  onProgress?: (done: number, total: number) => void,
  now: number = Date.now()
): Promise<RagIndex> {
  const key = ragIndexPath(vaultPath, projectFolderRel)
  const existing = buildLocks.get(key)
  if (existing) return existing

  const task = (async (): Promise<RagIndex> => {
    const projectAbs = path.join(vaultPath, projectFolderRel)
    const sources = await collectSourceFiles(projectAbs, vaultPath, assertSafePath)

    const prev = await loadIndex(vaultPath, projectFolderRel)
    const reusable = prev && prev.version === RAG_INDEX_VERSION && prev.model === model
    const prevByFile = new Map<string, RagChunk[]>()
    if (reusable && prev) {
      for (const c of prev.chunks) {
        const arr = prevByFile.get(c.fileRel) ?? []
        arr.push(c)
        prevByFile.set(c.fileRel, arr)
      }
    }

    // 1. Bestimme, welche Dateien neu eingebettet werden müssen.
    const keptChunks: RagChunk[] = []
    const toEmbed: Array<{ fileRel: string; mtime: number; text: string; heading: string; chunkIndex: number }> = []

    for (const src of sources) {
      const prevChunks = prevByFile.get(src.fileRel)
      const unchanged =
        prevChunks &&
        prevChunks.length > 0 &&
        prevChunks.every((c) => Math.abs(c.mtime - src.mtime) <= 1)
      if (unchanged && prevChunks) {
        keptChunks.push(...prevChunks)
        continue
      }
      let content: string
      try {
        content = await src.read()
      } catch {
        continue
      }
      const rawChunks = chunkMarkdown(content)
      for (const rc of rawChunks) {
        toEmbed.push({
          fileRel: src.fileRel,
          mtime: src.mtime,
          text: rc.text,
          heading: rc.heading,
          chunkIndex: rc.chunkIndex
        })
      }
    }

    // Chunk-Cap (kept + neu), neue zuerst kürzen.
    if (keptChunks.length + toEmbed.length > MAX_CHUNKS_PER_PROJECT) {
      const room = Math.max(0, MAX_CHUNKS_PER_PROJECT - keptChunks.length)
      console.warn(
        `[RAG] Projekt „${projectFolderRel}" überschreitet ${MAX_CHUNKS_PER_PROJECT} Chunks — auf ${room} neue gedeckelt.`
      )
      toEmbed.length = room
    }

    // 2. Embedde die geänderten Chunks (mit Concurrency-Deckel + Progress).
    const total = toEmbed.length
    if (onProgress) onProgress(0, total)
    const vectors = total
      ? await embedBatch(
          model,
          toEmbed.map((c) => prepareTextForEmbedding(c.text)),
          3,
          onProgress
        )
      : []

    const freshChunks: RagChunk[] = toEmbed.map((c, i) => ({
      id: `${c.fileRel}::${c.chunkIndex}`,
      text: c.text,
      heading: c.heading,
      fileRel: c.fileRel,
      chunkIndex: c.chunkIndex,
      mtime: c.mtime,
      embedding: vectors[i]
    }))

    const idx: RagIndex = {
      version: RAG_INDEX_VERSION,
      model,
      projectFolderRel,
      lastUpdated: now,
      chunks: [...keptChunks, ...freshChunks]
    }

    await writeIndex(vaultPath, idx, assertSafePath)
    return idx
  })()

  buildLocks.set(key, task)
  try {
    return await task
  } finally {
    buildLocks.delete(key)
  }
}
