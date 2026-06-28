// Workflow-Trigger-Provider — die Renderer-Seam, über die ein Plugin seine
// Trigger-Quelle (Antares-Mahnung, edoobox-Anmeldung, …) in den Workflow-Canvas
// einklinkt, OHNE dass der Kern (`workflowStore`) die Quelle namentlich kennt.
//
// Der Kern besitzt nur noch die generische Mechanik: Exactly-once-Ledger,
// Batch-Cap, Run-Dispatch. Was ein Trigger-Kandidat IST (Datenform, Baseline-/
// Reset-Semantik), lebt im Provider in der jeweiligen Plugin-Vertikale. Registriert
// wird ein Provider über den Renderer-Slot `workflow.trigger` (siehe Plugin-
// `renderer/index.tsx`), gelesen via `getWorkflowTriggerProviders()` in slots.tsx.
//
// Siehe docs/plugin-store-plan.md (Phase A-pre, Schritt 4) und
// docs/plugin-system-plan.md #12 (Slot-Mechanik).

import type { WorkflowRunTrigger, WorkflowSeedItem } from './workflow'

/** Slot-Id, unter dem Trigger-Provider registriert werden (analog zu `dashboard.widget.*`). */
export const WORKFLOW_TRIGGER_SLOT = 'workflow.trigger'

/** Slot-Id, unter dem ein Plugin einen Beispiel-Workflow (als Builder `() => Workflow`) beisteuert. */
export const WORKFLOW_EXAMPLE_SLOT = 'workflow.example'

/**
 * Auf EINEN Workflow eingeschränkte Sicht auf das (geräte-lokale) Exactly-once-Ledger.
 * Schlüssel sind bereits pro Workflow genamespaced — der Provider sieht nur seine eigenen
 * Marker und braucht die Workflow-Id nicht. Werte sind frei: ein ISO-Timestamp markiert
 * „einmal gefeuert"; ein beliebiger Nicht-Timestamp (z.B. ein Zählerstand) ist eine
 * Baseline, die der Kern beim Aufräumen NICHT altern lässt.
 */
export interface WorkflowTriggerLedger {
  get(itemKey: string): string | undefined
  set(itemKey: string, value: string): void
  delete(itemKey: string): void
  /** Alle (pro Workflow genamespaceten) Schlüssel — für Reset-Logik wie „nicht mehr fällige Einträge entfernen". */
  keys(): string[]
}

/** Ergebnis eines Event-Polls eines Providers. */
export interface WorkflowEventResult {
  /** Frische Kandidaten; der Kern filtert bereits gefeuerte (per itemKey) heraus und deckelt die Batch-Größe. */
  items: WorkflowSeedItem[]
  /** Anzeige-Trigger des resultierenden Laufs (Default 'event-external'). */
  trigger?: WorkflowRunTrigger
  /** Meldung für einen „skipped"-Lauf, wenn nichts Frisches anliegt. */
  emptyMessage?: string
  /** Nach erfolgreichem Lauf-Batch ausgeführt (z.B. Baseline vorrücken). Bekommt dieselbe Ledger-Sicht. */
  afterRun?: (ledger: WorkflowTriggerLedger) => void
}

/**
 * Ein Plugin-Beitrag, der genau einen Trigger-Baustein (`triggerActionId`, z.B.
 * 'antares.mahnung') mit Leben füllt. Der Kern dispatcht generisch über die
 * registrierten Provider — er enthält keine Plugin-Namen mehr.
 */
export interface WorkflowTriggerProvider {
  /** Action-Id des Trigger-Bausteins, den dieser Provider bedient. */
  triggerActionId: string
  /** Optional: einmal pro Poll-Batch VOR den Workflow-Iterationen — externe Quelle EINMAL laden
   *  (mehrere Workflows derselben Quelle teilen sich den Scrape). Fehler dürfen geschluckt werden. */
  prepareEvent?(): Promise<void>
  /** Manueller ▶-Lauf: ein repräsentativer Seed (oder null → `manualEmptyMessage`). */
  collectManual(): Promise<WorkflowSeedItem | null>
  /** Meldung für den „skipped"-Lauf, wenn `collectManual` null liefert. */
  manualEmptyMessage?: string
  /** Event-Poll: Kandidaten erzeugen; darf das (genamespacete) Ledger lesen/aufräumen. */
  collectEvent(ledger: WorkflowTriggerLedger): Promise<WorkflowEventResult>
}
