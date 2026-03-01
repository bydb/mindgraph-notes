# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

## [0.2.24-alpha] - 2026-03-01

### Features
- **Canvas: Notiz duplizieren**: Neuer "Duplizieren"-Eintrag im Rechtsklick-Kontextmenü auf Canvas-Karten. Erstellt eine Kopie der Notiz im gleichen Ordner und platziert die neue Karte leicht versetzt neben dem Original — mit gleicher Farbe, Größe und Dimensionen

## [0.2.23-alpha] - 2026-02-27

### Features
- **Canvas: Zusammenfassungen auf Karten**: Callout-Zusammenfassungen (summary, tldr, abstract, note, info) werden jetzt direkt auf den Canvas-Karten angezeigt — inkl. deutscher Aliase (Zusammenfassung, tl-dr). Neuer Toggle zum Ein-/Ausblenden in der Toolbar
- **Canvas: Floating Focus Bar**: Fokus-Modus-Controls sind jetzt eine schwebende Leiste direkt auf dem Canvas (statt in der Toolbar). Verhindert abgeschnittene Buttons bei schmalen Fenstern. Escape-Taste beendet den Fokus-Modus
- **Canvas: Anordnen-Dropdown**: Alignment-, Distribute- und Layout-Tools sind jetzt in einem einzigen "Anordnen"-Dropdown vereint — spart ~270px Toolbar-Breite
- **Email: Konfigurierbarer Inbox-Ordner**: Email-Notizen können jetzt in einem frei wählbaren Ordner erstellt werden (Settings → Agenten → Email-Ordner), statt fest auf `‼️📧 - emails`

### Improvements
- **Callout-Extraktion verbessert**: Robusterer Parser für Callouts in Notizen mit korrekter Behandlung von Multiline-Inhalten und Typ-Aliase
- **Canvas-Toolbar kompakter**: Gesamtersparnis von ~440px Breite bei aktivem Fokus-Modus, kein Overflow mehr bei schmalen Fenstern oder geöffneter Sidebar

## [0.2.22-alpha] - 2026-02-26

### Features
- **In-App Ollama Model Download**: Ollama-Modelle können jetzt direkt in der App heruntergeladen werden — kein Terminal mehr nötig. Dropdown mit empfohlenen Modellen (Ministral 8B, Gemma 3, Llama 3.2, Qwen 3, Mistral 7B), Freitext-Eingabe für beliebige Modelle, Fortschrittsbalken mit Prozentanzeige
- **Ollama Model löschen**: Installierte Modelle können direkt in den Settings per Klick entfernt werden
- **Onboarding Model Download**: Wenn Ollama verbunden aber keine Modelle installiert sind, wird im Onboarding ein Download angeboten

## [0.2.21-alpha] - 2026-02-25

### Fixes
- **Lokalisierung: Main-Process-Dialoge**: Alle nativen Dialoge (Notiz/Ordner löschen, umbenennen, verschieben, PDF-Export, Vault-Auswahl, Wikilink-Stripping, Logo-/Formular-Auswahl) respektieren jetzt die Spracheinstellung des Users — zuvor waren diese hardcoded auf Deutsch

## [0.2.20-alpha] - 2026-02-25

### Features
- **reMarkable PDF-Optimierung**: Neuer "Optimieren + Export"-Button — PDFs werden vor dem Upload via Ghostscript oder qpdf komprimiert (automatischer Fallback)
- **reMarkable USB Debug-Panel**: Klappbares Debug-Panel zeigt USB-Geräteinformationen (Vendor, Product, IDs), Verbindungsstatus und letzten Export-Modus

### Improvements
- **reMarkable Upload-Stabilität**: Upload-Flow komplett überarbeitet mit 20 Retry-Versuchen, Reachability-Checks vor jedem Versuch und manuell gebautem multipart/form-data via `electron.net` (behebt Probleme mit reMarkable Paper Pro)
- **reMarkable Branding**: Logo im Panel-Header statt reinem Text
- **Titlebar-Badges**: Overdue- und Inbox-Badges teilen jetzt eine gemeinsame `.titlebar-mini-badge`-Basisklasse mit einheitlichem Design

### Security
- **Path Traversal Schutz**: Neuer zentraler `validatePath()`-Helper verhindert Pfad-Ausbrüche aus dem Vault bei allen Datei-IPC-Handlern (read-files-batch, ensure-pdf-companion, sync-pdf-companion, copy-image-to-attachments, write-image-from-base64, remarkable-upload-pdf, remarkable-optimize-pdf, remarkable-download-document)
- **checkCommandExists Whitelist**: `check-command-exists` IPC-Handler akzeptiert nur noch explizit erlaubte Kommandos (opencode, claude, wsl, gs, qpdf) statt beliebiger Eingaben

## [0.2.19-alpha] - 2026-02-25

### Fixes
- **Wikilink Hover-Preview**: Vorschau rendert jetzt LaTeX und Callouts korrekt durch dieselbe Rendering-Pipeline wie die normale Markdown-Preview

## [0.2.18-alpha] - 2026-02-24

### Fixes
- **reMarkable USB-Verbindung**: Stabilere Erkennung und Dokumentabfrage über `electron.net`, inklusive robusterem JSON-Parsing und Kompatibilität für `VissibleName`/`VisibleName`

## [0.2.17-alpha] - 2026-02-24

### Features
- **reMarkable USB-Integration**: Neue native Anbindung an reMarkable-Geräte mit Import-/Export-Workflow für Notizen über USB
- **reMarkable Panel**: Neues Sidebar-Panel inklusive Gerätestatus, Aktionen und UI-Flow für die reMarkable-Synchronisierung

### Improvements
- **Main/Preload IPC-Erweiterung**: Neue reMarkable-Handler und geteilte Typen für eine saubere, sichere Bridge zwischen Main- und Renderer-Process
- **Website-Onboarding für Windows**: Klarere Hinweise für Windows-Nutzer im Alpha-Signup-Flow

## [0.2.16-alpha] - 2026-02-23

### Features
- **Windows + WSL Support**: KI-Tool-Erkennung sucht jetzt automatisch innerhalb von WSL (Windows Subsystem for Linux) nach opencode und claude — der 🤖-Button startet `wsl opencode` bzw. `wsl claude` direkt aus dem Terminal. **Windows-User können damit erstmals das volle KI-Terminal nutzen!**
- **Alpha-Tester Signup**: Neue Anmeldesektion auf der Website — E-Mail-Formular (Formspree) mit OS-Auswahl, Honeypot-Bot-Schutz und WSL-Schnellstart-Anleitung für Windows-User
- **Discord-Integration**: Discord-Link mit offiziellem Logo im Signup-Footer und auf der gesamten Website

### Improvements
- **Signup-Formular Redesign**: Poliertes UI mit Accent-Gradient-Leiste, Alpha-Badge, Inline-Icons in Eingabefeldern und Discord-Logo im Footer
- **Download-Gate**: Downloads sind jetzt hinter dem Alpha-Tester-Formular — Besucher melden sich zuerst an
- **GitHub-Sicherheit**: Dependabot für wöchentliche npm-Dependency-Checks aktiviert, Branch Protection auf master (kein Force-Push)

## [0.2.15-alpha] - 2026-02-23

### Features
- **Force Sync**: Bei SAFETY-Fehlern (Mass-Deletion-Schutz) erscheint jetzt ein "Sync erzwingen"-Button, um den Sync manuell zu bestätigen und fortzusetzen

### Fixes
- **AI-Tool Erkennung**: `~/.opencode/bin` zum erweiterten PATH hinzugefügt — opencode wird jetzt korrekt erkannt und bevorzugt statt auf claude zurückzufallen

## [0.2.14-alpha] - 2026-02-22

### Features
- **Syntax Highlighting**: Code-Blöcke in der Preview werden jetzt mit highlight.js farblich hervorgehoben — unterstützt 20+ Sprachen (JS, TS, Python, Rust, Go, SQL, etc.) mit VS Code-inspiriertem Dark-Theme
- **Code Copy Button**: Kopierschaltfläche auf Code-Blöcken in Editor-Preview, Flashcards und NotesChat — mit visueller Bestätigung nach dem Kopieren
- **CodeMirror Sprachunterstützung**: Fenced Code Blocks im Editor erhalten jetzt Syntax Highlighting für JS, TS, JSX, TSX, HTML und CSS

### Improvements
- **Tab-Titel Sync**: Tab-Titel aktualisieren sich automatisch wenn sich der Notiz-Titel ändert
- **Canvas Tab-Titel**: "In Canvas öffnen" zeigt jetzt den tatsächlichen Notiz-Titel statt des Dateinamens
- **Code-Block Styling**: Modernisiertes Design mit dunklem Hintergrund, Zeilennummern und abgerundeten Ecken

## [0.2.13-alpha] - 2026-02-21

### Features
- **Smart AI-Tool Erkennung**: Terminal-Bot-Button erkennt automatisch verfügbare AI-CLI-Tools (opencode bevorzugt, claude als Fallback) — Button passt Tooltip an und wird deaktiviert wenn kein Tool gefunden wird

## [0.2.12-alpha] - 2026-02-20

### Features
- **Ordner ausblenden**: Ordner können per Rechtsklick im FileTree ausgeblendet werden — versteckte Ordner über Augen-Toggle in der Sidebar temporär einblendbar (ausgegraut), Einstellung persistiert in graph.json

## [0.2.11-alpha] - 2026-02-20

### Features
- **Apple Erinnerungen**: Aus E-Mail-Aktionen und Notiz-Tasks direkt Apple Erinnerungen erstellen (macOS) — mit Titel, Fälligkeitsdatum, Uhrzeit und Kontext
- **InboxPanel suggestedActions**: Vorgeschlagene Aktionen aus der E-Mail-Analyse werden jetzt im Detail-View angezeigt — mit Datum-Badges und Reminder-Button
- **FileTree Kontextmenü**: Neuer Menüpunkt "Apple Erinnerungen erstellen" für Markdown-Dateien — erstellt Erinnerungen aus allen offenen Tasks mit Datum

### Improvements
- **E-Mail-Zusammenfassung**: Markdown-Formatierung (fett, kursiv) wird jetzt in der Zusammenfassung gerendert

## [0.2.10-alpha] - 2026-02-19

### Features
- **E-Mail-Integration**: IMAP-Abruf mit automatischer Ollama-Analyse — E-Mails werden regelmäßig abgerufen, nach Relevanz gefiltert und als Notizen im Vault gespeichert
- **E-Mail-Konfiguration**: Mehrere Accounts, Instruktions-Notiz für individuelle Analyse-Anweisungen, Relevanz-Schwellenwert, Abrufintervall und Modellauswahl
- **edoobox-Agent**: Akkreditierungsformulare (.docx) importieren, Veranstaltungen automatisch parsen und an edoobox API senden
- **Agent Panel**: Neues UI-Panel zur Verwaltung importierter Veranstaltungen mit Status-Tracking (Importiert/Gesendet/Fehler)
- **Agenten-Tab**: Neuer Settings-Tab "Agenten" — E-Mail und edoobox zentral konfigurierbar

### Improvements
- **E-Mail → Agenten-Tab**: E-Mail-Einstellungen von "Integrationen" nach "Agenten" verschoben — logisch konsistente Gruppierung aller automatisierten Aufgaben
- **E-Mail-Sicherheit**: Prompt-Injection-Warnung im E-Mail-Modul für sicherheitsbewusste Nutzung

### Fixes
- **E-Mail-Abruf**: Neueste E-Mails werden zuerst geladen, 3-Tage-Fenster für neue Vaults verhindert Massenimport

## [0.2.7-alpha] - 2026-02-16

### Features
- **Readwise-Integration**: Native Synchronisierung von Readwise-Highlights in den Vault — Bücher, Artikel, Podcasts und mehr mit Cover-Bildern, Kategorie-Filter, inkrementellem Sync und Auto-Sync
- **Readwise-Kategorien**: Auswählbare Kategorien (Bücher, Artikel, Tweets, Podcasts, Supplementals) zum gezielten Filtern der Synchronisierung
- **Readwise-Cover**: Buchcover werden automatisch heruntergeladen und lokal gespeichert

### Improvements
- **Readwise-Dateien**: Nach dem Sync werden neue Notizen sofort im Editor mit Inhalt angezeigt — kein Vault-Reload mehr nötig

## [0.2.6-alpha] - 2026-02-16

### Fixes
- **LanguageTool**: Korrekturvorschläge werden jetzt zuverlässig im Popup angezeigt — Click-Handler nutzt nun CodeMirror's Position-API statt unzuverlässige DOM-Traversierung
- **LanguageTool**: Popup schließt sich beim Klick außerhalb automatisch

## [0.2.5-alpha] - 2026-02-15

### Features
- **Sync-Trash**: Vom Sync gelöschte Dateien werden in `.sync-trash/` verschoben statt unwiderruflich gelöscht — Dateien sind jetzt wiederherstellbar
- **Flashcard-Merge**: Sync-Konflikte bei Flashcards werden per JSON-Merge nach Card-ID gelöst statt überschrieben

### Improvements
- **Sync-Sicherheit**: Strengere Mass-Deletion-Schwellenwerte (>10% und ≥10 Dateien) für lokale und remote Löschungen
- **Manifest-Handling**: Frisches Manifest bei neuem Vault verhindert fehlerhafte Löschungen durch veraltete syncedAt-Werte

## [0.2.4-alpha] - 2026-02-15

### Features
- **Selektive Synchronisierung**: Ordner und Dateitypen können vom Sync ausgeschlossen werden (Einstellungen > Sync)
- **Sync-Protokoll**: Transparentes Log aller Sync-Aktivitäten (Uploads, Downloads, Konflikte, Fehler) in den Einstellungen
- **Gelöschte Dateien wiederherstellen**: Auf dem Server gelöschte Dateien werden 7 Tage aufbewahrt und können wiederhergestellt werden
- **Sync-Server**: mindgraph-sync-server als Teil des Repositories hinzugefügt

### Improvements
- **Sync-Sicherheit**: Mass-Deletion-Schutz verhindert versehentliches Löschen von >50% der lokalen Dateien
- **Vault-ID-Validierung**: Sync prüft die Vault-ID auf korrektes Format, verhindert korrupte IDs
- **notes-cache.json vom Sync ausgeschlossen**: Interne Cache-Dateien werden nicht mehr synchronisiert
- **Lokale Dateilöschungen**: Werden jetzt korrekt erkannt und an den Server propagiert
- **Gelöschte Dateien UI**: Automatisches Neuladen nach Wiederherstellung, Neu-Laden-Button immer sichtbar
- **Onboarding**: Setzt sich beim erneuten Öffnen auf die erste Seite zurück (Shift+Cmd+O)
- **Properties Panel**: Wird jetzt auch bei neuen Dateien ohne Frontmatter angezeigt

### Fixes
- **Kritischer Sync-Bug behoben**: Korrupte Vault-ID konnte dazu führen, dass alle lokalen Dateien gelöscht werden
- **Server Soft-Delete**: Server verwendet jetzt Soft-Delete statt Hard-Delete für Dateien

### Website
- Alle Emojis durch SVG-Icons ersetzt
- Neuer Blog-Post: "Preiskampf, Sicherheitskrise und das Web als KI-Datenbank"

## [0.2.3-alpha] - 2026-02-14

### Features
- **Formatierungsleiste**: Neue sichtbare Toolbar mit Buttons für Bold, Italic, Strikethrough, Code, Überschriften (H1-H3), Listen, Checkboxen, Zitate, Links und Trennlinien
- **Hilfe-Guide**: Icon-Übersicht jederzeit aufrufbar über `?`-Button in der Titelleiste oder `Cmd+/`
- **Aufzählungslisten in applyFormat**: Neue Formatierungsoptionen für Bullet Lists, nummerierte Listen und horizontale Trennlinien

### Improvements
- **Onboarding überarbeitet**: Icon-Übersicht auf Seite 3 zeigt jetzt alle App-Icons korrekt, profilspezifisch (Smart Connections, Notes Chat nur für Wissensarbeiter)
- **Schüler-Profil**: Startet jetzt mit sichtbarer Formatierungsleiste und Preview-Modus
- **Alle Profile**: Dateien öffnen standardmäßig in der Preview-Ansicht
- **Live Preview erweitert**: Versteckt jetzt auch Aufzählungszeichen (`- `), nummerierte Listen und Blockquotes (`> `) visuell

### Fixes
- **Settings-Hinweistexte**: Labels und Beschreibungen in den Einstellungen werden nicht mehr ohne Zeilenumbruch zusammengeschoben (`.settings-hint` CSS Fix)
- **Sidebar**: Such-Icon in der Übersicht ergänzt

## [1.0.27-alpha] - 2026-02-13

### Security Fixes
- **Registrierungs-Gate fuer Sync**: Client wartet jetzt auf Server-Bestaetigung (`registered`) bevor Sync-Operationen starten. Zuvor konnte ein geloeschtes Vault weiterhin Dateien hochladen.
- **Server-seitige Registrierungspruefung**: Alle Dateioperationen (Upload, Download, Delete, Manifest) pruefen ob der Client registriert ist.

### Bug Fixes
- **Geloeschtes Vault konnte Dateien hochladen**: Ein vom Server geloeschtes Vault konnte sich reconnecten und Dateien hochladen, da der Client nicht auf die Registrierungsbestaetigung wartete.
- **Server Vault-Loeschung bereinigt files-Tabelle**: `deleteVault()` loescht jetzt sowohl `vault_meta` als auch `files` Eintraege.

### Improvements
- Admin API: Neue Endpoints `GET /admin/vaults` und `DELETE /admin/vaults/:id`

## [1.0.26-alpha] - 2026-02-13

### Features
- **E2E-verschlüsselte Vault-Synchronisation**: Vollständig verschlüsselte Synchronisation über WebSocket-Relay-Server mit AES-256-GCM-Verschlüsselung
- **Aktivierungscode-System**: Sync erfordert einen Aktivierungscode zur Registrierung neuer Vaults
- **Konfigurierbarer Relay-Server**: Eigene Sync-Server-URL kann in den Einstellungen angegeben werden
- **Per-Vault Sync-Konfiguration**: Jedes Vault speichert seine Sync-Einstellungen unabhängig

### Security & Safety
- **Cross-Vault-Schutz**: `savedForVault`-Feld validiert, dass Sync-Konfiguration zum korrekten Vault gehört
- **SyncEngine Destroyed-Flag**: Blockiert alle Dateioperationen nach Disconnect
- **Pfad-Traversal-Schutz**: Jeder Dateischreibvorgang prüft, dass das Ziel innerhalb des Vault-Verzeichnisses liegt
- **Race-Condition-Schutz**: Erkennt Vault-Wechsel während asynchroner Sync-Operationen

### Improvements
- Parallele Uploads/Downloads (5 gleichzeitig)
- Sync-Lock verhindert konkurrierende Operationen
- Automatische Wiederverbindung bei Vault-Wechsel

## [1.0.23-beta] - 2026-02-09

### Features
- **Anki Import (.apkg)**: Karteikarten aus Anki-Decks importieren mit Medien-Extraktion (Bilder, Audio). Unterstützt Basic, Reversed und Cloze-Karten
- **Bilder im Karteikarten-Editor**: Bild-Upload per Button (File-Picker) und Clipboard-Paste (Cmd+V) beim Erstellen von Karteikarten
- **Bidirektionale Canvas-Verbindungen**: Neue Verbindungen im Canvas werden automatisch in beide Dateien geschrieben (Hin- und Rücklink)
- **Bidirektionale Edge-Darstellung**: Hin- und Rücklinks werden als eine Kante mit Pfeilen an beiden Enden dargestellt statt als zwei separate Kanten

### Fixes
- **Flashcard-Bilder**: Bilder in Karteikarten werden jetzt korrekt angezeigt (MarkdownContent mit vaultPath-basierter Bildauflösung)
- **Canvas: Notiz im gefilterten Ordner**: Neue Notizen aus Canvas-Drag werden jetzt im aktuell gefilterten Ordner erstellt
- **Link-Zählung**: Bild-Embeds (`![[bild.svg]]`) werden nicht mehr als Wikilinks gezählt
- **Link-Zählung im FileTree**: Zeigt jetzt nur ausgehende Wikilinks (konsistent mit dem Dokumentinhalt)
- **Dateinamen mit Leerzeichen**: Bilder mit Leerzeichen im Dateinamen werden jetzt korrekt in Markdown eingefügt (Leerzeichen → Bindestrich)

## [1.0.22-beta] - 2026-02-08

### Security
- **DOMPurify HTML-Sanitization**: Alle `dangerouslySetInnerHTML`- und `innerHTML`-Ausgaben werden jetzt mit DOMPurify sanitized — verhindert XSS über bösartige Markdown-Dateien, SVGs oder AI-Antworten
- **SVG-Sanitization**: SVG-Dateien im ImageViewer werden mit spezieller SVG-Sanitization gerendert (Script-Tags, Event-Handler und foreignObject werden entfernt)
- **HTML-Escaping**: Alle user-kontrollierten Werte (Dateinamen, Notiz-Namen, Fehlermeldungen) in innerHTML-Templates werden jetzt HTML-escaped
- **Mermaid Security**: `securityLevel` von `loose` auf `strict` geändert — verhindert Click-Callbacks und HTML-Labels in Diagrammen
- **KaTeX Trust**: `trust` von `true` auf `false` geändert — blockiert potenziell gefährliche KaTeX-Befehle
- **Zustand Selector-Optimierung**: `useShallow` für Store-Aufrufe im MarkdownEditor — verhindert unnötige Re-Renders bei Panel-Wechseln

### Fixes
- **Preview-Bilder bei Panel-Wechsel**: Geladene Bilder werden jetzt gecacht und direkt in den HTML-String eingebettet — SVGs/Bilder verschwinden nicht mehr beim Öffnen von Karteikarten oder anderen Panels

## [1.0.21-beta] - 2026-02-08

### Features
- **Standard-Ansicht Preview**: Notizen öffnen jetzt standardmäßig in der Preview-Ansicht statt im Editor. Einstellbar unter Settings → Editor → Standard-Ansicht.

### Fixes
- **Bilder/SVGs in Preview zuverlässig**: Eingebettete Bilder (SVG, PNG etc.), Wikilink-Embeds und PDFs werden jetzt zuverlässig beim ersten Laden und nach Panel-Wechseln (z.B. Karteikarten) angezeigt
- **Live-Preview Bild-Caching**: Bilder im Live-Preview-Modus werden gecacht, um wiederholte IPC-Aufrufe zu vermeiden und Flickern zu reduzieren

## [1.0.20-beta] - 2026-02-07

### Features
- **Karteikarten Statistik-Dashboard**: Neuer "Statistik"-Tab im Karteikarten-Panel
  - **Lern-Streak**: Aktuelle Streak-Tage, längster Streak und Lerntage gesamt mit Flammen-Icon
  - **Kalender-Heatmap**: 12-Wochen Aktivitätsübersicht im GitHub-Style (5 Grün-Abstufungen)
  - **Quick Stats**: Karten gesamt, aktive Karten, heute gelernt/richtig, gefestigte Karten, durchschn. Leichtigkeit
  - **Anstehende Wiederholungen**: 7-Tage Balkendiagramm mit fälligen Karten pro Tag
  - **Backward-Kompatibilität**: Bestehende Lern-Daten werden automatisch aus lastReview übernommen
  - Persistenz in separater `study-stats.json` (unabhängig von flashcards.json)

### Fixes
- **SVG-Bildansicht**: SVG-Dateien werden jetzt korrekt in der Bildansicht dargestellt (inline-Rendering statt base64 Data-URL, behebt Darstellungsprobleme bei SVGs ohne explizite width/height)

## [1.0.19-beta] - 2026-02-06

### Features
- **Akzentfarben**: 6 neue Farben (Rosé, Koralle, Malve, Mint, Limette, Gold) → 12 Akzentfarben gesamt
- **Hintergrundfarben**: 6 neue Farben (Rosenblatt, Kirschblüte, Meeresschaum, Pistazie, Limonade, Baumwolle) → 15 Hintergründe gesamt
- **Custom Logo**: Eigenes Logo hochladen, das in der Titelleiste angezeigt wird (PNG, SVG, JPG, WebP)
- **Dynamische Version**: Settings-Footer zeigt aktuelle App-Version statt hardcoded v1.0.5
- **Beta-Badge**: Beta-Status sichtbar in Titelleiste, Settings-Footer und package.json
- **Kontextmenü**: Emojis durch einheitliche SVG-Icons ersetzt
- **Preview-Kopieren**: Rechtsklick im Preview-Modus zeigt Kopieren-Menü für selektierten Text

### UI
- **Farb-Picker**: Flex-Wrap für Akzent- und Hintergrundfarben (mehrzeilige Darstellung)

## [1.0.18] - 2026-02-06

### Fixes
- **Windows Installer**: Installation jetzt nach `C:\Program Files\` statt ins User-Verzeichnis (NSIS `perMachine`)
- **Windows Taskbar**: Taskleisten-Pin bleibt nach Updates erhalten (stabiler Installationspfad)
- **Windows Installer UX**: Installations-Dialog mit Ordnerauswahl statt One-Click-Install

## [1.0.17] - 2026-02-06

### Fixes
- **Vault-Persistierung**: Vault wird nach App-Neustart wieder korrekt geladen (Race Condition zwischen Settings-Laden und Vault-Loading behoben)
- **Upgrade-Pfad**: Bestehende User sehen beim Update kein unnötiges Onboarding mehr

## [1.0.16] - 2026-02-05

### Features
- **Onboarding**: Willkommen-Screen mit Setup-Wizard beim ersten Start
  - Sprachwahl (Deutsch/Englisch) direkt auf dem Welcome-Screen
  - Vault-Einrichtung: Bestehenden Vault öffnen, Starter-Vault oder leeren Vault erstellen
  - Starter-Vault mit Beispielnotizen (Canvas, Dataview, Flashcards, Zotero)
  - KI-Setup: Automatische Erkennung von Ollama und LM Studio
  - Feature-Übersicht mit Tastenkürzel-Tipps

### Fixes
- **Canvas**: Hierarchisches Layout stürzt nicht mehr ab bei zyklischen Verlinkungen (A→B→C→A)
- **Canvas Performance**: Layout-Algorithmus optimiert (Map-Lookups statt indexOf, niedrigere Fallback-Schwellen, 3s Timeout)

## [1.0.15] - 2026-02-05

### Fixes
- **Windows**: Dateien werden nicht mehr doppelt im Canvas angezeigt beim Erstellen neuer Notizen (Pfad-Normalisierung für Windows Backslashes)

## [1.0.14] - 2026-02-03

### Features
- **Windows-Support**: MindGraph Notes ist jetzt auch für Windows verfügbar (Installer + Portable)
- **Terminal**: Plattformübergreifende Terminal-Unterstützung (PowerShell auf Windows, zsh auf macOS/Linux)

## [1.0.13] - 2026-02-03

### Fixes
- **FileTree**: Beim Umbenennen von Dateien wird die ursprüngliche Dateiendung beibehalten (jpg, png, pdf.md, etc.) statt immer .md anzuhängen
- **Editor**: Race-Condition beim Notizwechsel behoben - der Editor zeigt jetzt zuverlässig den Content der ausgewählten Notiz

## [1.0.12] - 2026-02-03

### Features
- **FileTree**: Rechtsklick auf Ordner → "Im Canvas anzeigen" öffnet Canvas mit diesem Ordner gefiltert

### Fixes
- Properties Panel: Hinzufügen von neuen Eigenschaften mit + Button funktioniert jetzt
- **Canvas Performance**: Große Vaults (3000+ Notizen) werden jetzt schnell im Canvas angezeigt durch gecachte Ordner-Counts
- **Sidebar-Panels**: Klick auf Panel-Button öffnet dieses Panel und schließt andere automatisch

## [1.0.11] - 2026-02-02

### Features
- **Tag-Autocomplete**: Im Properties Panel werden beim Tags-Feld alle existierenden Vault-Tags als Vorschläge angezeigt

### Fixes
- YAML-Arrays werden jetzt immer im Block-Format mit Spiegelstrichen gespeichert
- `#` Präfix wird automatisch von Tags entfernt (Anzeige und Speicherung)
- Komma-Eingabe zum Hinzufügen neuer Tags funktioniert jetzt korrekt

## [1.0.10] - 2026-02-02

### Features
- **Dataview Query System**: Abfragen von Notizen nach Metadaten
  - Query-Typen: `LIST` und `TABLE`
  - `FROM`: Filtern nach Tags (`#tag`) und Ordnern (`"Folder/Path"`)
  - `WHERE`: Bedingungen mit Vergleichen (`=`, `!=`, `>`, `<`, `>=`, `<=`)
  - `SORT`: Sortierung mit `ASC`/`DESC`
  - `LIMIT`: Ergebnisse begrenzen
  - Built-in Funktionen: `contains()`, `length()`, `lower()`, `default()`
  - Zugriff auf `file.*` Felder und YAML-Frontmatter

- **Properties Panel**: Komfortable Bearbeitung von YAML-Frontmatter
  - Anzeige oberhalb des Editors
  - Automatische Typ-Erkennung: Boolean (Checkbox), Zahlen, Datum, Arrays, Text
  - Eigenschaften hinzufügen und entfernen
  - Erhält Original-Schreibweise der Keys (z.B. `Künstler`)
  - **Tag-Autocomplete**: Vorschläge aus allen existierenden Vault-Tags
  - YAML-Arrays immer im Block-Format mit Spiegelstrichen

- **Dataview-Hilfe**: Neuer Tab in Einstellungen mit Syntax-Dokumentation

### Technische Änderungen
- Edit-Modus zeigt Dataview-Code, Live-Preview zeigt Ergebnisse
- Frontmatter-Caching für bessere Query-Performance
- Support für deutsche Umlaute in Frontmatter-Feldnamen
- Große Zahlen (Timestamps) werden als Text statt als Zahl angezeigt
- Neue Stores: `dataviewStore.ts`
- Neue Utils: `metadataExtractor.ts`, `dataview/` (Parser, Executor, Renderer)
- CodeMirror-Extension für Dataview-Block-Rendering

## [1.0.9] - 2026-02-01

### Features
- **Karteikarten & Quiz-System**: Lerne aus deinen Notizen mit Spaced Repetition
  - Rechtsklick auf Notiz oder Ordner → "Quiz starten" generiert Fragen via Ollama
  - Quiz-Fragen können als Karteikarten gespeichert werden
  - **SM-2 Algorithmus**: Optimale Wiederholungsintervalle für effektives Lernen
  - Karteikarten-Panel zeigt alle Karten gruppiert nach Themen/Ordnern
  - Lern-Session mit Bewertung (Nochmal/Schwer/Gut/Einfach)
  - Manuelle Karten erstellen und bearbeiten
  - Markdown und LaTeX werden vollständig gerendert

### Einstellungen
- **Karteikarten ein-/ausschalten**: Neuer Toggle in Einstellungen → Integrationen
- Hinweis wenn Ollama nicht konfiguriert ist

### Technische Änderungen
- Neue Stores: `quizStore.ts`, `flashcardStore.ts`
- Neue Komponenten: `QuizModal`, `FlashcardsPanel`, `FlashcardStudy`, `FlashcardEditor`
- IPC-Handler für Quiz-Generierung und Flashcard-Persistenz
- Pro-Vault Speicherung in `.mindgraph/flashcards.json`

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
