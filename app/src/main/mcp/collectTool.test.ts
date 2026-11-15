// Tabellen-Weg: mcp_collect blättert ein Listenwerkzeug selbst durch und legt einen Datensatz an.
// Geprüft wird das Blättern (Verweis, volle Seite, Ende), jede Seite als eigener Aufruf im
// Protokoll, Herkunft vor dem Aufruf, und dass „unvollständig“ nie still passiert.
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp', getName: () => 'x', getVersion: () => '0', isPackaged: false }, net: { fetch: vi.fn() }, BrowserWindow: { getAllWindows: () => [] } }))

import { makeCollectTool, type McpRunState } from './agentTools'
import type { McpServerConfig } from '../../shared/mcp'
import type { NoteAgentContext } from '../noteAgent/skills'

const ROWS = Array.from({ length: 123 }, (_, i) => ({ number: `PO-${30001 + i}`, amount: i + 0.5 }))
const SCHEMA = { type: 'object', properties: { filter: { type: 'string' }, top: { type: 'number' }, skip: { type: 'number' } } }

function setup(opts: { schema?: Record<string, unknown>; respond?: (args: Record<string, unknown>, n: number) => { text: string; isError?: boolean } } = {}) {
  const calls: Array<Record<string, unknown>> = []
  const respond = opts.respond ?? ((args: Record<string, unknown>) => {
    const skip = Number(args.skip ?? 0)
    const top = Number(args.top ?? 50)
    const page = ROWS.slice(skip, skip + top)
    return { text: JSON.stringify({ value: page, ...(skip + top < ROWS.length ? { '@odata.nextLink': `skip=${skip + top}` } : {}) }) }
  })
  const session = {
    serverId: 'erp', label: 'ERP', tools: [],
    call: vi.fn(async (_name: string, args: Record<string, unknown>) => {
      calls.push(args)
      const r = respond(args, calls.length)
      return { content: [{ type: 'text', text: r.text }], isError: r.isError }
    }),
    onInvalidated: () => {}, close: async () => {}
  }
  const cfg = { id: 'erp', label: 'ERP', bindingHash: 'h', personalData: true } as unknown as McpServerConfig
  const def = { name: 'List_PurchaseOrders_PAG30066', inputSchema: opts.schema ?? SCHEMA }
  const state = {
    servers: [], sessions: [], tools: new Map(), helperTools: new Map(), blocked: new Map(), skipped: [], calls: [],
    targets: new Map([['mcp__erp__List_PurchaseOrders_PAG30066', { session, cfg, def }]])
  } as unknown as McpRunState
  const steps: string[] = []
  const run = { runId: 'r1', datasets: new Map(), sources: new Set<string>(), abort: new AbortController(), foreignData: undefined as unknown }
  const ctx = { senderId: 1, run, onStep: (_s: string, m: string) => steps.push(m) } as unknown as NoteAgentContext
  return { tool: makeCollectTool(state), ctx, run, calls, state, steps }
}

describe('mcp_collect', () => {
  it('blättert über alle Seiten, setzt die Seitengröße selbst und legt einen Datensatz an', async () => {
    const { tool, ctx, run, calls, state } = setup()
    const res = await tool.run({ tool: 'mcp__erp__List_PurchaseOrders_PAG30066', arguments: { filter: "status eq 'Open'" } }, ctx)
    expect(res.ok).toBe(true)
    expect(calls.map(c => [c.top, c.skip])).toEqual([[50, undefined], [50, 50], [50, 100]])
    expect(calls.every(c => c.filter === "status eq 'Open'")).toBe(true)
    const ds = run.datasets.get('tabelle1')
    expect(ds.rows).toHaveLength(123)
    expect(ds.columns).toEqual(['number', 'amount'])
    expect(ds.foreign).toEqual({ label: 'ERP' })
    expect(ds.files[0].status).toBe('ok')
    expect(state.calls).toHaveLength(3)
    expect(res.content).toMatch(/Datensatz "tabelle1" angelegt: 123 Zeilen aus 3 Seiten/)
    expect(res.content).toMatch(/Vollständig/)
    expect(res.content).toMatch(/DATEN aus einem fremden System/)
    // Nur Beispielzeilen gehen an das Modell, nicht die Liste.
    expect(res.content).not.toContain('PO-30100')
    expect(run.foreignData).toBeTruthy()
  })

  it('ohne Verweis: volle Seite → weiter, kürzere Seite → Ende', async () => {
    const { tool, ctx, run, calls } = setup({
      respond: args => ({ text: JSON.stringify({ value: ROWS.slice(Number(args.skip ?? 0), Number(args.skip ?? 0) + 50) }) })
    })
    await tool.run({ tool: 'mcp__erp__List_PurchaseOrders_PAG30066' }, ctx)
    expect(calls).toHaveLength(3)
    expect(run.datasets.get('tabelle1').rows).toHaveLength(123)
  })

  it('weitere Seiten, aber kein Blätter-Parameter → laut unvollständig', async () => {
    const { tool, ctx, run } = setup({
      schema: { type: 'object', properties: { filter: { type: 'string' } } },
      respond: () => ({ text: JSON.stringify({ value: ROWS.slice(0, 50), '@odata.nextLink': 'https://x/?$skiptoken=a' }) })
    })
    const res = await tool.run({ tool: 'mcp__erp__List_PurchaseOrders_PAG30066' }, ctx)
    expect(res.content).toMatch(/ACHTUNG UNVOLLSTÄNDIG: .*keinen Parameter zum Blättern/)
    expect(run.datasets.get('tabelle1').files[0].status).toBe('teilweise')
  })

  it('max_rows: Obergrenze erreicht wird gemeldet', async () => {
    const { tool, ctx, run } = setup()
    const res = await tool.run({ tool: 'mcp__erp__List_PurchaseOrders_PAG30066', max_rows: 60 }, ctx)
    expect(run.datasets.get('tabelle1').rows).toHaveLength(60)
    expect(res.content).toMatch(/UNVOLLSTÄNDIG: Obergrenze von 60 Zeilen/)
  })

  it('Fehler auf Seite 2: Datensatz mit dem Bisherigen, als unvollständig', async () => {
    const { tool, ctx, run } = setup({
      respond: (args, n) => (n === 2 ? { text: 'Zeitüberschreitung', isError: true } : { text: JSON.stringify({ value: ROWS.slice(0, 50), '@odata.nextLink': 'skip=50' }) })
    })
    const res = await tool.run({ tool: 'mcp__erp__List_PurchaseOrders_PAG30066' }, ctx)
    expect(run.datasets.get('tabelle1').rows).toHaveLength(50)
    expect(res.content).toMatch(/UNVOLLSTÄNDIG: Fehler auf Seite 2/)
  })

  it('keine Liste auf Seite 1 → Fehler ohne Datensatz', async () => {
    const { tool, ctx, run } = setup({ respond: () => ({ text: 'Bestellung PO-1: offen' }) })
    const res = await tool.run({ tool: 'mcp__erp__List_PurchaseOrders_PAG30066' }, ctx)
    expect(res.ok).toBe(false)
    expect(run.datasets.size).toBe(0)
  })

  it('unbekanntes Werkzeug und gesperrter Server', async () => {
    const a = setup()
    expect((await a.tool.run({ tool: 'mcp__erp__Delete_All' }, a.ctx)).content).toMatch(/gibt es in diesem Lauf nicht/)
    const b = setup()
    b.state.blocked.set('erp', 'Liste geändert')
    expect((await b.tool.run({ tool: 'mcp__erp__List_PurchaseOrders_PAG30066' }, b.ctx)).content).toMatch(/gesperrt/)
    expect(b.calls).toHaveLength(0)
  })

  it('ein Verweis, der nicht vorwärts zeigt, führt nicht in eine Endlosschleife', async () => {
    const { tool, ctx, calls } = setup({
      respond: args => {
        const skip = Number(args.skip ?? 0)
        return { text: JSON.stringify({ value: ROWS.slice(skip, skip + 50), ...(skip + 50 < ROWS.length ? { '@odata.nextLink': 'skip=0' } : {}) }) }
      }
    })
    await tool.run({ tool: 'mcp__erp__List_PurchaseOrders_PAG30066' }, ctx)
    expect(calls.map(c => c.skip)).toEqual([undefined, 50, 100])
  })
})
