import { describe, it, expect } from 'vitest'
import { getFileType, coreClaimedExtensions, DUPLICATE_CORE_EXTENSIONS } from './fileTypes'

describe('getFileType', () => {
  it('klassifiziert bekannte Endungen (case-insensitiv)', () => {
    expect(getFileType('a.md')).toBe('markdown')
    expect(getFileType('a.PDF')).toBe('pdf')
    expect(getFileType('a.png')).toBe('image')
    expect(getFileType('a.xlsx')).toBe('excel')
    expect(getFileType('a.docx')).toBe('word')
    expect(getFileType('a.pptx')).toBe('powerpoint')
    expect(getFileType('a.ts')).toBe('code')
  })

  it('erkennt Spezial-Dateinamen', () => {
    expect(getFileType('Dockerfile')).toBe('code')
    expect(getFileType('.gitignore')).toBe('code')
  })

  it('liefert null für Unbekanntes', () => {
    expect(getFileType('a.excalidraw')).toBeNull()
    expect(getFileType('ohneendung')).toBeNull()
  })
})

// R1-impl-F04: getFileType (FileTree-Klassifikation) und coreClaimedExtensions (Plugin-Claim-Sperrmenge)
// müssen aus DERSELBEN Quelle stammen — sonst kann eine vergessene Kernendung still einen gültigen
// Plugin-Claim erzeugen. Dieser Test zementiert die Parität.
describe('Parität getFileType ↔ coreClaimedExtensions (R1-impl-F04)', () => {
  const core = coreClaimedExtensions()

  it('jede beanspruchte Kernendung klassifiziert non-null', () => {
    for (const ext of core) {
      expect(getFileType(`datei${ext}`), `getFileType('datei${ext}')`).not.toBeNull()
    }
  })

  it('alle Kernendungen sind normalisiert (lowercase, genau ein führender Punkt)', () => {
    for (const ext of core) {
      expect(ext.startsWith('.'), ext).toBe(true)
      expect(ext.startsWith('..'), ext).toBe(false)
      expect(ext).toBe(ext.toLowerCase())
    }
  })

  it('deckt die wichtigsten Kerntypen ab (md/pdf/Bilder/Office/Code)', () => {
    for (const ext of ['.md', '.pdf', '.png', '.svg', '.xlsx', '.docx', '.pptx', '.ts', '.json', '.env']) {
      expect(core.has(ext), ext).toBe(true)
    }
  })

  it('beansprucht NICHT-Kerntypen nicht (Plugins dürfen sie claimen)', () => {
    for (const ext of ['.excalidraw', '.drawio', '.foo']) {
      expect(core.has(ext), ext).toBe(false)
      expect(getFileType(`datei${ext}`)).toBeNull()
    }
  })
})

// Regression: `.svg` steht sowohl in IMAGE_EXTENSIONS als auch in CODE_EXTENSIONS. Da beide Listen
// in dieselbe Map gespreadet werden, gewann der spätere Code-Eintrag — SVGs wurden im FileTree als
// Code-Datei geöffnet (XML-Quelltext statt Grafik) und `findImageInVault` (filtert auf
// fileType === 'image') fand sie nicht mehr, wodurch `![[bild.svg]]`-Embeds in Notizen leer blieben.
describe('SVG bleibt ein Bild (Regression)', () => {
  it('klassifiziert .svg als image, nicht als code', () => {
    expect(getFileType('nahrungskette.svg')).toBe('image')
    expect(getFileType('HERO.SVG')).toBe('image')
  })

  it('lässt die übrigen Bild-Endungen unberührt', () => {
    for (const name of ['a.png', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.bmp', 'a.ico']) {
      expect(getFileType(name), name).toBe('image')
    }
  })

  it('hält verwandte Markup-Endungen weiterhin bei code', () => {
    expect(getFileType('a.xml')).toBe('code')
    expect(getFileType('a.html')).toBe('code')
  })

  it('keine Endung wird von zwei Typ-Listen beansprucht', () => {
    // Ein Duplikat würde still nach Listen-Reihenfolge aufgelöst statt nach Absicht.
    expect(DUPLICATE_CORE_EXTENSIONS).toEqual([])
  })
})
