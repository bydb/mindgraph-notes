// Plugin-zugewandte Workflow-Canvas-Beiträge — die transitive Hülle, die ein Plugin
// braucht, um Workflow-Bausteine (`manifest.workflowActions`) und Trigger-Provider
// beizusteuern. Der übrige Workflow-Modell-Kern (Graph, Edges, Run/Runner-Interna)
// bleibt App-intern in `app/src/shared/workflow/*` und re-exportiert diese Typen.
//
// Verbindlicher Architektur-Stand des Workflow-Canvas: docs/workflow-canvas-plan.md.

import type { CompatModuleId } from './compat'

/**
 * Quell-Modul einer Action. Bestimmt Paletten-Gruppierung und (via MODULE_FEATURE_GATE
 * im Kern) ob das Modul im Vault aktiv sein muss.
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
  | 'tasks'
  | 'schedule'

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
  /** Anzeigename des Moduls für die Palette. Plugin-beigesteuerte Actions bringen ihn selbst
   *  mit (der Kern hält keine Label-Tabelle für Plugin-Module). Kern-Module nutzen WORKFLOW_MODULE_LABELS. */
  moduleLabel?: string
  /** VaultFeatures-Toggle, das dieses Action-Modul gated. null = immer verfügbar. Plugin-Actions
   *  deklarieren ihn hier statt im Kern-MODULE_FEATURE_GATE (Deletion-Test: Ordner weg ⇒ Gate weg). */
  featureGate?: string | null
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
  /** Sprechende Log-Zeile für den Simulations-Trockenlauf (Pitch-Leinwand). Plugin-Actions
   *  bringen sie selbst mit; der Kern hält keine Tabelle dafür. Fallback: Label-basiert. */
  simLine?: string
}

/** 'manual' = ▶ Ausführen; alles andere = Event-Lauf (Hand-off → Aufgabe statt Compose).
 *  Provenienz pro Event-Quelle; die Unterscheidung manuell/Event macht isEventTrigger(). */
export type WorkflowRunTrigger =
  | 'manual'
  | 'event-email'
  | 'event-reply'
  | 'event-ics'
  | 'event-task'
  | 'event-external'
  | 'event-scheduled'

/** Seed-Kandidat eines Triggers (Mail-Signal, Aufgabe, Plugin-Quelle). `itemKey` ist
 *  stabil pro Kandidat und dient dem Exactly-once-Ledger; `email` füttert den optionalen
 *  Kontakt-/Reply-Pfad. Plugin-Trigger-Provider erzeugen diese Struktur in ihrer Vertikale. */
export interface WorkflowSeedItem {
  itemKey: string
  text: string
  meta?: Record<string, unknown>
  email?: { id?: string; subject?: string; bodyText?: string; from?: string; name?: string }
}
