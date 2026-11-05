# Petrol-Chat: Gesprächsliste in der Seitenleiste — Design

## Aufgabe

Nutzerabnahme Teil 1 (05.11.2026, `chat-verlauf-notizen-bilder.md`): Die Liste gespeicherter
Gespräche ist von einer Fläche über dem Chat in die linke Seitenleiste gewandert (Nutzer: „Ich
stelle mir gerade 50 Chatverläufe vor … der Chatverlauf muss doch links platziert werden“). Sie
funktioniert, der Nutzer sieht aber Feinarbeit am Design: „am Design könnte man noch feilen“.

Gesucht: eine **Design-Prüfung** des Abschnitts „Gespräche“ in der Seitenleiste. Codex prüft
gegen Screenshot, CSS und Markup, ob er sich in die Seitenleiste einfügt (Abstände, Raster,
Typografie, Farben, Zustände), wie er mit 50+ Gesprächen funktioniert, und ob Bedienung und
Zugänglichkeit stimmen. Keine Code-Edits, kein Commit.

## Kontext / Anker

- Screenshot des Nutzers (macOS, hell, echter Vault mit 4946 Notizen):
  `/private/tmp/claude-502/-Users-jochenleeder-dev-Veranstaltungsjournal/c99c124c-c975-4e96-9f39-789ee09b5f37/scratchpad/design/nutzer-2026-11-05-1011.png`
- Komponente: `app/src/renderer/components/Agent/PetrolChatHistory.tsx`. Eingebaut in
  `app/src/renderer/components/Sidebar/Sidebar.tsx` zwischen `BookmarksBar` und
  `.sidebar-content` (Dateibaum). Sichtbar nur bei vorne liegendem Agent-Tab im Chat-Modus.
- Styles: `app/src/renderer/styles/index.css`, Block „Gesprächsliste in der Seitenleiste“
  (`.petrol-history*`). Vorbilder in derselben Seitenleiste:
  - `.pinned-folders-header` (Kopf „Angepinnt“),
  - `.file-item-row` (Zeile im Dateibaum: `padding: 7px 10px`, `margin: 1px 10px`, `min-height: 30px`),
  - `.file-kind-filter` (die drei Farbpunkte gehören zum Dateibaum).
- Knopf „Gespräche“ in der Chat-Fußzeile: `app/src/renderer/components/Agent/PetrolChat.tsx`
  (`showHistory`), klappt den Abschnitt auf und zeigt die Seitenleiste.
- Texte: `app/src/renderer/utils/i18n/petrolChat.ts` (`petrolChat.history*`).
- Projektregeln für Optik: `CLAUDE.md`, Abschnitt Petrol-Chat (Gesprächsform, Tokens, Petrol nicht
  für Fließtext, Datenweg-Angaben nie ersatzlos streichen) und `docs/codex-collab/chat-wie-codex.md`.

### Eigene Beobachtungen (Claude, zum Gegenprüfen — nicht als Ergebnis übernehmen)

1. Unter der Liste ist ein **waagrechter Scrollbalken** zu sehen (dünner Balken unter dem zweiten
   Eintrag). Vermutlich `overflow-y: auto` ohne `overflow-x: hidden` an `.petrol-history-list`.
2. **Raster weicht vom Dateibaum ab:** Die Zeilen stehen weiter links und sind niedriger als
   `.file-item-row`, die Kopfzeile ist anders eingerückt als „Angepinnt“.
3. **„Alle löschen“ steht dauerhaft in Akzentfarbe** direkt unter der Liste, eine zerstörende
   Aktion mit viel Gewicht. „Nur auf diesem Rechner“ daneben wirkt wie eine zweite Aktion.
4. **Grenze zum Dateibaum unklar:** Direkt unter dem Abschnitt folgen die drei Farbpunkte des
   Dateibaums. Sie sehen aus, als gehörten sie noch zu „Gespräche“.
5. **Lange Titel:** Die erste Frage ist oft ein ganzer Satz, nach rund 30 Zeichen abgeschnitten.
6. **Viele Gespräche:** höchstens 42 % der Seitenleiste mit eigenem Scrollen, aber ohne Gruppen
   (Heute, Gestern, Älter) und ohne „Mehr anzeigen“.
7. Nicht geprüft: Dunkelmodus, schmale Seitenleiste, leerer Zustand, Hinweise (kein Schlüssel,
   kein Vault), Hover- und Fokuszustände.

## Codex-Findings

### F01 — Waagrechter Scrollbalken im Gesprächsbereich
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:23240; app/src/renderer/styles/index.css:23244-23249
Status: [OFFEN]
Der Nutzerscreenshot zeigt unter der zweiten Gesprächszeile einen waagrechten Scrollbalken. Die Liste setzt nur `overflow-y: auto`; damit wird `overflow-x` im berechneten Stil ebenfalls `auto`. Die Ellipse am Titel beseitigt Überlauf des übrigen Zeilenlayouts nicht. Der Balken stört gerade in der schmalen Sidebar und frisst Höhe.
Vorschlag: `.petrol-history`, Liste und Zeile mit `min-width: 0` absichern, die tatsächliche überbreite Box im 180-px- und 250-px-Fall ermitteln und an der Quelle korrigieren; danach `overflow-x: hidden` und `scrollbar-gutter: stable` für die Liste. Der Testfall muss lange Titel, Umbenennen und beide Bestätigungen umfassen.

### F02 — Zeilenraster weicht vom Dateibaum ab, Kopf fast nicht
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:23225-23228; app/src/renderer/styles/index.css:23240-23250; app/src/renderer/styles/index.css:1428-1437; app/src/renderer/styles/index.css:1446-1458; app/src/renderer/components/Sidebar/FileTree.tsx:2022-2026
Status: [OFFEN]
Die eigene Beobachtung 2 trifft für die Zeilen zu: Gesprächstitel beginnen bei 6 px Listenpolster + 8 px Knopfpolster = 14 px, Dateizeilen bei 10 px Außenabstand + 2 px Rahmen + 10 px Innenabstand = 22 px. Gesprächszeilen haben nur 6 px vertikales Knopfpolster und keine Mindesthöhe; Dateizeilen 7 px, `min-height: 30px` und 1 px Abstand. Die Kopf-Typografie ist dagegen bereits identisch zu „Angepinnt“ (10 px, 700, Versalien, 0,08 em); auch die Textanfänge liegen durch 10-px- gegen 12-px-Icon nur etwa 2 px auseinander. Der Kopf braucht keine neue Schriftgestaltung.
Vorschlag: Listenpolster links/rechts auf 0 setzen und Gesprächszeilen mit `margin: 1px 10px`, transparenter 2-px-Linkskante, `min-height: 32px`, `padding: 7px 10px` und Radius 7 px auf das Dateiraster setzen; Titelkante so auf 22 px ausrichten. Kopftext bei etwa 28 px belassen, nur Knopffläche und rechte Kante anpassen. Aktuellen Eintrag wie `.file-item-row.selected` mit dezenter Akzentfläche und linker 2-px-Markierung statt nur Flächenfarbe kennzeichnen.

### F03 — Dauerhaft sichtbares „Alle löschen“ hat falsches Gewicht
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:222-233; app/src/renderer/styles/index.css:23260-23262; app/src/renderer/styles/index.css:23268
Status: [OFFEN]
Die eigene Beobachtung 3 stimmt: `Alle löschen` ist bei jeder nichtleeren Liste im Fuß sichtbar und bekommt über `.petrol-history-act` die Akzentfarbe; erst die Bestätigung wird rot. Dadurch konkurriert die seltene, zerstörende Aktion mit dem primären „Neues Gespräch“. Die rechtsbündige Zeile „Nur auf diesem Rechner“ ist technisch ein `span`, wirkt durch `justify-content: space-between` im Screenshot aber wie eine zweite Fußaktion.
Vorschlag: „Alle löschen“ in ein schlichtes Mehr-Menü am Abschnittskopf legen; dort zunächst `--text-secondary`, im Bestätigungsschritt `--color-danger`. Den Datenhinweis als eigene, nicht aktionsförmige Infozeile unter Liste oder Leerzustand führen, linksbündig mit 10–12 px Abstand; keine zwei gegeneinander ausgerichteten Fußtexte.

### F04 — Dateifilter sieht wie Teil der Gespräche aus
Schwere: mittel
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:608-613; app/src/renderer/components/Sidebar/FileTree.tsx:1993-2019; app/src/renderer/styles/index.css:1168-1172; app/src/renderer/styles/index.css:1353-1360; app/src/renderer/styles/index.css:23223
Status: [OFFEN]
Die drei farbigen Filterpunkte folgen im Markup unmittelbar auf die Gesprächsliste und gehören zum Dateibaum. Im Screenshot ist die Trennlinie des Gesprächsabschnitts zu leise, um diese Zugehörigkeit zu vermitteln; die 10 px obere Innenfläche von `.sidebar-content` schafft keinen semantischen Anker. Die eigene Beobachtung 4 ist bestätigt.
Vorschlag: Vor dem Dateifilter einen Abschnittskopf „Dateien“/„Notizen“ im Stil von `.pinned-folders-header` setzen oder Filter und Dateibaum mit einer sichtbaren `--border-subtle`-Grenze und 12–16 px Abstand als gemeinsamen Bereich kapseln. Die drei Punkte unmittelbar unter diesem Dateibaumkopf belassen.

### F05 — Satzlange Titel verlieren auf einer Zeile ihre Unterscheidung
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:195-205; app/src/renderer/styles/index.css:23245-23252; app/src/renderer/App.tsx:1091-1095
Status: [OFFEN]
Im Screenshot enden beide Titel nach ungefähr einem Satzanfang; CSS erzwingt `white-space: nowrap` mit Ellipse, während die Uhrzeit rechts Breite belegt. Bei der tatsächlich zulässigen Sidebarbreite von 180 px bleibt noch weniger vom Titel. Der volle Titel steht nur im nativen `title`-Tooltip des Öffnen-Knopfs; der ist für Touch nicht erreichbar und als visuelle Hilfe bei Tastaturfokus unzuverlässig. Die eigene Beobachtung 5 ist bestätigt.
Vorschlag: Titel in maximal zwei Zeilen (`line-clamp: 2`, Zeilenhöhe etwa 18 px) zulassen und Datum/Uhrzeit als zweite Metazeile oder am rechten Rand in einem festen 40–48-px-Slot zeigen. Für sehr schmale Breite Metadatum unter dem Titel; vollständigen Titel im zugänglichen Knopfnamen belassen und optional als fokussierbaren, themenfarbenen Tooltip anbieten.

### F06 — 50+ Gespräche sind scrollbar, aber schwer auffindbar
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:86-92; app/src/renderer/components/Agent/PetrolChatHistory.tsx:168-175; app/src/renderer/styles/index.css:23224; app/src/renderer/styles/index.css:23240; app/src/renderer/styles/index.css:1168-1171
Status: [OFFEN]
Die Liste rendert sämtliche Gespräche in einer flachen Folge und die Datumsausgabe wechselt nur zwischen Uhrzeit und Kurzdatum. Bei 50+ Einträgen hilft die Kappung auf 42 % der Sidebar zwar gegen Verdrängung, erzeugt aber eine zweite Bildlaufleiste über dem scrollenden Dateibaum. Es gibt weder Datumsgruppen noch Suche nach Titeln. Die eigene Forderung nach „Mehr anzeigen“ ist deshalb nicht zwingend; ein weiterer Klick würde das Finden eher erschweren.
Vorschlag: Innerhalb des bestehenden Scrollbereichs nach „Heute“, „Gestern“, „Letzte 7 Tage“, „Älter“ gruppieren, mit ruhigen, am oberen Rand haftenden Gruppenlabels. Ab etwa 10 Einträgen ein Suchfeld nach Titel über der Liste anbieten. Maximalhöhe als `min(36vh, 360px)` prüfen und dem Dateibaum auf kleinen Fenstern mindestens etwa 180 px lassen; Liste intern weiter scrollen.

### F07 — Aktionsicons springen ins Layout und fehlen auf Touch
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:195-215; app/src/renderer/styles/index.css:23252-23258
Status: [OFFEN]
`Umbenennen` und `Löschen` sind mit `display: none` verborgen und erscheinen erst bei Hover oder `focus-within`; gleichzeitig verschwindet die Zeit. Dadurch wechseln Titelbreite und Metadaten genau beim Ansteuern der Zeile. Auf einem Touchgerät gibt es ohne Hover keinen sichtbaren Zugang zu beiden Aktionen. Per Tastatur tauchen die Knöpfe erst nach Fokussieren der Öffnen-Schaltfläche auf, was wenig erkennbar ist. Die 22×22-px-Iconziele sind zudem kleiner als die 28×28-px-Sidebaraktionen.
Vorschlag: Stabile rechte Spalte reservieren. Ein Mehr-Knopf (mindestens 32×32 px, auf Touch dauerhaft sichtbar) öffnet „Umbenennen“ und „Löschen“; auf Desktop darf er beim Hover/Fokus erscheinen, ohne Zeilenbreite oder Zeitposition zu ändern. Zeit im Metabereich sichtbar lassen; Fokus und Auswahl unabhängig vom Hover gestalten.

### F08 — Löschbestätigung fokussiert sofort die Gefahr, Umbenennen speichert beim Fokusverlust
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:117-124; app/src/renderer/components/Agent/PetrolChatHistory.tsx:139; app/src/renderer/components/Agent/PetrolChatHistory.tsx:176-191; app/src/renderer/components/Agent/PetrolChatHistory.tsx:222-230
Status: [OFFEN]
Sowohl Einzel- als auch Gesamtlöschung setzen `autoFocus` auf den roten Bestätigen-Knopf. Ein zweites Enter nach dem Öffnen der Bestätigung kann damit unmittelbar löschen. Beim Umbenennen speichert `onBlur` ohne ausdrückliche Bestätigung; Escape verwirft nur den lokalen Editzustand. Diese unterschiedlichen Abschlusswege sind beim Wechsel zwischen Eingabe, Tastatur und Maus schwer vorhersehbar.
Vorschlag: Bestätigung als eigene Zeile mit zuerst fokussiertem „Abbrechen“, klarer Frage und rotem Löschknopf am Ende; nach Abschluss Fokus zum selben Listeneintrag bzw. Abschnittskopf zurückführen. Umbenennen nur per Enter oder ausdrücklich benanntem „Speichern“ übernehmen, Escape ohne Speichern verwerfen; Blur höchstens nach nachweislich nicht abgebrochenem Edit speichern.

### F09 — Fokusmarkierung und Zielgrößen bleiben hinter der Sidebar zurück
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:23226-23234; app/src/renderer/styles/index.css:23242-23268; app/src/renderer/styles/index.css:23154; app/src/renderer/styles/index.css:1389-1391; app/src/renderer/styles/index.css:778-783
Status: [OFFEN]
Der Verlauf hat Hover- und `focus-within`-Flächen, aber keine eigene `:focus-visible`-Markierung für Abschnittskopf, Öffnen, Plus, Iconaktionen, Bestätigungen und Eingabefeld; letzteres setzt sogar `outline: none`. Andere App-Bereiche verwenden dafür `--focus-ring`. Plus und Zeilenicons messen nur 22×22 px, die Textaktionen haben bloß 2 px vertikales Polster. Das erschwert Tastaturorientierung und präzises Treffen.
Vorschlag: Für alle interaktiven Verlaufselemente einen 2–3-px-Ring mit `--focus-ring` auf `:focus-visible` definieren, beim Eingabefeld zusätzlich klaren Rahmen. Plus und Menü mindestens 32×32 px, Textaktionen mindestens 32 px hoch; auf Touch 40×40 px anstreben. Hoverfläche, aktueller Eintrag und Tastaturfokus als drei unterscheidbare Zustände zeigen.

### F10 — Theme-Tokens korrekt, aber Kleinschrift in beiden Themen zu blass
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:74-86; app/src/renderer/styles/index.css:106-125; app/src/renderer/styles/index.css:143-162; app/src/renderer/styles/index.css:23228-23239; app/src/renderer/styles/index.css:23249-23268; app/src/renderer/styles/index.css:738-742; CLAUDE.md:391
Status: [OFFEN]
Die eigene offene Beobachtung 7 zum Dunkelmodus lässt sich präzisieren: Der Verlauf verwendet Theme-Tokens; kein festes Hell-Token erzwingt einen falschen Dark-Mode-Hintergrund. Auch die Titel stehen bereits in `--text-primary`, also nicht in Petrol-Fließtextfarbe. Problematisch ist vielmehr `--text-muted` für 10-px-Kopf, 11-px-Zeit/Fuß und 12-px-Leerzustand. Gegen die Sidebarfläche `--bg-chrome` ergibt der Standard etwa 2,3:1 hell und 3,1:1 dunkel; normale Kleinschrift erreicht damit keinen 4,5:1-Kontrast.
Vorschlag: Für lesbare Angaben `--text-secondary` bzw. einen geprüften Sidebar-Metatext-Token mit mindestens 4,5:1 in beiden Themes verwenden, Schrift für Metadaten auf mindestens 12 px setzen. Gedämpft bleiben dürfen Trennlinien und rein dekorative Zeichen; Petrol nur für aktive Steuerung und Auswahl.

### F11 — Hinweis „kein Vault“ ist in der Sidebar unerreichbar
Schwere: mittel
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:524-525; app/src/renderer/components/Sidebar/Sidebar.tsx:608-621; app/src/renderer/components/Agent/PetrolChatHistory.tsx:126-131; app/src/renderer/components/Agent/PetrolChat.tsx:129-134; app/src/renderer/components/Agent/PetrolChat.tsx:1144-1147
Status: [OFFEN]
`PetrolChatHistory` bereitet zwar den Text „Ohne geöffneten Vault werden Gespräche nicht gespeichert“ vor, wird aber ausschließlich im `vaultPath`-Zweig von `Sidebar` montiert. Ohne Vault zeigt die Seitenleiste nur ihre allgemeine Leerseite. Der „Gespräche“-Knopf im Chat versucht dennoch, den nicht vorhandenen Verlaufskopf zu fokussieren. Die eigene Beobachtung 7 ist für diesen Zustand also kein bloßer Gestaltungsfall, sondern ein unerreichbarer Hinweis.
Vorschlag: Den Gespräche-Kopf auch ohne Vault anzeigen und darunter den konkreten Nicht-speichern-Hinweis samt „Vault öffnen“-Aktion darstellen; alternativ den Chat-Fußknopf in diesem Zustand auf eine sichtbar fokussierbare Erklärung im Chat führen. Fokus nach dem Aufklappen erst setzen, wenn das Ziel tatsächlich montiert ist.

### F12 — Speicherweg und Fehler werden visuell bzw. akustisch nicht vollständig vermittelt
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:52-63; app/src/renderer/components/Agent/PetrolChatHistory.tsx:126-131; app/src/renderer/components/Agent/PetrolChatHistory.tsx:164-171; app/src/renderer/components/Agent/PetrolChatHistory.tsx:222-233; app/src/renderer/utils/i18n/petrolChat.ts:64-79
Status: [OFFEN]
Sichtbar steht nur „Nur auf diesem Rechner“; dass die Ablage verschlüsselt ist, im Rechner-Backup liegen kann und wo die Aufbewahrung eingestellt wird, steht allein im `title` des Fußcontainers. Das ist auf Touch und für viele Bildschirmleser kein verlässlicher Informationsweg. Laden, Fehler und Nicht-speichern-Hinweise werden asynchron in gewöhnliche `div` gesetzt, ohne `role=status`/`alert` oder Live-Bereich; der leere Zustand besteht nur aus einem Satz. Bei `no-encryption`/`basic-text` kann der Footer sogar weiterhin wie eine positive Speicherzusage wirken.
Vorschlag: In einem sichtbaren Info-Aufklapper oder kompakten Hinweis „Verschlüsselt auf diesem Rechner · kann im Geräte-Backup sein · Aufbewahrung: Einstellungen“ anbieten; bei Speichersperre den positiven Speicherhinweis ersetzen. Laden und Leerzustand mit `role=status`, Fehler mit zurückhaltendem `role=alert` ansagen. Leeren Zustand mit „Neues Gespräch“ und einer knappen Erklärung, wann es hier erscheint, versehen.

### F13 — Mehrere nicht lesbare Einträge sind nicht unterscheidbar
Schwere: niedrig
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:86-92; app/src/renderer/components/Agent/PetrolChatHistory.tsx:195-215; app/src/renderer/utils/i18n/petrolChat.ts:72-73
Status: [OFFEN]
Bei einem nicht entschlüsselbaren Gespräch werden Titel und Tooltip durch denselben Text „Nicht lesbar“ ersetzt; die Zeile zeigt nur noch ein Kurzdatum bzw. eine Uhrzeit. Fallen mehrere defekte Gespräche auf denselben Tag und in dieselbe Minute, sind sie visuell und im `aria-label` der Löschen-Knöpfe gleich. Nutzer können dann kaum entscheiden, welchen Eintrag sie entfernen.
Vorschlag: Für solche Zeilen einen unterscheidbaren, unkritischen Zusatz anzeigen, etwa exakte lokale Zeit mit Sekunden plus kurzes ID-Ende, und denselben Zusatz in den zugänglichen Namen des Löschknopfs übernehmen; keine Inhaltsvorschau rekonstruieren.

### Runde 2 — Nachprüfung

- **F01 — [ADRESSIERT]:** Liste mit `overflow-x: hidden`, `min-width: 0` und stabilem Scrollgutter; der neue Screenshot zeigt keinen waagrechten Balken (`app/src/renderer/styles/index.css:23225-23226`, `:23253`).
- **F02 — [ADRESSIERT]:** 10-px-Zeilenaußenabstand, 2-px-Linkskante, 32-px-Mindesthöhe und Auswahlkante sind da; der Kopf behält seine passende Typografie (`app/src/renderer/styles/index.css:23229-23231`, `:23257-23265`).
- **F03 — [ADRESSIERT]:** „Alle löschen“ liegt im Kopfmenü, der Fuß enthält keine Löschaktion mehr (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:206-213`, `:371`). Menüfolgen siehe F20.
- **F04 — [ADRESSIERT]:** Ein eigener „Notizen“-Kopf trennt die Dateifilter sichtbar vom Gesprächsabschnitt (`app/src/renderer/components/Sidebar/Sidebar.tsx:611-616`).
- **F05 — [ABGEWANDELT, Nutzerentscheidung]:** Einzeilige Titel entsprechen dem Codex-Vorbild; eine Portal-Karte zeigt Titel und Metadaten (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:379-386`, `app/src/renderer/styles/index.css:23265`, `:23289-23295`). Offene Kartenprobleme siehe F18/F19.
- **F06 — [TEILWEISE]:** Gruppierung, Titelsuche ab 15 aktiven Gesprächen und begrenzter Scrollbereich sind umgesetzt (`app/src/renderer/utils/petrolChatGroups.ts:15-16`, `:34-50`, `app/src/renderer/components/Agent/PetrolChatHistory.tsx:282-297`, `app/src/renderer/styles/index.css:23226`). Archivsuche und Tagesgrenzen siehe F15/F16.
- **F07 — [TEILWEISE, Vorbild]:** Feste, verlaufene Pin-/Archiv-Knöpfe ersetzen das springende Raster; Menü enthält Umbenennen/Löschen (`app/src/renderer/styles/index.css:23267-23275`, `app/src/renderer/components/Agent/PetrolChatHistory.tsx:214-223`). Touch und 180 px siehe F21.
- **F08 — [ADRESSIERT]:** „Abbrechen“ erhält bei beiden Löschbestätigungen den Fokus, Umbenennen speichert bei Enter und verwirft bei Escape/Blur (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:273-279`, `:309-326`).
- **F09 — [TEILWEISE]:** Knöpfe/Felder im Abschnitt haben `:focus-visible` und 28-px-Icons (`app/src/renderer/styles/index.css:23239`, `:23275`, `:23288`); das Portal-Menü hat andere Fokusregeln, siehe F20 (`:23300-23302`).
- **F10 — [TEILWEISE]:** Kopf, Gruppen, Leerzustand und Infozeile nutzen `--text-secondary` statt `--text-muted` (`app/src/renderer/styles/index.css:23231`, `:23244-23245`, `:23255`). Der helle Standard liegt auf `--bg-chrome` noch knapp unter 4,5:1 (`:81-84`); dunkle Löschbestätigung siehe F23.
- **F11 — [ADRESSIERT]:** Der Verlauf wird auch ohne Vault montiert und zeigt dann den konkreten Nicht-speichern-Hinweis (`app/src/renderer/components/Sidebar/Sidebar.tsx:619-626`, `app/src/renderer/components/Agent/PetrolChatHistory.tsx:199-204`, `:271`).
- **F12 — [ADRESSIERT mit Einschränkung]:** Fehler/Status sind ausgezeichnet, der leere Zustand erklärt das Erscheinen, die Infozeile entfällt bei Speichersperre; Backup/Aufbewahrung sind über das Menü in den Einstellungen erreichbar (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:211-212`, `:271-292`, `:371`, `app/src/renderer/utils/i18n/petrolChat.ts:108-110`). Die Zeile selbst kürzt den Datenweg bewusst (`:81`).
- **F13 — [ADRESSIERT]:** Nicht lesbare Einträge erhalten sekundengenaue Zeit auch im Knopfnamen (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:133-135`, `:343`, `:350-353`).

### F14 — Archiviertes Anheften umgeht die Aufbewahrung dauerhaft
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:219-220; app/src/renderer/components/Agent/PetrolChatHistory.tsx:355-357; app/src/main/petrolChats/conversation.ts:487-490; app/src/main/petrolChats/storage.ts:294-299; app/src/shared/petrolChatStored.ts:78-81; app/src/main/petrolChats/storage.test.ts:346-353
Status: [OFFEN]
Ein angeheftetes Gespräch lässt sich direkt archivieren; `update` lässt `pinned` dabei unverändert. `cleanup` nimmt jedes angeheftete Gespräch von der Frist aus, auch wenn `archived` wahr ist. Damit bleibt ein archiviertes, aus der normalen Liste verschwundenes Gespräch unbegrenzt erhalten, obwohl Formatkommentar und Antwort zu Runde 1 sagen, Archiviertes laufe normal ab. Der Test prüft nur je ein *entweder* angeheftetes *oder* archiviertes Gespräch, nie beides zusammen.
Vorschlag: Beim Archivieren `pinned` explizit lösen oder die Ausnahme auf `pinned && !archived` beschränken; diese Produktentscheidung im UI benennen und mit einem Test für beide Merkmale absichern.

### F15 — Versteckte Suche filtert die Archiv-Ansicht weiter
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:65-66; app/src/renderer/components/Agent/PetrolChatHistory.tsx:106-108; app/src/renderer/components/Agent/PetrolChatHistory.tsx:208-210; app/src/renderer/components/Agent/PetrolChatHistory.tsx:234; app/src/renderer/components/Agent/PetrolChatHistory.tsx:282-292; app/src/renderer/utils/petrolChatGroups.ts:34-38
Status: [OFFEN]
Der Suchwert bleibt beim Wechsel ins Archiv erhalten, `groupConversations` wendet ihn dort weiter an, aber `showSearch` blendet das Eingabefeld im Archiv aus. Ein Archiv mit Einträgen kann so „Kein Gespräch passt“ zeigen, obwohl der Nutzer den wirksamen Filter dort weder sieht noch löschen kann. Zugleich bekommen 50 archivierte Gespräche nie eine Suche, selbst wenn die aktive Liste kurz ist.
Vorschlag: Suche in beiden Ansichten anzeigen, sobald die jeweilige oder gesamte Gesprächszahl mindestens 15 beträgt, und den Filter sichtbar halten; alternativ beim Ansichtswechsel `query` zurücksetzen. „Kein Treffer“ muss einen sichtbaren „Suche löschen“-Weg haben.

### F16 — Datumsgruppen kippen nicht um Mitternacht und versagen an Zeitumstellungen
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:106; app/src/renderer/utils/petrolChatGroups.ts:18-23; app/src/renderer/utils/petrolChatGroups.ts:40-50; app/src/renderer/utils/petrolChatGroups.test.ts:7-27
Status: [OFFEN]
`Date.now()` steht innerhalb eines `useMemo`, dessen Abhängigkeiten nur Liste, Ansicht und Suche sind. Bleibt die Sidebar über Mitternacht offen, bleiben „Heute“ und „Gestern“ bis zur nächsten Listenänderung falsch. Außerdem berechnet die Gruppierung „Gestern“ und „Letzte 7 Tage“ durch Subtraktion fester 24-Stunden-Blöcke von lokaler Mitternacht; nach der Herbst-Zeitumstellung fällt z. B. 00:30 Uhr des Vortags aus „Gestern“. Die Tests enthalten keine Zeitumstellung.
Vorschlag: Einen lokalen Tages-Schlüssel zustandsgeführt an der nächsten Mitternacht aktualisieren; Grenzen per Kalenderdatum (`setDate`) statt Millisekundenabzug bilden. Tests für Tageswechsel und beide Sommerzeitumstellungen ergänzen.

### F17 — Alte Vault-Titel können nach einem Wechsel kurz wieder erscheinen
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:74-104; app/src/renderer/components/Agent/PetrolChatHistory.tsx:106; app/src/renderer/components/Agent/PetrolChatHistory.tsx:269-294
Status: [OFFEN]
Die Sequenznummer steigt nur bei `load()`. Beim Vault-Wechsel setzt der Effekt zwar `items` auf `null`, invalidiert aber eine bereits laufende Listenanfrage nicht. War die Liste beim Wechsel zugeklappt, startet keine neue Anfrage; die alte Antwort kann danach die alten Titel wieder in `items` setzen. Beim nächsten Aufklappen werden sie bis zur neuen Antwort unter dem neuen Vault gezeigt. Das ist eine konkrete, wenn auch vorübergehende, Vault-übergreifende Anzeige von Gesprächstiteln.
Vorschlag: Beim Vault-Wechsel `loadSeq.current` erhöhen und Titel mit dem Vault-Schlüssel koppeln; während der neuen Anfrage keine Einträge eines anderen Vaults rendern. Den Ablauf „alte Anfrage läuft → Wechsel bei geschlossener Liste → alte Antwort → öffnen“ gezielt testen.

### F18 — Detailkarte kann am Fensterboden oder rechten Rand abgeschnitten sein
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:185-197; app/src/renderer/components/Agent/PetrolChatHistory.tsx:294; app/src/renderer/components/Agent/PetrolChatHistory.tsx:379-386; app/src/renderer/styles/index.css:23289-23295
Status: [OFFEN]
Das Portal vermeidet den alten Scroll-Clip; im Screenshot steht die Karte gut lesbar neben der Sidebar. Ihre Position wird jedoch einmalig aus Zeilenoberkante und Sidebar-Rechtskante gesetzt, ohne Kartenhöhe/-breite gegen `innerHeight`/`innerWidth` zu prüfen. Bei einer Zeile nahe dem unteren Fensterrand oder einem schmalen Fenster läuft die Karte aus dem sichtbaren Bereich. Scrollen *der Gesprächsliste* schließt sie; Größenänderung, sonstiges Scrollen und Escape tun das nicht. Ein offener Hover-Timer wird beim Öffnen eines Menüs ebenfalls nicht gelöscht.
Vorschlag: Kartenmaß nach dem Rendern ermitteln und X/Y in den Viewport klemmen, bei fehlendem Platz links/rechts bzw. oberhalb platzieren; auf Resize, relevante Scrolls, Escape und Menüöffnung Timer/Karte schließen. Gegenprobe bei unterster Zeile, 180-px-Sidebar und kleinem Fenster.

### F19 — Metadaten und Fehlerhinweis kommen beim Bildschirmleser zu spät oder gar nicht
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:133-135; app/src/renderer/components/Agent/PetrolChatHistory.tsx:185-192; app/src/renderer/components/Agent/PetrolChatHistory.tsx:331-343; app/src/renderer/components/Agent/PetrolChatHistory.tsx:379-385
Status: [OFFEN]
Der vollständige Titel ist als Text des Öffnen-Knopfs bereits zugänglich. Datum, Modell und der Fehlerhinweis kommen jedoch erst mit der Karte: nach 450 ms Hover bzw. einem `setTimeout(0)` bei `:focus-visible` erhält der Knopf `aria-describedby`. Bildschirmleser können den Fokus schon angesagt haben, bevor diese Beschreibung existiert, und melden nachträglich eingefügte Beschreibungen nicht verlässlich erneut. Nicht lesbare Zeilen haben zudem einen deaktivierten Öffnen-Knopf; ihr erklärender Text steht nur in der Hover-Karte, die per Tastatur auf diesem Knopf nie erscheint.
Vorschlag: Datum/Modell und bei defekten Einträgen den Grund in dauerhaft vorhandenen, visuell versteckten Beschreibungselementen je Zeile bereitstellen und `aria-describedby` stabil setzen. Die Portal-Karte bleibt rein visuelle Ergänzung; der Löschknopf defekter Zeilen braucht ebenfalls die Erklärung.

### F20 — Menü verliert beim Schließen und Scrollen seinen Bezug zur Zeile
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:118-126; app/src/renderer/components/Agent/PetrolChatHistory.tsx:138-146; app/src/renderer/components/Agent/PetrolChatHistory.tsx:294; app/src/renderer/components/Agent/PetrolChatHistory.tsx:375-378; app/src/renderer/components/Agent/PetrolChatHistory.tsx:406-439; app/src/renderer/styles/index.css:23300-23302
Status: [OFFEN]
Das Portal-Menü wird beim Öffnen korrekt fokussiert, bietet Pfeiltasten und bleibt im Fenster; der Screenshot bestätigt die visuelle Position. `Tab` *und* `Shift+Tab` werden aber verhindert und setzen den Fokus auf den Auslöser zurück, statt die normale Tab-Reihenfolge fortzusetzen. Ein Mausklick außerhalb entfernt das Menü ohne Fokus-Rückgabe. Scrollt die Gesprächsliste mit geöffnetem Kontextmenü, bleibt es an den alten festen Koordinaten, während seine Zeile wandert; nur die Hover-Karte wird bei `onScroll` geschlossen. Außerdem überschreibt die Menü-CSS `:focus-visible` mit `outline: none` und zeigt nur eine leichte Hintergrundfarbe.
Vorschlag: Bei Tab Menü schließen und Fokus in der gewählten Richtung weiterziehen lassen; beim Klick außerhalb den tatsächlich angeklickten Fokusort respektieren. Menü bei Listen-Scroll/Resize schließen oder neu verankern. Für Menüeinträge einen klaren `--focus-ring` ergänzen.

### F21 — Überlagerte Aktionen bleiben bei Touch unsichtbar und engen 180 px stark ein
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:331-360; app/src/renderer/styles/index.css:23257-23275; app/src/renderer/App.tsx:1091-1095
Status: [OFFEN]
Der stabile Verlauf über dem Titelende trifft das freigegebene Vorbild. Es gibt aber keine `@media (hover: none)`-Variante: Die Aktionsleiste hat `opacity: 0` und `pointer-events: none`, bis Hover oder Tastaturfokus auf der Zeile entsteht. Ein Touch auf den Titel öffnet das Gespräch, statt die Aktionen freizulegen. Bei 180 px Sidebarbreite beanspruchen Verlaufspolster und zwei 28-px-Knöpfe etwa 74 px am Zeilenende; von langen Titeln bleibt beim Überfahren kaum etwas übrig.
Vorschlag: Auf Geräten ohne Hover einen stets sichtbaren Mehr-Knopf als Zugang zu Anheften/Archivieren/Umbenennen/Löschen anbieten. Bei unter 240 px Breite ebenfalls auf einen Knopf reduzieren; die Detailkarte muss den Volltitel unabhängig davon zeigen.

### F22 — Archivieren des aktuellen Gesprächs lässt es offen, aber aus der Liste verschwinden
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:79; app/src/renderer/components/Agent/PetrolChatHistory.tsx:106-108; app/src/renderer/components/Agent/PetrolChatHistory.tsx:155-160; app/src/renderer/components/Agent/PetrolChatHistory.tsx:349-357; app/src/renderer/utils/petrolChatGroups.ts:34-40; app/src/main/petrolChats/conversation.ts:487-490; app/src/main/petrolChats/conversation.ts:614
Status: [OFFEN]
Ein Klick auf „Archivieren“ setzt nur das Merkmal; er schließt das aktuelle Gespräch nicht. `groupConversations` entfernt es aus der normalen Liste, während der Chat rechts weiter offen bleibt und spätere Nachrichten mit `archived: true` gespeichert werden. Der Nutzer sieht dann kein markiertes aktuelles Gespräch mehr und erhält beim Schreiben keinen Hinweis, dass es weiterhin archiviert ist. Im Archiv ist es wieder auffindbar, doch der Weg liegt im Kopfmenü.
Vorschlag: Für das aktuelle Gespräch beim Archivieren entweder bewusst einen neuen Chat öffnen oder in Kopf/Fuß deutlich „Archiviert“ mit direktem „Wiederherstellen“ anzeigen. Das Verhalten auch bei einer laufenden Antwort festlegen und testen.

### F23 — Dunkle Löschbestätigung hat zu wenig Textkontrast
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:47; app/src/renderer/styles/index.css:135; app/src/renderer/styles/index.css:23282; app/src/renderer/styles/index.css:23302
Status: [OFFEN]
Die neue Bestätigung setzt fest `#fff` auf `--color-danger`. Hell ist das mit `#dc2626` ausreichend (etwa 4,8:1); dunkel wird `--color-danger` zu `#ff6b6b`, auf dem Weiß nur etwa 2,8:1 erreicht. Gerade der 12-px-Löschknopf verliert so seine Beschriftung. Die roten Menütexte auf neutralem Hintergrund sind davon nicht betroffen.
Vorschlag: Einen themenabhängigen `--danger-on`-Token einführen (dunkel z. B. `#1a1a1a` auf `#ff6b6b`, etwa 6,3:1) oder die dunkle Gefahrfläche abdunkeln; beide Bestätigungen in beiden Themes nachmessen.

### F24 — Altes Speicherformat und neue Merkmale teilen dieselbe Versionsnummer
Schwere: mittel
Stelle: app/src/shared/petrolChatStored.ts:30; app/src/shared/petrolChatStored.ts:131-150; app/src/shared/petrolChatStored.ts:267-278; app/src/shared/petrolChatStored.ts:412-417; app/src/main/petrolChats/storage.ts:157-168; app/src/main/index.ts:7512-7520
Status: [OFFEN]
`pinned` und `archived` sind neue optionale Felder in einem weiterhin als Version 1 gespeicherten, streng auf bekannte Schlüssel geprüften Schema. Ein älterer Build mit dem vorherigen Version-1-Schema wird eine Datei mit diesen Feldern als „nicht lesbar“ einstufen; die Liste bietet solche Einträge weiterhin zum Löschen an. Das betrifft vor allem Downgrades zwischen Vorabständen mit bereits vorhandenem Chat-Verlauf, nicht ältere Releases ohne diese Funktion.
Vorschlag: Formatversion erhöhen und Lesepfad für beide Versionen vorsehen oder eine ausdrückliche Downgrade-Sperre für bereits mit neuen Merkmalen geschriebene Gespräche einführen; mindestens das Verhalten in Migrationshinweis und Test festhalten.

### F25 — Fehlgeschlagenes Anheften/Archivieren wird im UI als Erfolg behandelt
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:155-160; app/src/main/index.ts:7537-7556; app/src/main/petrolChats/conversation.ts:482-490; app/src/main/petrolChats/conversation.ts:606-624
Status: [OFFEN]
`conversation.update` ändert zuerst die offene Kopie und liefert bei einem Schreibfehler `{ ok: true, storage: 'failed' }`. Der IPC gibt diesen Zustand weiter, aber die UI prüft nur `r.ok` und lädt die Liste neu, ohne den Speicherfehler zu zeigen. Bei einem nicht offenen Gespräch wird die temporär geöffnete Kopie danach geschlossen; die Änderung ist verloren. Bei einem offenen Gespräch bleibt das Merkmal im Main-Speicher und kann erst mit einer späteren Nachricht doch noch auf der Platte landen. Beide Varianten widersprechen der angezeigten unmittelbaren Aktion.
Vorschlag: `storage === 'failed'` als sichtbaren Fehler behandeln und keine erfolgreiche Zustandsänderung suggerieren; bei dauerhaftem Fehler offene Metadaten entweder zurückrollen oder als ungespeichert kennzeichnen. Fehlerpfad für Titel, Pin und Archiv testen.

### F26 — Metadatenänderung in anderem Fenster aktualisiert dessen Liste nicht
Schwere: mittel
Stelle: app/src/main/index.ts:7537-7556; app/src/renderer/components/Agent/PetrolChatHistory.tsx:79-101; app/src/renderer/components/Agent/PetrolChatHistory.tsx:155-160; app/src/main/index.ts:7601-7606
Status: [OFFEN]
Der neue IPC ändert bei einem anderswo offenen Gespräch dessen Main-Kopie und speichert sie. Anders als beim Löschen sendet er kein Ereignis an das Besitzerfenster. Dessen Seitenleistenliste lädt nur beim Öffnen, Wechsel des aktuellen Gesprächs, neuer Nachricht oder Streamingwechsel neu. Pin, Archiv und Titel können in einem anderen Fenster daher sichtbar veraltet bleiben, bis zufällig eine dieser Änderungen eintritt.
Vorschlag: Nach erfolgreichem Update ein knappes `petrol-conv-changed` mit Vault-/Gesprächs-ID an betroffene Fenster senden und dort nur die Liste neu laden; dabei die Vault-Bindung und laufende Listenanfragen beachten.

### Nutzerfreigabe für Claude

Der Nutzer hat die neue Kennzeichnung des aktiven Gesprächs ohne grüne Seitenkante abgenommen („ja passt ist wirklich gut geworden“) und anschließend ausdrücklich gebeten: „sage Claude das er committen kann“. **Claude kann den aktuellen Stand dieses Seitenleisten-Strangs committen.** Eine Push-Freigabe wurde nicht erteilt.

## Claude-Antwort

### Runde 1 (05.11.2026)

Alle 13 Befunde habe ich gegen den Code geprüft, sie tragen. Danach schickte der Nutzer ein
Vorbild, die Gesprächsliste der Codex-App: eine Zeile je Gespräch, nur der Titel, beim Überfahren
„Anheften“ und „Archivieren“, Details in einer Karte daneben. Er wünscht dazu Anheften und
Archivieren. Wo ein Befund und das Vorbild auseinandergehen, gilt das Vorbild (Nutzer
freigegeben). Außerdem meldete der Nutzer, dass der Tooltip nicht lesbar ist: Die App macht aus
jedem `title` einen `::after`-Tooltip (`App.tsx:354`, `index.css:216`), und den schnitt der
Scrollbereich ab. Die Liste nutzt jetzt kein `title` mehr.

- **F01 [ADRESSIERT]** `overflow-x: hidden`, `scrollbar-gutter: stable`, `min-width: 0` an
  Abschnitt, Liste und Zeile. In der App gemessen: kein waagrechter Überlauf.
- **F02 [ADRESSIERT]** Zeilen im Raster des Dateibaums: `margin: 1px 10px`, 2-px-Linkskante,
  `min-height: 32px`. Das aktuelle Gespräch hat eine dezente Fläche und eine Akzentkante links.
- **F03 [ADRESSIERT]** Das Menü „…“ im Kopf enthält „Archivierte anzeigen (n)“, „Speicherung und
  Aufbewahrung …“ und „Alle löschen“ (rot). Unter der Liste steht nur noch eine Infozeile ohne
  Aktion.
- **F04 [ADRESSIERT]** Mit sichtbaren Gesprächen hat der Dateibaum den Kopf „Notizen“
  (`Sidebar.tsx`).
- **F05 [ABGEWANDELT, Vorbild]** Einzeilige Titel ohne Datum. Voller Titel, Datum, Modell und
  „Angeheftet“ stehen in einer Karte neben der Seitenleiste (Portal, `role=tooltip`,
  `aria-describedby`). Sie erscheint nach 450 ms Hover oder sofort beim Tastaturfokus.
- **F06 [ADRESSIERT]** Gruppen „Angeheftet“, Heute, Gestern, Letzte 7 Tage, Älter
  (`renderer/utils/petrolChatGroups.ts`, getestet, lokale Mitternacht). Suche nach Titel ab 15
  Gesprächen. Höhe `min(36vh, 360px)`.
- **F07 [ABGEWANDELT, Vorbild]** Beim Überfahren oder Fokus erscheinen zwei Knöpfe an fester
  Stelle über dem Titelende (mit Verlauf, nichts springt): Anheften und Archivieren, in der
  Archiv-Ansicht Wiederherstellen und Löschen. Umbenennen und Löschen liegen im Menü (Rechtsklick,
  Kontextmenü-Taste, Umschalt+F10). Klickflächen 28 × 28 px.
- **F08 [ADRESSIERT]** Bestätigungen fokussieren zuerst „Abbrechen“. Umbenennen übernimmt nur mit
  Enter, Escape und Fokusverlust verwerfen.
- **F09 [ADRESSIERT]** `:focus-visible`-Ring mit `--focus-ring` auf allen Knöpfen und Feldern,
  Kopfknöpfe 28 × 28 px. Das Menü lässt sich mit den Pfeiltasten bedienen, Escape gibt den Fokus
  zurück.
- **F10 [ADRESSIERT]** Kleinschrift in `--text-secondary` statt `--text-muted`, Hinweise 12 px.
- **F11 [ADRESSIERT]** Ohne Vault steht der Abschnitt in der leeren Seitenleiste und sagt, dass
  nicht gespeichert wird.
- **F12 [ADRESSIERT]** Hinweise mit `role=status`, Fehler mit `role=alert`. Der leere Zustand
  erklärt, wann Gespräche erscheinen. Speicherort und Aufbewahrung führen über das Menü in die
  Einstellungen. Die Infozeile entfällt, wenn nicht gespeichert wird.
- **F13 [ADRESSIERT]** Nicht lesbare Einträge zeigen die genaue Zeit mit Sekunden, auch im
  zugänglichen Namen.

**Anheften und Archivieren (Nutzerentscheidung 05.11.2026):** Kopf des Speicherformats um
`pinned`/`archived` erweitert (optional, alte Dateien bleiben gültig). Eine ältere App-Version
würde eine Datei mit diesen Feldern als „nicht lesbar“ ansehen. Neuer IPC `petrol-conv-update`
(Titel, Anheften, Archivieren; ändert die offene Kopie, F89). Angeheftete Gespräche läuft die
Aufbewahrung nicht ab (`storage.cleanup`, Test), archivierte schon. Tests: Datenformat, Aufbewahrung,
`update`, Gruppierung.

In der App geprüft (Testprofil, 17 Gespräche, eins angeheftet, eins archiviert):
- Gruppen, Suche, kein waagrechter Überlauf, Hover-Karte, Rechtsklick-Menü mit Fokus.
- Kopfmenü, Archiv-Ansicht, Auf-/Zuklappen über das Neuladen hinweg.
- Beim Prüfen gefunden: Die Infozeile schrumpfte bei voller Liste auf Höhe 0. Jetzt schrumpft
  nur die Liste.

`npm run test` 3413 grün, rot nur `shellExecution.test.ts` (bekannt). typecheck und build
sauber. Nicht geprüft: Dunkelmodus in der App, schmale Seitenleiste (180 px), Bildschirmleser.

### Runde 2 (05.11.2026)

Alle 13 neuen Befunde habe ich gegen den Code geprüft. Zwölf tragen, F24 nicht. Der Nutzer hat die
Empfehlung freigegeben. Zur Nutzermeldung „Archivieren funktioniert nicht“: Ursache war die
laufende Dev-App mit dem alten Main-Prozess. `electron-vite dev` startet Main und Preload bei
Änderungen nicht neu, `petrol-conv-update` gab es dort nicht. Der Knopf scheiterte aber still,
das behebt F25.

- **F14 [ADRESSIERT]** Archivieren löst das Anheften (`update`). `cleanup` nimmt nur
  „angeheftet und nicht archiviert“ aus (Tests: `update` und alte Datei mit beiden Merkmalen).
- **F15 [ADRESSIERT]** Der Ansichtswechsel leert die Suche. Das Archiv hat ab 15 Einträgen eine
  eigene Suche.
- **F16 [ADRESSIERT]** Grenzen über das Kalenderdatum (`startOfDay(t, daysBack)` mit `setDate`).
  Ein Timer zur nächsten Mitternacht gruppiert neu. Tests mit Herbst- und Frühjahrsumstellung
  (`TZ=Europe/Berlin`).
- **F17 [ADRESSIERT]** Ein Vault-Wechsel erhöht `loadSeq`, eine späte Antwort des alten Vaults
  landet nicht mehr.
- **F18 [ADRESSIERT]** `HoverCard` misst sich nach dem Zeichnen und bleibt im Fenster: zu tief →
  oberhalb der Zeilenunterkante, zu breit → rechtsbündig. Sie schließt bei Escape, beim Ändern
  der Fenstergröße und beim Öffnen eines Menüs. In der App geprüft: Position und Escape. Den
  unteren Rand nicht ausgelöst, weil die Liste kurz war.
- **F19 [ADRESSIERT]** Unsichtbare Beschreibung je Zeile (`petrol-hd-<id>`: Datum, Modell,
  angeheftet, Grund bei „nicht lesbar“), `aria-describedby` dauerhaft gesetzt, auch am Löschknopf
  nicht lesbarer Zeilen. Die Karte ist `aria-hidden`.
- **F20 [ADRESSIERT]** Tab und Umschalt+Tab schließen das Menü und gehen vom Auslöser aus in der
  normalen Reihenfolge weiter (`focusNextFrom`). Scrollen der Liste schließt das Menü, die
  Einträge haben einen Fokusring.
- **F21 [TEILWEISE]** Bei `hover: none` sind die Knöpfe immer sichtbar. Für eine 180 px schmale
  Seitenleiste gibt es keine Sonderform. Die Karte zeigt dort den vollen Titel.
- **F22 [ADRESSIERT]** Archivieren des offenen Gesprächs startet ein neues. In der App geprüft.
- **F23 [ADRESSIERT]** Token `--danger-on` (hell `#fff`, dunkel `#1a1a1a`) für Text auf der
  Gefahrfläche.
- **F24 [ABGELEHNT]** Teil 1 ist noch nicht veröffentlicht. Kein ausgelieferter Build hat je
  Gespräche gespeichert, also gibt es kein früheres Version-1-Format, auf das eine ältere App
  träfe. Version 1 ist dieses Format.
- **F25 [ADRESSIERT]** `update` meldet `ok: false`, `storage: 'failed'` und Ausnahmen sichtbar
  („Die Änderung wurde nicht gespeichert.“).
- **F26 [ADRESSIERT]** `petrol-conv-changed` an alle Fenster nach Update, Löschen und „Alle
  löschen“. Jedes Fenster lädt die Liste seines Vaults neu.
- Prüfung: `npm run test` 3419 grün (alle), typecheck und build sauber.

## Status

05.11.2026: angelegt, Design-Prüfung durch Codex (F01–F13). Runde 2 (F14–F26) umgesetzt, F24
abgelehnt. Offen: Nutzerabnahme. Umgesetzt mit Vorbild Codex-App sowie
Anheften und Archivieren. Offen: Nutzerabnahme.
