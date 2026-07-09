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
