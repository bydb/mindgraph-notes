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
 * Die Rechengrundlage im Klartext. Ein 15-Sekunden-Lauf rundet auf 0 Minuten — dann
 * steht „unter 1 min" da, sonst läse sich die Zeile wie ein Rechenfehler.
 */
export function savedBasisLine(line: SavedTimeLine, t: ImpactTFn): string {
  return t('voiceCommand.card.savedBasis', {
    type: t(ACTIVITY_TYPE_LABEL_KEY[line.activityType]),
    reference: line.referenceMinutes,
    duration: line.durationMinutes === 0 && line.durationMs > 0
      ? t('voiceCommand.card.underOneMinute')
      : line.durationMinutes,
    saved: line.savedMinutes
  })
}

export function unpricedLine(types: ActivityType[], t: ImpactTFn): string {
  return t('voiceCommand.card.savedUnpriced', {
    types: types.map(type => t(ACTIVITY_TYPE_LABEL_KEY[type])).join(', ')
  })
}
