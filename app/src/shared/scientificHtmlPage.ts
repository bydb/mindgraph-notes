// Wissenschaftliches HTML-Seiten-Template für das write_html-Tool des Notiz-Agenten
// (Entscheidung 11: das LLM liefert nur Inhalt — Titel + Body-HTML mit LaTeX/SVG —
// deterministischer Code baut das Dokument).
//
// Die erzeugte Seite ist vollständig offline: KaTeX (JS/CSS/Fonts) wird relativ aus
// `mindgraph-assets/katex/` neben der HTML-Datei geladen — kein CDN, funktioniert in
// der sandboxed HTML-Vorschau (CSP ohne externe Hosts) und in jedem Browser. Die
// Assets kopiert der Accept-Handler beim Übernehmen (main/noteAgent/htmlAssets.ts).
//
// LaTeX bleibt als Quelltext in der Datei ($$…$$ / \(…\)) und wird client-seitig von
// KaTeX auto-render gerendert — die Seite bleibt damit im Code-Editor editierbar.

/** Ordnername der Seiten-Assets neben der HTML-Datei (Kopierziel im Accept-Handler). */
export const HTML_PAGE_ASSETS_DIRNAME = 'mindgraph-assets'

export interface ScientificHtmlPageOptions {
  title: string
  /** Artikel-Inhalt (ohne <html>/<head>/<body> und ohne <h1> — der Titel kommt aus `title`). */
  bodyHtml: string
  /** 'de' (Default) oder 'en' — steuert lang-Attribut und Beschriftungen (Abbildung/Figure). */
  lang?: string
}

/** Grobe Erkennung vollständiger Dokumente — write_html erwartet NUR Body-Inhalt. */
export function looksLikeFullHtmlDocument(bodyHtml: string): boolean {
  return /<\s*(!doctype|html|head|body)\b/i.test(bodyHtml)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildScientificHtmlPage(options: ScientificHtmlPageOptions): string {
  const lang = options.lang?.toLowerCase().startsWith('en') ? 'en' : 'de'
  const figureLabel = lang === 'en' ? 'Figure' : 'Abbildung'
  const title = escapeHtml(options.title.trim())
  const assets = HTML_PAGE_ASSETS_DIRNAME

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>

<!-- KaTeX: lokal, relativ zur HTML-Datei — kein CDN, die Seite bleibt offline. -->
<link rel="stylesheet" href="${assets}/katex/katex.min.css">
<script defer src="${assets}/katex/katex.min.js"></script>
<script defer src="${assets}/katex/auto-render.min.js"></script>

<style>
  :root {
    --bg: #ffffff;
    --fg: #1a1a1a;
    --muted: #5a6270;
    --rule: #d8dce2;
    --accent: #0b6e6e;
    --accent-soft: #e5f1f1;
    --fig-line: #0b6e6e;
    --fig-line-2: #b05a1e;
    --fig-grid: #e3e7ec;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16181c;
      --fg: #e8e6e1;
      --muted: #9aa3af;
      --rule: #33383f;
      --accent: #4fb3ab;
      --accent-soft: #1e2a2a;
      --fig-line: #4fb3ab;
      --fig-line-2: #d98e4a;
      --fig-grid: #2a2f36;
    }
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: Charter, "Bitstream Charter", Georgia, "Times New Roman", serif;
    font-size: 1.075rem;
    line-height: 1.65;
  }
  article {
    max-width: 46rem;
    margin: 0 auto;
    padding: 3rem 1.5rem 5rem;
    counter-reset: equation figure;
  }

  header.paper h1 {
    font-size: 1.9rem;
    line-height: 1.25;
    margin: 0 0 0.75rem;
    letter-spacing: -0.01em;
  }
  .byline { color: var(--muted); font-size: 0.95rem; margin: 0 0 0.15rem; }
  .byline .author { color: var(--fg); font-variant: small-caps; letter-spacing: 0.03em; }

  .abstract {
    margin: 2rem 0 2.5rem;
    padding: 1rem 1.25rem;
    background: var(--accent-soft);
    border-left: 3px solid var(--accent);
    font-size: 0.98rem;
  }
  .abstract h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 0.4rem; color: var(--accent); }
  .abstract p { margin: 0; }

  section > h2 { font-size: 1.35rem; margin: 2.5rem 0 0.75rem; letter-spacing: -0.005em; }
  section > h3 { font-size: 1.1rem; margin: 1.75rem 0 0.5rem; }
  p { margin: 0 0 1rem; }
  a { color: var(--accent); }

  /* Nummerierte Display-Gleichung: <div class="equation">$$ … $$</div> */
  .equation {
    position: relative;
    counter-increment: equation;
    margin: 1.25rem 0;
    overflow-x: auto;
  }
  .equation::after {
    content: "(" counter(equation) ")";
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    font-size: 0.95rem;
  }
  .equation .katex-display { margin: 0; padding-right: 3.5rem; }

  /* Nummerierte Abbildung: <figure class="fig"><svg …>…</svg><figcaption>…</figcaption></figure> */
  figure.fig {
    counter-increment: figure;
    margin: 2rem 0;
  }
  figure.fig svg { width: 100%; height: auto; display: block; }
  figure.fig figcaption {
    margin-top: 0.6rem;
    font-size: 0.9rem;
    color: var(--muted);
  }
  figure.fig figcaption::before {
    content: "${figureLabel} " counter(figure) ": ";
    font-weight: 600;
    color: var(--fg);
  }

  .table-wrap { overflow-x: auto; margin: 1.5rem 0; }
  table { border-collapse: collapse; width: 100%; font-size: 0.95rem; }
  caption { caption-side: top; text-align: left; font-size: 0.9rem; color: var(--muted); padding-bottom: 0.5rem; }
  th, td { padding: 0.45rem 0.75rem; text-align: left; }
  thead th { border-bottom: 2px solid var(--fg); font-weight: 600; }
  tbody tr:not(:last-child) td { border-bottom: 1px solid var(--rule); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

  section.references ol { padding-left: 1.5rem; font-size: 0.95rem; }
  section.references li { margin-bottom: 0.5rem; }
  sup.cite a { text-decoration: none; font-size: 0.8em; }

  blockquote {
    margin: 1.25rem 0;
    padding: 0.25rem 1.25rem;
    border-left: 3px solid var(--rule);
    color: var(--muted);
  }
  code, pre {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.88em;
  }
  pre {
    padding: 0.75rem 1rem;
    background: var(--accent-soft);
    overflow-x: auto;
  }

  @media print {
    body { font-size: 10.5pt; }
    article { max-width: none; padding: 0; }
    .abstract { background: none; }
  }
</style>
</head>
<body>
<article>
  <header class="paper">
    <h1>${title}</h1>
  </header>
${options.bodyHtml}
</article>

<script>
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof renderMathInElement !== 'function') return;
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\\\[', right: '\\\\]', display: true },
        { left: '\\\\(', right: '\\\\)', display: false }
      ],
      throwOnError: false
    });
  });
</script>
</body>
</html>
`
}
