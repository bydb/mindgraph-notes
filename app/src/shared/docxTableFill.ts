// Füllt Tabellenzellen einer bestehenden DOCX-Datei (Formular-Vorlagen ohne
// {{Platzhalter}}, z. B. der amtliche Akkreditierungsantrag 2021). Pure Logik:
// Bytes + Zell-Einträge rein, Bytes raus — kein fs, kein electron (testbar via vitest).
//
// Semantik wie python-docx (`doc.tables[t].rows[r].cells[c]`):
// - tables = nur Top-Level-Tabellen im <w:body> (verschachtelte Tabellen in Zellen zählen nicht),
// - rows/cells = direkte Kinder (Zeilen/Zellen verschachtelter Tabellen werden übersprungen),
// - cells wird über gridSpan auf Raster-Spalten expandiert (eine horizontal verbundene
//   Zelle belegt mehrere Spaltenindizes — wie python-docx `row.cells`).
// Der Zellinhalt wird ersetzt (Absätze in Arial 10 pt, \n = neuer Absatz); <w:tcPr> bleibt erhalten.

import JSZip from 'jszip'

export interface DocxCellEntry {
  /** Top-Level-Tabellenindex im Dokument, 0-basiert. */
  table: number
  /** Zeilenindex innerhalb der Tabelle, 0-basiert. */
  row: number
  /** Raster-Spaltenindex (gridSpan-expandiert), 0-basiert. */
  cell: number
  /** Zelltext; \n erzeugt echte Absätze. Leer/undefined → Eintrag wird übersprungen. */
  text: string
}

export const MAX_FILL_ENTRIES = 80
export const MAX_FILL_TEXT_CHARS = 8000

interface Range {
  /** Startindex des öffnenden Tags. */
  start: number
  /** Index NACH dem schließenden Tag. */
  end: number
  /** Startindex des Inhalts (nach dem öffnenden Tag). */
  contentStart: number
  /** Index des schließenden Tags (Inhalt endet hier). */
  contentEnd: number
}

// Alle Start-/End-Tags eines Namens finden. OOXML-Container (w:tbl/w:tr/w:tc)
// sind nie self-closing; Attribute (w:rsidR etc.) werden toleriert.
function findTopLevelRanges(xml: string, tag: string, from: number, to: number, skipTag?: string): Range[] {
  const ranges: Range[] = []
  const tokenRe = new RegExp(`<(/?)(${tag}${skipTag ? `|${skipTag}` : ''})(?=[\\s>])`, 'g')
  tokenRe.lastIndex = from
  let depth = 0 // Verschachtelungstiefe des gesuchten Tags selbst
  let skipDepth = 0 // Tiefe innerhalb zu überspringender Container (z. B. verschachtelte w:tbl)
  let current: { start: number; contentStart: number } | null = null
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(xml)) !== null && m.index < to) {
    const closing = m[1] === '/'
    const name = m[2]
    const tagEnd = xml.indexOf('>', m.index)
    if (tagEnd === -1) break
    if (skipTag && name === skipTag) {
      skipDepth += closing ? -1 : 1
      continue
    }
    if (skipDepth > 0) continue
    if (!closing) {
      depth++
      if (depth === 1) current = { start: m.index, contentStart: tagEnd + 1 }
    } else {
      depth--
      if (depth === 0 && current) {
        ranges.push({ start: current.start, end: tagEnd + 1, contentStart: current.contentStart, contentEnd: m.index })
        current = null
      }
    }
  }
  return ranges
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const RUN_PROPS =
  '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'

// \n-getrennte Zeilen → OOXML-Absätze in Arial 10 pt (sz = Halbpunkte).
function buildCellContent(text: string): string {
  return text
    .split('\n')
    .map(line =>
      line.length === 0
        ? `<w:p><w:pPr>${RUN_PROPS}</w:pPr></w:p>`
        : `<w:p><w:pPr>${RUN_PROPS}</w:pPr><w:r>${RUN_PROPS}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
    )
    .join('')
}

// gridSpan einer Zelle aus ihrem <w:tcPr> lesen (Default 1).
function gridSpanOf(xml: string, cellRange: Range): number {
  const tcPrEnd = xml.indexOf('</w:tcPr>', cellRange.contentStart)
  const scanEnd = tcPrEnd !== -1 && tcPrEnd < cellRange.contentEnd ? tcPrEnd : cellRange.contentStart
  const slice = xml.slice(cellRange.contentStart, scanEnd)
  const m = slice.match(/<w:gridSpan\s+w:val="(\d+)"/)
  return m ? Math.max(1, parseInt(m[1], 10)) : 1
}

// Raster-Spaltenindex → tc-Range (python-docx-Expansion: eine tc mit gridSpan n
// deckt n aufeinanderfolgende Spaltenindizes ab).
function cellRangeForGridIndex(xml: string, cellRanges: Range[], gridIndex: number): Range | null {
  let col = 0
  for (const r of cellRanges) {
    const span = gridSpanOf(xml, r)
    if (gridIndex < col + span) return r
    col += span
  }
  return null
}

/**
 * Füllt Tabellenzellen in einer DOCX. Wirft bei Index außerhalb der Vorlage
 * einen Fehler mit klarer Meldung (falsche Vorlagen-Version erkennbar).
 */
export async function fillDocxTableCells(templateBytes: Uint8Array, entries: DocxCellEntry[]): Promise<Uint8Array> {
  const applicable = entries.filter(e => typeof e.text === 'string' && e.text.length > 0)
  if (applicable.length === 0) throw new Error('Keine zu schreibenden Einträge (alle Texte leer)')
  if (applicable.length > MAX_FILL_ENTRIES) {
    throw new Error(`Zu viele Einträge (${applicable.length}). Maximum: ${MAX_FILL_ENTRIES}.`)
  }
  for (const e of applicable) {
    if (e.text.length > MAX_FILL_TEXT_CHARS) {
      throw new Error(`Text für Tabelle ${e.table}, Zeile ${e.row} überschreitet ${MAX_FILL_TEXT_CHARS} Zeichen`)
    }
    if (![e.table, e.row, e.cell].every(n => Number.isInteger(n) && n >= 0)) {
      throw new Error('table/row/cell müssen nicht-negative Ganzzahlen sein')
    }
  }

  const zip = await JSZip.loadAsync(templateBytes)
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('word/document.xml nicht gefunden — keine gültige .docx?')
  let xml = await docFile.async('string')

  const bodyStart = xml.indexOf('<w:body')
  const bodyEnd = xml.lastIndexOf('</w:body>')
  if (bodyStart === -1 || bodyEnd === -1) throw new Error('Kein <w:body> im Dokument')

  // Alle Ziel-Zellbereiche VOR dem Ersetzen bestimmen, dann von hinten nach vorn
  // splicen — so bleiben die vorderen Offsets gültig.
  const tables = findTopLevelRanges(xml, 'w:tbl', bodyStart, bodyEnd)
  const jobs: Array<{ range: Range; text: string }> = []
  const seen = new Set<string>()

  for (const e of applicable) {
    const key = `${e.table}/${e.row}/${e.cell}`
    if (seen.has(key)) throw new Error(`Doppelter Eintrag für Tabelle ${e.table}, Zeile ${e.row}, Zelle ${e.cell}`)
    seen.add(key)

    const t = tables[e.table]
    if (!t) throw new Error(`Tabelle ${e.table} nicht gefunden (Dokument hat ${tables.length} Top-Level-Tabellen). Falsche Vorlagen-Version?`)
    const rows = findTopLevelRanges(xml, 'w:tr', t.contentStart, t.contentEnd, 'w:tbl')
    const r = rows[e.row]
    if (!r) throw new Error(`Zeile ${e.row} außerhalb der Tabelle ${e.table} (hat ${rows.length} Zeilen). Falsche Vorlagen-Version?`)
    const cells = findTopLevelRanges(xml, 'w:tc', r.contentStart, r.contentEnd, 'w:tbl')
    const c = cellRangeForGridIndex(xml, cells, e.cell)
    if (!c) throw new Error(`Zelle ${e.cell} außerhalb der Zeile ${e.row} (Tabelle ${e.table}). Falsche Vorlagen-Version?`)
    jobs.push({ range: c, text: e.text })
  }

  jobs.sort((a, b) => b.range.contentStart - a.range.contentStart)
  for (const job of jobs) {
    const { range } = job
    // <w:tcPr> (Zell-Formatierung: Breite, Rahmen, Merge) erhalten, nur Inhalt ersetzen.
    const tcPrClose = xml.indexOf('</w:tcPr>', range.contentStart)
    const keepUntil = tcPrClose !== -1 && tcPrClose < range.contentEnd ? tcPrClose + '</w:tcPr>'.length : range.contentStart
    xml = xml.slice(0, keepUntil) + buildCellContent(job.text) + xml.slice(range.contentEnd)
  }

  zip.file('word/document.xml', xml)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
