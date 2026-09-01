// Das Anzeige-Label der Cloud-Modelle ist der einzige Ort, an dem der Nutzer sieht,
// welches Modell gerade arbeitet. Wird es abgeschnitten, ist die Angabe wertlos —
// „OpenRouter · deepseek/deepseek…“ sagt nichts. Deshalb hier festgehalten, wann der
// Organisations-Präfix fliegt und wann nicht.
import { describe, it, expect } from 'vitest'
import { shortenCloudModelId } from './llmBackend'

describe('shortenCloudModelId', () => {
  it('entfernt den doppelten Anbieter-Präfix', () => {
    expect(shortenCloudModelId('deepseek/deepseek-v4-flash')).toBe('deepseek-v4-flash')
    expect(shortenCloudModelId('qwen/qwen3-30b')).toBe('qwen3-30b')
  })

  it('behält den Präfix, wenn er echte Information trägt', () => {
    expect(shortenCloudModelId('openai/gpt-5')).toBe('openai/gpt-5')
    expect(shortenCloudModelId('google/gemini-3-pro')).toBe('google/gemini-3-pro')
  })

  it('lässt IDs ohne Präfix unangetastet', () => {
    expect(shortenCloudModelId('qwen3.8:27b-mlx')).toBe('qwen3.8:27b-mlx')
  })

  it('ignoriert Groß- und Kleinschreibung und umgebende Leerzeichen', () => {
    expect(shortenCloudModelId('  DeepSeek/deepseek-chat  ')).toBe('deepseek-chat')
  })

  it('lässt einen zweiten Schrägstrich im Namen stehen', () => {
    expect(shortenCloudModelId('mistralai/mistral-7b/v3')).toBe('mistralai/mistral-7b/v3')
  })
})
