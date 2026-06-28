// Plugin-Aktivierungs-Gate — wird seit A-pre Schritt 2 vollständig aus dem Manifest abgeleitet
// (`manifest.module.enabledPath`), nicht mehr aus einer hartcodierten Tabelle im Kern.
//
// Vor A-pre Schritt 1 flippte der Modulschalter NUR Renderer-Flags; der Main-Prozess
// aktivierte beim Start blind ALLE Plugins (`activateAll`). Das Manifest ist jetzt die
// Single-Source, gegen die beide Prozesse den Lebenszyklus fahren:
//   • Renderer: beim Umschalten → IPC `plugin:setEnabled` (activate/deactivate im Main)
//   • Main:     beim Start → `activateAll` überspringt deaktivierte Plugins (bleiben `disabled`)
//
// Plugins OHNE `manifest.module` (z.B. `demo`) haben kein Gate und bleiben immer aktiv.

import type { PluginManifest } from './manifest'

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
export function isPluginGateEnabled(manifest: PluginManifest, settings: unknown): boolean {
  const module = manifest.module
  if (!module) return true
  if (readBoolPath(settings, module.enabledPath)) return true
  // Migrations-Fallback (s. legacyEnabledPath): nur relevant, bis der Renderer die Config
  // einmal migriert + gespeichert hat.
  if (module.legacyEnabledPath && readBoolPath(settings, module.legacyEnabledPath)) return true
  return false
}
