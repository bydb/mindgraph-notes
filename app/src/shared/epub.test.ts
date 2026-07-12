import { describe, it, expect } from 'vitest'
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
  rewriteCssUrls
} from './epub'

describe('escapeXml', () => {
  it('escaped alle fünf XML-Sonderzeichen', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;')
  })
})

describe('epubIdForHref / epubMediaTypeFor / epubAssetName', () => {
  it('erzeugt NCName-taugliche Manifest-Ids', () => {
    expect(epubIdForHref('fonts/KaTeX Main (1).woff2')).toBe('item-fonts_KaTeX_Main_1_.woff2')
  })

  it('kennt die Kern-Medientypen', () => {
    expect(epubMediaTypeFor('content.xhtml')).toBe('application/xhtml+xml')
    expect(epubMediaTypeFor('fonts/a.woff2')).toBe('font/woff2')
    expect(epubMediaTypeFor('images/x.svg')).toBe('image/svg+xml')
    expect(epubMediaTypeFor('unbekannt.xyz')).toBe('application/octet-stream')
  })

  it('macht Asset-Namen eindeutig und zip-sicher', () => {
    expect(epubAssetName('fonts/KaTeX_Main-Regular.woff2', 3)).toBe('3-KaTeX_Main-Regular.woff2')
    expect(epubAssetName('ä ö/bild (neu).png', 0)).toBe('0-bild_neu_.png')
  })
})

describe('buildContainerXml / buildContentOpf', () => {
  it('container.xml zeigt auf OEBPS/content.opf', () => {
    expect(buildContainerXml()).toContain('full-path="OEBPS/content.opf"')
  })

  it('content.opf enthält Metadaten, Manifest und Spine', () => {
    const opf = buildContentOpf({
      title: 'Handschrift & KI',
      lang: 'de',
      identifier: '123e4567-e89b-12d3-a456-426614174000',
      modified: '2026-07-12T08:00:00Z',
      manifestItems: [
        { href: 'content.xhtml', id: epubIdForHref('content.xhtml'), mediaType: 'application/xhtml+xml' },
        { href: 'nav.xhtml', id: epubIdForHref('nav.xhtml'), mediaType: 'application/xhtml+xml', properties: 'nav' }
      ]
    })
    expect(opf).toContain('<dc:title>Handschrift &amp; KI</dc:title>')
    expect(opf).toContain('urn:uuid:123e4567-e89b-12d3-a456-426614174000')
    expect(opf).toContain('property="dcterms:modified">2026-07-12T08:00:00Z</meta>')
    expect(opf).toContain('properties="nav"')
    expect(opf).toContain(`<itemref idref="${epubIdForHref('content.xhtml')}"/>`)
  })
})

describe('buildNavXhtml / buildContentXhtml', () => {
  it('nav verlinkt Überschriften mit Ankern und escaped Text', () => {
    const nav = buildNavXhtml({
      title: 'Titel',
      lang: 'de',
      headings: [
        { level: 1, id: 'h1', text: 'Kognitives Offloading' },
        { level: 2, id: 'h2', text: 'Begriffe & Grenzen' }
      ]
    })
    expect(nav).toContain('href="content.xhtml#h1"')
    expect(nav).toContain('Begriffe &amp; Grenzen')
    expect(nav).toContain('epub:type="toc"')
  })

  it('nav ohne Überschriften fällt auf einen Dokument-Link zurück', () => {
    const nav = buildNavXhtml({ title: 'Titel', lang: 'en', headings: [] })
    expect(nav).toContain('<a href="content.xhtml">Titel</a>')
  })

  it('content.xhtml bettet den serialisierten Body zwischen head und </html>', () => {
    const xhtml = buildContentXhtml({
      title: 'T',
      lang: 'de',
      bodyXhtml: '<body xmlns="http://www.w3.org/1999/xhtml"><p>Hallo</p></body>'
    })
    expect(xhtml).toContain('<link rel="stylesheet" type="text/css" href="styles.css"/>')
    expect(xhtml).toContain('<body xmlns="http://www.w3.org/1999/xhtml"><p>Hallo</p></body>\n</html>')
  })
})

describe('extractCssUrls / rewriteCssUrls', () => {
  const css = `@font-face {
    font-family: KaTeX_Main;
    src: url(fonts/KaTeX_Main-Regular.woff2) format('woff2'),
         url("fonts/KaTeX_Main-Regular.woff") format('woff'),
         url('fonts/KaTeX_Main-Regular.ttf') format('truetype');
  }
  .logo { background: url(data:image/png;base64,AAA=); }
  .ext { background: url(https://example.org/x.png); }`

  it('findet nur lokale Referenzen (keine data:/https:-URLs)', () => {
    expect(extractCssUrls(css).sort()).toEqual([
      'fonts/KaTeX_Main-Regular.ttf',
      'fonts/KaTeX_Main-Regular.woff',
      'fonts/KaTeX_Main-Regular.woff2'
    ])
  })

  it('schreibt gemappte Referenzen um und lässt den Rest stehen', () => {
    const mapping = new Map([['fonts/KaTeX_Main-Regular.woff2', 'fonts/0-KaTeX_Main-Regular.woff2']])
    const out = rewriteCssUrls(css, mapping)
    expect(out).toContain('url(fonts/0-KaTeX_Main-Regular.woff2)')
    expect(out).toContain('url("fonts/KaTeX_Main-Regular.woff")')
    expect(out).toContain('url(data:image/png;base64,AAA=)')
    expect(out).toContain('url(https://example.org/x.png)')
  })

  it('leeres Mapping lässt das CSS unverändert', () => {
    expect(rewriteCssUrls(css, new Map())).toBe(css)
  })
})
