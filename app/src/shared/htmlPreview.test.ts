import { describe, it, expect } from 'vitest'
import {
  buildHtmlPreviewUrl,
  previewPathnameToFsPath,
  previewMimeFor,
  isHtmlPreviewable,
  HTML_PREVIEW_SCHEME,
  PREVIEW_DOCUMENT_CSP
} from './htmlPreview'

describe('isHtmlPreviewable', () => {
  it('erkennt .html und .htm (case-insensitiv)', () => {
    expect(isHtmlPreviewable('docs/index.html')).toBe(true)
    expect(isHtmlPreviewable('Seite.HTM')).toBe(true)
    expect(isHtmlPreviewable('seite.HTML')).toBe(true)
  })

  it('lehnt andere Extensions ab', () => {
    expect(isHtmlPreviewable('index.ts')).toBe(false)
    expect(isHtmlPreviewable('notiz.md')).toBe(false)
    expect(isHtmlPreviewable('html')).toBe(false)
    expect(isHtmlPreviewable('foo.html.bak')).toBe(false)
  })
})

describe('buildHtmlPreviewUrl → previewPathnameToFsPath (Roundtrip)', () => {
  it('stellt den absoluten Pfad wieder her (POSIX)', () => {
    const url = buildHtmlPreviewUrl('/Users/jo/Vault', 'website/index.html')
    const pathname = new URL(url).pathname
    expect(previewPathnameToFsPath(pathname, 'darwin')).toBe('/Users/jo/Vault/website/index.html')
  })

  it('übersteht Leerzeichen, Umlaute und Emoji in Pfaden', () => {
    const url = buildHtmlPreviewUrl('/Users/jo/Mein Vault', '800 - 🧠 brain/Übersicht.html')
    const pathname = new URL(url).pathname
    expect(previewPathnameToFsPath(pathname, 'darwin')).toBe(
      '/Users/jo/Mein Vault/800 - 🧠 brain/Übersicht.html'
    )
  })

  it('mappt Windows-Pfade mit Laufwerksbuchstabe', () => {
    const url = buildHtmlPreviewUrl('C:\\Users\\jo\\Vault', 'site\\index.html')
    const pathname = new URL(url).pathname
    expect(previewPathnameToFsPath(pathname, 'win32')).toBe('C:\\Users\\jo\\Vault\\site\\index.html')
  })

  it('nutzt das erwartete Scheme', () => {
    expect(buildHtmlPreviewUrl('/v', 'a.html').startsWith(`${HTML_PREVIEW_SCHEME}://vault/`)).toBe(true)
  })
})

describe('previewPathnameToFsPath — Traversal-Abwehr', () => {
  it('lehnt encodete ..-Segmente ab', () => {
    expect(previewPathnameToFsPath('/Users/jo/%2E%2E/secret', 'darwin')).toBeNull()
    expect(previewPathnameToFsPath('/Users/jo/..%2Fsecret', 'darwin')).toBeNull()
    expect(previewPathnameToFsPath('/a/../b', 'darwin')).toBeNull()
    expect(previewPathnameToFsPath('/a/./b', 'darwin')).toBeNull()
  })

  it('lehnt Backslash- und Nullbyte-Segmente ab', () => {
    expect(previewPathnameToFsPath('/a/foo%5C..%5Cbar', 'win32')).toBeNull()
    expect(previewPathnameToFsPath('/a/foo%00.html', 'darwin')).toBeNull()
  })

  it('lehnt kaputtes Encoding und leere Pfade ab', () => {
    expect(previewPathnameToFsPath('/a/%E0%A4%A', 'darwin')).toBeNull()
    expect(previewPathnameToFsPath('/', 'darwin')).toBeNull()
  })
})

describe('previewMimeFor', () => {
  it('liefert korrekte MIME-Types mit charset für Text-Formate', () => {
    expect(previewMimeFor('/v/index.html')).toBe('text/html; charset=utf-8')
    expect(previewMimeFor('/v/Seite.HTM')).toBe('text/html; charset=utf-8')
    expect(previewMimeFor('/v/style.css')).toBe('text/css; charset=utf-8')
    expect(previewMimeFor('/v/app.js')).toBe('text/javascript; charset=utf-8')
    expect(previewMimeFor('C:\\v\\logo.png')).toBe('image/png')
  })

  it('fällt auf octet-stream zurück', () => {
    expect(previewMimeFor('/v/datei.xyz')).toBe('application/octet-stream')
    expect(previewMimeFor('/v/ohne-extension')).toBe('application/octet-stream')
    expect(previewMimeFor('/v/.hidden')).toBe('application/octet-stream')
  })
})

describe('PREVIEW_DOCUMENT_CSP', () => {
  it('enthält keine externen Hosts (Vorschau bleibt offline)', () => {
    expect(PREVIEW_DOCUMENT_CSP).not.toMatch(/https?:/)
  })

  it('erlaubt Inline-Skripte für Standalone-Seiten', () => {
    expect(PREVIEW_DOCUMENT_CSP).toContain("script-src 'self' mindgraph-preview: 'unsafe-inline'")
  })
})
