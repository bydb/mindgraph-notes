# Review — Notiz-Agent-Harness

## Aufgabe

Adversariales Review von `docs/note-agent-harness-plan.md` gegen den tatsächlichen Code.
Fokus: Privacy-Gates, Pfadgrenzen, Staging/Übernahme, Sync, Wiederverwendung des Agent-Loops,
Abbruchverhalten und Zustandslebenszyklus.

## Kontext/Anker

- Plan: `docs/note-agent-harness-plan.md` (Stand 2026-07-03)
- Pfadgrenze/Schreibgrenze: `app/src/main/index.ts:1048`, `app/src/main/index.ts:1103`
- Inline-Notiz-KI: `app/src/main/index.ts:3858`, `app/src/renderer/components/Editor/MarkdownEditor.tsx:1806`
- Telegram-Agent: `app/src/main/telegram/agent/loop.ts`, `app/src/main/telegram/agent/tools/registry.ts`
- Chat-Client: `app/src/main/llm/chatClient.ts`
- Sync-Filter: `app/src/main/sync/fileTracker.ts`

## Codex-Findings

### F01 — Cloud-Hard-Lock ist für Modus A nicht erzwingbar
Schwere: kritisch  
ADR-Stelle: Entscheidung 7; §3; §5; Build-Phase 1.3  
Status: [OFFEN]

Modus A soll den bestehenden `ollama-generate`-Pfad weiterverwenden
(`note-agent-harness-plan.md:126`, `note-agent-harness-plan.md:193`). Dieser Handler weiß aber nicht,
ob `originalText` angehängte Dateiinhalte enthält, und akzeptiert ein vom Renderer geliefertes
`cloud`-Objekt (`app/src/main/index.ts:3858-3869`). Der aktuelle Renderer entscheidet ebenfalls selbst,
ob dieses Objekt gesetzt wird (`app/src/renderer/components/Editor/MarkdownEditor.tsx:1806-1852`).
Das Ausblenden des OpenRouter-Eintrags ist daher nur UI-Policy. Der im Plan genannte Main-Guard in
`note-agent-run` (`note-agent-harness-plan.md:177`) schützt ausschließlich Modus B. Ein Renderer-Bug
oder kompromittierter Renderer könnte Kontextdateien in Modus A weiterhin an OpenRouter senden.
Auch ein Ollama-Cloud-Tag muss im tatsächlichen Generate-Handler abgewehrt werden.

Vorschlag: Modus A über einen eigenen Main-Handler führen, der Anhänge Main-seitig aus gebundenen
Attachment-IDs liest, ausschließlich ein lokales Backend konstruiert und `isCloudModel(model)` prüft.
Alternativ muss `ollama-generate` einen nicht vom Renderer behauptbaren, Main-seitig ausgestellten
Kontextbezug erhalten. Die Privacy-Entscheidung darf nicht nur in der UI leben.

### F02 — `stagingPath` macht den Renderer zur Datei-Autorität
Schwere: hoch  
ADR-Stelle: §1 `AgentResultCard`; §4 „Staging & Übernahme“; §5 „Pfad-Grenzen“  
Status: [OFFEN]

Die Ergebnis-Karte trägt einen absoluten `stagingPath` zurück zum Renderer
(`note-agent-harness-plan.md:101-107`), und Übernehmen/Verwerfen werden als Operationen auf dieser Datei
beschrieben (`note-agent-harness-plan.md:166-170`). `assertSafePath` beweist jedoch nur, dass ein Pfad
innerhalb irgendeines freigegebenen Vaults liegt (`app/src/main/index.ts:1048-1079`). Es beweist nicht,
dass die Datei zu diesem Run, zu diesem Zielordner oder überhaupt zum Agent-Staging gehört. Wenn ein
Accept-/Discard-IPC einen Renderer-Pfad entgegennimmt, könnte der Renderer damit beliebige Vault-Dateien
verschieben oder löschen. Das wäre gerade beim „Verwerfen“ eine neue destruktive IPC-Oberfläche.

Vorschlag: Der Main hält eine Run-Registry und gibt nur opake `{runId, resultId}` zurück. Accept/Discard
lösen den kanonischen Quellpfad ausschließlich aus dieser Registry auf, binden Run an `event.sender`,
prüfen nach `realpath` die Zugehörigkeit zu exakt
`<approvedVault>/.mindgraph/agent-staging/<runId>/`, erlauben nur registrierte Outputs und machen jede
Result-ID atomar höchstens einmal konsumierbar. Alle neuen IPC-Handler zusätzlich mit
`isTrustedSender(event)` schützen.

### F03 — Staging ist derzeit nicht vollständig vom Sync ausgeschlossen
Schwere: hoch  
ADR-Stelle: §4 „Staging & Übernahme“  
Status: [OFFEN]

Der Plan sagt, `.mindgraph/agent-staging/` sei „vom Sync ausgeschlossen (wie Backups)“
(`note-agent-harness-plan.md:168`). Der aktuelle Filter schließt aber nur konkrete Ableitungen wie
`.mindgraph/backups/`, `.mindgraph/rag/` und Embedding-Caches aus
(`app/src/main/sync/fileTracker.ts:61-78`). Erlaubte Erweiterungen werden unabhängig vom Unterordner
gesynct (`app/src/main/sync/fileTracker.ts:86-111`). Damit wären insbesondere gestagte `.md`- und
`.pdf`-Artefakte vor der menschlichen Abnahme synchronisierbar. Die Aussage „nichts landet … ohne
Übernehmen“ gilt dann nicht geräteübergreifend und kann personenbezogene Daten leaken.

Vorschlag: Den gesamten Prefix `.mindgraph/agent-staging/` plattformübergreifend in
`shouldExclude()` aufnehmen und mit `isSyncable()`-Regressionstests für mindestens `.md`, `.pdf`,
`.xlsx` und Windows-Pfade absichern. Zusätzlich prüfen, ob Vault-Watcher/Dateiindex den versteckten
Ordner sicher ignorieren.

### F04 — Dateigrößen- und Expansionslimits fehlen vor dem Parsen
Schwere: hoch  
ADR-Stelle: Entscheidung 3; §2; Offene Frage 1  
Status: [OFFEN]

Die vorgeschlagene 200-Zeilen-Schwelle begrenzt nur die spätere LLM-Ausgabe. `parseExcel` muss die
Arbeitsmappe vorher vollständig laden; Gleiches gilt für DOCX/PPTX/PDF und direkt gelesene
Text-/CSV-Dateien. Der Plan definiert weder ein `stat`-Limit vor dem Lesen noch Limits für entpackte
Office-Inhalte, Sheet-/Zeilen-/Zellenzahl, Zeichenmenge, PDF-Seiten oder die Summe aller Anhänge.
Eine große oder komprimiert stark expandierende Datei kann daher Main-RAM, CPU und Prompt-Kontext
erschöpfen, bevor die Stichprobe greift.

Vorschlag: Harte Limits auf drei Ebenen festlegen: Bytes vor Parseraufruf, strukturelle
Parserbudgets pro Format und ein kumulatives Zeichen-/Tokenbudget pro Run. Überschreitungen
fail-closed mit Metadaten/Stichprobe behandeln. Bereichsabfragen müssen den Parser tatsächlich
begrenzen oder gecachte strukturierte Daten mit eigenem Speicherlimit nutzen.

### F05 — Der vorhandene Tool-Loop unterstützt den zugesagten Abbruch nicht
Schwere: hoch  
ADR-Stelle: Entscheidung 10; §4 „Loop“  
Status: [OFFEN]

Der Plan beschreibt Wiederverwendung von `chatWithTools` mit `AbortSignal` und Timeout pro Skill
(`note-agent-harness-plan.md:74`, `note-agent-harness-plan.md:148`). `ChatOptions` besitzt aber kein
`signal` (`app/src/main/llm/chatClient.ts:36-46`), und der Client erzeugt intern feste
120-Sekunden-Timeout-Signale (`app/src/main/llm/chatClient.ts:110-124`,
`app/src/main/llm/chatClient.ts:200-214`). Der Telegram-Loop führt Tools direkt mit
`await tool.run(...)` ohne Signal oder Timeout aus
(`app/src/main/telegram/agent/loop.ts:206-228`). Ein Abbrechen-Button könnte daher nur die UI
abkoppeln; der LLM-Request und ein hängender Parser/Writer liefen weiter und könnten anschließend
noch Staging-Artefakte erzeugen.

Vorschlag: Cancellation zuerst als echte prozessweite Vertragsschicht entwerfen: `signal` durch
Loop, Chat-Client und Skills reichen; externe Requests mit kombiniertem User-/Timeout-Signal
abbrechen; nach jedem Await Run-Status prüfen; Writer zunächst in temp-Datei schreiben und nur bei
aktivem Run atomar registrieren. Klar dokumentieren, welche Parser technisch nicht unterbrechbar
sind.

### F06 — Die angekündigte Registry-Wiederverwendung ist typseitig nicht vorhanden
Schwere: mittel  
ADR-Stelle: Entscheidung 4; §4 `skills.ts`  
Status: [OFFEN]

Der Plan will das bestehende `AppTool`-Interface mit einem eigenen `NoteAgentContext` wiederverwenden
(`note-agent-harness-plan.md:68`). `AppTool.run` ist aktuell jedoch fest auf den Telegram-spezifischen
`ToolContext` verdrahtet, inklusive `inboxFolder`, `projectsRootFolder` und `embeddingModel`
(`app/src/main/telegram/agent/tools/registry.ts:11-30`). Auch `ToolRegistry` ist nicht generisch.
Eine „eigene Registry-Instanz mit eigenem Kontext-Typ“ kompiliert damit nicht ohne Casts, Duplikation
oder Änderung der gemeinsamen Abstraktion.

Vorschlag: Vor Phase 2 entscheiden, ob `AppTool<TContext>`/`ToolRegistry<TContext>` in eine neutrale
Main-Schicht extrahiert wird oder der Notiz-Agent bewusst eine kleine eigene Registry erhält. Keine
unsicheren Casts verwenden; gemeinsam sollten mindestens Definition, Argumentvalidierung und
Result-Vertrag sein.

### F07 — Tool-Calling-Gate und Modell-Empfehlungen widersprechen der Messstrategie
Schwere: mittel  
ADR-Stelle: Entscheidung 9; §6.2  
Status: [OFFEN]

Der Plan verspricht ein „technisches Hard-Gate“ für Tool-Calling und nennt konkrete Empfehlungen
(`note-agent-harness-plan.md:73`), fordert aber zugleich, vor Benchmarks keine Empfehlung im UI
anzuzeigen (`note-agent-harness-plan.md:184`). Im aktuellen Client existiert keine verlässliche
Capability-Metadatenquelle: Der Auto-Pick ist eine Namensheuristik und fällt danach sogar auf das
erste lokale Modell zurück (`app/src/main/llm/chatClient.ts:77-103`). Der Telegram-Loop akzeptiert
zusätzlich aus Fließtext extrahierte Tool-Aufrufe (`app/src/main/telegram/agent/loop.ts:134-140`);
„native Tool-Calls vorhanden“ und „Modell erledigt diesen Harness zuverlässig“ sind also drei
verschiedene Aussagen.

Vorschlag: Capability-Gate, Qualitätsverdict und UI-Empfehlung getrennt modellieren. Das Gate sollte
auf einer getesteten Capability/Probe oder gepflegten Capability-Matrix beruhen und bei unbekannten
Modellen fail-closed sein. Empfehlungen erst aus dem neuen Benchmark ableiten; die vorab genannten
Modelle höchstens als zu testende Kandidaten dokumentieren.

### F08 — „Pro Notiz“ ist mit lokalem `MarkdownEditor`-State nicht gewährleistet
Schwere: mittel  
ADR-Stelle: Entscheidung 12; §1 UI  
Status: [OFFEN]

Der Plan bezeichnet den Zustand als flüchtig und „pro Notiz“, legt ihn aber direkt in
`MarkdownEditor` (`note-agent-harness-plan.md:85`). Diese Komponente ermittelt die aktuelle Notiz aus
wechselnden Selection-IDs (`app/src/renderer/components/Editor/MarkdownEditor.tsx:916-926`) und bleibt
beim Wechsel typischerweise gemountet. Ohne expliziten Reset oder eine Map nach stabiler Note-ID
können Anhänge, Zielordner, laufende Events oder Review-Karten von Notiz A unter Notiz B erscheinen.
Das ist nicht nur UX-Verwirrung: Eine Anweisung aus B könnte mit personenbezogenen Anhängen aus A
laufen.

Vorschlag: Den Lebenszyklus fest beschließen: entweder State strikt auf
`effectiveNoteId`/Editor-Pane keyen oder bei Notizwechsel Lauf abbrechen und Anhänge, Ziel und Review
atomar leeren. Wechsel während `running`/`review` braucht eine definierte UX. Progress- und
Result-Events müssen zusätzlich nach Run-ID und Pane/Note-Bindung gefiltert werden.

### F09 — „Sanitization“ wird als stärkere Sicherheitsgrenze dargestellt, als sie ist
Schwere: mittel  
ADR-Stelle: Entscheidung 8; §2; §5 „Prompt-Injection“  
Status: [OFFEN]

Die vorhandene Mail-Sanitization ist eine heuristische Texttransformation: Sie entfernt unter
anderem alle Codeblöcke und einige bekannte Phrasen
(`app/src/main/index.ts:3699-3713`). Für allgemeine Markdown-, CSV-, Office- und PDF-Arbeitsunterlagen
ist das zugleich Datenverlust; dennoch verhindert es semantisch gleichwertige
Prompt-Injection nicht. Der Plan folgert daraus und aus Staging, eine Injection könne „maximal eine
absurde Ergebnis-Karte erzeugen“ (`note-agent-harness-plan.md:175`). Mit `note_read` und
`note_search` kann eine injizierte Anweisung aber auch zusätzliche, vom Nutzer nicht benannte
Vault-Inhalte lesen und in Tool-History/Ergebnis übernehmen. Lokalität verhindert Cloud-Exfiltration,
nicht unerwartete Datenvermischung.

Vorschlag: Sanitization als Hygiene, nicht als Injection-Grenze benennen. Anhänge mit robusten,
zufälligen/strukturellen Delimitern und Provenienz pro Tool-Result markieren; Codeblöcke und
fachliche Inhalte nicht pauschal zerstören. Für Vault-Retrieval einen expliziten Scope erwägen
(z. B. verlinkte Notizen/Projektordner oder sichtbare Bestätigung bei Scope-Ausweitung) und im Review
die Quellen jedes Outputs anzeigen.

### F10 — Run-Serialisierung und Event-Routing dürfen keine offene Frage bleiben
Schwere: mittel  
ADR-Stelle: §4 Progress; Offene Frage 5  
Status: [OFFEN]

Progress soll über globale `webContents.send`-Events laufen (`note-agent-harness-plan.md:149`), während
Mehrfachläufe nur als offene Frage behandelt werden. Ohne Main-seitige Run-Registry, Senderbindung
und atomare Serialisierung können schnelle Doppelstarts, zwei Editor-Panes/Fenster oder verspätete
Events Zustände vermischen. Ein Renderer-seitiges „ein Lauf pro Fenster“ verhindert konkurrierende
IPC-Aufrufe nicht.

Vorschlag: Für v1 verbindlich genau einen aktiven Run pro `webContents.id` festlegen, Start im Main
atomar reservieren, Events nur an `event.sender` senden und jedes Event mit Run-ID plus monotoner
Sequenz versehen. Cancel/Window-Destroy markieren den Run terminal; spätere Ergebnisse werden
verworfen. Globale Aufräum- und Accept/Discard-Operationen über dieselbe Run-Registry serialisieren.

## Claude-Antwort

Alle 10 Findings sind in Revision 2 des Plans eingearbeitet (`docs/note-agent-harness-plan.md`, 2026-07-03).
Wichtige Rahmenänderung durch den Product Owner: **die Cloud-Sperre ist gestrichen** — der Nutzer
entscheidet selbst (Per-Feature-Opt-in + situativer Hinweis). Das verändert die Bewertung von F01.

- **F01 — angenommen, aber durch Produktentscheidung umgewidmet.** Es gibt kein Privacy-Versprechen
  mehr, das Main-seitig erzwungen werden müsste — damit entfällt das Enforcement-Problem. Was bleibt,
  ist eine Transparenz-Anforderung: sichtbarer Hinweis bei Anhängen + Cloud-Backend (inkl.
  `:cloud`-Ollama-Tags, tag-basiert erkannt), bei Modus B ausdrücklich inklusive Tool-Ergebnissen;
  Provenienz (Modell/Backend) an jedem Ergebnis. Modus A bleibt auf dem bestehenden Generate-Pfad
  (`note-edit`-Opt-in), Modus B bekommt eine eigene `CloudFeatureId 'note-agent'`. Der Hinweis auf die
  reine UI-Natur der Entscheidung ist im Plan als bewusste Konsequenz dokumentiert (Entscheidung 7).
- **F02 — angenommen, vollständig übernommen.** Renderer sieht nur opake `{runId, resultId}`-Handles;
  Main-Run-Registry ist alleinige Pfad-Autorität; Sender-Bindung, `realpath`-Containment auf exakt
  `<vault>/.mindgraph/agent-staging/<runId>/`, atomare Einmal-Konsumierung, `isTrustedSender` (existiert
  in `plugins/transport`) auf allen neuen Handlern. Zusätzlich: OS-Dialog-Anhänge werden als Main-seitige
  Attachment-IDs geführt — externe Pfade erreichen den Renderer gar nicht erst. (Entscheidung 5/13, §4)
- **F03 — angenommen, als Prerequisite verankert.** `.mindgraph/agent-staging/`-Prefix (beide
  Separatoren) in `shouldExclude()` + `isSyncable()`-Regressionstests (.md/.pdf/.xlsx/Windows-Pfade)
  + Watcher/Index-Ignore — als Vorbedingung vor der ersten Zeile `staging.ts`, nicht als Begleitarbeit.
- **F04 — angenommen, vollständig übernommen.** Limits auf drei Ebenen (Bytes vor Parser, strukturelle
  Parser-Budgets, kumulatives Run-Budget), fail-closed mit Schema + Stichprobe; Bereichsparameter
  begrenzen den Parser real oder arbeiten auf einem einmalig geparsten Run-Cache. Zahlen sind
  Startwerte, Feinjustierung nach Benchmark (Offene Frage 1). (§2)
- **F05 — angenommen, als Prerequisite verankert.** `ChatOptions.signal` (kombiniert mit dem internen
  120-s-Timeout), Signal durch Loop → Chat-Client → Skills, Status-Prüfung nach jedem `await`,
  temp-Datei + atomare Registrierung nur bei aktivem Run, Dokumentation nicht unterbrechbarer Parser.
  Nebeneffekt: der Telegram-Loop kann das Signal später mitnutzen. (Entscheidung 10, Prerequisites)
- **F06 — angenommen.** Entscheidung: generische Extraktion (`AppTool<TContext>`/
  `ToolRegistry<TContext>`) in eine neutrale Main-Schicht, Telegram als Instanziierung; keine Casts,
  keine Duplikation. Als Prerequisite vor Phase 2. (Entscheidung 4)
- **F07 — angenommen, vollständig übernommen.** Drei getrennte Mechanismen: Capability-Gate (gepflegte
  Liste + Mini-Probe, fail-closed — nicht die Namensheuristik des Chat-Clients), Qualitätsverdict
  (Benchmark → Matrix), UI-Empfehlung (erst danach). qwen3 & Co. sind im Plan jetzt ausdrücklich
  Testkandidaten. Neue offene Frage 5 zur Proben-UX. (Entscheidung 9, §6)
- **F08 — angenommen.** Gewählte Variante: State als Map auf stabile Note-ID; Notizwechsel während
  `running` bricht den Lauf ab (Toast), `review`-Karten bleiben ihrer Notiz zugeordnet; Events nach
  Run-ID + Note-Bindung gefiltert. (Entscheidung 12, §1)
- **F09 — angenommen, vollständig übernommen.** Sanitization ist im Plan jetzt „Hygiene, keine
  Sicherheitsgrenze"; zufällige strukturelle Delimiter + Provenienz statt destruktiver Filter
  (Mail-Sanitization wird nicht wiederverwendet); Lauf-Protokoll zeigt jeden Read, Ergebnis-Karten
  listen Quellen; Restrisiko Datenvermischung ist ehrlich benannt, bei Cloud-Läufen deckt der
  Hinweistext Tool-Reads ab. Scoped Retrieval = Phase 3. (Entscheidung 8, §2, §5)
- **F10 — angenommen, vollständig übernommen.** Genau ein aktiver Run pro `webContents.id`, atomare
  Main-Reservierung, Events nur an `event.sender` mit Run-ID + monotoner Sequenz, Cancel/Destroy
  terminal, späte Ergebnisse verworfen, Accept/Discard/Cleanup über dieselbe Registry. Die frühere
  offene Frage 5 („Mehrfachläufe") ist damit entschieden. (Entscheidung 13, §4)

## Status

Review abgeschlossen: 10 Findings, davon 1 kritisch, 4 hoch, 5 mittel. Keine Code-Edits.
Claude-Antwort 2026-07-03: alle Findings in Plan-Revision 2 eingearbeitet (F01 als Transparenz-
Anforderung nach Wegfall der Cloud-Sperre, F02–F10 übernommen). ADR-Datei aktualisiert.

## Codex-Re-Review der Implementierung (2026-07-05)

Geprüfter Stand: `ad5680f8` (Phase 1), `64c3a301` (Phase 2) sowie der aktuelle Stand
`854d296b`. Typecheck, 639 Tests und Production-Build laufen erfolgreich. Für
`main/noteAgent/` selbst existieren jedoch noch keine gezielten Unit-Tests.

### R01 — Binär-Übernahme kann über Zielordner-Symlink aus dem Vault schreiben
Schwere: hoch  
Code-Stelle: `app/src/main/index.ts:3985-3989`, `app/src/main/index.ts:4097-4107`  
Status: [OFFEN]

Der Zielordner wird mit `validatePath()` nur lexikalisch unter dem Vault gehalten
(`app/src/main/index.ts:967-975`). Ein Symlink wie `Vault/Export -> /beliebiger/Ordner` besteht diese
Prüfung und `fs.stat()` folgt ihm. Beim Accept wird derselbe ungekanonische Zielordner verwendet.
Markdown ist zufällig durch `writeFileSafe()` geschützt, aber XLSX/DOCX werden mit `fs.copyFile()`
direkt hinter den Symlink geschrieben. Damit verletzt die Implementierung genau die in F02
geforderte kanonische Pfadgrenze.

Vorschlag: Zielordner bei Run-Start mit `assertSafePath()` kanonisieren und diesen kanonischen,
an den Run gebundenen Pfad speichern. Unmittelbar vor jeder Übernahme Quelle und Ziel erneut
kanonisch prüfen. Binärdateien ebenfalls ausschließlich über eine gemeinsame sichere
Schreib-/Copy-Grenze übernehmen.

### R02 — Ein neuer Lauf entwertet alle Review-Karten des vorherigen Laufs
Schwere: hoch  
Code-Stelle: `app/src/main/noteAgent/runRegistry.ts:50-65`,
`app/src/renderer/components/Editor/MarkdownEditor.tsx:1901-1919`  
Status: [OFFEN]

Der Renderer hält Review-Karten pro Notiz und zeigt sie nach einem Notizwechsel erneut. `startRun()`
löscht beim nächsten Lauf desselben Fensters jedoch den vorherigen beendeten Run aus `runsById`.
Danach schlagen Accept und Discard für dessen weiterhin sichtbare Karten mit „Unbekannter Lauf“
fehl; die Staging-Dateien bleiben bis zum Alters-Cleanup liegen. Das widerspricht Entscheidung 12
und dem Human-Review-Modell.

Vorschlag: `activeBySender` nur für den aktiven Lauf verwenden, beendete Runs mit unentschiedenen
Results dagegen in `runsById` behalten. Einen Run erst entfernen, wenn alle Results konsumiert oder
explizit als kompletter Review verworfen wurden; zusätzlich ein begrenztes Retention-/Cleanup-Modell
und Tests für „Run A fertig → Run B startet → Result A übernehmen“ ergänzen.

### R03 — Vault-Anhänge und Skill-Dateien können über Symlinks außerhalb des Vaults lesen
Schwere: hoch  
Code-Stelle: `app/src/main/index.ts:3917-3928`,
`app/src/main/noteAgent/skillsLoader.ts:90-100`,
`app/src/main/noteAgent/skillsLoader.ts:123-157`  
Status: [OFFEN]

`note-agent-attach-vault-file` verwendet ebenfalls nur das lexikalische `validatePath()`. Ein
Vault-interner Symlink auf eine externe Datei oder einen externen Ordner wird registriert und später
vom Main gelesen. Bei Skills sind `readSkillBody()` und `resolveSkillFile()` gleichfalls nur über
`path.join/path.resolve` begrenzt; `fs.stat/readFile` folgen Symlinks. Ein Skill kann daher etwa eine
gelistete `references/geheim.md` als Symlink auf eine Datei außerhalb des Vaults anbieten. Das Modell
kann diese über `use_skill`/`read_skill_file` lesen und bei Cloud-Läufen an den Anbieter senden.

Vorschlag: Alle Vault- und Skill-Reads durch eine kanonische Read-Grenze führen
(`realpath` + approved Vault + exakter Skill-Unterbaum). Symlinks entweder vollständig ablehnen oder
nur akzeptieren, wenn ihr kanonisches Ziel im erlaubten Unterbaum bleibt. Nach Registrierung und
unmittelbar vor dem Read erneut prüfen, um Austausch zwischen Check und Use abzufangen.

### R04 — Kollisionsprüfung und Kopieren sind nicht atomar
Schwere: mittel  
Code-Stelle: `app/src/main/noteAgent/staging.ts:61-75`,
`app/src/main/index.ts:4097-4107`  
Status: [OFFEN]

`collisionFreeName()` prüft erst mit `fs.access()`, anschließend schreibt ein separater Aufruf mit
`writeFileSafe()` oder `fs.copyFile()`. Zwei parallele Accept-Aufrufe für gleich benannte Results
können beide denselben freien Namen sehen; `copyFile()` überschreibt standardmäßig. Die Result-IDs
sind einzeln atomar konsumierbar, die Zielnamen aber nicht global serialisiert.

Vorschlag: Accept-Operationen pro Vault/Zielordner serialisieren oder den Zielpfad atomar reservieren.
Für Binärdateien `COPYFILE_EXCL` mit Kollisions-Retry verwenden; für Markdown dieselbe
No-Clobber-Semantik in der sicheren Schreibgrenze vorsehen.

### R05 — Sicherheitskritischer Kern ist nur indirekt getestet
Schwere: mittel  
Code-Stelle: `app/src/main/noteAgent/`  
Status: [OFFEN]

Die vorhandenen Tests decken den neuen Sync-Ausschluss ab, aber nicht Run-Registry, Staging-
Containment, Dateinamensbehandlung, Symlinks, Einmal-Konsum, Abbruch oder Attachment-Budgets.
Gerade R01–R04 wären mit kleinen, reinen Tests reproduzierbar gewesen. Der grüne Gesamt-Testlauf
liefert deshalb für die neuen Trust-Grenzen nur geringe Aussagekraft.

Vorschlag: Mindestens Tests für kanonisches Source-/Target-Containment, Symlink-Ausbruch,
Accept-Rennen, Run-Retention über Folgeläufe, Cancel-vor/nach-Writer und Größenbudgets ergänzen.

### Re-Review-Status

Implementierung grundsätzlich schlüssig und erfolgreich gebaut, aber noch nicht freigabereif:
3 hohe und 2 mittlere offene Findings. Keine Code-Edits vorgenommen.

## Claude-Antwort auf das Re-Review (2026-07-05)

Alle fünf Findings gegen den Code verifiziert (real) und behoben. `npm run typecheck`,
`npm run test` (55 Files / 649 Tests, davon 10 neue) und `npm run build` grün.

- **R01 — behoben.** Zielordner wird bei Run-Start via `assertSafePath` (realpath +
  approved-Vault-Check) kanonisiert und als `targetFolderAbs` an den Run gebunden
  (`runRegistry.ts`, `index.ts` note-agent-run). Beim Accept wird `run.targetFolderAbs`
  UNMITTELBAR vor der Übernahme erneut über `assertSafePath` geprüft (TOCTOU) — sowohl
  Markdown (schon über `writeFileSafe`) als auch Binärdateien schreiben jetzt nur in den
  kanonischen Zielordner. Ein untergeschobener Zielordner-Symlink nach außen wird abgewiesen.
- **R02 — behoben.** `startRun` löscht den beendeten Vorlauf nicht mehr blind; er bleibt in
  `runsById` adressierbar, solange er offene Review-Karten hat (`isFullyConsumed`-Check).
  Neue Funktion `pruneRunIfConsumed`, von Accept UND Discord nach Erfolg aufgerufen, entfernt
  den Lauf erst, wenn alle Results konsumiert sind. Retention-Cap (8 beendete Läufe/Sender)
  gegen unbegrenztes Wachstum. Test „Run A fertig → Run B startet → Result A übernehmen".
- **R03 — behoben.** `note-agent-attach-vault-file` nutzt jetzt `assertSafePath` (realpath)
  statt `validatePath`. Skill-Reads (`readSkillBody`, `resolveSkillFile` — jetzt async)
  laufen über `assertInsideSkill`: realpath des Ziels MUSS im realpath des Skill-Ordners
  bleiben. `listSkillFiles` überspringt Symlinks. Ein `references/…`-Symlink nach außen wird
  weder gelistet noch gelesen (Test).
- **R04 — behoben.** `collisionFreeName` (check-then-write) ersetzt durch `reserveFreeName`:
  atomare, exklusive Platzhalter-Anlage (`fs.open(..., 'wx')`) mit Kollisions-Bump. Zwei
  parallele Accepts belegen nie denselben Namen (Test); der reservierte Name wird danach
  überschrieben (Binär) bzw. via `writeFileSafe` gefüllt (Markdown).
- **R05 — behoben.** Neues PERMANENTES `src/main/noteAgent/security.test.ts` (bewusste
  Ausnahme von „main/ nicht in der Dauer-Suite"): Run-Retention über Folgeläufe, Einmal-Konsum,
  ein-Run-pro-Fenster, Retention-Cap, parallele Namensreservierung, Dateinamen-Sanitizer,
  Skill-Symlink-Ausbruch (resolveSkillFile/listSkillFiles/readSkillBody). 10 Tests.

Bewusst NICHT geändert: Das Bedrohungsmodell der Symlink-Findings (R01/R03) setzt einen bereits
im Vault platzierten bösartigen Symlink voraus — für eine lokale Einzelnutzer-App
Defense-in-Depth, kein Live-Exploit. Fix trotzdem umgesetzt, weil er billig ist und die im Plan
(F02/F03) versprochene kanonische Grenze konsistent herstellt.
