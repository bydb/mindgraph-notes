import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
const { modelMemoryKey, parseModelMemoryStore } = await import('./modelMemory')

describe('Ablage der Speichermessung (agy F04/F10)', () => {
  it('name und name:latest sind ein Eintrag', () => {
    expect(modelMemoryKey('qwen3.8')).toBe('qwen3.8:latest')
    expect(modelMemoryKey(' qwen3.8:27b-mlx ')).toBe('qwen3.8:27b-mlx')
  })

  it('liest beide Fassungen und verwirft Unbrauchbares, statt zu werfen', () => {
    const store = parseModelMemoryStore(JSON.stringify({
      'a:1': [{ tokens: 10, bytes: 5 }, { tokens: 'x', bytes: 5 }, null],
      b: { digest: 'abc', samples: [{ tokens: 20, bytes: 7 }, { tokens: -1, bytes: 7 }] },
      c: 'kaputt',
      d: { samples: 'kaputt' }
    }))
    expect(store).toEqual({
      'a:1': { digest: '', samples: [{ tokens: 10, bytes: 5 }] },
      'b:latest': { digest: 'abc', samples: [{ tokens: 20, bytes: 7 }] }
    })
    expect(parseModelMemoryStore('kein json')).toEqual({})
    expect(parseModelMemoryStore('[1,2]')).toEqual({})
  })
})
