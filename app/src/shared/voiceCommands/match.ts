// Absichtserkennung — rein, ohne Netz, ohne Sprachmodell, ohne React.
//
// Zwei Bedingungen fürs Ausführen, nicht eine: ein hoher Trefferwert allein reicht
// nicht, weil 0,90 gegen 0,88 mehrdeutig ist. Deshalb zusätzlich der Abstand zum
// zweitbesten Treffer.

import { INTENTS, type IntentDef } from './intents'
import {
  CLARIFY_MIN_SCORE,
  EXECUTE_MIN_MARGIN,
  EXECUTE_MIN_SCORE,
  type AnyAction,
  type AppActionId,
  type IntentCandidate,
  type MatchOutcome
} from './types'

/** Mehrwortige Höflichkeitsfloskeln zuerst, danach einzelne Füllwörter. */
const FILLER_PHRASES = [
  'kannst du', 'könntest du', 'würdest du', 'kannst du mir', 'ich möchte', 'ich will',
  'can you', 'could you', 'would you', 'i want to', 'i would like to',
  'hey mindgraph', 'mindgraph'
]

// Reflexivpronomen stehen BEWUSST nicht hier: "mich" zu streichen zerlegt reflexive
// Verben ("worauf soll ich mich konzentrieren" -> "... ich konzentrieren"), und das
// Muster greift dann nicht mehr. Für Höflichkeitsfloskeln wie "zeig mir" braucht es
// das Streichen nicht — die Muster verlangen ohnehin keine direkte Nachbarschaft.
const FILLER_WORDS = [
  'bitte', 'mal', 'doch', 'eigentlich', 'kurz', 'schnell',
  'hey', 'ok', 'okay', 'please', 'just', 'quickly'
]

/**
 * Kleinschreibung, Satzzeichen weg, Füllwörter weg, Leerraum zusammenziehen.
 * Umlaute bleiben erhalten — sie tragen im Deutschen Bedeutung ("fällig"/"fallig").
 */
export function normalizeUtterance(raw: string): string {
  let text = String(raw ?? '').toLowerCase().trim()
  // Satzzeichen entfernen, Buchstaben/Ziffern/Leerraum behalten.
  text = text.replace(/[^\p{L}\p{N}\s]/gu, ' ')
  for (const phrase of FILLER_PHRASES) {
    text = text.replace(new RegExp(`(^|\\s)${phrase}(\\s|$)`, 'gu'), ' ')
  }
  for (const word of FILLER_WORDS) {
    text = text.replace(new RegExp(`(^|\\s)${word}(\\s|$)`, 'gu'), ' ')
  }
  return text.replace(/\s+/gu, ' ').trim()
}

function termHit(text: string, stem: string): boolean {
  // Wortanfang exakt, Endungen erlaubt: "überfällig" trifft "überfällige".
  return new RegExp(`(^|\\s)${stem}\\p{L}*(\\s|$)`, 'u').test(text)
}

interface IntentScore {
  id: AppActionId
  score: number
  params: Record<string, string>
}

function scoreIntent(def: IntentDef, text: string): IntentScore | null {
  for (const pattern of def.patterns) {
    const m = text.match(pattern)
    if (m) {
      return { id: def.id, score: 1, params: { ...(m.groups ?? {}) } }
    }
  }
  const weight = def.terms.reduce((sum, term) => (termHit(text, term.word) ? sum + term.weight : sum), 0)
  if (weight <= 0) return null
  // Sockel 0.30: ein einzelnes starkes Wort landet bei 0.80 (ausführen), ein
  // schwaches bei 0.50 (rückfragen). Nie 1.0 ohne Volltreffer-Muster.
  return { id: def.id, score: Math.min(0.95, 0.3 + weight), params: {} }
}

function buildAction(id: AppActionId, params: Record<string, string>): AnyAction | null {
  switch (id) {
    case 'view.dashboard':
      return { id, params: {} }
    case 'note.create':
      return { id, params: {} }
    case 'tasks.overdue':
      return { id, params: {} }
    case 'tasks.today':
      return { id, params: {} }
    case 'briefing.today':
      return { id, params: {} }
    case 'activity.today':
      return { id, params: {} }
    case 'search.notes': {
      const query = (params.query ?? '').trim()
      return query ? { id, params: { query } } : null
    }
    default:
      // Absichten ohne Aktion in Stufe 1a erreichen diese Stelle nicht, weil sie
      // nicht im Katalog stehen. Der Zweig hält den Vertrag trotzdem vollständig.
      return null
  }
}

/**
 * Erkennt die Absicht. `raw` ist das ungefilterte Transkript; es wandert unverändert
 * in den Rückfall, damit die Notizsuche den Originalwortlaut bekommt.
 */
export function matchIntent(raw: string): MatchOutcome {
  const text = normalizeUtterance(raw)
  const trimmedRaw = String(raw ?? '').trim()

  if (!text) return { kind: 'fallback', query: trimmedRaw }

  const scored = INTENTS
    .map(def => scoreIntent(def, text))
    .filter((s): s is IntentScore => s !== null)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return { kind: 'fallback', query: trimmedRaw }

  const top = scored[0]
  const second = scored[1]
  const margin = top.score - (second?.score ?? 0)

  if (top.score < CLARIFY_MIN_SCORE) return { kind: 'fallback', query: trimmedRaw }

  // Absicht klar, aber der Suchbegriff fehlt ("suche" ohne Gegenstand).
  if (top.id === 'search.notes' && !(top.params.query ?? '').trim()) {
    return { kind: 'clarify', reason: 'missing-param', id: 'search.notes', param: 'query' }
  }

  const confident = top.score >= EXECUTE_MIN_SCORE && margin >= EXECUTE_MIN_MARGIN
  if (confident) {
    const action = buildAction(top.id, top.params)
    if (action) return { kind: 'execute', action, score: top.score, margin }
  }

  const candidates: IntentCandidate[] = scored
    .filter(s => s.score >= CLARIFY_MIN_SCORE)
    .slice(0, 3)
    .map(s => ({ id: s.id, score: s.score, action: buildAction(s.id, s.params) }))

  return { kind: 'clarify', reason: 'ambiguous-intent', candidates }
}

const ORDINALS: Array<{ index: number; words: string[] }> = [
  { index: 0, words: ['eins', 'ein', 'eine', 'erste', 'erster', 'erstes', '1', 'one', 'first'] },
  { index: 1, words: ['zwei', 'zweite', 'zweiter', 'zweites', '2', 'two', 'second'] },
  { index: 2, words: ['drei', 'dritte', 'dritter', 'drittes', '3', 'three', 'third'] }
]

/**
 * Ordnungszahl gegen eine offene Auswahlliste. Nur sinnvoll, wenn der Controller
 * im Zustand `clarify` steht — ohne offene Liste hat "Eins" keinen Bezugspunkt.
 * Gibt den Index zurück oder null.
 */
export function matchOrdinal(raw: string, optionCount: number): number | null {
  const text = normalizeUtterance(raw)
  if (!text) return null
  for (const entry of ORDINALS) {
    if (entry.index >= optionCount) continue
    if (entry.words.some(w => termHit(text, w))) return entry.index
  }
  return null
}
