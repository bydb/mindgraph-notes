// Regression: der Verlustpfad, der 198 Mails auf 186 gekürzt hat.
//
// Die Mailliste ist eine gemeinsame Sammlung, kein Dokument. Der Sync behandelte
// sie aber wie jede andere Datei: Bei einem Konflikt wurde die lokale Fassung als
// `.sync-conflict-*` weggesichert und die jüngere Seite übernommen. Die
// Konfliktkopie ist vom Sync ausgeschlossen und wird von niemandem mehr gelesen —
// schließt die App ohne weiteren Mail-Schreibvorgang, ist der weggesicherte Stand
// endgültig weg. Auch ein normaler Download überschrieb die Datei direkt, an der
// Sperre der Mail-Persistenz vorbei und ohne atomares Schreiben.
//
// Diese Tests fahren beides über die echte SyncEngine, OHNE einen anschließenden
// Schreibvorgang der App.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const sockets: FakeSocket[] = []

class FakeSocket extends EventEmitter {
  readyState = 1
  sent: Record<string, unknown>[] = []
  /** Wenn gesetzt, lehnt der Server jeden Upload ab. */
  failUploads = false
  /** Antwort auf eine Download-Anfrage, gesetzt vom Test. */
  fileReply: ((hashedPath: string) => Record<string, unknown> | null) | null = null

  constructor(public url: string) {
    super()
    sockets.push(this)
  }

  send(data: string): void {
    const msg = JSON.parse(data)
    this.sent.push(msg)
    if (msg.type === 'upload') {
      const antwort = this.failUploads
        ? { type: 'error', message: 'Upload abgelehnt' }
        : { type: 'ack', path: msg.path }
      setTimeout(() => this.emit('message', Buffer.from(JSON.stringify(antwort))), 0)
    }
    if (msg.type === 'download' && this.fileReply) {
      const reply = this.fileReply(msg.path as string)
      if (reply) setTimeout(() => this.emit('message', Buffer.from(JSON.stringify(reply))), 0)
    }
  }

  close(): void { this.readyState = 3; this.emit('close') }
  terminate(): void { this.readyState = 3 }
  ping(): void {}
  removeListener(event: string, fn: (...args: unknown[]) => void): this {
    return super.removeListener(event, fn) as this
  }
}

vi.mock('ws', () => {
  const Ctor = function (this: unknown, url: string) { return new FakeSocket(url) } as unknown as { new (url: string): FakeSocket; OPEN: number }
  Ctor.OPEN = 1
  return { default: Ctor }
})

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false }
}))

const { SyncEngine } = await import('./syncEngine')
const { deriveKey, encryptFile, hashPath, hashContent } = await import('./crypto')
const { EMAIL_STORE_REL_PATH } = await import('../email/store')

const KEY = deriveKey('passphrase', 'mg-test')

function mails(ids: string[]): string {
  return JSON.stringify({
    storeVersion: 2,
    emails: ids.map(id => ({ id, fetchedAt: '2026-08-10T10:00:00.000Z', date: '2026-08-10T10:00:00.000Z' })),
    lastFetchedAt: {}
  }, null, 2)
}

function idsOf(raw: string): string[] {
  return (JSON.parse(raw).emails as Array<{ id: string }>).map(e => e.id)
}

describe('SyncEngine — die Mailliste wird vereinigt, nicht ersetzt', () => {
  let vaultPath: string
  let engine: InstanceType<typeof SyncEngine>
  let socket: FakeSocket
  let absPath: string

  beforeEach(async () => {
    sockets.length = 0
    vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-email-sync-'))
    await fs.mkdir(path.join(vaultPath, '.mindgraph'), { recursive: true })
    absPath = path.join(vaultPath, EMAIL_STORE_REL_PATH)
    socket = new FakeSocket('wss://example.invalid')
    engine = new SyncEngine()
    Object.assign(engine, {
      vaultPath,
      vaultId: 'mg-test',
      key: KEY,
      ws: socket,
      registered: true,
      manifest: { files: {}, lastSyncTime: 0, vaultId: 'mg-test' }
    })
  })

  afterEach(async () => {
    await fs.rm(vaultPath, { recursive: true, force: true })
  })

  /** Der Server hält diesen Stand bereit. */
  function serverHat(raw: string): void {
    const { iv, tag, ciphertext } = encryptFile(Buffer.from(raw, 'utf-8'), KEY)
    const hashed = hashPath(EMAIL_STORE_REL_PATH)
    socket.fileReply = (p) => p === hashed
      ? { type: 'file-data', path: hashed, data: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64'), hash: hashContent(Buffer.from(raw, 'utf-8')), size: Buffer.byteLength(raw, 'utf-8') }
      : null
  }

  const manifestOf = (): Record<string, { hash: string; syncedHash?: string | null }> =>
    (engine as unknown as { manifest: { files: Record<string, { hash: string; syncedHash?: string | null }> } }).manifest.files

  const download = (): Promise<unknown> =>
    (engine as unknown as { downloadFile: (p: string) => Promise<unknown> }).downloadFile(EMAIL_STORE_REL_PATH)

  const resolve = (localManifest: unknown, remoteManifest: unknown): Promise<void> =>
    (engine as unknown as { resolveConflict: (p: string, l: unknown, r: unknown) => Promise<void> })
      .resolveConflict(EMAIL_STORE_REL_PATH, localManifest, remoteManifest)

  it('ein Download überschreibt die lokale Mailliste nicht', async () => {
    await fs.writeFile(absPath, mails(['nur-lokal', 'gemeinsam']), 'utf-8')
    serverHat(mails(['gemeinsam', 'nur-entfernt']))

    await download()

    const danach = idsOf(await fs.readFile(absPath, 'utf-8'))
    expect(danach).toContain('nur-lokal')
    expect(danach).toContain('nur-entfernt')
    expect(danach).toContain('gemeinsam')
  })

  it('lädt das vereinigte Ergebnis hoch — sonst bliebe es auf diesem Gerät', async () => {
    await fs.writeFile(absPath, mails(['nur-lokal']), 'utf-8')
    serverHat(mails(['nur-entfernt']))

    await download()

    const upload = socket.sent.find(m => m.type === 'upload')
    expect(upload).toBeTruthy()
    // Und das Manifest traegt den Hash dessen, was WIRKLICH auf der Platte liegt.
    const platte = await fs.readFile(absPath)
    expect(manifestOf()[EMAIL_STORE_REL_PATH].hash).toBe(hashContent(platte))
    expect(manifestOf()[EMAIL_STORE_REL_PATH].syncedHash).toBe(hashContent(platte))
  })

  it('der gemeldete Fall: 198 gegen 186, ohne anschließenden Schreibvorgang der App', async () => {
    const alle = Array.from({ length: 198 }, (_, i) => `mail-${i}`)
    const kuerzer = alle.slice(0, 186)

    await fs.writeFile(absPath, mails(alle), 'utf-8')
    serverHat(mails(kuerzer))

    // Der Server-Stand gilt als juenger — frueher hiess das: lokale Fassung als
    // Konfliktkopie wegsichern und die 186 uebernehmen.
    await resolve(
      { files: { [EMAIL_STORE_REL_PATH]: { hash: 'lokal', size: 1, modifiedAt: 1000, syncedAt: 0 } } },
      { files: { [EMAIL_STORE_REL_PATH]: { hash: 'entfernt', size: 1, modifiedAt: 2000, syncedAt: 0 } } }
    )

    expect(idsOf(await fs.readFile(absPath, 'utf-8'))).toHaveLength(198)
  })

  it('legt bei einem Mail-Konflikt keine Konfliktkopie an', async () => {
    await fs.writeFile(absPath, mails(['a', 'b']), 'utf-8')
    serverHat(mails(['a', 'c']))

    await resolve(
      { files: { [EMAIL_STORE_REL_PATH]: { hash: 'lokal', size: 1, modifiedAt: 1000, syncedAt: 0 } } },
      { files: { [EMAIL_STORE_REL_PATH]: { hash: 'entfernt', size: 1, modifiedAt: 2000, syncedAt: 0 } } }
    )

    const dateien = await fs.readdir(path.join(vaultPath, '.mindgraph'))
    expect(dateien.some(f => f.includes('.sync-conflict-'))).toBe(false)
    expect(idsOf(await fs.readFile(absPath, 'utf-8')).sort()).toEqual(['a', 'b', 'c'])
  })

  it('meldet einen Fehlschlag, wenn der vereinigte Stand nicht hochgeht', async () => {
    // Der vereinigte Stand liegt dann nur lokal. Als Erfolg zu melden hiesse:
    // Der Aufrufer stempelt `syncedHash` und der Lauf endet gruen, obwohl der
    // Server den Stand nie bekommen hat.
    await fs.writeFile(absPath, mails(['nur-lokal']), 'utf-8')
    serverHat(mails(['nur-entfernt']))
    socket.failUploads = true

    const ergebnis = await download()

    expect(ergebnis).toBeNull()
    // Lokal ist nichts verloren — die Vereinigung liegt auf der Platte.
    const danach = idsOf(await fs.readFile(absPath, 'utf-8'))
    expect(danach).toContain('nur-lokal')
    expect(danach).toContain('nur-entfernt')
    // Aber nichts gilt als bestaetigt.
    expect(manifestOf()[EMAIL_STORE_REL_PATH]?.syncedHash).toBeUndefined()
  })

  it('rührt eine beschädigte lokale Datei nicht an', async () => {
    await fs.writeFile(absPath, '{ kaputt', 'utf-8')
    serverHat(mails(['a']))

    const ergebnis = await download()

    expect(ergebnis).toBeNull()
    expect(await fs.readFile(absPath, 'utf-8')).toBe('{ kaputt')
  })

  it('übernimmt einen beschädigten Stand vom Server nicht', async () => {
    await fs.writeFile(absPath, mails(['a', 'b']), 'utf-8')
    serverHat('{"emails":"kaputt"}')

    const ergebnis = await download()

    expect(ergebnis).toBeNull()
    expect(idsOf(await fs.readFile(absPath, 'utf-8'))).toEqual(['a', 'b'])
  })
})
