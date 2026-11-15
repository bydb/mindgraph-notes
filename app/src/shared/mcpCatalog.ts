// Katalog bekannter Dienste für externe Werkzeuge (MCP) — Abschnitt 6, Fassung 2 (E24′, E32′) in
// docs/codex-collab/mcp-anbindung.md. Fest in der App, nie nachgeladen (N6).
//
// Der Renderer zeigt die Liste und schickt nur die Katalog-ID; Adresse, Anmeldeweg und Name baut
// der MAIN aus diesem Eintrag (Codex F22). Die Endpunkte sind am 15.11.2026 gemessen (Messung 6.0b):
// alle auf dem Origin der MCP-Adresse, DCR mit Rückruf auf 127.0.0.1 angenommen, PKCE S256.
// Die Metadaten des Servers werden beim Verbinden nur VERGLICHEN, nicht übernommen.
import type { McpOAuthEndpoints } from './mcpOAuth'

export type McpCatalogId = 'plaud' | 'notion' | 'linear' | 'atlassian' | 'business-central'

export interface McpCatalogEntry {
  id: McpCatalogId
  name: string
  /** Ein Satz, wofür man den Dienst im Agenten nutzt. */
  summary: { de: string; en: string }
  /** Kachelfarbe (keine Markenlogos, nur Anfangsbuchstabe auf Farbe). */
  color: string
  /** 'oauth' = über diesen Katalog verbinden; 'business-central' = bestehendes Formular. */
  kind: 'oauth' | 'business-central'
  url?: string
  oauth?: { endpoints: McpOAuthEndpoints; scopes: string[] }
  /** Werkzeuge, die die Oberfläche als „empfohlen“ markiert — freigegeben wird trotzdem einzeln. */
  suggestedTools: string[]
  /**
   * Kann der Dienst Personendaten liefern? → Dialog bei Cloud-Läufen (E31′). Im Zweifel ja (Codex F32):
   * jedes Konto mit Vorgängen, Seiten oder Mitschnitten enthält Namen. Business Central läuft über das
   * bestehende Formular und trägt das Merkmal dort nicht.
   */
  personalData: boolean
  /** Was der Dienst über den Datenweg sagt — nur was der Anbieter selbst angibt. */
  dataNote: { de: string; en: string }
  /** Hosts und Paketnamen, an denen eine fremde Konfiguration diesen Dienst erkennen lässt (E32′). */
  match: { hosts: string[]; packages: string[] }
}

export const MCP_CATALOG: readonly McpCatalogEntry[] = [
  {
    id: 'plaud',
    name: 'Plaud',
    summary: { de: 'Aufnahmen, Abschriften und Zusammenfassungen Ihres Plaud-Diktiergeräts.', en: 'Recordings, transcripts and summaries from your Plaud recorder.' },
    color: '#2b2b2b',
    kind: 'oauth',
    url: 'https://mcp.plaud.ai/mcp',
    oauth: {
      endpoints: { issuer: 'https://mcp.plaud.ai/', authorizationEndpoint: 'https://mcp.plaud.ai/authorize', tokenEndpoint: 'https://mcp.plaud.ai/token', registrationEndpoint: 'https://mcp.plaud.ai/register' },
      scopes: []
    },
    suggestedTools: ['list_files', 'get_file', 'get_note', 'get_transcript'],
    personalData: true,
    dataNote: { de: 'Gesprächsmitschnitte sind Personendaten. Plaud gibt an, dass sein Server in den USA steht.', en: 'Recorded conversations are personal data. Plaud states that its server is hosted in the US.' },
    match: { hosts: ['mcp.plaud.ai'], packages: ['@plaud-ai/mcp'] }
  },
  {
    id: 'notion',
    name: 'Notion',
    summary: { de: 'Seiten und Datenbanken aus Ihrem Notion-Arbeitsbereich suchen und lesen.', en: 'Search and read pages and databases in your Notion workspace.' },
    color: '#37352f',
    kind: 'oauth',
    url: 'https://mcp.notion.com/mcp',
    oauth: {
      endpoints: { issuer: 'https://mcp.notion.com', authorizationEndpoint: 'https://mcp.notion.com/authorize', tokenEndpoint: 'https://mcp.notion.com/token', registrationEndpoint: 'https://mcp.notion.com/register' },
      scopes: []
    },
    // Gemessen 15.11.2026: 77 Werkzeuge; diese drei lesen laut Notion nur und brauchen zusammen ~4 100 Token.
    suggestedTools: ['notion-search', 'notion-fetch', 'notion-list-recent-pages'],
    personalData: true,
    dataNote: { de: 'Der Agent sieht, was Ihr Notion-Konto sehen darf — oft auch Personendaten.', en: 'The agent sees what your Notion account can see.' },
    match: { hosts: ['mcp.notion.com'], packages: ['@notionhq/notion-mcp-server'] }
  },
  {
    id: 'linear',
    name: 'Linear',
    summary: { de: 'Vorgänge und Projekte aus Linear abfragen.', en: 'Query issues and projects in Linear.' },
    color: '#5e6ad2',
    kind: 'oauth',
    url: 'https://mcp.linear.app/mcp',
    oauth: {
      endpoints: { issuer: 'https://mcp.linear.app', authorizationEndpoint: 'https://mcp.linear.app/authorize', tokenEndpoint: 'https://mcp.linear.app/token', registrationEndpoint: 'https://mcp.linear.app/register' },
      scopes: []
    },
    suggestedTools: [],
    personalData: true,
    dataNote: { de: 'Der Agent sieht, was Ihr Linear-Konto sehen darf — oft auch Personendaten.', en: 'The agent sees what your Linear account can see.' },
    match: { hosts: ['mcp.linear.app'], packages: [] }
  },
  {
    id: 'atlassian',
    name: 'Atlassian (Jira, Confluence)',
    summary: { de: 'Jira-Vorgänge und Confluence-Seiten suchen und lesen.', en: 'Search and read Jira issues and Confluence pages.' },
    color: '#0052cc',
    kind: 'oauth',
    url: 'https://mcp.atlassian.com/v1/mcp',
    oauth: {
      endpoints: { issuer: 'https://mcp.atlassian.com', authorizationEndpoint: 'https://mcp.atlassian.com/v1/authorize', tokenEndpoint: 'https://mcp.atlassian.com/v1/token', registrationEndpoint: 'https://mcp.atlassian.com/v1/register' },
      scopes: []
    },
    suggestedTools: [],
    personalData: true,
    dataNote: { de: 'Der Agent sieht, was Ihr Atlassian-Konto sehen darf — oft auch Personendaten.', en: 'The agent sees what your Atlassian account can see.' },
    match: { hosts: ['mcp.atlassian.com'], packages: [] }
  },
  {
    id: 'business-central',
    name: 'Business Central',
    // Nie gegen ein echtes Business Central gelaufen (kein Testzugang) — das steht sichtbar dabei.
    summary: { de: 'ERP-Daten lesend abfragen (Microsoft-Anmeldung, nur freigegebene Listen). Vorschau: noch nicht an einem echten System getestet.', en: 'Read ERP data (Microsoft sign-in, approved lists only). Preview: not yet tested against a real system.' },
    color: '#3f6f6a',
    kind: 'business-central',
    url: 'https://mcp.businesscentral.dynamics.com',
    suggestedTools: [],
    personalData: false,
    dataNote: { de: 'Ob nur gelesen wird, legt die Konfiguration in Business Central fest.', en: 'Whether it only reads is decided by the configuration in Business Central.' },
    match: { hosts: ['mcp.businesscentral.dynamics.com'], packages: [] }
  }
]

export function catalogEntry(id: unknown): McpCatalogEntry | undefined {
  return typeof id === 'string' ? MCP_CATALOG.find(e => e.id === id) : undefined
}

// ── Übernahme aus anderen Programmen (E32′, Codex F30) ────────────────────────────────────────

export interface McpImportResult {
  /** Erkannte Katalog-IDs, ohne Doppelte. Nur diese werden angeboten — Werte kommen aus der Vorlage. */
  found: McpCatalogId[]
  /** Namen der Einträge, die zu keinem Katalog-Dienst passen. Werden nicht übernommen. */
  unmatched: string[]
}

function stringsOf(entry: unknown): string[] {
  if (!entry || typeof entry !== 'object') return []
  const e = entry as Record<string, unknown>
  const out: string[] = []
  for (const k of ['command', 'url', 'serverUrl']) if (typeof e[k] === 'string') out.push(e[k] as string)
  if (Array.isArray(e.args)) for (const a of e.args) if (typeof a === 'string') out.push(a)
  return out.slice(0, 64)
}

function packageName(s: string): string {
  // „@plaud-ai/mcp@latest“ → „@plaud-ai/mcp“, „pkg@1.2“ → „pkg“
  const at = s.startsWith('@') ? s.indexOf('@', 1) : s.indexOf('@')
  return (at > 0 ? s.slice(0, at) : s).toLowerCase()
}

/** Welcher Katalog-Dienst steckt hinter einem Eintrag? Nur Host- und Paketvergleich, keine Heuristik. */
export function matchCatalogEntry(entry: unknown): McpCatalogId | null {
  for (const s of stringsOf(entry)) {
    let host: string | null = null
    try { const u = new URL(s); if (u.protocol === 'https:') host = u.hostname.toLowerCase() } catch { host = null }
    const pkg = packageName(s)
    const hit = MCP_CATALOG.find(c => (host && c.match.hosts.includes(host)) || c.match.packages.includes(pkg))
    if (hit) return hit.id
  }
  return null
}

/**
 * Konfiguration von Claude Desktop (`mcpServers`), Cursor (`mcpServers`) oder VS Code (`servers`)
 * auswerten. Liefert nur Katalog-IDs — Befehle, Adressen und Geheimnisse der Datei werden nie übernommen.
 */
export function parseForeignMcpConfig(text: string): McpImportResult {
  let json: unknown
  try { json = JSON.parse(text) } catch { throw new Error('Die Datei ist kein gültiges JSON.') }
  const root = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const servers = (root.mcpServers ?? root.servers ?? (root.mcp as Record<string, unknown> | undefined)?.servers) as Record<string, unknown> | undefined
  if (!servers || typeof servers !== 'object') throw new Error('In der Datei stehen keine MCP-Server (erwartet: „mcpServers“ oder „servers“).')
  const found = new Set<McpCatalogId>()
  const unmatched: string[] = []
  for (const [name, entry] of Object.entries(servers).slice(0, 200)) {
    const id = matchCatalogEntry(entry)
    if (id) found.add(id)
    else unmatched.push(name.slice(0, 60))
  }
  return { found: [...found], unmatched }
}
