// Workflow Canvas — gebündelte Beispiel-/Template-Workflows.
import type { Workflow } from './model'

function nowIso(): string {
  return new Date().toISOString()
}

function exampleBase(
  id: string,
  name: string,
  description: string,
  nodes: Workflow['nodes'],
  edges: Workflow['edges']
): Workflow {
  const ts = nowIso()
  return {
    id,
    name,
    description,
    version: 1,
    enabled: false,
    createdAt: ts,
    updatedAt: ts,
    nodes,
    edges
  }
}

/**
 * Pitch-Flaggschiff: Neue relevante E-Mail → Projekt erkennen →
 * Projektkontext → Ollama Antwort entwerfen → Mensch prüft.
 */
export function buildExampleReplyWorkflow(): Workflow {
  return exampleBase(
    'example-email-reply',
    'E-Mail beantworten',
    'Erkennt das Projekt einer Mail, lädt Kontext und entwirft mit Ollama eine Antwort zur Prüfung.',
    [
      { id: 'n_email', actionId: 'email.selectedEmail', position: { x: 40, y: 220 }, config: {} },
      { id: 'n_match', actionId: 'project.match', position: { x: 340, y: 120 }, config: {} },
      { id: 'n_ctx', actionId: 'project.context', position: { x: 640, y: 120 }, config: {} },
      { id: 'n_reply', actionId: 'ollama.generateReply', position: { x: 940, y: 220 }, config: { model: '' } },
      { id: 'n_review', actionId: 'human.reviewDraftReply', position: { x: 1240, y: 220 }, config: {} }
    ],
    [
      { id: 'e1', fromNodeId: 'n_email', fromPortId: 'email', toNodeId: 'n_match', toPortId: 'email' },
      { id: 'e2', fromNodeId: 'n_match', fromPortId: 'project', toNodeId: 'n_ctx', toPortId: 'project' },
      { id: 'e3', fromNodeId: 'n_ctx', fromPortId: 'context', toNodeId: 'n_reply', toPortId: 'context' },
      { id: 'e4', fromNodeId: 'n_email', fromPortId: 'email', toNodeId: 'n_reply', toPortId: 'email' },
      { id: 'e5', fromNodeId: 'n_reply', fromPortId: 'draft', toNodeId: 'n_review', toPortId: 'draft' }
    ]
  )
}

/** Neue/ausgewählte Mail → Analyse → Aufgaben extrahieren → Inbox-Notiz. */
export function buildExampleEmailTasksWorkflow(): Workflow {
  return exampleBase(
    'example-email-tasks',
    'Mail zu Aufgabenliste',
    'Analysiert eine Mail, extrahiert konkrete Aufgaben und legt sie als Workflow-Notiz im Inbox-Ordner ab.',
    [
      { id: 'n_email', actionId: 'email.selectedEmail', position: { x: 40, y: 220 }, config: {} },
      { id: 'n_analyze', actionId: 'email.analyze', position: { x: 340, y: 220 }, config: { model: '' } },
      { id: 'n_tasks', actionId: 'ollama.extractTasks', position: { x: 640, y: 220 }, config: { model: '' } },
      {
        id: 'n_note',
        actionId: 'notes.create',
        position: { x: 940, y: 220 },
        config: { folder: '000 - 📥 inbox/010 - 📥 Notes', title: 'Aufgaben aus Mail' }
      }
    ],
    [
      { id: 'e1', fromNodeId: 'n_email', fromPortId: 'email', toNodeId: 'n_analyze', toPortId: 'email' },
      { id: 'e2', fromNodeId: 'n_analyze', fromPortId: 'text', toNodeId: 'n_tasks', toPortId: 'text' },
      { id: 'e3', fromNodeId: 'n_tasks', fromPortId: 'text', toNodeId: 'n_note', toPortId: 'text' }
    ]
  )
}

/** Antwort auf eigene Mail → Kurzfassung → Mensch prüft. */
export function buildExampleReplyDigestWorkflow(): Workflow {
  return exampleBase(
    'example-reply-digest',
    'Neue Antwort zusammenfassen',
    'Fasst eingegangene Antworten auf gesendete Mails kurz zusammen und legt sie zur menschlichen Prüfung vor.',
    [
      { id: 'n_reply', actionId: 'email.replyReceived', position: { x: 40, y: 220 }, config: {} },
      { id: 'n_analyze', actionId: 'email.analyze', position: { x: 340, y: 220 }, config: { model: '' } },
      { id: 'n_summary', actionId: 'ollama.summarize', position: { x: 640, y: 220 }, config: { model: '' } },
      { id: 'n_review', actionId: 'human.reviewText', position: { x: 940, y: 220 }, config: {} }
    ],
    [
      { id: 'e1', fromNodeId: 'n_reply', fromPortId: 'email', toNodeId: 'n_analyze', toPortId: 'email' },
      { id: 'e2', fromNodeId: 'n_analyze', fromPortId: 'text', toNodeId: 'n_summary', toPortId: 'text' },
      { id: 'e3', fromNodeId: 'n_summary', fromPortId: 'text', toNodeId: 'n_review', toPortId: 'text' }
    ]
  )
}

/** Mail mit .ics → Termintext herausarbeiten → Mensch prüft. */
export function buildExampleIcsReviewWorkflow(): Workflow {
  return exampleBase(
    'example-ics-review',
    'Termin-Einladung prüfen',
    'Erkennt Mails mit Kalender-Einladung und formuliert eine kurze Prüfnotiz zu Datum, Anlass und offenem Handlungsbedarf.',
    [
      { id: 'n_ics', actionId: 'email.icsReceived', position: { x: 40, y: 220 }, config: {} },
      { id: 'n_analyze', actionId: 'email.analyze', position: { x: 340, y: 220 }, config: { model: '' } },
      {
        id: 'n_extract',
        actionId: 'ollama.transformText',
        position: { x: 640, y: 220 },
        config: {
          model: '',
          prompt: 'Erstelle eine knappe Termin-Prüfnotiz: Anlass, vermuteter Zeitraum, beteiligte Personen und was der Mensch entscheiden muss. Behaupte nicht, die .ics-Datei selbst gelesen zu haben.'
        }
      },
      { id: 'n_review', actionId: 'human.reviewText', position: { x: 940, y: 220 }, config: {} }
    ],
    [
      { id: 'e1', fromNodeId: 'n_ics', fromPortId: 'email', toNodeId: 'n_analyze', toPortId: 'email' },
      { id: 'e2', fromNodeId: 'n_analyze', fromPortId: 'text', toNodeId: 'n_extract', toPortId: 'text' },
      { id: 'e3', fromNodeId: 'n_extract', fromPortId: 'text', toNodeId: 'n_review', toPortId: 'text' }
    ]
  )
}

/** Antares-Mahnung → freundlichen Mailentwurf vorbereiten → Mensch sendet. */
export function buildExampleAntaresReminderWorkflow(): Workflow {
  return exampleBase(
    'example-antares-reminder',
    'Antares-Mahnung vorbereiten',
    'Erstellt aus einer überfälligen Rückgabe einen höflichen Erinnerungsentwurf zur Prüfung.',
    [
      { id: 'n_mahnung', actionId: 'antares.mahnung', position: { x: 40, y: 220 }, config: {} },
      {
        id: 'n_text',
        actionId: 'ollama.transformText',
        position: { x: 340, y: 220 },
        config: {
          model: '',
          prompt: 'Formuliere aus den folgenden Mahnungsdaten eine höfliche, kurze E-Mail. Bitte um Rückgabe oder Rückmeldung, nenne Titel und Fälligkeitsdatum, und bleibe freundlich-sachlich.'
        }
      },
      { id: 'n_draft', actionId: 'email.composeDraft', position: { x: 640, y: 220 }, config: {} },
      { id: 'n_review', actionId: 'human.reviewDraftReply', position: { x: 940, y: 220 }, config: {} }
    ],
    [
      { id: 'e1', fromNodeId: 'n_mahnung', fromPortId: 'text', toNodeId: 'n_text', toPortId: 'text' },
      { id: 'e2', fromNodeId: 'n_text', fromPortId: 'text', toNodeId: 'n_draft', toPortId: 'text' },
      { id: 'e3', fromNodeId: 'n_mahnung', fromPortId: 'email', toNodeId: 'n_draft', toPortId: 'email' },
      { id: 'e4', fromNodeId: 'n_draft', fromPortId: 'draft', toNodeId: 'n_review', toPortId: 'draft' },
      { id: 'e5', fromNodeId: 'n_mahnung', fromPortId: 'email', toNodeId: 'n_review', toPortId: 'email' }
    ]
  )
}

/** edoobox-Anmeldung → persönliche Bestätigung vorbereiten → Mensch sendet. */
export function buildExampleEdooboxConfirmationWorkflow(): Workflow {
  return exampleBase(
    'example-edoobox-confirmation',
    'edoobox-Anmeldung → Bestätigung (Mensch prüft)',
    'Erstellt bei einer neuen edoobox-Anmeldung einen persönlichen Bestätigungsentwurf (Anrede „Sie", ohne erfundene Details) und legt ihn zur Prüfung vor — der Mensch sendet.',
    [
      { id: 'n_booking', actionId: 'edoobox.newBooking', position: { x: 40, y: 220 }, config: {} },
      {
        id: 'n_text',
        actionId: 'ollama.transformText',
        position: { x: 340, y: 220 },
        config: {
          model: '',
          prompt: 'Verfasse aus den folgenden Anmeldedaten eine freundliche, professionelle Bestätigungs-E-Mail zur Fortbildungs-Anmeldung. Sprich die Person mit „Sie" an. Bestätige die Anmeldung, nenne Angebot und Teilnehmer, danke für das Interesse und weise darauf hin, dass weitere organisatorische Informationen rechtzeitig folgen. Erfinde keine Details: Ort, Datum, Uhrzeit oder Zahlungsangaben nur nennen, wenn sie im Text vorkommen. Höchstens 120 Wörter. Gib nur den E-Mail-Text aus (Anrede bis Grußformel), keinen Betreff.'
        }
      },
      { id: 'n_draft', actionId: 'email.composeDraft', position: { x: 640, y: 220 }, config: {} },
      { id: 'n_review', actionId: 'human.reviewDraftReply', position: { x: 940, y: 220 }, config: {} }
    ],
    [
      { id: 'e1', fromNodeId: 'n_booking', fromPortId: 'text', toNodeId: 'n_text', toPortId: 'text' },
      { id: 'e2', fromNodeId: 'n_text', fromPortId: 'text', toNodeId: 'n_draft', toPortId: 'text' },
      { id: 'e3', fromNodeId: 'n_booking', fromPortId: 'email', toNodeId: 'n_draft', toPortId: 'email' },
      { id: 'e4', fromNodeId: 'n_draft', fromPortId: 'draft', toNodeId: 'n_review', toPortId: 'draft' },
      { id: 'e5', fromNodeId: 'n_booking', fromPortId: 'email', toNodeId: 'n_review', toPortId: 'email' }
    ]
  )
}

/** Heute fällige Aufgabe → Tagesfokus formulieren → Mensch prüft. */
export function buildExampleDueTaskWorkflow(): Workflow {
  return exampleBase(
    'example-due-task-focus',
    'Heute fällige Aufgabe fokussieren',
    'Wandelt eine heute fällige Vault-Aufgabe in eine knappe Handlungsnotiz um.',
    [
      { id: 'n_due', actionId: 'tasks.dueSoon', position: { x: 40, y: 220 }, config: {} },
      {
        id: 'n_focus',
        actionId: 'ollama.transformText',
        position: { x: 340, y: 220 },
        config: {
          model: '',
          prompt: 'Formuliere aus der folgenden Aufgabe eine sehr kurze Handlungsnotiz: nächster Schritt, Kontext und warum es heute relevant ist.'
        }
      },
      { id: 'n_review', actionId: 'human.reviewText', position: { x: 640, y: 220 }, config: {} }
    ],
    [
      { id: 'e1', fromNodeId: 'n_due', fromPortId: 'text', toNodeId: 'n_focus', toPortId: 'text' },
      { id: 'e2', fromNodeId: 'n_focus', fromPortId: 'text', toNodeId: 'n_review', toPortId: 'text' }
    ]
  )
}

export function buildExampleWorkflows(): Workflow[] {
  return [
    buildExampleReplyWorkflow(),
    buildExampleEmailTasksWorkflow(),
    buildExampleReplyDigestWorkflow(),
    buildExampleIcsReviewWorkflow(),
    buildExampleAntaresReminderWorkflow(),
    buildExampleEdooboxConfirmationWorkflow(),
    buildExampleDueTaskWorkflow()
  ]
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
