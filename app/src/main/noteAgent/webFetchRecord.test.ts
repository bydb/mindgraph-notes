// Zusatzpunkt A (Codex): ein fehlgeschlagener Fetch muss die TATSÄCHLICHE finale URL +
// Redirect-Kette in den Provenienz-Record übernehmen (aus FetchExtractError), nicht bloß die
// angeforderte URL. fetchAndExtract ist gemockt, um einen HTTP-Fehler mit Kette zu erzeugen.

import { describe, it, expect, vi } from 'vitest'

vi.mock('../webResearch/fetchExtract', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, fetchAndExtract: vi.fn() }
})

import { fetchAndExtract, FetchExtractError } from '../webResearch/fetchExtract'
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
    markdown: 'Seitenanfang', truncated: bodyTruncated, originalChars: 12, bodyTruncated
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
