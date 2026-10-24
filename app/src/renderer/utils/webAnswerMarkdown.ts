/**
 * Anzeige einer Webantwort im Petrol-Chat (Stufe 1b, docs/codex-collab/chat-websuche.md, E3).
 *
 * Wie im Vault-Chat ist der Prüfer (`shared/rag/citations.ts`) die einzige Quelle dafür,
 * welche `[n]` Zitate sind (`citationMarkdownPlugin`). Zusätzlich bekommt jeder Satz, den
 * die Prüfung nicht trägt, am Satzende eine kleine Marke („ohne Quellennummer“, „geringe
 * Wortübereinstimmung“ …) — eine Marke an EINER Stelle statt einer Unterstreichung über den
 * Satz, damit sie nie über Fett/Kursiv-Grenzen hinweg verschachtelt werden muss.
 *
 * Modell-Links werden NICHT als Links gerendert (F15): eine fremde Seite kann das Modell
 * zu einem Link bewegen, der neben den echten Quellen glaubwürdig wirkt. Klickbar sind nur
 * die Quellenlinks, die die App aus der eingefrorenen Liste baut.
 */

import MarkdownIt from 'markdown-it'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import type { CitationReport, SentenceCheck } from '../../shared/rag/citations'
import type { SentenceExtra } from '../../shared/webChat'
import { citationMarkdownPlugin } from './citationMarkdown'

export type WebSentenceFlag = 'uncited' | 'low' | 'invalid' | 'quote' | 'heading' | 'number' | 'negation' | 'gap'

/**
 * Welche Marken ein Satz trägt — leer = der Wortvergleich trägt ihn (mehr prüft er nicht).
 * Überschriften prüft der Wortvergleich gar nicht (F20), Zahlen und Verneinungen kaum (F21):
 * beides wird deshalb sichtbar markiert statt still durchgelassen.
 */
export function sentenceFlags(s: SentenceCheck, extra?: SentenceExtra): WebSentenceFlag[] {
  const out: WebSentenceFlag[] = []
  if (s.status === 'unchecked') out.push('heading')
  // Ehrlich benannte Lücke: neutrale Marke statt „ohne Quellennummer“ (Nutzertest 24.10.2026).
  if (s.status === 'uncited') out.push(extra?.gap ? 'gap' : 'uncited')
  if (s.status === 'cited-low') out.push('low')
  if (s.status === 'cited-invalid') out.push('invalid')
  if (s.quotes.some((q) => !q.found)) out.push('quote')
  if (extra && extra.missingNumbers.length > 0) out.push('number')
  if (extra?.negation) out.push('negation')
  return out
}

const PUA_RE = /[\uE000-\uF8FF]/

/**
 * Setzt Zitatmarker an die gültigen Referenzspannen und Prüfmarken an das Ende jedes
 * markierten Satzes. Alle Positionen kommen aus dem Bericht, nichts aus Modelltext.
 */
export function markWebAnswer(answer: string, report: CitationReport, extras?: readonly SentenceExtra[]): string {
  if (PUA_RE.test(answer)) return answer.replace(/[\uE000-\uF8FF]/g, '')
  const edits: Array<{ start: number; end: number; text: string; order: number }> = []
  for (const r of report.refs) {
    if (r.valid) edits.push({ start: r.start, end: r.end, text: `[\uE000${r.n}\uE001]`, order: 0 })
  }
  report.sentences.forEach((s, k) => {
    if (sentenceFlags(s, extras?.[k]).length > 0) edits.push({ start: s.end, end: s.end, text: `[\uE002${k}\uE003]`, order: 1 })
  })
  edits.sort((a, b) => a.start - b.start || a.order - b.order)
  let out = ''
  let pos = 0
  for (const e of edits) {
    if (e.start < pos) continue
    out += answer.slice(pos, e.start) + e.text
    pos = e.end
  }
  return out + answer.slice(pos)
}

export interface WebAnswerEnv {
  flags?: { label: (sentenceIndex: number) => string | null; isGap?: (sentenceIndex: number) => boolean }
}

const FLAG_RE = /^\[\uE002(\d{1,4})\uE003\]/

function flagPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'web_flag', (state: StateInline, silent: boolean) => {
    if (state.src.charCodeAt(state.pos) !== 0x5b /* [ */) return false
    const m = FLAG_RE.exec(state.src.slice(state.pos, state.pos + 10))
    if (!m) return false
    if (!silent) {
      const flags = (state.env as WebAnswerEnv | undefined)?.flags
      const label = flags?.label(Number(m[1])) ?? null
      if (label) {
        const token = state.push('web_flag', 'span', 0)
        token.content = label
        token.meta = { gap: flags?.isGap?.(Number(m[1])) === true }
      }
    }
    state.pos += m[0].length
    return true
  })
  md.renderer.rules.web_flag = (tokens, idx) => {
    const gap = tokens[idx].meta?.gap === true
    return ` <span class="petrol-web-flag${gap ? ' is-gap' : ''}">${md.utils.escapeHtml(tokens[idx].content)}</span>`
  }
}

/** Eigener Renderer für Webantworten: keine Links, keine Bilder, keine Auto-Links. */
export function createWebAnswerMarkdown(): MarkdownIt {
  const md = new MarkdownIt({ html: false, linkify: false, breaks: true })
  md.disable(['link', 'image', 'autolink'])
  md.use(citationMarkdownPlugin)
  md.use(flagPlugin)
  return md
}
