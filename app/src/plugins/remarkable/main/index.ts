// reMarkable-Plugin — Main-Entry. Registriert die 7 Geräte-/PDF-Actions.
//
// Importiert NIE rohes electron/net/fs/child_process: Gerät läuft über host.device
// (electron.net, allowlisted auf 10.11.99.1), PDF-Render/Optimize über host.pdf
// (BrowserWindow / Ghostscript im Capability-Host), Vault-I/O über host.vault (binär).
// Die reMarkable-Buch-CSS lebt hier (Plugin-Sache); der Host rendert nur HTML→PDF.

import { definePluginMain } from '@mindgraph/plugin-api'
import { ReMarkableService } from '../service'
import { extractReflowedHtml } from '../pdfReflow'
import { REMARKABLE_CAPABILITIES, manifest } from '../manifest'

const REMARKABLE_BOOK_CSS = `
  /* Seitengröße via CSS – mit preferCSSPageSize in printToPDF. Electrons pageSize-Objekt
     ist in dieser Version unzuverlässig (interpretiert Zahlen als Zoll → Riesenseite). */
  @page { size: 157mm 210mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Georgia', serif;
    font-size: 17pt;
    line-height: 1.7;
    color: #000;
    padding: 14mm 13mm 16mm;
    -webkit-hyphens: auto;
    hyphens: auto;
    text-rendering: optimizeLegibility;
  }
  h1 { font-size: 25pt; line-height: 1.25; margin: 0 0 14pt; padding-bottom: 6pt; border-bottom: 1.5px solid #000; }
  h2 { font-size: 21pt; line-height: 1.3; margin: 22pt 0 10pt; }
  h3 { font-size: 18.5pt; margin: 18pt 0 8pt; }
  p { margin: 0 0 0.75em; text-align: justify; }
  ul { margin: 0 0 0.75em; padding-left: 1.2em; }
  li { margin-bottom: 0.3em; text-align: justify; }
  a { color: #000; text-decoration: underline; }
`

function buildBookHtml(bodyHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>${title.replace(/</g, '&lt;')}</title>
  <style>${REMARKABLE_BOOK_CSS}</style>
</head>
<body>${bodyHtml}</body>
</html>`
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  const sanitized = trimmed.replace(/[^a-zA-Z0-9\-_. ]/g, '').replace(/ /g, '-')
  return sanitized || 'remarkable-note'
}

function msg(error: unknown): string {
  return error instanceof Error ? error.message : 'Unbekannter Fehler'
}

export default definePluginMain(
  { id: manifest.id, capabilities: REMARKABLE_CAPABILITIES },
  ({ host, actions }) => {
    host.log('register')
    const service = new ReMarkableService(host.device)

    actions.register('remarkable.usbCheck', () => service.checkUsbConnection())

    actions.register('remarkable.usbDebugInfo', async () => {
      try {
        const status = await service.checkUsbConnection()
        const devices = await host.device.listUsbDevices()
        const rm = devices.find((d) => /reMarkable/i.test(d.vendorName ?? ''))
        if (!rm) {
          return { success: true, connected: status.connected, error: status.connected ? undefined : status.error }
        }
        return {
          success: true,
          connected: status.connected,
          vendorName: rm.vendorName,
          productName: rm.productName,
          vendorId: rm.vendorId,
          productId: rm.productId,
          vendorIdHex: rm.vendorId != null ? `0x${rm.vendorId.toString(16)}` : undefined,
          productIdHex: rm.productId != null ? `0x${rm.productId.toString(16)}` : undefined,
          error: status.connected ? undefined : status.error,
        }
      } catch (error) {
        return { success: false, connected: false, error: msg(error) }
      }
    })

    actions.register('remarkable.listDocuments', async (p) => {
      const { folderId } = (p ?? {}) as { folderId?: string }
      try {
        return { documents: await service.listUsbDocuments(folderId) }
      } catch (error) {
        console.error('[reMarkable] Failed to list USB documents:', error)
        return { documents: [], error: msg(error) }
      }
    })

    actions.register('remarkable.download', async (p) => {
      const { id, name } = p as { id: string; name: string }
      try {
        const bytes = await service.downloadUsbDocumentPdf(id)
        const fileName = `${sanitizeFileName(name)}-${id.slice(0, 8)}.pdf`
        const relativePdfPath = `reMarkable/pdf/${fileName}`
        const alreadyExists = await host.vault.exists(relativePdfPath)
        if (!alreadyExists) {
          await host.vault.writeBytes(relativePdfPath, bytes)
        }
        return { success: true, relativePdfPath, alreadyExists }
      } catch (error) {
        console.error('[reMarkable] Failed to download document:', { id, name, error })
        return { success: false, error: msg(error) }
      }
    })

    actions.register('remarkable.upload', async (p) => {
      const { relativePdfPath } = p as { relativePdfPath: string }
      try {
        if (!relativePdfPath.toLowerCase().endsWith('.pdf')) {
          return { success: false, error: 'Nur PDF-Dateien koennen exportiert werden' }
        }
        const bytes = await host.vault.readBytes(relativePdfPath)
        const fileName = relativePdfPath.split('/').pop() ?? 'document.pdf'
        await service.uploadUsbPdf(fileName, bytes)
        return { success: true }
      } catch (error) {
        console.error('[reMarkable] Failed to upload PDF:', { relativePdfPath, error })
        return { success: false, error: msg(error) }
      }
    })

    actions.register('remarkable.optimize', async (p) => {
      const { relativePdfPath } = p as { relativePdfPath: string }
      try {
        if (!relativePdfPath.toLowerCase().endsWith('.pdf')) {
          return { success: false, error: 'Nur PDF-Dateien koennen optimiert werden' }
        }
        const input = await host.vault.readBytes(relativePdfPath)
        const { bytes, method } = await host.pdf.optimize(input)
        const outRel = relativePdfPath.replace(/\.pdf$/i, '.remarkable.pdf')
        await host.vault.writeBytes(outRel, bytes)
        return {
          success: true,
          relativePdfPath: outRel,
          method,
          originalSize: input.length,
          optimizedSize: bytes.length,
        }
      } catch (error) {
        console.error('[reMarkable] Failed to optimize PDF:', { relativePdfPath, error })
        return { success: false, error: msg(error) }
      }
    })

    actions.register('remarkable.bookify', async (p) => {
      const { relativePdfPath } = p as { relativePdfPath: string }
      try {
        if (!relativePdfPath.toLowerCase().endsWith('.pdf')) {
          return { success: false, error: 'Nur PDF-Dateien können umgewandelt werden' }
        }
        const exists = await host.vault.exists(relativePdfPath)
        if (!exists) {
          const base = relativePdfPath.split('/').pop() ?? relativePdfPath
          return {
            success: false,
            error: `Quell-PDF nicht gefunden: „${base}". Die Datei wurde verschoben oder gelöscht – bitte ein vorhandenes PDF auswählen.`,
          }
        }
        const input = await host.vault.readBytes(relativePdfPath)
        const reflow = await extractReflowedHtml(input)
        if (reflow.charCount < 40) {
          return {
            success: false,
            error: 'Kaum Text gefunden – vermutlich ein gescanntes/Bild-PDF. Reflow funktioniert nur mit echtem Text.',
          }
        }
        const baseName = (relativePdfPath.split('/').pop() ?? 'document').replace(/\.pdf$/i, '')
        const title = reflow.title || baseName
        const pdf = await host.pdf.htmlToPdf(buildBookHtml(reflow.bodyHtml, title))
        const outRel = relativePdfPath.replace(/\.pdf$/i, '.remarkable.pdf')
        await host.vault.writeBytes(outRel, pdf)
        return {
          success: true,
          relativePdfPath: outRel,
          sourcePages: reflow.pageCount,
          charCount: reflow.charCount,
        }
      } catch (error) {
        console.error('[reMarkable] Failed to bookify PDF:', { relativePdfPath, error })
        return { success: false, error: msg(error) }
      }
    })
  }
)
