// Sicheres Schreiben von Binärdateien im Vault (Plugin-Capability vault.writeBytes).
import { promises as fs } from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'

/** Zeitstempel der Backup-Dateinamen (`<name>.<stempel>.bak`), auch für Markdown-Backups. */
export function backupTimestamp(date = new Date()): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')
  return [
    date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate()), '-',
    pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds()), '-',
    pad(date.getMilliseconds(), 3)
  ].join('')
}

/**
 * Binärdatei im Vault schreiben, ohne die alte Fassung zu verlieren: Unterscheidet sich der
 * vorhandene Inhalt, wandert er zuerst nach `.mindgraph/backups/` (gleiches Schema wie bei
 * Markdown). Geschrieben wird in eine versteckte Zwischendatei im Zielordner und danach
 * umbenannt — ein abgebrochener Schreibvorgang hinterlässt keine halbe Datei am Ziel.
 * Anlass: reMarkable-PDFs wurden nie ersetzt; ein Ersetzen ohne Sicherung hätte die einzige
 * alte Fassung gelöscht.
 */
export async function writeBinaryFileSafe(vaultRoot: string, target: string, bytes: Uint8Array): Promise<void> {
  const next = Buffer.from(bytes)
  await fs.mkdir(path.dirname(target), { recursive: true })

  let existing: Buffer | null = null
  try {
    existing = await fs.readFile(target)
  } catch {
    existing = null
  }
  if (existing && existing.equals(next)) return

  if (existing && existing.length > 0) {
    const now = new Date()
    const relativePath = path.relative(vaultRoot, target)
    const backupDir = path.join(vaultRoot, '.mindgraph', 'backups', now.toISOString().slice(0, 10), path.dirname(relativePath))
    await fs.mkdir(backupDir, { recursive: true })
    // Zufallsanteil + 'wx': zwei gleichzeitige Writes auf dieselbe Datei überschreiben sich
    // weder Backup noch Zwischendatei (Codex F11).
    const backupName = `${path.basename(target)}.${backupTimestamp(now)}-${randomBytes(3).toString('hex')}.bak`
    await fs.writeFile(path.join(backupDir, backupName), existing, { flag: 'wx' })
  }

  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await fs.writeFile(tmp, next, { flag: 'wx' })
    await fs.rename(tmp, target)
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}
