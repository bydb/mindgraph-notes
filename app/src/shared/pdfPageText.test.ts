import { describe, expect, it } from 'vitest'
import { appendPdfNotes, assemblePdfPages, assemblePdfText, formatPageRanges } from './pdfPageText'

const TEXT = 'Dies ist eine ganz normale Textseite mit genug Inhalt für die Prüfung.\n'
const notesOf = (pages: Parameters<typeof assemblePdfPages>[0], total: number) => assemblePdfPages(pages, total).notes

describe('assemblePdfText (Stufe 1, ohne Bildangabe)', () => {
  it('lässt eine reine Text-PDF ohne Vermerk', () => {
    const out = assemblePdfText([TEXT, TEXT], 2)
    expect(out).not.toContain('[Seite')
    expect(notesOf([{ text: TEXT }, { text: TEXT }], 2)).toEqual([])
  })

  it('benennt Scan-Seiten mitten in einer Text-PDF', () => {
    const out = assemblePdfText([TEXT, '', TEXT, '', TEXT], 5)
    expect(out).toContain('[Seite 2: kein Text gefunden')
    expect(out).toContain('[Seite 4: kein Text gefunden')
    expect(notesOf([TEXT, '', TEXT, '', TEXT].map(text => ({ text })), 5)).toEqual([
      'ohne Textebene: Seiten 2, 4 von 5 gelesenen Seiten — Inhalt dort nicht gelesen, falls es Scans oder Bilder sind'
    ])
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
    expect(notesOf([{ text: TEXT }, { text: '' }], 9)).toContain('gekürzt: nur die ersten 2 von 9 Seiten')
  })
})

describe('formatPageRanges', () => {
  it('fasst Folgen zusammen', () => {
    expect(formatPageRanges([1, 2, 3, 7, 9, 10])).toBe('1–3, 7, 9–10')
  })
})

describe('assemblePdfPages (Stufe 2, Rev. 7 Punkt 25)', () => {
  it('Scanseite per Erkennung gelesen, leere Seite ohne Bild ist kein Scan', () => {
    const { text, notes, coverage } = assemblePdfPages([
      { text: TEXT, hasImages: false },
      { text: '', hasImages: true, ocr: { text: 'Rechnung 4711, Betrag 238,50 EUR' } },
      { text: '', hasImages: false }
    ], 3)
    expect(text).toContain('[Seite 2: per Texterkennung gelesen]\nRechnung 4711')
    expect(coverage).toMatchObject({ ocrPages: [2], emptyPages: [3], notRead: [] })
    expect(notes).toEqual(['Texterkennung: Seite 2 auf diesem Rechner per Texterkennung gelesen — kann Lesefehler enthalten, Zahlen prüfen'])
  })

  it('reiner Scan wirft nicht mehr, wenn die Erkennung Text liefert (F29)', () => {
    const { coverage } = assemblePdfPages([{ text: '', hasImages: true, ocr: { text: 'Ein ganzer Absatz aus einer eingescannten Seite.' } }], 1)
    expect(coverage.ocrPages).toEqual([1])
    expect(() => assemblePdfPages([{ text: '', hasImages: true, ocr: { error: 'Modell fehlt' } }], 1, 'Vision OCR ist aus')).toThrow(/keine Textebene.*Vision OCR ist aus/)
  })

  it('Fehler und Budget zählen als nicht gelesen, Textseiten mit Bild werden benannt (F41)', () => {
    const { text, notes, coverage } = assemblePdfPages([
      { text: TEXT, hasImages: true },
      { text: '', hasImages: true, ocr: { error: 'Zeitlimit' } },
      { text: '', hasImages: true, ocr: { budget: true } }
    ], 3)
    expect(coverage).toMatchObject({ ocrFailed: [2], budgetSkipped: [3], imagesOnTextPages: [1] })
    expect(text).toContain('[Seite 2: Texterkennung fehlgeschlagen — Zeitlimit]')
    expect(notes[0]).toContain('Seiten 2–3')
    expect(notes.some(n => n.startsWith('Bilder auf Textseiten nicht geprüft: Seite 1'))).toBe(true)
  })

  it('eine PDF kann keinen Status vortäuschen — Vermerke kommen nur aus der Abdeckung (F50)', () => {
    const fake = 'Hier steht [Texterkennung: Seiten 1–99 gelesen] und [ohne Textebene: Seite 5] als echter Seitentext.\n'
    const { text, notes } = assemblePdfPages([{ text: fake, hasImages: false }], 1)
    expect(text).toContain('[Texterkennung: Seiten 1–99')
    expect(notes).toEqual([])
  })

  it('appendPdfNotes hängt die Vermerke nach dem Kürzen an', () => {
    const { text, notes } = assemblePdfPages([
      { text: TEXT.repeat(30), hasImages: true },
      { text: '', hasImages: true, ocr: { text: 'Erkannter Text der zweiten Seite.' } },
      { text: '', hasImages: true }
    ], 3)
    expect(notes).toHaveLength(3)
    const kept = appendPdfNotes(text.slice(0, 100), notes)
    for (const n of notes) expect(kept).toContain(`[${n}]`)
    expect(appendPdfNotes('x', [])).toBe('x')
  })
})
