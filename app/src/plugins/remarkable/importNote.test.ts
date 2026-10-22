import { describe, it, expect } from 'vitest'
import { hasExtractedSection, importIdOf, isImportCandidate, sourcePdfOf, updateImportNote } from './importNote'

const ID = 'abcdef12-3456-7890'
const PDF = 'reMarkable/pdf/Heft-abcdef12.pdf'

// So schreibt RemarkablePanel die Importnotiz (Stand vor der Änderung, ohne remarkable_pages).
const imported = (pdf = PDF) =>
  `---\nremarkable_id: "${ID}"\nremarkable_name: "Heft"\nremarkable_type: "DocumentType"\nremarkable_parent: ""\n` +
  `remarkable_modified: "2026-03-24T10:00:00.000Z"\nremarkable_imported_at: "2026-03-24T10:05:00.000Z"\n` +
  `sourcePdf: "${pdf}"\n---\n\n# Heft\n\n![[${pdf}]]\n\n> Imported from reMarkable via USB.\n\nMeine Notiz dazu.\n`

const refresh = { modifiedClient: '2026-10-22T08:00:00.000Z', importedAt: '2026-10-22T08:01:00.000Z', relativePdfPath: PDF, pageCount: 68, changed: true }

describe('importIdOf / sourcePdfOf', () => {
  it('liest die Felder aus dem Frontmatter', () => {
    expect(importIdOf(imported())).toBe(ID)
    expect(sourcePdfOf(imported())).toBe(PDF)
  })
  it('ignoriert Treffer im Fließtext und kaputtes Frontmatter', () => {
    expect(importIdOf(`# Notiz\n\nremarkable_id: "${ID}"\n`)).toBeUndefined()
    expect(importIdOf(`---\nremarkable_id: "${ID}"\nkein Ende`)).toBeUndefined()
  })
})

describe('isImportCandidate', () => {
  it('erkennt Cache-Stubs ohne Inhalt über Ordner, Pfad oder sourcePdf', () => {
    expect(isImportCandidate({ path: 'reMarkable/Heft-abcdef12.md', content: '' }, ID)).toBe(true)
    expect(isImportCandidate({ path: 'Archiv/umbenannt.md', content: '', sourcePdf: PDF }, ID)).toBe(true)
    expect(isImportCandidate({ path: 'Archiv/fremd.md', content: '' }, ID)).toBe(false)
  })
  it('prüft geladene Notizen am Frontmatter, nicht am Pfad', () => {
    expect(isImportCandidate({ path: 'reMarkable/x.md', content: imported() }, ID)).toBe(true)
    expect(isImportCandidate({ path: 'reMarkable/x.md', content: '# andere Notiz' }, ID)).toBe(false)
  })
})

describe('updateImportNote', () => {
  it('aktualisiert Gerätedatum, Importzeit und Seitenzahl und lässt den Notiztext stehen', () => {
    const r = updateImportNote(imported(), refresh)
    expect(r.status).toBe('updated')
    expect(r.content).toContain('remarkable_modified: "2026-10-22T08:00:00.000Z"')
    expect(r.content).toContain('remarkable_imported_at: "2026-10-22T08:01:00.000Z"')
    expect(r.content).toContain('remarkable_pages: 68')
    expect(r.content).toContain('Meine Notiz dazu.')
    expect(r.content.match(/!\[\[/g)).toHaveLength(1)
    expect(importIdOf(r.content)).toBe(ID)
  })

  it('schreibt nicht, wenn sich nichts geändert hat', () => {
    const once = updateImportNote(imported(), refresh).content
    expect(updateImportNote(once, { ...refresh, importedAt: 'später', changed: false })).toEqual({ status: 'unchanged', content: once })
  })

  it('zieht sourcePdf und Einbettung bei neuem PDF-Pfad mit', () => {
    const r = updateImportNote(imported(), { ...refresh, relativePdfPath: 'reMarkable/pdf/Neu-abcdef12.pdf' })
    expect(sourcePdfOf(r.content)).toBe('reMarkable/pdf/Neu-abcdef12.pdf')
    expect(r.content).toContain('![[reMarkable/pdf/Neu-abcdef12.pdf]]')
    expect(r.content).not.toContain(`![[${PDF}]]`)
  })

  it('ergänzt sourcePdf und Einbettung, wenn sie fehlen (Codex F10)', () => {
    const without = imported().replace(/^sourcePdf:.*\n/m, '').replace(`![[${PDF}]]\n\n`, '')
    const r = updateImportNote(without, refresh)
    expect(sourcePdfOf(r.content)).toBe(PDF)
    expect(r.content).toMatch(new RegExp(`# Heft\\n\\n!\\[\\[${PDF.replace(/[.[\]]/g, '\\$&')}\\]\\]`))
  })

  it('meldet fehlendes Frontmatter statt still nichts zu tun', () => {
    expect(updateImportNote('# Heft\n\nText', refresh)).toEqual({ status: 'no-frontmatter', content: '# Heft\n\nText' })
  })
})

describe('hasExtractedSection', () => {
  it('erkennt deutschen und englischen Abschnitt', () => {
    expect(hasExtractedSection('x\n## Extrahierter Inhalt\n')).toBe(true)
    expect(hasExtractedSection('x\n## Extracted Content\n')).toBe(true)
    expect(hasExtractedSection('x')).toBe(false)
  })
})
