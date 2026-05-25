// Workflow Canvas — gebündelte Beispiel-/Template-Workflows.
import type { Workflow } from './model'

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Pitch-Flaggschiff: Neue relevante E-Mail → Projekt erkennen →
 * Projektkontext → Ollama Antwort entwerfen → Mensch prüft.
 */
export function buildExampleReplyWorkflow(): Workflow {
  const ts = nowIso()
  return {
    id: 'example-email-reply',
    name: 'E-Mail beantworten',
    description: 'Erkennt das Projekt einer Mail, lädt Kontext und entwirft mit Ollama eine Antwort zur Prüfung.',
    version: 1,
    enabled: false,
    createdAt: ts,
    updatedAt: ts,
    nodes: [
      { id: 'n_email', actionId: 'email.selectedEmail', position: { x: 40, y: 220 }, config: {} },
      { id: 'n_match', actionId: 'project.match', position: { x: 340, y: 120 }, config: {} },
      { id: 'n_ctx', actionId: 'project.context', position: { x: 640, y: 120 }, config: {} },
      { id: 'n_reply', actionId: 'ollama.generateReply', position: { x: 940, y: 220 }, config: { model: '' } },
      { id: 'n_review', actionId: 'human.reviewDraftReply', position: { x: 1240, y: 220 }, config: {} }
    ],
    edges: [
      { id: 'e1', fromNodeId: 'n_email', fromPortId: 'email', toNodeId: 'n_match', toPortId: 'email' },
      { id: 'e2', fromNodeId: 'n_match', fromPortId: 'project', toNodeId: 'n_ctx', toPortId: 'project' },
      { id: 'e3', fromNodeId: 'n_ctx', fromPortId: 'context', toNodeId: 'n_reply', toPortId: 'context' },
      { id: 'e4', fromNodeId: 'n_email', fromPortId: 'email', toNodeId: 'n_reply', toPortId: 'email' },
      { id: 'e5', fromNodeId: 'n_reply', fromPortId: 'draft', toNodeId: 'n_review', toPortId: 'draft' }
    ]
  }
}

/** Leerer Workflow als Startpunkt. */
export function buildEmptyWorkflow(name = 'Neuer Workflow'): Workflow {
  const ts = nowIso()
  return {
    id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    version: 1,
    enabled: false,
    createdAt: ts,
    updatedAt: ts,
    nodes: [],
    edges: []
  }
}
