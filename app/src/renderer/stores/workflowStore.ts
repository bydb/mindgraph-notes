import { create } from 'zustand'
import type { WorkflowPortKind } from '../../shared/workflow/types'
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowRun,
  WorkflowValidationResult
} from '../../shared/workflow/model'
import { getActionById, getPortDef } from '../../shared/workflow/registry'
import { canConnectPorts, validateWorkflow } from '../../shared/workflow/validation'
import { simulateWorkflow } from '../../shared/workflow/simulation'
import { buildExampleReplyWorkflow, buildEmptyWorkflow } from '../../shared/workflow/examples'
import { useUIStore } from './uiStore'
import { useVaultSettingsStore } from './vaultSettingsStore'
import { useEmailStore } from './emailStore'

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

  // Event-Pfad: feuert den Workflow für relevante, noch nicht getriggerte Mails.
  // Seriell (concurrency 1), exactly-once via emails.json-Marker (Decisions #5/#10).
  runForNewEmails: async (vaultPath) => {
    if (triggerBatchRunning) return
    const wf = get().workflow
    const ollama = useUIStore.getState().ollama
    const features = useVaultSettingsStore.getState().features
    // Eng filtern (nur Mails, die wirklich eine Antwort brauchen und noch offen sind)
    // und hart deckeln — sonst feuert ein Klick gegen den ganzen Backlog.
    const candidates = useEmailStore.getState().emails
      .filter(e =>
        e.analysis?.relevant &&
        e.analysis?.needsReply &&
        !e.analysis?.replyHandled &&
        !e.analysis?.workflowRuns?.[wf.id]
      )
      .slice(0, MAX_TRIGGER_BATCH)

    if (candidates.length === 0) {
      set({
        run: {
          id: genId('run'), workflowId: wf.id, mode: 'execute', trigger: 'event-email',
          status: 'success', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
          steps: [{ nodeId: '-', actionId: '-', label: 'Trigger', status: 'skipped', log: ['Keine neuen relevanten Mails.'] }]
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
          trigger: 'event-email',
          seedEmail: { id: email.id, subject: email.subject, bodyText: email.bodyText, from: email.from?.address },
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
  }
}))
