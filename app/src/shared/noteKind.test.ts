import { describe, it, expect } from 'vitest'
import {
  getNoteKindFromMarker,
  getNoteKindFromTitleStrict,
  getNoteKindFromContent,
  getNoteKindStrict,
  noteDateFromFileName,
  noteDateFromFrontmatter,
  resolveNoteDate
} from './noteKind'

const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime()

describe('Kategorie', () => {
  it('Marker-Aliasse', () => {
    expect(getNoteKindFromMarker('red')?.id).toBe('problem')
    expect(getNoteKindFromMarker('"🟢"')?.id).toBe('solution')
    expect(getNoteKindFromMarker('Reader')?.id).toBe('info')
    expect(getNoteKindFromMarker('gelb')).toBeNull()
  })

  it('strikter Titel-Marker nur am Anfang oder nach " - "', () => {
    expect(getNoteKindFromTitleStrict('🔴 Digitalwoche')?.id).toBe('problem')
    expect(getNoteKindFromTitleStrict('202604221336 - 🔴 Digitalwoche')?.id).toBe('problem')
    expect(getNoteKindFromTitleStrict('Ampel 🔴 mitten im Text')).toBeNull()
  })

  it('Frontmatter gewinnt vor Dateiname, kein Pfad-Fallback', () => {
    expect(getNoteKindStrict('a/🔵 Ordner/x.md', '---\ncategory: red\n---\n')).toBe('problem')
    expect(getNoteKindStrict('a/🔵 Ordner/202601010000 - 🟢 Titel.md', 'kein frontmatter')).toBe('solution')
    expect(getNoteKindStrict('a/🔵 Ordner/Titel ohne Marker.md', 'Text mit 🔴 drin')).toBeNull()
    expect(getNoteKindFromContent('---\nkind: info\n---')?.id).toBe('info')
  })
})

describe('Datum aus Dateiname', () => {
  it('Zettel-ID mit Uhrzeit', () => {
    expect(noteDateFromFileName('300/202609181530 - 🟢 Titel.md')).toBe(local(2026, 9, 18, 15, 30))
  })
  it('8-stellig, Daily Note und Brain-Pfad', () => {
    expect(noteDateFromFileName('20260918 - Titel.md')).toBe(local(2026, 9, 18))
    expect(noteDateFromFileName('daily/2026-09-18.md')).toBe(local(2026, 9, 18))
    expect(noteDateFromFileName('800 - brain/2026/09/18.md')).toBe(local(2026, 9, 18))
    expect(noteDateFromFileName('800 - brain/2026/09/18 (2).md')).toBe(local(2026, 9, 18))
  })
  it('ungültige oder fremde Zahlen ergeben kein Datum', () => {
    expect(noteDateFromFileName('20261345 - Titel.md')).toBeNull()
    expect(noteDateFromFileName('2026023199 - Titel.md')).toBeNull()
    expect(noteDateFromFileName('1234567 - Titel.md')).toBeNull()
    expect(noteDateFromFileName('Rechnung 20260918123.md')).toBeNull()
    expect(noteDateFromFileName('Titel.md')).toBeNull()
  })
})

describe('Datum aus Frontmatter und Auflösung', () => {
  it('date und created, mit und ohne Uhrzeit', () => {
    expect(noteDateFromFrontmatter('---\ndate: 2026-09-18\n---\n')).toBe(local(2026, 9, 18))
    expect(noteDateFromFrontmatter('---\ntitle: x\ncreated: "2026-09-18 07:05"\n---\n')).toBe(local(2026, 9, 18, 7, 5))
    expect(noteDateFromFrontmatter('---\ncreated: 2026-09-18T07:05:00\n---\n')).toBe(local(2026, 9, 18, 7, 5))
    expect(noteDateFromFrontmatter('kein frontmatter\ndate: 2026-09-18')).toBeNull()
    expect(noteDateFromFrontmatter('---\ndate: gestern\n---\n')).toBeNull()
  })
  it('Herkunft: frontmatter → filename → mtime', () => {
    expect(resolveNoteDate('202609181530 - x.md', '---\ndate: 2025-01-02\n---\n', 5)).toEqual({ dateValue: local(2025, 1, 2), dateSource: 'frontmatter' })
    expect(resolveNoteDate('202609181530 - x.md', 'Body', 5)).toEqual({ dateValue: local(2026, 9, 18, 15, 30), dateSource: 'filename' })
    expect(resolveNoteDate('x.md', 'Body', 5)).toEqual({ dateValue: 5, dateSource: 'mtime' })
  })
})
