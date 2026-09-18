/**
 * Zitatmarker als Markdown-Inline-Token (Codex F25, Runde 5).
 *
 * Der Prüfer (`shared/rag/citations.ts`) ist die EINZIGE Quelle dafür, welche `[n]` Zitate
 * sind. Die Anzeige setzt an genau seinen Spannen einen Marker `[\uE000n\uE001]` in den
 * Markdown-Text (`markCitationRefs`, dieselbe Ersetzung wie der Export) und macht daraus
 * per Inline-Regel eine Hochzahl. Die Private-Use-Zeichen kann Modelltext nicht liefern —
 * der Main-Handler entfernt sie vor der Prüfung —, es gibt also keinen einschleusbaren
 * Platzhalter. Anzeige, Prüfung und Export sehen damit dieselben Vorkommen.
 */

import type MarkdownIt from 'markdown-it'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import { replaceCitationRefs, type CitationReport } from '../../shared/rag/citations'

export interface CitationEnv {
  cites?: {
    /** Liefert Notiz-ID und Dateipfad zur Nummer, oder null, wenn nicht anklickbar. */
    resolve: (n: number) => { noteId: string | null; fileRel: string } | null
  }
}

const OPEN = '\uE000'
const CLOSE = '\uE001'
const MARK_RE = /^\[\uE000(\d{1,3})\uE001\]/
const PUA_RE = /[\uE000-\uF8FF]/

/** Markiert ausschließlich die vom Prüfer erkannten gültigen Referenzen. */
export function markCitationRefs(answer: string, report: CitationReport): string {
  // Enthält der Text (wider Erwarten) Private-Use-Zeichen, wären die Spannen nicht
  // vertrauenswürdig — dann lieber keine Hochzahlen als falsche.
  if (PUA_RE.test(answer)) return answer.replace(/[\uE000-\uF8FF]/g, '')
  return replaceCitationRefs(answer, report, (n) => `[${OPEN}${n}${CLOSE}]`)
}

export function citationMarkdownPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'cite_ref', (state: StateInline, silent: boolean) => {
    if (state.src.charCodeAt(state.pos) !== 0x5b /* [ */) return false
    const m = MARK_RE.exec(state.src.slice(state.pos, state.pos + 8))
    if (!m) return false
    if (!silent) {
      const n = Number(m[1])
      const cites = (state.env as CitationEnv | undefined)?.cites
      const token = state.push('cite', 'sup', 0)
      token.content = String(n)
      token.attrSet('class', 'nc-cite')
      token.attrSet('data-cite', String(n))
      const target = cites?.resolve(n) ?? null
      if (target?.noteId) {
        token.attrSet('role', 'link')
        token.attrSet('tabindex', '0')
        token.attrSet('data-note', target.noteId)
        token.attrSet('title', target.fileRel)
      }
    }
    state.pos += m[0].length
    return true
  })

  md.renderer.rules.cite = (tokens, idx, _options, _env, self) => {
    const token = tokens[idx]
    return `<sup${self.renderAttrs(token)}>[${md.utils.escapeHtml(token.content)}]</sup>`
  }
}
