# A0 · Schritt 2 — Manifest v2 (Plan / ADR)

> **Status: BESCHLOSSEN — Umsetzung folgt.** Zweiter Schritt von **Phase A0** aus
> `docs/plugin-store-plan.md` („Verträge & Format"). Folgt auf `docs/plugin-api-package-plan.md`
> (Schritt 1, umgesetzt & auf `master`). Branch: `feat/plugin-manifest-v2` (eigenständig von
> `master`). Entscheidungen unten sind mit dem User abgestimmt und eingefroren.

## Ziel dieses Schritts

Das Plugin-Manifest bekommt eine **explizite Version (`manifestVersion: 2`)** und die Felder,
die ein späterer Disk-/Store-Loader (A2) braucht, um Fremd-Plugins sicher gegen die laufende
App zu prüfen: **API-Kompatibilität**, **Mindest-App-Version**, **Autor** und **Entry-Points**.
Zusätzlich entsteht ein **aktives Kompatibilitäts-Gate** (API- *und* App-Version), das ein
Plugin mit unpassender `apiVersion`/`minAppVersion` gar nicht erst aktiviert.

Harte Randbedingung von A0 bleibt: **kein sichtbares App-Verhalten ändert sich.** Die vier
gebündelten Plugins (antares, edoobox, remarkable, demo) laufen nach der Migration exakt wie
heute — sie sind nur formal v2 und passen per Konstruktion durch das Gate.

## Scope-Abgrenzung (was dieser Schritt NICHT tut)

- **Kein Runtime-/Disk-Loader.** Plugins werden weiter ausschließlich aus `src/plugins/*` via
  `import.meta.glob` entdeckt (Schritt-1-Mechanik). Externe Quellen sind A1.
- **Keine Signatur-Verifikation.** Echte Prüfung ist A2 (siehe Entscheidung 7).
- **Entry-Points werden definiert, aber noch nicht ausgewertet.** Der Glob-Discovery paart
  weiterhin über den Ordnernamen; `entrypoints` ist reserviertes Vertrags-Feld für A1.

> **Reserviert ≠ inaktiv für alles.** Reserviert-aber-noch-nicht-ausgewertet sind nur
> `entrypoints` und die Signatur (Sidecar). Das **Kompatibilitäts-Gate (API + App) ist in
> diesem Schritt aktiv** — es blockiert real (Entscheidung 3). Kein Widerspruch: Felder, deren
> Auswertung einen Loader braucht, warten auf A1; das Gate braucht nur `API_VERSION`,
> `app.getVersion()` und die beiden Manifest-Versionsfelder und kann sofort greifen.

## Beschlossene Entscheidungen

### 1. Versionsfeld `manifestVersion` — strikt `const: 2`, global verpflichtend

`manifestVersion` ist ein neues, **global verpflichtendes** Top-Level-Feld mit `const: 2`. Kein
konditionales Schema: ein `if manifestVersion==2 then …` würde unversionierte v1-Manifeste
weiterhin durchlassen und wäre, solange die Property selbst `const: 2` ist, ohnehin nicht
v3-fähig. **v3 bekommt später bewusst ein eigenes Schema** — nicht ein aufgeweichtes v2.

```jsonc
"required": ["manifestVersion", "id", "version", "label", "description", "category",
             "capabilities", "apiVersion", "minAppVersion", "author", "entrypoints"],
"properties": { "manifestVersion": { "const": 2 }, … }
```

Das Schema bleibt `additionalProperties: false`; alle neuen Felder werden explizit in
`properties` aufgenommen (sonst weist die Strictness sie ab).

### 2. Neue v2-Felder

| Feld              | Typ                                   | Pflicht | Bedeutung |
|-------------------|---------------------------------------|:-------:|-----------|
| `manifestVersion` | `2` (const)                           | ja      | Format-Diskriminator. |
| `apiVersion`      | SemVer-**Range**, z. B. `"^0.2.0"`    | ja      | Welche `@mindgraph/plugin-api` das Plugin verträgt. **Range**, nicht Punktversion. |
| `minAppVersion`   | SemVer (konkret), z. B. `"0.8.14"`    | ja      | Mindest-App-Version. **Aktiv gegated** (Entscheidung 3). |
| `author`          | `{ name: string; url?: string; email?: string }` | ja | Autor-Objekt. Bewusst sofort Objekt — eine spätere String→Objekt-Umstellung wäre nicht additiv, sondern erzwänge dauerhaft eine Union. |
| `entrypoints`     | `{ main?: string; renderer?: string; styles?: string }` | ja | **Gebaute Artefakte** (nicht TS-Quellen). **At-least-one:** `main` ODER `renderer`. |
| `repo`            | `string` (echte URL)                  | nein    | Optionaler Quell-/Store-Link. |

**`entrypoints`-Constraint** (ajv): `anyOf: [{ required: ['main'] }, { required: ['renderer'] }]`.
**Werte sind Artefaktnamen** — A1 lädt die *gebauten* Dateien (`main.js`, `renderer.js`,
`styles.css`), **niemals** `main/index.ts`.

**Pfad-Validierung** (zweistufig, analog zur Trennung ajv-Form ↔ Semantik):

- *ajv-Form:* nur relative Pfade — kein führendes `/`, kein Backslash, kein Schema (`://`),
  kein führendes `..`. Pattern z. B. `^(?![/\\])(?![A-Za-z][A-Za-z0-9+.-]*:)(?!\.\.(?:[/\\]|$)).+`.
- *Semantik (`validateManifestSemantics`):* Pfad an `/` splitten und **jedes** `..`-Segment
  ablehnen (deckt `a/../b` mit ab; robuster als jede Single-Regex).

### 3. Kompatibilitäts-Gate via `semver` (aktiv, API + App)

**Kein reiner Major-Vergleich.** Bei `0.x` wären `0.1` und `0.9` sonst fälschlich kompatibel.

- **API-Gate:** `semver.satisfies(API_VERSION /* z.B. "0.2.0" */, manifest.apiVersion /* Range */)`.
- **App-Gate:** `semver.gte(app.getVersion(), manifest.minAppVersion)`.

`API_VERSION` lebt im Paket (`version.ts`, an `package.json` gekoppelt via Drift-Test). Die
App-Version wird der Registry per DI übergeben (`app.getVersion()` aus `index.ts`). Schlägt eines
der Gates fehl ⇒ **das Plugin wird gar nicht erst aktiviert** und trägt einen **strukturierten
Grund**.

**Strukturierter Fehler-Diskriminator** — `PluginErrorInfo.kind`:

| `kind`              | wann |
|---------------------|------|
| `manifest-invalid`  | Schema-/Semantik-Verstoß, **inkl. ungültiger SemVer** (`apiVersion` keine gültige Range, `version`/`minAppVersion` kein gültiges SemVer, `repo` keine URL, `..`-Pfad). |
| `incompatible-api`  | `apiVersion` ist eine **gültige Range**, die `API_VERSION` aber **nicht erfüllt**. |
| `incompatible-app`  | `minAppVersion` ist gültig, die laufende App-Version ist aber **kleiner**. |

**Mapping auf das Zustands-Modell** (drei orthogonale Achsen, `shared/plugins/state.ts`):
Inkompatibilität ist weder „nicht installiert" (das Plugin *ist* gebündelt) noch „nicht
konfiguriert" (Readiness = Credentials). Sie ist ein **terminaler Vertragsbruch** — wie ein
ungültiges Manifest. Daher derselbe Pfad wie `manifestInvalid` in `registry.register()`:
`activation: 'error'`, `readiness: 'unavailable'`, `manifestInvalid: true` (terminal, **kein**
Aktivierungs-Retry) + `error.message` strukturiert (z. B. *„Inkompatible API-Version: Plugin
verlangt `^0.3.0`, App bietet `0.2.0`."*) und `error.kind` gesetzt.

### 4. Ort der Gate-Logik + `semver`-Abhängigkeit

Das Gate ist eine **reine Funktion** über paket-eigene Daten (`API_VERSION`) und gehört daher
ins Paket — standalone testbar (wie `contract.test.ts`):

- **Neue Funktionen** in `validation.ts` (Arbeitstitel):
  - `isApiCompatible(apiVersionRange: string): CompatResult`
  - `isAppCompatible(minAppVersion: string, appVersion: string): CompatResult`
  - `CompatResult = { compatible: boolean; reason?: string; kind?: PluginErrorKind }`.
- **`PluginErrorKind`** (`'manifest-invalid' | 'incompatible-api' | 'incompatible-app'`) wird im
  Paket definiert und in `validation.ts` exportiert. `shared/plugins/state.ts` zieht es per
  **`import type`** (compile-time erased ⇒ kein ajv/semver-Runtime-Leak in den Renderer).
- **Export ausschließlich über den `/validation`-Subpath.** Der Haupt-Entry (`index.ts`) bleibt
  semver-frei — ein reiner Plugin-Typ-Import zieht weiterhin weder ajv noch semver.
- **`registry.register()`** ruft die Gates nach `validateManifest`/`validateManifestSemantics`
  auf; bei Inkompatibilität terminaler Fehlerzustand mit gesetztem `kind`.

**Dependency:** `semver` als **direkte** Dependency von `@mindgraph/plugin-api` (heute nur
`ajv`), Version **`^7`**; zusätzlich **`@types/semver` als devDependency**.

### 5. SemVer-/URL-Validierung der Versionsfelder

In `validateManifestSemantics` (semantische Schicht, Klasse `manifest-invalid`):

- `version` und `minAppVersion` mit **`semver.valid`** (konkrete Version).
- `apiVersion` mit **`semver.validRange`** (Range).
- `repo` (falls gesetzt) als **echte URL** (`new URL(...)` ohne Wurf, `http(s):`).

### 6. v1-Migration: kontrolliert im Quellcode, Loader v2-only

**Keine** automatische „Kompatibilisierung" beliebiger v1-Dateien — sonst erbt unversionierter
Fremdcode fälschlich Vertrauen. Stattdessen:

- Die **vier gebündelten Manifeste** werden kontrolliert auf v2 gehoben:
  - `manifestVersion: 2`,
  - `apiVersion: '^0.2.0'` (passt zur `API_VERSION` `0.2.0` nach dem Paket-Bump, Entscheidung 8),
  - `minAppVersion: '0.8.14'` (aktuelle App-Version),
  - `author: { name: 'Jochen Leeder', url: 'https://mindgraph-notes.de' }`,
  - `entrypoints: { main: 'main.js', renderer: 'renderer.js' }` (Artefaktnamen; nur deklariert,
    der Discovery paart weiter über den Ordner).
- Der spätere Disk-/Store-Loader (A2) akzeptiert **ausschließlich v2**. v1 verschwindet damit
  faktisch aus dem Repo; ein v1-Manifest aus fremder Quelle wird vom Loader abgelehnt (nicht
  stillschweigend „migriert").

### 7. Signatur als Sidecar (`.sig`) — reserviert

Eine Signatur kommt als **separate `.sig`-Datei** neben das Manifest, **kein** `signature`-Feld
im Manifest (sonst zirkulär). In diesem Schritt nur als Entscheidung festgehalten; Erzeugung/
Prüfung ist A2.

### 8. Paket-Bump auf `0.2.0`

Additive Vertragserweiterung = **Minor**. `@mindgraph/plugin-api` → `0.2.0`, `API_VERSION` →
`0.2.0` (Drift-Test koppelt beide Stellen). **Achtung:** Ein Major-Bump (`1.0.0`) würde das
API-Gate für alle `^0.x`-Ranges brechen — die Entscheidung „wann 1.0.0" gehört bewusst **vor**
den ersten öffentlichen Publish.

### 9. Weiteres

- **Anzeigefeld bleibt `label`** (nicht `name`). Der Store-Plan ist an `label` anzugleichen.
- **i18n vertagt** — lokalisierte `label`/`description` sind ein eigener Folgeschritt.

## Betroffene Dateien (Implementierungs-Skizze)

- `app/packages/plugin-api/package.json` — Version `0.2.0`, Dep `semver ^7`, devDep `@types/semver`.
- `app/packages/plugin-api/src/version.ts` — `API_VERSION = '0.2.0'`.
- `app/packages/plugin-api/src/manifest.ts` — `manifestVersion`, `apiVersion`, `minAppVersion`,
  `author` (Objekt), `entrypoints`, `repo` im `PluginManifest`-Typ + `PluginAuthor`/`PluginEntrypoints`.
- `app/packages/plugin-api/src/validation.ts` — Schema (`const: 2` + neue Pflichtfelder +
  `entrypoints`-`anyOf` + Pfad-Pattern + `author`-Objekt); SemVer-/URL-/`..`-Checks in
  `validateManifestSemantics`; `PluginErrorKind`, `isApiCompatible`, `isAppCompatible`.
- `app/src/main/plugins/registry.ts` — Gate-Aufruf in `register()`, terminaler Fehlerzustand mit
  `kind`; `appVersion` per DI (Constructor + `createMainRegistry`).
- `app/src/main/index.ts` — `createMainRegistry(undefined, app.getVersion())`.
- `app/src/shared/plugins/state.ts` — `PluginErrorInfo.kind?: PluginErrorKind` (Import via `import type`).
- `app/src/plugins/{antares,edoobox,remarkable,demo}/manifest.ts` — auf v2 heben.
- Tests: `contract.test.ts` (v2-Schema, Negativfälle, beide Gates); `registry.test.ts`,
  `host.test.ts`, `transport-core.test.ts`, `shared/plugins/plugins.test.ts` — Fixtures auf v2;
  je `plugins/*/main/index.test.ts` bleiben grün.

## Akzeptanzkriterien

1. `npm run typecheck`, `npm run test`, `npm run build` grün.
2. Die vier gebündelten Plugins laden, aktivieren und funktionieren wie vor dem Schritt.
3. Ein Manifest mit inkompatibler `apiVersion` (`^9.9.9`) → `activation:'error'`,
   `error.kind === 'incompatible-api'`, nicht aktiviert — per Test.
4. Ein Manifest mit zu hoher `minAppVersion` (`'999.0.0'`) → `error.kind === 'incompatible-app'`,
   nicht aktiviert — per Test.
5. v2-Manifest ohne ein Pflichtfeld, mit ungültiger SemVer (`apiVersion: 'abc'`,
   `minAppVersion: 'x'`), `..`-Pfad oder kaputter `repo`-URL → abgelehnt (`manifest-invalid`) — per Test.
6. Der reine Typ-Import (`@mindgraph/plugin-api`, ohne `/validation`) zieht weiterhin kein
   ajv/semver mit.
