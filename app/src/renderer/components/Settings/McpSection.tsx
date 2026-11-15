import { useCallback, useEffect, useRef, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { IconTile, TILE_GLYPH } from './SettingsUI'
import type { McpServerSummary } from '../../../shared/types'
import type { McpToolView } from '../../../shared/mcp'
import { BC_REQUIRED_HEADERS, MCP_MAX_TOOL_TOKENS_PER_RUN } from '../../../shared/mcp'
import { MCP_CATALOG, catalogEntry } from '../../../shared/mcpCatalog'
import './McpSection.css'

// Externe Werkzeuge (MCP) — Server eintragen, verbinden, Werkzeuge einzeln freigeben.
// Plan: docs/codex-collab/mcp-anbindung.md (Fassung 3). Diese Seite SCHLÄGT nur vor:
// gespeichert wird erst nach dem nativen Dialog im Main, der alles im Wortlaut zeigt (E4),
// und eine Werkzeugfreigabe trägt die Prüfsumme, die der Main selbst gesehen hat (E6).
//
// Wer garantiert was (Grundsatz Fassung 3) steht sichtbar oben — „nur lesen“ ist eine Zusage
// des fremden Systems, keine Prüfung von MindGraph.

type Mode = 'stdio' | 'http'

interface StdioForm { label: string; command: string; script: string; args: string; extraReadPaths: string[]; vaultRead: boolean; network: boolean; fullAccess: boolean }
interface HttpForm { label: string; url: string; headers: Array<{ name: string; value: string }>; secretName: string; secretValue: string; bc: boolean; microsoft: boolean; msClientId: string; msTenant: string; oauth: boolean }

const EMPTY_STDIO: StdioForm = { label: '', command: '', script: '', args: '', extraReadPaths: [], vaultRead: false, network: false, fullAccess: false }
const EMPTY_HTTP: HttpForm = { label: '', url: '', headers: [], secretName: 'Authorization', secretValue: '', bc: false, microsoft: false, msClientId: '', msTenant: '', oauth: false }

/** Argumente: durch Leerzeichen getrennt, "in Anführungszeichen" zusammenhalten. */
function splitArgs(text: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push(m[1] ?? m[2])
  return out
}

function ServerCard({ server, blocker, en, vaultPath, onChanged, highlight }: {
  server: McpServerSummary
  blocker?: string
  /** Gerade aus dem Katalog angelegt: in den Blick holen, damit der nächste Schritt sichtbar ist. */
  highlight?: boolean
  en: boolean
  vaultPath: string | null
  onChanged: () => void
}) {
  const [tools, setTools] = useState<McpToolView[] | null>(null)
  const [busy, setBusy] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (highlight) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlight])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const inspect = async () => {
    setBusy(true); setError(''); setInfo('')
    const res = await window.electronAPI.mcpInspect(server.id, vaultPath ?? undefined)
    setBusy(false)
    if (!res.success) { setError(res.error || 'Fehler'); return }
    setTools(res.tools ?? [])
    setInfo(en ? `Connected in ${res.ms} ms.` : `Verbunden in ${res.ms} ms.`)
    onChanged()
  }
  const setTool = async (name: string, approved: boolean) => {
    setError('')
    const res = await window.electronAPI.mcpSetTool(server.id, name, approved)
    if (!res.success) { setError(res.error || 'Fehler'); return }
    setTools(ts => ts?.map(t => (t.name === name ? { ...t, approved } : t)) ?? null)
    onChanged()
  }
  const remove = async () => {
    setBusy(true)
    const res = await window.electronAPI.mcpRemove(server.id)
    setBusy(false)
    if (!res.success) setError(res.error || 'Fehler')
    onChanged()
  }
  const reapprove = async () => {
    setBusy(true); setError('')
    const res = await window.electronAPI.mcpReapprove(server.id)
    setBusy(false)
    if (!res.success) setError(res.error || 'Fehler')
    else { setTools(null); setInfo(en ? 'Approved again. Tools must be approved again too.' : 'Neu freigegeben. Die Werkzeuge müssen ebenfalls neu freigegeben werden.') }
    onChanged()
  }
  const msLogin = async () => {
    setBusy(true); setError(''); setInfo('')
    const res = await window.electronAPI.mcpMsLogin(server.id)
    setBusy(false)
    if (!res.success) { setError(res.error || 'Fehler'); return }
    setTools(null)
    setInfo(en ? 'Signed in. Show the tools and approve them again.' : 'Angemeldet. Bitte die Werkzeuge anzeigen und neu freigeben.')
    onChanged()
  }
  const msLogout = async () => {
    setBusy(true); setError('')
    const res = await window.electronAPI.mcpMsLogout(server.id)
    setBusy(false)
    if (!res.success) setError(res.error || 'Fehler')
    setTools(null)
    onChanged()
  }
  const oauthLogin = async () => {
    setBusy(true); setError(''); setInfo('')
    const res = await window.electronAPI.mcpOAuthLogin(server.id)
    setBusy(false)
    if (!res.success) { setError(res.error || 'Fehler'); return }
    setTools(null)
    setInfo(en ? 'Signed in. Now show the tools and approve the ones the agent may use.' : 'Angemeldet. Jetzt „Werkzeuge anzeigen“ und die freigeben, die der Agent nutzen darf.')
    onChanged()
  }
  const oauthCancel = () => { void window.electronAPI.mcpOAuthCancel() }
  const oauthLogout = async () => {
    setBusy(true); setError('')
    const res = await window.electronAPI.mcpOAuthLogout(server.id)
    setBusy(false)
    if (!res.success) setError(res.error || 'Fehler')
    setTools(null)
    onChanged()
  }
  const catalog = catalogEntry(server.catalogId)
  const needsLogin = !!server.http?.oauth && !server.http.oauth.signedIn
  const confirmReadOnly = async (confirmed: boolean) => {
    setError('')
    const res = await window.electronAPI.mcpConfirmReadOnly(server.id, confirmed)
    if (!res.success) setError(res.error || 'Fehler')
    onChanged()
  }

  const where = server.stdio
    ? `${server.stdio.script ?? server.stdio.command}${server.stdio.fullAccess ? (en ? ' · FULL RIGHTS, no sandbox' : ' · VOLLE RECHTE, keine Sandbox') : (en ? ` · sandbox, network ${server.stdio.network ? 'on' : 'off'}${server.stdio.vaultRead ? ', reads vault' : ''}` : ` · Sandbox, Netz ${server.stdio.network ? 'an' : 'aus'}${server.stdio.vaultRead ? ', liest den Vault' : ''}`)}`
    : `${server.http?.url}${server.http?.secretHeaderNames.length ? ` · ${en ? 'secret' : 'geheim'}: ${server.http.secretHeaderNames.join(', ')}` : ''}`

  return (
    <div ref={cardRef} className={`mcp-server ${highlight ? 'is-new' : ''}`}>
      <div className="mcp-server-head">
        <div>
          <strong>{server.label}</strong>
          <span className="mcp-server-kind">{catalog ? (en ? 'Service from the MindGraph list' : 'Dienst aus der MindGraph-Liste') : server.transport === 'stdio' ? (en ? 'Local program' : 'Lokales Programm') : (en ? 'Network server' : 'Server über das Netz')}{server.profile === 'business-central' ? ' · Business Central' : ''}</span>
          <div className="settings-hint mcp-server-where">{where}</div>
          {server.http && Object.keys(server.http.headers).length > 0 && (
            <div className="settings-hint">{Object.entries(server.http.headers).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
          )}
        </div>
        <div className="mcp-server-actions">
          <button type="button" className="settings-btn-secondary" onClick={inspect} disabled={busy || !!blocker || needsLogin} title={needsLogin ? (en ? 'Sign in first' : 'Bitte zuerst anmelden') : undefined}>
            {busy ? (en ? 'Connecting …' : 'Verbinde …') : (en ? 'Show tools' : 'Werkzeuge anzeigen')}
          </button>
          <button type="button" className="settings-btn-secondary mcp-danger" onClick={remove} disabled={busy}>
            {en ? 'Remove' : 'Entfernen'}
          </button>
        </div>
      </div>
      {blocker && (
        <div className="settings-guard-warning">
          {blocker}
          {server.stdio && <> <button type="button" className="settings-btn-secondary" onClick={reapprove} disabled={busy}>{en ? 'Approve again' : 'Neu freigeben'}</button></>}
        </div>
      )}
      {server.http?.microsoft && (
        <div className="settings-row">
          <div className="settings-row-info">
            <label>{en ? 'Microsoft sign-in' : 'Microsoft-Anmeldung'}</label>
            <span className="settings-hint">
              {server.http.microsoft.username
                ? (en ? `Signed in as ${server.http.microsoft.username}. A different account requires approving the tools again.` : `Angemeldet als ${server.http.microsoft.username}. Ein anderes Konto verlangt, die Werkzeuge neu freizugeben.`)
                : (en ? 'Not signed in. The sign-in opens in your browser; an administrator of your organisation may have to approve the app first.' : 'Nicht angemeldet. Die Anmeldung öffnet sich im Browser; ggf. muss eine Administratorin oder ein Administrator Ihrer Organisation die App zuerst freigeben.')}
            </span>
          </div>
          {server.http.microsoft.username
            ? <button type="button" className="settings-btn-secondary" onClick={msLogout} disabled={busy}>{en ? 'Sign out' : 'Abmelden'}</button>
            : <button type="button" className="settings-btn-primary" onClick={msLogin} disabled={busy}>{busy ? (en ? 'Waiting for browser …' : 'Warte auf Browser …') : (en ? 'Sign in with Microsoft' : 'Mit Microsoft anmelden')}</button>}
        </div>
      )}
      {server.http?.oauth && (
        <div className="settings-row">
          <div className="settings-row-info">
            <label>{en ? 'Sign-in' : 'Anmeldung'}</label>
            <span className="settings-hint">
              {server.http.oauth.signedIn
                ? (en ? `Signed in at ${new URL(server.http.oauth.issuer).host}. Signing in again requires approving the tools again.` : `Angemeldet bei ${new URL(server.http.oauth.issuer).host}. Eine neue Anmeldung verlangt, die Werkzeuge neu freizugeben.`)
                : (en ? `Not signed in. The sign-in opens in your browser at ${new URL(server.http.oauth.issuer).host} — the same address as the service.` : `Nicht angemeldet. Die Anmeldung öffnet sich im Browser bei ${new URL(server.http.oauth.issuer).host} — derselben Adresse wie der Dienst.`)}
            </span>
          </div>
          {server.http.oauth.signedIn
            ? <button type="button" className="settings-btn-secondary" onClick={oauthLogout} disabled={busy}>{en ? 'Sign out' : 'Abmelden'}</button>
            : busy
              ? <button type="button" className="settings-btn-secondary" onClick={oauthCancel}>{en ? 'Waiting for browser … Cancel' : 'Warte auf Browser … Abbrechen'}</button>
              : <button type="button" className="settings-btn-primary" onClick={oauthLogin}>{en ? 'Sign in' : 'Anmelden'}</button>}
        </div>
      )}
      {catalog && <div className="settings-hint">{en ? catalog.dataNote.en : catalog.dataNote.de}</div>}
      {server.profile === 'business-central' && (
        <div className="settings-row">
          <div className="settings-row-info">
            <label>{en ? 'Read-only configuration' : 'Nur-Lese-Konfiguration'}</label>
            <span className="settings-hint">
              {en
                ? 'Whether the tools only read is decided by the MCP configuration in Business Central (only “Allow Read”, “Unblock Edit Tools” off) — MindGraph cannot check this. Runs need your confirmation.'
                : 'Ob die Werkzeuge nur lesen, legt die MCP-Konfiguration in Business Central fest (nur „Allow Read“, „Unblock Edit Tools“ aus) — MindGraph kann das nicht prüfen. Läufe brauchen Ihre Bestätigung.'}
            </span>
          </div>
          <input type="checkbox" checked={server.readOnlyConfirmed} onChange={e => void confirmReadOnly(e.target.checked)} />
        </div>
      )}
      {error && <div className="settings-guard-warning">{error}</div>}
      {info && <div className="settings-hint">{info}</div>}
      {!tools && server.approvedTools.length > 0 && (
        <div className="settings-hint">{en ? 'Approved' : 'Freigegeben'}: {server.approvedTools.join(', ')}</div>
      )}
      {tools && (() => {
        // Reihenfolge: empfohlen → laut Dienst nur lesend → Rest. Größe je Werkzeug sichtbar, Summe
        // der Freigaben gegen die Laufgrenze (GUI-Test 15.11.2026: 14 Notion-Werkzeuge = ~21 000 Token,
        // der Lauf war voll, bevor er begann).
        const rank = (t: McpToolView) => (catalog?.suggestedTools.includes(t.name) ? 0 : t.serverSaysReadOnly === true ? 1 : 2)
        const sorted = [...tools].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
        const total = tools.filter(t => t.approved).reduce((sum, t) => sum + (t.approxTokens ?? 0), 0)
        const fmt = (n: number) => n.toLocaleString(en ? 'en-US' : 'de-DE')
        const over = total > MCP_MAX_TOOL_TOKENS_PER_RUN
        return (
          <>
            <div className={over ? 'settings-guard-warning' : 'settings-hint'}>
              {en
                ? `Approved for this service: ${tools.filter(t => t.approved).length} tools, ~${fmt(total)} tokens. A run may use at most ${fmt(MCP_MAX_TOOL_TOKENS_PER_RUN)} — for all services chosen in that run together.${over ? ' Too many — runs with this service will not start. Approve fewer tools.' : ' Every tool description takes up room the agent then lacks for reading.'}`
                : `Bei diesem Dienst freigegeben: ${tools.filter(t => t.approved).length} Werkzeuge, ~${fmt(total)} Token. Ein Lauf darf höchstens ${fmt(MCP_MAX_TOOL_TOKENS_PER_RUN)} belegen — für alle darin gewählten Dienste zusammen.${over ? ' Zu viele — Läufe mit diesem Dienst starten so nicht. Geben Sie weniger frei.' : ' Jede Werkzeugbeschreibung belegt Platz, der dem Agenten dann zum Lesen fehlt.'}`}
            </div>
            <ul className="mcp-tools">
              {tools.length === 0 && <li className="settings-hint">{en ? 'The server offers no tools.' : 'Der Server bietet keine Werkzeuge an.'}</li>}
              {sorted.map(t => (
                <li key={t.name} className={t.blockedReason && !t.approved ? 'is-blocked' : ''}>
                  <label>
                    <input
                      type="checkbox"
                      checked={t.approved}
                      disabled={!!t.blockedReason && !t.approved}
                      onChange={e => void setTool(t.name, e.target.checked)}
                    />
                    <code>{t.name}</code>
                    {catalog?.suggestedTools.includes(t.name) && !t.blockedReason && <span className="mcp-suggested">{en ? 'suggested' : 'empfohlen'}</span>}
                    {t.serverSaysReadOnly === false && <span className="mcp-writes">{en ? 'service says: can change data' : 'laut Dienst: kann ändern'}</span>}
                    {typeof t.approxTokens === 'number' && <span className="mcp-tokens">~{fmt(t.approxTokens)} Token</span>}
                  </label>
                  {t.description && <span className="settings-hint">{t.description.length > 280 ? `${t.description.slice(0, 280)} …` : t.description}</span>}
                  {t.blockedReason && <span className="mcp-tool-blocked">{t.blockedReason}</span>}
                  {t.serverSaysReadOnly === true && <span className="settings-hint">{en ? 'The server states: read only (not verified by MindGraph).' : 'Der Server gibt an: liest nur (von MindGraph nicht geprüft).'}</span>}
                </li>
              ))}
            </ul>
          </>
        )
      })()}
    </div>
  )
}

export function McpSection() {
  const en = useUIStore(s => s.language) === 'en'
  const vaultPath = useNotesStore(s => s.vaultPath)
  const [servers, setServers] = useState<McpServerSummary[]>([])
  const [blockers, setBlockers] = useState<Record<string, string>>({})
  const [sandbox, setSandbox] = useState<{ ok: boolean; reason?: string }>({ ok: true })
  const [mode, setMode] = useState<Mode | null>(null)
  const [stdio, setStdio] = useState<StdioForm>(EMPTY_STDIO)
  const [http, setHttp] = useState<HttpForm>(EMPTY_HTTP)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [importNote, setImportNote] = useState('')
  const [importFound, setImportFound] = useState<string[]>([])
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const res = await window.electronAPI.mcpList()
    if (!res.success) { setError(res.error || 'Fehler'); return }
    setServers(res.servers ?? [])
    setBlockers(res.blockers ?? {})
    setSandbox(res.sandbox ?? { ok: true })
  }, [])
  useEffect(() => { void reload() }, [reload])

  const pick = async (kind: 'file' | 'folder'): Promise<string | null> => {
    const res = await window.electronAPI.mcpPickPath(kind)
    return res.success ? res.path ?? null : null
  }

  const saveStdio = async () => {
    setSaving(true); setError('')
    const res = await window.electronAPI.mcpSaveStdio({
      label: stdio.label.trim() || (en ? 'Local program' : 'Lokales Programm'),
      command: stdio.command.trim(),
      ...(stdio.script.trim() ? { script: stdio.script.trim() } : {}),
      args: splitArgs(stdio.args),
      extraReadPaths: stdio.extraReadPaths,
      vaultRead: stdio.vaultRead,
      network: stdio.network,
      fullAccess: stdio.fullAccess
    })
    setSaving(false)
    if (!res.success) { setError(res.error || 'Fehler'); return }
    setStdio(EMPTY_STDIO); setMode(null)
    void reload()
  }
  const saveHttp = async () => {
    setSaving(true); setError('')
    const headers = Object.fromEntries(http.headers.filter(h => h.name.trim()).map(h => [h.name.trim(), h.value]))
    const res = await window.electronAPI.mcpSaveHttp({
      label: http.label.trim() || (http.bc ? 'Business Central' : (en ? 'Network server' : 'Externer Server')),
      url: http.url.trim(),
      headers,
      secretHeaders: !http.microsoft && !http.oauth && http.secretName.trim() && http.secretValue ? { [http.secretName.trim()]: http.secretValue } : {},
      ...(http.oauth && !http.microsoft ? { useOAuth: true } : {}),
      ...(http.bc ? { profile: 'business-central' as const } : {}),
      ...(http.microsoft ? { microsoft: { ...(http.msClientId.trim() ? { clientId: http.msClientId.trim() } : {}), ...(http.msTenant.trim() ? { tenant: http.msTenant.trim() } : {}) } } : {})
    })
    setSaving(false)
    if (!res.success) { setError(res.error || 'Fehler'); return }
    setHttp(EMPTY_HTTP); setMode(null)
    void reload()
  }
  const addCatalog = async (id: string) => {
    const entry = catalogEntry(id)
    if (!entry) return
    setError('')
    if (entry.kind === 'business-central') { setMode('http'); useBcTemplate(true); return }
    setAdding(id)
    const res = await window.electronAPI.mcpAddCatalog(id)
    setAdding(null)
    if (!res.success) { if (res.error && res.error !== 'Nicht verbunden.') setError(res.error); return }
    setImportFound(f => f.filter(x => x !== id))
    setJustAdded(res.server?.id ?? null)
    void reload()
  }
  const importConfig = async () => {
    setError(''); setImportNote('')
    const res = await window.electronAPI.mcpImportConfig()
    if (!res.success) { setError(res.error || 'Fehler'); return }
    if (res.canceled) return
    const found = res.found ?? []
    const names = (ids: string[]) => ids.map(id => catalogEntry(id)?.name ?? id).join(', ')
    setImportFound(found)
    setImportNote([
      found.length ? (en ? `Found: ${names(found)} — marked in the list above, connect with one click.` : `Gefunden: ${names(found)} — oben in der Liste markiert, mit einem Klick verbinden.`) : (en ? 'No service from the list found.' : 'Kein Dienst aus der Liste gefunden.'),
      res.already?.length ? (en ? `Already set up: ${names(res.already)}.` : `Schon eingerichtet: ${names(res.already)}.`) : '',
      res.unmatched?.length ? (en ? `Not taken over (not in the list, set up by hand if needed): ${res.unmatched.join(', ')}.` : `Nicht übernommen (nicht in der Liste, bei Bedarf von Hand einrichten): ${res.unmatched.join(', ')}.`) : ''
    ].filter(Boolean).join(' '))
  }
  const takenCatalog = new Set(servers.map(s => s.catalogId).filter(Boolean))
  const useBcTemplate = (on: boolean) => {
    setHttp(h => on
      ? { ...h, bc: true, microsoft: true, url: h.url || 'https://mcp.businesscentral.dynamics.com', headers: BC_REQUIRED_HEADERS.map(name => ({ name, value: h.headers.find(x => x.name === name)?.value ?? '' })) }
      : { ...h, bc: false })
  }

  return (
    <section className="settings-guard-card" aria-labelledby="mcp-title">
      <div className="settings-guard-head">
        <IconTile bg="#3f6f6a">{TILE_GLYPH.cpu}</IconTile>
        <div className="settings-guard-head-body">
          <h4 id="mcp-title" className="settings-guard-title">{en ? 'External services and tools (MCP)' : 'Externe Dienste und Werkzeuge (MCP)'}</h4>
          <p className="settings-guard-summary">
            {en
              ? 'The note agent may query approved tools of other services — for example your Plaud recordings or an ERP. You choose the services per run.'
              : 'Der Notiz-Agent darf freigegebene Werkzeuge anderer Dienste abfragen — zum Beispiel Ihre Plaud-Aufnahmen oder ein ERP. Die Dienste wählen Sie pro Lauf.'}
          </p>
        </div>
        <span className={`settings-guard-pill ${sandbox.ok ? 'is-on' : 'is-off'}`}>
          {sandbox.ok ? (en ? 'Sandbox available' : 'Sandbox verfügbar') : (en ? 'No sandbox here' : 'Keine Sandbox hier')}
        </span>
      </div>

      <div className="mcp-catalog-head">
        <span className="settings-guard-fixed-title">{en ? 'Connect a service' : 'Dienst verbinden'}</span>
        <button type="button" className="settings-btn-secondary" onClick={importConfig}>{en ? 'Take over from Claude Desktop / Cursor …' : 'Aus Claude Desktop / Cursor übernehmen …'}</button>
      </div>
      <ol className="mcp-steps settings-hint">
        <li>{en ? 'Choose a service — MindGraph shows what will be connected.' : 'Dienst wählen — MindGraph zeigt, was verbunden wird.'}</li>
        <li>{en ? 'Sign in in the browser — your password stays with the service.' : 'Im Browser anmelden — Ihr Passwort bleibt beim Dienst.'}</li>
        <li>{en ? 'Approve tools one by one — the agent only sees those.' : 'Werkzeuge einzeln freigeben — nur die sieht der Agent.'}</li>
      </ol>
      <div className="mcp-catalog">
        {MCP_CATALOG.map(c => {
          const taken = takenCatalog.has(c.id)
          return (
            <button key={c.id} type="button" className={`mcp-tile ${importFound.includes(c.id) ? 'is-found' : ''}`} onClick={() => void addCatalog(c.id)} disabled={taken || adding !== null}>
              <span className="mcp-tile-mark" style={{ background: c.color }} aria-hidden="true">{c.name.charAt(0)}</span>
              <span className="mcp-tile-body">
                <strong>{c.name}</strong>
                <span className="settings-hint">{en ? c.summary.en : c.summary.de}</span>
                <span className="mcp-tile-state">{taken ? (en ? 'Set up' : 'Eingerichtet') : adding === c.id ? (en ? 'Checking …' : 'Prüfe …') : importFound.includes(c.id) ? (en ? 'Found — connect' : 'Gefunden — verbinden') : (en ? 'Connect' : 'Verbinden')}</span>
              </span>
            </button>
          )
        })}
      </div>
      {importNote && <p className="settings-hint">{importNote}</p>}

      {servers.length === 0 && <p className="settings-hint">{en ? 'No service set up yet.' : 'Noch kein Dienst eingerichtet.'}</p>}
      {servers.map(s => (
        <ServerCard key={s.id} server={s} blocker={blockers[s.id]} en={en} vaultPath={vaultPath} onChanged={() => void reload()} highlight={s.id === justAdded} />
      ))}

      <div className="settings-guard-fixed">
        <span className="settings-guard-fixed-title">{en ? 'Who guarantees what' : 'Wer garantiert was'}</span>
        <ul>
          <li>{en ? 'Whether a tool only reads is decided by the other system (e.g. its configuration). MindGraph cannot check it.' : 'Ob ein Werkzeug nur liest, legt das fremde System fest (z.B. seine Konfiguration). MindGraph kann das nicht prüfen.'}</li>
          <li>{en ? 'The model only sees tools you approve here. If a tool’s description or parameters change, the approval lapses.' : 'Das Modell sieht nur Werkzeuge, die Sie hier freigeben. Ändert sich Beschreibung oder Parameter, erlischt die Freigabe.'}</li>
          <li>{en ? 'A run with external tools has no shell, web research, computer control or image generation — also in follow-up instructions.' : 'Ein Lauf mit externen Werkzeugen hat keine Shell, keine Webrecherche, keine Rechner-Steuerung und keine Bilderzeugung — auch in Folgeaufträgen.'}</li>
          <li>{en ? 'Local programs run in a sandbox: no home folder, no .mindgraph data, writing only in their own folder, network off unless allowed.' : 'Lokale Programme laufen in einer Sandbox: kein Benutzerordner, keine .mindgraph-Daten, Schreiben nur im eigenen Ordner, Netz aus, sofern nicht erlaubt.'}</li>
        </ul>
      </div>

      {error && <div className="settings-guard-warning">{error}</div>}

      {!mode && (
        <div className="mcp-add">
          <span className="settings-hint">{en ? 'Not in the list?' : 'Nicht in der Liste?'}</span>
          <button type="button" className="settings-btn-secondary" onClick={() => { setError(''); setMode('http') }}>{en ? 'Own network server …' : 'Eigener Server über das Netz …'}</button>
          <button type="button" className="settings-btn-secondary" onClick={() => { setError(''); setMode('stdio') }}>{en ? 'Own local program …' : 'Eigenes lokales Programm …'}</button>
        </div>
      )}

      {mode === 'stdio' && (
        <div className="mcp-form">
          <label>{en ? 'Name' : 'Name'}<input value={stdio.label} onChange={e => setStdio({ ...stdio, label: e.target.value })} placeholder={en ? 'e.g. Vault server' : 'z.B. Vault-Server'} /></label>
          <label>
            {en ? 'Program (full path, e.g. node)' : 'Programm (vollständiger Pfad, z.B. node)'}
            <span className="mcp-path">
              <input value={stdio.command} onChange={e => setStdio({ ...stdio, command: e.target.value })} placeholder="/opt/homebrew/bin/node" />
              <button type="button" className="settings-btn-secondary" onClick={async () => { const p = await pick('file'); if (p) setStdio(s => ({ ...s, command: p })) }}>{en ? 'Choose' : 'Auswählen'}</button>
            </span>
          </label>
          <label>
            {en ? 'Script (optional)' : 'Skript (optional)'}
            <span className="mcp-path">
              <input value={stdio.script} onChange={e => setStdio({ ...stdio, script: e.target.value })} placeholder="/…/server/index.js" />
              <button type="button" className="settings-btn-secondary" onClick={async () => { const p = await pick('file'); if (p) setStdio(s => ({ ...s, script: p })) }}>{en ? 'Choose' : 'Auswählen'}</button>
            </span>
          </label>
          <label>{en ? 'Arguments (optional)' : 'Argumente (optional)'}<input value={stdio.args} onChange={e => setStdio({ ...stdio, args: e.target.value })} /></label>
          <div className="settings-hint">{en ? 'Not allowed: npx, uvx, shells and similar launchers — they load code at runtime.' : 'Nicht erlaubt: npx, uvx, Shells und ähnliche Starter — sie laden zur Laufzeit Code nach.'}</div>
          <div>
            <span>{en ? 'Additional readable folders' : 'Zusätzlich lesbare Ordner'}: {stdio.extraReadPaths.length ? stdio.extraReadPaths.join(', ') : '—'}</span>{' '}
            <button type="button" className="settings-btn-secondary" onClick={async () => { const p = await pick('folder'); if (p) setStdio(s => ({ ...s, extraReadPaths: [...new Set([...s.extraReadPaths, p])] })) }}>{en ? 'Add folder' : 'Ordner hinzufügen'}</button>
          </div>
          <label className="mcp-check"><input type="checkbox" checked={stdio.vaultRead} onChange={e => setStdio({ ...stdio, vaultRead: e.target.checked })} />{en ? 'May read the open vault (never .mindgraph)' : 'Darf den geöffneten Vault lesen (nie .mindgraph)'}</label>
          <label className="mcp-check"><input type="checkbox" checked={stdio.network} onChange={e => setStdio({ ...stdio, network: e.target.checked })} />{en ? 'Network allowed' : 'Netz erlaubt'}</label>
          <label className="mcp-check">
            <input type="checkbox" checked={stdio.fullAccess} onChange={e => setStdio({ ...stdio, fullAccess: e.target.checked })} />
            {en ? 'Without sandbox, with full rights (only if the sandbox does not work)' : 'Ohne Sandbox, mit vollen Rechten (nur, wenn die Sandbox nicht geht)'}
          </label>
          {stdio.fullAccess && <div className="settings-guard-warning">{en ? 'This program can then do everything you can do on this computer, including reading files and sending them over the network.' : 'Dieses Programm kann dann alles, was Sie auf diesem Rechner können, auch Dateien lesen und ins Netz senden.'}</div>}
          <div className="mcp-add">
            <button type="button" className="settings-btn-primary" onClick={saveStdio} disabled={saving || !stdio.command.trim()}>{en ? 'Check and approve …' : 'Prüfen und freigeben …'}</button>
            <button type="button" className="settings-btn-secondary" onClick={() => setMode(null)}>{en ? 'Cancel' : 'Abbrechen'}</button>
          </div>
        </div>
      )}

      {mode === 'http' && (
        <div className="mcp-form">
          <label className="mcp-check"><input type="checkbox" checked={http.bc} onChange={e => useBcTemplate(e.target.checked)} />Business Central</label>
          {http.bc && (
            <div className="settings-hint">
              {en
                ? 'Company, environment and configuration are fixed here — the model cannot choose them. Only tools of the documented read pattern (List_…) can be approved. After saving, sign in with Microsoft; TenantId must be the tenant of that account.'
                : 'Firma, Umgebung und Konfiguration stehen hier fest — das Modell kann sie nicht wählen. Freigeben lassen sich nur Werkzeuge nach dem dokumentierten Lesemuster (List_…). Nach dem Speichern mit Microsoft anmelden; TenantId muss der Mandant dieses Kontos sein.'}
            </div>
          )}
          <label>{en ? 'Name' : 'Name'}<input value={http.label} onChange={e => setHttp({ ...http, label: e.target.value })} /></label>
          <label>{en ? 'Address (https)' : 'Adresse (https)'}<input value={http.url} onChange={e => setHttp({ ...http, url: e.target.value })} placeholder="https://…/mcp" /></label>
          {http.headers.map((h, i) => (
            <span key={i} className="mcp-path">
              <input value={h.name} onChange={e => setHttp({ ...http, headers: http.headers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder={en ? 'Header' : 'Kopfzeile'} disabled={http.bc && (BC_REQUIRED_HEADERS as readonly string[]).includes(h.name)} />
              <input value={h.value} onChange={e => setHttp({ ...http, headers: http.headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} placeholder={en ? 'Value' : 'Wert'} />
            </span>
          ))}
          {!http.bc && <button type="button" className="settings-btn-secondary" onClick={() => setHttp({ ...http, headers: [...http.headers, { name: '', value: '' }] })}>{en ? 'Add fixed header' : 'Feste Kopfzeile hinzufügen'}</button>}
          {!http.bc && <label className="mcp-check"><input type="checkbox" checked={http.oauth} onChange={e => setHttp({ ...http, oauth: e.target.checked, microsoft: e.target.checked ? false : http.microsoft })} />{en ? 'Sign in in the browser (OAuth, MCP standard)' : 'Anmeldung im Browser (OAuth, MCP-Standard)'}</label>}
          {http.oauth && <div className="settings-hint">{en ? 'MindGraph reads the sign-in details from the server before saving. It only signs in if the sign-in page is at the same address as the server.' : 'MindGraph liest die Anmeldedaten vor dem Speichern beim Server. Angemeldet wird nur, wenn die Anmeldeseite auf derselben Adresse liegt wie der Server.'}</div>}
          <label className="mcp-check"><input type="checkbox" checked={http.microsoft} onChange={e => setHttp({ ...http, microsoft: e.target.checked, oauth: e.target.checked ? false : http.oauth })} />{en ? 'Sign in via Microsoft (organisation account)' : 'Anmeldung über Microsoft (Organisationskonto)'}</label>
          {http.microsoft && (
            <span className="mcp-path">
              <input value={http.msClientId} onChange={e => setHttp({ ...http, msClientId: e.target.value })} placeholder={en ? 'Own application ID (optional)' : 'Eigene Anwendungs-ID (optional)'} />
              <input value={http.msTenant} onChange={e => setHttp({ ...http, msTenant: e.target.value })} placeholder={en ? 'Tenant (optional)' : 'Mandant (optional)'} />
            </span>
          )}
          {!http.microsoft && !http.oauth && <span className="mcp-path">
            <input value={http.secretName} onChange={e => setHttp({ ...http, secretName: e.target.value })} placeholder="Authorization" />
            <input type="password" value={http.secretValue} onChange={e => setHttp({ ...http, secretValue: e.target.value })} placeholder={en ? 'Secret value (encrypted)' : 'Geheimer Wert (verschlüsselt)'} />
          </span>}
          <div className="mcp-add">
            <button type="button" className="settings-btn-primary" onClick={saveHttp} disabled={saving || !http.url.trim()}>{en ? 'Check and approve …' : 'Prüfen und freigeben …'}</button>
            <button type="button" className="settings-btn-secondary" onClick={() => setMode(null)}>{en ? 'Cancel' : 'Abbrechen'}</button>
          </div>
        </div>
      )}
    </section>
  )
}
