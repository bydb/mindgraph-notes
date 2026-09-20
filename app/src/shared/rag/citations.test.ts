import { describe, it, expect } from 'vitest'
import { analyzeCitations, contentWords, replaceCitationRefs } from './citations'

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

  it('Überschriften sind sichtbar ungeprüft, Tabellenzellen werden geprüft, Trennlinien fallen weg, Listenmarker gehören nicht zum Satz', () => {
    const md = '## Ergebnis\n\n---\n\n| Posten | Stand |\n|---|---|\n| Budget 9000 Euro | genehmigt |\n\n- Frau Müller moderiert den Workshop. [2]\n1. Termin ist der 18. September. [2]'
    const r = analyzeCitations(md, sources)
    expect(r.sentences.map((s) => [md.slice(s.start, s.end), s.status])).toEqual([
      ['Ergebnis', 'unchecked'],
      ['Posten', 'uncited'],
      ['Stand', 'uncited'],
      ['Budget 9000 Euro', 'uncited'],
      ['genehmigt', 'uncited'],
      ['Frau Müller moderiert den Workshop. [2]', 'cited-high'],
      ['Termin ist der 18. September. [2]', 'cited-high']
    ])
    expect(r.summary.unchecked).toBe(1)
    expect(r.summary.sentences).toBe(6)
  })

  it('Punkt nach Zahl trennt Sätze, außer vor einem Monatsnamen; der erste Satz bleibt sichtbar ohne Quelle (F26)', () => {
    const r = analyzeCitations('Das Budget beträgt 10. Die Freigabe ist erteilt. [1] Der Termin ist am 3. März 2026. [1]', sources)
    // Satz 2 zitiert [1], seine Wörter stehen dort aber nicht → niedrige Deckung, ehrlich.
    expect(r.sentences.map((s) => s.status)).toEqual(['uncited', 'cited-low', 'cited-high'])
    const r2 = analyzeCitations('Das Budget beträgt 10. die Freigabe ist erteilt. [1]', sources)
    expect(r2.sentences.map((s) => s.status)).toEqual(['uncited', 'cited-low'])
  })

  it('kurze wörtliche Zitate werden geprüft (F26)', () => {
    const r = analyzeCitations('Er sagte „Nein". [1]', sources)
    expect(r.sentences[0].quotes).toEqual([{ text: 'Nein', found: false }])
  })

  it('escaped Klammern, Links und Referenz-Links sind keine Zitate; [1][2] schon (F25)', () => {
    const r = analyzeCitations('Siehe \\[1] und [1](https://example.org) und [1][ref]. Das Budget beträgt 10.000 Euro. [1][2]', sources)
    expect(r.sentences[0].status).toBe('uncited')
    expect(r.sentences[1].refs).toEqual([1, 2])
    expect(r.refs.map((x) => x.n)).toEqual([1, 2])
  })

  it('eingerückte Zäune und mehrfache Backticks werden maskiert (F25)', () => {
    const md = 'Text. [1]\n\n   ```\n   arr[7]\n   ```\n\nNutze ``a`b[8]`` hier. [2]'
    const r = analyzeCitations(md, sources)
    expect(r.refs.map((x) => x.n)).toEqual([1, 2])
  })

  it('eingerückter Code, Linkziele/-titel und URLs sind keine Zitate (F25)', () => {
    const md = 'Erster Satz. [1]\n\n    arr[1] + arr[2]\n\n[Link](https://example.org "[1]") und <https://x.y/[1]> und https://a.b/c[1] sind Links. [2]'
    const r = analyzeCitations(md, sources)
    expect(r.refs.map((x) => x.n)).toEqual([1, 2])
    expect(r.sentences).toHaveLength(2)
  })

  it('replaceCitationRefs ersetzt nur gültige Prüfer-Referenzen und lässt Code bytegetreu', () => {
    const md = 'Satz. [1] `code[1]` [9]\n\n```\nx[1]\n```'
    const r = analyzeCitations(md, sources)
    const out = replaceCitationRefs(md, r, (n) => `<${n}>`)
    expect(out).toBe('Satz. <1> `code[1]` [9]\n\n```\nx[1]\n```')
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

describe('Nennung eines Notiztitels ist kein Zitat — sonst wird geprüft (F46)', () => {
  it('ein genannter Quellentitel zählt nicht, eine erfundene Aussage schon', () => {
    const r = analyzeCitations('Die Notiz „Lokale Modelle in MindGraph Notes“ nennt das Budget von 10.000 Euro. [1] Er sagte „das wird teuer“. [1]', sources,
      { sourceTitles: ['Lokale Modelle in MindGraph Notes', 'Budget.md'] })
    expect(r.sentences[0].quotes).toEqual([])
    expect(r.sentences[1].quotes).toEqual([{ text: 'das wird teuer', found: false }])
    expect(r.summary.quotesNotFound).toBe(1)
  })

  it('kurzes Zitat wird geprüft, auch wenn sein Wortlaut in der Frage steht (Codex-Gegenfall F46)', () => {
    const r = analyzeCitations('Er sagte „abgesagt“. [1]', sources, { sourceTitles: ['Protokoll'] })
    expect(r.sentences[0].quotes).toEqual([{ text: 'abgesagt', found: false }])
    expect(r.summary.quotesNotFound).toBe(1)
  })

  it('langes Zitat wird geprüft; ein Titel-Teilstück gilt nicht als Nennung', () => {
    const lang = 'Das Budget der Digitalwoche beträgt laut Schulamt genau zehntausend Euro'
    expect(analyzeCitations(`Er schrieb „${lang}“. [1]`, sources).sentences[0].quotes).toEqual([{ text: lang, found: false }])
    const r = analyzeCitations('Die Notiz „Lokale Modelle“ sagt etwas. [1]', sources, { sourceTitles: ['Lokale Modelle in MindGraph Notes'] })
    expect(r.sentences[0].quotes).toEqual([{ text: 'Lokale Modelle', found: false }])
  })
})
