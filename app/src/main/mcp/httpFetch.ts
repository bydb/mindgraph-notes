// Netzweg für MCP-Server über Streamable HTTP (E13′, F05). Bewusst NICHT `safeFetch`: der
// sammelt jede Antwort bis zum Ende, die MCP-Antwort kann aber ein laufender SSE-Strom sein;
// außerdem folgt er Weiterleitungen mit denselben Kopfzeilen — bei einer Anmeldemarke wäre
// das ein anderer Dienst. Übernommen wird nur die DNS-Prüfung mit gepinnter Adresse.
//
// Regeln:
// - nur https; http nur für ein ausdrücklich freigegebenes Origin im eigenen Netz
// - private Ziele nur für genau dieses freigegebene Origin (wie bei SearXNG)
// - KEINE Weiterleitung: eine 3xx-Antwort beendet den Aufruf mit Fehler
// - Antwort als Strom, mit Byte-Grenze je Antwort; kein Dekomprimieren (Accept-Encoding: identity)
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { Readable } from 'node:stream'
import { createValidatingLookup } from '../webResearch/egress'
import { isPrivateIp } from '../../shared/webResearch'
import { MCP_MAX_RESPONSE_BYTES, MCP_CALL_TIMEOUT_MS } from '../../shared/mcp'

export type McpFetch = (url: string | URL, init?: RequestInit) => Promise<Response>

export interface McpFetchOptions {
  /** Exakt freigegebenes Origin im eigenen Netz (Main-Dialog). */
  approvedPrivateOrigin?: string
  maxBytes?: number
  connectTimeoutMs?: number
  /** Sieht jede Antwort, bevor das SDK sie bekommt — z.B. für den Sitzungswechsel (E23). */
  onResponse?: (status: number, headers: Headers) => void
}

const USER_AGENT = 'MindGraph-Notes/MCP (+https://mindgraph-notes.de)'

function headersToRecord(h: RequestInit['headers']): Record<string, string> {
  const out: Record<string, string> = {}
  if (!h) return out
  if (h instanceof Headers) h.forEach((v, k) => { out[k] = v })
  else if (Array.isArray(h)) for (const [k, v] of h) out[k] = v
  else Object.assign(out, h as Record<string, string>)
  return out
}

/** Prüft Schema und Ziel, bevor überhaupt verbunden wird. Wirft mit Klartext. */
export function assertMcpUrlAllowed(rawUrl: string, approvedPrivateOrigin?: string): URL {
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new Error(`Keine gültige Adresse: ${rawUrl}`) }
  const approved = !!approvedPrivateOrigin && url.origin === approvedPrivateOrigin
  if (url.username || url.password) throw new Error('Zugangsdaten in der Adresse sind nicht erlaubt — dafür gibt es geheime Kopfzeilen.')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && approved)) {
    throw new Error('Nur https-Adressen sind erlaubt (http nur für eine freigegebene Adresse im eigenen Netz).')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && isPrivateIp(host) && !approved) {
    throw new Error(`${host} ist eine Adresse im eigenen Netz und nicht freigegeben.`)
  }
  if (/^(localhost|.*\.localhost|.*\.local)$/i.test(host) && !approved) {
    throw new Error(`${host} liegt im eigenen Netz und ist nicht freigegeben.`)
  }
  return url
}

export function createMcpFetch(opts: McpFetchOptions = {}): McpFetch {
  const maxBytes = opts.maxBytes ?? MCP_MAX_RESPONSE_BYTES
  return (input, init = {}) => new Promise<Response>((resolve, reject) => {
    let url: URL
    try { url = assertMcpUrlAllowed(String(input), opts.approvedPrivateOrigin) } catch (e) { reject(e); return }
    const method = (init.method || 'GET').toUpperCase()
    const headers = { ...headersToRecord(init.headers), 'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity' }
    const body = init.body
    if (body != null && typeof body !== 'string') { reject(new Error('MCP-Netzweg: nur Text als Anfragekörper')); return }
    const mod = url.protocol === 'https:' ? https : http
    const req = mod.request(url, {
      method,
      headers,
      lookup: createValidatingLookup({ requestOrigin: url.origin, approvedPrivateOrigin: opts.approvedPrivateOrigin }) as unknown as http.RequestOptions['lookup'],
      signal: init.signal ?? undefined
    }, res => {
      const status = res.statusCode || 0
      if (status >= 300 && status < 400) {
        res.destroy()
        reject(new Error(`Der Server leitet weiter (HTTP ${status}) — Weiterleitungen sind bei MCP-Servern nicht erlaubt, die Anmeldung würde sonst an ein anderes Ziel gehen.`))
        return
      }
      let seen = 0
      res.on('data', (chunk: Buffer) => {
        seen += chunk.length
        if (seen > maxBytes) res.destroy(new Error(`Antwort größer als ${Math.round(maxBytes / 1024 / 1024)} MB — abgebrochen.`))
      })
      const responseHeaders = new Headers()
      for (const [k, v] of Object.entries(res.headers)) {
        if (Array.isArray(v)) v.forEach(x => responseHeaders.append(k, x))
        else if (v != null) responseHeaders.set(k, String(v))
      }
      try { opts.onResponse?.(status, responseHeaders) } catch { /* Beobachter darf den Abruf nicht stören */ }
      const nullBody = method === 'HEAD' || status === 204 || status === 304
      const webBody = nullBody ? null : (Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>)
      if (nullBody) res.resume()
      resolve(new Response(webBody, { status, statusText: res.statusMessage, headers: responseHeaders }))
    })
    // Bis die Antwort beginnt (ein Server darf mit dem Kopf warten, bis das Werkzeug fertig ist).
    // Danach regelt der SDK-Aufruf seine eigene Frist; ein offener SSE-Strom darf still sein.
    req.setTimeout(opts.connectTimeoutMs ?? MCP_CALL_TIMEOUT_MS, () => {
      req.destroy(new Error('Zeitüberschreitung: der MCP-Server hat nicht geantwortet'))
    })
    req.on('response', () => req.setTimeout(0))
    req.on('error', reject)
    if (body != null) req.write(body)
    req.end()
  })
}
