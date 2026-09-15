import { describe, it, expect } from 'vitest'
import { fileNameFromPath, frontmatterTitle, noteSearchNames, matchNoteName } from './noteSearchNames'

const marburg = {
  title: 'Zusammenfassung',
  path: '000 - 📥 inbox/010 - 📥 Notes/202609031500 - 🟢 Marburger Forum.md',
  content: '---\ntitle: "Marburger Forum"\ndate: 2026-09-03T13:00:53.501Z\ncategory: 🟢\n---\n# Zusammenfassung\n\nVorgestellt wird das **Marburger Forum**.\n'
}

describe('fileNameFromPath', () => {
  it('strips folder and .md', () => {
    expect(fileNameFromPath(marburg.path)).toBe('202609031500 - 🟢 Marburger Forum')
  })
  it('strips .pdf.md for companion notes', () => {
    expect(fileNameFromPath('a/b/Paper.pdf.md')).toBe('Paper')
  })
  it('keeps names without extension', () => {
    expect(fileNameFromPath('Ordner/Datei')).toBe('Datei')
  })
})

describe('frontmatterTitle', () => {
  it('reads a quoted title', () => {
    expect(frontmatterTitle(marburg.content)).toBe('Marburger Forum')
  })
  it('reads an unquoted title and single quotes', () => {
    expect(frontmatterTitle('---\ntitle: Ohne Anführungszeichen\n---\n')).toBe('Ohne Anführungszeichen')
    expect(frontmatterTitle("---\ntitle: 'Einfach'\n---\nText")).toBe('Einfach')
  })
  it('ignores title: lines outside the frontmatter block', () => {
    expect(frontmatterTitle('# H1\n\ntitle: nicht im Frontmatter\n')).toBeNull()
    expect(frontmatterTitle('---\ndate: 2026\n---\ntitle: danach\n')).toBeNull()
  })
  it('returns null for empty content, cache stubs and empty title', () => {
    expect(frontmatterTitle('')).toBeNull()
    expect(frontmatterTitle('---\ntitle:\n---\n')).toBeNull()
    expect(frontmatterTitle('---\ntitle: ""\n---\n')).toBeNull()
  })
  it('does not treat an unterminated block as frontmatter', () => {
    expect(frontmatterTitle('---\ntitle: offen\n')).toBeNull()
  })
})

describe('noteSearchNames', () => {
  it('lists H1 title, file name and frontmatter title in that order', () => {
    expect(noteSearchNames(marburg)).toEqual([
      { source: 'title', text: 'Zusammenfassung' },
      { source: 'fileName', text: '202609031500 - 🟢 Marburger Forum' },
      { source: 'frontmatterTitle', text: 'Marburger Forum' },
    ])
  })
  it('drops duplicates case-insensitively', () => {
    const names = noteSearchNames({ title: 'Marburger Forum', path: 'x/marburger forum.md', content: '---\ntitle: Marburger Forum\n---\n' })
    expect(names).toEqual([{ source: 'title', text: 'Marburger Forum' }])
  })
})

describe('matchNoteName', () => {
  it('finds the Marburger note via its file name', () => {
    expect(matchNoteName(marburg, 'marburger')).toEqual({ source: 'fileName', text: '202609031500 - 🟢 Marburger Forum' })
  })
  it('prefers the H1 title when it matches', () => {
    expect(matchNoteName(marburg, 'zusammen')?.source).toBe('title')
  })
  it('falls back to the frontmatter title when file name differs', () => {
    const n = { title: 'Zusammenfassung', path: 'x/Notiz 17.md', content: '---\ntitle: Marburger Forum\n---\n' }
    expect(matchNoteName(n, 'marburger')?.source).toBe('frontmatterTitle')
  })
  it('returns null without a hit or with an empty query', () => {
    expect(matchNoteName(marburg, 'gießen')).toBeNull()
    expect(matchNoteName(marburg, '')).toBeNull()
  })
})
