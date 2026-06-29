// Getrennte Registry für EXTERNE (disk-installierte, UNTRUSTED) deklarative Widgets.
//
// Bewusst NICHT die bundled-Vollvertrauens-`RendererPluginRegistry` (renderer/plugins/registry.ts):
// die lädt gebündelte React-Komponenten direkt in den Host-Baum. Externe Widgets dürfen das NIE
// (ADR §2/§4). Diese Registry hält pro Slot nur Beschreibungen (Plugin-Id + Slot + Titel); die
// DATEN holt der Host später über `plugin:widgetData(instanceId)` (Increment 2), gerendert wird über
// das feste Vokabular (DeclarativeWidget). Rein, React-frei, testbar.

/** Slot-Kategorien für externe Widgets (Host-kontrolliert; identisch für alle externen Plugins). */
export const EXTERNAL_WIDGET_SLOTS = {
  dashboard: 'dashboard.widget',
  sidebar: 'sidebar.panel',
} as const

export type ExternalWidgetSlot = (typeof EXTERNAL_WIDGET_SLOTS)[keyof typeof EXTERNAL_WIDGET_SLOTS]

/** Ein deklarativer Widget-Beitrag eines externen Plugins an einen Slot. */
export interface ExternalWidgetEntry {
  pluginId: string
  slot: string
  title?: string
}

export class ExternalWidgetRegistry {
  private readonly bySlot = new Map<string, ExternalWidgetEntry[]>()

  /** Registriert/aktualisiert den Beitrag eines Plugins für einen Slot (dedupe per pluginId+slot). */
  register(entry: ExternalWidgetEntry): void {
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

  /** Beiträge eines Slots (Registrierungsreihenfolge). */
  getBySlot(slot: string): ExternalWidgetEntry[] {
    return this.bySlot.get(slot) ?? []
  }

  clear(): void {
    this.bySlot.clear()
  }
}
