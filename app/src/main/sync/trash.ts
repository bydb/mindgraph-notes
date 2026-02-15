import fs from 'fs/promises'
import path from 'path'

const SYNC_TRASH_DIR = '.sync-trash'

/**
 * Moves a file to .sync-trash/ instead of deleting it permanently.
 * Preserves the directory structure inside the trash folder.
 * If a file with the same name already exists, appends a timestamp suffix.
 */
export async function moveToSyncTrash(vaultPath: string, relativePath: string): Promise<void> {
  const absSource = path.join(vaultPath, relativePath)
  const trashDir = path.join(vaultPath, SYNC_TRASH_DIR)
  let trashDest = path.join(trashDir, relativePath)

  // Ensure the target directory exists
  await fs.mkdir(path.dirname(trashDest), { recursive: true })

  // Handle name collision: append date suffix
  try {
    await fs.access(trashDest)
    // File already exists in trash — append timestamp
    const ext = path.extname(relativePath)
    const base = trashDest.slice(0, -ext.length || undefined)
    const date = new Date().toISOString().split('T')[0]
    trashDest = `${base}.sync-conflict-${date}${ext}`
  } catch {
    // No collision — use original path
  }

  await fs.rename(absSource, trashDest)
}
