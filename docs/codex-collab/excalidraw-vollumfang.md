# Excalidraw-Plugin: Bilder einbinden + Weg zum (weitgehend) vollen Funktionsumfang

## Aufgabe

Der Nutzer hat das Excalidraw-Plugin getestet: **Bilder lassen sich nicht einbinden.** Ziel ist der
weitestgehend volle Funktionsumfang von Excalidraw innerhalb von MindGraph Notes.

Codex, bitte zwei Dinge:

1. **Ursachenbefund prüfen** (unten, „Befund 1"): Stimmt die Ursache, und ist die vorgeschlagene
   Freigabe im Main-Prozess die richtige Stelle und eng genug? Was übersehen wir (Sicherheit,
   andere Aufrufer der File-System-Access-API, Windows/Linux)?
2. **Bestandsaufnahme und Reihenfolge prüfen** („Was fehlt zum vollen Umfang"): fehlende Punkte
   ergänzen, falsche Annahmen benennen, Reihenfolge/Schnitt kritisieren. Besonders: wo die Grenze
   zwischen Host (App, Plugin-API) und Plugin liegen sollte, und welche Punkte bewusst draußen
   bleiben sollten (lokal-first, keine Cloud ohne Opt-in, Sicherheitsentscheidungen aus der
   Font-Review F01–F11 in `excalidraw-font-fix-review.md`).

Adversarial prüfen. Kein Code-Edit, kein Commit.

## Kontext/Anker

- Plugin: eigenes Repo `~/dev/mindgraph-excalidraw-plugin` (v0.2.0, `@excalidraw/excalidraw@0.18.1`,
  esbuild Single-File-ESM mit Font-Shims).
  - Editor-Optionen: `~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:262-279`
    (`UIOptions.canvasActions`: loadScene/saveToActiveFile/saveFileToDisk/export = false;
    `MainMenu` nur ChangeCanvasBackground + ClearCanvas). Kein `langCode`, kein `onLinkOpen`,
    keine Library-Persistenz (`onLibraryChange`/`libraryReturnUrl`), kein `validateEmbeddable`.
  - Speichern: `renderer.tsx:222-232` (`serializeAsJSON(..., 'local')` → Bilder als `files[id].dataURL`
    in der .excalidraw-Datei).
  - Inline-Embed: `renderer.tsx:313-378` (`exportToSvg`, `skipInliningFonts:true`).
  - Build/Shims: `~/dev/mindgraph-excalidraw-plugin/build.mjs:539-572` (Font-Pfad neutralisiert),
    Subset-Worker-Shims `shims/*.js`.
- Host:
  - Plugin-Vault-Bridge: `app/src/main/index.ts:761-791` (`buildPluginHostServices`; `vault.readBytes`/
    `writeBytes` existieren bereits, Plugin nutzt sie nicht).
  - Plugin-Tab: `app/src/renderer/plugins/external/PluginEditorTab.tsx`
  - **Berechtigungen:** `app/src/main/index.ts:1281-1309` (`setPermissionRequestHandler`: nur `media`
    für vertrauenswürdige URL, alles andere `callback(false)`) und `:1311-1330`
    (`setPermissionCheckHandler`: alles außer `media` → `false`).
  - Globale Drop-Handler: `app/src/renderer/App.tsx:306-319` (nur preventDefault),
    `app/src/renderer/components/Editor/MarkdownEditor.tsx:3150-3303` (Lesen-Modus, document-capture,
    `stopImmediatePropagation` für JEDEN Datei-Drop, solange der Effekt aktiv ist).
  - CSP: `app/index.html:6` (img-src data: blob:, worker-src blob:, script-src 'wasm-unsafe-eval' blob:,
    frame-src nur 'self' blob: mindgraph-preview:, connect-src ohne externe Hosts außer HF/jsdelivr).

### Befund 1 — Bild-Werkzeug: Lesezugriff auf die gewählte Datei wird verweigert (reproduziert)

Reproduziert am 07.10.2026 in der Dev-App (isoliertes Profil, Testvault, Plugin 0.2.0) per CDP:

| Weg | Ergebnis |
|---|---|
| Einfügen (synthetisches `paste` mit PNG, Fokus im Canvas) | funktioniert, Bild in Datei |
| Drag & Drop (synthetisches `drop` auf `canvas.interactive`) | funktioniert, Bild in Datei |
| Werkzeugleiste „Bild" (echter Klick per `Input.dispatchMouseEvent`) | nativer Dialog öffnet; nach Auswahl: **`NotAllowedError: Failed to execute 'getFile' on 'FileSystemFileHandle': The request is not allowed by the user agent or the platform in the current context.`** Kein Element entsteht. |

Ursache (Hypothese, stark belegt): Excalidraw nutzt `browser-fs-access` → `showOpenFilePicker()`.
Der Picker läuft, aber `handle.getFile()` fragt in Electron die Berechtigung `fileSystem` ab; unser
`setPermissionCheckHandler` antwortet für alles außer `media` mit `false`
(`app/src/main/index.ts:1311-1312`), der Request-Handler ebenso (`:1307`). Damit trifft es jede
Bibliothek-/Szene-Öffnen-Funktion von Excalidraw (auch „Bibliothek öffnen" `.excalidrawlib`), nicht nur
Bilder — und jede andere Stelle der App, die die File-System-Access-API nutzen würde.

Vorschlag: in beiden Handlern `fileSystem` für die vertrauenswürdige Renderer-URL
(`isTrustedRendererUrl`) erlauben, und zwar **nur lesend** (`details.fileAccessType === 'readable'`)
und **nur für Dateien** (`!details.isDirectory`) — der Nutzer hat die Datei selbst im OS-Dialog gewählt.
Schreibend (`showSaveFilePicker`) bleibt zu, solange Export bewusst aus ist. Offene Frage: Liefert Electron
40 `fileAccessType`/`isDirectory` im Check-Handler zuverlässig, oder nur im Request-Handler?

Nebenbefund (nicht reproduziert, aber im Code sichtbar): Der Lesen-Modus-Drop-Handler
(`MarkdownEditor.tsx:3172-3182`) stoppt JEDEN Datei-Drop dokumentweit in der Capture-Phase, bevor er
prüft, ob das Ziel in der Vorschau liegt. Im Test kam der Drop trotzdem an (Editor offenbar nicht im
Lesen-Modus gemountet, während der Plugin-Tab aktiv war). Ist das garantiert, z. B. in der Split-Ansicht
(Notiz im Lesen-Modus links, Excalidraw rechts)? Wenn nicht: Finder-Drop ins Excalidraw-Canvas wird still
geschluckt.

### Nebenbefund 2 — Bilder landen als Base64 in der .excalidraw-Datei, Status bleibt `pending`

Im Test stehen die Bilder als `files[id].dataURL` in der Zeichnung, das Element behält `status: "pending"`
(Excalidraw erwartet, dass die Host-App Dateien speichert und dann `saved` setzt). Folgen: große
Zeichnungsdateien (Sync-Volumen, Backups pro Write: jedes Autosave schreibt alle Bilder neu), und das
Bild ist nicht als eigene Datei im Vault auffindbar. Obsidian-Excalidraw legt Bilder als Vault-Dateien ab.
Frage: Base64 in der Datei lassen (einfach, portabel, kompatibel mit excalidraw.com) oder Bilder als
Vault-Dateien ablegen (Format-Bruch zu excalidraw.com)? Und: Größenbremse? Excalidraw verkleinert auf
`DEFAULT_MAX_IMAGE_WIDTH_OR_HEIGHT` und lehnt > `MAX_ALLOWED_FILE_BYTES` ab.

### Was fehlt zum vollen Umfang (Bestandsaufnahme, Claude)

| # | Funktion | Stand | Vermutete Ursache / Grenze | Vorschlag |
|---|---|---|---|---|
| 1 | Bild über Werkzeugleiste | kaputt | Befund 1 | Host-Fix (Berechtigung) |
| 2 | Export PNG/SVG/Zwischenablage | bewusst aus (F05) | Schreib-Picker + Font-Subsetting geshimmt (SVG ohne Schriften) | Export über Host-API: PNG via `exportToBlob` → `vault.writeBytes` neben die Zeichnung bzw. Speichern-Dialog im Main; SVG mit eingebetteten Schriften selbst bauen statt Subsetting-Worker |
| 3 | Bibliothek (Library) | Knopf sichtbar, Inhalte gehen beim Neuladen verloren; „Durchsuchen" führt zu libraries.excalidraw.com | keine `onLibraryChange`-Persistenz; Import braucht File-Access (Befund 1); Durchsuchen = externe Website + Rücksprung-URL | Library als Vault-Datei (`.mindgraph/excalidraw-library.excalidrawlib` oder sichtbar im Vault), Import `.excalidrawlib` lokal; Online-Katalog nur als externer Link |
| 4 | Sprache | UI englisch | kein `langCode` | `langCode` aus App-Sprache; prüfen, ob die Locale-Chunks im Single-File-Bundle enthalten sind |
| 5 | Links in Elementen | Klick öffnet Fenster/Browser | kein `onLinkOpen` | `[[Notiz]]` und vault-relative Pfade im Host öffnen, http(s) über System-Browser; braucht Host-API `openNote`/`openLink` |
| 6 | Notiz-/Bild-Einbettung aus dem Vault | fehlt | kein Vault-Picker | „Bild aus Vault einfügen" (Host-Dateiauswahl → `readBytes` → `addFiles`) |
| 7 | Web-Einbettungen (embeddable: YouTube, Websites) | blockiert | CSP `frame-src` ohne externe Hosts | eher bewusst draußen lassen oder nur mit Opt-in; Diskussion |
| 8 | Mermaid → Excalidraw, „Text to diagram" | Mermaid im Bundle (lokal); Text-to-diagram braucht excalidraw-AI-Backend | Cloud | Mermaid prüfen; Text-to-diagram nur via lokalem Ollama über Host-LLM-API, sonst aus |
| 9 | Hauptmenü | nur Hintergrund + Leeren | bewusst reduziert | Hilfe, Suche im Canvas, Raster, Zen/Ansichtsmodus, Einstellungen zurückholen |
| 10 | Schriften Helvetica/CJK | schreibgeschützt | F11 fail-closed | bleibt (Begründung Font-Review); evtl. Xiaolai als optionales Asset |
| 11 | Inline-Embed in Notizen | fertig (SVG) | Bilder im Embed? | gegenprüfen, dass Bilder im `exportToSvg` erscheinen |
| 12 | Live-Zusammenarbeit | fehlt | excalidraw.com-Server | bewusst draußen |

Vorgeschlagene Reihenfolge: (a) Befund 1 als App-Fix (kleiner Patch, sofort nutzbar, wirkt mit dem
bestehenden Plugin 0.2.0) → (b) Plugin 0.3.0: Sprache, Menü, Links, Library-Persistenz, Export →
(c) Bilder aus dem Vault / Ablage als Vault-Dateien nach Entscheidung → (d) Mermaid/KI.

## Codex-Findings

### F01 — Ursache des Bild-Werkzeug-Fehlers bestätigt, Semantik des Fixes noch nicht bewiesen
Schwere: hoch
datei:zeile: `app/src/main/index.ts:1281-1309,1311-1330`; `~/dev/mindgraph-excalidraw-plugin/node_modules/browser-fs-access/dist/file-open-002ab408.js:1`; `~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/dev/index.js:28535-28558,11036-11049`; `app/node_modules/electron/electron.d.ts:13026-13045,22487-22497`
Status: [OFFEN]
Der Befund ist für die beobachtete `getFile()`-Exception schlüssig: Bild und Bibliotheksimport rufen `fileOpen` auf; dessen File-System-Access-Pfad macht `showOpenFilePicker()` und danach `handle.getFile()`. Beide Electron-Handler verweigern `fileSystem`. Die Electron-40-Typen nennen `fileAccessType` und `isDirectory` **auch im Check-Handler**, aber jeweils optional. Laut Session-Vertrag prüfen die meisten Web-APIs zuerst und fragen erst bei negativem Check an. Ob Chromium beim konkreten Picker beide Details in beiden Aufrufen befüllt und ob ein `true` im Check den Request überspringt, ist durch Typen und CDP-Fehler allein nicht bewiesen. Ein Request-only-Fix ist daher ebenfalls unzureichend.
Vorschlag: An beiden Handlern für `fileSystem` nur bei `fileAccessType === 'readable' && isDirectory === false` erlauben; fehlende Felder fail-closed. Vor Freigabe den tatsächlichen Check-/Request-Ablauf und die Feldwerte für Bild und `.excalidrawlib` auf Electron 40 in Dev **und** Packaged auf macOS/Windows/Linux protokollieren; `showSaveFilePicker` und `showDirectoryPicker` als Negativproben. Falls ein Plattformpfad die Felder nicht liefert, stattdessen einen kontrollierten Main-Dialog verwenden, nicht die Bedingung aufweichen.

### F02 — „Vertrauenswürdige Renderer-URL“ ist für Dateizugriff zu weit
Schwere: hoch
datei:zeile: `app/src/main/index.ts:1265-1271,1281-1284,1311-1312,1490-1518,1560-1571`; `app/node_modules/electron/electron.d.ts:13033-13036,22463-22497`; `app/packages/plugin-api/src/rendererHost.ts:1-8`
Status: [OFFEN]
`isTrustedRendererUrl` akzeptiert **jede** `file://`-URL, nicht nur `out/renderer/index.html`; bei `localhost:5173` akzeptiert es jeden Pfad. Der Request prüft derzeit `webContents.getURL()`, der Check nur `requestingOrigin`; das beweist nicht, dass gerade der App-Top-Frame den Picker aufgerufen hat. Der Session-Handler gilt zudem für alle WebContents in `defaultSession`. Electron kennzeichnet `isMainFrame` bei `fileSystem` ausdrücklich immer als `false`; dieses Feld taugt hier nicht zur Einschränkung. Da externe Renderer-Plugins im gemeinsamen Realm laufen, ist dies bewusst keine Plugin-Isolation, wohl aber eine zusätzliche Dateilesemöglichkeit für jeden passenden Renderer-Aufrufer. „Der Nutzer wählt die Datei“ ist keine dauerhafte Scope-Grenze, solange File-System-Handles wiederverwendet werden können.
Vorschlag: Nur das konkrete `mainWindow.webContents` und den exakt geladenen App-Einstieg zulassen; beim Check zusätzlich `details.requestingUrl`/`requestingOrigin` gegen den tatsächlichen Frame-Kontext prüfen, soweit Electron diesen liefert. Andere `file://`-Fenster und fremde Subframes müssen negativ getestet werden. Falls die API den anfragenden Frame nicht zuverlässig identifiziert, den allgemeinen `fileSystem`-Grant für diesen Zweck verwerfen und einen Main-Dialog mit zurückgegebenen Bytes als Host-Funktion vorziehen.

### F03 — Globaler Drop-Handler verschluckt Finder-Drops bei sekundärem Lesen-Editor
Schwere: mittel
datei:zeile: `app/src/renderer/components/Editor/MarkdownEditor.tsx:3150-3182,3298-3304`; `app/src/renderer/App.tsx:1623-1644,1658-1682,307-319`
Status: [OFFEN]
Der Primär-Editor wird beim Plugin-Tab tatsächlich ersetzt; insofern ist die im Auftrag vermutete normale Split-Ansicht mit Notiz links und Plugin rechts **nicht** der aktuelle Aufbau. Aber ein sekundärer `MarkdownEditor` kann im rechten Text-Split weiter gemountet sein. Ist er im Lesen-Modus, stoppen seine `document`-Capture-Listener jeden Datei-/URI-Drop vor dem Plugin-Canvas, auch wenn `isInsidePreview(e.target)` falsch ist. `App.tsx` verhindert dagegen nur den Browser-Default und stoppt nicht die Weitergabe.
Vorschlag: `stopPropagation`/`stopImmediatePropagation` nur für Drops innerhalb des Preview-Editables anwenden; den globalen `preventDefault` für unversorgte Dateien beim App-Handler belassen. Plugin-Tab plus sekundären Lesen-Editor und einen echten Finder-Drop prüfen.

### F04 — `pending` und Base64 sind zwei verschiedene Entscheidungen
Schwere: mittel
datei:zeile: `~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:204-228`; `~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/dev/chunk-4FTI6OG3.js:15313-15319,17918-17940`; `~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/dev/index.js:28408-28450,28639-28665`
Status: [OFFEN]
Excalidraw erzeugt Bilder zunächst mit `status: 'pending'`. Das ist kein Nachweis, dass der Host zwingend externe Bilddateien schreiben muss: die lokale Serialisierung nimmt die zu Elementen gehörigen `files` samt `dataURL` in die `.excalidraw` auf. Der aktuelle Code lädt diese Daten auch wieder. Ein pauschales Setzen auf `saved` oder Auslagern der `dataURL` ohne Lade-/Export-Vertrag würde den Zustand eher beschädigen. Reale Kosten bleiben: JSON-Größe, wiederholte vollständige Writes/Backups und Sync-Volumen. Excalidraws Größenprüfung erfolgt **nach** einem best-effort Resize; `resizeImageFile`-Fehler werden gefangen.
Vorschlag: Zuerst Roundtrip und PNG/SVG-/Clipboard-Export mit Bild (auch nach Neustart) prüfen und Dateigrößen messen. Für das portable `.excalidraw`-Format Base64 vorerst behalten, dafür ein eigenes Größenlimit mit verständlichem Fehler festlegen. Externe Vault-Assets erst mit explizitem Speicherformat, Migrations-, Relink-, Lösch- und Sync-Vertrag planen; Statusänderung nur nach Test der Excalidraw-Semantik.

### F05 — Export-Vorschlag vermischt Vault-Ablage und „Speichern unter“
Schwere: mittel
datei:zeile: `~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:266-278,337-346`; `app/packages/plugin-api/src/rendererHost.ts:44-81`; `app/src/main/plugins/nativeServices.ts:191-220`; `app/src/main/plugins/host.ts:247-255`; `app/src/main/index.ts:777-785`; `app/index.html:6`
Status: [OFFEN]
`vault.writeBytes` kann nur Vault-relative Ziele bedienen; es ist kein OS-Speichern-Dialog. Die bestehende `dialog.openFile/saveFile`-Capability gehört zum **Main-Plugin-Host**, nicht zum `PluginRendererHost`. PNG lässt sich mit Excalidraw-Export erzeugen, aber Dateiname, Ziel, Überschreiben und atomarer/gesicherter Write brauchen getrennte UX. Das jetzige Inline-SVG exportiert bewusst mit `skipInliningFonts: true` und verlässt sich auf Host-CSS; als alleinstehende SVG-Datei wäre es nicht portabel. Ein reines Aktivieren der Excalidraw-Export-UI kann außerdem wieder die in der Font-Review gesperrten Worker-/Font-Pfade erreichen.
Vorschlag: Erst Exportfälle als Vertrag definieren: Zwischenablage, Datei außerhalb des Vaults, Vault-Anhang. Für OS-Speichern eine schmale Renderer-Host-Dialog-Funktion mit Bytes und Nutzerziel hinzufügen; Vault-Export über die Vault-Bridge mit geklärter Überschreib-/Backup-Semantik. PNG mit echten Fonts/Bildern und standalone SVG auf einem anderen Rechner prüfen; SVG erst freigeben, wenn Schriften eingebettet oder die Einschränkung im Produkt sichtbar ist.

### F06 — Library braucht Hydration und serialisierte Writes; Katalog-Rücksprung ist derzeit kein Link-Feature
Schwere: mittel
datei:zeile: `~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:135-206,262-279`; `~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/dev/index.js:25240-25252,9463-9471,10007-10020,11036-11049`; `app/src/main/index.ts:283-289,1520-1537`
Status: [OFFEN]
Nur `onLibraryChange` in eine Vault-Datei zu schreiben genügt nicht: Excalidraw hydratisiert Bibliotheksobjekte über `initialData.libraryItems`, während das Plugin nur die Zeichnung lädt. Schreibvorgänge und Import müssen außerdem geordnet sein, sonst kann ein älterer Snapshot einen neueren überschreiben. Der „Durchsuchen“-Knopf verwendet `target="_excalidraw_libraries"` und einen `referrer`/Rücksprung-Mechanismus; `setWindowOpenHandler` verweigert aber jedes Popup. Die Tabellenzeile „führt zu libraries.excalidraw.com“ suggeriert daher eine funktionierende Navigation, die der Host so nicht bereitstellt. Ein normaler externer Browser-Link bringt die Library nicht automatisch zurück.
Vorschlag: Lokale Library als erste Ausbaustufe: Datei laden, `initialData.libraryItems` setzen, Änderungen serialisiert schreiben, Import/Merge/Neustart testen. Online-Katalog höchstens als expliziten Systembrowser-Link anbieten; Installation/Rücksprung nur mit eigenem, geprüftem Importweg. Keine implizite Cloud-Abhängigkeit.

### F07 — Link-Handling benötigt Abbruch des Excalidraw-Defaults und Host-Navigation
Schwere: mittel
datei:zeile: `~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/dev/index.js:26917-26940`; `app/src/main/index.ts:1534-1537,1560-1571`; `app/packages/plugin-api/src/rendererHost.ts:53-81`; `app/src/main/preload.ts:564`
Status: [OFFEN]
Die Tabellenangabe „Klick öffnet Fenster/Browser“ stimmt für den Link-Icon-Pfad im aktuellen Host nicht zuverlässig: Excalidraw ruft ohne Callback `window.open`, das der Host pauschal verweigert. Auch mit `onLinkOpen` läuft der Default weiter, wenn der Callback das Event nicht `preventDefault()`-et. Der Renderer-Host kennt keine `openNote`/`openLink`-Funktion; ein Excalidraw-Link ist zudem kein sicherer Vault-Pfad.
Vorschlag: `onLinkOpen` immer abbrechen und danach nach strengem Schema routen: Vault-Wikilinks/relative Notizen über eine validierende Host-Navigation, `http(s)` nur nach expliziter Nutzeraktion über den bestehenden `open-external`-Pfad, sonst Fehlermeldung. Elementinterne Links und automatische Navigation gesondert testen.

### F08 — Vault-Bild-Einfügen ist mehr als `readBytes` plus `addFiles`
Schwere: mittel
datei:zeile: `app/packages/plugin-api/src/rendererHost.ts:44-81`; `~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:18-31,262-279`; `~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/dev/index.js:25893-25913,28408-28450`
Status: [OFFEN]
Der öffentliche Host besitzt `readBytes`, die aktuelle lokale Plugin-Typdeklaration aber nicht. `addFiles` aktualisiert nur den Dateispeicher des Editors und fügt **kein** Bildelement in die Szene ein. Ein Vault-Picker fehlt ebenfalls; ein freier Pfad aus dem Plugin darf nicht die Navigation/Validierung des Hosts ersetzen. Bei einer als Vault-Datei *verlinkten* Lösung kommen Pfadänderungen, fehlende Dateien und Import/Export-Kompatibilität hinzu.
Vorschlag: Zunächst eine Host-Dateiauswahl für Vault-Bilder plus `readBytes` nutzen und die Bytes über Excalidraws normalen Bild-Einfügepfad in die portable Zeichnung einbetten. Erst danach ein separates Referenzformat evaluieren. Plugin-Typdeklaration an die echte API angleichen; keine neue generische Dateisystem-Capability für diese Funktion.

### F09 — Mermaid, Web-Embeds und KI müssen getrennt bewertet werden
Schwere: mittel
datei:zeile: `~/dev/mindgraph-excalidraw-plugin/node_modules/@excalidraw/excalidraw/dist/dev/index.js:12518-12521,18350-18371,18858-18868,25537-25557,24780-24794`; `app/index.html:6`; `app/packages/plugin-api/src/rendererHost.ts:53-81`
Status: [OFFEN]
Die lokale Mermaid-Umwandlung ist in Excalidraw 0.18.1 bereits als UI-Pfad vorhanden und lädt `@excalidraw/mermaid-to-excalidraw` dynamisch. Sie gehört deshalb in die Funktionsprüfung der jetzigen Version, nicht pauschal in eine spätere KI-Phase; das Single-File-Bundle muss den Chunk tatsächlich enthalten. „Text to diagram“ braucht dagegen einen eigens bereitgestellten Generator, der Renderer-Host hat keine LLM-Capability. Web-Embeds sind nicht nur durch `frame-src` begrenzt: Excalidraw validiert Embeds und erstellt interaktive Frames. Eine pauschale CSP-Öffnung würde beliebige fremde Inhalte in den App-Kontext bringen.
Vorschlag: Mermaid lokal im aktuellen Bundle testen und bei Erfolg früh freigeben. Text-zu-Diagramm und Diagramm-zu-Code nur als spätere, bewusst freizugebende Host-LLM-Integration. Fremde Web-Embeds standardmäßig draußen lassen; falls später gewünscht, eigenes Sicherheitsdesign für URL-Allowlist, Frame-Sandbox, Netzwerk und Nutzereinwilligung.

### F10 — Reihenfolge sollte Datenverlust und Portabilität vor Komfort-Menüs stellen
Schwere: mittel
datei:zeile: `~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:62-108,122-129,214-229,266-279,337-346`; `app/src/main/index.ts:773-785`; `app/packages/plugin-api/src/rendererHost.ts:26-31`; `app/src/renderer/components/Editor/MarkdownEditor.tsx:3172-3182`
Status: [OFFEN]
Der vorgeschlagene Block (b) bündelt Sprache, Menüs, Links, Library und Export, obwohl sie verschiedene Host-Verträge und Fehlermodi haben. Vor neuen Features fehlen im Plan belastbare Roundtrips: Bild nach Neustart, Bild im Inline-Embed, Export mit Bild/Schrift, Library-Neustart, Save-Fehler/Tab-Schließen sowie paralleler Editor/Embed. Der SaveController verwirft beim Unmount einen noch debouncten Snapshot (`clearTimeout`, `dispose()`), und `drain()` bricht bei `disposed` ab. Ein schneller Tab-Wechsel nach einer Änderung kann damit die letzte Änderung verlieren; das ist für „vollen Umfang“ wichtiger als Menüeinträge.
Vorschlag: Reihenfolge: (1) reproduzierbarer Permission-Fix samt Sicherheits-/OS-Proben und Drop-Fix; (2) Save-/Roundtrip- und Embed-Vertrag absichern, insbesondere Flush beim Unmount und Fehlerbehandlung; (3) lokale Library plus Sprache, Link-Navigation und kleine Menüpunkte; (4) Export je Ziel mit Font-Gates; (5) Vault-Assets; (6) optionale lokale KI. Live-Zusammenarbeit, Cloud-Katalog-Installation ohne expliziten Import und beliebige Web-Embeds bewusst aus dem Kernumfang lassen.

## Claude-Antwort

Runde 1, Schritt 1 umgesetzt (Nutzerfreigabe 07.10.2026: „fang mit Schritt 1 an“, Weg-Entscheidung „Im Plugin“).

**F01 / F02 — [ADRESSIERT, anders als vorgeschlagen]** Gemessen in der Dev-App (Electron 41.10.7): Beim Lesen der
gewählten Datei ruft Chromium nur den **Prüf-Handler** auf, mit `fileAccessType=readable`, `isDirectory=false`, aber
**`webContents = null`** und ohne `requestingUrl` — ein Anfrage-Handler folgt nicht. Eine Freigabe „nur Hauptfenster“
ist dort also nicht prüfbar; übrig bliebe nur die Herkunft (`file://` in gepackten Builds = auch Schnellerfassung,
PDF-/Buch-Export). Genau der Fall, für den F02 „Bedingung nicht aufweichen“ rät. Deshalb keine Host-Freigabe: Die
App-Änderung ist zurückgenommen, die Rechte-Handler sind unverändert.
Stattdessen Plugin **0.2.1**: `build.mjs` Patch (7) setzt in `browser-fs-access/dist/index.mjs` die Erkennung
`"showOpenFilePicker" in self` auf falsch → Bibliothek nimmt den Altweg `<input type="file">`, der keine
Berechtigung braucht. Gate: exakter Count `legacyFilePicker: 1` plus Bundle-Assert „keine lebende
showOpenFilePicker-Erkennung“. Beleg: dev-signiertes 0.2.1 im Testprofil installiert, Bild-Knopf → OS-Dialog →
`testbild.png` → Element `image` 555×238, `files` mit `image/png` (237 KB dataURL) in der Datei, platziert und
auswählbar. Wirkt ebenso für „Bibliothek öffnen“ (gleicher `fileOpen`-Pfad; nicht separat geklickt).

**F03 — [ADRESSIERT]** `MarkdownEditor.tsx`: `isInsidePreview(e.target)` steht jetzt in `onDragOver` und `onDrop`
VOR `preventDefault`/`stopImmediatePropagation`. Drops außerhalb der eigenen Vorschau laufen weiter; der globale
Default-Killer in `App.tsx` verhindert Quick Look. Nicht geprüft: echter Finder-Drop mit Lesen-Editor im Split.

**F10 — [ADRESSIERT im Plugin 0.2.2, mit benannter Grenze]** (07.10.2026, Nutzerfreigabe „F10 angehen“)
- `SaveController.dispose()` → `close()`: keine neuen Snapshots, aber der laufende Drain schreibt alles
  Eingereihte zu Ende. Der Unmount reiht den noch im Debounce hängenden Stand sofort ein, statt den Timer zu
  verwerfen (`pendingSceneRef`).
- Neu gefundene Folgefalle: Tab zu und sofort wieder auf → der neue Editor las den alten Stand, während der
  alte noch schrieb, und hätte ihn beim nächsten Edit überschrieben. Gegenmittel: `closingWrites` pro Datei,
  der neue Editor wartet vor dem Lesen darauf.
- Gemessen in der Dev-App (CDP, Bild einfügen per paste): 0.2.1 Tab zu nach 150 ms → 0 von 1 Elementen in der
  Datei. 0.2.2 (finaler Build, Bytes gegen den Store verglichen): Tab zu nach 150 ms 2×/2 gesichert; zu + sofort
  wieder auf + weiter zeichnen 2×/2 beide Änderungen gesichert.
- **Grenze, gemessen:** Beim Abschalten/Aktualisieren des Plugins schließt der Host das Call-Gate, bevor er die
  Mounts abbaut (`app/src/main/index.ts` `tearDownRenderer` → `rendererRuntime.drain`). Ein Speichern aus
  `deactivate()` oder dem Unmount wird mit „Renderer-Instanz nicht aktiv“ abgelehnt — ein `deactivate`-Hook im
  Plugin ist daher wirkungslos und wurde wieder entfernt. Verlust höchstens der letzten 500 ms vor dem
  Abschalten; über die Einstellungen praktisch nicht erreichbar, nur bei einem Update im Hintergrund während des
  Zeichnens. Eine Lösung bräuchte eine Host-Phase „Editor speichern lassen“ vor dem Drain (ADR-Änderung,
  eigenes Review). Ebenso offen: App beenden innerhalb von 500 ms nach dem letzten Strich.

**Kleine Punkte — Plugin 0.3.0** (07.10.2026, Nutzerfreigabe „mach die kleinen Punkte“), alles in der Dev-App
getestet (dev-signiertes 0.3.0, Bundle-Bytes gegen den Store verglichen):
- **Sprache:** App spiegelt `language` nach `<html lang>` (`App.tsx`), Plugin liest es (`langCode`, MutationObserver).
  Geprüft: Einstellung de→en→de schaltet Werkzeugtitel live um. Excalidraw schreibt selbst `de-DE` in `<html lang>`
  — gleicher Code, kein Pingpong. „Command palette“/„Find on canvas“ sind in Excalidraws de-DE-Übersetzung leer.
- **Menü:** Befehlspalette, Suche, Hilfe ergänzt. Export bleibt aus (F05).
- **F06 Bibliothek — [ADRESSIERT, lokal]:** `.mindgraph/excalidraw-library.json` (JSON in `.mindgraph` wird
  synchronisiert), Format `.excalidrawlib`. Laden vor dem ersten Rendern über `initialData.libraryItems`,
  Schreiben über den serialisierten SaveController, mehrere offene Editoren per `updateLibrary` gleichgezogen.
  Unlesbare Datei → Hinweis im Editor, Datei bleibt byte-gleich (geprüft). Persistenz über Tab-Schließen und
  App-Neustart geprüft. „Bibliotheken durchsuchen“ ausgeblendet (window.open wird vom Host verweigert).
  Grenze: Eine per Sync geänderte Bibliothek wird erst übernommen, wenn kein Excalidraw-Editor offen ist.
- **F09 Mermaid — [ADRESSIERT]:** lokal im Bundle, Vorschau und Einfügen funktionieren (Formen landen in der
  Datei), keine CSP-Fehler. `aiEnabled={false}`: keine Server-KI-Einträge mehr. Web-Einbettung bleibt sichtbar,
  lädt aber nichts (CSP) — offen.
- **Neuer Befund (Sync):** `.excalidraw` steht nicht in `INCLUDE_EXTENSIONS` (`app/src/main/sync/fileTracker.ts`)
  → Zeichnungen wurden NICHT synchronisiert. **[ADRESSIERT]** (Nutzerfreigabe „beides machen“): `.excalidraw` in
  `INCLUDE_EXTENSIONS`, Test in `fileTracker.test.ts`; übergroße Dateien fängt `MAX_SYNC_FILE_SIZE` (64 MB) ab.
  Wirkt mit dem nächsten App-Release.

**F04, F05, F07, F08 — [OFFEN]** (Bilder als Base64/Größe, Export, Links, Vault-Bilder).

Nebenbefund: Das Plugin-Repo hat kein `tsconfig.json`; `npm run typecheck` gibt nur die tsc-Hilfe aus und hat nie
geprüft. Ebenso offen: `clipboard-read` wird vom Host verweigert → Excalidraws Kontextmenü „Einfügen“ vermutlich
wirkungslos (⌘V geht über das paste-Ereignis und funktioniert).

## Status

Runde 1: Schritt 1 released (App `5c8a742a`, Plugin v0.2.1). F10 released (Plugin v0.2.2). Kleine Punkte (Sprache, Menü, Bibliothek, Mermaid) als Plugin v0.3.0; `.excalidraw` im Sync (App, nächstes Release) (07.10.2026).
