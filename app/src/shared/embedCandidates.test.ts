import { describe, expect, it } from 'vitest'
import { embedCandidatePaths } from './embedCandidates'

describe('embedCandidatePaths', () => {
  it('reiner Dateiname: zuerst neben der Notiz, dann Wurzel, dann Anhangordner', () => {
    expect(embedCandidatePaths('bild.png', 'Kapitel', ['.attachments'])).toEqual(['Kapitel/bild.png', 'bild.png', '.attachments/bild.png'])
  })
  it('Ziel mit Ordner: zuerst ab der Wurzel, dann neben der Notiz (F27)', () => {
    expect(embedCandidatePaths('Projekt/bild.png', 'Kapitel', ['.attachments'])).toEqual(['Projekt/bild.png', 'Kapitel/Projekt/bild.png', '.attachments/Projekt/bild.png'])
  })
  it('Notiz in der Wurzel: keine doppelten Kandidaten', () => {
    expect(embedCandidatePaths('bild.png', '')).toEqual(['bild.png'])
    expect(embedCandidatePaths('/Projekt/bild.png', '')).toEqual(['Projekt/bild.png'])
  })
})
