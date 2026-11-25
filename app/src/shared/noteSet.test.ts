import { describe, expect, it } from 'vitest'
import {
  buildNoteList, displayNameFromFile, findTerm, formatNoteSet, matchNote, normalizeTerms, noteListLink, parseNumbers,
  refineEntries, relatedWords, semanticThreshold, sortForSet, splitNote, wordSet, NOTE_SET_MAX_LINES, type NoteSet, type NoteSetEntry
} from './noteSet'

const entry = (n: number, relPath: string, title = `Notiz ${n}`, score = 1): NoteSetEntry => ({ n, relPath, title, hit: `Fundstelle ${n}`, score, hash: `h${n}` })

describe('normalizeTerms', () => {
  it('säubert, entdoppelt und begrenzt', () => {
    expect(normalizeTerms(['KI', ' ki ', '', 'x', 'künstliche  Intelligenz', 7])).toEqual(['KI', 'künstliche Intelligenz'])
    expect(normalizeTerms('ChatGPT, LLM; Prompt')).toEqual(['ChatGPT', 'LLM', 'Prompt'])
    expect(normalizeTerms(Array.from({ length: 30 }, (_, i) => `wort${i}`))).toHaveLength(12)
    expect(normalizeTerms(undefined)).toEqual([])
  })
})

describe('findTerm', () => {
  it('trifft kurze Wörter nur als ganzes Wort und in ihrer Schreibweise', () => {
    expect(findTerm('Das Kind spielt mit der Kiste', 'KI')).toBe(-1)
    expect(findTerm('Der Kiosk', 'KI')).toBe(-1)
    expect(findTerm('Thema: KI im Unterricht', 'KI')).toBe(7)
    expect(findTerm('(KI)', 'KI')).toBe(1)
    expect(findTerm('KI-gestützt unterrichten', 'KI')).toBe(0)
    expect(findTerm('ein LLM, zwei LLMs', 'LLM')).toBe(4)
  })
  it('trifft längere Wörter ohne Rücksicht auf Groß/Klein, auch als Wortteil', () => {
    expect(findTerm('Der Intelligenztest', 'intelligenz')).toBe(4)
    expect(findTerm('KÜNSTLICHE INTELLIGENZ', 'künstliche Intelligenz')).toBe(0)
    expect(findTerm('nichts davon', 'Sprachmodell')).toBe(-1)
  })
})

describe('splitNote und matchNote', () => {
  const note = '---\ntitle: "Sprachmodelle im Unterricht"\ntags: [x]\n---\n\n# Zusammenfassung\n\nErste Zeile.\nHier geht es um ChatGPT und andere Werkzeuge im Fach Deutsch.\n'
  it('liest Frontmatter-Titel, H1 und Text', () => {
    expect(splitNote(note)).toMatchObject({ fmTitle: 'Sprachmodelle im Unterricht', h1: 'Zusammenfassung' })
    expect(splitNote('﻿# Nur H1\r\nText').h1).toBe('Nur H1')
  })
  it('wertet Felder höher als den Text und zeigt die Textstelle als Fundstelle', () => {
    const m = matchNote('202611 - 🟢 Notiz.md', note, ['ChatGPT', 'Sprachmodell'])
    expect(m).not.toBeNull()
    expect(m!.title).toBe('Sprachmodelle im Unterricht')
    expect(m!.score).toBe(5)
    expect(m!.hit).toContain('ChatGPT')
    expect(m!.hit).not.toContain('\n')
  })
  it('findet Treffer nur im Dateinamen und meldet sonst null', () => {
    expect(matchNote('KI Fortbildung.md', 'Kein Wort davon im Text.', ['KI'])).toMatchObject({ hit: 'Dateiname: KI Fortbildung', score: 4 })
    expect(matchNote('Kindergarten.md', 'Die Kinder spielen.', ['KI'])).toBeNull()
  })
  it('kürzt lange Zeilen um die Fundstelle', () => {
    const long = `${'a '.repeat(200)}Sprachmodell ${'b '.repeat(200)}`
    const m = matchNote('x.md', long, ['Sprachmodell'])!
    expect(m.hit.length).toBeLessThanOrEqual(104)
    expect(m.hit).toContain('Sprachmodell')
    expect(m.hit.startsWith('…') && m.hit.endsWith('…')).toBe(true)
  })
})

describe('Nummern und Verfeinern', () => {
  it('liest Nummern in jeder Schreibweise und meldet Unlesbares', () => {
    expect(parseNumbers(['n3', '4', 5, 'n6, n7', 'drei'])).toEqual({ numbers: [3, 4, 5, 6, 7], bad: ['drei'] })
    expect(parseNumbers(undefined)).toEqual({ numbers: [], bad: [] })
  })
  it('behält die Nummern der verbliebenen Notizen', () => {
    const r = refineEntries([entry(1, 'a.md'), entry(2, 'b.md'), entry(3, 'c.md')], [2, 9])
    expect(r.kept.map(e => e.n)).toEqual([1, 3])
    expect(r.unknown).toEqual([9])
    expect(refineEntries([entry(1, 'a.md'), entry(2, 'b.md')], [], e => e.n === 2).kept.map(e => e.n)).toEqual([2])
  })
  it('ordnet stabil nach Wertung, dann Pfad', () => {
    expect(sortForSet([{ score: 1, relPath: 'b' }, { score: 3, relPath: 'z' }, { score: 1, relPath: 'a' }]).map(x => x.relPath)).toEqual(['z', 'a', 'b'])
  })
})

describe('formatNoteSet', () => {
  const base: NoteSet = { id: 'm1', terms: ['KI'], folders: ['Notes'], entries: [], scanned: 83, complete: true, incomplete: [] }
  it('nennt Zahl, Vollständigkeit und je Notiz eine Zeile', () => {
    const text = formatNoteSet({ ...base, entries: [entry(1, 'Notes/A/x.md', 'Titel X'), entry(2, 'Notes/y.md')] })
    expect(text).toContain('NOTIZMENGE m1: 2 Notizen')
    expect(text).toContain('Vollständig')
    expect(text).toContain('n1 · Titel X · Notes/A · Fundstelle 1')
    expect(text).toContain('Notes/A (1)')
  })
  it('sagt, was das Modell nicht gesehen hat, und begrenzt die Liste', () => {
    const many = Array.from({ length: NOTE_SET_MAX_LINES + 30 }, (_, i) => entry(i + 1, `Notes/n${i}.md`))
    const text = formatNoteSet({ ...base, entries: many })
    expect(text.split('\n').filter(l => /^n\d+ · /.test(l))).toHaveLength(NOTE_SET_MAX_LINES)
    expect(text).toContain('30 weitere Notizen')
  })
  it('kennzeichnet unvollständige und leere Mengen', () => {
    expect(formatNoteSet({ ...base, complete: false, incomplete: ['2 Dateien über 2 MB übersprungen'] })).toContain('UNVOLLSTÄNDIG — 2 Dateien über 2 MB übersprungen')
    expect(formatNoteSet(base)).toContain('Keine Treffer')
  })
})

describe('Sammelnotiz', () => {
  it('verlinkt über den vollen Pfad und weicht bei zerbrechenden Zeichen auf Klartext aus', () => {
    expect(noteListLink('Notes/A/2026 - 🟢 Forum.md', 'Marburger Forum')).toEqual({ link: '[[Notes/A/2026 - 🟢 Forum|Marburger Forum]]' })
    expect(noteListLink('Notes/x.md', 'x')).toEqual({ link: '[[Notes/x]]' })
    expect(noteListLink('Notes/Projekt #3/x.md', 'x')).toMatchObject({ plain: 'Notes/Projekt #3/x.md' })
    expect(noteListLink('Notes/x.md', 'Titel | mit [Klammer]')).toEqual({ link: '[[Notes/x|Titel mit Klammer]]' })
  })
  it('gruppiert nach Ordner und führt Nicht-Verlinkbares und Veraltetes getrennt', () => {
    const { markdown, linked, plain } = buildNoteList({
      title: 'KI-Sammlung', intro: 'Alles zum Thema.',
      set: { terms: ['KI'], folders: ['Notes'], complete: true, incomplete: [], scanned: 10 },
      entries: [entry(1, 'Notes/B/b.md', 'Beta'), entry(2, 'Notes/A/a.md', 'Alpha'), entry(3, 'Notes/C #1/c.md', 'Gamma')],
      stale: [{ relPath: 'Notes/weg.md', reason: 'nicht mehr vorhanden' }],
      date: '2026-11-25'
    })
    expect(linked).toBe(2)
    expect(plain).toBe(1)
    expect(markdown.startsWith('# KI-Sammlung\n\nAlles zum Thema.')).toBe(true)
    expect(markdown.indexOf('## Notes/A (1)')).toBeLessThan(markdown.indexOf('## Notes/B (1)'))
    expect(markdown).toContain('- [[Notes/A/a|Alpha]] — Fundstelle 2')
    expect(markdown).toContain('## Nicht verlinkbar (1)')
    expect(markdown).toContain('## Seit der Suche geändert (1)')
    expect(markdown).toContain('sinngemäß')
    expect(markdown).not.toMatch(/^---/)
  })
})

describe('Name und Fundstelle', () => {
  it('nimmt den Dateinamen ohne Zeitstempel statt der H1', () => {
    expect(displayNameFromFile('202609011000 - 🟢 KI im Unterricht')).toBe('🟢 KI im Unterricht')
    expect(displayNameFromFile('Ohne Stempel')).toBe('Ohne Stempel')
    expect(displayNameFromFile('20260901')).toBe('20260901')
    expect(matchNote('202609011000 - 🟢 KI im Unterricht.md', '# Zusammenfassung\n\nKI hilft.', ['KI'])!.title).toBe('🟢 KI im Unterricht')
  })
  it('zeigt Fließtext vor der Überschrift und nie eine Raute', () => {
    expect(matchNote('x.md', '# Maschinelles Lernen\n\nBeim maschinellen Lernen findet ein Programm Muster.', ['maschinelles Lernen', 'maschinellen Lernen'])!.hit).toBe('Beim maschinellen Lernen findet ein Programm Muster.')
    expect(matchNote('x.md', '# Sprachmodelle verstehen\n\nAnderer Text.', ['Sprachmodell'])!.hit).toBe('Sprachmodelle verstehen')
  })
})

describe('relatedWords', () => {
  it('schlägt Wörter vor, die fast nur in den Treffern stehen', () => {
    const hits = [wordSet('Ein Sprachmodell und Unterricht'), wordSet('Das Sprachmodell im Unterricht'), wordSet('Lernen mit Daten')]
    const all = new Map<string, number>([['sprachmodell', 2], ['unterricht', 9], ['lernen', 1], ['daten', 1]])
    expect(relatedWords(hits, all, ['KI'])).toEqual(['sprachmodell'])
    expect(relatedWords(hits, all, ['Sprachmodell'])).toEqual([])
  })
})

describe('sinngemäße Ergänzung in Rückgabe und Sammelnotiz', () => {
  const base = { id: 'm1', terms: ['KI'], folders: ['Notizen'], scanned: 10, complete: true, incomplete: [] }
  const e = (n: number, relPath: string, semantic?: boolean): NoteSetEntry => ({ n, relPath, title: `T${n}`, hit: `Text ${n}`, score: semantic ? 0 : 1, hash: 'h', ...(semantic ? { semantic } : {}) })
  it('zeigt sinngemäße Treffer getrennt und mit Prüfauftrag', () => {
    const out = formatNoteSet({ ...base, entries: [e(1, 'Notizen/a.md'), e(2, 'Notizen/b.md', true)], semantic: { state: 'used', topic: 'künstliche Intelligenz', cut: 3 } })
    expect(out).toContain('1 Notizen mit Suchwort + 1 sinngemäß')
    expect(out.indexOf('SINNGEMÄSS (1)')).toBeGreaterThan(out.indexOf('n1 ·'))
    expect(out.indexOf('n2 ·')).toBeGreaterThan(out.indexOf('SINNGEMÄSS (1)'))
    expect(out).toContain('3 weitere, schwächere Kandidaten')
  })
  it('sagt, wenn die Ergänzung nicht möglich war', () => {
    const out = formatNoteSet({ ...base, entries: [e(1, 'Notizen/a.md')], semantic: { state: 'unavailable', topic: 'x', reason: 'kein Index' } })
    expect(out).toContain('nicht möglich (kein Index)')
    expect(out).not.toContain('SINNGEMÄSS (')
  })
  it('lässt bei vielen Worttreffern die sinngemäßen nicht aus der Liste fallen', () => {
    const many = Array.from({ length: NOTE_SET_MAX_LINES + 5 }, (_, i) => e(i + 1, `Notizen/w${i}.md`))
    const out = formatNoteSet({ ...base, entries: [...many, e(999, 'Notizen/s.md', true)], semantic: { state: 'used', topic: 'x' } })
    expect(out).toContain('n999 ·')
    expect(out).toContain('6 weitere Notizen stehen in der Menge')
  })
  it('schreibt einen eigenen Abschnitt in die Sammelnotiz', () => {
    const md = buildNoteList({ title: 'Liste', set: { ...base, semantic: { state: 'used', topic: 'x' } }, entries: [e(1, 'Notizen/a.md'), e(2, 'Notizen/Sub/b.md', true)], stale: [], date: '2026-11-25' }).markdown
    expect(md).toContain('1 Notizen mit Suchwort und 1 sinngemäß passende')
    expect(md).toContain('## Sinngemäß passend, ohne Suchwort (1)')
    expect(md).toContain('- [[Notizen/Sub/b|T2]] (Notizen/Sub) — Text 2')
    expect(md).not.toContain('## Notizen/Sub')
    const none = buildNoteList({ title: 'Liste', set: { ...base, semantic: { state: 'unavailable', topic: 'x', reason: 'kein Index' } }, entries: [e(1, 'Notizen/a.md')], stale: [], date: '2026-11-25' }).markdown
    expect(none).toContain('Ergänzung über den Vault-Index nicht möglich: kein Index')
  })
})

describe('semanticThreshold', () => {
  it('eicht sich an den schwächsten Notizen mit Suchwort, nicht am Ausreißer', () => {
    // Werte aus dem Testordner vom 25.11.2026: drei sinngemäße Notizen lagen bei 0,453 / 0,415 / 0,407.
    const lexical = [0.499, 0.492, 0.465, 0.437, 0.436, 0.432, 0.430, 0.417, 0.413, 0.410, 0.406, 0.405]
    const t = semanticThreshold(lexical, 0.48)
    expect(t).toBe(0.406)
    expect(semanticThreshold([...lexical, 0.2], 0.48)).toBe(0.405)
  })
  it('nimmt bei zu wenigen Vergleichswerten die feste Zahl', () => {
    expect(semanticThreshold([0.6, 0.2, 0.5], 0.48)).toBe(0.48)
    expect(semanticThreshold([], 0.48)).toBe(0.48)
  })
})
