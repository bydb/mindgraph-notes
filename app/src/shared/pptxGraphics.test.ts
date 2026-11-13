import { describe, it, expect } from 'vitest'
import { chartShapesXml, fitLabelPt, flowLoopRange, flowShapesXml, graphicFitIssue, graphicNumber, graphicTexts, timelineShapesXml, validateChart, validateFlow, validateTimeline, type GraphicContext, type PptxTimeline } from './pptxGraphics'

const IN = 914400
const ctx = (): GraphicContext => ({ nextId: 10, lang: 'de-DE', text: s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;') })
const box = { x: 0.6 * IN, y: 2 * IN, cx: 12 * IN, cy: 4.5 * IN }
const widthOf = (xml: string, name: string): number => Number(new RegExp(`name="${name}"[^]*?<a:ext cx="(\\d+)"`).exec(xml)![1])

describe('Zahlen aus Modellangaben', () => {
  it('nimmt Zahlen und Zahlentext, sonst nichts', () => {
    expect(graphicNumber(10)).toBe(10)
    expect(graphicNumber('3,4')).toBe(3.4)
    expect(graphicNumber(' 20 ')).toBe(20)
    expect(graphicNumber('ca. 20')).toBeNaN()
    expect(graphicNumber('')).toBeNaN()
    expect(graphicNumber(Infinity)).toBeNaN()
    expect(graphicNumber(null)).toBeNaN()
  })
})

describe('Zeitleiste', () => {
  const tl: PptxTimeline = {
    legend: { normal: 'Input', highlight: 'Sie arbeiten selbst' },
    blocks: [
      { row: 'Teil 1', label: 'Einstieg', value: 10 }, { row: 'Teil 1', label: 'Grundlagen', value: 30 }, { row: 'Teil 1', label: 'Werkstatt', value: 60, highlight: true },
      { row: 'Teil 2', label: 'Pause', value: 10, pause: true }, { row: 'Teil 2', label: 'Transfer', value: 40 }
    ]
  }

  it('Breite folgt der Dauer; die längste Zeile füllt die Fläche; Zeilentitel nennt die Summe', () => {
    expect(validateTimeline(tl, 'Folie 1')).toEqual([])
    const c = ctx()
    const xml = timelineShapesXml(c, box, tl)
    expect(widthOf(xml, 'Zeitleiste Werkstatt') / widthOf(xml, 'Zeitleiste Grundlagen')).toBeCloseTo(2, 1)
    const total = widthOf(xml, 'Zeitleiste Einstieg') + widthOf(xml, 'Zeitleiste Grundlagen') + widthOf(xml, 'Zeitleiste Werkstatt') + 2 * 0.08 * IN
    expect(total / box.cx).toBeCloseTo(1, 2)
    // Gleicher Maßstab in beiden Zeilen: 40 Minuten sind unten so breit wie oben.
    expect(widthOf(xml, 'Zeitleiste Transfer') / widthOf(xml, 'Zeitleiste Grundlagen')).toBeCloseTo(40 / 30, 1)
    expect(xml).toContain('<a:t>Teil 1 · 100 Min.</a:t>')
    expect(xml).toContain('<a:t>Teil 2 · 50 Min.</a:t>')
    expect(xml).toMatch(/name="Zeitleiste Werkstatt"[^]*?<a:solidFill><a:schemeClr val="accent1"\/>/)
    expect(xml).toMatch(/name="Zeitleiste Pause"[^]*?<a:noFill\/><a:ln w="12700">[^]*?<a:prstDash val="dash"\/>/)
    expect(xml).toContain('<a:t>Sie arbeiten selbst</a:t>')
    // Form-IDs laufen fort und sind eindeutig.
    const ids = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    expect(c.nextId).toBe(10 + ids.length)
  })

  it('ein sehr kurzer Abschnitt bleibt breit genug für seinen Namen und sprengt die Fläche nicht', () => {
    const narrow: PptxTimeline = { blocks: [{ label: 'Start', value: 1 }, { label: 'Hauptteil', value: 200 }] }
    const xml = timelineShapesXml(ctx(), box, narrow)
    expect(widthOf(xml, 'Zeitleiste Start')).toBeGreaterThanOrEqual(0.95 * IN - 1)
    expect(widthOf(xml, 'Zeitleiste Start') + widthOf(xml, 'Zeitleiste Hauptteil') + 0.08 * IN).toBeLessThanOrEqual(box.cx + 2)
    expect(xml).not.toContain('Zeile 1') // ohne row keine Zeilentitel
  })

  it('lehnt Unbrauchbares mit Ortsangabe ab', () => {
    expect(validateTimeline('x', 'Folie 2')[0]).toContain('Folie 2')
    expect(validateTimeline({ blocks: [] }, 'F')[0]).toContain('blocks')
    expect(validateTimeline({ blocks: [{ label: 'A', value: 0 }] }, 'F').join(' ')).toContain('größer 0')
    expect(validateTimeline({ blocks: [{ label: '', value: 5 }] }, 'F').join(' ')).toContain('"label" fehlt')
    expect(validateTimeline({ blocks: [{ label: 'A', value: 5, highlight: 'ja' }] }, 'F').join(' ')).toContain('true oder false')
    expect(validateTimeline({ blocks: [1, 2, 3, 4].map(n => ({ label: 'A', value: 5, row: `R${n}` })) }, 'F').join(' ')).toContain('zu viele Zeilen')
    expect(validateTimeline({ blocks: Array.from({ length: 9 }, () => ({ label: 'A', value: 5 })) }, 'F').join(' ')).toContain('je Zeile')
    expect(validateTimeline({ blocks: [{ label: 'A', value: '15' }] }, 'F')).toEqual([]) // Zahlentext ist erlaubt
  })
})

describe('Balkendiagramm', () => {
  const chart = { caption: 'Speicher in GB', note: 'Quelle: Messung', bars: [{ label: 'klein', value: 5 }, { label: 'groß & schwer', value: 20, highlight: true }] }

  it('Balkenlänge folgt dem Wert, der größte füllt die Breite; Hervorhebung in der Akzentfarbe', () => {
    expect(validateChart(chart, 'Folie 1')).toEqual([])
    const xml = chartShapesXml(ctx(), box, chart)
    expect(widthOf(xml, 'Diagramm Balken 2') / widthOf(xml, 'Diagramm Balken 1')).toBeCloseTo(4, 1)
    expect(xml).toMatch(/name="Diagramm Balken 2"[^]*?<a:solidFill><a:schemeClr val="accent1"\/>/)
    expect(xml).toMatch(/name="Diagramm Balken 1"[^]*?<a:schemeClr val="bg1"><a:lumMod/)
    expect(xml).toContain('<a:t>5</a:t>')
    expect(xml).toContain('<a:t>20</a:t>')
    expect(xml).toContain('<a:t>groß &amp; schwer</a:t>')
    expect(xml).toContain('<a:t>Speicher in GB</a:t>')
    expect(xml).toContain('<a:t>Quelle: Messung</a:t>')
  })

  it('schreibt Dezimalzahlen in der Sprache der Präsentation', () => {
    const xml = chartShapesXml(ctx(), box, { bars: [{ label: 'a', value: 3.4 }, { label: 'b', value: 0 }] })
    expect(xml).toContain('<a:t>3,4</a:t>')
    expect(xml).toContain('<a:t>0</a:t>')
  })

  it('lehnt zu wenige Balken, Nicht-Zahlen und ein Diagramm aus lauter Nullen ab', () => {
    expect(validateChart({ bars: [{ label: 'a', value: 1 }] }, 'F').join(' ')).toContain('2 bis 8 Balken')
    expect(validateChart({ bars: [{ label: 'a', value: 'viel' }, { label: 'b', value: 2 }] }, 'F').join(' ')).toContain('Zahl ab 0')
    expect(validateChart({ bars: [{ label: 'a', value: -1 }, { label: 'b', value: 2 }] }, 'F').join(' ')).toContain('Zahl ab 0')
    expect(validateChart({ bars: [{ label: 'a', value: 0 }, { label: 'b', value: 0 }] }, 'F').join(' ')).toContain('nichts zu zeigen')
    expect(validateChart({}, 'F')[0]).toContain('bars')
  })

  it('nennt alle sichtbaren Texte für die Link-Prüfung', () => {
    expect(graphicTexts({ blocks: [{ label: 'A', value: 1, row: 'R' }], legend: { normal: 'N' } }, chart)).toEqual(['A', 'R', 'N', 'Speicher in GB', 'Quelle: Messung', 'klein', 'groß & schwer'])
    expect(graphicTexts(undefined, null)).toEqual([])
  })
})

describe('Ablauf mit Schleife', () => {
  const steps = [{ label: 'Auftrag', text: 'Ziel nennen' }, { label: 'Überlegen', loop: true }, { label: 'Handeln', loop: true }, { label: 'Ansehen', loop: true }, { label: 'Entwurf' }]
  const pos = (xml: string, name: string): { x: number; y: number; cx: number; cy: number } => {
    const m = new RegExp(`name="${name}"[^]*?<a:off x="(-?\\d+)" y="(-?\\d+)"/><a:ext cx="(\\d+)" cy="(\\d+)"`).exec(xml)!
    return { x: Number(m[1]), y: Number(m[2]), cx: Number(m[3]), cy: Number(m[4]) }
  }

  it('Schleifenstationen in der Akzentfarbe auf getönter Fläche; der Rückpfeil reicht von der letzten zur ersten', () => {
    expect(validateFlow({ steps, loopLabel: 'wiederholt sich' }, 'Folie 1')).toEqual([])
    expect(flowLoopRange(steps)).toEqual({ from: 1, to: 3 })
    const xml = flowShapesXml(ctx(), box, { steps, loopLabel: 'wiederholt sich' })
    expect(xml).toMatch(/name="Ablauf Überlegen"[^]*?<a:solidFill><a:schemeClr val="accent1"\/>/)
    expect(xml).toMatch(/name="Ablauf Auftrag"[^]*?<a:solidFill><a:schemeClr val="tx2"\/>/)
    const first = pos(xml, 'Ablauf Überlegen')
    const last = pos(xml, 'Ablauf Ansehen')
    const top = pos(xml, 'Ablauf Rückpfeil oben')
    // Der Strich beginnt und endet auf der Mitte der Stationen (± halbe Strichstärke von 1,5 pt).
    expect(Math.abs(top.x - (first.x + first.cx / 2))).toBeLessThanOrEqual(19050 / 2 + 1)
    expect(Math.abs(top.x + top.cx - (last.x + last.cx / 2))).toBeLessThanOrEqual(19050 / 2 + 1)
    expect(top.y).toBeLessThan(first.y)
    // Die Spitze sitzt über der ERSTEN Schleifenstation und zeigt nach unten.
    const tip = pos(xml, 'Ablauf Rückpfeil Spitze')
    expect(tip.x + tip.cx / 2).toBeCloseTo(first.x + first.cx / 2, -3)
    expect(xml).toMatch(/<a:xfrm flipV="1">[^]*?prst="triangle"/)
    // Getönte Fläche umschließt genau die drei Stationen.
    const region = pos(xml, 'Ablauf Schleife')
    expect(region.x).toBeLessThan(first.x)
    expect(region.x + region.cx).toBeGreaterThan(last.x + last.cx)
    expect(region.x).toBeGreaterThan(pos(xml, 'Ablauf Auftrag').x + pos(xml, 'Ablauf Auftrag').cx)
    expect(xml.match(/name="Ablauf Pfeil \d"/g)).toHaveLength(4)
    expect(xml).toContain('<a:t>wiederholt sich</a:t>')
    expect(xml).toContain('<a:t>Ziel nennen</a:t>')
    // Alles bleibt in der Fläche.
    const end = pos(xml, 'Ablauf Entwurf')
    expect(end.x + end.cx).toBeLessThanOrEqual(box.x + box.cx + 2)
  })

  it('ohne Schleife: schlichte Kette ohne Rückpfeil', () => {
    const plain = steps.map(({ label }) => ({ label }))
    expect(validateFlow({ steps: plain }, 'F')).toEqual([])
    const xml = flowShapesXml(ctx(), box, { steps: plain })
    expect(xml).not.toContain('Rückpfeil')
    expect(xml).not.toContain('accent1')
  })

  it('lehnt zerrissene, einzelne und unbeschriftbare Schleifen ab', () => {
    const s3 = (flags: boolean[]) => flags.map((loop, i) => ({ label: `S${i}`, loop }))
    expect(validateFlow({ steps: s3([true, false, true]) }, 'F').join(' ')).toContain('nebeneinander')
    expect(validateFlow({ steps: s3([false, true, false]) }, 'F').join(' ')).toContain('mindestens zwei')
    expect(validateFlow({ steps: s3([false, false, false]), loopLabel: 'x' }, 'F').join(' ')).toContain('ohne Schleife')
    expect(validateFlow({ steps: s3([false, false]) }, 'F').join(' ')).toContain('3 bis 7 Stationen')
    expect(validateFlow({ steps: [{ label: 'A', loop: 'ja' }, { label: 'B' }, { label: 'C' }] }, 'F').join(' ')).toContain('true oder false')
    expect(validateFlow([], 'F')[0]).toContain('steps')
    expect(graphicTexts(null, null, { steps: [{ label: 'A', text: 'T' }], loopLabel: 'L' })).toEqual(['A', 'T', 'L'])
  })
})

describe('Befunde der Prüfung (Codex F01, F03, F04, F05)', () => {
  it('F01: überlaufender Zahlentext ist keine Zahl; sehr große Werte werden abgelehnt', () => {
    const big = '9'.repeat(400)
    expect(graphicNumber(big)).toBeNaN()
    expect(validateTimeline({ blocks: [{ label: 'A', value: big }] }, 'F').join(' ')).toContain('größer 0')
    expect(validateChart({ bars: [{ label: 'a', value: big }, { label: 'b', value: 1 }] }, 'F').join(' ')).toContain('Zahl ab 0')
    expect(validateTimeline({ blocks: [{ label: 'A', value: 1e12 }] }, 'F').join(' ')).toContain('größer 0')
    expect(validateChart({ bars: [{ label: 'a', value: 1e12 }, { label: 'b', value: 1 }] }, 'F').join(' ')).toContain('Zahl ab 0')
  })

  it('F03: zu kleine Fläche wird erkannt — Breite und Höhe, für alle drei Grafiken', () => {
    const inch = (w: number, h: number) => ({ x: 0, y: 0, cx: w * IN, cy: h * IN })
    const eight = { blocks: Array.from({ length: 8 }, (_, i) => ({ label: `B${i}`, value: 10 })) }
    expect(graphicFitIssue(inch(4, 4), { timeline: eight })).toContain('mindestens 8,2 Zoll Breite')
    expect(graphicFitIssue(inch(12.13, 4.5), { timeline: eight })).toBeNull()
    const threeRows = { legend: { normal: 'x' }, blocks: [1, 2, 3].map(n => ({ label: 'A', value: 5, row: `R${n}` })) }
    expect(graphicFitIssue(inch(12, 2), { timeline: threeRows })).toContain('Höhe')
    expect(graphicFitIssue(inch(12.13, 4.5), { timeline: threeRows })).toBeNull() // größter erlaubter Fall passt in die mitgelieferte Vorlage
    const bars = { caption: 'c', note: 'n', bars: Array.from({ length: 8 }, (_, i) => ({ label: `b${i}`, value: i + 1 })) }
    expect(graphicFitIssue(inch(1.5, 3), { chart: bars })).toContain('Breite')
    expect(graphicFitIssue(inch(12, 1.5), { chart: bars })).toContain('Höhe')
    expect(graphicFitIssue(inch(12.13, 3.25), { chart: bars })).toBeNull()
    const seven = { steps: Array.from({ length: 7 }, (_, i) => ({ label: `S${i}`, text: 't', loop: i > 0 && i < 4 })) }
    expect(graphicFitIssue(inch(2, 3), { flow: seven })).toContain('weniger Stationen')
    expect(graphicFitIssue(inch(12.13, 3.25), { flow: seven })).toBeNull()
  })

  it('F04: die Schleifen-Beschriftung nimmt den Textton des Farbschemas, nicht den Flächenton', () => {
    const xml = flowShapesXml(ctx(), box, { loopLabel: 'wiederholt sich', steps: [{ label: 'A' }, { label: 'B', loop: true }, { label: 'C', loop: true }] })
    expect(xml).toMatch(/name="Ablauf Schleife Beschriftung"[^]*?<a:rPr[^>]*><a:solidFill><a:schemeClr val="hlink"\/>/)
  })

  it('F05/F09: am Balken steht immer der Wert selbst — ein mitgeschicktes display wird nicht gezeigt', () => {
    const chart = { bars: [{ label: 'a', value: 100, display: '1' } as never, { label: 'b', value: 1, display: '-1' } as never] }
    expect(validateChart(chart, 'F')).toEqual([])
    const xml = chartShapesXml(ctx(), box, chart)
    expect(xml).toMatch(/name="Diagramm Wert 1"[^]*?<a:t>100<\/a:t>/)
    expect(xml).toMatch(/name="Diagramm Wert 2"[^]*?<a:t>1<\/a:t>/)
    expect(xml).not.toContain('<a:t>-1</a:t>')
    expect(graphicTexts(null, chart)).toEqual(['a', 'b'])
  })

  it('F07/F13: Legenden bleiben in der Fläche; was in zwei Zeilen nicht passt, wird abgelehnt', () => {
    const inch = (w: number, h: number) => ({ x: 0.6 * IN, y: 2 * IN, cx: w * IN, cy: h * IN })
    const blocks = [{ label: 'A', value: 10 }]
    const long = 'Wort '.repeat(12).trim() // 59 Zeichen, nahe der erlaubten Länge
    const cases: Array<[number, string]> = [[12.13, long], [6, 'Vortrag und gemeinsames Gespräch'], [4, 'Vortrag und Austausch']]
    for (const [w, text] of cases) {
      const b = inch(w, 4.5)
      const tl = { blocks, legend: { normal: text, highlight: text } }
      expect(graphicFitIssue(b, { timeline: tl }), `${w} Zoll`).toBeNull()
      const xml = timelineShapesXml(ctx(), b, tl)
      const ends = [...xml.matchAll(/name="Legende [^"]*"[^]*?<a:off x="(\d+)"[^>]*\/><a:ext cx="(\d+)"/g)].map(m => Number(m[1]) + Number(m[2]))
      expect(ends).toHaveLength(4)
      expect(Math.max(...ends)).toBeLessThanOrEqual(b.x + b.cx + 2)
      // Der Text bricht in seinem Kasten um, statt hinauszulaufen.
      expect(xml).toMatch(/name="Legende normal"[^]*?<a:bodyPr wrap="square"/)
    }
    // Zu lang für die Breite (mehr als zwei Zeilen) oder ein unteilbares Wort: Ablehnung.
    expect(graphicFitIssue(inch(6, 4.5), { timeline: { blocks, legend: { normal: long, highlight: long } } })).toContain('Legende')
    expect(graphicFitIssue(inch(12.13, 4.5), { timeline: { blocks, legend: { normal: 'n'.repeat(60), highlight: 'h' } } })).toContain('Legende')
    expect(graphicFitIssue(inch(3, 4.5), { timeline: { blocks, legend: { normal: 'kurz', highlight: 'auch kurz' } } })).toContain('Legende')
    expect(graphicFitIssue(inch(3, 4.5), { timeline: { blocks, legend: { normal: 'kurz' } } })).toBeNull()
  })

  it('F10: die Wertespalte richtet sich nach der längsten Zahl — nichts ragt über die Fläche', () => {
    const b = { x: 0.6 * IN, y: 2 * IN, cx: 12.13 * IN, cy: 3.25 * IN }
    for (const v of [7, 1_250_000, 1_000_000_000]) {
      const chart = { bars: [{ label: 'a', value: v, highlight: true }, { label: 'b', value: v / 2 }] }
      expect(graphicFitIssue(b, { chart })).toBeNull()
      const xml = chartShapesXml(ctx(), b, chart)
      const m = /name="Diagramm Wert 1"[^]*?<a:off x="(\d+)"[^>]*\/><a:ext cx="(\d+)"[^]*?<a:t>([^<]*)<\/a:t>/.exec(xml)!
      // Kasten endet in der Fläche UND ist breit genug für den Text (fett, 11,5 pt).
      expect(Number(m[1]) + Number(m[2])).toBeLessThanOrEqual(b.x + b.cx + 2)
      expect(Number(m[2]) / IN).toBeGreaterThanOrEqual(m[3].length * 11.5 * 0.0088)
    }
    // Lange Zahlen kosten Balkenlänge; wird es zu eng, lehnt die Passprüfung ab.
    expect(graphicFitIssue({ x: 0, y: 0, cx: 3.4 * IN, cy: 3 * IN }, { chart: { bars: [{ label: 'a', value: 1_000_000_000 }, { label: 'b', value: 1 }] } })).toContain('Breite')
    expect(graphicFitIssue({ x: 0, y: 0, cx: 3.4 * IN, cy: 3 * IN }, { chart: { bars: [{ label: 'a', value: 7 }, { label: 'b', value: 1 }] } })).toBeNull()
  })
})

describe('Schriftgröße nach Wörtern (echter Lauf 12.11.2026: „Werkzeu-g", „Abschlus-s")', () => {
  const sizes = [13, 12, 11, 10, 9, 8]
  const fitsWord = (word: string, pt: number, w: number) => word.length * pt * 0.0082 <= w

  it('kein Wort wird breiter als sein Kasten, solange eine Größe das zulässt', () => {
    for (const [label, w] of [['Werkzeug', 1.0], ['Nacharbeiten', 1.0], ['Abschluss', 1.0], ['Zusammenfassung', 1.2], ['Ergebnis kommt zurück', 1.3]] as const) {
      const pt = fitLabelPt(label, w, 0.9, sizes)
      for (const word of label.split(' ')) expect(fitsWord(word, pt, w), `${label} bei ${pt} pt`).toBe(true)
    }
    expect(fitLabelPt('Auftrag', 1.6, 0.9, sizes)).toBe(13) // kurzes Wort behält die große Schrift
  })

  it('mehrere Wörter dürfen umbrechen, aber nur so viele Zeilen, wie die Höhe hergibt', () => {
    const tall = fitLabelPt('Einstieg und Grundbegriff', 1.5, 0.9, sizes)
    const flat = fitLabelPt('Einstieg und Grundbegriff', 1.5, 0.22, sizes)
    expect(tall).toBeGreaterThan(flat)
    expect(fitLabelPt('Donaudampfschifffahrtsgesellschaft', 0.5, 0.9, sizes)).toBe(8) // passt nie → kleinste Größe
  })

  it('der Ablauf mit sieben Stationen aus dem echten Lauf wählt für jedes Wort eine passende Größe', () => {
    const labels = ['Auftrag', 'Zerlegen', 'Werkzeug', 'Entwurf', 'Prüfen', 'Nacharbeiten', 'Abschluss']
    const b = { x: 0.6 * IN, y: 2 * IN, cx: 12.13 * IN, cy: 3.25 * IN }
    const xml = flowShapesXml(ctx(), b, { steps: labels.map((label, i) => ({ label, loop: i === 4 || i === 5 })) })
    for (const label of labels) {
      const m = new RegExp(`name="Ablauf ${label}"[^]*?<a:ext cx="(\\d+)"[^]*?sz="(\\d+)"`).exec(xml)!
      expect(fitsWord(label, Number(m[2]) / 100, Number(m[1]) / IN - 0.3), label).toBe(true)
    }
  })

  it('ein kurzer Zeitleisten-Block wird so breit, dass sein längstes Wort hineinpasst — und bleibt in der Fläche', () => {
    const b = { x: 0.6 * IN, y: 2 * IN, cx: 12.13 * IN, cy: 4.5 * IN }
    const tl = { blocks: [{ label: 'Einstieg', value: 40 }, { label: 'Arbeitsphase', value: 45 }, { label: 'Zusammenfassung', value: 5 }] }
    expect(graphicFitIssue(b, { timeline: tl })).toBeNull()
    const xml = timelineShapesXml(ctx(), b, tl)
    const m = /name="Zeitleiste Zusammenfassung"[^]*?<a:off x="(\d+)"[^>]*\/><a:ext cx="(\d+)"[^]*?sz="(\d+)"/.exec(xml)!
    expect(fitsWord('Zusammenfassung', Number(m[3]) / 100, Number(m[2]) / IN - 0.14)).toBe(true)
    expect(Number(m[1]) + Number(m[2])).toBeLessThanOrEqual(b.x + b.cx + 2)
    // Acht lange Wörter passen nicht mehr in eine schmale Fläche → Ablehnung statt Wortbruch.
    const long = { blocks: Array.from({ length: 8 }, () => ({ label: 'Zusammenfassung', value: 5 })) }
    expect(graphicFitIssue({ x: 0, y: 0, cx: 9 * IN, cy: 4 * IN }, { timeline: long })).toContain('Breite')
  })
})

describe('Befunde der dritten Prüfrunde (Codex F13, F14)', () => {
  it('F14: viele kurze Wörter — der Block wird so breit, dass zwei Zeilen reichen, und die Schrift passt in die Höhe', () => {
    const b = { x: 0.6 * IN, y: 2 * IN, cx: 12.13 * IN, cy: 4.5 * IN }
    const label = 'aa bb cc dd ee ff gg hh ii'
    const blocks = [...Array.from({ length: 5 }, () => ({ row: 'R1', label, value: 1 })), { row: 'R1', label: 'Lang', value: 500 }, { row: 'R2', label: 'B', value: 5 }, { row: 'R3', label: 'C', value: 5 }]
    const tl = { blocks, legend: { normal: 'n' } }
    expect(graphicFitIssue(b, { timeline: tl })).toBeNull()
    const xml = timelineShapesXml(ctx(), b, tl)
    const m = /name="Zeitleiste aa bb[^"]*"[^]*?<a:ext cx="(\d+)" cy="(\d+)"[^]*?sz="(\d+)"/.exec(xml)!
    const w = Number(m[1]) / IN - 0.14
    const h = Number(m[2]) / IN - 0.08
    const pt = Number(m[3]) / 100
    const perLine = Math.floor(w / (pt * 0.0082))
    const lines = Math.ceil(label.length / perLine)
    expect(lines).toBeLessThanOrEqual(2)
    expect(lines * pt * 1.2 / 72).toBeLessThanOrEqual(h + 0.001)
    // Sieben solche Blöcke plus ein achter passen nicht mehr in die Breite → Ablehnung statt Überlauf.
    const seven = { blocks: [...Array.from({ length: 7 }, () => ({ label, value: 1 })), { label: 'Lang', value: 500 }] }
    expect(graphicFitIssue({ x: 0, y: 0, cx: 8 * IN, cy: 4 * IN }, { timeline: seven })).toContain('Breite')
  })

  it('F13: eine Legende, die in ihrem Kasten mehr als zwei Zeilen bräuchte, wird abgelehnt', () => {
    const long = { blocks: [{ label: 'A', value: 10 }], legend: { normal: 'Wort '.repeat(12).trim(), highlight: 'Wort '.repeat(12).trim() } }
    expect(graphicFitIssue({ x: 0, y: 0, cx: 4 * IN, cy: 4 * IN }, { timeline: long })).toContain('Legende')
    expect(graphicFitIssue({ x: 0, y: 0, cx: 12.13 * IN, cy: 4.5 * IN }, { timeline: long })).toBeNull()
    // Ein einzelnes Wort, das nicht in die Zeile passt, ebenso.
    expect(graphicFitIssue({ x: 0, y: 0, cx: 3.8 * IN, cy: 4 * IN }, { timeline: { blocks: long.blocks, legend: { normal: 'x'.repeat(40), highlight: 'y' } } })).toContain('Legende')
  })
})

