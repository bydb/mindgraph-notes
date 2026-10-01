// Baut eine PowerPoint-Präsentation aus einer Vorlage des Nutzers (Muster-
// Präsentation mit Master, Logo, Fußzeile und Layouts). Pure Logik: Bytes rein,
// Bytes raus — kein fs, kein electron (testbar via vitest), gleiche Bauart wie
// docxTemplateFill.
//
// Grundsatz (Entscheidung 11 des Notiz-Agenten): Das Modell schreibt nie XML. Es
// liefert eine Folienliste (Layout, Titel, Text, Bild, Notizen), und dieser Code
// legt daraus Folien auf den ECHTEN Layouts der Vorlage an. Master, Logo,
// Hintergründe und Schriften kommen dadurch unverändert aus der Vorlage; die
// neuen Folien enthalten nur Platzhalter-Kopien mit leerem spPr, erben also
// Position und Formatierung vom Layout.
//
// Was die Vorlage verliert: ihre Musterfolien. Sie werden samt Notizen,
// Kommentaren und nur von ihnen benutzten Medien entfernt (Abschnitte und
// benutzerdefinierte Bildschirmpräsentationen zeigen auf Folien-IDs und gehen mit).
//
// Alles läuft über String-Operationen auf dem Original-XML (wie bei DOCX): was
// nicht ausdrücklich geändert wird, bleibt Byte für Byte erhalten.

import JSZip from 'jszip'

// ── Grenzen ────────────────────────────────────────────────────────────────

export const PPTX_LIMITS = {
  maxSlides: 40,
  maxTitleChars: 150,
  maxKickerChars: 60,
  maxItems: 6,
  maxItemLabelChars: 40,
  maxItemTitleChars: 80,
  maxItemTextChars: 400,
  maxTakeawayChars: 220,
  maxSubtitleChars: 400,
  maxBodyChars: 2500,
  maxNotesChars: 3000,
  maxFields: 40,
  maxFieldChars: 500,
  maxImages: 20,
  maxImageBytes: 10 * 1024 * 1024,
  maxTotalImageBytes: 40 * 1024 * 1024,
  maxImagePixels: 40_000_000,
  /** ZIP-Grenzen der Vorlage (gegen Archive, die beim Entpacken explodieren). */
  maxZipEntries: 3000,
  maxUnpackedBytes: 300 * 1024 * 1024,
  maxPartBytes: 60 * 1024 * 1024,
  /** Ab dieser geschätzten Füllung (1 = passt genau) wird abgelehnt statt verkleinert. */
  rejectFillRatio: 1.5,
  /** Kleinste Schriftskalierung, die gesetzt wird (85 %). */
  minFontScale: 0.8
} as const

export class PptxInputError extends Error {
  issues: string[]
  constructor(issues: string[]) {
    super(issues.join('; '))
    this.issues = issues
  }
}

// ── Eingabe/Ausgabe ────────────────────────────────────────────────────────

export type LayoutKind =
  | 'title'
  | 'section'
  | 'content'
  | 'two-content'
  | 'comparison'
  | 'title-only'
  | 'picture'
  | 'caption'
  | 'blank'
  | 'cards'
  | 'other'

export const LAYOUT_KINDS: LayoutKind[] = ['title', 'section', 'content', 'two-content', 'comparison', 'title-only', 'picture', 'caption', 'cards', 'blank']

export interface PptxSlideInput {
  /** Layoutname der Vorlage (ohne Groß/Klein), "#n" oder Art (title, content, …). Leer = automatisch. */
  layout?: string
  /** Dachzeile über dem Titel — nur bei Layouts mit Platzhalter, der genau „Dachzeile"/„Kicker"/„Rubrik" heißt. */
  kicker?: string
  title?: string
  subtitle?: string
  /** Mini-Markdown: "- " Aufzählung, zwei Leerzeichen Einzug je Ebene, "1. " Nummerierung, **fett**. */
  body?: string
  /** Zweiter Inhaltsbereich (rechte Spalte bei zwei Inhalten). */
  body2?: string
  /** Schlüssel in `images` (Dateiname). */
  image?: string
  notes?: string
  /** Karten, Schritte oder Kennzahlen — für Layouts mit Plätzen „Karte 1", „Schritt 1", „Kennzahl 1" … */
  items?: PptxItem[]
  /** Merksatz für einen Platz „Kernaussage" (dunkler Balken). */
  takeaway?: string
}

export interface PptxItem {
  /** Kleine Zeile über dem Titel (Karten), bei Kennzahlen die Rubrik. */
  label?: string
  /** Kartentitel, Schritt-Titel oder bei Kennzahlen die Zahl selbst („100 %"). */
  title: string
  /** Kurzer Text darunter; "- " wird zu einem Gedankenstrich-Absatz. */
  text?: string
  /** Karte farbig hervorheben (Akzentfarbe hell). */
  highlight?: boolean
}

export interface PptxBuildInput {
  slides: PptxSlideInput[]
  fields?: Record<string, string>
  /** Bilddaten, vom Aufrufer aufgelöst: Schlüssel = slide.image. */
  images?: Record<string, Uint8Array>
  /** Sprache der Textläufe (Rechtschreibprüfung in PowerPoint). Default de-DE. */
  lang?: string
  /**
   * Quellen einer Webrecherche. Gesetzt → die App hängt eine Folie „Quellen" mit
   * anklickbaren Links an (deterministisch, wie der Quellenblock bei Notizen) und
   * entfernt eine vom Modell selbst geschriebene Quellenfolie.
   */
  sources?: PptxSource[]
}

export interface PptxSource {
  title: string
  url: string
  /** ISO-Datum des Abrufs. */
  fetchedAt: string
}

/** Quellen je Folie — mehr wird auf Folgefolien verteilt (Webrecherche ruft höchstens 10 Seiten ab). */
export const SOURCES_PER_SLIDE = 6
const SOURCE_TITLE_RE = /^\s*(quellen(verzeichnis|angaben)?|literatur(verzeichnis)?|weiterführende\s+links|weblinks|literatur\s+und\s+links|sources|references|further\s+reading)(\s*\(.*\)|\s*\d+)?\s*:?\s*$/i
// Bewusst NICHT der bloße Titel „Links": das ist auch die linke Seite einer Gegenüberstellung (Codex F36).
/** Maximale URL-Länge — gleich wie beim Abruf (shared/webResearch MAX_URL_CHARS), sonst fiele ein gelesener Link still heraus (Codex F34). */
const MAX_SOURCE_URL_CHARS = 2048

export interface PptxBuildResult {
  bytes: Uint8Array
  slideCount: number
  /** Hinweise für Modell und Ergebnis-Karte (verkleinerte Schrift, leere Felder …). */
  notes: string[]
  filled: string[]
  unfilled: string[]
}

export interface PlaceholderInfo {
  type: string // title, ctrTitle, subTitle, body, obj, pic, dt, ftr, sldNum, …
  idx: number
  /** Originale Attribute des p:ph (für die Kopie auf der Folie). */
  phAttrs: string
  name: string
  /** Aufgelöste Geometrie in EMU (Layout → Master), falls bekannt. */
  box?: Box
  /** Schriftgröße der ersten Ebene in pt (Layout → Master), falls bekannt. */
  fontPt?: number
  /** Schriftgrößen der Ebenen 1–3 aus dem lstStyle des Layouts (Karten: Rubrik, Titel, Text). */
  levelPts?: (number | undefined)[]
  /** Original-XML des Platzhalters im Layout (für Fußzeilen-Kopien). */
  xml: string
}

export interface LayoutInfo {
  name: string
  kind: LayoutKind
  type: string
  partPath: string
  masterIndex: number
  placeholders: PlaceholderInfo[]
}

export interface SampleDecoration {
  /** Nummer der Musterfolie (1-basiert). */
  slide: number
  layoutName: string
  pictures: number
  shapes: number
  /** Eigener Folienhintergrund (p:bg), der nicht aus dem Layout kommt. */
  background: boolean
}

export interface PptxTemplateInfo {
  slideWidth: number
  slideHeight: number
  layouts: LayoutInfo[]
  sampleSlideCount: number
  /** Gestaltung, die nur auf Musterfolien liegt (Bilder/Formen außerhalb von Platzhaltern) und beim Erzeugen fehlt. */
  sampleDecorations: SampleDecoration[]
  fields: string[]
  hasNotesMaster: boolean
}

interface Box {
  x: number
  y: number
  cx: number
  cy: number
}

// ── Konstanten ─────────────────────────────────────────────────────────────

const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL = {
  officeDocument: `${REL_BASE}/officeDocument`,
  slide: `${REL_BASE}/slide`,
  slideLayout: `${REL_BASE}/slideLayout`,
  slideMaster: `${REL_BASE}/slideMaster`,
  notesSlide: `${REL_BASE}/notesSlide`,
  notesMaster: `${REL_BASE}/notesMaster`,
  theme: `${REL_BASE}/theme`,
  image: `${REL_BASE}/image`,
  hyperlink: `${REL_BASE}/hyperlink`
}
const CT = {
  presentation: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  template: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml',
  slideshow: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml',
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  notesSlide: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
  notesMaster: 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml'
}
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const EMU_PER_PT = 12700
const FOOTER_TYPES = ['dt', 'ftr', 'sldNum'] as const
const PLACEHOLDER_RE = /\{\{([A-Za-z0-9_]+)\}\}/g

// ── XML-Helfer ─────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

/**
 * Entfernt Zeichen, die in XML 1.0 verboten sind (Steuerzeichen, einzelne
 * Surrogate). Ein einziges davon in einem a:t macht die ganze Datei unlesbar.
 */
export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? unescapeXml(m[1]) : undefined
}

/**
 * Ende eines Tags ('>') ab `from`, Anführungszeichen beachtend — ein roher '>'
 * in einem Attributwert (in XML erlaubt, z. B. descr="a > b") beendet kein Tag.
 */
function tagEndAt(xml: string, from: number): number {
  let quote = ''
  for (let i = from; i < xml.length; i++) {
    const c = xml[i]
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '>') return i
  }
  return -1
}

/** Alle vollständigen Elemente <tag …>…</tag> bzw. <tag …/> der obersten Ebene, die in `xml` vorkommen (nicht verschachtelt gleichnamig). */
function findElements(xml: string, tag: string): { xml: string; start: number; end: number }[] {
  const out: { xml: string; start: number; end: number }[] = []
  const esc = tag.replace(/[.]/g, '\\.')
  const re = new RegExp(`<(/?)${esc}(?=[\\s>/])`, 'g')
  let depth = 0
  let start = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const tagEnd = tagEndAt(xml, m.index)
    if (tagEnd === -1) break
    const selfClosing = xml[tagEnd - 1] === '/'
    if (m[1] === '/') {
      depth--
      if (depth === 0 && start !== -1) {
        out.push({ xml: xml.slice(start, tagEnd + 1), start, end: tagEnd + 1 })
        start = -1
      }
    } else if (selfClosing) {
      if (depth === 0) out.push({ xml: xml.slice(m.index, tagEnd + 1), start: m.index, end: tagEnd + 1 })
    } else {
      if (depth === 0) start = m.index
      depth++
    }
    re.lastIndex = tagEnd + 1
  }
  return out
}

function firstElement(xml: string, tag: string): string | undefined {
  return findElements(xml, tag)[0]?.xml
}

/** Öffnendes Tag eines Elements (bis einschließlich '>'). */
function openTag(elementXml: string): string {
  return elementXml.slice(0, tagEndAt(elementXml, 0) + 1)
}

/** Reintext aller a:t eines Fragments, Absätze mit \n getrennt. */
function drawingText(xml: string): string {
  return findElements(xml, 'a:p')
    .map(p => {
      let s = ''
      const re = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g
      let m: RegExpExecArray | null
      while ((m = re.exec(p.xml)) !== null) s += unescapeXml(m[1])
      return s
    })
    .join('\n')
}

// ── Paket-Helfer ───────────────────────────────────────────────────────────

interface Rel {
  id: string
  type: string
  target: string
  external: boolean
}

function relsPathFor(partPath: string): string {
  const slash = partPath.lastIndexOf('/')
  return `${partPath.slice(0, slash + 1)}_rels/${partPath.slice(slash + 1)}.rels`
}

function partDir(partPath: string): string {
  const slash = partPath.lastIndexOf('/')
  return slash === -1 ? '' : partPath.slice(0, slash)
}

/** Rel-Ziel relativ zum Part auflösen → Paketpfad ohne führenden Slash. */
function resolveTarget(fromPart: string, target: string): string {
  if (target.startsWith('/')) return normalizePath(target.slice(1))
  const base = partDir(fromPart)
  return normalizePath(base ? `${base}/${target}` : target)
}

function normalizePath(p: string): string {
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}

/** Relativer Pfad von einem Part zu einem anderen (für neue Rel-Ziele). */
function relativeTarget(fromPart: string, toPart: string): string {
  const from = partDir(fromPart).split('/').filter(Boolean)
  const to = toPart.split('/')
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++
  return [...Array(from.length - i).fill('..'), ...to.slice(i)].join('/')
}

function parseRels(xml: string | undefined): Rel[] {
  if (!xml) return []
  return findElements(xml, 'Relationship').map(r => {
    const tag = openTag(r.xml)
    return {
      id: attr(tag, 'Id') ?? '',
      type: attr(tag, 'Type') ?? '',
      target: attr(tag, 'Target') ?? '',
      external: attr(tag, 'TargetMode') === 'External'
    }
  })
}

function serializeRels(rels: Rel[]): string {
  const items = rels
    .map(r => `<Relationship Id="${escapeXml(r.id)}" Type="${escapeXml(r.type)}" Target="${escapeXml(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`)
    .join('')
  return `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`
}

function nextRelId(rels: Rel[]): string {
  let n = 1
  const used = new Set(rels.map(r => r.id))
  while (used.has(`rId${n}`)) n++
  return `rId${n}`
}

class Package {
  zip: JSZip
  private cache = new Map<string, string>()
  private deleted = new Set<string>()
  contentTypes = ''

  constructor(zip: JSZip) {
    this.zip = zip
  }

  static async load(bytes: Uint8Array): Promise<Package> {
    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(bytes)
    } catch {
      throw new PptxInputError(['Die Vorlage ist keine gültige PowerPoint-Datei (kein ZIP-Archiv)'])
    }
    // Größen aus dem Zentralverzeichnis prüfen, BEVOR irgendein Part entpackt wird.
    let entries = 0
    let unpacked = 0
    let tooBig = ''
    zip.forEach((p, f) => {
      entries++
      const size = Number((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0)
      unpacked += size
      if (size > PPTX_LIMITS.maxPartBytes) tooBig = p
    })
    if (entries > PPTX_LIMITS.maxZipEntries) throw new PptxInputError([`Die Vorlage enthält zu viele Teile (${entries}, höchstens ${PPTX_LIMITS.maxZipEntries})`])
    if (tooBig) throw new PptxInputError([`Ein Teil der Vorlage ist entpackt zu groß (${tooBig})`])
    if (unpacked > PPTX_LIMITS.maxUnpackedBytes) throw new PptxInputError([`Die Vorlage ist entpackt zu groß (${Math.round(unpacked / 1024 / 1024)} MB, höchstens ${PPTX_LIMITS.maxUnpackedBytes / 1024 / 1024} MB)`])
    const pkg = new Package(zip)
    const ct = await pkg.read('[Content_Types].xml')
    if (!ct) throw new PptxInputError(['Die Vorlage ist keine gültige PowerPoint-Datei ([Content_Types].xml fehlt)'])
    pkg.contentTypes = ct
    return pkg
  }

  has(path: string): boolean {
    return !this.deleted.has(path) && (this.cache.has(path) || this.zip.file(path) !== null)
  }

  async read(path: string): Promise<string | undefined> {
    if (this.deleted.has(path)) return undefined
    const cached = this.cache.get(path)
    if (cached !== undefined) return cached
    const f = this.zip.file(path)
    if (!f) return undefined
    let s = await f.async('string')
    if (/\.(xml|rels)$/i.test(path)) {
      // Kommentare tragen in OOXML keine Bedeutung, würden aber vom Tag-Scanner
      // als Struktur gelesen (Codex F21). CDATA kommt in PowerPoint-Parts nicht vor.
      if (s.includes('<![CDATA[')) throw new PptxInputError([`Die Vorlage enthält ungewöhnliches XML (CDATA in ${path}) — bitte in PowerPoint neu speichern`])
      if (s.includes('<!--')) s = s.replace(/<!--[\s\S]*?-->/g, '')
    }
    this.cache.set(path, s)
    return s
  }

  write(path: string, data: string | Uint8Array): void {
    this.deleted.delete(path)
    if (typeof data === 'string') this.cache.set(path, data)
    else this.cache.delete(path)
    this.zip.file(path, data)
  }

  remove(path: string): void {
    this.deleted.add(path)
    this.cache.delete(path)
    this.zip.remove(path)
  }

  async rels(partPath: string): Promise<Rel[]> {
    return parseRels(await this.read(relsPathFor(partPath)))
  }

  writeRels(partPath: string, rels: Rel[]): void {
    this.write(relsPathFor(partPath), serializeRels(rels))
  }

  /** Alle Part-Pfade im Archiv (ohne Verzeichnisse). */
  paths(): string[] {
    const out: string[] = []
    this.zip.forEach((p, f) => {
      if (!f.dir && !this.deleted.has(p)) out.push(p)
    })
    return out
  }

  contentTypeOf(path: string): string | undefined {
    for (const o of findElements(this.contentTypes, 'Override')) {
      const tag = openTag(o.xml)
      if ((attr(tag, 'PartName') ?? '').replace(/^\//, '').toLowerCase() === path.toLowerCase()) return attr(tag, 'ContentType')
    }
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    for (const d of findElements(this.contentTypes, 'Default')) {
      const tag = openTag(d.xml)
      if ((attr(tag, 'Extension') ?? '').toLowerCase() === ext) return attr(tag, 'ContentType')
    }
    return undefined
  }

  setOverride(path: string, contentType: string): void {
    this.removeOverride(path)
    this.contentTypes = this.contentTypes.replace('</Types>', `<Override PartName="/${escapeXml(path)}" ContentType="${escapeXml(contentType)}"/></Types>`)
  }

  removeOverride(path: string): void {
    for (const o of findElements(this.contentTypes, 'Override').reverse()) {
      if ((attr(openTag(o.xml), 'PartName') ?? '').replace(/^\//, '').toLowerCase() === path.toLowerCase()) {
        this.contentTypes = this.contentTypes.slice(0, o.start) + this.contentTypes.slice(o.end)
      }
    }
  }

  ensureDefault(ext: string, contentType: string): void {
    const has = findElements(this.contentTypes, 'Default').some(d => (attr(openTag(d.xml), 'Extension') ?? '').toLowerCase() === ext.toLowerCase())
    if (!has) this.contentTypes = this.contentTypes.replace(/<Types([^>]*)>/, `<Types$1><Default Extension="${ext}" ContentType="${contentType}"/>`)
  }

  freePartName(dir: string, stem: string, ext: string): string {
    let n = 1
    const lower = new Set(this.paths().map(p => p.toLowerCase()))
    while (lower.has(`${dir}/${stem}${n}.${ext}`.toLowerCase())) n++
    return `${dir}/${stem}${n}.${ext}`
  }

  async generate(): Promise<Uint8Array> {
    this.zip.file('[Content_Types].xml', this.contentTypes)
    return this.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
  }
}

async function findPresentationPart(pkg: Package): Promise<string> {
  const rootRels = parseRels(await pkg.read('_rels/.rels'))
  const main = rootRels.find(r => r.type === REL.officeDocument && !r.external)
  const p = main ? resolveTarget('', main.target) : 'ppt/presentation.xml'
  if (!(await pkg.read(p))) throw new PptxInputError(['Die Vorlage enthält keine PowerPoint-Präsentation (presentation.xml fehlt)'])
  return p
}

// ── Vorlage lesen ──────────────────────────────────────────────────────────

interface MasterInfo {
  partPath: string
  xml: string
  placeholders: PlaceholderInfo[]
  /** Schriftgrößen aus p:txStyles (pt) für title/body/other, Ebene 1. */
  titlePt?: number
  bodyPt?: number
  otherPt?: number
}

function parseBox(spXml: string): Box | undefined {
  const spPr = firstElement(spXml, 'p:spPr')
  if (!spPr) return undefined
  const xfrm = firstElement(spPr, 'a:xfrm')
  if (!xfrm) return undefined
  const off = /<a:off\s[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(xfrm)
  const ext = /<a:ext\s[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(xfrm)
  if (!off || !ext) return undefined
  return { x: Number(off[1]), y: Number(off[2]), cx: Number(ext[1]), cy: Number(ext[2]) }
}

function lvl1FontPt(fragment: string | undefined, level = 1): number | undefined {
  if (!fragment) return undefined
  const lvl = firstElement(fragment, `a:lvl${level}pPr`)
  if (!lvl) return undefined
  const m = /<a:defRPr\s[^>]*sz="(\d+)"/.exec(lvl)
  return m ? Number(m[1]) / 100 : undefined
}

/** Platzhalter-Shapes (sp, pic, graphicFrame) eines spTree. */
function parsePlaceholders(xml: string): PlaceholderInfo[] {
  const tree = firstElement(xml, 'p:spTree') ?? ''
  const out: PlaceholderInfo[] = []
  for (const tag of ['p:sp', 'p:pic', 'p:graphicFrame']) {
    for (const el of findElements(tree, tag)) {
      const ph = /<p:ph(\s[^>]*)?\/?>/.exec(el.xml)
      if (!ph) continue
      const phTag = ph[0]
      const type = attr(phTag, 'type') ?? 'obj'
      const idx = Number(attr(phTag, 'idx') ?? '0')
      const name = attr(/<p:cNvPr\s[^>]*>/.exec(el.xml)?.[0] ?? '', 'name') ?? ''
      const txBody = firstElement(el.xml, 'p:txBody')
      out.push({
        type,
        idx,
        phAttrs: (ph[1] ?? '').replace(/\s*\/$/, ''),
        name,
        box: parseBox(el.xml),
        fontPt: lvl1FontPt(txBody ? firstElement(txBody, 'a:lstStyle') : undefined),
        levelPts: [1, 2, 3].map(n => lvl1FontPt(txBody ? firstElement(txBody, 'a:lstStyle') : undefined, n)),
        xml: el.xml
      })
    }
  }
  return out
}

/** Master-Platzhalter, von dem ein Layout-Platzhalter erbt (Zuordnung über den Typ). */
function masterCounterpart(master: MasterInfo, type: string): PlaceholderInfo | undefined {
  const wanted = type === 'ctrTitle' ? 'title' : ['subTitle', 'obj', 'body', 'tx', 'pic', 'tbl', 'chart', 'media', 'clipArt', 'dgm'].includes(type) ? 'body' : type
  return master.placeholders.find(p => p.type === wanted)
}

function masterFontPt(master: MasterInfo, type: string): number | undefined {
  if (type === 'title' || type === 'ctrTitle') return master.titlePt
  if (['subTitle', 'obj', 'body', 'tx'].includes(type)) return master.bodyPt
  return master.otherPt
}

const CONTENT_TYPES_PH = new Set(['obj', 'body', 'tx'])

/**
 * Dachzeile (kleine Zeile über dem Titel): ein Text-Platzhalter, den die Vorlage
 * über seinen NAMEN als solche kennzeichnet. Er ist nie Inhalts- oder
 * Untertitelfläche — sonst landete Fließtext in einer 10-pt-Zeile.
 */
// Ganzer Name (PowerPoint hängt gern eine Nummer an: „Dachzeile 1"), kein
// Teilwort — sonst gälte „Rubrik-Inhalt" als Dachzeile (Codex F28).
const KICKER_NAME_RE = /^\s*(dachzeile|kicker|rubrik|overline|eyebrow)(\s*\d+)?\s*$/i
function isKicker(p: PlaceholderInfo): boolean {
  return (p.type === 'body' || p.type === 'obj') && KICKER_NAME_RE.test(p.name)
}

/**
 * Karten-, Schritt- und Kennzahl-Plätze: Text-Platzhalter mit Namen „Karte 1",
 * „Schritt 2", „Kennzahl 3" (oder englisch). Die Nummer bestimmt die Reihenfolge.
 * Wie die Dachzeile sind sie nie Inhaltsfläche für body/body2.
 */
const ITEM_NAME_RE = /^\s*(karte|schritt|kennzahl|card|step|stat|item)\s*(\d+)\s*$/i
const TAKEAWAY_NAME_RE = /^\s*(kernaussage|merksatz|takeaway|key\s*message)(\s*\d+)?\s*$/i
function isItemSlot(p: PlaceholderInfo): boolean {
  return (p.type === 'body' || p.type === 'obj') && ITEM_NAME_RE.test(p.name)
}
function isTakeaway(p: PlaceholderInfo): boolean {
  return (p.type === 'body' || p.type === 'obj') && TAKEAWAY_NAME_RE.test(p.name)
}
/** Platzhalter mit Sonderrolle (nicht für body/body2/subtitle). */
function isSpecial(p: PlaceholderInfo): boolean {
  return isKicker(p) || isItemSlot(p) || isTakeaway(p)
}
function itemSlots(layout: LayoutInfo): PlaceholderInfo[] {
  return layout.placeholders
    .filter(isItemSlot)
    .sort((a, b) => Number(ITEM_NAME_RE.exec(a.name)?.[2] ?? 0) - Number(ITEM_NAME_RE.exec(b.name)?.[2] ?? 0))
}

function classifyLayout(type: string, phs: PlaceholderInfo[]): LayoutKind {
  switch (type) {
    case 'title': return 'title'
    case 'secHead': return 'section'
    case 'obj':
    case 'tx': return 'content'
    case 'twoObj':
    case 'twoTxTwoObj': return type === 'twoObj' ? 'two-content' : 'comparison'
    case 'titleOnly': return 'title-only'
    case 'picTx': return 'picture'
    case 'objTx': return 'caption'
    case 'blank': return 'blank'
    case 'vertTx':
    case 'vertTitleAndTx':
    case 'vertTitleAndTxOverChart': return 'other'
  }
  if (phs.some(isItemSlot)) return 'cards'
  const roles = phs.filter(p => !(FOOTER_TYPES as readonly string[]).includes(p.type) && p.type !== 'hdr' && !isSpecial(p))
  const hasTitle = roles.some(p => p.type === 'title' || p.type === 'ctrTitle')
  const contents = roles.filter(p => CONTENT_TYPES_PH.has(p.type)).length
  if (roles.some(p => p.type === 'ctrTitle') || (hasTitle && roles.some(p => p.type === 'subTitle'))) return 'title'
  if (hasTitle && roles.some(p => p.type === 'pic')) return 'picture'
  if (hasTitle && contents >= 4) return 'comparison'
  if (hasTitle && contents >= 2) return 'two-content'
  if (hasTitle && contents === 1) return 'content'
  if (hasTitle) return 'title-only'
  if (roles.length === 0) return 'blank'
  return 'other'
}

interface TemplateModel {
  presPath: string
  presXml: string
  presRels: Rel[]
  masters: MasterInfo[]
  layouts: LayoutInfo[]
  slideWidth: number
  slideHeight: number
  sampleSlides: { partPath: string; relId: string; layoutPath?: string; xml: string }[]
  notesMasterPath?: string
}

async function readTemplate(pkg: Package): Promise<TemplateModel> {
  const presPath = await findPresentationPart(pkg)
  const ct = pkg.contentTypeOf(presPath) ?? ''
  if (/macroEnabled/i.test(ct)) throw new PptxInputError(['Vorlagen mit Makros (.pptm/.potm) werden nicht verarbeitet — speichere die Vorlage als .pptx oder .potx'])
  const presXml = (await pkg.read(presPath))!
  if (presXml.includes('http://purl.oclc.org/ooxml/presentationml/main')) {
    throw new PptxInputError(['Die Vorlage ist im Format „Strict Open XML" gespeichert — bitte in PowerPoint als normale .pptx oder .potx speichern'])
  }
  if (!presXml.includes(NS_P)) throw new PptxInputError(['Die Vorlage ist keine PowerPoint-Präsentation im erwarteten Format'])
  const presRels = await pkg.rels(presPath)
  const sldSz = /<p:sldSz\s[^>]*>/.exec(presXml)?.[0] ?? ''
  const slideWidth = Number(attr(sldSz, 'cx') ?? '12192000')
  const slideHeight = Number(attr(sldSz, 'cy') ?? '6858000')

  const masters: MasterInfo[] = []
  const layouts: LayoutInfo[] = []
  // Reihenfolge der Master wie in sldMasterIdLst.
  const masterIds = findElements(presXml, 'p:sldMasterId').map(e => attr(openTag(e.xml), 'r:id') ?? '')
  for (const rid of masterIds) {
    const rel = presRels.find(r => r.id === rid && r.type === REL.slideMaster)
    if (!rel) continue
    const partPath = resolveTarget(presPath, rel.target)
    const xml = await pkg.read(partPath)
    if (!xml) continue
    const txStyles = firstElement(xml, 'p:txStyles') ?? ''
    const master: MasterInfo = {
      partPath,
      xml,
      placeholders: parsePlaceholders(xml),
      titlePt: lvl1FontPt(firstElement(txStyles, 'p:titleStyle')),
      bodyPt: lvl1FontPt(firstElement(txStyles, 'p:bodyStyle')),
      otherPt: lvl1FontPt(firstElement(txStyles, 'p:otherStyle'))
    }
    masters.push(master)
    const masterRels = await pkg.rels(partPath)
    const layoutIds = findElements(xml, 'p:sldLayoutId').map(e => attr(openTag(e.xml), 'r:id') ?? '')
    for (const lid of layoutIds) {
      const lrel = masterRels.find(r => r.id === lid && r.type === REL.slideLayout)
      if (!lrel) continue
      const lpath = resolveTarget(partPath, lrel.target)
      const lxml = await pkg.read(lpath)
      if (!lxml) continue
      const rootTag = openTag(firstElement(lxml, 'p:sldLayout') ?? '<p:sldLayout>')
      const type = attr(rootTag, 'type') ?? 'cust'
      const name = attr(/<p:cSld(\s[^>]*)?>/.exec(lxml)?.[0] ?? '', 'name') ?? `Layout ${layouts.length + 1}`
      const phs = parsePlaceholders(lxml).map(p => {
        const mp = masterCounterpart(master, p.type)
        return { ...p, box: p.box ?? mp?.box, fontPt: p.fontPt ?? mp?.fontPt ?? masterFontPt(master, p.type) }
      })
      layouts.push({ name, kind: classifyLayout(type, phs), type, partPath: lpath, masterIndex: masters.length - 1, placeholders: phs })
    }
  }
  if (layouts.length === 0) throw new PptxInputError(['Die Vorlage enthält keine Folienlayouts'])

  const sampleSlides: TemplateModel['sampleSlides'] = []
  for (const e of findElements(firstElement(presXml, 'p:sldIdLst') ?? '', 'p:sldId')) {
    const rid = attr(openTag(e.xml), 'r:id') ?? ''
    const rel = presRels.find(r => r.id === rid && r.type === REL.slide)
    if (!rel) continue
    const partPath = resolveTarget(presPath, rel.target)
    const sxml = (await pkg.read(partPath)) ?? ''
    const lrel = (await pkg.rels(partPath)).find(r => r.type === REL.slideLayout)
    sampleSlides.push({ partPath, relId: rid, layoutPath: lrel ? resolveTarget(partPath, lrel.target) : undefined, xml: sxml })
  }

  const nmId = firstElement(presXml, 'p:notesMasterId')
  const nmRel = nmId ? presRels.find(r => r.id === attr(openTag(nmId), 'r:id')) : undefined
  const notesMasterPath = nmRel ? resolveTarget(presPath, nmRel.target) : undefined

  return { presPath, presXml, presRels, masters, layouts, slideWidth, slideHeight, sampleSlides, notesMasterPath: notesMasterPath && pkg.has(notesMasterPath) ? notesMasterPath : undefined }
}

/**
 * Bilder und Formen einer Musterfolie, die KEINE Platzhalter sind. Sie gehören
 * nicht zum Layout und fehlen deshalb auf neu erzeugten Folien — in vielen
 * Firmenvorlagen sitzt genau dort das Logo (Codex F04).
 */
function sampleDecorations(model: TemplateModel): SampleDecoration[] {
  const out: SampleDecoration[] = []
  model.sampleSlides.forEach((s, i) => {
    const tree = firstElement(s.xml, 'p:spTree') ?? ''
    let pictures = 0
    let shapes = 0
    for (const tag of ['p:pic', 'p:sp', 'p:grpSp', 'p:graphicFrame', 'p:cxnSp']) {
      for (const el of findElements(tree, tag)) {
        if (/<p:ph[\s/>]/.test(el.xml)) continue
        if (tag === 'p:pic' || /<a:blip\s/.test(el.xml)) pictures++
        else shapes++
      }
    }
    const background = /<p:bg[\s>]/.test(firstElement(s.xml, 'p:cSld') ?? '')
    if (pictures + shapes > 0 || background) {
      const layoutName = model.layouts.find(l => l.partPath === s.layoutPath)?.name ?? '?'
      out.push({ slide: i + 1, layoutName, pictures, shapes, background })
    }
  })
  return out
}

function describeDecoration(d: SampleDecoration): string {
  const parts: string[] = []
  if (d.pictures) parts.push(`${d.pictures} Bild${d.pictures > 1 ? 'er' : ''}`)
  if (d.shapes) parts.push(`${d.shapes} Form${d.shapes > 1 ? 'en' : ''}/Textfeld${d.shapes > 1 ? 'er' : ''}`)
  if (d.background) parts.push('eigener Hintergrund')
  return `Musterfolie ${d.slide} („${d.layoutName}") trägt eigene Gestaltung außerhalb des Layouts (${parts.join(', ')})`
}

/** {{FELDER}} in Master und Layouts (nach dem Zusammenziehen zerlegter Läufe). */
function collectFields(xmls: string[]): string[] {
  const set = new Set<string>()
  for (const x of xmls) {
    for (const p of findElements(x, 'a:p')) {
      for (const m of drawingText(p.xml).matchAll(PLACEHOLDER_RE)) set.add(m[1])
    }
  }
  return [...set]
}

export async function inspectPptxTemplate(bytes: Uint8Array): Promise<PptxTemplateInfo> {
  const pkg = await Package.load(bytes)
  const model = await readTemplate(pkg)
  const xmls = [...model.masters.map(m => m.xml), ...(await Promise.all(model.layouts.map(l => pkg.read(l.partPath)))).map(x => x ?? '')]
  return {
    slideWidth: model.slideWidth,
    slideHeight: model.slideHeight,
    layouts: model.layouts,
    sampleSlideCount: model.sampleSlides.length,
    sampleDecorations: sampleDecorations(model),
    fields: collectFields(xmls),
    hasNotesMaster: !!model.notesMasterPath
  }
}

/** Grobe Kapazität eines Platzhalters in Textzeilen (für die Beschreibung ans Modell). */
function capacityLines(ph: PlaceholderInfo): number | undefined {
  if (!ph.box || !ph.fontPt) return undefined
  const usableH = ph.box.cy / EMU_PER_PT - 7.2
  return Math.max(1, Math.floor(usableH / (ph.fontPt * 1.25)))
}

const ROLE_LABEL: Record<string, string> = {
  title: 'Titel',
  ctrTitle: 'Titel',
  subTitle: 'Untertitel',
  obj: 'Inhalt',
  body: 'Text',
  tx: 'Text',
  pic: 'Bild',
  tbl: 'Tabelle',
  chart: 'Diagramm',
  media: 'Medien',
  dgm: 'SmartArt',
  clipArt: 'Bild'
}

/** Text für das Modell: welche Layouts es gibt und was hineinpasst. */
export function describePptxTemplate(info: PptxTemplateInfo): string {
  const ratio = info.slideWidth / info.slideHeight
  const format = Math.abs(ratio - 16 / 9) < 0.05 ? '16:9' : Math.abs(ratio - 4 / 3) < 0.05 ? '4:3' : `${(info.slideWidth / 360000).toFixed(1)} × ${(info.slideHeight / 360000).toFixed(1)} cm`
  const lines: string[] = [`Folienformat ${format}, ${info.layouts.length} Layouts, ${info.sampleSlideCount} Musterfolien (werden beim Erzeugen entfernt).`]
  const seen = new Map<string, number>()
  for (const l of info.layouts) seen.set(l.name.toLowerCase(), (seen.get(l.name.toLowerCase()) ?? 0) + 1)
  lines.push('Layouts (Nummer — Name — Art — Platzhalter); wählen per Name oder, bei gleichen Namen, per Nummer wie "#3":')
  info.layouts.forEach((l, li) => {
    const parts = l.placeholders
      .filter(p => !(FOOTER_TYPES as readonly string[]).includes(p.type) && p.type !== 'hdr')
      .map(p => {
        const cap = CONTENT_TYPES_PH.has(p.type) ? capacityLines(p) : undefined
        if (isKicker(p)) return 'Dachzeile'
        if (isTakeaway(p)) return 'Kernaussage'
        if (isItemSlot(p)) return `${p.name}`
        return `${ROLE_LABEL[p.type] ?? p.type}${cap ? ` (~${cap} ${cap === 1 ? 'Zeile' : 'Zeilen'})` : ''}`
      })
    const footer = l.placeholders.filter(p => (FOOTER_TYPES as readonly string[]).includes(p.type)).length > 0 ? ', Fußzeile' : ''
    const dup = (seen.get(l.name.toLowerCase()) ?? 0) > 1 ? ` [Master ${l.masterIndex + 1}]` : ''
    lines.push(`- #${li + 1} "${l.name}"${dup} — ${l.kind} — ${parts.join(', ') || 'leer'}${footer}`)
  })
  if (info.fields.length) lines.push(`Felder der Vorlage (über fields füllen): ${info.fields.join(', ')}`)
  if (info.sampleDecorations.length) {
    lines.push('Achtung — diese Gestaltung fehlt auf neuen Folien, weil sie nicht im Master/Layout liegt:')
    for (const d of info.sampleDecorations) lines.push(`- ${describeDecoration(d)}`)
  }
  return lines.join('\n')
}

// ── Musterfolien entfernen ─────────────────────────────────────────────────

/**
 * Entfernt alle Folien der Vorlage und räumt alles ab, was nur an ihnen hing.
 * Danach ist die Präsentation folienlos, aber konsistent.
 */
async function removeSampleSlides(pkg: Package, model: TemplateModel): Promise<void> {
  const slidePaths = new Set(model.sampleSlides.map(s => s.partPath))
  const slideRelIds = new Set(model.sampleSlides.map(s => s.relId))

  let pres = model.presXml
  // sldIdLst leeren (bleibt als Anker für neue Folien stehen).
  const lst = findElements(pres, 'p:sldIdLst')[0]
  if (lst) pres = pres.slice(0, lst.start) + '<p:sldIdLst></p:sldIdLst>' + pres.slice(lst.end)
  // Benutzerdefinierte Bildschirmpräsentationen zeigen per r:id auf Folien.
  for (const e of findElements(pres, 'p:custShowLst').reverse()) pres = pres.slice(0, e.start) + pres.slice(e.end)
  // Abschnitte (p14:sectionLst) zeigen per Folien-ID auf Folien — eine Abschnittsliste
  // mit verschwundenen IDs ist genau der Fall, den PowerPoint „reparieren" will.
  for (const ext of findElements(pres, 'p:ext').reverse()) {
    if (/<p14:sectionLst[\s>]/.test(ext.xml) || /<p15:sectionLst[\s>]/.test(ext.xml)) pres = pres.slice(0, ext.start) + pres.slice(ext.end)
  }
  pres = pres.replace(/<p:extLst>\s*<\/p:extLst>/, '')
  model.presXml = pres
  model.presRels = model.presRels.filter(r => !slideRelIds.has(r.id))
  pkg.write(model.presPath, pres)
  pkg.writeRels(model.presPath, model.presRels)

  // Rels anderer Parts, die auf eine Folie zeigen (viewProps-Gliederung u. a.), entfernen.
  for (const p of pkg.paths()) {
    if (!p.endsWith('.rels')) continue
    const owner = p.replace(/_rels\/([^/]+)\.rels$/, '$1')
    if (slidePaths.has(owner)) continue
    const rels = parseRels(await pkg.read(p))
    const keep = rels.filter(r => r.external || !slidePaths.has(resolveTarget(owner, r.target)))
    if (keep.length !== rels.length) {
      const dropped = rels.filter(r => !keep.includes(r)).map(r => r.id)
      pkg.write(p, serializeRels(keep))
      const ownerXml = await pkg.read(owner)
      if (ownerXml && owner.endsWith('viewProps.xml')) {
        let v = ownerXml
        for (const e of findElements(v, 'p:sldLst').reverse()) v = v.slice(0, e.start) + v.slice(e.end)
        pkg.write(owner, v)
      } else if (ownerXml && dropped.some(id => ownerXml.includes(`"${id}"`))) {
        // Unbekannter Verweis auf eine gelöschte Folie: lieber laut scheitern als
        // eine Datei erzeugen, die PowerPoint reparieren will.
        throw new PptxInputError([`Die Vorlage verweist in ${owner} auf eine Musterfolie — diese Vorlage wird noch nicht unterstützt`])
      }
    }
  }
  await collectGarbage(pkg)
}

/** Löscht Parts, die vom Paket-Root aus über keine Beziehung mehr erreichbar sind. */
async function collectGarbage(pkg: Package): Promise<void> {
  const reachable = new Set<string>()
  const queue = ['']
  while (queue.length) {
    const part = queue.shift()!
    const relsPath = part === '' ? '_rels/.rels' : relsPathFor(part)
    for (const r of parseRels(await pkg.read(relsPath))) {
      if (r.external) continue
      const t = resolveTarget(part, r.target)
      if (!reachable.has(t) && pkg.has(t)) {
        reachable.add(t)
        queue.push(t)
      }
    }
  }
  for (const p of pkg.paths()) {
    if (p === '[Content_Types].xml' || p.endsWith('.rels')) continue
    if (!reachable.has(p)) {
      pkg.remove(p)
      pkg.removeOverride(p)
    }
  }
  // Rels-Dateien gelöschter Parts.
  for (const p of pkg.paths()) {
    if (!p.endsWith('.rels') || p === '_rels/.rels') continue
    const owner = p.replace(/_rels\/([^/]+)\.rels$/, '$1')
    if (!pkg.has(owner)) pkg.remove(p)
  }
}

// ── Felder ─────────────────────────────────────────────────────────────────

/**
 * PowerPoint zerlegt Läufe beim Bearbeiten (Rechtschreibprüfung), sodass
 * {{FELD}} über mehrere a:r verteilt sein kann. Zusammengezogen werden NUR die
 * Läufe, über die sich ein Platzhalter erstreckt (Formatierung des ersten);
 * alle anderen Läufe des Absatzes bleiben, wie sie sind (Codex F19). Absätze
 * mit Feldern (a:fld) oder Zeilenumbrüchen werden nicht angefasst.
 */
export function normalizeDrawingPlaceholderRuns(xml: string): string {
  let out = ''
  let last = 0
  for (const p of findElements(xml, 'a:p')) {
    if (!p.xml.includes('{{') || /<a:fld[\s>]|<a:br[\s/>]/.test(p.xml)) continue
    const runs = findElements(p.xml, 'a:r').map(r => ({ ...r, text: drawingText(`<a:p>${r.xml}</a:p>`) }))
    const offsets: number[] = []
    let total = 0
    for (const r of runs) {
      offsets.push(total)
      total += r.text.length
    }
    // Zwischen nicht unmittelbar benachbarten Läufen (Tabulator, anderer Knoten)
    // steht ein Trenner, damit kein Platzhalter über fremde Knoten hinweg erkannt
    // und samt Tabulator weggeschnitten wird (Codex F24).
    const SEP = '\u0000'
    let fullText = ''
    runs.forEach((r, k) => {
      if (k > 0 && p.xml.slice(runs[k - 1].end, r.start).trim() !== '') {
        fullText += SEP
        for (let m = k; m < offsets.length; m++) offsets[m] += 1
      }
      fullText += r.text
    })
    // Lauf-Spannen [i, j] je Platzhalter, der nicht in einem Lauf steht; überlappende vereinigen.
    const spans: [number, number][] = []
    for (const m of fullText.matchAll(PLACEHOLDER_RE)) {
      const s0 = m.index ?? 0
      const e0 = s0 + m[0].length
      const i = runs.findIndex((r, k) => offsets[k] + r.text.length > s0)
      let j = i
      while (j + 1 < runs.length && offsets[j + 1] < e0) j++
      if (i === -1 || i === j) continue
      const prev = spans[spans.length - 1]
      if (prev && i <= prev[1]) prev[1] = Math.max(prev[1], j)
      else spans.push([i, j])
    }
    if (spans.length === 0) continue
    let newP = p.xml
    for (const [i, j] of spans.reverse()) {
      const rPr = firstElement(runs[i].xml, 'a:rPr') ?? ''
      const text = runs.slice(i, j + 1).map(r => r.text).join('')
      newP = newP.slice(0, runs[i].start) + `<a:r>${rPr}<a:t>${escapeXml(text)}</a:t></a:r>` + newP.slice(runs[j].end)
    }
    out += xml.slice(last, p.start) + newP
    last = p.end
  }
  return out + xml.slice(last)
}

function fillFields(xml: string, fields: Record<string, string>, filled: Set<string>, unfilled: Set<string>): string {
  const norm = normalizeDrawingPlaceholderRuns(xml)
  return norm.replace(/(<a:t(?:\s[^>]*)?>)([^<]*)(<\/a:t>)/g, (_m, open: string, inner: string, close: string) => {
    let removed = false
    let text = unescapeXml(inner).replace(PLACEHOLDER_RE, (_p, name: string) => {
      const key = Object.keys(fields).find(k => k.toUpperCase() === name.toUpperCase())
      if (key !== undefined && fields[key].trim()) {
        filled.add(name)
        return fields[key]
      }
      unfilled.add(name)
      removed = true
      return ''
    })
    // „MindGraph Notes · {{ANLASS}}" ohne Wert soll nicht auf „ · " enden.
    if (removed) text = text.replace(/\s*[·|•–—-]\s*$/, '').replace(/^\s*[·|•–—-]\s*/, '').replace(/\s*([·|•–—])\s*[·|•–—]\s*/g, ' $1 ')
    return `${open}${escapeXml(cleanText(text))}${close}`
  })
}

// ── Text → DrawingML ───────────────────────────────────────────────────────

interface Para {
  level: number
  kind: 'bullet' | 'number' | 'plain'
  text: string
}

/** Mini-Markdown in Absätze zerlegen. */
export function parseBodyText(body: string): Para[] {
  const out: Para[] = []
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) continue
    const expanded = raw.replace(/\t/g, '  ')
    const indent = expanded.length - expanded.trimStart().length
    const level = Math.min(3, Math.floor(indent / 2))
    const t = expanded.trim()
    let m: RegExpExecArray | null
    if ((m = /^[-*•–]\s+(.*)$/.exec(t))) out.push({ level, kind: 'bullet', text: m[1] })
    else if ((m = /^\d+[.)]\s+(.*)$/.exec(t))) out.push({ level, kind: 'number', text: m[1] })
    else out.push({ level: 0, kind: 'plain', text: t.replace(/^#+\s+/, '') })
  }
  return out
}

/** Inline-Markdown → Läufe. Nur **fett** wird zur Formatierung; Links werden Text. */
function runsXml(text: string, lang: string, bold = false): string {
  const clean = cleanText(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1')
  const parts = clean.split(/(\*\*[^*]+\*\*)/g).filter(s => s !== '')
  if (parts.length === 0) return ''
  return parts
    .map(part => {
      const isBold = bold || (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      const t = part.startsWith('**') && part.endsWith('**') && part.length > 4 ? part.slice(2, -2) : part.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2')
      return `<a:r><a:rPr lang="${escapeXml(lang)}"${isBold ? ' b="1"' : ''} dirty="0"/><a:t>${escapeXml(t)}</a:t></a:r>`
    })
    .join('')
}

function bodyParagraphsXml(paras: Para[], lang: string): string {
  if (paras.length === 0) return `<a:p><a:endParaRPr lang="${escapeXml(lang)}" dirty="0"/></a:p>`
  return paras
    .map(p => {
      const lvl = p.level > 0 ? ` lvl="${p.level}"` : ''
      let pPr = ''
      if (p.kind === 'plain') pPr = `<a:pPr marL="0" indent="0"><a:buNone/></a:pPr>`
      else if (p.kind === 'number') pPr = `<a:pPr${lvl}><a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/></a:pPr>`
      else if (lvl) pPr = `<a:pPr${lvl}/>`
      return `<a:p>${pPr}${runsXml(p.text, lang)}</a:p>`
    })
    .join('')
}

function plainParagraphsXml(text: string, lang: string): string {
  const lines = cleanText(text).replace(/\r\n?/g, '\n').split('\n')
  return lines.map(l => (l.trim() ? `<a:p>${runsXml(l, lang)}</a:p>` : `<a:p><a:endParaRPr lang="${escapeXml(lang)}" dirty="0"/></a:p>`)).join('')
}

// ── Überlauf-Schätzung ─────────────────────────────────────────────────────

/**
 * Schätzt, wie voll ein Platzhalter mit diesen Absätzen wird (1 = genau voll).
 * Grob mit Absicht: mittlere Zeichenbreite 0,5 em, Zeilenhöhe 1,2, Absatz-
 * abstand 0,3 Zeilen. Lieber eine Folie mehr als Text, der über den Rand läuft.
 */
export function estimateFill(paras: { level: number; text: string }[], box: Box, fontPt: number): number {
  const widthPt = box.cx / EMU_PER_PT - 14.4
  const heightPt = box.cy / EMU_PER_PT - 7.2
  if (widthPt <= 0 || heightPt <= 0) return 0
  let lines = 0
  for (const p of paras) {
    const indentPt = p.level * 28 + (p.level > 0 || paras.length > 1 ? 14 : 0)
    const charsPerLine = Math.max(8, (widthPt - indentPt) / (fontPt * 0.5))
    const plain = p.text.replace(/\*\*/g, '')
    lines += Math.max(1, Math.ceil(plain.length / charsPerLine)) + 0.3
  }
  return (lines * fontPt * 1.2) / heightPt
}

function autofitFor(ratio: number): { scale: number } | null {
  if (ratio <= 1) return null
  const scale = Math.max(PPTX_LIMITS.minFontScale, Math.floor((1 / Math.sqrt(ratio)) * 40) / 40)
  return { scale }
}

function bodyPrXml(fit: { scale: number } | null): string {
  if (!fit) return '<a:bodyPr/>'
  const fs = Math.round(fit.scale * 100) * 1000
  const lnSpc = fit.scale < 0.9 ? ' lnSpcReduction="10000"' : ''
  return `<a:bodyPr><a:normAutofit fontScale="${fs}"${lnSpc}/></a:bodyPr>`
}

// ── Bilder ─────────────────────────────────────────────────────────────────

interface ImageMeta {
  ext: 'png' | 'jpeg'
  width: number
  height: number
}

let CRC_TABLE: Uint32Array | null = null
export function crc32(b: Uint8Array, start = 0, end = b.length): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * PNG vollständig durchlaufen: Signatur, jeder Chunk mit gültiger Länge und
 * Prüfsumme, IHDR zuerst, IEND zuletzt (Codex F17). Ein abgeschnittenes oder
 * verfälschtes Bild würde PowerPoint reparieren wollen oder leer zeigen.
 */
function pngIsWellFormed(b: Uint8Array): boolean {
  if (b.length < 8 + 25 + 12 || PNG_SIG.some((v, i) => b[i] !== v)) return false
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let pos = 8
  let first = true
  let sawData = false
  while (pos + 12 <= b.length) {
    const len = dv.getUint32(pos)
    const typeStart = pos + 4
    const dataEnd = typeStart + 4 + len
    if (dataEnd + 4 > b.length) return false
    const type = String.fromCharCode(b[typeStart], b[typeStart + 1], b[typeStart + 2], b[typeStart + 3])
    if (first && (type !== 'IHDR' || len !== 13)) return false
    first = false
    if (crc32(b, typeStart, dataEnd) !== dv.getUint32(dataEnd)) return false
    if (type === 'IDAT') sawData = true
    if (type === 'IEND') return sawData && len === 0 && dataEnd + 4 === b.length
    pos = dataEnd + 4
  }
  return false
}

/** Format und Pixelmaße aus den Bytes (Struktur geprüft, nicht der Dateiname). */
export function readImageMeta(b: Uint8Array): ImageMeta | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    if (!pngIsWellFormed(b)) return null
    const w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]
    const h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]
    return w > 0 && h > 0 ? { ext: 'png', width: w, height: h } : null
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    // Abgeschnittene JPEGs (häufigster Defekt) haben kein End-of-Image-Marker.
    let tail = b.length - 1
    while (tail > 1 && b[tail] === 0x00) tail--
    if (!(b[tail - 1] === 0xff && b[tail] === 0xd9)) return null
    // Ohne Scan-Abschnitt (SOS) enthält die Datei keine Bilddaten.
    let hasSos = false
    for (let i = 2; i + 1 < tail; i++) if (b[i] === 0xff && b[i + 1] === 0xda) { hasSos = true; break }
    if (!hasSos) return null
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const marker = b[i + 1]
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
      const len = (b[i + 2] << 8) | b[i + 3]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = (b[i + 5] << 8) | b[i + 6]
        const w = (b[i + 7] << 8) | b[i + 8]
        return w > 0 && h > 0 ? { ext: 'jpeg', width: w, height: h } : null
      }
      i += 2 + len
    }
  }
  return null
}

/** Zuschnitt (srcRect in 1/1000 %), damit das Bild den Rahmen ohne Verzerrung füllt. */
function cropToFill(img: ImageMeta, box: Box): string {
  const boxRatio = box.cx / box.cy
  const imgRatio = img.width / img.height
  if (Math.abs(boxRatio - imgRatio) < 0.01) return ''
  if (imgRatio > boxRatio) {
    const side = Math.round(((1 - boxRatio / imgRatio) / 2) * 100000)
    return `<a:srcRect l="${side}" r="${side}"/>`
  }
  const side = Math.round(((1 - imgRatio / boxRatio) / 2) * 100000)
  return `<a:srcRect t="${side}" b="${side}"/>`
}

/** Größtes Rechteck mit Bild-Seitenverhältnis, mittig in der Box. */
function containBox(img: ImageMeta, box: Box): Box {
  const scale = Math.min(box.cx / img.width, box.cy / img.height)
  const cx = Math.round(img.width * scale)
  const cy = Math.round(img.height * scale)
  return { x: box.x + Math.round((box.cx - cx) / 2), y: box.y + Math.round((box.cy - cy) / 2), cx, cy }
}

function xfrmXml(b: Box): string {
  return `<a:xfrm><a:off x="${b.x}" y="${b.y}"/><a:ext cx="${b.cx}" cy="${b.cy}"/></a:xfrm>`
}

// ── Folien bauen ───────────────────────────────────────────────────────────

/** Schritt-Layouts zeichnen Ziffern fest ins Layout — dort muss die Anzahl genau passen (Codex F38). */
function needsExactCount(layout: LayoutInfo): boolean {
  return itemSlots(layout).some(p => /^\s*(schritt|step)\b/i.test(p.name))
}

function bestItemLayout(layouts: LayoutInfo[], slide: PptxSlideInput): LayoutInfo | undefined {
  const nItems = Array.isArray(slide.items) ? slide.items.length : 0
  const wantsBanner = !!(slide.takeaway ?? '').trim()
  // Ohne ausdrückliche Wahl nur Karten-Layouts — keine Schritte (die nimmt man beim Namen) — außer die Anzahl passt genau.
  return layouts
    .filter(l => itemSlots(l).length >= nItems && (nItems > 0 ? itemSlots(l).length > 0 : contentSlots(l).length > 0 || !slide.body))
    .filter(l => !needsExactCount(l) || itemSlots(l).length === nItems)
    .filter(l => l.placeholders.some(isTakeaway) === wantsBanner)
    .sort((a, b) => Number(needsExactCount(a)) - Number(needsExactCount(b)) || itemSlots(a).length - itemSlots(b).length)[0]
}

function resolveLayout(model: TemplateModel, slide: PptxSlideInput, index: number): LayoutInfo | string {
  const wanted = (slide.layout ?? '').trim()
  if (wanted) {
    // "#n" wählt das n-te Layout der Inspektionsliste — eindeutig auch bei gleichen Namen (Codex F25).
    const num = /^#(\d+)$/.exec(wanted)
    if (num) return model.layouts[Number(num[1]) - 1] ?? `Folie ${index + 1}: Layout ${wanted} gibt es nicht (1–${model.layouts.length})`
    // "Name [Master 2]" wählt bei gleichnamigen Layouts gezielt (so nennt sie die Inspektion).
    const tagged = /^(.*?)\s*\[Master\s+(\d+)\]$/i.exec(wanted)
    const lower = (tagged ? tagged[1] : wanted).toLowerCase()
    const named = model.layouts.filter(l => l.name.toLowerCase() === lower && (!tagged || l.masterIndex === Number(tagged[2]) - 1))
    if (named.length > 1) return `Folie ${index + 1}: Layout "${wanted}" gibt es mehrfach — mit der Nummer wählen: ${named.map(l => `#${model.layouts.indexOf(l) + 1}`).join(', ')}`
    const byName = named[0]
    if (byName) return byName
    const ofKind = model.layouts.filter(l => l.kind === lower)
    if (ofKind.length > 0) {
      // Bei Karten-Layouts unter allen dieser Art nach Anzahl und Kernaussage wählen (Codex F40).
      if (lower === 'cards') return bestItemLayout(ofKind, slide) ?? ofKind[0]
      return ofKind[0]
    }
    return `Folie ${index + 1}: Layout "${wanted}" gibt es in der Vorlage nicht`
  }
  // Automatik für Karten/Kernaussage: genug Plätze, am liebsten genau passend.
  const nItems = Array.isArray(slide.items) ? slide.items.length : 0
  if (nItems > 0 || (slide.takeaway ?? '').trim()) {
    const best = bestItemLayout(model.layouts, slide)
    if (best) return best
  }
  // Automatik: erste Folie ohne Text → Titelfolie; Bild → Bild-/Zwei-Inhalte-Layout.
  const kinds: LayoutKind[] = []
  if (index === 0 && !slide.body) kinds.push('title')
  if (slide.image && (slide.body || slide.body2)) kinds.push('two-content', 'picture', 'caption')
  else if (slide.image) kinds.push('picture', 'two-content', 'content')
  if (slide.body2) kinds.push('two-content', 'comparison')
  if (slide.body) kinds.push('content')
  if (!slide.body && !slide.image) kinds.push(slide.subtitle ? 'section' : 'title-only', 'title')
  kinds.push('content')
  for (const k of kinds) {
    const l = model.layouts.find(x => x.kind === k)
    if (l) return l
  }
  return model.layouts[0]
}

interface SlidePlan {
  layout: LayoutInfo
  input: PptxSlideInput
  /** Quellen-Folie: Einträge mit Link statt body. */
  links?: PptxSource[]
}

/** Nur http(s), keine Steuerzeichen, begrenzte Länge — alles andere wird keine Quelle. */
function safeSourceUrl(url: string): string | null {
  const u = cleanText(String(url ?? '')).trim()
  if (u.length > MAX_SOURCE_URL_CHARS || /\s/.test(u)) return null
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch {
    return null
  }
}

function sourceLayout(model: TemplateModel): LayoutInfo | undefined {
  // Titel- UND Inhaltsplatz Pflicht — sonst entstünde eine leere „Quellen"-Folie (Codex F31).
  const usable = (l: LayoutInfo): boolean => contentSlots(l).length > 0 && l.placeholders.some(p => p.type === 'title' || p.type === 'ctrTitle')
  return model.layouts.find(l => /quellen|sources/i.test(l.name) && usable(l)) ?? model.layouts.find(l => l.kind === 'content' && usable(l)) ?? model.layouts.find(usable)
}

/** Wie viele Quellen passen auf eine Folie dieses Layouts? Von 6 abwärts, bis die Schätzung passt. */
function sourcesPerSlide(layout: LayoutInfo, sources: PptxSource[]): number {
  const ph = contentSlots(layout)[0]
  if (!ph?.box || !ph.fontPt) return SOURCES_PER_SLIDE
  for (let n = SOURCES_PER_SLIDE; n >= 1; n--) {
    let worst = 0
    for (let k = 0; k < sources.length; k += n) {
      const chunk = sources.slice(k, k + n).map(s => ({ level: 0, text: `${s.title} — ${new URL(s.url).host} · abgerufen am 00.00.0000` }))
      worst = Math.max(worst, estimateFill(chunk, ph.box, ph.fontPt))
    }
    if (worst <= 1 / (PPTX_LIMITS.minFontScale * PPTX_LIMITS.minFontScale)) return n
  }
  return 0 // nicht einmal eine Quelle passt → Aufrufer lehnt ab
}

function contentSlots(layout: LayoutInfo): PlaceholderInfo[] {
  const slots = layout.placeholders.filter(p => (p.type === 'obj' || p.type === 'tx') && !isSpecial(p))
  const bodies = layout.placeholders.filter(p => p.type === 'body' && !isSpecial(p))
  // Vergleichs-Layouts: die kleinen body-Felder sind Spaltenüberschriften, die großen
  // obj-Felder der Inhalt. Gibt es keine obj, sind die body-Felder der Inhalt.
  const list = slots.length ? slots : bodies
  return [...list].sort((a, b) => (a.box?.x ?? a.idx) - (b.box?.x ?? b.idx) || (a.box?.y ?? 0) - (b.box?.y ?? 0))
}

function phSpXml(id: number, ph: PlaceholderInfo, bodyPr: string, paragraphs: string, spPr = '<p:spPr/>'): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(ph.name || `Platzhalter ${id}`)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
    `<p:nvPr><p:ph${ph.phAttrs}/></p:nvPr></p:nvSpPr>${spPr}` +
    `<p:txBody>${bodyPr}<a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
  )
}

function picXml(id: number, relId: string, name: string, ph: PlaceholderInfo | null, img: ImageMeta, box: Box | undefined, mode: 'fill' | 'contain'): string {
  const nvPr = ph ? `<p:nvPr><p:ph${ph.phAttrs}/></p:nvPr>` : '<p:nvPr/>'
  const locks = ph ? '<a:picLocks noGrp="1" noChangeAspect="1"/>' : '<a:picLocks noChangeAspect="1"/>'
  let crop = ''
  let spPr = '<p:spPr/>'
  if (box && mode === 'fill') {
    crop = cropToFill(img, box)
    // Ohne Platzhalter muss die Lage explizit stehen; mit Platzhalter erbt sie vom Layout.
    if (!ph) spPr = `<p:spPr>${xfrmXml(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>`
  } else if (box) {
    spPr = `<p:spPr>${xfrmXml(containBox(img, box))}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>`
  }
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvPicPr>${locks}</p:cNvPicPr>${nvPr}</p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${relId}"/>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill>${spPr}</p:pic>`
  )
}

/** Fußzeilen-Platzhalter des Layouts als Folien-Kopie (Text aus dem Layout). */
function footerSpXml(id: number, ph: PlaceholderInfo): string | null {
  const txBody = firstElement(ph.xml, 'p:txBody')
  if (!txBody) return null
  if (ph.type === 'ftr' && !drawingText(txBody).trim()) return null
  // Text und Felder übernehmen, eigene Formatierung des Layouts (lstStyle/bodyPr) erbt die Folie.
  const paras = findElements(txBody, 'a:p').map(p => p.xml).join('')
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(ph.name || `Fußzeile ${id}`)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
    `<p:nvPr><p:ph${ph.phAttrs}/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>`
  )
}

/**
 * Welche Fußzeilen-Arten kommen auf eine Folie mit diesem Layout? PowerPoint
 * zeigt Fußzeilen des Layouts nur, wenn die Folie eigene Kopien trägt.
 */
function footerTypesFor(layout: LayoutInfo, model: TemplateModel, layoutXml: string, conflicts?: string[]): Set<string> {
  const result = new Set<string>()
  // 1. Musterfolien mit GENAU diesem Layout entscheiden (Codex F14) — eine
  //    Foliennummer auf Layout A sagt nichts über Layout B.
  const samples = model.sampleSlides.filter(s => s.layoutPath === layout.partPath)
  if (samples.length > 0) {
    // Nur was ALLE Musterfolien dieses Layouts zeigen; Widersprüche melden (Codex F26).
    const perSample = samples.map(s => new Set(parsePlaceholders(s.xml).map(ph => ph.type).filter(t => (FOOTER_TYPES as readonly string[]).includes(t))))
    for (const t of FOOTER_TYPES) {
      const count = perSample.filter(set => set.has(t)).length
      if (count === perSample.length) result.add(t)
      else if (count > 0) conflicts?.push(`Layout "${layout.name}": ${t === 'ftr' ? 'Fußzeilentext' : t === 'sldNum' ? 'Foliennummer' : 'Datum'} nur auf ${count} von ${perSample.length} Musterfolien — weggelassen`)
    }
    return result
  }
  // 2. Sonst p:hf des Layouts bzw. Masters ("0" = aus); fehlt es: Fußzeilentext
  //    und Nummer an, Datum aus. Titelfolien ohne Musterbeleg: keine Fußzeile.
  if (layout.kind === 'title') return result
  const hf = /<p:hf(\s[^>]*)?\/?>/.exec(layoutXml)?.[0] ?? /<p:hf(\s[^>]*)?\/?>/.exec(model.masters[layout.masterIndex]?.xml ?? '')?.[0]
  if (hf) {
    for (const t of FOOTER_TYPES) if (attr(hf, t) !== '0') result.add(t)
  } else {
    result.add('ftr')
    result.add('sldNum')
  }
  return result
}

function validateInput(input: PptxBuildInput): string[] {
  const issues: string[] = []
  if (!Array.isArray(input.slides) || input.slides.length === 0) return ['Keine Folien übergeben']
  if (input.slides.length > PPTX_LIMITS.maxSlides) issues.push(`Zu viele Folien (${input.slides.length}), höchstens ${PPTX_LIMITS.maxSlides}`)
  input.slides.forEach((s, i) => {
    const n = i + 1
    if (!s || typeof s !== 'object') {
      issues.push(`Folie ${n}: kein Objekt`)
      return
    }
    if ((s.kicker ?? '').length > PPTX_LIMITS.maxKickerChars) issues.push(`Folie ${n}: Dachzeile zu lang (höchstens ${PPTX_LIMITS.maxKickerChars} Zeichen)`)
    for (const key of ['layout', 'kicker', 'title', 'subtitle', 'body', 'body2', 'image', 'notes'] as const) {
      const v = (s as unknown as Record<string, unknown>)[key]
      if (v !== undefined && v !== null && typeof v !== 'string') issues.push(`Folie ${n}: "${key}" muss Text sein`)
    }
    if ((s.title ?? '').length > PPTX_LIMITS.maxTitleChars) issues.push(`Folie ${n}: Titel zu lang (${s.title!.length} Zeichen, höchstens ${PPTX_LIMITS.maxTitleChars})`)
    if ((s.subtitle ?? '').length > PPTX_LIMITS.maxSubtitleChars) issues.push(`Folie ${n}: Untertitel zu lang (höchstens ${PPTX_LIMITS.maxSubtitleChars} Zeichen)`)
    for (const key of ['body', 'body2'] as const) {
      if ((s[key] ?? '').length > PPTX_LIMITS.maxBodyChars) issues.push(`Folie ${n}: ${key} zu lang (höchstens ${PPTX_LIMITS.maxBodyChars} Zeichen) — auf mehrere Folien verteilen`)
    }
    if ((s.notes ?? '').length > PPTX_LIMITS.maxNotesChars) issues.push(`Folie ${n}: Notizen zu lang (höchstens ${PPTX_LIMITS.maxNotesChars} Zeichen)`)
    if (s.takeaway !== undefined && s.takeaway !== null && typeof s.takeaway !== 'string') issues.push(`Folie ${n}: "takeaway" muss Text sein`)
    if ((s.takeaway ?? '').length > PPTX_LIMITS.maxTakeawayChars) issues.push(`Folie ${n}: Kernaussage zu lang (höchstens ${PPTX_LIMITS.maxTakeawayChars} Zeichen) — ein Satz`)
    if (s.items !== undefined && s.items !== null) {
      if (!Array.isArray(s.items)) issues.push(`Folie ${n}: "items" muss eine Liste sein`)
      else {
        if (s.items.length > PPTX_LIMITS.maxItems) issues.push(`Folie ${n}: zu viele Karten (${s.items.length}, höchstens ${PPTX_LIMITS.maxItems})`)
        s.items.forEach((it, k) => {
          const m = `Folie ${n}, Karte ${k + 1}`
          if (!it || typeof it !== 'object') return void issues.push(`${m}: kein Objekt`)
          if (typeof it.title !== 'string' || !it.title.trim()) issues.push(`${m}: "title" fehlt`)
          for (const key of ['label', 'text'] as const) if (it[key] !== undefined && it[key] !== null && typeof it[key] !== 'string') issues.push(`${m}: "${key}" muss Text sein`)
          if ((it.label ?? '').length > PPTX_LIMITS.maxItemLabelChars) issues.push(`${m}: Rubrik zu lang (höchstens ${PPTX_LIMITS.maxItemLabelChars} Zeichen)`)
          if ((it.title ?? '').length > PPTX_LIMITS.maxItemTitleChars) issues.push(`${m}: Titel zu lang (höchstens ${PPTX_LIMITS.maxItemTitleChars} Zeichen)`)
          if ((it.text ?? '').length > PPTX_LIMITS.maxItemTextChars) issues.push(`${m}: Text zu lang (höchstens ${PPTX_LIMITS.maxItemTextChars} Zeichen)`)
          if (it.highlight !== undefined && it.highlight !== null && typeof it.highlight !== 'boolean') issues.push(`${m}: "highlight" muss true oder false sein`)
        })
        if (s.items.filter(it => it && it.highlight === true).length > 1) issues.push(`Folie ${n}: höchstens eine Karte hervorheben`)
      }
    }
    if (s.image && !(input.images && input.images[s.image])) issues.push(`Folie ${n}: Bild "${s.image}" liegt nicht vor`)
  })
  const fields = input.fields ?? {}
  if (Object.keys(fields).length > PPTX_LIMITS.maxFields) issues.push(`Zu viele Felder (höchstens ${PPTX_LIMITS.maxFields})`)
  for (const [k, v] of Object.entries(fields)) {
    if (!/^[A-Za-z0-9_]+$/.test(k)) issues.push(`Feldname "${k}" ist ungültig — nur Buchstaben, Ziffern, Unterstrich`)
    if (String(v ?? '').length > PPTX_LIMITS.maxFieldChars) issues.push(`Feld "${k}" ist zu lang (höchstens ${PPTX_LIMITS.maxFieldChars} Zeichen)`)
  }
  if (Object.keys(input.images ?? {}).length > PPTX_LIMITS.maxImages) issues.push(`Zu viele Bilder (höchstens ${PPTX_LIMITS.maxImages})`)
  return issues
}

const NOTES_MASTER_XML =
  `${XML_DECL}<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>` +
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Folienbildplatzhalter 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr>' +
  '<p:spPr><a:xfrm><a:off x="381000" y="685800"/><a:ext cx="6096000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notizenplatzhalter 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr>' +
  '<p:spPr><a:xfrm><a:off x="685800" y="4343400"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
  '<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="de-DE"/><a:t>Textmasterformat bearbeiten</a:t></a:r></a:p></p:txBody></p:sp>' +
  '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>'

/** Legt einen Notizenmaster an, falls die Vorlage keinen hat (Theme = Kopie des Folien-Themes). */
async function ensureNotesMaster(pkg: Package, model: TemplateModel): Promise<string> {
  if (model.notesMasterPath) return model.notesMasterPath
  const nmPath = pkg.freePartName('ppt/notesMasters', 'notesMaster', 'xml')
  const master = model.masters[0]
  const themeRel = (await pkg.rels(master.partPath)).find(r => r.type === REL.theme)
  const themeSrc = themeRel ? await pkg.read(resolveTarget(master.partPath, themeRel.target)) : undefined
  if (!themeSrc) throw new PptxInputError(['Die Vorlage hat kein Farbschema (Theme) — Sprechernotizen können nicht angelegt werden'])
  const themePath = pkg.freePartName('ppt/theme', 'theme', 'xml')
  pkg.write(themePath, themeSrc)
  pkg.setOverride(themePath, CT.theme)
  pkg.write(nmPath, NOTES_MASTER_XML)
  pkg.setOverride(nmPath, CT.notesMaster)
  pkg.writeRels(nmPath, [{ id: 'rId1', type: REL.theme, target: relativeTarget(nmPath, themePath), external: false }])
  const rid = nextRelId(model.presRels)
  model.presRels.push({ id: rid, type: REL.notesMaster, target: relativeTarget(model.presPath, nmPath), external: false })
  pkg.writeRels(model.presPath, model.presRels)
  // Schema-Reihenfolge: sldMasterIdLst, notesMasterIdLst, handoutMasterIdLst, sldIdLst …
  let pres = model.presXml.replace(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>|<p:notesMasterIdLst\s*\/>/, '')
  const anchor = findElements(pres, 'p:sldMasterIdLst')[0]
  if (!anchor) throw new PptxInputError(['presentation.xml ohne sldMasterIdLst'])
  pres = pres.slice(0, anchor.end) + `<p:notesMasterIdLst><p:notesMasterId r:id="${rid}"/></p:notesMasterIdLst>` + pres.slice(anchor.end)
  model.presXml = pres
  pkg.write(model.presPath, pres)
  model.notesMasterPath = nmPath
  return nmPath
}

/** Platzhalter-Attribute (sldImg, body) des Notizenmasters — die Notizfolie muss dieselben type/idx tragen (Codex F15). */
function notesPhAttrs(nmXml: string): { img: string; body: string } {
  const phs = parsePlaceholders(nmXml)
  const pick = (type: string, fallback: string): string => {
    const ph = phs.find(p => p.type === type)
    return ph ? ` type="${type}" idx="${ph.idx}"` : fallback
  }
  return { img: pick('sldImg', ' type="sldImg"'), body: pick('body', ' type="body" idx="1"') }
}

function notesSlideXml(text: string, lang: string, ph: { img: string; body: string }): string {
  return (
    `${XML_DECL}<p:notes xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>` +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Folienbildplatzhalter 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph${ph.img}/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notizenplatzhalter 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph${ph.body}/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${plainParagraphsXml(text, lang)}</p:txBody></p:sp>` +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'
  )
}

export async function buildPptxFromTemplate(templateBytes: Uint8Array, input: PptxBuildInput): Promise<PptxBuildResult> {
  const issues = validateInput(input)
  if (issues.length) throw new PptxInputError(issues)
  const lang = /^[a-z]{2}(-[A-Z]{2})?$/.test(input.lang ?? '') ? input.lang! : 'de-DE'

  const pkg = await Package.load(templateBytes)
  const model = await readTemplate(pkg)

  // Layouts zuordnen und Inhalt prüfen, BEVOR irgendetwas geschrieben wird.
  const plans: SlidePlan[] = []
  input.slides.forEach((s, i) => {
    const l = resolveLayout(model, s, i)
    if (typeof l === 'string') issues.push(l)
    else plans.push({ layout: l, input: s })
  })
  // Webrecherche: eigene Quellenfolien des Modells raus, die App hängt die echte an.
  let droppedSourceSlides = 0
  const droppedTitles: string[] = []
  const earlyNotes: string[] = []
  if (input.sources) {
    for (let k = plans.length - 1; k >= 0; k--) {
      if (SOURCE_TITLE_RE.test(plans[k].input.title ?? '')) {
        droppedTitles.unshift(`„${plans[k].input.title}"`)
        plans.splice(k, 1)
        droppedSourceSlides++
      }
    }
    const seen = new Set<string>()
    const valid: PptxSource[] = []
    let rejectedSources = 0
    for (const src of input.sources) {
      const url = safeSourceUrl(src.url)
      if (!url) {
        rejectedSources++
        continue
      }
      if (seen.has(url)) continue
      seen.add(url)
      // Titel auf 110 Zeichen kürzen (sichtbar mit „…"): ein Link darf auf der Quellenfolie nicht abgeschnitten werden (Codex F35).
      const rawTitle = cleanText(String(src.title ?? '')).trim() || url
      valid.push({ title: rawTitle.length > 110 ? `${rawTitle.slice(0, 109).trimEnd()}…` : rawTitle, url, fetchedAt: String(src.fetchedAt ?? '').slice(0, 10) })
    }
    if (rejectedSources) earlyNotes.push(`${rejectedSources} abgerufene Quelle(n) mit ungültiger Adresse nicht auf der Quellenfolie`)
    if (valid.length === 0) earlyNotes.push('Ohne Webquellen: in diesem Lauf wurde keine Seite erfolgreich abgerufen')
    else {
      const layout = sourceLayout(model)
      if (!layout) issues.push('Die Vorlage hat kein Layout mit Titel und Inhaltsbereich für die Quellenfolie')
      else {
        const en = /^en/i.test(input.lang ?? '')
        const per = sourcesPerSlide(layout, valid)
        if (per === 0) issues.push('Der Inhaltsbereich der Vorlage ist zu klein für die Quellenfolie — ein Layout mit größerem Textbereich wählen')
        for (let k = 0; per > 0 && k < valid.length; k += per) {
          const title = (en ? 'Sources' : 'Quellen') + (k > 0 ? (en ? ' (continued)' : ' (Fortsetzung)') : '')
          plans.push({ layout, input: { title }, links: valid.slice(k, k + per) })
        }
      }
    }
    // Links im übrigen Deck, die nicht abgerufen wurden, sind unbelegt — sichtbar melden (Codex F30).
    const fetched = new Set(valid.map(v => v.url.replace(/\/$/, '')))
    const unverified = new Set<string>()
    const texts = [
      ...input.slides.flatMap(sl => [sl.kicker, sl.title, sl.subtitle, sl.body, sl.body2, sl.notes, sl.takeaway]),
      // Auch Karten tragen sichtbaren Text (Codex F37).
      ...input.slides.flatMap(sl => (Array.isArray(sl.items) ? sl.items : []).flatMap(it => [it?.label, it?.title, it?.text])),
      ...Object.values(input.fields ?? {})
    ]
    for (const t of texts) {
      for (const m of String(t ?? '').matchAll(/https?:\/\/[^\s)\]>"']+/gi)) {
        const u = m[0].replace(/[.,;:!?]+$/, '')
        const norm = safeSourceUrl(u)?.replace(/\/$/, '') ?? u
        if (!fetched.has(norm)) unverified.add(u.length > 80 ? `${u.slice(0, 77)}…` : u)
      }
    }
    if (unverified.size) earlyNotes.push(`Ungeprüfte Links im Folientext (nicht abgerufen): ${[...unverified].slice(0, 5).join(', ')}${unverified.size > 5 ? ' …' : ''}`)
  }
  if (plans.length === 0) issues.push('Nach dem Entfernen der selbst geschriebenen Quellenfolie bleibt keine Folie übrig')
  if (issues.length) {
    const names = model.layouts.map(l => `"${l.name}" (${l.kind})`).join(', ')
    throw new PptxInputError([...issues, `Vorhandene Layouts: ${names}`])
  }

  const images = new Map<string, ImageMeta>()
  let totalImageBytes = 0
  for (const [name, bytes] of Object.entries(input.images ?? {})) {
    if (!input.slides.some(s => s.image === name)) continue
    totalImageBytes += bytes.length
    if (bytes.length > PPTX_LIMITS.maxImageBytes) issues.push(`Bild "${name}" ist zu groß (höchstens 10 MB)`)
    const meta = readImageMeta(bytes)
    if (!meta) issues.push(`Bild "${name}" ist kein PNG oder JPEG`)
    else if (meta.width * meta.height > PPTX_LIMITS.maxImagePixels) issues.push(`Bild "${name}" hat zu viele Pixel (${meta.width} × ${meta.height})`)
    else images.set(name, meta)
  }
  if (totalImageBytes > PPTX_LIMITS.maxTotalImageBytes) issues.push(`Bilder zusammen zu groß (höchstens ${PPTX_LIMITS.maxTotalImageBytes / 1024 / 1024} MB)`)
  if (issues.length) throw new PptxInputError(issues)

  const notes: string[] = []
  const filled = new Set<string>()
  const unfilled = new Set<string>()

  // Gestaltung, die nur auf Musterfolien mit hier benutzten Layouts liegt, ehrlich melden.
  const usedLayouts = new Set(plans.map(p => p.layout.name))
  for (const d of sampleDecorations(model)) {
    if (usedLayouts.has(d.layoutName)) notes.push(`${describeDecoration(d)} — fehlt auf den neuen Folien`)
  }

  // 1. Musterfolien raus.
  const footerByLayout = new Map<string, Set<string>>()
  for (const p of plans) {
    if (!footerByLayout.has(p.layout.partPath)) footerByLayout.set(p.layout.partPath, footerTypesFor(p.layout, model, (await pkg.read(p.layout.partPath)) ?? '', notes))
  }
  await removeSampleSlides(pkg, model)

  // 2. Felder in Master und Layouts füllen (Fußzeilentexte stehen dort).
  const fields = Object.fromEntries(Object.entries(input.fields ?? {}).map(([k, v]) => [k, String(v ?? '')]))
  for (const m of model.masters) {
    const x = fillFields(m.xml, fields, filled, unfilled)
    if (x !== m.xml) pkg.write(m.partPath, x)
  }
  for (const l of model.layouts) {
    const before = (await pkg.read(l.partPath)) ?? ''
    const after = fillFields(before, fields, filled, unfilled)
    if (after !== before) {
      pkg.write(l.partPath, after)
      l.placeholders = l.placeholders.map(ph => {
        const fresh = parsePlaceholders(after).find(p => p.type === ph.type && p.idx === ph.idx)
        return fresh ? { ...ph, xml: fresh.xml } : ph
      })
    }
  }

  // 3. Folien anlegen.
  const needsNotes = plans.some(p => (p.input.notes ?? '').trim())
  const notesMasterPath = needsNotes ? await ensureNotesMaster(pkg, model) : undefined
  const notesPh = notesMasterPath ? notesPhAttrs((await pkg.read(notesMasterPath)) ?? '') : { img: '', body: '' }
  const mediaByName = new Map<string, string>()
  let nextSldId = 256
  const sldIds: string[] = []
  const imageBytes = input.images ?? {}

  for (let i = 0; i < plans.length; i++) {
    const { layout, input: s } = plans[i]
    const n = i + 1
    const slidePath = pkg.freePartName('ppt/slides', 'slide', 'xml')
    const rels: Rel[] = [{ id: 'rId1', type: REL.slideLayout, target: relativeTarget(slidePath, layout.partPath), external: false }]
    const shapes: string[] = []
    let shapeId = 2
    const used = new Set<PlaceholderInfo>()
    const take = (pred: (p: PlaceholderInfo) => boolean): PlaceholderInfo | undefined => {
      const p = layout.placeholders.find(x => !used.has(x) && pred(x))
      if (p) used.add(p)
      return p
    }

    // Titel
    const title = (s.title ?? '').trim()
    if (title) {
      const ph = take(p => p.type === 'title' || p.type === 'ctrTitle')
      if (ph) {
        const paras = [{ level: 0, text: title }]
        const ratio = ph.box && ph.fontPt ? estimateFill(paras, ph.box, ph.fontPt) : 0
        if (ratio > PPTX_LIMITS.rejectFillRatio) issues.push(`Folie ${n}: Titel passt nicht in den Titelbereich — kürzer formulieren`)
        shapes.push(phSpXml(shapeId++, ph, bodyPrXml(autofitFor(ratio)), `<a:p>${runsXml(title, lang)}</a:p>`))
      } else issues.push(`Folie ${n}: Layout "${layout.name}" hat keinen Titelbereich — anderes Layout wählen oder Titel weglassen`)
    }

    // Dachzeile
    const kicker = (s.kicker ?? '').trim()
    if (kicker) {
      const ph = take(isKicker)
      if (ph) shapes.push(phSpXml(shapeId++, ph, '<a:bodyPr/>', `<a:p><a:pPr marL="0" indent="0"><a:buNone/></a:pPr>${runsXml(kicker, lang)}</a:p>`))
      else issues.push(`Folie ${n}: Layout "${layout.name}" hat keine Dachzeile — kicker weglassen oder anderes Layout wählen`)
    }

    // Untertitel: subTitle-Platzhalter, bei Abschnitts-/Titel-Layouts sonst der Textplatzhalter.
    const subtitle = (s.subtitle ?? '').trim()
    if (subtitle) {
      const ph = take(p => p.type === 'subTitle') ?? (['section', 'title'].includes(layout.kind) ? take(p => CONTENT_TYPES_PH.has(p.type) && !isSpecial(p)) : undefined)
      if (ph) shapes.push(phSpXml(shapeId++, ph, '<a:bodyPr/>', plainParagraphsXml(subtitle, lang)))
      else issues.push(`Folie ${n}: Layout "${layout.name}" hat keinen Untertitelbereich — Untertitel in body schreiben oder anderes Layout wählen`)
    }

    // Inhalt
    const slots = contentSlots(layout).filter(p => !used.has(p))
    // Quellenfolie: ein Absatz je Quelle, der Titel ist ein echter Link (externe Beziehung).
    const links = plans[i].links
    if (links) {
      const ph = slots[0]
      if (!ph) issues.push('Quellenfolie: das Layout hat keinen Inhaltsbereich')
      if (ph) {
        used.add(ph)
        const paras = links
          .map(src => {
            const rid = nextRelId(rels)
            rels.push({ id: rid, type: REL.hyperlink, target: src.url, external: true })
            const host = (() => {
              try {
                return new URL(src.url).host.replace(/^www\./, '')
              } catch {
                return ''
              }
            })()
            const date = /^\d{4}-\d{2}-\d{2}$/.test(src.fetchedAt) ? src.fetchedAt.split('-').reverse().join('.') : ''
            const suffix = [host, date ? `${/^en/i.test(lang) ? 'retrieved' : 'abgerufen am'} ${date}` : ''].filter(Boolean).join(' · ')
            return (
              `<a:p><a:r><a:rPr lang="${escapeXml(lang)}" dirty="0"><a:hlinkClick r:id="${rid}"/></a:rPr><a:t>${escapeXml(src.title)}</a:t></a:r>` +
              (suffix ? `<a:r><a:rPr lang="${escapeXml(lang)}" dirty="0"/><a:t>${escapeXml(` — ${suffix}`)}</a:t></a:r>` : '') +
              '</a:p>'
            )
          })
          .join('')
        const ratio = ph.box && ph.fontPt ? estimateFill(links.map(l => ({ level: 0, text: `${l.title} — ${l.url.slice(0, 40)}` })), ph.box, ph.fontPt) : 0
        shapes.push(phSpXml(shapeId++, ph, bodyPrXml(autofitFor(Math.min(ratio, PPTX_LIMITS.rejectFillRatio))), paras))
      }
    }

    const texts = [s.body, s.body2].map(t => (t ?? '').trim())
    let slotIdx = 0
    texts.forEach((text, ti) => {
      if (!text) return
      const ph = slots[slotIdx++]
      if (!ph) {
        issues.push(`Folie ${n}: Layout "${layout.name}" hat ${ti === 0 ? 'keinen Inhaltsbereich' : 'keinen zweiten Inhaltsbereich'} — anderes Layout wählen`)
        return
      }
      used.add(ph)
      const paras = parseBodyText(text)
      const ratio = ph.box && ph.fontPt ? estimateFill(paras, ph.box, ph.fontPt) : 0
      if (ratio > PPTX_LIMITS.rejectFillRatio) {
        issues.push(`Folie ${n}: zu viel Text (geschätzt ${Math.round(ratio * 100)} % des Platzes) — auf zwei Folien aufteilen oder kürzen`)
        return
      }
      const fit = autofitFor(ratio)
      if (fit) notes.push(`Folie ${n}: Schrift auf ${Math.round(fit.scale * 100)} % verkleinert`)
      shapes.push(phSpXml(shapeId++, ph, bodyPrXml(fit), bodyParagraphsXml(paras, lang)))
    })

    // Karten / Schritte / Kennzahlen: je Eintrag ein Platz; Ebene 1 = Rubrik, 2 = Titel
    // (bei Kennzahlen die Zahl), 3 = Text — die Optik der Ebenen legt die Vorlage fest.
    const items = Array.isArray(s.items) ? s.items : []
    // Schritt-Layouts zeigen Flächen und Ziffern fest — auch ohne Einträge wären sie sichtbar leer (Codex F42).
    if (!items.length && needsExactCount(layout)) {
      issues.push(`Folie ${n}: Layout "${layout.name}" zeigt fest ${itemSlots(layout).length} nummerierte Schritte — items mit genau so vielen Schritten übergeben`)
    }
    if (items.length) {
      const slotsI = itemSlots(layout)
      if (slotsI.length === 0) issues.push(`Folie ${n}: Layout "${layout.name}" hat keine Karten-Plätze — ein Karten-, Schritte- oder Kennzahlen-Layout wählen`)
      else if (items.length > slotsI.length) issues.push(`Folie ${n}: ${items.length} Karten, Layout "${layout.name}" hat nur ${slotsI.length} Plätze`)
      else if (needsExactCount(layout) && items.length !== slotsI.length) {
        issues.push(`Folie ${n}: Layout "${layout.name}" zeigt fest ${slotsI.length} nummerierte Schritte, übergeben sind ${items.length} — ein Layout mit passender Schrittzahl wählen`)
      }
      else {
        if (items.length < slotsI.length) notes.push(`Folie ${n}: ${items.length} von ${slotsI.length} Plätzen belegt`)
        items.forEach((it, k) => {
          const ph = slotsI[k]
          used.add(ph)
          const [labelPt, titlePt, textPt] = [0, 1, 2].map(j => ph.levelPts?.[j] ?? ph.fontPt ?? 14)
          const textLines = (it.text ?? '').replace(/\r\n?/g, '\n').split('\n').map(l => l.trim()).filter(Boolean).map(l => l.replace(/^[-*•–]\s+/, '– '))
          const paras =
            (it.label?.trim() ? `<a:p><a:pPr lvl="0"/>${runsXml(it.label.trim(), lang)}</a:p>` : '') +
            `<a:p><a:pPr lvl="1"/>${runsXml(it.title.trim(), lang)}</a:p>` +
            textLines.map(l => `<a:p><a:pPr lvl="2"/>${runsXml(l, lang)}</a:p>`).join('')
          let ratio = 0
          if (ph.box) {
            const part = (txt: string[], pt: number): number => (txt.length ? estimateFill(txt.map(t => ({ level: 0, text: t })), ph.box!, pt) : 0)
            ratio = part(it.label?.trim() ? [it.label] : [], labelPt) + part([it.title], titlePt) + part(textLines, textPt)
          }
          if (ratio > PPTX_LIMITS.rejectFillRatio) {
            issues.push(`Folie ${n}, Karte ${k + 1}: zu viel Text (geschätzt ${Math.round(ratio * 100)} %) — kürzen oder auf mehr Karten verteilen`)
            return
          }
          const fit = autofitFor(ratio)
          if (fit) notes.push(`Folie ${n}, Karte ${k + 1}: Schrift auf ${Math.round(fit.scale * 100)} % verkleinert`)
          // Hervorhebung: helle Stufe der Akzentfarbe der Vorlage, nicht fest verdrahtet. Ist der
          // Platz im Layout durchsichtig (Fläche + Ziffer zeichnet das Layout, z. B. Schritte),
          // würde eine Füllung die Ziffer verdecken — dort ein Rahmen in der Akzentfarbe (Codex F39).
          // Füllung des Platzes selbst — die Linie (a:ln) trägt oft auch ein noFill und zählt nicht.
          const ownFill = (firstElement(ph.xml, 'p:spPr') ?? '').replace(/<a:ln[\s>][\s\S]*?<\/a:ln>|<a:ln\s*\/>/g, '')
          const transparent = /<a:noFill\/>/.test(ownFill)
          const spPr = it.highlight === true
            ? transparent
              ? '<p:spPr><a:noFill/><a:ln w="28575"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></p:spPr>'
              : '<p:spPr><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="13000"/><a:lumOff val="87000"/><a:satMod val="55000"/></a:schemeClr></a:solidFill></p:spPr>'
            : '<p:spPr/>'
          shapes.push(phSpXml(shapeId++, ph, bodyPrXml(fit), paras, spPr))
        })
      }
    }

    // Kernaussage (Balken)
    const takeaway = (s.takeaway ?? '').trim()
    if (takeaway) {
      const ph = take(isTakeaway)
      if (!ph) issues.push(`Folie ${n}: Layout "${layout.name}" hat keinen Platz für eine Kernaussage — Layout mit „Kernaussage" wählen oder takeaway weglassen`)
      else {
        const ratio = ph.box && ph.fontPt ? estimateFill([{ level: 0, text: takeaway }], ph.box, ph.fontPt) : 0
        if (ratio > PPTX_LIMITS.rejectFillRatio) issues.push(`Folie ${n}: Kernaussage zu lang für den Balken — ein kurzer Satz`)
        else shapes.push(phSpXml(shapeId++, ph, bodyPrXml(autofitFor(ratio)), plainParagraphsXml(takeaway, lang)))
      }
    }

    // Bild
    if (s.image) {
      const meta = images.get(s.image)!
      let mediaPath = mediaByName.get(s.image)
      if (!mediaPath) {
        mediaPath = pkg.freePartName('ppt/media', 'mgimage', meta.ext === 'png' ? 'png' : 'jpeg')
        pkg.write(mediaPath, imageBytes[s.image])
        pkg.ensureDefault(meta.ext === 'png' ? 'png' : 'jpeg', meta.ext === 'png' ? 'image/png' : 'image/jpeg')
        mediaByName.set(s.image, mediaPath)
      }
      const rid = nextRelId(rels)
      rels.push({ id: rid, type: REL.image, target: relativeTarget(slidePath, mediaPath), external: false })
      const picPh = take(p => p.type === 'pic')
      const objPh = picPh ? undefined : take(p => p.type === 'obj')
      if (picPh) shapes.push(picXml(shapeId++, rid, s.image, picPh, meta, picPh.box, 'fill'))
      else if (objPh) shapes.push(picXml(shapeId++, rid, s.image, objPh, meta, objPh.box, 'contain'))
      else {
        // Kein freier Platzhalter: nur auf Layouts ohne Textinhalt als freies Bild
        // in die Fläche des Master-Textbereichs — nie über vorhandenen Text legen.
        const hasText = texts.some(Boolean)
        const area = model.masters[layout.masterIndex]?.placeholders.find(p => p.type === 'body')?.box
        if (hasText || !area) issues.push(`Folie ${n}: Layout "${layout.name}" hat keinen Platz für ein Bild — ein Layout mit Bild- oder zweitem Inhaltsbereich wählen`)
        else shapes.push(picXml(shapeId++, rid, s.image, null, meta, containBox(meta, area), 'fill'))
      }
    }

    // Fußzeile
    const footerTypes = footerByLayout.get(layout.partPath) ?? new Set<string>()
    for (const ph of layout.placeholders) {
      if (!footerTypes.has(ph.type) || used.has(ph)) continue
      const sp = footerSpXml(shapeId, ph)
      if (sp) {
        shapes.push(sp)
        shapeId++
      }
    }

    const slideXml =
      `${XML_DECL}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>` +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      shapes.join('') +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'

    // Notizen
    const noteText = (s.notes ?? '').trim()
    if (noteText && notesMasterPath) {
      const notesPath = pkg.freePartName('ppt/notesSlides', 'notesSlide', 'xml')
      pkg.write(notesPath, notesSlideXml(noteText, lang, notesPh))
      pkg.setOverride(notesPath, CT.notesSlide)
      pkg.writeRels(notesPath, [
        { id: 'rId1', type: REL.notesMaster, target: relativeTarget(notesPath, notesMasterPath), external: false },
        { id: 'rId2', type: REL.slide, target: relativeTarget(notesPath, slidePath), external: false }
      ])
      rels.push({ id: nextRelId(rels), type: REL.notesSlide, target: relativeTarget(slidePath, notesPath), external: false })
    }

    pkg.write(slidePath, slideXml)
    pkg.writeRels(slidePath, rels)
    pkg.setOverride(slidePath, CT.slide)
    const presRid = nextRelId(model.presRels)
    model.presRels.push({ id: presRid, type: REL.slide, target: relativeTarget(model.presPath, slidePath), external: false })
    sldIds.push(`<p:sldId id="${nextSldId++}" r:id="${presRid}"/>`)
  }
  if (issues.length) throw new PptxInputError(issues)

  // 4. presentation.xml: Folienliste eintragen (Schema-Reihenfolge beachten).
  let pres = model.presXml
  const lst = findElements(pres, 'p:sldIdLst')[0]
  const lstXml = `<p:sldIdLst>${sldIds.join('')}</p:sldIdLst>`
  if (lst) pres = pres.slice(0, lst.start) + lstXml + pres.slice(lst.end)
  else {
    const anchor = findElements(pres, 'p:handoutMasterIdLst')[0] ?? findElements(pres, 'p:notesMasterIdLst')[0] ?? findElements(pres, 'p:sldMasterIdLst')[0]
    if (!anchor) throw new PptxInputError(['presentation.xml ohne sldMasterIdLst'])
    pres = pres.slice(0, anchor.end) + lstXml + pres.slice(anchor.end)
  }
  pkg.write(model.presPath, pres)
  pkg.writeRels(model.presPath, model.presRels)

  // 5. .potx/.ppsx → normale Präsentation.
  const mainCt = pkg.contentTypeOf(model.presPath)
  if (mainCt === CT.template || mainCt === CT.slideshow) pkg.setOverride(model.presPath, CT.presentation)

  // 6. docProps/app.xml: Zähler nachziehen (PowerPoint korrigiert den Rest beim Speichern).
  const app = await pkg.read('docProps/app.xml')
  if (app) {
    const notesCount = plans.filter(p => (p.input.notes ?? '').trim()).length
    pkg.write('docProps/app.xml', app.replace(/<Slides>\d+<\/Slides>/, `<Slides>${plans.length}</Slides>`).replace(/<Notes>\d+<\/Notes>/, `<Notes>${notesCount}</Notes>`))
  }

  if (unfilled.size) notes.push(`Felder ohne Wert (entfernt): ${[...unfilled].join(', ')}`)
  if (droppedSourceSlides) notes.push(`Eigene Quellenfolie(n) des Modells entfernt und durch die belegte Quellenliste ersetzt: ${droppedTitles.join(', ')}`)
  notes.push(...earlyNotes)
  const sourceSlides = plans.filter(p => p.links).length
  if (sourceSlides) notes.push(`${sourceSlides === 1 ? 'Quellenfolie' : `${sourceSlides} Quellenfolien`} angehängt`)
  const bytes = await pkg.generate()
  // Selbstkontrolle vor der Ausgabe (Codex F01): lieber kein Ergebnis als eines,
  // das PowerPoint reparieren will.
  const problems = await checkPptxConsistency(bytes)
  if (problems.length) throw new Error(`Interner Fehler beim Erzeugen (bitte melden): ${problems.slice(0, 5).join('; ')}`)
  return { bytes, slideCount: plans.length, notes, filled: [...filled], unfilled: [...unfilled] }
}

// ── Konsistenzprüfung (Tests und Selbstkontrolle) ──────────────────────────

/**
 * Prüft die Verweise eines PPTX-Pakets: jede interne Beziehung zeigt auf einen
 * existierenden Part, jeder Part hat einen Content-Type, Folien-IDs und r:ids
 * sind eindeutig, jede Folie hat genau ein Layout. Leere Liste = konsistent.
 */
export async function checkPptxConsistency(bytes: Uint8Array): Promise<string[]> {
  const problems: string[] = []
  const pkg = await Package.load(bytes)
  const paths = new Set(pkg.paths())
  for (const p of paths) {
    if (p.endsWith('.rels') || p === '[Content_Types].xml') continue
    if (!pkg.contentTypeOf(p)) problems.push(`kein Content-Type: ${p}`)
  }
  for (const o of findElements(pkg.contentTypes, 'Override')) {
    const pn = (attr(openTag(o.xml), 'PartName') ?? '').replace(/^\//, '')
    if (!paths.has(pn)) problems.push(`Override ohne Part: ${pn}`)
  }
  for (const p of paths) {
    if (!p.endsWith('.rels')) continue
    const owner = p === '_rels/.rels' ? '' : p.replace(/_rels\/([^/]+)\.rels$/, '$1')
    if (owner && !paths.has(owner)) problems.push(`Rels ohne Part: ${p}`)
    const rels = parseRels(await pkg.read(p))
    const ids = new Set<string>()
    for (const r of rels) {
      if (ids.has(r.id)) problems.push(`doppelte Rel-ID ${r.id} in ${p}`)
      ids.add(r.id)
      if (!r.external && !paths.has(resolveTarget(owner, r.target))) problems.push(`Rel ins Leere: ${p} ${r.id} → ${r.target}`)
    }
    // Jede r:id im Part muss in seinen Rels stehen.
    if (owner && owner.endsWith('.xml')) {
      const xml = (await pkg.read(owner)) ?? ''
      for (const m of xml.matchAll(/\br:(?:id|embed|link|pict)="([^"]+)"/g)) {
        if (!ids.has(m[1])) problems.push(`unbekannte r:id ${m[1]} in ${owner}`)
      }
    }
  }
  const presPath = await findPresentationPart(pkg)
  const pres = (await pkg.read(presPath)) ?? ''
  const sldIds = findElements(pres, 'p:sldId').map(e => attr(openTag(e.xml), 'id') ?? '')
  if (new Set(sldIds).size !== sldIds.length) problems.push('doppelte Folien-ID in sldIdLst')
  if (sldIds.some(id => Number(id) < 256 || Number(id) >= 2147483648)) problems.push('Folien-ID außerhalb 256…2147483647')
  for (const sec of pres.matchAll(/<p14:sldId\s+id="(\d+)"/g)) {
    if (!sldIds.includes(sec[1])) problems.push(`Abschnitt zeigt auf fehlende Folie ${sec[1]}`)
  }
  for (const p of paths) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(p)) continue
    const layouts = (await pkg.rels(p)).filter(r => r.type === REL.slideLayout)
    if (layouts.length !== 1) problems.push(`${p} hat ${layouts.length} Layouts`)
    const xml = (await pkg.read(p)) ?? ''
    const shapeIds = [...xml.matchAll(/<p:cNvPr\s+id="(\d+)"/g)].map(m => m[1])
    if (new Set(shapeIds).size !== shapeIds.length) problems.push(`${p}: doppelte Shape-IDs`)
  }
  return problems
}
