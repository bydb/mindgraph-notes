import { describe, it, expect } from 'vitest'
import { countPdfPages, isReusablePdfPath, pdfStructureProblem, sameBytes } from './pdfCheck'
import { makeTestPdf } from './testPdf'

describe('pdfStructureProblem', () => {
  it('akzeptiert ein vollständiges PDF', () => {
    expect(pdfStructureProblem(makeTestPdf(2))).toBeNull()
  })
  it('lehnt leere Antwort, Nicht-PDF und abgeschnittenes PDF ab', () => {
    expect(pdfStructureProblem(new Uint8Array())).toMatch(/leer/)
    expect(pdfStructureProblem(new TextEncoder().encode('<html>Fehler</html>'))).toMatch(/kein PDF/)
    const full = makeTestPdf(30)
    expect(pdfStructureProblem(full.slice(0, Math.floor(full.length * 0.7)))).toMatch(/unvollständig/)
  })
})

describe('countPdfPages', () => {
  it('zählt die Seiten und lässt die Eingabe unverändert', async () => {
    const bytes = makeTestPdf(3)
    const copy = new Uint8Array(bytes)
    expect(await countPdfPages(bytes)).toBe(3)
    expect(sameBytes(bytes, copy)).toBe(true)
  })
})

describe('isReusablePdfPath', () => {
  it('nimmt relative Vault-Pfade auf .pdf', () => {
    expect(isReusablePdfPath('reMarkable/pdf/Heft-abcdef12.pdf')).toBe(true)
    expect(isReusablePdfPath('Projekte/Heft.PDF')).toBe(true)
  })
  it('lehnt Ausbrüche, .mindgraph, absolute Pfade und Nicht-PDF ab', () => {
    for (const bad of ['../x.pdf', 'a/../../x.pdf', '/etc/x.pdf', 'C:/x.pdf', 'a\\x.pdf', '.mindgraph/x.pdf', 'a//x.pdf', 'x.md', '', undefined, 3]) {
      expect(isReusablePdfPath(bad), String(bad)).toBe(false)
    }
  })
})
