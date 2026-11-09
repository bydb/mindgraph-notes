// Code-Blöcke in Chat-Antworten (Petrol-Chat, Webantworten): Syntaxfarben über denselben
// highlight.js-Aufbau wie Lesen-Modus und Karteikarten, dazu Kopfzeile mit Sprache und
// Kopieren. Gerendert als fertiges HTML (markdown-it-Fence-Regel), der Knopf ist ein
// `span[role=button]` — `button` lässt der Sanitizer nicht durch.

import type MarkdownIt from 'markdown-it'
import { codeLanguageLabel, highlightCode } from './highlightSetup'
import { writeClipboardText } from './clipboard'

export interface ChatCodeEnv {
  /** Beschriftung des Kopieren-Knopfs (übersetzt). */
  copyLabel?: string
  /** Beschriftung nach erfolgreichem Kopieren. */
  copiedLabel?: string
}

export function chatCodeBlockPlugin(md: MarkdownIt): void {
  md.renderer.rules.fence = (tokens, idx, _options, env: ChatCodeEnv | undefined) => {
    const token = tokens[idx]
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
    const lang = info.split(/\s+/)[0] ?? ''
    const label = codeLanguageLabel(lang) ?? (lang ? lang : '')
    const copy = env?.copyLabel ?? 'Copy'
    const copied = env?.copiedLabel ?? copy
    const esc = md.utils.escapeHtml
    return (
      '<div class="chat-code">' +
      '<div class="chat-code-head">' +
      `<span class="chat-code-lang">${esc(label)}</span>` +
      `<span class="chat-code-copy" role="button" tabindex="0" data-copied="${esc(copied)}">${esc(copy)}</span>` +
      '</div>' +
      `<pre><code class="hljs">${highlightCode(token.content, lang)}</code></pre>` +
      '</div>\n'
    )
  }
}

/** Code-Text aus den Zeilen-Spans zurückgewinnen — `textContent` allein verlöre die Umbrüche. */
function codeTextOf(block: Element): string {
  const lines = block.querySelectorAll('.code-line')
  if (lines.length === 0) return block.querySelector('code')?.textContent ?? ''
  return Array.from(lines, l => l.textContent ?? '').join('\n')
}

/** Klick-Behandlung für den Kopieren-Knopf; true, wenn der Klick dem Knopf galt. */
export function handleChatCodeCopy(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const btn = target.closest('.chat-code-copy')
  if (!btn) return false
  const block = btn.closest('.chat-code')
  if (!block) return true
  const text = codeTextOf(block)
  if (!text) return true
  const original = btn.textContent
  void writeClipboardText(text).then(() => {
    btn.textContent = btn.getAttribute('data-copied') ?? original
    btn.classList.add('copied')
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied') }, 1500)
  }).catch(() => {})
  return true
}
