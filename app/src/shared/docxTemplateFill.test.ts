import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { fillDocxTemplate, normalizePlaceholderRuns, applyTemplateFormatting } from './docxTemplateFill'

// ── Synthetische Mini-DOCX (Vorlage mit Kopfzeile, Körper aus der docx-Bibliothek) ──

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

function docXml(bodyXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`
}

const CONTENT_TYPES =
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
const DOC_RELS =
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>'

async function buildTemplate(opts: { numbering?: string; header?: string; body?: string; styles?: string } = {}): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  zip.file('word/_rels/document.xml.rels', DOC_RELS)
  const body =
    opts.body ??
    '<w:p><w:pPr><w:spacing w:after="120"/><w:rPr><w:sz w:val="21"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr><w:t>{{INHALT}}</w:t></w:r></w:p><w:p><w:r><w:t>Unterschrift</w:t></w:r></w:p>'
  zip.file('word/document.xml', docXml(body))
  zip.file(
    'word/header1.xml',
    opts.header ??
      `<?xml version="1.0"?><w:hdr ${W}><w:p><w:r><w:rPr><w:rFonts w:ascii="Arial"/></w:rPr><w:t xml:space="preserve">{{TITEL}} </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>{{KUERZEL}}</w:t></w:r></w:p></w:hdr>`
  )
  if (opts.numbering) zip.file('word/numbering.xml', opts.numbering)
  if (opts.styles) zip.file('word/styles.xml', opts.styles)
  return zip.generateAsync({ type: 'uint8array' })
}

async function buildBody(paragraphs: string, numbering?: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  zip.file('word/document.xml', docXml(paragraphs))
  if (numbering) zip.file('word/numbering.xml', numbering)
  return zip.generateAsync({ type: 'uint8array' })
}

async function part(bytes: Uint8Array, name: string): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const f = zip.file(name)
  if (!f) throw new Error(`Part fehlt: ${name}`)
  return f.async('string')
}

const BODY_NUMBERING = `<?xml version="1.0"?><w:numbering ${W} xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w:abstractNum w:abstractNumId="1" w15:restartNumberingAfterBreak="0"><w:lvl w:ilvl="0" w15:tentative="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="●"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num></w:numbering>`

const TEMPLATE_NUMBERING = `<?xml version="1.0"?><w:numbering ${W}><w:abstractNum w:abstractNumId="30"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="30"><w:abstractNumId w:val="30"/></w:num></w:numbering>`

const LIST_BODY =
  '<w:p><w:r><w:t>Einleitung</w:t></w:r></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>Fett</w:t></w:r><w:r><w:t xml:space="preserve"> normal</w:t></w:r></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>Eins</w:t></w:r></w:p>'

describe('fillDocxTemplate', () => {
  it('setzt den Körper an die Stelle von {{INHALT}} und lässt den Rest der Vorlage stehen', async () => {
    const out = await fillDocxTemplate(await buildTemplate(), await buildBody('<w:p><w:r><w:t>Hallo</w:t></w:r></w:p>'), {})
    const doc = await part(out.bytes, 'word/document.xml')
    expect(doc).not.toContain('{{INHALT}}')
    expect(doc).toContain('<w:t>Hallo</w:t>')
    expect(doc).toContain('<w:t>Unterschrift</w:t>')
    expect(doc.indexOf('Hallo')).toBeLessThan(doc.indexOf('Unterschrift'))
    // Abschnittseigenschaften des Körpers werden NICHT übernommen (die Vorlage bestimmt das Seitenformat)
    expect(doc.match(/<w:sectPr>/g)?.length ?? 0).toBe(1)
    expect(doc).toContain('w:h="16838"')
  })

  it('überträgt Schrift und Absatzabstand des Platzhalter-Absatzes, Fett und Größe des Textes gewinnen', async () => {
    const body =
      '<w:p><w:r><w:t>Normal</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>Titel</w:t></w:r></w:p>'
    const out = await fillDocxTemplate(await buildTemplate(), await buildBody(body), {})
    const doc = await part(out.bytes, 'word/document.xml')
    // Normaler Lauf: Schrift + Größe aus der Vorlage, in Schema-Reihenfolge
    expect(doc).toContain('<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr><w:t>Normal</w:t></w:r>')
    // Fetter Lauf mit eigener Größe: Vorlagen-Schrift, eigene Größe, w:b vor w:sz
    expect(doc).toContain('<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>Titel</w:t>')
    // Absatz ohne eigene Eigenschaften erbt den Abstand; eigener Abstand gewinnt
    expect(doc).toContain('<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr><w:t>Normal</w:t>')
    expect(doc).toContain('<w:pPr><w:spacing w:after="0"/></w:pPr>')
    // Die Absatzmarken-Formatierung (w:rPr im pPr) und Nummerierung werden nicht kopiert
    expect(doc).not.toContain('<w:pPr><w:spacing w:after="120"/><w:rPr>')
  })

  it('füllt Felder in Kopfzeile und Körper, behält die Lauf-Formatierung und entfernt leere Platzhalter', async () => {
    const out = await fillDocxTemplate(await buildTemplate(), await buildBody('<w:p><w:r><w:t>x</w:t></w:r></w:p>'), { titel: 'Einladung' })
    const hdr = await part(out.bytes, 'word/header1.xml')
    expect(hdr).toContain('<w:rPr><w:rFonts w:ascii="Arial"/></w:rPr><w:t xml:space="preserve"></w:t><w:t xml:space="preserve">Einladung</w:t><w:t xml:space="preserve"> </w:t>')
    expect(hdr).not.toContain('{{KUERZEL}}')
    expect(hdr).toContain('<w:rPr><w:b/></w:rPr>')
    expect(out.filled).toEqual(['TITEL'])
    expect(out.unfilled).toEqual(['KUERZEL'])
  })

  it('escaped Feldwerte und macht \\n zum Zeilenumbruch', async () => {
    const out = await fillDocxTemplate(await buildTemplate(), await buildBody('<w:p><w:r><w:t>x</w:t></w:r></w:p>'), {
      TITEL: 'A & B <C>\nZeile 2',
      KUERZEL: ''
    })
    const hdr = await part(out.bytes, 'word/header1.xml')
    expect(hdr).toContain('<w:t xml:space="preserve">A &amp; B &lt;C&gt;</w:t><w:br/><w:t xml:space="preserve">Zeile 2</w:t>')
    expect(out.unfilled).toEqual([])
  })

  it('zieht einen von Word zerlegten Platzhalter wieder zusammen', async () => {
    const header = `<?xml version="1.0"?><w:hdr ${W}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>{{TI</w:t></w:r><w:r w:rsidR="00AA"><w:t>TEL}}</w:t></w:r></w:p></w:hdr>`
    const out = await fillDocxTemplate(await buildTemplate({ header }), await buildBody('<w:p><w:r><w:t>x</w:t></w:r></w:p>'), { TITEL: 'Ganz' })
    const hdr = await part(out.bytes, 'word/header1.xml')
    expect(hdr).toContain('<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"></w:t><w:t xml:space="preserve">Ganz</w:t><w:t xml:space="preserve"></w:t></w:r></w:p>')
    expect(out.filled).toEqual(['TITEL'])
  })

  it('übernimmt Listen: Nummerierungs-IDs werden versetzt und in die Vorlage eingehängt', async () => {
    const out = await fillDocxTemplate(await buildTemplate({ numbering: TEMPLATE_NUMBERING }), await buildBody(LIST_BODY, BODY_NUMBERING), {})
    const doc = await part(out.bytes, 'word/document.xml')
    const num = await part(out.bytes, 'word/numbering.xml')
    // Versatz = max(30, 30) + 1 = 31 → Körper-numId 1 → 32, 2 → 33
    expect(doc).toContain('<w:numId w:val="32"/>')
    expect(doc).toContain('<w:numId w:val="33"/>')
    expect(num).toContain('<w:abstractNum w:abstractNumId="32">')
    expect(num).toContain('<w:abstractNum w:abstractNumId="31">')
    expect(num).toContain('<w:num w:numId="32"><w:abstractNumId w:val="32"/></w:num>')
    expect(num).toContain('<w:num w:numId="33"><w:abstractNumId w:val="31"/></w:num>')
    // Vorlagen-Liste bleibt, Reihenfolge abstractNum → num bleibt, w15-Attribute sind weg
    expect(num).toContain('<w:num w:numId="30">')
    expect(num.indexOf('<w:abstractNum w:abstractNumId="32">')).toBeLessThan(num.indexOf('<w:num w:numId="30">'))
    expect(num).not.toContain('w15:')
    // Fett im Listenpunkt überlebt
    expect(doc).toContain('<w:b/><w:bCs/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr><w:t>Fett</w:t>')
  })

  it('legt numbering.xml samt Beziehung und Content-Type an, wenn die Vorlage keine Listen kennt', async () => {
    const out = await fillDocxTemplate(await buildTemplate(), await buildBody(LIST_BODY, BODY_NUMBERING), {})
    const num = await part(out.bytes, 'word/numbering.xml')
    expect(num).toContain('w:abstractNumId="1"')
    expect(await part(out.bytes, 'word/_rels/document.xml.rels')).toContain('Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"')
    expect(await part(out.bytes, '[Content_Types].xml')).toContain('PartName="/word/numbering.xml"')
  })

  it('bildet generierte Stil-IDs auf die deutschen IDs der Vorlage ab', async () => {
    const styles = `<?xml version="1.0"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Listenabsatz"><w:name w:val="List Paragraph"/></w:style></w:styles>`
    const out = await fillDocxTemplate(await buildTemplate({ styles, numbering: TEMPLATE_NUMBERING }), await buildBody(LIST_BODY, BODY_NUMBERING), {})
    const doc = await part(out.bytes, 'word/document.xml')
    expect(doc).toContain('<w:pStyle w:val="Listenabsatz"/>')
    expect(doc).not.toContain('ListParagraph')
  })

  it('meldet eine Vorlage ohne {{INHALT}} als Fehler', async () => {
    const tpl = await buildTemplate({ body: '<w:p><w:r><w:t>Kein Platzhalter</w:t></w:r></w:p>' })
    await expect(fillDocxTemplate(tpl, await buildBody('<w:p><w:r><w:t>x</w:t></w:r></w:p>'), {})).rejects.toThrow('{{INHALT}}')
  })
})

describe('normalizePlaceholderRuns', () => {
  it('lässt Absätze ohne zerlegte Platzhalter unverändert', () => {
    const xml = '<w:p><w:r><w:t>{{A}}</w:t></w:r><w:r><w:t>{{B}}</w:t></w:r></w:p>'
    expect(normalizePlaceholderRuns(xml)).toBe(xml)
  })
  it('fasst Absätze mit Grafiken nicht an', () => {
    const xml = '<w:p><w:r><w:drawing/></w:r><w:r><w:t>{{A</w:t></w:r><w:r><w:t>}}</w:t></w:r></w:p>'
    expect(normalizePlaceholderRuns(xml)).toBe(xml)
  })
})

describe('applyTemplateFormatting', () => {
  it('fügt Lauf-Eigenschaften auch in Läufe ohne rPr ein und sortiert nach Schema', () => {
    const out = applyTemplateFormatting('<w:p><w:r><w:t>a</w:t></w:r></w:p>', '', '<w:sz w:val="20"/><w:rFonts w:ascii="X"/>')
    expect(out).toBe('<w:p><w:r><w:rPr><w:rFonts w:ascii="X"/><w:sz w:val="20"/></w:rPr><w:t>a</w:t></w:r></w:p>')
  })
})
