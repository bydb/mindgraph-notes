/**
 * Zitatmarker als Markdown-Inline-Token (Codex F25).
 *
 * Der Prüfer (`shared/rag/citations.ts`) entscheidet, welche Nummern gültig sind. Dieses
 * Plugin wandelt `[n]` NUR in Text-Tokens um — nie in Code (`code_inline`, `fence`,
 * `code_block`), nie in Linkzielen oder -titeln (das sind Attribute, keine Text-Tokens)
 * und nie bei escaped `\[n]` (das ist nach `escape` ein `text_special`-Token). Die Regel
 * läuft nach `inline` und vor `text_join`, damit Escapes noch getrennt sind. Modelltext
 * bekommt damit keine Marker-Autorität: es gibt keinen Platzhalter, den er schreiben könnte.
 */

import type MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type Token from 'markdown-it/lib/token.mjs'

export interface CitationEnv {
  cites?: {
    /** Gültige Quellennummern laut Prüfer (1…K). */
    valid: Set<number>
    /** Liefert Notiz-ID und Dateipfad zur Nummer, oder null, wenn nicht anklickbar. */
    resolve: (n: number) => { noteId: string | null; fileRel: string } | null
  }
}

const REF_RE = /\[(\d{1,3})\]/g

export function citationMarkdownPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'cite_refs', (state: StateCore) => {
    const env = state.env as CitationEnv
    const cites = env?.cites
    if (!cites || cites.valid.size === 0) return
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue
      const out: Token[] = []
      for (const child of block.children) {
        if (child.type !== 'text' || !REF_RE.test(child.content)) {
          out.push(child)
          continue
        }
        REF_RE.lastIndex = 0
        let last = 0
        let m: RegExpExecArray | null
        while ((m = REF_RE.exec(child.content)) !== null) {
          const n = Number(m[1])
          if (!cites.valid.has(n)) continue
          if (m.index > last) {
            const t = new state.Token('text', '', 0)
            t.content = child.content.slice(last, m.index)
            out.push(t)
          }
          const cite = new state.Token('cite', 'sup', 0)
          cite.content = String(n)
          const target = cites.resolve(n)
          cite.attrSet('class', 'nc-cite')
          cite.attrSet('data-cite', String(n))
          if (target?.noteId) {
            cite.attrSet('role', 'link')
            cite.attrSet('tabindex', '0')
            cite.attrSet('data-note', target.noteId)
            cite.attrSet('title', target.fileRel)
          }
          out.push(cite)
          last = m.index + m[0].length
        }
        if (last < child.content.length) {
          const t = new state.Token('text', '', 0)
          t.content = child.content.slice(last)
          out.push(t)
        }
        if (last === 0) out.push(child) // keine gültige Nummer im Text → unverändert
      }
      block.children = out
    }
  })

  md.renderer.rules.cite = (tokens, idx, _options, _env, self) => {
    const token = tokens[idx]
    return `<sup${self.renderAttrs(token)}>[${md.utils.escapeHtml(token.content)}]</sup>`
  }
}
