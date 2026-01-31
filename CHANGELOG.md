# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

## [1.0.8] - 2026-01-31

### Features
- **Update-Checker**: Automatische Prüfung auf neue Versionen via GitHub Releases API
  - Zeigt Benachrichtigungsbanner wenn neue Version verfügbar ist
  - Link zum direkten Download der neuen Version
  - Kann per Klick geschlossen werden

- **What's New Modal**: Zeigt Neuigkeiten nach App-Update
  - Automatische Anzeige nach Versionsänderung
  - Zeigt CHANGELOG-Inhalt der aktuellen Version als Markdown
  - Persistiert gesehene Version um Modal nur einmal zu zeigen

### Technische Änderungen
- Neue IPC-Handler: `get-app-version`, `check-for-updates`, `get-whats-new-content`
- UIStore erweitert um `lastSeenVersion`, `updateAvailable`, `whatsNewOpen`
- CHANGELOG.md wird in App-Resources für Produktion inkludiert

## [1.0.7] - 2026-01-31

### Features
- **Verschieben nach...**: Neue Kontextmenü-Option im Dateibaum
  - Dateien und Ordner können in andere Ordner verschoben werden
  - Dialog zeigt alle verfügbaren Ordner mit Einrückung an
  - Ordner-Farben und -Icons werden im Dialog angezeigt
  - Explizite Bestätigung durch "Verschieben"-Button
  - Vault-Root als Ziel verfügbar

### UI-Verbesserungen
- Ausgewählter Zielordner wird visuell hervorgehoben
- Verhindert Verschieben eines Ordners in sich selbst
- **Einheitliches Design-System**: Konsistente Abstände und Button-Größen
  - Alle Header (Sidebar, Tab-Bar, Editor) auf 44px Höhe vereinheitlicht
  - Einheitliche Button-Größen (28px) über die gesamte App
  - Konsistente horizontale Abstände (16px)
  - Tab-Bereich an Radius-Ausrichtung angepasst
  - SVG-Icons statt Emojis in der Sidebar

### Fixes
- NotesChat: Scroll-Bug behoben (Fenster scrollte bei LLM-Streaming weg)

## [1.0.6] - 2026-01-30

### Features
- **LanguageTool Integration**: Integrierte Grammatik- und Rechtschreibprüfung
  - Unterstützt lokale Docker-Instanz (`docker run -d -p 8010:8010 erikvl87/languagetool`)
  - Unterstützt LanguageTool Premium API mit Username + API-Key
  - Fehler werden direkt im Editor markiert (rot = Rechtschreibung, blau = Grammatik, gelb = Stil)
  - Klick auf markierte Fehler zeigt Popup mit Korrekturvorschlägen
  - "Ignorieren"-Funktion mit persistenter Speicherung
  - YAML-Frontmatter wird automatisch von der Prüfung ausgeschlossen
  - Konfigurierbare Sprache (automatisch, Deutsch, Englisch, etc.)

### Technische Änderungen
- Neues CodeMirror Extension für LanguageTool mit StateField und ViewPlugin
- IPC-Handler für lokale und API-basierte Grammatikprüfung
- Persistente Speicherung von ignorierten Regeln im uiStore

## [1.0.5] - 2026-01-29

### Features
- **Docling PDF-Extraktion**: Automatische Text-, Tabellen- und Bildextraktion aus PDFs
  - Docker-Integration (`docker run -p 5001:5001 ds4sd/docling-serve`)
  - Konvertiert PDFs zu sauberem Markdown
  - OCR-Support für gescannte Dokumente
  - Konfigurierbar in Einstellungen → Integrationen

### Technische Änderungen
- IPC-Handler für Docling-API-Kommunikation
- PDF-Extraktion UI im PDF Viewer

## [1.0.4] - 2026-01-29

### Features
- **Smart Connections**: KI-basierte ähnliche Notizen mit konfigurierbaren Gewichtungen
  - Embedding-Ähnlichkeit (semantisch)
  - Keyword-Matching
  - Wikilink-Verbindungen
  - Gemeinsame Tags
  - Ordner-Nähe
  - Gewichtungen individuell anpassbar in Einstellungen

### Verbesserungen
- Smart Connections Panel zeigt detaillierte Scores
- Performance-Optimierungen für große Vaults

## [1.0.3] - 2026-01-29

### Features
- **Vollständige Internationalisierung (i18n)**: Deutsche und englische Übersetzungen für alle UI-Komponenten
- **Terminal-Übersetzungen**: Statusmeldungen (verbunden/beendet) werden jetzt lokalisiert
- **GraphCanvas-Übersetzungen**: Toolbar, Filter, Focus-Mode, Dialoge vollständig übersetzt
- **150+ neue Übersetzungsschlüssel** für durchgängige Mehrsprachigkeit

### Technische Änderungen
- `tRef` Pattern im Terminal für sprachreaktive Übersetzungen in Callbacks
- Marker-basierte Übersetzung für Main-Process-Nachrichten

## [1.0.2] - 2026-01-28

### Features
- **Panel-Übersetzungen**: SmartConnections, TagsPanel, OverduePanel vollständig übersetzt
- **UI-Tooltips**: Alle Button-Tooltips und Labels lokalisiert

### Fixes
- Fehlende Übersetzungen auf der Website nachgetragen

## [1.0.1] - 2026-01-28

### Features
- **Sidebar-Übersetzungen**: FileTree, Bookmarks, Sidebar-Komponenten übersetzt
- **Editor-Übersetzungen**: AI-Menüs, Backlinks, WikilinkAutocomplete lokalisiert

## [1.0.0] - 2026-01-27

### Major Release
- **Erster stabiler Release** mit vollständiger Feature-Parität
- **Tab-System**: Mehrere Notizen und Canvas-Ansichten als Tabs
- **Local Canvas**: Fokussierte Graphansicht mit schrittweiser Erweiterung
- **Sprachunterstützung**: Grundlegende DE/EN Lokalisierung

## [0.9.9] - 2026-01-27

### Features
- **Local Canvas**: Rechtsklick → "Im Canvas erkunden" zeigt nur Root + direkte Verbindungen
- **Expand-Buttons**: `+X` an Nodes zeigt versteckte Verbindungen
- **Tab-System**: Canvas öffnet als Tab neben Editor-Tabs
- **View Modes**: Editor / Split / Canvas (Vollbild) / Text-Split

### UI Verbesserungen
- Einheitliche 44px Header-Höhe
- Perfekte Kreis-Buttons im Header

## [0.9.8] - 2026-01-26

### Features
- **Smart Connections Panel**: KI-basierte ähnliche Notizen finden
- **Embedding-Support**: Ollama-Embeddings für semantische Suche
- **Verbessertes Tagging**: Tag-Filter und -Verwaltung optimiert

## [0.9.7] - 2026-01-25

### Features
- **Text-Split View**: Zwei Notizen nebeneinander vergleichen (Cmd/Ctrl+Click im FileTree)
- **Draggable Divider**: Anpassbare Trennlinie zwischen Split-Panels
- **App-Logo als Theme Toggle**: MindGraph-Logo im Header zum Wechseln zwischen Dark/Light Mode
- **Markdown Folding**: Code-Blöcke, Callouts und Frontmatter einklappbar

### UI Verbesserungen
- **Gerundete Ecken**: Moderneres Design mit abgerundeten Header-Bereichen
- **Backlinks Panel Redesign**: Kompaktere Darstellung mit Akzentfarben
- **Wikilink Hover Preview**: Vorschau beim Hovern über Wikilinks
- **Outline Style Variants**: Verschiedene Styles für die Gliederungsansicht
- **Word Count**: Wortzähler im Editor-Footer
- **Tag Autocomplete**: Automatische Vervollständigung für Tags

### Fixes
- Dark Mode Konsistenz verbessert
- Logo verwendet Akzentfarbe für bessere Theme-Integration

## [0.9.6] - 2026-01-25

### Performance Optimizations
- **Massive Vault-Ladezeit-Verbesserung**: Ladezeit reduziert von ~85 Sekunden auf ~2-5 Sekunden für Vaults mit 3000+ Notizen
- **Notes Caching**: Intelligentes Caching-System mit mtime-basierter Invalidierung
- **Lazy Loading**: Notizen laden zunächst nur Metadaten, Inhalt bei Bedarf
- **Backlinks Optimierung**: O(n) Algorithmus statt O(n²)
- **Ordner standardmäßig eingeklappt**: Schnelleres initiales Rendering
- **Verzögerte Task-Statistiken**: Task-Statistiken werden nach UI-Bereitschaft berechnet

### UI Verbesserungen
- **Einheitliches Button-Styling**: Konsistente border-radius über alle UI-Elemente
- **SVG Icons**: Emojis durch professionelle SVG-Icons ersetzt (Einstellungen-Zahnrad, Terminal-Icon)
- **Titlebar Dragging**: Funktioniert jetzt über den gesamten Titlebar-Bereich
- **Editor Toolbar**: Angepasst an Titlebar-Styling für visuelle Konsistenz

### Technische Änderungen
- Batch-Datei-Lesen IPC Handler für reduzierten Overhead
- React Strict Mode Double-Render Guard
- Task-Statistiken Caching pro Notiz

## [0.9.5] - 2026-01-24

### Fixes
- Canvas Labels erscheinen nicht mehr in allen Ordneransichten
- Flux2 Titel-Übersetzung korrigiert

## [0.9.4] - 2026-01-24

### Features
- Verbessertes Terminal mit benutzerfreundlicher Fehlermeldung
- Konsistente UI-Elemente

## [0.9.3] - 2026-01-24

### Features
- Terminal-Integration verbessert
- Fehlerbehandlung optimiert

## [0.9.2] - 2026-01-24

### Features
- Terminal-Komponente mit xterm.js
- PTY-basierte Shell-Integration

## [0.9.1] - 2026-01-22

### Features
- Flux2 Bildgenerierung via Ollama
- Verbesserte KI-Integration

## [0.9.0] - 2026-01-22

### Features
- Task-Management im Footer mit Statistiken
- Reminder-System für Tasks

## [0.8.x] - 2026-01-21/22

### Features
- Canvas Labels und Styling
- PDF Companion Verbesserungen
- Zotero Integration
- Template-System

## [0.7.0] - 2026-01-21

### Features
- Wissensgraph mit React Flow
- Verschiedene Layout-Algorithmen
- Node-Styling und Farben

## [0.6.0] - 2026-01-20

### Features
- KI-Integration mit Ollama
- Kontextmenü für KI-Aktionen
- Transparente Dokumentation via Fußnoten

## [0.5.0] - 2026-01-20

### Features
- Live Preview Modus
- Split View (Editor + Canvas)
- Backlinks Panel

## [0.4.x] - 2026-01-20

### Features
- Mermaid Diagramme
- LaTeX/KaTeX Support
- Callouts

## [0.3.x] - 2026-01-19/20

### Features
- Wikilinks mit Autocomplete
- Quick Switcher (Cmd+K)
- Schnellsuche (Cmd+P)

## [0.2.0] - 2026-01-18

### Features
- Dateibaum mit Kontextmenü
- Drag & Drop für Dateien
- Themes (Light/Dark)

## [0.1.0] - 2026-01-18

### Initial Release
- Markdown Editor mit CodeMirror
- Grundlegende Dateiverwaltung
- Vault-basierte Speicherung
