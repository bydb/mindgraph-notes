// Rendert PDF-Seiten zu JPEG für die lokale Texterkennung des Agenten (Rev. 7 Punkt 25,
// docs/codex-collab/chat-verlauf-notizen-bilder.md). Läuft in einem versteckten, abgeschotteten
// Fenster ohne Preload und ohne Node; der Main ruft `window.__mgRaster` per executeJavaScript.
// Damit parst die fremde PDF ein Sandbox-Prozess, nicht der Main.
import * as pdfjs from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

let doc: pdfjs.PDFDocumentProxy | null = null

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function blobToB64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const api = {
  async open(b64: string): Promise<number> {
    await api.close()
    doc = await pdfjs.getDocument({ data: b64ToBytes(b64), isEvalSupported: false }).promise
    return doc.numPages
  },
  async render(pageNum: number, maxSide: number): Promise<{ width: number; height: number; jpeg: string }> {
    if (!doc) throw new Error('Keine PDF geöffnet')
    const page = await doc.getPage(pageNum)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(4, maxSide / Math.max(base.width, base.height))
    const vp = page.getViewport({ scale })
    const canvas = new OffscreenCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Kein Canvas')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp }).promise
    page.cleanup()
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
    return { width: canvas.width, height: canvas.height, jpeg: await blobToB64(blob) }
  },
  async close(): Promise<void> {
    const d = doc
    doc = null
    if (d) await d.destroy().catch(() => undefined)
  }
}

;(window as unknown as { __mgRaster: typeof api }).__mgRaster = api
