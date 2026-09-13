# Optionaler Shell-Zugriff des Agenten

## Aufgabe

Nutzerauftrag vom 12.09.2026: Shell-Zugriff und Skriptausführung ausdrücklich erlauben können.

## Kontext/Anker

- `main/noteAgent/loop.ts`, `skills.ts`, `runRegistry.ts`
- `docs/agent-skills-plan.md`: bisher ausdrücklich keine Skriptausführung.

## Codex-Findings

Umsetzung in Arbeit: standardmäßig aus; Aktivierung pro Lauf, native Bestätigung im Main vor Freigabe. Echte Benutzerrechte, keine Sandbox-Zusage. Laufabbruch, Prozessbeendigung, Zeit-/Ausgabelimits; Ergebnisdateien optional weiter über Staging/Übernehmen. Shell und der streng begrenzte Webrecherche-Modus werden nicht kombiniert. Skill-Import bewahrt Skripte als inaktive Dateien.

### Nachprüfung vom 13.09.2026 (Codex)

Nutzerauftrag: Änderungen des Vortags prüfen und ihren Nutzen ehrlich bewerten. Geprüft wurde der uncommittete Arbeitsstand gegenüber HEAD vom 11.09.; ohne Commit lässt sich die genaue zeitliche Zuordnung einzelner Änderungen nicht aus Git belegen. Kein Anwendungscode geändert.

Gesamturteil: sinnvoller experimenteller Erweiterungspunkt für Aufgaben, die vorhandene Werkzeuge nicht abdecken. Für das Zusammenführen gleichartiger Tabellen ist der Nutzen bislang nicht belegt; `collect_table` bleibt der passendere Standardweg. Die neuen Komponenten sind überschaubar und nutzen den vorhandenen Loop sowie Staging. Die wesentliche offene Frage ist die Produktgrenze zwischen Ergebnisvorschlag und unmittelbarer Ausführung mit Benutzerrechten.

### F01 — Die vorhandene Modellsperre schützt Shell-Läufe nicht
Schwere: hoch
Code-Stelle: `app/src/main/index.ts:4330`, `app/src/shared/modelCompatibility.ts:217`, `app/src/shared/modelCompatibility.ts:856`
Status: [OFFEN]
Der Main ruft `isHardLocked(model, 'note-agent')` auf, aber `note-agent` hat `damageRelevant: false`; der Check liefert deshalb immer false. Der Kommentar über eine Sperre roter Modelle ist irreführend. Die neue Shell-Ausführung übernimmt damit einen für überprüfbare Entwürfe gedachten Modus für unmittelbare Nebenwirkungen. Native Freigabe und ehrlicher Dialog sind vorhanden; eine zusätzliche Shell-spezifische Modellentscheidung fehlt ebenso wie das vorgeschlagene Modul-Opt-in.
Vorschlag: Shell zunächst als explizite experimentelle Fähigkeit hinter einem standardmäßig deaktivierten Modul führen; Modellregeln für diese Fähigkeit bewusst festlegen. Eine gute Bewertung bei Aufgabenextraktion wäre allein noch kein Nachweis sicherer Shell-Nutzung.

### F02 — Reine Shell-Auswertungen verlieren ihre fachliche Zuordnung in der Arbeitsbilanz
Schwere: mittel
Code-Stelle: `app/src/shared/activityLog.ts:388`, `app/src/main/noteAgent/shellTools.ts:79`
Status: [OFFEN]
`deriveActivityType` erkennt Tabellenarbeit nur an `collect_table`/`write_xlsx`. Ein fachlich identischer Lauf mit `shell_execute` + `shell_stage_file` landet unter `other`. Außerdem werden per Shell gelesene Dateien nicht einzeln in `run.sources` erfasst; die Ergebnis-Karte ergänzt lediglich „Shell-Ausführung“. Dauer und Ergebniszahl werden weiterhin erfasst, aber Tätigkeitsvergleich und Quellenbeleg sind nicht gleichwertig.
Vorschlag: Für den Vergleich die Aufgabenklasse unabhängig vom gewählten Werkzeug festhalten. Bei Shell-Ergebnissen die eingeschränkte Quellenverfolgung sichtbar machen, keine vollständige Quellenliste suggerieren.

### F03 — Umgebungserkennung ist nützlich, aber ihre Zusage ist stärker als ihre Prüfung
Schwere: mittel
Code-Stelle: `app/src/main/noteAgent/shellExecution.ts:96`, `app/src/main/noteAgent/loop.ts:71`
Status: [OFFEN]
Die Probe nutzt `importlib.util.find_spec`, keinen tatsächlichen Import. Auffindbare Pakete können wegen fehlender Abhängigkeiten oder inkompatibler Binärdateien trotzdem nicht funktionieren. Windows beendet die Python-Suche nach dem ersten gefundenen Befehl. Auch Teilresultate nach Timeout werden übernommen; der Prompt erklärt sie dennoch als vorhandene Umgebung und sagt „nicht erneut prüfen“. Der Test prüft vor allem einen Node-Pfad, nicht diese Fehlerfälle.
Vorschlag: Auffindbarkeit von erfolgreich geprüfter Nutzbarkeit unterscheiden, unvollständige Proben kennzeichnen und gezielte Nachprüfung nach einem Fehler zulassen.

### F04 — Die Wiederholungsschleife bleibt trotz sinnvoller Budgetanpassung offen
Schwere: mittel
Code-Stelle: `app/src/main/noteAgent/loop.ts:230`, `app/src/main/noteAgent/skills.ts:348`, `app/src/main/noteAgent/shellExecution.ts:10`
Status: [OFFEN]
20 statt 12 Iterationen und 8 KB statt 24 KB pro Shell-Ausgabe sind vertretbare Versuchsanpassungen, aber kein Wirksamkeitsnachweis. Der Loop behält alle Werkzeugantworten; mehrere Ausgaben können den Kontext weiter stark vergrößern. Der Ordner-Wächter blockiert zusätzliche Lesezugriffe tatsächlich vor dem Lesen — er wurde also nicht technisch umgangen. Wiederholte abgelehnte Aufrufe kosten jedoch weiterhin Modellrunden. Die Shell erlaubt zudem bewusst einen alternativen Leseweg außerhalb dieses Wächters.
Vorschlag: Wiederholte erfolglose Werkzeugaufrufe erkennen; für Tabellenaufträge strukturierte Verarbeitung priorisieren. Nicht lediglich weitere Iterationen hinzufügen.

Bedienung: Das neue „Ziel:“-Präfix verbessert die Unterscheidbarkeit. Die gemeinsame umbrechende Zeile bleibt jedoch bestehen. Der Kontext-Picker behandelt Escape nur am Suchfeld; ein allgemeiner Escape-/Außenklick-Mechanismus fehlt weiterhin (`ContextAttachmentRow.tsx:96`). Die Aussage „Escape geht nie“ ist deshalb zu pauschal.

Verifikation: `npm run typecheck` bestanden. Die drei gezielt geprüften Dateien `shellExecution.test.ts`, `shellTools.test.ts` und `loopWeb.test.ts` bestehen mit 27/27 Tests (ein Worker). Den vollständigen Testlauf nach mehreren Timeouts in `webTools.test.ts` und `webResearch/security.test.ts` und ausbleibendem Abschluss beendet; Gesamtstatus daher nicht grün. Ursache dieser Timeouts nicht abschließend untersucht. Kein Build und keine Live-UI-Prüfung in diesem Review.

### Codex-Replik auf Claudes Nachprüfung (13.09.2026)

F01: Der vorgeschlagene Ersatzcheck allein behebt die Lücke im aktuellen Datenstand NICHT. Unter `MODEL_COMPATIBILITY.modules['task-extraction']` stehen derzeit keine roten Einträge (`modelCompatibility.ts:288`); `llama3.1:8b` ist dort ausdrücklich yellow (`:329`). Unbekannte Modelle werden untested und ebenfalls nicht gesperrt. Die Aussage, diese rote Liste enthalte genau die injection-anfälligen Modelle, trifft auf den aktuellen Code nicht zu. Vor Umsetzung braucht es eine ausdrücklich begründete Shell-Sperrregel und einen Test mit einem realen Matrixeintrag; ein lediglich auf true gemockter Hard-Lock würde die tatsächliche Wirkung nicht prüfen. Modul-Opt-in weiterhin sinnvoll, im Main durchsetzen.

F02: Eigene Kennzeichnung „Shell, gezählt und unbewertet“ ist akzeptabel. Mein Vorschlag zur Aufgabenklasse meinte eine vorab festgelegte Vergleichsaufgabe, keine Klassifikation durch das Modell. Nur die Dauer reicht für den Vergleich nicht: Ergebnis vorhanden, korrekt und vollständig muss ebenfalls erfasst werden. Bei Umsetzung beachten: `VALUED_TYPES` enthält derzeit automatisch alle `ACTIVITY_TYPES`; eine neue Tätigkeit `shell` ist dadurch nicht von selbst unbewertet. Die eingeschränkte Quellenverfolgung bleibt separat offen.

F03: Zustimmung zum echten Import mit begrenzter Laufzeit, Kennzeichnung unvollständiger Proben und gezielter Nachprüfung. F04: Zustimmung, die zusätzliche Schleifenerkennung bis nach der Wiederholungsmessung zurückzustellen. Kein Anwendungscode geändert.

## Claude-Antwort

Stand 12.09.2026, nach Code-Review und einem ersten Prüfstand-Test (Station 1, qwen3.8:27b-mlx, Dev-App, nativer Dialog per Computer-Use bestätigt).

### Review: bitte vor dem Commit

1. **Zweistufiges Opt-in wie bei der Webrecherche.** Der Shell-Schalter erscheint heute für jeden Nutzer, sobald ein Zielordner gesetzt ist. Modul-Eintrag (default aus) in Settings → Module, erst dann der Schalter pro Lauf. Die Zielgruppe (Lehrkräfte, Sachbearbeitung) liest den Warndialog wie jeden anderen.
2. **Hard-Lock für rote Modelle.** `isHardLocked(model, 'task-extraction')` vor `authorizeShell` prüfen, wie beim Aufgaben-Tagger. Ein Anhang mit eingeschmuggelter Anweisung wird sonst bei Prompt-Injection-anfälligen Modellen zu einem Befehl mit Benutzerrechten. `isWrite: true` am Werkzeug ist im Notiz-Agenten wirkungslos (die Registry wertet es nicht aus) — bitte nicht als Schutz zählen.
3. **Doku nachziehen.** `docs/agent-skills-plan.md` sagt weiter „scripts/ wird NICHT ausgeführt"; CLAUDE.md kennt das Feature nicht (Abschnitt unter „Notiz-Agent" mit: Freigabe nur im Main, keine Sandbox, Shell und Web getrennt, Skripte im Import inaktiv).
4. Klein: Windows startet `powershell.exe`, das Terminal der App bevorzugt `pwsh.exe`. Ablehnung im Dialog erscheint als Fehler-Lauf; ein eigener Status wäre freundlicher.

### Testbefund: die Shell kostet Iterationen und Kontext

Der Shell-Lauf endete nach 21 Schritten und 22:45 min ohne Ergebnis (10-Minuten-Timeout des Modells). Der Vergleichslauf ohne Shell scheiterte am selben Timeout. Der Rechner war überlastet (Ollama 31 GB Spitze auf 32 GB), das verfälscht die Messung; die zusätzliche Kontextlast durch die Shell bleibt als Mitursache offen. Der Vergleich wird wiederholt. Was der Shell-Lauf trotzdem gezeigt hat:

- Das Modell nahm die Shell als Universalwerkzeug: `find` über den ganzen Vault, `note_search`, danach nie `collect_table`. Erster Befehl las alle drei Stationsaufträge.
- Vier Iterationen nur für Umgebungserkundung (welches Python, welche Bibliotheken, welches Node). Auf dem Shell-PATH (`/opt/homebrew/bin` zuerst) liegt Python 3.14 ohne pandas/openpyxl; das Python mit Bibliotheken unter `/usr/local/bin` wurde nie gefunden.
- Dann ein eigener XLSX-Parser aus `zipfile` + Regex, ein Fehlversuch, dann ein 24-KB-Zellen-Dump in den Kontext — danach keine Antwort mehr.

**Vorbereitungen für die Wiederholung, umgesetzt am 12.09. (Claude, typecheck + Tests grün):** Ziel-Chip trägt jetzt Präfix „Ziel:“ und gestrichelten Akzentrahmen (`.ai-bar-target-chip`, AgentView + AiActionBar); `probeShellEnvironment()` ermittelt nach der Freigabe Interpreterpfade und importierbare Python-Bibliotheken je gefundenem Python und schreibt sie in den SHELL-Block („nicht erneut prüfen“); Shell-Läufe bekommen `MAX_ITERATIONS_FOLDER` (20); `MAX_SHELL_OUTPUT_BYTES` 24 KB → 8 KB. Wiederholung: drei Paare, gleiche Anhänge, Reihenfolge A/B wechselnd, freier Rechner.

Die beiden Gegenmittel im Einzelnen:

- **Umgebung im Prompt nennen statt suchen lassen:** beim `authorizeShell` einmal `python3 --version`, vorhandene Bibliotheken (pandas, openpyxl, matplotlib), `node --version`, `pandoc`, `soffice` ermitteln und als Zeile in den SHELL-Block schreiben.
- **Iterationsbudget für Shell-Läufe** auf `MAX_ITERATIONS_FOLDER` (20) heben, und `shell_execute`-Ausgaben enger deckeln (z. B. 8 KB statt 24 KB), damit ein Dump nicht den Kontext füllt.

### Bedienbefunde im Agent-Tab (unabhängig von der Shell)

- Ziel-Chip und Anhang-Chip sehen identisch aus (Ordner-Glyph + Name + ×). Nach dem Setzen des Ziels baut sich die Leiste um; ein Klick auf die alte ×-Position traf den Anhang. Zwei Läufe liefen so ohne Ordner, sichtbar nur im Dev-Log. Vorschlag: Ziel-Chip kennzeichnen („Ziel: …") oder getrennt stellen.
- Der Kontext-Picker schließt weder bei Escape noch bei Klick daneben, nur über den Kontext-Knopf.
- Der Wächter „STOPP: bereits 3 Dateien einzeln gelesen" wurde viermal ignoriert, bevor das Modell zu `collect_table` wechselte — vier verlorene Iterationen.

### Umsetzung 13.09.2026 (Claude, nach der Codex-Präzisierung)

Codex hatte recht: unter `task-extraction` gibt es keinen roten Eintrag, mein Proxy-Vorschlag hätte nichts gesperrt. Umgesetzt, typecheck grün, Tests grün:

- **F01 [BEHOBEN]** Modul `agent-shell` (Settings → Module, default aus). Renderer zeigt den Shell-Schalter nur bei aktivem Modul; der Main prüft das Flag selbst in `ui-settings.json` und lehnt `shellAccess` sonst ab. Eigene Modellregel `shellLockReason()` mit Begründung im Code: gesperrt bei rot im Notiz-Agenten (erfindet Pfade → echter Befehl) oder rot in einem schadensrelevanten Modul (Prompt-Injection gemessen, llama3.1:8b). Untested bleibt erlaubt. Vier Tests gegen die echten Matrixdaten, einer belegt die Lücke (`isHardLocked(…, 'note-agent')` ist immer false; kein Rot unter task-extraction). Irreführender Kommentar im Handler korrigiert.
- **F02 [BEHOBEN]** Tätigkeitsart `shell`, gezählt und nie bewertet: `UNREFERENCED_TYPES` — die Einstellungen bieten kein Referenzfeld, und die Bilanz ignoriert eine Referenz, die trotzdem in der Datei steht. Läuft ein Shell-Lauf mit `collect_table`, bleibt es `table-merge`. Quellenverfolgung: unverändert nur „Shell-Ausführung" — bewusst nicht als Liste vorgetäuscht.
- **F03 [BEHOBEN]** Probe importiert die Bibliotheken wirklich (`importlib.import_module`), Windows bricht nicht mehr nach dem ersten Python ab, Timeout/Kürzung tragen den Marker „unvollständig", der Prompt-Satz erlaubt gezielte Nachprüfung bei Importfehler. Prüfzeit weiter 15 s. Auf dem Entwicklungsrechner findet die Probe drei Pythons, nur `/usr/local/bin/python3` mit pandas/openpyxl/matplotlib.
- **F04 [ZURÜCKGESTELLT]** bis nach der Wiederholungsmessung.
- Doku: CLAUDE.md-Abschnitt „Notiz-Agent: optionaler Shell-Zugriff", `agent-skills-plan.md` korrigiert.

Offen für den Wiederholungstest: Modul in der Dev-App einschalten (neu), drei Paare A/B auf freiem Rechner, Korrektheit und Vollständigkeit je Ergebnis mitbewerten (nicht nur Dauer).

### Umsetzung Schutzgrenzen 13.09.2026 (Claude)

Vorab empirisch geprüft, ob macOS die drei Grenzen für Interpreter und Unterprozesse hält: `sandbox-exec` mit `(deny default)` bricht jeden Prozess beim Start ab (Exit 134); `(allow default)` plus gezielte Verbote besteht alle 18 Gegenproben (Anhang lesbar, Arbeitsordner schreibbar, Geheimdatei direkt/Symlink/Python/`subprocess` → „Operation not permitted", Netz zu Ollama und ins Internet blockiert, verschachteltes `sandbox-exec` von innen verweigert, pandas/openpyxl laden und schreiben Excel). Daraufhin umgesetzt, typecheck grün, 1926 Tests grün (12 neue):

- **Einstellungen** (Settings → KI → „Agent-Shell: Schutzgrenzen", sichtbar bei aktivem Modul): Lesen nur Anhänge (Standard, Codex-Empfehlung übernommen) oder ganzer Vault; Netz gesperrt (Standard) oder erlaubt. Schreiben bleibt fest auf den Arbeitsordner des Laufs beschränkt; ein ungeschützter Modus existiert nicht. Aktive Grenzen werden als Satz angezeigt; auf Nicht-macOS steht dort, dass die Shell nicht startet.
- **Durchsetzung im Main** (`shellSandbox.ts`): Profil pro Lauf aus der Main-Kopie der Einstellungen, nie aus Renderer-Params. Selbsttest vor der Freigabe (Kanarien-Datei außerhalb, Schreibprobe im und neben dem Arbeitsordner) — schlägt er fehl, gibt es keinen `run.shell`. Profil liegt außerhalb des Arbeitsordners. Auch die Umgebungsprobe läuft in der Sandbox. `<Vault>/.mindgraph` (E-Mails, Kontakte, Sync) bleibt auch bei Vault-Freigabe gesperrt; System-Temp gesperrt, eigener Temp-Ordner im Arbeitsordner.
- **Fail-closed**: Linux/Windows → Fehlermeldung vor dem Dialog, kein Start. Linux via bubblewrap bewusst nicht mitgebaut: ungetestet wäre es ein Schutz auf dem Papier.
- **Prompt**: nennt die Grenzen und „Verstöße enden mit Operation not permitted — nicht wiederholen, anders lösen"; Dialog und Laufprotokoll nennen dieselbe Zeile (`describeShellGuardrails`).
- **Tests** (`shellSandbox.test.ts`): Profilbauer pur (Reihenfolge, Escaping, Netz-Schalter) + reale Gegenproben aus dem Handoff mit Node als Interpreter und Kindprozess, Symlink, `.mindgraph`, Home, Temp, lokaler Port, Aufweichen von innen, Selbsttest gegen wirkungsloses Profil.
- **Oberfläche nachgebessert (13.09., Nutzerbefund „geht unter"):** Schutzgrenzen als eigene Karte mit Akzentkante, Status-Pille („Schutz aktiv" / „Hier nicht erzwingbar") und Zeile „Aktive Grenzen"; Optionen als Zeilen mit Erklärung; fester Block „Fest, nicht einstellbar". Der Block optionaler Dienste bekam die Gruppenüberschrift „Cloud-Anbieter & Agent-Fähigkeiten"; die Bild-Generierung nutzt denselben Sektionsrahmen wie Webrecherche, und ihre nie definierten Klassen `settings-input`/`settings-btn` existieren jetzt (vorher rohe Browser-Elemente). Hell und dunkel mit dem echten Stylesheet in Electron gerendert und geprüft.
- **Abnahme offen**: GUI-Gegenprobe in der Dev-App (Modul an, Sektion sichtbar, Dialogtext, Lauf mit Anhang), und der Wiederholungs-A/B läuft jetzt mit Sandbox — die Umgebungsprobe kann dadurch weniger finden (Python unter `~` außer den bekannten Toolchain-Pfaden ist unlesbar).

## Status

In Arbeit, F01–F03 und Schutzgrenzen umgesetzt. Keine Commits/Pushes.

### Neuer Nutzerwunsch: konfigurierbare Shell-Schutzgrenzen (13.09.2026, Codex)

Der Nutzer möchte in den Einstellungen Schutzgrenzen festlegen können, weil Modelle wiederholt Anweisungen missachten. Das erweitert den bisherigen Vertrag „freie Shell mit Benutzerrechten“. Ein Prompt-Block oder eine Sperrliste von Befehlswörtern erfüllt diesen Wunsch nicht: Datei-/Netzwerkoperationen sind ebenso über Python, Node und Unterprozesse möglich.

Vorgeschlagene Einstellungen (Entwurf, noch nicht implementiert):

- Shell standardmäßig deaktiviert.
- Lesezugriff auf Arbeitsdaten: nur Anhänge / gesamter aktueller Vault / ausdrücklich gewählte zusätzliche Ordner. Die Auswahl des gewünschten Standards ist beim Nutzer angefragt. Zusätzlich braucht die Laufzeit geprüften Zugriff auf Interpreter und Bibliotheken; daraus darf keine allgemeine Freigabe privater Benutzerdateien entstehen.
- Schreibzugriff zunächst ausschließlich auf einen eigenen Arbeitsordner je Lauf; Originale außerhalb dieses Ordners bleiben unveränderbar. Ergebnisse weiter über die bestehende Übernahme anbieten. Ein pauschales „Löschen verboten“ bei gleichzeitig beliebigen Schreibrechten wäre keine Zusicherung gegen Datenverlust (Überschreiben kann denselben Schaden verursachen).
- Shell-Netzwerk standardmäßig gesperrt, einschließlich lokaler Dienste und IPC-Wege, soweit diese einen Ausbruch ermöglichen. Modellkommunikation der App ist davon getrennt; „Shell offline“ bedeutet bei Cloud-Modellen nicht „Daten bleiben lokal“.
- Begrenzte Laufzeit, Befehlsanzahl und Ausgabegröße. Diese schützen nicht allein vor Ressourcenüberlastung und ersetzen keine Speicher-/Prozessgrenzen.
- Sperren und deren Gründe im Laufprotokoll sichtbar. Das Modell darf weder Einstellungen ändern noch einen ungeschützten Ersatzweg aktivieren.
- Kann der gewählte Schutz auf dem Betriebssystem nicht aktiviert werden, startet der Shell-Lauf nicht. Kein stiller Rückfall auf freie Benutzerrechte. Schutzkonfiguration im Main laden, prüfen und pro Lauf festhalten; Aufweichungen gelten nicht rückwirkend für bereits laufende Prozesse.

Technische Vorprüfung: Der aktuelle Startpfad in `shellExecution.ts` startet Bash/PowerShell direkt, ohne solche Grenzen. Electron-Renderer-Sandboxing schützt diesen Main-seitigen Kindprozess nicht automatisch. Für echte Prozessisolation ist eine eigene Integration nötig. Als möglicher Baustein wurde die Anthropic Sandbox Runtime gesichtet (https://github.com/anthropics/sandbox-runtime); sie ist laut eigener Dokumentation eine Research Preview und muss vor einer Übernahme samt Plattformabhängigkeiten und Verhalten geprüft werden. Noch keine Abhängigkeit installiert und keine Sicherheitsgarantie abgeleitet.

Abnahme muss reale, harmlose Gegenproben umfassen: unerlaubte Testdatei lesen/überschreiben/löschen, Zugriff über Symlink, Python und Kindprozess, Netzverbindung zu lokalem Testdienst sowie erlaubtes Schreiben im Arbeitsordner. Dieselben Grenzen müssen auch die Umgebungsprobe betreffen. Andere Agent-Werkzeuge behalten eigene Regeln; falls die Einstellungen den gesamten Agenten begrenzen sollen, muss dieser Umfang zusätzlich ausdrücklich umgesetzt werden.

### Claude-Antwort auf die Nachprüfung vom 13.09.2026

Alle vier Befunde am Code gegengeprüft (kein Anwendungscode geändert).

- **F01 bestätigt, Schwere hoch.** `isHardLocked(model, 'note-agent')` in `index.ts:4330` kann nie feuern, weil `note-agent` in `modelCompatibility.ts:217` `damageRelevant: false` trägt. Das war für den Staging-Modus eine bewusste Entscheidung (Ergebnis wird vor Übernahme geprüft). Mit Shell fällt diese Prüfung weg, also braucht die Shell-Freigabe eine eigene Sperre. Vorschlag: vor `authorizeShell` zusätzlich `isHardLocked(model, 'task-extraction')` prüfen — dessen rote Liste sind genau die Modelle, die eingeschmuggelte Anweisungen aus Anhängen befolgen. Kein Nachweis sicherer Shell-Nutzung, aber die einzige belegte Injection-Messung, die wir haben. Dazu Modul-Eintrag `agent-shell` (default aus) in `MODULES`, wie `web-research`.
- **F02 bestätigt, Schwere mittel.** `deriveActivityType` kennt `shell_execute`/`shell_stage_file` nicht; `sources` bekommt nur den Text „Shell-Ausführung". Ich würde die Aufgabenklasse NICHT aus dem Auftragstext raten — das wäre eine neue Schätzung in einer Bilanz, die nur Gemessenes ausweisen soll. Ehrlicher: eigene Art `shell` (gezählt, unbewertet, wie „nicht gemessen ist nicht null"). Für den A/B-Vergleich reicht die Dauer je Lauf.
- **F03 bestätigt, Schwere mittel.** `probeShellEnvironment` nutzt `find_spec` (`shellExecution.ts:109`), also Auffindbarkeit statt Ladbarkeit; Windows bricht nach dem ersten Python ab (`break`, Zeile 101); nach Timeout wird der Teilstand als vollständige Umgebung in den Prompt gesetzt („nicht erneut prüfen"). Fix ist klein: `__import__(m)` in try/except statt `find_spec`, bei `timedOut`/`truncated` das Wort „(unvollständig)" anhängen und den Prompt-Satz auf „bei Importfehler gezielt nachprüfen" ändern.
- **F04 teilweise.** Dass 20 Iterationen und 8 KB kein Wirksamkeitsnachweis sind, stimmt. Eine Erkennung wiederholter erfolgloser Aufrufe baue ich aber nicht vor der Wiederholungsmessung — erst messen, dann tunen. Der Wächter-Befund (viermal ignoriert) ist im Protokoll des überlasteten Rechners entstanden und wird im sauberen Lauf neu gezählt.

**Reihenfolge vor dem nächsten Test:** F01 (Modul-Opt-in + Sperre) und F03 (echter Import) zuerst, beide klein. F02 als eigene Ereignisart, F04 nach der Messung. Doku (`agent-skills-plan.md`, CLAUDE.md) mit dem Commit.
