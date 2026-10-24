import { describe, it, expect } from 'vitest'
import { WebSnapshotStore, sanitizeScopeId, sanitizeSnapshotId, WEB_SNAPSHOT_MAX_PER_SENDER, WEB_SNAPSHOT_TTL_MS } from './petrolWebSnapshots'
import type { WebSource } from '../../shared/webChat'

function source(n: number, excerpt = `Auszug ${n}`): WebSource {
  return {
    n, title: `T${n}`, url: `https://h${n}.example/`, host: `h${n}.example`,
    fetchedAt: '2026-10-24T10:00:00.000Z', excerpt, originalChars: excerpt.length, truncated: false
  }
}

describe('WebSnapshotStore', () => {
  it('gibt Auszüge nur an denselben Absender und dasselbe Gespräch', () => {
    let now = 1_000
    const ids = ['a'.repeat(32), 'b'.repeat(32)]
    const store = new WebSnapshotStore(() => now, () => ids.shift() ?? 'c'.repeat(32))
    const id = store.put(7, 'tab-1', [source(1)])
    expect(store.get(7, 'tab-1', id)?.sources[0].excerpt).toBe('Auszug 1')
    expect(store.get(8, 'tab-1', id)).toBeNull()
    expect(store.get(7, 'tab-2', id)).toBeNull()
    expect(store.get(7, 'tab-1', 'd'.repeat(32))).toBeNull()
  })

  it('liefert eine Kopie — der Aufrufer kann den gespeicherten Auszug nicht kürzen', () => {
    const store = new WebSnapshotStore(() => 1, () => 'a'.repeat(32))
    const id = store.put(1, 'tab-1', [source(1, 'vollständig')])
    const got = store.get(1, 'tab-1', id)!
    got.sources[0].excerpt = 'gekürzt'
    expect(store.get(1, 'tab-1', id)?.sources[0].excerpt).toBe('vollständig')
  })

  it('verwirft abgelaufene Snapshots', () => {
    let now = 10_000
    const store = new WebSnapshotStore(() => now, () => 'a'.repeat(32))
    const id = store.put(1, 'tab-1', [source(1)])
    now += WEB_SNAPSHOT_TTL_MS + 1
    expect(store.get(1, 'tab-1', id)).toBeNull()
  })

  it('behält je Absender nur die neuesten', () => {
    let n = 0
    const store = new WebSnapshotStore(() => ++n, () => n.toString(16).padStart(32, '0'))
    const ids: string[] = []
    for (let i = 0; i < WEB_SNAPSHOT_MAX_PER_SENDER + 2; i++) ids.push(store.put(1, 'tab-1', [source(1)]))
    expect(store.get(1, 'tab-1', ids[0])).toBeNull()
    expect(store.get(1, 'tab-1', ids[1])).toBeNull()
    expect(store.get(1, 'tab-1', ids[2])?.id).toBe(ids[2])
    expect(store.size).toBe(WEB_SNAPSHOT_MAX_PER_SENDER)
  })

  it('dropScope und dropSender treffen nur das Gebundene', () => {
    let n = 0
    const store = new WebSnapshotStore(() => ++n, () => n.toString(16).padStart(32, 'a'))
    const a = store.put(1, 'tab-1', [source(1)])
    const b = store.put(1, 'tab-2', [source(2)])
    const c = store.put(2, 'tab-1', [source(3)])
    store.dropScope(1, 'tab-1')
    expect(store.get(1, 'tab-1', a)).toBeNull()
    expect(store.get(1, 'tab-2', b)?.sources[0].n).toBe(2)
    expect(store.get(2, 'tab-1', c)?.sources[0].n).toBe(3)
    store.dropSender(1)
    expect(store.get(1, 'tab-2', b)).toBeNull()
    expect(store.get(2, 'tab-1', c)).not.toBeNull()
  })
})

describe('Kennungen aus dem Renderer', () => {
  it('nimmt Tab-Kennungen an und weist Freitext ab', () => {
    expect(sanitizeScopeId('tab-171000-abc12')).toBe('tab-171000-abc12')
    expect(sanitizeScopeId(' tab-1 ')).toBe('tab-1')
    expect(sanitizeScopeId('gespräch 1')).toBeNull()
    expect(sanitizeScopeId('')).toBeNull()
    expect(sanitizeScopeId(12)).toBeNull()
  })

  it('nimmt nur 32 Hexzeichen als Snapshot-Kennung', () => {
    expect(sanitizeSnapshotId('a'.repeat(32))).toBe('a'.repeat(32))
    expect(sanitizeSnapshotId('A'.repeat(32))).toBeNull()
    expect(sanitizeSnapshotId('a'.repeat(31))).toBeNull()
    expect(sanitizeSnapshotId('notahex'.padEnd(32, 'g'))).toBeNull()
  })
})
