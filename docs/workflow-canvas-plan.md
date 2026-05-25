# MindGraph Workflow Canvas

## Kurzidee

MindGraph bekommt eine visuelle Automations- und Integrationsschicht: Module werden wie Bausteine auf einem Canvas platziert. Jeder Baustein zeigt, welche Eingänge und Ausgänge er hat. Nutzer verbinden nur kompatible Schnittstellen und bauen daraus Arbeitsprozesse, die simuliert, geprüft und später ausgeführt werden können.

Das Ziel ist kein generisches n8n-Klonen, sondern eine MindGraph-native Prozessoberfläche:

- lokale Daten aus Vault, E-Mail, Kalender und Projekten
- lokale KI über Ollama als einsetzbarer Denkbaustein
- externe Systeme wie Antares oder edoobox als fachliche Datenquellen
- menschliche Freigabe als bewusstes Stoppschild
- nachvollziehbare Workflows statt versteckter Automagie

Pitch-Satz:

> MindGraph macht seine Module zu verbindbaren Bausteinen. Nutzer sehen, welche Daten wohin passen, und können lokale KI genau dort in ihre Arbeitsprozesse einbauen, wo Kontext, Entscheidung oder Formulierung gebraucht wird.

## Beschlossener Stand (2026-05-24, nach Stress-Test)

> Diese Sektion ist verbindlich und geht den Konzept-Abschnitten darunter vor, wo sie sich widersprechen. Sie ist das Ergebnis eines Architektur-Stress-Tests gegen den realen Code (React Flow, Telegram-Tool-Registry, IPC-Handler, FS-IPC-Sicherheitsmodell, Modell-Kompatibilitäts-Matrix).

### Was wir bauen (in Klartext)

Ein neuer Tab in MindGraph — **„Workflow Canvas"** — eine Fläche, auf die man Bausteine zieht und mit Linien verbindet. Jeder Baustein ist eine **Aktion**, die die App schon kann (Mail analysieren, Projekt erkennen, Ollama fragen, Notiz schreiben). Daraus entsteht ein Ablauf, der laufen kann.

```text
┌──────────┬─────────────────────────────────────┬──────────────┐
│ PALETTE  │            CANVAS                    │  INSPECTOR   │
│ 📧 Email │   ┌─────────┐      ┌──────────┐      │ Ausgewählt:  │
│ 📁 Projekt│  │ Email   │○────▶│ Projekt  │○──┐  │ Ollama       │
│ 🧠 Ollama│   │ analyze │      │ match    │   │  │ Modell:      │
│ 📝 Notiz │   └─────────┘      └──────────┘   ▼  │ [gemma4 ▾]   │
│ 👤 Prüfen│                            ┌──────────┐│ ✅ grün     │
└──────────┴────────────────────────────└──────────┘┴────────────┘
                 [ ▶ Simulieren ]  [ ▶ Ausführen ]
```

- **Links** die Palette mit Modulen, **Mitte** der Canvas (React Flow, wie der Graph-View, nur andere Karten), **rechts** der Inspector zum Einstellen einer Karte.
- Jede Karte hat **typisierte Ports**: links rein, rechts raus. Zieht man von einem Ausgang, **leuchten** nur die kompatiblen Eingänge; alles andere bleibt grau und lässt sich nicht verbinden, mit Begründung beim Hover. Das ist die Kern-Idee.

**Beispiel-Ablauf (Pitch-Workflow):**

```text
📧 Email analysieren → 📁 Projekt erkennen → 🧠 Ollama: Antwort entwerfen → 👤 Prüfen
```

Beim **▶ Ausführen** (manuell, mit ausgewählter Mail) ruft jeder Node die *echten* bestehenden Funktionen: `email-analyze` → Keyword-`project.match` → echtes Ollama mit Mail + Projektkontext → der Entwurf landet im bestehenden **Compose-Fenster**, der Mensch sendet selbst. Unten läuft ein **Log** mit (= Pitch-Leinwand). **▶ Simulieren** macht dasselbe als Trockenlauf mit Beispielausgaben, ohne zu schreiben.

**Zwei Start-Wege:** (1) **manuell** per Klick (Pitch-Kern, zuerst gebaut); (2) **automatisch** bei neuer relevanter Mail — der Workflow läuft selbst und legt eine Aufgabe „✉️ Entwurf prüfen" an (ambitionierter Teil, *nach* dem manuellen Weg gebaut).

### Architektur-Entscheidungen (11)

| # | Branch | Entscheidung |
|---|--------|-------------|
| 1 | Ziel | Echtes Fundament (Steps 1–7), nicht Wegwerf-Demo |
| 2 | Registry | Getrennte Workflow-Registry (eigene Port-/Privacy-Defs) |
| 3 | Schreibpfad | `run()` delegiert an geteilte, abgesicherte Write-Services (eine Schreibgrenze) |
| 4 | Trigger | Manuell **+ Event** (neue relevante Mail) |
| 5 | Exactly-once | Persistenter Marker `analysis.workflowRuns` in `emails.json` (wie `replyHandled`) |
| 6 | Human-Review | **Hand-off, terminal** — kein resumierbarer Pause-Zustand |
| 7 | project.match | Keyword-Matcher nach `shared`/main portieren (deterministisch, geteilt) |
| 8 | Typsystem | Strikte Allowlist, Multi-Output-Ports, **keine** impliziten Adapter |
| 9 | Persistenz | `.mindgraph/workflows.json`, geräte-lokal, beim Start geladen |
| 10 | Concurrency | Serielle FIFO-Queue (1); event-getriggert → **Task-Artefakt**, manuell → ComposeView |
| 11 | Modell/Lock | Per-Node-Modell, Runner **erzwingt `isHardLocked`** (wie emailStore) |
| 11b | Ort | Eigener TabType `workflow-canvas` + eigenes Modul, Palette modul-gefiltert |

### Prerequisites / Konsequenzen (nicht im Ursprungskonzept)

- **Refactor:** Write-Logik aus dem `write-file`-IPC-Handler in eine aufrufbare Service-Funktion ziehen (für #3) — assertSafePath, Auto-Backup, Empty-Write-Block bleiben so erhalten.
- **Port:** `matchEmailToProjects()` von renderer (`utils/projectMatch.ts`) nach `shared`/main (für #7).
- **Startup:** Runner + Trigger-Watcher laden Workflows beim App-Start, unabhängig vom geöffneten Tab (für #4).
- **Modul-Gate:** Run trifft Node eines deaktivierten Moduls → Node grau markieren + sauber stoppen, kein stiller Fehlschlag.
- **Plan-Revision:** Der ursprüngliche Step 7 („Human Review kann pausieren") ist **gestrichen**. Runs sind linear + terminal.

### Build-Reihenfolge (pitch-sicher zuerst)

> Begründung: Die riskante Kette (Event-Trigger + exactly-once + Queue) trägt **nichts** zur Live-Demo bei. Der Pitch braucht nur Canvas → Ports → Validierung → ein manueller Klick → echte Ollama-Ausgabe → echtes Artefakt. Darum liegt sie hinter dem Pitch-kritischen Pfad.

1. `shared/workflow/{types,model,registry,validation}` + Keyword-Match-Port + Write-Service-Extract
2. `workflowStore` + Canvas-UI (Nodes, Ports, `isValidConnection`, Palette, Inspector) ← **Pitch-Kern**
3. Runner in main: serielle Queue, Topo-Sort, Dispatch, `isHardLocked`, Modul-Check, Hand-off **— manuell ausgelöst** ← Pitch-Kern komplett
4. `workflows.json` Persistenz + IPC + Modul-Toggle + Tab-Registrierung
5. **Event-Trigger + exactly-once Marker** ← *nach* dem Pitch-kritischen Pfad; wenn am 29.05. nicht stabil, läuft die Demo trotzdem auf manuellem Klick

**Timeline-Realität:** Echtes Fundament + Event-Trigger ≈ 7 Personentage bei 5 verfügbaren Tagen + Pitch-Vorbereitung. Nach Schritt 3 ist die Demo vollständig; Schritt 5 ist bewusst optional fürs Datum.

### Scope-Grenzen v1

- **Freie Prompt-Nodes:** ja, via `ollama.transformText` mit Freitext-Prompt im Inspector — kein eigener Node-Typ.
- **Aktionen ohne Freigabe:** nur read-only Actions; jede `isWrite`/`requiresApproval`-Action geht über Hand-off (harte Sendgrenze bleibt).
- **Export/Templates:** die 4 Beispielworkflows als gebündelte Templates (`resources/`), Export = `workflows.json`-Eintrag — Phase 2.
- **Wie viel n8n:** Stopp bei „Bausteine + Validierung + ein Trigger". **Keine** Loops, Wenn/Dann-Verzweigungen oder Sub-Workflows in v1.

### Implementierungsstand (2026-05-25)

Alle 7 Build-Schritte umgesetzt; `tsc --noEmit` + `npm run build` (main/preload/renderer) grün. **Noch nicht im GUI laufzeit-getestet.**

Dateien:
- `app/src/shared/workflow/` — `types.ts`, `model.ts`, `registry.ts` (5 MVP-Module), `validation.ts` (canConnect/topoSort), `simulation.ts`, `examples.ts`
- `app/src/shared/projectMatch.ts` — von `renderer/utils` portiert (Re-Export bleibt)
- `app/src/main/workflows/runner.ts` — DI-Runner, Hard-Lock-Enforce, Modul-Check, Hand-off
- `app/src/main/index.ts` — `writeFileSafe()` extrahiert; IPC `workflow-load/save/run` (Ollama direkt localhost:11434)
- `app/src/renderer/stores/workflowStore.ts` + `components/WorkflowCanvas/` (CanvasView, NodeCard, Palette, Inspector, RunPanel)
- Verdrahtung: TabType `workflow-canvas`, VaultFeatures.workflowCanvas + Settings-Toggle, Launcher neben Dashboard, exactly-once via `EmailAnalysis.workflowRuns`

Bewusst offen (Laufzeit nötig / finale Verdrahtung): echte Ollama-Läufe + project.match gegen realen Vault; Auto-Trigger feuert nur bei offenem Canvas-Tab (echtes Hintergrund-Triggern = nächster Schritt); Compose-Hand-off zeigt den Entwurf, öffnet das ComposeView noch nicht automatisch; `notes.search` liefert vorerst `[]`.

## Produktbild

Der Canvas zeigt Module als Karten mit sichtbaren Ports:

```text
E-Mail
Outputs:
- neue Mail
- relevante Mail
- Mailtext
- Absender
- Anhänge
- erkannte Aufgaben

Inputs:
- Antwortentwurf
- Projekt setzen
- Mail verschieben
```

```text
Projekt
Inputs:
- Mail
- Text
- Suchbegriff

Outputs:
- passendes Projekt
- Projektkontext
- offene Aufgaben
- Status-Zusammenfassung
```

```text
Ollama
Inputs:
- Text
- Mail
- Projektkontext
- Prompt-Vorlage

Outputs:
- Zusammenfassung
- Antwortentwurf
- Entscheidungsvorschlag
- extrahierte Aufgaben
```

Wenn ein Ausgang angeklickt wird, leuchten passende Eingänge anderer Module. Nicht passende Ports bleiben grau oder werden als unzulässig markiert.

Beispiel:

```text
E-Mail.relevante Mail
-> Projekt.finde passendes Projekt
-> Projekt.lade Kontext
-> Ollama.entwirf Antwort
-> Mensch.prüft
-> E-Mail.erstelle Antwortentwurf
```

## Warum Das Für MindGraph Passt

MindGraph ist bereits mehr als ein Obsidian-Ersatz. Die App hat Module, die heute teilweise nebeneinander existieren:

- Notizen und Vault
- Wissensgraph
- E-Mail
- Kalender und Erinnerungen
- Aufgaben
- lokale KI
- Projektstatus
- Antares
- edoobox
- Telegram

Der Workflow Canvas wäre die Schicht, die diese Module bewusst miteinander sprechen lässt. Damit wird aus "viele Features" ein zusammenhängender Workspace.

## Kernprinzipien

### 1. Module Bieten Fähigkeiten An

Jedes Modul registriert seine Fähigkeiten in einer zentralen Registry. Eine Fähigkeit ist eine konkrete Operation mit typisierten Eingängen und Ausgängen.

Beispiele:

```text
email.newRelevantEmail
output: EmailMessage

email.analyze
input: EmailMessage
output: EmailAnalysis

project.match
input: EmailMessage | Text
output: Project

project.context
input: Project
output: ProjectContext

ollama.generateReply
input: EmailMessage + ProjectContext + PromptTemplate
output: DraftReply
```

### 2. Ports Sind Typisiert

Verbindungen sind nur erlaubt, wenn Ausgangs- und Eingangstyp kompatibel sind.

Mögliche Port-Typen:

```text
email
email_analysis
text
project
project_context
task
calendar_event
note
draft_reply
booking
course
participant
media_item
availability
human_approval
json
```

Das System weiß dadurch:

```text
email -> project.match = erlaubt
project_context -> ollama.generateReply = erlaubt
email -> calendar.createEvent = nicht direkt erlaubt
email_analysis.extractedDates -> calendar.createEvent = erlaubt
```

### 3. KI Ist Ein Baustein, Kein Sonderfall

Ollama wird nicht nur als Chat verstanden, sondern als Modul mit mehreren Operationen:

```text
ollama.summarize
ollama.extractTasks
ollama.generateReply
ollama.classify
ollama.decide
ollama.transformText
```

Dadurch kann KI an verschiedenen Stellen in einen Prozess eingesetzt werden:

```text
E-Mail -> Ollama.zusammenfassen -> Notiz erstellen
E-Mail -> Projektkontext -> Ollama.Antwort entwerfen -> Mensch prüfen
E-Mail -> Ollama.Gerät erkennen -> Antares.Verfügbarkeit prüfen
```

### 4. Menschliche Freigabe Ist Ein Eigener Node

Viele Workflows sollten nicht vollautomatisch ausführen. Stattdessen:

```text
KI erstellt Vorschlag
-> Mensch prüft
-> Aktion wird freigegeben
```

Das ist wichtig für:

- E-Mail senden
- Termine anlegen
- Daten aus externen Systemen übernehmen
- Lösch- oder Verschiebeaktionen
- Cloud-/Datenschutzgrenzen

## Beispielworkflows

### Workflow 1: Fortbildungsanfrage Per E-Mail

```text
Trigger: Neue relevante E-Mail
-> Email.analyze
-> Project.match
-> Project.context
-> edoobox.searchCourses
-> Calendar.checkAvailability
-> Ollama.generateReply
-> Human.review
-> Email.prepareReply
```

Nutzen:

- erkennt Anfrage
- findet passendes Projekt oder Thema
- prüft vorhandene Kurse
- berücksichtigt Kalender
- erstellt Antwortentwurf
- lässt den Menschen final entscheiden

### Workflow 2: Antares-Verleihrückfrage

```text
Trigger: Neue E-Mail mit Geräte-/Medienbezug
-> Ollama.extractMediaRequest
-> Antares.searchItem
-> Antares.checkAvailability
-> Ollama.generateReply
-> Human.review
-> Email.prepareReply
```

Nutzen:

- Medium oder Gerät aus Freitext erkennen
- Verfügbarkeit prüfen
- Antwort mit echten Bestandsdaten vorbereiten

### Workflow 3: Projektstatus Aus E-Mails

```text
Trigger: Neue relevante Projektmail
-> Project.match
-> Project.context
-> Note.createEmailNote
-> ProjectStatus.addSignal
-> Ollama.updateStatusDraft
-> Human.review
```

Nutzen:

- E-Mail wird nicht nur abgelegt
- sie wird Projektkontext
- der wöchentliche Status bleibt lebendig

### Workflow 4: Workshop-Vorbereitung

```text
Trigger: Termin in Kalender in 7 Tagen
-> Calendar.getEvent
-> Project.matchFromTitle
-> edoobox.getParticipants
-> Notes.searchRelated
-> Ollama.createBriefing
-> Task.createChecklist
```

Nutzen:

- automatische Vorbereitung
- Teilnehmende und Kontext werden zusammengeführt
- Checkliste entsteht vor dem Termin

## Technische Architektur

### 1. Workflow Registry

Zentrale Beschreibung aller verfügbaren Aktionen.

Ort:

```text
app/src/shared/workflow/registry.ts
```

Beispielstruktur:

```ts
export interface WorkflowActionDefinition {
  id: string
  moduleId: string
  label: string
  description?: string
  inputs: WorkflowPortDefinition[]
  outputs: WorkflowPortDefinition[]
  configSchema?: WorkflowConfigSchema
  requiresApproval?: boolean
  privacy?: WorkflowPrivacyMetadata
}

export interface WorkflowPortDefinition {
  id: string
  label: string
  kind: WorkflowPortKind
  required?: boolean
  multiple?: boolean
}
```

### 2. Port-Typen

Ort:

```text
app/src/shared/workflow/types.ts
```

Beispiel:

```ts
export type WorkflowPortKind =
  | 'email'
  | 'email_analysis'
  | 'text'
  | 'project'
  | 'project_context'
  | 'task'
  | 'calendar_event'
  | 'note'
  | 'draft_reply'
  | 'booking'
  | 'course'
  | 'participant'
  | 'media_item'
  | 'availability'
  | 'human_approval'
  | 'json'
```

Optional später:

```ts
export interface WorkflowTypeCompatibilityRule {
  from: WorkflowPortKind
  to: WorkflowPortKind
  transform?: string
}
```

Damit können implizite Adapter entstehen:

```text
email -> text über email.bodyText
email_analysis -> task[] über suggestedActions
project -> text über project.name
```

### 3. Workflow-Datenmodell

Ort:

```text
app/src/shared/workflow/model.ts
```

Beispiel:

```ts
export interface Workflow {
  id: string
  name: string
  description?: string
  version: number
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: string
  updatedAt: string
}

export interface WorkflowNode {
  id: string
  actionId: string
  position: { x: number; y: number }
  config: Record<string, unknown>
}

export interface WorkflowEdge {
  id: string
  fromNodeId: string
  fromPortId: string
  toNodeId: string
  toPortId: string
}
```

Speicherort:

```text
/Users/jochenleeder/2026/.mindgraph/workflows.json
```

Später möglich:

```text
900 - Workflows/<Workflow Name>.workflow.md
```

mit YAML/JSON-Block im Vault.

### 4. Workflow Store

Ort:

```text
app/src/renderer/stores/workflowStore.ts
```

Aufgaben:

- Workflows laden und speichern
- Canvas-State verwalten
- Node hinzufügen
- Edge hinzufügen
- Edge validieren
- Simulation starten
- Run-Logs anzeigen

### 5. IPC-Handler Im Main Process

Ort:

```text
app/src/main/index.ts
```

Handler:

```text
workflow-load
workflow-save
workflow-simulate
workflow-run
workflow-run-step
workflow-get-registry
```

Wichtig: Der Renderer darf Workflows gestalten, aber riskante Aktionen sollten vom Main Process validiert und ausgeführt werden.

### 6. Workflow Runner

Ort:

```text
app/src/main/workflows/runner.ts
```

Aufgaben:

- Graph topologisch sortieren
- Inputs sammeln
- Actions ausführen
- Outputs weiterreichen
- Fehler stoppen oder branch-spezifisch behandeln
- Human-Review als terminalen Hand-off-Node behandeln (Run endet, erzeugt Artefakt — siehe „Beschlossener Stand" #6; **kein** resumierbarer Pause-Zustand)
- Run-Log schreiben

Ein Run erzeugt:

```ts
export interface WorkflowRun {
  id: string
  workflowId: string
  status: 'running' | 'paused' | 'success' | 'failed' | 'cancelled'
  startedAt: string
  finishedAt?: string
  steps: WorkflowRunStep[]
}
```

### 7. Canvas UI

Ort:

```text
app/src/renderer/components/WorkflowCanvas/
```

Komponenten:

```text
WorkflowCanvasView.tsx
WorkflowNodeCard.tsx
WorkflowPort.tsx
WorkflowPalette.tsx
WorkflowInspector.tsx
WorkflowRunPanel.tsx
WorkflowSimulationPanel.tsx
```

UI-Idee:

- linke Palette mit Modulen
- Mitte Canvas
- rechte Inspector-Seite
- unten Run-/Simulation-Log
- Ports farblich nach Typ
- kompatible Ports leuchten beim Verbinden
- unzulässige Verbindungen werden blockiert

## Modul-Definitionen Für Den MVP

### Email

Actions:

```text
email.selectedEmail
output: email

email.analyze
input: email
output: email_analysis

email.prepareReply
input: email + draft_reply
output: human_approval

email.move
input: email + folder
output: email
requiresApproval: true
```

### Project

Actions:

```text
project.match
input: email | text
output: project

project.context
input: project
output: project_context

project.statusSummary
input: project
output: text
```

### Ollama

Actions:

```text
ollama.summarize
input: text
output: text

ollama.generateReply
input: email + project_context
output: draft_reply

ollama.extractTasks
input: text
output: task[]

ollama.classify
input: text
output: json
```

### Notes

Actions:

```text
notes.create
input: text
output: note

notes.search
input: text
output: note[]

notes.append
input: note + text
output: note
```

### Human Review

Actions:

```text
human.reviewText
input: text
output: human_approval

human.reviewDraftReply
input: draft_reply
output: human_approval
```

## Spätere Modul-Definitionen

### edoobox

Actions:

```text
edoobox.searchCourses
input: text
output: course[]

edoobox.getBookings
input: date_range
output: booking[]

edoobox.getParticipants
input: course
output: participant[]
```

### Antares

Actions:

```text
antares.searchMedia
input: text
output: media_item[]

antares.checkAvailability
input: media_item
output: availability

antares.findReservation
input: text
output: json
```

### Calendar

Actions:

```text
calendar.findEvents
input: date_range
output: calendar_event[]

calendar.createEvent
input: calendar_event
output: calendar_event
requiresApproval: true

calendar.checkAvailability
input: date_range
output: availability
```

## MVP Für Den Pitch Am 29.05.2026

Der MVP muss nicht alles ausführen. Er muss die Idee glaubwürdig zeigen:

1. Neues Panel "Automations Canvas"
2. Palette mit 5 Modulen:
   - Email
   - Projekt
   - Ollama
   - Notiz
   - Menschliche Prüfung
3. Nodes auf Canvas platzieren
4. Ports sichtbar anzeigen
5. Kompatible Ports beim Verbinden hervorheben
6. Ungültige Verbindung blockieren
7. Beispielworkflow laden:

```text
Neue relevante E-Mail
-> Projekt erkennen
-> Projektkontext laden
-> Ollama Antwort entwerfen
-> Mensch prüfen
-> Antwort vorbereiten
```

8. Button "Simulieren"
9. Simulation zeigt Schrittfolge und Beispielausgaben

Beispiel-Simulationslog:

```text
1. Eingabe: Re: Roll-Up Marslandschaft
2. Projekt erkannt: 160 - Mars Abenteuer
3. Kontext geladen: _STATUS.md + letzte Projektmails
4. Ollama-Schritt: Antwortentwurf würde erzeugt
5. Wartet auf menschliche Freigabe
```

Das reicht für den Pitch, weil die Botschaft sichtbar wird:

> Ich kann Module meiner App wie Bausteine verbinden und sehe sofort, wo KI sinnvoll eingefügt werden kann.

## UX-Details

### Port-Farben

```text
email: Blau
project: Grün
text: Grau
ai/draft: Violett
task: Orange
calendar_event: Cyan
human_approval: Rot/Pink
external data: Gelb
```

### Node-Karte

Eine Node-Karte sollte zeigen:

- Modulname
- Action-Name
- kurzer Zweck
- Inputs links
- Outputs rechts
- Warnsymbol bei fehlender Konfiguration
- Schloss/Freigabe-Symbol bei riskanten Aktionen
- Datenschutz-Badge bei personenbezogenen Daten

### Inspector

Beim Klick auf Node:

- Action-Beschreibung
- Konfiguration
- benötigte Credentials
- Beispielinput
- Beispieloutput
- Datenschutz-Hinweis
- Testbutton

### Verbindungsmodus

Beim Ziehen von einem Port:

- kompatible Ports leuchten
- inkompatible Ports werden gedimmt
- bei Hover wird erklärt, warum Verbindung passt oder nicht passt

Beispiel:

```text
Passt: Email -> Projekt.match
Grund: project.match akzeptiert email als Input.
```

```text
Passt nicht: ProjectContext -> Calendar.createEvent
Grund: Calendar.createEvent erwartet calendar_event.
Möglicher Adapter: Ollama.extractDates oder EmailAnalysis.extractedInfo.
```

## Sicherheits- Und Datenschutzmodell

Workflows müssen Datenschutz explizit sichtbar machen.

Jede Action kann Metadaten tragen:

```ts
export interface WorkflowPrivacyMetadata {
  containsPersonalData?: boolean
  cloudAllowed?: boolean
  writesToDisk?: boolean
  sendsExternalRequest?: boolean
  requiresCredential?: boolean
}
```

Regeln:

- Cloud-LLM-Schritte müssen sichtbar markiert werden.
- Lokale Ollama-Schritte sind bevorzugt.
- E-Mail senden braucht Freigabe.
- Kalender schreiben braucht Freigabe.
- Daten löschen oder verschieben braucht Freigabe.
- Externe APIs wie edoobox/Antares zeigen Credential-Status.

## Entwicklungsplan

### Schritt 1: Typen Und Registry

Dateien:

```text
app/src/shared/workflow/types.ts
app/src/shared/workflow/model.ts
app/src/shared/workflow/registry.ts
```

Ergebnis:

- Port-Typen definiert
- Action-Definitionen definiert
- erste statische Registry mit Email, Project, Ollama, Human Review

### Schritt 2: Validierung

Datei:

```text
app/src/shared/workflow/validation.ts
```

Funktionen:

```ts
canConnect(fromPort, toPort): boolean
validateWorkflow(workflow): WorkflowValidationResult
```

Ergebnis:

- Verbindungen sind maschinenprüfbar
- UI kann passende Ports hervorheben

### Schritt 3: Workflow Store

Datei:

```text
app/src/renderer/stores/workflowStore.ts
```

Ergebnis:

- Workflows im Renderer verwalten
- Nodes und Edges erstellen
- Beispielworkflow laden

### Schritt 4: Canvas UI

Dateien:

```text
app/src/renderer/components/WorkflowCanvas/WorkflowCanvasView.tsx
app/src/renderer/components/WorkflowCanvas/WorkflowNodeCard.tsx
app/src/renderer/components/WorkflowCanvas/WorkflowPalette.tsx
app/src/renderer/components/WorkflowCanvas/WorkflowInspector.tsx
```

Ergebnis:

- sichtbarer Canvas
- Module als Legosteine
- Ports sichtbar
- Verbindungen möglich
- ungültige Verbindungen blockiert

### Schritt 5: Simulation

Dateien:

```text
app/src/shared/workflow/simulation.ts
app/src/renderer/components/WorkflowCanvas/WorkflowSimulationPanel.tsx
```

Ergebnis:

- Beispielworkflow kann trocken durchlaufen
- Run-Log zeigt Schrittfolge
- keine riskanten echten Aktionen

### Schritt 6: Persistenz

IPC:

```text
workflow-load
workflow-save
```

Speicher:

```text
.mindgraph/workflows.json
```

Ergebnis:

- Workflows über App-Neustart erhalten

### Schritt 7: Echter Runner

Datei:

```text
app/src/main/workflows/runner.ts
```

Ergebnis:

- erste echte Actions ausführbar
- Human Review endet den Run als Hand-off (Artefakt: Compose-Modal bei manuellem Lauf, Task bei Event-Trigger) — kein Pause/Resume
- Log wird gespeichert

## Offene Produktfragen

1. Ist der Workflow Canvas ein eigenes Dashboard-Modul oder Teil des bestehenden Graphs?
2. Werden Workflows in `.mindgraph` gespeichert oder als Vault-Notizen sichtbar?
3. Soll der Canvas nur Automationen zeigen oder auch Architektur-/Spezifikationskarten?
4. Wie frei dürfen Nutzer eigene Prompt-Nodes konfigurieren?
5. Welche Aktionen dürfen ohne Freigabe laufen?
6. Wie wird ein laufender Workflow im UI angezeigt?
7. Gibt es wiederkehrende Trigger oder nur manuelles Ausführen?
8. Sollen Workflows exportierbar/importierbar sein?
9. Gibt es Templates für typische Prozesse?
10. Wie viel n8n-ähnliche Macht ist sinnvoll, bevor es zu technisch wird?

## Empfehlung

Für den Pitch zuerst als **visuelle Prozess- und KI-Steckfläche** zeigen, nicht als vollwertige Automationsmaschine.

Der erste Eindruck soll sein:

> Ich sehe meine Module. Ich sehe ihre Schnittstellen. Ich sehe, welche Bausteine zusammenpassen. Ich kann Ollama an sinnvollen Stellen einfügen. Und ich kann daraus später echte Automationen machen.

Das ist glaubwürdig, weil MindGraph die Module bereits hat. Der Workflow Canvas macht sie nicht neu, sondern verbindet sie.

