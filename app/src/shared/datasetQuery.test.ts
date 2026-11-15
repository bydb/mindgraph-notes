import { describe, it, expect } from 'vitest'
import { parseListPage, tableFromObjects, parseNumber, queryDataset, DatasetQueryError, fillDatasetPlaceholders, markdownTable } from './datasetQuery'
import type { CollectedTable } from './tableCollect'

const orders = tableFromObjects([
  { number: 'PO-1', vendorNumber: 'V1', status: 'Open', amount: 100.1, expected: '2026-10-20' },
  { number: 'PO-2', vendorNumber: 'V1', status: 'Open', amount: 200.2, expected: '2026-11-05' },
  { number: 'PO-3', vendorNumber: 'V2', status: 'Received', amount: 50, expected: '2026-09-01' },
  { number: 'PO-4', vendorNumber: 'V2', status: 'Open', amount: 0.7, expected: '2026-10-31' },
  { number: 'PO-5', vendorNumber: 'V3', status: 'Open', amount: 999.99, expected: null }
], { file: 'ERP: List_PurchaseOrders', complete: true })
const vendors = tableFromObjects([
  { number: 'V1', displayName: 'Müller Druck GmbH', city: 'Kassel' },
  { number: 'V2', displayName: 'Weber Logistik KG', city: 'Fulda' },
  { number: 'V3', displayName: 'Koch Holzbau AG', city: 'kassel' }
], { file: 'ERP: List_Vendors', complete: true })
const get = (id: string): CollectedTable | null => (id === 'tabelle2' ? vendors : null)

describe('parseListPage', () => {
  it('OData mit nextLink und skip', () => {
    const p = parseListPage(JSON.stringify({ value: [{ a: 1 }], '@odata.nextLink': 'skip=50' }))
    expect(p).toEqual({ rows: [{ a: 1 }], nextSkip: 50, hasNextLink: true })
    expect(parseListPage(JSON.stringify({ value: [], '@odata.nextLink': 'https://x/api?$skip=100&$top=50' }))?.nextSkip).toBe(100)
  })
  it('nextLink ohne lesbaren Versatz: Verweis erkannt, Versatz unbekannt', () => {
    expect(parseListPage(JSON.stringify({ value: [{ a: 1 }], '@odata.nextLink': 'https://x/api?$skiptoken=abc' }))).toMatchObject({ nextSkip: null, hasNextLink: true })
  })
  it('reines Array und andere Listenfelder', () => {
    expect(parseListPage('[{"a":1},{"a":2}]')?.rows).toHaveLength(2)
    expect(parseListPage('{"items":[{"a":1}]}')?.rows).toHaveLength(1)
  })
  it('keine Liste von Objekten → null', () => {
    expect(parseListPage('Fehler: nicht gefunden')).toBeNull()
    expect(parseListPage('{"a":1}')).toBeNull()
    expect(parseListPage('[1,2,3]')).toBeNull()
  })
})

describe('tableFromObjects', () => {
  it('Spalten in Reihenfolge des ersten Auftretens, fehlende Felder leer, null leer', () => {
    const t = tableFromObjects([{ a: 1 }, { b: true, a: null }], { file: 'x', complete: false, message: 'Obergrenze' })
    expect(t.columns).toEqual(['a', 'b'])
    expect(t.rows).toEqual([['1', ''], ['', 'true']])
    expect(t.files[0]).toMatchObject({ status: 'teilweise', rows: 2, message: 'Obergrenze' })
  })
})

describe('parseNumber', () => {
  it('JSON, deutsch, englisch', () => {
    expect(parseNumber('12345.67')).toBe(12345.67)
    expect(parseNumber('12.345,67')).toBe(12345.67)
    expect(parseNumber('12,345.67')).toBe(12345.67)
    expect(parseNumber('1,5')).toBe(1.5)
    expect(parseNumber('100 €')).toBe(100)
  })
  it('nicht eindeutig oder leer → null, nie 0', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('PO-1')).toBeNull()
    expect(parseNumber('2026-10-01')).toBeNull()
  })
})

describe('queryDataset', () => {
  it('zählt exakt, auch mit Datumsbedingung (q5-Muster)', () => {
    const r = queryDataset(orders, { where: [{ column: 'status', op: 'eq', value: 'Open' }, { column: 'expected', op: 'lt', value: '2026-11-01' }], aggregates: [{ op: 'count' }] }, get)
    expect(r.table.columns).toEqual(['Anzahl'])
    expect(r.table.rows).toEqual([['2']])
  })
  it('null Treffer ohne group_by: Anzahl 0 statt keiner Zeile', () => {
    const r = queryDataset(orders, { where: [{ column: 'status', op: 'eq', value: 'Storniert' }], aggregates: [{ op: 'count' }, { op: 'sum', column: 'amount' }] }, get)
    expect(r.table.rows).toEqual([['0', '']])
  })
  it('Rangliste: Summe je Lieferant, absteigend, Top-N (q4-Muster), ohne Gleitkomma-Drift', () => {
    const r = queryDataset(orders, {
      where: [{ column: 'status', op: 'eq', value: 'Open' }],
      group_by: ['vendorNumber'], aggregates: [{ op: 'sum', column: 'amount', as: 'Summe' }, { op: 'count' }],
      order_by: [{ column: 'Summe', desc: true }], limit: 2
    }, get)
    expect(r.table.columns).toEqual(['vendorNumber', 'Summe', 'Anzahl'])
    expect(r.table.rows).toEqual([['V3', '999.99', '1'], ['V1', '300.3', '2']])
    expect(r.totalBeforeLimit).toBe(3)
  })
  it('Verknüpfung mit Bedingung auf der verknüpften Spalte (q6-Muster), Groß/Klein egal', () => {
    const r = queryDataset(orders, {
      join: { dataset: 'tabelle2', left: 'vendorNumber', right: 'number', columns: ['displayName', 'city'] },
      where: [{ column: 'status', op: 'eq', value: 'Open' }, { column: 'city', op: 'eq', value: 'Kassel' }],
      select: ['number', 'displayName', 'amount']
    }, get)
    expect(r.table.rows).toEqual([['PO-1', 'Müller Druck GmbH', '100.1'], ['PO-2', 'Müller Druck GmbH', '200.2'], ['PO-5', 'Koch Holzbau AG', '999.99']])
  })
  it('gleichnamige Spalte aus der Verknüpfung bekommt den Datensatz als Vorsilbe', () => {
    const r = queryDataset(orders, { join: { dataset: 'tabelle2', left: 'vendorNumber', right: 'number', columns: ['number'] }, limit: 1 }, get)
    expect(r.table.columns).toContain('tabelle2.number')
  })
  it('in, contains, empty, gt mit Zahl', () => {
    expect(queryDataset(orders, { where: [{ column: 'number', op: 'in', value: ['PO-1', 'po-3'] }] }, get).table.rows).toHaveLength(2)
    expect(queryDataset(orders, { where: [{ column: 'number', op: 'contains', value: '-4' }] }, get).table.rows).toHaveLength(1)
    expect(queryDataset(orders, { where: [{ column: 'expected', op: 'empty' }] }, get).table.rows).toHaveLength(1)
    expect(queryDataset(orders, { where: [{ column: 'amount', op: 'gt', value: 100 }] }, get).table.rows.map(r => r[0])).toEqual(['PO-1', 'PO-2', 'PO-5'])
  })
  it('meldet nicht lesbare Zahlen statt sie still als 0 zu zählen', () => {
    const t = tableFromObjects([{ x: '5' }, { x: 'n/a' }], { file: 'f', complete: true })
    const r = queryDataset(t, { aggregates: [{ op: 'sum', column: 'x' }] }, get)
    expect(r.table.rows).toEqual([['5']])
    expect(r.nonNumeric).toEqual([{ column: 'x', count: 1, example: 'n/a' }])
  })
  it('Fehler laut: unbekannte Spalte nennt die vorhandenen, unbekannter Operator', () => {
    expect(() => queryDataset(orders, { where: [{ column: 'Betrag', op: 'gt', value: 1 }] }, get)).toThrow(/Spalte „Betrag“ gibt es nicht. Vorhanden: number/)
    expect(() => queryDataset(orders, { where: [{ column: 'amount', op: 'gröer' as never, value: 1 }] }, get)).toThrow(DatasetQueryError)
    expect(() => queryDataset(orders, { aggregates: [{ op: 'sum' }] }, get)).toThrow(/braucht eine Spalte/)
    expect(() => queryDataset(orders, { join: { dataset: 'tabelle9', left: 'a', right: 'b' } }, get)).toThrow(/tabelle9/)
  })
  it('Spaltenname ohne Groß/Klein, wenn eindeutig', () => {
    expect(queryDataset(orders, { select: ['NUMBER'], limit: 1 }, get).table.rows).toEqual([['PO-1']])
  })
  it('leere Zellen beim Sortieren immer zuletzt', () => {
    const r = queryDataset(orders, { order_by: [{ column: 'expected', desc: true }], select: ['number'] }, get)
    expect(r.table.rows.at(-1)).toEqual(['PO-5'])
  })
})

describe('fillDatasetPlaceholders', () => {
  it('ersetzt bekannte Datensätze, meldet fehlende und zu große', () => {
    const big: CollectedTable = { columns: ['a'], rows: Array.from({ length: 5 }, (_, i) => [String(i)]), files: [] }
    const res = fillDatasetPlaceholders('A\n{{datensatz:tabelle2}}\nB {{ datensatz: tabelle7 }} {{datensatz:gross}}', id => (id === 'tabelle2' ? vendors : id === 'gross' ? big : null), 3)
    expect(res.markdown).toContain(markdownTable(vendors))
    expect(res.missing).toEqual(['tabelle7'])
    expect(res.tooLarge).toEqual(['gross'])
  })
})
