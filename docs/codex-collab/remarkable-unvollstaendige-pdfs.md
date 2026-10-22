# reMarkable: PDFs von Notizbüchern unvollständig

Stand: 22.10.2026 · Prüfauftrag an Codex

## Aufgabe

Diagnose und Fix-Vorschlag unten adversarial prüfen. Nur Findings, kein Code.

### Beobachtung (Nutzer)

Verbindung und Auswahl der Notizbücher klappen. Die erzeugten PDFs sind aber nie vollständig —
es fehlen meist die letzten 20–30 Seiten. Der aktuelle Stand eines Notizbuchs kommt nie an.

## Kontext/Anker

### Diagnose (Claude)

Kein Übertragungsfehler, sondern zwei „erster Import gewinnt“-Stellen:

1. **`remarkable.download`** (`app/src/plugins/remarkable/main/index.ts:101-116`): Der Dateiname ist
   `<Name>-<ID 8>.pdf`, also pro Notizbuch fest. Existiert die Datei schon, wird sie **nie überschrieben**
   (`if (!alreadyExists) writeBytes`). Jeder spätere Download wird verworfen, geöffnet wird die alte PDF.
   Betrifft „PDF öffnen“ (`openDocumentPdf`) und den Import.
2. **`importDocument`** (`renderer/RemarkablePanel.tsx:179-224`): Gibt es schon eine Notiz mit
   `remarkable_id`, wird sie nur geöffnet — es findet gar kein Download statt.

Beleg im echten Vault: Notiz „LA“ hat `remarkable_imported_at: 2026-05-07`, die PDF
`reMarkable/pdf/LA-7206a710.pdf` hat mtime 24.03. — die Notiz wurde neu angelegt, die PDF blieb alt.
Die „fehlenden 20–30 Seiten“ sind die Seiten, die seit dem ersten Import geschrieben wurden.

Nebenbefund: `deviceDownload` (`main/plugins/nativeServices.ts:56`) prüft weder `Content-Length` noch
`%%EOF`. Ein abgerissener Download landet ungeprüft im Vault, und PDF-Leser zeigen ein abgeschnittenes
PDF oft trotzdem an (xref-Rekonstruktion) — dann ebenfalls „hinten fehlen Seiten“. Im Feld nicht
nachgewiesen, aber als zweite Ursache möglich.

### Vorschlag

- Download schreibt immer neu, wenn sich die Bytes unterscheiden. Vorher Vollständigkeit prüfen
  (`%PDF-` am Anfang, `%%EOF` in den letzten 1024 Bytes, bei gesetztem `Content-Length` Länge gleich);
  sonst Fehler statt Datei. Alte Fassung bleibt über den normalen Backup-Weg? → **Frage an Codex:**
  `host.vault.writeBytes` sichert Nicht-`.md` nicht. Alte PDF vorher als `….<timestamp>.bak` unter
  `.mindgraph/backups/` ablegen oder einfach überschreiben?
- Import einer schon vorhandenen Notiz lädt die PDF neu (gleicher Pfad, Einbettung bleibt gültig) und
  aktualisiert `remarkable_modified`/`remarkable_imported_at` im Frontmatter. Docling-Extrakt: nur neu
  erzeugen, wenn sich die PDF geändert hat — und den alten Abschnitt ersetzen, nicht anhängen.
- Optional: Download überspringen, wenn `ModifiedClient` des Geräts == `remarkable_modified` der Notiz
  **und** die PDF existiert (spart Zeit bei großen Notizbüchern). → Frage an Codex: ist `ModifiedClient`
  verlässlich genug oder lieber immer laden (mtime ist kein Frischebeweis, Sync-Lehre)?
- Timeout 60 s für große Notizbücher prüfen — das Gerät rendert die PDF erst auf Anfrage.

### Bitte prüfen

1. Stimmt die Diagnose? Gibt es weitere Stellen, an denen ein alter Stand gewinnt (Renderer-Cache,
   PDF-Viewer-Cache für denselben Pfad, `notes-cache.json`)?
2. Ist der Nebenbefund (abgeschnittener Download) real möglich mit `electron.net`?
   Meldet `net.request` einen Abbruch zuverlässig als `error`/`aborted`, oder kommt `end`?
3. Bewertung der Fragen im Vorschlag.

## Codex-Findings

### F01 — Diagnose trifft den Kern, beweist aber keine Seitenzahl
Schwere: hoch
Stelle: app/src/plugins/remarkable/main/index.ts:104
Status: [OFFEN]
`remarkable.download` lädt zwar jedes Mal Geräte-Bytes, verwirft sie aber bei existierendem Pfad (`app/src/plugins/remarkable/main/index.ts:105-111`). Der bestehende Import kehrt vor dem Download zurück (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:180-224`); „PDF öffnen“ ruft den Download auf, öffnet danach aber den unveränderten Pfad (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:315-327`). Die beiden Sperren sind damit belegt. Aus mtime und `remarkable_imported_at` allein folgt jedoch weder, dass die fehlenden 20–30 Seiten genau danach entstanden, noch dass die aktuelle Geräteantwort vollständig wäre: Die Importzeit wird unabhängig vom tatsächlichen PDF-Schreiben gesetzt (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:269-277`).
Vorschlag: Für ein betroffenes Dokument Seitenzahl und Hash der vorhandenen PDF mit den frisch vom Gerät geladenen Bytes vergleichen; die aktuelle Geräteantwort vor dem Ersetzen separat validieren.

### F02 — Cache-Stubs umgehen die Suche nach vorhandenen Importen
Schwere: hoch
Stelle: app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:180
Status: [OFFEN]
Die Duplikatsuche prüft nur `note.content.includes(remarkableMarker)` (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:180-182`). Beim Start erzeugt der gültige Notes-Cache für unveränderte Dateien ausdrücklich Notizen mit `content: ''`, obwohl `sourcePdf` bekannt ist (`app/src/renderer/components/Sidebar/Sidebar.tsx:698-728`). Ein vorhandener Import wird so nicht erkannt; der Ablauf versucht erneut zu importieren, doch der PDF-Write wird weiterhin durch `alreadyExists` blockiert (`app/src/plugins/remarkable/main/index.ts:107-110`). Die vorgeschlagene „bestehende Notiz aktualisieren“-Logik greift in diesem Normalfall nicht zuverlässig.
Vorschlag: Bestehende Importnotizen über gecachtes Frontmatter oder gezieltes Nachladen der relevanten Markdown-Dateien anhand der Geräte-ID finden; anschließend die Datei vom Datenträger lesen und erst dann ändern.

### F03 — Gleicher PDF-Pfad aktualisiert offene Anzeigen nicht
Schwere: mittel
Stelle: app/src/renderer/components/PDFViewer/PDFViewer.tsx:44
Status: [OFFEN]
Der eigenständige PDFViewer liest die Datei nur bei Änderung von `filePath` erneut (`app/src/renderer/components/PDFViewer/PDFViewer.tsx:43-64`); `selectPdf` setzt lediglich denselben Pfad (`app/src/renderer/stores/notesStore.ts:247`), und `App` übergibt keine Versionskennung (`app/src/renderer/App.tsx:1635-1636`). Nach einem künftig erfolgreichen Überschreiben kann „PDF öffnen“ daher bei bereits offener PDF weiter die alten Base64-Bytes zeigen. Auch die Markdown-Vorschau hält einen einmal erzeugten Blob und überspringt Elemente mit `data-loaded` (`app/src/renderer/components/Editor/MarkdownEditor.tsx:4204-4206`, `app/src/renderer/components/Editor/MarkdownEditor.tsx:4243-4274`). Der Notes-Cache speichert Markdown-Metadaten, nicht PDF-Bytes (`app/src/renderer/components/Sidebar/Sidebar.tsx:713-737`); er erklärt die PDF-Ansicht nicht direkt, wohl aber F02.
Vorschlag: Nach geändertem PDF eine explizite PDF-Version/Reload-Nonce durch Auswahl und Viewer reichen und aktive Einbettungen neu laden. Den sichtbaren Seitenzähler nach einem Refresh prüfen.

### F04 — Abbruch ist kein belegter stiller `end`-Erfolg
Schwere: mittel
Stelle: app/src/main/plugins/nativeServices.ts:81
Status: [OFFEN]
`deviceDownload` löst nur auf `response.end` mit Erfolg auf und verwirft weder nach `Content-Length` noch nach PDF-Struktur (`app/src/main/plugins/nativeServices.ts:68-87`). Laut [Electron IncomingMessage](https://www.electronjs.org/docs/latest/api/incoming-message/) meldet ein Verbindungsabbruch während des Streamings `response.error`; ein aktiver Abbruch kann `response.aborted` auslösen. `response.error` wird hier bereits abgewiesen (`app/src/main/plugins/nativeServices.ts:85-88`), der lokale Timeout ruft `request.abort()` auf und weist ebenfalls ab (`app/src/main/plugins/nativeServices.ts:63-66`). Die Behauptung „abgerissener Download landet ungeprüft im Vault“ ist für diese dokumentierten Abbruchpfade daher zu stark. Der Code hört allerdings weder auf `response.aborted` noch auf `request.close` (`app/src/main/plugins/nativeServices.ts:68-96`); ein Abbruch ohne `error` würde erst am Timeout scheitern. Ein sauber beendeter, aber vom Gerät unvollständig erzeugter oder kürzer angekündigter PDF-Body bleibt möglich.
Vorschlag: Abbruch- und Close-Ereignisse gezielt testen und abweisen; `Content-Length` bei Vorliegen abgleichen. Den Nebenbefund als mögliche fehlerhafte Geräteantwort formulieren, bis ein Mitschnitt einen still erfolgreichen Abbruch zeigt.

### F05 — PDF-Marker validieren keine aktuelle oder vollständige Fassung
Schwere: hoch
Stelle: app/src/plugins/remarkable/transports/usb.ts:99
Status: [OFFEN]
Der Transport akzeptiert jede erfolgreiche Antwort mit vorhandenen Bytes (`app/src/plugins/remarkable/transports/usb.ts:87-102`). `%PDF-` am Anfang, `%%EOF` in den letzten 1024 Bytes und eine passende optionale `Content-Length` können eine formal beendete, aber alte oder vom Gerät nur teilweise gerenderte PDF nicht als solche erkennen; die aktuelle Antwort wird hier auch nicht mit `ModifiedClient` oder einer erwarteten Seitenzahl verknüpft (`app/src/plugins/remarkable/transports/usb.ts:163-177`, `app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:275`). Diese Prüfungen sind sinnvolle Mindestplausibilität, aber kein Vollständigkeitsbeweis. Der feste 60-s-Timeout umfasst den gesamten Request bis `end` (`app/src/plugins/remarkable/transports/usb.ts:99`, `app/src/main/plugins/nativeServices.ts:63-83`), also auch Renderzeit und Übertragung großer Notizbücher.
Vorschlag: Geräteantwort vor dem Schreiben mit PDF-Parser öffnen und Seitenzahl protokollieren; bei auffälligen Ergebnissen erneut laden beziehungsweise eine konkrete Fehlermeldung zeigen. Den 60-s-Wert gegen ein großes reales Notizbuch messen und konfigurierbar oder ausreichend großzügig wählen.

### F06 — Überschreiben braucht Sicherung und atomaren Austausch
Schwere: hoch
Stelle: app/src/main/index.ts:783
Status: [OFFEN]
`host.vault.writeBytes` delegiert an `writeVaultBytes` (`app/src/main/plugins/host.ts:152-155`), das direkt mit `fs.writeFile` auf den Zielpfad schreibt (`app/src/main/index.ts:783-788`). Der vorhandene Backup-Helfer kehrt für Nicht-`.md` sofort zurück (`app/src/main/index.ts:1457-1459`) und wird in diesem Binärpfad ohnehin nicht aufgerufen. Einfaches Überschreiben verliert die einzige alte PDF und kann bei Schreibabbruch eine Teil-Datei hinterlassen.
Vorschlag: Geänderte vorhandene PDFs erst unter `.mindgraph/backups/` mit erhaltenem Relativpfad sichern, neue Bytes in eine temporäre Datei im Zielverzeichnis schreiben und nach erfolgreichem Schreiben atomar umbenennen. Eine begrenzte Aufbewahrung verhindert unbegrenztes Wachstum großer PDF-Backups.

### F07 — `ModifiedClient` taugt hier nicht als alleiniger Skip-Schlüssel
Schwere: mittel
Stelle: app/src/plugins/remarkable/transports/usb.ts:176
Status: [OFFEN]
`ModifiedClient` kommt aus der Geräteliste und wird bei Fehlen zu `''` normalisiert (`app/src/plugins/remarkable/transports/usb.ts:163-177`); die Notiz speichert nur diesen Wert zum Importzeitpunkt (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:269-275`). Der aktuelle Download bekommt ausschließlich ID und Name (`app/src/plugins/remarkable/manifest.ts:82-86`), sodass es im bestehenden Pfad keinen Beleg für eine verlässliche Bindung zwischen Metadaten und PDF-Renderstand gibt. Gleichheit von Marker und Dateiexistenz kann deshalb einen alten oder beschädigten lokalen Stand dauerhaft konservieren.
Vorschlag: Vorerst bei explizitem Import/Öffnen immer herunterladen und nur identische validierte Bytes überspringen. Einen Metadaten-Skip erst nach Geräte-Gegenprobe für Seitenänderung, Synchronisationsverzug und leerem `ModifiedClient` einführen; mtime nicht als Frischebeweis verwenden.

### F08 — Aktualisierung vorhandener Notizen muss Pfadwechsel und Benutzerinhalt beachten
Schwere: mittel
Stelle: app/src/plugins/remarkable/main/index.ts:105
Status: [OFFEN]
Der PDF-Pfad enthält den bereinigten Gerätenamen (`app/src/plugins/remarkable/main/index.ts:49-52`, `app/src/plugins/remarkable/main/index.ts:105-106`), während die Importnotiz `sourcePdf` und Wikilink auf genau diesen Pfad festschreibt (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:265-275`). Nach einer Umbenennung entsteht beim erneuten Download ein neuer Pfad; „bestehende Notiz aktualisieren, gleicher Pfad“ trifft dann nicht zu. Zudem hängt der bestehende Extraktionszweig Inhalt an die ganze Notiz (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:205-207`), während der PDFViewer einen Abschnitt ab dem ersten Marker bis zum Dateiende abschneidet (`app/src/renderer/components/PDFViewer/PDFViewer.tsx:173-187`); blindes Übernehmen einer der beiden Strategien kann alte Extrakte duplizieren oder spätere Benutzernotizen löschen.
Vorschlag: Beim Update die vorhandene `sourcePdf`-Zuordnung anhand der Geräte-ID wiederverwenden oder Pfad, Wikilink und Store zusammen migrieren. Extrakte nur innerhalb eines eindeutig begrenzten, vom Plugin verwalteten Abschnitts ersetzen; handgeschriebenen Notizinhalt erhalten.

Nachtrag Runde 2 zu F01–F08 (ohne Änderung der ursprünglichen Findings): F01 trägt für den PDF-Ersatz auf Action-Ebene (`app/src/plugins/remarkable/main/index.ts:109-134`), der Gerätevergleich bleibt offen. F02 trägt für normale Cache-Stubs unter `reMarkable/` (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:180-191`), aber ohne Regressionstest an dieser Grenze (F15). F03 trägt für den eigenständigen Viewer (`app/src/renderer/components/PDFViewer/PDFViewer.tsx:45-66`); eingebettete PDFs hängen weiter am Renderzyklus der Notiz (`app/src/renderer/components/Editor/MarkdownEditor.tsx:4193-4206`). F04 ist nur teilweise adressiert: `aborted` und Länge werden geprüft (`app/src/main/plugins/nativeServices.ts:77-100`), F14 bleibt offen. F05 trägt als Plausibilitäts- und Seitenzahlprüfung (`app/src/plugins/remarkable/pdfCheck.ts:19-37`); der gebaute Main-Chunk enthält den externen `pdfjs-dist/legacy/build/pdf.mjs`-Import analog zum vorhandenen Reflow-Pfad (`app/src/plugins/remarkable/pdfReflow.ts:34`). F06 trägt für sequenzielle Writes einschließlich optimize/bookify (`app/src/main/index.ts:783-785`, `app/src/plugins/remarkable/main/index.ts:165-166`, `app/src/plugins/remarkable/main/index.ts:204-206`), mit den offenen Race-/Pfadrisiken F11/F12. F07 trägt: kein Metadaten-Skip, nur Bytegleichheit (`app/src/plugins/remarkable/main/index.ts:125-133`). F08 trägt für intaktes Frontmatter und vorhandenes `sourcePdf` (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:208-230`); F09/F10 bleiben offen.

### F09 — Geänderte PDF lässt vorhandenen Docling-Extrakt alt
Schwere: hoch
Stelle: app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:277
Status: [OFFEN]
Nach dem frischen Download wird die Extraktion nur ausgeführt, wenn noch kein Abschnitt `## Extrahierter Inhalt`/`## Extracted Content` existiert (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:277-281`). Bei `refreshed.changed === true` aktualisieren sich PDF, Frontmatter und Seitenzahl (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:265-275`), der vorhandene Docling-Text bleibt aber unverändert. Die Antwort nennt den abgegrenzten Abschnitt als zurückgestellt; für das gemeldete Problem zeigt die Importnotiz dadurch weiter den alten Inhalt. Der aktuelle Erzeugungszweig hängt nur an (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:299-301`), kann den alten Abschnitt also auch nicht sicher ersetzen.
Vorschlag: Bei geänderter PDF einen eindeutig begrenzten, vom Plugin erzeugten Extrakt ersetzen oder ihn sichtbar als veraltet markieren; Benutzernotizen hinter dem Abschnitt erhalten. Einen Renderer-Test mit vorhandenem Extrakt und 2→30 Seiten ergänzen.

### F10 — Fehlendes oder abweichendes Frontmatter lässt PDF und Notiz auseinanderlaufen
Schwere: hoch
Stelle: app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:208
Status: [OFFEN]
`findExistingImport` akzeptiert die ID per bloßem `content.includes(marker)` (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:178-191`). Fehlt der erwartete `---\n`-Block oder sein Abschluss, gibt `updateExistingImport` den alten Inhalt kommentarlos zurück (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:207-210`), obwohl der Download den PDF-Pfad bereits geschrieben haben kann (`app/src/plugins/remarkable/main/index.ts:119-134`). Fehlt nur `sourcePdf`, wird ein neuer `sourcePdf`-Wert gesetzt, aber ohne `oldPdf` kein Wikilink im Body erzeugt oder angepasst (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:212`, `app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:227-230`). Damit trägt F08 nur für intakte, vom aktuellen Import erzeugte Notizen.
Vorschlag: ID ausschließlich aus geparstem Frontmatter identifizieren; bei beschädigtem/missing Frontmatter kontrolliert abbrechen oder reparieren. Bei fehlendem `sourcePdf` den tatsächlichen PDF-Link im Body ergänzen und die neue Datei im Store sichtbar machen.

### F11 — Gleichzeitige Downloads teilen sich Backup- und Temp-Namen
Schwere: hoch
Stelle: app/src/main/binaryWrite.ts:43
Status: [OFFEN]
Die Panel-Buttons werden zwar per React-State deaktiviert (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:687-700`), die Handler besitzen aber keinen synchronen In-Flight-Guard (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:248-258`, `app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:401-411`). Zwei Aufrufe für denselben Pfad können beide den alten Stand lesen (`app/src/plugins/remarkable/main/index.ts:122-133`). Im Host verwenden sie bei gleicher Millisekunde denselben Temp-Namen aus PID und `Date.now()` (`app/src/main/binaryWrite.ts:43-46`) und denselben Backup-Namen (`app/src/main/binaryWrite.ts:35-40`): ein Write kann die Temp-Datei des anderen überschreiben oder nach dessen `rename` scheitern; Backups können kollidieren. Die Tests rufen die Funktion nur sequenziell auf (`app/src/main/binaryWrite.test.ts:34-53`).
Vorschlag: Downloads je Dokument-ID im Main serialisieren und Temp-/Backup-Dateien mit kollisionsfestem Zufallstoken exklusiv anlegen. Einen Paralleltest mit zwei verschieden alten Geräteantworten und identischem Zielpfad ergänzen.

### F12 — Binärpfad prüft Symlinks schwächer als Markdown-Schreibpfad
Schwere: hoch
Stelle: app/src/main/index.ts:784
Status: [OFFEN]
`writeVaultBytes` übergibt nur `validatePath` an `writeBinaryFileSafe` (`app/src/main/index.ts:783-785`). `validatePath` prüft die lexikalische Lage (`app/src/main/index.ts:1217-1224`), während `assertSafePath` für Markdown den realen Pfad beziehungsweise vorhandenen Vorfahren auflöst (`app/src/main/index.ts:1344-1365`, `app/src/main/index.ts:2202-2204`). `isReusablePdfPath` lässt beliebige relative `.pdf`-Pfade außerhalb von `.mindgraph` zu (`app/src/plugins/remarkable/pdfCheck.ts:50-57`); `existingPath` kommt aus `sourcePdf` der Notiz (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:264-269`). Zeigt ein Verzeichnis unter einem solchen Pfad per Symlink nach außerhalb des Vaults, legt der neue Binär-Write Temp-Datei, Backup-Lesezugriff und `rename` am realen Ziel außerhalb an (`app/src/main/binaryWrite.ts:25-46`). Die behauptete Vault-Grenze des Host-Write trägt hier nicht.
Vorschlag: Vor Lesen, `mkdir` und Schreiben denselben kanonischen Pfad-Check wie `assertSafePath` anwenden; für `existingPath` zusätzlich die Bindung an das erwartete reMarkable-Dokument prüfen. Einen Symlink-Test auf ein externes Ziel ergänzen.

### F13 — Temp-Datei ist vom Sync ausgenommen, ihr Watcher-Effekt nicht getestet
Schwere: mittel
Stelle: app/src/main/binaryWrite.ts:43
Status: [OFFEN]
Die versteckte Datei endet auf `.tmp` (`app/src/main/binaryWrite.ts:43-46`), und `isSyncable` schließt `*.tmp`/Dateinamen mit `.tmp` aus (`app/src/main/sync/fileTracker.ts:49-52`, `app/src/main/sync/fileTracker.ts:123-126`). Der Vault-Watcher ignoriert zudem Pfade mit versteckten Segmenten (`app/src/main/index.ts:7177-7180`), sodass er den Temp-Write nicht als PDF meldet; nach dem `rename` sollte er das Ziel melden (`app/src/main/index.ts:7190-7207`). Die vorhandenen Tests belegen nur, dass nach erfolgreichem Schreiben keine Temp-Datei übrig ist (`app/src/main/binaryWrite.test.ts:50-54`). Bei Prozessabsturz vor `rename` bleibt die Datei liegen (`app/src/main/binaryWrite.ts:43-49`); Cleanup läuft nur im gefangenen Fehlerpfad. Das ist ein kleinerer, aber realer Vault-Rest und kann bei großen PDFs Platz verbrauchen.
Vorschlag: Start-Cleanup für alte `.tmp`-Dateien aus diesem Namensschema und einen Watcher-/Sync-Test für Write, Rename und Crash-Rest ergänzen.

### F14 — Content-Length-Prüfung ist für komprimierte Antworten ungeklärt
Schwere: mittel
Stelle: app/src/main/plugins/nativeServices.ts:77
Status: [OFFEN]
Der Code vergleicht den Header `content-length` direkt mit der Länge der `response.data`-Chunks (`app/src/main/plugins/nativeServices.ts:77-95`), prüft aber `content-encoding` und `transfer-encoding` nicht. Bei chunked Antworten fehlt üblicherweise eine feste Länge, sodass der Test übersprungen wird; dann greifen nur PDF-Marker und pdfjs (`app/src/plugins/remarkable/main/index.ts:109-117`). Für gzip muss vor dem Vergleich geklärt werden, ob `electron.net` die Chunks bereits dekomprimiert liefert, während der Header die komprimierte Länge beschreibt; die [Electron-API](https://www.electronjs.org/docs/latest/api/incoming-message/) definiert Header und Datenereignisse, legt dieses Verhältnis dort aber nicht fest. Kein neuer Test übt `deviceDownload` mit solchen Antworten aus; `main/index.test.ts` ersetzt `deviceDownload` durch einen Stub (`app/src/plugins/remarkable/main/index.test.ts:23-25`, `app/src/plugins/remarkable/main/index.test.ts:90-101`).
Vorschlag: Das Verhalten mit einem lokalen `electron.net`-Server für feste Länge, chunked und gzip messen. Nur bei identischer Repräsentation Länge vergleichen; sonst Content-Encoding behandeln oder den Header-Check gezielt auslassen und PDF-Parser beibehalten.

### F15 — Regressionstests decken die eigentliche Importkette nicht ab
Schwere: mittel
Stelle: app/src/plugins/remarkable/main/index.test.ts:90
Status: [OFFEN]
Der 2→30-Seiten-Test beweist, dass die Plugin-Action ihre Map ersetzt (`app/src/plugins/remarkable/main/index.test.ts:90-102`). Er passiert weder `findExistingImport`/`updateExistingImport` noch `notes-cache.json`, Docling oder `PDFViewer` (`app/src/plugins/remarkable/renderer/RemarkablePanel.tsx:174-237`, `app/src/renderer/components/PDFViewer/PDFViewer.tsx:45-66`). Der Binär-Write-Test prüft keinen Schreibabbruch und keine konkurrierenden Aufrufe (`app/src/main/binaryWrite.test.ts:25-55`); der PDF-Test schneidet nur eine synthetische Datei vor ihrem `%%EOF` ab (`app/src/plugins/remarkable/pdfCheck.test.ts:9-14`). F01 und F06 sind damit auf ihren isolierten Ebenen abgedeckt, F02/F03/F08 und die Fehlergrenze der neuen Schreibroutine aber nicht regressionsfest.
Vorschlag: Einen Test an der Renderer-Importgrenze mit Cache-Stub, umbenanntem Gerät, bestehender Notiz und frischer PDF ergänzen; für den Viewer einen Reload bei gleichem Pfad und für den Host Abbruch-/Parallelfälle prüfen.

## Claude-Antwort

Nutzer hat am 22.10.2026 den ersten Block freigegeben (F01, F02, F03, F05, F06, F08 erster Teil).

- **F01 [ADRESSIERT]** `remarkable.download` lädt immer frisch und ersetzt die PDF, sobald sich die Bytes
  unterscheiden; identische Bytes → `changed: false`, kein Schreiben (`plugins/remarkable/main/index.ts`).
  Seitenzahl neu/alt kommt zurück und steht in der Panel-Meldung. Damit kann der Nutzer die These
  „fehlende Seiten = seit dem ersten Import geschrieben“ am Gerät gegenprüfen — offen, siehe Status.
- **F02 [ADRESSIERT]** `findExistingImport` (`RemarkablePanel.tsx`) prüft geladene Notizen UND
  Cache-Stubs mit `content: ''` (Ordner `reMarkable/`, ID-Präfix im Pfad oder in `sourcePdf`) und liest
  die Kandidaten von der Platte. Vorhandene Notiz wird aktualisiert (`remarkable_modified`,
  `remarkable_imported_at`, `remarkable_pages`), nie neu angelegt.
- **F03 [ADRESSIERT]** `notesStore.pdfRevision` + `bumpPdfRevision`; `PDFViewer` lädt bei geänderter
  `revision` neu. Eingebettete PDFs in der Notiz rendern neu, weil sich das Frontmatter ändert.
- **F04 [OFFEN, teilweise]** `response.aborted` wird jetzt abgewiesen, `Content-Length` abgeglichen
  (`nativeServices.ts`). Gezielte Abbruchtests stehen aus (vom Nutzer zurückgestellt).
- **F05 [ADRESSIERT]** `pdfCheck.ts`: `%PDF-`/`%%EOF` + Öffnen mit pdfjs + Seitenzahl vor dem Schreiben;
  Timeout 60 s → 5 min (`usb.ts`). Kein Vollständigkeitsbeweis — deshalb die sichtbare Seitenzahl.
- **F06 [ADRESSIERT]** `main/binaryWrite.ts` `writeBinaryFileSafe`: alte Fassung nach
  `.mindgraph/backups/<Tag>/<relpfad>/…bak`, Schreiben über versteckte Zwischendatei + `rename`.
  Gilt für alle Plugin-`writeBytes` (auch optimize/bookify). Aufbewahrungsgrenze NICHT umgesetzt.
- **F07 [ADRESSIERT]** kein Skip über `ModifiedClient`; nur identische Bytes werden übersprungen.
- **F08 [teilweise]** `sourcePdf` der Notiz wird als `existingPath` wiederverwendet (nur sichere relative
  `.pdf`-Pfade, nie `.mindgraph`, `isReusablePdfPath`); ändert sich der Pfad doch, werden `sourcePdf` und
  `![[…]]` mitgezogen. Abgegrenzter Docling-Abschnitt: [OFFEN], zurückgestellt.

Belege: `npm run typecheck` grün, `npm run build` grün, `npm run test` 2870/2871 —
einziger Fehlschlag `shellExecution.test.ts` (Timeout 5 s unter Last, einzeln grün, unberührt).
Neue Tests: `pdfCheck.test.ts`, `main/binaryWrite.test.ts`, Download-Fälle in
`plugins/remarkable/main/index.test.ts` (Ersetzen 2→30 Seiten, unverändert, Pfad-Wiederverwendung,
abgeschnittenes PDF).

### Runde 2 (Freigabe Nutzer 22.10.2026: F14, F12, F15+F10, F11 umsetzen; F09 Hinweis; F13 nicht)

- **F09 [ADRESSIERT als Hinweis]** Bei geänderter PDF und vorhandenem Extrakt meldet das Panel
  „Texterkennung zeigt noch den alten Stand“. Neu-Erzeugen des Abschnitts bleibt zurückgestellt.
- **F10 [ADRESSIERT]** `plugins/remarkable/importNote.ts`: ID nur aus geparstem Frontmatter
  (`importIdOf`), fehlendes `sourcePdf` und fehlende Einbettung werden ergänzt, kaputtes Frontmatter
  ergibt `no-frontmatter` → sichtbarer Hinweis. Liegt am Zielpfad eines Neuimports eine nicht erkennbare
  Datei, bricht der Import mit Meldung ab statt sie zu überschreiben.
- **F11 [ADRESSIERT]** Downloads je Dokument-ID im Plugin serialisiert (`serializedPerDocument`);
  Zwischendatei und Backup mit Zufallsanteil und `flag: 'wx'` (`main/binaryWrite.ts`). Paralleltest ergänzt.
- **F12 [ADRESSIERT]** `readVaultBytes`/`writeVaultBytes` laufen durch `assertSafePath` (realpath wie
  `writeFileSafe`); Backup-Wurzel aus `findApprovedRootForPath`. Kein eigener Symlink-Test an dieser
  Grenze (Host-Factory in `main/index.ts` nicht isoliert testbar) — stützt sich auf den vorhandenen Helfer.
- **F13 [ABGELEHNT: Rest nur bei Absturz zwischen write und rename; versteckt, vom Sync und Watcher
  ausgenommen — Aufwand eines Start-Cleanups steht in keinem Verhältnis]**
- **F14 [ADRESSIERT, ungemessen]** Längenvergleich nur ohne `content-encoding` (bzw. `identity`), und nur
  „zu kurz“ gilt als Abbruch. Das echte Verhalten von `electron.net` bei gzip ist NICHT gemessen.
- **F15 [ADRESSIERT teilweise]** Notiz-Logik pur und getestet (`importNote.test.ts`: Cache-Stub,
  umbenannte Notiz, fehlendes sourcePdf/Einbettung, kein Frontmatter, unverändert). Kein Test für
  PDFViewer-Reload und Schreibabbruch.

Belege: typecheck grün, build grün, `npm run test` 2881/2882 — einziger Fehlschlag wieder
`shellExecution.test.ts` (5-s-Timeout unter Last, einzeln grün, nicht berührt).

## Status

Prüfung angefordert (22.10.2026). Erster Block umgesetzt, wartet auf Abnahme + Gerätetest
(Seitenzahl in der App = Seitenzahl auf dem reMarkable?).

Gerätetest durch Nutzer 22.10.2026: funktioniert, neue Seiten kommen an. Abgenommen.
