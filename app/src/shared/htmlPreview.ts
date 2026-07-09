// HTML-Vorschau (Code-Editor): geteilte, pure Logik für das Custom-Protocol
// `mindgraph-preview://` — Renderer baut die iframe-URL, Main mappt sie zurück
// auf einen Dateisystem-Pfad und liefert die Datei pfad-validiert aus.
//
// Sicherheitsmodell:
// - Main prüft JEDEN Request via assertSafePath (approvedVaultRoots + realpath),
//   previewPathnameToFsPath ist nur die Vorstufe (Decode + Segment-Check).
// - Ausgelieferte HTML-Dokumente bekommen PREVIEW_DOCUMENT_CSP als Response-Header:
//   komplett offline (nur eigenes Scheme + data:/blob:), kein externer Host —
//   eine bösartige HTML-Datei im Vault hat keinen Exfiltrations-Kanal.
// - Das iframe im Renderer läuft zusätzlich mit sandbox ohne allow-same-origin
//   (opaque Origin, kein Zugriff auf App oder Protocol-Origin-Storage).

export const HTML_PREVIEW_SCHEME = 'mindgraph-preview'
export const HTML_PREVIEW_HOST = 'vault'

/** Dateien, für die der Code-Editor den Vorschau-Modus anbietet. */
export function isHtmlPreviewable(relativePath: string): boolean {
  return /\.html?$/i.test(relativePath)
}

/**
 * iframe-URL für eine Vault-Datei. Der komplette absolute Pfad wandert
 * segment-encodet in den URL-Pfad, damit relative Ressourcen (CSS/JS/Bilder
 * neben der HTML-Datei) über die normale URL-Auflösung funktionieren.
 */
export function buildHtmlPreviewUrl(vaultPath: string, relativePath: string): string {
  const segments = `${vaultPath}/${relativePath}`
    .split(/[/\\]/)
    .filter(Boolean)
    .map(encodeURIComponent)
  return `${HTML_PREVIEW_SCHEME}://${HTML_PREVIEW_HOST}/${segments.join('/')}`
}

/**
 * URL-Pathname → Dateisystem-Pfad. Gibt null bei kaputtem Encoding oder
 * Traversal-Segmenten zurück — Chromium normalisiert literale `..` zwar schon
 * beim Parsen, encodete Varianten (%2E%2E, %2F, %5C) landen aber erst nach dem
 * Decode hier. Finale Autorität bleibt assertSafePath im Main-Prozess.
 */
export function previewPathnameToFsPath(
  pathname: string,
  platform: NodeJS.Platform = process.platform
): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const segments = decoded.split('/').filter((s) => s !== '')
  if (segments.some((s) => s === '..' || s === '.' || s.includes('\\') || s.includes('\0'))) {
    return null
  }
  if (segments.length === 0) return null
  // Windows: erstes Segment ist der Laufwerksbuchstabe ("C:"), kein führender Slash
  if (platform === 'win32') return segments.join('\\')
  return '/' + segments.join('/')
}

const PREVIEW_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm'
}

export function previewMimeFor(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? filePath
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : ''
  return PREVIEW_MIME_TYPES[ext] ?? 'application/octet-stream'
}

// CSP für ausgelieferte HTML-Dokumente: Inline-Skripte/-Styles erlaubt (Standalone-
// Seiten brauchen das), aber KEIN externer Host in keiner Direktive — die Vorschau
// bleibt vollständig lokal. Scheme-Source zusätzlich zu 'self', weil das sandboxed
// iframe eine opaque Origin hat.
export const PREVIEW_DOCUMENT_CSP = [
  `default-src 'self' ${HTML_PREVIEW_SCHEME}: data: blob:`,
  `script-src 'self' ${HTML_PREVIEW_SCHEME}: 'unsafe-inline' 'unsafe-eval' data: blob:`,
  `style-src 'self' ${HTML_PREVIEW_SCHEME}: 'unsafe-inline' data: blob:`,
  `img-src 'self' ${HTML_PREVIEW_SCHEME}: data: blob:`,
  `font-src 'self' ${HTML_PREVIEW_SCHEME}: data: blob:`,
  `media-src 'self' ${HTML_PREVIEW_SCHEME}: data: blob:`,
  `connect-src 'self' ${HTML_PREVIEW_SCHEME}: data: blob:`,
  `frame-src 'self' ${HTML_PREVIEW_SCHEME}: data: blob:`,
  "form-action 'self'",
  "base-uri 'self'"
].join('; ')
