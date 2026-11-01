import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { markdownToDocxBuffer } from './officeService'

async function documentXml(md: string): Promise<string> {
  const buf = await markdownToDocxBuffer(md)
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml')!.async('string')
}

describe('markdownToDocxBuffer: Tabellen', () => {
  it('macht aus einer Pipe-Tabelle eine echte Word-Tabelle', async () => {
    const xml = await documentXml('## Aufgaben\n\n| Aufgabe | Verantwortlich | Frist |\n|---|---|---|\n| Catering bestellen | Verwaltung | 15.07. |\n')
    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('Catering bestellen')
    expect(xml).not.toContain('| Aufgabe |')
    expect((xml.match(/<w:tr[ >]/g) || []).length).toBe(2)
  })

  it('lässt einen leeren Kopf weg und rendert **fett** in Zellen', async () => {
    const xml = await documentXml('| | |\n|---|---|\n| **Anlass** | Teamsitzung |\n')
    expect((xml.match(/<w:tr[ >]/g) || []).length).toBe(1)
    expect(xml).not.toContain('**')
    expect(xml).toMatch(/<w:b\/>[\s\S]*Anlass/)
  })

  it('schreibt Pipe-Zeilen ohne Trennzeile weiter als Text', async () => {
    const xml = await documentXml('| nur | Text |\n')
    expect(xml).not.toContain('<w:tbl>')
    expect(xml).toContain('| nur | Text |')
  })

  it('macht aus --- eine Linie statt wörtlicher Striche', async () => {
    const xml = await documentXml('Absatz\n\n---\n\nWeiter')
    expect(xml).not.toMatch(/<w:t[^>]*>---<\/w:t>/)
    expect(xml).toContain('<w:pBdr>')
  })
})
