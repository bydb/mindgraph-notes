import { describe, expect, it } from 'vitest'
import {
  parseModelPricing, parseCallUsage, callCostUsd, sumCalls, totalUsd,
  isComplete, formatUsd, formatPricing, type ModelPricing
} from './llmCost'

// Echte Werte aus den Live-Katalogen (abgerufen 27.08.2026).
const OPENROUTER_QWEN_FLASH = {
  prompt: '0.00000015', completion: '0.00000047',
  input_cache_read: '0.000000016', input_cache_write: '0.0000002'
}
const LLMBASE_GPT_OSS_120B = {
  prompt: '0.00000018', completion: '0.00000072', image: '0', request: '0',
  input_cache_read: '0.00000009', input_cache_write: '0', web_search: '0', internal_reasoning: '0'
}

describe('parseModelPricing', () => {
  it('rechnet Preis-je-Token in Preis-je-Million um', () => {
    // Der Fehler, der die alte Anzeige unlesbar machte: 0.00000015 sind $0,15/Mio.
    const p = parseModelPricing(OPENROUTER_QWEN_FLASH)!
    expect(p.inputPerMillion).toBeCloseTo(0.15, 6)
    expect(p.outputPerMillion).toBeCloseTo(0.47, 6)
    expect(p.cachedInputPerMillion).toBeCloseTo(0.016, 6)
  })

  it('liest den LLMBase-Katalog aus ?metadata=true', () => {
    const p = parseModelPricing(LLMBASE_GPT_OSS_120B)!
    expect(p.inputPerMillion).toBeCloseTo(0.18, 6)
    expect(p.outputPerMillion).toBeCloseTo(0.72, 6)
    expect(p.cachedInputPerMillion).toBeCloseTo(0.09, 6)
  })

  it('gibt null bei fehlenden oder kaputten Preisen', () => {
    expect(parseModelPricing(null)).toBeNull()
    expect(parseModelPricing({})).toBeNull()
    expect(parseModelPricing({ prompt: '0.1' })).toBeNull()
    expect(parseModelPricing({ prompt: 'kostenlos', completion: '0.1' })).toBeNull()
    expect(parseModelPricing({ prompt: '-0.1', completion: '0.1' })).toBeNull()
  })

  it('behandelt Gratis-Modelle als Preis 0, nicht als fehlend', () => {
    const p = parseModelPricing({ prompt: '0', completion: '0' })!
    expect(p.inputPerMillion).toBe(0)
    expect(formatPricing(p)).toBe('gratis')
  })
})

describe('parseCallUsage', () => {
  it('liest Token, Cache, Reasoning und gemeldete Kosten', () => {
    const u = parseCallUsage({
      prompt_tokens: 7000, completion_tokens: 250, total_tokens: 7250, cost: 0.0031,
      prompt_tokens_details: { cached_tokens: 4000 },
      completion_tokens_details: { reasoning_tokens: 900 }
    })!
    expect(u).toEqual({
      promptTokens: 7000, completionTokens: 250,
      cachedTokens: 4000, reasoningTokens: 900, reportedCostUsd: 0.0031
    })
  })

  it('gibt null, wenn gar kein usage-Block kam', () => {
    expect(parseCallUsage(undefined)).toBeNull()
    expect(parseCallUsage({})).toBeNull()
  })

  it('ignoriert unbrauchbare Werte statt sie als 0 zu übernehmen', () => {
    // Nicht gemessen ist nicht null — sonst stünde später eine erfundene 0 in der Summe.
    const u = parseCallUsage({ prompt_tokens: null, completion_tokens: 120, cost: 'gratis' })!
    expect(u.promptTokens).toBeUndefined()
    expect(u.reportedCostUsd).toBeUndefined()
    expect(u.completionTokens).toBe(120)
  })
})

describe('callCostUsd', () => {
  const pricing = parseModelPricing(OPENROUTER_QWEN_FLASH)!

  it('nimmt den gemeldeten Betrag als Abrechnungswahrheit', () => {
    const c = callCostUsd({ promptTokens: 7000, completionTokens: 250, reportedCostUsd: 0.009 }, pricing)!
    expect(c.source).toBe('reported')
    expect(c.usd).toBe(0.009)   // NICHT die eigene Rechnung, obwohl Preise vorliegen
  })

  it('rechnet aus Token und Preis, wenn der Anbieter nichts meldet', () => {
    const c = callCostUsd({ promptTokens: 1e6, completionTokens: 1e6 }, pricing)!
    expect(c.source).toBe('computed')
    expect(c.usd).toBeCloseTo(0.62, 6)
  })

  it('rechnet zwischengespeicherte Eingabe zum Cache-Preis', () => {
    const c = callCostUsd({ promptTokens: 1e6, cachedTokens: 1e6, completionTokens: 0 }, pricing)!
    expect(c.usd).toBeCloseTo(0.016, 6)
  })

  it('bleibt beim vollen Preis, wenn kein Cache-Preis bekannt ist', () => {
    const ohneCache: ModelPricing = { inputPerMillion: 1, outputPerMillion: 2 }
    const c = callCostUsd({ promptTokens: 1e6, cachedTokens: 1e6 }, ohneCache)!
    expect(c.usd).toBeCloseTo(1, 6)
  })

  it('lässt mehr Cache- als Prompt-Token nicht negativ werden', () => {
    const c = callCostUsd({ promptTokens: 1000, cachedTokens: 999999 }, pricing)!
    expect(c.usd).toBeGreaterThanOrEqual(0)
  })

  it('gibt null statt 0, wenn nichts bestimmbar ist', () => {
    expect(callCostUsd(null, pricing)).toBeNull()
    expect(callCostUsd({ promptTokens: 100 }, null)).toBeNull()
    expect(callCostUsd({}, pricing)).toBeNull()
  })
})

describe('sumCalls — ein Agenten-Lauf', () => {
  const pricing = parseModelPricing(OPENROUTER_QWEN_FLASH)!

  it('summiert den wachsenden Prompt über alle Iterationen', () => {
    // Kern der Kostenfrage: der Loop schickt jedes Mal die ganze Konversation neu.
    const calls = [2500, 4200, 5800, 7000].map(promptTokens => ({
      usage: { promptTokens, completionTokens: 200 }, pricing
    }))
    const sum = sumCalls(calls)
    expect(sum.promptTokens).toBe(19500)      // nicht 7000 (nur der letzte Aufruf)
    expect(sum.completionTokens).toBe(800)
    expect(sum.computedCalls).toBe(4)
    expect(totalUsd(sum)).toBeCloseTo(19500 / 1e6 * 0.15 + 800 / 1e6 * 0.47, 8)
  })

  it('hält gemeldete und gerechnete Beträge getrennt', () => {
    const sum = sumCalls([
      { usage: { promptTokens: 1000, reportedCostUsd: 0.002 }, pricing },
      { usage: { promptTokens: 1e6, completionTokens: 0 }, pricing },
    ])
    expect(sum.reportedUsd).toBeCloseTo(0.002, 8)
    expect(sum.computedUsd).toBeCloseTo(0.15, 8)
    expect(sum.reportedCalls).toBe(1)
    expect(sum.computedCalls).toBe(1)
    expect(totalUsd(sum)).toBeCloseTo(0.152, 8)
  })

  it('zählt Aufrufe ohne Preis, statt sie als kostenlos zu verbuchen', () => {
    const sum = sumCalls([
      { usage: { promptTokens: 1e6, completionTokens: 0 }, pricing },
      { usage: null, pricing },
      { usage: { promptTokens: 500 }, pricing: null },
    ])
    expect(sum.unpricedCalls).toBe(2)
    expect(isComplete(sum)).toBe(false)
    expect(totalUsd(sum)).toBeCloseTo(0.15, 8)   // Untergrenze, nicht Gesamtbetrag
  })

  it('meldet null statt 0, wenn kein einziger Aufruf einen Preis hatte', () => {
    const sum = sumCalls([{ usage: null }, { usage: null }])
    expect(totalUsd(sum)).toBeNull()
    expect(isComplete(sum)).toBe(false)
  })

  it('ist bei lückenloser Erfassung vollständig', () => {
    const sum = sumCalls([{ usage: { promptTokens: 100, reportedCostUsd: 0.001 } }])
    expect(isComplete(sum)).toBe(true)
  })
})

describe('Anzeige', () => {
  it('zeigt Bruchteile eines Cents statt $0.00', () => {
    expect(formatUsd(0.00093)).toBe('$0.0009')
    expect(formatUsd(0.052)).toBe('$0.052')
    expect(formatUsd(10.56)).toBe('$10.56')
    expect(formatUsd(0)).toBe('$0')
    expect(formatUsd(null)).toBe('—')
  })

  it('macht das Preis-Etikett des Pickers lesbar', () => {
    // Vorher stand dort "0.00000015$/tok".
    expect(formatPricing(parseModelPricing(OPENROUTER_QWEN_FLASH))).toBe('$0.15 / $0.47 je 1 Mio.')
    expect(formatPricing(null)).toBe('')
  })
})

describe('Kleinstbetraege', () => {
  it('unterscheidet echte Null von einem winzigen Betrag', () => {
    // In der laufenden App zeigte ein OpenRouter-Verbindungstest '$0.0000' — das
    // las sich wie null, war aber ein realer Betrag unterhalb der vierten Stelle.
    expect(formatUsd(0)).toBe('$0')
    expect(formatUsd(0.000002)).toBe('<$0.0001')
    expect(formatUsd(0.00009)).toBe('<$0.0001')
    expect(formatUsd(0.0001)).toBe('$0.0001')
    expect(formatUsd(0.0005)).toBe('$0.0005')
  })
})
