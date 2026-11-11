// Ablage des Tagesprotokolls (Schema und Auswertung: shared/dayLog.ts).
//
// `userData/daylog/<hash(vaultPath)>.json`, NICHT im Vault: wie das Tätigkeitsprotokoll bleibt es
// auf diesem Rechner und wandert nicht über den Sync. Format `{ since, events }` — `since` ist der
// Zeitpunkt, ab dem dieses Protokoll auf diesem Rechner geführt wird; davor ist nichts gemessen.
//
// Geschrieben wird nur über `recordNoteWrite`/`recordNoteMove`, aufgerufen aus `writeFileSafe` und den
// wenigen Handlern, die Markdown direkt anlegen (main/index.ts, Inventar in .claude/rules/dashboard.md).
// Ein Fehler hier darf nie einen Notiz-Schreibvorgang scheitern lassen.

import { app } from 'electron'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import {
  DAY_LOG_MAX_EVENTS, DAY_LOG_MAX_GAPS, DAY_LOG_RETENTION_DAYS,
  dayKey, diffCheckedTasks, isDayLogGap, normalizeDayLogEvent, pruneDayLog, remapDayLogPaths, taskKey,
  type DayLogEvent, type DayLogGap, type DayLogOrigin
} from '../shared/dayLog'

interface DayLogFile {
  since: number
  events: DayLogEvent[]
  gaps: DayLogGap[]
}

function logFile(vaultPath: string): string {
  const key = createHash('sha256').update(vaultPath).digest('hex').slice(0, 16)
  return path.join(app.getPath('userData'), 'daylog', `${key}.json`)
}

// Je Datei EIN Schreibvorgang gleichzeitig (gleiches Muster wie activityLedger.ts).
const queues = new Map<string, Promise<unknown>>()
function enqueue<T>(file: string, job: () => Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(job)
  queues.set(file, next.catch(() => undefined))
  return next
}

/** Nur „Datei fehlt“ ist `missing`. Unlesbar oder beschädigt ist `broken` und wird nie überschrieben. */
async function load(file: string): Promise<{ state: 'ok'; data: DayLogFile; legacy: boolean } | { state: 'missing' } | { state: 'broken' }> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf-8')
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? { state: 'missing' } : { state: 'broken' }
  }
  try {
    const parsed = JSON.parse(raw) as { since?: unknown; events?: unknown; gaps?: unknown }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.events)) return { state: 'broken' }
    const events = parsed.events.map(normalizeDayLogEvent).filter((e): e is DayLogEvent => e !== null)
    const since = typeof parsed.since === 'number' && Number.isFinite(parsed.since) ? parsed.since : (events[0]?.at ?? Date.now())
    const gaps = Array.isArray(parsed.gaps) ? parsed.gaps.filter(isDayLogGap) : []
    // Erste Fassung: Aufgabentext im Klartext. Wird beim nächsten Schreiben entfernt (Codex F18).
    const legacy = parsed.events.some(e => !!e && typeof e === 'object' && 'text' in (e as object))
    return { state: 'ok', data: { since, events, gaps }, legacy }
  } catch {
    return { state: 'broken' }
  }
}

async function writeAtomic(file: string, data: DayLogFile): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data), 'utf-8')
  await fs.rename(tmp, file)
}

// „Heute schon vermerkt“ je Datei: spart das Lesen bei jedem Autosave. Der Speicher gilt nur,
// solange er aus der Datei stammt und jeder Eintrag darin wirklich geschrieben wurde — nach
// einem Schreibfehler oder wenn die Datei fehlt, wird er verworfen (Codex F12/F19).
const seenSaves = new Map<string, Set<string>>()
// Erster nicht geschriebener Eintrag je Datei: wird beim nächsten gelungenen Schreiben als Lücke vermerkt.
const failedSince = new Map<string, number>()

// Ausfall-Vermerk NEBEN der Protokolldatei: überlebt einen Absturz, solange er sich schreiben
// ließ (Codex F29). Scheitert auch das, bleibt der Ausfall nur für diesen Programmlauf bekannt.
const gapMarker = (file: string) => `${file}.gap`
const prepared = new Set<string>()

/** Einmal je Datei und Programmlauf: liegengebliebene Zwischendatei entfernen, Ausfall-Vermerk übernehmen. */
async function prepare(file: string): Promise<void> {
  if (prepared.has(file)) return
  prepared.add(file)
  // Eine alte Zwischendatei kann noch Klartext der ersten Fassung enthalten (Codex F32).
  await fs.rm(`${file}.tmp`, { force: true, recursive: true }).catch(() => undefined)
  if (failedSince.has(file)) return
  const raw = await fs.readFile(gapMarker(file), 'utf-8').catch(() => null)
  const at = raw === null ? NaN : Number(raw)
  if (Number.isFinite(at)) failedSince.set(file, at)
}

function saveKey(at: number, note: string): string {
  return `${dayKey(at)}|${note}`
}

/** Brain-Tagesnotizen sind selbst ein Protokoll des Tages — sie sollen nicht darin auftauchen. */
function isBrainDayNote(content: string): boolean {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  return !!m && /^type\s*:\s*["']?brain-day["']?\s*$/m.test(m[1])
}

function isInternal(note: string): boolean {
  return !note || note.startsWith('.mindgraph/') || note.includes('/.mindgraph/')
}

/**
 * Aufbewahrung anwenden und die Abdeckung mitziehen: fällt etwas weg, weiß das Protokoll erst
 * ab der Frist bzw. ab dem ältesten verbliebenen Eintrag etwas — sonst gälte ein gekappter Tag
 * als „gemessen, nichts getan“ (Codex F19).
 */
function prune(data: DayLogFile, now: number): DayLogFile {
  const cutoff = now - DAY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const events = pruneDayLog(data.events, now)
  let since = data.since
  if (since < cutoff) since = cutoff
  if (data.events.length > DAY_LOG_MAX_EVENTS && events.length > 0) since = Math.max(since, events[0].at)
  let gaps = data.gaps.filter(g => g.to >= since)
  if (gaps.length > DAY_LOG_MAX_GAPS) {
    // Fällt eine Lücke aus der Liste, gilt die Zeit bis zu ihrem Ende als nicht gemessen —
    // sonst sähe ein Ausfall nachträglich wie ein gemessener Zeitraum aus (Codex F29).
    const dropped = gaps.slice(0, gaps.length - DAY_LOG_MAX_GAPS)
    since = Math.max(since, ...dropped.map(g => g.to))
    gaps = gaps.slice(-DAY_LOG_MAX_GAPS)
  }
  return { since, events: events.filter(e => e.at >= since), gaps }
}

/**
 * Einen Eintrag anhängen. `build` bekommt den gelesenen Stand und liefert die neuen Ereignisse
 * (leer = nichts zu tun) sowie optional umgeschriebene alte. Wirft nie; ein Fehlschlag wird als
 * Lücke vermerkt, sobald wieder geschrieben werden kann.
 */
function commit(
  file: string,
  at: number,
  build: (data: DayLogFile, known: Set<string>) => { add: DayLogEvent[]; events?: DayLogEvent[]; mark?: string[] } | null
): Promise<void> {
  return enqueue(file, async () => {
    await prepare(file)
    const loaded = await load(file)
    // Beschädigte Datei nicht überschreiben — sonst wäre die Historie still weg.
    if (loaded.state === 'broken') return
    if (loaded.state === 'missing') seenSaves.delete(file)
    const data: DayLogFile = loaded.state === 'ok' ? loaded.data : { since: at, events: [], gaps: [] }
    let known = seenSaves.get(file)
    if (!known) {
      known = new Set(data.events.filter(e => e.kind === 'note-saved').map(e => saveKey(e.at, e.note)))
      seenSaves.set(file, known)
    }
    const legacy = loaded.state === 'ok' && loaded.legacy
    const result = build(data, known) ?? { add: [] }
    if (result.add.length === 0 && !result.events && !legacy) return
    const gaps = [...data.gaps]
    const failed = failedSince.get(file)
    if (failed !== undefined) gaps.push({ from: failed, to: at })
    try {
      await writeAtomic(file, prune({ since: data.since, events: [...(result.events ?? data.events), ...result.add], gaps }, at))
    } catch (error) {
      // Nichts als „vermerkt“ behalten, was nicht auf der Platte liegt.
      seenSaves.delete(file)
      if (failed === undefined) {
        failedSince.set(file, at)
        await fs.mkdir(path.dirname(file), { recursive: true }).catch(() => undefined)
        await fs.writeFile(gapMarker(file), String(at), 'utf-8').catch(() => undefined)
      }
      throw error
    }
    if (failed !== undefined) {
      failedSince.delete(file)
      await fs.rm(gapMarker(file), { force: true }).catch(() => undefined)
    }
    // Erst jetzt gilt der Eintrag als vermerkt. Nach einer Pfadänderung den Speicher neu aufbauen.
    if (result.events) seenSaves.delete(file)
    else for (const k of result.mark ?? []) known.add(k)
  }).catch(error => {
    console.warn('[daylog] Eintrag nicht geschrieben:', error instanceof Error ? error.message : error)
  })
}

export interface NoteWrite {
  vaultPath: string
  /** Vault-relativer Pfad mit „/“. */
  note: string
  /**
   * Inhalt vor dem Schreiben. null = die Datei gab es nicht (Neuanlage). undefined = unbekannt
   * (Vorfassung nicht lesbar oder vom Aufrufer nicht erhoben): dann wird weder eine Neuanlage
   * behauptet noch nach abgehakten Checkboxen gesucht.
   */
  before: string | null | undefined
  /** Inhalt nach dem Schreiben; undefined, wenn der Aufrufer ihn nicht zur Hand hat. */
  after?: string
  /** Erzwingt „angelegt“ — für Wege, die den Namen vorher mit einer leeren Datei reservieren. */
  created?: boolean
  origin: DayLogOrigin
  at?: number
}

/**
 * Einen gelungenen Markdown-Schreibvorgang vermerken: abgehakte Checkboxen einzeln, die Notiz
 * selbst höchstens einmal je Kalendertag. Wirft nie — auch nicht in der Vorarbeit (Codex F11).
 */
export function recordNoteWrite(write: NoteWrite): Promise<void> {
  try {
    const at = write.at ?? Date.now()
    const { note, before, after } = write
    if (isInternal(note)) return Promise.resolve()
    if (typeof before === 'string' && before === after) return Promise.resolve()
    if (typeof after === 'string' && isBrainDayNote(after)) return Promise.resolve()

    const keys = typeof before === 'string' && typeof after === 'string'
      ? diffCheckedTasks(before, after).map(taskKey)
      : []
    const created = write.created === true || before === null
    const file = logFile(write.vaultPath)
    const key = saveKey(at, note)
    const run = () => commit(file, at, (data, known) => {
      const add: DayLogEvent[] = keys.map(k => ({ at, kind: 'task-checked', note, key: k, origin: write.origin }))
      // „Angelegt“ höchstens einmal je Notiz und Tag, auch wenn zwei Erst-Schreiber sich überholen.
      const createdToday = created && data.events.some(e => e.kind === 'note-saved' && e.created && e.note === note && dayKey(e.at) === dayKey(at))
      if (created ? !createdToday : !known.has(key)) {
        add.push({ at, kind: 'note-saved', note, created, origin: write.origin })
      }
      return { add, mark: [key] }
    })
    if (keys.length === 0 && !created && seenSaves.get(file)?.has(key)) {
      // „Heute schon vermerkt“ gilt nur, solange die Datei noch da ist (Codex F28): wurde sie
      // entfernt, den Speicher verwerfen und neu eintragen.
      return fs.access(file).then(() => undefined, () => {
        seenSaves.delete(file)
        return run()
      })
    }
    return run()
  } catch (error) {
    console.warn('[daylog] Eintrag nicht vermerkt:', error instanceof Error ? error.message : error)
    return Promise.resolve()
  }
}

/**
 * Umbenennen/Verschieben vermerken und die Pfade früherer Einträge nachziehen — sonst fände der
 * Tagesüberblick die Notiz zu einem älteren Eintrag nicht mehr. Für eine einzelne Notiz entsteht
 * ein `note-moved`; bei einem Ordner werden nur die Pfade nachgezogen. Wirft nie.
 */
export function recordNoteMove(move: { vaultPath: string; from: string; to: string; isDirectory: boolean; origin: DayLogOrigin; at?: number }): Promise<void> {
  try {
    const at = move.at ?? Date.now()
    const { from, to } = move
    if (!from || !to || from === to || isInternal(from) || isInternal(to)) return Promise.resolve()
    const isNote = !move.isDirectory && /\.md$/i.test(to)
    if (!move.isDirectory && !isNote) return Promise.resolve()
    return commit(logFile(move.vaultPath), at, data => {
      const mapped = remapDayLogPaths(data.events, from, to)
      const add: DayLogEvent[] = isNote ? [{ at, kind: 'note-moved', note: to, from, origin: move.origin }] : []
      if (mapped.changed === 0) return { add }
      return { add, events: mapped.events }
    })
  } catch (error) {
    console.warn('[daylog] Verschieben nicht vermerkt:', error instanceof Error ? error.message : error)
    return Promise.resolve()
  }
}

export interface DayLogRead {
  /** 'missing': auf diesem Rechner noch nie geführt. 'broken': Datei unlesbar — keine Aussage möglich. */
  state: 'ok' | 'missing' | 'broken'
  since: number | null
  events: DayLogEvent[]
  /** Zeiträume, in denen nicht geschrieben werden konnte (im gefragten Zeitraum). */
  gaps: DayLogGap[]
}

export async function readDayLog(vaultPath: string, range?: { from: number; to: number }): Promise<DayLogRead> {
  const file = logFile(vaultPath)
  // Hinter laufenden Schreibvorgängen einreihen, damit ein eben abgehakter Punkt schon drinsteht.
  let loaded = await enqueue(file, async () => { await prepare(file); return load(file) })
  if (loaded.state === 'missing') seenSaves.delete(file)
  if (loaded.state === 'ok' && loaded.legacy) {
    // Klartext der ersten Fassung VOR der Antwort entfernen und das Ergebnis prüfen (Codex F32).
    // Gelingt es nicht, liegt der Text weiter auf der Platte — das wird gemeldet, nicht verschwiegen.
    await commit(file, Date.now(), () => null)
    loaded = await enqueue(file, () => load(file))
    if (loaded.state === 'ok' && loaded.legacy) console.warn('[daylog] Altbestand mit Aufgabentext konnte nicht bereinigt werden:', file)
  }
  if (loaded.state !== 'ok') return { state: loaded.state, since: null, events: [], gaps: [] }
  const { data } = loaded
  const gaps = [...data.gaps]
  // Ein noch laufender Ausfall ist auch eine Lücke — bis jetzt.
  const failed = failedSince.get(file)
  if (failed !== undefined) gaps.push({ from: failed, to: Date.now() })
  const inRange = <T extends { from: number; to: number }>(g: T) => !range || (g.from < range.to && g.to > range.from)
  const events = range ? data.events.filter(e => e.at >= range.from && e.at < range.to) : data.events
  return { state: 'ok', since: data.since, events, gaps: gaps.filter(inRange) }
}
