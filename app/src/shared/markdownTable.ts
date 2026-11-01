// Markdown-Pipe-Tabellen erkennen und zerlegen — für die Word-Ausgabe des Notiz-Agenten.
// Vorher kannte markdownToDocxBuffer keine Tabellen: jede Tabelle (z.B. die
// Aufgabenübersicht, die der Protokoll-Skill verlangt) landete als rohe `| a | b |`-Zeilen
// in der .docx (real, 31.10.2026).

export type TableAlign = 'left' | 'center' | 'right' | null

export interface ParsedMarkdownTable {
  /** Kopfzeile; null, wenn alle Kopfzellen leer sind (`| | |` als Platzhalter-Kopf). */
  header: string[] | null
  rows: string[][]
  align: TableAlign[]
  /** Spaltenzahl = breiteste Zeile; kürzere Zeilen werden mit '' aufgefüllt. */
  columns: number
}

/** Eine Zeile, die als Tabellenzeile in Frage kommt: beginnt (nach Einrückung) mit `|`. */
export function isTableLine(line: string): boolean {
  return /^\s*\|/.test(line)
}

/** Zerlegt eine Pipe-Zeile in Zellen. `\|` bleibt als `|` in der Zelle, Pipes in `code` trennen nicht. */
export function splitTableRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  const cells: string[] = []
  let cur = ''
  let inCode = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue }
    if (ch === '`') inCode = !inCode
    if (ch === '|' && !inCode) { cells.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  // Ein abschließendes `|` erzeugt keine leere Zusatzzelle; fehlt es, zählt der Rest als Zelle.
  if (cur.trim() !== '' || !line.trim().endsWith('|')) cells.push(cur.trim())
  return cells
}

const SEPARATOR_CELL = /^:?-+:?$/

/** Trennzeile `|---|:--:|` unter dem Kopf. */
export function isSeparatorRow(line: string): boolean {
  if (!isTableLine(line)) return false
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every(c => SEPARATOR_CELL.test(c.replace(/\s+/g, '')))
}

function alignOf(cell: string): TableAlign {
  const c = cell.replace(/\s+/g, '')
  const l = c.startsWith(':'), r = c.endsWith(':')
  if (l && r) return 'center'
  if (r) return 'right'
  if (l) return 'left'
  return null
}

/**
 * Zerlegt einen Block aufeinanderfolgender Tabellenzeilen. Ohne Trennzeile an zweiter
 * Stelle ist es keine Tabelle (null) — der Aufrufer schreibt die Zeilen dann als Text,
 * statt etwas zu erraten.
 */
export function parseMarkdownTable(lines: string[]): ParsedMarkdownTable | null {
  if (lines.length < 2 || !isSeparatorRow(lines[1])) return null
  const head = splitTableRow(lines[0])
  const align = splitTableRow(lines[1]).map(alignOf)
  const rows = lines.slice(2).filter(l => !isSeparatorRow(l)).map(splitTableRow)
  const columns = Math.max(head.length, align.length, ...rows.map(r => r.length))
  const pad = (cells: string[]) => [...cells, ...Array(Math.max(0, columns - cells.length)).fill('')]
  const header = head.every(c => c === '') ? null : pad(head)
  return {
    header,
    rows: rows.map(pad),
    align: [...align, ...Array(Math.max(0, columns - align.length)).fill(null)],
    columns
  }
}
