// Marketing Service: WordPress REST API
import https from 'node:https'
import http from 'node:http'

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

  constructor(siteUrl: string, username: string, appPassword: string) {
    this.baseUrl = siteUrl.replace(/\/$/, '') + '/wp-json/wp/v2'
    // Application Passwords: Leerzeichen entfernen, da WordPress sie nur zur Lesbarkeit einfügt
    this.password = appPassword.replace(/\s+/g, '')
    this.username = username
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${this.password}`).toString('base64')
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
    let res = await fetch(url, {
      method,
      headers,
      body: rawBody ? new Uint8Array(rawBody) : (body ? JSON.stringify(body) : undefined),
      signal: AbortSignal.timeout(30000)
    })

    // Apache/CGI-Fallback: Wenn 401 mit rest_not_logged_in, nutze node:https direkt
    // (Apache leitet den Authorization-Header bei fetch() oft nicht an PHP weiter)
    if (res.status === 401) {
      const errText = await res.text().catch(() => '')
      if (errText.includes('rest_not_logged_in')) {
        console.log('[marketing:wp] Auth header blocked, trying node:https with explicit auth')
        const result = await this.requestWithNodeHttp<T>(method, url, headers, rawBody ? new Uint8Array(rawBody) : (body ? JSON.stringify(body) : undefined))
        return result
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
   * Fallback via node:https — setzt auth direkt im Request-Options-Objekt,
   * was Apache-Server korrekt als PHP_AUTH_USER/PHP_AUTH_PW durchreichen.
   */
  private requestWithNodeHttp<T>(method: string, url: string, headers: Record<string, string>, body?: string | Uint8Array): Promise<T> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const mod = parsed.protocol === 'https:' ? https : http
      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
        auth: `${this.username}:${this.password}`,
        timeout: 30000
      }

      const req = mod.request(options, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const responseText = Buffer.concat(chunks).toString('utf-8')
          console.log(`[marketing:wp] node:https response ${res.statusCode}:`, responseText.slice(0, 200))
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(responseText) as T)
            } catch {
              reject(new Error(`Invalid JSON response: ${responseText.slice(0, 100)}`))
            }
          } else {
            let msg = `WordPress API error ${res.statusCode}`
            try {
              const err = JSON.parse(responseText)
              if (err.message) msg = err.message
              if (err.code) msg += ` (${err.code})`
            } catch { /* ignore */ }
            reject(new Error(msg))
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })
      if (body) req.write(body)
      req.end()
    })
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

    const res = await fetch(url, {
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
