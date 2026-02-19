import type { EdooboxOffer } from '../shared/types'

type ApiVersion = 'v1' | 'v2'

interface EdooboxAuth {
  token: string
  edid: string
  expiresAt: number
}

// Static Basic Auth credentials from official edoobox PHP client
const BASIC_AUTH = 'Basic ' + Buffer.from('edapi:DyivKSgxEifwQi2').toString('base64')

function truncateError(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text
  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i)
    const hint = titleMatch ? ` (page: "${titleMatch[1]}")` : ''
    return `Server returned HTML instead of JSON${hint}`
  }
  return text.slice(0, maxLen) + '...'
}

export class EdooboxService {
  private baseUrl: string
  private apiKey: string
  private apiSecret: string
  private apiVersion: ApiVersion
  private auth: EdooboxAuth | null = null

  constructor(baseUrl: string, apiKey: string, apiSecret: string, apiVersion: ApiVersion = 'v1') {
    this.baseUrl = baseUrl.replace(/\/$/, '').replace(/\/v[12]$/i, '')
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.apiVersion = apiVersion
  }

  // ---- V2 Auth (JWT) — used for reading ----

  private async authenticateV2(): Promise<EdooboxAuth> {
    if (this.auth && Date.now() < this.auth.expiresAt) {
      return this.auth
    }

    const expireDate = new Date(Date.now() + 60 * 60 * 1000)
    const offset = -expireDate.getTimezoneOffset()
    const sign = offset >= 0 ? '+' : '-'
    const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
    const expire = expireDate.getFullYear() + '-' +
      pad(expireDate.getMonth() + 1) + '-' +
      pad(expireDate.getDate()) + 'T' +
      pad(expireDate.getHours()) + ':' +
      pad(expireDate.getMinutes()) + ':' +
      pad(expireDate.getSeconds()) +
      sign + pad(Math.floor(offset / 60)) + ':' + pad(offset % 60)

    const res = await fetch(`${this.baseUrl}/v2/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'grant-type': 'password'
      },
      body: JSON.stringify({ key: this.apiKey, secret: this.apiSecret, expire })
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Authentication failed (${res.status}): ${truncateError(text)}`)
    }

    const data = await res.json()
    const token = data.access_token || data.token
    const edid = data.edid || (data.data?.edid) || ''

    if (!token) throw new Error('No access_token in authentication response')
    if (!edid) throw new Error('No edid in authentication response')

    this.auth = { token, edid, expiresAt: Date.now() + 55 * 60 * 1000 }
    return this.auth
  }

  private async requestV2Read(endpoint: string): Promise<unknown> {
    const auth = await this.authenticateV2()
    const url = `${this.baseUrl}/v2${endpoint}`
    console.log(`[edoobox] GET ${url}`)
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'edid': auth.edid,
        'grant-type': 'access_token',
        'Content-Type': 'application/json'
      }
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`edoobox API error (${res.status}): ${truncateError(text)}`)
    }

    const ct = res.headers.get('content-type')
    return ct?.includes('application/json') ? res.json() : res.text()
  }

  // ---- Write operations: Basic Auth + api keys in body (official PHP client pattern) ----

  private async requestWrite(method: 'PUT' | 'POST', endpoint: string, data: Record<string, unknown>): Promise<unknown> {
    const url = `${this.baseUrl}/v1/${endpoint}?`
    const body = {
      api1: this.apiKey,
      api2: this.apiSecret,
      ...data
    }

    console.log(`[edoobox] ${method} ${url}`, JSON.stringify(body).slice(0, 300))

    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': BASIC_AUTH,
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'edooboxAPI'
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const text = await res.text()
      const rawPreview = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
      console.error(`[edoobox] Response ${res.status} from ${url}:`, rawPreview)
      throw new Error(`edoobox API error (${res.status}): ${truncateError(text)}`)
    }

    const ct = res.headers.get('content-type')
    const result = ct?.includes('application/json') ? await res.json() : await res.text()
    console.log(`[edoobox] Response OK from ${url}:`, JSON.stringify(result).slice(0, 300))

    // Check edoobox success flag
    if (typeof result === 'object' && result !== null && 'success' in result && !(result as Record<string, unknown>).success) {
      const msg = (result as Record<string, unknown>).message || JSON.stringify(result)
      throw new Error(`edoobox: ${msg}`)
    }

    return result
  }

  // ---- V1 Read (Keys in Query Parameter) ----

  private async requestV1Read(endpoint: string, extraParams?: Record<string, unknown>): Promise<unknown> {
    const cmsData = {
      api1: this.apiKey,
      api2: this.apiSecret,
      language: 'de',
      ...extraParams
    }
    const url = `${this.baseUrl}/v1${endpoint}?cms_data=${encodeURIComponent(JSON.stringify(cmsData))}`

    const res = await fetch(url)

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`edoobox V1 API error (${res.status}): ${truncateError(text)}`)
    }

    const ct = res.headers.get('content-type')
    return ct?.includes('application/json') ? res.json() : res.text()
  }

  // ---- Public API ----

  async checkConnection(): Promise<boolean> {
    if (this.apiVersion === 'v2') {
      await this.authenticateV2()
      return true
    }
    await this.requestV1Read('/offers', {
      limit: { start: 0, reply: 1 }
    })
    return true
  }

  async listOffers(): Promise<EdooboxOffer[]> {
    if (this.apiVersion === 'v2') {
      const data = await this.requestV2Read('/offer/list') as Record<string, unknown>
      const items = data.data as Record<string, Record<string, unknown>> | unknown[] || {}
      const arr = Array.isArray(items) ? items : Object.values(items)
      return arr.map(item => ({
        id: String((item as Record<string, unknown>).id || ''),
        name: String((item as Record<string, unknown>).name || ''),
        status: String((item as Record<string, unknown>).status || 'active'),
        dateCount: 0
      }))
    }

    const data = await this.requestV1Read('/offers', {
      filter: {
        status: { property: 'offer.status', value: '1,2' }
      },
      limit: { start: 0, reply: 100 }
    }) as Record<string, unknown>

    const content = data.data as Record<string, unknown> | unknown[] || {}
    const arr = Array.isArray(content) ? content : Object.values(content)
    return arr.map(item => ({
      id: String((item as Record<string, unknown>).id || ''),
      name: String((item as Record<string, unknown>).name || (item as Record<string, unknown>).title || ''),
      status: String((item as Record<string, unknown>).status || 'active'),
      dateCount: 0
    }))
  }

  async createOffer(offer: {
    name: string
    description: string
    maxParticipants?: number
    location?: string
    price?: number
    category?: string
  }): Promise<string> {
    // Try V2 JWT auth with PUT (now with Super-Admin permissions)
    const auth = await this.authenticateV2()
    const url = `${this.baseUrl}/v2/offer`
    const body = {
      name: offer.name,
      description: offer.description,
      user_maximum: offer.maxParticipants,
      location: offer.location,
      price: offer.price,
      category: offer.category
    }

    console.log(`[edoobox] PUT ${url}`, JSON.stringify(body).slice(0, 300))

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'edid': auth.edid,
        'grant-type': 'access_token',
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const text = await res.text()
      const rawPreview = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
      console.error(`[edoobox] Response ${res.status} from ${url}:`, rawPreview)
      throw new Error(`edoobox API error (${res.status}): ${truncateError(text)}`)
    }

    const result = await res.json() as Record<string, unknown>
    console.log(`[edoobox] Create offer response:`, JSON.stringify(result).slice(0, 500))

    const data = result.data as Record<string, unknown> | undefined
    const id = result.id || data?.id || result.offerId || ''
    if (!id) throw new Error('No offer ID in response: ' + JSON.stringify(result).slice(0, 300))
    return String(id)
  }

  async createDate(offerId: string, date: {
    date: string
    startTime: string
    endTime: string
  }): Promise<string> {
    const auth = await this.authenticateV2()
    const url = `${this.baseUrl}/v2/modules`
    const body = {
      offerId,
      date: date.date,
      startTime: date.startTime,
      endTime: date.endTime
    }

    console.log(`[edoobox] PUT ${url}`, JSON.stringify(body))

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'edid': auth.edid,
        'grant-type': 'access_token',
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`[edoobox] Create date error (${res.status}):`, text.slice(0, 300))
      throw new Error(`edoobox API error (${res.status}): ${truncateError(text)}`)
    }

    const result = await res.json() as Record<string, unknown>
    console.log(`[edoobox] Create date response:`, JSON.stringify(result).slice(0, 300))

    const data = result.data as Record<string, unknown> | undefined
    return String(result.id || data?.id || '')
  }
}
