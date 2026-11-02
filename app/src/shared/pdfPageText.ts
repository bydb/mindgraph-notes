/**
 * Seitentext einer PDF zusammensetzen und Seiten ohne Textebene benennen.
 *
 * Vorher prüfte der Agent nur, ob die ganze Datei mindestens 40 Zeichen Text hat.
 * Eine PDF mit 18 Textseiten und zwei eingescannten Anlagen galt als gelesen, die
 * beiden Scan-Seiten fehlten ohne Hinweis. Jetzt steht an jeder solchen Seite ein
 * Vermerk und am Ende eine Zusammenfassung, die `folder_digest` als Teilstatus liest.
 */

/** Unter so vielen Zeichen (ohne Leerraum) gilt eine Seite als „kaum Text“. Vorläufig, an echten PDFs messen. */
export const PDF_PAGE_MIN_CHARS = 40
/** Anfang des Vermerks zu Seiten ohne gelesenen Inhalt (siehe pdfCoverageNotes). */
export const PDF_NO_TEXT_PREFIX = 'ohne Textebene:'

const NO_TEXT_ERROR = 'PDF hat keine Textebene (Scan?) — nur PDFs mit Textinhalt werden unterstützt'

function visibleChars(s: string): number {
  return s.replace(/\s/g, '').length
}

/** 1,2,3,7,9,10 → „1–3, 7, 9–10“ */
export function formatPageRanges(pages: number[]): string {
  const parts: string[] = []
  for (let i = 0; i < pages.length; i++) {
    let j = i
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++
    parts.push(j > i ? `${pages[i]}–${pages[j]}` : String(pages[i]))
    i = j
  }
  return parts.join(', ')
}

/** Ergebnis der Texterkennung einer Seite (Stufe 2, Rev. 7 Punkt 25). */
export type PdfPageOcr =
  | { text: string; incomplete?: boolean }
  | { error: string }
  | { budget: true }

export interface PdfPageInput {
  /** Text der Textebene. */
  text: string
  /** Seite enthält Bilder (pdfjs-Operatoren). undefined = unbekannt, wie ein Bild behandelt. */
  hasImages?: boolean
  /** Nur gesetzt, wenn eine Erkennung versucht wurde bzw. am Budget scheiterte. */
  ocr?: PdfPageOcr
}

/** Was mit den Seiten geschah — getrennt vom Modelltext (Codex F30). Seitenzahlen 1-basiert. */
export interface PdfCoverage {
  readPages: number
  totalPages: number
  ocrPages: number[]
  ocrIncomplete: number[]
  ocrFailed: number[]
  budgetSkipped: number[]
  /** Seiten ohne lesbaren Text, auf denen auch keine Erkennung lief. */
  notRead: number[]
  emptyPages: number[]
  /** Textseiten mit Bildern — Text in Grafiken oder eingescannten Teilen fehlt dort (F41). */
  imagesOnTextPages: number[]
}

export const PDF_OCR_PREFIX = 'Texterkennung:'
export const PDF_IMAGES_PREFIX = 'Bilder auf Textseiten nicht geprüft:'

/**
 * Seiten zusammensetzen. Wirft erst, wenn nach der Erkennung gar kein Text da ist (Codex F29);
 * `noTextHint` ergänzt die Fehlermeldung (z. B. warum keine Erkennung lief).
 */
export function assemblePdfPages(pages: PdfPageInput[], totalPages: number, noTextHint?: string): { text: string; notes: string[]; coverage: PdfCoverage } {
  const cov: PdfCoverage = {
    readPages: pages.length, totalPages, ocrPages: [], ocrIncomplete: [], ocrFailed: [], budgetSkipped: [],
    notRead: [], emptyPages: [], imagesOnTextPages: []
  }
  let visible = 0
  let out = ''
  pages.forEach((page, i) => {
    const n = i + 1
    const chars = visibleChars(page.text)
    const ocr = page.ocr
    if (chars >= PDF_PAGE_MIN_CHARS) {
      if (page.hasImages) cov.imagesOnTextPages.push(n)
      visible += chars
      out += page.text + '\n'
      return
    }
    if (ocr && 'text' in ocr) {
      cov.ocrPages.push(n)
      if (ocr.incomplete) cov.ocrIncomplete.push(n)
      visible += visibleChars(ocr.text)
      out += `[Seite ${n}: per Texterkennung gelesen${ocr.incomplete ? ', möglicherweise unvollständig' : ''}]\n${ocr.text}\n`
      return
    }
    if (page.hasImages === false && !ocr) {
      // Weder Text noch Bild: leer oder nur eine kurze Zeile (Kapiteltitel) — kein Scan.
      if (chars === 0) cov.emptyPages.push(n)
      visible += chars
      out += page.text + '\n'
      return
    }
    visible += chars
    if (ocr && 'error' in ocr) {
      cov.ocrFailed.push(n)
      out += `[Seite ${n}: Texterkennung fehlgeschlagen — ${ocr.error}]\n`
    } else if (ocr && 'budget' in ocr) {
      cov.budgetSkipped.push(n)
      out += `[Seite ${n}: nicht erkannt — Budget der Texterkennung erschöpft]\n`
    } else {
      cov.notRead.push(n)
      out += chars === 0
        ? `[Seite ${n}: kein Text gefunden — leer, Bild oder Scan]\n`
        : `[Seite ${n}: kaum Text (${chars} Zeichen) — vermutlich Bild oder Scan]\n`
    }
    if (page.text) out += page.text
    out += '\n'
  })
  if (visible < PDF_PAGE_MIN_CHARS) throw new Error(noTextHint ? `${NO_TEXT_ERROR}. ${noTextHint}` : NO_TEXT_ERROR)
  const notes = pdfCoverageNotes(cov)
  if (notes.length) out += '\n' + notes.map(n => `[${n}]`).join('\n')
  return { text: out, notes, coverage: cov }
}

/**
 * Vermerke aus der Abdeckung — nie aus dem PDF-Text gelesen (Codex F50): eine PDF, deren
 * Textebene selbst „[Texterkennung: …]“ enthält, kann so keinen Status vortäuschen.
 */
export function pdfCoverageNotes(cov: PdfCoverage): string[] {
  const notes: string[] = []
  const pages = (list: number[]) => `${list.length === 1 ? 'Seite' : 'Seiten'} ${formatPageRanges(list)}`
  const unread = [...cov.notRead, ...cov.ocrFailed, ...cov.budgetSkipped].sort((a, b) => a - b)
  if (unread.length > 0) {
    notes.push(`${PDF_NO_TEXT_PREFIX} ${pages(unread)} von ${cov.readPages} gelesenen Seiten — Inhalt dort nicht gelesen, falls es Scans oder Bilder sind`)
  }
  if (cov.ocrPages.length > 0) {
    notes.push(`${PDF_OCR_PREFIX} ${pages(cov.ocrPages)} auf diesem Rechner per Texterkennung gelesen — kann Lesefehler enthalten, Zahlen prüfen`)
  }
  if (cov.imagesOnTextPages.length > 0) {
    notes.push(`${PDF_IMAGES_PREFIX} ${pages(cov.imagesOnTextPages)} — Text in Grafiken, Logos oder eingescannten Teilen dieser Seiten fehlt`)
  }
  if (cov.readPages < cov.totalPages) notes.push(`gekürzt: nur die ersten ${cov.readPages} von ${cov.totalPages} Seiten`)
  return notes
}

/** Nach dem Kürzen: die Vermerke wieder anhängen (Codex F30). Quelle ist die Abdeckung, nicht der Text. */
export function appendPdfNotes(cut: string, notes: readonly string[]): string {
  return notes.length ? `${cut}\n${notes.map(n => `[${n}]`).join('\n')}` : cut
}

/**
 * Stufe 1 ohne Bildangabe und ohne Erkennung (bleibt für ältere Aufrufer): jede Seite unter
 * der Schwelle bekommt einen Vermerk, die Datei ohne jeden Text wirft.
 */
export function assemblePdfText(pages: string[], totalPages: number): string {
  return assemblePdfPages(pages.map(text => ({ text })), totalPages).text
}
