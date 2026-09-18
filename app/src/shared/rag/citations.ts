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
 * Arbeitet auf dem UNVERÄNDERTEN Antwortstring: alle Spannen sind Offsets darin.
 * Code-Zäune und Inline-Code werden übersprungen (dort sind `[1]` Array-Indizes).
 * Überleitungen sind nur dann ausgenommen, wenn das GANZE Segment exakt in der
 * Liste steht („Kurz gesagt:" allein) — nie als Präfix (Rückfrage 3).
 */

export type SentenceStatus =
  | 'cited-high'
  | 'cited-low'
  | 'cited-unchecked'
  | 'cited-invalid'
  | 'uncited'
  | 'transition'

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

const REF_RE = /\[(\d{1,3})\]/g

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

/** Bereiche, die keine Prosa sind: Code-Zäune und Inline-Code. */
function maskedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  // `(?![\s\S])` = Ende der Eingabe (mit dem m-Flag wäre `$` nur ein Zeilenende).
  const fence = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\1[ \t]*(?=\n|(?![\s\S]))|(?![\s\S]))/gm
  let m: RegExpExecArray | null
  while ((m = fence.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length])
  const inline = /`[^`\n]+`/g
  while ((m = inline.exec(text)) !== null) {
    const s = m.index
    if (!ranges.some(([a, b]) => s >= a && s < b)) ranges.push([s, s + m[0].length])
  }
  return ranges.sort((a, b) => a[0] - b[0])
}

function isMasked(pos: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([a, b]) => pos >= a && pos < b)
}

/** Prosa-Segmente (Absätze, Listenpunkte, Zeilen) als Spannen, ohne Überschriften und Code. */
function segments(text: string, ranges: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let pos = 0
  while (pos <= text.length) {
    const nl = text.indexOf('\n', pos)
    const end = nl === -1 ? text.length : nl
    if (!isMasked(pos, ranges)) {
      const line = text.slice(pos, end)
      const trimmedStart = pos + (line.length - line.trimStart().length)
      const trimmedEnd = end - (line.length - line.trimEnd().length)
      const body = line.trim()
      const isHeading = /^#{1,6}\s/.test(body)
      const isRule = /^(-{3,}|\*{3,}|_{3,})$/.test(body)
      const isTableRow = body.startsWith('|')
      if (body && !isHeading && !isRule && !isTableRow) {
        // Listen-/Zitatmarker gehören nicht zum Satz.
        const markerMatch = body.match(/^(?:[-*+]\s+|\d+[.)]\s+|>\s*)+/)
        const start = trimmedStart + (markerMatch ? markerMatch[0].length : 0)
        if (start < trimmedEnd) out.push([start, trimmedEnd])
      }
    }
    if (nl === -1) break
    pos = nl + 1
  }
  return out
}

/** Sätze innerhalb eines Segments: Schluss-Interpunktion + Leerraum + Großbuchstabe/Ziffer/Zitatzeichen/Klammer. */
function sentences(text: string, seg: [number, number]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const s = text.slice(seg[0], seg[1])
  // Nachgestellte Quellennummern gehören zum Satz davor; ein `[` beginnt nie einen Satz.
  // Ein Punkt direkt nach einer Ziffer ist eine Ordnungszahl („am 18. September"), kein Satzende.
  const re = /(?:(?<!\p{N})\.|[!?])["“”»)\]]*(?:\s*\[\d{1,3}\])*(?:\s+(?=[\p{Lu}\p{N}„"“«(])|(?![\s\S]))/gu
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    const cut = m.index + m[0].length
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
  const re = /[„"“«]([^„"“”«»]{8,}?)["“”»]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(sentence)) !== null) out.push(m[1].trim())
  return out
}

export function analyzeCitations(answer: string, sources: string[], opts: CitationOptions = {}): CitationReport {
  const threshold = opts.supportThreshold ?? DEFAULT_THRESHOLD
  const K = sources.length
  const ranges = maskedRanges(answer)
  const sourceWords = sources.map(contentWords)
  const sourceNorm = sources.map(normalizeWs)

  const refs: CitationRef[] = []
  const sentenceChecks: SentenceCheck[] = []
  const used = new Set<number>()

  for (const seg of segments(answer, ranges)) {
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
    sentences: sentenceChecks.filter((s) => s.status !== 'transition').length,
    cited: sentenceChecks.filter((s) => s.status.startsWith('cited') && s.status !== 'cited-invalid').length,
    uncited: sentenceChecks.filter((s) => s.status === 'uncited').length,
    low: sentenceChecks.filter((s) => s.status === 'cited-low').length,
    invalidRefs: refs.filter((r) => !r.valid).length,
    quotesNotFound: sentenceChecks.reduce((n, s) => n + s.quotes.filter((q) => !q.found).length, 0)
  }
  return { refs, sentences: sentenceChecks, usedSources: [...used].sort((a, b) => a - b), summary }
}
