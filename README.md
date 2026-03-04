# MindGraph Notes

**Notizen, Karteikarten, KI und Terminal -- in einer App.**

Eine moderne, lokale Notiz-App die Markdown-Notizen mit einem Wissensgraphen, Karteikarten (Spaced Repetition), E2E-verschluesseltem Sync, KI-Integration und einem vollwertigen Terminal kombiniert. 100% lokal, Open Source, ohne Cloud-Zwang.

[Website](https://mindgraph-notes.de) · [Download](https://mindgraph-notes.de/#download) · [Blog](https://mindgraph-notes.de/blog/) · [GitHub](https://github.com/bydb/mindgraph-notes)

---

## Features

### Karteikarten & Spaced Repetition
- SM-2 Algorithmus mit optimalen Wiederholungsintervallen
- KI-Quiz-Generierung aus beliebigen Notizen via Ollama
- Anki-Import (.apkg) fuer einfache Migration
- Statistik-Dashboard: Streak, Heatmap, Wiederholungsplan
- Cloze Deletion und Image Occlusion

### E2E-verschluesselter Sync
- AES-256-GCM Verschluesselung, scrypt Key-Derivation
- Zero-Knowledge Relay-Server -- Server sieht nur verschluesselte Blobs
- Kein Account noetig: nur Vault-ID + Passphrase
- Selektive Synchronisierung und Sync-Protokoll

### Notizen & Markdown
- CodeMirror 6 Editor mit Live Preview
- Slash Commands: `/` fuer 28 Befehle (Datum-Wikilinks, Formatierung, Callouts, Templates)
- Wiki-style Linking mit `[[Wikilinks]]` und Backlinks-Panel
- Obsidian-kompatible Syntax, Callouts, LaTeX, Mermaid-Diagramme
- Syntax Highlighting in Code-Bloecken (20+ Sprachen)

### Wissensgraph
- Interaktive Visualisierung aller Verbindungen (React Flow)
- Cards & Dots View, Drag & Drop, Layout-Algorithmen
- Zusammenfassungen und Tags direkt auf Canvas-Karten

### KI-Integration
- Lokale LLMs via Ollama (Zusammenfassen, Uebersetzen, Weiterschreiben)
- In-App Ollama Model Download und Management
- KI-Quiz-Generierung und Bildgenerierung (Flux2)
- KI-Menue (⌘⇧A) und KI-Kontextmenue (Alt+Rechtsklick)

### Integriertes Terminal
- Vollwertiges PTY-Terminal direkt in der App
- Smart AI-Tool Detection (OpenCode, Claude)
- Windows + WSL Support

### E-Mail-Inbox
- IMAP-Abruf von mehreren Accounts
- Automatische KI-Relevanzanalyse via Ollama
- Relevante E-Mails werden als Markdown-Notizen gespeichert

### Weitere Integrationen
- Zotero Integration fuer Literaturverwaltung (Better BibTeX)
- reMarkable USB-Integration (Dokumente browsen, importieren, PDF exportieren)
- Readwise Highlight-Sync (Buecher, Artikel, Podcasts)
- edoobox-Agent (Veranstaltungsimport aus Akkreditierungsformularen)
- PDF Viewer mit Docling-Extraktion
- LanguageTool Grammatik- & Rechtschreibpruefung
- Apple Erinnerungen aus Tasks erstellen (macOS)
- Dataview Queries (LIST, TABLE, WHERE, SORT)
- Template System (Built-in & Custom)

---

## Download

**macOS** (Apple Silicon & Intel): [mindgraph-notes.de/#download](https://mindgraph-notes.de/#download)

**Linux** (AppImage & .deb): [mindgraph-notes.de/#download](https://mindgraph-notes.de/#download)

**Windows** (Installer & Portable): [mindgraph-notes.de/#download](https://mindgraph-notes.de/#download)

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

### Docling PDF-Extraktion
```bash
docker run -p 5001:5001 ds4sd/docling-serve
```

### LanguageTool Grammatikprüfung
```bash
docker run -d -p 8010:8010 erikvl87/languagetool
```
Alternativ: LanguageTool Premium API mit Username + API-Key in Einstellungen konfigurieren.

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

- **Electron 40** - Cross-platform Desktop App
- **React 19** - UI Framework
- **TypeScript 5.9** - Type-safe Development
- **CodeMirror 6** - Markdown Editor
- **React Flow** - Graph Visualization
- **Zustand 5** - State Management (12 Stores)
- **xterm.js + node-pty** - Integrated Terminal
- **imapflow + mailparser** - E-Mail Integration
- **DOMPurify** - HTML/SVG Sanitization

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
