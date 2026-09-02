import { describe, it, expect } from 'vitest'
import {
  rangeBounds, buildBuckets, bucketUsage, bucketCost, bucketPerformance, bucketSavedTime, formatMinutes, MIN_POINT_RUNS,
} from './measurementHistory'
import type { LlmRunMetrics } from './llmTelemetry'
import type { ActivityEvent } from './activityLog'

const DAY = 86_400_000
// Mittwoch, 12.08.2026 14:30 lokal — mitten in Woche und Monat.
const NOW = new Date(2026, 7, 12, 14, 30).getTime()

function run(partial: Partial<LlmRunMetrics> = {}): LlmRunMetrics {
  return { at: NOW, module: 'chat', model: 'm', backend: 'ollama', wallMs: 1000, ...partial }
}

describe('rangeBounds + buildBuckets', () => {
  it('endet immer am Ende des heutigen Tages, damit die letzte Säule „heute" ist', () => {
    for (const range of ['today', '7d', '30d'] as const) {
      const b = rangeBounds(range, NOW)
      expect(b.to).toBe(new Date(2026, 7, 13).getTime())
    }
  })

  it('liefert für 7 Tage sieben lückenlose Tages-Eimer inklusive heute', () => {
    const { from, to, grain } = rangeBounds('7d', NOW)
    const buckets = buildBuckets(from, to, grain)
    expect(buckets).toHaveLength(7)
    expect(buckets[0].from).toBe(new Date(2026, 7, 6).getTime())
    expect(buckets[6].to).toBe(to)
    for (let i = 1; i < buckets.length; i++) expect(buckets[i].from).toBe(buckets[i - 1].to)
  })

  it('liefert für heute Stunden-Eimer', () => {
    const { from, to, grain } = rangeBounds('today', NOW)
    expect(grain).toBe('hour')
    expect(buildBuckets(from, to, grain)).toHaveLength(24)
  })

  it('liefert für 12 Monate zwölf Monats-Eimer ab dem Monatsersten, über den Jahreswechsel', () => {
    const { from, to, grain } = rangeBounds('12m', NOW)
    const buckets = buildBuckets(from, to, grain)
    expect(buckets).toHaveLength(12)
    expect(new Date(buckets[0].from).toISOString().slice(0, 10)).toBe(new Date(2025, 8, 1).toISOString().slice(0, 10))
    expect(buckets[11].to).toBe(new Date(2026, 8, 1).getTime())
    // Der Jahreswechsel liegt als Eimergrenze drin, nichts überlappt.
    expect(buckets.some(b => b.from === new Date(2026, 0, 1).getTime())).toBe(true)
  })

  it('beginnt Wochen-Eimer montags, auch wenn der Zeitraum mittwochs anfängt', () => {
    const buckets = buildBuckets(NOW, NOW + 21 * DAY, 'week')
    expect(new Date(buckets[0].from).getDay()).toBe(1)
    expect(buckets[0].from).toBe(new Date(2026, 7, 10).getTime())
    for (const b of buckets.slice(1)) expect(new Date(b.from).getDay()).toBe(1)
  })
})

describe('bucketUsage', () => {
  const { from, to, grain } = rangeBounds('7d', NOW)
  const buckets = buildBuckets(from, to, grain)

  it('zählt je Eimer, Modell und Modul und lässt Tage ohne Daten als Lücke stehen', () => {
    const runs = [
      run({ at: NOW, model: 'a' }), run({ at: NOW, model: 'a', module: 'quiz' }),
      run({ at: NOW - 2 * DAY, model: 'b', backend: 'openrouter' }),
      run({ at: NOW - 30 * DAY, model: 'z' }), // außerhalb
    ]
    const u = bucketUsage(runs, buckets)
    expect(u.total).toBe(3)
    expect(u.local).toBe(2)
    expect(u.cloud).toBe(1)
    expect(u.models).toEqual(['a', 'b'])
    expect(u.modules).toEqual(['chat', 'quiz'])
    const heute = u.buckets[6]
    expect(heute.total).toBe(2)
    expect(heute.byModel).toEqual({ a: 2 })
    expect(heute.byModule).toEqual({ chat: 1, quiz: 1 })
    // Gestern: keine Aufrufe — total 0, byModel leer, kein erfundener Eintrag.
    expect(u.buckets[5].total).toBe(0)
    expect(Object.keys(u.buckets[5].byModel)).toHaveLength(0)
  })

  it('ordnet Modelle nach Häufigkeit, bei Gleichstand alphabetisch — stabil für die Farbvergabe', () => {
    const runs = [run({ model: 'zeta' }), run({ model: 'alpha' }), run({ model: 'zeta' }), run({ model: 'mid' })]
    expect(bucketUsage(runs, buckets).models).toEqual(['zeta', 'alpha', 'mid'])
  })
})

describe('bucketCost', () => {
  const { from, to, grain } = rangeBounds('7d', NOW)
  const buckets = buildBuckets(from, to, grain)

  it('hält Cloud-Kosten und lokale Rechenzeit getrennt und markiert Aufrufe ohne Preis', () => {
    const runs = [
      run({ at: NOW, backend: 'openrouter', costUsd: 0.02, costSource: 'reported' }),
      run({ at: NOW, backend: 'llmbase' }), // ohne Preis
      run({ at: NOW, model: 'lokal-a', promptEvalMs: 1000, evalMs: 5000 }),
      run({ at: NOW - DAY, model: 'lokal-a', promptEvalMs: 500, evalMs: 500 }),
      run({ at: NOW, model: 'embed', module: 'embedding' }), // lokal, keine Zeiten
    ]
    const c = bucketCost(runs, buckets)
    expect(c.total.cloudRuns).toBe(2)
    expect(c.total.unpricedRuns).toBe(1)
    expect(c.total.reportedUsd).toBe(0.02)
    expect(c.computeMsTotal).toBe(7000)
    expect(c.localRunsWithoutTiming).toBe(1)
    expect(c.localModels).toEqual(['lokal-a'])
    expect(c.buckets[6].computeMsByModel).toEqual({ 'lokal-a': 6000 })
    expect(c.buckets[5].computeMsByModel).toEqual({ 'lokal-a': 1000 })
    expect(c.buckets[4].computeMsTotal).toBe(0)
    expect(c.buckets[4].cost.cloudRuns).toBe(0)
  })
})

describe('bucketPerformance', () => {
  const { from, to, grain } = rangeBounds('7d', NOW)
  const buckets = buildBuckets(from, to, grain)
  const tps = (n: number, at: number, extra: Partial<LlmRunMetrics> = {}) => run({ at, outputTokens: n, evalMs: 1000, ...extra })

  it('setzt einen Punkt erst ab drei warmen Läufen und rechnet Kaltstarts heraus, zählt sie aber', () => {
    const runs = [
      tps(10, NOW), tps(20, NOW), tps(30, NOW), tps(400, NOW, { loadMs: 5000 }), // heute: 3 warm + 1 kalt
      tps(50, NOW - DAY), tps(60, NOW - DAY),                                    // gestern: nur 2
    ]
    const [s] = bucketPerformance(runs, buckets)
    expect(s.model).toBe('m')
    expect(s.points[6].outputTps).toBe(20)
    expect(s.points[6].runs).toBe(4)
    expect(s.points[6].coldRuns).toBe(1)
    expect(s.points[5].outputTps).toBeNull()
    expect(s.points[5].runs).toBe(2)
    expect(s.points[4].outputTps).toBeNull()
    expect(s.points[4].runs).toBe(0)
    expect(MIN_POINT_RUNS).toBe(3)
  })

  it('trennt Läufe mit verstecktem Reasoning in eine eigene Linie desselben Modells', () => {
    const runs = [tps(10, NOW), tps(10, NOW), tps(10, NOW), tps(3, NOW, { hiddenThinking: true })]
    const series = bucketPerformance(runs, buckets)
    expect(series).toHaveLength(2)
    expect(series[0].hiddenThinking).toBe(false)
    expect(series[0].totalRuns).toBe(3)
    expect(series[1].hiddenThinking).toBe(true)
  })

  it('kennzeichnet Cloud-Serien — dort gibt es keine Token/s', () => {
    const runs = [run({ backend: 'openrouter' }), run({ backend: 'openrouter' }), run({ backend: 'openrouter' })]
    const [s] = bucketPerformance(runs, buckets)
    expect(s.cloud).toBe(true)
    expect(s.points[6].outputTps).toBeNull()
    expect(s.points[6].runs).toBe(3)
  })
})

describe('bucketSavedTime', () => {
  const { from, to, grain } = rangeBounds('30d', NOW)
  const buckets = buildBuckets(from, to, 'week')
  void grain

  function lauf(runId: string, at: number, activeMin: number, model = 'm', type: 'table-merge' | 'document' = 'table-merge'): ActivityEvent[] {
    return [
      { at, kind: 'agent-run-finished', runId, durationMs: 60_000, instructionMs: activeMin * 60_000, model, activityType: type, resultCount: 1, status: 'ok' },
      { at: at + 1000, kind: 'agent-result-accepted', runId, format: 'xlsx', reviewMs: 0 },
    ]
  }

  it('bewertet je Woche mit der heutigen Referenz, auch negativ, und lässt Wochen ohne Läufe leer', () => {
    const events: ActivityEvent[] = [
      ...lauf('a', NOW, 5),            // 30 − 5 = +25
      ...lauf('b', NOW - 7 * DAY, 40), // 30 − 40 = −10
    ]
    const h = bucketSavedTime(events, buckets, { 'table-merge': 30 })
    const letzte = h.buckets[h.buckets.length - 1]
    expect(letzte.saved.totalMinutes).toBe(25)
    expect(letzte.valuedRuns).toBe(1)
    const vorletzte = h.buckets[h.buckets.length - 2]
    expect(vorletzte.saved.totalMinutes).toBe(-10)
    expect(h.buckets[0].valuedRuns).toBe(0)
    expect(h.buckets[0].saved.totalMinutes).toBe(0)
    expect(h.total.totalMinutes).toBe(15)
  })

  it('zählt Läufe ohne Messung und Arten ohne Referenz statt sie als null zu bewerten', () => {
    const events: ActivityEvent[] = [
      { at: NOW, kind: 'agent-run-finished', runId: 'u', durationMs: 60_000, model: 'm', activityType: 'table-merge', resultCount: 1, status: 'ok' },
      { at: NOW + 1, kind: 'agent-result-accepted', runId: 'u', format: 'xlsx' },
      ...lauf('d', NOW, 5, 'm', 'document'),
    ]
    const h = bucketSavedTime(events, buckets, { 'table-merge': 30 })
    expect(h.total.unmeasuredRuns).toBe(1)
    expect(h.total.unpricedTypes).toEqual(['document'])
    expect(h.total.totalMinutes).toBe(0)
  })

  it('zeigt Modellzeilen erst ab drei Läufen und zählt die verborgenen', () => {
    const events: ActivityEvent[] = [
      ...lauf('1', NOW, 5, 'a'), ...lauf('2', NOW - DAY, 6, 'a'), ...lauf('3', NOW - 2 * DAY, 7, 'a'),
      ...lauf('4', NOW, 20, 'b'),
    ]
    const h = bucketSavedTime(events, buckets, { 'table-merge': 30 })
    expect(h.byModel).toHaveLength(1)
    expect(h.byModel[0].model).toBe('a')
    expect(h.byModel[0].runs).toBe(3)
    expect(h.byModel[0].medianActiveMinutes).toBe(6)
    expect(h.byModelHidden).toBe(1)
  })

  it('sammelt Referenzänderungen im Zeitraum, chronologisch', () => {
    const events: ActivityEvent[] = [
      { at: NOW - 3 * DAY, kind: 'reference-changed', activityType: 'table-merge', fromMinutes: 30, toMinutes: 20 },
      { at: NOW - 10 * DAY, kind: 'reference-changed', activityType: 'document', fromMinutes: null, toMinutes: 15 },
      { at: NOW - 100 * DAY, kind: 'reference-changed', activityType: 'document', fromMinutes: 15, toMinutes: 10 },
    ]
    const h = bucketSavedTime(events, buckets, {})
    expect(h.referenceChanges.map(c => c.activityType)).toEqual(['document', 'table-merge'])
  })

  it('rechnet eine Übernahme nach Mitternacht dem Lauf zu, nicht dem nächsten Eimer', () => {
    const wochenende = new Date(2026, 7, 9, 23, 58).getTime() // So 23:58 → Übernahme Mo 00:03
    const events: ActivityEvent[] = [
      { at: wochenende, kind: 'agent-run-finished', runId: 'w', durationMs: 60_000, instructionMs: 60_000, model: 'm', activityType: 'table-merge', resultCount: 1, status: 'ok' },
      { at: wochenende + 5 * 60_000, kind: 'agent-result-accepted', runId: 'w', format: 'xlsx', reviewMs: 60_000 },
    ]
    const h = bucketSavedTime(events, buckets, { 'table-merge': 30 })
    const bewertet = h.buckets.filter(b => b.valuedRuns > 0)
    expect(bewertet).toHaveLength(1)
    // Es zählt genau einmal — nicht in beiden angrenzenden Wochen.
    expect(h.total.lines[0].runs).toBe(1)
  })
})

describe('formatMinutes', () => {
  it('schreibt unter einer Minute eine Nachkommastelle, sonst ganze Minuten', () => {
    expect(formatMinutes(30_000)).toBe('0.5')
    expect(formatMinutes(90_000)).toBe('2')
    expect(formatMinutes(0)).toBe('0.0')
  })
})
