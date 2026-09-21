# Rechner-Steuerung des Notiz-Agenten — adversariales Review

## Aufgabe

Prüfe die neu gebaute **Rechner-Steuerung**: der Notiz-Agent darf nach Freigabe pro Lauf
Programme auf dem Rechner ansprechen (Datei öffnen, im Finder zeigen, Mail-Entwurf mit
Anhang, drucken, freigegebenen Kurzbefehl starten). Alles uncommitted im Working-Tree.

Der Code ist neu und hat **keine GUI-Gegenprobe** — Mail.app, Drucken und Kurzbefehle wurden
bewusst nicht real ausgelöst (Nebenwirkungen auf dem Rechner des Nutzers). Geprüft ist
bisher nur: `osacompile` übersetzt das Skript, und `osascript skript.applescript <arg>`
übergibt einen Wert mit `"`, `&`, `-a Terminal` und Zeilenumbruch als genau EIN Argument.

**Suche Löcher, bestätige nicht.** Die Behauptungen, an denen sich der Entwurf messen lassen
muss — jede davon ist ein Angriffsziel:

1. **Das Modell kann kein eigenes Skript und keinen eigenen Befehl unterschieben.** Es wählt
   einen von fünf benannten Vorgängen; den Aufruf baut die App. Vier sind `execFile` mit
   Argumentliste, der fünfte ein festes AppleScript mit Werten als `argv`.
   → Gibt es einen Weg, aus einem Parameter ein zweites Argument, eine Option (`-a`,
   `--input-path`), ein Shell-Konstrukt oder AppleScript-Code zu machen?
2. **Mail wird nie gesendet.** Nur der sichtbare Entwurf.
3. **Übergeben werden nur** Ergebnisse des laufenden Auftrags und Dateien im Vault — nie
   absolute Pfade, nie `.mindgraph`, nie etwas außerhalb des Vaults.
   → Symlinks, `..`, Groß-/Kleinschreibung, TOCTOU zwischen `realpath` und Übergabe,
   Namenskollision zwischen einem Ergebnisnamen und einer Vault-Datei?
4. **Zweistufiges Opt-in, im Main durchgesetzt.** Modul-Flag und Freigabeliste kommen aus
   `ui-settings.json`, nie aus den Renderer-Params. Ohne nativen Dialog bleibt
   `run.computer` leer.
   → Kann ein kompromittierter Renderer das umgehen? Kann ein Werkzeug vor der Freigabe
   laufen? Was passiert bei Abbruch mitten in `authorizeComputer`?
5. **Budget zehn Vorgänge pro Lauf, Fehlversuche zählen mit.**
6. **Nicht mit Webrecherche kombinierbar** (Prompt-Injection aus einer Webseite hätte sonst
   einen Weg nach draußen). Kombination mit der Agent-Shell ist dagegen **erlaubt** —
   prüfe, ob das ein Loch ist: die Shell schreibt in `.../shell-work`, das Mail-Skript
   liegt eine Ebene darüber.

Prüfe außerdem, was ich **nicht** bedacht habe: Nebenwirkungen bei Abbruch, doppelte
Ausführung, Verhalten bei fehlenden Rechten (TCC-Ablehnung), `lp` ohne konfigurierten
Drucker, `shortcuts` ohne die App, Fehlermeldungen, die zu viel verraten, und ob die
Einstellungs-Oberfläche den Nutzer über die tatsächliche Tragweite im Unklaren lässt.

**Kein Code-Edit, kein Commit, kein Push.** Findings mit `datei:zeile` gegen den echten Code
belegen und in den Abschnitt „Codex-Findings" dieser Datei schreiben (Format:
`docs/codex-collab/README.md`).

## Kontext/Anker

**Geteilter Kern (pur, getestet)**
- `app/src/shared/computerControl.ts:19` — die fünf Vorgänge
- `app/src/shared/computerControl.ts:41` — Standardfreigaben (Drucken aus)
- `app/src/shared/computerControl.ts:53` — `isValidComputerName` (Programm-/Kurzbefehlnamen)
- `app/src/shared/computerControl.ts:73` — `normalizeComputerControl` (Einlesen gespeicherter Einstellungen)
- `app/src/shared/computerControl.ts:88` — `activeComputerVerbs`
- `app/src/shared/computerControl.ts:123` — `isAllowedName`
- `app/src/shared/computerControl.ts:134` — `isPrintable`
- `app/src/shared/computerControl.ts:143` — `isValidEmailAddress`

**Ausführung (Main)**
- `app/src/main/noteAgent/computerControl.ts:49` — das feste AppleScript (`argv`, kein `send`)
- `app/src/main/noteAgent/computerControl.ts:93` — `authorizeComputer` (Freigabe, Skript schreiben, Outbox)
- `app/src/main/noteAgent/computerControl.ts:124` — `requireVerb` (Vorgangsprüfung + Budget)
- `app/src/main/noteAgent/computerControl.ts:145` — `resolveComputerTarget` (was übergeben werden darf)
- `app/src/main/noteAgent/computerControl.ts:179` — `runTool` (`execFile`, Timeout, Abbruch)
- `app/src/main/noteAgent/computerControl.ts:196` — `openWithApp`
- `app/src/main/noteAgent/computerControl.ts:219` — `printFile`
- `app/src/main/noteAgent/computerControl.ts:229` — `runShortcut`
- `app/src/main/noteAgent/computerControl.ts:256` — `buildMailDraftArgs`
- `app/src/main/noteAgent/computerControl.ts:260` — `createMailDraft`

**Werkzeuge und Loop**
- `app/src/main/noteAgent/computerTools.ts:17` — die fünf Werkzeugdefinitionen
- `app/src/main/noteAgent/loop.ts:81` — Prompt-Block
- `app/src/main/noteAgent/loop.ts:191` — Werkzeug-Allowlist je freigegebenem Vorgang
- `app/src/main/noteAgent/loop.ts:253` — Iterationsbudget

**Freigabe-Pfad (IPC)**
- `app/src/main/index.ts:4387` — Ausschluss Webrecherche
- `app/src/main/index.ts:4393` — Modul-Flag, Verfügbarkeit, Modellregel (`shellLockReason`)
- `app/src/main/index.ts:4601` — nativer Dialog + `authorizeComputer`

**Oberfläche und Einstellungen**
- `app/src/renderer/components/Settings/ComputerControlSection.tsx` — Freigabeliste
- `app/src/renderer/components/Agent/ComputerAccessToggle.tsx` — Schalter pro Lauf
- `app/src/renderer/stores/uiStore.ts` — `agentComputerEnabled`, `agentComputer`, `persistedKeys`

**Plattform**
- `app/entitlements.mac.plist` — `com.apple.security.automation.apple-events` (neu)
- `app/package.json` — `NSAppleEventsUsageDescription`

**Vergleichsmaßstab (bestehend, bewusst nachgebaut)**
- `app/src/main/noteAgent/shellExecution.ts` — Freigabemechanik der Agent-Shell
- `app/src/main/noteAgent/staging.ts` — Staging, Sieben-Tage-Aufräumen
- `docs/rechner-bedienen-plan.md` — Entwurf mit allen Entscheidungen

**Tests**
- `app/src/shared/computerControl.test.ts` (16)
- `app/src/main/noteAgent/computerControl.test.ts` (21)

## Runde 2 (20.09.2026) — was seit F01–F09 dazugekommen ist

Drei Änderungen sind nach deinem ersten Review entstanden und **ungeprüft**. Anlass war ein
echter Lauf: „schau in der Aktien-App nach den Kursen" scheiterte an zwei Dingen vor dem Modell.

**(a) Rückkanal des Kurzbefehls.** `shortcuts run` schreibt sein Ergebnis nie auf die
Standardausgabe, nur in die Datei aus `--output-path`. Die Option wurde nirgends übergeben —
beim Modell kam also grundsätzlich nichts an, obwohl die Werkzeugbeschreibung „gibt dessen
Ausgabe zurück" versprach. Jetzt schreibt der Kurzbefehl nach `outbox/kurzbefehl-<n>.txt`,
die App liest zurück (8 KB Deckel, Binärschutz) und sagt dem Modell bei leerer Ausgabe
ausdrücklich, es solle keine Werte erfinden.
- `app/src/main/noteAgent/computerControl.ts:364` — `runShortcut`, `--output-path`, Dateiname aus `state.actions`
- `app/src/main/noteAgent/computerControl.ts:406` — `readShortcutOutput`, Deckel und Binärschutz
- Tests: `app/src/main/noteAgent/computerControl.test.ts`, describe „Ausgabe eines Kurzbefehls"

**(b) Kurzbefehle werden ausgewählt statt getippt.** Grund wie F08: ein Textfeld nimmt jeden
Namen an, und dass es den Kurzbefehl nicht gibt, merkt man erst mitten im Lauf. Die Liste kommt
jetzt aus `shortcuts list`.
- `app/src/main/index.ts:1081` — IPC `computer-control-list-shortcuts`
- `app/src/renderer/components/Settings/ComputerControlSection.tsx:51` — `ShortcutListField`

**(c) „Übernehmen und öffnen" auf der Ergebniskarte.** Hängt NICHT an der Rechner-Steuerung.
Öffnet nach der Übernahme die Datei im Vault über den bestehenden `open-path`-Handler.
- `app/src/main/index.ts:4905` — `absPath` neu in der Antwort von `note-agent-accept-result`
- `app/src/renderer/stores/noteAgentStore.ts:370` — `acceptResult(…, openAfter)`
- `app/src/renderer/components/Agent/AgentRunPanel.tsx:223` — der Knopf
- `app/src/renderer/utils/resultFormats.ts` — welche Formate ihn bekommen (+ Tests daneben)

**Die Behauptungen, an denen sich das messen lassen muss:**

1. Der Rückkanal öffnet **keinen neuen Weg nach draußen und keinen neuen Weg herein**, der an
   den Freigaben vorbeigeht. Der Pfad der Ausgabedatei ist von der App gebaut, nicht vom Modell.
   → Kann ein Kurzbefehl-Name oder eine Eingabedatei den Ausgabepfad beeinflussen? Kann die
   Ausgabedatei außerhalb der Outbox landen? Was, wenn sie schon existiert, ein Symlink ist,
   oder wenn zwei Kurzbefehle in einem Lauf dieselbe Nummer bekommen?
2. Was der Kurzbefehl zurückgibt, ist **untrusted Eingabe** und geht direkt in den
   Modellkontext. → Reicht der 8-KB-Deckel? Ist der Binärschutz (Nullbyte in den ersten 1024
   Bytes) tragfähig? Kann der Inhalt die Werkzeugantwort verfälschen oder wie eine
   App-Meldung aussehen — Prompt-Injection über den eigenen Rückkanal?
3. `absPath` verlässt den Main und geht an den Renderer. → Ist das eine neue Preisgabe? Trägt
   `assertSafePath` in `open-path` wirklich, auch wenn `reserveFreeName` umbenannt hat?
4. Der Knopf soll **die Datei im Vault** öffnen, nie die Wegwerf-Kopie aus der Outbox.
   → Stimmt das in allen Pfaden, auch bei Namenskollision und bei Fehlschlag der Übernahme?
5. `needsExternalApp` entscheidet, wann der Knopf erscheint. → Falsch-positiv/negativ?
   Doppelendungen, Grossschreibung, Namen ohne Endung, Namen mit Pfadtrennern?
6. Die Kurzbefehl-Liste kommt aus einem Systemaufruf in den Renderer. → Kann ein
   Kurzbefehl-NAME die Oberfläche oder die spätere Freigabeprüfung kippen
   (`isValidComputerName`, Vergleich case-insensitive, Namen mit Zeilenumbruch)?

**Prüfe außerdem, was ich nicht bedacht habe.** Besonders: Zusammenspiel mit der Agent-Shell im
selben Lauf, Verhalten bei Abbruch mitten im Kurzbefehl, und ob die Fehlermeldungen jetzt mehr
verraten als vorher.

## Codex-Findings

### F01 — „Datei öffnen“ ist ein Ausführungskanal für modellgeschriebenes HTML und aktive Vault-Dateien
Schwere: hoch
Stelle: app/src/main/noteAgent/computerControl.ts:196
Status: [OFFEN]
`computer_open` übergibt jedes aufgelöste Ziel ohne Format- oder Aktivitätsprüfung an `/usr/bin/open` (`computerControl.ts:196-209`). Für Vault-Dateien gibt es überhaupt keine Endungs-Allowlist (`computerControl.ts:158-175`); damit kann das Modell unter anderem eine vorhandene `.command`, `.terminal`, `.scpt`, `.workflow`, `.webloc` oder eine andere vom Standardprogramm aktiv behandelte Datei öffnen. Noch direkter widerlegt die Kombination mit den normalen Writer-Werkzeugen die Kernbehauptung „Das Modell schreibt nie ein Skript“: `.html` ist ein erlaubtes Agent-Ergebnis (`staging.ts:15-18`), `write_html` übernimmt `body_html` aus der Modellausgabe und baut es ohne HTML-Sanitization in die Datei ein (`skills.ts:880-903`, `skills.ts:927-940`). Das Modell kann daher selbst `<script>` bzw. aktive HTML-Elemente schreiben und anschließend genau dieses Ergebnis per `computer_open` im Browser starten. Das Browser-Skript ist zwar kein Shellprozess, kann aber mit den vom Modell zuvor in die Seite geschriebenen Daten Netzwerkzugriffe auslösen; die Trennung von Webrecherche verhindert diesen Ausgangskanal nicht.

Die Argumentliste verhindert lediglich Shell-/Optionsinjektion in `open`; sie verhindert nicht, dass der dokumentierte Zweck des geöffneten Dateityps selbst Code oder Aktionen ausführt. Die Einstellungsseite behauptet trotzdem uneingeschränkt, der Agent schreibe nie ein Skript (`ComputerControlSection.tsx:98-101`).

Vorschlag: `open` auf eine explizite passive Format-Allowlist begrenzen und mindestens HTML/HTM sowie aktive macOS-Dateitypen ausschließen; alternativ HTML vor Übergabe strikt sanitizen und in einem gehärteten, netzlosen Viewer öffnen. Vault-Dateien sollten dieselbe Typprüfung wie Ergebnisse durchlaufen. Diese Grenze im Dialog und in den Einstellungen ausdrücklich nennen.

### F02 — Vault-Pfadprüfung ist TOCTOU-anfällig
Schwere: hoch
Stelle: app/src/main/noteAgent/computerControl.ts:161
Status: [OFFEN]
Für eine Vault-Datei wird zunächst der Symlink per `realpath` aufgelöst und die Lage im Vault geprüft (`computerControl.ts:161-174`), danach wird aber nur der resultierende Pfadstring zurückgegeben (`computerControl.ts:175`). Erst später öffnet `open`, `lp` oder AppleScript diesen Namen erneut (`computerControl.ts:207-208`, `computerControl.ts:214-225`, `computerControl.ts:280-285`). Zwischen Prüfung und Nutzung kann ein anderer Prozess, der Sync oder der Nutzer die geprüfte Datei bzw. einen Pfadbestandteil durch einen Symlink nach außerhalb ersetzen. Dann folgt das Zielprogramm dem neuen Namen und erhält eine Datei außerhalb des Vaults. `stat(real)` schließt das nicht: auch dieser Check liegt vor der späteren erneuten Namensauflösung (`computerControl.ts:173-175`).

Die Ergebnisquelle ist gegen diesen konkreten Tausch besser gestellt, weil sie vor der Übergabe in `outbox` kopiert wird (`computerControl.ts:151-155`); Vault-Dateien werden dagegen direkt übergeben. Damit ist die harte Aussage „nur Dateien im Vault“ nicht dauerhaft an das tatsächlich verwendete Objekt gebunden.

Vorschlag: auch Vault-Dateien nach erfolgreicher Prüfung über einen geöffneten Dateideskriptor in einen ausschließlich vom Main beschreibbaren Outbox-Pfad kopieren und ausschließlich diese unveränderliche Kopie übergeben. Beim Kopieren `open`/`fstat` verwenden und Symlinks beim letzten Pfadglied fail-closed behandeln.

### F03 — Timeout und Abbruch können eine bereits ausgeführte Wirkung als Fehler melden und Wiederholung auslösen
Schwere: hoch
Stelle: app/src/main/noteAgent/computerControl.ts:179
Status: [OFFEN]
`runTool` setzt pauschal 20 Sekunden Timeout und beendet nur den aufgerufenen CLI-Prozess (`computerControl.ts:21-22`, `computerControl.ts:179-193`). Bei `lp`, `open`, Mail-AppleScript und besonders einem längeren Kurzbefehl kann die externe Wirkung bereits erfolgt bzw. vom Zielprogramm übernommen worden sein, bevor der CLI-Prozess getötet wird. Bei gleichzeitigem Abbruch verwirft der Callback sogar einen erfolgreichen Exit und meldet nur „Abgebrochen“ (`computerControl.ts:181-186`). Der Tool-Loop fängt diesen Fehler, gibt ihn dem Modell zurück und läuft weiter (`loop.ts:312-349`). Es gibt weder eine Idempotenzkennung noch einen Zustand „Wirkung möglicherweise erfolgt“; die einzige Doppel-Ausführungs-Sperre ist die Prompt-Anweisung (`loop.ts:81-89`). Das Modell kann deshalb nach einem Timeout einen zweiten Druckauftrag, zweiten Mail-Entwurf oder zweiten Kurzbefehl starten. Der Zehnerzähler begrenzt die Anzahl, verhindert die Duplikate aber nicht (`computerControl.ts:124-133`).

Auch der Abbrechen-Knopf kann bereits übergebene Arbeit nicht zurückholen: er setzt nur das AbortSignal (`index.ts:4724-4727`), worauf `runTool` den CLI-Prozess tötet (`computerControl.ts:190-192`). Ein schon an CUPS, Mail, LaunchServices oder Kurzbefehle übergebener Vorgang bleibt bestehen, während der Lauf als abgebrochen erscheint.

Vorschlag: Seiteneffekte nach Start nicht als sicher fehlgeschlagen darstellen. Pro Tool-Call eine Zustandsmaschine (`nicht gestartet` / `übergeben` / `bestätigt` / `Ausgang unbekannt`) führen und bei unbekanntem Ausgang keine automatische Wiederholung mehr zulassen. Für Kurzbefehle ein eigenes, realistischeres Timeout und klare Abbruchsemantik vorsehen; im UI nach Abbruch auf mögliche fortbestehende Wirkung hinweisen.

### F04 — Das erste Opt-in ist gegen einen kompromittierten Renderer keine Main-seitige Grenze
Schwere: mittel
Stelle: app/src/main/index.ts:1628
Status: [OFFEN]
Der Main prüft zwar `agentComputerEnabled` und liest die Vorgangsliste aus `ui-settings.json` (`index.ts:4393-4403`), aber genau diese Datei kann der Renderer über den generischen Handler beliebig mergen: `save-ui-settings` übernimmt das übergebene Objekt ohne `isTrustedSender`, Schema oder Schutz der sensitiven Schlüssel (`index.ts:1622-1634`, `index.ts:1051-1062`). Ein kompromittierter Top-Renderer kann daher `agentComputerEnabled`, alle Verben, Programme und Kurzbefehle selbst setzen und danach `note-agent-run` mit `computerAccess:true` anfordern. Dass die Werte nicht direkt im Run-Parameter stehen, schafft gegen dieses Angreifermodell keine zusätzliche Grenze.

Der native Dialog bleibt als echte, nicht gefundene Umgehung bestehen und zeigt die dann manipulierte Liste (`index.ts:4604-4617`). Damit gibt es gegen einen kompromittierten Renderer effektiv ein Opt-in, nicht zwei. Die Kommentare nennen dennoch das Settings-Flag als Main-durchgesetzte erste Stufe (`index.ts:4393-4398`).

Vorschlag: Entweder die Sicherheitsbehauptung auf „native Freigabe ist die einzige Grenze gegen Renderer-Kompromittierung“ korrigieren oder Änderungen an Modulflag und Freigabelisten über einen separaten Main-Flow mit vertrauenswürdigem, nutzerinitiiertem Bestätigungsdialog führen. Mindestens `save-ui-settings` mit `isTrustedSender` und einem Schema absichern; das schützt allerdings einen bereits kompromittierten Top-Renderer allein noch nicht.

### F05 — Das Modell kann die angeblich unlesbaren Freigabelisten aktiv auslesen
Schwere: mittel
Stelle: app/src/main/noteAgent/computerControl.ts:201
Status: [OFFEN]
Die Einstellungsoberfläche erklärt, der Agent könne die Freigabeliste „weder lesen noch erweitern“ (`ComputerControlSection.tsx:8-12`). Ein absichtlich nicht freigegebener Programmname führt jedoch zu einer Fehlermeldung mit der vollständigen Programmliste (`computerControl.ts:200-204`); dasselbe gilt für Kurzbefehle (`computerControl.ts:229-233`). Der Loop gibt geworfene Tool-Fehler vollständig an das Modell zurück (`loop.ts:340-348`). Ein einziger Fehlversuch offenbart also bis zu 25 Namen; er zählt zwar gegen das Budget, danach kann das Modell einen erlernten Eintrag aufrufen.

Das ist nicht nur Informationspreisgabe: Der Systemprompt nennt zwar die freigegebenen Vorgangsarten (`loop.ts:81-89`), aber weder erlaubte Programme noch Kurzbefehl-Namen. Der aktuelle Funktionspfad ist daher entweder auf Raten/Fehler angewiesen oder darauf, dass der exakte Name schon im Auftrag steht. Die UI-Zusage und der echte Code widersprechen sich.

Vorschlag: Ablehnungsfehler nur generisch formulieren und die Liste nicht ans Modell zurückgeben. Wenn das Modell Namen kennen soll, diese Entscheidung offen dokumentieren und die konkret sichtbaren Namen kontrolliert in den Prompt geben, statt sie über einen Fehlerkanal preiszugeben.

### F06 — Verfügbarkeit prüft nur „macOS“, nicht Drucker, Werkzeuge oder Automationsrechte
Schwere: mittel
Stelle: app/src/main/noteAgent/computerControl.ts:78
Status: [OFFEN]
`computerControlAvailability` erklärt auf jedem macOS-System Erfolg, ohne `/usr/bin/shortcuts`, `/usr/bin/lp`, einen Standarddrucker, Mail.app oder den TCC-/Apple-Events-Zugriff zu prüfen (`computerControl.ts:78-83`). Die Oberfläche leitet „verfügbar“ ebenfalls nur aus `navigator.platform` ab (`ComputerControlSection.tsx:84-107`). Erst nach der Lauf-Freigabe treffen Aufrufe auf `lp`, `shortcuts` bzw. `osascript` (`computerControl.ts:219-240`, `computerControl.ts:285`); deren rohe stderr-/Fehlermeldung gelangt bis zu 500 Zeichen an Modell und Laufprotokoll (`computerControl.ts:181-186`, `loop.ts:340-348`). Die vorhandenen Tests prüfen erfolgreiche echte Systemaufrufe bewusst nicht; sie belegen nur Ablehnungs- und Argumentlogik (`computerControl.test.ts:87-209`).

Damit wird ein nicht ausführbarer Vorgang im Dialog als freigegeben dargestellt, verbraucht anschließend Budget und Modelliteration und kann bei TCC-Ablehnung wiederholt werden. Bei `lp` ohne Standarddrucker entsteht kein Druckauftrag, obwohl die UI vorher keinen Einrichtungsbedarf erkennen lässt; bei einem nicht vorhandenen oder inkompatiblen `shortcuts` gilt dasselbe.

Vorschlag: Vor dem Dialog statisch die benötigten Binaries/Apps prüfen und für Drucken zusätzlich die CUPS-Zielkonfiguration abfragen. TCC lässt sich nicht zuverlässig vorab erzwingen; dessen Ablehnung sollte aber als eigener, nicht erneut zu versuchender Zustand mit konkretem nächsten Schritt für den Nutzer behandelt werden. Einstellungen sollten pro Vorgang „bereit / Einrichtung oder Recht fehlt“ anzeigen statt pauschal „auf macOS verfügbar“.

### F07 — Ergebnisname verdrängt gleichnamige Vault-Datei still
Schwere: niedrig
Stelle: app/src/main/noteAgent/computerControl.ts:151
Status: [OFFEN]
`resolveComputerTarget` sucht zuerst case-insensitiv in allen Ergebnissen und prüft erst danach den vaultrelativen Pfad (`computerControl.ts:151-158`). Existiert im Vault etwa `Bericht.pdf` und erzeugt der Lauf ebenfalls ein Ergebnis `Bericht.pdf`, kann die Vault-Datei über diesen Namen nicht mehr adressiert werden; statt ihrer wird still die Ergebnis-Kopie geöffnet, gedruckt oder angehängt. Bei mehreren Ergebnissen mit gleichem `suggestedName` gewinnt ebenso nur der erste Map-Eintrag. Weder das Tool-Schema noch die Rückmeldung macht den Namensraum bzw. die Mehrdeutigkeit sichtbar (`computerTools.ts:9-15`).

Das ist keine Grenzüberschreitung, aber bei Mail-Anhängen und Druck ein relevanter Falsche-Datei-Fehler. Gerade weil beide Quellen ausdrücklich erlaubt sind, darf ihre Kollision nicht über eine verdeckte Prioritätsregel entschieden werden.

Vorschlag: Quellen syntaktisch unterscheiden (z. B. opaker Ergebnis-Handle gegenüber `vault:<relpfad>`) oder Mehrdeutigkeit ablehnen und beide Kandidaten nennen. Ergebnisnamen innerhalb eines Laufs ebenfalls eindeutig machen.

### F10 — Die „passive“ Format-Allowlist erlaubt weiterhin Inhaltsausführung und Netzabrufe
Schwere: hoch
Stelle: app/src/shared/computerControl.ts:218
Status: [OFFEN]
Die Endungsprüfung selbst ist gegen die genannten Schreibweisen nicht offen: Großschreibung wird absichtlich normalisiert; Dateien ohne passende letzte Endung, eine Endung nur im Ordnernamen und Unicode-Homoglyphen des Punkts bzw. der Buchstaben fallen durch (`computerControl.ts:229-231`). Eine Doppelendung passiert nur, wenn die **letzte** Endung erlaubt ist. Das verhindert aber nicht den eigentlichen Ausführungskanal.

Die Allowlist enthält `.csv` und die alten Office-Formate `.doc`, `.xls`, `.ppt` (`computerControl.ts:218-221`). Tabellenprogramme interpretieren CSV-Zellen als Formeln; die alten binären Office-Formate können VBA-Makros enthalten, und Dokumente können externe Ressourcen nachladen. `openWithApp` prüft keinerlei Inhalt, sondern reicht die Datei nach dem Suffix-Test an das Standardprogramm oder ein freigegebenes Programm weiter (`main/noteAgent/computerControl.ts:325-348`). Bei einem ausdrücklich gewählten Programm ist nicht einmal garantiert, dass es den Dateityp passiv behandelt. Die Kernbehauptung „Formate, die ein Programm anzeigt, ohne ihren Inhalt auszuführen“ im echten Fehlertext (`computerControl.ts:328-331`) ist deshalb falsch. Die Allowlist schließt HTML und offensichtliche Skript-Endungen, aber nicht Ausführung oder Netz durch Dokumentformate aus.

Vorschlag: Mindestens CSV und die makrofähigen Legacy-Office-Endungen aus der passiven Liste entfernen; für verbleibende Container aktive Inhalte/externe Beziehungen prüfen oder die Sicherheitsbehauptung entsprechend begrenzen.

### F11 — `attempted` lässt dieselbe Außenwirkung unter anderer Schreibweise erneut zu
Schwere: hoch
Stelle: app/src/main/noteAgent/computerControl.ts:346
Status: [OFFEN]
Alle fünf `runTool`-Pfade rufen zwar vor dem Prozessstart `markAttempt` auf (`computerControl.ts:346-348`, `358-359`, `371-372`, `398-399`, `493-494`). Die Signaturen beschreiben die Wirkung aber nicht kanonisch. Dieselbe Datei kann einmal ohne Programmnennung und danach mit der Bundle-Kennung ihres ohnehin verwendeten Standardprogramms geöffnet werden; die Signaturen unterscheiden sich durch den leeren bzw. gesetzten App-Teil (`computerControl.ts:333-346`). Ein freigegebener Kurzbefehl wird ohne Rücksicht auf Groß-/Kleinschreibung akzeptiert (`shared/computerControl.ts:187-191`), seine Signatur verwendet anschließend aber die unveränderte Schreibweise (`computerControl.ts:381-398`): Zwei Schreibweisen derselben Freigabe passieren die Wiederholungssperre und werden beide an `shortcuts run` übergeben. Beim Mail-Entwurf reichen schon eine andere Empfängerreihenfolge oder abweichende Adress-Großschreibung für eine neue Signatur; Text und Anhänge sind umgekehrt gar nicht Bestandteil der Signatur (`computerControl.ts:472-494`).

Damit gibt es keinen Systemaufruf ohne vorherige Markierung, aber sehr wohl mehrere Signaturen für dieselbe Wirkung. Die behauptete Sperre „derselbe Vorgang läuft nie zweimal“ hält nicht.

Vorschlag: Signaturen aus einer kanonischen, vollständigen Wirkungsbeschreibung bilden; insbesondere Kurzbefehl-Namen wie bei der Freigabe normalisieren und die tatsächliche Ziel-App vor dem Öffnen eindeutig bestimmen.

### F12 — Auch der neue Snapshot-Modus bleibt TOCTOU-anfällig
Schwere: hoch
Stelle: app/src/main/noteAgent/computerControl.ts:244
Status: [OFFEN]
Für Vault-Dateien löst `resolveComputerTarget` erst `realpath` und `stat` auf (`computerControl.ts:244-253`) und kopiert später erneut über denselben Pfadnamen (`computerControl.ts:281-284`). Zwischen diesen beiden asynchronen Schritten kann die Datei oder ein Pfadbestandteil ersetzt werden. `copyFile(vaultCandidate, target)` bindet nicht an das zuvor geprüfte Dateiobjekt und folgt bei der erneuten Auflösung einem inzwischen gesetzten Symlink. Der Snapshot kann dadurch gerade die nach außen führende Datei enthalten, die die Prüfung ausschließen sollte.

Die Behauptung im Code, Snapshot „schließt den Tausch zwischen Prüfung und Verwendung aus“ (`computerControl.ts:213-216`), ist daher falsch. Das alte F02 ist nicht nur im offen benannten `direct`-Modus übrig, sondern auch im als behoben dargestellten Snapshot-Modus. Beim direkten Öffnen ist das Restrisiko zudem stärker als begründet: Ein Tausch auf einen Symlink kann die Endungsprüfung des geprüften Pfadstrings mit einem anderen tatsächlichen Ziel kombinieren (`computerControl.ts:327-348`), nicht bloß den Inhalt einer ohnehin erlaubten Vault-Datei ersetzen.

Vorschlag: Quelle mit `open`/`fstat` objektgebunden prüfen und aus diesem Handle kopieren; Ziel exklusiv und ohne Symlink-Folgen anlegen. Für `direct` die Grenze nicht als durch die Formliste hinreichend begrenzt darstellen.

### F13 — Snapshot-Namen überschreiben sich und können falsche Mail-Anhänge erzeugen
Schwere: hoch
Stelle: app/src/main/noteAgent/computerControl.ts:283
Status: [OFFEN]
Vault-Snapshots landen stets unter `outbox/<basename>` und `copyFile` überschreibt dort vorhandene Dateien (`computerControl.ts:281-285`). Zwei zulässige Anhänge wie `Kunde-A/Bericht.pdf` und `Kunde-B/Bericht.pdf` erzeugen deshalb denselben Zielpfad. `createMailDraft` sammelt erst alle Pfade und startet Apple Mail erst danach (`computerControl.ts:483-494`): Beide argv-Einträge zeigen dann auf dieselbe, zuletzt kopierte Datei. Ebenso kann ein zuvor kopiertes Laufergebnis durch einen Vault-Snapshot gleichen Basisnamens ersetzt werden, obwohl die Mehrdeutigkeitsprüfung nur den jeweils eingegebenen vollständigen Namen vergleicht (`computerControl.ts:237-260`).

Modellgesteuerte Pfadtraversal über `suggestedName` ist bei den normalen Schreibwerkzeugen durch `sanitizeOutputFileName` abgefangen (`staging.ts:40-51`). Die Outbox ist aber nicht kollisionsfrei, und das Überschreiben ist ein deterministischer Falsche-Datei-Fehler ohne Angreifer oder Race.

Vorschlag: Jeden Snapshot unter einem exklusiv reservierten, opaken Namen ablegen und das Originaletikett nur separat für die Rückmeldung führen.

### F14 — Die Testsperre verhindert genau die relevanten Erfolgs- und Fehlerpfade
Schwere: mittel
Stelle: app/src/main/noteAgent/computerControl.ts:294
Status: [OFFEN]
`runTool` lehnt unter Vitest bzw. `NODE_ENV=test` vor `execFile` pauschal jeden Aufruf ab (`computerControl.ts:294-302`). Damit können automatisierte Tests weder Argumentübergabe an den Prozess noch erfolgreichen Exit, stderr, Timeout, Abbruch oder die Nachverarbeitung eines echten bzw. gemockten Kindprozesses prüfen. Der vorhandene Wiederholungstest wertet bereits die Testsperre als ersten Fehlschlag und erreicht den im Kommentar behaupteten nicht vorhandenen Kurzbefehl überhaupt nicht (`computerControl.test.ts:225-236`). Ein künftig falscher Binary-Pfad oder eine fehlerhafte argv-Reihenfolge bleibt dadurch grün, solange die Ablehnung davor funktioniert.

Die Sperre verhindert reale Druckaufträge, verdeckt aber zugleich die Integrationsgrenze, die sie schützen soll. Außerdem ist sie als Laufzeitbedingung im Produktionsbundle enthalten: Eine mit `NODE_ENV=test` gestartete gebaute App verliert die Rechner-Steuerung vollständig.

Vorschlag: Den Prozessstarter injizierbar machen und in Tests durch einen aufzeichnenden Fake ersetzen; echte Systemaufrufe nur in ausdrücklich markierten manuellen Integrationstests erlauben.

### F15 — Der Programmpicker vertraut der Selbstauskunft eines beliebigen `.app`-Verzeichnisses
Schwere: hoch
Stelle: app/src/main/index.ts:1050
Status: [OFFEN]
Der Dialog startet zwar in `/Applications`, beschränkt die Auswahl aber nicht auf diesen oder einen anderen vertrauenswürdigen Ort (`index.ts:1050-1055`). Danach genügt die Endung `.app`; der Code liest ungeprüft `Contents/Info.plist` und übernimmt die dort selbst behauptete `CFBundleIdentifier` (`index.ts:1058-1071`). Weder kanonischer Pfad, Bundle-Struktur, Code-Signatur noch die Zuordnung „diese Kennung gehört genau zu dem ausgewählten Bundle“ werden geprüft. Gespeichert wird anschließend nur `{id,label}`, nicht der bestätigte Pfad (`shared/computerControl.ts:23-38`), und beim Lauf startet `open -b` irgendeine von LaunchServices unter dieser Kennung aufgelöste App (`computerControl.ts:342-348`).

Ein präpariertes `.app`-Verzeichnis kann somit einen harmlosen Namen und die Kennung eines anderen Programms behaupten; die spätere Wirkung ist nicht mehr an das Objekt gebunden, das der Nutzer im Dialog ausgewählt hat. Ein solches Bundle kann außerdem `Info.plist` als Symlink oder sehr große Datei bereitstellen, weil `readFile` ohne Größen- und Dateitypgrenze folgt (`index.ts:1062-1064`). Der `plutil`-Aufruf selbst ist dagegen nicht optionsinjizierbar: Er erhält eine feste Argumentliste und die Daten über stdin (`index.ts:1121-1131`).

Vorschlag: Den ausgewählten Bundle-Pfad kanonisieren, reguläre Bundle-Dateien und Code-Signatur prüfen und die spätere Ausführung an genau diesen bestätigten Pfad bzw. dessen geprüfte Signatur binden statt an eine selbst deklarierte Kennung.

### F16 — Ein Abbruch während der Zielauflösung kann den Vorgang danach noch starten
Schwere: hoch
Stelle: app/src/main/noteAgent/computerControl.ts:303
Status: [OFFEN]
`requireVerb` prüft den Abbruch nur am Anfang (`computerControl.ts:174-188`). Danach folgen bei Öffnen, Finder, Drucken, Kurzbefehl mit Datei und Mail-Anhängen mehrere asynchrone Dateisystemschritte (`computerControl.ts:227-285`). Wird der Lauf in dieser Zeit abgebrochen, gibt es vor `runTool` keine erneute Aktivitätsprüfung. `runTool` ruft zuerst `execFile` auf und prüft das bereits gesetzte AbortSignal erst **nach** dem Start des Kindprozesses (`computerControl.ts:303-321`). Der Prozess wird dann zwar getötet, kann die Wirkung aber bereits an LaunchServices, CUPS, Mail oder Kurzbefehle übergeben haben.

Der Vorgang ist vorher markiert, daher ist dies kein `markAttempt`-Bypass. Es ist aber ein neuer Außenwirkungspfad **nach** dem Nutzerabbruch und widerspricht der Erwartung, dass Abbrechen einen noch nicht gestarteten Vorgang verhindert.

Vorschlag: Unmittelbar vor `execFile` fail-closed auf Abort prüfen und nach jeder vorbereitenden Kopie erneut `assertActive` aufrufen.

### F17 — „Kein Druckercheck“ ist benannt, aber die Begründung trägt nicht
Schwere: mittel
Stelle: app/src/main/noteAgent/computerControl.ts:110
Status: [OFFEN]
Die Verfügbarkeitsprobe prüft für Drucken ausschließlich, ob `/usr/bin/lp` ausführbar ist (`computerControl.ts:98-121`). Deshalb kann der Dialog „drucken“ als in diesem Lauf möglich anzeigen (`index.ts:4721-4736`), obwohl nachweislich kein Standarddrucker konfiguriert ist. Die spätere Rückmeldung relativiert nur, ob tatsächlich Papier herauskommt (`computerControl.ts:371-373`); sie verhindert den vorher bekannten Fehlschlag nicht.

Die Teilerledigung ist offen benannt, aber „verschiebt nur den Zeitpunkt der Enttäuschung“ ist keine tragfähige Ablehnung: Eine Abfrage des konfigurierten Standardziels kann nicht Papier, Tinte oder Erreichbarkeit garantieren, wohl aber den deterministischen Zustand „kein Standarddrucker“ vor der Freigabe erkennen. Das alte F06 bleibt in diesem Teil sachlich offen. Die TCC-Einwilligung ist dagegen tatsächlich erst beim Zugriff zuverlässig entscheidbar und wird im Dialog vorab angekündigt (`index.ts:4736`).

Vorschlag: Mindestens das Vorhandensein eines Standarddruckziels prüfen und „Drucker vorhanden“ klar von „Ausgabe erfolgreich“ trennen.

## Claude-Antwort

Alle sieben Befunde habe ich gegen den echten Code nachgeprüft. **Alle sieben treffen zu**,
F01 und F04 widerlegen Behauptungen, die ich selbst in die Oberfläche geschrieben hatte.
Sechs sind behoben, einer teilweise mit benanntem Restrisiko.

### F01 — Öffnen war ein Ausführungskanal → [ADRESSIERT]
Bestätigt und gravierender als die Schwere „hoch" vermuten lässt: `write_html` prüft nur auf
ein Dokumentgerüst (`skills.ts:897`) und sanitisiert nichts; `buildScientificHtmlPage` gibt
ohnehin `<script>`-Tags aus (`scientificHtmlPage.ts:108`). Ein vom Modell geschriebenes
`<script>` wäre beim Öffnen im Systembrowser gelaufen — mit Netz. Damit wäre ausgerechnet der
Ausgangskanal offen gewesen, gegen den die Trennung von der Webrecherche gebaut ist.

Behoben mit einer **Allowlist passiver Formate** statt einer Sperrliste
(`shared/computerControl.ts:OPENABLE_EXTENSIONS`, geprüft in `computerControl.ts:openWithApp`):
PDF, Text, Markdown, CSV, RTF, Office-Formate, Bilder. Damit fallen `.html`/`.htm` UND
`.command`, `.scpt`, `.workflow`, `.webloc`, `.app` durch Konstruktion heraus, ohne dass ich
sie einzeln kennen muss. Die Allowlist gilt für Ergebnisse **und** Vault-Dateien.

HTML-Ergebnisse verliert der Nutzer dadurch nicht: dafür gibt es die eingebaute Vorschau
(`mindgraph-preview://`, eigene CSP ohne externe Hosts, iframe ohne `allow-same-origin`) —
die ist für genau diesen Fall da und sicherer als der Systembrowser. Prompt, Einstellungen
und Fehlermeldung sagen das jetzt. Tests: „öffnet keine HTML-Seite …", „öffnet keine
ausführbaren Dateien aus dem Vault".

### F02 — TOCTOU bei Vault-Pfaden → [ADRESSIERT, mit benanntem Restrisiko]
Bestätigt. Behoben, wo es ohne Funktionsverlust geht: `resolveComputerTarget` hat jetzt einen
Modus. **Drucken und Mail-Anhänge bekommen eine Kopie im Outbox-Ordner** (`'snapshot'`) —
dort ist ein unveränderlicher Stand ohnehin das Richtige, ein Anhang soll zeigen, was der
Agent gemeint hat.

Für **Öffnen und Im-Finder-zeigen** bleibt der echte Pfad (`'direct'`), und zwar bewusst: eine
Kopie zu öffnen hieße, dass jede Bearbeitung des Nutzers ins Leere läuft — ein Datenverlust,
der schwerer wiegt als das Restrisiko. Dieses Restrisiko steht jetzt im Code-Kommentar und im
Plan: Es verlangt Schreibrechte im Vault (wer die hat, kann die Datei auch direkt austauschen),
und die Formliste aus F01 begrenzt, was ein Tausch erreichen kann. Deinen Vorschlag mit
`open`/`fstat` habe ich nicht umgesetzt, weil er das Öffnen-zum-Bearbeiten nicht löst.
Test: „übergibt beim Drucken und Anhängen eine Kopie, nicht den Vault-Pfad".

### F03 — Wirkung eingetreten, Meldung „Fehler" → [ADRESSIERT]
Bestätigt, inklusive der Kette: `runTool` verwarf bei Abbruch sogar einen erfolgreichen Exit,
und der Loop reicht jeden Tool-Fehler ans Modell zurück (`loop.ts:340-348`), das es erneut
versuchen kann.

Drei Änderungen: (1) `state.attempted` — die Signatur eines Vorgangs wird **vor** dem Aufruf
eingetragen, eine Wiederholung derselben Wirkung wird abgelehnt, ausdrücklich auch nach
unklarem Ausgang. (2) Zeitüberschreitung und Abbruch melden jetzt „Ausgang unbekannt, nicht
wiederholen, nachsehen" statt eines Fehlschlags. (3) Kurzbefehle bekommen 120 s statt 20 s —
20 s waren für ein vom Nutzer geschriebenes Skript zu knapp.

Was **nicht** lösbar ist und deshalb benannt wird statt behauptet: ein an CUPS, Mail oder die
Kurzbefehle-App übergebener Vorgang lässt sich vom Abbrechen-Knopf nicht zurückholen. Das
steht jetzt in der Meldung und in den Einstellungen.

### F04 — erste Opt-in-Stufe war gegen einen kompromittierten Renderer keine Grenze → [ADRESSIERT]
Bestätigt: `save-ui-settings` hatte weder `isTrustedSender` noch Schema und merged blind
(`index.ts:1051-1062`). 51 andere Handler prüfen den Sender, dieser nicht. Das betrifft
übrigens genauso `agentShellEnabled` — ich habe die Lücke also nicht eingeführt, sondern
geerbt und mit meiner Formulierung zugedeckt.

`isTrustedSender` ist jetzt drin. Das schließt eingebettete Frames aus (der eigentliche
Angriffsweg über fremdes Markdown), und die Transport-Fenster funktionieren weiter, weil
`isTrustedSender` jedes eigene App-Fenster im Top-Frame akzeptiert
(`plugins/transport.ts:18-28`) — keine Regression bei der Schnellerfassung.

Deinem Punkt zur **Formulierung** gebe ich recht, und das ist der wichtigere Teil: Gegen einen
kompromittierten Haupt-Renderer schützt auch das nicht. Ich habe die Aussage überall
korrigiert — Code-Kommentar, Einstellungsseite, Plan: **die native Freigabe ist die einzige
Grenze gegen einen kompromittierten Renderer**, das Modul-Flag ist eine Ordnungs- und
Sichtbarkeitsstufe, keine zweite Mauer.

### F05 — Fehlermeldung gab die Freigabeliste aus → [ADRESSIERT, anders als vorgeschlagen]
Bestätigt: die Listen standen wörtlich in den Ablehnungen, und der Loop reicht sie durch.

Ich habe **beide** Enden angefasst, aber in die andere Richtung als vorgeschlagen. Die Listen
sind aus allen Fehlermeldungen raus (dein Punkt). Dafür stehen die freigegebenen Programme und
Kurzbefehle jetzt **ausdrücklich im System-Prompt** eines freigegebenen Laufs
(`loop.ts:computerBlock`) — denn dein Nebenbefund stimmt auch: ohne die Namen war der
Funktionspfad auf Raten angewiesen. Kontrollierte Nennung schlägt Preisgabe über einen
Fehlerkanal. Die Zusage in der Oberfläche heißt jetzt „kann die Liste nicht erweitern" statt
„weder lesen noch erweitern".

Gleich mitgenommen: auch die Ablehnung eines Ziels ist jetzt eine einheitliche Meldung. Vorher
unterschied sie „nicht gefunden" / „keine Datei" / „.mindgraph" und war damit ein Tastwerkzeug
für den Vault. Test: „verrät die Freigabelisten nicht über Fehlermeldungen".

### F06 — Verfügbarkeit prüfte nur „macOS" → [ADRESSIERT, teilweise]
Bestätigt. `authorizeComputer` prüft jetzt **vor** dem Dialog, ob das Systemwerkzeug jedes
Vorgangs vorhanden und ausführbar ist (`/usr/bin/open`, `lp`, `shortcuts`, `osascript`).
Fehlende Vorgänge fallen weg, werden im Laufprotokoll ausdrücklich als weggelassen genannt,
und bleiben gar keine übrig, startet die Steuerung nicht.

**Nicht** umgesetzt: die Abfrage des CUPS-Standarddruckers und ein Vorab-Test der
Einwilligung. Beides ist entweder nicht zuverlässig vorhersagbar (TCC) oder verschiebt nur den
Zeitpunkt der Enttäuschung. Statt zu behaupten, sagt die App es jetzt: die Druck-Rückmeldung
endet mit „Ob wirklich Papier herauskommt, hängt am eingerichteten Drucker — das kann die App
nicht feststellen", und die Einstellungen haben eine entsprechende Zeile. Die rohe
stderr-Weitergabe ist von 500 auf 300 Zeichen gekürzt.

### F07 — Ergebnisname verdrängte gleichnamige Vault-Datei → [ADRESSIERT]
Bestätigt. `resolveComputerTarget` löst jetzt **beide** Quellen auf und lehnt bei Kollision ab,
statt still zu entscheiden; ebenso bei zwei Ergebnissen mit gleichem Namen. Der Prompt sagt dem
Modell, wie es die Mehrdeutigkeit auflöst (Vault-Pfad mit Ordner). Deinen Vorschlag mit einem
opaken Handle habe ich verworfen: der Dateiname ist genau das, was das Modell vom
Schreib-Werkzeug zurückbekommt, ein zweiter Namensraum wäre eine neue Fehlerquelle.
Test: „lehnt einen Namen ab, den es als Ergebnis UND im Vault gibt".

### Eigener Befund aus dem Abarbeiten — Tests mit realer Wirkung

Beim Schreiben des F03-Regressionstests hat **ein Testlauf drei echte Druckaufträge** an den
Drucker des Entwicklers geschickt: die Prüflogik lag korrekt vor dem Systemaufruf, eine
Testzeile aber eben dahinter. Warteschlange geleert (`cancel -a`).

Daraus eine Schutzgrenze statt einer Merkregel: `runTool` lehnt jeden Aufruf ab, wenn
`VITEST`/`NODE_ENV=test` gesetzt ist. Ein Vorgang mit Wirkung außerhalb des Rechners startet in
einem automatisierten Lauf nicht mehr, auch nicht versehentlich. Der F03-Test läuft jetzt über
einen Kurzbefehlnamen, den es nicht gibt.

### Belege

- `npm run typecheck`, `npm run build` sauber.
- `npm run test`: 2228 grün. Ein Fehlschlag, **nicht aus dieser Arbeit**:
  `shellExecution.test.ts > Umgebungsprobe` läuft in das 5-s-Standardlimit von vitest, wenn die
  ganze Suite parallel läuft (die Probe startet echte Interpreter unter `sandbox-exec`); in
  Isolation grün. Bestand schon vor dieser Änderung.
- Neue Tests: 45 (16 `shared/computerControl.test.ts`, 29 `main/noteAgent/computerControl.test.ts`),
  je einer pro Befund.

### Weiterhin offen

- **GUI-Gegenprobe am echten Rechner** für Mail-Entwurf mit Anhang, Drucken und einen
  Kurzbefehl. Durch die neue Testsperre ist sie jetzt zwingend ein manueller Schritt — geprüft
  sind bisher nur Argumentübergabe (`osascript` mit feindlichen Werten) und das Kompilieren des
  Skripts (`osacompile`).
- **Restrisiko F02** bei Öffnen/Im-Finder-zeigen, siehe oben.
- **Abbruch holt nichts zurück**, siehe F03.

## GUI-Gegenprobe am echten Rechner (20.09.2026)

Durchgeführt mit einem Treiber, der **die Produktionsfunktionen selbst aufruft**
(`authorizeComputer`, `openWithApp`, `revealInFinder`, `createMailDraft`, `printFile`,
`runShortcut`) — nichts nachgebaut. Nötig war das ausserhalb von vitest, weil die Testsperre
in `runTool` jeden Vorgang mit Wirkung im automatisierten Lauf ablehnt.

| Vorgang | Ergebnis |
|---|---|
| Im Finder zeigen | trägt |
| Öffnen mit freigegebenem Programm | **scheiterte zuerst**, siehe F08; nach dem Umbau trägt es |
| HTML öffnen (muss abgelehnt werden, F01) | abgelehnt |
| Nicht freigegebenes Programm (Terminal) | abgelehnt, ohne die Liste zu verraten |
| Mail-Entwurf mit Anhang | trägt, Anhang sichtbar im Fenster (vom Nutzer bestätigt) |
| Drucken | von CUPS angenommen (`Anfrage-ID …-265`); der Drucker war offline („Drucker suchen"), Papier kam nicht heraus |
| Kurzbefehl mit Eingabedatei | trägt, Ausgabe kam zurück |
| Denselben Vorgang wiederholen (F03) | abgelehnt |

Oberfläche im echten Renderer geprüft (Dev-App auf geklontem Profil, CDP-Screenshot):
Karte, Statuszeile „4 von 5 frei", Vorgangsschalter, Programm-Chips und Kurzbefehl-Feld
rendern wie vorgesehen.

### F08 — `open -a` kennt keine lokalisierten Programmnamen → [BEHOBEN]
Schwere: hoch (Funktionsfehler, schnappt erst mitten im Lauf zu)
Stelle: app/src/main/noteAgent/computerControl.ts (openWithApp), ComputerControlSection.tsx

Der Lauf scheiterte mit `Unable to find application named 'Vorschau'`. Nachgemessen:
`open -a Vorschau` scheitert, `open -a Preview` trägt; `osascript -e 'id of app "Vorschau"'`
scheitert ebenfalls, Spotlight liefert den Anzeigenamen auch nicht. **Es gibt keinen
unterstützten Weg vom lokalisierten Anzeigenamen zur App.**

Damit war das Textfeld „Ein Name je Zeile, genau wie im Programme-Ordner" eine Falle: Der
Programme-Ordner ZEIGT „Vorschau", aufrufbar ist die App nur als „Preview". Ein deutscher
Nutzer trägt den falschen Namen ein, die Einstellungen nehmen ihn an, und der Fehler
erscheint erst mitten im Agent-Lauf.

Behoben durch **Auswählen statt Tippen**: neuer Systemdialog (IPC `computer-control-pick-app`,
`isTrustedSender`), gespeichert wird `{ id, label }` — Bundle-Kennung plus der **lokalisierte**
Anzeigename (über `mdls`, Rückfall auf den Ordnernamen). Geöffnet wird mit `open -b <Kennung>`
statt `open -a <Name>`. Das Modell nennt weiterhin das Etikett, `resolveAllowedApp` bildet ab.
Das Lesen der Kennung ist gegen echte Programme geprüft, XML **und** binäre `Info.plist`
(Microsoft Word ist binär, läuft über `plutil`). Tests: „nimmt einen getippten Programmnamen
NICHT als Freigabe an", „prüft Bundle-Kennungen eng", „findet das freigegebene Programm über
Anzeigenamen oder Kennung".

### F09 — Eigener Prüffehler: Mails Anhang-Abfrage von aussen ist unzuverlässig → [KEIN CODE-FEHLER]
Schwere: — (Methodenfehler, hier festgehalten, damit er nicht wiederkehrt)

Nach dem ersten Lauf meldete `count of (every attachment of content of m)` aus einem
ZWEITEN `osascript`-Aufruf **0 Anhänge** — ich hielt das für eine Falschmeldung des Werkzeugs.
Gegenprobe: dasselbe Skript, das im GLEICHEN Lauf zählt, meldet 1. Der Nutzer hat im offenen
Fenster nachgesehen: **die PDF hängt dran.** Mail gibt den Anhang einer offenen
Entwurfs-Nachricht nach aussen nicht zuverlässig heraus (dasselbe gilt für
`every outgoing message`, das nach dem Schliessen Geister-Einträge behält).

Merksatz für die nächste Gegenprobe: bei Mail **im Fenster nachsehen**, nicht aus einer
zweiten Skript-Sitzung zählen. Eine Messung, die dem Code widerspricht, ist erst einmal
verdächtig — nicht der Code.

## Status

✅ Runde 1: F01–F07 von Claude geprüft, alle bestätigt, sechs behoben, F02/F06 teilweise mit
benanntem Restrisiko.

⏸ Runde 2 (Nachprüfung) **nicht gelaufen**: Der Prüfer ist beim Absenden in sein Nutzungslimit
gelaufen („You've hit your usage limit … try again at 5:54 PM", 20.09.2026 14:52). Der Auftrag
ist angekommen und steht in der Pane; er wurde nicht bearbeitet. Nicht erneut gesendet.

Die Nachprüfung soll gezielt prüfen: hält die Format-Allowlist gegen Doppelendungen, fehlende
Endung und Unicode · gibt es einen Pfad, der eine Wirkung ohne `markAttempt` startet · ist die
Mehrdeutigkeitsprüfung lückenlos und die Outbox-Kopie selbst unproblematisch · bricht
`isTrustedSender` auf `save-ui-settings` einen legitimen Aufrufer · verdeckt die Testsperre in
`runTool` künftig echte Fehler · sind die Teilerledigungen bei F02 und F06 ehrlich begründet.

Ebenfalls offen und **nicht** durch die Prüfung ersetzbar: die GUI-Gegenprobe am echten Rechner
(Mail-Entwurf mit Anhang, Drucken, Kurzbefehl).

✅ GUI-Gegenprobe am echten Rechner gelaufen: sieben Vorgänge belegt, ein echter Fehler
gefunden und behoben (F08), ein eigener Prüffehler festgehalten (F09). Oberfläche im echten
Renderer geprüft.

⏸ Noch nicht belegt: der Auswahldialog selbst (Systemdialog, nicht fernsteuerbar — die Logik
dahinter ist gegen echte Programme geprüft), tatsächlicher Papierauswurf (Drucker war
offline), und der Weg über einen echten Agent-Lauf mit Modell statt über die Funktionen.

**Abnahme steht beim Nutzer aus.**


## Claude-Antwort — Runde 2 (21.09.2026)

Acht Befunde, **alle acht treffen zu**. Sechs davon widerlegen Behauptungen, die ich in
Runde 1 selbst in Kommentare und Oberflächentexte geschrieben hatte. Alle acht sind behoben.

### F10 — Allowlist erlaubte weiterhin Ausführung → [ADRESSIERT]
Richtig, und der Kern stimmt: Die Endungsprüfung war dicht (Gross-/Kleinschreibung,
Doppelendung, Ordnername, Unicode), aber die **Auswahl** war falsch. `.csv` (Formelauswertung
in Tabellenprogrammen) und `.doc`/`.xls`/`.ppt` (VBA-Makros) sind raus. Die Zusage „Formate,
die ein Programm anzeigt, ohne ihren Inhalt auszuführen" ist ersatzlos gestrichen — sie galt
auch nach dem Entfernen nicht absolut (DOCX lädt externe Verknüpfungen nach, und ein
ausdrücklich gewähltes Programm entscheidet ohnehin selbst). Der neue Text sagt, was die
Liste leistet: sie schliesst Formate aus, die **von sich aus Code mitbringen** — nicht mehr.
Gleicher Wortlaut in Fehlermeldung, Prompt und Einstellungen.

### F11 — Signaturen nicht kanonisch → [ADRESSIERT]
Richtig, und mit drei verschiedenen Lücken. Neu: `signature(verb, parts)` — Kleinschreibung,
sortierte Mehrfachwerte, getrimmt. Konkret: der **Programmteil fällt beim Öffnen ganz weg**
(eine Datei wird einmal je Lauf geöffnet, mit oder ohne Programmangabe), Kurzbefehlnamen
werden wie bei der Freigabe normalisiert, Empfänger sortiert, und **Anhänge sind jetzt Teil
der Mail-Signatur** — derselbe Betreff mit anderer Anlage ist ein anderer Entwurf.
Tests: „erkennt dieselbe Wirkung auch in anderer Schreibweise", „vertauschte Empfänger".

### F12 — Snapshot war weiterhin TOCTOU-anfällig → [ADRESSIERT]
Richtig, und mein Kommentar „schliesst den Tausch aus" war schlicht falsch: `copyFile(pfad,
ziel)` löst den Namen erneut auf. Neu `snapshotInto()`: die Quelle wird **einmal geöffnet**
und aus diesem Deskriptor gelesen; der Name spielt danach keine Rolle. Für `direct` habe ich
die Begründung korrigiert — dein Punkt trägt auch dort: Geprüft wird der Pfadstring,
geöffnet wird, worauf er dann zeigt, und die Endung des geprüften Namens sagt über das
tatsächliche Ziel nichts. Die Formatliste begrenzt das NICHT, wie ich behauptet hatte. Das
Restrisiko steht jetzt so da, samt „wer das nicht tragen will, nutzt Datei öffnen nicht".

### F13 — Outbox-Namen überschrieben sich → [ADRESSIERT]
Der unangenehmste Befund, weil deterministisch und ohne Angreifer: zwei Anhänge
`Kunde-A/Bericht.pdf` und `Kunde-B/Bericht.pdf` wären beide zum zuletzt kopierten Stand
geworden — ein falscher Mail-Anhang an einen echten Empfänger. Jeder Schnappschuss bekommt
jetzt einen eigenen Zufallsordner unter `outbox/`, geschrieben mit `wx` (nichts wird je
überschrieben); das Etikett für die Rückmeldung bleibt der sprechende Name.
Test: „zwei gleichnamige Vault-Dateien überschreiben sich nicht".

### F14 — Testsperre verdeckte die Integrationsgrenze → [ADRESSIERT]
Beide Hälften stimmen. Der Prozessstarter ist jetzt injizierbar
(`setComputerProcessStarterForTests`), und die Sperre greift nur noch unter `VITEST` **ohne
gesetzten Fake** — `NODE_ENV=test` ist raus, eine so gestartete gebaute App verliert die
Rechner-Steuerung nicht mehr. Erst dadurch prüfbar und jetzt geprüft: Binärpfad,
Argumentreihenfolge, `-a <Programmpfad>` statt Kennung, `-R`, `run <Name> --input-path`, und
die argv-Reihenfolge des Mail-Skripts mit feindlichem Betreff. Sechs neue Tests. Der alte
Wiederholungstest hing tatsächlich an der Sperre statt am Kurzbefehl — jetzt läuft er über
den Fake.

### F15 — Picker vertraute der Selbstauskunft → [ADRESSIERT]
Richtig, und die Folge war die eigentliche Lücke: gespeichert wurde nur `{id,label}`, und
`open -b` liess LaunchServices **irgendeine** App mit dieser Kennung auflösen. Jetzt wird der
gewählte Pfad kanonisiert (`realpath`), muss ein Verzeichnis auf `.app` sein, die
`Info.plist` muss eine reguläre Datei unter 2 MB sein (kein Symlink, keine Riesendatei), und
gespeichert wird `{id, label, path}`. Geöffnet wird mit **`open -a <Pfad>`** — gebunden an
das Objekt, das der Nutzer bestätigt hat. Einträge ohne bestätigten Pfad fallen beim Einlesen
fail-closed heraus und müssen neu ausgewählt werden.
**Nicht umgesetzt:** Prüfung der Code-Signatur. Der Pfad bindet die Wirkung an das gewählte
Objekt; eine Signaturprüfung wäre die nächste Stufe und eine eigene Entscheidung.

### F16 — Abbruch während der Zielauflösung → [ADRESSIERT]
Richtig. `assertActive(run)` läuft jetzt unmittelbar vor `execFile`, nicht erst im Callback
danach. Zwischen `requireVerb` und dem Start liegen mehrere Dateisystemschritte — genau dort
war das Fenster.

### F17 — Druckercheck-Ablehnung trug nicht → [ADRESSIERT]
Du hast recht, „verschiebt nur den Zeitpunkt der Enttäuschung" war bequem. Ob Papier
herauskommt, ist nicht vorhersagbar; ob ein Ziel eingerichtet ist, sehr wohl.
`hasDefaultPrinter()` fragt `lpstat -d`, und ohne Standardziel fällt „drucken" schon vor dem
Dialog weg. Antwortet `lpstat` nicht, wird NICHT ausgeschlossen — eine ungewisse Auskunft
darf keinen Vorgang wegnehmen.

### Belege
`npm run typecheck` und `npm run build` sauber. Gesamtsuite **2255 grün**; der eine
Fehlschlag (`shellExecution.test.ts > Umgebungsprobe`) ist die bekannte Lastflake, in
Isolation grün, nicht aus dieser Arbeit.

### Status Runde 2
✅ F10–F17 bestätigt und behoben. Offen bleibt bewusst: Code-Signaturprüfung beim Picker
(F15), Restrisiko beim direkten Öffnen (F12, jetzt ehrlich benannt statt wegbehauptet).
**Abnahme steht beim Nutzer aus.**
