// Antares-Beispiel-Workflow für die Palette (vorher statisch im Kern-examples.ts). Lebt in der
// Vertikale und meldet sich über den Renderer-Slot `workflow.example` an — Ordner weg ⇒ Beispiel weg.

import { exampleBase } from '../../../shared/workflow/examples'
import type { Workflow } from '../../../shared/workflow/model'

/** Antares-Mahnung → freundlichen Mailentwurf vorbereiten → Mensch sendet. */
export function buildAntaresReminderExample(): Workflow {
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
