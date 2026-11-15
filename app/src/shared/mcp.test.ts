import { describe, it, expect } from 'vitest'
import {
  agentToolName, isValidServerId, serverIdFromLabel, canonicalJson, toolDefinitionMaterial, bindingMaterial,
  toolBlockedReason, BC_READ_TOOL_PATTERN, missingBusinessCentralHeaders, capPageSizeArgs, modelDescription,
  mcpResultToText, mergeForeignData, foreignDataConflict, wrapForeignResult
} from './mcp'

describe('Namen', () => {
  it('bildet mcp__server__werkzeug und lehnt Unzulässiges ab', () => {
    expect(agentToolName('erp', 'List_Customers_PAG30009')).toBe('mcp__erp__List_Customers_PAG30009')
    expect(agentToolName('erp', 'list customers')).toBeNull()
    expect(agentToolName('erp', 'liste.kunden')).toBeNull()
    expect(agentToolName('Erp', 'x')).toBeNull()
    expect(agentToolName('erp', 'x'.repeat(60))).toBeNull()
  })
  it('leitet Server-Kennungen ab', () => {
    expect(serverIdFromLabel('Business Central Testfirma')).toBe('business-central-testfir')
    expect(serverIdFromLabel('Übersicht ÄÖ')).toBe('uebersicht-aeoe')
    expect(serverIdFromLabel('!!!')).toBe('server')
    expect(isValidServerId(serverIdFromLabel('Mein Vault-Server'))).toBe(true)
  })
})

describe('Prüfsummen-Grundlage', () => {
  it('ist unabhängig von der Schlüsselreihenfolge', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] } })).toBe(canonicalJson({ a: { c: [3, { e: 2, f: 1 }], d: 2 }, b: 1 }))
  })
  it('ändert sich mit der Beschreibung eines Werkzeugs', () => {
    const a = toolDefinitionMaterial({ name: 't', description: 'liest', inputSchema: { type: 'object' } })
    const b = toolDefinitionMaterial({ name: 't', description: 'liest und löscht', inputSchema: { type: 'object' } })
    expect(a).not.toBe(b)
  })
  it('bindet HTTP-Freigaben an Adresse und Kontext, nicht an Geheimnisse', () => {
    const base = { transport: 'http' as const, http: { url: 'https://x.example/mcp', secretHeaderNames: ['Authorization'], headers: { Company: 'A' } } }
    const other = { ...base, http: { ...base.http, headers: { Company: 'B' } } }
    expect(bindingMaterial(base)).not.toBe(bindingMaterial(other))
  })
  it('bindet stdio-Freigaben an Dateiprüfsummen', () => {
    const cfg = { transport: 'stdio' as const, stdio: { command: '/bin/node', script: '/s/index.js', args: [], programDir: '/s', extraReadPaths: [], vaultRead: false, network: false, fullAccess: false } }
    expect(bindingMaterial(cfg, { '/s/index.js': 'aa' })).not.toBe(bindingMaterial(cfg, { '/s/index.js': 'bb' }))
  })
})

describe('Freigaberegeln', () => {
  it('sperrt Werkzeuge mit beliebiger Wirkung bei jedem Server (F01)', () => {
    expect(toolBlockedReason('erp', { name: 'bc_actions_invoke' })).toMatch(/beliebige/)
    expect(toolBlockedReason('vault', { name: 'read_file' })).toBeNull()
  })
  it('lässt bei Business Central nur das dokumentierte Lesemuster zu (F11)', () => {
    const bc = (name: string, inputSchema?: unknown) => toolBlockedReason('erp', { name, inputSchema }, 'business-central')
    expect(bc('List_Customers_PAG30009')).toBeNull()
    expect(bc('List_SalesInvoices_QRY123')).toBeNull()
    expect(bc('Get_Customers_PAG30009')).toMatch(/Lesemuster/)
    expect(bc('Create_Customer_PAG30009')).toMatch(/Lesemuster/)
    expect(bc('List_Customers')).toMatch(/Lesemuster/)
    expect(bc('List_Customers_PAG30009', { properties: { company: { type: 'string' } } })).toMatch(/Firma/)
    expect(BC_READ_TOOL_PATTERN.test('List_Customers_PAG30009_extra')).toBe(false)
  })
  it('verlangt alle vier Business-Central-Kopfzeilen (F18)', () => {
    expect(missingBusinessCentralHeaders({ TenantId: 't', EnvironmentName: 'e', Company: ' ', ConfigurationName: 'c' })).toEqual(['Company'])
  })
})

describe('Aufruf vorbereiten', () => {
  const schema = { properties: { top: { type: 'integer' }, filter: { type: 'string' }, limit: { type: 'string' } } }
  it('deckelt Seitengrößen und setzt fehlende', () => {
    expect(capPageSizeArgs({ top: 5000, filter: 'x' }, schema, 50)).toEqual({ args: { top: 50, filter: 'x' }, capped: ['top'] })
    expect(capPageSizeArgs({}, schema, 50)).toEqual({ args: { top: 50 }, capped: ['top'] })
    expect(capPageSizeArgs({ top: 10 }, schema, 50)).toEqual({ args: { top: 10 }, capped: [] })
  })
  it('deckelt auch verschachtelte, als Text oder per $ref beschriebene Seitengrößen (F07, F12)', () => {
    expect(capPageSizeArgs({ options: { limit: 100000 } }, { properties: { options: { type: 'object' } } }, 50))
      .toEqual({ args: { options: { limit: 50 } }, capped: ['options.limit'] })
    expect(capPageSizeArgs({ top: '9999' }, { properties: { top: { $ref: '#/$defs/n' } } }, 50))
      .toEqual({ args: { top: '50' }, capped: ['top'] })
    expect(capPageSizeArgs({ limit: '1e6' }, {}, 50)).toEqual({ args: { limit: '50' }, capped: ['limit'] })
    expect(capPageSizeArgs({ limit: 0 }, {}, 50)).toEqual({ args: { limit: 50 }, capped: ['limit'] })
    expect(capPageSizeArgs({ top: null }, {}, 50)).toEqual({ args: { top: 50 }, capped: ['top'] })
  })
  it('lehnt unlesbare Mengenwerte und zu tiefe Argumente ab (F12)', () => {
    expect(() => capPageSizeArgs({ limit: 'alle' }, {}, 50)).toThrow(/keinen lesbaren Zahlenwert/)
    let deep: Record<string, unknown> = { limit: 100000 }
    for (let i = 0; i < 10; i++) deep = { x: deep }
    expect(() => capPageSizeArgs(deep, {}, 50)).toThrow(/zu tief/)
  })
  it('lässt mehrdeutige Fachwerte wie count, first und size unverändert (F13)', () => {
    expect(capPageSizeArgs({ filter: { count: 0 }, first: 1000, size: 99999 }, {}, 50))
      .toEqual({ args: { filter: { count: 0 }, first: 1000, size: 99999 }, capped: [] })
  })
  it('kürzt Beschreibungen sichtbar', () => {
    expect(modelDescription('a'.repeat(700), 600)).toMatch(/\[Beschreibung gekürzt\]$/)
    expect(modelDescription(' kurz ')).toBe('kurz')
  })
})

describe('Ergebnis umwandeln (F10)', () => {
  it('übernimmt Text, verwirft Bilder mit Vermerk', () => {
    const r = mcpResultToText({ content: [{ type: 'text', text: 'Kunde A' }, { type: 'image', data: 'x' }] })
    expect(r.ok).toBe(true)
    expect(r.text).toContain('Kunde A')
    expect(r.text).toContain('1× image weggelassen')
  })
  it('nimmt structuredContent, wenn kein Text da ist', () => {
    const r = mcpResultToText({ content: [], structuredContent: { umsatz: 4711 } })
    expect(r.text).toContain('4711')
  })
  it('meldet isError als Fehler', () => {
    expect(mcpResultToText({ content: [{ type: 'text', text: 'kaputt' }], isError: true }).ok).toBe(false)
  })
  it('kürzt sichtbar', () => {
    const r = mcpResultToText({ content: [{ type: 'text', text: 'x'.repeat(200) }] }, 100)
    expect(r.truncated).toBe(true)
    expect(r.text).toMatch(/\[gekürzt/)
  })
  it('kennzeichnet fremde Ergebnisse als Daten', () => {
    expect(wrapForeignResult('ERP', 'List_X', 'Inhalt')).toMatch(/DATEN aus einem fremden System/)
  })
})

describe('Herkunft (E19)', () => {
  it('vereinigt monoton und behält den ersten Lauf', () => {
    const a = mergeForeignData(undefined, ['erp'], 'run-1')
    const b = mergeForeignData(a, [], 'run-2')
    const c = mergeForeignData(b, ['vault'], 'run-3')
    expect(b).toEqual({ servers: ['erp'], firstRunId: 'run-1' })
    expect(c).toEqual({ servers: ['erp', 'vault'], firstRunId: 'run-1' })
    expect(mergeForeignData(undefined, [], 'run-1')).toBeUndefined()
  })
  it('merkt sich den Stand je Server beim Aufruf, monoton und fail-closed (F40)', () => {
    const a = mergeForeignData(undefined, ['plaud'], 'r1', { id: 'plaud', label: 'Plaud', personal: true, binding: 'b1' })
    expect(a?.sources?.plaud).toEqual({ label: 'Plaud', personal: true, binding: 'b1' })
    // Später derselbe Server ohne Merkmal: bleibt Personendaten.
    const b = mergeForeignData(a, ['plaud'], 'r2', { id: 'plaud', label: 'Plaud', personal: false, binding: 'b1' })
    expect(b?.sources?.plaud.personal).toBe(true)
    // Andere Bindung unter derselben Kennung: als Personendaten und „geändert“ markiert.
    const c = mergeForeignData(undefined, ['x'], 'r1', { id: 'x', label: 'X', personal: false, binding: 'b1' })
    const d = mergeForeignData(c, ['x'], 'r2', { id: 'x', label: 'X', personal: false, binding: 'b2' })
    expect(d?.sources?.x).toEqual({ label: 'X', personal: true, binding: 'changed' })
    // Ohne Quelle bleibt die alte Form erhalten.
    expect(mergeForeignData(undefined, ['erp'], 'r1')).toEqual({ servers: ['erp'], firstRunId: 'r1' })
  })
  it('sperrt Shell, Web und Rechner-Steuerung bei Fremddaten', () => {
    expect(foreignDataConflict({ hasForeign: true, shell: true })).toMatch(/Shell-Zugriff ist/)
    expect(foreignDataConflict({ hasForeign: true, web: true, computer: true })).toMatch(/sind/)
    expect(foreignDataConflict({ hasForeign: false, shell: true })).toBeNull()
    expect(foreignDataConflict({ hasForeign: true })).toBeNull()
  })
})

import { mcpRunGate } from './mcp'

describe('Laufstart (E5, E9′, E17′)', () => {
  it('verlangt das eingeschaltete Modul', () => {
    expect(mcpRunGate({ requested: ['erp'], moduleEnabled: false })).toMatchObject({ ok: false, error: expect.stringMatching(/nicht eingeschaltet/) })
    expect(mcpRunGate({ requested: [], moduleEnabled: false })).toEqual({ ok: true, serverIds: [], hasForeign: false })
  })
  it('sperrt Shell, Web und Rechner-Steuerung mit gewählten Servern', () => {
    expect(mcpRunGate({ requested: ['erp'], moduleEnabled: true, shell: true })).toMatchObject({ ok: false })
    expect(mcpRunGate({ requested: ['erp'], moduleEnabled: true, web: true })).toMatchObject({ ok: false })
    expect(mcpRunGate({ requested: ['erp', 'erp'], moduleEnabled: true })).toEqual({ ok: true, serverIds: ['erp'], hasForeign: true })
  })
  it('sperrt sie auch im Folgeauftrag ohne Server, wenn die Kette Fremddaten hat (F15, F16)', () => {
    const inherited = { servers: ['erp'], firstRunId: 'run-1' }
    expect(mcpRunGate({ requested: [], moduleEnabled: true, inherited, shell: true })).toMatchObject({ ok: false, error: expect.stringMatching(/Folgeaufträgen/) })
    expect(mcpRunGate({ requested: [], moduleEnabled: false, inherited })).toEqual({ ok: true, serverIds: [], hasForeign: true })
  })
  it('lässt im Folgeauftrag nur dieselben oder weniger Server zu', () => {
    expect(mcpRunGate({ requested: ['erp', 'crm'], moduleEnabled: true, prevServers: ['erp'] })).toMatchObject({ ok: false, error: expect.stringMatching(/crm/) })
    expect(mcpRunGate({ requested: ['erp'], moduleEnabled: true, prevServers: ['erp', 'crm'] })).toMatchObject({ ok: true })
  })
  it('lehnt unzulässige Kennungen ab', () => {
    expect(mcpRunGate({ requested: ['../x'], moduleEnabled: true })).toMatchObject({ ok: false })
  })
})
