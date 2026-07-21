// Webrecherche — der EINE ausgehende Netzwerkpfad des Moduls. Jede Suche UND jeder
// Seitenabruf läuft hier durch. Sicherheitskern (docs/web-research-plan.md, Phase 0):
//
// - Gepinnte Auflösung (0b): ein validierender `lookup` löst den Host EINMAL auf und gibt
//   dem Socket exakt die geprüfte IP — kein zweites `dns.lookup`, also kein DNS-Rebinding-/
//   TOCTOU-Fenster zwischen Prüfung und Verbindung. isPrivateIp (shared) sperrt jeden
//   nicht-global-routbaren Bereich (v4+v6).
// - Redirect-Regel (0c): Redirects nur same-host ohne Protokoll-Downgrade, jeder Hop neu
//   aufgelöst+geprüft, komplette Kette protokolliert. Cross-Host-Redirects werden abgelehnt.
//   Redirect-Antwortkörper werden verworfen (Stream sofort zerstört) — kein Trickle-Traffic.
// - SearXNG-Ausnahme (0d): eine private Adresse ist NUR erlaubt, wenn das Request-ORIGIN
//   (scheme+host+port) exakt einem vom Nutzer per Main-Dialog freigegebenen Origin entspricht.
//   Ein DNS-Name, der (womöglich später) auf privat wechselt, wird ohne passende Freigabe
//   geblockt — die Freigabe ist NICHT der Hostname, sondern das exakte Origin. Gilt nur für
//   den Such-Request, nie für web_fetch oder Redirect-Ziele.
// - Harte Kappungen: dekomprimierte Größe, Inaktivitäts- UND Gesamt-Zeitlimit, Abbruch-Signal.

import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import zlib from 'node:zlib'
import { isPrivateIp, isForbiddenHostname, normalizeWebUrl, MAX_REDIRECT_HOPS } from '../../shared/webResearch'

// Ehrlicher, beschreibender User-Agent mit Kontakt-URL — viele Seiten (u.a. Wikipedia)
// lehnen Requests ohne aussagekräftigen UA ab. Kein Crawler-Verhalten, keine Parallelität.
const WEB_RESEARCH_USER_AGENT = 'MindGraph-Notes/Webrecherche (+https://mindgraph-notes.de)'

export interface SafeFetchResult {
  finalUrl: string
  redirectChain: string[]   // [start, …, final] — alle besuchten URLs
  status: number
  contentType: string
  body: Buffer              // dekomprimiert, auf maxBytes gedeckelt
  truncated: boolean
}

export interface SafeFetchOptions {
  signal?: AbortSignal
  timeoutMs: number
  maxBytes: number
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  bodyText?: string
  followRedirects?: boolean  // default true; false z.B. für JSON-API-Endpunkte
  // Exaktes Origin (scheme+host+port), das privat auflösen DARF (SearXNG-Freigabe, 0d).
  // Nur wirksam, wenn es dem Request-Origin exakt gleicht.
  approvedPrivateOrigin?: string
  acceptContentTypes?: string[] // wenn gesetzt: Antwort muss einem Präfix entsprechen
}

// dns.lookup mit `all` — als Typ-Alias, damit Tests einen Fake injizieren können.
export type ResolveAll = (
  hostname: string,
  options: { all: true },
  callback: (err: NodeJS.ErrnoException | null, addresses: Array<{ address: string; family: number }>) => void
) => void

/** Erste global routbare Adresse aus einer Auflösungsliste, sonst null. */
export function selectPublicAddress(
  addresses: Array<{ address: string; family: number }>
): { address: string; family: number } | null {
  for (const a of addresses) {
    if (!isPrivateIp(a.address)) return a
  }
  return null
}

export interface LookupPolicy {
  requestOrigin: string          // Origin des aktuellen Requests (new URL(url).origin)
  approvedPrivateOrigin?: string // Origin, das der Nutzer für privaten Zugriff freigab
}

/**
 * Baut einen `lookup`, den http/https-`request` als DNS-Auflöser nutzt. Er löst EINMAL auf,
 * wählt eine öffentliche Adresse und gibt sie dem Socket — damit verbindet der Socket
 * garantiert mit der geprüften IP (Pinning, kein Rebinding). Eine PRIVATE Adresse wird nur
 * akzeptiert, wenn `requestOrigin` exakt dem freigegebenen Origin entspricht — sonst blockiert
 * ein (späterer) DNS-Wechsel auf privat den Zugriff.
 */
export function createValidatingLookup(policy: LookupPolicy, resolveAll: ResolveAll = dns.lookup as unknown as ResolveAll) {
  const allowPrivate = !!policy.approvedPrivateOrigin && policy.requestOrigin === policy.approvedPrivateOrigin
  return (hostname: string, options: unknown, callback: (err: NodeJS.ErrnoException | null, address?: string | Array<{ address: string; family: number }>, family?: number) => void): void => {
    resolveAll(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err)
      const list = addresses || []
      let pick = selectPublicAddress(list)
      if (!pick && allowPrivate) pick = list[0] // exakt freigegebener privater Origin
      if (!pick) {
        const e = new Error(`SSRF-Schutz: ${hostname} löst nur auf gesperrte/private Adressen auf`) as NodeJS.ErrnoException
        e.code = 'ESSRFBLOCKED'
        return callback(e)
      }
      const wantsAll = (options as { all?: boolean } | null)?.all
      if (wantsAll) callback(null, [pick])
      else callback(null, pick.address, pick.family)
    })
  }
}

/**
 * Braucht dieses Origin eine private-Zugriff-Freigabe? true, wenn der Host ein privates/
 * internes Literal ist ODER per DNS ausschließlich auf private Adressen auflöst (dann würde
 * der Request eine private IP treffen). Wird beim Speichern der SearXNG-Config genutzt, um
 * den Freigabe-Dialog auch bei „öffentlich aussehenden" Namen (searx.example.com → 127.0.0.1)
 * auszulösen.
 */
export async function originNeedsPrivateApproval(rawUrl: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  if (isForbiddenHostname(host)) return true
  try {
    const addrs = await dns.promises.lookup(host, { all: true })
    return selectPublicAddress(addrs) === null
  } catch {
    return false // nicht auflösbar → der eigentliche Request scheitert später, keine Freigabe nötig
  }
}

/**
 * Ist ein Redirect von `fromUrl` nach `toUrl` erlaubt? Nur same-Host ohne Protokoll-
 * Downgrade (0c). Cross-Host-Redirects (klassischer SSRF-Umweg) werden abgelehnt.
 */
export function isRedirectAllowed(fromUrl: string, toUrl: string): boolean {
  let from: URL, to: URL
  try {
    from = new URL(fromUrl)
    to = new URL(toUrl)
  } catch {
    return false
  }
  if (to.protocol !== 'http:' && to.protocol !== 'https:') return false
  if (from.hostname.toLowerCase() !== to.hostname.toLowerCase()) return false
  if (from.protocol === 'https:' && to.protocol === 'http:') return false // kein Downgrade
  return true
}

// Ein einzelner HTTP(S)-Request ohne Redirect-Folgen. Entpackt STREAMEND und begrenzt die
// entpackten Bytes on-the-fly (kein Materialisieren des vollen Buffers → kein Dekompressions-
// bomben-Speicher). Zusätzlich ein absolutes Gesamt-Zeitlimit gegen Trickle-Antworten.
function requestOnce(rawUrl: string, opts: SafeFetchOptions): Promise<{ status: number; headers: http.IncomingHttpHeaders; location?: string; body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      return reject(new Error(`Ungültige URL: ${rawUrl}`))
    }
    // Literal-Host-Vorprüfung (die IP-Prüfung macht der lookup). Ein privates/internes Literal
    // ist nur erlaubt, wenn dieses exakte Origin freigegeben wurde.
    const host = url.hostname.toLowerCase()
    const originApproved = !!opts.approvedPrivateOrigin && url.origin === opts.approvedPrivateOrigin
    if (isForbiddenHostname(host) && !originApproved) {
      return reject(new Error(`SSRF-Schutz: Host ${host} ist gesperrt`))
    }

    let settled = false
    let deadline: ReturnType<typeof setTimeout> | undefined
    const done = (fn: () => void): void => {
      if (settled) return
      settled = true
      if (deadline) clearTimeout(deadline)
      fn()
    }

    const mod = url.protocol === 'https:' ? https : http
    const req = mod.request(url, {
      method: opts.method || 'GET',
      lookup: createValidatingLookup({ requestOrigin: url.origin, approvedPrivateOrigin: opts.approvedPrivateOrigin }) as unknown as http.RequestOptions['lookup'],
      headers: {
        'User-Agent': WEB_RESEARCH_USER_AGENT,
        'Accept-Encoding': 'gzip, deflate, br',
        ...(opts.headers || {})
      },
      signal: opts.signal
    }, res => {
      const status = res.statusCode || 0
      const location = res.headers.location
      // Bei Redirect den Body NICHT konsumieren: Stream sofort zerstören (ein endloser/
      // trickelnder 302-Body würde sonst nach dem resolve weiterlaufen). Die nächste Runde
      // holt das Ziel mit eigenem Zeitlimit.
      if (location && status >= 300 && status < 400) {
        res.destroy()
        return done(() => resolve({ status, headers: res.headers, location, body: Buffer.alloc(0), truncated: false }))
      }

      const enc = String(res.headers['content-encoding'] || '').toLowerCase()
      let decoder: zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null = null
      if (enc === 'gzip') decoder = zlib.createGunzip()
      else if (enc === 'deflate') decoder = zlib.createInflate()
      else if (enc === 'br') decoder = zlib.createBrotliDecompress()

      const chunks: Buffer[] = []
      let out = 0
      let truncated = false
      const finish = (): void => done(() => {
        const full = Buffer.concat(chunks)
        const capped = full.length > opts.maxBytes
        resolve({ status, headers: res.headers, body: capped ? full.subarray(0, opts.maxBytes) : full, truncated: truncated || capped })
      })
      const cleanup = (): void => {
        try { res.destroy() } catch { /* egal */ }
        if (decoder) { try { decoder.destroy() } catch { /* egal */ } }
      }
      // Cap auf ENTPACKTE Bytes: erst bei ECHTER Überschreitung abbrechen (`>`), damit ein
      // Body von exakt maxBytes nicht fälschlich als gekürzt gilt. Die entpackte Größe wächst
      // in ~16-KB-Schritten → höchstens ein Schritt über maxBytes, finish() kappt hart.
      const onOut = (c: Buffer): void => {
        out += c.length
        chunks.push(c)
        if (out > opts.maxBytes) {
          truncated = true
          cleanup()
          finish()
        }
      }

      res.on('error', (e) => done(() => reject(e)))
      if (decoder) {
        decoder.on('data', onOut)
        decoder.on('end', finish)
        // Ein Fehler nach absichtlichem destroy() ist erwartet — der done-Guard verschluckt ihn.
        decoder.on('error', (e) => done(() => reject(e)))
        res.pipe(decoder)
      } else {
        res.on('data', onOut)
        res.on('end', finish)
      }
    })

    req.on('error', (e) => done(() => reject(e)))
    // Inaktivitäts-Timeout (Socket-Stille) …
    req.setTimeout(opts.timeoutMs, () => {
      req.destroy(new Error(`Zeitüberschreitung (Inaktivität) nach ${opts.timeoutMs} ms`))
    })
    // … PLUS absolutes Gesamtlimit (Trickle-Schutz): feuert unabhängig von eintreffenden Bytes.
    deadline = setTimeout(() => {
      req.destroy(new Error(`Gesamt-Zeitüberschreitung nach ${opts.timeoutMs} ms`))
    }, opts.timeoutMs)

    if (opts.method === 'POST' && opts.bodyText != null) req.write(opts.bodyText)
    req.end()
  })
}

/**
 * Sicherer Fetch mit Pinning, Redirect-Regel und Kappungen. Wirft bei SSRF-Verstoß,
 * Timeout, Abbruch oder unerlaubtem Content-Type.
 */
export async function safeFetch(startUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const normalized = normalizeWebUrl(startUrl)
  if (!normalized) throw new Error(`Ungültige oder unzulässige URL: ${startUrl}`)

  const chain: string[] = [normalized]
  let current = normalized
  const maxHops = opts.followRedirects === false ? 0 : MAX_REDIRECT_HOPS

  for (let hop = 0; ; hop++) {
    const res = await requestOnce(current, opts)

    if (res.location && res.status >= 300 && res.status < 400) {
      if (hop >= maxHops) throw new Error('Zu viele Weiterleitungen')
      let next: string
      try {
        next = new URL(res.location, current).toString()
      } catch {
        throw new Error(`Ungültiges Redirect-Ziel: ${res.location}`)
      }
      if (!isRedirectAllowed(current, next)) {
        throw new Error(`Weiterleitung abgelehnt (nur gleiche Domain ohne Downgrade): ${current} → ${next}`)
      }
      const normNext = normalizeWebUrl(next)
      if (!normNext) throw new Error(`Unzulässiges Redirect-Ziel: ${next}`)
      current = normNext
      chain.push(current)
      continue
    }

    const contentType = String(res.headers['content-type'] || '').toLowerCase()
    if (opts.acceptContentTypes && !opts.acceptContentTypes.some(t => contentType.includes(t))) {
      throw new Error(`Nicht unterstützter Inhaltstyp: ${contentType || '(unbekannt)'}`)
    }
    return {
      finalUrl: current,
      redirectChain: chain,
      status: res.status,
      contentType,
      body: res.body,
      truncated: res.truncated
    }
  }
}
