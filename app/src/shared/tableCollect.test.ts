import { describe, it, expect } from 'vitest'
import {
  normalizeHeaderCell, findHeaderRow, matchColumns, parseCellDate, rowMatchesFilters,
  extractFromSheet, pickSheet, problemFiles, formatCollectReport, parseDelimitedText,
  type SheetLike, type FileCollectStatus
} from './tableCollect'

describe('normalizeHeaderCell', () => {
  it('löst Umlaute auf und entfernt Trennzeichen', () => {
    expect(normalizeHeaderCell('Name, Vorname')).toBe('namevorname')
    expect(normalizeHeaderCell('Name/Vorname')).toBe('namevorname')
    expect(normalizeHeaderCell('Ausgeschieden zum')).toBe('ausgeschiedenzum')
    expect(normalizeHeaderCell('Schulgröße')).toBe('schulgroesse')
  })
})

describe('findHeaderRow', () => {
  it('überspringt Titelzeilen mit nur einer befüllten Zelle', () => {
    const rows = [
      ['Rückmeldung Schuljahr 2025/26', '', ''],
      ['', '', ''],
      ['Name', 'Fach', 'Ausgeschieden'],
      ['Meier', 'Mathematik', 'ja']
    ]
    expect(findHeaderRow(rows)).toBe(2)
  })

  it('liefert -1, wenn es keine Zeile mit zwei Zellen gibt', () => {
    expect(findHeaderRow([['nur eins'], [''], ['']])).toBe(-1)
  })
})

describe('matchColumns', () => {
  it('findet exakte, präfix- und teilstring-Treffer', () => {
    const header = ['Lfd. Nr.', 'Name, Vorname', 'Unterrichtsfach', 'Ausgeschieden zum']
    const m = matchColumns(header, ['Name', 'Ausgeschieden'])
    expect(m[0].index).toBe(1)
    expect(m[0].header).toBe('Name, Vorname')
    expect(m[1].index).toBe(3)
  })

  it('vergibt jede Überschrift höchstens einmal', () => {
    const header = ['Name', 'Nachname']
    const m = matchColumns(header, ['Name', 'Nachname'])
    expect(m[0].index).toBe(0)
    expect(m[1].index).toBe(1)
  })

  it('meldet fehlende Spalten mit -1', () => {
    const m = matchColumns(['Name'], ['Name', 'Besoldungsgruppe'])
    expect(m[1].index).toBe(-1)
    expect(m[1].header).toBeUndefined()
  })
})

describe('parseCellDate', () => {
  it('erkennt ISO und deutsches Datum', () => {
    expect(parseCellDate('2026-07-31')).toBe('2026-07-31')
    expect(parseCellDate('31.07.2026')).toBe('2026-07-31')
    expect(parseCellDate('1.8.26')).toBe('2026-08-01')
  })

  it('gibt null bei Freitext zurück', () => {
    expect(parseCellDate('zum Schuljahresende')).toBeNull()
    expect(parseCellDate('')).toBeNull()
  })
})

describe('rowMatchesFilters', () => {
  const row = { Name: 'Meier', Ausgeschieden: 'ja', Datum: '31.07.2026' }

  it('nicht_leer und gleich', () => {
    expect(rowMatchesFilters(row, [{ column: 'Name', op: 'nicht_leer' }])).toBe(true)
    expect(rowMatchesFilters(row, [{ column: 'Ausgeschieden', op: 'gleich', value: 'JA' }])).toBe(true)
    expect(rowMatchesFilters(row, [{ column: 'Ausgeschieden', op: 'gleich', value: 'nein' }])).toBe(false)
  })

  it('datum_zwischen nutzt geparste Datumswerte', () => {
    expect(rowMatchesFilters(row, [{ column: 'Datum', op: 'datum_zwischen', from: '2025-08-01', to: '2026-07-31' }])).toBe(true)
    expect(rowMatchesFilters(row, [{ column: 'Datum', op: 'datum_zwischen', from: '2026-08-01' }])).toBe(false)
  })

  it('unlesbares Datum fällt raus statt durchzurutschen', () => {
    expect(rowMatchesFilters({ Datum: 'Schuljahresende' }, [{ column: 'Datum', op: 'datum_zwischen', from: '2025-08-01' }])).toBe(false)
  })

  it('verknüpft mehrere Filter mit UND', () => {
    expect(rowMatchesFilters(row, [
      { column: 'Name', op: 'nicht_leer' },
      { column: 'Ausgeschieden', op: 'enthaelt', value: 'ja' }
    ])).toBe(true)
    expect(rowMatchesFilters(row, [
      { column: 'Name', op: 'nicht_leer' },
      { column: 'Ausgeschieden', op: 'enthaelt', value: 'nein' }
    ])).toBe(false)
  })
})

describe('extractFromSheet', () => {
  const sheet: SheetLike = {
    name: 'Rückmeldung',
    rows: [
      ['Rückmeldung der Schule', '', ''],
      ['Name, Vorname', 'Fach', 'Ausgeschieden zum'],
      ['Meier, Anna', 'Mathematik', '31.07.2026'],
      ['', '', ''],
      ['Schulz, Ben', 'Deutsch', ''],
      ['', '', '']
    ]
  }

  it('zieht die gewünschten Spalten und überspringt Leerzeilen', () => {
    const res = extractFromSheet(sheet, ['Name', 'Ausgeschieden'])
    expect(res.headerRowIndex).toBe(1)
    expect(res.rows).toEqual([['Meier, Anna', '31.07.2026'], ['Schulz, Ben', '']])
    expect(res.missingColumns).toEqual([])
    expect(res.dataRowCount).toBe(2)
  })

  it('füllt fehlende Spalten leer auf und meldet sie', () => {
    const res = extractFromSheet(sheet, ['Name', 'Besoldung'])
    expect(res.missingColumns).toEqual(['Besoldung'])
    expect(res.rows).toEqual([['Meier, Anna', ''], ['Schulz, Ben', '']])
  })

  it('zählt gefilterte Zeilen getrennt', () => {
    const res = extractFromSheet(sheet, ['Name', 'Ausgeschieden'], [{ column: 'Ausgeschieden', op: 'nicht_leer' }])
    expect(res.rows).toEqual([['Meier, Anna', '31.07.2026']])
    expect(res.dataRowCount).toBe(2)
    expect(res.filteredOutCount).toBe(1)
  })

  it('liefert ohne Kopfzeile nichts, statt die erste Datenzeile zu opfern', () => {
    const res = extractFromSheet({ name: 'x', rows: [['einzeln'], ['']] }, ['Name'])
    expect(res.headerRowIndex).toBe(-1)
    expect(res.rows).toEqual([])
    expect(res.missingColumns).toEqual(['Name'])
  })
})

describe('pickSheet', () => {
  const sheets: SheetLike[] = [{ name: 'Tabelle1', rows: [] }, { name: 'Auswertung', rows: [] }]

  it('nimmt ohne Angabe das erste Blatt', () => {
    expect(pickSheet(sheets)?.name).toBe('Tabelle1')
  })

  it('findet per Name und per Nummer', () => {
    expect(pickSheet(sheets, 'auswertung')?.name).toBe('Auswertung')
    expect(pickSheet(sheets, '2')?.name).toBe('Auswertung')
  })

  it('liefert null bei unbekanntem Blatt', () => {
    expect(pickSheet(sheets, 'Gibtsnicht')).toBeNull()
  })
})

describe('parseDelimitedText', () => {
  it('erkennt Semikolon vor Komma (deutsche Excel-Exporte)', () => {
    expect(parseDelimitedText('Name;Ort\nMeier;Gießen, Hessen')).toEqual([
      ['Name', 'Ort'],
      ['Meier', 'Gießen, Hessen']
    ])
  })

  it('behandelt Anführungszeichen inkl. Trennzeichen und doppelter Quotes', () => {
    expect(parseDelimitedText('a;b\n"x;y";"er sagte ""hallo"""')).toEqual([
      ['a', 'b'],
      ['x;y', 'er sagte "hallo"']
    ])
  })

  it('kommt mit CRLF und BOM klar', () => {
    expect(parseDelimitedText('﻿a;b\r\n1;2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('formatCollectReport', () => {
  const files: FileCollectStatus[] = [
    { file: 'a.xlsx', status: 'ok', rows: 2 },
    { file: 'b.xlsx', status: 'teilweise', rows: 1, missingColumns: ['Besoldung'] },
    { file: 'c.xlsx', status: 'fehler', rows: 0, message: 'Datei beschädigt' }
  ]

  it('nennt Kennzahlen, Beispielzeilen und Problemdateien', () => {
    const out = formatCollectReport('d1', {
      columns: ['Name', 'Fach'],
      rows: [['Meier', 'Mathematik'], ['Schulz', 'Deutsch'], ['Nowak', 'Physik']],
      files
    }, { sampleRows: 2 })
    expect(out).toContain('3 Zeilen aus 3 Dateien')
    expect(out).toContain('Beispielzeilen (2 von 3)')
    expect(out).toContain('b.xlsx')
    expect(out).toContain('c.xlsx — fehler (Datei beschädigt)')
    expect(out).toContain('dataset="d1"')
    // Die dritte Zeile darf NICHT im Bericht stehen — sonst läuft doch alles durch den Kontext.
    expect(out).not.toContain('Nowak')
  })

  it('sagt es deutlich, wenn nichts gefunden wurde', () => {
    const out = formatCollectReport('d2', { columns: ['Name'], rows: [], files: [] })
    expect(out).toContain('Keine Zeilen gefunden')
  })

  // Regression: Eine gekappte Auswertung darf sich nicht wie eine vollständige lesen.
  // Vorher wurden nicht mehr gelesene Dateien als „leer" geführt — der Nutzer hätte
  // ein unvollständiges Ergebnis für vollständig gehalten.
  it('warnt oben, wenn Dateien wegen einer Obergrenze gar nicht gelesen wurden', () => {
    const out = formatCollectReport('d3', {
      columns: ['Name'],
      rows: [['Meier']],
      files: [
        { file: 'a.xlsx', status: 'ok', rows: 1 },
        { file: 'b.xlsx', status: 'nicht_ausgewertet', rows: 0, message: 'Zeilen-Obergrenze (20000) erreicht — Datei nicht mehr gelesen' },
        { file: 'c.xlsx', status: 'nicht_ausgewertet', rows: 0, message: 'Datei-Obergrenze (300) erreicht — Datei nicht gelesen' }
      ]
    })
    expect(out).toContain('2 Dateien wurden wegen einer Obergrenze GAR NICHT ausgewertet')
    expect(out).toContain('Auswertung ist unvollständig')
    expect(out).toContain('b.xlsx — nicht_ausgewertet')
  })

  it('schweigt über Obergrenzen, wenn es keine gab', () => {
    const out = formatCollectReport('d4', {
      columns: ['Name'],
      rows: [['Meier']],
      files: [{ file: 'a.xlsx', status: 'ok', rows: 1 }]
    })
    expect(out).not.toContain('Obergrenze')
  })
})

describe('problemFiles', () => {
  it('lässt nur auffällige Dateien übrig', () => {
    const files: FileCollectStatus[] = [
      { file: 'a', status: 'ok', rows: 1 },
      { file: 'b', status: 'leer', rows: 0 }
    ]
    expect(problemFiles(files).map(f => f.file)).toEqual(['b'])
  })
})
