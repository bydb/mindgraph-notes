import type TurndownService from 'turndown'

// WYSIWYG-Roundtrip-Regel für Code-Blöcke (Lesen-Modus → turndown → Markdown).
//
// Der Lesen-Modus rendert Code-Blöcke über `wrapLines()` (highlightSetup.ts):
// jede Zeile wird für CSS-Counter-Zeilennummern in ein <span class="code-line">
// gewickelt und OHNE \n gejoint — im DOM existieren die Zeilenumbrüche also
// nicht mehr. Turndowns eingebaute Fenced-Code-Regel nimmt schlicht den
// textContent → alle Code-Zeilen kleben in EINER Zeile (stille Datenkorruption
// bei jedem Speichern im Lesen-Modus; real zerschlagen: der
// ```email-relevance-config```-Block der Email-Instruktionen, 2026-07-02).
//
// Diese Regel rekonstruiert die Zeilen aus den .code-line-Spans. Für fremdes
// HTML ohne solche Spans (Paste, Altbestand) fällt sie auf textContent zurück
// und verhält sich wie die eingebaute Regel.
export const renderedCodeBlockRule: TurndownService.Rule = {
  filter: (node) =>
    node.nodeName === 'PRE' &&
    Array.from(node.childNodes).some((child) => child.nodeName === 'CODE'),

  replacement: (_content, node) => {
    const pre = node as HTMLElement
    const code = Array.from(pre.children).find((child) => child.nodeName === 'CODE')
    if (!code) return ''

    const langMatch = (code.getAttribute('class') || '').match(/language-(\S+)/)
    const lang = langMatch ? langMatch[1] : ''

    const lineSpans = Array.from(code.children).filter(
      (child) => child.nodeName === 'SPAN' && child.classList.contains('code-line')
    )
    const text = (lineSpans.length > 0
      ? lineSpans.map((line) => line.textContent ?? '').join('\n')
      : code.textContent ?? ''
    ).replace(/\n+$/, '')

    // Fence muss länger sein als jede Backtick-Folge im Inhalt.
    let fenceLength = 3
    for (const match of text.matchAll(/`+/g)) {
      fenceLength = Math.max(fenceLength, match[0].length + 1)
    }
    const fence = '`'.repeat(fenceLength)

    return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`
  }
}
