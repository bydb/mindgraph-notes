---
paths:
  - "app/src/renderer/components/Editor/**"
  - "app/src/renderer/components/CodeViewer/**"
  - "app/src/shared/htmlPreview*"
  - "app/src/main/htmlExport*"
  - "app/src/shared/epub*"
  - "app/src/renderer/utils/inNoteSearch*"
  - "app/src/renderer/utils/linkExtractor*"
  - "app/src/renderer/utils/wysiwyg*"
---

# Editor (CodeMirror) und HTML-Vorschau

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## Editor (CodeMirror 6)

Extensions liegen in `Editor/extensions/`:
- `languageTool/` – Grammatik/Rechtschreibprüfung (LanguageTool API)
- `dataview/` – Dataview-Abfragen
- `livePreview/` – Live Preview (Decorators, Widgets, Theme)
- `imageHandling.ts` – Drag & Drop Bilder
- `markdownFolding.ts` – Faltbare Code-Blöcke, Callouts, Frontmatter

Click-Handler für Decorations: `view.posAtCoords()` + StateField-Lookup nutzen (kein DOM-Traversal mit `closest()`).

## HTML-Vorschau im Code-Editor (`mindgraph-preview://`)
- `.html`/`.htm`-Dateien öffnen im CodeViewer standardmäßig als **Vorschau** (sandboxed `<iframe>`), Toggle Vorschau/Code + Neu-laden im Header.
- **Single-Source**: `shared/htmlPreview.ts` — URL-Builder (Renderer), Pathname→FS-Mapping + MIME-Map + `PREVIEW_DOCUMENT_CSP` (Main). Unit-Tests in `shared/htmlPreview.test.ts`.
- **Custom-Protocol** `mindgraph-preview://vault/<absoluter Pfad>` in `main/index.ts` (`registerHtmlPreviewProtocol`): jeder Request läuft durch `assertSafePath` — gleiche Sicherheitsenvelope wie die FS-IPC-Handler. Scheme-Registrierung (`registerSchemesAsPrivileged`) MUSS vor `app.ready` bleiben. Relative Ressourcen (CSS/JS/Bilder neben der HTML-Datei) funktionieren über normale URL-Auflösung.
- **Vorschau bleibt offline**: HTML-Antworten bekommen eine CSP ohne externe Hosts (Inline-Skripte/-Styles erlaubt). iframe-Sandbox OHNE `allow-same-origin` (opaque Origin). `target=_blank`-Links landen via `setWindowOpenHandler` im System-Browser; normale externe Navigation ist CSP-geblockt (bewusst — echter Browser-Tab wäre ein eigenes Feature via `WebContentsView`).
- **Bekannte Grenzen**: `fetch()`/ES-Module-Scripts aus der Vorschau-Seite scheitern an CORS (opaque Origin), `localStorage` wirft in der Sandbox — Standalone-Seiten mit klassischen Inline-Skripten sind der Zielfall. `webviewTag: false` bleibt unangetastet.
- **PDF-/EPUB-Export**: Buttons im Code-Editor-Header (IPC `html-preview-export` → `main/htmlExport.ts`). Rendert die Seite in einem versteckten Fenster über dasselbe Protokoll — KaTeX ist beim Export bereits fertig gerendert. PDF via `printToPDF` (A4); EPUB serialisiert das gerenderte DOM als XHTML (`XMLSerializer`, Skripte entfernt) und bettet Stylesheets + lokale Fonts/Bilder ein. Pure EPUB-Assembly (container/opf/nav/content, CSS-url-Rewriting) in `shared/epub.ts` mit Unit-Tests.
- **Font-Loads aus CSS (`@font-face`) funktionieren** trotz opaque Origin — empirisch verifiziert mit den KaTeX-woff2 (write_html-Feature). Chromium erzwingt hier kein CORS gegen das Custom-Scheme.
