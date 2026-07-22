// Antares-Plugin — Renderer-Entry (im Renderer-Prozess, getrennt vom Main-Entry).
//
// Hängt das Dashboard-Widget an `dashboard.widget.antares` und die Einstellungen an den
// GENERISCHEN, plugin-unabhängigen Slot `SETTINGS_SECTION_SLOT` (der Kern nennt kein Plugin
// namentlich — er rendert pro Beitrag eines aktiven Plugins einen eigenen Settings-Tab
// `plugin:<id>`; `title` ist dessen Nav-Label). Lazy, damit React/Store erst beim Mounten
// geladen werden. Erkannt über `import.meta.glob` der Renderer-Registry — kein harter
// Import in der App. Siehe #12.

import type { PluginRendererEntry } from '@mindgraph/plugin-api'
import { WORKFLOW_TRIGGER_SLOT, WORKFLOW_EXAMPLE_SLOT, SETTINGS_SECTION_SLOT } from '@mindgraph/plugin-api'
import { antaresTriggerProvider } from './workflowTrigger'
import { buildAntaresReminderExample } from './workflowExample'

const entry: PluginRendererEntry = {
  id: 'antares',
  contribute(slots) {
    slots.register('dashboard.widget.antares', {
      pluginId: 'antares',
      title: 'Antares Medienzentrum',
      load: () => import('./AntaresWidget'),
    })
    slots.register(SETTINGS_SECTION_SLOT, {
      pluginId: 'antares',
      title: 'Antares',
      load: () => import('./AntaresSettings'),
    })
    // Workflow-Trigger `antares.mahnung` — der Kern dispatcht generisch über diesen Provider.
    slots.register(WORKFLOW_TRIGGER_SLOT, antaresTriggerProvider)
    // Beispiel-Workflow für die Palette.
    slots.register(WORKFLOW_EXAMPLE_SLOT, buildAntaresReminderExample)
  },
}

export default entry
