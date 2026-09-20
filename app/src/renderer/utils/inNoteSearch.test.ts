import { describe, it, expect } from 'vitest'
import { findMatches, locateOffset } from './inNoteSearch'

describe('findMatches', () => {
  it('findet alle Stellen ohne Rücksicht auf Groß-/Kleinschreibung, ohne Überlappung', () => {
    expect(findMatches('Neubewertung der Stelle, neubewertung erneut', 'Neubewertung')).toEqual([[0, 12], [25, 37]])
    expect(findMatches('aaaa', 'aa')).toEqual([[0, 2], [2, 4]])
  })
  it('kurze und leere Eingaben liefern nichts (sonst markiert jedes Zeichen)', () => {
    expect(findMatches('abc', 'a')).toEqual([])
    expect(findMatches('abc', '   ')).toEqual([])
    expect(findMatches('abc', 'xy')).toEqual([])
  })
  it('deckelt bei sehr vielen Treffern', () => {
    expect(findMatches('ab'.repeat(1000), 'ab')).toHaveLength(500)
  })
})

describe('locateOffset', () => {
  const pieces = [{ length: 5 }, { length: 3 }, { length: 4 }] // 0–5 | 5–8 | 8–12
  it('bildet Offsets auf Knoten ab, Knotengrenze gehört zum vorherigen Knoten', () => {
    expect(locateOffset(pieces, 0)).toEqual({ index: 0, offset: 0 })
    expect(locateOffset(pieces, 5)).toEqual({ index: 0, offset: 5 })
    expect(locateOffset(pieces, 6)).toEqual({ index: 1, offset: 1 })
    expect(locateOffset(pieces, 12)).toEqual({ index: 2, offset: 4 })
  })
  it('hinter dem Ende: null', () => {
    expect(locateOffset(pieces, 13)).toBeNull()
    expect(locateOffset([], 0)).toBeNull()
  })
})
