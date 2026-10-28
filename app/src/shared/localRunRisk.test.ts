import { describe, it, expect } from 'vitest'
import { assessLocalRunRisk } from './localRunRisk'
import { getModelRamGb } from './modelCompatibility'

describe('assessLocalRunRisk', () => {
  it('meldet qwen3.5:4b auf 8 GB als knapp (Anlass: Rechner fror beim Mail-Entwurf ein)', () => {
    expect(getModelRamGb('qwen3.5:4b')).toBe(4)
    expect(assessLocalRunRisk('qwen3.5:4b', 8).risk).toBe('tight')
  })

  it('lässt qwen3.5:4b auf 16 GB in Ruhe', () => {
    expect(assessLocalRunRisk('qwen3.5:4b', 16).risk).toBe('ok')
  })

  it('meldet ein Modell, das nicht in den RAM passt, als zu groß', () => {
    expect(assessLocalRunRisk('qwen3.6:27b-mlx', 8).risk).toBe('too-big')
  })

  it('sagt ohne bekannte RAM-Größe oder Modellgröße nichts', () => {
    expect(assessLocalRunRisk('qwen3.5:4b', null).risk).toBe('ok')
    expect(assessLocalRunRisk('voellig-unbekannt', 8).risk).toBe('ok')
  })
})
