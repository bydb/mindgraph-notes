// IPC für externe Werkzeuge (MCP) — Einstellungen. Plan: docs/codex-collab/mcp-anbindung.md.
//
// Handler werden in registerMcpIpc() angemeldet, nie beim Import (Importe laufen vor
// app.name und der Instanzsperre). Was aus index.ts gebraucht wird, kommt über `deps`.
//
// Sicherheitsmodell (E4): Der Renderer schlägt Einträge vor; gespeichert wird nur nach einem
// nativen Dialog des Main, der Programm, Argumente und Lesepfade bzw. Adresse im Wortlaut zeigt.
// Werkzeuge freigeben geht nur mit einer Prüfsumme, die der Main selbst bei einer Abfrage des
// Servers ermittelt hat — nie mit einer Angabe des Renderers.
import { app, dialog, ipcMain, safeStorage, shell, BrowserWindow, type IpcMainInvokeEvent, type MessageBoxOptions } from 'electron'
import { createMcpMicrosoftLogin, type McpMicrosoftLogin } from './microsoftLogin'
import { MicrosoftAuthError } from '../email/microsoftAuth'
import {
  type McpServerConfig, type McpToolView, type McpForeignData, toolBlockedReason
} from '../../shared/mcp'
import { createMcpStore, normalizeStdioInput, normalizeHttpInput, toolDefinitionHash, type StdioInput, type HttpInput, type McpStore } from './store'
import { openMcpSession, stdioStartBlocker } from './client'
import { programReadPaths, mcpSandboxAvailability, buildMcpSandboxProfile, verifyMcpSandbox, probeInterpreter, programVault, programInVaultMessage } from './sandbox'
import { promises as fs } from 'fs'
import * as path from 'path'
import { randomBytes } from 'crypto'
import { originNeedsPrivateApproval } from '../webResearch/egress'
import { createMcpOAuthLogin, discoverOAuth, type McpOAuthLogin } from './oauthLogin'
import { createMcpFetch } from './httpFetch'
import { sameEndpoints, type McpOAuthSpec } from '../../shared/mcpOAuth'
import { mcpToolTokenCost } from './agentTools'
import { catalogEntry, parseForeignMcpConfig } from '../../shared/mcpCatalog'

export interface McpIpcDeps {
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
  assertApprovedVault: (vaultPath: string, op: string) => void
  /** Alle Vaults, die der Main kennt — werden in jedem Profil gesperrt (Codex F10). */
  getApprovedVaultRoots: () => string[]
}

let storeSingleton: McpStore | null = null
/** Die eine Ablage unter userData — auch für den Lauf-Handler in index.ts. */
export function getMcpStore(): McpStore {
  if (!storeSingleton) {
    storeSingleton = createMcpStore(app.getPath('userData'), {
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: s => safeStorage.encryptString(s),
      decrypt: b => safeStorage.decryptString(b)
    })
  }
  return storeSingleton
}

let msSingleton: McpMicrosoftLogin | null = null
/** Microsoft-Anmeldung der MCP-Server — eigene Instanz, getrennt von den Mail-Konten (E14′). */
export function getMcpMicrosoftLogin(): McpMicrosoftLogin {
  if (!msSingleton) {
    msSingleton = createMcpMicrosoftLogin({
      getUserDataDir: () => app.getPath('userData'),
      // Linux `basic_text` ist keine Verschlüsselung (wie bei der Mail-Anmeldung).
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || (safeStorage as unknown as { getSelectedStorageBackend?: () => string }).getSelectedStorageBackend?.() !== 'basic_text'),
      encrypt: s => safeStorage.encryptString(s),
      decrypt: b => safeStorage.decryptString(b),
      openExternal: url => shell.openExternal(url)
    })
  }
  return msSingleton
}

let oauthSingleton: McpOAuthLogin | null = null
/** OAuth-Anmeldung der MCP-Server (Abschnitt 6) — eigene Ablage je Server. */
export function getMcpOAuthLogin(): McpOAuthLogin {
  if (!oauthSingleton) {
    oauthSingleton = createMcpOAuthLogin({
      getUserDataDir: () => app.getPath('userData'),
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || (safeStorage as unknown as { getSelectedStorageBackend?: () => string }).getSelectedStorageBackend?.() !== 'basic_text'),
      encrypt: s => safeStorage.encryptString(s),
      decrypt: b => safeStorage.decryptString(b),
      openExternal: url => shell.openExternal(url)
    })
  }
  return oauthSingleton
}

/** OAuth-Marke für einen Server — nur im Main, an Bindung und Anmeldung geknüpft. */
export function mcpOAuthToken(cfg: McpServerConfig): Promise<string> {
  if (!cfg.http?.oauth) return Promise.reject(new Error('Dieser Server nutzt keine OAuth-Anmeldung.'))
  return getMcpOAuthLogin().getToken(cfg.id, cfg.http.url, cfg.http.oauth)
}

/** Marke für einen Server — nur im Main, an das in der Bindung stehende Konto geknüpft. */
export function mcpMicrosoftToken(cfg: McpServerConfig): Promise<string> {
  return getMcpMicrosoftLogin().getToken(cfg.id, cfg.http?.microsoft?.account)
}

/** Für die Oberfläche: ein Eintrag ohne Geheimnisse und ohne Prüfsummen. */
function publicServer(cfg: McpServerConfig) {
  return {
    id: cfg.id,
    label: cfg.label,
    transport: cfg.transport,
    profile: cfg.profile ?? null,
    readOnlyConfirmed: !!cfg.readOnlyConfirmed,
    catalogId: cfg.catalogId ?? null,
    personalData: !!cfg.personalData,
    approvedTools: Object.keys(cfg.approvedTools).sort(),
    // Summe der bei der Freigabe geschätzten Kosten; ältere Freigaben ohne Wert → null (unbekannt).
    approvedTokens: Object.values(cfg.approvedTools).every(a => typeof a.tokens === 'number') ? Object.values(cfg.approvedTools).reduce((n, a) => n + (a.tokens ?? 0), 0) : null,
    ...(cfg.stdio ? {
      stdio: {
        command: cfg.stdio.command, script: cfg.stdio.script ?? null, args: cfg.stdio.args,
        programDir: cfg.stdio.programDir, extraReadPaths: cfg.stdio.extraReadPaths,
        vaultRead: cfg.stdio.vaultRead, network: cfg.stdio.network, fullAccess: cfg.stdio.fullAccess
      }
    } : {}),
    ...(cfg.http ? {
      http: {
        url: cfg.http.url, headers: cfg.http.headers, secretHeaderNames: cfg.http.secretHeaderNames, privateApproved: !!cfg.http.approvedPrivateOrigin,
        ...(cfg.http.microsoft ? { microsoft: { clientId: cfg.http.microsoft.clientId, tenant: cfg.http.microsoft.tenant, username: cfg.http.microsoft.account?.username ?? null } } : {}),
        ...(cfg.http.oauth ? { oauth: { issuer: cfg.http.oauth.endpoints.issuer, signedIn: !!cfg.http.oauth.loginId } } : {})
      }
    } : {})
  }
}
export type McpPublicServer = ReturnType<typeof publicServer>

/**
 * Personendaten + Cloud-Weg (Abschnitt 6, E31′, Codex F29/F33/F37): eigener nativer Dialog je Lauf,
 * unabhängig von der allgemeinen Cloud-Zustimmung. Geprüft werden die gewählten Server UND die aus
 * einem Vorauftrag geerbten (deren Daten stehen im übernommenen Verlauf). „Nicht mehr fragen“ gilt
 * je Server und Anbieter und fällt mit der Bindung. Zurück kommen die Bindungen der gewählten
 * Server, wie der Dialog sie sah — der Lauf startet nur mit genau diesen (F37).
 */
export async function confirmMcpPersonalDataForRun(
  sender: Electron.WebContents,
  selected: string[],
  inherited: McpForeignData | undefined,
  route: { kind: string; provider: string; providerLabel: string; model?: string }
): Promise<{ ok: true; bindings: Record<string, string> } | { ok: false; error: string }> {
  const store = getMcpStore()
  const bindings: Record<string, string> = {}
  for (const id of selected) {
    const cfg = await store.get(id)
    if (cfg) bindings[id] = cfg.bindingHash
  }
  if (route.kind !== 'cloud') return { ok: true, bindings }
  const ask = async (label: string, note: string, checkbox?: string) => {
    const win = BrowserWindow.fromWebContents(sender) || BrowserWindow.getFocusedWindow()
    const opts: MessageBoxOptions = {
      type: 'warning', buttons: ['Abbrechen', 'Trotzdem starten'], defaultId: 0, cancelId: 0,
      title: 'Personendaten an einen Cloud-Anbieter?',
      message: `Daten aus „${label}“ gehen in diesem Lauf an ${route.providerLabel}${route.model ? ` (${route.model})` : ''}.`,
      detail: [
        note,
        `Was der Agent bei „${label}“ abruft oder schon abgerufen hat, liest das Modell bei ${route.providerLabel} mit.`,
        'Mit einem lokalen Modell bleibt alles auf diesem Rechner.'
      ].join('\n'),
      ...(checkbox ? { checkboxLabel: checkbox, checkboxChecked: false } : {})
    }
    return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
  }
  const refuse = (label: string) => ({ ok: false as const, error: `Lauf nicht gestartet: Daten aus „${label}“ sollen nicht an ${route.providerLabel} gehen. Wählen Sie ein lokales Modell oder starten Sie ohne diesen Dienst bzw. mit einem neuen Auftrag.` })
  // Business Central liefert Kunden- und Lieferantendaten mit Ansprechpartnern (Codex F39).
  const isPersonal = (c: McpServerConfig) => !!c.personalData || c.profile === 'business-central'
  const noteFor = (c: McpServerConfig) => catalogEntry(c.catalogId ?? (c.profile === 'business-central' ? 'business-central' : undefined))?.dataNote.de ?? 'Dieser Dienst kann Personendaten liefern.'
  const asked = new Set<string>()

  // 1. Geerbte Daten nach dem Stand beim Aufruf beurteilen, nicht nach der heutigen Kennung (F40).
  for (const id of inherited?.servers ?? []) {
    const snap = inherited?.sources?.[id]
    const cfg = await store.get(id)
    const sameServer = !!snap && !!cfg && cfg.bindingHash === snap.binding
    const personal = !snap || snap.personal || !sameServer
    if (!personal) continue
    if (sameServer && cfg!.personalDataCloudAck?.includes(route.provider)) { asked.add(id); continue }
    const label = snap?.label ?? cfg?.label ?? id
    const res = await ask(label, snap ? (sameServer ? noteFor(cfg!) : 'Dieser Dienst wurde seit dem Vorauftrag geändert oder entfernt; seine Daten stehen aber im übernommenen Verlauf.') : 'Für diese Daten aus dem Vorauftrag ist nicht bekannt, ob sie Personendaten enthalten.',
      sameServer ? `Für „${label}“ mit ${route.providerLabel} nicht mehr fragen` : undefined)
    if (res.response !== 1) return refuse(label)
    if (sameServer && res.checkboxChecked) await store.addPersonalDataCloudAck(id, cfg!.bindingHash, route.provider)
    asked.add(id)
  }
  // 2. Für diesen Lauf gewählte Server.
  for (const id of selected) {
    if (asked.has(id)) continue
    const cfg = await store.get(id)
    if (!cfg || !isPersonal(cfg) || cfg.personalDataCloudAck?.includes(route.provider)) continue
    const res = await ask(cfg.label, noteFor(cfg), `Für „${cfg.label}“ mit ${route.providerLabel} nicht mehr fragen`)
    if (res.response !== 1) return refuse(cfg.label)
    if (res.checkboxChecked) await store.addPersonalDataCloudAck(id, cfg.bindingHash, route.provider)
  }
  // Während des Dialogs geändert? Dann gilt die Bestätigung nicht für den neuen Stand (F37).
  for (const id of selected) {
    const now = await store.get(id)
    if (now && bindings[id] && now.bindingHash !== bindings[id]) return { ok: false, error: `„${now.label}“ wurde während der Rückfrage geändert — bitte den Auftrag erneut starten.` }
  }
  return { ok: true, bindings }
}

async function confirm(event: IpcMainInvokeEvent, opts: MessageBoxOptions): Promise<boolean> {
  const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
  const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  return response === 1
}

const ok = <T extends object>(data: T) => ({ success: true as const, ...data })
const fail = (e: unknown) => ({ success: false as const, error: e instanceof Error ? e.message : String(e) })

export function registerMcpIpc(deps: McpIpcDeps): void {
  const store = getMcpStore()
  // Letzte Abfrage je Server: Bindung + Prüfsummen der Werkzeuge, wie der Main sie gesehen hat.
  const inspected = new Map<string, { bindingHash: string; tools: Map<string, { hash: string; blocked: string | null; description: string; params: string[]; tokens: number }> }>()

  const guard = (event: IpcMainInvokeEvent) => {
    if (!deps.isTrustedSender(event)) throw new Error('Nicht autorisierter Aufrufer')
  }

  ipcMain.handle('mcp-list', async (event) => {
    try {
      guard(event)
      const servers = await store.list()
      const blockers: Record<string, string> = {}
      for (const s of servers) {
        const b = await stdioStartBlocker(s).catch(() => null)
        if (b) blockers[s.id] = b
      }
      const sandbox = mcpSandboxAvailability()
      return ok({ servers: servers.map(publicServer), blockers, sandbox: sandbox.ok ? { ok: true } : { ok: false, reason: sandbox.reason } })
    } catch (e) { return fail(e) }
  })

  ipcMain.handle('mcp-pick-path', async (event, kind: 'file' | 'folder') => {
    try {
      guard(event)
      const win = BrowserWindow.fromWebContents(event.sender)
      const opts = { properties: [kind === 'folder' ? 'openDirectory' as const : 'openFile' as const, 'showHiddenFiles' as const] }
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      return ok({ path: res.canceled ? null : res.filePaths[0] ?? null })
    } catch (e) { return fail(e) }
  })

  async function saveStdio(event: IpcMainInvokeEvent, input: StdioInput & { id?: string }) {
    try {
      guard(event)
      const { spec, fileHashes } = await normalizeStdioInput(input)
      const before = input.id ? (await store.get(input.id))?.bindingHash ?? null : undefined
      const sandbox = mcpSandboxAvailability()
      if (!spec.fullAccess && !sandbox.ok) throw new Error(`${sandbox.reason.replace('der Shell', 'für externe Programme')} Ohne Sandbox geht es nur mit ausdrücklich gewählten vollen Rechten.`)
      const knownVaults = await Promise.all(deps.getApprovedVaultRoots().map(v => fs.realpath(v).catch(() => v)))
      const inVault = programVault(spec, knownVaults)
      if (inVault) throw new Error(programInVaultMessage(inVault))
      const readable = programReadPaths(spec)
      const hasLock = Object.keys(fileHashes).some(p => p !== spec.command && p !== spec.script)
      const lines = [
        `Programm: ${spec.command}`,
        spec.script ? `Skript: ${spec.script}` : '',
        spec.args.length ? `Argumente: ${spec.args.join(' ')}` : '',
        '',
        spec.fullAccess
          ? 'OHNE SANDBOX: Dieses Programm kann alles, was Sie auf diesem Rechner können, auch Dateien lesen und ins Netz senden.'
          : [
              `Lesbar: ${readable.join(', ')}${spec.vaultRead ? ', der jeweils geöffnete Vault (ohne .mindgraph)' : ''}`,
              'Schreiben: nur in einen eigenen Arbeitsordner',
              `Netz: ${spec.network ? 'erlaubt' : 'gesperrt'}`
            ].join('\n'),
        '',
        `Sie vertrauen diesem Programm und allem in seinem Ordner ${spec.programDir}.`,
        hasLock
          ? 'Ändert sich Programm, Skript oder die Sperrdatei der Abhängigkeiten, startet es erst nach erneuter Freigabe.'
          : 'Es gibt keine Sperrdatei der Abhängigkeiten — Änderungen daran werden nicht bemerkt. Ändert sich Programm oder Skript, startet es erst nach erneuter Freigabe.',
        spec.fullAccess
          ? 'Nach der Freigabe startet MindGraph das Programm einmal mit einer Versionsabfrage. Schlägt das fehl, wird nichts gespeichert.'
          : 'Nach der Freigabe prüft MindGraph die Sandbox und startet das Programm einmal darin mit einer Versionsabfrage. Schlägt das fehl, wird nichts gespeichert.',
        'MindGraph kann nicht prüfen, ob die Werkzeuge dieses Programms nur lesen.'
      ].filter(l => l !== '')
      const yes = await confirm(event, {
        type: 'warning',
        buttons: ['Abbrechen', spec.fullAccess ? 'Mit vollen Rechten freigeben' : 'Freigeben'],
        defaultId: 0,
        cancelId: 0,
        title: 'Lokales Programm als externes Werkzeug freigeben?',
        message: `„${input.label}“ als externes Werkzeug für den Notiz-Agenten freigeben?`,
        detail: lines.join('\n')
      })
      if (!yes) return fail('Nicht freigegeben.')
      // Erst NACH der Freigabe starten (Codex F09): ein unbestätigtes Programm läuft nie, auch nicht
      // zur Probe. Mit dem echten Profil (alle bekannten Vaults gesperrt) und dem echten
      // Interpreter (E21). Schlägt es fehl, wird nichts gespeichert.
      const probeDir = path.join(app.getPath('userData'), 'mcp-work', `.probe-${randomBytes(4).toString('hex')}`)
      await fs.mkdir(probeDir, { recursive: true, mode: 0o700 })
      let probe: 'ok' | 'skipped'
      try {
        const realProbe = await fs.realpath(probeDir)
        if (spec.fullAccess) {
          probe = await probeInterpreter(null, spec.command, realProbe)
        } else {
          const sbSpec = { workDir: realProbe, programDir: spec.programDir, command: spec.command, script: spec.script, extraReadPaths: spec.extraReadPaths, network: spec.network, knownVaults }
          const profilePath = `${realProbe}.sb`
          await fs.writeFile(profilePath, buildMcpSandboxProfile(sbSpec), { mode: 0o600 })
          try {
            await verifyMcpSandbox(profilePath, sbSpec)
            probe = await probeInterpreter(profilePath, spec.command, realProbe)
          } finally {
            await fs.rm(profilePath, { force: true }).catch(() => undefined)
          }
        }
      } catch (e) {
        throw new Error(`Freigegeben, aber nicht gespeichert: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        await fs.rm(probeDir, { recursive: true, force: true }).catch(() => undefined)
      }
      const cfg = await store.put({ id: input.id, label: input.label, transport: 'stdio', stdio: spec }, fileHashes, undefined, before)
      inspected.delete(cfg.id)
      return ok({ server: publicServer(cfg), probe })
    } catch (e) { return fail(e) }
  }
  ipcMain.handle('mcp-save-stdio', (event, input: StdioInput & { id?: string }) => saveStdio(event, input))

  ipcMain.handle('mcp-save-http', async (event, rawInput: HttpInput & { id?: string; useOAuth?: boolean }) => {
    try {
      guard(event)
      // `oauth` setzt nur der Main (Codex F22): eine Angabe des Renderers wird verworfen.
      const { oauth: _fromRenderer, useOAuth, ...input } = rawInput
      void _fromRenderer
      let approvedPrivateOrigin: string | undefined
      let url: URL
      try { url = new URL(input.url.trim()) } catch { throw new Error('Adresse: keine gültige URL.') }
      if (await originNeedsPrivateApproval(url.toString())) {
        const yes = await confirm(event, {
          type: 'warning', buttons: ['Abbrechen', 'Erlauben'], defaultId: 0, cancelId: 0,
          title: 'Adresse im eigenen Netz erlauben?',
          message: 'Der externe Server liegt in Ihrem lokalen Netz.',
          detail: `Adresse: ${url.origin}\n\nNur erlauben, wenn Sie diesen Dienst selbst betreiben oder Ihre IT ihn bereitstellt.`
        })
        if (!yes) return fail('Adresse im eigenen Netz wurde nicht freigegeben.')
        approvedPrivateOrigin = url.origin
      }
      const existing = input.id ? await store.get(input.id) : undefined
      // Bereits hinterlegte Geheimnisse bleiben nur bei GLEICHER Adresse (Origin). Bei einer neuen
      // Adresse gingen sie sonst an einen anderen Dienst (Codex F04) — dann neue Werte verlangen.
      let originChanged = false
      if (existing?.http) {
        try { originChanged = new URL(existing.http.url).origin !== url.origin } catch { originChanged = true }
      }
      const carried = originChanged ? [] : (existing?.http?.secretHeaderNames ?? [])
      const secretHeaders: Record<string, string> = { ...Object.fromEntries(carried.map(n => [n, ''])), ...(input.secretHeaders ?? {}) }
      if (originChanged) {
        const missing = Object.entries(secretHeaders).filter(([, v]) => !v.trim()).map(([k]) => k)
        if (missing.length) throw new Error(`Neue Adresse: Bitte die geheimen Werte neu eingeben (${missing.join(', ')}) — die bisherigen werden nicht an eine andere Adresse geschickt.`)
      }
      // OAuth (Abschnitt 6, E26′): Anmeldeweg VOR dem Dialog im Main ermitteln — nur am Origin der
      // Adresse, nur https. Er steht im Dialog und geht in die Bindung ein.
      let oauth: McpOAuthSpec | undefined
      if (useOAuth) {
        if (approvedPrivateOrigin) throw new Error('OAuth-Anmeldung gibt es nur für https-Adressen im Internet.')
        const found = await discoverOAuth(url.toString(), createMcpFetch())
        oauth = { endpoints: found.endpoints, resource: '', scopes: found.scopes }
      }
      const spec = normalizeHttpInput({ ...input, secretHeaders, approvedPrivateOrigin, ...(oauth ? { oauth: { ...oauth, resource: (() => { const u = new URL(input.url.trim()); u.hash = ''; return u.toString() })() } } : {}) })
      // Eine bestehende Microsoft-Anmeldung bleibt nur bei gleicher Adresse und gleicher
      // Registrierung erhalten; sonst ist eine neue Anmeldung nötig (Bindung, E16′).
      const prevMs = existing?.http?.microsoft
      if (spec.microsoft && prevMs?.account && !originChanged && prevMs.clientId.toLowerCase() === spec.microsoft.clientId.toLowerCase() && prevMs.tenant.toLowerCase() === spec.microsoft.tenant.toLowerCase()) {
        spec.microsoft = { ...spec.microsoft, account: prevMs.account }
      }
      // Erst NACH erfolgreichem Speichern abmelden — ein abgebrochener Dialog ändert nichts.
      const dropMsLogin = !!(existing && prevMs?.account && !spec.microsoft?.account)
      const shown = Object.entries(spec.headers).map(([k, v]) => `${k}: ${v}`)
      const yes = await confirm(event, {
        type: 'warning', buttons: ['Abbrechen', 'Freigeben'], defaultId: 0, cancelId: 0,
        title: 'Externen Server über das Netz freigeben?',
        message: `„${input.label}“ als externes Werkzeug für den Notiz-Agenten freigeben?`,
        detail: [
          `Adresse: ${spec.url}`,
          shown.length ? `Feste Angaben: ${shown.join(' · ')}` : '',
          spec.secretHeaderNames.length ? `Geheime Angaben (verschlüsselt gespeichert): ${spec.secretHeaderNames.join(', ')}` : '',
          spec.microsoft ? `Anmeldung: über Microsoft (Anwendungs-ID ${spec.microsoft.clientId}, Mandant ${spec.microsoft.tenant}) — nach dem Speichern „Mit Microsoft anmelden“.` : '',
          spec.oauth ? `Anmeldung: im Browser bei ${new URL(spec.oauth.endpoints.authorizationEndpoint).origin} (gleiche Adresse wie der Server) — nach dem Speichern „Anmelden“.` : '',
          '',
          'Was der Agent an diesen Server schickt (Suchbegriffe, Filter) und dessen Antworten gehen über diese Adresse.',
          input.profile === 'business-central'
            ? 'Ob die Werkzeuge nur lesen, legt die Konfiguration in Business Central fest — nicht MindGraph.'
            : 'MindGraph kann nicht prüfen, ob die Werkzeuge dieses Servers nur lesen.'
        ].filter(Boolean).join('\n')
      })
      if (!yes) return fail('Nicht freigegeben.')
      // Nach dem Dialog: Hat sich der Eintrag inzwischen geändert (zweite Änderung parallel), wird
      // abgelehnt statt überschrieben (Codex F18). Konfiguration + Geheimnisse in EINER Transaktion.
      const cfg = await store.put({ id: input.id, label: input.label, transport: 'http', http: spec, ...(input.profile ? { profile: input.profile } : {}) }, undefined, input.secretHeaders ?? {}, input.id ? (existing?.bindingHash ?? null) : undefined)
      if (dropMsLogin) await getMcpMicrosoftLogin().logout(cfg.id).catch(() => undefined)
      // Eine gespeicherte OAuth-Anmeldung passt nach jeder Änderung nicht mehr (Bindung) — verwerfen.
      if (existing?.http?.oauth) await getMcpOAuthLogin().logout(cfg.id).catch(() => undefined)
      inspected.delete(cfg.id)
      return ok({ server: publicServer(cfg) })
    } catch (e) { return fail(e) }
  })

  /**
   * Dienst aus dem Katalog verbinden (Abschnitt 6, E24′). Der Renderer schickt NUR die ID; Adresse,
   * Anmeldeweg und Name kommen aus der Vorlage in der App (Codex F22). Die Metadaten des Dienstes
   * werden nur verglichen: weichen sie ab, wird nichts gespeichert.
   */
  ipcMain.handle('mcp-add-catalog', async (event, catalogId: string) => {
    try {
      guard(event)
      const entry = catalogEntry(catalogId)
      if (!entry || entry.kind !== 'oauth' || !entry.url || !entry.oauth) throw new Error('Unbekannter Dienst.')
      if ((await store.list()).some(s => s.catalogId === entry.id)) throw new Error(`${entry.name} ist schon eingerichtet.`)
      let live
      try {
        live = await discoverOAuth(entry.url, createMcpFetch())
      } catch (e) {
        throw new Error(`${entry.name} ist gerade nicht erreichbar oder hat seine Anmeldung geändert: ${e instanceof Error ? e.message : String(e)}`)
      }
      if (!sameEndpoints(live.endpoints, entry.oauth.endpoints)) {
        throw new Error(`${entry.name} meldet inzwischen über andere Adressen an als in MindGraph hinterlegt. Aus Sicherheitsgründen wird nicht verbunden — bitte MindGraph aktualisieren.`)
      }
      const spec = normalizeHttpInput({ label: entry.name, url: entry.url, oauth: { endpoints: entry.oauth.endpoints, resource: entry.url, scopes: entry.oauth.scopes } })
      const yes = await confirm(event, {
        type: 'warning', buttons: ['Abbrechen', 'Verbinden'], defaultId: 0, cancelId: 0,
        title: `${entry.name} verbinden?`,
        message: `${entry.name} als externen Dienst für den Notiz-Agenten verbinden?`,
        detail: [
          `Vorlage aus MindGraph: ${entry.name}`,
          `Adresse: ${spec.url}`,
          `Anmeldung: im Browser bei ${new URL(entry.oauth.endpoints.authorizationEndpoint).origin} (gleiche Adresse wie der Dienst).`,
          '',
          entry.dataNote.de,
          'Was der Agent an diesen Dienst schickt (Suchbegriffe, Filter) und dessen Antworten gehen über diese Adresse.',
          'MindGraph kann nicht prüfen, ob die Werkzeuge dieses Dienstes nur lesen. Sie geben jedes Werkzeug einzeln frei.',
          '',
          'Nächster Schritt: „Anmelden“ — die Anmeldung öffnet sich im Browser.'
        ].join('\n')
      })
      if (!yes) return fail('Nicht verbunden.')
      const cfg = await store.put({ label: entry.name, transport: 'http', http: spec, catalogId: entry.id, ...(entry.personalData ? { personalData: true } : {}) }, undefined, {}, undefined)
      inspected.delete(cfg.id)
      return ok({ server: publicServer(cfg) })
    } catch (e) { return fail(e) }
  })

  /** Anmeldung im Browser für GENAU diesen Server (Abschnitt 6). Neue Anmeldung = Werkzeuge neu freigeben. */
  ipcMain.handle('mcp-oauth-login', async (event, id: string) => {
    try {
      guard(event)
      const cfg = await store.get(id)
      if (!cfg?.http?.oauth) throw new Error('Dieser Server nutzt keine Anmeldung im Browser.')
      const pending = await getMcpOAuthLogin().login(id, cfg.http.url, { ...cfg.http.oauth, loginId: undefined })
      if (getMcpOAuthLogin().cancelledSince(pending)) throw new Error('Anmeldung abgebrochen.')
      // Erst den Eintrag umschalten (prüft, dass er sich während der Anmeldung nicht geändert hat),
      // dann die Marke aktivieren (Codex F34). Scheitert das Umschalten, bleibt die alte Anmeldung.
      const next = await store.put({
        id, label: cfg.label, transport: 'http', http: { ...cfg.http, oauth: { ...cfg.http.oauth, loginId: pending.loginId } },
        ...(cfg.profile ? { profile: cfg.profile } : {}), ...(cfg.catalogId ? { catalogId: cfg.catalogId } : {}), ...(cfg.personalData ? { personalData: true } : {})
      }, undefined, undefined, cfg.bindingHash)
      try {
        await getMcpOAuthLogin().commit(id, pending)
      } catch (e) {
        // Eintrag trägt die neue Kennung, die Marke fehlt: den ALTEN Eintrag samt Kennung und
        // Freigaben zurücksetzen (Codex F41) — die alte Anmeldedatei ist ja unverändert.
        const restored = await store.restore(cfg, next.bindingHash).then(() => true, () => false)
        throw new Error(`Die Anmeldung konnte nicht gespeichert werden (${e instanceof Error ? e.message : String(e)}).${restored ? ' Die bisherige Anmeldung gilt weiter.' : ' Bitte erneut anmelden.'}`)
      }
      inspected.delete(id)
      return ok({ server: publicServer(next) })
    } catch (e) { return fail(e) }
  })
  ipcMain.handle('mcp-oauth-cancel', async (event) => {
    try { guard(event); getMcpOAuthLogin().cancelLogin(); return ok({}) } catch (e) { return fail(e) }
  })
  ipcMain.handle('mcp-oauth-logout', async (event, id: string) => {
    try {
      guard(event)
      const cfg = await store.get(id)
      await getMcpOAuthLogin().logout(id)
      if (cfg?.http?.oauth?.loginId) {
        const { loginId: _dropped, ...rest } = cfg.http.oauth
        void _dropped
        await store.put({
          id, label: cfg.label, transport: 'http', http: { ...cfg.http, oauth: rest },
          ...(cfg.profile ? { profile: cfg.profile } : {}), ...(cfg.catalogId ? { catalogId: cfg.catalogId } : {}), ...(cfg.personalData ? { personalData: true } : {})
        }, undefined, undefined, cfg.bindingHash)
      }
      inspected.delete(id)
      return ok({})
    } catch (e) { return fail(e) }
  })

  /**
   * Konfiguration eines anderen Programms auswerten (E32′, Codex F30). Die Datei wählt der Nutzer
   * im Main-Dialog; zurück gehen nur Katalog-IDs und die Namen nicht erkannter Einträge.
   */
  ipcMain.handle('mcp-import-config', async (event) => {
    try {
      guard(event)
      const win = BrowserWindow.fromWebContents(event.sender)
      // Dort öffnen, wo die Datei üblicherweise liegt — kaum jemand kennt den Ort. Gelesen wird
      // trotzdem nur, was der Nutzer im Dialog auswählt.
      const home = app.getPath('home')
      const candidates = process.platform === 'darwin'
        ? [path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), path.join(home, '.cursor', 'mcp.json')]
        : process.platform === 'win32'
          ? [path.join(app.getPath('appData'), 'Claude', 'claude_desktop_config.json'), path.join(home, '.cursor', 'mcp.json')]
          : [path.join(home, '.config', 'Claude', 'claude_desktop_config.json'), path.join(home, '.cursor', 'mcp.json')]
      let defaultPath: string | undefined
      for (const c of candidates) { if (await fs.stat(c).then(() => true, () => false)) { defaultPath = c; break } }
      const opts = { title: 'MCP-Konfiguration von Claude Desktop oder Cursor wählen', ...(defaultPath ? { defaultPath } : {}), properties: ['openFile' as const, 'showHiddenFiles' as const], filters: [{ name: 'JSON', extensions: ['json'] }] }
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      const file = res.canceled ? null : res.filePaths[0]
      if (!file) return ok({ canceled: true })
      const st = await fs.stat(file)
      if (st.size > 1024 * 1024) throw new Error('Die Datei ist größer als 1 MB.')
      const parsed = parseForeignMcpConfig(await fs.readFile(file, 'utf8'))
      const existing = new Set((await store.list()).map(s => s.catalogId).filter(Boolean))
      return ok({ found: parsed.found.filter(id => !existing.has(id)), already: parsed.found.filter(id => existing.has(id)), unmatched: parsed.unmatched })
    } catch (e) { return fail(e) }
  })

  /** Anmeldung über Microsoft für GENAU diesen Server (Abschnitt 5). Der Browser ist die Bestätigung. */
  ipcMain.handle('mcp-ms-login', async (event, id: string) => {
    try {
      guard(event)
      const cfg = await store.get(id)
      if (!cfg?.http?.microsoft) throw new Error('Dieser Server nutzt keine Microsoft-Anmeldung.')
      const account = await getMcpMicrosoftLogin().login(id, { clientId: cfg.http.microsoft.clientId, tenant: cfg.http.microsoft.tenant })
      // Konto in die Bindung schreiben: ein anderes Konto = neue Werkzeugfreigaben (E16′).
      const next = await store.put({ id, label: cfg.label, transport: 'http', http: { ...cfg.http, microsoft: { ...cfg.http.microsoft, account } }, ...(cfg.profile ? { profile: cfg.profile } : {}) }, undefined, undefined, cfg.bindingHash)
      inspected.delete(id)
      return ok({ server: publicServer(next) })
    } catch (e) {
      return fail(e instanceof MicrosoftAuthError ? e.message : e)
    }
  })
  ipcMain.handle('mcp-ms-cancel', async (event) => {
    try { guard(event); getMcpMicrosoftLogin().cancelLogin(); return ok({}) } catch (e) { return fail(e) }
  })
  ipcMain.handle('mcp-ms-logout', async (event, id: string) => {
    try {
      guard(event)
      const cfg = await store.get(id)
      await getMcpMicrosoftLogin().logout(id)
      if (cfg?.http?.microsoft?.account) {
        const { account: _dropped, ...rest } = cfg.http.microsoft
        void _dropped
        await store.put({ id, label: cfg.label, transport: 'http', http: { ...cfg.http, microsoft: rest }, ...(cfg.profile ? { profile: cfg.profile } : {}) }, undefined, undefined, cfg.bindingHash)
      }
      inspected.delete(id)
      return ok({})
    } catch (e) { return fail(e) }
  })

  ipcMain.handle('mcp-remove', async (event, id: string) => {
    try {
      guard(event)
      await getMcpMicrosoftLogin().logout(id).catch(() => undefined)
      await getMcpOAuthLogin().logout(id).catch(() => undefined)
      await store.remove(id)
      inspected.delete(id)
      return ok({})
    } catch (e) { return fail(e) }
  })

  /** Server verbinden und Werkzeuge anzeigen. vaultPath = der geöffnete Vault — ohne Lesefreigabe wird er gesperrt. */
  ipcMain.handle('mcp-inspect', async (event, id: string, vaultPath?: string) => {
    try {
      guard(event)
      const cfg = await store.get(id)
      if (!cfg) throw new Error('Unbekannter Server.')
      if (vaultPath) deps.assertApprovedVault(vaultPath, 'mcp-inspect')
      const t0 = Date.now()
      const session = await openMcpSession(cfg, store, { vaultPath, knownVaults: deps.getApprovedVaultRoots(), getMicrosoftToken: mcpMicrosoftToken, getOAuthToken: mcpOAuthToken })
      try {
        const tools = new Map<string, { hash: string; blocked: string | null; description: string; params: string[]; tokens: number }>()
        const views: McpToolView[] = session.tools.map(t => {
          const hash = toolDefinitionHash(t)
          const blocked = toolBlockedReason(cfg.id, t, cfg.profile)
          const params = Object.keys((t.inputSchema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {})
          tools.set(t.name, { hash, blocked, description: (t.description ?? '').slice(0, 600), params, tokens: mcpToolTokenCost(cfg.id, cfg.label, t) })
          const approved = cfg.approvedTools[t.name]
          return {
            name: t.name,
            description: (t.description ?? '').slice(0, 1000),
            definitionHash: hash,
            approved: !!approved && approved.definitionHash === hash && !blocked,
            ...(blocked ? { blockedReason: blocked } : approved && approved.definitionHash !== hash ? { blockedReason: 'Seit der Freigabe geändert — bitte prüfen und neu freigeben.' } : {}),
            ...(typeof t.annotations?.readOnlyHint === 'boolean' ? { serverSaysReadOnly: t.annotations.readOnlyHint } : {}),
            approxTokens: mcpToolTokenCost(cfg.id, cfg.label, t)
          }
        })
        inspected.set(id, { bindingHash: cfg.bindingHash, tools })
        // Geänderte Freigaben gleich zurückziehen, damit Anzeige und Ablage übereinstimmen.
        for (const [name, a] of Object.entries(cfg.approvedTools)) {
          const now = tools.get(name)
          if (!now || now.hash !== a.definitionHash || now.blocked) await store.setToolApproval(id, cfg.bindingHash, name, null)
        }
        return ok({ tools: views, ms: Date.now() - t0 })
      } finally {
        await session.close()
      }
    } catch (e) { return fail(e) }
  })

  ipcMain.handle('mcp-set-tool', async (event, id: string, toolName: string, approved: boolean) => {
    try {
      guard(event)
      const cfg = await store.get(id)
      if (!cfg) throw new Error('Unbekannter Server.')
      if (!approved) return ok({ server: publicServer(await store.setToolApproval(id, cfg.bindingHash, toolName, null)) })
      const seen = inspected.get(id)
      if (!seen || seen.bindingHash !== cfg.bindingHash) throw new Error('Bitte den Server zuerst verbinden („Werkzeuge anzeigen“).')
      const tool = seen.tools.get(toolName)
      if (!tool) throw new Error('Dieses Werkzeug bietet der Server nicht an.')
      if (tool.blocked) throw new Error(tool.blocked)
      if (cfg.profile === 'business-central' && !cfg.readOnlyConfirmed) throw new Error('Bitte zuerst bestätigen, dass die Konfiguration in Business Central nur Leserechte hat.')
      // Jede einzelne Freigabe ist eine Nutzerentscheidung im Main-Dialog (E6, Codex F01): ein
      // eingeschleuster Renderer könnte sonst nach einem eigenen „Werkzeuge anzeigen“ beliebige
      // Werkzeuge freischalten.
      const yes = await confirm(event, {
        type: 'question', buttons: ['Abbrechen', 'Freigeben'], defaultId: 0, cancelId: 0,
        title: 'Externes Werkzeug freigeben?',
        message: `„${toolName}“ von „${cfg.label}“ für den Notiz-Agenten freigeben?`,
        detail: [
          tool.description || '(ohne Beschreibung)',
          '',
          tool.params.length ? `Parameter: ${tool.params.join(', ')}` : 'Ohne Parameter.',
          '',
          cfg.profile === 'business-central'
            ? 'Ob es nur liest, legt die Konfiguration in Business Central fest.'
            : 'MindGraph kann nicht prüfen, ob dieses Werkzeug nur liest. Geben Sie es nur frei, wenn der Anbieter das zusagt.',
          'Ändert der Server Beschreibung oder Parameter, erlischt die Freigabe.'
        ].join('\n')
      })
      if (!yes) return fail('Nicht freigegeben.')
      // Zwischen Anzeige und Klick kann eine neue Abfrage gelaufen sein — gegen den Stand von jetzt prüfen.
      const now = inspected.get(id)?.tools.get(toolName)
      if (!now || now.hash !== tool.hash || (await store.get(id))?.bindingHash !== cfg.bindingHash) throw new Error('Das Werkzeug hat sich inzwischen geändert — bitte neu verbinden.')
      return ok({ server: publicServer(await store.setToolApproval(id, cfg.bindingHash, toolName, tool.hash, tool.tokens)) })
    } catch (e) { return fail(e) }
  })

  ipcMain.handle('mcp-confirm-readonly', async (event, id: string, confirmed: boolean) => {
    try {
      guard(event)
      const cfg = await store.get(id)
      if (!cfg) throw new Error('Unbekannter Server.')
      if (confirmed) {
        const yes = await confirm(event, {
          type: 'question', buttons: ['Abbrechen', 'Bestätigen'], defaultId: 0, cancelId: 0,
          title: 'Nur Leserechte bestätigen',
          message: `Hat die Konfiguration „${cfg.http?.headers.ConfigurationName ?? ''}“ in Business Central nur Leserechte?`,
          detail: 'In der MCP-Konfiguration (Seite 8350) darf bei allen API-Objekten nur „Allow Read“ angehakt sein, und „Unblock Edit Tools“ muss aus sein. MindGraph kann das nicht selbst prüfen — Ihre Bestätigung wird gespeichert und gilt, bis sich die Einstellungen des Servers ändern.'
        })
        if (!yes) return fail('Nicht bestätigt.')
      }
      return ok({ server: publicServer(await store.setReadOnlyConfirmed(id, confirmed)) })
    } catch (e) { return fail(e) }
  })

  /** Nach einer Änderung an Programm/Skript/Sperrdatei: mit denselben Angaben neu freigeben. */
  ipcMain.handle('mcp-reapprove', async (event, id: string) => {
    try {
      guard(event)
      const cfg = await store.get(id)
      if (!cfg?.stdio) throw new Error('Nur lokale Programme werden neu freigegeben.')
      const s = cfg.stdio
      // Derselbe Weg wie beim Anlegen — inklusive Dialog im Wortlaut und neuen Prüfsummen.
      // Die Bindung ändert sich dadurch, die Werkzeugfreigaben müssen neu erteilt werden.
      return await saveStdio(event, { id, label: cfg.label, command: s.command, script: s.script, args: s.args, extraReadPaths: s.extraReadPaths, vaultRead: s.vaultRead, network: s.network, fullAccess: s.fullAccess })
    } catch (e) { return fail(e) }
  })

}
