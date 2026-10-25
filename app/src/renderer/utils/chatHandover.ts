// Übergabe Chat → Auftrag mit dem ganzen Gespräch (docs/codex-collab/chat-alltagsfragen-messung.md,
// Abschnitt „Übergabe“). Vorher ging nur das letzte Frage-Antwort-Paar mit: „aus den beiden Infos
// eine Tabelle“ kam ohne die beiden Infos beim Agenten an (real, 25.10.2026).
//
// Regeln:
// - Ziel ist die Frage zur gewählten Antwort; der Verlauf reicht bis einschließlich dieser Antwort.
// - Webantworten gehen nie mit (Codex F03, chat-daraus-erstellen.md: Ziffern ohne ihre Quellen) —
//   nur die Frage, mit Vermerk.
// - Abgebrochene/fehlerhafte Wechsel und feste App-Antworten fallen weg.
// - Fragen werden nie weggelassen, solange der Platz reicht; gekürzt wird zuerst bei älteren
//   Antworten, dann fallen die ältesten Wechsel ganz weg (sichtbar gezählt).

export interface HandoverMessage {
  role: 'user' | 'assistant'
  content: string
  stopped?: boolean
  error?: boolean
  origin?: 'web'
  appNote?: string
  /** Antwort aus Modellwissen zu einem früheren Webthema (Weg 1) — ohne Quellen (F08). */
  webTopicsUsed?: number
}

export interface HandoverTurn {
  question: string
  /** null = Antwort bewusst nicht übernommen (Webantwort) oder ausgelassen. */
  answer: string | null
  answerNote?: 'web' | 'omitted'
  answerClipped?: boolean
  /** Antwort zu einem früheren Webthema aus Modellwissen, ohne Quellen (F08). */
  topicOnly?: boolean
}

export interface ChatHandover {
  goal: string
  turns: HandoverTurn[]
  /** So viele älteste Wechsel fielen aus Platzgründen ganz weg. */
  droppedTurns: number
  /** Irgendetwas wurde gekürzt oder ausgelassen. */
  clipped: boolean
  /** So viele Webantworten gehen nur als Frage mit (F01). */
  webTurns: number
}

export const HANDOVER_TOTAL_CHARS = 12000
export const HANDOVER_LAST_ANSWER_CHARS = 6000
export const HANDOVER_EARLIER_ANSWER_CHARS = 1500
export const HANDOVER_QUESTION_CHARS = 1000

const cut = (text: string, max: number): [string, boolean] => (text.length > max ? [`${text.slice(0, max)} …`, true] : [text, false])

const size = (turns: HandoverTurn[]) => turns.reduce((n, t) => n + t.question.length + (t.answer?.length ?? 0) + 40, 0)

/** Baut die Übergabe für die Antwort an Position `upto` (Index in `messages`). */
export function buildChatHandover(messages: readonly HandoverMessage[], upto: number, totalChars = HANDOVER_TOTAL_CHARS): ChatHandover {
  const turns: HandoverTurn[] = []
  let clipped = false
  for (let i = 0; i < upto; i++) {
    const q = messages[i]
    const a = messages[i + 1]
    if (q.role !== 'user' || !a || a.role !== 'assistant' || i + 1 > upto) continue
    i++
    if (q.stopped || a.stopped || a.error || a.appNote) continue
    const [question, qc] = cut(q.content.trim(), HANDOVER_QUESTION_CHARS)
    clipped ||= qc
    if (a.origin === 'web' || q.origin === 'web') {
      turns.push({ question, answer: null, answerNote: 'web' })
      continue
    }
    const isLast = i === upto
    const [answer, ac] = cut(a.content.trim(), isLast ? HANDOVER_LAST_ANSWER_CHARS : HANDOVER_EARLIER_ANSWER_CHARS)
    clipped ||= ac
    turns.push({ question, answer, ...(ac ? { answerClipped: true } : {}), ...(a.webTopicsUsed ? { topicOnly: true } : {}) })
  }
  const goal = turns.length ? turns[turns.length - 1].question : ''

  // Zu lang: ältere Antworten auslassen (älteste zuerst), die letzte Antwort bleibt.
  for (let k = 0; k < turns.length - 1 && size(turns) > totalChars; k++) {
    if (turns[k].answer !== null) {
      turns[k] = { question: turns[k].question, answer: null, answerNote: 'omitted' }
      clipped = true
    }
  }
  // Immer noch zu lang: älteste Wechsel ganz weg, der letzte bleibt.
  let droppedTurns = 0
  while (turns.length > 1 && size(turns) > totalChars) {
    turns.shift()
    droppedTurns++
    clipped = true
  }
  return { goal, turns, droppedTurns, clipped, webTurns: turns.filter(t => t.answerNote === 'web').length }
}

export interface HandoverLabels {
  user: string
  petrol: string
  webAnswer: string
  omitted: string
  clippedMark: string
  topicOnly: string
  dropped: (n: number) => string
}

/** Verlauf als Text für den Auftrag: älteste zuerst, je Wechsel Frage und Antwort. */
export function formatHandoverTranscript(h: ChatHandover, l: HandoverLabels): string {
  const parts: string[] = []
  if (h.droppedTurns > 0) parts.push(l.dropped(h.droppedTurns))
  for (const t of h.turns) {
    parts.push(`${l.user}: ${t.question}`)
    if (t.answerNote === 'web') parts.push(`${l.petrol}: ${l.webAnswer}`)
    else if (t.answerNote === 'omitted') parts.push(`${l.petrol}: ${l.omitted}`)
    else parts.push(`${l.petrol}${t.topicOnly ? ` ${l.topicOnly}` : ''}: ${t.answer}${t.answerClipped ? ` ${l.clippedMark}` : ''}`)
  }
  return parts.join('\n\n')
}
