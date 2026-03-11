# MindGraph Notes - Features

Eine moderne Notiz-App mit Wissensgraph, Karteikarten, E2E-Sync und KI-Integration, gebaut mit Electron und React.

## Editor

### Markdown-Editor mit Live Preview
- **Drei Ansichtsmodi**: Bearbeiten, Live Preview, Vorschau (Cmd+E zum Wechseln)
- **Standard-Ansicht Preview**: Notizen offnen standardmassig in der Vorschau
- **Syntax Highlighting** mit CodeMirror 6
- **Code Syntax Highlighting**: 20+ Sprachen mit VS Code-inspiriertem Dark-Theme und Copy-Button
- **Auto-Save** mit konfigurierbarem Intervall
- **Zeilennummern** (optional)
- **Formatierungsleiste**: Sichtbare Toolbar mit Buttons fur Bold, Italic, Strikethrough, Code, Uberschriften, Listen, Checkboxen, Zitate, Links und Trennlinien
- **Formatierungs-Kontextmenu** (Rechtsklick) mit Fett, Kursiv, Code, Durchgestrichen, Links, Wikilinks, Uberschriften, Zitate, Callouts, Tasks, Fussnoten

### Slash Commands
- `/` am Zeilenanfang offnet filterbares Dropdown-Menu mit 28 Befehlen
- Datum/Zeit-Stempel, Formatierung, 10 Callout-Typen, Template-Picker
- Konfigurierbare Datums-/Zeitformate in den Editor-Einstellungen
- Datum-Wikilinks: `/today`, `/tomorrow`, `/yesterday`

### Obsidian-kompatible Syntax
- **Wikilinks**: `[[Notiz]]` oder `[[Notiz|Alias]]`
- **Heading-Links**: `[[Notiz#Uberschrift]]`
- **Block-Referenzen**: `[[Notiz#^blockid]]`
- **Embeds**: `![[Notiz]]` bettet Inhalte ein
- **Bild-Embeds**: `![[bild.png]]` oder `![[bild.png|300]]` (mit Grosse)
- **PDF-Embeds**: `![[dokument.pdf]]`
- **Tags**: `#tag`
- **Callouts**: `> [!note]`, `> [!tip]`, `> [!warning]`, etc.
- **Tasks mit Reminder**: `- [ ] Aufgabe (@[[2024-01-15]] 10:00)`

### Erweiterte Markdown-Features
- **LaTeX/KaTeX**: `$inline$` und `$$block$$` Mathematik, auch `\(...\)` / `\[...\]` Notation
- **Chemie-Formeln**: via mhchem (`$\ce{H2O}$`)
- **Mermaid-Diagramme**: Flowcharts, Sequenzdiagramme, etc.
- **Fussnoten**: `[^1]` Referenz mit automatischer Nummerierung
- **Task-Listen**: Interaktive Checkboxen `- [ ]` und `- [x]`
- **YAML Frontmatter**: Metadaten am Dateianfang
- **Code Folding**: Einklappbare Code-Blocke, Callouts und Frontmatter

### Bilder
- **Drag & Drop** von Bildern direkt in den Editor
- **Paste aus Zwischenablage** (Cmd+V)
- **Automatische Speicherung** in `.attachments/` Ordner
- **Flexible Pfadauflosung**: Findet Bilder im Vault

### Properties Panel
- Komfortable Bearbeitung von YAML-Frontmatter oberhalb des Editors
- Automatische Typ-Erkennung: Boolean (Checkbox), Zahlen, Datum, Arrays, Text
- Eigenschaften hinzufugen und entfernen
- **Tag-Autocomplete**: Vorschlage aus allen existierenden Vault-Tags

## Wissensgraph (Canvas)

### Interaktive Visualisierung
- **Drei Ansichtsmodi**: Editor, Split (Editor + Canvas), Canvas
- **Zoom und Pan** mit Maus/Trackpad
- **Minimap** fur Navigation in grossen Graphen
- **Lesemodus**: Hover-Zoom (1x-8x), Titel-Tooltip, Karten nicht verschiebbar
- **Verbindungslinien ein-/ausblenden**: Toggle zum Ausblenden aller Edges

### Knoten-Typen
- **Notiz-Karten**: Zeigen Titel, Vorschau, Tags, Links, Bilder, Callout-Zusammenfassungen
- **PDF-Karten**: Fur PDF-Dateien
- **Label-Knoten**: Fur Tags und Uberschriften
- **Dot-Knoten**: Kompakte Darstellung
- **Emoji-Dot-Kategorisierung**: 🔴🟢🔵 Emojis aus Dateinamen werden auf Karten angezeigt

### Layout-Algorithmen
- **Force-Directed**: Physik-basiertes Layout
- **Radial**: Kreisformige Anordnung
- **Hierarchisch**: Baumstruktur
- **Grid**: Rasteranordnung

### KI-Anordnung
- **Thematisch gruppieren**: KI analysiert Titel und Tags, gruppiert Karten in thematische Spalten, berucksichtigt Emoji-Dot-Kategorien (🔴🟢🔵) und farbt Karten automatisch ein
- **Lernpfad erstellen**: KI ordnet Karten in optimaler Lernreihenfolge an (Grundlagen → Aufbauendes)
- **Verbindungen vorschlagen**: KI erkennt inhaltliche Zusammenhange und erstellt fehlende Edges

### Interaktion
- **Klick auf Knoten**: Offnet die Notiz im Editor
- **Drag & Drop**: Knoten verschieben, neue Notizen per Drag erstellen
- **Bidirektionale Verbindungen**: Neue Verbindungen schreiben automatisch Wikilinks in beide Dateien
- **Notiz duplizieren**: Rechtsklick → Duplizieren erstellt Kopie im gleichen Ordner
- **Konfigurierbare Kartenbreite** in Einstellungen (bis 500px)
- **Zusammenfassungen auf Karten**: Callout-Zusammenfassungen (summary, tldr, abstract) direkt auf Karten
- **Ordner-Ansicht**: Rechtsklick auf Ordner → "Im Canvas anzeigen"
- **Local Canvas**: Rechtsklick → "Im Canvas erkunden" zeigt nur direkte Verbindungen mit Expand-Buttons

## Navigation & Suche

### Quick Switcher (Cmd+K)
- Schnelles Wechseln zwischen Notizen
- Fuzzy-Search nach Titeln
- Neue Notizen erstellen mit Template-Auswahl

### Schnellsuche (Cmd+P)
- **Volltextsuche** uber alle Notizen
- Ergebnisse mit Kontext-Vorschau
- Sofortige Navigation

### Backlinks-Panel
- Zeigt alle Notizen, die auf die aktuelle Notiz verlinken
- Kontext der Verlinkung sichtbar
- Klick offnet die verlinkende Notiz

### Wikilink Hover-Preview
- Vorschau beim Hovern uber Wikilinks mit LaTeX- und Callout-Rendering

### Sidebar / Dateibaum
- Hierarchische Ordnerstruktur
- Kontextmenu (Rechtsklick) fur Aktionen
- Drag & Drop zum Verschieben
- Neue Dateien und Ordner erstellen
- **Ordner anpinnen**: Tief verschachtelte Ordner per Rechtsklick an die Sidebar-Spitze pinnen
- **Ordner ausblenden**: Ordner per Rechtsklick verstecken, temporar uber Augen-Toggle einblendbar
- **Multi-Select**: Dateien mit Shift+Click auswahlen und per Batch loschen oder verschieben
- **Verschieben nach...**: Dateien und Ordner in andere Ordner verschieben (Dialog mit Ordnerstruktur)

### Tab-System
- Mehrere Notizen und Canvas-Ansichten als Tabs
- Tab-Titel synchronisieren sich mit Notiz-Titeln
- Text-Split View: Zwei Notizen nebeneinander vergleichen (Cmd/Ctrl+Click)

## Dataview Query System

### Abfragen von Notizen nach Metadaten
- Query-Typen: `LIST` und `TABLE`
- `FROM`: Filtern nach Tags (`#tag`) und Ordnern (`"Folder/Path"`)
- `WHERE`: Bedingungen mit Vergleichen (`=`, `!=`, `>`, `<`, `>=`, `<=`)
- `SORT`: Sortierung mit `ASC`/`DESC`
- `LIMIT`: Ergebnisse begrenzen
- Built-in Funktionen: `contains()`, `length()`, `lower()`, `default()`
- Zugriff auf `file.*` Felder und YAML-Frontmatter
- Edit-Modus zeigt Code, Live-Preview zeigt Ergebnisse

## Templates

### Eingebaute Templates
- **Leere Notiz**
- **Daily Note**: Fur tagliche Notizen
- **Zettel**: Zettelkasten-Format
- **Meeting**: Meeting-Protokolle

### Template-Variablen
- `{{title}}`, `{{date}}`, `{{date:DD.MM.YYYY}}`, `{{time}}`, `{{datetime}}`
- `{{weekday}}`, `{{week}}`, `{{timestamp}}`, `{{uuid}}`, `{{cursor}}`

### Eigene Templates
- Erstellen und Bearbeiten in Einstellungen
- Speicherung pro Vault
- Schnellzugriff mit Cmd+Shift+T

## E2E-verschlusselter Sync

### Zero-Knowledge Synchronisation
- **Vollverschlusselung**: AES-256-GCM, scrypt Key-Derivation
- **WebSocket Relay**: Echtzeit-Sync uber `wss://sync.mindgraph-notes.de`
- **Passphrase lokal**: Gespeichert via `electron.safeStorage`, wird nie zum Server gesendet
- **Per-Vault Konfiguration**: Jedes Vault hat eigene Sync-Einstellungen

### Sicherheit
- **Konfliktstrategie**: Neuerer Timestamp gewinnt, altere als `.sync-conflict-YYYY-MM-DD`
- **Mass-Deletion-Schutz**: >10% und >=10 Dateien → SAFETY-Fehler, Force Sync Button
- **Sync-Trash**: Geloschte Dateien werden in `.sync-trash/` verschoben (wiederherstellbar)
- **Tombstones**: Server speichert Loschungen 90 Tage lang
- **Cross-Vault-Schutz**: Validierung dass Sync-Config zum korrekten Vault gehort
- **Pfad-Traversal-Schutz**: Dateischreibvorgange prufen Vault-Grenzen

### Features
- **Selektive Synchronisierung**: Ordner und Dateitypen vom Sync ausschliessen
- **Sync-Protokoll**: Transparentes Log aller Sync-Aktivitaten
- **Geloschte Dateien wiederherstellen**: 90 Tage Aufbewahrung auf dem Server
- **Parallele Transfers**: 5 gleichzeitige Uploads/Downloads
- **Aktivierungscode-System**: Registrierung neuer Vaults per Code

## KI-Integration (Ollama)

### Lokale KI ohne Cloud
- Nutzt **Ollama** fur lokale Verarbeitung
- Kein Datenversand an externe Server
- Modellauswahl in Einstellungen
- **In-App Ollama Model Download**: Modelle direkt in der App herunterladen und loschen

### KI-Funktionen (Alt+Rechtsklick auf markierten Text)
- **Zusammenfassen**, **Erklaren**, **Ubersetzen**, **Verbessern**, **Erweitern**, **Vereinfachen**

### Transparenz
- Jede KI-Nutzung wird automatisch als **Fussnote dokumentiert**
- Enthalt verwendetes Modell und Aktion

### KI-Bildgenerierung (Cmd+Shift+I)
- Erstellt Bilder basierend auf Beschreibung
- Speichert automatisch im Vault

### Notes Chat
- KI-Chat uber den Inhalt der aktuellen Notiz
- LaTeX-Rendering in Chat-Antworten

## E-Mail-Integration (IMAP + Ollama)

### Automatische E-Mail-Analyse
- **IMAP-Abruf** von mehreren Accounts
- **Ollama-Analyse**: Relevanz (0-100), Sentiment, Zusammenfassung, Aufgaben
- **Instruktions-Notiz**: `Email-Instruktionen.md` im Vault definiert Relevanzkriterien
- **Notiz-Erstellung**: Relevante Mails werden als Markdown-Notizen gespeichert

### Sicherheit
- Passworter via `electron.safeStorage`, nie im Klartext
- Prompt-Injection-Schutz: Sanitization von Mail-Body vor Ollama-Aufruf

### Integration
- **Inbox-Panel**: Rechtes Sidebar-Panel mit Badge-Zaehler
- **Apple Erinnerungen**: Aus E-Mail-Aktionen direkt Erinnerungen erstellen (macOS)
- **Konfigurierbarer Inbox-Ordner**: Frei wahlbarer Ordner fur E-Mail-Notizen

## edoobox-Agent

- **Akkreditierungsformulare (.docx)** importieren → Veranstaltungsdaten automatisch parsen → an edoobox API senden
- **Agent Panel**: UI zur Verwaltung importierter Veranstaltungen mit Status-Tracking
- API-Client fur edoobox (v1 Query-Params, v2 JWT), Webhook-Support

## Karteikarten (Flashcards)

### Spaced Repetition
- **SM-2 Algorithmus**: Optimale Wiederholungsintervalle
- **Statistik-Dashboard**: Lern-Streak, Kalender-Heatmap (12 Wochen), Quick Stats, anstehende Wiederholungen

### Karteikarten-Editor
- **Markdown-Unterstutzung**: Vorder- und Ruckseite mit Markdown und LaTeX
- **Bild-Upload**: Per Button (File-Picker) oder Clipboard-Paste (Cmd+V)
- **Tags und Kategorien**: Organisation der Karten

### Anki Import
- **Import von .apkg-Dateien**: Karteikarten aus Anki ubernehmen
- **Medien-Extraktion**: Bilder und Audio werden automatisch extrahiert
- **Kartentypen**: Basic, Reversed und Cloze-Karten

### Quiz-Modus
- **Interaktives Quiz**: Multiple-Choice basierend auf Notizen oder Ordnern (via Ollama)
- Quiz-Fragen konnen als Karteikarten gespeichert werden

## PDF-Features

### PDF-Viewer
- Integrierte Anzeige von PDFs
- Navigation und Zoom

### PDF Companion
- Automatische Markdown-Datei fur jedes PDF
- Ermoglicht Tagging und Verlinkung
- Konfigurierbare Anzeige im Dateibaum

### PDF-Extraktion
- **Vision OCR (Ollama)**: Gedruckte und handgeschriebene Dokumente extrahieren — kein Docker notig
- **Docling**: Automatische Text-, Tabellen- und Bildextraktion (Docker)

### PDF-Export
- Notizen als PDF exportieren mit erhaltener Formatierung

## Integrationen

### Zotero
- Verbindung uber **Better BibTeX** Plugin
- Suche in Zotero-Bibliothek (Cmd+Shift+Z)
- Einfugen als Inline-Zitat oder Fussnote

### LanguageTool
- **Integrierte Grammatik- und Rechtschreibprufung** direkt im Editor
- Fehler farblich markiert (Rot/Blau/Gelb), Klick zeigt Korrekturvorschlage
- Lokal via Docker oder LanguageTool Premium API
- Automatische Spracherkennung, Ignorieren-Funktion

### Smart Connections
- KI-basierte Ahnlichkeitssuche mit konfigurierbaren Gewichtungen
- Embedding-Ahnlichkeit, Keyword-Matching, Wikilinks, Tags, Ordner-Nahe

### Readwise
- Native Synchronisierung von Highlights (Bucher, Artikel, Podcasts)
- Kategorie-Filter, inkrementeller Sync, Cover-Bilder

### reMarkable (USB)
- Dokumente browsen und importieren uber USB-Verbindung
- PDF exportieren und optimieren (Ghostscript/qpdf)
- Debug-Panel mit Gerateinformationen

## Reminder-System

### Task-Erinnerungen
- Syntax: `- [ ] Aufgabe (@[[2024-01-15]] 10:00)`
- Desktop-Benachrichtigungen
- Klick auf Benachrichtigung offnet Notiz
- **Overdue-Panel**: Ubersicht uber uberfällige Tasks mit Badge

## Terminal-Integration

### Eingebautes Terminal
- xterm.js + node-pty
- **Smart AI-Tool Detection**: Erkennt automatisch opencode (bevorzugt) oder claude
- **Windows WSL Support**: Pruft `wsl opencode` / `wsl claude`
- Direkt im Vault-Kontext

## Personalisierung

### Themes
- Light / Dark / System
- **12 Akzentfarben**: Blau, Grun, Lila, Orange, Pink, Rot, Rose, Koralle, Malve, Mint, Limette, Gold
- **15 Hintergrundfarben**: Standard, Warm, Cool, Sepia, Rosenblatt, Kirschblute, Meeresschaum, Pistazie, Limonade, Baumwolle und mehr

### Schriftarten
- System-Fonts und Nerd Fonts Support
- Konfigurierbare Schriftgrosse

### Custom Logo
- Eigenes Logo in der Titelleiste (PNG, SVG, JPG, WebP)

### Sprachen
- Deutsch und Englisch (vollstandige Lokalisierung aller UI-Komponenten)

### Onboarding
- Setup-Wizard beim ersten Start
- Profile: Wissensarbeiter, Studium, Schule
- Starter-Vault mit Beispielnotizen (DE/EN)
- Automatische Ollama/LM Studio-Erkennung

## Sicherheit

- **DOMPurify HTML-Sanitization**: Alle innerHTML-Ausgaben sanitized
- **SVG-Sanitization**: Script-Tags und Event-Handler entfernt
- **Mermaid**: `securityLevel: 'strict'`
- **KaTeX**: `trust: false`
- **Path Traversal Schutz**: Zentraler `validatePath()`-Helper
- **checkCommandExists Whitelist**: Nur explizit erlaubte Kommandos

## Plattformen

- **macOS**: Universal (arm64 + x64), signiert und notarisiert
- **Linux**: AppImage, deb, Snap Store
- **Windows**: Installer (NSIS) nach `C:\Program Files\`

## Tastenkurzel

| Kurzel | Aktion |
|--------|--------|
| Cmd+K | Quick Switcher |
| Cmd+P | Schnellsuche |
| Cmd+E | Ansicht wechseln |
| Cmd+S | Speichern |
| Cmd+B | Fett |
| Cmd+I | Kursiv |
| Cmd+, | Einstellungen |
| Cmd+/ | Hilfe-Guide |
| Cmd+Shift+T | Template-Picker |
| Cmd+Shift+Z | Zotero-Suche |
| Cmd+Shift+I | KI-Bildgenerierung |
| Cmd+Shift+O | Onboarding |
| [[ | Wikilink-Autocomplete |
| / | Slash Commands |

## Technische Details

- **Electron** fur Cross-Platform (macOS, Linux, Windows)
- **React 19** mit TypeScript
- **CodeMirror 6** fur den Editor
- **React Flow** fur den Graphen
- **Zustand** fur State Management (12 Stores)
- **markdown-it** fur Rendering
- **KaTeX** fur Mathematik
- **Mermaid** fur Diagramme
- **xterm.js + node-pty** fur Terminal
- **imapflow + mailparser** fur E-Mail
- **DOMPurify** fur HTML-Sanitization
