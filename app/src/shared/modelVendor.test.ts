import { describe, it, expect } from 'vitest'
import { getModelVendor } from './modelCompatibility'

describe('getModelVendor', () => {
  const cases: Array<[string, string]> = [
    ['qwen3.6:27b-mlx', 'qwen'],
    ['qwen3.5:4b', 'qwen'],
    ['qwq:32b', 'qwen'],
    ['gemma4:latest', 'gemma'],
    ['gemma4:12b-mlx', 'gemma'],
    ['mistral-nemo:latest', 'mistral'],
    ['ministral-3:8b', 'mistral'],
    ['mixtral:8x7b', 'mistral'],
    ['llama3.1:8b', 'llama'],
    ['codellama:13b', 'llama'],
    ['phi-4:latest', 'phi'],
    ['deepseek-r1:14b', 'deepseek'],
    ['gpt-oss:120b-cloud', 'openai'],
    ['granite3.2:8b', 'granite'],
    ['command-r:35b', 'cohere'],
    ['bge-m3:latest', 'bge'],
    ['nomic-embed-text:latest', 'nomic'],
  ]

  it.each(cases)('maps %s → %s', (model, vendorId) => {
    expect(getModelVendor(model).id).toBe(vendorId)
  })

  it('falls back to generic for unknown / empty', () => {
    expect(getModelVendor('some-random-model:1b').id).toBe('generic')
    expect(getModelVendor('').id).toBe('generic')
  })
})
