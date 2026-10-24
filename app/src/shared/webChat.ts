// Websuche im Petrol-Chat (Stufe 1b) — reine Bausteine, prozessübergreifend.
//
// Bauplan: docs/codex-collab/chat-websuche.md (Rev. 4). Ziel des Ganzen ist GERINGE
// HALLUZINATION: das Modell antwortet aus Seiten, die die App selbst abgerufen hat, und die
// Anzeige klingt nie stärker als die Prüfung (Wortvergleich, kein Faktencheck).
//
// Hier liegt alles, was ohne Netz und ohne Electron prüfbar ist:
// - Treffer → Kandidaten (normalisiert, dedupliziert, nur http/https; F10)
// - Abruf-Warteschlange mit synchroner Reservierung (F16)
// - gemeinsames Modellbudget für Verlauf und Quellen (F17)
// - Einfrieren der modell-sichtbaren Auszüge als kanonische Quellenliste (F06, F19)
// - Fußnoten-Export (F13)

import { hostnameFromUrl, normalizeWebUrl, type WebSearchHit } from './webResearch'
import { contentWords, replaceCitationRefs, type CitationReport, type SentenceCheck } from './rag/citations'
import { cloudRoutesForFeature, type CloudProviderSettings } from './llmBackend'

// ── Grenzen ──────────────────────────────────────────────────────────────────

/**
 * Ab hier liefern Suchanbieter erfahrungsgemäß schlechtere Treffer (Tavily rät zu kurzen,
 * gezielten Suchen). Real im Nutzertest 24.10.2026: zwei ganze Fragen hintereinander (~240
 * Zeichen) brachten bei Tavily nur fremdsprachige Spam-Seiten. Nur ein Hinweis, keine Sperre.
 */
export const WEB_CHAT_QUERY_SOFT_MAX = 150
/** Höchstens so viele Seiten gehen ans Modell. */
export const WEB_CHAT_MAX_SOURCES = 3
/** Höchstens so viele Abrufe startet ein Lauf (Erfolg, Fehler, leer zählen gleich). */
export const WEB_CHAT_MAX_ATTEMPTS = 5
/** Netzfrist für Suche + Abrufe — bestmöglich, keine Garantie (F03). */
export const WEB_CHAT_NET_DEADLINE_MS = 25_000
/** Gemeinsame Grenze für Systemtext + Frage + Verlauf + Quellen (F17). */
export const WEB_CHAT_TOTAL_BUDGET = 20_000
export const WEB_CHAT_HISTORY_MAX = 4_000
export const WEB_CHAT_SOURCES_MAX = 12_000
/** Darunter bekommen Quellen Vorrang vor weiterem Verlauf. */
export const WEB_CHAT_SOURCES_MIN = 3_000
/** Reserve für die Antwort im Kontextfenster (Token). */
export const WEB_CHAT_ANSWER_TOKENS = 1_536
/** Vorsichtige Umrechnung: deutsche Texte liegen eher bei 3,5–4 Zeichen je Token. */
export const WEB_CHAT_CHARS_PER_TOKEN = 3
/** Untergrenze für `num_ctx` — Ollamas Vorgabe (oft 4096) schnitte den Prompt still vorne ab. */
export const WEB_CHAT_MIN_NUM_CTX = 8_192

// ── Kontextfenster (F17, Runde 4) ────────────────────────────────────────────

/**
 * Zeichengrenze für den ganzen Prompt. Ohne bekanntes Fenster (Cloud, LM Studio) gilt der
 * Startwert; bei bekanntem Fenster passt der Prompt samt Antwortreserve hinein.
 */
export function webChatCharBudget(contextTokens: number | null): number {
  if (!contextTokens || contextTokens <= 0) return WEB_CHAT_TOTAL_BUDGET
  return Math.max(0, Math.min(WEB_CHAT_TOTAL_BUDGET, (contextTokens - WEB_CHAT_ANSWER_TOKENS) * WEB_CHAT_CHARS_PER_TOKEN))
}

/**
 * `num_ctx` für lokales Ollama: groß genug für Prompt + Antwort (mit Puffer), mindestens
 * 8192, nie über dem, was das Modell laut Ollama kann. Ohne Setzung schneidet Ollama einen
 * zu langen Prompt STILL vorne ab — Regeln und Quellen gingen verloren, das Modell
 * antwortete aus dem Gedächtnis.
 */
export function webChatNumCtx(promptChars: number, contextTokens: number | null): number {
  const needed = Math.ceil(promptChars / WEB_CHAT_CHARS_PER_TOKEN) + WEB_CHAT_ANSWER_TOKENS
  const want = Math.max(WEB_CHAT_MIN_NUM_CTX, 1024 * Math.ceil((needed * 1.15) / 1024))
  return contextTokens && contextTokens > 0 ? Math.min(want, contextTokens) : want
}

/** Kontextlänge aus der Antwort von Ollamas `/api/show` (`model_info.<arch>.context_length`). */
export function contextLengthFromShow(json: unknown): number | null {
  const info = (json as { model_info?: Record<string, unknown> } | null)?.model_info
  if (!info || typeof info !== 'object') return null
  for (const [k, v] of Object.entries(info)) {
    if (k.endsWith('.context_length') && typeof v === 'number' && v > 0) return v
  }
  return null
}

// ── Cloud-Freigabe im Main (F24, Runde 4) ────────────────────────────────────

/**
 * Darf der Web-Chat dieses Cloud-Modell nutzen? Dieselbe Freigabe wie die Modellwahl im
 * Fenster (`notes-chat`), aber aus den gespeicherten Einstellungen gelesen — ein veralteter
 * oder manipulierter Renderer-Zustand schickt sonst Seitenauszüge an einen Anbieter, den
 * der Nutzer abgeschaltet hat.
 */
export function petrolCloudAllowed(
  cloud: { model: string; provider?: 'openrouter' | 'llmbase' } | null | undefined,
  providers: { openrouter?: CloudProviderSettings; llmbase?: CloudProviderSettings } | undefined
): boolean {
  if (!cloud?.model) return true
  const provider = cloud.provider === 'llmbase' ? 'llmbase' : 'openrouter'
  return cloudRoutesForFeature('notes-chat', providers ?? {}).some((r) => r.provider === provider && r.model === cloud.model.trim())
}

// ── Typen ────────────────────────────────────────────────────────────────────

export interface WebChatCandidate {
  /** Position in der Trefferliste (nach Deduplizierung) — bestimmt die Nummernfolge. */
  index: number
  url: string
  host: string
  title: string
}

/** Eine Seite, die das Modell gesehen hat. Kanonisch für Prompt, Prüfung, Anzeige, Export. */
export interface WebSource {
  n: number
  title: string
  url: string
  host: string
  fetchedAt: string
  /** Exakt der Text, den das Modell sah (bereinigt, gekürzt). */
  excerpt: string
  /** Länge des aufbereiteten Seitentexts vor jeder Kürzung. */
  originalChars: number
  truncated: boolean
}

export type WebFetchFailReason = 'timeout' | 'stopped' | 'empty' | 'too-large' | 'http' | 'type' | 'blocked' | 'error'

export interface WebFetchFailure {
  host: string
  reason: WebFetchFailReason
}

/** Treffer ohne Abruf — nur für den Fall K = 0, nie Quelle (F18). */
export interface WebUnfetchedHit {
  title: string
  host: string
  url: string
}

export type WebFetchOutcome =
  | { ok: true; title: string; finalUrl: string; fetchedAt: string; text: string; originalChars: number; truncated: boolean }
  | { ok: false; reason: WebFetchFailReason }

/** Was unter der Antwort steht — aus dem Main, nie aus dem Renderer geschätzt (F11, F14). */
export interface WebChatProvenance {
  /** Suchanbieter, der tatsächlich kontaktiert wurde (null = Suche nicht ausgelöst). */
  searchProvider: string | null
  searchOk: boolean
  fetchAttempts: number
  fetchOk: number
  /** Hosts, die tatsächlich abgerufen wurden (auch Fehlversuche), in Abrufreihenfolge. */
  contactedHosts: string[]
  /** Tatsächlicher Modellweg dieses Laufs (Main-Einstufung). */
  route: 'local' | 'cloud' | 'unverified' | null
  routeLabel: string
  /** Phase, in der der Lauf endete, wenn nicht regulär. */
  endedIn?: 'search' | 'fetch' | 'model'
}

export interface WebChatResult {
  kind: 'answer' | 'nothing-readable' | 'error' | 'stopped'
  answer?: string
  sources: WebSource[]
  report?: CitationReport
  /** Zusatzprüfungen je Satz, ausgerichtet an `report.sentences` (F21). */
  extras?: SentenceExtra[]
  failures: WebFetchFailure[]
  /** Nicht abgerufene Treffer (Anzahl), bzw. bei K = 0 die Treffer selbst. */
  notFetched: number
  unfetchedHits?: WebUnfetchedHit[]
  provenance: WebChatProvenance
  error?: string
}

/** Renderer → Main. Keine URLs, kein Anbieter, kein Schlüssel (F01). */
export interface PetrolWebRequest {
  requestId: string
  question: string
  query: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  model: string
  backend: 'ollama' | 'lmstudio'
  lmStudioPort?: number
  cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null
  /** Eigene frühere Webfragen des Nutzers als Thema (chat-webthema-im-verlauf.md); der Main prüft. */
  webTopics?: Array<{ text: string; clipped: boolean }>
}

export interface PetrolWebProgress {
  requestId: string
  phase: 'search' | 'fetch' | 'model'
  started?: number
  host?: string | null
  /** Ab der Modellphase: die eingefrorenen Quellen. */
  sources?: WebSource[]
  failures?: WebFetchFailure[]
  notFetched?: number
}

// ── Nachfragen (docs/codex-collab/chat-suchwoerter-vorschlag.md, F07) ─────────

/** Die zuletzt tatsächlich gesendeten Suchwörter im Gespräch, oder null. */
export function lastSentWebQuery(messages: ReadonlyArray<{ role: string; origin?: string; webQuery?: string }>): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user' && m.origin === 'web' && m.webQuery?.trim()) return m.webQuery.trim()
  }
  return null
}

/**
 * Suchwörter für eine Nachfrage: vorige Suche + neue Frage, nur zusammengesetzt, ohne Modell.
 * Kein Wort, das der Nutzer nicht selbst geschrieben hat; die Länge prüft wie immer
 * `isQueryTooLong` sichtbar im Feld — hier wird nichts gekürzt.
 */
export function followUpQuery(previousQuery: string, question: string): string {
  const prev = previousQuery.replace(/\s+/g, ' ').trim()
  const q = question.replace(/\s+/g, ' ').trim()
  if (!q || prev.toLowerCase() === q.toLowerCase()) return prev
  return prev ? `${prev} ${q}` : q
}

// ── Treffer → Kandidaten ─────────────────────────────────────────────────────

/** Normalisiert, dedupliziert und begrenzt die Treffer; Reihenfolge des Anbieters bleibt. */
export function candidatesFromHits(hits: readonly WebSearchHit[], max = 8): WebChatCandidate[] {
  const seen = new Set<string>()
  const out: WebChatCandidate[] = []
  for (const h of hits) {
    const url = normalizeWebUrl(h.url)
    if (!url || seen.has(url)) continue
    const host = hostnameFromUrl(url)
    if (!host) continue
    seen.add(url)
    out.push({ index: out.length, url, host, title: (h.title || '').trim() })
    if (out.length >= max) break
  }
  return out
}

// ── Abruf-Warteschlange (F16) ────────────────────────────────────────────────

export interface FetchQueueOptions {
  maxAttempts?: number
  maxUsable?: number
  maxOpen?: number
  /** Gesetzt, sobald Frist oder Stopp greifen: kein neuer Start, späte Ergebnisse verworfen. */
  stopReason: () => 'timeout' | 'stopped' | null
  /** Wird synchron beim Start eines Abrufs gemeldet (Fortschritt, Provenienz). */
  onStart?: (c: WebChatCandidate) => void
}

export interface QueueEntry {
  candidate: WebChatCandidate
  outcome: WebFetchOutcome
}

/**
 * Startet Abrufe so, dass nie mehr als `maxUsable` brauchbare Seiten entstehen können und
 * nie mehr als `maxAttempts` Starts passieren. Die Prüfung in `startNext` ist synchron —
 * zwischen Prüfung und Zählererhöhung kann kein anderer Abschluss dazwischenkommen.
 * Eine langsame Seite blockiert nichts: jeder Abschluss füllt höchstens einen Platz nach.
 * Ergebnisse, die nach Frist oder Stopp eintreffen, werden verworfen (nicht nur überholt).
 */
export function runFetchQueue(
  candidates: readonly WebChatCandidate[],
  fetchOne: (c: WebChatCandidate) => Promise<WebFetchOutcome>,
  opts: FetchQueueOptions
): Promise<QueueEntry[]> {
  const maxAttempts = opts.maxAttempts ?? WEB_CHAT_MAX_ATTEMPTS
  const maxUsable = opts.maxUsable ?? WEB_CHAT_MAX_SOURCES
  const maxOpen = opts.maxOpen ?? WEB_CHAT_MAX_SOURCES
  const entries: QueueEntry[] = []
  let next = 0
  let attempts = 0
  let open = 0
  let usable = 0

  return new Promise<QueueEntry[]>((resolve) => {
    const finishIfIdle = () => {
      if (open === 0) resolve(entries)
    }
    const startNext = (): boolean => {
      if (opts.stopReason()) return false
      if (attempts >= maxAttempts || next >= candidates.length) return false
      if (usable + open >= maxUsable || open >= maxOpen) return false
      const candidate = candidates[next++]
      attempts++
      open++
      opts.onStart?.(candidate)
      let p: Promise<WebFetchOutcome>
      try {
        p = fetchOne(candidate)
      } catch {
        p = Promise.resolve({ ok: false, reason: 'error' })
      }
      void p
        .catch((): WebFetchOutcome => ({ ok: false, reason: 'error' }))
        .then((raw) => {
          open--
          const stop = opts.stopReason()
          let outcome: WebFetchOutcome = raw
          if (stop) outcome = { ok: false, reason: stop }
          else if (raw.ok && !raw.text.trim()) outcome = { ok: false, reason: 'empty' }
          if (outcome.ok) usable++
          entries.push({ candidate, outcome })
          startNext()
          finishIfIdle()
        })
      return true
    }
    for (let i = 0; i < maxOpen; i++) if (!startNext()) break
    finishIfIdle()
  })
}

// ── Budget (F17) ─────────────────────────────────────────────────────────────

export interface BudgetMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BudgetInput {
  systemChars: number
  questionChars: number
  history: readonly BudgetMessage[]
  /** Aufbereitete Seitentexte in Nummernfolge. */
  pages: readonly string[]
  total?: number
  historyMax?: number
  sourcesMax?: number
  sourcesMin?: number
}

export interface BudgetResult {
  history: BudgetMessage[]
  excerpts: Array<{ text: string; cut: boolean }>
  sourcesBudget: number
}

const historyChars = (h: readonly BudgetMessage[]) => h.reduce((n, m) => n + m.content.length, 0)

/** Kürzt am Ende, möglichst an einer Wortgrenze in den letzten 200 Zeichen. */
export function cutAtEnd(text: string, max: number): string {
  if (text.length <= max) return text
  if (max <= 0) return ''
  const hard = text.slice(0, max)
  const ws = hard.search(/\s\S*$/)
  return (ws > max - 200 && ws > 0 ? hard.slice(0, ws) : hard).trimEnd()
}

/**
 * Feste Reihenfolge: (1) älteste Verlaufsnachrichten fallen ganz weg, bis höchstens
 * `historyMax` Zeichen Verlauf bleiben; reicht der Rest dann nicht für `sourcesMin`, fällt
 * weiterer Verlauf. (2) Quellen bekommen den Rest, höchstens `sourcesMax`, gleichmäßig
 * verteilt, Ungenutztes geht an längere Seiten; gekürzt wird je Seite am Ende.
 * Systemtext und Frage werden nie gekürzt.
 */
export function applyWebChatBudget(input: BudgetInput): BudgetResult {
  const total = input.total ?? WEB_CHAT_TOTAL_BUDGET
  const historyMax = input.historyMax ?? WEB_CHAT_HISTORY_MAX
  const sourcesMax = input.sourcesMax ?? WEB_CHAT_SOURCES_MAX
  const sourcesMin = input.sourcesMin ?? WEB_CHAT_SOURCES_MIN
  const fixed = input.systemChars + input.questionChars

  const history = [...input.history]
  while (history.length > 0 && historyChars(history) > historyMax) history.shift()
  while (history.length > 0 && total - fixed - historyChars(history) < sourcesMin) history.shift()

  const budget = Math.max(0, Math.min(sourcesMax, total - fixed - historyChars(history)))
  const K = input.pages.length
  const alloc = new Array<number>(K).fill(0)
  let remaining = budget
  let open = input.pages.map((_, i) => i).filter((i) => input.pages[i].length > 0)
  // Wasserstand: wer weniger braucht als den gleichen Anteil, gibt den Rest an die anderen ab.
  while (open.length > 0 && remaining > 0) {
    const share = Math.floor(remaining / open.length)
    if (share === 0) break
    const stillOpen: number[] = []
    for (const i of open) {
      const give = Math.min(input.pages[i].length - alloc[i], share)
      alloc[i] += give
      remaining -= give
      if (input.pages[i].length > alloc[i]) stillOpen.push(i)
    }
    open = stillOpen
  }
  const excerpts = input.pages.map((text, i) => {
    const cut = text.length > alloc[i]
    return { text: cut ? cutAtEnd(text, alloc[i]) : text, cut }
  })
  return { history, excerpts, sourcesBudget: budget }
}

// ── Einfrieren (F06, F19) ────────────────────────────────────────────────────

/**
 * Brauchbare Abrufe in Trefferreihenfolge ordnen, dicht nummerieren, Budget anwenden —
 * und ERST DANN einfrieren. Der Auszug ist exakt der Text, den das Modell sieht.
 * `prepare` bereinigt den Seitentext für den Prompt (untrusted), bevor gekürzt wird.
 */
export function freezeWebSources(
  entries: readonly QueueEntry[],
  budget: Omit<BudgetInput, 'pages'>,
  prepare: (text: string) => string
): { sources: WebSource[]; failures: WebFetchFailure[]; history: BudgetMessage[] } {
  const ordered = [...entries].sort((a, b) => a.candidate.index - b.candidate.index)
  const okEntries: Array<{ c: WebChatCandidate; o: Extract<WebFetchOutcome, { ok: true }>; text: string }> = []
  const failures: WebFetchFailure[] = []
  for (const e of ordered) {
    if (!e.outcome.ok) {
      failures.push({ host: e.candidate.host, reason: e.outcome.reason })
      continue
    }
    const text = prepare(e.outcome.text).trim()
    if (!text) {
      failures.push({ host: e.candidate.host, reason: 'empty' })
      continue
    }
    okEntries.push({ c: e.candidate, o: e.outcome, text })
  }
  const kept = okEntries.slice(0, WEB_CHAT_MAX_SOURCES)
  const b = applyWebChatBudget({ ...budget, pages: kept.map((k) => k.text) })
  const sources: WebSource[] = kept.map((k, i) => {
    const finalHost = hostnameFromUrl(k.o.finalUrl) ?? k.c.host
    return {
      n: i + 1,
      title: k.o.title || k.c.title || finalHost,
      url: k.o.finalUrl,
      host: finalHost,
      fetchedAt: k.o.fetchedAt,
      excerpt: b.excerpts[i].text,
      originalChars: k.o.originalChars,
      truncated: k.o.truncated || b.excerpts[i].cut
    }
  }).filter((s) => s.excerpt.trim().length > 0).map((s, i) => ({ ...s, n: i + 1 }))
  return { sources, failures, history: b.history }
}

/**
 * Einfrieren mit Nachmessen (F17, Runde 4): `systemChars` ist vor dem Einfrieren nur
 * geschätzt (Titel und Hosts kennt erst die fertige Liste). Liegt der FERTIGE Prompt —
 * `measure` baut ihn wirklich — über `budget.total`, wird mit genau um den Überhang
 * kleinerem Quellenbudget erneut eingefroren. Die Quellen schrumpfen, Systemtext und Frage nie.
 */
export function freezeWebSourcesToFit(
  entries: readonly QueueEntry[],
  budget: Omit<BudgetInput, 'pages'> & { total: number },
  prepare: (text: string) => string,
  measure: (frozen: { sources: WebSource[]; history: BudgetMessage[] }) => number
): ReturnType<typeof freezeWebSources> {
  let frozen = freezeWebSources(entries, budget, prepare)
  for (let i = 0; i < 3; i++) {
    const overflow = measure(frozen) - budget.total
    if (overflow <= 0 || frozen.sources.length === 0) break
    const sourceChars = frozen.sources.reduce((n, src) => n + src.excerpt.length, 0)
    frozen = freezeWebSources(entries, { ...budget, sourcesMax: Math.max(0, sourceChars - overflow - 50) }, prepare)
  }
  return frozen
}

// ── Zusatzprüfungen je Satz (F21, Runde 4) ───────────────────────────────────

const NEGATIONS = new Set([
  'nicht', 'kein', 'keine', 'keinen', 'keinem', 'keiner', 'keines', 'nie', 'niemals', 'nichts', 'weder', 'nirgends',
  'not', 'no', 'never', 'none', 'nothing', 'neither', 'nor'
])

export interface SentenceExtra {
  /** Zahlen im Satz, die in keiner zitierten Seite vorkommen. */
  missingNumbers: string[]
  /** Satz enthält eine Verneinung — der Wortvergleich kann sie nicht prüfen. */
  negation: boolean
  /**
   * Satz ohne Nummer, der nur eine Lücke der Seiten benennt („Dazu steht in den abgerufenen
   * Seiten nichts.“). Genau das verlangt der Prompt — er soll nicht als „ohne Quellennummer“
   * Alarm auslösen (Nutzertest 24.10.2026), bleibt aber sichtbar als „Lücke benannt“.
   */
  gap?: boolean
}

// Lücken-Satz: nennt die Seiten/Auszüge/Quellen UND ihr Fehlen, ohne eigene Zahl, kurz.
// Eine Zahl oder ein langer Satz kann eine Behauptung tragen — dann bleibt die Warnung.
const GAP_SOURCE = /\b(?:seiten|auszüge|auszügen|auszugen|quellen|pages|excerpts|sources)\b/iu
const GAP_ABSENCE = /\b(?:nicht|nichts|kein|keine|keinen|keinem|keiner|fehlt|fehlen|unklar|not|no|nothing|none|missing)\b/iu
export function isGapStatement(sentence: string): boolean {
  const plain = sentence.replace(/(?<!\\)\[\d{1,3}\]/g, ' ').trim()
  return plain.length <= 220 && !/\p{N}/u.test(plain) && GAP_SOURCE.test(plain) && GAP_ABSENCE.test(plain)
}

/**
 * Deterministische Ergänzung zum Wortvergleich, ausgerichtet an `report.sentences`:
 * „Der Vertrag wurde nicht geschlossen [1]“ hat hohe Wortdeckung mit „Der Vertrag wurde
 * geschlossen“, und eine erfundene Zahl fällt im Wortanteil kaum ins Gewicht. Beides wird
 * deshalb eigens markiert. Geprüft werden nur Sätze mit gültiger Nummer; bei Sätzen ohne
 * Nummer steht schon „ohne Quellennummer“.
 */
export function sentenceExtras(answer: string, report: CitationReport, excerpts: readonly string[]): SentenceExtra[] {
  const sourceWords = excerpts.map(contentWords)
  return report.sentences.map((s: SentenceCheck) => {
    if (s.refs.length === 0) {
      return { missingNumbers: [], negation: false, gap: s.status === 'uncited' && isGapStatement(answer.slice(s.start, s.end)) }
    }
    const plain = answer.slice(s.start, s.end).replace(/(?<!\\)\[\d{1,3}\]/g, ' ')
    const words = contentWords(plain)
    const cited = s.refs.map((n) => sourceWords[n - 1]).filter(Boolean)
    const missingNumbers = [...words].filter((w) => /\p{N}/u.test(w) && !cited.some((sw) => sw.has(w)))
    const tokens = plain.toLowerCase().match(/\p{L}+/gu) ?? []
    return { missingNumbers, negation: tokens.some((t) => NEGATIONS.has(t)) }
  })
}

// ── Export (F13) ─────────────────────────────────────────────────────────────

/** Markdown-sicherer Linktext. */
function escapeLinkText(text: string): string {
  return text.replace(/[\\[\]*_`<>]/g, (c) => `\\${c}`).replace(/\s+/g, ' ').trim()
}

/** URL in spitzen Klammern; Zeichen, die das Ziel brechen, werden kodiert. */
function safeLinkTarget(url: string): string {
  return `<${url.replace(/[<>\s]/g, (c) => encodeURIComponent(c))}>`
}

export interface WebFootnoteLabels {
  retrieved: string
  check: string
  /** Überschrift der Satzwarnungen im Export. */
  warnings: string
  /** Warnung je Satz (Index in `report.sentences`) oder null, wenn die Prüfung ihn trägt. */
  flagFor: (sentenceIndex: number) => string | null
}

/**
 * Antwort mit Fußnoten aus der eingefrorenen Liste und dem gespeicherten Bericht. Umgewandelt
 * werden nur die Stellen, die der Bericht als gültige Nummer führt; ungültige `[n]` bleiben
 * Text. `fid` macht die Fußnoten je Export eindeutig (zwei Webantworten in einer Notiz).
 */
export function withWebFootnotes(
  answer: string,
  sources: readonly WebSource[],
  report: CitationReport,
  fid: string,
  labels: WebFootnoteLabels
): string {
  const body = replaceCitationRefs(answer, report, (n) => `[^w${fid}-${n}]`)
  const used = new Set(report.refs.filter((r) => r.valid).map((r) => r.n))
  const lines = sources
    .filter((s) => used.has(s.n))
    .map((s) => `[^w${fid}-${s.n}]: [${escapeLinkText(s.title)}](${safeLinkTarget(s.url)}) · ${s.host} · ${labels.retrieved} ${s.fetchedAt.slice(0, 10)}`)
  // Warnungen wandern mit (F22): ein schwacher Satz darf in der Notiz nicht stärker
  // aussehen als im Chat.
  const warnings = report.sentences.flatMap((s, k) => {
    const flag = labels.flagFor(k)
    if (!flag) return []
    const text = answer.slice(s.start, s.end).replace(/\s+/g, ' ')
    return [`> - **${flag}:** ${text.length > 160 ? `${text.slice(0, 160)}…` : text}`]
  })
  const warnBlock = warnings.length ? `\n> ${labels.warnings}\n${warnings.join('\n')}` : ''
  return `${body}${lines.length ? `\n\n${lines.join('\n')}` : ''}\n\n> ${labels.check}${warnBlock}`
}
