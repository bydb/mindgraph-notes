// Notizmengen im Main: Durchlauf über die angehängten Vault-Ordner und Neuprüfung beim Schreiben.
// Plan und Prüfung: docs/codex-collab/agent-notizen-einsortieren.md (Stufe 1, Rev. 3). Die
// Suchregeln selbst sind pur (shared/noteSet.ts).

import { promises as fs, constants as fsConstants } from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import { matchNote, noteDisplayTitle, semanticExcerpt, semanticThreshold, sortForSet, wordSet, relatedWords, type NoteSet, type NoteSetEntry, type NoteSetSemantic } from '../../shared/noteSet'

/** Größere Notizen werden nicht gelesen, sondern gezählt und genannt (Codex F19). */
export const FIND_NOTES_MAX_FILE_BYTES = 2 * 1024 * 1024
/** Gesamtzeit eines Durchlaufs; danach ist die Menge „unvollständig“. */
export const FIND_NOTES_MAX_MS = 25_000
const MAX_DEPTH = 14
/**
 * Sinngemäße Ergänzung über den Vault-Index. Die Schwelle eicht sich an den Notizen mit Suchwort
 * (shared/noteSet.ts semanticThreshold, dort auch die Messung); die feste Zahl hier gilt nur, wenn
 * dafür zu wenige da sind. Die Abfrage selbst läuft mit niedriger Untergrenze, sonst kämen die
 * Vergleichswerte gar nicht zurück. Dazu eine harte Obergrenze der Anzahl — und das Modell
 * beurteilt die Kandidaten anhand von Titel und Auszug. Gefragt wird nur mit dem Thema selbst:
 * eine Rahmenformulierung („Notizen zum Thema …“) zerstörte in der Messung die Rangfolge.
 */
export const FIND_NOTES_SEMANTIC_MIN_SCORE = 0.48
export const FIND_NOTES_SEMANTIC_QUERY_FLOOR = 0.3
export const FIND_NOTES_SEMANTIC_TOP_K = 60
export const FIND_NOTES_SEMANTIC_MAX = 20

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
  semantic?: NoteSetSemantic
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

export interface TopicHit { fileRel: string; text: string; score: number }
/** Abfrage des Vault-Index, auf Ordner begrenzt. Vom Lauf gestellt; fehlt sie, gibt es keinen Index. */
export type TopicSearch = (query: string, folders: string[], signal: AbortSignal) => Promise<{ hits: TopicHit[] }>

/**
 * Notizen ohne Suchwort ergänzen, die dem Thema ähneln. Nimmt nur Notizen aus den angehängten
 * Ordnern des Lauf-Vaults, liest jede selbst nach (kein Vertrauen in Index-Pfade) und hängt sie
 * HINTER die Worttreffer — gekennzeichnet, damit Rückgabe und Sammelnotiz sie getrennt zeigen.
 */
export async function addSemanticNotes(
  scan: ScanOutcome, roots: SearchRoot[], runVaultReal: string, topic: string,
  search: TopicSearch | undefined, signal: AbortSignal
): Promise<ScanOutcome> {
  if (!search) return { ...scan, semantic: { state: 'unavailable', topic, reason: 'für diesen Vault ist kein Vault-Index eingerichtet' } }
  const own = roots.filter(r => r.vaultReal === runVaultReal)
  if (own.length === 0) return { ...scan, semantic: { state: 'unavailable', topic, reason: 'der angehängte Ordner liegt in einem anderen Vault als der Index' } }
  const folders = own.map(r => path.relative(runVaultReal, r.rootReal).split(path.sep).join('/'))
  let hits: TopicHit[]
  try {
    // Ein angehängter Vault-Stamm ('') heißt: ohne Ordnerfilter.
    hits = (await search(topic, folders.includes('') ? [] : folders, signal)).hits
  } catch (e) {
    if (signal.aborted) return scan
    return { ...scan, semantic: { state: 'failed', topic, reason: (e instanceof Error ? e.message : String(e)).slice(0, 200) } }
  }
  // Index und Dateisystem können Umlaute verschieden kodieren (NFC/NFD) — verglichen wird in NFC.
  const nfc = (v: string): string => v.normalize('NFC')
  const have = new Set(scan.entries.map(e => nfc(e.relPath)))
  const threshold = semanticThreshold(hits.filter(h => have.has(nfc(h.fileRel.split(path.sep).join('/')))).map(h => h.score), FIND_NOTES_SEMANTIC_MIN_SCORE)
  const added: Array<Omit<NoteSetEntry, 'n'>> = []
  let cut = 0
  for (const h of [...hits].sort((a, b) => b.score - a.score)) {
    const rel = h.fileRel.split(path.sep).join('/')
    if (!/\.md$/i.test(rel) || have.has(nfc(rel)) || h.score < threshold) continue
    const abs = path.join(runVaultReal, ...rel.split('/'))
    if (!own.some(r => nfc(abs).startsWith(nfc(r.rootReal) + path.sep))) continue
    if (rel.split('/').some(part => part.startsWith('.'))) continue
    // Über eine Ordner-Verknüpfung könnte der Pfad den Ordner verlassen — der Durchlauf betritt
    // sie nicht, also darf es die Ergänzung auch nicht.
    const real = await fs.realpath(abs).catch(() => '')
    if (nfc(real) !== nfc(abs)) continue
    have.add(nfc(rel))
    if (added.length >= FIND_NOTES_SEMANTIC_MAX) { cut++; continue }
    const read = await readNote(real)
    if ('skip' in read) continue
    added.push({ relPath: path.relative(runVaultReal, real).split(path.sep).join('/'), title: noteDisplayTitle(path.basename(abs), read.text), hit: semanticExcerpt(h.text), score: 0, hash: sha(read.text), semantic: true })
  }
  return { ...scan, entries: [...scan.entries, ...added], semantic: { state: 'used', topic, ...(cut ? { cut } : {}) } }
}

/** Menge aus einem Durchlauf bauen; Nummern nach der Sortierung, ab 1. */
export function toNoteSet(id: string, terms: string[], folders: string[], scan: ScanOutcome): NoteSet {
  return {
    id, terms, folders,
    related: scan.related,
    ...(scan.semantic ? { semantic: scan.semantic } : {}),
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
    // Ein sinngemäßer Treffer lässt sich ohne Index nicht neu beurteilen: nach einer Änderung raus.
    if (!m) { stale.push({ relPath: e.relPath, reason: e.semantic ? 'seit der Suche geändert; der sinngemäße Treffer ist nicht neu geprüft' : 'seit der Suche geändert, enthält die Suchwörter nicht mehr' }); continue }
    fresh.push({ ...e, title: m.title, hit: m.hit, score: m.score, hash: sha(read.text), semantic: false })
  }
  return { fresh, stale }
}
