import { create } from 'zustand'
import type { WorkflowPortKind } from '../../shared/workflow/types'
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowRun,
  WorkflowRunTrigger,
  WorkflowSchedule,
  WorkflowValidationResult
} from '../../shared/workflow/model'
import type { EmailMessage } from '../../shared/types'
import { getActionById, getPortDef } from '../../shared/workflow/registry'
import { canConnectPorts, validateWorkflow } from '../../shared/workflow/validation'
import { simulateWorkflow } from '../../shared/workflow/simulation'
import { buildExampleReplyWorkflow, buildEmptyWorkflow } from '../../shared/workflow/examples'
import { useUIStore } from './uiStore'
import { useVaultSettingsStore } from './vaultSettingsStore'
import { useEmailStore } from './emailStore'
import { useNotesStore } from './notesStore'
import { useAntaresStore } from './antaresStore'
import { useAgentStore } from './agentStore'
import { extractTasks } from '../utils/linkExtractor'
import type { AntaresVerleihRow, EdooboxOfferDashboard, Note } from '../../shared/types'

interface ConnectingState {
  nodeId: string
  actionId: string
  portId: string
  kind: WorkflowPortKind
}

interface WorkflowStoreState {
  workflow: Workflow
  selectedNodeId: string | null
  connecting: ConnectingState | null
  validation: WorkflowValidationResult
  run: WorkflowRun | null
  running: boolean

  loadWorkflow: (wf: Workflow) => void
  loadExample: () => void
  newWorkflow: () => void
  setName: (name: string) => void

  addNode: (actionId: string, position: { x: number; y: number }) => void
  removeNode: (nodeId: string) => void
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void
  updateNodeConfig: (nodeId: string, patch: Record<string, unknown>) => void
  selectNode: (nodeId: string | null) => void

  addEdge: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => boolean
  removeEdge: (edgeId: string) => void

  setConnecting: (c: ConnectingState | null) => void

  simulate: () => void
  execute: (vaultPath: string) => Promise<void>
  clearRun: () => void

  loadFromDisk: (vaultPath: string) => Promise<void>
  persist: (vaultPath: string) => Promise<void>

  setEnabled: (enabled: boolean) => void
  runForNewEmails: (vaultPath: string) => Promise<void>
  /** Dispatcht auf den aktiven Trigger-Baustein: Email → runForNewEmails,
   *  antares/edoobox/tasks → eigener Collector (tab-scoped Poll). schedule → runScheduledIfDue. */
  runTrigger: (vaultPath: string) => Promise<void>
  /** Layer F: lädt den persistierten Workflow von Platte (tab-unabhängig!) und
   *  führt ihn aus, falls der schedule.timer-Trigger jetzt fällig ist. */
  runScheduledIfDue: (vaultPath: string) => Promise<void>
}

const genId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Modul-Singleton-Lock gegen parallele Trigger-Batches (Decision #10, serielle Queue).
let triggerBatchRunning = false

// Sicherheits-Cap: ein Trigger-Lauf verarbeitet höchstens so viele Mails, damit
// ein Klick nicht den gesamten Backlog gegen Ollama feuert (jede Mail = 2 LLM-Calls
// + emails.json-Write). Schützt CPU und vermeidet Vault-Schreib-Stürme.
const MAX_TRIGGER_BATCH = 5

// Letzter auf Platte geschriebener Stand. Verhindert Write↔Watch↔Reload-Loops:
// nach dem Laden gesetzt, sodass das Autosave direkt nach loadFromDisk ein No-Op ist,
// und persist überspringt identischen Inhalt.
let lastSavedWorkflowJson: string | null = null
const workflowFileJson = (wf: Workflow): string =>
  JSON.stringify({ schemaVersion: 1, workflows: [wf] })

function touch(wf: Workflow): Workflow {
  return { ...wf, updatedAt: new Date().toISOString() }
}

// ── Exactly-once-Ledger für Nicht-Email-Trigger (C/D/E) ──────────────────────
// Geräte-lokal in localStorage (kein neues JSON im Vault → kein Watcher-Loop,
// kein Sync-Konflikt; analog zum Relevanz-Radar-Cache). Map "wfId::itemKey" → ISO.
const FIRED_LEDGER_KEY = (vaultPath: string) => `mindgraph:workflow-fired:${vaultPath}`
const LEDGER_CAP = 2000
const ledgerKey = (wfId: string, itemKey: string) => `${wfId}::${itemKey}`

function loadFiredLedger(vaultPath: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(FIRED_LEDGER_KEY(vaultPath)) || '{}') } catch { return {} }
}
// Baselines (edoobox-Count) sind KEINE Timestamps und müssen IMMER erhalten bleiben —
// sonst gilt ein Angebot wieder als „erstmals gesehen" und der Count-Delta geht verloren.
const isBaselineKey = (k: string) => k.includes('::edoobox-count:')
function saveFiredLedger(vaultPath: string, ledger: Record<string, string>): void {
  let l = ledger
  const all = Object.entries(l)
  if (all.length > LEDGER_CAP) {
    // Nur die einmaligen Feuer-Marker (ISO-Timestamp) altern lassen; Baselines bleiben.
    const baselines = all.filter(([k]) => isBaselineKey(k))
    const fired = all.filter(([k]) => !isBaselineKey(k))
      .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)) // älteste zuerst
    const keepFired = fired.slice(Math.max(0, fired.length - (LEDGER_CAP - baselines.length)))
    l = Object.fromEntries([...baselines, ...keepFired])
  }
  try { localStorage.setItem(FIRED_LEDGER_KEY(vaultPath), JSON.stringify(l)) } catch { /* Quota — ignorieren */ }
}

// ── Seed-Text-Formatierung (C/D/E): menschenlesbar, fließt in notes/human/ollama ──
function formatMahnung(r: AntaresVerleihRow): string {
  const name = [r.fn_vorname, r.fn_ename].filter(Boolean).join(' ').trim() || '(unbekannt)'
  return [
    'Überfällige Rückgabe (Mahnung)',
    `- Leihnr: ${r.fn_leihnr || '?'}`,
    `- Titel: ${r.fn_titel || '?'}`,
    `- Art: ${r.fn_info === 'medien' ? 'Medium' : 'Gerät'}`,
    `- Entleiher: ${name}`,
    `- Schule: ${r.fn_schulname || '?'}`,
    `- Rückgabe fällig: ${r.fn_rueckdatum || '?'}`
  ].join('\n')
}
function formatBooking(o: EdooboxOfferDashboard, prev: number, neu: number): string {
  return [
    'Neue Anmeldung',
    `- Angebot: ${o.name}${o.number ? ` (Nr. ${o.number})` : ''}`,
    `- Anmeldungen gesamt: ${o.bookingCount} (vorher ${prev})`,
    `- Neu: ${neu}`,
    o.maxParticipants ? `- Plätze: ${o.bookingCount}/${o.maxParticipants}` : ''
  ].filter(Boolean).join('\n')
}
function formatTask(note: Note, text: string, dueDate: Date, overdue: boolean): string {
  const due = dueDate.toISOString().slice(0, 10)
  return [
    'Fällige Aufgabe',
    `- Aufgabe: ${text}`,
    `- Notiz: ${note.title || note.id}`,
    `- Fällig: ${due}${overdue ? ' (überfällig)' : ''}`
  ].join('\n')
}

// ── Zeitplan (Layer F): ist der Workflow JETZT fällig? ───────────────────────
// occ = der jüngste geplante Zeitpunkt im aktuellen Tag/Woche/Monat. Fällig, wenn
// now >= occ UND seit occ noch nicht gefeuert (lastFired < occ). Catch-up: ein
// verpasster Tageslauf feuert beim nächsten App-Start.
function scheduleStateKey(vaultPath: string): string { return `mindgraph:workflow-schedule:${vaultPath}` }
function isScheduleDue(schedule: WorkflowSchedule, lastFiredIso: string | undefined, now: Date): boolean {
  const [hhRaw, mmRaw] = (schedule.time || '09:00').split(':')
  const hh = Math.min(23, Math.max(0, Number(hhRaw) || 0))
  const mm = Math.min(59, Math.max(0, Number(mmRaw) || 0))
  if (schedule.frequency === 'weekly') {
    const wd = Number.isFinite(schedule.weekday) ? Number(schedule.weekday) : 1 // Default Montag
    if (now.getDay() !== wd) return false
  } else if (schedule.frequency === 'monthly') {
    const dom = Number.isFinite(schedule.dayOfMonth) ? Number(schedule.dayOfMonth) : 1
    if (now.getDate() !== dom) return false
  }
  const occ = new Date(now)
  occ.setHours(hh, mm, 0, 0)
  if (now.getTime() < occ.getTime()) return false // geplante Uhrzeit noch nicht erreicht
  if (lastFiredIso && new Date(lastFiredIso).getTime() >= occ.getTime()) return false // schon gefeuert
  return true
}

export const useWorkflowStore = create<WorkflowStoreState>()((set, get) => ({
  workflow: buildExampleReplyWorkflow(),
  selectedNodeId: null,
  connecting: null,
  validation: validateWorkflow(buildExampleReplyWorkflow()),
  run: null,
  running: false,

  loadWorkflow: (wf) => set({ workflow: wf, validation: validateWorkflow(wf), selectedNodeId: null, run: null }),
  loadExample: () => {
    const wf = buildExampleReplyWorkflow()
    set({ workflow: wf, validation: validateWorkflow(wf), selectedNodeId: null, run: null })
  },
  newWorkflow: () => {
    const wf = buildEmptyWorkflow()
    set({ workflow: wf, validation: validateWorkflow(wf), selectedNodeId: null, run: null })
  },
  setName: (name) => set(s => ({ workflow: touch({ ...s.workflow, name }) })),

  addNode: (actionId, position) => {
    if (!getActionById(actionId)) return
    const node: WorkflowNode = { id: genId('node'), actionId, position, config: {} }
    set(s => {
      const wf = touch({ ...s.workflow, nodes: [...s.workflow.nodes, node] })
      return { workflow: wf, validation: validateWorkflow(wf), selectedNodeId: node.id }
    })
  },

  removeNode: (nodeId) => {
    set(s => {
      const nodes = s.workflow.nodes.filter(n => n.id !== nodeId)
      const edges = s.workflow.edges.filter(e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId)
      const wf = touch({ ...s.workflow, nodes, edges })
      return {
        workflow: wf,
        validation: validateWorkflow(wf),
        selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId
      }
    })
  },

  // Reine Positionsänderung — keine Revalidierung (Struktur unverändert).
  updateNodePosition: (nodeId, position) => {
    set(s => ({
      workflow: {
        ...s.workflow,
        nodes: s.workflow.nodes.map(n => (n.id === nodeId ? { ...n, position } : n))
      }
    }))
  },

  updateNodeConfig: (nodeId, patch) => {
    set(s => ({
      workflow: touch({
        ...s.workflow,
        nodes: s.workflow.nodes.map(n =>
          n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n
        )
      })
    }))
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  addEdge: (fromNodeId, fromPortId, toNodeId, toPortId) => {
    const s = get()
    if (fromNodeId === toNodeId) return false
    const fromNode = s.workflow.nodes.find(n => n.id === fromNodeId)
    const toNode = s.workflow.nodes.find(n => n.id === toNodeId)
    if (!fromNode || !toNode) return false
    if (!canConnectPorts(fromNode.actionId, fromPortId, toNode.actionId, toPortId)) return false

    // Doppelte Kante vermeiden.
    const exists = s.workflow.edges.some(
      e => e.fromNodeId === fromNodeId && e.fromPortId === fromPortId && e.toNodeId === toNodeId && e.toPortId === toPortId
    )
    if (exists) return false

    let edges = s.workflow.edges
    // Nicht-multiple Eingang: bestehende Verbindung ersetzen.
    const toAction = getActionById(toNode.actionId)
    const toPort = toAction && getPortDef(toAction, toPortId, 'input')
    if (toPort && !toPort.multiple) {
      edges = edges.filter(e => !(e.toNodeId === toNodeId && e.toPortId === toPortId))
    }

    const edge: WorkflowEdge = { id: genId('edge'), fromNodeId, fromPortId, toNodeId, toPortId }
    const wf = touch({ ...s.workflow, edges: [...edges, edge] })
    set({ workflow: wf, validation: validateWorkflow(wf) })
    return true
  },

  removeEdge: (edgeId) => {
    set(s => {
      const wf = touch({ ...s.workflow, edges: s.workflow.edges.filter(e => e.id !== edgeId) })
      return { workflow: wf, validation: validateWorkflow(wf) }
    })
  },

  setConnecting: (c) => set({ connecting: c }),

  simulate: () => {
    const { workflow } = get()
    set({ run: simulateWorkflow(workflow), running: false })
  },

  execute: async (vaultPath) => {
    const ollama = useUIStore.getState().ollama
    const features = useVaultSettingsStore.getState().features
    const emailState = useEmailStore.getState()
    const selected = emailState.emails.find(e => e.id === emailState.selectedEmailId)
    const seedEmail = selected
      ? { id: selected.id, subject: selected.subject, bodyText: selected.bodyText, from: selected.from?.address }
      : null

    set({ running: true, run: null })
    try {
      const result = await window.electronAPI.workflowRun({
        workflow: get().workflow,
        vaultPath,
        seedEmail,
        models: {
          selected: ollama.selectedModel,
          overrides: (ollama.moduleModelOverrides || {}) as Record<string, string>
        },
        features: features as unknown as Record<string, boolean>,
        projectsFolderRel: useUIStore.getState().projectsRootFolder || undefined
      })
      set({ run: result, running: false })
    } catch (e) {
      set({
        running: false,
        run: {
          id: 'run-error', workflowId: get().workflow.id, mode: 'execute', trigger: 'manual',
          status: 'failed', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
          steps: [], error: e instanceof Error ? e.message : String(e)
        }
      })
    }
  },

  clearRun: () => set({ run: null }),

  loadFromDisk: async (vaultPath) => {
    try {
      const file = await window.electronAPI.workflowLoad(vaultPath)
      const wf = file?.workflows?.[0]
      if (wf) {
        // Geladenen Stand als „bereits gespeichert" markieren → das Autosave direkt
        // nach dem Laden schreibt NICHT (bricht den Write↔Watch↔Reload-Loop).
        lastSavedWorkflowJson = workflowFileJson(wf)
        set({ workflow: wf, validation: validateWorkflow(wf), selectedNodeId: null, run: null })
      }
    } catch (e) {
      console.warn('[workflow] loadFromDisk:', e)
    }
  },

  persist: async (vaultPath) => {
    try {
      const json = workflowFileJson(get().workflow)
      if (json === lastSavedWorkflowJson) return // unveränderter Inhalt → kein Schreibvorgang
      await window.electronAPI.workflowSave(vaultPath, { schemaVersion: 1, workflows: [get().workflow] })
      lastSavedWorkflowJson = json
    } catch (e) {
      console.warn('[workflow] persist:', e)
    }
  },

  setEnabled: (enabled) => set(s => ({ workflow: touch({ ...s.workflow, enabled }) })),

  // Event-Pfad (Email-Trigger): feuert den Workflow für neue, noch nicht getriggerte
  // Mails. Das Prädikat hängt am Trigger-Baustein des Workflows:
  //   email.selectedEmail → relevante Mails, die eine Antwort brauchen (Standard)
  //   email.replyReceived → Antworten auf von dir gesendete Mails (Layer B)
  //   email.icsReceived   → Mails mit Kalender-Einladung (.ics) (Layer A)
  // Seriell (concurrency 1), exactly-once via emails.json-Marker (Decisions #5/#10).
  // Nicht-Email-Trigger (Mahnung/Buchung/Aufgabe/Zeitplan) laufen über eigene Pfade.
  runForNewEmails: async (vaultPath) => {
    if (triggerBatchRunning) return
    const wf = get().workflow
    const triggerActionId = wf.nodes.map(n => n.actionId).find(id => getActionById(id)?.isTrigger)
    if (!triggerActionId || !triggerActionId.startsWith('email.')) return // nur Email-Trigger hier

    const ollama = useUIStore.getState().ollama
    const features = useVaultSettingsStore.getState().features
    const emails = useEmailStore.getState().emails

    // Trigger-spezifisches Prädikat + Provenienz. Exactly-once-Guard (workflowRuns)
    // ist überall identisch; markWorkflowRun braucht ein vorhandenes e.analysis,
    // daher Boolean(e.analysis) im Prädikat.
    let predicate: (e: EmailMessage) => boolean
    let trigger: WorkflowRunTrigger
    let emptyMsg: string
    if (triggerActionId === 'email.replyReceived') {
      // Message-IDs normalisieren: envelope.messageId trägt oft Winkelklammern <…>,
      // mailparser liefert inReplyTo/references meist ohne — sonst Reply verfehlt.
      const normId = (id: string) => id.replace(/^<|>$/g, '').trim()
      const sentIds = new Set(emails.filter(e => e.sent && e.id).map(e => normId(e.id)))
      const isReply = (e: EmailMessage) =>
        !e.sent &&
        (Boolean(e.inReplyTo && sentIds.has(normId(e.inReplyTo))) || (e.references || []).some(r => sentIds.has(normId(r))))
      predicate = e => Boolean(e.analysis) && isReply(e) && !e.analysis?.replyHandled && !e.analysis?.workflowRuns?.[wf.id]
      trigger = 'event-reply'
      emptyMsg = 'Keine neuen Antworten auf gesendete Mails.'
    } else if (triggerActionId === 'email.icsReceived') {
      predicate = e =>
        Boolean(e.analysis) && !e.sent &&
        (e.attachmentNames || []).some(n => n.toLowerCase().endsWith('.ics')) &&
        !e.analysis?.workflowRuns?.[wf.id]
      trigger = 'event-ics'
      emptyMsg = 'Keine neuen Mails mit Kalender-Einladung.'
    } else {
      predicate = e =>
        Boolean(e.analysis?.relevant) &&
        Boolean(e.analysis?.needsReply) &&
        !e.analysis?.replyHandled &&
        !e.analysis?.workflowRuns?.[wf.id]
      trigger = 'event-email'
      emptyMsg = 'Keine neuen relevanten Mails.'
    }

    const candidates = emails.filter(predicate).slice(0, MAX_TRIGGER_BATCH)

    if (candidates.length === 0) {
      set({
        run: {
          id: genId('run'), workflowId: wf.id, mode: 'execute', trigger,
          status: 'success', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
          steps: [{ nodeId: '-', actionId: '-', label: 'Trigger', status: 'skipped', log: [emptyMsg] }]
        }
      })
      return
    }

    triggerBatchRunning = true
    set({ running: true, run: null })
    let last: WorkflowRun | null = null
    try {
      for (const email of candidates) {
        const result = await window.electronAPI.workflowRun({
          workflow: wf,
          vaultPath,
          trigger,
          seed: { email: { id: email.id, subject: email.subject, bodyText: email.bodyText, from: email.from?.address } },
          models: { selected: ollama.selectedModel, overrides: (ollama.moduleModelOverrides || {}) as Record<string, string> },
          features: features as unknown as Record<string, boolean>,
          projectsFolderRel: useUIStore.getState().projectsRootFolder || undefined
        })
        await useEmailStore.getState().markWorkflowRun(vaultPath, email.id, wf.id, result.id)
        last = result
      }
    } catch (e) {
      console.warn('[workflow] runForNewEmails:', e)
    } finally {
      triggerBatchRunning = false
      set({ running: false, run: last })
    }
  },

  // Generischer Trigger-Dispatch (Layer C/D/E). Email delegiert an runForNewEmails;
  // antares/edoobox/tasks sammeln eigene Kandidaten (Exactly-once via localStorage-Ledger)
  // und seeden den Workflow mit einem Text. schedule.timer läuft im Main-Prozess (Layer F).
  runTrigger: async (vaultPath) => {
    if (triggerBatchRunning) return
    const wf = get().workflow
    const triggerActionId = wf.nodes.map(n => n.actionId).find(id => getActionById(id)?.isTrigger)
    if (!triggerActionId) return
    if (triggerActionId.startsWith('email.')) { await get().runForNewEmails(vaultPath); return }
    if (!['antares.mahnung', 'edoobox.newBooking', 'tasks.dueSoon'].includes(triggerActionId)) return

    const ollama = useUIStore.getState().ollama
    const features = useVaultSettingsStore.getState().features as unknown as Record<string, boolean>
    const models = { selected: ollama.selectedModel, overrides: (ollama.moduleModelOverrides || {}) as Record<string, string> }
    const projectsFolderRel = useUIStore.getState().projectsRootFolder || undefined

    interface SeedItem { itemKey: string; text: string; meta?: Record<string, unknown> }

    // Gemeinsame Schleife: frische (noch nicht gefeuerte) Items seriell ausführen,
    // hart gedeckelt, Ledger pflegen. Liefert den anzuzeigenden Lauf zurück.
    const runItems = async (items: SeedItem[], trigger: WorkflowRunTrigger, emptyMsg: string): Promise<WorkflowRun> => {
      const ledger = loadFiredLedger(vaultPath)
      const fresh = items.filter(it => !ledger[ledgerKey(wf.id, it.itemKey)]).slice(0, MAX_TRIGGER_BATCH)
      if (fresh.length === 0) {
        return {
          id: genId('run'), workflowId: wf.id, mode: 'execute', trigger,
          status: 'success', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
          steps: [{ nodeId: '-', actionId: '-', label: 'Trigger', status: 'skipped', log: [emptyMsg] }]
        }
      }
      let last: WorkflowRun | null = null
      for (const it of fresh) {
        const result = await window.electronAPI.workflowRun({
          workflow: wf, vaultPath, trigger,
          seed: { text: it.text, meta: it.meta },
          models, features, projectsFolderRel
        })
        ledger[ledgerKey(wf.id, it.itemKey)] = new Date().toISOString()
        last = result
      }
      saveFiredLedger(vaultPath, ledger)
      return last as WorkflowRun
    }

    triggerBatchRunning = true
    set({ running: true })
    let finalRun: WorkflowRun | null = null
    try {
      if (triggerActionId === 'antares.mahnung') {
        // Sanfter Refresh (nur weil DIESER Trigger aktiv ist → kein Scrape bei anderen Triggern).
        try { await useAntaresStore.getState().loadAll() } catch { /* keine/abgelaufene Credentials */ }
        const a = useAntaresStore.getState()
        const rows = [...a.mahnungenGeraete, ...a.mahnungenMedien].filter(r => r.fn_leihnr)
        // Reset: Ledger-Einträge für Leihnrn entfernen, die nicht mehr überfällig sind,
        // damit ein zurückgegeben-und-erneut-überfälliges Item wieder feuern kann.
        const ledger = loadFiredLedger(vaultPath)
        const currentKeys = new Set(rows.map(r => `mahnung:${r.fn_leihnr}`))
        let changed = false
        for (const k of Object.keys(ledger)) {
          const prefix = `${wf.id}::mahnung:`
          if (k.startsWith(prefix) && !currentKeys.has(k.slice(wf.id.length + 2))) { delete ledger[k]; changed = true }
        }
        if (changed) saveFiredLedger(vaultPath, ledger)
        const items: SeedItem[] = rows.map(r => ({
          itemKey: `mahnung:${r.fn_leihnr}`,
          text: formatMahnung(r),
          meta: { leihnr: r.fn_leihnr, medium: r.fn_info, schule: r.fn_schulname }
        }))
        finalRun = await runItems(items, 'event-mahnung', 'Keine neuen überfälligen Rückgaben.')
      } else if (triggerActionId === 'edoobox.newBooking') {
        try { await useAgentStore.getState().loadDashboard() } catch { /* keine/abgelaufene Credentials */ }
        const offers = useAgentStore.getState().dashboardOffers
        // Baseline-Vergleich: pro Angebot den zuletzt gesehenen bookingCount merken;
        // beim ersten Sehen nur Baseline setzen (kein Fehlalarm gegen den Bestand).
        const ledger = loadFiredLedger(vaultPath)
        const items: SeedItem[] = []
        const baselineUpdates: [string, string][] = []
        for (const o of offers) {
          const baseKey = ledgerKey(wf.id, `edoobox-count:${o.id}`)
          const prev = Number(ledger[baseKey])
          if (Number.isFinite(prev) && o.bookingCount > prev) {
            items.push({
              itemKey: `booking:${o.id}:${o.bookingCount}`,
              text: formatBooking(o, prev, o.bookingCount - prev),
              meta: { offerId: o.id, bookingCount: o.bookingCount, newCount: o.bookingCount - prev }
            })
          }
          baselineUpdates.push([baseKey, String(o.bookingCount)])
        }
        finalRun = await runItems(items, 'event-booking', 'Keine neuen Anmeldungen.')
        // Baseline ERST nach dem Lauf vorrücken — schlägt runItems fehl (wirft → catch),
        // bleibt die alte Baseline stehen und der Delta wird beim nächsten Poll erneut versucht.
        const l2 = loadFiredLedger(vaultPath)
        for (const [k, v] of baselineUpdates) l2[k] = v
        saveFiredLedger(vaultPath, l2)
      } else {
        // tasks.dueSoon — lokal aus den geladenen Notizen (kein externer Call).
        const notes = useNotesStore.getState().notes
        const horizon = Date.now() + 24 * 3600 * 1000
        const now = Date.now()
        const items: SeedItem[] = []
        for (const note of notes) {
          if (!note.content) continue // Cache-Stub ohne Inhalt überspringen (wie reminderStore)
          const { tasks } = extractTasks(note.content)
          for (const task of tasks) {
            if (task.completed || !task.dueDate) continue
            if (task.dueDate.getTime() > horizon) continue
            items.push({
              itemKey: `task:${note.id}:${task.line}:${task.text.slice(0, 20)}`,
              text: formatTask(note, task.text, task.dueDate, task.dueDate.getTime() < now),
              meta: { noteId: note.id, line: task.line }
            })
          }
        }
        finalRun = await runItems(items, 'event-task', 'Keine fälligen Aufgaben.')
      }
    } catch (e) {
      console.warn('[workflow] runTrigger:', e)
    } finally {
      triggerBatchRunning = false
      set({ running: false, run: finalRun ?? get().run })
    }
  },

  // Layer F — Zeitplan. Wird von einem App-level Timer alle 60s aufgerufen (tab-unabhängig).
  // Liest den persistierten Workflow DIREKT von Platte, damit es auch feuert, wenn der
  // Canvas-Tab nie geöffnet wurde (get().workflow wäre dann der Beispiel-Workflow).
  runScheduledIfDue: async (vaultPath) => {
    if (triggerBatchRunning) return
    let wf: Workflow | undefined
    try {
      const file = await window.electronAPI.workflowLoad(vaultPath)
      wf = file?.workflows?.[0]
    } catch { return }
    if (!wf || !wf.enabled) return
    const node = wf.nodes.find(n => n.actionId === 'schedule.timer')
    if (!node) return

    const cfg = node.config as { frequency?: string; time?: string; weekday?: unknown; dayOfMonth?: unknown }
    const schedule: WorkflowSchedule = {
      frequency: (cfg.frequency === 'weekly' || cfg.frequency === 'monthly') ? cfg.frequency : 'daily',
      time: typeof cfg.time === 'string' ? cfg.time : undefined,
      weekday: cfg.weekday != null && cfg.weekday !== '' ? Number(cfg.weekday) : undefined,
      dayOfMonth: cfg.dayOfMonth != null && cfg.dayOfMonth !== '' ? Number(cfg.dayOfMonth) : undefined
    }

    const now = new Date()
    const stateRaw = (() => { try { return JSON.parse(localStorage.getItem(scheduleStateKey(vaultPath)) || '{}') } catch { return {} } })()
    const state = stateRaw as Record<string, string>
    if (!isScheduleDue(schedule, state[wf.id], now)) return

    const ollama = useUIStore.getState().ollama
    const features = useVaultSettingsStore.getState().features as unknown as Record<string, boolean>
    const models = { selected: ollama.selectedModel, overrides: (ollama.moduleModelOverrides || {}) as Record<string, string> }
    const projectsFolderRel = useUIStore.getState().projectsRootFolder || undefined

    triggerBatchRunning = true
    set({ running: true })
    // lastFired VOR dem Lauf festschreiben → at-most-once pro Periode. Ein fehlgeschlagener
    // Tageslauf wird NICHT alle 60s erneut versucht (sondern erst in der nächsten Periode).
    state[wf.id] = now.toISOString()
    try { localStorage.setItem(scheduleStateKey(vaultPath), JSON.stringify(state)) } catch { /* Quota */ }
    try {
      const dateText = `Geplanter Lauf — ${now.toISOString().slice(0, 10)} ${schedule.time || '09:00'}`
      const result = await window.electronAPI.workflowRun({
        workflow: wf, vaultPath, trigger: 'event-scheduled',
        seed: { text: dateText, meta: { scheduledAt: now.toISOString(), frequency: schedule.frequency } },
        models, features, projectsFolderRel
      })
      set({ run: result })
    } catch (e) {
      console.warn('[workflow] runScheduledIfDue:', e)
    } finally {
      triggerBatchRunning = false
      set({ running: false })
    }
  }
}))
