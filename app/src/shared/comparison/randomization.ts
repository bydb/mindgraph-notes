// Zuteilung der Fälle (docs/comparison-mode-plan.md, Abschnitt 2).
//
// Warum kein fester Viererblock: Bei 2:2 in Vierergruppen steht nach drei Fällen der
// vierte Weg fest, bei zwei gleichen Anfängen sogar die beiden folgenden. Wer die
// nächste Zuteilung kennt, kann den Fall danach aussuchen — und misst am Ende diese
// Vorauswahl statt des Werkzeugs.
//
// Stattdessen das Urnenmodell nach Efron: Liegt ein Weg vorn, bekommt der andere die
// höhere Wahrscheinlichkeit. Der Ungleichstand bleibt klein, die EINZELNE Ziehung bleibt
// trotzdem offen.

import type { Arm, Randomization } from './types'

export const DEFAULT_BIAS = 2 / 3

/** Zufallsquelle wird eingespeist, nie importiert — nur so ist die Regel prüfbar. */
export type RandomSource = () => number

export interface Draw {
  arm: Arm
  /** MindGraph minus konventionell VOR dieser Ziehung. */
  imbalance: number
}

export function isValidBias(bias: number): boolean {
  // Genau 1 wäre eine Vorschrift, keine Ziehung: Bei Ungleichstand stünde der nächste
  // Weg fest. 0.5 wäre ein reiner Münzwurf ohne Ausgleich — erlaubt, aber nicht Standard.
  return Number.isFinite(bias) && bias >= 0.5 && bias < 1
}

export function imbalanceOf(assigned: readonly Arm[]): number {
  let saldo = 0
  for (const arm of assigned) saldo += arm === 'mindgraph' ? 1 : -1
  return saldo
}

/**
 * Zieht den nächsten Weg.
 *
 * `assigned` ist die Folge der bisher zugeteilten Wege DIESER Kampagne — nicht die der
 * abgeschlossenen. Der Ausgleich muss auf der Zuteilung beruhen, sonst verschiebt ein
 * abgebrochener Fall die Verteilung.
 */
export function drawArm(assigned: readonly Arm[], random: RandomSource, bias: number = DEFAULT_BIAS): Draw {
  if (!isValidBias(bias)) throw new Error(`Ungültige Zuteilungswahrscheinlichkeit: ${bias}`)
  const imbalance = imbalanceOf(assigned)
  const wurf = random()
  if (!Number.isFinite(wurf) || wurf < 0 || wurf >= 1) throw new Error('Zufallsquelle lieferte keinen Wert in [0,1)')

  // Gleichstand: echte Münze. Sonst bekommt der zurückliegende Weg die Übermacht.
  if (imbalance === 0) return { arm: wurf < 0.5 ? 'mindgraph' : 'konventionell', imbalance }
  const zurueckliegend: Arm = imbalance > 0 ? 'konventionell' : 'mindgraph'
  const fuehrend: Arm = imbalance > 0 ? 'mindgraph' : 'konventionell'
  return { arm: wurf < bias ? zurueckliegend : fuehrend, imbalance }
}

export function defaultRandomization(): Randomization {
  return { method: 'efron-biased-coin', bias: DEFAULT_BIAS }
}
