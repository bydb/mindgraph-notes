// Hausdesign-Präsentation: die mitgelieferte „MindGraph Hausstil"-Vorlage umfärben, Logo und
// Wortmarke tauschen (docs/codex-collab/skill-builder-hausdesign.md, F01/F04/F05/F06).
// Umgefärbt wird NACH ROLLE, nicht per globaler Hex-Tabelle: derselbe Petrol-Wert ist in der
// Vorlage einmal Fläche (Titelbalken, Ziffernfelder) und einmal Schrift (Dachzeilen, Karten).

import JSZip from 'jszip'
import { cleanText } from './pptxTemplate'
import { deriveBrandTokens, type BrandColors } from './brand'

export interface BrandDeckInput {
  /** Bytes der Hausstil-Vorlage. */
  template: Uint8Array
  name: string
  logoHasName: boolean
  colors: BrandColors
  /** PNG-Bytes (vom Main neu kodiert). */
  logoPng: Uint8Array
  logoWidth: number
  logoHeight: number
}

const EMU = 914400

// Alte Werte der Hausstil-Vorlage (app/scripts/build-hausstil-vorlage.py).
const OLD = {
  PETROL: '1F6F6A',
  NAVY: '222B3A',
  PETROL_PALE: 'E3F0EE',
  TEAL_LIGHT: '9FD3CB'
}

const TEXT_CTX = ['<a:defRPr', '<a:rPr', '<a:endParaRPr', '<a:buClr']
const FILL_CTX = ['<p:spPr', '<p:bgPr', '<a:ln', '<p:bg>']

function ctxOf(xml: string, at: number): 'text' | 'fill' | null {
  let best = -1
  let kind: 'text' | 'fill' | null = null
  for (const t of TEXT_CTX) { const i = xml.lastIndexOf(t, at); if (i > best) { best = i; kind = 'text' } }
  for (const t of FILL_CTX) { const i = xml.lastIndexOf(t, at); if (i > best) { best = i; kind = 'fill' } }
  return kind
}

const hx = (h: string) => h.replace('#', '').toUpperCase()

/** Rollenbasiertes Umfärben eines Master-/Layout-XML. Exportiert für Tests. */
export function recolorPartXml(xml: string, colors: BrandColors): string {
  const t = deriveBrandTokens(colors)
  return xml.replace(/srgbClr val="([0-9A-Fa-f]{6})"/g, (m, val: string, offset: number) => {
    const v = val.toUpperCase()
    const role = ctxOf(xml, offset)
    let next: string | null = null
    if (role === 'text') {
      if (v === OLD.PETROL) next = t.text
      else if (v === OLD.TEAL_LIGHT) next = t.onDark
    } else if (role === 'fill') {
      if (v === OLD.PETROL) next = t.fill
      else if (v === OLD.NAVY) next = t.dark
      else if (v === OLD.PETROL_PALE) next = t.tint
      else if (v === OLD.TEAL_LIGHT) next = t.tintMid
    }
    return next ? `srgbClr val="${hx(next)}"` : m
  })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Theme: Farbschema nach Rolle; accent1 = Flächenakzent (Hervorhebung, Rahmen), hlink = Textakzent. */
export function recolorThemeXml(xml: string, colors: BrandColors, name: string): string {
  const t = deriveBrandTokens(colors)
  const set = (slot: string, hex: string) => {
    xml = xml.replace(new RegExp(`<a:${slot}><a:srgbClr val="[0-9A-Fa-f]{6}"/></a:${slot}>`), `<a:${slot}><a:srgbClr val="${hx(hex)}"/></a:${slot}>`)
  }
  set('dk2', t.dark)
  set('accent1', t.fill)
  set('accent6', t.tintMid)
  set('hlink', t.text)
  if (colors.secondary) set('accent2', t.line2)
  const safe = escapeXml(cleanText(name)).slice(0, 120)
  xml = xml.replace(/(<a:theme\b[^>]*\sname=")[^"]*(")/, `$1${safe}$2`)
  xml = xml.replace(/(<a:clrScheme\s+name=")[^"]*(")/, `$1${safe}$2`)
  xml = xml.replace(/(<a:fontScheme\s+name=")[^"]*(")/, `$1${safe}$2`)
  return xml
}

/** Logo-Zone der Titelfolie: Logo „contain" (F06), Wortmarke daneben oder entfernt. */
export function placeLogoAndWordmark(xml: string, opts: { name: string; logoHasName: boolean; logoWidth: number; logoHeight: number }): string {
  const aspect = opts.logoWidth / opts.logoHeight
  // Zone zwischen Folienrand und Titel (Titel beginnt bei y = 1,75"). Steht der Name im Logo,
  // trägt das Logo allein die Absenderschaft und darf die Zone füllen (GUI-Gegenprobe 08.11.2026:
  // mit 0,85" Höhe war ein Wortbild-Logo kaum lesbar).
  const x = 0.75
  const top = opts.logoHasName ? 0.4 : 0.45
  const maxH = opts.logoHasName ? 1.15 : 0.85
  const maxW = opts.logoHasName ? 4.6 : 2.6
  let h = maxH
  let w = h * aspect
  if (w > maxW) { w = maxW; h = w / aspect }
  const y = top + (maxH - h) / 2
  const emu = (v: number) => Math.round(v * EMU)
  // Logo-Bild (p:pic name="Logo"): neue Geometrie.
  xml = xml.replace(
    /(<p:pic>(?:(?!<\/p:pic>)[\s\S])*?name="Logo"(?:(?!<\/p:pic>)[\s\S])*?<a:xfrm>)<a:off x="\d+" y="\d+"\/><a:ext cx="\d+" cy="\d+"\/>/,
    `$1<a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/>`
  )
  const wordRe = /<p:sp><p:nvSpPr><p:cNvPr id="\d+" name="Wortmarke"\/>[\s\S]*?<\/p:sp>/
  if (opts.logoHasName) {
    xml = xml.replace(wordRe, '')
  } else {
    const wx = x + w + 0.22
    const ww = 13.333 - 0.75 - wx
    xml = xml.replace(wordRe, sp => sp
      .replace(/<a:off x="\d+" y="\d+"\/><a:ext cx="\d+" cy="\d+"\/>/, `<a:off x="${emu(wx)}" y="${emu(top)}"/><a:ext cx="${emu(ww)}" cy="${emu(maxH)}"/>`)
      .replace('wrap="none"', 'wrap="square"')
      .replace(/<a:t>[^<]*<\/a:t>/, `<a:t>${escapeXml(cleanText(opts.name))}</a:t>`))
  }
  return xml
}

/** Fußzeilen-Text „MindGraph Notes · …" → „<Name> · …" (lange Namen gekürzt). */
export function replaceFooterBrand(xml: string, name: string): string {
  const n = cleanText(name)
  const short = n.length > 48 ? n.slice(0, 47).trimEnd() + '…' : n
  return xml.replace(/<a:t>MindGraph Notes( · [^<]*)?<\/a:t>/g, (_m, rest: string | undefined) => `<a:t>${escapeXml(short)}${rest ?? ''}</a:t>`)
}

export async function buildBrandDeck(input: BrandDeckInput): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(input.template)
  const parts = Object.keys(zip.files).filter(p =>
    /^ppt\/(slideLayouts\/slideLayout\d+|slideMasters\/slideMaster\d+)\.xml$/.test(p))
  for (const p of parts) {
    let xml = await zip.file(p)!.async('string')
    xml = recolorPartXml(xml, input.colors)
    xml = replaceFooterBrand(xml, input.name)
    if (/name="Logo"/.test(xml)) {
      xml = placeLogoAndWordmark(xml, { name: input.name, logoHasName: input.logoHasName, logoWidth: input.logoWidth, logoHeight: input.logoHeight })
    }
    zip.file(p, xml)
  }
  // Logo: neue Datei, Beziehung umhängen, alte entfernen.
  const oldLogo = 'ppt/media/mg-logo.png'
  const newLogo = 'ppt/media/brand-logo.png'
  zip.file(newLogo, input.logoPng)
  for (const relPath of Object.keys(zip.files).filter(p => p.endsWith('.rels'))) {
    const rel = await zip.file(relPath)!.async('string')
    if (rel.includes('media/mg-logo.png')) zip.file(relPath, rel.split('media/mg-logo.png').join('media/brand-logo.png'))
  }
  if (zip.file(oldLogo)) zip.remove(oldLogo)
  const ct = await zip.file('[Content_Types].xml')!.async('string')
  if (/PartName="\/ppt\/media\/mg-logo\.png"/.test(ct)) {
    zip.file('[Content_Types].xml', ct.replace(/PartName="\/ppt\/media\/mg-logo\.png"/, 'PartName="/ppt/media/brand-logo.png"'))
  }
  // Theme.
  for (const p of Object.keys(zip.files).filter(f => /^ppt\/theme\/theme\d+\.xml$/.test(f))) {
    const xml = await zip.file(p)!.async('string')
    if (xml.includes('<a:clrScheme')) zip.file(p, recolorThemeXml(xml, input.colors, input.name))
  }
  // Dokumenteigenschaften: nur bestehende Elemente füllen (nie ein zweites dc:title).
  const core = zip.file('docProps/core.xml')
  if (core) {
    const safe = escapeXml(cleanText(input.name)).slice(0, 120)
    let xml = await core.async('string')
    xml = xml.replace(/<dc:title>[^<]*<\/dc:title>/, `<dc:title>${safe} – Vorlage</dc:title>`)
      .replace(/<dc:creator>[^<]*<\/dc:creator>/, `<dc:creator>${safe}</dc:creator>`)
      .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, `<cp:lastModifiedBy>${safe}</cp:lastModifiedBy>`)
      .replace(/<dc:description>[^<]*<\/dc:description>/, '<dc:description></dc:description>')
    zip.file('docProps/core.xml', xml)
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
