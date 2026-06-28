// edoobox-Beispiel-Workflow für die Palette (vorher statisch im Kern-examples.ts). Lebt in der
// Vertikale und meldet sich über den Renderer-Slot `workflow.example` an — Ordner weg ⇒ Beispiel weg.

import { exampleBase } from '../../../shared/workflow/examples'
import type { Workflow } from '../../../shared/workflow/model'

/** edoobox-Anmeldung → persönliche Bestätigung vorbereiten → Mensch sendet. */
export function buildEdooboxConfirmationExample(): Workflow {
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
