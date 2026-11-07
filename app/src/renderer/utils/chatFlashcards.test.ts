import { describe, expect, it } from 'vitest'
import { chatAnswerCardSource, chatCardSourceLabel } from './chatFlashcards'

describe('chatAnswerCardSource', () => {
  it('Frage davor, Quellennummern und Merkkasten-Zeichen raus', () => {
    const src = chatAnswerCardSource('Ursachen der Revolution?', 'Der Dritte Stand trug die Lasten [1][2].\n\n> **Merke:** Viele Ursachen.')
    expect(src).toBe('Frage: Ursachen der Revolution?\n\nDer Dritte Stand trug die Lasten .\n\n**Merke:** Viele Ursachen.')
  })
  it('kappt sehr lange Antworten', () => {
    expect(chatAnswerCardSource('q', 'x'.repeat(20_000)).length).toBe(12_000)
  })
})

describe('chatCardSourceLabel', () => {
  it('ohne Schrägstrich, gekürzt', () => {
    const l = chatCardSourceLabel('Was ist 1789/1790 passiert und warum war das für die Revolution in Frankreich so wichtig?')
    expect(l).not.toContain('/')
    expect(l.startsWith('Petrol-Chat – Was ist 1789 1790')).toBe(true)
    expect(l.length).toBeLessThan(80)
  })
})
