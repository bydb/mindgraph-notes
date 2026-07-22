// WordPress-Plugin — Renderer-Entry (im Renderer-Prozess, getrennt vom Main-Entry).
//
// Hängt die Einstellungen an den GENERISCHEN Slot `SETTINGS_SECTION_SLOT` (der Kern rendert
// daraus einen eigenen dynamischen Settings-Tab `plugin:wordpress`; `title` ist das
// Nav-Label). Lädt EAGER den wordpressClient — dessen Modul-Ende registriert den Provider
// der wordpressServiceBridge, damit Editor/Zugangsdaten-Tab/edoobox-Marketing publizieren
// können, ohne das Plugin hart zu importieren. Erkannt über `import.meta.glob` der
// Renderer-Registry — kein harter Import in der App.

import type { PluginRendererEntry } from '@mindgraph/plugin-api'
import { SETTINGS_SECTION_SLOT } from '@mindgraph/plugin-api'
import './wordpressClient'

const entry: PluginRendererEntry = {
  id: 'wordpress',
  contribute(slots) {
    slots.register(SETTINGS_SECTION_SLOT, {
      pluginId: 'wordpress',
      title: 'WordPress',
      load: () => import('./WordpressSettings'),
    })
  },
}

export default entry
