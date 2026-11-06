import { describe, it, expect, vi } from 'vitest'
import { AntaresService, isUnfilteredResult } from './service'

const entleiher = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ identifier: String(i), fn_ename: `N${i}`, fn_vorname: 'V', fn_enr: String(1000 + i) }))

/** Fake-Antares: Login klappt immer; /search liefert je nach Aufruf-Nr. die vorgegebene Antwort. */
function fakeServer(searchResponses: Array<{ rows: unknown[]; total: number }>) {
  let searchCall = 0
  const fetchImpl = vi.fn(async (url: string) => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/')) return new Response('<a href="login?pid=abc123">', { status: 200 })
    if (url.includes('/login')) return new Response('', { status: 302 })
    if (url.includes('/dashboard')) return new Response('<div>ok</div>', { status: 200 })
    if (url.includes('/result')) return new Response('', { status: 200 })
    if (url.includes('/search')) return json(searchResponses[Math.min(searchCall++, searchResponses.length - 1)])
    throw new Error('unexpected ' + url)
  })
  return { fetchImpl, searchCalls: () => searchCall }
}

describe('isUnfilteredResult', () => {
  it('erkennt den Gesamtbestand', () => {
    expect(isUnfilteredResult(12703, 12703, 50)).toBe(true)
    expect(isUnfilteredResult(50, 12703, 50)).toBe(true)
    expect(isUnfilteredResult(2, 2, 50)).toBe(false)
    expect(isUnfilteredResult(0, undefined, 50)).toBe(false)
  })
})

describe('listOffeneRegistrierungen', () => {
  const make = (f: ReturnType<typeof fakeServer>) =>
    new AntaresService('https://mz.example', 'u', 'p', 'HE/16', f.fetchImpl as never)

  it('liefert die gefilterten Zeilen', async () => {
    const f = fakeServer([{ rows: entleiher(2), total: 2 }])
    expect(await make(f).listOffeneRegistrierungen()).toHaveLength(2)
    expect(f.searchCalls()).toBe(1)
  })

  it('versucht es erneut, wenn der Server alle Entleiher liefert', async () => {
    const f = fakeServer([{ rows: entleiher(12703), total: 12703 }, { rows: entleiher(2), total: 2 }])
    expect(await make(f).listOffeneRegistrierungen()).toHaveLength(2)
    expect(f.searchCalls()).toBe(2)
  })

  it('wirft statt den Gesamtbestand als Registrierungen anzuzeigen', async () => {
    const f = fakeServer([{ rows: entleiher(12703), total: 12703 }])
    await expect(make(f).listOffeneRegistrierungen()).rejects.toThrow(/Filter/)
  })
})
