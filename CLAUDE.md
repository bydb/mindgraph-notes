# MindGraph Notes

Obsidian-ähnliche Markdown-Notiz-App mit Wissensgraph, Flashcards, Spaced Repetition, Agent-Features, lokalem Brain-Tagesgedächtnis, Relevanz-Radar, Notiz-Kategorien (🔴🟢🔵) und E2E-verschlüsseltem Sync.

## Tech Stack

- **Electron** + **electron-vite** + **React 19** + **TypeScript**
- **CodeMirror 6** als Markdown-Editor (drei Modi: Markdown, Schreiben, Lesen)
- **turndown** für WYSIWYG-Roundtrip im Lesen-Modus (HTML → Markdown)
- **Zustand** für State Management (16 Stores)
- **markdown-it** für Rendering
- **xterm.js + node-pty** für integriertes Terminal
- **imapflow + mailparser + nodemailer + Ollama** für Email-Client (Empfang, Analyse, Versand, IMAP-Sent-Append)
- **@huggingface/transformers + ONNX Runtime** für eingebautes Whisper STT (Renderer)
- **grammy** + eigener Tool-Use-Loop für Telegram-Agent
- **Antares CS** (h+h Software) Reverse-Engineering für Medienzentren-Verleih (Cookie+PID-Session)
- **bge-m3** Embedding-Modell + Ollama-Chat-Modell als LLM-as-Judge-Reranker (Smart Connections)
- CSS mit globalen Variablen (color-mix-Tokens, kein CSS-in-JS Framework)

## Projektstruktur

```
app/
├── src/
│   ├── shared/          # Geteilte Types/Utilities (Main <-> Renderer)
│   │   ├── modelCompatibility.ts  # Per-Modul Verdict-Matrix + isHardLocked
│   │   ├── taskExtractor.ts       # Task-Parser + CRITICAL_TASK_PATTERN + REMINDER_REGEX
│   │   ├── projectMatch.ts        # Keyword-Matcher Mail→Projekt (Renderer + Workflow-Runner)
│   │   └── workflow/              # Workflow Canvas: types, model, registry (Metadaten-only), validation, simulation
│   ├── main/            # Electron Main Process
│   │   ├── index.ts     # IPC-Handler (~13 800 Zeilen, ~295 Handler; wird bereichsweise ausgelagert)
│   │   ├── email/      # Mailclient: ipc.ts (alle 25 email-*-Handler), store.ts (Ablage + Vereinigung)
│   │   ├── preload.ts  # contextBridge API
│   │   ├── ankiImport.ts  # .apkg-Import inkl. Medien-Extraktion
│   │   ├── brain/      # Lokales Tagesgedächtnis (dailyConsolidation.ts, hardcoded localhost:11434)
│   │   ├── calendar/   # macOS EventKit (Swift-Helper)
│   │   ├── llm/        # Unified Chat-Client (Ollama + Anthropic) + chatWithTools()
│   │   ├── telegram/   # Bot (grammy)
│   │   │   └── agent/  # Tool-Use-Loop (loop.ts, confirm.ts, tools/registry|notes|tasks|calendar.ts)
│   │   ├── office/     # DOCX/XLSX/PPTX (officeService.ts)
│   │   ├── noteAgent/  # Notiz-Agent: Loop, Werkzeuge (skills.ts), Shell, Rechner-Steuerung
│   │   ├── petrolChats/ # Petrol-Chat: Gesprächsführung + verschlüsselte Ablage
│   │   ├── rag/ ocr/ brand/ webResearch/ projectStatus/ imageGen/
│   │   ├── plugins/    # Plugin-Host (Registry, Runtime, Katalog, Widgets)
│   │   ├── transport/  # Schnellerfassung (Tray, Shortcut, ⌘D-Diktat)
│   │   ├── voice/      # Whisper-CLI (Fallback zum eingebauten Renderer-STT)
│   │   ├── sync/       # E2E Sync (crypto, fileTracker, syncEngine)
│   │   └── workflows/  # Workflow-Runner (DI via RunnerServices, Hard-Lock, Hand-off)
│   ├── plugins/         # Mitgelieferte Plugins (je manifest.ts + main/ + renderer/)
│   │   ├── antares/     # Antares CS 2.0.4 Reverse-Engineering (service.ts, AntaresWidget)
│   │   ├── edoobox/     # edoobox V2-Client, formularParser, attendanceListService (Teilnehmerliste), iqReportService, AgentPanel „Veranstaltungen“
│   │   ├── wordpress/   # WordPress REST API Client
│   │   └── remarkable/  # reMarkable USB (service, transports/usb, pdfReflow, RemarkablePanel)
│   ├── renderer/
│       ├── components/  # React-Komponenten
│       │   ├── Editor/  # MarkdownEditor + CodeMirror Extensions + WYSIWYG-Lesemodus (turndown)
│       │   ├── Sidebar/ # FileTree (Farbfilter 🔴🟢🔵), Suche, QuickEventModal
│       │   ├── Canvas/  # Graph View (React Flow; Layouts in utils/layoutAlgorithms.ts)
│       │   ├── DashboardPanel/  # Dashboard-Tab + RadarWidget + ActivityWidget (Brain)
│       │   ├── Flashcards/ Quiz/ # Lern-Features
│       │   ├── InboxPanel/  # Smart Email Client (Inbox, Compose-Modal via createPortal, KI-Chat)
│       │   ├── Agent/       # Agent-Tab: Petrol-Chat + Notiz-Agent-Auftrag (AgentView, PetrolChat, AgentRunPanel)
│       │   ├── Terminal/    # Integriertes Terminal (xterm.js + PTY)
│       │   ├── SemanticScholarPanel/  # Semantic Scholar + OpenAlex + Zotero CSL
│       │   ├── NotesChat/ SmartConnectionsPanel/ ZoteroSearch/ WorkflowCanvas/ ...
│       │   └── Settings/ # inkl. ModelCompatibilitySection + ActiveModelStatusBadge
│       │       └── Onboarding/ ...
│       ├── stores/      # Zustand Stores (17, inkl. workflowStore)
│       ├── styles/      # index.css (globale Styles + color-mix-Tokens)
│       └── utils/       # Hilfsfunktionen
│           ├── noteKind.ts        # 🔴🟢🔵-Kategorien zentral (NOTE_KINDS, canvasColor, ...)
│           ├── contextMemory.ts   # localStorage Event-Log (90d Retention, 6 Event-Typen)
│           ├── translations.ts, sanitize.ts, emailContextBuilder.ts, ...
│           └── voice/transformersStt.ts  # Eingebautes Whisper via @huggingface/transformers
├── packages/plugin-api/ # Plugin-API-Paket
├── resources/           # Bundled Assets (Starter-Vaults, Icons, Schulamt-Vorlage)
└── package.json
docs/                    # Website (mindgraph-notes.de)
mindgraph-sync-server/   # Separater Sync-Server (Docker, Hetzner CX23)
```

> Externer Test-Harness für Modell-Benchmarks: `~/dev/brain-model-benchmark/` (außerhalb des Repos).

## Befehle

```bash
cd app
npm run dev          # Entwicklungsserver starten
npm run build        # Production Build (electron-vite build)
npm run preview      # Preview von gebauten Assets
npm run start        # Gebaute App starten
npm run pack         # Unpacked Build erzeugen
npm run dist         # Installer erstellen (electron-builder)
npm run dist:mac     # Nur macOS Installer
npm run typecheck    # tsc --noEmit (läuft auch als prebuild) — schnellster Korrektheits-Check
npm run test         # vitest run — Unit-Tests für pure shared/-Logik
```

> Test-Runner: vitest, bewusst nur für pure `shared/`-Logik (aktuell `shared/emailRelevance.test.ts` — Hybrid-Scorer). Nach Änderungen: `npm run typecheck` (deckt main+renderer+shared ab) + `npm run test`, bei Bedarf `npm run build` (bündelt die drei Prozesse getrennt → fängt Prozessgrenzen-Fehler). UI-Verifikation manuell via `npm run dev`.

## Architektur-Patterns

### IPC-Kommunikation
Neuer IPC-Handler: `ipcMain.handle()` + `contextBridge.exposeInMainWorld()` in `preload.ts`.

**`main/index.ts` wird bereichsweise zerlegt (seit 10.11.2026), nicht in einem Zug.** Wer in einem Bereich ohnehin arbeitet, zieht dessen Handler zuerst unverändert in ein eigenes Modul (eigener Commit ohne Verhaltensänderung), dann erst die Änderung. Muster: `main/email/ipc.ts` — `registerEmailIpc(deps)` wird in `index.ts` an der alten Stelle aufgerufen. **Handler nie beim Import anmelden**, nur in der `register…`-Funktion: Importe laufen vor `app.name` und der Instanzsperre. Was ein Modul aus `index.ts` braucht (`assertSafePath`, `assertApprovedVault`, `validatePath`, Hauptfenster), kommt über das `deps`-Objekt — `index.ts` ist der Einstiegspunkt und nicht importierbar. Neue Handler eines ausgelagerten Bereichs gehören in dessen Modul.

### Instanzsperre je Profil (seit 06.11.2026)
`app.requestSingleInstanceLock()` direkt nach der userData-Isolation in `main/index.ts`; ein zweiter Start mit demselben Profil beendet sich sofort (Log `[startup] MindGraph läuft bereits mit diesem Profil`), die laufende Instanz holt ihr Fenster nach vorn (`main/singleInstance.ts`). Vorher schrieben zwei Instanzen gleichzeitig in dieselben Ablagen (Codex F25, `docs/codex-collab/web-render-stufe-a.md`). Die Sperre hängt am userData-Verzeichnis: Dev-App, installierte App und Testprofile (`MINDGRAPH_USER_DATA_DIR`) sperren sich nicht gegenseitig. **`app.name` muss VOR der Sperre und vor jedem anderen userData-Zugriff stehen**: Electron legt userData beim ersten Zugriff aus appData + App-Name fest und ändert es danach nie. 1.2.4 setzte die Sperre vor den Namen — das Profil fror auf den Paketnamen `mindgraph-notes` ein, die App öffnete ein fremdes Profil, Einstellungen und Vault schienen weg (real, 07.11.2026, Hotfix 1.2.5). Mit `MINDGRAPH_USER_DATA_DIR` getestet fällt das nicht auf (Pfad fest vorgegeben) — Gegenprobe mit gepacktem Build: `SingletonLock` muss in `MindGraph Notes/` liegen. Test `main/appNameOrder.test.ts`. **Dev-Falle:** Ein zweites `npm run dev` bzw. `npx electron-vite dev --remoteDebuggingPort 9222` neben einer laufenden Dev-App beendet sich still — für CDP-Messungen die laufende Dev-App vorher schließen oder ein eigenes `MINDGRAPH_USER_DATA_DIR` setzen.

### State Management (Zustand, 16 Stores)
- **uiStore**: UI-Einstellungen, persisted via `persistedKeys` Array. Enthält u.a. `ollama.moduleModelOverrides`, `brain.folderPath`, `notesRootFolder`, `fileTreeKindFilter`, `editorDefaultView`, `imagesFolder`, `smartConnectionsRerankerEnabled`
- **notesStore**: Notizen, Vault-Daten
- **tabStore**: Tab-Verwaltung (Editor, Canvas, Dashboard, Code-Viewer)
- **graphStore**: Graph-Canvas Positionen, Edges
- **flashcardStore / quizStore**: Lern-Features
- **dataviewStore**: Dataview-Query-Ergebnisse
- **bookmarkStore**: Lesezeichen
- **reminderStore**: Erinnerungen für Tasks
- **syncStore**: Sync-Status (localStorage, key: `mindgraph-sync`)
- **emailStore**: Email-Abruf, Analyse, Compose, KI-Chat, Senden. Modul-Override + `isHardLocked('task-extraction')`-Check + Re-Analyse einzelner Mails (`reanalyzeEmail`)
- **agentStore**: Veranstaltungs-Import, edoobox-Push, Marketing, Status-Tracking, IQ-Export
- **contactStore**: Kontakt-Aggregation (Email + edoobox + Vault)
- **antaresStore**: Antares-CS-Daten (Entleiher, Verleihe, Dashboard-Counts). Zugangsdaten über `host.secrets` des Antares-Plugins (safeStorage, je Plugin getrennt).
- **vaultSettingsStore**: Pro-Vault-Feature-Toggles (`vault-settings.json`)
- **voiceStore**: STT/TTS-State (Engine, Modell-Lade-Status, Aufnahme-State)
- **workflowStore**: Workflow Canvas (Nodes/Edges, Validierung, lokale Simulation, `execute`/`runForNewEmails` via IPC, Autosave nach `workflows.json`)
- Selektoren: `useShallow` aus `zustand/react/shallow` verwenden — siehe `MarkdownEditor.tsx` und `DashboardView.tsx` als Referenz

### Schnellsuche (⌘P) und Quick Switcher (⌘K): drei Namen pro Notiz
- `note.title` kommt aus der ersten H1 — bei KI-Zusammenfassungen fast immer „Zusammenfassung", der sprechende Name steht nur im Dateinamen (`202609031500 - 🟢 Marburger Forum.md`) und im Frontmatter (`title:`). Eine Suche nur über `note.title` fand solche Notizen nicht als Titeltreffer (real, 15.09.2026).
- `shared/noteSearchNames.ts` (`noteSearchNames`, `matchNoteName`, getestet) liefert H1-Titel, Dateiname und Frontmatter-Titel; QuickSearch und QuickSwitcher prüfen alle drei gleichwertig und zeigen den passenden Namen unter dem Titel („Dateiname: …" / „Frontmatter-Titel: …"). Neue Suchstellen (Wikilink-Autocomplete u.a.) sollen denselben Helfer nutzen.

### Modals
Boolean-State in uiStore, `if (!open) return null` im Component.

### Übersetzungen
Dot-notation Keys in `translations.ts`, `useTranslation()` Hook.

### CSS
Globale Variablen in `styles/index.css`. Komponenten-CSS ist colocated.

### Notiz-Kategorien (🔴🟢🔵) — zentrales UI-Konzept
- Alle Kategorien-Logik in `utils/noteKind.ts`. **Niemals duplizieren** — wenn ein neuer UI-Punkt Farbe/Label braucht, `NOTE_KINDS[kind]` nutzen.
- Drei funktionale Kategorien: 🔴 *Problem* (Aktion), 🟢 *Lösung* (Wissen/Guide), 🔵 *Info* (Reader).
- Erkennung in **dieser Reihenfolge**: Frontmatter (`category|noteKind|kind` mit Aliassen red/green/blue/problem/...) → Titel-Emoji am Anfang oder direkt nach " - " (matched z.B. `202604221336 - 🔴 Digitalwoche`). **Pfad-Fallback und Inline-Emoji bewusst nicht** — sonst werden Zettelkasten-Notizen mit zufälligen Emojis fälschlich kategorisiert.
- Frontmatter-Manipulation via Helper aus `noteKind.ts`: `setNoteKindInContent`, `clearNoteKindInContent`, `getNoteStatus`, `markProblemSolvedInContent`, `reopenProblemInContent`, `markProblemArchivedInContent`, `addSolvedForBacklinkInContent`, `completeOpenTasksInContent`.
- UI-Komponenten zeigen 10-px-Status-Dot, nicht das rohe Emoji — siehe `NoteNodes`, `TabBar`, `FileTree`, `Bookmarks`, Editor-Header.

### Editor-Modi (drei): Markdown / Schreiben / Lesen
- **Schreiben** (`live-preview`) ist der Default für Editing, **Lesen** (`preview`) ist der Default beim Öffnen einer Notiz (90% Lesen, 10% Editieren).
- **Lesen-Modus** ist **WYSIWYG mit Inline-Editing** — Änderungen gehen via `turndown` zurück zu Markdown.
- **Turndown-Escape MUSS selektiv konfiguriert sein**: `[`, `]`, `\`, `_` bleiben unangetastet (sonst exponentielle Wikilink-Korruption mit `2ⁿ−1`-Backslash-Wachstum, siehe v0.6.40-Fix). Nur Block-Start-Marker und Inline-Emphasis werden escaped.
- **WYSIWYG-Roundtrip-Regeln für Embeds**: PDF/Office (`data-filename`), Mermaid (`data-source`), Dataview (`data-query`). Embeds werden aus diesen Attributen rekonstruiert, sonst stillschweigend gestrippt.
- **Code-Blöcke im Roundtrip**: Der Lesen-Modus rendert Code-Zeilen als `<span class="code-line">` OHNE `\n` (wrapLines für CSS-Counter-Zeilennummern) — `renderedCodeBlockRule` (`utils/wysiwygCodeBlockRule.ts`) rekonstruiert die Zeilen aus den Spans. Ohne diese Regel presste turndowns Default jeden Code-Block auf EINE Zeile (stille Korruption, traf real den `email-relevance-config`-Block).
- **Suche in der Notiz (⌘F) nur im Lesen-Modus** (`utils/inNoteSearch.ts`): Markdown/Schreiben haben die CodeMirror-Suche. Die Treffer werden über die **CSS-Highlight-Schnittstelle** (`CSS.highlights`, `::highlight(mg-find)`) markiert — **niemals über eingefügte `<mark>`-Elemente**: der Lesen-Modus ist `contentEditable` und schreibt über turndown nach Markdown zurück, jede DOM-Änderung landet beim nächsten Autosave in der Notiz. Die Textsuche selbst ist pur und getestet, der DOM-Teil bildet nur Offsets auf Ranges ab. **`::highlight()` kennt nur wenige Eigenschaften** — `background-color`, `color`, `text-decoration`, `text-shadow`; die Kurzform `background` wirkt NICHT. Ein ungültiger Wert (hier `var(--accent)` statt `var(--accent-color)`) lässt die ganze Regel stillschweigend wegfallen: der Zähler zählt, markiert wird nichts.
- **Wikilinks werden im Lesen-Modus NACH dem Rendern umgewandelt** — der Typograph (`typographer: true`) hat im Text dann schon `'` → `’` ersetzt. Ziel-Attribute (`data-link`, `data-note`, Fragment) laufen deshalb durch `straightenQuotes` (`utils/linkExtractor.ts`), und `findNoteForWikilink` vergleicht beide Seiten gerade; sonst sind Notizen mit Apostroph im Namen nicht anklickbar (real, 20.09.2026, Readwise-Artikel „You'll“).
- **Auto-Heal** für korrupte Wikilinks läuft in jedem `.md`-Write-Pfad (`write-file`, `tasks-update-line`, `tasks-create`) — strippt beliebig viele Backslashes vor `[` und `]`.
- **REMINDER_REGEX in `shared/taskExtractor.ts`** ist tolerant gegenüber `\[\[`, `\\\[\\\[`, etc. — Tasks werden auch in leicht beschädigten Notizen sichtbar.

### Modell-Kompatibilitäts-Matrix
- **Single-Source-of-Truth**: `app/src/shared/modelCompatibility.ts`. Datenstand im File-Header dokumentiert (`version: '2026-05-14'`).
- **Modellnamen-Kanonisierung** (`canonicalModelKey`): Matrix-Keys sind Ollama-Tags, aber LM-Studio-IDs (`qwen/qwen3.5-4b`, `Meta-Llama-3.1-8B-Instruct-GGUF`, `mlx-community/…`) werden auf denselben kanonischen Schlüssel abgebildet — gleiche Gewichte = gleiches Verdict, und der Hard-Lock greift auch bei LM Studio. Fine-Tune-Suffixe (`-abliterated` etc.) erben bewusst NICHTS (fail-closed → untested). MLX-Miss fällt auf den GGUF-Eintrag zurück (nicht umgekehrt).
- 5 Module: `brain`, `task-extraction`, `mail-summary`, `dashboard-snapshot`, `smart-connections`. **`dashboard-snapshot` hat seit dem Wegfall der KI-Relevanzanalyse (08/2026) keinen Verbraucher mehr** — Eintrag und Benchmark-Daten bleiben als Messdokumentation stehen, der Modell-Override in den Einstellungen läuft aber ins Leere.
- 4 Verdicts: `green` (geeignet), `yellow` (Vorbehalt), `red` (Hard-Lock), `untested` (Default für unbekannte Modelle).
- **`damageRelevant: true`** für `task-extraction` und `dashboard-snapshot` → bei `red` echter Code-Lock via `isHardLocked()`.
- **Prio-Reihenfolge im Code**: tab-spezifisches Modell (z.B. `email.analysisModel`) → `ollama.moduleModelOverrides[module]` → globales `selectedModel`.
- **UI**: `ModelCompatibilitySection` in Settings → KI & Modelle, Aufklapper in der Modelle-Karte (Anker `ai-matrix`); `ActiveModelStatusBadge` unter dem Modell-Picker.
- **Empirische Grundlage**: `~/dev/brain-model-benchmark/results/`. Aktuelle Werte aus 160 Läufen vom 14.05.2026 (siehe Analyse-Dokument `~/2026/100 - ✅ Projekte/110 - MindGraph-Notes/Modell-Kompatibilitaets-Analyse.md`).
- **Bei neuen Benchmarks**: Daten in `modelCompatibility.ts` einpflegen, `version` updaten, Analyse-Dokument updaten.
- **Chat-Auswahlen zeigen nur chatfähige Modelle** (`shared/chatModels.ts`, getestet): `chatModelsOnly` nach Ollamas `capabilities` (`completion`), Reranker/Embedding zusätzlich am Namen; ohne gemeldete Fähigkeiten bleibt ein Modell drin (alte Ollama-Versionen, LM Studio). Automatische Vorauswahl über `firstChatModel`, nie `models[0]` — das erste Listenmodell war real `bge-m3`, jeder Chat endete mit „Ollama API Fehler: 400“ (28.10.2026). Ein gespeichertes ungeeignetes Modell wird in Einstellungen → KI markiert, nicht still getauscht. Die Embedding-Auswahl und der Modellzähler nutzen weiter die volle Liste.
- **Ollama-Fehler nie als nackte Nummer** (`shared/ollamaError.ts`, `friendlyOllamaError`): Ollama schickt den Grund als `{"error": …}`; die Meldung nennt Modell und nächsten Schritt („kann keine Texte schreiben“, „nicht installiert → ollama pull“, „kein Modell ausgewählt“, Cloud-Login). Neue Ollama-Aufrufe diesen Helfer nutzen.

### Brain — lokales Tagesgedächtnis
- Pfad: `main/brain/dailyConsolidation.ts`.
- **Hardcoded `localhost:11434` (Ollama)** — Privacy-Constraint. **Niemals** auf den generischen LLM-Provider-Switch umstellen, sonst geht die Marketing-Aussage „verlässt nie deinen Rechner" verloren.
- Sensoren: berührte Notizen (aus `contextMemory` + Datei-mtime), erledigte Tasks, empfangene/beantwortete Mails, optional Daily-Note-Body (≤2000 Zeichen).
- Output: 4-Sektionen-Schema (Heute im Fokus / Was ich gemacht habe / Offene Fäden / Beobachtung) mit Frontmatter `type: brain-day`.
- **Wikilink-Postprocessor** in `dailyConsolidation.ts`: wickelt exakte Titel im Output in `[[…]]`, falls Modell die Regel ignoriert.
- **Phantom-Notiz-Filter** (v0.6.45): Sensor filtert Events aus `contextMemory` zu nicht mehr existierenden Notizen heraus — vorher wurden gelöschte/verschobene Notizen als „berührt" gemeldet.
- **Tageszusammenfassungen werden nie überschrieben** — wiederholte Klicks erzeugen `TT (2).md`, `TT (3).md`. Human-in-the-Loop ist Architektur, kein Setting.
- Default-Ordner: `800 - 🧠 brain/JJJJ/MM/TT.md` (konfigurierbar via `brain.folderPath`).

### Automatische Backups
- `<vault>/.mindgraph/backups/JJJJ-MM-TT/<relpath>/<dateiname>.<timestamp>.bak` vor jedem `.md`-Write.
- **Hard-Block für leere Writes** auf nicht-leere Markdown-Dateien im `write-file`-Handler — zweite Verteidigungslinie unabhängig vom Editor.
- Backups **vom Sync ausgeschlossen** (bleiben lokal).

## Feature-Details: `.claude/rules/` (seit 09.11.2026)

Diese Datei hält nur, was überall gilt. Feature-Wissen liegt in pfadgebundenen Regeldateien unter `.claude/rules/`; Claude Code lädt eine Datei erst, wenn Code aus ihren `paths:` gelesen wird. **Neues Feature-Wissen dorthin schreiben, nicht hierher** — diese Datei soll unter ~30 KB bleiben. Wer an `main/index.ts` (betrifft alles) arbeitet, die passende Regeldatei selbst lesen.

| Datei | Inhalt |
|---|---|
| `petrol-chat.md` | Agent-Tab Chat: Gesprächsführung im Main, Verlauf, Websuche (schnell/gründlich/Schleife), Satzprüfung, automatische Suche, Lernkarten |
| `note-agent.md` | Notiz-Agent Kern: Ordner auswerten, Modellweg + Cloud-Zustimmung, Webrecherche, Bilder/OCR, Skill-Zeichengrenze (12 000) |
| `note-agent-outputs.md` | `write_html`, `write_docx`, `write_pptx`, `write_excalidraw`, `write_edumap`, Veranstaltungsjournal, Edupool, Hausdesign-Builder |
| `note-agent-system-access.md` | Agent-Shell (Sandbox) und Rechner-Steuerung |
| `vault-rag.md` | Vault-Index, Vault-Chat, Smart Connections |
| `workflow-canvas.md` · `graph-canvas.md` | Workflow-Automationen · Graph-Ansicht |
| `settings-ui.md` | Einstellungs-Bausteine (`SettingsUI`), Auto-Save, Modul ↔ Konfiguration |
| `dashboard.md` | Relevanz-Radar, Arbeitsbilanz/Zeitbilanz, Kontextgedächtnis |
| `editor.md` | CodeMirror-Extensions, HTML-Vorschau, PDF/EPUB-Export |
| `display-voice-capture.md` | Präsentationsmodus/GPU, Zettel-Schnellerfassung, Whisper, Sprachausgabe/MP3 |
| `email.md` | Mail-Empfang, Versand, KI-Assistent, Kontakte |
| `sync.md` · `release-signing.md` | E2E-Sync · Apple/Windows-Signierung, Snap |
| `telegram.md` · `remarkable.md` · `integrations.md` | Telegram-Agent · reMarkable · Antares, edoobox, Terminal |

## Sicherheit

- **`pdfjs-dist` ist EXAKT auf `5.4.296` verankert** (kein `^`) — nicht aufräumen. Die 5.7er-Reihe hat eine Lücke mit beliebiger JavaScript-Ausführung beim Öffnen einer präparierten PDF (verwundbar: `>=5.6.83 <6.2.108`); 5.4.296 liegt darunter. Ein `npm update` mit `^5.4.296` springt genau hinein — real passiert am 28.08.2026. Zusätzlich steht an allen drei Aufrufstellen `isEvalSupported: false` (`noteAgent/contextFiles.ts`, `plugins/remarkable/pdfReflow.ts`, `renderer/pdfRaster/pdfRaster.ts`); die Option existiert ab 5.7 nicht mehr, weil der eval-Pfad dort entfiel — kein Grund, auf 5.7 zu gehen. Der Ausweg nach vorn ist `6.2.108`, aber das ist ein Major-Sprung neben `react-pdf@10` und gehört getestet.
- **Nach jedem Dependency-Update `npm audit` laufen lassen**, nicht nur die Dependabot-Liste abarbeiten. Dependabot bewertet den Stand VOR der Änderung; eine durch das Update neu eingeschleppte Lücke taucht dort nicht auf.
- **HTML-Sanitization**: Immer `sanitizeHtml()` / `sanitizeSvg()` / `escapeHtml()` aus `utils/sanitize.ts`
- **Mermaid**: `securityLevel: 'strict'`
- **KaTeX**: `trust: false`
- Keine `dangerouslySetInnerHTML` ohne Sanitization

## Release-Prozess

1. Version in `app/package.json` bumpen — danach `npm install --package-lock-only` in `app/`, sonst bleibt `package-lock.json` auf der alten Version stehen
2. In `docs/index.html` **nur** `"softwareVersion"` im JSON-LD (`<script id="app-schema">`) anfassen — das ist die einzige Versionsquelle der Seite. Hero-Badge (`hero.release`) und Release-Zeile im Download-Abschnitt (`release.lead`) lesen sie über das Token `{vs}` (Kurzform ohne `-beta`) — diese beiden Schlüssel stehen deshalb auch in `translations.de`; alle übrigen deutschen Texte sammelt das Skript beim Laden aus dem Markup ein (nur EN steht im `translations`-Objekt). Download-Karten über `[data-app-version]` (voller Tag); der Inline-Text ist nur der No-JS-Fallback. Den Release-**Text** `release.lead` inhaltlich neu schreiben, DE (in `translations.de` UND im Markup) **und** EN. Die Seite richtet sich seit 10/2026 an Bildung, Hochschule, Verwaltung und Mittelstand, Anrede „Sie“, Grafiken als Inline-SVG statt Screenshots
3. `<lastmod>` in `docs/sitemap.xml` auf das Release-Datum setzen
4. `CHANGELOG.md` aktualisieren — Versions-Heading `## [X.X.XX-beta] - JJJJ-MM-TT`; der Was-ist-neu-Dialog schneidet genau diese erste Zeile weg (`extractVersionSection`). **Der Eintrag wird fremden Nutzern gezeigt** (Dialog, Website-Karte, GitHub): zuerst ein fetter Satz „Was kann ich jetzt“ plus höchstens drei Sätze Nutzen, dann `### Hintergrund` mit Auslöser, Helfern, Grenzen. Keine eigenen Notizen als Beispiel, keine Quelldateinamen, kein Testprotokoll
5. Commit: `"Bump version to X.X.XX-beta"`
6. Tag: `git tag vX.X.XX-beta && git push origin vX.X.XX-beta`
7. GitHub Actions baut automatisch:
   - macOS (arm64+x64) — signiert + notarisiert
   - Linux (AppImage+deb+snap)
   - Windows (exe) — signiert (Certum SimplySign, Details in `.claude/rules/release-signing.md`)
8. Release wird automatisch auf GitHub erstellt via `softprops/action-gh-release`
9. Snap wird automatisch zum Snap Store (edge channel) hochgeladen

Oder: `/release` Command verwenden.

## FS-IPC Security (`approvedVaultRoots`)

- **Defense-in-Depth gegen kompromittierten Renderer** (XSS in fremder Markdown, kompromittiertes npm-Paket, Mermaid-/KaTeX-Bypass).
- Whitelist `approvedVaultRoots: Set<string>` in `main/index.ts`. Befüllt nur durch User-bestätigte Aktionen: `get-last-vault` (persistierte Settings), `open-vault`/`select-vault-directory` (OS-Dialog), `create-starter-vault`/`create-empty-vault`.
- `set-last-vault` lehnt nicht-bestätigte Pfade ab — Renderer kann sich nicht selbst Pfade approven.
- **Helper für neue Handler**:
  - Handler mit absolutem Pfad: `const safe = await assertSafePath(p, 'op-name')` → ab dann **nur `safe`** verwenden. Async, löst Symlinks via `realpath` auf.
  - Handler mit `(vaultPath, relPath)`: `assertApprovedVault(vaultPath, 'op-name')` (sync) → dann `validatePath(vaultPath, relPath)` für den relativen Teil.
  - Neue Vaults erstellen: nach `mkdir` `await addApprovedRoot(targetPath)`.
- **Wichtige Regression-Falle** (v0.5.35): `assertApprovedVault` akzeptiert **nur** Vault-Roots. Für beliebige Tiefen innerhalb des Vaults `assertSafePath` nutzen.
- Vault-Roots können nicht via `delete-directory`/`delete-files` gelöscht werden.

## Website (docs/index.html)

- Einsprachige HTML-Datei mit JS-basierter i18n (DE/EN)
- Übersetzungen als `translations` Objekt im `<script>`-Block
- JSON-LD Schema mit `softwareVersion` — muss bei Release aktualisiert werden
- Download verlinkt auf `https://github.com/bydb/mindgraph-notes/releases/latest`
- Alpha-Signup-Formular wurde in v0.3.0-beta durch direkte Download-Links ersetzt
