// Bestätigte Löschungen müssen die Löschbremse überleben — auch über einen Neustart
// und auch dann, wenn beim Löschen gerade keine Sync-Engine läuft (Sync abgeschaltet,
// oder App frisch gestartet und `sync-restore` noch nicht durch).
//
// Ohne diesen Weg sah die Engine beim nächsten Voll-Sync nur „viele Dateien sind weg"
// und blockierte mit dem SAFETY-Fehler — die Löschung wurde nie auf den Server
// gezogen, obwohl die Oberfläche „wird beim nächsten Sync nachgezogen" versprach.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  loadManifest,
  saveManifest,
  recordConfirmedDeletions,
  isConfirmedDeletion,
  assessDeletions,
  type FileManifest
} from './fileTracker'

describe('bestätigte Löschungen auf der Platte', () => {
  let vaultPath: string

  const leeresManifest = (): FileManifest => ({ files: {}, lastSyncTime: 0, vaultId: 'mg-test' })

  beforeEach(async () => {
    vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-del-'))
  })

  afterEach(async () => {
    await fs.rm(vaultPath, { recursive: true, force: true })
  })

  it('vermerkt eine Ordnerlöschung ohne laufende Engine und überlebt den Neustart', async () => {
    await saveManifest(vaultPath, leeresManifest())

    await recordConfirmedDeletions(vaultPath, ['400 - Archiv/alt'], 'directory')

    // „Neustart": Manifest frisch von der Platte lesen.
    const nachNeustart = await loadManifest(vaultPath)
    expect(isConfirmedDeletion('400 - Archiv/alt/tief/notiz.md', nachNeustart?.confirmedDeletions)).toBe(true)
    expect(isConfirmedDeletion('300 - Anderes/notiz.md', nachNeustart?.confirmedDeletions)).toBe(false)
  })

  it('die vermerkte Löschung nimmt der Bremse den Verdacht', async () => {
    await saveManifest(vaultPath, leeresManifest())
    await recordConfirmedDeletions(vaultPath, ['400 - Archiv/alt'], 'directory')
    const geladen = await loadManifest(vaultPath)

    const geloescht = Array.from({ length: 376 }, (_, i) => `400 - Archiv/alt/n${i}.md`)
    const result = assessDeletions({
      deletions: geloescht,
      totalFiles: 7181,
      hashOf: p => `h-${p}`,
      compensatingHashes: [],
      isIntentional: p => isConfirmedDeletion(p, geladen?.confirmedDeletions)
    })

    expect(result.blocked).toBe(false)
    expect(result.intentional).toHaveLength(376)
  })

  it('einzelne Dateien werden als exakte Pfade vermerkt, nicht als Präfix', async () => {
    await saveManifest(vaultPath, leeresManifest())

    await recordConfirmedDeletions(vaultPath, ['notizen/a.md', 'notizen/b.md'], 'file')

    const m = await loadManifest(vaultPath)
    expect(isConfirmedDeletion('notizen/a.md', m?.confirmedDeletions)).toBe(true)
    // Ein exakter Pfad darf NICHT den ganzen Ordner freigeben.
    expect(isConfirmedDeletion('notizen/c.md', m?.confirmedDeletions)).toBe(false)
    expect(m?.confirmedDeletions?.prefixes).toEqual({})
  })

  it('ohne Manifest (Vault war nie im Sync) passiert nichts — kein Manifest wird erfunden', async () => {
    await recordConfirmedDeletions(vaultPath, ['irgendwas.md'], 'file')
    expect(await loadManifest(vaultPath)).toBeNull()
  })
})
