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

## Status
🔁 **Tasks 1–4-Findings adressiert; Task 6a (Main-Integration) gebaut.** Neu: registry-No-op (F01),
RendererRuntime gehärtet (F02-atomar/ID-Guard + F03-Eigentum), Validation (F05), IPC `plugin:renderers` +
`plugin:rendererEntry` + `plugin:renderers-changed`-Push + preload + `syncRendererRuntime` (instanceId-stabil).
**Offen:** F02-Drain-Lifecycle + Ack-vor-Commit (Task 5), F04 (Task 7 Datei-Seam mit Paritätstest),
`plugin:host`-Capability-Bridge (Task 6b). **Codex: optional zweite Runde** auf die neue Main-Integration
(`syncRendererRuntime`/IPC-Handler in `index.ts`, RendererRuntime-Rewrite) — sonst baue ich an Task 7/6b/8 weiter.
