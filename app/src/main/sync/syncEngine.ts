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
  type FileManifest
} from './fileTracker'
import type { SyncProgress, SyncResult } from '../../shared/types'

type SyncStatus = SyncProgress['status']

const PARALLEL_UPLOADS = 5
const PARALLEL_DOWNLOADS = 5

interface ServerMessage {
  type: string
  files?: Record<string, { hash: string; size: number; modifiedAt: number }>
  path?: string
  iv?: string
  tag?: string
  data?: string
  event?: string
  message?: string
  error?: string
}

export class SyncEngine {
  private ws: WebSocket | null = null
  private key: Buffer | null = null
  private manifest: FileManifest | null = null
  private vaultPath: string = ''
  private vaultId: string = ''
  private relayUrl: string = ''
  private status: SyncStatus = 'idle'
  private syncing: boolean = false
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null

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
    relayUrl: string
  ): Promise<{ vaultId: string }> {
    this.vaultPath = vaultPath
    this.relayUrl = relayUrl
    this.vaultId = generateVaultId()
    this.key = deriveKey(passphrase, this.vaultId)

    // Load or create manifest
    this.manifest = await loadManifest(vaultPath) || {
      files: {},
      lastSyncTime: 0,
      vaultId: this.vaultId
    }
    this.manifest.vaultId = this.vaultId

    await saveManifest(vaultPath, this.manifest)

    return { vaultId: this.vaultId }
  }

  async join(
    vaultPath: string,
    vaultId: string,
    passphrase: string,
    relayUrl: string
  ): Promise<boolean> {
    this.vaultPath = vaultPath
    this.relayUrl = relayUrl
    this.vaultId = vaultId
    this.key = deriveKey(passphrase, this.vaultId)

    this.manifest = await loadManifest(vaultPath) || {
      files: {},
      lastSyncTime: 0,
      vaultId: this.vaultId
    }
    this.manifest.vaultId = this.vaultId

    await saveManifest(vaultPath, this.manifest)
    return true
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return

    this.status = 'connecting'
    this.sendProgress({ status: 'connecting' })

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.relayUrl)

      this.ws.on('open', () => {
        console.log('[Sync] Connected to relay server')
        // Register vault
        this.wsSend({ type: 'register', vaultId: this.vaultId })
        this.status = 'idle'
        this.sendProgress({ status: 'idle' })
        resolve()
      })

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg: ServerMessage = JSON.parse(data.toString())
          this.handleServerMessage(msg)
        } catch (err) {
          console.error('[Sync] Failed to parse server message:', err)
        }
      })

      this.ws.on('close', () => {
        console.log('[Sync] Disconnected from relay server')
        this.ws = null
        if (this.status !== 'error') {
          this.status = 'idle'
        }
      })

      this.ws.on('error', (err) => {
        console.error('[Sync] WebSocket error:', err)
        this.status = 'error'
        this.sendProgress({
          status: 'error',
          error: err.message
        })
        reject(err)
      })

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          this.ws.close()
          reject(new Error('Connection timeout'))
        }
      }, 10000)
    })
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'notify':
        if (msg.event === 'file-changed' && !this.syncing) {
          // Another client changed a file, trigger debounced sync
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

  async sync(): Promise<SyncResult> {
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

      // Build current local manifest
      const currentManifest = await buildManifest(this.vaultPath, this.vaultId)

      // Merge with saved manifest to preserve syncedAt timestamps
      if (this.manifest) {
        for (const [filePath, info] of Object.entries(this.manifest.files)) {
          if (currentManifest.files[filePath]) {
            currentManifest.files[filePath].syncedAt = info.syncedAt
          }
        }
        currentManifest.lastSyncTime = this.manifest.lastSyncTime
      }

      // Get remote manifest
      const remoteManifest = await this.getRemoteManifest()

      // Compute diff
      const diff = diffManifests(currentManifest, remoteManifest)

      const total = diff.toUpload.length + diff.toDownload.length + diff.conflicts.length
      let current = 0

      // Upload files in parallel batches
      this.status = 'uploading'
      for (let i = 0; i < diff.toUpload.length; i += PARALLEL_UPLOADS) {
        const batch = diff.toUpload.slice(i, i + PARALLEL_UPLOADS)
        await Promise.all(batch.map(async (filePath) => {
          await this.uploadFile(filePath)
          currentManifest.files[filePath].syncedAt = Date.now()
          current++
          this.sendProgress({
            status: 'uploading',
            current,
            total,
            fileName: filePath
          })
        }))
      }

      // Download files in parallel batches
      this.status = 'downloading'
      for (let i = 0; i < diff.toDownload.length; i += PARALLEL_DOWNLOADS) {
        const batch = diff.toDownload.slice(i, i + PARALLEL_DOWNLOADS)
        await Promise.all(batch.map(async (filePath) => {
          await this.downloadFile(filePath)
          if (currentManifest.files[filePath]) {
            currentManifest.files[filePath].syncedAt = Date.now()
          }
          current++
          this.sendProgress({
            status: 'downloading',
            current,
            total,
            fileName: filePath
          })
        }))
      }

      // Handle conflicts (sequential — needs careful ordering)
      for (const filePath of diff.conflicts) {
        current++
        this.sendProgress({
          status: 'downloading',
          current,
          total,
          fileName: filePath
        })
        await this.resolveConflict(filePath, currentManifest, remoteManifest)
      }

      // Handle remote deletes
      for (const filePath of diff.toDeleteLocal) {
        const absPath = path.join(this.vaultPath, filePath)
        try {
          await fs.unlink(absPath)
          delete currentManifest.files[filePath]
        } catch {
          // File might already be gone
        }
      }

      // Update manifest
      currentManifest.lastSyncTime = Date.now()
      this.manifest = currentManifest
      await saveManifest(this.vaultPath, this.manifest)

      this.status = 'done'
      const result: SyncResult = {
        success: true,
        uploaded: diff.toUpload.length,
        downloaded: diff.toDownload.length,
        conflicts: diff.conflicts.length
      }

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
      this.sendProgress({ status: 'error', error })
      return { success: false, uploaded: 0, downloaded: 0, conflicts: 0, error }
    } finally {
      this.syncing = false
    }
  }

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
        reject(new Error('Manifest request timeout'))
      }, 15000)
    })
  }

  private async uploadFile(relativePath: string): Promise<void> {
    if (!this.key) throw new Error('No encryption key')

    const absPath = path.join(this.vaultPath, relativePath)
    const plaintext = await fs.readFile(absPath)
    const stats = await fs.stat(absPath)
    const { iv, tag, ciphertext } = encryptFile(plaintext, this.key)

    this.wsSend({
      type: 'upload',
      vaultId: this.vaultId,
      path: hashPath(relativePath),
      originalPath: relativePath,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: ciphertext.toString('base64'),
      hash: hashContent(plaintext),
      size: plaintext.length,
      modifiedAt: Math.floor(stats.mtimeMs)
    })

    // Wait for acknowledgment
    await this.waitForAck()
  }

  private async downloadFile(relativePath: string): Promise<void> {
    if (!this.key) throw new Error('No encryption key')

    const fileData = await this.requestFile(relativePath)
    if (!fileData) return

    const ciphertext = Buffer.from(fileData.data, 'base64')
    const iv = Buffer.from(fileData.iv, 'base64')
    const tag = Buffer.from(fileData.tag, 'base64')

    const plaintext = decryptFile(ciphertext, this.key, iv, tag)

    const absPath = path.join(this.vaultPath, relativePath)
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, plaintext)

    // Update local manifest entry
    if (this.manifest) {
      this.manifest.files[relativePath] = {
        hash: hashContent(plaintext),
        size: plaintext.length,
        modifiedAt: Date.now(),
        syncedAt: Date.now()
      }
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

    if (remoteFile.modifiedAt >= localFile.modifiedAt) {
      // Remote is newer — save local as conflict copy, then download remote
      const ext = path.extname(relativePath)
      const base = relativePath.slice(0, -ext.length)
      const date = new Date().toISOString().split('T')[0]
      const conflictPath = `${base}.sync-conflict-${date}${ext}`

      const absPath = path.join(this.vaultPath, relativePath)
      const conflictAbsPath = path.join(this.vaultPath, conflictPath)

      try {
        await fs.copyFile(absPath, conflictAbsPath)
      } catch {
        // Local file might not exist
      }

      await this.downloadFile(relativePath)
    } else {
      // Local is newer — upload local, remote becomes the conflict copy on other devices
      await this.uploadFile(relativePath)
      localManifest.files[relativePath].syncedAt = Date.now()
    }
  }

  private requestFile(
    relativePath: string
  ): Promise<{ data: string; iv: string; tag: string } | null> {
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
              tag: msg.tag!
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

  private waitForAck(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Not connected'))
      }

      const handler = (data: WebSocket.Data) => {
        try {
          const msg: ServerMessage = JSON.parse(data.toString())
          if (msg.type === 'ack') {
            this.ws?.removeListener('message', handler)
            resolve()
          } else if (msg.type === 'error') {
            this.ws?.removeListener('message', handler)
            reject(new Error(msg.message || msg.error || 'Upload failed'))
          }
        } catch (err) {
          this.ws?.removeListener('message', handler)
          reject(err)
        }
      }

      this.ws.on('message', handler)

      setTimeout(() => {
        this.ws?.removeListener('message', handler)
        reject(new Error('Upload acknowledgment timeout'))
      }, 30000)
    })
  }

  async pushFile(relativePath: string): Promise<void> {
    if (!this.key || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
    if (this.syncing) return

    try {
      await this.uploadFile(relativePath)
      if (this.manifest) {
        const absPath = path.join(this.vaultPath, relativePath)
        const content = await fs.readFile(absPath)
        const stats = await fs.stat(absPath)
        this.manifest.files[relativePath] = {
          hash: hashContent(content),
          size: content.length,
          modifiedAt: Math.floor(stats.mtimeMs),
          syncedAt: Date.now()
        }
        await saveManifest(this.vaultPath, this.manifest)
      }
    } catch (err) {
      console.error('[Sync] Failed to push file:', relativePath, err)
    }
  }

  startAutoSync(intervalSeconds: number): void {
    this.stopAutoSync()
    this.autoSyncInterval = setInterval(() => {
      if (this.status === 'idle' && !this.syncing) {
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
    this.stopAutoSync()
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

  isInitialized(): boolean {
    return this.key !== null && this.vaultId !== ''
  }

  private wsSend(data: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }
}
