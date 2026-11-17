import type TurndownService from 'turndown'
import { straightenQuotes } from '../../shared/quoteNormalize'

/**
 * Notiz-Einbettung `![[Notiz]]` im Lesen-Modus: Rendern + WYSIWYG-Rückweg.
 *
 * Vorher gab es für `.wikilink-embed` keine Turndown-Regel. Wer im Lesen-Modus eine Notiz
 * mit `![[Andere Notiz]]` bearbeitete, bekam beim Speichern den GERENDERTEN INHALT der
 * anderen Notiz (samt Kopfzeile) als Text in die eigene Notiz geschrieben — stille
 * Korruption wie beim Code-Block-Fehler (docs/codex-collab/filetree-drag-link.md, F02).
 *
 * - `data-raw` trägt den ganzen Ausdruck zwischen `![[` und `]]`, inklusive `|Alias`
 *   und `#Fragment` (F11). Der Typograph hat Anführungszeichen dort schon typografisch
 *   gemacht; die Regel schreibt sie gerade zurück — wie die `wikilink`-Regel (F10).
 * - `data-inline` hält fest, ob die Einbettung im Fließtext stand. Das lässt sich NACH
 *   dem HTML-Parsing nicht mehr erkennen, weil der Browser einen Absatz um einen
 *   Block-Container aufbricht (F31). Inline-Einbettungen werden deshalb als `<span>`
 *   gerendert und ohne Leerzeilen zurückgeschrieben (F12).
 */

export interface NoteEmbedRenderInput {
  linkText: string
  sizeOrAlias: string | undefined
  inline: boolean
  /** Stand im Quelltext ein Leerzeichen direkt davor/danach? Turndown verschluckt es,
   *  sobald der geladene Inhalt Block-Elemente enthält. */
  spaceBefore?: boolean
  spaceAfter?: boolean
  escapeHtml: (s: string) => string
}

export function renderNoteEmbedHtml({ linkText, sizeOrAlias, inline, spaceBefore = false, spaceAfter = false, escapeHtml }: NoteEmbedRenderInput): string {
  const raw = sizeOrAlias !== undefined ? `${linkText}|${sizeOrAlias}` : linkText
  const hashIndex = linkText.indexOf('#')
  const noteName = hashIndex > -1 ? linkText.substring(0, hashIndex) : linkText
  const fragment = hashIndex > -1 ? linkText.substring(hashIndex + 1) : ''
  const isBlock = fragment.startsWith('^')
  const tag = inline ? 'span' : 'div'
  return `<${tag} class="wikilink-embed${inline ? ' wikilink-embed-inline' : ''}" data-raw="${escapeHtml(raw)}" data-inline="${inline}"${inline ? ` data-space-before="${spaceBefore}" data-space-after="${spaceAfter}"` : ''} data-note="${escapeHtml(straightenQuotes(noteName))}" data-fragment="${escapeHtml(straightenQuotes(fragment))}" data-is-block="${isBlock}">` +
    `<span class="wikilink-embed-loading">Lade ${escapeHtml(linkText)}...</span>` +
    `</${tag}>`
}

export const noteEmbedRule: TurndownService.Rule = {
  filter: (node) => (node.nodeName === 'DIV' || node.nodeName === 'SPAN') && (node as HTMLElement).classList.contains('wikilink-embed'),
  replacement: (_content, node) => {
    const el = node as HTMLElement
    let raw = el.getAttribute('data-raw')
    if (!raw) {
      const note = el.getAttribute('data-note') || ''
      const fragment = el.getAttribute('data-fragment') || ''
      raw = note ? `${note}${fragment ? `#${fragment}` : ''}` : ''
    }
    if (!raw) return ''
    const expr = `![[${straightenQuotes(raw)}]]`
    if (el.getAttribute('data-inline') !== 'true') return `\n\n${expr}\n\n`
    const prev = el.previousSibling?.textContent ?? ''
    const next = el.nextSibling?.textContent ?? ''
    const before = el.getAttribute('data-space-before') === 'true' && prev !== '' && !/\s$/.test(prev) ? ' ' : ''
    const after = el.getAttribute('data-space-after') === 'true' && next !== '' && !/^\s/.test(next) ? ' ' : ''
    return `${before}${expr}${after}`
  }
}
