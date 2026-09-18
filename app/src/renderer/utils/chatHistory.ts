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
