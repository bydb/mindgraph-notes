import { describe, it, expect } from 'vitest'
import {
  buildScientificHtmlPage,
  extractArticleBody,
  extractAuthoredBodyHtml,
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

  it('weist KI-Provenienz maschinenlesbar und sichtbar aus', () => {
    const html = buildScientificHtmlPage({ title: 'T', bodyHtml: '<p>x</p>', aiModel: 'qwen3.6:27b-mlx' })
    expect(html).toContain('<meta name="ki-modell" content="qwen3.6:27b-mlx">')
    expect(html).toContain('Erstellt mit KI-Modell: qwen3.6:27b-mlx')
  })

  it('englische Seiten bekommen die englische Fußzeile', () => {
    const html = buildScientificHtmlPage({ title: 'T', bodyHtml: '<p>x</p>', lang: 'en', aiModel: 'gemma4:latest' })
    expect(html).toContain('Generated with AI model: gemma4:latest')
  })

  it('ohne Modell bleibt die Seite unmarkiert statt falsch markiert', () => {
    const html = buildScientificHtmlPage({ title: 'T', bodyHtml: '<p>x</p>' })
    expect(html).not.toContain('ki-modell')
    expect(html).not.toContain('ai-provenance">')
  })

  // Im Vault lag eine am 30.07.2026 erzeugte Seite mit `<meta name="ki-modell">`,
  // aber LEERER Fußzeile — maschinenlesbar markiert, für den Leser unsichtbar.
  // Der heutige Builder kann das nicht erzeugen (beide stammen aus derselben
  // Prüfung); dieser Test hält das fest, damit die zwei Kennzeichnungen nicht
  // wieder auseinanderlaufen können.
  it('trägt Kennzeichnung nie nur maschinenlesbar — meta und Fußzeile kommen zusammen', () => {
    for (const model of ['qwen3.6:27b-mlx', 'openrouter/moonshotai/kimi-k3', 'llmbase/deepseek/deepseek-v4-pro']) {
      for (const lang of ['de', 'en']) {
        const html = buildScientificHtmlPage({ title: 'T', bodyHtml: '<p>x</p>', lang, aiModel: model })
        const hasMeta = html.includes(`<meta name="ki-modell" content="${model}">`)
        const footer = html.match(/<footer class="ai-provenance">([\s\S]*?)<\/footer>/)
        expect(hasMeta).toBe(true)
        expect(footer?.[1].trim()).toContain(model)
      }
    }
  })

  it('erzeugt keine leere Fußzeile, wenn das Modell nur aus Leerraum besteht', () => {
    const html = buildScientificHtmlPage({ title: 'T', bodyHtml: '<p>x</p>', aiModel: '   ' })
    expect(html).not.toContain('ai-provenance">')
    expect(html).not.toContain('ki-modell')
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

describe('extractArticleBody', () => {
  it('zieht den Inhalt aus <body>…</body> (Selbstheilung für Komplett-Dokumente)', () => {
    const doc = '<!DOCTYPE html>\n<html lang="de">\n<head><title>T</title><style>p{}</style></head>\n<body>\n<section><h2>1 Einleitung</h2><p>Inhalt</p></section>\n</body>\n</html>'
    expect(extractArticleBody(doc)).toBe('<section><h2>1 Einleitung</h2><p>Inhalt</p></section>')
  })

  it('greedy bis zum letzten </body> — Codebeispiele mit </body> im Inhalt bleiben erhalten', () => {
    const doc = '<body><p>a</p><pre>&lt;/body&gt;</pre><p>b</p></body>'
    expect(extractArticleBody(doc)).toBe('<p>a</p><pre>&lt;/body&gt;</pre><p>b</p>')
  })

  it('Gerüst ohne <body>-Paar: doctype/html/head-Reste werden entfernt', () => {
    const doc = '<!DOCTYPE html><html><head><title>T</title></head><section><p>Inhalt</p></section></html>'
    expect(extractArticleBody(doc)).toBe('<section><p>Inhalt</p></section>')
  })

  it('Attribute auf body werden mitentfernt', () => {
    expect(extractArticleBody('<body class="paper" data-x="1"><p>x</p></body>')).toBe('<p>x</p>')
  })

  it('null wenn nichts Brauchbares übrig bleibt', () => {
    expect(extractArticleBody('<!DOCTYPE html><html><head><title>T</title></head><body></body></html>')).toBe(null)
    expect(extractArticleBody('<html></html>')).toBe(null)
  })
})

// Rundlauf: erzeugte Seite → Anhang → Korrektur → wieder erzeugte Seite.
// Ohne extractAuthoredBodyHtml kam das App-Gerüst mit zurück und die neue Datei trug
// ein </article> ohne Partner (real aufgetreten, 01.09.2026).
describe('extractAuthoredBodyHtml', () => {
  const bodyHtml = '<style>.x{color:red}</style>\n<div class="ab-kopf">Kopf</div>\n<p>Inhalt</p>'

  it('liefert exakt den verfassten Teil zurück', () => {
    const page = buildScientificHtmlPage({ title: 'Titel', bodyHtml, aiModel: 'testmodell' })
    expect(extractAuthoredBodyHtml(page)).toBe(bodyHtml)
  })

  it('lässt weder Kopfzeile noch KI-Fußzeile noch article-Tags durch', () => {
    const page = buildScientificHtmlPage({ title: 'Titel', bodyHtml, aiModel: 'testmodell' })
    const authored = extractAuthoredBodyHtml(page) as string
    expect(authored).not.toContain('<article')
    expect(authored).not.toContain('</article>')
    expect(authored).not.toContain('header class="paper"')
    expect(authored).not.toContain('ai-provenance')
  })

  it('funktioniert auch ohne KI-Fußzeile (kein Modell gesetzt)', () => {
    const page = buildScientificHtmlPage({ title: 'Titel', bodyHtml })
    expect(extractAuthoredBodyHtml(page)).toBe(bodyHtml)
  })

  it('ist stabil über zwei Runden', () => {
    const first = buildScientificHtmlPage({ title: 'Titel', bodyHtml, aiModel: 'testmodell' })
    const back = extractAuthoredBodyHtml(first) as string
    const second = buildScientificHtmlPage({ title: 'Titel', bodyHtml: back, aiModel: 'testmodell' })
    expect(extractAuthoredBodyHtml(second)).toBe(bodyHtml)
    expect((second.match(/<\/article>/g) || []).length).toBe(1)
  })

  it('gibt null für fremdes HTML ohne article zurück', () => {
    expect(extractAuthoredBodyHtml('<html><body><p>fremd</p></body></html>')).toBeNull()
  })
})
