import { describe, it, expect } from 'vitest'
import { sheetColumnWidths, autofilterRef } from './sheetLayout'

describe('sheetColumnWidths', () => {
  it('richtet sich nach dem längsten Wert und lässt Luft', () => {
    expect(sheetColumnWidths([['Nr.', 'E-Mail'], [1, 'hoffmann@gs-nordpark.de']])).toEqual([{ wch: 7 }, { wch: 25 }])
  })
  it('deckelt sehr lange Werte und zählt bei Umbrüchen die längste Zeile', () => {
    const w = sheetColumnWidths([['x'.repeat(200)], ['kurz\n' + 'y'.repeat(20)]])
    expect(w).toEqual([{ wch: 60 }])
    expect(sheetColumnWidths([['a\n' + 'b'.repeat(10)]])).toEqual([{ wch: 14 }])
  })
  it('kommt mit Lücken und ungleich langen Zeilen klar', () => {
    expect(sheetColumnWidths([['a'], ['bb', null, 'cccccccc']])).toEqual([{ wch: 6 }, { wch: 6 }, { wch: 10 }])
  })
})

describe('autofilterRef', () => {
  it('spannt Kopf und Daten auf', () => {
    expect(autofilterRef([['a', 'b', 'c'], [1, 2, 3], [4, 5, 6]])).toBe('A1:C3')
  })
  it('kennt Spalten jenseits von Z', () => {
    expect(autofilterRef([Array(28).fill('h'), Array(28).fill(1)])).toBe('A1:AB2')
  })
  it('liefert null ohne Datenzeilen', () => {
    expect(autofilterRef([['nur Kopf']])).toBeNull()
    expect(autofilterRef([])).toBeNull()
  })
})
