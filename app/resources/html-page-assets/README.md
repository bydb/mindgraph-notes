# HTML-Page-Assets (write_html / Notiz-Agent)

Statische Assets, die der Notiz-Agent beim Übernehmen einer mit `write_html`
erzeugten Seite als `mindgraph-assets/` neben die HTML-Datei kopiert
(`main/noteAgent/htmlAssets.ts`). Die Seiten bleiben dadurch vollständig
offline — kein CDN, funktioniert in der sandboxed HTML-Vorschau.

## katex/

KaTeX v0.16.47 (MIT, siehe LICENSE) — unverändert aus `node_modules/katex/dist`
kopiert: `katex.min.js`, `katex.min.css`, `auto-render.min.js`
(= `contrib/auto-render.min.js`), `fonts/*.woff2` (nur woff2 — Chromium lädt
ausschließlich diese Variante aus der Fallback-Kette der CSS).

Beim KaTeX-Update in package.json: Dateien hier neu kopieren **und die Version
in dieser Datei sowie in `CLAUDE.md` mitziehen** — beide standen bis 07/2026 auf
0.16.27, während hier real 0.16.43 lag. Die tatsächliche Version steht in
`katex.min.css` (`.katex-version:after`).
