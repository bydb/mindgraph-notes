import fs from 'fs/promises'
import path from 'path'
import WebSocket from 'ws'
import { BrowserWindow } from 'electron'
import { generateVaultId, deriveKey, encryptFile, decryptFile, hashContent, hashPath } from './crypto'
import {
  buildManifest,
  diffManifests,
  loadManifest,
  saveManifest,
  isSyncable,
  assessDeletions,
  isConfirmedDeletion,
  addConfirmedDeletions,
  type FileManifest
} from './fileTracker'
import { moveToSyncTrash } from './trash'
import { mergeIncomingEmailStore, EMAIL_STORE_REL_PATH } from '../email/store'
import type { SyncProgress, SyncResult } from '../../shared/types'

type SyncStatus = SyncProgress['status']

const PARALLEL_UPLOADS = 5
const PARALLEL_DOWNLOADS = 5

// Uploads gehen als EINE JSON-Nachricht mit base64-Payload (×4/3) über die WS-Verbindung.
// Der Server (ws-Default maxPayload) kappt Nachrichten über 100 MiB und killt dabei die
// Verbindung — die Datei würde endlos retryt und alles dahinter in der Queue nie synced.
// 64 MB roh → ~85,4 MiB Nachricht: sichere Marge unter dem Limit.
const MAX_SYNC_FILE_SIZE = 64 * 1024 * 1024

interface ServerMessage {
  type: string
  code?: string
  files?: Record<string, { hash: string; size: number; modifiedAt: number }>
  deletedFiles?: Record<string, { deletedAt: number }>
  path?: string
  iv?: string
  tag?: string
  data?: string
  hash?: string
  size?: number
  event?: string
  message?: string
  error?: string
}

const RECONNECT_BASE_DELAY = 2000
const RECONNECT_MAX_DELAY = 60000
// Heartbeat: ping every 30s. If no pong arrives before the next tick, the socket
// is silently dead (laptop sleep / network change / NAT idle) and gets terminated
// so the close handler schedules a reconnect — instead of a sync hanging 15s into
// a "Manifest request timeout" and the status getting stuck red.
const HEARTBEAT_INTERVAL = 30000

/** Der Stand, den der Server für einen Pfad bestätigt hat — s. uploadFile/downloadFile. */
interface UploadedState {
  hash: string
  size: number
  modifiedAt: number
}

export class SyncEngine {
  private ws: WebSocket | null = null
  private key: Buffer | null = null
  private manifest: FileManifest | null = null
  private vaultPath: string = ''
  private vaultId: string = ''
  private relayUrl: string = ''
  private activationCode: string = ''
  private status: SyncStatus = 'idle'
  private syncing: boolean = false
  private destroyed: boolean = false  // SAFETY: blocks ALL file operations after disconnect
  private intentionalDisconnect: boolean = false
  private reconnectAttempts: number = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private wsAlive: boolean = true
  private excludeConfig: { folders: string[]; extensions: string[] } = { folders: [], extensions: [] }
  /** Pfade, deren Upload noch aussteht (Sync lief / Push für denselben Pfad lief / Fehler). */
  private pendingPushes: Set<string> = new Set()
  /** Pfade mit gerade laufendem Push — verhindert parallele Uploads derselben Datei. */
  private pushInFlight: Set<string> = new Set()
  /** Reentranz-Sperre für drainPendingPushes(). */
  private draining: boolean = false
  /**
   * Wird vor jedem Überschreiben durch einen Download aufgerufen (Backup).
   * Gesetzt von index.ts, wo die abgesicherte Schreibgrenze liegt.
   */
  private beforeOverwrite: ((absPath: string, nextContent: Buffer) => Promise<void>) | null = null

  setBeforeOverwrite(hook: (absPath: string, nextContent: Buffer) => Promise<void>): void {
    this.beforeOverwrite = hook
  }

  /**
   * Nimmt entgegen, dass der Nutzer diese Pfade in der App ausdrücklich zum Löschen
   * bestätigt hat. Ohne diese Meldung sah die Sync-Engine beim nächsten Lauf nur
   * „400 Dateien sind weg" und blockierte mit dem SAFETY-Fehler — die Löschung wurde
   * nie auf den Server gezogen, obwohl die App „wird nachgezogen" versprach.
   *
   * `kind: 'directory'` vermerkt ein Pfad-Präfix und deckt damit den ganzen Baum ab.
   * Löschungen außerhalb der App (Finder) melden sich hier NICHT und laufen weiterhin
   * durch die Bremse — genau dort ist sie gewollt.
   */
  async registerIntentionalDeletion(relativePaths: string[], kind: 'file' | 'directory'): Promise<void> {
    if (!this.manifest || relativePaths.length === 0) return
    addConfirmedDeletions(this.manifest, relativePaths, kind, Date.now())
    await saveManifest(this.vaultPath, this.manifest)
  }

  /**
   * Räumt verbrauchte Löschabsichten ab: exakte Pfade, sobald der Server sie bestätigt
   * hat; Präfixe, sobald unter ihnen serverseitig nichts mehr liegt. Ohne das Aufräumen
   * bliebe ein Pfad dauerhaft von der Bremse ausgenommen.
   */
  private consumeConfirmedDeletions(remoteManifest: FileManifest, deletedPaths: string[]): void {
    const confirmed = this.manifest?.confirmedDeletions
    if (!confirmed) return

    for (const p of deletedPaths) delete confirmed.paths[p]

    const verbleibend = new Set(Object.keys(remoteManifest.files))
    for (const p of deletedPaths) verbleibend.delete(p)
    for (const prefix of Object.keys(confirmed.prefixes)) {
      let nochDa = false
      for (const p of verbleibend) {
        if (p.startsWith(prefix)) { nochDa = true; break }
      }
      if (!nochDa) delete confirmed.prefixes[prefix]
    }
  }

  private sendLog(entry: { type: string; message: string; fileName?: string }): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('sync-log', entry)
    }
  }

  private sendProgress(progress: Partial<SyncProgress>): void {
    const data: SyncProgress = {
      status: this.status,
      current: 0,
      total: 0,
      ...progress
    }
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('sync-progress', data)
    }
  }

  async init(
    vaultPath: string,
    passphrase: string,
    relayUrl: string,
    activationCode: string = ''
  ): Promise<{ vaultId: string }> {
    this.vaultPath = vaultPath
    this.relayUrl = relayUrl
    this.activationCode = activationCode
    this.vaultId = generateVaultId()
    this.key = deriveKey(passphrase, this.vaultId)

    // Always start fresh for a new vault — old syncedAt values from a previous
    // vault would cause diffManifests to incorrectly delete local files
    this.manifest = {
      files: {},
      lastSyncTime: 0,
      vaultId: this.vaultId
    }

    await saveManifest(vaultPath, this.manifest)

    return { vaultId: this.vaultId }
  }

  private validateVaultId(vaultId: string): void {
    // Cap großzügig genug für die 16-Byte-IDs (mg- + 8×4 Hex + 7 Bindestriche = 42 Zeichen).
    // Ältere 8-Byte-IDs (19 Zeichen) bleiben gültig — reine Obergrenze gegen Müll-Eingaben.
    if (!vaultId || !vaultId.startsWith('mg-') || vaultId.length > 50 || vaultId.includes('://')) {
      throw new Error(`Invalid vault ID: "${vaultId.slice(0, 50)}"`)
    }
  }

  async join(
    vaultPath: string,
    vaultId: string,
    passphrase: string,
    relayUrl: string,
    activationCode: string = ''
  ): Promise<boolean> {
    this.validateVaultId(vaultId)
    this.vaultPath = vaultPath
    this.relayUrl = relayUrl
    this.activationCode = activationCode
    this.vaultId = vaultId
    this.key = deriveKey(passphrase, this.vaultId)

    const loaded = await loadManifest(vaultPath)

    if (loaded && loaded.vaultId === this.vaultId) {
      // Same vault — keep syncedAt values and tombstones (reconnecting to same vault)
      this.manifest = loaded
    } else {
      // Different vault or no manifest — start fresh to prevent stale
      // syncedAt values from causing incorrect local deletions
      if (loaded) {
        console.log(`[SyncEngine] Discarding old manifest (was ${loaded.vaultId}, now ${this.vaultId})`)
      }
      this.manifest = {
        files: {},
        lastSyncTime: 0,
        vaultId: this.vaultId
      }
    }

    await saveManifest(vaultPath, this.manifest)
    return true
  }

  private registered: boolean = false

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.registered) return

    this.intentionalDisconnect = false
    this.registered = false
    this.status = 'connecting'
    this.sendProgress({ status: 'connecting' })

    return new Promise((resolve, reject) => {
      // connect() MUSS sich in jedem Fall entscheiden. Bleibt es hängen, kehrt das
      // `await this.connect()` in sync() nie zurück → das `finally` dort läuft nie →
      // `syncing` bleibt für immer true und jeder weitere Sync antwortet nur noch mit
      // "Sync already in progress", bis die App neu gestartet wird (real aufgetreten).
      let settled = false
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null
      const settle = (err?: Error): void => {
        if (settled) return
        settled = true
        if (timeoutTimer) clearTimeout(timeoutTimer)
        if (err) reject(err)
        else resolve()
      }

      this.ws = new WebSocket(this.relayUrl)

      this.ws.on('pong', () => {
        this.wsAlive = true
      })

      this.ws.on('open', () => {
        console.log('[Sync] Connected to relay server')
        this.reconnectAttempts = 0
        // Register vault — do NOT resolve until server confirms registration
        this.wsSend({ type: 'register', vaultId: this.vaultId, ...(this.activationCode ? { activationCode: this.activationCode } : {}) })
      })

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg: ServerMessage = JSON.parse(data.toString())

          // Handle registration response BEFORE resolving connect()
          if (!this.registered) {
            if (msg.type === 'registered') {
              this.registered = true
              this.status = 'idle'
              this.startHeartbeat()
              this.sendProgress({ status: 'idle' })
              this.sendLog({ type: 'connect', message: 'Connected' })
              console.log('[Sync] Vault registered on server')
              settle()
              return
            }
            if (msg.type === 'error') {
              console.error('[Sync] Registration rejected:', msg.message || msg.code)
              this.status = 'error'
              this.sendProgress({ status: 'error', error: msg.message || 'Registration rejected' })
              // Mark as intentional so the 'close' handler below does NOT schedule a
              // reconnect — otherwise a rejected vault (e.g. invalid activation code)
              // keeps re-registering forever (zombie engine / reconnect storm).
              this.intentionalDisconnect = true
              this.ws?.close()
              settle(new Error(msg.message || msg.code || 'Registration rejected'))
              return
            }
          }

          this.handleServerMessage(msg)
        } catch (err) {
          console.error('[Sync] Failed to parse server message:', err)
        }
      })

      this.ws.on('close', () => {
        console.log('[Sync] Disconnected from relay server')
        this.stopHeartbeat()
        this.sendLog({ type: 'disconnect', message: 'Disconnected' })
        this.ws = null
        this.registered = false
        if (this.status !== 'error') {
          this.status = 'idle'
        }
        // Auto-reconnect if not intentional and engine is initialized
        if (!this.intentionalDisconnect && this.key) {
          this.scheduleReconnect()
        }
        // Verbindung ging auf und wieder zu, BEVOR die Registrierung bestätigt war:
        // hier muss connect() abgelehnt werden. Die Timeouts unten können das nicht
        // auffangen, weil dieser Handler `this.ws` bereits auf null gesetzt hat und
        // ihre `this.ws && …`-Bedingungen damit alle falsch sind.
        settle(new Error('Connection closed before registration'))
      })

      this.ws.on('error', (err) => {
        // Ein SELBST abgebrochener Verbindungsversuch meldet sich hier als Fehler: ws
        // wirft „WebSocket was closed before the connection was established", sobald der
        // Socket im Zustand CONNECTING geschlossen wird — mit close() genauso wie mit
        // terminate() (beides gemessen, terminate() ist kein Ausweg).
        //
        // Das ist eine Folge, keine Ursache. Ungefiltert landete sie über sendProgress
        // wörtlich in den Einstellungen und verdrängte den echten Grund: Der Nutzer las
        // eine Meldung über einen WebSocket, obwohl der Server schlicht nicht erreichbar
        // war oder er den Sync gerade selbst abgeschaltet hatte.
        if (this.intentionalDisconnect || (settled && !this.registered)) {
          console.log('[Sync] Verbindungsversuch beendet:', err.message)
          return
        }
        console.error('[Sync] WebSocket error:', err)
        this.status = 'error'
        this.registered = false
        this.sendProgress({
          status: 'error',
          error: err.message
        })
        settle(err)
      })

      // Timeout after 10 seconds. Letzte Instanz: entscheidet auch dann, wenn der
      // Socket weder 'open' noch 'close' noch 'error' gemeldet hat.
      timeoutTimer = setTimeout(() => {
        if (this.registered) return
        // Erst entscheiden, dann schließen: close() löst den 'close'-Handler aus, der
        // ebenfalls settle() ruft. Andersherum gewänne dessen unspezifische Begründung
        // und der eigentliche Grund (Zeitüberschreitung) ginge im Log verloren.
        const wasOpen = this.ws?.readyState === WebSocket.OPEN
        // Sichtbar melden, nicht nur ablehnen: Beim automatischen Neuverbinden gibt es
        // keinen Aufrufer, der die Ablehnung weiterreicht. Ohne diese Meldung stünde in
        // den Einstellungen gar nichts mehr — schlimmer als eine falsche Meldung, denn
        // der Sync liefe seit Stunden nicht und niemand wüsste davon.
        this.status = 'error'
        this.sendProgress({
          status: 'error',
          error: wasOpen
            ? 'Der Server antwortet nicht auf die Anmeldung (Zeitüberschreitung nach 10 Sekunden).'
            : 'Der Sync-Server ist nicht erreichbar (Zeitüberschreitung nach 10 Sekunden).'
        })
        settle(new Error(wasOpen ? 'Registration timeout' : 'Connection timeout'))
        this.ws?.close()
      }, 10000)
    })
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return

    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY
    )
    this.reconnectAttempts++

    console.log(`[Sync] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (this.intentionalDisconnect || !this.key) return

      try {
        await this.connect()
        console.log('[Sync] Reconnected successfully')
      } catch (err) {
        console.error('[Sync] Reconnect failed:', err)
        // close handler will schedule next attempt
      }
    }, delay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.wsAlive = true
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      if (!this.wsAlive) {
        // No pong since the last ping — the connection is silently dead.
        // terminate() fires the 'close' handler → scheduleReconnect (unless intentional).
        console.warn('[Sync] Heartbeat timeout — terminating dead socket')
        this.stopHeartbeat()
        this.ws.terminate()
        return
      }
      this.wsAlive = false
      try {
        this.ws.ping()
      } catch {
        // ignore — a failed ping will be caught on the next tick / by close
      }
    }, HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'notify':
        if ((msg.event === 'file-changed' || msg.event === 'file-deleted') && !this.syncing) {
          // Another client changed or deleted a file, trigger debounced sync
          this.debouncedSync()
        }
        break

      case 'error':
        // Only set error status if we're not actively syncing (sync handles its own errors)
        if (!this.syncing) {
          console.error('[Sync] Server error:', msg.message || msg.error)
          this.status = 'error'
          this.sendProgress({
            status: 'error',
            error: msg.message || msg.error
          })
        }
        break
    }
  }

  private debouncedSync(): void {
    if (this.syncing) return
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer)
    }
    this.syncDebounceTimer = setTimeout(() => {
      this.sync().catch(err => {
        console.error('[Sync] Auto-sync failed:', err)
      })
    }, 2000)
  }

  async sync(force: boolean = false): Promise<SyncResult> {
    // SAFETY: refuse to sync if engine was destroyed
    if (this.destroyed) {
      console.warn('[SyncEngine] BLOCKED: sync() called on destroyed engine')
      return { success: false, uploaded: 0, downloaded: 0, conflicts: 0, error: 'Engine destroyed' }
    }

    if (!this.key || !this.vaultPath || !this.vaultId) {
      return { success: false, uploaded: 0, downloaded: 0, conflicts: 0, error: 'Sync not initialized' }
    }

    // Prevent concurrent syncs
    if (this.syncing) {
      return { success: false, uploaded: 0, downloaded: 0, conflicts: 0, error: 'Sync already in progress' }
    }

    this.syncing = true

    try {
      // Ensure connection
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        await this.connect()
      }

      this.status = 'scanning'
      this.sendProgress({ status: 'scanning' })
      this.sendLog({ type: 'sync', message: 'Sync started' })

      // Build current local manifest
      const currentManifest = await buildManifest(this.vaultPath, this.vaultId, this.excludeConfig)

      // Merge with saved manifest to preserve syncedAt timestamps
      if (this.manifest) {
        for (const [filePath, info] of Object.entries(this.manifest.files)) {
          if (currentManifest.files[filePath]) {
            currentManifest.files[filePath].syncedAt = info.syncedAt
            // syncedHash MUSS mitwandern — ohne ihn fällt diffManifests auf den
            // Zeitstempel-Vergleich zurück und der Datenverlust-Pfad ist wieder offen.
            currentManifest.files[filePath].syncedHash = info.syncedHash ?? null
          }
        }
        currentManifest.lastSyncTime = this.manifest.lastSyncTime
      }

      // Get remote manifest
      const remoteManifest = await this.getRemoteManifest()

      // Filter out excluded files from remote manifest and saved manifest
      // so they are completely invisible to the diff algorithm
      for (const filePath of Object.keys(remoteManifest.files)) {
        if (!isSyncable(filePath, this.excludeConfig)) {
          delete remoteManifest.files[filePath]
        }
      }
      if (this.manifest) {
        for (const filePath of Object.keys(this.manifest.files)) {
          if (!isSyncable(filePath, this.excludeConfig)) {
            delete this.manifest.files[filePath]
          }
        }
      }

      // Compute diff — pass saved manifest so we can detect locally deleted files
      // Also pass server tombstones so files deleted on another device don't get re-uploaded
      const diff = diffManifests(currentManifest, remoteManifest, this.manifest || undefined, this.lastServerTombstones, MAX_SYNC_FILE_SIZE)

      // Übergroße Dateien einmal pro Engine-Lauf melden (nicht bei jedem 5-min-Auto-Sync erneut)
      for (const skippedPath of diff.skippedTooLarge) {
        if (!this.loggedTooLargePaths.has(skippedPath)) {
          this.loggedTooLargePaths.add(skippedPath)
          this.sendLog({
            type: 'error',
            message: `Skipped — file exceeds 64 MB sync limit: ${skippedPath}`,
            fileName: skippedPath
          })
        }
      }

      // SAFETY: Mass-deletion protection.
      // Umbenennungen/Verschiebungen werden vorher herausgerechnet (assessDeletions):
      // eine Löschung, deren Inhalt im selben Lauf unter anderem Pfad in die
      // Gegenrichtung geht, ist kein Verlust. Was übrig bleibt, wird an den
      // Schwellen in DELETION_GUARD gemessen — ODER-verknüpft, nicht UND.
      if (!force) {
        const localFileCount = Object.keys(currentManifest.files).length
        const remoteFileCount = Object.keys(remoteManifest.files).length

        /**
         * Inhalte, die LOKAL überleben — alles auf der Platte außer den Pfaden, die dieser
         * Lauf gerade lokal entfernt. Liegt der Inhalt einer Server-Löschung hier noch,
         * verschwindet nur ein Pfad, kein Inhalt (s. assessDeletions → contentSurvives).
         *
         * Dieselbe Menge entlastet BEIDE Löschrichtungen, und zwar aus demselben Grund:
         * Sie besteht aus Hashes, die `buildManifest` beim tatsächlichen LESEN der Dateien
         * berechnet hat. Das ist ein Beweis, dass der Inhalt vorhanden und lesbar ist.
         *
         * Was hier ausdrücklich NICHT zählt, ist die Auskunft des Servers („ich habe den
         * Inhalt noch unter einem anderen Pfad"). Ein Server-Hash ist bloß eine Angabe im
         * Manifest; ob der zugehörige Blob überhaupt entschlüsselbar ist, weiß niemand. Auf
         * genau diesem Server liegen nachweislich einzelne unlesbare Blobs (seit
         * 06.08.2026) — einer davon hätte beliebig viele intakte lokale Dateien in den
         * `.sync-trash` geschoben, mit einem „überlebenden" Inhalt, der sich nie wieder
         * herstellen lässt. Maßstab ist deshalb nicht die Richtung, sondern die Quelle:
         * selbst gelesen zählt, behauptet nicht.
         */
        const survivingLocalHashes = (): Set<string> => {
          const removed = new Set(diff.toDeleteLocal)
          const hashes = new Set<string>()
          for (const [filePath, info] of Object.entries(currentManifest.files)) {
            if (!removed.has(filePath) && info.hash) hashes.add(info.hash)
          }
          return hashes
        }

        const blockDeletions = (
          assessment: ReturnType<typeof assessDeletions>,
          scope: 'local' | 'remote',
          total: number
        ): SyncResult => {
          const { unmatched, renames, preserved, intentional, reason } = assessment
          const share = total > 0 ? Math.round((unmatched.length / total) * 100) : 0
          const notCounted: string[] = []
          if (renames.length > 0) notCounted.push(`${renames.length} rename(s)/move(s)`)
          if (preserved.length > 0) {
            notCounted.push(`${preserved.length} whose content still exists under another path`)
          }
          if (intentional.length > 0) notCounted.push(`${intentional.length} confirmed in-app deletion(s)`)
          const notCountedNote = notCounted.length > 0 ? ` Not counted: ${notCounted.join(', ')}.` : ''
          // Die Meldung muss sagen, was zu tun ist. Vorher stand nur da, was sie verweigert —
          // ein Nutzer stand damit real drei Tage vor einem stehenden Sync, weil der
          // Erzwingen-Knopf als einziger Ausweg nicht benannt war.
          const hint = scope === 'local'
            ? 'Nothing was deleted locally. This usually points to a server or connection problem — ' +
              'the remote side looked emptier than it is. Check the connection and sync again.'
            : 'This usually points to a stale local manifest or an incomplete vault copy. ' +
              'If you deleted these files on purpose, use Force Sync to let the deletion through.'
          const errorMsg =
            `SAFETY: Refusing to delete ${unmatched.length}/${total} ${scope} files (${share}%, ` +
            `triggered by ${reason === 'absolute' ? 'absolute count' : 'share'}).${notCountedNote} ${hint} ` +
            `First: ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? ', …' : ''}`
          console.error('[SyncEngine]', errorMsg)
          this.sendLog({ type: 'error', message: errorMsg })
          this.status = 'error'
          this.sendProgress({ status: 'error', error: errorMsg })
          return { success: false, uploaded: 0, downloaded: 0, conflicts: 0, error: errorMsg }
        }

        /** Was die Bremse durchgelassen hat, gehört ins Protokoll — sonst ist eine
         *  weggewinkte Löschung von einer nie erkannten nicht zu unterscheiden. */
        const logWaved = (assessment: ReturnType<typeof assessDeletions>, scope: 'local' | 'remote'): void => {
          const { renames, preserved, intentional } = assessment
          if (renames.length + preserved.length + intentional.length === 0) return
          const parts: string[] = []
          if (renames.length > 0) parts.push(`${renames.length} rename(s)/move(s)`)
          if (preserved.length > 0) parts.push(`${preserved.length} with content preserved elsewhere`)
          if (intentional.length > 0) parts.push(`${intentional.length} confirmed in-app`)
          this.sendLog({
            type: 'sync',
            message: `Deletion guard passed ${scope} deletions: ${parts.join(', ')}`
          })
        }

        if (diff.toDeleteLocal.length > 0) {
          // Gegenrichtung für lokale Löschungen: was gerade heruntergeladen wird.
          // Liste, nicht Set: jede eingehende Datei entlastet genau EINE Löschung.
          const incoming: string[] = []
          for (const p of diff.toDownload) {
            const h = remoteManifest.files[p]?.hash
            if (h) incoming.push(h)
          }
          // Auch eine lokale Löschung ist kein Inhaltsverlust, wenn derselbe Inhalt lokal
          // unter einem anderen Pfad LIEGEN BLEIBT (Dublette, verschobener Ordner). Der
          // Beleg dafür ist selbst gelesen, nicht vom Server behauptet — der Unterschied,
          // um den es bei survivingLocalHashes geht. Ohne das blockiert das Gegengerät
          // reihenweise, sobald hier ein doppelt abgelegter Ordner aufgeräumt wurde: es
          // hätte 396 „unerklärte" lokale Löschungen, deren Inhalt es längst am neuen Ort
          // hat.
          const localSurvivorsForLocal = survivingLocalHashes()
          const assessment = assessDeletions({
            deletions: diff.toDeleteLocal,
            totalFiles: localFileCount,
            hashOf: p => currentManifest.files[p]?.hash,
            compensatingHashes: incoming,
            contentSurvives: h => localSurvivorsForLocal.has(h)
          })
          if (assessment.blocked) return blockDeletions(assessment, 'local', localFileCount)
          logWaved(assessment, 'local')
        }

        if (diff.toDeleteRemote.length > 0) {
          // Gegenrichtung für Server-Löschungen: was gerade hochgeladen wird.
          // Liste, nicht Set: jede ausgehende Datei entlastet genau EINE Löschung.
          const outgoing: string[] = []
          for (const p of diff.toUpload) {
            const h = currentManifest.files[p]?.hash
            if (h) outgoing.push(h)
          }
          // Überlebende Seite ist hier die Platte — minus dem, was dieser Lauf lokal löscht.
          const localSurvivors = survivingLocalHashes()
          const assessment = assessDeletions({
            // Nur hier: Server-Löschungen gehen auf eine Aktion DIESES Geräts zurück,
            // die der Nutzer bestätigt haben kann. Bei toDeleteLocal kommt die Ansage
            // vom anderen Gerät — dort gibt es keine lokale Bestätigung, die zählt.
            isIntentional: p => isConfirmedDeletion(p, this.manifest?.confirmedDeletions),
            deletions: diff.toDeleteRemote,
            totalFiles: remoteFileCount,
            hashOf: p => remoteManifest.files[p]?.hash,
            compensatingHashes: outgoing,
            contentSurvives: h => localSurvivors.has(h)
          })
          if (assessment.blocked) return blockDeletions(assessment, 'remote', remoteFileCount)
          logWaved(assessment, 'remote')
        }
      }

      const total = diff.toUpload.length + diff.toDownload.length + diff.conflicts.length + diff.toDeleteRemote.length
      let current = 0

      // Upload files in parallel batches. Fehler pro DATEI abfangen statt den ganzen Sync
      // abzubrechen — sonst blockiert eine einzelne kaputte Datei alle dahinter in der Queue
      // und der Auto-Sync wiederholt den Komplett-Abbruch alle 5 Minuten (real passiert mit
      // dem 83-MB-Embeddings-Cache, s. MAX_SYNC_FILE_SIZE).
      const uploadFailures: string[] = []
      this.status = 'uploading'
      for (let i = 0; i < diff.toUpload.length; i += PARALLEL_UPLOADS) {
        const batch = diff.toUpload.slice(i, i + PARALLEL_UPLOADS)
        await Promise.all(batch.map(async (filePath) => {
          let uploaded: UploadedState
          try {
            uploaded = await this.uploadFile(filePath)
          } catch (err) {
            // syncedAt bleibt unangetastet → Datei wird beim nächsten Sync erneut versucht
            uploadFailures.push(filePath)
            const msg = err instanceof Error ? err.message : String(err)
            this.sendLog({ type: 'error', message: `Upload failed: ${filePath} — ${msg}`, fileName: filePath })
            return
          }
          // Bestätigt wird der HOCHGELADENE Stand, nicht der aktuelle Platteninhalt.
          // Hat der Nutzer währenddessen weitergeschrieben, weicht `hash` beim nächsten
          // Lauf von `syncedHash` ab → die Datei geht erneut hoch, statt still verloren
          // zu gehen.
          currentManifest.files[filePath] = {
            ...currentManifest.files[filePath],
            ...uploaded,
            syncedAt: Date.now(),
            syncedHash: uploaded.hash
          }
          current++
          this.sendLog({ type: 'upload', message: `Uploaded: ${filePath}`, fileName: filePath })
          this.sendProgress({
            status: 'uploading',
            current,
            total,
            fileName: filePath
          })
        }))
      }

      // Download files in parallel batches. Fehler pro DATEI abfangen — dieselbe Lehre wie
      // beim Upload oben: eine einzige nicht entschlüsselbare Datei riss sonst den ganzen
      // Durchlauf ab (Promise.all → äußeres catch). Folge war nicht nur "eine Datei fehlt",
      // sondern: Manifest wurde nie gespeichert, lastSyncTime nie gesetzt ("Nie
      // synchronisiert" trotz Hunderter Downloads) und jeder Auto-Sync starb alle 5 Minuten
      // an derselben Stelle. Real aufgetreten beim Multi-Device-Join eines großen Vaults.
      const downloadFailures: string[] = []
      /**
       * Inhalts-Hashes, die dieser Lauf holen WOLLTE, aber nicht bekommen hat.
       *
       * Die Löschbremse entlastet eine lokale Löschung, wenn derselbe Inhalt im selben Lauf
       * unter einem anderen Pfad hereinkommt (Verschiebung). Diese Rechnung entsteht aus
       * `diff.toDownload`, also aus einer ABSICHT — zu diesem Zeitpunkt ist kein Byte
       * übertragen. Kommt der Download dann nicht an (beschädigter Blob, Timeout,
       * Integritätsbruch), war die Entlastung gegenstandslos, die lokale Löschung lief
       * bisher trotzdem: ein unlesbarer Server-Blob verdrängte eine intakte lokale Datei.
       *
       * Bewusst ein Set und keine Mengenbilanz: hier wird nicht kompensiert, sondern
       * gebremst. Im Zweifel bleibt die lokale Datei liegen.
       */
      const nichtAngekommeneHashes = new Set<string>()
      this.status = 'downloading'
      for (let i = 0; i < diff.toDownload.length; i += PARALLEL_DOWNLOADS) {
        if (this.destroyed) break  // SAFETY: stop immediately
        const batch = diff.toDownload.slice(i, i + PARALLEL_DOWNLOADS)
        await Promise.all(batch.map(async (filePath) => {
          if (this.destroyed) return  // SAFETY
          try {
            // Rückgabewert auswerten, nicht nur auf eine Ausnahme warten: bei Server-Fehler,
            // Timeout oder gerissener Integritätsprüfung liefert downloadFile `null` und hat
            // NICHTS geschrieben. Vorher stempelte der Code danach trotzdem `syncedAt` —
            // die Datei galt als geholt, obwohl sie es nicht war.
            const result = await this.downloadFile(filePath)
            if (!result) throw new Error('Transfer failed or integrity check failed')
          } catch (err) {
            // Kein syncedAt/Manifest-Eintrag → die Datei wird beim nächsten Sync erneut
            // versucht. Sie gilt weiterhin als "nur remote vorhanden", nie als gelöscht.
            downloadFailures.push(filePath)
            const erwarteterHash = remoteManifest.files[filePath]?.hash
            if (erwarteterHash) nichtAngekommeneHashes.add(erwarteterHash)
            const msg = err instanceof Error ? err.message : String(err)
            this.sendLog({ type: 'error', message: `Download failed: ${filePath} — ${msg}`, fileName: filePath })
            return
          }
          if (currentManifest.files[filePath]) {
            currentManifest.files[filePath].syncedAt = Date.now()
            // Der gerade geschriebene Server-Stand ist ab jetzt der bestätigte.
            const written = this.manifest?.files[filePath]
            if (written) {
              currentManifest.files[filePath].hash = written.hash
              currentManifest.files[filePath].size = written.size
              currentManifest.files[filePath].modifiedAt = written.modifiedAt
              currentManifest.files[filePath].syncedHash = written.hash
            }
          } else if (this.manifest?.files[filePath]) {
            // File was newly downloaded (didn't exist on disk when buildManifest ran)
            // Copy the entry from this.manifest (set by downloadFile) into currentManifest
            currentManifest.files[filePath] = { ...this.manifest.files[filePath] }
          }
          // Clear tombstone — file is intentionally being downloaded
          if (currentManifest.tombstones?.[filePath]) {
            delete currentManifest.tombstones[filePath]
          }
          current++
          this.sendLog({ type: 'download', message: `Downloaded: ${filePath}`, fileName: filePath })
          this.sendProgress({
            status: 'downloading',
            current,
            total,
            fileName: filePath
          })
        }))
      }

      // SAFETY: abort if destroyed during downloads
      if (this.destroyed) {
        return { success: false, uploaded: 0, downloaded: 0, conflicts: 0, error: 'Engine destroyed during sync' }
      }

      // Handle conflicts (sequential — needs careful ordering).
      // Fehler pro DATEI abfangen — dieselbe Lehre wie beim Upload und beim Download, hier
      // beim dritten Mal: resolveConflict lädt am Ende hoch bzw. herunter, und beides kann
      // werfen (Ack-Timeout nach 30 s, nicht entschlüsselbarer Blob). Ungefangen riss das
      // den ganzen Durchlauf ab — NACH den Uploads, aber VOR den Löschungen und vor
      // saveManifest. Folge: lastSyncTime blieb stehen, der Sync galt als "nie
      // durchgelaufen", und jeder Auto-Sync starb an derselben Datei (real am 17.08.2026,
      // aufgefallen an einem stehenden Voll-Sync trotz erfolgreicher Uploads).
      const conflictFailures: string[] = []
      for (const filePath of diff.conflicts) {
        if (this.destroyed) break  // SAFETY
        current++
        this.sendLog({ type: 'conflict', message: `Conflict: ${filePath}`, fileName: filePath })
        this.sendProgress({
          status: 'downloading',
          current,
          total,
          fileName: filePath
        })
        try {
          await this.resolveConflict(filePath, currentManifest, remoteManifest)
        } catch (err) {
          // Kein syncedAt/syncedHash → die Datei kommt beim nächsten Lauf wieder als
          // Konflikt hoch. Der Pfad MUSS in die Meldung, sonst bleibt unbekannt, welche
          // Datei den Sync aufhält (genau diese Lücke stand seit dem 06.08. offen).
          conflictFailures.push(filePath)
          const msg = err instanceof Error ? err.message : String(err)
          this.sendLog({
            type: 'error',
            message: `Conflict resolution failed: ${filePath} — ${msg}`,
            fileName: filePath
          })
        }
      }

      // Delete files on server that were deleted locally.
      // Auch hier Fehler pro DATEI abfangen: `deleteRemoteFile` wartet über `waitForAck`
      // bis zu 30 s und lehnt bei jedem Server-Fehler ab. Ungefangen riss eine einzige
      // nicht quittierte Löschung den Lauf ab, NACH allen Uploads und vor `saveManifest` —
      // dieselbe Folge wie bei der Konfliktschleife: lastSyncTime bleibt stehen, der ganze
      // Vault hängt an einer Datei.
      const remoteDeleted: string[] = []
      const deleteFailures: string[] = []
      for (const filePath of diff.toDeleteRemote) {
        if (this.destroyed) break  // SAFETY
        current++
        try {
          await this.deleteRemoteFile(filePath)
        } catch (err) {
          deleteFailures.push(filePath)
          // Löschabsicht erhalten. Der Pfad liegt nicht auf der Platte und steht deshalb
          // NICHT in currentManifest — genau das wird gleich als neues Manifest gespeichert.
          // Ohne diesen Übertrag wäre die Datei beim nächsten Lauf eine dem Gerät unbekannte
          // Server-Datei und käme als Download zurück, statt gelöscht zu werden. (Vorher
          // riss der Fehler den Lauf ab; dass nichts gespeichert wurde, war das zufällige
          // Sicherheitsnetz — mit dem Abfangen muss die Absicht ausdrücklich mitwandern.)
          const previous = this.manifest?.files[filePath]
          if (previous) currentManifest.files[filePath] = previous
          const msg = err instanceof Error ? err.message : String(err)
          this.sendLog({
            type: 'error',
            message: `Delete on server failed: ${filePath} — ${msg}`,
            fileName: filePath
          })
          continue
        }
        remoteDeleted.push(filePath)
        // Remove from saved manifest and add tombstone so re-uploads get deleted again
        if (this.manifest) {
          delete this.manifest.files[filePath]
          if (!this.manifest.tombstones) this.manifest.tombstones = {}
          this.manifest.tombstones[filePath] = Date.now()
        }
        this.sendLog({ type: 'delete', message: `Deleted on server: ${filePath}`, fileName: filePath })
        this.sendProgress({
          status: 'uploading',
          current,
          total,
          fileName: filePath
        })
      }

      // Löschabsicht ist eingelöst, sobald der Server sie quittiert hat — sonst bliebe
      // der Pfad dauerhaft von der Löschbremse ausgenommen.
      this.consumeConfirmedDeletions(remoteManifest, remoteDeleted)

      // Handle remote deletes — move to .sync-trash/ instead of permanent deletion
      const deferredLocalDeletes: string[] = []
      for (const filePath of diff.toDeleteLocal) {
        if (this.destroyed) break  // SAFETY
        // Ersatz nicht angekommen → Datei bleibt liegen (s. nichtAngekommeneHashes).
        // Der Eintrag bleibt im Manifest, also steht die Löschung beim nächsten Lauf
        // wieder an — dann hoffentlich mit erfolgreichem Download.
        const eigenerHash = currentManifest.files[filePath]?.hash
        if (eigenerHash && nichtAngekommeneHashes.has(eigenerHash)) {
          deferredLocalDeletes.push(filePath)
          this.sendLog({
            type: 'error',
            message:
              `Kept local file — its replacement did not arrive: ${filePath}. ` +
              'The copy on the server could not be transferred; nothing was moved to trash.',
            fileName: filePath
          })
          continue
        }
        try {
          await moveToSyncTrash(this.vaultPath, filePath)
          delete currentManifest.files[filePath]
          // Add tombstone so if another device re-uploads, we know to delete again
          if (!currentManifest.tombstones) currentManifest.tombstones = {}
          currentManifest.tombstones[filePath] = Date.now()
          this.sendLog({ type: 'delete', message: `Moved to trash: ${filePath}`, fileName: filePath })
        } catch {
          // File might already be gone
        }
      }

      // Löschabsichten, die dieser Lauf NICHT eingelöst hat, müssen ins neue Manifest
      // wandern. `buildManifest` kennt sie nicht (es liest nur die Platte), und gleich
      // ersetzt currentManifest das bisherige Manifest vollständig — ohne diesen Übertrag
      // verschwindet jede verbliebene Bestätigung. Folge: der nächste Lauf sieht dieselben
      // Löschungen als UNbestätigte Massenlöschung und blockiert an der Löschbremse. Genau
      // das sollte `confirmedDeletions` verhindern (v0.10.45).
      // `consumeConfirmedDeletions` hat oben schon abgeräumt, was der Server quittiert hat;
      // hier steht nur noch der Rest. `this.manifest` ist an dieser Stelle noch das alte.
      const offeneLoeschabsichten = this.manifest?.confirmedDeletions
      if (
        offeneLoeschabsichten &&
        (Object.keys(offeneLoeschabsichten.paths).length > 0 ||
          Object.keys(offeneLoeschabsichten.prefixes).length > 0)
      ) {
        currentManifest.confirmedDeletions = offeneLoeschabsichten
      }

      // Merge tombstones from saved manifest into current
      if (this.manifest?.tombstones) {
        if (!currentManifest.tombstones) currentManifest.tombstones = {}
        for (const [filePath, deletedAt] of Object.entries(this.manifest.tombstones)) {
          if (!currentManifest.tombstones[filePath]) {
            currentManifest.tombstones[filePath] = deletedAt
          }
        }
      }
      if (this.manifest?.tombstonePrefixes) {
        if (!currentManifest.tombstonePrefixes) currentManifest.tombstonePrefixes = {}
        for (const [prefix, deletedAt] of Object.entries(this.manifest.tombstonePrefixes)) {
          if (!currentManifest.tombstonePrefixes[prefix]) {
            currentManifest.tombstonePrefixes[prefix] = deletedAt
          }
        }
      }

      // Clean up tombstones older than 90 days
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
      if (currentManifest.tombstones) {
        for (const [filePath, deletedAt] of Object.entries(currentManifest.tombstones)) {
          if (deletedAt < cutoff) {
            delete currentManifest.tombstones[filePath]
          }
        }
        if (Object.keys(currentManifest.tombstones).length === 0) {
          delete currentManifest.tombstones
        }
      }
      if (currentManifest.tombstonePrefixes) {
        for (const [prefix, deletedAt] of Object.entries(currentManifest.tombstonePrefixes)) {
          if (deletedAt < cutoff) {
            delete currentManifest.tombstonePrefixes[prefix]
          }
        }
        if (Object.keys(currentManifest.tombstonePrefixes).length === 0) {
          delete currentManifest.tombstonePrefixes
        }
      }

      // Update manifest
      currentManifest.lastSyncTime = Date.now()
      this.manifest = currentManifest
      await saveManifest(this.vaultPath, this.manifest)

      const uploadedCount = diff.toUpload.length - uploadFailures.length
      const downloadedCount = diff.toDownload.length - downloadFailures.length
      if (
        uploadFailures.length > 0 ||
        downloadFailures.length > 0 ||
        conflictFailures.length > 0 ||
        deleteFailures.length > 0
      ) {
        // Teilerfolg: erfolgreiche Übertragungen sind im Manifest markiert; die
        // fehlgeschlagenen haben weiter kein syncedAt und werden beim nächsten Auto-Sync
        // erneut versucht. Entscheidend: das Manifest wurde oben trotzdem gespeichert, der
        // Durchlauf ist also abgeschlossen — der Rest des Vaults bleibt nicht blockiert.
        this.status = 'error'
        const parts: string[] = []
        if (uploadFailures.length > 0) {
          parts.push(`${uploadFailures.length} upload(s) failed: ${uploadFailures[0]}${uploadFailures.length > 1 ? ', …' : ''}`)
        }
        if (downloadFailures.length > 0) {
          parts.push(`${downloadFailures.length} download(s) failed: ${downloadFailures[0]}${downloadFailures.length > 1 ? ', …' : ''}`)
        }
        if (conflictFailures.length > 0) {
          parts.push(`${conflictFailures.length} conflict(s) unresolved: ${conflictFailures[0]}${conflictFailures.length > 1 ? ', …' : ''}`)
        }
        if (deleteFailures.length > 0) {
          parts.push(`${deleteFailures.length} server delete(s) failed: ${deleteFailures[0]}${deleteFailures.length > 1 ? ', …' : ''}`)
        }
        if (deferredLocalDeletes.length > 0) {
          parts.push(
            `${deferredLocalDeletes.length} local file(s) kept because their replacement did not arrive: ` +
            `${deferredLocalDeletes[0]}${deferredLocalDeletes.length > 1 ? ', …' : ''}`
          )
        }
        const error = `${parts.join(' · ')} (will retry)`
        this.sendProgress({ status: 'error', error })
        return { success: false, uploaded: uploadedCount, downloaded: downloadedCount, conflicts: diff.conflicts.length, error }
      }

      this.status = 'done'
      const result: SyncResult = {
        success: true,
        uploaded: uploadedCount,
        downloaded: downloadedCount,
        conflicts: diff.conflicts.length
      }

      this.sendLog({
        type: 'sync',
        message: `${uploadedCount} uploaded, ${downloadedCount} downloaded, ${diff.conflicts.length} conflicts`
      })
      this.sendProgress({ status: 'done', current: total, total })

      // Reset status to idle after a moment
      setTimeout(() => {
        if (!this.syncing) {
          this.status = 'idle'
          this.sendProgress({ status: 'idle' })
        }
      }, 3000)

      return result
    } catch (err) {
      this.status = 'error'
      const error = err instanceof Error ? err.message : 'Unknown sync error'
      this.sendLog({ type: 'error', message: `Error: ${error}` })
      this.sendProgress({ status: 'error', error })
      return { success: false, uploaded: 0, downloaded: 0, conflicts: 0, error }
    } finally {
      this.syncing = false
      // Änderungen, die während des Laufs eingegangen sind, jetzt nachholen —
      // sie wurden vorher stillschweigend fallengelassen.
      if (!this.destroyed) {
        void this.drainPendingPushes().catch(err => {
          console.error('[Sync] Nachträglicher Push fehlgeschlagen:', err)
        })
      }
    }
  }

  private lastServerTombstones: Record<string, { deletedAt: number }> = {}

  // Bereits gemeldete Zu-groß-Dateien (Log-Spam-Schutz: Auto-Sync läuft alle 5 min)
  private loggedTooLargePaths = new Set<string>()

  private async getRemoteManifest(): Promise<FileManifest> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Not connected'))
      }

      const handler = (data: WebSocket.Data) => {
        try {
          const msg: ServerMessage = JSON.parse(data.toString())
          if (msg.type === 'manifest') {
            this.ws?.removeListener('message', handler)
            const remoteFiles: FileManifest['files'] = {}
            if (msg.files) {
              for (const [filePath, info] of Object.entries(msg.files)) {
                remoteFiles[filePath] = {
                  hash: info.hash,
                  size: info.size,
                  modifiedAt: info.modifiedAt,
                  syncedAt: null
                }
              }
            }
            // Store server tombstones for use in diffManifests
            this.lastServerTombstones = msg.deletedFiles || {}
            resolve({
              files: remoteFiles,
              lastSyncTime: 0,
              vaultId: this.vaultId
            })
          } else if (msg.type === 'error') {
            this.ws?.removeListener('message', handler)
            reject(new Error(msg.message || msg.error || 'Server error'))
          }
        } catch (err) {
          this.ws?.removeListener('message', handler)
          reject(err)
        }
      }

      this.ws.on('message', handler)
      this.wsSend({ type: 'get-manifest', vaultId: this.vaultId })

      setTimeout(() => {
        this.ws?.removeListener('message', handler)
        // A manifest timeout almost always means the socket is silently dead.
        // Tear it down so the close handler schedules a reconnect, instead of
        // leaving a half-open socket that keeps every future sync stuck red.
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.terminate()
        }
        reject(new Error('Manifest request timeout'))
      }, 15000)
    })
  }

  /**
   * Lädt den Inhalt hoch, der beim Lesen auf der Platte lag, und meldet GENAU diesen
   * Stand zurück. Der Rückgabewert ist die einzige zulässige Quelle für den
   * Manifest-Eintrag nach einem Upload: zwischen dem Lesen hier und dem Ack des Servers
   * liegen bis zu 30 Sekunden, in denen der Nutzer weiterschreibt. Wer die Datei danach
   * erneut liest und das Ergebnis als „synchronisiert" stempelt, erklärt einen Stand für
   * bestätigt, der den Server nie erreicht hat — genau so gingen Aufgaben-Häkchen verloren.
   */
  private async uploadFile(relativePath: string): Promise<UploadedState> {
    if (!this.key) throw new Error('No encryption key')

    const absPath = path.join(this.vaultPath, relativePath)
    const plaintext = await fs.readFile(absPath)
    const stats = await fs.stat(absPath)
    const { iv, tag, ciphertext } = encryptFile(plaintext, this.key)
    const hashedPath = hashPath(relativePath)
    const uploaded: UploadedState = {
      hash: hashContent(plaintext),
      size: plaintext.length,
      modifiedAt: Math.floor(stats.mtimeMs)
    }

    this.wsSend({
      type: 'upload',
      vaultId: this.vaultId,
      path: hashedPath,
      originalPath: relativePath,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: ciphertext.toString('base64'),
      hash: uploaded.hash,
      size: uploaded.size,
      modifiedAt: uploaded.modifiedAt
    })

    // Wait for acknowledgment (per-Pfad korreliert, s. waitForAck)
    await this.waitForAck(hashedPath)
    return uploaded
  }

  private async deleteRemoteFile(relativePath: string): Promise<void> {
    const hashedPath = hashPath(relativePath)
    this.wsSend({
      type: 'delete',
      vaultId: this.vaultId,
      path: hashedPath
    })
    await this.waitForAck(hashedPath)
  }

  private async downloadFile(relativePath: string): Promise<UploadedState | null> {
    // SAFETY: refuse to write if engine was destroyed
    if (this.destroyed) {
      console.warn('[SyncEngine] BLOCKED: downloadFile() on destroyed engine, path:', relativePath)
      return null
    }

    if (!this.key) throw new Error('No encryption key')

    // SAFETY: prevent path traversal attacks.
    //
    // Geprüft wird auf einen `..`-PFADABSCHNITT, nicht auf die Zeichenfolge „..".
    // Vorher stand hier `relativePath.includes('..')` — das lehnte jede Datei ab, deren
    // NAME zwei Punkte enthält. Genau das passiert dauernd: Mail-Notizen erben den
    // Betreff, endet der auf einen Punkt, heißt die Datei „… am 17.04..md". Solche
    // Dateien konnte dieses Gerät hochladen, aber nie herunterladen — sie fehlten auf dem
    // Zweitgerät dauerhaft und ohne jede Meldung (real: 22 Dateien im Vault, davon 2 in
    // der Gegenrichtung vermisst). Der eigentliche Schutz ist die Prüfung weiter unten,
    // dass der aufgelöste Pfad im Vault liegt.
    const segmente = relativePath.split(/[/\\]/)
    if (path.isAbsolute(relativePath) || segmente.includes('..') || segmente.includes('')) {
      console.error('[SyncEngine] BLOCKED: dangerous path:', relativePath)
      return null
    }

    const fileData = await this.requestFile(relativePath)
    if (!fileData) return null

    // SAFETY: check destroyed again after async operation
    if (this.destroyed) {
      console.warn('[SyncEngine] BLOCKED: downloadFile() destroyed during download, path:', relativePath)
      return null
    }

    const ciphertext = Buffer.from(fileData.data, 'base64')
    const iv = Buffer.from(fileData.iv, 'base64')
    const tag = Buffer.from(fileData.tag, 'base64')

    // AES-GCM meldet einen Schlüssel-/Integritätsfehler nur als rohes
    // "Unsupported state or unable to authenticate data" — ohne Dateinamen und ohne Hinweis,
    // was zu tun ist. Der Auth-Tag schlägt fehl, BEVOR die Hash-Prüfung unten greifen kann,
    // deshalb muss die Einordnung hier passieren.
    let plaintext: Buffer
    try {
      plaintext = decryptFile(ciphertext, this.key, iv, tag)
    } catch {
      throw new Error(
        'Decryption failed — the copy on the server was encrypted with a different passphrase, ' +
        'or its stored data is damaged. Re-upload this file from a device where it is intact.'
      )
    }

    // Integrity check: verify downloaded file matches expected hash and size
    if (fileData.hash && fileData.size) {
      const actualHash = hashContent(plaintext)
      if (plaintext.length !== fileData.size) {
        console.error(`[SyncEngine] INTEGRITY FAIL: ${relativePath} — expected ${fileData.size} bytes, got ${plaintext.length}`)
        this.sendLog({ type: 'error', message: `Integrity check failed for ${relativePath}: size mismatch (expected ${fileData.size}, got ${plaintext.length})`, fileName: relativePath })
        return null
      }
      if (actualHash !== fileData.hash) {
        console.error(`[SyncEngine] INTEGRITY FAIL: ${relativePath} — hash mismatch`)
        this.sendLog({ type: 'error', message: `Integrity check failed for ${relativePath}: hash mismatch — file may be corrupted on server`, fileName: relativePath })
        return null
      }
    }

    const absPath = path.join(this.vaultPath, relativePath)

    // SAFETY: verify the resolved path is inside the vault.
    // Trennzeichen-Grenze mitprüfen — ein reines `startsWith` würde auch einen
    // Nachbarordner wie „<vault>-alt/…" akzeptieren. Das ist jetzt die tragende
    // Sicherung, nachdem die Abschnittsprüfung oben nicht mehr über jeden Doppelpunkt
    // im Dateinamen stolpert.
    const vaultRoot = path.resolve(this.vaultPath)
    const aufgeloest = path.resolve(absPath)
    if (aufgeloest !== vaultRoot && !aufgeloest.startsWith(vaultRoot + path.sep)) {
      console.error('[SyncEngine] BLOCKED: path escapes vault:', absPath)
      return null
    }

    await fs.mkdir(path.dirname(absPath), { recursive: true })

    // Ein Download überschreibt eine Datei, die der Nutzer auf DIESEM Gerät bearbeitet
    // haben kann. Bis hierher war das der einzige Schreibpfad der App ohne Backup —
    // ein falsch entschiedener Download war damit spurlos und unwiederbringlich.
    // Der Haken wird in index.ts gesetzt (dort liegt die abgesicherte Schreibgrenze).
    if (this.beforeOverwrite) {
      try {
        await this.beforeOverwrite(absPath, plaintext)
      } catch (err) {
        console.warn('[SyncEngine] Backup vor Download fehlgeschlagen:', relativePath, err)
      }
    }

    // Die Mailliste ist die einzige Datei, bei der ein Download sie NICHT
    // ersetzen darf. Sie ist eine gemeinsame Sammlung, kein Dokument: Was hier
    // ankommt, kann Mails enthalten, die dieses Gerät nicht hat — und umgekehrt.
    // Ein reines Überschreiben ist genau der Verlustpfad aus
    // docs/email-store-multi-device-plan.md. Deshalb geht der eingehende Stand
    // durch dieselbe Tür wie jeder App-Schreibvorgang: unter derselben Sperre,
    // vereinigt und atomar geschrieben.
    if (relativePath === EMAIL_STORE_REL_PATH) {
      return this.downloadEmailStore(relativePath, plaintext)
    }

    await fs.writeFile(absPath, plaintext)

    // Update local manifest entry. modifiedAt kommt aus der echten mtime, nicht aus
    // Date.now() — sonst weicht der Manifest-Stand vom nächsten buildManifest ab.
    const downloaded: UploadedState = {
      hash: hashContent(plaintext),
      size: plaintext.length,
      modifiedAt: await this.mtimeOf(absPath)
    }
    if (this.manifest) {
      this.manifest.files[relativePath] = {
        ...downloaded,
        syncedAt: Date.now(),
        // Gerade vom Server geholt — dieser Inhalt IST der bestätigte Stand.
        syncedHash: downloaded.hash
      }
    }
    return downloaded
  }

  /**
   * Nimmt einen eingehenden Mail-Stand entgegen: vereinigen statt ersetzen,
   * anschließend das Ergebnis hochladen.
   *
   * Der Upload ist kein Beiwerk. Nach der Vereinigung liegt auf der Platte ein
   * Stand, den der Server nicht kennt — ohne Upload bliebe er auf diesem Gerät
   * und das andere sähe die eingearbeiteten Mails nie. Und ins Manifest gehört
   * der Hash dessen, was WIRKLICH auf der Platte liegt, nicht der des
   * Server-Stands.
   */
  private async downloadEmailStore(relativePath: string, remotePlaintext: Buffer): Promise<UploadedState | null> {
    const absPath = path.join(this.vaultPath, relativePath)

    const merged = await mergeIncomingEmailStore(this.vaultPath, remotePlaintext.toString('utf-8'), {
      beforeWrite: this.beforeOverwrite
        ? async (nextContent: Buffer) => { await this.beforeOverwrite!(absPath, nextContent) }
        : undefined
    })

    if (!merged.ok) {
      console.error('[Sync] Mailliste konnte nicht vereinigt werden:', merged.reason)
      this.sendLog({ type: 'error', message: `Mailliste konnte nicht vereinigt werden: ${merged.reason}`, fileName: relativePath })
      return null
    }

    console.log(`[Sync] Mailliste vereinigt: ${merged.localCount} lokal + ${merged.incomingCount} entfernt → ${merged.mergedCount}`)
    this.sendLog({
      type: 'sync',
      message: `Mailliste vereinigt: ${merged.localCount} lokal + ${merged.incomingCount} entfernt → ${merged.mergedCount} Mails`,
      fileName: relativePath
    })

    // Das Ergebnis zurueck zum Server, sonst bleibt die Vereinigung lokal.
    let uploaded: UploadedState
    try {
      uploaded = await this.uploadFile(relativePath)
    } catch (error) {
      // Lokal ist der vereinigte Stand da und nichts verloren — aber der Server
      // hat ihn NICHT. Als Erfolg zurueckzumelden waere hier falsch: Der
      // Aufrufer stempelt bei jedem Nicht-null-Ergebnis `syncedHash` und meldet
      // den Lauf gruen. Der Stand gaelte damit als bestaetigt, obwohl ihn
      // niemand bestaetigt hat — und der Nutzer erfuehre nichts davon.
      // Also: als Fehlschlag melden, Manifest unberuehrt lassen, naechster Lauf
      // versucht es erneut (das Vereinigen ist wiederholbar).
      const msg = error instanceof Error ? error.message : String(error)
      console.warn('[Sync] Vereinigte Mailliste konnte nicht hochgeladen werden:', error)
      this.sendLog({
        type: 'error',
        message: `Mailliste vereinigt, aber nicht hochgeladen: ${msg}. Der vereinigte Stand liegt lokal; der nächste Lauf versucht es erneut.`,
        fileName: relativePath
      })
      return null
    }

    if (this.manifest) {
      this.manifest.files[relativePath] = {
        ...uploaded,
        syncedAt: Date.now(),
        // Bestaetigt ist der VEREINIGTE Stand, nicht der vom Server geholte.
        syncedHash: uploaded.hash
      }
    }
    return uploaded
  }

  private async mtimeOf(absPath: string): Promise<number> {
    try {
      return Math.floor((await fs.stat(absPath)).mtimeMs)
    } catch {
      return Date.now()
    }
  }

  private async resolveConflict(
    relativePath: string,
    localManifest: FileManifest,
    remoteManifest: FileManifest
  ): Promise<void> {
    const localFile = localManifest.files[relativePath]
    const remoteFile = remoteManifest.files[relativePath]

    if (!localFile || !remoteFile) return

    // JSON merge for flashcards — merge by card ID instead of overwriting
    if (relativePath === '.mindgraph/flashcards.json') {
      await this.mergeFlashcardsConflict(relativePath, localManifest)
      return
    }

    // Mailliste: vereinigen statt „eine Seite als Konfliktkopie wegsichern".
    // Die Konfliktkopie ist vom Sync ausgeschlossen und wird von niemandem mehr
    // gelesen — schliesst die App ohne weiteren Mail-Schreibvorgang, ist der
    // weggesicherte Stand endgueltig weg.
    if (relativePath === EMAIL_STORE_REL_PATH) {
      await this.mergeEmailStoreConflict(relativePath, localManifest)
      return
    }

    const absPath = path.join(this.vaultPath, relativePath)

    if (localFile.hash === remoteFile.hash) {
      localManifest.files[relativePath].syncedAt = Date.now()
      return
    }

    try {
      const fileData = await this.requestFile(relativePath)
      if (fileData) {
        const ciphertext = Buffer.from(fileData.data, 'base64')
        const iv = Buffer.from(fileData.iv, 'base64')
        const tag = Buffer.from(fileData.tag, 'base64')
        const remotePlaintext = decryptFile(ciphertext, this.key!, iv, tag)
        const localPlaintext = await fs.readFile(absPath)

        if (hashContent(localPlaintext) === hashContent(remotePlaintext)) {
          localManifest.files[relativePath] = {
            hash: hashContent(localPlaintext),
            size: localPlaintext.length,
            modifiedAt: Math.floor((await fs.stat(absPath)).mtimeMs),
            syncedAt: Date.now(),
            // Inhaltlich identisch — beide Seiten tragen denselben bestätigten Stand.
            syncedHash: hashContent(localPlaintext)
          }
          return
        }
      }
    } catch (error) {
      console.warn('[Sync] Could not verify conflict identity:', relativePath, error)
    }

    if (remoteFile.modifiedAt >= localFile.modifiedAt) {
      // Remote is newer — save local as conflict copy, then download remote
      const ext = path.extname(relativePath)
      const base = relativePath.slice(0, -ext.length)
      const date = new Date().toISOString().split('T')[0]
      const conflictPath = `${base}.sync-conflict-${date}${ext}`

      const conflictAbsPath = path.join(this.vaultPath, conflictPath)

      try {
        await fs.copyFile(absPath, conflictAbsPath)
      } catch {
        // Local file might not exist
      }

      // `downloadFile` WIRFT nicht bei jedem Fehlschlag: Server-Fehler, Timeout und die
      // Integritätsprüfung (Größe/Hash) liefern `null`. Wer das als reguläres Ende
      // behandelt, meldet einen gelösten Konflikt, der keiner ist — der Lauf gilt als
      // erfolgreich, lastSyncTime rückt vor, und die Konfliktdatei ist trotzdem nicht
      // aufgelöst. Deshalb hier explizit zum Fehler machen; der Aufrufer sammelt ihn.
      const downloaded = await this.downloadFile(relativePath)
      if (!downloaded) {
        throw new Error('Could not fetch the server copy (transfer failed or integrity check failed)')
      }
      localManifest.files[relativePath] = {
        ...downloaded,
        syncedAt: Date.now(),
        syncedHash: downloaded.hash
      }
    } else {
      // Local is newer — upload local, remote becomes the conflict copy on other devices
      const uploaded = await this.uploadFile(relativePath)
      localManifest.files[relativePath] = {
        ...localManifest.files[relativePath],
        ...uploaded,
        syncedAt: Date.now(),
        syncedHash: uploaded.hash
      }
    }
  }

  /**
   * Loest einen Konflikt der Mailliste durch Vereinigen.
   *
   * Kein Konfliktkopie-Zweig, keine „juengere Seite gewinnt"-Entscheidung: Bei
   * einer gemeinsamen Sammlung ist jede solche Entscheidung ein Datenverlust.
   */
  private async mergeEmailStoreConflict(relativePath: string, localManifest: FileManifest): Promise<void> {
    if (!this.key) return

    const fileData = await this.requestFile(relativePath)
    if (!fileData) {
      throw new Error('Could not fetch the server copy of the email list')
    }
    const remotePlaintext = decryptFile(
      Buffer.from(fileData.data, 'base64'),
      this.key,
      Buffer.from(fileData.iv, 'base64'),
      Buffer.from(fileData.tag, 'base64')
    )

    const merged = await this.downloadEmailStore(relativePath, remotePlaintext)
    if (!merged) {
      throw new Error('Could not merge the email list')
    }
    localManifest.files[relativePath] = {
      ...merged,
      syncedAt: Date.now(),
      syncedHash: this.manifest?.files[relativePath]?.syncedHash ?? merged.hash
    }
  }

  /**
   * Merge flashcards.json by card ID.
   * - Cards only in local → keep
   * - Cards only in remote → keep
   * - Cards in both → take the one with the newer `modified` timestamp
   * Result is saved locally and uploaded to server.
   */
  private async mergeFlashcardsConflict(
    relativePath: string,
    localManifest: FileManifest
  ): Promise<void> {
    if (!this.key) return

    const absPath = path.join(this.vaultPath, relativePath)

    // Read local flashcards
    let localCards: Array<{ id: string; modified: string; [key: string]: unknown }> = []
    try {
      const localData = await fs.readFile(absPath, 'utf-8')
      localCards = JSON.parse(localData)
      if (!Array.isArray(localCards)) localCards = []
    } catch {
      localCards = []
    }

    // Download and decrypt remote flashcards
    let remoteCards: Array<{ id: string; modified: string; [key: string]: unknown }> = []
    try {
      const fileData = await this.requestFile(relativePath)
      if (fileData) {
        const ciphertext = Buffer.from(fileData.data, 'base64')
        const iv = Buffer.from(fileData.iv, 'base64')
        const tag = Buffer.from(fileData.tag, 'base64')
        const plaintext = decryptFile(ciphertext, this.key, iv, tag)
        remoteCards = JSON.parse(plaintext.toString('utf-8'))
        if (!Array.isArray(remoteCards)) remoteCards = []
      }
    } catch {
      remoteCards = []
    }

    // Build map: id → card, using the newer version for duplicates
    const merged = new Map<string, typeof localCards[0]>()

    for (const card of localCards) {
      if (card.id) merged.set(card.id, card)
    }

    for (const remoteCard of remoteCards) {
      if (!remoteCard.id) continue
      const existing = merged.get(remoteCard.id)
      if (!existing) {
        // Card only on remote → add
        merged.set(remoteCard.id, remoteCard)
      } else {
        // Both have it → newer `modified` wins
        const localTime = new Date(existing.modified || 0).getTime()
        const remoteTime = new Date(remoteCard.modified || 0).getTime()
        if (remoteTime > localTime) {
          merged.set(remoteCard.id, remoteCard)
        }
      }
    }

    const mergedArray = Array.from(merged.values())
    const mergedJson = JSON.stringify(mergedArray, null, 2)

    // Write merged result locally
    await fs.writeFile(absPath, mergedJson, 'utf-8')

    // Upload merged result to server
    await this.uploadFile(relativePath)

    // Update manifest
    const content = Buffer.from(mergedJson, 'utf-8')
    localManifest.files[relativePath] = {
      hash: hashContent(content),
      size: content.length,
      modifiedAt: Date.now(),
      syncedAt: Date.now()
    }

    const localCount = localCards.length
    const remoteCount = remoteCards.length
    const mergedCount = mergedArray.length
    console.log(`[Sync] Merged flashcards: ${localCount} local + ${remoteCount} remote → ${mergedCount} merged`)
    this.sendLog({
      type: 'sync',
      message: `Flashcards merged: ${localCount} local + ${remoteCount} remote → ${mergedCount} cards`,
      fileName: relativePath
    })
  }

  private requestFile(
    relativePath: string
  ): Promise<{ data: string; iv: string; tag: string; hash?: string; size?: number } | null> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Not connected'))
      }

      const hashedPath = hashPath(relativePath)

      const handler = (data: WebSocket.Data) => {
        try {
          const msg: ServerMessage = JSON.parse(data.toString())
          if (msg.type === 'file-data' && msg.path === hashedPath) {
            this.ws?.removeListener('message', handler)
            resolve({
              data: msg.data!,
              iv: msg.iv!,
              tag: msg.tag!,
              hash: msg.hash,
              size: msg.size
            })
          } else if (msg.type === 'error') {
            this.ws?.removeListener('message', handler)
            resolve(null)
          }
        } catch (err) {
          this.ws?.removeListener('message', handler)
          reject(err)
        }
      }

      this.ws.on('message', handler)
      this.wsSend({
        type: 'download',
        vaultId: this.vaultId,
        path: hashedPath
      })

      setTimeout(() => {
        this.ws?.removeListener('message', handler)
        resolve(null)
      }, 30000)
    })
  }

  // expectedPath = hashPath(relativePath) des zugehörigen Uploads/Deletes. Der Server
  // echot `path` in jedem ack (server.ts), also korrelieren wir das ack zum konkreten
  // Request — sonst löst bei PARALLEL_UPLOADS>1 das ERSTE ack ALLE wartenden Uploads
  // aus (alle würden fälschlich als synced markiert, auch die, deren Speicherung noch
  // aussteht/fehlschlägt). Analog zu requestFile(), das ebenfalls per Pfad matcht.
  private waitForAck(expectedPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Not connected'))
      }

      const handler = (data: WebSocket.Data) => {
        let msg: ServerMessage
        try {
          msg = JSON.parse(data.toString())
        } catch (err) {
          this.ws?.removeListener('message', handler)
          reject(err)
          return
        }
        if (msg.type === 'ack' && msg.path === expectedPath) {
          this.ws?.removeListener('message', handler)
          resolve()
        } else if (msg.type === 'error') {
          // Server-Fehler tragen keinen Pfad (server.ts) → nicht eindeutig einem Upload
          // zuordenbar. Konservativ: diesen Waiter ablehnen → die Batch (Promise.all)
          // schlägt fehl, NICHTS wird fälschlich als synced markiert. Retry beim nächsten Sync.
          this.ws?.removeListener('message', handler)
          reject(new Error(msg.message || msg.error || 'Upload failed'))
        }
        // Sonst: ack für einen anderen Pfad / notify / unrelated → ignorieren, Listener bleibt.
      }

      this.ws.on('message', handler)

      setTimeout(() => {
        this.ws?.removeListener('message', handler)
        reject(new Error('Upload acknowledgment timeout'))
      }, 30000)
    })
  }

  /**
   * Schiebt eine einzelne geänderte Datei hoch (Aufrufer: der Vault-Watcher).
   *
   * Zwei Regeln, an denen hier real Daten verloren gingen:
   * 1. Was der Server bestätigt hat, ist ausschließlich der Rückgabewert von uploadFile —
   *    NICHT der Platteninhalt nach dem Ack. Zwischen Lesen und Ack liegen bis zu 30 s.
   * 2. Läuft gerade ein voller Sync oder schon ein Push für denselben Pfad, wird die
   *    Änderung VORGEMERKT statt verworfen. Vorher stieg die Methode einfach aus und
   *    niemand kam je darauf zurück.
   */
  async pushFile(relativePath: string): Promise<void> {
    if (!this.key || !this.ws || this.ws.readyState !== WebSocket.OPEN) return

    if (this.syncing || this.pushInFlight.has(relativePath)) {
      this.pendingPushes.add(relativePath)
      return
    }

    const erfolgreich = await this.pushOnce(relativePath)
    if (!erfolgreich) this.pendingPushes.add(relativePath)

    // Direkt nachfassen, statt auf den nächsten vollen Sync zu warten. Sonst zeigt das
    // andere Gerät bis zum nächsten Auto-Sync (Minuten) noch den alten Stand — genau
    // das Symptom, um das es hier geht. Läuft ein Sync, übernimmt dessen finally.
    // Ein gerade gescheiterter Pfad wird ausgenommen: der Server hat eben abgelehnt,
    // ein sofortiger zweiter Versuch kostet nur eine weitere Übertragung.
    if (!this.syncing) {
      await this.drainPendingPushes(erfolgreich ? undefined : relativePath)
    }
  }

  /**
   * Ein Upload-Versuch. Meldet Erfolg zurück, statt selbst über Wiedervorlage zu
   * entscheiden — diese Trennung ist das, was drainPendingPushes() erlaubt, „neue
   * Änderung" von „fehlgeschlagener Versuch" zu unterscheiden. Ohne sie kreist die
   * Nachzieh-Schleife auf einem dauerhaft scheiternden Upload endlos.
   */
  private async pushOnce(relativePath: string): Promise<boolean> {
    if (!this.key || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false

    this.pushInFlight.add(relativePath)
    try {
      // Gleiche Größen-Schranke wie im Sync-Diff — pushFile umgeht diffManifests,
      // darf die WS-Verbindung aber genauso wenig am Server-Payload-Limit killen.
      const preStats = await fs.stat(path.join(this.vaultPath, relativePath))
      if (preStats.size > MAX_SYNC_FILE_SIZE) {
        if (!this.loggedTooLargePaths.has(relativePath)) {
          this.loggedTooLargePaths.add(relativePath)
          this.sendLog({ type: 'error', message: `Skipped — file exceeds 64 MB sync limit: ${relativePath}`, fileName: relativePath })
        }
        // Kein Fehler im Sinne der Wiedervorlage: ein erneuter Versuch scheitert genauso.
        return true
      }
      const uploaded = await this.uploadFile(relativePath)
      if (this.manifest) {
        this.manifest.files[relativePath] = {
          ...uploaded,
          syncedAt: Date.now(),
          syncedHash: uploaded.hash
        }
        await saveManifest(this.vaultPath, this.manifest)
      }
      return true
    } catch (err) {
      console.error('[Sync] Failed to push file:', relativePath, err)
      // Das Manifest bleibt unangetastet — der nächste Versuch sieht die Datei
      // weiterhin als lokal geändert (syncedHash zeigt noch auf den alten Stand).
      return false
    } finally {
      this.pushInFlight.delete(relativePath)
    }
  }

  /**
   * Zieht vorgemerkte Änderungen nach, BIS NICHTS NEUES MEHR ENTSTEHT.
   *
   * Eine einzelne Momentaufnahme reicht nicht: Wer sieben Aufgaben in wenigen Sekunden
   * abhakt, erzeugt Stand 3, während der nachgezogene Upload von Stand 2 noch läuft.
   * Mit nur einem Durchlauf blieb Stand 3 bis zum nächsten Voll-Sync liegen und das
   * andere Gerät zeigte minutenlang einen veralteten Stand.
   *
   * Gescheiterte Uploads werden zurückgestellt statt sofort wiederholt — sonst hielte
   * ein dauerhaft scheiternder Pfad die Schleife endlos am Leben. Sie kommen am Ende
   * zurück in die Vormerkung und damit in den nächsten Push oder Auto-Sync.
   */
  private async drainPendingPushes(bereitsGescheitert?: string): Promise<void> {
    if (this.draining) return
    this.draining = true
    const zurueckgestellt = new Set<string>()
    if (bereitsGescheitert) zurueckgestellt.add(bereitsGescheitert)
    try {
      while (this.pendingPushes.size > 0 && !this.destroyed && !this.syncing) {
        const paths = [...this.pendingPushes]
        this.pendingPushes.clear()
        for (const relativePath of paths) {
          if (zurueckgestellt.has(relativePath)) continue
          if (this.destroyed || this.syncing) {
            zurueckgestellt.add(relativePath)
            continue
          }
          if (!(await this.pushOnce(relativePath))) zurueckgestellt.add(relativePath)
        }
        // Was in dieser Runde scheiterte, darf die Schleife nicht am Leben halten.
        // Eine zwischenzeitlich NEU eingetroffene Änderung desselben Pfads geht damit
        // nicht verloren: der Pfad landet unten wieder in der Vormerkung.
        for (const relativePath of zurueckgestellt) this.pendingPushes.delete(relativePath)
      }
    } finally {
      for (const relativePath of zurueckgestellt) this.pendingPushes.add(relativePath)
      this.draining = false
    }
  }

  startAutoSync(intervalSeconds: number): void {
    this.stopAutoSync()
    this.autoSyncInterval = setInterval(() => {
      // Retry from 'error' too — otherwise one failed sync wedges the status red
      // forever (the timer would never fire again). sync() reconnects if needed.
      if ((this.status === 'idle' || this.status === 'error') && !this.syncing) {
        this.sync().catch(err => {
          console.error('[Sync] Periodic sync failed:', err)
        })
      }
    }, intervalSeconds * 1000)
  }

  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval)
      this.autoSyncInterval = null
    }
  }

  disconnect(): void {
    this.destroyed = true  // SAFETY: immediately block all file operations
    this.intentionalDisconnect = true
    this.syncing = false
    this.stopAutoSync()
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer)
      this.syncDebounceTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.status = 'idle'
    this.key = null
    this.reconnectAttempts = 0
    console.log('[SyncEngine] Disconnected and destroyed — all file operations blocked')
  }

  getStatus(): {
    status: SyncStatus
    vaultId: string
    connected: boolean
    lastSyncTime: number | null
  } {
    return {
      status: this.status,
      vaultId: this.vaultId,
      connected: this.ws !== null && this.ws.readyState === WebSocket.OPEN,
      lastSyncTime: this.manifest?.lastSyncTime || null
    }
  }

  setExcludeConfig(config: { folders: string[]; extensions: string[] }): void {
    this.excludeConfig = config
  }

  async getDeletedFiles(): Promise<Array<{ path: string; originalPath: string; size: number; deletedAt: number }>> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }

    return new Promise((resolve, reject) => {
      const handler = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'deleted-files') {
            this.ws?.removeListener('message', handler)
            resolve(msg.files || [])
          } else if (msg.type === 'error') {
            this.ws?.removeListener('message', handler)
            reject(new Error(msg.message || 'Failed to get deleted files'))
          }
        } catch (err) {
          this.ws?.removeListener('message', handler)
          reject(err)
        }
      }

      this.ws!.on('message', handler)
      this.wsSend({ type: 'get-deleted-files', vaultId: this.vaultId })

      setTimeout(() => {
        this.ws?.removeListener('message', handler)
        reject(new Error('Get deleted files timeout'))
      }, 15000)
    })
  }

  async restoreFile(filePath: string): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }

    return new Promise((resolve, reject) => {
      const handler = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'file-restored') {
            this.ws?.removeListener('message', handler)
            resolve(true)
          } else if (msg.type === 'error') {
            this.ws?.removeListener('message', handler)
            resolve(false)
          }
        } catch (err) {
          this.ws?.removeListener('message', handler)
          reject(err)
        }
      }

      this.ws!.on('message', handler)
      this.wsSend({ type: 'restore-file', vaultId: this.vaultId, path: filePath })

      setTimeout(() => {
        this.ws?.removeListener('message', handler)
        reject(new Error('Restore file timeout'))
      }, 15000)
    })
  }

  isInitialized(): boolean {
    return this.key !== null && this.vaultId !== ''
  }

  private wsSend(data: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }
}
