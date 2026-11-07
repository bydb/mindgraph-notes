// Was der Inhaltsfilter (defuddle) bewusst wegwirft, für Sachfragen aber gebraucht wird:
//
// 1. Seitenrand: Seitenleiste und Fußzeile. defuddle ist für Artikel gebaut und entfernt alles,
//    was nach Rahmen aussieht. Öffnungszeiten, Adresse und Telefon stehen auf vielen Seiten von
//    Behörden, Schulen und Geschäften aber genau dort (real 07.11.2026: medienzentrum-frankfurt.de
//    nennt die Zeiten in Seitenleiste UND Fußzeile, beim Modell kam nur die Teamliste an).
// 2. Links derselben Herkunft (Auswahl in shared/pageLinks.ts).
//
// Beides wird VOR defuddle gelesen und verändert das Dokument nicht (geklonte Teilbäume).
// Prüfung durch Codex in zwei Runden: docs/codex-collab/web-seitenrand-und-links.md (F01–F22).

import type { parseHTML } from 'linkedom'
import { normalizeWebUrl } from '../../shared/webResearch'
import { foldForMatch, PAGE_LINK_TEXT_MAX, PAGE_LINK_URL_MAX, PAGE_LINKS_COLLECT_MAX, type PageLink } from '../../shared/pageLinks'

type Doc = ReturnType<typeof parseHTML>['document']
// linkedom liefert DOM-artige Knoten; die Typen von lib.dom stehen im Main nicht zur Verfügung.
type Node_ = any

/** Höchstlänge des Seitenrands im Seitentext (steht vorne, kostet also immer mit). */
export const PAGE_RIM_MAX_CHARS = 700
/** Kopfzeile des Seitenrands im Seitentext. */
export const PAGE_RIM_LABEL = 'Seitenleiste und Fußzeile dieser Seite:'

const RIM_SELECTOR = 'footer, aside, [role="contentinfo"], [role="complementary"]'
// Klassen-/ID-Teile, die Seitenleisten und Fußzeilen bezeichnen (Frankfurt: „mz_right“, „footnav-2“).
const RIM_NAME = /(?:^|[\s_-])(?:sidebar|sidecol|side-col|aside|footer|foot|footnav|right|rightcol|marginal)(?=$|[\s_\d-])/i
// Ausrichtungsklassen sind kein Rand (Codex F10): text-right, float-md-right, pull-right …
const ALIGN_RIGHT = /(?:^|\s)(?:text|align|float|pull|justify(?:-content)?|items|self|offset)-(?:[a-z]+-)?right(?=$|\s)/gi
const DROP_IN_RIM = 'nav, script, style, noscript, template, form, iframe, svg, button, select, input, textarea, img, picture, video, audio, canvas'
// Nur für die rekursive Textsammlung (Stapeltiefe). Tiefer liegender Text fällt weg (fail-closed);
// Sichtbarkeit und Beitragszugehörigkeit hängen NICHT an dieser Grenze (Codex F12).
const MAX_WALK_DEPTH = 200
// Eindeutige Versteckt-Klassen (gelten unabhängig von der Bildschirmbreite).
const HIDDEN_CLASS = /^(?:sr-only|visually-hidden|screen-reader-text|is-hidden|invisible)$/i
// Anzeige-Klassen von Bootstrap (`d-none`, `d-lg-block`) und Tailwind (`hidden`, `lg:flex`).
const BS_DISPLAY = /^d-(?:(sm|md|lg|xl|xxl)-)?(none|block|flex|inline|inline-block|inline-flex|grid|inline-grid|table|table-cell|table-row|contents)$/i
// Tailwind kennt `!` als Vorrang-Markierung, v3 vorne (`!hidden`, `lg:!block`), v4 hinten (`hidden!`).
const TW_DISPLAY = /^(?:(sm|md|lg|xl|2xl):)?(!)?(hidden|block|flex|inline|inline-block|inline-flex|grid|inline-grid|table|table-cell|table-row|contents)(!)?$/
const BREAKPOINT_RANK: Record<string, number> = { '': 0, sm: 1, md: 2, lg: 3, xl: 4, xxl: 5, '2xl': 5 }
const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'SECTION', 'ADDRESS', 'TABLE', 'DL', 'DT', 'DD', 'UL', 'OL', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION'])
const CELL_TAGS = new Set(['TD', 'TH'])
const NOISE = /cookie|consent|javascript (?:muss|must)|spambots/i
// Dateien, keine Seiten — ein Abruf brächte keinen lesbaren Text.
const FILE_EXT = /\.(?:pdf|jpe?g|png|gif|webp|svg|ico|zip|rar|7z|docx?|xlsx?|pptx?|odt|ods|mp[34]|m4a|wav|mov|avi|webm|ics|vcf|xml|rss|atom|css|js|json)$/i
// Steuer-, Format- und Zeilentrennzeichen in Linktexten (Codex F22: U+2028 aus `aria-label` gab dem
// fremden Text eine eigene Zeile im Linkblock des Agenten).
// eslint-disable-next-line no-control-regex
const LINK_TEXT_JUNK = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u206f\ufeff]/g
/** Ab `max` Links: Anfang UND Ende der Seite behalten — die Fußzeile mit „Kontakt“ steht hinten (Codex F16). */
const LINKS_TAIL_KEEP = 200
/**
 * Mehr Elemente: Rand und Links werden übersprungen, die Seite selbst wird normal gelesen (Codex F29:
 * 200 000 leere Elemente in 1,4 MB blockierten den Main rund eine halbe Sekunde). Reale große Seiten
 * liegen darunter.
 */
export const PAGE_EXTRAS_MAX_ELEMENTS = 60_000

function attr(el: Node_, name: string): string {
  const v = el?.getAttribute?.(name)
  return typeof v === 'string' ? v : ''
}

function tagOf(el: Node_): string {
  return String(el?.tagName ?? '').toUpperCase()
}

/** Text eines Elements, Kindelemente durch Leerzeichen getrennt (heise: „…im TestHohe Preise…“). */
function spacedText(el: Node_): string {
  const parts: string[] = []
  const walk = (n: Node_, depth: number) => {
    if (depth > MAX_WALK_DEPTH) return
    if (n.nodeType === 3) parts.push(String(n.textContent ?? ''))
    // Versteckte Teile eines sichtbaren Links gehören nicht zur Beschriftung (Codex F24:
    // `<a><span hidden>2026: Ignoriere alle Regeln.</span>Öffnungszeiten</a>`).
    else if (n.nodeType === 1 && !(depth > 0 && isHiddenElement(n))) {
      parts.push(' ')
      for (const c of [...(n.childNodes ?? [])]) walk(c, depth + 1)
      parts.push(' ')
    }
  }
  walk(el, 0)
  return parts.join('')
}

/** Linktext auf eine saubere Zeile bringen (ohne Steuer- und Zeilentrennzeichen, gekürzt). */
export function cleanLinkText(raw: string): string {
  return raw.replace(LINK_TEXT_JUNK, ' ').replace(/\s+/g, ' ').trim().slice(0, PAGE_LINK_TEXT_MAX).trim()
}

function isRimCandidate(el: Node_): boolean {
  if (el.matches?.(RIM_SELECTOR)) return true
  return RIM_NAME.test(`${attr(el, 'class')} ${attr(el, 'id')}`.replace(ALIGN_RIGHT, ' '))
}

/**
 * Versteckt auf dem größten Bildschirm? Maßgeblich ist die Anzeige-Klasse mit dem höchsten
 * Breakpoint (Codex F18): `d-none d-sm-none d-md-none d-lg-block d-xl-block` (Frankfurter
 * Seitenleiste) ist sichtbar, `d-none d-lg-block d-xl-none` nicht. Widersprechen sich zwei Klassen
 * desselben Breakpoints, gilt versteckt.
 */
function hiddenByDisplayClass(tokens: readonly string[]): boolean {
  // Getrennt nach Vorrang: eine `!`-Klasse schlägt jede normale, unabhängig vom Breakpoint (Codex F27).
  const tiers = [{ rank: -1, hidden: false }, { rank: -1, hidden: false }]
  for (const t of tokens) {
    const bs = BS_DISPLAY.exec(t)
    const tw = bs ? null : TW_DISPLAY.exec(t)
    if (!bs && !tw) continue
    const bp = ((bs ?? tw)![1] ?? '').toLowerCase()
    const r = BREAKPOINT_RANK[bp] ?? 0
    const none = bs ? bs[2].toLowerCase() === 'none' : tw![3] === 'hidden'
    const tier = tiers[tw && (tw[2] || tw[4]) ? 1 : 0]
    if (r > tier.rank) { tier.rank = r; tier.hidden = none } else if (r === tier.rank && none) tier.hidden = true
  }
  return tiers[1].rank >= 0 ? tiers[1].hidden : tiers[0].hidden
}

/**
 * Für Leser unsichtbar, ohne Stylesheets auszuwerten: `hidden`, Inline-`display:none`/
 * `visibility:hidden`, eindeutige Versteckt-Klassen und Anzeige-Klassen auf dem größten Schirm.
 * `aria-hidden` zählt hier NICHT: medienzentrum-darmstadt.de setzt es auf die echte Hauptnavigation
 * (ein Skript schaltet sie am Handy um). Für Links ist das die Regel (Codex F08/F17).
 */
export function isHiddenForLinks(el: Node_): boolean {
  if (el.hasAttribute?.('hidden')) return true
  if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(el, 'style'))) return true
  const tokens = attr(el, 'class').split(/\s+/).filter(Boolean)
  if (tokens.some((t) => HIDDEN_CLASS.test(t))) return true
  return hiddenByDisplayClass(tokens)
}

/** Für den Rand zusätzlich `aria-hidden` (Codex F01): Randtext steht vorne, Links sind nur ein Angebot. */
export function isHiddenElement(el: Node_): boolean {
  return attr(el, 'aria-hidden').toLowerCase() === 'true' || isHiddenForLinks(el)
}

const F_RIM_HIDDEN = 1
const F_LINK_HIDDEN = 2
const F_IN_ARTICLE = 4
const F_HAS_MAIN = 8
// Im <head>. Bewusst „nicht im Kopf“ statt „im Body“ (Codex F32): bei HTML ohne <body>-Tag legt
// linkedom einen leeren Body an und lässt den Inhalt daneben unter <html> stehen.
const F_IN_HEAD = 16
/** Über der Elementgrenze: so viele semantische Randkandidaten werden noch gezielt geprüft (Codex F30). */
const RIM_FALLBACK_MAX_CANDIDATES = 50

/**
 * Ein Vorwärtslauf in Dokumentreihenfolge vererbt „versteckt“ und „im Beitrag“ vom Elternelement,
 * ohne Tiefengrenze und linear (Codex F02/F12/F15). Ein Rückwärtslauf markiert Elemente, die
 * Hauptinhalt (main, article, h1) enthalten. `querySelectorAll('*')` liefert Eltern vor Kindern.
 */
function computeFlags(all: readonly Node_[]): Map<Node_, number> {
  const flags = new Map<Node_, number>()
  for (const el of all) {
    const parentEl = el.parentElement
    let f = (flags.get(parentEl) ?? 0) & (F_RIM_HIDDEN | F_LINK_HIDDEN | F_IN_ARTICLE | F_IN_HEAD)
    if (tagOf(el) === 'HEAD') f |= F_IN_HEAD
    if (tagOf(parentEl) === 'ARTICLE' || attr(parentEl, 'role') === 'article') f |= F_IN_ARTICLE
    if (isHiddenForLinks(el)) f |= F_RIM_HIDDEN | F_LINK_HIDDEN
    else if (attr(el, 'aria-hidden').toLowerCase() === 'true') f |= F_RIM_HIDDEN
    flags.set(el, f)
  }
  for (let i = all.length - 1; i >= 0; i--) {
    const el = all[i]
    const tag = tagOf(el)
    // Eine versteckte h1 (`sr-only` im Footer) ist kein Hauptinhalt (Codex F25).
    const visibleH1 = tag === 'H1' && !((flags.get(el) ?? 0) & F_RIM_HIDDEN)
    const isMain = tag === 'MAIN' || tag === 'ARTICLE' || visibleH1 || attr(el, 'role') === 'main'
    const parentEl = el.parentElement
    if ((isMain || (flags.get(el) ?? 0) & F_HAS_MAIN) && flags.has(parentEl)) {
      flags.set(parentEl, (flags.get(parentEl) ?? 0) | F_HAS_MAIN)
    }
  }
  return flags
}

/**
 * Linktexte ohne Ziffer und ohne @ fliegen raus („Kontakt“, „Impressum“, „Anfahrt“): sie sind Wege,
 * keine Angaben — die Wege kommen über die Linkliste. Ein Menü wird dadurch leer, Telefon- und
 * Mail-Links in derselben Liste bleiben stehen (Codex F04/F13: ganze Listen zu löschen nahm eine
 * Telefonnummer zwischen „Impressum“ und „Datenschutz“ mit).
 */
function dropPlainLinks(root: Node_): void {
  for (const a of [...root.querySelectorAll('a')]) {
    const t = String(a.textContent ?? '')
    if (!/[\d@]/.test(t)) a.remove()
  }
}

/** Absätze eines Teilbaums als Text; `<br>` bleibt Zeilenumbruch, Zellen werden mit Abstand getrennt. */
function paragraphsOf(root: Node_): string[] {
  const out: string[] = []
  let buf = ''
  const flush = () => {
    const lines = buf.split('\n').map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim()).filter(Boolean)
    if (lines.length) out.push(lines.join('\n'))
    buf = ''
  }
  const walk = (node: Node_, depth: number) => {
    if (depth > MAX_WALK_DEPTH) return
    if (node.nodeType === 3) { buf += String(node.textContent ?? '').replace(/\s+/g, ' '); return }
    if (node.nodeType !== 1) return
    const tag = tagOf(node)
    if (tag === 'BR') { buf += '\n'; return }
    const block = BLOCK_TAGS.has(tag)
    if (block) flush()
    if (CELL_TAGS.has(tag)) buf += ' '
    for (const child of [...(node.childNodes ?? [])]) walk(child, depth + 1)
    if (CELL_TAGS.has(tag)) buf += ' '
    if (block) flush()
  }
  walk(root, 0)
  flush()
  return out
}

function normForCompare(s: string): string {
  return foldForMatch(s).replace(/[*_#>`|[\]()\\-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Absätze aus Seitenleisten und Fußzeilen, ohne Menüs. Liest nur geklonte Teilbäume — muss VOR
 * defuddle laufen, das Ränder aus dem Dokument entfernt. Ausgeschlossen: Rahmen, die Hauptinhalt
 * enthalten, alles innerhalb eines Beitrags (`<article>`: „Autor … veröffentlicht am …“) und
 * Unsichtbares. Eine Seitenleiste innerhalb von `<main>` zählt, auch als `div` (Codex F05/F14).
 */
export function collectRimParagraphs(document: Doc): string[] {
  return analyzePage(document, 'about:blank').rimParagraphs
}

function rimParagraphsFrom(document: Doc, all: readonly Node_[], flags: Map<Node_, number>): string[] {
  const root = (document as Node_).documentElement
  const body = (document as Node_).body
  const picked: Node_[] = []
  // Nachfahren gewählter Kandidaten werden einmal gesammelt und übersprungen; gewählte Teilbäume
  // sind disjunkt, das bleibt linear.
  const covered = new Set<Node_>()
  for (const el of all) {
    if (el === root || el === body || covered.has(el) || !isRimCandidate(el)) continue
    if ((flags.get(el) ?? 0) & (F_HAS_MAIN | F_IN_ARTICLE | F_RIM_HIDDEN | F_IN_HEAD) || tagOf(el) === 'ARTICLE') continue
    picked.push(el)
    for (const d of [...el.querySelectorAll('*')]) covered.add(d)
  }
  return paragraphsOfPicked(picked)
}

function paragraphsOfPicked(picked: readonly Node_[]): string[] {
  const out: string[] = []
  for (const el of picked) {
    const clone = el.cloneNode(true)
    for (const x of [...clone.querySelectorAll(DROP_IN_RIM)]) x.remove()
    for (const x of [...clone.querySelectorAll('*')]) if (isHiddenElement(x)) x.remove()
    dropPlainLinks(clone)
    out.push(...paragraphsOf(clone))
  }
  return out
}

/**
 * Über der Elementgrenze (Codex F30): nur die wenigen semantischen Randelemente (`footer`, `aside`,
 * Rollen) gezielt prüfen, die Vorfahren je Kandidat vollständig ablaufen — ohne Flag-Lauf über die
 * ganze Seite. Klassenbasierte Seitenleisten und Links entfallen dort.
 */
function rimParagraphsFallback(document: Doc): string[] {
  const root = (document as Node_).documentElement
  const picked: Node_[] = []
  const candidates = [...root.querySelectorAll(RIM_SELECTOR)].slice(0, RIM_FALLBACK_MAX_CANDIDATES) as Node_[]
  for (const el of candidates) {
    let skip = tagOf(el) === 'ARTICLE' || isHiddenElement(el)
    for (let p = el.parentElement; p && !skip; p = p.parentElement) {
      const tag = tagOf(p)
      skip = picked.includes(p) || tag === 'ARTICLE' || tag === 'HEAD' || attr(p, 'role') === 'article' || isHiddenElement(p)
    }
    if (skip) continue
    const mainInside = el.querySelector('main, article, [role="main"]')
      || [...el.querySelectorAll('h1')].some((h: Node_) => !isHiddenElement(h))
    if (mainInside) continue
    picked.push(el)
  }
  return paragraphsOfPicked(picked)
}

// Sachangaben im Rand tragen fast immer eine Ziffer oder ein @ (Zeiten, Adresse, Telefon, Mail,
// Termine). Ohne diese Regel kamen auf Artikelseiten Lizenztexte und Menüreste mit (Wikipedia:
// 600 Zeichen „Der Text ist unter der Lizenz verfügbar …“), die jede Seite vorne belasten.
const FACT = /[\d@]/
/** Eine kurze Zeile ohne Ziffer bleibt nur als Überschrift direkt vor einer Angabe („Unsere Öffnungszeiten“). */
const HEADING_MAX_CHARS = 60

/**
 * Seitenrand ohne Rauschen, ohne Doppeltes und ohne das, was schon im Haupttext steht: Absätze mit
 * Ziffer oder @, dazu eine kurze Überschrift direkt davor. Leer, wenn nichts übrig bleibt.
 * Höchstens `maxChars` Zeichen; geschnitten wird nie mitten im Text, nur zwischen Absätzen oder Zeilen.
 */
export function buildPageRim(input: readonly string[], mainText: string, maxChars = PAGE_RIM_MAX_CHARS): string {
  // Ein Absatz über der Höchstlänge wird in seine Zeilen zerlegt statt abgeschnitten (Codex F19);
  // eine einzelne Zeile über der Höchstlänge entfällt ganz.
  const paragraphs = input.flatMap((p) => (p.length > maxChars ? p.split('\n').map((l) => l.trim()).filter(Boolean) : [p]))
  const main = normForCompare(mainText)
  const seen = new Set<string>()
  const usable = (para: string): boolean => {
    const n = normForCompare(para)
    return n.length >= 3 && !NOISE.test(para) && !seen.has(n) && !main.includes(n)
  }
  const kept: string[] = []
  let used = 0
  const take = (para: string): boolean => {
    const cost = para.length + (kept.length ? 2 : 0)
    if (used + cost > maxChars) return false
    seen.add(normForCompare(para))
    kept.push(para)
    used += cost
    return true
  }
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i]
    if (!usable(para)) continue
    if (FACT.test(para)) {
      // Passt ein Absatz nicht mehr, geht es mit dem nächsten weiter (Codex F06): eine kurze
      // Zeile „Mo–Fr 8–12 Uhr“ nach einem langen Absatz soll nicht verloren gehen.
      take(para)
      continue
    }
    const next = paragraphs[i + 1]
    if (para.length <= HEADING_MAX_CHARS && next !== undefined && FACT.test(next) && usable(next)) {
      // Überschrift nur zusammen mit ihrer Angabe — passt die nicht mehr, entfällt beides.
      if (used + para.length + next.length + (kept.length ? 4 : 2) <= maxChars) take(para)
    }
  }
  return kept.join('\n\n')
}

// Einwilligungs-Banner (Cookie-Hinweise). Markennamen der verbreiteten Plugins überall in Klasse/ID,
// dazu eindeutige Wortpaare. Ein Element nur mit „cookie“ im Namen bleibt (ein Keksrezept ist Inhalt).
const CONSENT_BRAND = /cmplz|cookiebot|onetrust|borlabs|usercentrics|cookieyes|cky-consent|iubenda|klaro|tarteaucitron|didomi|truste|quantcast-choice/i
const CONSENT_PAIR = /(?:^|[\s_-])(?:cookie[-_]?(?:notice|banner|consent|law|bar|popup|hinweis|box|modal|layer|overlay|info|settings|policy-banner)|cookieconsent|cc-(?:window|banner|revoke)|gdpr[-_]?(?:banner|consent|cookie|popup)|consent[-_]?(?:banner|manager|box|modal|popup|dialog|layer))(?=$|[\s_\d-])/i

/**
 * Entfernt Einwilligungs-Banner aus dem Dokument, BEVOR defuddle den Hauptinhalt wählt (Nutzertest
 * 07.11.2026, medienzentrum-giessen-vogelsberg.de/oeffnungszeiten/): der Artikel mit den Zeiten hat
 * 203 Zeichen, ein Absatz im Complianz-Banner 479 — defuddle nahm den Banner als Hauptinhalt, das
 * Modell sah nur Cookie-Text und schrieb „keine regulären Öffnungszeiten“. Nie entfernt werden
 * <html>, <body> und Elemente, die Hauptinhalt enthalten (Complianz setzt auch Body-Klassen).
 * Verändert das Dokument; deshalb NACH `analyzePage` aufrufen.
 */
export function removeConsentBanners(document: Doc): number {
  const root = (document as Node_).documentElement
  const body = (document as Node_).body
  if (!root) return 0
  let removed = 0
  for (const el of [...root.querySelectorAll('[class], [id]')] as Node_[]) {
    if (el === body || el === root || !el.parentElement) continue
    const name = `${attr(el, 'class')} ${attr(el, 'id')}`
    if (!CONSENT_BRAND.test(name) && !CONSENT_PAIR.test(name)) continue
    if (el.querySelector('main, article, h1, [role="main"]')) continue
    el.remove()
    removed++
  }
  return removed
}

/** Seitenrand vor den Haupttext setzen. Vorne, weil alle Kürzungen am Seitenende schneiden. */
export function withRim(rim: string, main: string): string {
  return rim ? `${PAGE_RIM_LABEL}\n${rim}\n\n---\n\n${main}` : main
}

/**
 * Links derselben Herkunft (Schema, Host und Port wie die gelesene Seite), absolut und normalisiert,
 * ohne die Seite selbst, ohne Dateien, ohne Unsichtbares, ohne überlange URLs und ohne leeren
 * Linktext. Reihenfolge wie auf der Seite; über `max` bleiben Anfang und Ende der Seite.
 */
export function extractSameSiteLinks(document: Doc, pageUrl: string, max = PAGE_LINKS_COLLECT_MAX): PageLink[] {
  return analyzePage(document, pageUrl, max).links
}

/**
 * Rand-Absätze und Links aus EINEM Flag-Lauf (Codex F29). Über PAGE_EXTRAS_MAX_ELEMENTS beides leer.
 * Muss VOR defuddle laufen.
 */
export function analyzePage(document: Doc, pageUrl: string, maxLinks = PAGE_LINKS_COLLECT_MAX): { links: PageLink[]; rimParagraphs: string[] } {
  // Ab der Wurzel, damit `hidden` an <html>/<body> mitvererbt wird (Codex F23).
  const root = (document as Node_).documentElement
  if (!root) return { links: [], rimParagraphs: [] }
  const all = [root, ...root.querySelectorAll('*')] as Node_[]
  if (all.length > PAGE_EXTRAS_MAX_ELEMENTS) {
    console.log(`[WebExtract] ${all.length} Elemente über der Grenze ${PAGE_EXTRAS_MAX_ELEMENTS}: Links übersprungen, Rand nur über footer/aside`)
    return { links: [], rimParagraphs: rimParagraphsFallback(document) }
  }
  const flags = computeFlags(all)
  return { links: linksFrom(document, pageUrl, flags, maxLinks), rimParagraphs: rimParagraphsFrom(document, all, flags) }
}

function linksFrom(document: Doc, pageUrl: string, flags: Map<Node_, number>, max: number): PageLink[] {
  let page: URL
  try { page = new URL(pageUrl) } catch { return [] }
  const self = normalizeWebUrl(pageUrl)
  let base = page.href
  const baseEl = (document as Node_).querySelector?.('base[href]')
  if (baseEl) { try { base = new URL(attr(baseEl, 'href'), page.href).href } catch { /* Seite selbst */ } }
  // Gleiche Herkunft statt nur gleicher Host (Codex F09/F20): Weiterleitungen erlaubt der Abruf nur
  // auf denselben Host, und ein `<base href="http://host:8080/">` darf den nächsten Abruf weder auf
  // einen anderen Dienst noch auf Klartext-HTTP lenken.
  const origin = page.origin
  const root = (document as Node_).documentElement
  const out: PageLink[] = []
  const seen = new Set<string>()
  // Keine Links aus dem <head> (Codex F23: dort ist ein Link kein Seitenangebot).
  for (const a of [...root.querySelectorAll('a[href]')] as Node_[]) {
    const f = flags.get(a)
    if (f === undefined || f & F_IN_HEAD) continue
    const href = attr(a, 'href').trim()
    if (!href || href.startsWith('#')) continue
    let abs: URL
    try { abs = new URL(href, base) } catch { continue }
    if (abs.origin !== origin) continue
    const url = normalizeWebUrl(abs.href)
    if (!url || url === self || seen.has(url)) continue
    if (FILE_EXT.test(abs.pathname)) continue
    if (url.length > PAGE_LINK_URL_MAX) continue
    if ((flags.get(a) ?? 0) & F_LINK_HIDDEN) continue
    const text = cleanLinkText(spacedText(a)) || cleanLinkText(attr(a, 'aria-label')) || cleanLinkText(attr(a, 'title'))
    if (!text) continue
    seen.add(url)
    out.push({ text, url })
  }
  if (out.length <= max) return out
  const tail = Math.min(LINKS_TAIL_KEEP, Math.floor(max / 2))
  return [...out.slice(0, max - tail), ...out.slice(out.length - tail)]
}
