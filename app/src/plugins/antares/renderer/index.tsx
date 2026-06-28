// Antares-Plugin — Renderer-Entry (im Renderer-Prozess, getrennt vom Main-Entry).
//
// Hängt das Dashboard-Widget an `dashboard.widget.antares` und die Einstellungen an den
// GENERISCHEN, plugin-unabhängigen Slot `settings.section` (der Kern nennt kein Plugin
// namentlich — er rendert nur diesen einen allgemeinen Settings-Bereich). Lazy, damit
// React/Store erst beim Mounten geladen werden. Erkannt über `import.meta.glob` der
// Renderer-Registry — kein harter Import in der App. Siehe #12.

import type { PluginRendererEntry } from '../../../shared/plugins/entry'
import { WORKFLOW_TRIGGER_SLOT } from '../../../shared/plugins/workflowTrigger'
import { antaresTriggerProvider } from './workflowTrigger'

const entry: PluginRendererEntry = {
  id: 'antares',
  contribute(slots) {
    slots.register('dashboard.widget.antares', {
      pluginId: 'antares',
      title: 'Antares Medienzentrum',
      load: () => import('./AntaresWidget'),
    })
    slots.register('settings.section', {
      pluginId: 'antares',
      title: 'Antares Medienzentrum',
      load: () => import('./AntaresSettings'),
    })
    // Workflow-Trigger `antares.mahnung` — der Kern dispatcht generisch über diesen Provider.
    slots.register(WORKFLOW_TRIGGER_SLOT, antaresTriggerProvider)
  },
}

export default entry
