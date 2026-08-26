import { describe, it, expect } from 'vitest'
import { drawArm, imbalanceOf, isValidBias, DEFAULT_BIAS } from './randomization'
import type { Arm } from './types'

/** Zufallsquelle mit vorgegebener Folge — die Regel muss ohne echten Zufall prüfbar sein. */
function folge(werte: number[]): () => number {
  let i = 0
  return () => werte[i++ % werte.length]
}

/** Einfacher, deterministischer Generator für die Verteilungsprüfung. */
function lcg(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

describe('drawArm', () => {
  it('wirft bei Gleichstand eine echte Münze', () => {
    expect(drawArm([], folge([0.1])).arm).toBe('mindgraph')
    expect(drawArm([], folge([0.9])).arm).toBe('konventionell')
  })

  it('bevorzugt den zurückliegenden Weg, ohne ihn vorzuschreiben', () => {
    const vorne: Arm[] = ['mindgraph', 'mindgraph']
    // Unter der Schwelle: der zurückliegende Weg …
    expect(drawArm(vorne, folge([0.1])).arm).toBe('konventionell')
    // … darüber aber weiterhin der führende. Genau das macht die Ziehung unvorhersehbar.
    expect(drawArm(vorne, folge([0.9])).arm).toBe('mindgraph')
  })

  it('gibt den Ungleichstand VOR der Ziehung zurück', () => {
    expect(drawArm(['mindgraph'], folge([0.1])).imbalance).toBe(1)
    expect(drawArm(['konventionell', 'konventionell'], folge([0.1])).imbalance).toBe(-2)
  })

  it('ist nach drei gleichen Zuteilungen NICHT vorhersehbar', () => {
    // Genau der Fehler des festen Viererblocks: dort stünde der vierte Weg fest.
    const drei: Arm[] = ['mindgraph', 'konventionell', 'mindgraph']
    const moeglich = new Set([drawArm(drei, folge([0.1])).arm, drawArm(drei, folge([0.99])).arm])
    expect(moeglich.size).toBe(2)
  })

  it('hält den Ungleichstand über viele Ziehungen klein', () => {
    const random = lcg(42)
    const assigned: Arm[] = []
    let maxAbweichung = 0
    for (let i = 0; i < 200; i++) {
      assigned.push(drawArm(assigned, random).arm)
      maxAbweichung = Math.max(maxAbweichung, Math.abs(imbalanceOf(assigned)))
    }
    // Ohne Ausgleich läge die Abweichung bei 200 Ziehungen typisch im zweistelligen
    // Bereich; das Urnenmodell hält sie klein, ohne starr zu sein.
    expect(maxAbweichung).toBeLessThanOrEqual(6)
    expect(assigned.filter(a => a === 'mindgraph').length).toBeGreaterThan(80)
    expect(assigned.filter(a => a === 'konventionell').length).toBeGreaterThan(80)
  })

  it('weist eine Zuteilungswahrscheinlichkeit von 1 ab', () => {
    // Bei 1 stünde der nächste Weg bei Ungleichstand fest — das ist keine Ziehung mehr.
    expect(isValidBias(1)).toBe(false)
    expect(isValidBias(0.4)).toBe(false)
    expect(isValidBias(DEFAULT_BIAS)).toBe(true)
    expect(() => drawArm([], folge([0.1]), 1)).toThrow(/Zuteilungswahrscheinlichkeit/)
  })

  it('weist eine kaputte Zufallsquelle ab, statt still zuzuteilen', () => {
    expect(() => drawArm([], () => 1)).toThrow(/Zufallsquelle/)
    expect(() => drawArm([], () => Number.NaN)).toThrow(/Zufallsquelle/)
  })
})
