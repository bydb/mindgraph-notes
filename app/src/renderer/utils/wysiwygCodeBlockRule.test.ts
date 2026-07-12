import { describe, it, expect } from 'vitest'
import TurndownService from 'turndown'
import { renderedCodeBlockRule } from './wysiwygCodeBlockRule'

// Regression: der Lesen-Modus rendert Code-Zeilen als <span class="code-line">
// OHNE \n dazwischen (wrapLines in highlightSetup.ts). Ohne die Regel presste
// der WYSIWYG-Roundtrip jeden Code-Block auf EINE Zeile zusammen — real
// zerschlagen am 2026-07-02: der email-relevance-config-Block der
// Email-Instruktionen (alle Relevanz-Regeln wirkungslos).

const makeTurndown = (): TurndownService => {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  td.addRule('renderedCodeBlock', renderedCodeBlockRule)
  return td
}

const line = (content: string): string => `<span class="code-line">${content}</span>`

describe('renderedCodeBlockRule', () => {
  it('rekonstruiert Zeilenumbrüche aus .code-line-Spans (der Email-Regeln-Fall)', () => {
    const html = `<pre><code class="language-email-relevance-config">${
      line('VIP-Absender:') + line('- Santina Peotsch') + line('- Uta Hinkelbein') + line('') + line('Domains:') + line('- mzgivb.de')
    }</code></pre>`
    expect(makeTurndown().turndown(html)).toBe(
      '```email-relevance-config\nVIP-Absender:\n- Santina Peotsch\n- Uta Hinkelbein\n\nDomains:\n- mzgivb.de\n```'
    )
  })

  it('Zeilen mit hljs-Spans (Syntax-Highlighting) bleiben intakt', () => {
    const html = `<pre><code class="language-js">${
      line('<span class="hljs-keyword">const</span> x = 1') + line('x + 1')
    }</code></pre>`
    expect(makeTurndown().turndown(html)).toBe('```js\nconst x = 1\nx + 1\n```')
  })

  it('fremdes <pre><code> ohne code-line-Spans verhält sich wie bisher (textContent)', () => {
    const html = '<pre><code>zeile eins\nzeile zwei</code></pre>'
    expect(makeTurndown().turndown(html)).toBe('```\nzeile eins\nzeile zwei\n```')
  })

  it('Backticks im Code verlängern den Fence', () => {
    const html = `<pre><code>${line('nutze ```js fences')}</code></pre>`
    expect(makeTurndown().turndown(html)).toBe('````\nnutze ```js fences\n````')
  })

  it('Copy-Button im <pre> landet nicht im Markdown', () => {
    const html = `<pre><button class="code-copy-btn">Kopieren</button><code class="language-py">${line('print(1)')}</code></pre>`
    expect(makeTurndown().turndown(html)).toBe('```py\nprint(1)\n```')
  })
})
