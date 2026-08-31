/**
 * Stabile Kennung dieser Installation.
 *
 * Liegt in `userData` und wird deshalb NICHT mit dem Vault synchronisiert —
 * genau das ist der Zweck: Zwei Installationen am selben Sync-Vault müssen
 * unterscheidbar sein, damit jede ihren eigenen Abruf-Merker führen kann.
 *
 * Nebenwirkung, die so gewollt ist: Dev-App und installierte App haben
 * getrennte `userData` und gelten damit als zwei Geräte. Sie schreiben auch
 * wirklich unabhängig voneinander in denselben Vault.
 */

import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

let cached: string | null = null

export async function getDeviceId(): Promise<string> {
  if (cached) return cached
  const file = path.join(app.getPath('userData'), 'device-id')
  try {
    const existing = (await fs.readFile(file, 'utf-8')).trim()
    if (existing) {
      cached = existing
      return existing
    }
  } catch { /* noch keine Kennung */ }

  const id = randomUUID()
  try {
    await fs.writeFile(file, id, 'utf-8')
  } catch (error) {
    // Schreibfehler darf den Mail-Abruf nicht verhindern. Die Kennung bleibt
    // dann nur fuer diese Sitzung gueltig — schlechter als persistent, aber
    // immer noch besser als ein gemeinsamer Merker fuer alle Geraete.
    console.error('[DeviceId] Kennung konnte nicht gespeichert werden:', error)
  }
  cached = id
  return id
}
