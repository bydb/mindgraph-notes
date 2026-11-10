// Anmeldung bei Microsoft 365 für den Mailclient (Abruf über IMAP mit OAuth,
// Versand über Graph). Plan und Messungen: docs/codex-collab/microsoft-365-anbindung.md,
// Code-Review: docs/codex-collab/microsoft-abschnitt-4a-review.md.
//
// Harte Regeln dieses Moduls:
//
// - NICHTS läuft beim Import. Die Bibliothek (MSAL) wird erst beim ersten Aufruf
//   geladen, Dateien erst dann angefasst — Importe laufen vor app.name und der
//   Instanzsperre (CLAUDE.md, Instanzsperre).
// - Zugangsmarken verlassen dieses Modul nur über getImapAuth()/getGraphToken()
//   an Code im Main. Die Ablage liegt in einem eigenen Unterordner, den der
//   Passwort-IPC (`email-<id>.enc` direkt im Profil) nicht erreichen kann.
// - Die Kontoart folgt aus der Form der Konto-ID (`ms-…`, credentialPath.ts).
//   Ein Microsoft-Konto ohne gültige Marke, mit fehlender oder unlesbarer
//   Ablage meldet einen Fehler und fällt nie auf einen Passwortweg zurück.
// - Server, Port, TLS und Benutzername kommen für Microsoft-Konten von hier,
//   nicht vom Renderer.
// - Ohne echte Verschlüsselung keine Microsoft-Anmeldung.
// - Eine unlesbare Ablage wird nie stillschweigend überschrieben.
//
// Bewusst ohne Electron-Import: alles, was Electron braucht, kommt über deps
// herein. So ist die Zustandslogik ohne laufende App testbar. Was die Tests
// mit nachgebauter Bibliothek NICHT belegen (echter Ablauf, zwei Konten,
// Widerruf, gepackter Build), steht im Review unter F11.

import * as path from 'path'
import * as fs from 'fs/promises'
import { createHash } from 'crypto'
import { isMicrosoftAccountId } from './credentialPath'

/** Mitgelieferte App-Registrierung (öffentlicher Client, kein Geheimnis). */
export const DEFAULT_MICROSOFT_CLIENT_ID = 'd947240f-13dd-4d80-b361-fc0183daf530'
const AUTHORITY_ORIGIN = 'https://login.microsoftonline.com'
/** Nur Organisationskonten der weltweiten Microsoft-Cloud. */
const DEFAULT_TENANT = 'organizations'

/** Zwei Ressourcen, zwei Marken (gemessen 10.11.2026). */
export const GRAPH_SCOPES = ['User.Read', 'Mail.Send']
export const IMAP_SCOPES = ['https://outlook.office.com/IMAP.AccessAsUser.All']

/** Fester IMAP-Zugang für Microsoft-Konten — nie aus Renderer-Angaben. */
export const MICROSOFT_IMAP_ENDPOINT = { host: 'outlook.office365.com', port: 993, tls: true } as const

/** Eigener Unterordner unter userData, außerhalb des Namensraums `email-<id>.enc`. */
export const MICROSOFT_AUTH_DIR = 'microsoft-auth'
const BINDINGS_FILE = 'accounts.enc'
/** So lange darf eine Anmeldung im Browser dauern, bevor die App aufgibt. */
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000

export type MicrosoftAuthErrorCode =
  | 'encryption-unavailable'
  | 'storage-unreadable'
  | 'admin-consent-required'
  | 'consent-declined'
  | 'consent-required'
  | 'access-denied'
  | 'cancelled'
  | 'timeout'
  | 'reauth-required'
  | 'unknown-account'
  | 'invalid-config'
  | 'offline'
  | 'failed'

export class MicrosoftAuthError extends Error {
  constructor(public readonly code: MicrosoftAuthErrorCode, message?: string) {
    super(message || messageFor(code))
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
  /** 'signed-out' nach Abmelden: Bindung bleibt für Anzeige und spätere Neuanmeldung. */
  state: 'signed-in' | 'signed-out'
}

export interface MicrosoftAccountStatus {
  /** true für jede Konto-ID in Microsoft-Form, auch wenn die Ablage fehlt. */
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
  /** Muss false liefern, wenn die Systemablage nur zum Schein verschlüsselt (Linux `basic_text`). */
  isEncryptionAvailable: () => boolean
  encrypt: (plain: string) => Buffer
  decrypt: (encrypted: Buffer) => string
  /** Öffnet die Anmeldeseite im Systembrowser. */
  openExternal: (url: string) => Promise<void>
  /** Für Tests: ersetzt das Laden von @azure/msal-node. */
  loadMsal?: () => Promise<MsalModule>
  /** Für Tests: Zeitlimit der Anmeldung. */
  loginTimeoutMs?: number
}

// Schmaler Ausschnitt der MSAL-Schnittstelle, damit Tests sie nachbauen können.
export interface MsalAccount {
  homeAccountId: string
  tenantId: string
  localAccountId: string
  username: string
  name?: string
  idTokenClaims?: { oid?: string; tid?: string }
}
export interface MsalResult { accessToken: string; account: MsalAccount | null; idTokenClaims?: { oid?: string; tid?: string } }
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
  /** Eigene App-Registrierung einer Organisation. */
  clientId?: string
  /** Mandant (GUID oder Domain), wenn die eigene Registrierung nur einen Mandanten zulässt. */
  tenant?: string
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TENANT_RE = /^(organizations|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)$/i

/** Gleiche Anmeldung ergibt auf jedem Gerät dieselbe Konto-ID. */
export function deriveMicrosoftAccountId(tenantId: string, objectId: string): string {
  const digest = createHash('sha256').update(`${tenantId.toLowerCase()}:${objectId.toLowerCase()}`).digest('hex')
  return `ms-${digest.slice(0, 24)}`
}

/** Ein MSAL-Fehlercode fürs Log — nur ein kurzes Wort aus Kleinbuchstaben, nie eine Fehlernachricht. */
export function errorCodeForLog(error: unknown): string {
  const code = (error as { errorCode?: unknown })?.errorCode
  return typeof code === 'string' && /^[a-z0-9_]{1,60}$/i.test(code) ? code : '(ohne Code)'
}

/**
 * Ordnet einen MSAL-/Entra-Fehler einem festen Code zu. Die Reihenfolge ist
 * die Priorität: ein Abbruch bleibt ein Abbruch, auch wenn `access_denied`
 * dabeisteht; ein nacktes `access_denied` ist KEINE abgelehnte Zustimmung.
 */
export function classifyMicrosoftError(error: unknown): MicrosoftAuthErrorCode {
  if (error instanceof MicrosoftAuthError) return error.code
  const e = error as { errorCode?: string; subError?: string; errorMessage?: string; message?: string; name?: string; code?: string }
  const code = String(e?.errorCode || '').toLowerCase()
  const sub = String(e?.subError || '').toLowerCase()
  const text = `${e?.errorMessage || ''} ${e?.message || ''}`.toLowerCase()
  const aadsts = (...numbers: number[]): boolean => numbers.some(n => new RegExp(`aadsts${n}(?!\\d)`).test(text))

  if (/^user_cancell?ed$/.test(code) || /user_cancel/.test(text) || /user_cancel/.test(sub)) return 'cancelled'
  if (aadsts(90094, 900941, 90095) || /need admin approval|admin(istrator)? (consent|approval) (is )?required/.test(text)) return 'admin-consent-required'
  if (aadsts(65004)) return 'consent-declined'
  if (code === 'consent_required' || sub === 'consent_required' || aadsts(65001)) return 'consent-required'
  if (
    ['interaction_required', 'login_required', 'invalid_grant', 'no_tokens_found', 'no_account_found', 'no_account_error', 'token_refresh_required'].includes(code)
    || aadsts(50076, 50079, 50173, 700082, 700084, 50078)
    || e?.name === 'InteractionRequiredAuthError'
  ) return 'reauth-required'
  if (code === 'access_denied') return 'access-denied'
  if (code === 'network_error' || code === 'no_network_connectivity' || /^(enotfound|etimedout|econnrefused|econnreset|eai_again)$/i.test(String(e?.code || ''))) return 'offline'
  return 'failed'
}

/** Meldung für die Oberfläche — ohne Kontodaten. */
export function messageFor(code: MicrosoftAuthErrorCode): string {
  switch (code) {
    case 'encryption-unavailable': return 'Die sichere Ablage des Systems ist nicht verfügbar. Ohne sie wird keine Microsoft-Anmeldung gespeichert.'
    case 'storage-unreadable': return 'Die gespeicherte Microsoft-Anmeldung auf diesem Gerät ist nicht lesbar. Sie wurde nicht verändert.'
    case 'admin-consent-required': return 'Deine Organisation hat MindGraph Notes noch nicht freigegeben. Bitte wende dich an deine Administration.'
    case 'consent-declined': return 'Die Zustimmung wurde nicht erteilt. Ohne sie kann MindGraph Notes das Postfach nicht nutzen.'
    case 'consent-required': return 'Für diesen Zugriff fehlt noch die Zustimmung. Bitte melde dich erneut bei Microsoft an.'
    case 'access-denied': return 'Microsoft hat den Zugriff abgelehnt. Mögliche Ursache ist eine Richtlinie deiner Organisation.'
    case 'cancelled': return 'Die Anmeldung wurde abgebrochen.'
    case 'timeout': return 'Die Anmeldung wurde nicht innerhalb von fünf Minuten abgeschlossen.'
    case 'reauth-required': return 'Für dieses Konto ist eine neue Anmeldung bei Microsoft nötig.'
    case 'unknown-account': return 'Dieses Konto ist nicht als Microsoft-Konto eingerichtet.'
    case 'invalid-config': return 'Anwendungs-ID oder Mandant sind ungültig.'
    case 'offline': return 'Microsoft ist nicht erreichbar. Bitte prüfe die Netzverbindung.'
    default: return 'Die Anmeldung bei Microsoft ist fehlgeschlagen.'
  }
}

const page = (title: string, text: string): string =>
  `<!doctype html><meta charset="utf-8"><title>MindGraph Notes</title><body style="font:16px system-ui;margin:48px;color:#222"><h2>${title}</h2><p>${text}</p></body>`
const SUCCESS_PAGE = page('Anmeldung abgeschlossen', 'Du kannst dieses Fenster schließen und zu MindGraph Notes zurückkehren.')
const ERROR_PAGE = page('Anmeldung nicht abgeschlossen', 'Bitte kehre zu MindGraph Notes zurück. Dort steht, was fehlt.')

export interface MicrosoftAuth {
  login(options?: LoginOptions): Promise<{ accountId: string; username: string; displayName?: string; status: MicrosoftAccountStatus }>
  /** Bricht eine laufende Anmeldung ab. Kommt sie später doch noch an, wird sie verworfen. */
  cancelLogin(): void
  status(accountId: string): Promise<MicrosoftAccountStatus>
  logout(accountId: string): Promise<void>
  /** Nur für Code im Main. Wirft MicrosoftAuthError, nie ein Passwort-Rückfall. */
  getImapAuth(accountId: string): Promise<{ host: string; port: number; tls: boolean; user: string; accessToken: string }>
  /** Nur für Code im Main. */
  getGraphToken(accountId: string): Promise<{ accessToken: string; username: string; displayName?: string }>
}

type Bindings = Map<string, MicrosoftAccountBinding>

export function createMicrosoftAuth(deps: MicrosoftAuthDeps): MicrosoftAuth {
  const clients = new Map<string, Promise<MsalClient>>()
  // Jede Abmeldung erhöht den Zähler des Kontos. Ein Markenabruf, der davor
  // begonnen hat, gibt danach nichts mehr heraus.
  const revocations = new Map<string, number>()
  let activeLogin: { abandoned: boolean; cancel: (code: 'cancelled' | 'timeout') => void } | null = null
  let dirReady: Promise<string> | null = null

  // Alle Schreibzugriffe auf die Ablage nacheinander.
  let writeChain: Promise<unknown> = Promise.resolve()
  const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = writeChain.then(fn, fn)
    writeChain = next.catch(() => undefined)
    return next
  }

  const requireEncryption = (): void => {
    if (!deps.isEncryptionAvailable()) throw new MicrosoftAuthError('encryption-unavailable')
  }

  /** Legt den Unterordner an und räumt Schreibreste eines abgestürzten Laufs weg. */
  function storageDir(): Promise<string> {
    if (!dirReady) {
      dirReady = (async () => {
        const dir = path.join(deps.getUserDataDir(), MICROSOFT_AUTH_DIR)
        await fs.mkdir(dir, { recursive: true, mode: 0o700 })
        for (const name of await fs.readdir(dir)) {
          if (name.endsWith('.tmp')) await fs.rm(path.join(dir, name), { force: true })
        }
        return dir
      })()
      dirReady.catch(() => { dirReady = null })
    }
    return dirReady
  }

  /** null nur, wenn die Datei fehlt. Alles andere ist ein Fehler — nie „leer“. */
  async function readEncrypted(name: string): Promise<string | null> {
    const file = path.join(await storageDir(), name)
    let encrypted: Buffer
    try {
      encrypted = await fs.readFile(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null
      throw new MicrosoftAuthError('storage-unreadable')
    }
    try {
      return deps.decrypt(encrypted)
    } catch {
      throw new MicrosoftAuthError('storage-unreadable')
    }
  }

  async function writeEncrypted(name: string, plain: string): Promise<void> {
    requireEncryption()
    const target = path.join(await storageDir(), name)
    const tmp = `${target}.${process.pid}.tmp`
    const handle = await fs.open(tmp, 'w', 0o600)
    try {
      await handle.writeFile(deps.encrypt(plain))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(tmp, target)
  }

  async function loadBindings(): Promise<Bindings> {
    const raw = await readEncrypted(BINDINGS_FILE)
    const bindings: Bindings = new Map()
    if (raw === null) return bindings
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new MicrosoftAuthError('storage-unreadable')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new MicrosoftAuthError('storage-unreadable')
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const b = value as Partial<MicrosoftAccountBinding> | null
      // Jeder Eintrag muss vollständig sein und unter der ID stehen, die zu Mandant und Objekt passt.
      // Ein einzelner beschädigter Eintrag macht die ganze Ablage unlesbar: würde er still
      // weggelassen, ginge er beim nächsten Speichern endgültig verloren.
      const valid = isMicrosoftAccountId(id) && !!b && b.provider === 'microsoft'
        && typeof b.tenantId === 'string' && typeof b.objectId === 'string' && typeof b.username === 'string' && typeof b.homeAccountId === 'string'
        && typeof b.clientId === 'string' && GUID_RE.test(b.clientId) && typeof b.tenant === 'string' && TENANT_RE.test(b.tenant)
        && deriveMicrosoftAccountId(b.tenantId, b.objectId) === id
      if (!valid) throw new MicrosoftAuthError('storage-unreadable')
      bindings.set(id, { ...(b as MicrosoftAccountBinding), state: b.state === 'signed-in' ? 'signed-in' : 'signed-out' })
    }
    return bindings
  }

  const saveBindings = (bindings: Bindings): Promise<void> =>
    writeEncrypted(BINDINGS_FILE, JSON.stringify(Object.fromEntries(bindings)))

  const clientKey = (clientId: string, tenant: string): string => `${clientId.toLowerCase()}|${tenant.toLowerCase()}`
  const cacheFile = (clientId: string, tenant: string): string =>
    `cache-${createHash('sha256').update(clientKey(clientId, tenant)).digest('hex').slice(0, 20)}.enc`

  function resolveConfig(options?: LoginOptions): { clientId: string; tenant: string } {
    const clientId = (typeof options?.clientId === 'string' ? options.clientId : '').trim() || DEFAULT_MICROSOFT_CLIENT_ID
    const tenant = (typeof options?.tenant === 'string' ? options.tenant : '').trim() || DEFAULT_TENANT
    if (!GUID_RE.test(clientId)) throw new MicrosoftAuthError('invalid-config', 'Die Anwendungs-ID hat nicht die Form einer GUID.')
    if (!TENANT_RE.test(tenant)) throw new MicrosoftAuthError('invalid-config', 'Der Mandant muss eine GUID oder eine Domain sein.')
    return { clientId, tenant }
  }

  function getClient(clientId: string, tenant: string): Promise<MsalClient> {
    const key = clientKey(clientId, tenant)
    let client = clients.get(key)
    if (!client) {
      client = (async () => {
        const msal = await (deps.loadMsal ? deps.loadMsal() : (import('@azure/msal-node') as unknown as Promise<MsalModule>))
        const name = cacheFile(clientId, tenant)
        return new msal.PublicClientApplication({
          auth: { clientId, authority: `${AUTHORITY_ORIGIN}/${tenant}` },
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

  /** Das Cache-Konto genau dieser Bindung: Heimatkonto, Mandant UND lokale Kennung. */
  async function findMsalAccount(client: MsalClient, binding: Pick<MicrosoftAccountBinding, 'homeAccountId' | 'tenantId' | 'objectId'>): Promise<MsalAccount | null> {
    const accounts = await client.getTokenCache().getAllAccounts()
    return accounts.find(a =>
      a.homeAccountId === binding.homeAccountId
      && a.tenantId?.toLowerCase() === binding.tenantId.toLowerCase()
      && a.localAccountId?.toLowerCase() === binding.objectId.toLowerCase()
    ) || null
  }

  async function removeFromCache(binding: Pick<MicrosoftAccountBinding, 'homeAccountId' | 'tenantId' | 'objectId' | 'clientId' | 'tenant'>): Promise<void> {
    const client = await getClient(binding.clientId, binding.tenant)
    const account = await findMsalAccount(client, binding)
    if (account) await client.getTokenCache().removeAccount(account)
  }

  async function silentToken(accountId: string, binding: MicrosoftAccountBinding, scopes: string[]): Promise<string> {
    if (binding.state !== 'signed-in') throw new MicrosoftAuthError('reauth-required')
    requireEncryption()
    const generation = revocations.get(accountId) || 0
    const client = await getClient(binding.clientId, binding.tenant)
    const account = await findMsalAccount(client, binding)
    if (!account) throw new MicrosoftAuthError('reauth-required')
    let token: string
    try {
      const result = await client.acquireTokenSilent({ account, scopes })
      if (!result?.accessToken) throw new MicrosoftAuthError('reauth-required')
      token = result.accessToken
    } catch (error) {
      const code = classifyMicrosoftError(error)
      console.warn('[MicrosoftAuth] Stille Erneuerung fehlgeschlagen:', code, errorCodeForLog(error))
      throw new MicrosoftAuthError(code)
    }
    // Wurde inzwischen abgemeldet, gibt dieser Aufruf nichts mehr heraus.
    if ((revocations.get(accountId) || 0) !== generation) throw new MicrosoftAuthError('reauth-required')
    return token
  }

  async function requireBinding(accountId: string): Promise<MicrosoftAccountBinding> {
    if (!isMicrosoftAccountId(accountId)) throw new MicrosoftAuthError('unknown-account')
    const binding = (await loadBindings()).get(accountId)
    // Microsoft-ID ohne Bindung (neues Gerät, Ablage fehlt): Anmeldung nötig, kein anderer Weg.
    if (!binding) throw new MicrosoftAuthError('reauth-required')
    return binding
  }

  async function probe(accountId: string, binding: MicrosoftAccountBinding, scopes: string[]): Promise<{ ok: boolean; code?: MicrosoftAuthErrorCode }> {
    try {
      await silentToken(accountId, binding, scopes)
      return { ok: true }
    } catch (error) {
      return { ok: false, code: classifyMicrosoftError(error) }
    }
  }

  async function statusOf(accountId: string, binding: MicrosoftAccountBinding | undefined): Promise<MicrosoftAccountStatus> {
    const off = { signedIn: false, fetchReady: false, sendReady: false }
    if (!binding) return { known: true, ...off, errorCode: 'reauth-required' }
    const base = { known: true, username: binding.username, displayName: binding.displayName }
    if (binding.state !== 'signed-in') return { ...base, ...off, errorCode: 'reauth-required' }
    if (!deps.isEncryptionAvailable()) return { ...base, ...off, errorCode: 'encryption-unavailable' }
    const fetch = await probe(accountId, binding, IMAP_SCOPES)
    const send = await probe(accountId, binding, GRAPH_SCOPES)
    return { ...base, signedIn: fetch.ok || send.ok, fetchReady: fetch.ok, sendReady: send.ok, errorCode: fetch.code || send.code }
  }

  /** Nur die Anmeldeseite genau dieses Antrags: Herkunft, Pfad, Anwendungs-ID, lokaler Rückweg. */
  function assertLoginUrl(url: string, clientId: string, tenant: string): void {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new MicrosoftAuthError('failed', 'Unerwartete Anmeldeadresse.')
    }
    const redirect = parsed.searchParams.get('redirect_uri') || ''
    let redirectOk = false
    try {
      const r = new URL(redirect)
      redirectOk = r.protocol === 'http:' && (r.hostname === 'localhost' || r.hostname === '127.0.0.1')
    } catch { /* bleibt false */ }
    const ok = parsed.origin === AUTHORITY_ORIGIN
      && parsed.pathname.toLowerCase() === `/${tenant.toLowerCase()}/oauth2/v2.0/authorize`
      && (parsed.searchParams.get('client_id') || '').toLowerCase() === clientId.toLowerCase()
      && redirectOk
    if (!ok) throw new MicrosoftAuthError('failed', 'Unerwartete Anmeldeadresse.')
  }

  return {
    async login(options) {
      requireEncryption()
      const { clientId, tenant } = resolveConfig(options)
      // Unlesbare Ablage: hier abbrechen, bevor ein Browser aufgeht — nichts überschreiben.
      await loadBindings()
      const client = await getClient(clientId, tenant)

      // Immer nur eine Anmeldung: eine noch offene wird aufgegeben.
      activeLogin?.cancel('cancelled')
      let giveUp: (code: 'cancelled' | 'timeout') => void = () => undefined
      const attempt = { abandoned: false, cancel: (code: 'cancelled' | 'timeout') => giveUp(code) }
      activeLogin = attempt
      const aborted = new Promise<never>((_resolve, reject) => {
        giveUp = (code) => { attempt.abandoned = true; reject(new MicrosoftAuthError(code)) }
      })
      const timer = setTimeout(() => attempt.cancel('timeout'), deps.loginTimeoutMs ?? LOGIN_TIMEOUT_MS)

      const interactive = client.acquireTokenInteractive({
        scopes: GRAPH_SCOPES,
        // Zustimmung für die zweite Ressource im selben Fenster einholen.
        extraScopesToConsent: IMAP_SCOPES,
        prompt: 'select_account',
        successTemplate: SUCCESS_PAGE,
        errorTemplate: ERROR_PAGE,
        openBrowser: async (url: string) => {
          assertLoginUrl(url, clientId, tenant)
          await deps.openExternal(url)
        }
      })
      // Kommt eine aufgegebene Anmeldung später doch noch an: ihr Konto wieder aus
      // dem Cache nehmen, sofern es nicht ohnehin gebunden und angemeldet ist.
      interactive.then(async (late) => {
        if (!attempt.abandoned || !late?.account) return
        try {
          const oid = late.idTokenClaims?.oid || late.account.idTokenClaims?.oid
          const bound = oid ? (await loadBindings()).get(deriveMicrosoftAccountId(late.account.tenantId, oid)) : undefined
          if (!(bound && bound.state === 'signed-in' && clientKey(bound.clientId, bound.tenant) === clientKey(clientId, tenant))) {
            await client.getTokenCache().removeAccount(late.account)
          }
        } catch { /* Aufräumen nach bestem Bemühen */ }
      }, () => undefined)

      let result: MsalResult
      try {
        result = await Promise.race([interactive, aborted])
      } catch (error) {
        const code = classifyMicrosoftError(error)
        console.warn('[MicrosoftAuth] Anmeldung nicht abgeschlossen:', code, errorCodeForLog(error))
        throw error instanceof MicrosoftAuthError ? error : new MicrosoftAuthError(code)
      } finally {
        clearTimeout(timer)
        if (activeLogin === attempt) activeLogin = null
      }

      const account = result.account
      // Die Konto-ID braucht die feste Objekt-ID. MSAL füllt localAccountId aus
      // `oid`, ersatzweise aus `sub` — `sub` ist je Anwendung verschieden und taugt nicht.
      const oid = result.idTokenClaims?.oid || account?.idTokenClaims?.oid
      if (!account?.tenantId || !account.username || !account.homeAccountId || !oid || account.localAccountId?.toLowerCase() !== oid.toLowerCase()) {
        if (account) await client.getTokenCache().removeAccount(account).catch(() => undefined)
        throw new MicrosoftAuthError('failed', 'Microsoft hat kein vollständiges Organisationskonto zurückgegeben.')
      }
      const accountId = deriveMicrosoftAccountId(account.tenantId, oid)
      const binding: MicrosoftAccountBinding = {
        provider: 'microsoft',
        tenantId: account.tenantId,
        objectId: oid,
        username: account.username,
        displayName: account.name || undefined,
        homeAccountId: account.homeAccountId,
        clientId,
        tenant,
        state: 'signed-in'
      }
      const previous = await serialized(async () => {
        const bindings = await loadBindings()
        const before = bindings.get(accountId)
        bindings.set(accountId, binding)
        await saveBindings(bindings)
        return before
      })
      // Wechsel der Anwendungs-ID oder des Mandanten: Marken der alten Registrierung entfernen.
      if (previous && clientKey(previous.clientId, previous.tenant) !== clientKey(clientId, tenant)) {
        await removeFromCache(previous).catch(() => console.warn('[MicrosoftAuth] Alte Anmeldung nach Wechsel der Registrierung nicht entfernt'))
      }
      return { accountId, username: binding.username, displayName: binding.displayName, status: await statusOf(accountId, binding) }
    },

    cancelLogin() {
      activeLogin?.cancel('cancelled')
    },

    async status(accountId) {
      if (!isMicrosoftAccountId(accountId)) return { known: false, signedIn: false, fetchReady: false, sendReady: false }
      try {
        return await statusOf(accountId, (await loadBindings()).get(accountId))
      } catch (error) {
        return { known: true, signedIn: false, fetchReady: false, sendReady: false, errorCode: classifyMicrosoftError(error) }
      }
    },

    async logout(accountId) {
      if (!isMicrosoftAccountId(accountId)) throw new MicrosoftAuthError('unknown-account')
      // Zuerst im Speicher sperren: ab hier gibt kein laufender Abruf mehr eine Marke heraus.
      revocations.set(accountId, (revocations.get(accountId) || 0) + 1)
      const binding = await serialized(async () => {
        const bindings = await loadBindings()
        const current = bindings.get(accountId)
        if (current && current.state !== 'signed-out') {
          bindings.set(accountId, { ...current, state: 'signed-out' })
          await saveBindings(bindings)
        }
        return current
      })
      if (!binding) return
      try {
        await removeFromCache(binding)
      } catch (error) {
        console.warn('[MicrosoftAuth] Marken beim Abmelden nicht entfernt:', classifyMicrosoftError(error), errorCodeForLog(error))
        throw new MicrosoftAuthError('failed', 'Abgemeldet, aber die gespeicherte Anmeldung ließ sich nicht vollständig löschen.')
      }
    },

    async getImapAuth(accountId) {
      const binding = await requireBinding(accountId)
      const accessToken = await silentToken(accountId, binding, IMAP_SCOPES)
      return { ...MICROSOFT_IMAP_ENDPOINT, user: binding.username, accessToken }
    },

    async getGraphToken(accountId) {
      const binding = await requireBinding(accountId)
      const accessToken = await silentToken(accountId, binding, GRAPH_SCOPES)
      return { accessToken, username: binding.username, displayName: binding.displayName }
    }
  }
}
