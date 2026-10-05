import { describe, expect, it } from 'vitest'
import {
  buildPackages, chunkByTokens, dateOfFile, formatCoverage, groupOf, inDateRange, refsInFindings, splitLongLine, validateFindings, NO_DATE_GROUP
} from './folderDigest'

describe('dateOfFile', () => {
  it('Frontmatter vor Dateiname vor Ordnerpfad', () => {
    expect(dateOfFile('2026/03/2026-03-14.md', '---\ndate: 2026-01-02\n---\nText')).toEqual({ year: 2026, month: 1, day: 2 })
    expect(dateOfFile('2026/03/2026-03-14.md', 'Text')).toEqual({ year: 2026, month: 3, day: 14 })
    expect(dateOfFile('2026/03/eintrag.md', 'Text')).toEqual({ year: 2026, month: 3, day: null })
  })

  it('liest created und Zettel-IDs (JJJJMMTTHHmm)', () => {
    expect(dateOfFile('x.md', '---\ncreated: 2026-05-06T10:00\n---')).toEqual({ year: 2026, month: 5, day: 6 })
    expect(dateOfFile('x.md', '---\nid: 202604221336\n---')).toEqual({ year: 2026, month: 4, day: 22 })
    expect(dateOfFile('202604221336 - Notiz.md', '')).toEqual({ year: 2026, month: 4, day: 22 })
  })

  it('liest deutsche Daten TT.MM.JJJJ in Dateiname und Frontmatter', () => {
    expect(dateOfFile('Journal/05.10.2026.md', '')).toEqual({ year: 2026, month: 10, day: 5 })
    expect(dateOfFile('Journal/5.3.2026 Notiz.md', '')).toEqual({ year: 2026, month: 3, day: 5 })
    expect(dateOfFile('x.md', '---\ndate: 14.03.2026\n---')).toEqual({ year: 2026, month: 3, day: 14 })
    expect(dateOfFile('31.02.2026.md', '')).toBeNull()
    expect(dateOfFile('05.10.26.md', '')).toBeNull()
  })

  it('ungültige Daten zählen als ohne Datum', () => {
    expect(dateOfFile('2026-02-30.md', '')).toBeNull()
    expect(dateOfFile('notiz.md', '---\ndate: irgendwann\n---')).toBeNull()
  })
})

describe('groupOf', () => {
  const d = { year: 2026, month: 3, day: 14 }
  it('Monat, Quartal, ISO-Woche', () => {
    expect(groupOf('a.md', d, 'month')).toBe('2026-03')
    expect(groupOf('a.md', d, 'quarter')).toBe('2026-Q1')
    expect(groupOf('a.md', d, 'week')).toBe('2026-W11')
    expect(groupOf('a.md', { year: 2027, month: 1, day: 1 }, 'week')).toBe('2026-W53')
  })

  it('ohne (Tages-)Datum in eigene Gruppe, nie in einen Monat', () => {
    expect(groupOf('a.md', null, 'month')).toBe(NO_DATE_GROUP)
    expect(groupOf('a.md', { year: 2026, month: 3, day: null }, 'week')).toBe(NO_DATE_GROUP)
  })

  it('Unterordner relativ zur Basis', () => {
    expect(groupOf('Schule A/rueck.csv', null, 'subfolder')).toBe('Schule A')
    expect(groupOf('index.md', null, 'subfolder')).toBe('(direkt)')
    expect(groupOf('2026/03/a.md', null, 'subfolder', '2026')).toBe('2026/03')
  })
})

describe('inDateRange', () => {
  it('prüft Tag und überschneidende Monate', () => {
    expect(inDateRange({ year: 2026, month: 3, day: 14 }, '2026-03-01', '2026-03-31')).toBe(true)
    expect(inDateRange({ year: 2026, month: 4, day: 1 }, '2026-03-01', '2026-03-31')).toBe(false)
    expect(inDateRange({ year: 2026, month: 3, day: null }, '2026-03-15', '2026-04-30')).toBe(true)
    expect(inDateRange(null, '2026-01-01')).toBe(false)
    expect(inDateRange(null)).toBe(true)
  })
})

describe('buildPackages', () => {
  it('trennt Gruppen, teilt große Dateien in Abschnitte und verliert keine Zeile', () => {
    const big = Array.from({ length: 200 }, (_, i) => `Zeile ${i}: Die Robotik-AG baut einen Linienfolger.`).join('\n')
    const pkgs = buildPackages([
      { relPath: '01/a.md', group: '2026-01', text: 'kurz' },
      { relPath: '02/gross.md', group: '2026-02', text: big }
    ], 500)
    expect(pkgs[0]).toMatchObject({ group: '2026-01' })
    expect(pkgs[0].pieces.map(p => p.ref)).toEqual(['01/a.md'])
    const bigPieces = pkgs.filter(p => p.group === '2026-02').flatMap(p => p.pieces)
    expect(bigPieces.length).toBeGreaterThan(1)
    expect(bigPieces.map(p => p.ref)).toEqual(bigPieces.map((_, i) => `02/gross.md#${i + 1}`))
    expect(bigPieces.map(p => p.text).join('\n')).toBe(big)
  })
})

describe('überlange Zeilen (F42)', () => {
  it('teilt eine einzelne Riesenzeile in Abschnitte, die ins Paket passen, ohne Zeichen zu verlieren', () => {
    const line = '<div class="x">Robotik-AG Linienfolger 2026</div>'.repeat(400)
    const pkgs = buildPackages([{ relPath: 'seite.html', group: 'g', text: `Kopf\n${line}\nFuß` }], 500)
    for (const p of pkgs) expect(p.tokens).toBeLessThanOrEqual(500)
    const pieces = pkgs.flatMap(p => p.pieces)
    expect(pieces.length).toBeGreaterThan(2)
    expect(pieces.map(p => p.text).join('').replace(/\n/g, '')).toBe(`Kopf${line}Fuß`)
  })

  it('splitLongLine: jedes Stück passt, zusammen ergibt es die Zeile', () => {
    const line = '1234567890'.repeat(300)
    const parts = splitLongLine(line, 100)
    expect(parts.join('')).toBe(line)
    expect(parts.length).toBeGreaterThan(1)
  })
})

describe('validateFindings', () => {
  it('erfundene Abschnittsnummern fliegen raus (F41)', () => {
    const v = validateFindings('- a [a.md#5]\n- b [a.md]\n- c [g.md#3]', ['a.md', 'g.md#1', 'g.md#2'])
    expect(v.kept).toEqual(['- b [a.md]'])
    expect(v.dropped).toBe(2)
  })

  it('refsInFindings liefert die Fundstellen der Befunde', () => {
    expect(refsInFindings(['- x [a.md] [b.md#2]', '- y [c.md]'])).toEqual(['a.md', 'b.md#2', 'c.md'])
  })

  it('behält nur Befunde mit Fundstelle aus dem Paket', () => {
    const text = [
      'Hier die Befunde:',
      '- 14.03.: Robotik-AG Zweiter [2026/03/14.md]',
      '- Abschnitt [2026/03/gross.md#2]',
      '- ohne Fundstelle',
      '- fremd [anderer/ordner.md]',
      '* gemischt [2026/03/14.md] [fremd.md]'
    ].join('\n')
    const v = validateFindings(text, ['2026/03/14.md', '2026/03/gross.md#2'])
    expect(v.kept).toEqual(['- 14.03.: Robotik-AG Zweiter [2026/03/14.md]', '- Abschnitt [2026/03/gross.md#2]'])
    expect(v.dropped).toBe(3)
  })
})

describe('chunkByTokens', () => {
  it('teilt Zeilen in Bündel, die passen', () => {
    const lines = Array.from({ length: 10 }, () => 'x'.repeat(29))
    expect(chunkByTokens(lines, 33).map(c => c.length)).toEqual([3, 3, 3, 1])
  })
})

describe('formatCoverage', () => {
  it('nennt alle Zustände und geht auf die gefundenen Dateien auf', () => {
    const text = formatCoverage({
      found: 5,
      droppedFindings: 2,
      files: [
        { relPath: 'a.md', status: 'ausgewertet' },
        { relPath: 'b.md', status: 'abschnitte', parts: 3 },
        { relPath: 'c.pdf', status: 'teilweise', detail: 'gekürzt: nur die ersten 500 von 812 Seiten' },
        { relPath: 'd.md', status: 'ausgelassen', reason: 'Filter: Zeitraum' },
        { relPath: 'e.docx', status: 'fehler', reason: 'zu groß' }
      ]
    })
    expect(text).toContain('5 Dateien gefunden — 1 vollständig ausgewertet, 1 in Abschnitten vollständig ausgewertet, 1 nur teilweise lesbar, 1 ausgelassen, 1 nicht lesbar.')
    expect(text).toContain('1 × Filter: Zeitraum')
    expect(text).toContain('- c.pdf: gekürzt: nur die ersten 500 von 812 Seiten')
    expect(text).toContain('2 Befunde ohne gültige Fundstelle wurden verworfen.')
  })

  it('zählt vorab Ausgefiltertes mit und nennt Nicht-Lesbares (F39)', () => {
    const text = formatCoverage({
      found: 6,
      droppedFindings: 0,
      files: [{ relPath: 'a.md', status: 'ausgewertet' }, { relPath: 'b.md', status: 'ausgewertet' }],
      excluded: [{ reason: 'Filter: Format', count: 3 }, { reason: 'Filter: anderer Unterordner', count: 1 }],
      notReadable: { otherFormats: 2, hidden: 1, symlinks: 0 }
    })
    expect(text).toContain('6 Dateien gefunden — 2 vollständig ausgewertet, 0 in Abschnitten vollständig ausgewertet, 0 nur teilweise lesbar, 4 ausgelassen, 0 nicht lesbar.')
    expect(text).toContain('3 × Filter: Format, 1 × Filter: anderer Unterordner')
    expect(text).toContain('nicht mitgezählt und nicht gelesen: 2 in nicht lesbaren Formaten, 1 versteckte.')
  })
})
