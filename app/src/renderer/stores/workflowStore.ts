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
import { buildEmptyWorkflow, buildExampleWorkflows } from '../../shared/workflow/examples'
import { useUIStore } from './uiStore'
import { useVaultSettingsStore } from './vaultSettingsStore'
import { useEmailStore } from './emailStore'
import { useNotesStore } from './notesStore'
import { useAntaresStore } from './antaresStore'
import { useEventAgentBridge } from './eventAgentBridge'
import { extractTasks } from '../utils/linkExtractor'
import type { AntaresVerleihRow, EdooboxBooking, EdooboxOfferDashboard, Note } from '../../shared/types'

interface ConnectingState {
  nodeId: string
  actionId: string
  portId: string
  kind: WorkflowPortKind
}

interface WorkflowStoreState {
  /** Aktive Arbeitskopie — Canvas + alle Editier-/Trigger-Pfade lesen nur diese. */
  workflow: Workflow
  /** Alle gespeicherten Workflows (inaktive sind hier voll, der aktive wird beim
   *  Persist/Switch aus `workflow` rein-reconcilet). Quelle für die Auswahl-Liste. */
  workflows: Workflow[]
  /** ID des aktuell aktiven Workflows (= workflow.id). */
  activeId: string
  selectedNodeId: string | null
  connecting: ConnectingState | null
  validation: WorkflowValidationResult
  run: WorkflowRun | null
  running: boolean

  loadWorkflow: (wf: Workflow) => void
  loadExample: () => void
  newWorkflow: () => void
  /** Aktiven Workflow als Kopie anlegen und aktiv schalten. */
  duplicateWorkflow: () => void
  /** Workflow per ID löschen (mind. einer bleibt; löscht man den aktiven, wird der nächste aktiv). */
  deleteWorkflow: (id: string) => void
  /** Anderen gespeicherten Workflow aktiv schalten (aktuelle Edits werden vorher gesichert). */
  switchWorkflow: (id: string) => void
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
const workflowFileJson = (workflows: Workflow[], activeId: string): string =>
  JSON.stringify({ schemaVersion: 1, activeId, workflows })

/** Liste mit der aktiven Arbeitskopie zusammenführen: ersetzt den Eintrag mit
 *  passender ID durch `active` (hängt ihn an, falls noch nicht vorhanden).
 *  So bleiben Live-Edits des aktiven Workflows beim Speichern/Wechseln erhalten. */
function reconcileList(workflows: Workflow[], activeId: string, active: Workflow): Workflow[] {
  let found = false
  const list = workflows.map(w => (w.id === activeId ? ((found = true), active) : w))
  if (!found) list.push(active)
  return list
}

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
  const email = extractEmail(r)
  return [
    'Überfällige Rückgabe (Mahnung)',
    `- Leihnr: ${r.fn_leihnr || '?'}`,
    `- Titel: ${r.fn_titel || '?'}`,
    `- Art: ${r.fn_info === 'medien' ? 'Medium' : 'Gerät'}`,
    `- Entleiher: ${name}`,
    email ? `- E-Mail: ${email}` : '',
    `- Schule: ${r.fn_schulname || '?'}`,
    `- Rückgabe fällig: ${r.fn_rueckdatum || '?'}`
  ].filter(Boolean).join('\n')
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
function formatBookingParticipant(o: EdooboxOfferDashboard, b: EdooboxBooking): string {
  return [
    'Neue Anmeldung',
    `- Angebot: ${o.name}${o.number ? ` (Nr. ${o.number})` : ''}`,
    `- Teilnehmer: ${b.userName || 'Unbekannt'}`,
    b.userEmail ? `- E-Mail: ${b.userEmail}` : '',
    b.schule ? `- Schule: ${b.schule}` : '',
    b.personalNr ? `- Personal-Nr: ${b.personalNr}` : '',
    b.bookedAt ? `- Gebucht am: ${b.bookedAt}` : '',
    o.maxParticipants ? `- Plätze: ${o.bookingCount}/${o.maxParticipants}` : ''
  ].filter(Boolean).join('\n')
}
function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}
function extractEmail(obj: Record<string, unknown>): string {
  const direct = pickString(obj, [
    'email', 'mail', 'e_mail', 'eMail', 'userEmail', 'fn_email', 'fn_mail',
    'fn_emailadresse', 'fn_emailadr', 'fn_mailadresse', 'fn_eml'
  ])
  if (direct) return direct
  for (const value of Object.values(obj)) {
    if (typeof value !== 'string') continue
    const match = value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    if (match) return match[0]
  }
  return ''
}
function formatTask(note: Note, text: string, dueDate: Date): string {
  const due = dueDate.toISOString().slice(0, 10)
  return [
    'Heute fällige Aufgabe',
    `- Aufgabe: ${text}`,
    `- Notiz: ${note.title || note.id}`,
    `- Fällig: ${due}`
  ].join('\n')
}

interface WorkflowSeedItem {
  itemKey: string
  text: string
  meta?: Record<string, unknown>
  email?: { id?: string; subject?: string; bodyText?: string; from?: string; name?: string }
}

function collectTodayDueTaskItems(notes: Note[]): WorkflowSeedItem[] {
  const startToday = new Date()
  startToday.setHours(0, 0, 0, 0)
  const endToday = new Date(startToday)
  endToday.setHours(23, 59, 59, 999)
  const items: WorkflowSeedItem[] = []

  for (const note of notes) {
    if (!note.content) continue // Cache-Stub ohne Inhalt überspringen (wie reminderStore)
    const { tasks } = extractTasks(note.content)
    for (const task of tasks) {
      if (task.completed || !task.dueDate) continue
      if (task.dueDate < startToday || task.dueDate > endToday) continue
      items.push({
        itemKey: `task:${note.id}:${task.line}:${task.text.slice(0, 20)}`,
        text: formatTask(note, task.text, task.dueDate),
        meta: { noteId: note.id, line: task.line }
      })
    }
  }

  return items
}

// ── Item-Builder (geteilt zwischen Event-Pfad runTrigger und manuellem ▶ execute) ──
function antaresRowToItem(r: AntaresVerleihRow): WorkflowSeedItem {
  const name = [r.fn_vorname, r.fn_ename].filter(Boolean).join(' ').trim()
  const email = extractEmail(r)
  const subject = `Überfällige Rückgabe: ${r.fn_titel || r.fn_leihnr || ''}`.trim()
  return {
    itemKey: `mahnung:${r.fn_leihnr}`,
    text: formatMahnung(r),
    meta: { leihnr: r.fn_leihnr, medium: r.fn_info, schule: r.fn_schulname, recipientEmail: email, recipientName: name, subject },
    email: { id: `antares:${r.fn_leihnr}`, subject, bodyText: formatMahnung(r), from: email, name }
  }
}
function edooboxBookingToItem(o: EdooboxOfferDashboard, b: EdooboxBooking, newCount: number): WorkflowSeedItem {
  const text = formatBookingParticipant(o, b)
  return {
    itemKey: `booking:${o.id}:${b.id || o.bookingCount}`,
    text,
    meta: {
      offerId: o.id, bookingId: b.id, bookingCount: o.bookingCount, newCount,
      recipientEmail: b.userEmail, recipientName: b.userName, userEmail: b.userEmail, userName: b.userName,
      subject: `Neue Anmeldung: ${o.name}`
    },
    email: { id: `edoobox:${b.id || `${o.id}:${o.bookingCount}`}`, subject: `Neue Anmeldung: ${o.name}`, bodyText: text, from: b.userEmail, name: b.userName }
  }
}
function edooboxOfferToItem(o: EdooboxOfferDashboard, prev: number, newCount: number): WorkflowSeedItem {
  const text = formatBooking(o, prev, newCount)
  return {
    itemKey: `booking:${o.id}:${o.bookingCount}`,
    text,
    meta: { offerId: o.id, bookingCount: o.bookingCount, newCount, subject: `Neue Anmeldung: ${o.name}` },
    email: { id: `edoobox:${o.id}:${o.bookingCount}`, subject: `Neue Anmeldung: ${o.name}`, bodyText: text }
  }
}

// Manuelle Seeds (▶ Ausführen) für die externen Trigger — ohne Ledger/Baseline
// (manuell ist explizit, wie der tasks.dueSoon-Manualpfad). Liefert eine
// repräsentative aktuelle Mahnung bzw. Anmeldung, damit der manuelle Lauf etwas
// Sinnvolles seedet statt eines leeren Textes / einer fremden Inbox-Mail.
async function collectAntaresItems(): Promise<WorkflowSeedItem[]> {
  try { await useAntaresStore.getState().loadAll() } catch { /* keine/abgelaufene Credentials */ }
  const a = useAntaresStore.getState()
  return [...a.mahnungenGeraete, ...a.mahnungenMedien].filter(r => r.fn_leihnr).map(antaresRowToItem)
}
async function collectEdooboxManualItem(): Promise<WorkflowSeedItem | null> {
  const bridge = useEventAgentBridge.getState()
  try { await bridge.loadOffers() } catch { /* keine/abgelaufene Credentials */ }
  const offer = useEventAgentBridge.getState().offers.find(o => o.bookingCount > 0)
  if (!offer) return null
  let bookings: EdooboxBooking[] = []
  try {
    bookings = await bridge.listBookings(offer.id)
  } catch { bookings = [] }
  const b = bookings.slice().sort((x, y) => (Date.parse(y.bookedAt || '') || 0) - (Date.parse(x.bookedAt || '') || 0))[0]
  return b ? edooboxBookingToItem(offer, b, 1) : edooboxOfferToItem(offer, 0, offer.bookingCount)
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

export const useWorkflowStore = create<WorkflowStoreState>()((set, get) => {
  const examples = buildExampleWorkflows()
  const initial = examples[0]
  return {
  workflow: initial,
  workflows: examples,
  activeId: initial.id,
  selectedNodeId: null,
  connecting: null,
  validation: validateWorkflow(initial),
  run: null,
  running: false,

  // Setzt einen Workflow aktiv (vorhandene ID → ersetzen, sonst anhängen). Sichert
  // vorher die Edits des bisher aktiven via reconcileList.
  loadWorkflow: (wf) => set(s => {
    const merged = reconcileList(s.workflows, s.activeId, s.workflow)
    const workflows = merged.some(w => w.id === wf.id)
      ? merged.map(w => (w.id === wf.id ? wf : w))
      : [...merged, wf]
    return { workflows, activeId: wf.id, workflow: wf, validation: validateWorkflow(wf), selectedNodeId: null, run: null }
  }),
  // „Beispiel" hängt GENAU EIN Template an (zerstört nichts): das erste noch nicht
  // vorhandene; sind alle 7 vorhanden, eine frische Kopie des Flaggschiffs. So passt
  // das Verhalten zum (Einzahl-)Button — wiederholtes Klicken läuft die Beispiele durch.
  loadExample: () => set(s => {
    const merged = reconcileList(s.workflows, s.activeId, s.workflow)
    const existing = new Set(merged.map(w => w.id))
    const templates = buildExampleWorkflows()
    const next = templates.find(w => !existing.has(w.id))
    const base = next ?? templates[0]
    const wf = next ?? {
      ...base,
      id: genId('wf'),
      name: `${base.name} (Kopie)`,
      nodes: base.nodes.map(n => ({ ...n, config: { ...n.config } })),
      edges: base.edges.map(e => ({ ...e }))
    }
    return { workflows: [...merged, wf], activeId: wf.id, workflow: wf, validation: validateWorkflow(wf), selectedNodeId: null, run: null }
  }),
  // „Neu" hängt einen leeren Workflow an (zerstört nichts) und schaltet ihn aktiv.
  newWorkflow: () => set(s => {
    const merged = reconcileList(s.workflows, s.activeId, s.workflow)
    const wf = buildEmptyWorkflow()
    return { workflows: [...merged, wf], activeId: wf.id, workflow: wf, validation: validateWorkflow(wf), selectedNodeId: null, run: null }
  }),
  duplicateWorkflow: () => set(s => {
    const merged = reconcileList(s.workflows, s.activeId, s.workflow)
    const now = new Date().toISOString()
    const copy: Workflow = {
      ...s.workflow,
      id: genId('wf'),
      name: `${s.workflow.name} (Kopie)`,
      enabled: false, // Kopie nicht versehentlich scharf schalten
      nodes: s.workflow.nodes.map(n => ({ ...n, config: { ...n.config } })),
      edges: s.workflow.edges.map(e => ({ ...e })),
      createdAt: now,
      updatedAt: now
    }
    return { workflows: [...merged, copy], activeId: copy.id, workflow: copy, validation: validateWorkflow(copy), selectedNodeId: null, run: null }
  }),
  deleteWorkflow: (id) => set(s => {
    const merged = reconcileList(s.workflows, s.activeId, s.workflow)
    const remaining = merged.filter(w => w.id !== id)
    if (remaining.length === 0) {
      // Nie 0 Workflows zurücklassen → leeren Startpunkt anlegen.
      const wf = buildEmptyWorkflow()
      return { workflows: [wf], activeId: wf.id, workflow: wf, validation: validateWorkflow(wf), selectedNodeId: null, run: null }
    }
    if (id === s.activeId) {
      const target = remaining[0]
      return { workflows: remaining, activeId: target.id, workflow: target, validation: validateWorkflow(target), selectedNodeId: null, run: null }
    }
    return { workflows: remaining }
  }),
  switchWorkflow: (id) => set(s => {
    if (id === s.activeId) return {}
    const merged = reconcileList(s.workflows, s.activeId, s.workflow)
    const target = merged.find(w => w.id === id)
    if (!target) return {}
    return { workflows: merged, activeId: id, workflow: target, validation: validateWorkflow(target), selectedNodeId: null, run: null }
  }),
  // Umbenennen aktualisiert auch den Listeneintrag, damit der Picker sofort stimmt.
  setName: (name) => set(s => ({
    workflow: touch({ ...s.workflow, name }),
    workflows: s.workflows.map(w => (w.id === s.activeId ? { ...w, name } : w))
  })),

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
    const wf = get().workflow
    const triggerActionId = wf.nodes.map(n => n.actionId).find(id => getActionById(id)?.isTrigger)
    const ollama = useUIStore.getState().ollama
    const features = useVaultSettingsStore.getState().features
    const emailState = useEmailStore.getState()
    const selected = emailState.emails.find(e => e.id === emailState.selectedEmailId)
    const seedEmail = selected
      ? { id: selected.id, subject: selected.subject, bodyText: selected.bodyText, from: selected.from?.address }
      : null

    // Manueller Seed je Trigger-Art. Externe Trigger (Mahnung/Buchung/Aufgabe)
    // brauchen ein eigenes Item — NICHT die zufällig markierte Inbox-Mail. Ist
    // nichts da, sauberer „skipped"-Lauf statt eines leeren/falschen Entwurfs.
    set({ running: true, run: null })
    let skipMsg: string | null = null
    let seed: { text?: string; meta?: Record<string, unknown>; email?: WorkflowSeedItem['email'] } | null = null
    if (triggerActionId === 'tasks.dueSoon') {
      const item = collectTodayDueTaskItems(useNotesStore.getState().notes)[0]
      if (!item) skipMsg = 'Keine heute fälligen Aufgaben.'
      else seed = { text: item.text, meta: item.meta }
    } else if (triggerActionId === 'antares.mahnung') {
      const item = (await collectAntaresItems())[0]
      if (!item) skipMsg = 'Keine überfälligen Rückgaben gefunden.'
      else seed = { text: item.text, meta: item.meta, email: item.email }
    } else if (triggerActionId === 'edoobox.newBooking') {
      const item = await collectEdooboxManualItem()
      if (!item) skipMsg = 'Keine Anmeldungen gefunden.'
      else seed = { text: item.text, meta: item.meta, email: item.email }
    } else {
      seed = seedEmail ? { email: seedEmail } : null
    }

    if (skipMsg) {
      set({
        running: false,
        run: {
          id: genId('run'), workflowId: wf.id, mode: 'execute', trigger: 'manual',
          status: 'success', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
          steps: [{ nodeId: '-', actionId: '-', label: 'Trigger', status: 'skipped', log: [skipMsg] }]
        }
      })
      return
    }

    try {
      const result = await window.electronAPI.workflowRun({
        workflow: wf,
        vaultPath,
        seed,
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
      const list = file?.workflows ?? []
      if (list.length) {
        // activeId aus Datei übernehmen, falls vorhanden + gültig; sonst erster Eintrag.
        const activeId = file?.activeId && list.some(w => w.id === file.activeId) ? file.activeId : list[0].id
        const active = list.find(w => w.id === activeId) || list[0]
        // Geladenen Stand als „bereits gespeichert" markieren → das Autosave direkt
        // nach dem Laden schreibt NICHT (bricht den Write↔Watch↔Reload-Loop).
        lastSavedWorkflowJson = workflowFileJson(list, active.id)
        set({ workflows: list, activeId: active.id, workflow: active, validation: validateWorkflow(active), selectedNodeId: null, run: null })
      }
    } catch (e) {
      console.warn('[workflow] loadFromDisk:', e)
    }
  },

  persist: async (vaultPath) => {
    try {
      const { workflow, workflows, activeId } = get()
      // Aktive Arbeitskopie in die Liste reconcilen → ALLE Workflows persistieren.
      const list = reconcileList(workflows, activeId, workflow)
      const json = workflowFileJson(list, activeId)
      if (json === lastSavedWorkflowJson) return // unveränderter Inhalt → kein Schreibvorgang
      await window.electronAPI.workflowSave(vaultPath, { schemaVersion: 1, activeId, workflows: list })
      lastSavedWorkflowJson = json
    } catch (e) {
      console.warn('[workflow] persist:', e)
    }
  },

  setEnabled: (enabled) => set(s => ({
    workflow: touch({ ...s.workflow, enabled }),
    workflows: s.workflows.map(w => (w.id === s.activeId ? { ...w, enabled } : w))
  })),

  // Event-Pfad (Email-Trigger): feuert den Workflow für neue, noch nicht getriggerte
  // Mails. Das Prädikat hängt am Trigger-Baustein des Workflows:
  //   email.selectedEmail → relevante Mails, die eine Antwort brauchen (Standard)
  //   email.replyReceived → Antworten auf von dir gesendete Mails (Layer B)
  //   email.icsReceived   → Mails mit Kalender-Einladung (.ics) (Layer A)
  // Seriell (concurrency 1), exactly-once via emails.json-Marker (Decisions #5/#10).
  // Nicht-Email-Trigger (Mahnung/Buchung/Aufgabe/Zeitplan) laufen über eigene Pfade.
  runForNewEmails: async (vaultPath) => {
    if (triggerBatchRunning) return
    // Multi-Workflow: ALLE aktivierten Workflows mit Email-Trigger feuern (nicht nur
    // der aktive im Canvas). Exactly-once ist bereits per wf.id gekeyt (workflowRuns).
    const targets = reconcileList(get().workflows, get().activeId, get().workflow).filter(w => {
      const t = w.nodes.map(n => n.actionId).find(id => getActionById(id)?.isTrigger) || ''
      return w.enabled && t.startsWith('email.')
    })
    if (targets.length === 0) return

    const ollama = useUIStore.getState().ollama
    const features = useVaultSettingsStore.getState().features as unknown as Record<string, boolean>
    const emails = useEmailStore.getState().emails
    const models = { selected: ollama.selectedModel, overrides: (ollama.moduleModelOverrides || {}) as Record<string, string> }
    const projectsFolderRel = useUIStore.getState().projectsRootFolder || undefined

    // Trigger-spezifisches Prädikat + Provenienz pro Workflow. Exactly-once-Guard
    // (workflowRuns[wf.id]) ist überall identisch; markWorkflowRun braucht ein
    // vorhandenes e.analysis, daher Boolean(e.analysis) im Prädikat.
    const buildPredicate = (wf: Workflow, triggerActionId: string): { predicate: (e: EmailMessage) => boolean; trigger: WorkflowRunTrigger; emptyMsg: string } => {
      if (triggerActionId === 'email.replyReceived') {
        // Message-IDs normalisieren: envelope.messageId trägt oft Winkelklammern <…>,
        // mailparser liefert inReplyTo/references meist ohne — sonst Reply verfehlt.
        const normId = (id: string) => id.replace(/^<|>$/g, '').trim()
        const sentIds = new Set(emails.filter(e => e.sent && e.id).map(e => normId(e.id)))
        const isReply = (e: EmailMessage) =>
          !e.sent &&
          (Boolean(e.inReplyTo && sentIds.has(normId(e.inReplyTo))) || (e.references || []).some(r => sentIds.has(normId(r))))
        return {
          predicate: e => Boolean(e.analysis) && isReply(e) && !e.analysis?.replyHandled && !e.analysis?.workflowRuns?.[wf.id],
          trigger: 'event-reply',
          emptyMsg: 'Keine neuen Antworten auf gesendete Mails.'
        }
      }
      if (triggerActionId === 'email.icsReceived') {
        return {
          predicate: e =>
            Boolean(e.analysis) && !e.sent &&
            (e.attachmentNames || []).some(n => n.toLowerCase().endsWith('.ics')) &&
            !e.analysis?.workflowRuns?.[wf.id],
          trigger: 'event-ics',
          emptyMsg: 'Keine neuen Mails mit Kalender-Einladung.'
        }
      }
      return {
        predicate: e =>
          Boolean(e.analysis?.relevant) && Boolean(e.analysis?.needsReply) &&
          !e.analysis?.replyHandled && !e.analysis?.workflowRuns?.[wf.id],
        trigger: 'event-email',
        emptyMsg: 'Keine neuen relevanten Mails.'
      }
    }

    triggerBatchRunning = true
    set({ running: true, run: null })
    let lastReal: WorkflowRun | null = null
    let lastSkip: WorkflowRun | null = null
    try {
      for (const wf of targets) {
        const triggerActionId = wf.nodes.map(n => n.actionId).find(id => getActionById(id)?.isTrigger) as string
        const { predicate, trigger, emptyMsg } = buildPredicate(wf, triggerActionId)
        const candidates = emails.filter(predicate).slice(0, MAX_TRIGGER_BATCH)
        if (candidates.length === 0) {
          lastSkip = {
            id: genId('run'), workflowId: wf.id, mode: 'execute', trigger,
            status: 'success', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
            steps: [{ nodeId: '-', actionId: '-', label: 'Trigger', status: 'skipped', log: [emptyMsg] }]
          }
          continue
        }
        for (const email of candidates) {
          const result = await window.electronAPI.workflowRun({
            workflow: wf,
            vaultPath,
            trigger,
            seed: { email: { id: email.id, subject: email.subject, bodyText: email.bodyText, from: email.from?.address } },
            models, features, projectsFolderRel
          })
          // Nur erfolgreiche Läufe als „erledigt" markieren — sonst macht ein
          // transienter Fehler (Ollama aus, Hard-Lock, RAG-Fehler) die Mail dauerhaft
          // unsichtbar für den Workflow (runWorkflow liefert failed-Runs, wirft nicht).
          if (result.status === 'success') await useEmailStore.getState().markWorkflowRun(vaultPath, email.id, wf.id, result.id)
          lastReal = result
        }
      }
    } catch (e) {
      console.warn('[workflow] runForNewEmails:', e)
    } finally {
      triggerBatchRunning = false
      set({ running: false, run: lastReal ?? lastSkip ?? get().run })
    }
  },

  // Poll-Trigger-Dispatch (Layer C/D/E) für ALLE aktivierten Workflows. Email-Trigger
  // laufen über den Mail-Signal-Pfad runForNewEmails; antares/edoobox/tasks sammeln
  // eigene Kandidaten (Exactly-once via localStorage-Ledger) und seeden mit Text +
  // Kontakt. schedule.timer läuft tab-unabhängig über runScheduledIfDue (Layer F).
  runTrigger: async (vaultPath) => {
    if (triggerBatchRunning) return
    const triggerOf = (w: Workflow) => w.nodes.map(n => n.actionId).find(id => getActionById(id)?.isTrigger) || ''
    // Multi-Workflow: ALLE aktivierten Poll-Trigger-Workflows (nicht nur der aktive).
    // Email-Trigger laufen über den eigenen (Mail-Signal-)Pfad runForNewEmails.
    const pollTargets = reconcileList(get().workflows, get().activeId, get().workflow)
      .filter(w => w.enabled && ['antares.mahnung', 'edoobox.newBooking', 'tasks.dueSoon'].includes(triggerOf(w)))
    if (pollTargets.length === 0) return

    const ollama = useUIStore.getState().ollama
    const features = useVaultSettingsStore.getState().features as unknown as Record<string, boolean>
    const models = { selected: ollama.selectedModel, overrides: (ollama.moduleModelOverrides || {}) as Record<string, string> }
    const projectsFolderRel = useUIStore.getState().projectsRootFolder || undefined

    // Gemeinsame Schleife pro Workflow: frische Items seriell, hart gedeckelt,
    // Ledger NUR bei Erfolg pflegen (sonst macht ein transienter Fehler das Item
    // dauerhaft unsichtbar). Liefert den anzuzeigenden Lauf zurück.
    const runItems = async (wf: Workflow, items: WorkflowSeedItem[], trigger: WorkflowRunTrigger, emptyMsg: string): Promise<WorkflowRun> => {
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
      let changed = false
      for (const it of fresh) {
        const result = await window.electronAPI.workflowRun({
          workflow: wf, vaultPath, trigger,
          seed: { text: it.text, meta: it.meta, email: it.email },
          models, features, projectsFolderRel
        })
        if (result.status === 'success') { ledger[ledgerKey(wf.id, it.itemKey)] = new Date().toISOString(); changed = true }
        last = result
      }
      if (changed) saveFiredLedger(vaultPath, ledger)
      return last as WorkflowRun
    }

    // Externe Quellen EINMAL laden und über alle Workflows derselben Art teilen
    // (kein N-faches Dashboard-Scrape bei mehreren aktivierten Workflows).
    const families = new Set(pollTargets.map(triggerOf))
    let antaresRows: AntaresVerleihRow[] = []
    if (families.has('antares.mahnung')) {
      try { await useAntaresStore.getState().loadAll() } catch { /* keine/abgelaufene Credentials */ }
      const a = useAntaresStore.getState()
      antaresRows = [...a.mahnungenGeraete, ...a.mahnungenMedien].filter(r => r.fn_leihnr)
    }
    let edooboxOffers: EdooboxOfferDashboard[] = []
    const bookingsCache = new Map<string, EdooboxBooking[]>()
    if (families.has('edoobox.newBooking')) {
      try { await useEventAgentBridge.getState().loadOffers() } catch { /* keine/abgelaufene Credentials */ }
      edooboxOffers = useEventAgentBridge.getState().offers
    }
    const taskItems = families.has('tasks.dueSoon') ? collectTodayDueTaskItems(useNotesStore.getState().notes) : []

    triggerBatchRunning = true
    set({ running: true })
    let finalRun: WorkflowRun | null = null
    try {
      for (const wf of pollTargets) {
        const t = triggerOf(wf)
        if (t === 'antares.mahnung') {
          // Reset: Ledger-Einträge für Leihnrn entfernen, die nicht mehr überfällig
          // sind, damit ein zurückgegeben-und-erneut-überfälliges Item wieder feuert.
          const ledger = loadFiredLedger(vaultPath)
          const currentKeys = new Set(antaresRows.map(r => `mahnung:${r.fn_leihnr}`))
          const prefix = `${wf.id}::mahnung:`
          let changed = false
          for (const k of Object.keys(ledger)) {
            if (k.startsWith(prefix) && !currentKeys.has(k.slice(wf.id.length + 2))) { delete ledger[k]; changed = true }
          }
          if (changed) saveFiredLedger(vaultPath, ledger)
          finalRun = await runItems(wf, antaresRows.map(antaresRowToItem), 'event-mahnung', 'Keine neuen überfälligen Rückgaben.')
        } else if (t === 'edoobox.newBooking') {
          // Baseline-Vergleich: pro Angebot den zuletzt gesehenen bookingCount merken;
          // beim ersten Sehen nur Baseline setzen (kein Fehlalarm gegen den Bestand).
          const ledger = loadFiredLedger(vaultPath)
          const items: WorkflowSeedItem[] = []
          const baselineUpdates: [string, string][] = []
          for (const o of edooboxOffers) {
            const baseKey = ledgerKey(wf.id, `edoobox-count:${o.id}`)
            const prev = Number(ledger[baseKey])
            if (Number.isFinite(prev) && o.bookingCount > prev) {
              const newCount = o.bookingCount - prev
              let bookings = bookingsCache.get(o.id)
              if (!bookings) {
                try {
                  bookings = await useEventAgentBridge.getState().listBookings(o.id)
                } catch { bookings = [] }
                bookingsCache.set(o.id, bookings)
              }
              const freshBookings = bookings
                .slice()
                .sort((a, b) => (Date.parse(b.bookedAt || '') || 0) - (Date.parse(a.bookedAt || '') || 0))
                .slice(0, Math.max(1, newCount))
              if (freshBookings.length > 0) {
                for (const b of freshBookings) items.push(edooboxBookingToItem(o, b, newCount))
              } else {
                items.push(edooboxOfferToItem(o, prev, newCount))
              }
            }
            baselineUpdates.push([baseKey, String(o.bookingCount)])
          }
          finalRun = await runItems(wf, items, 'event-booking', 'Keine neuen Anmeldungen.')
          // Baseline ERST nach dem Lauf vorrücken — schlägt runItems fehl (wirft → catch),
          // bleibt die alte Baseline stehen und der Delta wird beim nächsten Poll erneut versucht.
          const l2 = loadFiredLedger(vaultPath)
          for (const [k, v] of baselineUpdates) l2[k] = v
          saveFiredLedger(vaultPath, l2)
        } else {
          // tasks.dueSoon — nur HEUTE fällige Aufgaben.
          finalRun = await runItems(wf, taskItems, 'event-task', 'Keine heute fälligen Aufgaben.')
        }
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
    let all: Workflow[] = []
    try {
      const file = await window.electronAPI.workflowLoad(vaultPath)
      all = file?.workflows ?? []
    } catch { return }
    // Multi-Workflow: ALLE aktivierten Workflows mit Zeitplan-Trigger prüfen
    // (jeder hat seinen eigenen lastFired-Key state[wf.id]).
    const scheduled = all.filter(w => w.enabled && w.nodes.some(n => n.actionId === 'schedule.timer'))
    if (!scheduled.length) return

    const parseSchedule = (wf: Workflow): WorkflowSchedule => {
      const cfg = (wf.nodes.find(n => n.actionId === 'schedule.timer')!.config) as
        { frequency?: string; time?: string; weekday?: unknown; dayOfMonth?: unknown }
      return {
        frequency: (cfg.frequency === 'weekly' || cfg.frequency === 'monthly') ? cfg.frequency : 'daily',
        time: typeof cfg.time === 'string' ? cfg.time : undefined,
        weekday: cfg.weekday != null && cfg.weekday !== '' ? Number(cfg.weekday) : undefined,
        dayOfMonth: cfg.dayOfMonth != null && cfg.dayOfMonth !== '' ? Number(cfg.dayOfMonth) : undefined
      }
    }

    const now = new Date()
    const stateRaw = (() => { try { return JSON.parse(localStorage.getItem(scheduleStateKey(vaultPath)) || '{}') } catch { return {} } })()
    const state = stateRaw as Record<string, string>
    const due = scheduled.filter(wf => isScheduleDue(parseSchedule(wf), state[wf.id], now))
    if (!due.length) return

    const ollama = useUIStore.getState().ollama
    const features = useVaultSettingsStore.getState().features as unknown as Record<string, boolean>
    const models = { selected: ollama.selectedModel, overrides: (ollama.moduleModelOverrides || {}) as Record<string, string> }
    const projectsFolderRel = useUIStore.getState().projectsRootFolder || undefined

    triggerBatchRunning = true
    set({ running: true })
    try {
      for (const wf of due) {
        const schedule = parseSchedule(wf)
        // lastFired VOR dem Lauf festschreiben → at-most-once pro Periode. Ein fehlgeschlagener
        // Lauf wird NICHT alle 60s erneut versucht (sondern erst in der nächsten Periode).
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
        }
      }
    } finally {
      triggerBatchRunning = false
      set({ running: false })
    }
  }
  }
})
