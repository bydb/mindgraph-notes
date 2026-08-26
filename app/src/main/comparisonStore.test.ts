// Die Kampagnen-Datei ist die Beweisgrundlage einer Auswertung. Zwei Fehler wären hier
// besonders teuer: gleichzeitige Schreibvorgänge, die einen Fall verschlucken, und eine
// beschädigte Zeile, die die ganze Kampagne mitreißt.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

let userDataDir = ''
vi.mock('electron', () => ({ app: { getPath: () => userDataDir } }))

import { loadComparisons, updateComparisons, mainRandom } from './comparisonStore'
import type { ComparisonCase } from '../shared/comparison/types'

const VAULT = '/tmp/ein-vault'
const T0 = new Date('2026-08-26T09:00:00').getTime()

const fall = (id: string, over: Partial<ComparisonCase> = {}): ComparisonCase => ({
  id, campaignId: 'k1', label: `Fall ${id}`, arm: 'mindgraph', imbalanceAtDraw: 0,
  state: 'offen', createdAt: T0, sessions: [], ...over
})

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-vergleich-'))
})

afterEach(async () => {
  await fs.rm(userDataDir, { recursive: true, force: true })
})

describe('updateComparisons', () => {
  it('verliert bei gleichzeitigen Änderungen keinen Fall', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        updateComparisons(VAULT, d => ({ ...d, cases: [...d.cases, fall(`f${i}`)] }))
      )
    )
    expect((await loadComparisons(VAULT)).cases).toHaveLength(20)
  })

  it('lässt die Datei unverändert, wenn ein verbotener Übergang auffliegt', async () => {
    await updateComparisons(VAULT, d => ({ ...d, cases: [fall('f1')] }))
    await expect(updateComparisons(VAULT, () => { throw new Error('Endzustand ist endgültig') }))
      .rejects.toThrow(/endgültig/)
    const nachher = await loadComparisons(VAULT)
    expect(nachher.cases).toHaveLength(1)
    expect(nachher.cases[0].id).toBe('f1')
  })

  it('wirft beschädigte Fälle weg, statt die Kampagne zu verlieren', async () => {
    await updateComparisons(VAULT, d => ({ ...d, cases: [fall('gut')] }))
    const datei = path.join(userDataDir, 'comparisons', (await fs.readdir(path.join(userDataDir, 'comparisons')))[0])
    const inhalt = JSON.parse(await fs.readFile(datei, 'utf-8'))
    // Ein Fall ohne Weg: der gefährlichste Fund, weil er sich nachträglich zuteilen ließe.
    inhalt.cases.push({ ...fall('kaputt'), arm: undefined })
    await fs.writeFile(datei, JSON.stringify(inhalt), 'utf-8')

    const geladen = await loadComparisons(VAULT)
    expect(geladen.cases.map(c => c.id)).toEqual(['gut'])
  })

  it('liefert für einen unbekannten Vault eine leere Kampagne statt eines Fehlers', async () => {
    expect(await loadComparisons('/tmp/nie-benutzt')).toEqual({ campaigns: [], cases: [] })
  })

  it('legt je Vault eine eigene Datei an, ohne den Pfad preiszugeben', async () => {
    await updateComparisons(VAULT, d => ({ ...d, cases: [fall('a')] }))
    await updateComparisons('/tmp/anderer', d => ({ ...d, cases: [fall('b')] }))
    const dateien = await fs.readdir(path.join(userDataDir, 'comparisons'))
    expect(dateien).toHaveLength(2)
    for (const name of dateien) expect(name).toMatch(/^[0-9a-f]{16}\.json$/)
  })
})

describe('mainRandom', () => {
  it('liefert Werte in [0,1) — die Zuteilung würde sonst abbrechen', () => {
    for (let i = 0; i < 200; i++) {
      const w = mainRandom()
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThan(1)
    }
  })
})
