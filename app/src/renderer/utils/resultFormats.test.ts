import { describe, it, expect } from 'vitest'
import { needsExternalApp, FORMATS_NEEDING_EXTERNAL_APP } from './resultFormats'

describe('Ergebnisformate, die ein fremdes Programm brauchen', () => {
  it('erkennt die Office-Formate, die die App nicht anzeigt', () => {
    expect(needsExternalApp('Anwesenheitsliste.docx')).toBe(true)
    expect(needsExternalApp('Auswertung.xlsx')).toBe(true)
    expect(needsExternalApp('Vortrag.pptx')).toBe(true)
    expect(needsExternalApp('Brief.pages')).toBe(true)
  })

  it('lässt alles in Ruhe, was die App selbst darstellt', () => {
    for (const name of ['Notiz.md', 'Seite.html', 'Bericht.pdf', 'Bild.png', 'Daten.csv', 'Text.txt']) {
      expect(needsExternalApp(name)).toBe(false)
    }
  })

  it('stört sich nicht an Groß-/Kleinschreibung und Leerraum', () => {
    expect(needsExternalApp('  Liste.DOCX ')).toBe(true)
    expect(needsExternalApp('Liste.XlsX')).toBe(true)
  })

  it('verwechselt eine Endung nicht mit einem Namensbestandteil', () => {
    expect(needsExternalApp('docx-Vorlage.md')).toBe(false)
    expect(needsExternalApp('Bericht.xlsx.md')).toBe(false)
  })

  it('kennt keine Endung doppelt', () => {
    expect(new Set(FORMATS_NEEDING_EXTERNAL_APP).size).toBe(FORMATS_NEEDING_EXTERNAL_APP.length)
  })
})
