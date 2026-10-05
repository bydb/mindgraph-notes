// Ordner-Anhänge mit Unterordnern: Inventur und Lesen innerhalb der Anhang-Grenze.
// Plan + Codex-Runden: docs/codex-collab/agent-rueckblick-unterordner.md (Baustein A).
//
// Grenze ist der ANGEHÄNGTE Ordner, nicht der Vault (F05): beim Anhängen wird seine
// Identität (realpath, dev, ino) festgehalten und vor jeder Inventur und jedem Lesen
// erneut geprüft (F26). Verknüpfungen werden in keiner Tiefe verfolgt, Punkt-Segmente
// (und damit `.mindgraph`) nie betreten.
//
// EHRLICHE GRENZE (Nutzerentscheidung 05.10.2026, F25/F32): Node hat kein `openat`, die
// Verzeichnis-Segmente lassen sich nicht an Handles binden. Wer Schreibrecht im Anhang
// hat, kann einen Zwischenordner zwischen Prüfung und Zugriff gegen eine Verknüpfung
// tauschen und vor der Nachprüfung zurücktauschen — dann sieht die App Namen bzw. liest
// eine Datei außerhalb des Anhangs. Prüfung vor UND nach jedem Zugriff verengt das auf
// einen doppelten Tausch im engen Zeitfenster, schließt es aber nicht. Mehr verspricht
// dieses Modul nicht.

import { constants as fsConstants, promises as fs } from 'fs'
import * as path from 'path'

export interface FolderRoot {
  /** Kanonischer Pfad des angehängten Ordners zum Zeitpunkt des Anhängens. */
  rootReal: string
  dev: number
  ino: number
}

/** Schutzgrenzen gegen pathologische Bäume — keine Bearbeitungsgrenzen (F07). */
export const MAX_INVENTORY_DEPTH = 12
export const MAX_INVENTORY_ENTRIES = 20_000

function isHiddenSegment(segment: string): boolean {
  return segment.startsWith('.')
}

function isInside(rootReal: string, candidate: string): boolean {
  return candidate.startsWith(rootReal + path.sep)
}

/**
 * Identität beim Anhängen festhalten. Lehnt versteckte Ordner ab (F33): den eigenen
 * Namen immer, bei Vault-Anhängen zusätzlich jedes vault-relative Segment — damit ist
 * `.mindgraph` samt Unterordnern als Anhang ausgeschlossen. Bei externen Anhängen zählen
 * die Vorfahren nicht; die hat der Nutzer im OS-Dialog bewusst gewählt.
 */
export async function captureFolderRoot(absPath: string, insideVault: boolean, vaultRoot?: string): Promise<FolderRoot> {
  const rootReal = await fs.realpath(absPath)
  const st = await fs.lstat(rootReal)
  if (!st.isDirectory()) throw new Error(`Kein Ordner: ${path.basename(absPath)}`)
  if (isHiddenSegment(path.basename(rootReal))) {
    throw new Error(`Versteckte Ordner (Name beginnt mit Punkt) können nicht angehängt werden: ${path.basename(rootReal)}`)
  }
  if (insideVault && vaultRoot) {
    const vaultReal = await fs.realpath(vaultRoot)
    if (rootReal !== vaultReal) {
      if (!isInside(vaultReal, rootReal)) throw new Error(`Ordner liegt nicht im Vault: ${path.basename(absPath)}`)
      const segments = path.relative(vaultReal, rootReal).split(path.sep)
      if (segments.some(isHiddenSegment)) {
        throw new Error(`Ordner in versteckten Vault-Bereichen (z. B. .mindgraph) können nicht angehängt werden: ${path.basename(absPath)}`)
      }
    }
  }
  return { rootReal, dev: st.dev, ino: st.ino }
}

/** Ist der angehängte Ordner noch derselbe? Vor jeder Inventur und jedem Lesen (F26). */
export async function assertFolderRootIdentity(root: FolderRoot, label: string): Promise<void> {
  const changed = new Error(`Der angehängte Ordner "${label}" wurde verschoben oder ersetzt — bitte neu anhängen.`)
  let st
  try {
    st = await fs.lstat(root.rootReal)
  } catch {
    throw changed
  }
  if (st.isSymbolicLink() || !st.isDirectory() || st.dev !== root.dev || st.ino !== root.ino) throw changed
  const real = await fs.realpath(root.rootReal).catch(() => '')
  if (real !== root.rootReal) throw changed
}

/**
 * Relativen Pfad aus Modell- oder Manifest-Angabe in Segmente zerlegen. Lexikalische
 * Prüfung: nichts Absolutes, kein `..`/`.`, keine leeren oder versteckten Segmente.
 * Rückwärtsstriche gelten als Trenner — Windows-Pfade aus dem Modell sollen nicht als
 * ein einziger Dateiname mit Backslashes durchrutschen.
 */
export function parseFolderRelPath(rel: string): string[] {
  const value = rel.trim().replace(/\\/g, '/')
  if (!value) throw new Error('Leerer Pfad')
  if (value.includes('\0')) throw new Error('Ungültiger Pfad')
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    throw new Error('Nur Pfade relativ zum angehängten Ordner sind erlaubt, wie im Manifest angegeben.')
  }
  const segments = value.split('/')
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') throw new Error(`Ungültiger Pfad: "${rel}"`)
    if (isHiddenSegment(seg)) throw new Error(`Versteckte Dateien und Ordner sind nicht lesbar: "${rel}"`)
  }
  return segments
}

interface ResolvedFile {
  abs: string
  dev: number
  ino: number
  size: number
}

async function resolveFileInRoot(root: FolderRoot, segments: string[], label: string): Promise<ResolvedFile> {
  await assertFolderRootIdentity(root, label)
  let cur = root.rootReal
  let last: Awaited<ReturnType<typeof fs.lstat>> | null = null
  for (let i = 0; i < segments.length; i++) {
    cur = path.join(cur, segments[i])
    let st
    try {
      st = await fs.lstat(cur)
    } catch {
      throw new Error(`"${segments.join('/')}" gibt es im Ordner "${label}" nicht.`)
    }
    if (st.isSymbolicLink()) throw new Error(`"${segments.join('/')}" führt über eine Verknüpfung — abgelehnt.`)
    const isLast = i === segments.length - 1
    if (!isLast && !st.isDirectory()) throw new Error(`"${segments.join('/')}" gibt es im Ordner "${label}" nicht.`)
    if (isLast && !st.isFile()) throw new Error(`"${segments.join('/')}" ist keine Datei.`)
    last = st
  }
  const real = await fs.realpath(cur)
  if (!isInside(root.rootReal, real)) throw new Error(`"${segments.join('/')}" liegt nicht im angehängten Ordner — abgelehnt.`)
  return { abs: cur, dev: Number(last!.dev), ino: Number(last!.ino), size: Number(last!.size) }
}

/**
 * Eine Datei im Anhang lesen: prüfen, über einen Deskriptor mit O_NOFOLLOW öffnen,
 * Identität am Handle vergleichen, aus dem Handle lesen, danach erneut prüfen.
 * Die Parser bekommen den Buffer — der Pfad wird nach der Prüfung nie wieder geöffnet.
 * Restrisiko: siehe Modulkopf (Zwischenordner-Tausch, F25).
 */
export async function readFileInFolder(root: FolderRoot, relPath: string, maxBytes: number, label: string): Promise<Buffer> {
  const segments = parseFolderRelPath(relPath)
  const before = await resolveFileInRoot(root, segments, label)
  if (before.size > maxBytes) {
    throw new Error(`zu groß (${Math.max(1, Math.round(before.size / 1024 / 1024))} MB, höchstens ${Math.round(maxBytes / 1024 / 1024)} MB)`)
  }
  const fh = await fs.open(before.abs, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
  let buf: Buffer
  try {
    const st = await fh.stat()
    if (!st.isFile() || st.dev !== before.dev || st.ino !== before.ino) {
      throw new Error(`"${relPath}" wurde während des Lesens verändert — nicht gelesen.`)
    }
    if (st.size > maxBytes) throw new Error(`zu groß (${Math.round(st.size / 1024 / 1024)} MB)`)
    // Höchstens maxBytes + 1 lesen: wächst die Datei während des Lesens, merkt das die
    // Grenze statt still mehr zu lesen (F45).
    const chunks: Buffer[] = []
    let total = 0
    for (;;) {
      const chunk = Buffer.alloc(Math.min(1024 * 1024, maxBytes + 1 - total))
      const { bytesRead } = await fh.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) break
      chunks.push(bytesRead === chunk.length ? chunk : chunk.subarray(0, bytesRead))
      total += bytesRead
      if (total > maxBytes) throw new Error(`zu groß (während des Lesens über ${Math.round(maxBytes / 1024 / 1024)} MB gewachsen)`)
    }
    buf = Buffer.concat(chunks, total)
    const st2 = await fh.stat()
    if (st2.size !== st.size || st2.mtimeMs !== st.mtimeMs || total !== st.size) {
      throw new Error(`"${relPath}" wurde während des Lesens verändert — nicht gelesen.`)
    }
  } finally {
    await fh.close()
  }
  const after = await resolveFileInRoot(root, segments, label)
  if (after.dev !== before.dev || after.ino !== before.ino) {
    throw new Error(`"${relPath}" wurde während des Lesens verändert — nicht gelesen.`)
  }
  return buf
}

export interface InventoryFile<K extends string = string> {
  /** Pfad relativ zum Anhang mit `/` — bei Dateien direkt im Ordner gleich dem Dateinamen. */
  relPath: string
  name: string
  /** Unterordner relativ zum Anhang, '' = direkte Ebene. */
  dir: string
  kind: K
  sizeBytes: number
  mtimeMs: number
}

export interface InventoryDir {
  relPath: string
  /** Unterstützte Dateien direkt in diesem Ordner (nicht rekursiv). */
  files: number
}

export interface FolderInventory<K extends string = string> {
  files: InventoryFile<K>[]
  /** Alle betretenen Unterordner (ohne den Anhang selbst), sortiert. */
  dirs: InventoryDir[]
  unsupportedCount: number
  symlinkCount: number
  hiddenCount: number
  /** Gesetzt, wenn die Inventur nicht den ganzen Baum erfasst hat — mit Ort und Grund. */
  incomplete?: { reason: 'depth' | 'entries' | 'changed'; at: string }
}

interface DirIdentity {
  dev: number
  ino: number
}

async function checkSubdir(root: FolderRoot, abs: string): Promise<DirIdentity | null> {
  try {
    const st = await fs.lstat(abs)
    if (st.isSymbolicLink() || !st.isDirectory()) return null
    const real = await fs.realpath(abs)
    if (!isInside(root.rootReal, real)) return null
    return { dev: st.dev, ino: st.ino }
  } catch {
    return null
  }
}

/**
 * Den ganzen Baum unter dem Anhang erfassen (ohne Inhalte). Jeder Unterordner wird vor
 * UND nach dem Auflisten geprüft (F32); weicht er ab, wird seine Auflistung verworfen
 * und die Inventur als unvollständig markiert, statt Namen von außerhalb zu melden.
 */
export async function inventoryFolder<K extends string>(
  root: FolderRoot,
  label: string,
  kindOf: (fileName: string) => K | null
): Promise<FolderInventory<K>> {
  await assertFolderRootIdentity(root, label)
  const inv: FolderInventory<K> = { files: [], dirs: [], unsupportedCount: 0, symlinkCount: 0, hiddenCount: 0 }
  const markIncomplete = (reason: 'depth' | 'entries' | 'changed', at: string): void => {
    if (!inv.incomplete) inv.incomplete = { reason, at: at || '(Hauptordner)' }
  }
  const queue: Array<{ rel: string; depth: number }> = [{ rel: '', depth: 0 }]
  let entriesSeen = 0

  while (queue.length > 0) {
    const { rel, depth } = queue.shift()!
    const abs = rel ? path.join(root.rootReal, ...rel.split('/')) : root.rootReal
    const before = rel ? await checkSubdir(root, abs) : { dev: root.dev, ino: root.ino }
    if (!before) {
      markIncomplete('changed', rel)
      continue
    }
    let dirents
    try {
      dirents = await fs.readdir(abs, { withFileTypes: true })
    } catch {
      markIncomplete('changed', rel)
      continue
    }
    const after = rel ? await checkSubdir(root, abs) : await assertFolderRootIdentity(root, label).then(() => before)
    if (!after || after.dev !== before.dev || after.ino !== before.ino) {
      markIncomplete('changed', rel)
      continue
    }

    entriesSeen += dirents.length
    if (entriesSeen > MAX_INVENTORY_ENTRIES) {
      markIncomplete('entries', rel)
      break
    }

    let filesHere = 0
    const subdirs: string[] = []
    for (const d of dirents) {
      if (isHiddenSegment(d.name)) {
        inv.hiddenCount++
        continue
      }
      if (d.isSymbolicLink()) {
        inv.symlinkCount++
        continue
      }
      const childRel = rel ? `${rel}/${d.name}` : d.name
      if (d.isDirectory()) {
        if (depth + 1 > MAX_INVENTORY_DEPTH) {
          markIncomplete('depth', childRel)
          continue
        }
        subdirs.push(childRel)
        continue
      }
      if (!d.isFile()) continue
      const kind = kindOf(d.name)
      if (!kind) {
        inv.unsupportedCount++
        continue
      }
      let st
      try {
        st = await fs.lstat(path.join(abs, d.name))
      } catch {
        // Zwischen readdir und lstat verschwunden: nie still auslassen (F46).
        markIncomplete('changed', childRel)
        continue
      }
      if (!st.isFile()) {
        markIncomplete('changed', childRel)
        continue
      }
      filesHere++
      inv.files.push({ relPath: childRel, name: d.name, dir: rel, kind, sizeBytes: st.size, mtimeMs: st.mtimeMs })
    }
    if (rel) inv.dirs.push({ relPath: rel, files: filesHere })
    subdirs.sort((a, b) => a.localeCompare(b, 'de'))
    for (const s of subdirs) queue.push({ rel: s, depth: depth + 1 })
  }

  inv.files.sort((a, b) => compareRelPaths(a.relPath, b.relPath))
  inv.dirs.sort((a, b) => compareRelPaths(a.relPath, b.relPath))
  return inv
}

/** Direkte Dateien zuerst, dann Unterordner — innerhalb einer Ebene nach Namen (de). */
export function compareRelPaths(a: string, b: string): number {
  const da = a.includes('/') ? 1 : 0
  const db = b.includes('/') ? 1 : 0
  if (da !== db) return da - db
  return a.localeCompare(b, 'de')
}
