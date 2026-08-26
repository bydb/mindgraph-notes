// Kennzahlen des Vergleichsmodus (docs/comparison-mode-plan.md, Abschnitte 4 und 7).
//
// Die Hauptaussage ist EINE Zahl je Weg: die gesamtaktive Zeit bis zum nutzbaren
// Ergebnis. Alles andere erklärt sie nur.

import {
  MIN_CASES_PER_ARM,
  QUALITY_LEVELS,
  type Arm,
  type ComparisonCase,
  type Quality,
  type SessionKind
} from './types'

export function sessionMs(session: { from: number; to: number }): number {
  return Math.max(0, session.to - session.from)
}

/**
 * Gesamtaktive Zeit eines Falls: Auftrag + Vordergrundzeit + Prüfung + Nacharbeit +
 * Rückfallarbeit.
 *
 * Rückfallarbeit ist der springende Punkt: Wird ein MindGraph-Ergebnis verworfen und der
 * Fall danach von Hand fertiggestellt, zählt diese Handarbeit weiterhin zum
 * MindGraph-Fall. Ohne diese Regel werden Fehlschläge künstlich billig — ein Weg, der in
 * der Hälfte der Fälle scheitert, sähe blendend aus, weil nur die geglückten Fälle seine
 * Zeit tragen.
 */
export function totalActiveMs(c: ComparisonCase): number {
  return c.sessions.reduce((sum, s) => sum + sessionMs(s), 0)
}

export function componentMs(c: ComparisonCase, kind: SessionKind): number {
  return c.sessions.filter(s => s.kind === kind).reduce((sum, s) => sum + sessionMs(s), 0)
}

/** Anlage bis Abschluss. Ergänzt die aktive Zeit, ersetzt sie nie. */
export function elapsedMs(c: ComparisonCase): number | null {
  if (c.closedAt === undefined) return null
  return Math.max(0, c.closedAt - c.createdAt)
}

export function median(werte: readonly number[]): number | null {
  if (werte.length === 0) return null
  const s = [...werte].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Quartilsabstand als Streuungsmaß — bei kleinen Zahlen ehrlicher als eine Standardabweichung. */
export function iqr(werte: readonly number[]): number | null {
  if (werte.length < 4) return null
  const s = [...werte].sort((a, b) => a - b)
  const q = (p: number): number => {
    const pos = (s.length - 1) * p
    const unten = Math.floor(pos)
    const rest = pos - unten
    return s[unten] + (s[Math.min(unten + 1, s.length - 1)] - s[unten]) * rest
  }
  return q(0.75) - q(0.25)
}

export interface ArmStats {
  arm: Arm
  /** ALLE zugeteilten Fälle — der Nenner, ohne den Überlebensbias entsteht. */
  assigned: number
  completed: number
  aborted: number
  notMeasurable: number
  open: number
  /** null, solange zu wenige abgeschlossene Fälle vorliegen (siehe MIN_CASES_PER_ARM). */
  medianTotalActiveMs: number | null
  iqrTotalActiveMs: number | null
  medianElapsedMs: number | null
  /** Nur im MindGraph-Arm: übernommen von abgeschlossenen. null im anderen Arm. */
  acceptedOfCompleted: number | null
  qualityCounts: Record<Quality, number>
  /** Fehlende Fälle bis zur Mindestzahl — damit die Anzeige sagen kann, was noch fehlt. */
  missingForMetrics: number
}

export function armStats(cases: readonly ComparisonCase[], arm: Arm): ArmStats {
  const imArm = cases.filter(c => c.arm === arm)
  const abgeschlossen = imArm.filter(c => c.state === 'abgeschlossen')
  // Gerechnet wird NUR mit abgeschlossenen Fällen — ausgewiesen wird trotzdem, wie viele
  // zugeteilt waren. Beides gehört zusammen, sonst ist die Zahl geschönt.
  const genugFaelle = abgeschlossen.length >= MIN_CASES_PER_ARM
  const zeiten = abgeschlossen.map(totalActiveMs)
  const laufzeiten = abgeschlossen.map(elapsedMs).filter((v): v is number => v !== null)

  const qualityCounts = Object.fromEntries(QUALITY_LEVELS.map(q => [q, 0])) as Record<Quality, number>
  for (const c of abgeschlossen) if (c.quality) qualityCounts[c.quality] += 1

  return {
    arm,
    assigned: imArm.length,
    completed: abgeschlossen.length,
    aborted: imArm.filter(c => c.state === 'abgebrochen').length,
    notMeasurable: imArm.filter(c => c.state === 'nicht-messbar').length,
    open: imArm.filter(c => c.state === 'offen').length,
    medianTotalActiveMs: genugFaelle ? median(zeiten) : null,
    iqrTotalActiveMs: genugFaelle ? iqr(zeiten) : null,
    medianElapsedMs: genugFaelle ? median(laufzeiten) : null,
    acceptedOfCompleted: arm === 'mindgraph' ? abgeschlossen.filter(c => c.accepted === true).length : null,
    qualityCounts,
    missingForMetrics: Math.max(0, MIN_CASES_PER_ARM - abgeschlossen.length)
  }
}

export interface CampaignReport {
  campaignId: string
  arms: [ArmStats, ArmStats]
  /**
   * Erst wahr, wenn BEIDE Wege genug abgeschlossene Fälle haben. Solange nicht, zeigt die
   * Oberfläche Einzelfälle statt einer Kennzahl: Ein Median aus zwei Werten ist deren
   * Mittel und täuscht Verlässlichkeit vor.
   */
  comparable: boolean
}

export function campaignReport(campaignId: string, cases: readonly ComparisonCase[]): CampaignReport {
  const eigene = cases.filter(c => c.campaignId === campaignId)
  const arms: [ArmStats, ArmStats] = [armStats(eigene, 'konventionell'), armStats(eigene, 'mindgraph')]
  return { campaignId, arms, comparable: arms.every(a => a.missingForMetrics === 0) }
}
