// A2 (docs/plugin-store-A2-plan.md): sicherer GitHub-Release-Downloader.
//
// Lädt das signierte `.mgxplugin`-Asset eines ÖFFENTLICHEN Repos (`owner/repo`). Der zurückgegebene
// Buffer ist UNTRUSTED — die echte Vertrauensprüfung (Ed25519 + Integrity + Manifest-Kompat) passiert
// erst in `installAndActivate(buffer)`. Dieser Modul erzwingt NUR Herkunft (Host-Allowlist), Größe und
// Timeout — keine Signaturlogik. `fetch` ist injizierbar → ohne Netz testbar.

import { ArtifactError, ARTIFACT_LIMITS, type ArtifactLimits } from './artifact/limits'

const GITHUB_API = 'https://api.github.com'
const USER_AGENT = 'MindGraph-Notes'
const MAX_REDIRECTS = 5
const DEFAULT_TIMEOUT_MS = 60_000

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/** Exakte Hosts, zu denen Downloader + Redirect-Hops gehen dürfen. Fail-closed. */
const GITHUB_HOST_ALLOWLIST: readonly string[] = [
  'api.github.com',
  'github.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]

/** Allowlist-Hosts exakt + jede `*.githubusercontent.com`-Subdomain (Asset-CDN). Sonst nichts. */
export function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (GITHUB_HOST_ALLOWLIST.includes(h)) return true
  return h === 'githubusercontent.com' || h.endsWith('.githubusercontent.com')
}

export interface RepoRef {
  owner: string
  repo: string
}

// GitHub: Owner 1–39 (alnum + einzelne Bindestriche), Repo alnum + . _ -. Wir prüfen nur grob auf
// „kein Pfad/Schema/Traversal" — ungültige Namen fängt die API mit 404 ab.
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/

/** Strikt `owner/repo`. Kein Schema, kein Pfad, kein `..`, kein Query. */
export function parseRepoRef(input: string): RepoRef {
  const s = String(input ?? '').trim()
  const m = s.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (!m) throw new ArtifactError('repo-ref-invalid', `Ungültige Repo-Angabe '${input}' (erwartet owner/repo)`)
  const owner = m[1]
  const repo = m[2].replace(/\.git$/, '')
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === '.' || repo === '..') {
    throw new ArtifactError('repo-ref-invalid', `Ungültige Repo-Angabe '${input}'`)
  }
  return { owner, repo }
}

/** Extrahiert `owner/repo` aus einer GitHub-Repo-URL (Manifest-Feld `repo`). Nur `github.com`. */
export function parseRepoUrl(url: string): RepoRef {
  let u: URL
  try {
    u = new URL(String(url ?? ''))
  } catch {
    throw new ArtifactError('repo-ref-invalid', `Ungültige Repo-URL '${url}'`)
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new ArtifactError('repo-ref-invalid', `Repo-URL muss http(s) sein: '${url}'`)
  }
  if (u.hostname.toLowerCase() !== 'github.com') {
    throw new ArtifactError('repo-ref-invalid', `Nur github.com-Repo-URLs erlaubt, nicht '${u.hostname}'`)
  }
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts.length < 2) throw new ArtifactError('repo-ref-invalid', `Repo-URL ohne owner/repo: '${url}'`)
  return parseRepoRef(`${parts[0]}/${parts[1]}`)
}

export interface ReleaseAsset {
  assetUrl: string
  tag: string
  version: string
}

interface GithubAsset {
  name?: string
  browser_download_url?: string
}
interface GithubRelease {
  tag_name?: string
  assets?: GithubAsset[]
}

/**
 * Löst `owner/repo` (+ optionalen Tag) zum signierten `.mgxplugin`-Asset auf. Ohne Tag: neuestes
 * Nicht-Prerelease/Nicht-Draft (`/releases/latest`-Semantik von GitHub). Genau EIN `.mgxplugin`-Asset
 * erwartet (0 oder >1 → Fehler, kein Raten).
 */
export async function resolveReleaseAsset(
  ref: RepoRef,
  tag: string | undefined,
  fetchImpl: FetchLike = fetch
): Promise<ReleaseAsset> {
  const apiPath = tag
    ? `/repos/${ref.owner}/${ref.repo}/releases/tags/${encodeURIComponent(tag)}`
    : `/repos/${ref.owner}/${ref.repo}/releases/latest`
  const res = await fetchImpl(`${GITHUB_API}${apiPath}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
  })
  if (res.status === 403 || res.status === 429) {
    throw new ArtifactError('rate-limited', 'GitHub-API-Limit erreicht (60/h ohne Token). Bitte später erneut versuchen.')
  }
  if (res.status === 404) {
    throw new ArtifactError('release-not-found', `Kein Release für ${ref.owner}/${ref.repo}${tag ? ` (Tag ${tag})` : ''}`)
  }
  if (!res.ok) {
    throw new ArtifactError('download-failed', `GitHub-API-Fehler ${res.status} für ${ref.owner}/${ref.repo}`)
  }
  const rel = (await res.json()) as GithubRelease
  const assets = Array.isArray(rel.assets) ? rel.assets : []
  const mgx = assets.filter((a) => typeof a?.name === 'string' && a.name.endsWith('.mgxplugin') && typeof a.browser_download_url === 'string')
  if (mgx.length === 0) throw new ArtifactError('asset-not-found', `Release '${rel.tag_name ?? '?'}' hat kein .mgxplugin-Asset`)
  if (mgx.length > 1) throw new ArtifactError('asset-ambiguous', `Release '${rel.tag_name ?? '?'}' hat mehrere .mgxplugin-Assets`)
  const tagName = rel.tag_name ?? ''
  return { assetUrl: mgx[0].browser_download_url as string, tag: tagName, version: tagName.replace(/^v/, '') }
}

function assertAllowedUrl(url: string): URL {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new ArtifactError('download-failed', `Ungültige URL: ${url}`)
  }
  if (u.protocol !== 'https:') throw new ArtifactError('redirect-blocked', `Nur https erlaubt, nicht '${u.protocol}'`)
  if (!isAllowedHost(u.hostname)) throw new ArtifactError('redirect-blocked', `Host nicht erlaubt: ${u.hostname}`)
  return u
}

/**
 * Lädt eine URL als Buffer — Redirects MANUELL, jeder Hop-Host gegen die Allowlist geprüft; harte
 * Größengrenze per Streaming-Abbruch (`content-length` wird NICHT vertraut); Gesamt-Timeout.
 */
export async function downloadCapped(
  url: string,
  limits: ArtifactLimits = ARTIFACT_LIMITS,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let current = url
    let res: Response | undefined
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      assertAllowedUrl(current)
      res = await fetchImpl(current, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'manual',
        signal: controller.signal,
      })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) throw new ArtifactError('download-failed', `Redirect ${res.status} ohne Location`)
        current = new URL(loc, current).toString()
        continue
      }
      break
    }
    if (!res) throw new ArtifactError('download-failed', 'Kein Response erhalten')
    if (res.status >= 300 && res.status < 400) throw new ArtifactError('redirect-blocked', `Zu viele Redirects (> ${MAX_REDIRECTS})`)
    if (!res.ok) throw new ArtifactError('download-failed', `Download-Fehler ${res.status}`)
    if (!res.body) throw new ArtifactError('download-failed', 'Leerer Response-Body')

    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > limits.maxArchiveBytes) {
        await reader.cancel()
        throw new ArtifactError('archive-too-large', `Download überschreitet ${limits.maxArchiveBytes} Bytes`)
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ArtifactError('download-timeout', `Download-Timeout nach ${timeoutMs} ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** Komplettpfad: `owner/repo` (+ Tag) → verifiziertes Release auflösen → Asset als Buffer laden. */
export async function downloadPluginArtifact(
  repoInput: string,
  tag: string | undefined,
  fetchImpl: FetchLike = fetch,
  limits: ArtifactLimits = ARTIFACT_LIMITS
): Promise<{ archive: Buffer; tag: string; version: string }> {
  const ref = parseRepoRef(repoInput)
  const asset = await resolveReleaseAsset(ref, tag, fetchImpl)
  const archive = await downloadCapped(asset.assetUrl, limits, fetchImpl)
  return { archive, tag: asset.tag, version: asset.version }
}
