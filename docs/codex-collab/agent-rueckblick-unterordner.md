# Notiz-Agent: Ordner mit Unterordnern auswerten, ohne Kontext-Überlauf (Rev. 3)

## Aufgabe

**Anlass (05.10.2026, real):** Der Nutzer hängt seinen Journal-Ordner an und bittet den Petrol
Agent um eine Jahreszusammenfassung. Der Agent liest nur die Dateien direkt im Ordner, die
Monats-Unterordner sieht er nicht. Ergebnis: ein Rückblick über einen Bruchteil des Jahres, ohne
dass die Karte sagt, wie viel fehlte.

Das ist kein Formulierungsproblem, sondern zwei Grenzen im Code:

1. **Der Ordner-Anhang ist flach.** `listSupportedFolderFiles` und `readFolderContext` überspringen
   alles, was keine Datei ist (`main/noteAgent/contextFiles.ts:309`, `:621`). Der Kopf des
   Manifests sagt zwar „nur direkte Ebene", das Modell liest das aber nicht als „hier fehlen 340
   Einträge".
2. **Ein Jahr passt nicht in den Kontext.** Lokale Läufe haben `AGENT_NUM_CTX` = 32 768 Token
   (`shared/contextGuard.ts:26`), Ordner-Läufe 20 Iterationen (`noteAgent/loop.ts:24`). 365
   Journal-Einträge à 1 500 Zeichen sind rund 550 000 Zeichen. Selbst wenn der Agent alle Pfade
   kennt: Einzeln lesen reißt die Iterationen, gesammelt lesen reißt den Kontext. Der Überlauf-Wächter
   (`looksTruncated`) bricht dann laut ab. Das ist gut, liefert aber auch kein Ergebnis.

Shell löst das nicht: 8 KB Ausgabe pro Befehl, 20 Befehle, und aus der Sandbox heraus gibt es kein
Modell, das zusammenfassen könnte. `vault_search` löst es auch nicht: Ein Rückblick braucht
**Vollständigkeit**, eine Suche liefert die passendsten Stellen und lässt den Rest still weg.


### Ziel

**Vorgabe des Nutzers (05.10.2026):** Wenn für einen Auftrag ein Ordner ausgewählt ist, werden
**auch die Unterordner durchsucht** — und der Kontext läuft dabei nicht über. Das gilt für jeden
Ordner-Auftrag und jedes lesbare Format, nicht nur für den Jahresrückblick. Der Rückblick ist der
Anlass und der härteste Fall; „Finde in diesem Projektordner alle Zusagen von Frau X“ oder ein
gemischter Ordner mit Excel/PDF/Word in Unterordnern müssen genauso gehen.

**Vollständigkeitsvertrag:** Am Ende jedes Ordner-Werkzeugs steht, was gefunden, was gelesen, was
gekürzt und was mit welchem Grund ausgelassen wurde. Gezählt, nie geschätzt. Wo eine Grenze greift,
heißt das Ergebnis „unvollständig“ und sagt, wo.

**Rev. 2 (nach Codex-Runde 1, F01–F20):** Statt eines Sonderwerkzeugs für Zeitreihen drei
Bausteine, die zusammen das allgemeine Ziel tragen — siehe „Umfang“.

### Grundidee

Drei Bausteine, jeder für eine der drei Arten, wie der Kontext heute überläuft:

1. **Eine gemeinsame Ordner-Inventur** mit Unterordnern für ALLE Ordner-Werkzeuge (Manifest,
   Einzel-Lesen, Tabellenzähler, `collect_table`, Auto-Kontext). Behebt: Unterordner unsichtbar,
   Werkzeuge mit unterschiedlicher Sicht (F02), Sicherheitsgrenze am Anhang statt am Vault (F05).
2. **Ein Kontextbudget pro Lauf**, gegen das jedes Werkzeugergebnis gerechnet wird. Zu große
   Ergebnisse werden **geblättert**, nicht gekürzt; bei knappem Budget verweigern Lesewerkzeuge mit
   klarer Anweisung. Behebt: Manifest ohne Grenze (F03), Einzel-Lesen ohne Grenze (F04), wachsende
   Historie (F09), unbekannte Fenster bei Cloud/LM Studio (F10).
3. **`folder_digest` — Ordner-Auswertung mit Frage.** Die App liest alle passenden Dateien selbst,
   lässt das Laufmodell sie gruppenweise mit der **Frage des Auftrags** auswerten (Befunde mit
   Fundstelle) und führt die Gruppenergebnisse in mehreren Stufen zusammen, bis sie in das Budget
   passen. Jahresrückblick = Frage „Was prägte diesen Monat?“, gruppiert nach Monat. „Zusagen von
   Frau X“ = dieselbe Mechanik, gruppiert nach Unterordner. Behebt F01, F08, F14 (teilweise).

Die Rohtexte laufen nie gesammelt durch den Agent-Kontext — dasselbe Prinzip wie `collect_table`
für Tabellen.

## Kontext/Anker

Alle Pfade relativ zu `app/src/`, Stand `41b60dca`.

- Flaches Listing: `main/noteAgent/contextFiles.ts:301` (`listSupportedFolderFiles`, Filter
  `!d.isFile()` in `:309`), Manifest `:332` (`listFolderManifest`), Einzel-Lesen `:410`
  (`readFolderFile`), Ordnerauflösung `:382` (`resolveFolderName`).
- Automatischer Ordner-Kontext beim Start: `contextFiles.ts:607` (`readFolderContext`), Limits
  `:64-66` (20 Dateien, 6 000 Zeichen/Datei), Kopfzeile „nur direkte Ebene“ `:720`.
- Bestehendes Verdichtungsmuster für Tabellen: `collect_table` `main/noteAgent/skills.ts:421`,
  `MAX_COLLECT_FILES` `contextFiles.ts:731`; Einzel-Lese-Sperre `skills.ts:385-405`.
- Werkzeug-Kontext ohne `chatOptions`: `NoteAgentContext` `skills.ts:40`; `onProgress`-Kanal ebd.
  `:49-52`.
- Iterationen und Kontext: `main/noteAgent/loop.ts:19`, `:24`, `:267-273` (`chatOptions`, `numCtx`),
  `:282` (maxIterations), Überlauf-Wächter `:298` → `shared/contextGuard.ts:60` (`looksTruncated`),
  `AGENT_NUM_CTX` `shared/contextGuard.ts:26`.
- Tool-Allowlist bei Ordner-Anhang: `loop.ts:204`; Prompt-Absatz zu Ordnern `loop.ts:61-62`.
- Arbeitsart: `shared/activityLog.ts:447` (`deriveActivityType`).
- Weitere Anker (Rev. 2): Registrierung eines Ordner-Anhangs `contextFiles.ts:161`
  (`registerContextFolder`, speichert heute nur `absPath` und optional `vaultRoot`);
  Basename-Zwang beim Einzel-Lesen `contextFiles.ts:418`; Parser liest per Pfad
  `contextFiles.ts:542` (`extractContent` → `assertEntryReadable` → Parser mit `src`);
  Tabellenzähler/`collect_table` flach `contextFiles.ts:388`, `:775`; leere direkte Ebene wirft
  `contextFiles.ts:650`; Manifest-Formatierung ohne Grenze `skills.ts:92`; sicheres Binär-Lesen
  mit `O_NOFOLLOW` `skills.ts:173` (`readVaultBinary`); `usage` nur in `ChatWithToolsResult`
  `main/llm/chatClient.ts:124-138`; OpenRouter-Modellliste mit `context_length`
  `chatClient.ts:1031`; `numCtx` nur Ollama `chatClient.ts:92`; Route am Lauf
  `main/index.ts:4713-4721`, `runRegistry.ts:209`; Ergebnis-Registrierung `runRegistry.ts:256`.

## Umfang

### Baustein A: Gemeinsame Ordner-Inventur (`main/noteAgent/folderInventory.ts`)

**Eine Funktion, alle Verbraucher.** `inventoryFolder(entry)` liefert für den angehängten Baum
eine Liste `{ relPath, kind, sizeBytes, mtimeMs, status }` und Zähler. Verbraucher:
`list_context_folder`, `read_context_file`, `countFolderTables`, `collectFolderTable`,
`readFolderContext`, `folder_digest`. `listSupportedFolderFiles` entfällt. Damit sehen alle
Werkzeuge denselben Baum (F02).

**Anhang-Grenze statt Vault-Grenze (F05):**
- `registerContextFolder` hält beim Anhängen `rootReal = realpath(absPath)` plus `dev`/`ino` des
  Ordners fest — auch für Ordner aus dem Dateidialog außerhalb des Vaults.
- Jeder Zugriff geht über einen `relPath`. Lexikalisch: kein absoluter Pfad, kein `..`, keine
  leeren Segmente, kein Segment mit führendem Punkt, nie `.mindgraph`.
- Physisch: Abstieg Segment für Segment mit `lstat`; ein Symlink in **irgendeinem** Segment
  (Ordner oder Datei) wird abgewiesen. Zusätzlich muss `realpath(ziel)` mit `rootReal + sep`
  beginnen. Gilt für Vault- und Dialog-Anhänge gleich.
- Die Inventur folgt keinen Symlinks und zählt sie als „übersprungen (Verknüpfung)“.

**Identität des Anhangs (F26, Rev. 3):** Vor jeder Inventur und vor jedem Lesen wird der
Anhang-Ordner erneut per `lstat` geprüft: kein Symlink, `dev`/`ino` gleich der beim Anhängen
gespeicherten Identität, `realpath` gleich `rootReal`. Abweichung → „Anhang wurde verschoben oder
ersetzt, bitte neu anhängen“, nichts gelesen.

**Lesen über einen Deskriptor (F06, Rev. 3 nach F25):** Ablauf je Datei:
1. Segment-weises `lstat` ab `rootReal` (kein Symlink in irgendeinem Segment), `realpath(ziel)`
   beginnt mit `rootReal + sep`.
2. `open(ziel, O_RDONLY | O_NOFOLLOW)`, `fstat`, `dev`/`ino` gleich dem `lstat` aus Schritt 1,
   regulär, Größe innerhalb der Grenze.
3. Aus dem Handle in einen Buffer lesen; die Parser bekommen den **Buffer**, nicht den Pfad.
4. **Nachprüfung:** Schritt 1 wird nach dem Lesen wiederholt (Segmente, `realpath`, `dev`/`ino`
   der Datei). Weicht etwas ab, wird der gelesene Inhalt verworfen und die Datei als
   „während des Lesens verändert“ gezählt.

**Ehrliche Grenze (Nutzerentscheidung 05.10.2026: abschwächen statt natives Modul):** Node hat
kein `openat`; die Verzeichnis-Segmente lassen sich nicht an Handles binden. Wer Schreibzugriff
auf den angehängten Ordner hat, kann einen **Zwischenordner** zwischen Schritt 1 und Schritt 2
gegen einen Symlink tauschen und nach dem Lesen vor Schritt 4 zurücktauschen; dann liest die App
eine Datei außerhalb des Anhangs, und weder `O_NOFOLLOW` (wirkt nur auf das letzte Segment) noch
der `dev`/`ino`-Vergleich bemerken es. Die Nachprüfung verkleinert das Fenster auf einen
doppelten Tausch im Millisekundenbereich, schließt es aber nicht. Das Restrisiko setzt einen
Angreifer mit Schreibrecht im Anhang und Zeitpräzision voraus; es ist dieselbe Klasse wie heute
beim flachen Lesen und bei `readVaultBinary` (`skills.ts:173`), nur mit mehr Segmenten. Der Code
benennt das an der Lesestelle; die Doku verspricht „Symlinks werden abgewiesen, ein gezielter
Wettlauf beim Austausch von Ordnern ist nicht ausgeschlossen“, nicht mehr.

**Parser auf Buffer (F24, Korrektur):** `parseExcel` benutzt SheetJS (`officeService.ts:32-35`,
liest schon heute erst einen Buffer → `XLSX.read(buf, { type: 'buffer' })`); mammoth nimmt
`{ buffer }`, AdmZip einen Buffer, pdfjs `Uint8Array`. Umstellung = Buffer-Varianten neben den
Pfad-Varianten, keine neue Bibliothek.

**Inventur getrennt von Bearbeitungsgrenzen (F07):** Die Inventur zählt den ganzen Baum bis zu
einer Schutzgrenze gegen pathologische Bäume (Tiefe 12, 20 000 Einträge). Wird die Schutzgrenze
erreicht, ist die Inventur als **unvollständig** markiert, mit dem Unterordner, in dem sie
abbrach — nie „N weitere“ mit erfundener Zahl. Bearbeitungsgrenzen (wie viel gelesen,
ausgewertet, zusammengeführt wird) sind davon getrennt und werden einzeln gemeldet.

**Auto-Kontext beim Start (F18):** `readFolderContext` liest Inhalte weiter nur von der direkten
Ebene (fester Zeichenbudget-Rahmen; rekursiv wäre es eine stille Auswahl der jüngsten Dateien),
**meldet aber die Unterordner** mit Zählern und den Hinweis auf `list_context_folder`/
`folder_digest`. Eine leere direkte Ebene ist kein Fehler mehr, solange Unterordner Dateien
enthalten.

**`collect_table` (F02):** sammelt aus dem ganzen Baum; jede Zeile bekommt als Herkunft den
`relPath` (heute nur Dateiname — zwei `Rückmeldung.xlsx` in verschiedenen Unterordnern wären
sonst nicht zu unterscheiden). `files`-Filter akzeptiert `relPath`. `MAX_COLLECT_FILES` bleibt
300 und gilt für den Baum; mehr wird mit Zahl gemeldet und das Ergebnis als unvollständig markiert.

### Baustein B: Kontextbudget pro Lauf (`shared/contextBudget.ts`, pur)

**Grundsatz (Rev. 3 nach F21/F22): Das Budget steuert, das Erkennen sichert.** Eine Zeichen-
schätzung ist nie eine garantierte Obergrenze (Tokenizer unbekannt, Pfade/Zahlen/JSON teurer als
Fließtext). Deshalb zwei Schichten:
1. **Steuern:** ein bewusst vorsichtiges Budget, das große Werkzeugergebnisse blättert und
   rechtzeitig sperrt — damit der Überlauf im Normalfall gar nicht erst entsteht.
2. **Erkennen:** der vorhandene Überlauf-Wächter (`looksTruncated`) bleibt die harte Grenze im
   Loop und läuft zusätzlich in **jedem** Auswertungsaufruf von `folder_digest` (Baustein C).
   Neu: Prompt-Token ≥ 95 % des angeforderten Fensters gelten ebenfalls als „möglicherweise
   gekürzt“ — ein voller Kontext ist genau der Zustand, in dem Ollama still die Mitte wegwirft.
   Erkannt im Loop → lauter Abbruch wie heute. Erkannt im Auswertungsaufruf → Paket halbieren und
   neu rechnen (höchstens zweimal), sonst Datei/Paket als „nicht auswertbar (zu groß fürs Modell)“
   zählen.

**Fenster bestimmen (F10, F29):**
- Ollama: der `numCtx` des Laufs (heute 32 768 bzw. 65 536 mit Web) — der einzige Wert, den die
  App selbst setzt.
- OpenRouter: `min(contextLength aus der Modellliste, 32 768)`. Der Katalogwert ist kein
  garantiertes Endpunkt-Fenster (F29), deshalb nur als Deckel nach unten: ist er kleiner als
  32 768, gilt er; größer wird nicht ausgenutzt. Fehlt er → 32 768. Überlauf über dem echten
  Endpunkt-Fenster meldet OpenRouter als Fehler; Endpunkte ≤ 8k mit stiller Mitte-Kompression
  fängt der Katalog-Deckel plus die 95-%-Regel ab.
- LLMBase, LM Studio, unbekannt: 32 768 angenommen, Lauf-Karte: „Kontextgröße unbekannt,
  vorsichtig gerechnet“.

**Rechnen (F21, F22, F23):**
- Belegt = gemeldete Prompt-Token der letzten Iteration (falls vorhanden) + Schätzung aller seither
  angehängten Nachrichten. Ohne gemeldete Token (erste Iteration, Backend meldet nichts): Schätzung
  über den **vollständigen Wire-Prompt** — System-Prompt, alle Nachrichten **und das JSON der
  Werkzeug-Schemata** (`JSON.stringify(tools)`).
- Schätzung mit **2,5 Zeichen/Token** (vorsichtiger als 3; Pfade, Zahlen und Tabellen liegen eher
  bei 2–3). Kalibrierung: vor Baustein B wird an drei echten Läufen (Ollama qwen, OpenRouter,
  LM Studio) das Verhältnis gemeldete Token : Zeichen gemessen; liegt ein Fall unter 2,5, wird der
  Divisor gesenkt. Messwerte in diesem Dokument nachtragen.
- Ausgabe-Reserve je Backend: Cloud = das gesetzte `maxTokens` (heute 8 192, `index.ts:4743`);
  Ollama/LM Studio ohne Ausgabegrenze = 8 192 angenommen.
- **Neu rechnen nach jeder Nachricht**, nicht einmal pro Iteration: mehrere Werkzeugaufrufe in einer
  Runde teilen sich keinen alten Restwert; auch Ablehnungs- und Fehlertexte zählen. Reicht der Rest
  für die nächste Modellanfrage nicht, stoppt der Loop **vor** dem Senden mit „Kontext voll“.

**Durchsetzen in `loop.ts`, nicht in jedem Werkzeug:** Der Loop gibt jedem Werkzeug
`ctx.budget.remainingChars()` (frisch berechnet) mit und prüft das Ergebnis vor dem Anhängen:
- **Obergrenze je Werkzeugergebnis:** min(25 % des Fensters, Rest). Werkzeuge mit Listen
  (Manifest, Inventur, Digest-Befunde, `read_context_file`) **blättern** selbst: erste Seite plus
  `cursor` plus „noch N Einträge / Zeilen“. Ein Werkzeug, das trotzdem zu groß zurückgibt, wird
  vom Loop abgelehnt (kurze Fehlermeldung mit Größe und Grenze), nie still gekürzt.
- **Lesesperre bei knappem Rest:** unter 15 % des Fensters verweigern alle lesenden Werkzeuge
  (`read_context_file`, `note_read`, `list_context_folder`, `read_attachment`, `folder_digest`)
  mit „Kontext fast voll — schreibe jetzt das Ergebnis“. Ergänzt die Tabellen-Lesesperre (F04),
  ersetzt sie nicht.

**Rekursives Manifest (F03):** `list_context_folder` zeigt bei Unterordnern zuerst nur den
**Baum mit Zählern** (je Unterordner: Anzahl je Format, Datumsbereich aus dem Dateinamen, falls
vorhanden), geblättert. Einzelzeilen erst mit `subfolder` und ebenfalls geblättert. Damit ist die
Ausgabegrenze unabhängig davon, ob 2 000 Dateien in einem oder in 2 000 Ordnern liegen.

### Baustein C: `folder_digest` — Ordner-Auswertung mit Frage

**Aufruf:**

```
folder_digest({
  folder: "Journal",
  question: "Was hat diesen Zeitraum geprägt: Schwerpunkte, Ereignisse, offene Fäden?",
  group_by: "month",                // subfolder | month | week | quarter | none
  subfolder: "2026",                // optional: nur dieser Teilbaum
  from: "2026-01-01", to: "2026-12-31",   // optional, nur bei Zeit-Gruppierung
  kinds: ["md"]                     // optional, Standard: alle lesbaren Formate
})
```

`question` ist Pflicht und kommt aus dem Auftrag. Für „alle Zusagen von Frau X“:
`question: "Welche Zusagen hat Frau X gemacht? Mit Datum.", group_by: "subfolder"`.

**Ablauf (Logik pur in `shared/folderDigest.ts`, Dateizugriff über Baustein A):**

1. **Auswahl** aus der Inventur nach `subfolder`, `kinds`, Zeitraum. Jede nicht gewählte Datei
   bekommt einen Grund (`Filter: Format`, `Filter: Zeitraum`, `ohne Datum`, `zu groß`,
   `Verknüpfung`, `nicht lesbar`).
2. **Datieren** (nur bei Zeit-Gruppierung): Frontmatter (`date`, `created`, `id` mit JJJJMMTT…) →
   Dateiname (`JJJJ-MM-TT`, `JJJJMMTT`) → Ordnerpfad (`2026/03`) → **ohne Datum**. Nie mtime
   (Sync verschiebt sie). Ungültige Daten (`2026-02-30`) zählen als ohne Datum.
3. **Gruppieren und in Pakete schneiden.** Paketgröße aus Baustein B: Fenster − Prompt-Gerüst −
   Ausgabe-Reserve (2 048, Auswertungsaufrufe setzen `maxTokens`/`num_predict` ausdrücklich) −
   10 % Sicherheitsabstand, 2,5 Zeichen/Token. Pakete an Dateigrenzen; eine Datei größer als ein
   Paket wird in Abschnitte geteilt (Abschnittsnummer in der Fundstelle), nicht gekürzt. Jeder
   Auswertungsaufruf läuft durch die Erkennen-Schicht (halbieren bei Verdacht).
   **Formatgrenzen (F24):** Der Digest nutzt eigene Lesegrenzen statt der Agent-Kontextgrenzen
   (PDF alle Seiten bis 500, Text ohne 15 000-Zeichen-Kappe, weil in Abschnitte geteilt wird).
   Was trotzdem nicht ganz gelesen wird, bekommt einen **Teilstatus mit Angabe**: „PDF: Seiten
   1–500 von 812“, „Excel: Blätter 1–5 von 9, je 200 Zeilen — für Tabellen collect_table nutzen“,
   „PPTX: nur Text und Notizen, keine Bildinhalte“, „PDF ohne Textebene“. Teilstatus zählt nie als
   „vollständig ausgewertet“.
4. **Auswerten** (Map): pro Paket ein Aufruf an das Laufmodell, ohne Werkzeuge. Untrusted-
   Begrenzer um die Inhalte. Ausgabe: Liste von Befunden, jeder mit Fundstelle `[relPath]` bzw.
   `[relPath#Abschnitt]`, oder ausdrücklich „keine Befunde in diesem Paket“. Nichts ergänzen, was
   nicht im Text steht.
5. **Fundstellen deterministisch prüfen (F14 teilweise):** Jede Fundstelle muss eine Datei dieses
   Pakets sein. Befunde ohne oder mit fremder Fundstelle fliegen raus und werden gezählt
   („3 Befunde ohne gültige Fundstelle verworfen“). Eine inhaltliche Prüfung jeder Aussage
   (Wortdeckung wie `shared/rag/citations.ts`) ist ausdrücklich Stufe später.
6. **Zusammenführen** (Reduce, F08): Passen alle Befunde zusammen nicht in die Ergebnis-
   Obergrenze aus Baustein B, werden sie in Bündeln (höchstens so viele, wie in ein Paket passen)
   zusammengeführt, Fundstellen bleiben erhalten — so oft wie nötig, keine feste Ebenenzahl.
   Die Gruppe (Monat/Unterordner) bleibt in jeder Stufe als Überschrift erhalten.
7. **Aufrufgrenze (F30, Rev. 3):** Vorab: Map-Aufrufe sind exakt zählbar (Pakete), Reduce wird
   als Untergrenze geschätzt. Liegen schon die Map-Aufrufe über 40, verweigert das Werkzeug mit
   Zahlen, geschätzter Dauer (aus der Token/s-Telemetrie des Modells, sonst „unbekannt“) und
   Vorschlag (engerer Zeitraum, Teilbaum, weniger Formate). Während des Laufs wird nach **jedem**
   Schritt neu gerechnet; erreicht der Lauf die harte Grenze (40 + 10 für Reduce), endet er mit den
   bis dahin fertigen Gruppen als Ergebnis, Status „unvollständig: Aufrufgrenze, Gruppen 1–9 von
   12 ausgewertet“. Die 40 ist eine Zeit-/Kostenbremse, keine Kontextgrenze, und wird nach der
   Messung am echten Journal (Reihenfolge Schritt 4) neu festgelegt.
8. **Rückgabe:** Befunde je Gruppe (geblättert, falls nötig) plus **Abdeckung**: gefunden,
   ausgewertet vollständig, ausgewertet in Abschnitten, ausgelassen je Grund, verworfene Befunde.
   Auf der Karte (F31): nur die **Zähler** plus die Liste der nicht vollständig gelesenen Dateien
   (höchstens 50, Rest als Zahl) — über das vorhandene `summary`-Feld des Ergebnisses. Die
   vollständige Statusliste je Datei ist eine spätere, geblätterte Abfrage (eigener run-gebundener
   IPC) und steht unter „Später“. Bei Abbruch durch den Nutzer: bisherige Gruppen
   mit Status „unvollständig, abgebrochen nach Gruppe 7 von 12“.

**Modellweg und Route (F13):** `loop.ts` reicht seine aufgelösten `chatOptions` (inkl. Signal,
`numCtx`) über `ctx.chatOptions` durch. Das Werkzeug prüft vor dem ersten Aufruf die Übereinstimmung mit
`run.route` über eine feste Zuordnung (F27): `provider` `ollama`/`ollama-cloud` → Backend `ollama`,
`lmstudio` → `lmstudio`, `openrouter` → `openrouter`, `llmbase` → `llmbase`; Modell gleich
`run.route.model`. Abweichung → Abbruch. Bei `ollama-cloud` gilt zusätzlich die Cloud-Freigabe
des Laufs (sie wurde beim Start schon geprüft; das Werkzeug benutzt keine anderen Optionen).
Tests für alle fünf Anbieter.

**Verbrauch (F11, F28):** Die Auswertungsaufrufe laufen über `chatWithTools` mit leerer
Werkzeugliste, mit `telemetryModule: 'note-agent'` und der `runId`. `usage` liefern nur
OpenAI-kompatible Backends, und nur wenn der Anbieter sie meldet; lokales Ollama liefert keine
(dort entstehen keine Kosten), `promptTokens` ist optional. Fehlende Werte werden als **unbekannt**
geführt, nie als 0 — `callUsages` kennt dafür schon `null` (`loop.ts:292`). Vor Baustein C ein
Test, dass jedes Backend `tools: []` annimmt (sonst eigene Variante ohne `tools`-Feld). Das
Werkzeug meldet jeden Verbrauch über `ctx.recordUsage(usage)`, der Loop hängt ihn an
`callUsages` — damit stimmen Kostenbilanz und Tätigkeitsprotokoll.

**Kein Hard-Lock-Versprechen (F12):** Der Satz aus Rev. 1 ist gestrichen. Es gilt, was für den
Lauf gilt: das Tool-Calling-Gate. Eine eigene Qualitätsgrenze für Verdichtung gibt es nicht ohne
Messung.

**Fortschritt und Abbruch:** jedes Paket ein `onProgress`-Schritt („Werte 2026-03 aus · Paket
4/14“); `run.abort.signal` vor jedem Aufruf geprüft und durchgereicht.

**Damit der Agent es benutzt (F19), gleich mitliefern:**
- Allowlist: `folder_digest` immer, wenn ein Ordner angehängt ist (`loop.ts:197-206`).
- Ordner-Prompt (`loop.ts:54-63`) bekommt eine Entscheidungsregel: gleich aufgebaute Tabellen →
  `collect_table`; Frage über viele Text-/Mischdateien, einen Zeitraum oder Unterordner →
  `folder_digest`; einzelne bekannte Datei → `read_context_file`.
- Manifest-Hinweis (`skills.ts:105-110`) nennt `folder_digest`, sobald der Baum mehr als
  ~15 lesbare Nicht-Tabellen-Dateien enthält — im Moment der Entscheidung, nicht nur im Prompt.

**Arbeitsart (F16):** `deriveActivityType` prüft `folder_digest` NACH `collect_table`/`write_xlsx`,
Shell, Web und den Dokument-Writern und VOR `write_note`, Ergebnis `summary`. Also: Digest +
`write_xlsx` = `table-merge`, Digest + `write_docx` = `document`, Digest allein oder + `write_note`
= `summary`. Tests für genau diese Folgen.

**Datenweg auf der Karte (CLAUDE.md: neue Datenwege nachtragen):** Bei Cloud-Route nennt der
Aufklapper „Welche Daten wohin gehen“ zusätzlich: „Bei einer Ordner-Auswertung: alle
ausgewählten Dateien des Ordners samt Unterordnern, paketweise.“ Das gehört in diese Stufe, weil
ohne den Satz ein neuer Datenweg ohne Ankündigung entstünde.

### Später (nach Gegenprobe im Alltag, F15/F20)

- Monats-/Gruppenergebnisse als **einzeln übernehmbare Karten** — braucht eigene registrierte
  Ergebnisse (`registerResult`) mit Vorschau- und Übernahme-Semantik und geprüften
  Vorschlagsnamen; nicht einfach Dateien im Staging.
- Wiederaufnahme nach Abbruch über Quell-Hashes.
- Starter-Skill „Rückblick“ (Gerüst des Rückblicks, Wahl der Gruppierung).
- Inhaltliche Prüfung der Befunde gegen die Fundstelle (Wortdeckung wie im Vault-Chat).
- Vollständige Statusliste je Datei als geblätterte Abfrage auf der Karte (F31).

## Bewusst nicht

- **Kein rekursiver Inhalts-Auto-Kontext** beim Start (stille Auswahl).
- **Kein Zugriff außerhalb des Anhangs.** Inventur und Digest sehen genau den Baum unter dem
  Anhang.
- **Kein automatischer Rückblick per Zeitplan.**
- **Kein Werkzeug, das Rohtexte vieler Dateien gesammelt zurückgibt.**
- **Kein stilles Kürzen** an irgendeiner Stelle: blättern, verweigern oder als unvollständig
  markieren.

## Sicherheit

- Anhang-Grenze (`rootReal`), Symlink-Verbot in jedem Segment, Deskriptor-Lesen mit
  `O_NOFOLLOW` + `dev`/`ino`-Vergleich, Parser auf Buffer — siehe Baustein A.
- Anhang-Identität vor jedem Zugriff (F26), Nachprüfung nach dem Lesen.
- **Nicht ausgeschlossen** (Nutzerentscheidung): ein gezielter doppelter Austausch eines
  Zwischenordners im Millisekundenfenster durch jemanden mit Schreibrecht im Anhang (F25). Im Code
  an der Lesestelle benannt; die Doku verspricht nicht mehr.
- Auswertungsaufrufe ohne Werkzeuge; Inhalte in Untrusted-Begrenzern; Befunde gehen als
  Werkzeugergebnis mit Untrusted-Markierung zurück an den Agenten.
- Route geprüft (F13), Datenweg auf der Karte angekündigt.

## Tests (F17)

**Pur (`shared/`):**
- `contextBudget.test.ts`: Fenster je Backend (Ollama/OpenRouter/unbekannt), Rest nach gemeldeten
  Prompt-Token, Ergebnis-Obergrenze, Lesesperre unter 15 %.
- `folderDigest.test.ts`: Datierung (Frontmatter > Name > Pfad, nie mtime, ungültige Daten),
  Gruppierung, Pakete an Dateigrenzen und Abschnitte großer Dateien, Fundstellen-Prüfung,
  mehrstufiges Zusammenführen bis zur Grenze, Aufrufschätzung, Abdeckung geht auf (Summe der
  Status = gefunden).
- `activityLog.test.ts`: Digest-Folgen aus F16.

**Main (`noteAgent/`):**
- `folderInventory.test.ts`: Symlink als Datei, als Zwischenordner, nach außen zeigend; `..`,
  Punkt-Segment, `.mindgraph`; Dialog-Anhang außerhalb des Vaults; Schutzgrenze Tiefe/Einträge
  → „unvollständig“ mit Ort; 2 000 Unterordner mit je einer Datei (Manifest bleibt in der Grenze);
  Datei während des Lesens ausgetauscht → fail-closed; leere direkte Ebene mit Unterordnern.
- `collect_table` über Unterordner, gleichnamige Dateien in zwei Ordnern unterscheidbar.
- Loop-Test mit gefälschtem Chat-Client: gewachsene Historie + zwei Digests → Budget greift,
  Lesesperre, Verbrauch landet in `callUsages`, Route-Abweichung abgewiesen, Abbruch zwischen
  Paketen liefert Teilergebnis mit Status.

**Manuell (GUI, Computer use):** echter Journal-Ordner mit Monats-Unterordnern, lokales Modell:
Agent nutzt `folder_digest`, kein Überlauf, Abdeckung stimmt mit Dateizahl im Finder überein,
fünf Aussagen gegen die Einträge geprüft. Zweiter Fall: Projektordner mit Excel/PDF in
Unterordnern und einer Personen-Frage.

## Reihenfolge

1. Baustein A (Inventur, Anhang-Grenze, Deskriptor-Lesen, alle Verbraucher umgestellt, F18) mit
   Tests. Für sich schon nützlich.
2. Baustein B (Budget im Loop, geblättertes Manifest/Lesen, Lesesperre) mit Tests.
3. Baustein C (`folder_digest` + Prompt/Allowlist/Manifest-Hinweis + Arbeitsart + Datenweg-Satz).
4. Messung am echten Journal: Paketgröße, Ausgabelänge, Aufrufgrenze nachjustieren.
5. „Später“-Liste erst nach der Gegenprobe entscheiden.

## Offene Fragen an den Nutzer

1. **Aufbau des Journals:** Ordner- und Dateinamen, Datum im Frontmatter? (Datierungsregeln)
2. **Cloud bei Tagebuch-Inhalten:** reicht die Ankündigung auf der Karte, oder soll
   `folder_digest` bei Cloud-Route eine ausdrückliche Bestätigung verlangen?
3. **Brain-Tageszusammenfassungen** als zweite Quelle — später, oder gar nicht?

## Codex-Findings

### F01 — Ziel für allgemeine Ordner-Aufträge verfehlt
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:28
Status: [OFFEN]
`digest_folder` sammelt laut Plan nur `.md`/`.txt` und verdichtet nach Zeit oder Unterordner (Plan :99–115). Der vorhandene Ordnerpfad unterstützt auch Excel, CSV, PDF, Word, PowerPoint und HTML (`app/src/main/noteAgent/contextFiles.ts:68–83`, `app/src/main/noteAgent/skills.ts:353–356`). Für „alle Zusagen von Frau X“ gibt es weder vollständige Trefferermittlung noch überprüfbare Fundstellen; für gemischte Unterordner fehlen ganze Formate. Stufe 1 lässt nur Einzellesen übrig. Vorschlag: Ziel entweder ausdrücklich auf Text-Rückblicke begrenzen oder ein rekursives, formatübergreifendes Such-/Extraktionswerkzeug mit Abdeckung, Fundstellen und eigenen Budgets planen.

### F02 — `collect_table` bleibt bei Unterordnern blind
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:73
Status: [OFFEN]
Die geplante Rekursion von `list_context_folder` ändert `collectFolderTable` und `countFolderTables` nicht: beide benutzen das flache `listSupportedFolderFiles` (`app/src/main/noteAgent/contextFiles.ts:386–390`, `:774–781`). Die Werkzeugbeschreibung behauptet weiterhin „alle Dateien“ (`app/src/main/noteAgent/skills.ts:421–423`). Ein gemischter Projektordner kann rekursiv Tabellen anzeigen, die Auswertung aber still auslassen. Vorschlag: gemeinsamen rekursiven Enumerator samt relativen Pfaden für Manifest, Zählung und `collect_table` verwenden; Vollständigkeit und Grenzen im Bericht ausweisen.

### F03 — Rekursives Manifest hat keine feste Ausgabegrenze
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:78
Status: [OFFEN]
„Nach Unterordner gruppiert“ begrenzt die Ausgabe nicht: 2.000 Dateien können in 2.000 Unterordnern liegen; auch `subfolder` kann 2.000 Einzelzeilen liefern. Schon das heutige Manifest formatiert jede Datei ohne Zeichenlimit (`app/src/main/noteAgent/skills.ts:92–114`), während der Auto-Kontext eine eigene Grenze von 100 Zeilen hat (`app/src/main/noteAgent/contextFiles.ts:64–66`, `:712–717`). Das Werkzeugergebnis wird vollständig in die Agent-Historie übernommen (`app/src/main/noteAgent/loop.ts:363–368`). Vorschlag: hartes Zeichen-/Tokenbudget, paginierte Gruppen und Einträge mit Cursor sowie sichtbarer Restzahl; Grenzfälle testen.

### F04 — `read_context_file` kann den Kontext weiter füllen
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:81
Status: [OFFEN]
Die bestehende Lesesperre greift erst ab drei bzw. acht erfolgreichen Lesevorgängen und nur, wenn mindestens mehrere Tabellen im Ordner liegen (`app/src/main/noteAgent/skills.ts:373–405`, `:189–190`; `app/src/main/noteAgent/contextFiles.ts:386–390`). Ein textlastiger Baum kann deshalb mit vielen Einzelaufrufen weiterwachsen; pro Aufruf sind bis zu 15.000 Zeichen möglich (`contextFiles.ts:490–495`). Für rekursive Tabellen zählt die Sperre wegen F02 sogar nur die direkte Ebene. Vorschlag: kumulatives Agent-Kontextbudget und passende Verdichtungs-/Suchroute für Text, statt allein auf die Tabellensperre zu vertrauen.

### F05 — Pfadprüfung schützt den Anhangsbaum nicht
Schwere: kritisch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:81
Status: [OFFEN]
`assertEntryReadable` prüft bei Vault-Anhängen nur, ob der kanonische Pfad **im Vault** liegt; bei Dialog-Anhängen gibt es gar keinen Root (`app/src/main/noteAgent/contextFiles.ts:32–51`, `:159–182`). Ein Unterpfad kann damit durch Symlink oder Umbenennung zu einer anderen Datei innerhalb des Vaults bzw. bei externem Anhang außerhalb des gewählten Ordners führen, obwohl der Plan „genau den Baum unter dem Anhang“ verspricht (:177). `realpath` allein weist Symlinks nicht ab. Vorschlag: kanonischen Anhangsroot beim Registrieren festhalten, alle Komponenten per `lstat` auf Symlinks/Punktnamen prüfen und jeden Zielpfad zusätzlich gegen **diesen** Root abgleichen; auch Dialog-Anhänge testen.

### F06 — TOCTOU wird für rekursive Reads nicht gelöst
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:185
Status: [OFFEN]
Die heutige Prüfung macht `realpath`, danach öffnet der Parser den Pfad erneut (`app/src/main/noteAgent/contextFiles.ts:43–52`, `:542–565`); selbst bei `readFolderFile` liegen Listing und Read auseinander (`:422–447`). Bei neu akzeptierten Unterpfaden können Zwischenordner zwischen Prüfung und Öffnen ausgetauscht werden. Die Behauptung „C01/TOCTOU“ und Tests nur mit bereits vorhandenen Symlinks belegen diese Race nicht. Vorschlag: Zugriff über verifizierte File-Handles bzw. plattformspezifisch sichere relative Öffnung entwerfen; mindestens Race-Fail-closed und Austausch von Zwischenordnern testen.

### F07 — Tiefen- und Dateigrenze widersprechen Vollständigkeit
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:75
Status: [OFFEN]
Tiefe 4 und 2.000 Dateien sind legitime Grenzen, erfüllen aber nicht „auch die Unterordner durchsucht“ und „jeden Eintrag einbezogen“ (:28–38). Bei Abbruch nach 2.000 Funden ist die Zahl weiterer Dateien nicht bekannt, solange die Suche nicht bis zum Ende zählt; „werden mehr gefunden, sagt das Manifest das mit Zahl“ ist so nicht spezifiziert. Vorschlag: Inventur getrennt vom Bearbeitungslimit, mit gezählten übersprungenen Dateien/Unterbäumen und explizit unvollständigem Ergebnis; alternativ paginierbar fortsetzen.

### F08 — Gruppen- und Zusammenführungsbudget sind nicht begrenzt
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:116
Status: [OFFEN]
60.000 **Zeichen** sind keine sichere 32k-Token-Grenze; der echte Wächter schätzt nur eine Untergrenze und lässt im Zweifel Überlauf durch (`app/src/shared/contextGuard.ts:34–38`, `:58–75`). Bei 2.000 Dateien können über 30 Teilaufrufe oder eine zweite Ebene mit vielen 1.500-Zeichen-Teilen entstehen. Der Plan verbietet eine dritte Ebene und bricht über 30 Aufrufen ab (:119, :141–143), liefert dann gerade für große Ordner kein Ergebnis. Vorschlag: Tokenbudget aus realem Modellfenster samt Prompt-/Ausgabe-Reserve, begrenzte Fan-in-Größe und mehrstufige Reduktion oder explizite Teilresultate mit Unvollständigkeitsstatus festlegen.

### F09 — Agent-Historie wächst trotz kleiner Gruppen weiter
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:128
Status: [OFFEN]
12 × 1.500 Zeichen sind nur das neue Tool-Ergebnis, nicht der Gesamtkontext. System-Prompt, Auftrag, Skill, Manifest, vorherige Reads und alle Tool-Ergebnisse bleiben in `messages` und werden in jeder Iteration erneut gesendet (`app/src/main/noteAgent/loop.ts:259–263`, `:289–305`, `:363–368`). Der Wächter erkennt nur manche Kürzungen (`app/src/shared/contextGuard.ts:58–75`). Auch mehrere `digest_folder`-Aufrufe addieren sich. Vorschlag: verbleibendes Kontextbudget vor Rückgabe berechnen und Gruppenbericht paginieren bzw. kompakt referenzieren; einen Verlauf mit vorangegangenen Tools und mehreren Digests testen.

### F10 — Cloud- und LM-Studio-Kontextgröße nicht aus `numCtx` ableitbar
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:116
Status: [OFFEN]
`ChatOptions.numCtx` gilt laut Typ ausdrücklich nur für Ollama (`app/src/main/llm/chatClient.ts:92–101`); der OpenAI-kompatible Request sendet ihn nicht (`:788–802`). Die Agent-Loop-Vorgabe 32.768 (`app/src/main/noteAgent/loop.ts:267–274`) sagt daher nichts über Cloud-/LM-Studio-Fenster aus; `contextGuard.ts:14–20` nennt sogar mögliche stille Kürzung bei kleinen OpenRouter-Endpunkten. Vorschlag: effektives Fenster je Backend/Modell ermitteln oder konservativ begrenzen und Gruppenbudget daran koppeln; unbekanntes Fenster sichtbar als Grenze behandeln.

### F11 — `telemetryRunId` ergänzt `callUsages` nicht
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:145
Status: [OFFEN]
`telemetryRunId` schreibt Aufrufe in die Lauf-Telemetrie (`app/src/main/llm/chatClient.ts:809–814`), aber `callUsages` ist ein lokales Array des Loops, in das nur `chatWithTools`-Iterationen gelangen (`app/src/main/noteAgent/loop.ts:283–292`). `costOfCalls` summiert genau dieses Array (`app/src/main/llm/chatClient.ts:985–999`). Ein `chat()`-Aufruf aus dem Werkzeug liefert zudem keine `usage` im `ChatResult` (`:119–138`, `:592–607`). Vorschlag: Werkzeug-Aufrufkosten explizit an den Loop zurückgeben oder Cloud-Bilanz einheitlich aus der Run-Telemetrie ableiten; Test für Karte und Tätigkeitsprotokoll getrennt.

### F12 — Hard-Lock-Aussage ist derzeit falsch
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:191
Status: [OFFEN]
`note-agent` ist `damageRelevant: false`; `isHardLocked` gibt damit für dieses Modul immer `false` (`app/src/shared/modelCompatibility.ts:213–217`, `:854–860`). Der Main benennt das ausdrücklich (`app/src/main/index.ts:4662–4670`). `shellLockReason` ist eine gesonderte Regel nur für Shell/Rechner-Steuerung (`:4626–4633`, `:4654–4659`; `modelCompatibility.ts:863–881`). „Dasselbe Modell wie der Lauf“ verhindert ein schwaches Verdichtungsmodell also nicht. Vorschlag: diesen Satz streichen oder eine fachlich begründete neue Qualitätsgrenze mit Tests spezifizieren.

### F13 — Routen-Einstufung gilt nicht automatisch für spätere Aufrufe
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:152
Status: [OFFEN]
Die Route wird einmal vor dem Lauf aus `chatOptions` klassifiziert und am Run gespeichert (`app/src/main/index.ts:4713–4721`; `app/src/main/noteAgent/runRegistry.ts:209–210`). `chat()` dispatcht später allein anhand seiner Optionen (`app/src/main/llm/chatClient.ts:592–607`); es vergleicht nicht `run.route`. Das Weiterreichen unveränderter Optionen ist nötig, aber keine automatische Sicherheitsinvariante, besonders bei einem neuen Modellweg. Vorschlag: Backend/Modell der Gruppenaufrufe gegen die Laufroute prüfen und Cloud-Policy/Signal ausdrücklich übernehmen; Route und Ziel in einem Test abgleichen.

### F14 — Abdeckung beweist keine Einbeziehung jeder Datei
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:36
Status: [OFFEN]
Ein Zähler „gelesen“ belegt nur, dass Text an einen Modellaufruf ging; die Modellzusammenfassung kann Ereignisse auslassen oder falsche Dateibelege erzeugen. Der Plan prüft Belege nur per Prompt (:122–130) und manuell fünf Aussagen (:203–204). Große Einzeldateien werden absichtlich nur am Anfang gelesen (:119–121), und `from`/`to` schließen Dateien aus, ohne dass die Beispiel-Abdeckung zwischen ausgeschlossen, undatiert, fehlerhaft und teilweise gelesen sauber trennt. Vorschlag: manifestartige Statusliste je Datei mit Hash/Zeichenumfang und Filtergrund, Aussagebelege deterministisch gegen Quellen prüfen, Erfolg bei teilweisen Dateien als unvollständig markieren.

### F15 — Zwischendateien erscheinen nicht automatisch als übernehmbare Karten
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:131
Status: [OFFEN]
Das Run-Staging speichert nur Dateien (`app/src/main/noteAgent/staging.ts:20–25`, `:54–63`). Die Karte erhält ausschließlich Einträge aus `run.results`, die ausdrücklich per `registerResult` registriert werden (`app/src/main/noteAgent/runRegistry.ts:256–265`, `:305–312`; `app/src/main/index.ts:4945–4952`). Der vorhandene Helper schreibt und registriert zusammen (`app/src/main/noteAgent/skills.ts:262–283`); `digest/2026-03.md` allein wird weder aufklappbar noch einzeln übernehmbar. `accept-result` schreibt zudem nur in den Zielordner und reserviert einen Basenamen (`app/src/main/index.ts:5059–5075`). Vorschlag: Zwischenergebnisse als eigene registrierte Resultate mit expliziter Preview-/Übernahme-Semantik planen; Unterpfade nicht ungeprüft als Vorschlagsnamen verwenden.

### F16 — `deriveActivityType` braucht Prioritätsentscheidung
Schwere: niedrig
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:148
Status: [OFFEN]
Derzeit wird `summary` allein bei `write_note` geliefert; unbekannte Tools fallen auf `other` (`app/src/shared/activityLog.ts:447–455`). Eine neue `digest_folder`-Regel muss vor oder nach `collect_table`, Shell, Web und Dokument-Writer einsortiert werden. Sonst kippt ein Lauf mit Digest plus `write_xlsx` unbeabsichtigt in `summary` oder ein reiner Digest ohne `write_note` bleibt `other`. Vorschlag: Priorität für gemischte Tool-Folgen festlegen und genau diese Fälle testen.

### F17 — Tests decken die riskanten Systemgrenzen nicht ab
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:194
Status: [OFFEN]
Die Testliste prüft Datierung, Gruppierung und einen gefälschten Chat-Client, aber nicht Tiefen-/2.000-Datei-Abbruch, sehr viele Unterordner, Paginierung, Cloud-/LM-Studio-Fenster, mehrfachen Digest im gewachsenen Loop, Dateiaustausch während des Reads, externe Dialog-Anhänge oder Karten-Übernahme. Diese Grenzen sitzen in verschiedenen Schichten (`app/src/main/noteAgent/contextFiles.ts:43–51`, `app/src/main/noteAgent/loop.ts:289–305`, `app/src/main/index.ts:5059–5075`). Vorschlag: Integrationsfälle für Inventur→Werkzeug→Loop→Karte ergänzen, mit absichtlich fehlerhaften und wechselnden Dateien.

### F18 — Ordner nur mit Unterordnern bleibt im Auto-Kontext ein Fehler
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:85
Status: [OFFEN]
`readFolderContext` wirft bei null direkt unterstützten Dateien schon vor dem Kopftext (`app/src/main/noteAgent/contextFiles.ts:617–652`); `readAttachmentRaw` nutzt genau diesen Pfad für Ordner-Anhänge (`:216–225`). Ein Journal-Root mit ausschließlich Monatsordnern bekommt daher nicht den geplanten Hinweis „12 Unterordner nicht gelesen“, sondern einen Fehler. Vorschlag: Unterordner auch dann zählen und melden, wenn die direkte Ebene leer ist; `read_attachment` und `list_context_folder` für diesen Fall testen.

### F19 — Nutzung des neuen Werkzeugs ist nicht in Stufe 2 gesichert
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:206
Status: [OFFEN]
Der heutige Ordner-Prompt weist ausdrücklich auf `list_context_folder` → `read_context_file` bzw. `collect_table`, nicht auf Verdichtung (`app/src/main/noteAgent/loop.ts:54–63`). Erlaubt werden Tools separat in der Allowlist (`:197–206`). Der Starter-Skill, der `digest_folder` erklären soll, kommt erst in Stufe 3 (Plan :157–162, :212), und ein Skill wird nur als Metadatum angeboten und bei Bedarf per `use_skill` geladen (`loop.ts:156–159`). Damit kann Stufe 2 technisch existieren, während der Jahresauftrag weiter einzeln liest. Vorschlag: Tool-Allowlist, Beschreibung, Ordner-Prompt und Entscheidungshilfe zusammen mit dem Werkzeug liefern; einen Agent-Test mit dem konkreten Jahresauftrag vorsehen.

### F20 — Umfang vermischt Kernlösung mit Produktfunktionen
Schwere: niedrig
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:131
Status: [OFFEN]
Für das belegte Journal-Problem sind rekursive Inventur, sichere Textlesegrenze, gruppierte Verdichtung und ehrliche Abdeckung nötig. Einzelne übernehmbare Monatskarten, persistente Wiederaufnahme, neuer Starter-Skill und Kartendatenweg greifen zusätzlich in Staging, Registry, Accept-IPC und Renderer ein (`app/src/main/noteAgent/staging.ts:20–25`, `app/src/main/noteAgent/runRegistry.ts:256–265`, `app/src/main/index.ts:4945–4952`, `:5059–5075`). Der Plan nennt Wiederaufnahme zwar später, behandelt Monatskarten aber als Teil von Stufe 2. Vorschlag: Kernlauf zuerst mit messbarem Vollständigkeitsvertrag spezifizieren; separate Produktfunktionen erst nach der Gegenprobe entscheiden.

### Nachprüfung Runde 2

- F01 — teilweise: `folder_digest` wählt alle lesbaren Formate und eine Frage, doch Parser-Grenzen und fehlende inhaltliche Belegprüfung tragen „alle Zusagen“ noch nicht (Rev. 2 :170–207; `app/src/main/noteAgent/contextFiles.ts:507–536`, `:542–585`).
- F02 — trägt: Inventur soll Tabellenzähler und `collectFolderTable` gemeinsam speisen; Herkunft wird `relPath` (Rev. 2 :93–99, :133–136; bisher flach: `app/src/main/noteAgent/contextFiles.ts:386–390`, `:774–781`).
- F03 — trägt: geblätterter Baum und geblätterte Einzelzeilen plus Loop-Grenze sind als Design festgelegt (Rev. 2 :153–168; bisher unbeschränkt: `app/src/main/noteAgent/skills.ts:92–114`). Die Budgetrechnung selbst bleibt F21/F22.
- F04 — teilweise: Lesesperre und Seiten sind geplant (Rev. 2 :153–163), ihre Restberechnung ist noch keine verlässliche Obergrenze (F21/F22).
- F05 — teilweise: Anhangsroot und Segmentprüfung sind richtig angesetzt (Rev. 2 :101–109); Root-Austausch und die Race aus F25/F26 bleiben.
- F06 — trägt nicht: Enddatei-`O_NOFOLLOW` und `dev`/`ino` sichern ausgetauschte Zwischenordner nicht; das Restfenster wird in Rev. 2 :117–119 und :280–282 fälschlich als fail-closed bezeichnet (F25).
- F07 — trägt: Inventurgrenze ist getrennt und eine unbekannte Restzahl wird nicht erfunden (Rev. 2 :121–125; vorher flacher Zähler: `app/src/main/noteAgent/contextFiles.ts:301–324`).
- F08 — teilweise: mehrstufige Reduktion ist vorgesehen (Rev. 2 :196–215), Paketbudget und 40-Aufrufgrenze begrenzen die Aufgabe weiter (F22/F30).
- F09 — teilweise: die Historie wird als Budgetposten berücksichtigt (Rev. 2 :147–161), aber erste Iteration und Token-Schätzung sind offen (F21/F22).
- F10 — trägt nicht: `numCtx` wird nur an Ollama gesendet (`app/src/main/llm/chatClient.ts:92–101`, `:788–802`); 32.768 bei unbekannten Modellen und `contextLength` bei OpenRouter sind keine garantierten Fenster (F29).
- F11 — teilweise: `ctx.recordUsage` löst die Loop-Aggregation für gemeldete Cloud-Usage (Rev. 2 :227–230; `app/src/main/noteAgent/loop.ts:283–292`), aber `usage` fehlt lokal und kann beim Provider fehlen (F28).
- F12 — trägt: Hard-Lock-Versprechen entfernt (Rev. 2 :232–234; `app/src/shared/modelCompatibility.ts:213–217`, `:854–860`).
- F13 — teilweise: explizite Prüfung vorgesehen (Rev. 2 :222–225), aber `run.route` hat keinen Backend-Wert und Ollama-Cloud hat einen abweichenden Provider-Namen (F27).
- F14 — teilweise: Datei-/Abschnittsstatus und syntaktische Fundstellenprüfung sind geplant (Rev. 2 :190–220); inhaltliche Prüfung ist bewusst vertagt, daher ist „jeden Eintrag einbezogen“ weiterhin nur als technische Leseabdeckung belegbar (`app/src/shared/contextGuard.ts:58–75`).
- F15 — trägt: einzelne Gruppenkarten sind explizit verschoben und mit `registerResult` verknüpft (Rev. 2 :257–264; `app/src/main/noteAgent/runRegistry.ts:256–265`).
- F16 — trägt: Priorität und Kombinationen sind festgelegt (Rev. 2 :247–250; aktueller Dispatcher `app/src/shared/activityLog.ts:447–455`).
- F17 — teilweise: Tests für viele Systemgrenzen ergänzt (Rev. 2 :287–311), doch Null-Tool-Aufrufe, Fenster-Metadaten, Parser-Grenzen und echte Parent-Races fehlen (F25/F28/F29).
- F18 — trägt: leere direkte Ebene mit belegten Unterordnern wird zugelassen (Rev. 2 :127–131; bisheriger Fehler `app/src/main/noteAgent/contextFiles.ts:650–652`).
- F19 — trägt: Allowlist, Prompt-Entscheidung und Manifest-Hinweis kommen zusammen mit Baustein C (Rev. 2 :239–245; heutiger Prompt `app/src/main/noteAgent/loop.ts:54–63`).
- F20 — trägt: Karten, Resume und Skill sind abgetrennt; der nötige Cloud-Datenweg bleibt im Kern (Rev. 2 :252–264; `CLAUDE.md:374–377`).

### F21 — Vor dem ersten Modellaufruf fehlt ein verlässliches Promptbudget
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:147
Status: [OFFEN]
Das Budget schätzt vor dem ersten Aufruf nur Nachrichtenzeichen, obwohl `chatWithTools` zusätzlich alle Werkzeug-Schemata sendet (`app/src/main/noteAgent/loop.ts:233–234`, `:259–291`; `app/src/main/llm/chatClient.ts:660–680`, `:783–801`). System-Prompt, Note-Excerpt, Skills und Shell-Pfade können schon vor einem Tool-Ergebnis groß sein (`loop.ts:47–65`, `:259–263`). Der Wächter greift erst nach der Modellantwort und lässt im Zweifel Kürzung durch (`app/src/shared/contextGuard.ts:58–75`). Vorschlag: vollständigen Wire-Prompt samt Tool-Schemata vor dem ersten Request budgetieren und bei unbekannter Tokenisierung ein nachweisbar konservatives Limit oder Vorab-Tokenisierung verwenden; Erstaufruf mit großen Schemas/Skill/Notiz testen.

### F22 — Drei Zeichen pro Token sind keine obere Schranke
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:147
Status: [OFFEN]
Die Formel `Zeichen / 3` ist nur eine Heuristik. Kurze Kennungen, Zahlen, Tabellen, Pfade, JSON und mehrsprachiger Text können deutlich mehr Token je Zeichen brauchen; Tool-Schemata und Rollen-Overhead fehlen außerdem. `contextGuard` bezeichnet seine eigene Zeichenrechnung ausdrücklich als **untere** Schranke (`app/src/shared/contextGuard.ts:34–38`, `:70–75`); daraus lässt sich mit Divisor 3 kein sicheres Vorab-Budget machen. Dieselbe Annahme bestimmt die Map-Paketgröße (Rev. 2 :196–199), wo kein Agent-Loop-Wächter läuft. Vorschlag: Modell-spezifische Tokenzählung oder harte, empirisch validierte Worst-Case-Grenze mit Abbruch bei unbekannter Tokenzahl; Map/Reduce-Prompts separat vor dem Senden prüfen.

### F23 — Ausgabe und mehrere Tool-Calls können die Restrechnung überholen
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:153
Status: [OFFEN]
Der Loop verarbeitet mehrere `result.toolCalls` nacheinander (`app/src/main/noteAgent/loop.ts:341–379`). Wenn jedes Tool denselben beim Iterationsbeginn ausgerechneten Rest erhält oder ein Fehlertext nach Ablehnung angehängt wird, kann die Summe die Grenze überschreiten. Der Plan reserviert 4.096 Ausgabetoken, der Cloud-Loop erlaubt aber bis 8.192 (`app/src/main/index.ts:4740–4745`); lokal ist die Ausgabe nicht begrenzt (`:4725–4729`). Vorschlag: nach **jeder** Assistant- und Tool-Nachricht neu rechnen, auch für Ablehnungs-/Fehlertexte; wirksame Ausgabegrenze je Backend mitrechnen und den nächsten Modellaufruf bei fehlendem Platz vor dem Senden stoppen.

### F24 — „Alle lesbaren Formate vollständig“ widerspricht heutigen Parser-Grenzen
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:181
Status: [OFFEN]
Buffer-Umstellung ist grundsätzlich möglich, aber `parseExcel` benutzt **SheetJS `xlsx`**, nicht ExcelJS (`app/src/main/office/officeService.ts:32–35`). Mammoth nimmt laut installiertem Typ `{ buffer }`, AdmZip einen `Buffer`, pdfjs schon `Uint8Array` (`app/node_modules/mammoth/lib/index.d.ts:11–26`, `app/node_modules/@types/adm-zip/index.d.ts:11`, `app/src/main/noteAgent/contextFiles.ts:507–511`). Das löst die Extraktionsgrenzen nicht: PDF nur 50 Seiten und Abbruch bei 15.000 Zeichen (`contextFiles.ts:513–536`), Excel nur fünf Blätter/200 Zeilen im allgemeinen Extraktor (`:542–560`), PPTX-Leser gibt Text/Notizen ohne Bildinhalt zurück (`:566–570`), HTML nur den Body (`:574–581`). Ein Digest darf diese Dateien nicht als „vollständig ausgewertet“ zählen. Vorschlag: parser- und formatspezifischen Teilstatus samt Seiten-/Blatt-/Zeilen-/Bildgrenzen definieren; Buffer-API anhand der tatsächlich verwendeten Bibliotheken implementieren und testen.

### F25 — Enddatei-Deskriptor macht Parent-Race nicht fail-closed
Schwere: kritisch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:111
Status: [OFFEN]
`O_NOFOLLOW` schützt nur den letzten Pfadteil beim `open`; `fstat`-`dev`/`ino` bestätigt nur, dass die geöffnete Datei dieselbe wie beim vorherigen `lstat` ist. Ein Angreifer kann einen Zwischenordner nach dem `realpath`-Containment-Check, aber vor `lstat` und `open`, durch einen Symlink ersetzen; dann stimmen Enddatei-`lstat` und `fstat` überein, obwohl beide außerhalb des Anhangs liegen. Das Vorbild `readVaultBinary` öffnet ebenfalls einen Pfad und prüft nach `open` nur Typ/Größe, keine Parent-Deskriptoren (`app/src/main/noteAgent/skills.ts:173–185`). Rev. 2 :117–119 und :280–282 nennt das Restfenster, behauptet aber zu Unrecht, der Endvergleich fange alles außerhalb ab. Vorschlag: Parent-Verzeichnisse über Handles/`openat`-äquivalente native Lösung binden oder die Garantie ausdrücklich abschwächen; Race-Test mit Austausch eines Zwischenordners zwischen Containment-Prüfung und Datei-`lstat`.

### F26 — Gespeicherte Root-Inode wird vor Reads nicht nachgeprüft
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:101
Status: [OFFEN]
Rev. 2 speichert `rootReal` und `dev`/`ino`, beschreibt aber keinen Vergleich der Root-Identität bei späterer Inventur oder Dateiöffnung (:102–119). Der heutige Eintrag hält nur den Namen und die Vault-Grenze, und jeder Read löst ihn neu auf (`app/src/main/noteAgent/contextFiles.ts:32–51`, `:161–182`). Wird der angehängte Ordner umbenannt und am selben Pfad ersetzt, kann die neue Baumidentität als derselbe Anhang gelten; bei Dialog-Anhängen ist das die einzige Freigabegrenze. Vorschlag: Root-Handle oder erneutes `lstat`/`fstat` gegen die gespeicherte Identität vor jedem Inventur-/Read-Schritt; Austausch als unvollständig/abgelehnt melden.

### F27 — `run.route` enthält keinen direkt vergleichbaren Backend-Wert
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:222
Status: [OFFEN]
`AgentRoute` hat `kind`, `provider`, `providerLabel`, `model`, aber kein `backend` (`app/src/shared/agentRoute.ts:15–26`). `provider` kann `ollama-cloud` sein, während `ChatOptions.backend` weiterhin `ollama` ist (`agentRoute.ts:42–64`; `app/src/main/llm/chatClient.ts:61–73`). Ein roher Vergleich von Backend und Route würde gültige Ollama-Cloud-Läufe ablehnen; ein Vergleich nur des Modellnamens prüft den Empfänger nicht. Vorschlag: feste Zuordnung `provider`→Backend plus Modell- und Cloud-Policy-Prüfung spezifizieren; lokale, Ollama-Cloud-, LM-Studio-, OpenRouter- und LLMBase-Fälle testen.

### F28 — Leere Werkzeugliste garantiert weder `usage` noch Provider-Akzeptanz
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:227
Status: [OFFEN]
`chatWithTools([], …)` sendet in allen Adaptern tatsächlich `tools: []` (`app/src/main/llm/chatClient.ts:660–680`, `:783–802`), aber ein Test für diese Provider-Kombination fehlt. Ollama liefert im `ChatWithToolsResult` **keine** `usage` (`:743–749`); OpenAI-kompatible Provider liefern sie nur, wenn `json.usage` vorhanden und parsebar ist (`:850–854`). `promptTokens` ist ebenfalls optional (`:124–138`). Die Formulierung „liefert usage und promptTokens“ ist daher falsch. Vorschlag: für modellfreie Map/Reduce-Aufrufe eine echte `chatWithUsage`-Variante oder bestätigten Null-Tool-Pfad nutzen; fehlende Usage/Prompt-Tokens sichtbar als unbekannt behandeln und pro Backend testen.

### F29 — OpenRouter-`contextLength` ist Metadatum, kein geprüftes Request-Fenster
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:140
Status: [OFFEN]
Der Katalog liefert ein optionales `context_length` und mappt es zu `contextLength` (`app/src/main/llm/chatClient.ts:1027–1044`). Der Request nutzt aber nur Modellname und Provider-Policy, nicht den konkreten Endpunkt oder dessen Kontextlimit (`:487–494`, `:788–802`). Die App weiß laut `contextGuard` von möglichen OpenRouter-Endpunkten mit ≤8k und stiller Mitte-Kompression (`app/src/shared/contextGuard.ts:14–20`). Auch ein gedeckelter Katalogwert beweist deshalb kein tatsächliches Fenster. Vorschlag: verfügbares Minimum des gewählten Endpunkts ermitteln/erzwingen oder konservativen unbekannt-Fallback nutzen; fehlende/veraltete Katalogdaten und Endpunktwechsel testen.

### F30 — 40 Aufrufe sind eine Aufgaben- statt Kontextgrenze
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:212
Status: [OFFEN]
Mit großen oder kurzen, aber zahlreichen Dateien entstehen viele Map-Pakete; der Plan zählt zusätzlich Reduce-Aufrufe nur **geschätzt**, obwohl deren Zahl von der Modell-Ausgabe abhängt (:196–214). Damit kann die 40er-Grenze nach Beginn doch erreicht werden oder ein vollständig auswertbarer Ordner vorab abgewiesen werden. Schon Rev. 1 schätzte 12–24 lokale Aufrufe à 1–3 Minuten für ein Jahr; 40 können eine mehrstündige blockierende Ausführung bedeuten (Rev. 2 :5–20; `app/src/main/noteAgent/loop.ts:264–270` erlaubt bis 10 Minuten **pro** Request). Vorschlag: echte Obergrenze pro Map/Reduce-Schritt, nach jedem Schritt neu berechnen, Teilergebnisse als unvollständig erhalten; Zeit-/Kostenabschätzung vor dem Start und Messung am realen lokalen Modell.

### F31 — Vollständige Statusliste passt nicht automatisch in die Ergebniskarte
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:216
Status: [OFFEN]
`run.digestCoverage` ist neu, doch die öffentliche Ergebniskarte enthält heute nur `resultId`, Name, Format, Summary und `sources` (`app/src/main/noteAgent/runRegistry.ts:32–49`, `:305–312`); der Done-Event sendet `publicResults(run)` (`app/src/main/index.ts:4945–4952`). Eine Statusliste mit bis zu 20.000 Pfaden passt auch nicht sinnvoll in `sources` und wäre in der aktuellen Darstellung kein eigener aufklappbarer Datenblock. Vorschlag: kompakten Abdeckungszähler auf der Karte und paginierte Detailabfrage über einen neuen, run-gebundenen IPC-Handle planen; auch Abbruch-/Fehlerläufe und Retention prüfen.

### Nachprüfung Runde 3

- F06 — teilweise: Rev. 3 :116–136 benennt das Restrisiko beim Datei-Read nun ausdrücklich; die Aussage zur Inventur und die notwendige „doppelt/Millisekunden“-Einschränkung sind noch zu stark (F32).
- F21 — teilweise: Systemnachrichten und Werkzeugdefinitionen sind eingeplant (Rev. 3 :186–190), `JSON.stringify(tools)` ist aber nicht der tatsächliche Wire-Prompt (`app/src/main/llm/chatClient.ts:660–680`, `:783–801`); die Schätzung bleibt keine sichere Vorabgrenze (F34).
- F22 — teilweise: 2,5 Zeichen/Token plus Messung ist als Steuerung ehrlich bezeichnet (Rev. 3 :162–173, :191–194), aber die Erkennen-Schicht ist weder vollständig noch backendübergreifend zuverlässig (F34/F35).
- F23 — teilweise: Neuberechnung nach jeder Nachricht ist vorgesehen (Rev. 3 :197–206); die 8.192-Reserve für unbegrenzte lokale Ausgaben ist keine echte Obergrenze (`app/src/main/llm/chatClient.ts:649–656`; F36).
- F24 — trägt: SheetJS und Buffer-Schnittstellen sind richtiggestellt; Teilstatus für PDF-/Excel-/PPTX-Grenzen steht im Plan (Rev. 3 :138–141, :243–253; `app/src/main/office/officeService.ts:32–35`, `:64–73`, `:770–773`).
- F25 — teilweise: Der vereinbarte Verzicht auf `openat` ist klar benannt (Rev. 3 :126–136), doch die Verengung auf einen doppelten Tausch im Millisekundenbereich gilt nicht für die Inventur (F32).
- F26 — trägt: erneuter `lstat`-/`realpath`-/`dev`-/`ino`-Vergleich vor Inventur und Read ist vorgesehen (Rev. 3 :111–114; bislang nur `stat` bei Registrierung: `app/src/main/noteAgent/contextFiles.ts:167–181`).
- F27 — trägt: die fünf Provider sind jetzt ausdrücklich auf Backend und Modell abgebildet (Rev. 3 :282–288; `app/src/shared/agentRoute.ts:15–26`, :42–64).
- F28 — trägt: `usage`/`promptTokens` sind optional behandelt und `tools: []` soll je Backend vorab getestet werden (Rev. 3 :290–297; `app/src/main/llm/chatClient.ts:743–749`, :850–854).
- F29 — trägt nicht: `min(contextLength, 32.768)` kann bei einem tatsächlichen 8k-Endpunkt 32k ergeben; die 95-%-Prüfung gegen diesen Wert erkennt dessen Mitte-Kürzung nicht zuverlässig (Rev. 3 :178–182; `app/src/shared/contextGuard.ts:14–20`; F35).
- F30 — trägt: Zeit-/Kostengrenze, fortlaufende Neuberechnung und unvollständiges Teilergebnis sind nun benannt (Rev. 3 :266–273; der heutige Agent-Request hat 600.000 ms Timeout: `app/src/main/noteAgent/loop.ts:264–270`).
- F31 — teilweise: `summary` statt 20.000 Einträge ist ein praktikabler Kern (Rev. 3 :274–280), aber nur registrierte Ergebnisse erscheinen als Karten (`app/src/main/noteAgent/runRegistry.ts:256–265`, :305–312); ein rein antwortender oder früh abgebrochener Lauf braucht einen eigenen Anzeigeweg.

### F32 — Inventur kann schon bei einfachem Verzeichnis-Tausch Namen preisgeben
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:106
Status: [OFFEN]
Die abgeschwächte Aussage beschreibt nur Datei-Reads. Eine rekursive Inventur muss nach `lstat` eines Zwischenordners `readdir` auf dessen Pfad aufrufen; der heutige Ordner-Enumerator arbeitet ebenfalls mit `fs.readdir` nach separater Pfadprüfung (`app/src/main/noteAgent/contextFiles.ts:300–305`, :612–614). Wird der Zwischenordner dazwischen gegen einen Symlink getauscht, können Namen und Metadaten außerhalb des Anhangs in Manifest/Zähler geraten, ohne dass ein Datei-Deskriptor geöffnet wird. Für diese Inventur genügt ein Tausch bis zur Auflistung; „doppelter Tausch im Millisekundenfenster“ (Rev. 3 :126–136, :349–351) beschreibt das Risiko zu eng. Vorschlag: an jeder `readdir`-Stelle erneut Identität und Containment prüfen und die Einschränkung auch für Inventur/Metadaten ausdrücklich benennen; Tests für Tausch zwischen `lstat` und `readdir`.

### F33 — Auswahl eines Punkt- oder `.mindgraph`-Roots ist nicht geregelt
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:101
Status: [OFFEN]
Das Segmentverbot gilt für `relPath` ab `rootReal` (Rev. 3 :102–109). Der Nutzer kann aber per Ordnerdialog einen Punkt-Ordner oder die Vault-`.mindgraph` selbst als **Root** auswählen; der Dialog erlaubt beliebige Verzeichnisse und `registerContextFolder` prüft heute nur `stat().isDirectory()` (`app/src/main/index.ts:4465–4488`; `app/src/main/noteAgent/contextFiles.ts:161–182`). Deren Kinder haben harmlose relative Segmente und würden trotz „nie `.mindgraph`“ inventarisiert. Vorschlag: bei Registrierung den gewählten Root und seine Vault-relativen Vorfahren gegen Punkt-/`.mindgraph`-Regel prüfen; für externe Dialog-Anhänge die gewünschte Root-Regel ausdrücklich festlegen und testen.

### F34 — 95 % `prompt_eval_count` ist ein Warnsignal, kein Kürzungsbeweis
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:162
Status: [OFFEN]
Ollama meldet `prompt_eval_count` nach dem Request (`app/src/main/llm/chatClient.ts:689–697`, :743–749). Ein vollständig verarbeiteter Prompt kann 95 % von `numCtx` belegen; umgekehrt kann nach Mitte-Kürzung der gemeldete Wert unter 95 % fallen. Der bestehende Wächter dokumentiert genau so einen Rückgang und lässt bei unklaren Signalen bewusst durch (`app/src/shared/contextGuard.ts:8–12`, :58–75). Zudem ist `JSON.stringify(tools)` nicht identisch mit den Wire-Werkzeugen samt `type`/`function`-Hülle und Rollen-Nachrichten (`chatClient.ts:660–680`, :783–801`). Die neue 95-%-Regel eignet sich als konservativer Stopp/Retry, aber nicht als „harte“ Erkennen-Schicht, die die 2,5er-Schätzung absichert. Vorschlag: als Kapazitätswarnung bezeichnen, nicht als Nachweis vollständiger Verarbeitung; Ollama-Grenztests mit vollständigem 95-%-Prompt und tatsächlich gekürztem Prompt unter 95 % vorsehen.

### F35 — OpenRouter-Endpunkt mit 8k entgeht dem geplanten 32k-Wächter
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:178
Status: [OFFEN]
`contextLength` ist ein optionaler Modellkatalog-Wert (`app/src/main/llm/chatClient.ts:1027–1044`), der Request legt keinen Endpunkt mit diesem Fenster fest (`:487–494`, :788–802). Ist der Katalogwert ≥32.768, setzt Rev. 3 ein 32k-Budget. Ein tatsächlich gewählter Endpunkt mit ≤8k kann laut bestehender Guard-Doku die Mitte still komprimieren (`app/src/shared/contextGuard.ts:14–20`); dessen gemeldete Prompt-Token erreichen 95 % von **32k** gerade nicht. „Katalog-Deckel plus 95-%-Regel fängt das ab“ (Rev. 3 :180–182) ist falsch. Vorschlag: diese Zusicherung streichen; bei nicht festgelegtem Endpunkt nur ein entsprechend kleineres konservatives Fenster verwenden oder den Endpunkt samt Kontextgröße bindend auswählen.

### F36 — Lokale Ausgabe-Reserve bleibt ohne Ausgabelimit eine Annahme
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:195
Status: [OFFEN]
Baustein C setzt für eigene Pakete `num_predict`/`maxTokens` auf 2.048 (Rev. 3 :243–247), aber der **Agent-Loop** bleibt bei Ollama ausdrücklich ohne `num_predict` (`app/src/main/llm/chatClient.ts:649–656`), bei LM Studio kann der OpenAI-kompatible Pfad `max_tokens` nur senden, wenn `opts.maxTokens` gesetzt ist (`:788–801`). Die 8.192-Token-Reserve in B ist daher keine obere Schranke für die nächste Agent-Antwort. Neuberechnung **nach** der Nachricht schützt nicht vor einer schon zu langen Antwort oder einem verlorenen Tool-Call. Vorschlag: wirksames Ausgabelimit für den Agent-Loop vorsehen oder den verbleibenden Kontext ohne behauptete 8.192-Garantie behandeln und bei knapper Reserve vor dem Request stoppen; Test mit langer lokaler Antwort.

### F37 — Budgetablehnung kann `collect_table` nach Datensatzanlage unbenutzbar machen
Schwere: hoch
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:201
Status: [OFFEN]
Baustein B lässt den Loop jedes zu große Werkzeugergebnis durch eine kurze Fehlermeldung ersetzen (Rev. 3 :201–206), nennt für Blätter aber nur Manifest, Inventur, Digest und Einzel-Lesen. `collect_table` registriert den Datensatz und markiert den Ordner als gesammelt, **bevor** es seinen Bericht liefert (`app/src/main/noteAgent/skills.ts:460–486`). Dieser Bericht kann trotz nur 20 Beispielzeilen und 30 Problemen bei langen Zellen/Spaltennamen groß werden (`app/src/shared/tableCollect.ts:438–495`). Wird er nachträglich abgelehnt, sieht das Modell die Datensatz-ID nicht; die Einzel-Lese-Sperre behandelt den Ordner dennoch als gesammelt (`skills.ts:379–391`). Das bricht gerade den bestehenden 60-Rückläufe-Weg. Vorschlag: `collect_table`-Antwort vor Registry-Mutation kompakt budgetieren bzw. blättern, oder bei Ablehnung die Mutation zurückrollen und die ID nie verstecken; Regressionstest mit 60 Tabellen und langem Bericht.

### F38 — Gemeinsame Vollbaum-Inventur kann bestehende Ordner-Läufe ausbremsen
Schwere: mittel
Stelle: docs/codex-collab/agent-rueckblick-unterordner.md:93
Status: [OFFEN]
Rev. 3 lässt **jeden** Verbraucher `inventoryFolder(entry)` über bis zu 20.000 Einträge nutzen (Rev. 3 :95–99, :143–153). Heute lesen `countFolderTables`, `readFolderFile` und `readFolderContext` nur die direkte Ebene (`app/src/main/noteAgent/contextFiles.ts:301–324`, `:386–390`, `:422–423`, `:612–614`); die Einzel-Lese-Sperre zählt vor jedem weiteren Read erneut Tabellen (`app/src/main/noteAgent/skills.ts:378–387`). Ein großer Baum würde vor jedem Stichproben-Read, Guard-Check oder Startkontext vollständig neu durchlaufen und kann die bewährten 60-Rückläufe-Läufe spürbar verlangsamen oder an der 20k-Schutzgrenze als unvollständig markieren. Vorschlag: eine laufbezogene Inventur mit Invalidierung und pro Datei frischer Sicherheitsprüfung spezifizieren; direkte-Ebene-Regression und 60-Tabellen-Latenz messen.

### F39 — Digest-Abdeckung lässt vorab gefilterte Dateien verschwinden
Schwere: hoch
Stelle: app/src/main/noteAgent/contextFiles.ts:1217
Status: [OFFEN]
`subfolder` und `kinds` filtern die Inventur vor dem Aufbau von `items`; `runFolderDigest` setzt `found` anschließend auf `read.items.length` und erstellt Status nur für diese Einträge (`app/src/main/noteAgent/folderDigest.ts:173–193`). Nicht gewählte Formate und Unterordner erscheinen weder als gefunden noch mit Filtergrund, obwohl der Plan für jede nicht gewählte Datei einen Grund verlangt (`docs/codex-collab/agent-rueckblick-unterordner.md:237–239`). Auch `unsupportedCount`, Symlinks und Punkt-Einträge der Inventur gehen in der Digest-Abdeckung verloren (`app/src/main/noteAgent/contextFiles.ts:1194–1199`, `app/src/main/noteAgent/folderInventory.ts:178–186`). Eine scheinbar vollständige Abdeckung kann damit nur den gefilterten Ausschnitt meinen, ohne dessen Umfang auszuweisen. Vorschlag: Inventur-Gesamtzahl und alle ausgeschlossenen Kategorien getrennt zählen; pro unterstützter Datei einen Status mit Filtergrund erzeugen und die Summe gegen die Inventur prüfen.

### F40 — Höchstens 15 Befunde pro Paket werden als vollständige Auswertung ausgewiesen
Schwere: hoch
Stelle: app/src/main/noteAgent/folderDigest.ts:132
Status: [OFFEN]
Der Map-Prompt begrenzt die Antwort auf 15 Befunde, auch wenn ein Paket viele Dateien und mehr als 15 einschlägige Ereignisse enthält (`app/src/main/noteAgent/folderDigest.ts:118–136`). Nach jeder gültig formatierten Antwort gelten alle betroffenen Dateien als `ausgewertet` beziehungsweise `abschnitte`, unabhängig davon, ob ihr Inhalt in einem Befund vorkommt (`:283–289`, `:190–193`). Die GUI-Gegenprobe mit drei Markern prüft diesen Fall nicht (`docs/codex-collab/agent-rueckblick-unterordner.md:809–815`). Für Fragen wie „alle Zusagen“ geht Inhalt damit still verloren. Vorschlag: Pakete auch nach erwartbarer Befundzahl begrenzen oder pro Datei eine explizite Auswertungsentscheidung verlangen; Überhang als unvollständig ausweisen und mit einem Test mit mehr als 15 relevanten Befunden prüfen.

### F41 — Abschnitts-Fundstellen lassen sich syntaktisch erfinden
Schwere: mittel
Stelle: app/src/shared/folderDigest.ts:200
Status: [OFFEN]
`validateFindings` akzeptiert `[Datei#999]`, sobald `[Datei]` erlaubt ist, weil der `#n`-Suffix vor der Prüfung entfernt wird. Im Reduce erlaubt `allRefsOf` zudem pauschal `#1` bis `#20` für jede Gruppendatei, ohne die tatsächlich gebildeten Abschnitte zu prüfen (`app/src/main/noteAgent/folderDigest.ts:302–303`, `:316–319`). Die Behauptung „Fundstellen sind geprüft“ in der Werkzeugantwort (`:340–342`) ist damit für Abschnittsnummern zu stark. Vorschlag: ausschließlich die in den jeweiligen Paketen tatsächlich erzeugten Referenzen zulassen; Reduce-Referenzen aus validierten Map-Befunden ableiten.

### F42 — Eine überlange Zeile sprengt das Digest-Paket trotz Teilungsregel
Schwere: hoch
Stelle: app/src/shared/folderDigest.ts:171
Status: [OFFEN]
Wenn eine einzelne Zeile das Paketbudget übersteigt, gibt `linesFittingTokens` null zurück; `splitIntoPieces` nimmt dann dennoch die ganze Zeile. `buildPackages` übernimmt auch ein bereits übergroßes einzelnes Stück (`app/src/shared/folderDigest.ts:151–158`). Im Map-Lauf kann der Kürzungsverdacht ein Paket mit nur einem Stück nicht halbieren und markiert dessen Datei als Fehler (`app/src/main/noteAgent/folderDigest.ts:258–271`). Eine minifizierte HTML-Datei, eine CSV-Zeile oder ein langer Absatz wird deshalb weder vollständig ausgewertet noch in handhabbare Abschnitte geteilt. Vorschlag: lange Zeilen zusätzlich an Zeichen- oder Tokengrenzen schneiden, die echte Paketgröße vor dem Aufruf prüfen und diesen Grenzfall testen.

### F43 — Digest-Rückgabe kann das verbleibende Agent-Budget überschreiten
Schwere: hoch
Stelle: app/src/main/noteAgent/folderDigest.ts:304
Status: [OFFEN]
`limit()` beträgt mindestens 500 Token, selbst wenn `maxResultTokens()` null oder nur wenige Token meldet. Die abschließende Kürzung prüft nur `render()`, nicht den fertigen Werkzeugtext mit Frage, Einleitung, Abdeckung und Handlungsanweisung (`app/src/main/noteAgent/folderDigest.ts:327–345`); eine einzelne lange Zeile bleibt durch `keep >= 1` ebenfalls erhalten. Im Loop gehört `folder_digest` zu `LOCK_ONLY_TOOLS` und seine Antwort wird nach dem Lauf nicht gegen `maxToolResultTokens` geprüft (`app/src/main/noteAgent/loop.ts:34–35`, `:419–435`). Damit kann der Digest den nächsten Prompt trotz Budgetsteuerung überfüllen. Vorschlag: den vollständigen Rückgabetext vor dem Anhängen gegen das aktuelle Budget prüfen; bei Platzmangel ein kurzes, sichtbares Teilresultat oder einen geblätterten Abruf liefern.

### F44 — `collect_table` garantiert die Berichtgröße nach der Registrierung nicht
Schwere: hoch
Stelle: app/src/main/noteAgent/skills.ts:554
Status: [OFFEN]
Nach `registerDataset` probiert `collect_table` nur vier feste Berichtvarianten und gibt die letzte selbst dann zurück, wenn sie das Limit weiter überschreitet (`app/src/main/noteAgent/skills.ts:543–565`). Der Loop begrenzt `LOCK_ONLY_TOOLS` nachträglich absichtlich nicht (`app/src/main/noteAgent/loop.ts:34–35`, `:419–435`). Lange Spaltennamen, Probleme oder ein sehr kleines Restbudget reichen dafür aus; die Datensatz-ID bleibt zwar sichtbar, aber die Zusage „verdichtet sich, bis es ins Budget passt“ ist nicht erfüllt (`docs/codex-collab/agent-rueckblick-unterordner.md:786–789`). Der Test nutzt nur 12 statt 60 Dateien und ein 900-Token-Limit (`app/src/main/noteAgent/collectBudget.test.ts:14–40`). Vorschlag: eine garantiert begrenzte Minimalantwort mit ID, Zeilenzahl und Abrufhinweis vorsehen; 60 Rückläufe und sehr kleine Restbudgets prüfen.

### F45 — Datei kann nach der Größenprüfung am Handle wachsen
Schwere: mittel
Stelle: app/src/main/noteAgent/folderInventory.ts:145
Status: [OFFEN]
`readFileInFolder` prüft `fstat().size` vor `fh.readFile()`, kontrolliert danach aber weder die gelesene Bytezahl noch die Dateigröße oder Änderungszeit (`app/src/main/noteAgent/folderInventory.ts:145–158`). Ein anderer Prozess kann dieselbe Inode während des Lesens vergrößern oder überschreiben; `dev/ino` und die Pfad-Nachprüfung bleiben dabei gleich. So können `maxBytes` und die Annahme einer stabilen Momentaufnahme unterlaufen werden. Das ist unabhängig vom bereits ausdrücklich akzeptierten Zwischenordner-Tausch (Modulkopf :9–15). Vorschlag: aus dem Handle höchstens `maxBytes + 1` Bytes lesen und Überschreitung ablehnen; nach dem Lesen `fstat` und Änderungsmerkmale erneut prüfen oder Änderungen sichtbar als unvollständig melden.

### F46 — Inventur verschweigt verschwindende Dateien
Schwere: mittel
Stelle: app/src/main/noteAgent/folderInventory.ts:277
Status: [OFFEN]
Nach erfolgreichem `readdir` und Verzeichnis-Nachcheck kann `lstat` für einen gemeldeten Dateinamen fehlschlagen oder einen anderen Typ sehen; beide Fälle werden kommentarlos übersprungen (`app/src/main/noteAgent/folderInventory.ts:239–243`, `:277–285`). `inv.incomplete` bleibt leer, sodass Manifest und Digest eine vollständige Inventur melden können, obwohl ein währenddessen bewegter Eintrag fehlt (`app/src/main/noteAgent/contextFiles.ts:1244`, `app/src/main/noteAgent/folderDigest.ts:190–194`). Vorschlag: solche Änderungen als `incomplete: changed` markieren und bei Bedarf neu inventarisieren; einen Datei-Austausch während der Inventur testen.

### F47 — Der Digest hält alle extrahierten Texte gleichzeitig im Speicher
Schwere: hoch
Stelle: app/src/main/noteAgent/contextFiles.ts:1218
Status: [OFFEN]
`readFolderSourcesForDigest` liest und parst alle ausgewählten Dateien nacheinander und behält jeden extrahierten Volltext in `items`; `runFolderDigest` kopiert diese Texte danach in `sources`, bevor das erste Paket ans Modell geht (`app/src/main/noteAgent/contextFiles.ts:1218–1244`, `app/src/main/noteAgent/folderDigest.ts:173–209`). Die 20.000-Einträge-Inventurgrenze und Dateiobergrenzen begrenzen weder die Summe der dekodierten Texte noch Parser-Zwischenobjekte (`app/src/main/noteAgent/folderInventory.ts:27–29`, `app/src/main/noteAgent/contextFiles.ts:724–767`). Große Ordner können so vor der 40-Aufruf-Prüfung den Main-Prozess erschöpfen. Vorschlag: Dateien paketweise lesen und nach Map freigeben oder eine explizite Gesamt-Speichergrenze mit sichtbarem Teilstatus einführen; einen großen Mischordner als Lasttest aufnehmen.

### F48 — Reduce umgeht die eigene Kürzungs- und Fehlerbehandlung
Schwere: mittel
Stelle: app/src/main/noteAgent/folderDigest.ts:316
Status: [OFFEN]
Map-Aufrufe prüfen `looksTruncated`, halbieren Pakete und markieren Fehler (`app/src/main/noteAgent/folderDigest.ts:253–281`). Die zusätzlichen Reduce-Aufrufe verwenden weder diese Prüfung noch einen Fehlerpfad mit Teilergebnis (`:313–324`). Eine gekürzte, aber plausibel formatierte Reduce-Antwort kann frühere Befunde still ersetzen; bei einem Requestfehler verwirft der Tool-Catch den bereits erstellten Digest vollständig (`app/src/main/noteAgent/skills.ts:597–610`). Vorschlag: auch Reduce-Antworten auf Kürzung prüfen und bei Fehlern die bisherigen validierten Befunde samt unvollständiger Abdeckung zurückgeben; entsprechende Tests ergänzen.

### F49 — Nutzerabbruch liefert die versprochene Teilabdeckung nicht
Schwere: niedrig
Stelle: app/src/main/noteAgent/folderDigest.ts:242
Status: [OFFEN]
Der Plan verspricht bei Abbruch die bisherigen Gruppen mit Status „unvollständig“ (`docs/codex-collab/agent-rueckblick-unterordner.md:274–280`). Tatsächlich wirft der Map-Loop bei `signal.aborted`; die Lesephase wirft ebenfalls (`app/src/main/noteAgent/contextFiles.ts:1219–1220`), und `skills.ts` macht daraus nur `Fehler: Abgebrochen` (`app/src/main/noteAgent/skills.ts:609–610`). Bereits validierte Befunde und die Abdeckung werden nicht zurückgegeben. Vorschlag: die bisherige Auswertung auf Abbruch als unvollständiges Teilergebnis serialisieren oder die Planzusage ausdrücklich zurücknehmen.

## Claude-Antwort

Runde 1 beantwortet am 05.10.2026. Alle Befunde gegen den Code nachgeprüft; keinen halte ich für
falsch. Der Nutzer hat entschieden: Plan umbauen (Rev. 2), dann zweite Runde. Kein Code.

- **F01 [ADRESSIERT]** Ziel neu gefasst (allgemein, alle Formate, Vollständigkeitsvertrag).
  `digest_folder` wird `folder_digest` mit Pflicht-`question` und `group_by: subfolder|…|none`,
  alle lesbaren Formate (Baustein C).
- **F02 [ADRESSIERT]** Gemeinsame Inventur für Manifest, Lesen, Zähler, `collect_table`;
  Herkunft je Zeile als `relPath` (Baustein A).
- **F03 [ADRESSIERT]** Baum-Manifest mit Zählern, Einzelzeilen nur per `subfolder`, alles
  geblättert; Ergebnis-Obergrenze im Loop (Baustein B).
- **F04 [ADRESSIERT]** Allgemeine Lesesperre unter 15 % Restbudget zusätzlich zur Tabellenregel;
  `read_context_file` blättert (Baustein B).
- **F05 [ADRESSIERT]** `rootReal` + `dev`/`ino` beim Anhängen, Segment-weises `lstat`, Endvergleich
  gegen den Anhang, auch für Dialog-Anhänge (Baustein A).
- **F06 [ADRESSIERT, Rest benannt]** Deskriptor-Lesen mit `O_NOFOLLOW` + `dev`/`ino`-Vergleich,
  Parser auf Buffer. Restfenster für Zwischenordner (kein `openat` in Node) ausdrücklich benannt.
- **F07 [ADRESSIERT]** Inventur zählt bis zur Schutzgrenze und markiert sonst „unvollständig“ mit
  Ort; Bearbeitungsgrenzen getrennt.
- **F08 [ADRESSIERT]** Paketgröße aus dem echten Fenster samt Reserven; Zusammenführen ohne feste
  Ebenenzahl; Aufrufgrenze vorab statt Abbruch mittendrin.
- **F09 [ADRESSIERT]** Budget rechnet mit gemeldeten Prompt-Token der letzten Iteration plus
  Angehängtem, also mit der ganzen Historie.
- **F10 [ADRESSIERT]** Fenster je Backend: Ollama `numCtx`, OpenRouter `contextLength` (gedeckelt),
  sonst 32 768 mit sichtbarem Hinweis.
- **F11 [ADRESSIERT]** Auswertung über `chatWithTools` mit leerer Werkzeugliste (liefert `usage`),
  `ctx.recordUsage` → `callUsages`.
- **F12 [ADRESSIERT]** Hard-Lock-Satz gestrichen.
- **F13 [ADRESSIERT]** Werkzeug prüft Backend/Modell gegen `run.route`; Test.
- **F14 [TEILWEISE ADRESSIERT]** Statusliste je Datei, Abschnitte statt „nur Anfang“, Fundstellen
  deterministisch gegen das Paket geprüft. Inhaltliche Aussageprüfung bewusst später — eine
  Wortdeckungsprüfung für Zusammenfassungen ist ein eigenes Messprojekt.
- **F15 [ADRESSIERT durch Verschieben]** Einzeln übernehmbare Gruppenkarten nach „Später“, mit
  dem Hinweis auf `registerResult` und geprüfte Namen.
- **F16 [ADRESSIERT]** Priorität festgelegt (nach Tabellen/Shell/Web/Dokument, vor `write_note`),
  Tests für die Folgen.
- **F17 [ADRESSIERT]** Testliste um Systemgrenzen erweitert (Inventur, Austausch, Dialog-Anhang,
  gewachsener Loop, Route, Abbruch).
- **F18 [ADRESSIERT]** Auto-Kontext meldet Unterordner, leere direkte Ebene ist kein Fehler.
- **F19 [ADRESSIERT]** Allowlist, Entscheidungsregel im Ordner-Prompt und Manifest-Hinweis
  kommen mit Baustein C, nicht erst mit einem Skill.
- **F20 [ADRESSIERT]** Kern (A, B, C) getrennt von „Später“ (Karten, Wiederaufnahme, Skill,
  Aussageprüfung). Datenweg-Satz bleibt im Kern, weil er einen neuen Datenweg ankündigt.

### Runde 2 (05.10.2026)

Alle Belege F21–F31 nachgeprüft (u. a. `officeService.ts:32-35`, `agentRoute.ts:18-26`,
`chatClient.ts:743-749`, `index.ts:4743`). Keiner falsch.

- **F06 / F25 [ADRESSIERT durch Abschwächen, Nutzerentscheidung]** Meine Rev.-2-Aussage
  „fail-closed“ war falsch. Rev. 3: Nachprüfung nach dem Lesen, Restfall (doppelter Tausch eines
  Zwischenordners) offen benannt, kein natives Modul, Doku verspricht nicht mehr.
- **F26 [ADRESSIERT]** Anhang-Identität (`lstat`, `dev`/`ino`, `realpath`) vor jeder Inventur und
  jedem Lesen.
- **F21 / F22 [ADRESSIERT]** Neuer Grundsatz „Budget steuert, Erkennen sichert“. Schätzung über den
  vollständigen Wire-Prompt inkl. Tool-Schema-JSON, 2,5 Zeichen/Token mit Kalibrierung an drei
  echten Läufen vor Baustein B; Überlauf-Wächter zusätzlich in jedem Auswertungsaufruf, neue
  95-%-Regel, Paket halbieren bei Verdacht.
- **F23 [ADRESSIERT]** Neu rechnen nach jeder Nachricht, Ablehnungstexte zählen, Ausgabe-Reserve
  8 192, Stopp vor dem Senden.
- **F24 [ADRESSIERT]** SheetJS korrigiert; eigene Digest-Lesegrenzen, Teilstatus je Format mit
  Angabe, Teilstatus zählt nie als vollständig.
- **F27 [ADRESSIERT]** Feste Zuordnung `provider` → Backend, Tests für alle fünf Anbieter.
- **F28 [ADRESSIERT]** Formulierung korrigiert; fehlende `usage`/`promptTokens` = unbekannt;
  Vorab-Test `tools: []` je Backend.
- **F29 [ADRESSIERT]** OpenRouter: `min(contextLength, 32 768)`, Katalog nur als Deckel nach unten.
- **F30 [ADRESSIERT]** Map exakt gezählt, Reduce als Untergrenze; Neuberechnung nach jedem Schritt;
  harte Grenze beendet mit Teilergebnis „unvollständig“; Dauer-Schätzung vorab; Grenze nach
  Messung neu festlegen.
- **F31 [ADRESSIERT]** Karte: Zähler + bis zu 50 nicht vollständig gelesene Dateien über `summary`;
  vollständige Liste nach „Später“.
- Zu den „teilweise“-Vermerken F01/F04/F05/F08/F09/F13/F17: durch F21–F30 mit abgedeckt; F14 bleibt
  bewusst „technische Leseabdeckung“, die Aussageprüfung steht unter „Später“.

### Runde 3 (05.10.2026)

Nutzerentscheidung vorab (Variante a): nach Runde 3 wird Baustein A umgesetzt. Befunde zu A
fließen in die Umsetzung ein, Befunde zu B/C bleiben bis zu deren Umsetzung offen.

- **F32 [ADRESSIERT in A]** Inventur prüft jeden Unterordner vor UND nach `readdir` (`lstat` ohne
  Symlink, `dev`/`ino` unverändert, `realpath` im Anhang); weicht etwas ab, wird die Auflistung
  dieses Ordners verworfen und die Inventur als unvollständig markiert. Das Restrisiko (doppelter
  Tausch zwischen den Prüfungen) ist im Code an der Inventur- UND an der Lesestelle benannt.
- **F33 [ADRESSIERT in A]** Regel beim Anhängen: Ordner, deren eigener Name mit Punkt beginnt,
  werden abgelehnt; bei Vault-Anhängen zusätzlich jedes vault-relative Segment mit Punkt (deckt
  `.mindgraph` und alles darunter). Externe Dialog-Anhänge: nur der eigene Name zählt — die
  Vorfahren hat der Nutzer im OS-Dialog bewusst gewählt.
- **F38 [ADRESSIERT in A]** Inventur je Anhang 15 s zwischengespeichert (laufbezogen, kein
  Dauer-Cache); die Sicherheitsprüfung je Datei läuft bei jedem Lesen frisch. Flache Ordner: der
  relative Pfad ist der Dateiname, bestehende Abläufe sehen dieselben Namen.
- **F34, F35, F36 [OFFEN bis Baustein B]** Werden vor B beantwortet; Richtung: 95-%-Regel heißt
  „Kapazitätswarnung“, OpenRouter ohne festgelegten Endpunkt vorsichtiger als 32k, keine
  behauptete Ausgabegarantie ohne gesetztes Limit.
- **F37 [OFFEN bis Baustein B]** Wichtig für B: `collect_table`-Bericht darf nie nachträglich
  abgelehnt werden, wenn der Datensatz schon registriert ist.

### Baustein B umgesetzt (05.10.2026) — Antworten F34–F37

**Eichung vor B (F22, Plan-Vorgabe):** Ollama `prompt_eval_count` gegen Zeichen, drei Modelle
(qwen3.6:35b-a3b, qwen3.8:27b, gemma4:12b; qwen-Varianten identisch). Zeichen pro Token:
Fließtext DE 3,27–3,36 · Werkzeug-JSON 3,56–3,64 · **Tabelle 1,86 · Pfadliste 1,30–1,33**.
Rev. 3 mit festen 2,5 Zeichen/Token hätte Manifeste und Tabellen um fast die Hälfte unterschätzt —
genau das, was die Ordner-Werkzeuge liefern. Deshalb Schätzung nach Zeichenarten:
`Buchstaben/2,9 + Ziffern·1,4 + Satzzeichen·0,65 + Umbrüche`. Überschätzt auf den Eichtexten
8–37 %, in der Gegenprobe (CHANGELOG, TS-Code, Journal, englischer Text; zusätzlich llama3.1 mit
anderem Tokenizer) 15–71 %, unterschätzt nie. Cloud/LM Studio nicht gemessen (kein Schlüssel) —
dort korrigiert die gemeldete Prompt-Token-Zahl ab der zweiten Iteration.

- **F34 [ADRESSIERT]** Keine eigene 95-%-Regel. Nach jeder Server-Meldung ist der Verbrauch exakt,
  und der Loop stoppt VOR dem Senden, wenn weniger als 2 048 Token für eine Antwort frei sind
  (`hasRoomForNextCall`) — laut, mit Hinweis zum Aufteilen. Das ist die Kapazitätsgrenze, nicht
  ein Kürzungsnachweis; der Überlauf-Wächter bleibt als harte Erkennung unverändert.
- **F35 [ADRESSIERT]** OpenRouter-Agent-Läufe senden `transforms: []` (`disableMiddleOut`) — ein
  Überlauf an einem ≤ 8k-Endpunkt wird damit zum Fehler statt zur stillen Mitten-Kürzung. Fenster
  für alle Nicht-Ollama-Wege fest 32 768 („angenommen“, im Lauf-Protokoll genannt), kein
  Katalogwert. UNGEPRÜFT gegen einen echten ≤ 8k-Endpunkt (kein Schlüssel) — im Code vermerkt.
- **F36 [ADRESSIERT durch Ehrlichkeit]** Kein neues lokales Ausgabelimit (bewusste Entscheidung in
  `index.ts`). Die 8 192 sind eine Planungsgröße: ab dort sperrt das Lesen; die Garantie bleibt der
  Stopp vor dem Senden + Überlauf-Wächter.
- **F37 [ADRESSIERT]** Der Loop lehnt nur Werkzeuge OHNE Nebenwirkung nachträglich ab
  (`BUDGETED_READ_TOOLS`). `collect_table` wird vor dem Lauf gesperrt (vor jeder Registrierung)
  und verdichtet seinen Bericht danach selbst (20 → 8 → 3 → 0 Beispielzeilen), die Datensatz-ID
  steht immer drin (`collectBudget.test.ts`).

Umsetzung: `shared/contextBudget.ts` (rein, getestet), `loop.ts` (Budget nach jeder Nachricht,
Lesesperre, Ablehnung zu großer Leseergebnisse, Stopp vor dem Senden), `read_context_file` blättert
nach Budget (`maxTokens`), `collect_table` verdichtet, `chatClient.ts` `disableMiddleOut`.

### Baustein C umgesetzt (05.10.2026)

`shared/folderDigest.ts` (rein: Datierung Frontmatter > Name > Pfad, nie mtime; Gruppen
Monat/Woche/Quartal/Unterordner; Pakete an Dateigrenzen, große Dateien in Abschnitte `Pfad#n`;
Fundstellen-Prüfung; Abdeckung), `main/noteAgent/folderDigest.ts` (Werkzeug: Lesen über die
Inventur aus A mit eigenen Grenzen und Teilstatus, Paketgröße aus dem Fenster des Modellwegs
höchstens 12 000 Token, werkzeuglose Auswertungsaufrufe über denselben Modellweg mit
`num_predict`/`max_tokens` 2 048, Erkennen-Schicht = Überlauf-Wächter je Aufruf → Paket halbieren,
Aufrufgrenze 40 Pakete vorab / 50 gesamt mit Teilergebnis, Zusammenführen bis ins Budget,
Modellweg-Prüfung gegen `run.route`, Verbrauch über `ctx.recordUsage`). Allowlist, Ordner-Prompt
(Entscheidungsregel), Manifest-Hinweis ab 15 Nicht-Tabellen, Arbeitsart `summary` nachrangig,
Datenweg-Satz auf der Karte (DE/EN). Dazu: `note_search`-Treffer und `note_read`-Notizen außerhalb
der angehängten Ordner werden markiert (Nutzerentscheidung: Transparenz statt Sperre).

**GUI-Gegenprobe C (Computer use):** derselbe Auftrag auf Journal-Gross (88 Einträge, ~45 000
Token). Der Agent wählte `folder_digest` selbst (group_by Monat), las 88/88 Dateien, drei
Auswertungsaufrufe (je Monat), las danach die drei Marker-Einträge gezielt nach und schrieb die
Notiz, ~5 min. Ergebnis: alle drei BESONDERS-Marker mit richtigem Thema, neun Stichproben-Daten
korrekt, keine Einträge aus dem anderen Ordner, nichts erfunden. Rest: Die Notiz nennt die
Abdeckung nur vage (die genaue Zeile steht in den Quellen der Karte) — das Modell folgte der
Anweisung „Abdeckung nennen“ nicht wörtlich.

### Runde 4 — Antworten F39–F49 (05.10.2026, Code-Prüfung)

Alle elf Befunde am Code nachgeprüft: alle tragen. Nutzer: „alle 11“.

- **F39 [ADRESSIERT]** `readFolderSourcesForDigest` zählt per `subfolder`/`kinds` Ausgefiltertes (`excludedBySubfolder`, `excludedByKind`) sowie andere Formate, versteckte Einträge und Verknüpfungen. `found` umfasst jetzt alle lesbaren Dateien des Ordners, Ausgefiltertes steht mit Grund in „Ausgelassen“, Nicht-Lesbares in einer eigenen Zeile (`formatCoverage`). Test: `folderDigest.test.ts` „zählt per kinds/subfolder …“, `shared/folderDigest.test.ts` „zählt vorab Ausgefiltertes …“.
- **F40 [ADRESSIERT]** Die Grenze „höchstens 15 Befunde“ ist aus dem Map-Prompt entfernt („Nenne JEDEN einschlägigen Befund“). `ChatWithToolsResult.outputCut` (Ollama `done_reason`, OpenAI `finish_reason` = `length`) halbiert das Paket. Ist es nicht mehr teilbar, bleiben die gültigen Befunde, und die Dateien gelten als „teilweise“ statt „ausgewertet“. **GUI-Befund dazu:** Bei 30 Einträgen lieferte qwen3.6 **0 Zeichen**, weil das Denken die 2048 Ausgabe-Token verbrauchte. Die neue Erkennung meldete ehrlich „teilweise“. Behoben mit `ChatOptions.ollamaThink: false` nur für die Auswertungsaufrufe. Danach: ein Paket, 30/30 vollständig, alle 30 Zusagen korrekt gegen die Testdaten geprüft.
- **F41 [ADRESSIERT]** `validateFindings` lässt nur exakte Fundstellen zu (kein Abschneiden von `#n`). Beim Reduce sind nur die Fundstellen des jeweiligen Bündels erlaubt (`refsInFindings`), keine pauschalen `#1–#20`.
- **F42 [ADRESSIERT]** `splitLongLine` teilt überlange Zeilen per binärer Suche an Zeichengrenzen, jedes Stück passt ins Budget, zusammengesetzt ergibt sich wieder die Zeile. Test mit minifiziertem HTML.
- **F43 [ADRESSIERT]** Gegen das Budget wird der ganze Rückgabetext gemessen (Kopf, Hinweis, Abdeckung, Schluss), nicht nur der Befundteil. Die Untergrenze von 500 entfällt. Stufen: kürzere Fehlerliste, dann eine kompakte Antwort mit Abdeckungszeile. Zusätzlich kürzt der Loop `LOCK_ONLY_TOOLS` als letzte Sicherung sichtbar. Test mit Budgets 900/250/60.
- **F44 [ADRESSIERT]** `collect_table` hat nach den vier Varianten eine garantiert kurze Minimalantwort (ID, Zeilen/Dateien/Spalten, Hinweis bei Obergrenze, `dataset="…"`). Test mit 120 Token. Zusätzlich die Sicherung im Loop (siehe F43).
- **F45 [ADRESSIERT]** `readFileInFolder` liest höchstens `maxBytes + 1` und vergleicht danach `fstat` (Größe, mtime, gelesene Bytes). Ohne Test (Wettlauf nicht deterministisch herstellbar).
- **F46 [ADRESSIERT]** Scheitert `lstat` nach `readdir` oder hat der Eintrag einen anderen Typ, setzt das `incomplete: changed`. Ohne Test (ebenfalls ein Wettlauf).
- **F47 [ADRESSIERT]** Der Zeitraum-Filter läuft beim Lesen (`admit`), ausgefilterte Texte bleiben nicht im Speicher. `maxTotalTokens` = 40 × Paketgröße × 1,25 beendet das Lesen vorzeitig mit Ablehnung und Weg zum Eingrenzen. Dabei fiel auf: Bei kleinem Fenster wurde die Paketgröße negativ, deshalb gilt jetzt `MIN_PACKAGE_TOKENS` (1000) mit eigener Ablehnung. Tests für beides.
- **F48 [ADRESSIERT]** Reduce: Bei Fehler, Kürzungsverdacht oder abgeschnittener Antwort bleibt das Bündel unverändert, die Auswertung geht nie verloren. Test „ein fehlschlagendes Zusammenführen …“.
- **F49 [ADRESSIERT — Planzusage zurückgenommen]** Ein Abbruch durch den Nutzer beendet den ganzen Agent-Lauf (`loop.ts` wirft nach jedem Werkzeug bei `signal.aborted`). Ein Teilergebnis hätte also keinen Empfänger. Die Zusage „bisherige Gruppen als unvollständig“ gilt nur für Modellfehler und die Aufrufgrenze (dort umgesetzt). Begründung steht als Kommentar im Map-Loop.

**Neuer Befund aus der GUI-Probe (offen, nicht behoben):** Ohne den Hinweis „nutze folder_digest“ las qwen3.6 einmal alle 30 Dateien einzeln (mehrere pro Schritt) und schrieb eine Excel-Liste mit 30 korrekten Zeilen, aber einem falschen Begleitsatz („7 Personen“ statt 10). Die Werkzeugwahl ist also nicht stabil. Das ist kein Fehler im Code, die Entscheidungsregel im Prompt wirkt aber nicht zuverlässig.

typecheck/build grün, `npm run test` 2684 grün, 1 bekannter Ausreißer (`shellExecution.test.ts` Umgebungsprobe, Zeitüberschreitung unter Last).

### Werkzeugwahl folder_digest vs. Einzellesen (05.10.2026)

Anlass: In der GUI las qwen3.6 bei „Liste alle Zusagen …“ einmal 30 Dateien einzeln. Messung mit
`app/scripts/agent-tool-choice-probe.ts`: echter Systemprompt (`buildSystemPrompt`, dafür exportiert),
echte Werkzeuge, echtes Manifest, gemessen wird nur der Schritt nach `list_context_folder`.
qwen3.6:35b-a3b-nvfp4 lokal, 5 Wiederholungen je Fall, Test-Vault (synthetisch).

| Fall | Ausgang | Variante B |
|---|---|---|
| 30 Zusagen, „Liste alle … auf“ | 3/5 folder_digest | 5/5 |
| 88 Einträge, Jahreszusammenfassung | 5/5 | 5/5 |
| 9 Einträge, „Fasse zusammen“ (beides richtig) | 1/5 Digest | 2/5 Digest |

Ursache: Schritt (2) der Ordner-Anleitung zeigte pauschal aufs Einzellesen („read_context_file für
die Dateien, die du wirklich brauchst — einzeln“), und als Beispiele für folder_digest standen nur
Rückblick/Zusammenfassung — Auflistungsaufträge kamen nicht vor. Variante B setzt die Wahl in
Schritt (2) (folder_digest bei allen/vielen Dateien inkl. „alles auflisten, alle X finden“, sonst
collect_table bzw. read_context_file) und spiegelt das im Manifest-Hinweis.
Grenzen: ein Modell, n = 5; kein deterministischer Riegel (eine Einzel-Lese-Sperre wie bei
collect_table wäre die nächste Stufe, falls andere Modelle weiter einzeln lesen).

## Status

Rev. 3, drei Codex-Runden. **Baustein A umgesetzt (05.10.2026), committet `627702d6`:**
`main/noteAgent/folderInventory.ts` (neu: Anhang-Identität, Inventur mit Prüfung vor/nach
`readdir`, Lesen über Deskriptor mit Nachprüfung, Restrisiko im Modulkopf benannt),
`contextFiles.ts` (alle Ordner-Werkzeuge auf der gemeinsamen Inventur, Manifest als Liste bzw.
Übersicht in 100er-Seiten mit `subfolder`/`offset`, Pfade statt Dateinamen, Auto-Kontext meldet
Unterordner statt Fehler), `office/officeService.ts` (Parser nehmen Buffer), `skills.ts`
(Werkzeugbeschreibungen, Manifest-Ausgabe), `loop.ts` (Prompt: Unterordner gehören dazu).
Tests: `folderInventory.test.ts` (neu), `contextFiles.test.ts` (+5 Fälle). typecheck/build grün,
`npm run test` grün bis auf den vorbestehenden Zeitüberschreitungs-Ausreißer in
`shellExecution.test.ts` (tritt auch ohne die Änderung auf).

**GUI-Gegenprobe (Computer use, Dev-App, Testprofil, Test-Vault):** Journal nur mit Monatsordnern
(9 Einträge in `2026/01–03`), Auftrag „Jahreszusammenfassung“, qwen3.6:35b-a3b lokal. Agent
listet den Ordner, liest alle 9 Einträge per Pfad, schreibt eine korrekte Monatsübersicht in
~2,5 min, kein Überlauf. Beobachtung: zweimal kürzte das Modell Pfade (`2026/03/19.md`); die
Fehlermeldung mit den verfügbaren Pfaden führte sofort zur Korrektur. Möglicher Feinschliff:
bei Nicht-Treffer die ähnlichsten Pfade zuerst nennen statt die ersten 30.

**Baustein B umgesetzt (05.10.2026), committet `9ba4c42e`** — siehe Claude-Antwort „Baustein B umgesetzt“.

**GUI-Gegenprobe B (Computer use, 05.10.2026):** Journal-Gross, 88 Einträge à ~1 500 Zeichen in
`2026/01–03` (~45 000 Token, passt bewusst nicht in 32k), qwen3.6:35b-a3b lokal, 32 Schritte, ~4 min.
Technisch wie geplant: zwei Leseergebnisse abgelehnt („Platz für 114 / 25 Token“), dann
Lesesperre „Kontext fast voll“, danach `write_note` mit Hinweis auf nicht gelesene Einträge. Kein
Überlauf-Abbruch, kein stilles Kürzen.
**Inhaltlich schwach — Beleg für Baustein C:** Das Modell las Stichproben statt aller Einträge
(Suchen + ~15 Dateien), verpasste den Marker 02-13, mischte über `note_search`/`note_read`
Einträge aus dem ANDEREN Ordner `Journal/` ein (die Vault-Suche ist nicht auf den Anhang
begrenzt) und erfand ein Detail („Laubholzer Weg“). Die Lückenangabe blieb vage („nicht alle
Einträge“). Ein Budget verhindert den Überlauf, macht aber aus Stichproben keine Vollständigkeit —
das kann nur die Verdichtung durch die App (`folder_digest`).

**Baustein C umgesetzt (05.10.2026), committet `d11db8cc`.** Offen aus „Später“: einzeln übernehmbare Gruppenkarten, Wiederaufnahme, Starter-Skill „Rückblick“, inhaltliche Befundprüfung.

**Runde 4 (05.10.2026): Code-Prüfung A+B+C** gegen `627702d6..d11db8cc` (Diff `git diff 41b60dca..d11db8cc`). Findings ab F39. Alle elf umgesetzt (05.10.2026), nicht committet.
