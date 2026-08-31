# MindGraph Notes

**Zeigt dir, was heute wichtig ist.**

Lokaler Workspace, der deine Notizen, Aufgaben, E-Mails und Dokumente verbindet und nach Relevanz sortiert. Markdown, Wissensgraph, Karteikarten, E2E-Sync -- alles mit lokaler KI, ohne Cloud-Zwang. Open Source.

[Website](https://mindgraph-notes.de) · [Download](https://mindgraph-notes.de/#download) · [Blog](https://mindgraph-notes.de/blog/) · [GitHub](https://github.com/bydb/mindgraph-notes)

---

## Features

### Dashboard & Relevanz-Radar
- Tages-Dashboard, das nach Relevanz zeigt, was heute wichtig ist (Notizen, Aufgaben, Termine, E-Mails)
- **Relevanz-Radar**: rein heuristisch, ohne KI -- Score aus überfälligen Aufgaben, Backlinks, passenden Mails und Terminen; ein Durchlauf über 4000 Notizen kostet Millisekunden
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
- Slash Commands: `/` fuer 25 Befehle (Datum-Wikilinks, Formatierung, 10 Callout-Typen, Templates)
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
- **Vier Backends**: Ollama und LM Studio lokal, OpenRouter und LLMBase (EU-Inference) als opt-in Cloud -- bewusst pro Funktion zuschaltbar, Brain bleibt immer lokal
- **Macher-Leiste (⌘⇧A)**: KI schlägt Änderungen als Block-Diff vor -- du übernimmst oder verwirfst, nichts wird automatisch ersetzt
- **Webrecherche (Opt-in)**: Der Notiz-Agent sucht über Tavily, SearXNG oder Linkup, liest freigegebene Treffer lokal und erzeugt eine gestagede Notiz mit deterministischem Quellenblock
- KI-Kontextmenue (Alt+Rechtsklick) für Textauswahl, Provenienz (Modell + Datum) im Frontmatter
- **Smart Connections**: Ähnlichkeitssuche über Embeddings (bge-m3) mit optionalem LLM-Reranker
- **Eingebautes Diktat** (Whisper STT, lokal im Browser-Runtime) -- Schnellerfassung per ⌘D
- **Modell-Kompatibilitäts-Matrix**: zeigt pro Modul, welches Modell geeignet ist (mit Hersteller-Logos); Hard-Lock gegen prompt-injection-anfällige Modelle
- **Modell-Fähigkeiten kommen von der Laufzeit**, nicht aus einer gepflegten Namensliste -- eine solche Liste veraltet still und sperrt echte Fähigkeiten aus
- In-App Ollama Model Download und Management; KI-Quiz-Generierung und Bildgenerierung (Flux2 lokal, Imagen für Agent und Marketing)

### Notiz-Agent & Skills
- **Notiz-Agent**: Arbeitsaufträge an ein Modell, das liest, recherchiert und Dateien erzeugt -- als eigener Tab oder aus der Macher-Leiste unter der Notiz
- **Kontext anhängen**: einzelne Dateien (Excel, Word, PowerPoint, PDF, Markdown, CSV) oder ganze Ordner; der Agent liest ausschliesslich, was angehängt ist
- **Ordner auswerten**: führt Excel- und CSV-Dateien eines Ordners zusammen (Kopfzeilen-Erkennung, unscharfe Spaltenzuordnung) und schreibt eine Ergebnistabelle -- die Zeilen laufen nie durch den Modellkontext
- **Ergebnisse gehen in einen Staging-Bereich**, nicht ins Vault: du übernimmst jede Datei einzeln. Der Agent kann nichts direkt überschreiben
- **Skills**: eigene Arbeitsanleitungen als `Skills/<ordner>/SKILL.md` im Vault (offener SKILL.md-Standard), inklusive kuratiertem Katalog zum Import. Skills sind reiner Text, kein Code -- `scripts/` wird nie ausgeführt
- **Wissenschaftliche HTML-Seiten** (`write_html`): LaTeX bleibt Quelltext und wird per KaTeX offline gerendert, mit Gleichungs- und Abbildungsnummerierung

### HTML-Vorschau, PDF & EPUB
- `.html`-Dateien öffnen im Code-Editor als sandboxed Vorschau (eigenes Protokoll, keine externen Hosts, kein Netzzugriff aus der Seite)
- Export der Vorschau als **PDF** (A4) oder **EPUB** -- Stylesheets, lokale Schriften und Bilder werden eingebettet
- Notiz-Export als PDF, zusätzlich im **reMarkable-Buchformat** (157x210 mm, grosse Serifenschrift)

### Präsentationsmodus & Display-Diagnose
- Erkennt Software-Rendering, niedrige Bildwiederholrate, gemischte Skalierung und Spiegelung -- die typischen Ursachen für eine zähe Oberfläche am Beamer
- Präsentationsmodus schaltet alle Weichzeichner-Overlays und Übergänge ab; Animationen bleiben bewusst an, damit ein Spinner nicht wie eine hängende App aussieht
- Wird nur angeboten, nie selbsttätig aktiviert

### Plugin-System
- Integrationen laufen als Plugins mit eigenem Manifest statt fest verdrahtet: **edoobox** (Veranstaltungs-Agent), **Antares CS** (Medienzentren-Verleih, read-only), **reMarkable** (USB), **WordPress** (Publishing)
- Plugin-Widgets rendern über einen Host mit eigener Schreibgrenze -- kein rohes HTML aus einem Plugin in die Oberfläche

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
- **Telegram-Bot mit Agent-Modus** (experimentell, default aus): Notizen/Tasks/Kalender per Chat abfragen und (mit Bestätigung) bearbeiten -- läuft lokal; wird nur noch sicherheitsseitig gepflegt
- **Semantic Scholar + OpenAlex** Literatursuche mit Zotero-Export (CSL)
- Zotero Integration fuer Literaturverwaltung (Better BibTeX)
- reMarkable USB-Integration (Dokumente browsen, importieren, PDF exportieren, optimieren, als Buch umbrechen)
- **Schnellerfassung** per Tray und globalem Kürzel: Notiz- und Zettel-Modus, Diktat, Aufgaben -- ohne die App in den Vordergrund zu holen
- Readwise Highlight-Sync (Buecher, Artikel, Podcasts)
- edoobox-Agent (Veranstaltungsimport, Booking-Dashboard, Marketing mit WordPress + Imagen)
- Antares CS (Medienzentren-Verleih, read-only Dashboard-Widget)
- PDF Viewer mit Docling-Extraktion
- LanguageTool Grammatik- & Rechtschreibpruefung (Ein-Klick-Korrektur)
- Apple Erinnerungen aus Tasks + Kalender-Termine (macOS)
- Dataview Queries (LIST, TABLE, WHERE, SORT)
- Template System (Built-in & Custom)
- **15 aktivierbare Module**: Kern-Features bleiben, Spezial-Integrationen per Toggle ein-/ausblendbar (u.a. Vision OCR, Sprache, Projekt-RAG, Webrecherche, Bild-Generierung)

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
| ⌘O | Vault öffnen |
| ⌘P | Schnellsuche |
| ⌘⇧P | Befehlspalette |
| ⌘K | Quick Switcher |
| ⌘E | Ansicht wechseln (Markdown / Schreiben / Lesen) |
| ⌘W | Tab schliessen |
| ⌘⇧A | KI-Macher-Leiste |
| ⌘⇧F | Format-Menü |
| ⌘⇧I | KI-Bildgenerierung |
| ⌘⇧Z | Zotero-Suche |
| ⌘⇧T | Template-Auswahl |

Auf Windows/Linux: ⌘ = Ctrl. Die vollständige Liste steht in der Befehlspalette (⌘⇧P).

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

Für den Notiz-Agenten lohnt ein MoE-Modell: es schreibt lange Ergebnisse um ein
Vielfaches schneller als ein gleich grosses dichtes Modell, und der Agent ist
schreiblastig. Alternativ läuft LM Studio als lokales Backend.

### Webrecherche (optional, opt-in)

Modul „Webrecherche" aktivieren, dann unter Einstellungen → KI & Modelle einen
Anbieter hinterlegen: **Tavily** oder **Linkup** per API-Key, oder eine eigene
**SearXNG**-Instanz. Pro Agent-Lauf wird sie zusätzlich über den Globus
freigegeben -- ohne diesen Klick sieht das Modell die Such-Werkzeuge nicht.

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

- **Electron 41** - Cross-platform Desktop App
- **React 19** - UI Framework
- **TypeScript 6** - Type-safe Development
- **CodeMirror 6** - Markdown Editor (3 Modi inkl. WYSIWYG via turndown)
- **React Flow** - Graph- & Workflow-Canvas
- **Zustand 5** - State Management (21 Stores)
- **Ollama + LM Studio (lokal), OpenRouter + LLMBase (opt-in Cloud)** - LLM-Backends, lokal-first
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
