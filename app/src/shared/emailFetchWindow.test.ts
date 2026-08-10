import { describe, it, expect } from 'vitest'
import { selectFetchBatch, shouldAdvanceCursor, type FetchCandidate } from './emailFetchWindow'

const c = (uid: number, id = `m${uid}`): FetchCandidate => ({ uid, messageId: id })

describe('selectFetchBatch', () => {
  it('nimmt die neuesten unbekannten, nicht die neuesten überhaupt', () => {
    // Der real aufgetretene Fall: Die zwei neuesten sind längst bekannt. Vorher
    // belegten genau sie die beiden Plätze — es kam nie etwas Neues an.
    const candidates = [c(101), c(102), c(103), c(104), c(105)]
    const known = new Set(['m104', 'm105'])
    const sel = selectFetchBatch(candidates, known, 2)
    expect(sel.selectedUids).toEqual([103, 102])
    expect(sel.knownCount).toBe(2)
    expect(sel.skippedCount).toBe(1)
  })

  it('meldet nichts übrig, wenn alles ins Kontingent passt', () => {
    const sel = selectFetchBatch([c(1), c(2)], new Set(), 5)
    expect(sel.selectedUids).toEqual([2, 1])
    expect(sel.skippedCount).toBe(0)
  })

  it('kommt Runde für Runde voran, bis der Rückstand abgearbeitet ist', () => {
    const candidates = [c(1), c(2), c(3), c(4), c(5)]
    const known = new Set<string>()
    const runden: number[][] = []
    for (let i = 0; i < 3; i++) {
      const sel = selectFetchBatch(candidates, known, 2)
      runden.push(sel.selectedUids)
      sel.selectedUids.forEach(uid => known.add(`m${uid}`))
    }
    expect(runden).toEqual([[5, 4], [3, 2], [1]])
    expect(selectFetchBatch(candidates, known, 2).skippedCount).toBe(0)
  })

  it('wählt nichts aus, wenn alle Kandidaten bekannt sind', () => {
    const sel = selectFetchBatch([c(1), c(2)], new Set(['m1', 'm2']), 2)
    expect(sel.selectedUids).toEqual([])
    expect(sel.skippedCount).toBe(0)
    expect(sel.knownCount).toBe(2)
  })

  it('verträgt ein Kontingent von 0 ohne negative Zahlen', () => {
    const sel = selectFetchBatch([c(1), c(2)], new Set(), 0)
    expect(sel.selectedUids).toEqual([])
    expect(sel.skippedCount).toBe(2)
  })
})

describe('shouldAdvanceCursor', () => {
  it('rückt vor, wenn nichts übrig blieb', () => {
    expect(shouldAdvanceCursor(0, 2, 2)).toBe(true)
  })

  it('bleibt stehen, solange etwas übrig ist — sonst fällt es aus dem Zeitfenster', () => {
    expect(shouldAdvanceCursor(1, 2, 2)).toBe(false)
    expect(shouldAdvanceCursor(47, 2, 2)).toBe(false)
  })

  it('rückt trotz Rückstand vor, wenn von der Auswahl nichts ankam', () => {
    // Sonst Dauerstillstand: Verschwindet eine Nachricht zwischen Umschlag- und
    // Volltextabruf, käme dieselbe Auswahl in jeder Runde erneut und der
    // gesamte Posteingang bliebe stehen.
    expect(shouldAdvanceCursor(5, 2, 0)).toBe(true)
  })

  it('bleibt stehen, wenn wenigstens eine Mail ankam — es geht ja voran', () => {
    expect(shouldAdvanceCursor(5, 2, 1)).toBe(false)
  })

  it('bleibt stehen, wenn gar nichts ausgewählt wurde, aber etwas übrig ist', () => {
    // Kontingent 0 o. Ä. — hier hilft Vorrücken nicht, es würde nur verlieren.
    expect(shouldAdvanceCursor(3, 0, 0)).toBe(false)
  })
})
