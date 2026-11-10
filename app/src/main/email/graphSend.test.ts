import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { sendViaGraph, type GraphSendDeps, type GraphSendInput } from './graphSend'

let dir = ''
let attachment = ''
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-graphsend-'))
  attachment = path.join(dir, 'bericht.txt')
  await fs.writeFile(attachment, 'Inhalt des Anhangs')
})
afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }) })

const ID = 'ms-0123456789abcdef01234567'
const input = (over: Partial<GraphSendInput> = {}): GraphSendInput => ({
  accountId: ID,
  to: [{ name: 'Erika Beispiel', address: 'erika@example.org' }],
  subject: 'Testbetreff',
  body: 'Hallo',
  ...over
})

interface Call { url: string; init: RequestInit }
function makeDeps(respond: (call: Call) => Response | Promise<Response>, over: Partial<GraphSendDeps> = {}): { deps: GraphSendDeps; calls: Call[]; tokens: string[] } {
  const calls: Call[] = []
  const tokens: string[] = []
  const deps: GraphSendDeps = {
    getGraphToken: async (accountId) => { tokens.push(accountId); return { accessToken: 'GEHEIME-MARKE', username: 'max@schule.example', displayName: 'Max Muster' } },
    renderEmailHtml: (body) => `<div>${body}</div>`,
    describeAuthError: () => 'Anmeldung nötig',
    fetch: (async (url: string, init: RequestInit) => { const call = { url: String(url), init }; calls.push(call); return respond(call) }) as unknown as typeof fetch,
    ...over
  }
  return { deps, calls, tokens }
}
const accepted = (): Response => new Response(null, { status: 202 })
const rawOf = (call: Call): string => Buffer.from(String(call.init.body), 'base64').toString()

describe('sendViaGraph', () => {
  it('schickt genau eine Anfrage an Graph: MIME als Base64, Marke im Kopf', async () => {
    const { deps, calls, tokens } = makeDeps(accepted)
    const result = await sendViaGraph(input(), deps)
    expect(result).toMatchObject({ success: true, transport: 'graph' })
    expect(result.messageId).toMatch(/^<[0-9a-f-]{36}@schule\.example>$/)
    expect(tokens).toEqual([ID])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://graph.microsoft.com/v1.0/me/sendMail')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers).toEqual({ Authorization: 'Bearer GEHEIME-MARKE', 'Content-Type': 'text/plain' })
    const raw = rawOf(calls[0])
    expect(raw).toContain(`Message-ID: ${result.messageId}`)
    expect(raw).toMatch(/^To: Erika Beispiel <erika@example\.org>$/m)
    expect(raw).toContain('Subject: Testbetreff')
  })

  it('nimmt Absender und Anzeigenamen aus der Anmeldung — der Aufrufer kann keinen anderen vorgeben', async () => {
    const { deps, calls } = makeDeps(accepted)
    // Ein Renderer könnte beliebige Zusatzfelder mitschicken; die Schnittstelle kennt sie nicht einmal.
    await sendViaGraph({ ...input(), account: { user: 'angreifer@evil.example', fromAddress: 'chef@schule.example', name: 'Chef' } } as unknown as GraphSendInput, deps)
    const raw = rawOf(calls[0])
    expect(raw).toMatch(/^From: Max Muster <max@schule\.example>$/m)
    expect(raw).not.toContain('evil.example')
    expect(raw).not.toContain('chef@')
  })

  it('führt die Blindkopie als Kopfzeile im Rohtext — ohne sie stellt Graph nicht zu (gemessen)', async () => {
    const { deps, calls } = makeDeps(accepted)
    await sendViaGraph(input({ cc: [{ name: '', address: 'cc@example.org' }], bcc: [{ name: '', address: 'blind@example.org' }] }), deps)
    const raw = rawOf(calls[0])
    expect(raw).toMatch(/^Cc: cc@example\.org$/m)
    expect(raw).toMatch(/^Bcc: blind@example\.org$/m)
  })

  it('übernimmt Antwort-Kopfzeilen und Anhänge', async () => {
    const { deps, calls } = makeDeps(accepted)
    await sendViaGraph(input({ inReplyTo: '<alt@example.org>', attachments: [{ path: attachment, filename: 'bericht.txt' }] }), deps)
    const raw = rawOf(calls[0])
    expect(raw).toMatch(/^In-Reply-To: <alt@example\.org>$/m)
    expect(raw).toContain('filename=bericht.txt')
  })

  it('fehlender Anhang: nichts geht hinaus, nicht einmal die Marke wird geholt', async () => {
    const { deps, calls, tokens } = makeDeps(accepted)
    const result = await sendViaGraph(input({ attachments: [{ path: path.join(dir, 'weg.pdf'), filename: 'weg.pdf' }] }), deps)
    expect(result).toMatchObject({ success: false, error: 'Anhang nicht gefunden: weg.pdf' })
    expect(calls).toHaveLength(0)
    expect(tokens).toHaveLength(0)
  })

  it('ohne gültige Anmeldung: klare Meldung, keine Anfrage', async () => {
    const { deps, calls } = makeDeps(accepted, { getGraphToken: async () => { throw new Error('reauth') } })
    expect(await sendViaGraph(input(), deps)).toMatchObject({ success: false, error: 'Anmeldung nötig' })
    expect(calls).toHaveLength(0)
  })

  it('zu große Mail: Absage vor dem Absenden, mit Größe und Grenze', async () => {
    const { deps, calls } = makeDeps(accepted, { maxBytes: 200 })
    const result = await sendViaGraph(input({ body: 'x'.repeat(2000) }), deps)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/zu groß/)
    expect(result.uncertain).toBeUndefined()
    expect(calls).toHaveLength(0)
  })

  it('Ablehnung durch Microsoft: fester Text mit Status und Codewort, ohne die Fehlernachricht', async () => {
    const body = JSON.stringify({ error: { code: 'ErrorAccessDenied', message: 'Access denied for erika@example.org' } })
    const cases: Array<[number, RegExp]> = [[401, /neue Anmeldung/], [403, /abgelehnt/], [413, /zu groß/], [429, /später/], [400, /nicht angenommen/]]
    for (const [status, text] of cases) {
      const { deps } = makeDeps(() => new Response(body, { status }))
      const result = await sendViaGraph(input(), deps)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(text)
      expect(result.error).toContain(`${status} ErrorAccessDenied`)
      expect(result.error).not.toContain('erika@')
      expect(result.uncertain).toBeUndefined()
    }
  })

  it('Serverfehler nach übertragener Anfrage: unklar, mit der Message-ID zum Nachsehen', async () => {
    const { deps } = makeDeps(() => new Response('kein json', { status: 503 }))
    const result = await sendViaGraph(input(), deps)
    expect(result).toMatchObject({ success: false, uncertain: true })
    expect(result.error).toMatch(/Unklar/)
    expect(result.messageId).toMatch(/^<.+@schule\.example>$/)
  })

  it('keine Verbindung zustande gekommen: sicher nicht gesendet', async () => {
    const { deps } = makeDeps(() => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }) })
    const result = await sendViaGraph(input(), deps)
    expect(result.success).toBe(false)
    expect(result.uncertain).toBeUndefined()
    expect(result.error).toMatch(/nicht gesendet/)
  })

  it('Abbruch mitten in der Übertragung oder Zeitlimit: unklar, nie eine zweite Anfrage', async () => {
    const reset = makeDeps(() => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }) })
    expect(await sendViaGraph(input(), reset.deps)).toMatchObject({ success: false, uncertain: true })
    expect(reset.calls).toHaveLength(1)

    const slow = makeDeps((call) => new Promise<Response>((_resolve, reject) => {
      (call.init.signal as AbortSignal).addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }), { timeoutMs: 30 })
    const result = await sendViaGraph(input(), slow.deps)
    expect(result).toMatchObject({ success: false, uncertain: true })
    expect(slow.calls).toHaveLength(1)
  })

  it('meldet die gefundene Gesendet-Kopie; findet sich keine oder scheitert die Suche, bleibt der Versand ein Erfolg', async () => {
    const found = makeDeps(accepted, { locateSentCopy: async (_id, messageId) => ({ mailbox: 'Gesendete Elemente', uid: messageId ? 42 : 0 }) })
    expect(await sendViaGraph(input(), found.deps)).toMatchObject({ success: true, sentMailbox: 'Gesendete Elemente', sentUid: 42 })
    const none = makeDeps(accepted, { locateSentCopy: async () => ({ mailbox: 'Gesendete Elemente' }) })
    expect(await sendViaGraph(input(), none.deps)).toMatchObject({ success: true, sentMailbox: 'Gesendete Elemente', sentUid: undefined })
    const broken = makeDeps(accepted, { locateSentCopy: async () => { throw new Error('imap weg') } })
    expect(await sendViaGraph(input(), broken.deps)).toMatchObject({ success: true, sentMailbox: undefined })
  })

  it('sucht die Gesendet-Kopie nicht, wenn Microsoft die Mail nicht angenommen hat', async () => {
    let searched = 0
    const { deps } = makeDeps(() => new Response('{}', { status: 400 }), { locateSentCopy: async () => { searched++; return {} } })
    await sendViaGraph(input(), deps)
    expect(searched).toBe(0)
  })

  it('hängende Suche nach der Gesendet-Kopie hält die Erfolgsmeldung nicht auf und wird abgebrochen (Codex F17, F33)', async () => {
    let aborted = false
    const { deps } = makeDeps(accepted, { locateSentCopy: (_id, _mid, signal) => new Promise(() => { signal.addEventListener('abort', () => { aborted = true }) }), locateTimeoutMs: 30 })
    const start = Date.now()
    const result = await sendViaGraph(input(), deps)
    expect(result).toMatchObject({ success: true, transport: 'graph', sentUid: undefined })
    expect(Date.now() - start).toBeLessThan(1000)
    expect(aborted).toBe(true)
  })

  it('sehr großer Anhang wird abgewiesen, bevor er eingelesen wird (Codex F21)', async () => {
    const big = path.join(dir, 'gross.bin')
    const handle = await fs.open(big, 'w')
    await handle.truncate(60 * 1024 * 1024) // dünn besetzte Datei: 60 MB ohne Plattenplatz
    await handle.close()
    const { deps, calls, tokens } = makeDeps(accepted)
    const before = process.memoryUsage().rss
    const result = await sendViaGraph(input({ attachments: [{ path: big, filename: 'gross.bin' }] }), deps)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/zu groß/)
    expect(calls).toHaveLength(0)
    expect(tokens).toHaveLength(0)
    // Die Datei wurde nicht in den Speicher gelesen.
    expect(process.memoryUsage().rss - before).toBeLessThan(40 * 1024 * 1024)
  })

  it('stockender Fehlertext: die Frist gilt weiter, der Status allein entscheidet (Codex F24)', async () => {
    const stalled = (status: number) => (call: Call): Response => {
      const body = new ReadableStream({
        start(controller) { (call.init.signal as AbortSignal).addEventListener('abort', () => controller.error(new Error('aborted'))) }
      })
      return new Response(body, { status })
    }
    const server = makeDeps(stalled(503), { timeoutMs: 40 })
    const start = Date.now()
    const uncertain = await sendViaGraph(input(), server.deps)
    expect(Date.now() - start).toBeLessThan(1500)
    expect(uncertain).toMatchObject({ success: false, uncertain: true })
    expect(uncertain.error).toContain('(503)')
    const client = makeDeps(stalled(400), { timeoutMs: 40 })
    const rejected = await sendViaGraph(input(), client.deps)
    expect(rejected.success).toBe(false)
    expect(rejected.uncertain).toBeUndefined()
    expect(rejected.error).toContain('(400)')
  })
})
