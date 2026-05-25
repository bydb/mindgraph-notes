// Workflow Canvas — Typen für Ports und Action-Definitionen.
//
// Verbindlicher Architektur-Stand: docs/workflow-canvas-plan.md
// → "Beschlossener Stand (2026-05-24, nach Stress-Test)".
//
// Die Registry (registry.ts) ist REINE Metadaten und liegt in `shared`, damit
// Renderer (Palette/Validierung) UND Main (Runner) dieselbe Quelle lesen.
// Die run()-Implementierungen leben NICHT hier, sondern in
// main/workflows/actions — getrennt nach Prozess (Decision #2).

import type { ModuleId as CompatModuleId } from '../modelCompatibility'

/**
 * Quell-Modul einer Action. Bestimmt Paletten-Gruppierung und (via
 * MODULE_FEATURE_GATE) ob das Modul im Vault aktiv sein muss.
 */
export type WorkflowModuleId =
  | 'email'
  | 'project'
  | 'ollama'
  | 'notes'
  | 'human'
  | 'calendar'
  | 'edoobox'
  | 'antares'

/**
 * Typisierte Port-Arten. Verbindungen sind nur über die strikte Allowlist in
 * validation.ts erlaubt — KEINE impliziten Adapter (Decision #8).
 */
export type WorkflowPortKind =
  | 'email'
  | 'email_analysis'
  | 'text'
  | 'project'
  | 'project_context'
  | 'task'
  | 'calendar_event'
  | 'note'
  | 'draft_reply'
  | 'booking'
  | 'course'
  | 'participant'
  | 'media_item'
  | 'availability'
  | 'human_approval'
  | 'json'

export interface WorkflowPortDefinition {
  id: string
  label: string
  kind: WorkflowPortKind
  /** Eingang muss verbunden sein, damit der Node laufen kann. */
  required?: boolean
  /** Port darf mehrere Verbindungen tragen (z.B. mehrere text-Quellen). */
  multiple?: boolean
}

/** Datenschutz-Metadaten pro Action (für Badges + Cloud-Markierung). */
export interface WorkflowPrivacyMetadata {
  /** Verarbeitet personenbezogene Daten (Mail-Inhalte, Teilnehmer …). */
  containsPersonalData?: boolean
  /** Läuft ausschließlich lokal (z.B. Ollama localhost) — bevorzugt. */
  localOnly?: boolean
  /** Schreibt auf die Platte. */
  writesToDisk?: boolean
  /** Spricht externe APIs an (edoobox, Antares, SMTP …). */
  sendsExternalRequest?: boolean
  /** Braucht hinterlegte Credentials. */
  requiresCredential?: boolean
}

export type WorkflowConfigFieldType =
  | 'text'
  | 'textarea'
  | 'model'
  | 'select'
  | 'number'
  | 'boolean'

export interface WorkflowConfigField {
  key: string
  label: string
  type: WorkflowConfigFieldType
  options?: { value: string; label: string }[]
  placeholder?: string
  default?: unknown
}

/**
 * Statische Beschreibung einer ausführbaren Aktion. Metadaten-only:
 * die Implementierung wird in main über actionId aufgelöst.
 */
export interface WorkflowActionDefinition {
  /** z.B. "email.analyze" — global eindeutig, dispatch-Key im Runner. */
  id: string
  moduleId: WorkflowModuleId
  label: string
  description?: string
  inputs: WorkflowPortDefinition[]
  outputs: WorkflowPortDefinition[]
  /** Kann einen Workflow starten (keine Pflicht-Eingänge; manuell/Event geseedet). */
  isTrigger?: boolean
  /** Schreibende/sendende Aktion → läuft nur über Hand-off / Freigabe (Decision #6). */
  isWrite?: boolean
  /** Terminal-Node: Workflow endet hier mit einem Hand-off-Artefakt (Decision #6). */
  isTerminal?: boolean
  /**
   * Wendet ein LLM auf untrusted Input an. Nennt das Compat-Modul, gegen das
   * der Runner isHardLocked() prüft (Decision #11). undefined = kein LLM-Risiko.
   */
  hardLockModule?: CompatModuleId
  privacy?: WorkflowPrivacyMetadata
  config?: WorkflowConfigField[]
}

/**
 * Welche VaultFeatures-Toggle ein Workflow-Modul gated. null = Kern-Modul
 * (immer verfügbar). Wird für Paletten-Filter + Runner-Modul-Check genutzt.
 */
export const MODULE_FEATURE_GATE: Record<WorkflowModuleId, string | null> = {
  email: 'email',
  edoobox: 'edoobox',
  // Kern-Module (immer verfügbar):
  project: null,
  ollama: null,
  notes: null,
  human: null,
  calendar: null,
  antares: null
}
