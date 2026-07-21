# Excalidraw-Plugin — Idee & Machbarkeits-Einschätzung

> **Status: Idee / Machbarkeits-Prüfung.** Kein Beschluss, kein Termin. Diese Datei
> festigt die Einschätzung, damit sie nicht verloren geht. Sie ist eine ehrliche
> Analyse gegen das existierende Plugin-System — keine Bau-Anleitung.

## Was das Plugin bringen würde

Integration von [Excalidraw](https://excalidraw.com/) — dem handgezeichneten Whiteboard-Tool —
als vollwertigen Zeichen-Editor in MindGraph. Konkret:

- **`.excalidraw`-Dateien** im Vault speichern und bearbeiten
- **Zeichnungen in Markdown einbetten** — `![[meine-skizze.excalidraw]]` wird als SVG/PNG gerendert
- **Export** als PNG/SVG/PDF
- Optional später: bidirektionale Links, Template-Library, Script-Engine

Referenz: [zsviczian/obsidian-excalidraw-plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin)
(7.2k Stars, ~2.800 Commits, extrem feature-reich). Der Kern ist: *dateibasierter
Zeichen-Editor + Markdown-Embed*.

## Architektonische Passung ins Plugin-System

Fast ideal. Excalidraw ist der harmloseste Plugin-Fall überhaupt — **100% lokal, kein Netzwerk,
keine Credentials, kein natives Modul**.

| Aspekt | Passt? | Begründung |
|---|:---:|---|
| Vertikaler Ordner `src/plugins/excalidraw/` | ✅ | Manifest, Main, Renderer, Service — wie Antares/edoobox |
| Capabilities | ✅ | Nur `vault.read` + `vault.write`. Keine `secrets`, kein `http.fetch` |
| Settings-Slot | ✅ | `settings.section` existiert schon |
| Sidebar/Panel-Slot | ✅ | `sidebar.panel.*` existiert (reMarkable nutzt ihn) |
| Datei-Handling | ✅ | `vault.read`/`vault.write` durch `writeFileSafe`/`assertSafePath` |
| Deletion Test | ✅ | Ordner löschen → Feature restlos weg |

## Harte Stellen (ehrlich)

### 1. Markdown-Embed-Render-Pipeline ist noch nicht plugin-fähig ⚠️ Hauptbrocken

MindGraph rendert `![[bild.png]]` über eine **feste Pipeline** (`parseObsidianEmbedSyntax`
in `utils/imageUtils.ts` → `decorators.ts` → `MarkdownEditor.tsx`). Es gibt **keinen Slot**,
an dem ein Plugin sagen kann: *"Wenn du `![[foo.excalidraw]]` triffst, frag mich — ich render
dir das als SVG."*

Das Obsidian-Plugin hoakt sich in den Markdown-Renderer ein und ersetzt `.excalidraw`-Embeds
durch gerenderte Bilder. Bei MindGraph müsste man dafür **erst einen neuen Slot-Typ erfinden**:
etwa `markdown.embed.renderer` mit Dateiendungs-Matching. Das ist eine **Kern-Erweiterung**,
kein reines Plugin — Voraussetzung für alles Weitere.

### 2. Excalidraw ist eine schwere React-Abhängigkeit

`@excalidraw/excalidraw` ist groß (~1-2 MB gebündelt), zieht React mit, hat eigene
Font-Assets. Das Plugin-System nutzt `import.meta.glob` zur Build-Zeit — funktioniert, aber
der Bundle wächst spürbar. Das Obsidian-Plugin löst das teilweise mit dynamischem `eval()`
und lazy-Loads, was bei MindGraphs Sicherheitsmodell (Phase 1: ESLint-Wall, kein `eval`)
der Punkt ist, wo man kreativ werden muss. Lazy-Load via dynamischem `import()` geht,
`eval()` nicht.

### 3. Editor-Integration (CodeMirror vs. Excalidraw-Canvas)

Im Obsidian-Plugin öffnet ein Klick auf ein Embed den Excalidraw-Editor *in* der Notiz.
Bei MindGraph zwei Optionen:

- **Eigener Tab** (`TabType: 'excalidraw'`) — sauberer, aber Bruch mit dem
  "alles in der Notiz"-Gefühl. Empfohlen für MVP.
- **Inline in CodeMirror** — technisch sehr aufwendig. CodeMirror 6 ist ein eigener
  Editor, Excalidraw ein eigener Canvas. Die zwei zu verschmelzen ist eine eigene kleine
  Hölle. Vertagt.

## Grobe Aufwandsschätzung (MVP)

| Schritt | Was | Schätzung |
|---|---|---|
| **1** | Embed-Render-Slot im Kern: neuer Slot-Typ `markdown.embed.renderer` + Dateiendungs-Dispatch | ~1-2 Tage |
| **2** | Excalidraw-Plugin selbst: Manifest, Main, Renderer, SVG/PNG-Export via headless Render | ~3-5 Tage |
| **3** | Editor-Integration (eigener Tab als MVP) | ~1-3 Tage |

**MVP-Ziel:** Zeichnung erstellen → im Vault speichern → als `![[drawing.excalidraw]]`
einbetten → als SVG rendern. Die vollen Obsidian-Features (Script-Engine, AI, bidirektionale
Links, Templates) sind dann optionale Erweiterungen oben drauf.

## Abhängigkeit von Plugin-System-Reifegrad

Das Plugin-System ist aktuell in **Phase 1** (Capability-Host, gebündelte First-Party-Plugins).
Das Excalidraw-Plugin ist ein First-Party-Kandidat — es braucht **keine** Prozess-Isolation
oder einen Plugin-Store. Es kann als gebündeltes Plugin gebaut werden, sobald:

- [x] Plugin-Registry + Lebenszyklus stehen (✅ umgesetzt)
- [x] Capability-Host steht (✅ umgesetzt)
- [x] Renderer-Slot-Mechanik steht (✅ umgesetzt)
- [ ] **Embed-Render-Slot** im Kern existiert (❌ — siehe harte Stelle 1)

Der Engpass ist nicht das Plugin-System, sondern die Markdown-Render-Pipeline.

## Zwischenlösung: Hermes-Excalidraw-Skill

Unabhängig vom Plugin hat Hermes bereits einen `excalidraw`-Skill: erzeugt
Excalidraw-JSON-Diagramme aus Beschreibungen. Für *einzelne* Skizzen in Notizen kann das
heute schon eine `.excalidraw`-Datei generieren, die manuell in den Vault gelegt wird. Kein
vollständiger Editor, aber für "schnell eine Architektur-Skizze" ausreichend, bis das echte
Plugin steht.

---

*Erstellt: 2026-06-28. Einschätzung gegen Plugin-System-Stand v0.8.14.*
