import { describe, it, expect } from 'vitest'
import { checkPluginUpdates } from './update-checker'
import type { FetchLike } from './download'

// Mock-Fetch keyed nach owner/repo aus der Releases-API-URL.
function releaseFetch(map: Record<string, { tag: string; noAsset?: boolean }>): FetchLike {
  return async (url: string) => {
    const m = url.match(/repos\/([^/]+)\/([^/]+)\/releases/)
    const key = m ? `${m[1]}/${m[2]}` : ''
    const entry = map[key]
    if (!entry) return { status: 404, ok: false, json: async () => ({}) } as unknown as Response
    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        tag_name: entry.tag,
        assets: entry.noAsset ? [] : [{ name: 'p.mgxplugin', browser_download_url: `https://github.com/x/y/releases/download/${entry.tag}/p.mgxplugin` }],
      }),
    } as unknown as Response
  }
}

describe('checkPluginUpdates', () => {
  it('meldet hasUpdate korrekt und überspringt Plugins ohne repo', async () => {
    const fetchImpl = releaseFetch({ 'o/a': { tag: 'v2.0.0' }, 'o/b': { tag: 'v1.0.0' } })
    const res = await checkPluginUpdates(
      [
        { id: 'a', version: '1.0.0', repo: 'https://github.com/o/a' },
        { id: 'b', version: '1.0.0', repo: 'https://github.com/o/b' },
        { id: 'c', version: '1.0.0' }, // kein repo → übersprungen
      ],
      fetchImpl
    )
    expect(res).toEqual([
      { id: 'a', repo: 'o/a', current: '1.0.0', latest: '2.0.0', hasUpdate: true },
      { id: 'b', repo: 'o/b', current: '1.0.0', latest: '1.0.0', hasUpdate: false },
    ])
  })

  it('überspringt nicht-github + API-Fehler, ohne den ganzen Check zu killen', async () => {
    const fetchImpl = releaseFetch({ 'o/ok': { tag: 'v3.0.0' } }) // 'o/missing' → 404
    const res = await checkPluginUpdates(
      [
        { id: 'gl', version: '1.0.0', repo: 'https://gitlab.com/o/x' }, // nicht github → skip
        { id: 'missing', version: '1.0.0', repo: 'https://github.com/o/missing' }, // 404 → skip
        { id: 'ok', version: '1.0.0', repo: 'https://github.com/o/ok' },
      ],
      fetchImpl
    )
    expect(res.map((r) => r.id)).toEqual(['ok'])
    expect(res[0]).toMatchObject({ latest: '3.0.0', hasUpdate: true })
  })
})
