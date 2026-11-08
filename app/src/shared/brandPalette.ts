// Farbvorschlag aus Logo-Pixeln (RGBA). Rein; den Rasterschritt macht der Main mit sharp.
// Gemessen am Testlogo (08.11.2026): Das SVG nennt im Quelltext Blau, gerendert ist es Rot + Grau
// (spätere CSS-Regeln überschreiben). Deshalb nur aus gerenderten Pixeln, nie aus dem Quelltext.
// Neutrale Farben (Grau) werden nicht verworfen, sondern sind Kandidaten für die dunkle Farbe.

import { rgbToHsl, rgbToHex, luminance, mix } from './brand'

export interface PaletteSuggestion {
  primary: string | null
  secondary: string | null
  dark: string | null
  /** Für die Anzeige: gefundene Farben mit Anteil (0..1 an den gezählten Pixeln). */
  swatches: Array<{ hex: string; share: number; neutral: boolean }>
}

interface Bucket { n: number; r: number; g: number; b: number }

export function suggestPalette(rgba: Uint8Array | Buffer, opts: { minShare?: number } = {}): PaletteSuggestion {
  const minShare = opts.minShare ?? 0.02
  const chroma = new Map<number, Bucket>()
  const neutral = new Map<number, Bucket>()
  let counted = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3]
    if (a < 160) continue
    const rgb: [number, number, number] = [rgba[i], rgba[i + 1], rgba[i + 2]]
    const { h, s, l } = rgbToHsl(rgb)
    if (l > 0.93) continue // Weiß/Papier
    counted++
    const add = (m: Map<number, Bucket>, k: number) => {
      const b = m.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
      b.n++; b.r += rgb[0]; b.g += rgb[1]; b.b += rgb[2]
      m.set(k, b)
    }
    if (s < 0.25 || l < 0.08) add(neutral, Math.min(9, Math.floor(l * 10)))
    else add(chroma, Math.floor(h / 30) % 12)
  }
  if (counted === 0) return { primary: null, secondary: null, dark: null, swatches: [] }
  const avg = (b: Bucket) => rgbToHex([b.r / b.n, b.g / b.n, b.b / b.n])
  const chromaList = [...chroma.entries()]
    .map(([k, b]) => ({ sector: k, hex: avg(b), share: b.n / counted }))
    .filter(x => x.share >= minShare)
    .sort((x, y) => y.share - x.share)
  const neutralList = [...neutral.values()]
    .map(b => ({ hex: avg(b), share: b.n / counted }))
    .filter(x => x.share >= minShare)
    .sort((x, y) => y.share - x.share)

  const primary = chromaList[0]?.hex ?? null
  let secondary: string | null = null
  if (chromaList[0]) {
    const h0 = chromaList[0].sector * 30
    const other = chromaList.find(c => {
      const d = Math.abs(c.sector * 30 - h0)
      return Math.min(d, 360 - d) >= 60
    })
    secondary = other?.hex ?? null
  }
  // Dunkle Farbe: häufigstes Neutral, das dunkel genug für Flächen ist; sonst Primär stark abgedunkelt.
  const darkNeutral = neutralList.find(n => luminance(n.hex) < 0.25)
  let dark: string | null = darkNeutral?.hex ?? null
  if (!dark && primary) dark = mix(primary, '#000000', 0.35)
  // Ohne Buntfarbe: das häufigste Neutral kann trotzdem Hausfarbe sein (z. B. reines Grau-Logo) —
  // dann KEIN Vorschlag für primary; die UI fragt nach.
  return {
    primary,
    secondary,
    dark,
    swatches: [
      ...chromaList.map(c => ({ hex: c.hex, share: c.share, neutral: false })),
      ...neutralList.map(n => ({ hex: n.hex, share: n.share, neutral: true }))
    ].slice(0, 8)
  }
}
