// Native Host-Primitiven für privilegierte Plugin-Capabilities (device.usb, pdf.render,
// pdf.optimize). Hier — und NUR hier (in main/, außerhalb von src/plugins/) — leben
// electron.net, BrowserWindow und child_process. Die Plugin-Vertikale (src/plugins/remarkable)
// importiert davon nichts; sie spricht ausschließlich über den Capability-Host. Der Code
// ist 1:1 aus dem alten main/remarkable/* übernommen, nur die Rückgabeformen sind auf die
// serialisierbaren Host-Service-Verträge angepasst (Text/Bytes statt Buffer-Streams).

import { net, BrowserWindow, app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { UsbDeviceInfo } from '../../shared/plugins/host'

// ─── device.usb: HTTP über electron.net (reMarkable-USB-Webinterface) ───────────

/** GET → { statusCode, text }. Für Connect-Probe (nur Status) + Dokumentenliste (JSON-Text). */
export function deviceRequest(
  url: string,
  timeoutMs: number
): Promise<{ statusCode: number; text: string }> {
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
        resolve({ statusCode, text: Buffer.concat(chunks).toString('utf-8') })
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

/** GET binär (streaming) → { ok, statusCode?, bytes? }. Für den PDF-Download. */
export function deviceDownload(
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; statusCode?: number; bytes?: Uint8Array }> {
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
        ;(response as unknown as NodeJS.ReadableStream).resume()
        resolve({ ok: false, statusCode })
        return
      }

      const chunks: Buffer[] = []
      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      response.on('end', () => {
        clearTimeout(timeout)
        resolve({ ok: true, statusCode, bytes: new Uint8Array(Buffer.concat(chunks)) })
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

/** POST multipart/form-data → { statusCode, body }. Für den PDF-Upload. */
export function deviceUpload(
  endpoint: string,
  fileName: string,
  content: Uint8Array,
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
    const payload = Buffer.concat([prefix, Buffer.from(content), suffix])

    const request = net.request({ method: 'POST', url: endpoint })

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
        resolve({ statusCode, body: Buffer.concat(chunks).toString('utf-8').trim() })
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

/** Listet via ioreg erkannte USB-Geräte (nur macOS; sonst []). Das Plugin filtert auf reMarkable. */
export async function listUsbDevices(): Promise<UsbDeviceInfo[]> {
  if (process.platform !== 'darwin') return []
  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)
    const { stdout } = await execFileAsync('ioreg', ['-p', 'IOUSB', '-l', '-w', '0'], {
      timeout: 10000,
    })
    const output = typeof stdout === 'string' ? stdout : String(stdout)

    const devices: UsbDeviceInfo[] = []
    for (const block of output.split('\n\n')) {
      const vendorName =
        block.match(/"USB Vendor Name"\s*=\s*"([^"]+)"/)?.[1] ||
        block.match(/"kUSBVendorString"\s*=\s*"([^"]+)"/)?.[1]
      const productName =
        block.match(/"USB Product Name"\s*=\s*"([^"]+)"/)?.[1] ||
        block.match(/"kUSBProductString"\s*=\s*"([^"]+)"/)?.[1]
      if (!vendorName && !productName) continue
      const vendorId = Number(block.match(/"idVendor"\s*=\s*(\d+)/)?.[1] ?? NaN)
      const productId = Number(block.match(/"idProduct"\s*=\s*(\d+)/)?.[1] ?? NaN)
      devices.push({
        vendorName,
        productName,
        vendorId: Number.isFinite(vendorId) ? vendorId : undefined,
        productId: Number.isFinite(productId) ? productId : undefined,
      })
    }
    return devices
  } catch {
    return []
  }
}

// ─── pdf.render: HTML → PDF über ein verstecktes BrowserWindow ──────────────────

/**
 * Rendert fertiges HTML (inkl. @page-Größe via CSS) zu PDF-Bytes. Generisch — die
 * reMarkable-Buch-CSS liegt im Plugin, hier nur der printToPDF-Mechanismus.
 * preferCSSPageSize: das pageSize-Objekt ist in dieser Electron-Version unzuverlässig.
 */
export async function htmlToPdf(fullHtml: string): Promise<Uint8Array> {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  const tempHtmlPath = path.join(
    app.getPath('temp'),
    `mindgraph-plugin-pdf-${process.pid}-${win.id}.html`
  )
  try {
    await fs.writeFile(tempHtmlPath, fullHtml, 'utf-8')
    await win.loadFile(tempHtmlPath)
    // Schriften geladen + ein Frame gelayoutet sicherstellen, sonst erfasst printToPDF
    // gelegentlich eine leere Seite (Race nach loadFile).
    await win.webContents
      .executeJavaScript(
        'document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => r(true))))'
      )
      .catch(() => {})
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    })
    return new Uint8Array(pdfData)
  } finally {
    if (!win.isDestroyed()) win.close()
    try {
      await fs.unlink(tempHtmlPath)
    } catch {
      /* ignore */
    }
  }
}

// ─── pdf.optimize: Ghostscript → qpdf-Fallback ──────────────────────────────────

let optCounter = 0

/** Verkleinert ein PDF (gs /ebook → qpdf --linearize → unverändert) und gibt die kleinere Variante zurück. */
export async function optimizePdf(
  bytes: Uint8Array
): Promise<{ bytes: Uint8Array; method: 'ghostscript' | 'qpdf' | 'unchanged' }> {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const execFileAsync = promisify(execFile)

  const homeDir = process.env.HOME || `/Users/${process.env.USER || ''}`
  const additionalPaths = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    `${homeDir}/.local/bin`,
  ]
  const currentPath = process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'
  const extendedPath = [...additionalPaths, ...currentPath.split(':')].join(':')
  const env = { ...process.env, PATH: extendedPath }

  const stamp = `${process.pid}-${++optCounter}`
  const inputPath = path.join(app.getPath('temp'), `mindgraph-rm-opt-in-${stamp}.pdf`)
  const outputPath = path.join(app.getPath('temp'), `mindgraph-rm-opt-out-${stamp}.pdf`)

  try {
    await fs.writeFile(inputPath, Buffer.from(bytes))

    let method: 'ghostscript' | 'qpdf' | 'unchanged' = 'unchanged'
    try {
      await execFileAsync(
        'gs',
        [
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.4',
          '-dPDFSETTINGS=/ebook',
          '-dDetectDuplicateImages=true',
          '-dCompressFonts=true',
          '-dEmbedAllFonts=true',
          '-dNOPAUSE',
          '-dQUIET',
          '-dBATCH',
          `-sOutputFile=${outputPath}`,
          inputPath,
        ],
        { env, timeout: 120000 }
      )
      method = 'ghostscript'
    } catch {
      try {
        await execFileAsync('qpdf', ['--linearize', inputPath, outputPath], {
          env,
          timeout: 120000,
        })
        method = 'qpdf'
      } catch {
        await fs.copyFile(inputPath, outputPath)
        method = 'unchanged'
      }
    }

    let out = await fs.readFile(outputPath)
    // Bringt die "Optimierung" keine Ersparnis, gib das Original zurück.
    if (out.length > bytes.length && method !== 'unchanged') {
      out = Buffer.from(bytes)
      method = 'unchanged'
    }
    return { bytes: new Uint8Array(out), method }
  } finally {
    await fs.unlink(inputPath).catch(() => {})
    await fs.unlink(outputPath).catch(() => {})
  }
}
