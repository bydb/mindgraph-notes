// Mindmap als Excalidraw-Datei für den Notiz-Agenten (Werkzeug `write_excalidraw`, Skill „Mindmap").
// Plan + Codex-Review (F01–F10): docs/codex-collab/excalidraw-mindmap.md
//
// Wie bei write_edumap liefert das Modell nur die Gliederung (Mitte, Äste, Blätter). Die Szene
// baut diese Datei: IDs, gegenseitige Verweise (Text ↔ Kasten, Linie ↔ Knoten), Koordinaten,
// Schrift und Farben. Genau das machen Modelle zuverlässig falsch, und die Schrift darf nur eine
// im Excalidraw-Plugin eingebettete sein — sonst öffnet das Plugin die Datei schreibgeschützt.
//
// Textmaße: Excalidraw misst beim Laden NICHT nach (`restore` ohne refreshDimensions), und die
// Einbettung in Notizen zeichnet mit den gespeicherten Maßen. Der Main kann nicht messen. Deshalb
// rechnet diese Datei mit einer gemessenen Breitentabelle (excalidrawFontMetrics.generated.ts) und
// erlaubt nur Zeichen, die darin stehen — ein Zeichen aus einer Ersatzschrift hätte eine
// unbekannte Breite (Codex F06). Der Test prüft die Schätzung gegen ganze, echt gemessene Zeilen.

import { NOTE_KINDS, type NoteKindId } from './noteKind'
import { EXCALIDRAW_CHAR_WIDTHS } from './excalidrawFontMetrics.generated'

export const MINDMAP_LIMITS = {
  minBranches: 2,
  maxBranches: 8,
  maxLeavesPerBranch: 6,
  maxNodes: 40,
  maxCenterChars: 60,
  maxNodeChars: 80,
  maxLines: 3
} as const

export type MindmapStyle = 'klar' | 'skizze'

export interface MindmapNodeInput {
  text: string
  kind?: string
  link?: string
}

export interface MindmapBranchInput extends MindmapNodeInput {
  children?: MindmapNodeInput[]
}

export interface MindmapInput {
  title: string
  branches: MindmapBranchInput[]
  style?: string
}

export interface MindmapBuildOptions {
  /** Zeitstempel für `updated` (ms). Gleiche Eingabe + gleicher Zeitstempel → gleiche Bytes (F10). */
  now: number
  /**
   * Löst das Ziel eines `[[Links]]` auf (ohne Klammern, ohne Alias). Rückgabe: kanonischer
   * vault-relativer Pfad ohne `.md` oder ein Fehlertext. Ohne Resolver sind Links verboten.
   */
  resolveLink?: (target: string) => { path: string } | { error: string }
}

export interface MindmapBuildResult {
  json: string
  branchCount: number
  leafCount: number
  nodeCount: number
  linkCount: number
}

export class MindmapInputError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join('; '))
    this.name = 'MindmapInputError'
  }
}

// ── Schrift und Maße ─────────────────────────────────────────────────────────────────────────

type FontName = 'Nunito' | 'Excalifont'

interface StyleDef {
  font: FontName
  /** Excalidraw-FONT_FAMILY-ID (im Plugin eingebettet: renderer.tsx SUPPORTED_FONT_FAMILIES). */
  fontFamily: number
  /** Excalidraws Zeilenhöhe der Schrift (FONT_METADATA in @excalidraw/excalidraw 0.18.1). */
  lineHeight: number
  roughness: number
}

const STYLES: Record<MindmapStyle, StyleDef> = {
  klar: { font: 'Nunito', fontFamily: 6, lineHeight: 1.35, roughness: 0 },
  skizze: { font: 'Excalifont', fontFamily: 5, lineHeight: 1.25, roughness: 1 }
}

/**
 * Zuschlag auf die Summe der Einzelbreiten. Canvas misst ganze Zeilen mit Kerning; die Summe der
 * Einzelzeichen weicht davon nach beiden Seiten ab — gemessen (12.10.2026, Electron 41) höchstens
 * +0,5 % (breite Großbuchstaben) und bis −5 % (Kerning-Paare wie „AV", „To"). Der Wert hält die
 * Schätzung für jede Referenzzeile ≥ der echten Breite und unter +8 % (Test „Textmaße“).
 * Nicht ohne neue Messung ändern.
 */
export const WIDTH_SAFETY_FACTOR = 1.01
export const WIDTH_SAFETY_PX = 2

export function isAllowedChar(ch: string, style: MindmapStyle): boolean {
  const cp = ch.codePointAt(0)
  return cp !== undefined && EXCALIDRAW_CHAR_WIDTHS[STYLES[style].font][cp] !== undefined
}

/** Geschätzte Breite einer Zeile in px — nur für erlaubte Zeichen (vorher prüfen). */
export function estimateLineWidth(line: string, style: MindmapStyle, fontSize: number): number {
  const table = EXCALIDRAW_CHAR_WIDTHS[STYLES[style].font]
  let units = 0
  for (const ch of line) units += table[ch.codePointAt(0) ?? 0] ?? 0
  if (units === 0) return 0
  return (units * fontSize) / 1000 * WIDTH_SAFETY_FACTOR + WIDTH_SAFETY_PX
}

interface Level {
  fontSize: number
  /** Zielbreite des Textes beim Umbruch. */
  wrapWidth: number
  /** Ein einzelnes langes Wort darf die Zeile bis hierhin verbreitern, statt zerschnitten zu werden. */
  maxWordWidth: number
  padX: number
  padY: number
  minWidth: number
}

const LEVELS: Record<'center' | 'branch' | 'leaf', Level> = {
  center: { fontSize: 24, wrapWidth: 260, maxWordWidth: 380, padX: 20, padY: 14, minWidth: 140 },
  branch: { fontSize: 20, wrapWidth: 220, maxWordWidth: 340, padX: 16, padY: 10, minWidth: 100 },
  leaf: { fontSize: 16, wrapWidth: 200, maxWordWidth: 300, padX: 12, padY: 8, minWidth: 80 }
}

/** Umbruch an Wortgrenzen; ein zu langes Wort steht allein, ein überlanges wird zeichenweise geteilt. */
export function wrapLines(text: string, style: MindmapStyle, level: Level): string[] {
  const width = (s: string): number => estimateLineWidth(s, style, level.fontSize)
  const lines: string[] = []
  let current = ''
  const pushWord = (word: string): void => {
    if (width(word) <= level.maxWordWidth) {
      if (current) lines.push(current)
      current = word
      return
    }
    if (current) lines.push(current)
    current = ''
    let piece = ''
    for (const ch of word) {
      if (piece && width(piece + ch) > level.maxWordWidth) {
        lines.push(piece)
        piece = ch
      } else {
        piece += ch
      }
    }
    current = piece
  }
  for (const word of text.split(' ')) {
    if (!word) continue
    const candidate = current ? `${current} ${word}` : word
    if (width(candidate) <= level.wrapWidth) current = candidate
    else pushWord(word)
  }
  if (current) lines.push(current)
  return lines
}

// ── Farben (MindGraph-Hausstil) ──────────────────────────────────────────────────────────────

const PETROL = '#10696b'
/** Petrol 12 % auf Weiß, als fester Hexwert (Excalidraw kennt kein color-mix). */
const PETROL_TINT = '#e2eded'
const TEXT_DARK = '#1e1e1e'
const WHITE = '#ffffff'

const KIND_IDS = Object.keys(NOTE_KINDS) as NoteKindId[]

// ── Eingabe prüfen ───────────────────────────────────────────────────────────────────────────

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Leerraum (auch Zeilenumbrüche, Tabs) auf ein Leerzeichen. Alles andere prüft der Zeichenvorrat. */
function normalizeText(value: unknown): string {
  return str(value).replace(/[\s ]+/g, ' ').trim().normalize('NFC')
}

function describeChar(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0
  return `„${ch}" (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`
}

interface PreparedNode {
  text: string
  lines: string[]
  level: Level
  kind: NoteKindId | null
  link: string | null
}

interface PreparedBranch extends PreparedNode {
  children: PreparedNode[]
}

/** Wikilink-Ziel aus `[[Ziel]]`, `[[Ziel|Alias]]`; Abschnitt (`#…`) wird nicht unterstützt. */
export function parseWikilinkTarget(raw: string): string | null {
  const m = /^\[\[([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]$/.exec(raw.trim())
  if (!m) return null
  const target = m[1].trim()
  return target ? target : null
}

/**
 * Gerade Anführungszeichen statt typografischer, dazu NFC — dieselbe Gleichsetzung wie
 * `straightenQuotes` im Renderer (utils/linkExtractor.ts), die `findNoteForWikilink` beim Klick
 * auf BEIDE Seiten anwendet. Gespiegelt statt importiert, weil shared/ den Renderer nicht kennt;
 * ein Test hält beide Fassungen zusammen.
 */
export function linkCompareKey(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .normalize('NFC')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\.md$/i, '')
    .toLowerCase()
}

/** Zeichen, die ein `[[Wikilink]]` nicht verlustfrei trägt: `|` trennt den Alias, `#` den
 *  Abschnitt, Klammern beenden den Link (`shared/pluginLink.ts`). */
const LINK_BREAKING_CHARS = /[|#[\]^]/

/**
 * Wikilink-Ziel auf genau eine Notiz auflösen (Codex F02): erst exakter vault-relativer Pfad,
 * dann exakter Dateiname — beides ohne `.md`, Groß/Klein egal, NIE unscharf. Mehrdeutig ist ein
 * Fehler, damit der spätere Klick (findNoteForWikilink prüft den Pfad zuerst) dieselbe Datei öffnet.
 * Verglichen wird mit derselben Gleichsetzung wie beim Klick (F12: `A'B` und `A’B` gelten als
 * gleich → mehrdeutig), und Pfade mit Zeichen, die der Link nicht trägt, werden abgelehnt (F11).
 */
export function resolveWikilinkInPaths(target: string, mdPaths: readonly string[]): { path: string } | { error: string } {
  const wanted = linkCompareKey(target)
  if (!wanted || wanted.split('/').some(seg => seg === '..')) return { error: `Link-Ziel „${target}" ist ungültig` }
  const candidates = mdPaths.map(p => ({ p: p.normalize('NFC').replace(/\\/g, '/').replace(/\.md$/i, ''), n: linkCompareKey(p) }))
  const accept = (p: string): { path: string } | { error: string } =>
    LINK_BREAKING_CHARS.test(p)
      ? { error: `Notiz „${p}" hat im Namen ein Zeichen (| # [ ] ^), das ein Link nicht tragen kann — Link weglassen` }
      : { path: p }
  const byPath = candidates.filter(c => c.n === wanted)
  if (byPath.length === 1) return accept(byPath[0].p)
  if (byPath.length > 1) return { error: `Link-Ziel „${target}" ist mehrdeutig (${byPath.map(c => `[[${c.p}]]`).slice(0, 5).join(', ')}) — Link weglassen` }
  if (wanted.includes('/')) return { error: `Notiz „${target}" nicht gefunden` }
  const byName = candidates.filter(c => c.n.split('/').pop() === wanted)
  if (byName.length === 1) {
    // Der Klick prüft den vollen Pfad zuerst, dann TITEL und Dateiname. Ein anderer Pfad, der
    // gleich lautet wie der gespeicherte, kann nicht vorkommen (oben eindeutig) — gespeichert
    // wird deshalb der volle Pfad, nie der Kurzname.
    return accept(byName[0].p)
  }
  if (byName.length > 1) {
    const list = byName.slice(0, 5).map(c => `[[${c.p}]]`).join(', ')
    return { error: `Notiz „${target}" ist mehrdeutig (${byName.length} Treffer: ${list}) — den Pfad angeben` }
  }
  return { error: `Notiz „${target}" nicht gefunden — nur Notizen verlinken, die es im Vault gibt` }
}

function prepare(input: MindmapInput, options: MindmapBuildOptions): {
  style: MindmapStyle
  center: PreparedNode
  branches: PreparedBranch[]
} {
  const L = MINDMAP_LIMITS
  const issues: string[] = []

  const rawStyle = str(input.style).trim().toLowerCase()
  let style: MindmapStyle = 'klar'
  if (rawStyle === 'skizze' || rawStyle === 'klar') style = rawStyle
  else if (rawStyle) issues.push(`Stil „${input.style}" unbekannt — erlaubt sind „klar" und „skizze"`)

  const node = (raw: MindmapNodeInput | undefined, level: Level, where: string, maxChars: number): PreparedNode => {
    const text = normalizeText(raw?.text)
    if (!text) issues.push(`${where}: Text fehlt`)
    else if ([...text].length > maxChars) issues.push(`${where} („${text.slice(0, 40)}…"): ${[...text].length} Zeichen — höchstens ${maxChars}. Stichworte statt Sätze`)
    const bad = [...new Set([...text].filter(ch => !isAllowedChar(ch, style)))]
    if (bad.length > 0) {
      issues.push(`${where} („${text.slice(0, 40)}"): ${bad.slice(0, 5).map(describeChar).join(', ')} ist in der Schrift nicht verfügbar — nur lateinische Schrift, keine Emojis oder Sonderzeichen`)
    }
    let kind: NoteKindId | null = null
    const rawKind = str(raw?.kind).trim()
    if (rawKind) {
      if ((KIND_IDS as string[]).includes(rawKind)) kind = rawKind as NoteKindId
      else issues.push(`${where}: Kategorie „${rawKind}" unbekannt — erlaubt sind ${KIND_IDS.join(', ')}`)
    }
    let link: string | null = null
    const rawLink = str(raw?.link).trim()
    if (rawLink) {
      const target = parseWikilinkTarget(rawLink)
      if (!target) issues.push(`${where}: Link „${rawLink}" — nur [[Notizname]] oder [[Ordner/Notiz]], keine Abschnitte, keine URLs`)
      else if (!options.resolveLink) issues.push(`${where}: Links sind hier nicht möglich`)
      else {
        const res = options.resolveLink(target)
        if ('error' in res) issues.push(`${where}: ${res.error}`)
        else link = `[[${res.path}]]`
      }
    }
    const lines = text && bad.length === 0 ? wrapLines(text, style, level) : [text]
    if (lines.length > L.maxLines) {
      issues.push(`${where} („${text.slice(0, 40)}…"): ergibt ${lines.length} Zeilen — höchstens ${L.maxLines}. Kürzer fassen`)
    }
    return { text, lines, level, kind, link }
  }

  const center = node({ text: str(input.title) }, LEVELS.center, 'Mitte', L.maxCenterChars)

  const branchesIn = Array.isArray(input.branches) ? input.branches : []
  if (branchesIn.length < L.minBranches) issues.push(`${branchesIn.length} Äste — mindestens ${L.minBranches}`)
  if (branchesIn.length > L.maxBranches) issues.push(`${branchesIn.length} Äste — höchstens ${L.maxBranches}. Zusammenfassen oder eine zweite Mindmap anlegen`)

  let nodeCount = 1
  const seenBranch = new Set<string>()
  const branches: PreparedBranch[] = branchesIn.slice(0, L.maxBranches).map((b, bi) => {
    const where = `Ast ${bi + 1}`
    const prepared = node(b, LEVELS.branch, where, L.maxNodeChars)
    const key = prepared.text.toLowerCase()
    if (key && seenBranch.has(key)) issues.push(`${where}: „${prepared.text}" kommt doppelt vor`)
    seenBranch.add(key)
    const childrenIn = Array.isArray(b?.children) ? b.children : []
    if (childrenIn.length > L.maxLeavesPerBranch) issues.push(`${where} („${prepared.text}"): ${childrenIn.length} Blätter — höchstens ${L.maxLeavesPerBranch}`)
    const seenLeaf = new Set<string>()
    const children = childrenIn.slice(0, L.maxLeavesPerBranch).map((c, ci) => {
      const leafWhere = `${where}, Blatt ${ci + 1}`
      const leaf = node(c, LEVELS.leaf, leafWhere, L.maxNodeChars)
      const leafKey = leaf.text.toLowerCase()
      if (leafKey && seenLeaf.has(leafKey)) issues.push(`${leafWhere}: „${leaf.text}" kommt in diesem Ast doppelt vor`)
      seenLeaf.add(leafKey)
      return leaf
    })
    nodeCount += 1 + childrenIn.length
    return { ...prepared, children }
  })
  if (nodeCount > L.maxNodes) issues.push(`${nodeCount} Knoten — höchstens ${L.maxNodes}. Eine Mindmap soll überschaubar bleiben`)

  if (issues.length > 0) throw new MindmapInputError(issues)
  return { style, center, branches }
}

// ── Layout ───────────────────────────────────────────────────────────────────────────────────

interface Box {
  x: number
  y: number
  width: number
  height: number
  textWidth: number
  textHeight: number
}

function measure(node: PreparedNode, style: MindmapStyle): Box {
  const { level } = node
  const textWidth = Math.ceil(Math.max(...node.lines.map(l => estimateLineWidth(l, style, level.fontSize))))
  const textHeight = node.lines.length * level.fontSize * STYLES[style].lineHeight
  const width = Math.max(level.minWidth, textWidth + 2 * level.padX)
  const height = Math.ceil(textHeight + 2 * level.padY)
  return { x: 0, y: 0, width, height, textWidth, textHeight }
}

const GAP_CENTER_BRANCH = 90
const GAP_BRANCH_LEAF = 60
const GAP_LEAF = 14
const GAP_SUBTREE = 30

interface LaidOutNode {
  node: PreparedNode
  box: Box
  role: 'center' | 'branch' | 'leaf'
  parent: LaidOutNode | null
}

function layout(center: PreparedNode, branches: PreparedBranch[], style: MindmapStyle): LaidOutNode[] {
  const centerBox = measure(center, style)
  centerBox.x = -centerBox.width / 2
  centerBox.y = -centerBox.height / 2
  const centerNode: LaidOutNode = { node: center, box: centerBox, role: 'center', parent: null }

  interface Subtree { branch: PreparedBranch; box: Box; leaves: Box[]; height: number }
  const subtrees: Subtree[] = branches.map(branch => {
    const box = measure(branch, style)
    const leaves = branch.children.map(c => measure(c, style))
    const leavesHeight = leaves.reduce((s, l) => s + l.height, 0) + Math.max(0, leaves.length - 1) * GAP_LEAF
    return { branch, box, leaves, height: Math.max(box.height, leavesHeight) }
  })

  // Seiten: der Reihe nach auf die gerade niedrigere Seite (bei Gleichstand rechts) — beide Seiten
  // werden etwa gleich hoch, die Reihenfolge bleibt je Seite von oben nach unten erhalten.
  const sides: { right: Subtree[]; left: Subtree[] } = { right: [], left: [] }
  const heightOf = (list: Subtree[]): number => list.reduce((s, t) => s + t.height, 0) + Math.max(0, list.length - 1) * GAP_SUBTREE
  for (const st of subtrees) {
    if (heightOf(sides.right) <= heightOf(sides.left)) sides.right.push(st)
    else sides.left.push(st)
  }

  const out: LaidOutNode[] = [centerNode]
  for (const side of ['right', 'left'] as const) {
    const list = sides[side]
    if (list.length === 0) continue
    const dir = side === 'right' ? 1 : -1
    const branchColWidth = Math.max(...list.map(t => t.box.width))
    // Äste bündig zur Mitte hin, Blätter bündig zu ihrem Ast hin.
    const branchEdge = side === 'right' ? centerBox.x + centerBox.width + GAP_CENTER_BRANCH : centerBox.x - GAP_CENTER_BRANCH
    const leafEdge = branchEdge + dir * (branchColWidth + GAP_BRANCH_LEAF)
    let y = -heightOf(list) / 2
    for (const st of list) {
      const midY = y + st.height / 2
      st.box.x = side === 'right' ? branchEdge : branchEdge - st.box.width
      st.box.y = midY - st.box.height / 2
      const branchNode: LaidOutNode = { node: st.branch, box: st.box, role: 'branch', parent: centerNode }
      out.push(branchNode)
      const leavesHeight = st.leaves.reduce((s, l) => s + l.height, 0) + Math.max(0, st.leaves.length - 1) * GAP_LEAF
      let ly = midY - leavesHeight / 2
      st.leaves.forEach((leafBox, i) => {
        leafBox.x = side === 'right' ? leafEdge : leafEdge - leafBox.width
        leafBox.y = ly
        ly += leafBox.height + GAP_LEAF
        out.push({ node: st.branch.children[i], box: leafBox, role: 'leaf', parent: branchNode })
      })
      y += st.height + GAP_SUBTREE
    }
  }
  // Excalidraw öffnet eine Datei mit der Ansicht auf Szenenkoordinate (0,0) oben links, und das
  // Plugin reicht kein `scrollToContent` durch. Ohne Verschiebung säße die Mitte in der Ecke und
  // man sähe beim Öffnen nur das untere rechte Viertel (GUI-Gegenprobe 12.10.2026). Oben mehr
  // Rand: dort liegen Excalidraws schwebende Werkzeugleiste und der Bedienhinweis (~100 px).
  const minX = Math.min(...out.map(n => n.box.x))
  const minY = Math.min(...out.map(n => n.box.y))
  for (const n of out) {
    n.box.x += SCENE_MARGIN_X - minX
    n.box.y += SCENE_MARGIN_Y - minY
  }
  return out
}

const SCENE_MARGIN_X = 40
const SCENE_MARGIN_Y = 110

// ── Szene ────────────────────────────────────────────────────────────────────────────────────

/** FNV-1a über die normalisierte Eingabe → Seed des PRNG. */
function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

/** Abstand der Linienenden vom Knotenrand (Excalidraw-Binding `gap`). */
const ARROW_GAP = 6

const r2 = (n: number): number => Math.round(n * 100) / 100

/** Punkt auf dem Rechteckrand in Richtung `toward`, um `gap` nach außen versetzt. */
function edgePoint(box: Box, toward: { x: number; y: number }, gap: number): { x: number; y: number } {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  const len = Math.hypot(dx, dy) || 1
  const t = Math.min(dx === 0 ? Infinity : (box.width / 2) / Math.abs(dx), dy === 0 ? Infinity : (box.height / 2) / Math.abs(dy))
  return { x: cx + dx * t + (dx / len) * gap, y: cy + dy * t + (dy / len) * gap }
}

export function buildExcalidrawMindmap(input: MindmapInput, options: MindmapBuildOptions): MindmapBuildResult {
  const { style, center, branches } = prepare(input, options)
  const def = STYLES[style]
  const nodes = layout(center, branches, style)

  const rand = mulberry32(hashString(JSON.stringify({
    style,
    center: center.text,
    branches: branches.map(b => [b.text, b.kind, b.link, b.children.map(c => [c.text, c.kind, c.link])])
  })))
  const usedIds = new Set<string>()
  const newId = (): string => {
    for (;;) {
      let id = ''
      for (let i = 0; i < 20; i++) id += ID_ALPHABET[Math.floor(rand() * ID_ALPHABET.length)]
      if (!usedIds.has(id)) {
        usedIds.add(id)
        return id
      }
    }
  }
  const newSeed = (): number => 1 + Math.floor(rand() * 2_147_483_646)

  const base = (type: string, id: string) => ({
    id,
    type,
    angle: 0,
    strokeStyle: 'solid',
    roughness: def.roughness,
    opacity: 100,
    groupIds: [] as string[],
    frameId: null,
    // F08: Excalidraw vergibt den fraktionalen Index beim restore() aus der Array-Reihenfolge.
    index: null,
    seed: newSeed(),
    version: 1,
    versionNonce: newSeed(),
    isDeleted: false,
    updated: options.now,
    locked: false
  })

  const rectIds = new Map<LaidOutNode, string>()
  const textIds = new Map<LaidOutNode, string>()
  for (const n of nodes) {
    rectIds.set(n, newId())
    textIds.set(n, newId())
  }

  // Linien zuerst: sie liegen in der Zeichenreihenfolge unter den Knoten.
  const arrows: Array<Record<string, unknown>> = []
  const arrowsOf = new Map<LaidOutNode, string[]>()
  for (const n of nodes) {
    if (!n.parent) continue
    const id = newId()
    const from = n.parent.box
    const to = n.box
    const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
    const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
    const start = edgePoint(from, toCenter, ARROW_GAP)
    const end = edgePoint(to, fromCenter, ARROW_GAP)
    const dx = r2(end.x - start.x)
    const dy = r2(end.y - start.y)
    arrows.push({
      ...base('arrow', id),
      x: r2(start.x),
      y: r2(start.y),
      width: Math.abs(dx),
      height: Math.abs(dy),
      strokeColor: PETROL,
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: n.role === 'branch' ? 2 : 1,
      roundness: { type: 2 },
      boundElements: [],
      link: null,
      points: [[0, 0], [dx, dy]],
      lastCommittedPoint: null,
      // F07: gebunden, nicht „elbowed", Pfeilspitzen ausdrücklich null (restore setzt sonst am Ende „arrow").
      startBinding: { elementId: rectIds.get(n.parent), focus: 0, gap: ARROW_GAP },
      endBinding: { elementId: rectIds.get(n), focus: 0, gap: ARROW_GAP },
      startArrowhead: null,
      endArrowhead: null,
      elbowed: false
    })
    arrowsOf.set(n.parent, [...(arrowsOf.get(n.parent) ?? []), id])
    arrowsOf.set(n, [...(arrowsOf.get(n) ?? []), id])
  }

  const shapes: Array<Record<string, unknown>> = []
  for (const n of nodes) {
    const kind = n.node.kind ? NOTE_KINDS[n.node.kind] : null
    const isCenter = n.role === 'center'
    const rectId = rectIds.get(n)!
    const textId = textIds.get(n)!
    const { box } = n
    shapes.push({
      ...base('rectangle', rectId),
      x: r2(box.x),
      y: r2(box.y),
      width: r2(box.width),
      height: r2(box.height),
      strokeColor: kind ? kind.dotColor : PETROL,
      backgroundColor: isCenter ? PETROL : kind ? kind.canvasColor : n.role === 'branch' ? PETROL_TINT : WHITE,
      fillStyle: 'solid',
      strokeWidth: n.role === 'leaf' ? 1 : 2,
      roundness: { type: 3 },
      boundElements: [
        { type: 'text', id: textId },
        ...(arrowsOf.get(n) ?? []).map(id => ({ type: 'arrow', id }))
      ],
      link: n.node.link,
      ...(isCenter ? { customData: { mindgraph: { generator: 'mindmap', version: 1 } } } : {})
    })
    // Gebundener Text: Excalidraw zentriert ihn im Kasten (computeBoundTextPosition) — dieselbe
    // Rechnung hier, damit beim ersten Verschieben nichts springt.
    shapes.push({
      ...base('text', textId),
      x: r2(box.x + (box.width - box.textWidth) / 2),
      y: r2(box.y + (box.height - box.textHeight) / 2),
      width: box.textWidth,
      height: r2(box.textHeight),
      strokeColor: isCenter ? WHITE : TEXT_DARK,
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      roundness: null,
      boundElements: null,
      link: null,
      text: n.node.lines.join('\n'),
      fontSize: n.node.level.fontSize,
      fontFamily: def.fontFamily,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectId,
      originalText: n.node.text,
      autoResize: true,
      lineHeight: def.lineHeight
    })
  }

  const scene = {
    type: 'excalidraw',
    version: 2,
    source: 'https://mindgraph-notes.de',
    elements: [...arrows, ...shapes],
    appState: {
      viewBackgroundColor: WHITE,
      gridSize: 20,
      currentItemFontFamily: def.fontFamily,
      currentItemStrokeColor: PETROL,
      currentItemRoughness: def.roughness
    },
    files: {}
  }

  const leafCount = branches.reduce((s, b) => s + b.children.length, 0)
  return {
    json: JSON.stringify(scene, null, 2),
    branchCount: branches.length,
    leafCount,
    nodeCount: 1 + branches.length + leafCount,
    linkCount: nodes.filter(n => n.node.link).length
  }
}
