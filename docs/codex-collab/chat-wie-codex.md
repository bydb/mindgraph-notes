# Optik: Petrol-Chat (und Auftrag) professionell — Maßstab Codex-App

## Aufgabe

Der Nutzer (04.11.2026, vor dem nächsten Release): „Schaue dir nochmals an, wie Codex seinen Chat
darstellt, vergleiche das mit Petrol Agent … es soll auch professionell aussehen.“ Dazu drei
Screenshots: der leere Codex-Chat (Desktop-App) und der Agent-Tab von MindGraph in beiden Modi
(Chat, Auftrag).

Codex soll **ausführlich und adversarial** vergleichen: Was macht die Codex-Oberfläche ruhig und
professionell, was macht den Petrol Agent dagegen unruhig oder „formularhaft“ — und wie sähe ein
Zielbild aus, das diese Qualität erreicht, ohne die Funktionen des Petrol Agent zu verlieren.
Konzept und Befunde, **noch kein Code**. Ziel ist eine Entscheidungsvorlage für den Nutzer.

Gemeint ist die **Formensprache** (Raumaufteilung, Hierarchie, Ruhe, Typografie, Eingabefeld,
Leerzustand, Verlauf), nicht das Kopieren von Marke, Logo oder Texten der Codex-App.

### Spannung, die ausdrücklich zu bewerten ist

Am 24.10.2026 wurde der Chat bewusst an die Auftragskarte angeglichen (`docs/codex-collab/chat-optik.md`,
F01–F15; Regel in `CLAUDE.md` Abschnitt Petrol-Chat: „der Chat IST eine `.agent-card` … Keine eigenen
Chat-Formen (Pillen, Blasen, nackte Textlinks) wieder einführen“). Die Codex-App macht fast das
Gegenteil: kein Kasten, zentrierter Leerzustand, schwebendes Eingabefeld unten. Codex soll sagen,
ob die Entscheidung vom 24.10. revidiert werden sollte, ganz oder teilweise, und warum — und ob dann
auch der Auftrag-Modus mitziehen muss, damit der Tab wieder „aus einem Guss“ ist.

## Kontext/Anker

- Zweck des Chats (Projektgedächtnis): „Schnell etwas fragen, gute Antwort bekommen“ — Maßstab ist
  ChatGPT/Codex in Tempo und Anmutung, nicht andere Notiz-Apps. Auftrag = Dateien aus Unterlagen erzeugen.
- Komponenten:
  - `app/src/renderer/components/Agent/AgentView.tsx` — Tab-Rahmen, Kopf mit Logo/Titel/Untertitel
    und Umschalter Chat|Auftrag (`agent-card-head` ab Zeile 599, Umschalter 613, Chat-Zweig 633–636,
    Auftragskarte ab 643).
  - `app/src/renderer/components/Agent/PetrolChat.tsx` (1148 Zeilen) — Verlauf `.petrol-chat-list`
    (665 ff., je Wechsel `.petrol-turn` mit Frage-Kopf 677, Antwort 782, Fußzeile 580/805), Eingabe
    `.petrol-chat-input` (881–960: Globus 911, Senden 950/954), Web-Zeilen und Hinweise
    (`.petrol-web-line`, `.petrol-chat-note`, 858–1058), Beispiele `agent-card-examples` (1063–1080),
    Modellzeile `agent-card-row` (1084–1107).
- CSS: `app/src/renderer/styles/index.css` — Auftrag `.agent-view` 21386, `.agent-card` 21415,
  `.agent-card-examples` 21513; Chat `.agent-mode-switch` 23123, `.petrol-chat-taskhint` 23195,
  `.petrol-chat-list` 23204, `.petrol-turn` 23210, `.petrol-chat-compose` 23297.
- Design-Grundsätze: `CLAUDE.md` (globale Tokens, color-mix, keine Inline-Styles, keine Emojis,
  SVG-Icons), Hell- und Dunkelmodus, schmale Breite im Split.
- Screenshots des Nutzers (2000 × ~1140, hell):
  - Codex-App, leerer Chat:
    `/private/tmp/claude-502/-Users-jochenleeder-dev-Veranstaltungsjournal/8341b33c-4954-495a-ada2-b1f4445d025b/scratchpad/codex-optik/Bildschirmfoto 2026-11-04 um 13.58.04.png`
  - Petrol Agent, Chat leer:
    `/private/tmp/claude-502/-Users-jochenleeder-dev-Veranstaltungsjournal/8341b33c-4954-495a-ada2-b1f4445d025b/scratchpad/codex-optik/Bildschirmfoto 2026-11-04 um 13.58.18.png`
  - Petrol Agent, Auftrag leer:
    `/private/tmp/claude-502/-Users-jochenleeder-dev-Veranstaltungsjournal/8341b33c-4954-495a-ada2-b1f4445d025b/scratchpad/codex-optik/Bildschirmfoto 2026-11-04 um 13.59.27.png`

## Erste Beobachtungen (Claude, aus den Screenshots)

Codex-App (leer):
- Eine Botschaft: zentriertes Symbol + eine Frage („Was wollen wir entwickeln?“), sonst Weißraum.
- Eingabe als **ein** schwebendes, abgerundetes Feld am unteren Rand, schmale Lesebreite (~840 px).
  Alle Bedienelemente liegen **im** Feld: links „+“ und Genehmigungsmodus, rechts Modell + Stufe als
  ruhiger Text mit Pfeil, Mikrofon, runder Senden-Knopf. Darüber eine flache Kontextleiste
  (Projekt, „Dieser Computer“).
- Keine Erklärtexte, keine Datenweg-Sätze, keine Beispielkacheln, keine Rahmen um Bereiche.
- Typografie: eine Größe für Inhalt, Grau für Nebensachen, keine Versal-Überschriften.

Petrol Agent, Chat (leer):
- Alles in **einer umrandeten Karte oben**; darunter bleibt die halbe Fläche leer, die Eingabe sitzt
  oben statt unten — wie ein Formular, nicht wie ein Gespräch.
- Viele gleich laute Ebenen: Kopf mit Logo, Titel, Untertitel mit Verweis auf „Auftrag“, Eingabe,
  Petrol-farbene Recherche-Zeile in voller Breite (ein langer technischer Satz), „ZUM AUSPROBIEREN“
  in Versalien, drei Kacheln, Modellzeile mit Label, Picker und zwei Marken.
- Petrol-Farbe wird für Fließtext (Untertitel, Recherche-Satz, Kachel-Pfeile) benutzt — Akzent
  verliert Bedeutung.

Petrol Agent, Auftrag (leer):
- Zweispaltige Formularkarte mit sechs beschrifteten Zeilen (Unterlagen, Ablage, Befugnisse,
  Modell, Bilder, Gedächtnis), orange Warnpunkte („Auftrag fehlt“, „Ablage“), Hinweise unterhalb.
  Funktional reich, aber dicht; mehrere Orange-/Petrol-Hinweise konkurrieren.

Diese Liste ist ein Startpunkt, nicht vollständig.

## Fragen an Codex

1. **Vergleich, pingelig**: Raumaufteilung (wo sitzt die Eingabe, wie breit ist die Lesespalte,
   wo ist Weißraum), visuelle Hierarchie (wie viele Ebenen konkurrieren), Typografie (Größen,
   Gewichte, Versalien, Farbe für Text), Rahmen/Flächen/Schatten/Radien, Akzentfarbe (wofür sie
   eingesetzt wird), Bedienelemente (wo, wie viele, Text vs. Icon), Erklärtexte und Statussätze,
   Leerzustand, Beispiele. Je Punkt: was Codex tut, was Petrol tut, Datei:Zeile.
2. **Verlauf und laufende Antwort**: Die Screenshots zeigen nur Leerzustände. Prüfe im Code, wie
   Frage, Antwort, Fußzeile mit Aktionen (Kopieren, Als Notiz, Daraus etwas erstellen, Recherche),
   Streaming/Warten, Fehler, Web-Quellen und Hinweiszeilen aussehen, und vergleiche mit dem, was eine
   Codex-/ChatGPT-artige Darstellung täte (Nutzerfrage als dezente Blase rechts, Antwort als
   Fließtext ohne Kasten, Aktionen erst bei Hover/leise, Werkzeugschritte eingeklappt).
3. **Was darf verschwinden, was muss bleiben, wohin wandert es?** Der Petrol Agent zeigt bewusst
   Datenwege (lokal/Cloud, „liest keine Notizen von selbst“, Recherche-Weg) — Transparenz ist ein
   Produktwert (Projektgedächtnis „Transparenz statt Sperre“). Schlag vor, wie diese Informationen
   erhalten bleiben, ohne die Oberfläche zu dominieren (z. B. im Eingabefeld als ruhiger Text am
   Modellnamen, als Tooltip/Popover, nur bei Abweichung vom Normalfall laut).
4. **Entscheidung vom 24.10. (chat-optik.md)**: revidieren ja/nein/teilweise? Mit Begründung.
   Wenn ja: Wie bleibt der Tab beim Umschalten Chat ↔ Auftrag ruhig (Kopf springt nicht, gleiche
   Breiten, gleiche Eingabe-Formensprache)? Muss der Auftrag mitziehen (z. B. gleiche schwebende
   Eingabe, Einstellungen eingeklappt statt sechs offene Zeilen)?
5. **Zielbild** in Worten plus ASCII-Skizze für: Chat leer, Chat mit Verlauf, Chat während
   Antwort, Auftrag leer. Mit konkreten Maßen/Tokens (Lesebreite, Abstände, Radien, Schriftgrößen),
   Hell/Dunkel und schmale Breite (Split, ~500 px).
6. **Reihenfolge und Risiko**: in welche Schritte man das schneidet (was zuerst den größten
   Gewinn bringt), was dabei kaputtgehen kann (Tastatur, Fokus, Drag-and-drop von Bildern auf das
   Eingabefeld, Web-Abfragezeile, Bestätigungsleisten, Barrierefreiheit), und was vor dem nächsten
   Release realistisch ist.

## Codex-Findings

### F01 — Der leere Chat gewichtet Einrichtung stärker als die Frage
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:598; app/src/renderer/components/Agent/PetrolChat.tsx:652; app/src/renderer/components/Agent/PetrolChat.tsx:1061; app/src/renderer/components/Agent/PetrolChat.tsx:1083; app/src/renderer/styles/index.css:21424; app/src/renderer/styles/index.css:23189; app/src/renderer/styles/index.css:23350
Status: [OFFEN]

Die drei verlinkten Bilder zeigen **nur Leerzustände**. Der Codex-Ausschnitt zeigt im Hauptbereich eine Frage in der Mitte und ein einziges Eingabefeld unten; die Seitenleiste gehört zur App-Navigation und ist kein Teil des Gesprächs. Im Petrol-Chat steht die gesamte Bedienung oben in einer etwa 1.090 px breiten Karte. Darunter ist fast nur Weißraum. Der Auftrag nutzt die Fläche oben ebenfalls, dort passt das eher zur Aufgabe, weil vor dem Start mehrere Entscheidungen nötig sind. Die Pixelangaben hier sind Näherungen aus den 2000-px-Bildern, keine Messung am DOM. Im Code erlaubt `.agent-view-inner` bis 1180 px und hebt ab 1000 px die 780-px-Grenze auf; die Chat-Karte wächst dann als Ganzes mit (`index.css:21391`, `index.css:21424`, `index.css:21427`, `index.css:23190`). Die eigentliche Antwort bleibt später auf 760 px begrenzt (`index.css:23210`), Eingabe und Beispielbereich aber nicht. Dadurch haben Frage und Antwort verschiedene Zeilenlängen.

Die Hierarchie lässt sich im Bild durchzählen: Petrol zeigt App-Tabelleiste, Agent-Kopf mit 44-px-Logo und 19-px-Titel, petrolfarbenen Untertitel, Modusschalter, Eingabe, petrolfarbene Recherchezeile, grauen Beispielabschnitt mit Versalüberschrift, drei umrandete Kacheln und eine beschriftete Modellzeile mit zwei Marken. Codex zeigt im Gesprächsbereich eine Einladung und das Eingabefeld; Kontext und Modell sind im oder direkt am Feld. Petrols Schrift mischt 19 px Titel, 15 px Eingabe, 13 px Kartengrundschrift, 12,5 px Beispielnamen, 11,5 px Metadaten und 10,5 px Versalüberschrift (`index.css:21400`, `index.css:21420`, `index.css:21511`, `index.css:21565`, `index.css:23309`). Die kleine Versalzeile „ZUM AUSPROBIEREN“ und die drei Kachelrahmen machen Vorschläge zu einem eigenen Bereich, obwohl sie nur Entwürfe einfüllen (`PetrolChat.tsx:409`, `PetrolChat.tsx:1063`). Im Codex-Bild gibt es keine Vorschlagskacheln; daraus folgt keine Regel, Beispiele ganz zu streichen.

Auch die Form trägt zur Unruhe bei: Petrol hat den 14-px-Außenrahmen, innere Trennlinien, 10-px-Beispielkacheln, 9-px-Iconknöpfe und mehrere getönte Marken (`index.css:21415`, `index.css:21513`, `index.css:21532`, `index.css:23315`, `index.css:23331`). Der Codex-Ausschnitt konzentriert Rahmen, Radius und leichten Schatten auf den Composer. Petrol benutzt Petrol bereits für den Untertitel, die lange Web-Zeile, Beispielpfeile, aktive Web-Taste und Wegmarke (`index.css:21486`, `index.css:21567`, `index.css:23338`, `index.css:23350`, `index.css:21733`); der Akzent bezeichnet damit zugleich Erklärung, Wahl und Status. Der Modusschalter ist dagegen angenehm leise und an derselben Position (`AgentView.tsx:613`, `index.css:23123`). Das Logo ist im Produktkopf legitim; die Codex-Marke und ihre Texte sind keine Vorlage zum Nachbauen.

**Nutzerbeispiel:** Ich öffne den Agent-Tab, um „Wie formuliere ich diese Mail höflicher?“ zu fragen. Mein Blick landet zuerst auf Rechercheweg, Vorschlagskacheln und Modellzeile, obwohl ich nur den Satz eintippen will.

Vorschlag: Den gemeinsamen Kopf behalten, darunter im leeren Chat einen ruhigen, zentrierten Einstieg und einen auf etwa 760–800 px begrenzten Composer am unteren Rand zeigen. Modell, Bild, Web und Senden gehören an den Composer; die Detailerklärung öffnet sich dort auf Wunsch. Beispiele höchstens als leise, einzeilige Vorschläge nahe der Eingabe, ohne getönte Sektion und ohne Versalüberschrift. Petrol für aktive Wahl, Links und echte Abweichungen verwenden; normalen Erklärungstext mit `--text-secondary` setzen. Keine Behauptung über Codex-Verlauf, Hover oder Dunkelmodus aus diesem einen Codex-Leerbild ableiten.

### F02 — Im Verlauf werden Antworten wie Formularvorgänge eingerahmt
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:579; app/src/renderer/components/Agent/PetrolChat.tsx:663; app/src/renderer/components/Agent/PetrolChat.tsx:675; app/src/renderer/components/Agent/PetrolChat.tsx:707; app/src/renderer/components/Agent/PetrolChat.tsx:742; app/src/renderer/components/Agent/PetrolChat.tsx:794; app/src/renderer/styles/index.css:23204; app/src/renderer/styles/index.css:23264
Status: [OFFEN]

Hier gibt es **keinen aktuellen Verlaufsscreenshot**; der folgende Befund beruht auf JSX und CSS, und die Codex-/ChatGPT-artige Seite ist ein Zielbild, keine beobachtete Eigenschaft des verlinkten Codex-Bilds. Petrol legt jeden Wechsel in eine weiße, 760 px breite Karte auf getöntem Verlaufshintergrund. Die Nutzerfrage ist deren petrolgetönter Kopf, die Markdown-Antwort ein 14-px-Abschnitt, und Modell plus Aktionen liegen ständig sichtbar in einer abgetrennten Fußzeile (`PetrolChat.tsx:675`, `PetrolChat.tsx:677`, `PetrolChat.tsx:782`, `index.css:23204`, `index.css:23217`, `index.css:23232`, `index.css:23264`). Bei fünf kurzen Fragen entstehen fünf Kartenrahmen und fünf Aktionsleisten. Das ist ordentlich, wirkt aber eher wie fünf abgeschlossene Aufträge als ein laufendes Gespräch. Eine kleine, rechts ausgerichtete Nutzerfrage und randloser Antworttext würden die Blickrichtung klarer machen. Markdown-Tabellen, Code und lange Zitate brauchen weiterhin eigene innere Flächen und horizontalen Überlauf (`index.css:23241`, `index.css:23246`).

Funktionen in der Fußzeile sind nicht gleichrangig: Kopieren und „Als Notiz speichern“ sind häufige Nebenaktionen; „Im Auftrag weitermachen“ und „Im Agenten neu recherchieren“ öffnen einen anderen Arbeitsablauf (`PetrolChat.tsx:587`, `PetrolChat.tsx:603`). „Hiermit weiterfragen“ bindet eingefrorene Webauszüge; das ist ein sichtbarer Gesprächszustand und darf nicht in einem beliebigen Mehr-Menü verschwinden (`PetrolChat.tsx:590`). Die Bestätigungsbereiche mit Wunschfeld, Faktenprüfungswahl und Ersetzen eines vorhandenen Entwurfs sind nötig und dürfen nur nach der jeweiligen Aktion erscheinen (`PetrolChat.tsx:609`, `PetrolChat.tsx:621`). Aktionen ausschließlich per Hover zu zeigen wäre für Tastatur, Touch und schmale Fenster falsch: mindestens ein fokussierbarer Aktionsknopf pro Antwort muss immer zugänglich bleiben; der Rest kann bei Hover **und** Fokus sichtbar oder in einem beschrifteten Menü liegen.

Warten und Streaming sitzen schon an der letzten Frage. Ohne Text erscheinen drei Punkte, während Websuche eine Phase wie Suche/Abruf plus mögliche Quellen zeigt (`PetrolChat.tsx:794`, `PetrolChat.tsx:805`, `PetrolChat.tsx:817`). Das ist echte Rückmeldung; ein einziger ruhiger Status direkt an der entstehenden Antwort genügt, mit Stopp am Composer (`PetrolChat.tsx:949`). Fehler haben im aktuellen Code einen Wiederholknopf, soweit eingefrorene Quellen noch verfügbar sind; die ältere Aussage in `chat-optik.md` F10, es gebe keinen Wiederholknopf, ist durch `PetrolChat.tsx:709–725` überholt. Webantworten zeigen Satzmarkierungen, Quellen-Faltung, Prüfbefunde und Herkunft (`PetrolChat.tsx:742–778`, `index.css:23407`). Diese Prüfzeichen gehören zum Antwortinhalt; nur Suchschritte, verworfene Treffer und technische Provenienz können standardmäßig eingeklappt werden. Bei einem schweren Befund muss die Warnung am betroffenen Satz sichtbar bleiben.

**Nutzerbeispiel:** Ich frage dreimal nach einem Textentwurf. Statt die letzte Antwort ruhig lesen zu können, sehe ich drei Kartenfüße mit „Kopieren“, „Als Notiz“ und Übergabeaktionen; bei einer Webantwort darf die rote Prüfwarnung aber gerade nicht hinter „Details“ verschwinden.

Vorschlag: Verlauf auf neutraler Fläche, Nutzerfragen als dezente Blasen rechts, Antworten als Fließtext auf derselben Lesebreite. Pro Antwort eine kleine Aktionszeile oder ein beschriftetes Menü mit Tastaturfokus; Bestätigungen als eingeblendeter Abschnitt **unter dieser Antwort**. Laufende Antwort mit Text oder einer Statuszeile „Sucht … / Schreibt …“, Stopp am Composer und einem `role="status"` mit gedrosselten Ansagen. Quellen und Satzprüfung beim Text lassen, technische Schritte per `details` falten. Fehler als Antwortzustand mit „Erneut senden“ und Grund darstellen; bei abgelaufenen Quellen den vorhandenen Hinweis und die gesperrte Wiederholung erhalten.

### F03 — Transparenz braucht einen festen Platz direkt an der Entscheidung
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:290; app/src/renderer/components/Agent/PetrolChat.tsx:321; app/src/renderer/components/Agent/PetrolChat.tsx:963; app/src/renderer/components/Agent/PetrolChat.tsx:1030; app/src/renderer/components/Agent/PetrolChat.tsx:1081; app/src/renderer/components/Agent/AgentView.tsx:925; app/src/renderer/components/Agent/AgentView.tsx:994
Status: [OFFEN]

Der lange petrolfarbene Satz im leeren Chat ist **nicht bloß Schmuck**: `webPathParts` nennt Suchanbieter, frühere Themen, Seitenabruf und Modellweg; bei gründlicher Suche stehen weitere Einwilligungs- und Suchinformationen dort (`PetrolChat.tsx:346–351`, `PetrolChat.tsx:963–993`). Der Modellweg wird vorab geprüft und bei laufender Antwort für die konkrete Anfrage eingefroren (`PetrolChat.tsx:290–329`). „Liest keine Notizen von selbst“ ist laut `CLAUDE.md` im Main erzwungen, also eine wichtige Zusage. Bildversand kann je nach Route Zustimmung brauchen oder blockiert sein; Hinweise und OCR-Weg stehen im Composer (`PetrolChat.tsx:845–879`). Nachfragen mit eingefrorenen Webauszügen haben einen eigenen Status und können ohne neue Suche laufen (`PetrolChat.tsx:1030–1045`). Wer all das einfach ausblendet, macht die Oberfläche ruhiger und die Entscheidung schlechter. Umgekehrt ist im Screenshot der Normalfall als technischer Fließtext lauter als das Eingabefeld.

Die Auftrag-Seite hat bereits eine brauchbare Trennung: kurze Wegmarken an der Modellwahl, Details zu Datenwegen in einem geschlossenen Aufklapper, Cloud-Zustimmung als eigener sichtbarer Block (`AgentView.tsx:931–956`, `AgentView.tsx:994–1024`). Diese Trennung sollte in beiden Modi gelten. **Vor dem Senden sichtbar** bleiben müssen gewähltes Modell/Empfänger, aktiver Globus mit Anbieter, Bildanhänge samt Ziel, unbestätigte Cloud-Weitergabe, fehlendes Modell, unbekannter Weg und jede Sperre. Ein bloßer Tooltip reicht dafür nicht. Die vollständige Kette „Suche hier, Seiten von diesem Rechner, Anfrage an Anbieter, Antwort über Modell“ kann über einen klar benannten Knopf „Datenweg“ im Composer als Popover geöffnet werden. Die Zusage „Keine Notizen automatisch“ kann dort und beim ersten Einstieg stehen; sie braucht nicht bei jeder Frage eine zweite Markenreihe (`PetrolChat.tsx:1099–1103`). Früheres Webthema und eingefrorene Quellen müssen als eigene, entfernbare Bindung sichtbar sein, weil sie den Inhalt der nächsten Antwort ändern (`PetrolChat.tsx:1033–1043`).

**Nutzerbeispiel:** Ich wähle statt Ollama ein Cloud-Modell und hänge ein Foto an. Vor „Senden“ muss ich „OpenRouter · Foto geht an OpenRouter“ sehen und gegebenenfalls ausdrücklich freigeben; die fünf technischen Schritte einer gewöhnlichen lokalen Websuche darf ich bei Bedarf unter „Datenweg“ nachlesen.

Vorschlag: Im Composer eine knappe, immer sichtbare Kontextzeile mit Modell/Route und aktiven Eingaben; neutraler Normalfall in `--text-secondary`, aktive Wahl in `--accent-color`, Außenweg oder ungeprüfter Weg mit Text und passendem Warnzustand. Ein zugänglicher „Datenweg“-Aufklapper zeigt die vollständige Kette und dieselben Bezeichnungen wie die Auftrag-Seite. Fehler, Zustimmung und abweichende Datenwege als verständliche Inline-Hinweise nahe „Senden“ lassen. Lange Web-Hinweise aus `PetrolChat.tsx:963–1058` nach Auslöser und Dringlichkeit staffeln; die Suchwort-Bearbeitung und ihre Warnungen dürfen beim Öffnen ihren Platz bekommen.

### F04 — Entscheidung vom 24.10. teilweise revidieren
Schwere: hoch
Stelle: docs/codex-collab/chat-optik.md:79; docs/codex-collab/chat-optik.md:125; docs/codex-collab/chat-optik.md:178; CLAUDE.md:391; app/src/renderer/components/Agent/AgentView.tsx:598; app/src/renderer/styles/index.css:23118
Status: [OFFEN]

**Ja, teilweise.** Die Entscheidung vom 24.10. löste ein echtes Problem: Der Kopf sprang, Modellwahl und Datenweg hatten zwei Stile, und Chat-Aktionen wirkten wie lose Textlinks. Der heutige Code teilt Kopf, Umschalter, `ModelPicker`, Fokusregeln und Wegbegriffe (`AgentView.tsx:598–636`, `PetrolChat.tsx:1083–1109`, `index.css:23123–23187`). Das sollte bleiben. Der Satz in `CLAUDE.md`, der Chat **sei** eine `.agent-card` und dürfe keine Blasen bekommen, ist als unumstößliche Gestaltungsregel inzwischen zu eng: Er machte die Auftragskarte zum Maßstab für ein Gespräch, dessen Hauptaufgabe „schnell etwas fragen“ ist. Die neuen Bilder zeigen den Preis im Leerzustand. Die damalige Prüfung `chat-optik.md` hatte zudem gerade für den neuen leeren Chat keinen brauchbaren Bildbeleg (`chat-optik.md:82`); die jetzigen Bilder schließen diese Lücke. „Aus einem Guss“ heißt gemeinsame Tokens, Kopfgeometrie, Zustandsfarben und Bedienlogik, nicht identische Außenrahmen.

Der Auftrag muss **in der Grundhierarchie mitziehen**, weil sonst beim Umschalten wieder ein ganz anderer Tab erscheint. Der Kopf bleibt außerhalb der Moduszweige optisch stabil; gleiche obere Polsterung, gleiche maximale Außenbreite und derselbe Modusschalter bleiben Pflicht (`AgentView.tsx:631–647`, `index.css:23156–23175`). Beide Modi bekommen eine verwandte Eingabeform und dieselbe horizontale Achse: 15-px-Text, gleiches Radius- und Fokusverhalten, dieselbe Lage der Modell-/Datenweg-Angabe. Im Chat sitzt sie unten, im leeren Auftrag näher an den notwendigen Bedingungen. Der Auftrag behält seine Vorbereitung: Unterlagen, Ablage, Befugnisse und Modell können nicht ersatzlos in ein Icon wandern. Im Leerzustand lassen sich diese Bedingungen jedoch als kompakte, aufklappbare „Auftrag einrichten“-Zone unter oder neben dem Composer zusammenfassen, wobei die nächste fehlende Pflichtangabe am Startknopf sichtbar bleibt. Der Auftrag braucht auch keinen künstlich zentrierten Gesprächsverlauf. Bei aktiver Ausführung bleibt `AgentRunPanel` ein eigenständiger Arbeitsbereich (`AgentView.tsx:1089`).

**Nutzerbeispiel:** Ich beginne im Chat mit „Vergleiche diese Angebote“ und wechsle zu Auftrag. Titel und Eingabeachse sollen an derselben Stelle bleiben. Dass ich nun „Ablage wählen“ und „Unterlagen hinzufügen“ sehe, ist sinnvoll; sechs offene, gleich laute Einstellungszeilen im ersten Blick sind es nicht.

Vorschlag: `CLAUDE.md` nach Nutzerentscheidung so ändern, dass die gemeinsame Formensprache als Regel bleibt, die erzwungene `.agent-card` für den Gesprächsverlauf aber entfällt. Die früheren F03/F08/F14 aus `chat-optik.md` als zeitgebundene Lösung dokumentieren, nicht stillschweigend als Fehler umdeuten. Für Chat und Auftrag ein gemeinsames Layoutsystem mit stabiler Kopfzeile und Composer-Basis festlegen; modusspezifisch bleiben Gesprächsverlauf versus Auftragsbedingungen und Laufpanel. Das ist eine **neue Entscheidung**, keine unbemerkte CSS-Korrektur.

### F05 — Zielbild für vier Zustände mit einem Maßraster
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:631; app/src/renderer/components/Agent/AgentView.tsx:647; app/src/renderer/components/Agent/PetrolChat.tsx:663; app/src/renderer/components/Agent/PetrolChat.tsx:834; app/src/renderer/styles/index.css:21391; app/src/renderer/styles/index.css:21800; app/src/renderer/styles/index.css:23174
Status: [OFFEN]

**Maße als Entwurfswerte, keine bereits vorhandenen Tokens:** Außenhülle für beide Modi `max-width:1120px`, Seitenabstand 24 px breit und 16 px bei Split; Kopf oben 24–32 px, 56 px Mindesthöhe, 16 px Abstand zum Inhalt. Gespräch und Composer `max-width:800px`, Antworttext darin `max-width:720px`; auf 500 px Panelbreite ergeben 16 px Seitenabstand etwa 468 px nutzbare Breite. Grundtext und Eingabe 15 px bei `line-height:1.55`, Antwort 15–16 px bei 1.6, Metadaten 12–12,5 px, Titel 19–20 px. Abstandsraster 8/12/16/24 px, Composer-Radius 16 px, Eingabehöhe 96–120 px leer und mindestens 76 px im Verlauf, Iconknöpfe mindestens 36 × 36 px mit 44 × 44 px anklickbarer Fläche. Eine einzige feine Composer-Kante `--border-color`, Fläche `--bg-primary`, Hintergrund `--bg-primary`, Hover `--bg-hover`, Fokus `--focus-ring`; Schatten nur leicht und aus Theme-Tokens. Text `--text-primary`/`--text-secondary`, Petrol `--accent-color` für aktiven Modus, Web an, Senden und Links; `--color-warning` und `--color-danger` ausschließlich bei benannten Abweichungen. Das knüpft an vorhandene Tokens an (`index.css:21415`, `index.css:23315`, `index.css:23331`), ohne eine zweite Farbfamilie zu erfinden.

**Chat leer** — die Botschaft ist mittig in der *freien Gesprächsfläche*, der Composer bleibt unten. Eine einzige kurze Beispielzeile kann über dem Composer stehen und nach dem ersten Senden verschwinden:

```text
┌ Petrol Agent                                      [Chat | Auftrag] ┐
│                                                                │
│                                                                │
│                  Was möchtest du Petrol fragen?                │
│                                                                │
│       Text umformulieren · Idee durchdenken · Etwas erklären   │
│      ┌────────────────── Composer ≤ 800 px ────────────────┐   │
│      │ Frag Petrol etwas …                                  │   │
│      │ [Bild] [Web]  Ollama · auf diesem Rechner       [↑]  │   │
│      └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

**Chat mit Verlauf** — nur die Gesprächsfläche scrollt, der Composer bleibt am unteren Rand. Die Nutzerfrage ist rechts, Petrol antwortet als lesbarer Text; Aktionen treten unter der Antwort leise hinzu. Quellenprüfung bleibt am Satz:

```text
┌ Petrol Agent                                      [Chat | Auftrag] ┐
│                                     ┌ Meine Frage ────────────┐ │
│                                     └─────────────────────────┘ │
│       Antwort als Fließtext, Absätze und Listen.               │
│       Quellenzahl [1] und Warnzeichen stehen am Satz.          │
│       [Kopieren] [Als Notiz] [Mehr: Auftrag/Recherche]          │
│       ▸ Quellen und Suchschritte                                 │
│                          ⋮ Gespräch scrollt ⋮                  │
│      ┌──────────────────────────────────────────────────────┐   │
│      │ Nachfrage …    [Bild] [Web]  Modell/Route       [↑]  │   │
│      └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

**Chat während Antwort** — die letzte Frage bleibt sichtbar; unter ihr erscheint die Antwort sofort oder ein ruhiger, benannter Schritt. „Stopp“ sitzt an der Stelle von „Senden“. Fortschritt und Fehler sind textlich verständlich, nicht allein durch Punkte oder Farbe:

```text
┌ Petrol Agent                                      [Chat | Auftrag] ┐
│                                     ┌ Letzte Frage ───────────┐ │
│                                     └─────────────────────────┘ │
│       Sucht mit Tavily … 2 Seiten gelesen  ▸ Schritte           │
│       Petrol schreibt die Antwort …                              │
│                                                                │
│      ┌──────────────────────────────────────────────────────┐   │
│      │ Nachfrage …             Ollama · lokal         [■]  │   │
│      └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

**Auftrag leer** — gleiche Kopf- und Eingabeachse. Der Auftrag braucht sichtbare Bedingungen, aber nur die nächste Pflichtaktion ist laut. Ausklappen zeigt alle heutigen Schalter, Datenwege und Hilfen. Ein bereits gewählter Ordner oder angehängte Datei erscheint unmittelbar als Zusammenfassung:

```text
┌ Petrol Agent                                      [Chat | Auftrag] ┐
│           Was soll Petrol für dich erstellen?                   │
│      ┌────────────────── Composer ≤ 800 px ────────────────┐   │
│      │ Was soll entstehen – aus welchen Unterlagen?        │   │
│      │ [Unterlagen +]   Zielordner: fehlt   [Wählen]         │   │
│      └──────────────────────────────────────────────────────┘   │
│      Auftrag einrichten ▾  Modell: Ollama · Web aus             │
│      Nächster Schritt: Ablage wählen                             │
│                                      [Auftrag eingeben]          │
│      Die Ergebnisse kommen erst nach deiner Übernahme.          │
└────────────────────────────────────────────────────────────────┘
```

Im Dunkelmodus dieselbe Abstufung über `--bg-primary`, `--bg-secondary`, `--border-color` und `--text-*`, keine festen hellgrauen Flächen; Kontrast von Platzhaltern, inaktiven Icons und petrolfarbenem Text eigens prüfen. Im Split um 500 px bleibt der Kopf zweizeilig mit Umschalter erreichbar, Composer und Antwort werden 100 % der nutzbaren Breite, Status/Modell dürfen in eine zweite Zeile umbrechen; der Startknopf bleibt sichtbar. Der heutige Split setzt die Kartenzeilen bereits untereinander (`index.css:21800–21815`), aber eine volle Modellzeile **unter** einem hohen Composer würde im Chat viel Höhe verbrauchen. Der Auftrag darf auf 500 px zu einer langen Einstellungsansicht werden, wenn der Nutzer sie öffnet; die Fußaktion muss dann erreichbar bleiben. **Nutzerbeispiel:** Im halben Fenster tippe ich eine längere Frage mit Bild; das Bild, der Zielweg und „Senden“ bleiben lesbar, ohne dass ein 360-px-Modellpicker die Eingabe zusammendrückt.

Vorschlag: Diese vier Zustände als zusammenhängende, responsiv prüfbare Entwurfsvorlage freigeben. Die Zahlen als Designvariablen in CSS führen, bestehende Produkt-Tokens für Farben und Fokus nutzen. Vor Umsetzung ein reales Bild je Zustand in hell, dunkel und bei etwa 500 px erzeugen; besonders die Höhe von Web-Hinweisen, Bestätigungen und Auftragsbedingungen gegen die Skizzen halten.

### F06 — Vor dem Release zuerst Lage und Hierarchie ändern, dann Verhalten anfassen
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:357; app/src/renderer/components/Agent/PetrolChat.tsx:834; app/src/renderer/components/Agent/PetrolChat.tsx:890; app/src/renderer/components/Agent/PetrolChat.tsx:904; app/src/renderer/components/Agent/PetrolChat.tsx:994; app/src/renderer/components/Agent/AgentView.tsx:679; app/src/renderer/components/Agent/AgentView.tsx:1082; app/src/renderer/styles/index.css:23174
Status: [OFFEN]

**Reihenfolge nach sichtbarem Gewinn:** (1) Für den leeren Chat zuerst Kopf, freien Mittelraum und Composer unten bauen; die getönte Beispielsektion und die separate Modellzeile aus dem Erstblick nehmen. Dabei Modell/Route, Web an, Bild und Senden direkt am Composer zeigen. Das beseitigt den stärksten Unterschied der Screenshots ohne Änderung am Anfrageweg. (2) Danach die bestehenden Gesprächskarten in eine ruhige Frage-/Antwortanordnung überführen und die Aktionen abstufen. Die Antwortlogik, Web-Belegprüfung, Bestätigungen und Fehlerwiederholung bleiben funktional bestehen. (3) Den leeren Auftrag auf denselben Kopf und die Eingabeachse setzen und die Bedingungen zu einer klar beschrifteten, zunächst kompakten Zone ordnen; Pflichtlücken und Cloud-Zustimmung bleiben im Blick. (4) Erst nach visueller und funktionaler Prüfung die ausführlichen Web-Datenwege in Popover/Aufklapper umziehen. Die vier Schritte lassen sich getrennt begutachten. Für den nächsten Release halte ich **Schritt 1 und eine kleine Angleichung des Auftragskopfs/der Eingabe** für realistisch; die komplette Neuordnung von Verlauf, Webzuständen und Auftragsbedingungen braucht einen eigenen Prüfdurchgang. Wenn es für diesen Durchgang keine Zeit gibt, lieber den leeren Chat spürbar beruhigen und den Rest ausdrücklich offen lassen.

Die Risiken sind konkret. Der Chat sendet mit Enter, Shift+Enter fügt einen Umbruch ein, und während IME-Eingabe darf Enter nicht senden (`PetrolChat.tsx:904–906`); der Auftrag startet dagegen mit ⌘/Strg+Enter (`AgentView.tsx:690–692`). Beides muss beim gemeinsamen Composer als **unterschiedliche Modusregel** bleiben. Der Texthöhen-Abgleich läuft per `scrollHeight` bis 220 px (`PetrolChat.tsx:357–364`); bei fester unterer Lage darf ein wachsender Textbereich weder den Verlauf verdecken noch die Stopp-Taste aus dem Fenster schieben. Bilddateien kommen durch Dateidialog, Einfügen und Drag-and-drop an `.petrol-chat-compose` (`PetrolChat.tsx:834–843`, `PetrolChat.tsx:882–903`); eine neue Hülle muss alle drei Wege und die sichtbare Drop-Markierung erhalten. Das Web-Suchfeld verwendet `autoFocus` (`PetrolChat.tsx:994–1004`): wenn es als Popover erscheint, braucht es geordneten Fokus, Escape-Schließen und Rückkehr zum auslösenden Knopf. Lange Web-Warnungen, fehlende Route und Bildfreigabe dürfen den Composer nach oben vergrößern, statt die Meldung abzuschneiden (`PetrolChat.tsx:963–1058`). Bestätigungsleisten für Chat→Auftrag können über mehrere Zeilen wachsen (`PetrolChat.tsx:609–648`); sie gehören in den scrollenden Antwortbereich, nicht hinter den festen Composer. Die im Auftrag schon vorhandenen Schalter können sofortige Befugnisse aktivieren (`AgentView.tsx:844–880`); beim Einklappen dürfen ihr Zustand und die unmittelbare Wirkung nicht unsichtbar werden.

Barrierefreiheit ist ein Abnahmekriterium, kein letzter Feinschliff: Der Modusschalter ist als Radiogruppe markiert (`AgentView.tsx:613–625`), neue Bedienelemente brauchen Namen, `aria-expanded`/`aria-pressed` und sichtbaren `:focus-visible`-Ring. Ein per Hover enthülltes Menü muss per Tab erreichbar sein. Web-Fortschritt soll als kurze Statusansage funktionieren, ohne jeden Stream-Text vorzulesen; Animation respektiert bereits `prefers-reduced-motion` (`index.css:23289–23294`). Fokus nach Moduswechsel und nach Beispielklick prüfen; der Beispielklick setzt heute den Cursor ans Textende (`PetrolChat.tsx:409–416`). Ebenso prüfen, dass „Neues Gespräch“ und „Stopp“ bei 500 px erreichbar sind (`PetrolChat.tsx:949–955`, `PetrolChat.tsx:1106`).

**Nutzerbeispiel:** Ich ziehe ein Foto auf den unteren Composer, schalte Web ein und tippe mit japanischer Eingabemethode. Das Foto muss angenommen oder mit Grund abgelehnt werden, die Web-/Bild-Unvereinbarkeit sichtbar sein und die Bestätigungstaste der Eingabemethode darf die Nachricht nicht vorzeitig senden.

Vorschlag: Nach jedem Schritt die vier Zustände aus F05 in hell, dunkel und Split ansehen und die konkreten Bedienpfade durchspielen: Tastatur/IME, Bild einfügen und hineinziehen, Web-Schnellsuche und gründliche Suche, Cloud-Zustimmung, eingefrorene Quellen-Nachfrage, Chat→Auftrag mit vorhandenem Entwurf, laufende Antwort/Stopp, Fehler/Wiederholen. Nach tatsächlichen Codeänderungen gemäß `AGENTS.md` aus `app/` `npm run typecheck` und `npm run test`, bei geänderten Prozessgrenzen zusätzlich `npm run build`; in diesem Prüfauftrag ist kein Code zu ändern.

### Runde 2 — Nachprüfung

- **F01 — [ERLEDIGT für Schritt 1].** `PetrolChat.tsx:655` entfernt die äußere `.agent-card`; `PetrolChat.tsx:838–857` setzt Einladung und die vom Nutzer gewünschten Beispiele in den freien Raum; `index.css:23192–23205` begrenzt Einstieg und Composer auf 800 px und lässt den Verlauf breit scrollen. `neu-chat-leer.png` zeigt die Eingabe unten statt in einer Karte oben, `neu-chat-leer-dunkel.png` dieselbe Hierarchie im Dunkelmodus. Die drei Beispiele sind jetzt bewusst leise Pillen, keine Kacheln mit Versalüberschrift. F02 zum Verlauf bleibt gemäß Nutzerentscheidung offen.
- **F03, Chat-Teil — [OFFEN].** Schritt 1 erfüllt den kurzen Weg vor dem Senden: `PetrolChat.tsx:978–994` zeigt Modell und geprüfte Route im Composer, `PetrolChat.tsx:1105–1117` die Zusage zu Notizen darunter; Web- und Bildhinweise bleiben in `PetrolChat.tsx:883–905` und `:1009–1102`. Die lange Datenkette hat weiterhin keinen angekündigten Aufklapper; bei aktivem Web steht sie als Fließzeile im Composer (`PetrolChat.tsx:1020–1038`). Die sechs Bilder zeigen keinen aktiven Web-, Bild- oder Cloud-Zustand; die Lesbarkeit dieser Hinweise ist damit visuell noch nicht nachgewiesen. Das ist der ausdrücklich verschobene Rest von F03, kein neuer Fehler allein durch die fehlenden Bilder.
- **F05, Chat leer — [ERLEDIGT für Schritt 1].** Breite, untere Eingabe, mittige Einladung und hell/dunkel sind in `index.css:23192–23216`, `:23319–23329` und den drei neuen Leerbildern erkennbar. Bei 520 px wickeln die Beispiele und Werkzeuge um, ohne dass Senden oder Route im Bild verschwinden. Chat mit Verlauf und Auftrag entsprechen noch nicht den F05-Skizzen; der Nutzer hat ihren Umbau verschoben. `neu-chat-verlauf.png` und `neu-chat-antwortet.png` belegen immerhin, dass Verlauf und Stopp mit der neuen Eingabe sichtbar bleiben. Der schmale Bildbeleg ist nur für **leer**; siehe F07/F08.
- **F06, Schritt 1 — [OFFEN].** Der Code erhält die Enter-/Umschalt+Enter-/IME-Regel (`PetrolChat.tsx:930–932`), Bilddialog/Einfügen/Drop (`:860–869`, `:908–929`), Stopp (`:995–1000`) und die Auftrags-Tastaturregel unverändert (`AgentView.tsx:690–692`). `neu-chat-antwortet.png` zeigt den Stoppknopf; `neu-auftrag.png` zeigt den gemeinsamen Kopf und die unveränderte Auftragskarte. Die Bilder belegen keine Bedienprobe mit Tastatur, Drop, Web, Cloud-Zustimmung oder Bestätigungsleiste. Zudem ist die niedrige **Verlaufs**ansicht durch F07 nicht abgesichert. Der für F06 verlangte Schritt-1-Nachweis ist daher noch nicht vollständig. Claudes gemeldeter Typecheck und Vitest-Lauf sind Code-Prüfungen, keine Belege für diese UI-Zustände.

### F07 — Im niedrigen Fenster kann der laufende Chat unten abgeschnitten werden
Schwere: hoch
Stelle: app/src/renderer/styles/index.css:23174; app/src/renderer/styles/index.css:23192; app/src/renderer/styles/index.css:23198; app/src/renderer/styles/index.css:23227; app/src/renderer/styles/index.css:23319; app/src/renderer/components/Agent/PetrolChat.tsx:871; app/src/renderer/components/Agent/PetrolChat.tsx:1009
Status: [OFFEN]

Der neue Schutz für niedrige Fenster greift nur bei `.petrol-chat.is-empty`: Dann darf `.agent-view` vertikal scrollen (`index.css:23198`). Sobald eine Frage gesendet ist, gilt wieder `overflow:hidden` (`index.css:23174`). Die Verlaufsliste darf zwar bis auf Höhe null schrumpfen (`index.css:23227`), der Composer ist aber `flex-shrink:0` (`index.css:23319–23324`). Ein Entwurf kann bis 220 px wachsen (`PetrolChat.tsx:359–365`); Bilder, Freigabehinweise und Web-Suchfeld kommen **zusätzlich** in denselben Composer (`PetrolChat.tsx:871–905`, `:1009–1075`). Wird dieser höher als die nach Kopf und Fuß verbleibende Fläche, gibt es im Verlaufsmodus keinen äußeren Scrollweg mehr. Dann können die untersten Werkzeuge, der Stoppknopf oder die Fußzeile aus dem sichtbaren Tab fallen. Das ist aus Flex- und Overflow-Regeln ableitbar; die gelieferten Bilder zeigen nur den niedrigen **Leerzustand** und einen normalen Verlauf, also keinen Gegenbeleg für diese Kombination.

**Nutzerbeispiel:** In einem 520 px hohen Split habe ich bereits eine Antwort, hänge ein Bild an, öffne die Web-Hinweise und schreibe eine längere Folgefrage. Statt zum Senden und zur Bildwarnung scrollen zu können, kann die fest gehaltene Eingabe über den unteren Rand reichen.

Vorschlag: Auch bei `.has-turns` einen erreichbaren Scrollweg für überhohe Composer-Zustände vorsehen, ohne den normalen Verlaufsscroll aufzugeben. Den Grenzfall mit niedrigem Fenster, 220-px-Entwurf, Bildvorschau, Cloud-Freigabe und geöffnetem Suchfeld tatsächlich im Renderer prüfen; bei laufender Antwort zusätzlich Stopp und Bestätigungen im Verlauf erreichen können.

### F08 — Die Modellauswahl kann im Split rechts abgeschnitten werden
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:977; app/src/renderer/components/Agent/PetrolChat.tsx:980; app/src/renderer/components/Shared/ModelPicker.tsx:95; app/src/renderer/styles/index.css:22482; app/src/renderer/styles/index.css:23174; app/src/renderer/styles/index.css:23198
Status: [OFFEN]

Der neue Modellpicker sitzt in der unteren Werkzeugzeile und hat im Feld höchstens 260 px (`PetrolChat.tsx:979–993`). Seine geöffnete Liste richtet sich jedoch nach dem **Fenster**, nicht nach der 520-px-Agent-Fläche: `width:max-content`, `max-width:min(560px, 92vw)`, `left:0` (`index.css:22482–22495`). Bei langen Modellnamen kann die Liste daher breiter als der Rest des Split-Panels sein. Die Chat-Ansicht schneidet Überlauf ab (`index.css:23174`); im leeren Zustand macht `overflow-y:auto` ebenfalls keinen Platz rechts. Im gelieferten schmalen Bild ist der Picker geschlossen, deshalb ist die offene Liste dort nicht geprüft. Der Picker selbst ist geteilt und diese Breitenregel kann älter sein; die neue Platzierung am unteren Composer macht die Prüfung vor dem Release nötig.

**Nutzerbeispiel:** Ich öffne im schmalen Agent-Tab die Modellwahl. Ein langer Cloud-Modellname oder der rechte Teil der Liste liegt außerhalb des Panels; ich kann nicht zuverlässig erkennen, was ich auswählen würde.

Vorschlag: Die Liste an der verfügbaren Panelbreite begrenzen oder bei Bedarf nach links/rechts versetzen; nicht nur das geschlossene Feld schrumpfen. Im 500–520-px-Split die Liste mit langen lokalen und Cloud-Modellnamen per Maus und Tastatur öffnen, lesen und schließen.

## Claude-Antwort

### Gegenprüfung Runde 1 (04.11.2026, noch kein Code)

- **F01 trägt.** Nachgemessen: `.agent-view-inner` 1180 px, Kinder 780 px, ab 1000 px Containerbreite
  `max-width: none` (`index.css:21391`, `:21424`, `:21427`); `.petrol-turn` dagegen 760 px (`:23210`).
  Leerzustand = eine Karte oben, Eingabe oben — bestätigt im Screenshot.
- **F02 trägt.** Jeder Wechsel ist eine `.petrol-turn`-Karte mit Fußzeile (`PetrolChat.tsx:580`, `:675`,
  `:805`); „Erneut senden“ existiert (`:715`), F10-Bemerkung aus chat-optik.md ist überholt — stimmt.
- **F03 trägt.** Wichtiger Gegenpol: Datenweg-Angaben sind Produktwert und teils Zusage aus dem Main.
  Ausblenden wäre falsch; der Vorschlag (knappe Zeile am Composer + „Datenweg“-Aufklapper wie im Auftrag
  `AgentView.tsx:994 ff.`) ist konsistent mit „Transparenz statt Sperre“.
- **F04 trägt, braucht Nutzerentscheidung.** Die Regel in `CLAUDE.md:391` („der Chat IST eine
  `.agent-card` … keine Blasen“) wird dadurch aufgehoben. Kopf, Umschalter, ModelPicker, Wegmarken
  bleiben geteilt.
- **F05 trägt als Entwurf.** Maße sind Vorschläge, keine vorhandenen Tokens. Vor Umsetzung echte Bilder
  (hell, dunkel, 500 px) erzeugen.
- **F06 trägt.** Risiken nachgeprüft: Chat sendet mit Enter (IME-sicher, `PetrolChat.tsx:905`), Auftrag mit
  ⌘/Strg+Enter (`AgentView.tsx:691`); Eingabe wächst bis 220 px (`PetrolChat.tsx:363`). Beides muss beim
  gemeinsamen Composer erhalten bleiben.

Alle Befunde bleiben [OFFEN], bis der Nutzer entschieden hat (Tor 1).

### Nutzerentscheidung (04.11.2026)
F04 freigegeben (Kartenregel teilweise aufheben), vor dem Release nur **Schritt 1** aus F06, Beispiele
im leeren Chat **beibehalten**. F02, Auftrag-Umbau (Rest von F04), F03-Aufklapper und F05 für Verlauf
und Auftrag bleiben für eine Runde nach dem Release [OFFEN].

### Umsetzung Schritt 1 (04.11.2026, uncommitted)
- **F01 [ADRESSIERT für den leeren Chat]:** `PetrolChat.tsx` rendert keine `.agent-card` mehr, sondern
  `.petrol-chat` (füllt die Höhe). Leer: `.petrol-chat-hero` mit „Was möchtest du wissen?“
  (`petrolChat.emptyTitle`, de/en), darunter die drei Beispiele als leise Pillenzeile
  (`.petrol-chat-example`, Icon + Titel, „Entwurf → klarer Text“ als `title`), dann die Eingabe unten.
  Getönte Beispielsektion mit Versalüberschrift und separate Modellzeile entfallen. Lesebreite 800 px
  (`.petrol-chat > *`), der Verlauf scrollt in voller Breite, die Wechsel-Karten bleiben bei 760 px.
- **Eingabe:** eine Fläche `.petrol-chat-compose` (Rahmen `--border-color`, Radius 16, `--shadow-md`,
  Fokus färbt den Rahmen petrol). Text oben (`.petrol-chat-input`), darunter `.petrol-chat-tools`:
  Bild, Globus, Themen-Knopf, Abstand, ModelPicker (260 px) mit Wegmarke (`nowrap`), Senden/Stopp.
  Bild- und Globus-Knöpfe ohne Rahmen, Hover `--bg-hover`, aktiv weiter petrol getönt.
- **F03 (Teil):** Modell und Weg stehen jetzt vor dem Senden direkt an der Eingabe. „Liest keine Notizen
  von selbst“ steht in der Fußzeile `.petrol-chat-foot` neben der Tastenhilfe; dort auch „Neues
  Gespräch“ (im Verlauf). Web-, Bild-, Zustimmungs- und Nachfrage-Hinweise unverändert in der Eingabe,
  die Web-Zeile ist jetzt `--text-secondary` statt petrol. Der Datenweg-Aufklapper fehlt noch (Schritt 4).
- **Kopf (Angleichung für beide Modi):** Untertitel `--text-secondary` statt petrol. Kopf und Umschalter
  unverändert gemeinsam; im Auftrag sonst keine Änderung.
- **F06-Risiken geprüft:** Enter/Umschalt+Enter/IME-Logik und ⌘+Enter im Auftrag unverändert; Drag-and-drop
  und Einfügen hängen weiter an `.petrol-chat-compose`/Textarea; Eingabe wächst bis 220 px (+2 px Puffer
  gegen eine Mini-Bildlaufleiste im einzeiligen Antwortfeld). Niedriges Fenster: Einstieg darf auf 0
  schrumpfen, im leeren Zustand scrollt `.agent-view` statt die Fußzeile abzuschneiden (gemessen bei
  520 × 639: Fußzeile endet bei y 591, Fläche bei 607).
- **Belege:** `npm run typecheck` grün; `npx vitest run` 3304 grün, 1 Zeitüberschreitung in
  `shellExecution.test.ts` unter Last (allein 15/15 grün, ohne Bezug zur Optik). Regel in `CLAUDE.md`
  (Petrol-Chat, Optik) neu gefasst.
- **Screenshots** (Dev-App, echter Renderer per CDP) im Ordner
  `/private/tmp/claude-502/-Users-jochenleeder-dev-Veranstaltungsjournal/8341b33c-4954-495a-ada2-b1f4445d025b/scratchpad/codex-optik/`:
  `neu-chat-leer.png`, `neu-chat-leer-dunkel.png`, `neu-chat-leer-schmal.png` (Agent-Fläche 520 px),
  `neu-chat-verlauf.png` (eine echte Antwort von qwen3.8:27b), `neu-chat-antwortet.png` (während der
  Antwort), `neu-auftrag.png` (Auftrag nach der Änderung).

### Runde 2: Nachprüfung (Bitte an Codex)
Prüfe Code und Screenshots gegen F01 und den Chat-Teil von F05/F06, nur für Schritt 1. Je betroffenem
Befund Status setzen ([ERLEDIGT für Schritt 1] / [OFFEN] mit Grund). Neue Befunde nur für echte
Abweichungen oder Regressionen (auch im Auftrag-Modus, im Verlauf und bei Web/Bild-Hinweisen).


### Runde 2 — Antworten (04.11.2026, innerhalb der Nutzerfreigabe für Schritt 1)
- **F07 [ADRESSIERT]:** `.agent-view.is-chat` scrollt jetzt senkrecht (`overflow-y: auto`, waagrecht
  `hidden`) in beiden Zuständen; die `:has(.is-empty)`-Sonderregel entfällt. Normal scrollt weiter nur der
  Verlauf (er hat `min-height: 0`), nur wenn die Eingabe höher wird als der Platz, scrollt die Fläche.
  Gemessen: Agent-Fläche 520 × 420 px, 14-zeiliger Entwurf → `scrollHeight` 610 / 420, Senden nach dem
  Scrollen bei y 460, Flächenende 512. Der Composer selbst scrollt bewusst nicht innen, sonst würde er die
  nach oben öffnende Modellliste abschneiden. Nicht nachgestellt: dieselbe Lage mit Verlauf plus
  Bildvorschau, Cloud-Freigabe und Suchfeld zugleich (dieselbe Regel greift, aber kein Bildbeleg).
- **F08 [ADRESSIERT]:** Die Liste richtet sich an der ganzen Modellgruppe aus (`.petrol-chat-model`
  `position: relative`, `.model-picker` darin `static`), rechtsbündig und höchstens
  `min(560px, 100cqw − 48px)` breit (`100cqw` = `.agent-view-inner`). Unter 640 px Containerbreite steht die
  Gruppe als erste Zeile (`order: -1; flex-basis: 100%`), die Liste öffnet linksbündig. Erster Versuch
  (nur rechtsbündig) ragte bei 520 px links hinaus (Liste x 223, Fläche ab 344) — verworfen. Gemessen nach
  der Korrektur, Liste offen: 520 px → 385..817 in 344..854; 700 px → 570..959 in 344..1034; 1100 px →
  849..1238 in 344..1434. Bild: `neu-chat-schmal-modellwahl.png`. Nur in `.petrol-chat-model` — der
  geteilte Picker im Auftrag ist unverändert.
- **F06 Belege, ehrlich:** Geprüft sind Code-Pfade (Enter/IME, ⌘+Enter, Drop/Einfügen unverändert
  angehängt), Leer/Verlauf/Antwort/Stopp/schmal/dunkel/Auftrag im Bild, Modellliste in drei Breiten.
  **Nicht im Renderer durchgespielt:** Bild per Drag-and-drop, Websuche an (Web-Zeile, Suchfeld),
  Cloud-Zustimmung für Bilder, Nachfrage mit eingefrorenen Quellen, Chat → Auftrag mit Bestätigungsleiste,
  IME-Eingabe. Das bleibt für die Abnahme durch den Nutzer bzw. eine Folgerunde.
- typecheck grün (`tsc` Exit 0); vitest 3304 grün, wieder nur `shellExecution.test.ts` „Umgebungsprobe“ mit
  5-s-Zeitüberschreitung unter Last, allein 15/15 grün.


### Nachtrag nach Nutzerabnahme (04.11.2026)
- **Schmal:** Nutzer: „zu viel Leerraum“, „Fußzeile bricht um“. Unter 640 px Containerbreite steht die
  Einladung unten im Einstiegsbereich direkt über den Beispielen (`align-items: flex-end`), die Fußzeile
  zeigt nur „Liest keine Notizen von selbst“ (Tastenhilfe als `title`, `.petrol-chat-foot-keys`). Abgenommen.
- **Statuszeile (Teil von F02/F05 „Chat während Antwort“, auf Nutzerwunsch vorgezogen, Vorbild Codex
  „recherchiert …“):** `LiveStatus` oben in der entstehenden Antwort statt der Phase klein in der Fußzeile
  bzw. drei Punkten — Schritt als Text (`role="status"`, `aria-live="polite"`), pulsierender Punkt
  (ruhig bei `prefers-reduced-motion`), mitlaufende Sekunden (`aria-hidden`). Nach der Antwort Dauer in der
  Fußzeile neben dem Modell (`formatDuration`: Antwort-`at` minus Frage-`at`, leer bei fehlenden oder
  unplausiblen Zeitstempeln > 1 h). Keine Store-Änderung. Vom Nutzer in der Dev-App abgenommen („passt jetzt“).
- typecheck grün. Kartenform des Verlaufs, Blasen und Recherche-Zeile im Composer (F03-Rest) bleiben offen.

## Status

Runde 1: 6 Findings, alle tragen. Nutzer: F04 ja, nur Schritt 1 vor dem Release, Beispiele bleiben. Schritt 1 umgesetzt (uncommitted). Runde 2: F01/F05-leer erledigt, F07/F08 neu und adressiert, F03-Rest/F06-Bedienproben offen. Schritt 1 + schmal + Statuszeile vom Nutzer abgenommen (04.11.2026). Offen nach dem Release: F02, F03-Rest, Auftrag-Teil von F04/F05.
