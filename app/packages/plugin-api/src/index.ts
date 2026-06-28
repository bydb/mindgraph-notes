// @mindgraph/plugin-api — die stabile öffentliche Grenze zwischen MindGraph und seinen Plugins.
//
// Haupt-Entry: NUR Typen + schmale, dependency-arme Laufzeit-Helfer (definePluginMain).
// Bewusst Ajv-frei — die Validatoren liegen auf dem Subpath `@mindgraph/plugin-api/validation`,
// damit der normale Plugin-Import (nur Typen) kein Ajv mitzieht.
// Siehe docs/plugin-api-package-plan.md (A0 · Schritt 1) und docs/plugin-system-plan.md.

export { API_VERSION } from './version'

// (Vertrags-Typen — Manifest, Host, Entry, Workflow-Beiträge — wandern in den
//  Folge-Commits dieses Schritts hierher.)
