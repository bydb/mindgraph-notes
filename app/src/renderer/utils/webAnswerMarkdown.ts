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

export type WebSentenceFlag = 'uncited' | 'low' | 'invalid' | 'quote' | 'heading' | 'number' | 'questionNumber' | 'unsourcedNumber' | 'apart' | 'negation' | 'gap'

/**
 * Marken ohne Warnfarbe: sie benennen etwas, warnen aber nicht. „Zahl aus deiner Frage“ warnt (Codex F02).
 * Seit 26.10.2026 darf die Webantwort Modellwissen ohne Nummer ergänzen (Nutzerentscheidung) —
 * `uncited` heißt jetzt „Modellwissen“ und ist gekennzeichnet, nicht gewarnt. Eine Zahl darin warnt.
 */
export const NEUTRAL_FLAGS: ReadonlySet<WebSentenceFlag> = new Set(['gap', 'uncited'])

/** Trägt der Satz nur neutrale Marken? Dann ohne Warnfarbe anzeigen. */
export function onlyNeutralFlags(flags: readonly WebSentenceFlag[]): boolean {
  return flags.length > 0 && flags.every((f) => NEUTRAL_FLAGS.has(f))
}

/**
 * Nur „Modellwissen“: Orange statt Grau — Grau las sich wie „in Ordnung“, dabei prüft niemand diese
 * Sätze, auch Namen und Daten ohne Ziffern nicht (Codex F60). Petrol bleibt den Sätzen mit Quelle
 * vorbehalten, Rot den harten Befunden (Nutzerentscheidung 26.10.2026).
 */
export function onlyKnowledgeFlags(flags: readonly WebSentenceFlag[]): boolean {
  return flags.length > 0 && flags.every((f) => f === 'uncited')
}

/**
 * Harte Befunde: die Zahl, das Zitat oder die Quellennummer passt nicht — rot statt orange.
 * Eine Verneinung gehört NICHT dazu: sie ist nur ungeprüft, kein nachgewiesener Fehler (Codex F68).
 */
export const SEVERE_FLAGS: ReadonlySet<WebSentenceFlag> = new Set(['number', 'unsourcedNumber', 'questionNumber', 'invalid', 'quote'])

export function hasSevereFlag(flags: readonly WebSentenceFlag[]): boolean {
  return flags.some((f) => SEVERE_FLAGS.has(f))
}

/**
 * Zeichen im Textfluss statt ausgeschriebener Marke (Nutzerwunsch 26.10.2026: Text störte den
 * Lesefluss). Der volle Wortlaut steht im Tooltip, in der Legende und in der Prüfung je Satz.
 * Vorrang: harter Befund vor Modellwissen vor geringer Übereinstimmung.
 */
export type WebMarkKind = 'severe' | 'apart' | 'knowledge' | 'gap' | 'other'

export const MARK_GLYPHS: Record<WebMarkKind, string> = { severe: '!', apart: '↔', knowledge: '', gap: '∅', other: '?' }

/**
 * Marken für Text, Tooltip und Export — ohne „geringe Wortübereinstimmung“ (Nutzerentscheidung
 * 26.10.2026): deutsche Sätze gegen englische Seiten und jede gute Umformulierung senken die
 * Wortdeckung; im Raspberry-Test trugen 8 von 10 belegten Sätzen das Zeichen, es trennte richtig
 * nicht von falsch. Es bleibt in „Prüfung je Satz“. Zahlen, Zitate, Nummern prüfen eigene Marken.
 */
export function inlineFlags(flags: readonly WebSentenceFlag[]): WebSentenceFlag[] {
  return flags.filter((f) => f !== 'low')
}

export function markKind(all: readonly WebSentenceFlag[]): WebMarkKind | null {
  const flags = inlineFlags(all)
  if (flags.length === 0) return null
  if (hasSevereFlag(flags)) return 'severe'
  if (flags.includes('apart')) return 'apart'
  if (flags.includes('uncited')) return 'knowledge'
  if (flags.every((f) => f === 'gap')) return 'gap'
  return 'other'
}

/**
 * Welche Marken ein Satz trägt — leer = der Wortvergleich trägt ihn (mehr prüft er nicht).
 * Überschriften prüft der Wortvergleich gar nicht (F20), Zahlen und Verneinungen kaum (F21):
 * beides wird deshalb sichtbar markiert statt still durchgelassen.
 */
export function sentenceFlags(s: SentenceCheck, extra?: SentenceExtra): WebSentenceFlag[] {
  const out: WebSentenceFlag[] = []
  if (extra?.label) return out
  if (s.status === 'unchecked') out.push('heading')
  // Ehrlich benannte Lücke: neutrale Marke statt „ohne Quellennummer“ (Nutzertest 24.10.2026).
  if (s.status === 'uncited') out.push(extra?.gap ? 'gap' : 'uncited')
  if (s.status === 'cited-low') out.push('low')
  if (s.status === 'cited-invalid') out.push('invalid')
  if (s.quotes.some((q) => !q.found)) out.push('quote')
  if (extra && extra.missingNumbers.length > 0) out.push('number')
  if (extra?.questionNumbers?.length) out.push('questionNumber')
  if (extra?.unsourcedNumbers?.length) out.push('unsourcedNumber')
  if (extra?.apartNumbers?.length) out.push('apart')
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
  flags?: { label: (sentenceIndex: number) => string | null; kind: (sentenceIndex: number) => WebMarkKind | null }
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
        token.meta = { kind: flags?.kind(Number(m[1])) ?? 'other' }
      }
    }
    state.pos += m[0].length
    return true
  })
  md.renderer.rules.web_flag = (tokens, idx) => {
    const kind = (tokens[idx].meta?.kind ?? 'other') as WebMarkKind
    const label = md.utils.escapeHtml(tokens[idx].content)
    return `<span class="petrol-web-mark is-${kind}" title="${label}" aria-label="${label}">${MARK_GLYPHS[kind]}</span>`
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
