// Vertragstest des Netz-Retrys in chatFetch (30.07.2026).
//
// Anlass: ein `net::ERR_NETWORK_IO_SUSPENDED` mitten in einem Notiz-Agent-Lauf (OpenRouter)
// hat die komplette Recherche gekostet — Chromium räumt Verbindungen ab, wenn der Rechner
// schläft oder das Netz wechselt. Genau EIN Wiederholungsversuch, und nur bei eindeutigen
// Verbindungsabbrüchen: HTTP-Antworten (429/402) müssen im normalen Fehlerpfad bleiben,
// sonst verdoppelt ein Rate-Limit still die Kosten.
//
// vitest-v4-Falle (im Projekt schon einmal getroffen): ein vi.fn(), dessen gespeichertes
// Ergebnis eine Rejection ist, meldet vitest als unhandled rejection — und zwar auch dann,
// wenn der Code sie sauber fängt. Deshalb hier KEIN geteiltes Mock-State: jeder Test setzt
// seine eigene Implementierung, und gezählt wird über einen lokalen Zähler statt über
// `netFetch.mock.calls`.

import { describe, it, expect, vi, afterEach } from 'vitest'

const netFetch = vi.fn()
vi.mock('electron', () => ({ net: { fetch: (...args: unknown[]) => netFetch(...args) } }))

import { chatWithTools, CHAT_RETRY_DELAY_MS } from './chatClient'

const OPTS = { backend: 'openrouter' as const, openrouterApiKey: 'k', openrouterModel: 'moonshotai/kimi-k3' }
const MSGS = [{ role: 'user' as const, content: 'hi' }]

function okResponse(text = 'fertig'): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

function errorResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

const call = (opts: Record<string, unknown> = {}) => chatWithTools(MSGS, [], { ...OPTS, ...opts })

/**
 * Verdrahtet net.fetch für EINEN Test und liefert den Aufrufzähler.
 * `respond` bekommt die 1-basierte Versuchsnummer und wirft oder antwortet.
 */
function arm(respond: (attempt: number) => Response): { attempts: () => number } {
  let attempts = 0
  netFetch.mockImplementation(async () => respond(++attempts))
  return { attempts: () => attempts }
}

const netError = (message: string, cause?: unknown): never => {
  throw Object.assign(new Error(message), cause ? { cause } : {})
}

afterEach(() => vi.useRealTimers())

describe('chatFetch — Retry bei transienten Netzabbrüchen', () => {
  it('wiederholt EINMAL und liefert dann das Ergebnis', async () => {
    const net = arm(a => (a === 1 ? netError('net::ERR_NETWORK_IO_SUSPENDED') : okResponse('nach dem Aussetzer')))

    vi.useFakeTimers()
    const p = call()
    await vi.advanceTimersByTimeAsync(CHAT_RETRY_DELAY_MS + 10)
    const res = await p

    expect(res.text).toBe('nach dem Aussetzer')
    expect(net.attempts()).toBe(2)
  })

  it('wiederholt NICHT mehr als einmal und erklärt den zweiten Fehlschlag verständlich', async () => {
    const net = arm(() => netError('net::ERR_NETWORK_CHANGED'))

    vi.useFakeTimers()
    const p = call()
    // Die Erwartung VOR dem Timer-Vorlauf verdrahten, sonst gilt die Rejection als unhandled.
    const assertion = expect(p).rejects.toThrow(/Netzwerkverbindung wurde während der Anfrage unterbrochen/)
    await vi.advanceTimersByTimeAsync(CHAT_RETRY_DELAY_MS + 10)
    await assertion

    expect(net.attempts()).toBe(2)
  })

  it('erkennt den Abbruchgrund auch in error.cause', async () => {
    const net = arm(a => (a === 1 ? netError('fetch failed', 'ECONNRESET') : okResponse()))

    vi.useFakeTimers()
    const p = call()
    await vi.advanceTimersByTimeAsync(CHAT_RETRY_DELAY_MS + 10)
    await p

    expect(net.attempts()).toBe(2)
  })
})

describe('chatFetch — was NICHT wiederholt wird', () => {
  it('ein Rate-Limit (429) ist eine HTTP-Antwort — genau ein Request, klare Meldung', async () => {
    const net = arm(() => errorResponse(429, JSON.stringify({ error: { message: 'rate limited' } })))
    await expect(call()).rejects.toThrow(/rate-limitiert \(429\)/)
    expect(net.attempts()).toBe(1)
  })

  it('erschöpftes Guthaben (402) wird nicht wiederholt', async () => {
    const net = arm(() => errorResponse(402, '{}'))
    await expect(call()).rejects.toThrow(/402/)
    expect(net.attempts()).toBe(1)
  })

  it('ein nicht-transienter Netzfehler wird durchgereicht, nicht wiederholt', async () => {
    const net = arm(() => netError('net::ERR_CERT_AUTHORITY_INVALID'))
    await expect(call()).rejects.toThrow(/ERR_CERT_AUTHORITY_INVALID/)
    expect(net.attempts()).toBe(1)
  })

  it('bereits abgebrochenes Signal: kein zweiter Versuch', async () => {
    const ac = new AbortController()
    ac.abort()
    const net = arm(() => netError('net::ERR_NETWORK_IO_SUSPENDED'))
    await expect(call({ signal: ac.signal })).rejects.toThrow(/ERR_NETWORK_IO_SUSPENDED/)
    expect(net.attempts()).toBe(1)
  })

  it('Abbruch WÄHREND der Wartezeit verhindert den zweiten Versuch', async () => {
    const ac = new AbortController()
    const net = arm(() => netError('net::ERR_NETWORK_IO_SUSPENDED'))

    vi.useFakeTimers()
    const p = call({ signal: ac.signal })
    const assertion = expect(p).rejects.toThrow(/ERR_NETWORK_IO_SUSPENDED/)
    // Erster Versuch ist gescheitert, die 1,5 s laufen — jetzt bricht der Nutzer ab.
    await vi.advanceTimersByTimeAsync(CHAT_RETRY_DELAY_MS / 2)
    ac.abort()
    await vi.advanceTimersByTimeAsync(CHAT_RETRY_DELAY_MS)
    await assertion

    expect(net.attempts()).toBe(1)
  })
})
