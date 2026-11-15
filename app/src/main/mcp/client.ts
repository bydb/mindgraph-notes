// Verbindung zu einem MCP-Server über das offizielle SDK (E15′). Nur Werkzeuge (E2): Der Client
// meldet keine Fähigkeiten an (kein Sampling, keine Rückfragen, keine Roots) — Anfragen des
// Servers an die App beantwortet das SDK mit „Methode unbekannt“.
//
// stdio: Start nur nach Prüfsummenvergleich (E22) und bestandenem Selbsttest mit dem echten
// Profil (E21), außer der Nutzer hat für diesen Server ausdrücklich volle Rechte gewählt.
// HTTP: eigener Netzweg ohne Weiterleitungen (E13′).
import { promises as fs } from 'fs'
import * as path from 'path'
import {
  type McpServerConfig, type McpCallResultLike, MCP_CALL_TIMEOUT_MS, MCP_MAX_LIST_PAGES
} from '../../shared/mcp'
import { buildMcpSandboxProfile, verifyMcpSandbox, mcpSandboxedCommand, mcpSandboxAvailability, type McpSandboxSpec } from './sandbox'
import { createMcpFetch } from './httpFetch'
import { changedFiles, type McpStore } from './store'

export interface McpToolDef {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; [k: string]: unknown }
}

export interface McpSession {
  serverId: string
  label: string
  tools: McpToolDef[]
  call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallResultLike>
  /** Wird aufgerufen, wenn der Server seine Werkzeugliste ändert ODER die Verbindung endet (E23). */
  onInvalidated(cb: (reason: string) => void): void
  close(): Promise<void>
}

export interface OpenSessionOptions {
  /** Der Vault des Laufs bzw. der Einstellungsseite; ohne Lesefreigabe wird er gesperrt. */
  vaultPath?: string
  /** Alle Vaults, die der Main kennt — immer gesperrt (Codex F10). */
  knownVaults?: string[]
  /** Marke für einen Server mit Microsoft-Anmeldung (nur Main, Abschnitt 5). */
  getMicrosoftToken?: (cfg: McpServerConfig) => Promise<string>
  /** Marke für einen Server mit OAuth-Anmeldung (nur Main, Abschnitt 6). */
  getOAuthToken?: (cfg: McpServerConfig) => Promise<string>
  signal?: AbortSignal
  /** Für Tests: Selbsttest überspringen ist NICHT vorgesehen; nur der SDK-Import ist austauschbar. */
}

const CLIENT_INFO = { name: 'mindgraph-notes', version: '1' }
const MAX_STDERR = 8_000

/** Lesbarer Grund, warum ein Server gerade nicht startet — oder null. */
export async function stdioStartBlocker(cfg: McpServerConfig): Promise<string | null> {
  if (cfg.transport !== 'stdio' || !cfg.stdio) return null
  const changed = await changedFiles(cfg)
  if (changed.length) {
    return `Diese Dateien haben sich seit der Freigabe geändert: ${changed.map(p => path.basename(p)).join(', ')}. Bitte den Server in den Einstellungen neu freigeben.`
  }
  if (!cfg.stdio.fullAccess) {
    const avail = mcpSandboxAvailability()
    if (!avail.ok) return `${avail.reason.replace('der Shell', 'für externe Programme')} Ohne Sandbox startet ein lokales Programm nur, wenn Sie für diesen Server ausdrücklich volle Rechte gewählt haben.`
  }
  return null
}

export async function openMcpSession(cfg: McpServerConfig, store: McpStore, opts: OpenSessionOptions = {}): Promise<McpSession> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { ToolListChangedNotificationSchema } = await import('@modelcontextprotocol/sdk/types.js')
  const client = new Client(CLIENT_INFO, { capabilities: {} })
  const listeners: Array<(reason: string) => void> = []
  let invalidated: string | null = null
  const invalidate = (reason: string) => {
    if (invalidated) return
    invalidated = reason
    for (const cb of listeners) { try { cb(reason) } catch { /* Beobachter-Fehler nicht weiterreichen */ } }
  }
  let stderrTail = ''

  let transport: import('@modelcontextprotocol/sdk/shared/transport.js').Transport
  if (cfg.transport === 'stdio') {
    const s = cfg.stdio!
    const blocker = await stdioStartBlocker(cfg)
    if (blocker) throw new Error(blocker)
    const workDir = store.workDirFor(cfg.id)
    await fs.mkdir(workDir, { recursive: true, mode: 0o700 })
    const realWork = await fs.realpath(workDir)
    const programArgs = [...(s.script ? [s.script] : []), ...s.args]
    let command = s.command
    let args = programArgs
    if (!s.fullAccess) {
      const spec: McpSandboxSpec = {
        workDir: realWork, programDir: s.programDir, command: s.command, script: s.script,
        extraReadPaths: s.extraReadPaths, network: s.network,
        knownVaults: await Promise.all((opts.knownVaults ?? []).map(v => fs.realpath(v).catch(() => v))),
        // Den Vault IMMER mitgeben: ohne Freigabe wird er dann ausdrücklich gesperrt (Codex F03).
        ...(opts.vaultPath ? { vaultPath: await fs.realpath(opts.vaultPath), vaultRead: s.vaultRead } : {})
      }
      const profilePath = store.profilePathFor(cfg.id)
      await fs.writeFile(profilePath, buildMcpSandboxProfile(spec), { mode: 0o600 })
      await verifyMcpSandbox(profilePath, spec)
      ;({ command, args } = mcpSandboxedCommand(profilePath, s.command, programArgs))
    }
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
    const t = new StdioClientTransport({ command, args, cwd: realWork, stderr: 'pipe', env: { TMPDIR: realWork } })
    t.stderr?.on('data', (d: Buffer) => { stderrTail = (stderrTail + d.toString()).slice(-MAX_STDERR) })
    transport = t
  } else {
    const h = cfg.http!
    const secrets = await store.loadSecrets(cfg.id)
    const missing = h.secretHeaderNames.filter(n => !secrets[n])
    if (missing.length) throw new Error(`Für ${missing.join(', ')} ist kein Wert hinterlegt.`)
    if (h.microsoft) {
      if (!h.microsoft.account) throw new Error(`„${cfg.label}“: Bitte zuerst mit Microsoft anmelden (Einstellungen → Externe Werkzeuge).`)
      // Business Central: Der feste Mandant in der Kopfzeile muss der der Anmeldung sein, sonst
      // spräche die Marke eines Mandanten einen anderen an.
      const tenantHeader = Object.entries(h.headers).find(([k]) => k.toLowerCase() === 'tenantid')?.[1]?.trim().toLowerCase()
      if (tenantHeader && /^[0-9a-f-]{36}$/.test(tenantHeader) && tenantHeader !== h.microsoft.account.tenantId) {
        throw new Error(`„${cfg.label}“: Die Kopfzeile TenantId passt nicht zum angemeldeten Microsoft-Konto.`)
      }
      if (!opts.getMicrosoftToken) throw new Error('Microsoft-Anmeldung ist hier nicht verfügbar.')
      secrets.Authorization = `Bearer ${await opts.getMicrosoftToken(cfg)}`
    }
    if (h.oauth) {
      if (!h.oauth.loginId) throw new Error(`„${cfg.label}“: Bitte zuerst anmelden (Einstellungen → KI & Modelle → Externe Dienste).`)
      if (!opts.getOAuthToken) throw new Error('Die Anmeldung ist hier nicht verfügbar.')
      secrets.Authorization = `Bearer ${await opts.getOAuthToken(cfg)}`
    }
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
    // Sitzungswechsel (E23, Codex F08): Das SDK übernimmt eine neue Mcp-Session-Id still. Hier
    // wird die erste festgehalten; jede spätere, andere sperrt den Server für den Rest des Laufs.
    let firstSessionId: string | null = null
    const onResponse = (_status: number, headers: Headers) => {
      const sid = headers.get('mcp-session-id')
      if (!sid) return
      if (firstSessionId === null) firstSessionId = sid
      else if (sid !== firstSessionId) invalidate('Der Server hat eine neue Sitzung begonnen.')
    }
    transport = new StreamableHTTPClientTransport(new URL(h.url), {
      fetch: createMcpFetch({ approvedPrivateOrigin: h.approvedPrivateOrigin, onResponse }),
      requestInit: { headers: { ...h.headers, ...secrets }, redirect: 'error' },
      reconnectionOptions: { maxReconnectionDelay: 30_000, initialReconnectionDelay: 1_000, reconnectionDelayGrowFactor: 1.5, maxRetries: 0 }
    })
  }

  const prevOnClose = transport.onclose
  transport.onclose = () => { prevOnClose?.(); invalidate('Die Verbindung zum Server wurde beendet.') }

  const abort = () => { void client.close().catch(() => undefined) }
  // Vor dem Start des Programms bzw. der ersten Anfrage: ein schon abgebrochener Start beginnt nicht.
  if (opts.signal?.aborted) throw new Error('Start abgebrochen.')
  opts.signal?.addEventListener('abort', abort, { once: true })
  try {
    await client.connect(transport, { timeout: MCP_CALL_TIMEOUT_MS, signal: opts.signal })
  } catch (e) {
    opts.signal?.removeEventListener('abort', abort)
    await client.close().catch(() => undefined)
    const detail = stderrTail.trim().split('\n').slice(-3).join(' · ')
    throw new Error(`Verbindung zu „${cfg.label}“ fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}${detail ? ` (Programm meldet: ${detail.slice(0, 300)})` : ''}`)
  }
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    invalidate('Der Server hat seine Werkzeuge geändert.')
  })

  // Werkzeugliste über alle Seiten (F10), mit Obergrenze.
  const tools: McpToolDef[] = []
  try {
    let cursor: string | undefined
    for (let page = 0; page < MCP_MAX_LIST_PAGES; page++) {
      const res = await client.listTools(cursor ? { cursor } : {}, { timeout: MCP_CALL_TIMEOUT_MS, signal: opts.signal })
      for (const t of res.tools) tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown>, annotations: t.annotations as McpToolDef['annotations'] })
      cursor = res.nextCursor
      if (!cursor) break
      if (page === MCP_MAX_LIST_PAGES - 1) throw new Error(`Der Server liefert mehr als ${MCP_MAX_LIST_PAGES} Seiten Werkzeuge — abgebrochen.`)
    }
  } catch (e) {
    await client.close().catch(() => undefined)
    throw e
  }

  return {
    serverId: cfg.id,
    label: cfg.label,
    tools,
    async call(name, args, signal) {
      if (invalidated) throw new Error(invalidated)
      const res = await client.callTool({ name, arguments: args }, undefined, { timeout: MCP_CALL_TIMEOUT_MS, signal })
      // Kam mit genau dieser Antwort ein Sitzungswechsel oder eine Listenänderung, gilt die Antwort
      // schon als gesperrt (E23 „sofort“, Codex F14) — sie erreicht das Modell nicht.
      if (invalidated) throw new Error(invalidated)
      return res as McpCallResultLike
    },
    onInvalidated(cb) { listeners.push(cb); if (invalidated) cb(invalidated) },
    async close() {
      opts.signal?.removeEventListener('abort', abort)
      invalidated = invalidated ?? 'Verbindung geschlossen.'
      await client.close().catch(() => undefined)
    }
  }
}
