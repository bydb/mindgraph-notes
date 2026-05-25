// Workflow Canvas — statische Action-Registry (Metadaten, Single Source).
//
// Reine Daten, keine Implementierung. Renderer liest sie für Palette +
// Validierung, Main-Runner für Dispatch + Modul-/Hard-Lock-Checks.
// Implementierungen: main/workflows/actions (über actionId aufgelöst).
//
// MVP-Module (Decision: pitch-kritischer Pfad): email, project, ollama, notes, human.
// Spätere Module (edoobox, antares, calendar) folgen additiv.

import type {
  WorkflowActionDefinition,
  WorkflowModuleId,
  WorkflowPortDefinition
} from './types'

const out = (
  id: string,
  label: string,
  kind: WorkflowPortDefinition['kind'],
  extra: Partial<WorkflowPortDefinition> = {}
): WorkflowPortDefinition => ({ id, label, kind, ...extra })

const inp = (
  id: string,
  label: string,
  kind: WorkflowPortDefinition['kind'],
  extra: Partial<WorkflowPortDefinition> = {}
): WorkflowPortDefinition => ({ id, label, kind, ...extra })

/** Anzeigenamen der Module für die Palette. */
export const WORKFLOW_MODULE_LABELS: Record<WorkflowModuleId, string> = {
  email: 'E-Mail',
  project: 'Projekt',
  ollama: 'Ollama',
  notes: 'Notiz',
  human: 'Menschliche Prüfung',
  calendar: 'Kalender',
  edoobox: 'edoobox',
  antares: 'Antares'
}

export const WORKFLOW_ACTIONS: WorkflowActionDefinition[] = [
  // ---------------- EMAIL ----------------
  {
    id: 'email.selectedEmail',
    moduleId: 'email',
    label: 'E-Mail (Auslöser)',
    description:
      'Startpunkt: die ausgewählte Mail (manuell) bzw. eine neue relevante Mail (Event-Trigger).',
    isTrigger: true,
    inputs: [],
    outputs: [out('email', 'Mail', 'email')],
    privacy: { containsPersonalData: true }
  },
  {
    id: 'email.analyze',
    moduleId: 'email',
    label: 'E-Mail analysieren',
    description:
      'Ollama-Analyse: Relevanz, Zusammenfassung, Aufgaben. Liefert die Analyse und den Klartext der Mail.',
    inputs: [inp('email', 'Mail', 'email', { required: true })],
    outputs: [
      out('analysis', 'Analyse', 'email_analysis'),
      out('text', 'Mailtext', 'text')
    ],
    // Untrusted Mail-Inhalt durch ein LLM → Hard-Lock wie in emailStore.
    hardLockModule: 'task-extraction',
    privacy: { containsPersonalData: true, localOnly: true }
  },

  // ---------------- PROJECT ----------------
  {
    id: 'project.match',
    moduleId: 'project',
    label: 'Projekt erkennen',
    description:
      'Findet das passende Projekt zur Mail (Keyword-/Synonym-Match, deterministisch).',
    inputs: [inp('email', 'Mail', 'email', { required: true })],
    outputs: [out('project', 'Projekt', 'project')]
  },
  {
    id: 'project.context',
    moduleId: 'project',
    label: 'Projektkontext laden',
    description: 'Lädt Status + relevante Quellen des Projekts.',
    inputs: [inp('project', 'Projekt', 'project', { required: true })],
    outputs: [
      out('context', 'Projektkontext', 'project_context'),
      out('summary', 'Status-Zusammenfassung', 'text')
    ]
  },

  // ---------------- OLLAMA ----------------
  {
    id: 'ollama.summarize',
    moduleId: 'ollama',
    label: 'Ollama: Zusammenfassen',
    description: 'Fasst einen Text lokal mit Ollama zusammen.',
    inputs: [inp('text', 'Text', 'text', { required: true })],
    outputs: [out('text', 'Zusammenfassung', 'text')],
    privacy: { localOnly: true },
    config: [{ key: 'model', label: 'Modell', type: 'model' }]
  },
  {
    id: 'ollama.generateReply',
    moduleId: 'ollama',
    label: 'Ollama: Antwort entwerfen',
    description: 'Entwirft eine Antwort aus Mail + Projektkontext (lokal).',
    inputs: [
      inp('email', 'Mail', 'email', { required: true }),
      inp('context', 'Projektkontext', 'project_context')
    ],
    outputs: [out('draft', 'Antwortentwurf', 'draft_reply')],
    privacy: { containsPersonalData: true, localOnly: true },
    config: [{ key: 'model', label: 'Modell', type: 'model' }]
  },
  {
    id: 'ollama.extractTasks',
    moduleId: 'ollama',
    label: 'Ollama: Aufgaben extrahieren',
    description: 'Zieht Aufgaben aus einem Text (lokal). Liefert die Aufgaben als Liste UND als Markdown-Text (zum Anhängen an eine Notiz).',
    inputs: [inp('text', 'Text', 'text', { required: true })],
    outputs: [
      out('tasks', 'Aufgaben', 'task', { multiple: true }),
      out('text', 'Aufgaben als Text', 'text')
    ],
    hardLockModule: 'task-extraction',
    privacy: { localOnly: true },
    config: [{ key: 'model', label: 'Modell', type: 'model' }]
  },
  {
    id: 'ollama.classify',
    moduleId: 'ollama',
    label: 'Ollama: Klassifizieren',
    description: 'Ordnet einen Text einer Kategorie zu (lokal, JSON-Ausgabe).',
    inputs: [inp('text', 'Text', 'text', { required: true })],
    outputs: [out('result', 'Ergebnis', 'json')],
    privacy: { localOnly: true },
    config: [{ key: 'model', label: 'Modell', type: 'model' }]
  },
  {
    id: 'ollama.transformText',
    moduleId: 'ollama',
    label: 'Ollama: Freier Prompt',
    description: 'Wendet einen frei konfigurierbaren Prompt auf den Eingangstext an (lokal).',
    inputs: [inp('text', 'Text', 'text', { required: true })],
    outputs: [out('text', 'Ergebnis', 'text')],
    privacy: { localOnly: true },
    config: [
      { key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'Was soll Ollama mit dem Text tun?' },
      { key: 'model', label: 'Modell', type: 'model' }
    ]
  },

  // ---------------- NOTES ----------------
  {
    id: 'notes.create',
    moduleId: 'notes',
    label: 'Notiz erstellen',
    description: 'Legt eine neue Notiz im Vault an.',
    isWrite: true,
    inputs: [inp('text', 'Inhalt', 'text', { required: true })],
    outputs: [out('note', 'Notiz', 'note')],
    privacy: { writesToDisk: true },
    config: [
      { key: 'folder', label: 'Zielordner', type: 'text', placeholder: '000 - 📥 inbox/010 - 📥 Notes' },
      { key: 'title', label: 'Titel (optional)', type: 'text' }
    ]
  },
  {
    id: 'notes.search',
    moduleId: 'notes',
    label: 'Notizen suchen',
    description: 'Sucht Notizen im Vault per Stichwort.',
    inputs: [inp('text', 'Suchbegriff', 'text', { required: true })],
    outputs: [out('notes', 'Treffer', 'note', { multiple: true })]
  },
  {
    id: 'notes.append',
    moduleId: 'notes',
    label: 'An Notiz anhängen',
    description: 'Hängt Text an eine bestehende Notiz an.',
    isWrite: true,
    inputs: [
      inp('note', 'Notiz', 'note', { required: true }),
      inp('text', 'Text', 'text', { required: true })
    ],
    outputs: [out('note', 'Notiz', 'note')],
    privacy: { writesToDisk: true }
  },

  // ---------------- HUMAN REVIEW ----------------
  {
    id: 'human.reviewText',
    moduleId: 'human',
    label: 'Mensch prüft (Text)',
    description:
      'Terminal: der Text wird dem Menschen zur Prüfung vorgelegt. Bei manuellem Lauf als Hinweis, bei Event als Aufgabe.',
    isTerminal: true,
    inputs: [inp('text', 'Text', 'text', { required: true })],
    outputs: [out('approval', 'Freigabe', 'human_approval')]
  },
  {
    id: 'human.reviewDraftReply',
    moduleId: 'human',
    label: 'Mensch prüft (Antwort)',
    description:
      'Terminal: der Antwortentwurf landet im Compose-Fenster (manuell) bzw. als Aufgabe „✉️ Entwurf prüfen" (Event). Der Mensch sendet selbst.',
    isTerminal: true,
    inputs: [inp('draft', 'Antwortentwurf', 'draft_reply', { required: true })],
    outputs: [out('approval', 'Freigabe', 'human_approval')]
  }
]

const ACTION_INDEX: Record<string, WorkflowActionDefinition> = Object.fromEntries(
  WORKFLOW_ACTIONS.map(a => [a.id, a])
)

export function getActionById(id: string): WorkflowActionDefinition | undefined {
  return ACTION_INDEX[id]
}

export function actionsByModule(): Record<WorkflowModuleId, WorkflowActionDefinition[]> {
  const grouped = {} as Record<WorkflowModuleId, WorkflowActionDefinition[]>
  for (const action of WORKFLOW_ACTIONS) {
    ;(grouped[action.moduleId] ||= []).push(action)
  }
  return grouped
}

export function getPortDef(
  action: WorkflowActionDefinition,
  portId: string,
  side: 'input' | 'output'
): WorkflowPortDefinition | undefined {
  const list = side === 'input' ? action.inputs : action.outputs
  return list.find(p => p.id === portId)
}
