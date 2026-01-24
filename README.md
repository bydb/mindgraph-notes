# MindGraph Notes

**Die erste Notiz-App mit integriertem KI-Terminal.**

Eine moderne, lokale Notiz-App die Markdown-Notizen mit einem Wissensgraphen und einem vollwertigen Terminal kombiniert. Nutze OpenCode, Ollama und andere CLI-Tools direkt neben deinen Gedanken.

[Website](https://mindgraph-notes.de) · [Download](https://mindgraph-notes.de/#download) · [Blog](https://mindgraph-notes.de/blog/) · [Discord](https://discord.gg/u9N9R9vz)

---

## Features

### Integriertes Terminal
- Vollwertiges Terminal direkt in der App
- OpenCode für KI-gestützte Workflows
- Lokale LLMs via Ollama, LM Studio
- Git, npm, Python - jedes CLI-Tool
- Direkter Zugriff auf deine Markdown-Dateien

### Wissensgraph
- Interaktive Visualisierung aller Verbindungen
- Entdecke versteckte Zusammenhänge
- Navigiere durch dein Wissen

### Notizen & Markdown
- Live Preview mit sofortiger Vorschau
- Wiki-style Linking mit `[[Wikilinks]]`
- Obsidian-kompatible Syntax
- Callouts, LaTeX, Mermaid-Diagramme
- Backlinks Panel

### KI-Integration
- KI-Menü für Textverarbeitung (⌘⇧A)
- KI-Bildgenerierung mit Flux2 (⌘⇧I)
- Alt+Rechtsklick für KI-Kontextmenü
- Transparente KI-Nutzung mit Fußnoten

### Weitere Features
- Zotero Integration für Literaturverwaltung
- PDF Viewer mit Companion-Notizen
- Template System
- Volltext-Suche
- Quick Switcher (⌘K)

---

## Download

**macOS** (Apple Silicon & Intel): [mindgraph-notes.de/#download](https://mindgraph-notes.de/#download)

Windows & Linux: Coming soon

---

## Tastaturkürzel

| Shortcut | Funktion |
|----------|----------|
| ⌘N | Neue Notiz |
| ⌘P | Schnellsuche |
| ⌘K | Quick Switcher |
| ⌘E | Ansicht wechseln |
| ⌘⇧A | KI-Menü |
| ⌘⇧I | KI-Bildgenerierung |
| ⌘⇧Z | Zotero-Suche |
| ⌘⇧T | Template-Auswahl |

Auf Windows/Linux: ⌘ = Ctrl

---

## Setup (optional)

### OpenCode
```bash
curl -fsSL https://opencode.ai/install | bash
```

### Ollama
```bash
brew install ollama
ollama pull llama3
```

### Flux2 Bildgenerierung
```bash
ollama run x/flux2-klein
```

---

## Entwicklung

```bash
cd app
npm install
npm run dev
```

### Build

```bash
cd app
npm run build
```

---

## Tech Stack

- **Electron** - Cross-platform Desktop App
- **React** - UI Framework
- **TypeScript** - Type-safe Development
- **CodeMirror** - Markdown Editor
- **React Flow** - Graph Visualization
- **Zustand** - State Management
- **xterm.js** - Integrated Terminal

---

## Lizenz

**AGPL-3.0** - GNU Affero General Public License v3.0

Copyright (C) 2024-2026 Jochen Leeder ([bydb.io](https://bydb.io))

Diese Software ist Open Source unter der AGPL-3.0 Lizenz. Das bedeutet:

- ✅ Du darfst den Code nutzen, modifizieren und verteilen
- ✅ Du darfst die App für kommerzielle Zwecke nutzen
- ⚠️ Modifikationen müssen ebenfalls unter AGPL-3.0 veröffentlicht werden
- ⚠️ Der Quellcode muss verfügbar gemacht werden (auch bei Netzwerk-Nutzung)
- ⚠️ Attribution ist erforderlich

### Attribution

Bei Nutzung oder Forks muss folgende Attribution sichtbar sein:

> Based on MindGraph Notes by Jochen Leeder (bydb.io)
> Original project: https://github.com/bydb/mindgraph-notes

Siehe [LICENSE](LICENSE) für Details.

---

## Autor

**Jochen Leeder**
- Website: [bydb.io](https://bydb.io)
- GitHub: [@bydb](https://github.com/bydb)

---

Made with ❤️ in Germany
