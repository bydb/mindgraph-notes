import { describe, expect, it } from 'vitest'
import { assemblePdfText, formatPageRanges, pdfNoTextNote } from './pdfPageText'

const TEXT = 'Dies ist eine ganz normale Textseite mit genug Inhalt für die Prüfung.\n'

describe('assemblePdfText', () => {
  it('lässt eine reine Text-PDF ohne Vermerk', () => {
    const out = assemblePdfText([TEXT, TEXT], 2)
    expect(out).not.toContain('[Seite')
    expect(pdfNoTextNote(out)).toBeUndefined()
  })

  it('benennt Scan-Seiten mitten in einer Text-PDF', () => {
    const out = assemblePdfText([TEXT, '', TEXT, '', TEXT], 5)
    expect(out).toContain('[Seite 2: kein Text gefunden')
    expect(out).toContain('[Seite 4: kein Text gefunden')
    expect(pdfNoTextNote(out)).toBe(
      'ohne Textebene: Seiten 2, 4 von 5 gelesenen Seiten — Inhalt dort nicht gelesen, falls es Scans oder Bilder sind'
    )
  })

  it('behält wenig Text (Stempel, Seitenzahl) und markiert die Seite trotzdem', () => {
    const out = assemblePdfText([TEXT, '- 2 -\n'], 2)
    expect(out).toContain('[Seite 2: kaum Text (3 Zeichen)')
    expect(out).toContain('- 2 -')
  })

  it('wirft wie bisher, wenn die ganze Datei keinen Text hat', () => {
    expect(() => assemblePdfText(['', '  ', ''], 3)).toThrow(/keine Textebene/)
  })

  it('meldet abgebrochenes Lesen weiter als gekürzt', () => {
    const out = assemblePdfText([TEXT, ''], 9)
    expect(out).toContain('[gekürzt: nur die ersten 2 von 9 Seiten]')
    expect(pdfNoTextNote(out)).toContain('Seite 2 von 2 gelesenen Seiten')
  })
})

describe('formatPageRanges', () => {
  it('fasst Folgen zusammen', () => {
    expect(formatPageRanges([1, 2, 3, 7, 9, 10])).toBe('1–3, 7, 9–10')
  })
})
