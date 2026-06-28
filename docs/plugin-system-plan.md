# MindGraph Plugin-System

## Kurzidee

MindGraph hat heute „Module zum Ein-/Ausschalten", aber kein echtes Plugin-System. Abschalten blendet im Wesentlichen UI aus — Implementierung, IPC-Handler, Settings, Typen und Workflow-Code bleiben fest im Kern verdrahtet (`main/index.ts` ~11.800 Zeilen, 252 `ipcMain.handle()` inline). Jedes neue Modul (edoobox, Antares, reMarkable) wird an fünf zentralen Stellen ergänzt statt in einem lokalen Ordner zu leben.

Dieses Dokument zurrt fest, **wie wir das umbauen**: ein **internes Plugin-System** mit klaren Erweiterungspunkten, vertikalen Plugin-Ordnern und einem **Capability-Host** als Sicherheitsachse. **Kein** frei installierbarer Drittanbieter-Marktplatz in dieser Phase.

Pitch-Satz:

> Ein Modul ist ein Ordner. Es beschreibt sich selbst, meldet seine Fähigkeiten beim Start an und bekommt vom Kern nur die Dienste injiziert, die es deklariert hat. Lösche den Ordner → das Feature ist restlos weg.

## Beschlossener Stand (2026-06-27)

> Diese Sektion ist verbindlich und geht den Konzept-Abschnitten darunter vor, wo sie sich widersprechen. Sie ist das Ergebnis von zwei unabhängigen Architektur-Analysen gegen den realen Code, die konvergiert sind.

### Was wir bauen (in Klartext)

Eine **Plugin-Registry** als einziger Einstiegspunkt + ein **Capability-Host**, der jedem Plugin nur abgesicherte Dienste reicht (nie rohes `fs`/`net`/`electron`). Jedes Plugin ist eine **Vertikale** — ein Ordner mit Manifest, Main-Logik, Renderer-UI, Shared-Typen, Workflow-Beiträgen und Tests. Der Kern kennt dann nur noch „installierte / aktivierte / aktive Plugins", nicht mehr edoobox, Antares oder reMarkable einzeln.

```text
                         ┌─────────────────────────────┐
   src/plugins/antares/  │        PLUGIN-REGISTRY      │   src/plugins/remarkable/
   ┌──────────────┐      │   Activation + Readiness    │      ┌──────────────┐
   │ manifest     │─────▶│   getrennt; Fehler isoliert │◀─────│ manifest     │
   │ main/        │      └──────────────┬──────────────┘      │ main/        │
   │ renderer/    │                     │                     │ renderer/    │
   │ shared/      │            ┌────────▼─────────┐           │ shared/      │
   │ workflows/   │            │  CAPABILITY-HOST │           │ workflows/   │
   │ tests/       │            │  vault.write ────┼─▶ writeFileSafe / assertSafePath
   └──────────────┘            │  secrets.* ──────┼─▶ electron.safeStorage
                               │  llm.generate ───┼─▶ Ollama + isHardLocked + isCloudModel
                               │  http.fetch ─────┼─▶ Domain-Allowlist aus Manifest
                               │  workflow.action ┼─▶ Executor-Dispatch (typisiert)
                               └──────────────────┘
   (UI-Beiträge laufen NICHT über den Host, sondern über die Renderer-Registry an benannte Slots — keine Host-Capability.)
```

### Architektur-Entscheidungen (15)

| # | Branch | Entscheidung |
|---|--------|-------------|
| 1 | Ambition | **Internes** Plugin-System („bundled plugins" im bestehenden Build). **Kein** Drittanbieter-Marktplatz, keine JS-Download-Runtime — das ist eine *spätere, getrennte* Produktentscheidung. |
| 2 | Vorgehen | **Inkrementell, nicht Big-Bang.** Registry+Lebenszyklus zuerst, dann ein Plugin nach dem anderen migrieren. Kern bleibt jederzeit lauffähig. |
| 3 | Sicherheitsachse | **Capability-Host statt rohem Zugriff.** Plugins deklarieren Capabilities im Manifest und bekommen sie injiziert — durch dieselbe `writeFileSafe`/`assertSafePath`/`safeStorage`/`isHardLocked`/`isCloudModel`-Grenze, die der Workflow-Runner schon nutzt. **Wichtig (siehe „Architekturregel vs. echte Grenze"):** bei *gebündeltem* Code ist „kein direkter `fs`/`net`/`electron`-Import" zunächst nur eine **Architekturregel** (durchgesetzt per ESLint), **keine** Sandbox. Echte Sicherheit gegenüber Fremdcode entsteht erst in **Phase 2 durch Prozess-Isolation** (`utilityProcess`). |
| 4 | Template | Wir **generalisieren die vorhandene Workflow-Runner-Maschinerie** (`RunnerServices`-DI + `EXECUTORS`-Dispatch + `privacy`-Metadaten), statt ein neues Muster zu erfinden. |
| 5 | IPC | **Generischer Transport-Kanal, nicht-generische Actions.** Ein gemeinsamer Kanal `plugin:invoke(pluginId, actionId, payload)` — aber **kein freier Methodenaufruf**: die Registry schlägt Plugin+Action nach, **validiert die Payload gegen ein Schema**, prüft Aktivierung+Capabilities und normalisiert die Rückgabe. Zusätzlich akzeptiert der Dispatcher nur Aufrufe von explizit erlaubten MindGraph-`webContents`/Frames. Der Transport ist generisch, die *erlaubten Actions* sind es nicht. Kein neuer Eintrag pro Funktion im globalen `ElectronAPI`. |
| 6 | Locality | **Ein vertikaler Ordner pro Plugin:** `src/plugins/<name>/{manifest.ts,main/,renderer/,shared/,workflows/,tests/}`. Main- und Renderer-Code bleiben getrennte Entries, liegen aber in derselben Vertikale. |
| 7 | Plugin-Erkennung + Deletion Test | **Build-seitige Erkennung statt handgeschriebener Importliste.** Main- und Renderer-Registry erkennen ihre jeweiligen Entries ausschließlich über statische `import.meta.glob()`-Muster von Vite/electron-vite — **keine** dritte Registry im Preload und keine zentrale, von Hand gepflegte Import-Liste. **Deletion Test (präzise):** Nach Löschen von `src/plugins/<name>` kompiliert und startet die App ohne weitere Codeänderung; das Feature ist restlos weg (kein `switch`, kein Settings-Flag, kein `ElectronAPI`-Typ). |
| 8 | Manifest ≠ Code | **Manifest = reine serialisierbare Metadaten** (JSON-fähig, keine React-Komponenten/Funktionen). Ausführbarer Code lebt getrennt in **`main entry`** (Lifecycle/Registrierung) und **`renderer entry`** (React-Beiträge). **Zwei Registries** (Main + Renderer), verbunden über stabile Plugin- und Action-IDs. |
| 9 | Laufzeit-Validierung | TypeScript schützt nur compile-time. **Ein Validator: JSON Schema via `ajv`** für alles (Manifest, Plugin-State, gespeicherte Config, Action-IO, Settings). Begründung: `ajv` ist **bereits transitiv im Tree** (nur als direkte Dep pinnen, kein echter Neuzugang); JSON Schema ist als *serialisierbarer* Vertrag für #8 ohnehin Pflicht; die statische Typisierung kommt aus den TS-Interfaces + Capability-Generics (#15), damit ist Zods Inferenz-Vorteil hier redundant. **Kein Zod** (echte Neu-Dep + zweites System, widerspricht der puren `shared/`-Kultur). Untrusted zur Laufzeit: alte/korrupte Config + IPC-Payloads vom (potenziell kompromittierten) Renderer. |
| 10 | Lebenszyklus (3 Dimensionen) | Statt einer vermischten Kette: **Installation** `bundled \| unavailable` · **Activation** `disabled \| starting \| active \| stopping \| error` · **Readiness** `ready \| needs-configuration \| unavailable`. So zeigt ein aktiviertes Plugin sauber an, *warum* es noch nicht nutzbar ist (z.B. reMarkable braucht keine Credentials → nie `needs-configuration` wegen Secrets). Version + Config-Migration + sichere Deaktivierung gehören dazu. |
| 11 | Robustheit | **Ein defektes Plugin darf den App-Start nicht verhindern** — Fehler isolieren, Plugin in `error` parken, Rest der App läuft. |
| 12 | UI: gemischt, nicht voll schema-driven | **Einfache Settings** deklarativ aus `settingsSchema` generiert. **Komplexe UI** (reMarkable-Browser, Antares-Dashboard) bleibt **normale React-Implementierung**, nur an **benannten Slots** registriert (über die Renderer-Registry). Kein riesiges UI-Schema, das komplizierter als React selbst wird. |
| 13 | Workflow-Trennung | Generische Trigger im Kern; **fachliches Polling + Übersetzung fremder Daten gehört dem Plugin** (heute teils in `workflowStore.ts` verdrahtet). |
| 14 | Pilot-Reihenfolge | **Antares → reMarkable → edoobox.** Begründung unten. |
| 15 | Capability-Typing | **Generics von Anfang an** (`PluginMainEntry<C>`, `PluginHostFor<C>`, `definePluginMain` mit `as const`-Capabilities). Host ist *compile-time* so getypt, dass `host.vault.write` ein Typfehler ist, wenn nicht deklariert. **Hinweis:** das ist Compile-Time-Assist, **nicht** die Sicherheitsgrenze — die echte Grenze bleibt der Laufzeit-Capability-Check (#3). |

### Pilot-Reihenfolge (begründet)

Die Reihenfolge ist bewusst nach *steigender Härte der Seam*, nicht nach gefühlter Einfachheit:

1. **Antares zuerst** — read-only, HTTP + `safeStorage`, ein Dashboard-Widget, **kein Schreibpfad**, kein natives Modul. Das ist der langweiligste Fall und genau deshalb der richtige erste: er verriegelt die **Registrierungs-Seam** (Manifest, Lebenszyklus, Capability-Injection, Deletion Test) bei minimalem Risiko. (10 Handler, `index.ts:10703-10825`, `antaresService.ts`.)
2. **reMarkable als zweites** — der **Stresstest** für den Host. Hängt an einem nativen `libusb`-Binding *und* der `pdfjs-dist`-Externalisierung (legacy-ESM, darf nicht gebündelt werden — dokumentierter Crash-Fall). Validiert, ob der Capability-Host die harten Fälle trägt: `vault.write`-Pfad, native Module, Bundling. Bewusst **nicht** zuerst, weil genau diese Eigenschaften eine „Plugin-Bundle"-Story am ehesten brechen. (8 Handler, `index.ts:10109-10370`, `remarkable/`.)
3. **edoobox/MZ-Suite zuletzt** — stärkste Kopplung (Kontakte, Marketing, Workflows, Formular-Parser). Migriert erst, wenn Manifest, Host und UI-Slots an den ersten beiden bewährt sind. (12 Handler, `index.ts:10378-10700`, `edooboxService.ts`.)

---

## Ausgangslage (wie ein Modul heute verdrahtet ist)

Ein Modul existiert heute als 5 unverbundene Fragmente **ohne Vertrag** dazwischen. Beispiel Antares:

| Schicht | Heute | Symptom |
|---|---|---|
| Settings | Felder in `uiStore.ts:355` (`enabled`, `baseUrl`, `context`) | Jedes Modul mischt seine Config in den globalen UI-State |
| Main-Service | `antaresService.ts` (isoliert) | ✅ Der gesunde Teil — Klasse mit klaren Methoden |
| **IPC** | **10 Handler inline in `index.ts:10703-10825`** | Hauptspaghetti: 252 Handler in *einer* Datei, lazy `import()` pro Handler |
| Preload/Typen | Methoden im globalen `ElectronAPI` (`preload.ts`, `shared/types.ts`) | Jede IPC-Methode bläht ein zentrales Typ-Interface auf |
| Store + UI | `antaresStore.ts`, Dashboard-Widget, Settings-Sektion | Fest in zentrale Komponenten verdrahtet |

Das `MODULES`-Register (`uiStore.ts:464`, Interface `ModuleDescriptor`) hält heute **nur Kosmetik** (Label, Icon, Farbe, Kategorie). Es weiß nicht, *was ein Modul beiträgt* — keine IPC-Handler, keine UI-Slots, keine Capabilities. Genau dieses Manifest fehlt.

### Was wir schon richtig gebaut haben

Das **Workflow-Subsystem ist im Kleinen bereits ein Plugin-Host** und dient als Template:

- **Deklaratives Metadaten-Register, kein `run()`** — `shared/workflow/registry.ts:44-386`, prozessübergreifend lesbar.
- **Dispatch über `actionId` → `EXECUTORS`-Map** — `main/workflows/runner.ts:162`, statt fest verdrahteter Aufrufe.
- **Capability-Injection via `RunnerServices`** — `runner.ts:49-68`: der Executor kennt weder `fs` noch Ollama, er bekommt `createNote`/`ollamaGenerate`/`ragRetrieve` gereicht.
- **Gates eingebaut** — `isModuleActive`, `isHardLocked`, `isCloudModel`-Block, `privacy`-Metadaten pro Action.
- **Eine Schreibgrenze** — alles landet bei `writeFileSafe()` → `assertSafePath` (`index.ts:1050`, `429`).

Der Umbau ist also nicht „neu erfinden", sondern **dieses Muster vom Workflow-Subsystem auf das ganze Modulsystem hochziehen.**

---

## Die Sicherheitswand (warum kein Obsidian-Modell)

MindGraph ist **kein Obsidian.** Obsidian-Plugins bekommen vollen Node-Zugriff, das Modell ist „vertrau allen". MindGraph hält **E-Mail-Inhalte, IMAP/SMTP-Credentials, Kalender, `safeStorage`-Secrets, den ganzen Vault.** Ein Fremd-Plugin mit `require('fs')` + `require('net')` im Main-Prozess kann all das exfiltrieren — und die Marketingaussage „verlässt nie deinen Rechner" ist tot (siehe Leitwert: keine personenbezogenen Daten in die Cloud).

Daraus die unverhandelbare Designregel:

> **Plugins bekommen niemals rohes `fs`/`net`/`electron`. Sie deklarieren Capabilities und bekommen sie injiziert — durch dieselbe abgesicherte Grenze, die der Kern schon hat.**

Das ist die Voraussetzung dafür, dass Drittanbieter-Plugins *überhaupt jemals* denkbar werden. Selbst dann nur kuratiert/signiert **oder** mit echter Prozess-Isolation (`utilityProcess`/Sandbox) und Per-Plugin-Consent — niemals „jeder lädt beliebigen Code".

### Architekturregel vs. echte Grenze (Phase 1 / Phase 2)

Ehrliche Abgrenzung, damit wir keine Sicherheit *simulieren*:

| | **Phase 1 — Capability-Host (jetzt)** | **Phase 2 — Prozess-Isolation (später)** |
|---|---|---|
| Was es leistet | Entkopplung, Testbarkeit, kontrollierte Interfaces | **Tatsächliche** Sicherheit gegenüber fremdem Code |
| Durchsetzung | **ESLint-Verbot** direkter Imports aus `electron`/`fs`/`net`/`child_process`/… in `src/plugins/**` | Plugin läuft in eigenem `utilityProcess`, nur Message-Passing |
| Grenze | Architekturregel — gebündelter Main-Prozess-Code *kann* sie technisch umgehen | Echte OS-/Prozess-Grenze |
| Reicht für | **bundled, First-Party** Plugins | **Drittanbieter / nachinstallierbar** |

Solange alle Plugins gebündelt und First-Party sind, genügt Phase 1 (Regel + ESLint-Wall). Sobald *nachinstallierbarer Fremdcode* ins Spiel kommt, ist Phase 2 **Pflicht** — die Capability-Liste pro Plugin wird dann zum Berechtigungsmodell mit User-Consent.

---

## Interface-Skizze (Diskussionsgrundlage, nicht final)

Drei Artefakte pro Plugin sind **strikt getrennt**, liegen aber gemeinsam in einer Vertikale: serialisierbares Manifest · Main-Entry (Code) · Renderer-Entry (Code). Verbunden werden sie nur über stabile IDs.

```text
src/plugins/<id>/
  manifest.ts
  main/index.ts
  renderer/index.tsx
  shared/
  workflows/
  tests/
```

```ts
// (1) plugins/<id>/manifest.ts — REIN SERIALISIERBAR (JSON-fähig, KEIN Code/JSX)
export interface PluginManifest {
  id: string                      // 'antares' — stabile ID, verbindet alle Entries
  version: string                 // SemVer, für Config-Migration
  label: string
  description: string
  category: ModuleCategory
  icon?: { text?: string; color?: string }

  capabilities: PluginCapability[]   // was der Host bereitstellen muss
  http?: { allowedHosts: string[] }  // Domain-Allowlist für host.http.fetch
  credentials?: CredentialRequirement[]
  // JSON Schema ist der serialisierbare Vertrag; keine Zod-Objekte oder Funktionen:
  settingsSchema?: JsonSchema
  actions?: ActionDef[]              // { id, requiredCapabilities, inputSchema, outputSchema, privacy, hardLockModule }
  // UI-Beiträge nur als SLOT-DEKLARATION (welcher Slot + welche Action-ID liefert Daten), KEINE Komponente:
  ui?: { settingsTab?: boolean; dashboardWidget?: SlotDecl; sidebarPanel?: SlotDecl }
  privacy?: { containsPersonalData?: boolean; localOnly?: boolean }
}

export type PluginCapability =
  | 'vault.read' | 'vault.write' | 'secrets'
  | 'llm.generate' | 'http.fetch' | 'workflow.action'
```

```ts
// (2) plugins/<id>/main/index.ts — MAIN-ENTRY: Lifecycle + Action-Implementierung
export type PluginActionExecutor = (payload: unknown) => Promise<unknown>

export interface PluginActionRegistry {
  register(actionId: string, execute: PluginActionExecutor): void
}

export interface PluginMainContext<C extends readonly PluginCapability[]> {
  host: PluginHostFor<C>
  actions: PluginActionRegistry
}

export interface PluginMainEntry<C extends readonly PluginCapability[]> {
  id: string                                                 // === manifest.id
  register(context: PluginMainContext<C>): void | Promise<void>
  start?(context: PluginMainContext<C>): Promise<void>
  stop?(): Promise<void>
}

// shared/plugins/host.ts — generalisiert RunnerServices
// PluginHostFor<C> enthält statisch und zur Laufzeit NUR die in C deklarierten Capabilities.
export type PluginHostFor<C extends readonly PluginCapability[]> =
  CapabilityServicesFor<C> & {
    log: (msg: string) => void
  }

// Der konkrete Entry bindet C an die `as const` deklarierten Manifest-Capabilities:
export default definePluginMain(manifest, ({ host, actions }) => {
  // host enthält hier nur die vom Manifest erlaubten Bereiche.
})
```

```ts
// (3) plugins/<id>/renderer/index.tsx — RENDERER-ENTRY: React-Beiträge an benannte Slots
export interface PluginRendererEntry {
  id: string                                                 // === manifest.id
  contribute(slots: SlotRegistry): void                      // registriert React-Komponenten an Slot-IDs
}
// einfache Settings: aus manifest.settingsSchema generiert. Komplexe UI (Dashboard/Browser): echte React-Komponente hier.
```

- **Zwei Registries** (`main/plugins/registry.ts`, `renderer/plugins/registry.ts`), über `manifest.id` + `actionId` gekoppelt. Main und Renderer sammeln ihre Entries mit je einem statischen Glob-Muster unter `src/plugins/*/main/` beziehungsweise `src/plugins/*/renderer/`; der Preload stellt nur den schmalen Transport bereit.
- `PluginMainContext.actions` ist die einzige Seam zur Anmeldung ausführbarer Actions. Eine Action muss im Manifest deklariert sein, bevor ihr Executor registriert werden kann.
- Der Host gibt einem Plugin statisch **und** zur Laufzeit genau die Capabilities, die sein Manifest deklariert. Fehlt `vault.write`, existiert `host.vault.write` für dieses Plugin nicht. Jede Capability läuft durch dieselben Gates wie der Workflow-Runner.
- **Aufruf-Pfad:** Renderer ruft `plugin:invoke(id, actionId, payload)` → Transport prüft erlaubte `webContents`/Frames → Main-Registry validiert Payload gegen das JSON Schema, prüft Activation+Capabilities → ruft Plugin-Executor → validiert Output → normalisierte Antwort.

---

## Migrationsschritte

Reihenfolge bewusst: **erst die Verträge (Manifest-Modell, Registries, validierter Transport, Host+ESLint), dann erst migrieren.** Sonst baut man Ordner, die Entkopplung nur simulieren.

1. **Entscheidungen festhalten** — dieses Dokument (die 14 Entscheidungen oben sind die ADR). Bei Bedarf später `CONTEXT.md`/`docs/adr/` einführen; aktuell folgt die Doku der `docs/*-plan.md`-Konvention.
2. **Serialisierbares Manifest + Plugin-Zustandsmodell definieren** — `shared/plugins/{manifest,state,schemas}.ts`. 3-Dimensionen-Lifecycle; **`ajv` (JSON Schema) als einziger Validator** (direkte Dep pinnen), für interne Strukturen *und* serialisierbare Verträge. Capability-Generics (`PluginHostFor<C>`) gleich mitdefinieren.
3. **Architecture Spike mit Demo-Plugin** — vertikaler Ordner `src/plugins/demo/`, getrennte Main- und Renderer-Registry via `import.meta.glob`, gekoppelt über `manifest.id`. Tests prüfen Registrierung/Aktivierung/Fehler/Deaktivierung, Renderer-Slot und „defektes Plugin bricht Start nicht".
4. **Validierten Action-Transport** — `plugin:invoke(id, actionId, payload)` mit Senderprüfung, JSON-Schema-Validierung In/Out, Activation- + Capability-Check und Fehler-Normalisierung.
5. **Capability-Host + Import-Regeln** — Host als generalisiertes `RunnerServices`; **ESLint-Wall** gegen `electron`/`fs`/`net`/`child_process` in `src/plugins/**`.
6. **Antares migrieren** (Pilot 1) — verriegelt die Registrierungs-Seam (read-only, kein Schreibpfad). Deletion Test grün.
7. **Interfaces am Antares-Piloten stabilisieren** — erst danach gelten Manifest/Host/Transport als „eingefroren genug" für die nächsten.
8. **reMarkable migrieren** (Pilot 2) — Stresstest: `vault.write`, natives `libusb`-Modul, `pdfjs`-Bundling.
9. **edoobox/MZ-Suite migrieren** (Pilot 3) — stärkste Kopplung (Kontakte/Marketing/Workflows), zuletzt.
10. **Erst danach** über externe Plugins + echte Isolation (`utilityProcess`, Signierung, Permissions) entscheiden — eigene Phase.

### Definition of Done pro Plugin

- [ ] Manifest ist rein serialisierbar; Code nur in Main-/Renderer-Entry; kein direkter `fs`/`net`/`electron`-Import (ESLint grün)
- [ ] Alle Aufrufe über `plugin:invoke` mit Senderprüfung und JSON-Schema-Validierung; **keine** neuen globalen `ElectronAPI`-Einträge
- [ ] Einfache Settings deklarativ; komplexe UI als React-Komponente an benanntem Slot
- [ ] Zod-Schemas für Manifest/State/Config und JSON Schemas für Settings/Action-IO vorhanden und geprüft
- [ ] `npm run typecheck` + `npm run test` grün; Plugin hat eigene Tests in `src/plugins/<name>/tests/`
- [ ] **Deletion Test (präzise):** Ordner gelöscht → `import.meta.glob`-Katalog neu erkannt → App **kompiliert und startet ohne weitere Codeänderung**, Feature restlos weg
- [ ] Defektes Plugin (Manifest invalide / `register` wirft) → App startet trotzdem, Plugin in `error`

---

## Bewusst (noch) nicht

- **Keine allgemeine JS-Plugin-Runtime mit Download/`eval` von beliebigem Code.** Das erzwingt Signierung, Sandboxing, Update- und Permission-Mechanik, bevor die internen Seams stabil sind. Erst „bundled plugins", echte nachinstallierbare Pakete sind eine spätere Phase.
- **Kein *freier* Methodenaufruf über IPC.** Der Transport-Kanal `plugin:invoke` ist generisch, die erlaubten Actions sind es nicht — Registry-Lookup + Schema-Validierung + Capability-Check. (Unterschied zu einem ungeprüften `plugin-invoke(name, args)`-Passthrough.)
- **Kein Obsidian-artiger Voll-Node-Zugriff** für Plugins — unvereinbar mit Email/Credentials/Privacy-Leitwert.
- **Kein voll schema-getriebenes UI.** Nur einfache Settings deklarativ; komplexe Komponenten bleiben React.
- **Keine handgeschriebene zentrale Plugin-Importliste** — nur Build-seitige Erkennung (`import.meta.glob`).

---

## Referenzen (Code-Stand 2026-06-27)

- Modul-Register (Kosmetik): `app/src/renderer/stores/uiStore.ts:441-481`
- Modul-Gating: `app/src/renderer/utils/modules.ts`
- Workflow-Registry (Template): `app/src/shared/workflow/registry.ts:44-386`
- Workflow-Dispatch + `RunnerServices` (Template): `app/src/main/workflows/runner.ts:49-68, 162-364`
- Schreibgrenze: `app/src/main/index.ts:380-457` (`assertApprovedVault`/`assertSafePath`), `1050-1078` (`writeFileSafe`)
- IPC-Handler je Modul: Antares `index.ts:10703-10825`, reMarkable `index.ts:10109-10370`, edoobox `index.ts:10378-10700`
- Services: `app/src/main/antaresService.ts`, `app/src/main/edooboxService.ts`, `app/src/main/remarkable/`
