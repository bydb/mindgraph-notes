// Entfernt alle Module unterhalb eines Verzeichnisses aus Nodes require-Cache (A1).
//
// Disk-Plugins werden via require()/createRequire geladen (discover.ts loadEntry). Node cached
// Module prozessweit nach aufgelöstem Dateipfad. Wird ein Plugin deinstalliert und danach unter
// DEMSELBEN Pfad (gleiche id@version) neu installiert — oder eine Version nach Deaktivierung erneut
// aktiviert —, lieferte require() sonst den ALTEN, gecachten Modulinhalt. Vor jedem Laden (und beim
// Uninstall) den betroffenen Cache-Teilbaum leeren erzwingt frisches Einlesen von der Platte.
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { join, sep } from 'node:path'

/**
 * Löscht alle require-Cache-Einträge für `dir` selbst und alles darunter. `createRequire` teilt
 * sich prozessweit `Module._cache`; der Basispfad beeinflusst nur die relative Auflösung, nicht
 * die Cache-Identität. Defensiv: fehlt `.cache` (Randfall), passiert nichts.
 *
 * WICHTIG: Nodes Cache-Keys sind REALE (symlink-aufgelöste) Pfade — z.B. macOS `/var/…` → `/private/
 * var/…`. Darum sowohl gegen `dir` als auch (falls noch vorhanden) dessen realpath matchen, sonst
 * greift der Präfixvergleich nicht. Idealerweise VOR dem Löschen des Verzeichnisses aufrufen.
 */
export function purgeRequireCacheUnder(dir: string): void {
  const cache = createRequire(join(dir, '__purge.cjs')).cache
  if (!cache) return
  const targets = new Set<string>([dir])
  try {
    targets.add(realpathSync(dir))
  } catch {
    /* dir evtl. schon gelöscht — dann nur gegen den literalen Pfad matchen */
  }
  for (const key of Object.keys(cache)) {
    for (const t of targets) {
      const prefix = t.endsWith(sep) ? t : t + sep
      if (key === t || key.startsWith(prefix)) {
        delete cache[key]
        break
      }
    }
  }
}
