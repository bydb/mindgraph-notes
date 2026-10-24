/**
 * Verlauf für das Sprachmodell im Notiz-Chat (Codex F22/F38, Privacy): Vault-Antworten und
 * die zugehörigen Vault-Fragen tragen Notiz- und Mail-Text und gehen NIE in den Verlauf einer
 * normalen Chat-Anfrage — unabhängig vom Anbieter (lokal, LM Studio, OpenRouter, LLMBase).
 * Dasselbe gilt für Webwechsel im Petrol-Chat (Websuche, Codex F09): ohne die damaligen
 * Seiten könnte das Modell zu „Was stand in Quelle 1?“ nur raten.
 * Reine Funktion, damit der Ausschluss testbar ist, statt nur als Filterzeile im Komponentencode.
 */

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
  /** 'web': Webwechsel im Petrol-Chat — Frage UND Antwort bleiben dem Modell verborgen (F09). */
  origin?: 'vault-rag' | 'web'
}

export const HISTORY_LIMIT = 10

export function chatHistoryForModel<T extends HistoryMessage>(messages: readonly T[], limit = HISTORY_LIMIT): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => m.origin !== 'vault-rag' && m.origin !== 'web')
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content }))
}

/** Nachricht im Petrol-Chat, soweit für den Verlauf relevant. */
export interface TurnMessage extends HistoryMessage {
  stopped?: boolean
  error?: boolean
}

/**
 * Verlauf für den Petrol-Chat (Codex F27): nur abgeschlossene Wechsel. Eine abgebrochene
 * Antwort ist ein Bruchstück und ein Fehler keine Antwort — beide gehen nicht ans Modell,
 * und die Frage davor auch nicht, sonst stünde sie als offene Frage im Verlauf und das
 * Modell beantwortete sie beim nächsten Mal ungefragt mit. Eine Frage, die vor dem ersten
 * Wort gestoppt wurde, trägt `stopped` selbst (F31).
 */
export function completedTurns<T extends TurnMessage>(messages: readonly T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.stopped || (m.role === 'assistant' && m.error)) continue
    if (m.role === 'user') {
      const next = messages[i + 1]
      if (next && next.role === 'assistant' && (next.stopped || next.error)) continue
    }
    out.push(m)
  }
  return out
}

/** Nachricht des Petrol-Chats, soweit für Themenfragen relevant. */
export interface WebTopicMessage extends TurnMessage {
  web?: { kind: string; report?: { usedSources: number[] } }
  /** Frage zu eingefrorenen Auszügen („Hiermit weiterfragen“): kein eigenes Thema. */
  followUp?: boolean
}

export const WEB_TOPIC_LIMIT = 3
export const WEB_TOPIC_CHARS = 500

/**
 * Thema früherer Webfragen (docs/codex-collab/chat-webthema-im-verlauf.md, Weg 1): nur die
 * eigenen FRAGEN erfolgreicher Webwechsel — Antwort fertig (`kind: 'answer'`), mindestens eine
 * Quelle zitiert, nichts gestoppt oder gescheitert (Codex F03). Nie Antwort, Quellen, Suchwörter.
 * Älteste zuerst, höchstens drei, je 500 Zeichen mit Kürzungsmarke (F04).
 */
export function webTopicQuestions<T extends WebTopicMessage>(messages: readonly T[], limit = WEB_TOPIC_LIMIT, maxChars = WEB_TOPIC_CHARS): Array<{ text: string; clipped: boolean }> {
  const out: Array<{ text: string; clipped: boolean }> = []
  for (let i = 0; i < messages.length - 1; i++) {
    const q = messages[i]
    const a = messages[i + 1]
    // Eine Nachfrage („Und für Vereine?“) trägt ohne ihre Seiten kein Thema und ginge sonst als
    // „frühere Webfrage“ an spätere Nachrichten, bei Cloud auch ins Netz.
    if (q.role !== 'user' || q.origin !== 'web' || q.stopped || q.followUp) continue
    if (a.role !== 'assistant' || a.origin !== 'web' || a.stopped || a.error) continue
    if (a.web?.kind !== 'answer' || !(a.web.report?.usedSources?.length)) continue
    const text = q.content.replace(/\s+/g, ' ').trim()
    if (!text) continue
    out.push(text.length > maxChars ? { text: text.slice(0, maxChars), clipped: true } : { text, clipped: false })
  }
  return out.slice(-limit)
}

/** Was die Erkennung über den Verlauf wissen muss (Codex F08). */
export interface OldWebSourceContext {
  /** Fragen erfolgreicher Webwechsel (`webTopicQuestions`). */
  topics: readonly string[]
  /** Die letzte sichtbare Antwort gehört zu einem Webwechsel (`lastVisibleAnswerIsWeb`). */
  lastAnswerWasWeb: boolean
}

/**
 * Worauf zeigt „deine letzte Antwort“? Auf die letzte SICHTBARE Antwort (Codex F10) — auch eine
 * gestoppte oder gescheiterte, nicht still auf eine ältere fertige Webantwort zurückgefallen.
 * Web zählt, was `origin: 'web'` trägt: Webantwort, gestopptes Web-Bruchstück, feste App-Antwort
 * zu alten Quellen — nichts davon sieht das Modell im Verlauf.
 */
export function lastVisibleAnswerIsWeb<T extends HistoryMessage>(messages: readonly T[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return messages[i].origin === 'web'
  }
  return false
}

const NUM_WORD = '(?:eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|one|two|three|four|five|six|seven|eight|nine|ten)'
const ORDINAL = '(?:\\d{1,2}\\.|erste[nrms]?|zweite[nrms]?|dritte[nrms]?|vierte[nrms]?|fünfte[nrms]?|sechste[nrms]?|first|second|third|fourth|fifth)'
// Nicht „Seite“: „die erste Seite des Buches“ ist keine Quelle.
const SOURCE_WORD = '(?:quelle|quellen|fußnote|fussnote|source|sources|footnote|link|links)'
// „Quelle 3“, „Quelle Nr. 3“, „Quelle eins“, „Fußnote [2]“ — Nummer hinter dem Wort.
const NUMBERED_AFTER = new RegExp(`\\b(?:quelle|quellen|quellennummer|fußnote|fussnote|source|sources|footnote)\\s*(?:nr\\.?|nummer|no\\.?|#)?\\s*(?:\\[?\\s*\\d|${NUM_WORD}\\b)`)
// „die 1. Quelle“, „der zweite Link“, „the first source“ — Ordnungszahl davor.
const NUMBERED_BEFORE = new RegExp(`(?:^|\\s)${ORDINAL}\\s+${SOURCE_WORD}\\b`)
// Rückbezug auf etwas, das Petrol früher gefunden/benutzt/gezeigt hat.
const PAST_SELF = /\b(?:hattest\s+du|hast\s+du|habt\s+ihr|did\s+you|you\s+(?:used|cited|found|mentioned|showed|linked|gave))\b[^.?!]*\b(?:benutzt|verwendet|genutzt|genannt|zitiert|angegeben|gefunden|gelesen|verlinkt|gezeigt|use|used|cite|cited|find|found|mention|mentioned|link|linked|show|showed)\b|\b(?:vorhin|eben\s+noch|gerade\s+eben|zuvor|damals|earlier)\b/
const SOURCE_NOUN = /\b(?:quelle|quellen|seite|seiten|webseite|website|webpage|link|links|url|artikel|fundstelle|source|sources|page|site|article)\b/
// Ergebnisse einer Websuche — mit jedem Artikel gemeint („in der Webantwort“). „Websuche“ allein
// ist auch die Funktion („Wie funktioniert die Websuche?“) und zählt nur mit Rückbezug.
const WEB_RESULT = /\bweb\s*-?\s*(?:antwort|antworten|recherche|quelle|quellen|answer|answers|results?|research)\b/
const WEB_SEARCH_PAST = /\b(?:deine[rnms]?|your|letzte[nrms]?|vorige[nrms]?|vorherige[nrms]?|damalige[nrms]?|last|previous|earlier)\s+web\s*-?\s*(?:suche|search)\b/
const WAS_STAND = /\b(?:was\s+(?:stand|steht)|what\s+(?:was|is|did\s+it\s+say))\s+(?:denn\s+)?(?:in|auf|bei|on|in)\s+(?:der|den|dem|einer|deiner|the|that|your)\s+(?:quelle|quellen|seite|webseite|website|artikel|link|source|page|webpage|site|article)\b/
// „deine letzte Antwort“ — zeigt auf die letzte sichtbare Antwort.
const LAST_ANSWER = /\b(?:deine[rnms]?|die|der|in\s+der|aus\s+der|your|the)\s+(?:letzte|letzten|vorige|vorigen|vorherige|vorherigen|eben\w*|last|previous)\s+(?:antwort|answer)\b/
// „was hast du zu X gesagt“ — kann eine ältere Antwort zu einem Thema meinen.
const TOPIC_ANSWER = /\b(?:hast|hattest)\s+du\b[^.?!]*\b(?:geantwortet|gesagt|geschrieben|erklärt|erwähnt|behauptet|gemeint)\b|\bwas\s+(?:meintest|sagtest|schriebst)\s+du\b|\bwhat\s+did\s+you\s+(?:say|write|answer|mean)\b|\b(?:damalige|frühere|ältere|erste)[nrms]?\s+antwort\b|\b(?:earlier|first|old)\s+answer\b/
const MATH_WORD = /(?:matrix|vektor|vector|intervall|interval|array|liste|list|index|element|formel|gleichung|zeile|spalte|row|column)\s*$/
const STOP = new Set(['welche', 'welcher', 'welches', 'warum', 'wieso', 'weshalb', 'wann', 'woher', 'wohin', 'kannst', 'könntest', 'bitte', 'erkläre', 'erklär', 'genau', 'genauer', 'eigentlich', 'heute', 'gerade', 'nochmal', 'einmal', 'diese', 'dieser', 'dieses', 'antwort', 'about', 'which', 'there', 'their', 'would', 'could', 'should', 'answer'])
const contentWords = (s: string): string[] => (s.toLowerCase().match(/[\p{L}\d]{5,}/gu) ?? []).filter(w => !STOP.has(w))

/** Frei stehendes [n] als Zitiermarke — nicht a[3], nicht neben Rechenzeichen, nicht „Matrix [2]“. */
function hasCitationMarker(t: string): boolean {
  const re = /\[\d{1,2}\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const before = t.slice(0, m.index)
    const after = t.slice(m.index + m[0].length)
    if (before && !/[\s(„"']$/.test(before)) continue
    if (after && !/^[\s.,;:!?)“"']/.test(after)) continue
    if (/[-+*/^=<>]\s*$/.test(before) || /^\s*[-+*/^=<>]/.test(after)) continue
    if (MATH_WORD.test(before.trimEnd())) continue
    return true
  }
  return false
}

/**
 * Fragt die Nachricht nach Inhalt einer damaligen Webantwort oder ihrer Quellen? Dann antwortet die
 * App fest, statt das Modell raten zu lassen (Codex F01/F08) — es sieht weder Antwort noch Seiten.
 * Eindeutige Verweise (Quelle 3, die 1. Quelle, die Webantwort, die Seite von vorhin) zählen immer.
 * „Deine letzte Antwort“ zählt nur, wenn die letzte sichtbare Antwort ein Webwechsel war (F10);
 * „was hast du zu X gesagt“ zusätzlich, wenn X Thema einer früheren Webfrage ist. Sonst ist eine
 * normale Antwort gemeint, die das Modell im Verlauf hat. Musterbasiert und deshalb nie lückenlos —
 * die zweite Schranke ist, dass das Modell frühere Webfragen nur als unbelegtes Thema bekommt.
 * Die feste Antwort sagt, wie man ohne Rückbezug neu fragt; ein Fehlalarm kostet eine
 * Umformulierung, ein verpasster Fall womöglich einen erfundenen Quelleninhalt.
 */
export function asksAboutOldWebSources(text: string, ctx: OldWebSourceContext = { topics: [], lastAnswerWasWeb: false }): boolean {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim()
  if (NUMBERED_AFTER.test(t) || NUMBERED_BEFORE.test(t)) return true
  if (hasCitationMarker(t)) return true
  if (WEB_RESULT.test(t) || WEB_SEARCH_PAST.test(t) || WAS_STAND.test(t)) return true
  if (SOURCE_NOUN.test(t) && PAST_SELF.test(t)) return true
  if (LAST_ANSWER.test(t)) return ctx.lastAnswerWasWeb
  if (TOPIC_ANSWER.test(t)) {
    if (ctx.lastAnswerWasWeb) return true
    const words = new Set(contentWords(t))
    return ctx.topics.some(q => contentWords(q).some(w => words.has(w)))
  }
  return false
}
