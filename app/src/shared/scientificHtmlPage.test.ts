import { describe, it, expect } from 'vitest'
import {
  buildScientificHtmlPage,
  looksLikeFullHtmlDocument,
  HTML_PAGE_ASSETS_DIRNAME
} from './scientificHtmlPage'

describe('buildScientificHtmlPage', () => {
  it('baut ein vollständiges Dokument mit Titel und Body', () => {
    const html = buildScientificHtmlPage({
      title: 'Gedämpfte Oszillatoren',
      bodyHtml: '<section><h2>1 Einleitung</h2><p>Inhalt</p></section>'
    })
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Gedämpfte Oszillatoren</title>')
    expect(html).toContain('<h1>Gedämpfte Oszillatoren</h1>')
    expect(html).toContain('<h2>1 Einleitung</h2>')
  })

  it('escaped HTML im Titel', () => {
    const html = buildScientificHtmlPage({ title: 'a < b & "c"', bodyHtml: '<p>x</p>' })
    expect(html).toContain('<title>a &lt; b &amp; &quot;c&quot;</title>')
    expect(html).not.toContain('<title>a < b')
  })

  it('referenziert KaTeX relativ aus dem Assets-Ordner (kein CDN)', () => {
    const html = buildScientificHtmlPage({ title: 'T', bodyHtml: '<p>x</p>' })
    expect(html).toContain(`${HTML_PAGE_ASSETS_DIRNAME}/katex/katex.min.css`)
    expect(html).toContain(`${HTML_PAGE_ASSETS_DIRNAME}/katex/katex.min.js`)
    expect(html).toContain(`${HTML_PAGE_ASSETS_DIRNAME}/katex/auto-render.min.js`)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('enthält die auto-render-Delimiter als korrekte JS-String-Literale', () => {
    const html = buildScientificHtmlPage({ title: 'T', bodyHtml: '<p>x</p>' })
    expect(html).toContain("{ left: '$$', right: '$$', display: true }")
    expect(html).toContain("{ left: '\\\\[', right: '\\\\]', display: true }")
    expect(html).toContain("{ left: '\\\\(', right: '\\\\)', display: false }")
  })

  it('Default-Sprache Deutsch, en schaltet Beschriftung um', () => {
    const de = buildScientificHtmlPage({ title: 'T', bodyHtml: '<p>x</p>' })
    expect(de).toContain('<html lang="de">')
    expect(de).toContain('"Abbildung " counter(figure)')
    const en = buildScientificHtmlPage({ title: 'T', bodyHtml: '<p>x</p>', lang: 'en' })
    expect(en).toContain('<html lang="en">')
    expect(en).toContain('"Figure " counter(figure)')
  })

  it('bringt die Nummerierungs-Zutaten mit (Counter für Gleichungen und Abbildungen)', () => {
    const html = buildScientificHtmlPage({ title: 'T', bodyHtml: '<p>x</p>' })
    expect(html).toContain('counter-reset: equation figure')
    expect(html).toContain('counter-increment: equation')
    expect(html).toContain('counter-increment: figure')
  })
})

describe('looksLikeFullHtmlDocument', () => {
  it('erkennt vollständige Dokumente', () => {
    expect(looksLikeFullHtmlDocument('<!DOCTYPE html><html>…')).toBe(true)
    expect(looksLikeFullHtmlDocument('<html lang="de">')).toBe(true)
    expect(looksLikeFullHtmlDocument('<body><p>x</p></body>')).toBe(true)
    expect(looksLikeFullHtmlDocument('<head><title>x</title></head>')).toBe(true)
  })

  it('lässt Body-Inhalt durch', () => {
    expect(looksLikeFullHtmlDocument('<section><h2>Titel</h2></section>')).toBe(false)
    expect(looksLikeFullHtmlDocument('<p>Text mit \\(x^2\\)</p>')).toBe(false)
    // Wortgrenze: <header> ist ein normales Body-Element, kein <head>
    expect(looksLikeFullHtmlDocument('<header class="paper">x</header>')).toBe(false)
  })
})
