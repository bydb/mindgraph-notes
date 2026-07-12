import { describe, it, expect } from 'vitest'
import { splitTextIntoChunks } from './textChunking'

const para = (n: number, len = 400): string => `Absatz ${n} ${'x'.repeat(len)}.`

describe('splitTextIntoChunks', () => {
  it('kurzer Text bleibt ein Chunk', () => {
    expect(splitTextIntoChunks('Hallo Welt', 100)).toEqual(['Hallo Welt'])
    expect(splitTextIntoChunks('', 100)).toEqual([])
  })

  it('verliert nie ein Zeichen (join === Original)', () => {
    const text = Array.from({ length: 40 }, (_, i) => para(i)).join('\n\n')
    const chunks = splitTextIntoChunks(text, 3000)
    expect(chunks.join('')).toBe(text)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('bevorzugt Absatzgrenzen', () => {
    const text = `${para(1, 2000)}\n\n${para(2, 2000)}\n\n${para(3, 2000)}`
    const chunks = splitTextIntoChunks(text, 2500)
    expect(chunks.join('')).toBe(text)
    // Jeder Chunk endet an einer Absatzgrenze (außer dem letzten)
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.endsWith('\n\n')).toBe(true)
    }
  })

  it('hält die Maximalgröße ein', () => {
    const text = Array.from({ length: 30 }, (_, i) => para(i, 800)).join('\n\n')
    for (const chunk of splitTextIntoChunks(text, 2000)) {
      expect(chunk.length).toBeLessThanOrEqual(2000)
    }
  })

  it('bricht Riesen-Absätze an Zeilen und Sätzen', () => {
    const sentences = Array.from({ length: 50 }, (_, i) => `Satz ${i} mit etwas Inhalt drin.`).join(' ')
    const chunks = splitTextIntoChunks(sentences, 300)
    expect(chunks.join('')).toBe(sentences)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(300)
  })

  it('harter Schnitt als letzte Instanz (keine Grenzen vorhanden)', () => {
    const blob = 'A'.repeat(1000)
    const chunks = splitTextIntoChunks(blob, 300)
    expect(chunks.join('')).toBe(blob)
    expect(chunks.length).toBe(4)
  })
})
