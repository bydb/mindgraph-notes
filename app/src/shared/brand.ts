// Hausdesign (Plan + Codex F01–F14: docs/codex-collab/skill-builder-hausdesign.md).
// Rein und prozessübergreifend: Profil-Schema, Farbrechnung, Ableitung der Farbrollen.
// Ein Profil liegt als `hausdesign.json` in einem verwalteten Skill-Ordner; NUR der Main liest es.

export const BRAND_PROFILE_FILE = 'hausdesign.json'
export const BRAND_LOGO_FILE = 'logo.png'
export const BRAND_MANAGED_BY = 'mindgraph-hausdesign'
export const BRAND_PROFILE_VERSION = 1
export const BRAND_DEFAULT_FOLDER = 'hausdesign'
/** Vault-Pfad der mitgelieferten Vorlage — nur GENAU dieser wird auf das Hausdesign umgelenkt (Codex F02). */
export const STARTER_DECK_VAULT_REL = 'Skills/praesentation-nach-vorlage/MindGraph-Hausstil.pptx'

/** Längengrenzen (F14): Name/Kontakt landen in Prompt, Folien-Titelzone und Briefkopf. */
export const BRAND_LIMITS = {
  name: 80,
  subline: 100,
  address: 160,
  phone: 40,
  email: 100,
  web: 100,
  maxProfileBytes: 64 * 1024,
  maxLogoBytes: 2 * 1024 * 1024
} as const

export interface BrandContact {
  address?: string
  phone?: string
  email?: string
  web?: string
}

export interface BrandColors {
  /** Hausfarbe (Akzent) als #RRGGBB. */
  primary: string
  /** Zweite Farbe (Diagramm-Linie 2, accent2), optional. */
  secondary?: string
  /** Dunkle Farbe für dunkle Folien. */
  dark: string
}

export interface BrandProfile {
  version: 1
  managedBy: typeof BRAND_MANAGED_BY
  enabled: boolean
  name: string
  subline?: string
  /** Name steht schon im Logo → keine zweite Wortmarke neben dem Logo. */
  logoHasName: boolean
  contact: BrandContact
  colors: BrandColors
  logo: { file: string; width: number; height: number; sha256: string }
  /** Vom Builder angelegte Dateien (relativ zum Profilordner). Nur diese werden je gelöscht (F11). */
  files: string[]
  /** Dateiname der Präsentationsvorlage im Profilordner. */
  deckFile: string
  /** Dateiname des Briefkopfs im Profilordner, falls erzeugt. */
  letterFile?: string
  updatedAt: string
}

const CONTROL_RE = new RegExp('[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F\\u2028\\u2029\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', 'g')

// ── Text-Hygiene (F14) ──────────────────────────────────────────────────────────────────────

/** Steuerzeichen raus, Leerraum zusammenfassen; `allowNewlines` erlaubt einzelne \n (Anschrift). */
export function cleanBrandText(raw: unknown, max: number, allowNewlines = false): string {
  if (typeof raw !== 'string') return ''
  let s = raw.normalize('NFC')
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\r\n?/g, '\n').replace(CONTROL_RE, '')
  if (allowNewlines) {
    s = s.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4).join('\n')
  } else {
    s = s.replace(/\s+/g, ' ').trim()
  }
  return s.slice(0, max).trim()
}

// ── Farben ──────────────────────────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v)
}

export function normalizeHex(v: string): string {
  return v.toLowerCase()
}

type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
}

/** `amount` Anteil von `hex` auf `base` (0..1). */
export function mix(hex: string, base: string, amount: number): string {
  const a = hexToRgb(hex)
  const b = hexToRgb(base)
  return rgbToHex([0, 1, 2].map(i => a[i] * amount + b[i] * (1 - amount)) as RGB)
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Schrittweise Richtung Schwarz (bzw. Weiß), bis `min` gegen `against` erreicht ist. */
export function adjustForContrast(hex: string, against: string, min: number, toward: '#000000' | '#ffffff'): string {
  if (contrast(hex, against) >= min) return normalizeHex(hex)
  for (let k = 0.95; k >= 0; k -= 0.05) {
    const c = mix(hex, toward, k)
    if (contrast(c, against) >= min) return c
  }
  return toward
}

export function rgbToHsl([r, g, b]: RGB): { h: number; s: number; l: number } {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0))
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return { h: h * 60, s, l }
}

// ── Farbrollen (F04, F05, F12) ──────────────────────────────────────────────────────────────

export const WHITE = '#ffffff'
export const INK = '#1c2024'
/** Kartenfläche der Hausstil-Vorlage. */
export const PANEL = '#f3f4f6'
/** Seitenhintergrund der HTML-Seiten im Dunkelmodus (scientificHtmlPage). */
export const DARK_PAGE_BG = '#16181c'

export interface BrandTokens {
  /** Flächen-Akzent (Balken, Ziffernfelder, Mindmap-Mitte). Weiß darauf ≥ 3:1 (große, fette Schrift). */
  fill: string
  /** Akzent als Schrift auf Weiß, Kartenfläche und heller Tönung: ≥ 4,5:1. */
  text: string
  /** Helle Tönung als Fläche (Kennzahlen, Mindmap-Äste, HTML-Abstract). */
  tint: string
  /** Mittlere Tönung (accent6). */
  tintMid: string
  /** Dunkle Folienfläche; Weiß darauf ≥ 7:1. */
  dark: string
  /** Akzent als Schrift auf `dark`: ≥ 4,5:1. */
  onDark: string
  /** Zweite Diagrammlinie: ≥ 3:1 gegen Weiß. */
  line2: string
  /** HTML-Dunkelmodus: Akzent als Text/Linie auf DARK_PAGE_BG ≥ 4,5:1 und auf darkTint ≥ 4,5:1. */
  darkText: string
  /** HTML-Dunkelmodus: Tönungsfläche. */
  darkTint: string
  darkLine2: string
  /** Hinweise für die Vorschau, wenn Farben für Lesbarkeit verändert wurden. */
  notes: string[]
}

export function deriveBrandTokens(colors: BrandColors): BrandTokens {
  const notes: string[] = []
  const primary = normalizeHex(colors.primary)
  const fill = adjustForContrast(primary, WHITE, 3, '#000000')
  if (fill !== primary) notes.push('fill-darkened')
  // Sehr gesättigte Hausfarben (Signalrot) wirken mit 12 % schon rosa (GUI-Gegenprobe 08.11.2026) —
  // dort reichen 8 % für eine erkennbare, aber ruhige Fläche.
  const tint = mix(primary, WHITE, rgbToHsl(hexToRgb(primary)).s > 0.75 ? 0.08 : 0.12)
  const tintMid = mix(primary, WHITE, 0.45)
  // Text muss auf Weiß, Kartenfläche UND Tönung lesbar sein — die dunkelste Anforderung gilt.
  let text = adjustForContrast(primary, WHITE, 4.5, '#000000')
  text = adjustForContrast(text, PANEL, 4.5, '#000000')
  text = adjustForContrast(text, tint, 4.5, '#000000')
  if (text !== primary) notes.push('text-darkened')

  let dark = normalizeHex(colors.dark)
  const darkAdj = adjustForContrast(dark, WHITE, 7, '#000000')
  if (darkAdj !== dark) notes.push('dark-darkened')
  dark = darkAdj
  const onDark = adjustForContrast(mix(primary, WHITE, 0.45), dark, 4.5, '#ffffff')

  // Ohne zweite Farbe trägt die dunkle Hausfarbe die zweite Diagrammlinie — das alte Orange-Braun
  // der MindGraph-Seiten passte zu keiner fremden Hausfarbe (GUI-Gegenprobe: Rot neben Braun).
  const sec = colors.secondary ? normalizeHex(colors.secondary) : normalizeHex(colors.dark)
  const line2 = adjustForContrast(sec, WHITE, 3, '#000000')

  const darkTint = mix(primary, DARK_PAGE_BG, 0.18)
  let darkText = adjustForContrast(primary, DARK_PAGE_BG, 4.5, '#ffffff')
  darkText = adjustForContrast(darkText, darkTint, 4.5, '#ffffff')
  const darkLine2 = adjustForContrast(sec, DARK_PAGE_BG, 3, '#ffffff')
  return { fill, text, tint, tintMid, dark, onDark, line2, darkText, darkTint, darkLine2, notes }
}

// ── Profil prüfen ───────────────────────────────────────────────────────────────────────────

const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,100}$/

function safeFileName(v: unknown): v is string {
  return typeof v === 'string' && FILE_RE.test(v) && !v.includes('..') && !v.startsWith('.')
}

/** Streng: alles Unbekannte oder Kaputte → null (kein Hausdesign, nie raten). */
export function parseBrandProfile(raw: unknown): BrandProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.version !== BRAND_PROFILE_VERSION || o.managedBy !== BRAND_MANAGED_BY) return null
  const name = cleanBrandText(o.name, BRAND_LIMITS.name)
  if (!name) return null
  const c = o.colors as Record<string, unknown> | undefined
  if (!c || !isHexColor(c.primary) || !isHexColor(c.dark)) return null
  if (c.secondary !== undefined && !isHexColor(c.secondary)) return null
  const logo = o.logo as Record<string, unknown> | undefined
  if (!logo || !safeFileName(logo.file) || typeof logo.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(logo.sha256)) return null
  const lw = Number(logo.width), lh = Number(logo.height)
  if (!Number.isFinite(lw) || !Number.isFinite(lh) || lw < 1 || lh < 1 || lw > 4000 || lh > 4000) return null
  if (!Array.isArray(o.files) || o.files.length > 20 || !o.files.every(safeFileName)) return null
  if (!safeFileName(o.deckFile) || !o.files.includes(o.deckFile)) return null
  if (o.letterFile !== undefined && (!safeFileName(o.letterFile) || !o.files.includes(o.letterFile))) return null
  if (!o.files.includes(logo.file)) return null
  const ct = (o.contact ?? {}) as Record<string, unknown>
  const contact: BrandContact = {}
  const addr = cleanBrandText(ct.address, BRAND_LIMITS.address, true)
  const phone = cleanBrandText(ct.phone, BRAND_LIMITS.phone)
  const email = cleanBrandText(ct.email, BRAND_LIMITS.email)
  const web = cleanBrandText(ct.web, BRAND_LIMITS.web)
  if (addr) contact.address = addr
  if (phone) contact.phone = phone
  if (email) contact.email = email
  if (web) contact.web = web
  const subline = cleanBrandText(o.subline, BRAND_LIMITS.subline)
  return {
    version: 1,
    managedBy: BRAND_MANAGED_BY,
    enabled: o.enabled === true,
    name,
    ...(subline ? { subline } : {}),
    logoHasName: o.logoHasName === true,
    contact,
    colors: {
      primary: normalizeHex(c.primary),
      dark: normalizeHex(c.dark),
      ...(c.secondary ? { secondary: normalizeHex(c.secondary as string) } : {})
    },
    logo: { file: logo.file, width: lw, height: lh, sha256: logo.sha256 },
    files: [...o.files] as string[],
    deckFile: o.deckFile,
    ...(o.letterFile ? { letterFile: o.letterFile as string } : {}),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt.slice(0, 40) : ''
  }
}

/** Kurzname für Dateinamen: nur [A-Za-z0-9-], höchstens 40 Zeichen. */
export function brandFileStem(name: string): string {
  const s = name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return s || 'Hausdesign'
}

// ── Prompt-Block (F03, F14) ─────────────────────────────────────────────────────────────────

/**
 * Block für den System-Prompt des Agenten. Der Name ist DATEN (in Anführungszeichen, ohne
 * Zeilenumbrüche); die Prioritätsregel ist dieselbe, die der Main beim Vorlagen-Alias anwendet.
 */
export function brandPromptBlock(p: BrandProfile, folderRel: string, letterSkillFolders: string[]): string {
  const name = JSON.stringify(p.name)
  const deck = `${folderRel}/${p.deckFile}`
  const letter = p.letterFile ? `${folderRel}/${p.letterFile}` : ''
  const lines = [
    '',
    '',
    `Hausdesign aktiv (Einrichtung ${name}, Hausfarbe ${p.colors.primary}). Rangfolge: 1. ausdrücklicher Wunsch im Auftrag, 2. ein eigener Briefkopf-Skill der Einrichtung, 3. eine ausdrücklich genannte eigene Vorlage, 4. das Hausdesign.`,
    `- Präsentationen: Vorlage "${deck}". Die mitgelieferte MindGraph-Hausstil-Vorlage wird bei aktivem Hausdesign automatisch durch diese ersetzt.`,
    '- Mindmaps, HTML-Seiten und Infografiken bekommen Hausfarben (und auf HTML-Seiten das Logo) automatisch — keine Farben selbst setzen.'
  ]
  if (letterSkillFolders.length) {
    lines.push(`- Briefe: vorhandenen Briefkopf-Skill nutzen (${letterSkillFolders.map(f => `"${f}"`).join(', ')}).${letter ? ` Nur ohne passenden Skill: Vorlage "${letter}".` : ''}`)
  } else if (letter) {
    lines.push(`- Briefe: write_docx mit template "${letter}" (Felder DATUM, BETREFF, EMPFAENGER).`)
  }
  return lines.join('\n')
}
