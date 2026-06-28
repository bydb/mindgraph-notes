# MindGraph Plugin-Store (Phase A: kuratiert + signiert)

> **Status: ENTWURF (2026-06-28).** Folgedokument zu `docs/plugin-system-plan.md`. Dieses Dokument aktiviert bewusst die dort als „spätere, getrennte Produktentscheidung" markierte Stufe (Entscheidung #1) — das **Obsidian-artige Store-Modell** — in einer **kuratierten, signierten** Variante, die ohne vollständige Fremdcode-Sandbox auskommt, solange nur der MindGraph-Autor publiziert.

## Kurzidee

Das interne Plugin-System (Schritte 1–9, fertig) backt Plugins **zur Buildzeit** ins App-Bundle (`import.meta.glob` zieht `src/plugins/*` fest in `index.js`). Deshalb „bemerkt man in den Einstellungen nichts": Antares/reMarkable/edoobox sind eingebaut, nicht installierbar.

Dieses Dokument zurrt fest, wie wir daraus einen **echten Store** machen:

> Jedes Plugin lebt in **seinem eigenen GitHub-Repo**, baut sich **selbst** zu einem Artefakt und wird vom MindGraph-**Store auf Wunsch des Users von GitHub geladen**. Beim Download von MindGraph ist der Store dabei — **Antares & reMarkable aber NICHT mehr automatisch aktiv**, sondern nur, wenn der User sie installiert.

Pitch-Satz:

> Plugins sind nicht mehr Teil der App, sondern Pakete daneben. Der User wählt im Store, was er installiert; die App lädt es signaturgeprüft von GitHub und aktiviert es zur Laufzeit. Deinstallieren → Ordner in `userData/plugins/` weg → Feature weg.

## Der eine zentrale Bruch: Buildzeit → Laufzeit

Alles hängt an **einem** Wechsel:

| | **Heute (Schritte 1–9)** | **Store (dieses Dokument)** |
|---|---|---|
| Wo liegt Plugin-Code | `src/plugins/*` im App-Repo | je ein **eigenes GitHub-Repo** |
| Wie kommt er in die App | `import.meta.glob`, Vite bündelt zur Buildzeit | **Download** der GitHub-Release-Assets nach `userData/plugins/<id>/` |
| Wann wird er geladen | beim App-Build (statisch) | **zur Laufzeit** (dynamisch, nach Install) |
| Wer baut den Plugin-Code | die App-Vite-Pipeline | **das Plugin-Repo selbst** (eigener Build → fertiges `main.js`/`renderer.js`) |
| Sichtbar für den User | nein (eingebaut) | **ja** (Store-Liste: installieren/aktivieren/entfernen) |

Die App-Vite-Pipeline fasst Plugin-Code dann **nicht mehr an**. Das ist der eigentliche Brocken — nicht die Sandbox.

## Bedrohungsmodell & Trust-Staffelung

MindGraph hält E-Mail-Inhalte, IMAP/SMTP-Credentials, Kalender, `safeStorage`-Secrets, den ganzen Vault. Heruntergeladener Code, der das lesen kann, killt die Marke „verlässt nie deinen Rechner". Deshalb zwei Stufen — und **dein „anfangs nur ich publiziere" ist der Hebel, der Phase A überhaupt erst leicht macht**:

| | **Phase A — kuratiert + signiert (dieses Dokument)** | **Phase B — Community (später, eigenes Dokument)** |
|---|---|---|
| Wer publiziert | **nur der MindGraph-Autor** | jeder Entwickler |
| Vertrauensanker | **Ed25519-Signatur** des Release-Artefakts mit dem MindGraph-Plugin-Key; App verifiziert gegen einen **eingebauten Public Key** und installiert nur gültig signierte Plugins | Signatur eines Unbekannten sagt nichts → **echte Isolation nötig** |
| Ausführung Main-Code | im Main-Prozess (signiert ⇒ vertrauenswürdig wie eingebauter Code) | **`utilityProcess` + Node-Permission-Model** (Schritt 10 des alten Plans) |
| Ausführung Renderer-Code | im Renderer gegen eine **schmale Host-API** (signiert ⇒ vertraut) | eingeschränkte Surface + **Per-Plugin-Consent** aus den Manifest-Capabilities |
| Was der User sieht | „offizielles MindGraph-Plugin ✓" | Permission-Dialog: „Dieses Plugin will: Vault lesen, Netz zu x.com …" |

**Kernaussage:** Mit Signatur-Gating bauen wir das **komplette Store-Erlebnis** (eigene Repos, GitHub-Distribution, On-demand-Install, nichts auto-aktiv) **ohne** die `utilityProcess`-Sandbox. Die Sandbox wird erst Pflicht, wenn Punkt 4 deiner Vision (Fremdentwickler) kommt — dann greift Phase B und der alte „Schritt 10".

## Architektur-Entscheidungen (Entwurf — ⚠️ = mit dir zu bestätigen)

| # | Branch | Entscheidung |
|---|--------|-------------|
| S1 | Verteilformat | Jedes Plugin baut zu einem **Obsidian-artigen Tripel**: `manifest.json` (reine Metadaten) + `main.js` (gebündelter Main-Code) + optional `renderer.js` + `styles.css`. Ein einzelnes, self-contained Artefakt pro Prozess — keine `node_modules` zur Laufzeit. |
| S2 | Quelle | **GitHub Releases** (nicht `git clone`): die App lädt die Release-Assets eines Tags. Versionsabgleich über die GitHub-Releases-API. Ablage in `userData/plugins/<id>/`. |
| S3 | Katalog | Ein zentrales **`mindgraph-plugins`-Repo** mit `catalog.json` (Liste: id, name, beschreibung, repo, autor, kategorie). Der Store liest diese eine Datei; Detail/Versionen pro Plugin live aus dessen Repo. Exakt das Obsidian-Muster. |
| S4 | Trust | **Ed25519-Signatur** über das Artefakt-Bündel (z.B. `minisign`/libsodium). App hat den **Public Key eingebaut**, installiert nur gültig signierte Releases. Kein Apple/Code-Signing-Reuse — eigener, billiger Schlüssel nur für Plugins. |
| S5 | Loader-Mechanik | **Runtime-Load statt `import.meta.glob`.** Renderer-Plugin = JS-Bundle, das beim Evaluieren eine **Host-API zurückruff** (`export default class extends MindGraphPlugin` / `register(api)` — Obsidian-Stil), NICHT freies `import()`. Main-Plugin = via `require()` der heruntergeladenen `main.js` (Phase A) bzw. `utilityProcess.fork` (Phase B). |
| S6 | Plugin-API als Vertrag | Es gibt ein **veröffentlichtes API-Paket** (`@mindgraph/plugin-api`, nur Typen + schmale Laufzeit-Helfer), gegen das Plugins entwickeln. Versioniert (SemVer). Das ist die stabile Grenze zwischen App und Plugin — wird damit zur **gepflegten öffentlichen Schnittstelle** (Aufwandstreiber!). |
| S7 | Kompatibilität | Manifest deklariert `minAppVersion` + `apiVersion`. Der Store **blendet inkompatible Plugins aus / blockt Aktivierung** statt sie crashen zu lassen. Nötig, weil Plugins jetzt unabhängig versioniert sind. |
| S8 | Lebenszyklus erweitert | Zustände aus dem alten Plan plus **Installation jetzt echt**: `not-installed \| downloading \| installed \| update-available`. Plus `enabled/disabled` (User-Schalter) und die bestehende Readiness-Dimension. |
| S9 | Bestehende 4 Plugins | **Alle raus aus dem Bundle**, je ein eigenes Repo. ⚠️ **edoobox**: Empfehlung — auch raus, aber im Store als **„empfohlen/featured"** markiert (dein Arbeitstool, aber soll nicht jeden Download aufblähen). Zu bestätigen. |
| S10 | Auslieferung | MindGraph-Download bringt **Store + leeren Plugin-Ordner** mit. **Kein** Plugin ist nach Erstinstallation aktiv. Optional ein „Empfohlene Plugins"-Onboarding-Schritt mit 1-Klick-Install. |
| S11 | CSP/Electron | Renderer-Plugins brauchen eine **CSP-Ausnahme**, um lokal (`file://userData`) gespeichertes JS auszuführen (heute strikt: kein Remote-/Eval-Script). Wird zur sicherheitskritischen Stelle — Phase-A-Lösung: nur signaturgeprüfte, lokal entpackte Bundles per kontrolliertem `require`/`Function` evaluieren. |
| S12 | Renderer ist der harte Teil | Heruntergeladenes **React zur Laufzeit** zu mounten ist deutlich kniffliger als Node-Code (CSP, geteilte React-Instanz, Styling, Slot-Registrierung). Das ist das technische Hauptrisiko — bekommt einen eigenen Spike. |

## Bausteine

1. **`@mindgraph/plugin-api`** — Typen + minimale Laufzeit-Helfer; die stabile öffentliche Grenze (S6).
2. **Manifest v2** — `id, name, version, minAppVersion, apiVersion, repo, capabilities[], main, renderer?, styles?, author, description, signature` (S1/S4/S7).
3. **Plugin-Repo-Template** — ein Vorlage-Repo (Build-Script → Tripel, GitHub-Action signiert + released). Damit jedes neue Plugin in Minuten startet.
4. **Katalog-Repo `mindgraph-plugins`** + `catalog.json` (S3).
5. **Install-Service (Main)** — Releases-API abfragen, Asset laden, **Signatur prüfen**, entpacken nach `userData/plugins/<id>/`, Manifest-Schema validieren (`ajv`), Kompatibilität prüfen (S2/S4/S7).
6. **Runtime-Loader (Main + Renderer)** — ersetzt `import.meta.glob`; lädt aus `userData/plugins/` statt aus dem Bundle (S5). Dual-Mode-Übergang (s. Migration).
7. **Store-UI** — neuer Settings-Tab: Katalog-Liste, Suche, Installieren/Aktualisieren/Entfernen, aktiviert/deaktiviert, „Update verfügbar"-Badge, Kompatibilitäts-Hinweis.
8. **Update-Checker** — periodisch GitHub-Releases gegen installierte Version, nicht-aufdringliches Badge.
9. **Signatur-Toolchain** — Key-Erzeugung, GitHub-Action zum Signieren der Releases, Public Key in die App.

## Codex-Review-Abgleich (2026-06-28): die Entkopplung ist Phase-A-Voraussetzung

Eine unabhängige Code-Review (Codex) gegen den alten internen Plan fand, dass die Plugin-**Infrastruktur** steht, die **Entkopplung aber erst ~2/3 fertig** ist — und alle Befunde am Code verifiziert. Im Store-Modell sind die wichtigsten davon **keine Politur mehr, sondern Blocker**, weil ein heruntergeladenes Plugin zur Buildzeit nicht existiert ⇒ der Kern darf es **nirgends namentlich kennen**:

| Befund (verifiziert) | Stelle | Im Store **Pflicht**, weil … |
|---|---|---|
| Modulschalter ≠ activate/deactivate | `modules.ts:54` flippt nur Renderer-Flags, `registry.deactivate()` (`registry.ts:198`) nie aufgerufen; `activateAll()` aktiviert beim Start alles | Install/Enable MUSS das Plugin real starten, Disable/Uninstall real stoppen |
| Kern nennt Plugins namentlich | `modules.ts` MODULES-Switch, `Settings.tsx` feste Sektionen, `uiStore` `state.antares/edoobox.*`, Credential-Migrationen in `index.ts` | Modul-Liste + Settings + Config müssen **generisch aus den Manifesten** kommen |
| Workflow-Logik im Kern | `workflowStore.ts:21` importiert `useAntaresStore`, `:129` edoobox-Baseline, `:242` `antaresRowToItem` | Polling/Datenübersetzung muss **ins jeweilige Plugin-Repo** (alte Decision 13) |
| Readiness kosmetisch | `registry.ts:178` setzt pauschal `ready`, kein Config-Check | Store-UX „braucht Konfiguration" / „bereit" |
| Output-Schemas fehlen | Manifeste haben fast nur Input-Schemas | **Phase B** (untrusted Output) — jetzt niedrig |
| HTTP-Allowlist ignoriert Redirects | `host.ts:168` prüft nur Ausgangs-URL | **Phase B** vor Fremd-Plugins — Codex stimmt zu |

**Konsequenz:** Codex' Schritte 1–5 sind die „Kern entkennt die Plugins"-Generalisierung — sie sind **identisch** mit der Phase-A-Voraussetzung und kein Wegwerf-Aufwand. Sie gehören VOR den eigentlichen Download/Store (A2/A3), weil man keine generisch geladenen Plugins haben kann, solange der Kern ihre Namen, Settings und State hartverdrahtet. Ehrliche Korrektur: Die bisherigen „Deletion-Test bestanden"-Vermerke (Schritt 7/8/3b-ii) waren **scoped** (kompiliert + Plugin-Chunk weg), NICHT „restlos weg" im Sinne von Decision #7 — genau diese Reste schließt A-pre.

## Migrationsplan (inkrementell, App bleibt jederzeit lauffähig)

- **Phase A-pre — Kern entkennt die Plugins (aus Codex-Review, Voraussetzung).** (1) ✅ Modulschalter `enable/disable` → echtes `registry.activate/deactivate`; `activateAll` respektiert den Disabled-Zustand. (2) ✅ Modul-Metadaten + Schalter-Liste **generisch aus den Manifesten** statt `uiStore.MODULES`/`modules.ts`-Switch. (3) ✅ Plugin-Config generisch (keyed by pluginId) statt typisierter uiStore-State: **antares + edoobox + marketing + remarkable** leben jetzt in `pluginConfig.<id>`; `state.edoobox/marketing/remarkable.*` samt Settern/persistedKeys entfernt. Typ+Defaults bleiben (wie `ANTARES_DEFAULTS`) im Kern (`EDOOBOX_DEFAULTS` etc. in uiStore) → die noch im Kern liegenden Settings-Tabs importieren sie deletion-sicher. Consumer lesen über `getPluginConfig`/`usePluginConfig`/`usePluginEnabled`. Manifest-`enabledPath` → `pluginConfig.<id>.enabled` (+ `legacyEnabledPath`); Main-`resolveExtraAllowedHosts` liest generisch `pluginConfig[id]` (fixt nebenbei den Antares-Host-Lookup). Legacy-Migration `savedSettings.<id>` → `pluginConfig.<id>` in `migrateLegacyPluginConfig` (pur, getestet). Echt verifiziert: edoobox+remarkable entfernt ⇒ typecheck+build grün. **Plugin-Settings-Tabs liegen noch im Kern-`Settings.tsx` (lesen aber generisch) — Move in Settings-Slots ist UI-Politur, kein Config-Coupling mehr.** (4) ✅ Antares-/edoobox-Workflow**logik** aus `workflowStore` in die Vertikalen: neuer `WorkflowTriggerProvider`-Vertrag (`shared/plugins/workflowTrigger.ts`), Renderer-Slot `workflow.trigger`, Provider in `src/plugins/{antares,edoobox}/renderer/workflowTrigger.ts` (Formatierung, Item-Bau, Ledger-Reset/Baseline); `workflowStore` dispatcht generisch (kein Plugin-Import, keine Plugin-Trigger-IDs mehr, Ledger-Eviction wert- statt namensbasiert). Der Event-Dispatch liegt in `renderer/stores/workflowTriggerDispatch.ts` (DI, store-frei → pur testbar). **Bugfix dabei:** `afterRun` (edoobox-Baseline) rückt jetzt nur bei **vollständig erfolgreichem** Lauf vor — vorher rückte die Baseline auch bei `status:'failed'`-Läufen vor (kein throw) und ließ die Anmeldung verloren gehen. Tests: Antares-Reset, edoobox-Erstbaseline/Delta, Fehlschlag-Gate (+Teilfehler), Leerlauf-Init, Exactly-once-Filter. **(4b) ✅ Palette/Runner-Metadaten plugin-contributed:** neues Manifest-Feld `workflowActions` (serialisierbar, ajv-validiert); Registry additiv (`registerWorkflowActions` + `workflowModuleLabel`/`workflowModuleGate`-Fallbacks); `antares.mahnung`/`edoobox.newBooking` aus `registry.ts` + `runner.ts` gelöscht und in die Manifeste verschoben; Runner dispatcht über `resolveExecutor` (registrierter Trigger → generischer Text-Executor); Renderer (`plugins/workflowActions.ts`, eager in main.tsx) + Main (`discoverMainPlugins` nach `createMainRegistry`) spielen sie ein. **Verifiziert per echtem Deletion-Test:** Antares-Ordner entfernt ⇒ typecheck + build grün, Bundle kleiner, kein Palette-Block, `resolveExecutor` undefined. Tests: `registry.deletion.test.ts` + `runner.deletion.test.ts` (synthetischer Trigger, plugin-import-frei) + Manifest-Assertions kolokiert in den Vertikalen.** **(4c) ✅ Letzte Workflow-Restkopplungen entkannt:** Poll-Trigger generisch (`isPollTriggerAction` aus den Providern statt harter Liste in `WorkflowCanvasView`); Simulationszeile via `WorkflowActionDefinition.simLine` (Manifest) statt Kern-`SIM_LINE`; Beispiel-Workflows über Renderer-Slot `workflow.example` aus den Vertikalen (kein Plugin-Beispiel mehr in `examples.ts`); `ModuleIcon` ohne antares/edoobox (generischer IconBox-Fallback). **Echt verifiziert: antares + edoobox entfernt ⇒ typecheck + build grün, Bundle kleiner, keine toten Beispiele/Metadaten/Kernnamen.** Verbleibend (inert, separat): zentrale i18n-Strings `dashboard.antares.*` in `translations.ts`. (5) ✅ Readiness-Check pro Plugin. **Akzeptanz: echter automatisierter Deletion-Test ERFÜLLT** — Ordner weg ⇒ keine toten Settings/Schalter/Workflow-Zweige/Palette-Blöcke/Beispiele.
- **Phase A0 — Verträge & Format.** `@mindgraph/plugin-api` schälen (aus heutigem `shared/plugins/*` — **Schritt 1 als Plan/ADR in `docs/plugin-api-package-plan.md`**), Manifest v2 definieren, Repo-Template + Build/Sign-Action bauen. Noch kein App-Verhalten geändert. **Offene Schuld aus A-pre (hierher verschoben): i18n.** Plugin-Strings (`settings.agents.edoobox.*`, `dashboard.antares.*`, …) liegen noch zentral in `renderer/utils/translations.ts` und bleiben nach einer Plugin-Löschung als inerte (nicht gerenderte) Reste. Endgültige Lösung gehört zu A0, sobald `@mindgraph/plugin-api` einen Übersetzungsmechanismus definiert (Plugin bringt seine Strings selbst mit). Bis dahin: kein Build-/Runtime-Risiko.
- **Phase A1 — Runtime-Loader-Spike (der harte Beweis).** **EIN** triviales Plugin (z.B. das `demo`) aus `userData/plugins/demo/` statt aus dem Bundle laden — Main UND Renderer. Beweist S5/S11/S12 end-to-end. Bundle-Glob bleibt parallel (Dual-Mode), nichts geht kaputt.
- **Phase A2 — Install-/Signatur-Pipeline.** GitHub-Download + Ed25519-Verifikation + Entpacken + Schema/Kompat-Check. Erst nur „install by repo-URL", noch keine UI.
- **Phase A3 — Store-UI.** Katalog-Repo + Settings-Tab + Install/Update/Remove/Enable.
- **Phase A4 — Migration der 4 Vertikalen.** Antares → reMarkable → (edoobox) → in je ein eigenes Repo; aus dem App-Bundle entfernen. Danach: frischer MindGraph-Download = Store + 0 auto-aktive Plugins (deine Vision Punkt 8 erfüllt).
- **Phase A5 — Politur.** Onboarding „Empfohlene Plugins", Update-Badges, Fehler-/Offline-Verhalten.
- **→ Phase B (separates Dokument):** Community öffnen ⇒ `utilityProcess`-Isolation (alter Schritt 10) + Permission-Consent + Fremd-Signaturen/Review.

## Offene Entscheidungen (für dich)

1. **edoobox** (S9): eigenes Repo + „featured", oder bleibt als einziges eingebaut?
2. **Reihenfolge** (S5/S12 vs S3/S7): Erst **Loader-Spike** (A1, beweist das harte Stück) — meine klare Empfehlung — oder erst **Store-UI** (A3, früher etwas Klickbares, aber ohne Substanz darunter)?
3. **API-Paket-Pflege** (S6): Ist dir bewusst, dass `@mindgraph/plugin-api` ab dann eine **öffentliche, rückwärtskompatibel zu pflegende** Schnittstelle ist (Versionierung, Deprecations)? Das ist der dauerhafte Unterhaltskosten-Treiber des ganzen Modells.
4. **Renderer-Tiefe** (S12): MVP zuerst nur **Main-only-Plugins** zulassen (kein Renderer-Code) und Renderer-Plugins später? Das würde A1 massiv entschärfen — aber Antares/reMarkable/edoobox HABEN UI, könnten also erst in der 2. Welle migrieren.

## Verhältnis zum bestehenden Plan

- **Ersetzt** Entscheidung #1 aus `docs/plugin-system-plan.md` („kein Drittanbieter-Marktplatz in dieser Phase") — wir aktivieren die dort vorgesehene spätere Stufe, in der **kuratiert+signierten** Form.
- **Behält** den Capability-Host, die Action-Registry, `ajv`-Validierung, das vertikale Ordnermodell, die Slot-Mechanik — das ist alles wiederverwendbar; es ändert sich nur **woher** und **wann** die Vertikalen geladen werden.
- **Zieht vor:** „Schritt 10 = `utilityProcess`" wird zu **Phase B** und ist erst beim Community-Öffnen Pflicht, nicht jetzt.
