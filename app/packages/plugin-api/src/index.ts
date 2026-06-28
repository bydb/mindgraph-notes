// @mindgraph/plugin-api — die stabile öffentliche Grenze zwischen MindGraph und seinen Plugins.
//
// Haupt-Entry: NUR Typen + schmale, dependency-arme Laufzeit-Helfer (definePluginMain).
// Bewusst Ajv-frei — die Validatoren liegen auf dem Subpath `@mindgraph/plugin-api/validation`,
// damit der normale Plugin-Import (nur Typen) kein Ajv mitzieht.
// Siehe docs/plugin-api-package-plan.md (A0 · Schritt 1) und docs/plugin-system-plan.md.

export { API_VERSION } from './version'

export type { CompatModuleId } from './compat'

export type {
  WorkflowModuleId,
  WorkflowPortKind,
  WorkflowPortDefinition,
  WorkflowPrivacyMetadata,
  WorkflowConfigFieldType,
  WorkflowConfigField,
  WorkflowActionDefinition,
  WorkflowRunTrigger,
  WorkflowSeedItem,
} from './workflow'

// (Weitere Vertrags-Typen — Manifest, Host, Entry, Trigger-Provider — wandern im
//  Folge-Commit dieses Schritts hierher.)
