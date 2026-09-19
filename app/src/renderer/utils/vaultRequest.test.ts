import { describe, it, expect } from 'vitest'
import { createVaultRequester, type VaultRequestDeps } from './vaultRequest'
import type { VaultRagAnswerDone } from '../../shared/types'

function harness(answerImpl?: VaultRequestDeps['answer']) {
  const log: string[] = []
  let chunkCb: ((p: { requestId: string; chunk: string }) => void) | null = null
  let doneCb: ((p: VaultRagAnswerDone) => void) | null = null
  let resolveAnswer: ((r: { success: boolean; error?: string }) => void) | null = null
  let n = 0
  const deps: VaultRequestDeps = {
    subscribeChunk: (cb) => { chunkCb = cb; return () => { if (chunkCb === cb) chunkCb = null; log.push('offChunk') } },
    subscribeDone: (cb) => { doneCb = cb; return () => { if (doneCb === cb) doneCb = null; log.push('offDone') } },
    answer: answerImpl ?? (() => new Promise((resolve) => { resolveAnswer = resolve })),
    cancelRemote: (id) => log.push(`cancelRemote ${id}`),
    onChunk: (c) => log.push(`chunk ${c}`),
    onDone: (p) => log.push(`done ${p.kind}`),
    onFailure: (e) => log.push(`failure ${e}`),
    onReset: () => log.push('reset'),
    newRequestId: () => `req-${++n}`
  }
  return {
    deps, log,
    req: createVaultRequester(deps),
    emitChunk: (requestId: string, chunk: string) => chunkCb?.({ requestId, chunk }),
    emitDone: (p: VaultRagAnswerDone) => doneCb?.(p),
    hasListeners: () => !!chunkCb || !!doneCb,
    resolveAnswer: (r: { success: boolean; error?: string }) => resolveAnswer?.(r)
  }
}

const cancelled = (requestId: string): VaultRagAnswerDone => ({ requestId, kind: 'cancelled' } as VaultRagAnswerDone)

describe('Vault-Anfrage (F41)', () => {
  it('Vault-Wechsel im Retrieval: Listener ab, Main informiert, Zustand zurückgesetzt; spätes cancelled-Ereignis und späte IPC-Rückgabe ignoriert', async () => {
    const h = harness()
    const id = h.req.start('/A', 'Frage', 'de')
    h.req.cancel()
    expect(h.log).toEqual(['offChunk', 'offDone', `cancelRemote ${id}`, 'reset'])
    expect(h.hasListeners()).toBe(false)
    expect(h.req.activeId()).toBeNull()
    h.emitDone(cancelled(id))
    h.resolveAnswer({ success: false, error: 'abgebrochen' })
    await new Promise((r) => setTimeout(r, 0))
    expect(h.log.filter((l) => l.startsWith('done') || l.startsWith('failure'))).toEqual([])
  })

  it('Vault-Wechsel nach dem ersten Chunk: Puffer wird zurückgesetzt, spätere Chunks kommen nicht mehr an', () => {
    const h = harness()
    const id = h.req.start('/A', 'Frage', 'de')
    h.emitChunk(id, 'Antwort aus Vault A')
    h.req.cancel()
    h.emitChunk(id, ' weiter')
    expect(h.log).toEqual(['chunk Antwort aus Vault A', 'offChunk', 'offDone', `cancelRemote ${id}`, 'reset'])
  })

  it('normale Antwort: Chunks, dann done genau einmal; danach nichts mehr', () => {
    const h = harness()
    const id = h.req.start('/A', 'Frage', 'de')
    h.emitChunk(id, 'a')
    h.emitDone({ requestId: id, kind: 'answer', answer: 'a', hits: [], report: { refs: [], sentences: [], usedSources: [], summary: { sentences: 0, cited: 0, uncited: 0, low: 0, invalidRefs: 0, quotesNotFound: 0, unchecked: 0 } }, excludeMismatch: false, model: 'm' } as unknown as VaultRagAnswerDone)
    h.emitDone(cancelled(id))
    expect(h.log).toEqual(['chunk a', 'offChunk', 'offDone', 'done answer'])
    expect(h.req.activeId()).toBeNull()
  })

  it('neue Anfrage löst die alte ab: Ereignisse der alten ID erreichen die neue nicht', () => {
    const h = harness()
    const a = h.req.start('/A', 'Frage A', 'de')
    const b = h.req.start('/A', 'Frage B', 'de')
    h.emitChunk(a, 'alt')
    h.emitDone(cancelled(a))
    h.emitChunk(b, 'neu')
    expect(h.log).toEqual(['offChunk', 'offDone', `cancelRemote ${a}`, 'chunk neu'])
    expect(h.req.activeId()).toBe(b)
  })

  it('Fehler vor dem ersten Ereignis (IPC-Rückgabe) beendet die Anfrage sichtbar', async () => {
    const h = harness(async () => ({ success: false, error: 'Kein Vault-Index' }))
    h.req.start('/A', 'Frage', 'de')
    await new Promise((r) => setTimeout(r, 0))
    expect(h.log).toEqual(['offChunk', 'offDone', 'failure Kein Vault-Index'])
  })

  it('Abbruch ohne laufende Anfrage setzt nichts zurück', () => {
    const h = harness()
    h.req.cancel()
    expect(h.log).toEqual([])
  })
})
