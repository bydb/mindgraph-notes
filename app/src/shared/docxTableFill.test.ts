import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { fillDocxTableCells, MAX_FILL_ENTRIES, type DocxCellEntry } from './docxTableFill'

// ── Synthetische Mini-DOCX bauen (nur die Teile, die der Filler liest) ────────

function cell(content: string, opts?: { gridSpan?: number }): string {
  const tcPr = opts?.gridSpan
    ? `<w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:gridSpan w:val="${opts.gridSpan}"/></w:tcPr>`
    : '<w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr>'
  return `<w:tc>${tcPr}${content}</w:tc>`
}

function para(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
}

function row(...cells: string[]): string {
  return `<w:tr w:rsidR="00000000">${cells.join('')}</w:tr>`
}

function table(...rows: string[]): string {
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows.join('')}</w:tbl>`
}

async function buildDocx(bodyXml: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`
  )
  return zip.generateAsync({ type: 'uint8array' })
}

async function readDocXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  return zip.file('word/document.xml')!.async('string')
}

// Text der Zelle (table t, row r, grid-cell c) grob extrahieren — bewusst eine
// UNABHÄNGIGE Mini-Implementierung (regex-basiert, ohne den Filler selbst).
function cellTexts(xml: string): string[][][] {
  const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>(?![\s\S]*?<\/w:tc>)/g)]
  void tables
  // Einfacher: über Split, da Testtabellen NICHT verschachtelt verglichen werden.
  return xml
    .split('<w:tbl>')
    .slice(1)
    .map(t =>
      t
        .split('<w:tr')
        .slice(1)
        .map(r =>
          [...r.split('</w:tr>')[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(c =>
            // Nur echte <w:t>-Elemente (nicht <w:tcPr>, <w:tcW>, …); Entities zurückwandeln
            [...c[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
              .map(m =>
                m[1]
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&apos;/g, "'")
                  .replace(/&amp;/g, '&')
              )
              .join('\n')
          )
        )
    )
}

const THREE_TABLE_BODY =
  table(row(cell(para('t0r0c0')), cell(para('t0r0c1')))) +
  para('dazwischen') +
  table(row(cell(para('t1r0c0')))) +
  table(
    row(cell(para('Kopf')), cell(para('leer')), cell(para('Kopf-Wert'))), // row 0: 3 Zellen
    row(cell(para('Label 1')), cell(para(''))), // row 1
    row(cell(para('Label 2')), cell(para(''))), // row 2
    row(cell(para('Label 3')), cell(para(''))) // row 3
  )

describe('fillDocxTableCells', () => {
  it('schreibt in die richtige Top-Level-Tabelle/Zeile/Zelle (python-docx-Semantik)', async () => {
    const docx = await buildDocx(THREE_TABLE_BODY)
    const out = await fillDocxTableCells(docx, [
      { table: 2, row: 1, cell: 1, text: 'Wert Eins' },
      { table: 2, row: 3, cell: 1, text: 'Wert Drei' },
      { table: 2, row: 0, cell: 2, text: 'Neuer Kopf' },
      { table: 0, row: 0, cell: 0, text: 'Erste Tabelle' }
    ])
    const xml = await readDocXml(out)
    const t = cellTexts(xml)
    expect(t[2][1][1]).toBe('Wert Eins')
    expect(t[2][3][1]).toBe('Wert Drei')
    expect(t[2][0][2]).toBe('Neuer Kopf')
    expect(t[0][0][0]).toBe('Erste Tabelle')
    // Unberührte Zellen bleiben erhalten
    expect(t[2][2][1]).toBe('')
    expect(t[2][1][0]).toBe('Label 1')
    expect(t[1][0][0]).toBe('t1r0c0')
  })

  it('ignoriert verschachtelte Tabellen bei Tabellen- und Zeilenzählung', async () => {
    const nested = table(row(cell(para('innen'))))
    const body =
      table(row(cell(nested + para('außen-mit-innen')), cell(para('ziel-nicht')))) +
      table(row(cell(para('zweite'))), row(cell(para('zweite-r1'))))
    const docx = await buildDocx(body)
    const out = await fillDocxTableCells(docx, [{ table: 1, row: 1, cell: 0, text: 'getroffen' }])
    const xml = await readDocXml(out)
    expect(xml).toContain('getroffen')
    // Die verschachtelte Tabelle und Tabelle 0 bleiben unangetastet
    expect(xml).toContain('innen')
    expect(xml).toContain('außen-mit-innen')
    expect(xml).toContain('zweite</w:t>')
  })

  it('expandiert gridSpan wie python-docx (cell-Index = Raster-Spalte)', async () => {
    // row: [span2][normal] → Raster: 0,1 → erste tc; 2 → zweite tc
    const body = table(row(cell(para('breit'), { gridSpan: 2 }), cell(para('schmal'))))
    const docx = await buildDocx(body)
    const out = await fillDocxTableCells(docx, [{ table: 0, row: 0, cell: 2, text: 'in schmal' }])
    const t = cellTexts(await readDocXml(out))
    expect(t[0][0][0]).toBe('breit')
    expect(t[0][0][1]).toBe('in schmal')
  })

  it('macht aus \\n echte Absätze und escaped XML-Sonderzeichen', async () => {
    const docx = await buildDocx(THREE_TABLE_BODY)
    const out = await fillDocxTableCells(docx, [
      { table: 2, row: 1, cell: 1, text: 'Zeile <1> & "zwei"\nZeile 2' }
    ])
    const xml = await readDocXml(out)
    expect(xml).toContain('Zeile &lt;1&gt; &amp; &quot;zwei&quot;')
    expect(xml).toContain('Zeile 2')
    const t = cellTexts(xml)
    expect(t[2][1][1]).toBe('Zeile <1> & "zwei"\nZeile 2')
  })

  it('erhält <w:tcPr> (Zell-Formatierung) beim Ersetzen', async () => {
    const docx = await buildDocx(THREE_TABLE_BODY)
    const out = await fillDocxTableCells(docx, [{ table: 2, row: 1, cell: 1, text: 'X' }])
    const xml = await readDocXml(out)
    // jede tc unserer Fixture trägt tcW — auch die ersetzte Zelle muss es noch haben
    const t2 = xml.split('<w:tbl>')[3]
    const r1 = t2.split('<w:tr')[2]
    expect(r1).toContain('<w:tcW')
  })

  it('wirft klare Fehler bei Index außerhalb der Vorlage', async () => {
    const docx = await buildDocx(THREE_TABLE_BODY)
    await expect(fillDocxTableCells(docx, [{ table: 7, row: 0, cell: 0, text: 'x' }])).rejects.toThrow(/Tabelle 7/)
    await expect(fillDocxTableCells(docx, [{ table: 2, row: 99, cell: 1, text: 'x' }])).rejects.toThrow(/Zeile 99/)
    await expect(fillDocxTableCells(docx, [{ table: 2, row: 1, cell: 9, text: 'x' }])).rejects.toThrow(/Zelle 9/)
  })

  it('weist Duplikate, leere Eintragslisten und Überlängen ab', async () => {
    const docx = await buildDocx(THREE_TABLE_BODY)
    await expect(
      fillDocxTableCells(docx, [
        { table: 2, row: 1, cell: 1, text: 'a' },
        { table: 2, row: 1, cell: 1, text: 'b' }
      ])
    ).rejects.toThrow(/Doppelter Eintrag/)
    await expect(fillDocxTableCells(docx, [{ table: 2, row: 1, cell: 1, text: '' }])).rejects.toThrow(/leer/)
    const many: DocxCellEntry[] = Array.from({ length: MAX_FILL_ENTRIES + 1 }, (_, i) => ({
      table: 2,
      row: i,
      cell: 1,
      text: 'x'
    }))
    await expect(fillDocxTableCells(docx, many)).rejects.toThrow(/Zu viele/)
  })
})
