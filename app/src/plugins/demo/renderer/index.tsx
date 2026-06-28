// Demo-Plugin — Renderer-Entry (im Renderer-Prozess, getrennt vom Main-Entry).
//
// Registriert React-Beiträge an BENANNTE Slots — KEINE Host-Capability (UI läuft über
// die Renderer-Registry, nicht über den Capability-Host). Bewusst React-frei gehalten
// (lazy Komponente), damit die Registry-Logik ohne React-Runtime testbar bleibt; echte
// Plugins registrieren später echte Komponenten/Lazy-Imports. Siehe Entscheidung #12.

import type { PluginRendererEntry } from '@mindgraph/plugin-api'

const entry: PluginRendererEntry = {
  id: 'demo',
  contribute(slots) {
    slots.register('dashboard.widgets', {
      pluginId: 'demo',
      title: 'Demo-Widget',
      // Lazy, damit der Renderer React erst beim tatsächlichen Mounten lädt.
      load: () => import('./DemoWidget'),
    })
  },
}

export default entry
