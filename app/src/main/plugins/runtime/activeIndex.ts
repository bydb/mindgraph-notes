// Aktivierungsindex (id → aktive Version). Atomar geschrieben (temp + rename). Kaputter/fehlender
// Index = leer (nichts aktiv) — fail-closed, blockiert den App-Start nie.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'

export interface ActiveIndex {
  formatVersion: 1
  active: Record<string, string>
}

export function readActiveIndex(path: string): ActiveIndex {
  if (!existsSync(path)) return { formatVersion: 1, active: {} }
  try {
    const v = JSON.parse(readFileSync(path, 'utf8')) as { formatVersion?: unknown; active?: unknown }
    if (v.formatVersion === 1 && v.active && typeof v.active === 'object' && !Array.isArray(v.active)) {
      const active: Record<string, string> = {}
      for (const [id, version] of Object.entries(v.active as Record<string, unknown>)) {
        if (typeof version === 'string') active[id] = version
      }
      return { formatVersion: 1, active }
    }
  } catch {
    /* defensiv: kaputter Index → leer */
  }
  return { formatVersion: 1, active: {} }
}

export function writeActiveIndexAtomic(path: string, index: ActiveIndex): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${randomBytes(8).toString('hex')}`
  writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n')
  renameSync(tmp, path)
}
