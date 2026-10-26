import { describe, it, expect } from 'vitest'
import { createWebAnswerMarkdown, hasSevereFlag, markKind, markWebAnswer, onlyKnowledgeFlags, onlyNeutralFlags, sentenceFlags, type WebAnswerEnv } from './webAnswerMarkdown'
import { analyzeCitations } from '../../shared/rag/citations'

const md = createWebAnswerMarkdown()

describe('Webantwort-Anzeige (E3)', () => {
  it('Modell-Links bleiben Text, nichts ist klickbar (F15)', () => {
    const html = md.render('Siehe [offizielle Quelle](https://evil.example) und https://evil.example/x.')
    expect(html).not.toContain('<a')
    expect(html).toContain('https://evil.example')
  })

  it('Hochzahlen nur an gültigen Referenzen, Marke am Satz ohne Quelle', () => {
    const answer = 'Der Beitrag beträgt 18 Euro [1]. Er steigt bald.'
    const report = analyzeCitations(answer, ['Der Beitrag beträgt 18 Euro im Monat.'])
    const env: WebAnswerEnv = { flags: { label: (k) => (report.sentences[k]?.status === 'uncited' ? 'ohne Quellennummer' : null), kind: () => 'knowledge' } }
    const html = md.render(markWebAnswer(answer, report), { ...env, cites: { resolve: () => null } })
    expect(html).toContain('data-cite="1"')
    expect(html).toContain('Er steigt bald.<span class="petrol-web-mark is-knowledge" title="ohne Quellennummer" aria-label="ohne Quellennummer"></span>')
  })

  it('Private-Use-Zeichen aus Modelltext werden entfernt statt als Marker gelesen', () => {
    const answer = 'Falsch [\uE0002\uE003] hier [1].'
    const report = analyzeCitations(answer.replace(/[\uE000-\uF8FF]/g, ''), ['hier'])
    expect(markWebAnswer(answer, report)).not.toMatch(/[\uE000-\uF8FF]/)
  })

  it('Überschrift bekommt eine sichtbare Marke statt still ungeprüft zu bleiben (F20)', () => {
    const answer = '## Förderung gestrichen [1]\n\nDer Beitrag beträgt 18 Euro [1].'
    const report = analyzeCitations(answer, ['Der Beitrag beträgt 18 Euro.'])
    const k = report.sentences.findIndex((s) => s.status === 'unchecked')
    expect(k).toBeGreaterThanOrEqual(0)
    expect(sentenceFlags(report.sentences[k])).toEqual(['heading'])
    const html = md.render(markWebAnswer(answer, report), { flags: { label: (i: number) => (i === k ? 'Überschrift, nicht geprüft' : null), kind: () => 'other' as const }, cites: { resolve: () => null } })
    expect(html).toMatch(/<h2>[^<]*<span class="petrol-web-mark is-other" title="Überschrift, nicht geprüft" aria-label="Überschrift, nicht geprüft">\?<\/span><\/h2>/)
  })

  it('Zahl- und Verneinungsmarken kommen aus den Zusatzprüfungen (F21)', () => {
    const s = { start: 0, end: 5, refs: [1], status: 'cited-high' as const, coverage: 1, quotes: [] }
    expect(sentenceFlags(s, { missingNumbers: ['19,50'], negation: true })).toEqual(['number', 'negation'])
    expect(sentenceFlags(s, { missingNumbers: [], negation: false })).toEqual([])
  })
})

describe('Modellwissen (26.10.2026)', () => {
  it('Satz ohne Nummer ist gekennzeichnet, nicht gewarnt; mit Zahl warnt er', () => {
    const report = analyzeCitations('Für Schulen ist das robuster.', ['x'])
    const s = report.sentences[0]
    expect(onlyNeutralFlags(sentenceFlags(s, { missingNumbers: [], negation: false }))).toBe(true)
    const withNumber = sentenceFlags(s, { missingNumbers: [], negation: false, unsourcedNumbers: ['140 €'] })
    expect(withNumber).toContain('unsourcedNumber')
    expect(onlyNeutralFlags(withNumber)).toBe(false)
  })
  it('F60: reines Modellwissen bekommt eine eigene Klasse, gemischt mit Warnung nicht', () => {
    expect(onlyKnowledgeFlags(['uncited'])).toBe(true)
    expect(onlyKnowledgeFlags(['uncited', 'unsourcedNumber'])).toBe(false)
    expect(onlyKnowledgeFlags(['gap'])).toBe(false)
    const md = createWebAnswerMarkdown()
    const answer = 'Für Schulen ist das robuster.'
    const report = analyzeCitations(answer, ['x'])
    const env: WebAnswerEnv = { flags: { label: () => 'Modellwissen', kind: () => 'knowledge' } }
    expect(md.render(markWebAnswer(answer, report), env)).toContain('petrol-web-mark is-knowledge" title="Modellwissen"')
  })

  it('harte Befunde bekommen Rot, Modellwissen und weiche Hinweise nicht', () => {
    expect(hasSevereFlag(['uncited', 'unsourcedNumber'])).toBe(true)
    expect(hasSevereFlag(['number'])).toBe(true)
    expect(hasSevereFlag(['uncited'])).toBe(false)
    expect(hasSevereFlag(['low', 'gap'])).toBe(false)
    expect(markKind(['uncited', 'unsourcedNumber'])).toBe('severe')
    expect(markKind(['uncited'])).toBe('knowledge')
    // Geringe Wortübereinstimmung steht nicht mehr im Text, nur in der Prüfliste.
    expect(markKind(['low'])).toBeNull()
    expect(markKind(['gap'])).toBe('gap')
    expect(markKind(['heading'])).toBe('other')
    // Verneinung ist ungeprüft, kein Befund (Codex F68).
    expect(markKind(['negation'])).toBe('other')
    expect(markKind(['low', 'negation'])).toBe('other')
    expect(markKind(['apart'])).toBe('apart')
    expect(markKind(['apart', 'number'])).toBe('severe')
    expect(markKind([])).toBeNull()
    const md = createWebAnswerMarkdown()
    const answer = 'Das kostet 12 Euro.'
    const report = analyzeCitations(answer, ['x'])
    const env: WebAnswerEnv = { flags: { label: () => 'Zahl ohne Quelle', kind: () => 'severe' } }
    expect(md.render(markWebAnswer(answer, report), env)).toContain('petrol-web-mark is-severe" title="Zahl ohne Quelle" aria-label="Zahl ohne Quelle">!</span>')
  })
})

