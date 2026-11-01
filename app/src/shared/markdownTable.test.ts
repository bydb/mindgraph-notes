import { describe, it, expect } from 'vitest'
import { parseMarkdownTable, splitTableRow, isSeparatorRow, isTableLine } from './markdownTable'

describe('splitTableRow', () => {
  it('zerlegt eine Zeile mit Randpipes', () => {
    expect(splitTableRow('| a | b | c |')).toEqual(['a', 'b', 'c'])
  })
  it('akzeptiert fehlende Randpipe am Ende', () => {
    expect(splitTableRow('| a | b')).toEqual(['a', 'b'])
  })
  it('behält leere Zellen in der Mitte', () => {
    expect(splitTableRow('| a |  | c |')).toEqual(['a', '', 'c'])
  })
  it('trennt nicht an \\| und nicht in Code', () => {
    expect(splitTableRow('| x \\| y | `a|b` |')).toEqual(['x | y', '`a|b`'])
  })
})

describe('isSeparatorRow', () => {
  it('erkennt Trennzeilen mit Ausrichtung', () => {
    expect(isSeparatorRow('|---|:--:|--:|')).toBe(true)
    expect(isSeparatorRow('| --- | --- |')).toBe(true)
  })
  it('lehnt Inhaltszeilen ab', () => {
    expect(isSeparatorRow('| a | --- |')).toBe(false)
    expect(isSeparatorRow('---')).toBe(false)
  })
})

describe('parseMarkdownTable', () => {
  it('liest Kopf, Zeilen und Ausrichtung', () => {
    const t = parseMarkdownTable(['| Aufgabe | Wer | Bis |', '|---|:-:|--:|', '| Catering | Verwaltung | 15.07. |'])
    expect(t).toEqual({
      header: ['Aufgabe', 'Wer', 'Bis'],
      rows: [['Catering', 'Verwaltung', '15.07.']],
      align: [null, 'center', 'right'],
      columns: 3
    })
  })
  it('lässt einen leeren Platzhalter-Kopf weg (Eckdaten-Tabelle aus dem echten Protokoll)', () => {
    const t = parseMarkdownTable(['| | |', '|---|---|', '| **Anlass** | Teamsitzung |', '| **Datum** | 02.07.2026 |'])
    expect(t?.header).toBeNull()
    expect(t?.rows).toEqual([['**Anlass**', 'Teamsitzung'], ['**Datum**', '02.07.2026']])
  })
  it('füllt kurze Zeilen auf die Spaltenzahl auf', () => {
    const t = parseMarkdownTable(['| a | b | c |', '|---|---|---|', '| 1 |'])
    expect(t?.rows).toEqual([['1', '', '']])
  })
  it('ist ohne Trennzeile keine Tabelle', () => {
    expect(parseMarkdownTable(['| a | b |', '| 1 | 2 |'])).toBeNull()
    expect(parseMarkdownTable(['| a | b |'])).toBeNull()
  })
  it('isTableLine erkennt eingerückte Zeilen', () => {
    expect(isTableLine('  | a |')).toBe(true)
    expect(isTableLine('a | b')).toBe(false)
  })
})
