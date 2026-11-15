// OAuth-Anmeldung für MCP-Server über das Netz — reine Logik (Abschnitt 6, Fassung 2, E25′/E26′
// in docs/codex-collab/mcp-anbindung.md). Netz, Browser und Ablage liegen in main/mcp/oauthLogin.ts.
//
// Kernregel „gleiches Origin“ (E26′, Codex F20/F21): Issuer, Anmeldeseite, Markenausgabe und
// Registrierung müssen auf GENAU dem Origin der MCP-Adresse liegen. Damit gehen Code, Marke und
// Client-Daten nur an das Ziel, das der Nutzer im Dialog bestätigt hat — ein Server kann nicht
// über seine Metadaten auf eine fremde Anmeldeseite verweisen.

export interface McpOAuthEndpoints {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint: string
}

/** Was ein HTTP-Server-Eintrag über seine Anmeldung weiß (Teil der Bindung). */
export interface McpOAuthSpec {
  endpoints: McpOAuthEndpoints
  /** RFC 8707: die MCP-Adresse, für die eine Marke gilt. */
  resource: string
  scopes: string[]
  /**
   * Kennung der letzten interaktiven Anmeldung. Ein generisches OAuth liefert kein Konto-Merkmal;
   * deshalb setzt jede neue Anmeldung die Werkzeugfreigaben zurück (Bindung, Fassung 2).
   */
  loginId?: string
}

export class McpOAuthError extends Error {
  constructor(public code: 'other-origin' | 'unsupported' | 'bad-metadata' | 'bad-url' | 'state' | 'denied' | 'token' | 'reauth-required', message: string) {
    super(message)
  }
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1'])

function parseHttps(raw: unknown, what: string): URL {
  if (typeof raw !== 'string' || !raw) throw new McpOAuthError('bad-metadata', `${what} fehlt in den Anmeldedaten des Dienstes.`)
  let u: URL
  try { u = new URL(raw) } catch { throw new McpOAuthError('bad-metadata', `${what} ist keine gültige Adresse.`) }
  if (u.protocol !== 'https:') throw new McpOAuthError('bad-metadata', `${what} muss https sein.`)
  if (u.username || u.password) throw new McpOAuthError('bad-metadata', `${what} enthält Zugangsdaten.`)
  return u
}

/** Origin der MCP-Adresse — nur https. */
export function mcpOrigin(mcpUrl: string): string {
  return parseHttps(mcpUrl, 'Die Adresse des Servers').origin
}

/**
 * Anmeldeserver-Metadaten (RFC 8414) prüfen und auf die Regel „gleiches Origin“ festlegen.
 * Wirft mit Klartext, wenn ein Endpunkt woanders liegt, keine Registrierung angeboten wird
 * oder PKCE S256 fehlt.
 */
export function endpointsFromMetadata(mcpUrl: string, meta: Record<string, unknown>): McpOAuthEndpoints {
  const origin = mcpOrigin(mcpUrl)
  const issuer = parseHttps(meta.issuer, 'Der Aussteller (issuer)')
  const auth = parseHttps(meta.authorization_endpoint, 'Die Anmeldeseite')
  const token = parseHttps(meta.token_endpoint, 'Die Markenausgabe')
  if (meta.registration_endpoint == null) {
    throw new McpOAuthError('unsupported', 'Dieser Dienst bietet keine automatische Registrierung an (braucht eine vorher eingerichtete App mit Geheimnis) — das unterstützt MindGraph nicht.')
  }
  const reg = parseHttps(meta.registration_endpoint, 'Die Registrierung')
  const other = [issuer, auth, token, reg].find(u => u.origin !== origin)
  if (other) {
    throw new McpOAuthError('other-origin', `Dieser Dienst meldet über eine andere Adresse an (${other.origin} statt ${origin}). Das unterstützt MindGraph nicht: Anmeldedaten gehen nur an die Adresse des Servers, die Sie bestätigt haben.`)
  }
  const methods = meta.code_challenge_methods_supported
  if (!Array.isArray(methods) || !methods.includes('S256')) {
    throw new McpOAuthError('unsupported', 'Dieser Dienst unterstützt kein PKCE (S256) — ohne diesen Schutz meldet MindGraph nicht an.')
  }
  const authMethods = meta.token_endpoint_auth_methods_supported
  if (Array.isArray(authMethods) && !authMethods.includes('none')) {
    throw new McpOAuthError('unsupported', 'Dieser Dienst verlangt ein Client-Geheimnis — für ein Programm auf Ihrem Rechner ist das nicht vorgesehen.')
  }
  return {
    issuer: meta.issuer as string,
    authorizationEndpoint: auth.toString(),
    tokenEndpoint: token.toString(),
    registrationEndpoint: reg.toString()
  }
}

/** Gleiche Endpunkte? (Katalog-Vorlage gegen gelesene Metadaten.) */
export function sameEndpoints(a: McpOAuthEndpoints, b: McpOAuthEndpoints): boolean {
  const norm = (s: string) => s.replace(/\/+$/, '')
  return norm(a.issuer) === norm(b.issuer) && a.authorizationEndpoint === b.authorizationEndpoint
    && a.tokenEndpoint === b.tokenEndpoint && a.registrationEndpoint === b.registrationEndpoint
}

/** Prüft eine gespeicherte Spezifikation erneut (z.B. nach dem Laden): alles auf dem MCP-Origin. */
export function assertOAuthSpec(mcpUrl: string, spec: McpOAuthSpec): void {
  const origin = mcpOrigin(mcpUrl)
  for (const [what, raw] of Object.entries({ issuer: spec.endpoints.issuer, authorization: spec.endpoints.authorizationEndpoint, token: spec.endpoints.tokenEndpoint, registration: spec.endpoints.registrationEndpoint })) {
    if (parseHttps(raw, what).origin !== origin) throw new McpOAuthError('other-origin', `Anmeldung: ${what} liegt nicht auf ${origin}.`)
  }
  if (spec.resource !== new URL(mcpUrl).toString()) throw new McpOAuthError('bad-metadata', 'Anmeldung: resource passt nicht zur Adresse des Servers.')
  if (!Array.isArray(spec.scopes) || spec.scopes.some(s => typeof s !== 'string' || !/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(s))) {
    throw new McpOAuthError('bad-metadata', 'Anmeldung: unzulässige Berechtigungen (scope).')
  }
}

/** Kandidaten für die Schutz-Metadaten (RFC 9728) einer MCP-Adresse, in dieser Reihenfolge. */
export function protectedResourceMetadataUrls(mcpUrl: string): string[] {
  const u = new URL(mcpUrl)
  const p = u.pathname.replace(/\/+$/, '')
  const out = p && p !== '/' ? [`${u.origin}/.well-known/oauth-protected-resource${p}`] : []
  out.push(`${u.origin}/.well-known/oauth-protected-resource`)
  return out
}

/** Kandidaten für die Anmeldeserver-Metadaten (RFC 8414) eines Issuers. */
export function authorizationServerMetadataUrls(issuer: string): string[] {
  const u = new URL(issuer)
  const p = u.pathname.replace(/\/+$/, '')
  return p && p !== '/'
    ? [`${u.origin}/.well-known/oauth-authorization-server${p}`, `${u.origin}${p}/.well-known/oauth-authorization-server`]
    : [`${u.origin}/.well-known/oauth-authorization-server`]
}

/** Rückruf-Adresse der lokalen Schleife. */
export function loopbackRedirectUri(port: number): string {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new McpOAuthError('bad-url', 'Ungültiger Rückruf-Port.')
  return `http://127.0.0.1:${port}/callback`
}

export function buildAuthorizeUrl(endpoints: McpOAuthEndpoints, p: { clientId: string; redirectUri: string; state: string; codeChallenge: string; resource: string; scopes: string[] }): string {
  const u = new URL(endpoints.authorizationEndpoint)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', p.clientId)
  u.searchParams.set('redirect_uri', p.redirectUri)
  u.searchParams.set('state', p.state)
  u.searchParams.set('code_challenge', p.codeChallenge)
  u.searchParams.set('code_challenge_method', 'S256')
  u.searchParams.set('resource', p.resource)
  if (p.scopes.length) u.searchParams.set('scope', p.scopes.join(' '))
  return u.toString()
}

/**
 * Letzte Prüfung vor `shell.openExternal` (wie `assertLoginUrl` der Microsoft-Anmeldung): genau
 * die gebundene Anmeldeseite, genau dieser Client, Rückruf nur auf 127.0.0.1, PKCE S256.
 */
export function assertAuthorizeUrl(url: string, endpoints: McpOAuthEndpoints, clientId: string, redirectUri: string): void {
  let u: URL
  try { u = new URL(url) } catch { throw new McpOAuthError('bad-url', 'Unerwartete Anmeldeadresse.') }
  const expected = new URL(endpoints.authorizationEndpoint)
  let r: URL | null = null
  try { r = new URL(u.searchParams.get('redirect_uri') || '') } catch { r = null }
  const ok = u.protocol === 'https:' && u.origin === expected.origin && u.pathname === expected.pathname
    && !u.username && !u.password
    && u.searchParams.get('client_id') === clientId
    && u.searchParams.get('redirect_uri') === redirectUri
    && !!r && r.protocol === 'http:' && LOOPBACK_HOSTS.has(r.hostname)
    && u.searchParams.get('code_challenge_method') === 'S256'
    && u.searchParams.get('response_type') === 'code'
  if (!ok) throw new McpOAuthError('bad-url', 'Unerwartete Anmeldeadresse — die Anmeldung wurde nicht geöffnet.')
}

/** Rückruf auswerten: Fehler des Dienstes, falscher `state` oder fehlender Code → Fehler. */
export function parseCallback(requestUrl: string, expectedState: string): string {
  const u = new URL(requestUrl, 'http://127.0.0.1')
  if (u.pathname !== '/callback') throw new McpOAuthError('bad-url', 'Unbekannter Rückruf.')
  if (u.searchParams.get('state') !== expectedState) throw new McpOAuthError('state', 'Die Antwort gehört nicht zu dieser Anmeldung.')
  const err = u.searchParams.get('error')
  if (err) throw new McpOAuthError('denied', err === 'access_denied' ? 'Die Anmeldung wurde abgelehnt.' : `Der Dienst meldet: ${err.slice(0, 80)}`)
  const code = u.searchParams.get('code')
  if (!code) throw new McpOAuthError('denied', 'Der Dienst hat keinen Anmeldecode geschickt.')
  return code
}

export interface McpOAuthTokens {
  accessToken: string
  refreshToken?: string
  /** ms seit Epoche; fehlt, wenn der Dienst nichts angibt. */
  expiresAt?: number
}

/** Antwort der Markenausgabe. `previousRefresh` bleibt, wenn der Dienst keinen neuen schickt. */
export function parseTokenResponse(json: unknown, now: number, previousRefresh?: string): McpOAuthTokens {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  if (typeof j.error === 'string') {
    throw new McpOAuthError(j.error === 'invalid_grant' ? 'reauth-required' : 'token', j.error === 'invalid_grant' ? 'Die Anmeldung ist abgelaufen — bitte neu anmelden.' : `Markenausgabe meldet: ${j.error.slice(0, 80)}`)
  }
  if (typeof j.access_token !== 'string' || !j.access_token) throw new McpOAuthError('token', 'Die Markenausgabe hat keine Marke geliefert.')
  const type = typeof j.token_type === 'string' ? j.token_type.toLowerCase() : 'bearer'
  if (type !== 'bearer') throw new McpOAuthError('token', `Unbekannter Markentyp „${String(j.token_type).slice(0, 20)}“.`)
  const exp = typeof j.expires_in === 'number' ? j.expires_in : typeof j.expires_in === 'string' ? Number(j.expires_in) : NaN
  return {
    accessToken: j.access_token,
    ...(typeof j.refresh_token === 'string' && j.refresh_token ? { refreshToken: j.refresh_token } : previousRefresh ? { refreshToken: previousRefresh } : {}),
    ...(Number.isFinite(exp) && exp > 0 ? { expiresAt: now + exp * 1000 } : {})
  }
}

/** Marke noch mindestens `marginMs` gültig? Ohne Ablaufangabe: ja (der Server sagt es per 401). */
export function tokenFresh(t: McpOAuthTokens, now: number, marginMs = 60_000): boolean {
  return t.expiresAt === undefined || t.expiresAt - marginMs > now
}
