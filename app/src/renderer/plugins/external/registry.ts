// Getrennte Registry für EXTERNE (disk-installierte, UNTRUSTED) deklarative Widgets.
//
// Bewusst NICHT die bundled-Vollvertrauens-`RendererPluginRegistry` (renderer/plugins/registry.ts):
// die lädt gebündelte React-Komponenten direkt in den Host-Baum. Externe Widgets dürfen das NIE
// (ADR §2/§4). Diese Registry hält pro Slot nur Beschreibungen (Plugin-Id + Slot + Titel); die
// DATEN holt der Host später über `plugin:widgetData(instanceId)` (Increment 2), gerendert wird über
// das feste Vokabular (DeclarativeWidget). Rein, React-frei, testbar.

import { WIDGET_SLOTS, type WidgetSlot } from '@mindgraph/plugin-api'
import type { ExternalWidgetDescriptor } from '../../../shared/plugins/widget'

/** Slot-Kategorien für externe Widgets (aus dem Manifest-Vertrag; Host-kontrolliert). */
export const EXTERNAL_WIDGET_SLOTS = {
  dashboard: 'dashboard.widget',
  sidebar: 'sidebar.panel',
} as const satisfies Record<string, WidgetSlot>

export type ExternalWidgetSlot = WidgetSlot
const KNOWN_SLOTS: ReadonlySet<string> = new Set(WIDGET_SLOTS)

/** Ein deklarativer Widget-Beitrag eines externen Plugins an einen (strikt begrenzten) Slot. */
export interface ExternalWidgetEntry extends ExternalWidgetDescriptor {
  title?: string
}

export class ExternalWidgetRegistry {
  private readonly bySlot = new Map<ExternalWidgetSlot, ExternalWidgetEntry[]>()
  private revision = 0
  private readonly listeners = new Set<() => void>()

  /** Beiträge eines Slots als KOPIE (interner mutable Zustand bleibt gekapselt). */
  getBySlot(slot: ExternalWidgetSlot): readonly ExternalWidgetEntry[] {
    const list = this.bySlot.get(slot)
    return list ? [...list] : []
  }

  /** EINZIGER Schreibpfad: ersetzt den kompletten Stand durch die vom Main gelieferte,
   *  autoritative Liste (Main ist Source-of-Truth — der Renderer spiegelt nur, baut NICHT
   *  inkrementell auf). Dedupe per pluginId+slot; unbekannte Slots werden fail-closed verworfen
   *  (die Daten stammen aus dem signierten Manifest, sollen aber keinen beliebigen Slot anlegen). */
  replace(entries: readonly ExternalWidgetEntry[]): void {
    this.bySlot.clear()
    for (const entry of entries) {
      if (!KNOWN_SLOTS.has(entry.slot)) continue
      const list = this.bySlot.get(entry.slot) ?? []
      const idx = list.findIndex((candidate) => candidate.pluginId === entry.pluginId)
      if (idx >= 0) list[idx] = entry
      else list.push(entry)
      this.bySlot.set(entry.slot, list)
    }
    this.changed()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getRevision = (): number => this.revision

  private changed(): void {
    this.revision++
    for (const listener of this.listeners) listener()
  }
}
