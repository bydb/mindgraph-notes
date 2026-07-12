// Pure EPUB-3-Assembly für den HTML-Vorschau-Export (Code-Editor → EPUB).
//
// Ansatz: Die Seite wird im Main-Prozess über das mindgraph-preview://-Protokoll
// gerendert (KaTeX läuft wie in der Vorschau), dann wird das FERTIG gerenderte DOM
// als XHTML serialisiert und hier zu einem EPUB-Container zusammengesetzt. LaTeX
// muss im Reader also nie ausgeführt werden — Mathe ist bereits KaTeX-HTML+CSS,
// die zugehörigen woff2-Fonts werden eingebettet.
//
// Alles in dieser Datei ist pur (String/XML-Bau) — IO und BrowserWindow leben in
// main/htmlExport.ts.

export interface EpubHeading {
  /** 1–3 (h1–h3) */
  level: number
  /** Anker-Id im content.xhtml */
  id: string
  text: string
}

export interface EpubManifestItem {
  /** Pfad relativ zu OEBPS/, z.B. 'fonts/KaTeX_Main-Regular.woff2' */
  href: string
  id: string
  mediaType: string
  /** z.B. 'nav' für das Navigationsdokument */
  properties?: string
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Manifest-Id aus einem OEBPS-relativen Pfad (nur NCName-taugliche Zeichen). */
export function epubIdForHref(href: string): string {
  return 'item-' + href.replace(/[^A-Za-z0-9_.-]+/g, '_')
}

const EPUB_MEDIA_TYPES: Record<string, string> = {
  '.xhtml': 'application/xhtml+xml',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

export function epubMediaTypeFor(href: string): string {
  const dot = href.lastIndexOf('.')
  const ext = dot >= 0 ? href.slice(dot).toLowerCase() : ''
  return EPUB_MEDIA_TYPES[ext] ?? 'application/octet-stream'
}

export function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`
}

export interface ContentOpfOptions {
  title: string
  /** BCP-47, z.B. 'de' oder 'en' */
  lang: string
  /** Eindeutige Kennung (UUID) */
  identifier: string
  /** dcterms:modified — CCYY-MM-DDThh:mm:ssZ (ohne Millisekunden) */
  modified: string
  /** Alle Dateien unter OEBPS/ außer content.opf selbst. */
  manifestItems: EpubManifestItem[]
}

export function buildContentOpf(options: ContentOpfOptions): string {
  const manifest = options.manifestItems
    .map((item) => {
      const props = item.properties ? ` properties="${escapeXml(item.properties)}"` : ''
      return `    <item id="${escapeXml(item.id)}" href="${escapeXml(item.href)}" media-type="${escapeXml(item.mediaType)}"${props}/>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${escapeXml(options.lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:${escapeXml(options.identifier)}</dc:identifier>
    <dc:title>${escapeXml(options.title)}</dc:title>
    <dc:language>${escapeXml(options.lang)}</dc:language>
    <meta property="dcterms:modified">${escapeXml(options.modified)}</meta>
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine>
    <itemref idref="${escapeXml(epubIdForHref('content.xhtml'))}"/>
  </spine>
</package>
`
}

export interface NavXhtmlOptions {
  title: string
  lang: string
  headings: EpubHeading[]
}

export function buildNavXhtml(options: NavXhtmlOptions): string {
  const items = options.headings.length > 0
    ? options.headings
        .map((h) => {
          const level = Math.min(Math.max(Math.trunc(h.level) || 1, 1), 3)
          return `      <li class="toc-level-${level}"><a href="content.xhtml#${escapeXml(h.id)}">${escapeXml(h.text)}</a></li>`
        })
        .join('\n')
    : `      <li><a href="content.xhtml">${escapeXml(options.title)}</a></li>`

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(options.lang)}" xml:lang="${escapeXml(options.lang)}">
<head>
  <title>${escapeXml(options.title)}</title>
  <style>li.toc-level-2 { margin-left: 1.2em; } li.toc-level-3 { margin-left: 2.4em; }</style>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${escapeXml(options.title)}</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>
`
}

export interface ContentXhtmlOptions {
  title: string
  lang: string
  /**
   * Vollständiges, XML-serialisiertes <body>-Element (XMLSerializer aus dem
   * gerenderten DOM — wohlgeformt, Skripte bereits entfernt).
   */
  bodyXhtml: string
}

export function buildContentXhtml(options: ContentXhtmlOptions): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(options.lang)}" xml:lang="${escapeXml(options.lang)}">
<head>
  <title>${escapeXml(options.title)}</title>
  <meta charset="utf-8"/>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
${options.bodyXhtml}
</html>
`
}

/** Alle lokalen url(...)-Referenzen eines Stylesheets (ohne data:/http:/…-URLs). */
export function extractCssUrls(css: string): string[] {
  const found = new Set<string>()
  const re = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^)'"\s][^)]*?))\s*\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(css)) !== null) {
    const ref = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (!ref || ref.startsWith('data:') || ref.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue
    found.add(ref)
  }
  return [...found]
}

/**
 * Schreibt url(...)-Referenzen auf neue (EPUB-interne) Pfade um. Referenzen ohne
 * Mapping bleiben unangetastet — tote Einträge in font-src-Listen sind harmlos,
 * Reader fallen auf den nächsten Eintrag zurück.
 */
export function rewriteCssUrls(css: string, mapping: Map<string, string>): string {
  if (mapping.size === 0) return css
  return css.replace(
    /url\(\s*(?:'([^']*)'|"([^"]*)"|([^)'"\s][^)]*?))\s*\)/g,
    (full, single: string | undefined, double: string | undefined, bare: string | undefined) => {
      const ref = (single ?? double ?? bare ?? '').trim()
      const mapped = mapping.get(ref)
      return mapped ? `url(${mapped})` : full
    }
  )
}

/** Dateiname für eingebettete Assets: eindeutig + zip-/reader-sicher. */
export function epubAssetName(ref: string, index: number): string {
  const base = ref.split(/[/\\]/).pop() || 'asset'
  const safe = base.replace(/[^A-Za-z0-9_.-]+/g, '_')
  return `${index}-${safe}`
}
