// Hausdesign-Briefkopf (Word): Logo, Name, Absenderzeile, Kontakt-Fußzeile und die Platzhalter,
// die fillDocxTemplate füllt ({{INHALT}} als eigener Absatz). Rein (docx-Bibliothek, keine fs).
// Hausfarbe nur für Name und eine feine Linie — Fließtext bleibt schwarz.

import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, Paragraph, Table, TableCell,
  TableRow, TextRun, WidthType
} from 'docx'
import { cleanText } from './pptxTemplate'
import { deriveBrandTokens, type BrandColors, type BrandContact } from './brand'

export interface BrandLetterInput {
  name: string
  subline?: string
  logoHasName: boolean
  contact: BrandContact
  colors: BrandColors
  logoPng: Uint8Array
  logoWidth: number
  logoHeight: number
}

const FONT = 'Arial'
const GREY = '5B636D'
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }

const hx = (h: string) => h.replace('#', '').toUpperCase()

export async function buildBrandLetter(input: BrandLetterInput): Promise<Uint8Array> {
  const t = deriveBrandTokens(input.colors)
  const name = cleanText(input.name)
  const subline = input.subline ? cleanText(input.subline) : ''
  // Logo „contain" in 60 × 160 pt (Höhe begrenzt; breite Logos bleiben unverzerrt).
  const maxH = input.logoHasName ? 70 : 56
  const maxW = 190
  let h = maxH
  let w = (h * input.logoWidth) / input.logoHeight
  if (w > maxW) { w = maxW; h = (w * input.logoHeight) / input.logoWidth }
  // docx erwartet Pixel bei 96 dpi.
  const px = (pt: number) => Math.round((pt * 96) / 72)
  const logo = new ImageRun({ type: 'png', data: input.logoPng, transformation: { width: px(w), height: px(h) } })

  const nameCell = new TableCell({
    borders: NO_BORDERS,
    width: { size: 60, type: WidthType.PERCENTAGE },
    children: input.logoHasName
      ? [new Paragraph({ children: [] })]
      : [
          new Paragraph({ children: [new TextRun({ text: name, bold: true, size: 26, font: FONT, color: hx(t.text) })] }),
          ...(subline ? [new Paragraph({ children: [new TextRun({ text: subline, size: 18, font: FONT, color: GREY })] })] : [])
        ]
  })
  const logoCell = new TableCell({
    borders: NO_BORDERS,
    width: { size: 40, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [logo] })]
  })
  const header = new Header({
    children: [
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: [new TableRow({ children: [nameCell, logoCell] })] }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: hx(t.fill), space: 4 } },
        children: []
      })
    ]
  })

  const c = input.contact
  const addressOneLine = (c.address ?? '').split('\n').map(cleanText).filter(Boolean).join(', ')
  const senderLine = [name, addressOneLine].filter(Boolean).join(' · ')
  const contactBits = [c.phone ? `Tel. ${cleanText(c.phone)}` : '', c.email ? cleanText(c.email) : '', c.web ? cleanText(c.web) : ''].filter(Boolean)
  const footer = new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: hx(t.fill), space: 4 } },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: [name, addressOneLine].filter(Boolean).join(' · '), size: 15, font: FONT, color: GREY })]
      }),
      ...(contactBits.length
        ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: contactBits.join(' · '), size: 15, font: FONT, color: GREY })] })]
        : [])
    ]
  })

  const body = (text: string, opts: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; underline?: boolean } = {}) =>
    new Paragraph({
      alignment: opts.align,
      spacing: { after: opts.after ?? 0 },
      children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 22, font: FONT, color: opts.color, underline: opts.underline ? {} : undefined })]
    })

  const doc = new Document({
    creator: name,
    title: `${name} – Briefkopf`,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 2600, bottom: 1700, left: 1418, right: 1134, header: 600, footer: 500 }
        }
      },
      headers: { default: header },
      footers: { default: footer },
      children: [
        body(senderLine, { size: 14, color: GREY, after: 80, underline: true }),
        body('{{EMPFAENGER}}', { after: 600 }),
        body('{{DATUM}}', { align: AlignmentType.RIGHT, after: 360 }),
        body('{{BETREFF}}', { bold: true, after: 360 }),
        body('{{INHALT}}', { after: 120 })
      ]
    }]
  })
  const buf = await Packer.toBuffer(doc)
  return new Uint8Array(buf)
}
