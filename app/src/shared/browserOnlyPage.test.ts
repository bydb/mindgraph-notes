import { describe, expect, it } from 'vitest'
import { detectBrowserOnlyPage, visibleText } from './browserOnlyPage'

// Nachgebaut nach den gemessenen Seiten (06.11.2026), auf das Wesentliche gekürzt.
const nav = '<nav><a href="/">Start</a><a href="/shop">Shop</a><a href="/cart">Warenkorb</a></nav>'
const longProse = '<p>' + 'Ein ganz normaler Absatz mit Inhalt, der ohne Skripte lesbar ist. '.repeat(20) + '</p>'

describe('detectBrowserOnlyPage', () => {
  it('Stockist-Händlersuche ohne Händler im Text (bdkparfums.com)', () => {
    const html = `<html><head><script src="x.js"></script></head><body>${nav}<h2>Discover our points of sale</h2><stockist-store-locator data-stockist-widget-tag="map_x"></stockist-store-locator><script src="https://stockist.co/embed/v1/widget.min.js"></script></body></html>`
    expect(detectBrowserOnlyPage({ html, text: '## Discover our points of sale\n\nLoading Stockist Store Locator...', url: 'https://bdkparfums.com/en/pages/stores' })).toBe('locator')
  })

  it('Progus-Widget im iframe, nur Warenkorb-Text (marcantoinebarrois.com)', () => {
    const html = `<html><body>${nav}<p>Your cart is empty.</p><iframe src="https://sl-widget.proguscommerce.com/main?shop=x"></iframe><script></script></body></html>`
    expect(detectBrowserOnlyPage({ html, text: 'Your cart is empty. Continue browsing', url: 'https://marcantoinebarrois.com/en/pages/store-locator' })).toBe('locator')
  })

  it('Filialsuche am Pfad nur bei praktisch leerer Seite (dm.de/store)', () => {
    const html = `<html><body><div id="app"></div><script src="app.js"></script></body></html>`
    expect(detectBrowserOnlyPage({ html, text: '', url: 'https://www.dm.de/store' })).toBe('locator')
    // Apple: Navigationstext ohne Widget → nicht mehr gemeldet (F15: Pfad allein reicht nicht).
    expect(detectBrowserOnlyPage({ html, text: 'Store finden Suche nach Standort, PLZ oder Store Name', url: 'https://www.apple.com/de/retail/' })).toBeNull()
  })

  it('Händlerseite MIT Adressen bleibt lesbar', () => {
    const html = `<html><body><script></script><ul><li>Goethestraße 27, 60313 Frankfurt</li><li>Rosenstraße 6, 63450 Hanau</li></ul></body></html>`
    expect(detectBrowserOnlyPage({ html, text: 'Goethestraße 27, 60313 Frankfurt\nRosenstraße 6, 63450 Hanau', url: 'https://example.com/stores' })).toBeNull()
  })

  it('Adresse nur im Roh-HTML, Aufbereitung verlor sie (ikea.com): kein Browser-Hinweis', () => {
    const html = `<html><body><script></script>${nav}<section><h2>Öffnungszeiten</h2><p>Mo–Sa 10:00–20:00</p><p>Am Holzweg 2, 65830 Kriftel</p></section>${longProse}</body></html>`
    expect(detectBrowserOnlyPage({ html, text: '[Zu Hauptinhalt springen](#x)', url: 'https://www.ikea.com/de/de/stores/frankfurt/' })).toBeNull()
  })

  it('Skript-Hülle ohne Inhalt (web.telegram.org)', () => {
    const html = `<html><head><title>Telegram</title><script src="main.js"></script></head><body><div id="root"></div></body></html>`
    expect(detectBrowserOnlyPage({ html, text: '', url: 'https://web.telegram.org/a/' })).toBe('shell')
  })

  it('Seite ohne Skript ist nie eine Hülle', () => {
    expect(detectBrowserOnlyPage({ html: '<html><body><p>kurz</p></body></html>', text: 'kurz', url: 'https://example.com/stores' })).toBeNull()
  })

  it('normaler Artikel mit Skripten bleibt unberührt', () => {
    const html = `<html><body><script src="a.js"></script><article>${longProse}</article></body></html>`
    expect(detectBrowserOnlyPage({ html, text: longProse.replace(/<[^>]+>/g, ''), url: 'https://example.com/news/stores-closing-2026' })).toBeNull()
  })

  it('Pfad trifft nur ganze Pfadteile', () => {
    const html = `<html><body><script></script>${nav}<p>Ein kurzer, aber echter Text ohne Adresse, der weit über dreihundert Zeichen lang ist, damit er nicht als Hülle gilt. ${'Noch mehr Text. '.repeat(20)}</p></body></html>`
    const text = 'Ein kurzer, aber echter Text ohne Adresse. ' + 'Noch mehr Text. '.repeat(20)
    expect(detectBrowserOnlyPage({ html, text, url: 'https://example.com/restore/anleitung' })).toBeNull()
    // Lesbarer Text unter einem Händlerpfad bleibt Quelle (F15).
    expect(detectBrowserOnlyPage({ html, text, url: 'https://example.com/de/filialen' })).toBeNull()
  })

  it('langer Text ohne Adressen unter einem Händlerpfad ist keine leere Suche', () => {
    const html = `<html><body><script></script><article>${longProse}${longProse}${longProse}${longProse}</article></body></html>`
    const text = 'x'.repeat(6000)
    expect(detectBrowserOnlyPage({ html, text, url: 'https://en.wikipedia.org/wiki/Retail' })).toBeNull()
  })
})

describe('visibleText', () => {
  it('entfernt Skripte, Stile, Vorlagen, SVG und Kopf', () => {
    const html = '<html><head><title>T</title><style>a{}</style></head><body><script>var x="Hanau"</script><template><p>V</p></template><svg><text>S</text></svg><p>Sichtbar&nbsp;hier</p></body></html>'
    expect(visibleText(html)).toBe('Sichtbar hier')
  })
})

describe('detectBrowserOnlyPage: Gegenbeispiele aus Codex F15/F16', () => {
  const page = (body: string) => `<html><body><script src="analytics.js"></script>${body}</body></html>`

  it('lesbare Filialliste ohne Postleitzahl unter /stores bleibt Quelle', () => {
    const t = 'Berlin: Alexanderplatz, täglich 10–20 Uhr. Hamburg: Jungfernstieg, täglich 10–20 Uhr.'
    expect(detectBrowserOnlyPage({ html: page(`<p>${t}</p>`), text: t, url: 'https://x.de/stores' })).toBeNull()
  })

  it('einzelner Laden mit einer Adresse bleibt Quelle', () => {
    const t = 'Unser Laden: Goethestraße 27, Frankfurt. Mo–Sa 10–19 Uhr.'
    expect(detectBrowserOnlyPage({ html: page(`<p>${t}</p>`), text: t, url: 'https://x.de/store' })).toBeNull()
  })

  it('kurze echte Meldung mit Analyseskript ist keine Hülle', () => {
    const t = 'Entscheidung: Der Termin ist am 12. November.'
    expect(detectBrowserOnlyPage({ html: page(`<p>${t}</p>`), text: t, url: 'https://x.de/news/termin' })).toBeNull()
  })

  it('kurze Preisangabe ist keine Hülle', () => {
    const t = 'Preis: 49 € inkl. MwSt.'
    expect(detectBrowserOnlyPage({ html: page(`<p>${t}</p>`), text: t, url: 'https://x.de/produkt' })).toBeNull()
  })

  it('Widget mit langer lesbarer Liste bleibt Quelle', () => {
    const t = 'Händler in Hessen: ' + 'Parfümerie Beispiel, Innenstadt, Mo–Sa geöffnet. '.repeat(60)
    expect(detectBrowserOnlyPage({ html: page(`<p>${t}</p><stockist-store-locator></stockist-store-locator>`), text: t, url: 'https://x.de/stores' })).toBeNull()
  })
})
