// Regression: der Datenverlust, der abgehakte Aufgaben zurückgesetzt hat.
//
// pushFile lädt eine Datei hoch und wartet bis zu 30 Sekunden auf die Bestätigung
// des Servers. Vorher las es die Datei DANACH ein zweites Mal und trug diesen Stand
// als „synchronisiert" ins Manifest ein. Wer in diesen Sekunden weiterschrieb — beim
// Abhaken mehrerer Aufgaben ist das der Normalfall —, dessen neuer Stand galt damit als
// bestätigt, obwohl der Server ihn nie bekommen hatte. diffManifests sah anschließend
// „lokal unverändert" und schob den älteren Server-Stand still darüber: ohne Backup,
// ohne Konfliktkopie. Real passiert am 09.06.2026 (7 erledigte Aufgaben wieder offen).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const sockets: FakeSocket[] = []

class FakeSocket extends EventEmitter {
  readyState = 1 // OPEN
  sent: Record<string, unknown>[] = []

  constructor(public url: string) {
    super()
    sockets.push(this)
  }

  /** Wenn gesetzt, beantwortet der Server jeden Upload mit einem Fehler. */
  failUploads = false

  send(data: string): void {
    const msg = JSON.parse(data)
    this.sent.push(msg)
    // Verzögert antworten: waitForAck hängt seinen Listener erst NACH dem send an.
    if (this.failUploads && msg.type === 'upload') {
      setTimeout(() => this.emit('message', Buffer.from(JSON.stringify({ type: 'error', message: 'Upload abgelehnt' }))), 0)
    }
  }

  close(): void {
    this.readyState = 3
    this.emit('close')
  }

  terminate(): void {
    this.readyState = 3
  }

  ping(): void {}

  removeListener(event: string, fn: (...args: unknown[]) => void): this {
    return super.removeListener(event, fn) as this
  }

  /** Server bestätigt den zuletzt gesendeten Upload. */
  ackLastUpload(): void {
    const lastUpload = [...this.sent].reverse().find(m => m.type === 'upload')
    this.emit('message', Buffer.from(JSON.stringify({ type: 'ack', path: lastUpload!.path })))
  }
}

vi.mock('ws', () => {
  const Ctor = function (this: unknown, url: string) {
    return new FakeSocket(url)
  } as unknown as { new (url: string): FakeSocket; OPEN: number }
  Ctor.OPEN = 1
  return { default: Ctor }
})

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false }
}))

const { SyncEngine } = await import('./syncEngine')
const { diffManifests } = await import('./fileTracker')
const { hashContent, deriveKey } = await import('./crypto')

describe('SyncEngine.pushFile — bestätigt wird nur, was wirklich hochging', () => {
  let vaultPath: string
  let engine: InstanceType<typeof SyncEngine>
  let socket: FakeSocket

  beforeEach(async () => {
    sockets.length = 0
    vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-push-'))
    socket = new FakeSocket('wss://example.invalid')
    engine = new SyncEngine()
    // Interner Zustand statt connect(): der Test zielt allein auf pushFile.
    Object.assign(engine, {
      vaultPath,
      vaultId: 'mg-test',
      key: deriveKey('passphrase', 'mg-test'),
      ws: socket,
      registered: true,
      manifest: { files: {}, lastSyncTime: 0, vaultId: 'mg-test' }
    })
  })

  afterEach(async () => {
    await fs.rm(vaultPath, { recursive: true, force: true })
  })

  const manifestOf = (): Record<string, { hash: string; syncedHash?: string | null; syncedAt: number | null; size: number; modifiedAt: number }> =>
    (engine as unknown as { manifest: { files: Record<string, { hash: string; syncedHash?: string | null; syncedAt: number | null; size: number; modifiedAt: number }> } }).manifest.files

  it('stempelt NICHT den Stand, der während des Wartens auf das Ack entstanden ist', async () => {
    const notePath = path.join(vaultPath, 'journal.md')
    await fs.writeFile(notePath, '- [ ] Aufgabe\n', 'utf-8')

    const push = engine.pushFile('journal.md')
    // Warten, bis der Upload rausgegangen ist (uploadFile hat gelesen und wartet aufs Ack).
    await vi.waitFor(() => expect(socket.sent.some(m => m.type === 'upload')).toBe(true))

    // Genau jetzt hakt der Nutzer die Aufgabe ab — der Server kennt diesen Stand nicht.
    await fs.writeFile(notePath, '- [x] Aufgabe\n', 'utf-8')

    socket.ackLastUpload()
    await push

    const entry = manifestOf()['journal.md']
    expect(entry.syncedHash).toBe(hashContent(Buffer.from('- [ ] Aufgabe\n')))
    expect(entry.syncedHash).not.toBe(hashContent(Buffer.from('- [x] Aufgabe\n')))
  })

  it('der abgehakte Stand geht beim nächsten Diff hoch — er wird NICHT still überschrieben', async () => {
    const notePath = path.join(vaultPath, 'journal.md')
    const alt = '- [ ] Aufgabe\n'
    const neu = '- [x] Aufgabe\n'
    await fs.writeFile(notePath, alt, 'utf-8')

    const push = engine.pushFile('journal.md')
    await vi.waitFor(() => expect(socket.sent.some(m => m.type === 'upload')).toBe(true))
    await fs.writeFile(notePath, neu, 'utf-8')
    socket.ackLastUpload()
    await push

    const gespeichert = manifestOf()['journal.md']
    // So sieht der nächste Sync-Lauf aus: buildManifest liest den NEUEN Platteninhalt,
    // syncedAt/syncedHash kommen aus dem gespeicherten Manifest.
    const lokal = {
      files: {
        'journal.md': {
          hash: hashContent(Buffer.from(neu)),
          size: neu.length,
          // Bewusst älter als syncedAt — genau die Konstellation, in der die alte
          // Zeitstempel-Regel "lokal unverändert" sagte.
          modifiedAt: gespeichert.syncedAt! - 1000,
          syncedAt: gespeichert.syncedAt,
          syncedHash: gespeichert.syncedHash
        }
      },
      lastSyncTime: 0,
      vaultId: 'mg-test'
    }
    const server = {
      files: {
        'journal.md': { hash: hashContent(Buffer.from(alt)), size: alt.length, modifiedAt: 1, syncedAt: null }
      },
      lastSyncTime: 0,
      vaultId: 'mg-test'
    }

    const diff = diffManifests(lokal, server)
    expect(diff.toUpload).toEqual(['journal.md'])
    expect(diff.toDownload).toEqual([])
  })

  // Vormerken allein reicht nicht: wurde die Liste erst nach einem VOLLEN Sync
  // abgearbeitet, zeigte das andere Gerät bis zum nächsten Auto-Sync (Minuten) den
  // alten Stand. Der zweite Stand muss direkt nach dem laufenden Push rausgehen.
  it('holt den zweiten Stand direkt nach dem laufenden Push nach — ohne vollen Sync', async () => {
    const notePath = path.join(vaultPath, 'journal.md')
    await fs.writeFile(notePath, '- [ ] Aufgabe\n', 'utf-8')

    const ersterPush = engine.pushFile('journal.md')
    await vi.waitFor(() => expect(socket.sent.filter(m => m.type === 'upload')).toHaveLength(1))

    // Während der erste Upload noch auf sein Ack wartet: abhaken + zweites Watcher-Event.
    await fs.writeFile(notePath, '- [x] Aufgabe\n', 'utf-8')
    const zweiterPush = engine.pushFile('journal.md')
    expect([...(engine as unknown as { pendingPushes: Set<string> }).pendingPushes]).toEqual(['journal.md'])

    socket.ackLastUpload()
    await zweiterPush
    // Der Nachzügler geht raus, sobald der erste Push durch ist — dessen Ack quittieren.
    await vi.waitFor(() => expect(socket.sent.filter(m => m.type === 'upload')).toHaveLength(2))
    socket.ackLastUpload()
    await ersterPush

    expect(manifestOf()['journal.md'].syncedHash).toBe(hashContent(Buffer.from('- [x] Aufgabe\n')))
    expect((engine as unknown as { pendingPushes: Set<string> }).pendingPushes.size).toBe(0)
  })

  // Sieben Häkchen in wenigen Sekunden sind der reale Fall — nicht zwei. Der Drain
  // arbeitete nur EINE Momentaufnahme ab: Stand 3, der während des nachgezogenen
  // Uploads von Stand 2 entstand, blieb wegen der Reentranz-Sperre bis zum nächsten
  // Voll-Sync liegen. Das andere Gerät zeigte solange einen veralteten Stand.
  it('zieht auch den DRITTEN schnellen Stand nach, nicht nur den zweiten', async () => {
    const notePath = path.join(vaultPath, 'journal.md')
    const staende = ['- [ ] a\n- [ ] b\n', '- [x] a\n- [ ] b\n', '- [x] a\n- [x] b\n']
    await fs.writeFile(notePath, staende[0], 'utf-8')

    const ersterPush = engine.pushFile('journal.md')
    await vi.waitFor(() => expect(socket.sent.filter(m => m.type === 'upload')).toHaveLength(1))

    // Stand 2 entsteht, während Stand 1 noch auf sein Ack wartet.
    await fs.writeFile(notePath, staende[1], 'utf-8')
    await engine.pushFile('journal.md')

    socket.ackLastUpload()
    await vi.waitFor(() => expect(socket.sent.filter(m => m.type === 'upload')).toHaveLength(2))

    // Stand 3 entsteht, während der nachgezogene Upload von Stand 2 läuft.
    await fs.writeFile(notePath, staende[2], 'utf-8')
    await engine.pushFile('journal.md')

    socket.ackLastUpload()
    await vi.waitFor(() => expect(socket.sent.filter(m => m.type === 'upload')).toHaveLength(3))
    socket.ackLastUpload()
    await ersterPush

    expect(manifestOf()['journal.md'].syncedHash).toBe(hashContent(Buffer.from(staende[2])))
    expect((engine as unknown as { pendingPushes: Set<string> }).pendingPushes.size).toBe(0)
  })

  it('ein dauerhaft scheiternder Upload bleibt vorgemerkt, ohne den Drain endlos kreisen zu lassen', async () => {
    await fs.writeFile(path.join(vaultPath, 'kaputt.md'), 'inhalt\n', 'utf-8')
    socket.failUploads = true

    await engine.pushFile('kaputt.md')

    // Genau EIN Versuch in diesem Durchlauf — der Pfad bleibt für später vorgemerkt.
    expect(socket.sent.filter(m => m.type === 'upload')).toHaveLength(1)
    expect([...(engine as unknown as { pendingPushes: Set<string> }).pendingPushes]).toEqual(['kaputt.md'])
    expect((engine as unknown as { draining: boolean }).draining).toBe(false)
  })

  it('während eines laufenden Syncs wird die Änderung vorgemerkt, nicht verworfen', async () => {
    await fs.writeFile(path.join(vaultPath, 'notiz.md'), 'inhalt\n', 'utf-8')
    Object.assign(engine, { syncing: true })

    await engine.pushFile('notiz.md')

    expect(socket.sent.some(m => m.type === 'upload')).toBe(false)
    const pending = (engine as unknown as { pendingPushes: Set<string> }).pendingPushes
    expect([...pending]).toEqual(['notiz.md'])
  })
})
