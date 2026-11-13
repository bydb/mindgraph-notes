# PowerPoint-Hausstil nach der Werkstatt-Präsentation: Vorlage, Symbole, Zeitleiste, Diagramm, Ablauf

## Aufgabe

Prüfung eines uncommitteten Umbaus (12.11.2026). Der Nutzer hat eine frei gezeichnete
Fortbildungs-Präsentation (40 Folien, außerhalb des Repos) als Maßstab für den Hausstil genannt:
„abwechslungsreich und einprägsam, so muss der Hausstil aussehen". Daraufhin wurde gebaut:

1. **Vorlage neu gezeichnet** — 25 statt 14 Layouts, Look der Referenz.
2. **Symbole** — `items[].icon` und `icon` der Folie; Linienzeichnungen als `custGeom`.
3. **Zeitleiste, Balkendiagramm, Ablauf mit Schleife** — Folienfelder `timeline`, `chart`, `flow`;
   gezeichnete Formen in einer Fläche, die das Layout vorgibt. Bewusst KEIN Diagramm-Objekt.
4. **Symbole in Schritten** — optional, dunkler Kreis.
5. **Skill-Regeln** neu (Dramaturgie, Tabelle „Inhalt → Layout").

Gesucht sind Löcher, nicht Bestätigung. Schwerpunkte:

- **OOXML-Korrektheit**: Was lässt PowerPoint „reparieren"? Schema-Reihenfolge in `p:spPr`/`a:ln`,
  Form-IDs, `custGeom`, `flipV`, `txBox`, Attribute an `a:endParaRPr`.
- **Layout-Automatik und fremde Vorlagen**: `fitsGraphics`, die Bildplatz-Bevorzugung in
  `resolveLayout`, `bestItemLayout`. Bricht etwas für Vorlagen ohne die neuen Namen?
- **Validierung und Grenzen** der neuen Felder; was kommt von einem Modell real an (Strings statt
  Zahlen/Booleans, JSON als String, fehlende Felder)?
- **Hausdesign** (`brandDeck.ts`): werden alle neuen Flächen und Schriften richtig umgefärbt? Kontrast
  der neuen Paarungen (Akzentschrift auf getönter Fläche, weiße Zeichnung auf `accent1`/`tx2`).
- **Web-Lauf**: Link-Prüfung über die neuen sichtbaren Texte; Quellenfolie unberührt?
- **Skill ↔ Werkzeug**: Verspricht `SKILL.md` etwas, das `write_pptx` anders macht? 12 000-Zeichen-Grenze.
- **Namenskollisionen**: Formen namens „Symbol", „Diagramm", „Ablauf", „Zeitleiste" in FREMDEN Vorlagen
  werden jetzt als Plätze/Flächen gelesen.

## Kontext/Anker

Geänderte und neue Dateien (alles uncommittet):

| Datei | Was |
|---|---|
| `app/src/shared/pptxTemplate.ts` | Einbau; s. Anker unten |
| `app/src/shared/pptxGraphics.ts` (neu) | Zeitleiste, Diagramm, Ablauf: Typen, Validierung, Zeichnen |
| `app/src/shared/pptxIcons.ts` (neu) | Namensauflösung, `custGeom`-Erzeugung |
| `app/src/shared/pptxIcons.generated.ts` (neu) | 73 Symbolpfade aus Lucide 0.469.0 (ISC) |
| `app/scripts/pptx-icons.cjs` (neu) | Generator: SVG-Knoten → M/L/C/Z, Bögen → Bézier |
| `app/scripts/build-hausstil-vorlage.py` | Vorlage: Master + 25 Layouts |
| `app/resources/starter-skills/praesentation-nach-vorlage/` | `MindGraph-Hausstil.pptx`, `SKILL.md` |
| `app/src/main/noteAgent/skills.ts` | Werkzeugbeschreibung, Schema, JSON-String-Aufbereitung |
| `app/src/main/brand/brandService.ts` | nur ein Beschreibungstext |
| `docs/skills/src/praesentation-nach-vorlage.md`, `docs/skills/index.json` | Katalogfassung des Skills |
| `app/src/shared/pptx{Template,Icons,Graphics}.test.ts` | Tests |
| `.claude/rules/note-agent-outputs.md` | Doku (Abschnitt `write_pptx`) |

Anker im Code:

- Symbolplätze lesen: `app/src/shared/pptxTemplate.ts:636` (`parseIconAnchors`) — Formen OHNE `p:ph`,
  Name „Symbol"/„Symbol n".
- Grafikflächen lesen: `app/src/shared/pptxTemplate.ts:652` (`parseAreas`), Automatik-Filter
  `:668` (`fitsGraphics`).
- Layoutwahl: `:1328` (`bestItemLayout`), `:1340` (`resolveLayout`) — neu: Block für
  `timeline`/`chart`/`flow`, Bildplatz-Bevorzugung je Art.
- Eingabeprüfung: `:1516` (`validateInput`) ruft `validateTimeline`/`validateChart`/`validateFlow`.
- Link-Prüfung Web-Lauf: `:1694` (`graphicTexts`).
- Symbole zeichnen: ab `:1918`; Sonderregel Schritte `:1922` (`isStep`).
- Grafik zeichnen: `:1942`; Symbol der Folie `:1961`.
- Formen erzeugen: `app/src/shared/pptxGraphics.ts:253` (`shapeXml`), Farben `:216`.
- Zeitleiste `:314`, Diagramm `:375`, Ablauf `:417`; Validierung `:104`, `:138`, `:169`;
  Zahlentext `:91` (`graphicNumber`).
- Symbole: `app/src/shared/pptxIcons.ts:54` (`resolvePptxIcon`), `:89` (`iconGlyphXml`).
- Werkzeug: `app/src/main/noteAgent/skills.ts:1558` (Beschreibung + Schema), `:1680` (JSON-Strings).
- Vorlage: `app/scripts/build-hausstil-vorlage.py:202` (`cards`), `:220` (`steps`), `:241` (`rows`),
  `:335` (`LAYOUTS`).
- Umfärben: `app/src/shared/brandDeck.ts:25` (`OLD`), `:46` (`recolorPartXml`) — NICHT geändert; die
  Vorlage benutzt weiter dieselben vier Hex-Werte, die gezeichneten Formen nur Schemafarben
  (`accent1`, `tx2`, `tx1`, `bg1`).

Entscheidungen, die bewusst so sind (gern angreifen, aber mit Begründung):

- **Unbekanntes Symbol = Hinweis + Punkt, keine Ablehnung** (Schmuck; ein zweiter voller
  `write_pptx`-Aufruf wäre teurer als der Fehler). **Grafik ohne Fläche = Ablehnung** (Inhalt ginge verloren).
- **Schritte**: Symbol nur, wenn genannt, und in `tx2` statt `accent1`.
- **Diagramm als Formen** statt `c:chart`: kein eingebettetes Excel, gleiches Bild in LibreOffice;
  Preis: nicht über „Daten bearbeiten" änderbar.
- **Zeitleiste**: ein Maßstab für alle Zeilen, Mindestbreite 0,95″ je Block (bricht die strenge
  Proportionalität bei sehr kurzen Blöcken).
- **Rückpfeil** aus drei Rechtecken + gespiegeltem Dreieck statt Verbinder.

Was gemessen ist:

- `npm run typecheck` sauber. `npm run test`: grün bis auf `shellExecution.test.ts` (Zeitlimit nur im
  Gesamtlauf; einzeln grün, mit und ohne diese Änderungen).
- Probe-Präsentation (24 Folien, alle neuen Formen, Hausdesign-Farben) öffnet in PowerPoint für Mac
  16.114 ohne Reparaturhinweis; PDF-Export von dort deckt sich mit LibreOffice.
- **Nicht gemessen**: PowerPoint für Windows, Keynote, Google Slides; ob ein lokales Modell die neuen
  Felder richtig füllt; Vorlagen Dritter mit zufällig gleich benannten Formen.

## Codex-Findings

### F01 — Zahlentext kann ungültige XML-Koordinaten erzeugen
Schwere: kritisch
ADR-Stelle: app/src/shared/pptxGraphics.ts:91
Status: [OFFEN]
`graphicNumber` prüft endliche Werte nur beim Typ `number`; nach `Number(t.replace(...))` fehlt diese Prüfung (`pptxGraphics.ts:92–96`). `validateTimeline` akzeptiert anschließend `Infinity`, weil `v > 0` gilt (`:116–117`); `validateChart` akzeptiert es ebenso (`:152–154`). Gegenbeispiel: `timeline.blocks = [{label: "A", value: "999…"}]` mit 400 Neunen → `Number(...) === Infinity` → `fitScale` berechnet `0`, `blockWidths` berechnet `Infinity * 0 === NaN` (`:296–310`) → `shapeXml` schreibt `cx="NaN"` (`:267`). Für `chart.bars` führt `Infinity / Infinity` über `:394–405` ebenfalls zu `NaN`. Das ist kein bloßes Überlaufproblem im Bild, sondern ungültiges OOXML. `node -e` bestätigte: 400 Neunen passieren den regulären Ausdruck, werden `Infinity`, und `Infinity > 0` ist wahr.
Vorschlag: Auch den geparsten Zahlentext mit `Number.isFinite` prüfen; danach eine Obergrenze für sinnvoll darstellbare Werte erwägen.

### F02 — Grafikflächen in Fremdvorlagen werden ungeprüft überzeichnet
Schwere: hoch
ADR-Stelle: app/src/shared/pptxTemplate.ts:652
Status: [OFFEN]
`parseAreas` nimmt jede Nicht-Platzhalter-Form mit dem bloßen Namen „Diagramm“, „Zeitleiste“ oder „Ablauf“ als Zeichenfläche, unabhängig von Füllung, sichtbarem Text oder dem Vorhandensein eines echten Diagramms (`pptxTemplate.ts:652–664`). `resolveLayout` bevorzugt sie bei entsprechender Eingabe (`:1361–1368`), und `buildPptxFromTemplate` zeichnet neue Formen darüber (`:1942–1957`). Gegenbeispiel: Eine fremde Vorlage enthält ein bereits gestaltetes, sichtbares Rechteck „Diagramm“ mit Zahlen als Dekoration. `chart` + automatische Layoutwahl legt Balken darüber; ohne `chart` schließt `fitsGraphics` dieses Layout sogar aus (`:668–669`, `:1388–1391`). Auch `parseIconAnchors` behandelt jede sichtbare Form „Symbol“/„Symbol n“ als Anker (`:636–648`); ein Folien- oder Kartensymbol wird darübergelegt (`:1918–1936`, `:1961–1968`). Die Namenskollision ist damit ein konkreter Kompatibilitätsbruch für fremde Vorlagen.
Vorschlag: Nur eindeutig markierte, unsichtbare Steuerformen akzeptieren oder die neuen Plätze auf die mitgelieferte Vorlage begrenzen.

### F03 — Erlaubte Zeitleisten können ihre Fläche verlassen
Schwere: hoch
ADR-Stelle: app/src/shared/pptxGraphics.ts:300
Status: [OFFEN]
Die Eingabegrenzen prüfen die Anzahl der Blöcke, aber nicht, ob deren Mindestbreite in die vom Layout gelesene Fläche passt (`pptxGraphics.ts:104–125`; `pptxTemplate.ts:652–664`). `fitScale` sucht nur einen Maßstab, während `blockWidths` jeden Block auf mindestens 0,95 Zoll setzt (`pptxGraphics.ts:293–310`, `:319–322`, `:342–353`). Gegenbeispiel: Eine fremde Vorlage hat eine 4 Zoll breite Form „Zeitleiste“ und acht Blöcke in einer Zeile. Die Validierung akzeptiert sie; selbst bei Maßstab null benötigen die Blöcke 8 × 0,95 + 7 × 0,08 = 8,16 Zoll. Mehr als die Hälfte liegt außerhalb der vorgesehenen Fläche und möglicherweise außerhalb der Folie. `shapeXml` begrenzt die Koordinaten nicht (`:253–269`).
Vorschlag: Vor dem Zeichnen Mindestbedarf gegen die konkrete Fläche prüfen und bei zu kleiner Fläche mit einer verständlichen Meldung ablehnen.

### F04 — Weißer Kleintext auf Hausfarbe ist nicht durch Kontrastregel gedeckt
Schwere: hoch
ADR-Stelle: app/src/shared/pptxGraphics.ts:351
Status: [OFFEN]
Hervorgehobene Zeitleistenblöcke und Schleifenstationen verwenden `accent1` als Fläche und `bg1` als weiße Schrift (`pptxGraphics.ts:349–352`, `:452–459`). `deriveBrandTokens` garantiert für `fill` gegen Weiß nur 3:1 (`brand.ts:158–160`, `:182–186`), während diese Beschriftungen auf 9,5–14 pt beziehungsweise 9,5–13 pt schrumpfen können (`pptxGraphics.ts:345–347`, `:455–458`). Beispiel `primary: "#1B9EE0"`: Die vorhandene Ableitung ergibt `fill: #1A96D5` mit rund 3,30:1 gegen Weiß, unter 4,5:1 für normalen kleinen Text. Auch `loopLabel` ist 11 pt `accent1` auf getönter Fläche (`pptxGraphics.ts:438–440`); dieselbe Farbe ergibt dort rund 3,03:1. `recolorThemeXml` legt `accent1` auf `fill` (`brandDeck.ts:69–78`), daher betrifft dies eingerichtete Hausdesigns tatsächlich.
Vorschlag: Für kleine weiße Schrift einen dunkleren Flächenwert bzw. für Beschriftungen einen separat auf die konkrete Fläche geprüften Textwert verwenden; Schleifenlabel gegen die Tönung prüfen.

### F05 — Balkenwert und angezeigte Zahl dürfen sich widersprechen
Schwere: mittel
ADR-Stelle: app/src/shared/pptxGraphics.ts:155
Status: [OFFEN]
`validateChart` begrenzt `display` nur auf Textlänge (`pptxGraphics.ts:155`); der Balken wird aus `value`, die Zahl daneben aber aus `display` erzeugt (`:394–406`). Gegenbeispiel: `bars: [{label:"A", value:1, display:"100"}, {label:"B", value:100, display:"1"}]` ist gültig und zeigt einen hundertmal längeren B-Balken mit der Zahl „1“ sowie den kurzen A-Balken mit „100“. Die Werkzeugbeschreibung erlaubt beide Felder (`app/src/main/noteAgent/skills.ts:1641–1647`), sodass ein Modell eine in sich widersprüchliche Grafik erzeugen kann.
Vorschlag: `display` auf nachvollziehbare Darstellungen von `value` begrenzen oder abweichende Anzeige ausdrücklich als Bereich mit passender Datenlogik modellieren.

### F06 — Fehlende Symbolplätze werden ab Karte zwei nicht gemeldet
Schwere: mittel
ADR-Stelle: app/src/shared/pptxTemplate.ts:1937
Status: [OFFEN]
Wenn ein Kartenlayout nur „Symbol 1“ besitzt, aber alle drei `items` ein `icon` liefern, werden die Symbole für Karte zwei und drei still weggelassen: Der Hinweis bei fehlendem Anker ist auf `k === 0` begrenzt (`pptxTemplate.ts:1918–1937`). Das ist gerade bei fremden Vorlagen mit teilweise benannten Formen plausibel. Die Skill-Abschlussregel verlangt, Hinweise des Werkzeugs weiterzugeben (`app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md:159–164`); für diese verlorenen Symbole gibt es keinen Hinweis.
Vorschlag: Für jeden Eintrag mit `icon` und fehlendem Anker eine Meldung ausgeben.

Geprüft ohne Befund: Die gezielten Tests für `pptxTemplate`, `pptxGraphics` und `pptxIcons` laufen durch (73 Tests). Die mitgelieferte Vorlage enthält die Grafikflächen mit den erwarteten Namen und Maßen; die Skill-Datei liegt mit 10.596 Zeichen unter der 12.000-Zeichen-Grenze. Die neue `graphicTexts`-Sammlung wird in die vorhandene Link-Prüfung einbezogen (`pptxTemplate.ts:1690–1705`), und die Quellenfolien-Logik wurde im Diff nicht geändert.

### F07 — Legende verlässt trotz erfolgreicher Passprüfung die Zeitleistenfläche (F03)
Schwere: hoch
ADR-Stelle: app/src/shared/pptxGraphics.ts:351
Status: [OFFEN]
`graphicFitIssue` prüft für die Zeitleiste nur Blockbreiten und Höhe, nicht die nebeneinander gezeichneten Legendeneinträge (`pptxGraphics.ts:349–355`). Die Zeichenfunktion gibt jeder Legende bis zu `W/2 - 0,5` Zoll Breite und setzt den zweiten Eintrag nach dem ersten plus festen Abständen (`:416–428`). Nachgestellt mit der **mitgelieferten** 12,13-Zoll-Fläche: ein Block, `legend.normal` und `legend.highlight` mit je 60 Zeichen (beide durch `validateTimeline` erlaubt, `:130–136`) → `graphicFitIssue(...) === null`; die zweite Legenden-Textform endet bei x = **12,99 Zoll**, die Fläche schon bei **12,73 Zoll**. Der neue F03-Test (`pptxGraphics.test.ts:173–188`) prüft nur eine einstellige Legende und nur den Rückgabewert der Passprüfung, nicht die Grenzen der erzeugten Formen.
Vorschlag: Die tatsächliche Legendenbreite samt beider Abstände prüfen oder beide Einträge innerhalb der Fläche aufteilen; im Test die Koordinaten der erzeugten Formen gegen die Fläche vergleichen.

### F08 — Steuerform in einer Gruppe erhält falsche Folienkoordinaten (F02)
Schwere: hoch
ADR-Stelle: app/src/shared/pptxTemplate.ts:652
Status: [OFFEN]
`findElements(tree, 'p:sp')` findet auch eine Form innerhalb von `p:grpSp`, weil es nur gleichnamige `p:sp` verschachtelt (`pptxTemplate.ts:311–337`, `:649–657`, `:665–675`). `isControlShape` lässt eine unbeschriftete Form mit `a:noFill` für Füllung und Linie zu (`:639–644`); `parseBox` liest dann nur ihr lokales `a:xfrm` und beachtet das `a:xfrm` der Elterngruppe nicht (`:586–594`). Gegenbeispiel: Eine unsichtbare Form „Diagramm“ liegt als Kind bei x = 0 in einer Gruppe, deren `off.x` 8 Zoll beträgt. Der echte Platz liegt bei 8 Zoll, die neuen Balken werden bei 0 gezeichnet (`pptxTemplate.ts:1977–1983`). Dasselbe trifft Symbolplätze. Der F02-Test (`pptxTemplate.test.ts:883–901`) erzeugt ausschließlich freie Formen, keine Gruppe. Damit ist F02 für gruppierte Steuerformen noch nicht vollständig adressiert.
Vorschlag: Gruppenkoordinaten auf Folienkoordinaten umrechnen oder Steuerformen innerhalb von Gruppen ausdrücklich ignorieren.

### F09 — Vorzeichen und Tausenderpunkt umgehen die Display-Prüfung (F05)
Schwere: mittel
ADR-Stelle: app/src/shared/pptxGraphics.ts:141
Status: [OFFEN]
`displayNames` sucht beliebige **vorzeichenlose** Zahlenfragmente (`pptxGraphics.ts:141–144`) und vergleicht nur eines davon mit `value` (`:165–167`). Direkt nachgestellt: `value: 1, display: "-1"` wird akzeptiert, obwohl der Balken +1 und der sichtbare Text −1 aussagt. Bei deutscher Präsentation wird `value: 1, display: "1.000"` ebenfalls akzeptiert, obwohl „1.000“ als Tausend gelesen wird; umgekehrt wird `value: 1234, display: "1.234"` abgelehnt. Auch `display: "1000 (1)"` bei `value: 1` passiert, obwohl die dominante Anzeige widerspricht. Der neue F05-Test (`pptxGraphics.test.ts:195–201`) deckt nur einfache positive Zahlen und eine Spanne ab. F05 ist für diese normalen Zahlenformate noch offen.
Vorschlag: Die gesamte angezeigte Zahl beziehungsweise eine klar definierte Spanne mit sprachabhängigem Tausender- und Dezimalformat parsen; Vorzeichen berücksichtigen und zusätzliche widersprechende Zahlen ablehnen.

### F10 — Die neue Wertobergrenze passt nicht zur Diagramm-Wertespalte (F01/F03)
Schwere: mittel
ADR-Stelle: app/src/shared/pptxGraphics.ts:87
Status: [OFFEN]
Die neue Grenze `maxValue = 1_000_000_000` verhindert numerischen Überlauf (`pptxGraphics.ts:86–100`, `:161–163`), passt aber nicht zur festen Wertespalte: `chartShapesXml` reserviert nur 0,85 Zoll einschließlich Abstand, also 0,77 Zoll Textbreite (`:443–446`, `:463–464`). Bei `value: 1_000_000_000` liefert `formatNumber` für `de-DE` „1.000.000.000“ (`:301–306`), 13 Zeichen bei 11,5 pt; die Form hat `wrap="none"` und `a:noAutofit` (`:275–280`). Auf einem maximal breiten Balken beginnt die Wertespalte unmittelbar vor dem rechten Flächenrand. Die Zahl ist für die geprüfte Fläche zu lang und wird je nach Programm abgeschnitten oder ragt darüber hinaus. `graphicFitIssue` rechnet nur mit der konstanten Spaltenbreite, nicht mit dem formatierten Wert (`:357–361`); die F01/F03-Tests verwenden keine langen formatierten Zahlen.
Vorschlag: Die darstellbare Textbreite aus formatiertem Wert und Schriftgröße abschätzen und die Wertespalte daran ausrichten oder Werte mit zu langer Anzeige ablehnen.

Runde 2 - geprueft ohne Befund: F01 verwirft nichtendliche Zahlentexte sowie Werte außerhalb des jeweiligen Bereichs (Zeitleiste: größer 0, Diagramm: ab 0; beide höchstens 1 Milliarde) vor der XML-Erzeugung. F06 meldet fehlende Symbolplätze je Eintrag und setzt die Einmalmeldung für Layouts ohne Symbolplätze pro Folie zurück; die Schrittlogik meldet unbekannte Symbole weiterhin. Die mitgelieferte Vorlage enthält weiterhin „Symbol“, „Symbol 1–4“ und die Grafikflächen „Zeitleiste“, „Ablauf“, „Diagramm“ als unsichtbare Steuerformen. `hlink` wird bei aktivem Hausdesign in `brandDeck.ts:69–79` auf `t.text` gesetzt; in der unveränderten MindGraph-Vorlage sind `hlink` und `accent1` beide `1F6F6A`. Die 8-Prozent-Tönung erreicht bei den nachgerechneten Beispielwerten helles Blau `#1B9EE0`, Rot `#E30613` und Petrol `#1F6F6A` ungefähr 4,6 / 4,7 / 5,3 : 1 gegen den jeweiligen Textton. Die gezielten Tests für `pptxGraphics`, `pptxTemplate` und `brand` liefen mit 101/101 grün; die neuen F0x-Tests decken die oben genannten Varianten nicht ab. Der bewusst offen gelassene Weiß-auf-`accent1`-Kontrast aus F04 bleibt unverändert.

### F11 — Kontextvoll-Abschluss erklärt jedes Teilergebnis zum Erfolg
Schwere: hoch
ADR-Stelle: app/src/main/noteAgent/loop.ts:521
Status: [OFFEN]
Der neue Rückweg prüft nur `run.results.size > 0` (im Web-Lauf zusätzlich `run.web.wrote`) und meldet dann „Das Ergebnis ist geschrieben“ mit `hitMaxIterations: false` (`loop.ts:516–529`). `registerResult` registriert jedes erfolgreiche Ergebnis unabhängig vom Auftragstyp (`runRegistry.ts:334–343`); der Format-Hinweis prüft nur ausdrücklich erwartete PPTX/Mindmap (`loop.ts:306–352`). Gegenbeispiel: Auftrag „erst eine Begleitnotiz, dann die Excel-Tabelle“; `write_note` gelingt, der Modellkontext ist danach voll. Die Tabelle fehlt, trotzdem endet der Lauf regulär mit der pauschalen Erfolgsmeldung. Im Web-Lauf genügt ebenfalls der erste zulässige Write, selbst wenn er nur eine Begleitnotiz statt der verlangten Tabelle enthält (`loop.ts:174–180`, `:521–527`). Der neue Test (`loopBudget.test.ts:101–109`) deckt nur den Fall ab, in dem der **eine** `write_note` bereits das gesamte verlangte Ergebnis ist. `transcript`, `transcriptTokens`, `cost` und `withFormatHint` werden auf diesem Pfad zwar gesetzt; sie korrigieren die fehlende Auftragsprüfung nicht.
Vorschlag: Bei vollem Kontext nur einen nachweislich vollständigen Einzelergebnisfall als erledigt melden; sonst das vorhandene Teilergebnis erhalten, den Lauf aber ausdrücklich als unvollständig kennzeichnen und zur Fortsetzung auffordern.

### F12 — Streaming verschluckt weiterhin Fehler in HTTP-200-Antworten
Schwere: hoch
ADR-Stelle: app/src/main/llm/chatClient.ts:983
Status: [OFFEN]
`errorInOkBody` wird nur in den beiden nicht streamenden OpenAI-kompatiblen Aufrufen verwendet (`chatClient.ts:617–620`, `:846–849`). `streamCloudChat` liest SSE-Blöcke aus derselben OpenRouter-/LLMBase-API, verarbeitet aber allein `choices[0].delta.content`; einen Block `data: {"error":{"code":429,"message":"temporarily rate-limited upstream"}}` ignoriert es (`:970–993`) und liefert am Ende `full` zurück, gegebenenfalls als leere oder unvollständige Antwort (`:996–1003`). Das ist die gleiche Fehlerklasse wie im echten Agentenlauf, nur auf dem Streaming-Pfad für Notes-Chat (`main/index.ts:6935`, `:7119`). Die neuen Tests (`chatClient.retry.test.ts:175–194`) rufen ausschließlich `chat`/`chatWithTools` auf, nicht `streamCloudChat`.
Vorschlag: SSE-Fehlerblöcke ausdrücklich erkennen, mit der vorhandenen Provider-Meldung werfen und einen bereits gelieferten Teiltext nicht als vollständigen Erfolg zurückgeben.

### F13 — F07 begrenzt die Legendenform, nicht ihren Text
Schwere: mittel
ADR-Stelle: app/src/shared/pptxGraphics.ts:363
Status: [OFFEN]
Die neue Passprüfung zählt je Legendeneintrag nur 1,2 Zoll Mindestbreite (`pptxGraphics.ts:363–365`); die Zeichenfunktion teilt den verfügbaren Platz und gibt dem Text immer nur 0,42 Zoll Höhe bei 12 pt, `wrap="square"` und `a:noAutofit` (`:453–469`, `:262–286`). Nachgestellt: 4-Zoll-Fläche, ein Block, beide Legendentexte je 60 Zeichen → `validateTimeline` ohne Befund und `graphicFitIssue === null`; jeder Textkasten ist 1,37 × 0,42 Zoll. `"Wort ".repeat(12)` benötigt bei dieser Breite mehrere Zeilen mehr, als 0,42 Zoll bei 12 pt aufnehmen kann; der Text wird abgeschnitten beziehungsweise ragt aus der Form. Der F07-Test (`pptxGraphics.test.ts:205–219`) prüft Koordinaten und das `wrap`-Attribut, aber keine Textpassung. F07 ist damit hinsichtlich sichtbarer Legendentexte nur teilweise adressiert.
Vorschlag: Die Zeilenzahl für die tatsächliche Legendenbreite abschätzen und Höhe/Schrift anpassen oder den Eintrag bei zu wenig Platz ablehnen.

### F14 — Bei vielen kurzen Wörtern passt der Zeitleistenname trotz Fitanzeige nicht
Schwere: mittel
ADR-Stelle: app/src/shared/pptxGraphics.ts:394
Status: [OFFEN]
`fitLabelPt` gibt die kleinste Größe auch dann zurück, wenn **keine** Größe in die verfügbare Höhe passt (`pptxGraphics.ts:394–410`). `timelineMinW` berücksichtigt nur das längste einzelne Wort, und `graphicFitIssue` übernimmt diese Breite ohne Prüfung der notwendigen Zeilenzahl (`:325–327`, `:358–368`). Direkt mit den exportierten Funktionen nachgestellt: drei benannte Zeilen samt Legende in der 12,13 × 4,5-Zoll-Fläche der Vorlage; in Zeile 1 sieben kurze Blöcke mit `label: "aa bb cc dd ee ff gg hh ii"` (26 Zeichen, zulässig) und Wert 1 sowie ein achter Block mit großem Wert. `validateTimeline` meldet nichts, `graphicFitIssue` gibt `null`, jeder kurze Block wird 0,95 Zoll breit und etwa 0,417 Zoll hoch; `fitLabelPt` fällt auf 9 pt zurück. Bei verfügbarer Breite 0,81 Zoll brauchen die neun Wörter mindestens drei Zeilen (rund 0,45 Zoll allein Zeilenhöhe), während nur etwa 0,337 Zoll angesetzt werden. Der neue Test (`pptxGraphics.test.ts:239–279`) prüft Einzelwörter und einen langen Block, nicht viele kurze Wörter unter knapper Höhe.
Vorschlag: Die Passprüfung muss die Zeilenzahl bei der endgültigen Blockbreite mit einbeziehen; wenn selbst 9 pt nicht passen, die Grafik ablehnen oder den Block verbreitern.

### F15 — Der 200-Gruppen-Wächter lässt weitere gruppierte Steuerformen durch (F08)
Schwere: mittel
ADR-Stelle: app/src/shared/pptxTemplate.ts:651
Status: [OFFEN]
`withoutGroups` entfernt höchstens 200 `p:grpSp`-Elemente und gibt danach den Restbaum unverändert zurück (`pptxTemplate.ts:651–657`). `parseIconAnchors` und `parseAreas` durchsuchen diesen Rest anschließend auch innerhalb verbleibender Gruppen (`:663–691`); `parseBox` liest weiterhin nur die lokalen Kindkoordinaten (`:586–594`). Gegenbeispiel: Eine fremde Layoutfolie enthält 201 gültige Gruppen; die letzte enthält eine unsichtbare Form „Diagramm“. Nach 200 Durchgängen wird sie wieder als Steuerfläche an ihrer lokalen Position erfasst. Der F08-Test (`pptxTemplate.test.ts:928–942`) prüft nur eine und zwei verschachtelte Gruppen. F08 ist für große fremde Vorlagen nicht vollständig behoben.
Vorschlag: Gruppen ohne feste Iterationsgrenze entfernen oder bei Erreichen einer Sicherheitsgrenze die Erkennung abbrechen, statt den Restbaum als gruppenfrei zu behandeln.

### F16 — Fehlerantwort mit Verbrauchsdaten fällt aus der Kostenbilanz
Schwere: mittel
ADR-Stelle: app/src/main/llm/chatClient.ts:618
Status: [OFFEN]
Die neue Prüfung wirft **vor** `recordCloudCall` und `trackPendingTelemetry` (`chatClient.ts:617–625`, `:846–855`). Gegenbeispiel: HTTP 200 mit `{error:{code:503,message:"upstream"},usage:{prompt_tokens:1000,completion_tokens:0}}`, ohne `choices`: Der Aufruf wird als Fehler gemeldet, aber die vom Anbieter gemeldeten 1000 Eingabetoken werden weder als Telemetrie noch als Kosten des Laufs erfasst. Ob ein Anbieter solche Fehler tatsächlich berechnet, ist anbieterspezifisch; sobald er `usage` mitliefert, verwirft der Code die Messung. Die neuen Tests prüfen Fehlertext und Requestanzahl, nicht `usage`/Kosten (`chatClient.retry.test.ts:175–194`).
Vorschlag: Vor dem Throw vorhandene `usage`-Daten erfassen und dabei den Aufruf als fehlgeschlagen kennzeichnen.

Runde 3 - geprueft ohne Befund: F09 ist aus Typ, Validierung, Zeichnung und `write_pptx`-Schema entfernt; ein mitgesandtes `display` wird ignoriert. F10 benutzt für Passprüfung und Zeichnung dieselbe `chartValueW`-Funktion, die die formatierten Werte der gewählten Sprache berücksichtigt. `withoutGroups` verwirft einfache und verschachtelte Gruppen; `isControlShape` verlangt weiterhin ausdrücklich `noFill` für Füllung und Linie und leeren Text. Die mitgelieferte Vorlage hat ihre freien Symbol- und Grafiksteuerformen weiter. `timelineMinW` und `blockWidths` verwenden dieselben Mindestbreiten, und `fitScale` erhält nach der Eingabeprüfung positive Werte, sodass in diesem Pfad keine Division durch null entsteht. Die neuen Synonyme `clipboard` und `stapel` zeigen auf vorhandene Symbolnamen. Die neue `console.warn`-Zeile schreibt die letzten höchstens 1200 Zeichen der Modellantwort in `loop.ts:620–623` an die lokale Main-Process-Konsole; im geprüften Code ist kein Weiterleitungsaufruf an Netzwerk, Renderer oder Datei an dieser Stelle. Die fünf gezielten Testdateien liefen mit 112/112 grün.

## Claude-Antwort

Runde 1, 12.11.2026. Alle sechs Befunde vor der Umsetzung mit eigener Messung nachgestellt — alle
trugen. Der Nutzer hat die Umsetzung „wie empfohlen" freigegeben.

### F01 — [ADRESSIERT]
Nachgestellt: 400 Neunen → `Infinity` → vier `cx="NaN"` auf der Zeitleisten-Folie, zwei auf der
Diagramm-Folie. Jetzt prüft `graphicNumber` auch den geparsten Zahlentext auf Endlichkeit
(`app/src/shared/pptxGraphics.ts`, `graphicNumber`), und beide Prüfungen lehnen Werte über
`GRAPHIC_LIMITS.maxValue` (1 Milliarde) ab. Tests: `pptxGraphics.test.ts` „F01“, `pptxTemplate.test.ts` „F01“.

### F02 — [ADRESSIERT]
Nachgestellt, und schärfer als beschrieben: eine rote, beschriftete Form „Diagramm" im Layout
„Titel und Inhalt" ließ eine gewöhnliche Textfolie auf dem dunklen „Abschluss"-Layout landen.
Jetzt gilt nur eine **Steuerform** als Symbolplatz oder Grafikfläche (`isControlShape` in
`app/src/shared/pptxTemplate.ts`): Füllung ausdrücklich aus, Linie ausdrücklich aus, kein Text. Eine
Form ohne `a:ln` zählt nicht (die Linie kann aus dem Formstil kommen). Die mitgelieferte Vorlage
schreibt ihre Plätze schon so. Test „F02“ deckt gefüllt, beschriftet und „Linie nicht ausdrücklich aus“ ab.
Nicht gewählt: Begrenzung auf die mitgelieferte Vorlage — eigene Vorlagen sollen dieselben Plätze
anbieten können.

### F03 — [ADRESSIERT]
Nachgestellt: acht Blöcke in 4 Zoll enden bei 8,16 Zoll; dieselbe Klasse beim Ablauf (Stationsbreite 1 EMU)
und beim Diagramm (Balken 0,03 Zoll). `graphicFitIssue` (`pptxGraphics.ts`) rechnet für alle drei
Grafiken den Mindestbedarf in Breite UND Höhe gegen die Fläche; `buildPptxFromTemplate` lehnt mit
Maßangabe ab. Nebenbei gefunden: drei benannte Zeilen mit Legende brauchten 4,6 Zoll in einer
4,5-Zoll-Fläche — die Mindest-Blockhöhe ist deshalb 0,4 statt 0,45 Zoll. Der Test prüft, dass der
größte erlaubte Fall jeder Grafik in die Flächen der mitgelieferten Vorlage passt.

### F04 — [ADRESSIERT] (Beschriftung) / [ABGELEHNT: Nutzerentscheidung] (weiße Blocknamen)
Nachgerechnet für helles Blau, Signalrot, Petrol. **Schleifen-Beschriftung:** jetzt in `hlink` (dort
legt das Hausdesign den Textton ab) statt `accent1`. Das allein reichte nicht — auf der 13-%-Tönung
kam der Textton nur auf 4,3 : 1. Die Schleifenfläche ist deshalb auf 8 % aufgehellt; damit 4,6 / 4,7 /
5,4 : 1 (DrawingML-Mischung `lumMod`/`lumOff`/`satMod` nachgerechnet, nicht in PowerPoint gemessen).
**Weiße Namen auf `accent1`** (Zeitleiste, Schleifenstationen): bleibt bei der bestehenden Regel
„Weiß auf Fläche ≥ 3 : 1“, die schon für Ziffernkreise und Symbole gilt. Für helle Hausfarben heißt
das: fette Schrift unter 14 pt mit etwa 3,3 : 1 — unter dem Ziel für kleine Schrift. Abhilfe wäre,
den Flächenton generell auf 4,5 : 1 abzudunkeln; das verändert bei hellen Hausfarben die ganze
Präsentation und ist deshalb nicht Teil dieser Runde. In fremden Vorlagen ist `hlink` die Linkfarbe
der Vorlage, nicht zwingend der Akzent.

### F05 — [ADRESSIERT]
`display` wird nur angenommen, wenn der Wert als Zahl darin vorkommt („18–19“ bei 18, „ca. 3,4 GB“
bei 3,4), sonst Ablehnung mit dem Hinweis, das Feld wegzulassen. Schema-Beschreibung in
`app/src/main/noteAgent/skills.ts` nennt die Regel. Grenze: „18–19“ bei Wert 19 und bei Wert 18 sind
beide gültig — welche Kante der Spanne der Balken zeigt, prüft niemand.

### F06 — [ADRESSIERT]
Nachgestellt: nur „Symbol 1“ im Layout, drei Symbole genannt → null Hinweise. Jetzt: hat das Layout
Symbolplätze, aber nicht für diesen Eintrag, ein Hinweis je Eintrag; hat es gar keine, EIN Hinweis je
Folie. Dabei einen zweiten Fehler derselben Stelle behoben: nannte erst die zweite Karte ein Symbol,
kam bisher gar kein Hinweis (die Meldung hing an Karte 1).

Stand nach der Umsetzung: `npm run typecheck` sauber; `npm run test` 3904 bestanden, 2 Fehlschläge in
`shellExecution.test.ts` (Zeitlimit im Gesamtlauf, einzeln 15/15 grün). Probe-Präsentation (24 Folien)
öffnet in PowerPoint für Mac ohne Reparaturhinweis.


---

Runde 2, 12.11.2026. Vier neue Befunde, alle vor der Umsetzung nachgestellt, alle trugen. Der Nutzer
hat „wie empfohlen" freigegeben, bei F09 die Streichung von `display`.

### F07 — [ADRESSIERT]
Nachgestellt: zwei Legenden mit je 60 Zeichen endeten bei 12,99 Zoll (Fläche 12,73). Jetzt teilen sich
die Einträge die Breite der Fläche (`timelineShapesXml`), der Text bricht in seinem Kasten um
(`wrap="square"` statt `none`), und `graphicFitIssue` rechnet die Legende in die Breite ein. Der Test
prüft die Koordinaten der gezeichneten Formen bei drei Flächenbreiten, nicht nur den Rückgabewert.

### F08 — [ADRESSIERT]
Nachgestellt: Gruppe bei 8 Zoll, Fläche bei 0 Zoll gelesen. Steuerformen in Gruppen gelten nicht mehr
(`withoutGroups` in `pptxTemplate.ts`, auch verschachtelt). Nicht gewählt: Umrechnung der
Gruppenkoordinaten — Skalierung, Drehung und Verschachtelung für einen Fall, den die mitgelieferte
Vorlage nie hat. Wer in einer eigenen Vorlage einen Platz gruppiert, bekommt ihn schlicht nicht.

### F09 — [ADRESSIERT] durch Streichung
Nachgestellt: „-1“, „1.000“ und „1000 (1)“ wurden bei Wert 1 angenommen, „1.234“ bei 1234 abgelehnt.
Statt die Regel zu verschärfen, gibt es `display` nicht mehr (Typ, Prüfung, Zeichnen, Schema, Skill).
Am Balken steht immer der formatierte Wert; ein mitgeschicktes `display` wird nicht gezeigt. Damit
entfällt auch der Restpunkt aus meiner Antwort zu F05 (Kante einer Spanne). Eine Spanne gehört in
die Balkenbeschriftung oder die Quellenzeile.

### F10 — [ADRESSIERT]
Nachgestellt, und früher als beschrieben: schon „1.250.000“ ragte beim längsten Balken über die Fläche.
Die Wertespalte richtet sich jetzt nach der längsten formatierten Zahl (`chartValueW`, fett gerechnet),
und `graphicFitIssue` rechnet mit derselben Breite. Lange Zahlen kosten Balkenlänge; wird es zu eng,
lehnt die Passprüfung ab. Grenze: die Zeichenbreite ist eine Schätzung (0,0088 Zoll je Punkt und
Zeichen), keine Messung der Schrift.

Stand: `npm run typecheck` sauber; `npm run test` 3908 bestanden, 1 Fehlschlag in
`shellExecution.test.ts` (Zeitlimit im Gesamtlauf). Probe (24 Folien) öffnet in PowerPoint für Mac.

---

Nach Runde 2 — Änderungen aus dem ersten echten Agentenlauf (12./13.11.2026), noch nicht geprüft:

1. **Fehler im Körper einer 200-Antwort** (`errorInOkBody`, `app/src/main/llm/chatClient.ts`; Aufruf an
   beiden OpenAI-kompatiblen Stellen `chatViaOpenAiCompatible` und der Werkzeug-Variante). Auslöser:
   OpenRouter lieferte HTTP 200 mit `{"id":…,"error":{"code":429,"message":"… temporarily rate-limited
   upstream"}}` ohne `choices`; der Agent hielt das für eine leere Modellantwort. Test:
   `chatClient.retry.test.ts` („Rate-Limit im KÖRPER …“, „andere Fehler im Körper …“).
2. **Protokollzeile** im Web-Abbruch (`app/src/main/noteAgent/loop.ts`, vor „Der Recherche-Lauf wurde
   ohne Ergebnis beendet“): letzte Modellantwort, höchstens 1200 Zeichen, nur `console.warn`.
3. **Voller Kontext nach geschriebenem Ergebnis** (`loop.ts`, Block `if (!hasRoomForNextCall(budget))`):
   liegt ein Ergebnis vor (im Web-Lauf: `run.web.wrote`), endet der Lauf regulär mit festem Abschlusstext
   statt mit „Kontext voll, bevor ein Ergebnis geschrieben wurde“. Test: `loopBudget.test.ts`.
4. **Schriftgröße nach Wörtern** (`fitLabelPt`, `timelineMinW` in `app/src/shared/pptxGraphics.ts`):
   im echten Lauf brachen Namen mitten im Wort um („Werkzeu-g“). Zeitleisten-Blöcke haben jetzt eine
   Mindestbreite je Block (längstes Wort bei 9 pt); `fitScale`/`blockWidths` rechnen mit Breiten je Block,
   `graphicFitIssue` mit derselben Summe. Tests am Ende von `pptxGraphics.test.ts`.
5. Zwei Symbol-Synonyme (`clipboard`, `stapel`) in `app/src/shared/pptxIcons.ts`.

---

Runde 3, 13.11.2026. Sechs neue Befunde, alle vor der Umsetzung nachgestellt, alle trugen. Der Nutzer
hat die Umsetzung freigegeben.

### F11 — [ADRESSIERT]
Der Abschluss bei vollem Kontext behauptet keinen Erfolg mehr. Er endet ohne Fehler (die alte Meldung
„bevor ein Ergebnis geschrieben wurde“ war bei vorhandenem Ergebnis falsch), nennt die geschriebenen
Dateien beim Namen, sagt ausdrücklich, dass die Vollständigkeit ungeprüft ist, und wie es weitergeht.
Der Verlauf bleibt für die Fortsetzung erhalten. Nicht gewählt: `hitMaxIterations: true` — das hätte
an der Oberfläche „Rundenlimit erreicht“ bedeutet, was hier nicht stimmt. Grenze: ob der Auftrag
vollständig ist, entscheidet weiter der Mensch; eine Prüfung „verlangt vs. geschrieben“ gibt es nicht.

### F12 — [ADRESSIERT]
`streamCloudChat` erkennt ein Fehler-Ereignis im Strom und einen JSON-Körper mit Fehler statt eines
Stroms und wirft die übliche Anbieter-Meldung; kam vorher schon Text, steht „unvollständig“ dabei.
Der bis dahin gemeldete Verbrauch wird erfasst. Vier Tests in `chatClient.retry.test.ts`.
Nicht geprüft: die Petrol-Websuche und andere Aufrufer mit eigenem Strom-Leser.

### F13 — [ADRESSIERT]
`graphicFitIssue` lehnt eine Legende ab, die in ihrem Kasten mehr als zwei Zeilen bräuchte oder ein
Wort enthält, das in keine Zeile passt. In der mitgelieferten Fläche reicht für die längste erlaubte
Legende aus gewöhnlichen Wörtern weiterhin der Platz; ein unteilbares 60-Zeichen-Wort wird jetzt auch
dort abgelehnt.

### F14 — [ADRESSIERT]
`timelineMinW` wählt die Blockbreite so, dass der Name bei 9 pt in höchstens zwei Zeilen passt (vorher
nur: längstes Wort). Nachgemessen am Gegenbeispiel: 14 Zeichen je Zeile, zwei Zeilen, 0,30 Zoll bei
0,34 Zoll Höhe. Sieben solche Blöcke in schmaler Fläche werden abgelehnt.

### F15 — [ADRESSIERT]
`withoutGroups` gibt bei Erreichen der Sicherheitsgrenze (jetzt 500) einen leeren Baum zurück — das
Layout hat dann keine Plätze. Test mit 601 Gruppen.

### F16 — [ADRESSIERT]
Enthält eine Fehlerantwort `usage`, wird sie vor dem Fehler erfasst (beide nicht streamenden Aufrufe;
im Strom über `failStream`). Kein eigener Test; ein Kennzeichen „fehlgeschlagen“ kennt die
Kostenerfassung nicht — der Aufruf zählt wie jeder andere.

Stand: `npm run typecheck` sauber; `npm run test` 3922 bestanden, 2 Fehlschläge in
`shellExecution.test.ts` (Zeitlimit im Gesamtlauf).

## Status

Runde 1 am 12.11.2026: sechs Befunde, fünf adressiert, F04 geteilt (Beschriftung adressiert, weiße
Blocknamen bewusst offen). Runde 2: vier Befunde (F07–F10), alle adressiert, `display` gestrichen. Runde 3: sechs Befunde (F11–F16),
alle adressiert; dazu zwei echte Agentenläufe (Cloud und lokal). Abnahme durch den Nutzer steht
aus. Nichts committet.
