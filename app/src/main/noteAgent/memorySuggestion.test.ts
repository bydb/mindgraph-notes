import { describe, it, expect } from 'vitest'
import { parseSuggestion } from './memorySuggestion'

describe('parseSuggestion', () => {
  it('nimmt die erste nicht-leere Zeile und strippt Anführungszeichen/Bullets', () => {
    expect(parseSuggestion('"Arbeitsblätter immer mit Lösungsteil am Ende erstellen."')).toBe(
      'Arbeitsblätter immer mit Lösungsteil am Ende erstellen.'
    )
    expect(parseSuggestion('- Regel ohne Bullet zurückgeben')).toBe('Regel ohne Bullet zurückgeben')
    expect(parseSuggestion('\n\nErste echte Zeile\nZweite Zeile')).toBe('Erste echte Zeile')
  })

  it('entfernt Think-Blöcke von Thinking-Modellen', () => {
    expect(parseSuggestion('<think>lange Überlegung\nmehrzeilig</think>\nDie eigentliche Regel')).toBe(
      'Die eigentliche Regel'
    )
  })

  it('liefert null bei KEINE, Leerantwort und Geschwätz', () => {
    expect(parseSuggestion('KEINE')).toBeNull()
    expect(parseSuggestion('keine')).toBeNull()
    expect(parseSuggestion('')).toBeNull()
    expect(parseSuggestion('   \n  ')).toBeNull()
    expect(parseSuggestion('x'.repeat(200))).toBeNull()
  })

  it('typografische Anführungszeichen werden gestrippt', () => {
    expect(parseSuggestion('„Regel in deutschen Anführungszeichen“')).toBe(
      'Regel in deutschen Anführungszeichen'
    )
  })
})
