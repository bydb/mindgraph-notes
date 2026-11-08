// Seiten-Assets für write_html: kopiert die gebündelten KaTeX-Dateien
// (resources/html-page-assets/katex) beim Übernehmen einer HTML-Seite als
// `mindgraph-assets/katex/` in den Zielordner. Die Seite referenziert sie
// relativ — vollständig offline, funktioniert in der sandboxed HTML-Vorschau.
// Idempotent: vorhandene Dateien werden nie überschrieben (Mehrfach-Accepts,
// mehrere Seiten im selben Ordner).

import { promises as fs } from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { HTML_PAGE_ASSETS_DIRNAME } from '../../shared/scientificHtmlPage'

function bundledAssetsDir(): string {
  // Paket: resources/** liegt in app.asar, __dirname = <asar>/out/main (gleiches
  // Muster wie der Dock-Icon-Pfad in index.ts). Dev: app/resources direkt.
  return app.isPackaged
    ? path.join(__dirname, '../../resources/html-page-assets')
    : path.join(app.getAppPath(), 'resources', 'html-page-assets')
}

// readFile+writeFile statt fs.copyFile — liest zuverlässig aus app.asar.
async function copyMissingRecursive(srcDir: string, destDir: string): Promise<void> {
  const entries = await fs.readdir(srcDir, { withFileTypes: true })
  await fs.mkdir(destDir, { recursive: true })
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name)
    const dest = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      await copyMissingRecursive(src, dest)
      continue
    }
    if (!entry.isFile()) continue
    try {
      await fs.access(dest)
      continue // vorhanden — nicht überschreiben
    } catch {
      /* fehlt — kopieren */
    }
    await fs.writeFile(dest, await fs.readFile(src))
  }
}

/** Stellt sicher, dass neben einer übernommenen HTML-Seite die KaTeX-Assets liegen. */
export async function ensureHtmlPageAssets(targetDir: string): Promise<void> {
  const src = path.join(bundledAssetsDir(), 'katex')
  const dest = path.join(targetDir, HTML_PAGE_ASSETS_DIRNAME, 'katex')
  await copyMissingRecursive(src, dest)
}

/** Unterordner für Hausdesign-Logos neben übernommenen Seiten. */
export const HTML_BRAND_ASSET_DIR = 'brand'

/**
 * Hausdesign-Logo neben die Seite legen (Codex F07). Der Name ist inhaltsadressiert
 * (`logo-<sha12>.png`): ältere Seiten behalten ihr Logo, wenn das Profil später ein neues
 * bekommt, und gleiche Bytes werden nie doppelt geschrieben. Geschrieben wird exklusiv in eine
 * Zwischendatei und dann umbenannt — nie eine halbe Datei am Ziel. `destDir` muss der Aufrufer
 * vorher per assertSafePath geprüft haben.
 */
export async function ensureHtmlBrandLogo(destDir: string, fileName: string, bytes: Buffer): Promise<void> {
  if (!/^logo-[0-9a-f]{12}\.png$/.test(fileName)) throw new Error('Ungültiger Logo-Name')
  await fs.mkdir(destDir, { recursive: true })
  const dest = path.join(destDir, fileName)
  try {
    const st = await fs.lstat(dest)
    if (st.isFile()) return
    throw new Error('Logo-Ziel ist keine Datei')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  const tmp = path.join(destDir, `.${fileName}.${process.pid}.${Date.now()}.tmp`)
  await fs.writeFile(tmp, bytes, { flag: 'wx' })
  try {
    await fs.rename(tmp, dest)
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}
