import { describe, it, expect } from 'vitest'
import { gatherWebSources, type WebGatherDeps } from './petrolWebChat'
import type { WebFetchOutcome } from '../../shared/webChat'

const hits = [1, 2, 3, 4].map((i) => ({ title: `T${i}`, url: `https://h${i}.example/`, snippet: '' }))
const okPage = (url: string): WebFetchOutcome => ({ ok: true, title: 'x', finalUrl: url, fetchedAt: '2026-10-24T10:00:00.000Z', text: 'Inhalt', originalChars: 6, truncated: false })

/** Netzaufruf, der erst bei Abbruch des Signals scheitert. */
const hang = (signal: AbortSignal) => new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))

describe('gatherWebSources: Stopp und Frist (F02, F03)', () => {
  it('Stopp während der Suche: keine Abrufe, Phase search', async () => {
    const ctl = new AbortController()
    let fetches = 0
    const deps: WebGatherDeps = { search: (_q, s) => hang(s), fetchPage: async (u) => { fetches++; return okPage(u) } }
    const p = gatherWebSources('q', deps, { signal: ctl.signal })
    ctl.abort()
    const r = await p
    expect(r).toMatchObject({ stoppedBy: 'stopped', stoppedIn: 'search', searchTriggered: true })
    expect(fetches).toBe(0)
  })

  it('Frist läuft während der Abrufe ab: offene Abrufe abgebrochen, keine neuen', async () => {
    let fire: () => void = () => {}
    const deps: WebGatherDeps = {
      search: async () => hits,
      fetchPage: (_u, s) => hang(s),
      setTimer: (fn) => { fire = fn; return 1 },
      clearTimer: () => {}
    }
    const p = gatherWebSources('q', deps, { signal: new AbortController().signal })
    await new Promise((r) => setTimeout(r, 0))
    fire()
    const r = await p
    expect(r.stoppedBy).toBe('timeout')
    expect(r.entries.length).toBe(3)
    expect(r.entries.every((e) => !e.outcome.ok && e.outcome.reason === 'timeout')).toBe(true)
    expect(r.contactedHosts).toEqual(['h1.example', 'h2.example', 'h3.example'])
  })

  it('Suche liefert erst nach Stopp: es startet kein Abruf', async () => {
    const ctl = new AbortController()
    let fetches = 0
    const deps: WebGatherDeps = {
      search: async () => { ctl.abort(); return hits },
      fetchPage: async (u) => { fetches++; return okPage(u) }
    }
    const r = await gatherWebSources('q', deps, { signal: ctl.signal })
    expect(r.stoppedBy).toBe('stopped')
    expect(fetches).toBe(0)
  })

  it('Suchfehler wird gemeldet, nicht als „nichts gefunden“', async () => {
    const deps: WebGatherDeps = { search: async () => { throw new Error('Tavily lehnt den API-Key ab') }, fetchPage: async (u) => okPage(u) }
    const r = await gatherWebSources('q', deps, { signal: new AbortController().signal })
    expect(r.searchError).toMatch(/API-Key/)
    expect(r.searchOk).toBe(false)
  })
})
