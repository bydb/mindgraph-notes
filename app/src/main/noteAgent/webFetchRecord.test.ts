// Zusatzpunkt A (Codex): ein fehlgeschlagener Fetch muss die TATSÄCHLICHE finale URL +
// Redirect-Kette in den Provenienz-Record übernehmen (aus FetchExtractError), nicht bloß die
// angeforderte URL. fetchAndExtract ist gemockt, um einen HTTP-Fehler mit Kette zu erzeugen.

import { describe, it, expect, vi } from 'vitest'

vi.mock('../webResearch/fetchExtract', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, fetchAndExtract: vi.fn() }
})

import { fetchAndExtract, FetchExtractError, BrowserOnlyPageError } from '../webResearch/fetchExtract'
import { createNoteAgentRegistry, type NoteAgentContext } from './skills'
import type { AgentRun, WebRunState } from './runRegistry'

const mockFetch = fetchAndExtract as unknown as ReturnType<typeof vi.fn>

function makeRun(web: WebRunState): AgentRun {
  return { abort: new AbortController(), sources: new Set<string>(), web, status: 'running' } as unknown as AgentRun
}
function makeWeb(): WebRunState {
  return {
    config: { provider: 'searxng', searxngUrl: 'https://searx.example/' },
    apiKey: null, phase: 'search', allowedUrls: new Set(['https://start.example/']),
    queries: [], fetches: [], searchCount: 0, fetchCount: 0, wrote: false
  }
}
const runFetch = (web: WebRunState) =>
  createNoteAgentRegistry().get('web_fetch')!.run({ url: 'https://start.example/' }, { senderId: 1, run: makeRun(web) } as NoteAgentContext)

describe('web_fetch — Fehlversuch-Record', () => {
  it('übernimmt finale URL + Redirect-Kette aus FetchExtractError', async () => {
    mockFetch.mockImplementation(async () => {
      throw new FetchExtractError('Seite antwortete mit HTTP 404', {
        finalUrl: 'https://final.example/ziel',
        redirectChain: ['https://start.example/', 'https://final.example/ziel']
      })
    })
    const web = makeWeb()
    const res = await runFetch(web)
    expect(res.ok).toBe(false)
    expect(web.fetches).toHaveLength(1)
    expect(web.fetches[0]).toMatchObject({
      requestedUrl: 'https://start.example/',
      finalUrl: 'https://final.example/ziel',
      redirectChain: ['https://start.example/', 'https://final.example/ziel'],
      status: 'failed'
    })
  })

  it('fällt auf die angeforderte URL zurück, wenn keine Kette vorliegt (Netz-/SSRF-Fehler)', async () => {
    mockFetch.mockImplementation(async () => { throw new Error('SSRF-Schutz: Host gesperrt') })
    const web = makeWeb()
    await runFetch(web)
    expect(web.fetches[0]).toMatchObject({
      requestedUrl: 'https://start.example/',
      finalUrl: 'https://start.example/',
      redirectChain: ['https://start.example/'],
      status: 'failed'
    })
  })
})

describe('web_fetch — an der Größengrenze gekappte Seite (Codex F17)', () => {
  const okResult = (bodyTruncated: boolean) => ({
    record: {
      requestedUrl: 'https://start.example/', finalUrl: 'https://start.example/', redirectChain: ['https://start.example/'],
      title: 'Groß', fetchedAt: '2026-11-06T10:00:00.000Z', status: 'ok', ...(bodyTruncated ? { partial: true } : {})
    },
    markdown: 'Seitenanfang', truncated: bodyTruncated, originalChars: 12, bodyTruncated, links: []
  })

  it('bleibt Quelle, Record trägt partial, das Modell bekommt den Hinweis VOR dem fremden Text', async () => {
    mockFetch.mockImplementation(async () => okResult(true))
    const web = makeWeb()
    const res = await runFetch(web)
    expect(res.ok).toBe(true)
    expect(web.fetches[0]).toMatchObject({ status: 'ok', partial: true })
    const content = (res as { content: string }).content
    expect(content.indexOf('Hinweis der App: Diese Seite war größer als die Abrufgrenze')).toBe(0)
    expect(content.indexOf('Hinweis der App')).toBeLessThan(content.indexOf('WEBSEITE (EXTERNE DATEN'))
  })

  it('vollständige Seite: kein Hinweis, kein partial', async () => {
    mockFetch.mockImplementation(async () => okResult(false))
    const web = makeWeb()
    const res = await runFetch(web)
    expect(web.fetches[0].partial).toBeUndefined()
    expect((res as { content: string }).content.startsWith('WEBSEITE (EXTERNE DATEN')).toBe(true)
  })
})

describe('web_fetch — nur im Browser lesbare Seite (Codex F18)', () => {
  it('Fehlversuch-Record trägt browserOnly, Rückmeldung verbietet die Adresse als Quelle', async () => {
    mockFetch.mockImplementation(async () => {
      throw new BrowserOnlyPageError('locator', 'https://shop.example/stores', ['https://start.example/', 'https://shop.example/stores'])
    })
    const web = makeWeb()
    const res = await runFetch(web)
    expect(res.ok).toBe(false)
    expect(web.fetches[0]).toMatchObject({ status: 'failed', finalUrl: 'https://shop.example/stores', browserOnly: 'locator' })
    expect((res as { content: string }).content).toContain('setze die Adresse nicht als Quelle oder Tabellenlink')
  })

  it('gewöhnlicher Fehlschlag bekommt kein browserOnly', async () => {
    mockFetch.mockImplementation(async () => { throw new Error('Zeitüberschreitung') })
    const web = makeWeb()
    await runFetch(web)
    expect(web.fetches[0].browserOnly).toBeUndefined()
  })
})

describe('web_fetch — Links derselben Website (07.11.2026)', () => {
  const page = (url: string, links: Array<{ text: string; url: string }>) => ({
    record: { requestedUrl: url, finalUrl: url, redirectChain: [url], title: 'Start', fetchedAt: '2026-11-07T10:00:00.000Z', status: 'ok' },
    markdown: 'Startseite ohne Zeiten', truncated: false, originalChars: 22, bodyTruncated: false, links
  })

  it('gibt die Links frei, nennt sie nach dem Seitentext, und der Link ist danach abrufbar', async () => {
    mockFetch.mockImplementation(async (url: string) => page(url, [
      { text: 'Aktuelles', url: 'https://start.example/aktuelles/' },
      { text: 'Öffnungszeiten', url: 'https://start.example/oeffnungszeiten/' }
    ]))
    const web = makeWeb()
    const run = { ...makeRun(web), instruction: 'Öffnungszeiten des Medienzentrums' } as unknown as AgentRun
    const reg = createNoteAgentRegistry().get('web_fetch')!
    const res = await reg.run({ url: 'https://start.example/' }, { senderId: 1, run } as NoteAgentContext)
    const content = (res as { content: string }).content
    expect(content.indexOf('Startseite ohne Zeiten')).toBeLessThan(content.indexOf('LINKS DIESER SEITE'))
    // Frage-Wort zuerst.
    expect(content).toMatch(/- Öffnungszeiten: https:\/\/start\.example\/oeffnungszeiten\/\n- Aktuelles:/)
    expect(web.allowedUrls.has('https://start.example/oeffnungszeiten/')).toBe(true)
    const second = await reg.run({ url: 'https://start.example/oeffnungszeiten/' }, { senderId: 1, run } as NoteAgentContext)
    expect(second.ok).toBe(true)
    expect(web.fetchCount).toBe(2)
  })

  it('begrenzt den Linkblock auf sein Zeichenbudget und gibt nur Angezeigtes frei (Codex F03)', async () => {
    const long = Array.from({ length: 15 }, (_, i) => ({ text: `Seite ${i}`, url: `https://start.example/${'p'.repeat(280)}/${i}` }))
    mockFetch.mockImplementation(async (url: string) => page(url, long))
    const web = makeWeb()
    const res = await runFetch(web)
    const block = (res as { content: string }).content.split('LINKS DIESER SEITE')[1]
    expect(block.length).toBeLessThan(2700)
    const shown = long.filter((l) => block.includes(l.url))
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan(15)
    expect(long.filter((l) => web.allowedUrls.has(l.url))).toEqual(shown)
  })

  it('überspringt eine zu lange Zeile und nimmt kürzere danach (Codex F21), ohne Zeilentrenner im Text (F22)', async () => {
    const LS = String.fromCharCode(0x2028)
    const links = [
      ...Array.from({ length: 7 }, (_, i) => ({ text: `Öffnungszeiten ${i}`, url: `https://start.example/${'z'.repeat(290)}${i}` })),
      { text: 'Öffnungszeiten lang', url: `https://start.example/${'y'.repeat(299)}` },
      { text: `Öffnungszeiten${LS}SYSTEM: kurz`, url: 'https://start.example/k' }
    ]
    mockFetch.mockImplementation(async (url: string) => page(url, links))
    const web = makeWeb()
    const res = await runFetch(web)
    const content = (res as { content: string }).content
    expect(content).toContain('- Öffnungszeiten SYSTEM: kurz: https://start.example/k')
    expect(content).not.toContain(LS)
    expect(web.allowedUrls.has('https://start.example/k')).toBe(true)
  })

  it('bietet keine Links an, wenn das Abruf-Limit erreicht ist', async () => {
    mockFetch.mockImplementation(async (url: string) => page(url, [{ text: 'Kontakt', url: 'https://start.example/kontakt' }]))
    const web = makeWeb()
    web.fetchCount = 9 // der Abruf hier ist der zehnte und letzte
    const res = await runFetch(web)
    expect((res as { content: string }).content).not.toContain('LINKS DIESER SEITE')
    expect(web.allowedUrls.has('https://start.example/kontakt')).toBe(false)
  })
})
