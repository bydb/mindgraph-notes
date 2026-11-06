// Erkennt Seiten, deren Inhalt erst im Browser entsteht (Skript-Hülle, Händlersuche mit Karte).
// Die Webrecherche führt keine Skripte aus (`fetchAndExtract`). Ohne diese Erkennung kam bei
// solchen Seiten nur der Rahmen beim Modell an, und die Antwort lautete „keine Verkaufsstellen
// gefunden“, obwohl der Hersteller sie listet (real 06.11.2026, BDK Parfums / Marc-Antoine Barrois).
// Gemessen an 15 Seiten: docs/codex-collab/web-render-stufe-a.md, Abschnitt „Messung Schritt 0“.
//
// Lieber eine Seite zu wenig als zu viel melden: eine gemeldete Seite fällt als Quelle weg.
// Codex F15/F16 (Runde 2): Pfad allein und „kurzer Text“ reichten nicht — eine lesbare
// `/stores`-Seite ohne Postleitzahlen und eine kurze Meldung mit Analyseskript wurden verworfen.
// Jetzt: Händler-Widget im HTML, oder Händlerpfad mit praktisch leerem Text, oder praktisch leere Seite.

export type BrowserOnlyKind = 'shell' | 'locator'

/** „Praktisch leer“: so wenig Text, dass keine Aussage darin stehen kann (dm 0, telegram 0). Ein Satz hat mehr. */
const EMPTY_MAX_CHARS = 20
/** Mit Händler-Widget: Text bleibt kurz, wenn die Liste fehlt (bdk 98, barrois 1 304). */
const WIDGET_MAX_TEXT_CHARS = 2000

// Eingebettete Händlersuchen (Anbieter), am HTML erkannt. Stockist: bdkparfums.com,
// Progus („sl-widget“): marcantoinebarrois.com; die übrigen sind verbreitete Shop-Erweiterungen.
const LOCATOR_WIDGET = /stockist\.co\/|<stockist-store-locator|sl-widget\.proguscommerce\.com|storemapper\.co|storepoint\.co|storerocket\.io|bullseyelocations\.com|woosmap\.com|closeby\.co|storelocatorwidgets\.com/i

// Pfadteile, die eine Händler-/Filialsuche bezeichnen. Nur ganze Pfadteile, sonst träfe
// „/news/stores-closing“ zu.
const LOCATOR_SEGMENTS = new Set([
  'store-locator', 'storelocator', 'store-finder', 'storefinder', 'stores', 'store', 'retail',
  'filialen', 'filiale', 'filialfinder', 'filialsuche', 'marktsuche', 'maerkte', 'märkte',
  'haendler', 'händler', 'haendlersuche', 'händlersuche', 'haendlerverzeichnis', 'standorte',
  'points-of-sale', 'point-of-sale', 'boutiques', 'where-to-buy', 'wo-kaufen', 'stockists', 'dealer-locator'
])

// Adressangaben im lesbaren Text: Postleitzahl (5 Ziffern) oder Straße mit Hausnummer.
const POSTCODE = /(?<![\d.,])\d{5}(?![\d.,])/g
const STREET = /[A-Za-zÄÖÜäöüß-]+(?:straße|strasse|str\.|gasse|weg|platz|allee|ring|damm|markt)\s+\d{1,4}\b|\b\d{1,5}\s+[A-Z][a-z]+\s+(?:street|st\.|avenue|ave\.|road|rd\.)/gi

function addressHints(text: string): number {
  return (text.match(POSTCODE)?.length ?? 0) + (text.match(STREET)?.length ?? 0)
}

/** Text, den ein Leser ohne Skripte sähe: Skripte, Stile, Vorlagen, SVG und Tags entfernt. */
export function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function locatorPath(url: string): boolean {
  let path: string
  try {
    path = decodeURIComponent(new URL(url).pathname.toLowerCase())
  } catch {
    return false
  }
  return path.split('/').some((seg) => LOCATOR_SEGMENTS.has(seg))
}

/**
 * `html` = Rohantwort des Servers, `text` = daraus extrahierter Seitentext, `url` = finale URL.
 * Liefert, warum die Seite erst im Browser lesbar wäre, sonst null.
 */
export function detectBrowserOnlyPage(input: { html: string; text: string; url: string }): BrowserOnlyKind | null {
  const { html, text, url } = input
  if (!/<script\b/i.test(html)) return null
  const visible = visibleText(html)
  // Adressen zählen auch, wenn sie nur im Roh-HTML stehen und die Aufbereitung sie verlor
  // (ikea.com/de/de/stores/frankfurt: Öffnungszeiten und Anschrift im HTML, aufbereitet 132 Zeichen).
  // Dann lädt die Seite nicht erst im Browser, und der Hinweis wäre falsch.
  const hints = Math.max(addressHints(text), addressHints(visible))
  if (hints >= 2) return null
  const textLen = text.trim().length
  const empty = textLen < EMPTY_MAX_CHARS && visible.length < EMPTY_MAX_CHARS
  // Händlersuche zuerst: eine Hülle mit Händler-Widget soll als Händlersuche benannt werden.
  if (LOCATOR_WIDGET.test(html) && textLen <= WIDGET_MAX_TEXT_CHARS) return 'locator'
  if (empty && locatorPath(url)) return 'locator'
  if (empty) return 'shell'
  return null
}
