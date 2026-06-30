import { describe, it, expect } from 'vitest'
import { fetchCatalog, resolveCatalogUrl, CATALOG_URL } from './catalog'
import type { FetchLike } from './download'

// — Minimaler Response-Mock, den downloadCapped konsumiert (gestreamter Body über getReader) —
function streamReader(chunks: Uint8Array[]) {
  let i = 0
  return {
    read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }),
    cancel: async () => {},
  }
}
function res(chunks: Uint8Array[]): Response {
  return {
    status: 200,
    ok: true,
    headers: { get: () => null },
    json: async () => undefined,
    body: { getReader: () => streamReader(chunks) },
  } as unknown as Response
}
const CAT_URL = 'https://raw.githubusercontent.com/bydb/mindgraph-plugins/main/catalog.json'
const bodyOf = (v: unknown): Uint8Array[] => [new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v))]
const fetchReturning = (v: unknown): FetchLike => async () => res(bodyOf(v))

const validDoc = {
  catalogVersion: 1,
  plugins: [
    { id: 'mindgraph-demo', name: 'MindGraph Demo', repo: 'bydb/mindgraph-plugin-demo', description: 'x', author: 'bydb', category: 'productivity' },
  ],
}

describe('fetchCatalog', () => {
  it('lädt + validiert einen gültigen Katalog', async () => {
    const out = await fetchCatalog(CAT_URL, fetchReturning(validDoc))
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('mindgraph-demo')
    expect(out[0].repo).toBe('bydb/mindgraph-plugin-demo')
  })

  it('lehnt ungültiges Schema ab (catalog-invalid)', async () => {
    await expect(fetchCatalog(CAT_URL, fetchReturning({ catalogVersion: 2, plugins: [] }))).rejects.toThrow(/Katalog/)
    await expect(fetchCatalog(CAT_URL, fetchReturning({ plugins: [{ id: 'x' }] }))).rejects.toThrow(/Katalog/)
  })

  it('lehnt kaputtes JSON ab', async () => {
    await expect(fetchCatalog(CAT_URL, fetchReturning('{ not json'))).rejects.toThrow(/JSON/)
  })

  it('lehnt doppelte ids ab (Semantik)', async () => {
    const dup = {
      catalogVersion: 1,
      plugins: [
        { id: 'a', name: 'A', repo: 'o/a' },
        { id: 'a', name: 'A2', repo: 'o/a2' },
      ],
    }
    await expect(fetchCatalog(CAT_URL, fetchReturning(dup))).rejects.toThrow(/Semantik|Doppelte/)
  })

  it('überspringt Einträge mit ungültigem repo statt zu werfen', async () => {
    const doc = {
      catalogVersion: 1,
      plugins: [
        { id: 'good', name: 'Good', repo: 'o/good' },
        { id: 'bad', name: 'Bad', repo: 'not/a/valid/repo' },
      ],
    }
    const out = await fetchCatalog(CAT_URL, fetchReturning(doc))
    expect(out.map((e) => e.id)).toEqual(['good'])
  })

  it('erzwingt den Size-Cap (zu großer Katalog → Abbruch)', async () => {
    const huge = 'x'.repeat(600 * 1024) // > 512 KiB Cap
    await expect(fetchCatalog(CAT_URL, fetchReturning(huge))).rejects.toThrow(/Bytes|überschreitet|too-large/)
  })
})

describe('resolveCatalogUrl', () => {
  it('nutzt den offiziellen URL in gepackten Builds (ignoriert Override)', () => {
    process.env.MINDGRAPH_PLUGIN_CATALOG_URL = 'https://raw.githubusercontent.com/x/y/main/c.json'
    expect(resolveCatalogUrl(true)).toBe(CATALOG_URL)
    delete process.env.MINDGRAPH_PLUGIN_CATALOG_URL
  })
  it('honoriert den Dev-Override nur in ungepackten Builds', () => {
    process.env.MINDGRAPH_PLUGIN_CATALOG_URL = 'https://raw.githubusercontent.com/x/y/main/c.json'
    expect(resolveCatalogUrl(false)).toBe('https://raw.githubusercontent.com/x/y/main/c.json')
    delete process.env.MINDGRAPH_PLUGIN_CATALOG_URL
  })
})
