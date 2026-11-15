import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs, realpathSync } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import http from 'node:http'
import { createMcpStore, normalizeStdioInput, normalizeHttpInput, type SecretBox } from './store'
import { openMcpSession, stdioStartBlocker } from './client'
import { createMcpFetch, assertMcpUrlAllowed } from './httpFetch'
import { toolDefinitionHash } from './store'
import { prepareMcpForRun, closeMcpForRun, revokeActiveMcpSessions } from './agentTools'

const box: SecretBox = {
  available: () => true,
  encrypt: s => Buffer.from(`x${s}`),
  decrypt: b => b.toString().slice(1)
}

// Minimaler MCP-Server über stdio, ohne Abhängigkeiten (läuft so auch in der Sandbox).
// Werkzeuge: list_items (liest eine Datei im Vault, falls lesbar), change_tools (meldet eine
// geänderte Werkzeugliste), read_home (versucht ~/.zshrc zu lesen).
const SERVER_JS = `
const fs = require('fs'); const os = require('os'); const path = require('path')
let buf = ''
const send = m => process.stdout.write(JSON.stringify(m) + '\\n')
const tools = [
  { name: 'list_items', description: 'Listet Einträge', inputSchema: { type: 'object', properties: { file: { type: 'string' }, top: { type: 'integer' } } } },
  { name: 'change_tools', description: 'Ändert die Liste', inputSchema: { type: 'object', properties: {} } },
  { name: 'read_home', description: 'Liest Home', inputSchema: { type: 'object', properties: {} } }
]
process.stdin.on('data', d => {
  buf += d
  let i
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1)
    if (!line.trim()) continue
    const m = JSON.parse(line)
    if (m.method === 'initialize') send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'fixture', version: '1' } } })
    else if (m.method === 'tools/list') send({ jsonrpc: '2.0', id: m.id, result: m.params && m.params.cursor ? { tools: [tools[2]] } : { tools: tools.slice(0, 2), nextCursor: 'p2' } })
    else if (m.method === 'tools/call') {
      const a = m.params.arguments || {}
      if (m.params.name === 'list_items') {
        let text
        try { text = fs.readFileSync(a.file, 'utf8') } catch (e) { text = 'ERR ' + e.code }
        send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: text + ' top=' + a.top }] } })
      } else if (m.params.name === 'change_tools') {
        send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'ok' }] } })
        send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })
      } else {
        let text
        try { fs.readFileSync(path.join(os.homedir(), '.zshrc')); text = 'GELESEN' } catch (e) { text = e.code }
        send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text }] } })
      }
    } else if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, result: {} })
  }
})
`

const onMac = process.platform === 'darwin'

describe.skipIf(!onMac)('stdio-Server in der Sandbox', () => {
  let base: string
  let store: ReturnType<typeof createMcpStore>
  const node = realpathSync(process.execPath)

  beforeAll(async () => {
    base = realpathSync(await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-client-')))
    await fs.mkdir(path.join(base, 'program'))
    await fs.mkdir(path.join(base, 'vault', '.mindgraph'), { recursive: true })
    await fs.writeFile(path.join(base, 'program', 'server.cjs'), SERVER_JS)
    await fs.writeFile(path.join(base, 'vault', 'Lieferant.md'), 'Lieferzeit 14 Tage')
    await fs.writeFile(path.join(base, 'vault', '.mindgraph', 'emails.json'), 'geheim')
    store = createMcpStore(path.join(base, 'userdata'), box)
  })
  afterAll(async () => { await fs.rm(base, { recursive: true, force: true }) })

  async function addServer(extra: Partial<Parameters<typeof normalizeStdioInput>[0]> = {}) {
    const { spec, fileHashes } = await normalizeStdioInput({ label: 'Fixture', command: node, script: path.join(base, 'program', 'server.cjs'), vaultRead: true, ...extra })
    return store.put({ label: 'Fixture', transport: 'stdio', stdio: spec }, fileHashes)
  }

  it('verbindet, holt alle Seiten der Werkzeugliste und ruft auf', async () => {
    const cfg = await addServer()
    const s = await openMcpSession(cfg, store, { vaultPath: path.join(base, 'vault') })
    try {
      expect(s.tools.map(t => t.name)).toEqual(['list_items', 'change_tools', 'read_home'])
      const ok = await s.call('list_items', { file: path.join(base, 'vault', 'Lieferant.md'), top: 5 })
      expect(ok.content?.[0]?.text).toBe('Lieferzeit 14 Tage top=5')
      const mg = await s.call('list_items', { file: path.join(base, 'vault', '.mindgraph', 'emails.json') })
      expect(mg.content?.[0]?.text).toMatch(/^ERR EPERM/)
      const home = await s.call('read_home', {})
      expect(home.content?.[0]?.text).toMatch(/EPERM|ENOENT/)
    } finally {
      await s.close()
    }
  })

  it('meldet eine geänderte Werkzeugliste und sperrt weitere Aufrufe (E23)', async () => {
    const cfg = await addServer()
    const s = await openMcpSession(cfg, store, { vaultPath: path.join(base, 'vault') })
    const reasons: string[] = []
    s.onInvalidated(r => reasons.push(r))
    try {
      // Antwort und Listenänderung kommen direkt hintereinander. Trifft die Meldung vor dem Ende
      // des Aufrufs ein, ist schon diese Antwort gesperrt (F14) — beides ist richtig.
      await s.call('change_tools', {}).catch(e => expect(String(e)).toMatch(/Werkzeuge geändert/))
      await new Promise(r => setTimeout(r, 100))
      expect(reasons[0]).toMatch(/Werkzeuge geändert/)
      await expect(s.call('list_items', {})).rejects.toThrow(/Werkzeuge geändert/)
    } finally {
      await s.close()
    }
  })

  it('startet nicht, wenn sich das Skript seit der Freigabe geändert hat (E22)', async () => {
    const cfg = await addServer()
    await fs.appendFile(path.join(base, 'program', 'server.cjs'), '\n// geändert\n')
    expect(await stdioStartBlocker(cfg)).toMatch(/server\.cjs/)
    await expect(openMcpSession(cfg, store)).rejects.toThrow(/geändert/)
  })

  it('lehnt Auflöser wie npx ab', async () => {
    await expect(normalizeStdioInput({ label: 'x', command: '/usr/bin/env' })).rejects.toThrow(/nicht erlaubt/)
  })
})

describe('Freigaben hängen an der Bindung (E16)', () => {
  it('OAuth: neue Anmeldung setzt Freigaben zurück, Rücknahme stellt den alten Stand her (F41)', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-oauth-'))
    try {
      const store = createMcpStore(dir, box)
      const oauth = { endpoints: { issuer: 'https://svc.example', authorizationEndpoint: 'https://svc.example/authorize', tokenEndpoint: 'https://svc.example/token', registrationEndpoint: 'https://svc.example/register' }, resource: 'https://svc.example/mcp', scopes: [], loginId: 'L1' }
      const a = await store.put({ label: 'Svc', transport: 'http', http: normalizeHttpInput({ label: 'Svc', url: 'https://svc.example/mcp', oauth }), catalogId: 'notion', personalData: true })
      const approved = await store.setToolApproval(a.id, a.bindingHash, 'search', 'h1')
      const next = await store.put({ id: a.id, label: 'Svc', transport: 'http', http: { ...approved.http!, oauth: { ...oauth, loginId: 'L2' } }, catalogId: 'notion', personalData: true }, undefined, undefined, approved.bindingHash)
      expect(next.approvedTools).toEqual({})
      await store.restore(approved, next.bindingHash)
      const back = await store.get(a.id)
      expect(back?.http?.oauth?.loginId).toBe('L1')
      expect(Object.keys(back?.approvedTools ?? {})).toEqual(['search'])
      // Rücknahme nur auf dem Stand, den der Aufrufer selbst geschrieben hat.
      await expect(store.restore(approved, 'anderer-stand')).rejects.toThrow(/geändert/)
      // Umbenennen behält die Freigabe, verwirft aber die gespeicherte Größe (F47).
      const sized = await store.setToolApproval(a.id, (await store.get(a.id))!.bindingHash, 'search', 'h1', 500)
      expect(sized.approvedTools.search.tokens).toBe(500)
      const renamed = await store.put({ id: a.id, label: 'Svc neu', transport: 'http', http: sized.http!, catalogId: 'notion', personalData: true })
      expect(renamed.approvedTools.search).toEqual({ definitionHash: 'h1' })
      // Der Renderer kann `oauth` mit fremden Endpunkten nicht unterschieben.
      expect(() => normalizeHttpInput({ label: 'x', url: 'https://svc.example/mcp', oauth: { ...oauth, endpoints: { ...oauth.endpoints, tokenEndpoint: 'https://evil.example/token' } } })).toThrow(/liegt nicht/)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('verwirft Freigaben, wenn sich der Kontext ändert, behält sie sonst', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-store-'))
    try {
      const store = createMcpStore(dir, box)
      const http1 = normalizeHttpInput({ label: 'ERP', url: 'https://erp.example/mcp', headers: { Company: 'A' }, secretHeaders: { Authorization: 'Bearer x' } })
      const a = await store.put({ label: 'ERP', transport: 'http', http: http1 })
      await store.setToolApproval(a.id, a.bindingHash, 'List_X', 'h1')
      const same = await store.put({ id: a.id, label: 'ERP neu', transport: 'http', http: http1 })
      expect(Object.keys(same.approvedTools)).toEqual(['List_X'])
      const other = await store.put({ id: a.id, label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: 'https://erp.example/mcp', headers: { Company: 'B' }, secretHeaders: { Authorization: '' } }) })
      expect(other.approvedTools).toEqual({})
      await expect(store.setToolApproval(a.id, a.bindingHash, 'List_X', 'h1')).rejects.toThrow(/geändert/)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('ändert nichts, wenn die Geheimnisse nicht geschrieben werden können (F21)', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-tx-'))
    try {
      let encryption = true
      const flaky: SecretBox = { available: () => encryption, encrypt: s => Buffer.from(`x${s}`), decrypt: b => b.toString().slice(1) }
      const store = createMcpStore(dir, flaky)
      const a = await store.put({ label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: 'https://a.example/mcp', secretHeaders: { Authorization: 'x' } }) }, undefined, { Authorization: 'Bearer A' })
      encryption = false
      await expect(store.put({ id: a.id, label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: 'https://b.example/mcp', secretHeaders: { Authorization: 'x' } }) }, undefined, { Authorization: 'Bearer B' }, a.bindingHash)).rejects.toThrow(/Verschlüsselter Speicher/)
      encryption = true
      expect((await store.get(a.id))?.http?.url).toBe('https://a.example/mcp')
      expect(await store.loadSecrets(a.id)).toEqual({ Authorization: 'Bearer A' })
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('lehnt eine zweite, parallel bestätigte Änderung ab (F22)', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-race-'))
    try {
      const store = createMcpStore(dir, box)
      const a = await store.put({ label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: 'https://a.example/mcp' }) })
      const toB = store.put({ id: a.id, label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: 'https://b.example/mcp' }) }, undefined, undefined, a.bindingHash)
      const toC = store.put({ id: a.id, label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: 'https://c.example/mcp' }) }, undefined, undefined, a.bindingHash)
      await expect(toB).resolves.toBeTruthy()
      await expect(toC).rejects.toThrow(/inzwischen geändert/)
      expect((await store.get(a.id))?.http?.url).toBe('https://b.example/mcp')
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('verlangt für Business Central alle vier Kontextangaben', () => {
    expect(() => normalizeHttpInput({ label: 'BC', url: 'https://mcp.businesscentral.dynamics.com', headers: { TenantId: 't', EnvironmentName: 'e' }, profile: 'business-central' })).toThrow(/Company, ConfigurationName/)
  })
  it('legt Geheimnisse verschlüsselt ab und gibt sie nur im Main heraus', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-sec-'))
    try {
      const store = createMcpStore(dir, box)
      await store.saveSecrets('erp', { Authorization: 'Bearer geheim' })
      expect(await store.loadSecrets('erp')).toEqual({ Authorization: 'Bearer geheim' })
      expect(await store.loadSecrets('../erp')).toEqual({})
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('HTTP-Netzweg (E13′)', () => {
  let server: http.Server
  let origin: string
  let rotations = 0
  beforeAll(async () => {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')
    const { z } = await import('zod')
    server = http.createServer(async (req, res) => {
      if (req.url === '/redirect') { res.writeHead(302, { Location: '/mcp' }); res.end(); return }
      if (req.url === '/big') { res.writeHead(200); res.end(Buffer.alloc(3000)); return }
      // Sitzungswechsel: jede Antwort trägt eine neue Mcp-Session-Id (E23, F08).
      if (req.url === '/rotating') res.setHeader('mcp-session-id', `s-${++rotations}`)
      if (req.headers.authorization !== 'Bearer geheim' && req.headers.authorization !== 'Bearer ms-marke') { res.writeHead(401); res.end(); return }
      const mcp = new McpServer({ name: 'http-fixture', version: '1' })
      mcp.registerTool('List_Customers_PAG30009', { description: 'Kunden', inputSchema: { top: z.number().int().optional() } }, async ({ top }) => ({ content: [{ type: 'text', text: `Kunde A, Kunde B (top=${top})` }] }))
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      res.on('close', () => { void transport.close(); void mcp.close() })
      await mcp.connect(transport)
      let body = ''
      req.on('data', d => { body += d })
      req.on('end', () => {
        const parsed = body ? JSON.parse(body) : undefined
        // Wechsel erst mit der Antwort auf einen Werkzeugaufruf (F14): vorher feste Kennung.
        if (req.url === '/rotate-on-call') res.setHeader('mcp-session-id', parsed?.method === 'tools/call' ? 'neu' : 'alt')
        void transport.handleRequest(req, res, parsed)
      })
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(async () => { await new Promise(r => server.close(r)) })

  it('lehnt http und Adressen im eigenen Netz ohne Freigabe ab', () => {
    expect(() => assertMcpUrlAllowed(`${origin}/mcp`)).toThrow(/https/)
    expect(() => assertMcpUrlAllowed('https://127.0.0.1/mcp')).toThrow(/eigenen Netz/)
    expect(() => assertMcpUrlAllowed('https://user:pw@erp.example/mcp')).toThrow(/Zugangsdaten/)
    expect(assertMcpUrlAllowed(`${origin}/mcp`, origin).origin).toBe(origin)
  })
  it('folgt keiner Weiterleitung', async () => {
    const f = createMcpFetch({ approvedPrivateOrigin: origin })
    await expect(f(`${origin}/redirect`, { method: 'POST', body: '{}' })).rejects.toThrow(/leitet weiter/)
  })
  it('bricht übergroße Antworten ab', async () => {
    const f = createMcpFetch({ approvedPrivateOrigin: origin, maxBytes: 1000 })
    const res = await f(`${origin}/big`)
    await expect(res.arrayBuffer()).rejects.toThrow()
  })
  it('sperrt den Server, wenn er mitten im Lauf eine neue Sitzung beginnt (F08)', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-rot-'))
    try {
      const store = createMcpStore(dir, box)
      const cfg = await store.put({ label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: `${origin}/rotating`, approvedPrivateOrigin: origin, secretHeaders: { Authorization: 'x' } }) })
      await store.saveSecrets(cfg.id, { Authorization: 'Bearer geheim' })
      const s = await openMcpSession(cfg, store)
      const reasons: string[] = []
      s.onInvalidated(r => reasons.push(r))
      try {
        await expect(s.call('List_Customers_PAG30009', {})).rejects.toThrow(/neue Sitzung/)
        expect(reasons[0]).toMatch(/neue Sitzung/)
      } finally {
        await s.close()
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('lässt die Antwort nicht durch, mit der die Sitzung wechselt (F14)', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-rot2-'))
    try {
      const store = createMcpStore(dir, box)
      const cfg = await store.put({ label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: `${origin}/rotate-on-call`, approvedPrivateOrigin: origin, secretHeaders: { Authorization: 'x' } }) })
      await store.saveSecrets(cfg.id, { Authorization: 'Bearer geheim' })
      const s = await openMcpSession(cfg, store)
      try {
        expect(s.tools.map(t => t.name)).toEqual(['List_Customers_PAG30009'])
        await expect(s.call('List_Customers_PAG30009', { top: 3 })).rejects.toThrow(/neue Sitzung/)
      } finally {
        await s.close()
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('sperrt laufende Verbindungen, wenn ein weiterer Vault dazukommt (F17)', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-rev-'))
    try {
      const store = createMcpStore(dir, box)
      const cfg = await store.put({ label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: `${origin}/mcp`, approvedPrivateOrigin: origin, secretHeaders: { Authorization: 'x' } }) }, undefined, { Authorization: 'Bearer geheim' })
      const probe = await openMcpSession(cfg, store)
      for (const t of probe.tools) await store.setToolApproval(cfg.id, cfg.bindingHash, t.name, toolDefinitionHash(t))
      await probe.close()
      const state = await prepareMcpForRun({ serverIds: [cfg.id], store, vaultPath: dir })
      const tool = [...state.tools.values()][0]
      const ctx = { senderId: 1, run: { runId: 'r1', abort: new AbortController() } } as never
      expect((await tool.run({ top: 3 }, ctx)).ok).toBe(true)
      await revokeActiveMcpSessions('Ein weiterer Vault wurde geöffnet')
      const after = await tool.run({ top: 3 }, ctx)
      expect(after.ok).toBe(false)
      expect(after.content).toMatch(/weiterer Vault/)
      await closeMcpForRun(state)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('bricht einen Start ab, wenn währenddessen ein Vault dazukommt (F20)', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-rev2-'))
    try {
      const store = createMcpStore(dir, box)
      const cfg = await store.put({ label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: `${origin}/mcp`, approvedPrivateOrigin: origin, secretHeaders: { Authorization: 'x' } }) }, undefined, { Authorization: 'Bearer geheim' })
      const probe = await openMcpSession(cfg, store)
      for (const t of probe.tools) await store.setToolApproval(cfg.id, cfg.bindingHash, t.name, toolDefinitionHash(t))
      await probe.close()
      const starting = prepareMcpForRun({ serverIds: [cfg.id], store, vaultPath: dir })
      await revokeActiveMcpSessions('Ein weiterer Vault wurde geöffnet')
      await expect(starting).rejects.toThrow(/Start abgebrochen/)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('startet keine Verbindung mehr, wenn der Widerruf vor dem Verbinden kommt (F23)', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-rev3-'))
    try {
      const base = createMcpStore(dir, box)
      const cfg = await base.put({ label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: `${origin}/mcp`, approvedPrivateOrigin: origin, secretHeaders: { Authorization: 'x' } }) }, undefined, { Authorization: 'Bearer geheim' })
      const probe = await openMcpSession(cfg, base)
      for (const t of probe.tools) await base.setToolApproval(cfg.id, cfg.bindingHash, t.name, toolDefinitionHash(t))
      await probe.close()
      // Langsames Lesen der Ablage: der Widerruf kommt, bevor der Start die Konfiguration hat.
      let release: () => void = () => undefined
      const gate = new Promise<void>(r => { release = r })
      let connects = 0
      const slow = { ...base, get: async (id: string) => { await gate; return base.get(id) }, loadSecrets: async (id: string) => { connects++; return base.loadSecrets(id) } } as typeof base
      const starting = prepareMcpForRun({ serverIds: [cfg.id], store: slow, vaultPath: dir })
      await revokeActiveMcpSessions('Ein weiterer Vault wurde geöffnet')
      release()
      await expect(starting).rejects.toThrow(/Start abgebrochen/)
      expect(connects).toBe(0)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('setzt bei Microsoft-Anmeldung die Marke und prüft den Mandanten (Abschnitt 5)', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-msc-'))
    try {
      const store = createMcpStore(dir, box)
      const TENANT = '11111111-2222-3333-4444-555555555555'
      const spec = normalizeHttpInput({ label: 'BC', url: `${origin}/mcp`, approvedPrivateOrigin: origin, headers: { TenantId: TENANT, EnvironmentName: 'Sandbox', Company: 'CRONUS', ConfigurationName: 'Nurlesen' }, profile: 'business-central', microsoft: {} })
      // Ohne Anmeldung kein Start.
      const unsigned = await store.put({ label: 'BC', transport: 'http', http: spec, profile: 'business-central' })
      await expect(openMcpSession(unsigned, store, { getMicrosoftToken: async () => 'ms-marke' })).rejects.toThrow(/mit Microsoft anmelden/)
      // Angemeldet, passender Mandant → Bearer-Marke trägt.
      const signed = await store.put({ id: unsigned.id, label: 'BC', transport: 'http', http: { ...spec, microsoft: { ...spec.microsoft!, account: { tenantId: TENANT, objectId: 'o', username: 'erp@firma.example' } } }, profile: 'business-central' })
      expect(signed.bindingHash).not.toBe(unsigned.bindingHash)
      const s = await openMcpSession(signed, store, { getMicrosoftToken: async () => 'ms-marke' })
      expect(s.tools.map(t => t.name)).toEqual(['List_Customers_PAG30009'])
      await s.close()
      // Anderer Mandant in der Kopfzeile als in der Anmeldung → kein Start.
      const other = { ...signed, http: { ...signed.http!, headers: { ...signed.http!.headers, TenantId: '99999999-2222-3333-4444-555555555555' } } }
      await expect(openMcpSession(other, store, { getMicrosoftToken: async () => 'ms-marke' })).rejects.toThrow(/TenantId passt nicht/)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
  it('lässt mit Microsoft-Anmeldung keine eigene Authorization-Kopfzeile zu', () => {
    expect(() => normalizeHttpInput({ label: 'BC', url: 'https://x.example/mcp', secretHeaders: { Authorization: 'x' }, microsoft: {} })).toThrow(/Authorization/)
  })
  it('spricht über den eigenen Netzweg mit einem echten SDK-Server', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'mg-mcp-http-'))
    try {
      const store = createMcpStore(dir, box)
      const cfg = await store.put({ label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: `${origin}/mcp`, approvedPrivateOrigin: origin, secretHeaders: { Authorization: 'x' } }) })
      await store.saveSecrets(cfg.id, { Authorization: 'Bearer geheim' })
      const s = await openMcpSession(cfg, store)
      try {
        expect(s.tools.map(t => t.name)).toEqual(['List_Customers_PAG30009'])
        const r = await s.call('List_Customers_PAG30009', { top: 3 })
        expect(r.content?.[0]?.text).toBe('Kunde A, Kunde B (top=3)')
      } finally {
        await s.close()
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
