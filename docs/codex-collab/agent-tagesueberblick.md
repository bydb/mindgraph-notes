# Notiz-Agent: Werkzeug „Tagesüberblick“ (`day_overview`)

## Aufgabe

Plan-Review vor dem Bauen. Codex soll den Plan gegen den echten Code prüfen und angreifen:
Datenquellen (stimmen sie, sind sie im Main erreichbar?), Datenschutz (Cloud-Wege), Ehrlichkeit der
Aussagen, Grenzen, kleinster sinnvoller erster Schritt.

### Auslöser (real, 11.11.2026, lokales 27B-Modell, Web aus)

Auftrag im Agent-Tab: „Sage mir was ich heute erledigt habe“. Verlauf: 8 Werkzeugschritte,
über 7 Minuten — `vault_search`, mehrfach `note_search` nach Stichworten, `note_read` auf eine
Brain-Tagesnotiz von vor drei Monaten (erst ohne `.md` → Fehler, dann mit). Antwort: „der
aktuellste Eintrag ist vom 19. August“ und eine Nacherzählung jenes Tages. **Falsch:** Es gibt
Tagesnotizen bis zwei Tage vor dem Test; für den Testtag selbst existierte keine.

Ursachen, am Code belegt:
- Der Auftrag enthielt **kein Datum**, wenn Web aus war (`main/noteAgent/loop.ts`, `today` stand
  nur im Web-Block). **Schon behoben** (uncommittet): Wochentag + lokales Datum stehen jetzt immer
  in den Regeln, plus „gib nie einen älteren Eintrag als aktuellen aus“. Ebenso ergänzt `note_read`
  eine fehlende `.md`-Endung (`main/noteAgent/skills.ts`).
- `vault_search` kann Brain-Tagesnotizen nicht finden (`shared/rag/indexPolicy.ts:34-41`).
- `note_search` liefert 5 Stichworttreffer ohne Datumsordnung
  (`main/telegram/agent/tools/notes.ts:48-75`).
- Es gibt **kein Werkzeug**, das sagt, was an einem Tag war — obwohl die App es misst.

### Was die App schon misst

- Tätigkeitsprotokoll im Main: `main/activityLedger.ts` (`readActivitySummary(vaultPath, range)`),
  Schema `shared/activityLog.ts` (`localDayRange` Zeile ~1300). Der Sprachbefehl
  `activity.today` (`renderer/voice/actions.ts:411ff`) baut daraus die Tagesbilanz.
- Brain-Sensoren im **Renderer**: `renderer/utils/brainSensors.ts:59-152` — berührte/neu
  angelegte Notizen (aus `utils/contextMemory.ts`-Ereignissen im localStorage + Datei-Zeiten),
  Zähler erledigter/neuer Aufgaben, Mails empfangen/beantwortet, drei relevanteste Mails
  (Absender, Betreff).
- Brain-Tagesnotiz, falls erzeugt: `<brain.folderPath>/JJJJ/MM/TT.md` (`main/brain/dailyConsolidation.ts`).
- Mailbestand im Main: `main/email/store.ts`.

## Kontext/Anker

- Werkzeug-Registry: `app/src/main/noteAgent/skills.ts` (`registry.register`, `isWrite`,
  Muster `vault_search` ab ca. Zeile 837: nur in der Allowlist, wenn die Voraussetzung erfüllt ist).
- Allowlist und System-Prompt: `app/src/main/noteAgent/loop.ts`.
- Modellweg/Cloud: `app/src/shared/agentRoute.ts` (`classifyRoute`: local | cloud | unverified),
  `evaluateCloudGate`; Karte „Welche Daten wohin gehen“ in `renderer/components/Agent/`.
- Regeln: `.claude/rules/note-agent.md` (Abschnitt Modellweg, „Transparenz statt Sperre“,
  Nutzerentscheidung 24.09.2026), `CLAUDE.md` (Brain bleibt localhost).
- Antwortformat-Vorbild mit harten Grenzen: `main/noteAgent/vaultSearchFormat.ts`.

### Plan (Entwurf)

**Werkzeug** `day_overview({ date? })`, nur lesend, Standard = heute (lokaler Kalendertag),
erlaubt: heute und zurückliegende Tage (Format JJJJ-MM-TT). Antwort als kurzer Text, hart
begrenzt (Ziel ≤ 3000 Zeichen), mit festen Abschnitten und der Kennzeichnung „gemessen“:

1. **Von der App erledigt** (Tätigkeitsprotokoll): übernommene Agent-Ergebnisse nach Art,
   Mail-Aufgaben, Plugin-Vorgänge — dieselben Zähler wie die Tagesbilanz.
2. **Notizen** des Tages: neu angelegt / geändert, je Titel + Pfad, höchstens 12, nach
   Dateizeiten (Main kann das selbst; Ordner `.mindgraph`, Brain-Ordner, Vorlagen ausgenommen).
3. **Aufgaben**: am Tag abgehakte und neu angelegte — Quelle offen (Frage 2).
4. **Mails**: empfangen / gesendet als Zahl; bei lokalem Modell zusätzlich bis zu drei
   relevanteste mit Absender + Betreff.
5. **Tagesnotiz des Brains**, wenn für das Datum vorhanden: Pfad + Hinweis „mit note_read
   lesbar“ (Text nicht automatisch einfügen) — oder ausdrücklich „für diesen Tag gibt es keine
   Tagesnotiz“.
6. Leerer Tag: ein Satz „für <Datum> ist nichts gemessen“, keine Vermutung.

**Was das Werkzeug nicht behauptet:** nichts über „offen/erledigt“ einzelner Vorgänge, keine
Arbeit außerhalb der App. Fußzeile: „Gemessen: Notizen, Aufgaben, Mails, App-Läufe. Arbeit
außerhalb von MindGraph ist nicht enthalten.“

**Datenschutz:**
- `local`: alles wie oben.
- `cloud` und `unverified`: Abschnitt 4 nur als Zahlen (keine Absender/Betreffs); Notiztitel
  bleiben (der Agent darf Notizen ohnehin lesen). Die Karte „Welche Daten wohin gehen“ nennt
  „Tagesüberblick (Notiztitel, Zähler)“ als Werkzeugergebnis.
- Brain selbst bleibt unberührt: keine Änderung an `dailyConsolidation.ts`, kein Index.

**Prompt:** ein Satz im System-Prompt: „Fragen nach einem Tag („was habe ich heute/gestern
gemacht“) beantwortest du zuerst mit day_overview; lies danach höchstens die genannte
Tagesnotiz.“ Für reine Auskunftsfragen ist kein Write nötig (prüfen, ob der Loop das heute erlaubt).

**Messung vor/nach** (Memory-Regel: erst messen): derselbe Auftrag, je 3 Läufe, gleiches
Modell — Schritte, Dauer, Antwort richtig/falsch/„keine Quelle“. Vorher-Wert: 8 Schritte,
> 7 min, falsch (1 Lauf).

**Fragen an Codex:**

1. Ist `readActivitySummary` im Agent-Lauf direkt nutzbar (Import im Main, Vault-Pfad aus `ctx`)?
   Was davon ist „heute übernommen“ und was nur „Lauf beendet“?
2. Aufgaben: Gibt es im Main eine deterministische Quelle für „an Tag X abgehakt“ (Erledigt-Datum
   in der Zeile, `tasks-update-line`, Backups)? Oder nur die Renderer-Ereignisse in
   `contextMemory` (localStorage)? Wenn nur Renderer: beim Laufstart als Tagesauszug mitgeben
   (nur heute) — oder Abschnitt 3 in Stufe 1 weglassen?
3. Notizen nach Dateizeiten: Sync-Lehre „mtime ist kein Frischebeweis“ — verfälschen
   Sync-Downloads und Massenänderungen den Tag? Wie filtert `brainSensors`/der Phantom-Filter das?
4. Mailbestand im Main: Ist „gesendet am Tag“ und „empfangen am Tag“ dort verlässlich lesbar,
   auch mit mehreren Konten und der Vereinigung aus `email/store.ts`?
5. Cloud: Ist „Zahlen statt Absender/Betreff“ mit der Nutzerentscheidung „Transparenz statt
   Sperre“ vereinbar, oder widerspricht eine Auslassung der dortigen Linie? Gilt `unverified`
   (LM Studio) als Cloud?
6. Darf der Agent heute ohne Write antworten (reine Auskunft), oder erzwingt der Loop ein Ergebnis?
7. Gehört dasselbe Werkzeug auch in den Petrol-Chat (`main/petrolChats/`) — dort stellt man solche
   Fragen eher als im Auftrag?
8. Was fehlt, was bricht, was ist der kleinste erste Schritt?

## Codex-Findings

### F01 — Bilanz ist kein Tätigkeitsnachweis
Schwere: hoch  
datei:zeile: `app/src/shared/activityLog.ts:635-675`, `app/src/shared/activityLog.ts:696-749`, `app/src/main/activityLedger.ts:199-205`  
Status: [OFFEN]  
**Frage 1:** `readActivitySummary(ctx.run.vaultPath, range)` ist im Main direkt nutzbar (`runRegistry.ts:55-60`); die Zähler haben aber verschiedene Zeitpunkte und Bedeutungen. `acceptedTotal` zählt **Ergebnisse am Übernahmetag**, `runsFinished` auch gescheiterte/beendete Läufe am Endtag, `emailTasks` erkannte Aufgaben ohne Übernahme. `jobs.completedTotal` zählt abgeschlossene Kanäle, nicht pauschal erledigte Arbeitsaufträge (`activityLog.ts:806-824`). Die Überschrift „Von der App erledigt“ und die Fußzeile „Gemessen: Notizen, Aufgaben, Mails, App-Läufe“ behaupten mehr als diese Daten belegen. Das Ledger ist zudem geräte- und profilgebunden und kann bei Lesefehlern wie leer aussehen (`activityLedger.ts:1-11,50-60`); Aufbewahrung 365 Tage/20.000 Ereignisse (`activityLog.ts:281-283,434-437`).  
Vorschlag: Zähler mit Ereignis, Zeitpunkt und Geltungsbereich benennen („hier übernommene Agent-Ergebnisse“, „beendete Läufe“, „erkannte Mail-Aufgaben“). `0` nicht als „nichts getan“ formulieren; bei nicht lesbarem Ledger ausdrücklich „keine verlässliche Bilanz verfügbar“.

### F02 — Abgehakte Aufgaben sind historisch nicht bestimmbar
Schwere: hoch  
datei:zeile: `app/src/shared/taskExtractor.ts:5-22`, `app/src/main/index.ts:2735-2761`, `app/src/renderer/utils/brainSensors.ts:114-115`, `app/src/renderer/utils/contextMemory.ts:67-82`  
Status: [OFFEN]  
**Frage 2:** `extractTasks` kennt den aktuellen Checkboxzustand und ein Fälligkeitsdatum, kein Erledigt-Datum. `tasks-update-line` schreibt nur die Zeile; es erfasst keinen Abschluss im Main-Ledger. Der Brain-Sensor zählt **jedes** `task_updated`-Renderer-Ereignis als `tasksCompleted`, selbst bei Text-/Terminänderung. Diese Ereignisse liegen nur im `localStorage`, sind optional, auf 90 Tage/2500 begrenzt (`contextMemory.ts:32-34,86-119`) und im Main nicht direkt verfügbar. Auch Backups sind kein vollständiges Ereignisprotokoll. `tasks-create` protokolliert nur diesen einen Erzeugungsweg (`index.ts:2769-2795`), nicht alle Markdown-Tasks.  
Vorschlag: Abschnitt 3 in Stufe 1 weglassen. Kein Renderer-Tagesauszug als Ersatz für eine belastbare Main-Quelle; später ein explizites `unchecked → checked`-Ereignis mit Zeit und Herkunft an der Schreibgrenze erfassen und weitere Schreibwege prüfen.

### F03 — Dateizeiten machen aus Sync Arbeit des heutigen Tages
Schwere: hoch  
datei:zeile: `app/src/main/sync/syncEngine.ts:1651-1658`, `app/src/renderer/utils/brainSensors.ts:64-112`  
Status: [OFFEN]  
**Frage 3:** Ein Sync-Download schreibt die Datei neu und setzt ihre lokale `mtime`; die Manifestzeit wird anschließend aus genau dieser `mtime` gelesen. Der Brain-Sensor nutzt `modifiedAt` als Fallback und filtert weder Sync-Downloads noch Massenänderungen heraus. Seine maximal zwölf Notizen sind nach einem Aktivitäts-Score aus Renderer-Ereignissen sortiert, nicht die zwölf neuesten Dateien. Ein neuer Main-Scan nach Dateizeiten würde also eine andere, ebenfalls irreführende Bedeutung haben. `createdAt`/`modifiedAt` sind Metadaten (`shared/types.ts:521-543`), kein Nachweis, wer wann an der Notiz gearbeitet hat.  
Vorschlag: Abschnitt 2 zunächst weglassen oder ausdrücklich „Dateien mit lokalem Zeitstempel an diesem Tag (inklusive Sync/Import)“ nennen; nicht „neu angelegt/geändert“ als Nutzerhandlung. Für echte Tagesaktivität erst Herkunftsereignisse an App-Schreibgrenzen erfassen und Sync getrennt markieren.

### F04 — Mailbestand ist Cache, kein Tages-Postfach
Schwere: hoch  
datei:zeile: `app/src/main/email/store.ts:73-105`, `app/src/main/email/ipc.ts:936-969`, `app/src/main/email/ipc.ts:1038-1149`, `app/src/shared/emailRelevance.ts:360-368`  
Status: [OFFEN]  
**Frage 4:** `loadEmailStore` ist im Main nutzbar, liefert aber eine synchronisierte/zusammengeführte **lokale Liste**, keine vollständige Abfrage aller Konten und Ordner. Der Abruf läuft pro übergebenem Konto/Ordner (Standard `INBOX`) mit Kontingent; unbekannte Mails können liegen bleiben. `email-load` dedupliziert alte IDs nur für die Anzeige und meldet beschädigte Daten ausdrücklich. Für „gesendet“ muss `isSentMail` (Flag **oder** Sent-Ordner) gelten; `brainSensors.ts:121-122` prüft nur das Flag und nennt alle gesendeten Mails fälschlich „beantwortet“. Das Feld `date` ist das Mail-Datum, nicht der Zeitpunkt des lokalen Empfangs/Abrufs (`shared/types.ts:1734-1759`).  
Vorschlag: Abschnitt 4 in Stufe 1 weglassen. Später „im lokalen Mailbestand mit Mail-Datum X“ und Abdeckung (Konten, Ordner, letzter erfolgreicher Abruf, beschädigt/unvollständig) ausweisen; weder „heute empfangen“ noch „beantwortet“ aus bloßer Datums-/Sent-Filterung ableiten. Relevanzranking nur auf tatsächlich analysierte Mails anwenden.

### F05 — Cloud-Kürzung ist inkonsistent und unvollständig
Schwere: hoch  
datei:zeile: `app/src/shared/agentRoute.ts:42-64`, `app/src/shared/agentRoute.ts:86-100`, `app/src/main/noteAgent/skills.ts:782-811`, `.claude/rules/note-agent.md:45-48`  
Status: [OFFEN]  
**Frage 5:** `unverified` ist **nicht** Cloud: LM Studio ist stets unverified, ebenso nicht nachweisbar lokales Ollama; das Cloud-Gate gilt nur für `cloud`. Die bestehende Entscheidung ist Transparenz mit ausdrücklicher Cloud-Zustimmung, keine Mail-Sperre. Nur Absender/Betreff zu verstecken, während Notiztitel, Pfade und Brain-Pfad mitgehen und `note_read` anschließend den ganzen Text liefern kann, ist kein konsistentes Datenschutzversprechen. Auch Betreff/Titel/Pfad sind Nutzerdaten; die geplante Karte „Tagesüberblick (Notiztitel, Zähler)“ unterschlägt mögliche Pfade, Mailmetadaten beim lokalen/unverified Weg und nachfolgende Reads.  
Vorschlag: Für **alle** Wege vollständigen Datenumfang in Karte und Lauf offenlegen; für `unverified` keine Lokalitätszusage machen. Falls Datenminimierung gewünscht ist, dieselbe Regel für Titel, Pfade, Mailmetadaten und Folgeaufrufe definieren, statt einen Schutz durch selektive Auslassung zu suggerieren. Cloud-Gate vor neuer Werkzeugnutzung bestehen lassen.

### F06 — Reine Antwort kollidiert mit Auftragsprompt und Web-Vertrag
Schwere: hoch  
datei:zeile: `app/src/main/noteAgent/loop.ts:200-207`, `app/src/main/noteAgent/loop.ts:150-165`, `app/src/main/noteAgent/loop.ts:458-501`  
Status: [OFFEN]  
**Frage 6:** Ohne Web akzeptiert der Loop eine inhaltliche Antwort ohne Datei (`:472-501`); der System-Prompt verlangt dennoch strikt „SCHREIBE danach das Ergebnis“, was unnötige Dateien auslösen kann. Mit Web-Opt-in erzwingen Prompt **und** Abschlusslogik einen Write, selbst wenn die Frage nur „was habe ich heute gemacht?“ lautet. Ein einzelner neuer Prompt-Satz löst diesen Konflikt nicht.  
Vorschlag: Für reine Auskunft einen klar abgegrenzten Antwortmodus samt passendem Prompt und Abschlussvertrag festlegen; Web-Opt-in darf nicht still einen anderen Auftragsvertrag auslösen. Bestehende Schreibaufträge und Web-Recherche gesondert regressionsprüfen.

### F07 — Petrol-Chat hat anderen Daten- und Werkzeugvertrag
Schwere: mittel  
datei:zeile: `.claude/rules/petrol-chat.md:23-26`, `app/src/main/petrolChats/conversation.ts:338-365`, `app/src/main/petrolChats/conversation.ts:450-465`  
Status: [OFFEN]  
**Frage 7:** Petrol-Chat läuft ausdrücklich nicht durch den Agent-Loop und liest von sich aus keine Notizen. Seine normale Antwort ruft `runChat` auf, bei aktivem Globus kann davor die automatische Webentscheidung laufen. `day_overview` nur in `skills.ts` zu registrieren bringt dem Chat nichts. Eine automatische Übernahme in den Chat würde die sichtbare Zusage „Liest keine Notizen von selbst“ und den Datenweg ändern; eine Tagesfrage könnte derzeit sogar als Webfrage geroutet werden.  
Vorschlag: Zuerst nur im Agent-Auftrag prüfen. Chat-Unterstützung als separate Produktentscheidung mit explizitem, sichtbarem Zugriff, eigener Route/Gate/Statuszeile und Tests für Web-Automatik planen; keine versteckte gemeinsame Tool-Registry annehmen.

### F08 — Brain-Pfad und Tagesgrenze sind nicht stabil
Schwere: mittel  
datei:zeile: `app/src/main/brain/dailyConsolidation.ts:288-309`, `app/src/main/index.ts:13580-13585`, `app/src/renderer/utils/brainSensors.ts:7-17`, `app/src/shared/activityLog.ts:1299-1305`  
Status: [OFFEN]  
**Frage 8:** Der Brain-Ordner ist konfigurierbar; für denselben Tag kann `TT (2).md` usw. entstehen. Die Aussage „keine Tagesnotiz“ ist bei einem einzigen erwarteten Pfad unbewiesen. Brain-Sensoren rechnen mit Tagesbeginn 04:00 und festem 24h-Ende (auch am Zeitumstellungstag), das Ledger mit lokalem Mitternacht-zu-Mitternacht. Die Ausgabe würde zwei verschiedene „Tage“ vermengen.  
Vorschlag: Einen lokalen Kalendertag für `day_overview` festlegen, ISO-Datum streng validieren (inklusive unmöglicher und zukünftiger Tage) und DST per nächster lokaler Mitternacht behandeln. Brain-Ordner aus Main-Settings lesen, vorhandene Namensvarianten unter sicherem Vault-Pfad prüfen; bei Fehler/unklarem Ordner „nicht geprüft“ statt „existiert nicht“ melden. Brain-Notiz als Quelle, nicht als vollständige Bilanz kennzeichnen.

### F09 — Werkzeugausgabe braucht überprüfbare Grenzen
Schwere: mittel  
datei:zeile: `app/src/main/noteAgent/loop.ts:233-282`, `app/src/main/noteAgent/loop.ts:366`, `app/src/main/noteAgent/skills.ts:104-106`, `app/src/main/noteAgent/skills.ts:839-867`  
Status: [OFFEN]  
**Frage 8:** Registrierung allein reicht nicht: Die Allowlist im Loop muss das Werkzeug freigeben; die Werkzeugdefinition und Ausführung müssen dieselben Eingaben prüfen. Die geplanten ≤3000 Zeichen können bei zwölf langen Titeln/Pfaden reißen; stilles Abschneiden verbirgt Abdeckung. Der resultierende Text wird Modellkontext, und `maxResultTokens` hängt vom Laufbudget ab. Ein optionales Datum darf weder Pfad noch unvalidierten `Date`-Parse steuern; der Vault kommt ausschließlich aus `ctx.run.vaultPath`.  
Vorschlag: Pure Format-/Datumsfunktion mit explizitem Ergebnisstatus (`vollständig`, `gekürzt`, `Quelle nicht verfügbar`) und hartem Budget bauen. Werkzeug nur bei verlässlicher Quelle anbieten. Testen: DST, ungültiges Datum, Vault-Isolation, lange/untrusted Titel, Kürzung mit sichtbarer Zahl ausgelassener Einträge, Budget, Abbruch und fehlende Daten.

### F10 — Messung und erster Schritt zu breit angelegt
Schwere: mittel  
datei:zeile: `app/src/main/activityLedger.ts:199-205`, `app/src/main/noteAgent/loop.ts:204-206`, `app/src/main/noteAgent/loop.ts:458-501`  
Status: [OFFEN]  
**Frage 8:** Der eine dokumentierte Fehlversuch belegt den Bedarf, aber keine Erfolgsrate. Drei Wiederholungen vor/nach auf einem sich ändernden Vault messen verschiedene Datenstände; die fünf geplanten Quellen machen Fehlerursachen untrennbar. Die Prompt-Regel „danach höchstens die genannte Tagesnotiz“ kann gerade bei fehlender/alter Brain-Notiz die direkte Frage nach heutigen Tätigkeiten verkürzen; eine Tagesnotiz ist eine generierte Zusammenfassung, kein unabhängiger Beweis.  
Vorschlag: Kleinster erster Schritt: `day_overview` nur mit **klar benannten Ledger-Zählern**, Datum, lokaler Tagesgrenze und Abdeckung, plus reiner Antwortmodus ohne Web-Write-Zwang für diesen Auftrag. Keine Notiz-, Aufgaben-, Mail- oder Brain-Aussage in dieser Stufe. Vorher/Nachher mit eingefrorenen synthetischen Ledger-Fällen und gleichen Modell-/Web-Einstellungen messen: korrekter Tag, leere/fehlende Quelle, Übernahme am Folgetag, fehlgeschlagener Lauf; dazu Tool-Schritte, Dauer und unbelegte Behauptungen. Tests für Format/Datum/Ledger-Semantik und Loop-Ende ohne Write sowie Web-Regression. Erst danach zusätzliche Quellen einzeln und mit eigener Herkunftsmessung aufnehmen.

**Gesamtempfehlung:** Zuerst einen schmalen, ehrlich beschrifteten Ledger-Tagesüberblick mit reinem Antwortpfad bauen und gegen eingefrorene Fälle messen. Danach Brain-Pfad als optionale Quelle prüfen. Aufgaben, Dateizeit-Notizen und Mailzahlen erst ergänzen, wenn ihre Ereignis- und Abdeckungssemantik belastbar ist; Petrol-Chat gesondert entscheiden.

### Runde 2 — Code-Review (Findings ab F11 hier anhängen)

### F11 — Ein Log-Fehler kann einen erfolgreichen Notiz-Write als Fehler melden
Schwere: hoch  
datei:zeile: `app/src/main/index.ts:2313-2317`, `app/src/main/index.ts:2258-2263`, `app/src/main/dayLog.ts:92-105`  
Status: [OFFEN]  
`noteWriteForDayLog` ruft `recordNoteWrite` erst **nach** `fs.writeFile` auf. Dessen Vorarbeit (`diffCheckedTasks`, `logFile`, Cache-Zugriff) läuft synchron vor Rückgabe des Promise; ein dabei geworfener Fehler schlägt bis zum IPC-Handler durch. Die Notiz ist dann bereits geschrieben, der Aufrufer sieht trotzdem einen Fehlschlag und kann erneut speichern. Die `.catch`-Grenze in `recordNoteWrite` deckt nur Fehler innerhalb der Queue ab.  
Vorschlag: Den gesamten Log-Aufruf einschließlich synchroner Vorarbeit in eine Fehlergrenze legen und den Notiz-Erfolg davon entkoppeln; einen absichtlich werfenden Diff/Log-Pfad als Integrationstest nach erfolgreichem Dateischreiben prüfen.

### F12 — Cache bestätigt Ereignisse vor dauerhaftem Schreiben
Schwere: hoch  
datei:zeile: `app/src/main/dayLog.ts:99-124`  
Status: [OFFEN]  
`known.add(key)` geschieht vor `writeAtomic`. Scheitern `mkdir`, JSON-Write oder Rename, bleibt der Key im `seenSaves`-Cache. Spätere Autosaves derselben Notiz desselben Tages kehren an Zeile 103 ohne erneuten Schreibversuch zurück; der Tageseintrag geht dauerhaft verloren. Bei `created` wird sogar trotz bereits bekanntem Key ein weiteres `note-saved created` geschrieben.  
Vorschlag: Cache erst nach erfolgreichem Rename aktualisieren und bei Fehler invalidieren; `created` gegen vorhandene `note-saved`-Einträge abgleichen. Fehler→erneutes Autosave und parallele Erst-Saves testen.

### F13 — Vorfassung und Backup verdoppeln den Leseweg; keine Serialisierung je Notiz
Schwere: hoch  
datei:zeile: `app/src/main/index.ts:1491-1520`, `app/src/main/index.ts:2313-2317`, `app/src/main/dayLog.ts:29-35`  
Status: [OFFEN]  
Jeder bestehende Markdown-Write liest die komplette Datei neu für den Diff und gleich danach nochmals für das Backup. Das gilt auch für große Notizen und häufiges Autosave; selbst wenn nach dem ersten Tages-Save kein `note-saved` mehr nötig ist, bleiben beide Reads und der vollständige Task-Diff. Die Queue in `dayLog.ts` serialisiert **nur Logdatei-Zugriffe**, nicht Lesen/Backup/Schreiben der Notiz. Zwei Writes können beide dieselbe Vorfassung lesen, dann in umgekehrter Reihenfolge schreiben; ein früherer `open→checked`-Stand kann im Log stehen, obwohl der spätere Write ihn wieder öffnet, oder ein Übergang wird verpasst.  
Vorschlag: Vorfassung für Backup und Diff einmal lesen; pro kanonischem Notizpfad Lesen–Backup–Schreiben–Ereignisermittlung serialisieren oder einen bestehenden Schreib-Lock verwenden. Test mit zwei kontrolliert ineinanderlaufenden Writes und großem Autosave-Fall.

### F14 — Lesefehler wird als Neuanlage verbucht
Schwere: hoch  
datei:zeile: `app/src/main/index.ts:2313-2317`, `app/src/main/dayLog.ts:99-118`  
Status: [OFFEN]  
`fs.readFile(...).catch(() => null)` setzt **jeden** Fehler der Vorfassungs-Lesung mit „Datei existierte nicht“ gleich. Bei `EACCES`, kurzzeitigem I/O-Fehler oder Decoder-/Dateisystemproblem kann der anschließende Write gelingen und `created: true` melden; der Checkbox-Diff fällt weg. Auch `backupMarkdownBeforeWrite` verschluckt Lesefehler (`index.ts:1494-1501`), sodass genau dieser Write ohne Backup weiterläuft.  
Vorschlag: Nur `ENOENT` als nicht vorhanden behandeln; andere Fehler nicht zu einem sicheren Vorher-Zustand umdeuten. Falls der Notiz-Write trotz fehlender Vorfassung weiterlaufen soll, Log-Ereignis als unbestimmt markieren und den Backup-Verlust sichtbar machen.

### F15 — Checkbox-Diff verwechselt Textvorkommen mit Aufgabenidentität
Schwere: hoch  
datei:zeile: `app/src/shared/dayLog.ts:43-85`, `app/src/shared/taskExtractor.ts:33,110-129`, `app/src/renderer/components/Editor/MarkdownEditor.tsx:536-561`  
Status: [OFFEN]  
Der Diff aggregiert nur den normalisierten Text über die ganze Datei. Bei zwei gleichlautenden Aufgaben kann eine **andere** neu abgehakte Zeile denselben Text ersetzen wie eine gelöschte offene Zeile; `newlyDone` und `noLongerOpen` ergeben dann einen falschen Abschluss. Eine Verschiebung zwischen Abschnitten ist ebenfalls nicht identifizierbar. Umgekehrt fehlt ein echter Abschluss, wenn derselbe WYSIWYG-/Turndown-Save den Text oder Reminder verändert. `TASK_LINE` erkennt nummerierte Listen, während `taskExtractor` nur `-`/`*` akzeptiert: der Tagesüberblick kann Aufgaben „abhaken“, die die übrige App nicht als Task erkennt. CRLF wird nur zeilenweise toleriert, sagt nichts über Identität.  
Vorschlag: „Checkbox-Wechsel mit gleichem Text in dieser Datei“ statt „Aufgabe erledigt“ nennen oder eine stabile Task-Identität bzw. Zeilen-Diff mit begrenzter Unsicherheit einführen. Tests für gleiche Texte in getrennten Abschnitten, gleichzeitiges Umformulieren/Abhaken und WYSIWYG-Roundtrip ergänzen.

### F16 — Quotierte und eingebettete Checkboxen sind nicht abgegrenzt
Schwere: mittel  
datei:zeile: `app/src/shared/dayLog.ts:43-62`, `app/src/renderer/components/Editor/MarkdownEditor.tsx:532-561`  
Status: [OFFEN]  
Die Regex ignoriert `> - [ ]` in Zitaten/Callouts, obwohl der Lesen-Modus Callout-Inhalte wieder mit `> ` serialisiert. In einem eingerückten Codeblock passt `^\s*` dagegen auf eine textuelle Zeile `    - [ ] ...` und zählt deren Wechsel als Aufgabe. Fenced Code wird ebenfalls nicht parserbasiert ausgeschlossen. Diese Fälle fehlen in `dayLog.test.ts:7-35`; die Bezeichnung „abgehakte Aufgaben“ ist dadurch zu stark.  
Vorschlag: Markdown-Kontext für Task-Zeilen definieren (Codeblöcke aus, Callouts/Zitate bewusst ein- oder ausgeschlossen) und mit echten Editor-Roundtrips testen; bis dahin den Zähler als „erkannte Checkbox-Wechsel“ ausgeben.

### F17 — Die behauptete eine Schreibgrenze ist nachweislich nicht die einzige
Schwere: hoch  
datei:zeile: `app/src/main/index.ts:2072-2085`, `app/src/main/index.ts:3089-3162`, `app/src/main/email/ipc.ts:2275-2285`, `app/src/main/telegram/agent/tools/tasks.ts:76-100`, `app/src/main/index.ts:13162-13180`  
Status: [OFFEN]  
`create-note`, Duplizieren, Mail-zu-Notiz, Telegram-`task_complete`/`note_create` und Transport-Notizen schreiben Markdown außerhalb `writeFileSafe`; weitere Import-, Projektstatus- und Readwise-Wege ebenso (`index.ts:6240-6247,10714-10722,13001,13057`). `rename-file`/`move-file` ändern Pfade ohne Log-Ereignis. Eine später unter neuem Pfad gespeicherte verschobene Notiz wird als Speichern gezählt, eine kopierte Notiz beim ersten nicht-exklusiven Save als schon vorhanden. Umgekehrt wird ein vom Agenten **neu** übernommenes Markdown-Ergebnis erst als leere Datei reserviert und dann mit `writeFileSafe` beschrieben (`index.ts:5320-5329`): `before` ist `''`, also `created: false`. Die Übersicht unterschlägt echte Neuanlagen und gibt falsche Kategorien aus.  
Vorschlag: Schreibweg-Inventar als Test-/Review-Tabelle festhalten; Ereignisse an den jeweiligen tatsächlichen Commit-Grenzen erfassen. Agent-Reserve, Kopie, Rename und Move explizit modellieren. Bis dahin keine Vollständigkeit für „in MindGraph angelegte/gespeicherte Notizen“ behaupten.

### F18 — Tasktexte und Notizpfade liegen zusätzlich im Klartextprofil
Schwere: hoch  
datei:zeile: `app/src/shared/dayLog.ts:16-35`, `app/src/main/dayLog.ts:24-26,57-61`, `.claude/rules/note-agent.md:45-48`  
Status: [OFFEN]  
Das neue `userData/daylog/<hash>.json` enthält Aufgabentexte (bis 200 Zeichen), Notizpfade und Zeitpunkte unverschlüsselt, bis zu 365 Tage/20.000 Ereignisse. Anders als das bisherige inhaltsfreie Activity-Ledger ist dies eine zweite Sammlung von Vault-Inhalten **außerhalb** des Vaults: sie folgt weder dessen Sync-/Löschpfad noch dessen möglicher Dateisicherung. Bei Cloud-Läufen gehen dieselben Texte/Pfade als Werkzeugresultat an den Anbieter; die allgemeine Karte erwähnt den neuen dauerhaft gespeicherten lokalen Datenbestand nicht eigens.  
Vorschlag: Datensparsamkeit entscheiden: für den Zähler Tasktext erst bei Bedarf aus dem Vault lesen oder lokale Ablage verschlüsseln/kurz halten; Löschung bei Vault-Entfernung und Profilwechsel definieren. Cloud-Karte und Datenschutztext nennen den Tagesüberblick sowie den lokalen Klartextbestand ausdrücklich.

### F19 — Cache und Abdeckung behaupten nach Ausfällen Vollständigkeit
Schwere: hoch  
datei:zeile: `app/src/main/dayLog.ts:64-65,101-122,135-141`, `app/src/shared/dayLog.ts:134-138`, `app/src/renderer/utils/brainSensors.ts:82-87,155-160`  
Status: [OFFEN]  
`seenSaves` lebt pro Prozess und Dateipfad; er wird nach externem Löschen/Ersetzen der Logdatei, Profilwechsel im laufenden Prozess oder einem Schreibfehler nicht invalidiert. Ein anderes Fenster teilt zwar den Cache im selben Main, aber die Notiz-Schreibvorgänge selbst sind nicht serialisiert. `since` bleibt auf dem ersten Zeitpunkt, obwohl alte Events nach 365 Tagen/20.000 Einträgen gekappt werden; `logCoversDay` und die Übersicht können danach leere Tage als vollständig gemessen darstellen.  
Vorschlag: Cache an Revision/Existenz koppeln oder nach Fehler/Profilwechsel räumen; ältesten verfügbaren Ereigniszeitpunkt getrennt vom Beginn der Erfassung führen. Abdeckung als Intervall mit bekannten Lücken modellieren, nicht nur als `since`.

### F20 — Brain-Sensor mischt Log und alte Renderer-Ereignisse
Schwere: mittel  
datei:zeile: `app/src/renderer/utils/brainSensors.ts:89-115,117-160`, `app/src/renderer/utils/brainSensors.ts:38-47`  
Status: [OFFEN]  
Auch wenn `logCoversDay` wahr ist, werden `note_created`, `note_updated` und `note_opened` aus `contextMemory` zuerst übernommen; nur der `mtime`-Fallback fällt weg. Ein alter oder durch Sync indirekt ausgelöster Renderer-Eintrag kann weiterhin eine Notiz als angelegt/bearbeitet zeigen. `notePathOf` nimmt per `endsWith('/' + rel)` den **ersten** passenden Pfad; bei `A/x.md` und `B/x.md` kann ein Event für `x.md` falsch zugeordnet werden. Bei fehlendem/beschädigtem Log fällt `tasksCompleted` auf die alte Zählung *aller* `task_updated` zurück, sodass die bekannte 39-Aufgaben-Fehlaussage wieder erscheint, ohne Unsicherheitslabel.  
Vorschlag: Exakten vault-relativen Pfad verlangen; alte Renderer-Ereignisse nur für klar getrennte „geöffnet“-Angaben verwenden. Bei fehlendem Log `completed` als unbekannt modellieren und den Brain-Prompt entsprechend formulieren; `getDayBoundsMs`-4-Uhr-Tag und Mitternachts-Log explizit angleichen.

### F21 — Brain-Ordnerprüfung folgt Symlinks außerhalb des Vaults
Schwere: hoch  
datei:zeile: `app/src/main/noteAgent/dayOverview.ts:15-26`, `app/src/main/index.ts:4928-4937`  
Status: [OFFEN]  
`path.resolve` prüft nur die **lexikalische** Lage des konfigurierten Brain-Ordners. `fs.readdir(dir)` folgt einem Symlink unterhalb des Vaults nach außen. Ein Cloud-Agent bekommt dann Dateinamen/Pfade aus einem nicht freigegebenen Verzeichnis als Werkzeugresultat; `note_read` darf sie anschließend zwar vermutlich nicht lesen, der Leak geschieht schon bei der Auflistung. Ein ENOENT eines gebrochenen Symlinks wird zudem als „keine Tagesnotiz“ interpretiert.  
Vorschlag: Main-seitige `assertSafePath`-/`realpath`-Prüfung bis zum tatsächlich gelesenen Ordner; bei nicht vorhandenem regulären Monatsordner `[]`, bei Symlink/unklarer Lage `null`. Integrationstest mit internem, externem und gebrochenem Symlink.

### F22 — Bilanz meldet Lesefehler als Null und Plugin-Kanäle als Vorgänge
Schwere: mittel  
datei:zeile: `app/src/main/activityLedger.ts:50-60,199-205`, `app/src/main/noteAgent/dayOverview.ts:44-56`, `app/src/shared/dayOverview.ts:84-103`  
Status: [OFFEN]  
`readActivitySummary` wirft bei fehlender oder beschädigter Ledger-Datei nicht, sondern liefert eine Nullbilanz. Das `try/catch` in `buildDayOverview` erzeugt deshalb nie den versprochenen „nicht lesbar“-Status. Außerdem ist `jobs.completedTotal` die Anzahl abgeschlossener `(jobId, jobType)`-Kanäle (`activityLog.ts:806-824`), nicht die Zahl eindeutiger „Plugin-Vorgänge“. Ein einziger Vorgang mit mehreren Kanälen erscheint als mehrere abgeschlossene Vorgänge.  
Vorschlag: Ledger-Lesestatus separat liefern und im Tool als fehlend/beschädigt kennzeichnen; Plugin-Zeile „abgeschlossene Plugin-Kanäle“ nennen oder eindeutige Job-IDs zählen. Fehler- und Mehrkanaltest ergänzen.

### F23 — Sichtbare Kürzung lässt abgeschnittene Zeilen als Befund stehen
Schwere: mittel  
datei:zeile: `app/src/shared/dayOverview.ts:45-49,105-109`, `app/src/main/noteAgent/skills.ts:863-867`  
Status: [OFFEN]  
Die Ausgabe wird am Ende per `text.slice(...)` **mitten in einer Zeile** gekappt und erst danach mit „gekürzt“ versehen. Das Modell kann einen halben Aufgabentext oder Pfad als vollständigen Befund verwenden; die zuvor berechneten Abschnittszahlen gelten weiter für abgeschnittene Einträge. Die Budgetwahl erzwingt mindestens 600 Zeichen, auch wenn das Laufbudget kleiner ist.  
Vorschlag: Ganze Einträge priorisiert hinzufügen, fehlende je Abschnitt zählen und den Schluss im Budget reservieren; nie mitten in Namen schneiden. Test mit langem Pfad genau an der Budgetgrenze und kleinem `maxResultTokens`.

### F24 — Integrations- und Regressionstests fehlen an den entscheidenden Grenzen
Schwere: mittel  
datei:zeile: `app/src/main/dayLog.test.ts:29-80`, `app/src/shared/dayLog.test.ts:7-35`, `app/src/shared/dayOverview.test.ts:13-71`, `app/src/main/noteAgent/loop.ts:200-214,267-269`  
Status: [OFFEN]  
Die neuen Tests prüfen pure Formatierung und direkte `recordNoteWrite`-Aufrufe. Sie prüfen weder `writeFileSafe` samt Backup/Lesefehler/Race noch Brain-Sensor/Renderer-IPC, den Symlink-Pfad, das Agent-Tool im echten Loop oder normale Schreibaufträge nach der neuen Prompt-Regel. Der Prompt enthält weiterhin „SCHREIBE danach“ und „ANTWORTE, was du erzeugt hast“ neben der Ausnahme für Tagesfragen; kleine Modelle können beides unterschiedlich priorisieren.  
Vorschlag: Vor Abnahme wenige gezielte Integrationstests: Write erfolgreich bei Log-Fehler, zwei parallele Saves, Agent-Übernahme als Neuanlage, Mail-/Telegram-Schreibweg, Brain ohne Log, Cloud-Symlink und ein normaler Schreibauftrag plus reine Tagesfrage mit/ohne Web. Die 1-Lauf-Messung in verschiedenen Vaults nicht als Qualitätsnachweis verwenden.

**Gesamtempfehlung Runde 2:** Vor Freigabe zuerst F11–F14 und F21 beheben, weil sie Fehler an der Schreib- und Sicherheitsgrenze betreffen. Danach die tatsächliche Schreibweg-Abdeckung und die Semantik der Checkbox-/Notizereignisse (F15–F20, F22) korrigieren; erst dann den Tagesüberblick mit gezielten Integrationsfällen und reproduzierbaren Modellläufen abnehmen.

### Runde 3 — Gegenprüfung der Korrekturen zu F11–F24 (Findings ab F25 hier anhängen)

### F25 — Leerschreib-Schutz liegt außerhalb der neuen Sperre
Schwere: kritisch  
datei:zeile: `app/src/main/index.ts:2313-2324`, `app/src/main/index.ts:2357-2378`  
Status: [OFFEN]  
F13 ist nur für den normalen inneren Ablauf adressiert. Der Empty-Write-Block prüft `fs.stat` **vor** `withNoteWriteLock`. Zwei Aufrufe auf eine zunächst leere `.md` können so laufen: leerer Aufruf sieht Größe 0 und wartet; anderer Aufruf schreibt Inhalt; der leere Aufruf erhält danach den Lock und überschreibt den neuen Inhalt mit `''`. Dieselbe Sperre schützt den exklusiven `wx`-Pfad nicht. Die Aussage „je Notiz EIN Lesen–Backup–Schreiben“ gilt daher nicht für alle `writeFileSafe`-Wege.  
Vorschlag: Empty-Write-Prüfung in den kanonischen Notiz-Lock ziehen und den exklusiven Pfad mit derselben Sperre koordinieren. Test mit kontrollierter Reihenfolge `stat(leer) → Write(Inhalt) → Write(leer)`; Inhalt muss erhalten bleiben.

### F26 — Task-Handler prüfen und bauen Inhalt vor dem Lock
Schwere: hoch  
datei:zeile: `app/src/main/index.ts:2821-2837`, `app/src/main/index.ts:2853-2870`, `app/src/main/index.ts:2296-2305`  
Status: [OFFEN]  
Die neue Sperre verhindert überlappende innere Writes, aber `tasks-update-line` liest und prüft `expectedOldLine` **davor**; ein Editor-Write kann danach dieselbe Datei ändern. Der Task-Handler schreibt anschließend seine aus der alten Fassung gebaute ganze Datei und verliert die Editor-Änderung. `tasks-create` liest ebenfalls vor der Sperre, sodass zwei Erzeugungen oder ein Autosave einander überschreiben können. Der Diff protokolliert dann möglicherweise einen Übergang aus einem Stand, der kurz darauf verloren geht. F13 ist für diese wichtigen Aufrufstellen nicht vollständig adressiert.  
Vorschlag: Read/Compare/Modify/Write als eine Operation unter demselben Notiz-Lock ausführen; Workflow-Append (`index.ts:2779-2797`) und ähnliche Read-Modify-Write-Wege ebenso. Gegeneinander laufenden Editor-/Task-Write und zwei Task-Anlagen testen.

### F27 — Nachführen ändert die Geschichte einer Umbenennung
Schwere: mittel  
datei:zeile: `app/src/shared/dayLog.ts:185-196`, `app/src/main/dayLog.ts:208-220`, `app/src/shared/dayLog.ts:241-253`  
Status: [OFFEN]  
F17 ist für einfache Pfadwechsel verbessert, aber `remapDayLogPaths` schreibt `note` auch in alten `note-moved`-Ereignissen um und lässt `from` unverändert. Aus `A.md → B.md` und später `B.md → C.md` macht die Übersicht für den ersten Vorgang `A.md → C.md`; der tatsächlich an jenem Tag erfolgte Schritt `A.md → B.md` verschwindet. Bei einem Ordnerwechsel geschieht dasselbe für enthaltene Move-Ereignisse. Der vorhandene Test verlangt genau dieses Umschreiben (`main/dayLog.test.ts:131-143`) und verdeckt den Fehler.  
Vorschlag: Historische `from/to`-Pfade von Move-Ereignissen unverändert lassen; einen getrennten aktuellen Zielpfad für die Textauflösung alter Task-/Save-Ereignisse führen. Zwei aufeinanderfolgende Umbenennungen an verschiedenen Tagen testen.

### F28 — `seenSaves` übersieht eine nachträglich fehlende Logdatei
Schwere: mittel  
datei:zeile: `app/src/main/dayLog.ts:70-75`, `app/src/main/dayLog.ts:116-126`, `app/src/main/dayLog.ts:172-188`, `app/src/main/dayLog.ts:236-249`  
Status: [OFFEN]  
F12 ist für einen fehlgeschlagenen `writeAtomic` adressiert: der Cache wird dann gelöscht. F19s Behauptung „bei fehlender Datei verworfen“ gilt aber nur, **wenn `commit` überhaupt erreicht wird**. Nach externem Entfernen der Logdatei liefert `recordNoteWrite` bei einem am selben Tag schon bekannten Pfad an Zeile 186 sofort zurück; es prüft die Datei nicht und legt kein neues Protokoll an. Auch `readDayLog` meldet `missing`, ohne den Cache zu löschen. Ein weiterer normaler Autosave derselben Notiz bleibt unsichtbar, bis ein anderer Pfad einen Commit auslöst.  
Vorschlag: Cache beim `missing`-Read invalidieren; für die schnelle Rückgabe eine Dateirevision/Existenzprüfung oder einen ausdrücklich begrenzten Cache-Lebenszyklus verwenden. Datei nach erstem Save entfernen, lesen und denselben Pfad erneut speichern als Test.

### F29 — Lücken können beim Absturz oder nach 200 Ausfällen verschwinden
Schwere: mittel  
datei:zeile: `app/src/main/dayLog.ts:74-75`, `app/src/main/dayLog.ts:96-103`, `app/src/main/dayLog.ts:130-146`, `app/src/main/dayLog.ts:236-249`  
Status: [OFFEN]  
F19 ist nur für einen **später im selben Prozess erfolgreich beendeten** Log-Write adressiert. `failedSince` liegt ausschließlich im Speicher; endet die App nach einem fehlgeschlagenen Log-Write, bleibt die alte Datei ohne Lückenmarker und ein Tagesüberblick kann den ausgefallenen Zeitraum als vollständig ausgeben. `gaps.slice(-200)` verwirft ältere Lücken ohne die Abdeckung `since` entsprechend zurückzunehmen.  
Vorschlag: Nach Neustart keine lückenlose Abdeckung behaupten, solange nicht ein dauerhafter Health-Marker existiert; bei Gap-Kappung `since` konservativ auf die jüngste noch belastbare Grenze schieben oder einen aggregierten Lückenstatus behalten. Neustart nach Log-Schreibfehler und >200 Lücken testen.

### F30 — Fehlendes Tageslog wird im Brain wieder als gemessene Null behandelt
Schwere: hoch  
datei:zeile: `app/src/renderer/utils/brainSensors.ts:38-45`, `app/src/renderer/utils/brainSensors.ts:161-167`, `app/src/main/brain/dailyConsolidation.ts:55-63,275-283`  
Status: [OFFEN]  
F20 ist für `broken` verbessert, aber `loadDayLog` gibt bei `state: 'missing'` ein **Objekt** mit `since:null` zurück. `tasksCompletedKnown = !!dayLog` wird dadurch `true`; der Brain-Prompt erhält „Checkboxen auf erledigt gesetzt: 0“, obwohl das Protokoll noch nie geführt wurde. Bei `broken` heißt es im Prompt zwar „nicht gemessen“, das Frontmatter der geschriebenen Brain-Notiz trägt trotzdem `tasks_completed: 0`. Damit bleibt eine unbekannte Zahl dauerhaft als Messwert erhalten.  
Vorschlag: Nur `state:'ok'` als bekannte Quelle weitergeben; `completedKnown` zusätzlich an `since` und Lücken koppeln. Im Frontmatter `null`/`unknown` oder ein eigenes `tasks_completed_measured`-Feld schreiben. Tests für `missing`, `broken`, Teil-Tag und Gap.

### F31 — „Angelegt“ ist bei direkten Importwegen nicht atomar belegt
Schwere: mittel  
datei:zeile: `app/src/main/index.ts:2085-2088`, `app/src/main/index.ts:3222-3227`, `app/src/main/index.ts:13064-13071`, `app/src/main/index.ts:13233-13246`, `app/src/main/email/ipc.ts:2280-2285`  
Status: [OFFEN]  
F17 hat die genannten Wege an das Log angeschlossen, aber mehrere Handler bestimmen einen freien Namen mit `access` und schreiben danach ohne `wx`/`COPYFILE_EXCL`. Zwischen Prüfung und Write kann ein anderer Vorgang die Datei anlegen; dann überschreibt der Import/Transport deren Inhalt und protokolliert trotzdem `created:true`. `create-note` macht dasselbe mit `existed` vor `writeFile`. `duplicate-file` kopiert ohne Exklusivflag. Die neue Telemetrie ist an diesen Stellen kein verlässlicher Neuanlage-Nachweis und die Konkurrenz kann Notizdaten verlieren.  
Vorschlag: Neuanlage an den atomaren Dateisystemerfolg (`wx`/exklusives Copy) binden; vorhandene Datei nie aus einem alten `access`-Befund als neu verbuchen. Kollision zwischen zwei Importen beziehungsweise Import und Editor gezielt testen.

### F32 — Alttext-Bereinigung beim Lesen ist nur vorgemerkt
Schwere: mittel  
datei:zeile: `app/src/main/dayLog.ts:42-57`, `app/src/main/dayLog.ts:236-249`, `app/src/main/dayLog.ts:63-68`, `app/src/main/dayLog.test.ts:82-93`  
Status: [OFFEN]  
Variante A speichert neue Task-Ereignisse tatsächlich ohne Klartext: `key`, Pfad und Zeit statt `text`. Der Altbestand wird beim Lesen aber nur per `void commit(...)` **asynchron** zur Bereinigung vorgemerkt. Die erste Antwort liefert bereits normalisierte Daten, während die alte JSON-Datei mit Klartext noch auf der Platte liegt; scheitert der Cleanup-Write oder endet der Prozess vor ihm, bleibt sie dort. Der Test wartet eigens auf einen zweiten `readDayLog` und beweist damit nicht die Behauptung „nach dem ersten Lesen bereinigt“. Eine eventuell liegengebliebene alte `.tmp`-Datei wird ebenfalls nicht untersucht.  
Vorschlag: Den Cleanup vor Rückgabe des ersten erfolgreichen Reads abwarten und Fehler als sichtbaren Bereinigungsstatus melden; alte temporäre Dateien beim Start/Lesen prüfen und sicher entfernen. Test: unmittelbar nach **einem** Read die Datei prüfen, dann erzwungener Schreibfehler und Prozessabbruch.

### F33 — Hash-Auflösung kann anderen aktuellen Tasktext ausgeben
Schwere: niedrig  
datei:zeile: `app/src/shared/dayLog.ts:73-81,142-145`, `app/src/main/noteAgent/dayOverview.ts:70-87`, `app/src/shared/dayOverview.ts:89-91`  
Status: [OFFEN]  
Variante A liest Tasktexte nun aus dem Vault, aber `taskKey` ist nur ein 32-Bit-FNV-Hash. Wenn mehrere gleichlautende Aufgaben oder eine Hash-Kollision in einer Notiz vorkommen, kann `findTaskText` nicht die historische Zeile identifizieren; es nimmt den ersten aktuellen Treffer, sogar wenn diese Checkbox wieder offen ist. Der Text im Tagesüberblick ist damit ein **heutiger Text mit passender Prüfsumme**, nicht zwingend der damalige Task. Der Code kennzeichnet diese Einschränkung nicht an der Zeile.  
Vorschlag: Text als „aktueller passender Checkbox-Text“ kennzeichnen und bei Bedarf nur Zähler/Pfad zeigen. Keine historische Identität aus der Prüfsumme behaupten; Kollisions- und Wiederöffnungsfall testen.

### F34 — Neue Sicherheitsprüfung hat eine Pfad-Race zwischen Check und Read
Schwere: mittel  
datei:zeile: `app/src/main/noteAgent/dayOverview.ts:19-45,51-64,70-81`  
Status: [OFFEN]  
F21 ist für statische externe und gebrochene Symlinks adressiert. `realInsideVault` prüft jedoch per `realpath` und gibt anschließend einen **Pfadnamen** zurück; `readdir` beziehungsweise `stat`/`readFile` öffnen ihn später erneut. Wird ein Verzeichnis oder eine Notiz zwischen Check und Öffnen durch einen Symlink nach außen ersetzt, kann die Auflistung beziehungsweise der Tasktext aus einem nicht freigegebenen Pfad stammen und an ein Cloud-Modell gehen. Die Tests prüfen nur ruhende Symlinks.  
Vorschlag: Öffnen/Lesen an überprüfte Dateideskriptoren oder eine gemeinsame sichere Pfad-Operation binden; mindestens Ziel nach Öffnen erneut gegen den Vault-Root prüfen. Einen kontrollierten Symlink-Tausch zwischen `realpath` und `readFile`/`readdir` testen.

**Gesamtempfehlung Runde 3:** F11, F12, F14, F22 und F23 sind im geprüften Code im Kern adressiert; F15/F16/F24 bleiben mit benannten Grenzen teilweise offen. F13/F17/F19/F20/F21 sind nur teilweise adressiert (F25–F31, F34). Variante A vermeidet neue Klartext-Aufgabentexte im Protokoll, aber die Bereinigung des Altbestands ist noch nicht verlässlich abgeschlossen (F32), und Pfade/Hashes bleiben personenbezogen ableitbar. Vor Abnahme zuerst den Leerschreib-Race und die Read-Modify-Write-Wege absichern, danach Brain-Nullwerte, Pfadhistorie, Cleanup und die Cloud-Lesegrenze korrigieren.

### Runde 4 — letzte Gegenprüfung, nur zu F25–F34 (Findings ab F35 hier anhängen)

### F35 — Exklusive Neuanlage umgeht weiterhin die Notiz-Sperre
Schwere: hoch  
datei:zeile: `app/src/main/index.ts:2296-2305`, `app/src/main/index.ts:2312-2327`, `app/src/main/index.ts:2374-2381`, `app/src/main/index.ts:2085-2089`, `app/src/main/index.ts:2407-2415`  
Status: [OFFEN]  
F25/F31 sind für je einen Aufruf verbessert, zusammen aber nicht sicher: `writeFileSafe` nimmt für Markdown `withNoteWriteLock`, `create-note` und `writeNewFileUnique` rufen `writeExclusive` dagegen **ohne** diesen Lock auf. Konkrete Folge: Ein normaler Write liest unter dem Lock `ENOENT`; während er auf Backup/Write wartet, legt `create-note` oder ein Import denselben Pfad exklusiv an und meldet Erfolg; danach überschreibt der normale Write die eben angelegte Datei. Beide Aufrufer melden Erfolg, die Neuanlage ist verloren. Im Fehlerpfad von `writeExclusive` kann die Inode-basierte Bereinigung sogar einen inzwischen von einem anderen Writer erfolgreich gefüllten, ursprünglich exklusiv geöffneten Pfad löschen. Die neuen Tests decken diese Mischung aus exklusivem und normalem Writer nicht ab.  
Vorschlag: Alle Markdown-Neuanlagen über denselben kanonischen Notiz-Lock führen, auch `create-note` und jeden Versuch in `writeNewFileUnique`; nach einem exklusiven Open darf kein anderer App-Writer denselben Pfad bis Abschluss/Bereinigung bearbeiten. Kontrollierten Interleaving-Test `normal liest ENOENT → exklusiv legt an → normal schreibt` und einen fehlgeschlagenen exklusiven Write mit wartendem Normal-Writer ergänzen.

**Gesamtempfehlung Runde 4:** Die Korrekturen zu F26–F28 und F30–F33 beheben die jeweils markierten Fälle im geprüften Code; F29 bleibt mit der dokumentierten Ausfallgrenze teilweise offen. Für F34 ist die statische Symlink-Grenze deutlich gehärtet; ein kontrollierter Tauschtest fehlt weiterhin. **F35 verhindert die Abnahme**, weil die neu angeschlossenen exklusiven Schreibwege mit dem normalen Notiz-Write Daten verlieren können. Erst den gemeinsamen Lock für alle Markdown-Neuanlagen schließen und den Interleaving-Test bestehen lassen.

## Claude-Antwort

Runde 1 (11.11.2026). Nutzerentscheidung nach Vorlage der Befunde: **erst das Fundament**
(echte Ereignisse an der Schreibgrenze, Brain-Zähler richtigstellen), **dann** der Tagesüberblick.

**Fundament — Tagesprotokoll** (`shared/dayLog.ts`, `main/dayLog.ts`, Tests daneben):
- Entsteht in `writeFileSafe` (`main/index.ts`), der einen Schreibgrenze für Markdown. Der Sync
  schreibt daran vorbei und taucht deshalb nicht auf.
- `task-checked`: derselbe Aufgabentext war vorher offen und ist jetzt abgehakt (`diffCheckedTasks`).
  Geänderter Text/Termin, neu eingefügte abgehakte Zeile, Wieder-Öffnen zählen nicht.
- `note-saved` (mit `created`): höchstens einmal je Notiz und Kalendertag; `.mindgraph/` und
  Brain-Tagesnotizen ausgenommen. `origin`: renderer | tasks | agent | app.
- Ablage `userData/daylog/<hash>.json` als `{ since, events }`, 365 Tage / 20 000, atomar, seriell;
  beschädigte Datei wird nicht überschrieben und als „nicht lesbar“ gemeldet.

- **F01 [ADRESSIERT]** — Zähler heißen nach dem, was sie messen („an diesem Tag übernommene
  Agent-Ergebnisse“, „beendete Läufe (davon fehlgeschlagen)“, „aus Mails erkannte Aufgaben … erkannt,
  nicht erledigt“); nicht lesbar → „keine verlässliche Bilanz“; Schlusszeile „0 heißt nichts gemessen“.
- **F02 [ADRESSIERT]** — echtes Abhak-Ereignis an der Schreibgrenze statt Renderer-Zähler.
  Brain-Sensor `tasks.completed` kommt jetzt aus dem Tagesprotokoll, `examples` nennt bis zu fünf
  Aufgabentexte (`renderer/utils/brainSensors.ts`). Ohne lesbares Protokoll bleibt der alte Wert als Ersatz.
- **F03 [ADRESSIERT]** — Brain-Sensor nutzt die Dateizeit nur noch, solange das Protokoll den Tag
  nicht abdeckt (`since` nach Tagesbeginn); danach `note-saved`. Der Tagesüberblick nutzt nie Dateizeiten.
- **F04 [ADRESSIERT durch Verzicht + teilweise]** — keine Mails im Tagesüberblick. Brain-Sensor:
  gesendet per `isSentMail`, „beantwortet“ nur bei `inReplyTo`/`references`/Antwort-Betreff. Abdeckung
  des Mailbestands bleibt unbeschriftet [OFFEN].
- **F05 [ADRESSIERT]** — keine weg-abhängige Kürzung; das Werkzeug liefert auf allen Wegen dasselbe
  (Aufgabentexte, Notizpfade, Zähler) und fällt unter die bestehende Karten-Aussage „alles, was der
  Agent liest“. Karte nicht eigens erweitert [OFFEN, Nutzerentscheidung].
- **F06 [ADRESSIERT, eng]** — `day_overview` nur ohne Webrecherche in der Allowlist; ein Regelsatz
  erlaubt dafür die direkte Antwort ohne Datei. Der allgemeine Schritt „SCHREIBE danach“ ist unverändert.
- **F07 [ADRESSIERT durch Verzicht]** — nicht im Petrol-Chat.
- **F08 [ADRESSIERT]** — lokaler Kalendertag bis zur nächsten Mitternacht (`localDayBounds`, DST-Test),
  strenge Datumsprüfung, Zukunft abgelehnt; Brain-Ordner aus den Einstellungen, `TT.md` und `TT (n).md`,
  außerhalb des Vaults/Lesefehler → „nicht geprüft“. Die 4-Uhr-Grenze der Brain-Sensoren ist unverändert [OFFEN].
- **F09 [ADRESSIERT]** — reine Formatfunktion `shared/dayOverview.ts` mit hartem Budget, sichtbarer
  Kürzung („… und N weitere“, „gekürzt“), Status je Quelle; Vault nur aus dem Lauf.
- **F10 [TEILWEISE]** — Tests an festen Fällen; Messlauf am Test-Vault siehe Status.

Ebenfalls im Arbeitsbaum: Datum (lokal, mit Wochentag) immer im Auftrag; `note_read` ergänzt `.md`.

### Runde 2 (11.11.2026) — Antwort auf F11–F24

Nutzerentscheidung nach Vorlage der Befunde: alles umsetzen; zu F18 **Variante A** — das Protokoll
speichert keinen Aufgabentext mehr, nur Notizpfad, Zeitpunkt und eine Prüfsumme.

- **F11 [ADRESSIERT]** — `noteWriteForDayLog` (index.ts) und `recordNoteWrite`/`recordNoteMove`
  (dayLog.ts) fangen auch die synchrone Vorarbeit ab; Test „wirft auch bei kaputten Eingaben nie“.
- **F12 [ADRESSIERT]** — `seenSaves` wird erst nach geglücktem `writeAtomic` gesetzt, nach einem
  Fehler verworfen; `created` wird gegen vorhandene Einträge des Tages abgeglichen. Tests: Fehler →
  erneutes Autosave schreibt den Eintrag; zwei gleichzeitige Erst-Schreiber → ein `created`.
- **F13 [ADRESSIERT]** — `writeFileSafe` liest die Vorfassung einmal und gibt sie an
  `backupMarkdownBeforeWrite` weiter; Sperre je Notiz über Lesen–Backup–Schreiben
  (`withNoteWriteLock`). Am laufenden Programm: zwei gleichzeitige `write-file` auf dieselbe Notiz
  → genau zwei Checkbox-Ereignisse, nicht vier. Der Checkbox-Vergleich läuft weiter bei jedem
  Autosave (zeilenweise, ohne Dateizugriff) [bewusst so].
- **F14 [ADRESSIERT]** — nur `ENOENT` gilt als „Datei fehlt“. Anderer Lesefehler → `before:
  undefined`: `note-saved created:false`, kein Checkbox-Vergleich, Warnung im Log, dass dieses
  Schreiben ohne Backup lief. Der Schreibvorgang selbst wird nicht blockiert [bewusst so: sonst
  ginge die Eingabe des Nutzers verloren].
- **F15 [TEILWEISE]** — nummerierte Listen und „+“ zählen nicht mehr (wie `taskExtractor`). Die
  Identität bleibt der Text: offene Zeile löschen + gleichlautende abgehakte einfügen ergibt einen
  Treffer (Test „Grenze“). Dafür heißt es jetzt überall „Checkbox auf erledigt gesetzt“, die
  Schlusszeile sagt „kein Nachweis, dass die Sache erledigt ist“. Keine stabile Aufgaben-ID
  eingeführt [OFFEN, bräuchte Eingriff ins Notizformat].
- **F16 [ADRESSIERT]** — `taskLines`: Zitate/Hinweiskästen eingeschlossen, Zeilen in ```/~~~-Blöcken
  ausgenommen (auch in Kästen), Tests dazu. Eingerückte Code-Blöcke (vier Leerzeichen) werden nicht
  erkannt [OFFEN — nicht von einer eingerückten Unterliste unterscheidbar ohne Markdown-Parser].
- **F17 [ADRESSIERT, mit benannten Ausnahmen]** — angeschlossen: `create-note`, Duplizieren,
  Schnellerfassung (Notiz, Zettel), Word-/PowerPoint-Import, Projektstatus-Marker, Mail zu Notiz;
  Agent-Übernahme vermerkt `created: true`; Umbenennen/Verschieben als `note-moved`, Pfade alter
  Einträge werden nachgezogen (auch bei Ordnern). Bewusst nicht erfasst und in der Schlusszeile
  des Werkzeugs genannt: Readwise-Abgleich, Telegram-Bot, Projektstatus-Automatik, Anki-Import,
  Löschen. Inventar in `.claude/rules/dashboard.md`.
- **F18 [ADRESSIERT, Variante A]** — `task-checked` trägt `key` (FNV-1a, 32 Bit) statt `text`.
  Text wird beim Abruf aus der Notiz gelesen (`findTaskText`; Agent: `resolveTaskTexts`, Brain:
  Notizinhalt im Renderer). Altbestand mit Klartext wird beim Lesen umgerechnet und sofort
  bereinigt (am Testprofil geprüft: 3 Klartext-Einträge → 0). Notizpfade bleiben im Protokoll.
  Nicht umgesetzt: Löschen des Protokolls beim Entfernen eines Vaults, eigene Zeile auf der Karte
  „Welche Daten wohin gehen“ [OFFEN, Nutzerentscheidung]. Eine 32-Bit-Prüfsumme ist kein
  Geheimnisschutz gegen Raten kurzer Texte — sie ist nur kein Inhalt.
- **F19 [ADRESSIERT]** — Cache wird nach Fehler und bei fehlender Datei verworfen; `since` rückt
  bei Aufbewahrung/Obergrenze mit; neues Feld `gaps` für Zeiträume, in denen nicht geschrieben
  werden konnte (Werkzeug nennt sie, Brain-Sensor behandelt den Tag als nicht abgedeckt).
  Profilwechsel im laufenden Prozess gibt es nicht (userData steht ab Start fest).
- **F20 [ADRESSIERT, 04:00 offen]** — bei abgedecktem Tag kommen „angelegt“/„bearbeitet“ nur aus
  dem Protokoll, Renderer-Ereignisse liefern nur „geöffnet“; exakter Pfad statt Pfad-Ende; ohne
  lesbares Protokoll `completedKnown: false`, Prompt „nicht gemessen (keine Zahl nennen)“. Die
  4-Uhr-Grenze der Brain-Sensoren bleibt [OFFEN]. `tasks_completed` im Frontmatter bleibt eine Zahl.
- **F21 [ADRESSIERT]** — `realInsideVault` (realpath) für den Brain-Ordner und für jede Notiz, aus
  der ein Aufgabentext gelesen wird; Verknüpfung nach außen oder ins Leere → „nicht geprüft“ bzw.
  kein Text; nur reguläre Dateien werden aufgelistet. Tests mit interner, externer, gebrochener
  Verknüpfung und `..`.
- **F22 [ADRESSIERT]** — `activityLedgerState` unterscheidet fehlend/kaputt/ok; Zeile heißt
  „abgeschlossene Plugin-Kanäle (ein Vorgang kann mehrere Kanäle haben)“.
- **F23 [ADRESSIERT]** — gekürzt wird nur an Zeilengrenzen, Schlusszeile im Budget reserviert,
  Hinweis nennt die Zahl fehlender Zeilen; kein 600-Zeichen-Minimum mehr. Die Abschnittszahlen in
  den Überschriften bleiben die echten Gesamtzahlen.
- **F24 [TEILWEISE]** — neu: `main/noteAgent/dayOverview.test.ts` (Verknüpfungen, Textauflösung,
  Zustand des Tätigkeitsprotokolls), erweiterte Tests in `main/dayLog.test.ts` und `shared/`.
  `writeFileSafe` selbst hat weiter keinen automatischen Test (`index.ts` ist nicht importierbar);
  geprüft am laufenden Programm, siehe Status. Prompt-Regeln („SCHREIBE danach“) unverändert,
  Wiederholungsmessungen stehen aus [OFFEN].

### Runde 3 (11.11.2026) — Antwort auf F25–F34

Nutzerentscheidung: alles beheben, F31 mitmachen, F29 zum Teil; danach eine letzte kurze Runde.

- **F25 [ADRESSIERT]** — Leerschreib-Schutz, Lesen der Vorfassung, Backup, Schreiben und Protokoll
  liegen jetzt in `writeMarkdownLocked` unter der Notiz-Sperre; der exklusive Weg läuft für Markdown
  unter derselben Sperre. Am laufenden Programm: leere Notiz, gleichzeitig leer / „Inhalt“ / leer
  geschrieben → Inhalt bleibt, der späte leere Schreiber wird abgelehnt.
- **F26 [ADRESSIERT]** — neuer Helfer `updateMarkdownSafe(pfad, alt => neu)`; `tasks-update-line`,
  `tasks-create` und die beiden Workflow-Wege (Notiz anhängen, Aufgabe anlegen) lesen, prüfen und
  schreiben unter der Sperre. Am laufenden Programm: zwei gleichzeitige `tasks-create` → beide
  Zeilen vorhanden; veraltete `expectedOldLine` → abgelehnt. Grenze: der Editor schreibt weiter die
  GANZE Notiz aus seinem Stand — speichert er nach einem Abhaken im Aufgaben-Dialog eine ältere
  Fassung, gewinnt er (das ist Sache des Renderers, nicht der Schreibgrenze) [OFFEN, bekannt].
- **F27 [ADRESSIERT]** — `remapDayLogPaths` lässt `note-moved` unverändert; Test mit A → B, B → C.
- **F28 [ADRESSIERT]** — vor der schnellen Rückgabe wird die Existenz der Datei geprüft; `missing`
  beim Lesen verwirft den Speicher. Test: Datei entfernen, dieselbe Notiz erneut speichern.
- **F29 [TEILWEISE]** — Ausfallbeginn wird in `<datei>.gap` neben dem Protokoll abgelegt und beim
  nächsten Programmlauf übernommen; fällt eine Lücke über die Obergrenze, rückt `since` hinter ihr
  Ende. Lässt sich auch der Vermerk nicht schreiben (Profilordner ganz unbeschreibbar) und endet die
  App, ist der Ausfall nicht belegt [OFFEN, dokumentierte Grenze].
- **F30 [ADRESSIERT]** — `loadDayLog` gibt nur ein lesbares, geführtes Protokoll weiter;
  `completedKnown` verlangt zusätzlich, dass es in den Tag reicht und der Tag keine Lücke hat;
  Frontmatter `tasks_completed: null` bei unbekannt (`BrainConstellation` rechnet mit `|| 0`).
- **F31 [ADRESSIERT]** — exklusive Neuanlage: `create-note` (`wx`; vorhandener Name → Fehler statt
  Überschreiben), Duplizieren (`COPYFILE_EXCL`, nächster freier Name), Word-/PowerPoint-Import und
  beide Schnellerfassungen (`writeNewFileUnique`), Mail zu Notiz (`wx`; vorhanden → `alreadyExists`).
  Am laufenden Programm: zweites `create-note` auf denselben Namen → EEXIST, Inhalt unberührt;
  zweimal Duplizieren → „Kopie“ und „Kopie 2“.
- **F32 [ADRESSIERT]** — `readDayLog` wartet die Bereinigung ab und prüft das Ergebnis (Warnung im
  Log, wenn Klartext bleibt); liegengebliebene `.tmp` wird je Programmlauf einmal entfernt. Test
  prüft die Datei nach EINEM Lesen.
- **F33 [ADRESSIERT durch Beschriftung]** — Überschrift „… — Wortlaut aus dem heutigen Stand der
  Notiz“; `findTaskText` zieht eine abgehakte Zeile einer offenen vor. Keine historische Identität.
- **F34 [ADRESSIERT]** — `readVerified`: ein Dateizugriff mit `O_NOFOLLOW`, danach erneute Prüfung
  von wirklichem Ort und Datei (ino/dev); Ordnerliste wird verworfen, wenn sich der wirkliche Ort
  zwischen Prüfung und Auflistung geändert hat. Kein Test mit kontrolliertem Tausch [OFFEN].

Belege Runde 3: Typprüfung grün, 277 Testdateien / 3818 Tests grün, Build grün. Nicht am laufenden
Programm geprüft: Mail zu Notiz, Schnellerfassung, Word-/PowerPoint-Import, Workflow-Wege.

### Runde 4 (11.11.2026) — Antwort auf F35

- **F35 [ADRESSIERT]** — jede Markdown-Neuanlage läuft unter der Notiz-Sperre mit dem kanonischen
  Pfad als Schlüssel: `create-note`, jeder Versuch in `writeNewFileUnique` (Importe,
  Schnellerfassung), Duplizieren (`COPYFILE_EXCL` unter der Sperre), Mail zu Notiz jetzt über
  `writeFileSafe(…, { exclusive: true })` statt eigenem `wx` (der Abhängigkeits-Eintrag `noteCreated`
  entfiel). Am laufenden Programm (Testprofil): 40 Runden „normales Schreiben auf fehlende Datei“
  gleichzeitig mit `create-note` auf denselben Pfad → in 4 Runden meldeten beide Erfolg, jedes Mal
  stand danach der Inhalt des normalen Schreibers (er lief nach der Neuanlage); in 36 Runden wurde
  die Neuanlage mit EEXIST abgelehnt. Kein Fall, in dem eine gemeldete Neuanlage ungesehen
  verschwand. Kein automatischer Test mit kontrollierter Reihenfolge (`index.ts` nicht importierbar) [OFFEN].
  Belege: Typprüfung grün, 277 Testdateien / 3818 Tests grün, Build grün. Keine weitere Codex-Runde
  (mit dem Nutzer so vereinbart).

## Status

Runden 2–4 umgesetzt (11.11.2026), nicht committet. Abnahme durch den Nutzer steht aus.

Belege Runde 2: `npm run typecheck` grün; `npm run test` (60 s Frist) 277 Dateien / 3816 Tests grün
in zwei von drei vollständigen Läufen — im ersten Lauf fiel EIN Test, dessen Name nicht
festgehalten wurde und der sich nicht wiederholte; `npm run build` grün.

Am laufenden Programm (Dev-App, Testprofil, Test-Vault):
- Altbestand: Protokolldatei mit 3 Klartext-Aufgabentexten → nach dem ersten Lesen 0 Textfelder,
  Datei enthält nur noch `at, kind, note, key, created, from, origin`.
- Eine Notiz: `create-note` → `note-saved created`; zwei gleichzeitige `write-file`, die je vier
  Checkboxen abhaken (normal, im Kasten, nummeriert, im Code-Block) → genau 2 `task-checked`
  (normal + Kasten); Duplizieren → `note-saved created` für die Kopie; Umbenennen → `note-moved`,
  alle früheren Einträge der Notiz tragen den neuen Pfad.
- Agent-Lauf „Sage mir was ich heute erledigt habe“, qwen3.8:27b-mlx lokal: 1 Schritt, 94 s, keine
  Datei; nennt 7 Checkbox-Klicks (stimmt mit dem Protokoll), davon einen als „Text steht nicht mehr
  in der Notiz“, 4 angelegte Notizen, 1 Umbenennung, Beginn 20:09 Uhr und „kein Nachweis, dass die
  Sache erledigt ist“. EIN Lauf.

Nicht am laufenden Programm geprüft: Mail zu Notiz, Schnellerfassung, Word-/PowerPoint-Import,
Agent-Übernahme als Neuanlage, Verschieben, Brain-Tagesnotiz mit dem neuen Sensor, Lesefehler der
Vorfassung.

### Stand nach Runde 1 (überholt)

Runde 1 umgesetzt (11.11.2026), nicht committet. Abnahme durch den Nutzer und Codex-Review des
Codes stehen aus.

Belege: `npm run typecheck` grün, `npm run test` 276 Dateien grün (mit 60 s Frist; die Umgebungsprobe
in `shellExecution.test.ts` läuft auf diesem Rechner sonst in die 5-s-Frist — unabhängig von dieser
Änderung), `npm run build` grün.

Am laufenden Programm (Dev-App, Testprofil, Test-Vault):
- Schreibgrenze: Notiz anlegen → `note-saved created`; Termin an Aufgabe ergänzen → kein Ereignis;
  Aufgabe abhaken → `task-checked` mit `origin: tasks`.
- Agent-Lauf „Sage mir was ich heute erledigt habe“, qwen3.8:27b-mlx lokal, Web aus: **1 Schritt
  (`day_overview`), 77 s, keine Datei, Antwort richtig** — drei abgehakte Aufgaben mit Notiz, zwei
  angelegte Notizen, „Protokoll begann um 20:09 Uhr, davor nichts erfasst“, „keine Brain-Tagesnotiz“.
  Vorher (Produktiv-Vault, gleicher Auftrag): 8 Schritte, > 7 min, falsch. Je EIN Lauf, verschiedene
  Vaults — ein Hinweis, kein A/B.

Offen: Wiederholungen der Messung; Brain-Tagesgrenze 04:00; Abdeckung des Mailbestands; ob die
Karte „Welche Daten wohin gehen“ den Tagesüberblick eigens nennen soll; Dashboard nutzt das
Tagesprotokoll noch nicht.
