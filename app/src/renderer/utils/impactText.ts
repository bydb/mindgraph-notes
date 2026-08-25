// Textbausteine der Tagesbilanz.
//
// Sie stehen hier, weil sie an ZWEI Stellen erscheinen: auf der Antwortkarte und im
// Tooltip der Statusleiste. Beim ersten Anlauf standen sie doppelt im Code — und die
// Singularform war prompt nur an einer der beiden Stellen richtig („1 Ergebnisse
// übernommen"). Zwei Formulierungen derselben Zahl laufen immer auseinander.

import type { TranslationKey } from './translations'
import type { ActivityType, ActivitySummary, SavedTimeLine } from '../../shared/activityLog'

export type ImpactTFn = (key: TranslationKey, params?: Record<string, string | number>) => string

export const ACTIVITY_TYPE_LABEL_KEY: Record<ActivityType, TranslationKey> = {
  'table-merge': 'voiceCommand.activityType.tableMerge',
  document: 'voiceCommand.activityType.document',
  summary: 'voiceCommand.activityType.summary',
  'web-research': 'voiceCommand.activityType.webResearch',
  other: 'voiceCommand.activityType.other'
}

export function acceptedLine(summary: ActivitySummary, t: ImpactTFn): string {
  return t(
    summary.acceptedTotal === 1 ? 'voiceCommand.card.activityAcceptedOne' : 'voiceCommand.card.activityAccepted',
    { count: summary.acceptedTotal }
  )
}

export function tasksLine(summary: ActivitySummary, t: ImpactTFn): string {
  return t(
    summary.tasksCreated === 1 ? 'voiceCommand.card.activityTasksOne' : 'voiceCommand.card.activityTasks',
    { count: summary.tasksCreated }
  )
}

/**
 * Die Rechnung im Klartext — sie steht auf der Karte, nicht im Kleingedruckten.
 *
 * Abgezogen wird die AKTIVE Arbeitszeit (Auftrag + Prüfung), nicht die Laufzeit des
 * Agenten. Wer während des Laufs etwas anderes erledigt, hat diese Minuten nicht
 * aufgewendet. Die Laufzeit steht daneben als Durchlaufzeit — sichtbar, aber nie im
 * Abzug.
 */
export function savedBasisLine(line: SavedTimeLine, t: ImpactTFn): string {
  return t('voiceCommand.card.savedBasis', {
    type: t(ACTIVITY_TYPE_LABEL_KEY[line.activityType]),
    reference: line.referenceMinutes,
    // Ein Vorgang unter einer Minute rundet auf 0 — „− 0 min aktiv" läse sich wie ein Fehler.
    active: line.activeMinutes === 0 && line.activeMs > 0
      ? t('voiceCommand.card.underOneMinute')
      : line.activeMinutes,
    saved: line.savedMinutes
  })
}

/** Durchlaufzeit und Fertigstellung — Kontext, damit die Zahl einordenbar bleibt. */
export function savedContextLine(line: SavedTimeLine, t: ImpactTFn): string {
  // Dieselbe Rundungsregel wie oben: Ein 40-Sekunden-Lauf ist „unter 1 min", nicht
  // „0 min". Eine Null liest sich wie ein Messfehler und zieht die Zeile in Zweifel.
  const unterEiner = t('voiceCommand.card.underOneMinute')
  return t('voiceCommand.card.savedContext', {
    runtime: line.runtimeMinutes === 0 && line.runtimeMs > 0 ? unterEiner : line.runtimeMinutes,
    elapsed: line.elapsedMinutes === 0 && line.elapsedMs > 0 ? unterEiner : line.elapsedMinutes
  })
}

/**
 * Wie viele vergleichbare Vorgänge hinter der Referenzzeit stehen. Eine Zahl aus einem
 * einzigen Lauf ist etwas anderes als eine aus zwanzig, und das gehört dazugesagt.
 */
export function sampleLine(count: number, t: ImpactTFn): string {
  return t(count === 1 ? 'voiceCommand.card.savedSampleOne' : 'voiceCommand.card.savedSample', { count })
}

/** Läufe ohne gemessene Arbeitszeit: nicht bewertet, aber auch nicht verschwiegen. */
export function unmeasuredLine(count: number, t: ImpactTFn): string {
  return t(count === 1 ? 'voiceCommand.card.savedUnmeasuredOne' : 'voiceCommand.card.savedUnmeasured', { count })
}

export function unpricedLine(types: ActivityType[], t: ImpactTFn): string {
  return t('voiceCommand.card.savedUnpriced', {
    types: types.map(type => t(ACTIVITY_TYPE_LABEL_KEY[type])).join(', ')
  })
}
