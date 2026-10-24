/**
 * Verlauf für das Sprachmodell im Notiz-Chat (Codex F22/F38, Privacy): Vault-Antworten und
 * die zugehörigen Vault-Fragen tragen Notiz- und Mail-Text und gehen NIE in den Verlauf einer
 * normalen Chat-Anfrage — unabhängig vom Anbieter (lokal, LM Studio, OpenRouter, LLMBase).
 * Reine Funktion, damit der Ausschluss testbar ist, statt nur als Filterzeile im Komponentencode.
 */

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
  origin?: 'vault-rag'
}

export const HISTORY_LIMIT = 10

export function chatHistoryForModel<T extends HistoryMessage>(messages: readonly T[], limit = HISTORY_LIMIT): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => m.origin !== 'vault-rag')
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
