// Tests der Kennzahlen. Die wichtigste Zeile dieser Datei ist die Nullfehler-Schranke:
// „im Holdout ist nichts passiert" ist keine Sicherheitszusage, sondern eine Zahl mit
// Fallzahl — und bei 40 Fällen liegt die obere Grenze bei 7 %, nicht bei 0.
import { describe, it, expect } from 'vitest'
import {
  agreementReport,
  brierScore,
  cohensKappa,
  expectedCalibrationError,
  routeReport,
  wilsonInterval,
  zeroErrorUpperBound95,
  type RoutedCase,
} from './metrics'
import type { GoldLabels } from './labels'

function labels(over: Partial<GoldLabels> = {}): GoldLabels {
  return { important: 'no', needsReply: 'no', hasActionOrDate: 'no', urgent: 'no', safeToSkip: 'yes', ...over }
}

function rc(over: Partial<RoutedCase> = {}): RoutedCase {
  return {
    id: 'c1',
    group: 'g1',
    subset: 'holdout',
    source: 'real-local',
    labels: labels(),
    route: 'skip',
    reasonCode: 'calibrated-negative',
    notes: [],
    decisionStatus: 'ok',
    coverageComplete: true,
    baselineFailed: false,
    ...over,
  }
}

describe('zeroErrorUpperBound95', () => {
  it('ist die Regel der Drei in exakter Form', () => {
    expect(zeroErrorUpperBound95(1)).toBeCloseTo(0.95, 10)
    expect(zeroErrorUpperBound95(100)).toBeCloseTo(1 - Math.pow(0.05, 0.01), 12)
  })

  it('299 positive Fälle sind die Schwelle für „unter 1 %"', () => {
    expect(zeroErrorUpperBound95(298)).toBeGreaterThan(0.01)
    expect(zeroErrorUpperBound95(299)).toBeLessThan(0.01)
  })

  it('kleine Holdouts sagen wenig: 40 Fälle ohne Fehler erlauben noch 7 %', () => {
    expect(zeroErrorUpperBound95(40)).toBeGreaterThan(0.07)
  })

  it('ohne Fälle gibt es keine Grenze, keine Null', () => {
    expect(zeroErrorUpperBound95(0)).toBe(null)
    expect(zeroErrorUpperBound95(-5)).toBe(null)
    expect(zeroErrorUpperBound95(Number.NaN)).toBe(null)
  })
})

describe('wilsonInterval', () => {
  it('liefert ein Intervall um die beobachtete Rate', () => {
    const i = wilsonInterval(5, 100)
    expect(i).not.toBe(null)
    expect(i!.low).toBeLessThan(0.05)
    expect(i!.high).toBeGreaterThan(0.05)
    expect(i!.high).toBeLessThan(0.12)
  })

  it('bleibt im Einheitsintervall und weist Unsinn ab', () => {
    expect(wilsonInterval(0, 10)!.low).toBe(0)
    expect(wilsonInterval(10, 10)!.high).toBe(1)
    expect(wilsonInterval(11, 10)).toBe(null)
    expect(wilsonInterval(1, 0)).toBe(null)
  })
})

describe('brierScore / expectedCalibrationError', () => {
  it('Brier belohnt sichere richtige und bestraft sichere falsche Vorhersagen', () => {
    expect(brierScore([{ p: 1, y: 1 }, { p: 0, y: 0 }])).toBe(0)
    expect(brierScore([{ p: 1, y: 0 }])).toBe(1)
    expect(brierScore([])).toBe(null)
  })

  it('ECE nennt Binzahl und Fallzahl mit — beide bestimmen den Wert', () => {
    const pairs = Array.from({ length: 20 }, (_, i) => ({ p: 0.95, y: (i < 19 ? 1 : 0) as 0 | 1 }))
    const r = expectedCalibrationError(pairs, 10)
    expect(r.cases).toBe(20)
    expect(r.binCount).toBe(10)
    expect(r.bins.length).toBe(10)
    expect(r.ece).toBeCloseTo(0, 2)
  })

  it('erkennt Übersicherheit', () => {
    const pairs = Array.from({ length: 20 }, (_, i) => ({ p: 0.95, y: (i < 10 ? 1 : 0) as 0 | 1 }))
    expect(expectedCalibrationError(pairs).ece).toBeCloseTo(0.45, 2)
  })

  it('leere Bins bleiben leer statt null-Werte zu erfinden', () => {
    const r = expectedCalibrationError([{ p: 0.05, y: 0 }])
    expect(r.bins[5].count).toBe(0)
    expect(r.bins[5].observedRate).toBe(null)
  })

  it('p = 1 fällt in den letzten Bin, nicht heraus', () => {
    const r = expectedCalibrationError([{ p: 1, y: 1 }])
    expect(r.bins[9].count).toBe(1)
    expect(r.cases).toBe(1)
  })
})

describe('cohensKappa / agreementReport', () => {
  it('volle Übereinstimmung bei gemischten Stufen ergibt 1', () => {
    expect(cohensKappa(['yes', 'no', 'unclear'], ['yes', 'no', 'unclear'])).toBeCloseTo(1, 10)
  })

  it('konstante Bewertung ist nicht auswertbar', () => {
    expect(cohensKappa(['yes', 'yes'], ['yes', 'yes'])).toBe(null)
    expect(cohensKappa([], [])).toBe(null)
  })

  it('nennt die uneinigen Fälle beim Namen', () => {
    const report = agreementReport([
      { id: 'a', labels: labels(), secondLabels: labels() },
      { id: 'b', labels: labels({ urgent: 'yes', safeToSkip: 'no' }), secondLabels: labels({ safeToSkip: 'no' }) },
    ])
    const urgent = report.find((r) => r.field === 'urgent')!
    expect(urgent.disagreedIds).toEqual(['b'])
    expect(urgent.agreementRate).toBe(0.5)
  })
})

describe('routeReport', () => {
  it('zählt Routen und Anteile', () => {
    const r = routeReport('regeln', [
      rc({ id: 'a', route: 'skip' }),
      rc({ id: 'b', group: 'g2', route: 'review' }),
      rc({ id: 'c', group: 'g3', route: 'full-analysis' }),
      rc({ id: 'd', group: 'g4', route: 'full-analysis' }),
    ])
    expect(r.routeCounts).toEqual({ skip: 1, review: 1, 'full-analysis': 2 })
    expect(r.skipCoverage).toBe(0.25)
    expect(r.reviewShare).toBe(0.25)
    expect(r.fullAnalysisShare).toBe(0.5)
    expect(r.groups).toBe(4)
  })

  it('die Kernzahl: wichtige Mails, die übersprungen worden wären', () => {
    const r = routeReport('nli', [
      rc({ id: 'a', group: 'g1', labels: labels({ important: 'yes', safeToSkip: 'no' }), route: 'skip' }),
      rc({ id: 'b', group: 'g2', labels: labels({ important: 'yes', safeToSkip: 'no' }), route: 'full-analysis' }),
      rc({ id: 'c', group: 'g3', route: 'skip' }),
    ])
    expect(r.missedImportant.errors).toBe(1)
    expect(r.missedImportant.cases).toBe(2)
    expect(r.missedImportant.rate).toBe(0.5)
    expect(r.missedImportant.upperBound95).toBeGreaterThan(0.5)
  })

  it('ohne Fehler steht dort die Nullfehler-Schranke — und die Gruppenzahl daneben', () => {
    const cases = Array.from({ length: 20 }, (_, i) =>
      rc({ id: `i${i}`, group: `g${i % 4}`, labels: labels({ important: 'yes', safeToSkip: 'no' }), route: 'full-analysis' }),
    )
    const r = routeReport('nli', cases)
    expect(r.missedImportant.errors).toBe(0)
    expect(r.missedImportant.groups).toBe(4)
    expect(r.missedImportant.upperBound95).toBeCloseTo(zeroErrorUpperBound95(20)!, 12)
    // Auf Gruppen gerechnet ist die Grenze deutlich schlechter — genau das ist der Punkt.
    expect(r.missedImportant.upperBound95OnGroups!).toBeGreaterThan(r.missedImportant.upperBound95!)
  })

  it('zählt Skip-Kandidaten ohne ausdrückliches Ja', () => {
    const r = routeReport('nli', [
      rc({ id: 'a', route: 'skip' }),
      rc({ id: 'b', group: 'g2', route: 'skip', labels: labels({ safeToSkip: 'unclear' }) }),
      rc({ id: 'c', group: 'g3', route: 'skip', labels: labels({ safeToSkip: 'no' }) }),
    ])
    expect(r.unsafeSkipCandidates).toEqual({ skips: 3, notSafe: 2, unclear: 1, share: 2 / 3 })
  })

  it('weist die Einsparung aus, die allein an den weichen Kriterien hängt', () => {
    const r = routeReport('nli', [
      rc({ id: 'a', route: 'review', reasonCode: 'soft-criteria-uncovered', notes: [] }),
      rc({ id: 'b', group: 'g2', route: 'review', reasonCode: 'soft-criteria-uncovered', notes: ['calibration-missing'] }),
      rc({ id: 'c', group: 'g3', route: 'review', reasonCode: 'body-missing', notes: [] }),
    ])
    expect(r.reviewOnlyDueToSoftCriteria).toBe(1)
  })

  it('zählt technische Ausfälle und fehlgeschlagene Vergleichsläufe mit', () => {
    const r = routeReport('nli', [
      rc({ id: 'a', decisionStatus: 'abstain', route: 'review' }),
      rc({ id: 'b', group: 'g2', decisionStatus: 'none', route: 'review' }),
      rc({ id: 'c', group: 'g3', coverageComplete: false, route: 'review' }),
      rc({ id: 'd', group: 'g4', baselineFailed: true, route: 'review' }),
    ])
    expect(r.technical).toEqual({ abstain: 1, modelNotRun: 1, coverageIncomplete: 1, baselineFailed: 1 })
  })

  it('zählt synthetische Fälle getrennt — sie sind ein Funktionstest, keine Verteilung', () => {
    const r = routeReport('nli', [rc({ id: 'a', source: 'synthetic' }), rc({ id: 'b', group: 'g2' })])
    expect(r.synthetic).toBe(1)
  })

  it('leerer Datensatz liefert null-Anteile statt erfundener Nullen', () => {
    const r = routeReport('leer', [])
    expect(r.skipCoverage).toBe(null)
    expect(r.missedImportant.rate).toBe(null)
    expect(r.missedImportant.upperBound95).toBe(null)
  })
})
