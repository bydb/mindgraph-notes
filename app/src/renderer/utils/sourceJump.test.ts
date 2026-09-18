import { describe, it, expect } from 'vitest'
import { createSourceOpener, findNoteByVaultPath, type SourceJumpDeps } from './sourceJump'
import type { VaultLocateSourceResult, VaultRagHitDto } from '../../shared/types'

const hit = (fileRel: string): VaultRagHitDto => ({
  fileRel, sourceHash: 'h', chunkHash: 'c', sourceStart: 0, sourceEnd: 10, startLine: 7,
  score: 0.9, text: 'x', heading: '', kind: null, dateValue: null
} as unknown as VaultRagHitDto)

function harness(locate: SourceJumpDeps['locate'], vault = '/v') {
  const calls: string[] = []
  let currentVault: string | null = vault
  const deps: SourceJumpDeps = {
    getVaultPath: () => currentVault,
    locate,
    resolveNoteId: (fileRel) => (fileRel.startsWith('gone') ? null : `id:${fileRel}`),
    selectNote: (id) => calls.push(`select ${id}`),
    setPendingTarget: (t) => calls.push(t ? `target ${t.noteId} line=${t.line} hash=${t.sourceHash} token=${t.token}` : 'target null'),
    notify: (k) => calls.push(`notify ${k}`)
  }
  return { deps, calls, setVault: (v: string | null) => { currentVault = v }, open: createSourceOpener(deps) }
}

const fresh = (fileRel: string): VaultLocateSourceResult => ({ status: 'fresh', fileRel, sourceHash: 'h', sourceStart: 0, sourceEnd: 10, startLine: 7, heading: '' })

describe('Quellenklick (F28)', () => {
  it('umgekehrte Antwortreihenfolge: nur der neueste Klick wird angewendet', async () => {
    const resolvers: Array<(r: VaultLocateSourceResult) => void> = []
    const h = harness((_v, ref) => new Promise((resolve) => { resolvers.push((r) => resolve({ success: true, result: r })); void ref }))
    const a = h.open({ vaultPath: '/v' }, hit('a.md'))
    const b = h.open({ vaultPath: '/v' }, hit('b.md'))
    resolvers[1](fresh('b.md'))
    resolvers[0](fresh('a.md'))
    expect(await b).toBe('jump')
    expect(await a).toBe('ignored')
    expect(h.calls).toEqual(['target id:b.md line=7 hash=h token=2', 'select id:b.md'])
  })

  it('Vault-Wechsel während des Wartens: verspätete Antwort ändert nichts', async () => {
    let resolveIt!: (r: VaultLocateSourceResult) => void
    const h = harness(() => new Promise((resolve) => { resolveIt = (r) => resolve({ success: true, result: r }) }))
    const p = h.open({ vaultPath: '/v' }, hit('a.md'))
    h.setVault('/other')
    resolveIt(fresh('a.md'))
    expect(await p).toBe('ignored')
    expect(h.calls).toEqual([])
  })

  it('anderer Vault der Nachricht: nur Hinweis, kein IPC', async () => {
    let called = 0
    const h = harness(async () => { called++; return { success: true, result: fresh('a.md') } })
    expect(await h.open({ vaultPath: '/x' }, hit('a.md'))).toBe('notice')
    expect(called).toBe(0)
    expect(h.calls).toEqual(['notify other-vault'])
  })

  it('geändert: Notiz öffnet ausdrücklich am Anfang (Ziel ohne Hash, Zeile 1) mit Hinweis', async () => {
    const h = harness(async () => ({ success: true, result: { status: 'changed', fileRel: 'a.md', sourceHash: 'neu' } }))
    expect(await h.open({ vaultPath: '/v' }, hit('a.md'))).toBe('top')
    expect(h.calls).toEqual(['target id:a.md line=1 hash=null token=1', 'select id:a.md', 'notify changed'])
  })

  it('fehlend oder nicht auflösbar: nur Hinweis, nichts wird geöffnet', async () => {
    const h = harness(async () => ({ success: true, result: { status: 'missing', fileRel: 'a.md' } }))
    expect(await h.open({ vaultPath: '/v' }, hit('a.md'))).toBe('notice')
    const h2 = harness(async () => ({ success: true, result: fresh('gone.md') }))
    expect(await h2.open({ vaultPath: '/v' }, hit('gone.md'))).toBe('notice')
    expect([h.calls, h2.calls]).toEqual([['notify missing'], ['notify missing']])
  })

  it('relokalisiert: Sprung mit Hinweis; IPC-Fehler: Hinweis', async () => {
    const relocated: VaultLocateSourceResult = { status: 'relocated', fileRel: 'a.md', sourceHash: 'h', sourceStart: 0, sourceEnd: 10, startLine: 12, heading: '' }
    const h = harness(async () => ({ success: true, result: relocated }))
    expect(await h.open({ vaultPath: '/v' }, hit('a.md'))).toBe('jump')
    expect(h.calls).toEqual(['target id:a.md line=12 hash=h token=1', 'select id:a.md', 'notify relocated'])
    const h2 = harness(async () => ({ success: false, error: 'kaputt' }))
    expect(await h2.open({ vaultPath: '/v' }, hit('a.md'))).toBe('notice')
    expect(h2.calls).toEqual(['notify error'])
  })
})

describe('exakte Pfadauflösung', () => {
  const notes = [
    { id: 'root', path: 'x.md' },
    { id: 'nested', path: 'a/x.md' },
    { id: 'abs', path: '/v/b/x.md' },
    { id: 'brain', path: '800 - brain/2026/07/01.md' }
  ]
  it('konkurrierende Suffixe: nur der gleiche Pfad trifft, absolute Pfade werden gegen den Vault relativiert', () => {
    expect(findNoteByVaultPath(notes, 'x.md', '/v')?.id).toBe('root')
    expect(findNoteByVaultPath(notes, 'a/x.md', '/v')?.id).toBe('nested')
    expect(findNoteByVaultPath(notes, 'b/x.md', '/v')?.id).toBe('abs')
    expect(findNoteByVaultPath(notes, '/v/b/x.md', '/v')).toBeNull()
    expect(findNoteByVaultPath(notes, '01.md', '/v')).toBeNull()
    expect(findNoteByVaultPath(notes, 'mails/2026-07-01 Bericht.md', '/v')).toBeNull()
  })
  it('Backslashes, führender Schrägstrich und Unicode-Form stören nicht', () => {
    expect(findNoteByVaultPath(notes, '\\a\\x.md', '/v')?.id).toBe('nested')
    expect(findNoteByVaultPath([{ id: 'u', path: 'Büro.md' }], 'Büro.md', '/v')?.id).toBe('u')
  })
})
