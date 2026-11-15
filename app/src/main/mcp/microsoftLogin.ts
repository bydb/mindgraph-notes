// Microsoft-Anmeldung für MCP-Server (Abschnitt 5, E14′ in docs/codex-collab/mcp-anbindung.md).
//
// Bewusst EIGENE Instanz neben der Mail-Anmeldung (main/email/microsoftAuth.ts, Codex F09 der
// Planrunde): eigene Ablage je Server unter userData/mcp-auth/<serverId>.enc, eigenes Abmelden,
// kein gemeinsamer Markenspeicher. „Mail-Anmeldungen zurücksetzen“ berührt Business Central nicht,
// und eine ERP-Anmeldung verlangt keine Mail-Zustimmung. Gemeinsam genutzt werden nur reine
// Bausteine (Typen, Fehlereinordnung, mitgelieferte Anwendungs-ID).
//
// Marken verlassen den Main nie. Nichts geschieht beim Import (MSAL per import() beim ersten Aufruf).
//
// NICHT GEMESSEN: Ob der MCP-Endpunkt von Business Central genau die Marke für
// `https://api.businesscentral.dynamics.com/Financials.ReadWrite.All` annimmt, ist nur aus der
// Dokumentation abgeleitet (delegiert, „Dynamics 365 Business Central“). Am Testzugang prüfen.
import * as path from 'path'
import * as fs from 'fs/promises'
import { randomBytes } from 'crypto'
import {
  DEFAULT_MICROSOFT_CLIENT_ID, MicrosoftAuthError, classifyMicrosoftError, LOGIN_TIMEOUT_MS,
  type MsalModule, type MsalClient, type MsalCacheContext, type MsalAccount
} from '../email/microsoftAuth'
import { isValidServerId } from '../../shared/mcp'

/** Delegierte Berechtigung laut Microsoft-Dokumentation (vorläufig, siehe oben). */
export const BC_SCOPES = ['https://api.businesscentral.dynamics.com/Financials.ReadWrite.All']
const AUTHORITY_ORIGIN = 'https://login.microsoftonline.com'
const DEFAULT_TENANT = 'organizations'
export const MCP_AUTH_DIR = 'mcp-auth'

export interface McpMicrosoftAccount {
  tenantId: string
  objectId: string
  username: string
}

interface StoredLogin {
  clientId: string
  tenant: string
  homeAccountId: string
  account: McpMicrosoftAccount
  cache: string
}

export interface McpMicrosoftDeps {
  getUserDataDir: () => string
  isEncryptionAvailable: () => boolean
  encrypt: (plain: string) => Buffer
  decrypt: (data: Buffer) => string
  openExternal: (url: string) => Promise<void>
  loadMsal?: () => Promise<MsalModule>
  loginTimeoutMs?: number
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const page = (title: string, text: string): string =>
  `<!doctype html><meta charset="utf-8"><title>MindGraph Notes</title><body style="font:16px system-ui;margin:48px;color:#222"><h2>${title}</h2><p>${text}</p></body>`

/** Anwendungs-ID und Mandant prüfen; Standard = mitgelieferte Registrierung, nur Organisationskonten. */
export function resolveLoginConfig(input?: { clientId?: string; tenant?: string }): { clientId: string; tenant: string } {
  const clientId = (input?.clientId || DEFAULT_MICROSOFT_CLIENT_ID).trim()
  const tenant = (input?.tenant || DEFAULT_TENANT).trim()
  if (!GUID.test(clientId)) throw new MicrosoftAuthError('invalid-config')
  if (!(GUID.test(tenant) || /^[a-z0-9.-]{3,253}$/i.test(tenant))) throw new MicrosoftAuthError('invalid-config')
  if (tenant.toLowerCase() === 'consumers' || tenant.toLowerCase() === 'common') throw new MicrosoftAuthError('invalid-config')
  return { clientId, tenant }
}

/** Die Anmeldeseite muss zu Microsoft gehören und auf die lokale Schleife zurückführen. */
export function assertLoginUrl(url: string, clientId: string, tenant: string): void {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new MicrosoftAuthError('failed', 'Unerwartete Anmeldeadresse.') }
  let redirectOk = false
  try {
    const r = new URL(parsed.searchParams.get('redirect_uri') || '')
    redirectOk = r.protocol === 'http:' && (r.hostname === 'localhost' || r.hostname === '127.0.0.1')
  } catch { /* bleibt false */ }
  const ok = parsed.origin === AUTHORITY_ORIGIN
    && parsed.pathname.toLowerCase() === `/${tenant.toLowerCase()}/oauth2/v2.0/authorize`
    && (parsed.searchParams.get('client_id') || '').toLowerCase() === clientId.toLowerCase()
    && redirectOk
  if (!ok) throw new MicrosoftAuthError('failed', 'Unerwartete Anmeldeadresse.')
}

export function createMcpMicrosoftLogin(deps: McpMicrosoftDeps) {
  const fileFor = (serverId: string) => {
    if (!isValidServerId(serverId)) throw new MicrosoftAuthError('unknown-account')
    return path.join(deps.getUserDataDir(), MCP_AUTH_DIR, `${serverId}.enc`)
  }
  const requireEncryption = () => { if (!deps.isEncryptionAvailable()) throw new MicrosoftAuthError('encryption-unavailable') }
  let queue: Promise<unknown> = Promise.resolve()
  const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn)
    queue = next.catch(() => undefined)
    return next
  }

  async function read(serverId: string): Promise<StoredLogin | null> {
    let raw: Buffer
    try { raw = await fs.readFile(fileFor(serverId)) } catch { return null }
    requireEncryption()
    try {
      const parsed = JSON.parse(deps.decrypt(raw)) as StoredLogin
      return parsed && parsed.account && parsed.homeAccountId ? parsed : null
    } catch {
      throw new MicrosoftAuthError('storage-unreadable')
    }
  }
  async function write(serverId: string, data: StoredLogin): Promise<void> {
    requireEncryption()
    const file = fileFor(serverId)
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
    await fs.writeFile(tmp, deps.encrypt(JSON.stringify(data)), { mode: 0o600 })
    await fs.rename(tmp, file)
  }

  /** Ein MSAL-Client je Anmeldung, Cache nur im Speicher dieses Aufrufs + in der Datei des Servers. */
  async function makeClient(clientId: string, tenant: string, initialCache: string | null, onCache: (c: string) => void): Promise<MsalClient> {
    const msal = await (deps.loadMsal ? deps.loadMsal() : (import('@azure/msal-node') as unknown as Promise<MsalModule>))
    let cache = initialCache
    return new msal.PublicClientApplication({
      auth: { clientId, authority: `${AUTHORITY_ORIGIN}/${tenant}` },
      cache: {
        cachePlugin: {
          beforeCacheAccess: async (ctx: MsalCacheContext) => { if (cache) ctx.tokenCache.deserialize(cache) },
          afterCacheAccess: async (ctx: MsalCacheContext) => {
            if (!ctx.cacheHasChanged) return
            cache = ctx.tokenCache.serialize()
            onCache(cache)
          }
        }
      },
      system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => undefined } }
    })
  }

  let activeLogin: { cancel: () => void } | null = null

  return {
    /**
     * Anmeldung im Systembrowser für GENAU diesen Server. Ersetzt eine frühere Anmeldung des
     * Servers. Liefert das Konto (Mandant, Objekt-ID, Name) — es wird Teil der Bindung (E16′).
     */
    async login(serverId: string, input?: { clientId?: string; tenant?: string }): Promise<McpMicrosoftAccount> {
      requireEncryption()
      fileFor(serverId)
      const { clientId, tenant } = resolveLoginConfig(input)
      let latestCache: string | null = null
      const client = await makeClient(clientId, tenant, null, c => { latestCache = c })
      activeLogin?.cancel()
      let giveUp: (code: 'cancelled' | 'timeout') => void = () => undefined
      const aborted = new Promise<never>((_r, reject) => { giveUp = code => reject(new MicrosoftAuthError(code)) })
      const attempt = { cancel: () => giveUp('cancelled') }
      activeLogin = attempt
      const timer = setTimeout(() => giveUp('timeout'), deps.loginTimeoutMs ?? LOGIN_TIMEOUT_MS)
      let result
      try {
        result = await Promise.race([client.acquireTokenInteractive({
          scopes: BC_SCOPES,
          prompt: 'select_account',
          successTemplate: page('Anmeldung abgeschlossen', 'Sie können dieses Fenster schließen und zu MindGraph Notes zurückkehren.'),
          errorTemplate: page('Anmeldung nicht abgeschlossen', 'Bitte kehren Sie zu MindGraph Notes zurück. Dort steht, was fehlt.'),
          openBrowser: async (url: string) => { assertLoginUrl(url, clientId, tenant); await deps.openExternal(url) }
        }), aborted])
      } catch (e) {
        throw e instanceof MicrosoftAuthError ? e : new MicrosoftAuthError(classifyMicrosoftError(e))
      } finally {
        clearTimeout(timer)
        if (activeLogin === attempt) activeLogin = null
      }
      const acc: MsalAccount | null = result.account
      const oid = result.idTokenClaims?.oid || acc?.idTokenClaims?.oid
      const tid = result.idTokenClaims?.tid || acc?.idTokenClaims?.tid || acc?.tenantId
      if (!acc || !oid || !tid || !result.accessToken) throw new MicrosoftAuthError('failed')
      const account: McpMicrosoftAccount = { tenantId: tid.toLowerCase(), objectId: oid.toLowerCase(), username: acc.username }
      await serialized(() => write(serverId, { clientId, tenant, homeAccountId: acc.homeAccountId, account, cache: latestCache ?? '' }))
      return account
    },
    cancelLogin(): void { activeLogin?.cancel() },
    /** Nur für Code im Main. Wirft `reauth-required`, wenn keine (gültige) Anmeldung da ist. */
    async getToken(serverId: string, expected?: McpMicrosoftAccount): Promise<string> {
      const stored = await read(serverId)
      if (!stored) throw new MicrosoftAuthError('reauth-required')
      // Die Freigaben des Servers hängen am Konto (E16′) — eine fremde Anmeldung gibt keine Marke.
      if (expected && (expected.tenantId !== stored.account.tenantId || expected.objectId !== stored.account.objectId)) {
        throw new MicrosoftAuthError('account-mismatch', 'Die gespeicherte Anmeldung gehört zu einem anderen Konto als dem dieses Servers.')
      }
      let changed: string | null = null
      const client = await makeClient(stored.clientId, stored.tenant, stored.cache || null, c => { changed = c })
      const accounts = await client.getTokenCache().getAllAccounts()
      const account = accounts.find(a => a.homeAccountId === stored.homeAccountId)
      if (!account) throw new MicrosoftAuthError('reauth-required')
      let token: string
      try {
        const res = await client.acquireTokenSilent({ account, scopes: BC_SCOPES })
        if (!res?.accessToken) throw new MicrosoftAuthError('reauth-required')
        token = res.accessToken
      } catch (e) {
        throw e instanceof MicrosoftAuthError ? e : new MicrosoftAuthError(classifyMicrosoftError(e))
      }
      if (changed !== null) {
        const latest: string = changed
        await serialized(async () => {
          const now = await read(serverId)
          // Zwischendurch abgemeldet oder neu angemeldet → den alten Cache nicht zurückschreiben.
          if (now && now.homeAccountId === stored.homeAccountId) await write(serverId, { ...now, cache: latest })
        })
      }
      return token
    },
    async status(serverId: string): Promise<{ signedIn: boolean; username?: string; error?: string }> {
      try {
        const stored = await read(serverId)
        return stored ? { signedIn: true, username: stored.account.username } : { signedIn: false }
      } catch (e) {
        return { signedIn: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
    logout(serverId: string): Promise<void> {
      return serialized(async () => { await fs.rm(fileFor(serverId), { force: true }) })
    }
  }
}

export type McpMicrosoftLogin = ReturnType<typeof createMcpMicrosoftLogin>
