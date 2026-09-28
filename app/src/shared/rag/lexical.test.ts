import { describe, it, expect } from 'vitest'
import { lexicalTokens, lexicalIndexFor, lexicalOverlap, lexicalQueryTokens, chunkLexicalText } from './lexical'
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

describe('Varianten (A/B 25.09.2026, seit dem Standard)', () => {
  const idx = { df: new Map<string, number>(), docCount: 100 }

  it('ohne Füllwörter: Auftragswörter der Frage fallen weg, Inhaltswörter bleiben', () => {
    const q = 'schaue dir bitte mal die Kommunikation zur Lizenzverlängerung an gebe mir eine Zusammenfassung'
    expect(lexicalQueryTokens(q, {})).toContain('schaue')
    expect(lexicalQueryTokens(q)).toEqual(['kommunikation', 'lizenzverlängerung'])
  })

  it('Komposita: „Lizenzverlängerung“ trifft „Verlängerung“ zur Hälfte, und umgekehrt', () => {
    expect(lexicalOverlap(idx, 'Lizenzverlängerung', 'Verlängerung des Angebots', {})).toBe(0)
    expect(lexicalOverlap(idx, 'Lizenzverlängerung', 'Verlängerung des Angebots', { compoundHeads: true })).toBeCloseTo(0.5)
    expect(lexicalOverlap(idx, 'Verlängerung', 'die Lizenzverlängerung', { compoundHeads: true })).toBeCloseTo(0.5)
    expect(lexicalOverlap(idx, 'Lizenzverlängerung', 'Lizenzverlängerung', { compoundHeads: true })).toBe(1)
  })

  it('Komposita: kurze Wortenden zählen nicht (sonst träfe „Tagung“ jedes „…ung“)', () => {
    expect(lexicalOverlap(idx, 'Lizenzverlängerung', 'Rung', { compoundHeads: true })).toBe(0)
    expect(lexicalOverlap(idx, 'Mitgliederversammlung', 'Lizenz', { compoundHeads: true })).toBe(0)
  })
})
