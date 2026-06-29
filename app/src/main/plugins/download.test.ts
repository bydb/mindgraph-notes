import { describe, it, expect, vi } from 'vitest'
import { ARTIFACT_LIMITS } from './artifact/limits'
import {
  parseRepoRef,
  parseRepoUrl,
  isAllowedHost,
  resolveReleaseAsset,
  downloadCapped,
  type FetchLike,
} from './download'

// — Mock-Helfer: minimale Response-Form, die download.ts konsumiert —
function streamReader(chunks: Uint8Array[]) {
  let i = 0
  return {
    read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }),
    cancel: async () => {},
  }
}
function res(opts: { status?: number; headers?: Record<string, string>; json?: unknown; chunks?: Uint8Array[] }): Response {
  const status = opts.status ?? 200
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => opts.headers?.[k.toLowerCase()] ?? null },
    json: async () => opts.json,
    body: opts.chunks ? { getReader: () => streamReader(opts.chunks!) } : null,
  } as unknown as Response
}
const ASSET = 'https://github.com/o/r/releases/download/v1.0.0/x.mgxplugin'

describe('parseRepoRef', () => {
  it('akzeptiert owner/repo und strippt .git', () => {
    expect(parseRepoRef('bydb/my-plugin')).toEqual({ owner: 'bydb', repo: 'my-plugin' })
    expect(parseRepoRef('  bydb/my-plugin.git ')).toEqual({ owner: 'bydb', repo: 'my-plugin' })
  })
  it('lehnt URLs, Pfade, Traversal und Unvollständiges ab', () => {
    for (const bad of ['https://github.com/o/r', 'o', 'o/r/extra', '../etc', 'o/..', 'o//r', 'o/ r', '']) {
      expect(() => parseRepoRef(bad)).toThrow(/Repo-Angabe/)
    }
  })
})

describe('parseRepoUrl', () => {
  it('extrahiert owner/repo aus einer github.com-URL', () => {
    expect(parseRepoUrl('https://github.com/bydb/my-plugin')).toEqual({ owner: 'bydb', repo: 'my-plugin' })
    expect(parseRepoUrl('https://github.com/bydb/my-plugin.git')).toEqual({ owner: 'bydb', repo: 'my-plugin' })
    expect(parseRepoUrl('https://github.com/bydb/my-plugin/tree/main')).toEqual({ owner: 'bydb', repo: 'my-plugin' })
  })
  it('lehnt nicht-github / ungültige URLs ab', () => {
    for (const bad of ['https://gitlab.com/o/r', 'https://github.com/onlyowner', 'not a url', 'ftp://github.com/o/r']) {
      expect(() => parseRepoUrl(bad)).toThrow(/Repo-URL|github/)
    }
  })
})

describe('isAllowedHost', () => {
  it('erlaubt GitHub-Hosts + *.githubusercontent.com, sonst nichts', () => {
    for (const ok of ['api.github.com', 'github.com', 'objects.githubusercontent.com', 'foo.githubusercontent.com', 'githubusercontent.com']) {
      expect(isAllowedHost(ok)).toBe(true)
    }
    for (const no of ['evil.com', 'github.com.evil.com', 'githubusercontent.com.evil.com', 'notgithub.com']) {
      expect(isAllowedHost(no)).toBe(false)
    }
  })
})

describe('resolveReleaseAsset', () => {
  const ref = { owner: 'o', repo: 'r' }
  it('löst das einzige .mgxplugin-Asset + Version aus dem Tag auf', async () => {
    const fetchImpl: FetchLike = async () =>
      res({ json: { tag_name: 'v1.0.0', assets: [{ name: 'x.mgxplugin', browser_download_url: ASSET }] } })
    await expect(resolveReleaseAsset(ref, undefined, fetchImpl)).resolves.toEqual({ assetUrl: ASSET, tag: 'v1.0.0', version: '1.0.0' })
  })
  it('404 → release-not-found, 403 → rate-limited', async () => {
    await expect(resolveReleaseAsset(ref, undefined, async () => res({ status: 404 }))).rejects.toThrow(/Kein Release/)
    await expect(resolveReleaseAsset(ref, undefined, async () => res({ status: 403 }))).rejects.toThrow(/Limit/)
  })
  it('kein bzw. mehrdeutiges .mgxplugin → Fehler (kein Raten)', async () => {
    await expect(resolveReleaseAsset(ref, undefined, async () => res({ json: { tag_name: 'v1', assets: [{ name: 'readme.txt', browser_download_url: ASSET }] } }))).rejects.toThrow(/kein \.mgxplugin/)
    await expect(resolveReleaseAsset(ref, undefined, async () => res({ json: { tag_name: 'v1', assets: [
      { name: 'a.mgxplugin', browser_download_url: ASSET }, { name: 'b.mgxplugin', browser_download_url: ASSET }] } }))).rejects.toThrow(/mehrere/)
  })
})

describe('downloadCapped', () => {
  it('lädt den Body als Buffer (Happy Path)', async () => {
    const fetchImpl: FetchLike = async () => res({ chunks: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])] })
    const buf = await downloadCapped(ASSET, ARTIFACT_LIMITS, fetchImpl)
    expect([...buf]).toEqual([1, 2, 3, 4, 5])
  })
  it('folgt einem Redirect NUR zu einem erlaubten Host', async () => {
    const cdn = 'https://objects.githubusercontent.com/x'
    const fetchImpl: FetchLike = async (url) =>
      url === ASSET
        ? res({ status: 302, headers: { location: cdn } })
        : res({ chunks: [new Uint8Array([9])] })
    expect([...(await downloadCapped(ASSET, ARTIFACT_LIMITS, fetchImpl))]).toEqual([9])
  })
  it('blockt Redirect zu nicht-erlaubtem Host', async () => {
    const fetchImpl: FetchLike = async () => res({ status: 302, headers: { location: 'https://evil.com/x' } })
    await expect(downloadCapped(ASSET, ARTIFACT_LIMITS, fetchImpl)).rejects.toThrow(/Host nicht erlaubt/)
  })
  it('blockt nicht-https und nicht-GitHub-Start-URL', async () => {
    const never: FetchLike = vi.fn(async () => res({})) as unknown as FetchLike
    await expect(downloadCapped('http://github.com/x', ARTIFACT_LIMITS, never)).rejects.toThrow(/https/)
    await expect(downloadCapped('https://evil.com/x', ARTIFACT_LIMITS, never)).rejects.toThrow(/Host nicht erlaubt/)
    expect(never).not.toHaveBeenCalled()
  })
  it('bricht beim Streamen ab, wenn das Größenlimit überschritten wird (content-length egal)', async () => {
    const small = { ...ARTIFACT_LIMITS, maxArchiveBytes: 4 }
    const fetchImpl: FetchLike = async () => res({ headers: { 'content-length': '2' }, chunks: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])] })
    await expect(downloadCapped(ASSET, small, fetchImpl)).rejects.toThrow(/überschreitet/)
  })
  it('mappt einen Abort auf download-timeout', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const fetchImpl: FetchLike = async () => { throw abortErr }
    await expect(downloadCapped(ASSET, ARTIFACT_LIMITS, fetchImpl)).rejects.toThrow(/Timeout/)
  })
})
