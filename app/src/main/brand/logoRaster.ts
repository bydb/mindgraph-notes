/**
 * Logo rastern und neu kodieren — ohne native Abhängigkeit (wie main/ocr/pdfRaster.ts).
 * Ein verstecktes Fenster ohne Preload, Sandbox an, Navigation gesperrt, lädt nur about:blank
 * und zeichnet das (bereits in shared/brandLogoCheck.ts geprüfte) Bild als data:-URL in ein
 * Canvas. SVG im Bild-Modus führt in Chromium nie Skripte aus und lädt nichts nach. Heraus
 * kommen nur neu kodierte PNG-Bytes und eine kleine Pixelprobe für den Farbvorschlag —
 * die Originaldatei landet nirgends (Codex F09).
 */

import { BrowserWindow } from 'electron'
import { SECURE_WEB_PREFERENCES } from '../windowSecurity'
import { checkLogoBytes, rasterTarget } from '../../shared/brandLogoCheck'

const TIMEOUT_MS = 20_000

export interface RasteredLogo {
  png: Buffer
  width: number
  height: number
  /** RGBA-Pixel einer ≤ 96-px-Fassung (für suggestPalette). */
  sample: Buffer
}

export async function rasterLogo(bytes: Uint8Array): Promise<RasteredLogo> {
  const check = checkLogoBytes(bytes)
  if (!check.ok) throw new Error(check.reason)
  const target = rasterTarget(check.width, check.height, { vector: check.kind === 'svg' })
  const mime = check.kind === 'svg' ? 'image/svg+xml' : check.kind === 'png' ? 'image/png' : 'image/jpeg'
  const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`

  const w = new BrowserWindow({
    show: false,
    width: 200,
    height: 200,
    // Eigene, flüchtige Sitzung: der Netzfilter unten darf die Standardsitzung der App nicht ersetzen.
    webPreferences: { ...SECURE_WEB_PREFERENCES, sandbox: true, spellcheck: false, partition: 'mg-brand-raster' }
  })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', e => e.preventDefault())
  // Nur data:-Bilder; jeder andere Netzaufruf wird abgewiesen (zweite Linie hinter der Prüfung).
  w.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*/*', 'file://*/*'] }, (_details, cb) => cb({ cancel: true }))
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await w.loadURL('about:blank')
    const script = `(async () => {
      const img = new Image();
      img.decoding = 'sync';
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Bild nicht lesbar')); img.src = ${JSON.stringify(dataUrl)}; });
      const W = ${target.width}, H = ${target.height};
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.clearRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
      const png = c.toDataURL('image/png').split(',')[1];
      const k = Math.min(1, 96 / Math.max(W, H));
      const sw = Math.max(1, Math.round(W * k)), sh = Math.max(1, Math.round(H * k));
      const s = document.createElement('canvas'); s.width = sw; s.height = sh;
      const sg = s.getContext('2d'); sg.drawImage(c, 0, 0, sw, sh);
      const px = sg.getImageData(0, 0, sw, sh).data;
      let bin = ''; for (let i = 0; i < px.length; i++) bin += String.fromCharCode(px[i]);
      return { png, sample: btoa(bin) };
    })()`
    const result = await Promise.race([
      w.webContents.executeJavaScript(script, true) as Promise<{ png: string; sample: string }>,
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('Logo konnte nicht gelesen werden (Zeitüberschreitung)')), TIMEOUT_MS) })
    ])
    if (!result || typeof result.png !== 'string' || typeof result.sample !== 'string') throw new Error('Logo konnte nicht gelesen werden')
    return {
      png: Buffer.from(result.png, 'base64'),
      width: target.width,
      height: target.height,
      sample: Buffer.from(result.sample, 'base64')
    }
  } finally {
    if (timer) clearTimeout(timer)
    if (!w.isDestroyed()) w.destroy()
  }
}
