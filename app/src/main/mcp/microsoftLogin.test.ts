// Tests mit nachgebauter MSAL-Bibliothek — sie belegen die Abläufe der App, NICHT das Verhalten
// von Microsoft oder Business Central (das braucht den Testzugang, Abschnitt 5).
import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import { createMcpMicrosoftLogin, resolveLoginConfig, assertLoginUrl, BC_SCOPES } from './microsoftLogin'
import type { MsalModule } from '../email/microsoftAuth'

const TENANT = '11111111-2222-3333-4444-555555555555'
const OID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function fakeMsal(log: { interactive: Array<Record<string, unknown>>; silent: Array<Record<string, unknown>> }, opts: { badUrl?: boolean; silentFails?: boolean } = {}): MsalModule {
  let cacheText = ''
  return {
    PublicClientApplication: class {
      private plugin: { beforeCacheAccess: (c: unknown) => Promise<void>; afterCacheAccess: (c: unknown) => Promise<void> }
      constructor(cfg: Record<string, unknown>) {
        this.plugin = ((cfg.cache as Record<string, unknown>).cachePlugin) as typeof this.plugin
      }
      private async touch(changed: boolean, value?: string) {
        const ctx = { cacheHasChanged: changed, tokenCache: { serialize: () => value ?? cacheText, deserialize: (c: string) => { cacheText = c } } }
        await this.plugin.beforeCacheAccess(ctx)
        if (changed && value !== undefined) cacheText = value
        await this.plugin.afterCacheAccess(ctx)
      }
      async acquireTokenInteractive(req: Record<string, unknown>) {
        log.interactive.push(req)
        const url = opts.badUrl
          ? 'https://evil.example/authorize'
          : `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=d947240f-13dd-4d80-b361-fc0183daf530&redirect_uri=http%3A%2F%2Flocalhost%3A51234`
        await (req.openBrowser as (u: string) => Promise<void>)(url)
        await this.touch(true, 'CACHE-1')
        return { accessToken: 'tok-1', account: { homeAccountId: 'home-1', tenantId: TENANT, localAccountId: OID, username: 'erp@firma.example' }, idTokenClaims: { oid: OID, tid: TENANT } }
      }
      async acquireTokenSilent(req: Record<string, unknown>) {
        log.silent.push(req)
        if (opts.silentFails) throw Object.assign(new Error('interaction_required'), { errorCode: 'interaction_required' })
        await this.touch(true, 'CACHE-2')
        return { accessToken: 'tok-2', account: req.account }
      }
      getTokenCache() {
        return {
          getAllAccounts: async () => (cacheText ? [{ homeAccountId: 'home-1', tenantId: TENANT, localAccountId: OID, username: 'erp@firma.example' }] : []),
          removeAccount: async () => undefined
        }
      }
    } as unknown as MsalModule['PublicClientApplication']
  }
}

async function setup(opts: { badUrl?: boolean; silentFails?: boolean } = {}) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-ms-'))
  const log = { interactive: [] as Array<Record<string, unknown>>, silent: [] as Array<Record<string, unknown>>, opened: [] as string[] }
  const msal = fakeMsal(log, opts)
  const login = createMcpMicrosoftLogin({
    getUserDataDir: () => dir,
    isEncryptionAvailable: () => true,
    encrypt: s => Buffer.from(`enc:${s}`),
    decrypt: b => b.toString().slice(4),
    openExternal: async url => { log.opened.push(url) },
    loadMsal: async () => msal
  })
  return { dir, log, login }
}

describe('Microsoft-Anmeldung für MCP-Server (Abschnitt 5)', () => {
  it('meldet an, legt die Anmeldung verschlüsselt je Server ab und liefert danach still eine Marke', async () => {
    const { dir, log, login } = await setup()
    try {
      const account = await login.login('bc-test')
      expect(account).toEqual({ tenantId: TENANT, objectId: OID, username: 'erp@firma.example' })
      expect(log.interactive[0].scopes).toEqual(BC_SCOPES)
      expect(log.opened).toHaveLength(1)
      const raw = await fs.readFile(path.join(dir, 'mcp-auth', 'bc-test.enc'), 'utf8')
      expect(raw.startsWith('enc:')).toBe(true)
      expect(await login.getToken('bc-test', account)).toBe('tok-2')
      expect(log.silent[0].scopes).toEqual(BC_SCOPES)
      // Getrennt von den Mail-Konten: nichts unter microsoft-auth/.
      await expect(fs.stat(path.join(dir, 'microsoft-auth'))).rejects.toThrow()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('gibt keine Marke für ein anderes Konto als das der Bindung heraus', async () => {
    const { dir, login } = await setup()
    try {
      await login.login('bc-test')
      await expect(login.getToken('bc-test', { tenantId: TENANT, objectId: '00000000-0000-0000-0000-000000000000', username: 'x' })).rejects.toThrow(/anderen Konto/)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('verlangt nach dem Abmelden eine neue Anmeldung', async () => {
    const { dir, login } = await setup()
    try {
      await login.login('bc-test')
      await login.logout('bc-test')
      await expect(login.getToken('bc-test')).rejects.toThrow()
      expect((await login.status('bc-test')).signedIn).toBe(false)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('öffnet keine fremde Anmeldeseite', async () => {
    const { dir, log, login } = await setup({ badUrl: true })
    try {
      await expect(login.login('bc-test')).rejects.toThrow(/Anmeldeadresse/)
      expect(log.opened).toHaveLength(0)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('meldet eine abgelaufene Anmeldung als neue Anmeldung nötig', async () => {
    const { dir, login } = await setup({ silentFails: true })
    try {
      await login.login('bc-test')
      await expect(login.getToken('bc-test')).rejects.toMatchObject({ code: expect.any(String) })
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('lehnt unzulässige Konfiguration und Server-Kennungen ab', async () => {
    expect(() => resolveLoginConfig({ tenant: 'consumers' })).toThrow()
    expect(() => resolveLoginConfig({ clientId: 'keine-guid' })).toThrow()
    expect(resolveLoginConfig().tenant).toBe('organizations')
    expect(() => assertLoginUrl('https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=x&redirect_uri=https%3A%2F%2Fevil.example', 'x', 'organizations')).toThrow()
    const { dir, login } = await setup()
    try {
      await expect(login.login('../mail')).rejects.toThrow()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
