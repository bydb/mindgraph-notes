// Symbole für write_pptx: ein Name → eine Linienzeichnung als PowerPoint-Freihandform.
// Die Pfade kommen aus pptxIcons.generated.ts (Lucide, ISC) und werden hier nur in
// DrawingML übersetzt. Kein Bild, keine Schrift: die Form bleibt in PowerPoint
// umfärbbar und skaliert ohne Verlust.

import { PPTX_ICON_GRID, PPTX_ICON_LUCIDE, PPTX_ICON_PATHS } from './pptxIcons.generated'

export interface IconBox {
  x: number
  y: number
  cx: number
  cy: number
}

/** Alle Namen, die ein Modell angeben kann (deutsch, ohne Umlaute). */
export const PPTX_ICON_NAMES: string[] = Object.keys(PPTX_ICON_PATHS)

// Naheliegende andere Wörter für dasselbe Symbol — ein Modell rät eher „chat" als „sprechblase".
const ALIASES: Record<string, string> = {
  chat: 'sprechblase', nachricht: 'sprechblase', dialog: 'gespraech', austausch: 'gespraech', suche: 'lupe', suchen: 'lupe',
  computer: 'laptop', rechner: 'laptop', bildschirm: 'monitor', demo: 'monitor', agent: 'roboter', ki: 'roboter', bot: 'roboter',
  datei: 'dokument', notiz: 'dokument', text: 'dokument', verzeichnis: 'ordner', werkzeuge: 'werkzeug', tool: 'werkzeug',
  werkzeugkasten: 'koffer', tasche: 'koffer', sicherheit: 'schild', schutz: 'schild', einstellungen: 'zahnrad', mensch: 'person',
  nutzer: 'person', team: 'gruppe', personen: 'gruppe', ok: 'haken', erledigt: 'haken', check: 'haken', x: 'kreuz', nein: 'kreuz',
  achtung: 'warnung', gefahr: 'warnung', hinweis: 'ausrufezeichen', fragezeichen: 'frage', hilfe: 'frage', sperre: 'schloss',
  cloud: 'wolke', web: 'globus', internet: 'globus', welt: 'globus', skill: 'buch', lesen: 'buch', wissen: 'buch', zeit: 'uhr',
  dauer: 'sanduhr', warten: 'sanduhr', zielscheibe: 'ziel', schreiben: 'stift', bearbeiten: 'stift', sehen: 'auge',
  beobachten: 'auge', checkliste: 'liste', aufgaben: 'liste', excel: 'tabelle', statistik: 'diagramm', zahlen: 'diagramm',
  wachstum: 'trend', schnell: 'blitz', energie: 'blitz', stopp: 'hand', stop: 'hand', halt: 'hand', pause: 'kaffee',
  termin: 'kalender', datum: 'kalender', email: 'mail', 'e-mail': 'mail', brief: 'mail', idee: 'gluehbirne', schleife: 'kreislauf',
  wiederholen: 'kreislauf', zyklus: 'kreislauf', quelle: 'zitat', beleg: 'zitat', plugin: 'stecker', anschluss: 'stecker',
  module: 'bausteine', modell: 'gehirn', denken: 'gehirn', daten: 'datenbank', speicher: 'chip',
  prozessor: 'chip', foto: 'bild', fortbildung: 'schule', lernen: 'schule', start: 'rakete', recht: 'waage', abwaegen: 'waage',
  richtung: 'kompass', herunterladen: 'download', verknuepfung: 'link', trichter: 'filter', verboten: 'verbot', gut: 'daumen',
  geld: 'euro', kosten: 'euro', landkarte: 'karte', ort: 'karte', schneiden: 'schere', grenze: 'schere', weiter: 'pfeil',
  schichten: 'ebenen', programm: 'code', pruefen: 'klemmbrett', protokoll: 'klemmbrett', clipboard: 'klemmbrett', stapel: 'ebenen', erkunden: 'fernglas',
  workflow: 'ablauf', prozess: 'ablauf', video: 'abspielen', transfer: 'teilen', uebertragen: 'teilen'
}
const BY_LUCIDE = new Map(Object.entries(PPTX_ICON_LUCIDE).map(([de, en]) => [en, de]))

function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/** Kanonischer Symbolname oder null. Tolerant bei Umlauten, Groß/Klein, Lucide-Namen und nahen Wörtern. */
export function resolvePptxIcon(name: string | undefined | null): string | null {
  if (typeof name !== 'string') return null
  const key = normalize(name)
  if (!key) return null
  // Nur eigene Einträge: „constructor" oder „toString" sind Eigenschaften jedes Objekts, kein Symbol.
  if (Object.hasOwn(PPTX_ICON_PATHS, key)) return key
  const alias = (Object.hasOwn(ALIASES, key) ? ALIASES[key] : undefined) ?? BY_LUCIDE.get(key)
  return alias && Object.hasOwn(PPTX_ICON_PATHS, alias) ? alias : null
}

function pathXml(d: string): string {
  let out = ''
  for (const part of d.split(' ')) {
    const op = part[0]
    if (op === 'Z') {
      out += '<a:close/>'
      continue
    }
    const n = part.slice(1).split(',')
    const pt = (k: number) => `<a:pt x="${n[k]}" y="${n[k + 1]}"/>`
    if (op === 'M') out += `<a:moveTo>${pt(0)}</a:moveTo>`
    else if (op === 'L') out += `<a:lnTo>${pt(0)}</a:lnTo>`
    else if (op === 'C') out += `<a:cubicBezTo>${pt(0)}${pt(2)}${pt(4)}</a:cubicBezTo>`
  }
  return out
}

function xfrm(b: IconBox): string {
  return `<a:xfrm><a:off x="${Math.round(b.x)}" y="${Math.round(b.y)}"/><a:ext cx="${Math.round(b.cx)}" cy="${Math.round(b.cy)}"/></a:xfrm>`
}

/**
 * Linien-Symbol in `box` (EMU). `colorXml` ist eine DrawingML-Farbe (z. B. srgbClr).
 * Strichstärke wie bei Lucide: 2 von 24 Einheiten.
 */
export function iconGlyphXml(id: number, icon: string, box: IconBox, colorXml: string): string {
  if (!Object.hasOwn(PPTX_ICON_PATHS, icon)) return ''
  const d = PPTX_ICON_PATHS[icon]
  const w = Math.max(9525, Math.round(Math.min(box.cx, box.cy) / 12))
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Symbol ${icon}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(box)}<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/>` +
    `<a:pathLst><a:path w="${PPTX_ICON_GRID}" h="${PPTX_ICON_GRID}" fill="none">${pathXml(d)}</a:path></a:pathLst></a:custGeom>` +
    `<a:noFill/><a:ln w="${w}" cap="rnd"><a:solidFill>${colorXml}</a:solidFill><a:round/></a:ln></p:spPr></p:sp>`
  )
}

/** Gefüllter Kreis (Träger eines Symbols) oder kleiner Punkt (Ersatz, wenn kein Symbol genannt ist). */
export function iconDiscXml(id: number, name: string, box: IconBox, colorXml: string): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(box)}<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill>${colorXml}</a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`
  )
}

/** Innenfläche eines Kreises, in der das Symbol sitzt (Anteil der Kreisgröße). */
export function insetBox(box: IconBox, share: number): IconBox {
  const cx = box.cx * share
  const cy = box.cy * share
  return { x: box.x + (box.cx - cx) / 2, y: box.y + (box.cy - cy) / 2, cx, cy }
}
