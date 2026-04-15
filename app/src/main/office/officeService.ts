import * as path from 'path'
import * as fs from 'fs/promises'

export interface ExcelSheet {
  name: string
  rows: string[][]
}

export interface ExcelData {
  sheets: ExcelSheet[]
}

export interface WordData {
  html: string
  markdown: string
  messages: string[]
}

export interface PowerPointSlide {
  index: number
  title: string
  text: string
  notes?: string
  images: { name: string; dataUrl: string }[]
}

export interface PowerPointData {
  slides: PowerPointSlide[]
}

export async function parseExcel(filePath: string): Promise<ExcelData> {
  const XLSX = await import('xlsx')
  const buf = await fs.readFile(filePath)
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheets: ExcelSheet[] = wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }) as unknown as string[][]
    return { name, rows: rows.map((r) => r.map((c) => (c == null ? '' : String(c)))) }
  })
  return { sheets }
}

export function sheetToMarkdownTable(sheet: ExcelSheet): string {
  if (!sheet.rows.length) return ''
  const width = Math.max(...sheet.rows.map((r) => r.length))
  const pad = (r: string[]) => {
    const row = [...r]
    while (row.length < width) row.push('')
    return row
  }
  const escape = (c: string) => c.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const header = pad(sheet.rows[0]).map(escape)
  const separator = new Array(width).fill('---')
  const body = sheet.rows.slice(1).map((r) => pad(r).map(escape))
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`)
  ]
  return lines.join('\n')
}

export async function parseDocx(filePath: string): Promise<WordData> {
  const mammoth = await import('mammoth')
  const htmlResult = await mammoth.convertToHtml({ path: filePath })
  const mdResult = await mammoth.extractRawText({ path: filePath })
  return {
    html: htmlResult.value,
    markdown: mdResult.value,
    messages: htmlResult.messages.map((m: { message: string }) => m.message)
  }
}

export async function docxToMarkdownWithImages(filePath: string, attachmentsDir: string, baseName: string): Promise<{ markdown: string }> {
  const mammoth = await import('mammoth')
  const TurndownService = (await import('turndown')).default
  await fs.mkdir(attachmentsDir, { recursive: true })

  let imgCounter = 0
  const convertImage = mammoth.images.imgElement(async (image: { contentType: string; read: (encoding: string) => Promise<string> }) => {
    imgCounter++
    const extFromType = (image.contentType || 'image/png').split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    const imgName = `${baseName}-img-${imgCounter}.${extFromType}`
    const imgPath = path.join(attachmentsDir, imgName)
    const b64 = await image.read('base64')
    await fs.writeFile(imgPath, Buffer.from(b64, 'base64'))
    return { src: `.attachments/${imgName}` }
  })

  const htmlResult = await mammoth.convertToHtml({ path: filePath }, { convertImage })
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  turndown.addRule('wikiImage', {
    filter: 'img',
    replacement: (_content: string, node: { getAttribute?: (n: string) => string | null }) => {
      const src = node.getAttribute?.('src') || ''
      const m = src.match(/\.attachments\/(.+)$/)
      if (m) return `![[${m[1]}]]`
      return src ? `![](${src})` : ''
    }
  })
  const markdown = turndown.turndown(htmlResult.value)
  return { markdown }
}

export async function markdownToDocx(markdownContent: string, outputPath: string): Promise<void> {
  const docxLib = await import('docx')
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = docxLib

  const lines = markdownContent.split(/\r?\n/)
  const paragraphs: InstanceType<typeof Paragraph>[] = []

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line) {
      paragraphs.push(new Paragraph({ children: [] }))
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6
      }
      paragraphs.push(new Paragraph({ text: h[2], heading: headingMap[level] }))
      continue
    }
    const li = line.match(/^\s*[-*+]\s+(.*)$/)
    if (li) {
      paragraphs.push(new Paragraph({ text: li[1], bullet: { level: 0 } }))
      continue
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      paragraphs.push(new Paragraph({ text: ol[1], numbering: { reference: 'default-numbering', level: 0 } }))
      continue
    }
    const runs: InstanceType<typeof TextRun>[] = []
    const inline = line.replace(/!\[\[[^\]]+\]\]/g, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, p1, p2) => p2 || p1)
    let remaining = inline
    while (remaining.length > 0) {
      const boldM = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)$/)
      const italM = remaining.match(/^(.*?)\*(.+?)\*(.*)$/)
      if (boldM && (!italM || boldM[1].length <= italM[1].length)) {
        if (boldM[1]) runs.push(new TextRun({ text: boldM[1] }))
        runs.push(new TextRun({ text: boldM[2], bold: true }))
        remaining = boldM[3]
        continue
      }
      if (italM) {
        if (italM[1]) runs.push(new TextRun({ text: italM[1] }))
        runs.push(new TextRun({ text: italM[2], italics: true }))
        remaining = italM[3]
        continue
      }
      runs.push(new TextRun({ text: remaining }))
      remaining = ''
    }
    paragraphs.push(new Paragraph({ children: runs }))
  }

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }]
  })
  const buffer = await Packer.toBuffer(doc)
  await fs.writeFile(outputPath, buffer)
}

// -- Struktur-bewusster DOCX → Markdown Parser (Callouts, Listen, Überschriften, Bilder) --

function colorToCallout(hex: string): string {
  const c = hex.toUpperCase()
  if (c === 'AUTO' || c === 'FFFFFF' || c.length !== 6) return 'note'
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  // Heuristik auf Basis dominanter Kanäle
  if (r >= 200 && g >= 180 && b < 160) return 'example' // gelb
  if (r > 160 && g < 140 && b < 140) return 'danger'    // rot
  if (r >= 220 && g >= 140 && b < 140) return 'warning' // orange
  if (g >= r && g >= b && g > 150) return 'tip'         // grün
  if (b > r && b >= g) return 'info'                    // blau
  return 'note'
}

function splitBodyBlocks(body: string): Array<{ tag: 'w:p' | 'w:tbl'; xml: string }> {
  const out: Array<{ tag: 'w:p' | 'w:tbl'; xml: string }> = []
  let i = 0
  while (i < body.length) {
    if (body[i] !== '<') { i++; continue }
    const start = body.substring(i, Math.min(i + 10, body.length))
    let tag: 'w:p' | 'w:tbl' | null = null
    if (/^<w:tbl(\s|>|\/)/.test(start)) tag = 'w:tbl'
    else if (/^<w:p(\s|>|\/)/.test(start)) tag = 'w:p'
    if (!tag) { i++; continue }
    // self-closing?
    const selfClose = body.substring(i).match(/^<(w:p|w:tbl)(\s[^>]*)?\/>/)
    if (selfClose && selfClose[1] === tag) {
      out.push({ tag, xml: selfClose[0] })
      i += selfClose[0].length
      continue
    }
    // find matching close tag with depth counting
    const openRe = new RegExp(`<${tag}(\\s|>|\\/)`, 'g')
    const closeStr = `</${tag}>`
    const headEnd = body.indexOf('>', i)
    if (headEnd < 0) break
    let depth = 1
    let j = headEnd + 1
    while (j < body.length && depth > 0) {
      const closeIdx = body.indexOf(closeStr, j)
      if (closeIdx < 0) break
      openRe.lastIndex = j
      const openMatch = openRe.exec(body)
      if (openMatch && openMatch.index < closeIdx) {
        depth++
        j = openMatch.index + tag.length + 1
      } else {
        depth--
        j = closeIdx + closeStr.length
      }
    }
    out.push({ tag, xml: body.substring(i, j) })
    i = j
  }
  return out
}

function extractRuns(xml: string, imageMap: Map<string, string>, hyperlinks: Map<string, string>): string {
  // Hyperlinks zuerst auflösen: <w:hyperlink r:id="rIdX">...</w:hyperlink> → [text](url)
  let processed = xml
  processed = processed.replace(/<w:hyperlink\s+[^>]*r:id="([^"]+)"[^>]*>([\s\S]*?)<\/w:hyperlink>/g, (_m, rId, inner) => {
    const url = hyperlinks.get(rId) || ''
    const txt = extractRuns(inner, imageMap, hyperlinks).trim()
    if (!txt) return ''
    if (!url) return txt
    return `[${txt}](${url})`
  })

  type Tok = { kind: 'text'; text: string; bold: boolean; italic: boolean } | { kind: 'image'; text: string }
  const toks: Tok[] = []

  const runRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g
  let m: RegExpExecArray | null
  while ((m = runRe.exec(processed)) !== null) {
    const r = m[1]
    const blip = r.match(/<a:blip\s+[^>]*r:embed="([^"]+)"/)
    if (blip) {
      const att = imageMap.get(blip[1])
      if (att) { toks.push({ kind: 'image', text: `![[${att}]]` }); continue }
    }
    const rPr = r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] || ''
    const bRaw = /<w:b(\s[^>]*)?\/?>/.exec(rPr)
    const iRaw = /<w:i(\s[^>]*)?\/?>/.exec(rPr)
    const isBold = !!bRaw && !/<w:b[^>]*w:val="(0|false)"/.test(rPr)
    const isItalic = !!iRaw && !/<w:i[^>]*w:val="(0|false)"/.test(rPr)

    let txt = ''
    const tRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g
    let tm: RegExpExecArray | null
    while ((tm = tRe.exec(r)) !== null) txt += decodeXmlEntities(tm[1])
    if (/<w:br\b/.test(r)) txt += '\n'
    if (/<w:tab\b/.test(r)) txt += '\t'
    if (!txt) continue
    toks.push({ kind: 'text', text: txt, bold: isBold, italic: isItalic })
  }

  // Benachbarte Text-Tokens mit gleicher Formatierung zusammenführen
  const merged: Tok[] = []
  for (const t of toks) {
    const last = merged[merged.length - 1]
    if (t.kind === 'text' && last && last.kind === 'text' && last.bold === t.bold && last.italic === t.italic) {
      last.text += t.text
    } else {
      merged.push({ ...t })
    }
  }

  // Rendern: Bold/Italic-Marker NICHT um führende/nachlaufende Whitespaces wrappen
  const out: string[] = []
  for (const t of merged) {
    if (t.kind === 'image') { out.push(t.text); continue }
    const text = t.text
    if (!text) continue
    if (!t.bold && !t.italic) { out.push(text); continue }
    const lm = text.match(/^(\s*)([\s\S]*?)(\s*)$/)
    if (!lm || !lm[2]) { out.push(text); continue }
    const [, lead, core, trail] = lm
    const marker = t.bold && t.italic ? '***' : t.bold ? '**' : '*'
    out.push(`${lead}${marker}${core}${marker}${trail}`)
  }
  return out.join('')
}

function extractRunsRaw(xml: string): string {
  let txt = ''
  for (const m of xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) txt += decodeXmlEntities(m[1])
  return txt
}

function renderParagraphMd(xml: string, imageMap: Map<string, string>, hyperlinks: Map<string, string>): string {
  const pStyle = xml.match(/<w:pStyle\s+w:val="([^"]+)"/)?.[1] || ''
  const styleLower = pStyle.toLowerCase()
  // pStyle-basierte Heading-Erkennung
  let headingLvl = 0
  if (styleLower === 'titel' || styleLower === 'title') headingLvl = 1
  else if (styleLower === 'subtitle' || styleLower === 'untertitel') headingLvl = 2
  else {
    const hm = pStyle.match(/(?:Heading|[Üü]berschrift)\s*(\d+)/i) || pStyle.match(/^heading(\d+)$/i)
    if (hm) headingLvl = Math.max(1, Math.min(6, parseInt(hm[1], 10)))
  }
  // Direkt-Formatierung: alle Runs bold + größere Schrift → Heading (für Section-Überschriften ohne Style)
  if (!headingLvl) {
    const runXmls = [...xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)].map((m) => m[1]).filter((r) => /<w:t/.test(r))
    if (runXmls.length > 0) {
      const allBold = runXmls.every((r) => {
        const rPr = r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] || ''
        return /<w:b(\s[^>]*)?\/?>/.test(rPr) && !/<w:b[^>]*w:val="(0|false)"/.test(rPr)
      })
      const maxSz = Math.max(
        0,
        ...runXmls.map((r) => {
          const sm = r.match(/<w:rPr>[\s\S]*?<w:sz\s+w:val="(\d+)"/)
          return sm ? parseInt(sm[1], 10) : 0
        })
      )
      if (allBold && maxSz >= 36) headingLvl = 1
      else if (allBold && maxSz >= 26) headingLvl = 2
    }
  }

  const numM = xml.match(/<w:numPr>[\s\S]*?<w:ilvl\s+w:val="(\d+)"/)
  const fmtText = extractRuns(xml, imageMap, hyperlinks)
  const rawText = extractRunsRaw(xml)
  if (!fmtText.trim()) return ''

  if (headingLvl) {
    return `${'#'.repeat(headingLvl)} ${rawText.trim()}`
  }
  if (numM) {
    const lvl = parseInt(numM[1], 10) || 0
    return `${'  '.repeat(lvl)}- ${fmtText.trim()}`
  }
  // Literale Bullet-Zeichen (• ● ○ ▪ ▫) → Markdown-Liste
  const bulletM = fmtText.match(/^\s*[•●○▪▫►▸·]\s+([\s\S]+)$/)
  if (bulletM) {
    const indent = parseInt(xml.match(/<w:ind[^>]*w:left="(\d+)"/)?.[1] || '0', 10)
    const lvl = Math.max(0, Math.min(4, Math.floor(indent / 360)))
    return `${'  '.repeat(lvl)}- ${bulletM[1].trim()}`
  }
  return fmtText.trim()
}

function renderTableMd(xml: string, imageMap: Map<string, string>, hyperlinks: Map<string, string>): string {
  // Zellen-Schattierung erkennen (erste nicht-"auto"-Farbe)
  let fill = ''
  const shadeRe = /<w:shd\s+[^>]*w:fill="([^"]+)"/g
  let sm: RegExpExecArray | null
  while ((sm = shadeRe.exec(xml)) !== null) {
    const v = sm[1].toLowerCase()
    if (v !== 'auto' && v !== 'ffffff' && v.length === 6) { fill = v; break }
  }

  // Inhalt aller Zellen sammeln (sequentiell)
  const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/g
  const rows: string[] = []
  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(xml)) !== null) rows.push(rm[0])

  const allCellContent = (cell: string): string[] => {
    const innerRe = /<w:tc\b[\s\S]*?<\/w:tc>/g
    const blocks: string[] = []
    let cm: RegExpExecArray | null
    while ((cm = innerRe.exec(cell)) !== null) {
      const inner = cm[0]
      for (const b of splitBodyBlocks(inner)) {
        if (b.tag === 'w:p') {
          const p = renderParagraphMd(b.xml, imageMap, hyperlinks)
          if (p) blocks.push(p)
        } else if (b.tag === 'w:tbl') {
          const t = renderTableMd(b.xml, imageMap, hyperlinks)
          if (t) blocks.push(t)
        }
      }
    }
    return blocks
  }

  if (fill) {
    // Callout: alles hintereinander
    const allBlocks: string[] = []
    for (const row of rows) allBlocks.push(...allCellContent(row))
    if (allBlocks.length === 0) {
      // Leere schattierte Box: Eingabefeld-Platzhalter
      return `> [!note] Ihre Eingabe\n> \n> `
    }
    const calloutType = colorToCallout(fill)
    // Titel-Erkennung:
    //  1) ganze erste Zeile ist fett (mit optional trailing ":") → als Titel, Rest als Body
    //  2) erste Zeile beginnt mit **Label:** / **Label** Text → Label als Titel, Text in Body
    //  3) kurze erste Zeile (≤ 60 Zeichen) ohne Markdown → als Titel
    let title = ''
    let bodyBlocks = allBlocks
    const first = (allBlocks[0] || '').trim()
    const fullBoldM = first.match(/^(?:#+\s+)?\*\*(.+?)\*\*\s*:?\s*$/)
    const labelPrefixM = first.match(/^\*\*(.+?)\*\*\s*:?\s*([\s\S]+)$/)
    if (fullBoldM && fullBoldM[1].length <= 80) {
      title = fullBoldM[1].replace(/:$/, '').trim()
      bodyBlocks = allBlocks.slice(1)
    } else if (labelPrefixM && labelPrefixM[1].length <= 60 && labelPrefixM[2].trim().length > 0) {
      title = labelPrefixM[1].replace(/:$/, '').trim()
      const rest = labelPrefixM[2].replace(/^[:\s]+/, '').trim()
      bodyBlocks = [rest, ...allBlocks.slice(1)]
    } else if (first.length <= 60 && !/\n/.test(first)) {
      title = first.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/:$/, '').trim()
      bodyBlocks = allBlocks.slice(1)
    }
    const header = `> [!${calloutType}]${title ? ' ' + title : ''}`
    const bodyText = bodyBlocks.join('\n\n')
    const quoted = bodyText.split('\n').map((l) => (l === '' ? '>' : '> ' + l)).join('\n')
    return bodyText ? `${header}\n${quoted}` : header
  }

  // Normale GFM-Tabelle
  const parsed: string[][] = []
  for (const row of rows) {
    const cells: string[] = []
    const tcRe = /<w:tc\b[\s\S]*?<\/w:tc>/g
    let cm: RegExpExecArray | null
    while ((cm = tcRe.exec(row)) !== null) {
      const inner = cm[0]
      const paras: string[] = []
      for (const b of splitBodyBlocks(inner)) {
        if (b.tag === 'w:p') {
          const p = extractRuns(b.xml, imageMap, hyperlinks)
          if (p.trim()) paras.push(p.trim())
        }
      }
      cells.push(paras.join(' ').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim())
    }
    parsed.push(cells)
  }
  if (!parsed.length) return ''
  const width = Math.max(...parsed.map((r) => r.length))
  const pad = (r: string[]) => { while (r.length < width) r.push(''); return r }
  const out = [
    `| ${pad(parsed[0]).join(' | ')} |`,
    `| ${new Array(width).fill('---').join(' | ')} |`,
    ...parsed.slice(1).map((r) => `| ${pad(r).join(' | ')} |`)
  ]
  return out.join('\n')
}

// Emoji → Callout-Typ für Auto-Wrapping
const EMOJI_CALLOUT: Record<string, string> = {
  '💡': 'example',
  '📋': 'info',
  '📝': 'note',
  '⚡': 'tip',
  '✅': 'success',
  '⚠️': 'warning',
  'ℹ️': 'info',
  '✍️': 'note',
  '🎯': 'note',
  '📌': 'note',
  '❓': 'question',
  '🔥': 'tip',
  '📘': 'info',
  '📙': 'warning',
  '📗': 'tip',
  '📕': 'danger'
}

function postProcessCallouts(md: string): string {
  const emojis = Object.keys(EMOJI_CALLOUT)
  const emojiGroup = emojis.map((e) => e.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')

  let out = md

  // Bewusst zurückhaltend: wir generieren KEINE automatischen Callouts für
  // 💡 Beispiele-Labels oder ⚡ Tipp-Zeilen — die bleiben als normaler Markdown
  // (fette/kursive Zeilen + Bullet-Listen). Nur echte schattierte Word-Boxen
  // (über `docxToStructuredMarkdown`) und die Eingabe-Felder werden zu Callouts.

  void emojiGroup // Variable behalten falls wir später erweitern wollen

  // Eingabe-Platzhalter: **Label (Eingabe/Antwort/…):** + leere 1×1-Tabelle →
  // aufgeklappter Note-Callout mit mehreren sichtbaren Leerzeilen zum Eintippen.
  // Obsidian kollabiert leere `> `-Zeilen visuell, daher `&nbsp;` verwenden.
  const inputBoxRe = /(^|\n)[ \t]*\*\*([^*\n]*(?:Eingabe|Antwort|Notiz|Lösung|Ergebnis)[^*\n]*)\*\*[ \t]*\n+\|\s*\|\s*\n\|\s*---\s*\|\s*(?=\n|$)/g
  out = out.replace(inputBoxRe, (_m, pre: string, label: string) => {
    const cleanLabel = label.trim().replace(/:$/, '')
    const emptyLines = Array(8).fill('> &nbsp;').join('\n')
    return `${pre}> [!note]+ ${cleanLabel}\n${emptyLines}\n`
  })

  // Übrig gebliebene leere 1×1-Tabellen → entfernen
  out = out.replace(/\n\|\s*\|\s*\n\|\s*---\s*\|\s*(?=\n|$)/g, '\n')

  // Mehrfache Leerzeilen normalisieren
  out = out.replace(/\n{3,}/g, '\n\n')

  return out
}

export async function docxToStructuredMarkdown(filePath: string, attachmentsDir: string, baseName: string): Promise<{ markdown: string; hasCallouts: boolean }> {
  const AdmZip = (await import('adm-zip')).default
  const zip = new AdmZip(filePath)
  const docEntry = zip.getEntry('word/document.xml')
  if (!docEntry) throw new Error('document.xml not found')
  const xml = docEntry.getData().toString('utf8')

  const relsEntry = zip.getEntry('word/_rels/document.xml.rels')
  const relsXml = relsEntry ? relsEntry.getData().toString('utf8') : ''
  const rels = new Map<string, { target: string; type: string }>()
  const relRe = /<Relationship\s+[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"/g
  let relM: RegExpExecArray | null
  while ((relM = relRe.exec(relsXml)) !== null) {
    rels.set(relM[1], { type: relM[2], target: relM[3] })
  }

  // Bilder extrahieren
  await fs.mkdir(attachmentsDir, { recursive: true })
  const imageMap = new Map<string, string>()
  for (const [rId, rel] of rels) {
    if (!rel.target.includes('media/')) continue
    const candidates = [`word/${rel.target}`, rel.target.replace(/^\.\//, '')]
    let entry = null
    for (const c of candidates) { entry = zip.getEntry(c); if (entry) break }
    if (!entry) continue
    const attachName = `${baseName}-${path.basename(rel.target)}`
    await fs.writeFile(path.join(attachmentsDir, attachName), entry.getData())
    imageMap.set(rId, attachName)
  }

  // Hyperlinks
  const hyperlinks = new Map<string, string>()
  for (const [rId, rel] of rels) {
    if (rel.type.includes('hyperlink')) hyperlinks.set(rId, rel.target)
  }

  const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/)
  if (!bodyMatch) return { markdown: '', hasCallouts: false }
  const body = bodyMatch[1]

  const blocks = splitBodyBlocks(body)
  const lines: string[] = []
  let hasCallouts = false
  for (const b of blocks) {
    if (b.tag === 'w:p') {
      const md = renderParagraphMd(b.xml, imageMap, hyperlinks)
      if (md) lines.push(md)
    } else if (b.tag === 'w:tbl') {
      const md = renderTableMd(b.xml, imageMap, hyperlinks)
      if (md) {
        if (md.startsWith('> [!')) hasCallouts = true
        lines.push(md)
      }
    }
  }
  const rawMd = lines.join('\n\n').replace(/\n{3,}/g, '\n\n')
  const postMd = postProcessCallouts(rawMd)
  return { markdown: postMd, hasCallouts: hasCallouts || /^> \[!/m.test(postMd) }
}

// -- PowerPoint (.pptx) parsing via adm-zip + manual XML parsing --

function xmlExtractText(xml: string): string {
  // Nur Inhalte aus <a:t>...</a:t> pro Paragraph, getrennt mit Zeilenumbrüchen
  const paragraphs = xml.split(/<a:p[\s>]/)
  const out: string[] = []
  for (const p of paragraphs) {
    const runs = Array.from(p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g))
    if (!runs.length) continue
    const line = runs.map((r) => decodeXmlEntities(r[1])).join('')
    if (line.trim()) out.push(line)
  }
  return out.join('\n')
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export async function parsePptx(filePath: string): Promise<PowerPointData> {
  const AdmZip = (await import('adm-zip')).default
  const zip = new AdmZip(filePath)
  const entries = zip.getEntries()

  // Slides sortiert nach Slide-Nummer
  const slideEntries = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => {
      const na = parseInt(a.entryName.match(/slide(\d+)\.xml/)?.[1] || '0', 10)
      const nb = parseInt(b.entryName.match(/slide(\d+)\.xml/)?.[1] || '0', 10)
      return na - nb
    })

  const noteEntries = new Map<number, string>()
  for (const e of entries) {
    const m = e.entryName.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/)
    if (m) noteEntries.set(parseInt(m[1], 10), e.getData().toString('utf8'))
  }

  // Media-Bilder (für Slides-Import: alle zu Base64, Zuordnung vereinfacht: alle Bilder zu Slide 1 wenn keine Relation)
  const mediaEntries = entries.filter((e) => /^ppt\/media\//.test(e.entryName))
  const mediaMap = new Map<string, Buffer>()
  for (const m of mediaEntries) mediaMap.set(path.basename(m.entryName), m.getData())

  // Slide → Relationships → Bilder
  const slides: PowerPointSlide[] = []
  for (let i = 0; i < slideEntries.length; i++) {
    const slideEntry = slideEntries[i]
    const slideNum = i + 1
    const xml = slideEntry.getData().toString('utf8')

    // Parse relationships
    const relsEntry = entries.find((e) => e.entryName === `ppt/slides/_rels/slide${slideNum}.xml.rels`)
    const slideImages: { name: string; dataUrl: string }[] = []
    if (relsEntry) {
      const relsXml = relsEntry.getData().toString('utf8')
      const relMatches = relsXml.matchAll(/Target="\.\.\/media\/([^"]+)"/g)
      for (const rm of relMatches) {
        const mediaName = rm[1]
        const buf = mediaMap.get(mediaName)
        if (!buf) continue
        const ext = path.extname(mediaName).toLowerCase().slice(1) || 'png'
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`
        slideImages.push({ name: mediaName, dataUrl: `data:${mime};base64,${buf.toString('base64')}` })
      }
    }

    const text = xmlExtractText(xml)
    const lines = text.split('\n').filter((l) => l.trim())
    const title = lines[0] || `Slide ${slideNum}`
    const rest = lines.slice(1).join('\n')

    const notesXml = noteEntries.get(slideNum)
    const notes = notesXml ? xmlExtractText(notesXml) : undefined

    slides.push({
      index: slideNum,
      title,
      text: rest,
      notes,
      images: slideImages
    })
  }

  return { slides }
}

export async function importPptxAsMarkdown(filePath: string, attachmentsDir: string, baseName: string): Promise<{ markdown: string }> {
  const data = await parsePptx(filePath)
  await fs.mkdir(attachmentsDir, { recursive: true })

  const lines: string[] = [`# ${baseName}`, '']
  for (const slide of data.slides) {
    lines.push(`## Slide ${slide.index}: ${slide.title}`)
    lines.push('')
    if (slide.text) {
      lines.push(slide.text)
      lines.push('')
    }
    for (const img of slide.images) {
      const imgName = `${baseName}-slide${slide.index}-${img.name}`
      const imgPath = path.join(attachmentsDir, imgName)
      const b64 = img.dataUrl.split(',')[1] || ''
      await fs.writeFile(imgPath, Buffer.from(b64, 'base64'))
      lines.push(`![[${imgName}]]`)
      lines.push('')
    }
    if (slide.notes) {
      lines.push(`> [!note] Notizen`)
      for (const nl of slide.notes.split('\n')) lines.push(`> ${nl}`)
      lines.push('')
    }
  }
  return { markdown: lines.join('\n') }
}
