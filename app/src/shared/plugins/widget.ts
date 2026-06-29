import type { WidgetSlot, WidgetView } from '@mindgraph/plugin-api'

/** Öffentliche, rein datenförmige Beschreibung einer Main-seitig gebundenen Widget-Instanz. */
export interface ExternalWidgetDescriptor {
  instanceId: string
  pluginId: string
  pluginLabel: string
  slot: WidgetSlot
}

export interface WidgetListResult {
  ok: boolean
  data?: ExternalWidgetDescriptor[]
  error?: string
}

export interface WidgetDataResult {
  ok: boolean
  data?: WidgetView
  error?: string
}
