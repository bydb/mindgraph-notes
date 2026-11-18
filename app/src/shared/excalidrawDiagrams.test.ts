import { describe, expect, it } from 'vitest'
import { buildExcalidrawConceptMap, buildExcalidrawMatrix, CONCEPT_LIMITS, type ConceptMapInput, type MatrixInput } from './excalidrawDiagrams'
import { MindmapInputError } from './excalidrawMindmap'
import { NOTE_KINDS } from './noteKind'

const NOW = 1_760_000_000_000
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any

function issuesOf(fn: () => unknown): string[] {
  try { fn() } catch (e) { if (e instanceof MindmapInputError) return e.issues; throw e }
  return []
}

/** Verweise in beide Richtungen: Text ↔ Container, Pfeil ↔ Kasten; IDs eindeutig. */
function checkRefs(elements: El[]): void {
  const byId = new Map(elements.map(e => [e.id, e]))
  expect(byId.size).toBe(elements.length)
  for (const el of elements) {
    if (el.type === 'text' && el.containerId) {
      const c = byId.get(el.containerId)
      expect(c, `Container von ${el.id}`).toBeTruthy()
      expect(c.boundElements.some((b: El) => b.type === 'text' && b.id === el.id)).toBe(true)
    }
    if (el.type === 'arrow') {
      for (const b of [el.startBinding, el.endBinding].filter(Boolean)) {
        const target = byId.get(b.elementId)
        expect(target.boundElements.some((x: El) => x.type === 'arrow' && x.id === el.id)).toBe(true)
      }
      expect(el.points[0]).toEqual([0, 0])
    }
    for (const b of el.boundElements ?? []) expect(byId.has(b.id), `${el.id} → ${b.id}`).toBe(true)
  }
}

const overlaps = (a: El, b: El, pad = 0): boolean =>
  a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad

// ── Matrix ───────────────────────────────────────────────────────────────────────────────────

const SWOT: MatrixInput = {
  title: 'SWOT Digitalisierung',
  quadrants: [
    { title: 'Stärken', kind: 'solution', items: ['Engagiertes Kollegium', 'Gute Ausstattung'] },
    { title: 'Schwächen', kind: 'problem', items: ['Wenig Fortbildungszeit'] },
    { title: 'Chancen', items: [{ text: 'Förderprogramm des Landes' }] },
    { title: 'Risiken', items: [] }
  ]
}

const EISENHOWER: MatrixInput = {
  quadrants: [
    { title: 'Planen', items: ['Fortbildung vorbereiten'] },
    { title: 'Sofort erledigen', items: ['Antrag bis Freitag'] },
    { title: 'Weglassen', items: [] },
    { title: 'Abgeben', items: ['Raumbuchung'] }
  ],
  x_axis: { label: 'Dringlichkeit', low: 'nicht dringend', high: 'dringend' },
  y_axis: { label: 'Wichtigkeit', low: 'unwichtig', high: 'wichtig' }
}

function matrixScene(input: MatrixInput): El[] {
  return JSON.parse(buildExcalidrawMatrix(input, { now: NOW }).json).elements
}

describe('Vier-Felder-Matrix', () => {
  it('vier gleich große, gesperrte Felder; Karten frei, innerhalb ihres Felds, ohne Überlappung', () => {
    const els = matrixScene(SWOT)
    checkRefs(els)
    const quads = els.filter(e => e.type === 'rectangle' && e.locked)
    expect(quads).toHaveLength(4)
    expect(new Set(quads.map(q => `${q.width}x${q.height}`)).size).toBe(1)
    const cards = els.filter(e => e.type === 'rectangle' && !e.locked)
    expect(cards).toHaveLength(4)
    for (const c of cards) {
      expect(quads.filter(q => c.x >= q.x && c.y >= q.y && c.x + c.width <= q.x + q.width && c.y + c.height <= q.y + q.height)).toHaveLength(1)
      const t = els.find(e => e.containerId === c.id)
      expect(t.width).toBeLessThanOrEqual(c.width)
    }
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) expect(overlaps(cards[i], cards[j])).toBe(false)
    for (let i = 0; i < quads.length; i++) for (let j = i + 1; j < quads.length; j++) expect(overlaps(quads[i], quads[j])).toBe(false)
  })

  it('Feldtitel sind freier Text (bearbeitbar), Farben nach Kategorie', () => {
    const els = matrixScene(SWOT)
    const titles = els.filter(e => e.type === 'text' && !e.containerId)
    expect(titles.map(t => t.text)).toEqual(expect.arrayContaining(['Stärken', 'Schwächen', 'Chancen', 'Risiken', 'SWOT Digitalisierung']))
    const quads = els.filter(e => e.type === 'rectangle' && e.locked)
    expect(quads[0].backgroundColor).toBe(NOTE_KINDS.solution.canvasColor)
    expect(quads[1].backgroundColor).toBe(NOTE_KINDS.problem.canvasColor)
  })

  it('Achsen: gesperrte Pfeile, y-Beschriftung gedreht, nichts überlappt das Gitter', () => {
    const els = matrixScene(EISENHOWER)
    checkRefs(els)
    const axes = els.filter(e => e.type === 'arrow')
    expect(axes).toHaveLength(2)
    expect(axes.every(a => a.locked && a.endArrowhead === 'arrow')).toBe(true)
    const rotated = els.filter(e => e.type === 'text' && e.angle !== 0)
    expect(rotated.map(t => t.text)).toEqual(['Wichtigkeit'])
    expect(rotated[0].angle).toBeCloseTo((3 * Math.PI) / 2)
    const quads = els.filter(e => e.type === 'rectangle' && e.locked)
    const grid = { x: Math.min(...quads.map(q => q.x)), y: Math.min(...quads.map(q => q.y)), width: 0, height: 0 }
    grid.width = Math.max(...quads.map(q => q.x + q.width)) - grid.x
    grid.height = Math.max(...quads.map(q => q.y + q.height)) - grid.y
    for (const t of els.filter(e => e.type === 'text' && !e.containerId && ['Dringlichkeit', 'nicht dringend', 'dringend', 'unwichtig', 'wichtig'].includes(e.text))) {
      expect(overlaps(t, grid), t.text).toBe(false)
    }
  })

  it('Szene beginnt im sichtbaren Bereich, auch mit gedrehtem Text', () => {
    const els = matrixScene(EISENHOWER)
    const rot = els.find(e => e.angle !== 0)
    const visLeft = rot.x + rot.width / 2 - rot.height / 2
    expect(Math.min(visLeft, ...els.filter(e => e !== rot).map(e => e.x))).toBeCloseTo(40, 0)
    expect(Math.min(...els.map(e => e.y))).toBeGreaterThanOrEqual(110 - 0.01)
  })

  it('Determinismus', () => {
    expect(buildExcalidrawMatrix(EISENHOWER, { now: NOW }).json).toBe(buildExcalidrawMatrix(EISENHOWER, { now: NOW }).json)
  })

  it('Ablehnungen: Feldzahl, zu viele Einträge, Zeichen, Doppelte, Achse ohne Beschriftung', () => {
    expect(issuesOf(() => buildExcalidrawMatrix({ quadrants: SWOT.quadrants.slice(0, 3) }, { now: NOW })).join()).toMatch(/genau 4/)
    const many = { ...SWOT, quadrants: [{ title: 'A', items: Array.from({ length: 7 }, (_, i) => `Punkt ${i}`) }, ...SWOT.quadrants.slice(1)] }
    expect(issuesOf(() => buildExcalidrawMatrix(many, { now: NOW })).join()).toMatch(/7 Einträge — höchstens 6/)
    const emoji = { ...SWOT, quadrants: [{ title: 'Stärken 🚀', items: [] }, ...SWOT.quadrants.slice(1)] }
    expect(issuesOf(() => buildExcalidrawMatrix(emoji, { now: NOW })).join()).toMatch(/nicht verfügbar/)
    const dup = { ...SWOT, quadrants: [{ title: 'A', items: ['x', 'X'] }, ...SWOT.quadrants.slice(1)] }
    expect(issuesOf(() => buildExcalidrawMatrix(dup, { now: NOW })).join()).toMatch(/doppelt/)
    expect(issuesOf(() => buildExcalidrawMatrix({ ...SWOT, x_axis: { low: 'wenig', high: 'viel' } }, { now: NOW })).join()).toMatch(/Beschriftung fehlt/)
  })
})

// ── Begriffsnetz ─────────────────────────────────────────────────────────────────────────────

const PHOTO: ConceptMapInput = {
  title: 'Wie ernähren sich Pflanzen?',
  concepts: [
    { text: 'Photosynthese' }, { text: 'Licht' }, { text: 'Wasser' }, { text: 'Kohlendioxid' },
    { text: 'Traubenzucker' }, { text: 'Sauerstoff' }, { text: 'Chloroplasten', kind: 'info' }, { text: 'Wachstum' }
  ],
  relations: [
    { from: 'Photosynthese', to: 'Licht', label: 'braucht' },
    { from: 'Photosynthese', to: 'Wasser', label: 'braucht' },
    { from: 'Photosynthese', to: 'Kohlendioxid', label: 'braucht' },
    { from: 'Photosynthese', to: 'Traubenzucker', label: 'erzeugt' },
    { from: 'Photosynthese', to: 'Sauerstoff', label: 'setzt frei' },
    { from: 'Chloroplasten', to: 'Photosynthese', label: 'sind Ort der' },
    { from: 'Traubenzucker', to: 'Wachstum', label: 'ermöglicht' },
    { from: 'Photosynthese', to: 'Wachstum', label: 'liefert Energie für' }
  ]
}

/** Mit Zyklus (A → B → C → A) und einer Kante über zwei Ebenen. */
const CYCLE: ConceptMapInput = {
  concepts: [{ text: 'Lernen' }, { text: 'Erfolg' }, { text: 'Motivation' }, { text: 'Übung' }],
  relations: [
    { from: 'Lernen', to: 'Erfolg', label: 'führt zu' },
    { from: 'Erfolg', to: 'Motivation', label: 'stärkt' },
    { from: 'Motivation', to: 'Lernen', label: 'fördert' },
    { from: 'Lernen', to: 'Übung', label: 'braucht' },
    { from: 'Übung', to: 'Motivation', label: 'kostet' }
  ]
}

function conceptScene(input: ConceptMapInput): El[] {
  return JSON.parse(buildExcalidrawConceptMap(input, { now: NOW }).json).elements
}

/** Excalidraws Lage der Pfeilbeschriftung (getBoundTextElementPosition, Pfeil ohne Rundung). */
function excalidrawLabelCenter(arrow: El): { x: number; y: number } {
  const p = arrow.points
  if (p.length % 2 === 1) {
    const m = p[Math.floor(p.length / 2)]
    return { x: arrow.x + m[0], y: arrow.y + m[1] }
  }
  const a = p[p.length / 2 - 1]
  const b = p[p.length / 2]
  return { x: arrow.x + (a[0] + b[0]) / 2, y: arrow.y + (a[1] + b[1]) / 2 }
}

describe('Begriffsnetz', () => {
  for (const [name, input] of [['Baum', PHOTO], ['Zyklus', CYCLE]] as const) {
    it(`${name}: Verweise, Bindung an beide Begriffe, Pfeilrichtung`, () => {
      const els = conceptScene(input)
      checkRefs(els)
      const arrows = els.filter(e => e.type === 'arrow')
      expect(arrows).toHaveLength(input.relations.length)
      const textOf = (rectId: string) => els.find(e => e.containerId === rectId).text.replace(/\n/g, ' ')
      const drawn = arrows.map(a => `${textOf(a.startBinding.elementId)}>${textOf(a.endBinding.elementId)}`).sort()
      expect(drawn).toEqual(input.relations.map(r => `${r.from}>${r.to}`).sort())
      expect(arrows.every(a => a.roundness === null && a.endArrowhead === 'arrow' && a.startArrowhead === null)).toBe(true)
    })

    it(`${name}: Beschriftung liegt dort, wo Excalidraw sie hinsetzt (springt nicht beim Verschieben)`, () => {
      const els = conceptScene(input)
      for (const a of els.filter(e => e.type === 'arrow')) {
        const label = els.find(e => e.containerId === a.id)
        const c = excalidrawLabelCenter(a)
        expect(label.x + label.width / 2).toBeCloseTo(c.x, 1)
        expect(label.y + label.height / 2).toBeCloseTo(c.y, 1)
      }
    })

    it(`${name}: Begriffe überlappen nicht, Beschriftungen liegen nicht auf Begriffen`, () => {
      const els = conceptScene(input)
      const rects = els.filter(e => e.type === 'rectangle')
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j], 10)).toBe(false)
      const arrowIds = new Set(els.filter(e => e.type === 'arrow').map(e => e.id))
      const labels = els.filter(e => e.type === 'text' && arrowIds.has(e.containerId))
      for (const l of labels) for (const r of rects) expect(overlaps(l, r), `${l.text} auf Begriff`).toBe(false)
    })
  }

  it('Baum: Beschriftungen überlappen einander nicht', () => {
    const els = conceptScene(PHOTO)
    const arrowIds = new Set(els.filter(e => e.type === 'arrow').map(e => e.id))
    const labels = els.filter(e => e.type === 'text' && arrowIds.has(e.containerId))
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      expect(overlaps(labels[i], labels[j]), `${labels[i].text} / ${labels[j].text}`).toBe(false)
    }
  })

  it('Hauptbegriff (erster) gefüllt, Kategorie-Farbe, Ursprung im sichtbaren Bereich', () => {
    const els = conceptScene(PHOTO)
    const rects = els.filter(e => e.type === 'rectangle')
    const main = rects.find(r => els.find(e => e.containerId === r.id).text === 'Photosynthese')
    expect(main.customData).toEqual({ mindgraph: { generator: 'begriffsnetz', version: 1 } })
    const chl = rects.find(r => els.find(e => e.containerId === r.id).text === 'Chloroplasten')
    expect(chl.backgroundColor).toBe(NOTE_KINDS.info.canvasColor)
    expect(Math.min(...els.map(e => e.x))).toBeGreaterThanOrEqual(40 - 0.01)
    expect(Math.min(...els.map(e => e.y))).toBeGreaterThanOrEqual(110 - 0.01)
  })

  it('Determinismus', () => {
    expect(buildExcalidrawConceptMap(CYCLE, { now: NOW }).json).toBe(buildExcalidrawConceptMap(CYCLE, { now: NOW }).json)
  })

  it('Ablehnungen: unbekannter Begriff, Selbstbezug, doppelte Beziehung, Begriff ohne Pfeil, Beschriftung zu lang, Grenzen', () => {
    const base = { concepts: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] }
    expect(issuesOf(() => buildExcalidrawConceptMap({ ...base, relations: [{ from: 'A', to: 'X', label: 'r' }, { from: 'B', to: 'C', label: 'r' }] }, { now: NOW })).join()).toMatch(/„X" ist kein Begriff/)
    expect(issuesOf(() => buildExcalidrawConceptMap({ ...base, relations: [{ from: 'A', to: 'A', label: 'r' }, { from: 'B', to: 'C', label: 'r' }] }, { now: NOW })).join()).toMatch(/auf sich selbst/)
    expect(issuesOf(() => buildExcalidrawConceptMap({ ...base, relations: [{ from: 'A', to: 'B', label: 'r' }, { from: 'A', to: 'B', label: 's' }, { from: 'B', to: 'C', label: 'r' }] }, { now: NOW })).join()).toMatch(/doppelt/)
    expect(issuesOf(() => buildExcalidrawConceptMap({ ...base, relations: [{ from: 'A', to: 'B', label: 'r' }, { from: 'B', to: 'A', label: 's' }] }, { now: NOW })).join()).toMatch(/„C" hat keine Beziehung/)
    expect(issuesOf(() => buildExcalidrawConceptMap({ ...base, relations: [{ from: 'A', to: 'B', label: 'eine viel zu lange Beschriftung am Pfeil' }, { from: 'B', to: 'C', label: 'r' }] }, { now: NOW })).join()).toMatch(/höchstens 30/)
    const many = { concepts: Array.from({ length: CONCEPT_LIMITS.maxConcepts + 1 }, (_, i) => ({ text: `B${i}` })), relations: [] }
    expect(issuesOf(() => buildExcalidrawConceptMap(many, { now: NOW })).join()).toMatch(/höchstens 15/)
  })

  it('Groß- und Kleinschreibung in from/to ist egal', () => {
    expect(() => buildExcalidrawConceptMap({ concepts: [{ text: 'Licht' }, { text: 'Pflanze' }, { text: 'Wachstum' }], relations: [{ from: 'licht', to: 'PFLANZE', label: 'nährt' }, { from: 'Pflanze', to: 'wachstum', label: 'zeigt' }] }, { now: NOW })).not.toThrow()
  })
})
