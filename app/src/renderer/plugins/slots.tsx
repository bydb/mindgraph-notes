// Renderer-Slot-Rendering — die React-Seite der Renderer-Plugin-Registry.
//
// `RendererPluginRegistry` (registry.ts) ist bewusst React-frei und hält Slot-Beiträge
// als `unknown`. Hier konkretisieren wir den Beitrags-Typ und mounten ihn: jeder Beitrag
// ist eine lazy geladene React-Komponente, die an einem benannten Slot erscheint. Plugins
// (z.B. das Antares-Dashboard-Widget) hängen sich so in die App, ohne dass die App sie
// hart importiert — Grundlage des Deletion Tests. Siehe docs/plugin-system-plan.md #12.

import React, { Suspense } from 'react'
import { createRendererRegistry, type RendererPluginRegistry } from './registry'
import { WORKFLOW_TRIGGER_SLOT, WORKFLOW_EXAMPLE_SLOT, SETTINGS_SECTION_SLOT, type WorkflowTriggerProvider } from '@mindgraph/plugin-api'
import type { Workflow } from '../../shared/workflow/model'

/** Was ein Plugin an einen Slot hängt: eine lazy geladene Default-Export-Komponente.
 *  `ComponentType<any>`, damit ein Slot optionale Props (z.B. `onClose`) durchreichen kann. */
export interface SlotContribution {
  pluginId: string
  title?: string
  load: () => Promise<{ default: React.ComponentType<any> }>
}

// Singleton: die Glob-Erkennung läuft einmal beim ersten Slot-Render (oder beim eager
// ensureRendererPlugins() in main.tsx).
let registry: RendererPluginRegistry | null = null
function getRegistry(): RendererPluginRegistry {
  if (!registry) registry = createRendererRegistry()
  return registry
}

/**
 * Initialisiert die Renderer-Plugin-Registry EAGER. Wird beim App-Start (main.tsx) aufgerufen,
 * damit alle `renderer/index.tsx` (und deren Modul-Seiteneffekte, z.B. Bridge-Provider-
 * Registrierungen) laufen, bevor der erste Slot gemountet wird. Idempotent.
 */
export function ensureRendererPlugins(): void {
  getRegistry()
}

/**
 * Nicht-React-Slot: Plugin-Trigger-Provider (Antares-Mahnung, edoobox-Anmeldung, …),
 * gelesen vom `workflowStore` für den generischen Trigger-Dispatch. Leerer Slot nach dem
 * Löschen einer Plugin-Vertikale → keine Provider → der zugehörige Trigger-Baustein
 * feuert sauber ins Leere (kein toter Kern-Zweig). Siehe docs/plugin-store-plan.md (A-pre #4).
 */
export function getWorkflowTriggerProviders(): WorkflowTriggerProvider[] {
  return getRegistry().getSlot(WORKFLOW_TRIGGER_SLOT) as WorkflowTriggerProvider[]
}

/**
 * Plugin-beigesteuerte Beispiel-Workflows (als Builder → frische Objekte). Leerer Slot nach
 * Plugin-Löschung → kein totes Beispiel. Ein werfender Builder wird isoliert.
 */
export function getWorkflowExamples(): Workflow[] {
  const builders = getRegistry().getSlot(WORKFLOW_EXAMPLE_SLOT) as Array<() => Workflow>
  const out: Workflow[] = []
  for (const build of builders) {
    try { out.push(build()) } catch (err) {
      console.error('[plugin] Beispiel-Workflow-Builder warf:', err)
    }
  }
  return out
}

/**
 * Alle registrierten Plugin-Settings-Sektionen (`SETTINGS_SECTION_SLOT`). Die Settings-UI
 * erzeugt daraus dynamisch einen Tab pro Beitrag eines aktiven Plugins — der Kern nennt
 * dabei kein Plugin namentlich. Leerer Slot nach Plugin-Löschung → kein toter Tab.
 */
export function getSettingsSections(): SlotContribution[] {
  return getRegistry().getSlot(SETTINGS_SECTION_SLOT) as SlotContribution[]
}

// React.lazy pro Beitrag genau einmal erzeugen (stabile Identität → kein Remount-Flackern).
const lazyCache = new WeakMap<SlotContribution, React.ComponentType>()
function lazyComponent(c: SlotContribution): React.ComponentType {
  let comp = lazyCache.get(c)
  if (!comp) {
    comp = React.lazy(c.load)
    lazyCache.set(c, comp)
  }
  return comp
}

class SlotErrorBoundary extends React.Component<
  { pluginId: string; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(err: unknown): void {
    console.error(`[plugin] Slot-Komponente '${this.props.pluginId}' warf beim Rendern:`, err)
  }
  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * Rendert alle an `slotId` registrierten Plugin-Komponenten (Registrierungsreihenfolge).
 * Jede ist isoliert (ErrorBoundary + Suspense); ein abgestürztes Plugin reißt den Slot
 * nicht mit. Leerer Slot → `fallback` (default nichts) — genau das passiert nach dem
 * Löschen der Plugin-Vertikale.
 */
export const PluginSlot: React.FC<{
  slotId: string
  fallback?: React.ReactNode
  /** Nur Beiträge dieses Plugins rendern (z.B. der eigene dynamische Settings-Tab). */
  pluginId?: string
  /** Optionale Props, die an jede Slot-Komponente durchgereicht werden (z.B. `onClose`). */
  props?: Record<string, unknown>
}> = ({ slotId, fallback = null, pluginId, props }) => {
  const all = getRegistry().getSlot(slotId) as SlotContribution[]
  const contributions = pluginId ? all.filter(c => c.pluginId === pluginId) : all
  if (contributions.length === 0) return <>{fallback}</>
  return (
    <>
      {contributions.map((c, i) => {
        const Comp = lazyComponent(c)
        return (
          <SlotErrorBoundary key={`${c.pluginId}:${i}`} pluginId={c.pluginId}>
            <Suspense fallback={null}>
              <Comp {...(props ?? {})} />
            </Suspense>
          </SlotErrorBoundary>
        )
      })}
    </>
  )
}
