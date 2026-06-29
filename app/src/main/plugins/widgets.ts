import { randomUUID } from 'node:crypto'
import {
  WIDGET_VIEW_SCHEMA,
  type PluginManifest,
  type SlotDecl,
  type WidgetView,
} from '@mindgraph/plugin-api'
import { validateAgainst } from '@mindgraph/plugin-api/validation'
import type { ExternalWidgetDescriptor } from '../../shared/plugins/widget'

export const WIDGET_RUNTIME_LIMITS = {
  maxInstances: 32,
  maxPayloadBytes: 64 * 1024,
  minRefreshMs: 5_000,
} as const

interface InvokableRegistry {
  invoke(pluginId: string, actionId: string, payload: unknown): Promise<unknown>
}

interface WidgetInstance extends ExternalWidgetDescriptor {
  actionId: string
  pluginVersion: string
  cached?: WidgetView
  lastAttemptAt: number
  pending?: Promise<WidgetView>
}

const contributions = (manifest: PluginManifest): SlotDecl[] =>
  [manifest.ui?.dashboardWidget, manifest.ui?.sidebarPanel].filter(
    (value): value is SlotDecl => value !== undefined
  )

/**
 * Main-seitige Autoritätsgrenze für Tier-1-Widgets. Der Renderer kennt nur zufällige instanceIds;
 * Plugin und Action werden ausschließlich aus dem verifizierten Manifest gebunden.
 */
export class ExternalWidgetRuntime {
  private instances = new Map<string, WidgetInstance>()

  constructor(private readonly registry: InvokableRegistry, private readonly now: () => number = Date.now) {}

  sync(manifests: readonly PluginManifest[]): void {
    const oldByKey = new Map(
      [...this.instances.values()].map((entry) => [`${entry.pluginId}\0${entry.slot}`, entry])
    )
    const next = new Map<string, WidgetInstance>()

    for (const manifest of manifests) {
      for (const decl of contributions(manifest)) {
        if (next.size >= WIDGET_RUNTIME_LIMITS.maxInstances) break
        const action = manifest.actions?.find((candidate) => candidate.id === decl.fromAction)
        if (!action || action.widgetProvider !== true || action.isWrite !== false) continue
        const key = `${manifest.id}\0${decl.slot}`
        const previous = oldByKey.get(key)
        const canReuse =
          previous?.actionId === decl.fromAction && previous.pluginVersion === manifest.version
        let entry: WidgetInstance
        if (canReuse) {
          // Identität bewusst erhalten: ein reiner List-/Sync-Aufruf darf einen laufenden Provider-
          // Request nicht künstlich als "unloaded" invalidieren.
          previous.pluginLabel = manifest.label
          entry = previous
        } else {
          entry = {
              instanceId: randomUUID(),
              pluginId: manifest.id,
              pluginLabel: manifest.label,
              slot: decl.slot,
              actionId: decl.fromAction,
              pluginVersion: manifest.version,
              lastAttemptAt: 0,
            }
        }
        next.set(entry.instanceId, entry)
      }
    }
    this.instances = next
  }

  list(): ExternalWidgetDescriptor[] {
    return [...this.instances.values()].map(({ instanceId, pluginId, pluginLabel, slot }) => ({
      instanceId,
      pluginId,
      pluginLabel,
      slot,
    }))
  }

  async invoke(instanceId: unknown): Promise<WidgetView> {
    if (typeof instanceId !== 'string') throw new Error('Ungültige Widget-Instanz')
    const entry = this.instances.get(instanceId)
    if (!entry) throw new Error('Widget-Instanz ist nicht aktiv')
    if (entry.pending) return entry.pending

    const elapsed = this.now() - entry.lastAttemptAt
    if (entry.cached && elapsed < WIDGET_RUNTIME_LIMITS.minRefreshMs) return entry.cached
    if (!entry.cached && elapsed < WIDGET_RUNTIME_LIMITS.minRefreshMs) {
      throw new Error('Widget-Aktualisierung ist momentan begrenzt')
    }

    entry.lastAttemptAt = this.now()
    const pending = this.load(entry)
    entry.pending = pending
    try {
      const view = await pending
      if (this.instances.get(instanceId) !== entry) {
        throw new Error('Widget wurde während der Aktualisierung entladen')
      }
      entry.cached = view
      return view
    } finally {
      entry.pending = undefined
    }
  }

  private async load(entry: WidgetInstance): Promise<WidgetView> {
    const raw = await this.registry.invoke(entry.pluginId, entry.actionId, {})
    let serialized: string
    try {
      serialized = JSON.stringify(raw)
    } catch {
      throw new Error('Widget-Daten sind nicht serialisierbar')
    }
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > WIDGET_RUNTIME_LIMITS.maxPayloadBytes) {
      throw new Error('Widget-Daten überschreiten das Größenlimit')
    }
    const normalized = JSON.parse(serialized) as unknown
    const validation = validateAgainst(WIDGET_VIEW_SCHEMA, normalized, `widget:${entry.instanceId}`)
    if (!validation.valid) throw new Error(`Ungültige Widget-Daten: ${validation.errors.join('; ')}`)
    return normalized as WidgetView
  }
}
