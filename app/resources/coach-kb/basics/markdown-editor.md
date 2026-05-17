---
id: basics-markdown-editor
keywords: [markdown, editor, modus, modi, ansicht, ansichten, schreiben, lesen, preview, vorschau, split, syntax, formatieren, anfänger, grundlagen, basics, wysiwyg]
suggestsModules: []
suggestsWidgets: []
---

# Markdown und die drei Editor-Modi

## Was ist Markdown?

Markdown ist eine einfache Textauszeichnung. Du schreibst normalen Text und
ergänzt wenige Sonderzeichen für Struktur:

- `# Titel` → Überschrift
- `**fett**` → **fett**
- `*kursiv*` → *kursiv*
- `- Eintrag` → Liste
- `- [ ] Aufgabe` → Checkbox-Aufgabe (von MindGraph als Task erkannt)
- `[[Andere Notiz]]` → Wikilink auf eine andere Notiz im Vault
- `[Text](https://…)` → externer Link
- `> Zitat` → Zitat-Block
- ` ```js ` → Code-Block mit Sprache

Frontmatter am Datei-Anfang (zwischen `---`-Zeilen) liefert Metadaten:
```yaml
---
title: Meine Notiz
tags: [projekt, schule]
category: red
---
```

## Die drei Editor-Modi — EXAKT diese drei, keine anderen

MindGraph hat **genau drei Ansichten** für dieselbe Markdown-Notiz. Es gibt
**KEINEN** Split-Modus, **KEINE** separate "Vorschau" daneben, **KEIN**
zweispaltiges Layout. Die drei Modi heißen:

| Interner Name | Deutsches UI-Label | Englisches UI-Label |
|---|---|---|
| `edit` | **Markdown** | **Markdown** |
| `live-preview` | **Schreiben** | **Live-Preview** |
| `preview` | **Lesen** | **Reading** |

Du wechselst pro Notiz oben rechts zwischen ihnen — und kannst einen
**Default** wählen, der beim Öffnen einer Notiz greift (Settings → Editor →
"Default-Ansicht").

### 1. Markdown (`edit`)
Reiner Quelltext mit Syntax-Highlighting. Du siehst genau die Zeichen, die in
der Datei stehen — `**fett**` bleibt als `**fett**` sichtbar. Beste Wahl,
wenn du komplexes Markdown schreibst, Tabellen baust oder die Datei
inspizieren willst.

### 2. Schreiben (`live-preview`)
Live-Preview im selben Editorbereich: Markdown-Syntax wird *gerendert*,
während du tippst. `**fett**` erscheint sofort **fett**, Wikilinks werden
blau verlinkt, Headings groß. Cursor-Position zeigt die rohe Syntax —
sobald du wegklickst, wird der Bereich gerendert. Das ist der Standard
fürs Editieren. **Kein zweites Panel** — Quelle und Vorschau teilen sich
denselben Bereich.

### 3. Lesen (`preview`)
Vollständige WYSIWYG-Ansicht — Markdown ist unsichtbar, du siehst die fertige
Notiz wie ein Dokument. Du kannst **trotzdem direkt editieren** (Inline-
Editing), die Änderungen werden via Turndown zurück in Markdown geschrieben.
Default beim Öffnen einer Notiz — passt zum "90% Lesen / 10% Editieren"-
Workflow.

## Welche Default-Ansicht passt zu wem?

- **Anfänger / Lesen-fokussiert**: `preview` (Lesen). Du siehst die Notiz wie
  ein fertiges Dokument und kannst direkt drüber tippen.
- **Aktiv Schreibende**: `live-preview` (Schreiben). Du tippst Markdown, siehst
  aber sofort wie es aussieht.
- **Power-User / Plain-Text-Liebhaber**: `edit` (Markdown). Volle Kontrolle,
  kein Render-Overhead, Syntax immer sichtbar.

Faustregel: wenn du nicht sicher bist, nimm `live-preview` (Schreiben) — das
ist der Best-Compromise zwischen Lesbarkeit und Editier-Komfort.

## Häufige Verwechslungen

- "Split-View" gibt es **nicht** als Editor-Modus. Wenn du zwei Notizen
  nebeneinander willst, ist das die **Editor-Split-Ansicht** in der Tab-
  Leiste (⌘ + 2), nicht ein Markdown-Modus.
- Die Begriffe "Vorschau" und "Preview" beziehen sich auf den **Lesen-Modus**
  (`preview`), **nicht** auf ein separates Panel.
