import { describe, it, expect } from 'vitest'
import { historyToMarkdown, historyToCsv } from './measurementHistoryExport'
import { rangeBounds, buildBuckets, bucketUsage, bucketCost, bucketPerformance, bucketSavedTime } from './measurementHistory'
import type { LlmRunMetrics } from './llmTelemetry'

const NOW = new Date(2026, 7, 12, 14, 30).getTime()
const DAY = 86_400_000
function run(p: Partial<LlmRunMetrics> = {}): LlmRunMetrics {
  return { at: NOW, module: 'chat', model: 'm', backend: 'ollama', wallMs: 1000, ...p }
}

function build(runs: LlmRunMetrics[]) {
  const { from, to, grain } = rangeBounds('7d', NOW)
  const buckets = buildBuckets(from, to, grain)
  return {
    rangeLabel: '7 Tage', bucketLabel: (b: { from: number }) => new Date(b.from).getDate() + '.',
    usage: bucketUsage(runs, buckets), cost: bucketCost(runs, buckets), performance: bucketPerformance(runs, buckets),
    saved: bucketSavedTime([], buckets, {}), referenceNote: 'Keine Referenz.',
  }
}

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
})

describe('historyToCsv', () => {
  it('schreibt je Kennzahl eine Zeile mit Hinweis und deutschem Dezimaltrenner', () => {
    const csv = historyToCsv(build([run({ at: NOW, backend: 'openrouter', costUsd: 0.25, costSource: 'computed' })]))
    const zeilen = csv.split('\n')
    expect(zeilen[0]).toBe('Bereich;Zeitraum;Kennzahl;Wert;N;Hinweis')
    expect(zeilen.some(z => z.startsWith('Kosten;') && z.includes('0,25') && z.endsWith(';1;'))).toBe(true)
    expect(zeilen.some(z => z.startsWith('Einsatz;') && z.includes('Aufrufe;1'))).toBe(true)
  })
})
