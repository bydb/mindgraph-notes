// Webrecherche — Such-Provider-Clients (Tavily, SearXNG, Linkup). Alle laufen über den einen
// Egress-Pfad (egress.ts) und liefern normalisierte WebSearchHits. Die Antwortgröße ist
// gedeckelt; kaputte/Nicht-JSON-Antworten werden mit verständlicher Meldung abgewiesen.

import { safeFetch } from './egress'
import {
  parseSearxngResults,
  parseLinkupResults,
  parseTavilyResults,
  type WebSearchHit,
  type WebResearchConfig,
  MAX_HITS_PER_SEARCH,
  WEB_SEARCH_RESPONSE_MAX_BYTES,
  WEB_FETCH_TIMEOUT_MS
} from '../../shared/webResearch'

export interface WebSearchDeps {
  config: WebResearchConfig
  apiKey?: string | null   // Key des aktuellen Providers (tavily/linkup); null bei searxng
  signal?: AbortSignal
}

function parseJsonBody(body: Buffer, providerLabel: string): unknown {
  const text = body.toString('utf8').trim()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${providerLabel} lieferte kein gültiges JSON zurück.`)
  }
}

async function searchViaSearxng(config: WebResearchConfig, query: string, signal?: AbortSignal): Promise<WebSearchHit[]> {
  let base: URL
  try {
    base = new URL(config.searxngUrl)
  } catch {
    throw new Error('SearXNG-URL ist ungültig. Bitte in den Einstellungen prüfen.')
  }
  base.pathname = base.pathname.replace(/\/+$/, '') + '/search'
  base.searchParams.set('q', query)
  base.searchParams.set('format', 'json')

  let res
  try {
    res = await safeFetch(base.toString(), {
      signal,
      timeoutMs: WEB_FETCH_TIMEOUT_MS,
      maxBytes: WEB_SEARCH_RESPONSE_MAX_BYTES,
      followRedirects: false,            // JSON-Endpunkt leitet nicht weiter
      // 0d: private/LAN-Instanz nur, wenn dieses Origin exakt freigegeben wurde.
      approvedPrivateOrigin: config.approvedPrivateOrigin,
      acceptContentTypes: ['application/json', 'text/json', 'application/x-json']
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/Inhaltstyp/.test(msg)) {
      throw new Error('SearXNG lieferte kein JSON. Aktiviere in der Instanz unter `search.formats` das Format `json` (settings.yml).')
    }
    throw new Error(`SearXNG nicht erreichbar: ${msg}`)
  }
  if (res.status < 200 || res.status >= 300) throw new Error(`SearXNG antwortete mit HTTP ${res.status}.`)
  return parseSearxngResults(parseJsonBody(res.body, 'SearXNG'))
}

async function searchViaLinkup(query: string, apiKey: string | null | undefined, signal?: AbortSignal): Promise<WebSearchHit[]> {
  const key = (apiKey || '').trim()
  if (!key) throw new Error('Kein Linkup-API-Key hinterlegt. Bitte in den Einstellungen eintragen.')

  // depth 'fast': KEINE agentische Interpretation, KEIN serverseitiges Scraping (laut Linkup-
  // Doku; 'standard' interpretiert die Anfrage agentisch und kann Seiten scrapen — das würde
  // „Extraktion immer lokal" verletzen, Codex-Finding 3). outputType 'searchResults' = reine
  // Treffer (URLs + Snippets); die Seiten-Extraktion machen wir lokal (fetchExtract.ts).
  let res
  try {
    res = await safeFetch('https://api.linkup.so/v1/search', {
      signal,
      timeoutMs: WEB_FETCH_TIMEOUT_MS,
      maxBytes: WEB_SEARCH_RESPONSE_MAX_BYTES,
      method: 'POST',
      followRedirects: false,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      bodyText: JSON.stringify({ q: query, depth: 'fast', outputType: 'searchResults', includeImages: false }),
      acceptContentTypes: ['application/json']
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Linkup nicht erreichbar: ${msg}`)
  }
  if (res.status === 401 || res.status === 403) throw new Error('Linkup lehnt den API-Key ab (401/403).')
  if (res.status === 429) throw new Error('Linkup-Ratenlimit erreicht (429). Später erneut versuchen.')
  if (res.status < 200 || res.status >= 300) throw new Error(`Linkup antwortete mit HTTP ${res.status}.`)
  return parseLinkupResults(parseJsonBody(res.body, 'Linkup'))
}

async function searchViaTavily(query: string, apiKey: string | null | undefined, signal?: AbortSignal): Promise<WebSearchHit[]> {
  const key = (apiKey || '').trim()
  if (!key) throw new Error('Kein Tavily-API-Key hinterlegt. Bitte in den Einstellungen eintragen (kostenlos bei app.tavily.com).')

  // search_depth 'basic' = reine Treffer (Titel + URL + Snippet), keine LLM-Antwort/kein
  // serverseitiges Raw-Content-Scraping — die Seiten-Extraktion machen wir lokal (fetchExtract).
  let res
  try {
    res = await safeFetch('https://api.tavily.com/search', {
      signal,
      timeoutMs: WEB_FETCH_TIMEOUT_MS,
      maxBytes: WEB_SEARCH_RESPONSE_MAX_BYTES,
      method: 'POST',
      followRedirects: false,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      bodyText: JSON.stringify({ query, search_depth: 'basic', max_results: MAX_HITS_PER_SEARCH, include_answer: false, include_raw_content: false, include_images: false }),
      acceptContentTypes: ['application/json']
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Tavily nicht erreichbar: ${msg}`)
  }
  if (res.status === 401 || res.status === 403) throw new Error('Tavily lehnt den API-Key ab (401/403). Key in den Einstellungen prüfen.')
  if (res.status === 429) throw new Error('Tavily-Ratenlimit/Kontingent erreicht (429). Später erneut versuchen.')
  if (res.status < 200 || res.status >= 300) throw new Error(`Tavily antwortete mit HTTP ${res.status}.`)
  return parseTavilyResults(parseJsonBody(res.body, 'Tavily'))
}

/** Führt eine Websuche über den konfigurierten Provider aus. `query` ist bereits geprüft. */
export async function webSearch(query: string, deps: WebSearchDeps): Promise<WebSearchHit[]> {
  if (deps.config.provider === 'tavily') return searchViaTavily(query, deps.apiKey, deps.signal)
  if (deps.config.provider === 'searxng') return searchViaSearxng(deps.config, query, deps.signal)
  if (deps.config.provider === 'linkup') return searchViaLinkup(query, deps.apiKey, deps.signal)
  throw new Error(`Unbekannter Suchanbieter: ${deps.config.provider}`)
}
