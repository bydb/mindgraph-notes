// Ablage des Tätigkeitsprotokolls.
//
// Der Fehler, der hier leise passieren würde: Zwei Handler hängen gleichzeitig ein
// Ereignis an (Lauf-Ende und Aufgabe angelegt treffen sich real), beide lesen dieselbe
// Datei, beide schreiben zurück — der zweite überschreibt den ersten und ein Ereignis
// ist weg. Ohne serielle Warteschlange fällt das nie auf, es fehlt einfach etwas.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

let userDataDir = ''
vi.mock('electron', () => ({ app: { getPath: () => userDataDir } }))

import { appendActivityEvent, readActivitySummary } from './activityLedger'
import type { ActivityEvent } from '../shared/activityLog'

const VAULT = '/tmp/ein-vault'
const NOW = Date.now()

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-activity-'))
})

afterEach(async () => {
  await fs.rm(userDataDir, { recursive: true, force: true })
})

function ledgerFiles(): Promise<string[]> {
  return fs.readdir(path.join(userDataDir, 'activity')).catch(() => [])
}

describe('appendActivityEvent', () => {
  it('verliert bei gleichzeitigen Schreibvorgängen kein Ereignis', async () => {
    const events: ActivityEvent[] = Array.from({ length: 25 }, (_, i) => ({
      at: NOW,
      kind: 'task-created' as const,
      count: 1 + i * 0
    }))
    // Alle gleichzeitig, ohne dazwischen zu warten — genau der reale Fall.
    await Promise.all(events.map(e => appendActivityEvent(VAULT, e)))
    const summary = await readActivitySummary(VAULT, { from: NOW - 1000, to: NOW + 1000 })
    expect(summary.tasksCreated).toBe(25)
  })

  it('legt je Vault eine eigene Datei an, ohne den Pfad preiszugeben', async () => {
    await appendActivityEvent(VAULT, { at: NOW, kind: 'task-created', count: 1 })
    await appendActivityEvent('/tmp/anderer-vault', { at: NOW, kind: 'task-created', count: 4 })
    const files = await ledgerFiles()
    expect(files).toHaveLength(2)
    for (const name of files) {
      expect(name).toMatch(/^[0-9a-f]{16}\.json$/)
      expect(name).not.toContain('vault')
    }
    const summary = await readActivitySummary(VAULT, { from: NOW - 1000, to: NOW + 1000 })
    expect(summary.tasksCreated).toBe(1)
  })

  it('liegt außerhalb des Vaults', async () => {
    await appendActivityEvent(VAULT, { at: NOW, kind: 'task-created', count: 1 })
    const files = await ledgerFiles()
    expect(files).toHaveLength(1)
    expect(path.join(userDataDir, 'activity')).not.toContain(VAULT)
  })

  it('überlebt eine beschädigte Datei, statt die Historie zu verlieren', async () => {
    await appendActivityEvent(VAULT, { at: NOW, kind: 'task-created', count: 2 })
    const dir = path.join(userDataDir, 'activity')
    const [file] = await ledgerFiles()
    const full = path.join(dir, file)
    const parsed = JSON.parse(await fs.readFile(full, 'utf-8'))
    // Eine kaputte Zeile dazwischen — etwa von Hand geändert oder halb geschrieben.
    parsed.push({ kind: 'task-created' })
    await fs.writeFile(full, JSON.stringify(parsed), 'utf-8')

    await appendActivityEvent(VAULT, { at: NOW, kind: 'task-created', count: 3 })
    const summary = await readActivitySummary(VAULT, { from: NOW - 1000, to: NOW + 1000 })
    // Der gültige Altbestand bleibt, die kaputte Zeile fällt weg.
    expect(summary.tasksCreated).toBe(5)
  })

  it('räumt Einträge älter als 90 Tage beim nächsten Schreiben weg', async () => {
    await appendActivityEvent(VAULT, { at: NOW - 95 * 86_400_000, kind: 'task-created', count: 7 })
    await appendActivityEvent(VAULT, { at: NOW, kind: 'task-created', count: 1 })
    const [file] = await ledgerFiles()
    const parsed = JSON.parse(await fs.readFile(path.join(userDataDir, 'activity', file), 'utf-8'))
    expect(parsed).toHaveLength(1)
  })

  it('meldet für einen unbekannten Vault eine leere Bilanz statt zu scheitern', async () => {
    const summary = await readActivitySummary('/tmp/nie-benutzt')
    expect(summary.tasksCreated).toBe(0)
    expect(summary.acceptedRuns).toEqual([])
  })
})
