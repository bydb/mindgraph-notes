# Rechner-Steuerung des Notiz-Agenten

Stand: 20.09.2026 · Stufe 1 umgesetzt

## Ziel

Der Agent soll einen Auftrag nicht mehr nur bis zur Datei erledigen, sondern bis zum
Ergebnis. Messlatte ist die Alltagsarbeit im Medienzentrum: Teilnehmerliste erzeugen **und
als Mail-Entwurf an die Schule fertig machen**, eine Datei ablegen **und im Finder zeigen**,
eine Liste **drucken**. Heute endet jeder Lauf mit einer Ergebniskarte, und die restlichen
fünf Handgriffe macht der Mensch.

## Der Weg: Skriptschnittstellen, nicht GUI-Steuerung

Es gab drei Möglichkeiten. Gewählt ist die erste.

1. **Programme über ihre Skriptschnittstellen ansprechen** (AppleScript, Kurzbefehle,
   Systembefehle). Deterministisch, protokollierbar, pro Programm freizugeben.
2. **Echte GUI-Steuerung** (Bildschirmfoto → Vision-Modell → Maus und Tastatur). Erreicht
   auch Programme ohne Schnittstelle, braucht aber Bedienungshilfen-Freigabe, ein
   Vision-Modell und ist langsam und fehleranfällig. Nicht ausgeschlossen, aber nicht jetzt.
3. **Die bestehende Agent-Shell entfesseln.** Kleinster Aufwand, größter Bruch: die Zusage
   „schreibt nur im Arbeitsordner" ist der Kern der Shell und wäre weg.

## Die tragende Entscheidung: das Modell schreibt kein Skript

Ein Werkzeug `run_applescript(script)` wäre Vollzugriff auf den Rechner gewesen — in jedem
AppleScript steht `do shell script` zur Verfügung, und keine Prüfung des Skripttextes hält
das auf. Eine Sperrliste gefährlicher Befehle ist kein Schutz; das ist bei der Agent-Shell
schon einmal durchdacht worden und gilt hier genauso.

Stattdessen: **Das Modell wählt einen von fünf benannten Vorgängen und liefert Werte. Den
Aufruf baut die App.** Vier der fünf sind gar kein AppleScript, sondern Systembefehle mit
Argumentliste (`open`, `open -R`, `lp`, `shortcuts run`). Der fünfte — der Mail-Entwurf —
ist ein **festes** Skript, das beim Freigeben einmal geschrieben wird; alle Werte kommen als
`argv` und werden nie in den Skripttext eingesetzt.

Empirisch gegengeprüft: ein Betreff `Betreff mit "Anführung" & -a Terminal` samt
Zeilenumbruch kommt bei `osascript skript.applescript <arg>` als **genau ein** Argument an,
uninterpretiert. Es gibt keine Stelle, an der ein Anführungszeichen die Bedeutung ändert.

Das Skript liegt im Staging des Laufs, aber **außerhalb** des Shell-Arbeitsordners — eine
gleichzeitig freigegebene Shell kann es nicht überschreiben. Derselbe Gedanke wie beim
Sandbox-Profil: was den Aufruf bestimmt, darf der Lauf nicht ändern.

## Die vier Vorgänge

| Vorgang | Werkzeug | Aufruf | Standard |
|---|---|---|---|
| Datei öffnen | `computer_open` | `open [-a <Bundle-Pfad>] <Datei>` | an |
| Im Finder zeigen | `computer_reveal` | `open -R <Datei>` | an |
| Mail-Entwurf | `computer_mail_draft` | festes AppleScript, Werte als argv | an |
| Drucken | `computer_print` | `lp <Datei>` | **aus** |

Drucken ist voreingestellt aus, weil es als einziges ohne weiteren Blick des Nutzers Papier
verbraucht und sich nicht zurücknehmen lässt. Alle anderen öffnen ein sichtbares Fenster.

**Alle vier wirken nur nach draußen.** Keiner holt Daten herein, keiner gibt welche ins Netz.

### Der Kurzbefehl ist wieder raus (21.09.2026)

Es gab einen fünften Vorgang: einen vom Nutzer freigegebenen macOS-Kurzbefehl starten,
optional mit einer Datei als Eingabe, dessen Ausgabe über `--output-path` zurück an das
Modell ging. Er war als Erweiterungspunkt gedacht für alles, was diese Liste nicht abdeckt.

Entfernt auf Entscheidung des Nutzers, und die Begründung ist die bessere:

- Er war der **einzige Rückkanal** — der einzige Vorgang, über den Daten hereinkamen.
- Er war die **einzige Stelle, an der die Zusage „nichts verlässt den Rechner" aushebelbar
  war**: Ein Kurzbefehl darf ins Netz, und was er tut, steht nirgends in der App.
- Der Nutzen rechtfertigte das nur für jemanden, der genau weiß, was in seinen Kurzbefehlen
  steht — also für genau eine Person. Für alle anderen wäre es ein Risiko ohne erkennbaren
  Gegenwert gewesen.

Mit ihm sind auch seine Eigenheiten weg, die viel Arbeit gekostet hatten: der Rückkanal über
`--output-path` (die Standardausgabe bleibt leer, ein Lauf sah erfolgreich aus und das Modell
hatte keine Daten), die Ermahnung „erfinde keine Werte", wenn nichts zurückkam, und die
Auswahlliste aus `shortcuts list`.

Wer den Erweiterungspunkt zurückhaben will, findet den Code in der Historie — aber bitte mit
dieser Begründung im Kopf.

## Was fest ist und nicht eingestellt werden kann

- **Mail wird nie gesendet.** Es gibt nur den Entwurf, der sichtbar aufgeht. Ein Vorgang
  „senden" existiert nicht und kommt nicht dazu. `send` steht nicht im Skript.
- **Kein Vorgang „führe dieses Skript aus".**
- **Übergeben werden nur** Ergebnisse des laufenden Auftrags (über den Dateinamen, den das
  Schreib-Werkzeug gemeldet hat) und Dateien im Vault. Absolute Pfade sind nie gültig, die
  internen `.mindgraph`-Daten (E-Mails, Kontakte, Sync) nie erreichbar.
- **Höchstens zehn Vorgänge pro Lauf**, abgelehnte Versuche zählen mit — sonst probiert sich
  ein Modell mit Fehlversuchen an der Grenze vorbei.
- **Nicht mit der Webrecherche kombinierbar.** Bei der Shell ist das eine Ordnungsfrage, hier
  ein konkretes Loch: eine präparierte Webseite, die ein Mail-Ziel vorgibt, hätte sonst
  einen Weg nach draußen.
- **Nur macOS.** Auf anderen Systemen startet die Steuerung nicht, statt auf einen
  ungeschützten Ersatzweg zu fallen.

## Freigabe in zwei Stufen, wie bei der Shell

1. **Modul** „Rechner-Steuerung" (Einstellungen → Module), Standard aus. Der `note-agent-run`-
   Handler liest das Flag **selbst** aus `ui-settings.json`, nicht aus den Renderer-Params.
2. **Schalter pro Lauf** plus nativer `dialog.showMessageBox` im Main, der die freigegebenen
   Vorgänge aufzählt. Ohne beides bleibt `run.computer` leer, und jedes Werkzeug lehnt ab.

Die Freigabeliste selbst (Vorgänge und Programme) liest der Main ebenfalls aus
seiner eigenen Kopie der Einstellungen. Das Modell kann sie weder sehen noch erweitern.

**Modellregel**: dieselbe wie bei der Shell (`shellLockReason`), aus demselben Grund — hier
wirkt eine Modellausgabe außerhalb der App, bevor ein Mensch sie gesehen hat. Rot im
Notiz-Agenten oder rot in einem schadensrelevanten Modul heißt: keine Rechner-Steuerung.
`untested` bleibt erlaubt, der Nutzer entscheidet im Dialog.

## macOS-Rechte

- `com.apple.security.automation.apple-events` **musste ins Entitlement**. Unter Hardened
  Runtime verweigert macOS Apple-Events an andere Programme sonst — im signierten Build
  stumm, im unsignierten Entwicklungsbuild fällt es nicht auf. Das betrifft auch die schon
  vorhandene Erinnerungen-Anbindung.
- `NSAppleEventsUsageDescription` nennt jetzt, was wirklich passieren kann.
- Beim ersten Ansprechen eines Programms fragt macOS zusätzlich selbst („MindGraph Notes
  möchte Mail steuern"). Diese Einwilligung ist nicht ersetzbar und soll es nicht sein.

## Dateien

- `shared/computerControl.ts` — Vorgänge, Einstellungen, Namens- und Adressprüfung, eine
  Beschreibungszeile für Einstellungen, Dialog und Laufprotokoll (pur, getestet).
- `main/noteAgent/computerControl.ts` — Freigabe, Zielauflösung, Ausführung, Budget.
- `main/noteAgent/computerTools.ts` — die fünf Werkzeugdefinitionen.
- `renderer/components/Settings/ComputerControlSection.tsx` — Freigabeliste.
- `renderer/components/Agent/ComputerAccessToggle.tsx` — Schalter pro Lauf.

## Programme werden ausgewählt, nicht getippt

`open -a` kennt **keine lokalisierten Namen**. Im Programme-Ordner steht „Vorschau",
aufrufbar ist die App nur als „Preview"; `osascript -e 'id of app "Vorschau"'` scheitert
ebenso, und Spotlight liefert den Anzeigenamen auch nicht. Es gibt keinen unterstützten Weg
vom Anzeigenamen zur App.

Ein Textfeld wäre deshalb eine Falle gewesen, die erst mitten im Agent-Lauf zuschnappt —
genau so ist sie in der Gegenprobe am 20.09.2026 zugeschnappt. Der Nutzer wählt das Programm
jetzt über den Systemdialog; gespeichert wird `{ id, label, path }`.

Aufgerufen wird mit **`open -a <Bundle-Pfad>`**, nicht mit der Bundle-Kennung: Die Kennung
stammt aus der `Info.plist` des Bundles, also aus einer Selbstauskunft, die ein präpariertes
`.app`-Verzeichnis beliebig setzen kann — `open -b` liesse LaunchServices dann irgendeine App
damit auflösen. Der Pfad ist das, was der Nutzer im Dialog bestätigt hat. Einträge ohne
bestätigten Pfad fallen beim Einlesen fail-closed heraus.

## Nur macOS — und das merkt man jetzt rechtzeitig

Die Funktion hängt an den Skriptschnittstellen von macOS; auf Windows und Linux startet sie
nicht (`computerControlAvailability`). Das Modul liess sich dort trotzdem einschalten, der
Schalter erschien am Auftragsfeld, und **der Lauf brach dann komplett ab, bevor er begann** —
der Auftrag war weg, die Meldung lautete „gibt es derzeit nur auf macOS".

Behoben über `macOnly` am Modul-Eintrag: `MODULES` filtert solche Module auf fremden
Plattformen heraus, und `useIsModuleEnabled`/`isModuleEnabled` liefern für sie immer `false`
— auch dann, wenn ein übernommener oder synchronisierter Schalter sie auf `true` stehen hat.
Dasselbe gilt jetzt für die Agent-Shell, die dieselbe Lücke hatte.

Eine Portierung wäre ungleich verteilt: Drucken (CUPS) und Mail-Entwurf (Thunderbird
`-compose … attachment=`) liefen unter Linux fast unverändert; unter Windows gibt es kein
`lp`, und ein Entwurf mit Anhang ginge nur über Outlook, weil `mailto:` keine Anhänge kann.
Zu ändern wären ausserdem `isValidAppPath` (heute `/`-Anfang und `.app`-Endung), die
Formatlisten (`.pages`/`.numbers`/`.key` sind dort sinnlos, `.odt` fehlt — mit derselben
Makro-Frage wie bei `.doc`) und die Bundle-Kennung, die es nur auf Apple gibt.

## Gegenprobe am echten Rechner (20.09.2026)

Belegt: im Finder zeigen · öffnen mit freigegebenem Programm · HTML-Ablehnung · Ablehnung
eines nicht freigegebenen Programms · Mail-Entwurf mit sichtbarem Anhang · Annahme des
Druckauftrags durch CUPS · Ablehnung der Wiederholung. Der damals ebenfalls geprüfte
Kurzbefehl-Vorgang gibt es nicht mehr.
Oberfläche im echten Renderer geprüft. Einzelheiten und die zwei Befunde (F08 lokalisierte
Programmnamen, F09 eigener Prüffehler bei Mail) in
`docs/codex-collab/rechner-steuerung-review.md`.

**Nicht mit der Gegenprobe belegbar:** dass die **verpackte, signierte App** Apple-Events
senden darf. Der Treiber lief unter dem Terminal, dessen Einwilligung macOS getrennt
verwaltet. Das Entitlement ist gesetzt, der Beweis steht aber erst mit einem signierten Build.

## Offen / nächste Schritte

- **Signierter Build**: Apple-Events aus der verpackten App (siehe oben).
- **Echter Agent-Lauf mit Modell** statt Aufruf der Funktionen — prüft, ob ein lokales Modell
  die Vorgänge überhaupt sinnvoll wählt. Steht weiterhin aus.

- **Papierauswurf**: Der Druckauftrag wurde von CUPS angenommen, der Drucker war offline.
- **Anhänge und die Sieben-Tage-Regel**: ein Anhang ist eine Kopie im Staging des Laufs, das
  nach sieben Tagen abgeräumt wird. Für einen Entwurf, der am selben Tag rausgeht, trägt
  das; ein liegengebliebener Entwurf verliert den Anhang. Beobachten, ob das real stört.
- **Arbeitsbilanz**: Rechner-Läufe sind bisher keine eigene Tätigkeitsart. Erst messen, ob
  sie eine eigene Referenzzeit verdienen — nicht raten.
- **Stufe 2 (GUI-Steuerung)** bleibt unangefasst, bis Stufe 1 im Alltag trägt.
