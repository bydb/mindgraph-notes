// Sprachbefehle — Vertrag zwischen Erkenner (rein, hier) und Aktionsschicht (Renderer).
//
// Der Vertrag ist absichtlich eng: Parameter sind BEREITS aufgelöst, wenn eine
// Aktion sie bekommt. Der gesprochene Name wandert nie roh in eine Aktion — sonst
// rät jede Aktion für sich, und das Verhalten wird unerklärbar.

export type AppActionId =
  | 'briefing.today'
  | 'tasks.overdue'
  | 'tasks.today'
  | 'week.focus'
  | 'search.notes'
  | 'project.open'
  | 'note.current'
  | 'view.dashboard'
  | 'note.create'
  | 'activity.today'

/**
 * Für JEDE ID definiert — leere Parameter sind explizit, nicht implizit.
 * `Record<string, never>` statt `{}`, weil `{}` in TypeScript alles außer null/undefined akzeptiert.
 */
export interface ActionParams {
  'briefing.today': Record<string, never>
  'tasks.overdue': Record<string, never>
  'tasks.today': Record<string, never>
  'week.focus': Record<string, never>
  'activity.today': Record<string, never>
  'view.dashboard': Record<string, never>
  'note.create': Record<string, never>
  'search.notes': { query: string }
  'project.open': { projectRel: string }
  'note.current': { noteId: string }
}

/** Diskriminierte Vereinigung über alle Aktionen — id und params können nicht auseinanderlaufen. */
export type AnyAction = { [K in AppActionId]: { id: K; params: ActionParams[K] } }[AppActionId]

/** Art der Aktion. `speak` ist eigenständig, weil dabei Vault-Inhalt an einen Ausgabekanal geht. */
export type ActionKind = 'answer' | 'navigate' | 'speak'

export type ClarifyReason = 'ambiguous-intent' | 'ambiguous-param' | 'missing-param' | 'module-off'

export interface IntentCandidate {
  id: AppActionId
  score: number
  /**
   * Fertige Aktion, falls die Parameter schon vorliegen. null heißt: die Absicht ist
   * klar, aber es fehlt noch etwas (z. B. der Suchbegriff) — die Auswahl führt dann in
   * eine zweite Rückfrage statt in eine Ausführung mit geratenen Werten.
   */
  action: AnyAction | null
}

/**
 * Ergebnis der Erkennung. Diskriminiert, damit der Controller keinen Fall vergessen kann.
 *
 * `execute` verlangt ZWEI Bedingungen (absoluter Wert und Abstand zum Zweiten) — ein
 * hoher Wert allein reicht nicht: 0,90 gegen 0,88 ist mehrdeutig, obwohl beide hoch liegen.
 */
export type MatchOutcome =
  | { kind: 'execute'; action: AnyAction; score: number; margin: number }
  | { kind: 'clarify'; reason: 'ambiguous-intent'; candidates: IntentCandidate[] }
  | { kind: 'clarify'; reason: 'missing-param'; id: AppActionId; param: string }
  | { kind: 'fallback'; query: string }

/** Schwellen. Siehe docs/voice-command-plan.md, Abschnitt 5. */
export const EXECUTE_MIN_SCORE = 0.75
export const EXECUTE_MIN_MARGIN = 0.15
export const CLARIFY_MIN_SCORE = 0.45

// --- Antwortkarte -----------------------------------------------------------
// Reine Daten, damit Aktionen ohne React geprüft werden können.

import type { CommandId } from '../commandCatalog'

/**
 * Folgeaktion auf der Karte. Zwei Sorten, weil nicht jede sinnvolle Anschlusshandlung
 * eine Sprachabsicht ist: „Aufgaben-Panel öffnen" gibt es längst als Paletteneintrag.
 * Über `commandId` greift die Karte auf denselben Bestand zu statt ihn zu doppeln.
 */
export type FollowUp =
  | { kind: 'action'; label: string; action: AnyAction }
  | { kind: 'command'; label: string; commandId: CommandId }

export interface AnswerLine {
  text: string
  /** Abschnittsüberschrift; gleiche Gruppe = ein Block. Für gemischte Antworten. */
  group?: string
  /** Für den Sprung in die Notiz. */
  noteId?: string
  /** Tage bis zur Fälligkeit; negativ = überfällig. */
  dueIn?: number
}

export interface AnswerCard {
  title: string
  lines: AnswerLine[]
  /** Leere Liste ist ein gültiger Zustand und muss als Text erklärt werden, nicht als Lücke. */
  emptyText?: string
  sources: Array<{ label: string; noteId?: string }>
  followUps: FollowUp[]
  /**
   * Sichtbarer Hinweis, wenn die Liste gekappt wurde. Ein stiller Deckel liest sich
   * wie Vollständigkeit: Die Karte zeigte fünf Aufgaben, gesprochen wurden acht.
   */
  footnote?: string
  /** Klartext, was die App getan hat — nur bei navigierenden Aktionen. */
  navigated?: string
}
