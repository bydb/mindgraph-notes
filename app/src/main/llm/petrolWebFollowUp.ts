// Nachfrage aus eingefrorenen Auszügen im Petrol-Chat (Stufe 2, Schritt B,
// docs/codex-collab/chat-recherche-zum-agenten.md F02/F05).
//
// Reine Logik, aus dem IPC-Handler herausgezogen, damit die Zusagen getestet sind:
//   - eine gesetzte Kennung heißt NIE „doch suchen“ (kein stilles Zurückfallen),
//   - die Auszüge kommen aus dem Main-Speicher, nie aus dem Renderer,
//   - sie werden weder neu vorbereitet noch gekürzt; zu lang heißt ablehnen oder den
//     Verlauf kürzen, nie die Seiten.

import { shortenHistoryToFit, type WebSource } from '../../shared/webChat'
import { buildPetrolWebSystemPrompt } from './petrolWebPrompt'
import { sanitizeScopeId, sanitizeSnapshotId, type WebSnapshotStore } from './petrolWebSnapshots'

/**
 * Platz, den die erste Antwort für eine spätere Nachfrage freihält (Zeichen). Der Nachfrage-Prompt
 * ist länger als der Such-Prompt (seine Einleitung erklärt „nicht neu gesucht“), und eine
 * Nachfrage ist selten kürzer als die erste Frage. Ohne diese Reserve lehnten kleine Kontext-
 * fenster eine Nachfrage ab, obwohl die erste Antwort knapp gepasst hatte (gemessen 24.10.2026:
 * 4096 und 6144 Tokens).
 */
export const FOLLOWUP_QUESTION_RESERVE_CHARS = 400

export const SNAPSHOT_GONE_TEXT = 'Diese Recherche ist nicht mehr da. Sie ist abgelaufen, das Gespräch wurde gewechselt, oder das Fenster wurde geschlossen.'

export type FollowUpRequest =
  | { mode: 'search' }
  | { mode: 'snapshot'; snapshotId: string; scopeId: string }
  | { mode: 'invalid'; error: string }

/**
 * Suche oder Nachfrage? Alles, was nach einer gesetzten Kennung aussieht, ist eine Nachfrage —
 * auch eine kaputte. Eine kaputte Kennung wird abgelehnt und läuft nie als Suche weiter.
 */
export function parseFollowUpRequest(params: { snapshotId?: unknown; scopeId?: unknown } | null | undefined): FollowUpRequest {
  const raw = params?.snapshotId
  const requested = typeof raw === 'string' ? raw.trim().length > 0 : raw != null
  if (!requested) return { mode: 'search' }
  const snapshotId = sanitizeSnapshotId(raw)
  if (!snapshotId) return { mode: 'invalid', error: 'Diese Nachfrage ist ungültig.' }
  const scopeId = sanitizeScopeId(params?.scopeId)
  if (!scopeId) return { mode: 'invalid', error: 'Diese Nachfrage gehört zu keinem Gespräch.' }
  return { mode: 'snapshot', snapshotId, scopeId }
}

/**
 * Länge des Prompts, an der die ERSTE Antwort gemessen wird: der größere von Such-Prompt (mit
 * Verlauf und Frage) und Nachfrage-Prompt (mit Platz für eine Frage). So passt die Nachfrage
 * später ins selbe Fenster.
 */
export function measureWithFollowUpRoom(args: {
  sources: readonly WebSource[]
  history: ReadonlyArray<{ content: string }>
  questionChars: number
  topics: Parameters<typeof buildPetrolWebSystemPrompt>[3]
  today: string
  sanitize: (text: string) => string
}): number {
  const search = buildPetrolWebSystemPrompt(args.sources, args.today, args.sanitize, args.topics).length
    + args.history.reduce((n, m) => n + m.content.length, 0)
    + args.questionChars
  const followUp = buildPetrolWebSystemPrompt(args.sources, args.today, args.sanitize, [], true).length + FOLLOWUP_QUESTION_RESERVE_CHARS
  return Math.max(search, followUp)
}

export type FollowUpResolution<H extends { content: string; role?: string }> =
  | { ok: true; sources: WebSource[]; history: H[]; dropped: number }
  | {
      ok: false
      /** Snapshot weg (abgelaufen, anderes Gespräch/Fenster): „Erneut senden“ kann nie klappen. */
      gone: boolean
      error: string
      sources: WebSource[]
    }

/**
 * Holt die Auszüge aus dem Main-Speicher und prüft, ob sie samt Frage ins Budget passen. Nur der
 * Verlauf darf schrumpfen. Aufrufen NACH allen `await`s: ein Tabwechsel kann den Snapshot
 * zwischendurch verworfen haben.
 */
export function resolveFollowUp<H extends { content: string; role?: string }>(args: {
  store: WebSnapshotStore
  senderId: number
  scopeId: string
  snapshotId: string
  history: readonly H[]
  question: string
  charBudget: number
  today: string
  sanitize: (text: string) => string
}): FollowUpResolution<H> {
  const snap = args.store.get(args.senderId, args.scopeId, args.snapshotId)
  if (!snap || snap.sources.length === 0) return { ok: false, gone: true, error: SNAPSHOT_GONE_TEXT, sources: [] }

  // Die Auszüge sind bereits vorbereitet (`prepareWebExcerpt`) — hier nur messen, nie anfassen.
  const promptChars = buildPetrolWebSystemPrompt(snap.sources, args.today, args.sanitize, [], true).length
  if (promptChars > args.charBudget) {
    // Auch ohne Frage zu groß: typisch, wenn nach der Antwort ein Modell mit kleinerem Fenster
    // gewählt wurde. Die Frage zu kürzen hilft dann nicht.
    return {
      ok: false,
      gone: false,
      error: 'Die gespeicherten Seiten sind für das Kontextfenster des gewählten Modells zu groß. Wähle ein Modell mit größerem Fenster, oder such mit dem Globus neu.',
      sources: snap.sources
    }
  }
  const fitted = shortenHistoryToFit(args.history, promptChars + args.question.length, args.charBudget)
  if (!fitted) {
    return {
      ok: false,
      gone: false,
      error: 'Die Frage ist zu lang, damit die gespeicherten Seiten ins Kontextfenster dieses Modells passen. Kürze die Frage, oder such mit dem Globus neu.',
      sources: snap.sources
    }
  }
  return { ok: true, sources: snap.sources, history: fitted.history, dropped: fitted.dropped }
}
