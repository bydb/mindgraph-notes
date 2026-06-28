// Workflow Canvas — Datenmodell (gezeichneter Graph + Lauf-Protokoll).
//
// Persistenz: {vault}/.mindgraph/workflows.json (Decision #9, geräte-lokal).
// Siehe docs/workflow-canvas-plan.md "Beschlossener Stand".

// Plugin-zugewandte Trigger-Typen leben im Plugin-Vertrag (@mindgraph/plugin-api), damit
// Trigger-Provider in den Vertikalen sie ohne Kern-Import nutzen. Import + Re-Export halten
// die lokalen Verwendungen (WorkflowRun, WorkflowRunPayload) und Kern-Importe unverändert.
import type { WorkflowRunTrigger, WorkflowSeedItem } from '@mindgraph/plugin-api'
export type { WorkflowRunTrigger, WorkflowSeedItem }

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

/** Geparste Zeitplan-Konfiguration des `schedule.timer`-Trigger-Bausteins (Layer F).
 *  Quelle ist die Node-Config (vom Inspector editiert); lastFiredAt liegt geräte-lokal
 *  im localStorage (wie das C/D/E-Ledger) — kein Vault-JSON, keine Sync-Konflikte. */
export interface WorkflowSchedule {
  frequency: 'daily' | 'weekly' | 'monthly'
  /** HH:MM (24h, lokale Zeit). Default '09:00'. */
  time?: string
  /** 0=So … 6=Sa, nur bei frequency='weekly'. */
  weekday?: number
  /** 1–31, nur bei frequency='monthly'. */
  dayOfMonth?: number
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
  /** ID des zuletzt aktiven Workflows (Multi-Workflow-Auswahl). Optional für
   *  Back-Compat: fehlt das Feld, gilt workflows[0] als aktiv. */
  activeId?: string
}

/** Generischer Seed eines Laufs. Email-Trigger (A/B) füllen `email`,
 *  Text-Trigger (C/D/E/F) füllen `text` (+ `meta` für Exactly-once/Labeling). */
export interface WorkflowSeed {
  email?: { id?: string; subject?: string; bodyText?: string; from?: string; name?: string }
  text?: string
  meta?: Record<string, unknown>
}

/** IPC-Payload für einen echten Lauf (workflow-run). */
export interface WorkflowRunPayload {
  workflow: Workflow
  vaultPath: string
  trigger?: WorkflowRunTrigger
  /** Generischer Seed (bevorzugt). */
  seed?: WorkflowSeed | null
  /** @deprecated Back-Compat-Alias für seed.email — wird in seed gemappt. */
  seedEmail?: { id?: string; subject?: string; bodyText?: string; from?: string } | null
  models?: { selected: string; overrides: Record<string, string> }
  features?: Record<string, boolean>
  projectsFolderRel?: string
}
