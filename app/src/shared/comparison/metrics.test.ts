import { describe, it, expect } from 'vitest'
import { armStats, campaignReport, componentMs, elapsedMs, iqr, median, totalActiveMs } from './metrics'
import type { ComparisonCase, WorkSession } from './types'

const T0 = new Date('2026-08-26T09:00:00').getTime()
const min = (n: number): number => n * 60_000

function sitzung(kind: WorkSession['kind'], minuten: number, ab = T0): WorkSession {
  return { kind, from: ab, to: ab + min(minuten), origin: 'vordergrund-automatisch' }
}

function fall(over: Partial<ComparisonCase> = {}): ComparisonCase {
  return {
    id: 'f', campaignId: 'k1', label: 'Fall', arm: 'mindgraph', imbalanceAtDraw: 0,
    state: 'abgeschlossen', createdAt: T0, closedAt: T0 + min(30), quality: 3,
    sessions: [sitzung('auftrag', 2)], accepted: true, ...over
  }
}

describe('totalActiveMs', () => {
  it('summiert alle Bestandteile — inklusive Rückfallarbeit', () => {
    // Der Kern der Anlage: Das MindGraph-Ergebnis wurde verworfen, der Fall danach von
    // Hand fertiggestellt. Diese 38 Minuten gehören WEITERHIN zum MindGraph-Fall.
    const c = fall({
      accepted: false,
      sessions: [
        sitzung('auftrag', 2), sitzung('vordergrund', 4), sitzung('pruefung', 6),
        sitzung('rueckfallarbeit', 38)
      ]
    })
    expect(totalActiveMs(c)).toBe(min(50))
    expect(componentMs(c, 'rueckfallarbeit')).toBe(min(38))
  })

  it('zählt einen gescheiterten Lauf nicht künstlich billig', () => {
    const gescheitert = fall({ id: 'a', accepted: false, sessions: [sitzung('auftrag', 2), sitzung('rueckfallarbeit', 40)] })
    const geglueckt = fall({ id: 'b', accepted: true, sessions: [sitzung('auftrag', 2), sitzung('pruefung', 4)] })
    // Ohne die Rückfallregel stünde der Fehlschlag bei 2 Minuten und der Weg sähe
    // besser aus, je öfter er scheitert.
    expect(totalActiveMs(gescheitert)).toBeGreaterThan(totalActiveMs(geglueckt))
  })

  it('verträgt rückwärts laufende Sitzungen ohne negative Zeit', () => {
    expect(totalActiveMs(fall({ sessions: [{ kind: 'auftrag', from: T0 + 1000, to: T0, origin: 'gestoppt' }] }))).toBe(0)
  })
})

describe('median und iqr', () => {
  it('nimmt bei gerader Anzahl das Mittel der beiden mittleren Werte', () => {
    expect(median([10, 20, 30, 40])).toBe(25)
    expect(median([])).toBeNull()
  })

  it('liefert erst ab vier Werten einen Quartilsabstand', () => {
    expect(iqr([1, 2, 3])).toBeNull()
    // Lineare Interpolation wie in R (Typ 7): q25 = 17,5 · q75 = 32,5.
    expect(iqr([10, 20, 30, 40])).toBe(15)
  })
})

describe('armStats', () => {
  const konv = (over: Partial<ComparisonCase> = {}): ComparisonCase =>
    fall({ arm: 'konventionell', accepted: undefined, ...over })

  it('hält ALLE zugeteilten Fälle im Nenner', () => {
    const cases = [
      konv({ id: '1' }), konv({ id: '2' }), konv({ id: '3' }),
      konv({ id: '4', state: 'abgebrochen', stateReason: 'storniert' }),
      konv({ id: '5', state: 'nicht-messbar', stateReason: 'Zeiten fehlen' }),
      konv({ id: '6', state: 'offen', closedAt: undefined })
    ]
    const s = armStats(cases, 'konventionell')
    expect(s.assigned).toBe(6)
    expect(s.completed).toBe(3)
    expect(s.aborted).toBe(1)
    expect(s.notMeasurable).toBe(1)
    expect(s.open).toBe(1)
  })

  it('zeigt keine Kennzahl, solange weniger als drei Fälle abgeschlossen sind', () => {
    const s = armStats([konv({ id: '1' }), konv({ id: '2' })], 'konventionell')
    expect(s.medianTotalActiveMs).toBeNull()
    expect(s.missingForMetrics).toBe(1)
  })

  it('rechnet nur mit abgeschlossenen Fällen', () => {
    const cases = [
      konv({ id: '1', sessions: [sitzung('nacharbeit', 10)] }),
      konv({ id: '2', sessions: [sitzung('nacharbeit', 20)] }),
      konv({ id: '3', sessions: [sitzung('nacharbeit', 30)] }),
      // Der abgebrochene Fall hat viel Zeit verbraucht, darf den Median aber nicht ziehen.
      konv({ id: '4', state: 'abgebrochen', stateReason: 'x', sessions: [sitzung('nacharbeit', 999)] })
    ]
    expect(armStats(cases, 'konventionell').medianTotalActiveMs).toBe(min(20))
  })

  it('führt die Übernahmequote nur im MindGraph-Arm', () => {
    const cases = [fall({ id: '1' }), fall({ id: '2', accepted: false }), fall({ id: '3' })]
    expect(armStats(cases, 'mindgraph').acceptedOfCompleted).toBe(2)
    expect(armStats([fall({ id: 'k', arm: 'konventionell' })], 'konventionell').acceptedOfCompleted).toBeNull()
  })

  it('zählt die Qualitätsstufen getrennt', () => {
    const cases = [fall({ id: '1', quality: 4 }), fall({ id: '2', quality: 4 }), fall({ id: '3', quality: 2 })]
    const s = armStats(cases, 'mindgraph')
    expect(s.qualityCounts[4]).toBe(2)
    expect(s.qualityCounts[2]).toBe(1)
    expect(s.qualityCounts[1]).toBe(0)
  })
})

describe('campaignReport', () => {
  it('ist erst vergleichbar, wenn BEIDE Wege genug Fälle haben', () => {
    const mg = [fall({ id: 'm1' }), fall({ id: 'm2' }), fall({ id: 'm3' })]
    const kv = [fall({ id: 'k1', arm: 'konventionell' }), fall({ id: 'k2', arm: 'konventionell' })]
    const bericht = campaignReport('k1', [...mg, ...kv])
    expect(bericht.comparable).toBe(false)
    expect(bericht.arms.find(a => a.arm === 'konventionell')?.missingForMetrics).toBe(1)
  })

  it('mischt keine Fälle fremder Kampagnen', () => {
    const eigen = [fall({ id: '1' }), fall({ id: '2' }), fall({ id: '3' })]
    const fremd = [fall({ id: 'x', campaignId: 'andere', sessions: [sitzung('auftrag', 500)] })]
    const s = campaignReport('k1', [...eigen, ...fremd]).arms.find(a => a.arm === 'mindgraph')!
    expect(s.assigned).toBe(3)
  })

  it('rechnet die Durchlaufzeit getrennt von der aktiven Zeit', () => {
    const c = fall({ createdAt: T0, closedAt: T0 + min(180), sessions: [sitzung('auftrag', 5)] })
    expect(elapsedMs(c)).toBe(min(180))
    expect(totalActiveMs(c)).toBe(min(5))
    expect(elapsedMs(fall({ closedAt: undefined }))).toBeNull()
  })
})
