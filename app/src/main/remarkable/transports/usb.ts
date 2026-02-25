import { net } from 'electron'
import type { ReMarkableTransport, RMDocumentSummary } from '../types'

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

  async connect(): Promise<boolean> {
    const endpoints = [
      `${this.baseUrl}/documents/`,
      `${this.baseUrl}/documents`,
      `${this.baseUrl}/`
    ]

    let lastError: string | null = null

    for (const endpoint of endpoints) {
      try {
        const result = await this.requestWithElectronNet(endpoint, 8000)
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
        const result = await this.requestWithElectronNet(endpoint, 10000)
        if (result.statusCode < 200 || result.statusCode >= 300) {
          lastStatus = result.statusCode
          continue
        }

        const payload = this.parseDocumentsPayload(result.buffer)

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
          const result = await this.uploadWithElectronNet(endpoint, fileName, content, 60000)
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

  private parseDocumentsPayload(buffer: Buffer): unknown[] {
    let payload: unknown
    try {
      payload = JSON.parse(buffer.toString('utf-8')) as unknown
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

  private requestWithElectronNet(
    url: string,
    timeoutMs: number
  ): Promise<{ statusCode: number; buffer: Buffer }> {
    return new Promise((resolve, reject) => {
      const request = net.request({ method: 'GET', url })
      const timeout = setTimeout(() => {
        request.abort()
        reject(new Error('reMarkable request timed out'))
      }, timeoutMs)

      request.on('response', (response) => {
        const statusCode = response.statusCode
        const chunks: Buffer[] = []
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        response.on('end', () => {
          clearTimeout(timeout)
          resolve({ statusCode, buffer: Buffer.concat(chunks) })
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

  private uploadWithElectronNet(
    endpoint: string,
    fileName: string,
    content: Buffer,
    timeoutMs: number
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const boundary = `----MindGraphReMarkableBoundary${Date.now().toString(16)}`
      const safeFileName = fileName.replace(/"/g, "'")

      const prefix = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${safeFileName}"\r\n` +
        'Content-Type: application/pdf\r\n\r\n',
        'utf-8'
      )
      const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
      const payload = Buffer.concat([prefix, content, suffix])

      const request = net.request({
        method: 'POST',
        url: endpoint
      })

      const timeout = setTimeout(() => {
        request.abort()
        reject(new Error('reMarkable upload timed out'))
      }, timeoutMs)

      request.setHeader('Content-Type', `multipart/form-data; boundary=${boundary}`)

      request.on('response', (response) => {
        const statusCode = response.statusCode
        const chunks: Buffer[] = []

        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })

        response.on('end', () => {
          clearTimeout(timeout)
          resolve({
            statusCode,
            body: Buffer.concat(chunks).toString('utf-8').trim()
          })
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

      request.write(payload)
      request.end()
    })
  }

  private async ensureUsbReachable(timeoutMs: number): Promise<boolean> {
    try {
      const result = await this.requestWithElectronNet(`${this.baseUrl}/documents/`, timeoutMs)
      return result.statusCode >= 200 && result.statusCode < 300
    } catch {
      return false
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
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
