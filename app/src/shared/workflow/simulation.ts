// Workflow Canvas — Trockenlauf (Simulation).
//
// Reiner, deterministischer Durchlauf ohne echte Aktionen, ohne Schreibzugriff
// (Decision: „Simulieren" zeigt Schrittfolge + Beispielausgaben). Läuft im
// Renderer — der echte Lauf (execute) geht über den Main-Runner.

import type { WorkflowPortKind } from './types'
import type { Workflow, WorkflowRun, WorkflowRunStep } from './model'
import { getActionById } from './registry'
import { topoSort } from './validation'

/** Beispielwerte pro Port-Art für die Trocken-Anzeige. */
const EXAMPLE_OUTPUT: Record<WorkflowPortKind, unknown> = {
  email: { subject: 'Re: Roll-Up Marslandschaft', from: 'kita-mars@example.de' },
  email_analysis: { relevance: 82, summary: 'Anfrage zu Roll-Up „Marslandschaft"', tasks: ['Angebot prüfen'] },
  text: 'Beispieltext …',
  project: { folderName: '160 - Mars Abenteuer' },
  project_context: '_STATUS.md + letzte Projektmails',
  task: '- [ ] Entwurf prüfen',
  calendar_event: { title: 'Workshop Marslandschaft', date: '2026-06-02' },
  note: '160 - Mars Abenteuer/Notiz.md',
  draft_reply: 'Sehr geehrte Damen und Herren, gerne sende ich Ihnen …',
  booking: { id: 'B-123', course: 'Marslandschaft' },
  course: { id: 'K-42', title: 'Marslandschaft gestalten' },
  participant: { name: 'Beispiel-Teilnehmer' },
  media_item: { title: 'Beamer', available: true },
  availability: { available: true, count: 2 },
  human_approval: 'wartet auf menschliche Freigabe',
  json: { category: 'Anfrage' }
}

/** Pro-Action eine sprechende Log-Zeile für die Pitch-Leinwand. */
const SIM_LINE: Record<string, string> = {
  'email.selectedEmail': 'Eingabe: Re: Roll-Up Marslandschaft',
  'email.replyReceived': 'Auslöser: Antwort auf gesendete Mail eingegangen',
  'email.icsReceived': 'Auslöser: Mail mit Kalender-Einladung (.ics)',
  // antares.mahnung / edoobox.newBooking liefern ihre Sim-Zeile über action.simLine (Manifest).
  'tasks.dueSoon': 'Auslöser: Aufgabe „Entwurf prüfen" wird heute fällig',
  'schedule.timer': 'Auslöser: Zeitplan (täglich 09:00)',
  'email.analyze': 'Analyse: Relevanz 82, 1 Aufgabe erkannt',
  'email.composeDraft': 'E-Mail-Entwurf aus Kontakt und Text vorbereitet',
  'project.match': 'Projekt erkannt: 160 - Mars Abenteuer',
  'project.context': 'Kontext geladen: _STATUS.md + letzte Projektmails',
  'project.rag': 'Projekt-RAG: 6 relevante Auszüge aus dem Projektordner',
  'ollama.generateReply': 'Ollama-Schritt: Antwortentwurf würde erzeugt',
  'ollama.summarize': 'Ollama-Schritt: Zusammenfassung würde erzeugt',
  'ollama.extractTasks': 'Ollama-Schritt: Aufgaben würden extrahiert',
  'ollama.classify': 'Ollama-Schritt: Klassifikation würde erzeugt',
  'ollama.transformText': 'Ollama-Schritt: Text würde transformiert',
  'notes.create': 'Notiz würde angelegt (kein Schreibzugriff in Simulation)',
  'notes.append': 'Text würde an Notiz angehängt (Simulation)',
  'notes.search': 'Notizsuche: Beispieltreffer',
  'human.reviewText': 'Wartet auf menschliche Freigabe',
  'human.reviewDraftReply': 'Wartet auf menschliche Freigabe (Entwurf prüfen)'
}

function nowIso(): string {
  return new Date().toISOString()
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Trockenlauf eines Workflows. Liefert einen WorkflowRun mit Beispielausgaben. */
export function simulateWorkflow(workflow: Workflow): WorkflowRun {
  const order = topoSort(workflow)
  const startedAt = nowIso()
  const steps: WorkflowRunStep[] = []

  if (order === null) {
    return {
      id: genId('run'),
      workflowId: workflow.id,
      mode: 'simulate',
      trigger: 'manual',
      status: 'failed',
      startedAt,
      finishedAt: nowIso(),
      steps: [],
      error: 'Zyklus — keine ausführbare Reihenfolge.'
    }
  }

  const nodeById = new Map(workflow.nodes.map(n => [n.id, n]))
  let handoff: WorkflowRun['handoff']

  for (const nodeId of order) {
    const node = nodeById.get(nodeId)
    if (!node) continue
    const action = getActionById(node.actionId)
    if (!action) {
      steps.push({
        nodeId, actionId: node.actionId, label: node.actionId,
        status: 'failed', log: [`Unbekannte Action: ${node.actionId}`],
        startedAt: nowIso(), finishedAt: nowIso(),
        error: 'Unbekannte Action'
      })
      continue
    }

    const outputs: Record<string, unknown> = {}
    for (const port of action.outputs) outputs[port.id] = EXAMPLE_OUTPUT[port.kind]

    const line = action.simLine || SIM_LINE[action.id] || `${action.label}: Beispielausgabe`
    steps.push({
      nodeId,
      actionId: action.id,
      label: action.label,
      status: 'success',
      startedAt: nowIso(),
      finishedAt: nowIso(),
      log: [line],
      outputs
    })

    if (action.isTerminal) {
      handoff = {
        kind: action.id === 'human.reviewDraftReply' ? 'compose' : 'task',
        payload: { simulated: true, from: action.id }
      }
    }
  }

  return {
    id: genId('run'),
    workflowId: workflow.id,
    mode: 'simulate',
    trigger: 'manual',
    status: 'success',
    startedAt,
    finishedAt: nowIso(),
    steps,
    handoff
  }
}
