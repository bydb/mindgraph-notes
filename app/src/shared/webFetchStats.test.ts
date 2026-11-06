import { describe, expect, it } from 'vitest'
import { emptyFetchStats, localDay, normalizeStatHost, parseFetchStats, pruneFetchStats, recordFetchStat, summarizeFetchStats } from './webFetchStats'

describe('webFetchStats', () => {
  it('zählt je Kanal und Grund, Websites nur bei Fehlschlägen', () => {
    let f = emptyFetchStats()
    f = recordFetchStat(f, { channel: 'chat', kind: 'ok', host: 'tagesschau.de', day: '2026-11-06' })
    f = recordFetchStat(f, { channel: 'chat', kind: 'browser-only', host: 'www.bdkparfums.com', day: '2026-11-06' })
    f = recordFetchStat(f, { channel: 'agent', kind: 'http', host: 'douglas.de', day: '2026-11-06' })
    f = recordFetchStat(f, { channel: 'chat', kind: 'browser-only', host: 'bdkparfums.com', day: '2026-11-07' })
    const s = summarizeFetchStats(f, '2026-11-07')
    expect(s.since).toBe('2026-11-06')
    expect(s.chat).toEqual({ ok: 1, 'browser-only': 2 })
    expect(s.agent).toEqual({ http: 1 })
    expect(s.topHosts['browser-only']).toEqual([{ host: 'bdkparfums.com', count: 2 }])
    expect((f.days['2026-11-06'].hosts as Record<string, unknown>).ok).toBeUndefined()
  })

  it('verändert die alte Datei nicht', () => {
    const f = emptyFetchStats()
    recordFetchStat(f, { channel: 'chat', kind: 'ok', host: 'a.de', day: '2026-11-06' })
    expect(f.days).toEqual({})
  })

  it('wirft Tage außerhalb von 30 Tagen weg', () => {
    let f = emptyFetchStats()
    f = recordFetchStat(f, { channel: 'chat', kind: 'ok', host: 'a.de', day: '2026-10-07' })
    f = recordFetchStat(f, { channel: 'chat', kind: 'ok', host: 'a.de', day: '2026-10-08' })
    const p = pruneFetchStats(f, '2026-11-06')
    expect(Object.keys(p.days)).toEqual(['2026-10-08'])
    expect(summarizeFetchStats(f, '2026-11-06').chat.ok).toBe(1)
  })

  it('Hosts: nur saubere Namen, Adressen und Fremdzeichen fallen weg', () => {
    expect(normalizeStatHost('WWW.Example.COM.')).toBe('example.com')
    expect(normalizeStatHost('localhost')).toBeNull()
    expect(normalizeStatHost('a.de/pfad?q=geheim')).toBeNull()
    expect(normalizeStatHost('evil.de\nSYSTEM')).toBeNull()
  })

  it('höchstens 50 Websites je Grund und Tag', () => {
    let f = emptyFetchStats()
    for (let i = 0; i < 60; i++) f = recordFetchStat(f, { channel: 'chat', kind: 'timeout', host: `h${i}.de`, day: '2026-11-06' })
    expect(Object.keys(f.days['2026-11-06'].hosts.timeout!).length).toBe(50)
    expect(f.days['2026-11-06'].chat.timeout).toBe(60)
  })

  it('liest nur gültige Dateien, Unbekanntes fällt weg', () => {
    expect(parseFetchStats(null)).toEqual(emptyFetchStats())
    expect(parseFetchStats({ version: 2, days: {} })).toEqual(emptyFetchStats())
    const f = parseFetchStats({ version: 1, days: {
      '2026-11-06': { chat: { ok: 3, bogus: 9, http: -1 }, agent: {}, hosts: { http: { 'douglas.de': 2, 'x y': 1 }, ok: { 'a.de': 1 } } },
      'gestern': { chat: { ok: 1 } }
    } })
    expect(Object.keys(f.days)).toEqual(['2026-11-06'])
    expect(f.days['2026-11-06'].chat).toEqual({ ok: 3 })
    expect(f.days['2026-11-06'].hosts).toEqual({ http: { 'douglas.de': 2 } })
  })

  it('localDay nimmt das lokale Datum', () => {
    expect(localDay(new Date(2026, 10, 6, 0, 30))).toBe('2026-11-06')
  })
})
