import { describe, expect, it } from 'vitest'
import { loadedModelFromPs } from './localContext'

describe('loadedModelFromPs', () => {
  const ps = { models: [
    { name: 'qwen3.8:27b-mlx', model: 'qwen3.8:27b-mlx', size: 22_000_000_000, size_vram: 22_000_000_000, context_length: 65_536 },
    { name: 'bge-m3:latest', model: 'bge-m3:latest', size: 1_200_000_000 }
  ] }
  it('findet das Modell mit Speicher und Fenster', () => {
    expect(loadedModelFromPs(ps, 'qwen3.8:27b-mlx')).toEqual({ sizeBytes: 22_000_000_000, vramBytes: 22_000_000_000, contextLength: 65_536 })
  })
  it('ergänzt :latest und kommt ohne Fensterangabe aus', () => {
    expect(loadedModelFromPs(ps, 'bge-m3')).toEqual({ sizeBytes: 1_200_000_000, vramBytes: 0, contextLength: null })
  })
  it('meldet nicht Geladenes und Unlesbares als null', () => {
    expect(loadedModelFromPs(ps, 'gemma4')).toBeNull()
    expect(loadedModelFromPs(null, 'x')).toBeNull()
    expect(loadedModelFromPs({ models: 'nein' }, 'x')).toBeNull()
  })
})
