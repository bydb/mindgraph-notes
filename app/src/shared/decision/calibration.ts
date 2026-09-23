// E-Mail-Decision-Pilot — Kalibrierung der NLI-Ausgabe (§3 des Bauplans).
//
// Eine Softmax-Zahl aus einem NLI-Modell ist KEINE Wahrscheinlichkeit dafür, dass eine
// Mail gefahrlos übersprungen werden kann. Sie ist die Antwort auf „folgt Hypothese H aus
// Text T", in der Skala, die das Training zufällig hinterlassen hat. Temperature Scaling
// zieht diese Skala auf beobachtete Häufigkeiten — mehr nicht, und nur auf dem
// KALIBRIERUNGSTEIL der Daten.
//
// Rohwerte bleiben erhalten: `calibrated` kommt als zusätzliches Feld dazu, die Logits
// werden nie überschrieben. Ohne Artefakt gibt es keinen kalibrierten Wert und damit
// (siehe emailPolicy.ts) kein hypothetisches `skip`.

import type { DecisionQuestionId, DecisionResult, NliTriple, QuestionScores } from './types'
import { DECISION_QUESTIONS } from './types'
import type { PolicyCalibration } from './emailPolicy'

/** Softmax über alle drei Klassen. Die Neutral-Klasse wird nie weggelassen. */
export function softmax3(logits: NliTriple, temperature = 1): NliTriple {
  const t = Number.isFinite(temperature) && temperature > 0 ? temperature : 1
  const scaled = [logits[0] / t, logits[1] / t, logits[2] / t]
  const max = Math.max(...scaled)
  const exps = scaled.map((x) => Math.exp(x - max))
  const sum = exps[0] + exps[1] + exps[2]
  return [exps[0] / sum, exps[1] / sum, exps[2] / sum] as NliTriple
}

export function entailmentProbability(logits: NliTriple, temperature = 1): number {
  return softmax3(logits, temperature)[0]
}

export interface CalibrationSample {
  logits: NliTriple
  /** Beobachtetes Label dieser Frage: 1 = trifft zu. */
  y: 0 | 1
}

const EPS = 1e-12

/** Mittlere negative Log-Likelihood der Entailment-Wahrscheinlichkeit bei Temperatur T. */
export function negativeLogLikelihood(samples: readonly CalibrationSample[], temperature: number): number {
  if (samples.length === 0) return Number.POSITIVE_INFINITY
  let sum = 0
  for (const s of samples) {
    const p = Math.min(1 - EPS, Math.max(EPS, entailmentProbability(s.logits, temperature)))
    sum += s.y === 1 ? -Math.log(p) : -Math.log(1 - p)
  }
  return sum / samples.length
}

export interface TemperatureFit {
  temperature: number
  nll: number
  cases: number
  /** Unabhängige Gruppen in den Kalibrierungsdaten — eine Temperatur aus drei Threads
   *  ist keine Kalibrierung, auch wenn sie aus 300 Zeilen stammt. */
  groups: number
  /**
   * Das Optimum liegt am Rand des Suchbereichs. Das ist kein Ergebnis, sondern ein
   * Warnzeichen: bei perfekt trennbaren Daten läuft die Temperatur gegen 0 (beliebig
   * scharf) — typisch für zu wenige oder zu einfache Fälle. Eine so gewonnene Schwelle
   * ist wertlos, auch wenn sie sich hinschreiben lässt.
   */
  atBound: 'min' | 'max' | null
}

/**
 * Suche der Temperatur auf einem festen logarithmischen Gitter mit anschließender
 * Verfeinerung. Kein Gradientenverfahren, kein Zufall: dieselben Daten ergeben dieselbe
 * Temperatur, und das Ergebnis lässt sich nachrechnen.
 */
export function fitTemperature(
  samples: readonly CalibrationSample[],
  options: { groups?: number; min?: number; max?: number; steps?: number } = {},
): TemperatureFit | null {
  const usable = samples.filter(
    (s) => s.logits.every((x) => Number.isFinite(x)) && (s.y === 0 || s.y === 1),
  )
  if (usable.length === 0) return null
  // Beide Klassen müssen vorkommen — sonst ist die beste Temperatur immer die extremste.
  const positives = usable.filter((s) => s.y === 1).length
  if (positives === 0 || positives === usable.length) return null

  const min = options.min ?? 0.05
  const max = options.max ?? 20
  const steps = options.steps ?? 200
  let best = { t: 1, nll: negativeLogLikelihood(usable, 1) }
  const logMin = Math.log(min)
  const logMax = Math.log(max)
  for (let i = 0; i <= steps; i++) {
    const t = Math.exp(logMin + ((logMax - logMin) * i) / steps)
    const nll = negativeLogLikelihood(usable, t)
    if (nll < best.nll) best = { t, nll }
  }
  // Verfeinerung im Intervall einer Gitterweite um den besten Punkt.
  const width = (logMax - logMin) / steps
  const lo = Math.exp(Math.log(best.t) - width)
  const hi = Math.exp(Math.log(best.t) + width)
  for (let i = 0; i <= 100; i++) {
    const t = lo + ((hi - lo) * i) / 100
    if (t <= 0) continue
    const nll = negativeLogLikelihood(usable, t)
    if (nll < best.nll) best = { t, nll }
  }
  const tolerance = 1e-6
  return {
    temperature: best.t,
    nll: best.nll,
    cases: usable.length,
    groups: options.groups ?? 0,
    atBound: best.t <= min * (1 + tolerance) ? 'min' : best.t >= max * (1 - tolerance) ? 'max' : null,
  }
}

/**
 * Passt das Artefakt zu diesem Ergebnis? Antwort ist die Liste der abweichenden Felder,
 * nicht ein `boolean` — wer eine Kalibrierung ablehnt, soll sagen können, woran es lag.
 * `signalsVersion` und `labelSchema` stehen mit drin, weil sie mitbestimmen, gegen WAS
 * kalibriert wurde; sie kommen nicht aus dem Ergebnis, sondern vom Aufrufer.
 */
export function calibrationMismatch(
  result: DecisionResult,
  calibration: PolicyCalibration,
  current?: { signalsVersion?: string; labelSchema?: string; language?: string | null },
): string[] {
  const fp = calibration.fingerprint
  const a = result.artifacts
  const out: string[] = []
  // Sprache zuerst: ein Artefakt ohne Temperatur für DIESE Sprache ist für sie keines.
  if (current && 'language' in current) {
    const lang = current.language
    if (!lang || !calibration.languages.includes(lang) || !calibration.temperature[lang]) out.push('language')
  }
  if (fp.modelId !== a.modelId) out.push('modelId')
  if (fp.modelRevision !== a.modelRevision) out.push('modelRevision')
  if (fp.quantization !== a.quantization) out.push('quantization')
  if (fp.runtime !== a.runtime) out.push('runtime')
  if (fp.hypothesisSet !== a.hypothesisSet) out.push('hypothesisSet')
  if (current?.signalsVersion !== undefined && fp.signalsVersion !== current.signalsVersion) out.push('signalsVersion')
  if (current?.labelSchema !== undefined && fp.labelSchema !== current.labelSchema) out.push('labelSchema')
  return out
}

/**
 * Hängt kalibrierte Entailment-Werte an ein Engine-Ergebnis. Rohwerte bleiben unberührt;
 * ein `abstain` wird nicht nachträglich zu einem Ergebnis gemacht.
 *
 * Passt das Artefakt nicht zum Ergebnis, bleibt es UNVERÄNDERT — ohne kalibrierte Werte.
 * Die Policy landet dann auf `calibration-scores-missing`, was wörtlich stimmt; den
 * genauen Grund nennt `calibrationMismatch`, und die Auswertung schreibt ihn in den
 * Bericht. Ein stilles Anwenden wäre die gefährlichere Variante: das Ergebnis sähe
 * kalibriert aus und wäre es nicht.
 */
export function applyCalibration(
  result: DecisionResult,
  calibration: PolicyCalibration,
  current?: { signalsVersion?: string; labelSchema?: string; language?: string | null },
): DecisionResult {
  if (result.status !== 'ok') return result
  if (calibrationMismatch(result, calibration, current).length > 0) return result
  // Ohne angegebene Sprache wird die einzige kalibrierte Sprache genommen — gibt es
  // mehrere, ist die Zuordnung nicht entscheidbar und es wird nicht kalibriert.
  const lang = current?.language ?? (calibration.languages.length === 1 ? calibration.languages[0] : null)
  if (!lang) return result
  const perQuestion = calibration.temperature[lang]
  if (!perQuestion) return result
  const questions = {} as Record<DecisionQuestionId, QuestionScores>
  for (const q of DECISION_QUESTIONS) {
    const scores = result.questions[q]
    if (!scores) continue
    const t = perQuestion[q]
    questions[q] = {
      ...scores,
      calibrated: Number.isFinite(t) && t > 0 ? entailmentProbability(scores.logits, t) : undefined,
    }
  }
  return {
    ...result,
    questions,
    artifacts: { ...result.artifacts, calibration: calibration.id },
  }
}
