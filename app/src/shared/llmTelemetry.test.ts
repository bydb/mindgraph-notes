import { describe, it, expect } from 'vitest'
import {
  fromOllamaResponse, outputTokensPerSecond, promptTokensPerSecond,
  isColdStart, summarize, median, nsToMs, formatTps, type LlmRunMetrics
} from './llmTelemetry'

function run(partial: Partial<LlmRunMetrics>): LlmRunMetrics {
  return { at: 0, module: 'test', model: 'm', backend: 'ollama', wallMs: 1000, ...partial }
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
    const m = fromOllamaResponse({ eval_count: 98, eval_duration: 30_000_000_000 }, { module: 'chat', model: 'm', wallMs: 30_000, at: 0, hiddenThinking: true })
    expect(m.hiddenThinking).toBe(true)
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
