import { describe, it, expect } from 'vitest'
import { lexicalTokens, lexicalIndexFor, lexicalOverlap, chunkLexicalText } from './lexical'
import type { VaultIndexContainer } from './vaultIndex'

const container = {
  meta: { chunks: [
    { fileRel: 'a/Neubewertung Stelle.md', heading: '', text: 'Die Stellenbewertung wurde im ersten Entwurf erstellt.' },
    { fileRel: 'b/Tagesnotiz.md', heading: 'Heute im Fokus', text: 'Medienzentrum Termin Medienzentrum Team' },
    { fileRel: 'c/Andere.md', heading: '', text: 'Medienzentrum Fortbildung' }
  ] }
} as unknown as VaultIndexContainer

describe('lexical (seltenheitsgewichteter Wortabgleich)', () => {
  it('Tokens: ab drei Zeichen, klein, ohne Stoppwörter', () => {
    expect(lexicalTokens('Was steht in der Notiz zur Neubewertung?')).toEqual(['notiz', 'neubewertung'])
  })
  it('seltene Wörter wiegen mehr als häufige', () => {
    const idx = lexicalIndexFor(container)
    const q = 'Neubewertung im Medienzentrum'
    const a = lexicalOverlap(idx, q, chunkLexicalText('a/Neubewertung Stelle.md', '', 'Die Stellenbewertung wurde im ersten Entwurf erstellt.'))
    const c = lexicalOverlap(idx, q, chunkLexicalText('c/Andere.md', '', 'Medienzentrum Fortbildung'))
    expect(a).toBeGreaterThan(c) // „Neubewertung" (df 1) > „Medienzentrum" (df 2)
    expect(lexicalOverlap(idx, q, 'nichts davon')).toBe(0)
  })
  it('Index wird pro Container gecacht', () => {
    expect(lexicalIndexFor(container)).toBe(lexicalIndexFor(container))
  })
})
