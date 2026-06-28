// Antares-Plugin — Renderer-Entry (im Renderer-Prozess, getrennt vom Main-Entry).
//
// Hängt das Dashboard-Widget an den benannten Slot `dashboard.widget.antares`. Lazy,
// damit React/Store erst beim tatsächlichen Mounten geladen werden. Erkannt über
// `import.meta.glob` der Renderer-Registry — kein harter Import in der App. Siehe #12.

import type { PluginRendererEntry } from '../../../shared/plugins/entry'

const entry: PluginRendererEntry = {
  id: 'antares',
  contribute(slots) {
    slots.register('dashboard.widget.antares', {
      pluginId: 'antares',
      title: 'Antares Medienzentrum',
      load: () => import('./AntaresWidget'),
    })
  },
}

export default entry
