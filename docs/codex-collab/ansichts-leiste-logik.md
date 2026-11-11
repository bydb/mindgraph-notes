# Ansichts-Leiste in der Titelzeile: Logik prüfen und neu ordnen

## Aufgabe

Der Nutzer bittet darum, die Logik der mittleren Leiste in der Titelzeile
(Editor · Split · Brain · Agent · Dashboard · [Workflow] | Text-Split) zu überprüfen und zu
überlegen, ob man sie anpassen sollte: was wird am meisten genutzt, was braucht man kaum noch.

Das ist ein **Entwurfs-Review, kein Code-Review**. Es gibt noch keine Änderung. Unten stehen
(1) was die Leiste heute tut, (2) was am Bildschirm zu sehen war, (3) was die Nutzungsspuren
hergeben, (4) ein Vorschlag von Claude. Codex soll den Vorschlag angreifen — nicht bestätigen:

- Stimmen die Beobachtungen gegen den Code? Fehlt eine Aufrufstelle, die der Vorschlag bricht?
- Ist die Diagnose (drei Sorten Knöpfe in einer Reihe) richtig oder zu einfach?
- Wo ist der Vorschlag schlechter als der Ist-Zustand (Onboarding, Tastenkürzel, Sprachbefehle,
  schmale Fenster < 1300 px, Schwerpunkt `notes` statt `agent`, Präsentationsmodus)?
- Gibt es eine kleinere Änderung, die 80 % des Nutzens bringt?
- Was sollte wirklich entfallen, was nur umziehen (Memory-Regel des Nutzers: „Transparenz vor
  Entfernung“ — scheinbar Doppeltes ist oft Absicht)?

Bilder (nur die Leiste, keine Inhalte):
`/private/tmp/claude-502/-Users-jochenleeder-dev-mindgraph-notes/4469f2a1-34a8-416c-9aa9-17bd274ce86f/scratchpad/leiste-split-agent.png`,
`…/leiste-editor-dashboard.png`, `…/leiste-split-dashboard-textsplit.png` (gleicher Ordner).

## Kontext/Anker

### 1. Was die Leiste heute tut (Code)

- `app/src/renderer/App.tsx:1331-1402` — die Leiste. Reihenfolge: Editor, Split, Brain,
  (Agent vorn, wenn `workFocus === 'agent'`), Dashboard, Workflow, (Agent hinten sonst), Trenner,
  Text-Split.
- **Sorte A, Aufteilung** (`viewMode`, genau einer aktiv): `editor` = nur Editorfläche, `split` =
  Editorfläche + Graph/Brain rechts, `canvas` = nur Graph/Brain (`App.tsx:1333-1349`,
  Darstellung `App.tsx:1598-1748`).
- **Sorte B, Ziel** (öffnet einen Tab in der Editorfläche): Agent `App.tsx:1277-1297`, Dashboard
  `App.tsx:1351-1369`, Workflow `App.tsx:1370-1387`. Alle drei rufen vorher
  `setViewMode('editor')` — sie werfen den Nutzer also aus Split heraus.
- **Sorte C, Schalter**: Text-Split `App.tsx:1390-1401`, `disabled={viewMode !== 'editor'}`.
- Hervorhebung: `.active` = `styles/index.css:647-688`; Schwerpunkt-Tönung
  `.is-focus:not(.active)` = `styles/index.css:584-590` (Agent dauerhaft getönt bei
  `workFocus === 'agent'`).
- Start erzwingt immer `viewMode = 'editor'` (`stores/uiStore.ts:1775-1776`), Default im Store
  ist aber `'split'` (`stores/uiStore.ts:1030`), und `viewMode` steht in `persistedKeys`
  (`stores/uiStore.ts:1357`) — gespeichert wird also ein Wert, der nie gelesen wird.
- Weitere Schaltstellen: Tastenkürzel/Befehle `App.tsx:1178-1186`, Sprachbefehl
  `App.tsx:1260`, Tab-Klick `components/TabBar/TabBar.tsx:140-150` (setzt `editor`, auch aus
  Split heraus), Graph-Knotenklick → `split` `components/Canvas/GraphCanvas.tsx:2745`,
  Hilfe `components/Onboarding/HelpGuide.tsx:252-258`, Dateibaum
  `components/Sidebar/FileTree.tsx:500-501,1011,1019`.
- Übersetzung nennt `viewMode.canvas` noch „MindGraph“ (`utils/translations.ts:862`), der Knopf
  heißt hart „Brain“ (`App.tsx:1347`).

### 2. Was am Bildschirm zu sehen war (installierte App 1.3.3, 11.11.2026, per Computer-Use)

- **B1 „Editor“ zeigt keinen Editor.** Ausgangslage Split + Agent-Tab. Klick auf „Editor“: der
  Petrol-Agent füllt die Fläche, „Editor“ und „Agent“ leuchten beide. „Editor“ bedeutet
  tatsächlich „eine Fläche“, nicht „Notiz bearbeiten“.
- **B2 Agent sieht immer aktiv aus.** Mit Schwerpunkt `agent` ist der Knopf lila gefüllt, auch
  wenn das Dashboard oder Brain vorn ist. Die Tönung ist vom echten Aktiv-Zustand kaum zu
  unterscheiden (Bild `leiste-editor-dashboard.png`: Editor, Agent, Dashboard wirken alle an).
- **B3 Bis zu vier Knöpfe gleichzeitig an**: Split + Agent (Tönung) + Dashboard (aktiver Tab) +
  Text-Split (Bild `leiste-split-dashboard-textsplit.png`).
- **B4 Text-Split bleibt blau, obwohl gesperrt.** In Split ist der Schalter `disabled`, zeigt
  aber weiter den An-Zustand; die zweite Fläche ist dann gar nicht sichtbar.
- **B5 Zwei fast gleiche Symbole für zwei verschiedene Teilungen**: „Split“ (Rechteck mit
  Mittellinie) = Editor + Graph; Symbol ganz rechts (zwei Rechtecke) = zwei Notizen nebeneinander.
- **B6 Brain lässt die Tab-Leiste stehen.** In „Brain“ steht der Tab „Petrol Agent“ weiter
  markiert über dem Brain-Rückblick, zu sehen ist aber kein Agent.
- **B7 Agent/Dashboard verlassen Split ungefragt.** Aus Split auf „Dashboard“: Ansicht springt
  auf eine Fläche. Danach wieder „Split“ nötig. Split + Dashboard-Tab funktioniert technisch
  einwandfrei (Dashboard links, Brain rechts).

### 3. Nutzungsspuren (ehrlich: Klicks auf die Leiste werden nirgends gezählt)

- `ui-settings.json` des Nutzers: `workFocus = agent`, `editorDefaultView = preview`,
  `splitPosition ≈ 46 %` (also von Hand gezogen), `textSplitEnabled = false`.
- Tätigkeitsprotokoll (`userData/activity/…json`, 25.08.–11.11.2026): 140 abgeschlossene
  Agent-Läufe (Sep 56, Okt 41, Nov bisher 25), 126 angenommene Ergebnisse; dazu 16 gespeicherte
  Petrol-Gespräche. 51 Sprachbefehle „Was habe ich heute gemacht“.
- Heute stand die App auf Split + Agent-Tab — obwohl jeder Start auf `editor` zurücksetzt. Der
  Nutzer hat Split also selbst gewählt (Agent links, Brain-Rückblick rechts).
- Keine Daten zu: wie oft Brain allein, wie oft Dashboard, wie oft Text-Split. Aussagen dazu
  wären geraten.

### 4. Vorschlag von Claude (zum Angreifen)

**Diagnose:** Drei Sorten Knöpfe sehen gleich aus und stehen in einer Reihe: Aufteilung (A),
Ziel (B), Schalter (C). Daraus folgen B1–B5 und B7.

**Vorschlag, Stufe 1 (klein, ohne neue Zustände):**

1. Agent-, Dashboard-, Workflow-Knopf setzen `viewMode` nur dann auf `editor`, wenn er `canvas`
   ist. In Split bleibt Split (behebt B7; dasselbe für Tab-Klick `TabBar.tsx:148`).
2. Schwerpunkt-Tönung so ändern, dass sie nicht wie „aktiv“ aussieht (z.B. nur farbiges Symbol
   und Text, keine Füllung) — Füllung bleibt allein dem aktiven Ziel (behebt B2).
3. Text-Split-Schalter in Split/Brain nicht als „an“ zeigen (behebt B4).
4. Knopf „Editor“ umbenennen (z.B. „Einzeln“ oder „Notiz“) — oder siehe Stufe 2.

**Vorschlag, Stufe 2 (Neuordnung in zwei Gruppen):**

- **Links „Wohin“** (genau einer an, abgeleitet aus dem aktiven Tab bzw. `viewMode === 'canvas'`):
  Notizen · Agent · Dashboard · [Workflow] · Brain. „Notizen“ springt zum zuletzt aktiven
  Notiz-Tab. Bei Schwerpunkt `agent` steht Agent vorn.
- **Rechts vom Trenner „Daneben“** (ein Wahlschalter, drei Stellungen, zwei Symbole): nichts ·
  Brain/Graph daneben (heutiges Split) · zweite Notiz daneben (heutiger Text-Split). Gilt für
  jedes Ziel links außer Brain.
- Damit entfallen als eigene Knöpfe: „Editor“ und „Split“. Nichts entfällt als Funktion.
- Tastenkürzel und Befehlsnamen (`view-editor`, `view-split`, `view-brain`) bleiben und werden
  auf die neuen Stellungen abgebildet.

**Offene Fragen an Codex:**

- Ist „Brain“ ein Ziel (links) oder eine Aufteilung? Heute beides: allein als `canvas`, daneben
  als `split`.
- Soll der Start weiter immer auf `editor` zurücksetzen (`uiStore.ts:1776`), wenn der Nutzer
  nachweislich in Split arbeitet? Oder die letzte Aufteilung merken?
- Reicht Stufe 1, und Stufe 2 wäre Umbau ohne belegten Bedarf?

## Codex-Findings

### F01 — B1, B2, B3 und B6 sind Symptome verschiedener Zustände
Schwere: mittel
datei:zeile: `app/src/renderer/App.tsx:121-137,1277-1283,1333-1393,1593-1604`; `app/src/renderer/components/TabBar/TabBar.tsx:132-150`; `app/src/renderer/styles/index.css:584-590,677-689`
Status: [OFFEN]
B1 stimmt: „Editor“ markiert `viewMode`, nicht den aktiven Notiz-Tab; Agent ist dort sichtbar. B2 stimmt für den Agent-Schwerpunkt, die Tönung ist aber technisch **keine** `.active`-Klasse. B3 stimmt für die gezeigte Kombination aus Split, Agent-Schwerpunkt, Dashboard-Tab und gespeichertem Text-Split. B6 stimmt, weil die Tab-Leiste außerhalb der per `canvas` verdeckten Arbeitsfläche steht. Die Diagnose „drei Sorten Knöpfe“ erklärt B1–B3 teilweise, B6 dagegen auch dann noch, wenn die Knöpfe neu gruppiert sind.
Vorschlag: Layoutstatus, aktiven Tab, Schwerpunkt und nur vorgemerkten Text-Split getrennt kennzeichnen; für B6 die Tab-Leiste bei alleiniger Brain-Ansicht visuell als „im Hintergrund“ behandeln oder ausblenden, ohne den aktiven Tab zu verlieren.

### F02 — B4 ist ein vorgemerkter Zustand, kein falscher Storewert
Schwere: mittel
datei:zeile: `app/src/renderer/App.tsx:1390-1394,1598,1661-1673`; `app/src/renderer/stores/uiStore.ts:1357-1360,1422`
Status: [OFFEN]
B4 stimmt optisch: In Split/Brain ist der blau markierte Schalter gesperrt und die zweite Notiz nicht sichtbar. `textSplitEnabled` bleibt aber absichtlich erhalten und wird beim Rückweg zu `editor` wieder wirksam. Stufe 1 Punkt 3 ist nur als Darstellungsänderung sicher; ein Zurücksetzen des Schalters würde die gewählte Vergleichsansicht still löschen. Der rechte Bereich kann zudem ein Aufgaben-, Chat-, Inbox- oder anderes Modul statt einer zweiten Notiz zeigen.
Vorschlag: In Split/Brain den Knopf als „vorgemerkt, hier nicht sichtbar“ neutral darstellen und im Tooltip erklären; den Storewert beibehalten. Für die aktive Markierung nur `viewMode === 'editor' && textSplitEnabled` verwenden.

### F03 — B5 stimmt, doch „zweite Notiz“ beschreibt die rechte Fläche zu eng
Schwere: mittel
datei:zeile: `app/src/renderer/App.tsx:1341-1345,1390-1400,1661-1711`; `app/src/renderer/components/Sidebar/FileTree.tsx:486-491`; `app/src/renderer/components/PDFViewer/PDFViewer.tsx:223,348`
Status: [OFFEN]
B5 stimmt: Die beiden Symbole bezeichnen verschiedene Teilungen. Der Text-Split ist im Code aber auch der Platz für rechte Module; deren Vorrang verdrängt die zweite Notiz. Cmd/Ctrl-Klick im Dateibaum und PDF-Aktionen aktivieren den gespeicherten Text-Split sogar außerhalb des Knopfs. Stufe 2 „nichts / Brain / zweite Notiz“ bildet diese Kombinationen und die automatische Aktivierung nicht vollständig ab.
Vorschlag: Die zwei Teilungen durch eindeutige Beschriftung/Tooltip oder räumliche Trennung erklären. Text-Split als eigene Funktion behalten; nur den Knopf bei Platzmangel in ein Layoutmenü umziehen.

### F04 — B7 gilt für die Leistenknöpfe, nicht durchgängig für alle Einstiege
Schwere: hoch
datei:zeile: `app/src/renderer/App.tsx:1178-1186,1260,1279-1283,1353-1376,1930-1936`; `app/src/renderer/components/Onboarding/HelpGuide.tsx:248-258`; `app/src/renderer/components/Sidebar/FileTree.tsx:1004-1013`; `app/src/renderer/components/TabBar/TabBar.tsx:140-149`
Status: [OFFEN]
B7 stimmt für Leistenknöpfe und Tab-Klick. Stufe 1 ändert aber nur diese Aufrufstellen: `open-agent` in der Befehlspalette, der gesonderte Sprachbefehl Dashboard, Hilfe-Aktionen, Morning-Briefing und „Ordner mit Agent auswerten“ erzwingen weiter `editor`; `open-dashboard` und `open-workflow` in der Befehlspalette rufen dagegen nur den Tab-Store auf und bleiben in `canvas` unsichtbar. Die gleiche Nutzerabsicht hätte damit je nach Einstieg drei Ergebnisse.
Vorschlag: Eine gemeinsame Aktion „Tab sichtbar öffnen“ für Agent/Dashboard/Workflow definieren, die aus `canvas` zur Editorfläche wechselt und in `split` die Teilung erhält; alle genannten Einstiege daran angleichen. Die reinen `view-*`-Befehle bleiben Layoutbefehle.

### F05 — Split plus Agent/Dashboard ist technisch möglich, aber enger und teurer
Schwere: mittel
datei:zeile: `app/src/renderer/App.tsx:1601-1629,1726-1757`; `app/src/renderer/stores/uiStore.ts:1423`; `app/src/renderer/styles/index.css:564-599`
Status: [OFFEN]
Stufe 1 erhält bei Zielwechsel in Split beide Flächen. Das ist bei breitem Fenster nützlich und belegt B7. Bei schmalen Fenstern bleibt der Inhaltsbereich jedoch durch `splitPosition` aufgeteilt; Agent, Dashboard und Workflow bekommen nur einen Teil der Breite. Unter 1300 px verschwinden zudem fast alle Textlabels, während der Agent-Schwerpunkt weiter Platz beansprucht. Die bisherigen Zielknöpfe geben diesen Ansichten volle Breite. Die beobachteten 140 Agent-Läufe belegen Nutzung des Agenten, nicht Nutzung von Agent **neben** Brain.
Vorschlag: Stufe 1 nicht als pauschal bessere Voreinstellung verkaufen; mindestens eine leicht erkennbare Möglichkeit „allein anzeigen“ erhalten und die Breite der drei Zielansichten in Split am schmalen Fenster prüfen.

### F06 — Stufe 2 verliert die Unterscheidung Brain-Rückblick und Graph
Schwere: hoch
datei:zeile: `app/src/renderer/App.tsx:1178-1180,1347,1731-1757`; `app/src/renderer/components/TabBar/TabBar.tsx:144-146`; `app/src/renderer/components/Sidebar/FileTree.tsx:1015-1019`; `app/src/renderer/stores/uiStore.ts:1279,1561`
Status: [OFFEN]
„Brain“ ist im heutigen Modell weder einfach Ziel noch einfach Aufteilung: `canvas`/`split` bestimmen die Fläche, `brainLensActive` entscheidet darin zwischen BrainConstellation und GraphCanvas. Der Brain-Knopf aktiviert die Linse, `view-brain` setzt nur `canvas`, Canvas-Tabs und „Ordner im MindGraph“ schalten die Linse ausdrücklich aus. Stufe 2 benennt den rechten Zustand „Brain/Graph daneben“, legt aber weder die Linsenwahl noch diese Aufrufsemantik fest. Eine Abbildung aller Befehle auf drei Stellungen kann den bisherigen Graph-Zugang verdecken.
Vorschlag: Brain allein als Präsentation der rechten Fläche behandeln; Brain/Graph als eigenen Inhalt der Fläche erhalten. Vor einer Neuordnung erst die Linsenlogik und die Wirkung jedes Einstiegspunkts festlegen.

### F07 — „Notizen“ hat keinen eindeutigen Rücksprung und lässt Tabtypen aus
Schwere: hoch
datei:zeile: `app/src/renderer/stores/tabStore.ts:5-27,50-71,89-119,180-235`; `app/src/renderer/App.tsx:1614-1657`; `app/src/renderer/components/TabBar/TabBar.tsx:123-150`
Status: [OFFEN]
Stufe 2 verlangt den „zuletzt aktiven Notiz-Tab“. Der Store hält nur `activeTabId` und eine Tab-Liste, keine Verlaufsspur für den letzten Editor-Tab. Es kann auch gar keinen Notiz-Tab geben. Darüber hinaus existieren Canvas-, Code-, Plugin-Editor-, Modell-Leistungs- und Vergleichs-Tabs, die nicht in „Notizen · Agent · Dashboard · Workflow · Brain“ passen. Die versprochene Eigenschaft „genau einer an“ ist deshalb ohne neuen Zustand, Fallback und Zuordnungsregeln nicht erfüllbar.
Vorschlag: Stufe 2 erst mit vollständiger Tabtyp-Matrix, Rücksprungregel und Empty-State entwerfen. Bis dahin ist die Tab-Leiste der verlässliche Zielwechsel.

### F08 — Dreistellungswahl kann bestehende Kombinationen nicht ersetzen
Schwere: hoch
datei:zeile: `app/src/renderer/App.tsx:1598-1612,1661-1673,1714-1742`; `app/src/renderer/stores/uiStore.ts:1357-1362`; `app/src/renderer/components/Sidebar/FileTree.tsx:486-491`
Status: [OFFEN]
Stufe 2 behandelt „nichts / Brain daneben / zweite Notiz daneben“ als gegenseitig ausschließend. Heute sind `textSplitEnabled`, `splitPosition` und `textSplitPosition` getrennt gespeichert; rechte Modul-Panels haben zusätzlich eigene Laufzeitzustände. In `canvas` kann Brain/Graph sogar ein rechtes Modul neben sich haben; in `editor` kann ein Canvas-Tab lokal rechts erscheinen. Die Neuordnung müsste entscheiden, welche dieser Layouts beim Wechsel erhalten bleiben, verborgen werden oder verschwinden. „Nichts entfällt als Funktion“ ist derzeit nicht belegt.
Vorschlag: Kein Dreistellungsmodell einführen, bevor alle tatsächlich gerenderten Kombinationen und Übergänge spezifiziert sind. Für den aktuellen Bedarf die vorhandenen Zustände nur klarer anzeigen.

### F09 — Umbenennung zu „Notiz“ verschärft B1
Schwere: mittel
datei:zeile: `app/src/renderer/App.tsx:1333-1349,1614-1657`; `app/src/shared/commandCatalog.ts:42-47`; `app/src/renderer/utils/translations.ts:859-862`
Status: [OFFEN]
Stufe 1 Punkt 4 bietet „Einzeln“ oder „Notiz“ an. „Notiz“ wäre falsch, solange derselbe Knopf einen Agent-, Dashboard-, Workflow-, Code- oder Vergleichs-Tab ohne rechte Graphfläche zeigt. „Einzeln“ benennt die Aufteilung genauer, braucht aber mit dem Brain-Knopf zusammen die Erklärung „nur aktuelle Tab-Fläche“. Die Befehls-Palette verwendet weiter `view-editor`; ein sichtbarer neuer Name und alte Suchwörter sollten zusammenpassen.
Vorschlag: Falls umbenannt wird, „Eine Fläche“/„Einzeln“ mit eindeutigem Tooltip testen; „Notiz“ nur für einen tatsächlichen Tab-Rücksprung in Stufe 2 verwenden.

### F10 — Startmodus und Schwerpunkt nicht aus einem Nutzungssignal ableiten
Schwere: mittel
datei:zeile: `app/src/renderer/stores/uiStore.ts:1030,1355-1362,1751-1776`; `app/src/renderer/App.tsx:185-196`; `app/src/shared/workFocus.ts:1-30`; `app/src/renderer/components/Onboarding/steps/MissionsStep.tsx:13-19`
Status: [OFFEN]
Der gespeicherte `viewMode` wird nach erfolgreichem Laden auf `editor` überschrieben; der Default `split` kann beim Start ohne gespeicherte Einstellungen dennoch kurz oder dauerhaft greifen. Die Aussage „gespeichert wird ein Wert, der nie gelesen wird“ gilt daher nur für den Ladepfad mit Einstellungen. Für `workFocus=agent` erzwingt der spätere Startsprung ebenfalls `editor`. Ein heutiger Split-Zustand und `splitPosition ≈ 46 %` belegen eine Wahl, aber keine Präferenz, jedes Mal in Split zu starten. Umgekehrt ist ein genereller Reset ein unnötig gespeicherter Scheinzustand.
Vorschlag: Zunächst Reset beibehalten und die Persistenzsemantik bereinigen oder eine ausdrückliche „letzte Aufteilung wiederherstellen“-Option vorsehen. Wenn Wiederherstellung gewählt wird, Agent-Start und Brain ohne offenen Vault gesondert definieren.

### F11 — Kleinere Änderung erzielt den belegten Nutzen mit weniger Migrationslast
Schwere: mittel
datei:zeile: `app/src/renderer/App.tsx:1277-1402`; `app/src/renderer/styles/index.css:570-599,647-689`; `app/src/renderer/utils/translations.ts:859-862,1130-1133`; `app/src/renderer/components/Onboarding/HelpGuide.tsx:248-258`
Status: [OFFEN]
Die Screenshots belegen vor allem missverständliche Markierungen und Benennung, während Klickhäufigkeiten für Brain, Dashboard und Text-Split fehlen. Stufe 2 ändert Navigation, Rücksprung, Befehle und alle Hilfetexte, ohne dass dafür ein Nutzungsbedarf belegt ist. Der Hilfe-Guide und das Onboarding führen bereits zu Dashboard/Agent; eine neue Zielgruppe müsste dort mit erklärt werden. Im Präsentationsmodus werden nur visuelle Effekte reduziert (`App.tsx:1920-1921`), es gibt keine eigene Navigationsregel, die die Neuordnung rechtfertigt.
Vorschlag: Zuerst F02 (sichtbarer statt gespeicherter Text-Split), F01 (Schwerpunkt nur über Icon/Text, klare Aktivmarkierung) und F09 (Layoutname/Tooltip) umsetzen; B6 separat lösen. Falls danach B7 relevant bleibt, F04 konsistent über alle Einstiege angehen. Text-Split und Graph nicht entfernen; allenfalls den Text-Split-Knopf bei schmalen Fenstern in ein erklärtes Layoutmenü verschieben.

**Gesamtempfehlung:** Stufe 1 nur als korrigierten, kleinen Zustands- und Beschriftungsfix verfolgen; den Split-Erhalt für Zielwechsel erst mit den übrigen Aufrufstellen und der Breitenprüfung übernehmen. Stufe 2 zurückstellen. Brain ist Inhalt einer alleinigen oder rechten Fläche, keine weitere exklusiv wählbare Tabart. Den Start vorerst auf `editor` belassen und eine Wiederherstellung nur als bewusste Nutzeroption einführen. Entfernen sollte man die irreführende Aktiv-Füllung des Schwerpunkts und die sichtbare Aktivmarkierung des gerade verborgenen Text-Splits; Editor/Einzelfläche, Split, Brain/Graph und Text-Split als Funktionen erhalten.

## Claude-Antwort

Runde 1 (11.11.2026). Nutzerentscheidung: die vier kleinen Punkte umsetzen, Split bleibt beim
Öffnen von Agent/Dashboard/Workflow erhalten. Stufe 2 zurückgestellt.

- **F01 [ADRESSIERT]** — Schwerpunkt-Tönung ohne Füllung (`styles/index.css`, `.is-focus:not(.active)`);
  Ziel-Knöpfe sind nur „aktiv“, wenn die Tab-Fläche sichtbar ist (`tabAreaVisible` in `App.tsx`);
  Tab-Leiste in alleiniger Brain-Ansicht abgeblendet (`tab-bar--background`, außer Canvas-Tabs).
- **F02 [ADRESSIERT]** — Aktivmarkierung nur bei `viewMode === 'editor' && textSplitEnabled`;
  Storewert bleibt, Tooltip „vorgemerkt“ (`titlebar.textSplitParked`).
- **F03 [ADRESSIERT, teilweise]** — Tooltips beider Teilungen eindeutig. Kein Layoutmenü, Symbole unverändert.
- **F04 [ADRESSIERT]** — gemeinsame Aktion `showTabArea()` im uiStore (nur `canvas` → `editor`);
  genutzt von Leistenknöpfen, Palette (`open-agent/-dashboard/-workflow`), Sprachbefehl, Morning-Briefing,
  Hilfe, „Ordner mit Agent auswerten“, Tab-Klick. Der Startsprung (`App.tsx`, Schwerpunkt Agent) bleibt bei `editor`.
- **F05 [DISKUSSION]** — „Einzeln“ bleibt als Knopf für volle Breite. Schmale Fenster (< 1300 px) in Split
  nicht eigens geprüft.
- **F06, F07, F08 [ADRESSIERT durch Verzicht]** — Stufe 2 nicht umgesetzt.
- **F09 [ADRESSIERT]** — Knopf heißt „Einzeln“ / „Single“, Tooltip „nur die Tab-Fläche“; Palette
  „Ansicht: Einzeln (eine Fläche)“, Suchwort „editor“ bleibt.
- **F10 [OFFEN]** — Start-Reset und Persistenz von `viewMode` unverändert.
- **F11 [ADRESSIERT]** — Reihenfolge wie vorgeschlagen.

Beleg: `npm run typecheck` grün, `npm run test` 273 Dateien grün; Klickfolge in der Dev-App
(Testprofil, Modelltest-Vault) per DevTools-Protokoll ausgelesen.

## Status

Runde 1 umgesetzt (11.11.2026), nicht committet. Abnahme durch den Nutzer steht aus. Offen: F05 (schmale Fenster), F10.
