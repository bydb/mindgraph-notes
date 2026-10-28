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
  /**
   * Überschriften und Dateinamen der Quellen. Steht genau einer davon in Anführungszeichen, ist das
   * die Nennung eines Dokuments, keine Behauptung über seinen Inhalt — und die App vergleicht dabei
   * mit Titeln, die sie selbst geliefert hat, nicht mit Text des Modells.
   *
   * Eine frühere Ausnahme für Begriffe aus der FRAGE ist wieder entfallen (Codex F46): sie hätte
   * ein erfundenes Kurzzitat durchgelassen, sobald sein Wortlaut zufällig in der Frage stand
   * („Hat er ‚abgesagt‘ gesagt?“ → „Er sagte ‚abgesagt‘“). Ein übersehenes Falschzitat wiegt
   * schwerer als eine überflüssige Markierung.
   */
  sourceTitles?: string[]
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

// Abkürzungen mit Punkt, nach denen KEIN Satz endet („TinkerSchool bzw. TinkerToys“ wurde
// real am „bzw.“ zerschnitten, die erste Hälfte stand dann als „ohne Quellenangabe“ da,
// 25.09.2026). Bewusst ohne „usw.“/„etc.“: die schließen oft wirklich einen Satz, und zwei
// verschmolzene Sätze würden einen unbelegten unter dem Zitat des anderen verstecken (F26).
const ABBREVIATION_BEFORE_DOT = /(?:^|[^\p{L}])(?:bzw|bzgl|ca|ggf|evtl|vgl|bspw|inkl|zzgl|sog|Nr|Dr|Prof|Hr|Fr|Abs|Kap|Mio|Mrd|Hrsg|Anm|Tel|vs|ff|Jh|[zdousZDOUS]\.\s?[\p{L}]|[zdou])$/u
// Abkürzungen, die auch ganze Wörter sein können („auf diese Art.“): nur vor einer Zahl
// („Az. 1 BvR 2524/24“, „Art. 5 GG“, „Rn. 12“) gelten sie als Abkürzung (Petrol-Websuche,
// real 24.10.2026: das Aktenzeichen zerschnitt einen Satz).
const ABBREVIATION_BEFORE_NUMBER = /(?:^|[^\p{L}])(?:Az|Art|Rn|Rz|Ziff|lit|Bd|Aufl|Bl|Sp)$/u
// Ordnungszahl nach Artikel/Präposition („der 25. KEF-Bericht“, „im 3. Quartal“): dort endet
// kein Satz. Ohne dieses Wort davor bleibt es beim Trennen („Das Budget beträgt 10. Die …“, F26).
const ORDINAL_LEAD = /(?:^|[^\p{L}])(?:der|die|das|dem|den|des|ein|eine|einem|einen|einer|eines|am|im|vom|zum|zur|beim|ab|bis|seit|je|jeder|jede|jedes|jeden|jedem|the)\s+\d{1,4}$/iu

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
    if (s[m.index] === '.' && ABBREVIATION_BEFORE_DOT.test(before)) continue
    if (s[m.index] === '.' && ABBREVIATION_BEFORE_NUMBER.test(before) && /^\p{N}/u.test(after)) continue
    if (s[m.index] === '.' && ORDINAL_LEAD.test(before) && /^\p{L}/u.test(after)) continue
    if (s[m.index] === '.' && /\p{N}$/u.test(before)) {
      const nextWord = (after.match(/^([\p{L}.]+)/u)?.[1] ?? '').replace(/\.$/, '')
      if (nextWord && (MONTHS.test(nextWord) || MONTHS.test(`${nextWord}.`))) continue
    }
    // „… steht nichts. [1] nennt …“: das Modell macht die Quelle zum Subjekt. Die Nummer vor
    // einem kleingeschriebenen Wort eröffnet den neuen Satz, statt den alten zu verlängern —
    // sonst verschmolzen beide, und die Verneinung des ersten hing am Beleg des zweiten
    // (Vergleich mit Claude, 25.10.2026).
    if (/\p{Ll}/u.test(after[0] ?? '') && /\[\d{1,3}\]/.test(m[0])) {
      const punctEnd = m.index + (/^[.!?]["“”»)\]]*/.exec(m[0])?.[0].length ?? 1)
      out.push([seg[0] + last, seg[0] + punctEnd])
      last = punctEnd
      continue
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

/**
 * Zwischenzeile wie `**Einordnung**`: eine ganze Zeile nur aus kurzem Fettdruck ohne Quellennummer.
 * Der Systemtext erlaubt sie statt `#`-Überschriften; sie ist ein Abschnittstitel, keine Aussage
 * (Codex F08, sonst zählte sie als ungeprüftes Modellwissen).
 */
function isBoldLabelLine(text: string, seg: [number, number]): boolean {
  const lineStart = text.lastIndexOf('\n', seg[0] - 1) + 1
  const nl = text.indexOf('\n', seg[1])
  const line = text.slice(lineStart, nl < 0 ? text.length : nl).trim()
  // Nur eine knappe Bezeichnung: keine Ziffer, kein Satzende, höchstens fünf Wörter. Ein fett gesetzter
  // Tatsachensatz („**Der Preis beträgt 199 €.**“) bleibt prüfpflichtig (Codex F09).
  const m = /^(\*\*|__)([^*_\n\[\]]{1,60})\1:?$/.exec(line)
  if (!m) return false
  const inner = m[2].trim()
  return !/\d/.test(inner) && !/[.!?;]$/.test(inner) && inner.split(/\s+/).length <= 5
}

/** Ausschnitt mit ausgeblendetem Inline-Code und Linkzielen (dort ist `[3]` kein Zitat). */
function maskedSlice(text: string, start: number, end: number, ranges: ReadonlyArray<[number, number]>): string {
  let raw = text.slice(start, end)
  for (const [a, b] of ranges) {
    if (b <= start || a >= end) continue
    const from = Math.max(a, start) - start
    const to = Math.min(b, end) - start
    raw = raw.slice(0, from) + ' '.repeat(to - from) + raw.slice(to)
  }
  return raw
}

export function analyzeCitations(answer: string, sources: string[], opts: CitationOptions = {}): CitationReport {
  const threshold = opts.supportThreshold ?? DEFAULT_THRESHOLD
  const K = sources.length
  const sourceWords = sources.map(contentWords)
  const sourceNorm = sources.map(normalizeWs)
  const titleNorm = (opts.sourceTitles ?? []).map(normalizeWs).filter(Boolean)

  const refs: CitationRef[] = []
  const sentenceChecks: SentenceCheck[] = []
  const used = new Set<number>()

  const segs = segments(answer)
  // Tabellenzeile: eine Nummer in einer Zelle gilt für die übrigen Zellen der Zeile. Der Systemtext
  // verlangt sie einmal je Zeile statt in jeder Zelle — sonst stand hinter jeder Zahl „[2]“, und
  // ohne Erbe galt jede Zahl der Zeile als „ohne Quelle“ (Nutzertest 28.10.2026).
  // Gezählt wird erst nach dem Ausblenden (Inline-Code, Linkziele), sonst belegte `[1]` im Code die
  // Zeile (Codex F01). Geerbt wird nur bei GENAU einer Quelle in der Zeile und ohne ungültige
  // Nummer: bei mehreren ist unklar, welche eine Zelle stützt (F05).
  const lineOf = (pos: number): number => answer.lastIndexOf('\n', pos - 1) + 1
  const rowSeen = new Map<number, { valid: Set<number>; invalid: boolean }>()
  for (const { span: seg, kind, masked: ranges } of segs) {
    if (kind !== 'cell') continue
    const row = rowSeen.get(lineOf(seg[0])) ?? { valid: new Set<number>(), invalid: false }
    for (const m of maskedSlice(answer, seg[0], seg[1], ranges).matchAll(REF_RE)) {
      const n = Number(m[1])
      if (n >= 1 && n <= K) row.valid.add(n)
      else row.invalid = true
    }
    rowSeen.set(lineOf(seg[0]), row)
  }
  const rowRef = (pos: number): number[] => {
    const row = rowSeen.get(lineOf(pos))
    return row && !row.invalid && row.valid.size === 1 ? [...row.valid] : []
  }

  for (const { span: seg, kind: segKind, masked: ranges } of segs) {
    if (segKind === 'heading' || (segKind === 'prose' && isBoldLabelLine(answer, seg))) {
      sentenceChecks.push({ start: seg[0], end: seg[1], refs: [], status: 'unchecked', coverage: null, quotes: [] })
      continue
    }
    for (const [start, end] of sentences(answer, seg)) {
      // Inline-Code innerhalb des Satzes ausblenden (dort ist `[3]` ein Index, kein Zitat).
      const raw = maskedSlice(answer, start, end, ranges)
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
      if (localRefs.length === 0 && !invalid && segKind === 'cell') localRefs.push(...rowRef(start))
      const plain = raw.replace(REF_RE, ' ').trim()
      const normalized = normalizeWs(plain).replace(/[.:!…]+$/g, '').trim()
      const quotes = findQuotes(plain).flatMap((q) => {
        const nq = normalizeWs(q)
        // Einzige Ausnahme: der Ausdruck ist GENAU der Titel einer gelieferten Quelle (Nennung
        // eines Dokuments). Alles andere wird gegen die Quelle geprüft (Codex F46).
        if (titleNorm.some((t) => t === nq)) return []
        const target = localRefs.length > 0 ? localRefs.map((n) => sourceNorm[n - 1]) : sourceNorm
        return [{ text: q, found: target.some((s) => s.includes(nq)) }]
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
 * Quellen, die mindestens einen Satz tragen, der die Prüfung besteht (hohe Wortdeckung
 * oder nicht prüfbar). Für die Anzeige: Das Modell zitiert gern auch unpassende Treffer
 * in einem Sammelsatz („Weitere Quellen betreffen andere Themen [4][5][6]“) — solche
 * Sätze haben niedrige Wortdeckung, ihre Quellen gehören nicht nach oben (real, 25.09.2026).
 * Aufsteigend sortiert.
 */
export function supportingSources(report: CitationReport): number[] {
  const out = new Set<number>()
  for (const s of report.sentences) {
    if (s.status === 'cited-high' || s.status === 'cited-unchecked') for (const n of s.refs) out.add(n)
  }
  return [...out].sort((a, b) => a - b)
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
