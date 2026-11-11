// Tagesprotokoll: was an einem Tag IN DIESER APP AUF DIESEM RECHNER geschrieben wurde.
//
// Auslöser (docs/codex-collab/agent-tagesueberblick.md, F02/F03): Die bisherigen „Tagesdaten“
// zählten etwas anderes, als draufstand — jede Aufgaben-Änderung als „abgeschlossen“, jede vom
// Sync heruntergeladene Datei als „heute bearbeitet“. Ein Erledigt-Zeitpunkt wurde nirgends
// festgehalten. Dieses Protokoll entsteht an der einen Schreibgrenze des Hauptprozesses
// (`writeFileSafe`); der Sync schreibt daran vorbei und taucht deshalb nicht auf.
//
// Was es NICHT weiß: Änderungen außerhalb der App (anderer Editor, anderes Gerät) und alles vor
// seiner Einführung. Wer daraus zitiert, sagt „in MindGraph auf diesem Rechner“.

export type DayLogOrigin = 'renderer' | 'tasks' | 'agent' | 'app'

export const DAY_LOG_ORIGINS: readonly DayLogOrigin[] = ['renderer', 'tasks', 'agent', 'app']

/**
 * In einer bestehenden Notiz wechselte eine Checkbox mit gleichem Text von offen auf abgehakt.
 *
 * Der Aufgabentext steht NICHT im Protokoll (Codex F18, Nutzerentscheidung 11.11.2026): das
 * Protokoll liegt außerhalb des Vaults und soll keine zweite Kopie von Notizinhalten sein.
 * Gespeichert wird nur `key`, eine kurze Prüfsumme des Textes; den Text liest der Verbraucher
 * bei Bedarf aus der Notiz (`findTaskText`). Wurde die Aufgabe inzwischen umformuliert oder
 * gelöscht, gibt es keinen Text mehr — das ist gewollt.
 */
export interface TaskCheckedEvent {
  at: number
  kind: 'task-checked'
  /** Vault-relativer Pfad der Notiz. */
  note: string
  /** Prüfsumme des normalisierten Aufgabentexts (`taskKey`), kein Inhalt. */
  key: string
  origin: DayLogOrigin
}

/** Eine Notiz wurde gespeichert oder angelegt — höchstens ein Ereignis je Notiz und Kalendertag. */
export interface NoteSavedEvent {
  at: number
  kind: 'note-saved'
  note: string
  /** true: die Datei gab es vorher nicht. */
  created: boolean
  origin: DayLogOrigin
}

/** Eine Notiz wurde in der App umbenannt oder verschoben. `note` ist der neue Pfad. */
export interface NoteMovedEvent {
  at: number
  kind: 'note-moved'
  note: string
  from: string
  origin: DayLogOrigin
}

export type DayLogEvent = TaskCheckedEvent | NoteSavedEvent | NoteMovedEvent

/** Zeitraum, in dem ein Eintrag nicht geschrieben werden konnte — dort ist nichts gemessen. */
export interface DayLogGap { from: number; to: number }

export const DAY_LOG_RETENTION_DAYS = 365
export const DAY_LOG_MAX_EVENTS = 20000
export const DAY_LOG_MAX_GAPS = 200

// Checkbox-Zeile wie im Rest der App (shared/taskExtractor.ts: nur „-“ und „*“, keine
// nummerierten Listen), zusätzlich in Zitaten und Hinweiskästen („> - [ ] …“) — der Lesen-Modus
// schreibt Kasteninhalte mit „> “ zurück. Zeilen in Code-Blöcken zählen nicht (`taskLines`).
const TASK_LINE = /^\s*(?:>\s*)*[-*]\s*\[([ xX])\]\s*(.*\S)\s*$/
const FENCE = /^\s*(?:>\s*)*(`{3,}|~{3,})/

function normalizeTaskText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Kurze Prüfsumme (FNV-1a, 32 Bit) des normalisierten Aufgabentexts. Kein Inhalt, nicht umkehrbar gemeint. */
export function taskKey(text: string): string {
  const t = normalizeTaskText(text)
  let h = 0x811c9dc5
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Alle Checkbox-Zeilen einer Notiz außerhalb von Code-Blöcken. */
export function taskLines(content: string): Array<{ text: string; done: boolean }> {
  const out: Array<{ text: string; done: boolean }> = []
  let fence: string | null = null
  for (const line of content.split(/\r?\n/)) {
    const f = FENCE.exec(line)
    if (f) {
      if (fence === null) fence = f[1]
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      continue
    }
    if (fence !== null) continue
    const m = TASK_LINE.exec(line)
    if (m) out.push({ text: normalizeTaskText(m[2]), done: m[1] !== ' ' })
  }
  return out
}

interface TaskCounts { open: number; done: number }

function countTasks(content: string): Map<string, TaskCounts> {
  const counts = new Map<string, TaskCounts>()
  for (const t of taskLines(content)) {
    const cur = counts.get(t.text) ?? { open: 0, done: 0 }
    if (t.done) cur.done++
    else cur.open++
    counts.set(t.text, cur)
  }
  return counts
}

/**
 * Welche Checkboxen wurden zwischen zwei Fassungen einer Notiz abgehakt?
 *
 * Gezählt wird nur ein Übergang: derselbe Text war vorher offen und ist jetzt (häufiger als
 * vorher) abgehakt. Eine neu eingefügte, schon abgehakte Zeile zählt nicht, eine umformulierte
 * Aufgabe auch nicht — beides ist kein belegter Abschluss. Gleichlautende Zeilen werden je
 * Vorkommen gezählt.
 *
 * Grenze (Codex F15): verglichen wird der TEXT, nicht die Zeile. Wer in einem Speichervorgang
 * eine offene Zeile löscht und eine gleichlautende abgehakte einfügt, erzeugt einen Treffer.
 * Darum heißt das Ergebnis überall „Checkbox auf erledigt gesetzt“, nicht „Aufgabe erledigt“.
 */
export function diffCheckedTasks(before: string, after: string): string[] {
  if (before === after) return []
  const old = countTasks(before)
  const now = countTasks(after)
  const checked: string[] = []
  for (const [text, n] of now) {
    const o = old.get(text)
    if (!o) continue
    const newlyDone = Math.max(0, n.done - o.done)
    const noLongerOpen = Math.max(0, o.open - n.open)
    for (let i = 0; i < Math.min(newlyDone, noLongerOpen); i++) checked.push(text)
  }
  return checked
}

/**
 * Wortlaut zu einer Prüfsumme aus dem HEUTIGEN Stand der Notiz; null = steht dort nicht mehr.
 * Das ist nicht zwingend die damals abgehakte Zeile (Codex F33): bei gleichlautenden Zeilen oder
 * einer Kollision der 32-Bit-Prüfsumme gibt es mehrere Kandidaten. Eine abgehakte Zeile geht vor
 * einer offenen. Wer den Text zeigt, nennt ihn „heutiger Wortlaut“.
 */
export function findTaskText(content: string, key: string): string | null {
  let open: string | null = null
  for (const t of taskLines(content)) {
    if (taskKey(t.text) !== key) continue
    if (t.done) return t.text
    open ??= t.text
  }
  return open
}

function isOrigin(v: unknown): v is DayLogOrigin {
  return typeof v === 'string' && (DAY_LOG_ORIGINS as readonly string[]).includes(v)
}

/** Zeilenweise Prüfung beim Lesen: eine beschädigte Datei verliert nur die kaputten Einträge. */
export function isDayLogEvent(v: unknown): v is DayLogEvent {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  if (typeof e.at !== 'number' || !Number.isFinite(e.at)) return false
  if (typeof e.note !== 'string' || e.note.length === 0) return false
  if (!isOrigin(e.origin)) return false
  if (e.kind === 'task-checked') return typeof e.key === 'string' && /^[0-9a-f]{8}$/.test(e.key)
  if (e.kind === 'note-saved') return typeof e.created === 'boolean'
  if (e.kind === 'note-moved') return typeof e.from === 'string' && e.from.length > 0
  return false
}

/**
 * Eintrag aus der Datei übernehmen. Einträge der ersten Fassung trugen den Aufgabentext im
 * Klartext (`text`): daraus wird die Prüfsumme, der Text wird verworfen und steht nach dem
 * nächsten Schreiben nicht mehr in der Datei. Nur die genannten Felder werden übernommen.
 */
export function normalizeDayLogEvent(v: unknown): DayLogEvent | null {
  if (!v || typeof v !== 'object') return null
  const e = v as Record<string, unknown>
  let candidate: unknown = null
  if (e.kind === 'task-checked') {
    const key = typeof e.key === 'string' ? e.key : (typeof e.text === 'string' && e.text ? taskKey(e.text) : null)
    candidate = { at: e.at, kind: e.kind, note: e.note, key, origin: e.origin }
  } else if (e.kind === 'note-saved') {
    candidate = { at: e.at, kind: e.kind, note: e.note, created: e.created, origin: e.origin }
  } else if (e.kind === 'note-moved') {
    candidate = { at: e.at, kind: e.kind, note: e.note, from: e.from, origin: e.origin }
  }
  return isDayLogEvent(candidate) ? candidate : null
}

/**
 * Pfade nach Umbenennen/Verschieben nachziehen — für eine Notiz oder einen ganzen Ordner.
 * `note-moved`-Einträge bleiben, wie sie waren: sie halten fest, was an jenem Tag geschah. Würde
 * ihr Ziel mitgezogen, machte ein späteres B → C aus dem früheren A → B rückwirkend A → C (Codex F27).
 */
export function remapDayLogPaths(events: readonly DayLogEvent[], from: string, to: string): { events: DayLogEvent[]; changed: number } {
  let changed = 0
  const out = events.map(e => {
    if (e.kind === 'note-moved') return e
    let note: string | null = null
    if (e.note === from) note = to
    else if (e.note.startsWith(from + '/')) note = to + e.note.slice(from.length)
    if (note === null) return e
    changed++
    return { ...e, note }
  })
  return { events: out, changed }
}

/** Lokaler Kalendertag als JJJJ-MM-TT. */
export function dayKey(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Grenzen eines lokalen Kalendertags. Das Ende ist die NÄCHSTE lokale Mitternacht, nicht
 * „Beginn + 24 h“ — am Tag der Zeitumstellung hat der Tag 23 oder 25 Stunden.
 * Ungültige oder unmögliche Daten (2026-02-30) ergeben null.
 */
export function localDayBounds(isoDate: string): { from: number; to: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0)
  if (start.getFullYear() !== y || start.getMonth() !== mo - 1 || start.getDate() !== d) return null
  const end = new Date(y, mo - 1, d + 1, 0, 0, 0, 0)
  return { from: start.getTime(), to: end.getTime() }
}

export function eventsInRange(events: readonly DayLogEvent[], range: { from: number; to: number }): DayLogEvent[] {
  return events.filter(e => e.at >= range.from && e.at < range.to)
}

/** Aufbewahrung: älter als die Frist fällt weg, darüber hinaus die ältesten über der Obergrenze. */
export function pruneDayLog(events: DayLogEvent[], now: number): DayLogEvent[] {
  const cutoff = now - DAY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const kept = events.filter(e => e.at >= cutoff)
  return kept.length > DAY_LOG_MAX_EVENTS ? kept.slice(kept.length - DAY_LOG_MAX_EVENTS) : kept
}

export interface DayLogSummary {
  /** Abgehakte Checkboxen; der Text wird bei Bedarf aus der Notiz gelesen (`findTaskText`). */
  tasksChecked: Array<{ key: string; note: string; at: number }>
  notesCreated: string[]
  /** Gespeichert, aber nicht an diesem Tag angelegt. */
  notesSaved: string[]
  notesMoved: Array<{ from: string; to: string }>
}

export function summarizeDayLog(events: readonly DayLogEvent[], range: { from: number; to: number }): DayLogSummary {
  const tasksChecked: DayLogSummary['tasksChecked'] = []
  const notesMoved: DayLogSummary['notesMoved'] = []
  const created = new Set<string>()
  const saved = new Set<string>()
  for (const e of eventsInRange(events, range)) {
    if (e.kind === 'task-checked') tasksChecked.push({ key: e.key, note: e.note, at: e.at })
    else if (e.kind === 'note-moved') notesMoved.push({ from: e.from, to: e.note })
    else if (e.created) created.add(e.note)
    else saved.add(e.note)
  }
  for (const n of created) saved.delete(n)
  return { tasksChecked, notesCreated: [...created], notesSaved: [...saved], notesMoved }
}

/** Lücken, die einen Zeitraum berühren. */
export function gapsInRange(gaps: readonly DayLogGap[], range: { from: number; to: number }): DayLogGap[] {
  return gaps.filter(g => g.from < range.to && g.to > range.from)
}

export function isDayLogGap(v: unknown): v is DayLogGap {
  if (!v || typeof v !== 'object') return false
  const g = v as Record<string, unknown>
  return typeof g.from === 'number' && typeof g.to === 'number' && Number.isFinite(g.from) && Number.isFinite(g.to) && g.to >= g.from
}

/**
 * Ab wann das Protokoll etwas weiß: Zeitpunkt des ältesten Eintrags. Ein Tag davor ist
 * „nicht gemessen“, nicht „nichts getan“. null = Protokoll ist leer.
 */
export function dayLogCoverageStart(events: readonly DayLogEvent[]): number | null {
  let min: number | null = null
  for (const e of events) if (min === null || e.at < min) min = e.at
  return min
}
