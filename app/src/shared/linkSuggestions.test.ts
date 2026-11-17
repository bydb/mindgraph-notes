import { describe, expect, it } from 'vitest'
import { suggestLinkTargets } from './linkSuggestions'

const paths = [
  'Projekte/202609031500 - Marburger Forum.md',
  'Projekte/Bericht.pdf',
  'Projekte/Bericht.md',
  'Bilder/foto.png',
  'Angebot #2.pdf',
  'Plan.docx'
]
const notes = [
  { path: 'Projekte/202609031500 - Marburger Forum.md', title: 'Zusammenfassung', content: '---\ntitle: Forum Marburg\n---\n# Zusammenfassung' },
  { path: 'Projekte/Bericht.md', title: 'Bericht', content: '# Bericht' }
]

describe('suggestLinkTargets', () => {
  it('leere Abfrage zeigt Dateien, Notizen zuerst (F29)', () => {
    const r = suggestLinkTargets('', paths, notes)
    expect(r.items.length).toBe(paths.length)
    expect(r.items[0].kind).toBe('note')
    expect(r.items[1].kind).toBe('note')
    expect(r.exactMatch).toBe(false)
  })

  it('findet PDFs, Bilder und Office-Dateien', () => {
    expect(suggestLinkTargets('foto', paths, notes).items.map(i => i.path)).toEqual(['Bilder/foto.png'])
    expect(suggestLinkTargets('plan', paths, notes).items.map(i => i.target)).toEqual(['Plan.docx'])
  })

  it('findet Notizen über Dateinamen und Frontmatter-Titel, fügt Dateinamen ein', () => {
    const byFile = suggestLinkTargets('marburger', paths, notes).items[0]
    expect(byFile.label).toBe('202609031500 - Marburger Forum')
    expect(byFile.target).toBe('202609031500 - Marburger Forum')
    const byFrontmatter = suggestLinkTargets('forum marburg', paths, notes).items[0]
    expect(byFrontmatter.path).toBe('Projekte/202609031500 - Marburger Forum.md')
  })

  it('Notiz vor gleichnamiger Datei bei gleichem Treffergrad', () => {
    const r = suggestLinkTargets('bericht', paths, notes)
    expect(r.items.map(i => i.path)).toEqual(['Projekte/Bericht.md', 'Projekte/Bericht.pdf'])
    expect(r.items[1].target).toBe('Bericht.pdf')
  })

  it('exakter Treffer auch bei Dateien ohne Endung (F25)', () => {
    expect(suggestLinkTargets('Plan', paths, notes).exactMatch).toBe(true)
    expect(suggestLinkTargets('plan.docx', paths, notes).exactMatch).toBe(true)
    expect(suggestLinkTargets('Neue Idee', paths, notes).exactMatch).toBe(false)
  })

  it('nicht verlinkbarer Name bleibt sichtbar, aber ohne Ziel', () => {
    const item = suggestLinkTargets('angebot', paths, notes).items[0]
    expect(item.target).toBeNull()
    expect(item.blockedBy).toEqual(['#'])
  })

  it('begrenzt die Liste', () => {
    expect(suggestLinkTargets('', paths, notes, 3).items.length).toBe(3)
  })
})
