import { describe, expect, it } from 'vitest'
import {
  buildExcalidrawMindmap,
  estimateLineWidth,
  MindmapInputError,
  MINDMAP_LIMITS,
  linkCompareKey,
  parseWikilinkTarget,
  resolveWikilinkInPaths,
  type MindmapInput,
  type MindmapStyle
} from './excalidrawMindmap'
import { EXCALIDRAW_LINE_SAMPLES } from './excalidrawFontMetrics.generated'
import { NOTE_KINDS } from './noteKind'
import { straightenQuotes } from '../renderer/utils/linkExtractor'

const NOW = 1_760_000_000_000

type El = Record<string, any>

function scene(input: MindmapInput, resolveLink?: (t: string) => { path: string } | { error: string }): { elements: El[]; appState: El } {
  return JSON.parse(buildExcalidrawMindmap(input, { now: NOW, resolveLink }).json)
}

/** Nachschlagen per ID; fehlt ein Element, schlägt der Test mit Namen der ID fehl. */
function indexById(elements: El[]): { size: number; get(id: string): El } {
  const map = new Map<string, El>(elements.map(e => [e.id, e]))
  return {
    size: map.size,
    get(id: string): El {
      const el = map.get(id)
      if (!el) throw new Error(`Element ${id} fehlt`)
      return el
    }
  }
}

function issuesOf(fn: () => unknown): string[] {
  try {
    fn()
  } catch (e) {
    if (e instanceof MindmapInputError) return e.issues
    throw e
  }
  throw new Error('keine Ablehnung')
}

const sample: MindmapInput = {
  title: 'Fortbildung Digitale Werkzeuge',
  branches: [
    { text: 'Ziele', children: [{ text: 'Unterricht entlasten' }, { text: 'Datenschutz verstehen' }] },
    { text: 'Werkzeuge', kind: 'solution', children: [{ text: 'Edumaps' }, { text: 'Excalidraw' }, { text: 'MindGraph Notes' }] },
    { text: 'Probleme', kind: 'problem', children: [{ text: 'Lizenzverlängerungsverfahren' }] },
    { text: 'Termine', kind: 'info' },
    { text: 'Rückmeldungen der Teilnehmenden', children: [{ text: 'Größere Räume', kind: 'problem' }] }
  ]
}

describe('Textmaße gegen echte Messung (F06)', () => {
  for (const s of EXCALIDRAW_LINE_SAMPLES) {
    const style: MindmapStyle = s.family === 'Nunito' ? 'klar' : 'skizze'
    it(`${s.family} ${s.px}px „${s.line}"`, () => {
      const est = estimateLineWidth(s.line, style, s.px)
      expect(est).toBeGreaterThanOrEqual(s.width)
      expect(est).toBeLessThanOrEqual(s.width * 1.08 + 2)
    })
  }
})

describe('buildExcalidrawMindmap — Struktur', () => {
  for (const style of ['klar', 'skizze'] as const) {
    it(`gegenseitige Verweise stimmen (${style})`, () => {
      const { elements } = scene({ ...sample, style })
      const byId = indexById(elements)
      expect(byId.size).toBe(elements.length)
      for (const el of elements) {
        expect(el.index).toBeNull()
        expect(el.isDeleted).toBe(false)
        if (el.type === 'text') {
          const container = byId.get(el.containerId)
          expect(container?.type).toBe('rectangle')
          expect(container.boundElements).toContainEqual({ type: 'text', id: el.id })
          expect(el.fontFamily).toBe(style === 'klar' ? 6 : 5)
        }
        if (el.type === 'arrow') {
          expect(el.elbowed).toBe(false)
          expect(el.startArrowhead).toBeNull()
          expect(el.endArrowhead).toBeNull()
          for (const b of [el.startBinding, el.endBinding]) {
            const target = byId.get(b.elementId)
            expect(target?.type).toBe('rectangle')
            expect(target.boundElements).toContainEqual({ type: 'arrow', id: el.id })
            expect(b.fixedPoint).toBeUndefined()
          }
        }
        if (el.type === 'rectangle') {
          for (const ref of el.boundElements) {
            const other = byId.get(ref.id)
            expect(other?.type).toBe(ref.type)
            if (ref.type === 'text') expect(other.containerId).toBe(el.id)
            else expect([other.startBinding.elementId, other.endBinding.elementId]).toContain(el.id)
          }
        }
      }
    })
  }

  it('Szene beginnt oben links im sichtbaren Bereich (Excalidraw öffnet bei 0,0)', () => {
    const { elements } = scene(sample)
    const rects = elements.filter(e => e.type === 'rectangle')
    expect(Math.min(...rects.map(r => r.x))).toBeCloseTo(40, 1)
    expect(Math.min(...rects.map(r => r.y))).toBeCloseTo(110, 1)
  })

  it('Linien liegen in der Zeichenreihenfolge unter den Knoten', () => {
    const { elements } = scene(sample)
    const lastArrow = elements.map(e => e.type).lastIndexOf('arrow')
    const firstRect = elements.findIndex(e => e.type === 'rectangle')
    expect(lastArrow).toBeLessThan(firstRect)
  })

  it('Knoten überlappen nicht, Text passt in seinen Kasten', () => {
    const big: MindmapInput = {
      title: 'Sehr lange Mitte mit mehreren Wörtern zum Umbrechen',
      branches: Array.from({ length: 8 }, (_, i) => ({
        text: `Ast ${i + 1} mit etwas längerem Text`,
        children: Array.from({ length: i < 4 ? 4 : 3 }, (_, j) => ({ text: `Blatt ${i + 1}.${j + 1} Größenordnung` }))
      }))
    }
    for (const style of ['klar', 'skizze'] as const) {
      const { elements } = scene({ ...big, style })
      const rects = elements.filter(e => e.type === 'rectangle')
      expect(rects).toHaveLength(1 + 8 + 28)
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]
          const b = rects[j]
          const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
          expect(overlap, `${i}/${j}`).toBe(false)
        }
      }
      const byId = indexById(elements)
      for (const t of elements.filter(e => e.type === 'text')) {
        const c = byId.get(t.containerId)
        // Excalidraw: maxWidth = Breite − 2 × BOUND_TEXT_PADDING (5)
        expect(t.width).toBeLessThanOrEqual(c.width - 10)
        expect(t.height).toBeLessThanOrEqual(c.height - 10)
        expect(t.x + t.width / 2).toBeCloseTo(c.x + c.width / 2, 1)
        expect(t.y + t.height / 2).toBeCloseTo(c.y + c.height / 2, 1)
        expect(t.text.split('\n').length).toBeLessThanOrEqual(MINDMAP_LIMITS.maxLines)
      }
    }
  })

  it('Linienenden liegen am Rand ihrer Knoten (± gap)', () => {
    const { elements } = scene(sample)
    const byId = indexById(elements)
    const distToRect = (p: { x: number; y: number }, r: El): number => {
      const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width))
      const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height))
      return Math.hypot(dx, dy)
    }
    for (const a of elements.filter(e => e.type === 'arrow')) {
      const start = { x: a.x, y: a.y }
      const end = { x: a.x + a.points[1][0], y: a.y + a.points[1][1] }
      expect(distToRect(start, byId.get(a.startBinding.elementId))).toBeLessThanOrEqual(a.startBinding.gap + 0.5)
      expect(distToRect(end, byId.get(a.endBinding.elementId))).toBeLessThanOrEqual(a.endBinding.gap + 0.5)
      expect(distToRect(start, byId.get(a.startBinding.elementId))).toBeGreaterThan(0)
    }
  })

  it('Farben: Mitte Petrol, Kategorien aus NOTE_KINDS', () => {
    const { elements } = scene(sample)
    const rectFor = (text: string): El => {
      const t = elements.find(e => e.type === 'text' && e.originalText === text)!
      return elements.find(e => e.id === t.containerId)!
    }
    expect(rectFor('Fortbildung Digitale Werkzeuge').backgroundColor).toBe('#10696b')
    expect(rectFor('Werkzeuge').backgroundColor).toBe(NOTE_KINDS.solution.canvasColor)
    expect(rectFor('Werkzeuge').strokeColor).toBe(NOTE_KINDS.solution.dotColor)
    expect(rectFor('Probleme').backgroundColor).toBe(NOTE_KINDS.problem.canvasColor)
    expect(rectFor('Termine').backgroundColor).toBe(NOTE_KINDS.info.canvasColor)
    expect(rectFor('Größere Räume').strokeColor).toBe(NOTE_KINDS.problem.dotColor)
  })

  it('Determinismus: gleiche Eingabe + gleicher Zeitstempel → gleiche Bytes (F10)', () => {
    const a = buildExcalidrawMindmap(sample, { now: NOW }).json
    const b = buildExcalidrawMindmap(sample, { now: NOW }).json
    const c = buildExcalidrawMindmap(sample, { now: NOW + 1 }).json
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })

  it('Szene trägt Schrift und Stil für Ergänzungen des Nutzers', () => {
    const { appState } = scene({ ...sample, style: 'skizze' })
    expect(appState.currentItemFontFamily).toBe(5)
    expect(appState.currentItemStrokeColor).toBe('#10696b')
  })
})

describe('buildExcalidrawMindmap — Grenzen und Ablehnungen', () => {
  const two = [{ text: 'A' }, { text: 'B' }]

  it('zu wenige und zu viele Äste', () => {
    expect(issuesOf(() => scene({ title: 'X', branches: [{ text: 'A' }] })).join()).toMatch(/mindestens 2/)
    expect(issuesOf(() => scene({ title: 'X', branches: Array.from({ length: 9 }, (_, i) => ({ text: `A${i}` })) })).join()).toMatch(/höchstens 8/)
  })

  it('zu viele Blätter je Ast und insgesamt', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ text: `L${i}` }))
    expect(issuesOf(() => scene({ title: 'X', branches: [{ text: 'A', children: many }, { text: 'B' }] })).join()).toMatch(/höchstens 6/)
    const full = Array.from({ length: 8 }, (_, i) => ({ text: `A${i}`, children: Array.from({ length: 5 }, (_, j) => ({ text: `L${j}` })) }))
    expect(issuesOf(() => scene({ title: 'X', branches: full })).join()).toMatch(/49 Knoten — höchstens 40/)
  })

  it('zu lange Texte und zu viele Zeilen', () => {
    expect(issuesOf(() => scene({ title: 'x'.repeat(61), branches: two })).join()).toMatch(/höchstens 60/)
    expect(issuesOf(() => scene({ title: 'X', branches: [{ text: 'y'.repeat(81) }, { text: 'B' }] })).join()).toMatch(/höchstens 80/)
    const wordy = 'Ein sehr langer Satz mit vielen kleinen Wörtern der nicht passt und weiter geht'
    expect(issuesOf(() => scene({ title: 'X', branches: [{ text: wordy }, { text: 'B' }] })).join()).toMatch(/Zeilen — höchstens 3/)
  })

  it('leere Texte und Doppelte', () => {
    expect(issuesOf(() => scene({ title: ' ', branches: two })).join()).toMatch(/Mitte: Text fehlt/)
    expect(issuesOf(() => scene({ title: 'X', branches: [{ text: 'A' }, { text: ' a ' }] })).join()).toMatch(/doppelt/)
  })

  it('Zeichen außerhalb der eingebetteten Schrift (F06)', () => {
    const msg = issuesOf(() => scene({ title: 'Ideen 💡', branches: two })).join()
    expect(msg).toMatch(/U\+1F4A1/)
    expect(issuesOf(() => scene({ title: 'Привет', branches: two })).join()).toMatch(/nicht verfügbar/)
    // Excalifont hat kein „§" — im Stil „skizze" abgelehnt, in „klar" erlaubt
    expect(issuesOf(() => scene({ title: '§ 5 Schulgesetz', branches: two, style: 'skizze' })).join()).toMatch(/U\+00A7/)
    expect(() => scene({ title: '§ 5 Schulgesetz', branches: two })).not.toThrow()
    // „‰“ liegt im unicode-range des Nunito-Teilsatzes, die Datei hat aber keinen Glyph (F17)
    expect(issuesOf(() => scene({ title: 'Quote 5 \u2030', branches: two })).join()).toMatch(/U\+2030/)
  })

  it('Zeilenumbrüche und Tabs in der Eingabe werden zu Leerzeichen', () => {
    const { elements } = scene({ title: 'Erste\nZeile\tzwei', branches: two })
    expect(elements.find(e => e.type === 'text')!.originalText).toBe('Erste Zeile zwei')
  })

  it('Kategorien: nur problem/solution/info (F01)', () => {
    expect(issuesOf(() => scene({ title: 'X', branches: [{ text: 'A', kind: 'loesung' }, { text: 'B' }] })).join()).toMatch(/problem, solution, info/)
  })

  it('unbekannter Stil', () => {
    expect(issuesOf(() => scene({ title: 'X', branches: two, style: 'bunt' })).join()).toMatch(/Stil/)
  })
})

describe('Links (F02)', () => {
  const paths = ['Projekte/Alpha.md', 'Archiv/Alpha.md', 'Notizen/Beta.md', 'Ordner/Größe.md']

  it('Wikilink-Ziel lesen', () => {
    expect(parseWikilinkTarget('[[Beta]]')).toBe('Beta')
    expect(parseWikilinkTarget('[[Notizen/Beta|Alias]]')).toBe('Notizen/Beta')
    expect(parseWikilinkTarget('[[Beta#Abschnitt]]')).toBeNull()
    expect(parseWikilinkTarget('https://example.org')).toBeNull()
  })

  it('löst eindeutig auf, lehnt Mehrdeutiges und Unbekanntes ab', () => {
    expect(resolveWikilinkInPaths('Beta', paths)).toEqual({ path: 'Notizen/Beta' })
    expect(resolveWikilinkInPaths('notizen/beta.md', paths)).toEqual({ path: 'Notizen/Beta' })
    expect(resolveWikilinkInPaths('Projekte/Alpha', paths)).toEqual({ path: 'Projekte/Alpha' })
    expect(resolveWikilinkInPaths('Alpha', paths)).toMatchObject({ error: expect.stringMatching(/mehrdeutig.*2 Treffer/) })
    expect(resolveWikilinkInPaths('Gamma', paths)).toMatchObject({ error: expect.stringMatching(/nicht gefunden/) })
    expect(resolveWikilinkInPaths('Alph', paths)).toMatchObject({ error: expect.stringMatching(/nicht gefunden/) })
    expect(resolveWikilinkInPaths('../x', paths)).toMatchObject({ error: expect.stringMatching(/ungültig/) })
  })

  it('Unicode-Normalform (NFD aus dem Dateisystem) trifft NFC aus dem Modell', () => {
    expect(resolveWikilinkInPaths('Größe', ['Ordner/Größe.md'])).toEqual({ path: 'Ordner/Größe' })
  })

  it('lehnt Pfade ab, die ein Wikilink nicht trägt (F11)', () => {
    const odd = ['Projekte/A#B.md', 'Projekte/C|D.md', 'Projekte/E[1].md']
    expect(resolveWikilinkInPaths('Projekte/A#B', odd)).toMatchObject({ error: expect.stringMatching(/Zeichen/) })
    expect(resolveWikilinkInPaths('C|D', odd)).toMatchObject({ error: expect.stringMatching(/Zeichen/) })
    expect(resolveWikilinkInPaths('E[1]', odd)).toMatchObject({ error: expect.stringMatching(/Zeichen/) })
  })

  it('gleicht Apostrophe wie der Klick-Resolver gleich und lehnt Kollisionen ab (F12)', () => {
    const both = ["Ordner/A'B.md", 'Ordner/A\u2019B.md']
    expect(resolveWikilinkInPaths("A'B", both)).toMatchObject({ error: expect.stringMatching(/mehrdeutig/) })
    expect(resolveWikilinkInPaths('Ordner/A\u2019B', both)).toMatchObject({ error: expect.stringMatching(/mehrdeutig/) })
    expect(resolveWikilinkInPaths('A\u2019B', ["Ordner/A'B.md"])).toEqual({ path: "Ordner/A'B" })
  })

  it('linkCompareKey entspricht straightenQuotes des Renderers', () => {
    for (const s of ['You\u2019ll', '\u201EZitat\u201C', 'Gro\u0308\u00dfe', 'a\u2032b\u2033', '\u201Aeinfach\u2018']) {
      expect(linkCompareKey(s)).toBe(straightenQuotes(s).toLowerCase())
    }
  })

  it('speichert den kanonischen Pfad am Kasten', () => {
    const resolve = (t: string) => resolveWikilinkInPaths(t, paths)
    const { elements } = scene({ title: 'X', branches: [{ text: 'A', link: '[[Beta]]' }, { text: 'B' }] }, resolve)
    expect(elements.find(e => e.type === 'rectangle' && e.link)!.link).toBe('[[Notizen/Beta]]')
    expect(issuesOf(() => scene({ title: 'X', branches: [{ text: 'A', link: '[[Alpha]]' }, { text: 'B' }] }, resolve)).join()).toMatch(/mehrdeutig/)
    expect(issuesOf(() => scene({ title: 'X', branches: [{ text: 'A', link: '[[Beta]]' }, { text: 'B' }] })).join()).toMatch(/nicht möglich/)
  })
})
