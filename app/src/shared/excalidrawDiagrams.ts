// Vier-Felder-Matrix und Begriffsnetz (Concept Map) als Excalidraw-Datei für den Notiz-Agenten
// (Werkzeug `write_excalidraw` mit `diagram: "matrix" | "begriffsnetz"`, Skills „Vier-Felder-Matrix"
// und „Begriffsnetz"). Gleicher Grundsatz wie die Mindmap (excalidrawMindmap.ts): Das Modell liefert
// nur Inhalt und Struktur, Koordinaten, Verweise, Schrift und Farben setzt diese Datei. Textmaße,
// Zeichenvorrat und Schriften kommen von dort — sie sind gegen das Plugin gemessen.
//
// Weiterarbeiten in Excalidraw ist der Zweck: Karten der Matrix sind einzelne Kästen (verschiebbar
// zwischen den Feldern), Feldflächen und Achsen sind gesperrt, damit man sie beim Ziehen nicht
// greift. Im Begriffsnetz sind Pfeile an beide Begriffe gebunden, die Beschriftung hängt am Pfeil.
//
// Lage der Pfeilbeschriftung (Excalidraw 0.18.1, LinearElementEditor.getBoundTextElementPosition):
// bei ungerader Punktzahl der MITTLERE Punkt, bei gerader die Mitte des mittleren Abschnitts (auf
// einer Kurve, wenn der Pfeil gerundet ist). Diese Datei baut deshalb nur Pfeile ohne Rundung mit
// ungerader Punktzahl und legt den mittleren Punkt dorthin, wo die Beschriftung stehen soll —
// sonst spränge sie beim ersten Verschieben an eine andere Stelle.

import { NOTE_KINDS, type NoteKindId } from './noteKind'
import {
  ARROW_GAP, KIND_IDS, MindmapInputError, PETROL, PETROL_TINT, SCENE_MARGIN_X, SCENE_MARGIN_Y, STYLES, TEXT_DARK, WHITE,
  ID_ALPHABET, describeChar, edgePoint, estimateLineWidth, hashString, isAllowedChar, mulberry32, normalizeText,
  parseWikilinkTarget, r2, str, wrapLines,
  type Box, type Level, type MindmapStyle, type StyleDef
} from './excalidrawMindmap'

export interface DiagramBuildOptions {
  now: number
  resolveLink?: (target: string) => { path: string } | { error: string }
  brand?: { fill: string; tint: string }
}

export interface DiagramBuildResult {
  json: string
  summary: string
  linkCount: number
}

// ── Gemeinsames ─────────────────────────────────────────────────────────────────────────────

type El = Record<string, unknown>

interface Prepared {
  text: string
  lines: string[]
}

function parseStyle(raw: unknown, issues: string[]): MindmapStyle {
  const s = str(raw).trim().toLowerCase()
  if (s === 'skizze' || s === 'klar') return s
  if (s) issues.push(`Stil „${str(raw)}" unbekannt — erlaubt sind „klar" und „skizze"`)
  return 'klar'
}

/** Text prüfen und umbrechen. `oneLine`: muss in eine Zeile passen (Pfeilbeschriftung). */
function prepText(
  raw: unknown, where: string, opts: { maxChars: number; maxLines: number; level: Level; style: MindmapStyle; required?: boolean },
  issues: string[]
): Prepared {
  const text = normalizeText(raw)
  if (!text) {
    if (opts.required !== false) issues.push(`${where}: Text fehlt`)
    return { text, lines: [] }
  }
  if ([...text].length > opts.maxChars) issues.push(`${where} („${text.slice(0, 40)}…"): ${[...text].length} Zeichen — höchstens ${opts.maxChars}. Stichworte statt Sätze`)
  const bad = [...new Set([...text].filter(ch => !isAllowedChar(ch, opts.style)))]
  if (bad.length > 0) {
    issues.push(`${where} („${text.slice(0, 40)}"): ${bad.slice(0, 5).map(describeChar).join(', ')} ist in der Schrift nicht verfügbar — nur lateinische Schrift, keine Emojis oder Sonderzeichen`)
    return { text, lines: [text] }
  }
  const lines = wrapLines(text, opts.style, opts.level)
  if (lines.length > opts.maxLines) issues.push(`${where} („${text.slice(0, 40)}…"): ergibt ${lines.length} Zeilen — höchstens ${opts.maxLines}. Kürzer fassen`)
  return { text, lines }
}

function parseKind(raw: unknown, where: string, issues: string[]): NoteKindId | null {
  const k = str(raw).trim()
  if (!k) return null
  if ((KIND_IDS as string[]).includes(k)) return k as NoteKindId
  issues.push(`${where}: Kategorie „${k}" unbekannt — erlaubt sind ${KIND_IDS.join(', ')}`)
  return null
}

function parseLink(raw: unknown, where: string, options: DiagramBuildOptions, issues: string[]): string | null {
  const l = str(raw).trim()
  if (!l) return null
  const target = parseWikilinkTarget(l)
  if (!target) { issues.push(`${where}: Link „${l}" — nur [[Notizname]] oder [[Ordner/Notiz]], keine Abschnitte, keine URLs`); return null }
  if (!options.resolveLink) { issues.push(`${where}: Links sind hier nicht möglich`); return null }
  const res = options.resolveLink(target)
  if ('error' in res) { issues.push(`${where}: ${res.error}`); return null }
  return `[[${res.path}]]`
}

function textSize(lines: string[], style: MindmapStyle, fontSize: number): { w: number; h: number } {
  const w = lines.length ? Math.ceil(Math.max(...lines.map(l => estimateLineWidth(l, style, fontSize)))) : 0
  return { w, h: lines.length * fontSize * STYLES[style].lineHeight }
}

function boxFor(p: Prepared, style: MindmapStyle, level: Level, minWidth = level.minWidth): Box {
  const t = textSize(p.lines, style, level.fontSize)
  return { x: 0, y: 0, width: Math.max(minWidth, t.w + 2 * level.padX), height: Math.ceil(t.h + 2 * level.padY), textWidth: t.w, textHeight: t.h }
}

function accentColors(options: DiagramBuildOptions): { accent: string; tint: string } {
  const ok = options.brand && /^#[0-9a-fA-F]{6}$/.test(options.brand.fill) && /^#[0-9a-fA-F]{6}$/.test(options.brand.tint)
  return ok ? { accent: options.brand!.fill, tint: options.brand!.tint } : { accent: PETROL, tint: PETROL_TINT }
}

/** Baut Excalidraw-Elemente mit festen, aus der Eingabe abgeleiteten IDs und Seeds (gleiche Eingabe → gleiche Bytes). */
class SceneWriter {
  private readonly rand: () => number
  private readonly used = new Set<string>()
  /** Sichtbare Ausdehnung je Element (bei gedrehtem Text nicht x/y/width/height). */
  private readonly visual: Array<{ x: number; y: number; w: number; h: number }> = []
  readonly layers: { back: El[]; lines: El[]; front: El[] } = { back: [], lines: [], front: [] }

  constructor(seedSource: string, private readonly now: number, private readonly def: StyleDef) {
    this.rand = mulberry32(hashString(seedSource))
  }

  id(): string {
    for (;;) {
      let id = ''
      for (let i = 0; i < 20; i++) id += ID_ALPHABET[Math.floor(this.rand() * ID_ALPHABET.length)]
      if (!this.used.has(id)) { this.used.add(id); return id }
    }
  }

  private seed(): number { return 1 + Math.floor(this.rand() * 2_147_483_646) }

  private base(type: string, id: string, locked = false): El {
    return {
      id, type, angle: 0, strokeStyle: 'solid', roughness: this.def.roughness, opacity: 100, groupIds: [], frameId: null,
      index: null, seed: this.seed(), version: 1, versionNonce: this.seed(), isDeleted: false, updated: this.now, locked
    }
  }

  rect(layer: 'back' | 'front', box: Box, o: { stroke: string; fill: string; strokeWidth: number; locked?: boolean; link?: string | null; rounded?: boolean; customData?: unknown }): El {
    const el: El = {
      ...this.base('rectangle', this.id(), o.locked),
      x: r2(box.x), y: r2(box.y), width: r2(box.width), height: r2(box.height),
      strokeColor: o.stroke, backgroundColor: o.fill, fillStyle: 'solid', strokeWidth: o.strokeWidth,
      roundness: o.rounded === false ? null : { type: 3 }, boundElements: [] as unknown[], link: o.link ?? null,
      ...(o.customData ? { customData: o.customData } : {})
    }
    this.layers[layer].push(el)
    this.visual.push({ x: box.x, y: box.y, w: box.width, h: box.height })
    return el
  }

  /** Text im Kasten (gebunden, mittig — dieselbe Rechnung wie Excalidraws computeBoundTextPosition). */
  boundText(container: El, box: Box, p: Prepared, fontSize: number, color: string): El {
    const el: El = {
      ...this.base('text', this.id()),
      x: r2(box.x + (box.width - box.textWidth) / 2), y: r2(box.y + (box.height - box.textHeight) / 2),
      width: box.textWidth, height: r2(box.textHeight), strokeColor: color, backgroundColor: 'transparent', fillStyle: 'solid',
      strokeWidth: 1, roundness: null, boundElements: null, link: null, text: p.lines.join('\n'), fontSize, fontFamily: this.def.fontFamily,
      textAlign: 'center', verticalAlign: 'middle', containerId: container.id, originalText: p.text, autoResize: true, lineHeight: this.def.lineHeight
    };
    (container.boundElements as unknown[]).push({ type: 'text', id: el.id })
    this.layers.front.push(el)
    return el
  }

  /** Freier Text. `angle` dreht um die Mitte (Excalidraw-Verhalten); x/y = linke obere Ecke ungedreht. */
  freeText(p: Prepared, x: number, y: number, fontSize: number, color: string, align: 'left' | 'center' | 'right', angle = 0): El {
    const t = textSize(p.lines, this.style(), fontSize)
    const el: El = {
      ...this.base('text', this.id()), angle,
      x: r2(x), y: r2(y), width: t.w, height: r2(t.h), strokeColor: color, backgroundColor: 'transparent', fillStyle: 'solid',
      strokeWidth: 1, roundness: null, boundElements: null, link: null, text: p.lines.join('\n'), fontSize, fontFamily: this.def.fontFamily,
      textAlign: align, verticalAlign: 'top', containerId: null, originalText: p.text, autoResize: true, lineHeight: this.def.lineHeight
    }
    this.layers.front.push(el)
    if (angle !== 0) {
      const cx = x + t.w / 2
      const cy = y + t.h / 2
      this.visual.push({ x: cx - t.h / 2, y: cy - t.w / 2, w: t.h, h: t.w })
    } else {
      this.visual.push({ x, y, w: t.w, h: t.h })
    }
    return el
  }

  arrow(points: Array<{ x: number; y: number }>, o: { stroke: string; strokeWidth: number; head: boolean; locked?: boolean; from?: El; to?: El }): El {
    const x0 = points[0].x
    const y0 = points[0].y
    const rel = points.map(p => [r2(p.x - x0), r2(p.y - y0)])
    const xs = rel.map(p => p[0])
    const ys = rel.map(p => p[1])
    const el: El = {
      ...this.base('arrow', this.id(), o.locked),
      x: r2(x0), y: r2(y0), width: r2(Math.max(...xs) - Math.min(...xs)), height: r2(Math.max(...ys) - Math.min(...ys)),
      strokeColor: o.stroke, backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: o.strokeWidth,
      // Ohne Rundung: dann liegt die Beschriftung genau auf dem mittleren Punkt (siehe Dateikopf).
      roundness: null, boundElements: [] as unknown[], link: null, points: rel, lastCommittedPoint: null,
      startBinding: o.from ? { elementId: o.from.id, focus: 0, gap: ARROW_GAP } : null,
      endBinding: o.to ? { elementId: o.to.id, focus: 0, gap: ARROW_GAP } : null,
      startArrowhead: null, endArrowhead: o.head ? 'arrow' : null, elbowed: false
    }
    if (o.from) (o.from.boundElements as unknown[]).push({ type: 'arrow', id: el.id })
    if (o.to) (o.to.boundElements as unknown[]).push({ type: 'arrow', id: el.id })
    this.layers.lines.push(el)
    for (const p of points) this.visual.push({ x: p.x, y: p.y, w: 0, h: 0 })
    return el
  }

  /** Beschriftung am Pfeil, mittig auf `at` (muss der mittlere Punkt des Pfeils sein). */
  arrowLabel(arrow: El, p: Prepared, at: { x: number; y: number }, fontSize: number, color: string): El {
    const t = textSize(p.lines, this.style(), fontSize)
    const el: El = {
      ...this.base('text', this.id()),
      x: r2(at.x - t.w / 2), y: r2(at.y - t.h / 2), width: t.w, height: r2(t.h), strokeColor: color, backgroundColor: 'transparent',
      fillStyle: 'solid', strokeWidth: 1, roundness: null, boundElements: null, link: null, text: p.lines.join('\n'), fontSize,
      fontFamily: this.def.fontFamily, textAlign: 'center', verticalAlign: 'middle', containerId: arrow.id, originalText: p.text,
      autoResize: true, lineHeight: this.def.lineHeight
    };
    (arrow.boundElements as unknown[]).push({ type: 'text', id: el.id })
    this.layers.front.push(el)
    this.visual.push({ x: at.x - t.w / 2, y: at.y - t.h / 2, w: t.w, h: t.h })
    return el
  }

  private style(): MindmapStyle { return this.def.font === 'Nunito' ? 'klar' : 'skizze' }

  /** Alles so verschieben, dass die Szene oben links im sichtbaren Bereich beginnt (Excalidraw öffnet bei 0,0). */
  finish(accent: string): string {
    const minX = Math.min(...this.visual.map(v => v.x))
    const minY = Math.min(...this.visual.map(v => v.y))
    const dx = SCENE_MARGIN_X - minX
    const dy = SCENE_MARGIN_Y - minY
    const all = [...this.layers.back, ...this.layers.lines, ...this.layers.front]
    for (const el of all) {
      el.x = r2((el.x as number) + dx)
      el.y = r2((el.y as number) + dy)
    }
    return JSON.stringify({
      type: 'excalidraw', version: 2, source: 'https://mindgraph-notes.de', elements: all,
      appState: { viewBackgroundColor: WHITE, gridSize: 20, currentItemFontFamily: this.def.fontFamily, currentItemStrokeColor: accent, currentItemRoughness: this.def.roughness },
      files: {}
    }, null, 2)
  }
}

const HEADING: Level = { fontSize: 28, wrapWidth: 700, maxWordWidth: 700, padX: 0, padY: 0, minWidth: 0 }

// ── Vier-Felder-Matrix ──────────────────────────────────────────────────────────────────────

export const MATRIX_LIMITS = { maxItemsPerQuadrant: 6, maxItemChars: 80, maxQuadrantTitleChars: 40, maxTitleChars: 80, maxAxisChars: 30, maxLines: 3 } as const

export interface MatrixAxisInput { label?: string; low?: string; high?: string }
export interface MatrixQuadrantInput { title: string; items?: unknown[]; kind?: string }
export interface MatrixInput { title?: string; quadrants: MatrixQuadrantInput[]; x_axis?: MatrixAxisInput; y_axis?: MatrixAxisInput; style?: string }

const QUAD_TITLE: Level = { fontSize: 20, wrapWidth: 300, maxWordWidth: 360, padX: 0, padY: 0, minWidth: 0 }
const CARD: Level = { fontSize: 16, wrapWidth: 220, maxWordWidth: 300, padX: 12, padY: 8, minWidth: 0 }
const AXIS: Level = { fontSize: 16, wrapWidth: 1000, maxWordWidth: 1000, padX: 0, padY: 0, minWidth: 0 }
const QUAD_ORDER = ['oben links', 'oben rechts', 'unten links', 'unten rechts']
const QUAD_PAD = 20
const QUAD_GAP = 16
const CARD_GAP = 10
const MIN_QUAD_INNER_W = 240
const MIN_QUAD_H = 220

export function buildExcalidrawMatrix(input: MatrixInput, options: DiagramBuildOptions): DiagramBuildResult {
  const L = MATRIX_LIMITS
  const issues: string[] = []
  const style = parseStyle(input.style, issues)
  const def = STYLES[style]
  const title = prepText(input.title, 'Titel', { maxChars: L.maxTitleChars, maxLines: 2, level: HEADING, style, required: false }, issues)

  const quadsIn = Array.isArray(input.quadrants) ? input.quadrants : []
  if (quadsIn.length !== 4) issues.push(`${quadsIn.length} Felder — eine Vier-Felder-Matrix hat genau 4 (Reihenfolge: ${QUAD_ORDER.join(', ')})`)
  const quads = quadsIn.slice(0, 4).map((q, i) => {
    const where = `Feld ${i + 1} (${QUAD_ORDER[i]})`
    const t = prepText(q?.title, where, { maxChars: L.maxQuadrantTitleChars, maxLines: 2, level: QUAD_TITLE, style }, issues)
    const kind = parseKind(q?.kind, where, issues)
    const itemsIn = Array.isArray(q?.items) ? q.items : []
    if (itemsIn.length > L.maxItemsPerQuadrant) issues.push(`${where}: ${itemsIn.length} Einträge — höchstens ${L.maxItemsPerQuadrant}. Zusammenfassen`)
    const seen = new Set<string>()
    const items = itemsIn.slice(0, L.maxItemsPerQuadrant).map((it, j) => {
      // Einträge als Text oder als {text}.
      const raw = typeof it === 'string' ? it : (it as { text?: unknown })?.text
      const p = prepText(raw, `${where}, Eintrag ${j + 1}`, { maxChars: L.maxItemChars, maxLines: L.maxLines, level: CARD, style }, issues)
      const key = p.text.toLowerCase()
      if (key && seen.has(key)) issues.push(`${where}, Eintrag ${j + 1}: „${p.text}" kommt doppelt vor`)
      seen.add(key)
      return p
    })
    return { title: t, kind, items }
  })

  const axis = (raw: MatrixAxisInput | undefined, name: string): { label: Prepared; low: Prepared; high: Prepared } | null => {
    if (!raw || typeof raw !== 'object') return null
    const o = { maxChars: L.maxAxisChars, maxLines: 1, level: AXIS, style, required: false }
    const label = prepText(raw.label, `${name}, Beschriftung`, o, issues)
    const low = prepText(raw.low, `${name}, niedrig`, o, issues)
    const high = prepText(raw.high, `${name}, hoch`, o, issues)
    if (!label.text && !low.text && !high.text) return null
    if (!label.text) issues.push(`${name}: Beschriftung fehlt (z. B. „Dringlichkeit")`)
    return { label, low, high }
  }
  const xAxis = axis(input.x_axis, 'x-Achse')
  const yAxis = axis(input.y_axis, 'y-Achse')

  if (issues.length > 0) throw new MindmapInputError(issues)

  const { accent, tint } = accentColors(options)
  const w = new SceneWriter(JSON.stringify({ d: 'matrix', style, title: title.text, quads: quads.map(q => [q.title.text, q.kind, q.items.map(i => i.text)]), x: xAxis && [xAxis.label.text, xAxis.low.text, xAxis.high.text], y: yAxis && [yAxis.label.text, yAxis.low.text, yAxis.high.text] }), options.now, def)

  // Maße: alle vier Felder gleich groß, Karten in voller Feldbreite.
  const cardBoxes = quads.map(q => q.items.map(it => boxFor(it, style, CARD, 0)))
  const titleSizes = quads.map(q => textSize(q.title.lines, style, QUAD_TITLE.fontSize))
  const innerW = Math.max(MIN_QUAD_INNER_W, ...cardBoxes.flat().map(b => b.width), ...titleSizes.map(t => t.w))
  const quadH = Math.max(MIN_QUAD_H, ...quads.map((_q, i) =>
    QUAD_PAD + titleSizes[i].h + 14 + cardBoxes[i].reduce((s, b) => s + b.height, 0) + Math.max(0, cardBoxes[i].length - 1) * CARD_GAP + QUAD_PAD))
  const quadW = innerW + 2 * QUAD_PAD
  const gridW = 2 * quadW + QUAD_GAP
  const gridH = 2 * quadH + QUAD_GAP

  // Gitter beginnt bei (0,0); Achsen und Titel liegen links/oben/unten davon, finish() verschiebt alles.
  let cardCount = 0
  quads.forEach((q, i) => {
    const qx = (i % 2) * (quadW + QUAD_GAP)
    const qy = Math.floor(i / 2) * (quadH + QUAD_GAP)
    const kind = q.kind ? NOTE_KINDS[q.kind] : null
    w.rect('back', { x: qx, y: qy, width: quadW, height: quadH, textWidth: 0, textHeight: 0 }, {
      stroke: kind ? kind.dotColor : accent, fill: kind ? kind.canvasColor : tint, strokeWidth: 2, locked: true,
      ...(i === 0 ? { customData: { mindgraph: { generator: 'matrix', version: 1 } } } : {})
    })
    w.freeText(q.title, qx + QUAD_PAD, qy + QUAD_PAD, QUAD_TITLE.fontSize, kind ? kind.dotColor : accent, 'left')
    let cy = qy + QUAD_PAD + titleSizes[i].h + 14
    q.items.forEach((it, j) => {
      const b = cardBoxes[i][j]
      const box: Box = { ...b, x: qx + QUAD_PAD, y: cy, width: innerW }
      const rect = w.rect('front', box, { stroke: kind ? kind.dotColor : accent, fill: WHITE, strokeWidth: 1 })
      w.boundText(rect, box, it, CARD.fontSize, TEXT_DARK)
      cy += b.height + CARD_GAP
      cardCount++
    })
  })

  const axisColor = accent
  if (xAxis) {
    const ay = gridH + 22
    w.arrow([{ x: 0, y: ay }, { x: gridW, y: ay }], { stroke: axisColor, strokeWidth: 2, head: true, locked: true })
    const rowY = ay + 10
    const lowW = textSize(xAxis.low.lines, style, AXIS.fontSize).w
    const highW = textSize(xAxis.high.lines, style, AXIS.fontSize).w
    const lab = textSize(xAxis.label.lines, style, AXIS.fontSize)
    if (xAxis.low.text) w.freeText(xAxis.low, 0, rowY, AXIS.fontSize, TEXT_DARK, 'left')
    if (xAxis.high.text) w.freeText(xAxis.high, gridW - highW, rowY, AXIS.fontSize, TEXT_DARK, 'right')
    // Hauptbeschriftung mittig in derselben Zeile, wenn sie zwischen „niedrig" und „hoch" passt, sonst darunter.
    const fitsRow = lab.w + 2 * 24 + 2 * Math.max(lowW, highW) <= gridW
    w.freeText(xAxis.label, gridW / 2 - lab.w / 2, fitsRow ? rowY : rowY + lab.h + 6, AXIS.fontSize, accent, 'center')
  }
  if (yAxis) {
    const ax = -22
    w.arrow([{ x: ax, y: gridH }, { x: ax, y: 0 }], { stroke: axisColor, strokeWidth: 2, head: true, locked: true })
    const lowS = textSize(yAxis.low.lines, style, AXIS.fontSize)
    const highS = textSize(yAxis.high.lines, style, AXIS.fontSize)
    const colRight = ax - 10
    if (yAxis.high.text) w.freeText(yAxis.high, colRight - highS.w, 0, AXIS.fontSize, TEXT_DARK, 'right')
    if (yAxis.low.text) w.freeText(yAxis.low, colRight - lowS.w, gridH - lowS.h, AXIS.fontSize, TEXT_DARK, 'right')
    // Hauptbeschriftung um 90° gedreht, links neben der Spalte „niedrig/hoch".
    const lab = textSize(yAxis.label.lines, style, AXIS.fontSize)
    const colW = Math.max(lowS.w, highS.w)
    const cx = colRight - colW - 14 - lab.h / 2
    const cy = gridH / 2
    w.freeText(yAxis.label, cx - lab.w / 2, cy - lab.h / 2, AXIS.fontSize, accent, 'center', (3 * Math.PI) / 2)
  }
  if (title.text) {
    const t = textSize(title.lines, style, HEADING.fontSize)
    w.freeText(title, gridW / 2 - t.w / 2, -t.h - 28, HEADING.fontSize, TEXT_DARK, 'center')
  }

  const axes = [xAxis && 'x', yAxis && 'y'].filter(Boolean).length
  return {
    json: w.finish(accent),
    summary: `Vier-Felder-Matrix, ${cardCount} Einträge${axes ? `, ${axes === 2 ? 'zwei Achsen' : 'eine Achse'}` : ''}`,
    linkCount: 0
  }
}

// ── Begriffsnetz (Concept Map) ──────────────────────────────────────────────────────────────

export const CONCEPT_LIMITS = { minConcepts: 3, maxConcepts: 15, minRelations: 2, maxRelations: 25, maxConceptChars: 60, maxLabelChars: 30, maxTitleChars: 80, maxLines: 3 } as const

export interface ConceptInput { text: string; kind?: string; link?: string }
export interface RelationInput { from: string; to: string; label: string }
export interface ConceptMapInput { title?: string; concepts: ConceptInput[]; relations: RelationInput[]; style?: string }

const CONCEPT: Level = { fontSize: 18, wrapWidth: 200, maxWordWidth: 300, padX: 14, padY: 10, minWidth: 110 }
const LABEL_FONT = 14
const LABEL_MAX_W = 230
const NODE_GAP_X = 48
const LAYER_GAP_Y = 110
const DUMMY_W = 24
/** Abstand der Beschriftung vom Begriff, an dessen Seite sie steht. */
const LABEL_OFFSET = 26

interface CNode {
  idx: number
  dummy: boolean
  layer: number
  width: number
  /** Platz, den der Knoten in seiner Reihe braucht (Breite oder Beschriftung, je größer). */
  slot: number
  height: number
  x: number
  y: number
  order: number
}

export function buildExcalidrawConceptMap(input: ConceptMapInput, options: DiagramBuildOptions): DiagramBuildResult {
  const L = CONCEPT_LIMITS
  const issues: string[] = []
  const style = parseStyle(input.style, issues)
  const def = STYLES[style]
  const title = prepText(input.title, 'Titel', { maxChars: L.maxTitleChars, maxLines: 2, level: HEADING, style, required: false }, issues)

  const conceptsIn = Array.isArray(input.concepts) ? input.concepts : []
  if (conceptsIn.length < L.minConcepts) issues.push(`${conceptsIn.length} Begriffe — mindestens ${L.minConcepts}`)
  if (conceptsIn.length > L.maxConcepts) issues.push(`${conceptsIn.length} Begriffe — höchstens ${L.maxConcepts}. Ein Begriffsnetz soll überschaubar bleiben; lieber zwei Netze`)
  const byKey = new Map<string, number>()
  const concepts = conceptsIn.slice(0, L.maxConcepts).map((c, i) => {
    const where = `Begriff ${i + 1}`
    const p = prepText(c?.text, where, { maxChars: L.maxConceptChars, maxLines: L.maxLines, level: CONCEPT, style }, issues)
    const key = p.text.toLowerCase()
    if (key && byKey.has(key)) issues.push(`${where}: „${p.text}" kommt doppelt vor`)
    else if (key) byKey.set(key, i)
    return { p, kind: parseKind(c?.kind, where, issues), link: parseLink(c?.link, where, options, issues) }
  })

  const relationsIn = Array.isArray(input.relations) ? input.relations : []
  if (relationsIn.length < L.minRelations) issues.push(`${relationsIn.length} Beziehungen — mindestens ${L.minRelations}`)
  if (relationsIn.length > L.maxRelations) issues.push(`${relationsIn.length} Beziehungen — höchstens ${L.maxRelations}`)
  const known = concepts.map(c => `„${c.p.text}"`).slice(0, 15).join(', ')
  const pairs = new Set<string>()
  const relations = relationsIn.slice(0, L.maxRelations).flatMap((r, i) => {
    const where = `Beziehung ${i + 1}`
    const fromKey = normalizeText(r?.from).toLowerCase()
    const toKey = normalizeText(r?.to).toLowerCase()
    const from = byKey.get(fromKey)
    const to = byKey.get(toKey)
    if (from === undefined) issues.push(`${where}: „${str(r?.from)}" ist kein Begriff der Liste — from/to müssen genau einem Begriff entsprechen (${known})`)
    if (to === undefined) issues.push(`${where}: „${str(r?.to)}" ist kein Begriff der Liste — from/to müssen genau einem Begriff entsprechen (${known})`)
    const label = prepText(r?.label, `${where}, Beschriftung`, { maxChars: L.maxLabelChars, maxLines: 1, level: { fontSize: LABEL_FONT, wrapWidth: LABEL_MAX_W, maxWordWidth: LABEL_MAX_W, padX: 0, padY: 0, minWidth: 0 }, style }, issues)
    if (from === undefined || to === undefined) return []
    if (from === to) { issues.push(`${where}: Begriff „${concepts[from].p.text}" zeigt auf sich selbst`); return [] }
    const pk = `${from}>${to}`
    if (pairs.has(pk)) { issues.push(`${where}: Beziehung „${concepts[from].p.text}" → „${concepts[to].p.text}" kommt doppelt vor`); return [] }
    pairs.add(pk)
    return [{ from, to, label }]
  })
  const linked = new Set(relations.flatMap(r => [r.from, r.to]))
  concepts.forEach((c, i) => {
    if (c.p.text && !linked.has(i) && relations.length > 0) issues.push(`Begriff „${c.p.text}" hat keine Beziehung — jeder Begriff braucht mindestens einen Pfeil, sonst weglassen`)
  })

  if (issues.length > 0) throw new MindmapInputError(issues)

  const { accent, tint } = accentColors(options)
  const n = concepts.length
  const boxes = concepts.map(c => boxFor(c.p, style, CONCEPT))

  // 1) Zyklen brechen (Tiefensuche in Eingabereihenfolge): Rückwärtskanten zeigen für die Ebenen
  //    nach unten, gezeichnet wird trotzdem die echte Richtung.
  const out: number[][] = Array.from({ length: n }, () => [])
  relations.forEach((r, ri) => out[r.from].push(ri))
  const reversed = new Set<number>()
  const state = new Array<number>(n).fill(0) // 0 neu, 1 auf dem Stapel, 2 fertig
  const visit = (v: number): void => {
    state[v] = 1
    for (const ri of out[v]) {
      const t = relations[ri].to
      if (state[t] === 1) reversed.add(ri)
      else if (state[t] === 0) visit(t)
    }
    state[v] = 2
  }
  for (let v = 0; v < n; v++) if (state[v] === 0) visit(v)
  const dag = relations.map((r, ri) => (reversed.has(ri) ? { u: r.to, v: r.from } : { u: r.from, v: r.to }))

  // 2) Ebenen: längster Weg von den Quellen (Begriff ohne eingehende Kante → oben).
  const layer = new Array<number>(n).fill(0)
  for (let round = 0; round < n; round++) {
    let changed = false
    for (const e of dag) if (layer[e.v] < layer[e.u] + 1) { layer[e.v] = layer[e.u] + 1; changed = true }
    if (!changed) break
  }

  // 3) Beschriftungslage je Kante: neben dem Ende, das die Kante allein hat (dort ist Platz).
  const inDeg = new Array<number>(n).fill(0)
  const outDeg = new Array<number>(n).fill(0)
  for (const e of dag) { inDeg[e.v]++; outDeg[e.u]++ }
  const labelSizes = relations.map(r => textSize(r.label.lines, style, LABEL_FONT))

  // 4) Knoten + Platzhalter für Kanten über mehrere Ebenen.
  const nodes: CNode[] = concepts.map((_, i) => ({ idx: i, dummy: false, layer: layer[i], width: boxes[i].width, slot: boxes[i].width, height: boxes[i].height, x: 0, y: 0, order: i }))
  interface Chain { ri: number; ids: number[]; labelAt: 'lower' | 'upper' | 'middle'; labelNode: number | null }
  const chains: Chain[] = dag.map((e, ri) => {
    const span = layer[e.v] - layer[e.u]
    const ids = [e.u]
    for (let k = 1; k < span; k++) {
      nodes.push({ idx: -1, dummy: true, layer: layer[e.u] + k, width: DUMMY_W, slot: DUMMY_W, height: 0, x: 0, y: 0, order: nodes.length })
      ids.push(nodes.length - 1)
    }
    ids.push(e.v)
    const labelAt: Chain['labelAt'] = span > 1 ? 'middle' : inDeg[e.v] <= 1 ? 'lower' : outDeg[e.u] <= 1 ? 'upper' : 'middle'
    let labelNode: number | null = null
    if (span > 1) {
      // Beschriftung auf dem mittleren Platzhalter — der Platzhalter bekommt ihre Breite als Platz.
      labelNode = ids[Math.floor(ids.length / 2)]
      nodes[labelNode].slot = Math.max(nodes[labelNode].slot, labelSizes[ri].w + 12)
    } else if (labelAt === 'lower') {
      nodes[e.v].slot = Math.max(nodes[e.v].slot, labelSizes[ri].w + 12)
    } else if (labelAt === 'upper') {
      nodes[e.u].slot = Math.max(nodes[e.u].slot, labelSizes[ri].w + 12)
    }
    return { ri, ids, labelAt, labelNode }
  })
  const segs: Array<[number, number]> = chains.flatMap(c => c.ids.slice(1).map((id, k) => [c.ids[k], id] as [number, number]))

  // 5) Reihenfolge je Ebene: Schwerpunktverfahren, abwechselnd von oben und von unten.
  const maxLayer = Math.max(...nodes.map(nd => nd.layer))
  const rows: number[][] = Array.from({ length: maxLayer + 1 }, () => [])
  nodes.forEach((nd, id) => rows[nd.layer].push(id))
  const pos = (): Map<number, number> => {
    const m = new Map<number, number>()
    rows.forEach(r => r.forEach((id, i) => m.set(id, i)))
    return m
  }
  for (let sweep = 0; sweep < 6; sweep++) {
    const down = sweep % 2 === 0
    const range = down ? [...Array(maxLayer).keys()].map(i => i + 1) : [...Array(maxLayer).keys()].map(i => maxLayer - 1 - i)
    for (const li of range) {
      const p = pos()
      const bary = new Map<number, number>()
      for (const id of rows[li]) {
        const nb = segs.filter(([a, b]) => (down ? b === id : a === id)).map(([a, b]) => p.get(down ? a : b)!)
        bary.set(id, nb.length ? nb.reduce((s, x) => s + x, 0) / nb.length : p.get(id)!)
      }
      rows[li] = [...rows[li]].sort((a, b) => bary.get(a)! - bary.get(b)! || p.get(a)! - p.get(b)!)
    }
  }

  // 6) Waagerecht: jede Reihe dicht gepackt und mittig, dann zweimal zu den Nachbarn hingezogen
  //    (ohne Überlappung, Reihenfolge bleibt).
  // Zwei Durchläufe (nach rechts schiebend, nach links schiebend), dann der Mittelwert: Beide halten
  // die Mindestabstände ein, also auch ihr Mittel — und keiner driftet einseitig weg.
  const place = (row: number[], want: (id: number) => number): void => {
    const fwd: number[] = []
    let prevRight = -Infinity
    for (const id of row) {
      const x = Math.max(want(id), prevRight + NODE_GAP_X + nodes[id].slot / 2)
      fwd.push(x)
      prevRight = x + nodes[id].slot / 2
    }
    const bwd: number[] = new Array(row.length)
    let nextLeft = Infinity
    for (let i = row.length - 1; i >= 0; i--) {
      const x = Math.min(want(row[i]), nextLeft - NODE_GAP_X - nodes[row[i]].slot / 2)
      bwd[i] = x
      nextLeft = x - nodes[row[i]].slot / 2
    }
    row.forEach((id, i) => { nodes[id].x = (fwd[i] + bwd[i]) / 2 })
  }
  for (const row of rows) {
    const total = row.reduce((s, id) => s + nodes[id].slot, 0) + Math.max(0, row.length - 1) * NODE_GAP_X
    let x = -total / 2
    for (const id of row) { nodes[id].x = x + nodes[id].slot / 2; x += nodes[id].slot + NODE_GAP_X }
  }
  for (let round = 0; round < 2; round++) {
    for (let li = 1; li <= maxLayer; li++) {
      place(rows[li], id => {
        const nb = segs.filter(([, b]) => b === id).map(([a]) => nodes[a].x)
        return nb.length ? nb.reduce((s, x) => s + x, 0) / nb.length : nodes[id].x
      })
    }
    for (let li = maxLayer - 1; li >= 0; li--) {
      place(rows[li], id => {
        const nb = segs.filter(([a]) => a === id).map(([, b]) => nodes[b].x)
        return nb.length ? nb.reduce((s, x) => s + x, 0) / nb.length : nodes[id].x
      })
    }
  }

  // 7) Senkrecht: Reihenhöhe = höchster Begriff, Begriffe in der Reihe mittig.
  let y = 0
  const rowMid: number[] = []
  for (const row of rows) {
    const h = Math.max(30, ...row.map(id => nodes[id].height))
    rowMid.push(y + h / 2)
    for (const id of row) nodes[id].y = y + h / 2
    y += h + LAYER_GAP_Y
  }

  // 8) Zeichnen.
  const w = new SceneWriter(JSON.stringify({ d: 'begriffsnetz', style, title: title.text, c: concepts.map(c => [c.p.text, c.kind, c.link]), r: relations.map(r => [r.from, r.to, r.label.text]) }), options.now, def)
  const conceptBox = (i: number): Box => ({ ...boxes[i], x: nodes[i].x - boxes[i].width / 2, y: nodes[i].y - boxes[i].height / 2 })
  const rectEls = concepts.map((c, i) => {
    const kind = c.kind ? NOTE_KINDS[c.kind] : null
    const main = i === 0
    const box = conceptBox(i)
    const rect = w.rect('front', box, {
      stroke: kind ? kind.dotColor : accent,
      fill: main ? accent : kind ? kind.canvasColor : nodes[i].layer === 0 ? tint : WHITE,
      strokeWidth: main || nodes[i].layer === 0 ? 2 : 1, link: c.link,
      ...(main ? { customData: { mindgraph: { generator: 'begriffsnetz', version: 1 } } } : {})
    })
    w.boundText(rect, box, c.p, CONCEPT.fontSize, main ? WHITE : TEXT_DARK)
    return rect
  })

  for (const ch of chains) {
    const r = relations[ch.ri]
    const ids = ch.ids
    const first = ids[0]
    const last = ids[ids.length - 1]
    const center = (id: number) => ({ x: nodes[id].x, y: nodes[id].y })
    // Wegpunkte in Ebenen-Richtung (oben → unten).
    const inner = ids.slice(1, -1).map(center)
    const start = edgePoint(conceptBox(first), inner[0] ?? center(last), ARROW_GAP)
    const end = edgePoint(conceptBox(last), inner[inner.length - 1] ?? center(first), ARROW_GAP)
    let pts = [start, ...inner, end]
    let labelPoint: { x: number; y: number }
    if (ch.labelNode !== null) {
      labelPoint = center(ch.labelNode)
    } else {
      // Kante über eine Ebene: ein Punkt auf der geraden Linie, an dem die Beschriftung steht.
      const lh = labelSizes[ch.ri].h
      const yWant = ch.labelAt === 'lower'
        ? end.y - LABEL_OFFSET - lh / 2
        : ch.labelAt === 'upper' ? start.y + LABEL_OFFSET + lh / 2 : (start.y + end.y) / 2
      const t = end.y === start.y ? 0.5 : Math.min(0.85, Math.max(0.15, (yWant - start.y) / (end.y - start.y)))
      labelPoint = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
      pts = [start, labelPoint, end]
    }
    // Die Beschriftung muss auf dem MITTLEREN Punkt liegen (Excalidraw): kürzere Seite mit Punkten
    // auf der Linie auffüllen, bis der Beschriftungspunkt in der Mitte steht.
    let li = pts.findIndex(p => p === labelPoint || (p.x === labelPoint.x && p.y === labelPoint.y))
    while (li !== (pts.length - 1) / 2) {
      const before = li
      const after = pts.length - 1 - li
      if (before < after) {
        pts.splice(1, 0, { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 })
        li++
      } else {
        const k = pts.length - 1
        pts.splice(k, 0, { x: (pts[k - 1].x + pts[k].x) / 2, y: (pts[k - 1].y + pts[k].y) / 2 })
      }
    }
    // Gezeichnet in der echten Richtung der Beziehung.
    const reversedEdge = reversed.has(ch.ri)
    if (reversedEdge) pts = [...pts].reverse()
    const arrow = w.arrow(pts, { stroke: accent, strokeWidth: 1.5, head: true, from: rectEls[r.from], to: rectEls[r.to] })
    w.arrowLabel(arrow, r.label, labelPoint, LABEL_FONT, TEXT_DARK)
  }

  if (title.text) {
    const t = textSize(title.lines, style, HEADING.fontSize)
    const minX = Math.min(...nodes.map(nd => nd.x - nd.slot / 2))
    const maxX = Math.max(...nodes.map(nd => nd.x + nd.slot / 2))
    w.freeText(title, (minX + maxX) / 2 - t.w / 2, Math.min(...rowMid) - Math.max(...rows[0].map(id => nodes[id].height)) / 2 - t.h - 36, HEADING.fontSize, TEXT_DARK, 'center')
  }

  const linkCount = concepts.filter(c => c.link).length
  return {
    json: w.finish(accent),
    summary: `Begriffsnetz, ${n} Begriffe, ${relations.length} Beziehungen${linkCount ? `, ${linkCount} Links` : ''}`,
    linkCount
  }
}
