---
paths:
  - "app/src/plugins/remarkable/**"
  - "app/src/main/plugins/nativeServices.ts"
  - "MindGraph-reMarkable-Integration.md"
---

# reMarkable-Integration

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## reMarkable-Integration (USB)

- USB-Verbindung über `http://10.11.99.1` (reMarkable "USB web interface")
- Plugin `app/src/plugins/remarkable/` (`service.ts`, `transports/usb.ts`, `types.ts`, `pdfReflow.ts`, `pdfCheck.ts`, `importNote.ts`); die Buch-CSS (`buildBookHtml`) liegt in `main/index.ts` des Plugins, gedruckt wird über die Host-Fähigkeit `host.pdf.htmlToPdf` (`app/src/main/plugins/nativeServices.ts`, eigener `BrowserWindow` + `printToPDF`)
- Plugin-Aktionen (`actions.register` in `plugins/remarkable/main/index.ts`, keine eigenen IPC-Handler mehr im Kern):
  - `remarkable.usbCheck`
  - `remarkable.usbDebugInfo`
  - `remarkable.listDocuments`
  - `remarkable.download`
  - `remarkable.upload`
  - `remarkable.optimize`
  - `remarkable.bookify`
- Renderer-UI: `app/src/plugins/remarkable/renderer/RemarkablePanel.tsx`
- Features: Dokumente browsen/importieren, PDF exportieren, **Optimieren + Export** (Ghostscript/qpdf Fallback), **Als Buch + Export** (Reflow)
- Stabilität: Upload-Flow enthält Reachability-Checks + Retry-Logik (wichtig für reMarkable Paper Move)
- Branding: reMarkable-Logo in `app/src/renderer/assets/remarkable-logo.png`

## reMarkable-Buch-Lesemodus (große Schrift wie auf einem Kindle)
- **Problem**: Der reMarkable-Schirm ist physisch schmaler (157 mm) als A4 (210 mm). Ein A4-PDF auf das Gerät zu legen macht den Text **kleiner**, und reMarkable kann PDF-Text nicht reflowen/vergrößern. Reines PDF-Umlayouten (Skalieren/Schneiden) löst das NICHT — es schrumpft. Nur echtes Reflow (Zeilen neu umbrechen) vergrößert.
- **Geräteseite**: reMarkable 2 = 1404×1872 px @ 226 dpi = **157×210 mm**. Gesetzt via CSS `@page { size: 157mm 210mm; margin: 0 }` + `printToPDF({ preferCSSPageSize: true })`. **NICHT** über das `pageSize`-Objekt: Electron 40 interpretiert dessen Zahlen fälschlich als Zoll (157000 → 11,3 Mio pt Riesenseite → Inhalt in winziger Ecke → scheinbar leere Seite). Die Typings-Doku („microns") ist falsch. Nach `loadFile` auf `document.fonts.ready` + ein `requestAnimationFrame` warten, sonst erfasst printToPDF gelegentlich eine leere Seite.
- **Weg A — eigene Notizen** (`export-pdf` mit `pdfStyle: 'remarkable-book'`): rendert frisch aus dem Markdown in Gerätegröße, Serifenschrift 17pt, line-height 1.7, breite Ränder, reines Schwarz. Kommt als Override-`<style>` NACH dem Standard-Style (Kaskade). Zweiter „reMarkable"-Button neben „PDF" im Editor (`MarkdownEditor.tsx` `handleExportPDF('remarkable-book')`).
- **Weg B — externe PDFs/Paper** (Aktion `remarkable.bookify`): `pdfReflow.ts` extrahiert Text via **pdfjs-dist** (legacy-ESM-Build, `await import('pdfjs-dist/legacy/build/pdf.mjs')` — externalisiert, NICHT gebündelt, sonst crasht `new DOMMatrix()` beim Init im Node-Kontext) → Zeilen über `hasEOL`/y rekonstruieren → Absätze umbrechen (weiche Silbentrennung am Zeilenende zusammenziehen, Kopf-/Fußzeilen über Wiederholungs-Heuristik entfernen, Überschriften per Schrifthöhe). Das Plugin baut das HTML mit derselben Buch-CSS, `host.pdf.htmlToPdf` im Kern macht daraus PDF-Bytes, Ausgabe `<name>.remarkable.pdf`, dann Upload.
- **Annahme/Grenze**: Reflow geht von **einspaltigen** Dokumenten aus. Abbildungen, Formeln und exaktes Layout gehen verloren (reiner Text). Zweispaltige Journals werden verschachtelt — bewusst nicht gelöst (bräuchte Spaltenerkennung wie k2pdfopt). Bei gescannten Bild-PDFs ohne Textebene bricht der Handler mit Hinweis ab (`charCount < 40`).
- **k2pdfopt bewusst NICHT genutzt**: kein Homebrew-Formula, nur unsigniertes Fremd-Binary → Gatekeeper/Notarisierungs-Problem für die verteilte App. Reflow via pdfjs ist dependency-frei und bündelt.
