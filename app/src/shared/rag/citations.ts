/**
 * Zitatprüfung für quellenbelegte Antworten (Vault-Chat-Plan Rev. 3, Entscheidung 13, F08/F09).
 *
 * Prüft NUR, was deterministisch prüfbar ist, und nennt es so:
 *   - Quellennummer gültig / ungültig (außerhalb 1…K)
 *   - Wortdeckung hoch / niedrig zwischen Satz und zitierter Stelle (Maximum über mehrere Zitate)
 *   - wörtliches Zitat in Anführungszeichen gefunden / nicht gefunden
 *   - ohne Quellenangabe (JEDER inhaltliche Satz ohne [n])
 * Nie „belegt", nie „wahr". Die Prüfung ist Wortüberlappung, kein Faktencheck.
 *
 * Arbeitet auf dem UNVERÄNDERTEN Antwortstring (LF-Zeilenenden, keine Private-Use-Zeichen —
 * der Main-Handler normalisiert davor): alle Spannen sind Offsets darin. Welche Stellen
 * sichtbarer Text sind, entscheidet der markdown-it-Tokenstrom (gleiche Auslegung wie die
 * Anzeige); Code, Linkziele, Auto-URLs und Linkdefinitionen sind damit nie Zitate (F25).
 * Überleitungen sind nur dann ausgenommen, wenn das GANZE Segment exakt in der
 * Liste steht („Kurz gesagt:" allein) — nie als Präfix (Rückfrage 3).
 */

import MarkdownIt from 'markdown-it'

export type SentenceStatus =
  | 'cited-high'
  | 'cited-low'
  | 'cited-unchecked'
  | 'cited-invalid'
  | 'uncited'
  | 'transition'
  /** Überschrift: bewusst nicht als Aussage geprüft, aber sichtbar gezählt (F26). */
  | 'unchecked'

export interface CitationRef {
  n: number
  start: number
  end: number
  valid: boolean
}

export interface QuoteCheck {
  text: string
  found: boolean
}

export interface SentenceCheck {
  start: number
  end: number
  refs: number[]
  status: SentenceStatus
  /** Anteil der Inhaltswörter des Satzes, die in der besten zitierten Stelle vorkommen (null = nichts prüfbar). */
  coverage: number | null
  quotes: QuoteCheck[]
}

export interface CitationReport {
  refs: CitationRef[]
  sentences: SentenceCheck[]
  /** Genutzte gültige Quellennummern, aufsteigend. */
  usedSources: number[]
  summary: {
    sentences: number
    cited: number
    uncited: number
    low: number
    invalidRefs: number
    quotesNotFound: number
    /** Überschriften, die nicht geprüft wurden. */
    unchecked: number
  }
}

export interface CitationOptions {
  /** Startwert 0,3 — wird in Phase 3 kalibriert. */
  supportThreshold?: number
}

const DEFAULT_THRESHOLD = 0.3

const TRANSITIONS = new Set([
  'kurz gesagt', 'zusammengefasst', 'zusammenfassung', 'fazit', 'kurzum', 'in kürze',
  'in short', 'in summary', 'summary', 'to sum up', 'conclusion'
])

// Kein Zitat: escaped `\\[1]` und Markdown-Links `[1](…)`/`[1][…]` (F25).
const REF_RE = /(?<!\\)\[(\d{1,3})\](?!\()(?!\[(?!\d{1,3}\]))/g // `[1][2]` bleibt erlaubt, `[1][ref]` nicht

function normalizeWs(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Inhaltswörter: Buchstabenfolgen ab 4 Zeichen, Zahlen/Daten immer. */
export function contentWords(text: string): Set<string> {
  const out = new Set<string>()
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.,:/-]*/gu) ?? []
  for (const raw of tokens) {
    const tok = raw.replace(/^[.,:/-]+|[.,:/-]+$/g, '')
    if (!tok) continue
    if (/\p{N}/u.test(tok) || tok.length >= 4) out.add(tok)
  }
  return out
}

type SegmentKind = 'prose' | 'heading' | 'cell'

interface Segment {
  span: [number, number]
  kind: SegmentKind
  /** Nicht-Text innerhalb des Segments (Code, Linkziele, Markup): dort ist `[n]` kein Zitat. */
  masked: Array<[number, number]>
}

/**
 * Markdown-Struktur aus demselben Tokenstrom wie die Anzeige (Codex F25, Runde 5): welche
 * Stellen sichtbarer Text sind, entscheidet markdown-it, nicht eine zweite Regex-Auslegung.
 * `text_join` bleibt aus, damit escaped `\[` (text_special) von Text unterscheidbar ist;
 * Typographie aus, damit Token-Inhalte bytegetreu im Quelltext stehen.
 */
const structureMd = new MarkdownIt({ html: false, linkify: true, typographer: false })
structureMd.core.ruler.disable('text_join')

/** Zusatzmasken, die markdown-it nicht kennt: Formeln der Anzeige (texmath) und rohe URLs. */
const EXTRA_MASKS = [
  /\$\$[\s\S]+?\$\$/g,
  /\$[^\n$]+?\$/g,
  /\\\([\s\S]+?\\\)/g,
  /\\\[[\s\S]+?\\\]/g,
  /https?:\/\/[^\s)]+/g
]

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 0x0a) starts.push(i + 1)
  return starts
}

/** Schließende Klammer eines Linkziels `(…)` ab `open` (verschachtelt, escaped), sonst -1. */
function closingParen(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\') { i++; continue }
    if (ch === '(') depth++
    else if (ch === ')') { depth--; if (depth === 0) return i }
    else if (ch === '\n' && text[i + 1] === '\n') return -1
  }
  return -1
}

/**
 * Segmente (Absätze, Listenpunkte, Überschriften, Tabellenzellen) als Spannen im Original,
 * mit den Text-Spannen ihrer `text`-Kinder. Code-Zäune, eingerückter Code, Linkdefinitionen
 * und Trennlinien haben keine Inline-Token und fallen damit weg; Inline-Code, Linkziele,
 * Auto-/Linkify-URLs und Markup sind maskiert.
 */
function segments(text: string): Segment[] {
  const tokens = structureMd.parse(text, {})
  const starts = lineStarts(text)
  const out: Segment[] = []
  let cur = 0
  let kind: SegmentKind = 'prose'
  for (const block of tokens) {
    if (block.map && block.nesting !== -1) cur = Math.max(cur, starts[Math.min(block.map[0], starts.length - 1)])
    if (block.type === 'heading_open') kind = 'heading'
    else if (block.type === 'th_open' || block.type === 'td_open') kind = 'cell'
    else if (block.type === 'paragraph_open') kind = 'prose'
    if (block.type !== 'inline' || !block.children) continue

    const eligible: Array<[number, number]> = []
    let segStart = -1
    let segEnd = -1
    const note = (a: number, b: number, isText: boolean): void => {
      if (segStart < 0) segStart = a
      segEnd = Math.max(segEnd, b)
      if (isText) eligible.push([a, b])
    }
    let autoLink = 0
    for (const child of block.children) {
      switch (child.type) {
        case 'text': {
          if (!child.content) break
          const idx = text.indexOf(child.content, cur)
          if (idx < 0) break
          note(idx, idx + child.content.length, autoLink === 0)
          cur = idx + child.content.length
          break
        }
        case 'text_special': {
          if (text[cur] === '\\') cur += 2
          else if (text[cur] === '&') { const semi = text.indexOf(';', cur); cur = semi < 0 ? cur + 1 : semi + 1 }
          else cur += child.content.length
          note(cur, cur, false)
          break
        }
        case 'code_inline': {
          const open = text.indexOf(child.markup, cur)
          if (open < 0) break
          const close = text.indexOf(child.markup, open + child.markup.length)
          const end = close < 0 ? open + child.markup.length : close + child.markup.length
          note(open, end, false)
          cur = end
          break
        }
        case 'link_open':
          if (child.info === 'auto') {
            autoLink++
            if (child.markup === 'autolink' && text[cur] === '<') cur += 1
          } else if (text[cur] === '[') {
            cur += 1
          }
          break
        case 'link_close':
          if (child.info === 'auto') {
            autoLink = Math.max(0, autoLink - 1)
            if (child.markup === 'autolink' && text[cur] === '>') { note(cur, cur + 1, false); cur += 1 }
          } else if (text[cur] === ']') {
            cur += 1
            if (text[cur] === '(') {
              const close = closingParen(text, cur)
              const end = close < 0 ? cur + 1 : close + 1
              note(cur, end, false)
              cur = end
            } else if (text[cur] === '[') {
              const close = text.indexOf(']', cur)
              const end = close < 0 ? cur + 1 : close + 1
              note(cur, end, false)
              cur = end
            }
          }
          break
        case 'image': {
          const open = text.indexOf('![', cur)
          if (open < 0) break
          const paren = text.indexOf('](', open)
          const close = paren < 0 ? -1 : closingParen(text, paren + 1)
          const end = close < 0 ? open + 2 : close + 1
          note(open, end, false)
          cur = end
          break
        }
        case 'softbreak':
        case 'hardbreak': {
          const nl = text.indexOf('\n', cur)
          if (nl >= 0) cur = nl + 1
          break
        }
        default:
          if (child.markup && text.startsWith(child.markup, cur)) {
            note(cur, cur + child.markup.length, false)
            cur += child.markup.length
          }
      }
    }
    if (segStart < 0 || segEnd <= segStart) continue
    // Zusatzmasken schneiden Text-Spannen zurecht.
    const extra: Array<[number, number]> = []
    for (const re of EXTRA_MASKS) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        if (m.index < segEnd && m.index + m[0].length > segStart) extra.push([m.index, m.index + m[0].length])
      }
    }
    const masked: Array<[number, number]> = []
    let pos = segStart
    for (const [a, b] of eligible.sort((x, y) => x[0] - y[0])) {
      if (a > pos) masked.push([pos, a])
      pos = Math.max(pos, b)
    }
    if (pos < segEnd) masked.push([pos, segEnd])
    masked.push(...extra)
    out.push({ span: [segStart, segEnd], kind, masked: masked.sort((x, y) => x[0] - y[0]) })
  }
  return out
}

const MONTHS = /^(jan(uar|\.)?|feb(ruar|\.)?|m[äa]rz?|apr(il|\.)?|mai|jun[ie]?|jul[iy]?|aug(ust|\.)?|sep(t|tember|\.)?|okt(ober|\.)?|oct(ober|\.)?|nov(ember|\.)?|dez(ember|\.)?|dec(ember|\.)?)$/i

/** Sätze innerhalb eines Segments: Schluss-Interpunktion + Leerraum + Großbuchstabe/Ziffer/Zitatzeichen/Klammer. */
function sentences(text: string, seg: [number, number]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const s = text.slice(seg[0], seg[1])
  // Nachgestellte Quellennummern gehören zum Satz davor; ein `[` beginnt nie einen Satz.
  // Ein Punkt nach einer Zahl ist nur dann eine Ordnungszahl, wenn ein Monatsname folgt
  // („am 18. September"). Sonst trennt er („Das Budget beträgt 10. Die Freigabe …"), damit
  // der erste Satz nicht still unter dem Zitat des zweiten verschwindet (F26).
  const re = /[.!?]["“”»)\]]*(?:\s*\[\d{1,3}\])*(?:\s+(?=[\p{Lu}\p{N}\p{Ll}„"“«(])|(?![\s\S]))/gu
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    const cut = m.index + m[0].length
    const before = s.slice(0, m.index)
    const after = s.slice(cut)
    if (s[m.index] === '.' && /\p{N}$/u.test(before)) {
      const nextWord = (after.match(/^([\p{L}.]+)/u)?.[1] ?? '').replace(/\.$/, '')
      if (nextWord && (MONTHS.test(nextWord) || MONTHS.test(`${nextWord}.`))) continue
    }
    // Kleingeschriebener Satzanfang nur nach einer Zahl mit Punkt (Codex-Fall), sonst wie bisher.
    if (/\p{Ll}/u.test(after[0] ?? '') && !/\p{N}$/u.test(before)) continue
    out.push([seg[0] + last, seg[0] + cut])
    last = cut
  }
  out.push([seg[0] + last, seg[1]])
  return out
    .map(([a, b]) => {
      let start = a
      let end = b
      while (start < end && /\s/.test(text[start])) start++
      while (end > start && /\s/.test(text[end - 1])) end--
      return [start, end] as [number, number]
    })
    .filter(([a, b]) => b > a)
}

function findQuotes(sentence: string): string[] {
  const out: string[] = []
  const re = /[„"“«]([^„"“”«»]{2,}?)["“”»]/g // ab 2 Zeichen: „Nein" ist ein Zitat (F26)
  let m: RegExpExecArray | null
  while ((m = re.exec(sentence)) !== null) out.push(m[1].trim())
  return out
}

export function analyzeCitations(answer: string, sources: string[], opts: CitationOptions = {}): CitationReport {
  const threshold = opts.supportThreshold ?? DEFAULT_THRESHOLD
  const K = sources.length
  const sourceWords = sources.map(contentWords)
  const sourceNorm = sources.map(normalizeWs)

  const refs: CitationRef[] = []
  const sentenceChecks: SentenceCheck[] = []
  const used = new Set<number>()

  for (const { span: seg, kind: segKind, masked: ranges } of segments(answer)) {
    if (segKind === 'heading') {
      sentenceChecks.push({ start: seg[0], end: seg[1], refs: [], status: 'unchecked', coverage: null, quotes: [] })
      continue
    }
    for (const [start, end] of sentences(answer, seg)) {
      // Inline-Code innerhalb des Satzes ausblenden (dort ist `[3]` ein Index, kein Zitat).
      let raw = answer.slice(start, end)
      for (const [a, b] of ranges) {
        if (b <= start || a >= end) continue
        const from = Math.max(a, start) - start
        const to = Math.min(b, end) - start
        raw = raw.slice(0, from) + ' '.repeat(to - from) + raw.slice(to)
      }
      const localRefs: number[] = []
      let invalid = false
      REF_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = REF_RE.exec(raw)) !== null) {
        const n = Number(m[1])
        const valid = n >= 1 && n <= K
        refs.push({ n, start: start + m.index, end: start + m.index + m[0].length, valid })
        if (valid) {
          localRefs.push(n)
          used.add(n)
        } else {
          invalid = true
        }
      }
      const plain = raw.replace(REF_RE, ' ').trim()
      const normalized = normalizeWs(plain).replace(/[.:!…]+$/g, '').trim()
      const quotes = findQuotes(plain).map((q) => {
        const target = localRefs.length > 0 ? localRefs.map((n) => sourceNorm[n - 1]) : sourceNorm
        return { text: q, found: target.some((s) => s.includes(normalizeWs(q))) }
      })

      let status: SentenceStatus
      let coverage: number | null = null
      if (localRefs.length === 0 && !invalid && TRANSITIONS.has(normalized)) {
        status = 'transition'
      } else if (localRefs.length === 0) {
        status = invalid ? 'cited-invalid' : 'uncited'
      } else {
        const words = contentWords(plain)
        if (words.size === 0) {
          status = 'cited-unchecked'
        } else {
          let best = 0
          for (const n of localRefs) {
            const sw = sourceWords[n - 1]
            let hit = 0
            for (const w of words) if (sw.has(w)) hit++
            best = Math.max(best, hit / words.size)
          }
          coverage = best
          status = best >= threshold ? 'cited-high' : 'cited-low'
        }
        if (invalid) status = 'cited-invalid'
      }
      sentenceChecks.push({ start, end, refs: localRefs, status, coverage, quotes })
    }
  }

  const summary = {
    sentences: sentenceChecks.filter((s) => s.status !== 'transition' && s.status !== 'unchecked').length,
    unchecked: sentenceChecks.filter((s) => s.status === 'unchecked').length,
    cited: sentenceChecks.filter((s) => s.status.startsWith('cited') && s.status !== 'cited-invalid').length,
    uncited: sentenceChecks.filter((s) => s.status === 'uncited').length,
    low: sentenceChecks.filter((s) => s.status === 'cited-low').length,
    invalidRefs: refs.filter((r) => !r.valid).length,
    quotesNotFound: sentenceChecks.reduce((n, s) => n + s.quotes.filter((q) => !q.found).length, 0)
  }
  return { refs, sentences: sentenceChecks, usedSources: [...used].sort((a, b) => a - b), summary }
}

/**
 * Ersetzt AUSSCHLIESSLICH die vom Prüfer erkannten gültigen Referenzen (Spannen aus dem
 * Report) — Code, Links und escaped Klammern bleiben bytegetreu (F25). Anzeige und Export
 * nutzen diese eine Funktion; keine Ersetzung über HTML-Strings.
 */
export function replaceCitationRefs(answer: string, report: CitationReport, replacement: (n: number) => string): string {
  const refs = report.refs.filter((r) => r.valid).sort((a, b) => a.start - b.start)
  let out = ''
  let pos = 0
  for (const r of refs) {
    if (r.start < pos) continue
    out += answer.slice(pos, r.start) + replacement(r.n)
    pos = r.end
  }
  return out + answer.slice(pos)
}
