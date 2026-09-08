import { describe, it, expect } from 'vitest'
import { stripLeadingSubjectLines, reviewNoteTitle } from './runner'

describe('stripLeadingSubjectLines', () => {
  it('entfernt eine führende Betreff-Zeile', () => {
    expect(stripLeadingSubjectLines('Betreff: Mahnung\n\nSehr geehrte Frau K,')).toBe('Sehr geehrte Frau K,')
  })
  it('entfernt mehrere Betreff-Zeilen hintereinander (Auslöser + Modell), auch fett', () => {
    expect(stripLeadingSubjectLines('Betreff: A\n\n**Betreff:** B\nText')).toBe('Text')
  })
  it('lässt Betreff-Zeilen mitten im Text stehen', () => {
    expect(stripLeadingSubjectLines('Hallo\nBetreff: nicht anfassen')).toBe('Hallo\nBetreff: nicht anfassen')
  })
})

describe('reviewNoteTitle', () => {
  it('bevorzugt den Workflow-Namen', () => {
    expect(reviewNoteTitle('irgendein Text', 'Neue Antwort zusammenfassen')).toBe('Zur Prüfung – Neue Antwort zusammenfassen')
  })
  it('nimmt sonst die erste Zeile ohne Markdown-Auszeichnung', () => {
    expect(reviewNoteTitle('**Termin-Prüfnotiz:**\n\n* Anlass: X')).toBe('Zur Prüfung – Termin-Prüfnotiz')
  })
  it('lässt keine Doppelpunkte im Titel (Dateiname)', () => {
    expect(reviewNoteTitle('Aula bis 16:30 Uhr frei')).toBe('Zur Prüfung – Aula bis 16 30 Uhr frei')
  })
  it('deckelt lange Zeilen', () => {
    const t = reviewNoteTitle('a'.repeat(100))
    expect(t.length).toBeLessThanOrEqual('Zur Prüfung: '.length + 60)
    expect(t.endsWith('…')).toBe(true)
  })
  it('hat einen Fallback bei leerem Text', () => {
    expect(reviewNoteTitle('   \n')).toBe('Zur Prüfung')
  })
})
