// E-Mail-Decision-Pilot — Kennzahlen (§3 des Bauplans).
//
// Die Leitfrage ist NICHT „wie oft liegt das Modell richtig". Gesamtgenauigkeit ist hier
// das falsche Ziel: Newsletter stellen die Mehrheit, ein Verfahren, das alles überspringt,
// sähe damit gut aus. Gemessen wird pro Risikoklasse — wichtige Mails, Antwortbedarf,
// Handlung/Termin, Dringlichkeit —, und jede Zahl trägt ihre Fallzahl.
//
// Rein: keine Zeit, kein Zufall, keine Datei.

import type { DecisionRoute } from './types'
import type { PolicyReasonCode } from './emailPolicy'
import { LABEL_FIELDS, RISK_LABEL_FIELDS, type GoldLabels, type LabelField, type LabelSource, type Ternary } from './labels'
import type { Subset } from './split'

// ── Unsicherheit ─────────────────────────────────────────────────────────────

/**
 * Einseitige obere 95-%-Grenze der Fehlerrate bei NULL beobachteten Fehlern unter n
 * unabhängigen Fällen: `1 - 0.05^(1/n)` (Regel der Drei in exakter Form).
 *
 * Wichtig und oft falsch zitiert: n sind die POSITIVEN Fälle der jeweiligen Klasse,
 * nicht beliebige Mails. Für „unter 1 %" braucht es 299 solche Fälle. Threads und
 * Vorlagen korrelieren, deshalb steht daneben immer die Zahl unabhängiger Gruppen.
 */
export function zeroErrorUpperBound95(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null
  return 1 - Math.pow(0.05, 1 / n)
}

export interface Interval {
  low: number
  high: number
}

/** Wilson-Intervall (95 %) — geschlossene Form, auch bei kleinen Zahlen brauchbar. */
export function wilsonInterval(successes: number, n: number, z = 1.959963985): Interval | null {
  if (!Number.isFinite(n) || n <= 0) return null
  if (!Number.isFinite(successes) || successes < 0 || successes > n) return null
  const p = successes / n
  const d = 1 + (z * z) / n
  const center = p + (z * z) / (2 * n)
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return { low: Math.max(0, (center - spread) / d), high: Math.min(1, (center + spread) / d) }
}

/** Fehlerrate mit Grenze: bei 0 Fehlern die exakte Nullfehler-Schranke, sonst Wilson. */
export interface ErrorRate {
  errors: number
  cases: number
  /** Unabhängige Gruppen unter diesen Fällen — Threads/Vorlagen zählen nicht doppelt. */
  groups: number
  rate: number | null
  upperBound95: number | null
  /** Dieselbe Schranke, konservativ auf Gruppen statt Einzelfälle gerechnet. */
  upperBound95OnGroups: number | null
}

// ── Kalibrierung ─────────────────────────────────────────────────────────────

export interface ProbabilityPair {
  p: number
  /** Beobachtetes Ergebnis: 1 = Ereignis eingetreten. */
  y: 0 | 1
}

export function brierScore(pairs: readonly ProbabilityPair[]): number | null {
  const usable = pairs.filter((x) => Number.isFinite(x.p))
  if (usable.length === 0) return null
  return usable.reduce((sum, x) => sum + (x.p - x.y) ** 2, 0) / usable.length
}

export interface CalibrationBin {
  low: number
  high: number
  count: number
  meanPredicted: number | null
  observedRate: number | null
}

export interface CalibrationReport {
  cases: number
  /** Anzahl gleich breiter Bins — dokumentiert, weil die ECE von ihr abhängt. */
  binCount: number
  bins: CalibrationBin[]
  ece: number | null
}

/**
 * ECE über gleich breite Bins. Die Binzahl gehört ins Ergebnis: dieselben Daten ergeben
 * mit 5 und mit 20 Bins verschiedene Werte, und die kleinere Zahl schmeichelt.
 */
export function expectedCalibrationError(pairs: readonly ProbabilityPair[], binCount = 10): CalibrationReport {
  const usable = pairs.filter((x) => Number.isFinite(x.p) && x.p >= 0 && x.p <= 1)
  const bins: CalibrationBin[] = []
  for (let i = 0; i < binCount; i++) {
    const low = i / binCount
    const high = (i + 1) / binCount
    const inBin = usable.filter((x) => (i === binCount - 1 ? x.p >= low && x.p <= high : x.p >= low && x.p < high))
    bins.push({
      low,
      high,
      count: inBin.length,
      meanPredicted: inBin.length ? inBin.reduce((s, x) => s + x.p, 0) / inBin.length : null,
      observedRate: inBin.length ? inBin.reduce((s, x) => s + x.y, 0) / inBin.length : null,
    })
  }
  const ece =
    usable.length === 0
      ? null
      : bins.reduce((sum, b) => {
          if (!b.count || b.meanPredicted === null || b.observedRate === null) return sum
          return sum + (b.count / usable.length) * Math.abs(b.meanPredicted - b.observedRate)
        }, 0)
  return { cases: usable.length, binCount, bins, ece }
}

// ── Übereinstimmung zweier Bewertungen ───────────────────────────────────────

export interface AgreementReport {
  field: LabelField
  cases: number
  agreed: number
  agreementRate: number | null
  /** Cohens Kappa über die drei Stufen. `null`, wenn eine Seite konstant ist. */
  kappa: number | null
  disagreedIds: string[]
}

export function cohensKappa(a: readonly Ternary[], b: readonly Ternary[]): number | null {
  const n = Math.min(a.length, b.length)
  if (n === 0) return null
  const cats: Ternary[] = ['yes', 'no', 'unclear']
  let observed = 0
  for (let i = 0; i < n; i++) if (a[i] === b[i]) observed++
  const po = observed / n
  let pe = 0
  for (const c of cats) {
    const pa = a.slice(0, n).filter((x) => x === c).length / n
    const pb = b.slice(0, n).filter((x) => x === c).length / n
    pe += pa * pb
  }
  if (pe >= 1) return null
  return (po - pe) / (1 - pe)
}

export interface DoubleLabeled {
  id: string
  labels: GoldLabels
  secondLabels: GoldLabels
}

export function agreementReport(cases: readonly DoubleLabeled[]): AgreementReport[] {
  return LABEL_FIELDS.map((field) => {
    const a = cases.map((c) => c.labels[field])
    const b = cases.map((c) => c.secondLabels[field])
    const disagreedIds = cases.filter((c) => c.labels[field] !== c.secondLabels[field]).map((c) => c.id)
    const agreed = cases.length - disagreedIds.length
    return {
      field,
      cases: cases.length,
      agreed,
      agreementRate: cases.length ? agreed / cases.length : null,
      kappa: cohensKappa(a, b),
      disagreedIds,
    }
  })
}

// ── Routen-Auswertung ────────────────────────────────────────────────────────

export interface RoutedCase {
  id: string
  group: string
  subset: Subset | null
  source: LabelSource
  labels: GoldLabels
  route: DecisionRoute
  reasonCode: PolicyReasonCode
  notes: PolicyReasonCode[]
  /** `none` = kein Modellergebnis vorhanden (Arm „nur Regeln"). */
  decisionStatus: 'ok' | 'abstain' | 'none'
  coverageComplete: boolean | null
  /** Der heutige Vollanalyse-Lauf ist fehlgeschlagen. Fehlversuche zählen mit. */
  baselineFailed: boolean
}

export interface RiskClassReport {
  /** Klasse: gold-positive Fälle dieses Feldes. */
  field: LabelField
  positives: ErrorRate
}

export interface RouteReport {
  arm: string
  cases: number
  groups: number
  synthetic: number
  routeCounts: Record<DecisionRoute, number>
  skipCoverage: number | null
  reviewShare: number | null
  fullAnalysisShare: number | null
  /** Wichtige Mails, die hypothetisch übersprungen worden wären. Die Kernzahl. */
  missedImportant: ErrorRate
  /** Fälle ohne ausdrückliches `safeToSkip: yes` unter allen Skip-Kandidaten. */
  unsafeSkipCandidates: { skips: number; notSafe: number; unclear: number; share: number | null }
  riskClasses: RiskClassReport[]
  /** Fälle, die NUR an den nicht abgedeckten weichen Kriterien hängen bleiben. */
  reviewOnlyDueToSoftCriteria: number
  technical: {
    abstain: number
    modelNotRun: number
    coverageIncomplete: number
    baselineFailed: number
  }
  reasonCodes: Array<{ code: PolicyReasonCode; count: number }>
}

function errorRate(errors: readonly RoutedCase[], all: readonly RoutedCase[]): ErrorRate {
  const cases = all.length
  const groups = new Set(all.map((c) => c.group)).size
  const errorCount = errors.length
  return {
    errors: errorCount,
    cases,
    groups,
    rate: cases > 0 ? errorCount / cases : null,
    upperBound95: errorCount === 0 ? zeroErrorUpperBound95(cases) : (wilsonInterval(errorCount, cases)?.high ?? null),
    upperBound95OnGroups:
      errorCount === 0 ? zeroErrorUpperBound95(groups) : (wilsonInterval(Math.min(errorCount, groups), groups)?.high ?? null),
  }
}

export function routeReport(arm: string, cases: readonly RoutedCase[]): RouteReport {
  const routeCounts: Record<DecisionRoute, number> = { skip: 0, 'full-analysis': 0, review: 0 }
  for (const c of cases) routeCounts[c.route]++
  const n = cases.length
  const skips = cases.filter((c) => c.route === 'skip')

  const important = cases.filter((c) => c.labels.important === 'yes')
  const missedImportant = errorRate(
    important.filter((c) => c.route === 'skip'),
    important,
  )

  const riskClasses: RiskClassReport[] = RISK_LABEL_FIELDS.map((field) => {
    const positives = cases.filter((c) => c.labels[field] === 'yes')
    return { field, positives: errorRate(positives.filter((c) => c.route === 'skip'), positives) }
  })

  const notSafe = skips.filter((c) => c.labels.safeToSkip !== 'yes')
  const unclear = skips.filter((c) => c.labels.safeToSkip === 'unclear')

  const codeCounts = new Map<PolicyReasonCode, number>()
  for (const c of cases) {
    for (const code of [c.reasonCode, ...c.notes]) {
      codeCounts.set(code, (codeCounts.get(code) || 0) + 1)
    }
  }

  return {
    arm,
    cases: n,
    groups: new Set(cases.map((c) => c.group)).size,
    synthetic: cases.filter((c) => c.source === 'synthetic').length,
    routeCounts,
    skipCoverage: n > 0 ? routeCounts.skip / n : null,
    reviewShare: n > 0 ? routeCounts.review / n : null,
    fullAnalysisShare: n > 0 ? routeCounts['full-analysis'] / n : null,
    missedImportant,
    unsafeSkipCandidates: {
      skips: skips.length,
      notSafe: notSafe.length,
      unclear: unclear.length,
      share: skips.length > 0 ? notSafe.length / skips.length : null,
    },
    riskClasses,
    reviewOnlyDueToSoftCriteria: cases.filter(
      (c) =>
        c.route === 'review' &&
        [c.reasonCode, ...c.notes].length > 0 &&
        [c.reasonCode, ...c.notes].every((code) => code === 'soft-criteria-uncovered'),
    ).length,
    technical: {
      abstain: cases.filter((c) => c.decisionStatus === 'abstain').length,
      modelNotRun: cases.filter((c) => c.decisionStatus === 'none').length,
      coverageIncomplete: cases.filter((c) => c.coverageComplete === false).length,
      baselineFailed: cases.filter((c) => c.baselineFailed).length,
    },
    reasonCodes: [...codeCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : 1)),
  }
}
