import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
const { modelMemoryKey, nextModelMemoryEntry, parseModelMemoryStore, usableModelMemory } = await import('./modelMemory')

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

  const GB = 1024 ** 3
  const mlx = { name: 'qwen3.8:27b-mlx', size: 18 * GB, digest: 'neu', details: { format: 'safetensors' } }

  it('nimmt ein Paar nur auf, wenn genau dieses eine Modell geladen und kein GGUF ist (agy F04/F18)', () => {
    expect(nextModelMemoryEntry(undefined, [mlx], 'qwen3.8:27b-mlx', 7000)).toEqual({ digest: 'neu', samples: [{ tokens: 7000, bytes: 18 * GB }] })
    // zwei Modelle geladen, ein anderes Modell, GGUF in beliebiger Schreibweise, keine Größe
    expect(nextModelMemoryEntry(undefined, [mlx, { name: 'bge-m3:latest', size: GB }], 'qwen3.8:27b-mlx', 7000)).toBeNull()
    expect(nextModelMemoryEntry(undefined, [mlx], 'qwen3.5:4b', 7000)).toBeNull()
    expect(nextModelMemoryEntry(undefined, [{ ...mlx, details: { format: 'GGUF' } }], 'qwen3.8:27b-mlx', 7000)).toBeNull()
    expect(nextModelMemoryEntry(undefined, [{ ...mlx, size: 0 }], 'qwen3.8:27b-mlx', 7000)).toBeNull()
    expect(nextModelMemoryEntry(undefined, [mlx], 'qwen3.8:27b-mlx', 0)).toBeNull()
  })

  it('ein anderer Digest beginnt von vorn; ein leerer (alte Ablage) wird übernommen', () => {
    const old = [{ tokens: 1000, bytes: 17 * GB }]
    expect(nextModelMemoryEntry({ digest: 'alt', samples: old }, [mlx], 'qwen3.8:27b-mlx', 7000)?.samples).toEqual([{ tokens: 7000, bytes: 18 * GB }])
    expect(nextModelMemoryEntry({ digest: '', samples: old }, [mlx], 'qwen3.8:27b-mlx', 7000)).toEqual({ digest: 'neu', samples: [...old, { tokens: 7000, bytes: 18 * GB }] })
    expect(nextModelMemoryEntry({ digest: 'neu', samples: old }, [mlx], 'qwen3.8:27b-mlx', 7000)?.samples).toHaveLength(2)
  })

  it('abgelegte Paare gelten nur für das Modell, wie es jetzt installiert ist (agy F18)', () => {
    const entry = { digest: 'alt', samples: [{ tokens: 1000, bytes: 17 * GB }] }
    expect(usableModelMemory(entry, { digest: 'alt', details: { format: 'safetensors' } })).toEqual({ samples: entry.samples, stale: false })
    // ersetzt (ollama pull) → verwerfen und löschen
    expect(usableModelMemory(entry, { digest: 'neu' })).toEqual({ samples: null, stale: true })
    // GGUF-Paare aus der ersten Fassung → verwerfen und löschen
    expect(usableModelMemory({ ...entry, digest: '' }, { digest: 'x', details: { format: 'gguf' } })).toEqual({ samples: null, stale: true })
    // nicht nachprüfbar (Ollama nennt das Modell nicht): gilt nicht, bleibt aber liegen
    expect(usableModelMemory(entry, null)).toEqual({ samples: null, stale: false })
    expect(usableModelMemory(undefined, mlx)).toEqual({ samples: null, stale: false })
    // alte Ablage ohne Digest: gilt, bis der nächste Aufruf sie bindet
    expect(usableModelMemory({ ...entry, digest: '' }, { digest: 'neu' }).samples).toEqual(entry.samples)
  })
})
