import { net } from 'electron'
import type { ReMarkableTransport, RMDocumentSummary } from '../types'

interface RawReMarkableDocument {
  ID?: string
  VissibleName?: string
  Type?: string
  Parent?: string
  ModifiedClient?: string
}

export class USBTransport implements ReMarkableTransport {
  private baseUrl = 'http://10.11.99.1'

  async connect(): Promise<boolean> {
    const endpoints = [
      `${this.baseUrl}/documents/`,
      `${this.baseUrl}/documents`,
      `${this.baseUrl}/`
    ]

    let lastError: string | null = null

    for (const endpoint of endpoints) {
      try {
        const res = await this.fetchWithTimeout(endpoint)
        if (res.ok) {
          return true
        }
        lastError = `HTTP ${res.status} (${endpoint})`
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
        const res = await this.fetchWithTimeout(endpoint)
        if (!res.ok) {
          lastStatus = res.status
          continue
        }

        const payload = await res.json() as unknown
        if (!Array.isArray(payload)) {
          return []
        }

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

  async downloadDocumentPdf(documentId: string): Promise<Buffer> {
    const endpoints = [
      `${this.baseUrl}/download/${encodeURIComponent(documentId)}/placeholder`,
      `${this.baseUrl}/download/${documentId}/placeholder`,
      `${this.baseUrl}/download/${encodeURIComponent(documentId)}`,
      `${this.baseUrl}/download/${documentId}`
    ]

    let lastStatus: number | null = null

    for (const endpoint of endpoints) {
      try {
        const result = await this.downloadWithElectronNet(endpoint, 60000)
        if (result.ok && result.buffer) {
          return result.buffer
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

  async uploadPdf(fileName: string, content: Buffer): Promise<void> {
    const formData = new FormData()
    formData.append('file', new Blob([content], { type: 'application/pdf' }), fileName)

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/upload`,
      60000,
      {
        method: 'POST',
        body: formData
      }
    )

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`reMarkable upload failed (HTTP ${response.status})`)
    }
  }

  private downloadWithElectronNet(
    url: string,
    timeoutMs: number
  ): Promise<{ ok: boolean; statusCode?: number; buffer?: Buffer }> {
    return new Promise((resolve, reject) => {
      const request = net.request({ method: 'GET', url })
      const timeout = setTimeout(() => {
        request.abort()
        reject(new Error('reMarkable download timed out'))
      }, timeoutMs)

      request.on('response', (response) => {
        const statusCode = response.statusCode
        if (statusCode < 200 || statusCode >= 300) {
          clearTimeout(timeout)
          response.resume()
          resolve({ ok: false, statusCode })
          return
        }

        const chunks: Buffer[] = []
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        response.on('end', () => {
          clearTimeout(timeout)
          resolve({ ok: true, statusCode, buffer: Buffer.concat(chunks) })
        })
        response.on('error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      request.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })

      request.end()
    })
  }

  private normalizeDocument(item: RawReMarkableDocument): RMDocumentSummary | null {
    if (!item?.ID || !item?.VissibleName || !item?.Type) {
      return null
    }

    const type = item.Type === 'CollectionType' ? 'CollectionType' : 'DocumentType'

    return {
      id: item.ID,
      name: item.VissibleName,
      type,
      parent: item.Parent || '',
      modifiedClient: item.ModifiedClient || ''
    }
  }

  private async fetchWithTimeout(
    url: string,
    timeoutMs = 8000,
    options?: RequestInit
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      return await fetch(url, { ...options, signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
  }
}
