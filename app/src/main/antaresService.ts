/**
 * Antares CS API Client.
 *
 * Reverse-engineered against Antares CS 2.0.4 (h+h Software / antares.net).
 * Read-only access via Cookie+PID session — uses the same flow as the
 * browser-based UI. Designed for the user's own admin/staff account.
 *
 * No official API exists; endpoints may change with Antares upgrades.
 */

import type { AntaresEntleiher, AntaresVerleihRow } from '../shared/types'

interface AntaresAuth {
  pid: string
  cookie: string
  expiresAt: number
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

/** Extract cookies from a Set-Cookie response header chain into a single Cookie request header. */
function extractCookies(setCookieHeader: string | null, prior = ''): string {
  if (!setCookieHeader) return prior
  // Set-Cookie can contain multiple comma-separated cookies but commas can also appear in Expires
  // Use a simple parser: split by comma only when followed by `<name>=`
  const parts = setCookieHeader.split(/, (?=[A-Za-z0-9_-]+=)/)
  const jar: Record<string, string> = {}
  for (const c of prior.split('; ').filter(Boolean)) {
    const [k, ...vRest] = c.split('=')
    if (k) jar[k] = vRest.join('=')
  }
  for (const p of parts) {
    const firstSemi = p.indexOf(';')
    const kv = firstSemi >= 0 ? p.slice(0, firstSemi) : p
    const eq = kv.indexOf('=')
    if (eq > 0) {
      const k = kv.slice(0, eq).trim()
      const v = kv.slice(eq + 1).trim()
      if (k) jar[k] = v
    }
  }
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
}

export class AntaresService {
  private baseUrl: string
  private context: string
  private username: string
  private password: string
  private auth: AntaresAuth | null = null

  constructor(baseUrl: string, username: string, password: string, context = 'HE/16') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.username = username
    this.password = password
    this.context = context
  }

  // ---- Auth ----

  private async authenticate(): Promise<AntaresAuth> {
    if (this.auth && Date.now() < this.auth.expiresAt) {
      return this.auth
    }

    // 1) Holt Login-Seite — sie liefert die initiale PID und setzt einen Session-Cookie
    const r1 = await fetch(`${this.baseUrl}/`, { method: 'GET' })
    if (!r1.ok) throw new Error(`Antares Login-Seite (${r1.status}): ${truncateError(await r1.text())}`)
    const html1 = await r1.text()
    const m = html1.match(/login\?pid=([a-z0-9]+)/i)
    if (!m) throw new Error('Antares: konnte initiale PID nicht aus Login-Seite extrahieren')
    const initialPid = m[1]
    const cookie1 = extractCookies(r1.headers.get('set-cookie'))

    // 2) Credentials POSTen
    const r2 = await fetch(`${this.baseUrl}/login?pid=${encodeURIComponent(initialPid)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookie1
      },
      body: new URLSearchParams({ name: this.username, password: this.password }).toString(),
      redirect: 'manual'
    })
    const cookie2 = extractCookies(r2.headers.get('set-cookie'), cookie1)

    // 3) Sanity: Dashboard abrufen — wenn Login fehlschlug, kommt eine Login-Seite zurueck
    const check = await fetch(`${this.baseUrl}/dashboard?template=plain&pid=${initialPid}`, {
      method: 'GET',
      headers: { 'Cookie': cookie2 }
    })
    const checkText = await check.text()
    if (check.status !== 200 || /id="loginform"|name="password"/.test(checkText.slice(0, 2000))) {
      throw new Error('Antares Login fehlgeschlagen — Benutzername oder Passwort falsch')
    }

    // Session ist ~30 min gueltig (Heuristik). Wir cachen 25 min.
    this.auth = { pid: initialPid, cookie: cookie2, expiresAt: Date.now() + 25 * 60 * 1000 }
    return this.auth
  }

  async checkConnection(): Promise<boolean> {
    await this.authenticate()
    return true
  }

  // ---- Generic request helper ----

  private async post<T = unknown>(path: string, body: Record<string, string>): Promise<T> {
    const auth = await this.authenticate()
    const sep = path.includes('?') ? '&' : '?'
    const url = `${this.baseUrl}${path}${sep}pid=${auth.pid}`
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': auth.cookie,
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${this.baseUrl}/`
      },
      body: new URLSearchParams(body).toString()
    })
    if (!r.ok) {
      const text = await r.text()
      throw new Error(`Antares POST ${path} (${r.status}): ${truncateError(text)}`)
    }
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      return r.json() as Promise<T>
    }
    // Manche Endpunkte liefern JSON ohne korrekten Content-Type
    const text = await r.text()
    try { return JSON.parse(text) as T } catch {
      throw new Error(`Antares POST ${path}: erwartete JSON, bekam: ${truncateError(text)}`)
    }
  }

  /** Wärmt die Such-Maske auf, indem das HTML-Skelett geladen wird. Manche Endpunkte
   *  benötigen vorher einen Session-State, sonst antwortet Antares mit "SQL ERROR". */
  private async primeSearchMask(table: string, id: string): Promise<void> {
    const auth = await this.authenticate()
    const url = `${this.baseUrl}/result?template=partplain&id=${encodeURIComponent(id)}&type=${encodeURIComponent(table)}&pid=${auth.pid}`
    await fetch(url, {
      method: 'POST',
      headers: {
        'Cookie': auth.cookie,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${this.baseUrl}/`
      }
    }).catch(() => {})  // best effort
  }

  // ---- Domain methods ----

  /** Offene Registrierungen — Count aus dem Dashboard-HTML.
   *  (Der direkte /search-Endpoint liefert ohne UI-State alle Entleiher,
   *  daher parsen wir den vorgerenderten Dashboard-Count.) */
  async listOffeneRegistrierungen(): Promise<AntaresEntleiher[]> {
    // Best effort: versuche den direkten Search-Call, der nur in einer
    // "warmen" Session sauber gefiltert antwortet. Wenn Count > 100 zurück­kommt,
    // ist die Session kalt → fallback auf 0 (Count steht trotzdem im Dashboard).
    try {
      await this.primeSearchMask('entleiher', '2')
      const data = await this.post<{ rows?: AntaresEntleiher[]; total?: number }>(
        `/search?table=entleiher&id=2&context=${encodeURIComponent(this.context)}`,
        { autosearch: 'true' }
      )
      const total = Number(data.total || 0)
      if (total > 0 && total < 100) {
        return data.rows || []
      }
      return []
    } catch {
      return []
    }
  }

  /** Liest die aktuellen Aufgaben-Counts direkt aus dem Antares-Dashboard-HTML.
   *  Robuster als die /search-Endpoints, weil der Server diese Werte schon
   *  vorberechnet liefert. */
  async fetchDashboardCounts(): Promise<{
    offeneRegistrierungen: number
    offeneAnfragenGeraete: number
    offeneVorbestellungenGeraete: number
    stornierteVorbestellungen: number
    ueberfaelligeGeraete: number
    offeneVorbestellungenMedien: number
    ueberfaelligeMedien: number
  }> {
    const auth = await this.authenticate()
    const url = `${this.baseUrl}/dashboard?template=plain&pid=${auth.pid}`
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': auth.cookie,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${this.baseUrl}/`,
        'Accept': 'text/html, */*'
      }
    })
    const html = await r.text()

    const extractCount = (pattern: RegExp): number => {
      const m = html.match(pattern)
      return m ? parseInt(m[1], 10) : 0
    }

    return {
      offeneRegistrierungen: extractCount(/(\d+)\s*offene\s+Registrierung/i),
      offeneAnfragenGeraete: extractCount(/(\d+)\s*offene\s+Anfragen/i),
      offeneVorbestellungenGeraete: extractCount(/(\d+)\s*offene\s+Vorbestellungen/i),
      stornierteVorbestellungen: extractCount(/(\d+)\s*stornierte\s+Vorbestellungen/i),
      ueberfaelligeGeraete: extractCount(/(\d+)\s*überfällige\s+Rückgaben/i),
      offeneVorbestellungenMedien: extractCount(/(\d+)\s*offene\s+Vorbestellung\b/i),
      // Zweites Vorkommen von "überfällige Rückgaben" für Medien:
      ueberfaelligeMedien: (() => {
        const all = Array.from(html.matchAll(/(\d+)\s*überfällige\s+Rückgaben/gi))
        return all.length >= 2 ? parseInt(all[1][1], 10) : 0
      })()
    }
  }

  /** Alle Entleiher (paginiert, default 200 pro Seite). Vorsicht: kann Tausende sein. */
  async listEntleiher(opts: { page?: number; rows?: number } = {}): Promise<{ total: number; rows: AntaresEntleiher[] }> {
    await this.primeSearchMask('entleiher', '1')
    const data = await this.post<{ total: number; rows?: AntaresEntleiher[]; all_ids?: string[] }>(
      `/search?table=entleiher&id=1&context=${encodeURIComponent(this.context)}`,
      {
        autosearch: 'true',
        page: String(opts.page ?? 1),
        rows: String(opts.rows ?? 200)
      }
    )
    return { total: Number(data.total || 0), rows: data.rows || [] }
  }

  /** Verleihfunktion (z.B. Mahnungen Geräte/Medien). Initialisiert Filter, holt Daten. */
  private async runVerleihFunktion(
    ref: string,
    initBody: Record<string, string>,
    opts: { page?: number; rows?: number; sort?: string; order?: 'asc' | 'desc'; status?: string } = {}
  ): Promise<{ total: number; rows: AntaresVerleihRow[] }> {
    // 1) Filter serverseitig setzen
    await this.post(
      `/verleihsearch?action=verleih&refnr=${encodeURIComponent(ref)}&template=superplain`,
      initBody
    )
    // 2) Daten holen
    const data = await this.post<{ total: number; rows?: AntaresVerleihRow[] }>(
      `/verleihsuchecopies?context=${encodeURIComponent(this.context)}&info=&ref=${encodeURIComponent(ref)}&rowcount=${opts.rows ?? 50}`,
      {
        order: opts.order ?? 'asc',
        page: String(opts.page ?? 1),
        rows: String(opts.rows ?? 50),
        sort: opts.sort ?? 'fn_rueckdatum',
        status: opts.status ?? '10,11,20,21,40'
      }
    )
    return { total: Number(data.total || 0), rows: data.rows || [] }
  }

  /** Technikverleih — überfällige Geräte-Rückgaben (Mahnungen). */
  async listMahnungenGeraete(opts: { page?: number; rows?: number } = {}) {
    const today = new Date().toISOString().slice(0, 10)
    return this.runVerleihFunktion('5_geraete', {
      apl: 'mahnung',
      endrueck: today,
      info: 'geraete',
      rtype: 'M',
      status: '20,21'
    }, opts)
  }

  /** Medienverleih — überfällige Medien-Rückgaben (Mahnungen). */
  async listMahnungenMedien(opts: { page?: number; rows?: number } = {}) {
    const today = new Date().toISOString().slice(0, 10)
    return this.runVerleihFunktion('5_medien', {
      apl: 'mahnung',
      endrueck: today,
      info: 'medien',
      rtype: 'M',
      status: '20,21'
    }, opts)
  }

  /** Ausgabeliste — heute ausgegebener Verleih (Geräte + Medien gemischt). */
  async listAusgabeliste(opts: { page?: number; rows?: number } = {}) {
    const today = new Date().toISOString().slice(0, 10)
    return this.runVerleihFunktion('4', {
      apl: 'konto',
      atype: 'M',
      ausgabe: today,
      status: '20,21'
    }, opts)
  }
}
