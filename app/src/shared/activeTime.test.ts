import { describe, it, expect } from 'vitest'
import { ActiveTimer, activeMs, MAX_ACTIVE_MS } from './activeTime'

describe('ActiveTimer', () => {
  it('zählt nur die laufende Zeit, nicht die Pausen', () => {
    const t = new ActiveTimer()
    t.start(0)
    t.pause(60_000)      // 1 Minute gearbeitet
    t.resume(600_000)    // 9 Minuten weg (Fenster im Hintergrund)
    expect(t.stop(660_000)).toBe(120_000)  // plus 1 weitere Minute
  })

  it('kappt Ausreißer — eine Mittagspause ist keine Prüfzeit', () => {
    const t = new ActiveTimer()
    t.start(0)
    expect(t.stop(80 * 60_000)).toBe(MAX_ACTIVE_MS)
  })

  it('liefert 0, wenn nie gestartet wurde', () => {
    expect(new ActiveTimer().stop(1000)).toBe(0)
  })

  it('ignoriert doppeltes Starten statt die Zeit zu verdoppeln', () => {
    const t = new ActiveTimer()
    t.start(0)
    t.start(30_000)
    expect(t.stop(60_000)).toBe(60_000)
  })

  it('verträgt eine rückwärts laufende Uhr ohne negative Zeit', () => {
    const t = new ActiveTimer()
    t.start(10_000)
    expect(t.stop(5_000)).toBe(0)
  })

  it('zeigt den Zwischenstand, ohne die Messung zu beenden', () => {
    const t = new ActiveTimer()
    t.start(0)
    expect(t.elapsed(45_000)).toBe(45_000)
    expect(t.running).toBe(true)
    expect(t.stop(60_000)).toBe(60_000)
  })
})

describe('activeMs', () => {
  it('addiert Auftrag und Prüfung', () => {
    expect(activeMs({ instructionMs: 4 * 60_000, reviewMs: 6 * 60_000 })).toBe(10 * 60_000)
  })

  it('unterscheidet „nicht erfasst" von null Minuten', () => {
    // Der Unterschied entscheidet, ob ein Lauf bewertet wird: Ohne Messung dürfen wir
    // die volle Referenzzeit NICHT als Ersparnis ausweisen.
    expect(activeMs({})).toBeNull()
    expect(activeMs({ instructionMs: 0 })).toBe(0)
  })

  it('rechnet auch, wenn nur eine Hälfte vorliegt', () => {
    expect(activeMs({ reviewMs: 5000 })).toBe(5000)
  })
})
