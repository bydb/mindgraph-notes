// Getrennte Registry für EXTERNE (disk-installierte, UNTRUSTED) deklarative Widgets.
//
// Bewusst NICHT die bundled-Vollvertrauens-`RendererPluginRegistry` (renderer/plugins/registry.ts):
// die lädt gebündelte React-Komponenten direkt in den Host-Baum. Externe Widgets dürfen das NIE
// (ADR §2/§4). Diese Registry hält pro Slot nur Beschreibungen (Plugin-Id + Slot + Titel); die
// DATEN holt der Host später über `plugin:widgetData(instanceId)` (Increment 2), gerendert wird über
// das feste Vokabular (DeclarativeWidget). Rein, React-frei, testbar.

import { WIDGET_SLOTS, type WidgetSlot } from '@mindgraph/plugin-api'

/** Slot-Kategorien für externe Widgets (aus dem Manifest-Vertrag; Host-kontrolliert). */
export const EXTERNAL_WIDGET_SLOTS = {
  dashboard: 'dashboard.widget',
  sidebar: 'sidebar.panel',
} as const satisfies Record<string, WidgetSlot>

export type ExternalWidgetSlot = WidgetSlot
const KNOWN_SLOTS: ReadonlySet<string> = new Set(WIDGET_SLOTS)

/** Ein deklarativer Widget-Beitrag eines externen Plugins an einen (strikt begrenzten) Slot. */
export interface ExternalWidgetEntry {
  pluginId: string
  slot: ExternalWidgetSlot
  title?: string
}

export class ExternalWidgetRegistry {
  private readonly bySlot = new Map<ExternalWidgetSlot, ExternalWidgetEntry[]>()

  /** Registriert/aktualisiert den Beitrag eines Plugins für einen Slot (dedupe per pluginId+slot).
   *  Unbekannte Slots werden zur LAUFZEIT verworfen (fail-closed — die Daten stammen aus dem,
   *  wenn auch signierten, Manifest und sollen keinen beliebigen Slot anlegen). */
  register(entry: ExternalWidgetEntry): void {
    if (!KNOWN_SLOTS.has(entry.slot)) {
      console.warn(`[ext-widget] unbekannter Slot '${entry.slot}' verworfen (Plugin '${entry.pluginId}')`)
      return
    }
    const list = this.bySlot.get(entry.slot) ?? []
    const idx = list.findIndex((e) => e.pluginId === entry.pluginId)
    if (idx >= 0) list[idx] = entry
    else list.push(entry)
    this.bySlot.set(entry.slot, list)
  }

  /** Entfernt ALLE Beiträge eines Plugins (Runtime-Disable/Uninstall — Increment 3). */
  removeByPlugin(pluginId: string): void {
    for (const [slot, list] of this.bySlot) {
      const next = list.filter((e) => e.pluginId !== pluginId)
      if (next.length) this.bySlot.set(slot, next)
      else this.bySlot.delete(slot)
    }
  }

  /** Beiträge eines Slots als KOPIE (interner mutable Zustand bleibt gekapselt). */
  getBySlot(slot: ExternalWidgetSlot): readonly ExternalWidgetEntry[] {
    const list = this.bySlot.get(slot)
    return list ? [...list] : []
  }

  clear(): void {
    this.bySlot.clear()
  }
}
