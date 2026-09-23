// Regressionstests der Routing-Policy. Die Reihenfolge der Stufen IST die Sicherheit:
// kippt sie beim Umbau, entscheidet plötzlich ein Modellwert vor einer Schutzregel.
import { describe, it, expect } from 'vitest'
import {
  emptyPolicySignals,
  evaluateRoutingPolicy,
  evaluateRuleBaseline,
  isValidCalibration,
  positiveProtectionCodes,
  type PolicyCalibration,
  type PolicySignals,
} from './emailPolicy'
import { DECISION_QUESTIONS, POLICY_VERSION, type DecisionOk, type DecisionQuestionId, type QuestionScores } from './types'

// ── Bausteine ────────────────────────────────────────────────────────────────

function cleanSignals(over: Partial<PolicySignals> = {}): PolicySignals {
  return {
    ...emptyPolicySignals(),
    bodyPresent: true,
    bodyChars: 400,
    language: 'de',
    ...over,
  }
}

const CAL: PolicyCalibration = {
  id: 'cal-test@1',
  fingerprint: {
    modelId: 'test-model',
    modelRevision: 'rev',
    quantization: 'q8',
    runtime: 'test',
    hypothesisSet: 'test',
    signalsVersion: 'email-decision-signals@1',
    labelSchema: 'email-decision-labels@1',
  },
  languages: ['de', 'en'],
  temperature: {
    de: { needsReply: 1, hasActionOrDate: 1, urgent: 1, impersonalInfo: 1 },
    en: { needsReply: 1, hasActionOrDate: 1, urgent: 1, impersonalInfo: 1 },
  },
  riskPositive: 0.6,
  riskNegative: 0.1,
  impersonalPositive: 0.8,
  fittedOn: { cases: 120, groups: 40, subset: 'cal' },
}

function scores(calibrated: number): QuestionScores {
  return { logits: [0, 0, 0], probs: [1 / 3, 1 / 3, 1 / 3], calibrated }
}

/** Ergebnis, das allein nichts entscheidet — die Werte setzt jeder Test selbst. */
function okResult(values: Partial<Record<DecisionQuestionId, number>>, complete = true): DecisionOk {
  const questions = {} as Record<DecisionQuestionId, QuestionScores>
  for (const q of DECISION_QUESTIONS) questions[q] = scores(values[q] ?? 0)
  return {
    status: 'ok',
    questions,
    coverage: { complete, promptTokens: 220, maxTokens: 512, bodyChars: 400, bodyCharsUsed: 400 },
    pairs: 4,
    tokens: 880,
    durationMs: 120,
    artifacts: {
      hypothesisSet: 'test',
      modelId: 'test-model',
      modelRevision: 'rev',
      quantization: 'q8',
      calibration: CAL.id,
      runtime: 'test',
    },
  }
}

/** Der einzige Weg zu `skip`: alle Risiken sicher nein, Informationsklasse sicher ja. */
const SKIPPABLE = { needsReply: 0.02, hasActionOrDate: 0.03, urgent: 0.01, impersonalInfo: 0.95 }

describe('evaluateRoutingPolicy — Reihenfolge der Stufen', () => {
  it('Stufe 1 schlägt alles: ausdrückliche Analyse gewinnt gegen jedes Modellergebnis', () => {
    const d = evaluateRoutingPolicy({
      explicitRequest: true,
      signals: cleanSignals(),
      decision: okResult(SKIPPABLE),
      calibration: CAL,
    })
    expect(d.route).toBe('full-analysis')
    expect(d.stage).toBe(1)
    expect(d.reasonCode).toBe('explicit-request')
    expect(d.policyVersion).toBe(POLICY_VERSION)
  })

  it('Stufe 2 steht vor jeder Modellaussage — auch bei perfekt negativem Modell', () => {
    for (const over of [
      { hardFloor: 80 },
      { hardBoost: 20 },
      { hardSignalKinds: ['keyword' as const] },
      { hasAttachments: true },
      { hasThreadContext: true },
      { hasActionMarker: true },
    ]) {
      const d = evaluateRoutingPolicy({
        explicitRequest: false,
        signals: cleanSignals(over),
        decision: okResult(SKIPPABLE),
        calibration: CAL,
      })
      expect(d.route).toBe('full-analysis')
      expect(d.stage).toBe(2)
    }
  })

  it('Stufe 2 nennt alle zutreffenden Schutzsignale, nicht nur das erste', () => {
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals({ hardFloor: 90, hasAttachments: true, hasActionMarker: true }),
      decision: okResult(SKIPPABLE),
      calibration: CAL,
    })
    expect(d.reasonCode).toBe('hard-signal-positive')
    expect(d.notes).toEqual(['attachment', 'action-marker'])
  })

  it('Stufe 3: ohne Kalibrierungsartefakt gibt es kein skip', () => {
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: okResult(SKIPPABLE),
      calibration: null,
    })
    expect(d.route).toBe('review')
    expect(d.stage).toBe(3)
    expect(d.reasonCode).toBe('calibration-missing')
  })

  it('Stufe 3: abgeschnittener Text ist kein Negativbeweis', () => {
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: okResult(SKIPPABLE, false),
      calibration: CAL,
    })
    expect(d.route).toBe('review')
    expect([d.reasonCode, ...d.notes]).toContain('coverage-incomplete')
  })

  it('Stufe 3: technische Abstention und fehlender Lauf sind unterscheidbar', () => {
    const abstain = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: {
        status: 'abstain',
        reason: 'timeout',
        durationMs: 5000,
        artifacts: okResult({}).artifacts,
      },
      calibration: CAL,
    })
    expect(abstain.route).toBe('review')
    expect([abstain.reasonCode, ...abstain.notes]).toContain('technical-abstain')

    const notRun = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: null,
      calibration: CAL,
    })
    expect([notRun.reasonCode, ...notRun.notes]).toContain('model-not-run')
  })

  it('Stufe 3: weiche Freitextkriterien blockieren, solange sie nicht abgedeckt sind', () => {
    const blocked = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals({ softCriteriaPresent: true }),
      decision: okResult(SKIPPABLE),
      calibration: CAL,
    })
    expect(blocked.route).toBe('review')
    expect([blocked.reasonCode, ...blocked.notes]).toContain('soft-criteria-uncovered')

    const covered = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals({ softCriteriaPresent: true }),
      decision: okResult(SKIPPABLE),
      calibration: CAL,
      softCriteriaCovered: true,
    })
    expect(covered.route).toBe('skip')
  })

  it('Stufe 3: unbekannte Sprache heißt unbekannt, nicht Deutsch', () => {
    for (const language of [null, 'fr', '', 'DE']) {
      const d = evaluateRoutingPolicy({
        explicitRequest: false,
        signals: cleanSignals({ language }),
        decision: okResult(SKIPPABLE),
        calibration: CAL,
      })
      expect(d.route).toBe('review')
      expect([d.reasonCode, ...d.notes]).toContain('language-unsupported')
    }
  })

  it('Stufe 3: Kalibrierung ohne passende Sprache zählt nicht', () => {
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals({ language: 'en' }),
      decision: okResult(SKIPPABLE),
      calibration: { ...CAL, languages: ['de'], temperature: { de: CAL.temperature.de } },
    })
    expect(d.route).toBe('review')
    expect([d.reasonCode, ...d.notes]).toContain('calibration-language-mismatch')
  })

  it('Stufe 3: fehlender Body blockiert, auch wenn das Modell etwas geliefert hat', () => {
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals({ bodyPresent: false, bodyChars: 0 }),
      decision: okResult(SKIPPABLE),
      calibration: CAL,
    })
    expect(d.route).toBe('review')
    expect([d.reasonCode, ...d.notes]).toContain('body-missing')
  })

  it('Stufe 3: fehlt auch nur ein kalibrierter Wert, gibt es kein skip', () => {
    const result = okResult(SKIPPABLE)
    delete result.questions.urgent.calibrated
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: result,
      calibration: CAL,
    })
    expect(d.route).toBe('review')
    expect(d.reasonCode).toBe('calibration-scores-missing')
  })

  it('Stufe 4: jede einzelne Risikofrage über der Schwelle führt zur Vollanalyse', () => {
    for (const q of ['needsReply', 'hasActionOrDate', 'urgent'] as const) {
      const d = evaluateRoutingPolicy({
        explicitRequest: false,
        signals: cleanSignals(),
        decision: okResult({ ...SKIPPABLE, [q]: 0.61 }),
        calibration: CAL,
      })
      expect(d.route).toBe('full-analysis')
      expect(d.stage).toBe(4)
      expect(d.reasonCode).toBe('model-risk-positive')
    }
  })

  it('Stufe 5: Mittelfeld zwischen den Schwellen ist unsicher, nicht negativ', () => {
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: okResult({ ...SKIPPABLE, needsReply: 0.4 }),
      calibration: CAL,
    })
    expect(d.route).toBe('review')
    expect(d.stage).toBe(5)
    expect(d.reasonCode).toBe('model-risk-uncertain')
  })

  it('Stufe 5: unsichere Informationsklasse verhindert skip', () => {
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: okResult({ ...SKIPPABLE, impersonalInfo: 0.79 }),
      calibration: CAL,
    })
    expect(d.route).toBe('review')
    expect(d.reasonCode).toBe('impersonal-uncertain')
  })

  it('Stufe 5: der einzige Weg zu skip', () => {
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: okResult(SKIPPABLE),
      calibration: CAL,
    })
    expect(d.route).toBe('skip')
    expect(d.stage).toBe(5)
    expect(d.reasonCode).toBe('calibrated-negative')
  })

  it('Schwellen sind inklusiv/exklusiv wie dokumentiert (Grenzwerte)', () => {
    const atNegative = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: okResult({ ...SKIPPABLE, needsReply: CAL.riskNegative }),
      calibration: CAL,
    })
    expect(atNegative.route).toBe('skip')
    const atPositive = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: okResult({ ...SKIPPABLE, needsReply: CAL.riskPositive }),
      calibration: CAL,
    })
    expect(atPositive.route).toBe('full-analysis')
  })
})

describe('evaluateRoutingPolicy — ungültige Werte laufen nach review, nie nach skip', () => {
  it('kaputte Zahlen in den Signalen', () => {
    for (const over of [
      { hardFloor: Number.NaN },
      { hardBoost: Number.POSITIVE_INFINITY },
      { bodyChars: -1 },
      { hardSignalKinds: undefined as unknown as PolicySignals['hardSignalKinds'] },
    ]) {
      const d = evaluateRoutingPolicy({
        explicitRequest: false,
        signals: cleanSignals(over),
        decision: okResult(SKIPPABLE),
        calibration: CAL,
      })
      expect(d.route).toBe('review')
      expect([d.reasonCode, ...d.notes]).toContain('invalid-input')
    }
  })

  it('widersprüchliche Body-Angabe (vorhanden, aber 0 Zeichen)', () => {
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals({ bodyPresent: true, bodyChars: 0 }),
      decision: okResult(SKIPPABLE),
      calibration: CAL,
    })
    expect(d.route).toBe('review')
  })

  it('endliche Werte außerhalb 0…1 sind ungültig, nicht besonders sicher (F16)', () => {
    // Drei Risikowerte von -1 lägen unter jeder Negativschwelle, eine 2 über jeder
    // Positivschwelle. Ohne Bereichsprüfung erreicht genau diese Eingabe deterministisch
    // `skip` — eine beschädigte Eingabe sähe sicherer aus als eine gute.
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: okResult({ needsReply: -1, hasActionOrDate: -1, urgent: -1, impersonalInfo: 2 }),
      calibration: CAL,
    })
    expect(d.route).toBe('review')
    expect(d.reasonCode).toBe('invalid-input')
  })

  it('auch ein einzelner Wert knapp außerhalb kippt die Entscheidung nach review', () => {
    for (const bad of [-0.000001, 1.000001]) {
      const d = evaluateRoutingPolicy({
        explicitRequest: false,
        signals: cleanSignals(),
        decision: okResult({ ...SKIPPABLE, impersonalInfo: bad }),
        calibration: CAL,
      })
      expect(d.route).toBe('review')
      expect(d.reasonCode).toBe('invalid-input')
    }
  })

  it('die Ränder 0 und 1 bleiben gültig', () => {
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: okResult({ needsReply: 0, hasActionOrDate: 0, urgent: 0, impersonalInfo: 1 }),
      calibration: CAL,
    })
    expect(d.route).toBe('skip')
  })

  it('nicht endliche Modellwerte gelten als fehlend', () => {
    const result = okResult(SKIPPABLE)
    result.questions.needsReply.calibrated = Number.NaN
    const d = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: cleanSignals(),
      decision: result,
      calibration: CAL,
    })
    expect(d.route).toBe('review')
    expect(d.reasonCode).toBe('calibration-scores-missing')
  })
})

describe('isValidCalibration', () => {
  it('nimmt das Testartefakt an', () => {
    expect(isValidCalibration(CAL)).toBe(true)
  })

  it('verlangt einen vollständigen Fingerabdruck (F10)', () => {
    const ohne = { ...CAL } as Partial<PolicyCalibration>
    delete ohne.fingerprint
    expect(isValidCalibration(ohne as PolicyCalibration)).toBe(false)
    expect(isValidCalibration({ ...CAL, fingerprint: { ...CAL.fingerprint, modelId: '' } })).toBe(false)
    expect(isValidCalibration({ ...CAL, fingerprint: { ...CAL.fingerprint, hypothesisSet: '  ' } })).toBe(false)
  })

  it('weist unbrauchbare Artefakte ab', () => {
    const bad: Array<Partial<PolicyCalibration>> = [
      { id: '' },
      { languages: [] },
      { riskNegative: 0.9 }, // über riskPositive → Loch zwischen den Schwellen
      { riskPositive: 1.5 },
      { impersonalPositive: Number.NaN },
      { temperature: { de: { needsReply: 0, hasActionOrDate: 1, urgent: 1, impersonalInfo: 1 }, en: { needsReply: 1, hasActionOrDate: 1, urgent: 1, impersonalInfo: 1 } } },
      // Sprache in der Liste, aber ohne eigene Temperatur = Freigabe ohne Messung
      { temperature: { de: { needsReply: 1, hasActionOrDate: 1, urgent: 1, impersonalInfo: 1 } } },
      { fittedOn: { cases: 0, groups: 3, subset: 'cal' } },
    ]
    for (const over of bad) expect(isValidCalibration({ ...CAL, ...over })).toBe(false)
    expect(isValidCalibration(null)).toBe(false)
  })

  it('akzeptiert nur Kalibrierung auf dem Kalibrierungsteil', () => {
    const wrongSubset = { ...CAL, fittedOn: { cases: 100, groups: 20, subset: 'dev' } } as unknown as PolicyCalibration
    expect(isValidCalibration(wrongSubset)).toBe(false)
  })
})

describe('evaluateRuleBaseline', () => {
  it('ist genau die Policy ohne Modell: Schutzregel → Vollanalyse, sonst review', () => {
    expect(evaluateRuleBaseline(cleanSignals({ hardFloor: 90 })).route).toBe('full-analysis')
    expect(evaluateRuleBaseline(cleanSignals()).route).toBe('review')
    expect(evaluateRuleBaseline(cleanSignals()).reasonCode).toBe('model-not-run')
  })

  it('überspringt ohne die experimentelle Regel nichts', () => {
    expect(evaluateRuleBaseline(cleanSignals({ newsletterMarker: true })).route).toBe('review')
  })

  it('die experimentelle Negativregel ist ausdrücklich gekennzeichnet', () => {
    const d = evaluateRuleBaseline(cleanSignals({ newsletterMarker: true }), { experimentalNegativeRule: true })
    expect(d.route).toBe('skip')
    expect(d.reasonCode).toBe('experimental-negative-rule')
    // Die übergangenen Blocker bleiben sichtbar.
    expect(d.notes).toContain('model-not-run')
  })

  it('die experimentelle Regel hebt keine Schutzregel auf', () => {
    const d = evaluateRuleBaseline(cleanSignals({ newsletterMarker: true, hasActionMarker: true }), {
      experimentalNegativeRule: true,
    })
    expect(d.route).toBe('full-analysis')
  })

  it('die experimentelle Regel übergeht NUR das fehlende Modell, keinen sachlichen Blocker (F11)', () => {
    // Fehlende Daten dürfen kein Negativbeleg werden: eine Mail ohne lesbaren Text ist
    // nicht „unwichtig, weil nichts drinsteht".
    for (const over of [
      { bodyPresent: false, bodyChars: 0 },
      { language: null },
      { language: 'fr' },
      { softCriteriaPresent: true },
    ]) {
      const d = evaluateRuleBaseline(cleanSignals({ newsletterMarker: true, ...over }), {
        experimentalNegativeRule: true,
      })
      expect(d.route, `übersprungen trotz ${JSON.stringify(over)}`).toBe('review')
    }
  })
})

describe('positiveProtectionCodes', () => {
  it('meldet nichts bei einer vollständig unauffälligen Mail', () => {
    expect(positiveProtectionCodes(cleanSignals())).toEqual([])
  })

  it('ein bekannter Absender ist ein Routing-Signal — auch ohne Floor', () => {
    expect(positiveProtectionCodes(cleanSignals({ hardSignalKinds: ['vip'] }))).toEqual(['hard-signal-positive'])
  })
})
