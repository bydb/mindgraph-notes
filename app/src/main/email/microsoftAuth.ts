// Anmeldung bei Microsoft 365 für den Mailclient (Abruf über IMAP mit OAuth,
// Versand über Graph). Plan und Messungen: docs/codex-collab/microsoft-365-anbindung.md.
//
// Harte Regeln dieses Moduls:
//
// - NICHTS läuft beim Import. Die Bibliothek (MSAL) wird erst beim ersten Aufruf
//   geladen, Dateien erst dann angefasst — Importe laufen vor app.name und der
//   Instanzsperre (CLAUDE.md, Instanzsperre; Codex F21).
// - Zugangsmarken verlassen dieses Modul nur über getImapAuth()/getGraphToken()
//   an Code im Main. Es gibt keinen Weg zum Renderer (E4, Codex F10).
// - Die Kontoart ist dauerhaft an die Konto-ID gebunden (bindings). Ein
//   Microsoft-Konto ohne gültige Marke meldet "Anmeldung nötig" und fällt nie
//   auf einen Passwortweg zurück (E2, Codex F16).
// - Server, Port, TLS und Benutzername kommen für Microsoft-Konten von hier,
//   nicht vom Renderer (E13, Codex F17).
// - Ohne safeStorage keine Microsoft-Anmeldung: Marken liegen nie im Klartext.
//
// Bewusst ohne Electron-Import: alles, was Electron braucht, kommt über deps
// herein. So ist die Zustandslogik ohne laufende App testbar.

import * as path from 'path'
import * as fs from 'fs/promises'
import { createHash } from 'crypto'
import { redactForLog } from '../../shared/logRedaction'

/** Mitgelieferte App-Registrierung (öffentlicher Client, kein Geheimnis). */
export const DEFAULT_MICROSOFT_CLIENT_ID = 'd947240f-13dd-4d80-b361-fc0183daf530'
const AUTHORITY_HOST = 'https://login.microsoftonline.com'
/** Nur Organisationskonten der weltweiten Microsoft-Cloud (E12). */
const DEFAULT_TENANT = 'organizations'

/** Zwei Ressourcen, zwei Marken (gemessen 10.11.2026, Codex F25). */
export const GRAPH_SCOPES = ['User.Read', 'Mail.Send']
export const IMAP_SCOPES = ['https://outlook.office.com/IMAP.AccessAsUser.All']

/** Fester IMAP-Zugang für Microsoft-Konten — nie aus Renderer-Angaben. */
export const MICROSOFT_IMAP_ENDPOINT = { host: 'outlook.office365.com', port: 993, tls: true } as const

const BINDINGS_FILE = 'email-microsoft-accounts.enc'

export type MicrosoftAuthErrorCode =
  | 'encryption-unavailable'
  | 'admin-consent-required'
  | 'consent-declined'
  | 'cancelled'
  | 'reauth-required'
  | 'unknown-account'
  | 'invalid-config'
  | 'failed'

export class MicrosoftAuthError extends Error {
  constructor(public readonly code: MicrosoftAuthErrorCode, message: string) {
    super(message)
    this.name = 'MicrosoftAuthError'
  }
}

export interface MicrosoftAccountBinding {
  provider: 'microsoft'
  tenantId: string
  objectId: string
  /** Anmeldename (UPN) aus der Anmeldung — zugleich IMAP-Benutzer und Absender. */
  username: string
  displayName?: string
  homeAccountId: string
  clientId: string
  tenant: string
  /** 'signed-out' nach Abmelden: Bindung bleibt, damit die ID nie zum Passwortkonto wird. */
  state: 'signed-in' | 'signed-out'
}

export interface MicrosoftAccountStatus {
  known: boolean
  signedIn: boolean
  username?: string
  displayName?: string
  /** Abruf (IMAP) berechtigt? */
  fetchReady: boolean
  /** Versand (Graph) berechtigt? */
  sendReady: boolean
  errorCode?: MicrosoftAuthErrorCode
}

export interface MicrosoftAuthDeps {
  /** Wird erst beim ersten Dateizugriff aufgerufen, nie beim Anlegen. */
  getUserDataDir: () => string
  isEncryptionAvailable: () => boolean
  encrypt: (plain: string) => Buffer
  decrypt: (encrypted: Buffer) => string
  /** Öffnet die Anmeldeseite im Systembrowser. */
  openExternal: (url: string) => Promise<void>
  /** Für Tests: ersetzt das Laden von @azure/msal-node. */
  loadMsal?: () => Promise<MsalModule>
}

// Schmaler Ausschnitt der MSAL-Schnittstelle, damit Tests sie nachbauen können.
export interface MsalAccount { homeAccountId: string; tenantId: string; localAccountId: string; username: string; name?: string }
export interface MsalResult { accessToken: string; account: MsalAccount | null; expiresOn?: Date | null }
export interface MsalCacheContext { cacheHasChanged: boolean; tokenCache: { serialize(): string; deserialize(cache: string): void } }
export interface MsalClient {
  acquireTokenInteractive(request: Record<string, unknown>): Promise<MsalResult>
  acquireTokenSilent(request: Record<string, unknown>): Promise<MsalResult>
  getTokenCache(): { getAllAccounts(): Promise<MsalAccount[]>; removeAccount(account: MsalAccount): Promise<void> }
}
export interface MsalModule {
  PublicClientApplication: new (config: Record<string, unknown>) => MsalClient
}

export interface LoginOptions {
  /** Eigene App-Registrierung einer Organisation (E7). */
  clientId?: string
  /** Mandant (GUID oder Domain), wenn die eigene Registrierung nur einen Mandanten zulässt. */
  tenant?: string
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TENANT_RE = /^(organizations|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)$/i

/** Gleiche Anmeldung ergibt auf jedem Gerät dieselbe Konto-ID (E5, Codex F12). */
export function deriveMicrosoftAccountId(tenantId: string, objectId: string): string {
  const digest = createHash('sha256').update(`${tenantId.toLowerCase()}:${objectId.toLowerCase()}`).digest('hex')
  return `ms-${digest.slice(0, 24)}`
}

/** Ordnet einen MSAL-/Entra-Fehler einem festen Code zu. */
export function classifyMicrosoftError(error: unknown): MicrosoftAuthErrorCode {
  if (error instanceof MicrosoftAuthError) return error.code
  const e = error as { errorCode?: string; subError?: string; errorMessage?: string; message?: string; name?: string }
  const text = `${e?.errorCode || ''} ${e?.subError || ''} ${e?.errorMessage || ''} ${e?.message || ''}`.toLowerCase()
  // AADSTS90094 / 65001 mit Administratorhinweis: Organisation hat die App nicht freigegeben.
  if (/aadsts90094|aadsts900941|admin(istrator)?[ _-]?(consent|approval)|need admin approval/.test(text)) return 'admin-consent-required'
  if (/aadsts65004|access_denied|consent.*(declined|denied)|user.*declined/.test(text)) return 'consent-declined'
  if (/user_cancel|usercancel|cancel(l)?ed|timeout.*loopback|loopback.*timeout/.test(text)) return 'cancelled'
  if (/interaction_required|consent_required|login_required|invalid_grant|aadsts65001|aadsts50076|aadsts50079|aadsts700082|aadsts50173|no_tokens_found|no_account/.test(text) || e?.name === 'InteractionRequiredAuthError') return 'reauth-required'
  return 'failed'
}

const SUCCESS_PAGE = '<!doctype html><meta charset="utf-8"><title>MindGraph Notes</title><body style="font:16px system-ui;margin:48px;color:#222"><h2>Anmeldung abgeschlossen</h2><p>Sie können dieses Fenster schließen und zu MindGraph Notes zurückkehren.</p></body>'
const ERROR_PAGE = '<!doctype html><meta charset="utf-8"><title>MindGraph Notes</title><body style="font:16px system-ui;margin:48px;color:#222"><h2>Anmeldung nicht abgeschlossen</h2><p>Bitte kehren Sie zu MindGraph Notes zurück. Dort steht, was fehlt.</p></body>'

export interface MicrosoftAuth {
  login(options?: LoginOptions): Promise<{ accountId: string; username: string; displayName?: string; status: MicrosoftAccountStatus }>
  status(accountId: string): Promise<MicrosoftAccountStatus>
  logout(accountId: string): Promise<void>
  /** true, sobald die ID je als Microsoft-Konto gebunden wurde — auch nach dem Abmelden. */
  isMicrosoftAccount(accountId: string): Promise<boolean>
  /** Nur für Code im Main. Wirft MicrosoftAuthError('reauth-required'), nie ein Passwort-Rückfall. */
  getImapAuth(accountId: string): Promise<{ host: string; port: number; tls: boolean; user: string; accessToken: string }>
  /** Nur für Code im Main. */
  getGraphToken(accountId: string): Promise<{ accessToken: string; username: string; displayName?: string }>
}

export function createMicrosoftAuth(deps: MicrosoftAuthDeps): MicrosoftAuth {
  const clients = new Map<string, Promise<MsalClient>>()
  // Alle Schreibzugriffe auf Bindungen und Cache-Dateien nacheinander.
  let writeChain: Promise<unknown> = Promise.resolve()
  const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = writeChain.then(fn, fn)
    writeChain = next.catch(() => undefined)
    return next
  }

  const requireEncryption = (): void => {
    if (!deps.isEncryptionAvailable()) {
      throw new MicrosoftAuthError('encryption-unavailable', 'Die sichere Ablage des Systems ist nicht verfügbar. Ohne sie wird keine Microsoft-Anmeldung gespeichert.')
    }
  }

  const filePath = (name: string): string => path.join(deps.getUserDataDir(), name)

  async function readEncrypted(name: string): Promise<string | null> {
    try {
      return deps.decrypt(await fs.readFile(filePath(name)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null
      // Unlesbar (anderes Schlüsselbund, beschädigt): wie nicht vorhanden behandeln,
      // Datei aber nicht löschen — der Nutzer meldet sich neu an und überschreibt sie.
      console.warn('[MicrosoftAuth] Ablage nicht lesbar:', name.replace(/[0-9a-f]{16,}/g, '…'), redactForLog((error as Error)?.message))
      return null
    }
  }

  async function writeEncrypted(name: string, plain: string): Promise<void> {
    requireEncryption()
    const target = filePath(name)
    const tmp = `${target}.${process.pid}.tmp`
    await fs.writeFile(tmp, deps.encrypt(plain), { mode: 0o600 })
    await fs.rename(tmp, target)
  }

  async function loadBindings(): Promise<Record<string, MicrosoftAccountBinding>> {
    const raw = await readEncrypted(BINDINGS_FILE)
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw) as Record<string, MicrosoftAccountBinding>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  const saveBindings = (bindings: Record<string, MicrosoftAccountBinding>): Promise<void> =>
    writeEncrypted(BINDINGS_FILE, JSON.stringify(bindings))

  const cacheFile = (clientId: string, tenant: string): string =>
    `email-microsoft-cache-${createHash('sha256').update(`${clientId.toLowerCase()}|${tenant.toLowerCase()}`).digest('hex').slice(0, 20)}.enc`

  function resolveConfig(options?: LoginOptions): { clientId: string; tenant: string } {
    const clientId = (options?.clientId || '').trim() || DEFAULT_MICROSOFT_CLIENT_ID
    const tenant = (options?.tenant || '').trim() || DEFAULT_TENANT
    if (!GUID_RE.test(clientId)) throw new MicrosoftAuthError('invalid-config', 'Die Anwendungs-ID hat nicht die Form einer GUID.')
    if (!TENANT_RE.test(tenant)) throw new MicrosoftAuthError('invalid-config', 'Der Mandant muss eine GUID oder eine Domain sein.')
    return { clientId, tenant }
  }

  function getClient(clientId: string, tenant: string): Promise<MsalClient> {
    const key = `${clientId.toLowerCase()}|${tenant.toLowerCase()}`
    let client = clients.get(key)
    if (!client) {
      client = (async () => {
        const msal = await (deps.loadMsal ? deps.loadMsal() : (import('@azure/msal-node') as unknown as Promise<MsalModule>))
        const name = cacheFile(clientId, tenant)
        return new msal.PublicClientApplication({
          auth: { clientId, authority: `${AUTHORITY_HOST}/${tenant}` },
          cache: {
            cachePlugin: {
              beforeCacheAccess: async (ctx: MsalCacheContext) => {
                const stored = await readEncrypted(name)
                if (stored) ctx.tokenCache.deserialize(stored)
              },
              afterCacheAccess: async (ctx: MsalCacheContext) => {
                if (ctx.cacheHasChanged) await serialized(() => writeEncrypted(name, ctx.tokenCache.serialize()))
              }
            }
          },
          // Kein MSAL-eigenes Logging: dessen Meldungen können Kontonamen tragen.
          system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => undefined } }
        })
      })()
      clients.set(key, client)
      client.catch(() => clients.delete(key))
    }
    return client
  }

  async function findMsalAccount(client: MsalClient, binding: MicrosoftAccountBinding): Promise<MsalAccount | null> {
    const accounts = await client.getTokenCache().getAllAccounts()
    return accounts.find(a => a.homeAccountId === binding.homeAccountId) || null
  }

  async function silentToken(binding: MicrosoftAccountBinding, scopes: string[]): Promise<string> {
    if (binding.state !== 'signed-in') throw new MicrosoftAuthError('reauth-required', 'Für dieses Konto ist eine neue Anmeldung bei Microsoft nötig.')
    requireEncryption()
    const client = await getClient(binding.clientId, binding.tenant)
    const account = await findMsalAccount(client, binding)
    if (!account) throw new MicrosoftAuthError('reauth-required', 'Für dieses Konto ist eine neue Anmeldung bei Microsoft nötig.')
    try {
      const result = await client.acquireTokenSilent({ account, scopes })
      if (!result?.accessToken) throw new MicrosoftAuthError('reauth-required', 'Microsoft hat keine Zugangsmarke ausgegeben.')
      return result.accessToken
    } catch (error) {
      const code = classifyMicrosoftError(error)
      console.warn('[MicrosoftAuth] Stille Erneuerung fehlgeschlagen:', code, redactForLog((error as { errorCode?: string })?.errorCode || (error as Error)?.message))
      throw new MicrosoftAuthError(code === 'failed' ? 'failed' : code, messageFor(code))
    }
  }

  async function requireBinding(accountId: string): Promise<MicrosoftAccountBinding> {
    const binding = (await loadBindings())[accountId]
    if (!binding) throw new MicrosoftAuthError('unknown-account', 'Dieses Konto ist nicht als Microsoft-Konto eingerichtet.')
    return binding
  }

  async function probe(binding: MicrosoftAccountBinding, scopes: string[]): Promise<{ ok: boolean; code?: MicrosoftAuthErrorCode }> {
    try {
      await silentToken(binding, scopes)
      return { ok: true }
    } catch (error) {
      return { ok: false, code: classifyMicrosoftError(error) }
    }
  }

  async function statusOf(binding: MicrosoftAccountBinding | undefined): Promise<MicrosoftAccountStatus> {
    if (!binding) return { known: false, signedIn: false, fetchReady: false, sendReady: false }
    const base = { known: true, username: binding.username, displayName: binding.displayName }
    if (binding.state !== 'signed-in') return { ...base, signedIn: false, fetchReady: false, sendReady: false, errorCode: 'reauth-required' }
    if (!deps.isEncryptionAvailable()) return { ...base, signedIn: false, fetchReady: false, sendReady: false, errorCode: 'encryption-unavailable' }
    const [fetch, send] = [await probe(binding, IMAP_SCOPES), await probe(binding, GRAPH_SCOPES)]
    return { ...base, signedIn: fetch.ok || send.ok, fetchReady: fetch.ok, sendReady: send.ok, errorCode: fetch.code || send.code }
  }

  return {
    async login(options) {
      requireEncryption()
      const { clientId, tenant } = resolveConfig(options)
      const client = await getClient(clientId, tenant)
      let result: MsalResult
      try {
        result = await client.acquireTokenInteractive({
          scopes: GRAPH_SCOPES,
          // Zustimmung für die zweite Ressource im selben Fenster einholen.
          extraScopesToConsent: IMAP_SCOPES,
          prompt: 'select_account',
          successTemplate: SUCCESS_PAGE,
          errorTemplate: ERROR_PAGE,
          openBrowser: async (url: string) => {
            // Nur die Anmeldeseite von Microsoft — nichts, was eine Bibliothek sonst liefern könnte.
            if (!url.startsWith(`${AUTHORITY_HOST}/`)) throw new MicrosoftAuthError('failed', 'Unerwartete Anmeldeadresse.')
            await deps.openExternal(url)
          }
        })
      } catch (error) {
        const code = classifyMicrosoftError(error)
        console.warn('[MicrosoftAuth] Anmeldung nicht abgeschlossen:', code, redactForLog((error as { errorCode?: string })?.errorCode || (error as Error)?.message))
        throw new MicrosoftAuthError(code, messageFor(code))
      }
      const account = result.account
      if (!account?.tenantId || !account.localAccountId || !account.username) {
        throw new MicrosoftAuthError('failed', 'Microsoft hat kein vollständiges Konto zurückgegeben.')
      }
      const accountId = deriveMicrosoftAccountId(account.tenantId, account.localAccountId)
      const binding: MicrosoftAccountBinding = {
        provider: 'microsoft',
        tenantId: account.tenantId,
        objectId: account.localAccountId,
        username: account.username,
        displayName: account.name || undefined,
        homeAccountId: account.homeAccountId,
        clientId,
        tenant,
        state: 'signed-in'
      }
      await serialized(async () => {
        const bindings = await loadBindings()
        bindings[accountId] = binding
        await saveBindings(bindings)
      })
      return { accountId, username: binding.username, displayName: binding.displayName, status: await statusOf(binding) }
    },

    async status(accountId) {
      return statusOf((await loadBindings())[accountId])
    },

    async logout(accountId) {
      const binding = (await loadBindings())[accountId]
      if (!binding) return
      // Erst die Bindung auf "abgemeldet" setzen: selbst wenn das Entfernen der
      // Marken scheitert, gibt dieses Modul für die ID keine Marke mehr heraus.
      await serialized(async () => {
        const bindings = await loadBindings()
        if (bindings[accountId]) {
          bindings[accountId] = { ...bindings[accountId], state: 'signed-out' }
          await saveBindings(bindings)
        }
      })
      try {
        const client = await getClient(binding.clientId, binding.tenant)
        const account = await findMsalAccount(client, binding)
        if (account) await client.getTokenCache().removeAccount(account)
      } catch (error) {
        console.warn('[MicrosoftAuth] Marken beim Abmelden nicht entfernt:', redactForLog((error as Error)?.message))
        throw new MicrosoftAuthError('failed', 'Abgemeldet, aber die gespeicherte Anmeldung ließ sich nicht vollständig löschen.')
      }
    },

    async isMicrosoftAccount(accountId) {
      return !!(await loadBindings())[accountId]
    },

    async getImapAuth(accountId) {
      const binding = await requireBinding(accountId)
      const accessToken = await silentToken(binding, IMAP_SCOPES)
      return { ...MICROSOFT_IMAP_ENDPOINT, user: binding.username, accessToken }
    },

    async getGraphToken(accountId) {
      const binding = await requireBinding(accountId)
      const accessToken = await silentToken(binding, GRAPH_SCOPES)
      return { accessToken, username: binding.username, displayName: binding.displayName }
    }
  }
}

/** Meldung für die Oberfläche — ohne Kontodaten. */
export function messageFor(code: MicrosoftAuthErrorCode): string {
  switch (code) {
    case 'encryption-unavailable': return 'Die sichere Ablage des Systems ist nicht verfügbar. Ohne sie wird keine Microsoft-Anmeldung gespeichert.'
    case 'admin-consent-required': return 'Ihre Organisation hat MindGraph Notes noch nicht freigegeben. Bitte wenden Sie sich an Ihre Administration.'
    case 'consent-declined': return 'Die Zustimmung wurde nicht erteilt. Ohne sie kann MindGraph Notes das Postfach nicht nutzen.'
    case 'cancelled': return 'Die Anmeldung wurde abgebrochen.'
    case 'reauth-required': return 'Für dieses Konto ist eine neue Anmeldung bei Microsoft nötig.'
    case 'unknown-account': return 'Dieses Konto ist nicht als Microsoft-Konto eingerichtet.'
    case 'invalid-config': return 'Anwendungs-ID oder Mandant sind ungültig.'
    default: return 'Die Anmeldung bei Microsoft ist fehlgeschlagen.'
  }
}
