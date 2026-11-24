// Notiz-Agent: IPC-Handler für Anhänge, Vorabprüfung des Modellwegs, Laufstart, Abbruch,
// Ergebnis übernehmen/ansehen/verwerfen und das Agent-Gedächtnis.
//
// Am 23.11.2026 unverändert aus main/index.ts herausgelöst (Muster: main/email/ipc.ts).
// Die Handler werden erst in registerNoteAgentIpc() angemeldet, nicht beim Import.
// Was der Block aus index.ts braucht, kommt über NoteAgentIpcDeps herein.
import { BrowserWindow, ipcMain, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { loadWebResearchConfig, loadProviderKey } from '../webResearch/config'
import { isWebResearchConfigComplete, extractUrlsFromInstruction, KEY_PROVIDERS } from '../../shared/webResearch'
import { setAiProvenanceInContent, todayIsoDate } from '../../shared/aiProvenance'
import { isHardLocked as isModelHardLocked, shellLockReason } from '../../shared/modelCompatibility'
import { createAgentOcrState } from '../ocr/agentOcr'
import { isCloudChatBackend, warmPricingCache, type ChatOptions as LlmChatOptions, type CloudChatBackend, type ChatMessage } from '../llm/chatClient'
import { collectRunTotals } from '../llm/telemetry'
import { sanitizeChatContext } from './chatContext'
import { agentContextInfo, ollamaModelContextMax } from './localContext'
import { chooseAgentContext, agentContextNote } from '../../shared/agentContext'
import { type CloudProviderSettings } from '../../shared/llmBackend'
import { petrolCloudAllowed } from '../../shared/webChat'
import { isTrustedSender } from '../plugins/transport'
import { getMcpStore, mcpMicrosoftToken, mcpOAuthToken, confirmMcpPersonalDataForRun } from '../mcp/ipc'
import { prepareMcpForRun, closeMcpForRun, mcpProvenance, type McpRunState } from '../mcp/agentTools'
import { mcpRunGate } from '../../shared/mcp'
import { registerContextAttachment, registerContextFolder, removeContextAttachment, clearContextAttachments } from './contextFiles'
import { startRun, peekContinuation, dropContinuation, inheritContinuation, type RunContinuation, getRunForSender, finishRun, publicResults, takeResult, peekResult, cancelRunsForSender, pruneRunIfConsumed, consumeEvictedRuns, totalFolderReads, nextSeq, type WebRunState, type AgentRun } from './runRegistry'
import { updateComparisons } from '../comparisonStore'
import { addSession, setAccepted } from '../../shared/comparison/model'
import type { WorkSession } from '../../shared/comparison/types'
import { buildDayOverview } from './dayOverview'
import type { DayLogOrigin } from '../../shared/dayLog'
import { recordActivity } from '../activityLedger'
import { MAX_RUN_SKILLS, deriveActivityType } from '../../shared/activityLog'
import { vaultActivityKey } from '../skillActivityId'
import { acquireStayAwake } from '../powerGuard'
import { runNoteAgentLoop, agentRequestTimeoutMs } from './loop'
import { authorizeShell, probeShellEnvironment } from './shellExecution'
import { sandboxAvailability as shellSandboxAvailability } from './shellSandbox'
import { normalizeShellGuardrails, describeShellGuardrails } from '../../shared/shellGuardrails'
import { authorizeComputer, computerControlAvailability, usableComputerVerbs } from './computerControl'
import { normalizeComputerControl, describeComputerControl, activeComputerVerbs, computerVerbLabel } from '../../shared/computerControl'
import { getShellAttachmentPaths } from './contextFiles'
import { suggestAgentMemory } from './memorySuggestion'
import { cleanupOldStaging, assertInsideRunStaging, reserveFreeName, stagingDirFor } from './staging'
import { ensureHtmlPageAssets, ensureHtmlBrandLogo, HTML_BRAND_ASSET_DIR } from './htmlAssets'
import { HTML_PAGE_ASSETS_DIRNAME } from '../../shared/scientificHtmlPage'
import { loadBrandForRun } from '../brand/brandService'
import { listEnabledSkillHeaders, readAgentMemory, appendAgentMemory, agentMemoryStatus } from './skillsLoader'
import { isAppInternalRealPath } from '../telegram/agent/tools/vaultPaths'
import { supportsNativeToolCalls, isNonGenerativeModel } from '../../shared/modelCompatibility'
import { OllamaCapabilityResolver } from '../ollamaCapabilities'
import { VaultRagManager } from '../rag/vaultRagManager'
import { withOllamaActivity } from '../rag/ollamaActivity'
import type { VaultQueryResult } from '../rag/vaultRetrieve'
import { resolveLocalModel, LocalModelError } from '../rag/localModel'
import { classifyRoute, evaluateCloudGate, type AgentRoute } from '../../shared/agentRoute'
import { probeImageView, AGENT_IMAGE_VIEW_BUDGET } from './describeImage'
import { isLocalOnlyInSettings } from '../llm/localOnlyGuard'


export async function classifyAgentRoute(backend: 'ollama' | 'lmstudio' | 'openrouter' | 'llmbase', model: string): Promise<AgentRoute> {
  if (backend !== 'ollama') return classifyRoute(backend, model)
  try {
    await resolveLocalModel(model)
    return classifyRoute('ollama', model, { ok: true })
  } catch (err) {
    const reason = err instanceof LocalModelError ? err.reason : 'unreachable'
    return classifyRoute('ollama', model, { ok: false, reason })
  }
}

export interface NoteAgentIpcDeps {
  loadUISettings: () => Promise<Record<string, unknown>>
  assertSafePath: (requestedPath: string, op: string) => Promise<string>
  assertApprovedVault: (vaultPath: string, op: string) => void
  findApprovedRootForPath: (filePath: string) => string | null
  getApprovedVaultRoots: () => string[]
  resolveCloudChatOptions: (cloud: { model?: string; provider?: string } | null | undefined) => Promise<
    { backend: CloudChatBackend; chatOptions: LlmChatOptions; provider: CloudChatBackend; model: string; key: string } | null
  >
  writeFileSafe: (filePath: string, content: string, opts?: { exclusive?: boolean; origin?: DayLogOrigin; created?: boolean }) => Promise<void>
  ollamaCapabilityResolver: OllamaCapabilityResolver
  getVaultRagManager: () => VaultRagManager
  getLMStudioUrl: (port?: unknown) => string
}

export function registerNoteAgentIpc(deps: NoteAgentIpcDeps): void {
  const {
    loadUISettings, assertSafePath, assertApprovedVault, findApprovedRootForPath, getApprovedVaultRoots,
    resolveCloudChatOptions, writeFileSafe, ollamaCapabilityResolver, getVaultRagManager, getLMStudioUrl
  } = deps

  /**
   * Hängt eine gemessene Arbeitssitzung an einen Vergleichsfall.
   *
   * Die Dauer ist gemessen, die Lage im Tag rekonstruiert (`bis` minus Dauer) — für die
   * Kennzahlen zählt die Dauer, für die Durchlaufzeit die eigenen Zeitstempel des Falls.
   * Fehler bleiben still: Ein Vergleichsfall darf keinen Agent-Lauf scheitern lassen.
   */
  function recordComparisonSession(
    vaultPath: string,
    caseId: string | undefined,
    kind: WorkSession['kind'],
    durationMs: number | undefined,
    bis: number
  ): void {
    if (!caseId || typeof durationMs !== 'number' || durationMs <= 0) return
    const session: WorkSession = {
      kind,
      from: Math.max(0, bis - durationMs),
      to: bis,
      origin: 'vordergrund-automatisch'
    }
    void updateComparisons(vaultPath, d => {
      const vorhanden = d.cases.find(c => c.id === caseId)
      // Ein bereits abgeschlossener Fall nimmt nichts mehr an — dann geht die Sitzung
      // verloren, und das ist richtig so: Nachträgliches Anhängen wäre nicht prüfbar.
      if (!vorhanden || vorhanden.state !== 'offen') return d
      return { ...d, cases: d.cases.map(c => (c.id === caseId ? addSession(c, session) : c)) }
    }).catch(() => undefined)
  }

  // ── Notiz-Agent Phase 1: Kontext-Dateien für die Macher-Leiste ────────────────
  // Design: docs/note-agent-harness-plan.md §2. Der Renderer erhält nur Attachment-IDs;
  // Pfade (insb. außerhalb des Vaults) bleiben Main-seitig. Die OS-Dialog-Auswahl ist
  // der Freigabe-Akt (gleiche Logik wie open-vault) — der Renderer kann sich keine
  // Freigaben selbst erteilen.
  const NOTE_AGENT_FILE_FILTERS = [
    { name: 'Dokumente und Bilder', extensions: ['xlsx', 'xls', 'docx', 'pptx', 'pdf', 'md', 'markdown', 'txt', 'csv', 'html', 'htm', 'png', 'jpg', 'jpeg'] }
  ]
  const noteAgentCleanupHooked = new Set<number>()

  function hookNoteAgentCleanup(sender: Electron.WebContents): void {
    if (noteAgentCleanupHooked.has(sender.id)) return
    noteAgentCleanupHooked.add(sender.id)
    const senderId = sender.id
    sender.once('destroyed', () => {
      clearContextAttachments(senderId)
      // Fenster zu = Lauf terminal (F10): laufender Agent wird abgebrochen,
      // verspätete Ergebnisse werden nicht mehr registriert.
      cancelRunsForSender(senderId)
      noteAgentCleanupHooked.delete(senderId)
    })
  }

  ipcMain.handle('note-agent-attach-dialog', async (event) => {
    if (!isTrustedSender(event)) return { attachments: [], errors: ['Nicht autorisierter Aufrufer'] }
    const result = await dialog.showOpenDialog({
      title: 'Kontext-Dateien anhängen',
      properties: ['openFile', 'multiSelections'],
      filters: NOTE_AGENT_FILE_FILTERS
    })
    if (result.canceled || result.filePaths.length === 0) return { attachments: [], errors: [] }
    hookNoteAgentCleanup(event.sender)
    const attachments: unknown[] = []
    const errors: string[] = []
    for (const p of result.filePaths) {
      // Liegt die Datei in einem freigegebenen Vault? (Nur Metadatum für die UI —
      // die Dialog-Auswahl selbst ist die Lese-Freigabe.)
      let insideVault = false
      let chosenPath = p
      let vaultRoot: string | undefined
      try {
        chosenPath = await assertSafePath(p, 'note-agent-attach-dialog')
        insideVault = true
        vaultRoot = findApprovedRootForPath(chosenPath) ?? undefined
      } catch {
        /* außerhalb des Vaults — bewusst erlaubt */
      }
      const res = await registerContextAttachment(event.sender.id, chosenPath, insideVault, vaultRoot)
      if (res.ok) attachments.push(res.attachment)
      else errors.push(res.error)
    }
    return { attachments, errors }
  })

  ipcMain.handle('note-agent-attach-vault-file', async (event, vaultPath: string, relPath: string) => {
    if (!isTrustedSender(event)) return { attachments: [], errors: ['Nicht autorisierter Aufrufer'] }
    try {
      assertApprovedVault(vaultPath, 'note-agent-attach-vault-file')
      // R03: kanonisch (realpath) auflösen — ein Vault-interner Symlink auf eine externe
      // Datei/einen externen Ordner wird so abgewiesen, nicht registriert und gelesen.
      const fullPath = await assertSafePath(path.join(vaultPath, relPath), 'note-agent-attach-vault-file')
      hookNoteAgentCleanup(event.sender)
      // C01: den approved Vault-Root an den Anhang binden — vor jedem späteren Read wird
      // erneut realpath dagegen geprüft (Schutz gegen Attach→Symlink-Swap→Read).
      const vaultRoot = findApprovedRootForPath(fullPath) ?? path.resolve(vaultPath)
      // Ordner-Kontext (Stufe 1): derselbe Weg akzeptiert auch Vault-Ordner.
      const st = await fs.stat(fullPath)
      const res = st.isDirectory()
        ? await registerContextFolder(event.sender.id, fullPath, true, vaultRoot)
        : await registerContextAttachment(event.sender.id, fullPath, true, vaultRoot)
      return res.ok ? { attachments: [res.attachment], errors: [] } : { attachments: [], errors: [res.error] }
    } catch (error) {
      return { attachments: [], errors: [error instanceof Error ? error.message : 'Unbekannter Fehler'] }
    }
  })

  // Ordner-Kontext (Stufe 1): OS-Ordnerdialog — die Auswahl ist die Lese-Freigabe.
  ipcMain.handle('note-agent-attach-folder-dialog', async (event) => {
    if (!isTrustedSender(event)) return { attachments: [], errors: ['Nicht autorisierter Aufrufer'] }
    const result = await dialog.showOpenDialog({
      title: 'Ordner als Kontext anhängen',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return { attachments: [], errors: [] }
    hookNoteAgentCleanup(event.sender)
    const attachments: unknown[] = []
    const errors: string[] = []
    for (const p of result.filePaths) {
      let insideVault = false
      let chosenPath = p
      let vaultRoot: string | undefined
      try {
        chosenPath = await assertSafePath(p, 'note-agent-attach-folder-dialog')
        insideVault = true
        vaultRoot = findApprovedRootForPath(chosenPath) ?? undefined
      } catch {
        /* außerhalb des Vaults — bewusst erlaubt */
      }
      const res = await registerContextFolder(event.sender.id, chosenPath, insideVault, vaultRoot)
      if (res.ok) attachments.push(res.attachment)
      else errors.push(res.error)
    }
    return { attachments, errors }
  })

  ipcMain.handle('note-agent-detach', async (event, id: string) => {
    removeContextAttachment(event.sender.id, id)
    return { success: true }
  })

  // ── Notiz-Agent Phase 2: Agent-Loop mit Skills (Modus B) ─────────────────────
  // Design: docs/note-agent-harness-plan.md §4. Run-Registry erzwingt einen Lauf
  // pro Fenster; Ergebnisse landen im Staging und werden über opake Handles
  // übernommen/verworfen — der Renderer sieht nie Pfade.
  interface NoteAgentRunParams {
    vaultPath: string
    noteId: string
    noteContent: string
    instruction: string
    // Chatverlauf aus „Im Auftrag weitermachen“ — nur Kontext, nie Auftrag (chat-uebergabe-kontext.md, A).
    chatContext?: string
    model: string
    attachmentIds: string[]
    targetFolderRel: string
    // Lokales Backend, das der Nutzer in den Einstellungen gewählt hat. Ohne diese
    // Angabe liefe ein LM-Studio-Modell gegen Ollama (falscher Server, irreführender
    // Fehler) — der Renderer schickt deshalb sein `ollama.backend` mit.
    localBackend?: 'ollama' | 'lmstudio'
    lmStudioPort?: number
    // Cloud-Routing — nur gesetzt, wenn per 'note-agent'-Opt-in freigegeben.
    cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null
    // Webrecherche für diesen Lauf (Globus-Toggle) — nur { enabled }, die Provider-Config
    // liegt Main-seitig (0d). Der Main seedet die erlaubte URL-Liste aus dem Auftrag (0f).
    webResearch?: { enabled: boolean } | null
    // Nur Anfrage. Die tatsächliche Freigabe entsteht unten durch einen nativen Dialog.
    shellAccess?: boolean
    // Ebenfalls nur Anfrage: Rechner-Steuerung (Programme ansprechen). Die freigegebenen
    // Vorgänge liest der Main aus ui-settings.json — dieser Parameter trägt sie nicht.
    computerAccess?: boolean
    // Aktive Zeit, die der Nutzer mit dem Formulieren verbracht hat (Wirkungsbilanz).
    // Renderer-Messung: nur bei Fenster im Vordergrund, gedeckelt.
    instructionMs?: number
    // Vergleichsfall, zu dem dieser Lauf gehört (Vergleichsmodus, optional).
    comparisonCaseId?: string
    // Folgelauf: `instruction` ist dann die Antwort des Nutzers auf die letzte Nachricht
    // dieses Laufs. Verlauf und Datensätze holt der Main selbst — nie aus dem Renderer.
    continueFromRunId?: string
    // Externe Werkzeuge (MCP) für diesen Lauf — nur Server-Kennungen. Programm, Adresse,
    // Freigaben und Geheimnisse liest der Main aus seiner eigenen Ablage (E4).
    mcpServers?: string[]
  }

  // ── Modellweg des Agenten: Einstufung + Cloud-Freigabe (Codex F15/F26–F28) ──────────
  // EINE Regel für Vorabprüfung (Karte, vor dem Start) und Laufstart. Die Karte zeigt vorher
  // den Preflight, während des Laufs ausschließlich den beim Start gespeicherten Befund.


  /**
   * Darf dieser Lauf über einen Cloud-Weg gehen? Main-seitig aus ui-settings.json, nicht aus
   * Renderer-Parametern: (1) OpenRouter/LLMBase nur mit Feature-Opt-in `note-agent` und genau
   * dem dort eingestellten Modell, (2) jeder Cloud-Weg — auch Ollama-Cloud — nur mit der
   * versionierten Zustimmung zu Cloud-Läufen mit Vault-Zugriff. Kein Sperren der Cloud an
   * sich: der Nutzer entscheidet, aber bewusst (Produktlinie „Transparenz statt Sperre“).
   */
  async function checkNoteAgentCloudGate(route: AgentRoute, cloudModel: string | undefined): Promise<{ ok: true } | { ok: false; code: 'optin' | 'consent'; error: string }> {
    if (route.kind !== 'cloud') return { ok: true }
    const ui = await loadUISettings().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>
    const verdict = evaluateCloudGate(route, cloudModel, ui as Parameters<typeof evaluateCloudGate>[2])
    if (verdict.ok) return { ok: true }
    if (verdict.code === 'optin') {
      return { ok: false, code: 'optin', error: `${route.providerLabel} ist für den Notiz-Agenten nicht freigegeben (Einstellungen → KI → Cloud-Anbieter → Notiz-Agent).` }
    }
    return { ok: false, code: 'consent', error: `Cloud-Läufe mit Vault-Zugriff brauchen deine ausdrückliche Zustimmung (${route.providerLabel}) — im Agent-Tab auf der Karte oder unter Einstellungen → KI & Modelle → „Notiz-Agent: Cloud-Läufe mit Vault-Zugriff“.` }
  }

  // Vorabprüfung für die Karte. Keine Schlüssel, kein Lauf — nur Weg, Freigabe und Zustimmung.
  ipcMain.handle('note-agent-route-preflight', async (event, params: { model: string; localBackend?: 'ollama' | 'lmstudio'; cloud?: { model: string; provider?: 'openrouter' | 'llmbase' } | null }) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    try {
      const backend = params.cloud?.model ? (params.cloud.provider === 'llmbase' ? 'llmbase' : 'openrouter') : (params.localBackend === 'lmstudio' ? 'lmstudio' : 'ollama')
      const model = params.cloud?.model ?? params.model ?? ''
      const route = await classifyAgentRoute(backend, model)
      const gate = await checkNoteAgentCloudGate(route, params.cloud?.model)
      // Katalog vorwärmen (Preise + Kontextfenster): sonst bekommt die erste Webfrage der Sitzung
      // den kleinen Rahmen, weil der kalte Katalogabruf länger als die 3 s Wartezeit dauert
      // (GUI-Test 28.10.2026). Nur ein GET auf die Modellliste, keine Inhalte.
      // Nur, wenn dieser Weg für Chat oder Agent freigegeben ist (Codex F12): eine reine Anzeige
      // soll mit gesperrter Cloud keinen Netzaufruf auslösen.
      const cloudCleared = gate.ok || petrolCloudAllowed(params.cloud, ((await loadUISettings()).ollama as { openrouter?: CloudProviderSettings; llmbase?: CloudProviderSettings } | undefined))
      // LLMBase genauso (18.11.2026): vorher nur OpenRouter — der erste LLMBase-Lauf nach einer
      // Pause holte den Katalog kalt selbst, verpasste die 3 s und rechnete mit 32 768 Token.
      if ((backend === 'openrouter' || backend === 'llmbase') && params.cloud?.model && cloudCleared) {
        void resolveCloudChatOptions(params.cloud).then(r => { if (r) warmPricingCache(r.chatOptions) }).catch(() => undefined)
      }
      // Bilder ansehen (describe_image): dieselbe Prüfung wie beim Laufstart, damit die Karte
      // VOR dem Start sagt, ob das Modell Bilder sieht oder nur erkannten Text bekommt (Codex F20).
      const probe = await probeImageView(route, backend, model)
      const imageView = 'state' in probe ? { ok: true as const, model: probe.state.model, budget: AGENT_IMAGE_VIEW_BUDGET } : { ok: false as const, reason: probe.reason }
      return { success: true, route, gate, imageView }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Kontextfenster-Einstellung: Maximum des Modells, aktuelle Speicherbelegung, Arbeitsspeicher.
  // Nur Abfragen am lokalen Ollama, keine Inhalte.
  ipcMain.handle('note-agent-context-info', async (event, params: { model: string }) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    try {
      const model = typeof params?.model === 'string' ? params.model : ''
      const route = await classifyAgentRoute('ollama', model)
      if (route.kind !== 'local') return { success: true, local: false }
      return { success: true, local: true, ...(await agentContextInfo(model)) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Web-Provenienz fürs done-Event (Renderer zeigt „N Suchen · M Seiten" + Liste). Enthält
  // bewusst NUR das, was tatsächlich passiert ist — inkl. Fehlversuchen.
  function webRunProvenance(run: { web?: WebRunState }): { queries: Array<{ query: string; status: string }>; fetches: Array<{ url: string; title: string; status: string; partial?: boolean; browserOnly?: boolean }>; searchCount: number; fetchCount: number } | undefined {
    const w = run.web
    if (!w) return undefined
    return {
      queries: w.queries,
      fetches: w.fetches.map(f => ({ url: f.finalUrl, title: f.title, status: f.status, ...(f.partial ? { partial: true } : {}), ...(f.browserOnly ? { browserOnly: true } : {}) })),
      searchCount: w.searchCount,
      fetchCount: w.fetchCount
    }
  }

  ipcMain.handle('note-agent-run', async (event, params: NoteAgentRunParams) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    try {
      assertApprovedVault(params.vaultPath, 'note-agent-run')
      // R01: Zielordner kanonisch (realpath) auflösen und an den Run binden — nicht
      // nur lexikalisch (`validatePath`), sonst würde ein Vault-interner Symlink nach
      // außen die Grenze aushebeln. Der kanonische Pfad wird beim Accept erneut geprüft.
      let targetAbs: string
      try {
        targetAbs = await assertSafePath(path.join(params.vaultPath, params.targetFolderRel), 'note-agent-run-target')
      } catch {
        return { success: false, error: `Zielordner nicht erlaubt: ${params.targetFolderRel}` }
      }
      // Codex F29: der interne App-Ordner ist kein Zielordner — sonst listet
      // list_target_folder dort Dateinamen, und die Übernahme schriebe hinein.
      if (await isAppInternalRealPath(params.vaultPath, targetAbs)) {
        return { success: false, error: `Zielordner nicht erlaubt (interner App-Ordner): ${params.targetFolderRel}` }
      }
      const targetStat = await fs.stat(targetAbs).catch(() => null)
      if (!targetStat?.isDirectory()) {
        return { success: false, error: `Zielordner nicht gefunden: ${params.targetFolderRel}` }
      }
      if (!params.instruction?.trim()) {
        return { success: false, error: 'Keine Anweisung angegeben' }
      }
      if (params.shellAccess === true && params.webResearch?.enabled) {
        return { success: false, error: 'Shell-Zugriff und Webrecherche-Modus können nicht im selben Lauf aktiviert werden.' }
      }
      // Folgelauf: Verlauf und Datensätze des Vorgängers JETZT sichern — startRun entfernt einen
      // beendeten Vorgänger ohne offene Karten sofort. Nur derselbe Absender, derselbe Vault,
      // ein erfolgreich beendeter Lauf, keine Webrecherche (dort gilt „genau ein Ergebnis“).
      let continuation: { priorMessages: ChatMessage[]; answer: string; priorTokens?: number; prev: RunContinuation } | undefined
      if (typeof params.continueFromRunId === 'string') {
        if (params.webResearch?.enabled) {
          return { success: false, error: 'Läufe mit Webrecherche lassen sich nicht fortsetzen — starte den Auftrag neu.' }
        }
        const prev = peekContinuation(event.sender.id, params.continueFromRunId)
        if (!prev || prev.vaultPath !== params.vaultPath) {
          return { success: false, error: 'Dieser Lauf lässt sich nicht mehr fortsetzen — starte den Auftrag neu.' }
        }
        continuation = { priorMessages: prev.transcript, answer: params.instruction.trim(), priorTokens: prev.transcriptTokens, prev }
      }
      if (params.shellAccess === true) {
        // Zweistufiges Opt-in wie bei der Webrecherche, HIER durchgesetzt und nicht nur im
        // Renderer: Stufe 1 ist das Modul (ui-settings.json, Main-seitige Kopie der
        // Einstellungen), Stufe 2 der Schalter pro Lauf plus nativer Dialog.
        const ui = await loadUISettings().catch(() => ({} as Record<string, unknown>))
        if (ui.agentShellEnabled !== true) {
          return { success: false, error: 'Shell-Zugriff ist nicht freigeschaltet (Einstellungen → Module → „Agent-Shell“).' }
        }
        // Fail-closed: ohne erzwingbare Schutzgrenzen keine Shell — vor dem Dialog, damit der
        // Nutzer nicht erst bestätigt und dann eine Ablehnung liest.
        const sandbox = shellSandboxAvailability()
        if (!sandbox.ok) return { success: false, error: sandbox.reason }
        // Eigene Modellregel (shellLockReason): die Matrix-Sperre unten kann für
        // `note-agent` nie feuern, mit Shell fehlt aber die Prüfung vor der Wirkung.
        if (!params.cloud?.model) {
          const reason = shellLockReason(params.model)
          if (reason) return { success: false, error: `Modell "${params.model}" bekommt keine Shell: ${reason}.` }
        }
      }

      if (params.computerAccess === true && params.webResearch?.enabled) {
        // Gleiche Trennung wie bei der Shell, hier aus einem konkreteren Grund: eine
        // präparierte Webseite, die ein Mail-Ziel oder einen Kurzbefehl vorgibt, hätte
        // sonst einen Weg nach draußen. Recherche und Wirkung am Rechner bleiben getrennte Läufe.
        return { success: false, error: 'Rechner-Steuerung und Webrecherche-Modus können nicht im selben Lauf aktiviert werden.' }
      }
      if (params.computerAccess === true) {
        // Zweistufiges Opt-in, HIER durchgesetzt: Stufe 1 ist das Modul in der Main-Kopie der
        // Einstellungen, Stufe 2 der Schalter pro Lauf plus nativer Dialog weiter unten.
        const ui = await loadUISettings().catch(() => ({} as Record<string, unknown>))
        if (ui.agentComputerEnabled !== true) {
          return { success: false, error: 'Die Rechner-Steuerung ist nicht freigeschaltet (Einstellungen → Module → „Rechner-Steuerung“).' }
        }
        const avail = computerControlAvailability()
        if (!avail.ok) return { success: false, error: avail.reason }
        if (activeComputerVerbs(normalizeComputerControl(ui.agentComputer)).length === 0) {
          return { success: false, error: 'Für die Rechner-Steuerung ist kein Vorgang freigegeben (Einstellungen → KI → Rechner-Steuerung).' }
        }
        // Dieselbe Modellregel wie bei der Shell, und aus demselben Grund: hier wirkt eine
        // Modellausgabe außerhalb der App, bevor ein Mensch sie gesehen hat.
        if (!params.cloud?.model) {
          const reason = shellLockReason(params.model)
          if (reason) return { success: false, error: `Modell "${params.model}" bekommt keine Rechner-Steuerung: ${reason}.` }
        }
      }

      // Matrix-Sperre + Capability-Gate — nur für lokale Modelle; OpenRouter/
      // LLMBase normalisieren Tool-Calls über die OpenAI-kompatible API.
      // Ehrlich: `note-agent` ist nicht damageRelevant, isHardLocked liefert hier heute
      // IMMER false (rot warnt nur in der UI). Der Aufruf bleibt, damit die Sperre ohne
      // weitere Änderung greift, sobald das Modul nach Wiederholungs-Runs damageRelevant wird.
      const localBackend = params.localBackend === 'lmstudio' ? 'lmstudio' : 'ollama'
      if (!params.cloud?.model) {
        if (isModelHardLocked(params.model, 'note-agent')) {
          return { success: false, error: `Modell "${params.model}" ist für den Notiz-Agenten gesperrt (rot in der Kompatibilitäts-Matrix).` }
        }
        // Embedding-/Reranker-Modelle sind in KEINEM Backend sinnvoll — der Check ist
        // reine Namensheuristik, aber billig und verhindert einen sicher nutzlosen Lauf.
        if (isNonGenerativeModel(params.model)) {
          return { success: false, error: `Modell "${params.model}" ist ein Embedding-/Reranker-Modell und kann keinen Agent-Loop ausführen.` }
        }
        // Ollama liefert `capabilities` und ist damit die autoritative Quelle. Bei
        // LM Studio wird NICHT nach Modellnamen gegatet, sondern LM Studio selbst
        // antworten gelassen: eine abgelehnte Tool-Anfrage kommt als klarer Fehler
        // zurück (friendlyLmStudioError), genau wie bei OpenRouter/LLMBase.
        // Namensraten war exakt der Bug, der gemma4 aussperrte.
        // TODO: LM Studios NATIVE REST-API (/api/v1/models, nicht das OpenAI-kompatible
        // /v1/models) liefert inzwischen `trained_for_tool_use` + Kontextlängen — damit
        // ließe sich auch hier VOR dem Lauf gaten statt erst am Fehler. Nachziehen,
        // sobald der LM-Studio-Pfad überhaupt GUI-getestet ist.
        if (localBackend === 'ollama'
          && !(await ollamaCapabilityResolver.supportsTools(params.model, supportsNativeToolCalls))) {
          return { success: false, error: `Modell "${params.model}" unterstützt kein natives Tool-Calling — der Agent-Loop braucht ein Modell mit der Capability "tools".` }
        }
      }

      let chatOptions: LlmChatOptions
      // Modellbezeichnung für die KI-Provenienz der übernommenen Ergebnisse — bei
      // Cloud-Routing mit Provider-Präfix, gleiche Konvention wie in der KI-Leiste.
      let provenanceModel = params.model
      if (params.cloud?.model) {
        const cloudResolved = await resolveCloudChatOptions(params.cloud)
        if (!cloudResolved) {
          return { success: false, error: 'Cloud ist für den Notiz-Agenten gewählt, aber kein API-Key hinterlegt (Einstellungen → KI → Cloud-Provider).' }
        }
        chatOptions = cloudResolved.chatOptions
        provenanceModel = `${cloudResolved.provider}/${cloudResolved.model}`
      } else if (localBackend === 'lmstudio') {
        chatOptions = {
          backend: 'lmstudio',
          lmstudioModel: params.model,
          lmstudioUrl: getLMStudioUrl(params.lmStudioPort)
        }
      } else {
        chatOptions = { backend: 'ollama', ollamaModel: params.model }
      }

      // Einstufung des Weges VOR jedem Vault-Inhalt (Skills, Gedächtnis, Anhänge, Loop) —
      // aus den echten chatOptions, erneut geprüft (Metadaten können seit dem Preflight gewechselt
      // haben). Ergebnis bleibt am Lauf; die Karte zeigt während des Laufs nur diesen Befund.
      const route = await classifyAgentRoute(
        chatOptions.backend as 'ollama' | 'lmstudio' | 'openrouter' | 'llmbase',
        params.cloud?.model ?? params.model
      )
      const gate = await checkNoteAgentCloudGate(route, params.cloud?.model)
      if (!gate.ok) return { success: false, error: gate.error, code: gate.code, route }

      // Kontextfenster laut Einstellung (shared/agentContext.ts) — nur für nachweislich lokale
      // Ollama-Läufe. Ollama-Cloud und LM Studio bleiben beim Standard. Der Main liest den Wert
      // selbst und begrenzt ihn auf das Maximum des Modells: ein zu großes `num_ctx` kürzt Ollama
      // still, das Budget rechnete dann mit Platz, den es nicht gibt.
      let contextNote: string | null = null
      if (chatOptions.backend === 'ollama' && route.kind === 'local') {
        const ui = await loadUISettings().catch(() => ({} as Record<string, unknown>))
        const wanted = chooseAgentContext(ui.noteAgentLocalContextTokens, null).wanted
        if (wanted > chooseAgentContext(undefined, null).wanted) {
          const modelMax = await ollamaModelContextMax(params.model)
          const choice = chooseAgentContext(wanted, modelMax)
          if (choice.numCtx) chatOptions = { ...chatOptions, numCtx: choice.numCtx }
          contextNote = agentContextNote(choice, modelMax)
        }
      }

      // Cloud-Läufe: Ausgabegrenze setzen und OpenRouter pro Request auf Zero Data
      // Retention festlegen. In einem Praxistest endete ein Cloud-Lauf mitten im
      // letzten Abschnitt, weil ohne max_tokens der Anbieter-Default greift.
      //
      // BEWUSST NUR CLOUD. Ollama setzt von sich aus kein num_predict, die Ausgabe ist
      // dort nur vom Kontextfenster begrenzt — ein Limit hier würde lokal eine Decke
      // einziehen, die es nie gab, und eine große Ordner-Auswertung abschneiden.
      // Ebenso bewusst KEINE temperature/top_p: Die Modelle bringen abgestimmte Werte mit
      // (qwen3.5:4b z.B. 1.0/0.95), und der Skill-Benchmark hat auf genau diesen Werten
      // gemessen. Ein Default-Wechsel gehört gemessen, nicht aus einem Szenario abgeleitet.
      //
      // UNGEPRÜFT (Stand 28.08.2026): Was OpenRouter tut, wenn für das gewählte Modell
      // KEIN ZDR-Endpunkt existiert, ist nicht belegt. Die Doku nennt für den verwandten
      // `only`-Filter ein 404, sagt es für `zdr` aber nicht. Solange das offen ist, gilt
      // die Anforderung als BEVORZUGUNG, nicht als Garantie — nicht als Zusicherung
      // auftreten und nicht in der Oberfläche versprechen. Prüfskript liegt bereit:
      // scripts/check-openrouter-zdr.mjs (braucht einen OpenRouter-Schlüssel).
      if (isCloudChatBackend(chatOptions.backend)) {
        chatOptions = {
          ...chatOptions,
          maxTokens: 8_192,
          zeroDataRetention: chatOptions.backend === 'openrouter'
        }
      }

      // Agent-Skills Stufe 1: aktivierte Vault-Skills als Discovery-Metadaten mitgeben.
      const skills = await listEnabledSkillHeaders(params.vaultPath).catch(() => [])
      // Mitlernen (Stufe 3): bestätigte Regeln aus früheren Läufen in den Prompt.
      const agentMemory = await readAgentMemory(params.vaultPath).catch(() => '')

      // Webrecherche (Opt-in): nur wenn der Renderer sie für diesen Lauf aktiviert hat UND
      // die Provider-Config Main-seitig vollständig ist. Der Main führt die erlaubte URL-Liste
      // und seedet sie aus den Auftrags-URLs (0f) — der Renderer liefert keine URLs.
      let web: WebRunState | undefined
      if (params.webResearch?.enabled) {
        const webConfig = await loadWebResearchConfig()
        if (!isWebResearchConfigComplete(webConfig)) {
          return { success: false, error: 'Webrecherche ist eingeschaltet, aber nicht konfiguriert (Einstellungen → KI & Modelle → Webrecherche: SearXNG-URL oder API-Key für Tavily/Linkup).' }
        }
        const apiKey = KEY_PROVIDERS.includes(webConfig.provider) ? await loadProviderKey(webConfig.provider) : null
        if (KEY_PROVIDERS.includes(webConfig.provider) && !apiKey) {
          return { success: false, error: 'Webrecherche gewählt, aber kein API-Key hinterlegt (Einstellungen → Integrationen → Webrecherche).' }
        }
        web = {
          config: webConfig,
          apiKey,
          phase: 'search',
          allowedUrls: new Set(extractUrlsFromInstruction(params.instruction)),
          queries: [],
          fetches: [],
          deniedHosts: new Map(),
          searchCount: 0,
          fetchCount: 0,
          wrote: false
        }
      }

      // Bild-Generierung (Opt-in-Modul image-generation): generate_image nur anbieten,
      // wenn das Modul aktiv ist UND ein Imagen-Key hinterlegt — sonst sieht das Modell
      // das Tool nicht (kein toter Tool-Call-Pfad).
      let imageGen = false
      try {
        const ui = await loadUISettings() as Record<string, unknown>
        // Nicht bei „KI nur auf diesem Rechner“: das Werkzeug gar nicht erst anbieten.
        if (ui.imageGenerationEnabled === true && !isLocalOnlyInSettings(ui)) {
          const { loadImagenKey } = await import('../imageGen/imagenService')
          imageGen = !!(await loadImagenKey())
        }
      } catch { /* Modul bleibt aus */ }

      // Externe Werkzeuge (MCP) — docs/codex-collab/mcp-anbindung.md E5, E9′, E17′, E19.
      // HIER und nicht weiter oben: erst jetzt stehen Modellweg und imageGen fest (Codex F16), und
      // der Fortsetzungsstand ist noch nicht verbraucht (startRun/dropContinuation folgen unten).
      const mcpUi = (await loadUISettings().catch(() => ({}))) as Record<string, unknown>
      const mcpGate = mcpRunGate({
        requested: params.mcpServers,
        moduleEnabled: mcpUi.agentMcpEnabled === true,
        inherited: continuation?.prev.foreignData,
        prevServers: continuation?.prev.mcpServers,
        shell: params.shellAccess === true,
        web: !!params.webResearch?.enabled,
        computer: params.computerAccess === true
      })
      if (!mcpGate.ok) return { success: false, error: mcpGate.error }
      // Bilderzeugung ist kein Lauf-Parameter, sondern hängt am Modul — mit Fremddaten fest aus
      // (E9′, Codex F03): ein präpariertes Ergebnis könnte sonst Daten als Bild-Prompt zu Google schicken.
      if (mcpGate.hasForeign) imageGen = false
      // Personendaten aus einem Dienst (z.B. Plaud-Mitschnitte) auf einem Cloud-Weg: eigene Rückfrage
      // im Main, unabhängig von der allgemeinen Cloud-Zustimmung (Abschnitt 6, E31′, Codex F29).
      // Auch geerbte Server zählen: ihre Daten stehen im übernommenen Verlauf (Codex F33).
      const personal = await confirmMcpPersonalDataForRun(event.sender, mcpGate.serverIds, continuation?.prev.foreignData, route)
      if (!personal.ok) return { success: false, error: personal.error }

      // Vault-Index als Suchwerkzeug (vault_search) — für alle Wege, auch Cloud (Nutzerentscheidung
      // 24.09.2026: Transparenz statt Sperre; die Karte nennt Suchauszüge als Datenweg). Die
      // Einbettung der Anfrage bleibt lokal und meldet sich als Vordergrund an, damit der
      // Indexer nicht gleichzeitig einbettet — auch in einem Cloud-Lauf, der selbst nicht zählt.
      let vaultSearch: ((query: string, topK: number, signal: AbortSignal) => Promise<VaultQueryResult>) | undefined
      try {
        const mgr = getVaultRagManager()
        if (await mgr.isQueryable(params.vaultPath)) {
          const vp = params.vaultPath
          vaultSearch = (query, topK, signal) =>
            withOllamaActivity('vault-query', () => mgr.query(vp, query, undefined, { topK, signal }))
        }
      } catch { /* ohne Index kein Werkzeug */ }

      // Tagesüberblick (day_overview): Vault und Brain-Ordner stehen hier fest, das Modell wählt
      // nur das Datum. Reine Lesewege auf Protokolle dieses Rechners.
      const overviewVault = params.vaultPath
      const overviewBrainFolder = await loadUISettings()
        .then(ui => ((ui as Record<string, unknown>).brain as { folderPath?: string } | undefined)?.folderPath || '800 - 🧠 brain')
        .catch(() => '800 - 🧠 brain')
      const dayOverview = (isoDate: string, range: { from: number; to: number }) =>
        buildDayOverview({ vaultPath: overviewVault, isoDate, range, brainFolder: overviewBrainFolder })

      // Hausdesign: einmal beim Start laden; aus, kaputt oder Logo-Prüfsumme falsch → kein Hausdesign.
      const brand = await loadBrandForRun(params.vaultPath, skills.map(s => ({ ...s, enabled: true }))).catch(() => null)

      // Externe Server verbinden und die Werkzeugansicht bauen (E7′, E16′) — vor startRun, damit
      // ein Server, der nicht startet, den Lauf mit Klartext ablehnt statt mitten darin zu scheitern.
      let mcp: McpRunState | undefined
      if (mcpGate.serverIds.length > 0) {
        try {
          mcp = await prepareMcpForRun({ serverIds: mcpGate.serverIds, store: getMcpStore(), vaultPath: params.vaultPath, knownVaults: getApprovedVaultRoots(), getMicrosoftToken: mcpMicrosoftToken, getOAuthToken: mcpOAuthToken, expectedBindings: personal.bindings })
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : String(e) }
        }
        // Das Verbinden kann dauern. Ist das Fenster inzwischen zu, darf kein Lauf mehr entstehen,
        // den niemand abbrechen kann (Codex F05 der Code-Prüfung).
        if (event.sender.isDestroyed()) {
          await closeMcpForRun(mcp)
          return { success: false, error: 'Fenster geschlossen.' }
        }
      }

      const run = startRun({
        senderId: event.sender.id,
        noteId: params.noteId,
        vaultPath: params.vaultPath,
        targetFolderRel: params.targetFolderRel,
        targetFolderAbs: targetAbs,
        attachmentIds: params.attachmentIds || [],
        instruction: continuation
          ? `${continuation.prev.instruction}\n\nNachtrag: ${continuation.answer}`
          : params.instruction.trim(),
        // Folgelauf: der Verlauf steckt schon im übernommenen Gesprächsprotokoll.
        chatContext: continuation ? undefined : sanitizeChatContext(params.chatContext),
        model: provenanceModel,
        // Aktive Zeit beim Formulieren (Renderer-Messung, Fenster im Vordergrund).
        instructionMs: typeof params.instructionMs === 'number' ? params.instructionMs : undefined,
        comparisonCaseId: typeof params.comparisonCaseId === 'string' ? params.comparisonCaseId : undefined,
        skills,
        web,
        imageGen,
        route,
        vaultSearch,
        dayOverview,
        ...(brand ? { brand } : {}),
        ...(mcp ? { mcp, mcpServers: mcpGate.serverIds } : {}),
        ...(continuation?.prev.foreignData ? { foreignData: continuation.prev.foreignData } : {})
      })
      if (!run) {
        await closeMcpForRun(mcp)
        return { success: false, error: 'Es läuft bereits ein Agent-Lauf in diesem Fenster — erst abbrechen oder abwarten.' }
      }
      // Abbrechen schließt die Verbindungen sofort (ein laufender Aufruf endet damit).
      if (mcp) run.abort.signal.addEventListener('abort', () => { void closeMcpForRun(mcp) }, { once: true })
      if (continuation) {
        // Datensätze, Lese-Zähler und feste Skill-Blöcke gehen mit — der Verlauf nennt sie.
        inheritContinuation(run, continuation.prev)
        dropContinuation(event.sender.id, continuation.prev.runId)
      }
      hookNoteAgentCleanup(event.sender)
      void cleanupOldStaging(params.vaultPath).catch(() => undefined)
      // C02: bei der Retention evakuierte Läufe mit offenen Karten sofort aufräumen —
      // Staging löschen (kein 7-Tage-Orphan) und dem Renderer melden, damit er die
      // toten Karten fallenlässt (sonst „Unbekannter Lauf" beim späteren Accept).
      for (const ev of consumeEvictedRuns()) {
        void fs.rm(stagingDirFor(ev), { recursive: true, force: true }).catch(() => undefined)
        if (!event.sender.isDestroyed()) event.sender.send('note-agent-run-evicted', { runId: ev.runId })
      }

      // Loop asynchron — der Handler gibt sofort die runId zurück (für Abbrechen),
      // Fortschritt und Abschluss kommen als sender-gebundene Events.
      const sender = event.sender
      // Ruhezustand während des Laufs verhindern — auf kleinen Laptops im Akkubetrieb hat
      // macOS sonst mitten im Auftrag den Netzwerkdienst stillgelegt (siehe powerGuard.ts).
      const releaseStayAwake = acquireStayAwake('Notiz-Agent-Lauf')
      void (async () => {
        try {
          // Texterkennung für Bilder (Rev. 7 Punkt 24): Schalter und Modell aus der Main-Kopie
          // der Einstellungen, ein Seitenbudget und ein Zwischenspeicher für den ganzen Lauf.
          run.ocr = createAgentOcrState({ visionOcr: (await loadUISettings().catch(() => ({} as Record<string, unknown>))).visionOcr })
          if (params.shellAccess === true) {
            // Schutzgrenzen aus der Main-Kopie der Einstellungen — nie aus den Renderer-Params.
            const guardrails = normalizeShellGuardrails((await loadUISettings().catch(() => ({} as Record<string, unknown>))).agentShell)
            const readPaths = guardrails.readScope === 'vault'
              ? [run.vaultPath]
              : (await getShellAttachmentPaths(run.senderId, run.attachmentIds)).map(a => a.path)
            await authorizeShell(run, async () => {
              if (sender.isDestroyed()) return false
              const owner = BrowserWindow.fromWebContents(sender)
              if (!owner || owner.isDestroyed()) return false
              const choice = await dialog.showMessageBox(owner, {
                type: 'warning',
                title: 'Shell-Zugriff für diesen Agent-Lauf',
                message: 'Shell-Befehle und Skripte für diesen Lauf erlauben?',
                detail: `Modell: ${run.model}\nVault: ${run.vaultPath}\nAuftrag: ${run.instruction}\n\nSchutzgrenzen (vom System erzwungen, Einstellungen → Agent-Shell): ${describeShellGuardrails(guardrails)}.\nLesbar: ${readPaths.length ? readPaths.join(', ') : '(keine Anhänge)'} sowie Systempfade. Dein Benutzerordner und die .mindgraph-Daten bleiben unlesbar. Geschrieben wird nur im Arbeitsordner; Ergebnisse übernimmst du selbst.\n\nDer Agent darf für diesen Auftrag ohne weitere Einzelbestätigung Befehle ausführen. Bei Cloud-Modellen werden Befehlsausgaben an den Modellanbieter gesendet.\n\nDie Freigabe gilt nur für diesen Lauf.`,
                buttons: ['Abbrechen', 'Für diesen Lauf erlauben'],
                defaultId: 0, cancelId: 0, noLink: true
              })
              return choice.response === 1 && !sender.isDestroyed()
            }, async () => {
              let cwd = await assertSafePath(run.vaultPath, 'note-agent-shell-work')
              for (const part of ['.mindgraph', 'agent-staging', run.runId, 'shell-work']) {
                cwd = await assertSafePath(path.join(cwd, part), 'note-agent-shell-work')
                await fs.mkdir(cwd, { recursive: true })
              }
              return assertSafePath(cwd, 'note-agent-shell-work')
            }, { guardrails, readPaths })
            // Umgebung einmal ermitteln und dem Modell nennen — sonst sucht es selbst
            // (real: vier Iterationen für „welches Python, welche Bibliotheken").
            const environment = await probeShellEnvironment(run)
            if (!sender.isDestroyed()) sender.send('note-agent-progress', {
              runId: run.runId, seq: nextSeq(run), skill: 'shell_access', summary: `Shell-Zugriff für diesen Lauf erlaubt — Sandbox aktiv, Selbsttest bestanden. ${describeShellGuardrails(guardrails)}. Umgebung: ${environment}`
            })
          }
          if (params.computerAccess === true) {
            // Freigegebene Vorgänge aus der Main-Kopie der Einstellungen — nie aus den
            // Renderer-Params. Das Modell kann die Liste damit weder sehen noch erweitern.
            const settings = normalizeComputerControl((await loadUISettings().catch(() => ({} as Record<string, unknown>))).agentComputer)
            // Die Systemwerkzeuge VOR dem Dialog prüfen und nur die nutzbaren aufzählen
            // (Codex F09): vorher stand im Dialog ein Vorgang, der direkt nach der Zustimmung
            // wegfiel, weil sein Systemwerkzeug fehlte. Der Nutzer hätte etwas freigegeben,
            // das es im Lauf gar nicht gibt.
            const probe = await usableComputerVerbs(settings)
            const usableText = probe.usable.length
              ? probe.usable.map(v => computerVerbLabel(v)).join(', ')
              : '(keiner)'
            const missingText = probe.missing.length
              ? `\n\nNicht ausführbar auf diesem System und deshalb NICHT dabei: ${probe.missing.map(v => computerVerbLabel(v)).join(', ')}.`
              : ''
            const authorized = await authorizeComputer(run, async () => {
              if (sender.isDestroyed()) return false
              const owner = BrowserWindow.fromWebContents(sender)
              if (!owner || owner.isDestroyed()) return false
              const choice = await dialog.showMessageBox(owner, {
                type: 'warning',
                title: 'Rechner-Steuerung für diesen Agent-Lauf',
                message: 'Darf der Agent für diesen Auftrag Programme auf deinem Rechner ansprechen?',
                detail: `Modell: ${run.model}\nVault: ${run.vaultPath}\nAuftrag: ${run.instruction}\n\nDas ist eine ERLAUBNIS, kein Ablaufplan: Ob und welchen dieser Vorgänge der Agent nutzt, entscheidet das Modell aus deinem Auftrag. Es kann sein, dass keiner davon stattfindet.\n\nMöglich in diesem Lauf: ${usableText}.${missingText}\n\nDiese Vorgänge wirken sofort und außerhalb der App, ohne weitere Einzelbestätigung — höchstens zehn im ganzen Lauf, abgelehnte Versuche zählen mit. Übergeben werden nur Ergebnisse dieses Laufs und Dateien aus dem Vault; die internen .mindgraph-Daten nie. Ein Ergebnis wird dabei als Kopie geöffnet — Änderungen daran landen nicht in der Datei, die du danach übernimmst.\n\nE-Mails entstehen NUR als sichtbarer Entwurf in Apple Mail und werden nie gesendet. Keiner dieser Vorgänge holt Daten von ausserhalb herein. Ein Mail-Entwurf samt Anhängen landet in Apple Mail — ob er von dort mit deinem Mailkonto synchronisiert wird, richtet sich nach dessen Einstellungen.\n\nBeim ersten Mal fragt macOS zusätzlich, ob MindGraph Notes das jeweilige Programm steuern darf. Die Freigabe gilt nur für diesen Lauf.`,
                buttons: ['Abbrechen', 'Für diesen Lauf erlauben'],
                defaultId: 0, cancelId: 0, noLink: true
              })
              return choice.response === 1 && !sender.isDestroyed()
            }, settings)
            // Weggelassene Vorgänge benennen (Codex F06): ein Vorgang, dessen Systemwerkzeug
            // fehlt, darf nicht als freigegeben erscheinen — sonst sucht der Nutzer den Fehler
            // beim Modell, während in Wahrheit `shortcuts` oder `lp` nicht da ist.
            const dropped = authorized.missing.length
              ? ` Nicht ausführbar auf diesem System und deshalb weggelassen: ${authorized.missing.map(v => computerVerbLabel(v)).join(', ')}.`
              : ''
            if (!sender.isDestroyed()) sender.send('note-agent-progress', {
              runId: run.runId, seq: nextSeq(run), skill: 'computer_access', summary: `Rechner-Steuerung für diesen Lauf erlaubt — ${describeComputerControl(settings)}.${dropped} Mails werden nur als Entwurf geöffnet, nie gesendet.`
            })
          }
          const res = await runNoteAgentLoop({
            run,
            noteContent: params.noteContent || '',
            agentMemory,
            chatOptions,
            contextNote: contextNote ?? undefined,
            continuation: continuation ? { priorMessages: continuation.priorMessages, answer: continuation.answer, priorTokens: continuation.priorTokens } : undefined,
            onStep: (seq, skill, summary) => {
              if (!sender.isDestroyed()) sender.send('note-agent-progress', { runId: run.runId, seq, skill, summary })
            },
            onContext: (context, turns) => {
              if (!sender.isDestroyed()) sender.send('note-agent-context', {
                runId: run.runId, context, turns,
                // Befund DIESES Laufs zum Bilder-Ansehen (Codex F25): Die Karte zeigt während des
                // Laufs nur ihn, nicht die Vorabprüfung des gerade gewählten Modells.
                imageView: run.imageView
                  ? { ok: true as const, model: run.imageView.model, budget: AGENT_IMAGE_VIEW_BUDGET }
                  : run.imageViewOff ? { ok: false as const, reason: run.imageViewOff } : null
              })
            }
          })
          finishRun(run, 'done')
          // Vergleichsmodus: Auftragszeit als Arbeitssitzung, sobald der Lauf steht.
          recordComparisonSession(run.vaultPath, run.comparisonCaseId, 'auftrag', run.instructionMs, Date.now())
          // Tätigkeitsprotokoll: Dauer genau EINMAL, hier am Lauf-Ende — nicht bei der
          // Übernahme. Sonst zählte ein Lauf mit drei übernommenen Ergebnissen dreifach.
          // Verbrauch (Aufrufe, Token, Rechenzeit, Cloud-Kosten) aus allen Modellaufrufen
          // mit dieser runId — die Summe, nicht der letzte Aufruf.
          const llm = await collectRunTotals(run.runId)
          recordActivity(run.vaultPath, {
            at: Date.now(),
            kind: 'agent-run-finished',
            runId: run.runId,
            durationMs: Date.now() - run.startedAt,
            instructionMs: run.instructionMs,
            model: run.model,
            activityType: deriveActivityType(run.toolsUsed),
            resultCount: run.results.size,
            status: 'ok',
            llm,
            ...runSkillFields(run)
          })
          if (!sender.isDestroyed()) {
            sender.send('note-agent-done', {
              runId: run.runId,
              ok: true,
              text: res.text,
              hitMaxIterations: res.hitMaxIterations,
              results: publicResults(run),
              web: webRunProvenance(run),
              mcp: mcpProvenance(run.mcp),
              ...promptSkillFields(run)
            })
          }
          // Mitlernen (Stufe 3): Merksatz-Vorschlag asynchron NACH dem Done-Event —
          // kostet die Ergebnis-Karten keine Latenz. Reines Komfort-Feature: Fehler
          // bleiben still, gespeichert wird nur per „Merken"-Klick des Nutzers.
          if (run.results.size > 0) {
            void suggestAgentMemory(run, chatOptions)
              .then(suggestion => {
                if (suggestion && !sender.isDestroyed()) {
                  sender.send('note-agent-memory-suggestion', { runId: run.runId, text: suggestion })
                }
              })
              .catch(() => undefined)
          }
        } catch (e) {
          const cancelled = run.abort.signal.aborted
          finishRun(run, cancelled ? 'cancelled' : 'error')
          // Auch ein gescheiterter Lauf hat gekostet — Aufrufe und Token bleiben in der Bilanz.
          const llm = await collectRunTotals(run.runId)
          recordActivity(run.vaultPath, {
            at: Date.now(),
            kind: 'agent-run-finished',
            runId: run.runId,
            durationMs: Date.now() - run.startedAt,
            instructionMs: run.instructionMs,
            model: run.model,
            activityType: deriveActivityType(run.toolsUsed),
            resultCount: run.results.size,
            status: cancelled ? 'aborted' : 'failed',
            llm,
            ...runSkillFields(run)
          })
          let message = e instanceof Error ? e.message : String(e)
          if (/aborted due to timeout|TimeoutError/i.test(message)) {
            // Die Standard-Erklärung („zu langsam / Auftrag zu groß") ist bei
            // Ordner-Läufen falsch und schickt den Nutzer in die Irre: Real hat das
            // Modell 31 Dateien einzeln geladen, statt sie mit EINEM Aufruf
            // zusammenzuführen. Die App weiß das — also sagt sie es auch.
            const singleReads = totalFolderReads(run)
            // Angehobenes Kontextfenster: dort liest der Agent den Ordner ausdrücklich ganz (Lese-Abdeckung).
            // Der Vorwurf „einzeln gelesen statt zusammengeführt“ wäre falsch — real (24.11.2026, 27B-Modell,
            // 65 536 Token, 16 Dateien) brauchte die letzte Runde über 20 Minuten, weil jede Runde alles
            // Gelesene neu verarbeitet, NACHDEM das Ergebnis schon geschrieben war.
            const raisedWindow = typeof chatOptions.numCtx === 'number' && chatOptions.numCtx > 32_768
            const kept = run.results.size
            message = raisedWindow
              ? `Zeitüberschreitung: Eine Runde hat länger als ${agentRequestTimeoutMs(chatOptions.backend) / 60_000} Minuten gedauert. Mit dem großen Kontextfenster (${chatOptions.numCtx!.toLocaleString('de-DE')} Token) verarbeitet das Modell in jeder Runde alles Gelesene neu — auf diesem Rechner ist das für diesen Umfang zu langsam.${kept ? ` ${kept === 1 ? 'Ein Ergebnis war schon fertig und liegt' : `${kept} Ergebnisse waren schon fertig und liegen`} zur Übernahme bereit; ob der Agent noch etwas ergänzen wollte, ist offen.` : ''} Abhilfe: Kontextfenster eine Stufe kleiner stellen, weniger Unterlagen anhängen oder ein schnelleres Modell wählen.`
              : singleReads >= 5
              ? `Zeitüberschreitung. Der Agent hat ${singleReads} Dateien einzeln gelesen, statt sie mit einem Aufruf zusammenzuführen — dadurch wurde der Auftrag zu groß für das Modell. Ein anderes Modell wählen oder den Lauf wiederholen; der Auftrag selbst ist nicht zu umfangreich.`
              : `Zeitüberschreitung: Das Modell hat nicht innerhalb von ${agentRequestTimeoutMs(chatOptions.backend) / 60_000} Minuten geantwortet. Kleineres/schnelleres Modell wählen oder den Auftrag verkleinern.`
          }
          if (!sender.isDestroyed()) {
            sender.send('note-agent-done', {
              runId: run.runId,
              ok: false,
              cancelled,
              error: message,
              results: publicResults(run),
              web: webRunProvenance(run),
              mcp: mcpProvenance(run.mcp),
              ...promptSkillFields(run)
            })
          }
        } finally {
          // MUSS hier stehen: sonst bleibt die Maschine nach einem Fehler-Lauf für immer wach.
          releaseStayAwake()
          // Verbindungen zu externen Servern enden mit dem Lauf — kein verwaister Prozess (E13).
          await closeMcpForRun(run.mcp)
        }
      })()

      return { success: true, runId: run.runId, route }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  /**
   * Skills eines Laufs fürs Tätigkeitsprotokoll: nur opake Kennungen, höchstens
   * MAX_RUN_SKILLS. Bei mehr wird der Lauf als abgeschnitten markiert und nicht über einen
   * Skill bewertet — sonst entschiede die Grenze, welcher Skill zählt (Codex F03).
   */
  /**
   * Skills für die Rückfrage auf der Ergebniskarte — nur, wenn der Lauf über einen Skill
   * bewertbar ist. Shell-Läufe und abgeschnittene Listen verwirft `resolveRunSkill`; die
   * Karte dürfte dort keine Referenz erfragen und „gespeichert" melden, die für genau diesen
   * Lauf nie zählt (Codex F12). `vaultKey` bindet eine dort gespeicherte Referenz an den Vault.
   */
  function promptSkillFields(run: AgentRun): { skills: Array<{ id: string; label: string }>; vaultKey: string } {
    const bewertbar = deriveActivityType(run.toolsUsed) !== 'shell' && run.skillsUsed.length <= MAX_RUN_SKILLS
    return { skills: bewertbar ? run.skillsUsed.map(s => ({ ...s })) : [], vaultKey: vaultActivityKey(run.vaultPath) }
  }

  function runSkillFields(run: AgentRun): { skills?: string[]; skillsTruncated?: true } {
    const ids = run.skillsUsed.map(s => s.id)
    if (ids.length === 0) return {}
    if (ids.length > MAX_RUN_SKILLS) return { skills: ids.slice(0, MAX_RUN_SKILLS), skillsTruncated: true }
    return { skills: ids }
  }

  ipcMain.handle('note-agent-cancel', async (event, runId: string) => {
    const run = getRunForSender(event.sender.id, runId)
    if (run && run.status === 'running') run.abort.abort()
    return { success: true }
  })

  ipcMain.handle('note-agent-accept-result', async (event, runId: string, resultId: string, timings?: { reviewMs?: number; waitingMs?: number }) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    const run = getRunForSender(event.sender.id, runId)
    if (!run) return { success: false, error: 'Unbekannter Lauf' }
    const entry = takeResult(event.sender.id, runId, resultId)
    if (!entry) return { success: false, error: 'Ergebnis nicht (mehr) verfügbar' }
    // C03: reservierten Platzhalter außerhalb des try merken, damit der Fehlerpfad
    // ausschließlich die selbst angelegte leere Datei aufräumt.
    let reservedDest: string | null = null
    try {
      const real = await assertInsideRunStaging(run, entry.stagingPath)
      // R01/TOCTOU: kanonischen, an den Run gebundenen Zielordner UNMITTELBAR vor der
      // Übernahme erneut prüfen — fängt einen zwischen Run-Start und Accept
      // untergeschobenen Symlink ab.
      const targetDir = await assertSafePath(run.targetFolderAbs, 'note-agent-accept-target')
      if (await isAppInternalRealPath(run.vaultPath, targetDir)) {
        throw new Error('Zielordner liegt im internen App-Ordner .mindgraph')
      }
      // R04: Name atomar reservieren (exklusives Create) statt check-then-write.
      const { finalName, destPath } = await reserveFreeName(targetDir, entry.suggestedName)
      reservedDest = destPath
      if (entry.kind === 'md') {
        // Markdown über die eine Schreibgrenze (Auto-Backup, Empty-Block, Auto-Heal).
        // Die KI-Provenienz wird hier gesetzt — beim Übernehmen, nicht schon im
        // write_note-Tool: verworfene Ergebnisse sollen keinen Stempel bekommen.
        const content = await fs.readFile(real, 'utf-8')
        await writeFileSafe(destPath, setAiProvenanceInContent(content, run.model, todayIsoDate()), { origin: 'agent', created: true })
      } else {
        // Platzhalter (leer, gerade reserviert) wird überschrieben — der Name gehört uns.
        await fs.copyFile(real, destPath)
      }
      // write_html-Seiten referenzieren KaTeX relativ — Assets neben die Seite legen
      // (idempotent; Fehler hier lässt den Accept sauber in den Retry-Pfad laufen).
      if (entry.kind === 'html') {
        await ensureHtmlPageAssets(targetDir)
        // Hausdesign-Logo: nur wenn die Seite es wirklich referenziert, und genau die Bytes dieses Laufs.
        if (run.brand) {
          const page = await fs.readFile(destPath, 'utf-8')
          if (page.includes(`${HTML_PAGE_ASSETS_DIRNAME}/${HTML_BRAND_ASSET_DIR}/${run.brand.logoAssetName}`)) {
            const brandDir = await assertSafePath(path.join(targetDir, HTML_PAGE_ASSETS_DIRNAME, HTML_BRAND_ASSET_DIR), 'note-agent-accept-brand-logo')
            if (await isAppInternalRealPath(run.vaultPath, brandDir)) throw new Error('Logo-Ziel liegt im internen App-Ordner .mindgraph')
            await ensureHtmlBrandLogo(brandDir, run.brand.logoAssetName, run.brand.logo)
          }
        }
      }
      await fs.rm(real, { force: true }).catch(() => undefined)
      pruneRunIfConsumed(run)
      // Erst NACH der geglückten Übernahme protokollieren: Nur übernommene Ergebnisse
      // zählen für die Bilanz. Nur Format und Lauf-Kennung, nie der Dateiname.
      const jetzt = Date.now()
      recordComparisonSession(run.vaultPath, run.comparisonCaseId, 'vordergrund', timings?.waitingMs, jetzt)
      recordComparisonSession(run.vaultPath, run.comparisonCaseId, 'pruefung', timings?.reviewMs, jetzt)
      if (run.comparisonCaseId) {
        void updateComparisons(run.vaultPath, d => ({
          ...d,
          cases: d.cases.map(c => (c.id === run.comparisonCaseId && c.state === 'offen' ? setAccepted(c, true) : c))
        })).catch(() => undefined)
      }
      recordActivity(run.vaultPath, {
        at: Date.now(),
        kind: 'agent-result-accepted',
        runId: run.runId,
        format: entry.kind,
        reviewMs: typeof timings?.reviewMs === 'number' && timings.reviewMs >= 0 ? timings.reviewMs : undefined,
        waitingMs: typeof timings?.waitingMs === 'number' && timings.waitingMs >= 0 ? timings.waitingMs : undefined
      })
      // absPath für „Übernehmen und öffnen": der Renderer soll den Pfad nicht selbst
      // zusammensetzen (Trennzeichen, Umbenennung durch reserveFreeName). open-path
      // prüft ihn ohnehin erneut mit assertSafePath.
      return { success: true, fileName: finalName, relPath: path.join(run.targetFolderRel, finalName).replace(/\\/g, '/'), absPath: destPath }
    } catch (error) {
      // Übernahme gescheitert → Konsum zurücknehmen, damit der Nutzer es erneut versuchen kann.
      entry.consumed = false
      // C03: die eben reservierte (noch leere) Zieldatei entfernen — sonst bleibt eine
      // leere Datei liegen und ein Retry landet unnötig bei „Name (2)".
      if (reservedDest) await fs.rm(reservedDest, { force: true }).catch(() => undefined)
      return { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  // Vorschau eines Ergebnisses VOR der Übernahme: liest die Staging-Datei read-only
  // und konsumiert das Ergebnis NICHT — der Renderer sieht weiterhin nur Inhalte,
  // nie Staging-Pfade. Textformate liefern den vollständigen (gekappten) Inhalt;
  // Binärformate (xlsx/docx) melden sich als nicht-vorschaubar.
  ipcMain.handle('note-agent-preview-result', async (event, runId: string, resultId: string) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    const run = getRunForSender(event.sender.id, runId)
    if (!run) return { success: false, error: 'Unbekannter Lauf' }
    const entry = peekResult(event.sender.id, runId, resultId)
    if (!entry) return { success: false, error: 'Ergebnis nicht (mehr) verfügbar' }
    try {
      const real = await assertInsideRunStaging(run, entry.stagingPath)
      const textKinds = new Set(['md', 'txt', 'csv', 'html', 'json', 'excalidraw'])
      if (!textKinds.has(entry.kind)) {
        const stat = await fs.stat(real)
        return { success: true, kind: entry.kind, binary: true, sizeBytes: stat.size }
      }
      const MAX_PREVIEW_CHARS = 200_000
      const content = await fs.readFile(real, 'utf-8')
      const truncated = content.length > MAX_PREVIEW_CHARS
      return {
        success: true,
        kind: entry.kind,
        binary: false,
        text: truncated ? content.slice(0, MAX_PREVIEW_CHARS) : content,
        truncated
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  // Mitlernen (Stufe 3): bestätigten Merksatz an die Agent-Gedächtnis-Notiz anhängen.
  ipcMain.handle('note-agent-remember', async (event, vaultPath: string, text: string) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    try {
      assertApprovedVault(vaultPath, 'note-agent-remember')
      const relPath = await appendAgentMemory(vaultPath, text)
      return { success: true, relPath }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' }
    }
  })

  // Auftragskarte im Agent-Tab: Gedächtnis leer / gefüllt / wird gekürzt.
  ipcMain.handle('note-agent-memory-status', async (event, vaultPath: string) => {
    if (!isTrustedSender(event)) return { state: 'empty', relPath: '' }
    try {
      assertApprovedVault(vaultPath, 'note-agent-memory-status')
      return await agentMemoryStatus(vaultPath)
    } catch {
      return { state: 'empty', relPath: '' }
    }
  })

  ipcMain.handle('note-agent-discard-result', async (event, runId: string, resultId: string, timings?: { reviewMs?: number; waitingMs?: number }) => {
    if (!isTrustedSender(event)) return { success: false, error: 'Nicht autorisierter Aufrufer' }
    const run = getRunForSender(event.sender.id, runId)
    if (!run) return { success: false, error: 'Unbekannter Lauf' }
    const entry = takeResult(event.sender.id, runId, resultId)
    if (!entry) return { success: false, error: 'Ergebnis nicht (mehr) verfügbar' }
    try {
      const real = await assertInsideRunStaging(run, entry.stagingPath)
      await fs.rm(real, { force: true })
    } catch {
      /* Datei fehlt bereits — Verwerfen ist idempotent */
    }
    pruneRunIfConsumed(run)
    const verworfenAm = Date.now()
    recordComparisonSession(run.vaultPath, run.comparisonCaseId, 'vordergrund', timings?.waitingMs, verworfenAm)
    recordComparisonSession(run.vaultPath, run.comparisonCaseId, 'pruefung', timings?.reviewMs, verworfenAm)
    if (run.comparisonCaseId) {
      void updateComparisons(run.vaultPath, d => ({
        ...d,
        cases: d.cases.map(c => (c.id === run.comparisonCaseId && c.state === 'offen' ? setAccepted(c, false) : c))
      })).catch(() => undefined)
    }
    recordActivity(run.vaultPath, {
      at: Date.now(),
      kind: 'agent-result-discarded',
      runId: run.runId,
      format: entry.kind,
      reviewMs: typeof timings?.reviewMs === 'number' && timings.reviewMs >= 0 ? timings.reviewMs : undefined,
      waitingMs: typeof timings?.waitingMs === 'number' && timings.waitingMs >= 0 ? timings.waitingMs : undefined
    })
    return { success: true }
  })
}
