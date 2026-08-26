// Vergleichsmodus — Datenvertrag (docs/comparison-mode-plan.md).
//
// Diese Typen sind die Stelle, an der sich methodische Fehler zementieren. Zwei Regeln
// sind deshalb hier verankert und nicht erst in der Oberfläche:
//
//  1. `arm` gehört zum Fall und wird nie geändert. Ausgewertet wird nach ZUTEILUNG,
//     nicht danach, welches Werkzeug am Ende wirklich benutzt wurde.
//  2. Jeder Zeitwert trägt seine Herkunft mit. „Gemessen" und „selbst gestoppt" dürfen
//     nie in derselben Zahl verschwinden.

/** Zugeteilter Weg. Einmal gezogen, unveränderlich. */
export type Arm = 'konventionell' | 'mindgraph'

/**
 * Alle zugeteilten Fälle bleiben im Nenner. Es gibt kein Löschen und kein Umteilen —
 * sonst überlebt in der Auswertung, was gut lief.
 */
export type CaseState = 'offen' | 'abgeschlossen' | 'abgebrochen' | 'nicht-messbar'

/**
 * Bestandteile der Arbeit. `rueckfallarbeit` ist der wichtigste: Wird ein
 * MindGraph-Ergebnis verworfen und der Fall von Hand fertiggestellt, gehört diese
 * Handarbeit weiterhin zum MindGraph-Fall. Ohne sie werden Fehlschläge künstlich billig.
 */
export type SessionKind = 'auftrag' | 'vordergrund' | 'pruefung' | 'nacharbeit' | 'rueckfallarbeit'

/**
 * Herkunft eines Zeitwerts.
 *
 * `vordergrund-automatisch` heißt: Das Fenster war vorn — NICHT, dass jemand getippt hat.
 * Die Bezeichnung darf keine Genauigkeit behaupten, die es nicht gibt.
 */
export type TimeOrigin = 'vordergrund-automatisch' | 'gestoppt' | 'nachgetragen' | 'korrigiert'

/**
 * Qualität des fertigen Ergebnisses, gemessen an der Akzeptanzdefinition der Kampagne.
 * Derselbe Maßstab für beide Wege. Nacharbeitsbedarf und Übernahme sind KEINE
 * Qualitätsstufen, sondern eigene Prozessgrößen.
 */
export const QUALITY_LEVELS = [1, 2, 3, 4] as const
export type Quality = (typeof QUALITY_LEVELS)[number]   // 1 unbrauchbar … 4 vollständig brauchbar

export interface WorkSession {
  kind: SessionKind
  from: number
  to: number
  origin: TimeOrigin
  /** Bei `korrigiert`: der ursprünglich erfasste Wert, damit die Korrektur prüfbar bleibt. */
  originalMs?: number
  correctionReason?: string
  /** Auffällige Sitzungen werden gekennzeichnet, nicht gekappt. */
  flagged?: 'ungewoehnlich-lang'
}

export interface Randomization {
  method: 'efron-biased-coin'
  /** Wahrscheinlichkeit für den zurückliegenden Weg. Über 0.5 und unter 1. */
  bias: number
}

export interface Campaign {
  id: string
  /** Genau EINE Aufgabenklasse. Fälle verschiedener Klassen dürfen nie in einen Median fallen. */
  taskClass: string
  inclusionRules: string
  /** Vorab festgelegt. Ohne sie bewertet man am Ende die eigene Erwartung. */
  acceptanceDefinition: string
  randomization: Randomization
  /** Ändert sich eine Messregel, entsteht eine neue Version — und damit eine neue Kampagne. */
  protocolVersion: number
  startedAt: number
  endedAt?: number
}

export interface ComparisonCase {
  id: string
  campaignId: string
  /** Einziger Freitext neben dem Korrekturgrund. Bleibt lokal, nie im Export. */
  label: string
  arm: Arm
  /** Ungleichstand im Moment der Ziehung — macht die Zuteilung nachvollziehbar. */
  imbalanceAtDraw: number
  state: CaseState
  stateReason?: string
  createdAt: number
  startedAt?: number
  resultReadyAt?: number
  closedAt?: number
  sessions: WorkSession[]
  /** Nur im MindGraph-Arm: übernommen oder verworfen. */
  accepted?: boolean
  quality?: Quality
}

/** Unter dieser Zahl abgeschlossener Fälle je Weg wird KEINE Kennzahl gezeigt. */
export const MIN_CASES_PER_ARM = 3

export const CURRENT_PROTOCOL_VERSION = 1
