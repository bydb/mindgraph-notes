// Links einer gelesenen Seite, die Chat-Schleife und Notiz-Agent als nächste Abrufe anbieten.
//
// Anlass (07.11.2026, Messfrage „Öffnungszeiten aller hessischen Medienzentren“): Die Startseite
// eines Zentrums wurde gelesen, die Zeiten standen aber auf der Unterseite „Öffnungszeiten“, die
// nur im Menü verlinkt war. Abrufen ließen sich bis dahin nur Suchtreffer — der Agent schrieb
// selbst „verweist auf eine Unterseite, die ich nicht abrufen konnte“.
//
// Die Links kommen aus fremdem HTML. Das Modell wählt in der Chat-Schleife nur per Nummer, im
// Agenten nur aus der Allowlist; die URL bestimmt die Seite, nie das Modell. Nur dieselbe Website.

export interface PageLink {
  /** Linktext, eine Zeile, höchstens PAGE_LINK_TEXT_MAX Zeichen. */
  text: string
  /** Normalisierte absolute URL (ohne Fragment). */
  url: string
}

export const PAGE_LINK_TEXT_MAX = 80
/** Längere URLs (Sitzungs- und Filterketten) werden nicht angeboten (Codex F03: Kontextlast im Agenten). */
export const PAGE_LINK_URL_MAX = 300
/**
 * So viele Links sammelt der Abruf je Seite höchstens, VOR der Auswahl (Codex F07/F16/F26: bei 200
 * bzw. 1000 fielen passende Links langer Indexseiten heraus, bevor sie bewertet wurden). Darüber
 * bleiben Anfang und Ende der Seite.
 */
export const PAGE_LINKS_COLLECT_MAX = 5000
/** Zeichenbudget des Linkblocks im Notiz-Agenten (Codex F03). */
export const PAGE_LINKS_AGENT_BLOCK_MAX_CHARS = 2500
/** So viele Links sieht das Modell je gelesener Seite. */
export const PAGE_LINKS_SHOWN_LOOP = 12
export const PAGE_LINKS_SHOWN_AGENT = 15

// Wörter, unter denen Websites Sachangaben ablegen (Kontakt, Zeiten, Adresse, Händler). Nur ein
// Vorrang in der Auswahl, kein Filter: ohne Treffer bleibt die Reihenfolge auf der Seite.
const INFO_WORDS = [
  'kontakt', 'contact', 'oeffnungszeit', 'offnungszeit', 'opening', 'hours', 'servicezeit', 'sprechzeit',
  'impressum', 'imprint', 'anfahrt', 'anschrift', 'adresse', 'standort', 'location', 'ueber-uns', 'ueber uns',
  'about', 'team', 'preise', 'prices', 'pricing', 'filiale', 'haendler', 'boutique', 'stockist', 'store',
  'verleih', 'ausleihe', 'termine'
]

/** Kleinbuchstaben, Umlaute ausgeschrieben, Akzente weg — für Vergleiche, nie zur Anzeige. */
export function foldForMatch(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

/** Wortanfänge (6 Zeichen) der Frage ab 4 Buchstaben — „Öffnungszeiten“ trifft „Öffnungszeit“. */
function questionStems(question: string): string[] {
  const words = foldForMatch(question).match(/[a-z0-9]{4,}/g) ?? []
  return [...new Set(words.map((w) => w.slice(0, 6)))]
}

function linkHaystack(link: PageLink): string {
  let path = ''
  try { path = decodeURIComponent(new URL(link.url).pathname) } catch { path = '' }
  return foldForMatch(`${link.text} ${path.replace(/[/_.]+/g, ' ')}`)
}

/**
 * Wählt bis zu `max` Links: zuerst solche, die Wörter der Frage tragen, dann solche mit
 * Sachangaben-Wörtern, sonst die Reihenfolge auf der Seite. Stabil, ohne Dubletten.
 */
export function rankPageLinks(links: readonly PageLink[], question: string, max: number): PageLink[] {
  if (max <= 0) return []
  const stems = questionStems(question)
  const seen = new Set<string>()
  const scored: Array<{ link: PageLink; score: number; i: number }> = []
  links.forEach((link, i) => {
    if (seen.has(link.url)) return
    seen.add(link.url)
    const hay = linkHaystack(link)
    let score = 0
    for (const s of stems) if (hay.includes(s)) score += 2
    if (INFO_WORDS.some((w) => hay.includes(w))) score += 1
    scored.push({ link, score, i })
  })
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return scored.slice(0, max).map((s) => s.link)
}
