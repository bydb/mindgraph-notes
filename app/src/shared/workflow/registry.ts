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
  antares: 'Antares',
  tasks: 'Aufgaben',
  schedule: 'Zeitplan'
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
    // Layer B: feuert, wenn eine eingehende Mail eine Antwort auf eine von dir
    // gesendete Mail ist (In-Reply-To/References ∈ gesendete Message-IDs).
    id: 'email.replyReceived',
    moduleId: 'email',
    label: 'Antwort eingegangen (Auslöser)',
    description:
      'Startpunkt: eine eingehende Antwort auf eine von dir gesendete Mail. Gibt dieselbe Mail aus wie der normale Auslöser — alle Mail-Bausteine sind anschließbar.',
    isTrigger: true,
    inputs: [],
    outputs: [out('email', 'Mail', 'email')],
    privacy: { containsPersonalData: true }
  },
  {
    // Layer A: feuert bei eingehender Mail mit Kalender-Einladung (.ics).
    id: 'email.icsReceived',
    moduleId: 'email',
    label: 'Termin-Einladung (Auslöser)',
    description:
      'Startpunkt: eine eingehende Mail mit einer Kalender-Einladung (.ics-Anhang). Gibt die Mail aus — anschließbar an alle Mail-Bausteine.',
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
  {
    id: 'email.composeDraft',
    moduleId: 'email',
    label: 'E-Mail-Entwurf vorbereiten',
    description:
      'Bereitet aus Kontakt und Text einen E-Mail-Entwurf vor. Für edoobox-/Antares-Trigger: Kontakt-Port + Text-Port verbinden, danach „Mensch prüft (Antwort)".',
    inputs: [
      inp('email', 'Kontakt', 'email', { required: true }),
      inp('text', 'Inhalt', 'text', { required: true })
    ],
    outputs: [out('draft', 'E-Mail-Entwurf', 'draft_reply')],
    privacy: { containsPersonalData: true }
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
  {
    id: 'project.rag',
    moduleId: 'project',
    label: 'Projekt-RAG abfragen',
    description:
      'Semantische Abfrage des Projektordners (lokales RAG). Liefert die relevantesten Auszüge als Kontext für z.B. einen Antwortentwurf.',
    inputs: [
      inp('project', 'Projekt', 'project', { required: true }),
      inp('query', 'Frage', 'text', { required: true })
    ],
    outputs: [
      out('context', 'Retrieval-Kontext', 'project_context'),
      out('text', 'Kontext (Text)', 'text')
    ],
    // Embedding läuft lokal; Retrieval ist kein generativer Schritt auf untrusted
    // Input → kein Hard-Lock nötig. Embedding-Modell = zentrales Setting (kein
    // Per-Node-Override, sonst Index-Rebuild-Mismatch).
    privacy: { localOnly: true }
  },

  // ---------------- OLLAMA ----------------
  {
    id: 'ollama.summarize',
    moduleId: 'ollama',
    label: 'Ollama: Zusammenfassen',
    description: 'Fasst einen Text lokal mit Ollama zusammen.',
    inputs: [inp('text', 'Text', 'text', { required: true })],
    outputs: [out('text', 'Zusammenfassung', 'text')],
    hardLockModule: 'task-extraction',
    privacy: { localOnly: true },
    config: [{ key: 'model', label: 'Modell', type: 'model' }]
  },
  {
    id: 'ollama.generateReply',
    moduleId: 'ollama',
    label: 'Ollama: Antwort entwerfen',
    description: 'Entwirft eine Antwort aus Mail + Projektkontext (lokal). Anrede (Sie/du) konfigurierbar, Standard: Sie.',
    inputs: [
      inp('email', 'Mail', 'email', { required: true }),
      inp('context', 'Projektkontext', 'project_context')
    ],
    outputs: [out('draft', 'Antwortentwurf', 'draft_reply')],
    hardLockModule: 'task-extraction',
    privacy: { containsPersonalData: true, localOnly: true },
    config: [
      {
        key: 'anrede',
        label: 'Anrede',
        type: 'select',
        default: 'sie',
        options: [
          { value: 'sie', label: 'Sie (förmlich)' },
          { value: 'du', label: 'du (informell)' },
          { value: 'auto', label: 'Automatisch (wie eingegangene Mail)' }
        ]
      },
      { key: 'model', label: 'Modell', type: 'model' }
    ]
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
    hardLockModule: 'task-extraction',
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
    hardLockModule: 'task-extraction',
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
    inputs: [
      inp('draft', 'Antwortentwurf', 'draft_reply', { required: true }),
      inp('email', 'Kontakt', 'email')
    ],
    outputs: [out('approval', 'Freigabe', 'human_approval')]
  },

  // ---------------- ANTARES (Layer C) ----------------
  {
    // Feuert bei neuer überfälliger Rückgabe (Mahnung). Gibt eine menschenlesbare
    // Beschreibung als Text aus → anschließbar an Notiz/Prüfung/Ollama.
    id: 'antares.mahnung',
    moduleId: 'antares',
    label: 'Überfällige Rückgabe (Auslöser)',
    description:
      'Startpunkt: eine neue überfällige Rückgabe aus Antares (Mahnung). Gibt Leihnr, Titel, Entleiher, Schule, Rückgabedatum und - falls vorhanden - die E-Mail-Adresse aus.',
    isTrigger: true,
    inputs: [],
    outputs: [
      out('text', 'Mahnung', 'text'),
      out('email', 'Kontakt', 'email')
    ],
    privacy: { containsPersonalData: true, requiresCredential: true }
  },

  // ---------------- EDOOBOX (Layer D) ----------------
  {
    // Feuert, wenn die Buchungszahl eines Angebots steigt (neue Anmeldung).
    id: 'edoobox.newBooking',
    moduleId: 'edoobox',
    label: 'Neue Anmeldung (Auslöser)',
    description:
      'Startpunkt: eine neue Anmeldung in einem edoobox-Angebot. Gibt Angebotsname, Teilnehmer und E-Mail-Adresse aus.',
    isTrigger: true,
    inputs: [],
    outputs: [
      out('text', 'Anmeldung', 'text'),
      out('email', 'Teilnehmer', 'email')
    ],
    privacy: { containsPersonalData: true, requiresCredential: true }
  },

  // ---------------- TASKS (Layer E) ----------------
  {
    // Feuert, wenn eine Vault-Aufgabe heute fällig ist.
    id: 'tasks.dueSoon',
    moduleId: 'tasks',
    label: 'Aufgabe heute fällig (Auslöser)',
    description:
      'Startpunkt: eine Vault-Aufgabe ist heute fällig. Gibt Aufgabentext, Notiz und Fälligkeitsdatum als Text aus.',
    isTrigger: true,
    inputs: [],
    outputs: [out('text', 'Aufgabe', 'text')]
  },
  {
    // Abnehmer für den `task`-Ausgang (z.B. „Ollama: Aufgaben extrahieren"):
    // hängt die Aufgaben als Markdown-Checkboxen an eine bestehende Notiz an.
    id: 'tasks.writeToNote',
    moduleId: 'tasks',
    label: 'Aufgaben in Notiz schreiben',
    description:
      'Hängt extrahierte Aufgaben (als Markdown-Checkboxen) an eine bestehende Notiz an. Verbinde den Aufgaben-Ausgang von „Ollama: Aufgaben extrahieren" + eine Notiz (z.B. aus „Notiz erstellen"/„Notizen suchen").',
    isWrite: true,
    inputs: [
      inp('tasks', 'Aufgaben', 'task', { required: true }),
      inp('note', 'Notiz', 'note', { required: true })
    ],
    outputs: [out('note', 'Notiz', 'note')],
    privacy: { writesToDisk: true }
  },

  // ---------------- SCHEDULE (Layer F) ----------------
  {
    // Feuert nach festem Zeitplan (täglich/wöchentlich/monatlich) — auch wenn
    // der Canvas-Tab geschlossen ist (Main-Prozess-Timer).
    id: 'schedule.timer',
    moduleId: 'schedule',
    label: 'Zeitplan (Auslöser)',
    description:
      'Startpunkt: läuft nach festem Zeitplan. Gibt das aktuelle Datum als Text aus — für Tages-/Wochenberichte, Digests usw.',
    isTrigger: true,
    inputs: [],
    outputs: [out('text', 'Datum', 'text')],
    config: [
      {
        key: 'frequency',
        label: 'Häufigkeit',
        type: 'select',
        default: 'daily',
        options: [
          { value: 'daily', label: 'Täglich' },
          { value: 'weekly', label: 'Wöchentlich' },
          { value: 'monthly', label: 'Monatlich' }
        ]
      },
      { key: 'time', label: 'Uhrzeit (HH:MM)', type: 'text', placeholder: '09:00' },
      { key: 'weekday', label: 'Wochentag (0=So…6=Sa, nur wöchentlich)', type: 'number' },
      { key: 'dayOfMonth', label: 'Tag im Monat (1–31, nur monatlich)', type: 'number' }
    ]
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
