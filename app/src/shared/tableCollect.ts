// Deterministische Zusammenführung gleichartiger Tabellen (Notiz-Agent, Ordner-Läufe).
//
// Anlass: Ordner mit 60+ Excel-Rückläufen (z.B. eine Rückmeldung je Schule). Diese
// Zeilen dürfen NICHT durch den Modellkontext laufen — 60 Dateien à 30 Zeilen sprengen
// jedes Kontextfenster, und das Modell würde beim stillen Überlauf trotzdem
// weiterarbeiten (siehe shared/contextGuard.ts).
//
// Arbeitsteilung wie bei write_xlsx (Entscheidung 11 des Agent-Plans): Das Modell
// entscheidet die STRUKTUR (welche Spalten, welcher Filter), die App macht die ARBEIT
// (lesen, Kopfzeile finden, Spalten zuordnen, Zeilen sammeln). Dieses Modul ist der
// pure Kern davon — kein fs, kein LLM, testbar.

export interface SheetLike {
  name: string
  /** Zeilen als Zellen-Arrays, wie sie parseExcel liefert (bereits Strings). */
  rows: string[][]
}

/**
 * Vergleichsform eines Spaltennamens: Kleinschreibung, Umlaute aufgelöst, alles
 * außer Buchstaben/Ziffern entfernt. Schulen schreiben „Name, Vorname",
 * „Name/Vorname" und „name vorname" — das ist dieselbe Spalte.
 */
export function normalizeHeaderCell(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')
}

/** Zeilen ohne jeden Inhalt (nur leere/whitespace-Zellen). */
function isEmptyRow(row: string[]): boolean {
  return row.every(cell => !cell || !cell.trim())
}

/**
 * Index der Kopfzeile: die erste Zeile mit mindestens zwei befüllten Zellen.
 * Amtliche Vorlagen tragen oben oft einen Titel in einer einzelnen Zelle — der ist
 * keine Kopfzeile. Gibt -1 zurück, wenn es keine solche Zeile gibt.
 */
export function findHeaderRow(rows: string[][], searchLimit = 20): number {
  const limit = Math.min(rows.length, searchLimit)
  for (let i = 0; i < limit; i++) {
    const filled = rows[i].filter(c => c && c.trim()).length
    if (filled >= 2) return i
  }
  return -1
}

export interface ColumnMatch {
  /** So hat das Modell die Spalte genannt. */
  wanted: string
  /** Spaltenindex in der Tabelle, -1 wenn nicht gefunden. */
  index: number
  /** Tatsächliche Überschrift in dieser Datei (für den Bericht). */
  header?: string
}

/**
 * Ordnet gewünschte Spaltennamen den Überschriften einer Datei zu. Reihenfolge der
 * Versuche: exakt (normalisiert) → Überschrift beginnt mit dem Wunsch → Überschrift
 * enthält den Wunsch → Wunsch enthält die Überschrift. Eine Überschrift wird höchstens
 * einmal vergeben, sonst zieht ein unspezifischer Wunsch („name") mehrere Spalten an sich.
 */
export function matchColumns(header: string[], wanted: string[]): ColumnMatch[] {
  const normHeader = header.map(normalizeHeaderCell)
  const taken = new Set<number>()
  const pick = (test: (h: string, w: string) => boolean, w: string): number => {
    const nw = normalizeHeaderCell(w)
    if (!nw) return -1
    for (let i = 0; i < normHeader.length; i++) {
      if (taken.has(i) || !normHeader[i]) continue
      if (test(normHeader[i], nw)) return i
    }
    return -1
  }

  const result: ColumnMatch[] = wanted.map(w => ({ wanted: w, index: -1 }))
  const strategies: Array<(h: string, w: string) => boolean> = [
    (h, w) => h === w,
    (h, w) => h.startsWith(w),
    (h, w) => h.includes(w),
    (h, w) => w.includes(h)
  ]
  for (const test of strategies) {
    for (const entry of result) {
      if (entry.index !== -1) continue
      const idx = pick(test, entry.wanted)
      if (idx !== -1) {
        entry.index = idx
        entry.header = header[idx]
        taken.add(idx)
      }
    }
  }
  return result
}

export type RowFilterOp = 'nicht_leer' | 'enthaelt' | 'gleich' | 'datum_zwischen'

export interface RowFilter {
  /** Spaltenname wie in `columns` angegeben. */
  column: string
  op: RowFilterOp
  /** Vergleichswert für enthaelt/gleich. */
  value?: string
  /** ISO-Datum (JJJJ-MM-TT) für datum_zwischen. */
  from?: string
  to?: string
}

/** Datumserkennung für datum_zwischen: ISO, TT.MM.JJJJ, TT.MM.JJ. Sonst null. */
export function parseCellDate(value: string): string | null {
  const v = (value || '').trim()
  if (!v) return null
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const de = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/)
  if (de) {
    const [, d, m, y] = de
    const year = y.length === 2 ? (Number(y) > 70 ? `19${y}` : `20${y}`) : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

/** Prüft eine Zeile (Spaltenname → Zellwert) gegen alle Filter (UND-Verknüpfung). */
export function rowMatchesFilters(row: Record<string, string>, filters: RowFilter[]): boolean {
  for (const f of filters) {
    const cell = (row[f.column] ?? '').trim()
    switch (f.op) {
      case 'nicht_leer':
        if (!cell) return false
        break
      case 'enthaelt':
        if (!cell.toLowerCase().includes((f.value ?? '').trim().toLowerCase())) return false
        break
      case 'gleich':
        if (cell.toLowerCase() !== (f.value ?? '').trim().toLowerCase()) return false
        break
      case 'datum_zwischen': {
        const d = parseCellDate(cell)
        if (!d) return false
        if (f.from && d < f.from) return false
        if (f.to && d > f.to) return false
        break
      }
      default:
        return false
    }
  }
  return true
}

export interface SheetExtraction {
  /** Zeilen in der Reihenfolge von `columns` (fehlende Spalten = leere Zelle). */
  rows: string[][]
  /** Spalten, die in dieser Datei nicht gefunden wurden. */
  missingColumns: string[]
  /** Tatsächliche Überschriften der gefundenen Spalten (für den Bericht). */
  matchedHeaders: string[]
  /** Datenzeilen unterhalb der Kopfzeile, bevor gefiltert wurde. */
  dataRowCount: number
  /** Zeilen, die der Filter aussortiert hat. */
  filteredOutCount: number
  headerRowIndex: number
}

/**
 * Zieht die gewünschten Spalten aus EINEM Tabellenblatt. Vollständig leere Zeilen und
 * Zeilen, in denen keine der gewünschten Spalten befüllt ist, fallen raus — sonst
 * schleppt jede Vorlage ihre Leerzeilen-Reserve in die Auswertung.
 */
export function extractFromSheet(sheet: SheetLike, columns: string[], filters: RowFilter[] = []): SheetExtraction {
  const headerRowIndex = findHeaderRow(sheet.rows)
  if (headerRowIndex === -1) {
    return {
      rows: [],
      missingColumns: [...columns],
      matchedHeaders: [],
      dataRowCount: 0,
      filteredOutCount: 0,
      headerRowIndex: -1
    }
  }
  const header = sheet.rows[headerRowIndex]
  const matches = matchColumns(header, columns)
  const missingColumns = matches.filter(m => m.index === -1).map(m => m.wanted)
  const matchedHeaders = matches.filter(m => m.index !== -1).map(m => m.header as string)

  const rows: string[][] = []
  let dataRowCount = 0
  let filteredOutCount = 0
  for (let i = headerRowIndex + 1; i < sheet.rows.length; i++) {
    const raw = sheet.rows[i]
    if (isEmptyRow(raw)) continue
    const values = matches.map(m => (m.index === -1 ? '' : (raw[m.index] ?? '').trim()))
    if (values.every(v => !v)) continue
    dataRowCount++
    if (filters.length) {
      const asRecord: Record<string, string> = {}
      matches.forEach((m, idx) => { asRecord[m.wanted] = values[idx] })
      if (!rowMatchesFilters(asRecord, filters)) {
        filteredOutCount++
        continue
      }
    }
    rows.push(values)
  }
  return { rows, missingColumns, matchedHeaders, dataRowCount, filteredOutCount, headerRowIndex }
}

/** Blattwahl: Name (auch case-insensitiv) oder 1-basierte Nummer; ohne Angabe das erste. */
export function pickSheet(sheets: SheetLike[], wanted?: string): SheetLike | null {
  if (!sheets.length) return null
  const w = (wanted ?? '').trim()
  if (!w) return sheets[0]
  const byName = sheets.find(s => s.name === w) || sheets.find(s => s.name.toLowerCase() === w.toLowerCase())
  if (byName) return byName
  if (/^\d+$/.test(w)) return sheets[Number(w) - 1] ?? null
  return null
}

/**
 * CSV/TSV in Zeilen zerlegen. Bewusst klein gehalten: Trennzeichen wird an der
 * ersten Zeile erkannt (Semikolon zuerst — deutsche Excel-Exporte), Felder in
 * Anführungszeichen dürfen Trennzeichen und Zeilenumbrüche enthalten (`""` = ").
 */
export function parseDelimitedText(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const firstLine = src.split('\n', 1)[0] ?? ''
  const delim = delimiter || ([';', '\t', ','].find(d => firstLine.includes(d)) ?? ';')

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ }
        else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === delim) { row.push(cell); cell = ''; continue }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
    cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.map(r => r.map(c => c.trim()))
}

/**
 * `nicht_ausgewertet` ist ein eigener Zustand und kein Sonderfall von `leer`:
 * Eine Datei, die wegen einer Obergrenze gar nicht mehr angefasst wurde, hat
 * NICHTS über ihren Inhalt ausgesagt. Sie als „leer" zu führen, hätte eine
 * unvollständige Auswertung wie eine vollständige aussehen lassen.
 */
export interface FileCollectStatus {
  file: string
  status: 'ok' | 'teilweise' | 'leer' | 'fehler' | 'nicht_ausgewertet'
  rows: number
  missingColumns?: string[]
  message?: string
}

export interface CollectedTable {
  columns: string[]
  rows: string[][]
  files: FileCollectStatus[]
}

/** Dateien, bei denen etwas fehlte oder schiefging — die Grundlage der „Nicht verwertet"-Liste. */
export function problemFiles(files: FileCollectStatus[]): FileCollectStatus[] {
  return files.filter(f => f.status !== 'ok')
}

/**
 * Kompakter Bericht fürs Modell: Kennzahlen + Beispielzeilen + Problemdateien.
 * Bewusst begrenzt — die vollständigen Zeilen bleiben im Datensatz und wandern
 * direkt in die Excel-Datei, nicht durch den Kontext.
 */
export function formatCollectReport(
  datasetId: string,
  table: CollectedTable,
  opts: { sampleRows?: number; maxProblemLines?: number } = {}
): string {
  const sampleRows = opts.sampleRows ?? 20
  const maxProblems = opts.maxProblemLines ?? 30
  const ok = table.files.filter(f => f.status === 'ok').length
  const problems = problemFiles(table.files)

  const skipped = table.files.filter(f => f.status === 'nicht_ausgewertet').length

  const lines: string[] = []
  lines.push(`Datensatz "${datasetId}" erstellt: ${table.rows.length} Zeilen aus ${table.files.length} Dateien (${ok} vollständig, ${problems.length} mit Anmerkung).`)
  lines.push(`Spalten: ${table.columns.join(' | ')}`)
  // Der wichtigste Satz zuerst: eine gekappte Auswertung darf sich nicht wie eine
  // vollständige lesen — genau das würde der Nutzer sonst weitergeben.
  if (skipped > 0) {
    lines.push(`ACHTUNG: ${skipped} Dateien wurden wegen einer Obergrenze GAR NICHT ausgewertet. Diese Auswertung ist unvollständig — sage das im Ergebnis deutlich.`)
  }

  if (table.rows.length) {
    const sample = table.rows.slice(0, sampleRows)
    lines.push('', `Beispielzeilen (${sample.length} von ${table.rows.length}):`)
    lines.push(`| ${table.columns.join(' | ')} |`)
    lines.push(`| ${table.columns.map(() => '---').join(' | ')} |`)
    for (const r of sample) lines.push(`| ${r.map(c => c.replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`)
  } else {
    lines.push('', 'Keine Zeilen gefunden — Spaltennamen oder Filter prüfen.')
  }

  if (problems.length) {
    lines.push('', 'Nicht oder nur teilweise verwertet:')
    for (const p of problems.slice(0, maxProblems)) {
      const detail = p.message || (p.missingColumns?.length ? `Spalten fehlen: ${p.missingColumns.join(', ')}` : '')
      lines.push(`- ${p.file} — ${p.status}${detail ? ` (${detail})` : ''}${p.rows ? `, ${p.rows} Zeilen übernommen` : ''}`)
    }
    if (problems.length > maxProblems) lines.push(`- … ${problems.length - maxProblems} weitere`)
  }

  lines.push('', `Die vollständigen Zeilen bleiben in der App. Schreibe die Tabelle mit write_xlsx und dem Parameter dataset="${datasetId}" — gib die Zeilen NICHT selbst noch einmal ein.`)
  return lines.join('\n')
}
