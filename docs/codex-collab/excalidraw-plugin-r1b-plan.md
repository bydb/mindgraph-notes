# Aufgabe: Adversariales Review — R1b Excalidraw-Renderer-Plugin (Plan, VOR dem Bau)

> Für **Codex**. Protokoll: `./README.md`. Nur Findings, **kein Code-Edit, keine Commits.**
> Dies ist ein PLAN (kein Code). Ziel: den R1b-Bauplan zerpflücken, bevor ein Zeichen Code entsteht —
> wie beim R1a-ADR. Trag Findings unter „## Codex-Findings — Runde 1" ein.

## Kontext

R1a (Renderer-Plugin-Host) ist gebaut, durch 5 Codex-Impl-Review-Runden (F01–F30) gehärtet, headless
getestet (593 Tests) UND live verifiziert (Demo-Plugin `mgx-demo-renderer` mountet, liest+schreibt über
die Vault-Bridge). Committet auf `feat/plugin-renderer-host`. **R1b = das ERSTE echte Renderer-Plugin:
Excalidraw**, als **externes signiertes Plugin im EIGENEN lokalen Repo** — NICHT gebündelt, NICHT im
mindgraph-notes-Repo.

Der Host-Vertrag (aus R1a, `@mindgraph/plugin-api`):
- Default-Export `PluginRendererModule { id, activate(host), deactivate?() }`.
- `host.registerFileEditor({ editorId, mount })` — `editorId` MUSS im Manifest `ui.fileEditors` deklariert
  sein; genau 1× registrieren.
- `mount(container: HTMLElement, ctx: { filePath, host }) => () => void` (dispose). Das Plugin macht sein
  EIGENES `createRoot(container).render(...)` (Dual-React-sicher) und gibt `root.unmount` als dispose zurück.
- `host.vault.{read,readBytes,exists,write,writeBytes}` (Komfort-Bridge über `plugin:host` → writeFileSafe).
- `host.theme: 'light'|'dark'` + `host.onThemeChange(cb) => unsub`.
- **Loader-Vertrag (F12, HART):** die `renderer.js` wird als **selbstenthaltenes Single-File-ESM** per Blob-
  `import()` geladen. Der Packer (`esmCheck`) LEHNT AB: relative/bare/dynamische Sub-Importe,
  `import.meta.url`, `eval`/`new Function`. `data:`-Inline-Assets sind erlaubt. `entrypoints.styles` (CSS) ist
  KEIN JS → nicht F12-geprüft, wird vom Host als `<style>` appliziert.

## 1. Scope (bewusst eng — MVP)

- **NUR** der dateibasierte Editor: Klick auf `.excalidraw` im FileTree → plugin-editor-Tab → Excalidraw-
  Canvas; Änderungen werden debounced als `.excalidraw`-JSON zurückgeschrieben.
- **KEIN** Markdown-Embed (`![[skizze.excalidraw]]`) — das ist **Phase 3** (eigener `markdown.embed.renderer`-
  Slot im Kern, separates ADR). Bewusst raus aus R1b.
- **KEIN** PNG/SVG-Export im MVP (späteres Increment; Excalidraw `exportToSvg`/`exportToBlob`).
- Capabilities: **nur** `vault.read` + `vault.write`. Kein Netzwerk, keine Secrets.

## 2. Repo & Toolchain

- Eigenständiges lokales git-Repo `~/dev/mindgraph-excalidraw-plugin` (GitHub-Remote später).
- Struktur:
  ```
  src/renderer.tsx        # Default-Export-Modul + Excalidraw-Wrapper (React)
  src/types.d.ts          # vendored Host-Vertrag (PluginRendererModule/Host) — type-only, kein Runtime-Dep
  manifest.json           # entrypoints.renderer/styles, ui.fileEditors, capabilities
  build.mjs               # esbuild → dist/renderer.js (ESM) + dist/styles.css
  scripts/pack-sign.mjs   # packt+signiert dist/ zu einem .mgxplugin (Dev-Key)
  package.json            # @excalidraw/excalidraw@0.18.1 + react + react-dom
  ```
- **Host-Vertrag als Typen:** type-only, daher zur Laufzeit irrelevant. Optionen: (a) `@mindgraph/plugin-api`
  aus dem lokalen Workspace via `file:`-Dep, (b) das schmale `PluginRendererModule`/`PluginRendererHost`-
  Interface vendorn (`src/types.d.ts`). **Vorschlag: vendorn** (kein Kopplungs-/Publish-Zwang; das Paket ist
  noch nicht auf npm). Vertrag ist klein + stabil.

## 3. Der Build — Single-File-ESM (DER Knackpunkt, F12)

Das ist das größte technische Risiko. Excalidraw ist groß (~1–2 MB), zieht React, hat Fonts + CSS und
nutzt intern evtl. dynamische Importe/Worker. F12 verlangt EIN selbstenthaltenes ESM ohne dynamische
Sub-Importe/Worker-Dateien. Plan:

- **esbuild** `bundle: true, format: 'esm', platform: 'browser', splitting: false, minify: true`, eigenes
  React gebündelt (kein `external`).
- **CSS** (`@excalidraw/excalidraw/index.css`) → esbuild emittiert `dist/styles.css` (separater Output),
  im Manifest als `entrypoints.styles`. Der Host appliziert es (kein F12).
- **Fonts (Wrinkle a):** Excalidraw lädt Fonts zur LAUFZEIT von `window.EXCALIDRAW_ASSET_PATH`. Im Blob-/
  Renderer-Kontext gibt es dort nichts. **MVP: System-Fallback** — `EXCALIDRAW_ASSET_PATH = '/'` setzen und
  die handgezeichnete Virgil-Schrift NICHT ausliefern (Excalidraw fällt auf System-Sans zurück). Sieht
  weniger „handgezeichnet" aus, funktioniert aber. **Fallback-Plan:** Fonts als `data:`-`@font-face` in die
  `styles.css` inlinen (dann CSP `font-src 'self' data:` im Host anpassen — aktuell fehlt `font-src`,
  fällt auf `default-src 'self'`; `data:`-Fonts bräuchten die Erweiterung → kleiner Host-Change).
- **Dynamische Importe / Worker (HARTES RISIKO):** wenn Excalidraws Bundle intern `import()`-Chunks oder
  Web-Worker-Dateien erzeugt, scheitert F12. **Zu verifizieren im ersten Scaffold-Schritt** (nicht raten):
  `esbuild`-Output auf zusätzliche Chunk-Dateien prüfen + `esmCheck` gegen `dist/renderer.js` laufen lassen.
  - **Wenn sauber single-file:** fertig.
  - **Wenn Excalidraw Chunks/Worker erzwingt:** Optionen (Codex bitte bewerten): (i) esbuild-Plugin, das
    dynamische Importe eager inlined; (ii) Inline-Blob-Worker (Codex-Impl-F12 erlaubte das ausdrücklich als
    Ausnahme) → dann muss `esmCheck` eine `new Worker(new Blob…)`-Form zulassen; (iii) F12 für SIGNIERTE
    Plugins bewusst lockern (widerspricht der bisherigen Härte — nur als letzte Option).
- **`window.EXCALIDRAW_ASSET_PATH`** wird im Modul-Top-Level ODER in `activate` gesetzt (globaler Realm,
  §7-Trade-off). Bei mehreren Renderer-Plugins ein potenzieller Global-Konflikt — für R1b (ein Excalidraw-
  Plugin) unkritisch, dokumentieren.

## 4. `renderer.tsx` — Design

```
export default {
  id: 'mindgraph-excalidraw',
  activate(host) {
    host.registerFileEditor({ editorId: 'excalidraw', mount })
    function mount(container, { filePath, host }) {
      const root = createRoot(container)
      root.render(<ExcalidrawEditor filePath={filePath} host={host} />)
      return () => root.unmount()
    }
  },
}
```
`ExcalidrawEditor`:
- Mount: `host.vault.exists` → `host.vault.read(filePath)` → leer/neu → `initialData={}`, sonst
  `JSON.parse` → `{ elements, appState: {…, collaborators: undefined}, files }`.
- `onChange` → **Debounce 800 ms** → `serializeAsJSON(elements, appState, files, 'local')` → nur schreiben
  wenn ≠ `lastSaved` → `host.vault.write(filePath, json)`.
- Theme: `host.theme` initial + `host.onThemeChange` → `<Excalidraw theme={…} />`.
- dispose (root.unmount) räumt React + Excalidraw ab; Debounce-Timer clearen (§7-Pflicht).

## 5. Manifest (Entwurf)

```json
{
  "manifestVersion": 2, "id": "mindgraph-excalidraw", "version": "0.1.0",
  "label": "Excalidraw", "description": "Handgezeichneter Zeichen-Editor für .excalidraw-Dateien.",
  "category": "productivity?", "apiVersion": "^0.2.0", "minAppVersion": "0.9.0-beta",
  "author": { "name": "…" },
  "entrypoints": { "renderer": "renderer.js", "styles": "styles.css" },
  "capabilities": ["vault.read", "vault.write"],
  "ui": { "fileEditors": [{ "editorId": "excalidraw", "extensions": [".excalidraw"], "label": "Excalidraw" }] }
}
```
(Frage: gültige `category`-Enum-Werte? R1a-Tests nutzten `ai`.)

## 6. Signierung + lokaler Install (Dev)

Prod-Keyring ist leer (Option A). Für R1b-Dev: Dev-Keypair, Public-Key in eine Dev-Keyring-JSON
(`MINDGRAPH_PLUGIN_DEV_KEYRING_PATH`), `dist/` via `packPluginArtifact` (aus mindgraph-notes, oder eine
kleine eigenständige Kopie der Pack-Logik) signieren → `.mgxplugin`, per Install-Dialog installieren.
(Genau der Pfad, den die R1a-Live-Verifikation nutzte.)

## 7. Wrinkles / Offene Punkte

- **9 npm-audit-Findings** (transitiv über Excalidraw-Deps) — vor einem echten Release prüfen; für Dev-MVP ok.
- **Bundle-Größe** ~1–2 MB als Blob-import-String — akzeptabel? (Blob wird bis Unload gehalten, R1a-F03.)
- **React-Version:** Excalidraw 0.18.1 ist React-19-kompatibel (memory-verifiziert), Plugin bündelt eigenes React.
- **`collaborators`-Feld** muss beim `initialData`-appState auf `undefined`/leer, sonst wirft Excalidraw.

## 8. Fragen an Codex (bitte bewerten)

1. **Single-File-ESM-Feasibility:** ist der geplante Weg (esbuild single-file + CSS-Output + System-Fallback-
   Fonts) realistisch, oder erzwingt Excalidraw 0.18.1 dynamische Chunks/Worker? Wenn ja — welche der drei
   Optionen (§3) ist am wenigsten übel, ohne die F12-Härte für signierte Plugins aufzuweichen?
2. **Font-Strategie:** MVP-System-Fallback (kein CSP-Change) vs. `data:`-Inline (Host-CSP `font-src data:`).
   Vertretbar, mit Fallback zu starten, oder sofort `data:`?
3. **Vendored Typen vs. `@mindgraph/plugin-api` file:-Dep** — welcher Kopplungsgrad ist gesünder?
4. **Pack/Sign im Fremd-Repo:** die Pack-Logik aus mindgraph-notes kopieren (Drift-Risiko) vs. das (noch
   unveröffentlichte) Paket referenzieren vs. ein winziges eigenständiges Sign-Skript?
5. **Übersehene harte Stelle?** (Excalidraw-Interna: Worker, `import.meta`, Font-Loader, Portals, globale
   Styles, die im gemeinsamen Realm mit dem Host kollidieren.)

## Codex-Findings — Runde 1

### F01 — Der unveränderte Excalidraw-Build ist nachweislich nicht F12-fähig
Schwere: kritisch
Bereich: §3 Single-File-ESM
Status: [OFFEN]

`@excalidraw/excalidraw@0.18.1` liefert nicht nur „eventuell“ Chunks: `dist/prod/index.js` lädt dynamisch
sämtliche Locale-Module sowie Daten-/Mermaid-Module; `chunk-K2UTITRG.js` lädt
`subset-worker.chunk.js`/`subset-shared.chunk.js`, erzeugt einen Modul-Worker und prüft
`import.meta.url`. Der Worker-Chunk exportiert seine URL ebenfalls über `import.meta.url`. Zusätzlich
enthält der transitive Font-Subsetting-/WASM-Pfad `new Function`.

Ein lokaler In-Memory-Probelauf mit exakt dem geplanten esbuild-Grundprofil
(`bundle:true`, `format:'esm'`, `splitting:false`, Production-Conditions, minifiziert) bestätigt:

- esbuild faltet die dynamischen Imports tatsächlich in **eine** JS-Ausgabe; verbleibende
  String-Literal-`import()`s: 0.
- Ausgabe bereits ohne Plugin-Wrapper/CSS/Fonts: ca. **8,0 MB**, nicht 1–2 MB.
- Verbleibend: 4× `import.meta.url`, 2× `new Function`; damit lehnt das echte
  `assertSelfContainedEsm()` den Build terminal ab.
- Ein globales esbuild-`define` für `import.meta.url = undefined` beseitigt zwar die Meta-Ausdrücke,
  nicht aber `new Function`, und verändert undifferenziert alle abhängigen Module.

Von den drei Optionen ist **(i) eager inline** am wenigsten übel, aber nur als gezielter
Build-Adapter: Locale-/Datenimporte inline bündeln und Excalidraws Font-Subsetting-Worker samt
WASM/`new Function` für R1b über einen kontrollierten Alias/Patch durch einen Main-Thread-/No-op-
Adapter ersetzen. Danach muss das *originale Host-`esmCheck`* grün sein. Option (ii), ein Inline-Blob-
Worker, ist erst sinnvoll, wenn Font-Subsetting wirklich MVP-Pflicht wird; dann muss der Worker
separat zu einem selbstenthaltenen String gebaut und im Hauptbundle als Blob erzeugt werden — bloß
den vorhandenen Chunk umzuschreiben reicht wegen `import.meta.url`, Shared-Chunk und `new Function`
nicht. Option (iii), F12 global zu lockern, ist für ein einzelnes Plugin klar die schlechteste Wahl
und sollte ausgeschlossen werden.

Der Plan braucht vor Implementierung einen expliziten Spike-Abnahmepunkt: exakt ein JS-Output,
keine Imports/`import.meta.url`/`eval`/`new Function`, reales `assertSelfContainedEsm()` grün und
Smoke-Test der Funktionen Text, Bild-Paste und Export-UI (oder deren bewusste Deaktivierung).

### F02 — „Asset-Path `/` = System-Fallback“ ist keine definierte Font-Strategie
Schwere: hoch
Bereich: §3 Fonts
Status: [OFFEN]

Excalidraw dokumentiert `EXCALIDRAW_ASSET_PATH="/"` für den Fall, dass die Font-Dateien tatsächlich am
Web-Root liegen. Im MindGraph-Renderer liegen sie dort nicht. Der Wert erzeugt daher Same-Origin-
Fontrequests gegen den App-Root und 404s; erst deren Fehler führt zufällig zu Browser-Fallback. Auch
`index.css` enthält relative `@font-face`-URLs (z.B. Assistant), die nach Einfügen als Host-`<style>`
gegen die Host-URL aufgelöst werden. Das ist weder „kein Assetzugriff“ noch deterministisch. Abweichende
Fonts verändern Textmetriken und damit die Darstellung derselben `.excalidraw`-Datei zwischen
MindGraph und anderen Excalidraw-Clients.

Für einen echten System-Fallback muss der Build die Excalidraw-`@font-face`-Regeln und Font-Loader-Pfade
gezielt entfernen/überschreiben, `EXCALIDRAW_ASSET_PATH` **nicht** auf `/` setzen und einen
deterministischen Font-Stack konfigurieren. Ein Test muss beweisen, dass Mount/Textbearbeitung keine
Font-/Netzrequests erzeugt. Wenn visuelle Kompatibilität wichtiger ist, ist `data:`-Inlining technisch
sauberer; dann gehört `font-src 'self' data:` als enger Host-Change samt CSP-Test dazu. Für R1b ist
System-Fallback vertretbar, aber nur als diese explizite, getestete Degradierung — nicht als 404-Fallback.

### F03 — Debounce plus synchroner Dispose verliert Änderungen und erlaubt stale Writes
Schwere: kritisch
Bereich: §4 Persistenz/Lifecycle
Status: [OFFEN]

„Debounce-Timer beim Dispose clearen“ verwirft genau die letzten Änderungen innerhalb der 800 ms.
Ein Flush im Disposer löst das beim Plugin-Unload ebenfalls nicht zuverlässig: R1a sperrt und drained
Host-Calls **vor** dem Renderer-Teardown; ein erst im Disposer gestartetes `vault.write` wird daher
abgelehnt. Außerdem können zwei bereits gestartete asynchrone Writes außer Reihenfolge fertig werden
und ein älterer Snapshot den neueren überschreiben. `lastSaved` allein verhindert diese Race nicht.

Der Plan braucht einen serialisierten, coalescenden Save-Controller pro Mount:

- höchstens ein Write in flight, danach stets den neuesten dirty Snapshot schreiben;
- Sequenz-/Revisionserkennung, damit ein älteres Ergebnis nie den neueren Zustand als gespeichert markiert;
- Save-Fehler sichtbar und retrybar, nicht nur Console;
- klare Semantik für Tab-Schließen und Plugin-Upgrade. Mit dem aktuellen synchronen Mount-Dispose-Vertrag
  gibt es keinen garantierten asynchronen „before unload“-Flush. Entweder wird während der Bearbeitung
  früh genug fortlaufend gespeichert (und die kleine letzte Dirty-Lücke ehrlich akzeptiert/angezeigt),
  oder R1a benötigt später einen separaten async Flush-Handshake. „Timer clearen“ darf nicht als
  verlustfreier Teardown beschrieben werden.

Zusätzlich muss der Initial-`onChange` während Hydration vom Autosave ausgeschlossen werden; sonst kann
ein leerer/default Scene-Stand die noch nicht geladene Datei überschreiben.

### F04 — Das fremde Repo darf weder Pack-/Sign-Logik noch die Vertragsgrenze kopieren
Schwere: hoch
Bereich: §2 Typen; §6 Pack/Sign
Status: [OFFEN]

Eine „kleine eigenständige Kopie“ des Packers ist keine kleine Kopplung: kanonisches JSON, Fileset,
Pfadlimits, F12-Gate, Manifest-Semantik, Key-Binding und Post-Verify sind Teil der Sicherheitsgrenze.
Eine Kopie driftet zwangsläufig vom Installer. Auch ein selbst gebautes Mini-Sign-Skript würde gerade
die inzwischen gehärteten Checks umgehen.

Der Host-Repo-Signierer muss die einzige Pack-/Sign-Autorität bleiben. Das Plugin-Repo baut ausschließlich
ein unsigniertes Artefaktverzeichnis als Daten; ein versionierter MindGraph-CLI-Aufruf signiert dieses
Verzeichnis anschließend zentral. Lokal darf das vorerst ein explizit gepinnter Pfad/Wrapper zum
MindGraph-Tool sein; für CI/Release sollte daraus ein publiziertes CLI-Artefakt bzw. eine Release-Action
mit fester Version werden. Der private Prod-Key gehört nie in das Plugin-Repo.

Für Typen ist ein `file:`-Dependency ebenfalls nicht release-/CI-portabel. Vendoring ist als Bootstrap
akzeptabel, wenn die Datei **generiert** oder byte-/type-getestet gegen eine exakt gepinnte
`@mindgraph/plugin-api`-Version ist und `apiVersion` dieselbe Version ausdrückt. Freihändig kopierte
Interfaces ohne Drift-Gate sind nicht gesund. Langfristig ist das veröffentlichte type-only
`@mindgraph/plugin-api` die tiefe Interface-Seam.

### F05 — Das MVP schaltet Excalidraws eingebaute Datei-/Export-/Netzoberflächen nicht ab
Schwere: hoch
Bereich: §1 Scope; §4 Wrapper; Vertrauenslinie
Status: [OFFEN]

„Kein PNG/SVG-Export“ und „kein Netzwerk“ folgen nicht allein aus fehlenden Host-Capabilities.
Excalidraw bringt standardmäßig UI und Codepfade für Datei öffnen/speichern, Export, Bibliotheken,
Mermaid/Bildverarbeitung und Links mit. Renderer-Plugin-Code läuft voll vertraut im gemeinsamen
Renderer; die Vault-Capabilities begrenzen nicht seinen direkten `window`-/DOM-/Fetch-Zugriff. Die
Host-CSP erlaubt zudem mehrere externe Hosts. Browser-Dateidialoge/Downloads könnten den
MindGraph-Vault-Vertrag umgehen.

Der Plan muss die Excalidraw-`UIOptions` und bereitgestellten Children explizit auf den MVP reduzieren:
native Load/Save-as, Export, Library-/Mermaid-/AI-Aktionen und kollaborative/Link-Funktionen ausblenden
oder bewusst klassifizieren. Ein UI-Smoke-Test muss beweisen, dass es keinen alternativen Datei- oder
Netzpfad gibt. „Capabilities: nur vault.read/write“ ist Komfort-Gating, kein Sandbox-Versprechen.

### F06 — Gemeinsamer Realm braucht Cleanup für Globals, Portals, Shortcuts und CSS
Schwere: hoch
Bereich: §3/§4 Excalidraw-Interna
Status: [OFFEN]

Der Plan erwähnt `window.EXCALIDRAW_ASSET_PATH`, definiert aber weder Ownership noch Wiederherstellung.
Er darf nicht am Modul-Top-Level gesetzt werden: Top-Level läuft vor erfolgreichem `activate()` und kann
bei Vertrags-/Aktivierungsfehlern zurückbleiben. Wenn der Wert überhaupt benötigt wird, muss
`activate()` den Vorgängerwert erfassen und `deactivate()` ihn nur dann wiederherstellen, wenn das Plugin
noch Eigentümer des aktuellen Werts ist.

Auch Excalidraws CSS ist nicht vollständig lokal: Es enthält `:root[...]`-Selektoren und setzt auf
Portals/Modals, globale Tastatur-/Pointer-Listener und vollständige Container-Dimensionen. Der Plan
braucht Tests für:

- Tab-Container mit explizit nicht-null `height/width`, `min-height:0`, Overflow und Resize;
- zwei parallele Excalidraw-Tabs (Portal-/Shortcut-/Focus-Isolation);
- Tabwechsel und Unmount ohne verbleibende Body-Portals/Listener;
- Host-Dialoge/Shortcuts und Theme nach Laden der global injizierten Excalidraw-CSS;
- `deactivate()` nach bereits unmounteten sowie noch offenen Tabs.

### F07 — Manifestentwurf und Signierpfad sind in der gezeigten Form nicht releasefähig
Schwere: mittel
Bereich: §5/§6
Status: [OFFEN]

`"productivity?"` ist ungültig. Die aktuelle Enum lautet `ai | communication | business | learning |
research | devices | documents`; für dieses Plugin ist `documents` die naheliegende Wahl. Der zentrale
offizielle Signierer verlangt außerdem `manifest.repo` und bindet es an erwartetes `owner/repo` sowie
Tag-Version. Diese Felder fehlen im Entwurf.

`apiVersion` und `minAppVersion` dürfen nicht geraten werden. Sie müssen aus dem tatsächlich
veröffentlichten Host-Vertrag bzw. dem ersten App-Release mit Renderer-Host abgeleitet und in einem
Install-Kompatibilitätstest bewiesen werden. Dev-Pack und offizielles Release-Signing sollten denselben
Manifest-/F12-/Post-Verify-Pfad benutzen; nur Keyring/Key unterscheiden sich.

### F08 — Lade-, Parse- und Save-Fehler haben noch keinen Benutzervertrag
Schwere: hoch
Bereich: §4 Editorzustand
Status: [OFFEN]

Der Happy Path `exists → read → JSON.parse → render` reicht für einen Datei-Editor nicht. Ungeklärt sind:
ungültiges/teilweise geschriebenes JSON, inkompatible Excalidraw-Version, fehlende `files`, Read-/Write-
Fehler, Datei während des Ladens geschlossen, Theme-Callback nach Unmount sowie Änderungen während eines
fehlgeschlagenen Saves. Ein Parse-Fehler darf insbesondere niemals durch den nächsten `onChange` mit
einer leeren Szene überschrieben werden.

Der Plan braucht explizite Zustände `loading | ready | dirty/saving | load-error | save-error`, einen
Abort-/mounted-Guard für alle Promises und eine nicht-destruktive Fehleroberfläche mit Retry. Erst nach
erfolgreicher Hydration darf Autosave aktiv werden. Die geladene Szene sollte über Excalidraws
Restore-/InitialData-Vertrag normalisiert werden, nicht durch ad-hoc Mutation einzelner AppState-Felder.

### F09 — Der Build-Spike braucht quantitative Abnahmekriterien statt „zusätzliche Dateien prüfen“
Schwere: mittel
Bereich: §3/§7 Performance
Status: [OFFEN]

Eine einzelne Output-Datei allein beweist F12 nicht; der reale Probe-Build zeigt trotz eines Outputs
verbotenes `import.meta.url`/`new Function`. Umgekehrt ist ein ca. 8-MB-minifiziertes JS als IPC-String +
Buffer + Blob + kompiliertes Modul deutlich speicherintensiver als die geschätzten 1–2 MB und wird eager
beim Install/Enable importiert.

Abnahme sollte festschreiben: Host-`assertSelfContainedEsm()` auf den finalen Bytes, esbuild-Metafile ohne
External/weitere Outputs, Größenbudget für JS/CSS/Archiv, Messung von Install-Ack-/erster-Mount-Zeit und
Speicher, sowie reproduzierbarer Build (`npm ci`, Lockfile, exakt gepinnte esbuild-/React-/Excalidraw-
Versionen). Erst danach ist entschieden, ob „alle Locales eager inline“ für R1b akzeptabel ist oder per
Build-Adapter auf die tatsächlich unterstützten Sprachen reduziert werden muss.
