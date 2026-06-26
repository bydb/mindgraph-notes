// Extrahiert den Text eines PDFs und bricht ihn zu fließenden Absätzen um ("Reflow"),
// damit er anschließend frisch als reMarkable-Buch mit großer Schrift gerendert werden
// kann (wie der Markdown-Export). Das ist der einzige Weg, A4-Text auf dem schmaleren
// reMarkable-Schirm WIRKLICH zu vergrößern – reines Umlayouten des PDFs kann das nicht.
//
// Annahme: EINSPALTIGE Dokumente. Abbildungen, Formeln und exaktes Layout gehen verloren
// (es bleibt der reine Text). Für textlastige Paper/Notizen ideal.

interface Line {
  text: string
  x: number
  y: number
  h: number
  page: number
}

export interface ReflowResult {
  bodyHtml: string
  title: string
  pageCount: number
  charCount: number
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function extractReflowedHtml(pdfBytes: Uint8Array): Promise<ReflowResult> {
  // Legacy-ESM-Build von pdfjs läuft im Electron-Main (Node 20+), reine Textextraktion
  // braucht kein Canvas.
  const pdfjs: typeof import('pdfjs-dist') = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: pdfBytes, isEvalSupported: false }).promise

  const numPages = doc.numPages
  const lines: Line[] = []

  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()

    let cur = ''
    let curX: number | null = null
    let curY: number | null = null
    let curH = 0

    const flush = () => {
      // Führende Klapp-/Falt-Marker entfernen (MindGraph-Export bäckt ▼ ▶ ▸ etc. in den
      // PDF-Text ein). Bullets (• ‣ –) bleiben unangetastet.
      const t = cur
        .replace(/\s+/g, ' ')
        .replace(/^[\s▼▶▸►▾▿◀◁▷▽△▲]+/, '')
        .trim()
      if (t) lines.push({ text: t, x: curX ?? 0, y: curY ?? 0, h: curH, page: p })
      cur = ''
      curX = null
      curY = null
      curH = 0
    }

    for (const it of tc.items) {
      if (!('str' in it)) continue // TextMarkedContent überspringen
      const tr = it.transform as number[]
      const x = tr[4]
      const y = tr[5]
      const h = Math.hypot(tr[2], tr[3]) || it.height || 0
      if (curX === null) {
        curX = x
        curY = y
      }
      if (h > curH) curH = h
      cur += it.str
      if (it.hasEOL) flush()
    }
    flush()
  }

  if (typeof doc.destroy === 'function') doc.destroy()

  return buildHtmlFromLines(lines, numPages)
}

function buildHtmlFromLines(lines: Line[], pageCount: number): ReflowResult {
  // Kopf-/Fußzeilen (Journalname, Seitenzahlen) entfernen: kurze Zeilen, die auf vielen
  // Seiten identisch auftauchen.
  const counts = new Map<string, Set<number>>()
  for (const l of lines) {
    if (l.text.length <= 80) {
      if (!counts.has(l.text)) counts.set(l.text, new Set())
      counts.get(l.text)!.add(l.page)
    }
  }
  const repeated = new Set<string>()
  const threshold = Math.max(3, Math.ceil(pageCount * 0.4))
  for (const [text, pages] of counts) {
    if (pages.size >= threshold) repeated.add(text)
  }
  const isPageNumber = (t: string) => /^[ivxlcdm]+$|^\d{1,4}$|^[-–—\s]*\d{1,4}[-–—\s]*$/i.test(t.trim())

  // MindGraph-/Übersetzungs-Export-Artefakte (Kopfzeilen aus dem Notiz-Wrapper).
  const metaArtifact = [
    /^Notizen$/i,
    /^Übersetzung\s*\(.+\)$/i,
    /^Übersetzt am\b/i,
    /^Extrahiert am\b/i,
    /^Vision[- ]?OCR\b/i
  ]
  const isMetaArtifact = (t: string) => metaArtifact.some((re) => re.test(t.trim()))

  const kept = lines.filter(
    (l) => !repeated.has(l.text) && !isPageNumber(l.text) && !isMetaArtifact(l.text)
  )
  if (kept.length === 0) {
    return { bodyHtml: '<p>(Kein extrahierbarer Text gefunden.)</p>', title: '', pageCount, charCount: 0 }
  }

  // Body-Schrifthöhe = Median aller Zeilenhöhen.
  const heights = kept.map((l) => l.h).filter((h) => h > 0).sort((a, b) => a - b)
  const bodyH = heights.length ? heights[Math.floor(heights.length / 2)] : 12

  const blocks: { tag: 'h1' | 'h2' | 'h3' | 'p' | 'li'; text: string }[] = []
  let para = ''
  let paraTag: 'p' | 'li' = 'p'
  let prevY: number | null = null
  let prevPage = -1
  let charCount = 0

  const flushPara = () => {
    const t = para.replace(/\s+/g, ' ').trim()
    if (t) {
      blocks.push({ tag: paraTag, text: t })
      charCount += t.length
    }
    para = ''
    paraTag = 'p'
  }

  const bulletRe = /^[•·▪◦‣\-–*]\s+/

  for (const line of kept) {
    const isHeading = line.h > bodyH * 1.32 && line.text.length < 130
    const samePage = line.page === prevPage
    const gap = prevY !== null && samePage ? prevY - line.y : Infinity
    const paragraphBreak = !samePage || gap > bodyH * 1.7
    const isBullet = bulletRe.test(line.text)

    if (isHeading) {
      flushPara()
      const level: 'h1' | 'h2' | 'h3' =
        line.h > bodyH * 2 ? 'h1' : line.h > bodyH * 1.6 ? 'h2' : 'h3'
      blocks.push({ tag: level, text: line.text })
      charCount += line.text.length
      prevY = null
      prevPage = line.page
      continue
    }

    if (paragraphBreak || isBullet) {
      flushPara()
      paraTag = isBullet ? 'li' : 'p'
    }

    let piece = isBullet ? line.text.replace(bulletRe, '') : line.text
    if (para) {
      // Weiche Trennung am Zeilenende zusammenziehen (deutsche Silbentrennung).
      if (/[A-Za-zÀ-ÿ]-$/.test(para)) {
        para = para.slice(0, -1) + piece
      } else {
        para += ' ' + piece
      }
    } else {
      para = piece
    }

    prevY = line.y
    prevPage = line.page
  }
  flushPara()

  // Aufeinanderfolgende <li> in <ul> bündeln.
  let html = ''
  let inList = false
  for (const b of blocks) {
    if (b.tag === 'li') {
      if (!inList) {
        html += '<ul>'
        inList = true
      }
      html += `<li>${escapeHtml(b.text)}</li>`
    } else {
      if (inList) {
        html += '</ul>'
        inList = false
      }
      html += `<${b.tag}>${escapeHtml(b.text)}</${b.tag}>`
    }
  }
  if (inList) html += '</ul>'

  const firstHeading = blocks.find((b) => b.tag === 'h1' || b.tag === 'h2')
  return { bodyHtml: html, title: firstHeading?.text ?? '', pageCount, charCount }
}
