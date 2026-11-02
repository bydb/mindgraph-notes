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
/** Anfang des Zusammenfassungsvermerks; `pdfNoTextNote` sucht danach. */
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

/**
 * `pages` sind die gelesenen Seiten in Reihenfolge (Seite 1 zuerst), `totalPages` die
 * Seitenzahl der Datei. Wirft, wenn die Datei insgesamt keinen Text hat (wie bisher).
 * Text einer Seite mit wenig Text bleibt erhalten — ein Stempel oder eine Seitenzahl
 * auf einem Scan ist echter Text, der Vermerk sagt nur, dass dort mehr stehen kann.
 */
export function assemblePdfText(pages: string[], totalPages: number): string {
  if (visibleChars(pages.join('')) < PDF_PAGE_MIN_CHARS) throw new Error(NO_TEXT_ERROR)
  const sparse: number[] = []
  let out = ''
  pages.forEach((page, i) => {
    const n = i + 1
    const chars = visibleChars(page)
    if (chars < PDF_PAGE_MIN_CHARS) {
      sparse.push(n)
      out += chars === 0
        ? `[Seite ${n}: kein Text gefunden — leer, Bild oder Scan]\n`
        : `[Seite ${n}: kaum Text (${chars} Zeichen) — vermutlich Bild oder Scan]\n`
    }
    if (page) out += page
    out += '\n'
  })
  if (sparse.length > 0) {
    const which = sparse.length === 1 ? 'Seite' : 'Seiten'
    out += `\n[${PDF_NO_TEXT_PREFIX} ${which} ${formatPageRanges(sparse)} von ${pages.length} gelesenen Seiten — `
      + 'Inhalt dort nicht gelesen, falls es Scans oder Bilder sind]'
  }
  if (pages.length < totalPages) out += `\n[gekürzt: nur die ersten ${pages.length} von ${totalPages} Seiten]`
  return out
}

/** Inhalt des Zusammenfassungsvermerks (ohne Klammern), falls vorhanden. */
export function pdfNoTextNote(text: string): string | undefined {
  const i = text.lastIndexOf(`[${PDF_NO_TEXT_PREFIX}`)
  if (i < 0) return undefined
  const end = text.indexOf(']', i)
  return end < 0 ? undefined : text.slice(i + 1, end)
}
