import { describe, it, expect } from 'vitest'
import { loadDrafts, saveDraft, removeDraft, draftHasContent, draftStorageKey } from './emailDrafts'
import type { ComposeEmail } from '../../shared/types'

function memoryStorage(opts: { failWrites?: boolean } = {}) {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { if (opts.failWrites) throw new Error('QuotaExceededError'); map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    size: () => map.size
  }
}

const base: ComposeEmail = { to: [], subject: '', body: '', accountId: 'a', draftId: 'd1', pristine: false }
const vault = '/v'

describe('emailDrafts', () => {
  it('leer, wenn nichts gespeichert oder Inhalt kaputt', () => {
    const s = memoryStorage()
    expect(loadDrafts(s, vault)).toEqual([])
    s.setItem(draftStorageKey(vault), '{nicht json')
    expect(loadDrafts(s, vault)).toEqual([])
    s.setItem(draftStorageKey(vault), JSON.stringify([{ id: 1 }, null]))
    expect(loadDrafts(s, vault)).toEqual([])
  })

  it('speichert, aktualisiert denselben Entwurf und hält neueste vorn', () => {
    const s = memoryStorage()
    saveDraft(s, vault, { ...base, subject: 'A' }, new Date('2026-09-11T08:00:00Z'))
    saveDraft(s, vault, { ...base, draftId: 'd2', subject: 'B' }, new Date('2026-09-11T08:01:00Z'))
    const { drafts, ok } = saveDraft(s, vault, { ...base, subject: 'A2' }, new Date('2026-09-11T08:02:00Z'))
    expect(ok).toBe(true)
    expect(drafts.map(d => d.compose.subject)).toEqual(['A2', 'B'])
    expect(loadDrafts(s, vault)).toEqual(drafts)
  })

  it('pro Vault getrennt', () => {
    const s = memoryStorage()
    saveDraft(s, '/eins', base)
    expect(loadDrafts(s, '/zwei')).toEqual([])
  })

  it('ohne draftId wird nichts geschrieben', () => {
    const s = memoryStorage()
    saveDraft(s, vault, { ...base, draftId: undefined })
    expect(s.size()).toBe(0)
  })

  it('entfernen; letzter Entwurf räumt den Schlüssel weg', () => {
    const s = memoryStorage()
    saveDraft(s, vault, base)
    expect(removeDraft(s, vault, 'd1')).toEqual([])
    expect(s.size()).toBe(0)
  })

  it('keine Obergrenze: der 21. Entwurf löscht keinen anderen', () => {
    const s = memoryStorage()
    for (let i = 0; i < 25; i++) saveDraft(s, vault, { ...base, draftId: `d${i}` })
    expect(loadDrafts(s, vault)).toHaveLength(25)
  })

  it('Schreibfehler wird gemeldet, nicht verschluckt', () => {
    const s = memoryStorage({ failWrites: true })
    const res = saveDraft(s, vault, base)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('Quota')
    expect(loadDrafts(s, vault)).toEqual([])
  })

  it('Ladezustand von Weiterleitungs-Anhängen bleibt samt Quellmail erhalten (Fortsetzung beim Wiederöffnen)', () => {
    const s = memoryStorage()
    saveDraft(s, vault, { ...base, forwardAttachments: { status: 'loading', sourceEmailId: 'm1' } })
    expect(loadDrafts(s, vault)[0].compose.forwardAttachments).toEqual({ status: 'loading', sourceEmailId: 'm1' })
  })

  it('unangefasst = kein Inhalt, angefasst = Inhalt', () => {
    expect(draftHasContent({ ...base, pristine: true })).toBe(false)
    expect(draftHasContent({ ...base, pristine: false })).toBe(true)
    expect(draftHasContent({ ...base, pristine: undefined })).toBe(true)
  })
})
