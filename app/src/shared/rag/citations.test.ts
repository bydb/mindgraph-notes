import { describe, it, expect } from 'vitest'
import { analyzeCitations, contentWords } from './citations'

const sources = [
  'Das Budget für die Digitalwoche beträgt 10.000 Euro und wurde am 3. März 2026 vom Schulamt bestätigt.',
  'Frau Müller übernimmt die Moderation des Workshops; der Termin ist der 18. September.'
]

describe('contentWords', () => {
  it('nimmt Wörter ab 4 Zeichen und Zahlen immer', () => {
    const w = contentWords('Das Budget beträgt 10.000 Euro am 3. März.')
    expect(w.has('budget')).toBe(true)
    expect(w.has('beträgt')).toBe(true)
    expect(w.has('10.000')).toBe(true)
    expect(w.has('3')).toBe(true)
    expect(w.has('das')).toBe(false)
    expect(w.has('am')).toBe(false)
  })
})

describe('analyzeCitations', () => {
  it('gültige Nummer mit hoher Wortdeckung', () => {
    const r = analyzeCitations('Das Budget der Digitalwoche beträgt 10.000 Euro. [1]', sources)
    expect(r.sentences).toHaveLength(1)
    expect(r.sentences[0].status).toBe('cited-high')
    expect(r.sentences[0].refs).toEqual([1])
    expect(r.usedSources).toEqual([1])
    expect(r.refs[0]).toMatchObject({ n: 1, valid: true })
    expect(r.summary).toMatchObject({ sentences: 1, cited: 1, uncited: 0, invalidRefs: 0 })
  })

  it('niedrige Wortdeckung heißt niedrig, nicht falsch', () => {
    const r = analyzeCitations('Die Veranstaltung wurde abgesagt und verschoben. [1]', sources)
    expect(r.sentences[0].status).toBe('cited-low')
    expect(r.sentences[0].coverage).toBeLessThan(0.3)
  })

  it('Negation ist Wortdeckung, keine Wahrheit: „nicht 10.000" deckt trotzdem hoch (dokumentierte Grenze)', () => {
    const r = analyzeCitations('Das Budget beträgt nicht 10.000 Euro. [1]', sources)
    expect(r.sentences[0].status).toBe('cited-high')
  })

  it('ungültige Nummer wird markiert und nicht als genutzt gezählt', () => {
    const r = analyzeCitations('Das Budget beträgt 10.000 Euro. [7]', sources)
    expect(r.sentences[0].status).toBe('cited-invalid')
    expect(r.refs[0].valid).toBe(false)
    expect(r.usedSources).toEqual([])
    expect(r.summary.invalidRefs).toBe(1)
  })

  it('jeder inhaltliche Satz ohne Nummer ist „ohne Quellenangabe"', () => {
    const r = analyzeCitations('Frau Müller moderiert. [2] Das Wetter war schön. Kurz gesagt: Das Budget beträgt 10.000 Euro.', sources)
    expect(r.sentences.map((s) => s.status)).toEqual(['cited-high', 'uncited', 'uncited'])
    expect(r.summary.uncited).toBe(2)
  })

  it('Überleitung nur als ganzes, alleinstehendes Segment ausgenommen', () => {
    const r = analyzeCitations('Kurz gesagt:\n\nDas Budget beträgt 10.000 Euro. [1]\n\nZusammengefasst ist das Projekt beendet.', sources)
    expect(r.sentences.map((s) => s.status)).toEqual(['transition', 'cited-high', 'uncited'])
    expect(r.summary.sentences).toBe(2)
  })

  it('Code-Zäune und Inline-Code werden übersprungen (dort sind [1] Array-Indizes)', () => {
    const md = 'Das Budget beträgt 10.000 Euro. [1]\n\n```js\nconst x = arr[1] + arr[9]\n```\n\nNutze `list[3]` dafür. [2]'
    const r = analyzeCitations(md, sources)
    expect(r.refs.map((x) => x.n)).toEqual([1, 2])
    expect(r.sentences).toHaveLength(2)
    expect(r.summary.invalidRefs).toBe(0)
  })

  it('Überschriften, Trennlinien und Tabellen sind keine Sätze; Listenmarker gehören nicht zum Satz', () => {
    const md = '## Ergebnis\n\n---\n\n| a | b |\n|---|---|\n\n- Frau Müller moderiert den Workshop. [2]\n1. Termin ist der 18. September. [2]'
    const r = analyzeCitations(md, sources)
    expect(r.sentences).toHaveLength(2)
    expect(r.sentences.every((s) => s.status === 'cited-high')).toBe(true)
    expect(md.slice(r.sentences[0].start, r.sentences[0].end).startsWith('Frau')).toBe(true)
  })

  it('wörtliche Zitate: gefunden bzw. nicht im Original', () => {
    const r = analyzeCitations('Im Protokoll steht „vom Schulamt bestätigt". [1] Er sagte „das wird teuer". [1]', sources)
    expect(r.sentences[0].quotes).toEqual([{ text: 'vom Schulamt bestätigt', found: true }])
    expect(r.sentences[1].quotes).toEqual([{ text: 'das wird teuer', found: false }])
    expect(r.summary.quotesNotFound).toBe(1)
  })

  it('Spannen zeigen auf den unveränderten Antworttext', () => {
    const answer = 'Erster Satz ohne Quelle. Zweiter Satz mit Budget 10.000 Euro. [1]'
    const r = analyzeCitations(answer, sources)
    expect(answer.slice(r.sentences[0].start, r.sentences[0].end)).toBe('Erster Satz ohne Quelle.')
    expect(answer.slice(r.sentences[1].start, r.sentences[1].end)).toBe('Zweiter Satz mit Budget 10.000 Euro. [1]')
    expect(answer.slice(r.refs[0].start, r.refs[0].end)).toBe('[1]')
  })

  it('Mehrere Zitate: das Maximum der Deckung zählt', () => {
    const r = analyzeCitations('Frau Müller moderiert den Workshop am 18. September. [1][2]', sources)
    expect(r.sentences[0].refs).toEqual([1, 2])
    expect(r.sentences[0].status).toBe('cited-high')
  })

  it('zitierter Satz ohne prüfbare Wörter', () => {
    const r = analyzeCitations('Ja. [1]', sources)
    expect(r.sentences[0].status).toBe('cited-unchecked')
    expect(r.sentences[0].coverage).toBeNull()
  })

  it('leere Antwort oder keine Quellen', () => {
    expect(analyzeCitations('', sources).sentences).toEqual([])
    const r = analyzeCitations('Etwas mit Nummer. [1]', [])
    expect(r.sentences[0].status).toBe('cited-invalid')
  })
})
