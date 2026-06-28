// Plugin-Aktivierungs-Gate (A-pre Schritt 1) — verbindet ein gebündeltes Plugin mit dem
// uiStore-Modulschalter, der es an-/ausschaltet.
//
// Vor A-pre Schritt 1 flippte der Modulschalter NUR Renderer-Flags; der Main-Prozess
// aktivierte beim Start blind ALLE Plugins (`activateAll`). Diese Tabelle ist jetzt die
// Single-Source, gegen die beide Prozesse den Lebenszyklus fahren:
//   • Renderer: beim Umschalten → IPC `plugin:setEnabled` (activate/deactivate im Main)
//   • Main:     beim Start → `activateAll` überspringt deaktivierte Plugins (bleiben `disabled`)
//
// Bewusst hartverdrahtet auf Zweck: In A-pre Schritt 2 wird diese Zuordnung aus den
// Manifesten abgeleitet (Modul-Liste generisch). Plugins OHNE Eintrag (z.B. `demo`) haben
// kein Gate und bleiben immer aktiv.

export interface PluginGate {
  /** Plugin-ID (= Ordnername unter src/plugins/, = manifest.id). */
  pluginId: string
  /** uiStore-Modul-ID (MODULES[].id), dessen Schalter dieses Plugin steuert. */
  moduleId: string
  /** Dotted-Path in den persistierten uiStore-State, der true/false liefert
   *  (z.B. 'edoobox.enabled' — das Bundle-Modul 'mz-suite' setzt diesen Flag). */
  enabledPath: string
}

export const PLUGIN_GATES: readonly PluginGate[] = [
  { pluginId: 'antares', moduleId: 'antares', enabledPath: 'antares.enabled' },
  { pluginId: 'remarkable', moduleId: 'remarkable', enabledPath: 'remarkable.enabled' },
  { pluginId: 'edoobox', moduleId: 'mz-suite', enabledPath: 'edoobox.enabled' },
]

/** Liest einen Dotted-Path (z.B. 'antares.enabled') als Boolean aus einem Settings-Objekt.
 *  STRIKT: nur exakt `true` zählt als aktiviert — ein persistierter String `"false"` o.ä.
 *  bleibt deaktiviert (kein versehentliches Truthiness-Aktivieren). */
export function readBoolPath(obj: unknown, path: string): boolean {
  let cur: unknown = obj
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return false
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur === true
}

/**
 * Soll ein Plugin laut Settings aktiv sein? Ohne Gate-Eintrag ⇒ true (immer aktiv).
 * `settings` ist der persistierte uiStore-State (Main: aus ui-settings.json, Renderer:
 * aus useUIStore.getState()).
 */
export function isPluginGateEnabled(pluginId: string, settings: unknown): boolean {
  const gate = PLUGIN_GATES.find((g) => g.pluginId === pluginId)
  if (!gate) return true
  return readBoolPath(settings, gate.enabledPath)
}
