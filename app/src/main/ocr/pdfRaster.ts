/**
 * PDF-Seiten zu Bildern für die lokale Texterkennung (Rev. 7 Punkt 25, Codex F33;
 * docs/codex-collab/chat-verlauf-notizen-bilder.md).
 *
 * Der Main hat kein Canvas. Statt einer nativen Abhängigkeit (@napi-rs/canvas: Binary je
 * Architektur, asar-Entpacken, Signieren) rendert ein verstecktes Fenster mit Chromiums Canvas
 * und derselben pdfjs-Version (5.4.296, `isEvalSupported: false`). Das Fenster hat keinen
 * Preload, kein Node, Sandbox an, Navigation und neue Fenster gesperrt; das RASTERN läuft also
 * in einem abgeschotteten Prozess. Die Textebene liest weiterhin der Main (`extractPdfText`,
 * wie vor 1.2) — ganz verlagern ist ein eigenes Vorhaben (Codex F47). Das Fenster lebt nur so
 * lange, wie es gebraucht wird.
 */

import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import { SECURE_WEB_PREFERENCES } from '../windowSecurity'

const IDLE_CLOSE_MS = 60_000
const PAGE_TIMEOUT_MS = 60_000

let win: BrowserWindow | null = null
let ready: Promise<BrowserWindow> | null = null
let idleTimer: ReturnType<typeof setTimeout> | undefined
/** Nur ein Dokument zugleich: Aufrufe laufen nacheinander. */
let queue: Promise<unknown> = Promise.resolve()

function scheduleClose(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => closeRasterWindow(), IDLE_CLOSE_MS)
}

export function closeRasterWindow(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = undefined
  const w = win
  win = null
  ready = null
  if (w && !w.isDestroyed()) w.destroy()
}

/**
 * Nur dieses Fenster schließen (Codex F49): ein später scheiternder Start eines alten Fensters
 * darf nicht das Fenster eines inzwischen laufenden Folgeauftrags zerstören.
 */
function closeIfCurrent(w: BrowserWindow): void {
  if (win === w) closeRasterWindow()
  else if (!w.isDestroyed()) w.destroy()
}

function openWindow(): Promise<BrowserWindow> {
  if (ready && win && !win.isDestroyed()) return ready
  const w = new BrowserWindow({
    show: false,
    width: 400,
    height: 400,
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      sandbox: true,
      spellcheck: false
    }
  })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', e => e.preventDefault())
  w.on('closed', () => {
    if (win === w) { win = null; ready = null }
  })
  win = w
  // Wie Hauptfenster und Schnellerfassung: im Entwicklungsmodus vom Vite-Server.
  const load = process.env.NODE_ENV === 'development'
    ? w.loadURL('http://localhost:5173/pdfraster.html')
    // Über den App-Pfad, nicht __dirname: als nachgeladener Chunk liegt diese Datei in out/main/chunks.
    : w.loadFile(path.join(app.getAppPath(), 'out', 'renderer', 'pdfraster.html'))
  ready = load.then(async () => {
    // Das Modul-Skript läuft nach dem Laden; kurz warten, bis die Schnittstelle steht.
    for (let i = 0; i < 50; i++) {
      if (await w.webContents.executeJavaScript('typeof window.__mgRaster === "object"')) return w
      await new Promise(r => setTimeout(r, 100))
    }
    throw new Error('PDF-Rasterer startet nicht')
  })
  ready.catch(() => closeIfCurrent(w))
  return ready
}

function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => { closeRasterWindow(); reject(new Error('Seite zu langsam gerendert')) }, ms)
    const onAbort = (): void => { clearTimeout(t); closeRasterWindow(); reject(new Error('Abgebrochen')) }
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
    p.then(
      v => { clearTimeout(t); signal?.removeEventListener('abort', onAbort); resolve(v) },
      e => { clearTimeout(t); signal?.removeEventListener('abort', onAbort); reject(e) }
    )
  })
}

export interface RasterPage {
  page: number
  width: number
  height: number
  /** JPEG, base64, ohne Metadaten. */
  jpeg: string
}

/**
 * Rendert die angegebenen Seiten (1-basiert) mit langer Seite `maxSide` px. Ruft `onPage`
 * je Seite, damit der Aufrufer zwischendurch erkennen und das Budget prüfen kann; liefert
 * `onPage` false, wird abgebrochen.
 */
export function rasterPdfPages(
  pdf: Buffer,
  pages: number[],
  maxSide: number,
  onPage: (p: RasterPage) => Promise<boolean | void>,
  signal?: AbortSignal
): Promise<void> {
  const job = queue.then(async () => {
    if (idleTimer) clearTimeout(idleTimer)
    const w = await withTimeout(openWindow(), PAGE_TIMEOUT_MS, signal)
    try {
      await withTimeout(w.webContents.executeJavaScript(`window.__mgRaster.open(${JSON.stringify(pdf.toString('base64'))})`), PAGE_TIMEOUT_MS, signal)
      for (const n of pages) {
        const r = await withTimeout(
          w.webContents.executeJavaScript(`window.__mgRaster.render(${Number(n)}, ${Number(maxSide)})`) as Promise<{ width: number; height: number; jpeg: string }>,
          PAGE_TIMEOUT_MS,
          signal
        )
        if ((await onPage({ page: n, ...r })) === false) break
      }
    } finally {
      if (!w.isDestroyed()) await w.webContents.executeJavaScript('window.__mgRaster.close()').catch(() => undefined)
      scheduleClose()
    }
  })
  queue = job.catch(() => undefined)
  return job
}
