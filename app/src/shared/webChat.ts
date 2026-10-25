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

// ── Suchwörter: Gesprächssatz statt Stichwörter ──────────────────────────────

// Interjektionen, die ALLEIN am Satzanfang nichts über das Thema sagen. Nur mit folgendem
// Satzzeichen gewertet: „Gut Hohenhaus Öffnungszeiten“ und „Ja-Stimmen 2025“ sind Suchen.
const CHATTY_INTERJECTION = /^(?:okay|ok|also|hm+|ähm|äh|naja|na ja|na dann|na gut|gut|ja|nein|doch|genau|super|danke|hallo|hi|hey|moin|alles klar|well|hello|thanks|thank you)\s*[,!.…;:?]/
// Interjektion + gesprächige Fortsetzung, auch ohne Satzzeichen: „Okay schauen wir mal“.
const CHATTY_INTERJECTION_THEN = /^(?:okay|ok|also|naja|na ja|na dann|na gut|gut|ja|nein|hm+|ähm|äh|well|so)\s*,?\s*(?:schau(?:en)? (?:wir|mal)|mal sehen|lass(?:t)? uns|und (?:jetzt|dann|nun)|was (?:nun|jetzt))\b/
// Wendungen, die an Petrol gerichtet sind, nicht an eine Suchmaschine.
const CHATTY_PHRASE = /^(?:mal sehen|schau(?:en)? wir|lass(?:t)? uns|sag mal|kannst du|könntest du|weißt du|hast du|ich (?:möchte|will|würde|wollte|brauche|suche)|can you|could you|would you|let'?s|tell me|i (?:want|would like|need))\b/
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
  if (CHATTY_PHRASE.test(q) || CHATTY_INTERJECTION_THEN.test(q)) return true
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

export type WebSkipCategory = 'translator' | 'social'

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
  /**
   * Zahlen, die nicht in der zitierten Seite stehen, aber in der Frage des Nutzers
   * („Balkonkraftwerk mit 8 Modulen“). Weiterhin eine Warnung (Codex F02), nur mit
   * erklärter Herkunft.
   */
  questionNumbers?: string[]
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
 *
 * Zahlen aus der Frage, die nicht in der Seite stehen, bleiben eine Warnung, werden aber als
 * `questionNumbers` getrennt benannt („nur aus deiner Frage“) — sonst bringt eine
 * Suggestivfrage ihre Zahl als Seitenbeleg durch (Codex F02, chat-suchqualitaet-2.md).
 * Eine Verneinung wird nie per Wortanteil „freigesprochen“ (F03: „mit/ohne Speicher nicht
 * erlaubt“ hätte die Warnung verloren).
 */
export function sentenceExtras(answer: string, report: CitationReport, excerpts: readonly string[], question = ''): SentenceExtra[] {
  const sourceWords = excerpts.map(contentWords)
  const questionWords = contentWords(question)
  return report.sentences.map((s: SentenceCheck) => {
    if (s.refs.length === 0) {
      return { missingNumbers: [], negation: false, gap: s.status === 'uncited' && isGapStatement(answer.slice(s.start, s.end)) }
    }
    const plain = answer.slice(s.start, s.end).replace(/(?<!\\)\[\d{1,3}\]/g, ' ')
    const words = contentWords(plain)
    const cited = s.refs.map((n) => sourceWords[n - 1]).filter(Boolean)
    const notOnPage = [...words].filter((w) => /\p{N}/u.test(w) && !cited.some((sw) => sw.has(w)))
    const missingNumbers = notOnPage.filter((w) => !questionWords.has(w))
    const questionNumbers = notOnPage.filter((w) => questionWords.has(w))
    const tokens = plain.toLowerCase().match(/\p{L}+/gu) ?? []
    const negation = tokens.some((t) => NEGATIONS.has(t))
    return { missingNumbers, negation, ...(questionNumbers.length ? { questionNumbers } : {}) }
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
