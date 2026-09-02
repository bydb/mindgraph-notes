# Messgeschichte — Bauvertrag

Stand: 02.09.2026, erste Fassung; Schritte 1–8 gebaut und in der Dev-App geprüft (siehe § 13). Was hier steht, ist die Zusage, gegen die
gebaut wird — vor allem die Regeln in der Datenschicht, die sich später nicht mehr nachrüsten
lassen, weil Geschichte nicht rückwirkend erfasst werden kann.

## Wozu

Die App misst heute viel und zeigt fast nichts davon über den Tag hinaus. Die Token/s-Anzeige
(`docs/voice-command-plan.md`, Nachtrag Telemetrie) hält die letzten 300 Aufrufe im Arbeitsspeicher
und vergisst sie beim Neustart. Die Zeitbilanz hält 90 Tage, wird aber nur für „heute" ausgewertet.
Die Kosten eines Agentenlaufs werden berechnet und danach verworfen.

Die Messgeschichte soll vier Fragen über einen frei wählbaren Zeitraum beantworten:

1. **Einsatz** — welches Modell lief wie oft, für welches Modul, lokal oder in der Cloud?
2. **Kosten** — was hat die Cloud gekostet, und wie viel Rechenzeit haben lokale Modelle gebraucht?
3. **Zeitgewinn** — wie viel aktive Arbeitszeit hat welches Modell bei welchem Aufgabentyp gespart?
4. **Leistung** — wie schnell war welches Modell, und wann hat sich das geändert?

Der Satz, den die Ansicht tragen soll:

> Im August liefen 412 Modellaufrufe, davon 361 lokal. Die Cloud kostete mindestens 0,84 $
> (12 Aufrufe ohne Preis). Bei Tabellenzusammenführungen lag der Median der aktiven Zeit mit
> qwen3.8:27b bei 4 Minuten (N = 7), mit gpt-oss-120b bei 3 Minuten (N = 5); 3 Läufe ohne Messung.

Nicht „das Modell hat 38 Minuten gespart": Die Minuten entstehen erst durch die eingetragene
Referenzzeit, und die steht daneben.

## Befund: drei Inseln

| Datenpfad | Inhalt | Ablage | Verbleib |
|---|---|---|---|
| `LlmRunMetrics` (`shared/llmTelemetry.ts`) | Modell, Modul, Backend, Token, Zeiten, Kaltstart, Kosten **je Aufruf** | Ringpuffer im RAM, Main und Renderer getrennt (`main/llm/telemetry.ts`, `llmTelemetryStore`) | 300 Aufrufe, weg beim Neustart |
| `ActivityEvent` (`shared/activityLog.ts`) | Agentenläufe, Mail-Extraktionen, Übernahmen, aktive Zeit, Modellname | `userData/activity/<hash(vaultPath)>.json` (`main/activityLedger.ts`) | 90 Tage, höchstens 5000 Ereignisse |
| `RunCost` (`shared/llmCost.ts`) | Summe der Kosten und Token eines Agentenlaufs | Rückgabewert von `noteAgent/loop.ts`, **kein Abnehmer** | verworfen |

Dazu drei Lücken, die jede Statistik heute schief machen:

- **15 Aufrufstellen melden keine Telemetrie**: Plugin-Host `llm.generate`, Workflow-Runner,
  `ollama-generate` (der generische Renderer-Pfad für Übersetzen, Zusammenfassen, KI-Leiste),
  Aufgaben-Tagging, Reranker, Bildgenerierung, RAG-Antwort, Vision-OCR, zwei Quiz-Pfade,
  Zettel-Vorschlag, Synonym-Generator, Crystallizer, Embeddings, **Cloud-Streaming**
  (`streamCloudChat`). Instrumentiert sind 8 Stellen.
- **Fast alles heißt „chat"**: Nur drei Aufrufer setzen `telemetryModule`. Auch die
  Cloud-Mailanalyse landet als „chat", die lokale als „mail-summary".
- `LlmRunMetrics` kennt keine Lauf-Kennung. Aufrufe und Läufe lassen sich nicht verbinden.

## 1. Bezugspunkt ist der Lauf

Ein **Lauf** ist die Einheit, für die ein Mensch eine Entscheidung trifft: ein Agentenauftrag,
eine Mail-Extraktion, später eine Anweisung an die KI-Leiste. Ein Lauf besteht aus einem oder
vielen **Modellaufrufen**.

- Zeitgewinn gibt es nur je Lauf (dort entsteht aktive Zeit und eine Übernahme).
- Kosten, Token und Rechenzeit entstehen je Aufruf und werden zum Lauf **summiert**.
- Einsatz und Leistung werden je Aufruf gezählt.

Daraus folgt die eine Regel, die alles verbindet: **Jeder Modellaufruf trägt die Kennung seines
Laufs**, wenn er zu einem gehört. `LlmRunMetrics` bekommt `runId?: string`; der Agenten-Loop und
die Mail-Extraktion reichen sie über die bestehende Option neben `telemetryModule` durch. Aufrufe
ohne Lauf (Chat, Zusammenfassung) bleiben ohne `runId` und zählen nur für Einsatz und Leistung.

Der Agenten-Loop schickt bei jeder Iteration die ganze Konversation neu. Die Kosten eines Laufs
sind deshalb die **Summe aller Iterationen**, nie der letzte Aufruf (siehe
`docs/comparison-mode-plan.md` und die Kostenerfassung in `shared/llmCost.ts`). Die Summe
existiert bereits als `RunCost`; sie muss nur ankommen.

## 2. Telemetrie-Logbuch auf Platte

Der Kommentar in `main/llm/telemetry.ts` („BEWUSST nichts auf die Platte") war die Entscheidung
für den kleinen ersten Schritt und die Abgrenzung gegen Sync und Backup. Beides bleibt gewahrt:

- **Ort**: `userData/telemetry/<hash(vaultPath)>.jsonl`, neben dem Aktivitäts-Logbuch. Nicht im
  Vault, nicht unter `.mindgraph/` — aus denselben Gründen wie dort (iCloud/Dropbox würden die
  Zähler über Geräte verdoppeln; der Vault-Sync ist nicht der einzige Sync).
- **Format: JSONL, eine Zeile je Aufruf** — anders als das Aktivitäts-Logbuch (JSON-Array).
  Dort kommen wenige Ereignisse am Tag, hier hundert und mehr Aufrufe; ein Array müsste bei
  jedem Aufruf komplett gelesen und neu geschrieben werden, bei 50 000 Einträgen über zehn
  Megabyte je Modellantwort. Eine Zeile anhängen kostet nichts. Der Zeilenumbruch steht **vor**
  dem Eintrag: Bricht ein Schreibvorgang mitten in der Zeile ab, klebt der nächste Eintrag sonst
  an den Torso und geht mit verloren (im Test gefunden).
- **Schreiber**: serialisierte Warteschlange je Datei wie `activityLedger.ts`. Anhängen per
  `appendFile`; **Verdichten** (lesen, ungültige Zeilen verwerfen, Verbleib anwenden, atomar per
  `.tmp` + rename zurückschreiben) beim ersten Anhängen nach dem Prozessstart und danach alle 500
  Einträge. Der Renderer schreibt nichts.
- **Vault-Zuordnung**: Die Aufrufstellen (chatClient, Brain, Mail-Analyse) kennen den Vault
  nicht. Die Sammelstelle bekommt ihn gesetzt, wo der Main-Prozess ihn erfährt (`get-last-vault`,
  `set-last-vault`). Ohne bekannten Vault bleibt der Aufruf im Ringpuffer, einmal gemeldet.
- **Inhalt**: exakt `LlmRunMetrics` plus `runId?`. Kein Prompt, keine Antwort, kein Dateiname,
  kein Notiztitel. Das gilt heute schon und bleibt.
- **Rohdaten, keine Tagessummen.** Median und Kaltstart-Ausschluss lassen sich aus Summen nicht
  rechnen. Ein Datensatz hat rund 250 Byte; 100 Aufrufe am Tag ergeben unter 10 MB im Jahr.
- **Verbleib**: 365 Tage, dann Löschung beim nächsten Anhängen. Zusätzlich eine Obergrenze
  (Vorschlag 50 000 Ereignisse, die neuesten bleiben). Beides als Konstanten in `shared/`.
- **Beim Lesen wird je Eintrag validiert.** Ein kaputter Eintrag verliert sich selbst, nicht die
  Datei (wie `isActivityEvent`).
- Der RAM-Ringpuffer bleibt für die Live-Anzeige (Statusleiste, Badge). Er ist Cache, nicht
  Wahrheit. Beim Start wird er nicht aus der Datei befüllt; die Ansicht fragt den Zeitraum per
  IPC ab.

**Nicht verhandelbar:** Der Renderer darf über IPC nur lesen (`llm-telemetry-range`). Ein
`telemetry-append` aus dem Renderer gibt es nicht — sonst könnte ein kompromittierter Renderer
Geschichte erfinden.

## 3. Lauf-Kosten ins Aktivitäts-Logbuch

`agent-run-finished` und `email-tasks-extracted` bekommen ein optionales Feld `llm` mit der
Summe aller Aufrufe des Laufs (`RunCallTotals`, `shared/llmTelemetry.ts`):

```
calls: number               // alle Modellaufrufe des Laufs
callsWithoutTokens: number  // Server hat keine Token gemeldet → Token-Summen sind Untergrenzen
promptTokens?: number
completionTokens?: number
computeMs?: number          // Summe aus promptEvalMs + evalMs, nur lokale Backends
cloudCalls: number
costReportedUsd?: number    // nur wenn cloudCalls > 0
costComputedUsd?: number    // nur wenn cloudCalls > 0
unpricedCalls?: number      // nur wenn cloudCalls > 0
```

**Quelle ist die Telemetrie, nicht `RunCost`.** Seit Schritt 1 trägt jeder Aufruf die runId; der
Main-Prozess sammelt die Aufrufe je Lauf in einem Korb (`collectRunTotals` in
`main/llm/telemetry.ts`) und summiert sie am Lauf-Ende mit `summarizeRunCalls`. Das hat gegenüber
`RunCost` zwei Vorteile: dieselbe Rechnung für Agent und Mail-Durchlauf, und die lokale
Rechenzeit ist dabei (`RunCost` kennt nur Token). `AgentLoopResult.cost` bleibt vorerst stehen —
Entfernen ist eine eigene Entscheidung, nicht Beiwerk dieses Schritts.

**Die Wettlauf-Falle:** Cloud-Aufrufe werden erst NACH einer Preisabfrage festgehalten
(`recordCloudCall` ist asynchron). Ohne Gegenmaßnahme fehlte der letzte, oft teuerste Aufruf in
der Bilanz — still. Deshalb meldet der chatClient laufende Erfassungen an
(`trackPendingTelemetry`), und `collectRunTotals` wartet sie ab, bevor es summiert. Regressionstest
in `telemetry.test.ts`.

- **Getrennte Töpfe bleiben getrennt.** „gemeldet" (OpenRouter `usage.cost`) und „gerechnet"
  (Token × Katalogpreis) werden nie addiert, wie in `RunCost`.
- **`unpricedCalls` steht immer dabei.** Eine Summe mit Lücken ist eine Untergrenze und wird als
  „≥" angezeigt, nie als Betrag.
- **Lokale Aufrufe bekommen keinen Dollarwert.** Sie bekommen `computeMs`: gemessene Auswertezeit
  auf dem eigenen Rechner. Strom wird nicht geschätzt — Messen, nicht schätzen. Wer später einen
  Strompreis hinterlegen will, kann das aus `computeMs` rechnen; die App tut es nicht.
- Läufe vor dieser Änderung haben die Felder nicht. Sie werden gezählt und als „ohne
  Kostenmessung" ausgewiesen, nicht als kostenlos.

Dies ist der kleinste Eingriff im Plan: `RunCost` wird an der Stelle, wo heute
`agent-run-finished` geschrieben wird, mitgegeben statt verworfen.

## 4. Modulkatalog und Vollständigkeit

**Ohne Vollständigkeit lohnt kein Diagramm.** Ein Balken „qwen3.8 lief 40-mal" ist falsch, wenn
15 Stellen nicht mitzählen.

- Ein **fester Katalog** von Modulnamen in `shared/llmTelemetry.ts` (`LLM_MODULES`, Union-Typ
  `LlmModuleId`, kein Freitext): `chat`, `ai-bar`, `translate`, `summarize`, `note-agent`,
  `telegram`, `mail-summary`, `task-extraction`, `brain`, `smart-connections`, `embedding`, `quiz`,
  `workflow`, `plugin`, `crystallizer`, `synonyms`, `zettel`, `project-rag`, `vision-ocr`, `image`,
  `connection-test`. Der Reranker läuft als `smart-connections` (der Name der Matrix, nicht ein
  eigenes `rerank`); `dashboard-snapshot` fehlt bewusst, weil es keinen Aufrufer mehr gibt.
- **Instrumentiert wird an der Grenze, nicht am Aufrufer.** Die generischen Pfade decken den
  Großteil ab: `ollama-generate` (Renderer gibt `module` mit, Main prüft gegen den Katalog),
  `streamCloudChat`, Workflow-Runner, Plugin-Host. Danach die Einzelstellen.
- `telemetryModule ?? 'chat'` wird zu einem Pflichtparameter: `chat()` und `chatWithTools()`
  nehmen `ChatCallOptions = ChatOptions & { telemetryModule }`. In `ChatOptions` selbst bleibt das
  Feld optional, weil die Optionen oft ohne Aufrufkontext gebaut werden
  (`resolveCloudChatOptions`); am Aufruf ist es Pflicht. Ein Aufruf ohne Modul ist ein Typfehler,
  kein stilles „chat".
- Die Cloud-Mailanalyse wird auf `mail-summary` korrigiert.
- Embeddings liefern von Ollama keine Zeiten. Sie werden gezählt (Einsatz), ohne Leistung.
  Dasselbe gilt für die Bildgenerierung (`image`): Dauer ja, Token nein.
- **Cloud-Streaming** (`streamCloudChat`): Dauer und Zeit bis zum ersten Token werden gemessen.
  Ein `usage`-Block wird genommen, wenn der Anbieter ihn im letzten Chunk mitschickt; eigens
  angefordert wird er nicht (`stream_options` ist nicht bei jedem Anbieter erlaubt, ein 400 würde
  den Chat brechen). Fehlt er, zählt der Aufruf als „ohne Preis" — nie als 0.

Ein Testfall in `shared/` zählt die Aufrufstellen nicht — das geht nicht ohne Code-Analyse. Statt
dessen steht im Leistungsfenster für den gewählten Zeitraum „N Aufrufe, davon M ohne Modul", wenn
je ein alter Eintrag ohne Modul vorkommt. Ab Umsetzung dieses Abschnitts muss die Zahl 0 sein.

## 5. Vier Ansichten, eine Zeitachse

Alles im bestehenden Leistungsfenster (`renderer/components/LlmPerformance/`, TabType
`llm-performance`). Kein Dashboard-Widget: Das Dashboard bleibt ruhig, und die Entscheidung gegen
ein Bilanz-Widget (`docs/voice-command-plan.md`) gilt weiter.

Die X-Achse ist in **Zeitabschnitte** geteilt (je Abschnitt eine Säule beziehungsweise ein Punkt). Ein Zeitraum-Umschalter für alle Ansichten: **Heute / 7 Tage / 30 Tage / 12 Monate**. Die
Körnung folgt dem Zeitraum: **Stunde**, Tag, Tag, **Monat**. (Gebaut so, nicht wie ursprünglich
„Tag, Tag, Tag, Woche": ein einzelner Tages-Abschnitte für „Heute" wäre kein Diagramm, und zwölf
Monats-Abschnitte lesen sich besser als 52 Wochen. Wochen-Abschnitte gibt es in der Logik weiterhin, die
Ansicht nutzt sie derzeit nicht.) Der Zeitraum endet immer am Ende des heutigen Tages.

### Einsatz
- Gestapelte Balken je Tag oder Woche: Aufrufe je Modell. Farbe je Modell, Reihenfolge nach
  Häufigkeit im Zeitraum.
- Daneben zwei Zahlen: Anteil lokal, Anteil Cloud. Kein Kuchendiagramm.
- Umschaltbar auf „je Modul" mit denselben Balken.

### Kosten
- Balken je Monat (oder Woche): Cloud-Kosten, getrennt in „gemeldet" (voll) und „gerechnet"
  (schraffiert). Darüber die Zahl ungepreister Aufrufe, wenn > 0, und das Präfix „≥".
- Zweite Reihe: **Rechenzeit lokal** je Modell in Minuten aus `computeMs`. Das ist der ehrliche
  Preis eines lokalen Modells.
- Keine Umrechnung in Euro. Preise sind in USD, wie die Kataloge.

### Zeitgewinn
- Balken je Woche: geschätzte Minuten aus `estimateSavedMinutes`, **auch unter null**. Negative
  Balken hängen nach unten. Die Referenz-Rechnung steht als Fußnote darunter.
- Daneben je Aufgabentyp ein Punktdiagramm: Median der aktiven Minuten je Modell, mit N am Punkt.
  **Kein Punkt unter drei Läufen** — dieselbe Grenze wie `MIN_CASES_PER_ARM` im Vergleichsmodus.
- Zwei Zahlen daneben, immer sichtbar: ungemessene Läufe (kein `activeMs`) und Läufe ohne
  Referenzzeit (`unpricedTypes`).
- Durchlaufzeit steht als eigene, dünne Linie daneben, nie im selben Balken. Sie ist keine
  Arbeitszeit (Regel 1 der Zeitbilanz).

### Leistung
- Linie je Modell: Wochen-Median der Ausgabe-Token/s. Kaltstarts bleiben ausgeschlossen und
  werden als Zahl unter der Linie gezählt (`isColdStart`, `summarize`).
- Läufe mit verstecktem Reasoning (`hiddenThinking`) bleiben markiert und gehen in eine eigene
  Linie, nie in dieselbe wie sichtbare Läufe.
- Ein Modell mit weniger als drei Aufrufen in einer Woche bekommt für diese Woche keinen Punkt.
- Cloud-Backends melden keine Serverzeiten; dort ist die Linie **Wanduhrzeit bis zur Antwort**
  und heißt so.

## 6. Ehrlichkeitsregeln

Die fünf Regeln der Zeitbilanz gelten unverändert (Arbeitszeit statt Laufzeit; nicht gemessen ist
nicht null; keine Kappung bei null; Minuten nur gegen eingetragene Referenz mit sichtbarer
Rechnung; nur Vordergrundzeit, gedeckelt). Neu dazu:

1. **Tage ohne Daten sind Lücken, keine Nullen.** Ein Wochenende ohne Nutzung erscheint als
   fehlender Balken, nicht als Absturz auf null. Eine Linie wird über eine Lücke nicht
   durchgezogen.
2. **N steht neben jeder aggregierten Zahl.** Median ohne N ist keine Aussage.
3. **Kein Punkt unter N = 3**, weder im Zeitgewinn noch in der Leistung.
4. **Untergrenzen heißen Untergrenzen.** Sobald ein Aufruf im Zeitraum ohne Preis ist, trägt die
   Kostensumme „≥". Sobald ein Lauf ohne `activeMs` ist, trägt der Zeitgewinn den Zusatz
   „N Läufe nicht gemessen".
5. **Die App zieht keinen Schluss.** Kein „bestes Modell", keine Empfehlung, kein Pfeil nach
   oben. Sie zeigt Verteilungen mit Stichprobengröße. Wer ein Modell wechseln will, macht das im
   Vergleichsmodus mit Zuteilung — ein Zeitgewinn-Diagramm ist Beobachtung, kein Experiment,
   weil der Nutzer das Modell selbst gewählt hat (Selbstselektion, siehe
   `docs/comparison-mode-plan.md` § 2).
6. **Zahlen je Gerät.** Dev-App und installierte App haben getrenntes `userData` und damit
   getrennte Geschichte. Das steht in der Ansicht, sobald Daten vorhanden sind, als Fußnote.

## 7. Referenzminuten sind Teil der Geschichte

`estimateSavedMinutes` bewertet **alle** Läufe mit der **heutigen** Referenzzeit. Wer die
Referenz von 30 auf 20 Minuten ändert, schreibt damit rückwirkend jede Woche um. Das ist
gewollt (die Referenz ist eine Schätzung, und eine bessere Schätzung soll gelten), muss aber
sichtbar sein:

- Jede Änderung einer Referenzzeit wird als Ereignis `reference-changed` im Aktivitäts-Logbuch
  festgehalten: Aufgabentyp, alter Wert, neuer Wert. Geschrieben vom Main-Prozess im
  `save-ui-settings`-Pfad, wenn sich `impact.referenceMinutes` ändert — nicht vom Renderer.
- Die Zeitgewinn-Ansicht zeichnet an diesen Tagen eine senkrechte Markierung und trägt die
  Fußnote „bewertet mit heutiger Referenz (30 min je Tabellenzusammenführung)".
- Die rohen aktiven Minuten je Lauf bleiben die gespeicherte Wahrheit. Minuten „gespart" sind
  immer abgeleitet, nie gespeichert.

## 8. Auswertelogik

Alles Rechnen liegt pur in `shared/` und ist mit Vitest getestet, wie `activityLog.ts` und
`llmTelemetry.ts`:

- `shared/measurementHistory.ts` (Arbeitstitel): Zeitraum → Zeitabschnitt (Tag/Woche/Monat, lokale
  Mitternacht, Wochenbeginn Montag), Zuordnung der Aufrufe und Läufe zu Zeitabschnitten, je Zeitabschnitt die
  Kennzahlen aus § 5 mit N und den Untergrenzen-Markern.
- Wiederverwendet werden `summarize`, `isColdStart`, `summarizeCost` aus `llmTelemetry.ts` und
  `summarizeActivity`, `estimateSavedMinutes` aus `activityLog.ts`. Nichts davon wird
  dupliziert. Wo `summarizeActivity` einen Zeitraum nimmt, wird es je Zeitabschnitt aufgerufen — mit der
  **gesamten** Ereignisliste, weil ein Lauf um 23:58 enden und um 00:03 übernommen werden kann.
- Testfälle, die zwingend dabei sind: leerer Zeitabschnitt (Lücke, nicht null), Zeitabschnitt mit N = 2 (kein
  Punkt), negative Wochenbilanz, Aufruf ohne Preis in einem Monat mit Preisen („≥"), Kaltstart
  in einer Woche (ausgeschlossen, gezählt), Lauf ohne `runId` (zählt für Einsatz, nicht für
  Kosten je Lauf), Jahreswechsel und Monatsgrenze bei Wochen-Abschnitten, Referenzänderung mitten im
  Zeitraum.
- **Selektor-Falle**: Der Store hält die rohen Listen für den geladenen Zeitraum. Gerechnet wird
  im Render mit `useMemo`. Ein Selektor, der ein neues Objekt zurückgibt, erzeugt die
  dokumentierte „Maximum update depth"-Schleife.

Der Export (heute Markdown/CSV in die Zwischenablage) bekommt den gewählten Zeitraum und die
Abschnitts-Tabelle. Damit stehen die Zahlen für Videofolien ohne Nachrechnen.

## 9. Diagramme ohne Bibliothek

Vier Diagrammtypen: gestapelte Balken, Balken mit Schraffur und negativem Bereich, Linie mit
Lücken, Punktdiagramm mit Beschriftung. Das ist mit SVG und einer kleinen Skalenhilfe machbar.

- Eigene Komponenten in `renderer/components/Shared/charts/`, Farben und Schrift aus den
  CSS-Token in `styles/index.css`, damit hell und dunkel ohne Sonderfälle stimmen.
- Keine neue Abhängigkeit. Eine Diagrammbibliothek bringt Bundle-Gewicht, einen weiteren
  Audit-Pfad und eine Gestaltung, die sich der App nicht anpasst. Die vier Typen rechtfertigen
  das nicht.
- Kein Antialiasing-Zauber, keine Animation. Präsentationsmodus schaltet Übergänge ab; Diagramme
  dürfen davon nicht abhängen.
- Werte je Balken oder Punkt stehen als Text daneben oder im `title`, nicht nur als Fläche. Wer
  die Zahl braucht, soll sie lesen können, nicht schätzen.
- Vor dem Bauen die Gestaltungsregeln für Datenvisualisierung im Harness laden (Farbformel,
  Legende, Achsen, Tooltip). Farben je Modell werden im Zeitraum stabil vergeben, damit ein
  Modell in allen vier Ansichten dieselbe Farbe hat.

## 10. Abgrenzung

- **Zeitgewinn gibt es nur für Läufe mit Entscheidung.** Chat, Zusammenfassung, Übersetzung,
  Smart Connections, Quiz haben weder Referenz noch Übernahme. Sie bekommen Einsatz, Kosten und
  Leistung, keinen Zeitgewinn. Das steht in der Ansicht, nicht nur hier.
- **Die KI-Leiste ist der nächste Kandidat** für einen eigenen Aufgabentyp: Anweisung → Diff →
  Übernehmen/Verwerfen ist dasselbe Muster wie der Agent. Nicht Teil dieses Plans.
- **Kein Geräteabgleich.** Geschichte ist je Gerät. Ein Export/Import über Geräte wäre ein
  eigenes Vorhaben mit eigenen Fragen (Doppelzählung, Zeitzonen).
- **Keine Stromkosten**, keine CO₂-Schätzung. `computeMs` ist gemessen, alles darüber wäre
  geraten.
- **Kein Vergleich zwischen Modellen als Empfehlung.** Dafür gibt es den Vergleichsmodus.
- **Keine Sprachausgabe der Geschichte.** Die Tagesbilanz bleibt die gesprochene Antwort; die
  Geschichte ist eine Ansicht.

## 11. Entschiedene Punkte

- Bezugspunkt ist der Lauf; Aufrufe tragen `runId`.
- Telemetrie wird als Rohdaten unter `userData/telemetry/` gespeichert, 365 Tage, nie im Vault.
- Der Renderer kann Telemetrie nur lesen.
- `RunCost` geht in `agent-run-finished`; gemeldet und gerechnet bleiben getrennt; ungepreist
  wird gezählt.
- Lokale Aufrufe bekommen Rechenzeit, keinen Dollarwert.
- Modulnamen kommen aus einem Katalog; „chat" als Standardwert entfällt.
- Kein Punkt unter N = 3; Lücken statt Nullen; N neben jeder Zahl; die App zieht keinen Schluss.
- Referenzänderungen werden geloggt und markiert; gesparte Minuten werden nie gespeichert.
- Alles im Leistungsfenster, kein Dashboard-Widget.
- Diagramme in eigenem SVG, keine Bibliothek.

## 12. Offen

- Obergrenze der Telemetrie-Datei (50 000 ist ein Vorschlag; an einem realen Monat prüfen).
- Ob der Wochen-Abschnitte in der 30-Tage-Ansicht lesbarer ist als der Tages-Abschnitte. Am echten Vault
  entscheiden, nicht am Beispiel.
- Ob die Statusleisten-Anzeige (Token/s) auf die Datei umgestellt wird, damit sie nach einem
  Neustart nicht leer ist. Nicht dringend; die Live-Anzeige ist für den Moment gedacht.
- Farbe je Modell gilt **je Zeitraum**: Wechselt man von 7 auf 30 Tage, kann dasselbe Modell eine
  andere Farbe bekommen, weil sich die Rangfolge ändert. Eine über Zeiträume stabile Zuordnung
  bräuchte eine gespeicherte Farbtabelle je Modell — offen, ob das die Verwirrung wert ist.
- Die Sitzungstabelle unter der Geschichte ist jetzt der kleinere Teil des Fensters. Ob sie
  bleibt, einklappbar wird oder in die Geschichte einzieht, am echten Gebrauch entscheiden.
- Gegenprobe am **echten** Vault mit echten Läufen steht aus; geprüft wurde mit gesäten Daten im
  Prüfstand-Vault plus einem echten Aufruf.

## 13. Stand der Umsetzung

**Schritt 1 gebaut (02.09.2026), noch nicht committet, noch ohne GUI-Gegenprobe:**

- `shared/llmTelemetry.ts`: `runId?` an `LlmRunMetrics`, durchgereicht von `fromOllamaResponse`
  und `fromCloudResponse`; `isLlmRunMetrics` (zeilenweise Prüfung, Zahlen endlich und nicht
  negativ), `pruneLlmRuns`, `TELEMETRY_RETENTION_DAYS = 365`, `TELEMETRY_MAX_RUNS = 50 000`.
- `main/llm/telemetryLedger.ts` neu: JSONL-Ablage, Warteschlange, Verdichten, `readTelemetryRange`.
  12 Tests in `telemetryLedger.test.ts` (gleichzeitige Aufrufe, Torso-Zeile, verfälschte Zeilen,
  Verbleib nach Alter und Obergrenze, nur Anhängen zwischen Verdichtungen, kein Vault).
- `main/llm/telemetry.ts`: `setTelemetryVault`, jeder `recordLlmRun` hängt an das Logbuch an.
  Ringpuffer und Push an die Fenster unverändert.
- `main/llm/chatClient.ts`: `ChatOptions.telemetryRunId`, an allen vier Erfassungsstellen
  weitergegeben (Ollama plain/tools, Cloud plain/tools).
- Lauf-Kennung gesetzt: Notiz-Agent (`noteAgent/loop.ts`, `memorySuggestion.ts` → `run.runId`),
  Mail-Analyse (`impactId` wird jetzt **zu Beginn** des Durchlaufs erzeugt und steht an jedem
  Modellaufruf, lokal wie Cloud; der Cloud-Pfad läuft dabei als `mail-summary` statt `chat`).
- IPC `llm-telemetry-range` (nur lesend, prüft den Zeitraum), Preload `getLlmTelemetryRange`,
  Typ in `shared/types.ts`. Kein Renderer-Verbraucher — das ist Schritt 6.
- `npm run typecheck` und `npm run test` (1726 Tests) grün.

**Schritt 2 gebaut (02.09.2026), noch nicht committet:**

- `shared/llmTelemetry.ts`: `RunCallTotals`, `summarizeRunCalls` (Token-Summen nur wenn gemeldet,
  Rechenzeit nur lokal, Kostentöpfe getrennt, `unpricedCalls`), `isRunCallTotals`.
- `shared/activityLog.ts`: `llm?: RunCallTotals` an `agent-run-finished` und
  `email-tasks-extracted`, in `isActivityEvent` mitgeprüft.
- `main/llm/telemetry.ts`: Korb je runId (verfällt nach 6 h, höchstens 200), `trackPendingTelemetry`,
  `collectRunTotals` (wartet laufende Cloud-Erfassungen ab, leert den Korb, liefert `undefined` bei
  null Aufrufen = „nicht gemessen"). `chatClient` meldet beide Cloud-Erfassungen an.
- `main/index.ts`: alle drei Schreibstellen (Lauf ok, Lauf gescheitert/abgebrochen, Mail-Durchlauf)
  holen die Summe vor dem Schreiben. Der Mail-Korb wird auch bei einem Durchlauf ohne Fund geleert.
- Tests: `telemetry.test.ts` (5, darunter der Wettlauf), `llmTelemetry.test.ts` (+5),
  `activityLog.test.ts` (+1). `npm run typecheck` und `npm run test` (1737 Tests) grün.
- Noch kein Verbraucher: Weder Tagesbilanz-Karte noch Leistungsfenster lesen `llm` — das ist
  Schritt 5/7.

**Schritt 3 gebaut (02.09.2026), noch nicht committet:**

- `shared/llmTelemetry.ts`: `LLM_MODULES`/`LlmModuleId`/`isLlmModuleId`, `moduleForAiAction`
  (translate/summarize/ocr-cleanup→vision-ocr, sonst ai-bar). `LlmRunMetrics.module` ist jetzt der
  Union-Typ; `isLlmRunMetrics` verwirft Zeilen mit fremdem Modul.
- `main/llm/chatClient.ts`: `ChatCallOptions`, kein `?? 'chat'` mehr; `streamCloudChat` erfasst
  Dauer, erstes Token und — falls geliefert — usage/Kosten, mit `trackPendingTelemetry`.
- **Alle 15 stummen Stellen erfasst**: Plugin-Host, Workflow-Runner, `ollama-generate` (lokal per
  Aktion, Cloud per `telemetryModule`), Aufgaben-Tagger, Reranker, `ollama-embeddings`,
  Cloud-Streaming im Notizen-Chat, Bildgenerierung, Projekt-RAG (Stream, done-Chunk), Vision-OCR,
  beide Quiz-Pfade (lokal + Cloud), Verbindungstest, Termin-aus-Mail (Cloud), Zettel-Vorschlag,
  Synonym-Generator, Crystallizer, `rag/embed.ts`, Telegram-Briefing und -Fragen.
- Gegenprobe per Skript: 15 Ollama-`fetch`-Stellen in `index.ts`, 15 Erfassungen; je eine in
  `embed.ts`, `synonymGenerator.ts`, `crystallizer.ts`, `dailyConsolidation.ts`.
- Bestehende chatClient-Tests geben das Modul jetzt mit (`'chat' as const`). `npm run typecheck`
  und `npm run test` (1740 Tests) grün.
- Renderer unverändert: Er liefert kein Modul, der Main-Prozess leitet es aus der Aktion ab.

**Schritte 4–8 gebaut (02.09.2026), noch nicht committet, in der Dev-App geprüft:**

- **§ 7 Referenz-Ereignis**: `ActivityEvent` kennt `reference-changed` (Tätigkeitsart, von, nach;
  `null` = keine Referenz). Geschrieben vom Main-Prozess im `save-ui-settings`-Pfad
  (`recordReferenceChanges`), nur bei echter Änderung von `impact.referenceMinutes`.
- **Lese-IPC `activity-events`** (`readActivityEvents` im Ledger, `activityEvents` im Preload):
  liefert alle Ereignisse des Vaults ohne Inhalte; der Renderer bucketet selbst mit der ganzen Liste.
- **§ 8 Auswertelogik** `shared/measurementHistory.ts` (18 Tests): `rangeBounds`, `buildBuckets`
  (Wochen montags, lokale Zeit, Jahreswechsel), `bucketUsage`, `bucketCost` (Rechenzeit je Modell,
  lokale Aufrufe ohne Zeiten gezählt), `bucketPerformance` (kein Punkt unter `MIN_POINT_RUNS = 3`,
  Kaltstarts raus und gezählt, verstecktes Reasoning als eigene Serie, Cloud markiert),
  `bucketSavedTime` (je Zeitabschnitt `summarizeActivity` + `estimateSavedMinutes` mit der GANZEN
  Ereignisliste, Modellzeilen ab 3 Läufen, Referenzänderungen im Zeitraum).
- **§ 9 Diagramme** `renderer/components/Shared/charts/` in eigenem SVG: `StackedBars`,
  `SignedBars` (negativ, schraffiert, Markierung), `LineChart` (Lücken werden nicht überbrückt),
  `DotPlot`, `Legend`. Farben aus der geprüften Referenzpalette (8 Stufen, hell/dunkel getrennt) als
  `--viz-N`-Token; Farbe je Modell einmal je Zeitraum nach Häufigkeit, ab dem neunten „Andere".
  Stapel in jedem Balken gleich geordnet. Werte im Tooltip, nicht auf jedem Punkt.
- **§ 5 Ansicht** `LlmPerformance/HistorySection.tsx` oberhalb der Sitzungstabelle: Umschalter,
  vier Blöcke mit Kennzahlen-Zeile (N und Vorbehalte sichtbar, nicht nur im Tooltip), Fußnote
  „bewertet mit heutiger Referenz", Hinweis „Zahlen je Gerät". Übersetzungen DE/EN.
- **§ 8 Export** `shared/measurementHistoryExport.ts` (Markdown + CSV über die Zeitabschnitt, mit „—" für
  Lücken, „≥" für Untergrenzen, N-Spalten), 2 Tests. Knöpfe in der Toolbar.
- **Geprüft in der Dev-App** (isoliertes Profil `MINDGRAPH_USER_DATA_DIR`, Prüfstand-Vault, mit
  gesäten Logbuch-Daten): alle vier Zeiträume, hell und dunkel, Tooltips, negativer Balken,
  Schraffur, Punktdiagramm mit N, Legenden, Markdown-Export in der Zwischenablage. Ein echter
  Aufruf über die KI-Leiste (gemma4:12b-mlx) landete als Zeile mit `module: 'ai-bar'` und Zeiten
  im Logbuch — Schritt 1 bis 3 damit live bestätigt.
- `npm run typecheck` grün, `npm run test` 1759 Tests grün.

**Gegenprobe in der App (offen):** Nach einem beliebigen Modellaufruf muss unter dem
`userData`-Ordner der laufenden App `telemetry/<16 Hex>.jsonl` liegen und eine Zeile mit `module`,
`model`, `backend` enthalten; nach einem Agentenlauf trägt jede Zeile dieses Laufs dieselbe `runId`
wie das `agent-run-finished`-Ereignis in `activity/<hash>.json`.

## 14. Reihenfolge

Die Reihenfolge folgt einem Grundsatz: **Erst sammeln, dann zeigen.** Jeder Tag ohne Speicher
fehlt später in jeder Kurve.

1. **Telemetrie-Logbuch auf Platte + `runId`** (§ 1, § 2). Ab hier wächst Geschichte. Testbar
   ohne UI: Datei vorhanden, Einträge validiert, Verbleib greift.
2. **`RunCost` in `agent-run-finished` und `email-tasks-extracted`** (§ 3). Kleinster Eingriff,
   größter Erkenntnisgewinn.
3. **Modulkatalog, generische Pfade, dann Einzelstellen** (§ 4). Danach muss „ohne Modul" im
   Zeitraum 0 sein.
4. **`reference-changed`-Ereignis** (§ 7). Klein, aber ohne es ist jede spätere Kurve
   mehrdeutig.
5. **Auswertelogik in `shared/` mit Tests** (§ 8).
6. **Zeitraum-Umschalter + Ansicht Einsatz** (§ 5). Erst die einfachste Ansicht, GUI-Prüfung am
   echten Vault.
7. **Kosten, Zeitgewinn, Leistung** nacheinander, jede mit Prüfung an 1 Lauf, mehreren Läufen
   und einem negativen Wert (der wiederkehrende Fehlertyp der Bilanz).
8. **Export auf Zeitraum ausweiten.**

Nach jedem Schritt: `npm run typecheck` + `npm run test`; die Ansichten manuell mit `npm run dev`
gegen den echten Vault, nicht gegen Beispieldaten.
