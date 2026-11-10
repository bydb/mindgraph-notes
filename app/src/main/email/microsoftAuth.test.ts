import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import {
  createMicrosoftAuth, deriveMicrosoftAccountId, classifyMicrosoftError, MicrosoftAuthError,
  MICROSOFT_IMAP_ENDPOINT, GRAPH_SCOPES, IMAP_SCOPES, DEFAULT_MICROSOFT_CLIENT_ID,
  type MicrosoftAuthDeps, type MsalAccount, type MsalCacheContext, type MsalModule
} from './microsoftAuth'

const TENANT = '11111111-2222-3333-4444-555555555555'
const OID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const ACCOUNT: MsalAccount = { homeAccountId: `${OID}.${TENANT}`, tenantId: TENANT, localAccountId: OID, username: 'erika@schule.example', name: 'Erika Beispiel' }

// Nachbau von MSAL: ein "Cache" je Client, der über das Plugin geladen und gespeichert wird.
function fakeMsal(behaviour: {
  interactive?: (request: Record<string, unknown>) => Promise<void> | void
  silentError?: (scopes: string[]) => unknown
  configs?: Record<string, unknown>[]
  silentCalls?: string[][]
} = {}): MsalModule {
  class Client {
    private accounts: MsalAccount[] = []
    private plugin: { beforeCacheAccess(c: MsalCacheContext): Promise<void>; afterCacheAccess(c: MsalCacheContext): Promise<void> }
    constructor(config: Record<string, unknown>) {
      behaviour.configs?.push(config)
      this.plugin = (config.cache as { cachePlugin: Client['plugin'] }).cachePlugin
    }
    private ctx(changed: boolean): MsalCacheContext {
      return {
        cacheHasChanged: changed,
        tokenCache: {
          serialize: () => JSON.stringify({ accounts: this.accounts, refreshToken: 'GEHEIME-ERNEUERUNGSMARKE' }),
          deserialize: (raw: string) => { this.accounts = JSON.parse(raw).accounts }
        }
      }
    }
    async acquireTokenInteractive(request: Record<string, unknown>) {
      await this.plugin.beforeCacheAccess(this.ctx(false))
      await behaviour.interactive?.(request)
      await (request.openBrowser as (url: string) => Promise<void>)('https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?x=1')
      this.accounts = [ACCOUNT]
      await this.plugin.afterCacheAccess(this.ctx(true))
      return { accessToken: 'graph-marke', account: ACCOUNT }
    }
    async acquireTokenSilent(request: Record<string, unknown>) {
      await this.plugin.beforeCacheAccess(this.ctx(false))
      const scopes = request.scopes as string[]
      behaviour.silentCalls?.push(scopes)
      const err = behaviour.silentError?.(scopes)
      if (err) throw err
      return { accessToken: scopes === IMAP_SCOPES ? 'imap-marke' : 'graph-marke', account: request.account as MsalAccount }
    }
    getTokenCache() {
      return {
        getAllAccounts: async () => { await this.plugin.beforeCacheAccess(this.ctx(false)); return this.accounts },
        removeAccount: async (account: MsalAccount) => {
          this.accounts = this.accounts.filter(a => a.homeAccountId !== account.homeAccountId)
          await this.plugin.afterCacheAccess(this.ctx(true))
        }
      }
    }
  }
  return { PublicClientApplication: Client as unknown as MsalModule['PublicClientApplication'] }
}

let dir = ''
let opened: string[] = []
let dirRequests = 0

const makeDeps = (msal: MsalModule, overrides: Partial<MicrosoftAuthDeps> = {}): MicrosoftAuthDeps => ({
  getUserDataDir: () => { dirRequests++; return dir },
  isEncryptionAvailable: () => true,
  // Umkehrbare "Verschlüsselung": reicht, um zu zeigen, dass nichts im Klartext auf der Platte liegt.
  encrypt: (plain) => Buffer.from(Buffer.from(plain, 'utf8').toString('base64').split('').reverse().join('')),
  decrypt: (enc) => Buffer.from(enc.toString().split('').reverse().join(''), 'base64').toString('utf8'),
  openExternal: async (url) => { opened.push(url) },
  loadMsal: async () => msal,
  ...overrides
})

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-msauth-'))
  opened = []
  dirRequests = 0
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('deriveMicrosoftAccountId', () => {
  it('ist für dieselbe Anmeldung auf jedem Gerät gleich, unabhängig von der Schreibweise', () => {
    const id = deriveMicrosoftAccountId(TENANT, OID)
    expect(id).toMatch(/^ms-[0-9a-f]{24}$/)
    expect(deriveMicrosoftAccountId(TENANT.toUpperCase(), OID.toUpperCase())).toBe(id)
    expect(id).not.toContain(OID.slice(0, 8))
  })
  it('unterscheidet Nutzer und Mandanten', () => {
    expect(deriveMicrosoftAccountId(TENANT, OID)).not.toBe(deriveMicrosoftAccountId(TENANT, OID.replace('a', 'b')))
    expect(deriveMicrosoftAccountId(TENANT, OID)).not.toBe(deriveMicrosoftAccountId(TENANT.replace('1', '2'), OID))
  })
})

describe('classifyMicrosoftError', () => {
  it('erkennt fehlende Freigabe durch die Organisation', () => {
    expect(classifyMicrosoftError({ errorCode: 'access_denied', errorMessage: 'AADSTS90094: Admin consent is required' })).toBe('admin-consent-required')
    expect(classifyMicrosoftError(new Error('Need admin approval'))).toBe('admin-consent-required')
  })
  it('erkennt Ablehnung, Abbruch und nötige Neuanmeldung', () => {
    expect(classifyMicrosoftError({ errorCode: 'access_denied', errorMessage: 'AADSTS65004: User declined to consent' })).toBe('consent-declined')
    expect(classifyMicrosoftError({ errorCode: 'user_cancelled' })).toBe('cancelled')
    expect(classifyMicrosoftError({ errorCode: 'interaction_required' })).toBe('reauth-required')
    expect(classifyMicrosoftError({ errorCode: 'invalid_grant', errorMessage: 'AADSTS700082: The refresh token has expired' })).toBe('reauth-required')
    expect(classifyMicrosoftError(new Error('socket hang up'))).toBe('failed')
  })
})

describe('createMicrosoftAuth', () => {
  it('fasst beim Anlegen keine Datei an und lädt nichts', () => {
    let loaded = false
    createMicrosoftAuth(makeDeps(fakeMsal(), { loadMsal: async () => { loaded = true; return fakeMsal() } }))
    expect(dirRequests).toBe(0)
    expect(loaded).toBe(false)
  })

  it('meldet an, bindet die Kontoart an die abgeleitete ID und legt nichts im Klartext ab', async () => {
    const configs: Record<string, unknown>[] = []
    const requests: Record<string, unknown>[] = []
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ configs, interactive: (r) => { requests.push(r) } })))
    const result = await auth.login()
    expect(result.accountId).toBe(deriveMicrosoftAccountId(TENANT, OID))
    expect(result.username).toBe('erika@schule.example')
    expect(result.status).toMatchObject({ known: true, signedIn: true, fetchReady: true, sendReady: true })
    expect(opened).toHaveLength(1)
    expect(requests[0].scopes).toEqual(GRAPH_SCOPES)
    expect(requests[0].extraScopesToConsent).toEqual(IMAP_SCOPES)
    expect((configs[0].auth as { clientId: string; authority: string })).toEqual({ clientId: DEFAULT_MICROSOFT_CLIENT_ID, authority: 'https://login.microsoftonline.com/organizations' })
    const files = await fs.readdir(dir)
    expect(files.sort()).toEqual(expect.arrayContaining(['email-microsoft-accounts.enc']))
    expect(files.some(f => f.startsWith('email-microsoft-cache-'))).toBe(true)
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false)
    for (const f of files) {
      const content = (await fs.readFile(path.join(dir, f))).toString()
      expect(content).not.toContain('erika@schule.example')
      expect(content).not.toContain('GEHEIME-ERNEUERUNGSMARKE')
      expect(content).not.toContain(OID)
    }
  })

  it('gibt für den Abruf feste Verbindungsdaten und den Anmeldenamen aus der Anmeldung heraus', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    const { accountId } = await auth.login()
    expect(await auth.getImapAuth(accountId)).toEqual({ ...MICROSOFT_IMAP_ENDPOINT, user: 'erika@schule.example', accessToken: 'imap-marke' })
    expect(await auth.getGraphToken(accountId)).toEqual({ accessToken: 'graph-marke', username: 'erika@schule.example', displayName: 'Erika Beispiel' })
  })

  it('übersteht einen Neustart: eine neue Instanz liest Bindung und Marken von der Platte', async () => {
    const { accountId } = await createMicrosoftAuth(makeDeps(fakeMsal())).login()
    const second = createMicrosoftAuth(makeDeps(fakeMsal()))
    expect(await second.isMicrosoftAccount(accountId)).toBe(true)
    expect((await second.getImapAuth(accountId)).accessToken).toBe('imap-marke')
  })

  it('nach dem Abmelden: Konto bleibt Microsoft-Konto, gibt aber keine Marke mehr heraus', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    const { accountId } = await auth.login()
    await auth.logout(accountId)
    expect(await auth.isMicrosoftAccount(accountId)).toBe(true)
    expect(await auth.status(accountId)).toMatchObject({ known: true, signedIn: false, fetchReady: false, sendReady: false, errorCode: 'reauth-required' })
    await expect(auth.getImapAuth(accountId)).rejects.toMatchObject({ code: 'reauth-required' })
    await expect(auth.getGraphToken(accountId)).rejects.toMatchObject({ code: 'reauth-required' })
    // auch eine frische Instanz bleibt dabei
    await expect(createMicrosoftAuth(makeDeps(fakeMsal())).getImapAuth(accountId)).rejects.toMatchObject({ code: 'reauth-required' })
  })

  it('erneute Anmeldung nach dem Abmelden stellt das Konto unter derselben ID wieder her', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    const first = await auth.login()
    await auth.logout(first.accountId)
    const again = await auth.login()
    expect(again.accountId).toBe(first.accountId)
    expect((await auth.getImapAuth(again.accountId)).accessToken).toBe('imap-marke')
  })

  it('unterscheidet Abruf und Versand: fehlt die Zustimmung für IMAP, ist nur der Versand bereit', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ silentError: (scopes) => scopes === IMAP_SCOPES ? { errorCode: 'consent_required' } : null })))
    const { accountId, status } = await auth.login()
    expect(status).toMatchObject({ signedIn: true, fetchReady: false, sendReady: true, errorCode: 'reauth-required' })
    await expect(auth.getImapAuth(accountId)).rejects.toBeInstanceOf(MicrosoftAuthError)
    expect((await auth.getGraphToken(accountId)).accessToken).toBe('graph-marke')
  })

  it('kennt unbekannte Konten nicht und erfindet keine Bindung', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    expect(await auth.isMicrosoftAccount('email-1700000000000')).toBe(false)
    expect(await auth.status('email-1700000000000')).toEqual({ known: false, signedIn: false, fetchReady: false, sendReady: false })
    await expect(auth.getImapAuth('email-1700000000000')).rejects.toMatchObject({ code: 'unknown-account' })
  })

  it('ohne sichere Ablage: keine Anmeldung, keine Datei, kein Browserfenster', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal(), { isEncryptionAvailable: () => false }))
    await expect(auth.login()).rejects.toMatchObject({ code: 'encryption-unavailable' })
    expect(opened).toHaveLength(0)
    expect(await fs.readdir(dir)).toEqual([])
  })

  it('öffnet nur die Anmeldeseite von Microsoft', async () => {
    const msal = fakeMsal({ interactive: async (r) => { await (r.openBrowser as (u: string) => Promise<void>)('https://login.microsoftonline.com.evil.example/x') } })
    const auth = createMicrosoftAuth(makeDeps(msal))
    await expect(auth.login()).rejects.toBeInstanceOf(MicrosoftAuthError)
    expect(opened).toHaveLength(0)
  })

  it('meldet fehlende Freigabe der Organisation mit festem Code und ohne Kontodaten im Text', async () => {
    const msal = fakeMsal({ interactive: () => { throw { errorCode: 'access_denied', errorMessage: 'AADSTS90094: erika@schule.example needs admin approval' } } })
    const error = await createMicrosoftAuth(makeDeps(msal)).login().catch(e => e)
    expect(error).toBeInstanceOf(MicrosoftAuthError)
    expect(error.code).toBe('admin-consent-required')
    expect(error.message).not.toContain('erika')
    expect(await fs.readdir(dir)).toEqual([])
  })

  it('weist ungültige Anwendungs-ID und Mandanten ab, bevor irgendetwas geöffnet wird', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    await expect(auth.login({ clientId: 'keine-guid' })).rejects.toMatchObject({ code: 'invalid-config' })
    await expect(auth.login({ tenant: 'evil.example/oauth2/../x' })).rejects.toMatchObject({ code: 'invalid-config' })
    expect(opened).toHaveLength(0)
  })

  it('nimmt eine eigene Anwendungs-ID mit Mandant und merkt sie am Konto', async () => {
    const configs: Record<string, unknown>[] = []
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ configs })))
    const own = '99999999-8888-7777-6666-555555555555'
    const { accountId } = await auth.login({ clientId: own, tenant: 'schule.example' })
    expect(configs[0].auth).toEqual({ clientId: own, authority: 'https://login.microsoftonline.com/schule.example' })
    // Neustart: die Erneuerung nutzt wieder dieselbe Registrierung
    const again: Record<string, unknown>[] = []
    await createMicrosoftAuth(makeDeps(fakeMsal({ configs: again }))).getImapAuth(accountId)
    expect(again[0].auth).toEqual({ clientId: own, authority: 'https://login.microsoftonline.com/schule.example' })
  })
})
