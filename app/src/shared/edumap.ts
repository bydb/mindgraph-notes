// Edumaps-Export für den Notiz-Agenten (Werkzeug `write_edumap`, Skill „Edumap erstellen").
//
// Edumaps (edumaps.de, in Hessen über das Edupool der Medienzentren) importiert Maps
// als JSON: `mapdata` (Kopf), `paths` (Spalten) mit `boxes`, dazu `labels` (frei
// platzierte Hinweiszettel). Das Format ist nicht öffentlich dokumentiert — das
// Gerüst hier folgt einem echten Export (Pinnwand-Format, 09/2026). Felder, deren
// Bedeutung wir nicht kennen (`flags` einer Box, `mapbg`, `extras`), werden wie im
// Export gesetzt und NIE vom Modell bestimmt.
//
// Wie bei write_html liefert das Modell nur Inhalt (Titel, Spalten, Boxen), das
// Dokument baut die App. Grenzen für Spalten, Boxen und Textlänge sind Absicht:
// eine Edumap soll nie überladen sein. Überschreitungen werden abgelehnt statt
// still gekürzt — das Modell soll selbst entscheiden, was wegfällt.

export const EDUMAP_LIMITS = {
  maxColumns: 8,
  maxBoxesPerColumn: 10,
  maxTotalBoxes: 40,
  maxTitleChars: 120,
  maxAnnotationChars: 400,
  maxBoxContentChars: 800,
  maxHintChars: 200
} as const

// Schrift der Map: Edumaps kennt nur Nummern (edu_get_fontname im Edumaps-Skript,
// gelesen 30.09.2026): 0 Hanken Grotesk, 6 Georgia, 9 Times New Roman, 11 Verdana,
// 12 OpenDyslexic, 13 Atkinson Hyperlegible, 14 Lexend, 18 Arial. Standard ist
// Arial (Nutzerentscheidung) — der Referenz-Export hatte 6 (Georgia).
export const EDUMAP_FONT_ARIAL = '18'

// Farben aus dem Referenz-Export — Namen für das Modell, Hex für Edumaps.
export const EDUMAP_COLORS: Record<string, string> = {
  orange: '#E49600',
  blau: '#4267F5',
  rot: '#FF3125',
  gruen: '#2ECC40',
  mint: '#93E9BE',
  gelb: '#FFD700'
}

export interface EdumapBoxInput {
  title: string
  content?: string
  color?: string
}

export interface EdumapColumnInput {
  title: string
  /** Arbeitsauftrag/Leitfrage unter dem Spaltentitel. Pflicht bei leeren Spalten. */
  annotation?: string
  color?: string
  boxes?: EdumapBoxInput[]
}

export interface EdumapInput {
  title: string
  columns: EdumapColumnInput[]
  /** Optionaler Hinweiszettel oberhalb der Spalten (z. B. Mitmach-Regel). */
  hint?: string
  lang?: string
}

export interface EdumapBuildResult {
  json: string
  columnCount: number
  boxCount: number
  /** Spalten ohne Boxen — Mitmach-Spalten, die Lernende füllen. */
  openColumnCount: number
  /** Nicht fatale Hinweise (z. B. unbekannte Farbe ignoriert). */
  notes: string[]
}

export class EdumapInputError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join('; '))
    this.name = 'EdumapInputError'
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// Farbname oder #RRGGBB → Hex; alles andere → null (mit Hinweis).
export function resolveEdumapColor(raw: unknown, notes: string[], where: string): string | null {
  const value = str(raw).trim()
  if (!value) return null
  const key = value.toLowerCase().replace('ü', 'ue')
  if (EDUMAP_COLORS[key]) return EDUMAP_COLORS[key]
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase()
  notes.push(`Farbe „${value}" bei ${where} unbekannt — ohne Farbe gesetzt`)
  return null
}

// Box-Text in die Edumaps-Schreibweise bringen. Edumaps kennt eine Markdown-ähnliche
// Syntax (**fett**, Listen mit „- "), Links mit Beschriftung aber als {Text}{URL}.
// Überschriften sind nicht belegt — sie werden zu einer fetten Zeile.
export function toEdumapText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => {
      const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
      if (heading) return `**${heading[1]}**`
      return line
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '{$1}{$2}')
        .replace(/^(\s*)\*\s+/, '$1- ')
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function emptyBox(title: string, content: string | null, color: string | null) {
  return {
    title,
    content,
    subject: null,
    booktime: null,
    booklimit: '0',
    color,
    flags: '0',
    position: null,
    showdate: null,
    extras: null
  }
}

export function buildEdumap(input: EdumapInput): EdumapBuildResult {
  const L = EDUMAP_LIMITS
  const issues: string[] = []
  const notes: string[] = []

  const title = str(input.title).trim()
  if (!title) issues.push('Titel der Map fehlt')
  else if (title.length > L.maxTitleChars) issues.push(`Titel der Map ist länger als ${L.maxTitleChars} Zeichen`)

  const columns = Array.isArray(input.columns) ? input.columns : []
  if (columns.length === 0) issues.push('Die Map braucht mindestens eine Spalte')
  if (columns.length > L.maxColumns) {
    issues.push(`${columns.length} Spalten — höchstens ${L.maxColumns}. Zusammenfassen oder weglassen, eine Edumap soll nicht überladen sein`)
  }

  let boxCount = 0
  let openColumnCount = 0
  const paths = columns.slice(0, L.maxColumns).map((col, ci) => {
    const where = `Spalte ${ci + 1}`
    const colTitle = str(col?.title).trim()
    const annotation = str(col?.annotation).trim()
    if (!colTitle) issues.push(`${where}: Titel fehlt`)
    else if (colTitle.length > L.maxTitleChars) issues.push(`${where}: Titel länger als ${L.maxTitleChars} Zeichen`)
    if (annotation.length > L.maxAnnotationChars) {
      issues.push(`${where}: Arbeitsauftrag länger als ${L.maxAnnotationChars} Zeichen — kürzer formulieren`)
    }
    const boxesIn = Array.isArray(col?.boxes) ? col.boxes : []
    if (boxesIn.length === 0) {
      openColumnCount++
      if (!annotation) issues.push(`${where} („${colTitle}") ist leer und hat keinen Arbeitsauftrag — leere Spalten brauchen eine Leitfrage in "annotation"`)
    }
    if (boxesIn.length > L.maxBoxesPerColumn) {
      issues.push(`${where}: ${boxesIn.length} Boxen — höchstens ${L.maxBoxesPerColumn} pro Spalte`)
    }
    const boxes = boxesIn.slice(0, L.maxBoxesPerColumn).map((box, bi) => {
      const bWhere = `${where}, Box ${bi + 1}`
      const bTitle = str(box?.title).trim()
      const content = toEdumapText(str(box?.content))
      if (!bTitle) issues.push(`${bWhere}: Titel fehlt`)
      else if (bTitle.length > L.maxTitleChars) issues.push(`${bWhere}: Titel länger als ${L.maxTitleChars} Zeichen`)
      if (content.length > L.maxBoxContentChars) {
        issues.push(`${bWhere} („${bTitle}"): ${content.length} Zeichen — höchstens ${L.maxBoxContentChars}. Auf das Wesentliche kürzen oder auf zwei Boxen verteilen`)
      }
      return emptyBox(bTitle, content || null, resolveEdumapColor(box?.color, notes, bWhere))
    })
    boxCount += boxesIn.length
    return {
      title: colTitle,
      showdate: null,
      annotation: annotation ? toEdumapText(annotation) : null,
      color: resolveEdumapColor(col?.color, notes, where) ?? EDUMAP_COLORS.blau,
      flags: '0',
      extras: null,
      boxes
    }
  })
  if (boxCount > L.maxTotalBoxes) {
    issues.push(`${boxCount} Boxen insgesamt — höchstens ${L.maxTotalBoxes}. Eine Edumap soll nicht überladen sein`)
  }

  const hint = str(input.hint).trim()
  if (hint.length > L.maxHintChars) issues.push(`Hinweis länger als ${L.maxHintChars} Zeichen`)

  if (issues.length > 0) throw new EdumapInputError(issues)

  const lang = str(input.lang).trim().toLowerCase() === 'en' ? 'en' : 'de'
  const map = {
    // Kopf wie im Referenz-Export (Pinnwand, Standard-Hintergrund), Schrift Arial.
    mapdata: {
      title,
      tags: null,
      mapbg: 'i26',
      mapfont: EDUMAP_FONT_ARIAL,
      mapformat: '0',
      maptype: '0',
      flags: '3',
      language: lang,
      extras: 'fix rae fh'
    },
    paths,
    labels: hint
      ? [{ position: '369~-84~429~-84', color: '#ffff00', content: escapeLabel(hint), width: '364', locked: '0' }]
      : []
  }
  return { json: JSON.stringify(map), columnCount: paths.length, boxCount, openColumnCount, notes }
}

// Labels speichert Edumaps als HTML-Schnipsel (im Export steht `&nbsp;`).
function escapeLabel(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
