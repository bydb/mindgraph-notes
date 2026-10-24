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
    if (q.role !== 'user' || q.origin !== 'web' || q.stopped) continue
    if (a.role !== 'assistant' || a.origin !== 'web' || a.stopped || a.error) continue
    if (a.web?.kind !== 'answer' || !(a.web.report?.usedSources?.length)) continue
    const text = q.content.replace(/\s+/g, ' ').trim()
    if (!text) continue
    out.push(text.length > maxChars ? { text: text.slice(0, maxChars), clipped: true } : { text, clipped: false })
  }
  return out.slice(-limit)
}

/**
 * Fragt die Nachricht nach Inhalt einer damaligen Antwort oder Quelle („Was stand in Quelle 1?“)?
 * Dann antwortet die App fest, statt das Modell raten zu lassen (Codex F01) — es sieht weder
 * Antwort noch Seiten.
 */
export function asksAboutOldWebSources(text: string): boolean {
  const t = text.toLowerCase()
  return /\bquelle(?:n|nnummer)?\s*\[?\s*\d/.test(t)
    || /(?<!\\)\[\d{1,2}\]/.test(t)
    || /\b(?:source|sources)\s*\[?\s*\d/.test(t)
    || /\bwas\s+(?:stand|steht)\s+(?:in|auf|bei)\s+(?:der|den|dem|quelle|seite)/.test(t)
    || /\b(?:in|aus)\s+(?:der|deiner)\s+(?:vorigen|letzten|damaligen|vorherigen|eben\w*)\s+antwort\b/.test(t)
}
