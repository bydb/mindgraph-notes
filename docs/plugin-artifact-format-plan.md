# A0 · Schritt 3 — Artefaktformat, integrity.json & Signierung (Plan / ADR)

> **Status: ENTWURF — zur Review** (vorab im Scratchpad; landet als `docs/plugin-artifact-format-plan.md`
> auf dem neuen Branch `feat/plugin-artifact-format`, frisch von `master` **nach Merge von #26**).
> Letzter A0-Baustein vor A1 (Runtime-Loader-Spike). Folgt auf `docs/plugin-manifest-v2-plan.md`.

## Ziel

Ein **deterministisches, signiertes Plugin-Artefakt** + ein **Repo-Template** + eine **Build-Action**,
sodass ein extern gebautes Plugin von der App nachweisbar unverfälscht geladen werden kann. Dieser
Schritt liefert Format + Werkzeuge + Verifier-Spezifikation; der eigentliche Disk-/Runtime-Loader,
der das Artefakt im Betrieb lädt und `entrypoints` ausführt, bleibt A1.

**Leitwert wie in ganz A0: kein sichtbares App-Verhalten ändert sich.** Die vier gebündelten Plugins
werden weiter via `import.meta.glob` geladen; das Artefaktformat betrifft nur den künftigen Disk-Pfad.

## Kernentscheidung: Signaturwurzel = separate `integrity.json` (NICHT das Manifest)

Bewusst gegen eine eingebettete `files`-Hash-Map im Manifest entschieden. Vorteile:

- **Manifest v2 bleibt semantisch sauber** — kein `files`-Feld, **kein API-Bump**, keine Diskussion
  über kanonische Manifest-Serialisierung.
- Semantik (was ein Plugin *ist*) und Verpackungsintegrität (welche Bytes ausgeliefert wurden) bleiben
  getrennt.

Vertrauenskette:

```
vertrauter Public Key  →  integrity.json.sig  →  exakte Bytes von integrity.json
                                                    └─ Hash(manifest.json) + Hash(jede Code-/Asset-Datei)
```

## Voraussetzung: `@mindgraph/plugin-api` auf npm veröffentlichen

Ein echtes externes Repo-Template kann nicht gegen ein `private`-Monorepo-Paket bauen. Daher ist
die **Veröffentlichung von `@mindgraph/plugin-api@0.2.0` auf npm Voraussetzung** für A0/3 (sonst
bleibt das „Template" nur ein Monorepo-Fixture). Konkret:

- `"private": true` entfernen, `"publishConfig": { "access": "public" }` (scoped Paket).
- **Build-Emit ergänzen**: das Paket exportiert heute `./src/*.ts` (Roh-TS). Für npm muss es
  kompiliertes **JS + `.d.ts`** ausliefern (`tsc`-Emit nach `dist/`), `exports`/`types`/`files` auf
  `dist/` zeigen lassen. Der `/validation`-Subpath bleibt erhalten.
- **Zwei Konsum-Modi koexistieren:** die App selbst konsumiert weiter über den **TS-Quell-Alias**
  (tsconfig paths + vite alias) — unverändert; externe Plugin-Repos konsumieren das **npm-dist**.
- Versionsdisziplin: das publizierte `version`/`API_VERSION` ist die Bezugsgröße des Kompat-Gates
  (A0/2). Major-Bump erst bewusst vor öffentlichem Marktplatz (A2).

## Bundle-ABI (A0/3: **Main-only**)

A0/3 schließt mit einem **Main-only-Template** ab. Der Renderer-Build-Vertrag (React, dynamische
Chunks, Host-Injection in den Renderer) ist bewusst **ungeklärt und gehört zu A1** — er wird
gemeinsam mit dem Runtime-Loader-Spike definiert. Ein Main-only-Plugin ist als `entrypoints` mit
**nur `main`** (ohne `renderer`) bereits durch das v2-Schema gedeckt (at-least-one).

**`main.js`-ABI (verbindlich) — CommonJS, NICHT ESM:**

- **Ein einzelnes, self-contained CommonJS-Bundle**: `module.exports = pluginEntry`, wobei
  `pluginEntry` ein `PluginMainEntry` ist (`{ id, register(ctx), start?, stop? }`, vgl.
  `@mindgraph/plugin-api`). **Begründung:** eine heruntergeladene `.js` unter `userData/plugins/`
  hat keine nahe `package.json` mit `"type":"module"` → Node behandelt sie als CommonJS; `export
  default` würde dort scheitern. (Alternative `main.mjs` würde Manifest-Schema + Store-Vertrag
  erneut ändern — CJS ist der gerade Weg.)
- Geladen vom (späteren A1-)Loader über `require`/`createRequire`.
- **Keine externen Imports, keine dynamischen Chunks** (genau eine Datei `main.js`). Der
  `definePluginMain`-Helfer (dependency-frei) wird **in das Bundle gebündelt** — der Host injiziert
  ihn nicht. Host-Dienste kommen ausschließlich über `ctx.host` zur `register`-Zeit (Capability-Gate).
- **Node-/Electron-Built-ins beim Build explizit verbieten** (Bundler-`external`/Plugin bricht bei
  `fs`/`path`/`electron`/… ab) — der einzige Draht nach außen ist `ctx.host`.
- Build-Target = Node/Electron-Version des Hosts (gepinnt).
- **Caveat (Roadmap):** der Build-Bann ist eine Leitplanke, keine echte Isolation — bis zur
  `utilityProcess`-Sandbox (Plugin-Roadmap Schritt 10) läuft das Bundle im Vertrauen des Main-
  Prozesses. Signatur + Capability-Deklarationen + Built-in-Bann sind die aktuellen Schranken.

## Format

### `integrity.json` — sortierte Liste (keine Objekt-Map)

```json
{
  "formatVersion": 1,
  "algorithm": "sha256",
  "files": [
    { "path": "manifest.json", "size": 1234, "sha256": "abcdef…" },
    { "path": "main.js",       "size": 5678, "sha256": "…" }
  ]
}
```

- **Liste statt Map** → doppelte JSON-Keys sind unmöglich.
- `files` enthält `manifest.json` **und jede Nutzdatei**, aber **weder `integrity.json` noch `.sig`**.
- Signiert werden die **exakt ausgelieferten Bytes** von `integrity.json` — der Verifier serialisiert
  nichts neu.
- `formatVersion` ist unabhängig von `manifestVersion`.

### `integrity.json.sig` — versionierte Hülle (von Beginn an)

```json
{
  "formatVersion": 1,
  "algorithm": "ed25519",
  "keyId": "mindgraph-official-2026-01",
  "signature": "<base64>"
}
```

- Signiert bleiben **ausschließlich die rohen `integrity.json`-Bytes**.
- `keyId` erlaubt spätere **Key-Rotation ohne Formatänderung**. A0/3 pinnt **genau einen** Key;
  Multi-Key-Trust-Store ist A2.

### Archiv `<id>-<version>.mgxplugin` (deterministisches tar.gz)

```
<id>-<version>.mgxplugin
├── manifest.json
├── main.js
├── renderer.js       (optional — Renderer-ABI erst A1; Template ist Main-only)
├── styles.css        (optional — A1)
├── assets/…          (optional)
├── integrity.json
└── integrity.json.sig
```

- **Dateiname ist reine Anzeige** — ID/Version werden ausschließlich aus dem **verifizierten Manifest**
  übernommen, nie aus dem Namen.
- Container: tar `--sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner` + `gzip -n`.
- Implementiert in **Node** (deterministischer tar-Writer), nicht via System-`tar` (GNU vs bsdtar
  weicht ab).

## Signatur

**Ed25519 über Node `crypto`** — keine minisign/libsodium-Abhängigkeit. Privater **PKCS#8**-Key als
GitHub Secret (CI), eingebauter **SPKI**-Public-Key in der App. Build und Verifier teilen damit nur
Node-Bordmittel.

## Reproduzierbarkeit (präzise)

Ein Node-Tar-Writer **allein** garantiert wegen unterschiedlicher **Node-/zlib-Versionen** keine
global bit-identischen gzip-Bytes. Daher **pinnen**: Node-Version (CI + `.nvmrc`/`engines`),
Writer-Version, Kompressionsparameter. Wichtig: die **Signatur hängt nicht an den Archivbytes**,
sondern an `integrity.json` — ein nicht-bit-identisches Archiv bricht die Verifikation **nicht**,
es schwächt nur die Reproduzierbarkeits-Garantie.

## Build-Reihenfolge (fix)

1. Bundles deterministisch erzeugen (gepinnte Toolchain, `SOURCE_DATE_EPOCH`, stabile Dateinamen).
2. `manifest.json` schreiben.
3. Hash + Größe **aller Nutzdateien** (inkl. manifest.json) berechnen.
4. Deterministische `integrity.json` schreiben (Liste nach `path` sortiert).
5. Deren **rohe Bytes** mit Ed25519 signieren → `integrity.json.sig`-Hülle.
6. Deterministisches Archiv packen.
7. Optional: finalen Archiv-Hash als Release-Metadatum veröffentlichen.

## Archivlimits (hart, vor/while-entpacken erzwungen)

Schutz gegen Archive-Bombs und Ressourcen-Erschöpfung. Überschreitung ⇒ Abbruch, kein Install.

| Grenze | Wert |
|--------|------|
| Dateien gesamt | 512 |
| Archiv komprimiert | 100 MiB |
| Inhalt entpackt (Summe) | 250 MiB |
| Pro Datei (entpackt) | 100 MiB |
| `manifest.json` / `integrity.json` je | 1 MiB |
| `integrity.json.sig` | 16 KiB |
| Pfadlänge | 240 Zeichen |
| Pfadtiefe | 8 Segmente |

**Nur reguläre Dateien.** Directory-, Symlink-, Hardlink-, Device-/Special- und **PAX/Global-Header**-
Einträge werden abgelehnt (nicht still übersprungen). Die entpackte Gesamtsumme wird **während** des
Entpackens mitgezählt (Streaming-Limit), nicht erst danach.

## Pfad- & Integrity-Normalisierung (streng, eindeutig)

**Pfade (Archiv-Einträge UND `files[].path`):**
- nur **lowercase ASCII** POSIX-Pfade (`a–z 0–9 . _ - /`), Trenner `/`;
- relativ, kein führendes `./`, kein `..`-Segment, kein absoluter Pfad, kein Backslash;
- **keine doppelten und keine case-kollidierenden** Pfade (lowercase-only macht Case-Kollision
  zugleich zu exakter Duplikat-Erkennung — wichtig für case-insensitive FS bei der Installation);
- Archiv-Eintragsmenge **==** `files[].path` plus `{integrity.json, integrity.json.sig}` (kein
  missing, kein extra).

**`integrity.json`-Felder:**
- `files` ist **strikt nach `path` sortiert und eindeutig**;
- `size` = nichtnegativer Safe-Integer (`0 ≤ n ≤ Number.MAX_SAFE_INTEGER`), muss der tatsächlichen
  entpackten Größe entsprechen;
- `sha256` = **exakt 64 lowercase Hex-Zeichen**;
- `algorithm == "sha256"`, `formatVersion` bekannt.

**`integrity.json.sig`-Felder:**
- `algorithm == "ed25519"`, `formatVersion` bekannt, `keyId` bekannt im Keyring;
- `signature` = **kanonisches Base64**, nach Decode **exakt 64 Bytes** (ed25519-Signaturlänge).

## Verifier-Reihenfolge (Sicherheitskern — alles in Quarantäne, Install zuletzt)

```
sicher entpacken (Limits: Dateianzahl, Pro-Datei-/Gesamtgröße → Archive-Bomb-Schutz;
                  Ablehnung von Symlink/Hardlink/absolut/„..“/Backslash)
→ integrity.json + .sig-Hülle lesen + Feldform prüfen (Normalisierung s.o.)
→ Ed25519-Signatur über die EXAKTEN integrity.json-Bytes; keyId → Key aus injiziertem Keyring
→ algorithm/formatVersion prüfen
→ Eintragsmenge == files[].path  (kein missing/extra)  +  je Datei size + sha256
→ manifest.json parsen + validateManifest / validateManifestSemantics  (A0/2)
→ API-/App-Kompatibilitäts-Gates  (A0/2)
→ entrypoints gegen TATSÄCHLICHE Dateien prüfen (deklarierte main/renderer/styles existieren)
→ ERST DANN atomar installieren (Quarantäne → Plugin-Verzeichnis)
```

Begründung der Reihenfolge: Manifestprüfung **und** Kompat-Gates müssen **vor** dem Install laufen —
ein Artefakt, das die Signatur trägt, aber ein inkompatibles/ungültiges Manifest hat, darf nie im
Plugin-Verzeichnis landen.

**Keyring per DI:** Der Verifier bekommt einen **injizierten Keyring** (`keyId → Public Key`) —
keine eingebaute Konstante in der Verifier-Logik. So bleibt er standalone testbar (Fake-Keys) und
Key-Rotation/Multi-Key (A2) bleibt eine Frage der Befüllung. **Die App pinnt** beim Aufbau des
Keyrings den offiziellen `mindgraph-official-2026-01`-Key (SPKI, eingebaut).

## CI-Keyschutz (Signier-Workflow)

Der Produktions-Signierschlüssel ist das wertvollste Geheimnis dieses Schritts — strenge Leitplanken:

- **Signieren nur auf geschützten Release-Tags** (`push: tags`), **niemals in `pull_request`**
  (sonst signiert ein Fork-PR mit dem Prod-Key).
- Signier-Job in einem **GitHub Environment mit Required Reviewer/Freigabe**; nur dieses Environment
  hält das `PLUGIN_SIGNING_KEY`-Secret.
- **Minimale Workflow-Permissions** (`contents: read`, gezielt `contents: write` nur für den
  Release-Upload; kein `id-token`/breitere Scopes).
- **Produktions-Key nie für lokale Builds.** Lokales `pack` signiert nur mit einem **explizit
  injizierten Development-Key** (eigener `keyId`, z. B. `dev-local`), der NICHT im App-Keyring der
  Release-Builds steht → lokal gepackte Artefakte sind in der ausgelieferten App bewusst ungültig.
- Key liegt als **PKCS#8** im Secret; der Workflow schreibt ihn nur in den Job-Speicher und nie ins
  Artefakt/Log.

## Repo-Template & Build-Action (Main-only)

- **Template** (`create-mindgraph-plugin` o. ä.): minimales v2-Manifest mit `entrypoints: { main }`,
  **ein Main-Entry-Stub** gegen das **npm-`@mindgraph/plugin-api`** (`definePluginMain`), Build-Konfig
  mit **gepinnter Toolchain** (`.nvmrc`/`engines`, fixe Bundler-/Writer-Version), npm-Scripts `build`
  + `pack`. **Kein Renderer-Stub** (Renderer-ABI = A1).
- **Build-Action** (GitHub composite/Workflow): führt die Build-Reihenfolge oben aus und legt
  `<id>-<version>.mgxplugin` als Release-Artefakt ab. Signierung im selben Lauf unter dem
  CI-Keyschutz (s. o.) mit dem PKCS#8-Secret.

## Scope-Grenze

- **Kein** Disk-/Runtime-Loader (der das Artefakt im Betrieb lädt + `entrypoints` ausführt) → A1.
- **Kein Renderer-Build-Vertrag** (React, dynamische Chunks, Renderer-Host-Injection) → A1; Template
  ist Main-only.
- **Kein** Multi-Key-Trust-Store / Key-Rotation im Betrieb → A2.
- **Keine** echte Laufzeit-Isolation des Main-Bundles (`utilityProcess`-Sandbox) → Roadmap-Schritt 10.
- Gebündelte Plugins bleiben unverändert auf dem Glob-Pfad.

## Akzeptanzkriterien

1. `@mindgraph/plugin-api@0.2.0` ist auf npm veröffentlicht (JS + `.d.ts`, public access); das
   Template installiert es als externe Dependency.
2. Template baut lokal ein gültiges Main-only `.mgxplugin` (manifest + main.js + integrity.json + .sig)
   und signiert mit einem injizierten **Development-Key**.
3. **CJS-Lade-Test:** `main.js` aus einem temporären Ordner **ohne `package.json`** über
   `require`/`createRequire` laden und prüfen, dass `module.exports` ein gültiges `PluginMainEntry`
   ist (belegt, dass kein `"type":"module"`-Kontext nötig ist). Build bricht ab, wenn das Bundle ein
   Node-/Electron-Built-in referenziert.
3. Verifier (neue, standalone testbare Funktion mit injiziertem Keyring) akzeptiert ein korrektes
   Artefakt und lehnt ab bei: kaputter Signatur, fremdem/unbekanntem keyId, Hash-/Size-Mismatch,
   fehlender/zusätzlicher Datei, doppeltem/case-kollidierendem Pfad, Symlink/Hardlink/Dir/PAX-Eintrag,
   `..`/absolutem Pfad, jedem überschrittenen Limit, ungültigem/inkompatiblem Manifest, fehlendem
   entrypoint-Ziel — je per Test.
4. Zwei Builds derselben Quelle mit gepinnter Toolchain erzeugen bit-identische `integrity.json`
   (Archiv-Bit-Gleichheit ist Ziel, aber nicht sicherheitskritisch — s. Reproduzierbarkeit).
5. `npm run typecheck` + `npm run test` + `npm run build` grün; kein Verhalten der gebündelten Plugins
   geändert.
