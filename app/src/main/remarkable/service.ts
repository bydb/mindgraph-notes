import type { RMDocumentSummary } from './types'
import { USBTransport } from './transports/usb'

export class ReMarkableService {
  private usbTransport = new USBTransport()

  async checkUsbConnection(): Promise<{ connected: boolean; mode: 'usb'; error?: string }> {
    try {
      const connected = await this.usbTransport.connect()
      return { connected, mode: 'usb' }
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : 'Unknown USB error'
      return {
        connected: false,
        mode: 'usb',
        error: `${baseMessage}. Ensure USB web interface is enabled on reMarkable and cable is connected.`
      }
    }
  }

  async listUsbDocuments(folderId?: string): Promise<RMDocumentSummary[]> {
    return this.usbTransport.listDocuments(folderId)
  }

  async downloadUsbDocumentPdf(documentId: string): Promise<Buffer> {
    return this.usbTransport.downloadDocumentPdf(documentId)
  }

  async uploadUsbPdf(fileName: string, content: Buffer): Promise<void> {
    await this.usbTransport.uploadPdf(fileName, content)
  }
}
