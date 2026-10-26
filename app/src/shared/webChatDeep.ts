// „Gründliche“ Websuche im Petrol-Chat — reine Bausteine, prozessübergreifend.
//
// Entwurf + drei Codex-Runden: docs/codex-collab/chat-gruendliche-suche.md (Rev. 3, R1/R3 aus
// Rev. 2, S1–S6, Pflichtvorgaben F16–F21). Das Modell plant Suchanfragen und wählt Seiten; alles,
// was hier steht, prüft der Main deterministisch: Antwortformat, Längen, Budget, Kandidaten,
// Wörterabgleich. Nichts davon beweist, dass eine Frage beantwortet ist — der Wörterabgleich heißt
// deshalb überall „kommt nicht vor“ / „ähnliche Wörter“, nie „abgedeckt“ (F10, F17).

import { hostnameFromUrl, normalizeQuery, normalizeWebUrl, type WebSearchHit } from './webResearch'
import { isSearchFiller } from './webChat'

// ── Grenzen (R3, S3, S4) ─────────────────────────────────────────────────────

export const DEEP_LIMITS = {
  /** Suchanfragen aus der Planung. */
  planSearches: 2,
  /** Alle Suchen des Laufs, inklusive der einen reservierten Nachsuche und eines Rückfalls. */
  totalSearches: 3,
  /** Begonnene Seitenabrufe im ganzen Lauf; Fehlschläge zählen mit. */
  fetches: 5,
  /** Höchstens so viele Nummern darf das Modell wählen (= Abrufbudget, F18). */
  ranks: 5,
  /** Höchstens so viele Seiten werden eingefroren. */
  maxPages: 4,
  /** Mindestlänge je eingefrorenem Auszug (S4). */
  minExcerpt: 1500,
  /** Kandidaten, die dem Modell zur Wahl gezeigt werden. */
  candidates: 12,
  snippetMax: 300,
  queryMax: 120,
  /** Recherchefrist (Planung, Suche, Wahl, Abruf) — die Antwortphase hängt nur am Stopp (S5). */
  deadlineMs: 60_000,
  deadlineLocalMs: 90_000
} as const

// ── Modellantworten prüfen ───────────────────────────────────────────────────

export type DeepRejectReason = 'empty' | 'too-long' | 'duplicate' | 'over-limit'
  /** Nur Recherche-Schleife (F42): Adresse, E-Mail, Steuerzeichen, lange fremde Ziffernfolge. */
  | 'url' | 'email' | 'control' | 'id'

export interface DeepPlan {
  queries: string[]
  rejected: Array<{ text: string; reason: DeepRejectReason }>
}

/** Erstes JSON-Objekt im Text (Modelle umgeben es gern mit Erklärungen oder ```json). */
function firstJsonObject(raw: string): unknown {
  const start = raw.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(raw.slice(start, i + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

/**
 * Suchplan `{ "queries": [...] }` prüfen. Zu lange Anfragen werden verworfen, nie gekürzt
 * (F04 aus chat-suchwoerter-vorschlag.md); jede Verwerfung wird mit Grund gemeldet (R1).
 * null = kein lesbares JSON; leere `queries` = nichts Gültiges (beides: Rückfall nötig).
 */
const MONTHS = 'Januar|Jänner|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|January|February|March|May|June|July|October|December'
/** Tagesgenaue Daten: 25.10.2026, 25.10., 2026-10-25, 25. Oktober 2026, 25 Oktober, October 25 2026. */
const DAY_DATE = new RegExp(
  `\\b\\d{4}-\\d{1,2}-\\d{1,2}\\b|\\b\\d{1,2}\\.\\s?\\d{1,2}\\.(?:\\s?\\d{2,4}\\b)?|\\b\\d{1,2}\\.?\\s(?:${MONTHS})(?:\\s\\d{4})?\\b|\\b(?:${MONTHS})\\s\\d{1,2},?(?:\\s\\d{4})?\\b`,
  'giu'
)

/**
 * Entfernt tagesgenaue Daten aus einer geplanten Suchanfrage, wenn die Frage selbst keines nennt.
 * Bei „heute“ schrieb das Modell das Datum in die Anfrage und fand Ratgeber und Spam statt
 * Nachrichten (Messung 25.10.2026: „politische Ereignisse heute 2026-10-26“). Ein Jahr allein bleibt.
 */
export function stripUnaskedDates(query: string, question: string): string {
  DAY_DATE.lastIndex = 0
  if (DAY_DATE.test(question)) return query
  return normalizeQuery(query.replace(DAY_DATE, ' ').replace(/\s+/g, ' '))
}

export function parsePlanReply(raw: string, max: number = DEEP_LIMITS.planSearches, question?: string): DeepPlan | null {
  const obj = firstJsonObject(raw) as { queries?: unknown } | null
  if (!obj || !Array.isArray(obj.queries)) return null
  const queries: string[] = []
  const rejected: DeepPlan['rejected'] = []
  const seen = new Set<string>()
  for (const item of obj.queries) {
    const text = typeof item === 'string' ? normalizeQuery(item.replace(/\s+/g, ' ')) : ''
    const cleaned = text && question !== undefined ? stripUnaskedDates(text, question) : text
    if (!cleaned) { rejected.push({ text, reason: 'empty' }); continue }
    if ([...cleaned].length > DEEP_LIMITS.queryMax) { rejected.push({ text: cleaned, reason: 'too-long' }); continue }
    const key = cleaned.toLowerCase()
    if (seen.has(key)) { rejected.push({ text: cleaned, reason: 'duplicate' }); continue }
    if (queries.length >= max) { rejected.push({ text: cleaned, reason: 'over-limit' }); continue }
    seen.add(key)
    queries.push(cleaned)
  }
  // Lesbares JSON ohne gültige Anfrage: leere Liste MIT Gründen — der Main wählt den Rückfall und
  // zeigt trotzdem, was verworfen wurde (Codex F37).
  return { queries, rejected }
}

/**
 * Seitenwahl `{ "pick": [3, 1, 7] }` (1-basiert) prüfen → 0-basierte Positionen in der eigenen
 * Kandidatenliste, in Wahlreihenfolge. Das Modell kann so keine URL einbringen (Codex Frage 2).
 * null = keine gültige Nummer.
 */
export function parsePickReply(raw: string, candidateCount: number, max: number = DEEP_LIMITS.ranks): number[] | null {
  const obj = firstJsonObject(raw) as { pick?: unknown } | null
  if (!obj || !Array.isArray(obj.pick)) return null
  const out: number[] = []
  for (const n of obj.pick) {
    const k = typeof n === 'number' ? n : typeof n === 'string' && /^\d+$/.test(n.trim()) ? Number(n) : NaN
    if (!Number.isInteger(k) || k < 1 || k > candidateCount) continue
    if (out.includes(k - 1)) continue
    out.push(k - 1)
    if (out.length >= max) break
  }
  return out.length > 0 ? out : null
}

// ── Kandidaten reihum zusammenführen (R4) ────────────────────────────────────

export interface DeepCandidate {
  url: string
  host: string
  title: string
  snippet: string
  /** Aus welchen Suchanfragen (0-basiert) der Treffer stammt. */
  from: number[]
}

/**
 * Reihum aus den Trefferlisten: 1. von A, 1. von B, 2. von A … — sonst verdrängt die erste
 * Anfrage alle weiteren (F05). Dubletten werden zusammengelegt, die Herkunft bleibt.
 */
export function mergeCandidatesRoundRobin(lists: ReadonlyArray<readonly WebSearchHit[]>, max: number = DEEP_LIMITS.candidates, exclude: ReadonlySet<string> = new Set()): DeepCandidate[] {
  const out: DeepCandidate[] = []
  const byUrl = new Map<string, DeepCandidate>()
  const longest = lists.reduce((n, l) => Math.max(n, l.length), 0)
  for (let pos = 0; pos < longest; pos++) {
    for (let q = 0; q < lists.length; q++) {
      const hit = lists[q][pos]
      if (!hit) continue
      const url = normalizeWebUrl(hit.url)
      if (!url || exclude.has(url)) continue
      const known = byUrl.get(url)
      if (known) {
        if (!known.from.includes(q)) known.from.push(q)
        continue
      }
      const host = hostnameFromUrl(url)
      if (!host || out.length >= max) continue
      const c: DeepCandidate = { url, host, title: (hit.title || '').trim(), snippet: (hit.snippet || '').trim(), from: [q] }
      byUrl.set(url, c)
      out.push(c)
    }
  }
  return out
}

// ── Seitenzahl nach Platz (S4, F19) ──────────────────────────────────────────

/** Obergrenze VOR dem Abruf: so viele Seiten passen mit Mindestlänge in den Platz. */
export function maxPagesForPlace(placeChars: number): number {
  return Math.max(0, Math.min(DEEP_LIMITS.maxPages, Math.floor(placeChars / DEEP_LIMITS.minExcerpt)))
}

// ── Wörterabgleich (S2, F10, F17) ────────────────────────────────────────────

export interface TermCheck {
  /** Wörter/Zahlen der Frage, die in keinem Auszug vorkommen — auch nicht ähnlich. */
  missing: string[]
  /** Nicht wörtlich, aber in ähnlicher Form gefunden (Endung, Wortteil) — keine Aussage über Wörtliches. */
  similar: string[]
}

const MAX_TERMS = 10

// Arbeitsanweisungen an den Chat, kein Inhalt der Frage (GUI-Test 25.10.2026: „Erstelle mir eine
// Zusammenfassung …“ meldete „Erstelle“ und „Zusammenfassung“ als fehlend und löste eine unnötige
// Nachsuche aus). Gilt NUR für den Wörterabgleich, nicht für die Suchwörter (Füllwortliste bleibt
// bewusst schmal, Nutzerentscheidung).
const TASK_WORDS = new Set([
  'erstelle', 'erstell', 'erstellen', 'mache', 'mach', 'machen', 'schreibe', 'schreib', 'schreiben', 'fasse', 'fass',
  'zusammen', 'zusammenfassen', 'zusammenfassung', 'übersicht', 'gib', 'gebe', 'nenne', 'nenn', 'erkläre', 'erklär',
  'erklären', 'liste', 'auflisten', 'suche', 'such', 'suchen', 'finde', 'find', 'zeige', 'zeig', 'sag', 'sage', 'bitte',
  'create', 'make', 'write', 'summarize', 'summary', 'give', 'list', 'explain', 'show', 'find', 'search', 'tell', 'please'
])

// Deutsche Tausender eindeutig: 3.000 / 3 000 / 12.500.000 → 3000 usw. „3,000“ bleibt, wie es ist
// (kann eine Dezimalzahl sein, F17).
function normalizeNumber(tok: string): string {
  return /^\d{1,3}(?:[.   ]\d{3})+$/.test(tok) ? tok.replace(/[.   ]/g, '') : tok
}

function tokens(text: string): string[] {
  const merged = text.replace(/(\d)[   ](?=\d{3}\b)/g, '$1.')
  return (merged.match(/[\p{L}\p{N}][\p{L}\p{N}.,'-]*/gu) ?? [])
    .map((t) => t.replace(/[.,'-]+$/g, ''))
    .filter(Boolean)
}

/**
 * Prüfbegriffe der Frage: Zahlen, Wörter ab 3 Zeichen ohne Füllwörter, Kürzel aus Großbuchstaben.
 * Die Obergrenze gilt nur für Wörter — Zahlen und Jahre zählen immer, auch am Ende einer langen
 * Frage (Codex F31).
 */
export function questionTerms(question: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let wordCount = 0
  for (const raw of tokens(question)) {
    for (const part of raw.split('-')) {
      if (!part) continue
      const isNumber = /^\d[\d.,]*$/.test(part)
      const isAcronym = /^\p{Lu}{2,}$/u.test(part)
      if (!isNumber && !isAcronym && (part.length < 3 || isSearchFiller(part) || TASK_WORDS.has(part.toLowerCase()))) continue
      if (!isNumber && wordCount >= MAX_TERMS) continue
      const key = isNumber ? normalizeNumber(part) : part.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(isNumber ? key : part)
      if (!isNumber) wordCount++
    }
  }
  return out
}

const ENDINGS = ['ern', 'en', 'er', 'es', 'et', 'n', 'e', 's']

function stem(word: string): string {
  for (const e of ENDINGS) if (word.length - e.length >= 4 && word.endsWith(e)) return word.slice(0, -e.length)
  return word
}

/**
 * Welche Prüfbegriffe der Frage stehen in keinem der eingefrorenen Auszüge? Wörtlich gefunden →
 * nichts gemeldet; ähnlich (gleicher einfacher Stamm, oder Teil eines längeren Worts ab 5 Zeichen)
 * → `similar`; sonst → `missing`. Eine leere Liste behauptet nichts (keine „abgedeckt“-Anzeige).
 */
export function checkQuestionTerms(question: string, excerpts: readonly string[]): TermCheck {
  const exact = new Set<string>()
  const stems = new Set<string>()
  const words: string[] = []
  for (const text of excerpts) {
    for (const raw of tokens(text)) {
      for (const part of [raw, ...raw.split('-')]) {
        if (!part) continue
        const isNumber = /^\d[\d.,]*$/.test(part)
        const key = isNumber ? normalizeNumber(part) : part.toLowerCase()
        exact.add(key)
        if (!isNumber) { stems.add(stem(key)); words.push(key) }
      }
    }
  }
  const missing: string[] = []
  const similar: string[] = []
  for (const term of questionTerms(question)) {
    const isNumber = /^\d/.test(term)
    const key = isNumber ? term : term.toLowerCase()
    if (exact.has(key)) continue
    if (!isNumber && (stems.has(stem(key)) || (key.length >= 5 && words.some((w) => w.length > key.length && w.includes(key))))) {
      similar.push(term)
      continue
    }
    missing.push(term)
  }
  return { missing, similar }
}

/**
 * Zahlen und Jahre der Frage, die in KEINER der geplanten Suchanfragen stehen (Codex F24):
 * plant das Modell „Rundfunkbeitrag 2026“ für eine Frage nach 2027, fällt das hier auf.
 */
export function numbersMissingInQueries(question: string, queries: readonly string[]): string[] {
  const inQueries = new Set<string>()
  for (const q of queries) {
    for (const raw of tokens(q)) {
      for (const part of [raw, ...raw.split('-')]) if (/^\d[\d.,]*$/.test(part)) inQueries.add(normalizeNumber(part))
    }
  }
  return questionTerms(question).filter((t) => /^\d/.test(t) && !inQueries.has(t))
}

// ── Nachfrage ohne Bezug (S1, F09, F16) ──────────────────────────────────────

const BARE_START = /^(?:und|aber|oder|and|but|what about|how about|was ist mit|wie ist es mit|wie sieht es mit)\b/i
const BARE_REF = /\b(?:es|das|dort|dann|davon|dafür|damit|dazu|it|that|there|then)\b/i

/**
 * Kurze Frage, die sich vermutlich auf das Gespräch bezieht. NUR Anlass für einen Hinweis — nie
 * eine Sperre (F09): „Und was kostet eine Bahncard?“ ist selbständig und darf gesendet werden.
 */
export function looksLikeBareFollowUp(question: string): boolean {
  const q = question.trim()
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 6) return false
  return BARE_START.test(q) || BARE_REF.test(q)
}

// Bis zu drei Beiwörter dazwischen („anderen aktuellen amtlichen Seiten“, „other reliable sources“).
const MORE_PAGES = /\b(?:weitere[nmrs]?|andere[nmrs]?|mehr|neue[nmrs]?|zusätzliche[nmrs]?)(?:\s+\S+){0,3}?\s+(?:seiten|webseiten|websites|quellen|treffer|ergebnisse)\b|\b(?:woanders|anderswo)\b|\b(?:more|other|different|new|additional)(?:\s+\S+){0,3}?\s+(?:pages|sites|websites|sources|results)\b|\belsewhere\b/i
// Bitt-, Such- und Verweiswörter, die kein Thema tragen („Schaue bitte noch dazu auf weiteren Seiten“).
// Ein Verweiswort wie „dazu“ allein macht eine Frage nicht rückbezüglich, wenn sie ihr Thema selbst
// nennt (Codex F33: „Welche anderen Quellen gibt es dazu, wie man in Marburg ein Gewerbe anmeldet?“).
const MORE_PAGES_REQUEST_WORDS = new Set([
  'schau', 'schaue', 'schaut', 'guck', 'gucke', 'guckt', 'such', 'suche', 'sucht', 'recherchier', 'recherchiere',
  'recherchiert', 'nachsehen', 'nachschauen', 'nachgucken', 'finde', 'zeig', 'zeige', 'bitte', 'noch', 'auch', 'mal',
  'gerne', 'gern', 'please', 'look', 'search', 'check', 'try', 'find', 'show', 'also', 'too', 'some', 'any',
  'dazu', 'davon', 'darüber', 'hierzu', 'hierüber', 'nochmal', 'einmal', 'again', 'this', 'that'
])
const MORE_PAGES_MAX_WORDS = 14

/**
 * Kurze Bitte um weitere Seiten zum vorigen Thema („Schaue bitte auf weiteren Seiten“, „andere
 * Quellen?“). GUI-Test 26.10.2026: der Satz ging wörtlich an die Suche, das Thema fehlte Suche UND
 * Antwortmodell (Codex F02/F07, chat-nachfrage-weitere-seiten.md). NUR Anlass für einen Hinweis.
 */
export function asksForMorePages(question: string): boolean {
  const words = question.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > MORE_PAGES_MAX_WORDS || !MORE_PAGES.test(question)) return false
  // Nur, wenn die Bitte kein eigenes Thema nennt (Codex F23/F33): nach Abzug der Wendung, der
  // Füll-, Bitt- und Verweiswörter darf kein Sachwort übrig bleiben. „Bitte suche andere Quellen zur
  // Anmeldung in Marburg“ behält „Anmeldung“ und „Marburg“ — eigenständig.
  const rest = question.replace(new RegExp(MORE_PAGES.source, 'gi'), ' ')
  const content = (rest.match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((w) => !isSearchFiller(w) && !MORE_PAGES_REQUEST_WORDS.has(w.toLowerCase()))
  return content.length === 0
}

// „Suche noch gründlicher“ (GUI-Test 26.10.2026): der Satz ging wörtlich an die Suche und fand
// Synonymseiten zu „gründlich“. Gemeint war der Schalter „gründlich“ für das vorige Thema.
const DEEPER_HOW = /\b(?:gründlich\w*|genauer|ausführlich\w*|tiefer|intensiv\w*|sorgfältig\w*|besser|thorough\w*|deeper|harder|carefully|depth)\b/iu
const DEEPER_VERB = /\b(?:such\w*|recherch\w*|schau\w*|guck\w*|nachseh\w*|nachschau\w*|search\w*|look\w*|dig|research\w*)\b/iu
const DEEPER_EXTRA = new Set(['weiter', 'mehr', 'more', 'in', 'noch', 'nochmal', 'einmal', 'please', 'bitte', 'mal', 'nach'])

/**
 * Bitte, gründlicher zu suchen, ohne eigenes Thema („Suche noch gründlicher“, „recherchiere genauer“,
 * „search more thoroughly“). NUR Anlass für ein Angebot — gründlich einschalten und die vorige
 * Frage sichtbar ins Feld setzen.
 */
export function asksForDeeperSearch(question: string): boolean {
  const words = question.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > MORE_PAGES_MAX_WORDS) return false
  if (!DEEPER_HOW.test(question) || !DEEPER_VERB.test(question)) return false
  const content = (question.match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => {
    const l = w.toLowerCase()
    return !DEEPER_HOW.test(w) && !DEEPER_VERB.test(w) && !DEEPER_EXTRA.has(l) && !isSearchFiller(w) && !MORE_PAGES_REQUEST_WORDS.has(l)
  })
  return content.length === 0
}

/** Steht die vorige Frage schon vorn im Text? (Leerraum und Groß-/Kleinschreibung egal.) */
function startsWithQuestion(previous: string, text: string): boolean {
  const prev = previous.replace(/\s+/g, ' ').trim().toLowerCase()
  return !!prev && text.replace(/\s+/g, ' ').trim().toLowerCase().startsWith(prev)
}

/**
 * Klick „Vorige Frage als Thema ergänzen“: Entwurf und — falls offen — Suchfeld der Schnellsuche
 * bekommen die Vorfrage sichtbar vorangestellt, jedes nur, wenn sie dort noch fehlt (Codex F12/F22).
 * `webQuery: null` = kein eigenes Suchfeld, dann geht der Entwurf an die Suche.
 */
export function applyPreviousTopic(previous: string, draft: string, webQuery: string | null): { draft: string; webQuery: string | null } {
  return {
    draft: startsWithQuestion(previous, draft) ? draft : withPreviousQuestion(previous, draft),
    webQuery: webQuery == null || startsWithQuestion(previous, webQuery) ? webQuery : withPreviousQuestion(previous, webQuery)
  }
}

/**
 * Soll der Chat anbieten, die vorige Webfrage sichtbar ins Feld zu setzen? Bitten um weitere Seiten
 * in beiden Suchmodi, sonstige kurze Nachfragen nur bei „gründlich“ (S1). Erkannt wird an der
 * eigenen Bitte — hat der Nutzer die Vorfrage selbst vorangestellt, zählt der Rest dahinter (F32).
 * Angeboten wird, solange sie im Entwurf ODER im offenen Suchfeld der Schnellsuche (`webQuery`,
 * null = keins) noch fehlt — sonst ginge die Frage mit Thema ans Modell, die Suche ohne (F32).
 */
export function offerPreviousTopic(previous: string | null, draft: string, deep: boolean, webQuery: string | null = null): boolean {
  if (!previous) return false
  const prev = previous.replace(/\s+/g, ' ').trim()
  const q = draft.replace(/\s+/g, ' ').trim()
  if (!prev || !q) return false
  const draftHas = startsWithQuestion(prev, q)
  const queryHas = webQuery == null || startsWithQuestion(prev, webQuery)
  if (draftHas && queryHas) return false
  const own = draftHas ? q.slice(prev.length).replace(/^[\s–—:,-]+/, '') : q
  if (!own) return false
  return asksForMorePages(own) || asksForDeeperSearch(own) || (deep && looksLikeBareFollowUp(own))
}

/**
 * Die vorige vom Nutzer gesendete Frage einer Websuche (nicht die Modell-Suchanfragen, F16) —
 * nur aus Wechseln mit Antwort, nicht aus gestoppten oder gescheiterten. Steht danach eine fertige
 * Antwort OHNE Websuche, bezieht sich die nächste Nachricht auf sie, nicht auf das ältere Webthema:
 * dann null (Codex F33).
 */
export function previousWebQuestion(messages: ReadonlyArray<{ role: string; origin?: string; content: string; stopped?: boolean; error?: boolean; followUp?: boolean }>): string | null {
  for (let i = messages.length - 1; i > 0; i--) {
    const a = messages[i]
    const q = messages[i - 1]
    if (a.role === 'assistant' && a.origin !== 'web' && !a.stopped && !a.error && a.content.trim()) return null
    if (a.role !== 'assistant' || q.role !== 'user' || q.origin !== 'web' || q.followUp) continue
    if (a.stopped || a.error || q.stopped) continue
    const text = q.content.trim()
    // Eine Webfrage ohne eigenes Thema („suche bitte noch gründlicher“, „andere Quellen?“) ist kein
    // Thema zum Ergänzen — weiter zurück zur letzten Frage MIT Thema (GUI-Test 26.10.2026).
    if (text && (asksForMorePages(text) || asksForDeeperSearch(text))) continue
    if (text) return text
  }
  return null
}

/** „Vorige Frage als Thema ergänzen“: sichtbar ins Eingabefeld, nichts gekürzt. */
export function withPreviousQuestion(previous: string, draft: string): string {
  const prev = previous.replace(/\s+/g, ' ').trim()
  const q = draft.replace(/\s+/g, ' ').trim()
  if (!prev) return q
  if (!q) return prev
  return `${prev} – ${q}`
}
