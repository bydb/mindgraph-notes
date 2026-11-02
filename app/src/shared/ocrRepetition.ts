/**
 * Wiederholungs-Erkennung für die Vision-OCR.
 *
 * glm-ocr hört seit Ollama 0.40 nach der Seite nicht mehr auf: es schreibt die
 * Seite fehlerfrei und beginnt dann von vorn — als Markdown, als HTML-Tabelle,
 * in Code-Fences, bis zur Ausgabegrenze (gemessen 02.11.2026, 45 von 45 Läufen).
 * Der erste Durchgang ist richtig; abgeschnitten am Neubeginn war die Ausgabe auf
 * den Testseiten fehlerfrei.
 *
 * Verglichen wird nur der Wortlaut ohne Markup (Buchstaben und Ziffern,
 * kleingeschrieben) — die Kopien unterscheiden sich in der Form, nicht im Text.
 */

/** Ab so vielen gleichen Zeichen in Folge (ohne Markup) gilt eine Wiederholung als Schleife. */
export const OCR_LOOP_MIN_RUN = 300
/** Fenster, über das ein Wiederholungsbeginn gesucht wird. */
const WINDOW = 60

interface Normalized {
  text: string
  /** Index im Original für jedes Zeichen von `text`. */
  map: number[]
}

const KEEP = /[\p{L}\p{N}]/u

function normalizeWithMap(raw: string): Normalized {
  let text = ''
  const map: number[] = []
  let inTag = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inTag) {
      if (ch === '>') inTag = false
      continue
    }
    // HTML-Tag (<table>, </td>, <br/>), kein „a < b“
    if (ch === '<' && /[a-zA-Z/!]/.test(raw[i + 1] ?? '')) {
      inTag = true
      continue
    }
    if (KEEP.test(ch)) {
      text += ch.toLowerCase()
      map.push(i)
    }
  }
  return { text, map }
}

/**
 * Erste Stelle (im normalisierten Text), ab der mindestens `minRun` Zeichen
 * wörtlich wiederholen, was weiter vorn schon stand. Mit `lenient` (nur beim
 * Abschneiden einer schon erkannten Schleife) reicht auch eine Wiederholung bis
 * zum Ende oder über die halbe Länge des Vorangegangenen — eine kurze Seite
 * (Handzettel, Titelblatt) hat weniger als `minRun` Zeichen pro Durchgang.
 */
function findLoopStart(norm: string, minRun: number, lenient: boolean): number {
  const first = new Map<string, number>()
  for (let q = 0; q + WINDOW <= norm.length; q++) {
    const win = norm.slice(q, q + WINDOW)
    const r = first.get(win)
    if (r === undefined) {
      first.set(win, q)
      continue
    }
    let k = WINDOW
    while (q + k < norm.length && norm[q + k] === norm[r + k]) k++
    if (k >= minRun) return q
    if (lenient && (q + k === norm.length || (k >= 2 * WINDOW && k >= q / 2))) return q
  }
  return -1
}

/** Während des Streamens: wiederholt sich die Ausgabe bereits? */
export function looksLikeOcrLoop(raw: string, minRun = OCR_LOOP_MIN_RUN): boolean {
  return findLoopStart(normalizeWithMap(raw).text, minRun, false) >= 0
}

export interface OcrTrimResult {
  text: string
  /** true, wenn eine Wiederholung abgeschnitten wurde. */
  trimmed: boolean
}

/**
 * Schneidet die Ausgabe am Beginn der ersten Wiederholung ab. Nur aufrufen, wenn
 * die Ausgabe als Schleife erkannt wurde oder an die Ausgabegrenze stieß — eine
 * normal beendete Seite bleibt unangetastet.
 */
export function trimOcrRepetition(raw: string, minRun = OCR_LOOP_MIN_RUN): OcrTrimResult {
  const { text: norm, map } = normalizeWithMap(raw)
  const q = findLoopStart(norm, minRun, true)
  if (q < 0) return { text: raw.trim(), trimmed: false }

  let cut = map[q]
  // Markup vor dem ersten Wort der Kopie (`<table><tr><td>`, `- `, `# `) gehört zur Kopie.
  const lineStart = raw.lastIndexOf('\n', cut - 1) + 1
  if (!/[\p{L}\p{N}]/u.test(raw.slice(lineStart, cut).replace(/<[^>]*>/g, ''))) cut = lineStart

  return { text: closeFences(dropTrailingFences(raw.slice(0, cut))), trimmed: true }
}

/** Offene ```markdown-Zeilen am Ende stammen vom Neubeginn. */
function dropTrailingFences(text: string): string {
  const lines = text.trimEnd().split('\n')
  while (lines.length > 0 && /^\s*(```|~~~)[\w-]*\s*$/.test(lines[lines.length - 1])) lines.pop()
  return lines.join('\n').trimEnd()
}

function closeFences(text: string): string {
  const fences = text.split('\n').filter(l => /^\s*```/.test(l)).length
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text
}
