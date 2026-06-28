# A0 · Schritt 1 — `@mindgraph/plugin-api` schälen (Plan / ADR)

> **Status: UMGESETZT (2026-06-28).** Erster Schritt von **Phase A0** aus `docs/plugin-store-plan.md`
> („Verträge & Format"). Entscheidungen A/B/C bestätigt, Surface korrigiert. In sechs Commits
> (C1 Gerüst → C2 Leak-Inversion → C3 Move+Stubs+Drift-Test → C4 Kern-Rewire → C5 Vertikalen+Test-Split+
> Stub-Löschung → C6 Verifikation) umgesetzt. Alle Akzeptanzkriterien erfüllt (s.u.). Manifest v2,
> Repo-Template und Build/Sign-Action bleiben **spätere A0-Schritte**.

## Ziel dieses Schritts

Aus dem heutigen `app/src/shared/plugins/*` wird ein eigenständiges, versioniertes Paket
`@mindgraph/plugin-api` — die **stabile, öffentlich gepflegte Grenze** zwischen App und Plugin
(Store-Plan S6). Inhalt laut S6: **nur Typen + schmale Laufzeit-Helfer**, kein App-Code.

Harte Randbedingung von A0: **kein App-Verhalten ändert sich.** Erfolg heißt: `npm run typecheck`,
`npm run test`, `npm run build` bleiben grün, und der Deletion-Test der vier Vertikalen bleibt grün.
Es ist eine reine Struktur-/Grenz-Änderung.

## Bestätigte Entscheidungen (2026-06-28)

- **A — Workflow-Typen JETZT sauber herauslösen** (nicht vertagen). Sonst wäre `PluginManifest` im neuen
  Paket absichtlich unvollständig. Es wandern **nur die plugin-zugewandten DTOs**; das übrige
  Workflow-Modell (Graph, Edges, Run/Runner-Interna) bleibt App-intern.
- **B — Echtes Paket bei `app/packages/plugin-api`.** Da `app/` der npm-Root mit dem Lockfile ist
  (kein Repo-Root-`package.json`), wird **`app/package.json` zum Workspace-Root**. Kein neuer
  Repository-Root-Workspace (unnötig disruptiv).
- **C — SemVer-Unterhaltskosten akzeptiert.** Vorerst `"private": true`, Version `0.1.0`, **kein Publish**.

## Paket-Surface (korrigiert — NICHT alle zehn Dateien werden öffentlich)

| Datei (heute) | Rolle | Ziel |
|---|---|---|
| `manifest.ts` | Manifest-Typen (`PluginManifest`, `ActionDef`, `PluginCapability`, …) | **Paket** (Haupt-Entry) |
| `host.ts` | Capability-Host-**Interfaces** + `PluginHostFor<C>`-Generics | **Paket** |
| `entry.ts` | Main-/Renderer-Entry-Typen + `definePluginMain` | **Paket** |
| `workflowTrigger.ts` | plugin-facing Trigger-Provider-**Vertrag** + Slot-Konstanten | **Paket** |
| _(neu)_ Workflow-DTOs | plugin-zugewandte Beitrags-Typen (s. E3) | **Paket** |
| _(neu)_ `version.ts` | `API_VERSION` | **Paket** |
| `index.ts` | Barrel | **Paket** (Haupt-Entry) |
| `schemas.ts` | ajv-Validatoren (`validateManifest`, `validateAgainst`, `PLUGIN_MANIFEST_SCHEMA`) | **Paket, Subpath `@mindgraph/plugin-api/validation`** |
| `state.ts` | 3-Dim-Lebenszyklus-/Store-Implementierung | **App-intern** (bleibt in `shared/plugins/`) |
| `transport.ts` | `PluginInvokeResult` — Electron-Wire-Protokoll | **App-intern** |
| `moduleGate.ts` | `isPluginGateEnabled` — uiStore-Pfade + Host-Mechanik | **App-intern** |
| `plugins.test.ts` | 13 Vertrags-Tests | **aufteilen** nach Surface (Paket-Tests ziehen mit, state/transport/moduleGate-Tests bleiben App) |

Begründung des Schnitts: Ein **Plugin-Autor** deklariert ein Manifest, fordert Host-Dienste an, schreibt
Entries und steuert Workflow-Beiträge bei — das ist der Vertrag. Den **Lebenszyklus-Zustand** (`state.ts`)
konstruiert der Host, nicht das Plugin; das **IPC-Wire-Format** (`transport.ts`) und die **uiStore-Pfad-
Mechanik** (`moduleGate.ts`) sind App-Interna. Sie bleiben geteilt in `app/src/shared/plugins/`, sind aber
**nicht** Teil der öffentlichen Surface. Richtung sauber: app-internes `moduleGate.ts` importiert
`PluginManifest` **aus** dem Paket — nie umgekehrt.

Die Implementierungen (`main/plugins/*`, `renderer/plugins/*`) sind ohnehin kein Paket-Inhalt — Plugins
importieren sie nie. **39 Dateien** importieren heute aus `shared/plugins`; sie teilen sich nach diesem
Schritt auf in **Vertrags-Konsumenten** (→ `@mindgraph/plugin-api` bzw. `/validation`) und
**App-intern-Konsumenten** (→ weiter `shared/plugins/{state,transport,moduleGate}`).

## Der harte Punkt: drei Dep-Leaks aus `shared/plugins` heraus

Ein eigenständiges Paket darf nicht `from '../modelCompatibility'` importieren — es hat kein Elternverzeichnis.
Genau **drei** reine **Type-only-**Importe verhindern heute den Standalone-Compile. Sie aufzulösen **IST** die
Arbeit dieses Schritts.

| # | Leak | Quelle | Verwendet in | Auflösung |
|---|---|---|---|---|
| 1 | `ModuleId` (als `CompatModuleId`) | `modelCompatibility.ts` | `manifest.ts`, `host.ts` | Union → Paket; `modelCompatibility.ts` re-exportiert, Verdict-**Matrix** bleibt App |
| 2 | `WorkflowPrivacyMetadata` | `workflow/types.ts` | `manifest.ts` | → Paket; `workflow/types.ts` re-exportiert |
| 3 | plugin-facing Workflow-DTOs | `workflow/{types,model}.ts` | `manifest.ts`, `workflowTrigger.ts` | **jetzt** sauber extrahieren (s. E3) |

## Entscheidungen (ADR-Kern)

### E1 — Paket-Inhalt = Vertrag, zwei Entry-Points
Öffentlich (Haupt-Entry `@mindgraph/plugin-api`): Manifest-Typen · Capability-Host-Interfaces ·
Main-/Renderer-Entry + `definePluginMain` · plugin-facing Workflow-Beiträge · `API_VERSION`.
**Keine** `electron`/`fs`/`net`-Nähe, **keine** React-Nähe (`SlotRegistry.register(component: unknown)`
bleibt React-frei). Die **Validatoren** liegen auf dem Subpath `@mindgraph/plugin-api/validation` —
so zieht der normale Plugin-Import (nur Typen) **kein Ajv** ein; nur Code, der wirklich validiert
(Main-Registry, Renderer-Katalog), importiert vom Subpath.

### E2 — Ort: `app/packages/plugin-api/`, `app/package.json` als Workspace-Root
`app/package.json` bekommt `"workspaces": ["packages/*"]`. Paket-Quellen unter
`app/packages/plugin-api/src/`, eigene `package.json` (`name: "@mindgraph/plugin-api"`, `version: "0.1.0"`,
`"private": true`, `exports` mit `.` und `./validation`) + `tsconfig.json`. electron-vite/tsconfig der App
lösen die Workspace-Referenz auf. Übergangs-Brücke: `shared/plugins/index.ts` re-exportiert das Paket,
damit die 39 Importe in **kleinen Commits** statt Big-Bang umziehen — am Schluss ist die Brücke weg.

### E3 — Workflow-DTOs: exakte plugin-zugewandte Hülle
Ins Paket wandert die transitive Hülle, die das Manifest + der Trigger-Vertrag brauchen — nicht mehr:

- aus `workflow/types.ts`: `WorkflowActionDefinition`, `WorkflowPortDefinition`, `WorkflowPortKind`,
  `WorkflowConfigField`, `WorkflowConfigFieldType`, `WorkflowModuleId`, `WorkflowPrivacyMetadata` (= Leak #2).
- aus `workflow/model.ts`: `WorkflowRunTrigger`, `WorkflowSeedItem`.

**Bleibt App-intern** (Workflow-Modell-Kern): `Workflow`, `WorkflowNode`, `WorkflowEdge`, `WorkflowSchedule`,
`WorkflowRun`, `WorkflowRunStep`, `WorkflowRunPayload`, `WorkflowHandoff`, `WorkflowValidation*`,
`WorkflowFile`, `WorkflowSeed`, Run-Status-/Mode-Unions. `workflow/{types,model}.ts` re-exportieren die
verschobenen DTOs, damit der bestehende Workflow-Code unverändert weiterläuft.

### E4 — Laufzeit-Dependency: `ajv` nur auf `/validation`
`ajv` (`^6.14.0`, schon direkte App-Dep) ist `dependency` des Pakets, aber nur der `/validation`-Subpath
importiert es. Haupt-Entry bleibt dependency-frei (reine Typen + `definePluginMain`). Kein Zod (Hauptplan-Verbot).

### E5 — `API_VERSION` säen **und gegen die Paketversion testen**
Paket exportiert `API_VERSION` als Saat fürs spätere Manifest-`apiVersion`/Kompat-Gate (S7). Ein Test liest
`packages/plugin-api/package.json` und prüft, dass `API_VERSION` mit der Paketversion übereinstimmt
(mindestens Major/Minor) — beide dürfen nicht auseinanderlaufen.

### E6 — Null Verhaltensänderung, Deletion-Test bleibt Akzeptanzkriterium
Keine UI, keine Manifest-Feldänderung, kein Renderer-/Main-Verhalten. Der bestehende Deletion-Test
(Vertikale-Ordner weg ⇒ typecheck+build grün) bleibt grün — Beweis, dass die Paketgrenze die Entkopplung
nicht zurückdreht.

## Migrationsschritte (sechs kleine Commits, App nach jedem lauffähig)

1. **Workspace + leeres Paket.** `app/packages/plugin-api/{package.json,tsconfig.json,src/}`;
   `app/package.json` → `workspaces`; electron-vite/tsconfig-Resolver. `ajv` als Paket-Dep, `exports`
   `.`+`./validation`.
2. **Leaks invertieren (E1#1, E2, E3).** `CompatModuleId`, `WorkflowPrivacyMetadata` + die plugin-facing
   Workflow-DTOs ins Paket; `modelCompatibility.ts` / `workflow/*` auf Re-Export. *Hier zuerst den
   isolierten `tsc` des Pakets grün kriegen — das ist der Lackmustest des Standalone-Compiles.*
3. **Vertrags-Dateien verschieben.** `git mv` von `manifest/host/entry/workflowTrigger.ts` + Barrel nach
   `packages/plugin-api/src/`; `schemas.ts` → `src/validation.ts`. `state/transport/moduleGate.ts` bleiben
   in `shared/plugins/`. `API_VERSION` + Drift-Test (E5) anlegen.
4. **Übergangs-Brücke.** `shared/plugins/index.ts` re-exportiert `@mindgraph/plugin-api` (+ behält die
   app-internen `state/transport/moduleGate`-Exports), damit die 39 Importe schrittweise umziehen.
5. **Konsumenten umstellen** (Main → Renderer → 4 Vertikalen): Vertrag → `@mindgraph/plugin-api`,
   Validatoren → `@mindgraph/plugin-api/validation`, app-interne → `shared/plugins/...`. Brücke löschen.
   `plugins.test.ts` nach Surface aufteilen.
6. **Verifizieren.** isolierter Paket-`tsc` · `typecheck` · `test` · `build` · exemplarischer Deletion-Test ·
   Bundle-Stichprobe (Ajv nicht im Renderer-Haupt-Bundle, weil nur `/validation` es zieht).

## Akzeptanzkriterien (alle erfüllt ✅)

- `app/packages/plugin-api` **kompiliert isoliert** (eigener `tsc`), ohne `app/src/*` zu importieren.
- Öffentlicher Haupt-Entry ist **Ajv-frei**; `ajv` nur über `@mindgraph/plugin-api/validation` erreichbar.
- `state/transport/moduleGate` sind **nicht** öffentlich (kein Re-Export aus dem Paket-Barrel).
- Kein `shared/plugins/{manifest,host,entry,workflowTrigger,schemas,index}` mehr; Konsumenten am Paket.
- `API_VERSION` exportiert **und** per Test an die Paketversion gekoppelt.
- `npm run typecheck` · `test` · `build` grün; Deletion-Test grün.

## Vertrags-Nachschärfung (Review nach C6, 2026-06-28)

Zwei Typ-Fehler im öffentlichen Vertrag, die VOR Manifest v2 zu fixen waren — C2 hatte zwei
Kern-Konzepte über-extrahiert:

- **`WorkflowActionDefinition.moduleId` ist jetzt `string`** (vorher die geschlossene `WorkflowModuleId`-
  Union, die ausgerechnet `antares`/`edoobox` enthielt). Ein neues Store-Plugin kann so seine eigene
  Modul-Id deklarieren, ohne das API-Paket zu ändern. Die geschlossene **Kern-Modul-Union** (jetzt ohne
  Plugin-Namen) bleibt App-intern in `shared/workflow/types.ts` (Quelle für Kern-Tabellen/-Icons). Folge:
  `ModuleIcon`/`WorkflowPalette`/`moduleAvailability` auf offene `string`-Keys umgestellt (Kern-Maps casten
  beim Lookup, Fallback IconBox).
- **`WorkflowEventResult.trigger` ist jetzt `'event-external'` statt der vollen `WorkflowRunTrigger`-Union.**
  Ein heruntergeladener Trigger-Provider kann damit keine Provenienz (`manual`, `event-email`, …) forgen
  und so das Hand-off-/Human-in-the-loop-Verhalten beeinflussen. Die volle Union bleibt App-intern
  (`shared/workflow/model.ts`); nur der **Mail-Signalpfad** des Kerns mintet reichere Trigger. Der
  eingebaute Tasks-Provider trägt jetzt generische `event-external`-Provenienz (verhaltensgleich:
  `isEventTrigger = trigger !== 'manual'`).

## Bewusst NICHT in diesem Schritt

Manifest v2 (`minAppVersion`/`apiVersion`-Felder, neue Capabilities) · Repo-Template · Build/Sign-Action ·
Runtime-Loader · Store-UI · npm-Publish · die A0-**i18n-Schuld** (Plugin-Strings aus `translations.ts`
herauslösen — kommt, sobald das Paket einen Übersetzungsmechanismus definiert).

## Risiken

- **electron-vite + Workspace:** alle drei Prozess-Builds (main/preload/renderer) müssen das Workspace-Paket
  + den `/validation`-Subpath auflösen und bündeln. Früh an **einer** Datei verifizieren, bevor 39 Importe umziehen.
- **Re-Export-Zyklus:** `modelCompatibility`/`workflow` importieren aus dem Paket; das Paket darf NICHT zurück
  in den App-Baum greifen — sonst Zyklus. Der isolierte `tsc` aus Schritt 2 fängt das ab.
- **Subpath-Disziplin:** rutscht ein Validator-Import versehentlich in den Haupt-Entry, zieht jeder Plugin-
  Import Ajv mit. Bundle-Stichprobe (Schritt 6) ist die Kontrolle.
- **Version-Drift:** `API_VERSION` ≠ Paketversion — durch den Test aus E5 abgedeckt.
- **Test-Heimat:** Paket-Tests laufen künftig unter `packages/**`; vitest-Konfig muss das einschließen,
  sonst fällt die Vertragsabdeckung still aus dem CI.
