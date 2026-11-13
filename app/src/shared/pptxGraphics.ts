// Zeitleiste und Balkendiagramm für write_pptx: aus wenigen Angaben des Modells
// (Blöcke mit Dauer bzw. Balken mit Wert) werden gezeichnete Formen in einer Fläche,
// die das Layout vorgibt. Bewusst Formen statt eines Diagramm-Objekts: kein
// eingebettetes Excel, kein „Reparieren?“, gleich in PowerPoint und LibreOffice, und
// jeder Balken bleibt von Hand umfärb- und verschiebbar. Farben nur über das Farbschema
// der Vorlage (Akzent, dunkle Farbe, Text) — so folgt beides jedem Hausdesign.

export interface GraphicBox {
  x: number
  y: number
  cx: number
  cy: number
}

export interface PptxTimelineBlock {
  /** Name des Abschnitts („Einstieg“). */
  label: string
  /** Dauer bzw. Umfang — bestimmt die Breite. */
  value: number
  /** Akzentfarbe: die Phasen, auf die es ankommt (z. B. „hier arbeitet das Publikum selbst“). */
  highlight?: boolean
  /** Pause: gestrichelter Rahmen statt Fläche. */
  pause?: boolean
  /** Zeile, in der der Block steht („Teil 1“). Gleiche Namen = gleiche Zeile; leer = eine Zeile. */
  row?: string
}

export interface PptxTimeline {
  /** Einheit hinter der Zahl, Standard „Min.“. */
  unit?: string
  blocks: PptxTimelineBlock[]
  /** Erklärung der beiden Farben unter der Zeitleiste. */
  legend?: { normal?: string; highlight?: string }
}

export interface PptxChartBar {
  label: string
  /** Bestimmt die Balkenlänge UND die Zahl am Balkenende — eine abweichende Beschriftung gibt es bewusst nicht (Codex F05/F09). */
  value: number
  highlight?: boolean
}

export interface PptxChart {
  /** Was gemessen wird, mit Einheit („Benötigter Arbeitsspeicher in GB“). */
  caption?: string
  bars: PptxChartBar[]
  /** Quelle und Lesehilfe unter dem Diagramm. */
  note?: string
}

export interface PptxFlowStep {
  /** Name der Station („Modell überlegt“). */
  label: string
  /** Eine kurze Zeile unter der Station. */
  text?: string
  /** Station gehört zur Schleife. Die Stationen einer Schleife stehen nebeneinander. */
  loop?: boolean
}

export interface PptxFlow {
  steps: PptxFlowStep[]
  /** Beschriftung der Schleife („wiederholt sich, höchstens 20 Runden“). */
  loopLabel?: string
}

export const GRAPHIC_LIMITS = {
  minFlowSteps: 3,
  maxFlowSteps: 7,
  maxFlowLabelChars: 28,
  maxFlowTextChars: 70,
  maxLoopLabelChars: 70,
  maxTimelineBlocks: 16,
  maxTimelineRows: 3,
  maxBlocksPerRow: 8,
  maxBlockLabelChars: 28,
  maxRowChars: 30,
  maxUnitChars: 12,
  maxLegendChars: 60,
  minBars: 2,
  maxBars: 8,
  maxBarLabelChars: 40,
  maxCaptionChars: 90,
  maxChartNoteChars: 220,
  /** Größter Wert einer Dauer oder eines Balkens — weit über allem Darstellbaren, aber endlich. */
  maxValue: 1_000_000_000
} as const

const IN = 914400

/** Zahl aus Modellangaben: echte Zahl oder Zahlentext („3,4“, „10“). Sonst NaN. */
export function graphicNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  if (typeof v !== 'string') return NaN
  const t = v.trim().replace(/\s/g, '')
  if (!/^-?\d+([.,]\d+)?$/.test(t)) return NaN
  // Auch Zahlentext kann überlaufen: 400 Ziffern ergeben Infinity und später NaN-Koordinaten (Codex F01).
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

function isText(v: unknown): v is string {
  return typeof v === 'string'
}

/** Prüft eine Zeitleiste; liefert verständliche Befunde (leer = in Ordnung). */
export function validateTimeline(t: unknown, where: string): string[] {
  const issues: string[] = []
  if (!t || typeof t !== 'object' || Array.isArray(t)) return [`${where}: "timeline" muss ein Objekt mit "blocks" sein`]
  const tl = t as Partial<PptxTimeline>
  if (!Array.isArray(tl.blocks) || tl.blocks.length === 0) return [`${where}: "timeline.blocks" fehlt — Liste mit label und value je Abschnitt`]
  if (tl.blocks.length > GRAPHIC_LIMITS.maxTimelineBlocks) issues.push(`${where}: zu viele Abschnitte in der Zeitleiste (${tl.blocks.length}, höchstens ${GRAPHIC_LIMITS.maxTimelineBlocks})`)
  if (tl.unit !== undefined && tl.unit !== null && (!isText(tl.unit) || tl.unit.length > GRAPHIC_LIMITS.maxUnitChars)) issues.push(`${where}: "timeline.unit" muss ein kurzer Text sein (z. B. "Min.")`)
  tl.blocks.forEach((b, k) => {
    const m = `${where}, Abschnitt ${k + 1}`
    if (!b || typeof b !== 'object') return void issues.push(`${m}: kein Objekt`)
    if (!isText(b.label) || !b.label.trim()) issues.push(`${m}: "label" fehlt`)
    else if (b.label.length > GRAPHIC_LIMITS.maxBlockLabelChars) issues.push(`${m}: Name zu lang (höchstens ${GRAPHIC_LIMITS.maxBlockLabelChars} Zeichen)`)
    const v = graphicNumber(b.value)
    if (!(v > 0 && v <= GRAPHIC_LIMITS.maxValue)) issues.push(`${m}: "value" muss eine Zahl größer 0 sein (die Dauer)`)
    if (b.row !== undefined && b.row !== null && (!isText(b.row) || b.row.length > GRAPHIC_LIMITS.maxRowChars)) issues.push(`${m}: "row" muss ein kurzer Text sein (z. B. "Teil 1")`)
    for (const key of ['highlight', 'pause'] as const) {
      if (b[key] !== undefined && b[key] !== null && typeof b[key] !== 'boolean') issues.push(`${m}: "${key}" muss true oder false sein`)
    }
  })
  const rows = groupRows(tl.blocks.filter(b => b && typeof b === 'object') as PptxTimelineBlock[])
  if (rows.length > GRAPHIC_LIMITS.maxTimelineRows) issues.push(`${where}: zu viele Zeilen in der Zeitleiste (${rows.length}, höchstens ${GRAPHIC_LIMITS.maxTimelineRows})`)
  if (rows.some(r => r.blocks.length > GRAPHIC_LIMITS.maxBlocksPerRow)) issues.push(`${where}: höchstens ${GRAPHIC_LIMITS.maxBlocksPerRow} Abschnitte je Zeile — über "row" auf zwei Zeilen verteilen`)
  const lg = tl.legend
  if (lg !== undefined && lg !== null) {
    if (typeof lg !== 'object' || Array.isArray(lg)) issues.push(`${where}: "timeline.legend" muss ein Objekt mit normal und highlight sein`)
    else for (const key of ['normal', 'highlight'] as const) {
      const v = (lg as Record<string, unknown>)[key]
      if (v !== undefined && v !== null && (!isText(v) || v.length > GRAPHIC_LIMITS.maxLegendChars)) issues.push(`${where}: Legende "${key}" muss ein kurzer Text sein`)
    }
  }
  return issues
}

/** Prüft ein Balkendiagramm; liefert verständliche Befunde (leer = in Ordnung). */
export function validateChart(c: unknown, where: string): string[] {
  const issues: string[] = []
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [`${where}: "chart" muss ein Objekt mit "bars" sein`]
  const ch = c as Partial<PptxChart>
  if (!Array.isArray(ch.bars)) return [`${where}: "chart.bars" fehlt — Liste mit label und value je Balken`]
  if (ch.bars.length < GRAPHIC_LIMITS.minBars || ch.bars.length > GRAPHIC_LIMITS.maxBars) issues.push(`${where}: ein Balkendiagramm braucht ${GRAPHIC_LIMITS.minBars} bis ${GRAPHIC_LIMITS.maxBars} Balken (übergeben: ${ch.bars.length})`)
  if (ch.caption !== undefined && ch.caption !== null && (!isText(ch.caption) || ch.caption.length > GRAPHIC_LIMITS.maxCaptionChars)) issues.push(`${where}: "chart.caption" zu lang oder kein Text (höchstens ${GRAPHIC_LIMITS.maxCaptionChars} Zeichen)`)
  if (ch.note !== undefined && ch.note !== null && (!isText(ch.note) || ch.note.length > GRAPHIC_LIMITS.maxChartNoteChars)) issues.push(`${where}: "chart.note" zu lang oder kein Text (höchstens ${GRAPHIC_LIMITS.maxChartNoteChars} Zeichen)`)
  let max = 0
  ch.bars.forEach((b, k) => {
    const m = `${where}, Balken ${k + 1}`
    if (!b || typeof b !== 'object') return void issues.push(`${m}: kein Objekt`)
    if (!isText(b.label) || !b.label.trim()) issues.push(`${m}: "label" fehlt`)
    else if (b.label.length > GRAPHIC_LIMITS.maxBarLabelChars) issues.push(`${m}: Beschriftung zu lang (höchstens ${GRAPHIC_LIMITS.maxBarLabelChars} Zeichen)`)
    const v = graphicNumber(b.value)
    if (!(v >= 0 && v <= GRAPHIC_LIMITS.maxValue)) issues.push(`${m}: "value" muss eine Zahl ab 0 sein`)
    else max = Math.max(max, v)
    if (b.highlight !== undefined && b.highlight !== null && typeof b.highlight !== 'boolean') issues.push(`${m}: "highlight" muss true oder false sein`)
  })
  if (issues.length === 0 && max <= 0) issues.push(`${where}: alle Balken haben den Wert 0 — nichts zu zeigen`)
  return issues
}

/** Erste und letzte Station der Schleife (Index), oder null, wenn es keine gibt. */
export function flowLoopRange(steps: PptxFlowStep[]): { from: number; to: number } | null {
  const idx = steps.map((s, i) => (s && s.loop === true ? i : -1)).filter(i => i >= 0)
  return idx.length ? { from: idx[0], to: idx[idx.length - 1] } : null
}

/** Prüft einen Ablauf; liefert verständliche Befunde (leer = in Ordnung). */
export function validateFlow(f: unknown, where: string): string[] {
  const issues: string[] = []
  if (!f || typeof f !== 'object' || Array.isArray(f)) return [`${where}: "flow" muss ein Objekt mit "steps" sein`]
  const fl = f as Partial<PptxFlow>
  if (!Array.isArray(fl.steps)) return [`${where}: "flow.steps" fehlt — Liste mit label je Station`]
  if (fl.steps.length < GRAPHIC_LIMITS.minFlowSteps || fl.steps.length > GRAPHIC_LIMITS.maxFlowSteps) issues.push(`${where}: ein Ablauf braucht ${GRAPHIC_LIMITS.minFlowSteps} bis ${GRAPHIC_LIMITS.maxFlowSteps} Stationen (übergeben: ${fl.steps.length})`)
  if (fl.loopLabel !== undefined && fl.loopLabel !== null && (!isText(fl.loopLabel) || fl.loopLabel.length > GRAPHIC_LIMITS.maxLoopLabelChars)) issues.push(`${where}: "flow.loopLabel" zu lang oder kein Text (höchstens ${GRAPHIC_LIMITS.maxLoopLabelChars} Zeichen)`)
  fl.steps.forEach((st, k) => {
    const m = `${where}, Station ${k + 1}`
    if (!st || typeof st !== 'object') return void issues.push(`${m}: kein Objekt`)
    if (!isText(st.label) || !st.label.trim()) issues.push(`${m}: "label" fehlt`)
    else if (st.label.length > GRAPHIC_LIMITS.maxFlowLabelChars) issues.push(`${m}: Name zu lang (höchstens ${GRAPHIC_LIMITS.maxFlowLabelChars} Zeichen)`)
    if (st.text !== undefined && st.text !== null && (!isText(st.text) || st.text.length > GRAPHIC_LIMITS.maxFlowTextChars)) issues.push(`${m}: "text" zu lang oder kein Text (höchstens ${GRAPHIC_LIMITS.maxFlowTextChars} Zeichen)`)
    if (st.loop !== undefined && st.loop !== null && typeof st.loop !== 'boolean') issues.push(`${m}: "loop" muss true oder false sein`)
  })
  if (issues.length === 0) {
    const steps = fl.steps as PptxFlowStep[]
    const range = flowLoopRange(steps)
    if (range) {
      const count = steps.filter(st => st.loop === true).length
      if (count < 2) issues.push(`${where}: eine Schleife braucht mindestens zwei Stationen mit loop: true`)
      else if (count !== range.to - range.from + 1) issues.push(`${where}: die Stationen der Schleife müssen nebeneinander stehen (eine Schleife je Ablauf)`)
    } else if ((fl.loopLabel ?? '').trim()) issues.push(`${where}: "flow.loopLabel" ohne Schleife — Stationen der Schleife mit loop: true kennzeichnen`)
  }
  return issues
}

/** Sichtbare Texte von Zeitleiste, Diagramm und Ablauf (für die Link-Prüfung der Webrecherche). */
export function graphicTexts(timeline: PptxTimeline | undefined | null, chart: PptxChart | undefined | null, flow?: PptxFlow | null): string[] {
  const out: (string | undefined)[] = []
  if (flow && Array.isArray(flow.steps)) {
    for (const st of flow.steps) out.push(st?.label, st?.text)
    out.push(flow.loopLabel)
  }
  if (timeline && Array.isArray(timeline.blocks)) {
    for (const b of timeline.blocks) out.push(b?.label, b?.row)
    out.push(timeline.legend?.normal, timeline.legend?.highlight)
  }
  if (chart && Array.isArray(chart.bars)) {
    out.push(chart.caption, chart.note)
    for (const b of chart.bars) out.push(b?.label)
  }
  return out.filter((t): t is string => typeof t === 'string' && t.length > 0)
}

// ── Zeichnen ───────────────────────────────────────────────────────────────

const C = {
  accent: '<a:schemeClr val="accent1"/>',
  dark: '<a:schemeClr val="tx2"/>',
  white: '<a:schemeClr val="bg1"/>',
  ink: '<a:schemeClr val="tx1"/>',
  muted: '<a:schemeClr val="tx1"><a:lumMod val="65000"/><a:lumOff val="35000"/></a:schemeClr>',
  bar: '<a:schemeClr val="bg1"><a:lumMod val="75000"/></a:schemeClr>',
  axis: '<a:schemeClr val="bg1"><a:lumMod val="65000"/></a:schemeClr>',
  // Akzent als SCHRIFT: die Linkfarbe des Farbschemas. Das Hausdesign legt dort den auf Lesbarkeit
  // gerechneten Textton ab (brandDeck: hlink = text), accent1 ist nur der Flächenton (Codex F04).
  accentText: '<a:schemeClr val="hlink"/>',
  // Helle Stufe der Akzentfarbe, bewusst heller als bei hervorgehobenen Karten (8 statt 13 %):
  // auf ihr steht Schrift im Textton. Nachgerechnet für drei Hausfarben (helles Blau, Signalrot,
  // Petrol): bei 13 % nur 4,3 : 1, bei 8 % mindestens 4,6 : 1.
  tint: '<a:schemeClr val="accent1"><a:lumMod val="8000"/><a:lumOff val="92000"/><a:satMod val="55000"/></a:schemeClr>'
}

interface ShapeOpts {
  prst?: 'rect' | 'roundRect' | 'ellipse' | 'rightArrow' | 'triangle'
  radius?: number
  flipV?: boolean
  fill?: string
  line?: string
  dash?: boolean
  text?: string
  sz?: number
  bold?: boolean
  color?: string
  algn?: 'l' | 'ctr' | 'r'
  anchor?: 't' | 'ctr' | 'b'
  wrap?: boolean
  inset?: number
}

/** Kontext eines Zeichenlaufs: fortlaufende Form-IDs, Sprache und die Textaufbereitung des Aufrufers. */
export interface GraphicContext {
  nextId: number
  lang: string
  /** Text säubern UND für XML maskieren. */
  text: (s: string) => string
}

function shapeXml(ctx: GraphicContext, name: string, b: GraphicBox, o: ShapeOpts): string {
  const id = ctx.nextId++
  const av = o.prst === 'roundRect' ? `<a:avLst><a:gd name="adj" fmla="val ${o.radius ?? 8000}"/></a:avLst>` : '<a:avLst/>'
  const fill = o.fill ? `<a:solidFill>${o.fill}</a:solidFill>` : '<a:noFill/>'
  const ln = o.line ? `<a:ln w="12700"><a:solidFill>${o.line}</a:solidFill>${o.dash ? '<a:prstDash val="dash"/>' : ''}</a:ln>` : '<a:ln><a:noFill/></a:ln>'
  const ins = Math.round((o.inset ?? 0.04) * IN)
  const body = `<a:bodyPr wrap="${o.wrap === false ? 'none' : 'square'}" lIns="${ins}" tIns="0" rIns="${ins}" bIns="0" anchor="${o.anchor ?? 'ctr'}"><a:noAutofit/></a:bodyPr>`
  const rPr = `sz="${Math.round((o.sz ?? 11) * 100)}" b="${o.bold ? 1 : 0}" dirty="0"`
  const color = `<a:solidFill>${o.color ?? C.ink}</a:solidFill>`
  const para = o.text
    ? `<a:p><a:pPr algn="${o.algn ?? 'ctr'}"/><a:r><a:rPr lang="${ctx.lang}" ${rPr}>${color}</a:rPr><a:t>${ctx.text(o.text)}</a:t></a:r></a:p>`
    : `<a:p><a:endParaRPr lang="${ctx.lang}" ${rPr}/></a:p>`
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${ctx.text(name)}"/><p:cNvSpPr${o.text && !o.fill && !o.line ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm${o.flipV ? ' flipV="1"' : ''}><a:off x="${Math.round(b.x)}" y="${Math.round(b.y)}"/><a:ext cx="${Math.max(1, Math.round(b.cx))}" cy="${Math.max(1, Math.round(b.cy))}"/></a:xfrm>` +
    `<a:prstGeom prst="${o.prst ?? 'rect'}">${av}</a:prstGeom>${fill}${ln}</p:spPr>` +
    `<p:txBody>${body}<a:lstStyle/>${para}</p:txBody></p:sp>`
  )
}

function groupRows(blocks: PptxTimelineBlock[]): { name: string; blocks: PptxTimelineBlock[] }[] {
  const rows: { name: string; blocks: PptxTimelineBlock[] }[] = []
  for (const b of blocks) {
    const name = typeof b.row === 'string' ? b.row.trim() : ''
    let row = rows.find(r => r.name === name)
    if (!row) rows.push((row = { name, blocks: [] }))
    row.blocks.push(b)
  }
  return rows
}

function formatNumber(v: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(v)
  } catch {
    return String(v)
  }
}

/**
 * Breiten der Blöcke einer Zeile in Zoll: proportional zum Wert, aber nie schmaler als
 * `minW` (sonst passte bei „10 von 180 Minuten“ kein Name hinein). `k` = Zoll je Einheit.
 */
function blockWidths(values: number[], k: number, mins: number[]): number[] {
  return values.map((v, i) => Math.max(mins[i], v * k))
}

/** Größter Maßstab k, bei dem jede Zeile samt Lücken in `width` passt (Halbierungssuche). */
function fitScale(rows: number[][], width: number, gap: number, mins: number[][]): number {
  const used = (k: number): number => Math.max(...rows.map((vals, r) => blockWidths(vals, k, mins[r]).reduce((a, b) => a + b, 0) + gap * (vals.length - 1)))
  let lo = 0
  let hi = width / Math.max(...rows.map(vals => Math.max(...vals)))
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (used(mid) <= width) lo = mid
    else hi = mid
  }
  return lo
}

const TL = { gap: 0.08, minW: 0.95, titleH: 0.34, valueH: 0.34, rowGap: 0.22, legendH: 0.55, minBlockH: 0.4, legendMark: 0.38, legendGap: 0.5, legendMinW: 1.2 }
/**
 * Mindestbreite eines Zeitleisten-Blocks: die Grundbreite, oder so viel, dass sein längstes Wort
 * in der kleinsten Schrift (9 pt) in eine Zeile passt — sonst bräche „Zusammenfassung" in einem
 * 5-Minuten-Block mitten im Wort um.
 */
function timelineMinW(label: string): number {
  // So breit, dass der Name bei 9 pt in höchstens ZWEI Zeilen passt — mehr gibt die kleinste
  // Blockhöhe nicht her. Nur das längste Wort zu prüfen reichte nicht: neun kurze Wörter brauchten
  // drei Zeilen (Codex F14).
  const words = label.trim().split(/\s+/)
  const total = words.join(' ').length
  let perLine = Math.max(...words.map(w => w.length))
  while (perLine < total && wrapLines(words, perLine) > 2) perLine++
  return Math.max(TL.minW, perLine * 9 * 0.0082 + 0.16)
}

/** Zeilenzahl beim Umbruch nach Wörtern mit höchstens `perLine` Zeichen je Zeile. */
function wrapLines(words: string[], perLine: number): number {
  let lines = 1
  let used = 0
  for (const w of words) {
    if (used === 0) used = w.length
    else if (used + 1 + w.length <= perLine) used += 1 + w.length
    else { lines++; used = w.length }
  }
  return lines
}

/** Breite je Legendeneintrag, wenn `count` Einträge sich die Fläche teilen. */
function legendAvail(W: number, count: number): number {
  return (W - count * TL.legendMark - (count - 1) * TL.legendGap) / count
}

const CH = { minBar: 1.0, minSlot: 0.26, valuePt: 11.5 }
const FL = { gap: 0.36, pad: 0.14, minW: 1.0, headH: 0.95, textH: 0.75, minBoxH: 0.6 }

/**
 * Breite der Wertespalte rechts vom Balken: nach der längsten formatierten Zahl. Eine feste Spalte
 * reichte nur bis sechs Zeichen — „1.250.000" ragte schon über die Fläche (Codex F10).
 * Fett gerechnet (hervorgehobene Balken), plus Abstand zum Balken.
 */
function chartValueW(chart: PptxChart, lang: string): number {
  const longest = Math.max(...chart.bars.map(b => formatNumber(graphicNumber(b.value), lang).length))
  return Math.max(0.6, longest * CH.valuePt * 0.0088 + 0.2)
}

function chartLabelW(chart: PptxChart, W: number): number {
  const longest = Math.max(...chart.bars.map(b => b.label.trim().length))
  return Math.min(W * 0.34, Math.max(1.3, longest * 0.085 + 0.15))
}

/**
 * Reicht die Fläche des Layouts für diese Grafik? Die mitgelieferte Vorlage ist groß genug für
 * alles, was die Eingabeprüfung erlaubt; eine fremde Vorlage kann eine kleine Form „Zeitleiste"
 * haben — dann lieber ablehnen, als über den Folienrand zu zeichnen (Codex F03).
 * Liefert den Grund oder null.
 */
export function graphicFitIssue(box: GraphicBox, g: { timeline?: PptxTimeline; chart?: PptxChart; flow?: PptxFlow }, lang = 'de-DE'): string | null {
  const W = box.cx / IN
  const H = box.cy / IN
  const fmt = (v: number): string => v.toFixed(1).replace('.', ',')
  if (g.timeline) {
    const rows = groupRows(g.timeline.blocks)
    const needW = Math.max(...rows.map(r => r.blocks.reduce((a, b) => a + timelineMinW(b.label), 0) + TL.gap * (r.blocks.length - 1)))
    const legend = g.timeline.legend && (g.timeline.legend.normal?.trim() || g.timeline.legend.highlight?.trim())
    // Die Legende steht nebeneinander und zählt zur Breite (Codex F07).
    const entries = [g.timeline.legend?.normal, g.timeline.legend?.highlight].filter(t => (t ?? '').trim()).length
    const legendW = entries * (TL.legendMark + TL.legendMinW) + Math.max(0, entries - 1) * TL.legendGap
    if (legendW > W + 0.01) return `die Legende der Zeitleiste braucht mindestens ${fmt(legendW)} Zoll Breite, die Fläche hat ${fmt(W)} — legend weglassen`
    // Der Kasten eines Eintrags fasst zwei Zeilen bei 12 pt; längere Texte liefen heraus (Codex F13).
    if (entries > 0) {
      const perLine = Math.floor(legendAvail(W, entries) / (12 * 0.0078))
      const tooLong = [g.timeline.legend?.normal, g.timeline.legend?.highlight].map(t => (t ?? '').trim()).filter(Boolean)
        .some(t => perLine < 1 || t.split(/\s+/).some(w => w.length > perLine) || wrapLines(t.split(/\s+/), perLine) > 2)
      if (tooLong) return `die Legende der Zeitleiste ist für die Fläche (${fmt(W)} Zoll) zu lang — kürzer formulieren oder legend weglassen`
    }
    const needH = rows.length * ((rows.some(r => r.name) ? TL.titleH : 0) + TL.valueH + TL.rowGap + TL.minBlockH) + (legend ? TL.legendH : 0)
    if (needW > W + 0.01) return `die Zeitleiste braucht mindestens ${fmt(needW)} Zoll Breite, die Fläche hat ${fmt(W)} — weniger Abschnitte je Zeile`
    if (needH > H + 0.01) return `die Zeitleiste braucht mindestens ${fmt(needH)} Zoll Höhe, die Fläche hat ${fmt(H)} — weniger Zeilen`
  }
  if (g.chart) {
    const needW = chartLabelW(g.chart, W) + 0.1 + chartValueW(g.chart, lang) + CH.minBar
    const needH = g.chart.bars.length * CH.minSlot + ((g.chart.caption ?? '').trim() ? 0.42 : 0) + ((g.chart.note ?? '').trim() ? 0.62 : 0)
    if (needW > W + 0.01) return `das Balkendiagramm braucht mindestens ${fmt(needW)} Zoll Breite, die Fläche hat ${fmt(W)}`
    if (needH > H + 0.01) return `das Balkendiagramm braucht mindestens ${fmt(needH)} Zoll Höhe, die Fläche hat ${fmt(H)} — weniger Balken`
  }
  if (g.flow) {
    const n = g.flow.steps.length
    const loop = !!flowLoopRange(g.flow.steps)
    const needW = n * FL.minW + FL.gap * (n - 1) + (loop ? 2 * FL.pad : 0)
    const needH = (loop ? FL.headH : 0) + FL.minBoxH + (g.flow.steps.some(st => (st.text ?? '').trim()) ? FL.textH : 0) + 0.3
    if (needW > W + 0.01) return `der Ablauf braucht mindestens ${fmt(needW)} Zoll Breite, die Fläche hat ${fmt(W)} — weniger Stationen`
    if (needH > H + 0.01) return `der Ablauf braucht mindestens ${fmt(needH)} Zoll Höhe, die Fläche hat ${fmt(H)}`
  }
  return null
}

/**
 * Größte Schrift, mit der ein Name in seinen Kasten passt — nach WÖRTERN gerechnet: jedes Wort
 * muss in eine Zeile passen, und alle Wörter in die Zeilen, die die Höhe hergibt. Die erste
 * Fassung rechnete nur Zeichen gegen Breite; im echten Lauf brach PowerPoint dann mitten im Wort
 * um („Werkzeu-g", „Abschlus-s", 12.11.2026). Passt nichts, gilt die kleinste Größe.
 * Zeichenbreite geschätzt: 0,0082 Zoll je Punkt und Zeichen (fette Arial, Mittelwert).
 */
export function fitLabelPt(label: string, widthIn: number, heightIn: number, sizes: number[]): number {
  const words = label.trim().split(/\s+/)
  for (const pt of sizes) {
    const cw = pt * 0.0082
    const perLine = Math.floor(widthIn / cw)
    if (perLine < 1 || words.some(w => w.length > perLine)) continue
    if (wrapLines(words, perLine) * pt * 1.2 / 72 <= heightIn) return pt
  }
  return sizes[sizes.length - 1]
}

/** Zeitleiste als Formen in `box` (EMU). Eingabe muss `validateTimeline` bestanden haben. */
export function timelineShapesXml(ctx: GraphicContext, box: GraphicBox, timeline: PptxTimeline): string {
  const unit = (timeline.unit ?? 'Min.').trim()
  const rows = groupRows(timeline.blocks)
  const W = box.cx / IN
  const H = box.cy / IN
  const gap = TL.gap
  const mins = rows.map(r => r.blocks.map(b => timelineMinW(b.label)))
  const values = rows.map(r => r.blocks.map(b => graphicNumber(b.value)))
  const k = fitScale(values, W, gap, mins)
  const legend = timeline.legend && (timeline.legend.normal?.trim() || timeline.legend.highlight?.trim()) ? timeline.legend : null
  const legendH = legend ? TL.legendH : 0
  const named = rows.some(r => r.name)
  const titleH = named ? TL.titleH : 0
  const { valueH, rowGap } = TL
  // Blockhöhe: so groß wie Platz ist, aber im Rahmen 0,4″–0,95″.
  const blockH = Math.min(0.95, Math.max(TL.minBlockH, (H - legendH - rows.length * (titleH + valueH + rowGap)) / rows.length))
  let out = ''
  let y = box.y / IN
  rows.forEach((row, ri) => {
    const vals = values[ri]
    if (named) {
      const sum = vals.reduce((a, b) => a + b, 0)
      const title = [row.name, `${formatNumber(sum, ctx.lang)} ${unit}`.trim()].filter(Boolean).join(' · ')
      out += shapeXml(ctx, `Zeitleiste Zeile ${ri + 1}`, { x: box.x, y: y * IN, cx: box.cx, cy: (titleH - 0.06) * IN }, { text: title, sz: 12, bold: true, color: C.muted, algn: 'l', inset: 0 })
      y += titleH
    }
    let x = box.x / IN
    blockWidths(vals, k, mins[ri]).forEach((w, bi) => {
      const b = row.blocks[bi]
      const label = b.label.trim()
      const sz = fitLabelPt(label, w - 0.14, blockH - 0.08, [14, 12.5, 11, 10, 9])
      const bb = { x: x * IN, y: y * IN, cx: w * IN, cy: blockH * IN }
      out += b.pause
        ? shapeXml(ctx, `Zeitleiste ${label}`, bb, { prst: 'roundRect', line: C.muted, dash: true, text: label, sz, bold: true, color: C.muted })
        : shapeXml(ctx, `Zeitleiste ${label}`, bb, { prst: 'roundRect', fill: b.highlight ? C.accent : C.dark, text: label, sz, bold: true, color: C.white })
      out += shapeXml(ctx, `Zeitleiste Dauer ${ri + 1}.${bi + 1}`, { x: x * IN, y: (y + blockH + 0.05) * IN, cx: w * IN, cy: (valueH - 0.08) * IN }, { text: `${formatNumber(vals[bi], ctx.lang)} ${unit}`.trim(), sz: 11, color: C.muted, wrap: false })
      x += w + gap
    })
    y += blockH + valueH + rowGap
  })
  if (legend) {
    // Beide Einträge teilen sich die Breite der Fläche; lange Texte brechen in ihrem Kasten um,
    // statt über den Rand zu laufen (Codex F07).
    const texts = [legend.normal, legend.highlight].map(t => (t ?? '').trim())
    const count = texts.filter(Boolean).length
    const avail = legendAvail(W, count)
    let x = box.x / IN
    const ly = y + 0.1
    const entry = (t: string, fill: string, name: string): void => {
      if (!t) return
      out += shapeXml(ctx, `Legende ${name} Farbe`, { x: x * IN, y: (ly + 0.08) * IN, cx: 0.26 * IN, cy: 0.26 * IN }, { prst: 'roundRect', radius: 16000, fill })
      const w = Math.min(avail, Math.max(TL.legendMinW, t.length * 0.105 + 0.2))
      out += shapeXml(ctx, `Legende ${name}`, { x: (x + TL.legendMark) * IN, y: ly * IN, cx: w * IN, cy: 0.42 * IN }, { text: t, sz: 12, color: C.muted, algn: 'l', inset: 0 })
      x += TL.legendMark + w + TL.legendGap
    }
    entry(texts[0], C.dark, 'normal')
    entry(texts[1], C.accent, 'hervorgehoben')
  }
  return out
}

/** Waagerechtes Balkendiagramm als Formen in `box` (EMU). Eingabe muss `validateChart` bestanden haben. */
export function chartShapesXml(ctx: GraphicContext, box: GraphicBox, chart: PptxChart): string {
  const W = box.cx / IN
  const H = box.cy / IN
  const X = box.x / IN
  const Y = box.y / IN
  const caption = (chart.caption ?? '').trim()
  const note = (chart.note ?? '').trim()
  const capH = caption ? 0.42 : 0
  const noteH = note ? (note.length > W * 11 ? 0.62 : 0.4) : 0
  const labelW = chartLabelW(chart, W)
  const valueW = chartValueW(chart, ctx.lang)
  const barX = X + labelW + 0.1
  const barMax = W - labelW - 0.1 - valueW
  const areaY = Y + capH
  const areaH = H - capH - noteH
  const n = chart.bars.length
  const slot = areaH / n
  const barH = Math.min(0.52, slot * 0.64)
  const values = chart.bars.map(b => graphicNumber(b.value))
  const max = Math.max(...values)
  let out = ''
  if (caption) out += shapeXml(ctx, 'Diagramm Beschriftung', { x: barX * IN, y: Y * IN, cx: (W - labelW - 0.1) * IN, cy: (capH - 0.08) * IN }, { text: caption, sz: 12, color: C.muted, algn: 'l', inset: 0 })
  out += shapeXml(ctx, 'Diagramm Achse', { x: barX * IN - 6350, y: areaY * IN, cx: 12700, cy: areaH * IN }, { fill: C.axis })
  chart.bars.forEach((b, i) => {
    const y = areaY + i * slot + (slot - barH) / 2
    const w = Math.max(0.03, (values[i] / max) * barMax)
    const label = b.label.trim()
    out += shapeXml(ctx, `Diagramm ${label}`, { x: X * IN, y: (areaY + i * slot) * IN, cx: labelW * IN, cy: slot * IN }, { text: label, sz: 11.5, color: C.ink, algn: 'r', inset: 0 })
    out += shapeXml(ctx, `Diagramm Balken ${i + 1}`, { x: barX * IN, y: y * IN, cx: w * IN, cy: barH * IN }, { fill: b.highlight ? C.accent : C.bar })
    const shown = formatNumber(values[i], ctx.lang)
    out += shapeXml(ctx, `Diagramm Wert ${i + 1}`, { x: (barX + w + 0.08) * IN, y: y * IN, cx: (valueW - 0.08) * IN, cy: barH * IN }, { text: shown, sz: CH.valuePt, bold: !!b.highlight, color: C.ink, algn: 'l', inset: 0, wrap: false })
  })
  if (note) out += shapeXml(ctx, 'Diagramm Hinweis', { x: X * IN, y: (Y + H - noteH + 0.08) * IN, cx: W * IN, cy: (noteH - 0.08) * IN }, { text: note, sz: 10, color: C.muted, algn: 'l', anchor: 't', inset: 0 })
  return out
}

/**
 * Ablauf als Formen in `box` (EMU): Stationen nebeneinander mit Pfeilen; Stationen mit
 * `loop` liegen auf einer getönten Fläche, darüber führt ein Rückpfeil von der letzten zur
 * ersten Station der Schleife. Eingabe muss `validateFlow` bestanden haben.
 */
export function flowShapesXml(ctx: GraphicContext, box: GraphicBox, flow: PptxFlow): string {
  const steps = flow.steps
  const n = steps.length
  const W = box.cx / IN
  const H = box.cy / IN
  const X = box.x / IN
  const Y = box.y / IN
  const range = flowLoopRange(steps)
  const gap = FL.gap
  const pad = range ? FL.pad : 0 // die getönte Fläche ragt links und rechts über die Stationen hinaus
  const w = (W - 2 * pad - gap * (n - 1)) / n
  const xOf = (i: number): number => X + pad + i * (w + gap)
  const headH = range ? FL.headH : 0 // Platz für Beschriftung und Rückpfeil über den Stationen
  const hasText = steps.some(st => (st.text ?? '').trim())
  const textH = hasText ? FL.textH : 0
  const boxH = Math.min(1.05, Math.max(FL.minBoxH, H - headH - textH - 0.3))
  const boxY = Y + headH
  let out = ''
  if (range) {
    const rx = xOf(range.from) - pad
    const rw = xOf(range.to) + w + pad - rx
    out += shapeXml(ctx, 'Ablauf Schleife', { x: rx * IN, y: Y * IN, cx: rw * IN, cy: (headH + boxH + 0.16) * IN }, { prst: 'roundRect', radius: 5000, fill: C.tint })
    const label = (flow.loopLabel ?? '').trim()
    if (label) out += shapeXml(ctx, 'Ablauf Schleife Beschriftung', { x: rx * IN, y: (Y + 0.1) * IN, cx: rw * IN, cy: 0.3 * IN }, { text: label, sz: 11, bold: true, color: C.accentText })
    // Rückpfeil: von der Mitte der letzten Schleifenstation hinauf, nach links, hinab zur ersten.
    const t = 19050 // Strichstärke 1,5 pt
    const ax = (xOf(range.from) + w / 2) * IN
    const bx = (xOf(range.to) + w / 2) * IN
    const lineY = (Y + 0.56) * IN
    const top = boxY * IN - 0.04 * IN
    out += shapeXml(ctx, 'Ablauf Rückpfeil oben', { x: ax - t / 2, y: lineY - t / 2, cx: bx - ax + t, cy: t }, { fill: C.accent })
    out += shapeXml(ctx, 'Ablauf Rückpfeil rechts', { x: bx - t / 2, y: lineY, cx: t, cy: top - lineY }, { fill: C.accent })
    out += shapeXml(ctx, 'Ablauf Rückpfeil links', { x: ax - t / 2, y: lineY, cx: t, cy: top - lineY - 0.1 * IN }, { fill: C.accent })
    out += shapeXml(ctx, 'Ablauf Rückpfeil Spitze', { x: ax - 0.08 * IN, y: top - 0.13 * IN, cx: 0.16 * IN, cy: 0.13 * IN }, { prst: 'triangle', flipV: true, fill: C.accent })
  }
  steps.forEach((st, i) => {
    const label = st.label.trim()
    const inLoop = st.loop === true
    // Links oben sitzt die Ziffer: der Name bekommt die Breite daneben und die volle Höhe.
    const sz = fitLabelPt(label, w - 0.3, boxH - 0.1, [13, 12, 11, 10, 9, 8])
    const x = xOf(i)
    out += shapeXml(ctx, `Ablauf ${label}`, { x: x * IN, y: boxY * IN, cx: w * IN, cy: boxH * IN }, { prst: 'roundRect', radius: 7000, fill: inLoop ? C.accent : C.dark, text: label, sz, bold: true, color: C.white, inset: 0.14 })
    out += shapeXml(ctx, `Ablauf Ziffer ${i + 1}`, { x: (x + 0.08) * IN, y: (boxY + 0.08) * IN, cx: 0.26 * IN, cy: 0.26 * IN }, { prst: 'ellipse', fill: C.white, text: String(i + 1), sz: 9, bold: true, color: C.ink, inset: 0, wrap: false })
    if (i < n - 1) out += shapeXml(ctx, `Ablauf Pfeil ${i + 1}`, { x: (x + w + 0.08) * IN, y: (boxY + boxH / 2 - 0.1) * IN, cx: (gap - 0.16) * IN, cy: 0.2 * IN }, { prst: 'rightArrow', fill: C.axis })
    const text = (st.text ?? '').trim()
    if (text) out += shapeXml(ctx, `Ablauf Text ${i + 1}`, { x: (x - 0.1) * IN, y: (boxY + boxH + 0.26) * IN, cx: (w + 0.2) * IN, cy: (textH - 0.1) * IN }, { text, sz: 10.5, color: C.muted, anchor: 't', inset: 0 })
  })
  return out
}
