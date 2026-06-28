// Plugin-Main-Entry — der ausführbare Teil im Main-Prozess (getrennt vom Manifest).
//
// Hier meldet ein Plugin seine Action-Executor an und hängt sich in den Lebenszyklus.
// Der Host ist über die Capability-Generics so getypt, dass nur deklarierte Dienste
// sichtbar sind. Siehe docs/plugin-system-plan.md, Entscheidungen #8, #15.

import type { PluginCapability } from './manifest'
import type { PluginHostFor } from './host'

/** Implementierung einer Action — bekommt die (vom Transport validierte) Payload. */
export type PluginActionExecutor = (payload: unknown) => Promise<unknown>

/**
 * Die EINZIGE Seam zum Anmelden ausführbarer Actions. Eine Action muss im Manifest
 * deklariert sein, bevor ihr Executor registriert werden darf (Prüfung in der Registry).
 */
export interface PluginActionRegistry {
  register(actionId: string, execute: PluginActionExecutor): void
}

/** Kontext, den ein Main-Entry bei register/start erhält. */
export interface PluginMainContext<C extends readonly PluginCapability[]> {
  host: PluginHostFor<C>
  actions: PluginActionRegistry
}

/** Vertrag eines Main-Entries. `C` wird aus den `as const` deklarierten Capabilities gebunden. */
export interface PluginMainEntry<
  C extends readonly PluginCapability[] = readonly PluginCapability[]
> {
  id: string
  register(ctx: PluginMainContext<C>): void | Promise<void>
  start?(ctx: PluginMainContext<C>): Promise<void>
  stop?(): Promise<void>
}

/** Optionale Lifecycle-Hooks getrennt von der initialen Registrierung. */
export interface PluginMainLifecycle<C extends readonly PluginCapability[]> {
  start?(ctx: PluginMainContext<C>): Promise<void>
  stop?(): Promise<void>
}

/**
 * Hilfsfunktion, die `C` aus dem Manifest-Capabilities-Tupel ableitet, sodass der
 * Host im Setup-Callback automatisch korrekt getypt ist. Aufruf typischerweise:
 *
 *   const manifest = { id: 'antares', capabilities: ['http.fetch', 'secrets'] } as const
 *   export default definePluginMain(manifest, ({ host, actions }) => {
 *     // host.http und host.secrets sind hier sichtbar — host.vault NICHT.
 *   })
 *
 * `const C` (TS 5+) bewahrt das Literal-Tupel, ohne dass der Aufrufer `as const` an
 * den Funktionsaufruf hängen muss.
 */
export function definePluginMain<const C extends readonly PluginCapability[]>(
  manifest: { id: string; capabilities: C },
  setup: (ctx: PluginMainContext<C>) => void | Promise<void>,
  lifecycle?: PluginMainLifecycle<C>
): PluginMainEntry<C> {
  return {
    id: manifest.id,
    register: setup,
    start: lifecycle?.start,
    stop: lifecycle?.stop,
  }
}

// — Renderer-Entry (parallel, im Renderer-Prozess) —

/** Registrierung von React-Beiträgen an benannte Slots. Komponententyp bleibt offen,
 *  damit dieser shared-Vertrag nicht von React abhängt (Renderer-Registry konkretisiert). */
export interface SlotRegistry {
  register(slotId: string, component: unknown): void
}

export interface PluginRendererEntry {
  id: string
  contribute(slots: SlotRegistry): void
}
