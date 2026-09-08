// Textbausteine der Tagesbilanz.
//
// Sie stehen hier, weil sie an ZWEI Stellen erscheinen: auf der Antwortkarte und im
// Tooltip der Statusleiste. Beim ersten Anlauf standen sie doppelt im Code — und die
// Singularform war prompt nur an einer der beiden Stellen richtig („1 Ergebnisse
// übernommen"). Zwei Formulierungen derselben Zahl laufen immer auseinander.

import type { TranslationKey } from './translations'
import { JOB_TYPES, JOB_OUTCOMES, isJobType, type ValuedType, type ActivitySummary, type ModelComparisonRow, type SavedTimeLine, type JobType, type JobOutcome, type ReferenceSources } from '../../shared/activityLog'

export type ImpactTFn = (key: TranslationKey, params?: Record<string, string | number>) => string

export const ACTIVITY_TYPE_LABEL_KEY: Record<ValuedType, TranslationKey> = {
  'table-merge': 'voiceCommand.activityType.tableMerge',
  document: 'voiceCommand.activityType.document',
  summary: 'voiceCommand.activityType.summary',
  'web-research': 'voiceCommand.activityType.webResearch',
  'email-tasks': 'voiceCommand.activityType.emailTasks',
  other: 'voiceCommand.activityType.other',
  'attendance-list': 'voiceCommand.activityType.attendanceList',
  'wp-post': 'voiceCommand.activityType.wpPost',
  'ig-caption': 'voiceCommand.activityType.igCaption'
}

/**
 * Etikett je Vorgangsart UND Abschluss — das Etikett reicht nur so weit wie der Nachweis:
 * „gespeichert" ist nicht „gedruckt", „als verwendet markiert" ist nicht „veröffentlicht".
 */
const JOB_OUTCOME_KEY: Partial<Record<JobType, Partial<Record<JobOutcome, TranslationKey>>>> = {
  'attendance-list': { saved: 'impact.job.attendanceSaved' },
  'wp-post': { draft: 'impact.job.wpDraft', published: 'impact.job.wpPublished' },
  'ig-caption': { used: 'impact.job.igUsed' }
}

/**
 * Abgeschlossene Plugin-Vorgänge als Beschriftung + Etikett, plus Vorbereitungen ohne
 * Abschluss. Die Karte zeigt Beschriftung links und Etikett rechts; Tooltip und Historie
 * nehmen die Textfassung (jobLines).
 */
export function jobRows(summary: ActivitySummary, t: ImpactTFn): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = []
  for (const type of JOB_TYPES) {
    const byOutcome = summary.jobs.completed[type]
    if (!byOutcome) continue
    for (const outcome of JOB_OUTCOMES) {
      const count = byOutcome[outcome]
      if (!count) continue
      const key = JOB_OUTCOME_KEY[type]?.[outcome]
      out.push({ label: t(ACTIVITY_TYPE_LABEL_KEY[type]), text: key ? t(key, { count }) : String(count) })
    }
  }
  if (summary.jobs.prepared > 0) out.push({ label: t('impact.job.preparedLabel'), text: t('impact.job.prepared', { count: summary.jobs.prepared }) })
  return out
}

export function jobLines(summary: ActivitySummary, t: ImpactTFn): string[] {
  return jobRows(summary, t).map(r => `${r.label}: ${r.text}`)
}

/** Vorgänge haben keine Agent-Laufzeit — die Kontextzeile „Agentenlauf N min" wäre dort ein „0 min". */
export function hasRuntimeContext(line: SavedTimeLine): boolean {
  return !isJobType(line.activityType)
}

export function acceptedLine(summary: ActivitySummary, t: ImpactTFn): string {
  return t(
    summary.acceptedTotal === 1 ? 'voiceCommand.card.activityAcceptedOne' : 'voiceCommand.card.activityAccepted',
    { count: summary.acceptedTotal }
  )
}

/** „7 Aufgaben aus 23 Mails erkannt" — der Weg ohne Übernahme-Schritt. */
export function emailTasksLine(summary: ActivitySummary, t: ImpactTFn): string {
  return t(
    summary.emailTasks === 1 ? 'voiceCommand.card.activityEmailTasksOne' : 'voiceCommand.card.activityEmailTasks',
    { tasks: summary.emailTasks, emails: summary.emailsAnalyzed }
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
/**
 * Die Rechnung der übernommenen Läufe OHNE den Abzug der Fehlversuche: Referenz je Lauf
 * minus ihre aktive Zeit. Der Abzug steht in wastedLine mit dem Nettowert daneben —
 * „25 − 6 = 15" mit stillem Abzug las sich wie ein Rechenfehler (real so aufgetreten).
 */
export function grossMinutes(line: SavedTimeLine): number {
  return Math.round(line.runs * line.referenceMinutes - line.activeMs / 60_000)
}

/** „deine Schätzung" oder „selbst gestoppt" — die Karte sagt, welche Art Zahl sie verrechnet. */
export function basisLabel(type: ValuedType, sources: ReferenceSources | undefined, t: ImpactTFn): string {
  return t(sources?.[type] === 'measured' ? 'voiceCommand.card.basisMeasured' : 'voiceCommand.card.basisEstimated')
}

/** Die Rechnung allein („30 min von Hand − 6 min aktiv = 24 min") — für die Karte mit Beschriftung links. */
export function savedBasisFormula(line: SavedTimeLine, t: ImpactTFn, sources?: ReferenceSources): string {
  const basis = basisLabel(line.activityType, sources, t)
  // Die Referenzzeit gilt je Vorgang, aktive Zeit und Gewinn sind Summen. Bei mehreren
  // Vorgängen muss der Faktor sichtbar sein, sonst steht dort „30 − 1 = 59" und die
  // ganze Rechnung wirkt kaputt (real so aufgetreten).
  const gross = grossMinutes(line)
  // Zweiter Kanal eines Vorgangs: Die Zeit steht beim ersten Kanal. „− 0 min aktiv (gemessen)"
  // läse sich wie ein Messfehler — deshalb ein eigener Satz, der sagt, wo die Zeit steht.
  if (isJobType(line.activityType) && line.activeMs === 0 && line.runs > 0) {
    return t(line.runs > 1 ? 'voiceCommand.card.savedBasisSharedMany' : 'voiceCommand.card.savedBasisShared', {
      runs: line.runs, reference: line.referenceMinutes, saved: gross, basis
    })
  }
  const schluessel = line.runs > 1 ? 'voiceCommand.card.savedBasisMany' : 'voiceCommand.card.savedBasis'
  // Die aktive Zeit wird aus der Gleichung abgeleitet, nicht getrennt gerundet: 4 min
  // Referenz, 30 s aktiv ergab sonst „4 − 1 = 4" (0,5 rundet auf 1, 3,5 rundet auf 4).
  const active = line.runs * line.referenceMinutes - gross
  return t(schluessel, {
    runs: line.runs,
    reference: line.referenceMinutes,
    basis,
    // Ein Vorgang unter einer Minute rundet auf 0 — „− 0 min aktiv" läse sich wie ein Fehler.
    active: active === 0 && line.activeMs > 0 ? t('voiceCommand.card.underOneMinute') : active,
    saved: gross
  })
}

export function savedBasisLine(line: SavedTimeLine, t: ImpactTFn, sources?: ReferenceSources): string {
  return `${t(ACTIVITY_TYPE_LABEL_KEY[line.activityType])}: ${savedBasisFormula(line, t, sources)}`
}

/** Durchlaufzeit und Fertigstellung — Kontext, damit die Zahl einordenbar bleibt. */
export function savedContextLine(line: SavedTimeLine, t: ImpactTFn): string {
  // Dieselbe Rundungsregel wie oben: Ein 40-Sekunden-Lauf ist „unter 1 min", nicht
  // „0 min". Eine Null liest sich wie ein Messfehler und zieht die Zeile in Zweifel.
  const unterEiner = t('voiceCommand.card.underOneMinute')
  const basis = t('voiceCommand.card.savedContext', {
    runtime: line.runtimeMinutes === 0 && line.runtimeMs > 0 ? unterEiner : line.runtimeMinutes,
    elapsed: line.elapsedMinutes === 0 && line.elapsedMs > 0 ? unterEiner : line.elapsedMinutes
  })
  // Das Modell gehört dazu: Ohne es ist eine Durchlaufzeit nicht einzuordnen, und zwei
  // Modelle lassen sich nicht vergleichen. Mehr als zwei Namen sprengen die Zeile.
  if (line.models.length === 0) return basis
  const namen = line.models.slice(0, 2).join(', ')
  const rest = line.models.length > 2 ? ` +${line.models.length - 2}` : ''
  return `${basis} · ${namen}${rest}`
}

/**
 * Fehlversuche einer Art: Läufe ohne übernommenes Ergebnis, deren aktive Zeit abgezogen
 * wurde. Eigene Zeile, damit die Rechnung darüber nicht „30 − 8 = 19" liest, wo drei
 * Minuten davon ein verworfener Versuch waren.
 */
export function wastedFormula(line: SavedTimeLine, t: ImpactTFn): string {
  // Der Abzug ist die Differenz der beiden gezeigten Zahlen (Rechnung oben, netto hier),
  // nicht ein dritter gerundeter Wert — sonst gehen die drei Zahlen um eine Minute auseinander.
  const minutes = (line.runs > 0 ? grossMinutes(line) : 0) - line.savedMinutes
  return t(line.wastedRuns === 1 ? 'voiceCommand.card.savedWastedOne' : 'voiceCommand.card.savedWasted', {
    count: line.wastedRuns,
    minutes: minutes === 0 && line.wastedMs > 0 ? t('voiceCommand.card.underOneMinute') : minutes,
    net: line.savedMinutes
  })
}

export function wastedLine(line: SavedTimeLine, t: ImpactTFn): string {
  return `${t(ACTIVITY_TYPE_LABEL_KEY[line.activityType])}: ${wastedFormula(line, t)}`
}

/**
 * Wie viele vergleichbare Vorgänge hinter der Referenzzeit stehen. Eine Zahl aus einem
 * einzigen Lauf ist etwas anderes als eine aus zwanzig, und das gehört dazugesagt.
 */
export function sampleLine(count: number, t: ImpactTFn): string {
  return t(count === 1 ? 'voiceCommand.card.savedSampleOne' : 'voiceCommand.card.savedSample', { count })
}

/** Manuell nachgetragene Zeit: Sie steckt in der aktiven Zeit, ist aber keine Messung — das muss dabeistehen. */
export function correctedFormula(line: SavedTimeLine, t: ImpactTFn): string {
  return t(line.correctedRuns === 1 ? 'voiceCommand.card.savedCorrectedOne' : 'voiceCommand.card.savedCorrected', {
    count: line.correctedRuns,
    minutes: Math.max(1, Math.round(line.correctedMs / 60_000))
  })
}

export function correctedLine(line: SavedTimeLine, t: ImpactTFn): string {
  return `${t(ACTIVITY_TYPE_LABEL_KEY[line.activityType])}: ${correctedFormula(line, t)}`
}

/** Läufe ohne gemessene Arbeitszeit: nicht bewertet, aber auch nicht verschwiegen. */
export function unmeasuredLine(count: number, t: ImpactTFn): string {
  return t(count === 1 ? 'voiceCommand.card.savedUnmeasuredOne' : 'voiceCommand.card.savedUnmeasured', { count })
}

/**
 * Eine Zeile je Modell — erst damit lassen sich zwei Modelle gegeneinander lesen.
 * Median statt Mittelwert: Bei fünf Vorgängen verzieht ein Ausreißer den Schnitt.
 */
export function modelComparisonLine(row: ModelComparisonRow, t: ImpactTFn): string {
  const unterEiner = t('voiceCommand.card.underOneMinute')
  const basis = t(row.runs === 1 ? 'voiceCommand.card.modelRowOne' : 'voiceCommand.card.modelRow', {
    model: row.model,
    runs: row.runs,
    active: row.medianActiveMinutes === 0 && row.medianActiveMs > 0 ? unterEiner : row.medianActiveMinutes,
    runtime: row.medianRuntimeMinutes === 0 && row.medianRuntimeMs > 0 ? unterEiner : row.medianRuntimeMinutes
  })
  // Der Mittelwert erst ab drei Vorgängen: Bei einem oder zweien sagt er nichts, was der
  // Median nicht schon sagt — weicht er dagegen deutlich ab, ist genau das die Auskunft.
  if (row.runs < 3) return basis
  return `${basis} · ${t('voiceCommand.card.modelMean', { mean: row.meanActiveMinutes })}`
}

export function unpricedLine(types: ValuedType[], t: ImpactTFn): string {
  return t('voiceCommand.card.savedUnpriced', {
    types: types.map(type => t(ACTIVITY_TYPE_LABEL_KEY[type])).join(', ')
  })
}
