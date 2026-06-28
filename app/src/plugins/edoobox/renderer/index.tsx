// edoobox-Plugin — Renderer-Entry. Zwei Aufgaben:
//
// 1. EAGER (Modul-Seiteneffekt): lädt agentStore + edooboxClient, deren Modul-Enden sich als
//    Provider der neutralen Core-Bridges registrieren (Daten-Bridge `eventAgentBridge` +
//    Service-Facade `edooboxServiceBridge`). main.tsx initialisiert die Renderer-Registry beim
//    App-Start eager → die Provider stehen, bevor Settings/Dashboard/Kontakte sie abfragen,
//    OHNE dass der Core diese Module hart importiert.
// 2. LAZY: hängt das Agent-Panel an den rechten Panel-Slot.
//
// Deletion Test: fällt dieser Ordner weg, verschwindet der Glob-Treffer → kein Provider
// registriert sich → die Bridges liefern sichere Defaults, das Panel-Slot bleibt leer. Siehe
// docs/plugin-system-plan.md #12.

import type { PluginRendererEntry } from '../../../shared/plugins/entry'
import { WORKFLOW_TRIGGER_SLOT, WORKFLOW_EXAMPLE_SLOT } from '../../../shared/plugins/workflowTrigger'
import { edooboxTriggerProvider } from './workflowTrigger'
import { buildEdooboxConfirmationExample } from './workflowExample'
// Eager: Provider-Registrierung als Modul-Seiteneffekt (Daten-Bridge + Service-Facade).
import './agentStore'
import './edooboxClient'

const entry: PluginRendererEntry = {
  id: 'edoobox',
  contribute(slots) {
    slots.register('rightpanel.edoobox', {
      pluginId: 'edoobox',
      title: 'Edoobox',
      load: () => import('./AgentPanel').then(m => ({ default: m.AgentPanel })),
    })
    // Workflow-Trigger `edoobox.newBooking` — der Kern dispatcht generisch über diesen Provider.
    slots.register(WORKFLOW_TRIGGER_SLOT, edooboxTriggerProvider)
    // Beispiel-Workflow für die Palette.
    slots.register(WORKFLOW_EXAMPLE_SLOT, buildEdooboxConfirmationExample)
  },
}

export default entry
