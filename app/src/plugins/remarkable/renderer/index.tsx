// reMarkable-Plugin — Renderer-Entry. Hängt das Sidebar-Panel an den benannten Slot
// `sidebar.panel.remarkable`. Lazy, damit React/Store erst beim Mounten geladen werden.
// Self-Gating: das Panel rendert null, wenn das Modul deaktiviert ist.

import type { PluginRendererEntry } from '@mindgraph/plugin-api'

const entry: PluginRendererEntry = {
  id: 'remarkable',
  contribute(slots) {
    slots.register('sidebar.panel.remarkable', {
      pluginId: 'remarkable',
      title: 'reMarkable',
      load: () => import('./RemarkablePanel'),
    })
  },
}

export default entry
