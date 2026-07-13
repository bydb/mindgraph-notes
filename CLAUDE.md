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
│   │   ├── index.ts     # IPC-Handler (~9000 Zeilen, ~200 Handler)
│   │   ├── preload.ts  # contextBridge API
│   │   ├── edooboxService.ts  # edoobox V2-Client (+ listDatesForOffer für Teilnehmerliste)
│   │   ├── marketingService.ts # WordPress REST API Client
│   │   ├── formularParser.ts  # DOCX-Akkreditierungsformular-Parser
│   │   ├── antaresService.ts  # Antares CS 2.0.4 Reverse-Engineering (Cookie+PID, read-only)
│   │   ├── attendanceListService.ts  # Teilnehmerliste-Generator (DOCX, Schulamt-Vorlage)
│   │   ├── iqReportService.ts  # IQ-Report-Export (DOCX/XLSX) für Veranstaltungen
│   │   ├── ankiImport.ts  # .apkg-Import inkl. Medien-Extraktion
│   │   ├── brain/      # Lokales Tagesgedächtnis (dailyConsolidation.ts, hardcoded localhost:11434)
│   │   ├── calendar/   # macOS EventKit (Swift-Helper)
│   │   ├── llm/        # Unified Chat-Client (Ollama + Anthropic) + chatWithTools()
│   │   ├── telegram/   # Bot (grammy)
│   │   │   └── agent/  # Tool-Use-Loop (loop.ts, confirm.ts, tools/registry|notes|tasks|calendar.ts)
│   │   ├── office/     # DOCX/XLSX/PPTX + Teilnehmerliste-Generator (Schulamt-Vorlage)
│   │   ├── remarkable/ # reMarkable USB (service + transports)
│   │   ├── transport/  # Schnellerfassung (Tray, Shortcut, ⌘D-Diktat)
│   │   ├── voice/      # Whisper-CLI (Fallback zum eingebauten Renderer-STT)
│   │   ├── sync/       # E2E Sync (crypto, fileTracker, syncEngine)
│   │   └── workflows/  # Workflow-Runner (DI via RunnerServices, Hard-Lock, Hand-off)
│   ├── renderer/
│       ├── components/  # React-Komponenten
│       │   ├── Editor/  # MarkdownEditor + CodeMirror Extensions + WYSIWYG-Lesemodus (turndown)
│       │   ├── Sidebar/ # FileTree (Farbfilter 🔴🟢🔵), Suche, QuickEventModal
│       │   ├── Canvas/  # Graph View (React Flow, hierarchisches Layout mit Dummy-Nodes)
│       │   ├── DashboardPanel/  # Dashboard-Tab + RadarWidget + ActivityWidget (Brain)
│       │   ├── Flashcards/ Quiz/ # Lern-Features
│       │   ├── InboxPanel/  # Smart Email Client (Inbox, Compose-Modal via createPortal, KI-Chat)
│       │   ├── AgentPanel/  # Veranstaltungs-Agent (edoobox) + Marketing + IQ
│       │   ├── Terminal/    # Integriertes Terminal (xterm.js + PTY)
│       │   ├── SemanticScholarPanel/  # Semantic Scholar + OpenAlex + Zotero CSL
│       │   ├── NotesChat/ SmartConnectionsPanel/ ZoteroSearch/ WorkflowCanvas/ ...
│       │   ├── DashboardPanel/AntaresWidget  # Verleih-Dashboard für Medienzentren
│       │   └── Settings/ # inkl. ModelCompatibilitySection + ActiveModelStatusBadge
│       │       └── Onboarding/ ...
│       ├── stores/      # Zustand Stores (17, inkl. workflowStore)
│       ├── styles/      # index.css (globale Styles + color-mix-Tokens)
│       └── utils/       # Hilfsfunktionen
│           ├── noteKind.ts        # 🔴🟢🔵-Kategorien zentral (NOTE_KINDS, canvasColor, ...)
│           ├── contextMemory.ts   # localStorage Event-Log (90d Retention, 6 Event-Typen)
│           ├── translations.ts, sanitize.ts, emailContextBuilder.ts, ...
│           └── stt/transformersStt.ts  # Eingebautes Whisper via @huggingface/transformers
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
Neuer IPC-Handler: `ipcMain.handle()` in `main/index.ts` + `contextBridge.exposeInMainWorld()` in `preload.ts`.

### State Management (Zustand, 16 Stores)
- **uiStore**: UI-Einstellungen, persisted via `persistedKeys` Array. Enthält u.a. `ollama.moduleModelOverrides`, `brain.folderPath`, `notesRootFolder`, `fileTreeKindFilter`, `dashboard.radarAi*`, `editorDefaultView`, `imagesFolder`, `smartConnections.useLLMReranker`
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
- **antaresStore**: Antares-CS-Daten (Entleiher, Verleihe, Dashboard-Counts). Geschützt durch `electron.safeStorage` für Credentials.
- **vaultSettingsStore**: Pro-Vault-Feature-Toggles (`vault-settings.json`)
- **voiceStore**: STT/TTS-State (Engine, Modell-Lade-Status, Aufnahme-State)
- **workflowStore**: Workflow Canvas (Nodes/Edges, Validierung, lokale Simulation, `execute`/`runForNewEmails` via IPC, Autosave nach `workflows.json`)
- Selektoren: `useShallow` aus `zustand/react/shallow` verwenden — siehe `MarkdownEditor.tsx` und `DashboardView.tsx` als Referenz

### Modals
Boolean-State in uiStore, `if (!open) return null` im Component.

### Übersetzungen
Dot-notation Keys in `translations.ts`, `useTranslation()` Hook.

### CSS
Globale Variablen in `styles/index.css`. Komponenten-CSS ist colocated.

### Canvas (React Flow)
- `GraphCanvas.tsx` rendert Node-Daten aus `useNotesStore().notes`.
- **Wichtig**: Notizen kommen beim Initial-Load oft aus dem Cache mit `content: ''` (siehe `Sidebar.tsx`, Performance-Optimierung).
- Für Features, die echten Markdown-Inhalt brauchen (Callouts, Tasks, externe Links), muss Content bei Bedarf nachgeladen werden (`readFilesBatch` + `updateNote`).
- Anzeige-Toggles in `uiStore`: `canvasShowTags`, `canvasShowLinks`, `canvasShowImages`, `canvasShowSummaries`, `canvasCompactMode`.
- Callout-Zusammenfassungen auf Karten werden auf maximal 100 Wörter begrenzt und die Kartenhöhe dynamisch berechnet.
- **Hierarchisches Layout** in `utils/layouts/hierarchicalLayout.ts`: virtuelle Dummy-Nodes für Long-Edges (Layer X → Layer X+n), Median-basierte Y-Koordinaten mit Min-Distance, Layer-Width = Median mit 480-px-Cap, horizontaler Gap 60 px. Diagnose-Logs `[Layout] Hierarchical: N dummies inserted, crossings X → Y`.

### Workflow Canvas (visuelle Automationsschicht, opt-in Modul)
Module als verbindbare Bausteine mit **typisierten Ports** auf einem React-Flow-Canvas. Konzept + 11 Architektur-Entscheidungen: `docs/workflow-canvas-plan.md` (Abschnitt „Beschlossener Stand"). Eigener `TabType 'workflow-canvas'`, gegated durch Modul-Registry-Eintrag `workflow-canvas` (uiStore `MODULES` + `workflowCanvasEnabled`, Toggle in Settings → Module).

- **`shared/workflow/` ist Single-Source und prozessübergreifend**: `types.ts` (Ports, `WorkflowActionDefinition`, `MODULE_FEATURE_GATE`), `model.ts`, `registry.ts` (**Metadaten-only, KEIN `run()`** — von Renderer-Palette/Validierung UND Main-Runner gelesen), `validation.ts` (`canConnect` strikte Allowlist + `topoSort`), `simulation.ts` (Renderer-Trockenlauf), `examples.ts`.
- **Runner** (`main/workflows/runner.ts`): reine Logik per **Dependency Injection** (`RunnerServices`) — kennt weder `fs` noch Ollama direkt. Dispatch über `actionId` → Executor-Map. `index.ts` baut die Services (Ollama direkt `localhost:11434`, `discoverProjects`, `matchEmailToProjects`) und registriert IPC `workflow-load/save/run`.
- **Eine Schreibgrenze**: `writeFileSafe()` in `index.ts` (aus dem `write-file`-Handler extrahiert, mit `assertSafePath` + Backup + Empty-Block) — Runner-Schreib-Actions delegieren dorthin, nie eigenes `fs`.
- **`project.match`** = geteilter Keyword-Matcher `shared/projectMatch.ts` (auch von InboxPanel genutzt); nutzt die `_STATUS.md`-Marker-Keywords. **`project.context`** liest `_STATUS*.md` des Projekts. Crystallizer (Dashboard → Projekt-Status-Widget) reichert diese an.
- **Hard-Lock im Runner**: vor LLM-Actions auf untrusted Input prüft der Runner `isHardLocked(model, action.hardLockModule)` (z.B. `task-extraction`) — kein Prompt-Injection-Backdoor um die Modell-Matrix herum.
- **Human-Review = terminaler Hand-off, KEIN Pause/Resume**: manueller Lauf → `ComposeView` öffnet automatisch (via `onOpenInbox`-Prop + `emailStore.startReply`); Event-Lauf → Task „✉️ Entwurf prüfen". Antwort-Empfänger wird bei Formular-Mails aus dem Body gezogen (`E-Mail:`-Zeile), sonst From.
- **Trigger**: manuell (▶ Ausführen, Seed = ausgewählte Mail) + Event (neue relevante Mail, feuert solange der Canvas-Tab offen ist). **Exactly-once** via `EmailAnalysis.workflowRuns` (workflowId→runId) in `emails.json`, analog `replyHandled`. `runForNewEmails` ist auf `MAX_TRIGGER_BATCH` gedeckelt + eng gefiltert (sonst feuert ein Klick gegen den ganzen Backlog → Ollama-/CPU-Sturm).
- **Persistenz**: `.mindgraph/workflows.json` (geräte-lokal). Aktuell wird nur **EIN** Workflow gehalten/gespeichert (`workflows[0]`). Multi-Workflow-Verwaltung ist offen.
- **Loop-Fallen (real aufgetreten, hart einhalten)**: (1) Zustand-Selektoren dürfen **kein** `.filter()/.map()` zurückgeben (neues Array/Render → „Maximum update depth"); stabile Referenz selektieren, im Render filtern. (2) Autosave **nur bei geändertem Inhalt** schreiben (`lastSavedWorkflowJson`) — sonst Write↔Vault-Watcher↔Reload-Loop. (3) `nodeTypes` als Modul-Konstante.
- **E-Mail-Markdown**: Compose-Body ist Markdown; `renderEmailHtml` (main) rendert beim Senden zu HTML (`**`, `*`, `•`, `———`, `> Zitat`, `##`→fett). ComposeView hat einen Vorschau-Toggle via IPC `email-render-html` (zeigt exakt das gesendete HTML).
- **Dev-Falle**: Dev-App und installierte App teilen denselben Vault, haben aber **getrennte userData** → jeder Schreibvorgang triggert den Vault-Watcher der anderen App (CPU-Spitze). Beim Entwickeln nur EINE App auf dem Vault offen halten.

### Notiz-Kategorien (🔴🟢🔵) — zentrales UI-Konzept
- Alle Kategorien-Logik in `utils/noteKind.ts`. **Niemals duplizieren** — wenn ein neuer UI-Punkt Farbe/Label braucht, `NOTE_KINDS[kind]` nutzen.
- Drei funktionale Kategorien: 🔴 *Problem* (Aktion), 🟢 *Lösung* (Wissen/Guide), 🔵 *Info* (Reader).
- Erkennung in **dieser Reihenfolge**: Frontmatter (`category|noteKind|kind` mit Aliassen red/green/blue/problem/...) → Titel-Emoji am Anfang oder direkt nach " - " (matched z.B. `202604221336 - 🔴 Digitalwoche`). **Pfad-Fallback und Inline-Emoji bewusst nicht** — sonst werden Zettelkasten-Notizen mit zufälligen Emojis fälschlich kategorisiert.
- Frontmatter-Manipulation via Helper aus `noteKind.ts`: `setNoteRelevanceInContent`, `getNoteStatus`, `markProblemSolvedInContent`, `addSolvedForBacklinkInContent`, `completeOpenTasksInContent`.
- UI-Komponenten zeigen 10-px-Status-Dot, nicht das rohe Emoji — siehe `NoteNodes`, `TabBar`, `FileTree`, `Bookmarks`, Editor-Header.

### Editor-Modi (drei): Markdown / Schreiben / Lesen
- **Schreiben** (`live-preview`) ist der Default für Editing, **Lesen** (`preview`) ist der Default beim Öffnen einer Notiz (90% Lesen, 10% Editieren).
- **Lesen-Modus** ist **WYSIWYG mit Inline-Editing** — Änderungen gehen via `turndown` zurück zu Markdown.
- **Turndown-Escape MUSS selektiv konfiguriert sein**: `[`, `]`, `\`, `_` bleiben unangetastet (sonst exponentielle Wikilink-Korruption mit `2ⁿ−1`-Backslash-Wachstum, siehe v0.6.40-Fix). Nur Block-Start-Marker und Inline-Emphasis werden escaped.
- **WYSIWYG-Roundtrip-Regeln für Embeds**: PDF/Office (`data-filename`), Mermaid (`data-source`), Dataview (`data-query`). Embeds werden aus diesen Attributen rekonstruiert, sonst stillschweigend gestrippt.
- **Code-Blöcke im Roundtrip**: Der Lesen-Modus rendert Code-Zeilen als `<span class="code-line">` OHNE `\n` (wrapLines für CSS-Counter-Zeilennummern) — `renderedCodeBlockRule` (`utils/wysiwygCodeBlockRule.ts`) rekonstruiert die Zeilen aus den Spans. Ohne diese Regel presste turndowns Default jeden Code-Block auf EINE Zeile (stille Korruption, traf real den `email-relevance-config`-Block).
- **Auto-Heal** für korrupte Wikilinks läuft in jedem `.md`-Write-Pfad (`write-file`, `tasks-update-line`, `tasks-create`) — strippt beliebig viele Backslashes vor `[` und `]`.
- **REMINDER_REGEX in `shared/taskExtractor.ts`** ist tolerant gegenüber `\[\[`, `\\\[\\\[`, etc. — Tasks werden auch in leicht beschädigten Notizen sichtbar.

### Modell-Kompatibilitäts-Matrix
- **Single-Source-of-Truth**: `app/src/shared/modelCompatibility.ts`. Datenstand im File-Header dokumentiert (`version: '2026-05-14'`).
- **Modellnamen-Kanonisierung** (`canonicalModelKey`): Matrix-Keys sind Ollama-Tags, aber LM-Studio-IDs (`qwen/qwen3.5-4b`, `Meta-Llama-3.1-8B-Instruct-GGUF`, `mlx-community/…`) werden auf denselben kanonischen Schlüssel abgebildet — gleiche Gewichte = gleiches Verdict, und der Hard-Lock greift auch bei LM Studio. Fine-Tune-Suffixe (`-abliterated` etc.) erben bewusst NICHTS (fail-closed → untested). MLX-Miss fällt auf den GGUF-Eintrag zurück (nicht umgekehrt).
- 5 Module: `brain`, `task-extraction`, `mail-summary`, `dashboard-snapshot`, `smart-connections`.
- 4 Verdicts: `green` (geeignet), `yellow` (Vorbehalt), `red` (Hard-Lock), `untested` (Default für unbekannte Modelle).
- **`damageRelevant: true`** für `task-extraction` und `dashboard-snapshot` → bei `red` echter Code-Lock via `isHardLocked()`.
- **Prio-Reihenfolge im Code**: tab-spezifisches Modell (z.B. `email.analysisModel`) → `ollama.moduleModelOverrides[module]` → globales `selectedModel`.
- **UI**: `ModelCompatibilitySection` in Settings → Integrationen → Ollama; `ActiveModelStatusBadge` neben Modell-Picker.
- **Empirische Grundlage**: `~/dev/brain-model-benchmark/results/`. Aktuelle Werte aus 160 Läufen vom 14.05.2026 (siehe Analyse-Dokument `~/2026/100 - ✅ Projekte/110 - MindGraph-Notes/Modell-Kompatibilitaets-Analyse.md`).
- **Bei neuen Benchmarks**: Daten in `modelCompatibility.ts` einpflegen, `version` updaten, Analyse-Dokument updaten.

### Brain — lokales Tagesgedächtnis
- Pfad: `main/brain/dailyConsolidation.ts`.
- **Hardcoded `localhost:11434` (Ollama)** — Privacy-Constraint. **Niemals** auf den generischen LLM-Provider-Switch umstellen, sonst geht die Marketing-Aussage „verlässt nie deinen Rechner" verloren.
- Sensoren: berührte Notizen (aus `contextMemory` + Datei-mtime), erledigte Tasks, empfangene/beantwortete Mails, optional Daily-Note-Body (≤2000 Zeichen).
- Output: 4-Sektionen-Schema (Heute im Fokus / Was ich gemacht habe / Offene Fäden / Beobachtung) mit Frontmatter `type: brain-day`.
- **Wikilink-Postprocessor** in `dailyConsolidation.ts`: wickelt exakte Titel im Output in `[[…]]`, falls Modell die Regel ignoriert.
- **Phantom-Notiz-Filter** (v0.6.45): Sensor filtert Events aus `contextMemory` zu nicht mehr existierenden Notizen heraus — vorher wurden gelöschte/verschobene Notizen als „berührt" gemeldet.
- **Tageszusammenfassungen werden nie überschrieben** — wiederholte Klicks erzeugen `TT (2).md`, `TT (3).md`. Human-in-the-Loop ist Architektur, kein Setting.
- Default-Ordner: `800 - 🧠 brain/JJJJ/MM/TT.md` (konfigurierbar via `brain.folderPath`).

### Smart Connections (Ähnlichkeitssuche)
- `renderer/components/SmartConnectionsPanel/SmartConnectionsPanel.tsx`.
- **Embeddings**: bevorzugt `bge-m3` (multilingual, deutlich bessere Score-Spreizung für deutsche Vaults), Fallback `nomic-embed-text`, sonst erstes verfügbares Embedding-Modell.
- **Score-Mischung**: Embedding-Ähnlichkeit + Keyword-Matching (RegExp mit `escapeRegExp()` gegen Sonderzeichen) + Wikilinks/Tags/Ordner-Nähe, konfigurierbare Gewichte.
- **LLM-as-Judge-Reranker** (v0.6.45, opt-in via `smartConnections.useLLMReranker`): nach der Embedding-Suche bewertet das aktuelle Ollama-Chat-Modell die Top-Kandidaten paarweise mit strukturiertem JSON-Output (Fallback-Parser für Fließtext-Antworten). Workaround: Ollama hat aktuell keine nativen Cross-Encoder — dedizierte Reranker-GGUFs crashen den Loader. Trade-off: ~1–3 s pro Kandidat, Scores eher grob.
- **Email-Metadaten-Filter** (v0.6.45): vor dem Embedding wird der Email-Header-Block (`**Von:** …`, `**An:** …`, etc.) entfernt, damit Mails nicht alle in einem „Metadaten-Cluster" landen. `CACHE_VERSION=2` — alte Embeddings einmalig neu berechnet beim ersten Öffnen.
- **Markdown-Bold in Headings** (v0.6.43 Fix): Heading-Tokenizer in `extractKeywords()` splittet auch an `*` — `## **Frühstück**` crashed vorher die RegExp-Konstruktion mit „Nothing to repeat".

### Antares CS Integration (Medienzentren-Verleih, seit v0.6.45)
- `main/antaresService.ts` + `renderer/stores/antaresStore.ts` + Dashboard-Widget.
- **Reverse-engineered gegen Antares CS 2.0.4** (h+h Software / antares.net) — das Verleihsystem vieler deutscher Medienzentren. Keine offizielle API; Cookie+PID-Session wie im Browser. Endpunkte können mit Antares-Upgrades brechen.
- **Credentials in `electron.safeStorage`** verschlüsselt, IPC: `antares-save-credentials`, `antares-load-credentials`, `antares-test-connection`.
- **Read-only**: liest Entleiher, Verleihe, offene Anfragen, Mahnungen. **Kein Schreibzugriff** — Sicherheitsentscheidung.
- **Dashboard-Widget** in voller Breite: 3-Spalten-Layout aus dem Antares-Original (Nutzerverwaltung / Technikverleih / Medienverleih) mit Status-Kacheln + aufklappbare Mahnungs-Tabelle (Leihnr/Titel/Entleiher/Schule/Rückgabedatum).
- **Aktivierung**: Einstellungen → Module → „Antares Medienzentrum" toggle, dann Einstellungen → Agenten → Antares-Sektion: URL/Kontext/Credentials + Verbindungstest. Auto-Migrate ergänzt das Widget bei bestehenden Installationen.
- Dokumentation: `docs/antares-integration.md`.

### Relevanz-Radar (Dashboard-Widget „Relevante Notizen")
- `DashboardPanel/DashboardView.tsx` → `RadarWidget`.
- **KI-Score in localStorage**, nicht im Frontmatter (`mindgraph:relevance-cache:{vaultPath}`) — sonst Multi-Device-Sync-Konflikte.
- Score-Mischung: KI-Score + heuristik-Boost (gedeckelt +25), **kein `Math.max`**. Sonst überstrahlt KI alle Tagessignale.
- Concurrency-Lock als **Modul-Singleton** (`radarAiWorkerRunning`), nicht als `useRef` — sonst Doppelläufe bei schnellem Dashboard-Mount/Unmount.
- ErrorBoundary pro Widget — ein Render-Crash im Radar darf nicht das ganze Dashboard mitnehmen.
- **Nur 🔴-Notizen** kommen ins Radar (Frontmatter `category:` **oder** strikter Titel-Match nach `getNoteKindFromTitleStrict`).

### Lokales Kontextgedächtnis (`utils/contextMemory.ts`)
- localStorage-Event-Log mit 6 Typen: `note_opened`, `note_created`, `note_updated`, `note_deleted`, `task_created`, `task_updated`.
- Throttling pro Event-Typ + Note (z.B. `note_opened` 30s, `note_updated` 60s).
- 90-Tage-Retention, max 2500 Events. Zero-Backend.
- Wird vom **Aktivität-Widget** (Top-Notes-Bars + Top-Folders) und von **Brain** (Sensor „berührte Notizen") gelesen.
- Gewichtetes Event-Scoring: `task_*` ×4/×3, `note_opened` ×3, `note_updated` ×2, `note_deleted` ×0.5. Inbox-/Eingang-Folder Faktor 0.35.

### Telegram-Agent (Tool-Use)
- `main/telegram/agent/loop.ts` mit Iterations-Limit (Default 8, max 15).
- 7 Tools: `note_search`, `note_read`, `note_create`, `note_append`, `task_list`, `task_toggle`, `calendar_list`.
- **`isWrite: true` ist die harte Sicherheitsgrenze** — jedes Tool mit dieser Flag löst automatisch den Confirm-Flow aus, unabhängig von `agentConfirmTools`-Settings.
- Confirm-Promise-Registry in `confirm.ts`, Auto-Deny nach 2 Min Timeout.
- **Pfad-Schutz**: jedes Schreib-Tool nutzt `resolveInVault()` — kein Path-Traversal über Tool-Args möglich.
- `chatClient.chatWithTools()` mapped Ollama-Wire-Format (`role: tool`, `tool_calls.function`) auf interne `ToolCall`-Struktur. Tool-fähige Ollama-Modelle bevorzugt: `qwen3`, `qwen2.5-coder`, `llama3.1`, `mistral-nemo`. Gemma kann **kein** Tool-Calling.
- `safeReplyMarkdown` retried Plain-Text bei Markdown-Parse-Fehlern (Telegram lehnt unbalancierte `*`/`_`/`` ` `` ab).

### Automatische Backups
- `<vault>/.mindgraph/backups/JJJJ-MM-TT/<relpath>/<dateiname>.<timestamp>.bak` vor jedem `.md`-Write.
- **Hard-Block für leere Writes** auf nicht-leere Markdown-Dateien im `write-file`-Handler — zweite Verteidigungslinie unabhängig vom Editor.
- Backups **vom Sync ausgeschlossen** (bleiben lokal).

### Schnellerfassung: Zettel-Modus
- Umschalter Notiz/Zettel im Transport-Fenster. Zettel-Konvention (gelebt, NICHT das alte Templater-Template): Dateiname `<Emoji-Cluster> - <Titel>.md` (Umlaute bleiben), Frontmatter `id` (JJJJMMTTHHmm)/`created`/`tags` als Inline-Array, Body `**Zitat:**`/`**Mein Gedanke:**`/`**Quelle**`. Pure Bausteine + Frontmatter-Tag-Parser in `shared/zettel.ts` (getestet).
- IPC: `transport-zettel-context` (optionaler `preferredFolder`-Param — konfigurierter Ordner hat Vorrang, sonst ersten Ordner mit „zettelkasten" im Namen finden, BFS max. Tiefe 4; erntet Top-60-Frontmatter-Tags aus dem aufgelösten Ordner), `zettel-suggest-meta` (lokales Ollama schlägt Tags + Emoji-Cluster vor; gleiche Härtung wie `tasks-suggest-tags`: `isHardLocked('task-extraction')`, UNTRUSTED-Marker, JSON-Fallback-Parser), `transport-save-zettel`.
- **Zettel-Zielordner konfigurierbar**: `transport.zettelDestinationFolder` (uiStore, Settings → Schnellerfassung) — leer = Auto-Erkennung. Wird wie das Notiz-Standard-Ziel bei jedem Fenster-Show neu angewandt; Dropdown-Änderungen im Transport-Fenster gelten pro Erfassung.
- Modell-Präzedenz wie Aufgaben-Tagger: `ollama.moduleModelOverrides['task-extraction']` → `selectedModel`. ⌘D-Diktat und ⌘T-Task sind bewusst Notiz-Modus-only (Einfügeziel ist der Notiz-Editor).

### Eingebautes Whisper STT
- `utils/stt/transformersStt.ts` läuft im Renderer via `@huggingface/transformers` v4 + ONNX Runtime.
- **Modell-Konfiguration**: Encoder `q8` (~25 MB), Decoder `fp32` (~150 MB). Wichtig: quantisierter Decoder bricht ONNX-Runtime mit „MatMulNBits-Scales fehlen". Nicht ändern ohne Test.
- **`device: 'wasm'` + `numThreads: 1`** — Electron-Renderer hat ohne COOP/COEP keinen SharedArrayBuffer für Multi-Thread-WASM. WebGPU-Init terminiert nicht zuverlässig.
- **CSP**: `connect-src` für `huggingface.co`, `cas-bridge.xethub.hf.co`, `cdn.jsdelivr.net`; `script-src` mit `wasm-unsafe-eval` + `blob:`; `worker-src 'self' blob:`.
- macOS: Entitlement `com.apple.security.device.audio-input` in `entitlements.mac.plist` **muss** gesetzt sein — ohne blockiert Hardened Runtime stumm.
- Transport-Capture (Schnellerfassung ⌘D) ist ein **eigener Renderer-Prozess** mit eigenem RAM-Cache. „Modell vorbereiten" im Hauptfenster wirkt dort nicht.
- STT-Audio-Datei wird **immer** gelöscht (auch bei Fehler/leerem Transkript). Debug-Erhalt nur via `MINDGRAPH_KEEP_STT_AUDIO=1`.

## Sicherheit

- **HTML-Sanitization**: Immer `sanitizeHtml()` / `sanitizeSvg()` / `escapeHtml()` aus `utils/sanitize.ts`
- **Mermaid**: `securityLevel: 'strict'`
- **KaTeX**: `trust: false`
- Keine `dangerouslySetInnerHTML` ohne Sanitization

## Editor (CodeMirror 6)

Extensions liegen in `Editor/extensions/`:
- `languageTool/` – Grammatik/Rechtschreibprüfung (LanguageTool API)
- `dataview/` – Dataview-Abfragen
- `livePreview/` – Live Preview (Decorators, Widgets, Theme)
- `imageHandling.ts` – Drag & Drop Bilder
- `markdownFolding.ts` – Faltbare Code-Blöcke, Callouts, Frontmatter

Click-Handler für Decorations: `view.posAtCoords()` + StateField-Lookup nutzen (kein DOM-Traversal mit `closest()`).

### HTML-Vorschau im Code-Editor (`mindgraph-preview://`)
- `.html`/`.htm`-Dateien öffnen im CodeViewer standardmäßig als **Vorschau** (sandboxed `<iframe>`), Toggle Vorschau/Code + Neu-laden im Header.
- **Single-Source**: `shared/htmlPreview.ts` — URL-Builder (Renderer), Pathname→FS-Mapping + MIME-Map + `PREVIEW_DOCUMENT_CSP` (Main). Unit-Tests in `shared/htmlPreview.test.ts`.
- **Custom-Protocol** `mindgraph-preview://vault/<absoluter Pfad>` in `main/index.ts` (`registerHtmlPreviewProtocol`): jeder Request läuft durch `assertSafePath` — gleiche Sicherheitsenvelope wie die FS-IPC-Handler. Scheme-Registrierung (`registerSchemesAsPrivileged`) MUSS vor `app.ready` bleiben. Relative Ressourcen (CSS/JS/Bilder neben der HTML-Datei) funktionieren über normale URL-Auflösung.
- **Vorschau bleibt offline**: HTML-Antworten bekommen eine CSP ohne externe Hosts (Inline-Skripte/-Styles erlaubt). iframe-Sandbox OHNE `allow-same-origin` (opaque Origin). `target=_blank`-Links landen via `setWindowOpenHandler` im System-Browser; normale externe Navigation ist CSP-geblockt (bewusst — echter Browser-Tab wäre ein eigenes Feature via `WebContentsView`).
- **Bekannte Grenzen**: `fetch()`/ES-Module-Scripts aus der Vorschau-Seite scheitern an CORS (opaque Origin), `localStorage` wirft in der Sandbox — Standalone-Seiten mit klassischen Inline-Skripten sind der Zielfall. `webviewTag: false` bleibt unangetastet.
- **PDF-/EPUB-Export**: Buttons im Code-Editor-Header (IPC `html-preview-export` → `main/htmlExport.ts`). Rendert die Seite in einem versteckten Fenster über dasselbe Protokoll — KaTeX ist beim Export bereits fertig gerendert. PDF via `printToPDF` (A4); EPUB serialisiert das gerenderte DOM als XHTML (`XMLSerializer`, Skripte entfernt) und bettet Stylesheets + lokale Fonts/Bilder ein. Pure EPUB-Assembly (container/opf/nav/content, CSS-url-Rewriting) in `shared/epub.ts` mit Unit-Tests.
- **Font-Loads aus CSS (`@font-face`) funktionieren** trotz opaque Origin — empirisch verifiziert mit den KaTeX-woff2 (write_html-Feature). Chromium erzwingt hier kein CORS gegen das Custom-Scheme.

### Notiz-Agent: `write_html` (wissenschaftliche HTML-Seiten)
- **Tool `write_html`** (`main/noteAgent/skills.ts`): LLM liefert `title` + `body_html` (+ optional `lang`), das Dokument baut `shared/scientificHtmlPage.ts` (`buildScientificHtmlPage`, Entscheidung 11). Body-only-Kontrakt: `looksLikeFullHtmlDocument()` lehnt Dokumentgerüste ab. Unit-Tests in `shared/scientificHtmlPage.test.ts`.
- **LaTeX bleibt Quelltext** (`$$…$$`, `\(…\)`) — client-seitiges Rendering via KaTeX auto-render; die Seite bleibt im Code-Editor editierbar. Gleichungs-/Abbildungs-Nummerierung über CSS-Counter (`<div class="equation">`, `<figure class="fig">`).
- **Offline-Assets**: Seiten referenzieren `mindgraph-assets/katex/` relativ (Konstante `HTML_PAGE_ASSETS_DIRNAME`). Der Accept-Handler (`note-agent-accept-result`) kopiert die Assets idempotent neben die Seite (`main/noteAgent/htmlAssets.ts`). Quelle: `app/resources/html-page-assets/katex/` — **vendored KaTeX v0.16.27** (js/css/auto-render/woff2); beim KaTeX-Bump in package.json neu kopieren (siehe README dort).
- **Staging-Allowlist** in `noteAgent/staging.ts` um `.html`/`.htm` erweitert; `kind: 'html'` in `runRegistry.ts`.
- **Starter-Skill** `resources/starter-skills/wissenschaftliche-webseite/SKILL.md` dokumentiert die Template-Bausteine (equation/fig/abstract/table-wrap/references) und SVG-Regeln (viewBox, CSS-Variablen `--fig-line`/`--fig-line-2`/`--fig-grid`, kein LaTeX in SVG-Text).

## Release-Prozess

1. Version in `app/package.json` bumpen
2. Download-Links in `docs/index.html` aktualisieren (Version in JSON-LD Schema)
3. `CHANGELOG.md` aktualisieren
4. Commit: `"Bump version to X.X.XX-beta"`
5. Tag: `git tag vX.X.XX-beta && git push origin vX.X.XX-beta`
6. GitHub Actions baut automatisch:
   - macOS (arm64+x64) — signiert + notarisiert
   - Linux (AppImage+deb+snap)
   - Windows (exe)
7. Release wird automatisch auf GitHub erstellt via `softprops/action-gh-release`
8. Snap wird automatisch zum Snap Store (edge channel) hochgeladen

Oder: `/release` Command verwenden.

## Apple Code Signing & Notarization

- **Developer ID Application**: Jochen Rudolf Leeder (Team ID: `2MA34D4SN6`)
- **Zertifikat Hash**: `5442E85C0D83043BDDA07C31F76DFC8130DFFE5C` (G2 Sub-CA)
- **Hardened Runtime**: `app/entitlements.mac.plist` (JIT, unsigned exec memory, disable library validation, network, files)
- **Notarization**: via `xcrun notarytool submit` als separater CI-Step (nicht electron-builder `notarize: true` — das hängt sich auf)
- **`notarize: false`** in `app/package.json` `build.mac` — Notarization wird separat gemacht
- **`continue-on-error: true`** auf Notarization-Step, damit signierte DMGs auch ohne Notarization hochgeladen werden
- **GitHub Secrets**: `CSC_LINK` (Base64 .p12), `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (.p8 Inhalt), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`
- **App Store Connect API Key**: Im CI als `.p8`-Datei geschrieben nach `$HOME/private_keys/`, nach Build gelöscht
- **Lessons Learned**:
  - electron-builder `notarize: true` hängt endlos → `xcrun notarytool` direkt verwenden
  - `APPLE_API_KEY` muss als Dateipfad gesetzt werden, nicht als Inhalt
  - `~` wird in GitHub Actions Env-Vars nicht expandiert → `$HOME` verwenden
  - Neue Developer-Accounts: erste Notarization dauert Stunden, danach 5-15 Min

## Snap Store

- **Snap Name**: `mindgraph-notes` (registriert auf snapcraft.io)
- **Confinement**: `classic` (in `app/package.json` `build.snap`)
- **CI-Token**: `SNAPCRAFT_STORE_CREDENTIALS` GitHub Secret
- **Nur x64**: Snapcraft kann nicht arm64 auf amd64 cross-kompilieren
- **`continue-on-error: true`** auf Snap-Publish-Step
- **Channel**: `edge` (automatisch bei Tag-Push)
- Token erneuern: `snapcraft export-login --snaps=mindgraph-notes --channels=edge,beta,stable --expires YYYY-MM-DD -`

## Sync (E2E verschlüsselt)

- Zero-Knowledge via WebSocket Relay (`wss://sync.mindgraph-notes.de`)
- AES-256-GCM, scrypt Key-Derivation
- Module: `app/src/main/sync/` (crypto.ts, fileTracker.ts, syncEngine.ts)
- Passphrase lokal via `electron.safeStorage`, wird nie zum Server gesendet
- Konfliktstrategie: neuerer Timestamp gewinnt, ältere als `.sync-conflict-YYYY-MM-DD`
- **Plaintext-Hash-Vergleich vor Conflict-Erzeugung** (v0.6.2): bevor `.sync-conflict-*`-Datei angelegt wird, wird Remote entschlüsselt und mit lokal verglichen — identischer Inhalt → kein Conflict-File, nur Manifest-Update. Verhindert Phantom-Konflikte.
- Mass-Deletion-Schutz: >10% und >=10 Dateien → SAFETY-Fehler, `sync(force=true)` überspringt Check
- Force Sync UI: Button in Settings bei SAFETY-Fehlern, ruft `triggerSync(true)` auf
- **Tombstones**: Server speichert Löschungen (`deleted_at`), Client prüft bei `diffManifests()` ob Datei auf Server gelöscht wurde → verhindert Re-Upload gelöschter Dateien
- **`getDeletedManifest()`** in `mindgraph-sync-server/src/storage.ts` liefert gelöschte Dateien
- **`lastServerTombstones`** in `syncEngine.ts` wird an `diffManifests()` übergeben
- **Server-Tombstone-Retention**: 90 Tage (v0.3.2+).
- **Activation-Codes atomar claimen** (v0.5.17): Validierung + Claim in einem `UPDATE` mit Bedingung. Vorher zwei parallele Connects konnten denselben Code beanspruchen.
- **Sync-Speicherlimit bei Updates** (v0.5.17): Limit-Vergleich subtrahiert jetzt die alte Größe (`currentSize - oldSize + neueGröße`); legitime Updates nahe am 5-GB-Limit schlagen nicht mehr fehl.
- **Was NICHT in den Sync wandert**: `.mindgraph/backups/` (Auto-Backups), `.mindgraph/embeddings-*.json`, `.mindgraph/notes-cache.json`, alles in der `excludePatterns`-Liste der Sync-Settings.

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

## Smart Email Client

### Empfang & Analyse (IMAP + Ollama)
- IMAP-Abruf via `imapflow`, Parsing via `mailparser` (dynamic imports in main/index.ts)
- Ollama-Analyse: Relevanz (0-100), Sentiment, Zusammenfassung, extrahierte Infos, Aufgaben, `needsReply`, `replyUrgency`
- Analyse-Prompt enthält Inhalt der `Email-Instruktionen.md` aus dem Vault als Relevanzkriterien
- Gewichtung: 1 Kriterium → 50-65%, 2 → 65-80%, 3+ oder direkte Rückfrage → 80-95%
- Prompt-Injection-Schutz: Sanitization von Mail-Body vor Ollama-Aufruf
- Anhang-Erkennung: `hasAttachments` + `attachmentNames` aus `parsed.attachments`
- Notiz-Erstellung: Relevante Mails → Markdown-Notizen in konfigurierbarem Ordner (default: `‼️📧 - emails/`) mit Frontmatter, Aufgaben (`@[[YYYY-MM-DD]]`)
- Passwörter via `electron.safeStorage`, nie im Klartext gespeichert
- Persistenz: `{vault}/.mindgraph/emails.json`

### Versand (SMTP + nodemailer + IMAP-Sent-Append)
- SMTP-Senden via `nodemailer` (dynamic import in main/index.ts, IPC: `email-send`)
- Account-Settings: `smtpHost`, `smtpPort`, `smtpTls`, `fromAddress` (volle Absender-Adresse), `name` (Anzeigename)
- HTML-Email: Body wird zu HTML konvertiert. **Link-Konverter** erkennt 4 Varianten: Markdown-Links `[Text](https://url)`, Markdown-Mailto, nackte URLs, nackte E-Mail-Adressen. Negative Lookbehinds verhindern Doppel-Linking innerhalb bereits gerenderter Tags.
- Signatur: Text (`signature`) + optionales Bild (`signatureImagePath`) als CID-Attachment eingebettet
- Signatur-Bild: Wird nach `{vault}/.mindgraph/signature-image.ext` kopiert, IPC: `email-select-signature-image`, `email-load-signature-image`
- Gesendete Emails werden in `emailStore.emails` mit `sent: true` getrackt
- **IMAP-Sent-Append** (v0.6.37): nach erfolgreichem `sendMail` baut nodemailer per `streamTransport` einen RFC-822-Buffer, imapflow lädt Kopie in den `\Sent`-Folder hoch. Sent-Folder-Detection via SPECIAL-USE-Flag (RFC 6154) mit Fallbacks auf bekannte Namen (`INBOX.Sent`, `Gesendet`, `INBOX.Gesendet`, `Sent Items`, `Gesendete Objekte`). **Konsistente `Message-ID`** zwischen SMTP und IMAP-Kopie. Fehler beim Append kippt Send-Erfolg nicht — gelbe Warnung unter grünem Status.

### KI-Chat & Kontext-Engine
- **EmailAIChatView.tsx**: Chat-Interface mit Ollama-Streaming (nutzt bestehenden `ollama-chat` IPC-Handler)
- **emailContextBuilder.ts**: Sammelt Kontext aus 7 Quellen:
  1. Email-Inhalt + Analyse
  2. Kontakt-Historie (letzte 10 Emails mit diesem Kontakt)
  3. Kontakt-Profil aus `contactStore` (Name, Buchungen, Vault-Erwähnungen)
  4. Relevante Vault-Notizen (Keyword-basierte Suche in Titel + Tags + Content)
  5. edoobox-Veranstaltungen (Buchungen des Kontakts + Keyword-Match)
  6. Offene Tasks aus dem Vault
  7. Max 30.000 Zeichen mit proportionaler Kürzung
- **Entwurf-Generator**: KI-Antwort → "Als Antwort verwenden" → ComposeView mit vorausgefüllten Reply-Headers + Signatur

### Kontakt-Aggregation
- **contactStore.ts**: Mergt Kontakte aus 4 Quellen (Email from/to, edoobox Bookings, Vault Wikilinks/Email-Regex, persistenter Kontakt-Speicher)
- **Persistenter Kontakt-Speicher** `{vault}/.mindgraph/contacts.json`: Empfänger gesendeter Mails werden in `email-load` **vor** dem retainDays-Pruning und in `email-save` geharvestet (`harvestSentRecipients` in main/index.ts) — sonst verschwinden selten angeschriebene Adressen nach 30 Tagen aus dem Compose-Autocomplete. IPC: `email-contacts-load`
- Autocomplete in ComposeView mit Source-Indikatoren (📧📅📝)
- Kontakt-Profil in Detail-View (Email-Anzahl, Buchungen, Vault-Notizen)

### UI (InboxPanel)
- View-Switcher: Liste | Detail | Compose | KI-Chat (über Header-Buttons "Neu" + "KI")
- Detail-View: Analyse + "Antwort erwartet"-Badge (rot/orange/blau) + Anhang-Info + "Original anzeigen"-Toggle + Reply/Discuss-Buttons + "Erledigt"-Toggle
- ComposeView: **Modal-Overlay via `createPortal`** (am `document.body`), 860×760, Blur-Backdrop. Vorher als View ins schmale Inbox-Panel gequetscht.
- Settings: **Eigener Settings-Tab „Email"** (seit v0.5.32) — vorher unter „Agenten" versteckt. Mit Briefumschlag-Icon, nur sichtbar bei aktivem `email`-Modul. IMAP + SMTP pro Account, Absender-Adresse, Signatur (Text + Bild-Upload).
- **`replyHandled`** auf Mails (persistent in `emails.json` als `analysis.replyHandled`) — übersteht KI-Reanalyse. Hover-Häkchen im „Zu beantworten"-Widget setzt es.

## edoobox-Agent

- Akkreditierungsformulare (.docx) importieren → Veranstaltungsdaten automatisch parsen → an edoobox API senden
- **formularParser.ts**: Extrahiert Titel, Termine, Referenten, Ort, Preis, Kontakt, Teilnehmer aus DOCX
- **edooboxService.ts**: API-Client für edoobox (v1 Query-Params, v2 JWT), Webhook-Support (Zapier)
- **marketingService.ts**: WordPress REST API Client (Posts erstellen, Medien uploaden)
- **AgentPanel.tsx**: UI mit Tabs: Import | Dashboard | Marketing
- **agentStore.ts**: Zustand Store für Events, Dashboard-Offers, Bookings, Marketing
- Dashboard: Occupancy-Charts, Teilnehmerlisten, Neuanmeldungen
- Marketing-Tab: WP Publishing, Ollama Content-Generierung, Google Imagen Bilder
- Settings im **Agenten-Tab**: API Key/Secret via `electron.safeStorage`
- Credentials: `edooboxSaveCredentials` / `edooboxLoadCredentials` IPC-Handler

## reMarkable-Integration (USB)

- USB-Verbindung über `http://10.11.99.1` (reMarkable "USB web interface")
- Main-Module: `app/src/main/remarkable/` (`service.ts`, `transports/usb.ts`, `types.ts`, `pdfReflow.ts`, `bookPdf.ts`)
- IPC-Handler in `main/index.ts`:
  - `remarkable-usb-check`
  - `remarkable-usb-debug-info`
  - `remarkable-list-documents`
  - `remarkable-download-document`
  - `remarkable-upload-pdf`
  - `remarkable-optimize-pdf`
  - `remarkable-bookify-pdf`
- Renderer-UI: `app/src/renderer/components/Sidebar/RemarkablePanel.tsx`
- Features: Dokumente browsen/importieren, PDF exportieren, **Optimieren + Export** (Ghostscript/qpdf Fallback), **Als Buch + Export** (Reflow)
- Stabilität: Upload-Flow enthält Reachability-Checks + Retry-Logik (wichtig für reMarkable Paper Move)
- Branding: reMarkable-Logo in `app/src/renderer/assets/remarkable-logo.png`

### reMarkable-Buch-Lesemodus (große Schrift wie auf einem Kindle)
- **Problem**: Der reMarkable-Schirm ist physisch schmaler (157 mm) als A4 (210 mm). Ein A4-PDF auf das Gerät zu legen macht den Text **kleiner**, und reMarkable kann PDF-Text nicht reflowen/vergrößern. Reines PDF-Umlayouten (Skalieren/Schneiden) löst das NICHT — es schrumpft. Nur echtes Reflow (Zeilen neu umbrechen) vergrößert.
- **Geräteseite**: reMarkable 2 = 1404×1872 px @ 226 dpi = **157×210 mm**. Gesetzt via CSS `@page { size: 157mm 210mm; margin: 0 }` + `printToPDF({ preferCSSPageSize: true })`. **NICHT** über das `pageSize`-Objekt: Electron 40 interpretiert dessen Zahlen fälschlich als Zoll (157000 → 11,3 Mio pt Riesenseite → Inhalt in winziger Ecke → scheinbar leere Seite). Die Typings-Doku („microns") ist falsch. Nach `loadFile` auf `document.fonts.ready` + ein `requestAnimationFrame` warten, sonst erfasst printToPDF gelegentlich eine leere Seite.
- **Weg A — eigene Notizen** (`export-pdf` mit `pdfStyle: 'remarkable-book'`): rendert frisch aus dem Markdown in Gerätegröße, Serifenschrift 17pt, line-height 1.7, breite Ränder, reines Schwarz. Kommt als Override-`<style>` NACH dem Standard-Style (Kaskade). Zweiter „reMarkable"-Button neben „PDF" im Editor (`MarkdownEditor.tsx` `handleExportPDF('remarkable-book')`).
- **Weg B — externe PDFs/Paper** (`remarkable-bookify-pdf`): `pdfReflow.ts` extrahiert Text via **pdfjs-dist** (legacy-ESM-Build, `await import('pdfjs-dist/legacy/build/pdf.mjs')` — externalisiert, NICHT gebündelt, sonst crasht `new DOMMatrix()` beim Init im Node-Kontext) → Zeilen über `hasEOL`/y rekonstruieren → Absätze umbrechen (weiche Silbentrennung am Zeilenende zusammenziehen, Kopf-/Fußzeilen über Wiederholungs-Heuristik entfernen, Überschriften per Schrifthöhe). `bookPdf.ts` rendert das HTML über dieselbe Buch-CSS zu PDF-Bytes (eigener `BrowserWindow` + `printToPDF`), Ausgabe `<name>.remarkable.pdf`, dann Upload.
- **Annahme/Grenze**: Reflow geht von **einspaltigen** Dokumenten aus. Abbildungen, Formeln und exaktes Layout gehen verloren (reiner Text). Zweispaltige Journals werden verschachtelt — bewusst nicht gelöst (bräuchte Spaltenerkennung wie k2pdfopt). Bei gescannten Bild-PDFs ohne Textebene bricht der Handler mit Hinweis ab (`charCount < 40`).
- **k2pdfopt bewusst NICHT genutzt**: kein Homebrew-Formula, nur unsigniertes Fremd-Binary → Gatekeeper/Notarisierungs-Problem für die verteilte App. Reflow via pdfjs ist dependency-frei und bündelt.

## Terminal (xterm.js + PTY)

- Integriertes Terminal via `node-pty` (Main) + `@xterm/xterm` (Renderer)
- Smart AI-Tool Detection via `checkCommandExists` — macOS/Linux: `opencode` (bevorzugt) → `claude`; **Windows: natives `claude` → natives `opencode` → WSL** (`wsl opencode` / `wsl claude`), da Claude Code nativ unter Windows läuft und opencode dort unzuverlässig ist
- WSL-Start des AI-Tools nutzt `wsl --cd "<vaultPath>"` — Tool startet direkt im Vault (via `/mnt/<drive>/…`), nicht im WSL-Home
- Shell unter Windows: `pwsh.exe` (PowerShell 7) bevorzugt, Fallback `powershell.exe` (5.1) — Detection gecacht in `resolveWindowsShell()`
- Terminal startet im Vault-Verzeichnis (vom Renderer übergebenes `cwd`, validiert via `existsSync`), Fallback Home
- Erweiterter PATH in `main/index.ts` (sowohl `terminal-create` als auch `check-command-exists`): enthält `/opt/homebrew/bin`, `~/.local/bin`, `~/.cargo/bin`, `~/.opencode/bin`, `~/.nvm/...`; Windows zusätzlich `%USERPROFILE%\.local\bin` (Claude-Code-Installer), `\.cargo\bin`, `\AppData\Roaming\npm`, `\scoop\shims`
- Bei neuen CLI-Tools: Pfad in **beiden** `additionalPaths`-Arrays in `main/index.ts` ergänzen
- **Terminal-Reset**: `handleRestart()` muss Mouse-Tracking-Modi deaktivieren (`\x1b[?1000l` etc.) und `term.reset()` aufrufen (nicht nur `clear()`), sonst werden Escape-Sequenzen als Klartext angezeigt nach Programmen wie opencode/claude

## Website (docs/index.html)

- Einsprachige HTML-Datei mit JS-basierter i18n (DE/EN)
- Übersetzungen als `translations` Objekt im `<script>`-Block
- JSON-LD Schema mit `softwareVersion` — muss bei Release aktualisiert werden
- Download verlinkt auf `https://github.com/bydb/mindgraph-notes/releases/latest`
- Alpha-Signup-Formular wurde in v0.3.0-beta durch direkte Download-Links ersetzt
