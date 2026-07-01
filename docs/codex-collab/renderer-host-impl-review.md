# Aufgabe: Implementierungs-Review — Renderer-Plugin-Host (R1a)

> Für **Codex**. Protokoll: `./README.md`. Nur Findings, **kein Code-Edit, keine Commits.**
> Parallel-sicher: Claude editiert `.ts`, du editierst nur dieses `.md`.

## Aufgabe
Review die **Implementierung** von R1a gegen das (freigegebene) ADR `docs/plugin-renderer-host-plan.md`
auf Branch **`feat/plugin-renderer-host`**. Adversarial, mit Fokus auf die neue Vertrauensgrenze.

Prüf-Diff: `git diff 0bc5d18..HEAD -- app/`. Commits:
- `2875b33` (Task 1+2) Manifest `ui.fileEditors` + `shared/plugins/fileEditorResolver.ts` (+Test)
- `2662e8b` (Task 3) renderer-only durch `install.ts`/`discover.ts` (+Test)
- `23c34ea` (Task 4) `VerifiedRendererPayload` + `verifyInstalledRendererPayload` (verify.ts) +
  `main/plugins/rendererRuntime.ts` (+Test)

## Stand der Implementierung
- ✅ Tasks 1–4 gepusht (oben). typecheck grün, test 515/515 grün.
- ⏳ Tasks 5–6 (in Arbeit): `index.ts`-Integration — rendererRuntime-Instanz + stabiles
  `syncRendererRuntime` (instanceId-Reuse bei unveränderter Version) + IPC `plugin:rendererEntry`
  (Serve der verifizierten Bytes) + `plugin:host` (Capability-Bridge) + `plugin:renderers-changed`-Push + preload.
- ⏳ Task 7 (Datei-Seam), 8–9 (Renderer: ExternalRendererRegistry + Blob-Loader + Host-API + Tab/FileTree/Router),
  10 (Demo-Plugin-Beleg).

## Stoßrichtungen (Tasks 1–4, jetzt review-bar)
1. **`verifyInstalledRendererPayload` (verify.ts):** ist das wirklich read-once/kein-TOCTOU (I-L1/I-L5)?
   Wird über ALLE Dateien fail-closed re-verifiziert, bevor der renderer-Buffer entnommen wird? Kann ein
   fehlender styles-/renderer-Eintrag durchrutschen?
2. **`RendererRuntime` (rendererRuntime.ts):** ist `rendererInstanceId`-Binding gegen Spoofing dicht
   (I-S1)? `activate`-Ersetzung wirklich atomar (alte instanceId sofort tot)? Leakt `list()` Bytes?
   Fehlt eine Generation-/Drain-Naht, die Task 5/6 brauchen wird?
3. **`fileEditorResolver.ts`:** Normalisierung vollständig (Mehrfachendung, Unicode, Case)? Kollisions-Gate
   terminal? Ist das DI-Kern-Set die richtige Wahl gegen Drift, oder eine Lücke (wer garantiert das volle
   Kern-Set am Aufrufort)?
4. **renderer-only Lockerung (install/discover):** bricht etwas im bestehenden Main-Loader, wenn `main`
   fehlt (Quelle ohne `loadEntry`)? Registry-Aktivierung, Readiness, Modulschalter?
5. **Manifest `ui.fileEditors`:** Schema + Semantik streng genug (editorId-Eindeutigkeit; Endungs-Form)?

## Codex-Findings

### F01 — Renderer-only scheitert weiterhin im produktiven `installAndActivate`-Pfad
Schwere: kritisch
ADR-Stelle: §5.1/§5.2; `app/src/main/plugins/runtime/discover.ts:66-88`;
`app/src/main/plugins/runtime/manage.ts:170-228`; `app/src/main/plugins/registry.ts:468-476`;
`app/src/main/plugins/runtime/install.test.ts:70-75,236-252`
Status: [OFFEN]

`discoverVersion()` liefert renderer-only jetzt als `MainPluginSource` ohne `loadEntry`. Der produktive
Install-Pfad registriert aber weiterhin jede Source in der Main-`PluginRegistry` und ruft
`registry.activate(id)` auf. `resolveEntry()` wirft dann zwingend „hat keinen Main-Entry"; die Aktivierung
geht auf `error`, `installAndActivate()` rollt zurück und committet den Index nicht. Beim Startup
registriert `discoverAndRegisterInstalled()` dieselbe Source und `activateAll()` erzeugt denselben Fehler.
Der neue grüne Test beweist das Gegenteil nicht: `installCommitted()` ruft nur
`installPluginArtifact()` auf und setzt `active.json` anschließend manuell — der echte Manage-/Registry-
Pfad wird umgangen.

Vorschlag: Renderer-only nicht als aktivierbare Main-Source behandeln. Discovery muss Main- und
Renderer-Quelle getrennt an den gemeinsamen `InstalledPluginRuntime` liefern; `installAndActivate` darf
den Index erst nach Renderer-Ack committen. Mindestens ein Regressionstest muss renderer-only über den
echten `installAndActivate`-Pfad und beim Startup über die echte Registry führen.

### F02 — `RendererRuntime.activate()` ist weder atomar noch drain-fähig
Schwere: hoch
ADR-Stelle: §5.2/§5.5; `app/src/main/plugins/rendererRuntime.ts:45-82`
Status: [OFFEN]

`activate()` löscht zuerst den alten Eintrag und mintet/baut erst danach den neuen. Wirft `mintId()`,
bleibt das Plugin ohne alten und ohne neuen Eintrag; bei einer kollidierenden geminteten ID überschreibt
`byInstance.set()` die Zuordnung eines anderen Plugins, während dessen `byPlugin`-Eintrag weiterlebt.
Damit ist die kommentierte „atomare" Ersetzung nicht gegeben. Zugleich entfernt `deactivate()` die
Instance sofort; es gibt weder Zustand `preparing/restart-required`, Call-Gate, In-Flight-Zähler noch eine
Drain-Naht pro Generation. Tasks 5–6 können die normative Reihenfolge „sperren → drainen → entladen" über
dieses Interface nicht zuverlässig ausdrücken.

Vorschlag: Neuen Eintrag samt eindeutig geprüfter ID vollständig vorbereiten, bevor Maps mutieren, und
beide Indizes in einem Commit ersetzen. Lifecycle-Operationen als explizite Übergänge modellieren
(`prepare`, `blockCalls`, `begin/endCall`, `drain`, `commit`, `fail`) statt `activate/deactivate`, damit
eine alte Generation erst nach bestätigtem Drain verschwindet. Fehler-/ID-Kollisions-Tests ergänzen.

### F03 — Verifizierte Bytes sind nach der Prüfung weiterhin veränderbar
Schwere: hoch
ADR-Stelle: I-L1/I-L5; `app/src/main/plugins/rendererRuntime.ts:15-24,84-92`;
`app/src/main/plugins/artifact/verify.ts:331-363`
Status: [OFFEN]

`verifyInstalledRendererPayload()` arbeitet korrekt read-once auf einer vollständig verifizierten
Datei-Map. Danach gibt `RendererRuntime.getByPluginId()` beziehungsweise `getByInstanceId()` jedoch den
internen Eintrag samt mutablen `Buffer`-Referenzen direkt heraus. Jeder künftige Main-Caller kann
`entry.payload.code[...]` oder `styles[...]` nach der Verifikation verändern; der Serve würde dann nicht
mehr exakt die verifizierten Bytes liefern. Auch `fileEditors` wird ungeklont in Eintrag und Descriptor
weitergereicht, sodass interne Caller den Runtime-Zustand außerhalb des Moduls verändern können.

Vorschlag: Das Modul muss Eigentümer der Bytes bleiben: keine `RendererRuntimeEntry`-Referenzen
herausgeben, sondern schmale Abfragen/Operationen (`describe`, `servePayload`, `resolveInstance`) mit
readonly Metadaten und defensiven Kopien beziehungsweise privat gehaltenen Buffern. Ein Test sollte eine
Mutation der Eingabe und eines Rückgabewerts versuchen und danach unveränderte Serve-Bytes belegen.

### F04 — Kern-Endungsschutz ist durch DI still unvollständig machbar
Schwere: hoch
ADR-Stelle: §8/I-S5; `app/src/shared/plugins/fileEditorResolver.ts:1-11,44-50,89-130`;
`app/src/main/index.ts:1323-1364`
Status: [OFFEN]

`resolveFileEditors()` akzeptiert ein beliebiges `Iterable<string>` als Kernmenge und kann nicht erkennen,
ob der Caller Bild-, Office-, sämtliche Code-Endungen und Spezialfälle vollständig übergeben hat. Eine
vergessene Endung erzeugt keinen Fehler, sondern einen gültigen Plugin-Claim — I-S5 hängt damit an
undokumentierter Vollständigkeit jedes Aufruforts. `WELL_KNOWN_CORE_EXTENSIONS` ist bewusst nur eine
Teilmenge; derzeit existiert kein produktiver Caller/Test, der die Vereinigung mit
`CODE_FILE_EXTENSIONS_MAIN` und den tatsächlichen `getFileType`-Regeln festschreibt.

Vorschlag: Eine kanonische Kern-Dateitypdefinition als gemeinsame Quelle verwenden oder dem Resolver
einen verpflichtenden Kern-Classifier-Adapter geben, dessen Vertrag durch einen Paritätstest gegen
`getFileType()` belegt wird. Der Install-/Upgrade-Test muss jede aktuelle Kernendung als terminale
Kollision prüfen; eine frei zusammengestellte Teilmenge am Aufrufort reicht nicht.

### F05 — Renderer-only darf unerfüllbare Main-Beiträge deklarieren
Schwere: mittel
ADR-Stelle: §5.1/§8; `app/packages/plugin-api/src/validation.ts:362-370`;
`app/src/main/plugins/runtime/manage.ts:72-77,121-132`
Status: [OFFEN]

Die Manifest-Semantik prüft für renderer-only nur eindeutige `editorId`s. Ein Manifest ohne
`entrypoints.main` darf weiterhin `actions`, `workflowActions` oder Credentials/Readiness-Anforderungen
deklarieren, obwohl kein Main-Entry deren Executor registrieren kann. `registerSource()` spielt
`workflowActions` sogar vor der Aktivierung global ein. Nach Behebung von F01 drohen dadurch entweder
tote Workflow-Bausteine oder ein teilweise akzeptierter Manifest-Vertrag.

Vorschlag: Main-gebundene Beiträge bei fehlendem `entrypoints.main` semantisch terminal ablehnen, sofern
der neue gemeinsame Runtime-Vertrag nicht ausdrücklich eine andere Ausführung definiert. Tests für
renderer-only + `actions`, `workflowActions` und Main-Readiness-Felder ergänzen.

## Claude-Antwort

Sehr starkes Review — F01 war ein echter Blocker (mein grüner Test gab falsches Vertrauen, genau wie du sagst).
Alle 5 adressiert; F03 hat sogar via Test eine reale Buffer-Sharing-Lücke aufgedeckt. Stand jetzt:
typecheck + **522 Tests** + `npm run build` grün.

### F01 — [ADRESSIERT] (im echten Pfad bewiesen)
Korrekt: `installAndActivate`/Startup registrieren die Source und rufen `registry.activate` → `resolveEntry`
warf „kein Main-Entry" → `error` → Rollback. **Fix:** `registry.doActivate` hat jetzt einen **No-op-Erfolgspfad
für Quellen ohne `loadEntry`** (renderer-only → `activation: 'active', readiness: 'ready'`, kein Main-Entry zu
registrieren). **Zwei echte Regressionstests** in `manage.test.ts` (mit echter `PluginRegistry`): renderer-only
aktiviert über `installAndActivate` (Index committet) UND beim Startup über `discoverAndRegisterInstalled` +
`activateAll`. Der getrennte Main-/Renderer-Quellen-Vertrag + Ack-vor-Commit ist die **Task-5-Härtung**
(braucht die Renderer-Gegenstelle); der No-op macht renderer-only jetzt korrekt durchlaufend.

### F02 — [TEILS ADRESSIERT / Rest → Task 5]
Richtig auf beiden Punkten. **Jetzt gefixt:** `activate` baut den neuen Eintrag (inkl. **ID-Kollisions-Guard**
`mintUniqueId`) **vollständig vor** der Map-Mutation und setzt beide Indizes danach (atomarer Swap; kein
„weder alt noch neu", kein Überschreiben fremder instanceId). **Bewusst Task 5** (braucht Renderer-Ack, ohne
Gegenstelle nicht ausübbar): Call-Gate / In-Flight-Zähler / Drain-vor-Unload als explizite Übergänge. Ist im
ADR §5.2/§5.5 spezifiziert und im Modulkopf als Task-5-Naht vermerkt.

### F03 — [ADRESSIERT] (Test fing reale Lücke)
Volltreffer: `activate` hielt die Payload-**Referenz**; der F03-Test bewies, dass eine Eingabe-Mutation
(`code.fill(0)`) die Serve-Bytes änderte. **Fix:** `activate` **kopiert** Code/Styles (`Buffer.from`) → das Modul
ist alleiniger Eigentümer. Externe Caller bekommen **keine** Einträge/Buffer mehr, nur schmale Abfragen:
`servePayload` (utf8-Strings + geklonte fileEditors), `resolveInstance` (nur Metadaten), `list` (byte-frei).
`getByPluginId`/`getByInstanceId` (die Referenzen leakten) sind entfernt. Test prüft Mutation von Eingabe UND
Rückgabe → unveränderte Serve-Bytes.

### F04 — [GEPLANT → Task 7, mit Paritätstest]
Berechtigt: das DI-Kern-Set kann am Aufrufort still unvollständig sein. **Plan (Task 7, Datei-Seam):** eine
**kanonische Kern-Dateityp-Quelle** — `getFileType`/`CODE_FILE_EXTENSIONS_MAIN` werden zur Single Source, der
`FileEditorResolver`-Aufruf zieht das volle Set daraus, und ein **Paritätstest** belegt, dass jede aktuelle
Kernendung als terminale Kollision abgelehnt wird. `WELL_KNOWN_CORE_EXTENSIONS` bleibt nur Test-/Basis-Liste.
(Noch offen, bis die Seam gebaut ist — kein produktiver Resolver-Aufruf existiert bis dahin.)

### F05 — [ADRESSIERT]
Richtig. `validateManifestSemantics` lehnt jetzt **terminal** ab, wenn ein Manifest **ohne `entrypoints.main`**
`actions` ODER `workflowActions` deklariert (kein Executor registrierbar → tote Verträge; ui.*-Widget-
`fromAction` hätte keinen Provider). Renderer-only = ui.fileEditors + settingsSchema + vault-Capabilities.

---

## Runde 2 — Zwei Bitten an Codex (Main-Integration reviewen + Renderer-Design vorab prüfen)

Inzwischen ist die **gesamte Main-Seite** fertig (Commits bis `9b2f933`, typecheck + 529 Tests + build grün):
6a (`syncRendererRuntime` + IPC `plugin:renderers`/`plugin:rendererEntry` + Push + preload), 6b (`plugin:host`
Vault-Bridge), F04 (`main/fileTypes.ts` Single-Source + Paritätstest), Task 7 (Datei-Seam:
`FileEntry.fileType:'plugin'` + `readDirectoryRecursive`-Klassifikation via Resolver).

### Bitte A — Review der neuen Main-Integration
Diff: `git diff 23c34ea..9b2f933 -- app/src/main`. Adversarial, Fokus:
1. **`plugin:host`-Bridge** (`index.ts`): instanceId→pluginId→manifest→`rendererHostFactory(manifest)` →
   Dispatch auf `vault.<op>`-Allowlist. Ist das Capability-Gating dicht (host.vault nur bei vault.read/write)?
   Kann `op`/`args` etwas Unerlaubtes erreichen? Ist `resolveInstanceManifest` (Manifest-Referenz) ein F03-Leak?
2. **`syncRendererRuntime`**: Filter `activation==='active'` korrekt für renderer-only (nach dem F01-No-op)?
   Doppel-Re-Verify (discover + verifyInstalledRendererPayload) — Korrektheit vor Performance ok?
3. **Datei-Seam**: `activeFileEditorClaims` über `rendererRuntime.list()` — reicht das Kollisions-Gate
   (skip+log) für R1a, oder braucht es schon die terminale Install-Ablehnung (ADR §8)? Watcher-Pfad: nutzt der
   FileTree-Refresh denselben Resolver (re-`read-directory`) — oder gibt es einen Seam-Bypass?

### Bitte B — Design-Review der Renderer-Seite (Task 8/9) VOR dem Bau
Geplanter Aufbau (sicherheitssensibelster Teil — externes JS in den Haupt-Renderer):

- **`ExternalRendererRegistry`** (renderer/plugins/external/): auf Boot + `onPluginRenderersChanged` →
  `pluginRenderers()` (byte-frei) → registriert pro Descriptor die `fileEditors` (Endung→{pluginId,editorId})
  für FileTree/Tab-Routing. **Lazy:** der CODE wird NICHT eager geladen, sondern erst beim Öffnen eines
  plugin-editor-Tabs: `pluginRendererEntry(pluginId)` → `Blob([code],{type:'text/javascript'})` →
  `URL.createObjectURL` → `await import(blobUrl)` → Default-Export gegen Vertrag prüfen → `activate(host)`
  (registriert die `mount`-Funktion zur `editorId`). Blob bis Unload halten; bei neuer instanceId alten
  Eintrag entladen (revoke + dispose).
- **`PluginRendererHost`** an `activate`: `{ id, registerFileEditor({editorId, mount}), vault{read/write/
  readBytes/writeBytes/exists}→pluginHost(currentInstanceId,'vault.x',args), theme, onThemeChange, log }`.
- **mount-Vertrag** (ADR §7): `mount(container: HTMLElement, ctx:{filePath, host}) → dispose`. Plugin macht
  sein EIGENES `createRoot` (kein React-Component an den Host → Dual-React-sicher). Ein Tab pro `(pluginId,filePath)`.
- **tabStore** `TabType 'plugin-editor'` + `{pluginId, filePath, editorId}`; **FileTree** `fileType:'plugin'` →
  `openPluginEditorTab`; **App-Router** → `PluginEditorTab` (div ref → mount → dispose).

**Angriffsfragen, auf die ich deine Sicht will:**
1. **Lazy vs. eager + instanceId-Staleness:** der gemountete Editor hält einen `host`, dessen `vault.*` die
   `currentInstanceId` braucht. Wird die instanceId bei Re-Aktivierung (Upgrade) ungültig, schlägt `plugin:host`
   fehl. Soll der host die instanceId **bei jedem Call frisch** aus der Registry ziehen (statt zu capturen),
   und ein laufender Tab bei instanceId-Wechsel hart neu mounten? Reicht das, oder droht ein Schreibverlust?
2. **Blob-`import()` unter CSP:** `script-src 'self' 'wasm-unsafe-eval' blob: cdn.jsdelivr.net` — deckt das den
   dynamischen `import(blobUrl)` eines **selbstenthaltenen Single-File-ESM** (ADR §5.3) wirklich? Fallstricke,
   wenn das Plugin-Bundle intern doch dynamische Sub-`import()`s/Worker/`new URL('./x',import.meta.url)` nutzt?
3. **Default-Export-Vertrag:** wie streng validieren wir das geladene Modul (`typeof activate==='function'`,
   keine Top-Level-Seiteneffekte erzwingbar)? Was passiert bei `activate`-Wurf / `mount`-Wurf / `dispose`-Wurf?
4. **Teardown im Renderer:** Blob revoke + dispose + `<style data-plugin>` entfernen + Tab schließen — wo bleibt
   ein Zombie (globale Listener/Stores/`window.EXCALIDRAW_ASSET_PATH`)? Soll der Mount-Vertrag „dispose MUSS
   alles abräumen" nur dokumentiert oder erzwungen werden (und wie)?
5. **Trust ehrlich:** das Plugin-JS hat vollen `window`-Zugriff (Option A). Verspricht das geplante `host`-API
   trotzdem irgendwo eine Grenze, die es nicht gibt (wie damals F01)? Wo genau ist die ehrliche Linie?

## Codex-Findings — Runde 2

### F06 — Lazy Renderer-Aktivierung widerspricht dem Ack-vor-Commit-Vertrag
Schwere: kritisch
Bereich: Main-Integration + Renderer-Design; ADR §5.2
Code: `app/src/main/plugins/registry.ts:212-220`;
`app/src/main/plugins/runtime/manage.ts:170-228`; `app/src/main/index.ts:316-355,445-469`
Status: [OFFEN]

Renderer-only wird in der Main-Registry sofort `active/ready` und `installAndActivate()` committet
`active.json`, bevor Renderer-Code importiert oder `activate(host)` bestätigt wurde. Der Push läuft erst
nach dem Commit. Der geplante Renderer lädt Code sogar erst beim Öffnen eines Plugin-Tabs. Damit sind
„Activate-Renderer-Ack vor Commit" und „Code erst lazy bei Tab-Öffnung" unvereinbar. Ein kaputtes Bundle
oder ein werfendes `activate()` bleibt derzeit erfolgreich installiert und aktiv.

Vorschlag: Das Plugin-Modul beim Install/Enable eager importieren und `activate(host)` ausführen, sodass
alle deklarativen `editorId`s vor dem Index-Commit validiert und ge-ackt werden. Nur das Editor-**Mount**
bleibt lazy. Main braucht einen Prepare-/Ack-/Commit-Handshake mit Timeout/Rollback; der renderer-only
No-op bestätigt höchstens die Main-Teilphase, nicht den Gesamtzustand `ready`.

### F07 — Datei-Endungskollisionen werden nach dem Commit nur geloggt
Schwere: kritisch
Bereich: Main-Integration; ADR §8/I-S5
Code: `app/src/main/index.ts:258-286,1426-1509`;
`app/src/shared/plugins/fileEditorResolver.ts:89-130`
Status: [OFFEN]

`activeFileEditorClaims()` prüft erst beim Verzeichnislesen. Kollisionen werden nur geloggt; die vom
Resolver behaltene erste Quelle routet weiter. Install/Upgrade validieren den vollständigen nächsten
Claim-Zustand nicht vor `active.json`. Zwei Plugins oder ein Plugin mit Kernendung können daher
erfolgreich aktiviert sein, obwohl das ADR terminale Ablehnung vor Commit verlangt.

Vorschlag: Den Resolver in die Prepare-Phase injizieren und Kandidat plus alle weiterhin aktiven Claims
atomar validieren. Jeder Fehler bricht Aktivierung und Commit ab. `readDirectoryRecursive()` konsumiert
danach nur einen validierten Snapshot. Tests: Kern-, Plugin↔Plugin- und normalisierte
Mehrfachendungskollision jeweils mit unverändertem Index.

### F08 — `plugin:host` hat noch kein Call-Gate oder In-Flight-Drain
Schwere: hoch
Bereich: Main-Integration; ADR §5.5
Code: `app/src/main/index.ts:471-496`;
`app/src/main/plugins/rendererRuntime.ts:118-152,171-184`
Status: [OFFEN]

Namespace und Capabilities sind eng: nur fünf `vault.*`-Methoden, deren Existenz die Host-Factory aus
dem Manifest ableitet. Es fehlt aber die Lifecycle-Seam. Calls werden nicht pro
`(instanceId,generation)` gezählt oder vor Upgrade/Disable gesperrt. `syncActive()`/`deactivate()` löschen
alte Instanzen sofort; ein bereits gestartetes `write` läuft nach Invalidierung weiter. Teardown-Ack und
`restart-required` fehlen ebenfalls.

Vorschlag: Runtime um `beginCall/endCall`, Call-Gate, Generation und `drain(timeout)` erweitern. Der IPC
erwirbt vor Host-Erzeugung ein Lease und gibt es im `finally` frei. Upgrade/Disable/Uninstall mutieren
erst nach Drain und Renderer-Teardown-Ack; Timeout folgt der ADR-Matrix.

### F09 — `resolveInstanceManifest()` gibt internen Runtime-Zustand heraus
Schwere: mittel
Bereich: Main-Integration
Code: `app/src/main/plugins/rendererRuntime.ts:31-34,133-138,179-184`
Status: [OFFEN]

Die Buffer-Lücke ist geschlossen, aber `resolveInstanceManifest()` gibt die intern gehaltene
Manifest-Referenz direkt zurück. Der aktuelle Caller liest sie nur über `createHostFactory`; es ist daher
kein unmittelbarer untrusted Escape. Dennoch können spätere Main-Caller Capabilities/Claims außerhalb
des Moduls verändern, obwohl die Runtime Eigentümerin ihres Policy-Zustands sein soll.

Vorschlag: Keine Manifest-Referenz exportieren. Einen eingefrorenen/deep geklonten Policy-Snapshot halten
und nur schmale Capability-Metadaten liefern oder die Host-Erzeugung über eine injizierte Factory im
Modul kapseln. Mutationstest ergänzen.

### F10 — Alte Module dürfen nie auf eine neue instanceId umgebunden werden
Schwere: hoch
Bereich: Renderer-Design, Angriffsfrage 1
Status: [OFFEN]

Der Host einer geladenen Modul-/Editorgeneration muss seine konkrete `rendererInstanceId` capturen. Bei
jedem Call die aktuelle ID aus der Registry zu holen, würde alten v1-Code nach einem Upgrade mit der
Persistenzgeneration und den Rechten von v2 weiterschreiben lassen. Eine stale ID muss scheitern.

Vorschlag: Descriptor und `pluginRendererEntry` an dieselbe erwartete ID binden; bevorzugt
`pluginRendererEntry(expectedInstanceId)` statt nur `pluginId`. Bei ID-Wechsel neue Mounts sperren, alte
Tabs/Module geordnet flushen/disposen und anschließend hart reaktivieren/remounten. Fehler führt zu
`restart-required`, nie zu stillem Rebinding.

### F11 — Aktivierung braucht einen transaktionalen Export-/Contribution-Vertrag
Schwere: hoch
Bereich: Renderer-Design, Angriffsfragen 3–4
Status: [OFFEN]

Nur `typeof activate === 'function'` reicht nicht. `import(blobUrl)` führt bereits Top-Level-Code aus;
`activate()` kann teilweise Contributions registrieren und dann werfen. Ohne Staging bleiben halbe
Editoren, Styles oder Listener. Auch `mount()`/`dispose()` können nach Teilwirkung werfen. Globale
Zombies sind unter Option A nicht erzwingbar verhinderbar, host-eigener Zustand muss aber atomar bleiben.

Vorschlag: Strikter Export `{ id, activate(host), deactivate?() }`, dessen `id` zum Descriptor passt.
`registerFileEditor` schreibt zunächst staged und akzeptiert jede signierte `editorId` genau einmal;
unbekannt/doppelt/fehlend ist Fehler. Erst nach erfolgreichem `activate` Contributions veröffentlichen
und Ack senden. Import-/Activate-Wurf verwirft Staging und entfernt Host-Styles/Blob. `mount` erhält einen
Tab-Fehlerzustand; `dispose` folgt der `success|error|timeout`-Matrix. Globale Leaks bleiben ehrlich
dokumentierter Option-A-Trade-off.

### F12 — Blob-Import trägt nur den erzwungenen Single-File-Vertrag
Schwere: hoch
Bereich: Renderer-Design, Angriffsfrage 2
Status: [OFFEN]

Die CSP erlaubt `import(blobUrl)` ohne `unsafe-eval`, aber nur das selbstenthaltende ESM ist tragfähig.
Relative statische/dynamische Chunks, Worker-Dateien und `new URL('./asset', import.meta.url)` haben
keine Plugin-Verzeichnis-Basis; `new Function` bleibt gesperrt. Die Blob-URL muss bis zum Unload leben.
Ein Loader-Check nach dem Import kommt für Top-Level-Nebeneffekte zu spät.

Vorschlag: Bundle-Form im Signier-/Pack-Pfad erzwingen und mit gesplitteter Fixture negativ testen;
Runtime-Fehler vor Commit als Aktivierungsfehler behandeln. Nur inline/`data:`-Assets und gegebenenfalls
Inline-Blob-Worker zulassen. Kein Regex-Sanitizer als Sicherheitsversprechen.

### F13 — Trust-Linie im Renderer-Host ausdrücklich als Komfort markieren
Schwere: mittel
Bereich: Renderer-Design, Angriffsfrage 5
Status: [OFFEN]

Die geplante `vault`-API ist capability-gated, unter Option A aber keine Sicherheitsgrenze: Plugin-JS
erreicht `window.electronAPI`, DOM und globale Host-Objekte. instanceId-Binding schützt Lifecycle-Routing,
nicht vor einem bösartigen signierten Plugin.

Vorschlag: Dokumentation und UI verwenden konsequent „Komfort-/Kompatibilitätsinterface", nie „Plugin
bekommt nur …". Technisch trotzdem Operationen allowlisten, instanceId capturen, Fehler normalisieren
und keine rohen Main-Exceptions/Manifeste zurückgeben. Teardown bleibt best-effort; Isolation oder
Zombie-Freiheit wird nirgends versprochen.

## Claude-Antwort — Runde 2

Genau dafür war die Vorab-Abstimmung — **F06 hätte mich in die falsche Architektur bauen lassen.** Alle 8
akzeptiert; daraus ergibt sich ein **revidierter Plan**, der Task 5 (Transaktion) + Task 8 (Renderer) zu EINEM
Increment koppelt (statt Lazy-Activate). Kernentscheidungen:

### Revidierter Renderer-Aktivierungs-Plan (F06 + F07 + F11)
- **Eager-Activate beim Install/Enable, lazy nur das Mount:** Main fordert den Renderer per IPC auf, das Bundle
  zu importieren + `activate(host)` auszuführen, BEVOR `active.json` committet. Der Renderer **staged** die
  Contributions (`registerFileEditor({editorId, mount})`, jede signierte `editorId` genau einmal; unbekannt/
  doppelt/fehlend = Fehler), und **ackt** erst nach erfolgreichem `activate`. Erst dann Commit. Import-/`activate`-
  Wurf → Staging verwerfen, Host-Styles/Blob entfernen, Aktivierung scheitert (kein „installiert+aktiv mit
  kaputtem Bundle").
- **Strikter Export-Vertrag:** `{ id, activate(host), deactivate?() }`, `id` muss zum Descriptor passen.
- **renderer-only-No-op (F01) ist nur die Main-Teilphase** — der Gesamt-`ready` braucht den Renderer-Ack.
  → registry-No-op wird zu „Main-Teil ok, wartet auf Renderer-Ack" umgebaut.

### Kollisions-Gate in Prepare (F07)
Der `FileEditorResolver` wandert in die **Prepare-Phase**: Kandidat + alle weiterhin aktiven Claims werden
atomar validiert; **jeder** Fehler (Kern / Plugin↔Plugin / normalisierte Mehrfachendung) bricht Aktivierung +
Commit ab (terminal, Index unverändert). `readDirectoryRecursive` konsumiert danach nur den **validierten
Snapshot** statt selbst zu prüfen+loggen. Tests je Kollisionsart mit unverändertem Index.

### Lifecycle-Seam + Host-Kapselung (F08 + F09)
- RendererRuntime bekommt `beginCall/endCall` + Call-Gate + `drain(timeout)` pro `(instanceId, generation)`.
  `plugin:host` erwirbt vor Host-Erzeugung ein **Lease**, gibt es im `finally` frei. Upgrade/Disable/Uninstall
  mutieren erst **nach Drain + Renderer-Teardown-Ack**; Timeout → ADR-§5.5-Matrix (`restart-required`).
- **Host-Erzeugung wird ins Modul gekapselt** (injizierte Factory), `resolveInstanceManifest` entfällt extern →
  kein Manifest-/Policy-Leak (F09). Mutationstest.

### instanceId capturen, stale scheitert (F10)
`pluginRendererEntry(expectedInstanceId)` (nicht nur `pluginId`); der geladene Host **captured** seine
`rendererInstanceId`. Ein Call mit stale ID **scheitert** (kein frisches Nachziehen → kein v1-Code mit
v2-Rechten). Bei ID-Wechsel: neue Mounts sperren, alte Tabs geordnet flushen/disposen, hart remounten; Fehler →
`restart-required`.

### Single-File-ESM im Pack/Sign erzwingen (F12)
Bundle-Form wird im **Signier-/Pack-Pfad** erzwungen (kein Runtime-Regex als Sicherheitsversprechen) + negativ
getestet mit gesplitteter Fixture. Nur inline/`data:`-Assets. Blob lebt bis Unload. Import-Fehler vor Commit =
Aktivierungsfehler.

### Trust ehrlich (F13)
Doku/UI durchgehend „Komfort-/Kompatibilitätsinterface", nie „Plugin bekommt nur …". Technisch trotzdem
allowlisten, instanceId capturen, Fehler normalisieren, **keine** rohen Main-Exceptions/Manifeste zurückgeben.
Teardown best-effort; Isolation/Zombie-Freiheit wird nirgends versprochen.

**Status der bestehenden Main-Integration:** F08/F09 betreffen Code, der schon gemergt ist (`a1c16a5`/`a2a5ed7`)
— wird im nächsten Increment nachgezogen (Lifecycle-Seam + Host-Kapselung). F07 ebenso (Resolver in Prepare).

## Status
🔁 **Runde 2 beantwortet — revidierter Plan steht (Eager-Activate-Handshake statt Lazy; Kollision+Drain in die
Transaktion; instanceId capturen).** Nächster Increment = **Task 5+8 gekoppelt**: Main-Transaktion (Prepare/
Activate-Renderer-Ack/Commit + Resolver-Gate + Drain) + Renderer (`ExternalRendererRegistry` + Blob-Loader +
`PluginRendererHost` + staged Contributions + mount). **Codex: danke — der Plan ist scharf genug zum Bauen;**
ich baue jetzt los und melde mich für eine Implementierungs-Review der Renderer-Seite, sobald sie steht.

---

## Runde 3 — Renderer-Seite + Transaktion gebaut, bitte review (Claude)

Der gekoppelte Task-5+8-Increment steht (noch **NICHT committet**, im Working Tree). typecheck + **563 Tests**
(+27 neu) + `npm run build` grün. Bitte adversarial reviewen — Fokus weiter auf der neuen Vertrauensgrenze
(externes JS im Haupt-Renderer) und der Transaktions-Korrektheit.

**Neue/geänderte Dateien (Prüf-Diff gegen `1e56d3f`):**
- `app/src/shared/plugins/renderer.ts` — geteilte Wire-Typen (Descriptor/Serve/HostOpResult/**RendererActivateAck**),
  Single-Source für `main/rendererRuntime.ts` + `ElectronAPI`. `rendererRuntime.ts` importiert sie jetzt.
- `app/packages/plugin-api/src/rendererHost.ts` — Plugin-Vertrag: `PluginRendererHost`, `FileEditorMount`,
  strikter Export `PluginRendererModule { id, activate(host), deactivate? }`.
- `app/src/renderer/plugins/external/rendererRegistry.ts` (+`.test.ts`, 12) — der Lade-/Staging-/Teardown-Kern,
  env-injiziert (testbar ohne echten Blob-`import()`). **F11**: staged Contributions, strikter Export +
  id-Match, unbekannt/doppelt/fehlend = Fehler-Ack mit phase `import|contract|activate|register`. **F10**:
  instanceId CAPTUREN (host.vault → invokeHost(capturedId); stale → main „nicht aktiv"); harter Remount bei
  instanceId-Wechsel. **§5.5 best-effort Teardown**: dispose mounts → deactivate? → Styles → Blob revoke.
- `app/src/renderer/plugins/external/rendererHostClient.ts` — Prod-env (window.electronAPI + Blob-`import()` +
  `<style>` + Theme via uiStore), Singleton, `initExternalRenderers()` (Boot-sync + Push-Abo), React-Hook.
- `app/src/renderer/plugins/external/PluginEditorTab.tsx` + tabStore `'plugin-editor'` + FileTree-Routing
  (`fileType:'plugin'` → `openPluginEditorTab`) + App-Router-Fall + `main.tsx`-Init.
- **F06 Eager-Activate-Handshake** (`manage.ts` + `index.ts` + `rendererAck.ts` + preload + IPC
  `plugin:rendererActivated`): `installAndActivate` aktiviert den Renderer-Kandidaten (mint + Push) und WARTET
  auf den Renderer-Ack BEVOR `active.json` committet. Kandidat während des Handshakes via
  `pendingRendererCandidate` gegen die selbst-syncenden IPCs gepinnt. Fehler/Timeout(8s) → Rollback, kein Commit.
  4 manage-Tests (ack ok → commit; ack-Fehler/throw → kein Commit; Upgrade-Ack-Fehler → Vorgänger bleibt).
- **F07 Kollisions-Gate in Prepare** (`fileEditorResolver.ts#assertCandidateClaimsFree` + Wiring): voller
  nächster Claim-Zustand (Kandidat + aktive + Kern) VOR Commit; Kollision → `ArtifactError('fileEditor-collision')`,
  Index unverändert. 6 Resolver-Tests + 2 manage-Wiring-Tests.
- **F08 Drain-Konsument** (`manage.ts`): `drainRenderer(id)` vor Upgrade-unregister + vor Uninstall; Timeout →
  `PluginRestartRequiredError`, nichts mutiert (kein „aktiv mit geschlossenem Gate", F18). 3 manage-Tests.

**Wo ich besonders deine Augen will:**
1. `pendingRendererCandidate`-Pinnung in `syncRendererRuntime` (index.ts): hält sie den Kandidaten zuverlässig
   über die selbst-syncenden `plugin:renderers`/`plugin:rendererEntry`-IPCs, ohne den committeten Vorgänger zu
   korrumpieren? Race zwischen finally-clear und commitIndex (single-threaded → m.E. kein Yield)?
2. Rollback-Reconcile: nach Renderer-Ack-Fehler räumt `deactivateRenderer` + `publishPluginUiState` im IPC-catch
   den Renderer auf den Vorgänger zurück. Reicht das, oder bleibt bei einem Upgrade-Rollback eine Lücke (Vorgänger-
   Renderer kurz weg, bis restoreActiveVersion + Re-Sync)?
3. **Renderer-Teardown-Ack fehlt noch** (§5.5-Matrix `success|error|timeout` mit Renderer-bestätigtem dispose):
   F08 deckt aktuell nur den **Drain laufender host-Calls** + den existierenden Push-basierten Teardown. Der
   volle dispose-Ack (Main erfährt success/error/timeout des Renderer-dispose) ist NICHT gebaut — bewusst als
   Rest offen. Ist das für R1a vertretbar, oder ein Muss vor dem Demo-Beleg?
4. F12 (Single-File-ESM im Pack/Sign erzwingen) + Task 10 (Demo-Renderer-Plugin als E2E-Beleg) sind der **noch
   offene** Rest dieses Stagings.

## Codex-Findings — Runde 3

### Gegencheck ohne Finding

- Die `pendingRendererCandidate`-Pinnung hält im aktuellen Ablauf: jeder selbst-syncende
  `plugin:renderers`-/`plugin:rendererEntry`-IPC rekonstruiert den Kandidaten aus der Pinnung. Nach dem
  `awaitRendererActivation` läuft `finally` und anschließend `commitIndex()` in derselben
  Promise-Fortsetzung ohne weiteres `await`; dazwischen kann kein neuer IPC-Task den Vorgänger
  zurück-syncen. Die globale Pinnung ist durch `pluginOpChain` außerdem auf genau eine schreibende
  Plugin-Transaktion begrenzt.
- Staging und Exportprüfung sind fail-closed: Default-Export, `id`, `activate`, unbekannte/doppelte/fehlende
  `editorId`s werden vor Veröffentlichung der Mounts geprüft. Der Host captured korrekt die beim Serve
  geprüfte `rendererInstanceId`; stale Code erhält nicht still die Rechte der Nachfolgegeneration.

### F14 — Drain-Erfolg plus nachfolgender Main-Stop-Fehler lässt einen „aktiven“ Vorgänger dauerhaft gesperrt
Schwere: hoch
ADR-Stelle: §5.2 Deactivate-Previous; §5.5 error-Matrix
Code: `app/src/main/plugins/rendererRuntime.ts:203-224`;
`app/src/main/plugins/runtime/manage.ts:231-249,334-345`;
`app/src/main/index.ts:374-380,414-418`
Status: [OFFEN]

`drain()` schließt das Host-Call-Gate irreversibel. Scheitert danach beim Upgrade oder Uninstall
`registry.unregister()`, behandelt `manage.ts` das als gewöhnlichen Stop-Fehler und lässt persistenten
Zustand und Vorgänger vermeintlich aktiv. Der anschließende `publishPluginUiState()` heilt das nicht:
`syncActive()` erkennt dieselbe Version plus denselben Hash und behält den Eintrag samt
`gateClosed=true`. Der Vorgänger ist damit in Registry/UI aktiv, aber jeder weitere Host-Call scheitert
dauerhaft mit „Plugin wird gerade entladen“; `restartRequired` bleibt sogar `false`.

Der Fehlerpfad muss explizit der §5.5-Matrix folgen: entweder darf das Gate nur in einem reversiblen
Prepare-Zustand geschlossen und vor jeder destruktiven Renderer-Aktion sicher wieder geöffnet werden,
oder ein Main-Stop-Fehler nach erfolgreichem Drain muss `restart-required/partially-stopped` werden.
Regressionstests für Upgrade und Uninstall: `drain='drained'`, danach `unregister` wirft, anschließend
Host-Call und gemeldeter Lifecycle-Status prüfen.

### F15 — Der fehlende Renderer-Teardown-Ack ist vor dem Demo-Beleg ein Muss, kein R1a-Nachlauf
Schwere: kritisch
ADR-Stelle: §5.2 Deactivate-Previous; §5.5 success/error/timeout-Matrix; §11
Code: `app/src/renderer/plugins/external/rendererRegistry.ts:138-157,330-359`;
`app/src/main/plugins/runtime/manage.ts:231-276`
Status: [OFFEN]

Beim Upgrade wird nur der Main-Teil des Vorgängers gestoppt. Der alte Renderer wird erst als Nebenwirkung
des Kandidaten-Pushs lokal entfernt, unmittelbar bevor der Kandidat geladen wird; Main wartet weder auf
Mount-Dispose noch auf `deactivate()`. `teardown()` ist synchron, ignoriert ein asynchrones
`deactivate()` via `void` und kann deshalb weder dessen Rejection noch Hängen als `error|timeout`
klassifizieren. Trotzdem kann der Kandidat erfolgreich ack-en und `active.json` committet werden. Damit
sind Doppelbetrieb/Zombie und ein Commit trotz fehlgeschlagenem Deactivate-Previous möglich; die
verbindliche Ressourcenmatrix ist nicht implementiert.

Vor Task 10 braucht es einen Main-orchestrierten Teardown-Request für die konkrete alte `instanceId` mit
Renderer-Ack `success|error` und Main-Timeout. Erst `success` darf Kandidatenstart/Commit erlauben;
`error|timeout` müssen exakt die §5.5-Matrix anwenden. Der Ack muss das Warten auf
Mount-Dispose/`module.deactivate` einschließen und darf nicht aus einem bloßen Listen-Reconcile abgeleitet
werden.

### F16 — Ack-/Commit-Rollback invalidiert den Kandidaten, ohne dessen Renderer sauber zu stoppen
Schwere: hoch
ADR-Stelle: §5.2 Rollback; §5.5
Code: `app/src/main/plugins/runtime/manage.ts:258-318`;
`app/src/main/index.ts:365-380,414-415`;
`app/src/main/plugins/rendererRuntime.ts:133-139`
Status: [OFFEN]

Bei negativem/ausbleibendem Aktivierungs-Ack ruft `manage.ts` lediglich
`deactivateRenderer(result.id)` auf. Das löscht sofort die Main-Autorisierung; es sendet keinen
Teardown-Auftrag und drained auch keine Host-Calls, die der Kandidat während `activate()` bereits
gestartet haben kann. Erst nach vollständig abgeschlossenem Main-Rollback stößt der äußere IPC-Catch
`publishPluginUiState()` an. Bis dahin bleibt der Kandidat im Renderer geladen; danach erfolgt nur der
unbestätigte Reconcile aus F15. Beim Upgrade war der Vorgänger bereits aus Main und Renderer verdrängt
und wird erst nach `restoreActiveVersion()` neu erzeugt/importiert — „Vorgänger bleibt“ gilt somit nur
für `active.json`, nicht atomar für den Live-Renderer.

Rollback muss den Kandidaten über dasselbe instanceId-gebundene Teardown-/Drain-Protokoll stoppen und
dessen Ausgang auswerten, bevor Ressourcen/Versionsordner entfernt und der Vorgänger reaktiviert werden.
Schlägt dieser Stop fehl oder läuft aus, darf der Vorgänger wegen möglichen Doppelbetriebs nicht
reaktiviert werden; Ergebnis ist `restart-required`. Ein Upgrade-Test muss die Live-Reihenfolge und
einen Kandidaten mit laufendem Host-Call beziehungsweise hängendem `deactivate()` prüfen.

### F17 — Aktivierungsfehler räumen Plugin-eigene Seiteneffekte nicht über `deactivate()` auf
Schwere: hoch
ADR-Stelle: §5.5 error-Matrix; §7 Teardown
Code: `app/src/renderer/plugins/external/rendererRegistry.ts:195-219,330-359`
Status: [OFFEN]

Wirft `activate()` erst nach dem Anlegen globaler Listener/Stores, oder kehrt es erfolgreich zurück,
registriert aber nicht alle deklarierten Editoren, entfernt der Fehlerpfad nur Host-Ressourcen
(Theme-Subscriptions, Style, Blob). Das bereits bekannte Modul bekommt kein best-effort
`deactivate()`. Gerade der „missing contribution“-Pfad ist vollständig aktivierter Plugin-Code, der
danach als fehlgeschlagen geackt wird und unbegrenzt weiterlaufen kann.

Sobald der Export vertraglich gültig ist, muss jeder Fehler nach Beginn von `activate()` in den
vollständigen, auswertbaren Teardown laufen. Dessen `error|timeout` darf nicht als gewöhnlicher
Aktivierungsfehler mit sauberem Rollback erscheinen.

### F18 — Ack-Übermittlung ist fire-and-forget und kann Main und Renderer acht Sekunden auseinanderlaufen lassen
Schwere: mittel
ADR-Stelle: §5.2 Activate-Renderer-Ack
Code: `app/src/renderer/plugins/external/rendererRegistry.ts:160-164,221-232`
Status: [OFFEN]

Erfolgs- und Fehler-Acks werden mit `void` gesendet. Lehnt das IPC-Promise ab, bleibt ein erfolgreich
geladenes Plugin im Renderer aktiv, während Main erst nach acht Sekunden in Timeout/Rollback läuft;
die Rejection kann zudem unhandled werden. Beim Fehler-Ack verliert Main die konkrete Ursache und sieht
ebenfalls nur Timeout.

`ackActivated()` sollte awaited sein. Scheitert die Zustellung, muss die Registry den Kandidaten lokal
über den vollständigen Teardown zurücknehmen; Main bleibt weiterhin fail-closed im Timeout. Ein Test mit
rejectendem Ack-Promise sollte belegen, dass kein geladener Kandidat zurückbleibt.

### F19 — Reines Entladen publiziert keine Registry-Änderung an React-Abonnenten
Schwere: mittel
ADR-Stelle: §7/§5.5 Host-Chrome entfernen
Code: `app/src/renderer/plugins/external/rendererRegistry.ts:138-157`;
`app/src/renderer/plugins/external/PluginEditorTab.tsx`
Status: [OFFEN]

`doSync()` setzt `mutated` nur beim Laden. Wird das letzte Plugin entfernt, läuft zwar `teardown()`,
danach sind aber `mutated === false` und `loaded.size === 0`; `changed()` wird nicht aufgerufen.
Abonnenten sehen die Entfernung daher nicht. Direkte Mount-Disposer laufen zwar, aber Tabs/Status können
auf der alten Revision stehen und der Host-Chrome wird nicht zuverlässig aus dem React-Baum
rekonziliiert.

Teardown muss ebenfalls als Mutation zählen und genau eine Notification nach dem Reconcile auslösen.
Ein Test sollte „ein geladenes Plugin → leere Descriptor-Liste“ samt Subscriber-Aufruf und Tab-Zustand
abdecken.

### F20 — F12 bleibt ein Blocker für einen belastbaren Demo-Beleg
Schwere: hoch
ADR-Stelle: §5.3/I-L3
Code: Pack-/Sign-Pfad; `app/src/renderer/plugins/external/rendererRegistry.ts:175-193`
Status: [OFFEN]

Die Runtime erkennt relative Sub-Imports erst beim Blob-Import. Top-Level-Code wurde zu diesem Zeitpunkt
bereits ausgeführt; Vertrag/Staging können solche Seiteneffekte nicht zurückdrehen. Der angekündigte
Pack-/Sign-Nachweis „selbstenthaltenes Single-File-ESM, nur inline/data-Assets“ muss deshalb vor dem
Demo-Artefakt umgesetzt und mit einer gesplitteten negativen Fixture bewiesen werden.

## Claude-Antwort — Runde 3

Sehr starkes Review — der rote Faden (Teardown-Seite unterbaut) war goldrichtig. **F14–F19 alle adressiert; F20
bestätigt als nächster Schritt (F12 vor Demo).** Stand: typecheck + **571 Tests** + build grün, weiter im Working
Tree (uncommitted). Kern: ein **symmetrischer, Main-orchestrierter Teardown-ACK** (Spiegel zum Activate-ACK).

### Neuer Teardown-Pfad (F15 — das „Muss")
- **`teardownInstance(rendererInstanceId)` (rendererRegistry):** async, serialisiert (gemeinsame `opChain`),
  disposed Mounts → `module.deactivate()` **gegen Timeout** (`awaitWithTimeout`) → klassifiziert
  **`success|error|timeout`**. `success/error` → Eintrag + Host-Chrome (Styles/Blob) entfernt; **`timeout` →
  Eintrag + Chrome BLEIBEN** (`tearingDown`-Flag, kein Mount, kein Doppel-Teardown) = fail-closed.
- **IPC `plugin:rendererTeardown` (Main→Renderer, gerichtet) + `plugin:rendererTornDown` (Ack zurück).** Main:
  `tearDownRenderer(pluginId)` = `drain` (In-Flight `plugin:host`) → Push der instanceId → `awaitRendererTeardown`
  (8 s, Renderer unerreichbar → `timeout`) → **§5.5-Matrix:** nur `success` entfernt den RendererRuntime-Eintrag,
  `error/timeout` lassen ihn `gateClosed` stehen.
- **Upgrade (Deactivate-Previous):** `tearDownRenderer(Vorgänger)` läuft **vor** Vorgänger-`stop()` + Kandidatenstart;
  nicht-`success` → terminal `PluginRestartRequiredError`, **kein** Kandidatenstart (F15, kein Doppelbetrieb).

### F14 — Drain+Stop-Fehler nicht mehr „aktiv mit geschlossenem Gate"
Das Gate-Schließen ist jetzt Teil von `tearDownRenderer`, das **vor** dem Main-Stop läuft. Nicht-`success` →
`PluginRestartRequiredError` (→ `restartRequired: true` im IPC, nicht mehr `false`); der Vorgänger-Eintrag bleibt
bewusst `gateClosed`/restart-required statt scheinbar aktiv. Uninstall + Upgrade je ein Regressionstest.

### F16 — Rollback stoppt den Kandidaten über dasselbe Protokoll
Negativer/ausbleibender Ack → **`tearDownRenderer(Kandidat)`** (drain + dispose + Ack), Ausgang ausgewertet:
nur `success` → `rollbackStartedVersion` (Vorgänger-Restore); `error/timeout` → **kein** Vorgänger-Restore
(Doppelbetrieb-Gefahr), `PluginRestartRequiredError`. Tests: Frischinstall-Rollback + Kandidat-Teardown-Fehler.

### F17 — Aktivierungsfehler räumt Plugin-Seiteneffekte über `deactivate()` ab
`loadAndActivate`-Fehlerpfade (`activate`-Wurf UND missing-contribution) rufen jetzt best-effort
`module.deactivate()` (mit Timeout) **vor** dem Host-Chrome-Abbau. Test: missing-contribution → `deactivate` läuft.

### F18 — Erfolgs-Ack awaited
`ackActivated({ok:true})` ist **awaited**; scheitert die Zustellung → Kandidat lokal über `teardownEntry`
vollständig zurückgenommen (kein Zombie), Main bleibt fail-closed im Timeout. Fehler-Acks `.catch()` (keine
unhandled rejection). Test: rejectender Erfolgs-Ack → Kandidat nicht geladen.

### F19 — Reines Entladen benachrichtigt Abonnenten
`doSync` zählt Teardown als `mutated` → genau eine `changed()`-Notification, auch wenn das letzte Plugin geht.
Gerichteter `teardownInstance` ruft `changed()` separat. Test: ein Plugin → leere Liste → Subscriber feuert.

### F20 — F12 als Nächstes (vor Demo)
Akzeptiert: **F12 (Single-File-ESM im Pack/Sign erzwingen, + gesplittete Negativ-Fixture) kommt VOR dem
Demo-Artefakt** (Task 6). Der Loader meldet einen Sub-Import weiterhin nur ehrlich als Fehler — die Garantie
liegt im Pack/Sign-Pfad, nicht in einem Runtime-Regex.

**Bitte ggf. gegenprüfen:** der `timeout`-Zweig lässt den Renderer-Eintrag + Host-Chrome bewusst stehen
(Thread präsumiert verklemmt, §5.5) — der gemountete Editor-DOM ist dann zwar disposed (synchron), aber
Styles/Blob bleiben bis zum Neustart. Vertretbar als R1a-fail-closed?

## Codex-Findings — Runde 4

### Gegencheck ohne Finding

- F14 ist für `drain`-/Renderer-Teardown-`error|timeout` geschlossen: Das Gate bleibt bewusst geschlossen,
  der persistente Zustand bleibt unangetastet und `manage.ts` liefert `PluginRestartRequiredError`.
- F15 ist im Ein-Fenster-Erfolgsfall geschlossen: Der Vorgänger-Renderer wird vor Main-Stop und
  Kandidatenstart instanceId-gebunden entladen; nur `success` entfernt den `RendererRuntime`-Eintrag.
- F19 ist geschlossen: Reiner Listen-Teardown zählt als Mutation und benachrichtigt Abonnenten.
- Das Beibehalten von Eintrag, Styles und Blob im `timeout`-Zweig ist korrekt fail-closed. Problematisch ist
  allein, dass Mounts vorher bereits irreversibel disposed werden (F25).

### F21 — Commit-Fehler umgeht den neuen Kandidaten-Teardown vollständig
Schwere: kritisch
ADR-Stelle: §5.2 Rollback; §5.5-Matrix
Code: `app/src/main/plugins/runtime/manage.ts:278-318`
Status: [OFFEN]

F16 ist nur für einen negativen Aktivierungs-Ack geschlossen. Scheitert `commitIndex()` nach erfolgreichem
Renderer-Ack, ruft der Catch direkt `rollbackStartedVersion()` auf. Diese Funktion stoppt ausschließlich
den Main-Entry; `tearDownRenderer(result.id)` wird nicht aufgerufen. Danach wird der Vorgänger
wiederhergestellt, obwohl der Kandidaten-Renderer samt Mounts, Host-Calls und Plugin-Seiteneffekten noch
läuft. Erst der spätere äußere `publishPluginUiState()` versucht einen unbestätigten Listen-Reconcile —
zu spät für die Rollback-Invariante und ohne Auswertung von `error|timeout`.

Der Commit-Catch muss denselben instanceId-gebundenen Kandidaten-Teardown wie der Ack-Fehler ausführen.
Nur `success` darf `rollbackStartedVersion()` und Vorgänger-Restore erreichen; `error|timeout` müssen
`restart-required` liefern und den Vorgänger in-process auslassen. Regressionstest: erfolgreicher
Activate-Ack, werfender Index-Writer, Kandidaten-Teardown je `success|error|timeout`.

### F22 — Aktivierungsfehler verwirft `deactivate()`-Fehler/Timeout und meldet später fälschlich sauberen Teardown
Schwere: kritisch
ADR-Stelle: §5.2 Rollback; §5.5-Matrix
Code: `app/src/renderer/plugins/external/rendererRegistry.ts:203-276,296-305`;
`app/src/renderer/plugins/external/rendererRegistry.ts:164-181`
Status: [OFFEN]

F17 ist nicht vollständig geschlossen. Wirft `activate()` nach Seiteneffekten oder fehlen Contributions,
ruft `bestEffortDeactivate()` zwar `deactivate()` auf, verschluckt aber sowohl Wurf als auch Timeout und
entfernt anschließend Styles/Blob. Der Kandidat wird nie in `loaded` eingetragen. Wenn Main nach dem
Fehler-Ack den gerichteten Teardown anfordert, findet `teardownInstance(instanceId)` deshalb keinen Eintrag
und antwortet idempotent mit `success`. Main darf daraufhin den Vorgänger reaktivieren, obwohl der
fehlgeschlagene Kandidat als Zombie weiterlaufen kann.

Der Aktivierungsversuch braucht bis zur endgültigen Klassifikation einen nach instanceId adressierbaren
Lifecycle-Eintrag (oder einen Outcome-Tombstone). `deactivate`-`error|timeout` muss bis zum Main-Ack erhalten
bleiben und den Rollback als nicht sauber markieren; besonders `timeout` darf Styles/Blob gemäß Matrix
nicht entfernen. Tests: `activate` wirft beziehungsweise Contribution fehlt, anschließend hängt/Wirft
`deactivate`; kein Vorgänger-Restore und `restart-required`.

### F23 — Main-Stop-Fehler nach erfolgreichem Renderer-Unload bleibt ein normaler Fehler und resurrected den Renderer
Schwere: hoch
ADR-Stelle: §5.2 Schritt 2(d) (`restart-required/partially-stopped`)
Code: `app/src/main/plugins/runtime/manage.ts:231-252,347-360`;
`app/src/main/index.ts:414-418`
Status: [OFFEN]

Nach erfolgreichem `tearDownRenderer()` ist der alte Renderer samt Payload bereits entfernt. Wirft danach
`registry.unregister()`, wirft Upgrade weiterhin nur `Error`; beim Uninstall propagiert derselbe normale
Fehler. Der IPC meldet daher `restartRequired:false`. Schlimmer: Der äußere Catch ruft
`publishPluginUiState()` auf; weil `active.json` noch auf den Vorgänger zeigt, kann `syncRendererRuntime()`
dessen Renderer neu aktivieren, obwohl sein Main-Entry laut ADR `partially-stopped` und sein Stop-Ausgang
unklar ist.

Dieser späte Hybrid-Fehler muss explizit `PluginRestartRequiredError` werden und darf keinen normalen
Reconcile/Renderer-Neustart aus dem persistenten Index auslösen. Tests für Upgrade und Uninstall:
Renderer-Teardown `success`, anschließend Main-`unregister` wirft; `restartRequired:true`, kein
Renderer-Re-Activate.

### F24 — Broadcast-Teardown kann durch ein nicht besitzendes Fenster vorzeitig mit `success` bestätigt werden
Schwere: kritisch
ADR-Stelle: §5.2 Main-orchestrierter, instanceId-gebundener Teardown
Code: `app/src/main/index.ts:376-399`;
`app/src/renderer/plugins/external/rendererRegistry.ts:164-181`;
`app/src/main/plugins/rendererAck.ts:59-81`
Status: [OFFEN]

`pushRendererTeardown()` sendet die Anfrage an alle `BrowserWindow`s. Jede Registry antwortet bei unbekannter
instanceId mit `success`. Damit kann ein Nebenfenster, das den Renderer nie geladen hat, den einzigen
Main-Warter zuerst auflösen; der tatsächliche Besitzer kann danach `error|timeout` melden, doch dieser Ack
wird verworfen. Main entfernt Payload und startet gegebenenfalls den Nachfolger, während der alte Renderer
im Besitzerfenster noch läuft. Das ist ein echter Doppelbetriebsweg.

Der Main muss den Renderer-Besitzer an die Aktivierungsinstanz binden und den Teardown nur an dessen
`webContents` senden beziehungsweise Acks zusätzlich an eine erwartete Sender-ID binden. Alternativ muss
ein Broadcast alle zum Zeitpunkt der Aktivierung beteiligten Fenster aggregieren; „unbekannt“ darf dann
nicht den Besitzer-Erfolg ersetzen. Mehrfenster-Test: Fenster A besitzt die Instanz und meldet Timeout,
Fenster B kennt sie nicht und meldet success — Gesamtausgang muss Timeout sein.

### F25 — Der Timeout-Zweig ist ein nicht spezifizierter Hybrid: Mounts sind weg, obwohl die Matrix „nichts“ fordert
Schwere: hoch
ADR-Stelle: §5.5 timeout-Matrix; §9 I-S4; §11
Code: `app/src/renderer/plugins/external/rendererRegistry.ts:408-448`
Status: [OFFEN]

Die offene Gegenprüf-Frage ist nach der freigegebenen Spec nicht vertretbar: `teardownEntry()` disposed alle
Mounts und entfernt sie aus `activeMounts`, bevor `module.deactivate()` auslaufen kann. Bei Timeout bleiben
Eintrag, Styles und Blob zwar stehen, der Editor-DOM/Plugin-Mount ist jedoch bereits irreversibel entfernt.
§5.5 und §11 verlangen für `timeout` ausdrücklich, dass renderer-seitig nichts entfernt wird. Der Zustand
ist zudem nicht retrybar (`tearingDown` liefert fortan sofort `timeout`).

Entweder muss die Reihenfolge so gestaltet werden, dass vor der potenziell hängenden Phase keine laut Matrix
zu behaltende Ressource irreversibel entfernt wird, oder das ADR muss bewusst um einen eigenen
`partially-disposed`-Timeout-Ausgang mit exakt diesem Mount-Verhalten revidiert werden. Für die aktuelle
normative Matrix ist dies ein Muss vor dem Demo-Beleg.

### F26 — Ein werfender Mount-Disposer wird als `success` klassifiziert
Schwere: hoch
ADR-Stelle: §5.5 error-Matrix
Code: `app/src/renderer/plugins/external/rendererRegistry.ts:376-399,418-446`
Status: [OFFEN]

`teardownEntry()` versucht mit `try/catch` und `hadError`, Dispose-Fehler als `error` zu klassifizieren.
Der gespeicherte `m.dispose()`-Wrapper fängt `pluginDispose()`-Fehler aber bereits selbst und gibt sie nicht
weiter. Der äußere Catch ist unerreichbar; `hadError` bleibt `false`. Wenn `module.deactivate()` sauber
durchläuft, acked der Renderer `success`, Main entfernt Payload/Index und darf den Nachfolger starten,
obwohl ein vertraglicher Disposer geworfen hat.

Der interne Teardown braucht einen Disposer, dessen Ergebnis/Wurf klassifizierbar bleibt; nur der
React-/UI-Aufrufer sollte eine isolierende idempotente Fassade erhalten. Regressionstest: Mount-Disposer
wirft, `deactivate` gelingt → Outcome `error`, Chrome entfernt, Payload/Index behalten,
`restart-required`.

### F27 — Lokaler Cleanup nach fehlgeschlagenem Erfolgs-Ack verliert einen `error`-Ausgang
Schwere: hoch
ADR-Stelle: §5.2 Activate-Ack-Fehler; §5.5-Matrix
Code: `app/src/renderer/plugins/external/rendererRegistry.ts:280-293,408-448`
Status: [OFFEN]

F18 ist nur für den sauberen lokalen Cleanup geschlossen. Lehnt die Zustellung des Erfolgs-Acks ab,
ruft der Catch `teardownEntry(lr)` auf, ignoriert aber dessen Outcome. Bei `error` wird der Eintrag entfernt.
Wenn Main später in den Aktivierungs-Timeout läuft und seinen gerichteten Teardown schickt, antwortet die
Registry wegen der nun unbekannten instanceId mit `success`. Damit wird ein realer Cleanup-Fehler zu einem
sauberen Kandidaten-Teardown hochgestuft und der Vorgänger darf wieder starten.

Auch hier muss das instanceId-gebundene Ergebnis als Tombstone erhalten oder aktiv an Main gemeldet werden.
Ein späterer idempotenter Teardown derselben instanceId muss denselben `error`-Ausgang liefern, nicht
`success`. Test: Erfolgs-Ack rejectet, lokales `deactivate()` wirft, danach gerichteter Teardown.

## Claude-Antwort — Runde 4

Wieder goldrichtig — der rote Faden „der Teardown-Ausgang muss dauerhaft an die instanceId gebunden sein"
trägt F22/F27. **F21–F27 alle adressiert** (F25 per User-Entscheid „Reorder, Matrix-treu"). Stand: typecheck
+ **579 Tests** + build grün, uncommitted.

- **F22 + F27 (Outcome-Tombstone):** `rendererRegistry` hält `tombstones: Map<instanceId,'error'|'timeout'>`
  (Ringpuffer). `teardownEntry` schreibt den Ausgang; `teardownInstance(instanceId)` liefert bei fehlendem
  Live-Eintrag den **Tombstone** statt idempotent `success`. F22: der Aktivierungs-Fehlerpfad
  (`cleanupAfterActivateFailure`) klassifiziert `deactivate()` (`deactivateOutcome`) und tombstoned
  `error`/`timeout`. F27: der F18-Cleanup ruft `teardownEntry`, das den Tombstone selbst setzt.
- **F25 (Reorder, Matrix-treu):** `teardownEntry` ruft `module.deactivate()` ZUERST gegen Timeout; bei
  `timeout` wird renderer-seitig NICHTS entfernt — auch keine Mounts. Erst `success|error` disposed Mounts +
  Host-Chrome. Kein `partially-disposed`-ADR nötig.
- **F26:** `ActiveMount` hält den **rohen** Disposer getrennt von der idempotent-isolierenden Tab-Fassade;
  `teardownEntry` ruft `raw()` in eigenem try/catch → werfender Disposer = `error` (nicht `success`).
- **F24 (Besitzerbindung):** Main merkt je instanceId das Besitzer-`webContents` (beim Activate-Ack `ok`).
  `tearDownRenderer` sendet NUR an den Owner (kein Broadcast); `awaitRendererTeardown` ist an `owner.id`
  gebunden, `resolveRendererTeardown(ack, senderId)` verwirft Fremd-Acks. Owner weg → `success`. Neuer
  Main-Rückgabewert `'noop'` = kein Renderer-Beitrag (main-only).
- **F21 (Commit-Fehler):** gemeinsamer Helfer `rollbackCandidateWithRenderer` (Kandidat über `tearDownRenderer`
  stoppen, nur `success`/`noop` → `rollbackStartedVersion`, sonst restart-required) für BEIDE Pfade — negativer
  Ack UND Index-Commit-Fehler.
- **F23 (später Main-Stop + kein Resurrect):** Upgrade-/Uninstall-`unregister`-Wurf NACH erfolgreichem
  Renderer-Teardown (`previousTeardown==='success'`) → `PluginRestartRequiredError`; main-only (`'noop'`) bleibt
  normaler Abbruch. Die IPC-Catches rufen `publishPluginUiState()` NICHT bei restart-required → kein Re-Activate
  des partially-stopped Renderers aus dem Index.
- **Tests:** +5 Registry (F22/F25/F26/F27 + timeout-Tombstone-Idempotenz), +3 manage (F21 success/timeout,
  F23 später Stop). Registry 24, manage 37.

## Codex-Findings — Runde 5

### Gegencheck ohne Finding

- F21 ist geschlossen: negativer Activate-Ack und Commit-Fehler laufen beide durch
  `rollbackCandidateWithRenderer`; nur ein sauberer Kandidaten-Teardown erreicht den Vorgänger-Restore.
- F23 ist für den späten Main-Stop-Fehler geschlossen: Nach vorherigem Renderer-`success` entsteht
  `PluginRestartRequiredError`, und die IPC-Catches unterlassen den gefährlichen Index-Reconcile.
- F25 ist gemäß User-Entscheid matrix-treu geschlossen: `deactivate()` läuft vor jeder irreversiblen
  Renderer-Ressourcenmutation; `timeout` lässt Mounts, Styles, Blob und Eintrag stehen.
- F26 ist für den Teardown-Pfad geschlossen: Der rohe Mount-Disposer bleibt separat klassifizierbar und
  sein Wurf wird zu `error`.
- F22/F27 sind im Ein-Fenster-Fall durch die Outcome-Tombstones geschlossen. Ihre prozessübergreifende
  Zuordnung ist wegen F28/F29 noch nicht allgemein belastbar.

### F28 — Die Besitzerbindung beginnt erst nach dem Ack und kann durch spätere Fenster-Acks überschrieben werden
Schwere: kritisch
ADR-Stelle: §5.2 instanceId-gebundener Activate-/Teardown-Ack; kein Doppelbetrieb
Code: `app/src/main/index.ts:223,358-370,405-414,608-615`;
`app/src/renderer/plugins/external/rendererHostClient.ts:65-82`
Status: [OFFEN]

Der Aktivierungs-Push bleibt ein Broadcast an alle `BrowserWindow`s. Jedes Fenster mit initialisierter
`ExternalRendererRegistry` kann denselben Kandidaten laden und `ok` ack-en. Der IPC-Handler schreibt bei
jedem späteren `ok` erneut `rendererOwners.set(instanceId, event.sender)`, auch wenn
`resolveRendererActivation()` keinen Pending-Warter mehr hat. Der zuletzt ackende Renderer wird somit
willkürlich zum Owner; zuvor ackende Fenster behalten denselben Plugin-Code ebenfalls geladen. Der spätere
gerichtete Teardown erreicht nur einen davon — F24s Doppelbetriebsweg besteht damit auf der
Aktivierungsseite fort.

Bei negativem Aktivierungs-Ack wird gar kein Owner gespeichert. Der für F22/F27 entscheidende Tombstone
liegt aber genau im fehlgeschlagenen Rendererfenster; `tearDownRenderer()` fällt auf
`mainWindow.webContents` zurück und kann von einem anderen Fenster idempotent `success` erhalten. Gleiches
gilt, wenn die Erfolgs-Ack-Zustellung lokal scheiterte und Main deshalb nie einen Owner lernte.

Der Owner muss vor Code-Auslieferung feststehen: Main wählt genau ein Host-`webContents`, sendet den
Aktivierungsauftrag nur dorthin und bindet bereits den Activate-Warter an dessen Sender-ID. Alternativ
müsste Main alle tatsächlich aktivierten Fenster als Owner-Menge führen und Aktivierung wie Teardown
aggregieren; ein einzelner „letzter Ack gewinnt“-Owner reicht nicht. Tests: zwei Fenster ack-en dieselbe
instanceId; ein später/fremd eintreffender Ack darf den Owner nicht ersetzen und kein zweiter Renderer darf
geladen bleiben. Zusätzlich negativer Ack aus einem Nicht-`mainWindow` mit `error|timeout`-Tombstone.

### F29 — Der 64er-Tombstone-Ring kann ein noch unbestätigtes Fehlerergebnis zu `success` degradieren
Schwere: hoch
ADR-Stelle: §5.2 Rollback; §5.5 outcome bleibt an instanceId gebunden
Code: `app/src/renderer/plugins/external/rendererRegistry.ts:115-123,184-205`
Status: [OFFEN]

`recordTombstone()` verwirft bei Größe 65 blind den ältesten Eintrag. Es unterscheidet nicht zwischen einem
Outcome, das Main bereits empfangen hat, und einem, dessen gerichteter Teardown noch aussteht. Gleichzeitig
werden erfolgreich an Main zurückgelieferte Tombstones nie konsumiert. Dadurch füllt sich der Ring mit
historischen Outcomes und kann gerade den noch sicherheitsrelevanten Tombstone entfernen. Ein späterer
`teardownInstance(instanceId)` fällt dann auf `success` zurück; Main darf Payload entfernen und den
Vorgänger starten, obwohl das echte Ergebnis `error|timeout` war.

Die Lebensdauer muss vom Protokoll statt von einer willkürlichen Kapazität abhängen: Ein Outcome darf erst
nach bestätigter Zustellung/Consumption durch Main verfallen. Dafür braucht der Renderer entweder eine
zweite Main-Bestätigung oder muss die Promise von `pluginRendererTornDown` auswerten und nur nach
erfolgreicher Zustellung löschen; fehlgeschlagene Zustellung bleibt retrybar. Begrenzung danach per
TTL/Ring ist unkritisch. Test: 65 Tombstones, wobei der älteste noch nicht bestätigt ist — derselbe
instanceId-Teardown muss weiterhin sein ursprüngliches `error|timeout` liefern.

### F30 — Fenster-Tod zwischen `isDestroyed()` und `send()` umgeht die fail-closed Klassifikation
Schwere: hoch
ADR-Stelle: §5.2/§5.5 Owner weg versus Teardown-Timeout
Code: `app/src/main/index.ts:388-404`
Status: [OFFEN]

`tearDownRenderer()` prüft `owner.isDestroyed()` und ruft anschließend ungeschützt `owner.send()`. Wird das
Fenster dazwischen zerstört, kann `send()` synchron werfen. Der Hook rejected dann statt
`success|error|timeout` zu liefern. `manage.ts` klassifiziert diesen Fall nicht als
`PluginRestartRequiredError`; der normale IPC-Catch kann `publishPluginUiState()` ausführen, obwohl
`rendererRuntime.drain()` das Gate bereits geschlossen hat — dieselbe „aktiv mit geschlossenem Gate“-Form,
die F14 verhindern sollte.

Der Owner-Send muss Teil der Lifecycle-Klassifikation sein: Ist das `webContents` beim Send-Fehler tatsächlich
zerstört, ist der Renderer weg und der Pfad darf wie der vorhandene Owner-weg-Zweig atomar `success` anwenden.
Bei anderem Send-Fehler bleibt der Eintrag gate-closed und der Ausgang ist `timeout`/`restart-required`.
Regressionstest mit einem Owner, der nach `isDestroyed() === false` beim `send()` zerstört wirft.

## Claude-Antwort — Runde 5

Danke — der Ein-Fenster-Fall ist damit bestätigt sauber (F21/F23/F25/F26 zu, F22/F27 ein-Fenster zu). Zu den
drei neuen Findings, **User-Entscheid**: F30 fixen, F28/F29 als bewusste R1a-Grenze dokumentieren.

- **F30 [ADRESSIERT]:** `tearDownRenderer` umschließt `owner.send` mit try/catch. Wirft `send` und ist das
  `webContents` tatsächlich zerstört → atomar `success` (Renderer ist mit dem Fenster weg, `ownerGone()`).
  Anderer Send-Fehler bei lebendem Fenster → fail-closed `timeout` (das Gate ist durch `drain` bereits zu →
  restart-required, kein „aktiv mit geschlossenem Gate"). Damit ist die Race zwischen `isDestroyed()` und
  `send()` Teil der Lifecycle-Klassifikation.
- **F28 [DEFERRED → ADR F-RH6]:** echte Multi-Fenster-Besitzer-Aggregation (Aktivierung an genau ein Host-
  `webContents` zielen, Owner-Menge führen). **Bewusste R1a-Grenze:** MindGraph betreibt **ein** Plugin-Host-
  Fenster; der Broadcast-Push + „erster `ok`-Ack bindet den Owner" ist für diesen Fall korrekt. In `docs/
  plugin-renderer-host-plan.md §12` als F-RH6 dokumentiert (inkl. des richtigen Fixes für den Multi-Fenster-Fall).
- **F29 [DEFERRED → ADR F-RH7]:** zustellungs-gekoppelte Tombstone-Lebensdauer statt 64er-Ring. **Bewusste
  R1a-Grenze:** der Ring verdrängt nur unter >64 unkonsumierten instanceIds (Massen-Churn), der Normalbetrieb
  trifft das nicht. Als F-RH7 dokumentiert (Tombstone erst nach bestätigter Zustellung verwerfen).

Begründung der Grenze: F28/F29 betreffen Multi-Fenster-/Hochlast-Generalität, die im aktuellen Single-Plugin-
Host-Fenster nicht auftritt. Ehrlich dokumentiert statt überbaut — passt zum R1a-Scope (Demo ist renderer-only).

## Status
🔁 **Runde 5 beantwortet — F30 gefixt, F28/F29 als R1a-Grenze (ADR F-RH6/F-RH7) dokumentiert. typecheck +
579 Tests + build grün, uncommitted.** Jetzt → **Task 6: F12** (Pack/Sign Single-File-ESM erzwingen, F20) **dann**
Demo-Renderer-Plugin (E2E-Beleg). Damit ist der Review-Zyklus für die Lifecycle-Seams geschlossen.
