// Marketing Service: WordPress REST API (Plugin-Vertikale). Kein node:https/fetch direkt:
// HTTP kommt INJIZIERT herein — `fetchImpl` (host.http.fetch, allowlist-gegated) für den
// Normalfall, `basicAuthFetch` (host.http.fetchBasicAuth) für den Apache-Auth-Fallback.

/** Host-injizierter fetch (Domain-Allowlist erzwingt der Capability-Host). */
export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>
/** Host-injizierter Basic-Auth-Request (Credentials in den Connection-Options, Apache-Quirk). */
export type BasicAuthFetch = (
  url: string,
  opts: { method: string; headers?: Record<string, string>; body?: string | Uint8Array; username: string; password: string; timeoutMs?: number }
) => Promise<{ statusCode: number; text: string }>

export interface WordPressPost {
  id: number
  link: string
  status: 'publish' | 'draft' | 'pending'
  title: { rendered: string }
}

export interface WordPressMedia {
  id: number
  source_url: string
}

// ---- WordPress ----

export class WordPressService {
  private baseUrl: string
  private username: string
  private password: string
  private authHeader: string
  private fetchImpl: FetchImpl
  private basicAuthFetch: BasicAuthFetch

  constructor(siteUrl: string, username: string, appPassword: string, fetchImpl: FetchImpl, basicAuthFetch: BasicAuthFetch) {
    this.baseUrl = siteUrl.replace(/\/$/, '') + '/wp-json/wp/v2'
    // Application Passwords: Leerzeichen entfernen, da WordPress sie nur zur Lesbarkeit einfügt
    this.password = appPassword.replace(/\s+/g, '')
    this.username = username
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${this.password}`).toString('base64')
    this.fetchImpl = fetchImpl
    this.basicAuthFetch = basicAuthFetch
  }

  private async request<T>(method: string, endpoint: string, body?: object, contentType?: string, rawBody?: Buffer): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    console.log(`[marketing:wp] ${method} ${url}`)

    const headers: Record<string, string> = {
      'Authorization': this.authHeader
    }
    if (contentType) {
      headers['Content-Type'] = contentType
    } else if (body) {
      headers['Content-Type'] = 'application/json'
    }

    // Erster Versuch: Standard Authorization Header
    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: rawBody ? new Uint8Array(rawBody) : (body ? JSON.stringify(body) : undefined),
      signal: AbortSignal.timeout(30000)
    })

    // Apache/CGI-Fallback: Wenn 401 mit rest_not_logged_in, Basic-Auth in den Connection-Options
    // (Apache leitet den Authorization-Header bei fetch() oft nicht an PHP weiter)
    if (res.status === 401) {
      const errText = await res.text().catch(() => '')
      if (errText.includes('rest_not_logged_in')) {
        console.log('[marketing:wp] Auth header blocked, trying basic-auth-in-options')
        return await this.requestWithBasicAuth<T>(method, url, headers, rawBody ? new Uint8Array(rawBody) : (body ? JSON.stringify(body) : undefined))
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.log(`[marketing:wp] Error response ${res.status}:`, text.slice(0, 300))
      let msg = `WordPress API error ${res.status}`
      try {
        const err = JSON.parse(text)
        if (err.message) msg = err.message
        if (err.code) msg += ` (${err.code})`
      } catch {
        if (text.length > 0 && text.length < 200) msg += `: ${text}`
      }
      throw new Error(msg)
    }

    return res.json() as Promise<T>
  }

  /**
   * Fallback über host.http.fetchBasicAuth — setzt auth direkt in den Connection-Options,
   * was Apache-Server korrekt als PHP_AUTH_USER/PHP_AUTH_PW durchreichen.
   */
  private async requestWithBasicAuth<T>(method: string, url: string, headers: Record<string, string>, body?: string | Uint8Array): Promise<T> {
    const { statusCode, text } = await this.basicAuthFetch(url, {
      method,
      headers,
      body,
      username: this.username,
      password: this.password,
      timeoutMs: 30000,
    })
    console.log(`[marketing:wp] basic-auth response ${statusCode}:`, text.slice(0, 200))
    if (statusCode >= 200 && statusCode < 300) {
      try {
        return JSON.parse(text) as T
      } catch {
        throw new Error(`Invalid JSON response: ${text.slice(0, 100)}`)
      }
    }
    let msg = `WordPress API error ${statusCode}`
    try {
      const err = JSON.parse(text)
      if (err.message) msg = err.message
      if (err.code) msg += ` (${err.code})`
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  async checkConnection(): Promise<{ id: number; name: string }> {
    return this.request('GET', '/users/me')
  }

  async createPost(title: string, content: string, status: 'draft' | 'publish', featuredMediaId?: number): Promise<WordPressPost> {
    const body: Record<string, unknown> = { title, content, status }
    if (featuredMediaId) body.featured_media = featuredMediaId
    return this.request('POST', '/posts', body)
  }

  async uploadMedia(imageBuffer: Buffer, filename: string, mimeType: string, caption?: string): Promise<WordPressMedia> {
    const url = `${this.baseUrl}/media`
    console.log(`[marketing:wp] POST ${url} (upload: ${filename})`)

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`
      },
      body: new Uint8Array(imageBuffer),
      signal: AbortSignal.timeout(60000)
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`WordPress media upload failed (${res.status}): ${text.slice(0, 200)}`)
    }

    const media = await res.json() as WordPressMedia

    // Set caption on the media if provided
    if (caption && media.id) {
      try {
        console.log('[marketing:wp] Setting media caption on', media.id, ':', caption)
        await this.request('POST', `/media/${media.id}`, { caption })
        console.log('[marketing:wp] Media caption set successfully')
      } catch (e) {
        console.warn('[marketing:wp] Failed to set media caption:', e)
      }
    }

    return media
  }
}
