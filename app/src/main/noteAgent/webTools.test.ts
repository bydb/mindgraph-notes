// Integrationstests der Webrecherche-Tools (Phase 3) — Zustandsmaschine, Allowlist-Autorität,
// Budgets und der SSRF-Schutz auch bei einem privaten Suchtreffer. Der Such-Provider ist ein
// echter Loopback-SearXNG-Server (per Origin-Freigabe erreichbar); web_fetch bekommt bewusst
// KEINE Freigabe → ein privater Treffer-URL wird abgelehnt.

import { describe, it, expect } from 'vitest'
import http from 'node:http'
import { createNoteAgentRegistry, type NoteAgentContext } from './skills'
import type { AgentRun, WebRunState } from './runRegistry'
import type { WebResearchConfig } from '../../shared/webResearch'

const registry = createNoteAgentRegistry()
const webSearchTool = registry.get('web_search')!
const webFetchTool = registry.get('web_fetch')!

function startSearxngStub(hitUrl: string): Promise<{ url: string; origin: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ results: [{ title: 'Treffer', url: hitUrl, content: 'Snippet' }] }))
    })
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      const origin = `http://127.0.0.1:${port}`
      resolve({ url: `${origin}/`, origin, close: () => new Promise<void>((r) => server.close(() => r())) })
    })
  })
}

function makeRun(web: WebRunState): AgentRun {
  return {
    abort: new AbortController(),
    sources: new Set<string>(),
    web,
    status: 'running'
  } as unknown as AgentRun
}

function makeWeb(config: WebResearchConfig): WebRunState {
  return { config, linkupApiKey: null, phase: 'search', allowedUrls: new Set(), queries: [], fetches: [], searchCount: 0, fetchCount: 0, wrote: false }
}

describe('web_search', () => {
  it('sucht über den (Loopback-)Provider und trägt Treffer-URLs in die Allowlist ein', async () => {
    const stub = await startSearxngStub('https://example.com/artikel')
    const web = makeWeb({ provider: 'searxng', searxngUrl: stub.url, approvedPrivateOrigin: stub.origin })
    const ctx: NoteAgentContext = { senderId: 1, run: makeRun(web) }
    try {
      const res = await webSearchTool.run({ query: 'test' }, ctx)
      expect(res.ok).toBe(true)
      expect(res.content).toContain('example.com/artikel')
      expect(web.allowedUrls.has('https://example.com/artikel')).toBe(true)
      expect(web.queries).toEqual([{ query: 'test', status: 'ok' }])
    } finally { await stub.close() }
  })

  it('Zustandsmaschine: nach dem ersten Fetch (phase=fetch) ist keine Suche mehr erlaubt', async () => {
    const web = makeWeb({ provider: 'searxng', searxngUrl: 'https://searx.example/', approvedPrivateOrigin: undefined })
    web.phase = 'fetch'
    const res = await webSearchTool.run({ query: 'x' }, { senderId: 1, run: makeRun(web) })
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/Such-Phase ist abgeschlossen/)
  })

  it('Budget: über dem Such-Limit wird abgelehnt', async () => {
    const web = makeWeb({ provider: 'searxng', searxngUrl: 'https://searx.example/', approvedPrivateOrigin: undefined })
    web.searchCount = 8
    const res = await webSearchTool.run({ query: 'x' }, { senderId: 1, run: makeRun(web) })
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/Such-Limit/)
  })

  it('zu lange Query wird abgelehnt (nicht still gekürzt)', async () => {
    const web = makeWeb({ provider: 'searxng', searxngUrl: 'https://searx.example/', approvedPrivateOrigin: undefined })
    const res = await webSearchTool.run({ query: 'q'.repeat(300) }, { senderId: 1, run: makeRun(web) })
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/zu lang/)
  })
})

describe('web_fetch', () => {
  it('lehnt eine URL ab, die nicht aus den Suchergebnissen stammt (Allowlist-Autorität)', async () => {
    const web = makeWeb({ provider: 'searxng', searxngUrl: 'https://searx.example/', approvedPrivateOrigin: undefined })
    const res = await webFetchTool.run({ url: 'https://nicht-in-liste.example/' }, { senderId: 1, run: makeRun(web) })
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/stammt nicht aus den Suchergebnissen/)
  })

  it('SSRF: ein PRIVATER Treffer-URL (bösartige SearXNG-Instanz) wird trotz Allowlist abgelehnt', async () => {
    const web = makeWeb({ provider: 'searxng', searxngUrl: 'https://searx.example/', approvedPrivateOrigin: undefined })
    // Simuliere einen Suchtreffer, der auf eine interne Adresse zeigt.
    web.allowedUrls.add('http://169.254.169.254/latest/meta-data/')
    const res = await webFetchTool.run({ url: 'http://169.254.169.254/latest/meta-data/' }, { senderId: 1, run: makeRun(web) })
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/SSRF|gesperrt/)
    expect(web.fetches[0]?.status).toBe('failed') // als Fehlversuch protokolliert
  })

  it('Budget: über dem Fetch-Limit wird abgelehnt', async () => {
    const web = makeWeb({ provider: 'searxng', searxngUrl: 'https://searx.example/', approvedPrivateOrigin: undefined })
    web.fetchCount = 10
    web.allowedUrls.add('https://example.com/')
    const res = await webFetchTool.run({ url: 'https://example.com/' }, { senderId: 1, run: makeRun(web) })
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/Abruf-Limit/)
  })
})

describe('Endzustand phase=write sperrt beide Tools', () => {
  it('web_search wird nach dem Schreiben abgelehnt', async () => {
    const web = makeWeb({ provider: 'searxng', searxngUrl: 'https://searx.example/', approvedPrivateOrigin: undefined })
    web.phase = 'write'; web.wrote = true
    const res = await webSearchTool.run({ query: 'x' }, { senderId: 1, run: makeRun(web) })
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/Such-Phase ist abgeschlossen/)
  })

  it('web_fetch wird nach dem Schreiben abgelehnt (kein Nachladen außerhalb des Quellenblocks)', async () => {
    const web = makeWeb({ provider: 'searxng', searxngUrl: 'https://searx.example/', approvedPrivateOrigin: undefined })
    web.phase = 'write'; web.wrote = true
    web.allowedUrls.add('https://example.com/')
    const res = await webFetchTool.run({ url: 'https://example.com/' }, { senderId: 1, run: makeRun(web) })
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/bereits geschrieben/)
  })
})
