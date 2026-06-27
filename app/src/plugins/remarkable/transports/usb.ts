// reMarkable-USB-Transport — Protokoll-Logik der Vertikale.
//
// Spricht das USB-Webinterface (http://10.11.99.1) NICHT direkt an: das rohe electron.net
// liegt im Capability-Host (host.device, allowlisted auf 10.11.99.1). Hier bleibt die
// reMarkable-spezifische Logik: Endpunkt-Varianten, JSON-Parsing, Upload-Retry/Reachability.
// Kein Import von electron/net/fs — Import-Wall-konform.

import type { ReMarkableTransport, RMDocumentSummary } from '../types'
import type { DeviceUsbService } from '../../../shared/plugins/host'

interface RawReMarkableDocument {
  ID?: string
  VissibleName?: string
  VisibleName?: string
  Type?: string
  Parent?: string
  ModifiedClient?: string
}

export class USBTransport implements ReMarkableTransport {
  private baseUrl = 'http://10.11.99.1'

  constructor(private device: DeviceUsbService) {}

  async connect(): Promise<boolean> {
    const endpoints = [
      `${this.baseUrl}/documents/`,
      `${this.baseUrl}/documents`,
      `${this.baseUrl}/`
    ]

    let lastError: string | null = null

    for (const endpoint of endpoints) {
      try {
        const result = await this.device.request(endpoint, 8000)
        if (result.statusCode >= 200 && result.statusCode < 300) {
          return true
        }
        lastError = `HTTP ${result.statusCode} (${endpoint})`
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown connection error'
      }
    }

    throw new Error(lastError || 'No connection to reMarkable USB interface')
  }

  async listDocuments(folderId?: string): Promise<RMDocumentSummary[]> {
    const endpoints = folderId
      ? [
        `${this.baseUrl}/documents/${encodeURIComponent(folderId)}`,
        `${this.baseUrl}/documents/${folderId}`
      ]
      : [
        `${this.baseUrl}/documents/`,
        `${this.baseUrl}/documents`
      ]

    let lastStatus: number | null = null

    for (const endpoint of endpoints) {
      try {
        const result = await this.device.request(endpoint, 10000)
        if (result.statusCode < 200 || result.statusCode >= 300) {
          lastStatus = result.statusCode
          continue
        }

        const payload = this.parseDocumentsPayload(result.text)

        return payload
          .map((item) => this.normalizeDocument(item as RawReMarkableDocument))
          .filter((doc): doc is RMDocumentSummary => doc !== null)
      } catch {
        continue
      }
    }

    throw new Error(
      lastStatus
        ? `reMarkable USB request failed (HTTP ${lastStatus})`
        : 'reMarkable USB endpoint not reachable'
    )
  }

  async downloadDocumentPdf(documentId: string): Promise<Uint8Array> {
    const endpoints = [
      `${this.baseUrl}/download/${encodeURIComponent(documentId)}/placeholder`,
      `${this.baseUrl}/download/${documentId}/placeholder`,
      `${this.baseUrl}/download/${encodeURIComponent(documentId)}`,
      `${this.baseUrl}/download/${documentId}`
    ]

    let lastStatus: number | null = null

    for (const endpoint of endpoints) {
      try {
        const result = await this.device.download(endpoint, 60000)
        if (result.ok && result.bytes) {
          return result.bytes
        }
        if (result.statusCode) {
          lastStatus = result.statusCode
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('timed out')) {
          throw error
        }
      }
    }

    throw new Error(
      lastStatus
        ? `reMarkable download failed (HTTP ${lastStatus})`
        : 'reMarkable download endpoint not reachable'
    )
  }

  async uploadPdf(fileName: string, content: Uint8Array): Promise<void> {
    const endpoints = [
      `${this.baseUrl}/upload`,
      `${this.baseUrl}/upload/`
    ]

    let lastStatus: number | null = null
    let lastError: string | null = null

    for (let attempt = 1; attempt <= 20; attempt++) {
      const reachable = await this.ensureUsbReachable(3000)
      if (!reachable) {
        lastError = 'reMarkable USB interface not reachable'
        await this.sleep(700)
        continue
      }

      for (const endpoint of endpoints) {
        try {
          const result = await this.device.upload(endpoint, fileName, content, 60000)
          if (result.statusCode === 200 || result.statusCode === 201) {
            return
          }

          lastStatus = result.statusCode
          lastError = result.body || null
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Unknown upload error'
        }
      }

      if (attempt < 20 && lastError && /EHOSTUNREACH|ENETUNREACH|ECONNREFUSED|timed out|not reachable/i.test(lastError)) {
        await this.sleep(800)
      }
    }

    if (lastStatus) {
      throw new Error(`reMarkable upload failed (HTTP ${lastStatus})${lastError ? `: ${lastError}` : ''}`)
    }

    throw new Error(lastError || 'reMarkable upload endpoint not reachable')
  }

  private normalizeDocument(item: RawReMarkableDocument): RMDocumentSummary | null {
    const name = item?.VissibleName || item?.VisibleName
    if (!item?.ID || !name || !item?.Type) {
      return null
    }

    const type = item.Type === 'CollectionType' ? 'CollectionType' : 'DocumentType'

    return {
      id: item.ID,
      name,
      type,
      parent: item.Parent || '',
      modifiedClient: item.ModifiedClient || ''
    }
  }

  private parseDocumentsPayload(text: string): unknown[] {
    let payload: unknown
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      return []
    }

    if (Array.isArray(payload)) {
      return payload
    }

    if (payload && typeof payload === 'object') {
      const withItems = payload as { items?: unknown; Items?: unknown }
      if (Array.isArray(withItems.items)) {
        return withItems.items
      }
      if (Array.isArray(withItems.Items)) {
        return withItems.Items
      }
    }

    return []
  }

  private async ensureUsbReachable(timeoutMs: number): Promise<boolean> {
    try {
      const result = await this.device.request(`${this.baseUrl}/documents/`, timeoutMs)
      return result.statusCode >= 200 && result.statusCode < 300
    } catch {
      return false
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
