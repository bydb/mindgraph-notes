// Spielt die plugin-beigesteuerten Workflow-Canvas-Bausteine (Manifest-Feld `workflowActions`)
// in die gemeinsame Workflow-Registry ein — Renderer-Seite (Palette + Validierung).
//
// Buildzeit-Katalog (catalog.ts) → registerWorkflowActions(). Fällt eine Plugin-Vertikale weg,
// fehlt ihr Manifest im Glob → ihre Workflow-Action wird nie registriert → kein Palette-Block.
// Main spielt dieselben Actions unabhängig über seine Plugin-Registry ein (workflowActions.ts dort).

import { registerWorkflowActions } from '../../shared/workflow/registry'
import { pluginManifests } from './catalog'

let done = false

/** Idempotent: registriert alle Manifest-Workflow-Actions. Beim App-Start (main.tsx) aufrufen. */
export function ensurePluginWorkflowActions(): void {
  if (done) return
  done = true
  for (const manifest of pluginManifests) {
    if (manifest.workflowActions?.length) registerWorkflowActions(manifest.workflowActions)
  }
}
