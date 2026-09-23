// Tests der Kalibrierung. Sie ist der Grund, warum aus einer NLI-Zahl überhaupt eine
// Entscheidung werden darf — und die Stelle, an der sich am leichtesten unbemerkt
// betrügen ließe (Kalibrieren auf denselben Daten, auf denen gemessen wird).
import { describe, it, expect } from 'vitest'
import {
  applyCalibration,
  calibrationMismatch,
  entailmentProbability,
  fitTemperature,
  negativeLogLikelihood,
  softmax3,
  type CalibrationSample,
} from './calibration'
import type { PolicyCalibration } from './emailPolicy'
import { DECISION_QUESTIONS, type DecisionOk, type DecisionQuestionId, type NliTriple, type QuestionScores } from './types'

const CAL: PolicyCalibration = {
  id: 'cal@1',
  fingerprint: {
    modelId: 'm',
    modelRevision: 'r',
    quantization: 'q8',
    runtime: 'test',
    hypothesisSet: 'h',
    signalsVersion: 'email-decision-signals@1',
    labelSchema: 'email-decision-labels@1',
  },
  languages: ['de'],
  temperature: { de: { needsReply: 2, hasActionOrDate: 2, urgent: 2, impersonalInfo: 2 } },
  riskPositive: 0.6,
  riskNegative: 0.1,
  impersonalPositive: 0.8,
  fittedOn: { cases: 50, groups: 20, subset: 'cal' },
}

function okResult(logits: NliTriple): DecisionOk {
  const questions = {} as Record<DecisionQuestionId, QuestionScores>
  for (const q of DECISION_QUESTIONS) questions[q] = { logits, probs: softmax3(logits) }
  return {
    status: 'ok',
    questions,
    coverage: { complete: true, promptTokens: 100, maxTokens: 512, bodyChars: 200, bodyCharsUsed: 200 },
    pairs: 4,
    tokens: 400,
    durationMs: 10,
    artifacts: { hypothesisSet: 'h', modelId: 'm', modelRevision: 'r', quantization: 'q8', calibration: null, runtime: 'test' },
  }
}

describe('softmax3', () => {
  it('summiert zu 1 und behält die Neutral-Klasse', () => {
    const p = softmax3([2, 1, 0])
    expect(p[0] + p[1] + p[2]).toBeCloseTo(1, 12)
    expect(p[1]).toBeGreaterThan(0)
    expect(p[0]).toBeGreaterThan(p[2])
  })

  it('ist numerisch stabil bei großen Logits', () => {
    const p = softmax3([1000, 999, 998])
    expect(Number.isFinite(p[0])).toBe(true)
    expect(p[0] + p[1] + p[2]).toBeCloseTo(1, 12)
  })

  it('höhere Temperatur glättet, niedrigere schärft', () => {
    const scharf = softmax3([3, 0, 0], 0.5)[0]
    const roh = softmax3([3, 0, 0], 1)[0]
    const glatt = softmax3([3, 0, 0], 5)[0]
    expect(scharf).toBeGreaterThan(roh)
    expect(roh).toBeGreaterThan(glatt)
  })

  it('behandelt eine unbrauchbare Temperatur wie 1, statt NaN zu liefern', () => {
    expect(softmax3([1, 0, 0], 0)[0]).toBeCloseTo(softmax3([1, 0, 0], 1)[0], 12)
    expect(softmax3([1, 0, 0], Number.NaN)[0]).toBeCloseTo(softmax3([1, 0, 0], 1)[0], 12)
  })
})

describe('fitTemperature', () => {
  it('findet eine bekannte Temperatur ungefähr wieder', () => {
    // Daten mit einer wahren Temperatur von 3 erzeugen: Label folgt der geglätteten
    // Wahrscheinlichkeit, nicht dem rohen (übersicheren) Wert.
    const samples: CalibrationSample[] = []
    for (let i = 0; i < 400; i++) {
      const raw = -4 + (8 * i) / 399
      const logits: NliTriple = [raw, 0, 0]
      const pTrue = entailmentProbability(logits, 3)
      // Deterministisch statt Zufall: der Anteil positiver Fälle wird direkt gesetzt.
      samples.push({ logits, y: 1 })
      samples.push({ logits, y: 0 })
      for (let k = 0; k < 8; k++) samples.push({ logits, y: k / 8 < pTrue ? 1 : 0 })
    }
    const fit = fitTemperature(samples)
    expect(fit).not.toBe(null)
    expect(fit!.temperature).toBeGreaterThan(1.5)
    expect(fit!.temperature).toBeLessThan(6)
    expect(fit!.cases).toBe(samples.length)
  })

  it('verweigert einseitige Daten — sonst wäre die beste Temperatur die extremste', () => {
    const onlyPositive: CalibrationSample[] = [
      { logits: [1, 0, 0], y: 1 },
      { logits: [2, 0, 0], y: 1 },
    ]
    expect(fitTemperature(onlyPositive)).toBe(null)
  })

  it('verweigert leere und kaputte Daten', () => {
    expect(fitTemperature([])).toBe(null)
    expect(fitTemperature([{ logits: [Number.NaN, 0, 0], y: 1 }])).toBe(null)
  })

  it('ist deterministisch — zweimal dieselbe Temperatur', () => {
    const samples: CalibrationSample[] = [
      { logits: [2, 0, 0], y: 1 },
      { logits: [1, 0, 0], y: 0 },
      { logits: [-1, 0, 0], y: 0 },
      { logits: [3, 0, 0], y: 1 },
    ]
    expect(fitTemperature(samples)!.temperature).toBe(fitTemperature(samples)!.temperature)
  })

  it('reicht die Gruppenzahl durch — eine Temperatur aus drei Threads ist keine', () => {
    const samples: CalibrationSample[] = [
      { logits: [2, 0, 0], y: 1 },
      { logits: [-2, 0, 0], y: 0 },
    ]
    expect(fitTemperature(samples, { groups: 2 })!.groups).toBe(2)
  })
})

describe('negativeLogLikelihood', () => {
  it('ist bei passender Temperatur kleiner als bei unpassender', () => {
    const samples: CalibrationSample[] = [
      { logits: [0.5, 0, 0], y: 0 },
      { logits: [0.6, 0, 0], y: 1 },
      { logits: [0.4, 0, 0], y: 0 },
      { logits: [0.7, 0, 0], y: 1 },
    ]
    const best = fitTemperature(samples)!.temperature
    expect(negativeLogLikelihood(samples, best)).toBeLessThanOrEqual(negativeLogLikelihood(samples, 0.05))
  })

  it('ohne Fälle gibt es keine Likelihood', () => {
    expect(negativeLogLikelihood([], 1)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('applyCalibration', () => {
  it('ergänzt kalibrierte Werte und lässt die Logits unberührt', () => {
    const before = okResult([3, 0, 0])
    const after = applyCalibration(before, CAL) as DecisionOk
    expect(after.questions.needsReply.logits).toEqual([3, 0, 0])
    expect(after.questions.needsReply.probs).toEqual(before.questions.needsReply.probs)
    expect(after.questions.needsReply.calibrated).toBeCloseTo(entailmentProbability([3, 0, 0], 2), 12)
    expect(after.questions.needsReply.calibrated).toBeLessThan(before.questions.needsReply.probs[0])
  })

  it('hängt die Artefaktkennung an, damit die Messung zuzuordnen bleibt', () => {
    const after = applyCalibration(okResult([1, 0, 0]), CAL) as DecisionOk
    expect(after.artifacts.calibration).toBe('cal@1')
  })

  it('macht aus einer Abstention nachträglich kein Ergebnis', () => {
    const abstain = {
      status: 'abstain' as const,
      reason: 'timeout' as const,
      durationMs: 5000,
      artifacts: okResult([0, 0, 0]).artifacts,
    }
    expect(applyCalibration(abstain, CAL)).toBe(abstain)
  })

  it('eine unbrauchbare Temperatur lässt den Wert fehlen, statt ihn zu erfinden', () => {
    const broken = { ...CAL, temperature: { de: { ...CAL.temperature.de, urgent: 0 } } }
    const after = applyCalibration(okResult([2, 0, 0]), broken) as DecisionOk
    expect(after.questions.urgent.calibrated).toBeUndefined()
    expect(after.questions.needsReply.calibrated).toBeGreaterThan(0)
  })
})

describe('fitTemperature — Randlagen sind ein Warnzeichen, kein Ergebnis', () => {
  it('meldet perfekt trennbare Daten: die Temperatur läuft gegen den unteren Rand', () => {
    const samples: CalibrationSample[] = [
      { logits: [5, 0, 0], y: 1 },
      { logits: [4, 0, 0], y: 1 },
      { logits: [-4, 0, 0], y: 0 },
      { logits: [-5, 0, 0], y: 0 },
    ]
    const fit = fitTemperature(samples)!
    expect(fit.atBound).toBe('min')
  })

  it('meldet bei durchmischten Daten keine Randlage', () => {
    const samples: CalibrationSample[] = [
      { logits: [0.5, 0, 0], y: 1 },
      { logits: [0.4, 0, 0], y: 0 },
      { logits: [0.6, 0, 0], y: 1 },
      { logits: [0.3, 0, 0], y: 0 },
      { logits: [0.55, 0, 0], y: 0 },
      { logits: [0.45, 0, 0], y: 1 },
    ]
    expect(fitTemperature(samples)!.atBound).toBe(null)
  })
})

describe('calibrationMismatch / applyCalibration mit fremdem Artefakt (F10)', () => {
  it('meldet jedes abweichende Feld einzeln', () => {
    const result = okResult([1, 0, 0])
    expect(calibrationMismatch(result, CAL)).toEqual([])
    expect(calibrationMismatch(result, { ...CAL, fingerprint: { ...CAL.fingerprint, modelId: 'anderes-modell' } })).toEqual(['modelId'])
    expect(
      calibrationMismatch(result, {
        ...CAL,
        fingerprint: { ...CAL.fingerprint, quantization: 'fp16', hypothesisSet: 'anders' },
      }),
    ).toEqual(['quantization', 'hypothesisSet'])
  })

  it('prüft Signal- und Labelversion nur, wenn der Aufrufer sie nennt', () => {
    const result = okResult([1, 0, 0])
    expect(calibrationMismatch(result, CAL, { signalsVersion: 'email-decision-signals@1' })).toEqual([])
    expect(calibrationMismatch(result, CAL, { signalsVersion: 'email-decision-signals@2' })).toEqual(['signalsVersion'])
    expect(calibrationMismatch(result, CAL, { labelSchema: 'anders' })).toEqual(['labelSchema'])
  })

  it('wendet ein fremdes Artefakt NICHT an — lieber kein Wert als ein falscher', () => {
    const result = okResult([3, 0, 0])
    const fremd = { ...CAL, fingerprint: { ...CAL.fingerprint, modelId: 'anderes-modell' } }
    const after = applyCalibration(result, fremd) as DecisionOk
    expect(after).toBe(result)
    expect(after.questions.needsReply.calibrated).toBeUndefined()
    expect(after.artifacts.calibration).toBe(null)
  })
})

describe('Sprachtrennung der Kalibrierung (F10)', () => {
  const ZWEI: PolicyCalibration = {
    ...CAL,
    languages: ['de', 'en'],
    temperature: {
      de: { needsReply: 2, hasActionOrDate: 2, urgent: 2, impersonalInfo: 2 },
      en: { needsReply: 5, hasActionOrDate: 5, urgent: 5, impersonalInfo: 5 },
    },
  }

  it('nimmt je Sprache die eigene Temperatur', () => {
    const de = applyCalibration(okResult([3, 0, 0]), ZWEI, { language: 'de' }) as DecisionOk
    const en = applyCalibration(okResult([3, 0, 0]), ZWEI, { language: 'en' }) as DecisionOk
    expect(de.questions.urgent.calibrated).toBeCloseTo(entailmentProbability([3, 0, 0], 2), 12)
    expect(en.questions.urgent.calibrated).toBeCloseTo(entailmentProbability([3, 0, 0], 5), 12)
    expect(de.questions.urgent.calibrated).not.toBeCloseTo(en.questions.urgent.calibrated as number, 6)
  })

  it('kalibriert nicht für eine Sprache, die das Artefakt nicht kennt', () => {
    const result = okResult([3, 0, 0])
    expect(calibrationMismatch(result, ZWEI, { language: 'fr' })).toEqual(['language'])
    expect(calibrationMismatch(result, ZWEI, { language: null })).toEqual(['language'])
    expect(applyCalibration(result, ZWEI, { language: 'fr' })).toBe(result)
  })

  it('ohne Sprachangabe nur bei genau einer kalibrierten Sprache', () => {
    const eine = applyCalibration(okResult([3, 0, 0]), CAL) as DecisionOk
    expect(eine.questions.urgent.calibrated).toBeGreaterThan(0)
    // Zwei Sprachen, keine Angabe: die Zuordnung ist nicht entscheidbar — also nichts tun.
    const result = okResult([3, 0, 0])
    expect(applyCalibration(result, ZWEI)).toBe(result)
  })
})
