# Mindmap als Excalidraw-Datei (Notiz-Agent: `write_excalidraw` + Skill)

## Aufgabe

Der Nutzer will einen Skill, mit dem der Notiz-Agent **Excalidraw-Zeichnungen im Design von
MindGraph Notes** erzeugt. Erste Runde: **nur Mindmaps** (Nutzerentscheidung 12.10.2026). Ablauf-
und Vergleichsdiagramme sind ausdrücklich nicht Teil dieser Runde, der Entwurf soll sie aber nicht
verbauen.

**Runde 1 (Plan-Review):** Codex prüft den Entwurf unten adversarial, bevor Code entsteht. Die
Fragen, an denen der Ansatz am ehesten scheitert:

1. Öffnet das Excalidraw-Plugin die erzeugte Datei **ohne Reparatur und ohne Sprung** — sitzen Texte
   in ihren Kästen, hängen die Linien an den Knoten, bleibt das nach dem ersten Bearbeiten so?
2. Stimmt die **eingebettete Vorschau** (`![[x.excalidraw]]`), die nur die gespeicherte Geometrie
   nutzt, mit dem überein, was der Editor zeigt?
3. Kann das Modell etwas, das es nicht können soll (Schrift, Farben, Pfade, Links auf erfundene
   Notizen, Riesen-Dateien)?

**Runde 2 (Implementierungs-Review):** folgt, sobald der Code steht.

## Kontext/Anker

Vorbild ist `write_edumap`: Das Modell liefert eine Gliederung, die App baut das Dateiformat.

- `app/src/shared/edumap.ts:1-80` — Bauart: pure, Grenzen als Konstante, `…InputError` mit
  `issues[]`, Ablehnung statt stillem Kürzen.
- `app/src/main/noteAgent/skills.ts:1147-1230` — Werkzeug `write_edumap`: JSON-String-Toleranz für
  verschachtelte Arrays, `sanitizeOutputFileName`, `registerStagedResult`.
- `app/src/main/noteAgent/skills.ts:309` — `registerStagedResult`; `skills.ts:312` Ergebnis-Arten.
- `app/src/main/noteAgent/staging.ts:18` — `ALLOWED_OUTPUT_EXT` (kennt `.excalidraw` noch nicht).
- `app/src/main/noteAgent/runRegistry.ts:37` — `AgentResultEntry.kind`.
- `app/src/main/noteAgent/loop.ts:214` — Werkzeug-Allowlist; `loop.ts:256` Web-Lauf entfernt Writer;
  `loop.ts:555` Anzeige der Werkzeugaufrufe.
- `app/src/main/index.ts:5174` — Vorschau des Ergebnisses (`textKinds`).
- `app/src/shared/noteKind.ts:20-47` — `NOTE_KINDS` mit `dotColor`/`canvasColor` (Problem
  `#d93d42`/`#ffcdd2`, Lösung `#208f4f`/`#c8e6c9`, Info `#256fd1`/`#bbdefb`).
- `app/src/renderer/styles/index.css:32` — Petrol `--accent-color: #10696b` (hell), `:119` `#3cbfb3` (dunkel).
- `app/src/renderer/components/Canvas/` + `utils/layouts/` — vorhandene Layout-Logik des Graph-Canvas
  (nur als Ideengeber; das Mindmap-Layout ist einfacher, siehe unten).

Excalidraw-Plugin (eigenes Repo `~/dev/mindgraph-excalidraw-plugin`, Stand v0.6.0, Commit `50977ab`):

- `src/renderer.tsx:58-75` — **eingebettete Schriften**: Virgil 1, Cascadia 3, Excalifont 5,
  Nunito 6, Lilita One 7, Comic Shanns 8, Liberation Sans 9. Eine Szene mit einer anderen
  `fontFamily` (z. B. Helvetica = 2) wird **read-only** geöffnet (`unsupported-font`).
- `src/renderer.tsx:466-540` — Ladeweg: `JSON.parse` → Schriftprüfung → Fonts laden → `restore(scene,
  null, null)` **ohne `refreshDimensions`** → Baseline. Excalidraw misst Texte beim Laden also nicht
  neu; die Maße aus der Datei gelten.
- `src/renderer.tsx:771-810` — Einbettung in Notizen über `exportToSvg` mit **gespeicherter Geometrie**.
- `node_modules/@excalidraw/excalidraw` 0.18.1 — Typen der Elemente (`ExcalidrawTextElement`,
  `ExcalidrawArrowElement`, Bindings) sind die Referenz für den Builder.
- Links in Elementen: Plugin v0.5.0 leitet `[[Notiz]]` über `host.openLink` an die App weiter
  (`shared/pluginLink.ts`); `[[Notiz#Abschnitt]]` springt nicht zum Abschnitt.

## Entwurf

### Grundsatz

Das Modell schreibt **kein Excalidraw-JSON und keine Koordinaten**. Es liefert eine Gliederung,
`shared/excalidrawMindmap.ts` baut die Szene. Begründung: Jedes Element braucht IDs, `seed`,
`versionNonce`, gegenseitige Verweise (Text ↔ Container über `containerId`/`boundElements`, Linie ↔
Knoten über `startBinding`/`endBinding` und `boundElements` auf beiden Seiten) und Koordinaten ohne
Überlappung — genau das, was Modelle zuverlässig falsch machen. Schrift, Farben und Formen bestimmt
allein die App.

### Eingabe des Modells

```ts
interface MindmapInput {
  title: string            // Text des Mittelknotens
  branches: Array<{
    text: string
    kind?: NoteKindId                       // 'problem' | 'solution' | 'info' (F01), färbt nach NOTE_KINDS
    link?: string                           // optional, nur [[Wikilink]] (siehe unten)
    children?: Array<{ text: string; kind?: …; link?: string }>
  }>
  style?: 'klar' | 'skizze'                 // Default 'klar'
}
```

Tiefe fest **Mitte → Ast → Blatt** (zwei Ebenen unter der Mitte). Eine dritte Ebene ist in dieser
Runde nicht vorgesehen — wer mehr braucht, soll eine zweite Mindmap anlegen.

### Grenzen (Ablehnung mit `issues[]`, nie still kürzen)

| Grenze | Wert |
|---|---|
| Äste | 2–8 |
| Blätter je Ast | 0–6 |
| Knoten gesamt | ≤ 40 |
| Zeichen Mitte | ≤ 60 |
| Zeichen je Knoten | ≤ 80 |
| Zeilen je Knoten nach Umbruch | ≤ 3 |

Leere Texte, doppelte Geschwisterknoten (normalisiert gleich) und Steuerzeichen werden abgelehnt.
Unbekannte `kind`-Werte (auch deutsche wie `loesung`) werden mit `issues[]` abgelehnt, nicht
abgebildet — das Werkzeugschema nennt die drei erlaubten Werte (F01).

**Zeichenvorrat (F06):** erlaubt sind nur Zeichen, für die die gewählte Schrift im Plugin eingebettet
ist UND für die die Breitentabelle einen gemessenen Wert hat. Für Nunito heißt das die Bereiche
`U+0020–00FF`, `U+0100–017F` (Latin Extended-A), `U+2000–206F` (typografische Zeichen) und `U+20AC`;
für Excalifont die Schnittmenge mit dessen erstem und zweitem Subset (`build.mjs:52-55`). Jedes
andere Zeichen (Emoji, CJK, Kyrillisch, Griechisch …) führt zur Ablehnung mit Nennung des Zeichens.
Kein Rückfall auf „breiteste Breite" — eine Ersatzschrift ist keine obere Schranke.

### Layout (deterministisch, ohne Messung im DOM)

Zweiseitiger Baum wie in klassischen Mindmap-Programmen, nicht rein radial (radial wird ab sechs
Ästen mit Blättern unleserlich und braucht Kollisionsauflösung):

1. Äste werden nach Reihenfolge abwechselnd rechts/links verteilt, bei Gleichstand der Höhen so, dass
   beide Seiten etwa gleich hoch werden (Greedy nach Teilbaumhöhe).
2. Teilbaumhöhe = Summe der Blatthöhen + feste Abstände; Ast mittig vor seinen Blättern.
3. Spalten mit festem Abstand: Mitte | Äste | Blätter. Spaltenbreite = breitester Knoten der Spalte.
4. Beide Seiten werden vertikal um die Mitte zentriert.

Keine Überlappung **per Konstruktion** (Stapel in Spalten), im Test trotzdem geprüft.

### Textmaße ohne Browser

Der Main kann nicht messen, Excalidraw misst beim Laden nicht nach (siehe Anker), und die Vorschau
nutzt gespeicherte Maße. Deshalb:

- **Breitentabelle für Nunito** (Gewicht 500, wie im Plugin eingebettet): einmalig per Skript aus
  der eingebetteten Schriftdatei erzeugt (Advance-Widths in Einheiten pro em für genau den
  zulässigen Zeichenvorrat oben), als Konstante in `shared/excalidrawFontMetrics.ts`. Kerning wird
  nicht berechnet; stattdessen ein fester Sicherheitszuschlag auf die Zeilenbreite, dessen Höhe die
  Messung unten festlegt.
- **Messung statt Annahme (F06):** ein Prüfsatz ganzer Zeilen (kurz, lang, Umlaute, ß, Ziffern,
  Gedankenstriche, Großbuchstaben-Folgen, lange Komposita) wird einmalig im Plugin-Editor per CDP
  mit Canvas `measureText` in beiden Stilen gemessen und als Fixture eingecheckt. Der Test verlangt:
  gerechnete Breite ≥ gemessene Breite für JEDE Zeile, und höchstens 8 % darüber. Ein Plugin-Schritt
  „beim ersten Öffnen nachmessen" kommt in dieser Runde nicht — er würde die erste Einbettung nicht
  heilen; falls nötig später als ausdrücklicher Migrationspfad.
- Umbruch an Wortgrenzen auf eine Zielbreite (Ast 220 px, Blatt 200 px bei 16/20 px Schrift),
  `lineHeight` 1.25 wie Excalidraw-Default für Nunito.
- Text-Element bekommt die gerechnete `width`/`height`, `text` mit den eingefügten Umbrüchen,
  `originalText` ohne (so wie Excalidraw es selbst speichert), `autoResize: true`.
- Container = Textmaß + Innenabstand; Excalidraw zentriert gebundenen Text selbst
  (`verticalAlign: 'middle'`, `textAlign: 'center'`).

Für `style: 'skizze'` (Excalifont) dieselbe Methode mit eigener Tabelle.

### Aussehen („MindGraph-Hausstil")

| Teil | klar | skizze |
|---|---|---|
| Schrift | Nunito (6) | Excalifont (5) |
| `roughness` | 0 | 1 |
| Mitte | Füllung Petrol `#10696b`, Text weiß, 24 px, `roundness: {type: 3}` | gleich, Füllung `hachure` |
| Ast | Rahmen Petrol 2 px, Füllung Petrol 12 % auf Weiß (fester Hexwert), 20 px | gleich |
| Blatt | Rahmen Petrol 1 px, Füllung weiß, 16 px | gleich |
| Ast/Blatt mit `kind` | Rahmen `dotColor`, Füllung `canvasColor` aus `NOTE_KINDS` | gleich |
| Verbinder | Pfeil-Element (`type: 'arrow'`, `elbowed: false`, `startArrowhead: null`, `endArrowhead: null`) mit beidseitigen Bindings (`focus`, `gap`, kein `fixedPoint`), Petrol, 2 px (Ast) / 1 px (Blatt), drei Punkte mit `roundness: {type: 2}` (sanfte Kurve) — F07 | gleich |
| Hintergrund | `appState.viewBackgroundColor: '#ffffff'` | gleich |

Farben kommen ausschließlich aus Konstanten; das Modell kann keine Farbe angeben. Der Dunkelmodus
von Excalidraw invertiert die Szene selbst — keine eigene Dunkelvariante.

`appState.currentItemFontFamily` und `currentItemStrokeColor` werden auf Schrift und Petrol gesetzt,
damit Ergänzungen des Nutzers im selben Stil entstehen.

### Szene

```json
{ "type": "excalidraw", "version": 2, "source": "https://mindgraph-notes.de",
  "elements": [ … ], "appState": { … }, "files": {} }
```

- Elementfelder vollständig nach den 0.18.1-Typen (`frameId: null`, `groupIds: []`, `locked: false`,
  `updated`, `link`). **`index: null`** (F08): Excalidraw vergibt die fraktionalen Indizes beim
  `restore()` aus der Array-Reihenfolge — sowohl im Editor als auch in der Einbettung
  (`renderer.tsx:525,799`). Die Array-Reihenfolge IST damit die Zeichenreihenfolge.
- **Determinismus (F10):** IDs, `seed` und `versionNonce` aus einem PRNG mit Seed = Hash(Eingabe).
  Zugesagt ist: gleiche Eingabe **und gleicher Zeitstempel** → byte-gleiche Datei. `updated` ist der
  beim Aufruf übergebene Zeitstempel (Tests übergeben einen festen).
- Zeichenreihenfolge: Verbinder zuerst (liegen unter den Knoten), dann je Knoten Container + Text.
- Keine Gruppen: gebundener Text hängt über `containerId` am Knoten, eine Gruppe würde das
  Verschieben einzelner Knoten nur erschweren.
- `customData: { mindgraph: { generator: 'mindmap', version: 1 } }` auf dem Mittelknoten, damit eine
  spätere Version erzeugte Dateien erkennt (keine Logik daran in dieser Runde).

### Links

`link` vom Modell als `[[Notizname]]` oder `[[Ordner/Notiz]]`. Das Werkzeug **löst im Main auf
genau eine `.md`-Datei auf** (F02): erst exakter vault-relativer Pfad, dann exakter Dateiname ohne
Endung (Groß/Klein egal), nie unscharf. Kein Treffer → Ablehnung („Notiz nicht gefunden"),
mehrere Treffer → Ablehnung mit den Kandidatenpfaden. Gespeichert wird immer der **kanonische
vault-relative Pfad ohne Endung**, `[[Ordner/Unterordner/Datei]]` — `findNoteForWikilink` prüft den
Pfad zuerst (`renderer/utils/linkExtractor.ts:89-95`), damit öffnet der Klick im Plugin dieselbe Datei.
`.mindgraph` ist ausgeschlossen. Test: zwei Notizen gleichen Namens in verschiedenen Ordnern →
Ablehnung beim Kurznamen, Erfolg beim Pfad, und der gespeicherte Pfad löst im Renderer-Resolver
auf genau diese Datei auf.
Externe URLs in dieser Runde nicht (Mindmap aus Vault-Material; Web-Läufe sind ausgeschlossen).

### Werkzeug `write_excalidraw`

- `main/noteAgent/skills.ts`: Parameter `file_name` (Endung `.excalidraw`), `title`, `branches`,
  optional `style`. Toleriert `branches` als JSON-String (wie `write_edumap`). Ruft
  `buildExcalidrawMindmap`, registriert das Ergebnis als `kind: 'excalidraw'`.
- Zusammenfassung auf der Karte: „Mindmap, N Äste, M Blätter — in einer Notiz mit
  `![[datei.excalidraw]]` einbetten".
- `staging.ts`: `.excalidraw` in `ALLOWED_OUTPUT_EXT`; neue Art `excalidraw` in
  `runRegistry.ts:37`, `skills.ts:312` **und** `ResultFormat` in `shared/activityLog.ts:106` (F09);
  `index.ts:5174`: als Textart vorschaubar.
- `loop.ts`: in die Allowlist, Anzeige `pick('file_name')` + „(N Knoten)"; im **Web-Lauf entfernt**
  (wie `write_edumap` — kein Platz für den Quellen-Vertrag).
- `write_note` lehnt `.excalidraw` mit Verweis auf `write_excalidraw` ab (wie bei `.json`/Edumap,
  `skills.ts:1503`).
- Arbeitsbilanz (F09): `write_excalidraw` in `deriveActivityType` (`shared/activityLog.ts:451`) zu
  den Dokument-Writern; Test „reiner Mindmap-Lauf → `document`, Format `excalidraw`" in
  `activityLog.test.ts`.
- **Keine Begleitnotiz in dieser Runde** (F03, Nutzerentscheidung 12.10.2026): Ergebnisse werden
  einzeln übernommen und bei Namensgleichheit umbenannt (`index.ts:5108`, `reserveFreeName`); ein
  vorab geschriebenes `![[map.excalidraw]]` zeigte dann auf eine fremde oder keine Datei. Der Skill
  verbietet `write_note` mit Einbettung der eigenen Mindmap; die Abschlussnachricht nennt die
  Einbettungszeile zum Kopieren. Eine gemeinsame Übernahme mit Namensnachzug ist ein eigener
  späterer Schritt.

### Ergebniskarte (F04, F05 — Nutzerentscheidung 12.10.2026)

- Die Vorschau zeigt den Inhalt ausdrücklich als **„Quelltext (Excalidraw-JSON)"**, nicht als
  Zeichnung. Eine Bildvorschau auf der Karte kommt später (bräuchte das Plugin).
- Neuer Knopf **„Übernehmen und in MindGraph öffnen"**, nur wenn das Excalidraw-Plugin aktiv ist und
  `.excalidraw` beansprucht. Er öffnet nach dem Übernehmen den Plugin-Tab
  (`openPluginEditorTab`, wie beim Wikilink-Klick) — NICHT `openPath`/Systemprogramm
  (`noteAgentStore.ts:439-456`). `.excalidraw` kommt deshalb NICHT in `FORMATS_NEEDING_EXTERNAL_APP`;
  der Store bekommt einen eigenen Öffnungsweg für Plugin-Formate.
- Ohne Plugin: kein Öffnen-Knopf; die Karte sagt „Zum Ansehen in MindGraph das Excalidraw-Plugin
  installieren (Einstellungen → Module → Plugins). Ohne Plugin lässt sich die Datei auf
  excalidraw.com über ‚Öffnen' laden."

### Skill `resources/starter-skills/mindmap/SKILL.md` (auch `docs/skills/`)

- Wann: „Mindmap", „Überblick als Bild", „Ideen ordnen".
- Schritte: Thema als Mitte (kurz), 3–7 Äste als Oberbegriffe, je Ast 2–5 Blätter in Stichworten
  (keine Sätze), Kategorien nur, wenn der Inhalt sie trägt, Links nur auf gelesene Notizen
  (mit Pfad, wie `note_read` ihn bekam). Nur lateinische Schrift, keine Emojis.
- Keine Begleitnotiz mit Einbettung (siehe F03); stattdessen die Zeile `![[datei.excalidraw]]` in
  der Abschlussnachricht nennen.
- Deutlich unter 12 000 Zeichen (Skill-Grenze in `skillsLoader.ts`).

### Plugin nicht installiert

Das Werkzeug bleibt auch ohne Plugin verfügbar (kein Gating, F05) — die Datei ist
Standard-Excalidraw. Was die Karte dann sagt, steht unter „Ergebniskarte".

### Tests (`shared/excalidrawMindmap.test.ts`)

- Strukturinvarianten: jede `containerId` zeigt auf einen existierenden Container, der den Text in
  `boundElements` führt; jede Binding ist beidseitig; keine verwaisten `boundElements`; alle
  `fontFamily` ∈ eingebettete IDs; IDs eindeutig; alle `index` = `null`; Pfeile `elbowed: false`
  mit `null`-Pfeilspitzen.
- Zeichenvorrat: jedes Zeichen außerhalb des erlaubten Vorrats → Ablehnung mit dem Zeichen.
- Kategorien: `solution` färbt grün; `loesung` und Unbekanntes → Ablehnung.
- Geometrie: keine Überlappung der Knoten-Rechtecke; Verbinder-Endpunkte liegen am Rand ihres Knotens
  (± `gap`); Text passt in den Container.
- Grenzen: jede Grenze einzeln überschritten → Ablehnung mit passender Meldung.
- Determinismus: gleiche Eingabe + gleicher Zeitstempel → gleicher String.
- Textmaße: ganze Zeilen gegen die eingecheckte Canvas-Messung (siehe „Textmaße"), beide Stile.
- **Gegenprobe im Plugin-Repo** (optional, falls jsdom reicht): `restore()` auf drei Fixtures →
  Reihenfolge erhalten, Bindings unverändert, Elemente bis auf von `restore` gesetzte Felder gleich.

### Manuelle Gegenprobe (GUI per CDP, Testprofil)

**Pflicht vor Abnahme** (F04, F07). Mindmap mit 2, 5 und 8 Ästen, mit Umlauten und langen Wörtern,
beide Stile:

1. Zuerst **eingebettet** ansehen, bevor die Datei je im Editor war (Lesen- und Schreiben-Modus) —
   das ist der Zustand mit den reinen Builder-Maßen.
2. Im Editor öffnen: keine Read-only-Meldung, Texte springen nicht, nichts läuft über.
3. Je einen Knoten links und rechts sowie einen Ast mit Blättern verschieben — die Linien folgen.
4. Speichern, Tab schließen, neu öffnen — Linien hängen weiter, Lage unverändert.
5. Erneut eingebettet ansehen — entspricht dem Editor.
6. Dunkelmodus, SVG-Export, Link-Klick auf eine Notiz mit Namensdoppel in anderem Ordner.
7. Ergebniskarte mit und ohne aktives Plugin (Knopf da/nicht da, Text ohne Plugin).

## Fragen an Codex (zusätzlich zu den drei oben)

- Reicht die Breitentabelle, oder braucht es einen Normalisierungsschritt im Plugin beim ersten
  Öffnen (`customData`-Marker → `refreshDimensions` + Container nachziehen + speichern)? Der würde
  eine neue Plugin-Version mit Prod-Signierung bedeuten und die Vorschau vor dem ersten Öffnen
  trotzdem nicht korrigieren.
- Verbinder als Pfeil-Element mit Bindings oder als ungebundene `line`? Bindings lassen Linien beim
  Verschieben folgen, sind aber die fehleranfälligste Stelle des Formats (`focus`, `gap`,
  `fixedPoint`, Elbow-Pfeile in 0.18).
- Fraktionaler `index`: selbst erzeugen oder weglassen und `restore`/`syncInvalidIndices` überlassen?
  Weglassen spart Fehler, bedeutet aber, dass die Datei vor dem ersten Speichern im Editor nicht
  vollständig ist (Vorschau über `exportToSvg`).
- Link-Prüfung „existiert im Vault": welche Auflösung ist die richtige, damit derselbe Link im Plugin
  per `openLink` auch dieselbe Notiz öffnet (`findNoteForWikilink` im Renderer vs. Main-Auflösung)?

## Codex-Findings

### F01 — Kategorienamen passen nicht zur zentralen Typdefinition
Schwere: hoch
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:69-75,138
Status: [OFFEN]
Die Eingabe erlaubt `kind: 'problem' | 'loesung' | 'info'`, `NOTE_KINDS` verwendet jedoch `problem | solution | info` (`app/src/shared/noteKind.ts:13,24-47`). Ein direkter Zugriff `NOTE_KINDS[kind]` liefert für `loesung` keinen Wert; die versprochene Grünfärbung kann dann scheitern.
Vorschlag: Eingabe und Tool-Schema auf `solution` vereinheitlichen oder `loesung` ausdrücklich vor dem Lookup abbilden und unbekannte Werte mit `issues[]` ablehnen.

### F02 — Link-Existenz ist nicht Link-Auflösung
Schwere: hoch
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:165-170,235-236
Status: [OFFEN]
`note_read` akzeptiert ausschließlich einen konkreten vault-relativen `.md`-Pfad (`app/src/main/telegram/agent/tools/notes.ts:81-101`). Der Plugin-Klick geht dagegen über `classifyPluginLink` und die Renderer-Notizliste (`app/src/shared/pluginLink.ts:35-55`, `app/src/renderer/plugins/external/rendererHostClient.ts:22-35`); `findNoteForWikilink` probiert nach dem Pfad Titel, Dateinamen und schließlich den ersten unscharfen Pfadtreffer (`app/src/renderer/utils/linkExtractor.ts:89-95,113-130`). Damit kann eine bloße Existenzprüfung einen anderen oder mehrdeutigen Treffer freigeben als der spätere Klick.
Vorschlag: im Main eindeutig zu genau einer `.md`-Datei auflösen, bei Mehrdeutigkeit ablehnen und einen kanonischen vault-relativen Pfad als `[[Pfad/Datei]]` speichern; mit dem Renderer-Resolver gegen doppelte Titel und Dateinamen testen.

### F03 — Zwei Ergebnisse können die Einbettung zerbrechen
Schwere: hoch
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:177-178,186,193
Status: [OFFEN]
Mindmap und Begleitnotiz sind unabhängige Ergebnis-Karten. Beim Übernehmen reserviert Main pro Karte einen freien Namen und kann etwa `map.excalidraw` in `map (2).excalidraw` umbenennen (`app/src/main/index.ts:5091-5111`, `app/src/main/noteAgent/staging.ts:80-89`); die Begleitnotiz wird als Markdown unverändert geschrieben (`app/src/main/index.ts:5112-5117`). Ihr vorab erzeugtes `![[map.excalidraw]]` zeigt dann auf die alte Datei oder ins Leere. Die Plugin-Einbettung verlangt zudem eine existierende, vom aktiven Plugin beanspruchte Datei (`app/src/renderer/components/Editor/MarkdownEditor.tsx:709-719`).
Vorschlag: abhängige Ergebnisse beim Accept gemeinsam übernehmen und den endgültigen Namen in der Begleitnotiz ersetzen, oder bei Kollision die Übernahme mit klarer Fehlermeldung abbrechen.

### F04 — Ergebniskarten zeigen nur JSON-Text
Schwere: mittel
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:179-180,202-221
Status: [OFFEN]
Die geplante Erweiterung von `textKinds` liefert lediglich einen UTF-8-String, maximal 200.000 Zeichen (`app/src/main/index.ts:5162-5188`). Die Ergebniskarte zeigt ihn in `<pre>`, nicht als Zeichnung (`app/src/renderer/components/Agent/AgentRunPanel.tsx:243-259`). Die in Leitfrage 2 geforderte visuelle Übereinstimmung zwischen Einbettung und Editor ist damit vor der Übernahme nicht prüfbar.
Vorschlag: entweder eine echte SVG-Vorschau für die Ergebniskarte planen oder die Karte ausdrücklich als JSON-Quelltext bezeichnen und die SVG/Editor-Gegenprobe als verpflichtenden Abnahmetest vorsehen.

### F05 — Ohne Plugin führt die Karte nicht zum versprochenen Öffnen
Schwere: mittel
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:196-200
Status: [OFFEN]
`needsExternalApp` führt `.excalidraw` nicht, weshalb die Karte keinen Knopf „Übernehmen und öffnen“ anbietet (`app/src/renderer/utils/resultFormats.ts:9-20`, `app/src/renderer/components/Agent/AgentRunPanel.tsx:263-275`). Auch mit `openAfter` würde der Store `openPath` für das Systemprogramm nutzen, nicht den Plugin-Editor (`app/src/renderer/stores/noteAgentStore.ts:439-456`). Ein `![[...excalidraw]]` wird nur bei aktivem Renderer-Plugin zum Plugin-Embed (`app/src/renderer/components/Editor/MarkdownEditor.tsx:709-719`).
Vorschlag: Plugin-Verfügbarkeit und einen konkreten Öffnungsweg in der Karte vorsehen; ohne Plugin eine ehrliche Export/Import-Anleitung statt „öffnet auf excalidraw.com“ anbieten. Gating ist nur nötig, falls Öffnen in MindGraph zwingender Teil des Werkzeugs sein soll.

### F06 — Schrift-ID allein garantiert keine passenden Textmaße
Schwere: hoch
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:111-127,202-214,225-228
Status: [OFFEN]
Das Plugin lädt zwar seine sieben eingebetteten Familien vor dem Editor (`~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:479-525`), die Font-Dateien sind aber nach Unicode-Bereichen aufgeteilt und für seltene Glyphen ist System-Fallback ausdrücklich vorgesehen (`~/dev/mindgraph-excalidraw-plugin/build.mjs:51-65,76-86,225-241`). Die geplante Tabelle für Latin-1 und einige Sonderzeichen kann die reale Breite eines unbekannten Glyphs, einer Ersatzschrift oder einer Wortkombination nicht beweisen; der breiteste Tabellenwert pro Zeichen ist keine verlässliche obere Schranke. `restore()` wird in Editor und Einbettung ohne `refreshDimensions` aufgerufen (`~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:525,799-814`), sodass falsche Maße gerade vor dem ersten Edit sichtbar bleiben.
Vorschlag: zulässigen Zeichenvorrat mit nachgewiesener Glyph-Abdeckung festlegen oder alle verwendeten Zeichen gegen die eingebetteten Subsets prüfen; vollständige Zeilen und schwierige Fälle in beiden Stilen gegen Canvas-Messung testen, nicht nur eine 3-%-Stichprobe einzelner Breiten. Einen Plugin-Normalisierungsschritt nur als expliziten Migrationspfad planen, da er die erste Einbettung nicht heilt.

### F07 — Bindings brauchen einen verpflichtenden Roundtrip-Test
Schwere: hoch
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:139,204-214,229-231
Status: [OFFEN]
In 0.18.1 haben Pfeile `points`, `startBinding`/`endBinding`, `lastCommittedPoint`, Pfeilspitzen und `elbowed`; Bindings tragen `elementId`, `focus`, `gap`, bei Elbow zusätzlich `fixedPoint` (`~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/types/excalidraw/element/types.d.ts:199-226`). Der Plugin-Ladepfad ruft `restore(scene, null, null)` ohne `repairBindings` auf (`~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:525`; Option in `~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/types/excalidraw/data/restore.d.ts:11-19`). Ein eigener Test auf beidseitige IDs und Endpunkte beim Erzeugen belegt daher nicht, dass ein verschobener Knoten seinen Pfeil behält.
Vorschlag: gebundene, nicht elbowed Pfeile mit explizit `null` gesetzten Pfeilspitzen verwenden und den Test „öffnen → Knoten verschieben → speichern → neu öffnen → eingebettet rendern“ für linke/rechte und mehrpunktige Kanten verpflichtend machen; ungebundene Linien erfüllen die Bearbeitungsanforderung nicht.

### F08 — Fraktionale Indizes nicht selbst erfinden
Schwere: mittel
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:155-159,232-234
Status: [OFFEN]
Der Elementtyp erlaubt `index: null` ausdrücklich für noch nicht in die Szene eingeordnete Elemente, und Excalidraw synchronisiert ungültige Indizes mit der Array-Reihenfolge (`~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/types/excalidraw/element/types.d.ts:55-59`, `~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/types/excalidraw/fractionalIndex.d.ts:18-48`). Sowohl Editor als auch Einbettung gehen vor der Darstellung durch `restore()` (`~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:525,799-805`). Die Begründung, fehlende Indizes machten die erste Vorschau unvollständig, trifft für diesen Plugin-Pfad daher nicht zu.
Vorschlag: `index: null` in Array-Zeichenreihenfolge schreiben und im Pflicht-Test prüfen, dass `restore()` die Reihenfolge erhält; nur falls ein Rohdatei-Verbraucher ohne `restore()` gebraucht wird, dessen Anforderungen gesondert belegen.

### F09 — Arbeitsbilanz und Formattyp sind noch nicht verdrahtet
Schwere: mittel
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:179-185
Status: [OFFEN]
Die Tätigkeitsart wird aus erfolgreich verwendeten Werkzeugnamen abgeleitet; `write_excalidraw` fehlt in `deriveActivityType` und fiele bei einem alleinigen Mindmap-Lauf auf `other` (`app/src/shared/activityLog.ts:440-457`, `app/src/main/noteAgent/loop.ts:435-442`). Außerdem spiegelt `ResultFormat` die Ergebnis-Arten und kennt `.excalidraw` noch nicht (`app/src/shared/activityLog.ts:105-106`, `app/src/main/noteAgent/runRegistry.ts:33-40`).
Vorschlag: beide Stellen explizit in den Implementierungsplan aufnehmen und einen reinen Mindmap-Lauf als `document` samt Ergebnisformat prüfen.

### F10 — Byte-Determinismus widerspricht dem Aufruf-Zeitstempel
Schwere: niedrig
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:157-158,210
Status: [OFFEN]
Der Entwurf verspricht „gleiche Eingabe → byte-gleiche Datei“, setzt `updated` aber auf einen beim Aufruf übergebenen Zeitstempel. `updated` ist ein serialisiertes Pflichtfeld des Elements (`~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/types/excalidraw/element/types.d.ts:65-69`); zwei Aufrufe mit gleicher Gliederung und verschiedenen Zeitstempeln liefern verschiedene Bytes.
Vorschlag: Determinismus als Funktion von Eingabe **und** explizitem Zeitstempel definieren oder einen festen, aus der Eingabe abgeleiteten Wert verwenden; den Test entsprechend formulieren.

### F11 — Kanonische Pfade mit Wikilink-Sonderzeichen öffnen falsch
Schwere: hoch
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:195-204
Status: [OFFEN]
Der Main-Resolver übernimmt jeden gefundenen `.md`-Pfad ohne Prüfung seiner Link-Syntax als `[[${res.path}]]` (`app/src/shared/excalidrawMindmap.ts:215-225,263-270`). Ein gültiger Vault-Pfad wie `Projekte/A#B.md` oder `Projekte/A|B.md` wird so gespeichert. Beim Plugin-Klick zerlegt `classifyPluginLink` den Inhalt jedoch zuerst am `|` und danach am `#`; es sucht dann `Projekte/A` statt der vorhandenen Datei (`app/src/shared/pluginLink.ts:22-44`, `app/src/renderer/plugins/external/rendererHostClient.ts:22-35`). Der aktuelle Link-Test deckt nur normale Namen und NFD/NFC ab (`app/src/shared/excalidrawMindmap.test.ts:249-278`). Damit trägt F02 für zulässige Dateinamen nicht vollständig.
Vorschlag: kanonische Ziele mit `#`, `|`, `]]` und weiteren nicht darstellbaren Wikilink-Zeichen vor dem Schreiben ablehnen oder ein mit dem Renderer geteiltes, verlustfreies Linkformat einführen; den tatsächlichen Plugin-Klick für diese Namen testen.

### F12 — Quote-Normalisierung kann einen eindeutigen Link umlenken
Schwere: hoch
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:195-204
Status: [OFFEN]
Der Main vergleicht Pfade nur per NFC und Kleinschreibung (`app/src/shared/excalidrawMindmap.ts:215-225`). Der Renderer biegt zusätzlich typografische Apostrophe und Anführungszeichen auf gerade Formen um, sowohl im Ziel als auch in jedem Notizpfad, und nimmt dann den ersten Treffer (`app/src/renderer/utils/linkExtractor.ts:85-95`). Existieren etwa `A'B.md` und `A’B.md`, erlaubt der Main einen exakten Pfad auf die zweite Datei; der Klick kann je nach Notizlisten-Reihenfolge die erste öffnen. Der Test für Unicode prüft nur NFD/NFC (`app/src/shared/excalidrawMindmap.test.ts:269-276`).
Vorschlag: die Renderer-Normalisierung bei der Eindeutigkeitsprüfung im Main mitberücksichtigen und solche Kollisionen ablehnen oder den Renderer für kanonische Pfadlinks auf einen bytegenauen Match umstellen.

### F13 — Link-Scan und sichtbarer Dateibaum haben verschiedene Grenzen
Schwere: mittel
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:195-204
Status: [OFFEN]
`listVaultMarkdownPaths` lässt nur Punktnamen und Symlinks aus; es steigt auch in `node_modules`, `dist`, `build` usw. hinab und nimmt dort `.md`-Dateien als Linkziele auf (`app/src/main/noteAgent/skills.ts:241-266`). Der App-Dateibaum überspringt diese Ordner ausdrücklich (`app/src/main/index.ts:2047-2053,2078-2092`). Ein solcher Link passiert die Main-Prüfung, ist aber nicht als Notiz in der Renderer-Liste klickbar (`app/src/renderer/plugins/external/rendererHostClient.ts:29-35`). Große Projektordner können außerdem das 50.000-Dateien-Limit des Link-Scans auslösen, obwohl der sichtbare Vault kleiner ist (`app/src/main/noteAgent/skills.ts:244,259-261`).
Vorschlag: dieselben ignorierten Ordner wie der Dateibaum verwenden und den Scan gegen dessen sichtbare Notizmenge prüfen; Treffer in ausgeschlossenen Ordnern ablehnen.

### F14 — Einbettungszeile bleibt nach kollisionsbedingter Umbenennung falsch
Schwere: mittel
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:220-232
Status: [OFFEN]
Die Begleitnotiz entfällt, aber das Werkzeug schreibt weiterhin `![[${fileName}]]` in die unveränderliche Karten-Zusammenfassung und fordert dieselbe Zeile in der Abschlussnachricht (`app/src/main/noteAgent/skills.ts:1265,1337-1345`). Beim Accept kann Main den Namen auf `Name (2).excalidraw` ändern (`app/src/main/index.ts:5109-5111`); die Karte zeigt danach zwar `finalName`, rendert aber weiterhin die alte Zusammenfassung (`app/src/renderer/components/Agent/AgentRunPanel.tsx:270-275,323-326`). Wer die angebotene Einbettungszeile kopiert, kann damit die fremde Bestandsdatei oder keine Zeichnung einbetten. F03 ist für die kopierte Zeile also noch offen.
Vorschlag: Einbettungszeile erst nach Accept aus `finalName` und bei Namensdoppel mit eindeutigem vault-relativem Pfad bilden; vor Accept nur als vorläufig kennzeichnen.

### F15 — Plugin-Öffnen scheitert bei einem Vault über Symlink
Schwere: hoch
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:234-245
Status: [OFFEN]
Main gibt nach der Übernahme den kanonischen absoluten Zielpfad zurück (`app/src/main/index.ts:1348-1365,5105-5110,5151`). Der Store vergleicht ihn nur lexikalisch mit `vaultPath`; bei einem über Symlink geöffneten Vault passt das Präfix nicht und er reicht den absoluten Pfad an den Plugin-Tab weiter (`app/src/renderer/stores/noteAgentStore.ts:463-478`). Das Plugin ruft `host.vault.read(filePath)` auf (`~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:465-470`); der Host validiert den Pfad relativ zum angezeigten Vault und verweigert den kanonischen absoluten Pfad, wenn dieser lexikalisch außerhalb der Symlink-Wurzel liegt (`app/src/main/index.ts:770-772,1217-1223`). Die Datei ist dann übernommen, der versprochene Öffnen-Knopf führt aber in einen Ladefehler.
Vorschlag: den von Main bereits gelieferten `relPath` (`app/src/main/index.ts:5151`) direkt für den Plugin-Tab verwenden und einen Symlink-Vault als Regressionstest aufnehmen.

### F16 — Fehler nach erfolgreichem Accept lassen die Karte im falschen Zustand
Schwere: mittel
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:234-245
Status: [OFFEN]
`acceptResult` wartet nach erfolgreichem `noteAgentAcceptResult` noch auf `readDirectory` und den dynamischen `import('./tabStore')`, bevor es die Karte auf `accepted` setzt (`app/src/renderer/stores/noteAgentStore.ts:445-494`). Der Dateibaum-Fehler wird abgefangen, ein Import- oder Tab-Öffnungsfehler jedoch nicht. Dann ist die Datei im Vault und das Main-Ergebnis bereits konsumiert (`app/src/main/index.ts:5127-5151`), während die UI die Karte weiter als offen zeigt; ein zweiter Accept bekommt „nicht (mehr) verfügbar“ (`app/src/main/index.ts:5093-5096`).
Vorschlag: den erfolgreichen Accept sofort als `accepted` verbuchen und das Plugin-Öffnen separat mit `try/catch` sowie sichtbarem `openError` behandeln.

### F17 — Schrift-Gate prüft Bereichsangaben statt Glyphen und Plugin-Version
Schwere: mittel
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:97-106,126-143
Status: [OFFEN]
Der Generator übernimmt Dateinamen und `unicode-range` manuell aus dem Plugin-Build (`app/scripts/excalidraw-font-metrics.cjs:30-79`) und `covered()` prüft allein, ob ein Codepoint in einer solchen Bereichsangabe liegt (`app/scripts/excalidraw-font-metrics.cjs:66-79,113-115`). Danach misst Canvas auch dann einen Wert, wenn der Font selbst für einen Codepoint keinen Glyph liefert und eine Ersatzschrift greift (`app/scripts/excalidraw-font-metrics.cjs:116-138`). Der Test vergleicht die Schätzung mit Referenzzeilen, die derselbe Generator in einem eigenen Electron-Fenster erzeugt hat (`app/src/shared/excalidrawMindmap.test.ts:57-64`); er prüft weder die tatsächliche Glyph-Abdeckung noch, ob die installierte Plugin-Version dieselben Fontdateien und CSS-Gewichte nutzt (`~/dev/mindgraph-excalidraw-plugin/build.mjs:51-86,232-241`). Damit ist die zugesagte Bedingung „eingebettet UND vermessen“ durch das Gate nicht vollständig belegt.
Vorschlag: bei der Generierung die `cmap`-Abdeckung jedes WOFF2-Teilsatzes oder eine äquivalente Glyph-Prüfung auswerten, Plugin-Fontdateien per Hash/Version koppeln und mindestens einen Messlauf im tatsächlich geladenen Plugin-Editor als unabhängige Gegenprobe halten.

### F18 — Pflicht-Gegenprobe ist noch nicht abgeschlossen
Schwere: mittel
ADR-Stelle: docs/codex-collab/excalidraw-mindmap.md:267-277
Status: [OFFEN]
Der Entwurf erklärt Dunkelmodus, SVG-Export, Link-Klick bei Namensdoppel und die Ergebniskarte mit/ohne Plugin ausdrücklich zur Pflicht vor Abnahme; der Umsetzungsstatus nennt Dunkelmodus, SVG-Export, beide Kartenfälle und den Namensdoppel-Klick selbst als nicht geprüft. Die Unit-Tests prüfen Szenen-JSON und Textbreiten (`app/src/shared/excalidrawMindmap.test.ts:57-104,249-278`), können die tatsächliche Plugin-Aktivierung, den Karten-Claim oder den SVG-Export nicht ersetzen. Damit sind F04/F05/F07 für die genannten Integrationspfade noch nicht vollständig verifiziert.
Vorschlag: die vier offenen GUI-Fälle vor Abnahme mit demselben Testprofil nachholen und Ergebnis sowie Plugin-Version im Status festhalten.

## Claude-Antwort

Gegengeprüft am Code am 12.10.2026; alle Punkte vom Nutzer freigegeben und in den Entwurf oben
eingearbeitet (Plan-Ebene, kein Code).

- **F01 [ADRESSIERT]** — `kind` ist jetzt `NoteKindId` (`problem|solution|info`), Unbekanntes wird
  abgelehnt, nicht abgebildet. Abschnitte „Eingabe" und „Grenzen", Test unter „Tests".
- **F02 [ADRESSIERT]** — Auflösung im Main auf genau eine `.md` (exakter Pfad, dann exakter
  Dateiname, nie unscharf), Mehrdeutigkeit = Ablehnung, gespeichert wird der kanonische Pfad.
  Begründung, warum der Renderer dann dieselbe Datei öffnet: `findNoteForWikilink` prüft den Pfad
  zuerst. Nebenbemerkung: der Anker auf die Telegram-Fassung von `note_read` stimmt, der
  Notiz-Agent delegiert dorthin (`main/noteAgent/skills.ts:719`).
- **F03 [ADRESSIERT]** — Begleitnotiz mit Einbettung fällt in dieser Runde weg (Nutzerentscheidung);
  die Einbettungszeile steht in der Abschlussnachricht. Gemeinsame Übernahme mit Namensnachzug ist
  ein späterer Schritt.
- **F04 [ADRESSIERT]** — Karte nennt die Vorschau „Quelltext (Excalidraw-JSON)"; die visuelle
  Gegenprobe (zuerst eingebettet, dann Editor) ist Pflicht vor Abnahme. Bildvorschau später.
- **F05 [ADRESSIERT]** — eigener Knopf „Übernehmen und in MindGraph öffnen" über den Plugin-Tab, nur
  bei aktivem Plugin; `.excalidraw` NICHT in `FORMATS_NEEDING_EXTERNAL_APP`. Ohne Plugin ehrlicher
  Hinweistext, kein Gating des Werkzeugs.
- **F06 [ADRESSIERT]** — Zeichenvorrat auf die eingebetteten und vermessenen Bereiche begrenzt, alles
  andere wird abgelehnt; kein „breiteste Breite"-Rückfall mehr. Test gegen ganze, im Plugin per
  Canvas gemessene Zeilen (gerechnet ≥ gemessen, höchstens 8 % darüber). Plugin-Nachmessen nicht in
  dieser Runde.
- **F07 [ADRESSIERT, Begründung teilweise korrigiert]** — Pfeile `elbowed: false`, Pfeilspitzen
  explizit `null`, beidseitige Bindings ohne `fixedPoint`; der Roundtrip-Test ist Pflicht. Zur
  Begründung: Excalidraw restauriert `initialData` beim Start selbst noch einmal mit
  `repairBindings: true` (`@excalidraw/excalidraw/dist/dev/index.js:25262`); dass der Plugin-Aufruf
  die Option nicht setzt, ist für den Editor also nicht entscheidend. Für die Einbettung (nur
  Anzeige) spielt die Reparatur keine Rolle. Die Folgerung (Pflichttest) bleibt richtig.
- **F08 [ADRESSIERT]** — `index: null`, Array-Reihenfolge = Zeichenreihenfolge; beantwortet die
  offene Frage im Plan.
- **F09 [ADRESSIERT]** — `deriveActivityType` und `ResultFormat` in den Plan aufgenommen, mit Test.
- **F10 [ADRESSIERT]** — Zusage präzisiert: gleiche Eingabe UND gleicher Zeitstempel → gleiche Bytes.


**Runde 2 (12.10.2026, vom Nutzer freigegeben):**

- **F11 [ADRESSIERT]** — `resolveWikilinkInPaths` lehnt Ziele mit `| # [ ] ^` ab
  (`LINK_BREAKING_CHARS`), Test „lehnt Pfade ab, die ein Wikilink nicht trägt".
- **F12 [ADRESSIERT]** — Vergleich über `linkCompareKey` = dieselbe Gleichsetzung wie
  `straightenQuotes` + Kleinschreibung; `A'B`/`A’B` → mehrdeutig. Ein Test hält `linkCompareKey` und
  die Renderer-Fassung zusammen (gespiegelt, weil shared/ den Renderer nicht importiert).
- **F13 [ADRESSIERT]** — `IGNORED_DIRECTORY_NAMES` nach `shared/ignoredDirectories.ts` verschoben;
  Dateibaum und Link-Scan nutzen dieselbe Liste.
- **F14 [ADRESSIERT]** — Einbettungszeile raus aus Zusammenfassung, Werkzeugtext und Skill; die Karte
  zeigt sie nach dem Übernehmen aus `finalRelPath` (voller vault-relativer Pfad).
- **F15 [ADRESSIERT]** — Plugin-Tab bekommt den `relPath` aus dem Main; kein Präfixvergleich mit
  `vaultPath` mehr. (Kein Symlink-Regressionstest: der Pfad wird nicht mehr im Renderer gebildet.)
- **F16 [ADRESSIERT]** — Karte wird sofort nach erfolgreichem Accept `accepted`; Öffnen in eigenem
  `try/catch`, Fehler als `openError` an der Karte.
- **F17 [ADRESSIERT]** — Generator prüft Glyphen (Breite mit zwei verschiedenen Ersatzschriften muss
  gleich sein): 10 Nunito-Zeichen ohne Glyph fielen heraus (u. a. `‰`, `ĳ`, `ſ`, U+2012/2015).
  Generator bricht ab, wenn `build.mjs` andere Dateien/Bereiche/Gewichte einbettet; Hashes und
  Plugin-/Excalidraw-Version stehen im Kopf der erzeugten Datei (`EXCALIDRAW_FONT_SOURCE`).
  Unabhängige Gegenprobe im laufenden Plugin-Editor (Schriften aus dem Plugin-Stylesheet):
  48 Zeilen, Schätzung/echt 1,013–1,024, nie zu schmal.
- **F18** — siehe Status (Gegenprobe Runde 2).

## Status

Runde 1 (Plan-Review) abgeschlossen, alle zehn Befunde eingearbeitet (12.10.2026).

**Umsetzung (12.10.2026, uncommittet):**

- `app/src/shared/excalidrawMindmap.ts` (+ Tests, 123), `excalidrawFontMetrics.generated.ts` aus
  `app/scripts/excalidraw-font-metrics.cjs` (Electron misst die im Plugin eingebetteten woff2-Teilsätze
  mit Canvas `measureText`, Font-String wie Excalidraws `getFontString`).
- Werkzeug `write_excalidraw` (`main/noteAgent/skills.ts`), Ergebnis-Art `excalidraw`, Web-Lauf-Sperre,
  Arbeitsbilanz `document`, `write_note` lehnt `.excalidraw` ab.
- Ergebniskarte: „Quelltext (Excalidraw-JSON)", Knopf „Übernehmen und in MindGraph öffnen" über
  `plugin:renderers` (Endung → Plugin), ohne Plugin Hinweistext; `acceptResult` öffnet Plugin-Formate im
  Plugin-Tab (`AcceptOpenTarget`).
- Skill `resources/starter-skills/mindmap/SKILL.md` + Katalog (`docs/skills/src/mindmap.md`, `index.json`).

**Abweichungen vom Entwurf (aus Messung bzw. GUI-Gegenprobe):**

- Nunito-Zeilenhöhe ist 1,35, nicht 1,25 (Excalidraw `FONT_METADATA`).
- Breitenzuschlag 1 % + 2 px: gemessen weicht die Summe der Einzelbreiten von der ganzen Zeile um
  höchstens +0,5 % (breite Großbuchstaben) bzw. −5 % (Kerning) ab.
- Verbinder sind gerade Linien (zwei Punkte) statt Kurven: mit `focus: 0` rechnet Excalidraw das
  Linienende genau dorthin, wo der Builder es setzt — nichts springt beim ersten Verschieben.
- Stil „skizze" mit voller Füllung statt Schraffur (weiße Schrift auf Schraffur ist unlesbar).
- Szene wird verschoben (links 40 px, oben 110 px): Excalidraw öffnet bei Szenenkoordinate (0,0), das
  Plugin reicht kein `scrollToContent` durch, und oben liegen Werkzeugleiste und Bedienhinweis.

**GUI-Gegenprobe (Dev-App, Testprofil, Modelltest-Vault, Plugin 0.6.0, per CDP):**

1. Eingebettet vor dem ersten Öffnen: alle vier Testdateien (2/5/8 Äste, beide Stile) als SVG, Texte
   mittig in ihren Kästen, nichts läuft über. ✔
2. Im Editor: keine Read-only-Meldung, Texte springen nicht; bloßes Öffnen schreibt die Datei nicht
   (byte-gleich). ✔
3. Echte Maus-Drags auf Blatt, linken Ast, rechten Ast, Ast mit Blättern: alle Linien folgen,
   Prüfskript auf der gespeicherten Datei meldet 0 gelöste Bindungen. ✔ (Blätter wandern beim
   Verschieben eines Astes nicht mit — keine Gruppen, wie geplant.)
4. Tab schließen, neu öffnen: Lage unverändert, Datei byte-gleich. ✔
5. Link-Klick (`[[00 - Start hier]]`) öffnet genau diese Notiz. ✔
6. ~~Nicht geprüft~~ → in Runde 2 nachgeholt, siehe unten.

**Gegenprobe Runde 2 (F18, 12.10.2026, Plugin 0.6.0, gleiches Testprofil):**

- Dunkelmodus: Einbettung invertiert, alle Texte lesbar. ✔ (Nebenbefund außerhalb dieser Arbeit:
  der Einbettungsrahmen zeigt im Dunkelmodus weiße Streifen über/unter der Zeichnung — Host-Rahmen,
  betrifft jede Excalidraw-Datei mit weißem Hintergrund.)
- SVG-Export über das Plugin-Menü: Datei enthält die Texte und genau eine eingebettete Schrift
  (Nunito als data:-URL). ✔
- Namensdoppel: `[[07 - Mindmap-Test/B/Doppel]]` öffnet „Doppel B", nicht „Doppel A". ✔
- Echter Agent-Lauf (qwen3.8:27b-mlx, lokal): Skill geladen, `note_search` für das Linkziel,
  `write_excalidraw` beim ersten Aufruf gültig (5 Äste, 20 Blätter, 1 Link `[[00 - Start hier]]`).
  Karte: Vorschau als „Quelltext (Excalidraw-JSON)", Knopf „Übernehmen und in MindGraph öffnen" →
  Plugin-Tab öffnet die Zeichnung; danach Einbettungszeile mit vollem Pfad. ✔
- Plugin abgeschaltet, zweiter Lauf: kein Öffnen-Knopf, Hinweistext sichtbar; Ergebnis verworfen,
  Plugin wieder an. ✔
- F17-Gegenprobe im laufenden Plugin-Editor: 48 Zeilen, Schätzung/echt 1,013–1,024. ✔

**Nachtrag (Nutzerwunsch 12.10.2026):** Beispielkarte „Mindmap zeichnen“ (Vault → Mindmap) im Agent-Tab unter „Zum Ausprobieren“ (`AgentView.tsx` `EXAMPLES`, Texte `i18n/agentCard.ts` ex6, eigenes SVG-Icon); Raster jetzt 2 × 3.
