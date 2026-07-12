// Export der HTML-Vorschau (Code-Editor) als PDF und EPUB.
//
// Beide Wege rendern die Seite in einem versteckten BrowserWindow über das
// bestehende mindgraph-preview://-Protokoll — damit gelten exakt dieselben
// Sicherheits- (assertSafePath pro Request, Offline-CSP) und Auflösungsregeln
// (relative CSS/JS/Fonts neben der Datei) wie in der sichtbaren Vorschau, und
// KaTeX hat sein auto-render bereits ausgeführt, bevor exportiert wird.
//
// PDF:  printToPDF auf das gerenderte Fenster (A4, wie der Notiz-PDF-Export).
// EPUB: das fertig gerenderte DOM wird als XHTML serialisiert (Mathe ist dann
//       KaTeX-HTML+CSS, kein Script nötig), Stylesheets werden zu styles.css
//       zusammengefasst, lokale Fonts/Bilder eingebettet (shared/epub.ts).

import { BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { SECURE_WEB_PREFERENCES } from './windowSecurity'
import {
  buildContainerXml,
  buildContentOpf,
  buildContentXhtml,
  buildNavXhtml,
  epubAssetName,
  epubIdForHref,
  epubMediaTypeFor,
  escapeXml,
  extractCssUrls,
  rewriteCssUrls,
  type EpubHeading,
  type EpubManifestItem
} from '../shared/epub'

const RENDER_TIMEOUT_MS = 20000

interface ExtractedStylesheet {
  css?: string
  href?: string
}

interface ExtractedPage {
  title: string
  lang: string
  bodyXhtml: string
  stylesheets: ExtractedStylesheet[]
  headings: EpubHeading[]
  images: Array<{ src: string; name: string }>
}

// Läuft in der gerenderten Seite. Reihenfolge ist wichtig: erst Heading-Ids im
// echten DOM vergeben, DANN klonen — der Klon trägt die Ids für das EPUB-Inhalts-
// verzeichnis. Skripte fliegen raus (auto-render ist schon gelaufen), Bild-Pfade
// werden auf EPUB-interne Namen umgeschrieben und die Originale zurückgemeldet.
const EXTRACT_PAGE_SCRIPT = `(() => {
  const headings = [];
  let hIdx = 0;
  document.querySelectorAll('h1, h2, h3').forEach((h) => {
    if (!h.id) h.id = 'mg-heading-' + (++hIdx);
    const text = (h.textContent || '').trim();
    if (text) headings.push({ level: Number(h.tagName[1]) || 1, id: h.id, text });
  });

  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('script, link, style, iframe').forEach((el) => el.remove());

  const images = [];
  clone.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) return;
    images.push({ src, name: '' });
    img.setAttribute('src', 'images/__MG_IMG_' + (images.length - 1) + '__');
  });

  const stylesheets = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((el) =>
    el.tagName === 'STYLE'
      ? { css: el.textContent || '' }
      : { href: el.getAttribute('href') || '' }
  );

  return {
    title: document.title || '',
    lang: document.documentElement.lang || 'de',
    bodyXhtml: new XMLSerializer().serializeToString(clone),
    stylesheets,
    headings,
    images
  };
})()`

// Warten bis die Seite wirklich fertig ist: Fonts geladen (KaTeX-woff2!), Bilder
// komplett, und zwei Frames für Layout nach dem auto-render-Durchlauf.
const WAIT_FOR_READY_SCRIPT = `(async () => {
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map((img) => img.complete
    ? Promise.resolve()
    : new Promise((res) => { img.addEventListener('load', res); img.addEventListener('error', res); })));
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return true;
})()`

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: Zeitüberschreitung beim Rendern`)), RENDER_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function createRenderWindow(previewUrl: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      // Vault-HTML ist fremder Inhalt — zusätzlich voll ge-sandboxed, kein Preload.
      sandbox: true
    }
  })
  try {
    await withTimeout(win.loadURL(previewUrl), 'html-export')
    await withTimeout(win.webContents.executeJavaScript(WAIT_FOR_READY_SCRIPT, true), 'html-export')
    return win
  } catch (err) {
    win.destroy()
    throw err
  }
}

export async function exportPreviewPdf(previewUrl: string, targetPath: string): Promise<void> {
  const win = await createRenderWindow(previewUrl)
  try {
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    })
    await fs.writeFile(targetPath, pdf)
  } finally {
    win.destroy()
  }
}

export interface EpubExportOptions {
  previewUrl: string
  /** Bereits via assertSafePath geprüfter absoluter Pfad der HTML-Quelldatei. */
  htmlPath: string
  targetPath: string
  /** assertSafePath aus main/index.ts — jede mitgelesene Ressource läuft da durch. */
  safePath: (p: string, op: string) => Promise<string>
}

export async function exportPreviewEpub(options: EpubExportOptions): Promise<{ warnings: string[] }> {
  const win = await createRenderWindow(options.previewUrl)
  let page: ExtractedPage
  try {
    page = await withTimeout(
      win.webContents.executeJavaScript(EXTRACT_PAGE_SCRIPT, true) as Promise<ExtractedPage>,
      'epub-export'
    )
  } finally {
    win.destroy()
  }

  const baseDir = path.dirname(options.htmlPath)
  const warnings: string[] = []
  // OEBPS-relativer Pfad → Dateiinhalt (Fonts + Bilder)
  const binaryAssets = new Map<string, Buffer>()

  const readLocalAsset = async (ref: string, relativeTo: string, op: string): Promise<Buffer | null> => {
    try {
      const decoded = decodeURIComponent(ref.split(/[?#]/)[0])
      const safe = await options.safePath(path.resolve(relativeTo, decoded), op)
      return await fs.readFile(safe)
    } catch {
      return null
    }
  }

  // Stylesheets in Dokumentreihenfolge zusammensetzen; Font-Referenzen einbetten.
  let fontIndex = 0
  const inlineCssAssets = async (css: string, cssDir: string): Promise<string> => {
    const mapping = new Map<string, string>()
    for (const ref of extractCssUrls(css)) {
      const data = await readLocalAsset(ref, cssDir, 'html-export-epub:css-asset')
      if (!data) continue // toter src-Eintrag ist harmlos (Reader nimmt den nächsten)
      const href = `fonts/${epubAssetName(ref, fontIndex++)}`
      binaryAssets.set(href, data)
      mapping.set(ref, href)
    }
    return rewriteCssUrls(css, mapping)
  }

  const cssParts: string[] = []
  for (const sheet of page.stylesheets) {
    if (sheet.css) {
      cssParts.push(await inlineCssAssets(sheet.css, baseDir))
    } else if (sheet.href && !/^[a-z][a-z0-9+.-]*:/i.test(sheet.href)) {
      try {
        const decoded = decodeURIComponent(sheet.href.split(/[?#]/)[0])
        const cssPath = await options.safePath(path.resolve(baseDir, decoded), 'html-export-epub:css')
        const raw = await fs.readFile(cssPath, 'utf-8')
        cssParts.push(await inlineCssAssets(raw, path.dirname(cssPath)))
      } catch {
        warnings.push(`Stylesheet nicht eingebettet: ${sheet.href}`)
      }
    }
  }

  // Bilder einbetten; Platzhalter aus dem Extraktions-Schritt auflösen.
  let bodyXhtml = page.bodyXhtml
  for (let i = 0; i < page.images.length; i++) {
    const image = page.images[i]
    const placeholder = `images/__MG_IMG_${i}__`
    const data = /^[a-z][a-z0-9+.-]*:/i.test(image.src)
      ? null
      : await readLocalAsset(image.src, baseDir, 'html-export-epub:img')
    if (data) {
      const href = `images/${epubAssetName(image.src, i)}`
      binaryAssets.set(href, data)
      bodyXhtml = bodyXhtml.split(placeholder).join(href)
    } else {
      warnings.push(`Bild nicht eingebettet: ${image.src}`)
      bodyXhtml = bodyXhtml.split(placeholder).join(escapeXml(image.src))
    }
  }

  const title = page.title.trim() || path.basename(options.htmlPath).replace(/\.html?$/i, '')
  const lang = page.lang.trim() || 'de'

  const manifestItems: EpubManifestItem[] = [
    { href: 'content.xhtml', id: epubIdForHref('content.xhtml'), mediaType: 'application/xhtml+xml' },
    { href: 'nav.xhtml', id: epubIdForHref('nav.xhtml'), mediaType: 'application/xhtml+xml', properties: 'nav' },
    { href: 'styles.css', id: epubIdForHref('styles.css'), mediaType: 'text/css' },
    ...[...binaryAssets.keys()].map((href) => ({
      href,
      id: epubIdForHref(href),
      mediaType: epubMediaTypeFor(href)
    }))
  ]

  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  // EPUB-Konvention: mimetype als ERSTER Eintrag, unkomprimiert.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', buildContainerXml())
  zip.file('OEBPS/content.opf', buildContentOpf({
    title,
    lang,
    identifier: crypto.randomUUID(),
    modified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    manifestItems
  }))
  zip.file('OEBPS/nav.xhtml', buildNavXhtml({ title, lang, headings: page.headings }))
  zip.file('OEBPS/content.xhtml', buildContentXhtml({ title, lang, bodyXhtml }))
  zip.file('OEBPS/styles.css', cssParts.join('\n\n'))
  for (const [href, data] of binaryAssets) {
    zip.file(`OEBPS/${href}`, data)
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await fs.writeFile(options.targetPath, buffer)
  return { warnings }
}
