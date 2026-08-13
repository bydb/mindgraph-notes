import { moveIntoVaultTrash } from '../fileTrash'

/**
 * Moves a file to .sync-trash/ instead of deleting it permanently.
 * Preserves the directory structure inside the trash folder.
 *
 * Eine Implementierung für beide Löschwege: Server-Löschungen (hier) und
 * eigene Löschungen im Dateibaum (`trashPath` in ../fileTrash.ts) landen im
 * selben Papierkorb mit derselben Kollisionsregel.
 */
export async function moveToSyncTrash(vaultPath: string, relativePath: string): Promise<void> {
  await moveIntoVaultTrash(vaultPath, relativePath)
}
