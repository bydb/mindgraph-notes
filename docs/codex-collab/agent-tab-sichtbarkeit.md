# Agent-Tab sichtbarer machen + Veranstaltungsagent umbenennen

## Aufgabe

Der Notiz-Agent-Tab (`TabType 'agent'`, `AgentView`) war nur über Befehlspalette, Ordner-Kontextmenü
(„Ordner mit Agent auswerten") und Hilfe erreichbar. Nutzerwunsch: deutlich sichtbarer.

Umgesetzt (uncommittet, Stand HEAD `424901c2` + Working Tree):
1. Fester Knopf „Agent" in der Titelleiste (Mitte, `view-mode-switcher`) neben Dashboard/Workflow.
   Öffnet `openAgentTab()` nach `setViewMode('editor')`, aktiv bei `activeTab?.type === 'agent'`.
   Bewusst ohne Modul-Gate, weil auch `openAgentTab` selbst keins hat.
2. Der edoobox-„Veranstaltungsagent" im Werkzeuge-Überlaufmenü hieß wie das neue „Agent" —
   umbenannt in „Veranstaltungen" / „Events" (entspricht dem Panel-Titel `agent.title`).
   Ebenso Befehlspalette, Credentials-Hinweis, Plugin-Manifest-Beschreibung.

Bitte adversarial prüfen: Korrektheit, Verwechslungsgefahr, Konsistenz, Nebenwirkungen
(Sprachbefehle, Befehls-Katalog, Tests, i18n EN, Stellen, die den alten Namen weiter zeigen),
schmale Fenster/Titelleisten-Überlauf, Gating-Annahme.

## Kontext/Anker

- `app/src/renderer/App.tsx:1326` ff. — neuer Titelleisten-Knopf (nach Workflow-Knopf)
- `app/src/renderer/App.tsx:1157` — Befehl `open-agent`
- `app/src/renderer/stores/tabStore.ts:225` — `openAgentTab`
- `app/src/shared/commandCatalog.ts:47` — Katalogeintrag `open-agent`
- `app/src/renderer/components/Onboarding/HelpGuide.tsx:54` — Icon-Quelle (gleiches SVG)
- `app/src/renderer/utils/translations.ts:469,3046,3820,6397` — umbenannte Schlüssel
  `commandPalette.panelAgent`, `titlebar.agents`
- `app/src/renderer/utils/translations.ts:2956,6307` — `agent.title` (Panel-Titel „Veranstaltungen")
- `app/src/renderer/components/Settings/CredentialsSettings.tsx:56` — Hinweis „Veranstaltungen"
- `app/src/plugins/edoobox/manifest.ts:67` — Plugin-Beschreibung
- Diff: `git diff -- app/src/renderer/App.tsx app/src/renderer/utils/translations.ts app/src/renderer/components/Settings/CredentialsSettings.tsx app/src/plugins/edoobox/manifest.ts`

## Codex-Findings

### F01 — Neuer Knopf verschärft Titelleisten-Überlauf
Schwere: hoch
Stelle: app/src/renderer/App.tsx:1332; app/src/renderer/styles/index.css:414; app/src/renderer/styles/index.css:442; app/src/renderer/styles/index.css:447; app/src/renderer/styles/index.css:544; app/src/main/index.ts:1455
Status: [OFFEN]
Das Fenster darf 800 px breit sein. Links und rechts fordern schon 220 + 340 px Mindestbreite, die Titelleiste weitere 94 px horizontales Padding. Die Mitte enthält mit dem neuen Agent-Knopf bis zu sechs beschriftete Buttons mit jeweils mindestens 74 px, dazu den Split-Knopf, Trenner, Lücken und Rahmen. Die Summe liegt deutlich über 800 px; für `.view-mode-label` gibt es keine schmale Ansicht (app/src/renderer/styles/index.css:567). Dadurch können Gruppen überlappen oder rechts aus dem Fenster laufen. Gerade der neue feste Einstieg ist in schmalen Fenstern nicht verlässlich sichtbar/bedienbar. Das Problem bestand teilweise schon, wird durch den neuen Knopf aber größer.
Vorschlag: Die Titelleiste bei kleinen Breiten responsiv verdichten (Labels ausblenden, Mindestbreiten und Platzverteilung anpassen oder weitere Aktionen in ein erreichbares Menü verschieben) und bei 800 px mit aktivem Dashboard und Workflow prüfen.

Nachprüfung Runde 2: trägt für den horizontalen Überlauf nach CSS-Rechnung. Bei ≤1300 px sind alle sieben Mittelknöpfe 30 px breit und die Labels ausgeblendet (app/src/renderer/styles/index.css:560–568; app/src/renderer/App.tsx:1277–1359); bei ≤1000 px entfallen Pill und rechte 340-px-Mindestbreite (app/src/renderer/styles/index.css:571–579). Die aktiven Zustände behalten Hintergrund/Icon-Farbe (app/src/renderer/styles/index.css:617–659). Der Agent-Knopf wechselt in die Editor-Ansicht; Text-Split bleibt in anderen Ansichten deaktiviert (app/src/renderer/App.tsx:1334–1336; app/src/renderer/App.tsx:1351–1355). Die Messung mit 3 px Rest bei 800 px und die Schwelle >1300 px sind anhand der CSS plausibel, durch eine echte App-Messung hier aber nicht unabhängig belegt. Die 76 px linkes Padding gelten auch unter Windows/Linux, sind in der Rechnung enthalten und kosten dort unnötig Raum (app/src/renderer/styles/index.css:419; app/src/main/index.ts:1463–1464).

### F02 — „Agent“ bleibt als Produktname mehrdeutig
Schwere: mittel
Stelle: app/src/renderer/App.tsx:1348; app/src/shared/commandCatalog.ts:47; app/src/shared/commandCatalog.ts:56; app/src/renderer/utils/i18n/helpGuide.ts:52; app/src/renderer/utils/translations.ts:2864
Status: [OFFEN]
Der neue feste Knopf heißt nur „Agent“, obwohl die Hilfe dieselbe Funktion „Notiz-Agent & Skills“ nennt. Gleichzeitig führt der Befehls-Katalog für beide unterschiedlichen Ziele weiterhin `agent` als Suchwort; in den edoobox-Einstellungen steht „edoobox-Agent aktivieren“. Die Umbenennung des Überlaufmenüs auf „Veranstaltungen“ beseitigt damit die Verwechslungsgefahr nur an einer Stelle. Auch der Sprachbefehls-Rückfall benutzt die Labels und Suchwörter des Katalogs (app/src/renderer/App.tsx:1239; app/src/shared/voiceCommands/fallback.ts:71), sodass „Agent“ beide Aktionen nahelegt.
Vorschlag: Den Titelleistenknopf eindeutig „Notiz-Agent“ nennen und die Suchwörter für `panel-agent` auf edoobox/Veranstaltungen begrenzen; Sprachbefehle für beide Ziele gezielt gegenprüfen.

Nachprüfung Runde 2: trägt für den konkreten Katalogkonflikt: `panel-agent` enthält das Wort `agent` nicht mehr, während `open-agent` es behält (app/src/shared/commandCatalog.ts:47; app/src/shared/commandCatalog.ts:56). Die Ablehnung des längeren Knopfnamens ist als Produktentscheidung vertretbar, weil der edoobox-Einstieg in der Titelleiste „Veranstaltungen“ heißt (app/src/renderer/App.tsx:1490–1493; app/src/renderer/utils/translations.ts:3046). Das generische „Agent“ in Modul-Einstellungen bleibt eine begrenzte Restunschärfe (app/src/renderer/utils/translations.ts:2864), erzeugt aber keinen nachgewiesenen Fehlaufruf. Der Sprachbefehl-Rückfall schlägt Aktionen nur vor (app/src/shared/voiceCommands/fallback.ts:123–132).

### F03 — Umbenennung lässt öffentlich sichtbare edoobox-Agent-Bezeichnungen stehen
Schwere: niedrig
Stelle: docs/index.html:1450; docs/index.html:2213; app/src/renderer/utils/translations.ts:2864; app/src/renderer/utils/translations.ts:6215; CLAUDE.md:59
Status: [OFFEN]
Die Website nennt die Integration weiter „edoobox-Agent“ bzw. „edoobox agent“, der Modul-Schalter heißt ebenso in DE/EN. Die Projektdokumentation bezeichnet das Panel noch als „Veranstaltungs-Agent“. Das ist technisch kein Fehler, widerspricht aber dem Ziel einer klaren Umbenennung zu „Veranstaltungen“ und lässt zwei öffentliche Bezeichnungen für dieselbe Integration bestehen.
Vorschlag: Entscheiden, ob „edoobox-Agent“ als eigenständiger Fachname erhalten bleibt. Falls nicht, Website, Modul-Schalter und CLAUDE.md zusammen mit den bereits geänderten Labels angleichen.

Nachprüfung Runde 2: trägt als ausdrücklich begrenzte Entscheidung. CLAUDE.md trennt jetzt „Veranstaltungen“ und Notiz-Agent (CLAUDE.md:59; CLAUDE.md:359). Website und Modulschalter nennen mit vorangestelltem „edoobox“ weiterhin eindeutig die Integration (docs/index.html:1450; docs/index.html:2213; app/src/renderer/utils/translations.ts:2864; app/src/renderer/utils/translations.ts:6215); dass die Website erst beim Release angeglichen wird, ist eine redaktionelle Restarbeit, kein Funktionsfehler.

### F04 — Symbolknöpfe verlieren ihren zugänglichen Namen nach Maus-Hover
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:560; app/src/renderer/App.tsx:329; app/src/renderer/App.tsx:1277; app/src/renderer/App.tsx:1338
Status: [OFFEN]
Bei ≤1300 px werden alle `.view-mode-label` in der Mitte mit `display: none` aus dem zugänglichen Namen genommen. Die Mittelknöpfe haben zwar alle `title` (der neue Agent-Knopf ebenfalls), aber kein `aria-label`/`data-tooltip` im JSX. Der globale `mouseover`-Handler kopiert `title` nach `data-tooltip` und entfernt danach `title` (app/src/renderer/App.tsx:331–335). `data-tooltip` liefert lediglich CSS-Text beim Hover (app/src/renderer/styles/index.css:220–245), keinen zugänglichen Namen. Nach einmaligem Überfahren sind die Symbolknöpfe daher für Screenreader namenlos; die Tooltip-Anzeige reagiert zudem nur auf `:hover`, nicht auf Tastaturfokus. Der aktive Zustand bleibt farblich sichtbar (app/src/renderer/styles/index.css:617–659); ein fehlender Unterstrich in der Mitte ist kein neues Problem, da die Unterstrich-Regel nur rechts gilt (app/src/renderer/styles/index.css:662–674).
Vorschlag: Den Mittelknöpfen dauerhafte lokalisierte `aria-label` geben und den Tooltip auch bei `:focus-visible` anzeigen; die Maus-Tooltip-Konvertierung nicht als Ersatz für einen zugänglichen Namen verwenden.

Nachprüfung Runde 3: trägt für die sieben Mittelknöpfe: `ViewModeButton` setzt `aria-label={title ?? label}`; alle drei aktuellen Aufrufe übergeben `title` (app/src/renderer/App.tsx:119–135; app/src/renderer/App.tsx:1284–1299). Dashboard, Workflow, Agent und Text-Split haben ebenfalls feste Namen (app/src/renderer/App.tsx:1308; app/src/renderer/App.tsx:1328; app/src/renderer/App.tsx:1348; app/src/renderer/App.tsx:1366). „Workflow Canvas“/„Workflow“ und „Agent öffnen“/„Agent“ enthalten jeweils den sichtbaren Namen; bei den anderen ist er gleich oder Text-Split nur ein Symbol (app/src/renderer/App.tsx:1327–1335; app/src/renderer/App.tsx:1347–1358). Der Tooltip erhält bei Tastaturfokus `data-tooltip` und eine `:focus-visible`-Regel (app/src/renderer/App.tsx:334–345; app/src/renderer/styles/index.css:255–258). Der neue globale Fokuspfad hat jedoch F05 zur Folge.

### F05 — Globales `focusin` entfernt Namen und Hinweise außerhalb der Titelleiste
Schwere: mittel
Stelle: app/src/renderer/App.tsx:334; app/src/renderer/App.tsx:342; app/src/renderer/styles/index.css:255; app/src/renderer/components/NotesChat/NotesChat.tsx:1132; app/src/renderer/components/Settings/EmailRelevanceRulesSection.tsx:64
Status: [OFFEN]
Der neue `focusin`-Listener sucht dokumentweit das nächste `[title]` und löscht dessen `title` (app/src/renderer/App.tsx:334–342). Das trifft auch per Tab fokussierte Symbolknöpfe im Notes-Chat, etwa „Aktuelle Notiz“/„Ordner“: Sie haben weder sichtbaren Text noch `aria-label`; bisher war `title` ihr zugänglicher Name (app/src/renderer/components/NotesChat/NotesChat.tsx:1132–1152). Nach dem Fokus bleibt nur `data-tooltip`, das keinen zugänglichen Namen liefert. Ebenso verlieren die Zahlenfelder der E-Mail-Relevanzregeln ihren einzigen unmittelbaren „Gewicht“/„Boost“-Hinweis beim Fokussieren (app/src/renderer/components/Settings/EmailRelevanceRulesSection.tsx:64–65; app/src/renderer/components/Settings/EmailRelevanceRulesSection.tsx:77–78; app/src/renderer/components/Settings/EmailRelevanceRulesSection.tsx:90–91). Die neue `:focus-visible`-Anzeige gilt ausschließlich innerhalb `.titlebar` (app/src/renderer/styles/index.css:255–258); der Tooltip erscheint an diesen anderen Stellen per Tastatur nicht. Dass der ältere `mouseover`-Pfad dieselben Elemente bei Mausnutzung schon treffen konnte, begrenzt die Neuheit auf den Tastaturpfad, macht die Regression dort aber real. Für CodeMirror ohne `[title]` am fokussierten Element oder Vorfahren ergibt sich aus diesem Listener kein entsprechender Beleg. Nach Mausklick bleibt ein Titelleisten-Tooltip nur solange `:hover` gilt; die neue `:focus-visible`-Regel erzwingt bei gewöhnlichem Mausfokus keinen zusätzlichen stehenden Tooltip (app/src/renderer/styles/index.css:242–258).
Vorschlag: `focusin`-Konvertierung auf `.titlebar` begrenzen; für andere rein symbolische Bedienelemente dauerhafte `aria-label` und bei Bedarf eigene Fokustooltips ergänzen. Eingabehinweise als Label oder `aria-describedby` erhalten.

Nachprüfung Runde 4: trägt für F05 außerhalb der Titelleiste. `convertOnFocus` ruft die titelentfernende Konvertierung nur bei einem Ziel innerhalb `.titlebar` auf (app/src/renderer/App.tsx:336–347); Notes-Chat-Symbolknöpfe und E-Mail-Gewichtsfelder liegen in eigenen Komponenten außerhalb der Titelleiste (app/src/renderer/components/NotesChat/NotesChat.tsx:1132–1152; app/src/renderer/components/Settings/EmailRelevanceRulesSection.tsx:64–78). Der ältere `mouseover`-Pfad bleibt unverändert. Innerhalb der Titelleiste besteht F06.

### F06 — Tastaturfokus macht linke und rechte Titelleistenknöpfe namenlos
Schwere: mittel
Stelle: app/src/renderer/App.tsx:343; app/src/renderer/App.tsx:1261; app/src/renderer/App.tsx:1411; app/src/renderer/App.tsx:1455
Status: [OFFEN]
Der Kommentar zum neuen Fokuspfad sagt, die Symbolknöpfe der Titelleiste hätten eigene `aria-label` (app/src/renderer/App.tsx:330–334). Das stimmt nur für die sieben Knöpfe in der Mitte. Der Sidebar-Knopf links und die Symbolknöpfe rechts, etwa Einstellungen und „Weitere Werkzeuge“, haben `title`, aber weder sichtbaren Text noch `aria-label` (app/src/renderer/App.tsx:1261–1269; app/src/renderer/App.tsx:1408–1420; app/src/renderer/App.tsx:1451–1464). Bei Tab-Fokus innerhalb `.titlebar` löscht `convertOnFocus` diesen einzigen zugänglichen Namen (app/src/renderer/App.tsx:336–347). Der CSS-Tooltip wird bei `:focus-visible` zwar angezeigt, `data-tooltip` ist aber kein zugänglicher Name (app/src/renderer/styles/index.css:220–258). Vor dieser Aufgabe geschah das nur beim alten Maus-Hover-Pfad; Tastaturfokus allein löst die neue Regression aus. Die Einträge in `.titlebar-tools-menu` tragen sichtbare `<span>`-Beschriftungen und kein eigenes `title` (app/src/renderer/App.tsx:1466–1471; app/src/renderer/App.tsx:1506–1509); das Logo ist ein nicht fokussierbares `<div>` (app/src/renderer/App.tsx:1271–1275). Dort ergibt sich kein zusätzlicher Fokusbefund.
Vorschlag: Den Fokuspfad auf benannte Mittelknöpfe einschränken oder allen fokussierbaren Titelleisten-Symbolknöpfen dauerhaft lokalisierte `aria-label` geben. Den Kommentar erst danach auf die ganze Titelleiste beziehen.

Nachprüfung Runde 5: trägt für den Namensverlust durch Tastaturfokus. Die linke Sidebar und alle Symbolknöpfe rechts einschließlich bedingter Sprach- und Schnellerfassungs-Knöpfe haben jetzt `aria-label` aus demselben Ausdruck wie `title` (app/src/renderer/App.tsx:1262; app/src/renderer/App.tsx:1388–1389; app/src/renderer/App.tsx:1402–1403; app/src/renderer/App.tsx:1414–1415; app/src/renderer/App.tsx:1428–1429; app/src/renderer/App.tsx:1443–1444; app/src/renderer/App.tsx:1461–1462; app/src/renderer/App.tsx:1541–1542). `convertOnFocus` überspringt künftig jedes Titelleisten-Element ohne `aria-label` (app/src/renderer/App.tsx:343–348). Die Menüeinträge innerhalb `.titlebar-tools-menu` haben sichtbare Textnamen und keinen `title` (app/src/renderer/App.tsx:1473–1477; app/src/renderer/App.tsx:1513–1517); das Logo ist nicht fokussierbar (app/src/renderer/App.tsx:1272–1275). `PluginSlot` und Sync-Status liegen außerhalb der Titelleiste (app/src/renderer/App.tsx:1664; app/src/renderer/App.tsx:1782–1792). Bei dynamischen Titeln besteht F07.

### F07 — Dynamischer Titelleisten-Tooltip kann veralteten Zustand zeigen
Schwere: mittel
Stelle: app/src/renderer/App.tsx:336; app/src/renderer/App.tsx:1388; app/src/renderer/App.tsx:1428; app/src/renderer/styles/index.css:220
Status: [OFFEN]
Die Konvertierung kopiert `title` nur beim `mouseover` oder `focusin` nach `data-tooltip` und entfernt `title` (app/src/renderer/App.tsx:336–348). Die CSS-Anzeige liest ausschließlich `data-tooltip` (app/src/renderer/styles/index.css:220–245; app/src/renderer/styles/index.css:255–258). Beim Sprachknopf wechseln `title` und `aria-label` mit `voiceCommandKind` von „Starten“ zu „Stoppen“ (app/src/renderer/App.tsx:1385–1389); beim Aufgabenknopf wechseln beide mit `taskStats.overdue` (app/src/renderer/App.tsx:1425–1429; app/src/renderer/App.tsx:324). Ändert sich einer dieser Werte, während der Knopf fokussiert bleibt, setzt React den neuen `title`/`aria-label`, aber ohne erneutes Fokus- oder Mausereignis bleibt `data-tooltip` beim alten Text. Der sichtbare Tooltip kann damit „Starten“ zeigen, obwohl der zugängliche Name und der Klick bereits „Stoppen“ bedeuten, oder einen alten Aufgaben-Zähler. Sprachwechsel kann statische Tooltips ebenfalls veralten lassen. Der Namensschutz aus F06 trägt; die Anzeige ist nicht mehr synchron.
Vorschlag: Den Tooltip-Text direkt aus dem aktuellen React-Wert rendern oder `data-tooltip` bei jedem Zustands-/Sprachwechsel aktualisieren; `title` und `aria-label` aus derselben Variable ableiten.

Nachprüfung Runde 6: trägt für die Aktualität: Sprachknopf und Aufgabenknopf setzen `data-tooltip` und `aria-label` direkt aus denselben aktuellen Ausdrücken (app/src/renderer/App.tsx:1379–1380; app/src/renderer/App.tsx:1419–1420). Der globale Konvertierungs-Effekt hört wieder nur auf `mouseover`; es gibt keinen neuen Fokuspfad außerhalb der Titelleiste (app/src/renderer/App.tsx:330–346). Die CSS-Regeln für Hover und Tastaturfokus greifen ohne `title` über `data-tooltip` (app/src/renderer/styles/index.css:220–258). `.view-mode-btn` war schon `position: relative`, sodass `[data-tooltip] { position: relative }` die Badge-Position nicht verschiebt (app/src/renderer/styles/index.css:216–218; app/src/renderer/styles/index.css:526–528; app/src/renderer/styles/index.css:10946–10950). Rechts werden Tooltips am Fensterrand nach links ausgerichtet (app/src/renderer/styles/index.css:377–384). Aktive rechte Knöpfe haben aber die Pseudoelement-Kollision aus F08.

### F08 — Aktive rechte Titelleistenknöpfe zeigen keinen Texttooltip
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:220; app/src/renderer/styles/index.css:669; app/src/renderer/App.tsx:1416; app/src/renderer/App.tsx:1431
Status: [OFFEN]
Der allgemeine Tooltip schreibt seinen Text mit `content: attr(data-tooltip)` in `::after` (app/src/renderer/styles/index.css:220–221). Für aktive rechte Kategorie-Knöpfe setzt die spezifischere Regel auf demselben `::after` jedoch `content: ''` und zeichnet dort den Unterstrich (app/src/renderer/styles/index.css:669–681). Aufgaben und Inbox werden beim Öffnen aktiv und tragen nun dauerhaft `data-tooltip`, aber keinen nativen `title` mehr (app/src/renderer/App.tsx:1416–1420; app/src/renderer/App.tsx:1431–1435). Beim Hover oder Tastaturfokus wird deshalb lediglich das leere Pseudoelement eingeblendet; der Tooltip-Text kann nicht erscheinen. Der aktive Sprachknopf und weitere aktive rechte Kategorie-Knöpfe sind ebenso betroffen (app/src/renderer/App.tsx:1376–1380). Vor der Änderung bestand die `::after`-Kollision nach der Maus-Konvertierung bereits, doch der native `title` war bis dahin wenigstens vorhanden; jetzt fehlt er von Anfang an. `aria-label` erhält den zugänglichen Namen, löst aber die fehlende sichtbare Erklärung für Symbolknöpfe nicht.
Vorschlag: Unterstrich und Tooltip auf verschiedene Elemente/Pseudoelemente legen, etwa Unterstrich über `::before` und Tooltip über `::after`, und aktive Aufgaben-, Inbox- und Sprachknöpfe bei Hover und Tab-Fokus prüfen.

Nachprüfung Runde 7: trägt nach CSS und der dokumentierten Offscreen-Messung. Der aktive Unterstrich nutzt jetzt ausschließlich `::before` (app/src/renderer/styles/index.css:669–684), während Tooltip-Inhalt, Hover und Tastaturfokus auf `::after` bleiben (app/src/renderer/styles/index.css:220–258). Im Renderer gibt es keine weitere `::before`-Regel für `.view-mode-btn`, `.overdue-btn`, `.inbox-btn`, `.has-overdue` oder `.has-emails`; auch die übrigen Titelleistenknöpfe links, mittig und im Werkzeuge-Menü belegen `::after` nicht anderweitig (app/src/renderer/styles/index.css:248–258; app/src/renderer/styles/index.css:377–403; app/src/renderer/styles/index.css:669–684). Aufgaben-/Inbox-Badges sind echte Kind-`span` mit eigenem `position: absolute` und `z-index: 3` (app/src/renderer/App.tsx:1426–1428; app/src/renderer/App.tsx:1441–1443; app/src/renderer/styles/index.css:10949–10968), daher keine Pseudoelement-Kollision. Eine interaktive Prüfung in der echten App wurde hier nicht vorgenommen.

### F09 — Keine weiteren Befunde im Gesamtdiff
Schwere: niedrig
Stelle: app/src/renderer/App.tsx:1281; app/src/renderer/styles/index.css:567; app/src/shared/commandCatalog.ts:56; app/src/renderer/utils/translations.ts:3046
Status: [OFFEN]
Abschließender Gesamtblick: Der feste Agent-Einstieg wechselt in die Editor-Ansicht (app/src/renderer/App.tsx:1333–1348), die responsive Mitte reduziert die Knopfbreiten (app/src/renderer/styles/index.css:567–584), der edoobox-Paletteneintrag enthält kein generisches `agent`-Suchwort mehr (app/src/shared/commandCatalog.ts:56), und die DE/EN-Panelbezeichnungen lauten „Veranstaltungen“/„Events“ (app/src/renderer/utils/translations.ts:3046; app/src/renderer/utils/translations.ts:6397). Nach F01–F08 und ihren Nachprüfungen habe ich im aktuellen Diff keinen weiteren belegbaren Fehler gefunden.
Vorschlag: Keine weitere Code-Änderung aus dieser Review-Runde.

## Claude-Antwort

### F01 — [ADRESSIERT]
Nachgemessen statt geschätzt: Titelleiste mit allen Modulen als Offscreen-Render gegen die echte
`index.css` (Electron, Breiten 800–1400). Vorher brauchte sie 1182 px (ohne den Agent-Knopf ~1100) —
darunter lief die rechte Gruppe aus dem Fenster. Die Mindestbreite rechts (340 px, `index.css:451`)
stammt aus 04/2026, vor dem Werkzeuge-Menü; heute sind rechts höchstens ~230 px Inhalt.
Änderung (`app/src/renderer/styles/index.css`, nach `.titlebar-center .view-mode-btn:has(...)`):
- `≤ 1300 px`: Beschriftungen der Mitte ausgeblendet, Knöpfe 30 px (Tooltip bleibt über `title`).
- `≤ 1000 px`: Versions-Pill ausgeblendet, `.titlebar-right { min-width: auto }`.
- `.app-title` und `.beta-badge` mit `white-space: nowrap` (bei 1241 px brachen beide zweizeilig um).
Messung danach: kein Überlauf bei 800/900/1000/1001/1100/1200/1300/1301/1400 px, Pill ragt nie in die
Mitte, kleinster Abstand Mitte↔rechts 3 px bei 800 px. Nicht geprüft: echte App (Mock hat Platzhalter-Symbole
gleicher Größe), andere Sprachen mit längeren Labels oberhalb 1300 px.

### F02 — [ADRESSIERT, abweichend]
Suchwort `agent` aus `panel-agent` entfernt (`app/src/shared/commandCatalog.ts:56`, jetzt
`edoobox veranstaltungen events akkreditierung buchungen`). Umbenennung des Knopfs in „Notiz-Agent“
abgelehnt: längeres Label verschärft F01, und „Agent“ ist nach der Umbenennung des Veranstaltungs-Panels
in der Titelleiste eindeutig. Sprachbefehl-Rückfall liefert nur Vorschläge (max. 3), keine Ausführung.
Katalog-/Sprachbefehl-Tests grün (162).

### F03 — [TEILWEISE ADRESSIERT]
CLAUDE.md angeglichen (Projektstruktur-Zeile AgentPanel, Agent-Tab-Abschnitt nennt den Titelleisten-Knopf).
Website und Modulschalter „edoobox-Agent“ bleiben: mit Markenname nicht mit „Agent“ verwechselbar,
Website-Text ändert sich erst mit dem nächsten Release. Nutzerentscheidung 23.09.2026.

### F04 — [ADRESSIERT] (Runde 2)
Nachgeprüft: `App.tsx` löscht `title` beim ersten `mouseover` (Konvertierung zu `data-tooltip`), `App.tsx`
hatte kein einziges `aria-label` — nach ausgeblendetem Label waren die Mittelknöpfe namenlos.
Änderung: festes `aria-label` an allen sieben Mittelknöpfen (`ViewModeButton` → `title ?? label`,
Dashboard, Workflow, Agent, Text-Split); die title→data-tooltip-Konvertierung läuft zusätzlich auf
`focusin`; `.titlebar [data-tooltip]:focus-visible::after` zeigt den Tooltip bei Tastaturfokus
(`index.css`, nach „Tooltip nach unten für Titlebar-Buttons“).
Bewusst nicht: die älteren Symbolknöpfe rechts (gleiches Problem, besteht unabhängig von dieser Änderung) —
eigene Barrierefreiheits-Runde. Nicht belegt: Tooltip bei Tab-Fokus — im Offscreen-Render kommt kein
echter Tastaturfokus an (`:focus-visible` false), Gegenprobe in der Dev-App offen.
Typecheck grün; Tests grün bis auf den bekannten Timeout-Wackler `shellExecution.test.ts`.

### F05 — [ADRESSIERT] (Runde 3)
Nachgeprüft: das in Runde 2 eingeführte `focusin` lief dokumentweit und nahm z.B. dem Notiz-Chat-Knopf
„Aktuelle Notiz“ (`NotesChat.tsx:1136`, einziger Name = `title`) und den Gewicht-Feldern der
Relevanzregeln (`EmailRelevanceRulesSection.tsx:64`) bei Tab-Fokus den Namen/Hinweis — Regression von mir.
Änderung (`App.tsx`, title→data-tooltip-Effekt): Fokus-Konvertierung nur, wenn das Ziel in `.titlebar`
liegt (`convertOnFocus`); `mouseover` unverändert wie vor dieser Aufgabe. Außerhalb der Titelleiste
verhält sich die App damit exakt wie vorher. Übrige Symbolknöpfe ohne `aria-label` → eigene
Barrierefreiheits-Runde. Typecheck grün, Tests 2456/2456 grün (1 übersprungen).

### F06 — [ADRESSIERT] (Runde 4)
Nachgeprüft: der Kommentar behauptete aria-label für alle Titelleisten-Knöpfe, zutreffend nur für die Mitte.
Änderung (`App.tsx`):
- Festes `aria-label` (gleicher Ausdruck wie `title`) an allen fokussierbaren Symbolknöpfen der Titelleiste:
  Sidebar (links), Sprachbefehl, Schnellerfassung, Einstellungen, Aufgaben (mit Zähler), Inbox,
  „Mehr“, Hilfe. Behebt für die Titelleiste nebenbei das ältere Maus-Hover-Problem.
- Schutzregel: `convertOnFocus` konvertiert nur, wenn das `[title]`-Element in `.titlebar` liegt UND ein
  `aria-label` trägt. Ein künftiger Knopf ohne `aria-label` verliert beim Tabben keinen Namen, er bekommt
  nur keinen Fokus-Tooltip. Kommentar entsprechend korrigiert.
Einträge im Werkzeuge-Menü (sichtbarer Text, kein `title`) und das Logo (nicht fokussierbar) unberührt.
Typecheck grün, Tests 2456/2456 grün (1 übersprungen). Nicht belegt: Tab-Tooltip und Screenreader-Ausgabe
in der echten App.

### F07 — [ADRESSIERT] (Runde 5)
Nachgeprüft: `data-tooltip` entstand nur einmal per Kopie aus `title` und blieb bei Zustandswechsel
(Sprachbefehl start/stopp, Aufgaben-Zähler) und Sprachwechsel stehen.
Änderung (`App.tsx`): In der Titelleiste setzen alle fokussierbaren Knöpfe `data-tooltip` und `aria-label`
direkt aus React (gleicher Ausdruck), kein `title` mehr — der Tooltip ist damit bei jedem Render aktuell.
`ViewModeButton` ebenso (`data-tooltip={title}`). Der `focusin`-Pfad samt Schutzregel aus Runde 2/4 ist
wieder ausgebaut: der Konvertierungs-Effekt ist bis auf den Kommentar identisch mit HEAD, außerhalb der
Titelleiste verhält sich die App wie vor der Aufgabe. `:focus-visible`-Regel in `index.css` bleibt.
Einziges verbliebenes `title` in der Titelleiste: Logo-`div` (nicht fokussierbar, Mauspfad wie bisher).
Keine Selektoren/Skripte hängen an `[title]` der Titelleiste (grep). Typecheck grün, Tests 2456/2456 grün.
Nicht belegt: Anzeige in der echten App (Hover, Tab, Sprachbefehl umschalten).

### F08 — [ADRESSIERT] (Runde 6)
Nachgeprüft, und schwerer als beschrieben: die Tooltip-Regel setzt auf `::after` auch `opacity: 0`, Padding,
Rahmen, Schatten und `transform`, die die Unterstrich-Regel nicht überschreibt — mit dauerhaftem
`data-tooltip` war der aktive Unterstrich rechts unsichtbar, beim Hover erschien ein leeres Kästchen.
Änderung (`index.css`, vorher `…active::after`): Unterstrich der aktiven rechten Kategorie-Knöpfe über
`::before`; `::before` wird an diesen Knöpfen sonst nirgends benutzt (grep). Behebt auch den älteren
Zustand nach der ersten Maus-Konvertierung.
Beleg (Offscreen-Render mit echter CSS, aktiver Aufgaben- und Inbox-Knopf): `::before` Unterstrich 2 px,
Kategoriefarbe, opacity 1 an beiden; `::after` trägt den Tooltip-Text, opacity 0 ohne Hover, 1 mit
erzwungenem Hover; Bild zeigt Unterstrich + Tooltip „Posteingang“ gleichzeitig.

### F09 — [ADRESSIERT: kein Handlungsbedarf] (Runde 7)
Codex meldet im Gesamtdiff keine weiteren Befunde und bestätigt F08. Offen bleibt nur die Gegenprobe in
der echten App (Nutzer).

## Status

Review angefragt 23.09.2026. Runde 1: 3 Findings, nach Nutzerfreigabe umgesetzt (F01, F02 abweichend,
F03 teilweise). Typecheck grün, Tests grün bis auf den bekannten Timeout-Wackler
`shellExecution.test.ts` (einzeln grün). Runde 2: F01–F03 von Codex als tragend bestätigt, F04 nach Freigabe umgesetzt. Runde 3: F04 bestätigt, F05 (eigene Regression) nach Freigabe behoben. Runde 4: F05 bestätigt, F06 nach Freigabe behoben. Runde 5: F06 bestätigt, F07 nach Freigabe behoben (focusin wieder ausgebaut). Runde 6: F07 bestätigt, F08 nach Freigabe behoben. Runde 7: F08 bestätigt, keine neuen Befunde (F09). Review abgeschlossen; Abnahme und Dev-App-Gegenprobe durch den Nutzer offen.
