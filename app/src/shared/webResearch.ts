// Webrecherche (Opt-in) — geteiltes, pures Fundament. Prozessübergreifend genutzt:
// Renderer (Settings-Metadaten, Modul-Gate) UND Main (Provider-Clients, Egress-Zaun,
// Tool-Guards). KEINE Node-/Renderer-Importe hier — nur pure Logik + Fixtures-testbar.
//
// Sicherheitsmodell (siehe docs/web-research-plan.md, „Phase 0 — Sicherheitsvertrag"):
// - Egress-Zustandsmaschine search → fetch → write (einseitig): die Such-Phase endet
//   mit dem ersten web_fetch, damit voller Seiteninhalt keine Suchanfragen mehr steuert.
// - SSRF-Zaun: isPrivateIp erlaubt AUSSCHLIESSLICH global routbare Adressen und sperrt
//   jeden IANA-Sonderbereich (Allowlist-Logik, fail-closed). Die DNS-Auflösung + das
//   IP-Pinning lebt im Main (egress.ts) — hier die pure Range-Prüfung, die dort und für
//   Literal-Hosts aufgerufen wird.
// - web_fetch nur auf URLs, die der Main in eine Allowlist eingetragen hat (Suchtreffer
//   dieses Laufs + aus dem Auftrag extrahierte Nutzer-URLs); das Modell füllt die Liste nie.
//
// Siehe Memory: project-web-research-optin, feedback-no-cloud-blocks-user-decides.

// ── Provider ────────────────────────────────────────────────────────────────

export type WebSearchProviderId = 'tavily' | 'searxng' | 'linkup'

// Reihenfolge = Anzeige/Empfehlung: Tavily zuerst (empfohlen, kostenloser Key, zuverlässig).
export const WEB_SEARCH_PROVIDER_IDS: WebSearchProviderId[] = ['tavily', 'searxng', 'linkup']

// Provider, die einen API-Key brauchen (Key liegt Main-seitig verschlüsselt, pro Provider).
export const KEY_PROVIDERS: WebSearchProviderId[] = ['tavily', 'linkup']

export const WEB_SEARCH_PROVIDER_META: Record<WebSearchProviderId, {
  label: string
  keysUrl: string
  needsApiKey: boolean
  needsBaseUrl: boolean
  privacyNote: { de: string; en: string }
}> = {
  tavily: {
    label: 'Tavily',
    keysUrl: 'https://app.tavily.com/home',
    needsApiKey: true,
    needsBaseUrl: false,
    privacyNote: {
      de: 'Empfohlen: kostenloser Anbieter mit schneller Anmeldung (~1.000 Suchen/Monat gratis, keine Kreditkarte). US-Firma — Suchanfragen verlassen deinen Rechner und die EU. Die Seiten-Extraktion bleibt lokal.',
      en: 'Recommended: free provider with quick signup (~1,000 searches/month free, no credit card). US company — search queries leave your computer and the EU. Page extraction stays local.'
    }
  },
  searxng: {
    label: 'SearXNG',
    keysUrl: 'https://docs.searxng.org/',
    needsApiKey: false,
    needsBaseUrl: true,
    privacyNote: {
      de: 'Suchanfragen gehen an deine eigene SearXNG-Instanz (und von dort an deren Upstream-Suchmaschinen). Die Seiten-Extraktion bleibt lokal auf deinem Rechner.',
      en: 'Search queries go to your own SearXNG instance (and from there to its upstream engines). Page extraction stays local on your computer.'
    }
  },
  linkup: {
    label: 'Linkup',
    keysUrl: 'https://app.linkup.so',
    needsApiKey: true,
    needsBaseUrl: false,
    privacyNote: {
      de: 'EU-Anbieter (Paris, Zero Data Retention laut Anbieter, AVV) — Suchanfragen verlassen deinen Rechner. Die Seiten-Extraktion bleibt lokal.',
      en: 'EU provider (Paris, zero data retention per provider, DPA) — search queries leave your computer. Page extraction stays local.'
    }
  }
}

// ── Zustandsmaschine (0a) ────────────────────────────────────────────────────

// Ein Web-Lauf durchläuft die Phasen einseitig. Der erste erfolgreiche web_fetch
// schaltet von 'search' auf 'fetch'; ab dann ist keine Suche mehr erlaubt.
export type WebResearchPhase = 'search' | 'fetch' | 'write'

export function isSearchAllowedInPhase(phase: WebResearchPhase): boolean {
  return phase === 'search'
}

// ── Budgets & Limits ─────────────────────────────────────────────────────────

export const WEB_QUERY_MAX_CHARS = 250          // in Unicode-Codepoints gemessen
export const MAX_WEB_SEARCHES_PER_RUN = 8
export const MAX_WEB_FETCHES_PER_RUN = 10
export const MAX_HITS_PER_SEARCH = 8
export const MAX_USER_URLS = 5
export const MAX_URL_CHARS = 2048
export const WEB_FETCH_MAX_BYTES = 1_500_000        // dekomprimiert
export const WEB_SEARCH_RESPONSE_MAX_BYTES = 500_000
export const WEB_FETCH_TIMEOUT_MS = 20_000
export const WEB_PAGE_CONTEXT_MAX_CHARS = 8_000
export const WEB_TITLE_MAX_CHARS = 300
export const WEB_SNIPPET_MAX_CHARS = 500
export const MAX_REDIRECT_HOPS = 5

// ── Datentypen ───────────────────────────────────────────────────────────────

export interface WebSearchHit {
  title: string
  url: string
  snippet: string
}

// Provenienz eines Abrufs — landet strukturiert auf der Ergebnis-Karte und speist
// den deterministisch vom Main erzeugten Quellenblock (0e).
export interface WebFetchRecord {
  requestedUrl: string
  finalUrl: string
  redirectChain: string[]
  title: string
  fetchedAt: string        // ISO-Zeitstempel
  status: 'ok' | 'failed'
}

// Provider-Konfiguration (Main-seitig gespeichert, 0d) — der Renderer liefert sie NIE
// pro Lauf mit; die Run-Params enthalten nur `{ enabled: true }`.
export interface WebResearchConfig {
  provider: WebSearchProviderId
  searxngUrl: string       // nur für provider === 'searxng' relevant
  // Exaktes Origin (scheme+host+port), das der Nutzer per Main-Dialog für privaten Zugriff
  // freigegeben hat (nur gesetzt, wenn searxngUrl privat/intern auflöst). Ohne dies erreicht
  // die Suche keine private Adresse.
  approvedPrivateOrigin?: string
}

// ── URL-Normalisierung & SSRF-Range-Prüfung ─────────────────────────────────

/**
 * Kanonische Form einer Web-URL für den Allowlist-Vergleich, oder null wenn die URL
 * für die Webrecherche unzulässig ist. Regeln:
 *  - nur http/https
 *  - keine eingebetteten Credentials (`user:pass@…`) — klassischer SSRF-Trick
 *  - Fragment wird verworfen, Query bleibt erhalten
 *  - Host lowercase (macht `new URL` bereits), Trailing-Slash auf Wurzelpfad normalisiert
 * Node's URL-Konstruktor normalisiert numerische/obskure Host-Schreibweisen (dezimal/
 * hex/oktal-v4, IDN→punycode) bereits selbst — hier bleibt die Semantik-Prüfung.
 */
export function normalizeWebUrl(input: string): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > MAX_URL_CHARS) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  url.hash = ''
  // Leeren Wurzelpfad auf '/' vereinheitlichen, damit `…/foo` und `…/foo/` NICHT
  // kollidieren, aber `https://host` und `https://host/` schon.
  if (url.pathname === '') url.pathname = '/'
  return url.toString()
}

/** Host aus einer URL für die Literal-Host-Prüfung (ohne v6-Klammern), oder null. */
export function hostnameFromUrl(input: string): string | null {
  try {
    const host = new URL(input).hostname.toLowerCase()
    return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  } catch {
    return null
  }
}

/** IPv4-„a.b.c.d" → [a,b,c,d] mit strikter 0–255-Prüfung, sonst null. */
function parseIpv4(ip: string): number[] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    octets.push(n)
  }
  return octets
}

/** IPv6-Literal → 16 Bytes (behandelt `::`-Kompression + eingebettete v4), sonst null. */
function parseIpv6(ip: string): Uint8Array | null {
  let s = ip.trim()
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1)
  const zone = s.indexOf('%')            // Zone-ID (fe80::1%eth0) abschneiden
  if (zone >= 0) s = s.slice(0, zone)
  if (!s.includes(':')) return null

  // Eingebettete IPv4 im letzten Segment (z.B. ::ffff:127.0.0.1) → in zwei Hextets wandeln.
  const lastColon = s.lastIndexOf(':')
  const tail = s.slice(lastColon + 1)
  if (tail.includes('.')) {
    const v4 = parseIpv4(tail)
    if (!v4) return null
    const hex = ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16)
    s = s.slice(0, lastColon + 1) + hex
  }

  const halves = s.split('::')
  if (halves.length > 2) return null
  const toGroups = (part: string): number[] | null => {
    if (part === '') return []
    const groups: number[] = []
    for (const g of part.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
      groups.push(parseInt(g, 16))
    }
    return groups
  }
  const head = toGroups(halves[0])
  const rest = halves.length === 2 ? toGroups(halves[1]) : []
  if (head === null || rest === null) return null

  let groups: number[]
  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length
    if (fill < 1) return null            // `::` steht für ≥1 Null-Gruppe
    groups = [...head, ...new Array(fill).fill(0), ...rest]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null

  const bytes = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    bytes[i * 2] = (groups[i] >> 8) & 0xff
    bytes[i * 2 + 1] = groups[i] & 0xff
  }
  return bytes
}

/**
 * Ist eine IPv4 NICHT global routbar? Allowlist-Denkweise: alles, was nicht öffentlich
 * ist, wird gesperrt. Deckt den IANA Special-Purpose Registry ab (RFC1918, Loopback,
 * Link-local, CGNAT, Doku-/Benchmark-Netze, 6to4-Anycast, Multicast, reserviert/Broadcast).
 */
function isPrivateIpv4(a: number, b: number, c: number, _d: number): boolean {
  if (a === 0) return true                          // 0.0.0.0/8 „dieses Netz"
  if (a === 10) return true                          // RFC1918
  if (a === 127) return true                         // Loopback
  if (a === 169 && b === 254) return true             // Link-local
  if (a === 172 && b >= 16 && b <= 31) return true    // RFC1918
  if (a === 192 && b === 168) return true             // RFC1918
  if (a === 192 && b === 0 && c === 0) return true    // 192.0.0.0/24 IETF-Protokoll
  if (a === 192 && b === 0 && c === 2) return true    // 192.0.2.0/24 TEST-NET-1 (Doku)
  if (a === 192 && b === 88 && c === 99) return true  // 192.88.99.0/24 6to4-Relay-Anycast (deprecated)
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 Benchmark
  if (a === 198 && b === 51 && c === 100) return true // 198.51.100.0/24 TEST-NET-2 (Doku)
  if (a === 203 && b === 0 && c === 113) return true  // 203.0.113.0/24 TEST-NET-3 (Doku)
  if (a === 100 && b >= 64 && b <= 127) return true   // 100.64.0.0/10 CGNAT
  if (a >= 224) return true                           // Multicast (224/4) + reserviert/Broadcast (240/4)
  return false
}

/**
 * Ist `ip` (numerisches v4- oder v6-Literal) KEINE global routbare Adresse und damit für
 * Webrecherche-Fetches gesperrt? Die zentrale SSRF-Range-Prüfung. Nicht-parsebare Eingaben
 * gelten fail-closed als privat (true) — der Aufrufer soll nur echte IPs übergeben.
 */
export function isPrivateIp(ip: string): boolean {
  if (typeof ip !== 'string' || !ip.trim()) return true
  const v4 = parseIpv4(ip.trim())
  if (v4) return isPrivateIpv4(v4[0], v4[1], v4[2], v4[3])

  const bytes = parseIpv6(ip)
  if (!bytes) return true                          // weder v4 noch v6 → fail-closed

  const allZeroHead = bytes.slice(0, 10).every(x => x === 0)
  // IPv4-mapped ::ffff:a.b.c.d → eingebettete v4 prüfen
  if (allZeroHead && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPrivateIpv4(bytes[12], bytes[13], bytes[14], bytes[15])
  }
  // NAT64 64:ff9b::/96 → eingebettete v4 prüfen
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b &&
      bytes.slice(4, 12).every(x => x === 0)) {
    return isPrivateIpv4(bytes[12], bytes[13], bytes[14], bytes[15])
  }
  // Allowlist: einzig 2000::/3 ist global routbares Unicast. Alles andere (::/96 inkl.
  // Loopback/unspezifiziert/IPv4-compatible, fc00::/7, fe80::/10, fec0::/10, ff00::/8, …)
  // wird gesperrt. Innerhalb 2000::/3 noch die Nicht-Global-Ausnahmen ausschneiden.
  if (bytes[0] >= 0x20 && bytes[0] <= 0x3f) {
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true // 2001:db8::/32 Doku
    if (bytes[0] === 0x20 && bytes[1] === 0x02) return true // 2002::/16 6to4 (v4-eingebettet, umgehbar)
    return false
  }
  return true
}

/**
 * Pure Literal-Host-Vorprüfung (die echte DNS-Auflösung macht der Main). true, wenn der
 * Host ein privates IP-Literal ist ODER ein offensichtlich interner Name. Ein normaler
 * DNS-Name gibt hier false zurück und wird im Main nach der Auflösung gegen isPrivateIp
 * geprüft.
 */
export function isForbiddenHostname(hostname: string): boolean {
  if (typeof hostname !== 'string' || !hostname) return true
  let h = hostname.toLowerCase().trim()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  h = h.replace(/\.+$/, '')               // FQDN-Wurzelpunkt(e) — `localhost.` == `localhost`
  if (!h) return true
  if (h === 'localhost') return true
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) return true
  // Literal-IP? (v6 hat ':', v4 nur Ziffern+Punkte)
  if (h.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return isPrivateIp(h)
  return false
}

// ── Nutzer-URLs aus dem Auftrag extrahieren (0f) ────────────────────────────

function countChar(s: string, ch: string): number {
  let n = 0
  for (const c of s) if (c === ch) n++
  return n
}

/** Satzzeichen und unbalancierte schließende Klammer am URL-Ende abschneiden. */
function trimUrlTail(url: string): string {
  let s = url
  for (;;) {
    const before = s
    s = s.replace(/[.,;:!?]+$/, '')
    if (s.endsWith(')') && countChar(s, ')') > countChar(s, '(')) s = s.slice(0, -1)
    if (s === before) return s
  }
}

/**
 * Zieht http(s)-URLs aus dem Auftragstext. Der Main ruft das (nicht der Renderer),
 * damit ein kompromittierter Renderer keine zusätzlichen „Nutzer-URLs" behaupten kann.
 * Behält balancierte Klammern (Wikipedia-URLs), normalisiert, verwirft private/interne
 * Literal-Hosts, dedupliziert, deckelt auf MAX_USER_URLS.
 */
export function extractUrlsFromInstruction(text: string): string[] {
  if (typeof text !== 'string' || !text) return []
  const matches = text.match(/https?:\/\/[^\s<>"'`\]}]+/gi) || []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of matches) {
    const normalized = normalizeWebUrl(trimUrlTail(raw))
    if (!normalized) continue
    const host = hostnameFromUrl(normalized)
    if (!host || isForbiddenHostname(host)) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
    if (out.length >= MAX_USER_URLS) break
  }
  return out
}

// ── Query-Behandlung ─────────────────────────────────────────────────────────

/** Query fürs Absenden vorbereiten: nur trimmen — NICHT kürzen (siehe isQueryTooLong). */
export function normalizeQuery(query: string): string {
  return query.trim()
}

/**
 * Ist die Query zu lang? Zählt Unicode-Codepoints (nicht UTF-16-Einheiten), damit die
 * Grenze konsistent ist und kein Emoji zerschnitten wird. Der Tool-Guard lehnt zu lange
 * Queries mit verständlicher Meldung AB — es wird nie still gekürzt (0a/Plan).
 */
export function isQueryTooLong(query: string): boolean {
  return [...query.trim()].length > WEB_QUERY_MAX_CHARS
}

// ── Provider-Response-Parser ─────────────────────────────────────────────────

function coerceString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function toHit(title: unknown, url: unknown, snippet: unknown): WebSearchHit | null {
  const normalized = normalizeWebUrl(coerceString(url))
  if (!normalized) return null
  return {
    title: coerceString(title).slice(0, WEB_TITLE_MAX_CHARS),
    url: normalized,
    snippet: coerceString(snippet).replace(/\s+/g, ' ').trim().slice(0, WEB_SNIPPET_MAX_CHARS)
  }
}

/** SearXNG `format=json`: `{ results: [{ title, url, content }] }`. */
export function parseSearxngResults(json: unknown): WebSearchHit[] {
  const results = (json as { results?: unknown })?.results
  if (!Array.isArray(results)) return []
  const hits: WebSearchHit[] = []
  for (const r of results) {
    const rec = r as Record<string, unknown>
    const hit = toHit(rec?.title, rec?.url, rec?.content)
    if (hit) hits.push(hit)
    if (hits.length >= MAX_HITS_PER_SEARCH) break
  }
  return hits
}

/** Tavily `/search`: `{ results: [{ title, url, content, score }] }`. */
export function parseTavilyResults(json: unknown): WebSearchHit[] {
  const results = (json as { results?: unknown })?.results
  if (!Array.isArray(results)) return []
  const hits: WebSearchHit[] = []
  for (const r of results) {
    const rec = r as Record<string, unknown>
    const hit = toHit(rec?.title, rec?.url, rec?.content)
    if (hit) hits.push(hit)
    if (hits.length >= MAX_HITS_PER_SEARCH) break
  }
  return hits
}

/** Linkup `outputType: searchResults`: `{ results: [{ type, name, url, content }] }`. */
export function parseLinkupResults(json: unknown): WebSearchHit[] {
  const results = (json as { results?: unknown })?.results
  if (!Array.isArray(results)) return []
  const hits: WebSearchHit[] = []
  for (const r of results) {
    const rec = r as Record<string, unknown>
    // Nur Text-Treffer: Linkup liefert auch `type: "image"` u.ä. — die sind keine Quellen.
    if (typeof rec?.type === 'string' && rec.type !== 'text') continue
    const hit = toHit(rec?.name ?? rec?.title, rec?.url, rec?.content ?? rec?.snippet)
    if (hit) hits.push(hit)
    if (hits.length >= MAX_HITS_PER_SEARCH) break
  }
  return hits
}

/**
 * Macht einen (untrusted) Seitentitel als Markdown-Link-Text sicher: auf EINE Zeile reduzieren
 * und Steuerzeichen entfernen, mit denen ein manipulierter <title> zusätzliche Quellen/Links
 * injizieren könnte (Zeilenumbruch → neuer Listeneintrag, `[ ]` → neuer Link, `< >` → Autolink,
 * Backtick → Code, `\` → Escape). Defuddle übernimmt <title> sonst unverändert inkl. Markdown.
 */
export function sanitizeSourceTitle(title: string): string {
  return String(title || '')
    .replace(/[\r\n\t]+/g, ' ')          // auf eine Zeile
    .replace(/[[\]<>`\\]/g, '')           // Markdown-/HTML-Steuerzeichen entfernen
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, WEB_TITLE_MAX_CHARS)
}

/**
 * Deterministischer Quellenblock (0e): hängt „## Quellen" mit NUR erfolgreich abgerufenen,
 * deduplizierten URLs an. Ein vom Modell selbst geschriebener „## Quellen"-Block am Ende wird
 * ersetzt — die App ist die Autorität dafür, was tatsächlich gelesen wurde. So kann das Modell
 * keine ungefetchten URLs als Quelle behaupten. Titel werden zusätzlich hier entschärft
 * (Defense-in-Depth, falls ein Record aus anderer Quelle nicht bereinigt wurde).
 */
export function mergeDeterministicSources(markdown: string, fetches: WebFetchRecord[]): string {
  const base = markdown.replace(/\n+##\s+Quellen[\s\S]*$/i, '').trimEnd()
  const seen = new Set<string>()
  const ok = fetches.filter(f => f.status === 'ok' && !seen.has(f.finalUrl) && (seen.add(f.finalUrl), true))
  if (!ok.length) return base + '\n'
  const lines = ok.map(f => {
    const text = sanitizeSourceTitle(f.title) || f.finalUrl
    return `- [${text}](${f.finalUrl}) — abgerufen am ${f.fetchedAt.slice(0, 10)}`
  })
  return `${base}\n\n## Quellen\n\n${lines.join('\n')}\n`
}

/** Ist die Provider-Konfiguration einsatzbereit? (Key-Existenz prüft der Main separat.) */
export function isWebResearchConfigComplete(config: WebResearchConfig | undefined): boolean {
  if (!config) return false
  if (config.provider === 'searxng') return normalizeWebUrl(config.searxngUrl) !== null
  // Key-Provider (tavily/linkup): config-seitig vollständig — die Key-Existenz prüft der Main.
  if (config.provider === 'tavily' || config.provider === 'linkup') return true
  return false
}
