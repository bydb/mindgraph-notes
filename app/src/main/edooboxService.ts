import type { EdooboxOffer, EdooboxOfferDashboard, EdooboxBooking } from '../shared/types'

type ApiVersion = 'v1' | 'v2'

interface EdooboxAuth {
  token: string
  edid: string
  expiresAt: number
}

export interface EdooboxCategory {
  id: string
  name: string
}

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

  // ---- V2 Auth (JWT) ----

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

  // ---- V2 request helpers ----

  private async requestV2(method: 'GET' | 'POST' | 'PUT' | 'DELETE', endpoint: string, body?: unknown): Promise<unknown> {
    const auth = await this.authenticateV2()
    const url = `${this.baseUrl}/v2${endpoint}`
    console.log(`[edoobox] ${method} ${url}`)

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${auth.token}`,
      'edid': auth.edid,
      'grant-type': 'access_token',
      'Content-Type': 'application/json'
    }

    const options: RequestInit = { method, headers }
    if (body !== undefined) {
      options.body = JSON.stringify(body)
      console.log(`[edoobox] Body:`, JSON.stringify(body).slice(0, 500))
    }

    const res = await fetch(url, options)

    if (!res.ok) {
      const text = await res.text()
      const rawPreview = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
      console.error(`[edoobox] Response ${res.status} from ${url}:`, rawPreview)
      throw new Error(`edoobox API error (${res.status}): ${truncateError(text)}`)
    }

    const ct = res.headers.get('content-type')
    const result = ct?.includes('application/json') ? await res.json() : await res.text()
    console.log(`[edoobox] Response OK from ${url}:`, JSON.stringify(result).slice(0, 500))
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

  async listCategories(): Promise<EdooboxCategory[]> {
    const data = await this.requestV2('GET', '/category/list') as Record<string, unknown>
    const items = data.data as Record<string, Record<string, unknown>> | unknown[] || {}
    const arr = Array.isArray(items) ? items : Object.values(items)
    return arr.map(item => ({
      id: String((item as Record<string, unknown>).id || ''),
      name: String((item as Record<string, unknown>).name || '')
    })).filter(c => c.id && c.name)
  }

  async listOffers(): Promise<EdooboxOffer[]> {
    if (this.apiVersion === 'v2') {
      const data = await this.requestV2('GET', '/offer/list') as Record<string, unknown>
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
    category: string
    number?: string
  }): Promise<string> {
    const body = {
      data: {
        category: offer.category,
        name: offer.name,
        number: offer.number || '',
        type: 'offer'
      }
    }

    const result = await this.requestV2('POST', '/offer', body) as Record<string, unknown>

    const data = result.data as Record<string, unknown> | undefined
    const id = result.id || data?.id || result.offerId || ''
    if (!id) throw new Error('No offer ID in response: ' + JSON.stringify(result).slice(0, 300))
    return String(id)
  }

  async getOffer(offerId: string): Promise<Record<string, unknown>> {
    return await this.requestV2('GET', `/offer/${offerId}`) as Record<string, unknown>
  }

  async updateOffer(offerId: string, fields: Record<string, unknown>): Promise<void> {
    const body = {
      data: {
        id: offerId,
        ...fields
      }
    }
    await this.requestV2('PUT', `/offer/${offerId}`, body)
  }

  async getText(textId: string): Promise<unknown> {
    return await this.requestV2('GET', `/text/${textId}`)
  }

  async listPlaces(): Promise<Array<{ id: string; name: string }>> {
    const data = await this.requestV2('GET', '/place/list') as Record<string, unknown>
    const items = data.data as Record<string, Record<string, unknown>> | unknown[] || {}
    const arr = Array.isArray(items) ? items : Object.values(items)
    return arr.map(item => ({
      id: String((item as Record<string, unknown>).id || ''),
      name: String((item as Record<string, unknown>).name || '')
    })).filter(p => p.id && p.name)
  }

  async createPlace(name: string): Promise<string> {
    const body = {
      data: {
        name
      }
    }
    const result = await this.requestV2('POST', '/place', body) as Record<string, unknown>
    const data = result.data as Record<string, unknown> | undefined
    const id = result.id || data?.id || ''
    if (!id) throw new Error('No place ID in response: ' + JSON.stringify(result).slice(0, 300))
    return String(id)
  }

  async createOfferText(offerId: string, language: string, value: string): Promise<void> {
    // Wrap plain text in <p> tags if not already HTML
    const htmlValue = value.startsWith('<') ? value : `<p>${value}</p>`
    const body = {
      data: {
        resource: 'description',
        resource_id: offerId,
        language,
        value: htmlValue
      }
    }
    await this.requestV2('POST', '/text', body)
  }

  private extractPlaceName(places: unknown): string | undefined {
    if (!Array.isArray(places) || places.length === 0) return undefined
    const p = places[0] as Record<string, unknown>
    return p.name ? String(p.name) : undefined
  }

  private extractLeaders(leaders: unknown): string[] {
    if (!Array.isArray(leaders)) return []
    return leaders.map((l: Record<string, unknown>) => {
      const parts = [l.first_name, l.last_name].filter(Boolean).map(String)
      return parts.join(' ')
    }).filter(n => n.length > 0)
  }

  async listOffersForDashboard(scope: 'active' | 'past' | 'all' = 'active'): Promise<EdooboxOfferDashboard[]> {
    const filter: Array<Record<string, unknown>> = [{ property: 'trash', value: false }]
    if (scope === 'active') {
      filter.push({ property: 'archive', value: false })
    }

    const params = new URLSearchParams()
    params.set('fields', JSON.stringify(['name', 'number', 'count_booking', 'offer_places', 'user_maximum', 'date_start', 'date_end', 'status', 'ep_hash', 'leaders', 'description']))
    params.set('filter', JSON.stringify(filter))
    params.set('limit', JSON.stringify({ start: 0, reply: 500 }))
    params.set('order', JSON.stringify([{ property: 'id', value: 'DESC' }]))
    params.set('language', 'de')

    const data = await this.requestV2('GET', `/offer/list/globaltable?${params.toString()}`) as Record<string, unknown>
    const items = data.data as Record<string, Record<string, unknown>> | unknown[] || {}
    const arr = Array.isArray(items) ? items : Object.values(items)

    const offers = arr.map(item => {
      const r = item as Record<string, unknown>
      return {
        id: String(r.id || ''),
        name: String(r.name || ''),
        number: String(r.number || ''),
        status: String(r.status || '0'),
        bookingCount: Number(r.count_booking || 0),
        maxParticipants: Number(r.user_maximum || 0),
        dateStart: r.date_start ? String(r.date_start) : undefined,
        dateEnd: r.date_end ? String(r.date_end) : undefined,
        epHash: r.ep_hash ? String(r.ep_hash) : undefined,
        location: this.extractPlaceName(r.offer_places),
        leaders: this.extractLeaders(r.leaders),
        description: r.description ? String(r.description) : undefined,
        bookings: []
      }
    }).filter(o => o.id)

    if (scope === 'past') {
      // Nur Veranstaltungen, deren End-Datum in der Vergangenheit liegt; neueste zuerst
      const now = Date.now()
      return offers
        .filter(o => {
          const ref = o.dateEnd || o.dateStart
          if (!ref) return false
          const t = Date.parse(ref)
          return !isNaN(t) && t < now
        })
        .sort((a, b) => {
          const ta = Date.parse(a.dateStart || a.dateEnd || '') || 0
          const tb = Date.parse(b.dateStart || b.dateEnd || '') || 0
          return tb - ta
        })
    }

    return offers
  }

  async listBookingsForOffer(offerId: string): Promise<EdooboxBooking[]> {
    // Step 1: Get booking IDs for this offer
    const params = new URLSearchParams()
    params.set('filter', JSON.stringify([{ property: 'offer', expression: '=', value: offerId }]))
    params.set('limit', JSON.stringify({ start: 0, reply: 500 }))

    const data = await this.requestV2('GET', `/booking/list?${params.toString()}`) as Record<string, unknown>
    const items = data.data as Record<string, Record<string, unknown>> | unknown[] || {}
    const arr = Array.isArray(items) ? items : Object.values(items)

    // Step 2: Fetch booking details + user details
    const userCache = new Map<string, { name: string; email: string }>()
    const bookings: EdooboxBooking[] = []

    for (const item of arr) {
      const bookingId = String((item as Record<string, unknown>).id || '')
      if (!bookingId) continue

      try {
        const detail = await this.requestV2('GET', `/booking/${bookingId}`) as Record<string, unknown>
        const d = detail.data as Record<string, Record<string, unknown>> | undefined
        const bookingData = d ? (Object.values(d)[0] || {}) as Record<string, unknown> : {}

        if (bookings.length === 0) {
          console.log('[edoobox] Raw booking fields (first):', Object.keys(bookingData))
        }

        const bookedAt = String(bookingData.time || '')
        const ownerId = String(bookingData.owner || '')

        let present: boolean | undefined
        const presenceField = (bookingData.present ?? bookingData.presence ?? bookingData.attended ?? bookingData.anwesend) as unknown
        if (presenceField !== undefined && presenceField !== null) {
          present = Boolean(presenceField) && presenceField !== '0' && presenceField !== 0
        }

        // Fetch user details if not cached
        if (ownerId && !userCache.has(ownerId)) {
          try {
            const userResp = await this.requestV2('GET', `/user/${ownerId}`) as Record<string, unknown>
            const ud = userResp.data as Record<string, Record<string, unknown>> | undefined
            const userData = ud ? (Object.values(ud)[0] || {}) as Record<string, unknown> : {}
            userCache.set(ownerId, {
              name: [String(userData.first_name || ''), String(userData.last_name || '')].filter(Boolean).join(' ') || 'Unbekannt',
              email: String(userData.email || '')
            })
          } catch {
            userCache.set(ownerId, { name: 'Unbekannt', email: '' })
          }
        }

        const user = userCache.get(ownerId) || { name: 'Unbekannt', email: '' }
        bookings.push({
          id: bookingId,
          offerId,
          userName: user.name,
          userEmail: user.email,
          status: bookingData.canceled ? 'canceled' : 'active',
          bookedAt,
          present
        })
      } catch (e) {
        console.warn('[edoobox] Could not fetch booking detail:', bookingId, e)
      }
    }

    return bookings
  }

  async createDate(offerId: string, date: {
    date: string
    startTime: string
    endTime: string
    description?: string
    placeId?: string
  }): Promise<string> {
    // Build ISO date-time strings from date + time
    const dateStart = `${date.date}T${date.startTime}:00+02:00`
    const dateEnd = `${date.date}T${date.endTime}:00+02:00`

    const body = {
      data: {
        description: date.description || '',
        date_start: dateStart,
        date_end: dateEnd,
        place: date.placeId || false,
        room: false,
        offer: offerId
      }
    }

    const result = await this.requestV2('POST', '/date', body) as Record<string, unknown>
    const data = result.data as Record<string, unknown> | undefined
    return String(result.id || data?.id || '')
  }
}
