// Webrecherche — URL → sauberes Markdown, komplett LOKAL. Fetch über den gepinnten
// Egress-Pfad, Extraktion via defuddle-CORE (synchron, DOM-agnostisch) auf einem
// linkedom-Dokument, dann turndown. Bewusst NICHT `defuddle/node`: dessen asynchrone
// Extraktoren könnten Dritt-Endpunkte (z.B. FxTwitter) ansprechen — der synchrone Core
// macht keinerlei Netzzugriff (Codex-Finding 3, strukturell statt per Flag gelöst).

import Defuddle from 'defuddle'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'
import { safeFetch } from './egress'
import {
  type WebFetchRecord,
  sanitizeSourceTitle,
  WEB_FETCH_MAX_BYTES,
  WEB_FETCH_TIMEOUT_MS,
  WEB_PAGE_CONTEXT_MAX_CHARS
} from '../../shared/webResearch'

export interface FetchExtractResult {
  record: WebFetchRecord
  markdown: string
  truncated: boolean
  originalChars: number
}

// Trägt bei HTTP-Fehlern die tatsächliche finale URL + Redirect-Kette, damit der Aufrufer
// (web_fetch) einen KORREKTEN Fehlversuch-Record protokollieren kann (Codex-Zusatzpunkt A) —
// nicht bloß die angeforderte URL.
export class FetchExtractError extends Error {
  finalUrl?: string
  redirectChain?: string[]
  constructor(message: string, info?: { finalUrl?: string; redirectChain?: string[] }) {
    super(message)
    this.name = 'FetchExtractError'
    this.finalUrl = info?.finalUrl
    this.redirectChain = info?.redirectChain
  }
}

// Selektiver Escape wie im Lesen-Modus: `[`, `]`, `\`, `_` bleiben UNANGETASTET
// (v0.6.40-Lehre — sonst exponentielle Wikilink-Korruption beim späteren Roundtrip).
// Statt eine eigene, fehleranfällige Escape-Kette zu bauen (Codex-Finding: divergierte bei
// nummerierten Listen und bereits escapten Sternchen), nutzen wir turndowns getesteten
// Default-Escape und ent-escapen NUR die vier Wikilink-kritischen Zeichen wieder.
const DEFAULT_TURNDOWN_ESCAPE = TurndownService.prototype.escape

export function buildTurndown(): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  td.escape = (text: string): string =>
    // `\\`→`\`, `\[`→`[`, `\]`→`]`, `\_`→`_` zurücknehmen; `\*` `\#` `` \` `` etc. bleiben escaped.
    DEFAULT_TURNDOWN_ESCAPE(text).replace(/\\([\\[\]_])/g, '$1')
  // Skripte/Styles/Kommentare hart entfernen (defuddle lässt sie meist schon weg).
  td.remove(['script', 'style', 'noscript', 'iframe'])
  return td
}

function truncate(markdown: string): { text: string; truncated: boolean; originalChars: number } {
  const originalChars = markdown.length
  if (originalChars <= WEB_PAGE_CONTEXT_MAX_CHARS) return { text: markdown, truncated: false, originalChars }
  return {
    text: markdown.slice(0, WEB_PAGE_CONTEXT_MAX_CHARS) + `\n\n[gekürzt — Original ${originalChars} Zeichen]`,
    truncated: true,
    originalChars
  }
}

/**
 * Ruft `url` sicher ab und liefert extrahiertes Markdown + Provenienz-Record. Wirft bei
 * Fetch-/SSRF-Fehler; der Aufrufer (web_fetch-Tool) fängt das und protokolliert einen
 * fehlgeschlagenen Record.
 */
export async function fetchAndExtract(url: string, opts?: { signal?: AbortSignal }): Promise<FetchExtractResult> {
  const res = await safeFetch(url, {
    signal: opts?.signal,
    timeoutMs: WEB_FETCH_TIMEOUT_MS,
    maxBytes: WEB_FETCH_MAX_BYTES,
    followRedirects: true,
    acceptContentTypes: ['text/html', 'application/xhtml+xml', 'text/plain']
  })
  // HTTP-Fehler NICHT als erfolgreiche Quelle speichern (Codex-Finding): eine 404-/500-Seite
  // ist kein Inhalt. Nur 2xx wird extrahiert — die echte finale URL + Kette reisen im Fehler mit.
  if (res.status < 200 || res.status >= 300) {
    throw new FetchExtractError(`Seite antwortete mit HTTP ${res.status}: ${res.finalUrl}`, { finalUrl: res.finalUrl, redirectChain: res.redirectChain })
  }

  const fetchedAt = new Date().toISOString()
  const isPlain = res.contentType.includes('text/plain')

  let title = ''
  let markdown: string

  if (isPlain) {
    markdown = res.body.toString('utf8')
  } else {
    const html = res.body.toString('utf8')
    const { document } = parseHTML(html)
    // defuddle braucht eine gültige `url` (sonst wirft die Extractor-Auswahl intern).
    const parsed = new Defuddle(document, { url: res.finalUrl }).parse()
    // Titel als untrusted behandeln — auf eine Zeile reduzieren, Steuerzeichen entfernen.
    title = sanitizeSourceTitle(parsed.title || '')
    markdown = buildTurndown().turndown(parsed.content || '')
  }

  const trimmed = truncate(markdown.trim())
  const record: WebFetchRecord = {
    requestedUrl: url,
    finalUrl: res.finalUrl,
    redirectChain: res.redirectChain,
    title,
    fetchedAt,
    status: 'ok'
  }
  return { record, markdown: trimmed.text, truncated: trimmed.truncated || res.truncated, originalChars: trimmed.originalChars }
}
