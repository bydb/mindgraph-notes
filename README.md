# MindGraph Notes

**Zeigt dir, was heute wichtig ist.**

Lokaler Workspace, der deine Notizen, Aufgaben, E-Mails und Dokumente verbindet und nach Relevanz sortiert. Markdown, Wissensgraph, Karteikarten, E2E-Sync -- alles mit lokaler KI, ohne Cloud-Zwang. Open Source.

[Website](https://mindgraph-notes.de) · [Download](https://mindgraph-notes.de/#download) · [Blog](https://mindgraph-notes.de/blog/) · [GitHub](https://github.com/bydb/mindgraph-notes)

---

## Features

### Dashboard & Relevanz-Radar
- Tages-Dashboard, das nach Relevanz zeigt, was heute wichtig ist (Notizen, Aufgaben, Termine, E-Mails)
- **Relevanz-Radar**: KI bewertet offene 🔴-Notizen, kombiniert mit Heuristik-Signalen aus deinem Tagesverlauf
- Morning Briefing (einmal täglich), Aktivitäts-Widget (Top-Notizen & -Ordner)
- Projekt-Status-Widget, das `_STATUS`-Notizen pro Projekt anreichert

### Brain -- lokales Tagesgedächtnis
- Konsolidiert deinen Tag (berührte Notizen, erledigte Aufgaben, Mails, Daily-Note) in eine Tageszusammenfassung
- Vier-Sektionen-Schema: Heute im Fokus / Was ich gemacht habe / Offene Fäden / Beobachtung
- **Hardcoded lokal** (`localhost:11434`) -- verlässt nie deinen Rechner
- Zusammenfassungen werden nie überschrieben (Human-in-the-Loop)

### Notiz-Kategorien (🔴🟢🔵)
- Drei funktionale Kategorien: 🔴 Problem (Aktion) · 🟢 Lösung (Wissen) · 🔵 Info (Lesen)
- Farbfilter im FileTree, Status-Dots in Editor, Tabs, Graph und Lesezeichen
- Erkennung über Frontmatter oder Titel-Emoji -- treibt Radar und Dashboard

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
- CodeMirror 6 Editor mit drei Modi: Markdown, Schreiben (Live Preview), Lesen (WYSIWYG mit Inline-Editing)
- Slash Commands: `/` fuer 28 Befehle (Datum-Wikilinks, Formatierung, Callouts, Templates)
- Wiki-style Linking mit `[[Wikilinks]]` und Backlinks-Panel
- Obsidian-kompatible Syntax, Callouts, LaTeX, Mermaid-Diagramme
- Syntax Highlighting in Code-Bloecken (20+ Sprachen)
- Automatische Backups vor jedem Schreibvorgang (lokal, vom Sync ausgenommen)

### Wissensgraph
- Interaktive Visualisierung aller Verbindungen (React Flow)
- Cards & Dots View, Drag & Drop, Layout-Algorithmen
- Zusammenfassungen und Tags direkt auf Canvas-Karten

### KI-Integration
- **Lokal-first**: lokale LLMs via Ollama (Zusammenfassen, Uebersetzen, Weiterschreiben) -- Standard, ohne Cloud-Zwang
- **Cloud opt-in via OpenRouter** (seit v0.8.1): für schwache Hardware optional zuschaltbar, bewusst pro Funktion -- Brain bleibt immer lokal
- **Macher-Leiste (⌘⇧A)**: KI schlägt Änderungen als Block-Diff vor -- du übernimmst oder verwirfst, nichts wird automatisch ersetzt
- **Webrecherche (Opt-in)**: Der Notiz-Agent sucht über Tavily, SearXNG oder Linkup, liest freigegebene Treffer lokal und erzeugt eine gestagede Notiz mit deterministischem Quellenblock
- KI-Kontextmenue (Alt+Rechtsklick) für Textauswahl, Provenienz (Modell + Datum) im Frontmatter
- **Smart Connections**: Ähnlichkeitssuche über Embeddings (bge-m3) mit optionalem LLM-Reranker
- **Eingebautes Diktat** (Whisper STT, lokal im Browser-Runtime) -- Schnellerfassung per ⌘D
- **Modell-Kompatibilitäts-Matrix**: zeigt pro Modul, welches Modell geeignet ist (mit Hersteller-Logos); Hard-Lock gegen prompt-injection-anfällige Modelle
- In-App Ollama Model Download und Management; KI-Quiz-Generierung und Bildgenerierung (Flux2)

### Integriertes Terminal
- Vollwertiges PTY-Terminal direkt in der App
- Smart AI-Tool Detection (OpenCode, Claude)
- Windows + WSL Support

### Smart Email Client
- IMAP-Abruf von mehreren Accounts mit automatischer KI-Analyse (Relevanz, Sentiment, Zusammenfassung)
- **Hybrid-Relevanz-Scorer**: harte Signale (VIP-Absender, Domains, Keywords, Antwort-Häufigkeit) deterministisch im Code, KI nur für Semantik -- mit "Warum"-Begründung pro Mail
- Analyse-Modell frei wählbar (lokal oder optional OpenRouter-Cloud)
- E-Mails senden via SMTP direkt aus der App (Signatur mit Bild-Upload, IMAP-Sent-Append)
- KI-Assistent: Emails besprechen, Antwortentwuerfe generieren lassen, Kontext aus Vault + Veranstaltungen
- Kontakt-Autocomplete aus Email-Historie, edoobox-Buchungen und Vault-Wikilinks
- "Antwort erwartet"-Erkennung mit Dringlichkeitsstufen (hoch/mittel/niedrig)
- Anhang-Erkennung, klickbare Links, Original-Text-Ansicht
- Relevante E-Mails werden als Markdown-Notizen mit Tasks und Terminen gespeichert

### Workflow Canvas
- Visuelle Automationsschicht: Module als verbindbare Bausteine mit typisierten Ports (React Flow)
- Trigger manuell oder bei neuen relevanten Mails; Human-Review als terminaler Hand-off
- Cloud-Guard: personenbezogene Schritte laufen nie über gehostete Cloud-Modelle

### Weitere Integrationen
- **Telegram-Bot mit Agent-Modus**: Notizen/Tasks/Kalender per Chat abfragen und (mit Bestätigung) bearbeiten -- läuft lokal
- **Semantic Scholar + OpenAlex** Literatursuche mit Zotero-Export (CSL)
- Zotero Integration fuer Literaturverwaltung (Better BibTeX)
- reMarkable USB-Integration (Dokumente browsen, importieren, PDF exportieren)
- Readwise Highlight-Sync (Buecher, Artikel, Podcasts)
- edoobox-Agent (Veranstaltungsimport, Booking-Dashboard, Marketing mit WordPress + Imagen)
- Antares CS (Medienzentren-Verleih, read-only Dashboard-Widget)
- PDF Viewer mit Docling-Extraktion
- LanguageTool Grammatik- & Rechtschreibpruefung (Ein-Klick-Korrektur)
- Apple Erinnerungen aus Tasks + Kalender-Termine (macOS)
- Dataview Queries (LIST, TABLE, WHERE, SORT)
- Template System (Built-in & Custom)
- Aktivierbare Module: Kern-Features bleiben, Spezial-Integrationen per Toggle ein-/ausblendbar

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
| ⌘⇧A | KI-Macher-Leiste |
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
ollama pull qwen3.5:4b      # Chat / Analyse (8-GB-tauglich)
ollama pull bge-m3          # Embeddings für Smart Connections (deutsche Vaults)
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
- **CodeMirror 6** - Markdown Editor (3 Modi inkl. WYSIWYG via turndown)
- **React Flow** - Graph- & Workflow-Canvas
- **Zustand 5** - State Management (20 Stores)
- **Ollama (lokal) + OpenRouter (opt-in)** - LLM-Backends, lokal-first
- **@huggingface/transformers + ONNX Runtime** - eingebautes Whisper STT
- **xterm.js + node-pty** - Integrated Terminal
- **imapflow + mailparser + nodemailer** - Smart Email Client
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
