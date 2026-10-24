import { describe, it, expect } from 'vitest'
import { createWebAnswerMarkdown, markWebAnswer, sentenceFlags, type WebAnswerEnv } from './webAnswerMarkdown'
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
    const env: WebAnswerEnv = { flags: { label: (k) => (report.sentences[k]?.status === 'uncited' ? 'ohne Quellennummer' : null) } }
    const html = md.render(markWebAnswer(answer, report), { ...env, cites: { resolve: () => null } })
    expect(html).toContain('data-cite="1"')
    expect(html).toContain('Er steigt bald. <span class="petrol-web-flag">ohne Quellennummer</span>')
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
    const html = md.render(markWebAnswer(answer, report), { flags: { label: (i: number) => (i === k ? 'Überschrift, nicht geprüft' : null) }, cites: { resolve: () => null } })
    expect(html).toMatch(/<h2>[^<]*<span class="petrol-web-flag">Überschrift, nicht geprüft<\/span><\/h2>/)
  })

  it('Zahl- und Verneinungsmarken kommen aus den Zusatzprüfungen (F21)', () => {
    const s = { start: 0, end: 5, refs: [1], status: 'cited-high' as const, coverage: 1, quotes: [] }
    expect(sentenceFlags(s, { missingNumbers: ['19,50'], negation: true })).toEqual(['number', 'negation'])
    expect(sentenceFlags(s, { missingNumbers: [], negation: false })).toEqual([])
  })
})
