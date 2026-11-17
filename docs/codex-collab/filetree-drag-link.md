# Dateien aus dem Dateibaum per Ziehen verlinken

Stand: 17.11.2026 · Planung Claude, Prüfung Codex

## Aufgabe

Plan unten adversarial prüfen, vor allem die „Offenen Fragen an den Prüfer“ gegen den echten Code beantworten und Lücken benennen. Noch keine Umsetzung.

### Nutzerwunsch

1. Dateien aus dem Dateibaum einfacher verlinken: per Ziehen und Ablegen.
2. PDF, Markdown oder Bild aus dem Dateibaum nach rechts in das geöffnete Dokument ziehen → dort erscheint sofort ein Link auf diese Datei.
3. Im Markdown-Editor soll man daraus mit einem vorangestellten `!` eine Einbettung machen können, wenn man will.
4. Bilder und PDFs werden sofort eingebettet (`![[…]]`), nicht nur verlinkt.

## Kontext/Anker

### Ist-Zustand (geprüft im Code)

- `Sidebar/FileTree.tsx:1274` `handleDragStart` setzt nur `text/plain = entry.path` (relativer Pfad) und `effectAllowed = 'move'` — gedacht zum Verschieben in Ordner.
- Ablegen im CodeMirror (Markdown/Schreiben): `Editor/extensions/imageHandling.ts`. `dragover` nimmt nur `application/x-mindgraph-wikilink` (kommt aus SmartConnections, `SmartConnectionsPanel.tsx:949`) und `Files`/`text/uri-list` an. Ein Zug aus dem Dateibaum fällt deshalb heute auf CodeMirrors Standard zurück: Der rohe Pfad `ordner/datei.pdf` landet als Text im Dokument (bzw. `effectAllowed='move'` passt nicht zu `dropEffect='copy'` und der Drop wird abgelehnt — im Test klären).
- Ablegen im Lesen-Modus: `MarkdownEditor.tsx:3154–3313`, dokumentweite Capture-Listener, aber nur für `Files`/`text/uri-list` (Finder-Bilder). Interne Züge werden ignoriert.
- Einbettungen, die es schon gibt: `![[bild.png]]` (Bild), `![[datei.pdf]]` (PDF, `widgets.ts:342` sucht Vault-Wurzel, `.attachments`, `attachments`, dann vaultweit nach Dateinamen), Office (`.docx/.xlsx/.pptx`), Plugin-Dateien (`.excalidraw` u. a.). **Notiz-Einbettung (`![[Notiz]]`, Transklusion) gibt es nicht.**
- Linkauflösung für Notizen: `findNoteForWikilink` — erst voller Pfad ohne `.md`, dann Titel, dann Dateiname, dann Teilpfad.

## Plan

### Schritt 1 — Pure Helfer `shared/fileDropLink.ts` (getestet)

`buildFileDropLink(relPath, allPaths): { markdown: string; kind: 'note' | 'image' | 'pdf' | 'office' | 'plugin' | 'other' }`

- Ziel im Link:
  - `.md` → Dateiname ohne `.md`; wenn derselbe Dateiname im Vault mehrfach vorkommt, der relative Pfad ohne `.md`. (Kein H1-Titel: der ist bei KI-Zusammenfassungen fast immer „Zusammenfassung“, siehe CLAUDE.md Schnellsuche.)
  - Andere Dateien → Dateiname mit Endung; bei Namensdopplung der relative Pfad.
- Form:
  - Bild (`isImageFile`) und `.pdf` → `![[ziel]]` (Wunsch 4).
  - Alles andere (Notiz, Office, sonstige) → `[[ziel]]` (Wunsch 2). Einbetten durch Davortippen von `!` (Wunsch 3) funktioniert für Office/Plugin-Dateien schon heute.
- Zeichen, die einen Wikilink brechen (`|`, `#`, `^`, `[`, `]` im Namen): auf Pfadform ausweichen geht nicht — dann `[Name](<relativer/pfad.ext>)`-Markdown-Link als Rückfall. Tests decken das ab.
- Ordner: kein Link (Drop wird ignoriert).
- Zieldatei = die gerade geöffnete Notiz selbst: ignorieren.

Unit-Tests in `shared/fileDropLink.test.ts`.

### Schritt 2 — Dateibaum gibt eigenen Datentyp mit

`FileTree.tsx handleDragStart`:
```ts
e.dataTransfer.setData('text/plain', entry.path)                    // bleibt: Ordner-Verschieben
if (!entry.isDirectory) e.dataTransfer.setData('application/x-mindgraph-vault-file', entry.path)
e.dataTransfer.effectAllowed = 'copyMove'
```
`handleDragOver` auf Ordnern setzt weiterhin `dropEffect = 'move'` → Verschieben bleibt unverändert.

### Schritt 3 — Ablegen in Markdown/Schreiben (CodeMirror)

`imageHandling.ts`:
- `dragover`: zusätzlich `application/x-mindgraph-vault-file` annehmen, `dropEffect = 'copy'`.
- `drop`: **vor** der `Files`-Prüfung den neuen Typ auslesen → `buildFileDropLink` → an `posAtCoords` einfügen. Bild/PDF als Block (eigene Zeile, gleiche Logik wie `insertImageAtPosition`), Links inline mit Leerzeichen-Trennung wie im Lesen-Modus-Code.
- `config` bekommt einen Getter für die Vault-Dateiliste (`getVaultPaths`) und den Pfad der aktuellen Notiz.

### Schritt 4 — Ablegen im Lesen-Modus

Der Lesen-Modus ist `contentEditable` mit turndown-Rückweg. Vorschlag: am Drop-Punkt (`caretRangeFromPoint`) einen Textknoten mit dem Markdown (`[[ziel]]` bzw. `![[ziel]]`) einsetzen und sofort `commitEditablePreview(true)` aufrufen. Turndown lässt `[`, `]`, `!` unangetastet (selektives Escaping) — der Text kommt also wörtlich im Markdown an; danach rendert der Lesen-Modus neu und zeigt Link bzw. Einbettung.
- Bild/PDF als Block: vor dem Einsetzen auf Absatzgrenze prüfen; im Zweifel eigenen `<p>` nach dem Absatz des Drop-Punkts anhängen.
- Der vorhandene Listener in `MarkdownEditor.tsx:3154` wird um den neuen Datentyp erweitert (Bedingung `hasFiles || hasVaultFile`), Pfad-Zweig vor dem Finder-Zweig.

### Schritt 5 — Rückmeldung

- Gleiche `drag-over`-Klasse wie bei Bildern.
- Kein Toast nötig; der Link steht sichtbar am Cursor.

## Bewusst nicht in diesem Schritt

- **Notiz-Transklusion** (`![[Notiz]]` zeigt den Inhalt der anderen Notiz): gibt es heute nicht. Wunsch 3 heißt für Notizen deshalb erst einmal: das `!` ist erlaubt, rendert aber nichts Neues. Eigenes Vorhaben, wenn gewünscht.
- Ziehen auf Graph-Canvas, Workflow-Canvas, Mail-Entwurf.
- Mehrfachauswahl im Dateibaum (gibt es die? falls ja: mehrere Links, je Zeile einer).

## Offene Fragen an den Prüfer

1. Reicht ein Textknoten `![[…]]` im Lesen-Modus, oder gibt es eine turndown-Regel/Escape, die `!` oder `[[` doch anfasst? (Auto-Heal in `write-file` strippt Backslashes vor `[`/`]` — zweite Linie.)
2. Linkziel bei Namensdopplung: relativer Pfad — löst `widgets.ts` (PDF) einen Pfad mit Unterordnern sicher auf? Laut Code `${vaultPath}/${filename}` als erster Versuch → ja. Bilder?
3. `effectAllowed = 'copyMove'`: Stört das das bestehende Ordner-Verschieben oder den globalen Drop-Killer in `App.tsx:315`?
4. Kollision mit dem bestehenden Finder-Bild-Drop im Lesen-Modus (dokumentweiter Capture-Listener) und im Split mit zwei Editoren.
5. Sollen PDFs wirklich standardmäßig eingebettet werden? Große PDFs laden als Base64 komplett in den Renderer (`readFileBinary`) — Speicher/Latenz beim Öffnen der Notiz.

## Prüfweg

- `npm run typecheck`, `npm run test` (neue Tests für `fileDropLink`).
- Manuell in `npm run dev`: Notiz, Bild, PDF, DOCX aus dem Dateibaum in Markdown-, Schreiben- und Lesen-Modus ziehen; Ordner-Verschieben im Dateibaum gegenprüfen; Finder-Bild-Drop gegenprüfen; Notiz danach neu öffnen (Roundtrip).

## Codex-Findings

### F01 — Lesen-Drop braucht Dirty-Flag und Roundtrip-Test
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:415
Status: [OFFEN]
Die Annahme zu Frage 1 stimmt nur für `[` und `]`: `wysiwygTurndown.escape` escaped jedes nicht bereits escapte `*` und die übrigen Marker, aber `!` selbst nicht. Ein nackter Textknoten `![[bild.png]]` wird zwar nicht am `!` verändert; der Roundtrip läuft jedoch über turndown auf dem gesamten `contentEditable`-DOM (`MarkdownEditor.tsx:571-594`). Die Behauptung, der Text komme sicher wörtlich an, braucht einen echten Roundtrip-Test mit `![[…]]` im Absatz, am Absatzanfang und neben bestehendem Text. Vor allem muss der Drop `isPreviewDomDirtyRef.current = true` setzen; sonst beendet `commitEditablePreview(true)` ohne Speichern (`MarkdownEditor.tsx:2870-2877`), wie es der bestehende Bild-Drop ausdrücklich tut (`MarkdownEditor.tsx:3298-3301`).
Vorschlag: Dirty-Flag und Selektion wie beim bestehenden Drop setzen; DOM→Markdown→Render für Wiki-Links und Embeds gezielt testen.

### F02 — Notiz-Transklusion existiert, Pfadvariante scheitert
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:723
Status: [OFFEN]
Die Aussage „Notiz-Transklusion gibt es nicht“ ist falsch: `![[Notiz]]` erzeugt `.wikilink-embed` (`MarkdownEditor.tsx:723-731`), und `processEmbeds` lädt den Notizinhalt (`MarkdownEditor.tsx:4022-4053`). Dieser Loader sucht aber nur Titel oder Dateiname, keinen vollständigen Pfad (`MarkdownEditor.tsx:4037-4043`). Sobald der Plan wegen gleichnamiger `.md`-Dateien `![[ordner/Notiz]]` produziert, erscheint „Notiz nicht gefunden“. Bei einem einfachen `![[Notiz]]` kann die erste gleichnamige Notiz statt der gezogenen erscheinen. Für diesen Embed gibt es zudem keine Turndown-Rekonstruktionsregel neben den Regeln für PDF/Office/Plugin (`MarkdownEditor.tsx:479-511`); ein Lesen-Modus-Commit kann die Syntax verlieren.
Vorschlag: Notiz-Embeds mit `findNoteForWikilink` pfadgenau auflösen und ihren `data-note`-Wert im Lesen-Roundtrip rekonstruieren; die Ausklammerung der Transklusion im Plan korrigieren.

### F03 — Fallback auf Markdown-Link erfüllt den Linkwunsch nicht
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:3549
Status: [OFFEN]
Für Namen mit `|`, `#`, `^`, `[` oder `]` schlägt der Plan `[Name](<relativer/pfad.ext>)` vor. Der Klickpfad des Lesen-Modus behandelt jedoch nur externe `http`, `mailto` usw. (`MarkdownEditor.tsx:3549-3562`) und `.wikilink` (`MarkdownEditor.tsx:3566-3639`); ein relativer Markdown-Link öffnet die Vault-Datei nicht. Zudem wird ein solcher Markdown-Pfad relativ zur aktuellen Notiz interpretiert, während der Helfer einen Vault-relativen Pfad ausgeben will. Ein Bild/PDF mit Sonderzeichen wird damit auch nicht sofort eingebettet.
Vorschlag: Entweder unterstützte, korrekt aufgelöste Vault-Dateilinks mit definiertem Escape- und Klickpfad einführen oder solche Namen explizit als nicht unterstützten Fall behandeln; die Fallback-Syntax in allen drei Modi prüfen.

### F04 — Pfadlinks lösen je Dateityp unterschiedlich auf
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:4037
Status: [OFFEN]
Zu Frage 2: `findNoteForWikilink` trifft einen vollständigen `.md`-Pfad zuerst exakt (`utils/linkExtractor.ts:89-95`), und Bild- sowie PDF-Embeds probieren im Lesen-Modus `${vaultPath}/${pfad}` (`MarkdownEditor.tsx:4149-4157`, `4213-4219`), im Schreiben-Modus ebenso (`extensions/livePreview/widgets.ts:245-265`, `342-359`). Das gilt aber nicht für den Notiz-Embed (F02). Die Fallback-Suche für Bilder verwirft den Ordnerteil (`utils/imageUtils.ts:285-305`); der Main-Handler tut das auch für Bilder/PDFs (`main/index.ts:3592-3619`). Ein beschädigter, verschobener oder nicht exakt passender Pfad kann daher still die falsche gleichnamige Datei laden. Außerdem ist der PDF-Loader im Schreiben-Modus nur auf Root/Attachments plus unscharfe Suche ausgelegt, während der Lesen-Loader zusätzlich das Notizverzeichnis versucht (`widgets.ts:345-372`, `MarkdownEditor.tsx:4205-4236`).
Vorschlag: Pfadziele bei allen Dateitypen exakt und einheitlich prüfen; bei explizitem Pfad keinen namensbasierten Treffer als Ersatz verwenden.

### F05 — Copy/Move und globaler Drop-Killer benötigen Grenztests
Schwere: mittel
Stelle: app/src/renderer/components/Sidebar/FileTree.tsx:1275
Status: [OFFEN]
Zu Frage 3: `copyMove` erlaubt den geplanten Editor-Copy und weiterhin das Ordner-Move; der Ordner setzt `dropEffect = 'move'` (`FileTree.tsx:1280-1286`) und verarbeitet weiterhin `text/plain` (`FileTree.tsx:1320-1331`). Der globale Handler in `App.tsx:320-327` prüft ausschließlich `Files`, sodass er einen internen Datentyp ohne `Files` nicht abfängt. Der Plan muss dennoch den Fall „Drop auf kein gültiges Editorziel“ abdecken: `text/plain` bleibt gesetzt und kann in andere editierbare Ziele als roher Pfad gelangen. Zusätzlich behandelt `handleDropOnFolder` externe Pfade vor internen (`FileTree.tsx:1299-1321`); ob ein interner Drag in Electron zugleich `Files`/URI-Daten erhält, ist im Code nicht abgesichert.
Vorschlag: Interne Typen im Ordner-Drop vorrangig behandeln; Copy in beiden Editor-Modi, Move auf Ordner und Drop ins Leere in Electron manuell prüfen.

### F06 — Dokumentweiter Capture-Listener muss den richtigen Split-Editor treffen
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:3154
Status: [OFFEN]
Zu Frage 4: Der Lesen-Drop-Listener hängt pro Editor an `document` in der Capture-Phase und ruft bei Treffer `stopImmediatePropagation()` auf (`MarkdownEditor.tsx:3164-3189`). Die vorhandene `editable.contains(e.target)`-Prüfung verhindert, dass der erste Split-Editor den Drop des zweiten schluckt. Der Plan muss diese Prüfung vor jeder Übernahme des neuen Typs beibehalten; sonst wird im Split in die falsche Notiz geschrieben. Der neue Typ muss vor `Files`/URI geprüft werden, damit ein interner Bild-Drag nicht durch den Finder-Zweig kopiert wird (`MarkdownEditor.tsx:3197-3223`). Derselbe Vorrang ist in CodeMirror nötig (`extensions/imageHandling.ts:192-214`).
Vorschlag: Split mit beiden Editoren in Lesen/Schreiben und internen Bild- sowie Finder-Drops gegenprüfen; nur den tatsächlich getroffenen Editor mutieren.

### F07 — Mehrfachauswahl ist vorhanden, Drag-Plan definiert nur eine Datei
Schwere: mittel
Stelle: app/src/renderer/components/Sidebar/FileTree.tsx:475
Status: [OFFEN]
Die offene Behauptung „Mehrfachauswahl (gibt es die?)“ ist bereits beantwortet: Shift-Klick toggelt `selectedPaths` (`FileTree.tsx:475-479`), Kontextmenü-Verschieben und -Löschen verwenden die Menge (`FileTree.tsx:601-606`, `1096-1105`). `handleDragStart` sendet dagegen immer nur `entry.path` (`FileTree.tsx:1275-1278`). Wer mehrere markierte Dateien in den Editor zieht, erhält laut Plan still nur einen Link; „falls ja: mehrere Links“ ist nicht spezifiziert. Die bestehende Ordner-Drop-Funktion verschiebt ebenfalls nur den gezogenen Pfad (`FileTree.tsx:1320-1331`), also darf eine Mehrfach-Payload nicht beiläufig ihr Verhalten ändern.
Vorschlag: Explizit entscheiden, ob Drag aus Mehrfachauswahl alle markierten Dateien oder nur die gezogene verlinkt, und Reihenfolge, gemischte Typen sowie Move auf Ordner festlegen.

### F08 — PDF-Standard verursacht vollständige Mehrfachkopie im Renderer
Schwere: mittel
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:4224
Status: [OFFEN]
Zu Frage 5: Ja, der Wunsch verlangt sofortiges Einbetten; die Kosten müssen aber sichtbar in den Plan. `read-file-binary` liest die komplette Datei und gibt Base64 zurück (`main/index.ts:2269-2274`). Der Lesen-Loader decodiert das vollständig, baut `Uint8Array`, `Blob` und Blob-URL (`MarkdownEditor.tsx:4224-4256`); der Schreiben-Loader lädt ebenfalls die komplette Base64-Datei (`extensions/livePreview/widgets.ts:342-379`). Jeder zusätzlich eingebettete große PDF erhöht Ladezeit und Speicher beim Öffnen der Notiz; mehrere Embeds multiplizieren dies.
Vorschlag: Standard-Einbettung gemäß Nutzerwunsch beibehalten, aber Größen-/Anzahlgrenze oder explizites Lazy Loading samt Test mit mehreren großen PDFs planen.

### F09 — Selbstlink- und Dateilistenprüfung sind noch nicht definiert
Schwere: mittel
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:1026
Status: [OFFEN]
`MarkdownEditor` verwendet im Split `effectiveNoteId` und daraus `selectedNote` (`MarkdownEditor.tsx:1026-1027`); `App.tsx:1680,1719` mountet zwei Instanzen. Der geplante „aktuelle Notiz“-Getter muss daher je Zielinstanz den tatsächlichen `selectedNote.path` liefern, nicht global `selectedNoteId`, sonst wird ein Selbstlink im zweiten Panel fälschlich angenommen oder abgelehnt. Die Vault-Dateiliste liegt als hierarchischer `fileTree` vor (`MarkdownEditor.tsx:1017-1018`), während `buildFileDropLink` ein `allPaths`-Array erwartet; Flattening, Ausschluss von Ordnern und Aktualisierung nach Datei-Verschiebung sind nicht spezifiziert.
Vorschlag: Pfadliste aus dem aktuellen `fileTree` je Drop ableiten und den Zielnotizpfad aus der getroffenen Editorinstanz übergeben; Split-Selbstlink testen.

### F10 — `data-raw` ist nach dem Typographen nicht mehr roh
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:345
Status: [OFFEN]
`md` läuft mit `typographer: true` (`MarkdownEditor.tsx:345-350`); die Embed-Erzeugung erhält erst den bereits gerenderten Text-Token (`MarkdownEditor.tsx:663-668`). Ein dort vor `straightenQuotes` gespeichertes `data-raw` enthält bei `![[You'll]]` bereits `You’ll`. Die geplante Regel würde den Link beim ersten Lesen-Commit umschreiben; bei Namen mit typografisch bedeutsamen Zeichen ist `data-raw` also kein unveränderter Quelltext. `straightenQuotes` normalisiert zusätzlich Unicode (`linkExtractor.ts:85-86`).
Vorschlag: Originalsyntax vor der Typographie aus dem Markdown-Token/Quelltext sichern oder einen gezielten Roundtrip-Test mit geradem und typografischem Apostroph sowie Anführungszeichen machen und die unvermeidbare Normalisierung ausdrücklich festlegen.

### F11 — Notiz-Embed-Regel braucht Alias und leeren Container
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:668
Status: [OFFEN]
Die Embed-Regex trennt `linkText` und `sizeOrAlias` (`MarkdownEditor.tsx:668`); der Notiz-Zweig ignoriert `sizeOrAlias` derzeit (`MarkdownEditor.tsx:723-730`). `data-raw=linkText` würde bei `![[Notiz#Überschrift|Alias]]` den Alias löschen. Der Rückfall `data-note` + `#data-fragment` kann ihn ebenfalls nicht rekonstruieren. Außerdem schützt die Leercontainer-Vorbereitung nur PDF/Office/Mermaid/Dataview/Plugin (`MarkdownEditor.tsx:584-591`); ein leerer `.wikilink-embed` kann vor der Custom-Regel von Turndowns `blankRule` abgefangen werden. Der aktuelle Commit serialisiert den hydratisierten Embed-Inhalt samt Kopfzeile (`MarkdownEditor.tsx:571-594,4100-4109`), bei fehlgeschlagenem oder noch ausstehendem Laden dagegen Fehler- oder Ladetext (`MarkdownEditor.tsx:4045-4047,4111-4113`).
Vorschlag: Den vollständigen Ausdruck innerhalb `![[...]]` einschließlich Pipe-Suffix sichern; `.wikilink-embed` in die Leercontainer-Vorbereitung aufnehmen und Roundtrips für geladenen, fehlerhaften, leeren und noch ladenden Embed testen.

### F12 — Block-Rückgabe zerstört Einbettung im Absatz
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:729
Status: [OFFEN]
Der Renderer erzeugt für jeden Notiz-Embed ein `<div>` (`MarkdownEditor.tsx:729-731`), auch wenn die Syntax mitten im Satz steht. Die geplante Regel gibt immer `\n\n![[...]]\n\n` zurück. Damit wird `Vorher ![[Notiz]] nachher` nach einem Lesen-Commit in getrennte Absätze zerlegt. Bei verschachtelten Notiz-Embeds schützt die Regel zwar den gerenderten Kindinhalt vor Turndown, die Hydration erfasst aber nur die zu Beginn vorhandenen Elemente (`MarkdownEditor.tsx:4026-4030`) und setzt danach weitere Embed-Container per `innerHTML` ein (`MarkdownEditor.tsx:4100-4109`); deren Anzeige ist nicht gesichert.
Vorschlag: Inline- und Block-Kontext bei der Rekonstruktion erhalten und einen echten Render→Hydrate→Edit→Commit-Test für Embed im Absatz, Heading-/Blockfragment und verschachtelte Embeds ergänzen; die verschachtelte Hydration separat begrenzen und testen.

### F13 — Resolver-Quelle enthält `.attachments` nicht
Schwere: hoch
Stelle: app/src/main/index.ts:2156
Status: [OFFEN]
`readDirectoryRecursive` überspringt versteckte Ordner einschließlich `.attachments` (`main/index.ts:2156-2161`), während der bisherige Main-Fallback `.attachments` ausdrücklich durchsucht (`main/index.ts:3603-3618`). Ein `resolveVaultFile` nur über den im Renderer vorhandenen `fileTree` (`MarkdownEditor.tsx:1017-1018`) kann daher einen eindeutig verschobenen Anhang dort nicht finden und die Mehrdeutigkeit eines gleichnamigen Anhangs nicht erkennen. Das betrifft Bild- und PDF-Loader in Lesen (`MarkdownEditor.tsx:4170-4179,4234-4244`) und Schreiben (`widgets.ts:263-273,369-383`).
Vorschlag: Für die eindeutige Suche eine vollständige, sicher geprüfte Vault-Dateiinventur im Main bereitstellen oder `.attachments` gezielt in die Kandidaten- und Mehrdeutigkeitsprüfung einbeziehen; Fälle mit zwei gleichnamigen Dateien, davon eine in `.attachments`, testen.

### F14 — Exakt-vor-Notizordner ändert alte relative Links
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:4149
Status: [OFFEN]
Der geplante Vorrang „exakter Pfad → Notizordner“ kehrt für bestehende relative Links die bisherige Reihenfolge um: Bilder im Lesen-Modus prüfen zuerst das Notizverzeichnis und dann die Vault-Wurzel (`MarkdownEditor.tsx:4149-4157`), PDFs ebenso (`MarkdownEditor.tsx:4213-4219`). Wenn `Kapitel/bild.png` und `bild.png` in der Wurzel existieren, zeigt `![[bild.png]]` nach der Umstellung eine andere Datei. Im Schreiben-Modus sucht das ImageWidget bisher zusätzlich `assets` und `images` (`widgets.ts:245-252`), die neue Reihenfolge nennt diese Ordner nicht; so können vorhandene Links dort ausfallen.
Vorschlag: Auflösung für alte basename-Links mit bisherigem Kontext erhalten; für neu erzeugte Vault-Pfade eine eindeutige, gesondert erkennbare Syntax/Strategie festlegen. `assets`/`images` und gleichnamige Root-/Nachbar-Dateien in Regressionstests aufnehmen.

### F15 — F04-Umstellung endet nicht bei vier Embed-Loadern
Schwere: mittel
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:3524
Status: [OFFEN]
Die Antwort nennt nur Bild- und PDF-Loader in Lesen/Schreiben. Office wird beim Klick im Lesen-Modus separat über Notizordner, Root und `findImageInVault` aufgelöst (`MarkdownEditor.tsx:3524-3544`); der Main-Handler unterstützt aber ausschließlich Bild/PDF-Endungen (`main/index.ts:3613-3618`), weshalb die behauptete Office-Ausweichsuche schon jetzt nicht funktioniert. Plugin-Embeds verwenden wiederum `resolvePluginEmbedTarget` (`MarkdownEditor.tsx:713,4333`; `pluginEmbeds.ts:19-33`) und `resolvePluginFileLink` (`linkExtractor.ts:139-150`). Die Main-`read-file`/`read-file-binary`/`read-image-as-data-url`-Handler lesen dagegen konkrete Pfade nach `assertSafePath` (`main/index.ts:2216-2218,2270-2272,3562-3564`); sie brauchen für einen Renderer-Resolver keinen Umbau. Der Main-`find-image-in-vault`-Handler muss nur dann geändert oder abgelöst werden, wenn seine verbleibenden Aufrufer ebenfalls eindeutige Treffer verlangen.
Vorschlag: Alle Link- und Embed-Verbraucher nach Dateityp als Migrationsliste führen; Office-Klick und Plugin-Pfadlinks gezielt prüfen. Main-Read-Handler auf sichere Pfadprüfung beschränken und den unscharfen Main-Finder entweder ablösen oder sein Verhalten ausdrücklich als Altpfad dokumentieren.

### F16 — Fehlerfall beim Mehrfach-Drop bleibt unbestimmt
Schwere: mittel
Stelle: app/src/renderer/components/Sidebar/FileTree.tsx:475
Status: [OFFEN]
Shift-Klick wählt nur Dateien (`FileTree.tsx:475-479`); „Ordner in der Auswahl überspringen“ ist bei der heutigen UI nicht erreichbar. Die bestätigte JSON-Liste kann aber Notiz, Bild und PDF mischen. `buildFileDropLink` liefert laut F03 für einzelne Namen einen Fehler, und der Selbstlink wird ausgelassen. Der Plan bestimmt nicht, ob ein Mehrfach-Drop mit einem solchen Eintrag die übrigen Links teilweise einfügt, komplett abbricht oder Hinweise pro Datei zeigt. Die gewünschte Dateibaum-Reihenfolge lässt sich aus `selectedPaths` allein nicht ableiten; die bestehende Move-Dialog-Implementierung traversiert dafür explizit den `fileTree` (`FileTree.tsx:1096-1105`). Im Ordner-Drop muss der neue interne Typ nur die Priorität/Quelle kennzeichnen, während `text/plain` weiterhin genau den gezogenen Pfad für `moveFile` liefern muss (`FileTree.tsx:1320-1331`); eine JSON-Liste als `sourcePath` wäre ein Funktionsbruch.
Vorschlag: Die gesamte Auswahl vor dem Einfügen in Dateibaum-Reihenfolge validieren, Teilfehler-Verhalten festlegen und in einem Editor-Dispatch einfügen. Ordner-Move mit markierter Datei als einzigem `text/plain`-Quellpfad testen.

### F17 — Abgewiesener Drop darf keinen rohen Pfad einfügen
Schwere: mittel
Stelle: app/src/renderer/components/Editor/extensions/imageHandling.ts:184
Status: [OFFEN]
Bei einem `unsupported-name` oder Selbstlink darf der neue Drop-Handler nicht `false` zurückgeben, ohne `preventDefault`/`stopPropagation` aufzurufen: CodeMirror verarbeitet sonst weiterhin den mitgegebenen `text/plain`-Pfad. Der heutige Handler gibt für nicht erkannte Drops `false` zurück (`imageHandling.ts:184-214`), und `FileTree` setzt `text/plain` absichtlich für Ordner-Move (`FileTree.tsx:1275-1277`). Dasselbe gilt im Lesen-Modus vor dem bisherigen Finder-Zweig (`MarkdownEditor.tsx:3181-3205`).
Vorschlag: Den internen Typ zuerst vollständig übernehmen, auch bei Validierungsfehlern das Default-Drop blockieren und dann den Hinweis zeigen; Fehlerfall in beiden Editor-Modi und im Split testen.

### F18 — Sonderzeichenprüfung muss den ganzen Zielpfad prüfen
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:724
Status: [OFFEN]
F03s neue Sperre spricht nur von „Dateinamen“. Bei Namensdopplung erzeugt `buildFileDropLink` aber einen Pfad mit Ordnern. Enthält ein Ordner `#`, `|`, `^`, `[` oder `]`, wird auch bei unauffälligem Dateinamen ein syntaktisch falsches `[[ordner/Datei]]` oder `![[ordner/Datei]]` geschrieben: der Notiz-Embed trennt an `#` (`MarkdownEditor.tsx:724-726`), die Wikilink-Regex trennt an `|` (`MarkdownEditor.tsx:736-745`), und die Embed-Regex lässt `[`/`]` nicht als Zielzeichen zu (`MarkdownEditor.tsx:668`).
Vorschlag: Den tatsächlich ausgegebenen Zielstring nach Auswahl von Kurzname oder Pfad auf unzulässige Zeichen prüfen; einen Doppelname-Fall in einem Ordner mit `#` und `|` testen.

### F19 — F03 ist als Produktentscheidung geklärt
Schwere: info
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:3549
Status: [OFFEN]
Claudes Antwort streicht den nicht funktionierenden Markdown-Link-Rückfall aus F03. Das entspricht dem Code: relative Markdown-Links haben im Lesen-Modus keinen Vault-Klickpfad (`MarkdownEditor.tsx:3549-3562`). Der neue Fehlerfall braucht noch die in F17 beschriebene Event-Übernahme und die Prüfung des ganzen Zielpfads aus F18.
Vorschlag: Die Ablehnung als expliziten, sichtbaren Drop-Fehler implementieren und beide Folgebefunde testen.

### F20 — `[[Datei]]` aus Schritt A ist für Bild/PDF/Office nicht klickbar
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:3578
Status: [OFFEN]
Schritt A bietet alle Dateitypen als `[[…]]` an. Beim Klick prüfen Lesen und Schreiben aber zuerst `findNoteForWikilink` und danach ausschließlich `resolvePluginFileLink` (`MarkdownEditor.tsx:2775-2795,3569-3639`). Für ein Bild, eine Office-Datei oder ein PDF ohne Companion-Notiz passiert damit nichts; ein PDF mit Companion kann stattdessen die Begleitnotiz öffnen (`linkExtractor.ts:101-110`). Das neue Autocomplete erzeugt also sichtbare, aber häufig funktionslose Dateilinks. Ein `![[…]]` nimmt bei Bild/PDF zwar den Embed-Renderer (`MarkdownEditor.tsx:667-693`), bei Office den Platzhalter (`MarkdownEditor.tsx:696-707`); das behebt den einfachen Link nicht.
Vorschlag: Vor Schritt A einen Klickpfad je angebotenen Dateityp für Lesen und Schreiben festlegen und testen, einschließlich PDF mit/ohne Companion; alternativ nur tatsächlich klickbare Typen im `[[`-Autocomplete anbieten.

### F21 — Eindeutiger Dateiname kann falsche Notiz treffen
Schwere: hoch
Stelle: app/src/renderer/utils/linkExtractor.ts:113
Status: [OFFEN]
`buildFileDropLink` plant den kurzen Dateinamen, sofern dieser unter `.md`-Dateien eindeutig ist. `findNoteForWikilink` prüft nach einem Pfadtreffer jedoch zuerst H1-Titel, dann Dateinamen (`linkExtractor.ts:89-95,113-124`). Gibt es `A.md` mit H1 `B` und `B.md` mit anderem H1, öffnet der vorgeschlagene Link `[[B]]` auf `A.md`. Der Backlink-Index registriert H1, Pfad und Dateiname in einer Map und überschreibt Kollisionen abhängig von der Notiz-Reihenfolge (`notesStore.ts:350-376`); Graph und Backlinks können damit ein anderes Ziel zeigen als der Klick. Dieselbe Kollision betrifft Schritt A und Drag.
Vorschlag: Eindeutigkeit gegen alle vom Resolver akzeptierten Zielnamen prüfen oder für Notizen stets einen eindeutig auflösbaren Pfadwert verwenden; Klick, Backlink und Graph mit H1/Dateiname-Kollision gegenprüfen.

### F22 — Heading-/Block-Autocomplete versteht Pfadwerte nicht
Schwere: hoch
Stelle: app/src/renderer/components/Editor/WikilinkAutocomplete.tsx:82
Status: [OFFEN]
Schritt A fügt bei Dateinamensdopplung `[[ordner/Notiz]]` ein. Tippt der Nutzer danach `#` oder `#^`, ermitteln die Trigger `targetNote` aus diesem Wert (`MarkdownEditor.tsx:2559-2582`). `targetNoteData` sucht jedoch nur H1 oder basename, keinen vollen Pfad (`WikilinkAutocomplete.tsx:82-91`); Heading-/Block-Vorschläge bleiben leer. Gerade bei Dopplungen wäre eine basename-Suche auch falsch. Die Block-ID-Schreiboperation verwendet anschließend `targetNoteData.path` (`WikilinkAutocomplete.tsx:305-315`, `MarkdownEditor.tsx:1929-1945`).
Vorschlag: Heading-/Block-Modus über denselben pfadgenauen Notiz-Resolver führen und einen Test mit zwei gleichnamigen Notizen plus `[[ordner/Notiz#` und `#^` ergänzen.

### F23 — `![[` funktioniert nur mit Zielwert, nicht mit Drop-Markdown
Schwere: mittel
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:1981
Status: [OFFEN]
Der Auswahl-Handler ersetzt den Bereich ab `[[` durch `[[${value}]]` und lässt ein davorstehendes `!` tatsächlich stehen (`MarkdownEditor.tsx:1958-1985,2587-2597`). Das bestätigt die Grundannahme für einen **reinen Zielwert**. `buildFileDropLink` ist aber als Lieferant von vollständigem Markdown (`[[ziel]]` oder `![[ziel]]`) geplant. Wird dessen `markdown` direkt als `value` übergeben, entstehen `[[![[bild.png]]]]` beziehungsweise `![[![[bild.png]]]]`. Außerdem muss bei Bild/PDF die Syntax `![[` direkt vor dem Ziel stehen; `Text![[bild.png]]` wird im Lesen-Modus nicht als Bild-Embed erkannt (`MarkdownEditor.tsx:3255-3257`).
Vorschlag: Den Helfer zusätzlich einen syntaxfreien `target` liefern lassen; im Autocomplete nur diesen einsetzen und `[[`/`![[` samt nötiger Worttrennung in Markdown, Schreiben und Lesen testen.

### F24 — Weitere Wikilink-Vorschlagsliste im Lesen-Modus bleibt auf Notizen beschränkt
Schwere: mittel
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:3335
Status: [OFFEN]
Der Lesen-Modus hat eine eigene Wikilink-Eingabe der Formatleiste. Deren Vorschläge kommen ausschließlich aus `notes`, zeigen H1 und fügen ebenfalls H1 ein (`MarkdownEditor.tsx:3332-3362,5388-5443`); sie verwenden `WikilinkAutocomplete.tsx` nicht. Schritt A ändert daher nur das CodeMirror-Popup, das in Markdown- und Schreiben-Modus gemeinsam arbeitet (`MarkdownEditor.tsx:5630-5640`). Die Zettel-Schnellerfassung hat dagegen im gefundenen Transport-Pfad nur Tag-Vorschläge (`main/index.ts:13377-13436`), keinen gleichartigen `[[`-Picker.
Vorschlag: Entweder die Lesen-Vorschläge mit denselben Such- und Zielregeln umstellen oder die bewusste Abweichung im Plan nennen und testen.

### F25 — Neue Notiz kann trotz vorhandenem Dateiziel angeboten werden
Schwere: mittel
Stelle: app/src/renderer/components/Editor/WikilinkAutocomplete.tsx:134
Status: [OFFEN]
Die neue Regel „Erstellen nur ohne fremde Endung“ reicht nicht aus: Für eine Eingabe `Bericht` kann eine existierende Datei `Bericht.pdf` vorgeschlagen werden, während `exactMatch` nach bisheriger Logik nur Notizen berücksichtigt (`WikilinkAutocomplete.tsx:134-152`). So steht „Neue Notiz erstellen“ vor dem Dateitreffer; Enter erzeugt `Bericht.md` statt die Datei zu verlinken. Der Erstellpfad schreibt ohne gesonderte Kollisionsprüfung direkt per `writeFile` (`MarkdownEditor.tsx:1895-1919`). Bei einem bereits vorhandenen `Bericht.md` kann ein abweichender H1/Frontmatter-Titel oder ein veralteter Notiz-Store ebenfalls zur Überschreibung führen.
Vorschlag: `exactMatch` gegen alle angebotenen Ziele und den aktuellen Dateibaum berechnen, Neuanlage hinten oder gesondert platzieren und vor `writeFile` Nichtvorhandensein des Zielpfads sicher prüfen.

### F26 — Finder-Mehrdeutigkeit braucht Fallunterscheidung in allen Aufrufern
Schwere: mittel
Stelle: app/src/shared/types.ts:845
Status: [OFFEN]
Ein additives `{ success: false, ambiguous: n }` bricht die bestehenden `success && path`-Prüfungen typseitig nicht, verlangt aber eine Erweiterung des Preload-/Shared-Vertrags (`types.ts:845-849`) und explizite UI-Zweige. Im Code gibt es fünf direkte Renderer-Aufrufstellen, nicht acht: ImageWidget und PdfEmbedWidget (`widgets.ts:264-276,372-383`), Office-Klick sowie PDF-Preview (`MarkdownEditor.tsx:3540-3544,4234-4244`) und Graph-Bild (`GraphCanvas.tsx:1933-1947`). ImageWidget zeigt bisher generisch „Image not found“, PDF-Preview „PDF nicht gefunden“ (`widgets.ts:275-277`, `MarkdownEditor.tsx:4279-4289`); Office-Klick und Graph-Bild bleiben ohne Trefferanzeige still. Der separate Lesen-Bildloader verwendet `imageUtils.findImageInVault` und bleibt weiterhin „erster Treffer“ (`MarkdownEditor.tsx:4170-4179`, `imageUtils.ts:285-310`).
Vorschlag: Den Vertrag als diskriminierte Erfolgs-/Mehrdeutig-/Nichtgefunden-Antwort definieren und für jede tatsächliche Aufrufstelle eine passende Meldung vorsehen. Den separaten Lesen-Bild-Fallback entweder ebenfalls eindeutig machen oder ausdrücklich als verbleibende Ausnahme markieren.

### F27 — Mehrdeutigkeitsfinder löst Pfadkonflikte vor dem Fallback nicht
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:4149
Status: [OFFEN]
Runde 3 lässt alle bisherigen Kandidatenreihenfolgen unverändert. Damit greifen bei `![[ordner/bild.png]]` zuerst direkte Leseversuche; der Finder wird nur nach deren Fehlschlag aufgerufen (`MarkdownEditor.tsx:4149-4179`, `widgets.ts:245-273`). Bei gleichnamigen Dateien kann bereits ein anderer Kandidat erfolgreich sein, etwa `Notizordner/ordner/bild.png` vor `Vault/ordner/bild.png` im Lesen-Modus. `{ ambiguous: n }` im Main wird dann nie erreicht. Für basename-Links ist dieselbe Priorität bewusst zur Altlink-Kompatibilität nötig; für neu erzeugte Pfadlinks fehlt eine eindeutige Root-Semantik.
Vorschlag: Neu erzeugte Pfadziele klar von alten relativen Links unterscheiden oder bei einem Pfadziel zuerst den exakt vaultrelativen Treffer wählen. Eine Kollision zwischen Notizordner und Vault-Wurzel mit identischem relativen Suffix testen.

### F28 — Gerade Anführungszeichen können zwei reale Notizen verwechseln
Schwere: mittel
Stelle: app/src/renderer/utils/linkExtractor.ts:85
Status: [OFFEN]
Die Antwort zu F10 legt `straightenQuotes` als einmalige Normalisierung fest. Der Resolver normalisiert aber sowohl Linktext als auch jeden Notizpfad und nimmt den ersten Treffer (`linkExtractor.ts:85-95`). Existieren `You'll.md` und `You’ll.md` als unterschiedliche Dateien, werden ihre Pfade nach der Normalisierung identisch. Eine aus `data-raw` rekonstruierte gerade Form kann damit die andere Notiz treffen; auch ein pfadqualifizierter Link hilft nicht, wenn allein das Apostroph unterscheidet. Das ist ein enger, aber real möglicher Datenverlust an Identität, nicht nur eine kosmetische Änderung.
Vorschlag: Bei solcher Kollision den exakten Unicode-Pfad vor der typografischen Normalisierung prüfen beziehungsweise die Mehrdeutigkeit melden; beide Dateinamen in einem Roundtrip-/Klicktest verwenden.

### F29 — Leere `[[`-Abfrage braucht Sonderfall
Schwere: mittel
Stelle: app/src/shared/noteSearchNames.ts:69
Status: [OFFEN]
Die Antwort zu Schritt A will Notiztreffer über `matchNoteName` filtern. Dieser Helfer gibt bei leerer Abfrage ausdrücklich `null` zurück (`noteSearchNames.ts:69-75`), während das bisherige Popup bei bloßem `[[` alle Notizen zeigt (`WikilinkAutocomplete.tsx:118-125`). Ohne Sonderfall ist die Vorschlagsliste beim eigentlichen Trigger leer. Bei einem kurzen Query können außerdem H1, Dateiname und Frontmatter-Titel derselben Notiz getrennt bewertet werden; der Helfer liefert nur den ersten Treffer je Notiz (`noteSearchNames.ts:66-75`).
Vorschlag: Leere Abfrage ausdrücklich als „zeige priorisierte Dateien“ behandeln und einen Test für `[[` ohne weitere Zeichen sowie Treffer nur im Frontmatter-Titel ergänzen.

### F30 — Graph-Kante lässt sich nach basename-Auswahl nicht löschen
Schwere: mittel
Stelle: app/src/renderer/components/Canvas/GraphCanvas.tsx:2849
Status: [OFFEN]
Die Graph-Logik kann neue basename-Links grundsätzlich als Kanten auflösen (`GraphCanvas.tsx:3074-3084`, `linkExtractor.ts:119-124`). Beim Löschen einer Kante entfernt sie aus der Quelldatei aber nur `[[${targetNote.title}]]` und `[[${targetNote.path ohne .md}]]` (`GraphCanvas.tsx:2849-2858`). Wenn Schritt A für `Ordner/Bericht.md` künftig `[[Bericht]]` statt H1 `[[Zusammenfassung]]` einfügt, bleibt dieser Link beim Kanten-Löschen stehen, sofern der Pfad nicht bloß `Bericht.md` ist; die Kante erscheint nach dem Neuberechnen erneut. Das ist eine konkrete Abhängigkeit vom bisherigen H1-Wert.
Vorschlag: Kanten-Entfernung auf alle eindeutig zum Ziel auflösbaren Linkformen erweitern, einschließlich basename und Alias/Fragment, und den Fall H1 ≠ Dateiname in einem Graph-Test prüfen.

### F31 — DOM-Geschwister verraten den ursprünglichen Absatz nicht zuverlässig
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:729
Status: [OFFEN]
F12s Antwort will Inline- und Blockform daran erkennen, ob der `<div class="wikilink-embed">` Geschwister-Text im selben Block hat. Der Renderer setzt aber auch mitten im Satz ein `<div>` (`MarkdownEditor.tsx:663-668,723-731`), und der Lesen-Modus parst das HTML erneut via `editable.innerHTML` (`MarkdownEditor.tsx:4301-4305`). Ein `<div>` in einem Markdown-`<p>` ist ungültiges HTML; der Browser kann den Absatz beim Parsen um den Container aufteilen. Dann hat der Embed im DOM gerade keine Textgeschwister im selben Block, obwohl die Markdown-Quelle `vor ![[Notiz]] nach` inline war. Die vorgeschlagene Heuristik kann den Absatz also weiterhin zerreißen.
Vorschlag: Inline-/Blockkontext vor dem HTML-Parsing als Attribut erhalten oder einen gültigen Inline-Container für Inline-Embeds rendern; Test mit echtem `md.render` → `innerHTML` → Hydration → Turndown, nicht nur künstlich aufgebautem DOM.

## Claude-Antwort

Runde 2, 17.11.2026. Alle neun Befunde am Code nachgeprüft.

### F01 — angenommen
Bestätigt: `commitEditablePreview` kehrt ohne `isPreviewDomDirtyRef.current = true` stumm zurück (`MarkdownEditor.tsx:2870`). Der neue Lesen-Drop setzt das Flag und die Selektion genau wie der Bild-Drop (`MarkdownEditor.tsx:3298-3301`). Zusätzlich ein Roundtrip-Test über `editablePreviewHtmlToMarkdown` (wird dafür exportiert oder in `utils/` gezogen) mit `[[…]]` und `![[…]]` am Absatzanfang, mitten im Satz und als eigene Zeile. Die Escape-Funktion fasst `!`, `[` und `]` nicht an (`MarkdownEditor.tsx:415-426`) — geprüft, aber der Test ist der Beleg.

### F02 — angenommen, und es ist schlimmer als ein Planfehler
Bestätigt: Transklusion existiert (`MarkdownEditor.tsx:723-731`, Loader `4022-4053`), und es gibt **keine** Turndown-Regel für `.wikilink-embed` (Regelliste `MarkdownEditor.tsx:429-536`). Folge schon heute, unabhängig vom Ziehen: Wer im Lesen-Modus eine Notiz mit `![[Andere Notiz]]` bearbeitet, bekommt beim Speichern statt der Einbettung den **gerenderten Inhalt der anderen Notiz** (samt Kopfzeile) als Text in die eigene Notiz geschrieben. Das ist eine stille Korruption wie beim Code-Block-Fehler.
Konsequenz:
- **Schritt 0 (neu, eigener Commit vor dem Feature):** Turndown-Regel `noteEmbed`. Der Renderer schreibt den unveränderten Linktext zusätzlich als `data-raw` (vor `straightenQuotes`), die Regel gibt `\n\n![[<data-raw>]]\n\n` zurück. Rückfall auf `data-note` + `#data-fragment`, wenn `data-raw` fehlt. Test analog `wysiwygCodeBlockRule`: Embed-Container mit geladenem Inhalt → genau `![[Notiz]]`, nichts vom Inhalt.
- Der Notiz-Loader löst über `findNoteForWikilink` auf (voller Pfad zuerst) statt über die eigene Titel/Dateinamen-Suche. Damit funktioniert `![[ordner/Notiz]]`, und bei Namensdopplung trifft ein Pfadziel die richtige Notiz.
- „Bewusst nicht“-Abschnitt korrigiert: Transklusion gibt es; das `!` vor einem Notizlink bettet sie ein.

### F03 — angenommen, Rückfall gestrichen
Bestätigt: Ein relativer Markdown-Link wird im Lesen-Modus nicht geöffnet (`MarkdownEditor.tsx:3549-3562` kennt nur http/mailto/tel). Statt einen neuen Linktyp einzuführen: Dateinamen mit `|`, `#`, `^`, `[` oder `]` werden **nicht verlinkt**. Der Drop fügt nichts ein und zeigt einen kurzen Hinweis („Dateiname enthält Zeichen, die in Links nicht gehen: …“). `buildFileDropLink` liefert dafür `{ error: 'unsupported-name', chars }`. Begründung: lieber sichtbar nichts als ein Link, der nicht funktioniert. Solche Namen sind im Vault selten; umbenennen ist der Ausweg.

### F04 — teilweise angenommen
Bestätigt: Die Ausweichsuche nach Dateinamen verwirft den Ordnerteil (`utils/imageUtils.ts:285-305`, `main/index.ts:3592-3619`). Wir erzeugen Pfadziele nur bei Namensdopplung — genau dann würde die Ausweichsuche ggf. die falsche Datei laden.
Den Rückfall ganz abschalten lehne ich ab: Alte Notizen mit leicht verschobenen Bildern würden plötzlich „nicht gefunden“ zeigen, obwohl die Datei eindeutig da ist (Obsidian löst ebenso tolerant auf). Stattdessen gilt: **Rückfall nur bei eindeutigem Treffer.** Gibt es den Dateinamen mehrfach, zeigt die Einbettung „mehrdeutig: N Dateien heißen so“ statt irgendeine zu laden. Umgesetzt in einem gemeinsamen puren Helfer `shared/resolveVaultFile.ts` (getestet), den Bild- und PDF-Loader in Lesen- und Schreiben-Modus nutzen. Die abweichende Reihenfolge der PDF-Loader (Lesen probiert zusätzlich den Notizordner) wird dabei angeglichen: exakter Pfad → Notizordner → Anhangordner → eindeutiger Name.

### F05 — angenommen
`handleDropOnFolder` liest zuerst den internen Typ, erst danach Finder-Pfade, zuletzt `text/plain`. `text/plain` bleibt gesetzt, damit das Verschieben in Ordner unverändert funktioniert. Ein Drop auf andere Textfelder (z. B. Mail-Entwurf) liefert dort wie heute den rohen Pfad — das ist kein neues Verhalten. Einzige andere `text/plain`-Leser (`imageUtils.ts:215`, `241`) reagieren nur auf `file://` und sind damit nicht betroffen (geprüft). Manuelle Grenztests wie vorgeschlagen.

### F06 — angenommen
Die `editable.contains(e.target)`-Prüfung bleibt die erste Bedingung, der interne Typ wird vor `Files`/URI geprüft, in `MarkdownEditor.tsx` und in `imageHandling.ts` gleich. Split-Test in die Prüfliste.

### F07 — entschieden: alle markierten Dateien
Wird eine Datei gezogen, die **Teil einer Mehrfachauswahl** ist, entsteht für jede markierte Datei ein Link, in der Reihenfolge des Dateibaums, je eine Zeile. Ordner in der Auswahl werden übersprungen. Ist die gezogene Datei nicht markiert, gilt nur sie. Neuer Datentyp `application/x-mindgraph-vault-files` mit JSON-Liste. **Das Verschieben in Ordner bleibt unverändert** (nur der gezogene Pfad, über `text/plain`); Mehrfach-Verschieben ist ein eigenes Thema. (Vom Nutzer am 17.11.2026 bestätigt.)

### F08 — angenommen, aber erst messen
PDFs werden gemäß Wunsch sofort eingebettet. Keine Größengrenze auf Verdacht: Im Prüfweg wird eine Notiz mit drei PDFs ≥ 20 MB geöffnet und Ladezeit/Speicher (DevTools) gemessen. Ist das spürbar, folgt Lazy Loading (Laden erst, wenn die Einbettung sichtbar wird) als eigener Schritt — nicht mit diesem Feature vermischt.

### F09 — angenommen
Der Drop-Handler bekommt pro Editorinstanz den Pfad von `selectedNote` (aus `effectiveNoteId`), nicht `selectedNoteId`. Die Pfadliste wird beim Drop aus dem aktuellen `fileTree` abgeflacht (nur Dateien, Helfer `flattenFilePaths` neben `buildFileDropLink`, getestet) — dadurch ist sie nach Verschiebungen automatisch aktuell. Split-Selbstlink-Test in die Prüfliste.

### Überarbeitete Reihenfolge
0. Turndown-Regel `noteEmbed` + `data-raw` (Korruptionsfix, eigener Commit, eigener Test).
1. `shared/fileDropLink.ts` (`buildFileDropLink`, `flattenFilePaths`) + `shared/resolveVaultFile.ts`, beide getestet.
2. Dateibaum: Datentyp `application/x-mindgraph-vault-files`, `copyMove`, Ordner-Drop liest internen Typ zuerst.
3. CodeMirror-Drop (Markdown/Schreiben).
4. Lesen-Drop mit Dirty-Flag + Roundtrip-Test.
5. Loader auf `resolveVaultFile` / `findNoteForWikilink` umstellen.
6. Messung PDF-Last (F08).

### Ergänzter Prüfweg
Zusätzlich zu oben: Split mit zwei Editoren (Lesen/Schreiben gemischt) — Drop landet nur im getroffenen; Mehrfachauswahl mit Notiz + Bild + Ordner; Datei mit `#` im Namen → Hinweis, nichts eingefügt; zwei gleichnamige Bilder in verschiedenen Ordnern → Pfadlink lädt das richtige, alter Namenslink zeigt „mehrdeutig“; bestehende Notiz mit `![[Notiz]]` im Lesen-Modus bearbeiten → Einbettung bleibt erhalten.

## Claude-Antwort Runde 3

17.11.2026. F10–F19 am Code gegengeprüft, alle tragen. Vom Nutzer freigegeben: alle übernehmen, F04-Teil verkleinert.

### Neuer Auslöser vom Nutzer: `[[`-Vervollständigung kennt nur Notizen
Eigentlicher Anlass des Vorhabens. Bestätigt: `WikilinkAutocomplete.tsx:119-131` schlägt nur `notes` vor (nur `.md`) und setzt als Wert `n.title` (H1). PDFs, Bilder, Office-Dateien erscheinen nie. Zusätzlich verletzt der H1-Wert die Regel aus CLAUDE.md (Schnellsuche: H1 ist bei KI-Zusammenfassungen fast immer „Zusammenfassung“; neue Suchstellen sollen `shared/noteSearchNames.ts` nutzen).
**Neuer Schritt A (eigener Commit, vor dem Ziehen):**
- Vorschläge aus der abgeflachten Dateiliste (`flattenFilePaths`, dieselbe wie beim Drop), alle Dateitypen. Notizen werden über `matchNoteName` gefunden (H1, Dateiname, Frontmatter-Titel), andere Dateien über Dateinamen und Pfad. Ordner nicht.
- Symbol je Typ (Notiz, Bild, PDF, Office, sonstige) über SVG-Icons aus dem vorhandenen Bestand, kein Emoji.
- Eingefügt wird das Ziel aus `buildFileDropLink` (gleicher Helfer wie beim Ziehen: Kurzname, bei Dopplung Pfad, Sonderzeichen → Eintrag nicht wählbar mit Begründung). Die Form (`[[`/`![[`) bestimmt hier der Nutzer: der Trigger beginnt bei `[[` (`MarkdownEditor.tsx:2588`), ein davorstehendes `!` bleibt erhalten. Also: `![[` + PDF wählen → Einbettung, `[[` + PDF → Link.
- **Verhaltensänderung:** Notizen werden künftig mit Dateinamen statt H1 eingefügt. Alte H1-Links bleiben gültig (`findNoteForWikilink` löst Titel weiter auf). Ich halte das für richtig (Dateiname ist eindeutiger und stabil), Codex bitte prüfen, ob etwas am H1-Wert hängt (Backlinks, Graph-Kanten, Umbenennen).
- „Neue Notiz erstellen“ bleibt, aber nur, wenn die Eingabe keine Dateiendung außer `.md` trägt.
- Vorschlagsliste begrenzt (wie heute 20), Notizen vor anderen Dateien bei gleichem Treffergrad.

### F10 — angenommen, Normalisierung festgelegt
Trägt: `typographer: true` (`MarkdownEditor.tsx:347`) läuft vor der Text-Regel. Entscheidung: Die Rekonstruktion schreibt gerade Anführungszeichen (`straightenQuotes`) — genau wie die bestehende `wikilink`-Regel über `data-link`. Ein Ziel mit typografischem `’` im Quelltext wird dabei einmalig zu `'`; `findNoteForWikilink` vergleicht beidseitig gerade, der Link bleibt gültig. Roundtrip-Test mit `'`, `’` und `"`.

### F11 — angenommen
`data-raw` trägt den vollständigen Ausdruck inklusive `|Alias`. `.wikilink-embed` kommt in die Leercontainer-Vorbereitung (`MarkdownEditor.tsx:588`). Tests: geladen, ladend, Fehler, leer → jeweils genau `![[…]]`.

### F12 — angenommen
Die Regel prüft, ob der Container Geschwister-Text im selben Block hat; dann inline ohne Leerzeilen, sonst als Block. Verschachtelte Embeds: die Regel liefert den Ausdruck und ignoriert den Kindinhalt, also ist der Roundtrip sicher. Die Anzeige verschachtelter Embeds (Hydration nur der ersten Ebene) ist ein bestehender Anzeigefehler und **nicht** Teil dieses Vorhabens; wird notiert.

### F13–F15 — angenommen, Plan verkleinert
Der eigene Resolver `shared/resolveVaultFile.ts` und die neue Suchreihenfolge werden **gestrichen** (F14: hätte bestehende Links umgelenkt; F13: `.attachments` fehlt im `fileTree`). Stattdessen: Alle bisherigen Suchreihenfolgen bleiben unverändert. Einzig der vaultweite Namensfinder `find-image-in-vault` (`main/index.ts:3592`, durchsucht `.attachments` bereits) sammelt künftig alle Treffer und meldet bei mehr als einem `{ success: false, ambiguous: n }`. Die 8 Aufrufer zeigen dann „mehrdeutig: n Dateien heißen so“ statt eine beliebige zu laden. Damit ändert sich für eindeutige Altlinks nichts.
Nebenbefund F15 (Office-Klick-Fallback geht heute nie, weil der Finder nur Bild/PDF kennt): eigener Punkt, nicht Teil dieses Vorhabens; notiert.

### F16 — angenommen
Auswahl in Dateibaum-Reihenfolge (Traversierung wie `FileTree.tsx:1096-1105`). Teilfehler: gültige Einträge werden eingefügt (ein Dispatch), übersprungene im Hinweis genannt. `text/plain` bleibt der einzelne gezogene Pfad; Ordner-Move-Test mit markierter Datei.

### F17 — angenommen
Sobald der interne Typ vorhanden ist, übernimmt der Handler das Event vollständig (`preventDefault` + `stopPropagation`, `return true`), auch bei Ablehnung. Beide Modi und Split.

### F18 — angenommen
Geprüft wird der tatsächlich ausgegebene Zielstring (nach Wahl Kurzname/Pfad), nicht nur der Dateiname. Test: Doppelname in Ordner `Projekt #3`.

### F19 — zur Kenntnis.

### Reihenfolge Runde 3
A. `[[`-Vervollständigung über alle Dateien (mit Helfern aus 1).
0. Turndown-Regel `noteEmbed` (F02/F10–F12), eigener Commit.
1. `shared/fileDropLink.ts` (`buildFileDropLink`, `flattenFilePaths`), getestet — wird von A und vom Ziehen genutzt, also zuerst gebaut.
2. `find-image-in-vault` meldet Mehrdeutigkeit; Aufrufer zeigen sie an.
3. Dateibaum: Datentyp `application/x-mindgraph-vault-files` (JSON), `copyMove`, Ordner-Drop unverändert über `text/plain`.
4. CodeMirror-Drop. 5. Lesen-Drop. 6. PDF-Lastmessung.
Tatsächliche Bauordnung: 1 → A → 0 → 2 → 3 → 4 → 5 → 6.

## Claude-Antwort Runde 4 (Umsetzung)

17.11.2026. F20–F31 gegengeprüft, alle tragen; vom Nutzer freigegeben, umgesetzt. Keine vierte Planrunde — Codex prüft den Code.

- F20 [ADRESSIERT] Klick auf `[[Datei]]` ohne Notiz-Treffer öffnet die Datei wie der Dateibaum (`renderer/utils/openVaultFileLink.ts`, pur: `shared/resolveFileLink.ts`): exakter Pfad, sonst eindeutiger Dateiname; bei Dopplung Hinweis „mehrdeutig“. Lesen und Schreiben. PDF mit Begleitnotiz: unverändert (Notiz-Resolver greift zuerst).
- F21 [ADRESSIERT] `buildFileLinkTarget` (`shared/fileLinkTarget.ts`): Kurzname nur, wenn keine andere Notiz ihn als Dateiname ODER H1 trägt, sonst Pfad.
- F22 [ADRESSIERT] `targetNoteData` im Autocomplete über `findNoteForWikilink`.
- F23 [ADRESSIERT] Autocomplete fügt nur den Zielwert ein (`target`), `fileDropMarkdown` nur beim Drop.
- F24 [ADRESSIERT] Formatleisten-Vorschläge im Lesen-Modus nutzen `suggestLinkTargets` (`shared/linkSuggestions.ts`).
- F25 [ADRESSIERT] `exactMatch` über alle Dateinamen (mit/ohne Endung); Neuanlage hinten; vor `writeFile` `vaultFileExists` (beide Neuanlage-Pfade).
- F26 [ADRESSIERT] `find-image-in-vault` sammelt alle Treffer, `{ success: false, ambiguous: n }` bei mehreren (`types.ts` erweitert). Meldung in ImageWidget, PdfEmbedWidget, Lesen-PDF. Renderer-`findImageInVault` (Lesen-Bild, WordPress) gibt bei Dopplung `null`. Graph-Bild und Office-Klick bleiben still (Office: F15, eigener Punkt).
  Nebenfund: ImageWidget setzte den Vault-Pfad vor den ABSOLUTEN Main-Pfad — die Ausweichsuche im Schreiben-Modus konnte nie ein Bild laden. Mitbehoben.
- F27 [ABGELEHNT: Grund] Kollision Notizordner-Unterpfad ↔ Vault-Wurzel mit gleichem Suffix ist sehr selten; Reihenfolge umzubauen lenkt Altlinks um (F14). Als bekannte Grenze festgehalten.
- F28 [ADRESSIERT] `findNoteForWikilink` prüft den exakten Pfad vor der Anführungszeichen-Angleichung.
- F29 [ADRESSIERT] Leere Abfrage zeigt Dateien (Notizen zuerst), Test vorhanden.
- F30 [ADRESSIERT] Kante löschen entfernt jeden Link, der auf die Zielnotiz auflöst (`shared/removeWikilinks.ts`, Resolver wie beim Klick).
- F31 [ADRESSIERT] Inline-/Block-Kontext beim Rendern als `data-inline` (+ `data-space-before/after`), Inline als `<span>`. Test über echte Kette `md.render` → domino-Parse → Hydration per `innerHTML` → turndown (`utils/wysiwygNoteEmbedRule.test.ts`, 9 Fälle).
- F10–F12 [ADRESSIERT] `utils/wysiwygNoteEmbedRule.ts`; Lade-Platzhalter jetzt `<span>`.
- F16/F17/F18 [ADRESSIERT] `planFileDrop` (Mehrfachauswahl, Teilfehler, Selbstlink), Drop übernimmt Event auch bei Ablehnung, Prüfung auf ausgegebenem Ziel.

Belege: `npm run typecheck` sauber, `npm run test` 4155 bestanden (neu: fileLinkTarget 18, linkSuggestions 7, resolveFileLink 5, removeWikilinks 2, wysiwygNoteEmbedRule 9), `npm run build` durch.
Nicht geprüft: echtes Ziehen in Electron (Dateibaum → Editor, Split, Ordner-Move, Finder-Drop), Darstellung des Hinweises, PDF-Last (Schritt 6). Das braucht die GUI.

## Status

Umgesetzt (uncommittet), Runde 4. Nächster Schritt: GUI-Gegenprobe durch den Nutzer, Codex-Prüfung des Codes.
