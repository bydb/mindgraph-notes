// Logo-Eingang prüfen, BEVOR irgendein Decoder die Datei sieht (Codex F09).
// Rein: Bytes rein, Urteil raus. Typ nach Signatur, nie nach Endung.

export const LOGO_MAX_BYTES = 5 * 1024 * 1024
export const LOGO_MAX_PIXELS = 40_000_000
export const LOGO_MAX_SIDE = 12_000

export type LogoCheck =
  | { ok: true; kind: 'png' | 'jpeg'; width: number; height: number }
  | { ok: true; kind: 'svg'; width: number; height: number; text: string }
  | { ok: false; reason: string }

function pngSize(b: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length < 24 || !sig.every((v, i) => b[i] === v)) return null
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return { width: dv.getUint32(16), height: dv.getUint32(20) }
}

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
    const len = (b[i + 2] << 8) | b[i + 3]
    if (len < 2) return null
    // SOF0..SOF15 außer DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] }
    }
    i += 2 + len
  }
  return null
}

/** Verbotene SVG-Bestandteile: alles, was nachlädt, ausführt oder Entitäten aufbläht. */
const SVG_FORBIDDEN: Array<[RegExp, string]> = [
  [/<!DOCTYPE/i, 'DOCTYPE'],
  [/<!ENTITY/i, 'Entitäten'],
  [/<\s*script\b/i, 'Skript'],
  [/<\s*foreignObject\b/i, 'foreignObject'],
  [/<\s*(iframe|object|embed|audio|video|animate\w*|set)\b/i, 'eingebettete Inhalte oder Animation'],
  [/\bon[a-z]+\s*=/i, 'Ereignis-Attribut'],
  [/@import/i, '@import'],
  [/javascript:/i, 'javascript:']
]

function svgSize(text: string): { width: number; height: number } | null {
  const root = /<svg\b[^>]*>/i.exec(text)
  if (!root) return null
  const tag = root[0]
  const vb = /\bviewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)\s*["']/.exec(tag)
  if (vb) {
    const w = Number(vb[3]), h = Number(vb[4])
    if (w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h)) return { width: w, height: h }
  }
  const w = /\bwidth\s*=\s*["']\s*([\d.]+)(px)?\s*["']/.exec(tag)
  const h = /\bheight\s*=\s*["']\s*([\d.]+)(px)?\s*["']/.exec(tag)
  if (w && h && Number(w[1]) > 0 && Number(h[1]) > 0) return { width: Number(w[1]), height: Number(h[1]) }
  return null
}

export function checkLogoBytes(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) return { ok: false, reason: 'Datei ist leer' }
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, reason: 'Datei ist größer als 5 MB' }
  const png = pngSize(bytes)
  const jpg = png ? null : jpegSize(bytes)
  const raster = png ?? jpg
  if (raster) {
    const { width, height } = raster
    if (width < 1 || height < 1) return { ok: false, reason: 'Bildmaße fehlen' }
    if (width > LOGO_MAX_SIDE || height > LOGO_MAX_SIDE || width * height > LOGO_MAX_PIXELS) {
      return { ok: false, reason: `Bild ist zu groß (${width} × ${height} Pixel)` }
    }
    return { ok: true, kind: png ? 'png' : 'jpeg', width, height }
  }
  // SVG: Text, UTF-8, beginnt (nach BOM, XML-Deklaration, Kommentaren) mit <svg.
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, reason: 'Unbekanntes Dateiformat (nur PNG, JPEG oder SVG)' }
  }
  const head = text.replace(/^﻿/, '').replace(/^\s*<\?xml[^>]*\?>/, '').replace(/^(\s*<!--[\s\S]*?-->)*/, '').trimStart()
  if (!/^<svg\b/i.test(head)) return { ok: false, reason: 'Unbekanntes Dateiformat (nur PNG, JPEG oder SVG)' }
  for (const [re, label] of SVG_FORBIDDEN) {
    if (re.test(text)) return { ok: false, reason: `SVG enthält nicht erlaubte Bestandteile (${label})` }
  }
  // Verweise: nur interne Anker (#id) und eingebettete PNG/JPEG-Daten.
  for (const m of text.matchAll(/\b(?:xlink:)?href\s*=\s*["']\s*([^"']*)["']/gi)) {
    const v = m[1].trim()
    if (v.startsWith('#')) continue
    if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\s]+$/i.test(v)) continue
    return { ok: false, reason: 'SVG verweist auf externe Dateien oder Adressen' }
  }
  for (const m of text.matchAll(/url\(\s*["']?([^"')]*)["']?\s*\)/gi)) {
    if (!m[1].trim().startsWith('#')) return { ok: false, reason: 'SVG verweist auf externe Dateien oder Adressen' }
  }
  const size = svgSize(head)
  if (!size) return { ok: false, reason: 'SVG ohne Größe (viewBox oder width/height fehlt)' }
  return { ok: true, kind: 'svg', width: size.width, height: size.height, text }
}

/** Zielgröße fürs Rastern: längste Seite höchstens `maxSide`; Vektoren werden auf `maxSide` skaliert, Pixelbilder nie vergrößert. */
export function rasterTarget(width: number, height: number, opts: { maxSide?: number; vector: boolean }): { width: number; height: number } {
  const maxSide = opts.maxSide ?? 1200
  const fit = maxSide / Math.max(width, height)
  const s = opts.vector ? fit : Math.min(1, fit)
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) }
}
