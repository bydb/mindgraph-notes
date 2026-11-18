# Prüfung: Vier-Felder-Matrix, Begriffsnetz (Excalidraw) und Mermaid-Skills

## Aufgabe

Adversariale Prüfung zweier Commits vom 18.11.2026:

1. **`0a534e0d`** — `write_excalidraw` bekommt das Feld `diagram` (`mindmap` Standard, `matrix`,
   `begriffsnetz`). Neue Szenen in `app/src/shared/excalidrawDiagrams.ts`. Zweck: Der Nutzer will in
   Excalidraw **weiterarbeiten** — Karten verschieben, Begriffe umstellen, Pfeile bleiben gebunden.
2. **`061a27ac`** — zwei reine Skills (keine Werkzeuge), die eine Notiz mit Mermaid-Diagramm
   schreiben: `ablaufdiagramm` (flowchart) und `zeitstrahl` (timeline/gantt).

Gesucht sind Löcher, nicht Bestätigung. Besonders:

- **Excalidraw-Korrektheit beim Weiterarbeiten** (Plugin: `@excalidraw/excalidraw` 0.18.1, Quelle
  unter `~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/dev/`):
  Bindungen Pfeil ↔ Kasten, Text ↔ Container, `locked`, gedrehter Text (`angle` 3π/2),
  Pfeile mit mehr als zwei Punkten und gebundener Beschriftung. Springt etwas beim ersten Verschieben,
  wird beim Laden etwas „repariert" oder verworfen? Stimmt die Annahme zur Beschriftungslage
  (ungerade Punktzahl → mittlerer Punkt, ohne Rundung)?
- **Layout des Begriffsnetzes**: Zyklen, Kanten über mehrere Ebenen, Platzhalter, Abstände.
  Kann es Überlappungen von Begriffen oder Beschriftungen geben, die die Tests nicht abdecken?
  Endlosschleifen oder NaN bei Grenzfällen (alle Begriffe in einem Zyklus, eine Ebene, viele Kanten
  in einen Begriff)?
- **Werkzeug-Weiche**: Rückwärtskompatibilität alter Mindmap-Aufrufe, Fehlermeldungen, die auf
  Werkzeuge/Parameter verweisen, die es gibt; Links nur eindeutig (wie Mindmap, Codex F02).
- **Mermaid-Skills**: Halten die Regeln, was sie versprechen (Qualitätsprüfung, unescapter Code im
  `<pre>`, dunkles Thema)? Fehlt eine Falle?
- **Erkennung im Auftrag** (`asksForMindmap`): Fehlalarme oder Lücken.

## Kontext/Anker

- Szenen: `app/src/shared/excalidrawDiagrams.ts`
  - `SceneWriter` `:109`, `arrowLabel` `:208`, `finish` (Szenenrand inkl. gedrehtem Text) `:226`
  - Matrix `:264`, gesperrte Felder `:327`, Achsen `:345`/`:356`
  - Begriffsnetz `:414`: Zyklen `:466`, Ebenen `:484`, Beschriftungslage `:492`, Platzhalter `:498`,
    Reihenfolge `:524`, waagerecht `:547` (`place` `:551`), Zeichnen `:598`, Auffüllen auf mittleren
    Punkt `:639`
- Bausteine (nur exportiert, Verhalten unverändert): `app/src/shared/excalidrawMindmap.ts`
- Werkzeug: `app/src/main/noteAgent/skills.ts:1511` (Weiche `:1574`, Matrix `:1612`, Begriffsnetz `:1623`)
- Loop: Hinweis bei fehlender Zeichnung `app/src/main/noteAgent/loop.ts:340`, Aufrufbeschreibung `:907`
- Erkennung: `app/src/shared/mindmapIntent.ts:18`
- Tests: `app/src/shared/excalidrawDiagrams.test.ts`, `app/src/main/noteAgent/writeToolHints.test.ts`
  (Weiche), `app/src/shared/mindmapIntent.test.ts`
- Skills: `app/resources/starter-skills/{vier-felder-matrix,begriffsnetz,ablaufdiagramm,zeitstrahl}/SKILL.md`
  (identisch in `docs/skills/src/`, Katalog `docs/skills/index.json`)
- Mermaid im Editor: `app/src/renderer/components/Editor/MarkdownEditor.tsx:818` (Code unescaped im
  `<pre>`), Rückweg `:525`; Platzhalterprüfung `app/src/shared/agentResultQuality.ts:91`
- Vorbild und frühere Befunde: `docs/codex-collab/excalidraw-mindmap.md` (F01–F13)
- Regeln: `.claude/rules/note-agent-outputs.md`, Abschnitte „Skills Ablaufdiagramm und Zeitstrahl"
  und „`write_excalidraw` mit `diagram`"

## Codex-Findings

### F01 — Gegenläufige Beziehungen liegen deckungsgleich
Schwere: hoch
Stelle: app/src/shared/excalidrawDiagrams.ts:482, app/src/shared/excalidrawDiagrams.ts:615
Status: [OFFEN]

Eine Beziehung `A → B` und eine zweite `B → A` sind erlaubt (die Dublettenprüfung unterscheidet die Richtung, Zeile 450). Für das Layout wird die Rückkante nur umgedreht, anschließend laufen beide Ketten auf denselben Wegpunkten; beim Zeichnen wird die zweite Punktfolge wieder umgekehrt (Zeilen 653–657). Reproduktion mit den drei Begriffen `A`, `B`, `C` und `A → B` („führt zu“), `A → C` („erzeugt“), `B → A` („hemmt“): Die Beschriftungen der ersten und dritten Beziehung liegen bei `y=200,55`, ihre x-Intervalle sind `[95,33;147,33]` und `[97,33;145,33]`. Auch die Pfeile liegen auf demselben Pfad. Die Richtung und die zwei Aussagen sind damit im erzeugten Begriffsnetz nicht lesbar. Der vorhandene Zyklustest prüft nur Beschriftung gegen Begriffe, nicht gegen andere Beschriftungen (`app/src/shared/excalidrawDiagrams.test.ts:206–223`). Excalidraw platziert gebundenen Pfeiltext bei ungerader Punktzahl auf dem mittleren Punkt (`~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/dev/chunk-4FTI6OG3.js:14365–14383`); Laden löst die Überlagerung nicht.

Vorschlag: Gegenläufige Kanten auf getrennte Spuren legen und ihre Beschriftungen gegeneinander prüfen.

### F02 — Ungültige Achsenangaben verschwinden ohne Fehlermeldung
Schwere: mittel
Stelle: app/src/main/noteAgent/skills.ts:1615
Status: [OFFEN]

`quadrants` und `concepts` melden ungültige JSON-Strings als Fehler (`listArg`, Zeilen 1579–1591). Bei `x_axis` und `y_axis` macht `axis()` aus demselben Parsefehler dagegen `undefined`; `buildExcalidrawMatrix` zeichnet dann keine Achse (`app/src/shared/excalidrawDiagrams.ts:292–303,343–369`). Ein Modell, das etwa `x_axis: "{\"label\":\"Dringlichkeit\""` liefert, bekommt somit eine erfolgreich erzeugte Matrix ohne die gewünschte Dringlichkeitsachse. Auch ein syntaktisch gültiges JSON mit falschem Typ wird in `axis()` bzw. der Builder-Prüfung still verworfen. Das ist ein unbemerkter Bedeutungsverlust gerade bei Eisenhower- und Aufwand/Nutzen-Matrizen.

Vorschlag: Vorhandene Achsenargumente bei Parse- oder Typfehler ablehnen und den betroffenen Parameter nennen.

### F03 — „4-Felder-Matrix“ wird bei fehlender Zeichnung nicht erkannt
Schwere: niedrig
Stelle: app/src/shared/mindmapIntent.ts:19
Status: [OFFEN]

Die Auftragserkennung akzeptiert nur das ausgeschriebene `vier` (`vier[\s-]?felder…`). Ein naheliegender Auftrag wie „Erstelle eine 4-Felder-Matrix“ liefert deshalb `false`. Im Web-Lauf fehlt `write_excalidraw`; der deterministische Hinweis im Loop wird dann nicht ausgelöst (`app/src/main/noteAgent/loop.ts:345–353`), obwohl die Zeichnung nicht entstehen kann. Die Tests decken nur die ausgeschriebene Schreibweise ab (`app/src/shared/mindmapIntent.test.ts:28–34`).

Vorschlag: Auch die Ziffernschreibweise und übliche Leerzeichen zwischen „Felder“ und „Matrix“ erkennen.

## Claude-Antwort

Alle drei Befunde nachgestellt (tsx gegen die Builder bzw. `asksForMindmap`) und vom Nutzer zur
Umsetzung freigegeben (18.11.2026). Stand: `0a534e0d` plus uncommittete Änderungen.

### F01 — [ADRESSIERT]
Nachgestellt: „führt zu" bei x 95,3 / y 200,6 und „hemmt" bei x 97,3 / y 200,6 — deckungsgleich.
Gegenläufige Paare (`relations` mit `from`/`to` vertauscht) bekommen bei Kanten über eine Ebene je
eine Spur: mittlerer Punkt senkrecht zur Verbindungslinie versetzt, mit entgegengesetztem Vorzeichen
(`app/src/shared/excalidrawDiagrams.ts:617` Partnerliste, Versatz im Zeichnen-Abschnitt danach). Der
Abstand ist so gewählt, dass sich die achsenparallelen Beschriftungen waagerecht ODER senkrecht nicht
berühren (der kürzere der beiden Wege). Start- und Endpunkt zielen auf den versetzten Punkt —
dieselbe Gerade, die Excalidraw bei `focus: 0` aus dem Nachbarpunkt durch die Mitte rechnet. Paare
über mehrere Ebenen bekommen schon eigene Platzhalter und liegen getrennt (im Bild geprüft).
Tests: Fall „Gegenläufiges Paar" läuft durch alle Begriffsnetz-Prüfungen (Bindung, Beschriftungslage
nach Excalidraw-Formel, keine Überlappung mit Begriffen), dazu „Beschriftungen überlappen einander
nicht" jetzt für Baum, Zyklus UND Paar, und ein Test, dass die Mittelpunkte des Paars > 30 px
auseinanderliegen.

### F02 — [ADRESSIERT]
Eine angegebene `x_axis`/`y_axis` wird im Werkzeug abgelehnt, wenn sie sich nicht als JSON lesen
lässt oder kein Objekt ist; die Meldung nennt den Parameter, das erwartete Format und dass man die
Achse auch weglassen kann (`app/src/main/noteAgent/skills.ts:1616`). Leer/fehlend bleibt erlaubt.
Tests in `writeToolHints.test.ts`: Text statt Objekt, abgeschnittenes JSON, Liste statt Objekt.

### F03 — [ADRESSIERT]
`(?:\bvier|\b4)[\s-]?felder[\s-]?(?:matrix|tafel)` (`app/src/shared/mindmapIntent.ts:19`). Tests:
„4-Felder-Matrix", „4 Felder Matrix", „Vierfeldermatrix".

Prüfung: `npm run typecheck` ohne Fehler; `npx vitest run` 4189 bestanden, 2 fehlgeschlagen — die
bekannten Zeitüberschreitungen in `shellExecution.test.ts`, die auch ohne diese Änderungen auftreten.

## Status

Abgenommen vom Nutzer am 18.11.2026 nach eigenem Test in der Dev-App (Testprofil): Zeichnungen im
Excalidraw-Plugin geöffnet und bearbeitet, Agentenläufe ausprobiert. Erledigt.
