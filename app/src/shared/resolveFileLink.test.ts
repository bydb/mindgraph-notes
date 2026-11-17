import { describe, expect, it } from 'vitest'
import { resolveFileLink } from './resolveFileLink'

const paths = ['Projekte/Bericht.pdf', 'a/foto.png', 'b/foto.png', 'Plan.docx']

describe('resolveFileLink', () => {
  it('exakter Pfad', () => {
    expect(resolveFileLink('a/foto.png', paths)).toEqual({ status: 'found', path: 'a/foto.png' })
  })
  it('eindeutiger Dateiname, ohne Groß/klein', () => {
    expect(resolveFileLink('bericht.PDF', paths)).toEqual({ status: 'found', path: 'Projekte/Bericht.pdf' })
  })
  it('mehrdeutiger Dateiname wird nicht geraten', () => {
    expect(resolveFileLink('foto.png', paths)).toEqual({ status: 'ambiguous', count: 2 })
  })
  it('falscher Pfad sucht nicht per Namen weiter', () => {
    expect(resolveFileLink('x/Plan.docx', paths)).toEqual({ status: 'none' })
  })
  it('unbekannt', () => {
    expect(resolveFileLink('fehlt.pdf', paths)).toEqual({ status: 'none' })
  })
})
