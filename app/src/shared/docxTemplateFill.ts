// Setzt einen aus Markdown gerenderten Textkörper in eine DOCX-Vorlage mit
// {{Platzhaltern}} ein (Briefkopf-Vorlagen: Kopf-/Fußzeile, Logo, Seitenränder
// bleiben exakt erhalten). Pure Logik: Bytes rein, Bytes raus — kein fs, kein
// electron (testbar via vitest), gleiche Bauart wie docxTableFill.
//
// Vertrag der Vorlage:
// - Genau ein Absatz im Dokumentkörper enthält {{INHALT}}. Er wird durch den
//   gerenderten Textkörper ersetzt; seine Absatz- und Zeichenformatierung
//   (Schrift, Größe, Abstände) wird auf alle erzeugten Absätze übertragen,
//   sofern der Text nichts anderes vorgibt (Fett, Überschriftgröße …).
// - Weitere Platzhalter wie {{TITEL}} dürfen überall stehen (Kopfzeile, Fußzeile,
//   Text) und werden aus `fields` gefüllt; die Formatierung des Platzhalter-Laufs
//   bleibt. Nicht gefüllte Platzhalter werden entfernt und gemeldet.
//
// Warum nicht docx.patchDocument: der Patcher der docx-Bibliothek (9.x) kennt im
// Vorlagen-Modus keine Nummerierungen — jede Aufzählung stürzt ab.

import JSZip from 'jszip'

export const BODY_PLACEHOLDER = 'INHALT'
export const MAX_TEMPLATE_FIELDS = 40
export const MAX_TEMPLATE_FIELD_CHARS = 2000

const PLACEHOLDER_RE = /\{\{([A-Za-z0-9_]+)\}\}/g

export interface DocxTemplateFillResult {
  bytes: Uint8Array
  /** Platzhalter, die aus `fields` gefüllt wurden. */
  filled: string[]
  /** Platzhalter der Vorlage, für die kein Wert vorlag (wurden entfernt). */
  unfilled: string[]
}

// Schema-Reihenfolge der Kinder von w:pPr bzw. w:rPr — Word lehnt Dokumente mit
// falsch sortierten Eigenschaften als „unlesbar" ab, also nach dem Mischen sortieren.
const PPR_ORDER = [
  'w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr', 'w:widowControl', 'w:numPr',
  'w:suppressLineNumbers', 'w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku', 'w:wordWrap',
  'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN', 'w:bidi', 'w:adjustRightInd',
  'w:snapToGrid', 'w:spacing', 'w:ind', 'w:contextualSpacing', 'w:mirrorIndents', 'w:suppressOverlap', 'w:jc',
  'w:textDirection', 'w:textAlignment', 'w:textboxTightWrap', 'w:outlineLvl', 'w:divId', 'w:cnfStyle', 'w:rPr',
  'w:sectPr', 'w:pPrChange'
]
const RPR_ORDER = [
  'w:rStyle', 'w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps', 'w:smallCaps', 'w:strike', 'w:dstrike',
  'w:outline', 'w:shadow', 'w:emboss', 'w:imprint', 'w:noProof', 'w:snapToGrid', 'w:vanish', 'w:webHidden',
  'w:color', 'w:spacing', 'w:w', 'w:kern', 'w:position', 'w:sz', 'w:szCs', 'w:highlight', 'w:u', 'w:effect',
  'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout',
  'w:specVanish', 'w:oMath'
]

// Eigenschaften, die beim Übertragen des Platzhalter-Absatzes NICHT mitgehen:
// Nummerierung/Stil sind Sache des erzeugten Absatzes, w:rPr im pPr ist die
// Formatierung der Absatzmarke, Revisionen sind sinnlos.
const PPR_SKIP = new Set(['w:numPr', 'w:pStyle', 'w:rPr', 'w:pPrChange', 'w:sectPr'])
const RPR_SKIP = new Set(['w:rStyle', 'w:rPrChange'])

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

/** Reintext eines Absatz-XML (nur w:t-Inhalte). */
function paragraphText(pXml: string): string {
  let out = ''
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t\s*\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(pXml)) !== null) out += unescapeXml(m[1] ?? '')
  return out
}

/** Direkte Kind-Elemente eines XML-Fragments (flach, ohne Textknoten). */
function childElements(fragment: string): { tag: string; xml: string }[] {
  const out: { tag: string; xml: string }[] = []
  let i = 0
  while (i < fragment.length) {
    const open = fragment.indexOf('<', i)
    if (open === -1) break
    const nameM = /^<([A-Za-z0-9_:.-]+)/.exec(fragment.slice(open))
    if (!nameM) { i = open + 1; continue }
    const tag = nameM[1]
    const tagEnd = fragment.indexOf('>', open)
    if (tagEnd === -1) break
    if (fragment[tagEnd - 1] === '/') {
      out.push({ tag, xml: fragment.slice(open, tagEnd + 1) })
      i = tagEnd + 1
      continue
    }
    // Öffnendes Tag: passendes schließendes Tag gleicher Tiefe suchen.
    let depth = 1
    let pos = tagEnd + 1
    const tokRe = new RegExp(`<(/?)${tag.replace(/[.]/g, '\\.')}(?=[\\s>/])`, 'g')
    tokRe.lastIndex = pos
    let end = -1
    let t: RegExpExecArray | null
    while ((t = tokRe.exec(fragment)) !== null) {
      const tEnd = fragment.indexOf('>', t.index)
      if (tEnd === -1) break
      const selfClosing = fragment[tEnd - 1] === '/'
      if (t[1] === '/') depth--
      else if (!selfClosing) depth++
      if (depth === 0) { end = tEnd + 1; break }
      pos = tEnd + 1
    }
    if (end === -1) { out.push({ tag, xml: fragment.slice(open) }); break }
    out.push({ tag, xml: fragment.slice(open, end) })
    i = end
  }
  return out
}

/** Vorlagen-Eigenschaften mit denen des erzeugten Elements mischen; das Erzeugte gewinnt. */
function mergeProps(templateInner: string, ownInner: string, order: string[], skip: Set<string>): string {
  const own = childElements(ownInner)
  const ownTags = new Set(own.map(c => c.tag))
  const merged = childElements(templateInner).filter(c => !skip.has(c.tag) && !ownTags.has(c.tag)).concat(own)
  const rank = (tag: string): number => {
    const idx = order.indexOf(tag)
    return idx === -1 ? order.length : idx
  }
  return merged
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c.tag) - rank(b.c.tag) || a.i - b.i)
    .map(x => x.c.xml)
    .join('')
}

/** Inhalt des ersten <tag>…</tag> in einem Fragment, oder null. */
function innerOf(fragment: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(fragment)
  if (m) return m[1]
  return new RegExp(`<${tag}\\s*/>`).test(fragment) ? '' : null
}

/**
 * Word zerlegt beim Bearbeiten Läufe (Rechtschreibprüfung, rsid), sodass ein
 * Platzhalter wie {{TITEL}} über mehrere w:r verteilt sein kann. Absätze, deren
 * Reintext einen Platzhalter enthält, der im XML nicht am Stück steht, werden
 * auf einen Lauf zusammengezogen (Formatierung des ersten Laufs bleibt).
 */
export function normalizePlaceholderRuns(xml: string): string {
  return xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (pXml) => {
    const text = paragraphText(pXml)
    PLACEHOLDER_RE.lastIndex = 0
    const names = Array.from(text.matchAll(PLACEHOLDER_RE), m => m[0])
    if (names.length === 0 || names.every(n => pXml.includes(n))) return pXml
    if (/<w:drawing|<w:pict|<w:fldChar|<w:hyperlink/.test(pXml)) return pXml // nicht anfassen
    const openTag = /^<w:p(?:\s[^>]*)?>/.exec(pXml)?.[0] ?? '<w:p>'
    const pPr = /<w:pPr(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>|<w:pPr\s*\/>/.exec(pXml)?.[0] ?? ''
    const firstRun = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/.exec(pXml)?.[0] ?? ''
    const rPr = /<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/.exec(firstRun)?.[0] ?? ''
    return `${openTag}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
  })
}

/** Feldwert als Lauf-Inhalt: \n wird zum Zeilenumbruch, Text wird escaped. */
function fieldValueXml(value: string): string {
  return value
    .split(/\r?\n/)
    .map(line => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join('<w:br/>')
}

/** {{FELD}}-Platzhalter in einem Part füllen; Rest entfernen und melden. */
function applyFields(
  xml: string,
  fields: Record<string, string>,
  filled: Set<string>,
  unfilled: Set<string>
): string {
  const normalized = normalizePlaceholderRuns(xml)
  return normalized.replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, (whole, inner: string) => {
    if (!inner.includes('{{')) return whole
    const text = unescapeXml(inner)
    PLACEHOLDER_RE.lastIndex = 0
    if (!PLACEHOLDER_RE.test(text)) return whole
    const parts: string[] = []
    let last = 0
    PLACEHOLDER_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
      const name = m[1].toUpperCase()
      parts.push(`<w:t xml:space="preserve">${escapeXml(text.slice(last, m.index))}</w:t>`)
      if (Object.prototype.hasOwnProperty.call(fields, name)) {
        parts.push(fieldValueXml(fields[name]))
        filled.add(name)
      } else {
        unfilled.add(name)
      }
      last = m.index + m[0].length
    }
    if (parts.length === 0) return whole
    parts.push(`<w:t xml:space="preserve">${escapeXml(text.slice(last))}</w:t>`)
    return parts.join('')
  })
}

interface BodyPlaceholder {
  start: number
  end: number
  pPrInner: string
  rPrInner: string
}

function findBodyPlaceholder(documentXml: string): BodyPlaceholder | null {
  const marker = `{{${BODY_PLACEHOLDER}}}`
  const idx = documentXml.indexOf(marker)
  if (idx === -1) return null
  const start = Math.max(documentXml.lastIndexOf('<w:p>', idx), documentXml.lastIndexOf('<w:p ', idx))
  const endTag = documentXml.indexOf('</w:p>', idx)
  if (start === -1 || endTag === -1) return null
  const pXml = documentXml.slice(start, endTag + 6)
  const pPrInner = innerOf(pXml, 'w:pPr') ?? ''
  const runM = /<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?\{\{INHALT\}\}[\s\S]*?<\/w:r>/.exec(pXml)
  const rPrInner = runM ? (innerOf(runM[0], 'w:rPr') ?? '') : ''
  return { start, end: endTag + 6, pPrInner, rPrInner }
}

/** Formatierung des Platzhalter-Absatzes auf den erzeugten Textkörper übertragen. */
export function applyTemplateFormatting(bodyXml: string, pPrInner: string, rPrInner: string): string {
  let out = bodyXml
  if (pPrInner.trim()) {
    out = out.replace(/<w:p(\s[^>]*)?>(<w:pPr(?:\s[^>]*)?>([\s\S]*?)<\/w:pPr>)?/g, (_m, attrs: string | undefined, _pPr, inner: string | undefined) => {
      const merged = mergeProps(pPrInner, inner ?? '', PPR_ORDER, PPR_SKIP)
      return `<w:p${attrs ?? ''}>${merged ? `<w:pPr>${merged}</w:pPr>` : ''}`
    })
  }
  if (rPrInner.trim()) {
    out = out.replace(/<w:r(\s[^>]*)?>(<w:rPr(?:\s[^>]*)?>([\s\S]*?)<\/w:rPr>)?/g, (_m, attrs: string | undefined, _rPr, inner: string | undefined) => {
      const merged = mergeProps(rPrInner, inner ?? '', RPR_ORDER, RPR_SKIP)
      return `<w:r${attrs ?? ''}>${merged ? `<w:rPr>${merged}</w:rPr>` : ''}`
    })
  }
  return out
}

/** Stil-IDs des erzeugten Körpers auf die IDs der Vorlage abbilden (über den Stilnamen). */
function remapStyleIds(bodyXml: string, templateStylesXml: string | null): string {
  if (!templateStylesXml) return bodyXml
  const byName = new Map<string, string>()
  const re = /<w:style\s[^>]*w:styleId="([^"]+)"[^>]*>\s*<w:name\s+w:val="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(templateStylesXml)) !== null) byName.set(m[2], m[1])
  const generatedNames: Record<string, string> = {
    ListParagraph: 'List Paragraph',
    Heading1: 'heading 1',
    Heading2: 'heading 2',
    Heading3: 'heading 3',
    Heading4: 'heading 4',
    Heading5: 'heading 5',
    Heading6: 'heading 6'
  }
  return bodyXml.replace(/<w:pStyle w:val="([^"]+)"\/>/g, (whole, id: string) => {
    const name = generatedNames[id]
    const target = name ? byName.get(name) : undefined
    return target ? `<w:pStyle w:val="${target}"/>` : whole
  })
}

function maxAttr(xml: string, attr: string): number {
  let max = 0
  const re = new RegExp(`${attr}="(\\d+)"`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) max = Math.max(max, Number(m[1]))
  return max
}

/**
 * Nummerierungen des erzeugten Körpers in die Vorlage übernehmen: IDs versetzen,
 * damit nichts mit den Listen der Vorlage kollidiert; Referenzen im Körper anpassen.
 */
function mergeNumbering(
  bodyXml: string,
  bodyNumberingXml: string,
  templateNumberingXml: string,
  rFontsXml: string
): { bodyXml: string; numberingXml: string } {
  const offset = Math.max(maxAttr(templateNumberingXml, 'w:abstractNumId'), maxAttr(templateNumberingXml, 'w:numId')) + 1
  const abstractNums = Array.from(bodyNumberingXml.matchAll(/<w:abstractNum\s[\s\S]*?<\/w:abstractNum>/g), m => m[0])
  const nums = Array.from(bodyNumberingXml.matchAll(/<w:num\s[\s\S]*?<\/w:num>/g), m => m[0])
  // w15:*-Attribute (tentative/restartNumberingAfterBreak) weglassen — nicht jede
  // Vorlage deklariert den Namensraum, und sie tragen nichts zur Darstellung bei.
  const clean = (s: string): string => s.replace(/\s+w15:[A-Za-z]+="[^"]*"/g, '')
  const shift = (s: string): string =>
    s
      .replace(/w:abstractNumId="(\d+)"/g, (_m, id: string) => `w:abstractNumId="${Number(id) + offset}"`)
      .replace(/<w:abstractNumId w:val="(\d+)"\/>/g, (_m, id: string) => `<w:abstractNumId w:val="${Number(id) + offset}"/>`)
      .replace(/w:numId="(\d+)"/g, (_m, id: string) => `w:numId="${Number(id) + offset}"`)
  // Nummern/Aufzählungszeichen in der Schrift des Fließtextes, nicht in der Dokument-Standardschrift.
  const withFont = (s: string): string =>
    rFontsXml ? s.replace(/(<w:lvl\s(?:(?!<\/w:lvl>)[\s\S])*?)(<\/w:lvl>)/g, (m, inner: string, close: string) => (inner.includes('<w:rPr>') ? m : `${inner}<w:rPr>${rFontsXml}</w:rPr>${close}`)) : s
  const abstractXml = withFont(clean(shift(abstractNums.join(''))))
  const numXml = clean(shift(nums.join('')))
  let numberingXml = templateNumberingXml
  // Schema: erst alle w:abstractNum, dann alle w:num.
  const firstNum = numberingXml.search(/<w:num\s/)
  if (firstNum !== -1) numberingXml = numberingXml.slice(0, firstNum) + abstractXml + numberingXml.slice(firstNum)
  else numberingXml = numberingXml.replace(/<\/w:numbering>/, `${abstractXml}</w:numbering>`)
  numberingXml = numberingXml.replace(/<\/w:numbering>/, `${numXml}</w:numbering>`)
  const shiftedBody = bodyXml.replace(/<w:numId w:val="(\d+)"\/>/g, (_m, id: string) => `<w:numId w:val="${Number(id) + offset}"/>`)
  return { bodyXml: shiftedBody, numberingXml }
}

/** numbering.xml als neuen Part registrieren (Vorlagen ohne eigene Listen). */
function addNumberingPart(contentTypes: string, docRels: string): { contentTypes: string; docRels: string } {
  const ct = contentTypes.includes('PartName="/word/numbering.xml"')
    ? contentTypes
    : contentTypes.replace(
        /<\/Types>/,
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>'
      )
  if (/relationships\/numbering"/.test(docRels)) return { contentTypes: ct, docRels }
  const ids = Array.from(docRels.matchAll(/Id="rId(\d+)"/g), m => Number(m[1]))
  const next = (ids.length ? Math.max(...ids) : 0) + 1
  const rels = docRels.replace(
    /<\/Relationships>/,
    `<Relationship Id="rId${next}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`
  )
  return { contentTypes: ct, docRels: rels }
}

export async function fillDocxTemplate(
  templateBytes: Uint8Array,
  bodyDocxBytes: Uint8Array,
  fields: Record<string, string>
): Promise<DocxTemplateFillResult> {
  const template = await JSZip.loadAsync(templateBytes)
  const body = await JSZip.loadAsync(bodyDocxBytes)

  const docFile = template.file('word/document.xml')
  if (!docFile) throw new Error('Vorlage enthält kein word/document.xml — keine gültige Word-Datei')
  let documentXml = normalizePlaceholderRuns(await docFile.async('string'))
  const bodyDocFile = body.file('word/document.xml')
  if (!bodyDocFile) throw new Error('Gerenderter Textkörper ist keine gültige Word-Datei')
  const bodyDocumentXml = await bodyDocFile.async('string')

  const placeholder = findBodyPlaceholder(documentXml)
  if (!placeholder) {
    throw new Error(`Vorlage enthält keinen Platzhalter {{${BODY_PLACEHOLDER}}} im Dokumentkörper`)
  }

  // Körper-Fragment: alles in <w:body> außer den Abschnittseigenschaften.
  const bodyInner = /<w:body(?:\s[^>]*)?>([\s\S]*)<\/w:body>/.exec(bodyDocumentXml)?.[1] ?? ''
  let fragment = bodyInner.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>|<w:sectPr\s*\/>/g, '')

  const stylesFile = template.file('word/styles.xml')
  fragment = remapStyleIds(fragment, stylesFile ? await stylesFile.async('string') : null)
  fragment = applyTemplateFormatting(fragment, placeholder.pPrInner, placeholder.rPrInner)

  // Nummerierungen (Aufzählungen, nummerierte Listen) übernehmen.
  const bodyNumFile = body.file('word/numbering.xml')
  if (bodyNumFile && /<w:numPr>/.test(fragment)) {
    const bodyNumberingXml = await bodyNumFile.async('string')
    const tplNumFile = template.file('word/numbering.xml')
    const rFontsXml = childElements(placeholder.rPrInner).find(c => c.tag === 'w:rFonts')?.xml ?? ''
    if (tplNumFile) {
      const merged = mergeNumbering(fragment, bodyNumberingXml, await tplNumFile.async('string'), rFontsXml)
      fragment = merged.bodyXml
      template.file('word/numbering.xml', merged.numberingXml)
    } else {
      template.file('word/numbering.xml', bodyNumberingXml)
      const ctFile = template.file('[Content_Types].xml')
      const relsFile = template.file('word/_rels/document.xml.rels')
      if (!ctFile || !relsFile) throw new Error('Vorlage ist unvollständig ([Content_Types].xml oder document.xml.rels fehlt)')
      const added = addNumberingPart(await ctFile.async('string'), await relsFile.async('string'))
      template.file('[Content_Types].xml', added.contentTypes)
      template.file('word/_rels/document.xml.rels', added.docRels)
    }
  }

  documentXml = documentXml.slice(0, placeholder.start) + fragment + documentXml.slice(placeholder.end)

  // Textfelder in Dokument, Kopf- und Fußzeilen.
  const normalizedFields: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) normalizedFields[k.toUpperCase()] = v
  const filled = new Set<string>()
  const unfilled = new Set<string>()
  documentXml = applyFields(documentXml, normalizedFields, filled, unfilled)
  template.file('word/document.xml', documentXml)
  const parts = Object.keys(template.files).filter(n => /^word\/(header|footer)\d*\.xml$/.test(n))
  for (const name of parts) {
    const f = template.file(name)
    if (!f) continue
    template.file(name, applyFields(await f.async('string'), normalizedFields, filled, unfilled))
  }

  const bytes = await template.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })
  return { bytes, filled: Array.from(filled).sort(), unfilled: Array.from(unfilled).sort() }
}
