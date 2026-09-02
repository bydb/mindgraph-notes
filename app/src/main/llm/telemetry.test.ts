// Sammelstelle: Aufrufe je Lauf in einen Korb legen und am Lauf-Ende summieren.
//
// Der Fehler, der hier leise passieren würde: Der letzte Cloud-Aufruf eines Laufs
// wartet noch auf seinen Katalogpreis, der Lauf meldet „fertig", die Bilanz wird
// geschrieben — ohne den teuersten Aufruf. Niemand sähe es, die Summe wäre nur zu klein.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('./telemetryLedger', () => ({ recordTelemetryRun: () => undefined }))

import { recordLlmRun, collectRunTotals, trackPendingTelemetry, setTelemetryVault } from './telemetry'
import type { LlmRunMetrics } from '../../shared/llmTelemetry'

function run(partial: Partial<LlmRunMetrics>): LlmRunMetrics {
  return { at: Date.now(), module: 'note-agent', model: 'm', backend: 'ollama', wallMs: 100, ...partial }
}

beforeEach(() => setTelemetryVault('/tmp/vault'))

describe('collectRunTotals', () => {
  it('summiert alle Aufrufe eines Laufs und lässt fremde Läufe in Ruhe', async () => {
    recordLlmRun(run({ runId: 'a', promptTokens: 100, outputTokens: 10, promptEvalMs: 200, evalMs: 300 }))
    recordLlmRun(run({ runId: 'a', promptTokens: 250, outputTokens: 20, promptEvalMs: 400, evalMs: 500 }))
    recordLlmRun(run({ runId: 'b', promptTokens: 1 }))
    recordLlmRun(run({ promptTokens: 999 }))
    const a = await collectRunTotals('a')
    expect(a).toEqual({ calls: 2, callsWithoutTokens: 0, cloudCalls: 0, promptTokens: 350, completionTokens: 30, computeMs: 1400 })
    const b = await collectRunTotals('b')
    expect(b?.calls).toBe(1)
  })

  it('ist nach dem Abholen leer — ein zweites Abholen liefert „nicht gemessen"', async () => {
    recordLlmRun(run({ runId: 'c' }))
    expect((await collectRunTotals('c'))?.calls).toBe(1)
    expect(await collectRunTotals('c')).toBeUndefined()
  })

  it('liefert undefined für einen Lauf ohne einen einzigen Aufruf', async () => {
    expect(await collectRunTotals('nie-gesehen')).toBeUndefined()
  })

  it('wartet eine noch laufende Cloud-Erfassung ab, statt den letzten Aufruf zu verpassen', async () => {
    recordLlmRun(run({ runId: 'd', backend: 'openrouter', costUsd: 0.01, costSource: 'reported' }))
    // Die Preisabfrage des letzten Aufrufs ist noch unterwegs …
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
      .then(() => recordLlmRun(run({ runId: 'd', backend: 'openrouter', costUsd: 0.05, costSource: 'computed' })))
    trackPendingTelemetry('d', pending)

    const totals = collectRunTotals('d')
    let done = false
    void totals.then(() => { done = true })
    await Promise.resolve()
    expect(done).toBe(false)

    release()
    const t = await totals
    expect(t?.calls).toBe(2)
    expect(t?.cloudCalls).toBe(2)
    expect(t?.costReportedUsd).toBe(0.01)
    expect(t?.costComputedUsd).toBe(0.05)
    expect(t?.unpricedCalls).toBe(0)
  })

  it('bleibt nicht hängen, wenn die Erfassung scheitert', async () => {
    recordLlmRun(run({ runId: 'e' }))
    trackPendingTelemetry('e', Promise.reject(new Error('Preiskatalog nicht erreichbar')))
    const t = await collectRunTotals('e')
    expect(t?.calls).toBe(1)
  })
})
