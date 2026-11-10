import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import {
  createMicrosoftAuth, deriveMicrosoftAccountId, classifyMicrosoftError, errorCodeForLog, MicrosoftAuthError,
  MICROSOFT_IMAP_ENDPOINT, MICROSOFT_AUTH_DIR, GRAPH_SCOPES, IMAP_SCOPES, DEFAULT_MICROSOFT_CLIENT_ID,
  type MicrosoftAuthDeps, type MsalAccount, type MsalCacheContext, type MsalModule, type MsalResult
} from './microsoftAuth'
import { emailCredentialFileName, isMicrosoftAccountId } from './credentialPath'

const TENANT = '11111111-2222-3333-4444-555555555555'
const OID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const account = (over: Partial<MsalAccount> = {}): MsalAccount => ({
  homeAccountId: `${OID}.${TENANT}`, tenantId: TENANT, localAccountId: OID, username: 'erika@schule.example', name: 'Erika Beispiel', idTokenClaims: { oid: OID, tid: TENANT }, ...over
})

interface Behaviour {
  /** Konto, das die Anmeldung liefert (Standard: account()). */
  signIn?: () => MsalAccount
  /** Ersetzt die Adresse, die an openBrowser geht. */
  loginUrl?: (clientId: string, tenant: string) => string
  /** Läuft vor dem Abschluss der Anmeldung; darf hängen bleiben. */
  beforeFinish?: () => Promise<void>
  interactiveError?: () => unknown
  silentError?: (scopes: string[]) => unknown
  /** Läuft im Markenabruf vor der Rückgabe. */
  duringSilent?: () => Promise<void>
  configs?: Record<string, unknown>[]
  requests?: Record<string, unknown>[]
  removed?: MsalAccount[]
  /** Lässt das Entfernen aus dem Cache einer bestimmten Anwendungs-ID scheitern. */
  removeError?: (clientId: string) => unknown
}

// Nachbau von MSAL: ein Cache je Client, über das Plugin geladen und gespeichert.
// Er belegt die Zustandslogik dieses Moduls, NICHT das Verhalten der echten Bibliothek.
function fakeMsal(b: Behaviour = {}): MsalModule {
  class Client {
    private accounts: MsalAccount[] = []
    private plugin: { beforeCacheAccess(c: MsalCacheContext): Promise<void>; afterCacheAccess(c: MsalCacheContext): Promise<void> }
    private clientId: string
    private tenant: string
    constructor(config: Record<string, unknown>) {
      b.configs?.push(config)
      this.plugin = (config.cache as { cachePlugin: Client['plugin'] }).cachePlugin
      const auth = config.auth as { clientId: string; authority: string }
      this.clientId = auth.clientId
      this.tenant = auth.authority.split('/').pop() as string
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
    async acquireTokenInteractive(request: Record<string, unknown>): Promise<MsalResult> {
      b.requests?.push(request)
      await this.plugin.beforeCacheAccess(this.ctx(false))
      if (b.interactiveError) throw b.interactiveError()
      const url = b.loginUrl ? b.loginUrl(this.clientId, this.tenant)
        : `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize?client_id=${this.clientId}&redirect_uri=${encodeURIComponent('http://localhost:53124')}&scope=x`
      await (request.openBrowser as (url: string) => Promise<void>)(url)
      await b.beforeFinish?.()
      const acc = b.signIn ? b.signIn() : account()
      this.accounts = [...this.accounts.filter(a => !(a.homeAccountId === acc.homeAccountId && a.tenantId === acc.tenantId)), acc]
      await this.plugin.afterCacheAccess(this.ctx(true))
      return { accessToken: 'graph-marke', account: acc, idTokenClaims: acc.idTokenClaims }
    }
    async acquireTokenSilent(request: Record<string, unknown>): Promise<MsalResult> {
      await this.plugin.beforeCacheAccess(this.ctx(false))
      const scopes = request.scopes as string[]
      const err = b.silentError?.(scopes)
      if (err) throw err
      await b.duringSilent?.()
      const acc = request.account as MsalAccount
      return { accessToken: `${scopes === IMAP_SCOPES ? 'imap' : 'graph'}-marke-${acc.tenantId.slice(0, 4)}`, account: acc }
    }
    getTokenCache() {
      return {
        getAllAccounts: async () => { await this.plugin.beforeCacheAccess(this.ctx(false)); return this.accounts },
        removeAccount: async (acc: MsalAccount) => {
          await this.plugin.beforeCacheAccess(this.ctx(false))
          const failure = b.removeError?.(this.clientId)
          if (failure) throw failure
          b.removed?.push(acc)
          this.accounts = this.accounts.filter(a => !(a.homeAccountId === acc.homeAccountId && a.tenantId === acc.tenantId))
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
const authDir = (): string => path.join(dir, MICROSOFT_AUTH_DIR)
const bindingsPath = (): string => path.join(authDir(), 'accounts.enc')

const makeDeps = (msal: MsalModule, overrides: Partial<MicrosoftAuthDeps> = {}): MicrosoftAuthDeps => ({
  getUserDataDir: () => { dirRequests++; return dir },
  isEncryptionAvailable: () => true,
  // Umkehrbar, aber kein Klartext: zeigt, dass alles durch encrypt/decrypt läuft. Keine echte Verschlüsselung.
  encrypt: (plain) => Buffer.from(`ENC:${Buffer.from(plain, 'utf8').toString('base64').split('').reverse().join('')}`),
  decrypt: (enc) => {
    const text = enc.toString()
    if (!text.startsWith('ENC:')) throw new Error('nicht entschlüsselbar')
    return Buffer.from(text.slice(4).split('').reverse().join(''), 'base64').toString('utf8')
  },
  openExternal: async (url) => { opened.push(url) },
  loadMsal: async () => msal,
  ...overrides
})
const ID = deriveMicrosoftAccountId(TENANT, OID)
const hang = (): { promise: Promise<void>; release: () => void } => {
  let release: () => void = () => undefined
  const promise = new Promise<void>(r => { release = r })
  return { promise, release }
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-msauth-'))
  opened = []
  dirRequests = 0
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('deriveMicrosoftAccountId', () => {
  it('ist für dieselbe Anmeldung auf jedem Gerät gleich und hat die reservierte Form', () => {
    expect(ID).toMatch(/^ms-[0-9a-f]{24}$/)
    expect(isMicrosoftAccountId(ID)).toBe(true)
    expect(deriveMicrosoftAccountId(TENANT.toUpperCase(), OID.toUpperCase())).toBe(ID)
    expect(ID).not.toContain(OID.slice(0, 8))
  })
  it('unterscheidet Nutzer und Mandanten', () => {
    expect(ID).not.toBe(deriveMicrosoftAccountId(TENANT, OID.replace('a', 'b')))
    expect(ID).not.toBe(deriveMicrosoftAccountId(TENANT.replace('1', '2'), OID))
  })
})

describe('classifyMicrosoftError', () => {
  it('erkennt fehlende Freigabe durch die Organisation', () => {
    expect(classifyMicrosoftError({ errorCode: 'access_denied', errorMessage: 'AADSTS90094: Admin consent is required' })).toBe('admin-consent-required')
    expect(classifyMicrosoftError(new Error('Need admin approval'))).toBe('admin-consent-required')
  })
  it('ein Abbruch bleibt ein Abbruch, auch mit access_denied (Codex F10)', () => {
    expect(classifyMicrosoftError({ errorCode: 'access_denied', errorMessage: 'user_cancelled' })).toBe('cancelled')
    expect(classifyMicrosoftError({ errorCode: 'user_canceled' })).toBe('cancelled')
  })
  it('hält abgelehnte Zustimmung, fehlende Zustimmung, Richtlinie und Neuanmeldung auseinander (Codex F10)', () => {
    expect(classifyMicrosoftError({ errorCode: 'access_denied', errorMessage: 'AADSTS65004: User declined to consent' })).toBe('consent-declined')
    expect(classifyMicrosoftError({ errorCode: 'access_denied', errorMessage: 'AADSTS53003: blocked by Conditional Access' })).toBe('access-denied')
    expect(classifyMicrosoftError({ errorCode: 'consent_required' })).toBe('consent-required')
    expect(classifyMicrosoftError({ errorCode: 'invalid_grant', errorMessage: 'AADSTS65001: not consented' })).toBe('consent-required')
    expect(classifyMicrosoftError({ errorCode: 'interaction_required' })).toBe('reauth-required')
    expect(classifyMicrosoftError({ errorCode: 'invalid_grant', errorMessage: 'AADSTS700082: The refresh token has expired' })).toBe('reauth-required')
    expect(classifyMicrosoftError({ errorCode: 'network_error' })).toBe('offline')
    expect(classifyMicrosoftError(Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }))).toBe('offline')
    expect(classifyMicrosoftError(new Error('irgendetwas'))).toBe('failed')
  })
  it('verwechselt AADSTS-Nummern nicht anhand eines gemeinsamen Anfangs', () => {
    expect(classifyMicrosoftError({ errorCode: 'x', errorMessage: 'AADSTS650049: etwas anderes' })).toBe('failed')
  })
  it('gibt fürs Log nur ein Codewort heraus, nie eine Nachricht (Codex F10)', () => {
    expect(errorCodeForLog({ errorCode: 'invalid_grant', errorMessage: 'erika@schule.example eyJhbGciOi' })).toBe('invalid_grant')
    expect(errorCodeForLog({ errorCode: 'erika@schule.example' })).toBe('(ohne Code)')
    expect(errorCodeForLog(new Error('eyJhbGciOiJ…'))).toBe('(ohne Code)')
  })
})

describe('createMicrosoftAuth — Anmeldung und Ablage', () => {
  it('fasst beim Anlegen keine Datei an und lädt nichts', () => {
    let loaded = false
    createMicrosoftAuth(makeDeps(fakeMsal(), { loadMsal: async () => { loaded = true; return fakeMsal() } }))
    expect(dirRequests).toBe(0)
    expect(loaded).toBe(false)
  })

  it('meldet an und bindet die Kontoart an die abgeleitete ID', async () => {
    const configs: Record<string, unknown>[] = []
    const requests: Record<string, unknown>[] = []
    const result = await createMicrosoftAuth(makeDeps(fakeMsal({ configs, requests }))).login()
    expect(result.accountId).toBe(ID)
    expect(result.username).toBe('erika@schule.example')
    expect(result.status).toMatchObject({ known: true, signedIn: true, fetchReady: true, sendReady: true })
    expect(opened).toHaveLength(1)
    expect(requests[0].scopes).toEqual(GRAPH_SCOPES)
    expect(requests[0].extraScopesToConsent).toEqual(IMAP_SCOPES)
    expect(configs[0].auth).toEqual({ clientId: DEFAULT_MICROSOFT_CLIENT_ID, authority: 'https://login.microsoftonline.com/organizations' })
  })

  it('legt alles im eigenen Unterordner ab, nichts im Klartext, nichts im Namensraum der Passwörter (Codex F01)', async () => {
    await createMicrosoftAuth(makeDeps(fakeMsal())).login()
    // Direkt im Profil liegt nur der Unterordner — keine email-*.enc, die der Passwort-IPC lesen könnte.
    expect(await fs.readdir(dir)).toEqual([MICROSOFT_AUTH_DIR])
    const files = await fs.readdir(authDir())
    expect(files.sort()).toEqual(['accounts.enc', expect.stringMatching(/^cache-[0-9a-f]{20}\.enc$/)])
    for (const f of files) {
      const content = (await fs.readFile(path.join(authDir(), f))).toString()
      expect(content.startsWith('ENC:')).toBe(true)
      for (const secret of ['erika@schule.example', 'GEHEIME-ERNEUERUNGSMARKE', OID, TENANT]) expect(content).not.toContain(secret)
      if (process.platform !== 'win32') expect((await fs.stat(path.join(authDir(), f))).mode & 0o077).toBe(0)
    }
    // Der Passwortpfad kann weder die Dateien noch das Konto adressieren.
    expect(() => emailCredentialFileName(ID)).toThrow()
    for (const guess of [`${MICROSOFT_AUTH_DIR}/accounts`, `x/../${MICROSOFT_AUTH_DIR}/accounts`, 'microsoft-auth\\accounts']) {
      expect(() => emailCredentialFileName(guess)).toThrow()
    }
  })

  it('gibt für den Abruf feste Verbindungsdaten und den Anmeldenamen aus der Anmeldung heraus', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    await auth.login()
    expect(await auth.getImapAuth(ID)).toEqual({ ...MICROSOFT_IMAP_ENDPOINT, user: 'erika@schule.example', accessToken: 'imap-marke-1111' })
    expect(await auth.getGraphToken(ID)).toEqual({ accessToken: 'graph-marke-1111', username: 'erika@schule.example', displayName: 'Erika Beispiel' })
  })

  it('übersteht einen Neustart: eine neue Instanz liest Bindung und Marken von der Platte', async () => {
    await createMicrosoftAuth(makeDeps(fakeMsal())).login()
    const second = createMicrosoftAuth(makeDeps(fakeMsal()))
    expect(await second.status(ID)).toMatchObject({ known: true, signedIn: true, fetchReady: true, sendReady: true })
    expect((await second.getImapAuth(ID)).accessToken).toBe('imap-marke-1111')
  })

  it('räumt Schreibreste eines abgestürzten Laufs weg (Codex F09)', async () => {
    await fs.mkdir(authDir(), { recursive: true })
    await fs.writeFile(path.join(authDir(), 'accounts.enc.4711.tmp'), 'halb geschrieben')
    await createMicrosoftAuth(makeDeps(fakeMsal())).login()
    expect((await fs.readdir(authDir())).some(f => f.endsWith('.tmp'))).toBe(false)
  })

  it('ohne sichere Ablage: keine Anmeldung, keine Datei, kein Browserfenster', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal(), { isEncryptionAvailable: () => false }))
    await expect(auth.login()).rejects.toMatchObject({ code: 'encryption-unavailable' })
    expect(opened).toHaveLength(0)
    expect(await fs.readdir(dir)).toEqual([])
  })

  it('verlangt die Objekt-ID aus der Anmeldung und speichert sonst nichts (Codex F07)', async () => {
    const removed: MsalAccount[] = []
    // MSAL hätte localAccountId hier aus `sub` gefüllt — je Anwendung verschieden, taugt nicht als Konto-ID.
    const msal = fakeMsal({ removed, signIn: () => account({ localAccountId: 'sub-je-anwendung-verschieden', idTokenClaims: { tid: TENANT } }) })
    const auth = createMicrosoftAuth(makeDeps(msal))
    await expect(auth.login()).rejects.toMatchObject({ code: 'failed' })
    expect(removed).toHaveLength(1)
    await expect(fs.readFile(bindingsPath())).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('meldet fehlende Freigabe der Organisation mit festem Code und ohne Kontodaten im Text', async () => {
    const msal = fakeMsal({ interactiveError: () => ({ errorCode: 'access_denied', errorMessage: 'AADSTS90094: erika@schule.example needs admin approval' }) })
    const error = await createMicrosoftAuth(makeDeps(msal)).login().catch(e => e)
    expect(error).toBeInstanceOf(MicrosoftAuthError)
    expect(error.code).toBe('admin-consent-required')
    expect(error.message).not.toContain('erika')
  })

  it('weist ungültige Anwendungs-ID und Mandanten ab, bevor irgendetwas geöffnet wird', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    await expect(auth.login({ clientId: 'keine-guid' })).rejects.toMatchObject({ code: 'invalid-config' })
    await expect(auth.login({ tenant: 'evil.example/oauth2/../x' })).rejects.toMatchObject({ code: 'invalid-config' })
    await expect(auth.login({ clientId: 42 as unknown as string })).resolves.toMatchObject({ accountId: ID })
    expect(opened).toHaveLength(1)
  })

  it('öffnet nur die Anmeldeseite genau dieses Antrags (Codex F13)', async () => {
    const good = (c: string, t: string): string => `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize?client_id=${c}&redirect_uri=${encodeURIComponent('http://localhost:5000')}`
    const bad: Array<(c: string, t: string) => string> = [
      () => 'https://login.microsoftonline.com.evil.example/organizations/oauth2/v2.0/authorize',
      (c, t) => good(c, t).replace('https://', 'http://'),
      (c, t) => good(c, t).replace('/authorize', '/logout'),
      (c) => good(c, 'anderer-mandant.example'),
      (_c, t) => good('99999999-8888-7777-6666-555555555555', t),
      (c, t) => good(c, t).replace(encodeURIComponent('http://localhost:5000'), encodeURIComponent('https://evil.example/cb')),
      () => 'keine adresse'
    ]
    for (const loginUrl of bad) {
      await expect(createMicrosoftAuth(makeDeps(fakeMsal({ loginUrl }))).login()).rejects.toBeInstanceOf(MicrosoftAuthError)
    }
    expect(opened).toHaveLength(0)
    await createMicrosoftAuth(makeDeps(fakeMsal({ loginUrl: good }))).login()
    expect(opened).toHaveLength(1)
  })
})

describe('createMicrosoftAuth — Kontoart, Abmelden, Fehlerzustände', () => {
  it('nach dem Abmelden gibt das Konto keine Marke mehr heraus, auch nicht nach Neustart', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    await auth.login()
    await auth.logout(ID)
    expect(await auth.status(ID)).toMatchObject({ known: true, signedIn: false, fetchReady: false, sendReady: false, errorCode: 'reauth-required' })
    await expect(auth.getImapAuth(ID)).rejects.toMatchObject({ code: 'reauth-required' })
    await expect(auth.getGraphToken(ID)).rejects.toMatchObject({ code: 'reauth-required' })
    await expect(createMicrosoftAuth(makeDeps(fakeMsal())).getImapAuth(ID)).rejects.toMatchObject({ code: 'reauth-required' })
  })

  it('erneute Anmeldung stellt das Konto unter derselben ID wieder her', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    await auth.login()
    await auth.logout(ID)
    expect((await auth.login()).accountId).toBe(ID)
    expect((await auth.getImapAuth(ID)).accessToken).toBe('imap-marke-1111')
  })

  it('ein laufender Markenabruf liefert nach dem Abmelden nichts mehr (Codex F06)', async () => {
    const gate = hang()
    let block = false
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ duringSilent: () => block ? gate.promise : Promise.resolve() })))
    await auth.login()
    block = true
    const pending = auth.getImapAuth(ID)
    const caught = pending.catch(e => e)
    await new Promise(r => setTimeout(r, 20))
    block = false
    await auth.logout(ID)
    gate.release()
    expect(await caught).toMatchObject({ code: 'reauth-required' })
  })

  it('Microsoft-ID ohne Ablage (neues Gerät): Anmeldung nötig, bleibt Microsoft-Konto (Codex F03)', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    expect(await auth.status(ID)).toEqual({ known: true, signedIn: false, fetchReady: false, sendReady: false, errorCode: 'reauth-required' })
    await expect(auth.getImapAuth(ID)).rejects.toMatchObject({ code: 'reauth-required' })
  })

  it('unlesbare Ablage: Fehler statt „unbekannt“, und die Anmeldung überschreibt sie nicht (Codex F03)', async () => {
    await createMicrosoftAuth(makeDeps(fakeMsal())).login()
    for (const damaged of [Buffer.from('kein gültiger Inhalt'), makeDeps(fakeMsal()).encrypt('{ kaputtes json'), makeDeps(fakeMsal()).encrypt('[1,2]')]) {
      await fs.writeFile(bindingsPath(), damaged)
      const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
      expect(await auth.status(ID)).toMatchObject({ known: true, signedIn: false, errorCode: 'storage-unreadable' })
      await expect(auth.getImapAuth(ID)).rejects.toMatchObject({ code: 'storage-unreadable' })
      await expect(auth.logout(ID)).rejects.toMatchObject({ code: 'storage-unreadable' })
      opened = []
      await expect(auth.login()).rejects.toMatchObject({ code: 'storage-unreadable' })
      expect(opened).toHaveLength(0)
      expect((await fs.readFile(bindingsPath())).equals(damaged)).toBe(true)
    }
  })

  it('ein einzelner untergeschobener oder beschädigter Eintrag macht die Ablage unlesbar — nichts wird still verworfen', async () => {
    const deps = makeDeps(fakeMsal())
    await fs.mkdir(authDir(), { recursive: true })
    const entry = { provider: 'microsoft', tenantId: TENANT, objectId: OID, username: 'x@example.org', homeAccountId: 'h', clientId: DEFAULT_MICROSOFT_CLIENT_ID, tenant: 'organizations', state: 'signed-in' }
    const other = deriveMicrosoftAccountId(TENANT, 'ffffffff-ffff-ffff-ffff-ffffffffffff')
    const cases: Record<string, unknown>[] = [
      { [ID]: entry, [other]: entry },                      // Eintrag unter fremder ID
      { [ID]: entry, 'email-1': entry },                    // Schlüssel ohne Microsoft-Form
      { [ID]: { ...entry, clientId: 'keine-guid' } },       // beschädigtes Feld
      { [ID]: null }
    ]
    for (const content of cases) {
      const bytes = deps.encrypt(JSON.stringify(content))
      await fs.writeFile(bindingsPath(), bytes)
      const auth = createMicrosoftAuth(deps)
      expect(await auth.status(ID)).toMatchObject({ known: true, signedIn: false, errorCode: 'storage-unreadable' })
      await expect(auth.login()).rejects.toMatchObject({ code: 'storage-unreadable' })
      expect((await fs.readFile(bindingsPath())).equals(bytes)).toBe(true)
    }
    // Gegenprobe: ein gültiger Eintrag wird gelesen.
    await fs.writeFile(bindingsPath(), deps.encrypt(JSON.stringify({ [ID]: entry })))
    expect((await createMicrosoftAuth(deps).status(ID)).username).toBe('x@example.org')
  })

  it('kennt nur IDs in Microsoft-Form — auch keine geerbten Objektschlüssel (Codex F12)', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    for (const id of ['email-1700000000000', '__proto__', 'constructor', 'toString', '', 'ms-kurz']) {
      expect(await auth.status(id)).toEqual({ known: false, signedIn: false, fetchReady: false, sendReady: false })
      await expect(auth.getImapAuth(id)).rejects.toMatchObject({ code: 'unknown-account' })
      await expect(auth.logout(id)).rejects.toMatchObject({ code: 'unknown-account' })
    }
    expect(dirRequests).toBe(0)
  })

  it('unterscheidet Abruf und Versand: fehlt die Zustimmung für IMAP, ist nur der Versand bereit', async () => {
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ silentError: (scopes) => scopes === IMAP_SCOPES ? { errorCode: 'consent_required' } : null })))
    const { status } = await auth.login()
    expect(status).toMatchObject({ signedIn: true, fetchReady: false, sendReady: true, errorCode: 'consent-required' })
    await expect(auth.getImapAuth(ID)).rejects.toMatchObject({ code: 'consent-required' })
    expect((await auth.getGraphToken(ID)).accessToken).toBe('graph-marke-1111')
  })

  it('wählt bei zwei Mandantenprofilen desselben Nutzers das der Bindung (Codex F05)', async () => {
    const guestTenant = '99999999-2222-3333-4444-555555555555'
    const guestOid = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'
    const guest = account({ tenantId: guestTenant, localAccountId: guestOid, idTokenClaims: { oid: guestOid, tid: guestTenant } })
    let next = guest
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ signIn: () => next })))
    const first = await auth.login()   // Gastprofil zuerst im Cache
    next = account()
    const second = await auth.login()  // Heimatprofil, gleiche homeAccountId
    expect(first.accountId).not.toBe(second.accountId)
    expect((await auth.getImapAuth(first.accountId)).accessToken).toBe('imap-marke-9999')
    expect((await auth.getImapAuth(second.accountId)).accessToken).toBe('imap-marke-1111')
  })

  it('Wechsel der Anwendungs-ID: Marken der alten Registrierung werden entfernt (Codex F04)', async () => {
    const removed: MsalAccount[] = []
    const configs: Record<string, unknown>[] = []
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ removed, configs })))
    await auth.login()
    const own = '99999999-8888-7777-6666-555555555555'
    const again = await auth.login({ clientId: own, tenant: 'schule.example' })
    expect(again.accountId).toBe(ID)
    expect(removed).toHaveLength(1)
    // Neustart: die Erneuerung nutzt die neue Registrierung
    const fresh: Record<string, unknown>[] = []
    await createMicrosoftAuth(makeDeps(fakeMsal({ configs: fresh }))).getImapAuth(ID)
    expect(fresh[0].auth).toEqual({ clientId: own, authority: 'https://login.microsoftonline.com/schule.example' })
  })
})

describe('createMicrosoftAuth — Abbruch und Zeitlimit (Codex F08)', () => {
  it('gibt nach dem Zeitlimit auf; kommt die Anmeldung später doch an, wird sie verworfen', async () => {
    const gate = hang()
    const removed: MsalAccount[] = []
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ beforeFinish: () => gate.promise, removed }), { loginTimeoutMs: 30 }))
    await expect(auth.login()).rejects.toMatchObject({ code: 'timeout' })
    gate.release()
    await new Promise(r => setTimeout(r, 40))
    expect(removed).toHaveLength(1)
    expect(await auth.status(ID)).toMatchObject({ signedIn: false, errorCode: 'reauth-required' })
    await expect(auth.getImapAuth(ID)).rejects.toMatchObject({ code: 'reauth-required' })
  })

  it('lässt sich abbrechen', async () => {
    const gate = hang()
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ beforeFinish: () => gate.promise })))
    const pending = auth.login().catch(e => e)
    await new Promise(r => setTimeout(r, 20))
    auth.cancelLogin()
    expect(await pending).toMatchObject({ code: 'cancelled' })
    gate.release()
  })

  it('eine zweite Anmeldung gibt die erste auf', async () => {
    const gate = hang()
    let first = true
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ beforeFinish: () => { if (first) { first = false; return gate.promise } return Promise.resolve() } })))
    const one = auth.login().catch(e => e)
    await new Promise(r => setTimeout(r, 20))
    const two = await auth.login()
    expect(await one).toMatchObject({ code: 'cancelled' })
    expect(two.accountId).toBe(ID)
    gate.release()
    await new Promise(r => setTimeout(r, 30))
    // die verspätete erste Anmeldung nimmt der zweiten das Konto nicht weg
    expect((await auth.getImapAuth(ID)).accessToken).toBe('imap-marke-1111')
  })
})

describe('createMicrosoftAuth — Befunde der zweiten Prüfrunde', () => {
  it('Abmeldung zwischen Bindungslesen und Markenabruf: keine Marke (Codex F15)', async () => {
    let armed = false
    let auth: ReturnType<typeof createMicrosoftAuth>
    const base = makeDeps(fakeMsal())
    const deps = makeDeps(fakeMsal(), {
      decrypt: (enc) => {
        // Genau während getImapAuth die Bindung liest, beginnt eine Abmeldung.
        if (armed) { armed = false; void auth.logout(ID).catch(() => undefined) }
        return base.decrypt(enc)
      }
    })
    auth = createMicrosoftAuth(deps)
    await auth.login()
    armed = true
    await expect(auth.getImapAuth(ID)).rejects.toMatchObject({ code: 'reauth-required' })
  })

  // Zeigt das gewünschte Verhalten, BEWEIST die Lücke aus F25 aber nicht: Mit dem nachgebauten
  // Client besteht der Test auch ohne die `claimed`-Sperre, weil dessen verspätetes Ergebnis erst
  // nach dem Bindungsschreiben ankommt. Das enge Zeitfenster lässt sich so nicht herstellen.
  it('verspätete aufgegebene Anmeldung nimmt der neuen das Konto nicht weg (Codex F25)', async () => {
    const gate = hang()
    let first = true
    let releaseOnBindingWrite = false
    const removed: MsalAccount[] = []
    const base = makeDeps(fakeMsal())
    const msal = fakeMsal({ removed, beforeFinish: () => { if (first) { first = false; return gate.promise } return Promise.resolve() } })
    const auth = createMicrosoftAuth(makeDeps(msal, {
      encrypt: (plain) => {
        // Anmeldung B schreibt gerade ihre Bindung: genau jetzt kommt A verspätet zurück.
        if (releaseOnBindingWrite && plain.includes('"provider"')) { releaseOnBindingWrite = false; gate.release() }
        return base.encrypt(plain)
      }
    }))
    const one = auth.login().catch(e => e)
    await new Promise(r => setTimeout(r, 20))
    releaseOnBindingWrite = true
    const two = await auth.login()
    expect(await one).toMatchObject({ code: 'cancelled' })
    await new Promise(r => setTimeout(r, 40))
    expect(removed).toHaveLength(0)
    expect(two.status).toMatchObject({ fetchReady: true, sendReady: true })
    expect((await auth.getImapAuth(ID)).accessToken).toBe('imap-marke-1111')
  })

  it('„Erneut anmelden“ mit einem anderen Konto bindet nichts und räumt das fremde Konto wieder weg (Codex F18)', async () => {
    const removed: MsalAccount[] = []
    const requests: Record<string, unknown>[] = []
    const otherOid = 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee'
    const other = account({ homeAccountId: `${otherOid}.${TENANT}`, localAccountId: otherOid, username: 'anna@schule.example', idTokenClaims: { oid: otherOid, tid: TENANT } })
    let next = account()
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ removed, requests, signIn: () => next })))
    await auth.login()
    next = other
    await expect(auth.login({ expectedAccountId: ID })).rejects.toMatchObject({ code: 'account-mismatch' })
    // Das Fenster war mit dem erwarteten Konto vorbelegt.
    expect(requests[1].loginHint).toBe('erika@schule.example')
    expect(removed.map(a => a.username)).toEqual(['anna@schule.example'])
    const otherId = deriveMicrosoftAccountId(TENANT, otherOid)
    expect(await auth.status(otherId)).toMatchObject({ signedIn: false, errorCode: 'reauth-required' })
    expect((await auth.status(otherId)).username).toBeUndefined()
    // Das eigentliche Konto ist unberührt.
    expect((await auth.getImapAuth(ID)).accessToken).toBe('imap-marke-1111')
  })

  it('„Erneut anmelden“ mit einem anderen, schon eingerichteten Konto lässt dieses angemeldet (Codex F18)', async () => {
    const removed: MsalAccount[] = []
    const otherOid = 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee'
    const other = account({ homeAccountId: `${otherOid}.${TENANT}`, localAccountId: otherOid, username: 'anna@schule.example', idTokenClaims: { oid: otherOid, tid: TENANT } })
    let next = account()
    const auth = createMicrosoftAuth(makeDeps(fakeMsal({ removed, signIn: () => next })))
    await auth.login()
    next = other
    const otherLogin = await auth.login()
    await expect(auth.login({ expectedAccountId: ID })).rejects.toMatchObject({ code: 'account-mismatch' })
    expect(removed).toHaveLength(0)
    expect(await auth.status(otherLogin.accountId)).toMatchObject({ signedIn: true, fetchReady: true })
  })

  it('scheitert das Aufräumen der alten Registrierung, bleibt das vermerkt und wird beim Abmelden nachgeholt (Codex F22)', async () => {
    const own = '99999999-8888-7777-6666-555555555555'
    let failOld = true
    const removed: MsalAccount[] = []
    const deps = makeDeps(fakeMsal({ removed, removeError: (clientId) => (failOld && clientId === DEFAULT_MICROSOFT_CLIENT_ID ? new Error('Platte voll') : null) }))
    const auth = createMicrosoftAuth(deps)
    await auth.login()
    await auth.login({ clientId: own, tenant: 'schule.example' })
    const read = async (): Promise<Record<string, { stale?: unknown[]; state: string }>> => JSON.parse(deps.decrypt(await fs.readFile(bindingsPath())))
    expect((await read())[ID].stale).toEqual([{ clientId: DEFAULT_MICROSOFT_CLIENT_ID, tenant: 'organizations' }])
    // Abmelden, solange das Entfernen weiter scheitert: abgemeldet, aber ehrlich gemeldet.
    await expect(auth.logout(ID)).rejects.toMatchObject({ code: 'failed' })
    expect((await read())[ID]).toMatchObject({ state: 'signed-out', stale: [{ clientId: DEFAULT_MICROSOFT_CLIENT_ID, tenant: 'organizations' }] })
    await expect(auth.getImapAuth(ID)).rejects.toMatchObject({ code: 'reauth-required' })
    // Zweiter Versuch gelingt: der Vermerk verschwindet.
    failOld = false
    await auth.logout(ID)
    expect((await read())[ID].stale).toBeUndefined()
    expect(removed.length).toBeGreaterThanOrEqual(1)
  })

  it('unlesbare Ablage lässt sich bewusst zurücksetzen; die Originaldatei bleibt unverändert erhalten (Codex F16)', async () => {
    await createMicrosoftAuth(makeDeps(fakeMsal())).login()
    const damaged = Buffer.from('nicht entschlüsselbar')
    await fs.writeFile(bindingsPath(), damaged)
    const auth = createMicrosoftAuth(makeDeps(fakeMsal()))
    expect(await auth.status(ID)).toMatchObject({ errorCode: 'storage-unreadable' })
    const { backupDir, movedFiles } = await auth.resetStorage()
    expect(backupDir).toMatch(/^zurueckgesetzt-/)
    expect(movedFiles).toBe(2)
    expect((await fs.readFile(path.join(authDir(), backupDir, 'accounts.enc'))).equals(damaged)).toBe(true)
    expect((await fs.readdir(authDir())).filter(n => n.endsWith('.enc'))).toEqual([])
    // Danach: kein Fehlerzustand mehr, sondern schlicht „Anmeldung nötig“ — und anmelden geht wieder.
    expect(await auth.status(ID)).toMatchObject({ known: true, signedIn: false, errorCode: 'reauth-required' })
    expect((await auth.login()).accountId).toBe(ID)
    expect((await auth.getImapAuth(ID)).accessToken).toBe('imap-marke-1111')
    // Die Sicherung wird beim nächsten Start nicht angefasst.
    await createMicrosoftAuth(makeDeps(fakeMsal())).status(ID)
    expect((await fs.readFile(path.join(authDir(), backupDir, 'accounts.enc'))).equals(damaged)).toBe(true)
  })

  it('Zurücksetzen ohne gespeicherte Anmeldung tut nichts', async () => {
    expect(await createMicrosoftAuth(makeDeps(fakeMsal())).resetStorage()).toEqual({ backupDir: '', movedFiles: 0 })
  })
})
