// Notizmengen im Main: Durchlauf über die angehängten Vault-Ordner und Neuprüfung beim Schreiben.
// Plan und Prüfung: docs/codex-collab/agent-notizen-einsortieren.md (Stufe 1, Rev. 3). Die
// Suchregeln selbst sind pur (shared/noteSet.ts).

import { promises as fs, constants as fsConstants } from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import { matchNote, sortForSet, wordSet, relatedWords, type NoteSet, type NoteSetEntry } from '../../shared/noteSet'

/** Größere Notizen werden nicht gelesen, sondern gezählt und genannt (Codex F19). */
export const FIND_NOTES_MAX_FILE_BYTES = 2 * 1024 * 1024
/** Gesamtzeit eines Durchlaufs; danach ist die Menge „unvollständig“. */
export const FIND_NOTES_MAX_MS = 25_000
const MAX_DEPTH = 14

export interface SearchRoot {
  /** Bezeichnung des Anhangs, wie sie das Modell und der Nutzer sehen. */
  name: string
  /** Kanonischer Pfad des Ordners. */
  rootReal: string
  /** Kanonischer Pfad des Vaults, in dem er liegt. */
  vaultReal: string
}

const sha = (text: string): string => createHash('sha1').update(text).digest('hex')

/** Datei lesen, ohne einer Verknüpfung zu folgen. null = nicht lesbar oder zu groß. */
async function readNote(abs: string): Promise<{ text: string } | { skip: 'large' | 'unreadable' }> {
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(abs, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    const st = await handle.stat()
    if (!st.isFile()) return { skip: 'unreadable' }
    if (st.size > FIND_NOTES_MAX_FILE_BYTES) return { skip: 'large' }
    return { text: await handle.readFile('utf-8') }
  } catch {
    return { skip: 'unreadable' }
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

export interface ScanOutcome {
  entries: Array<Omit<NoteSetEntry, 'n'>>
  scanned: number
  incomplete: string[]
  /** Vorschläge für weitere Suchwörter (shared/noteSet.ts relatedWords). */
  related: string[]
}

/**
 * Alle `.md`-Dateien der Ordner durchsuchen. Verknüpfungen (Ordner wie Dateien) und versteckte
 * Ordner werden nicht betreten; jede Auslassung macht die Menge unvollständig und wird benannt.
 */
export async function scanNotes(roots: SearchRoot[], terms: string[], opts: { signal?: AbortSignal; maxMs?: number; now?: () => number } = {}): Promise<ScanOutcome> {
  const now = opts.now ?? Date.now
  const deadline = now() + (opts.maxMs ?? FIND_NOTES_MAX_MS)
  const entries: Array<Omit<NoteSetEntry, 'n'>> = []
  const seen = new Set<string>()
  const wordCounts = new Map<string, number>()
  const hitWords: Array<Set<string>> = []
  let scanned = 0, large = 0, unreadable = 0, deep = 0
  let stopped: 'time' | 'abort' | null = null

  const walk = async (dir: string, vaultReal: string, depth: number): Promise<void> => {
    if (stopped) return
    if (depth > MAX_DEPTH) { deep++; return }
    let dirents
    try { dirents = await fs.readdir(dir, { withFileTypes: true }) } catch { unreadable++; return }
    dirents.sort((a, b) => a.name.localeCompare(b.name, 'de'))
    for (const d of dirents) {
      if (opts.signal?.aborted) { stopped = 'abort'; return }
      if (now() > deadline) { stopped = 'time'; return }
      if (d.name.startsWith('.') || d.isSymbolicLink()) continue
      const abs = path.join(dir, d.name)
      if (d.isDirectory()) { await walk(abs, vaultReal, depth + 1); continue }
      if (!d.isFile() || !/\.md$/i.test(d.name)) continue
      if (seen.has(abs)) continue
      seen.add(abs)
      const read = await readNote(abs)
      if ('skip' in read) { if (read.skip === 'large') large++; else unreadable++; continue }
      scanned++
      const words = wordSet(read.text)
      for (const w of words) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1)
      const m = matchNote(d.name, read.text, terms)
      if (!m) continue
      hitWords.push(words)
      entries.push({ relPath: path.relative(vaultReal, abs).split(path.sep).join('/'), title: m.title, hit: m.hit, score: m.score, hash: sha(read.text) })
    }
  }
  for (const root of roots) await walk(root.rootReal, root.vaultReal, 0)

  const incomplete: string[] = []
  if (stopped === 'time') incomplete.push('Zeitgrenze des Durchlaufs erreicht, der Rest wurde nicht durchsucht')
  if (stopped === 'abort') incomplete.push('Durchlauf abgebrochen')
  if (large) incomplete.push(`${large} ${large === 1 ? 'Notiz' : 'Notizen'} über 2 MB nicht gelesen`)
  if (unreadable) incomplete.push(`${unreadable} ${unreadable === 1 ? 'Datei oder Ordner' : 'Dateien oder Ordner'} nicht lesbar`)
  if (deep) incomplete.push(`${deep} Unterordner zu tief verschachtelt`)
  return { entries: sortForSet(entries), scanned, incomplete, related: relatedWords(hitWords, wordCounts, terms) }
}

/** Menge aus einem Durchlauf bauen; Nummern nach der Sortierung, ab 1. */
export function toNoteSet(id: string, terms: string[], folders: string[], scan: ScanOutcome): NoteSet {
  return {
    id, terms, folders,
    related: scan.related,
    entries: scan.entries.map((e, i) => ({ ...e, n: i + 1 })),
    scanned: scan.scanned,
    complete: scan.incomplete.length === 0,
    incomplete: scan.incomplete
  }
}

/**
 * Einträge vor dem Schreiben gegen die aktuelle Datei prüfen (Codex F22): fehlt sie oder passt sie
 * nach einer Änderung nicht mehr zu den Suchwörtern, kommt sie nicht in die Liste, sondern wird
 * benannt. Geänderte, weiter passende Notizen bekommen Titel und Fundstelle von jetzt.
 */
export async function recheckEntries(vaultReal: string, entries: NoteSetEntry[], terms: string[]): Promise<{ fresh: NoteSetEntry[]; stale: Array<{ relPath: string; reason: string }> }> {
  const fresh: NoteSetEntry[] = []
  const stale: Array<{ relPath: string; reason: string }> = []
  for (const e of entries) {
    const abs = path.join(vaultReal, ...e.relPath.split('/'))
    // Der Pfad stammt aus dem eigenen Durchlauf; trotzdem darf er den Vault nicht verlassen.
    if (abs !== vaultReal && !abs.startsWith(vaultReal + path.sep)) { stale.push({ relPath: e.relPath, reason: 'liegt nicht im Vault' }); continue }
    const read = await readNote(abs)
    if ('skip' in read) { stale.push({ relPath: e.relPath, reason: 'nicht mehr vorhanden oder nicht lesbar' }); continue }
    if (sha(read.text) === e.hash) { fresh.push(e); continue }
    const m = matchNote(path.basename(abs), read.text, terms)
    if (!m) { stale.push({ relPath: e.relPath, reason: 'seit der Suche geändert, enthält die Suchwörter nicht mehr' }); continue }
    fresh.push({ ...e, title: m.title, hit: m.hit, score: m.score, hash: sha(read.text) })
  }
  return { fresh, stale }
}
