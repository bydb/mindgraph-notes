// OAuth-Anmeldung für MCP-Server über das Netz (Abschnitt 6, Fassung 2, E25′/E26′ in
// docs/codex-collab/mcp-anbindung.md). Reine Regeln in shared/mcpOAuth.ts.
//
// - Eigener Ablauf statt `authProvider` des SDK: dessen Erkennung folgt jedem Metadaten-Verweis,
//   hier gilt „gleiches Origin“ (Codex F20/F21) — Code, Marke und Registrierung gehen nur an das
//   Origin der MCP-Adresse, über den MCP-Netzweg (keine Weiterleitungen, DNS-Pinning, Byte-Grenze).
// - Öffentlicher Client mit PKCE S256, DCR bei jeder interaktiven Anmeldung (Rückruf-Port wechselt).
// - Ablage verschlüsselt unter userData/mcp-auth/<serverId>.oauth.enc, nie im Vault/Sync.
// - Marken verlassen den Main nie. Nichts geschieht beim Import.
import * as path from 'path'
import * as fs from 'fs/promises'
import * as http from 'node:http'
import { createHash, randomBytes } from 'crypto'
import { isValidServerId } from '../../shared/mcp'
import {
  type McpOAuthEndpoints, type McpOAuthSpec, type McpOAuthTokens, McpOAuthError,
  assertOAuthSpec, assertAuthorizeUrl, buildAuthorizeUrl, endpointsFromMetadata, loopbackRedirectUri,
  parseCallback, parseTokenResponse, protectedResourceMetadataUrls, authorizationServerMetadataUrls, tokenFresh, mcpOrigin
} from '../../shared/mcpOAuth'
import { createMcpFetch, type McpFetch } from './httpFetch'
import { MCP_AUTH_DIR } from './microsoftLogin'

const LOGIN_TIMEOUT_MS = 5 * 60_000
const METADATA_MAX_BYTES = 256 * 1024
const CLIENT_NAME = 'MindGraph Notes'

interface StoredOAuth {
  /** Woran diese Marke gebunden ist — muss zum Server-Eintrag passen, sonst keine Marke. */
  issuer: string
  tokenEndpoint: string
  resource: string
  loginId: string
  clientId: string
  tokens: McpOAuthTokens
  createdAt: number
}

/** Ergebnis einer Anmeldung, das erst mit `commit` gilt (Codex F34). */
export interface PendingOAuthLogin {
  loginId: string
  data: Omit<StoredOAuth, 'loginId'>
  /** Stand des Abbruchzählers bei Rückgabe — ein späteres „Abbrechen“ gilt auch hier (Codex F42). */
  cancelSeq: number
}

export interface McpOAuthDeps {
  getUserDataDir: () => string
  isEncryptionAvailable: () => boolean
  encrypt: (plain: string) => Buffer
  decrypt: (data: Buffer) => string
  openExternal: (url: string) => Promise<void>
  /** Für Tests austauschbar; Standard = MCP-Netzweg ohne Weiterleitungen. */
  fetch?: McpFetch
  loginTimeoutMs?: number
  now?: () => number
}

const page = (title: string, text: string): string =>
  `<!doctype html><meta charset="utf-8"><title>MindGraph Notes</title><body style="font:16px system-ui;margin:48px;color:#222"><h2>${title}</h2><p>${text}</p></body>`

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function readJson(res: Response, what: string): Promise<unknown> {
  const text = await res.text()
  if (text.length > METADATA_MAX_BYTES) throw new McpOAuthError('bad-metadata', `${what}: Antwort zu groß.`)
  try { return JSON.parse(text) } catch { throw new McpOAuthError('bad-metadata', `${what}: keine gültige Antwort (HTTP ${res.status}).`) }
}

/**
 * Anmeldeweg eines Servers ermitteln (nur für freie Einträge; Katalog-Einträge vergleichen nur).
 * Erst Schutz-Metadaten (RFC 9728), sonst Anmeldeserver-Metadaten am Origin selbst (Atlassian).
 * Jeder Abruf geht ausschließlich an das MCP-Origin.
 */
export async function discoverOAuth(mcpUrl: string, fetchFn: McpFetch): Promise<{ endpoints: McpOAuthEndpoints; scopes: string[] }> {
  // OAuth nur über https (mcpOrigin wirft sonst) — keine Anmeldung an Adressen im eigenen Netz per http.
  const origin = mcpOrigin(mcpUrl)
  const get = async (u: string) => {
    if (new URL(u).origin !== origin) throw new McpOAuthError('other-origin', 'Anmeldedaten liegen nicht auf der Adresse des Servers.')
    const res = await fetchFn(u, { method: 'GET', headers: { Accept: 'application/json' } })
    if (res.status === 404) { await res.text().catch(() => ''); return null }
    if (!res.ok) { await res.text().catch(() => ''); return null }
    return readJson(res, 'Anmeldedaten') as Promise<Record<string, unknown>>
  }
  let issuer = origin
  // Keine Berechtigungen anfordern: der Dienst gibt seine Standardrechte (gemessen: Notion, Linear,
  // Plaud, Atlassian). Eine Auswahl aus `scopes_supported` (Linear: read, write) wäre geraten.
  const scopes: string[] = []
  for (const u of protectedResourceMetadataUrls(mcpUrl)) {
    const prm = await get(u).catch(e => { if (e instanceof McpOAuthError && e.code === 'other-origin') throw e; return null })
    if (!prm) continue
    const servers = Array.isArray(prm.authorization_servers) ? prm.authorization_servers.filter((x): x is string => typeof x === 'string') : []
    if (servers.length === 0) break
    // Nur ein Anmeldeserver auf demselben Origin wird angenommen (E26′).
    const same = servers.find(s => { try { return new URL(s).origin === origin } catch { return false } })
    if (!same) throw new McpOAuthError('other-origin', `Dieser Dienst meldet über eine andere Adresse an (${servers[0]}). Das unterstützt MindGraph nicht: Anmeldedaten gehen nur an die Adresse des Servers, die Sie bestätigt haben.`)
    issuer = same
    break
  }
  for (const u of authorizationServerMetadataUrls(issuer)) {
    const meta = await get(u).catch(e => { if (e instanceof McpOAuthError && e.code === 'other-origin') throw e; return null })
    if (meta) return { endpoints: endpointsFromMetadata(mcpUrl, meta), scopes }
  }
  throw new McpOAuthError('unsupported', 'Dieser Server bietet keine Anmeldung nach dem MCP-Standard an. Falls er einen Schlüssel braucht, tragen Sie ihn als geheime Kopfzeile ein.')
}

export function createMcpOAuthLogin(deps: McpOAuthDeps) {
  const now = () => (deps.now ? deps.now() : Date.now())
  const fileFor = (serverId: string) => {
    if (!isValidServerId(serverId)) throw new McpOAuthError('reauth-required', 'Unbekannter Server.')
    return path.join(deps.getUserDataDir(), MCP_AUTH_DIR, `${serverId}.oauth.enc`)
  }
  const requireEncryption = () => {
    if (!deps.isEncryptionAvailable()) throw new McpOAuthError('token', 'Verschlüsselter Speicher ist nicht verfügbar — die Anmeldung kann nicht sicher abgelegt werden.')
  }
  let queue: Promise<unknown> = Promise.resolve()
  const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn)
    queue = next.catch(() => undefined)
    return next
  }
  // OAuth nur über https: kein freigegebenes privates Origin, keine Weiterleitungen (httpFetch).
  const fetchFor = (): McpFetch => deps.fetch ?? createMcpFetch()

  async function read(serverId: string): Promise<StoredOAuth | null> {
    let raw: Buffer
    try { raw = await fs.readFile(fileFor(serverId)) } catch { return null }
    requireEncryption()
    try {
      const parsed = JSON.parse(deps.decrypt(raw)) as StoredOAuth
      return parsed && parsed.tokens?.accessToken && parsed.loginId ? parsed : null
    } catch {
      return null
    }
  }
  async function write(serverId: string, data: StoredOAuth): Promise<void> {
    requireEncryption()
    const file = fileFor(serverId)
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
    await fs.writeFile(tmp, deps.encrypt(JSON.stringify(data)), { mode: 0o600 })
    await fs.rename(tmp, file)
  }

  async function postForm(url: string, body: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
    const res = await fetchFor()(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(body).toString()
    })
    return readJson(res, 'Markenausgabe')
  }

  /** Lokale Schleife auf 127.0.0.1 mit freiem Port; liefert Port + Warten auf den Code. */
  function startLoopback(expectedState: () => string): Promise<{ port: number; code: Promise<string>; close: () => void }> {
    return new Promise((resolve, reject) => {
      let settle: { ok: (c: string) => void; fail: (e: Error) => void } | null = null
      const code = new Promise<string>((ok, fail) => { settle = { ok, fail } })
      code.catch(() => undefined)
      const server = http.createServer((req, res) => {
        try {
          const c = parseCallback(req.url || '', expectedState())
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(page('Anmeldung abgeschlossen', 'Sie können dieses Fenster schließen und zu MindGraph Notes zurückkehren.'))
          settle?.ok(c)
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e))
          // Fremde Pfade (favicon …) und Rückrufe mit falschem state beenden die Anmeldung NICHT
          // (Codex F36): sonst könnte jeder Prozess, der den Port erreicht, sie abbrechen. Nur ein
          // Rückruf mit dem richtigen state schließt ab — mit Code oder mit Fehler des Dienstes.
          if (e instanceof McpOAuthError && e.code === 'bad-url') { res.writeHead(404); res.end(); return }
          if (e instanceof McpOAuthError && e.code === 'state') { res.writeHead(400); res.end(); return }
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(page('Anmeldung nicht abgeschlossen', 'Bitte kehren Sie zu MindGraph Notes zurück. Dort steht, was fehlt.'))
          settle?.fail(err)
        }
      })
      server.on('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (!addr || typeof addr === 'string') { server.close(); reject(new Error('Kein Rückruf-Port.')); return }
        resolve({ port: addr.port, code, close: () => { server.close(); server.closeAllConnections?.() } })
      })
    })
  }

  let activeLogin: { cancel: () => void } | null = null
  // Zählt jedes „Abbrechen“, auch wenn gerade kein Browser-Schritt läuft: Zwischen `login` und
  // `commit` gibt es keinen aktiven Versuch mehr, ein Abbruch muss trotzdem greifen.
  let cancelSeq = 0

  return {
    /**
     * Interaktive Anmeldung für GENAU diesen Server. Liefert die neue Anmeldekennung — sie geht in
     * die Bindung ein (neue Anmeldung = Werkzeuge neu freigeben).
     */
    async login(serverId: string, mcpUrl: string, spec: McpOAuthSpec): Promise<PendingOAuthLogin> {
      requireEncryption()
      fileFor(serverId)
      assertOAuthSpec(mcpUrl, spec)
      activeLogin?.cancel()
      let state = ''
      const loop = await startLoopback(() => state)
      // EIN Abbruchsignal für den ganzen Versuch (Codex F35): Registrierung, Browser, Rückruf und
      // Markentausch. Nach jedem Warten wird geprüft — ein bestätigtes „Abbrechen“ öffnet keinen
      // Browser mehr und speichert keine Marke.
      const ctl = new AbortController()
      const aborted = new Promise<never>((_r, reject) => { ctl.signal.addEventListener('abort', () => reject(ctl.signal.reason), { once: true }) })
      aborted.catch(() => undefined)
      const attempt = { cancel: () => ctl.abort(new McpOAuthError('denied', 'Anmeldung abgebrochen.')) }
      activeLogin = attempt
      const timer = setTimeout(() => ctl.abort(new McpOAuthError('denied', 'Zeitüberschreitung: Die Anmeldung wurde nicht abgeschlossen.')), deps.loginTimeoutMs ?? LOGIN_TIMEOUT_MS)
      const check = () => { if (ctl.signal.aborted) throw ctl.signal.reason }
      try {
        const redirectUri = loopbackRedirectUri(loop.port)
        // 1. Registrieren (DCR) — am gebundenen Endpunkt, öffentlicher Client.
        const reg = await Promise.race([postJson(spec.endpoints.registrationEndpoint, {
          client_name: CLIENT_NAME,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none'
        }, ctl.signal), aborted]) as Record<string, unknown>
        check()
        const clientId = typeof reg.client_id === 'string' ? reg.client_id : ''
        if (!clientId || clientId.length > 2048) throw new McpOAuthError('token', 'Der Dienst hat die Registrierung nicht bestätigt.')
        // 2. Browser öffnen — Adresse vorher gegen die Bindung prüfen.
        state = b64url(randomBytes(24))
        const verifier = b64url(randomBytes(48))
        const challenge = b64url(createHash('sha256').update(verifier).digest())
        const url = buildAuthorizeUrl(spec.endpoints, { clientId, redirectUri, state, codeChallenge: challenge, resource: spec.resource, scopes: spec.scopes })
        assertAuthorizeUrl(url, spec.endpoints, clientId, redirectUri)
        check()
        await deps.openExternal(url)
        const code = await Promise.race([loop.code, aborted])
        check()
        // 3. Code gegen Marke tauschen.
        const json = await Promise.race([postForm(spec.endpoints.tokenEndpoint, {
          grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource: spec.resource
        }, ctl.signal), aborted])
        check()
        const tokens = parseTokenResponse(json, now())
        // NICHT hier speichern (Codex F34): erst wenn der Server-Eintrag die neue Kennung trägt.
        // Scheitert das, bleibt die alte Anmeldung unberührt.
        return {
          loginId: b64url(randomBytes(12)),
          data: { issuer: spec.endpoints.issuer, tokenEndpoint: spec.endpoints.tokenEndpoint, resource: spec.resource, clientId, tokens, createdAt: now() },
          cancelSeq
        }
      } finally {
        clearTimeout(timer)
        loop.close()
        if (activeLogin === attempt) activeLogin = null
      }
    },
    /** Neue Anmeldung aktivieren — NACH dem erfolgreichen Umschalten des Server-Eintrags. */
    commit(serverId: string, pending: PendingOAuthLogin): Promise<void> {
      return serialized(async () => {
        if (pending.cancelSeq !== cancelSeq) throw new McpOAuthError('denied', 'Anmeldung abgebrochen.')
        const file = fileFor(serverId)
        const previous = await fs.readFile(file).catch(() => null)
        await write(serverId, { ...pending.data, loginId: pending.loginId })
        // Abbruch WÄHREND des Schreibens (Codex F43): alte Datei unverändert zurück, dann ablehnen —
        // der Aufrufer setzt daraufhin auch den alten Eintrag zurück (F41).
        if (pending.cancelSeq !== cancelSeq) {
          if (previous) {
            const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
            await fs.writeFile(tmp, previous, { mode: 0o600 })
            await fs.rename(tmp, file)
          } else {
            await fs.rm(file, { force: true })
          }
          throw new McpOAuthError('denied', 'Anmeldung abgebrochen.')
        }
      })
    },
    cancelLogin(): void { cancelSeq++; activeLogin?.cancel() },
    /** Wurde nach der Rückgabe von `login` abgebrochen? Dann nicht speichern. */
    cancelledSince(pending: PendingOAuthLogin): boolean { return pending.cancelSeq !== cancelSeq },
    /** Nur für Code im Main. Erneuert bei Bedarf; wirft `reauth-required`, wenn das nicht geht. */
    async getToken(serverId: string, mcpUrl: string, spec: McpOAuthSpec): Promise<string> {
      assertOAuthSpec(mcpUrl, spec)
      const stored = await read(serverId)
      if (!stored) throw new McpOAuthError('reauth-required', 'Bitte zuerst anmelden.')
      // Eine Marke gilt nur für die Bindung, unter der sie entstand (Aussteller, Ziel, Anmeldung).
      if (stored.issuer !== spec.endpoints.issuer || stored.tokenEndpoint !== spec.endpoints.tokenEndpoint || stored.resource !== spec.resource || stored.loginId !== spec.loginId) {
        throw new McpOAuthError('reauth-required', 'Die gespeicherte Anmeldung gehört zu anderen Einstellungen dieses Servers — bitte neu anmelden.')
      }
      if (tokenFresh(stored.tokens, now())) return stored.tokens.accessToken
      if (!stored.tokens.refreshToken) throw new McpOAuthError('reauth-required', 'Die Anmeldung ist abgelaufen — bitte neu anmelden.')
      let tokens: McpOAuthTokens
      try {
        const json = await postForm(spec.endpoints.tokenEndpoint, {
          grant_type: 'refresh_token', refresh_token: stored.tokens.refreshToken, client_id: stored.clientId, resource: spec.resource
        })
        tokens = parseTokenResponse(json, now(), stored.tokens.refreshToken)
      } catch (e) {
        // Ein abgelehntes Erneuern heißt praktisch immer: neu anmelden. Netzfehler bleiben Netzfehler.
        if (e instanceof McpOAuthError) throw new McpOAuthError('reauth-required', 'Die Anmeldung ist abgelaufen — bitte neu anmelden.')
        throw e
      }
      // Zwischendurch abgemeldet oder neu angemeldet → nichts zurückschreiben UND keine Marke
      // herausgeben (Codex F38): die Anmeldung, zu der sie gehört, gibt es nicht mehr.
      return serialized(async () => {
        const cur = await read(serverId)
        if (!cur || cur.loginId !== stored.loginId) throw new McpOAuthError('reauth-required', 'Die Anmeldung wurde inzwischen geändert — bitte neu verbinden.')
        await write(serverId, { ...cur, tokens })
        return tokens.accessToken
      })
    },
    async status(serverId: string, spec?: McpOAuthSpec): Promise<{ signedIn: boolean; since?: number }> {
      try {
        const s = await read(serverId)
        return s && (!spec || s.loginId === spec.loginId) ? { signedIn: true, since: s.createdAt } : { signedIn: false }
      } catch {
        return { signedIn: false }
      }
    },
    logout(serverId: string): Promise<void> {
      return serialized(async () => { await fs.rm(fileFor(serverId), { force: true }) })
    }
  }

  async function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const res = await fetchFor()(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    })
    const json = await readJson(res, 'Registrierung')
    if (!res.ok) {
      const err = (json as { error_description?: unknown; error?: unknown }) ?? {}
      throw new McpOAuthError('token', `Registrierung abgelehnt (HTTP ${res.status}${typeof err.error === 'string' ? `: ${err.error.slice(0, 60)}` : ''}).`)
    }
    return json
  }
}

export type McpOAuthLogin = ReturnType<typeof createMcpOAuthLogin>
