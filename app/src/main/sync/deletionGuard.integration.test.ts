/**
 * Integrationstest der Löschbremse im ECHTEN sync()-Ablauf.
 *
 * Die Unit-Tests in fileTracker.test.ts prüfen die Rechnung (assessDeletions).
 * Hier geht es um die Verdrahtung: Werden die richtigen Hash-Quellen übergeben
 * (Uploads bei Server-Löschungen, Downloads bei lokalen)? Verhindert ein Block
 * die Löschung wirklich? Läuft eine erkannte Umbenennung sauber durch?
 *
 * Echtes Dateisystem (Temp-Vault), echte Krypto, echter Diff — nur der Relay ist
 * nachgebaut. Produktivserver und echter Vault werden nicht berührt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebSocketServer, type WebSocket as WsSocket } from 'ws'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { deriveKey, encryptFile, hashContent, hashPath } from './crypto'
import { saveManifest, type FileManifest } from './fileTracker'

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false }
}))

const { SyncEngine } = await import('./syncEngine')

const PASSPHRASE = 'test-passphrase-für-den-integrationstest'
const VAULT_ID = 'mg-1111-2222-3333-4444'

// scrypt (N=2^17) kostet pro Aufruf spürbar Zeit. Die Produktionsparameter bleiben
// unangetastet — der Test leitet den Schlüssel nur einmal ab statt pro Datei.
let cachedKey: Buffer | null = null
function testKey(): Buffer {
  if (!cachedKey) cachedKey = deriveKey(PASSPHRASE, VAULT_ID)
  return cachedKey
}

interface StoredFile {
  originalPath: string
  hash: string
  size: number
  modifiedAt: number
  iv: string
  tag: string
  data: string
}

/** Minimaler Relay: register / get-manifest / upload / download / delete. */
class FakeRelay {
  private wss: WebSocketServer
  files = new Map<string, StoredFile>() // key: hashedPath
  deleted: string[] = []

  private constructor(wss: WebSocketServer) {
    this.wss = wss
    this.wss.on('connection', ws => this.wire(ws))
  }

  static async start(): Promise<FakeRelay> {
    const wss = new WebSocketServer({ port: 0 })
    await new Promise<void>(resolve => wss.once('listening', () => resolve()))
    return new FakeRelay(wss)
  }

  get url(): string {
    const addr = this.wss.address()
    if (typeof addr === 'string' || addr === null) throw new Error('no port')
    return `ws://127.0.0.1:${addr.port}`
  }

  /** Legt eine Datei so ab, als hätte ein anderes Gerät sie hochgeladen. */
  seed(relativePath: string, content: string, modifiedAt = 1000): void {
    const key = testKey()
    const plaintext = Buffer.from(content, 'utf-8')
    const { iv, tag, ciphertext } = encryptFile(plaintext, key)
    this.files.set(hashPath(relativePath), {
      originalPath: relativePath,
      hash: hashContent(plaintext),
      size: plaintext.length,
      modifiedAt,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: ciphertext.toString('base64')
    })
  }

  paths(): string[] {
    return [...this.files.values()].map(f => f.originalPath).sort()
  }

  private wire(ws: WsSocket): void {
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString())
      const send = (o: unknown): void => ws.send(JSON.stringify(o))

      switch (msg.type) {
        case 'register':
          send({ type: 'registered', vaultId: msg.vaultId })
          break
        case 'get-manifest': {
          const files: Record<string, { hash: string; size: number; modifiedAt: number }> = {}
          for (const f of this.files.values()) {
            files[f.originalPath] = { hash: f.hash, size: f.size, modifiedAt: f.modifiedAt }
          }
          send({ type: 'manifest', files, deletedFiles: {} })
          break
        }
        case 'upload':
          this.files.set(msg.path, {
            originalPath: msg.originalPath,
            hash: msg.hash,
            size: msg.size,
            modifiedAt: msg.modifiedAt,
            iv: msg.iv,
            tag: msg.tag,
            data: msg.data
          })
          send({ type: 'ack', path: msg.path })
          break
        case 'download': {
          const f = this.files.get(msg.path)
          if (!f) return send({ type: 'error', message: 'File not found' })
          send({ type: 'file-data', path: msg.path, iv: f.iv, tag: f.tag, data: f.data, hash: f.hash, size: f.size })
          break
        }
        case 'delete': {
          const f = this.files.get(msg.path)
          if (f) this.deleted.push(f.originalPath)
          this.files.delete(msg.path)
          send({ type: 'ack', path: msg.path })
          break
        }
      }
    })
  }

  async stop(): Promise<void> {
    for (const c of this.wss.clients) c.terminate()
    await new Promise<void>(resolve => this.wss.close(() => resolve()))
  }
}

describe('Löschbremse im echten sync()-Ablauf', () => {
  let relay: FakeRelay
  let vault: string
  let engine: InstanceType<typeof SyncEngine>

  beforeEach(async () => {
    relay = await FakeRelay.start()
    vault = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-sync-test-'))
    engine = new SyncEngine()
  })

  afterEach(async () => {
    engine.disconnect()
    await relay.stop()
    await fs.rm(vault, { recursive: true, force: true })
  })

  /** Schreibt eine Notiz in den Temp-Vault. */
  async function writeNote(relativePath: string, content: string): Promise<void> {
    const abs = path.join(vault, relativePath)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf-8')
  }

  /** Manifest, das behauptet: diese Pfade waren schon einmal synchronisiert. */
  async function seedManifest(paths: string[], contentFor: (p: string) => string): Promise<void> {
    const manifest: FileManifest = { files: {}, lastSyncTime: 500, vaultId: VAULT_ID }
    for (const p of paths) {
      const plaintext = Buffer.from(contentFor(p), 'utf-8')
      manifest.files[p] = {
        hash: hashContent(plaintext),
        size: plaintext.length,
        modifiedAt: 1000,
        syncedAt: 1000
      }
    }
    await saveManifest(vault, manifest)
  }

  async function runSync(): Promise<{ success: boolean; error?: string }> {
    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    return engine.sync()
  }

  const note = (i: number): string => `notiz-${i}.md`
  const body = (p: string): string => `# ${p}\n\nInhalt von ${p}.\n`

  it('blockt 30 ersatzlos fehlende von 500 Dateien (6 %) — unter der alten Regel gelöscht', async () => {
    // Der reale Fall in klein: 49 von 7181 (0,7 %). Die alte Regel verlangte
    // Anteil > 10 % UND Anzahl >= 10 — 6 % lag darunter, die Löschung lief still
    // durch. Jetzt greift die absolute Grenze.
    const paths = Array.from({ length: 500 }, (_, i) => note(i))
    for (const p of paths) relay.seed(p, body(p))
    await seedManifest(paths, body)
    // 470 Dateien sind lokal da, 30 fehlen ersatzlos (unvollständige Vault-Kopie).
    for (const p of paths.slice(0, 470)) await writeNote(p, body(p))

    const result = await runSync()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/SAFETY/)
    expect(result.error).toMatch(/absolute count/)
    // Entscheidend: der Server hat noch ALLE Dateien.
    expect(relay.files.size).toBe(500)
    expect(relay.deleted).toEqual([])
  })

  it('lässt eine Umbenennung durch: gleicher Inhalt, neuer Pfad', async () => {
    // Exakt der reale Fall: 30 Dateien, deren Namen sich geändert haben
    // (Umlaut-Codierung beim Kopieren zwischen zwei Macs).
    const alt = Array.from({ length: 30 }, (_, i) => `alt/notiz-${i}.md`)
    const neu = Array.from({ length: 30 }, (_, i) => `neu/notiz-${i}.md`)
    const inhalt = (i: number): string => `# Notiz ${i}\n\nUnveränderter Inhalt.\n`

    for (let i = 0; i < 30; i++) relay.seed(alt[i], inhalt(i))
    await seedManifest(alt, p => inhalt(Number(p.match(/(\d+)/)![1])))
    for (let i = 0; i < 30; i++) await writeNote(neu[i], inhalt(i))

    const result = await runSync()

    expect(result.success).toBe(true)
    // Neue Pfade oben, alte weg — die Migration ist durchgelaufen.
    expect(relay.paths()).toEqual([...neu].sort())
    expect(relay.deleted.sort()).toEqual([...alt].sort())
  })

  it('lässt eine kleine, gewollte Löschung durch', async () => {
    const paths = Array.from({ length: 100 }, (_, i) => note(i))
    for (const p of paths) relay.seed(p, body(p))
    await seedManifest(paths, body)
    // 95 Dateien bleiben lokal, 5 wurden bewusst gelöscht.
    for (const p of paths.slice(0, 95)) await writeNote(p, body(p))

    const result = await runSync()

    expect(result.success).toBe(true)
    expect(relay.deleted.sort()).toEqual(paths.slice(95).sort())
    expect(relay.files.size).toBe(95)
  })

  it('blockt bei kleinem Vault schon über den Anteil (9 von 20)', async () => {
    // Vorher rutschte dieser Fall durch: Anteil 45 %, aber Anzahl < 10.
    const paths = Array.from({ length: 20 }, (_, i) => note(i))
    for (const p of paths) relay.seed(p, body(p))
    await seedManifest(paths, body)
    for (const p of paths.slice(0, 11)) await writeNote(p, body(p))

    const result = await runSync()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/share/)
    expect(relay.files.size).toBe(20)
  })
}, 30000)
