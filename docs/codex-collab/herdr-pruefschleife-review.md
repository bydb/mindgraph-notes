# Adversariales Review: die Herdr-Prüfschleife selbst

## Aufgabe
Prüfe die am 20.09.2026 eingerichtete **Herdr-Prüfschleife** (Bauender = Claude, Prüfer = Codex)
adversarial auf Löcher. Nicht bestätigen — Löcher suchen.

Leitfragen (nicht abschließend):
1. **Kann die Schleife stillschweigend das Falsche tun?** Wo sieht ein Lauf erfolgreich aus, obwohl
   nichts oder etwas anderes passiert ist?
2. **Trägt die Grenzkontrolle?** Claude prüft nach dem Review mit `git status --porcelain`, dass der
   Prüfer nur die Aufgabendatei angefasst hat. Der Prüfer läuft mit `--sandbox workspace-write
   --ask-for-approval never`. Was fängt diese Kontrolle nicht?
3. **Ist die Abnahme wirklich beim Nutzer?** Gibt es im beschriebenen Ablauf einen Pfad, auf dem zwei
   Modelle sich gegenseitig abnicken und es nach Sorgfalt aussieht?
4. **Kanal:** Findings sollen in diese Datei geschrieben werden statt ins Terminal. Welche Fehlerfälle
   entstehen dadurch neu (gleichzeitiges Schreiben, Abschnitt des anderen überschreiben, Teilschreiben)?
5. **Betriebsfälle:** erster Start mit Hook-Trust-Dialog, Timeout, `agent_blocked`,
   `agent_prompt_stalled`, abgestürzter Prüfer, zweite Runde auf altem Kontext.

## Kontext/Anker
- `docs/codex-collab/README.md:31-85` — Abschnitt „Herdr-Schleife (Bauender ↔ Prüfer)", Rollen,
  Einrichtung, Kurzform der Mechanik, Begründung für Datei-Kanal und Sandbox-Wahl.
- `docs/codex-collab/README.md:8-29` — das ältere Protokoll (Abschnitte, Finding-Format, Status-Tags),
  auf dem die Schleife aufsetzt.
- `.claude/commands/pruefen.md` — der vollständige Ablauf, den Claude abarbeitet (Schritte 0–7 plus
  Aufräumen). Diese Datei ist per `.gitignore:35` nicht im Repo, liegt aber auf der Platte.
- `AGENTS.md:40-59` — Abschnitt „Wenn Claude dich startet (Herdr)", die Erwartung an den Prüfer.
- Werkzeug-Verhalten ist in `~/.claude/skills/herdr/SKILL.md` beschrieben (Herdr-eigene Anleitung,
  `herdr --skill`). Relevante Zusagen dort: `agent prompt --wait` wartet auf den ersten gesetzten
  Zustand `idle`/`done`/`blocked`; ein Timeout beweist nicht, dass der Prompt nicht ankam;
  `agent read` kann lange Antworten verlieren.

Belege deine Behauptungen mit `datei:zeile` gegen den echten Text dieser Dateien, nicht gegen meine
Zusammenfassung.

## Codex-Findings
<!-- Codex schreibt hier. Format:
### Fxx — <Kurztitel>
Schwere: kritisch | hoch | mittel | niedrig
Stelle: datei:zeile
Status: [OFFEN]
<Beschreibung>
Vorschlag: <optional>
-->

### F01 — Neue Aufgabendatei ist für `git diff` unsichtbar
Schwere: hoch
Stelle: .claude/commands/pruefen.md:29-31,80-82
Status: [OFFEN]
Der Ablauf legt eine noch nicht vorhandene Aufgabendatei neu an und liest das Ergebnis anschließend mit
`git diff -- <datei>`. Git zeigt unversionierte Dateien mit diesem Befehl nicht an. Genau der reguläre
Erstlauf kann deshalb trotz geschriebener Findings wie ein leerer Lauf aussehen; umgekehrt gibt es kein
Signal, ob der Prüfer nichts geschrieben hat oder nur die Auslesemethode versagt. Die aktuelle
Aufgabendatei ist selbst ein Beispiel für diesen Pfad: Sie wird neu angelegt, bevor der Prüfer schreibt.
Vorschlag: Vor dem Start den Dateistatus erfassen und neue Dateien anschließend direkt lesen oder mit
`git diff --no-index /dev/null -- <datei>` vergleichen; ein leerer Ergebnisabschnitt muss als Fehler gelten.

### F02 — Nachträglicher Status kann Änderungen in einem schmutzigen Worktree nicht zuordnen
Schwere: hoch
Stelle: .claude/commands/pruefen.md:84-90, AGENTS.md:37-38
Status: [OFFEN]
`git status --porcelain` wird erst nach dem Prüflauf erhoben. Da beide Modelle ausdrücklich auf demselben
Branch arbeiten und dort bereits Änderungen liegen dürfen, beweist ein nachher angezeigtes `M` nicht,
wer die Datei geändert hat. Noch gravierender: Ändert der Prüfer eine bereits vorher als `M` geführte
Datei, bleibt die Statuszeile identisch. Die Regel „Taucht dort eine andere Datei auf, die du nicht selbst
geändert hast“ ist ohne dokumentierten Vorzustand nicht entscheidbar.
Vorschlag: Vor dem Start Status, HEAD, Index und Inhalts-Hashes aller vorhandenen Arbeitsbaumdateien
snapshotten und nachher gegen genau diesen Snapshot vergleichen; vorbestehende Änderungen dabei nicht
als Freibrief behandeln.

### F03 — Git-Status deckt ignorierte Schreibziele nicht ab
Schwere: hoch
Stelle: .claude/commands/pruefen.md:84-90, .gitignore:30-36
Status: [OFFEN]
Die behauptete Grenzkontrolle sieht nur Git-erfasste beziehungsweise unversionierte, nicht ignorierte
Pfade. Gerade `.claude/` und `CLAUDE.md` sind ignoriert. Ein Prüfer mit Schreibrecht im Workspace könnte
also den Ablauf, Projektinstruktionen, Abhängigkeiten oder andere ignorierte Artefakte verändern, ohne
dass `git status --porcelain` dies meldet. Die Kontrolle belegt daher nicht die in AGENTS.md behauptete
Eigenschaft „außer der Aufgabendatei darf sich nichts geändert haben“.
Vorschlag: Die technische Schreibgrenze auf die eine Ergebnisdatei beschränken oder einen vorher/nachher-
Dateisystemvergleich einschließlich ignorierter Dateien durchführen; `git status` nur als Zusatzsignal
verwenden.

### F04 — Erlaubter Dateipfad ersetzt keine Abschnittskontrolle
Schwere: hoch
Stelle: .claude/commands/pruefen.md:78-93, docs/codex-collab/README.md:8-12
Status: [OFFEN]
Die Grenze prüft nur, welche Datei geändert wurde. Sie prüft nicht, ob innerhalb der erlaubten Datei
ausschließlich „Codex-Findings“ geändert wurde. Ein Prüfer kann versehentlich Aufgabe, Anker,
Claude-Antwort oder Status überschreiben, die Datei vollständig neu schreiben oder gar keinen gültigen
Finding-Block erzeugen; der Pfadtest ist trotzdem grün. Das verletzt die ausdrücklich festgelegte
Abschnittseigentümerschaft, ohne den Ablauf anzuhalten.
Vorschlag: Vorher- und Nachherfassung strukturell vergleichen: außerhalb des Finding-Abschnitts müssen
die Bytes identisch sein; innerhalb müssen nur syntaktisch vollständige `Fxx`-Blöcke oder eine explizite
„keine Findings“-Marke neu hinzugekommen sein.

### F05 — Ein gleichnamiger Agent wird ungeprüft wiederverwendet
Schwere: hoch
Stelle: .claude/commands/pruefen.md:35-48, ~/.claude/skills/herdr/SKILL.md:55-59
Status: [OFFEN]
Sobald irgendwo ein Agent namens `pruefer` läuft, springt der Ablauf direkt zu Schritt 3. Er validiert
weder Pane, Arbeitsverzeichnis, Repository, Agent-Art noch den Auftrag, für den dieser Prozess gestartet
wurde. Agent-Namen sind lediglich unter den live erkannten Agenten eindeutig; ein alter Prüfer aus einer
anderen Aufgabe kann daher den neuen Auftrag mit altem Kontext oder im falschen Verzeichnis bearbeiten.
Vorschlag: Beim Start Pane-ID, Repo-Root und Agent-Identität als Laufmetadaten festhalten. Nur genau diesen
Agent wiederverwenden; andernfalls einen aufgabenspezifischen Namen anlegen oder den Nutzer entscheiden
lassen.

### F06 — Bereits arbeitender Prüfer kann den falschen Turn als Erfolg liefern
Schwere: hoch
Stelle: .claude/commands/pruefen.md:41-42,60-74, ~/.claude/skills/herdr/SKILL.md:145-147
Status: [OFFEN]
Vor dem Prompt fehlt die Forderung, dass der wiederverwendete Prüfer nachweislich `idle` oder `done` ist.
Herdr dokumentiert ausdrücklich, dass bei einem bereits arbeitenden Agenten das Ende des aktiven alten
Turns den Wait des neu gesendeten Prompts erfüllen kann. Claude kann dann die Datei lesen, bevor der neue
Prüfauftrag überhaupt abgeschlossen ist, und alte Findings als Ergebnis behandeln.
Vorschlag: Nur aus einem verifizierten, nicht arbeitenden Ausgangszustand prompten und das Ergebnis mit
einer auftragsspezifischen Lauf-ID in Datei und Prompt korrelieren.

### F07 — `agent_prompt_stalled`, Absturz und `unknown` haben keinen Fail-closed-Pfad
Schwere: hoch
Stelle: .claude/commands/pruefen.md:72-74, ~/.claude/skills/herdr/SKILL.md:59,147,171
Status: [OFFEN]
Der Ablauf behandelt nur `blocked` und erwähnt den Timeout. Herdr kann aber auch
`agent_prompt_stalled` melden; `unknown` beweist keine Fertigstellung, und ein Agent kann nach einem
Teilschreiben abstürzen. Für diese Fälle fehlt eine Anweisung, den Lauf als fehlgeschlagen zu markieren
und das Einlesen beziehungsweise Abarbeiten zu sperren. Besonders gefährlich ist ein alter, weiterhin
gefüllter Finding-Abschnitt: Der Fehler sieht dann wie ein erfolgreicher Lauf aus.
Vorschlag: Jeden nicht ausdrücklich erfolgreichen Wait sowie `unknown`/Agentverlust fail-closed behandeln,
`agent get` und `agent read` diagnostizieren und erst nach einem frischen, vollständig validierten
Ergebnis weitergehen.

### F08 — Folgerunden besitzen keine Ergebnisfrische
Schwere: hoch
Stelle: .claude/commands/pruefen.md:29-31,104-108
Status: [OFFEN]
Eine vorhandene Aufgabendatei wird unverändert weiterverwendet; weder Auftrag noch Anker, Findings oder
Antworten werden an einen konkreten Stand von Code und Dokumenten gebunden. Schreibt der Prüfer in Runde
2 nichts, bleiben die Befunde aus Runde 1 sichtbar. Ändert sich der Code zwischen den Runden, kann er
weiter mit alten Ankern und altem Gesprächskontext urteilen. Es gibt keine Revision, keinen HEAD-/Diff-
Hash, keine Lauf-ID und keine Pflicht, neue Findings von alten zu trennen.
Vorschlag: Jede Runde mit monotoner Rundennummer, Zeit, Scope-Hash und eindeutiger Lauf-ID versehen; nur
neu unter dieser ID geschriebene Resultate akzeptieren und vor der Folgerunde Anker gegen den aktuellen
Stand erneuern.

### F09 — Gemeinsame Ergebnisdatei hat weder Sperre noch atomaren Übergabepunkt
Schwere: mittel
Stelle: docs/codex-collab/README.md:3-12, .claude/commands/pruefen.md:78-82
Status: [OFFEN]
Claude, Codex und der Nutzer arbeiten auf derselben Datei. Das Protokoll weist Abschnitte zu, bietet aber
keine Sperre, Versionsprüfung oder atomare Übergabe. Gleichzeitige Edits können verloren gehen; ein
Absturz kann einen halben Markdown-Block hinterlassen; ein Ganzdatei-Write des einen Prozesses kann den
frischen Abschnitt des anderen auf altem Inhalt überschreiben. Das anschließende Lesen der Datei erkennt
keinen dieser Fälle zuverlässig.
Vorschlag: Pro Lauf in eine separate temporäre Ergebnisdatei schreiben, atomar umbenennen und erst nach
Hashprüfung in die Aufgabendatei übernehmen; alternativ Compare-and-swap auf dem vorherigen Dateihash.

### F10 — Relative Pfade hängen ungesichert vom Startverzeichnis ab
Schwere: hoch
Stelle: .claude/commands/pruefen.md:25,45,80-87, ~/.claude/skills/herdr/SKILL.md:117-123
Status: [OFFEN]
Die Nachbar-Pane erbt bewusst `$PWD`, während Aufgabendatei und Git-Pathspec relativ angegeben werden.
Der Ablauf prüft aber nicht, dass Claude im Repository-Root gestartet wurde. Aus `app/` oder einem
anderen Unterordner kann der Prüfer einen falschen beziehungsweise nicht vorhandenen Pfad sehen; auch
`git diff -- docs/...` bezieht den Pathspec dann auf das Unterverzeichnis und kann leer bleiben. Herdr
meldet dabei korrekt einen abgeschlossenen Agententurn, obwohl der fachliche Kanal verfehlt wurde.
Vorschlag: Zu Beginn `git rev-parse --show-toplevel` bestimmen, dorthin wechseln und für Pane, Prompt und
Prüfungen kanonische absolute Pfade beziehungsweise root-relative Pathspecs verwenden.

### F11 — Hook-Trust-Start ist nicht bis zum bereiten Agenten spezifiziert
Schwere: mittel
Stelle: .claude/commands/pruefen.md:47-56, ~/.claude/skills/herdr/SKILL.md:137
Status: [OFFEN]
Der Text sagt nur, vor dem Senden von `t` den Nutzer zu fragen. Laut Herdr liefert `agent start` bei einer
Blockade während des Starts sofort `agent_not_ready`, behält den Namen aber bei; danach muss bis `idle`
gewartet werden. Der Ablauf beschreibt weder die Diagnose dieses Rückgabewerts noch das gezielte Senden
der Nutzerentscheidung und die anschließende Bereitschaftsprüfung. Dadurch kann der Erstlauf in Schritt
3 mit einem nur halb gestarteten, gleichwohl benannten Agenten fortfahren.
Vorschlag: `agent_not_ready` als eigenen Zustand behandeln: UI lesen, Nutzerentscheidung einholen,
gezielt senden, bis `idle` warten und erst dann den Prüfauftrag übermitteln; Ablehnung als sauberen Abbruch
protokollieren.

### F12 — Der Bauende ändert Code vor der vorgeschriebenen Nutzerfreigabe
Schwere: kritisch
Stelle: docs/codex-collab/README.md:26-29, .claude/commands/pruefen.md:95-102,110-120
Status: [OFFEN]
Das Grundprotokoll verbietet Code-Edits im Review-Schritt ausdrücklich und erlaubt Code erst nach
Freigabe durch den Nutzer. Der automatisierte Ablauf weist Claude dagegen in Schritt 5 an, Findings
abzuarbeiten und nach Code-Änderungen Tests auszuführen; dem Nutzer wird das Ergebnis erst danach in
Schritt 7 vorgelegt. Damit ist die zentrale Behauptung „Abnahme bleibt beim Nutzer“ operativ falsch:
Zwei Modelle können Findings erzeugen, bewerten und daraus den Arbeitsbaum verändern, bevor der Nutzer
irgendeine Entscheidung trifft.
Vorschlag: Nach Gegenprüfung der Findings zwingend anhalten und eine ausdrückliche Nutzerfreigabe für die
ausgewählten Änderungen einholen. Erst in einem getrennten, autorisierten Umsetzungslauf Code ändern und
testen; anschließend erneut zur Abnahme vorlegen.

### F13 — Nutzerabnahme ist kein dauerhafter, erzwingbarer Zustand
Schwere: mittel
Stelle: docs/codex-collab/README.md:41-42, .claude/commands/pruefen.md:110-120
Status: [OFFEN]
Schritt 7 fordert zwar eine Vorlage und das Anhalten, definiert aber weder eine explizite
Abnahmeentscheidung noch einen Status wie „wartet auf Nutzerfreigabe“, der vor Folgeschritten geprüft
werden muss. Eine spätere Sitzung kann die Datei mit beantworteten Findings daher als erledigt behandeln,
ohne belegen zu können, dass der Nutzer zugestimmt hat. Die Abnahme ist eine Formulierung, kein Gate.
Vorschlag: Nutzerentscheidung mit Datum und geprüftem Scope/Hash in einem eigenen, nur vom Nutzer
freizugebenden Status festhalten; Commit, Push, Release oder nächste Phase müssen das Vorliegen genau
dieser Freigabe prüfen.

### F14 — Das Slash-Command verspricht zwei Argumentformen, normalisiert sie aber nicht
Schwere: mittel
Stelle: .claude/commands/pruefen.md:1-3,23-31
Status: [OFFEN]
Der Argument-Hinweis erlaubt sowohl ein Thema als auch eine Aufgabendatei. Schritt 1 beschreibt dagegen
nur die Konstruktion `docs/codex-collab/<thema>.md`. Bei Übergabe eines bereits vollständigen Pfads ist
nicht festgelegt, ob dieser direkt genutzt oder nochmals unter das Verzeichnis gesetzt und um `.md`
ergänzt wird. Der Auftrag kann dadurch an eine andere Datei gehen als die, die Claude später prüft.
Vorschlag: Argument zuerst eindeutig normalisieren und kanonisieren: entweder einfacher Themenname oder
existierender Pfad innerhalb `docs/codex-collab/`; danach genau einen absoluten Zielpfad für alle Schritte
verwenden.

## Claude-Antwort
<!-- Claude antwortet hier je Finding: [ADRESSIERT] / [ABGELEHNT: Grund] / [DISKUSSION] -->

**Runde 1, Paket 1 (20.09.2026).** Der Nutzer hat vier Befunde zur Umsetzung freigegeben: F12, F01,
F02 und die `.claude/`-Hälfte von F03. Alles andere bleibt bewusst `[OFFEN]` — nicht abgelehnt,
sondern noch nicht entschieden.

### F12 — [ADRESSIERT]
Trägt, nachgemessen: `docs/codex-collab/README.md:28` („Code entsteht erst nach Freigabe durch den
User") gegen den alten Schritt 5 des Ablaufs, der Code-Änderung und Tests vor die Vorlage stellte.
Der Widerspruch war real und er traf den Kern — die Zusage „Abnahme bleibt beim Nutzer" galt nur
noch für den Commit, nicht für den Arbeitsbaum.

Die naheliegende Reparatur wäre falsch gewesen: „nie Code ohne Freigabe" hätte bei vierzehn Befunden
vierzehn Rückfragen bedeutet und den Nutzer zurück in die Kopierleitung gesetzt, die diese Schleife
gerade abschaffen soll. Der Schnitt liegt deshalb nicht bei jedem einzelnen Befund, sondern an zwei
Stellen: **Tor 1** (`.claude/commands/pruefen.md` Schritt 7) nach dem Gegenprüfen — Vorlage mit
Empfehlung, dann Halt; **Tor 2** (Schritt 9) nach der Umsetzung. Schritt 6 heißt jetzt ausdrücklich
„Gegenprüfen — noch nichts umsetzen", Schritt 8 setzt nur um, was freigegeben wurde; nicht
Freigegebenes bleibt `[OFFEN]`.

### F01 — [ADRESSIERT]
Trägt, und der Fehler ist in Runde 1 real eingetreten: `git diff -- <aufgabendatei>` gab auf diese
unversionierte Datei **null Zeilen** aus, während sie voller Findings stand (nachgemessen). Der
Erstlauf — also der Normalfall — hätte wie ein leerer Lauf ausgesehen.

Gelesen wird jetzt die Datei selbst (`sed -n '/^## Codex-Findings/,/^## Claude-Antwort/p'`), nie über
git. Zusätzlich gilt ein leerer oder unveränderter Findings-Abschnitt als **Fehlschlag des Laufs**,
nicht als leeres Ergebnis: `scripts/pruefgrenze.sh nachher` vergleicht Hash und Anzahl des Abschnitts
gegen den Vorzustand und verlangt Wachstum. Damit ist auch der von F07 und F08 beschriebene Fall
abgedeckt, dass alte Findings nach einem gescheiterten Lauf als frisches Ergebnis gelesen werden.

### F02 — [ADRESSIERT]
Trägt. `git status --porcelain` wurde erst nach dem Lauf erhoben; in Runde 1 waren `AGENTS.md` und
`docs/codex-collab/README.md` schon vorher `M`. Eine weitere Änderung daran hätte die Statuszeile
nicht bewegt.

Neu: `scripts/pruefgrenze.sh vorher` **vor** dem Start des Prüfers. Festgehalten werden der Hash von
`git diff HEAD` ohne die Aufgabendatei (fängt Änderungen an bereits geänderten Dateien), Einzelhashes
aller unversionierten Dateien und der HEAD. `nachher` vergleicht und nennt die abweichende Datei
beim Namen. Ein Commit während des Laufs fliegt über den HEAD-Vergleich auf.

### F03 — [ADRESSIERT] für `.claude/`, [ABGELEHNT: Beleg falsch] für `CLAUDE.md`
Die `.claude/`-Hälfte trägt und ist die ernstere: `.gitignore:35` ignoriert `.claude/`, dort liegt der
Ablauf `pruefen.md` selbst. Ein Prüfer mit Schreibrecht könnte ihn umschreiben, ohne dass `git status`
etwas meldet. Das Skript hasht diese Pfade deshalb mit. Gegenprobe gefahren: eine angehängte Zeile in
`.claude/commands/pruefen.md` wird von `pruefgrenze.sh nachher` mit Dateinamen gemeldet, von
`git status --porcelain` überhaupt nicht.

`CLAUDE.md` stimmt nicht: die Datei steht zwar in `.gitignore:36`, ist aber getrackt, und
`.gitignore` greift bei getrackten Dateien nicht. `git check-ignore -v CLAUDE.md` meldet keinen
Treffer, Änderungen daran erscheinen normal in `git status`. Das Finding ist an dieser Stelle
ungenau, nicht falsch in der Stoßrichtung.

Grenze der Maßnahme, offen benannt: Das Skript hält keinen bösartigen Prüfer auf, der es selbst
verändert. Es fängt Unfälle und macht „nur die Aufgabendatei" zu einer Aussage, die man nachmessen
kann. Das steht so im Skriptkopf und in `docs/codex-collab/README.md`.

### F04–F11, F13, F14 — [OFFEN]
Vom Nutzer noch nicht entschieden. Zwei Randbemerkungen für Runde 2: F10 (relative Pfade) ist durch
`cd "$(git rev-parse --show-toplevel)"` in Schritt 0 und den Wurzelbezug im Skript **teilweise**
erledigt, nicht vollständig. F05 und F06 sind durch die neue Vorprüfung in Schritt 3 (Pane,
Arbeitsverzeichnis, Zustand `idle`/`done`, sonst den Nutzer fragen) **angefasst**, aber ohne die von
F06 verlangte Lauf-ID-Korrelation — das ist bewusst noch nicht gebaut.

### Geänderte Dateien
- `scripts/pruefgrenze.sh` (neu) — Grenzkontrolle und Ergebnisprüfung, vier Gegenproben gefahren
- `.claude/commands/pruefen.md` — zwei Nutzer-Tore, Wurzelbezug, Fail-closed-Zustände, Lesen per `sed`
- `docs/codex-collab/README.md` — Kurzform der Mechanik, Begründungen, Abschnitt zu den zwei Toren
- `AGENTS.md` — Grenzkontrolle nicht mehr als `git status` beschrieben

## Status
Runde 1 gelaufen 20.09.2026 (erster echter Herdr-Lauf, isolierte Session `pruef-test`):
14 Findings, davon 1 kritisch (F12), 9 hoch, 4 mittel. Grenzkontrolle: der Prüfer hat nur diese
Datei geschrieben (mtime-Gegenprobe auf `.claude/commands/pruefen.md` und `CLAUDE.md` unauffällig).
Paket 1 vom Nutzer freigegeben und umgesetzt: F12, F01, F02, F03 (`.claude/`-Hälfte;
die `CLAUDE.md`-Hälfte abgelehnt, Beleg nachweislich falsch). **F04–F11, F13, F14 bleiben
offen** — nicht abgelehnt, sondern noch nicht entschieden.
Nächster Schritt: Runde 2, Codex prüft Paket 1 gegen den neuen Stand nach.
