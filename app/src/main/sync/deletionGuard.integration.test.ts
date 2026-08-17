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
import { saveManifest, loadManifest, type FileManifest } from './fileTracker'

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
  /** Pfade (Klartext), deren Löschung der Server ablehnt — steht für Ack-Timeout/Serverfehler. */
  failDeletes = new Set<string>()

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

  // Realer Fall vom 17.08.2026 in klein: der Ordner wurde lokal EINMAL verschoben, lag
  // auf dem Server aber in ZWEI alten Kopien. Das Umbenennungs-Budget aus toUpload
  // deckte nur eine Kopie — die zweite blieb "unerklärt" (207 Dateien) und der Voll-Sync
  // stand zwei Tage. Jetzt entlastet der überlebende Inhalt beide Kopien.
  it('lässt eine Verschiebung durch, obwohl der Server ZWEI alte Kopien hat', async () => {
    const inhalt = (i: number): string => `# Notiz ${i}\n\nUnveränderter Inhalt.\n`
    const kopieA = Array.from({ length: 30 }, (_, i) => `100 - Projekte/Fortbildung/notiz-${i}.md`)
    const kopieB = Array.from({ length: 30 }, (_, i) => `200 - Bereich/Fortbildung/notiz-${i}.md`)
    const neu = Array.from({ length: 30 }, (_, i) => `300 - Ressourcen/KI/Fortbildung/notiz-${i}.md`)
    const nummer = (p: string): number => Number(p.match(/notiz-(\d+)/)![1])

    for (let i = 0; i < 30; i++) {
      relay.seed(kopieA[i], inhalt(i))
      relay.seed(kopieB[i], inhalt(i))
    }
    await seedManifest([...kopieA, ...kopieB], p => inhalt(nummer(p)))
    for (let i = 0; i < 30; i++) await writeNote(neu[i], inhalt(i))

    const result = await runSync()

    expect(result.success).toBe(true)
    // Beide alten Kopien sind weg, der neue Ort liegt oben — kein Inhalt verloren.
    expect(relay.paths()).toEqual([...neu].sort())
    expect(relay.deleted.sort()).toEqual([...kopieA, ...kopieB].sort())
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

  // Real am 17.08.2026: der Voll-Sync lud erfolgreich 194 Dateien hoch und starb dann in
  // der Konfliktauflösung. Weil resolveConflict nicht pro Datei abgesichert war, lief
  // saveManifest nie — lastSyncTime blieb zwei Tage stehen, die Löschungen wurden nie
  // vollzogen, und jeder Auto-Sync starb an derselben Datei. Erkennbar war es nur daran,
  // dass hochgeladene Pfade NICHT im Manifest standen.
  it('eine unlösbare Konfliktdatei reißt den Durchlauf nicht mehr ab', async () => {
    const bestaetigt = 'konflikt.md'
    // Beide Seiten haben sich seit dem bestätigten Stand geändert = echter Konflikt,
    // und der Server ist neuer → resolveConflict geht in den Download-Zweig.
    await writeNote(bestaetigt, 'lokal geändert\n')
    relay.seed(bestaetigt, 'auf dem Server geändert\n', 9_000_000_000_000, true)

    // Drumherum echte Arbeit, die nach dem Konflikt noch dran ist.
    await writeNote('neu.md', body('neu.md'))
    relay.seed('bleibt.md', body('bleibt.md'))
    await writeNote('bleibt.md', body('bleibt.md'))
    relay.seed('gelöscht.md', body('gelöscht.md'))

    const alterStand = Buffer.from('ursprünglich\n', 'utf-8')
    const manifest: FileManifest = { files: {}, lastSyncTime: 500, vaultId: VAULT_ID }
    manifest.files[bestaetigt] = {
      hash: hashContent(alterStand),
      size: alterStand.length,
      modifiedAt: 1000,
      syncedAt: 1000,
      syncedHash: hashContent(alterStand)
    }
    const geloescht = Buffer.from(body('gelöscht.md'), 'utf-8')
    manifest.files['gelöscht.md'] = {
      hash: hashContent(geloescht),
      size: geloescht.length,
      modifiedAt: 1000,
      syncedAt: 1000,
      syncedHash: hashContent(geloescht)
    }
    await saveManifest(vault, manifest)

    const result = await runSync()

    // Teilerfolg: die Konfliktdatei wird gemeldet, samt Pfad …
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/conflict\(s\) unresolved/)
    expect(result.error).toContain(bestaetigt)
    // … aber der Durchlauf ist trotzdem fertig geworden.
    expect(relay.paths()).toContain('neu.md')
    expect(relay.deleted).toEqual(['gelöscht.md'])
    const gespeichert = await loadManifest(vault)
    expect(gespeichert!.lastSyncTime).toBeGreaterThan(500)
    expect(gespeichert!.files['neu.md']?.syncedHash).toBeTruthy()
    // Die Konfliktdatei bleibt unbestätigt und kommt beim nächsten Lauf wieder.
    expect(gespeichert!.files[bestaetigt]?.syncedHash).not.toBe(gespeichert!.files[bestaetigt]?.hash)
  })

  // Review-Befund Codex, 17.08.2026: deleteRemoteFile lief ohne Schutz pro Datei. Ein
  // abgelehntes Ack (oder 30-s-Timeout) sprang genauso in das äußere catch wie vorher der
  // Konfliktfehler — Uploads verloren, Manifest nicht gespeichert, lastSyncTime steht.
  it('eine abgelehnte Server-Löschung reißt den Durchlauf nicht mehr ab', async () => {
    const bleibt = 'behalten.md'
    const weg1 = 'weg-1.md'
    const weg2 = 'weg-2.md'
    for (const p of [bleibt, weg1, weg2]) relay.seed(p, body(p))
    await seedManifest([bleibt, weg1, weg2], body)
    await writeNote(bleibt, body(bleibt))
    await writeNote('neu.md', body('neu.md'))
    relay.failDeletes.add(weg1)

    const result = await runSync()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/server delete\(s\) failed/)
    expect(result.error).toContain(weg1)
    // Die zweite Löschung und der Upload sind trotzdem durch …
    expect(relay.deleted).toEqual([weg2])
    expect(relay.paths()).toContain('neu.md')
    // … und der Lauf ist abgeschlossen, statt beim nächsten Mal wieder von vorn zu starten.
    const gespeichert = await loadManifest(vault)
    expect(gespeichert!.lastSyncTime).toBeGreaterThan(500)
    // Die gescheiterte Löschung bleibt FÄLLIG: der Eintrag wandert mit ins neue Manifest,
    // sonst wäre die Datei beim nächsten Lauf eine unbekannte Server-Datei und käme als
    // Download zurück, statt gelöscht zu werden.
    expect(gespeichert!.files[weg1]).toBeTruthy()
    expect(gespeichert!.files[weg1].syncedAt).not.toBeNull()
    expect(gespeichert!.tombstones?.[weg1]).toBeUndefined()
    expect(gespeichert!.tombstones?.[weg2]).toBeTruthy()
  })

  // Review-Befund Codex, 17.08.2026: downloadFile liefert bei Serverfehler, Timeout und
  // gerissener Integritätsprüfung `null` statt zu werfen. Als "erledigt" verbucht, meldete
  // der Lauf Erfolg und rückte lastSyncTime vor, obwohl der Konflikt offen blieb.
  it('ein Download, der nur `null` liefert, gilt nicht als gelöster Konflikt', async () => {
    const konflikt = 'konflikt-null.md'
    await writeNote(konflikt, 'lokal geändert\n')
    // Der Server nennt im Manifest eine Größe, die zum echten Blob nicht passt →
    // die Integritätsprüfung in downloadFile schlägt an und liefert null.
    relay.seed(konflikt, 'auf dem Server geändert\n', 9_000_000_000_000)
    const gespeichertesBlob = relay.files.get(hashPath(konflikt))!
    gespeichertesBlob.size = gespeichertesBlob.size + 99

    const alterStand = Buffer.from('ursprünglich\n', 'utf-8')
    const manifest: FileManifest = { files: {}, lastSyncTime: 500, vaultId: VAULT_ID }
    manifest.files[konflikt] = {
      hash: hashContent(alterStand),
      size: alterStand.length,
      modifiedAt: 1000,
      syncedAt: 1000,
      syncedHash: hashContent(alterStand)
    }
    await saveManifest(vault, manifest)

    const result = await runSync()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/conflict\(s\) unresolved/)
    expect(result.error).toContain(konflikt)
    const gespeichert = await loadManifest(vault)
    expect(gespeichert!.files[konflikt]?.syncedHash).toBe(hashContent(alterStand))
  })

  // Review-Befund Codex, 17.08.2026: Für LOKALE Löschungen darf ein Server-Hash nicht als
  // Beweis gelten, dass der Inhalt überlebt — er ist nur eine Angabe im Manifest, der Blob
  // kann unlesbar sein. Genau solche Blobs liegen auf dem Produktivserver.
  it('ein Server-Hash allein entlastet KEINE lokale Löschung', async () => {
    const original = (i: number): string => `# Notiz ${i}\n\nDer eigentliche Inhalt.\n`
    // 30 lokal vorhandene Dateien, die auf dem Server fehlen → toDeleteLocal.
    const lokalWeg = Array.from({ length: 30 }, (_, i) => `nur-lokal/notiz-${i}.md`)
    // Der Server behauptet, denselben Inhalt unter anderem Pfad zu haben. Lokal liegt dort
    // aber etwas ANDERES und Neueres — dieser Pfad geht also gleich hoch und überschreibt
    // die angeblich überlebende Kopie. Nach dem Lauf gibt es den Inhalt nirgends mehr:
    // genau der Fall, in dem eine Server-Angabe als Beleg tödlich ist.
    const ueberschrieben = Array.from({ length: 30 }, (_, i) => `wird-ersetzt/notiz-${i}.md`)

    const manifest: FileManifest = { files: {}, lastSyncTime: 500, vaultId: VAULT_ID }
    for (let i = 0; i < 30; i++) {
      await writeNote(lokalWeg[i], original(i))
      const alt = Buffer.from(original(i), 'utf-8')
      manifest.files[lokalWeg[i]] = {
        hash: hashContent(alt),
        size: alt.length,
        modifiedAt: 1000,
        syncedAt: 1000,
        syncedHash: hashContent(alt)
      }
      // Server-Stand dieses Pfades = der Inhalt, der angeblich überlebt.
      relay.seed(ueberschrieben[i], original(i), 1000)
      await writeNote(ueberschrieben[i], `# Notiz ${i}\n\nLokal komplett neu geschrieben.\n`)
      manifest.files[ueberschrieben[i]] = {
        hash: hashContent(alt),
        size: alt.length,
        modifiedAt: 1000,
        syncedAt: 1000,
        // Bestätigt ist der Server-Stand → lokal geändert, remote unverändert → Upload.
        syncedHash: hashContent(alt)
      }
    }
    await saveManifest(vault, manifest)

    const result = await runSync()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/SAFETY/)
    expect(result.error).toMatch(/local files/)
    // Entscheidend: nichts wurde lokal in den Papierkorb geschoben.
    for (const p of lokalWeg) {
      await expect(fs.access(path.join(vault, p))).resolves.toBeUndefined()
    }
  })

  // Review-Runde 2, Codex: `incoming` entsteht aus diff.toDownload, also aus einer ABSICHT —
  // zu dem Zeitpunkt ist kein Byte übertragen. Scheitert der Download später, war die
  // Entlastung gegenstandslos, die lokale Löschung lief bisher trotzdem: ein unlesbarer
  // Server-Blob verdrängte eine intakte lokale Datei (jetzt eins zu eins statt unbegrenzt).
  it('lokale Datei bleibt liegen, wenn ihr Ersatz nicht angekommen ist', async () => {
    const inhalt = 'Verschobener Inhalt, nur hier vollständig.\n'
    const alt = 'alt/notiz.md'   // lokal vorhanden, auf dem Server weg → toDeleteLocal
    const neu = 'neu/notiz.md'   // auf dem Server, soll herkommen — Blob ist beschädigt
    await writeNote(alt, inhalt)
    relay.seed(neu, inhalt, 2000, true)
    await seedManifest([alt], () => inhalt)

    const result = await runSync()

    // Der Download scheitert und wird gemeldet …
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/download\(s\) failed/)
    expect(result.error).toMatch(/replacement did not arrive/)
    // … und die einzige vollständige Kopie liegt weiter im Vault, nicht im Papierkorb.
    await expect(fs.access(path.join(vault, alt))).resolves.toBeUndefined()
    await expect(fs.access(path.join(vault, '.sync-trash', alt))).rejects.toThrow()
    // Die Löschung bleibt fällig, der Eintrag steht noch.
    const gespeichert = await loadManifest(vault)
    expect(gespeichert!.files[alt]).toBeTruthy()
  })

  // Review-Runde 2, Codex: confirmedDeletions lebte NUR auf this.manifest. buildManifest
  // kennt es nicht, und currentManifest ersetzt am Ende das ganze Manifest — verbliebene
  // Bestätigungen verschwanden also, nicht nur bei Teilerfolg. Folge: der nächste Lauf
  // sieht dieselbe Löschung als unbestätigte Massenlöschung und blockiert.
  it('bestätigte Massenlöschung bleibt über einen Teilerfolg hinweg bestätigt', async () => {
    const ordner = '400 - Archiv/alt/'
    const paths = Array.from({ length: 26 }, (_, i) => `${ordner}notiz-${i}.md`)
    for (const p of paths) relay.seed(p, body(p))
    // Alle Pfade waren synchronisiert, sind lokal weg — und die Löschung ist bestätigt.
    const manifest: FileManifest = {
      files: {},
      lastSyncTime: 500,
      vaultId: VAULT_ID,
      confirmedDeletions: { paths: {}, prefixes: { [ordner]: 1000 } }
    }
    for (const p of paths) {
      const plaintext = Buffer.from(body(p), 'utf-8')
      manifest.files[p] = {
        hash: hashContent(plaintext),
        size: plaintext.length,
        modifiedAt: 1000,
        syncedAt: 1000,
        syncedHash: hashContent(plaintext)
      }
    }
    await saveManifest(vault, manifest)
    await writeNote('bleibt.md', body('bleibt.md'))
    // Der Server lehnt JEDE dieser Löschungen ab.
    for (const p of paths) relay.failDeletes.add(p)

    const ersterLauf = await runSync()

    expect(ersterLauf.success).toBe(false)
    expect(ersterLauf.error).toMatch(/26 server delete\(s\) failed/)
    const nachLauf1 = await loadManifest(vault)
    expect(nachLauf1!.confirmedDeletions?.prefixes[ordner]).toBeTruthy()

    // Zweiter Lauf: 26 Löschungen wären ohne die Bestätigung eine Massenlöschung
    // (Schwelle 25) und müssten an der Bremse blockieren.
    const zweiterLauf = await engine.sync()

    expect(zweiterLauf.error).not.toMatch(/SAFETY/)
    expect(zweiterLauf.error).toMatch(/26 server delete\(s\) failed/)
    // Der Server hat weiterhin alles, nichts ging verloren.
    expect(relay.deleted).toEqual([])
  })

  // Das Gegengerät zum Doppelordner-Fall: dort werden 396 lokale Kopien fällig, deren
  // Inhalt lokal längst am neuen Ort liegt. Ohne Entlastung blockiert es reihenweise und
  // der Nutzer bräuchte auf JEDEM Gerät den Erzwingen-Knopf. Maßstab ist die Quelle des
  // Belegs: lokal gelesen zählt (hier), eine Server-Angabe nicht (s. Test darunter).
  it('lokale Löschung ist entlastet, wenn der Inhalt lokal woanders liegen bleibt', async () => {
    const inhalt = (i: number): string => `# Notiz ${i}\n\nGleicher Inhalt.\n`
    const alt = Array.from({ length: 30 }, (_, i) => `alter-ort/notiz-${i}.md`)
    const neu = Array.from({ length: 30 }, (_, i) => `neuer-ort/notiz-${i}.md`)

    for (let i = 0; i < 30; i++) {
      // Beide Pfade liegen lokal; nur der neue liegt auch auf dem Server.
      await writeNote(alt[i], inhalt(i))
      await writeNote(neu[i], inhalt(i))
      relay.seed(neu[i], inhalt(i))
    }
    await seedManifest([...alt, ...neu], p => inhalt(Number(p.match(/notiz-(\d+)/)![1])))

    const result = await runSync()

    expect(result.success).toBe(true)
    // Die alten Pfade sind aufgeräumt — reversibel im .sync-trash …
    for (const p of alt) {
      await expect(fs.access(path.join(vault, p))).rejects.toThrow()
      await expect(fs.access(path.join(vault, '.sync-trash', p))).resolves.toBeUndefined()
    }
    // … und der Inhalt liegt vollständig am neuen Ort.
    for (const p of neu) await expect(fs.access(path.join(vault, p))).resolves.toBeUndefined()
  })

  // Real am 17.08.2026 aufgefallen: zwei Notizen lagen auf dem Server und kamen auf dem
  // zweiten Gerät NIE an, ohne jede Meldung. Ursache war die Pfadprüfung im Download:
  // `relativePath.includes('..')` lehnte jede Datei ab, deren NAME zwei Punkte enthält.
  // Mail-Notizen erben den Betreff — endet der auf einen Punkt, heißt die Datei
  // „… am 17.04..md". Im Vault betraf das 22 Dateien: hochladbar, aber nicht herunterladbar.
  it('lädt eine Datei mit zwei Punkten im Namen herunter (kein Pfadausbruch)', async () => {
    const heikel = 'emails/2026-08-17 Termine für die Fortbildung (17.09., 18.09..md'
    relay.seed(heikel, '# Termine\n\nInhalt der Notiz.\n')

    const result = await runSync()

    expect(result.success).toBe(true)
    const geschrieben = await fs.readFile(path.join(vault, heikel), 'utf-8')
    expect(geschrieben).toContain('Inhalt der Notiz.')
  })

  it('lehnt einen echten Pfadausbruch weiter ab', async () => {
    // Ein bösartiger oder kaputter Server-Eintrag, der aus dem Vault heraus zeigt.
    const ausbruch = '../ausserhalb.md'
    relay.seed(ausbruch, 'darf nicht geschrieben werden\n')

    const result = await runSync()

    // Der Download schlägt fehl und wird gemeldet — geschrieben wird nichts.
    expect(result.error).toMatch(/download\(s\) failed/)
    await expect(fs.access(path.join(path.dirname(vault), 'ausserhalb.md'))).rejects.toThrow()
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
