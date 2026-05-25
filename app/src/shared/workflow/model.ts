// Workflow Canvas — Datenmodell (gezeichneter Graph + Lauf-Protokoll).
//
// Persistenz: {vault}/.mindgraph/workflows.json (Decision #9, geräte-lokal).
// Siehe docs/workflow-canvas-plan.md "Beschlossener Stand".

export interface WorkflowNode {
  id: string
  /** Referenz auf WorkflowActionDefinition.id in der Registry. */
  actionId: string
  position: { x: number; y: number }
  /** Node-spezifische Konfiguration (z.B. ollama-Modell, Freitext-Prompt). */
  config: Record<string, unknown>
}

export interface WorkflowEdge {
  id: string
  fromNodeId: string
  fromPortId: string
  toNodeId: string
  toPortId: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  version: number
  /** Aktiv für Event-Trigger (Phase 2). Manueller Lauf ignoriert das. */
  enabled?: boolean
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: string
  updatedAt: string
}

export type WorkflowRunMode = 'simulate' | 'execute'
export type WorkflowRunTrigger = 'manual' | 'event-email'
export type WorkflowRunStatus = 'running' | 'success' | 'failed' | 'cancelled'
export type WorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'

export interface WorkflowRunStep {
  nodeId: string
  actionId: string
  label: string
  status: WorkflowStepStatus
  startedAt?: string
  finishedAt?: string
  /** Menschenlesbare Zeilen fürs Run-Log / die Pitch-Leinwand. */
  log: string[]
  /** portId → Wert (im simulate-Modus: Beispielwert). */
  outputs?: Record<string, unknown>
  error?: string
}

/** Artefakt eines terminalen Human-Review-Nodes (Decision #6, Hand-off). */
export interface WorkflowHandoff {
  /** compose = Entwurf ins ComposeView; task/note = im Vault angelegt. */
  kind: 'compose' | 'task' | 'note'
  payload: Record<string, unknown>
}

export interface WorkflowRun {
  id: string
  workflowId: string
  mode: WorkflowRunMode
  trigger: WorkflowRunTrigger
  status: WorkflowRunStatus
  startedAt: string
  finishedAt?: string
  steps: WorkflowRunStep[]
  handoff?: WorkflowHandoff
  error?: string
}

/** Ergebnis von validateWorkflow (validation.ts). */
export interface WorkflowValidationIssue {
  level: 'error' | 'warning'
  nodeId?: string
  edgeId?: string
  message: string
}

export interface WorkflowValidationResult {
  ok: boolean
  issues: WorkflowValidationIssue[]
}

/** Container für die persistierte workflows.json. */
export interface WorkflowFile {
  schemaVersion: number
  workflows: Workflow[]
}

/** IPC-Payload für einen echten Lauf (workflow-run). */
export interface WorkflowRunPayload {
  workflow: Workflow
  vaultPath: string
  trigger?: WorkflowRunTrigger
  seedEmail?: { id?: string; subject?: string; bodyText?: string; from?: string } | null
  models?: { selected: string; overrides: Record<string, string> }
  features?: Record<string, boolean>
  projectsFolderRel?: string
}
