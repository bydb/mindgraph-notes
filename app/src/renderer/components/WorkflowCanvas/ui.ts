// Workflow Canvas — UI-Metadaten (Farben/Icons). Bewusst getrennt von der
// reinen shared-Registry. Farben nach Plan-Abschnitt „UX-Details / Port-Farben".
import type { WorkflowPortKind } from '../../../shared/workflow/types'

export const PORT_COLORS: Record<WorkflowPortKind, string> = {
  email: '#3b82f6',           // Blau
  email_analysis: '#6366f1',  // Indigo
  text: '#9ca3af',            // Grau
  project: '#22c55e',         // Grün
  project_context: '#16a34a', // Grün (dunkler)
  task: '#f97316',            // Orange
  calendar_event: '#06b6d4',  // Cyan
  note: '#64748b',            // Slate
  draft_reply: '#a855f7',     // Violett
  booking: '#eab308',         // Gelb (externe Daten)
  course: '#eab308',
  participant: '#eab308',
  media_item: '#eab308',
  availability: '#14b8a6',    // Teal
  human_approval: '#ec4899',  // Pink/Rot
  json: '#9ca3af'
}

export function portColor(kind: WorkflowPortKind): string {
  return PORT_COLORS[kind] || '#9ca3af'
}
