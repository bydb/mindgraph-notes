# Sprachbefehle — Umsetzungsskizze Stufe 1

Revision 4 (25.08.2026). Stufe 1a ist gebaut und im laufenden Betrieb erweitert — siehe Abschnitt 14.
Revision 2 korrigierte Revision 1 in sechs Punkten (Abschnitte 6, 7, 8 und 12 neu geschrieben).
Die Abschnitte 1 bis 13 sind der Entwurf und stehen unverändert; Abschnitt 14 hält fest, was davon
tatsächlich gebaut wurde und wo der Code bewusst abweicht.

## Zielbild

```
Mikrofon (halten) oder Tastatur
  -> VoiceCommandController (Zustandsmaschine)
  -> Transkript sichtbar + korrigierbar
  -> deterministischer Absichts-Erkenner (kein Sprachmodell)
  -> typisierte MindGraph-Aktion
  -> vorhandene Funktion
  -> Antwortkarte in der Befehlspalette, optional zwei gesprochene Saetze
```

Sprache ist ein zweiter Eingang in die Befehlspalette, kein neues Modul und kein neuer Tab.
Die Palette bleibt ein duenner Adapter; die Logik liegt im Controller (Abschnitt 4).

**Stufe 1 schreibt nichts.** Alle Absichten sind lesend, navigierend oder sprechend. Deshalb braucht
Stufe 1 keinen Bestaetigungsdialog, keinen Staging-Pfad und keine Hard-Lock-Pruefung. Schreibende Faelle
sind Stufe 2 und laufen unveraendert durch den Notiz-Agenten mit Staging und Review-Panel.

## 1. Die acht Absichten und ihr Reifegrad

| ID | Beispielsatz | Art | Datenquelle | Stufe |
|---|---|---|---|---|
| `view.dashboard` | „Oeffne das Dashboard" | navigate | `openDashboardTab()` | 1a |
| `search.notes` | „Suche nach Lieferantenvertrag" | navigate | QuickSearch | 1a |
| `tasks.overdue` | „Was ist ueberfaellig?" | answer | `snapshot.tasks.overdue` | 1a |
| `briefing.today` | „Was ist heute wichtig?" | answer | `collectFocusTasks(tasks, 5)` | 1b |
| `week.focus` | „Was steht diese Woche an?" | answer | `collectWeekFocus(...)` | 1b |
| `activity.today` | „Was hat MindGraph heute uebernommen?" | answer | ActivityLedger (neu) | 1b |
| `project.open` | „Oeffne Projekt Mueller" | navigate | **Semantik offen** | 1c |
| `note.current` | „Lies mir die aktuelle Notiz vor" | **speak** | Editorpuffer + lokale TTS | 1c |

Drei Arten, nicht zwei. `note.current` ist keine Navigation: es sendet Notizinhalt an eine
Sprachausgabe und braucht deshalb eine eigene Datenschutzgrenze (Abschnitt 6).

1a ist der vertikale Prototyp: eine Absicht je Art, alle drei Datenwege einmal durchgestochen, keine
neue Persistenz. 1b setzt den Snapshot-Provider und den Ledger voraus. 1c ist blockiert, bis die
Semantik entschieden ist.

## 2. Typisierter Action-Contract

Reine Logik in `shared/voiceCommands/`, damit sie mit vitest testbar bleibt.

```ts
// shared/voiceCommands/types.ts
export type AppActionId =
  | 'briefing.today' | 'tasks.overdue' | 'week.focus'
  | 'search.notes'   | 'project.open'  | 'note.current'
  | 'view.dashboard' | 'activity.today'

/** Vollstaendig, fuer JEDE ID. Leere Objekte sind explizit, nicht implizit. */
export interface ActionParams {
  'briefing.today': Record<string, never>
  'tasks.overdue':  Record<string, never>
  'week.focus':     Record<string, never>
  'activity.today': Record<string, never>
  'view.dashboard': Record<string, never>
  'search.notes':   { query: string }
  'project.open':   { projectRel: string }        // aufgeloest, nicht der gesprochene Name
  'note.current':   { noteId: string }            // aufgeloest aus dem aktiven Tab
}

export type AnyAction = { [K in AppActionId]: { id: K; params: ActionParams[K] } }[AppActionId]

export interface ResolvedAction {
  action: AnyAction
  kind: 'answer' | 'navigate' | 'speak'
  score: number         // 0..1
  margin: number        // Abstand zum zweitbesten Treffer
  transcript: string
  source: 'voice' | 'keyboard'
}
```

Wichtig: Parameter sind im Vertrag **bereits aufgeloest**. Der gesprochene Name „Mueller" wird vom
Controller in `projectRel` uebersetzt, notfalls ueber eine Rueckfrage. Eine Aktion bekommt nie einen
rohen Sprachschnipsel und raet nicht selbst.

Folgeaktionen tragen ihre Parameter mit, sonst sind sie nur Dekoration:

```ts
export interface FollowUp { label: string; action: AnyAction }
```

Die Aktionsschicht ist semantisch: jede Aktion ruft die vorhandene Store-Funktion auf
(`openDashboardTab()`, `switchRightPanel('overdue')`), niemals synthetische Klicks.

```ts
// renderer/voice/actions.ts
export interface ActionResult {
  card: AnswerCard | null
  speech: string | null       // hoechstens zwei Saetze
  navigated: string | null    // Klartext, was die App getan hat
}

export interface ActionSpec<K extends AppActionId> {
  id: K
  kind: 'answer' | 'navigate' | 'speak'
  requiresModule?: ModuleId
  run: (params: ActionParams[K], ctx: VoiceContext) => Promise<ActionResult>
}
```

Die bestehende `CommandAction`-Liste in `App.tsx` bleibt unveraendert daneben bestehen.

## 3. Kontextuebergabe

```ts
export interface VoiceContext {
  vaultPath: string | null
  notes: Note[]
  activeNote: { id: string; title: string; path: string } | null
  editor: EditorVoiceBridge          // liefert den LEBENDEN Puffer, siehe unten
  viewMode: 'editor' | 'split' | 'canvas'
  enabledModules: Record<string, boolean>
  lastEntity: { kind: 'note' | 'project'; id: string; title: string } | null
  snapshot: DashboardSnapshotProvider
}
```

`activeNote` sind Metadaten aus dem Tab. Der tatsaechliche, moeglicherweise ungespeicherte Text steht in
CodeMirror. Dafuer eine schmale Bruecke, die der Editor registriert:

```ts
// renderer/voice/editorBridge.ts
export interface EditorVoiceBridge {
  /** Aktueller Puffer inkl. ungespeicherter Aenderungen; null, wenn kein Editor offen ist. */
  getActiveBuffer(): { noteId: string; title: string; markdown: string } | null
}
```

`lastEntity` ist ein einzelner Slot, keine Dialoghistorie: „zeig mir die Aufgaben dazu" funktioniert
nach „oeffne Projekt Mueller", alles darueber hinaus ist Stufe 3.

## 4. VoiceCommandController

Eigenes Modul `renderer/voice/controller.ts`, nicht weitere Zustaende in `App.tsx`.

```ts
export type VoiceCommandState =
  | { kind: 'idle' }
  | { kind: 'search';       query: string; suggestions: FallbackSuggestion[] }
  | { kind: 'listening';    startedAt: number }
  | { kind: 'transcribing' }
  | { kind: 'clarify';      transcript: string; reason: ClarifyReason; options: ClarifyOption[] }
  | { kind: 'running';      action: ResolvedAction; startedAt: number }
  | { kind: 'answer';       card: AnswerCard; spoken: boolean }
  | { kind: 'error';        message: string; transcript?: string }

export type ClarifyReason = 'ambiguous-intent' | 'ambiguous-param' | 'missing-param' | 'module-off'

export interface VoiceCommandController {
  state: VoiceCommandState
  submitText(text: string, source: 'keyboard' | 'voice'): void
  holdStart(): void
  holdEnd(): void
  abort(reason: 'escape' | 'blur' | 'keyup-cancel' | 'user'): void
  chooseOption(index: number): void
  dismiss(): void
}
```

Der `clarify`-Zustand haelt die offenen Optionen. Deshalb kann eine gesprochene „Eins" zugeordnet werden:
befindet sich der Controller in `clarify`, prueft der Erkenner **zuerst** Ordinalformen (eins, zwei, drei,
der erste, one, two, three) gegen die Optionsliste und erst danach auf eine neue Absicht. Ohne diesen
Zustand haette „Eins" keinen Bezugspunkt.

`abort` deckt alle drei Abbruchwege ab: `keyup` ausserhalb des Halte-Fensters, Fensterverlust (`blur`) und
Escape. In jedem Fall werden MediaRecorder und Stream freigegeben und der `voiceStore` auf `idle` gesetzt.

Die Palette rendert nur den Zustand und ruft Controller-Methoden auf.

## 5. Erkennung, Schwellen und Rueckfall

`shared/voiceCommands/match.ts`, rein, ohne Netz und ohne Modell:

1. Normalisieren: Kleinschreibung, Satzzeichen weg, Fuellwoerter entfernen. Umlaute bleiben.
2. Je Absicht Ausloesemuster (Regex mit benannten Gruppen), deutsch und englisch.
3. Bewertung: exakter Mustertreffer 1.0, sonst Deckungsgrad der Schluesselwoerter.

**Zwei Bedingungen, nicht eine.** Ein absoluter Schwellenwert allein reicht nicht: 0,90 gegen 0,88 ist
mehrdeutig, obwohl beide hoch liegen.

```
ausfuehren      wenn top >= 0.75 UND (top - second) >= 0.15
rueckfragen     wenn top >= 0.45, aber der Abstand zu klein ist
Rueckfall-Suche wenn top < 0.45
```

Der Rueckfall ist **nicht** die heutige Palettensuche. `fuzzyMatch` (CommandPalette.tsx:31) prueft eine
Subsequenz ueber den vollstaendigen Text — „Was ist heute wichtig?" findet damit in aller Regel gar
nichts. Der Rueckfall braucht drei Dinge:

1. **Eine garantierte Aktion**: „Notizen nach ‹Transkript› durchsuchen". Sie liefert immer ein Ergebnis,
   damit die Liste nie leer ist.
2. **Tokenisierte Vorschlaege**: Transkript in Inhaltswoerter zerlegen, jede `CommandAction` nach der Zahl
   getroffener Tokens in Label und Keywords bewerten, die besten drei mit mindestens einem Treffer zeigen.
3. **Ein Test gegen den echten Aktionsbestand**: alle Beispielsaetze der acht Absichten plus zehn
   Unsinnssaetze durch die reale `commandActions`-Liste schicken und pruefen, dass die Ergebnisliste
   niemals leer ist.

Querschnittsregel: **das Transkript steht sichtbar und editierbar oben auf der Karte.** Whisper verhoert
sich im Deutschen regelmaessig; wer nicht sieht, was verstanden wurde, schreibt den Fehler der App zu.

Vier Rueckfragefaelle mit festgelegtem Ausgang:

- **Absicht mehrdeutig**: hoechstens drei Vorschlaege, Auswahl per Ziffer oder Klick, keine Ausfuehrung.
- **Parameter mehrdeutig** (drei Projekte passen): Auswahlkarte, gesprochen nur die Zahl.
- **Parameter fehlt**: Rueckfrage mit fokussiertem Eingabefeld; tippen ist hier schneller als sprechen.
- **Modul aus**: kein stiller Fehlschlag, die Karte benennt das Modul und fuehrt in die Einstellungen.
  Die Palette blendet solche Eintraege heute aus — gesagt werden koennen sie trotzdem.

## 6. Antwortkarte, Sprachausgabe und deren Grenze

```ts
export interface AnswerCard {
  transcript: string
  title: string
  lines: { text: string; noteId?: string; dueIn?: number }[]
  sources: { label: string; noteId?: string }[]
  followUps: FollowUp[]
}
```

Die Karte ersetzt die Trefferliste im bestehenden Overlay (`quick-switcher-overlay`). Keine neue Flaeche.

Sprachausgabe ist ein eigener kurzer Text, nicht der Kartentext: hoechstens zwei zusammenfassende Saetze
(„Vier Aufgaben sind ueberfaellig, die aelteste seit elf Tagen"), und nur wenn die Eingabe per Mikrofon kam.
Vorgelesene Listen merkt sich niemand.

**Datenschutzgrenze.** `speak()` leitet bei `ttsEngine === 'elevenlabs'` den gesamten Text an die Cloud
(tts.ts:129). Fuer Flashcards und den Editor ist das eine bewusste Nutzerentscheidung. Bei Sprachbefehlen
ist es keine: dort erzeugt die App den Text selbst und faende sich mit Aufgabentiteln und Notizinhalt bei
einem Dienst wieder, den der Nutzer fuer diesen Weg nie ausgewaehlt hat.

Deshalb, im Einklang mit der Projektlinie „Opt-in statt Sperre":

- Sprachbefehl-Antworten und `note.current` gehen **standardmaessig** ueber die lokale Systemstimme,
  unabhaengig von `ttsEngine`. Umsetzung als `forceLocal`-Option in `TtsOptions`, nicht als zweite
  Sprechfunktion.
- Wer Cloud-Stimmen auch dafuer will, schaltet `speech.commandsAllowCloudTts` frei (Standard aus), mit
  sichtbarem Hinweis, dass dabei Notizinhalt das Geraet verlaesst.
- `speak()` selbst bleibt fuer die bestehenden Aufrufer unveraendert.

## 7. ActivityLedger

Neu, weil die Run-Registry zwar bis zu acht beendete Laeufe je Sender mit offenen Karten haelt
(`MAX_RETAINED_FINISHED_RUNS_PER_SENDER`, runRegistry.ts:86), aber nicht dauerhaft ist. Historie laesst
sich nicht rueckwirkend rekonstruieren — deshalb entsteht der Ledger in Stufe 1, obwohl die Minutenanzeige
erst Stufe 2 ist.

**Ablage: `app.getPath('userData')/activity/<sha256(vaultPath).slice(0,16)>.json`.**
Nicht im Vault. Ein `.mindgraph/`-Pfad ist nur vor dem MindGraph-Sync sicher, nicht vor iCloud, Dropbox
oder einem Netzlaufwerk — dort landet die Datei trotzdem auf allen Geraeten und die Tageszaehler
verdoppeln sich. `userData` ist dagegen praezedenzhaltig (`settings.json`, `plugin-secrets.json`,
`elevenlabs-key.enc`). Die Aenderung an `main/sync/fileTracker.ts` entfaellt damit ersatzlos.

Nebenwirkung, die stimmt so: Entwicklungs-App und installierte App haben getrennte `userData` und damit
getrennte Ledger. Das ist richtig — Testlaeufe sollen die Zaehler des Nutzers nicht faelschen.

Getrennte Ereignisse statt eines Sammeltyps, sonst sind die Zaehler nicht ableitbar:

```ts
// shared/activityLog.ts (rein: Schema, Retention, Tagesaggregation)
export type ActivityType = 'table-merge' | 'document' | 'summary' | 'web-research' | 'other'

export type ActivityEvent =
  | { at: number; kind: 'agent-run-finished';   runId: string; durationMs: number;
      activityType: ActivityType; resultCount: number; status: 'ok' | 'failed' | 'aborted' }
  | { at: number; kind: 'agent-result-accepted'; runId: string; format: 'md'|'xlsx'|'docx'|'html'|'png' }
  | { at: number; kind: 'agent-result-discarded'; runId: string; format: 'md'|'xlsx'|'docx'|'html'|'png' }
  | { at: number; kind: 'task-created';          count: number }
  | { at: number; kind: 'voice-command';         actionId: AppActionId
      status: 'ok' | 'clarified' | 'rejected'; sttMs?: number; matchMs?: number; dataMs?: number }
```

- **Dauer genau einmal**, an `agent-run-finished`, nie an der Uebernahme. Sonst zaehlt ein Lauf mit drei
  uebernommenen Ergebnissen dreifach.
- **`activityType` wird aus der Werkzeugfolge abgeleitet, nicht aus Text**: `collect_table` plus
  `write_xlsx` ergibt `table-merge`. Das ist inhaltsfrei und trotzdem trennscharf genug fuer
  Referenzzeiten je Taetigkeit.
- Ehrliche Einschraenkung: aus `table-merge` wird nie „Angebotsvergleich". Diese Bezeichnung aus dem
  urspruenglichen Vorschlag ist ohne Inhaltskenntnis nicht ableitbar. Die Karte sagt „1 Tabellen-Auswertung
  abgeschlossen". Wer „Angebotsvergleich" lesen will, vergibt den Namen selbst bei der Referenzzeit.
- **Nicht gespeichert**: Dateinamen, Notiz- und Projekttitel, Transkripte, Dokumentinhalte. Ein Dateiname
  wie „Angebot Mueller 2026.xlsx" ist bereits Inhalt.
- Retention 90 Tage plus Obergrenze, analog `utils/contextMemory.ts`.

**Schreibweise: `main/activityLedger.ts` als Modul mit serieller Warteschlange.** Genau ein Schreibvorgang
gleichzeitig, angehaengt und ueber temporaere Datei plus Umbenennen atomar abgelegt. Ereignisse kommen aus
mehreren Handlern gleichzeitig (`note-agent-accept-result` main/index.ts:4401, `tasks-create`
main/index.ts:2340, Sprachbefehle aus dem Renderer) — ohne Serialisierung verliert die Datei Eintraege.

Stufe 1 zeigt ausschliesslich Zaehler, keine Minuten. Referenzzeiten
(`uiStore.impact.referenceMinutes` je `ActivityType`, leer = keine Minutenanzeige) folgen in Stufe 2.

**Nachtrag 25.08.2026 — beides zusammen gebaut.** Die Minutenanzeige kam gleich mit, weil sie ohne
eigene Bedingung nicht sinnvoll ist: Sie erscheint erst, sobald der Nutzer eine Referenzzeit
eingetragen hat, und bleibt sonst unsichtbar. Damit ist Stufe 1 (Zaehler) der Zustand ohne Eintrag,
nicht ein eigener Bauschritt. Abweichungen vom Entwurf:

- **`actionId` im `voice-command`-Ereignis ist `string | null`.** Rueckfall und Rueckfrage haben noch
  keine Aktion; ein Pflichtfeld haette dort einen erfundenen Wert verlangt.
- **Der Renderer darf nur `voice-command`-Ereignisse anhaengen** (IPC `activity-append` weist alles
  andere ab). Lauf-Dauern, Uebernahmen und Aufgaben schreibt der Main dort, wo sie passieren — sonst
  koennte ein kompromittierter Renderer die Bilanz erfinden.
- **`recordToolUse` in `loop.ts` merkt nur ERFOLGREICHE Aufrufe.** Ein abgelehntes `write_xlsx` macht
  aus einem Rechercheauftrag keine Tabellen-Auswertung.
- **Gutgeschrieben wird nur ein Lauf mit uebernommenem Ergebnis**, und die Uebernahme darf am
  Folgetag liegen (Lauf 23:58, Uebernahme 00:03): Die Bilanz zaehlt die Uebernahme im Zeitraum und
  holt die Dauer aus dem gesamten Bestand. Regressionstest vorhanden.
- **Ohne Referenzzeit meldet die Karte „nicht bewertbar"**, nicht null Minuten. Ein Nullwert laese
  sich wie ein Ergebnis, obwohl gar nicht gerechnet wurde.
- **Die Rechengrundlage steht auf der Karte** („Referenzzeit 45 min abzueglich 14 min Laufzeit"),
  weil abgezogen wird nur die Maschinenzeit — Auftrag formulieren und Ergebnis pruefen stecken nicht
  darin. Ohne diesen Satz sieht eine Ableitung aus wie eine Messung.
- **Kein Dashboard-Widget.** Die Bilanz lebt in der Antwortkarte, wie in Abschnitt 6 vorgesehen. Die
  vorhandene Widget-ID `activity` meint das Kontextgedaechtnis und waere ein Namenskonflikt.

## 8. DashboardSnapshotProvider

Das Herausheben des Caches aus `DashboardView.tsx:120` ist noetig, aber ein 60-Sekunden-Modulcache genuegt
nicht: er liefert nach einer Notizaenderung veraltete Aufgaben und rechnet bei zwei gleichzeitigen
Anfragen zweimal.

```ts
// renderer/utils/dashboardSnapshotProvider.ts
export interface SnapshotKey {
  vaultPath: string
  notesRev: number      // monotoner Zaehler im notesStore
  emailsRev: number     // monotoner Zaehler im emailStore
  settingsRev: number   // ausgeschlossene Ordner, Vorlaufzeit, Kalenderfenster
}

export interface DashboardSnapshotProvider {
  /** Gecacht nach Schluessel; parallele Aufrufe teilen sich EIN laufendes Promise. */
  get(inputs: SnapshotInputs, key: SnapshotKey): Promise<DashboardSnapshot>
  invalidate(reason: string): void
}
```

Ein monoton steigender Zaehler je Store, der bei jeder Mutation hochzaehlt, ist billiger und verlaesslicher
als Inhalts-Hashing. `DashboardView` benutzt danach denselben Provider, damit es nicht zwei Caches gibt.

Grund der Dringlichkeit: `collectTasks` laedt ueber `readFilesBatch` den Inhalt aller Notizen mit Aufgaben
nach. Ohne Provider rechnet jeder Sprachbefehl den gesamten Aufgabenbestand neu.

## 9. Latenzbudget

Gemessen von „Taste losgelassen" bis „Karte sichtbar".

| Abschnitt | Ziel P50 | Anmerkung |
|---|---|---|
| Transkription | 1500 ms | dominanter Posten, muss gemessen werden |
| Erkennung | 5 ms | acht Regex-Saetze |
| Datenbeschaffung | 300 ms warm | Ausreisser ist `collectTasks` |
| Karte rendern | 50 ms | |
| **Gesamt gesprochen** | **2000 ms** | P95 unter 3500 ms |
| **Gesamt getippt** | **300 ms** | |

Dauert die Datenbeschaffung laenger als 1200 ms, erscheint die Karte sofort als Geruest mit Ladezustand.

**Nicht schaetzen, messen.** `sttMs`, `matchMs` und `dataMs` gehen inhaltsfrei in den Ledger. Die Messung
von `tiny` gegen `base` laeuft **warm und kalt auf der echten Zielhardware**, nicht auf dem
Entwicklungsrechner: der erste Befehl nach dem Start traegt die Modellladezeit, und genau der entscheidet,
ob sich die Funktion brauchbar anfuehlt. Ohne Kaltmessung optimiert man den Fall, der selten vorkommt.

## 10. Betroffene Dateien

Neu:

- `shared/voiceCommands/types.ts`, `intents.ts`, `match.ts`, `match.test.ts`
- `shared/activityLog.ts` + Test
- `renderer/voice/controller.ts`, `actions.ts`, `buildContext.ts`, `editorBridge.ts`
- `renderer/utils/dashboardSnapshotProvider.ts`
- `renderer/components/CommandPalette/AnswerCard.tsx`
- `main/activityLedger.ts`

Geaendert:

- `renderer/App.tsx` — Controller einhaengen, Mikrofonknopf; `commandActions` bleibt unberuehrt
- `renderer/components/CommandPalette/CommandPalette.tsx` — Zustandsdarstellung, `initialQuery`, Mikrofon
- `renderer/components/QuickSearch/QuickSearch.tsx` — neue Prop `initialQuery`
- `renderer/components/Editor/MarkdownEditor.tsx` — `EditorVoiceBridge` registrieren
- `renderer/components/DashboardPanel/DashboardView.tsx` — Modulcache durch den Provider ersetzen
- `renderer/utils/voice/tts.ts` — `forceLocal` in `TtsOptions`
- `renderer/stores/notesStore.ts`, `emailStore.ts` — Revisionszaehler
- `main/index.ts` — IPC `activity-append` / `activity-today`; Eintraege in `note-agent-accept-result`
  (4401) und `tasks-create` (2340)
- `main/noteAgent/runRegistry.ts` — `startedAt` / `finishedAt` und `activityType`
- `renderer/stores/uiStore.ts` — keine neuen Schalter (siehe Abweichung 9)
- `renderer/utils/translations.ts` — deutsch und englisch

`main/sync/fileTracker.ts` wird **nicht** angefasst (siehe Abschnitt 7).

## 11. Abgrenzung

- kein Sprachmodell nach der Transkription
- keine schreibende Aktion, folglich kein Bestaetigungsdialog
- keine freie Formulierung; acht Muster, alles andere faellt in den Rueckfall
- keine Minutenanzeige, nur Zaehler
- kein Dauerlauschen und kein Weckwort; Aufnahme nur waehrend die Taste gehalten wird
- Tastenkuerzel zunaechst nur app-intern, kein globales Kuerzel

## 12. Reihenfolge

1. **Vertikaler Prototyp**: `view.dashboard`, `search.notes`, `tasks.overdue` — je eine Absicht pro Art,
   ohne neue Persistenz. Enthaelt Controller, Erkenner, Rueckfall und Karte vollstaendig.
2. **Messen**: `tiny` gegen `base`, warm und kalt, auf der Zielhardware.
3. **Ergaenzen**: `DashboardSnapshotProvider`, dann `briefing.today`, `week.focus`, ActivityLedger,
   `activity.today`.
4. **Zuletzt** `project.open` und `note.current`, erst nach den Entscheidungen unten.

## 13. Offene Entscheidungen

1. **Was heisst „Projekt oeffnen"?** Der `projectStatusStore` kann Projekte laden, aber nicht oeffnen, und
   `project-status` ist eine `DashboardWidgetId`, kein Modul. Drei Lesarten: Projektordner im Dateibaum
   fokussieren, die `_STATUS.md` im Editor oeffnen, oder das Dashboard oeffnen und das Projekt hervorheben.
   Solange das offen ist, ist `project.open` nicht baubar.
2. **Soll `note.current` vorlesen oder nur oeffnen?** Vorlesen erfordert Editorbruecke und lokale TTS.
3. Whisper-Modell fuer Befehle — Ergebnis von Schritt 2, nicht vorab entschieden.
4. Tastenkuerzel fuers Halten. Vorschlag `Cmd+Shift+Space`; `Cmd+D` ist in der Schnellerfassung belegt.

Entschieden: Die Karte bleibt in der Palette.


## 14. Stand der Umsetzung

Sechs Absichten sind gebaut und laufen (Tastatur und Mikrofon beide einmal durchlaufen):

| Absicht | Art | Was sie tut |
|---|---|---|
| `briefing.today` | answer | Aufgaben, heutige Termine, Mails die auf Antwort warten — drei Abschnitte auf einer Karte |
| `tasks.today` | answer | Überfällige und heute fällige Aufgaben; schaltet zusätzlich ins Aufgaben-Panel |
| `tasks.overdue` | answer | Nur Überfälliges; schaltet ebenfalls ins Aufgaben-Panel |
| `search.notes` | navigate | Schnellsuche mit vorbelegtem Begriff |
| `view.dashboard` | navigate | Dashboard-Tab |
| `note.create` | navigate | Dialog für eine neue Notiz — derselbe Weg wie Plus und Cmd+N |

Dazu der Effizienzindex (Abschnitt 7), gebaut am 25.08.2026:

| Absicht | Art | Was sie tut |
|---|---|---|
| `activity.today` | answer | Tagesbilanz: übernommene Ergebnisse, angelegte Aufgaben, Läufe nach Tätigkeitsart — und die geschätzte Zeitersparnis, sobald Referenzzeiten hinterlegt sind |

Nicht gebaut: `project.open` (Semantik offen, Abschnitt 13), `note.current`, Cloud-TTS,
Tastenkürzel fürs Halten.

### Abnahme

`npm run typecheck` sauber, `npm run test` 1346 Tests in 105 Dateien grün, `npm run build` sauber.
Manuelle Durchläufe per Tastatur und per Mikrofon erfolgreich.

### Einstiege

Mikrofonknopf rechts oben in der Titelleiste (ein Klick öffnet die Palette UND startet die
Aufnahme), zusätzlich im ••• -Menü unter „Alle Befehle", zusätzlich in der Palette selbst.
Getippt: Enter in der Palette ohne Treffer — genau dort tat sie vorher nichts.
Sichtbar, sobald `speech.enabled` gesetzt ist; ein eigener Opt-in-Schalter wurde bewusst wieder
entfernt (siehe unten).

### Dateien

Neu: `shared/voiceCommands/{types,intents,match,fallback}.ts` + `match.test.ts`, `fallback.test.ts`;
`shared/commandCatalog.ts` + `commandCatalog.test.ts`; `renderer/voice/{uiBridge,actions}.ts`;
`renderer/stores/voiceCommandStore.ts`; `renderer/utils/dashboardSnapshotProvider.ts`;
`renderer/components/CommandPalette/VoiceCommandPanel.{tsx,css}`.

Geändert: `App.tsx`, `CommandPalette.tsx`, `QuickSearch.tsx`, `Sidebar.tsx`, `Settings.tsx`,
`uiStore.ts`, `translations.ts`, `utils/voice/tts.ts`, `styles/index.css`, `main/index.ts`.
`main/sync/fileTracker.ts` bleibt unberührt.

### Abweichungen vom Entwurf

1. **Controller als Zustand-Store** (`renderer/stores/voiceCommandStore.ts`), nicht als eigenes
   Modul in `renderer/voice/` — die App hält ihre Zustandsmaschinen in Stores.
2. **Kein `VoiceContext`-Objekt.** Aktionen lesen über `getState()` und die UI-Brücke. Erst nötig,
   wenn `note.current` (Editorpuffer) und `project.open` dazukommen.
3. **`VoiceCommandPanel.tsx`** statt `AnswerCard.tsx`: die Komponente rendert alle Zustände.
4. **Namensraum `voiceCommand.*`** — `voice.*` gehört Diktat und Vorlesen, `voice.transcribing`
   kollidierte real.
5. **`shared/commandCatalog.ts` kam dazu.** Der Bestand steckte inline in `App.tsx` und war von
   außen nicht lesbar. Jetzt Daten; `App.tsx` hält nur `Record<CommandId, () => void>`, sodass ein
   fehlender Rückruf den Typecheck bricht. **`keywords` ist zugleich die Wortschatz-Schicht** —
   siehe Funde.
6. **Revisionszähler noch nicht in den Stores.** `computeNotesRevision()` leitet sie vorläufig ab.
7. **Navigierende Aktionen schließen die Palette**, antwortende bleiben offen.
8. **Kein eigener Opt-in-Schalter.** Zuerst als `speech.commandsEnabled` gebaut, dann entfernt: ein
   zweiter Schalter für einen Knopf, der bis zum Klick nichts tut, versteckt die Funktion mehr als
   er schützt.
9. **`preparing`-Zustand** ergänzt (nicht im Entwurf): zwischen Klick und erteilter Freigabe wird
   noch nichts aufgenommen.
10. **Karten-Zeilen können Gruppen tragen** (`AnswerLine.group`) — nötig für das Briefing.
11. **`AnswerCard.footnote`** ergänzt: gekappte Listen sagen „5 von 8 angezeigt".

### Beim Bauen gefunden

- **Rangfolge im Rückfall nach Trefferzahl war falsch.** „terminal öffnen" verlor gegen jede Aktion
  mit „öffnen" im Label. Jetzt Gewichtung nach Seltenheit — und zusätzlich: wer nur auf Wörter
  passt, die mehr als ein Siebtel des Bestands treffen, wird gar nicht vorgeschlagen.
- **Der Wortschatz war zu eng an der internen Benennung.** „Wie kann ich das Design auf schwarz
  umstellen?" fand nichts, weil die Aktion „Theme umschalten (hell/dunkel)" heißt und nur
  `theme dark light hell dunkel` als Suchwörter trug. Acht Einträge wurden um die Wörter ergänzt,
  die Menschen benutzen. Das wirkt auch auf die getippte Palettensuche.
- **Zwei Tests waren grün aus dem falschen Grund** (Fließkomma entschied statt der Schwelle).
- **Abbruch stoppte fremde Sprachausgabe:** das Schließen der Palette rief `stopSpeaking()`
  bedingungslos und hätte das Vorlesen einer Karteikarte abgewürgt.
- **Füllwort-Streichung zerlegte reflexive Verben.** „mich" galt als Füllwort, damit wurde aus
  „worauf soll ich mich konzentrieren" ein Satz, den das eigene Muster nicht mehr traf.
- **Die Mikrofonfreigabe wurde nie angefordert — App-Fehler, nicht Feature-Fehler.**
  `setPermissionCheckHandler` in `main/index.ts` meldete Chromium bedingungslos „Audio erlaubt".
  Chromium ruft immer zuerst den Prüf-Handler und überspringt bei „erlaubt" den Anfrage-Handler —
  `systemPreferences.askForMediaAccess()` lief deshalb nie. Auf einem frischen Rechner heißt das:
  nie ein Systemdialog. **Betrifft das ausgelieferte Diktat genauso und gehört ins nächste
  Release.** Drei `[media]`-Diagnosezeilen protokollieren jetzt den echten Systemstatus.
- **Die Oberfläche behauptete zuzuhören, bevor das Mikrofon offen war** (Zustand vor dem `await`).

### Zur Mikrofon-Stille vom 25.08.

Ursache war das eingebaute MacBook-Mikrofon, das durchgehend Pegel 0.000 lieferte; mit dem
Mikrofon des Studio Display funktioniert es. Die zwischenzeitliche Vermutung, die ad-hoc-Signatur
des Entwicklungs-Electron sei schuld, war falsch — sie ist hier festgehalten, damit sie nicht
erneut verfolgt wird. Merkregel für den nächsten Fall: `[media] Systemstatus` und `peak RMS`
zusammen lesen, dann ist in einer Minute klar, ob Freigabe oder Gerät.

### Dauerhafte Anzeige: Statusleiste (25.08.2026)

Die Tagesbilanz steht zusätzlich unten in der Statusleiste, hinter den Aufgaben:
`heute 47 min gespart`. Mouseover zeigt die Aufschlüsselung samt Rechengrundlage, ein Klick öffnet
dieselbe Karte wie die gesprochene Frage (`runDirect('activity.today')`) — eine zweite Darstellung
derselben Zahlen wäre eine zweite Wahrheit.

- **Kein Abfragetakt.** `main/activityLedger.ts` meldet über `onActivityChanged` jede geschriebene
  Änderung, `main/index.ts` schickt sie als `activity-changed` an alle Fenster. Ein Protokolleintrag
  passiert ein paar Mal am Tag, nicht ein paar Mal pro Minute — Polling wäre hier reine Last.
  Zusätzlich: Neuladen bei Fensterfokus und ein Timer auf die nächste lokale Mitternacht, sonst
  zeigt „heute" nach dem Tageswechsel bis zum nächsten Ereignis den Vortag.
- **Rangfolge der Anzeige** in `impactBadge()` (rein, getestet): Minuten → Übernahmen → Aufgaben →
  nichts. **An einem Tag ohne Ergebnis bleibt die Stelle leer**, statt eine Null zu zeigen; eine Null
  wäre eine Aussage über einen Tag, an dem noch gar nichts passiert ist. Fällt die Ersparnis auf 0
  (Lauf dauerte länger als die Referenzzeit), zeigt die Leiste die Übernahmen statt „0 min gespart".
- **Abschaltbar** über `impact.showInStatusBar` (Standard an, Einstellungen → **Allgemein** →
  Zeitersparnis). Eine dauerhaft sichtbare Zahl über die eigene Arbeit will nicht jeder vor sich haben.
- **Textbausteine liegen in `renderer/utils/impactText.ts`**, weil Karte und Tooltip dieselben Zeilen
  zeigen. Beim ersten Anlauf standen sie doppelt im Code — und die Singularform war prompt nur an
  einer der beiden Stellen richtig.
- **`VoiceCommandPanel` zeigt „Verstanden als" nur mit Transkript.** Die Karte kann jetzt ohne Frage
  entstehen (Klick in der Leiste); ein leeres Eingabefeld über der Antwort sah aus wie ein Fehler.

### Gegenprobe am 25.08.2026 (isolierte Instanz, eigener Test-Vault)

Eigener Electron-Start mit `MINDGRAPH_USER_DATA_DIR` und Fernsteuerung über das
Chrome-DevTools-Protokoll, damit die laufende Dev-Instanz und der echte Vault unberührt bleiben.
Durchgespielt: zwei Aufgaben anlegen, ein echter Agent-Lauf (`qwen3.5:4b`, 14,9 s) mit Übernahme,
ein zweiter Lauf (11,3 s) mit Verwerfen, danach die Frage in der Palette.

Bestätigt: Zähler stimmen, `activityType` wird korrekt aus `write_note` als `summary` abgeleitet,
der VERWORFENE Lauf erscheint in `runsFinished`, aber NICHT in `acceptedRuns` — also keine
Zeitgutschrift. Das Protokoll überlebt einen App-Neustart und enthält keinen Dateinamen, keinen
Titel und kein Transkript. Gemessene Latenz der Absichtserkennung 3–7 ms, Datenbeschaffung 1–5 ms.

Zwei Mängel fielen erst dabei auf und sind behoben:

- **„1 Ergebnisse übernommen".** Singular/Plural getrennt, wie bei `speech.overdueOne/Many`.
- **„abzüglich 0 min Laufzeit".** Ein 15-Sekunden-Lauf rundet auf 0 Minuten und die Karte sah aus
  wie ein Rechenfehler. `SavedTimeLine` trägt jetzt zusätzlich die Rohdauer, die Karte schreibt
  „unter 1 min".

Nebenbefund, NICHT vom Effizienzindex verursacht: Ein kurzes getipptes Stichwort erreicht den
Erkenner gar nicht, weil `fuzzyMatch` in `CommandPalette.tsx` es als Untersequenz auf einen
Palettenbefehl legt („tagesbilanz" öffnete das Dashboard). Enter geht nur dann in die Sprachschicht,
wenn KEIN Befehl passt. Ganze Sätze sind davon nicht betroffen, gesprochene Eingaben nie — sie
laufen am Trefferlisten-Weg vorbei.

### Nachgebessert nach Codex-Durchsicht (25.08.2026)

Vier Lücken, alle bestätigt und behoben — es waren echte Lücken, keine Fehleinschätzungen.

1. **Zeitgutschrift konnte sich über Tagesgrenzen verdoppeln.** Ein Lauf darf zwei Ergebnisse
   liefern (Tabelle plus begleitende Notiz). Wurden die an zwei Tagen übernommen, bekam JEDER
   dieser Tage die volle Referenzzeit für dieselbe Arbeit. `summarizeActivity` sucht die erste
   Übernahme je `runId` jetzt über den GESAMTEN Bestand und schreibt nur an diesem Tag gut; jede
   weitere Übernahme zählt als Ergebnis, nicht als Arbeit. Für eine Zahl, die jemand einem
   Controlling zeigt, war das die wichtigste der vier.
2. **Der Abbruch deckte nur den Start der Aufnahme ab.** Wer die Palette schloss, während Whisper
   noch transkribierte oder während die Aktion ihre Daten holte, bekam die Karte trotzdem — und
   hörte die Antwort vorgelesen. Die Generation wird jetzt nach JEDEM längeren `await` geprüft:
   nach `handle.stop()` und nach dem Aktionslauf. Zwei Regressionstests, gegen den defekten Stand
   gegengeprüft (beide rot).
3. **Der Cache-Schlüssel bildete die Einstellungen nicht ab.** `settingsRev` zählte nur die Ordner.
   Ein Austausch bei gleicher Anzahl blieb unbemerkt, die Vorlaufzeit ging gar nicht ein — bis zu
   60 Sekunden alte Aufgaben nach einer Änderung. Ersetzt durch `computeSettingsRevision()`, einen
   Hash über Ordnerlisten und Vorlaufzeiten. Bewusst ein Hash statt Zählern im Store: Er kann
   nicht vergessen werden, wenn eine neue Einstellung dazukommt.
4. **Der Mitternachts-Timer lief nur einmal.** Die Statusleiste plante beim Einhängen genau einen
   Timeout; bei tagelang geöffneter App stand nach der zweiten Mitternacht der Vortag da. Der
   Timer plant sich jetzt selbst neu.

Offen bleibt aus derselben Durchsicht die gemeinsame Cache-Infrastruktur: `DashboardView` benutzt
weiterhin seinen eigenen Modulcache, und echte Revisionszähler in den Stores gibt es nicht
(Schritt 2 unten). Der Hash aus Punkt 3 nimmt dem den Zeitdruck, ersetzt ihn aber nicht.

### Wirkungsbilanz: aktive Zeit statt Laufzeit (25.08.2026)

Rückmeldung aus dem Umfeld Controlling/Einkauf, und sie trifft einen methodischen Fehler: Die
Bilanz zog die **Laufzeit des Agenten** von der Referenzzeit ab und vermischte damit zwei Größen.

- **Durchlaufzeit**: wie lange es dauert, bis das Ergebnis da ist.
- **Aktive Arbeitszeit**: wie lange ein Mensch dafür am Rechner saß.

Rechnet der Agent 14 Minuten, während der Nutzer etwas anderes erledigt, sind das keine 14 Minuten
Arbeitszeit. Die alte Formel war deshalb nicht nur falsch, sondern auch ungünstig: Sie bestrafte
langsame Modelle, obwohl in dieser Zeit niemand am Schreibtisch saß.

**Jetzt gemessen** (`shared/activeTime.ts`, rein und getestet; Anbindung in
`renderer/utils/activeTimeTracker.ts`):

- `instructionMs` — Zeit am Auftrag, ab dem ersten Tastendruck bis zum Abschicken. Beide Eingänge
  (Agent-Tab und Macher-Leiste) messen dasselbe.
- `reviewMs` — Zeit von der Ergebniskarte bis zur Entscheidung, je Lauf summiert.
- **Nur bei Fenster im Vordergrund**, Deckel 30 Minuten je Abschnitt. Ohne diese Regel landet eine
  Mittagspause in der Prüfzeit („Karte um 11:50, Klick um 13:10") — und an genau so einer Zahl
  zerbricht das Vertrauen in die ganze Bilanz.
- Abgezogen wird `instructionMs + reviewMs`. Die Laufzeit steht als **Durchlaufzeit** daneben,
  zusammen mit „Ergebnis nach" — sichtbar, aber nie im Abzug.
- **Läufe ohne Messung werden nicht bewertet**, sondern gezählt und gemeldet. Eine 0 anzunehmen
  hieße, die volle Referenzzeit als Ersparnis auszuweisen — die unehrlichste aller Möglichkeiten.
  Betrifft alle Läufe vor dieser Änderung.
- **Stichprobengröße auf der Karte**: „Grundlage: deine Referenzzeit, N vergleichbare Vorgänge".
  Eine Zahl aus einem Lauf ist etwas anderes als eine aus zwanzig.

**Benennung**: „Zeitgewinn (geschätzt)" statt „Zeitersparnis". Kein „Index" — das Wort klingt nach
standardisierter Kennzahl, und die erste Rückfrage aus dem Controlling wäre die nach der Formel.

**Offen, bewusst nicht gebaut**: der Vergleichsmodus (dieselbe Aufgabe mehrfach konventionell und
mehrfach mit MindGraph, Median und Übernahmequote). Das ist das Einzige, was gegenüber einem
Einkauf wirklich trägt — und ein eigenes Feature mit eigenem Entwurf. Wichtige Grenze dabei: Die
Zeiten der bisherigen Programme kann MindGraph nicht messen; sie sind Nutzerangabe und müssen als
solche gekennzeichnet bleiben.

### Wartezeit, Modell und Mail-Extraktion (25.08.2026)

Anschlussfrage aus derselben Runde: Der Zeitgewinn unterschied sich nicht zwischen einem großen
lokalen Modell und einem schnellen Cloud-Modell — obwohl das im Alltag der spürbarste Unterschied
ist. Drei Lücken, alle geschlossen:

1. **Wartezeit am Bildschirm zählt jetzt zur aktiven Zeit.** Vorher galt Warten als kostenlos; damit
   war der Zeitgewinn modellunabhängig und die Modellwahl tauchte in der Zahl nie auf. Gemessen wird
   nur, solange das Fenster vorn ist: **Wer wegklickt, zahlt nichts; wer wartet, sieht es.** Die
   Wartezeit gehört dem LAUF und wird nur beim ersten Übernehmen mitgeschickt — sonst zählte ein Lauf
   mit zwei Ergebnissen sie doppelt.
2. **Das Modell steht im Protokoll** (`agent-run-finished.model`, lokaler Tag oder
   `<provider>/<modell>`) und auf der Karte hinter der Durchlaufzeit. Ohne das ließen sich Läufe
   nicht vergleichen.
3. **Aufgabenextraktion aus Mails ist eine eigene Tätigkeitsart** (`email-tasks`). Sie lief bisher
   komplett an der Bilanz vorbei: anderer Weg (`email-analyze` + `emailCreateNote`), kein
   Protokolleintrag. Jetzt zählt ein Durchgang, der Aufgaben gefunden hat, als Vorgang — mit Modell,
   Laufzeit, Mail- und Aufgabenzahl. Ein Durchgang ohne Fund wird NICHT bewertet: Er kostet Zeit,
   ersetzt aber keine Handarbeit.

Ehrliche Grenze, die in den Einstellungen steht: Bei „Aufgaben aus Mails" deckt die Referenzzeit
EINEN Durchgang ab (Mails durchsehen, Aufgaben herausschreiben). Was danach mit den erkannten
Aufgaben geschieht, misst die App nicht.

**Ausnahme bei `activity-append`**: Der Renderer darf neben Sprachbefehlen auch
`email-tasks-extracted` anhängen. Zahlen und Dauer stammen aus dem Ergebnis des Main-Prozesses, aber
nur der Renderer kennt den Fensterfokus. Lauf-Dauern, Übernahmen und Aufgaben bleiben unverändert
Main-geschrieben.

**Am lebenden Objekt gemessen** (zwei Läufe, gleiches Modell, unterschiedliches Verhalten):

| | Laufzeit | Wartezeit | gezählt |
|---|---|---|---|
| am Bildschirm gewartet | 9,9 s | **9,9 s** | voll |
| weggeklickt | 21,5 s | **0 s** | nichts |

Dabei fiel ein Anzeigefehler auf: Bei zwei Vorgängen derselben Art stand „30 min − 1 min = 59 min",
weil die Referenzzeit je Vorgang gilt, aktive Zeit und Gewinn aber Summen sind. Die Zeile nennt den
Faktor jetzt: „2 × 30 min von Hand − 1 min aktiv = 59 min".

### Zweite Durchsicht: vier Verzerrungen behoben (25.08.2026)

1. **Mehrergebnis-Fehler.** Warte- und Prüfzeit hängen an der ERSTEN Entscheidung. Wurde zuerst
   verworfen und danach übernommen, lagen sie am verworfenen Ereignis — die Bilanz las aber nur
   Übernahmen. Der übernommene Lauf stand dadurch ohne seine Prüfzeit da, also zu günstig.
   `summarizeActivity` sammelt die Zeiten jetzt über **beide** Entscheidungsarten; wer ein Ergebnis
   prüft und verwirft, hat trotzdem gearbeitet.
2. **Kappung auf null entfernt.** Ein Vorgang, der länger dauert als von Hand, ist ein Verlust und
   steht jetzt als Minus da („heute 5 min Mehraufwand"). Eine Kennzahl, die nur gewinnen kann, ist
   als Nachweis wertlos.
3. **Modellvergleich statt Sammelzeile.** `SavedTime.byModel` gruppiert nach Tätigkeitsart UND
   Modell, mit Anzahl, **Median** und Mittelwert. Median, weil bei fünf Vorgängen ein Ausreißer den
   Schnitt regiert. Die Karte zeigt den Block „Nach Modell", sobald für eine Art mehr als ein Modell
   vorliegt.
4. **Mail-Protokollierung gehärtet.** Der Main schreibt sein `email-tasks-extracted` jetzt selbst
   (Aufgabenzahl, Dauer, Modell) und gibt dem Renderer nur eine **opake Kennung** zurück. Über den
   neuen, engen Kanal `activity-foreground` kann der Renderer ausschließlich die Vordergrundzeit
   nachtragen — und nur, solange sie fehlt. `activity-append` nimmt wieder ausschließlich
   Sprachbefehle. Dazu vollständige Validierung der Mail-Zeile: fehlt `emails`, wird die Zeile
   abgewiesen, statt beim Summieren NaN zu erzeugen.

**Benennung korrigiert**: Es heißt **Vordergrundzeit während des Laufs**, nicht „Wartezeit". Die App
kann nicht wissen, ob jemand wartet oder im selben Fenster eine andere Notiz bearbeitet — der
Einstellungstext sagt das jetzt ausdrücklich.

Bleibt offen: der echte Vergleichsmodus (dieselbe Aufgabe mehrfach konventionell und mehrfach mit
MindGraph, Median und Übernahmequote). Erst der macht aus der persönlichen Bilanz einen Nachweis.

### Nächste Schritte

1. `tiny` gegen `base` messen, warm und kalt, auf der Zielhardware.
2. `DashboardSnapshotProvider` und den Modulcache in `DashboardView.tsx` zusammenführen.
3. `project.open` und `note.current` erst nach den Entscheidungen in Abschnitt 13.
4. Entscheiden, ob die `[media]`-Diagnosezeilen dauerhaft bleiben.
5. Entscheiden, ob kurze getippte Stichwörter am Fuzzy-Treffer der Palette vorbei in den Erkenner
   sollen (Nebenbefund der Gegenprobe).
