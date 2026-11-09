import { describe, expect, it } from 'vitest'
import MarkdownIt from 'markdown-it'
import { chatCodeBlockPlugin } from './chatCodeBlock'

const md = new MarkdownIt({ html: false, breaks: true }).use(chatCodeBlockPlugin)
const env = { copyLabel: 'Kopieren', copiedLabel: 'Kopiert' }

describe('chatCodeBlockPlugin', () => {
  it('färbt Python ein und nennt die Sprache', () => {
    const html = md.render('```python\ndef addiere(a: int, b: int) -> int:\n    return a + b\n```', env)
    expect(html).toContain('class="chat-code-lang">Python<')
    expect(html).toContain('hljs-keyword')
    expect(html).toContain('>Kopieren<')
    expect(html).toContain('data-copied="Kopiert"')
    expect((html.match(/class="code-line"/g) ?? []).length).toBe(2)
  })

  it('unbekannte Sprache bleibt lesbar und escaped', () => {
    const html = md.render('```foo\n<script>alert(1)</script>\n```', env)
    expect(html).toContain('chat-code-lang">foo<')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('ohne Sprachangabe keine Beschriftung', () => {
    const html = md.render('```\nx = 1\n```', env)
    expect(html).toContain('class="chat-code-lang"></span>')
  })
})
