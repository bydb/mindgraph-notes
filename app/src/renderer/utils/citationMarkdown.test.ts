import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import { citationMarkdownPlugin, markCitationRefs, type CitationEnv } from './citationMarkdown'
import { analyzeCitations, replaceCitationRefs } from '../../shared/rag/citations'
import { SANITIZE_ALLOWED_ATTR } from './sanitize'

const sources = ['Quelle eins Text', 'Quelle zwei Text']
const md = new MarkdownIt({ html: false, linkify: true }).use(citationMarkdownPlugin)
const env: CitationEnv = {
  cites: { resolve: (n) => ({ noteId: `note-${n}`, fileRel: `ordner/quelle-${n}.md` }) }
}

/** Prüfung, Anzeige und Export auf demselben Text: alle drei müssen dieselben Vorkommen sehen. */
function roundtrip(markdown: string) {
  const report = analyzeCitations(markdown, sources)
  const html = md.render(markCitationRefs(markdown, report), env)
  const exported = replaceCitationRefs(markdown, report, (n) => `[^${n}]`)
  const valid = report.refs.filter((r) => r.valid).length
  const sups = (html.match(/<sup class="nc-cite"/g) ?? []).length
  const footnotes = (exported.match(/\[\^\d+\]/g) ?? []).length
  return { report, html, exported, valid, sups, footnotes }
}

describe('Zitatmarker als Markdown-Token (F25)', () => {
  it('gültige Nummern im Fließtext werden zu klickbaren Hochzahlen, ungültige bleiben Text', () => {
    const r = roundtrip('Satz eins. [1] Satz zwei. [9]')
    expect(r.html).toContain('<sup class="nc-cite" data-cite="1" role="link" tabindex="0" data-note="note-1" title="ordner/quelle-1.md">[1]</sup>')
    expect(r.html).toContain('[9]')
    expect([r.valid, r.sups, r.footnotes]).toEqual([1, 1, 1])
  })

  it('Inline-Code, Zäune und eingerückter Code bleiben bytegetreu', () => {
    const r = roundtrip('Nutze `arr[1]`. [2]\n\n```\nx[1]\n```\n\n    y[2]\n')
    expect(r.html).toContain('<code>arr[1]</code>')
    expect(r.html).toContain('x[1]')
    expect(r.html).toContain('y[2]')
    expect([r.valid, r.sups, r.footnotes]).toEqual([1, 1, 1])
  })

  it('Linkziele und -titel werden nicht angefasst; Linktext ist sichtbarer Text', () => {
    const r = roundtrip('[Link](https://example.org "[1]") und [Text [2]](https://example.org) hier. [1]')
    expect(r.html).toContain('title="[1]"')
    expect(r.html).toContain('href="https://example.org"')
    expect([r.valid, r.sups, r.footnotes]).toEqual([2, 2, 2])
  })

  it('escaped Klammern sind keine Zitate', () => {
    const r = roundtrip('Siehe \\[1] hier. [2]')
    expect(r.html).toContain('[1]')
    expect(r.html).toContain('data-note="note-2"')
    expect([r.valid, r.sups, r.footnotes]).toEqual([1, 1, 1])
  })

  it('[1][2] nebeneinander ergibt zwei Hochzahlen', () => {
    const r = roundtrip('Aussage. [1][2]')
    expect([r.valid, r.sups, r.footnotes]).toEqual([2, 2, 2])
  })

  // Codex-Gegenproben der Nachprüfung Runde 4
  it('Text-Token nur mit ungültiger Nummer wird nicht verdoppelt', () => {
    const r = roundtrip('Satz [1]. **Falsch [9]**')
    expect(r.html).toContain('<strong>Falsch [9]</strong>')
    expect(r.html.match(/Falsch/g)).toHaveLength(1)
    expect([r.valid, r.sups, r.footnotes]).toEqual([1, 1, 1])
  })

  it('eingerückte Listenfortsetzung ist Text: Prüfer, Anzeige und Export zählen beide Vorkommen', () => {
    const r = roundtrip('Satz [1].\n\n- Absatz\n\n    Weiter [1]')
    expect(r.report.refs).toHaveLength(2)
    expect([r.valid, r.sups, r.footnotes]).toEqual([2, 2, 2])
    expect(r.exported).toContain('    Weiter [^1]')
  })

  it('[1][2] mit Linkdefinition ist ein Referenzlink, ohne Definition zwei Zitate', () => {
    const withDef = roundtrip('Text [1][2].\n\n[2]: https://example.org')
    expect(withDef.html).toContain('<a href="https://example.org">1</a>')
    expect([withDef.valid, withDef.sups, withDef.footnotes]).toEqual([0, 0, 0])
    expect(withDef.exported).toBe('Text [1][2].\n\n[2]: https://example.org')
    const noDef = roundtrip('Text [1][2].')
    expect([noDef.valid, noDef.sups, noDef.footnotes]).toEqual([2, 2, 2])
  })

  it('Private-Use-Zeichen im Modelltext ergeben keine Hochzahl', () => {
    const answer = 'Falsch [\uE0001\uE001] und echt. [1]'
    const report = analyzeCitations(answer, sources)
    const html = md.render(markCitationRefs(answer, report), env)
    expect(html).not.toContain('<sup')
  })

  it('der Sanitizer lässt die Attribute der Hochzahlen durch', () => {
    for (const attr of ['class', 'role', 'tabindex', 'data-note', 'data-cite', 'title', 'data-source-line']) {
      expect(SANITIZE_ALLOWED_ATTR).toContain(attr)
    }
  })

  it('ohne Auflösung keine Klick-Attribute', () => {
    const report = analyzeCitations('A. [1]', sources)
    const html = md.render(markCitationRefs('A. [1]', report), { cites: { resolve: () => null } } satisfies CitationEnv)
    expect(html).toContain('<sup class="nc-cite" data-cite="1">[1]</sup>')
  })
})
