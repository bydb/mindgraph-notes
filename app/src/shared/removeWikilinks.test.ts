import { describe, expect, it } from 'vitest'
import { removeWikilinksTo } from './removeWikilinks'

describe('removeWikilinksTo', () => {
  const isB = (t: string) => ['B', 'Ordner/B', 'Zusammenfassung'].includes(t)
  it('entfernt alle Schreibweisen, die auf das Ziel auflösen', () => {
    const src = 'a [[B]] b [[Ordner/B|Alias]] c [[Zusammenfassung#Teil]] d [[C]]'
    expect(removeWikilinksTo(src, isB)).toBe('a  b  c  d [[C]]')
  })
  it('lässt Einbettungen stehen', () => {
    expect(removeWikilinksTo('![[B]] und [[B]]', isB)).toBe('![[B]] und ')
  })
})
