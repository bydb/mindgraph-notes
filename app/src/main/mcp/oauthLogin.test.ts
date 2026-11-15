// Abläufe der OAuth-Anmeldung mit nachgebautem Dienst. Belegen die App-Logik, NICHT das Verhalten
// von Plaud, Notion usw. (deren Metadaten sind in Messung 6.0b gemessen, die echte Anmeldung braucht
// ein Konto — Abschnitt 6.6).
import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import * as http from 'node:http'
import { createMcpOAuthLogin, discoverOAuth } from './oauthLogin'
import type { McpFetch } from './httpFetch'
import type { McpOAuthSpec } from '../../shared/mcpOAuth'

const MCP = 'https://svc.example/mcp'
const ENDPOINTS = { issuer: 'https://svc.example', authorizationEndpoint: 'https://svc.example/authorize', tokenEndpoint: 'https://svc.example/token', registrationEndpoint: 'https://svc.example/register' }
const SPEC: McpOAuthSpec = { endpoints: ENDPOINTS, resource: MCP, scopes: [] }

interface Log { requests: Array<{ url: string; body: string }>; opened: string[] }

function fakeService(log: Log, opts: { tokenResponses?: unknown[]; noClientId?: boolean } = {}): McpFetch {
  const tokens = [...(opts.tokenResponses ?? [{ access_token: 'A1', token_type: 'Bearer', expires_in: 3600, refresh_token: 'R1' }])]
  return async (input, init = {}) => {
    const url = String(input)
    log.requests.push({ url, body: String(init.body ?? '') })
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
    if (url === 'https://svc.example/register') return json(opts.noClientId ? {} : { client_id: 'CID' }, opts.noClientId ? 400 : 201)
    if (url === 'https://svc.example/token') return json(tokens.shift() ?? { error: 'invalid_grant' }, 200)
    return new Response('nope', { status: 404 })
  }
}

function getLocal(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http.get(url, res => { res.resume(); resolve(res.statusCode || 0) }).on('error', reject)
  })
}

async function setup(opts: Parameters<typeof fakeService>[1] & { callback?: (authUrl: URL) => string; extraCallback?: (authUrl: URL) => string; fetchWrap?: (f: McpFetch) => McpFetch } = {}) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-oauth-'))
  const log: Log = { requests: [], opened: [] }
  let clock = 1_000_000
  const login = createMcpOAuthLogin({
    getUserDataDir: () => dir,
    isEncryptionAvailable: () => true,
    encrypt: s => Buffer.from(`enc:${s}`),
    decrypt: b => b.toString().replace(/^enc:/, ''),
    fetch: opts.fetchWrap ? opts.fetchWrap(fakeService(log, opts)) : fakeService(log, opts),
    now: () => clock,
    loginTimeoutMs: 3000,
    openExternal: async (u: string) => {
      log.opened.push(u)
      const a = new URL(u)
      const target = opts.callback ? opts.callback(a) : `${a.searchParams.get('redirect_uri')}?code=CODE&state=${a.searchParams.get('state')}`
      if (opts.extraCallback) { const first = opts.extraCallback(a); setTimeout(() => { void getLocal(first).catch(() => undefined) }, 1) }
      setTimeout(() => { void getLocal(target).catch(() => undefined) }, 20)
    }
  })
  return { dir, log, login, tick: (ms: number) => { clock += ms } }
}

async function signIn(login: Awaited<ReturnType<typeof setup>>['login'], spec = SPEC) {
  const p = await login.login('svc', MCP, spec)
  await login.commit('svc', p)
  return p
}

describe('createMcpOAuthLogin', () => {
  it('registriert, öffnet nur die gebundene Anmeldeseite und tauscht den Code mit PKCE', async () => {
    const { log, login, dir } = await setup()
    const pending = await login.login('svc', MCP, SPEC)
    const { loginId } = pending
    // Vor `commit` liegt nichts in der Ablage (Codex F34).
    await expect(fs.access(path.join(dir, 'mcp-auth', 'svc.oauth.enc'))).rejects.toThrow()
    await login.commit('svc', pending)
    expect(loginId).toMatch(/^[A-Za-z0-9_-]{16}$/)
    expect(log.opened).toHaveLength(1)
    const opened = new URL(log.opened[0])
    expect(opened.origin + opened.pathname).toBe('https://svc.example/authorize')
    expect(opened.searchParams.get('code_challenge_method')).toBe('S256')
    expect(opened.searchParams.get('resource')).toBe(MCP)
    const tokenReq = log.requests.find(r => r.url.endsWith('/token'))!
    const body = new URLSearchParams(tokenReq.body)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('CODE')
    expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43,}$/)
    expect(body.get('resource')).toBe(MCP)
    // Jeder Abruf ging an das Origin des Servers.
    expect(log.requests.every(r => new URL(r.url).origin === 'https://svc.example')).toBe(true)
    const file = path.join(dir, 'mcp-auth', 'svc.oauth.enc')
    expect((await fs.readFile(file)).toString()).toMatch(/^enc:/)
    expect(await login.getToken('svc', MCP, { ...SPEC, loginId })).toBe('A1')
  })

  it('gibt keine Marke für eine andere Anmeldung oder andere Endpunkte', async () => {
    const { login } = await setup()
    const { loginId } = await signIn(login)
    await expect(login.getToken('svc', MCP, { ...SPEC, loginId: 'other' })).rejects.toThrow(/neu anmelden/)
    await expect(login.getToken('svc', MCP, { ...SPEC, loginId, endpoints: { ...ENDPOINTS, tokenEndpoint: 'https://svc.example/t2' } })).rejects.toThrow(/neu anmelden/)
  })

  it('erneuert eine abgelaufene Marke und behält die Anmeldung', async () => {
    const { login, tick, log } = await setup({ tokenResponses: [
      { access_token: 'A1', expires_in: 60, refresh_token: 'R1' },
      { access_token: 'A2', expires_in: 3600 }
    ] })
    const { loginId } = await signIn(login)
    tick(120_000)
    expect(await login.getToken('svc', MCP, { ...SPEC, loginId })).toBe('A2')
    const refresh = new URLSearchParams(log.requests.filter(r => r.url.endsWith('/token'))[1].body)
    expect(refresh.get('grant_type')).toBe('refresh_token')
    expect(refresh.get('refresh_token')).toBe('R1')
    expect(await login.getToken('svc', MCP, { ...SPEC, loginId })).toBe('A2')
  })

  it('abgelehntes Erneuern heißt neu anmelden', async () => {
    const { login, tick } = await setup({ tokenResponses: [{ access_token: 'A1', expires_in: 60, refresh_token: 'R1' }, { error: 'invalid_client' }] })
    const { loginId } = await signIn(login)
    tick(120_000)
    await expect(login.getToken('svc', MCP, { ...SPEC, loginId })).rejects.toThrow(/neu anmelden/)
  })

  it('nur falscher state im Rückruf: keine Marke, Anmeldung endet erst an der Frist', async () => {
    const { login, log } = await setup({ callback: a => `${a.searchParams.get('redirect_uri')}?code=CODE&state=falsch` })
    await expect(login.login('svc', MCP, SPEC)).rejects.toThrow(/Zeitüberschreitung/)
    expect(log.requests.some(r => r.url.endsWith('/token'))).toBe(false)
  })

  it('ein fremder Rückruf mit falschem state bricht die Anmeldung NICHT ab (F36)', async () => {
    const { login } = await setup({ extraCallback: a => `${a.searchParams.get('redirect_uri')}?error=access_denied&state=fremd` })
    const { loginId } = await signIn(login)
    expect(await login.getToken('svc', MCP, { ...SPEC, loginId })).toBe('A1')
  })

  it('Abbrechen während der Registrierung öffnet keinen Browser (F35)', async () => {
    let release: () => void = () => undefined
    const { login, log } = await setup({ fetchWrap: f => async (u, i) => {
      if (String(u).endsWith('/register')) await new Promise<void>(r => { release = r })
      return f(u, i)
    } })
    const run = login.login('svc', MCP, SPEC)
    await new Promise(r => setTimeout(r, 10))
    login.cancelLogin()
    release()
    await expect(run).rejects.toThrow(/abgebrochen/)
    expect(log.opened).toHaveLength(0)
  })

  it('Abmelden während des Erneuerns gibt keine Marke heraus (F38)', async () => {
    let release: () => void = () => undefined
    let hold = false
    const { login, tick } = await setup({
      tokenResponses: [{ access_token: 'A1', expires_in: 60, refresh_token: 'R1' }, { access_token: 'A2', expires_in: 3600 }],
      fetchWrap: f => async (u, i) => {
        if (hold && String(u).endsWith('/token')) await new Promise<void>(r => { release = r })
        return f(u, i)
      }
    })
    const { loginId } = await signIn(login)
    tick(120_000)
    hold = true
    const t = login.getToken('svc', MCP, { ...SPEC, loginId })
    await new Promise(r => setTimeout(r, 10))
    await login.logout('svc')
    release()
    await expect(t).rejects.toThrow(/neu verbinden/)
  })

  it('Abbrechen nach dem Browser, vor dem Speichern, speichert nichts (F42)', async () => {
    const { login, dir } = await setup()
    const p = await login.login('svc', MCP, SPEC)
    login.cancelLogin()
    expect(login.cancelledSince(p)).toBe(true)
    await expect(login.commit('svc', p)).rejects.toThrow(/abgebrochen/)
    await expect(fs.access(path.join(dir, 'mcp-auth', 'svc.oauth.enc'))).rejects.toThrow()
  })

  it('Abbruch während des Schreibens stellt die alte Anmeldung wieder her (F43)', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-oauth-'))
    let cancel: () => void = () => undefined
    let armed = false
    const login = createMcpOAuthLogin({
      getUserDataDir: () => dir, isEncryptionAvailable: () => true,
      // Das Verschlüsseln liegt im Schreibweg: hier „klickt“ der Nutzer auf Abbrechen.
      encrypt: str => { if (armed) cancel(); return Buffer.from(`enc:${str}`) },
      decrypt: b => b.toString().replace(/^enc:/, ''),
      fetch: fakeService({ requests: [], opened: [] }, { tokenResponses: [{ access_token: 'A1' }, { access_token: 'A2' }] }),
      loginTimeoutMs: 3000,
      openExternal: async (u: string) => { const a = new URL(u); setTimeout(() => { void getLocal(`${a.searchParams.get('redirect_uri')}?code=C&state=${a.searchParams.get('state')}`).catch(() => undefined) }, 5) }
    })
    cancel = () => login.cancelLogin()
    const first = await login.login('svc', MCP, SPEC)
    await login.commit('svc', first)
    const second = await login.login('svc', MCP, SPEC)
    armed = true
    await expect(login.commit('svc', second)).rejects.toThrow(/abgebrochen/)
    armed = false
    expect(await login.getToken('svc', MCP, { ...SPEC, loginId: first.loginId })).toBe('A1')
  })

  it('ohne Registrierung kein Browser', async () => {
    const { login, log } = await setup({ noClientId: true })
    await expect(login.login('svc', MCP, SPEC)).rejects.toThrow(/Registrierung/)
    expect(log.opened).toHaveLength(0)
  })

  it('lehnt eine Spezifikation mit fremden Endpunkten schon vor dem Netz ab', async () => {
    const { login, log } = await setup()
    await expect(login.login('svc', MCP, { ...SPEC, endpoints: { ...ENDPOINTS, tokenEndpoint: 'https://evil.example/token' } })).rejects.toThrow(/liegt nicht/)
    expect(log.requests).toHaveLength(0)
  })

  it('Abmelden löscht die Ablage', async () => {
    const { login } = await setup()
    const { loginId } = await signIn(login)
    await login.logout('svc')
    await expect(login.getToken('svc', MCP, { ...SPEC, loginId })).rejects.toThrow(/anmelden/)
    expect((await login.status('svc')).signedIn).toBe(false)
  })
})

describe('discoverOAuth', () => {
  const meta = (over: Record<string, unknown> = {}) => ({
    issuer: 'https://svc.example', authorization_endpoint: 'https://svc.example/authorize', token_endpoint: 'https://svc.example/token',
    registration_endpoint: 'https://svc.example/register', code_challenge_methods_supported: ['S256'], ...over
  })
  const fetchFrom = (routes: Record<string, unknown>, log: string[] = []): McpFetch => async input => {
    const u = String(input)
    log.push(u)
    return u in routes ? new Response(JSON.stringify(routes[u]), { status: 200 }) : new Response('', { status: 404 })
  }
  it('folgt den Schutz-Metadaten zum Anmeldeserver auf demselben Origin', async () => {
    const r = await discoverOAuth(MCP, fetchFrom({
      'https://svc.example/.well-known/oauth-protected-resource/mcp': { resource: MCP, authorization_servers: ['https://svc.example'] },
      'https://svc.example/.well-known/oauth-authorization-server': meta()
    }))
    expect(r.endpoints.tokenEndpoint).toBe('https://svc.example/token')
  })
  it('ohne Schutz-Metadaten: Anmeldeserver am Origin (wie Atlassian)', async () => {
    const r = await discoverOAuth(MCP, fetchFrom({ 'https://svc.example/.well-known/oauth-authorization-server': meta() }))
    expect(r.endpoints.issuer).toBe('https://svc.example')
  })
  it('folgt KEINEM Verweis auf einen fremden Anmeldeserver (F20)', async () => {
    const log: string[] = []
    await expect(discoverOAuth(MCP, fetchFrom({
      'https://svc.example/.well-known/oauth-protected-resource/mcp': { resource: MCP, authorization_servers: ['https://evil.example'] }
    }, log))).rejects.toThrow(/andere Adresse/)
    expect(log.every(u => u.startsWith('https://svc.example/'))).toBe(true)
  })
  it('lehnt fremde Endpunkte in den Metadaten ab', async () => {
    await expect(discoverOAuth(MCP, fetchFrom({ 'https://svc.example/.well-known/oauth-authorization-server': meta({ token_endpoint: 'https://evil.example/token' }) }))).rejects.toThrow(/andere Adresse/)
  })
  it('ohne Metadaten: Klartext statt Raten', async () => {
    await expect(discoverOAuth(MCP, fetchFrom({}))).rejects.toThrow(/keine Anmeldung nach dem MCP-Standard/)
  })
  it('nur https', async () => {
    await expect(discoverOAuth('http://svc.example/mcp', fetchFrom({}))).rejects.toThrow(/https/)
  })
})
