// Disk-Layout des Plugin-Stores (A1). Rein, ohne I/O. Wurzel = `userData/plugins` (vom Aufrufer).
import { join } from 'node:path'

export interface PluginPaths {
  root: string
  /** Installierte Versionen: store/<id>/<version>/ */
  storeDir: string
  /** Verifikations-Quarantäne (vollständige, re-verifizierbare Verzeichnisse). */
  quarantineRoot: string
  /** Atomar geschriebener Aktivierungsindex (id → aktive Version), AUSSERHALB der Versionsordner. */
  activeIndexPath: string
}

export function pluginPaths(pluginsRoot: string): PluginPaths {
  return {
    root: pluginsRoot,
    storeDir: join(pluginsRoot, 'store'),
    quarantineRoot: join(pluginsRoot, '.quarantine'),
    activeIndexPath: join(pluginsRoot, 'active.json'),
  }
}

export function versionDir(paths: PluginPaths, id: string, version: string): string {
  return join(paths.storeDir, id, version)
}
