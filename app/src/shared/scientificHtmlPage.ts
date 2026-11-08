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

import { buildProvenanceMetaTag, buildProvenanceFooterHtml } from './aiProvenance'

/** Ordnername der Seiten-Assets neben der HTML-Datei (Kopierziel im Accept-Handler). */
export const HTML_PAGE_ASSETS_DIRNAME = 'mindgraph-assets'

export interface ScientificHtmlPageOptions {
  title: string
  /** Artikel-Inhalt (ohne <html>/<head>/<body> und ohne <h1> — der Titel kommt aus `title`). */
  bodyHtml: string
  /** 'de' (Default) oder 'en' — steuert lang-Attribut und Beschriftungen (Abbildung/Figure). */
  lang?: string
  /**
   * KI-Provenienz: erzeugendes Modell. HTML kann kein YAML-Frontmatter tragen, deshalb
   * wandert die Kennzeichnung hier in ein `<meta name="ki-modell">` plus eine sichtbare
   * Fußzeile. Leer/weggelassen → Seite bleibt unmarkiert (nicht falsch markiert).
   */
  aiModel?: string
  /**
   * Hausdesign (docs/codex-collab/skill-builder-hausdesign.md F07/F08/F12): Farben je Rolle und Modus,
   * optional ein Logo als RELATIVER Pfad (inhaltsadressiert, beim Übernehmen neben die Seite kopiert).
   * Der Stilblock steht NACH dem Artikelinhalt — er gewinnt gegen einen beim Überarbeiten
   * wiederhergestellten Quellstil (Nutzerentscheidung: aktives Hausdesign hat Vorrang).
   */
  brand?: HtmlBrand
}

export interface HtmlBrand {
  name: string
  text: string
  tint: string
  line2: string
  darkText: string
  darkTint: string
  darkLine2: string
  logoSrc?: string
  logoWidth?: number
  logoHeight?: number
}

export const HTML_BRAND_STYLE_ID = 'mg-hausdesign'

const HEX6 = /^#[0-9a-fA-F]{6}$/

function brandStyleBlock(b: HtmlBrand): string {
  const ok = [b.text, b.tint, b.line2, b.darkText, b.darkTint, b.darkLine2].every(c => HEX6.test(c))
  if (!ok) return ''
  return `<style id="${HTML_BRAND_STYLE_ID}">
  :root { --accent: ${b.text}; --accent-soft: ${b.tint}; --fig-line: ${b.text}; --fig-line-2: ${b.line2}; }
  @media (prefers-color-scheme: dark) {
    :root { --accent: ${b.darkText}; --accent-soft: ${b.darkTint}; --fig-line: ${b.darkText}; --fig-line-2: ${b.darkLine2}; }
  }
  header.paper .brand-logo { display: block; max-height: 64px; max-width: 260px; width: auto; height: auto; margin: 0 0 1.25rem; }
  @media (prefers-color-scheme: dark) { header.paper .brand-logo { background: #ffffff; padding: 6px 10px; border-radius: 6px; } }
  @media print { header.paper .brand-logo { max-height: 18mm; } }
</style>`
}

/** Nur relative, unverdächtige Logo-Pfade (kein Schema, kein ..). */
function safeLogoSrc(src: string | undefined): string | null {
  if (!src) return null
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(src) || src.includes('..')) return null
  return src
}

/** Grobe Erkennung vollständiger Dokumente — write_html erwartet NUR Body-Inhalt. */
export function looksLikeFullHtmlDocument(bodyHtml: string): boolean {
  return /<\s*(!doctype|html|head|body)\b/i.test(bodyHtml)
}

// Selbstheilung für Modelle, die den Body-only-Kontrakt ignorieren und ein komplettes
// Dokument liefern (real aufgetreten mit GLM 5.2): Artikel-Inhalt aus dem Gerüst ziehen
// statt ablehnen — jede Ablehnung kostet eine volle Neu-Generierung der Seite und damit
// eine Loop-Iteration. null = nichts Brauchbares extrahierbar (dann greift die Ablehnung).
/**
 * Der vom Modell VERFASSTE Teil einer Seite, die aus buildScientificHtmlPage stammt —
 * also genau das, was write_html als `body_html` wieder entgegennimmt.
 *
 * Warum eigens: `extractArticleBody` liefert den ganzen <body> und damit auch das
 * Gerüst, das die App selbst beisteuert — <article>, die Titel-Kopfzeile und die
 * KI-Fußzeile. Wird eine erzeugte Seite so wieder angehängt und korrigiert, schreibt
 * das Modell dieses Gerüst mit zurück, die App wickelt es ein zweites Mal ein, und in
 * der neuen Datei steht ein </article> ohne Partner (real aufgetreten, 01.09.2026).
 *
 * Gibt null zurück, wenn die Seite nicht aus diesem Template stammt — dann bleibt der
 * Aufrufer bei extractArticleBody bzw. beim Rohtext.
 */
export function extractAuthoredBodyHtml(html: string): string | null {
  const article = html.match(/<article[^>]*>([\s\S]*)<\/article>/i)
  if (!article) return null
  let inner = article[1]
  // Kopfzeile der App (<header class="paper"><h1>…</h1></header>) am Anfang entfernen.
  inner = inner.replace(/^\s*<header class="paper">[\s\S]*?<\/header>/i, '')
  // KI-Fußzeile am Ende entfernen — sie wird beim nächsten Schreiben neu gesetzt.
  inner = inner.replace(/<footer class="ai-provenance">[\s\S]*?<\/footer>\s*$/i, '')
  // Hausdesign-Stil der App — wird beim nächsten Schreiben neu gesetzt.
  inner = inner.replace(new RegExp(`<style id="${HTML_BRAND_STYLE_ID}">[\\s\\S]*?<\\/style>`, 'gi'), '')
  const trimmed = inner.trim()
  return trimmed ? trimmed : null
}

export function extractArticleBody(html: string): string | null {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const inner = bodyMatch
    ? bodyMatch[1]
    : html
        .replace(/<!doctype[^>]*>/gi, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<\/?(?:html|body)[^>]*>/gi, '')
  const trimmed = inner.trim()
  return trimmed && !looksLikeFullHtmlDocument(trimmed) ? trimmed : null
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

  // KI-Provenienz: maschinenlesbar im <meta>, sichtbar als Fußzeile. Ohne Modell
  // bleibt beides leer — eine Seite unmarkiert zu lassen ist besser, als sie falsch
  // zu kennzeichnen.
  const aiModel = (options.aiModel || '').trim()
  const aiMeta = aiModel ? `\n${buildProvenanceMetaTag(aiModel)}` : ''
  const aiFooter = aiModel ? `  ${buildProvenanceFooterHtml(aiModel, lang)}\n` : ''
  const brandStyle = options.brand ? brandStyleBlock(options.brand) : ''
  const logoSrc = options.brand ? safeLogoSrc(options.brand.logoSrc) : null
  const logoDims = options.brand?.logoWidth && options.brand?.logoHeight
    ? ` width="${Math.round(options.brand.logoWidth)}" height="${Math.round(options.brand.logoHeight)}"` : ''
  const logoImg = logoSrc && options.brand
    ? `\n    <img class="brand-logo" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(options.brand.name)}"${logoDims}>` : ''

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>${aiMeta}

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
  /* Erzeugte Bilder (generate_image) liegen neben der Seite und kommen in Originalgröße
     (1K breit) — ohne diese Regel sprengt eines davon die Textspalte. */
  figure.fig img { width: 100%; height: auto; display: block; }
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

  .ai-provenance {
    margin-top: 3rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--rule);
    color: var(--muted);
    font-size: 0.8rem;
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
  <header class="paper">${logoImg}
    <h1>${title}</h1>
  </header>
${options.bodyHtml}
${brandStyle ? brandStyle + '\n' : ''}${aiFooter}</article>

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
