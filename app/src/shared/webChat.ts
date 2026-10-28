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
import { replaceCitationRefs, type CitationReport, type SentenceCheck } from './rag/citations'
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
/**
 * Cloud-Modelle (OpenRouter, LLMBase, Ollama-Cloud) melden kein Fenster, haben aber weit mehr als
 * 20 000 Zeichen. Mit dem lokalen Startwert passten nur vier Seiten, eine gelesene Shopseite mit dem
 * Europreis fiel weg, und die Antwort sagte „kein Europreis“ (Codex F66, 26.10.2026).
 */
export const WEB_CHAT_CLOUD_BUDGET = 40_000
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
 * Großer Rahmen für Cloud-Modelle mit bekanntem Fenster (OpenRouter-Katalog, 28.10.2026).
 * Vorher galt auch für Modelle mit 200k–1M Token der Rahmen von 40 000 Zeichen: die Schleife
 * sah 3000 Zeichen je Seite, die Antwort rund 3000 je Seite. Eine Liste weiter unten auf der
 * Seite („welche Parfüms seit 2023“) kam nie beim Modell an, die Antwort klang trotzdem
 * vollständig. Die Deckel halten die Kosten je Frage in Grenzen.
 */
export const WEB_CHAT_WIDE = {
  /** Ganzer Prompt höchstens so viele Zeichen (~40–50k Token). */
  totalMax: 150_000,
  /** Platz für Systemtext, Verlauf und Frage, der den Quellen nicht zusteht. */
  overhead: 20_000,
  /** Seitentext je Abruf (statt WEB_PAGE_CONTEXT_MAX_CHARS = 8000). */
  pageChars: 20_000,
  /** So viel sieht das Modell je Abruf in der Recherche-Schleife (statt 3000). */
  loopExcerptChars: 8_000,
  /** Höchstens so viele Seiten in der Antwort (statt maxPagesCloud = 6). */
  maxPages: 8,
  /**
   * Recherche-Schleife (statt 5 Suchen / 8 Abrufe / 120 s). Gemessen 28.10.2026 mit gpt-6-luna:
   * eine Listenfrage endete an der Suchgrenze mit einem von mehreren Einträgen; die ganze
   * Schleife (13 Aufrufe, Prompt-Cache) kostete rund 0,3 Cent — der Engpass war das Budget.
   */
  loopSearches: 8,
  loopFetches: 14,
  loopIterations: 20,
  loopDeadlineMs: 180_000,
  /** Antwortreserve in Token. */
  answerTokens: 4_096
} as const

export interface WebChatWideLimits {
  totalChars: number
  sourcesMax: number
  pageChars: number
  loopExcerptChars: number
  maxPages: number
  loopSearches: number
  loopFetches: number
  loopIterations: number
  loopDeadlineMs: number
}

/**
 * Rahmen aus einem BEKANNTEN Fenster in Token (bereits mit Abschlag, siehe
 * shared/contextBudget.ts `resolveContextWindow` mit Quelle 'catalog'). null, wenn das Fenster
 * nicht mehr hergibt als der bisherige Cloud-Rahmen — dann bleibt alles beim Alten.
 */
export function webChatWideLimits(windowTokens: number): WebChatWideLimits | null {
  if (!Number.isFinite(windowTokens) || windowTokens <= 0) return null
  const totalChars = Math.min(WEB_CHAT_WIDE.totalMax, Math.floor((windowTokens - WEB_CHAT_WIDE.answerTokens) * WEB_CHAT_CHARS_PER_TOKEN))
  if (totalChars <= WEB_CHAT_CLOUD_BUDGET) return null
  return {
    totalChars,
    sourcesMax: totalChars - WEB_CHAT_WIDE.overhead,
    pageChars: WEB_CHAT_WIDE.pageChars,
    loopExcerptChars: WEB_CHAT_WIDE.loopExcerptChars,
    maxPages: WEB_CHAT_WIDE.maxPages,
    loopSearches: WEB_CHAT_WIDE.loopSearches,
    loopFetches: WEB_CHAT_WIDE.loopFetches,
    loopIterations: WEB_CHAT_WIDE.loopIterations,
    loopDeadlineMs: WEB_CHAT_WIDE.loopDeadlineMs
  }
}

/**
 * Zeichengrenze für den ganzen Prompt. Ohne bekanntes Fenster (Cloud, LM Studio) gilt der
 * Startwert; bei bekanntem Fenster passt der Prompt samt Antwortreserve hinein.
 */
export function webChatCharBudget(contextTokens: number | null, cloud = false): number {
  if (!contextTokens || contextTokens <= 0) return cloud ? WEB_CHAT_CLOUD_BUDGET : WEB_CHAT_TOTAL_BUDGET
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

/**
 * Nachfrage aus eingefrorenen Auszügen (Stufe 2, Schritt B): die Auszüge werden nicht
 * noch einmal gekürzt. Passt Systemtext + Frage + Verlauf nicht ins Budget, fallen die
 * ältesten Verlaufsnachrichten weg. Passt der feste Teil allein nicht, ist das null —
 * dann ablehnen, nicht still kürzen.
 */
export function shortenHistoryToFit<T extends { content: string; role?: string }>(
  history: readonly T[],
  fixedChars: number,
  budget: number
): { history: T[]; dropped: number } | null {
  if (fixedChars > budget) return null
  const kept = [...history]
  let dropped = 0
  while (kept.length > 0 && fixedChars + kept.reduce((n, m) => n + m.content.length, 0) > budget) {
    kept.shift()
    dropped++
  }
  // Nie mit einer Antwort ohne ihre Frage beginnen (Codex F12, 24.10.2026).
  dropped += dropLeadingAssistants(kept)
  return { history: kept, dropped }
}

/**
 * Entfernt führende Assistentenantworten, deren Frage schon herausgekürzt wurde. Eine verwaiste
 * Antwort stünde als eigenständiger Kontext neben den Quellen — samt allem Unbelegten darin.
 * Verändert `messages` und gibt die Zahl der entfernten Nachrichten zurück.
 */
export function dropLeadingAssistants(messages: Array<{ role?: string }>): number {
  let n = 0
  while (messages.length > 0 && messages[0].role === 'assistant') {
    messages.shift()
    n++
  }
  return n
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
  /**
   * Titel stammt aus der abgerufenen Seite selbst (nicht aus dem Suchtreffer). Nur dann zählen Zahlen
   * darin als Seitenbeleg (Codex F62). Fehlt bei älteren Schnappschüssen = nicht belegfähig.
   */
  titleFromPage?: boolean
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
  | { ok: false; reason: WebFetchFailReason; /** HTTP-Status bei `http`, sonst leer. */ status?: number }

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
  /**
   * Nur fertige Antwort mit mindestens einer zitierten Quelle: Kennung der im Main eingefrorenen
   * Auszüge, für „Hiermit weiterfragen“ (chat-recherche-zum-agenten.md, Stufe 2 Schritt B).
   */
  snapshotId?: string
  /** Gesetzt = Nachfrage aus eingefrorenen Auszügen, ohne neue Suche und ohne neue Abrufe. */
  basis?: { kind: 'snapshot' }
  /** Ältere Verlaufsnachrichten, die nicht mitgingen, damit die Auszüge vollständig bleiben. */
  historyDropped?: number
  /** Nachfrage scheiterte, weil die eingefrorenen Auszüge nicht mehr da sind — Wiederholen ist zwecklos. */
  snapshotGone?: boolean
  /** Treffer, die gar nicht erst abgerufen wurden, weil sie keine Sachquelle sind (`splitSkippedHits`). */
  skipped?: WebSkippedHit[]
  /** Nur „gründlich“: was wirklich gesucht, gewählt und weggelassen wurde (chat-gruendliche-suche.md, R1). */
  deep?: WebDeepInfo
}

/** Provenienz einer gründlichen Suche — jede gesendete Anfrage, jede Einschränkung, nie geschönt. */
export interface WebDeepInfo {
  /**
   * Jede gesendete Anfrage. plan = vom Modell geplant; guard = Stichwörter der Frage, weil eine
   * Zahl der Frage in keiner geplanten Anfrage stand (F24); fallback = Planung scheiterte, mit
   * der getippten Frage gesucht; fallback-words = mit daraus gebildeten Stichwörtern (F29);
   * retry = Nachsuche.
   */
  queries: Array<{ text: string; origin: WebDeepQueryOrigin; ok: boolean; hits: number; withoutNumbers?: string[] }>
  rejected: Array<{ text: string; reason: 'empty' | 'too-long' | 'duplicate' | 'over-limit' | 'url' | 'email' | 'control' | 'id' }>
  /**
   * plan-failed / pick-failed = Rückfall; no-search = Planung scheiterte und es wurde gar nicht
   * gesucht; timeout = Recherchefrist; budget = Grenze erreicht; window = Modellfenster begrenzte
   * die Seitenzahl; pages = feste Seitengrenze erreicht, weitere gelesene Seiten blieben draußen (F66).
   */
  limited: Array<'plan-failed' | 'retry-plan-failed' | 'pick-failed' | 'no-search' | 'guard-skipped' | 'timeout' | 'budget' | 'window' | 'pages'
    | 'loop-error' | 'loop-iterations' | 'loop-context' | 'loop-fallback'>
  /** Recherche-Schleife: das Modell suchte und las selbst. */
  loop?: boolean
  /** Themen früherer Webfragen, die der Schleife mitgegeben wurden (F47) — Text des Nutzers. */
  topics?: string[]
  candidates: number
  picked: number
  searches: number
  fetches: number
  /** Seiten-Obergrenze aus dem Platz im Modell (S4). */
  maxPages: number
  /** Abgerufen und lesbar, aber aus Platzgründen nicht verwendet (Hosts). */
  unused: string[]
  /** Wörterabgleich über die eingefrorenen Auszüge (S2) — nie „abgedeckt“. */
  terms: { missing: string[]; similar: string[] }
  /** Zahlen/Jahre der Frage, die in keiner geplanten Suchanfrage standen (F24). */
  numbersNotInQueries?: string[]
  /** Jeder Treffer, der zur Wahl stand, mit Ausgang (F26). Titel = fremder Text, nur als Text zeigen. */
  hits?: WebDeepHit[]
}

export type WebDeepQueryOrigin = 'plan' | 'guard' | 'fallback' | 'fallback-words' | 'retry'

export interface WebDeepHit {
  title: string
  host: string
  url: string
  /** 1 = erste Runde, 2 = Nachsuche. */
  round: 1 | 2
  /** read = eingefroren; unused = gelesen, kein Platz; duplicate = gleiche Zielseite wie ein anderer Treffer; failed = Abruf gescheitert; not-tried = gewählt, nicht mehr abgerufen; not-picked = nicht gewählt. */
  status: 'read' | 'unused' | 'duplicate' | 'failed' | 'not-tried' | 'not-picked'
}

/** Renderer → Main. Keine URLs, kein Anbieter, kein Schlüssel (F01). */
export interface PetrolWebRequest {
  requestId: string
  question: string
  /** Suchwörter; leer bei einer Nachfrage aus eingefrorenen Auszügen (`snapshotId`). */
  query: string
  /** Gesprächsbereich (Tab) — bindet die eingefrorenen Auszüge an dieses Gespräch (F02). */
  scopeId?: string
  /** Gesetzt = keine Suche, Antwort nur aus diesen im Main eingefrorenen Auszügen. */
  snapshotId?: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  model: string
  backend: 'ollama' | 'lmstudio'
  lmStudioPort?: number
  cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null
  /** Eigene frühere Webfragen des Nutzers als Thema (chat-webthema-im-verlauf.md); der Main prüft. */
  webTopics?: Array<{ text: string; clipped: boolean }>
  /** „Gründlich“: das Modell plant die Suchanfragen aus `question` (`query` wird ignoriert). */
  deep?: boolean
}

export interface PetrolWebProgress {
  requestId: string
  phase: 'plan' | 'search' | 'pick' | 'fetch' | 'model'
  /** Nur „gründlich“, Phase search: die gerade gesendete Anfrage. */
  query?: string | null
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

// ── Suchwörter: Gesprächssatz statt Stichwörter ──────────────────────────────

// Interjektionen, die ALLEIN am Satzanfang nichts über das Thema sagen. Nur mit folgendem
// Satzzeichen gewertet: „Gut Hohenhaus Öffnungszeiten“ und „Ja-Stimmen 2025“ sind Suchen.
const CHATTY_INTERJECTION = /^(?:okay|ok|also|hm+|ähm|äh|naja|na ja|na dann|na gut|gut|ja|nein|doch|genau|super|danke|hallo|hi|hey|moin|alles klar|well|hello|thanks|thank you)\s*[,!.…;:?]/
// Interjektion + gesprächige Fortsetzung, auch ohne Satzzeichen: „Okay schauen wir mal“.
const CHATTY_INTERJECTION_THEN = /^(?:okay|ok|also|naja|na ja|na dann|na gut|gut|ja|nein|hm+|ähm|äh|well|so)\s*,?\s*(?:schau(?:en)? (?:wir|mal)|mal sehen|lass(?:t)? uns|und (?:jetzt|dann|nun)|was (?:nun|jetzt))\b/
// Wendungen, die an Petrol gerichtet sind, nicht an eine Suchmaschine.
const CHATTY_PHRASE = /^(?:mal sehen|schau(?:en)? wir|lass(?:t)? uns|sag mal|kannst du|könntest du|weißt du|hast du|ich (?:möchte|will|würde|wollte|brauche|suche)|can you|could you|would you|let'?s|tell me|i (?:want|would like|need))\b/
// Aufforderungen an Petrol („Erstelle mir eine Zusammenfassung …“, „Fasse … zusammen“). GUI-Test
// 25.10.2026: dieser Satz wörtlich lieferte bei Tavily dreimal Recycling-Preise aus Texas, die
// Stichwortfassung Nachrichtenseiten. Nur mit Objekt/Partikel danach — „Erklärvideo Photosynthese“
// oder „Liste der UNESCO-Welterbestätten“ bleiben Suchen.
const CHATTY_REQUEST = /^(?:bitte\s+)?(?:erstell|schreib|mach|gib|nenn|erklär|fass|zeig|such|find|sag|list|formulier|übersetz|bring)(?:e|t)?\s+(?:mir|uns|bitte|mal)\b|^(?:bitte\s+)?(?:erstelle|schreibe|fasse|erkläre|nenne|zeige|formuliere|übersetze)\s+(?:eine?[nmrs]?|die|den|das|kurz)\b|^(?:please\s+)?(?:give|write|make|create|tell|show|find)\s+(?:me|us)\b|^(?:please\s+)?summari[sz]e\b|^bitte\b/
// „Schau(e) bitte/nach/mal/auf …“, „Guck mal …“, „Recherchiere …“ (GUI-Test 26.10.2026: „Schaue bitte
// auf weiteren Seiten“ lieferte plex.tv und tagesschau.de). Das Partikel muss als ganzes Wort folgen —
// Bindestrich zählt nicht als Ende (Codex F01, chat-nachfrage-weitere-seiten.md): „Guck mal-Reihe“ und
// „Schauinsland Wetter“ bleiben Suchen. Englisch nur mit „more/other“: „Look at Me Film“ ist eine Suche.
const CHATTY_LOOK = /^(?:schau(?:e|t)?|guck(?:e|t)?)\s+(?:bitte|nach|mal|auf)(?=$|[\s,!.?…;:])|^such(?:e|t)?\s+(?:noch|weiter|gründlich\w*|genauer|ausführlich\w*)(?=$|[\s,!.?…;:])|^recherchier(?:e|t)?(?=$|[\s,!.?…;:])|^(?:please\s+)?(?:look|search|check)\s+(?:(?:for|at|on)\s+)?(?:more|other)\b/
// Eindeutig gesprächige Formeln, auch mitten in den ersten Wörtern („Na dann, schauen wir mal“).
const CHATTY_ANYWHERE = /\b(?:schau(?:en)? wir mal|mal sehen|wie geht'?s|wie gehts|wie geht es (?:dir|euch|ihnen))\b/
// Nur Füllwörter, höchstens zwei.
const CHATTY_ONLY = new Set(['okay', 'ok', 'ja', 'nein', 'doch', 'genau', 'super', 'gut', 'danke', 'dir', 'hallo', 'hi', 'hey', 'moin', 'hm', 'ähm', 'äh', 'naja'])
// Längere Nachrichten sind keine „Suchwörter“ mehr; dafür gilt die Längenwarnung.
const CHATTY_MAX_WORDS = 25

/**
 * Klingt der Text nach einem Satz an Petrol statt nach Suchwörtern? Nur eine Warnung — gesendet wird
 * trotzdem, und nichts wird umgeschrieben. Anlass (24.10.2026): „Okay, schauen wir mal“ lieferte
 * Übersetzer-, Wörterbuch- und Videoseiten, weil die Suche den Satz wörtlich nimmt. Bewusst eng
 * gefasst: lieber eine Warnung zu wenig als eine, die bei echten Suchen stört. Bekannte Grenze: ein
 * Titel mit Interjektion und Komma („Hallo, Welt C Programm“) warnt fälschlich; steht im Rest eine
 * Zahl („Okay, Boomer Film 2019“), gilt es als Suche.
 */
export function looksConversational(query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^[\s"'„“‚‘.…–—-]+/, '')
  if (!q) return false
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length > CHATTY_MAX_WORDS) return false
  if (words.length <= 2 && words.every(w => CHATTY_ONLY.has(w.replace(/[,!.…;:?]+$/, '')))) return true
  if (CHATTY_PHRASE.test(q) || CHATTY_INTERJECTION_THEN.test(q) || CHATTY_REQUEST.test(q) || CHATTY_LOOK.test(q)) return true
  if (CHATTY_ANYWHERE.test(words.slice(0, 6).join(' '))) return true
  const m = CHATTY_INTERJECTION.exec(q)
  return !!m && !/\d/.test(q.slice(m[0].length))
}

// ── Suchwörter aus der Frage (ohne Modell) ───────────────────────────────────

// Wörter, die einer Suchmaschine nichts über das Thema sagen: Pronomen, Artikel, Hilfs- und
// Modalverben, Bindewörter, Fragewörter, Füllwörter, Gesprächsverben. Bewusst NICHT darin:
// Verneinungen („nicht“, „kein“, „ohne“; Codex F05, chat-suchwoerter-vorschlag.md) und Wörter, die
// den Fall eingrenzen („mit“, „oder“, „nur“, „nach“, „seit“, „heute“, „gestern“; Codex F01,
// chat-suchqualitaet-2.md: „Preis mit oder ohne Speicher“ wurde sonst zu „Preis ohne Speicher“).
const SEARCH_FILLER = new Set([
  // Pronomen
  'ich', 'mir', 'mich', 'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines', 'du', 'dir', 'dich', 'dein', 'deine',
  'deinen', 'deinem', 'er', 'ihm', 'ihn', 'sie', 'ihr', 'ihnen', 'es', 'wir', 'uns', 'unser', 'unsere', 'unseren',
  'unserem', 'unserer', 'euch', 'euer', 'eure', 'man', 'selbst', 'selber', 'das', 'dies', 'diese', 'dieser', 'dieses', 'diesen',
  // Artikel
  'der', 'die', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  // Hilfs- und Modalverben
  'bin', 'bist', 'ist', 'sind', 'seid', 'sein', 'war', 'waren', 'wäre', 'wären', 'habe', 'hast', 'hat', 'haben', 'hatte',
  'hätte', 'hätten', 'wird', 'werden', 'würde', 'würden', 'kann', 'kannst', 'können', 'könnte', 'könnten', 'muss',
  'musst', 'müssen', 'müsste', 'soll', 'sollte', 'sollten', 'will', 'willst', 'wollen', 'möchte', 'möchten', 'darf', 'dürfen',
  // Bindewörter, Partikeln, Füllwörter
  'und', 'aber', 'denn', 'doch', 'dass', 'ob', 'wenn', 'als', 'so', 'also', 'mal', 'eigentlich', 'überhaupt',
  'bitte', 'gerade', 'eben', 'einfach', 'halt', 'ja', 'ganz', 'sehr', 'schon', 'noch', 'auch', 'etwa', 'irgendwie',
  'gern', 'gerne', 'da', 'dann', 'okay', 'ok', 'hallo', 'naja', 'hm', 'ähm', 'äh',
  // Fragewörter
  'was', 'wie', 'wer', 'wo', 'wann', 'warum', 'wieso', 'weshalb', 'welche', 'welcher', 'welches', 'welchen', 'viel', 'viele',
  // Präpositionen ohne eigene Aussage (über/unter/bis/ohne/gegen bleiben)
  'zu', 'zum', 'zur', 'für', 'von', 'vom', 'an', 'am', 'im', 'in', 'auf', 'aus', 'bei', 'beim', 'um', 'durch',
  // Gesprächsverben
  'weiß', 'weißt', 'wissen', 'sag', 'sage', 'sagen', 'erklär', 'erkläre', 'erklären', 'suche', 'brauche', 'frage', 'fragen',
  'überlege', 'überlegen', 'gibt', 'geht', 'bekomme', 'bekommen', 'holen', 'beachten',
  // Englisch
  // „with“/„or“ bleiben wie „mit“/„oder“ (Codex F05: „with or without storage“ kippte sonst)
  'i', 'me', 'my', 'you', 'your', 'we', 'our', 'it', 'is', 'are', 'was', 'the', 'a', 'an', 'and', 'of', 'to', 'for',
  'on', 'what', 'how', 'which', 'who', 'can', 'could', 'would', 'should', 'do', 'does', 'please'
])

/**
 * Suchwörter aus der getippten Frage: dieselben Wörter in derselben Reihenfolge, ohne Füllwörter.
 * Nur ein Angebot auf Klick (`offerSearchWords`), nie der Standard: die Messung vom 25.10.2026
 * war gemischt (1 besser, 1 schlechter, 3 gleich; chat-suchqualitaet-2.md).
 * Es wird nur WEGGELASSEN, nie ergänzt oder umgeschrieben — an den Suchanbieter geht damit nichts,
 * was nicht in der Frage stand (keine neuen Datenwege, F03), und die Zeile zeigt vor dem Senden
 * genau diesen Text (F08). Anlass (Vergleich mit Claude, 25.10.2026): die wörtliche Frage
 * „Ich will mir selbst ein Balkonkraftwerk mit 8 Modulen installieren was kosten die Module“
 * fand nur allgemeine Ratgeber, die Stichwörter fanden Preisseiten für Anlagen mit 8 Modulen.
 * Ein großgeschriebenes Füllwort mitten im Satz bleibt stehen — es kann ein Name sein („an der
 * Oder“). Bleiben weniger als zwei Wörter übrig, gilt die Frage unverändert.
 */
// Gesprächsauftakt als GANZE Wendung (Codex F07: aus „Okay, schauen wir mal: Elterngeld 2025“
// blieb sonst „schauen“ stehen). Interjektion nur mit Satzzeichen ODER mit folgender Wendung —
// „Gut Hohenhaus Öffnungszeiten“ bleibt unangetastet.
const OPENER_INTERJECTION = '(?:okay|ok|also|naja|na ja|na dann|na gut|gut|ja|hm+|ähm|äh|hallo|hi|hey|moin|well|so)'
const OPENER_PHRASE = "(?:schau(?:en)?\\s+wir\\s+mal|schau(?:en)?\\s+wir|schau(?:en)?\\s+mal|mal\\s+sehen|lass(?:t)?\\s+uns(?:\\s+mal)?(?:\\s+(?:schauen|sehen|gucken))?|sag\\s+mal|let'?s\\s+see)"
const OPENER_RE = new RegExp(
  `^(?:${OPENER_INTERJECTION}\\s*[,!.…;:]\\s*(?:${OPENER_PHRASE}\\b)?|(?:${OPENER_INTERJECTION}\\s+)?${OPENER_PHRASE}\\b)[\\s,!.…;:–—-]*`,
  'iu'
)

export function searchWordsFromQuestion(question: string): string {
  const q = question.replace(/\s+/g, ' ').trim()
  const parts = q.replace(OPENER_RE, '').split(' ')
  const kept = parts.filter((raw, k) => {
    const bare = raw.replace(/^[\s"'„“‚‘(«»]+|[\s"'“”‘’)«»,;:!?.…]+$/g, '')
    const w = bare.toLowerCase()
    if (w === '' ) return false
    if (!SEARCH_FILLER.has(w)) return true
    // Satzanfang („Ich …“, „Was …“) oder nach einem Satzzeichen: großgeschrieben heißt dort nichts.
    const sentenceStart = k === 0 || /[.!?:]$/.test(parts[k - 1])
    return /^\p{Lu}/u.test(bare) && !sentenceStart
  }).map((raw) => raw.replace(/[,;:!?…]+$/g, '').replace(/(?<!\p{N})\.$/u, ''))
  return kept.length >= 2 ? kept.join(' ') : q
}

/** Füllwort im Sinne der Stichwort-Kürzung (auch für den Wörterabgleich der gründlichen Suche). */
export function isSearchFiller(word: string): boolean {
  return SEARCH_FILLER.has(word.toLowerCase())
}

/** Ab so vielen Wörtern lohnt das Angebot, sonst nur bei Gesprächssätzen. */
const OFFER_MIN_WORDS = 8

/**
 * Stichwörter anbieten? Nur bei langen Fragen, aus denen mindestens drei Füllwörter fallen, oder bei
 * Gesprächssätzen (`looksConversational` auf der ORIGINALFRAGE, Codex F04). Sonst null.
 */
export function offerSearchWords(question: string): string | null {
  const q = question.replace(/\s+/g, ' ').trim()
  if (!q) return null
  const suggestion = searchWordsFromQuestion(q)
  if (suggestion === q) return null
  const words = q.split(' ').length
  const removed = words - suggestion.split(' ').length
  return (words >= OFFER_MIN_WORDS && removed >= 3) || looksConversational(q) ? suggestion : null
}

// ── Treffer, die keine Sachquelle sind ───────────────────────────────────────

export type WebSkipCategory = 'translator' | 'social' | 'adult'

export interface WebSkippedHit {
  host: string
  category: WebSkipCategory
  /** Wie viele Treffer dieses Hosts übersprungen wurden. */
  count: number
}

// Übersetzer, Wörterbücher und Social/Video-Seiten liefern für eine Sachfrage keinen
// belegbaren Text (Wortpaare, Beispielsätze, leere Hüllseiten) — und der Wortvergleich der
// Prüfung hielte sie trotzdem für „Quelle“. Gilt NUR für Treffer der Chat-Suche; der Agent und
// Adressen, die der Nutzer selbst nennt, sind nicht betroffen. Bewusst kurz und benannt.
const SKIP_DOMAINS: ReadonlyArray<{ category: WebSkipCategory; domains: readonly string[]; patterns?: readonly RegExp[] }> = [
  {
    category: 'translator',
    domains: ['reverso.net', 'deepl.com', 'dict.cc', 'leo.org', 'dictionary.cambridge.org', 'translate.com'],
    patterns: [/^translate\.(?:google|yandex)\.[a-z.]+$/, /(?:^|\.)linguee\.[a-z]{2,3}$/]
  },
  {
    category: 'social',
    // YouTube bewusst NICHT hier (Nutzerentscheidung 24.10.2026): Kanäle von Behörden und Hochschulen sind
    // für den Nutzer Quellen. Abrufbar sind dort nur Titel und Beschreibung — die Prüfung vergleicht Wörter.
    domains: ['tiktok.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com'],
    patterns: [/(?:^|\.)pinterest\.[a-z.]+$/]
  },
  {
    category: 'adult',
    // Gründliche Suche nach „politische Ereignisse heute“ rief real theporndude.com ab (Messung
    // 25.10.2026). „porn“ im Hostnamen reicht als Muster; die Treffer bleiben als „übersprungen“ sichtbar.
    domains: ['xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'onlyfans.com', 'chaturbate.com', 'spankbang.com', 'eporner.com', 'beeg.com', 'stripchat.com', 'livejasmin.com', 'brazzers.com'],
    patterns: [/porn/, /\.(?:xxx|sex|porn|adult)$/]
  }
]

function hostIn(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

/** Kategorie, falls der Host übersprungen wird, sonst null. */
export function skipCategoryForHost(host: string): WebSkipCategory | null {
  const h = host.toLowerCase().replace(/\.+$/, '')
  for (const rule of SKIP_DOMAINS) {
    if (rule.domains.some(d => hostIn(h, d)) || rule.patterns?.some(re => re.test(h))) return rule.category
  }
  return null
}

/**
 * Trennt Treffer in „abrufen“ und „überspringen“. Wird VOR der Kappung auf acht Kandidaten
 * angewendet, damit übersprungene Treffer keinen Platz belegen. Die übersprungenen Hosts bleiben
 * sichtbar (Anzeige „Übersprungen: …“) — nichts verschwindet still.
 */
export function splitSkippedHits<T extends { url: string }>(hits: readonly T[]): { kept: T[]; skipped: WebSkippedHit[] } {
  const kept: T[] = []
  const skipped: WebSkippedHit[] = []
  const byHost = new Map<string, WebSkippedHit>()
  for (const h of hits) {
    const url = normalizeWebUrl(h.url)
    const host = url ? hostnameFromUrl(url) : null
    const category = host ? skipCategoryForHost(host) : null
    if (host && category) {
      const known = byHost.get(host)
      if (known) known.count++
      else {
        const entry: WebSkippedHit = { host, category, count: 1 }
        byHost.set(host, entry)
        skipped.push(entry)
      }
    } else {
      kept.push(h)
    }
  }
  return { kept, skipped }
}

/**
 * Räumt verirrte Nachdenk-Marken aus einer Antwort. Trotz `think: false` schreibt qwen3.8 gelegentlich
 * ein nacktes `</think>` und wiederholt danach die ganze Antwort (6 von 102 Läufen, Messung
 * 25.10.2026). Gilt: der Text NACH dem letzten `</think>` ist die Antwort, der davor ein Entwurf;
 * ist danach nichts mehr, bleibt der Entwurf. Vollständige `<think>…</think>`-Blöcke fallen weg.
 */
export function stripStrayThink(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  const close = out.toLowerCase().lastIndexOf('</think>')
  if (close >= 0) {
    const after = out.slice(close + '</think>'.length)
    out = after.trim() ? after : out.slice(0, close)
  }
  return out.replace(/<\/?think>/gi, '').trim()
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
  /**
   * Schon gelesene Zielseiten (auch aus früheren Runden). Eine Weiterleitung auf eine davon zählt
   * nicht als brauchbare Seite — sonst ließe sie einen eigenständigen Nachrücker liegen (Codex F38).
   * Wird hier ergänzt.
   */
  seenFinal?: Set<string>
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
  const seenFinal = opts.seenFinal ?? new Set<string>()

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
          if (outcome.ok && !seenFinal.has(outcome.finalUrl)) {
            seenFinal.add(outcome.finalUrl)
            usable++
          }
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
  dropLeadingAssistants(history) // keine Antwort ohne ihre Frage (Codex F12)

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
  prepare: (text: string) => string,
  /** „Gründlich“ friert bis zu 4 Seiten in Wahlreihenfolge ein (chat-gruendliche-suche.md, S4). */
  maxSources: number = WEB_CHAT_MAX_SOURCES
): FrozenWebSources {
  const ordered = [...entries].sort((a, b) => a.candidate.index - b.candidate.index)
  const okEntries: Array<{ c: WebChatCandidate; o: Extract<WebFetchOutcome, { ok: true }>; text: string }> = []
  const failures: WebFetchFailure[] = []
  const duplicates: number[] = []
  const seenFinal = new Set<string>()
  for (const e of ordered) {
    if (!e.outcome.ok) {
      failures.push({ host: e.candidate.host, reason: e.outcome.reason })
      continue
    }
    // Zwei Treffer, die auf dieselbe Seite weiterleiten, sind EINE Quelle (Codex F36).
    if (seenFinal.has(e.outcome.finalUrl)) {
      duplicates.push(e.candidate.index)
      continue
    }
    seenFinal.add(e.outcome.finalUrl)
    const text = prepare(e.outcome.text).trim()
    if (!text) {
      failures.push({ host: e.candidate.host, reason: 'empty' })
      continue
    }
    okEntries.push({ c: e.candidate, o: e.outcome, text })
  }
  const kept = okEntries.slice(0, maxSources)
  const b = applyWebChatBudget({ ...budget, pages: kept.map((k) => k.text) })
  const used: number[] = []
  const sources: WebSource[] = kept.map((k, i) => {
    const finalHost = hostnameFromUrl(k.o.finalUrl) ?? k.c.host
    if (b.excerpts[i].text.trim().length > 0) used.push(k.c.index)
    return {
      n: i + 1,
      title: k.o.title || k.c.title || finalHost,
      titleFromPage: !!k.o.title,
      url: k.o.finalUrl,
      host: finalHost,
      fetchedAt: k.o.fetchedAt,
      excerpt: b.excerpts[i].text,
      originalChars: k.o.originalChars,
      truncated: k.o.truncated || b.excerpts[i].cut
    }
  }).filter((s) => s.excerpt.trim().length > 0).map((s, i) => ({ ...s, n: i + 1 }))
  return { sources, failures, history: b.history, used, duplicates }
}

export interface FrozenWebSources {
  sources: WebSource[]
  failures: WebFetchFailure[]
  history: BudgetMessage[]
  /** `candidate.index` je eingefrorener Quelle, in Quellenreihenfolge. */
  used: number[]
  /** `candidate.index` der Abrufe, die auf eine schon eingefrorene Zielseite führten. */
  duplicates: number[]
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
  measure: (frozen: { sources: WebSource[]; history: BudgetMessage[] }) => number,
  maxSources: number = WEB_CHAT_MAX_SOURCES
): ReturnType<typeof freezeWebSources> {
  let frozen = freezeWebSources(entries, budget, prepare, maxSources)
  for (let i = 0; i < 3; i++) {
    const overflow = measure(frozen) - budget.total
    if (overflow <= 0 || frozen.sources.length === 0) break
    const sourceChars = frozen.sources.reduce((n, src) => n + src.excerpt.length, 0)
    frozen = freezeWebSources(entries, { ...budget, sourcesMax: Math.max(0, sourceChars - overflow - 50) }, prepare, maxSources)
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
  /**
   * Zahlen, die nicht in der zitierten Seite stehen, aber in der Frage des Nutzers
   * („Balkonkraftwerk mit 8 Modulen“). Weiterhin eine Warnung (Codex F02), nur mit
   * erklärter Herkunft.
   */
  questionNumbers?: string[]
  /**
   * Zahlen in einem Satz OHNE Quellennummer (Modellwissen). Der Systemtext verbietet sie dort;
   * steht trotzdem eine, ist sie durch keine Seite gedeckt. Zahlen aus der Frage zählen nicht.
   */
  unsourcedNumbers?: string[]
  /**
   * Kurzes Etikett ohne Nummer und ohne Zahl (Tabellenkopf „Preis“, Zeilenname „Raspberry Pi 5“):
   * keine Aussage, also auch kein „Modellwissen“ (Nutzertest 26.10.2026).
   */
  label?: boolean
  /**
   * Preis und weitere Angabe mit Einheit („4 GB … 179,89 €“) stehen beide in der Seite, aber nirgends
   * beieinander — ob der Preis zu dieser Variante gehört, ist nicht geprüft (Codex F65).
   */
  apartNumbers?: string[]
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
// „Angaben“ seit F69: „Einen Europreis nennen die abgerufenen Angaben nicht“ galt sonst als Modellwissen.
const GAP_SOURCE = /\b(?:seite|seiten|auszug|auszüge|auszügen|auszugen|quelle|quellen|angabe|angaben|page|pages|excerpt|excerpts|source|sources)\b/iu
const GAP_ABSENCE = /\b(?:nicht|nichts|kein|keine|keinen|keinem|keiner|fehlt|fehlen|unklar|not|no|nothing|none|missing)\b/iu
// Gegenbehauptung neben der Lücke („… bestätigt 2027 nicht, 20 Euro sind falsch“, Codex F28).
const GAP_COUNTER = /\b(?:aber|sondern|jedoch|allerdings|dennoch|trotzdem|falsch|stimmt|stimmen|richtig|korrekt|tatsächlich|but|however|instead|wrong|incorrect|correct|actually)\b/iu
// Behauptendes Verb hinter einem Doppelpunkt („… nichts: 2027 steigt der Beitrag“, Codex F34).
const GAP_CLAIM_VERB = /\b(?:ist|sind|war|waren|wird|werden|wurde|wurden|hat|haben|gilt|gelten|beträgt|betragen|kostet|liegt|liegen|steigt|steigen|sinkt|sinken|bestätigt|bestätigen|nennt|nennen|zeigt|zeigen|steht|stehen|gibt|geben|erlaubt|darf|dürfen|muss|müssen|kann|können|soll|sollen|is|are|was|were|will|has|have|costs|rises|falls|shows|states|confirms)\b/iu
export function isGapStatement(sentence: string, question = ''): boolean {
  const plain = sentence.replace(/(?<!\\)\[\d{1,3}\]/g, ' ').trim()
  if (plain.length > 220 || !GAP_SOURCE.test(plain) || !GAP_ABSENCE.test(plain) || GAP_COUNTER.test(plain)) return false
  // Hinter einem Doppelpunkt darf nur stehen, WAS fehlt („… nichts: der Betrag für 3.000 €“),
  // keine Aussage mit eigenem Verb und nichts, was mit einer Zahl beginnt (Codex F34).
  const colon = plain.indexOf(':')
  const head = colon >= 0 ? plain.slice(0, colon) : plain
  const tail = colon >= 0 ? plain.slice(colon + 1) : ''
  // Eine Zahl hinter dem Doppelpunkt reicht schon (Codex F44): eine Verbliste hat immer Lücken
  // („… nichts: der Beitrag erhöht sich 2027 auf 20 Euro“). Lieber eine Warnung zu viel.
  if (tail && (GAP_CLAIM_VERB.test(tail) || /\d/.test(tail))) return false
  // Jeder weitere Satzteil muss selbst ein Fehlen benennen — ein erneutes „Quelle“ reicht nicht
  // („… nichts, die Quelle bestätigt 20 Euro“, F28/F34).
  // (Kommas hinter dem Doppelpunkt zählen nur auf, was fehlt.)
  const clauses = head.split(/[,;–—]|\s-\s/).map((c) => c.trim()).filter(Boolean)
  if (clauses.slice(1).some((c) => !GAP_ABSENCE.test(c))) return false
  // Eine Zahl darf nur stehen, wenn sie aus der Frage stammt („… nichts zum Betrag für 3.000 €
  // brutto“) — sonst kann sie eine Behauptung tragen (GUI-Test 25.10.2026).
  const asked = new Set(numberUnits(question).map(numberCore))
  return numberUnits(plain).every((n) => asked.has(numberCore(n)))
}

const thousands = (n: string): string => (/^\d{1,3}(?:\.\d{3})+$/.test(n) ? n.replace(/\./g, '') : n)

// Bekannte Einheiten, auf eine Schreibweise gebracht (20 € = 20 Euro, 8 Jahre = 8 Jahren).
const UNIT_CANON: Record<string, string> = {
  '%': '%', prozent: '%', percent: '%',
  '€': 'eur', euro: 'eur', eur: 'eur', cent: 'ct', ct: 'ct', '$': 'usd', usd: 'usd', dollar: 'usd', dollars: 'usd',
  w: 'w', watt: 'w', wp: 'wp', wattpeak: 'wp', kw: 'kw', kilowatt: 'kw', kwp: 'kwp', kwh: 'kwh', kilowattstunde: 'kwh', kilowattstunden: 'kwh',
  wh: 'wh', mwh: 'mwh', v: 'v', volt: 'v', mah: 'mah',
  kg: 'kg', kilogramm: 'kg', kilo: 'kg', g: 'g', gramm: 'g', km: 'km', kilometer: 'km', kilometern: 'km',
  m: 'm', meter: 'm', metern: 'm', cm: 'cm', zentimeter: 'cm', mm: 'mm', millimeter: 'mm',
  l: 'l', liter: 'l', litern: 'l', ml: 'ml', milliliter: 'ml', gb: 'gb', mb: 'mb', tb: 'tb',
  jahr: 'jahr', jahre: 'jahr', jahren: 'jahr', jahres: 'jahr', year: 'jahr', years: 'jahr',
  monat: 'monat', monate: 'monat', monaten: 'monat', month: 'monat', months: 'monat',
  woche: 'woche', wochen: 'woche', week: 'woche', weeks: 'woche',
  tag: 'tag', tage: 'tag', tagen: 'tag', day: 'tag', days: 'tag',
  stunde: 'h', stunden: 'h', std: 'h', h: 'h', hour: 'h', hours: 'h',
  minute: 'min', minuten: 'min', min: 'min', minutes: 'min'
}
const NUMBER_UNIT = /(?<![\p{L}\p{N}])(\d[\d.,]*\d|\d)(?:\s?([%€$])|(\p{L}+)|\s(\p{L}+))?/gu
// Uhrzeiten und Datumsangaben sind EIN Wert (Codex F40): „12:30“ darf nicht über eine 12 und eine
// 30 irgendwo auf der Seite als belegt gelten, „03/04/2026“ nicht über „04/03/2026“.
const WHOLE_VALUE = /(?<![\p{L}\p{N}])(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,4}\/\d{1,2}\/\d{1,4}|\d{1,2}:\d{2}(?::\d{2})?)(?![\p{L}\p{N}])/gu
const RANGE_GAP = /^\s*(?:[–—-]|bis|to)\s*$/u
// Vorangestellte Währung („ab €53,90“, „EUR 20“, „$5“) — GUI-Test 25.10.2026: sonst galt
// „53,90 €“ in der Antwort gegen „€53,90“ auf der Seite als nicht belegt.
const PREFIX_CURRENCY = /(?<![\p{L}\p{N}])(€|\$|eur|usd)\s?(\d[\d.,]*\d|\d)(?![\p{L}\p{N}])/gu

/**
 * Eine Schreibweise für Beträge (GUI-Test 26.10.2026, Marin-E-Bikes): die Antwort schrieb „$5,199“,
 * der Shop „$5,199.00“ bzw. „5199 USD“ — alles derselbe Preis, gemeldet wurde „Zahl nicht in der
 * Seite“. Englische Tausender mit mehreren Gruppen oder Nachkommastellen (1,234,567 / 1,234.50) und
 * deutsche (1.234 / 1.234,50) verlieren den Trenner; Null-Nachkommastellen gleicht erst der Vergleich
 * an (`withoutZeroFraction`). Genau EINE Komma-Dreiergruppe („5,199“) ist mehrdeutig — englischer
 * Tausender oder deutsche Dezimalzahl mit drei Stellen — und gilt nur bei einer Währung als Tausender
 * (Codex F46: „1,234 %“ ist nicht „1234 %“).
 */
export function canonNumber(n: string, currency = false): string {
  let int = n
  let frac = ''
  let m: RegExpExecArray | null
  if ((m = /^(\d{1,3}(?:,\d{3})+)(?:\.(\d+))?$/.exec(n)) && (currency || m[2] !== undefined || /,\d{3},/.test(m[1]))) { int = m[1].replace(/,/g, ''); frac = m[2] ?? '' }
  else if ((m = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/.exec(n))) { int = m[1].replace(/\./g, ''); frac = m[2] ?? '' }
  // Eindeutige Dezimalzahl (ein oder zwei Nachkommastellen): 5.5 = 5,5 (F41).
  else if ((m = /^(\d+)[.,](\d{1,2})$/.exec(n))) { int = m[1]; frac = m[2] }
  else return n
  return frac ? `${int},${frac}` : int
}

/** Vergleichsform: Null-Nachkommastellen weg („5199,00usd“ = „5199usd“); die Anzeige behält „19,50 €“. */
// Nur ein- oder zweistellige Nachkommateile (Cent): die mehrdeutige Dreiergruppe „1,000“ bleibt,
// sonst würde „1 %“ gegen eine englische Seite mit „1,000 %“ (tausend) freigesprochen (Codex F54).
const withoutZeroFraction = (key: string): string => key.replace(/^(\d+),(\d{1,2})(?!\d)/, (_m, int: string, frac: string) => {
  const f = frac.replace(/0+$/, '')
  return f ? `${int},${f}` : int
})

/**
 * Zahlen mit Einheit aus dem Originaltext (Codex F27/F33): die direkt folgende bekannte Einheit
 * gehört zur Zahl, auch mit Leerzeichen und als Zeichen — „20 %“ → „20%“, „800 Wp“ und „800Wp-Set“
 * → „800wp“, „2.696 Euro“ → „2696eur“. Unbekanntes danach („8 Module“, „8-Modul-Preise“) bleibt
 * reine Zahl. In einem Bereich gilt die Einheit für beide Enden („600–800 W“, F39). Uhrzeiten und
 * Datumsangaben bleiben ganz (F40). Deutsche Tausender und eindeutige Dezimalzahlen angeglichen.
 */
export function numberUnits(text: string): string[] {
  const out = new Set<string>()
  // „59 US-Dollar“ las sich als Zahl mit Wort „US“ ohne Einheit (GUI-Test 26.10.2026) — gleich lang
  // ersetzen, damit die Positionen für Bereiche stimmen.
  const lower = text.toLowerCase().replace(/\bus-?dollars?\b/gu, (v) => 'dollar'.padEnd(v.length))
  for (const m of lower.matchAll(WHOLE_VALUE)) out.add(m[0])
  let rest = lower.replace(WHOLE_VALUE, (v) => ' '.repeat(v.length))
  for (const m of rest.matchAll(PREFIX_CURRENCY)) out.add(canonNumber(m[2], true) + UNIT_CANON[m[1]])
  rest = rest.replace(PREFIX_CURRENCY, (v) => ' '.repeat(v.length))
  const found: Array<{ num: string; unit: string; start: number; end: number }> = []
  for (const m of rest.matchAll(NUMBER_UNIT)) {
    const unit = UNIT_CANON[m[2] ?? m[3] ?? m[4] ?? ''] ?? ''
    found.push({ num: canonNumber(m[1], unit === 'usd' || unit === 'eur'), unit, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length })
  }
  for (let i = found.length - 2; i >= 0; i--) {
    const a = found[i]
    const b = found[i + 1]
    if (!a.unit && b.unit && RANGE_GAP.test(rest.slice(a.end, b.start))) a.unit = b.unit
  }
  for (const f of found) out.add(f.num + f.unit)
  return [...out]
}

/** Nur der Zahlenkern („800wp“ → „800“) — für die Herkunft „aus deiner Frage“, nie als Seitenbeleg. */
export function numberCore(part: string): string {
  if (/^[\d:/-]+$/.test(part) && /[:/-]/.test(part)) return part
  const m = part.match(/\d[\d.,]*/)
  return m ? thousands(m[0].replace(/[.,]+$/, '')) : part
}

const UNIT_SHOW: Record<string, string> = {
  eur: '€', usd: '$', w: 'W', wp: 'Wp', kw: 'kW', kwp: 'kWp', kwh: 'kWh', wh: 'Wh', mwh: 'MWh', v: 'V', mah: 'mAh',
  gb: 'GB', mb: 'MB', tb: 'TB', jahr: 'Jahre', monat: 'Monate', woche: 'Wochen', tag: 'Tage'
}

/** Anzeige: „800wp“ → „800 Wp“, „20%“ → „20 %“, „2696eur“ → „2696 €“. */
function showNumber(key: string): string {
  const core = numberCore(key)
  const unit = key.slice(key.indexOf(core) + core.length)
  return unit ? `${core} ${UNIT_SHOW[unit] ?? unit}` : core
}

/** Belegmenge einer Seite: jede Zahl einmal mit Einheit und einmal ohne. */
function pageNumbers(text: string): Set<string> {
  const out = new Set<string>()
  for (const n of numberUnits(text)) {
    const z = withoutZeroFraction(n)
    out.add(n); out.add(numberCore(n)); out.add(z); out.add(numberCore(z))
  }
  return out
}

// „laut Auszug 3“, „Quelle 1 und 2“: Verweise auf die eigene Quellenliste sind keine Sachzahlen.
// Vorher meldete die Prüfung „Zahl nicht in der Seite: 3“ (Nutzertest 26.10.2026).
// Nur Wörter, die im Antworttext praktisch nur als Quellenverweis vorkommen — „Treffer 2“ kann eine
// Sachangabe sein (Codex F63).
const SOURCE_MENTION = /\b(?:Auszug|Auszügen|Auszüge|Quelle|Quellen|excerpts?|sources?)\s+(\d{1,2}(?:\s*(?:,|und|and|&|bis|-|–)\s*\d{1,2})*)\b/giu

/**
 * Etikett statt Aussage: höchstens vier Wörter, kein Satzzeichen am Ende, mindestens ein Wort aus
 * Buchstaben. Ziffern nur als Teil eines Namens („Raspberry Pi 5“) — höchstens eine einzelne Ziffer
 * ohne Einheit („Preis 59“ ist eine Angabe, Codex F61); „8 GB“, „189 €“ oder „seit 2023“ bleiben prüfpflichtig.
 */
function isLabel(text: string): boolean {
  const plain = text.replace(/[*_`#|]/g, ' ').trim()
  if (!plain || /[.!?:;]$/.test(plain) || plain.split(/\s+/).length > 4 || !/\p{L}{2,}/u.test(plain)) return false
  const nums = numberUnits(plain)
  return nums.length === 0 || (nums.length === 1 && /^\d$/.test(nums[0]))
}

/**
 * Liegt die Stelle in der Kopfzeile einer Tabelle oder in der ersten Spalte? Nur dort ist eine kurze
 * Zelle ein Etikett; „Kostet weniger“ in einer Inhaltsspalte bleibt eine Aussage (Codex F61).
 */
function isTableLabelCell(answer: string, pos: number): boolean {
  const lineStart = answer.lastIndexOf('\n', pos - 1) + 1
  const nl = answer.indexOf('\n', pos)
  const lineEnd = nl < 0 ? answer.length : nl
  const line = answer.slice(lineStart, lineEnd)
  if (!line.includes('|')) return false
  const next = nl < 0 ? '' : answer.slice(nl + 1, (answer.indexOf('\n', nl + 1) + 1 || answer.length + 1) - 1)
  if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(next)) return true
  const pipesBefore = (answer.slice(lineStart, pos).match(/\|/g) ?? []).length
  return line.trimStart().startsWith('|') ? pipesBefore === 1 : pipesBefore === 0
}

/** Fenster für „steht beieinander“: etwa eine Produktkarte oder Tabellenzeile. */
const NEAR_WINDOW = 300

/**
 * Stehen alle Zahlen gemeinsam in EINEM Abschnitt der Seite? Ein Preis-Satz trägt Preis und Variante
 * zusammen; einzeln irgendwo auf der Seite reicht nicht — bei Geizhals & Co. stehen auf einer Seite
 * viele Varianten mit vielen Preisen (Codex F65). Fenster mit halber Überlappung.
 */
function numbersNear(excerpt: string, nums: readonly string[]): boolean {
  if (excerpt.length <= NEAR_WINDOW) return true
  for (let i = 0; i < excerpt.length; i += NEAR_WINDOW / 2) {
    const win = pageNumbers(excerpt.slice(i, i + NEAR_WINDOW))
    if (nums.every((n) => win.has(n) || win.has(withoutZeroFraction(n)))) return true
    if (i + NEAR_WINDOW >= excerpt.length) break
  }
  return false
}

/** Quellenverweise entfernen — nur, wenn jede Nummer darin eine echte Quellennummer ist. */
export function withoutSourceMentions(text: string, sourceCount: number): string {
  return text.replace(SOURCE_MENTION, (m, nums: string) =>
    (nums.match(/\d+/g) ?? []).every((d) => Number(d) >= 1 && Number(d) <= sourceCount) ? ' ' : m)
}

/**
 * Deterministische Ergänzung zum Wortvergleich, ausgerichtet an `report.sentences`:
 * „Der Vertrag wurde nicht geschlossen [1]“ hat hohe Wortdeckung mit „Der Vertrag wurde
 * geschlossen“, und eine erfundene Zahl fällt im Wortanteil kaum ins Gewicht. Beides wird
 * deshalb eigens markiert. Geprüft werden nur Sätze mit gültiger Nummer; bei Sätzen ohne
 * Nummer steht schon „ohne Quellennummer“.
 *
 * Zahlen aus der Frage, die nicht in der Seite stehen, bleiben eine Warnung, werden aber als
 * `questionNumbers` getrennt benannt („nur aus deiner Frage“) — sonst bringt eine
 * Suggestivfrage ihre Zahl als Seitenbeleg durch (Codex F02, chat-suchqualitaet-2.md).
 * Eine Verneinung wird nie per Wortanteil „freigesprochen“ (F03: „mit/ohne Speicher nicht
 * erlaubt“ hätte die Warnung verloren).
 */
export function sentenceExtras(answer: string, report: CitationReport, excerpts: readonly string[], question = ''): SentenceExtra[] {
  const sourceNumbers = excerpts.map(pageNumbers)
  const askedNumbers = new Set(numberUnits(question).map(numberCore))
  return report.sentences.map((s: SentenceCheck) => {
    if (s.refs.length === 0) {
      const text = answer.slice(s.start, s.end)
      const gap = s.status === 'uncited' && isGapStatement(text, question)
      if (s.status === 'uncited' && !gap && isLabel(text) && isTableLabelCell(answer, s.start)) return { missingNumbers: [], negation: false, label: true }
      const unsourced = s.status === 'uncited' && !gap
        ? numberUnits(withoutSourceMentions(text, excerpts.length)).filter((n) => !askedNumbers.has(numberCore(n))).map(showNumber)
        : []
      return { missingNumbers: [], negation: false, gap, ...(unsourced.length ? { unsourcedNumbers: unsourced } : {}) }
    }
    const plain = withoutSourceMentions(answer.slice(s.start, s.end).replace(/(?<!\\)\[\d{1,3}\]/g, ' '), excerpts.length)
    const cited = s.refs.map((n) => sourceNumbers[n - 1]).filter(Boolean)
    // Zahl ohne Einheit: irgendwo auf der Seite genügt; mit Einheit nur mit derselben Einheit.
    const notOnPage = numberUnits(plain).filter((n) => !cited.some((pn) => pn.has(n) || pn.has(withoutZeroFraction(n))))
    const missingNumbers = notOnPage.filter((n) => !askedNumbers.has(numberCore(n))).map(showNumber)
    const questionNumbers = notOnPage.filter((n) => askedNumbers.has(numberCore(n))).map(showNumber)
    // Nur wenn jede Zahl einzeln belegt ist und ein Preis dabei ist: sonst meldet schon `number`.
    const withUnit = numberUnits(plain).filter((n) => numberCore(n) !== n)
    const apart = notOnPage.length === 0 && withUnit.length >= 2 && withUnit.some((n) => /(?:eur|usd)$/.test(n))
      && !s.refs.some((n) => excerpts[n - 1] !== undefined && numbersNear(excerpts[n - 1], withUnit))
    const tokens = plain.toLowerCase().match(/\p{L}+/gu) ?? []
    const negation = tokens.some((t) => NEGATIONS.has(t))
    return { missingNumbers, negation, ...(questionNumbers.length ? { questionNumbers } : {}), ...(apart ? { apartNumbers: withUnit.map(showNumber) } : {}) }
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
    const text = answer.slice(s.start, s.end).replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim()
    return [`> - **${flag}:** ${text.length > 160 ? `${text.slice(0, 160)}…` : text}`]
  })
  const warnBlock = warnings.length ? `\n> ${labels.warnings}\n${warnings.join('\n')}` : ''
  return `${body}${lines.length ? `\n\n${lines.join('\n')}` : ''}\n\n> ${labels.check}${warnBlock}`
}
