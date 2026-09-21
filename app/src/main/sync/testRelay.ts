/**
 * Nachgebauter Sync-Relay für Tests — NICHT Teil der App.
 *
 * Wird nur von `*.test.ts` importiert (vitest sammelt allein `*.test.ts`, electron-vite
 * bündelt nur, was von den Einstiegspunkten aus erreichbar ist). Hier liegt er, damit
 * mehrere Integrationstests denselben Server benutzen, statt ihn zu kopieren.
 */
import { WebSocketServer, type WebSocket as WsSocket } from 'ws'
import { deriveKey, encryptFile, hashContent, hashPath } from './crypto'

export const PASSPHRASE = 'test-passphrase-für-den-integrationstest'
export const VAULT_ID = 'mg-1111-2222-3333-4444'

// scrypt (N=2^17) kostet pro Aufruf spürbar Zeit. Die Produktionsparameter bleiben
// unangetastet — der Test leitet den Schlüssel nur einmal ab statt pro Datei.
let cachedKey: Buffer | null = null
export function testKey(): Buffer {
  if (!cachedKey) cachedKey = deriveKey(PASSPHRASE, VAULT_ID)
  return cachedKey
}

export interface StoredFile {
  originalPath: string
  hash: string
  size: number
  modifiedAt: number
  iv: string
  tag: string
  data: string
}

/** Minimaler Relay: register / get-manifest / upload / download / delete. */
export class FakeRelay {
  private wss: WebSocketServer
  files = new Map<string, StoredFile>() // key: hashedPath
  deleted: string[] = []
  /** Pfade (Klartext), deren Löschung der Server ablehnt — steht für Ack-Timeout/Serverfehler. */
  failDeletes = new Set<string>()

  private constructor(wss: WebSocketServer) {
    this.wss = wss
    this.wss.on('connection', ws => this.wire(ws))
  }

  /**
   * Bindet ausdrücklich an 127.0.0.1.
   *
   * `{ port: 0 }` allein lauscht auf ALLEN Schnittstellen — ein Test öffnet damit für
   * seine Laufzeit einen Port ins Netz, obwohl er ausschließlich über die Rückschleife
   * verbindet. In eingeschränkten Umgebungen (Sandkasten des Prüfers) scheitert das
   * Binden zudem mit EPERM.
   *
   * Der `error`-Fall wird mitverdrahtet: vorher wartete das Versprechen nur auf
   * `listening` und blieb bei einem Bindefehler einfach hängen — `beforeEach` lief nicht
   * zu Ende, und der Folgefehler in `afterEach` verdeckte die eigentliche Ursache.
   */
  static async start(): Promise<FakeRelay> {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
    await new Promise<void>((resolve, reject) => {
      wss.once('listening', () => resolve())
      wss.once('error', err => reject(err))
    })
    return new FakeRelay(wss)
  }

  get url(): string {
    const addr = this.wss.address()
    if (typeof addr === 'string' || addr === null) throw new Error('no port')
    return `ws://127.0.0.1:${addr.port}`
  }

  /**
   * Legt eine Datei so ab, als hätte ein anderes Gerät sie hochgeladen.
   *
   * `damaged` verfälscht den Auth-Tag: der Blob sieht im Manifest normal aus, AES-GCM
   * lehnt ihn beim Entschlüsseln aber ab. Genau dieser Zustand liegt real auf dem Server
   * (einzelne unlesbare Blobs, Ursache seit 06.08.2026 offen) und ist die Sorte Fehler,
   * die aus einer Konfliktdatei heraus den ganzen Durchlauf abgerissen hat.
   */
  seed(relativePath: string, content: string, modifiedAt = 1000, damaged = false): void {
    const key = testKey()
    const plaintext = Buffer.from(content, 'utf-8')
    const { iv, tag, ciphertext } = encryptFile(plaintext, key)
    if (damaged) tag[0] ^= 0xff
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
          if (f && this.failDeletes.has(f.originalPath)) {
            return send({ type: 'error', message: 'Delete rejected' })
          }
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
