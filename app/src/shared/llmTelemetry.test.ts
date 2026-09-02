import {
  describe,
  it,
  expect } from 'vitest'
import {
  fromOllamaResponse,
  outputTokensPerSecond,
  promptTokensPerSecond,
  isColdStart,
  summarize,
  median,
  nsToMs,
  formatTps,
  buildComparisonRows,
  toMarkdownTable,
  toCsv,
  type LlmRunMetrics,
  summarizeCost,
  formatCostCell
} from './llmTelemetry'

function run(partial: Partial<LlmRunMetrics>): LlmRunMetrics {
  return { at: 0, module: 'chat', model: 'm', backend: 'ollama', wallMs: 1000, ...partial }
}

describe('nsToMs', () => {
  it('rechnet Nanosekunden in Millisekunden', () => {
    expect(nsToMs(1_500_000_000)).toBe(1500)
  })
  it('unterscheidet „nicht gemeldet" von „null gemessen"', () => {
    expect(nsToMs(undefined)).toBeUndefined()
    expect(nsToMs(null)).toBeUndefined()
    expect(nsToMs(-5)).toBeUndefined()
    expect(nsToMs(0)).toBe(0)
  })
})

describe('Durchsatz', () => {
  it('rechnet Ausgabe-Token pro Sekunde', () => {
    expect(outputTokensPerSecond(run({ outputTokens: 180, evalMs: 10_000 }))).toBeCloseTo(18)
  })
  it('trennt Lesen von Schreiben', () => {
    const r = run({ promptTokens: 3400, promptEvalMs: 10_000, outputTokens: 180, evalMs: 10_000 })
    expect(promptTokensPerSecond(r)).toBeCloseTo(340)
    expect(outputTokensPerSecond(r)).toBeCloseTo(18)
  })
  it('liefert null statt Unendlich, wenn der Server nichts meldet', () => {
    expect(outputTokensPerSecond(run({ outputTokens: 180 }))).toBeNull()
    expect(outputTokensPerSecond(run({ outputTokens: 180, evalMs: 0 }))).toBeNull()
    expect(promptTokensPerSecond(run({ promptEvalMs: 500 }))).toBeNull()
  })
})

describe('Kaltstart', () => {
  it('erkennt geladene Gewichte am load_duration', () => {
    expect(isColdStart(run({ loadMs: 24_000 }))).toBe(true)
    expect(isColdStart(run({ loadMs: 12 }))).toBe(false)
  })
  it('wertet ein fehlendes load_duration als warm', () => {
    // Fail-open: lieber einen Kaltstart übersehen, als jeden Lauf als Kaltstart
    // auszuweisen und damit die Geschwindigkeitsanzeige dauerhaft leer zu lassen.
    expect(isColdStart(run({}))).toBe(false)
  })
})

describe('fromOllamaResponse', () => {
  it('übernimmt die Nanosekunden-Felder', () => {
    const m = fromOllamaResponse(
      { load_duration: 24_000_000_000, prompt_eval_count: 340, prompt_eval_duration: 1_000_000_000, eval_count: 180, eval_duration: 10_000_000_000 },
      { module: 'note-agent', model: 'qwen3.8:27b-mlx', wallMs: 11_200, at: 42 }
    )
    expect(m).toMatchObject({ module: 'note-agent', promptTokens: 340, outputTokens: 180, evalMs: 10_000, loadMs: 24_000 })
    expect(outputTokensPerSecond(m)).toBeCloseTo(18)
    expect(isColdStart(m)).toBe(true)
  })
  it('merkt sich, wenn der Denk-Anteil nicht in den Token steckt', () => {
    const m = fromOllamaResponse(
      { eval_count: 98, eval_duration: 30_000_000_000 },
      { module: 'chat', model: 'm', wallMs: 30_000, at: 0, hiddenThinking: true, executionProfile: 'agent-test-v1' }
    )
    expect(m.hiddenThinking).toBe(true)
    expect(m.executionProfile).toBe('agent-test-v1')
  })
})

describe('median', () => {
  it('nimmt bei gerader Anzahl das Mittel der beiden mittleren Werte', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([3, 1, 2])).toBe(2)
  })
  it('liefert null bei leerer Eingabe', () => {
    expect(median([])).toBeNull()
  })
})

describe('summarize', () => {
  it('hält Kaltstarts aus der Geschwindigkeit heraus, zählt sie aber', () => {
    const runs = [
      run({ loadMs: 24_000, outputTokens: 100, evalMs: 20_000 }),  // kalt: 5 Tok/s
      run({ loadMs: 5, outputTokens: 180, evalMs: 10_000 }),       // warm: 18 Tok/s
      run({ loadMs: 5, outputTokens: 200, evalMs: 10_000 }),       // warm: 20 Tok/s
    ]
    const s = summarize(runs)
    expect(s.runs).toBe(3)
    expect(s.coldRuns).toBe(1)
    expect(s.outputTps).toBeCloseTo(19)   // Median aus 18 und 20, ohne die 5
  })
  it('liefert null statt 0, wenn nichts Warmes messbar war', () => {
    expect(summarize([run({ loadMs: 30_000 })]).outputTps).toBeNull()
    expect(summarize([]).outputTps).toBeNull()
  })
  it('zählt Läufe mit verstecktem Denk-Anteil', () => {
    expect(summarize([run({ hiddenThinking: true }), run({})]).hiddenThinkingRuns).toBe(1)
  })
})

describe('formatTps', () => {
  it('zeigt kleine Werte genauer als große', () => {
    expect(formatTps(4.27)).toBe('4.3')
    expect(formatTps(18.6)).toBe('19')
    expect(formatTps(null)).toBe('—')
  })
})

describe('buildComparisonRows', () => {
  const runs: LlmRunMetrics[] = [
    run({ model: 'a', module: 'chat', outputTokens: 100, evalMs: 10_000 }),   // 10 Tok/s
    run({ model: 'a', module: 'brain', outputTokens: 400, evalMs: 10_000 }),  // 40 Tok/s
    run({ model: 'b', module: 'chat', outputTokens: 200, evalMs: 10_000 }),   // 20 Tok/s
  ]

  it('trennt nach Modell UND Modul', () => {
    const rows = buildComparisonRows(runs)
    expect(rows).toHaveLength(3)
    expect(rows.map(r => `${r.model}/${r.module}`)).toEqual(['a/brain', 'b/chat', 'a/chat'])
  })

  it('sortiert die schnellste Zeile nach oben', () => {
    expect(buildComparisonRows(runs)[0].summary.outputTps).toBeCloseTo(40)
  })

  it('stellt Zeilen ohne messbaren Durchsatz hinten an, statt sie als 0 einzureihen', () => {
    const rows = buildComparisonRows([...runs, run({ model: 'c', module: 'chat' })])
    expect(rows[rows.length - 1].model).toBe('c')
    expect(rows[rows.length - 1].summary.outputTps).toBeNull()
  })
})

describe('Export', () => {
  const rows = buildComparisonRows([
    run({ model: 'qwen', module: 'chat', outputTokens: 180, evalMs: 10_000, promptTokens: 340, promptEvalMs: 1000, firstTokenMs: 800 }),
  ])

  it('baut eine Markdown-Tabelle', () => {
    const md = toMarkdownTable(rows)
    expect(md).toContain('| qwen | chat | 18 | 340 | 0.8 s | lokal | 1 | 0 |')
    expect(md).toContain('Median über die warmen Läufe')
  })

  it('weist versteckten Denk-Anteil in der Markdown-Tabelle aus', () => {
    const withThinking = buildComparisonRows([
      run({ model: 'q', module: 'chat', outputTokens: 90, evalMs: 30_000, hiddenThinking: true }),
    ])
    const md = toMarkdownTable(withThinking)
    expect(md).toContain('3.0*')
    expect(md).toContain('Denk-Token')
  })

  it('baut CSV mit Semikolon und deutschem Dezimalkomma', () => {
    const csv = toCsv(rows)
    expect(csv.split('\n')[0]).toContain('Modell;Modul;')
    // Kostenspalten bleiben bei lokalen Laeufen leer — nicht 0, das hiesse 'gemessen: gratis'.
    expect(csv.split('\n')[1]).toBe('qwen;chat;18;340;800;;;;0;0;1;0;0')
  })

  it('maskiert Semikolon im Modellnamen', () => {
    const odd = buildComparisonRows([run({ model: 'a;b', module: 'chat', outputTokens: 10, evalMs: 1000 })])
    expect(toCsv(odd)).toContain('"a;b"')
  })
})

// ─── Kosten im Leistungsfenster ──────────────────────────────────────────────

describe('summarizeCost', () => {
  const run = (over: Partial<LlmRunMetrics>): LlmRunMetrics => ({
    at: 1, module: 'note-agent', model: 'm', backend: 'openrouter', wallMs: 100, ...over
  })

  it('zaehlt lokale Laeufe getrennt und gibt keine Kosten aus', () => {
    // 'kostet nichts' und 'Kosten unbekannt' duerfen nicht beide als $0 erscheinen.
    const c = summarizeCost([run({ backend: 'ollama' }), run({ backend: 'lmstudio' })])
    expect(c.localRuns).toBe(2)
    expect(c.cloudRuns).toBe(0)
    expect(c.totalUsd).toBeNull()
    expect(formatCostCell(c)).toBe('lokal')
  })

  it('summiert gemeldete und gerechnete Betraege getrennt', () => {
    const c = summarizeCost([
      run({ costUsd: 0.002, costSource: 'reported' }),
      run({ costUsd: 0.003, costSource: 'reported' }),
      run({ costUsd: 0.001, costSource: 'computed', backend: 'llmbase' }),
    ])
    expect(c.reportedUsd).toBeCloseTo(0.005, 8)
    expect(c.computedUsd).toBeCloseTo(0.001, 8)
    expect(c.totalUsd).toBeCloseTo(0.006, 8)
    expect(c.pricedRuns).toBe(3)
  })

  it('meldet eine Untergrenze, wenn ein Cloud-Lauf keinen Preis hatte', () => {
    const c = summarizeCost([
      run({ costUsd: 0.002, costSource: 'reported' }),
      run({}),   // Cloud-Lauf ohne Kostenangabe
    ])
    expect(c.unpricedRuns).toBe(1)
    expect(c.totalUsd).toBeCloseTo(0.002, 8)
    expect(formatCostCell(c)).toBe('≥ $0.0020')
  })

  it('gibt null statt 0, wenn kein Cloud-Lauf einen Preis hatte', () => {
    const c = summarizeCost([run({}), run({})])
    expect(c.totalUsd).toBeNull()
    expect(formatCostCell(c)).toBe('—')
  })

  it('kennzeichnet gerechnete Betraege, nicht aber abgerechnete', () => {
    expect(formatCostCell(summarizeCost([run({ costUsd: 0.05, costSource: 'computed' })]))).toBe('≈ $0.050')
    expect(formatCostCell(summarizeCost([run({ costUsd: 0.05, costSource: 'reported' })]))).toBe('$0.050')
  })

  it('mischt lokale und Cloud-Laeufe ohne die lokalen mitzuzaehlen', () => {
    const c = summarizeCost([run({ backend: 'ollama' }), run({ costUsd: 0.004, costSource: 'reported' })])
    expect(c.localRuns).toBe(1)
    expect(c.cloudRuns).toBe(1)
    expect(c.unpricedRuns).toBe(0)      // der lokale Lauf ist KEINE Luecke
    expect(formatCostCell(c)).toBe('$0.0040')
  })
})

describe('Sprachfaehige Kostenzelle', () => {
  it('nimmt das uebersetzte Wort fuer lokale Laeufe', () => {
    const lokal = summarizeCost([
      { at: 1, module: 'chat', model: 'm', backend: 'ollama', wallMs: 10 }
    ])
    expect(formatCostCell(lokal, { local: 'local' })).toBe('local')
    expect(formatCostCell(lokal)).toBe('lokal')
  })
})

// ─── Messgeschichte: Ablage-Regeln ───────────────────────────────────────────

import { isLlmRunMetrics, pruneLlmRuns, fromCloudResponse, TELEMETRY_RETENTION_DAYS, TELEMETRY_MAX_RUNS } from './llmTelemetry'

describe('runId am Aufruf', () => {
  it('nimmt fromOllamaResponse die Lauf-Kennung mit und lässt sie sonst weg', () => {
    const mit = fromOllamaResponse({}, { module: 'note-agent', model: 'm', wallMs: 1, at: 0, runId: 'run-1' })
    expect(mit.runId).toBe('run-1')
    const ohne = fromOllamaResponse({}, { module: 'chat', model: 'm', wallMs: 1, at: 0 })
    expect('runId' in ohne).toBe(false)
  })

  it('nimmt fromCloudResponse die Lauf-Kennung mit', () => {
    const mit = fromCloudResponse(null, { module: 'note-agent', model: 'm', wallMs: 1, at: 0, backend: 'openrouter', runId: 'run-2' })
    expect(mit.runId).toBe('run-2')
  })
})

describe('isLlmRunMetrics', () => {
  const gut: LlmRunMetrics = { at: 1, module: 'chat', model: 'm', backend: 'ollama', wallMs: 5 }

  it('nimmt einen vollständigen Eintrag an', () => {
    expect(isLlmRunMetrics(gut)).toBe(true)
    expect(isLlmRunMetrics({ ...gut, runId: 'r', promptTokens: 10, evalMs: 2.5, hiddenThinking: true, costUsd: 0, costSource: 'computed' })).toBe(true)
  })

  it('lehnt fehlende Pflichtfelder, unbekannte Backends und Nicht-Zahlen ab', () => {
    expect(isLlmRunMetrics(null)).toBe(false)
    expect(isLlmRunMetrics({ ...gut, at: undefined })).toBe(false)
    expect(isLlmRunMetrics({ ...gut, backend: 'wolke' })).toBe(false)
    expect(isLlmRunMetrics({ ...gut, wallMs: 'schnell' })).toBe(false)
    expect(isLlmRunMetrics({ ...gut, wallMs: NaN })).toBe(false)
    expect(isLlmRunMetrics({ ...gut, model: 7 })).toBe(false)
  })

  it('lehnt negative Zahlen und falsche Kostenherkunft ab — sonst wandern sie in Summen', () => {
    expect(isLlmRunMetrics({ ...gut, costUsd: -0.01 })).toBe(false)
    expect(isLlmRunMetrics({ ...gut, outputTokens: -3 })).toBe(false)
    expect(isLlmRunMetrics({ ...gut, costSource: 'geraten' })).toBe(false)
    expect(isLlmRunMetrics({ ...gut, runId: 12 })).toBe(false)
  })
})

describe('pruneLlmRuns', () => {
  const DAY = 86_400_000
  const now = 1_800_000_000_000

  it('behält frische Einträge und wirft alte weg', () => {
    const alt = run({ at: now - (TELEMETRY_RETENTION_DAYS + 1) * DAY })
    const grenze = run({ at: now - TELEMETRY_RETENTION_DAYS * DAY })
    const frisch = run({ at: now })
    expect(pruneLlmRuns([alt, grenze, frisch], now)).toEqual([grenze, frisch])
  })

  it('kappt auf die Obergrenze und behält die jüngsten', () => {
    const viele = Array.from({ length: TELEMETRY_MAX_RUNS + 3 }, (_, i) => run({ at: now - TELEMETRY_MAX_RUNS - 3 + i }))
    const kept = pruneLlmRuns(viele, now)
    expect(kept).toHaveLength(TELEMETRY_MAX_RUNS)
    expect(kept[kept.length - 1].at).toBe(now - 1)
  })
})

// ─── Verbrauch eines Laufs ───────────────────────────────────────────────────

import { summarizeRunCalls, isRunCallTotals } from './llmTelemetry'

describe('summarizeRunCalls', () => {
  it('summiert Token und lokale Rechenzeit über alle Aufrufe — die Summe, nicht der letzte', () => {
    const t = summarizeRunCalls([
      run({ promptTokens: 1000, outputTokens: 50, promptEvalMs: 500, evalMs: 1500 }),
      run({ promptTokens: 3000, outputTokens: 80, promptEvalMs: 900, evalMs: 2100 }),
      run({ promptTokens: 7000, outputTokens: 120, promptEvalMs: 1800, evalMs: 3000 }),
    ])
    expect(t.calls).toBe(3)
    expect(t.promptTokens).toBe(11000)
    expect(t.completionTokens).toBe(250)
    expect(t.computeMs).toBe(9800)
    expect(t.cloudCalls).toBe(0)
    expect(t.costReportedUsd).toBeUndefined()
  })

  it('hält gemeldete und gerechnete Kosten getrennt und zählt Aufrufe ohne Preis', () => {
    const t = summarizeRunCalls([
      run({ backend: 'openrouter', costUsd: 0.002, costSource: 'reported', promptTokens: 10, outputTokens: 5 }),
      run({ backend: 'llmbase', costUsd: 0.003, costSource: 'computed', promptTokens: 10, outputTokens: 5 }),
      run({ backend: 'llmbase', promptTokens: 10, outputTokens: 5 }),
    ])
    expect(t.cloudCalls).toBe(3)
    expect(t.costReportedUsd).toBe(0.002)
    expect(t.costComputedUsd).toBe(0.003)
    expect(t.unpricedCalls).toBe(1)
    // Cloud meldet keine Serverzeiten: keine Rechenzeit.
    expect(t.computeMs).toBeUndefined()
  })

  it('lässt Token-Felder weg, wenn kein Aufruf Token gemeldet hat, und zählt die Lücken sonst', () => {
    const ohne = summarizeRunCalls([run({}), run({})])
    expect(ohne.promptTokens).toBeUndefined()
    expect(ohne.callsWithoutTokens).toBe(2)
    const teils = summarizeRunCalls([run({ promptTokens: 5, outputTokens: 1 }), run({})])
    expect(teils.promptTokens).toBe(5)
    expect(teils.callsWithoutTokens).toBe(1)
  })

  it('liefert für null Aufrufe nur Nullzähler', () => {
    expect(summarizeRunCalls([])).toEqual({ calls: 0, callsWithoutTokens: 0, cloudCalls: 0 })
  })
})

describe('isRunCallTotals', () => {
  it('nimmt gültige Summen an und lehnt NaN, negative Zahlen und fehlende Zähler ab', () => {
    expect(isRunCallTotals({ calls: 2, callsWithoutTokens: 0, cloudCalls: 0 })).toBe(true)
    expect(isRunCallTotals({ calls: 2, callsWithoutTokens: 0, cloudCalls: 1, costReportedUsd: 0.1, unpricedCalls: 0 })).toBe(true)
    expect(isRunCallTotals({ calls: 2 })).toBe(false)
    expect(isRunCallTotals({ calls: NaN, callsWithoutTokens: 0, cloudCalls: 0 })).toBe(false)
    expect(isRunCallTotals({ calls: 1, callsWithoutTokens: 0, cloudCalls: 0, computeMs: -5 })).toBe(false)
    expect(isRunCallTotals(null)).toBe(false)
  })
})


// ─── Modulkatalog ────────────────────────────────────────────────────────────

import { LLM_MODULES, isLlmModuleId, moduleForAiAction } from './llmTelemetry'

describe('Modulkatalog', () => {
  it('enthält die fünf Namen der Kompatibilitätsmatrix, die einen Aufrufer haben', () => {
    for (const m of ['brain', 'task-extraction', 'mail-summary', 'smart-connections']) {
      expect(isLlmModuleId(m)).toBe(true)
    }
    // dashboard-snapshot hat seit 08/2026 keinen Aufrufer — bewusst nicht im Katalog.
    expect(isLlmModuleId('dashboard-snapshot')).toBe(false)
    expect(isLlmModuleId('test')).toBe(false)
    expect(isLlmModuleId(undefined)).toBe(false)
    expect(new Set(LLM_MODULES).size).toBe(LLM_MODULES.length)
  })

  it('übersetzt die Text-Aktionen der KI-Leiste — unbekannte Aktionen laufen als ai-bar', () => {
    expect(moduleForAiAction('translate')).toBe('translate')
    expect(moduleForAiAction('summarize')).toBe('summarize')
    expect(moduleForAiAction('ocr-cleanup')).toBe('vision-ocr')
    expect(moduleForAiAction('improve')).toBe('ai-bar')
    expect(moduleForAiAction('custom')).toBe('ai-bar')
    expect(moduleForAiAction('irgendwas')).toBe('ai-bar')
  })

  it('lehnt einen Eintrag mit fremdem Modul beim Lesen ab', () => {
    expect(isLlmRunMetrics({ at: 1, module: 'chat', model: 'm', backend: 'ollama', wallMs: 5 })).toBe(true)
    expect(isLlmRunMetrics({ at: 1, module: 'erfunden', model: 'm', backend: 'ollama', wallMs: 5 })).toBe(false)
  })
})
