// Workflow Canvas — Typen für Ports und Action-Definitionen.
//
// Verbindlicher Architektur-Stand: docs/workflow-canvas-plan.md
// → "Beschlossener Stand (2026-05-24, nach Stress-Test)".
//
// Die Registry (registry.ts) ist REINE Metadaten und liegt in `shared`, damit
// Renderer (Palette/Validierung) UND Main (Runner) dieselbe Quelle lesen.
// Die run()-Implementierungen leben NICHT hier, sondern in
// main/workflows/actions — getrennt nach Prozess (Decision #2).

// Die plugin-zugewandten Workflow-DTOs leben jetzt im Plugin-Vertrag
// (@mindgraph/plugin-api) — ein Plugin steuert `manifest.workflowActions` bei. Re-Export
// hält bestehende `shared/workflow/types`-Importe im Kern unverändert. Der Workflow-MODELL-
// Kern (Graph/Run/Runner) bleibt App-intern (model.ts).
export type {
  WorkflowModuleId,
  WorkflowPortKind,
  WorkflowPortDefinition,
  WorkflowPrivacyMetadata,
  WorkflowConfigFieldType,
  WorkflowConfigField,
  WorkflowActionDefinition,
} from '@mindgraph/plugin-api'

import type { WorkflowModuleId } from '@mindgraph/plugin-api'

/**
 * Welche VaultFeatures-Toggle ein Workflow-Modul gated. null = Kern-Modul
 * (immer verfügbar). Wird für Paletten-Filter + Runner-Modul-Check genutzt.
 */
// Nur KERN-Module. Plugin-Module (antares/edoobox …) bringen ihren Gate über
// `WorkflowActionDefinition.featureGate` mit — der Kern hält keinen statischen Eintrag für sie
// (Deletion-Test). Auflösung über `workflowModuleGate()` in registry.ts (Kern-Map → Plugin-Gate → null).
export const MODULE_FEATURE_GATE: Partial<Record<WorkflowModuleId, string | null>> = {
  email: 'email',
  // Kern-Module (immer verfügbar):
  project: null,
  ollama: null,
  notes: null,
  human: null,
  calendar: null,
  tasks: null,
  schedule: null
}
