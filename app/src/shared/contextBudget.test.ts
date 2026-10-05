import { describe, expect, it } from 'vitest'
import {
  addToBudget, createContextBudget, estimateTokens, hasRoomForNextCall, isReadLocked, linesFittingTokens,
  maxToolResultTokens, recordServerPromptTokens, remainingForInput, resolveContextWindow, usedTokens,
  ASSUMED_CONTEXT_WINDOW
} from './contextBudget'

// Messwerte vom 05.10.2026 (Ollama prompt_eval_count, qwen3.6/qwen3.8/gemma4) — die Schätzung
// muss für jede Inhaltsart MINDESTENS so hoch liegen wie die Messung.
describe('estimateTokens', () => {
  const paths = Array.from({ length: 84 }, (_, i) => `- 2026/${String((i % 12) + 1).padStart(2, '0')}/2026-01-${String((i % 28) + 1).padStart(2, '0')}.md (md, 2 KB, geändert 2026-01-01)`).join('\n')
  const table = Array.from({ length: 300 }, (_, i) => `| ${i} | Grundschule Musterstadt ${i} | 06${String(i).padStart(4, '0')} | 12,${i % 10} | ja |`).join('\n')

  it('schätzt Pfadlisten nicht zu niedrig (gemessen 1,33 Zeichen/Token)', () => {
    expect(estimateTokens(paths)).toBeGreaterThanOrEqual(Math.ceil(paths.length / 1.33))
  })

  it('schätzt Tabellen nicht zu niedrig (gemessen 1,86 Zeichen/Token)', () => {
    expect(estimateTokens(table)).toBeGreaterThanOrEqual(Math.ceil(table.length / 1.86))
  })

  it('schätzt Fließtext nicht zu niedrig (gemessen ~3,4 Zeichen/Token), aber auch nicht wie eine Tabelle', () => {
    const prose = 'Die Robotik-AG gewinnt den zweiten Platz beim Regionalwettbewerb. Der Linienfolger fährt zum ersten Mal die ganze Strecke, und alle sieben Schüler sind dabei. '.repeat(40)
    const est = estimateTokens(prose)
    expect(est).toBeGreaterThanOrEqual(Math.ceil(prose.length / 3.4))
    expect(est).toBeLessThan(prose.length / 2)
  })

  it('leerer Text kostet nichts', () => {
    expect(estimateTokens('')).toBe(0)
  })
})

describe('resolveContextWindow', () => {
  it('Ollama: das selbst gesetzte num_ctx', () => {
    expect(resolveContextWindow('ollama', 65_536)).toEqual({ tokens: 65_536, source: 'num_ctx' })
    expect(resolveContextWindow(undefined, 32_768)).toEqual({ tokens: 32_768, source: 'num_ctx' })
  })

  it('LM Studio und Cloud: vorsichtig angenommen — num_ctx wirkt dort nicht', () => {
    for (const backend of ['lmstudio', 'openrouter', 'llmbase']) {
      expect(resolveContextWindow(backend, 131_072)).toEqual({ tokens: ASSUMED_CONTEXT_WINDOW, source: 'assumed' })
    }
  })
})

describe('Budget-Verlauf', () => {
  it('ersetzt Schätzungen durch die Server-Meldung und rechnet danach weiter', () => {
    const b = createContextBudget(32_768, 8_192)
    addToBudget(b, 'x'.repeat(2900)) // ~1000 Token geschätzt
    expect(usedTokens(b)).toBe(1000)
    recordServerPromptTokens(b, 1500)
    expect(usedTokens(b)).toBe(1500)
    addToBudget(b, 'x'.repeat(290))
    expect(usedTokens(b)).toBe(1600)
    recordServerPromptTokens(b, undefined) // Backend meldet nichts: Schätzung bleibt
    expect(usedTokens(b)).toBe(1600)
  })

  it('sperrt Lesen, sobald nur noch die Ausgabe-Reserve frei ist', () => {
    const b = createContextBudget(32_768, 8_192)
    recordServerPromptTokens(b, 24_000)
    expect(isReadLocked(b)).toBe(false)
    expect(remainingForInput(b)).toBe(576)
    expect(maxToolResultTokens(b)).toBe(576)
    recordServerPromptTokens(b, 24_576)
    expect(isReadLocked(b)).toBe(true)
    expect(maxToolResultTokens(b)).toBe(0)
  })

  it('deckelt ein einzelnes Werkzeugergebnis auf ein Viertel des Fensters', () => {
    const b = createContextBudget(32_768, 8_192)
    recordServerPromptTokens(b, 2_000)
    expect(maxToolResultTokens(b)).toBe(8_192)
  })

  it('stoppt vor dem Senden, wenn keine Antwort mehr hineinpasst', () => {
    const b = createContextBudget(32_768, 8_192)
    recordServerPromptTokens(b, 30_000)
    expect(hasRoomForNextCall(b)).toBe(true)
    recordServerPromptTokens(b, 31_500)
    expect(hasRoomForNextCall(b)).toBe(false)
  })

  it('Ausgabe-Reserve höchstens das halbe Fenster', () => {
    expect(createContextBudget(4_096, 8_192).outputReserve).toBe(2_048)
  })
})

describe('linesFittingTokens', () => {
  it('übernimmt Zeilen von vorne, solange sie passen', () => {
    const lines = Array.from({ length: 10 }, () => 'x'.repeat(29)) // je 10 Token + 1
    expect(linesFittingTokens(lines, 33)).toBe(3)
    expect(linesFittingTokens(lines, 1_000)).toBe(10)
    expect(linesFittingTokens(lines, 0)).toBe(0)
  })
})
