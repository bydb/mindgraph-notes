// ERP in realistischer Größe über MCP (Messung vor einem „Tabellen-Weg“, 15.11.2026): Trägt der
// heutige Weg — Zeilen laufen als Werkzeugergebnis durch den Modellkontext — bei typischen
// ERP-Fragen? Wo bricht er (Kürzung bei 40 000 Zeichen, Seitengröße 50, Kontext 65 536)?
//
// Läuft NUR auf ausdrücklichen Wunsch gegen ein echtes lokales Modell (Ollama):
//
//   MINDGRAPH_MCP_EVAL=1 EVAL_MODEL=qwen3.8:27b-mlx EVAL_REPS=3 [EVAL_QUESTIONS=q1,q3] \
//     EVAL_OUT=/pfad/erp.jsonl npx vitest run src/main/mcp/eval/mcpErpScale.live.test.ts
//
// Cloud über LLMBase: zusätzlich EVAL_BACKEND=llmbase LLMBASE_API_KEY=… EVAL_MODEL=deepseek/deepseek-v4.1-flash
//
// Aufbau wie mcpEval.live.test.ts (echte Ablage, Freigaben, Verbindung, Werkzeugansicht, Loop),
// aber ein erfundenes ERP mit 300 Lieferanten und 500 Bestellungen à 30 Feldern, deterministisch aus
// einem festen Startwert erzeugt. Die Werkzeuge ahmen das Business-Central-Muster nach (List_…_PAG…,
// OData-artige Parameter filter/select/top/skip, Seiten mit nextLink). Die richtigen Antworten
// rechnet der Test selbst aus den Daten; gewertet wird die Ergebnisnotiz ohne Modell als Richter.
import { describe, it, vi, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import * as http from 'node:http'
import * as os from 'os'
import * as path from 'path'

function httpFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: init.method ?? 'GET', headers: init.headers, signal: init.signal }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c as Buffer))
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 500, headers: res.headers as Record<string, string> })))
      res.on('error', reject)
    })
    req.on('error', reject)
    if (init.body) req.write(init.body)
    req.end()
  })
}

vi.mock('electron', () => ({
  // https (Cloud-Modell, Katalog) über das echte fetch, das lokale Test-ERP über http.
  net: { fetch: (url: string, init: never) => (url.startsWith('https:') ? fetch(url, init) : httpFetch(url, init)) },
  app: { getPath: () => os.tmpdir(), getName: () => 'mindgraph-eval', getVersion: () => '0.0.0', isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] }
}))

import { runNoteAgentLoop } from '../../noteAgent/loop'
import type { AgentRun } from '../../noteAgent/runRegistry'
import { createMcpStore, normalizeHttpInput, toolDefinitionHash } from '../store'
import { openMcpSession } from '../client'
import { prepareMcpForRun, closeMcpForRun, mcpProvenance } from '../agentTools'

const ENABLED = process.env.MINDGRAPH_MCP_EVAL === '1'
const MODEL = process.env.EVAL_MODEL ?? 'qwen3.8:27b-mlx'
// EVAL_BACKEND=llmbase: Cloud über LLMBase, Schlüssel aus LLMBASE_API_KEY; wie in der App mit
// maxTokens 8192 (index.ts, note-agent-run). Das Kontextfenster kommt dann aus dem Katalog.
const BACKEND = process.env.EVAL_BACKEND ?? 'ollama'
const CHAT_OPTIONS = BACKEND === 'llmbase'
  ? { backend: 'llmbase', llmbaseApiKey: process.env.LLMBASE_API_KEY, llmbaseModel: MODEL, maxTokens: 8_192 }
  : { backend: 'ollama', ollamaModel: MODEL }
const REPS = Math.max(1, Number(process.env.EVAL_REPS ?? 1))
const OUT = process.env.EVAL_OUT ?? path.join(os.tmpdir(), 'mindgraph-mcp-erp.jsonl')
const ONLY = (process.env.EVAL_QUESTIONS ?? '').split(',').map(s => s.trim()).filter(Boolean)

// ── Daten (deterministisch) ──────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20261115)
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]

const STEMS = ['Müller', 'Schmidt', 'Weber', 'Fischer', 'Becker', 'Hoffmann', 'Schäfer', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Köhler', 'Maier', 'Huber', 'Kaiser']
const TRADES = ['Metallbau', 'Elektrotechnik', 'Bürobedarf', 'Logistik', 'Druck', 'Kunststofftechnik', 'Holzbau', 'Haustechnik', 'IT-Service', 'Verpackung', 'Werkzeuge', 'Laborbedarf']
const FORMS = ['GmbH', 'AG', 'KG', 'GmbH & Co. KG']
const CITIES = ['Kassel', 'Fulda', 'Gießen', 'Marburg', 'Frankfurt', 'Göttingen', 'Paderborn', 'Erfurt', 'Bad Hersfeld', 'Wetzlar', 'Darmstadt', 'Hanau']
const PURCHASERS = ['AB', 'CK', 'DM', 'EL', 'FN']

interface Vendor { number: string; displayName: string; city: string; postalCode: string; country: string; phoneNumber: string; email: string; paymentTermsCode: string; currencyCode: string; blocked: string; balance: number }
interface Order { id: string; number: string; orderDate: string; postingDate: string; vendorNumber: string; vendorName: string; payToVendorNumber: string; shipToName: string; shipToContact: string; buyFromAddressLine1: string; buyFromCity: string; buyFromPostalCode: string; buyFromCountry: string; currencyCode: string; pricesIncludeTax: boolean; paymentTermsCode: string; shipmentMethodCode: string; purchaser: string; requestedReceiptDate: string; expectedReceiptDate: string; status: 'Open' | 'Received'; fullyReceived: boolean; discountAmount: number; totalAmountExcludingTax: number; totalTaxAmount: number; totalAmountIncludingTax: number; locationCode: string; departmentCode: string; projectCode: string; lastModifiedDateTime: string }

const VENDORS: Vendor[] = []
{
  const used = new Set<string>()
  while (VENDORS.length < 300) {
    const name = `${pick(STEMS)} ${pick(TRADES)} ${pick(FORMS)}`
    if (used.has(name)) continue
    used.add(name)
    const n = VENDORS.length + 1
    VENDORS.push({
      number: `V${String(10000 + n * 10)}`, displayName: name, city: pick(CITIES), postalCode: String(30000 + Math.floor(rnd() * 9000)),
      country: 'DE', phoneNumber: `0${Math.floor(100 + rnd() * 900)} ${Math.floor(100000 + rnd() * 900000)}`,
      email: `einkauf${n}@example.com`, paymentTermsCode: pick(['14T', '30T', '30T2%']), currencyCode: 'EUR',
      blocked: rnd() < 0.03 ? 'Payment' : ' ', balance: Math.round(rnd() * 5_000_000) / 100
    })
  }
}
const day = (d: Date) => d.toISOString().slice(0, 10)
const ORDERS: Order[] = []
{
  // Schiefe Verteilung: wenige Lieferanten mit vielen Bestellungen, wie im echten Einkauf.
  const weights = VENDORS.map((_, i) => 1 / (1 + i * 0.05))
  const total = weights.reduce((a, b) => a + b, 0)
  const vendorFor = () => { let r = rnd() * total; for (let i = 0; i < VENDORS.length; i++) { r -= weights[i]; if (r <= 0) return VENDORS[i] } return VENDORS[0] }
  for (let i = 0; i < 500; i++) {
    const v = vendorFor()
    const od = new Date(Date.UTC(2026, 7, 1) + Math.floor(rnd() * 105) * 86_400_000) // 01.08.–13.11.2026
    const exp = new Date(od.getTime() + (7 + Math.floor(rnd() * 45)) * 86_400_000)
    const net = Math.round(Math.exp(5.5 + rnd() * 5.3) * 100) / 100 // ~245 bis ~49 000 EUR
    const tax = Math.round(net * 0.19 * 100) / 100
    const open = exp.getTime() > Date.UTC(2026, 9, 1) ? rnd() < 0.75 : rnd() < 0.15
    ORDERS.push({
      id: `${(i * 2654435761 >>> 0).toString(16).padStart(8, '0')}-0000-4000-8000-${String(i).padStart(12, '0')}`,
      number: `PO-${String(30001 + i)}`, orderDate: day(od), postingDate: day(od), vendorNumber: v.number, vendorName: v.displayName,
      payToVendorNumber: v.number, shipToName: 'Musterwerk Nord GmbH', shipToContact: pick(['Lager Halle 2', 'Wareneingang', 'Frau Lenz', 'Herr Okafor']),
      buyFromAddressLine1: `${pick(['Industriestraße', 'Am Hafen', 'Gewerbepark', 'Hauptstraße'])} ${1 + Math.floor(rnd() * 120)}`,
      buyFromCity: v.city, buyFromPostalCode: v.postalCode, buyFromCountry: 'DE', currencyCode: 'EUR', pricesIncludeTax: false,
      paymentTermsCode: v.paymentTermsCode, shipmentMethodCode: pick(['SPED', 'POST', 'ABH']), purchaser: pick(PURCHASERS),
      requestedReceiptDate: day(exp), expectedReceiptDate: day(exp), status: open ? 'Open' : 'Received', fullyReceived: !open,
      discountAmount: 0, totalAmountExcludingTax: net, totalTaxAmount: tax, totalAmountIncludingTax: Math.round((net + tax) * 100) / 100,
      locationCode: pick(['NORD', 'SÜD', 'ZENTRAL']), departmentCode: pick(['EINK', 'PROD', 'VERW']), projectCode: rnd() < 0.3 ? `P-${100 + Math.floor(rnd() * 40)}` : '',
      lastModifiedDateTime: `${day(od)}T${String(7 + Math.floor(rnd() * 10)).padStart(2, '0')}:15:00Z`
    })
  }
}

// ── Fragen mit selbst berechneten Antworten ─────────────────────────────────────────────────

const openOrders = ORDERS.filter(o => o.status === 'Open')
const byVendorOpen = new Map<string, Order[]>()
for (const o of openOrders) byVendorOpen.set(o.vendorNumber, [...(byVendorOpen.get(o.vendorNumber) ?? []), o])
const vendorWithOpen = (min: number, max: number) => VENDORS.find(v => { const n = byVendorOpen.get(v.number)?.length ?? 0; return n >= min && n <= max })!
const q1Vendor = vendorWithOpen(4, 4) ?? vendorWithOpen(3, 6)
const q3Vendor = VENDORS.find(v => v !== q1Vendor && (byVendorOpen.get(v.number)?.length ?? 0) >= 6)!
const sortedOpenAmounts = openOrders.map(o => o.totalAmountExcludingTax).sort((a, b) => b - a)
const q2Threshold = Math.floor(sortedOpenAmounts[11] / 1000) * 1000
const q4Top = [...byVendorOpen.entries()].map(([nr, os]) => ({ nr, sum: os.reduce((a, o) => a + o.totalAmountExcludingTax, 0) })).sort((a, b) => b.sum - a.sum).slice(0, 5)
const q5Count = openOrders.filter(o => o.expectedReceiptDate < '2026-11-01').length
const kasselNumbers = new Set(VENDORS.filter(v => v.city === 'Kassel').map(v => v.number))
const q6Orders = openOrders.filter(o => kasselNumbers.has(o.vendorNumber) && o.orderDate >= '2026-10-01' && o.orderDate <= '2026-10-31')
const vendorName = (nr: string) => VENDORS.find(v => v.number === nr)!.displayName
const euro = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Expect =
  | { kind: 'list'; numbers: string[] }
  | { kind: 'sum'; value: number }
  | { kind: 'names'; names: string[] }
  | { kind: 'count'; value: number }

interface Question { id: string; label: string; instruction: string; expect: Expect }
const QUESTIONS: Question[] = [
  {
    id: 'q1', label: 'Nachschlagen: offene Bestellungen eines Lieferanten',
    instruction: `Erstelle eine Notiz mit allen offenen Bestellungen beim Lieferanten „${q1Vendor.displayName}“ aus dem ERP: Bestellnummer, Bestelldatum und Nettobetrag, als Tabelle.`,
    expect: { kind: 'list', numbers: (byVendorOpen.get(q1Vendor.number) ?? []).map(o => o.number) }
  },
  {
    id: 'q2', label: 'Schwelle über alle Lieferanten',
    instruction: `Erstelle eine Notiz mit allen offenen Bestellungen aus dem ERP, deren Nettobetrag über ${euro(q2Threshold)} EUR liegt: Bestellnummer, Lieferant, Nettobetrag, als Tabelle.`,
    expect: { kind: 'list', numbers: openOrders.filter(o => o.totalAmountExcludingTax > q2Threshold).map(o => o.number) }
  },
  {
    id: 'q3', label: 'Summe für einen Lieferanten',
    instruction: `Wie hoch ist die Summe der Nettobeträge aller offenen Bestellungen beim Lieferanten „${q3Vendor.displayName}“? Erstelle eine kurze Notiz mit der Summe und den einzelnen Bestellungen.`,
    expect: { kind: 'sum', value: Math.round((byVendorOpen.get(q3Vendor.number) ?? []).reduce((a, o) => a + o.totalAmountExcludingTax, 0) * 100) / 100 }
  },
  {
    id: 'q4', label: 'Rangliste über alle Bestellungen',
    instruction: 'Welche fünf Lieferanten haben das höchste offene Bestellvolumen (Summe der Nettobeträge aller offenen Bestellungen)? Erstelle eine Notiz mit den fünf Lieferanten und ihrer Summe.',
    expect: { kind: 'names', names: q4Top.map(t => vendorName(t.nr)) }
  },
  {
    id: 'q5', label: 'Zählen mit Datumsbedingung',
    instruction: 'Wie viele offene Bestellungen haben ein erwartetes Lieferdatum vor dem 01.11.2026, sind also überfällig? Erstelle eine Notiz mit der Anzahl und einer Liste der Bestellnummern.',
    expect: { kind: 'count', value: q5Count }
  },
  {
    id: 'q6', label: 'Verknüpfung Lieferant ↔ Bestellung',
    instruction: 'Erstelle eine Notiz mit allen offenen Bestellungen aus dem Oktober 2026 (Bestelldatum) bei Lieferanten mit Sitz in Kassel: Bestellnummer, Lieferant, Nettobetrag, als Tabelle.',
    expect: { kind: 'list', numbers: q6Orders.map(o => o.number) }
  }
]

// ── OData-artiger Filter (genug für die Fragen, Fehler laut) ─────────────────────────────────

type Row = Record<string, unknown>
function parseFilter(filter: string): (row: Row) => boolean {
  const clauses = filter.split(/\s+and\s+/i).map(c => c.trim()).filter(Boolean)
  const tests = clauses.map(c => {
    const contains = /^contains\(\s*(\w+)\s*,\s*'([^']*)'\s*\)$/i.exec(c)
    if (contains) return (r: Row) => String(r[contains[1]] ?? '').toLowerCase().includes(contains[2].toLowerCase())
    const m = /^(\w+)\s+(eq|ne|gt|ge|lt|le)\s+(.+)$/i.exec(c)
    if (!m) throw new Error(`Ungültiger Filter: „${c}“. Erlaubt: Feld eq|ne|gt|ge|lt|le Wert, contains(Feld,'Text'), verbunden mit and.`)
    const [, field, op, raw] = m
    const v = raw.trim()
    const value: unknown = /^'.*'$/.test(v) ? v.slice(1, -1) : v === 'true' ? true : v === 'false' ? false : Number.isFinite(Number(v)) ? Number(v) : v
    return (r: Row) => {
      const x = r[field]
      if (x === undefined) throw new Error(`Unbekanntes Feld im Filter: ${field}`)
      switch (op.toLowerCase()) {
        case 'eq': return x === value
        case 'ne': return x !== value
        case 'gt': return (x as number) > (value as number)
        case 'ge': return (x as number) >= (value as number)
        case 'lt': return (x as number) < (value as number)
        default: return (x as number) <= (value as number)
      }
    }
  })
  return row => tests.every(t => t(row))
}
function listPage(rows: Row[], args: { filter?: string; select?: string; top?: number; skip?: number }): string {
  const filtered = args.filter ? rows.filter(parseFilter(args.filter)) : rows
  const skip = Math.max(0, args.skip ?? 0)
  const top = Math.max(1, Math.min(args.top ?? 50, 1000))
  const fields = args.select ? args.select.split(',').map(s => s.trim()).filter(Boolean) : null
  const page = filtered.slice(skip, skip + top).map(r => fields ? Object.fromEntries(fields.map(f => [f, r[f]])) : r)
  const more = skip + top < filtered.length
  return JSON.stringify({ value: page, ...(more ? { '@odata.nextLink': `skip=${skip + top}` } : {}) })
}

async function startErp(): Promise<{ origin: string; close: () => Promise<void> }> {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')
  const { z } = await import('zod')
  const params = {
    filter: z.string().optional().describe("OData filter, e.g. status eq 'Open' and totalAmountExcludingTax gt 1000. Dates as 'YYYY-MM-DD'."),
    select: z.string().optional().describe('Comma-separated field names to return.'),
    top: z.number().int().optional().describe('Page size.'),
    skip: z.number().int().optional().describe('Records to skip (paging; see @odata.nextLink).')
  }
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer test') { res.writeHead(401); res.end(); return }
    const mcp = new McpServer({ name: 'erp-scale-fixture', version: '1' })
    const wrap = (rows: Row[]) => async (a: { filter?: string; select?: string; top?: number; skip?: number }) => {
      try { return { content: [{ type: 'text' as const, text: listPage(rows, a) }] } }
      catch (e) { return { isError: true, content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }] } }
    }
    mcp.registerTool('List_Vendors_PAG30010', {
      description: 'Lists vendors. Fields: number, displayName, city, postalCode, country, phoneNumber, email, paymentTermsCode, currencyCode, blocked, balance.',
      inputSchema: params
    }, wrap(VENDORS as unknown as Row[]))
    mcp.registerTool('List_PurchaseOrders_PAG30066', {
      description: "Lists purchase orders. Fields: id, number, orderDate, postingDate, vendorNumber, vendorName, payToVendorNumber, shipToName, shipToContact, buyFromAddressLine1, buyFromCity, buyFromPostalCode, buyFromCountry, currencyCode, pricesIncludeTax, paymentTermsCode, shipmentMethodCode, purchaser, requestedReceiptDate, expectedReceiptDate, status ('Open' or 'Received'), fullyReceived, discountAmount, totalAmountExcludingTax, totalTaxAmount, totalAmountIncludingTax, locationCode, departmentCode, projectCode, lastModifiedDateTime.",
      inputSchema: params
    }, wrap(ORDERS as unknown as Row[]))
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => { void transport.close(); void mcp.close() })
    await mcp.connect(transport)
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', () => { void transport.handleRequest(req, res, body ? JSON.parse(body) : undefined) })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  return { origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: () => new Promise(r => server.close(() => r())) }
}

// ── Wertung ──────────────────────────────────────────────────────────────────────────────────

/** Alle Zahlen im Text als Cent-Beträge, deutsch („12.400,50“) und englisch („12,400.50“) gelesen. */
function amountsInText(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/\d[\d.,']*\d|\d/g)) {
    const s = m[0].replace(/'/g, '')
    const de = Number(s.replace(/\./g, '').replace(',', '.'))
    const en = Number(s.replace(/,/g, ''))
    for (const n of [de, en]) if (Number.isFinite(n)) out.push(Math.round(n * 100))
  }
  return out
}
function score(q: Question, out: string) {
  const found = new Set([...out.matchAll(/PO-\d{5}/g)].map(m => m[0]))
  const e = q.expect
  if (e.kind === 'list') {
    const want = new Set(e.numbers)
    const hit = [...want].filter(n => found.has(n)).length
    const wrong = [...found].filter(n => !want.has(n))
    return { expected: want.size, hit, wrong: wrong.length, pass: hit === want.size && wrong.length === 0 }
  }
  if (e.kind === 'sum') {
    const cents = Math.round(e.value * 100)
    const ok = amountsInText(out).some(c => Math.abs(c - cents) <= 1)
    return { expected: e.value, pass: ok }
  }
  if (e.kind === 'names') {
    const hit = e.names.filter(n => out.includes(n)).length
    return { expected: e.names, hit, pass: hit === e.names.length }
  }
  const ok = new RegExp(`(^|[^\\d.,])${e.value}([^\\d.,]|$)`).test(out)
  return { expected: e.value, pass: ok }
}

describe.skipIf(!ENABLED)(`MCP-ERP in realistischer Größe (${MODEL})`, () => {
  let erp: Awaited<ReturnType<typeof startErp>>
  beforeAll(async () => {
    erp = await startErp()
    const meta = { meta: true, backend: BACKEND, model: MODEL, vendors: VENDORS.length, orders: ORDERS.length, open: openOrders.length, avgOrderJsonChars: Math.round(JSON.stringify(ORDERS).length / ORDERS.length), questions: QUESTIONS.map(q => ({ id: q.id, expect: q.expect.kind === 'list' ? q.expect.numbers.length : q.expect })) }
    await fs.appendFile(OUT, JSON.stringify(meta) + '\n')
    console.log(JSON.stringify(meta))
  })
  afterAll(async () => { await erp.close() })

  for (const q of QUESTIONS.filter(x => ONLY.length === 0 || ONLY.includes(x.id))) {
    for (let rep = 1; rep <= REPS; rep++) {
      it(`${q.id} (${q.label}) — Lauf ${rep}`, async () => {
        const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-mcp-erp-')))
        const vault = path.join(base, 'vault')
        await fs.mkdir(path.join(vault, 'Ziel'), { recursive: true })
        const store = createMcpStore(path.join(base, 'userdata'), { available: () => true, encrypt: s => Buffer.from(s), decrypt: b => b.toString() })
        const cfg = await store.put({ label: 'ERP', transport: 'http', http: normalizeHttpInput({ label: 'ERP', url: `${erp.origin}/mcp`, approvedPrivateOrigin: erp.origin, secretHeaders: { Authorization: 'x' } }) })
        await store.saveSecrets(cfg.id, { Authorization: 'Bearer test' })
        const probe = await openMcpSession(cfg, store)
        for (const t of probe.tools) await store.setToolApproval(cfg.id, cfg.bindingHash, t.name, toolDefinitionHash(t))
        await probe.close()

        const mcp = await prepareMcpForRun({ serverIds: [cfg.id], store, vaultPath: vault })
        const run = {
          runId: `mcp-erp-${q.id}-${rep}-${Date.now()}`, senderId: 990_000 + rep, noteId: 'eval', vaultPath: vault,
          targetFolderRel: 'Ziel', targetFolderAbs: path.join(vault, 'Ziel'),
          attachmentIds: [], instruction: q.instruction, model: MODEL, skills: [], skillsUsed: [],
          status: 'running', abort: new AbortController(), seq: 0,
          results: new Map(), sources: new Set<string>(), datasets: new Map(),
          folderReads: new Map(), collectedFolders: new Set(), toolsUsed: new Set(),
          mcp, mcpServers: [cfg.id]
        } as unknown as AgentRun

        const steps: Array<{ skill: string; summary: string }> = []
        let peak = 0
        let window = 0
        let turns = 0
        const started = Date.now()
        let error = ''
        let text = ''
        try {
          const res = await runNoteAgentLoop({
            run, noteContent: '', agentMemory: '',
            chatOptions: CHAT_OPTIONS as never,
            onStep: (_seq, skill, summary) => { steps.push({ skill, summary }) },
            onContext: (snap, t) => { peak = Math.max(peak, snap.used); window = snap.window; if (t) turns = Math.max(turns, t.used) }
          })
          text = res.text
        } catch (e) {
          error = e instanceof Error ? e.message : String(e)
        } finally {
          await closeMcpForRun(mcp)
        }
        const results = Array.from(run.results.values())
        const files = await Promise.all(results.map(r => fs.readFile(r.stagingPath, 'utf8').catch(() => '')))
        const out = files.join('\n') + '\n' + text
        const s = score(q, out)
        const calls = mcp.calls
        const line = {
          model: MODEL, q: q.id, rep, ...s, pass: s.pass && !error && results.length > 0, ms: Date.now() - started, error,
          wroteFile: results.length > 0, turns, peakTokens: peak, window, peakPct: window ? Math.round(peak / window * 100) : null,
          mcpCalls: calls.length, truncatedCalls: calls.filter(c => c.truncated).length, cappedCalls: calls.filter(c => c.capped.length > 0).length,
          resultChars: calls.reduce((a, c) => a + c.chars, 0),
          usedFilter: steps.some(st => st.skill.startsWith('mcp__') && /filter/.test(st.summary)),
          provenance: mcpProvenance(mcp),
          steps: steps.map(st => `${st.skill}: ${st.summary}`.slice(0, 240)),
          output: out.slice(0, 4000)
        }
        await fs.appendFile(OUT, JSON.stringify(line) + '\n')
        console.log(JSON.stringify({ q: q.id, rep, pass: line.pass, ms: line.ms, error: error.slice(0, 160), hit: (s as { hit?: number }).hit, wrong: (s as { wrong?: number }).wrong, turns, peakPct: line.peakPct, mcpCalls: line.mcpCalls, truncated: line.truncatedCalls, usedFilter: line.usedFilter }))
      }, 25 * 60_000)
    }
  }
})
