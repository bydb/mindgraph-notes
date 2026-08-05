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
 * Index der Kopfzeile allein nach Struktur: die erste Zeile mit mindestens zwei
 * befüllten Zellen. Nur noch Rückfallebene — siehe findBestHeaderRow.
 */
export function findHeaderRow(rows: string[][], searchLimit = 20): number {
  const limit = Math.min(rows.length, searchLimit)
  for (let i = 0; i < limit; i++) {
    const filled = rows[i].filter(c => c && c.trim()).length
    if (filled >= 2) return i
  }
  return -1
}

/**
 * Kopfzeile nach INHALT wählen: die Zeile im Suchbereich, die zu den gesuchten
 * Spalten am besten passt (bei Gleichstand die oberste).
 *
 * Die rein strukturelle Regel oben ist an echten Formularen gescheitert. Amtliche
 * Vorlagen tragen über der Tabelle einen Kopfblock:
 *
 *   Zeile 0: | Name der Schule: |  | Grundschule X | Schulnummer: | 3770 |
 *   Zeile 3: |                  | Vorname | Nachname |
 *
 * Zeile 0 hat mehr befüllte Zellen — die alte Regel nahm sie und behandelte die
 * echte Kopfzeile als Daten. Im Praxislauf traf das 34 von 34 Dateien.
 *
 * Ohne jeden Treffer (fremde Spaltennamen) fällt die Wahl auf die strukturelle Regel
 * zurück, damit der Bericht wenigstens sagen kann, was in der Datei steht.
 */
export function findBestHeaderRow(rows: string[][], columns: string[], searchLimit = 20): number {
  const limit = Math.min(rows.length, searchLimit)
  let bestRow = -1
  let bestScore = 0
  for (let i = 0; i < limit; i++) {
    const filled = rows[i].filter(c => c && c.trim()).length
    if (filled === 0) continue
    // Eine Zelle mit Doppelpunkt ist eine BESCHRIFTUNG im Kopfblock („Schulnummer:"),
    // keine Tabellenüberschrift. Ohne diese Abwertung gewinnt der Kopfblock bei
    // Gleichstand, weil er weiter oben steht — genau der Fall im Praxislauf.
    const score = matchColumns(rows[i], columns)
      .filter(m => m.index !== -1)
      .reduce((sum, m) => sum + ((m.header ?? '').trim().endsWith(':') ? 0.5 : 1), 0)
    if (score > bestScore) {
      bestScore = score
      bestRow = i
    }
  }
  return bestScore > 0 ? bestRow : findHeaderRow(rows, searchLimit)
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
/** Editierabstand mit Abbruch, sobald `max` überschritten ist. */
function editDistanceAtMost(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

/**
 * Tippfehler-Toleranz als LETZTE Stufe. Reale Vorlagen schreiben „Nachnahme" statt
 * „Nachname" — im Praxislauf in der Mehrzahl der Dateien. Bewusst eng: erst ab
 * 6 Zeichen und höchstens ein Zeichen Unterschied, sonst würden kurze Spaltennamen
 * wahllos aufeinander passen.
 */
function isTypoVariant(a: string, b: string): boolean {
  if (a.length < 6 || b.length < 6) return false
  return editDistanceAtMost(a, b, 1) <= 1
}

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
    (h, w) => w.includes(h),
    isTypoVariant
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

// Füllwörter, die beim Vergleich von Beschriftungen nichts beitragen.
const LABEL_STOPWORDS = new Set(['der', 'die', 'das', 'des', 'dem', 'den', 'und', 'von', 'fuer', 'im', 'in'])

/**
 * Passt eine Beschriftung aus dem Kopfblock zu einem gesuchten Spaltennamen?
 * „Name der Schule:" und „Schulname" meinen dasselbe, teilen aber keinen
 * gemeinsamen Teilstring — deshalb wortweise mit grober Stammform vergleichen
 * (Schule → schul, damit „Schulname" trifft).
 */
export function labelMatchesColumn(label: string, column: string): boolean {
  const target = normalizeHeaderCell(column)
  if (!target) return false
  const tokens = label
    .toLowerCase()
    .split(/[^a-zA-ZäöüßÄÖÜ0-9]+/)
    .map(normalizeHeaderCell)
    .filter(t => t.length >= 3 && !LABEL_STOPWORDS.has(t))
  if (tokens.length === 0) return false
  return tokens.every(tok => {
    if (target.includes(tok)) return true
    // Grobe Stammform: Endungen -e/-n/-en abschneiden (schule → schul).
    const stem = tok.replace(/(en|e|n)$/, '')
    return stem.length >= 3 && target.includes(stem)
  })
}

/**
 * Werte, die für die GANZE Datei gelten, aus dem Kopfblock über der Tabelle holen —
 * für Spalten, die in der Kopfzeile selbst fehlen. Muster: eine Zelle ist die
 * Beschriftung, der Wert steht in der nächsten befüllten Zelle rechts daneben.
 * Eine Zelle, die selbst wie eine Beschriftung endet (Doppelpunkt), gilt nicht als Wert.
 */
export function findConstantsAbove(
  rows: string[][],
  headerRowIndex: number,
  columns: string[]
): Record<string, string> {
  const out: Record<string, string> = {}
  if (headerRowIndex <= 0) return out
  for (const column of columns) {
    for (let r = 0; r < headerRowIndex && !(column in out); r++) {
      const row = rows[r]
      for (let c = 0; c < row.length; c++) {
        const cell = (row[c] ?? '').trim()
        if (!cell || !labelMatchesColumn(cell, column)) continue
        for (let v = c + 1; v < row.length; v++) {
          const value = (row[v] ?? '').trim()
          if (!value) continue
          if (!value.endsWith(':')) out[column] = value
          break
        }
        if (column in out) break
      }
    }
  }
  return out
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
  /** Spalten, deren Wert aus dem Kopfblock über der Tabelle stammt und für alle Zeilen gilt. */
  constants: Record<string, string>
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
  const headerRowIndex = findBestHeaderRow(sheet.rows, columns)
  if (headerRowIndex === -1) {
    return {
      rows: [],
      missingColumns: [...columns],
      matchedHeaders: [],
      constants: {},
      dataRowCount: 0,
      filteredOutCount: 0,
      headerRowIndex: -1
    }
  }
  const header = sheet.rows[headerRowIndex]
  const matches = matchColumns(header, columns)
  const missingInHeader = matches.filter(m => m.index === -1).map(m => m.wanted)
  const matchedHeaders = matches.filter(m => m.index !== -1).map(m => m.header as string)
  // Was nicht in der Kopfzeile steht, kann im Kopfblock darüber stehen und für die
  // ganze Datei gelten (Schulname, Schulnummer). Ohne das bliebe die Herkunft der
  // Zeilen auf den Dateinamen beschränkt.
  const constants = findConstantsAbove(sheet.rows, headerRowIndex, missingInHeader)
  const missingColumns = missingInHeader.filter(c => !(c in constants))

  const rows: string[][] = []
  let dataRowCount = 0
  let filteredOutCount = 0
  for (let i = headerRowIndex + 1; i < sheet.rows.length; i++) {
    const raw = sheet.rows[i]
    if (isEmptyRow(raw)) continue
    const values = matches.map(m => (m.index === -1 ? '' : (raw[m.index] ?? '').trim()))
    // Konstanten dürfen NICHT darüber entscheiden, ob eine Zeile Inhalt hat — sonst
    // gälte jede Leerzeile der Vorlage als Datenzeile (sie trüge ja den Schulnamen).
    if (values.every(v => !v)) continue
    matches.forEach((m, idx) => {
      if (m.index === -1 && m.wanted in constants) values[idx] = constants[m.wanted]
    })
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
  return { rows, missingColumns, matchedHeaders, constants, dataRowCount, filteredOutCount, headerRowIndex }
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
  /** Spalten, die in JEDER ausgewerteten Datei gefehlt haben — der Name passt dann nicht. */
  alwaysMissingColumns?: string[]
  /** Beispiel-Zeilen aus den Dateien, damit das Modell die echten Überschriften sieht. */
  headerCandidates?: Array<{ file: string; rows: string[] }>
}

/**
 * Welche Spalten haben in ALLEN ausgewerteten Dateien gefehlt? Genau die sind
 * falsch benannt — eine einzelne Datei ohne die Spalte ist dagegen normal.
 * Dateien, die gar nicht gelesen wurden, zählen nicht mit.
 */
export function alwaysMissingColumns(columns: string[], files: FileCollectStatus[]): string[] {
  const evaluated = files.filter(f => f.status !== 'nicht_ausgewertet' && f.status !== 'fehler')
  if (evaluated.length === 0) return []
  return columns.filter(c => evaluated.every(f => (f.missingColumns ?? []).includes(c)))
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

  // Spalten, die ÜBERALL fehlen: Das ist kein Datenproblem, sondern ein falscher
  // Spaltenname. Ohne diese Rückmeldung ist das Modell im Praxislauf dazu
  // übergegangen, alle Dateien einzeln zu lesen — und lief in die Zeitüberschreitung.
  const alwaysMissing = table.alwaysMissingColumns ?? []
  if (alwaysMissing.length) {
    lines.push('', `SPALTEN NICHT GEFUNDEN: ${alwaysMissing.join(', ')} — diese Bezeichnung kommt in KEINER Datei vor.`)
    if (table.headerCandidates?.length) {
      lines.push('So sehen die Zeilen in den Dateien tatsächlich aus:')
      for (const cand of table.headerCandidates) {
        lines.push(`- ${cand.file}:`)
        for (const r of cand.rows) lines.push(`    ${r}`)
      }
    }
    lines.push('Rufe collect_table ERNEUT auf und nimm die Bezeichnungen, die dort wirklich stehen. Lies dafür NICHT alle Dateien einzeln.')
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
