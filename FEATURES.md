# MindGraph Notes - Features

Eine moderne Notiz-App mit Wissensgraph, gebaut mit Electron und React.

## Editor

### Markdown-Editor mit Live Preview
- **Drei Ansichtsmodi**: Bearbeiten, Live Preview, Vorschau (Cmd+E zum Wechseln)
- **Syntax Highlighting** mit CodeMirror
- **Auto-Save** mit konfigurierbarem Intervall
- **Zeilennummern** (optional)
- **Formatierungs-Kontextmenu** (Rechtsklick) mit:
  - Fett, Kursiv, Code, Durchgestrichen
  - Links und Wikilinks
  - Uberschriften (H1-H3)
  - Zitate und Callouts
  - Tasks und Tasks mit Reminder
  - Fussnoten

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
- **LaTeX/KaTeX**: `$inline$` und `$$block$$` Mathematik
- **Chemie-Formeln**: via mhchem (`$\ce{H2O}$`)
- **Mermaid-Diagramme**: Flowcharts, Sequenzdiagramme, etc.
- **Fussnoten**: `[^1]` Referenz mit automatischer Nummerierung
- **Task-Listen**: Interaktive Checkboxen `- [ ]` und `- [x]`
- **YAML Frontmatter**: Metadaten am Dateianfang

### Bilder
- **Drag & Drop** von Bildern direkt in den Editor
- **Paste aus Zwischenablage** (Cmd+V)
- **Automatische Speicherung** in `.attachments/` Ordner
- **Flexible Pfadauflosung**: Findet Bilder im Vault

## Wissensgraph (Canvas)

### Interaktive Visualisierung
- **Drei Ansichtsmodi**: Editor, Split (Editor + Canvas), Canvas
- **Zoom und Pan** mit Maus/Trackpad
- **Minimap** fur Navigation in grossen Graphen

### Knoten-Typen
- **Notiz-Karten**: Zeigen Titel und Vorschau
- **PDF-Karten**: Fur PDF-Dateien
- **Label-Knoten**: Fur Tags
- **Dot-Knoten**: Kompakte Darstellung

### Layout-Algorithmen
- **Force-Directed**: Physik-basiertes Layout
- **Radial**: Kreisformige Anordnung
- **Hierarchisch**: Baumstruktur

### Interaktion
- **Klick auf Knoten**: Offnet die Notiz im Editor
- **Drag & Drop**: Knoten verschieben
- **Verbindungen**: Visualisieren Wikilinks zwischen Notizen
- **Konfigurierbare Kartenbreite** in Einstellungen

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

### Sidebar / Dateibaum
- Hierarchische Ordnerstruktur
- Kontextmenu (Rechtsklick) fur Aktionen
- Drag & Drop zum Verschieben
- Neue Dateien und Ordner erstellen

## Templates

### Eingebaute Templates
- **Leere Notiz**
- **Daily Note**: Fur tagliche Notizen
- **Zettel**: Zettelkasten-Format
- **Meeting**: Meeting-Protokolle

### Template-Variablen
- `{{title}}` - Titel der Notiz
- `{{date}}` - Aktuelles Datum
- `{{date:DD.MM.YYYY}}` - Formatiertes Datum
- `{{time}}` - Aktuelle Uhrzeit
- `{{datetime}}` - Datum und Uhrzeit
- `{{weekday}}` - Wochentag
- `{{week}}` - Kalenderwoche
- `{{timestamp}}` - Unix-Timestamp
- `{{uuid}}` - Eindeutige ID
- `{{cursor}}` - Cursor-Position nach Einfugen

### Eigene Templates
- Erstellen und Bearbeiten in Einstellungen
- Speicherung pro Vault
- Schnellzugriff mit Cmd+Shift+T

## KI-Integration (Ollama)

### Lokale KI ohne Cloud
- Nutzt **Ollama** fur lokale Verarbeitung
- Kein Datenversand an externe Server
- Modellauswahl in Einstellungen

### KI-Funktionen (Alt+Rechtsklick auf markierten Text)
- **Zusammenfassen**: Text kurz zusammenfassen
- **Erklaren**: Begriff oder Konzept erklaren
- **Ubersetzen**: In konfigurierbare Sprache
- **Verbessern**: Stil und Grammatik
- **Erweitern**: Mehr Details hinzufugen
- **Vereinfachen**: Einfacher formulieren

### Transparenz
- Jede KI-Nutzung wird automatisch als **Fussnote dokumentiert**
- Enthalt verwendetes Modell und Aktion
- Nachvollziehbarkeit gewahrleistet

### KI-Bildgenerierung (Cmd+Shift+I)
- Erstellt Bilder basierend auf Beschreibung
- Speichert automatisch im Vault
- Fugt Markdown-Referenz ein

## Zotero-Integration

### Literaturverwaltung
- Verbindung uber **Better BibTeX** Plugin
- Suche in Zotero-Bibliothek (Cmd+Shift+Z)

### Einfugen von Zitaten
- Als Inline-Zitat
- Als Fussnote mit vollstandiger Referenz
- Automatische Formatierung

## PDF-Features

### PDF-Viewer
- Integrierte Anzeige von PDFs
- Navigation und Zoom
- Auswahl in Sidebar zeigt PDF

### PDF Companion
- Automatische Markdown-Datei fur jedes PDF
- Ermoglicht Tagging und Verlinkung
- Notizen zum PDF
- Konfigurierbare Anzeige im Dateibaum

### PDF-Export
- Notizen als PDF exportieren
- Formatierung bleibt erhalten
- Titel aus Frontmatter

## Reminder-System

### Task-Erinnerungen
- Syntax: `- [ ] Aufgabe (@[[2024-01-15]] 10:00)`
- Desktop-Benachrichtigungen
- Klick auf Benachrichtigung offnet Notiz

## Terminal-Integration

### Eingebautes Terminal
- Claude Code Integration
- Ein-/Ausblendbar
- Direkt im Vault-Kontext

## Personalisierung

### Themes
- Light / Dark / System
- **Akzentfarben**: Blau, Grun, Lila, Orange, Pink, Rot
- **Hintergrundfarben**: Standard, Warm, Cool, Sepia

### Schriftarten
- System-Fonts
- Nerd Fonts Support
- Konfigurierbare Schriftgrosse

### Sprachen
- Deutsch
- Englisch

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
| Cmd+Shift+T | Template-Picker |
| Cmd+Shift+Z | Zotero-Suche |
| Cmd+Shift+I | KI-Bildgenerierung |
| [[ | Wikilink-Autocomplete |

## Technische Details

- **Electron** fur Cross-Platform
- **React** mit TypeScript
- **CodeMirror 6** fur den Editor
- **React Flow** fur den Graphen
- **Zustand** fur State Management
- **markdown-it** fur Rendering
- **KaTeX** fur Mathematik
- **Mermaid** fur Diagramme
