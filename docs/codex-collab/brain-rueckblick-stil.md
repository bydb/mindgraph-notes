# Brain-Rückblick: Seite wirkt stilistisch anders als der Rest der App

## Aufgabe

Der Nutzer: „Die Seite wirkt stilistisch unpassend im Vergleich zum Rest der App.“ Gemeint ist der
Brain-Rückblick (Leiste „Brain“ → „Rückblick“). **Entwurfs-Review, kein Code-Review** — es gibt
noch keine Änderung. Codex soll (a) Claudes Beobachtungen gegen Code und Bild prüfen, (b) eigene
Stilbrüche finden, die fehlen, (c) den Vorschlag angreifen und eine klare Empfehlung geben.

Bild: `/private/tmp/claude-502/-Users-jochenleeder-dev-mindgraph-notes/4469f2a1-34a8-416c-9aa9-17bd274ce86f/scratchpad/brain-rueckblick.png`
(Dev-App, 1920 × 1200, Brain allein).

**Feste Randbedingung (nicht verhandelbar, Nutzerentscheidung 06/2026 und 08/2026):** Der
Rückblick spricht in **Klartext-Sätzen** mit anklickbaren Stellen. Das ist der Teil, der beim
Nutzer ankam („Brain soll reden, nicht malen“). Vorschläge, die die Sätze durch Diagramme,
Kachel-Wände oder Listen von allem ersetzen, sind falsch. Es geht um die **Form**, nicht um den Inhalt.
Ebenso: keine Emojis in selbst gebauter UI, SVG-Icons; ruhige Karten ohne Streifen/Tints/Schatten.

## Kontext/Anker

- Markup: `app/src/renderer/components/Canvas/BrainConstellation.tsx:356-381` (Werkzeugzeile:
  Segment-Schalter + Monatswahl), `:426-449` (Rückblick-Text).
- Stile: `app/src/renderer/styles/index.css:22662-22711` (Werkzeugzeile, `.bc-seg`, `.bc-nav`),
  `:22811-22828` (`.bc-digest*`, `.bc-link`, `.bc-toggle-graph`).
- Vergleich Dashboard-Kopf: `app/src/renderer/components/DashboardPanel/DashboardView.css:10-30`
  (Titel 22 px/700, Abstand 22 px 32 px, Datum darunter, linksbündig).
- Vergleich Agent-Tab: `app/src/renderer/components/Agent/` (Kopf: Logo-Kachel + Titel + Unterzeile
  links, Segment-Schalter „Chat | Auftrag“ rechts).
- Geteilte Bausteine: `.panel-card`, `.panel-dot`, `PanelHeader` (`components/Shared/PanelHeader.tsx`,
  Regeln in `styles/index.css` vor `.inbox-panel-header`); Kennzahlen-Zeile der Antwortkarten
  `components/**/VoiceCommandPanel.css` (`voice-card-stats/-block/-row`).

### Beobachtungen von Claude

- **S1 Schrift viel größer als überall sonst.** Fließtext 1.16 rem, Einstiegssatz 1.3 rem,
  Überschrift 1.7 rem (`index.css:22814-22816`) — der Rest der App arbeitet mit 13 px Text und
  22 px Seitentiteln. Die Seite liest sich wie eine Landingpage, nicht wie ein Arbeitsbereich.
- **S2 Schwebende Mittelspalte.** 640 px mittig, oben `clamp(2rem, 7vh, 5rem)` Luft, darunter
  zwei Drittel leere weiße Fläche. Dashboard und Agent beginnen links oben mit einem Seitenkopf.
- **S3 Doppelter Titel.** „November 2026“ mit Brain-Symbol steht rechts in der Werkzeugzeile
  (`BrainConstellation.tsx:376`) und direkt darunter nochmal als „Dein November 2026“ mit
  Brain-Symbol (`:428`).
- **S4 Eigene Bedienelemente.** Monatspfeile sind Textzeichen „◂ ▸“ in gerahmten Kästchen
  (`:375,377`) statt SVG-Icons; Segment-Schalter hat eigene Klassen `.bc-seg*` neben dem des
  Agent-Tabs.
- **S5 Kein Seitenkopf nach App-Muster.** Kein Logo/Titel/Unterzeile links wie bei Agent und
  Dashboard; stattdessen eine schmale Werkzeugzeile (8 px Polster).
- **S6 Zahlen stecken nur im Fließtext.** „8 Tage“, „80 Notizen“, „7 Notizen am dichtesten Tag“
  stehen fett in Sätzen; andere Auswertungen der App (Tagesbilanz-Karte, Leistungsauswertung)
  führen mit einer ruhigen Kennzahlen-Zeile und erklären darunter.
- **S7 Ton.** „war richtig viel los“, „Ruhiger war's“, „kam es wieder hoch“ ist deutlich
  salopper als der Rest der App (Zielgruppe seit 10/2026: Bildung, Verwaltung, Mittelstand).
- **S8 Doppelte Wege.** „Zeitstrahl anzeigen →“ unter dem Text (`:447`) wiederholt den
  Segment-Schalter oben.
- **S9 Hart codierte deutsche Sätze** im Markup (`:429-446`) statt `t()` — englische Oberfläche
  zeigt deutschen Rückblick.

### Vorschlag von Claude (zum Angreifen)

1. **Seitenkopf wie Dashboard/Agent**: links Brain-Kachel + Titel „Rückblick“ + Unterzeile
   „November 2026“; rechts Monatswahl (SVG-Pfeile, „Heute“) und der Segment-Schalter. Die
   schmale Werkzeugzeile und die zweite Überschrift entfallen (S3, S5).
2. **Inhalt linksbündig im Seitenraster** (gleiches Polster wie Dashboard, max. ca. 720 px
   Lesebreite), Text 15 px/1.6, Einstiegssatz 17 px; keine 21-px-Schrift (S1, S2).
3. **Ruhige Kennzahlen-Zeile** über den Sätzen: „8 Tage · 80 Notizen · dichtester Tag 7. Nov.“
   — die Sätze bleiben vollständig darunter (S6). Kein Diagramm.
4. **Sätze in einer ruhigen Karte** (`.panel-card`-Fläche) oder ganz ohne Karte, aber im Raster —
   offen, siehe Frage.
5. Unteren Link „Zeitstrahl anzeigen →“ entfernen (S8).
6. Ton leicht glätten („war am meisten los“, „Ruhiger war es am …“) und Sätze über `t()` (S7, S9).

**Fragen an Codex:**

- Karte um die Sätze oder nicht? Was passt besser zum Rest (Dashboard-Widgets sind Karten, der
  Agent-Chat ist frei)?
- Ist die große Schrift vielleicht Absicht („die App spricht“) und sollte nur gemäßigt statt
  angeglichen werden? Wo liegt die Grenze?
- Trifft die Split-Ansicht (Rückblick rechts, schmal, ca. 45 % Breite) der Vorschlag gut, oder
  bricht der Seitenkopf dort?
- Was davon ist der kleinste Schritt mit der größten Wirkung?

## Codex-Findings

### F01 — S1 ist im Vergleich richtig, die Zahlen im Vorschlag sind es nicht
Schwere: mittel
datei:zeile: `app/src/renderer/styles/index.css:189-198,22811-22817`; `app/src/renderer/components/DashboardPanel/DashboardView.css:20-30`; `app/src/renderer/styles/index.css:21521,21618-21619`
Status: [OFFEN]
Der Rückblick ist größer als typische 13-px-Arbeitsoberflächen, aber `rem` bezieht sich hier auf die Browser-Wurzel (16 px), nicht auf `body` (13 px): 1,16 rem ≈ 18,6 px Fließtext, 1,3 rem ≈ 20,8 px Einstieg, 1,7 rem ≈ 27,2 px Titel. Dashboard-Titel 22 px, Agent-Titel 19 px und Agent-Eingabetext 15 px. Claudes 15/17 px würden die erzählerische Hierarchie fast entfernen; S1 ist als Diagnose brauchbar, „wie überall sonst“ ist überzogen.
Vorschlag: Titel auf 22–23 px, Fließtext auf 16–17 px und Einstieg auf 18 px mit etwa 1,55–1,65 Zeilenhöhe senken. Die Sätze als lesbare Stimme erhalten, nicht auf 13 px Modultext drücken.

### F02 — S2 unterschätzt den Unterschied zwischen Lesespalte und Platzierung
Schwere: mittel
datei:zeile: `app/src/renderer/styles/index.css:22811-22813,21512-21518,21544-21550`; `app/src/renderer/components/DashboardPanel/DashboardView.css:10-17,60-64`
Status: [OFFEN]
Das Bild bestätigt die große Luft über einer mittigen 640-px-Spalte. Eine begrenzte Lesebreite ist aber kein Fremdkörper: Auch der Agent begrenzt Inhalte auf 780 px und zentriert sie. Der Bruch ist vor allem, dass Brain **nach** einer schmalen Toolbar erneut weit unten beginnt, während Dashboard und Agent ihren Kopf im Inhaltsfluss oben haben. „Links bündig“ über die ganze breite Canvas-Fläche würde den Text unnötig strecken.
Vorschlag: Kopf an den oberen Seitenrand, Text darunter in einer begrenzten 680–760-px-Lesespalte im Seitenraster. Bei breiter Ansicht darf diese Spalte zentriert oder am Raster ausgerichtet sein; der harte 7-vh-Oberabstand sollte entfallen.

### F03 — S3/S5: Seitenkopf ja, aber nicht den PanelHeader kopieren
Schwere: mittel
datei:zeile: `app/src/renderer/components/Canvas/BrainConstellation.tsx:356-381,426-429`; `app/src/renderer/components/DashboardPanel/DashboardView.tsx:346-359`; `app/src/renderer/components/Agent/AgentView.tsx:598-629`; `app/src/renderer/components/Shared/PanelHeader.tsx:1-10,59-95`; `app/src/renderer/styles/index.css:11670-11710`
Status: [OFFEN]
S3 stimmt: Monat und Brain-Symbol erscheinen zweimal. S5 stimmt für den fehlenden Seitenkopf. Die drei Referenzen sind aber keine einheitliche Kopf-Komponente: Dashboard hat einen 22-px-Seitentitel und Datum, Agent eine 44-px-Logo-Kachel und eigenen Umschalter, Inbox/PanelHeader einen nur 44 px hohen, schließbaren Modulstreifen mit 14-px-Label. Brain ist eine Hauptansicht; `PanelHeader` wäre dafür zu klein und semantisch falsch. Eine zusätzliche Brain-Kachel nach Agent-Muster könnte wieder dekorativ wirken.
Vorschlag: Dashboard-Muster als Ausgangspunkt: „Rückblick“ links, Monat als Unterzeile, Steuerung rechts. Ein kleines Brain-SVG genügt; die zweite Monatsüberschrift und das zweite Symbol entfallen. Zeitstrahl und Rückblick verwenden denselben Kopf.

### F04 — S4: Pfeile sind fremd, Segment-Schalter nicht zwingend
Schwere: niedrig
datei:zeile: `app/src/renderer/components/Canvas/BrainConstellation.tsx:359-380`; `app/src/renderer/styles/index.css:22675-22711,23244-23275`; `app/src/renderer/components/Agent/AgentView.tsx:613-627`; `app/src/renderer/components/Shared/PanelHeader.tsx:21-32`
Status: [OFFEN]
Die Textzeichen ◂/▸ statt SVG und die 26-px-Monatsknöpfe weichen vom gerahmten 28-px-Iconbutton der Panels ab. Dagegen ist `.bc-seg` nicht schon deshalb falsch, weil Agent `.agent-mode-switch` hat: Auch der Agent verwendet eine eigene Control-Familie für seinen Hauptansichtswechsel. Zudem ist „Ganzer Graph“ in Brain **eine Aktion, kein Zustand dieses Schalters**: Der Knopf ruft `setBrainLensActive(false)` auf und ist nie `.active`. Die eigene Code-Kommentierung „Label = Zustand, nie Aktion“ trifft für dieses dritte Element nicht zu.
Vorschlag: SVG-Chevrons mit 28–32-px-Trefferfläche und Fokuszustand; Rückblick/Zeitstrahl als echten Zwei-Zustands-Schalter lassen, „Ganzer Graph“ als getrennte Aktion anordnen. Keine pauschale Wiederverwendung des Agent-Umschalters erzwingen.

### F05 — S6: Kennzahlenzeile würde falsche Präzision und Dopplung schaffen
Schwere: hoch
datei:zeile: `app/src/renderer/components/Canvas/BrainConstellation.tsx:172-215,428-445`; `app/src/renderer/components/DashboardPanel/DashboardView.css:116-144`; `app/src/renderer/components/CommandPalette/VoiceCommandPanel.css:135-177`
Status: [OFFEN]
S6 stimmt nur deskriptiv: Die Zahlen stehen im Satz. Das ist bei einem sprechenden Rückblick gemäß Randbedingung sinnvoll. `totalTouched` addiert Tageswerte beziehungsweise Linkzahlen; „80 Notizen“ ist also nicht notwendig die Zahl **verschiedener** Notizen. `densest` wird nach ausgehenden Links bestimmt, nicht nach `notes_touched`. Die vorgeschlagene Zeile „8 Tage · 80 Notizen · dichtester Tag 7. Nov.“ würde dieselben Angaben unmittelbar vor den unverändert bleibenden Sätzen verdoppeln und die Bedeutung der 80 verschleiern. Dashboard-Bestandsband und Voice-Command-Antwortkarten haben andere Aufgaben.
Vorschlag: Vorläufig keine Kennzahlenzeile. Falls später eine kompakte Zusammenfassung gebraucht wird, die Metriken exakt benennen (etwa „80 Berührungen über 8 Tage“) und eine Stelle als primäre Zahlendarstellung wählen; die Klartext-Sätze müssen vollständig bleiben.

### F06 — Karte um den Bericht passt schlechter als freie Lesefläche
Schwere: mittel
datei:zeile: `app/src/renderer/styles/index.css:11803-11826,22811-22828`; `app/src/renderer/components/DashboardPanel/DashboardView.css:146-150`; `app/src/renderer/styles/index.css:23312-23325`
Status: [OFFEN]
`.panel-card` ist für Listen-Items mit Hover/Selected-Zustand gedacht, Dashboard-Karten sind Widgets. Ein langer, anklickbarer Bericht in einer `.panel-card` bekäme eine falsche „Item“-Anmutung und sein Hover färbte die ganze Fläche. Der Agent-Chat zeigt, dass längere Prosa im Produkt ohne Karte stehen kann. Eine weitere Karte würde die ohnehin schwebende Insel im Bild betonen.
Vorschlag: Sätze ohne Karte in klar begrenzter Lesespalte; nur bei Bedarf eine dezente Trennlinie zwischen Kopf und Inhalt. Keine Tints, Streifen oder Schatten.

### F07 — S7 und S9 betreffen auch Zeitstrahl und Leerzustand
Schwere: mittel
datei:zeile: `app/src/renderer/components/Canvas/BrainConstellation.tsx:28,106-126,264-267,375-385,428-447`; `app/src/renderer/utils/translations.ts:1605-1614,5053-5062`
Status: [OFFEN]
S7 trifft die saloppen Wendungen im Rückblick und im `BrainSayNode` des Zeitstrahls; letzterer würde nach Claudes Vorschlag unverändert bleiben. S9 betrifft zusätzlich `MONTHS_DE`, den Monatsnamen im „Heute“-Punkt, die `aria-label`s der Monatspfeile und die beiden Leerzustand-Sätze. Die vorhandenen `brain.*`-Übersetzungen decken nur Teile ab. „Dein Brain hat mitgedacht“ ist zugleich bewusst personifizierend und Teil der gewählten Klartext-Stimme; eine vollständige Ton-Glättung könnte den Charakter beseitigen.
Vorschlag: Informell-umgangssprachliche Füllungen wie „richtig viel los“, „war's“ und „kam es wieder hoch“ in beiden Satzorten maßvoll glätten. Alle sichtbaren und zugänglichen Texte einschließlich Monat/Leerzustand lokalisieren, Plural und Datum sprachabhängig formatieren. Die direkte Ansprache und anklickbare Stellen behalten.

### F08 — S8: Der untere Link ist redundant, aber ein brauchbarer Folgeweg
Schwere: niedrig
datei:zeile: `app/src/renderer/components/Canvas/BrainConstellation.tsx:360-368,444-448`; `app/src/renderer/styles/index.css:22823-22828`
Status: [OFFEN]
S8 stimmt funktional: Link und Segment öffnen denselben Zeitstrahl. Der untere Weg steht jedoch direkt nach dem gelesenen Bericht; bei langem Text oder kleiner Höhe ist der obere Schalter nicht mehr im Blick. Sein bloßes Entfernen verbessert den Kopf, verschlechtert aber den Lesefluss. Er ist auch keine deutliche Schaltfläche, sondern derzeit sehr blass.
Vorschlag: Als klar beschrifteten, dezenten Folgeschritt behalten, sofern der Zeitstrahl in Nutzertests tatsächlich aus dem Bericht heraus aufgerufen wird; sonst nach der Kopfneuordnung entfernen. Keine zweite hervorgehobene primäre Aktion schaffen.

### F09 — Leerzustand überspringt die Ansichtsweiche
Schwere: hoch
datei:zeile: `app/src/renderer/components/Canvas/BrainConstellation.tsx:384-386`; `app/src/renderer/styles/index.css:22682-22687`; `app/src/renderer/components/DashboardPanel/DashboardView.css:66-75`; `app/src/renderer/components/InboxPanel/InboxPanel.tsx:1685-1695`
Status: [OFFEN]
Bei einem Monat ohne Brain-Tage rendert die Komponente den zentrierten Leerzustand **vor** der Prüfung `view === 'timeline'`. Der Schalter kann dann „Zeitstrahl“ aktiv zeigen, obwohl weiterhin nur der Leerzustand zu sehen ist. Ein neuer Seitenkopf allein löst diesen Widerspruch nicht. Der Text sagt „erzeuge eine Tageszusammenfassung“, bietet dafür aber keine Aktion; Dashboard- und Inbox-Leerzustände sind ebenfalls zentriert, doch hier fehlen ein klarer Monatswechselhinweis und die konsistente Zuordnung zur gewählten Ansicht.
Vorschlag: Leere Rückblick- und Zeitstrahlansicht ausdrücklich als gemeinsamen Monats-Leerzustand kennzeichnen oder den Umschalter dort deaktivieren; „Ganzer Graph“ erreichbar lassen. Den Weg zur Tageszusammenfassung als echte Aktion nur anbieten, wenn sie hier sicher ausführbar ist.

### F10 — Schmale Split-Ansicht erfordert Container-Regeln statt breiten Dashboard-Kopf
Schwere: hoch
datei:zeile: `app/src/renderer/App.tsx:1601-1612,1731-1742`; `app/src/renderer/components/Canvas/BrainConstellation.tsx:356-381`; `app/src/renderer/styles/index.css:22665-22711,22811-22816`; `app/src/renderer/styles/index.css:21919-21935,23284-23293`
Status: [OFFEN]
Bei `splitPosition ≈ 46 %` ist die Brain-Seite nur rund 54 % des Workspace breit, bei kleineren Fenstern deutlich weniger. Schon jetzt hat die einzeilige Toolbar drei Segmentknöpfe plus Monatsnavigation; der geplante Kopf ergänzt Kachel, Titel, Unterzeile und gegebenenfalls „Heute“. `justify-content: space-between` ohne Umbruch oder Kürzungsregel lässt diese Teile kollidieren. Ein festes 32-px-Seitenpolster nimmt zusätzlich Lesebreite. Der Agent löst schmale Zustände mit Container-Queries, nicht nur mit Fenster-Breakpoints.
Vorschlag: Brain selbst als Größen-Container behandeln: ab schmaler Breite Kopf in zwei Zeilen (Titel/Monat, darunter Navigation/Ansichtswechsel), Monatstext kürzbar, Bedienelemente mit Mindesttrefferfläche, Seitenpolster etwa 16–20 px. Bei 400–600 px Panelbreite und deutscher/englischer Beschriftung prüfen.

### F11 — Dunkles Thema und Zeitstrahl bleiben mit dem Vorschlag stilistisch abgetrennt
Schwere: mittel
datei:zeile: `app/src/renderer/styles/index.css:73-140,22662-22668,22720-22726,22760-22791,22818-22828`; `app/src/renderer/components/Canvas/BrainConstellation.tsx:387-424`
Status: [OFFEN]
`--brain-color` folgt zwar dem Thema, doch die Zeitstrahl-Karte `.bc-say`, Scrubber und Legende nutzen eigene Schatten und halbtransparente Flächen; das widerspricht der festen Vorgabe ruhiger Karten ohne Schatten. Das React-Flow-Raster ist fest `rgba(20,23,29,0.05)` und damit im dunklen Thema kaum sichtbar. Rückblick-Link und unterer Folgeschritt haben keinen definierten `:focus-visible`-Stil; `--text-muted` ist dunkel nur `#666`, weshalb leise Texte und Controls besonders zurücktreten. Eine neue weiße Karte oder harte Farben würden das verschärfen.
Vorschlag: Bei jeder Stilkorrektur Rückblick **und** Zeitstrahl mit Theme-Tokens, Fokuszuständen und ohne Schatten prüfen. Das Raster an Theme-Tokens binden; dunkles Thema visuell kontrollieren, statt nur die helle PNG-Vorlage zu übertragen.

**Gesamtempfehlung (Reihenfolge):** (1) Gemeinsamen, responsiven Seitenkopf für Rückblick, Zeitstrahl und Leerzustand entwerfen; Monat nur einmal, SVG-Navigation, „Ganzer Graph“ als eigene Aktion. (2) Vertikalen Abstand stark senken und die freie Lesespalte behalten; Schrift moderat auf etwa 22/18/16–17 px staffeln. (3) Leerzustand und Sprach-/Datumsvarianten beider Ansichten korrigieren; Ton nur maßvoll glätten. (4) Zeitstrahl und dunkles Thema auf Schatten, Tokens und Fokus prüfen. **Keine Karte und vorerst keine zusätzliche Kennzahlenzeile.** Den unteren Zeitstrahl-Link als Folgeschritt zunächst erhalten und erst nach Prüfung des neuen Kopfs über seine Entfernung entscheiden. Die Klartext-Sätze bleiben vollständig und anklickbar.

## Claude-Antwort

Runde 1 (11.11.2026). Nutzerentscheidung: Seitenkopf, Schrift/Abstand, Leerzustand und Ton umsetzen;
englische Sätze, Zeitstrahl-Karten und dunkles Thema später.

- **F01 [ADRESSIERT]** — Titel 22 px, Einstieg 18 px, Fließtext 16,5 px/1,6.
- **F02 [ADRESSIERT]** — 7-vh-Abstand entfällt; Lesespalte 700 px am Seitenraster (32 px) direkt unter dem Kopf.
- **F03 [ADRESSIERT]** — eigener Kopf `.bc-head` nach Dashboard-Muster (kein `PanelHeader`), Monat nur einmal,
  ein kleines Brain-SVG; gilt für Rückblick, Zeitstrahl und Leerzustand.
- **F04 [ADRESSIERT]** — SVG-Chevrons 30 px mit Fokusring; Schalter hat zwei Zustände, „Ganzer Graph“ ist eigener Knopf.
- **F05, F06 [ADRESSIERT durch Verzicht]** — keine Kennzahlenzeile, keine Karte.
- **F07 [ADRESSIERT, teilweise]** — Ton geglättet und Sätze ehrlicher gefasst (siehe `brain-zweck-offene-faeden.md`). Lokalisierung später
  (neu über `t()`: nur Monatspfeile).
- **F08 [ADRESSIERT]** — Link bleibt, etwas lesbarer (13 px, `--text-secondary`).
- **F09 [ADRESSIERT, teilweise]** — im Leerzustand ist der Schalter gesperrt und nichts aktiv; keine neue Aktion.
- **F10 [ADRESSIERT]** — `.brain-constellation` ist Größen-Container; unter 640 px Kopf zweizeilig, 18 px Rand.
  Am Bild geprüft bei ca. 700 px (einzeilig); unter 640 px nicht am Bild geprüft.
- **F11 [OFFEN]** — Zeitstrahl-Schatten, Raster, dunkles Thema unverändert. Fokuszustände ergänzt.

## Status

Runde 1 umgesetzt bis auf Ton (11.11.2026), nicht committet. Abnahme durch den Nutzer steht aus.
