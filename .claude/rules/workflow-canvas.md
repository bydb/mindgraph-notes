---
paths:
  - "app/src/shared/workflow/**"
  - "app/src/main/workflows/**"
  - "app/src/renderer/components/WorkflowCanvas/**"
  - "app/src/renderer/stores/workflow*"
  - "app/src/shared/projectMatch*"
---

# Workflow Canvas

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## Workflow Canvas (visuelle Automationsschicht, opt-in Modul)
Module als verbindbare Bausteine mit **typisierten Ports** auf einem React-Flow-Canvas. Konzept + 11 Architektur-Entscheidungen: `docs/workflow-canvas-plan.md` (Abschnitt „Beschlossener Stand"). Eigener `TabType 'workflow-canvas'`, gegated durch Modul-Registry-Eintrag `workflow-canvas` (uiStore `MODULES` + `workflowCanvasEnabled`, Toggle in Settings → Module).

- **`shared/workflow/` ist Single-Source und prozessübergreifend**: `types.ts` (Ports, `WorkflowActionDefinition`, `MODULE_FEATURE_GATE`), `model.ts`, `registry.ts` (**Metadaten-only, KEIN `run()`** — von Renderer-Palette/Validierung UND Main-Runner gelesen), `validation.ts` (`canConnect` strikte Allowlist + `topoSort`), `simulation.ts` (Renderer-Trockenlauf), `examples.ts`.
- **Runner** (`main/workflows/runner.ts`): reine Logik per **Dependency Injection** (`RunnerServices`) — kennt weder `fs` noch Ollama direkt. Dispatch über `actionId` → Executor-Map. `index.ts` baut die Services (Ollama direkt `localhost:11434`, `discoverProjects`, `matchEmailToProjects`) und registriert IPC `workflow-load/save/run`.
- **Eine Schreibgrenze**: `writeFileSafe()` in `index.ts` (aus dem `write-file`-Handler extrahiert, mit `assertSafePath` + Backup + Empty-Block) — Runner-Schreib-Actions delegieren dorthin, nie eigenes `fs`.
- **`project.match`** = geteilter Keyword-Matcher `shared/projectMatch.ts` (auch von InboxPanel genutzt); nutzt die `_STATUS.md`-Marker-Keywords. **Token-basiert und trennzeichen-tolerant**: Begriff und Text werden in Buchstaben-/Ziffernläufe zerlegt, Treffer nur über GANZE Token-Folgen („UNO-Q"/„UNO Q" trifft „UnoQ", „UNO Qualität" nicht). **Dokument-Gattungswörter** (Zusammenfassung, Transkript, Protokoll, Call, Meeting, Bericht …) stehen in `GENERIC_STOPWORDS` und werden beim Matchen gefiltert — vorher landete eine WPForms-Wochenmail über „Zusammenfassung" im Betreff bei einem Arduino-Projekt (real, 09/2026). Tests: `shared/projectMatch.test.ts`. **`project.context`** liest `_STATUS*.md` des Projekts. Crystallizer (Dashboard → Projekt-Status-Widget) reichert diese an.
- **Hard-Lock im Runner**: vor LLM-Actions auf untrusted Input prüft der Runner `isHardLocked(model, action.hardLockModule)` (z.B. `task-extraction`) — kein Prompt-Injection-Backdoor um die Modell-Matrix herum.
- **Human-Review = terminaler Hand-off, KEIN Pause/Resume**: manueller Lauf → `ComposeView` öffnet automatisch (via `onOpenInbox`-Prop + `emailStore.startReply`); Event-Lauf → Task „✉️ Entwurf prüfen". Antwort-Empfänger wird bei Formular-Mails aus dem Body gezogen (`E-Mail:`-Zeile), sonst From.
- **Trigger**: manuell (▶ Ausführen, Seed = ausgewählte Mail) + Event (neue relevante Mail, feuert solange der Canvas-Tab offen ist). **Exactly-once** via `EmailAnalysis.workflowRuns` (workflowId→runId) in `emails.json`, analog `replyHandled`. `runForNewEmails` ist auf `MAX_TRIGGER_BATCH` gedeckelt + eng gefiltert (sonst feuert ein Klick gegen den ganzen Backlog → Ollama-/CPU-Sturm).
- **Persistenz**: `.mindgraph/workflows.json` (geräte-lokal). Aktuell wird nur **EIN** Workflow gehalten/gespeichert (`workflows[0]`). Multi-Workflow-Verwaltung ist offen.
- **Loop-Fallen (real aufgetreten, hart einhalten)**: (1) Zustand-Selektoren dürfen **kein** `.filter()/.map()` zurückgeben (neues Array/Render → „Maximum update depth"); stabile Referenz selektieren, im Render filtern. (2) Autosave **nur bei geändertem Inhalt** schreiben (`lastSavedWorkflowJson`) — sonst Write↔Vault-Watcher↔Reload-Loop. (3) `nodeTypes` als Modul-Konstante.
- **E-Mail-Markdown**: Compose-Body ist Markdown; `renderEmailHtml` (main) rendert beim Senden zu HTML (`**`, `*`, `•`, `———`, `> Zitat`, `##`→fett). ComposeView hat einen Vorschau-Toggle via IPC `email-render-html` (zeigt exakt das gesendete HTML).
- **Hand-off-Fenster nur öffnen, nie toggeln**: `onOpenInbox` in `App.tsx` prüft `inboxPanelOpen`. Beim manuellen Lauf ist das Inbox-Panel fast immer schon offen (die Seed-Mail wurde dort markiert) — ein Toggle schloss es, und der fertige Antwortentwurf blieb unsichtbar (real, 09/2026).
- **„Mensch prüft (Text)" legt IMMER eine Prüfnotiz an** (`REVIEW_NOTE_FOLDER` = Inbox-Notes-Ordner, Titel `Zur Prüfung – <Workflow-Name>`): manueller Lauf → Notiz wird im Editor geöffnet (`handoff.kind='note'` + `noteRel`), Event-Lauf → Aufgabe mit Wikilink auf die Notiz. Vorher stand das Ergebnis nur im Lauf-Panel bzw. als 80-Zeichen-Aufgabe.
- **Modell-Text hygienisch halten**: `stripLeadingSubjectLines` (composeDraft) und `cleanDraft` (Canvas) räumen alle führenden „Betreff:"-Zeilen ab; Antwort-/Beispiel-Prompts verbieten Unterschrift, Platzhalter und Betreff (Signatur kommt aus dem Compose-Fenster); `transformText` hängt „nur das Ergebnis, keine Einleitung" an. Aufgaben-Extraktion aus Sicht des EMPFÄNGERS („Frage beantworten", nicht „Frage stellen").
- **Aufgaben-Trigger lädt Cache-Stubs nach** (`notesWithTaskContent`): Notizen mit `content: ''` aber offenen `taskStats` werden per `readFilesBatch` gelesen — sonst „Keine heute fälligen Aufgaben" nach jedem App-Start. Fälligkeitsdatum im Seed lokal formatieren, nie `toISOString()` (Vortag-Verschiebung).
- **Trigger-Provider dürfen werfen** (`collectManual`): fehlende Antares-/edoobox-Zugangsdaten landen als Grund im Lauf statt als falsches „nichts gefunden". Betreff der Hand-off-Mail aus Empfängersicht (`Anmeldebestätigung: …`, `Erinnerung: Rückgabe … fällig`), nicht die interne Ereignisbezeichnung.
- **Dev-Falle**: Dev-App und installierte App teilen denselben Vault, haben aber **getrennte userData** → jeder Schreibvorgang triggert den Vault-Watcher der anderen App (CPU-Spitze). Beim Entwickeln nur EINE App auf dem Vault offen halten.
