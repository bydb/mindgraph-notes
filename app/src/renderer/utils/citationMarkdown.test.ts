import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import { citationMarkdownPlugin, type CitationEnv } from './citationMarkdown'
import { analyzeCitations } from '../../shared/rag/citations'
import { SANITIZE_ALLOWED_ATTR } from './sanitize'

const sources = ['Quelle eins Text', 'Quelle zwei Text']
const md = new MarkdownIt({ html: false, linkify: true }).use(citationMarkdownPlugin)

function render(markdown: string): string {
  const report = analyzeCitations(markdown, sources)
  const env: CitationEnv = {
    cites: {
      valid: new Set(report.refs.filter((r) => r.valid).map((r) => r.n)),
      resolve: (n) => ({ noteId: `note-${n}`, fileRel: `ordner/quelle-${n}.md` })
    }
  }
  // Kein DOM in der Testumgebung: geprüft wird die Token-Ausgabe; die Allowlist des
  // Sanitizers wird separat belegt (unten).
  return md.render(markdown, env)
}

describe('Zitatmarker als Markdown-Token (F25)', () => {
  it('gültige Nummern im Fließtext werden zu klickbaren Hochzahlen, ungültige bleiben Text', () => {
    const html = render('Satz eins. [1] Satz zwei. [9]')
    expect(html).toContain('<sup class="nc-cite" data-cite="1" role="link" tabindex="0" data-note="note-1" title="ordner/quelle-1.md">[1]</sup>')
    expect(html).toContain('[9]')
    expect(html.match(/<sup/g)).toHaveLength(1)
  })

  it('Inline-Code, Zäune und eingerückter Code bleiben bytegetreu', () => {
    const html = render('Nutze `arr[1]`. [2]\n\n```\nx[1]\n```\n\n    y[2]\n')
    expect(html).toContain('<code>arr[1]</code>')
    expect(html).toContain('x[1]')
    expect(html).toContain('y[2]')
    expect(html.match(/<sup/g)).toHaveLength(1)
  })

  it('Linkziele und -titel werden nicht angefasst, auch mit erfundenem Platzhalter', () => {
    const html = render('[Link](https://example.org "[1]") und [Text [2]](https://example.org) hier. [1]')
    expect(html).toContain('title="[1]"')
    // Der Linktext ist sichtbarer Text → [2] darf dort zur Hochzahl werden; das Ziel bleibt.
    expect(html).toContain('href="https://example.org"')
    expect(html).not.toContain('⟦')
  })

  it('escaped Klammern sind keine Zitate', () => {
    const html = render('Siehe \\[1] hier. [2]')
    expect(html).toContain('[1]')
    expect(html.match(/<sup/g)).toHaveLength(1)
    expect(html).toContain('data-note="note-2"')
  })

  it('[1][2] nebeneinander ergibt zwei Hochzahlen', () => {
    const html = render('Aussage. [1][2]')
    expect(html.match(/<sup/g)).toHaveLength(2)
  })

  it('der Sanitizer lässt die Attribute der Hochzahlen durch', () => {
    for (const attr of ['class', 'role', 'tabindex', 'data-note', 'data-cite', 'title', 'data-source-line']) {
      expect(SANITIZE_ALLOWED_ATTR).toContain(attr)
    }
  })

  it('ohne Auflösung keine Klick-Attribute', () => {
    const report = analyzeCitations('A. [1]', sources)
    const env: CitationEnv = { cites: { valid: new Set(report.refs.map((r) => r.n)), resolve: () => null } }
    const html = md.render('A. [1]', env)
    expect(html).toContain('<sup class="nc-cite" data-cite="1">[1]</sup>')
  })
})
