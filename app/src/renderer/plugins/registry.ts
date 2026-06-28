// Renderer-Plugin-Registry — Gegenstück zur Main-Registry, gekoppelt nur über `manifest.id`.
//
// Sammelt React-Beiträge an BENANNTE Slots (Entscheidung #12). Bewusst React-frei in der
// Logik: Komponenten sind `unknown` und werden erst am Slot gemountet. Erkennung über
// `import.meta.glob` der Renderer-Entries — keine handgepflegte Importliste. Ein Entry, der
// beim contribute wirft, wird isoliert; andere Plugins bleiben sichtbar. Siehe Plan.

import type { PluginRendererEntry, SlotRegistry } from '@mindgraph/plugin-api'

export class RendererPluginRegistry {
  private readonly slots = new Map<string, unknown[]>()
  private readonly failed = new Map<string, string>()

  /** Lässt jeden Entry seine Slot-Beiträge anmelden; Fehler eines Entries isoliert. */
  load(entries: PluginRendererEntry[]): void {
    for (const entry of entries) {
      const reg: SlotRegistry = {
        register: (slotId, component) => {
          const list = this.slots.get(slotId) ?? []
          list.push(component)
          this.slots.set(slotId, list)
        },
      }
      try {
        entry.contribute(reg)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.failed.set(entry.id, msg)
        console.error(`[plugin] Renderer-Entry '${entry.id}' warf bei contribute: ${msg}`)
      }
    }
  }

  /** Alle an einem Slot registrierten Komponenten (Reihenfolge der Registrierung). */
  getSlot(slotId: string): unknown[] {
    return this.slots.get(slotId) ?? []
  }

  slotIds(): string[] {
    return [...this.slots.keys()]
  }

  failures(): Record<string, string> {
    return Object.fromEntries(this.failed)
  }
}

/** Sammelt alle Renderer-Entries (je `renderer/index.tsx` unter `src/plugins/`), eager + React-frei. */
export function discoverRendererPlugins(): PluginRendererEntry[] {
  const modules = import.meta.glob<{ default?: PluginRendererEntry }>(
    '../../plugins/*/renderer/index.tsx',
    { eager: true }
  )
  const entries: PluginRendererEntry[] = []
  for (const mod of Object.values(modules)) {
    if (mod.default && typeof mod.default.contribute === 'function') entries.push(mod.default)
  }
  return entries
}

export function createRendererRegistry(): RendererPluginRegistry {
  const registry = new RendererPluginRegistry()
  registry.load(discoverRendererPlugins())
  return registry
}
