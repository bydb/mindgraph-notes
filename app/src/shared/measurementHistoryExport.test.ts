import { describe, it, expect } from 'vitest'
import { historyToMarkdown, historyToCsv } from './measurementHistoryExport'
import { rangeBounds, buildBuckets, bucketUsage, bucketCost, bucketPerformance, bucketSavedTime } from './measurementHistory'
import type { LlmRunMetrics } from './llmTelemetry'
import type { ActivityEvent } from './activityLog'

const NOW = new Date(2026, 7, 12, 14, 30).getTime()
const DAY = 86_400_000
function run(p: Partial<LlmRunMetrics> = {}): LlmRunMetrics {
  return { at: NOW, module: 'chat', model: 'm', backend: 'ollama', wallMs: 1000, ...p }
}

function build(runs: LlmRunMetrics[], events: ActivityEvent[] = [], reference: { 'table-merge'?: number } = {}) {
  const { from, to, grain } = rangeBounds('7d', NOW)
  const buckets = buildBuckets(from, to, grain)
  return {
    rangeLabel: '7 Tage', bucketLabel: (b: { from: number }) => new Date(b.from).getDate() + '.',
    usage: bucketUsage(runs, buckets), cost: bucketCost(runs, buckets), performance: bucketPerformance(runs, buckets),
    saved: bucketSavedTime(events, buckets, reference), referenceNote: 'Keine Referenz.',
  }
}

/** Ein übernommener Lauf (30 − 5) und ein verworfener (−3): netto 22 Minuten. */
const MIT_FEHLVERSUCH: ActivityEvent[] = [
  { at: NOW, kind: 'agent-run-finished', runId: 'gut', durationMs: 60_000, instructionMs: 5 * 60_000, activityType: 'table-merge', resultCount: 1, status: 'ok' },
  { at: NOW + 1, kind: 'agent-result-accepted', runId: 'gut', format: 'xlsx', reviewMs: 0 },
  { at: NOW, kind: 'agent-run-finished', runId: 'weg', durationMs: 60_000, instructionMs: 3 * 60_000, activityType: 'table-merge', resultCount: 1, status: 'ok' },
  { at: NOW + 1, kind: 'agent-result-discarded', runId: 'weg', format: 'xlsx', reviewMs: 0 },
]

describe('historyToMarkdown', () => {
  it('trägt Lücken als „—", Untergrenzen als „≥" und N mit — nie eine nackte Null', () => {
    const md = historyToMarkdown(build([
      run({ at: NOW, backend: 'openrouter', costUsd: 0.5, costSource: 'reported' }),
      run({ at: NOW, backend: 'openrouter' }),
      run({ at: NOW - DAY, promptEvalMs: 30_000, evalMs: 30_000 }),
    ]))
    expect(md).toContain('≥ $0.50')
    expect(md).toContain('1 ohne Preis — Untergrenze')
    expect(md).toContain('| 6. | — |')
    expect(md).toContain('Kein Strompreis')
    // Leere Tage stehen als „—" da, nicht als Nullzeile.
    expect(md).not.toContain('| 6. | 0 |')
  })

  it('weist Fehlversuche mit ihrem Abzug aus, statt nur den Nettowert zu nennen', () => {
    const md = historyToMarkdown(build([], MIT_FEHLVERSUCH, { 'table-merge': 30 }))
    expect(md).toContain('| 12. | 22 | 1 | 1 | 3 |  |')
    expect(md).toContain('Gesamt: 22 Minuten aus 1 bewerteten Läufen, abzüglich 3 Minuten aus 1 Fehlversuchen ohne übernommenes Ergebnis')
  })
})

describe('historyToCsv', () => {
  it('schreibt je Kennzahl eine Zeile mit Hinweis und deutschem Dezimaltrenner', () => {
    const csv = historyToCsv(build([run({ at: NOW, backend: 'openrouter', costUsd: 0.25, costSource: 'computed' })]))
    const zeilen = csv.split('\n')
    expect(zeilen[0]).toBe('Bereich;Zeitraum;Kennzahl;Wert;N;Hinweis')
    expect(zeilen.some(z => z.startsWith('Kosten;') && z.includes('0,25') && z.endsWith(';1;'))).toBe(true)
    expect(zeilen.some(z => z.startsWith('Einsatz;') && z.includes('Aufrufe;1'))).toBe(true)
  })

  it('trägt den Fehlversuch-Abzug als Hinweis mit', () => {
    const csv = historyToCsv(build([], MIT_FEHLVERSUCH, { 'table-merge': 30 }))
    expect(csv.split('\n').some(z => z.startsWith('Zeitgewinn;') && z.includes(';22;1;1 Fehlversuche, 3 min abgezogen'))).toBe(true)
  })

  it('nennt wie das Markdown Referenzquelle und manuelle Nachträge (F14)', () => {
    const events: ActivityEvent[] = [
      ...MIT_FEHLVERSUCH,
      { at: NOW + 60_000, kind: 'time-correction', targetId: 'gut', extraMs: 5 * 60_000, source: 'manual' },
    ]
    const input = { ...build([], events, { 'table-merge': 30 }), referenceNote: 'Tabellen-Auswertung 30 min (selbst gestoppt).' }
    const csv = historyToCsv(input)
    const zeilen = csv.split('\n')
    expect(zeilen.some(z => z.startsWith('Zeitgewinn;') && z.includes('5 min bei 1 Vorgängen manuell nachgetragen'))).toBe(true)
    expect(zeilen.some(z => z.startsWith('Zeitgewinn;gesamt;Referenzen;;;') && z.includes('selbst gestoppt'))).toBe(true)
    expect(historyToMarkdown(input)).toContain('selbst gestoppt')
  })
})
