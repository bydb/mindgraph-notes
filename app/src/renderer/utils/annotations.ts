// Lesemodus-Annotationen (Zotero-artig).
//
// Beim Markieren von Text im Lesen-Modus wird eine Annotation in eine co-lokierte
// „<Notiz> - Annotationen.md" angehängt — mit Zitat, Farbe und einer berechneten
// Seitenangabe. Die OCR-Quelle bleibt unangetastet (Overlay-Modell): Highlights sind
// reine Anzeige, die Wahrheit liegt in der Sammeldatei. Jeder Block trägt einen
// versteckten Anker-Kommentar (Quote + Kontext + n-tes Vorkommen), damit Highlights
// später (Phase 2) robust re-verankert werden können.

export type AnnoLabelKey = 'anno.colorYellow' | 'anno.colorGreen' | 'anno.colorBlue' | 'anno.colorRed'

export interface AnnoColorDef {
  key: AnnoColor
  /** Klartext-Farbname für den Annotations-Block (keine Emojis) */
  name: string
  /** Übersetzungs-Key für das Menü-Label (muss in translations.ts existieren) */
  labelKey: AnnoLabelKey
  /** CSS-Klassensuffix → .anno-mark.anno-<key> */
  className: string
}

export type AnnoColor = 'yellow' | 'green' | 'blue' | 'red'

export const ANNO_COLORS: AnnoColorDef[] = [
  { key: 'yellow', name: 'Gelb', labelKey: 'anno.colorYellow', className: 'anno-yellow' },
  { key: 'green', name: 'Grün', labelKey: 'anno.colorGreen', className: 'anno-green' },
  { key: 'blue', name: 'Blau', labelKey: 'anno.colorBlue', className: 'anno-blue' },
  { key: 'red', name: 'Rot', labelKey: 'anno.colorRed', className: 'anno-red' }
]

export interface AnnotationAnchor {
  id: string
  color: AnnoColor
  page: number | null
  quote: string
  /** ~30 Zeichen Kontext vor dem Zitat (Re-Anchoring) */
  prefix: string
  /** ~30 Zeichen Kontext nach dem Zitat (Re-Anchoring) */
  suffix: string
  /** n-tes Vorkommen des Zitats in der Quelle (1-basiert) */
  occ: number
}

const CONTEXT_LEN = 30

/**
 * Zählt die `<hr>`-Trenner vor dem Selektions-Start. Die Vision-OCR setzt zwischen
 * je zwei PDF-Seiten eine horizontale Linie → Seite = Trenner davor + 1.
 * Gibt null zurück, wenn die Notiz gar keine Trenner hat (keine paginierte OCR-Quelle).
 */
export function computePageFromRange(root: HTMLElement, range: Range): number | null {
  const hrs = Array.from(root.querySelectorAll('hr'))
  if (hrs.length === 0) return null
  const startNode = range.startContainer
  let count = 0
  for (const hr of hrs) {
    // startNode FOLGT hr ⇒ hr liegt vor der Selektion
    if (hr.compareDocumentPosition(startNode) & Node.DOCUMENT_POSITION_FOLLOWING) count++
  }
  return count + 1
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Findet das Zitat in der rohen Markdown-Quelle (whitespace-tolerant) und liefert
 * Zeilennummer + Kontext + Vorkommens-Index. Best-effort: bei keinem Treffer null.
 */
export function findQuoteLocation(
  content: string,
  quote: string
): { line: number; prefix: string; suffix: string; occ: number } | null {
  const trimmed = quote.trim()
  if (!trimmed) return null

  // Whitespace-Läufe im Zitat auf \s+ aufweichen (OCR-Notiz hat oft andere Umbrüche)
  const pattern = trimmed
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s+')

  let re: RegExp
  try {
    re = new RegExp(pattern)
  } catch {
    return null
  }

  const m = re.exec(content)
  if (!m || m.index < 0) return null

  const index = m.index
  const matchLen = m[0].length
  const line = content.slice(0, index).split('\n').length
  const prefix = content.slice(Math.max(0, index - CONTEXT_LEN), index).replace(/\s+/g, ' ')
  const suffix = content.slice(index + matchLen, index + matchLen + CONTEXT_LEN).replace(/\s+/g, ' ')

  // n-tes Vorkommen bestimmen
  let occ = 1
  const globalRe = new RegExp(pattern, 'g')
  let g: RegExpExecArray | null
  while ((g = globalRe.exec(content)) !== null) {
    if (g.index >= index) break
    occ++
    if (g.index === globalRe.lastIndex) globalRe.lastIndex++ // Endlosschleife bei Leer-Match vermeiden
  }

  return { line, prefix, suffix, occ }
}

/** Liest ein einfaches `feld: wert` aus dem Frontmatter (entfernt umgebende Quotes). */
export function getFrontmatterField(content: string, field: string): string | null {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fm) return null
  const line = fm[1].split('\n').find(l => l.trim().startsWith(`${field}:`))
  if (!line) return null
  const value = line.slice(line.indexOf(':') + 1).trim()
  return value.replace(/^["']|["']$/g, '') || null
}

/** Dateiname (ohne Pfad/Endung) eines Vault-relativen Pfads. */
export function noteBaseName(noteRelPath: string): string {
  const file = noteRelPath.split('/').pop() || noteRelPath
  return file.replace(/\.md$/i, '')
}

/** Co-lokierter Pfad der Annotationen-Sammeldatei zu einer Notiz. */
export function annotationRelPathFor(noteRelPath: string): string {
  const slash = noteRelPath.lastIndexOf('/')
  const dir = slash >= 0 ? noteRelPath.slice(0, slash + 1) : ''
  return `${dir}${noteBaseName(noteRelPath)} - Annotationen.md`
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Frontmatter + Kopf für eine frisch angelegte Annotationen-Datei. */
export function buildAnnotationFileHeader(opts: {
  sourceNoteName: string
  sourcePdf: string | null
  now: Date
}): string {
  const sourceLine = opts.sourcePdf ? `source: "${opts.sourcePdf}"\n` : ''
  return (
    `---\n` +
    `type: annotations\n` +
    `source-note: "[[${opts.sourceNoteName}]]"\n` +
    sourceLine +
    `created: ${opts.now.toISOString()}\n` +
    `---\n\n` +
    `# Annotationen – ${opts.sourceNoteName}\n\n` +
    `> [!info] Markierungen aus dem Lesen-Modus. Jeder Eintrag verlinkt zurück auf die Quelle.\n`
  )
}

/** Ein Annotations-Block: Zitat-Callout + Rückverlinkung + versteckter Anker. */
export function buildAnnotationBlock(opts: {
  quote: string
  color: AnnoColorDef
  page: number | null
  sourceNoteName: string
  anchor: AnnotationAnchor
  now: Date
}): string {
  const quoteLines = opts.quote
    .trim()
    .split('\n')
    .map(l => `> ${l.trim()}`)
    .join('\n')

  const pageLabel = opts.page != null ? `S. ${opts.page} · ` : ''
  const cite = opts.page != null
    ? `> — [[${opts.sourceNoteName}]], S. ${opts.page}`
    : `> — [[${opts.sourceNoteName}]]`

  const anchorJson = JSON.stringify(opts.anchor)

  return (
    `\n> [!quote]+ ${pageLabel}${opts.color.name} · ${formatDate(opts.now)}\n` +
    `${quoteLines}\n` +
    `${cite}\n` +
    `<!-- anno: ${anchorJson} -->\n`
  )
}

/** Kurz-ID für einen Anker (Zeitstempel-basiert, keine Krypto nötig). */
export function makeAnnotationId(now: Date): string {
  return `a${now.getTime().toString(36)}`
}

/** CSS-Klassensuffix zu einer Farbe (Fallback gelb). */
export function classNameForColor(color: AnnoColor): string {
  return ANNO_COLORS.find(c => c.key === color)?.className ?? 'anno-yellow'
}

/** Liest alle versteckten `<!-- anno: {json} -->`-Anker aus einer Annotationen-Datei. */
export function parseAnnotationAnchors(fileContent: string): AnnotationAnchor[] {
  const out: AnnotationAnchor[] = []
  const re = /<!--\s*anno:\s*(\{.*?\})\s*-->/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fileContent)) !== null) {
    try {
      const obj = JSON.parse(m[1])
      if (obj && typeof obj.quote === 'string') out.push(obj as AnnotationAnchor)
    } catch {
      /* defekter Anker — überspringen */
    }
  }
  return out
}

// Umschließt das `occ`-te Vorkommen von `quote` (innerhalb EINES Textknotens) mit einem
// <mark>. Best-effort: Zitate, die über Inline-Elemente (Links/Fett) gesplittet sind,
// werden übersprungen — bei reinen OCR-Absätzen ist das praktisch nie der Fall.
function wrapNthOccurrence(
  root: HTMLElement,
  quote: string,
  occ: number,
  className: string,
  annoId: string
): boolean {
  if (!quote) return false
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let count = 0
  let node = walker.nextNode()
  while (node) {
    const text = node.nodeValue || ''
    let from = 0
    let idx = text.indexOf(quote, from)
    while (idx !== -1) {
      count++
      if (count === occ) {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + quote.length)
        const mark = document.createElement('mark')
        mark.className = `anno-mark ${className}`
        mark.dataset.annoId = annoId
        range.surroundContents(mark) // innerhalb eines Textknotens immer zulässig
        return true
      }
      from = idx + quote.length
      idx = text.indexOf(quote, from)
    }
    node = walker.nextNode()
  }
  return false
}

/**
 * Wendet gespeicherte Annotationen als Highlight-Overlay auf das gerenderte
 * Preview-DOM an. Gibt die Anzahl erfolgreich verankerter Highlights zurück.
 */
export function applyStoredHighlights(root: HTMLElement, anchors: AnnotationAnchor[]): number {
  let applied = 0
  for (const a of anchors) {
    try {
      if (wrapNthOccurrence(root, (a.quote || '').trim(), a.occ || 1, classNameForColor(a.color), a.id)) {
        applied++
      }
    } catch {
      /* einzelnes Highlight nicht verankerbar — Rest weiter anwenden */
    }
  }
  return applied
}
