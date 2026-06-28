// Antares-Plugin — Renderer-Entry (im Renderer-Prozess, getrennt vom Main-Entry).
//
// Hängt das Dashboard-Widget an `dashboard.widget.antares` und die Einstellungen an
// `settings.section.antares`. Lazy, damit React/Store erst beim tatsächlichen Mounten
// geladen werden. Erkannt über `import.meta.glob` der Renderer-Registry — kein harter
// Import in der App. Siehe #12.

import type { PluginRendererEntry } from '../../../shared/plugins/entry'

const entry: PluginRendererEntry = {
  id: 'antares',
  contribute(slots) {
    slots.register('dashboard.widget.antares', {
      pluginId: 'antares',
      title: 'Antares Medienzentrum',
      load: () => import('./AntaresWidget'),
    })
    slots.register('settings.section.antares', {
      pluginId: 'antares',
      title: 'Antares Medienzentrum',
      load: () => import('./AntaresSettings'),
    })
  },
}

export default entry
