import fs from 'fs/promises'
import path from 'path'

/**
 * Löschen mit Rückweg.
 *
 * Anlass (13.08.2026, real): Ein per „Ordner löschen" entfernter Ordner mit 376
 * Dateien war spurlos weg — `fs.rm` kennt kein Zurück. Ausgerechnet die Löschung,
 * die anschließend über den Sync auf ALLE Geräte durchschlägt, war damit die
 * einzige unwiderrufliche; eine vom Server kommende Löschung landet seit jeher
 * im Vault-Papierkorb (`.sync-trash`, siehe sync/trash.ts) und ist rückholbar.
 *
 * Deshalb: erst der Papierkorb des Betriebssystems (dort sucht der Nutzer, und
 * die Datei verlässt den Vault sauber), bei Fehlschlag der Vault-Papierkorb.
 * Schlägt beides fehl, wird NICHT hart gelöscht, sondern der Fehler gemeldet —
 * ein stiller Rückfall auf `fs.rm` würde genau die Lücke wieder aufreißen.
 */

export const VAULT_TRASH_DIR = '.sync-trash'

export type TrashDestination = 'os-trash' | 'vault-trash'

/** Injizierbar, damit Tests ohne Electron-Shell laufen. */
export type TrashItemFn = (fullPath: string) => Promise<void>

function timestampSuffix(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

/**
 * Freien Zielnamen im Papierkorb finden. Ein bereits belegter Name wird um einen
 * Zeitstempel ergänzt, ein weiterhin belegter zusätzlich um einen Zähler — sonst
 * überschreibt die zweite Löschung desselben Namens die erste still (`fs.rename`
 * fragt nicht nach), und der Papierkorb verliert genau das, wofür es ihn gibt.
 */
async function findFreeDestination(preferred: string, now: Date): Promise<string> {
  const exists = async (p: string): Promise<boolean> => {
    try {
      await fs.access(p)
      return true
    } catch {
      return false
    }
  }

  if (!(await exists(preferred))) return preferred

  const ext = path.extname(preferred)
  const base = ext ? preferred.slice(0, -ext.length) : preferred
  const stamped = `${base}.trashed-${timestampSuffix(now)}${ext}`
  if (!(await exists(stamped))) return stamped

  for (let counter = 2; counter < 1000; counter++) {
    const candidate = `${base}.trashed-${timestampSuffix(now)}-${counter}${ext}`
    if (!(await exists(candidate))) return candidate
  }

  throw new Error(`Kein freier Name im Papierkorb für ${path.basename(preferred)}`)
}

/**
 * Verschiebt eine Datei oder einen Ordner in `<vault>/.sync-trash/` und behält
 * dabei die Ordnerstruktur bei. Gibt den Zielpfad zurück.
 *
 * `.sync-trash` ist vom Sync ausgenommen (fileTracker `EXCLUDE_PATTERNS`), der
 * Papierkorb wandert also nicht auf andere Geräte.
 */
export async function moveIntoVaultTrash(
  vaultPath: string,
  relativePath: string,
  now: Date = new Date()
): Promise<string> {
  const source = path.join(vaultPath, relativePath)
  const preferred = path.join(vaultPath, VAULT_TRASH_DIR, relativePath)

  await fs.mkdir(path.dirname(preferred), { recursive: true })
  const destination = await findFreeDestination(preferred, now)
  await fs.rename(source, destination)
  return destination
}

/**
 * Löscht mit Rückweg: OS-Papierkorb, ersatzweise Vault-Papierkorb.
 *
 * @param vaultRoot  Vault, in dem der Pfad liegt (für den Ersatzweg). `null`,
 *                   wenn unbekannt — dann gibt es nur den OS-Papierkorb.
 */
export async function trashPath(params: {
  absPath: string
  vaultRoot: string | null
  trashItem: TrashItemFn
  now?: Date
}): Promise<TrashDestination> {
  const { absPath, vaultRoot, trashItem, now } = params

  try {
    await trashItem(absPath)
    return 'os-trash'
  } catch (osError) {
    if (!vaultRoot) throw osError

    const relativePath = path.relative(vaultRoot, absPath)
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw osError
    }

    try {
      await moveIntoVaultTrash(vaultRoot, relativePath, now)
      return 'vault-trash'
    } catch (vaultError) {
      const osMsg = osError instanceof Error ? osError.message : String(osError)
      const vaultMsg = vaultError instanceof Error ? vaultError.message : String(vaultError)
      throw new Error(
        `Löschen abgebrochen — weder Papierkorb noch ${VAULT_TRASH_DIR} erreichbar ` +
          `(Papierkorb: ${osMsg}; ${VAULT_TRASH_DIR}: ${vaultMsg}). Nichts wurde gelöscht.`
      )
    }
  }
}
