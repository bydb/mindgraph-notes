# Optik: Chat und Auftrag im Agent-Tab aus einem Guss

## Aufgabe

Der Nutzer (24.10.2026): „Mir gefällt die grafische Ausarbeitung des Chats nicht, er unterscheidet
sich grafisch vom Petrol Agent.“ Codex soll **pingelig** prüfen, wo sich die Chat-Ansicht
(`PetrolChat.tsx`) optisch und im Aufbau von der Auftrags-Ansicht (`AgentView.tsx` +
`AgentRunPanel.tsx`) unterscheidet, und je Abweichung sagen, welche Seite sich wem angleichen soll.
Leitbild ist die Auftrags-Ansicht (sie ist älter, durchgestaltet und im Produkt etabliert) — wo der
Chat aus gutem Grund abweicht (Gesprächsverlauf, Eingabe unten), soll das benannt, aber trotzdem
in derselben Formensprache gelöst werden. Konzept und Befunde, noch kein Code.

## Kontext/Anker

- Komponenten: `app/src/renderer/components/Agent/AgentView.tsx` (Kopf, Umschalter, Auftragskarte),
  `app/src/renderer/components/Agent/PetrolChat.tsx` (Chat), `AgentRunPanel.tsx` (Laufanzeige).
- CSS: `app/src/renderer/styles/index.css` — Auftrag ab `.agent-view` (~Zeile 21401 ff.),
  Chat-Stile am Ende ab `.agent-mode-switch` (~23119 ff.: `.petrol-chat*`, `.petrol-msg*`).
- Design-Grundsätze: `CLAUDE.md` (globale Tokens, color-mix, keine Inline-Styles, keine Emojis),
  Memory „Modul-Panel-Design einheitlich“ (geteilter Kopf, Karteikarten-Look), Einstellungs-
  Bausteine `Settings/SettingsUI.*` als Beispiel für EINE Quelle von Optik.
- Screenshots aus der Dev-App (1400 × 900, Testvault, hell):
  - `/private/tmp/claude-502/-Users-jochenleeder-dev-mindgraph-notes/8532b17a-2a53-4a2a-8987-360951af082b/scratchpad/optik/auftrag-leer.png`
  - `/private/tmp/claude-502/-Users-jochenleeder-dev-mindgraph-notes/8532b17a-2a53-4a2a-8987-360951af082b/scratchpad/optik/chat-leer.png`
  - `/private/tmp/claude-502/-Users-jochenleeder-dev-mindgraph-notes/8532b17a-2a53-4a2a-8987-360951af082b/scratchpad/optik/chat-mit-verlauf.png`

## Erste Beobachtungen (Claude, gemessen per CDP)

- Kopf springt beim Umschalten: Titel Auftrag x 553 / y 156, Chat x 558 / y 116; Umschalter
  Auftrag x 1149 / y 163 / 128 px breit, Chat x 1155 / y 132 / 127 px. Der Umschalter wandert also
  um 6 px seitlich und 31 px vertikal — sichtbar beim Klicken.
- Titel heißt im Auftrag „Petrol Agent“, im Chat „Petrol“; Untertitel im Chat bricht zweizeilig.
- Auftrag = eine umrandete Karte (Eingabe, Beispiele, Unterlagen, Ablage in Sektionen mit
  grauer Fläche und Kleinbuchstaben-Überschrift „ZUM AUSPROBIEREN“). Chat = randlos, Leerzustand
  zentriert mit Pillen-Chips, Eingabe als eigenes Pillenfeld unten, Statuszeile darunter mit
  Modellwahl im anderen Stil als im Auftrag.
- Beispiele: Auftrag hat Kacheln mit Icon, Titel und „Quelle → Ergebnis“; Chat hat drei Text-Pillen.
- Antwort: Fließtext ohne Fläche, Werkzeugzeile als nackte Textlinks; Nutzerfrage als Blase in
  Petrol-Tönung. Im Auftrag sind Ergebnisse Karten.

Diese Liste ist ein Startpunkt, nicht vollständig.

## Fragen an Codex

1. Vollständige Abweichungsliste: Kopf (Position, Abstände, Titel, Untertitel, Umschalter),
   Containerbreite und Ränder, Karten/Flächen, Typografie (Größen, Gewichte, Farben, Zeilenhöhen),
   Radien, Rahmen, Schatten, Abstände-Raster, Buttons (primär/sekundär/Textlinks), Eingabefeld,
   Senden-Knopf, Modellwahl und Statuszeile, Chips vs. Beispielkacheln, Leerzustand, Antwortblöcke,
   Werkzeugleiste unter Antworten, Bestätigungsleiste (Ersetzen/Anhängen), Streaming-/Ladezustand,
   Fehleranzeige, Fokus-/Hover-Zustände, Dunkelmodus, schmale Breite (Split-Ansicht).
2. Je Abweichung: Datei:Zeile beider Seiten, ob gewollt (Funktion) oder zufällig, und welche
   gemeinsame Lösung (Token, geteilte Klasse, geteilte Komponente).
3. Welche Bausteine sollten geteilt werden, statt doppelt zu existieren (z. B. Kopf mit Umschalter
   als eine Komponente, Modellwahl, Karten-/Sektionsstil, Chip/Kachel)?
4. Gibt es im Chat hartkodierte Farben, Größen oder Werte, wo der Auftrag Tokens nutzt?
5. Vorschlag für ein Zielbild in Worten (ggf. ASCII-Skizze): Wie sieht der Chat aus, wenn er
   „aus einem Guss“ mit dem Auftrag ist, ohne seine Gesprächsform zu verlieren?

## Codex-Findings

### F01 — Gemeinsamer Kopf springt trotzdem
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:579; app/src/renderer/components/Agent/AgentView.tsx:607; app/src/renderer/components/Agent/AgentView.tsx:619; app/src/renderer/styles/index.css:21406; app/src/renderer/styles/index.css:21790; app/src/renderer/styles/index.css:23148
Status: [ERLEDIGT] — Chat und Auftrag haben jetzt dieselbe obere Polsterung; die Leerlauf-Absenkung ist entfernt. Der Kopf sitzt in den neuen Verlaufs- und schmalen Screenshots an derselben Stelle (`AgentView.tsx:612–626`, `index.css:21787–21790`, `index.css:23148–23155`).

**Zufällig.** Der Kopf ist in React bereits **ein** `head`, wird aber in zwei verschieden gepolsterte Container gesetzt: Auftrag `32px 24px 48px` plus Leerlauf-Absenkung bis 56 px, Chat `24px 24px 14px` ohne Absenkung. Die Screenshots zeigen deshalb Titel und Umschalter beim Wechsel rund 30–40 px höher; auch die kleine seitliche Verschiebung fällt auf.

Vorschlag: Den Kopf außerhalb der Modus-Verzweigung in eine gemeinsame Hülle mit identischem oberen Abstand und identischer Breite setzen. Nur den **Inhalt darunter** umschalten. Die Leerlauf-Absenkung nicht am Kopf, sondern gegebenenfalls am Auftragskarten-Inhalt lösen. Eine weitere Header-Komponente ist dafür nicht nötig.

### F02 — Titel, Untertitel und Umschalter ändern die Kopf-Geometrie
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:586; app/src/renderer/components/Agent/AgentView.tsx:590; app/src/renderer/styles/index.css:21466; app/src/renderer/styles/index.css:21479; app/src/renderer/styles/index.css:23119; app/src/renderer/utils/i18n/petrolChat.ts:11; app/src/renderer/utils/i18n/agentCard.ts:8
Status: [OFFEN] — Titel und Umschalter sind stabil, aber der Chat-Untertitel bleibt lang und modusspezifisch (`AgentView.tsx:589–592`, `petrolChat.ts:11`). Die globale Ellipse schneidet ihn im schmalen Screenshot mitten im Satz ab; dasselbe passiert im Auftrag mit dessen Untertitel (`index.css:23151–23152`). Eine kurze, vollständig lesbare Kopfzeile aus dem Vorschlag fehlt.

**Teils gewollt, Form zufällig.** Auftrag heißt „Petrol Agent“ mit einzeiligem Petrol-Untertitel; Chat heißt nur „Petrol“ und hat einen viel längeren, im Screenshot zweizeiligen Untertitel. Der Umschalter hängt mit `margin-left:auto` an derselben Flex-Zeile und wandert durch Höhe und Breite des Textblocks. Der geteilte Kopf kaschiert diese Verschiebung nicht.

Vorschlag: „Petrol Agent“ als stabilen Seitentitel behalten; den Modus im Umschalter und einen kurzen, gleich langen Untertitel erklären. Für den Kopf feste Spalten Logo/Text/Umschalter und eine definierte Untertitelhöhe oder einen eigenen Hinweis **unter** dem Kopf nutzen. So bleibt der Umschalter an derselben Stelle, ohne den Chat-Zweck zu verstecken.

### F03 — Chat hat keine Auftragskarte als tragende Fläche
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:623; app/src/renderer/components/Agent/AgentView.tsx:626; app/src/renderer/components/Agent/PetrolChat.tsx:276; app/src/renderer/components/Agent/PetrolChat.tsx:344; app/src/renderer/styles/index.css:21430; app/src/renderer/styles/index.css:21506; app/src/renderer/styles/index.css:23152; app/src/renderer/styles/index.css:23209
Status: [ERLEDIGT] — Der Chat trägt jetzt `.agent-card`; Verlauf, Eingabe, Beispiele und Modell sind Abschnitte dieser Karte (`PetrolChat.tsx:303–306`, `PetrolChat.tsx:314–438`, `index.css:23169–23189`). Die neuen Verlaufsbilder bestätigen Rahmen und Flächen. `neu-chat-leer.png` zeigt jedoch den Einstellungsdialog und ist als Bildbeleg für den Leerzustand unbrauchbar.

**Zufällig.** Auftrag hat eine zusammenhängende Karte mit Rahmen, 14-px-Radius, weißen und leicht getönten Sektionen sowie feinen Trennern. Im leeren Chat schweben Überschrift, drei Pillen und ein einzelner Eingabe-Rahmen auf der weißen Fläche; im Verlauf schwebt auch die Antwort. Das ist der größte Unterschied in den Screenshots.

Vorschlag: Den Chat als Schwester der Auftragskarte bauen: eine gemeinsame äußere Kartenform mit Kopf/Verlauf/Eingabe-Zone und dezenten Sektionslinien. Der Gesprächsverlauf darf innen scrollen, die Eingabe unten bleiben. Dieselben Rahmen-, Flächen- und Radius-Tokens wie `.agent-card` verwenden; keine zweite isolierte „Chat-App“ innerhalb des Tabs.

### F04 — Lesebreite stimmt nur bis zu einer bestimmten Fenstergröße
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:21407; app/src/renderer/styles/index.css:21439; app/src/renderer/styles/index.css:21442; app/src/renderer/styles/index.css:23148; app/src/renderer/styles/index.css:23149; app/src/renderer/styles/index.css:23150; app/src/renderer/components/Agent/AgentView.tsx:609; app/src/renderer/components/Agent/AgentView.tsx:619
Status: [ERLEDIGT] — Die frühere Chat-Sonderregel `max-width:780px` ist entfernt. Beide Modi erben die gemeinsame Breitenregel; nur die einzelnen Gesprächskarten bleiben auf 760 px begrenzt (`index.css:21439–21444`, `index.css:23169–23195`). Der innere Verlaufsscroll bleibt erhalten.

**Zufällig.** Beide Modi sind im 1400-px-Screenshot ungefähr 780 px breit. Ab 1000 px Containerbreite hebt Auftrag das 780-px-Limit auf und wird zweispaltig; Chat erzwingt auch dann weiter `max-width:780px`. Auf großen Fenstern steht der Chat als schmale Insel, während der Auftrag den verfügbaren Raum nutzt. Chat hat außerdem einen intern scrollenden Verlauf, Auftrag scrollt die ganze Ansicht; diese Scroll-Differenz ist für eine Eingabe unten **gewollt**.

Vorschlag: Kopf und äußerer Kartenrahmen nach derselben responsiven Breitenregel ausrichten. Den Chat-Text **innerhalb** der breiteren Karte auf eine angenehme Lesebreite begrenzen; den internen Verlaufsscroll beibehalten.

### F05 — Leere Chat-Pillen wirken wie ein anderes Beispielsystem
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:292; app/src/renderer/components/Agent/PetrolChat.tsx:295; app/src/renderer/components/Agent/AgentView.tsx:677; app/src/renderer/components/Agent/AgentView.tsx:684; app/src/renderer/styles/index.css:21504; app/src/renderer/styles/index.css:21506; app/src/renderer/styles/index.css:21525; app/src/renderer/styles/index.css:23163; app/src/renderer/styles/index.css:23168
Status: [ERLEDIGT] — Der Leerzustand nutzt dieselben `.agent-card-examples`- und `.agent-card-example`-Klassen wie der Auftrag; ein Klick füllt weiter nur den Entwurf (`PetrolChat.tsx:394–411`, `AgentView.tsx:679–702`, `index.css:21506–21525`). Sichtprüfung des Leerzustands ist nicht möglich: `neu-chat-leer.png` zeigt Einstellungen.

**Funktion gewollt, Gestaltung zufällig.** Chat-Beispiele füllen nur die Eingabe vor; die drei Pillen sind dafür geeignet. Auftrag zeigt seine Beispiele jedoch in einer getönten Sektion „ZUM AUSPROBIEREN“ mit Symbol, Titel und Quelle→Ergebnis. Die Chat-Pillen mit vollem Rundradius und zentrierter 20-px-Frage bilden eine fremde visuelle Hierarchie.

Vorschlag: Auch im Chat eine „Zum Ausprobieren“-Sektion innerhalb der Karte verwenden. Beispiele als kompakte Kacheln mit demselben 10-px-Radius, Icon-Feld und kurzer Nutzenerklärung gestalten; ihr Klick darf weiter nur den Chatentwurf füllen. Eine gemeinsame `ExampleTile`-Optik beziehungsweise Basisklasse teilen, Inhalte modusspezifisch lassen.

### F06 — Eingabe, Senden und Status sitzen in einer anderen Hierarchie
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:344; app/src/renderer/components/Agent/PetrolChat.tsx:348; app/src/renderer/components/Agent/PetrolChat.tsx:371; app/src/renderer/components/Agent/AgentView.tsx:628; app/src/renderer/components/Agent/AgentView.tsx:1019; app/src/renderer/styles/index.css:21481; app/src/renderer/styles/index.css:21784; app/src/renderer/styles/index.css:21815; app/src/renderer/styles/index.css:23209; app/src/renderer/styles/index.css:23219
Status: [ERLEDIGT] — Die Eingabe ist ein rahmenloser Kartenabschnitt mit 15 px/1,55 wie beim Auftrag; Senden verwendet Akzent- und Fokus-Tokens, die Modellzeile steht als eigener Abschnitt darunter (`PetrolChat.tsx:359–392`, `PetrolChat.tsx:414–438`, `index.css:23254–23274`). Die Platzierung von „Neues Gespräch“ weicht noch vom Zielbild ab; siehe F15.

**Eingabe unten gewollt, Form zufällig.** Auftrag behandelt das Textfeld als ruhige Karten-Sektion ohne eigenen Rahmen und setzt den primären „Auftrag eingeben“-Knopf in eine Fußzeile. Chat hat eine pillenartige, separat umrandete Eingabe mit kleinem quadratischem Pfeil darin; darunter folgt eine lose Modell-Statuszeile. Selbst die Schrift weicht ab: Auftragsfeld 15 px bei 1,55 Zeilenhöhe, Chat 14 px bei 1,5.

Vorschlag: Chat-Eingabe als festen unteren **Kartenabschnitt** mit gleicher Typografie, Innenabstand und Trennlinie wie `.agent-card-task` gestalten. Den Senden-Knopf darf ein kompaktes Icon für den Chat bleiben, aber Radius, Zustände und Akzentfläche aus der gemeinsamen Primäraktion ableiten. Modell/Status in eine klare untere Kartenzeile setzen.

### F07 — Derselbe ModelPicker bekommt zwei verschiedene Bühnen
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:371; app/src/renderer/components/Agent/PetrolChat.tsx:372; app/src/renderer/components/Agent/AgentView.tsx:844; app/src/renderer/components/Agent/AgentView.tsx:850; app/src/renderer/components/Agent/AgentView.tsx:879; app/src/renderer/styles/index.css:21604; app/src/renderer/styles/index.css:21725; app/src/renderer/styles/index.css:22443; app/src/renderer/styles/index.css:23226
Status: [ERLEDIGT] — Chat und Auftrag nutzen `ModelPicker` mit 360 px in einer beschrifteten `.agent-card-row`; Weg und Notiz-Hinweis stehen als `.agent-card-route`-Marken darunter (`PetrolChat.tsx:414–438`, `AgentView.tsx:849–890`, `index.css:21596–21610`, `index.css:21725–21755`). Das ist auch im schmalen und dunklen Bild erkennbar.

**Zufällig.** Beide Modi nutzen schon `ModelPicker`; Auftrag zeigt ihn in einer beschrifteten Zeile „Modell“ (bis 360 px) und den geprüften Weg als farbige, umrandete `.agent-card-route`-Marke darunter. Chat zeigt den Picker nur bis 240 px in einer winzigen Statuszeile und den Weg als bloßen farbigen Text neben Trennpunkt und „Liest keine Notizen“. Im Screenshot ist das Modell damit deutlich schwächer und stilfremd.

Vorschlag: `ModelPicker` teilen wie bisher, aber auch im Chat eine Kartenzeile „Modell“ mit derselben Breite und denselben Routen-Marken verwenden. „Liest keine Notizen von selbst“ als ruhigen erklärenden Satz darunter setzen, nicht als Inline-Status zwischen Modellweg und „Neues Gespräch“. Den Wegstatus nach derselben Route-Logik, nicht mit eigener Farbgrammatik anzeigen.

### F08 — Antwort und Nutzerfrage sprechen verschiedene Formsprachen
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:303; app/src/renderer/components/Agent/PetrolChat.tsx:313; app/src/renderer/components/Agent/AgentRunPanel.tsx:231; app/src/renderer/components/Agent/AgentRunPanel.tsx:270; app/src/renderer/styles/index.css:22155; app/src/renderer/styles/index.css:23175; app/src/renderer/styles/index.css:23176
Status: [ERLEDIGT] — Jede Frage mit Antwort liegt jetzt in einer gerahmten `.petrol-turn`-Karte mit getönter Kopfzeile und ruhigem Antwortbereich (`PetrolChat.tsx:323–353`, `index.css:23190–23220`). Die Bestätigungs-, dunklen und schmalen Bilder zeigen dieselbe zusammenhängende Form.

**Gesprächsform gewollt, Kontrast zufällig.** Nutzertext ist eine betonte Petrol-Blase, Assistententext steht randlos als breite Markdown-Liste; Auftrags-Ergebnisse sind ruhige Karten mit Rahmen und getöntem Hintergrund. Der Chat muss nicht jede Nachricht wie eine Datei-Ergebniskarte behandeln, aber Frage und Antwort sollten sichtbar zum selben Kartensystem gehören. Im Verlaufs-Screenshot wirkt die Assistentenantwort wie ungerahmter Dokumenttext.

Vorschlag: Pro Gesprächswechsel eine leichte Antwortkarte oder ein zusammengehöriges Fragen-/Antwortpaar mit feinem Rahmen, `var(--bg-secondary)` und demselben Radius-Raster wie `.ai-bar-agent-card`; die Nutzerfrage kann als kompakte Kopfzeile statt alleiniger Blase bleiben. Markdown darin weiter gut lesbar halten, keine enge Ergebnisdatei-Karte erzwingen.

### F09 — Antwortaktionen und Bestätigung haben keine Karten-Fußzeile
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:315; app/src/renderer/components/Agent/PetrolChat.tsx:323; app/src/renderer/components/Agent/AgentRunPanel.tsx:302; app/src/renderer/components/Agent/AgentRunPanel.tsx:321; app/src/renderer/styles/index.css:22196; app/src/renderer/styles/index.css:21888; app/src/renderer/styles/index.css:21900; app/src/renderer/styles/index.css:23192; app/src/renderer/styles/index.css:23238
Status: [ERLEDIGT] — Modell und Aktionen stehen in einer abgetrennten Karten-Fußzeile; Ersetzen/Anhängen/Abbrechen sind im getönten Bestätigungsbereich als Knöpfe gewichtet (`PetrolChat.tsx:280–300`, `index.css:23231–23245`). Das Bestätigungsbild zeigt die Abstufung deutlich.

**Aktionen gewollt, Hierarchie zufällig.** Im Chat hängen Modellname, Kopieren, Speichern und „Daraus etwas erstellen“ als nackte Textlinks direkt unter der Antwort; die Ersetzen/Anhängen/Abbrechen-Leiste ist ein dünn umrandeter Streifen mit drei weiteren Textlinks. Auftrag stellt Ergebnisaktionen in einer geordneten, rechtsbündigen Karten-Fußzeile dar; „Übernehmen“ ist sichtbar primär, Verwerfen sekundär.

Vorschlag: Antwortaktionen in eine durch Trennlinie abgesetzte Karten-Fußzeile ziehen: Modell/Route links, Kopieren/Speichern als kleine Sekundäraktionen, „Daraus etwas erstellen“ als klare Petrol-Aktion. Die Entwurf-Wahl als eingebetteten Bestätigungsbereich mit Knöpfen im selben 8/9-px-Radius und eindeutiger Primär-/Abbruch-Hierarchie darstellen. Aktionen und Zustandswechsel beibehalten.

### F10 — Warten, Fehler und laufender Auftrag sehen unverbunden aus
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:277; app/src/renderer/components/Agent/PetrolChat.tsx:308; app/src/renderer/components/Agent/PetrolChat.tsx:333; app/src/renderer/components/Agent/AgentRunPanel.tsx:222; app/src/renderer/components/Agent/AgentRunPanel.tsx:231; app/src/renderer/styles/index.css:22129; app/src/renderer/styles/index.css:22152; app/src/renderer/styles/index.css:23153; app/src/renderer/styles/index.css:23181; app/src/renderer/styles/index.css:23199
Status: [OFFEN] — Warten und Streaming sitzen jetzt in der Antwortkarte mit Modell und „schreibt …“, Fehler im getönten Kartenabschnitt, der laufende Auftrag in einem Banner (`PetrolChat.tsx:307–311`, `PetrolChat.tsx:333–351`, `index.css:23175–23181`, `index.css:23224–23230`). Für den Fehler fehlt aber weiterhin die im Vorschlag verlangte Wiederholaktion: `PetrolChat.tsx:333–336` rendert nur Text. Laufzeit war ausdrücklich optional. Für Fehler und Auftrags-Banner liegt kein neuer Screenshot vor.

**Zustände gewollt, Gestaltung zufällig.** Chat zeigt drei pulsierende Punkte ohne Fläche oder Laufzeit, Fehler als linke Warnleiste ohne Karte, und einen laufenden Auftrag als bloß umrandete Hinweiszeile. Auftrag zeigt Laufzeit, Stopp und Schritte in einem eigenen Panel; Ergebnisfehler sitzen in der Karte. Bei langen lokalen Antworten kann die Chat-Wartephase im leeren Verlauf wie ein Dekorationselement wirken.

Vorschlag: Warten und Streaming in eine leichte Antwortkarte mit Modell/Route und Stopp-Zustand einbetten; optional Laufzeit wie im Auftrags-Panel zeigen. Fehler als derselbe Kartenplatz mit Warn-/Fehlerton und klarer Wiederholaktion, nicht als aus dem Faden fallende Randlinie. Der Hinweis auf einen parallel laufenden Auftrag darf ein schmaler Karten-Banner bleiben, soll aber dessen `ai-bar-agent-mode-hint`-Tokens nutzen.

### F11 — Fokus, Hover und Dunkelmodus sind im Chat lückenhaft
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:21539; app/src/renderer/styles/index.css:22460; app/src/renderer/styles/index.css:21826; app/src/renderer/styles/index.css:23173; app/src/renderer/styles/index.css:23194; app/src/renderer/styles/index.css:23219; app/src/renderer/styles/index.css:23242
Status: [ERLEDIGT] — Die Chat-Aktionen nutzen gemeinsame Knopfklassen mit Fokuszustand; Senden hat Hover, Fokus und `--accent-on`, der Umschalter mischt seinen Schatten aus einem Theme-Token (`index.css:23140–23167`, `index.css:23266–23274`). Das dunkle Bild zeigt lesbare Flächen und Kontraste. Die Textfelder hatten schon zuvor keinen eigenen Fokusrahmen; das ist kein neuer Unterschied zum Auftrag (`index.css:21481–21493`, `index.css:23258–23263`).

**Zufällig.** Auftrag-Beispielkacheln und der gemeinsame ModelPicker haben definierte `:focus-visible`-Ringe; im Chat haben Pillen, Antwort- und Bestätigungsknöpfe nur Hover oder gar keinen eigenen Fokuszustand. Der Senden-Knopf hat weder Hover- noch sichtbaren Fokuszustand, und sein Text/Ikon ist hart `#fff`, während die Auftrags-Primäraktion `var(--accent-on)` nutzt. Der Umschalter nutzt einen festen schwarzen `rgba`-Schatten, der in dunklen Themes gleich bleibt.

Vorschlag: Gemeinsame Fokus- und Hover-Regeln für alle klickbaren Kartenaktionen nutzen (`--focus-ring`, `--accent-hover`, `--accent-on`). Dunkelmodus mit beiden Ansichten prüfen; Schatten aus Text-/Flächentokens mischen oder weglassen. Die Größenwerte nicht blind global angleichen, aber Radius-/Abstandstokens für dieselbe Funktion teilen.

### F12 — Im schmalen Split verschwindet nur im Chat der Untertitel
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:21799; app/src/renderer/styles/index.css:21800; app/src/renderer/styles/index.css:21808; app/src/renderer/styles/index.css:23134; app/src/renderer/styles/index.css:23226; app/src/renderer/styles/index.css:23234; app/src/renderer/components/Agent/AgentView.tsx:586; app/src/renderer/components/Agent/PetrolChat.tsx:371
Status: [OFFEN] — Der Untertitel wird in beiden Modi gezeigt, aber durch `white-space:nowrap`, `overflow:hidden` und Ellipse abgeschnitten (`index.css:23151–23152`). Beide schmalen Bilder zeigen unvollständige Sätze. Außerdem blendet die Chat-Regel gerade im Split die Tastaturhilfe aus (`index.css:23278–23282`), während der Auftrag seine Hilfe zeigt (`AgentView.tsx:650–651`). Gemeinsamer Umbruch ohne Informationsverlust ist noch nicht erreicht.

**Zufällig.** Auftrag stapelt seine Formularzeilen und Beispiele bei 560 px; Chat blendet bei derselben Breite allein den Untertitel aus. Umschalter und Titel teilen weiter eine Zeile, während Modellpicker, Weg, Hinweis und „Neues Gespräch“ umbrechen. Das kann in der Split-Ansicht eine überfüllte untere Leiste ergeben und den Kopfsprung sogar vergrößern.

Vorschlag: Einen gemeinsamen schmalen Kopf mit definiertem Umbruch des Umschalters für **beide** Modi festlegen; Untertitel entweder in beiden als kurze Zeile zeigen oder in beiden weglassen. Die Chat-Fußzeile bei 560 px in zwei beschriftete Reihen aufteilen und Aktionen erreichbar halten; Text auf Lesebreite, nicht durch künstliches Abschneiden, begrenzen. Split und dunkles Theme gemeinsam visuell prüfen.

### F13 — Geteilte Bausteine sind schon da; teilen sollte man die Form
Schwere: niedrig
Stelle: app/src/renderer/components/Agent/AgentView.tsx:579; app/src/renderer/components/Agent/AgentView.tsx:850; app/src/renderer/components/Agent/PetrolChat.tsx:372; app/src/renderer/components/Agent/AgentRunPanel.tsx:270; app/src/renderer/styles/index.css:21430; app/src/renderer/styles/index.css:22155; app/src/renderer/styles/index.css:23152
Status: [ERLEDIGT] — Der vorhandene Kopf und `ModelPicker` bleiben geteilt; Chat verwendet jetzt `.agent-card`, `.agent-card-row`, `.agent-card-route`, `.agent-card-example` und `.agent-card-btn` statt eigener Grundformen (`AgentView.tsx:579–626`, `PetrolChat.tsx:280–306`, `PetrolChat.tsx:394–438`, `index.css:23157–23173`).

**Struktureller Vorschlag zu Frage 3.** Kopf samt Umschalter ist bereits **ein** JSX-Block in `AgentView`, und beide Modi verwenden denselben `ModelPicker`. Ein neues allgemeines „Chat-und-Auftrag“-Monolithenbauteil würde diese Vorteile nicht erhöhen. Doppelt sind die optischen Grundformen: Kartenrahmen, Sektionen, kleine Aktionsknöpfe, Routen-Marke, Beispielkacheln und Status-/Fehlerflächen.

Vorschlag: Gemeinsame CSS-Grundklassen oder kleine Präsentationsbausteine für `PanelCard`, `SectionRow`, `RouteBadge`, `ExampleTile` und `ActionRow` ziehen. Die Chat-Nachrichtenlogik und Agent-Laufentscheidungen in ihren Komponenten lassen. Design-Tokens für Radius, Rahmen, Flächen, Fokus und Abstände an einer Stelle pflegen.

### F14 — Zielbild: Gespräch in der Formensprache der Auftragskarte
Schwere: niedrig
Stelle: app/src/renderer/components/Agent/AgentView.tsx:623; app/src/renderer/components/Agent/PetrolChat.tsx:276; app/src/renderer/components/Agent/AgentRunPanel.tsx:270; app/src/renderer/styles/index.css:21430; app/src/renderer/styles/index.css:23158
Status: [OFFEN] — Kartenrahmen, innerer Verlaufsscroll, Antwortkarten, Eingabe und Modellzeile sind umgesetzt (`PetrolChat.tsx:303–438`, `index.css:23169–23281`). Das Zielbild verlangt aber einen ohne Abschneiden lesbaren gemeinsamen Kopf sowie „Neu“ in der unteren Modell-/Datenweg-Zeile; beides fehlt noch (F02/F12/F15). Die Bilder `neu-chat-leer.png` und `neu-auftrag.png` zeigen den Einstellungsdialog, sodass der neue Leerzustand und der helle Auftrag dort nicht visuell geprüft werden können.

**Antwort auf Frage 5.** Der Kopf mit Petrol-Logo, „Petrol Agent“, kurzem Untertitel und Umschalter bleibt beim Wechsel pixelstabil. Darunter steht in beiden Modi derselbe ruhige Kartenrahmen. Im Chat hat er einen scrollenden Gesprächsbereich; der leere Zustand zeigt eine getönte Beispielsektion, der gefüllte Zustand leichte Frage-Antwort-Karten. Die Eingabe und Modell-/Datenweg-Zeile bleiben als untere Sektionen erreichbar:

```text
Petrol Agent                                      Chat | Auftrag
Kurzer Modus-Hinweis
┌─────────────────────────────────────────────────────────┐
│ Gespräch: Frage / Antwortkarte · Aktionen im Kartenfuß │
│ [leer: Zum Ausprobieren · Beispielkacheln]             │
├─────────────────────────────────────────────────────────┤
│ Frage an Petrol …                            [Senden]   │
├─────────────────────────────────────────────────────────┤
│ Modell · geprüfter Weg · liest keine Notizen  [Neu]     │
└─────────────────────────────────────────────────────────┘
```

Der Chat scrollt innen, damit die Eingabe unten bleibt; Auftrag kann wie bisher als Seite scrollen. Im Split stapeln sich Kopf und untere Statuszeile nach denselben Regeln, ohne Inhalte zu verstecken.

Vorschlag: Dieses Zielbild zuerst am gemeinsamen Kopf und Kartenrahmen umsetzen, danach Beispiele, Antwortkarten und Fußzeile daran ausrichten.

### F15 — „Neues Gespräch“ steht in der falschen Sektion
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:383–388; app/src/renderer/components/Agent/PetrolChat.tsx:414–438; app/src/renderer/styles/index.css:23264–23265; app/src/renderer/components/Agent/AgentView.tsx:849–890
Status: [OFFEN]

Im Zielbild F14 steht „Neu“ in der unteren Modell-/Datenweg-Zeile. Tatsächlich rendert der Chat „Neues Gespräch“ unmittelbar unter der Eingabe, oberhalb der Modellzeile; im Verlaufs- und schmalen Screenshot wirkt die Aktion daher wie eine Eingabehilfe statt wie eine Gesprächsaktion. Der Auftrag trennt die Modellzeile klar von seiner Eingabe (`AgentView.tsx:849–890`).

Vorschlag: „Neues Gespräch“ an den rechten Rand der Modell-/Datenweg-Sektion oder in einen eigenen, an diese Sektion anschließenden Kartenfuß setzen. Im Split darf es umbrechen, soll aber als eigenständige Aktion sichtbar bleiben.

## Claude-Antwort

### Umsetzung (24.10.2026, Nutzer hat alle 14 freigegeben; Titel „Petrol Agent“ in beiden, Chat-Beispiele als Kacheln)
- F01/F02/F12 Kopf: ein Titel (`agentTab.title`), Untertitel einzeilig mit Ellipse (beide Modi, auch schmal), Leerlauf-Absenkung des Kopfes entfernt, `scrollbar-gutter: stable` auf `.agent-view`, Umschalter reserviert die fette Breite (`::after` mit `data-label`). Gemessen: Titel x 553 / y 124 und Umschalter x 1147 / y 131 / 129 px in beiden Modi identisch.
- F03/F04/F14 Karte: `PetrolChat` ist jetzt `.agent-card.petrol-chat` (einspaltig; ab 1000 px gleiche Breitenregel wie der Auftrag, Wechsel-Karten innen auf 760 px begrenzt). Abschnitte: Hinweis laufender Auftrag, Verlauf (getönt, `--bg-secondary`), Eingabe, im Leerzustand „Zum Ausprobieren“, Modellzeile.
- F05: Chat-Beispiele als `.agent-card-example`-Kacheln mit eigenen SVG-Symbolen und „Entwurf → klarer Text“ usw.; Klick füllt nur den Entwurf.
- F06: Eingabe als Kartenabschnitt wie `.agent-card-task` (15 px / 1,55, ohne Rahmen), Hilfezeile und „Neues Gespräch“ darunter; Senden mit `--accent-on` / `--accent-hover` / Fokusring, deaktiviert wie `.agent-card-start`.
- F07: Modellzeile = `.agent-card-row is-two-col` mit Label „Modell“, `ModelPicker` 360 px, Weg als `.agent-card-route` (lokal / `is-out` / `is-muted`), „Liest keine Notizen von selbst“ als ruhige Marke.
- F08/F09/F10: je Wechsel `.petrol-turn` (weiße Karte, 10 px Radius) mit Frage-Kopfzeile, Antwort, Fußzeile (Modell links, Kopieren/Speichern als `.agent-card-btn`, „Daraus etwas erstellen“ als `is-accent`); Bestätigung als getönter Bereich mit Abbrechen / Anhängen / Ersetzen (primär). Warten/Streaming in derselben Karte mit Modell und „schreibt …“, Fehler als getönter Kartenabschnitt. Optionale Laufzeitanzeige nicht gebaut.
- F11: Fokusringe für `.agent-card-btn`, `.agent-card-link-btn`, Senden, Umschalter; Umschalter-Schatten aus `--text-primary` gemischt; kein `#fff` mehr.
- F13: geteilt werden die bestehenden Klassen (`agent-card`, `agent-card-row`, `agent-card-route`, `agent-card-example*`, `agent-card-btn` mit neuen Varianten `is-accent` / `is-primary`); keine neue Großkomponente.
- Screenshots nach Umbau (hell, dunkel, schmal 500 px) im Ordner `/private/tmp/claude-502/-Users-jochenleeder-dev-mindgraph-notes/8532b17a-2a53-4a2a-8987-360951af082b/scratchpad/optik`: `neu-chat-leer.png`, `neu-chat-warten.png`, `neu-chat-confirm.png`, `neu-auftrag.png`, `neu-dunkel-chat.png`, `neu-dunkel-auftrag.png`, `neu-schmal-chat.png`, `neu-schmal-auftrag.png`.

### Runde 2: Nachprüfung
Codex: bitte Code und Screenshots gegen das Zielbild F14 prüfen, je Befund F01–F14 Status setzen ([ERLEDIGT] / [OFFEN] mit Grund). Neue Befunde nur für echte Abweichungen oder Regressionen im Auftrag-Modus.

### Runde 2 — Antworten (24.10.2026, innerhalb der Nutzerfreigabe)
- F02/F12/F14 Untertitel: unter 760 px Containerbreite darf er umbrechen (zwei Zeilen reserviert, unter 560 px drei), damit ist er vollständig lesbar und der Kopf bleibt in beiden Modi gleich hoch. Gemessen bei 500 px: Titel x 717 / y 124, Umschalter x 983 / y 149, Kartenanfang y 216 — in Chat und Auftrag identisch. Tastaturhilfe wird im schmalen Chat nicht mehr ausgeblendet.
- F10: Fehlerabschnitt hat „Erneut senden“ (schickt die gescheiterte Frage erneut, ein laufender Entwurf bleibt stehen). Fehler- und Auftragsbanner nicht per Screenshot nachgestellt.
- F15: „Neues Gespräch“ als `.agent-card-btn` rechts in der Modellzeile (schmal: darunter, linksbündig).
- Screenshots `neu-chat-leer.png`, `neu-auftrag.png`, `neu-chat-verlauf.png`, `neu-schmal-*.png` neu aufgenommen (vorher zeigten zwei den Einstellungsdialog).
- typecheck, Tests, build grün.

## Status

Runde 1: F01–F14 umgesetzt. Runde 2: 10 erledigt, F02/F10/F12/F14/F15 nachgebessert (24.10.2026, uncommitted). Abnahme durch den Nutzer offen.
