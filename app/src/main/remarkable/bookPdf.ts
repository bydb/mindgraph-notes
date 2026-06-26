import { BrowserWindow, app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

// Rendert fertiges Body-HTML als reMarkable-Buch-PDF (157×210 mm, große Serifenschrift)
// und gibt die PDF-Bytes zurück. Dieselbe Optik wie der Markdown-Buch-Export (Weg A).

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

export async function renderReMarkableBookPdf(bodyHtml: string, title: string): Promise<Buffer> {
  const fullHtml = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>${title.replace(/</g, '&lt;')}</title>
  <style>${REMARKABLE_BOOK_CSS}</style>
</head>
<body>${bodyHtml}</body>
</html>`

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })

  const tempHtmlPath = path.join(app.getPath('temp'), `mindgraph-remarkable-book-${process.pid}-${win.id}.html`)
  try {
    await fs.writeFile(tempHtmlPath, fullHtml, 'utf-8')
    await win.loadFile(tempHtmlPath)
    // Sicherstellen, dass Schriften geladen + ein Frame gelayoutet ist, sonst kann
    // printToPDF in Electron eine leere Seite erfassen (Race nach loadFile).
    await win.webContents
      .executeJavaScript(
        'document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => r(true))))'
      )
      .catch(() => {})
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true // Seitengröße kommt aus @page (157×210 mm)
    })
    return pdfData
  } finally {
    if (!win.isDestroyed()) win.close()
    try {
      await fs.unlink(tempHtmlPath)
    } catch {
      /* ignore */
    }
  }
}
