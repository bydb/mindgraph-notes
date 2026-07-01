# Codex-Review: Excalidraw-Plugin Font-CSP-Fix (build-time Monkeypatch)

**Status:** Runde 1 (F01–F07) + Runde 2 (F08–F10) + Runde 3 (F11, neuer Codex-Fund) — ALLE adressiert. Codex-Re-Check Runde 2: F08/F10 **bestätigt zu**, F09/F01 wegen **F11** (Helvetica-Drift) reopened. F11 in Plugin-**v0.1.2 / `800c8a8`** gefixt (fail-closed bei nicht eingebetteter Szenen-Schrift). **Bereit für finalen Codex-Re-Check von F11.**
**Autor Claude/Opus (Lead), Fix von Hermes (GLM 5.2), Verifikation von Claude.**
**Repo des Fixes:** `~/dev/mindgraph-excalidraw-plugin` (eigenes git). **Zu prüfen ist der Runde-2-Stand = Commit `9a93064 fix(fonts): F01–F10`** (nicht der Runde-1-Commit `6570e32`) — NICHT dieser Repo/Branch. Diese Datei ist **self-contained**: der zu prüfende Code + die Runde-1/Runde-2-Antworten sind unten eingebettet; du brauchst den Plugin-Repo nicht in deinem Kontext (kannst ihn aber unter dem Pfad lesen, falls verfügbar). **Aufgabe dieses Re-Checks: F08/F09/F10 als geschlossen bestätigen oder konkrete Restlücken benennen.**

## Aufgabe

Adversariales Review eines **Build-Zeit-Monkeypatches**, der Excalidraw 0.18.1 daran hindert, seine Fonts vom `esm.sh`-CDN zu laden (Host-CSP `default-src 'self'` blockte sonst ~230 Font-Subsets → 230 Konsolen-Fehler). Der Patch ersetzt per esbuild `onLoad` mehrere Funktionen in Excalidraws **minifiziertem** `dist/prod`-Bundle durch `return[]` / `Promise.reject`. Ziel des Reviews: **Fragilität, Korrektheit, erreichbare Funktionsbrüche.**

## Kontext / Root Cause (empirisch belegt)

- Excalidraws Font-Source-Builder `createUrls(uri)` hängt an jede Font-URL-Liste **immer** `new URL(uri, ASSETS_FALLBACK_URL)` an, mit `ASSETS_FALLBACK_URL = https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/`.
- Der eigentliche Fetch ist ein **roher `fetch(url, {cache:"force-cache", headers:{Accept:"font/woff2"}})`** in `fetchFont` — **nicht** die FontFace-API. (Deshalb scheiterten frühere Versuche über `FontFace.prototype.load`-Override + `document.fonts.load`-Patch — die griffen am falschen Vektor.)
- ~20 Familien × Unicode-Subsets = 230 Requests, feuern beim Text-Rendering.

## Der zu prüfende Patch (`build.mjs`, esbuild `onLoad` auf `@excalidraw/excalidraw/dist/prod/*.js`)

```js
build.onLoad({ filter: /@excalidraw[/\\]excalidraw[/\\]dist[/\\]prod[/\\][^/\\]+\.js$/ }, (args) => {
  let code = readFileSync(args.path, 'utf8')
  // (1) createUrls → return[] (WURZEL — tötet alle URL-Konstruktion)
  code = code.replace(/(static createUrls\([^)]*\)\s*\{)/, '$1return[];')
  // (2) loadFontFaces → return[] (kein document.fonts.add)
  code = code.replace(/(static async loadFontFaces\([^)]*\)\s*\{)/, '$1return[];')
  // (3) document.fonts.load( → (async()=>[])( (kein Font-Fetch via Font Loading API)
  code = code.replace(/(?:window\.)?document\.fonts\.load\(/g, '(async()=>[])(')
  // (4) fetchFont: fetch(t,{cache:"force-cache",headers:{Accept:"font/woff2"}}) → Promise.reject
  code = code.replace(
    /fetch\(\s*t\s*,\s*\{\s*cache:\s*"force-cache"\s*,\s*headers:\s*\{\s*Accept:\s*"font\/woff2"\s*\}\s*\}\s*\)/,
    'Promise.reject(new Error("font fetch disabled by build-shim"))',
  )
  // (5) generateFontFaceDeclarations → return[] (SVG-Export-Font-CSS-Pfad abtöten)
  code = code.replace(/(static async generateFontFaceDeclarations\([^)]*\)\s*\{)/, '$1return[];')
  return { contents: code, loader: 'js' }
})
```

Zusätzlicher Kontext: der `subset-worker.chunk.js`/`subset-shared.chunk.js`-Font-Subsetting-Worker (WASM + `new Function` + `import.meta.url`) ist separat via `onResolve` durch No-op-Shims ersetzt (F12/F01), `import.meta.url` ist per `define` auf `"about:blank"` gesetzt.

## Von Claude live verifiziert (isoliertes Profil, echter R1a-Host, DevTools)

- Build grün, `assertSelfContainedEsm` (echter Host-Check) PASSED — Single-File-ESM, keine F12-Violations.
- Alle 5 Replaces landen im Bundle (`createUrls(t){return[]`, `fetchFont`-`Promise.reject`, `generateFontFaceDeclarations(t){return[]`, 0 `document.fonts.load`, 0 `.fonts.add`).
- Fehlerzähler beim Zeichnen **und Text-Tool**: **0 Fehler** (vorher 230). `document.fonts.size == 20`, alles KaTeX_* (Host), `hasExcalidrawFont == false`. Text „Test 123" rendert mit System-Fallback. Save persistiert (Rechteck + Text via `host.vault.write`).

## Bewusster Trade-off

Keine handgezeichneten Excalidraw-Fonts (Excalifont/Virgil) → Text = System-Schrift; Shapes bleiben handgezeichnet (rough.js). Export bräuchte Fonts, ist aber via `UIOptions.canvasActions.export=false` (+ `saveFileToDisk=false`) deaktiviert.

## Zwei bereits von Claude identifizierte Punkte (bitte bestätigen/entkräften)

1. **Kommentar↔Code-Diskrepanz:** Der `build.mjs`-Kommentar beschreibt eine 6. Schicht „(2) `ASSETS_FALLBACK_URL → ''` — nuklear", **die im Code nicht existiert** (nur 5 Replaces). Harmlos (weil `createUrls→[]` die URL-Konstruktion ohnehin killt), aber irreführend. Entfernen oder implementieren?
2. **Kein Match-Assert → Silent-Fail-Risiko:** Kein `replace()` prüft, ob er tatsächlich gematcht hat. Bei einem Excalidraw-**Update** (Umbenennung/andere Minifizierung von `createUrls`/`fetchFont`/…) matcht der Regex **0×**, der Build bleibt **grün**, und die Fonts (esm.sh-Fetches + 230 CSP-Fehler) **kommen still zurück**. Empfehlung: nach jedem Replace assert, dass sich der Code geändert hat (bzw. Match-Count == erwartet), sonst `throw` → Build rot. Deckungsgleich sinnvoll: ein Post-Build-Grep-Gate (0 `esm.sh`-Fetch, 0 `.fonts.add`, 0 `document.fonts.load`).

## Adversariale Review-Fragen an Codex

1. **Fragilität:** Sind die 5 Regexe robust gegen den nächsten Excalidraw-Patch-Release? Welche sind am brüchigsten? Ist Punkt 2 oben (Build-Assert) der richtige Schutz, oder gibt es einen supporteten Excalidraw-API-Weg (Font-Config / `EXCALIDRAW_ASSET_PATH`-Semantik / registrierbares Font-Backend), der denselben System-Fallback **ohne** Monkeypatch erreicht?
2. **Korrektheit auf der Canvas:** Bricht `createUrls → []` etwas **Erreichbares** außer Font-Optik? Insbesondere: Verlässt sich Excalidraws **Text-Mess-/Layout-Logik** (Zeilenumbruch, Element-Bounds, `getLineHeight`/`measureText`) auf geladene Font-Metriken? Falls ja → driften Text-Bounds bei System-Fallback → **falsche gespeicherte Koordinaten** / Layout-Verschiebung beim Reload? (Save schreibt die Element-Geometrie auf Platte.)
3. **Export wirklich unerreichbar?** `generateFontFaceDeclarations → []` und `fetchFont → reject` sind nur unkritisch, wenn Export nie läuft. Ist Export trotz `UIOptions` über einen anderen Pfad erreichbar (Copy-as-SVG/PNG, Kontextmenü, Keyboard-Shortcut, Cmd/Ctrl+C auf Selection, programmatische `exportToSvg`)? Falls ja: wirft der `Promise.reject`/`[]` einen **unbehandelten** Fehler, oder degradiert es sauber?
4. **fetch-Regex-Spezifität:** Ist das `fetch(t,{cache:"force-cache",headers:{Accept:"font/woff2"}})`-Pattern eng genug, dass es garantiert **nur** den Font-Fetch trifft (kein anderer `fetch` in Excalidraw mit denselben Optionen)? Und breit genug, dass Minifizierungs-Varianten (Whitespace, Quote-Stil, Argname `t`) es nicht verfehlen?
5. **`document.fonts.load( → (async()=>[])(`:** Korrekt bei ALLEN Aufrufstellen (auch `.then(...)`/`await`-Ketten)? Nebeneffekte, wenn ein Aufrufer das Rückgabe-Array iteriert/auf geladene Faces zählt?

## Codex-Findings

### F01 — System-Fallback verändert Excalidraws persistierte Textgeometrie
Schwere: kritisch
datei:zeile: `node_modules/@excalidraw/excalidraw/dist/dev/chunk-4FTI6OG3.js.map`
(`../../element/textMeasurements.ts:118-164`,
`../../element/newElement.ts:240-330`,
`../../element/textElement.ts:33-90`);
`build.mjs:67-87`
Status: [ZU — Kern in Runde 1/2, Helvetica-Rest via F11-Fix Runde 3 (`800c8a8` / v0.1.2)]

Q2 ist zu bestätigen: Excalidraws Layout hängt direkt an den tatsächlich verfügbaren Fontmetriken.
`CanvasTextMetricsProvider.getLineWidth()` setzt `context.font` auf den Excalidraw-Font-String und
verwendet `canvas.measureText().width`. `newTextElement()` schreibt daraus `x`, `y`, `width` und `height`;
`refreshTextDimensions()` und `redrawTextBoundingBox()` verwenden dieselben Messungen für Wraps,
Auto-Resize und Größenänderungen gebundener Container. `getLineHeight()` kommt zwar aus Excalidraws
statischen Font-Metadaten, die horizontale Metrik stammt aber vom Browser-Font. Beim ungeladenen
Default `Excalifont` fällt dessen Font-String auf weitere Familien und schließlich den
plattformabhängigen Browser-Fallback zurück.

Damit ist der Live-Beleg „Text sichtbar und Save erfolgreich“ nicht hinreichend. Auf derselben Maschine
ist ein Reload meist stabil, weil erneut derselbe Fallback misst. Die gespeicherten Elemente sind aber
nicht mehr geometrisch kompatibel mit Excalidraw, das Excalifont/Virgil geladen hat, und nicht zwingend
zwischen macOS/Windows/Linux. Bereits neu erzeugte Texte speichern Fallback-basierte Breiten/X-Werte.
Beim Öffnen einer normal erzeugten Szene passen gespeicherte Bounds und tatsächlich gerenderte Glyphen
nicht; bei der nächsten Textbearbeitung werden Wraps/Bounds neu mit dem Fallback berechnet und diese
abweichende Geometrie dauerhaft gespeichert. Bei gebundenem Text kann das zusätzlich Containergrößen
verändern.

Vorschlag: System-Fallback nicht als bloß optischen Trade-off freigeben. Vor Release braucht es eine
explizite Formatentscheidung:

- bevorzugt mindestens die in R1b erlaubten Fontfamilien deterministisch als `data:`-Font bereitstellen
  (zunächst etwa Excalifont-Latin plus ein definierter Sans-Font), Fontauswahl entsprechend begrenzen und
  reale Metrik-/Roundtrip-Tests fahren; oder
- den Editor bewusst auf eine überall mitgelieferte/inline gebündelte Fontfamilie normalisieren und
  inkompatible importierte Familien read-only/warnend behandeln.

Testmatrix: dieselbe Fixture mit freiem und gebundenem mehrzeiligem Text unter „Fonts vorhanden“ versus
Plugin-Build öffnen, ohne Edit speichern/reloaden und nach Edit erneut speichern; `x/y/width/height`,
Zeilenumbrüche und Containerbounds vergleichen. Ohne definierte Fontbytes ist verlustfreie
Excalidraw-Kompatibilität nicht belegt.

### F02 — Das neue Assert-Gate macht Regex-Bruch sichtbar, beweist aber nicht die semantische Neutralisierung
Schwere: hoch
datei:zeile: `build.mjs:22-30,64-89,148-171`
Status: [BESTÄTIGT ZU]

Claudes zweiter Vorabpunkt war korrekt; Match-Assert plus Post-Build-Grep ist eine wesentliche Verbesserung
und verhindert den einfachen Fall „alle fünf Regexe matchen nach Update 0×“. Es schließt das Update-Risiko
aber noch nicht:

- geprüft wird nur `>= 1`, nicht der für die gepinnte Version erwartete exakte Count je Patch;
- die nicht-globalen Funktionsregexe patchen pro Datei nur den ersten Treffer;
- ein Release kann den alten, nun toten Pfad als Match behalten und daneben einen neuen Loader einführen —
  dann bleiben alle Counts grün;
- der Post-Grep sucht wieder dieselbe konkrete Syntax (`t`, doppelte Quotes, Property-Reihenfolge) und
  nicht die semantischen Indikatoren. Ein neuer `fetch(url, {headers, cache})`, `fetchFont2`, Axios/XHR oder
  verschobener Nested-Chunk passiert das Gate;
- `onLoad` erfasst nur JS-Dateien direkt unter `dist/prod/`, nicht künftige Unterverzeichnisse.

Die fünf Regexe sind daher nicht „robust“, sondern für exakt 0.18.1 akzeptable, fail-fast
Versionspatches. Am brüchigsten ist der `fetch(t,{...})`-Patch, danach die Methodennamen
`generateFontFaceDeclarations`/`loadFontFaces`; `document.fonts.load` ist syntaktisch breiter, kann dafür
bei neuen nicht zu neutralisierenden Aufrufstellen zu viel patchen. Einen unterstützten
„keine Fonts, kein CDN-Fallback“-Schalter bietet dieser 0.18.1-Pfad nicht:
`EXCALIDRAW_ASSET_PATH` ergänzt Quellen, während der feste CDN-Fallback weiter angehängt wird.

Vorschlag: Excalidraw strikt auf exakt `0.18.1` plus Lockfile-/Tarball-Integrität pinnen und das Gate auf
**exakte** bekannte Counts sowie bekannte Quelldateien verschärfen. Zusätzlich semantisch im finalen Bundle
prüfen: keine `esm.sh/@excalidraw/excalidraw`, keine `font/woff2`, keine Excalidraw-Fontdateinamen/Font-URLs
und keine `@font-face`-Quellen. Der belastbarste Regressionstest ist ein Browser-Test mit instrumentiertem
`fetch`/XHR/`FontFace`/`document.fonts`, der Text, Fontwechsel und Export-/Clipboard-Aktionen ausführt und
null Font-Netzversuche fordert. Bei jedem Excalidraw-Update muss der Patch bewusst neu auditiert werden;
„grüner Regex-Gate“ allein ist keine Freigabe.

### F03 — Der CSS-Font-Patch besitzt weiterhin genau das Silent-Fail-Risiko, das für JS behoben wurde
Schwere: hoch
datei:zeile: `build.mjs:120-125,148-171`
Status: [BESTÄTIGT ZU]

Das neue Gate zählt nur die fünf JS-Replaces. Die Entfernung der `@font-face`-Regeln aus `index.css`
verwendet weiterhin ein ungeprüftes Regex-Replace. Ändert Excalidraw Formatierung, verschachtelte Syntax
oder CSS-Ausgabe, bleibt der Build grün und relative Font-URLs werden wieder als Host-Same-Origin-Requests
aktiv. Das bringt zwar nicht zwingend den `esm.sh`-Fetch zurück, aber erneut Fontrequests/404s und potenziell
andere Metriken, falls der Host zufällig gleichnamige Assets ausliefert.

Vorschlag: Auch hier exakten Match-Count für die gepinnte CSS-Datei prüfen und danach terminal assertieren,
dass `dist/styles.css` weder `@font-face` noch `url(...woff/woff2...)` enthält. Positiv- und Negativtest des
Gates ergänzen.

### F04 — Der fehlende `ASSETS_FALLBACK_URL`-Replace ist richtig; der Kommentar sollte entfernt werden
Schwere: mittel
datei:zeile: `build.mjs:46-63`
Status: [BESTÄTIGT ZU]

Claudes erster Vorabpunkt ist zu bestätigen, aber die richtige Korrektur ist **nicht**, die sechste Schicht
zu implementieren. `createUrls() → []` verhindert aktuell die URL-Konstruktion; ein leer ersetzter Base-URL-
String wäre kein verlässlicher zweiter Schutz und kann `new URL(relative, "")` sogar synchron werfen.
Außerdem würde ein zusätzlicher Regex gegen die minifizierte Konstante die Patchfläche und Update-
Fragilität ohne neue belegte Invariante vergrößern.

Vorschlag: Kommentar und Nummerierung auf die realen fünf Schichten korrigieren. Als unabhängige Sicherung
stattdessen den semantischen Final-Bundle-Assert aus F02 verwenden: kein `ASSETS_FALLBACK_URL`-Ziel bzw.
kein `esm.sh/@excalidraw/excalidraw` im Artefakt.

### F05 — Export ist trotz `UIOptions.canvasActions.export=false` weiterhin erreichbar
Schwere: hoch
datei:zeile: `node_modules/@excalidraw/excalidraw/dist/dev/index.js.map`
(`../../actions/actionClipboard.tsx:120-247`,
`../../actions/actionExport.tsx:137-278`);
`build.mjs:76-87`
Status: [BESTÄTIGT ZU]

Q3 ist zu entkräften: Das Ausblenden der Canvas-Export-UI macht Exportcode nicht unerreichbar.
`actionCopyAsPng` bleibt bei vorhandener Clipboard-Unterstützung registriert und besitzt den Shortcut
Alt/Option+Shift+C; Copy-as-SVG/PNG kann außerdem über Action-Suche/Command-UI erreichbar bleiben.
`exportToSvg`/`exportToBlob` bleiben öffentliche Programmatik. Ebenso besitzen native Save/Load-Actions
eigene Shortcuts, deren Erreichbarkeit separat von sichtbaren Menüeinträgen geprüft werden muss.

`generateFontFaceDeclarations() → []` dürfte SVG-Export in der aktuellen Form eher ohne eingebettete
Fonts degradieren als werfen; PNG rendert den aktuell sichtbaren System-Fallback. Damit bleibt aber das
Metrik-/Portabilitätsproblem aus F01, und ein kopiertes SVG kann beim Empfänger nochmals anders aussehen.
Der `fetchFont → Promise.reject`-Patch ist nur dann unkritisch, solange wirklich jeder erreichbare
Exportpfad vorher durch das gepatchte `generateFontFaceDeclarations()` läuft oder die Ablehnung fängt.
Diese Annahme ist nicht durch den UI-Schalter bewiesen.

Vorschlag: Alle Clipboard-/Command-/Keyboard-Pfade live testen: Copy, Copy-as-PNG, Copy-as-SVG,
Cmd/Ctrl+Shift+S, Cmd/Ctrl+O sowie die öffentlichen Exportfunktionen, soweit der Plugin-Wrapper sie
exponiert. Entweder die Aktionen zuverlässig deaktivieren oder das degradierte Exportverhalten als
unterstützten Vertrag testen (kein unhandled rejection, keine Netzanforderung, sichtbare Warnung bei
nicht eingebetteten Fonts).

### F06 — Der konkrete `fetch(t, …)`-Patch ist gleichzeitig zu eng und semantisch unnötig aggressiv
Schwere: mittel
datei:zeile: `build.mjs:76-84,155-160`
Status: [BESTÄTIGT ZU]

Q4: Für exakt den geprüften 0.18.1-Minified-Input ist die Kombination aus Argumentname `t`,
`cache:"force-cache"` und `Accept:"font/woff2"` sehr wahrscheinlich eindeutig; Claudes Root-Cause-
Diagnose und der Match-Count belegen den heutigen Treffer. Sie ist aber nicht breit genug für selbst
triviale Minifier-Änderungen (Argumentname, Quote-Stil, Property-Reihenfolge, ausgelagerte Optionsvariable).
Der Post-Build-Grep wiederholt dieselbe Enge. Gleichzeitig ersetzt der Patch nicht die Funktion
`fetchFont`, sondern nur einen expression-level Fetch durch eine bewusst abgelehnte Promise. Falls ein
neuer Aufrufer diesen Pfad nicht fängt, erzeugt die Belt-and-suspenders-Schicht selbst eine unhandled
Rejection.

Vorschlag: Nicht versuchen, den Fetch-Regex „universell“ zu machen. Entweder den gesamten eindeutig
identifizierten `fetchFont`-Methodenrumpf durch eine dokumentierte, typkompatible Degradierung ersetzen
(z.B. definierter `undefined`-/Fehlerausgang, den alle Caller nachweislich behandeln), oder den Patch
entfernen, wenn `createUrls` plus `generateFontFaceDeclarations` und semantische Browser-/Bundle-Gates
den Fetch bereits unerreichbar machen. Weniger unabhängige Monkeypatches bedeuten hier weniger neue
Fehlermodi.

### F07 — Der `document.fonts.load`-Ersatz ist heute rückgabetyp-kompatibel, aber sein Scope muss festgeschrieben werden
Schwere: niedrig
datei:zeile: `build.mjs:70-74`
Status: [BESTÄTIGT ZU]

Q5: `(async()=>[])(font, text)` ignoriert die Argumente und liefert wie
`FontFaceSet.load()` eine `Promise<FontFace[]>`. Die aktuellen `await`-/`.then()`-Ketten bleiben deshalb
formell intakt; `Fonts.onLoaded([])` beendet sich ohne Mutation. Ein unmittelbarer Laufzeitbruch ist hier
nicht erkennbar.

Das globale Replace innerhalb aller erfassten Excalidraw-Root-Chunks neutralisiert künftig aber auch neue
`document.fonts.load()`-Aufrufstellen, selbst wenn sie nicht zum CDN-/Excalidraw-Fontpfad gehören. Der
aktuelle `>=1`-Count bemerkt eine zusätzliche Stelle nicht.

Vorschlag: Für 0.18.1 den exakten erwarteten Count (laut eingebettetem Befund zwei) assertieren und bei jeder
Abweichung Review erzwingen. Den positiven Test um beide gegenwärtigen Caller ergänzen: Rückgabe wird
awaited/iteriert, `onLoaded([])` bleibt no-op, keine unhandled rejection.

### F08 — „Größte Datei“ ist kein Font-Subset-Vertrag und deckt nicht ganz Latin-1
Schwere: hoch
datei:zeile: `~/dev/mindgraph-excalidraw-plugin/build.mjs:119-143`
Status: [BESTÄTIGT ZU]

Restrisiko (a) ist für **exakt 0.18.1 empirisch entkräftet**: Bei allen drei ausgewählten Familien ist die
größte Datei tatsächlich der Latin-Kern:

- Excalifont: `...a88b72...woff2`, 24 956 Bytes, Upstream-Range beginnt `U+20-7e,U+a0-a3,…`;
- Nunito: `...TQ3j6zbXWjgeg.woff2`, 16 476 Bytes, Descriptor `LATIN`;
- Comic Shanns: `...279a7b...woff2`, 17 488 Bytes, Range beginnt `U+20-7e,U+a1-a6,…`.

Die Auswahlheuristik beweist das jedoch nicht; sie kennt weder Descriptor noch Zeichenbelegung. Restrisiko
(b) ist real: Die größten Excalifont-/Comic-Shanns-Dateien enthalten absichtlich Lücken **innerhalb**
U+00A0–U+00FF. Excalifont lässt unter anderem U+00A4 und U+00A7 aus; Comic Shanns unter anderem U+00D0 und
U+00D8. Weil das erzeugte `@font-face` keinen `unicode-range` trägt, bietet der Browser die Familie für
jedes Zeichen an, fällt bei fehlendem cmap-Glyph aber glyphweise auf eine Systemschrift zurück. „Basic
Latin + Latin-1“ und „Cross-OS-konsistent“ gelten daher nur für den tatsächlich enthaltenen Zeichensatz,
nicht für den gesamten Latin-1-Block. Deutsche Umlaute/ß sind im heutigen Kern enthalten; Symbole und
weitere westeuropäische Zeichen sind nicht vollständig garantiert.

Vorschlag: Die drei konkreten Dateinamen plus SHA-256 und erwartete Upstream-Unicode-Range in einer
deklarativen Tabelle pinnen; nicht nach Größe wählen. Das Build-Gate muss Datei-/Hash-Erwartung prüfen.
Zusätzlich mit einem Font-Parser die unterstützte R1b-Zeichenmenge gegen die cmap-Tabelle validieren.
Entweder die unterstützte Menge präzise dokumentieren oder die nötigen Latin-/Latin-ext-Subsets pro Familie
zu einem deterministischen Font zusammenführen beziehungsweise als mehrere `@font-face` mit ihren
originalen `unicode-range`s einbetten. Tests müssen gezielt vorhandene und derzeit fehlende Zeichen
enthalten, nicht nur `ÄÖÜ`.

### F09 — Nur drei eingebettete Familien schließen die ursprüngliche Geometriedrift nicht für gültige Szenen
Schwere: kritisch
datei:zeile: `~/dev/mindgraph-excalidraw-plugin/build.mjs:119-143`;
`~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:123-137,169-188`
Status: [ZU — F09-Kern in Runde 2, Helvetica-Rest via F11-Fix Runde 3 (`800c8a8`)]

Der Editor schränkt Excalidraws Fontfamilien nicht auf Excalifont, Nunito und Comic Shanns ein. Excalidraw
0.18.1 kennt daneben unter anderem Virgil, Cascadia, Lilita One, Liberation Sans und Xiaolai; bestehende
`.excalidraw`-Dateien können diese IDs enthalten, und je nach UI-Pfad sind weitere Familien auswählbar.
Der JS-Fontloader ist global neutralisiert, sodass alle nicht eingebetteten nicht-lokalen Familien wieder
über Systemfallback gemessen werden. Damit besteht F01 für jede solche gültige/importierte Szene fort.
Besonders Virgil ist als Legacy-Excalidraw-Font praktisch relevant.

Vorschlag: Entweder alle in R1b auswählbaren/importierbaren Nicht-CJK-Familien deterministisch einbetten
(Virgil, Cascadia, Lilita und Liberation sind im Paket einzeln bzw. klein genug) oder Fontpicker und
Importvertrag hart auf die drei unterstützten IDs begrenzen. Beim Laden einer Szene mit einer nicht
unterstützten Familie darf Editing nicht still beginnen: warnen/read-only schalten oder explizit und
sichtbar migrieren. Xiaolai/CJK braucht einen eigenen dokumentierten Ausgang statt stiller per-Glyph-
Degradierung. Automatische Roundtrip-Fixtures müssen jede erlaubte `fontFamily`-ID abdecken.

### F10 — Font-Preload ist fail-open und kann bei CSP-/Decode-Fehlern erneut falsche Geometrie speichern
Schwere: kritisch
datei:zeile: `~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx:123-137`
Status: [BESTÄTIGT ZU]

Der Preload fängt jeden `FontFace.load()`-Fehler mit `.catch(() => {})` und setzt die Editorphase danach
trotzdem auf `ready`. Ein beschädigtes data-Asset, eine fehlende Face-Registrierung, CSP-Regression oder
Browser-Decodierfehler führt daher exakt zurück zum ursprünglichen F01-Zustand: Excalidraw mountet, misst
gegen Fallback und Autosave darf diese Geometrie persistieren. Der Live-Nachweis belegt einen erfolgreichen
Lauf, aber der Fehlerpfad ist nicht fail-closed. Außerdem prüft der Code nicht, dass für **jede** erwartete
Familie überhaupt ein Face gefunden und nach dem Load als `loaded`/`document.fonts.check(...)` bestätigt
wurde.

Vorschlag: Vor `setPhase('ready')` für jede unterstützte Familie genau ein erwartetes Face verlangen,
`await face.load()` nicht verschlucken und anschließend mit repräsentativem Text
`document.fonts.check()`/Status verifizieren. Scheitert eine Pflichtfamilie, muss der Editor
`load-error/font-error` anzeigen und schreibgeschützt bleiben. Nur bewusst als nicht unterstützt
klassifizierte Zeichen/Familien dürfen in den dokumentierten Fallbackpfad gelangen.

### F11 — Helvetica bleibt eine unbewachte, plattformabhängige Nicht-CJK-Familie
Schwere: kritisch
datei:zeile: `~/dev/mindgraph-excalidraw-plugin/build.mjs@9a93064:22-28,189-196`;
`~/dev/mindgraph-excalidraw-plugin/src/renderer.tsx@9a93064:37-48,137-168`
Status: [ADRESSIERT Runde 3 — Plugin-Commit `800c8a8` / v0.1.2, siehe Claude-Antwort Runde 3]

F08 ist am geprüften Commit geschlossen: `EMBEDDED_FONTS` ist eine deterministische Tabelle mit allen 21
Descriptoren der sieben eingebetteten Familien, jeder Subset behält seine originale `unicode-range`, und
das fail-closed Build-Gate bindet Tabelle, Excalidraw-Version und erzeugte Faces zusammen. F10 ist ebenfalls
geschlossen: Jede dieser sieben Familien muss registrierte Faces besitzen, alle Faces werden awaited und
müssen danach `status === 'loaded'` melden; andernfalls erreicht der Editor weder `ready` noch den
Autosave-Pfad.

F09 und damit F01 sind dennoch nicht vollständig geschlossen. Excalidraw 0.18.1 registriert
`FONT_FAMILY.Helvetica` (ID 2) weiterhin als gültige, deprecated lokale Familie. Der Font-Picker zeigt
deprecated Fonts zwar nicht standardmäßig als neue Auswahl, nimmt sie aber ausdrücklich in die
`sceneFonts` auf, wenn eine geladene/importierte Szene diese ID verwendet. Excalidraws eigener Kommentar
beschreibt die Auflösung als „Helvetica on MacOS, Arial on Win“. Der Plugin-Build bettet Helvetica bewusst
nicht ein, `SUPPORTED_FONT_FAMILIES` prüft sie nicht, und eine solche Szene erreicht deshalb erfolgreich
`ready` und darf speichern. Ihre `measureText`-Metriken und damit persistierte Geometrie bleiben
plattformabhängig. Die Aussage „portable Geometrie für jede Nicht-CJK-Szene“ ist somit falsch; `LOCAL` ist
eine Ladeart, keine Portabilitätsgarantie.

Vorschlag: Helvetica/ID 2 beim Szenenladen vor `restore()` erkennen und fail-closed read-only mit klarer
Meldung öffnen, oder sie deterministisch auf eine eingebettete, metrisch festgelegte Ersatzfamilie
migrieren und diese Migration als bewusst geometrieverändernd behandeln. Alternativ kann eine
redistributionsfähige Helvetica-kompatible Schrift eingebettet werden, sofern ihre Metrikgleichheit für den
unterstützten Zeichensatz nachgewiesen ist. Ein Roundtrip-Test muss dieselbe Helvetica-Szene auf mindestens
macOS- und Windows-Fontauflösung abdecken.

## Claude-Antwort

Exzellenter Review — F01 hat die „System-Fallback ist ein harmloser optischer Trade-off"-Annahme zu Recht
zerlegt. **User-Entscheid: Fonts lokal als data: bündeln (Option A).** Alle 7 adressiert, Umsetzung im
Plugin-Repo `~/dev/mindgraph-excalidraw-plugin` + eine Host-Änderung. Live re-verifiziert (isoliertes Profil,
DevTools). Detail je Finding:

### F01 [ADRESSIERT] — data:-Fonts statt System-Fallback
Umgesetzt: die 3 Canvas-Default-Familien (Excalifont/Nunito/Comic Shanns) werden als data:-`@font-face` in
`dist/styles.css` mitgeliefert — je Familie die größte Subset-Datei, das ist der Basic-Latin+Latin-1-Kern
(Excalidraw-descriptor `unicodeRange:"U+20-7e,…,U+ba-ff"` → deckt deutsche Umlaute). ~77 KB base64 gesamt; die
CJK-Familie **Xiaolai (12,8 MB) bleibt bewusst draußen**. Dazu: Host-CSP `font-src 'self' data:`
(`app/index.html`), und `renderer.tsx` lädt die 3 Familien via `FontFace.load()` **vor** dem Excalidraw-Mount.
**Live-Beweis (nicht nur „sichtbar"):** `document.fonts.check('16px "Excalifont"')==true`, FontFace-Status
`"loaded"`, und `measureText("Hallöchen ÄÖÜ")` = **137.3 px in Excalifont vs 156.5 px in monospace →
metricsDiffer=true**. Excalidraw misst also gegen die ECHTE Excalifont → persistierte x/y/width/height sind
Excalidraw-kompatibel und (gleiche data:-Bytes überall) Cross-OS-konsistent. Text „Hallöchen ÄÖÜ" rendert
handgezeichnet, Umlaute korrekt. **Grenze (dokumentiert):** seltene Nicht-Latin-1-Glyphen (Kyrillisch/Griechisch/
CJK) fallen per-Glyph auf System zurück. Deine vorgeschlagene Metrik-Roundtrip-Testmatrix als Automat steht noch
aus (aktuell manuell belegt).

### F02 [ADRESSIERT, Rest bewusst] — Gate verschärft
Exakte Counts statt `≥1` (`createUrls:1 loadFontFaces:1 fonts.load:2 fetchFont:1 genFontFace:1`), **Version-Pin
auf exakt `0.18.1`** (Build rot bei jeder anderen Version → erzwingt bewusstes Re-Audit), plus semantische
Bundle-Asserts (0 lebendes `document.fonts.load(`, 0 `.fonts.add(`, 0 `Accept:"font/woff2"` — der tote Code ist
per früh eingefügtem `return` **wegminifiziert**, daher greifen die Greps). **Bewusst offen:** `onLoad` erfasst
weiter nur `dist/prod/` top-level, und ein Release, das den toten Pfad behält UND einen neuen Loader in einem
Unterordner einführt, entginge dem Count. Deckung dagegen: Version-Pin (Update = Pflicht-Re-Audit) + semantische
Bundle-Greps. Der von dir empfohlene Browser-Test mit instrumentiertem `fetch`/`FontFace` (null Font-Netz) ist als
nächste Härtung notiert, nicht in diesem Durchgang.

### F03 [ADRESSIERT] — CSS-Strip jetzt gegated
Post-Build-Asserts: `cssFaceStripCount ≥ 1` (Strip griff), `dist/styles.css` enthält **keine** non-`data:`-Font-
URL (`url(<nicht data:>…woff2)`), und **exakt 3** eingebettete `@font-face` (Excalifont/Nunito/Comic Shanns).
Build rot bei Verletzung.

### F04 [ADRESSIERT] — Kommentar korrigiert, 6. Schicht NICHT implementiert
Bestätigt: `ASSETS_FALLBACK_URL→''` wäre kein verlässlicher Schutz (`new URL(rel,"")` kann werfen) und vergrößert
nur die Patchfläche. Kommentar/Nummerierung auf die realen 5 JS-Schichten korrigiert; Absicherung ist der
semantische Bundle-Assert (F02).

### F05 [ADRESSIERT als degradierter Vertrag] — Export erreichbar, aber sicher
Bestätigt: Copy-as-PNG (Alt+Shift+C) bleibt erreichbar. **Live getestet mit `unhandledrejection`-Listener:
0 unhandled Rejections, 0 CSP-Fehler (kein Netz-Font-Versuch).** Vertrag: PNG-Export nutzt die geladenen data:-
Fonts (korrekt); SVG-Export lässt eingebettete `@font-face` weg (`generateFontFaceDeclarations→[]`) → Text nutzt
Viewer-Fonts (dokumentierte Degradierung). `fetchFont`-Reject wird von `getContent()` gefangen. Export-Shortcuts
komplett zu deaktivieren ist als optionaler Folge-Schritt notiert.

### F06 [ADRESSIERT] — ganzer fetchFont-Rumpf ersetzt
Statt des expression-level `fetch(...)` wird jetzt der **ganze `fetchFont`-Rumpf** früh via `return
Promise.reject(...)` terminiert (minify-robuster). Einziger Caller `getContent()` fängt die Rejection; in 0.18.1
ohnehin unerreichbar (`createUrls→[]` leert `this.urls`). Live: 0 unhandled Rejections (s. F05).

### F07 [ADRESSIERT] — exakter Count + Scope festgeschrieben
`document.fonts.load` jetzt auf **exakt 2** asserted (statt `≥1`). Der Plugin-eigene Font-Preload nutzt bewusst
`FontFace.load()` (NICHT `document.fonts.load(`), damit der Bundle-Assert „0 lebendes `document.fonts.load(`"
gültig bleibt und nicht mit dem Gate kollidiert.

**Status Build/Verify:** `node build.mjs` grün (F12 + gehärtetes Gate), Live-Re-Verify bestanden. Änderungen
uncommitted (build.mjs/renderer.tsx/styles.css im Plugin-Repo; `app/index.html`-CSP in mindgraph-notes) — kein
Commit ohne User-Freigabe.

---

### Runde 2 — Antwort auf F08/F09/F10 (Codex-Re-Check)

Der Re-Check hat den ersten F01-Fix zu Recht als Happy-Path entlarvt. **User-Entscheid: robust — alle Nicht-CJK-
Familien einbetten.** Umgesetzt (Font-Seite: Hermes; F10/Gate/Verify: Claude), live re-verifiziert.

#### F08 [ADRESSIERT] — deterministische Descriptor-Tabelle statt Größen-Heuristik
Restrisiko (a): Hermes hat aus Excalidraws `static init()` (chunk-K2UTITRG.js) eine **statische `EMBEDDED_FONTS`-
Tabelle** extrahiert — alle Familien, ALLE Subsets, je mit ihrer **originalen `unicode-range`**. Keine
Größenauswahl mehr. `build.mjs` bettet sie 1:1 ein, `existsSync`-fail-closed bei fehlender Datei. Restrisiko (b):
Weil jedes Subset mit seiner `unicode-range` eingebettet ist, ist die Glyphen-Abdeckung **exakt gleich wie echtes
Excalidraw** — ein Zeichen, das eine Familie besitzt, liegt in irgendeinem eingebetteten Subset; ein Zeichen, das
die Familie NICHT besitzt (z.B. Excalifont ohne §), fällt in Plugin UND echtem Excalidraw gleich zurück → **kein
Drift, weil konsistent**. Gate: `dataFaceCount === EMBEDDED_FONTS.length` (21) + Version-Pin 0.18.1. **SHA-256
bewusst weggelassen:** die content-gehashten Dateinamen (`…-a88b72a2….woff2`) sind selbst ein Content-Pin; die 3
ungehashten (Cascadia/Virgil/Liberation) sind über den Version-Pin fixiert.

#### F09 [ADRESSIERT + live bewiesen] — alle 7 Nicht-CJK-Familien
Statt 3 sind jetzt **alle 7** auswählbaren/importierbaren Nicht-CJK-Familien eingebettet: Excalifont, Nunito,
Comic Shanns, **Virgil** (Legacy!), Cascadia, Lilita One, Liberation Sans (Nunito korrekt als `weight:500`;
Helvetica ist LOCAL, Xiaolai/CJK bewusst draußen). **Live-Beweis:** `measureText('Hallo Welt')` je Familie ≠
monospace (120.4) → Excalifont 93.4 · Nunito 98.8 · Comic Shanns 110 · Virgil 98.4 · Cascadia 117.2 · Lilita One
89.2 · Liberation Sans 90.8. Jede misst gegen ihre echte Font → korrekte, portable Geometrie für jede Nicht-CJK-
Szene. **Damit ist auch F01 vollständig zu** (nicht nur für die 3 Default-Familien).

#### F10 [ADRESSIERT + live bewiesen] — fail-closed Preload
`renderer.tsx`: vor `setPhase('ready')` wird für **jede** unterstützte Familie ≥1 Face verlangt, `await
face.load()` **nicht** verschluckt, danach der FontFace-**`.status`** geprüft (NICHT `document.fonts.check` — das
ist weight-sensibel und würde Nunito@500 falsch-negativ melden). Scheitert eine Pflichtfamilie (kein Face /
load-Fehler / Status ≠ `loaded`) → `phase='font-error'` + read-only-Meldung; `onChange` speichert nicht (Guard
`phase!=='ready'`). **Live:** Editor erreicht `ready` (alle 7 inkl. Nunito@500 geladen), kein falscher
`font-error`, 0 Font-Fehler. Der Fehlerpfad ist eine einfache Verzweigung (logisch verifiziert, nicht künstlich
getriggert).

#### CJK-Grenze (Codex-F09-Teil) [DOKUMENTIERT]
Xiaolai (CJK, 12,8 MB) bleibt bewusst draußen. CJK-Text misst/rendert mit System-Fallback → für CJK-schwere
Szenen kann Geometrie driften. Als bekannte **v0.1.0-Grenze dokumentiert**; ein CJK-read-only/Warn-Gate ist ein
Folge-Schritt, falls CJK-Support gefordert wird (statt stiller per-Glyph-Degradierung).

**Prozess-Hinweis:** Hermes hat den Font-Shim-Gate-Block mitangepasst (obwohl ich um Auslassung gebeten hatte),
aber die Änderung ist korrekt (pint `dataFaceCount` auf `EMBEDDED_FONTS.length`); meine F02/F03-Härtung
(Version-Pin, exakte Counts, semantische Bundle-Asserts, non-data-URL-Check) ist unverändert intakt.

**Status Build/Verify Runde 2:** `node build.mjs` grün (F12 + Gate: 21 data:-Faces, exakte Counts), styles.css
612 KB, Live-Re-Verify bestanden (7 Familien echte Metriken + fail-closed ready). **Committet als `9a93064`** (Plugin-Repo).

---

## Runde-2-Code (F08/F09/F10) — wörtliche Kernstellen aus Commit `9a93064`

Damit du gegen den echten Code prüfst statt gegen die Prosa oben. Dateien im Plugin-Repo `~/dev/mindgraph-excalidraw-plugin` @ `9a93064`: `build.mjs` (EMBEDDED_FONTS + Gate), `src/renderer.tsx` (Preload).

### F08/F09 — `EMBEDDED_FONTS` (build.mjs, statische Tabelle, KEINE Größen-Heuristik)
`SUPPORTED_FONT_FAMILIES` (renderer.tsx) = **7 Nicht-CJK-Familien**: Excalifont, Nunito, Comic Shanns, Virgil, Cascadia, Lilita One, Liberation Sans (Xiaolai/CJK bewusst draußen). `EMBEDDED_FONTS` hat **21 Einträge** (alle Subsets dieser 7), jeder `{ family, filename, unicodeRange, weight? }` — `unicodeRange` **1:1 aus Excalidraws `static init()`** (chunk-K2UTITRG.js), nicht geraten:

```js
export const EMBEDDED_FONTS = [
  { family: 'Excalifont', filename: '…a88b72a2….woff2',
    unicodeRange: 'U+20-7e,U+a1-a6,U+a8,U+ab-ac,…,U+2212' },
  // … Excalifont-Latin-ext, Comic Shanns (3 Subsets), Virgil, Cascadia, Lilita One, Liberation Sans …
  { family: 'Nunito', filename: '…', weight: '500',
    unicodeRange: 'U+0460-052F,U+1C80-1C88,U+20B4,…' },
]   // 21 Einträge / 7 Familien; build.mjs bettet jeden als data:-@font-face MIT unicodeRange ein.
    // existsSync-fail-closed, wenn eine Font-Datei fehlt (kein stiller Teil-Erfolg).
```

### Gate (build.mjs, Post-Build) — gegen stillen Font-Rückfall bei Excalidraw-Update
```js
if (dataFaceCount !== EMBEDDED_FONTS.length)  // erwartet 21
  gateFail.push(`eingebettete data:-Faces = ${dataFaceCount} (erwartet ${EMBEDDED_FONTS.length})`)
// + styles.css: KEINE non-data Font-URL (url(<nicht data:>…woff2)) erlaubt
// + Bundle: 0 lebendes document.fonts.load( / .fonts.add( / Accept:"font/woff2"
// + exakte fontPatchCounts (createUrls:1 loadFontFaces:1 fonts.load:2 fetchFont:1 genFontFace:1)
// + Excalidraw-Version-Pin 0.18.1 → Build ROT bei jeder anderen Version (Pflicht-Re-Audit)
```

### F10 — fail-closed Font-Preload (src/renderer.tsx, VOR `setPhase('ready')`)
```tsx
const fontFail: string[] = []
for (const family of SUPPORTED_FONT_FAMILIES) {              // alle 7 Pflichtfamilien
  const faces = [...document.fonts].filter((ff) => ff.family === family)
  if (faces.length === 0) { fontFail.push(`${family}: kein Face registriert`); continue }
  try { await Promise.all(faces.map((ff) => ff.load())) }    // Fehler NICHT verschluckt
  catch (e) { fontFail.push(`${family}: load-Fehler …`); continue }
  const notLoaded = faces.filter((ff) => ff.status !== 'loaded')  // .status statt document.fonts.check() (weight-sensibel)
  if (notLoaded.length > 0) fontFail.push(`${family}: … nicht 'loaded'`)
}
if (fontFail.length > 0) { setPhase('font-error'); return }  // read-only; onChange-Guard: kein Autosave vor 'ready'
setPhase('ready')
```

**Re-Check-Auftrag — bestätige geschlossen ODER benenne konkrete Restlücke:**
- **F08:** deterministische Tabelle statt „größte Datei", jede Familie/jedes Subset mit **originaler** `unicodeRange` → Glyphen-Abdeckung == echtes Excalidraw (ein Zeichen, das die Familie nicht hat, fällt in Plugin UND Excalidraw gleich zurück → kein Drift).
- **F09:** alle **7** auswählbaren Nicht-CJK-Familien eingebettet (Live: `measureText('Hallo Welt')` je Familie ≠ monospace).
- **F10:** jede Pflichtfamilie muss `status==='loaded'` sein, sonst `font-error` + read-only, kein Autosave — Fehlerpfad ist fail-**closed**.

---

### Runde 3 — Antwort auf F11 (Helvetica/nicht eingebettete Szenen-Schrift)

Berechtigter Fund — F08/F10 waren zu, aber F09/F01 nicht ganz: der Preload gated nur die **7 eingebetteten** Familien; eine importierte Szene mit **Helvetica (ID 2)** oder CJK/Xiaolai erreichte `ready` + speicherte plattformabhängige Geometrie. „portable für jede Nicht-CJK-Szene" war falsch. **Gefixt in Plugin-Commit `800c8a8` (v0.1.2, prod-signiert), live gegen OFFICIAL_KEYS verifiziert.**

#### F11 [ADRESSIERT] — Scene-Font-Scan, fail-closed (`src/renderer.tsx`)
`FONT_FAMILY` wird aus `@excalidraw/excalidraw` importiert; `EMBEDDED_FONT_IDS` = die IDs der 7 eingebetteten Familien (**{1,3,5,6,7,8,9}** = Virgil/Cascadia/Excalifont/Nunito/Lilita One/Comic Shanns/Liberation Sans). Beim Laden (VOR dem Font-Preload) werden die `fontFamily`-IDs aller Text-Elemente gescannt; enthält die Szene eine **nicht** eingebettete Familie (Helvetica=2, CJK/Xiaolai, oder unbekannt) → neuer terminaler Zustand **`'unsupported-font'`**: read-only mit klarer Meldung, kein `restore()`/kein `ready` → **kein Autosave** (der `phase!=='ready'`-Guard in `onChange` greift). Deine Vorschlag-Variante 1 (read-only statt stiller Speicherung) — bewusst KEINE Geometrie-Migration (die wäre selbst geometrieverändernd) und KEIN neuer Font (Lizenz/Metrik-Beweis).
```tsx
const usedFontIds = new Set<number>()
for (const el of (scene?.elements ?? []) as Array<{type?:string; fontFamily?:number}>)
  if (el?.type === 'text' && typeof el.fontFamily === 'number') usedFontIds.add(el.fontFamily)
const unsupportedIds = [...usedFontIds].filter((id) => !EMBEDDED_FONT_IDS.has(id))
if (unsupportedIds.length > 0) { setPhase('unsupported-font'); return }   // read-only, kein Autosave
```
**Verifikation:** `node build.mjs` grün; FONT_FAMILY-Map im gebauten Bundle bestätigt (`Virgil:1,Helvetica:2,…,Liberation Sans:9`) → `EMBEDDED_FONT_IDS` nicht leer (keine Regression: normale Excalifont-Szenen bleiben editierbar). v0.1.2 prod-signiert (`mindgraph-release-2026-01`) + live gegen OFFICIAL_KEYS verifiziert. **Grenze/offen:** der Read-only-Pfad ist logisch verifiziert; der GUI-Live-Beweis (Helvetica-Szene öffnen → read-only, Excalifont-Szene → editierbar) steht als manueller Schritt aus. Roundtrip-Test macOS/Windows-Fontauflösung ist damit gegenstandslos (Helvetica-Szenen werden gar nicht mehr geschrieben).

Damit sind **F01/F09** vollständig zu (7 eingebettete Familien mit echten Metriken **und** jede andere Nicht-CJK/CJK-Familie fail-closed). Bitte F11 gegencheken (`~/dev/mindgraph-excalidraw-plugin` @ `800c8a8`).
