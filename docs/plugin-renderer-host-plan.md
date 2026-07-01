# ADR — Renderer-Plugin-Host (signaturbasiert, „Renderer-JS im Haupt-Renderer")

> Status: **ENTWURF — Richtung beschlossen (Option A), Review-Runde 1+2 (Codex) eingearbeitet. Kein Code.**
> Folgt auf A1 Main-only (`docs/plugin-runtime-loader-plan.md`) und den Renderer-Spike Tier 1 (deklarative
> Widgets, `docs/plugin-renderer-widgets-plan.md`). **Anker: Excalidraw als erstes Renderer-Plugin im eigenen
> Repo/Katalog.** §§4–12 sind die **normative** Spezifikation; die Review-Historie am Ende ist nur Changelog.

## 1. Ziel & Anker

Eine neue Kern-Fähigkeit: **signatur-verifiziertes, disk-installiertes Renderer-JS eines externen Plugins
direkt in den Haupt-Renderer laden** und als UI-Beitrag mounten. Anker: ein Plugin beansprucht die
Dateiendung `.excalidraw`, der Host öffnet beim Klick einen Tab und das Plugin rendert dort seinen
Zeichen-Editor. Excalidraw braucht eine **volle React-Canvas im Renderer** — der bisher bewusst verbotene Fall.

## 2. Beschlossene Richtung & Supersede

**Option A (User-Entscheidung 2026-06-30):** Offiziell signierte Plugins laden Renderer-JS **direkt in den
Haupt-Renderer**, mit vollem DOM-Zugriff. **Trust-per-Signatur** wie Obsidian / VS Code: die Signatur belegt
**Herkunft + Integrität**, sie ist **kein Sandboxing**. Prod-Keyring bis zur Maintainer-Provisionierung leer
→ real inert (wie A1).

> **SUPERSEDE:** Der Renderer-Widgets-ADR hatte für *individuelle* Widgets eine **Sandbox
> (`WebContentsView`, Tier 2)** als „nicht verhandelbar" gesetzt. Für **vollwertige, signierte
> Renderer-Plugins** wird das hier **bewusst abgelöst** (signiert = voll vertraut im Haupt-Renderer). Der
> gesandboxte Tier-2-Pfad wird **nicht gebaut**; er bleibt orthogonale Zukunftsoption für untrusted Widgets.
> **Tier 1 (deklarative Widgets) bleibt unverändert.**

## 3. Ausgangsbefund (belegt)

**Signatur/Verifikation ist fertig — es fehlt nur das Laden:**
- `verifyFileMap()` (`artifact/verify.ts:211`): Ed25519 über die exakten `integrity.json`-Bytes;
  `integrity.json` = `{path,size,sha256}[]` (`artifact/format.ts:72`).
- `verifyInstalledDir()` (`artifact/verify.ts:323`) liest **alle Payload-Dateien in eine
  `Map<string,Buffer>`** und re-verifiziert **fail-closed, ohne Code-Ausführung** — gibt heute aber nur
  Manifest + Integrity-Einträge zurück (die Buffer werden verworfen → §5.3 nutzt sie künftig).
- `assertEntrypointsPresent()` (`artifact/verify.ts:172`) **verifiziert `renderer`/`styles` bereits**, wenn
  deklariert.
- Manifest: `entrypoints.renderer`/`styles` existieren (`packages/plugin-api/src/manifest.ts:116`), Doku sagt
  „mindestens `main` ODER `renderer`" — **nirgends konsumiert** (0 Referenzen).

**Zwei harte Sperren, die R1 lösen muss:**
- `install.ts:86-89` **lehnt Renderer-only terminal ab** (`entrypoint-unsupported`). R1 hebt das auf.
- Der bestehende Renderer-Plugin-Pfad (`renderer/plugins/registry.ts:49`, `slots.tsx`) ist **`bundled-only`**
  (`import.meta.glob`, Build-Zeit, React.lazy). Ein **Laufzeit-Loader** für externe `renderer.js` fehlt.

**Erweiterbarkeit + Fallen, die R1 nutzt/beachtet:**
- Tab-System: `TabType` (`tabStore.ts:3`), Opener `openCodeTab` (`:185`), Router `App.tsx:1364-1394`. Ein
  externes Plugin kann diese **nicht zur Build-Zeit editieren** → dynamische Contribution (§7).
- ⚠️ **`getFileType()===null` filtert Dateien VOR dem FileTree weg** (`readDirectoryRecursive`,
  `index.ts:1394`); `FileEntry.fileType` ist **closed union** (`shared/types.ts:381`). Eine unbekannte
  Endung ist damit **unsichtbar** — §7 löst das mit einer plugin-bewussten Datei-Seam.
- Capability-Host (`host.ts:107` `createHostFactory`) + Roh-Services (`index.ts:441`, `assertApprovedVault`/
  `writeFileSafe`).
- CSP (`app/index.html:6`): `script-src 'self' 'wasm-unsafe-eval' blob: cdn.jsdelivr.net`,
  `worker-src 'self' blob:`, **kein `font-src`** → fällt auf `default-src 'self'`.

## 4. Vertrauensmodell (ehrlich, normativ)

| | Bundled Renderer-Plugin | **Externes Renderer-Plugin (R1)** | Deklaratives Widget (Tier 1) |
|---|---|---|---|
| Quelle | In-Repo, Build-Zeit | Disk, signaturgeprüft | Disk, signaturgeprüft |
| Renderer-JS im Host | ja (Vollvertrauen) | **ja (Vollvertrauen per Signatur)** | nein |
| DOM/Theme-Zugriff | voll | **voll** | keiner (Host rendert) |
| `window.electronAPI` | erreichbar | **erreichbar** (volle Host-Rechte) | nein |
| Vault-IO | direkt | über Host-API (Komfort) **oder** electronAPI; harte Grenze = `writeFileSafe` | n/a |

**Ehrlich (R1-F01, User-Entscheid):** Ein externes Renderer-Plugin läuft als Script im **Top-Frame desselben
Renderers** und erreicht damit `window.electronAPI` **direkt** (inkl. `readFile/writeFile/deleteFile`,
`pluginInvoke`; `isTrustedSender` akzeptiert genau diesen Top-Frame). Die **Plugin-Host-API (§6) ist die
empfohlene, ergonomische Schnittstelle — aber KEINE Sicherheits-Seam**; sie hält ein bösartiges signiertes
Plugin nicht ab. Das ist die bewusste Konsequenz von Option A (VS-Code/Obsidian-Modell): Vertrauen entsteht
aus **Signatur + Autorvertrauen**, nicht aus Laufzeit-Isolation. **Die einzigen harten Grenzen bleiben** die
zentrale fs-Schreibgrenze (`writeFileSafe`/`assertApprovedVault`) und der leere Prod-Keyring. Echte
Least-Privilege erfordert einen getrennten Realm (Sandbox = Option B) und ist hier **nicht** umgesetzt.

`rendererInstanceId` (§5) ist daher **Routing-/Lifecycle-Mechanik** (Generation/Drain), **nicht** eine
Trust-Grenze.

## 5. Architektur — Main-Seite

### 5.1 Renderer-only zulassen + gemeinsamer Laufzeit-Zustand (R1-F02)
- `install.ts`/`discover.ts`: gültig, wenn `entrypoints.main` **oder** `entrypoints.renderer` gesetzt.
- **Neu: `InstalledPluginRuntime`** als gemeinsamer Zustandsträger für **main-only, renderer-only und
  hybride** Plugins. Heute trägt nur eine `MainPluginSource` (via `require(main.js)`) den Active-State
  (`registry.get(id).activation`); ein renderer-only-Plugin hätte **kein** solches Objekt. `InstalledPluginRuntime`
  hält je Plugin: `{ id, version, manifest, mainEntry?, rendererPayload?, activation, generation }` und ist der
  einzige Anker für I-L2-Serve-Gate, Modulschalter/`enabledPath`, Readiness, Upgrade, Rollback, Uninstall.

### 5.2 Aktivierungs-Transaktion: Prepare → Deactivate-Previous → Activate → Commit (R1-F12/R1-F14, Main-orchestriert)
Aktivierung eines Plugins mit Renderer-Entry ist **eine** Main-orchestrierte Transaktion; `active.json` wird
**zuletzt** committet (wie der bestehende Main-Pfad, `manage.ts:170`). **Es laufen nie zwei Versionen
gleichzeitig:** der Vorgänger wird **vor** dem Kandidatenstart vollständig gedraint+gestoppt (R1-F14).

1. **Prepare (Main):** Kandidat verifizieren (`verifyInstalledDir`), `VerifiedRendererPayload` (§5.3) bauen,
   `InstalledPluginRuntime`-Eintrag in Zustand `preparing`. **Noch kein** Main-/Renderer-Start.
2. **Deactivate-Previous (Main, nur bei Upgrade/erneuter Aktivierung) — R1-F14:** sequenziell: (a) neue
   `plugin:host`-Calls der Vorgängerversion **sofort sperren** → (b) **In-Flight drainen** (§5.5) → (c) alten
   **Renderer entladen** (Teardown-Ack, §5.5-Matrix) → (d) alten **Main-Entry `stop()`/`unregister`**. **Erst
   nach vollständig bestätigtem Teardown** startet der Kandidat. **Persistenter Zustand (`active.json` +
   Versionsordner) bleibt bei JEDEM Fehler unangetastet; der Live-Zustand kann partiell sein (R1-F17/R1-F18):**
   - **Vor** Schritt 2 (z.B. Prepare/Verify scheitert) → Vorgänger **nie berührt**, bleibt **`active`**, kein Kandidat.
   - Fehler in (a)/(b) (**Drain-Timeout**): das Call-Gate ist bereits gesperrt und ein In-Flight-Call ist **nicht
     sicher** drainbar → das Gate wird **nicht** wieder geöffnet → Vorgänger → **`restart-required`** (nicht
     `active` — sonst „active mit geschlossenem Gate", R1-F18), **kein Kandidatenstart**.
   - Fehler in (c) (Renderer-dispose `error`/`timeout`, §5.5-Matrix) → Vorgänger → **`restart-required`**,
     **kein Kandidatenstart**.
   - Fehler in (d) (Main-`stop()` wirft/hängt **nach** erfolgreichem Renderer-Unload) → Vorgänger →
     **`restart-required/partially-stopped`** (Renderer bereits weg, Payload je Matrix), **kein Kandidatenstart**.
3. **Activate-Main (Main):** falls `mainEntry` → `entry.register/start` (wie heute). Erfolg = Ack.
4. **Activate-Renderer (Renderer, via IPC):** Main meldet dem Renderer den Kandidaten; der Renderer holt
   `plugin:rendererEntry`, importiert (Blob, §6), ruft `activate(host)` und **acked explizit** zurück
   (`plugin:rendererActivated(rendererInstanceId, ok|error)`). **Eigene, getestete Fehlerpfade:** Renderer
   geschlossen/lädt neu → Ack-Timeout; `import()`/`activate()` wirft → Fehler-Ack.
5. **Commit (Main):** erst nach **beiden** Acks → `active.json` atomar auf die neue Version; Runtime → `active`.

**Rollback (vor Commit):** jeder Fehler/Timeout in Schritt 3/4 stoppt den **Kandidaten** (Renderer zuerst
entladen, dann Main `stop()`) und reaktiviert den Vorgänger **nur**, wenn dessen Teardown in Schritt 2 sauber
war und der Kandidaten-Teardown sauber ist (success-Ausgang, §5.5-Matrix). Sonst → `restart-required`, **kein**
In-Process-Doppelbetrieb, persistenter Zustand unangetastet.

### 5.3 `VerifiedRendererPayload` + Serve (R1-F03, R1-F04)
- **Eine** Variante (kein `bytesCache?`-Widerspruch, kein zweiter Disk-Read): `verifyInstalledDir` **behält**
  die bei der Verifikation gelesenen, gegen `integrity.json` geprüften **Entry-/Style-Buffer** und übergibt
  sie als `VerifiedRendererPayload { code: Buffer, styles?: Buffer, hash }`. Key **`(pluginId, version, generation)`**.
  Die `Map<string,Buffer>` existiert in `verifyInstalledDir` bereits — wir verwerfen sie nur nicht mehr.
- **Serve `plugin:rendererEntry(pluginId)`** liefert **exakt** die in-memory verifizierten Bytes als String
  (+ `rendererInstanceId`). **Kein** Platten-Read beim Serve → kein TOCTOU. Gated auf den
  `InstalledPluginRuntime`-Laufzeitzustand (`active`/`preparing`), nicht auf frisches `active.json`.
- **Invalidierung pro `(pluginId, version, generation)` — Kandidat ≠ Vorgänger (R1-F19):** der **Kandidaten**-
  Payload wird bei **jedem** abgebrochenen Upgrade verworfen; der **Vorgänger**-Payload wird **ausschließlich
  gemäß §5.5-Matrix** + dem erreichten Deactivate-Previous-Fehlerort (§5.2) behandelt (`success` entfernt,
  `error`/`timeout` behalten). Disable/Uninstall einer aktiven Version invalidiert deren Payload per Matrix.
  Folge: eine spätere Disk-Manipulation ist irrelevant (die alte, verifizierte Version wird served); Re-Verify
  beim **Start** bleibt fail-closed (manipuliertes Dir lädt gar nicht erst).
- **Loader-Vertrag (R1-F03):** R1 lädt **ausschließlich ein selbstenthaltendes Single-File-ESM** — keine
  externen/dynamischen Import-Chunks, kein `eval`/`new Function`, **alle** Assets `data:`/inline. Die Blob-URL
  wird **bis zum Unload gehalten** (kein sofortiges `revokeObjectURL`). **Signer + Akzeptanztest erzwingen**
  diese Bundle-Form. Verifiziertes Asset-Protokoll (`mgxplugin://`) bleibt F-RH1, **nicht** R1.

### 5.4 Scoped Host-API-IPC (Komfort, keine Grenze)
`plugin:host(rendererInstanceId, op, args)` → Main löst `instanceId → pluginId` auf, prüft die Capability
über `createHostFactory` und ruft die bestehenden `HostServices` (`writeFileSafe`/`assertApprovedVault`).
Das ist **Komfort** (least-surprise, einheitliche Vault-Pfade), **keine** Sicherheits-Seam (§4): ein Plugin
kann dieselbe Wirkung auch über `window.electronAPI` erzielen. **Kein neuer fs-Pfad.**

### 5.5 Lifecycle: In-Flight-Drain + Teardown-Ressourcenmatrix (R1-F05, R1-F13, R1-F15)
- Invalidierung sperrt **neue** Calls sofort; ein vor Disable/Upgrade gestarteter `plugin:host`-Call kann
  sonst nachlaufen (der Widget-Pfad `widgets.ts:90` verwirft nur das Ergebnis — die Nebenwirkung passiert).
- **In-Flight-Zähler je `(rendererInstanceId, generation)`**; Disable/Upgrade/Uninstall **warten auf Drain**.
- **Teardown-Ablauf:** Drain abwarten → Renderer-`dispose()` **isoliert** aufrufen (eigener `try/catch`, harter
  Timeout) → der Renderer **acked** den Ausgang an Main. Der Ausgang bestimmt die Ressourcen — **diese eine
  Matrix gilt verbindlich auch für §9 (I-S4) und §11** (R1-F15, kein Widerspruch mehr):

  | Ressource | `success` (dispose sauber durch) | `error` (dispose wirft) | `timeout` (dispose hängt / Drain reißt nicht) |
  |---|---|---|---|
  | Host-Chrome (Tab schließen, `<style>` entfernen, Blob `revoke`) | ja | **ja** (host-eigen, sicher) — zählt **nicht** als erfolgreicher Unload | **nein** (Renderer-Thread blockiert, nicht erreichbar) |
  | `VerifiedRendererPayload` invalidieren | ja | **nein** (für Restart-Re-Verify behalten) | **nein** |
  | `active.json` / Versionsordner | normal aktualisieren | **unangetastet** | **unangetastet** |
  | Nachfolger starten | n/a | **nein** | **nein** |
  | `InstalledPluginRuntime` | `inactive`/entfernt | **`restart-required`** | **`restart-required`** |

- **Nur `success`** entfernt Payload + aktualisiert Index/Version. **`error`/`timeout` sind fail-closed**
  (analog Main-`stop()`-Fehler): persistenter Zustand bleibt, kein Nachfolger; Main veranlasst die
  Neustartmeldung; erst ein sauberer Neustart re-verifiziert und löst auf. Force-Kill eines hängenden
  Disposers gibt es im Host-Thread **nicht** (Option-A-Trade-off, §9-I-S4).

## 6. Architektur — Renderer-Seite

- **Neue `ExternalRendererRegistry`** (parallel zu `ExternalWidgetRegistry`, **nicht** die Bundled-
  `RendererPluginRegistry`). Auf `plugin:renderers-changed`: pro aktivem Plugin mit Renderer-Entry →
  `plugin:rendererEntry` holen → `Blob([code],{type:'text/javascript'})` → `URL.createObjectURL` →
  `await import(blobUrl)` → Default-Export gegen den Vertrag prüfen → `activate(host)` → **Ack** (§5.2). Styles
  als host-eigenes `<style data-plugin="<id>">`. **Blob-URL bleibt bis zum Unload** (R1-F03); erst beim
  Teardown `revokeObjectURL`.
- **Plugin-Host-API** (`host`-Objekt für `activate`):
  ```ts
  interface PluginRendererHost {
    id: string
    registerFileEditor(opts: { editorId: string; mount: FileEditorMount }): void  // KEINE extensions (R1-F08)
    vault: { read; write; readBytes; writeBytes; exists }   // Komfort über plugin:host (§5.4)
    theme: 'light' | 'dark'; onThemeChange(cb): () => void
    log(...args: unknown[]): void
  }
  ```
  Die Endungs-Zuordnung kommt **ausschließlich** aus dem signierten Manifest (§8); `registerFileEditor` bindet
  nur die Mount-Funktion an eine deklarierte **`editorId`** — die Runtime nennt **keine** eigenen Extensions.

## 7. File-Editor-Contribution (mount-basiert) + plugin-bewusste Datei-Seam

**Mount-Vertrag (R1-F10) — eng benannt: „eigene React-Root im GEMEINSAMEN Realm", KEINE Isolation.** Das
Plugin bündelt sein eigenes React → der Host bekommt **keine** React-Component (Dual-React-Bruch), sondern
mountet imperativ:
```ts
type FileEditorMount = (container: HTMLElement, ctx: { filePath: string; host: PluginRendererHost })
  => (() => void)   // dispose
```
Das Plugin macht `createRoot(container).render(...)` und gibt `() => root.unmount()` zurück. **Verbindlich
dokumentierte Pflichten** (gemeinsamer Realm, kein Schutz): `dispose` muss Timer/Listener/Theme-Subscriptions
abräumen; Portals/Globals (`window.EXCALIDRAW_ASSET_PATH`, globale Stores, Font-/Style-Injektion) liegen in
Plugin-Verantwortung. Teardown ist **best-effort** (§9, I-S4).

**Plugin-bewusste Datei-Seam (R1-F07/R1-F09) — sonst ist die Datei unsichtbar:**
- `getFileType()` + `readDirectoryRecursive` (`index.ts:1352/1394`) und `FileEntry.fileType`
  (`shared/types.ts:381`) werden um eine generische Variante erweitert: unbekannte reguläre Dateien als
  **`fileType:'plugin'`** (+ normalisierte Extension) transportieren, **klassifiziert gegen den
  `FileEditorResolver`** (§8). **Recursive-Read UND der Vault-Watcher** nutzen **denselben** Resolver.
- **FileTree** routet `fileType:'plugin'` → `openPluginEditorTab(pluginId, filePath)`.
- **tabStore:** `TabType 'plugin-editor'` + `{ pluginId, filePath }`; **ein Tab pro `(pluginId, filePath)`**
  (Opener dedupliziert — Mehrfach-Instanzen sind raus aus R1).
- **App.tsx-Router:** Fall `'plugin-editor'` → `<PluginEditorTab/>`: leeres `<div ref>`, ruft die in der
  `ExternalRendererRegistry` per `editorId` hinterlegte `mount(div, {filePath, host})`, `dispose()` bei
  Unmount/Tab-Close.

## 8. Manifest + `FileEditorResolver` (R1-F08/R1-F09)

- **Renderer-only erlaubt** (Schema/Loader): `main` ODER `renderer`.
- **Deklarative, signierte Editor-Beanspruchung:**
  ```ts
  ui?: { …, fileEditors?: { editorId: string; extensions: string[]; label?: string }[] }
  ```
  Der Host kennt Endung→Plugin **vor** Code-Ausführung. `registerFileEditor` bindet zur Laufzeit nur an eine
  **deklarierte `editorId`**; Aktivierung **scheitert terminal**, wenn ein deklarierter Beitrag nicht (oder
  doppelt) registriert wird — Routing bleibt deterministisch.
- **`FileEditorResolver` (tiefes Modul, EINE Quelle der Wahrheit):** besitzt **Kern-Endungs-Claims**
  (`.md/.pdf/.png/.jpg/.docx/.xlsx/.pptx/Code-Endungen/Spezialnamen/`+`.pdf.md`) **und** die aktiven
  Plugin-Claims. **Normalisierung**: Case-Insensitiv, führender Punkt, Mehrfachendung, Unicode-NFC. Validiert
  den **vollständigen nächsten Zustand VOR `active.json`-Commit** (atomar, auch bei zwei gleichzeitigen
  Install-/Upgrade-Kandidaten — der Workflow-Kollisionspfad prüft heute nur sequentiell und erfasst
  renderer-only gar nicht). Genutzt von Discovery, Install/Upgrade, FileTree-Klassifikation und Tab-Routing.
  Kollision (Kern oder anderes Plugin) → terminale Ablehnung.

## 9. Sicherheits-Invarianten (normativ)

- **I-L1** erwarteter Hash/Bytes **nur** aus dem `VerifiedRendererPayload` (von `verifyInstalledDir` bei
  Prepare befüllt), nie frischer On-Disk-Read.
- **I-L2** Serve gated auf den `InstalledPluginRuntime`-Laufzeitzustand (`active`/`preparing`).
- **I-L5** Serve liefert **exakt** die verifizierten In-Memory-Bytes (kein zweiter Read → kein TOCTOU).
- **I-S1 (Routing, NICHT Trust)** `rendererInstanceId` bindet `pluginId` main-seitig für Routing/Generation;
  der Renderer nennt `pluginId` nicht in `plugin:host`. **Kein Trust-Gewinn** (§4).
- **I-S2 (eine harte Schreibgrenze)** Vault-IO via Host-API geht durch `writeFileSafe`/`assertApprovedVault`;
  **kein neuer fs-Pfad**. ⚠️ Die Host-API ist **keine** Grenze gegen das Plugin (es hat `electronAPI`) — die
  Grenze ist `writeFileSafe` + leerer Prod-Keyring.
- **I-S3 (blob-only Single-File-ESM)** Laden via Blob-URL-`import()` eines selbstenthaltenen Bundles; kein
  `unsafe-eval`, CSP unverändert.
- **I-S4 (best-effort Teardown, ausgangsabhängig)** Disable/Uninstall folgt **exakt der §5.5-Ressourcenmatrix**
  (`success | error | timeout`), Disposer isoliert (`try/catch` + Timeout). **Wortgleich zur Matrix:**
  `success` → Host-Chrome (Tab/`<style>`/Blob) **und** Payload entfernt, Index/Version aktualisiert;
  `error` → Host-Chrome **wird entfernt** (host-eigen, sicher; zählt **nicht** als Unload-Erfolg), Payload
  **behalten**, Index/Version **unangetastet**, `restart-required`; `timeout` → **nichts** renderer-seitig
  entfernt, Index/Version/Payload unangetastet, `restart-required`. **Garantierter Force-Kill/Zombie-Freiheit
  gibt es unter Option A NICHT** (Plugin-Code lief im Host-Thread) — bewusster Trade-off.
- **I-S5 (Endungs-Kollision terminal)** über den `FileEditorResolver` (§8), vor Index-Commit.

## 10. Staging

- **R1a — Kern-Mechanik:** Renderer-only zulassen → `InstalledPluginRuntime` + Prepare/Activate/Commit (§5.2)
  → `VerifiedRendererPayload` + `plugin:rendererEntry` (§5.3) → scoped `plugin:host` + In-Flight-Drain/Timeout
  (§5.4/5.5) → `ExternalRendererRegistry` + Single-File-ESM-Loader (§6) → File-Editor-Contribution +
  plugin-bewusste Datei-Seam + `FileEditorResolver` (§7/§8). **Beleg via Dev-/Demo-Renderer-Plugin**
  (eigener Dev-Key), kein Excalidraw nötig.
- **R1b — Excalidraw (eigenes Repo, Build, signiert, Katalog):** zieht `@excalidraw/excalidraw@0.18.1` in
  **sein** Repo, bündelt React selbst zu **einem** ESM, `serializeAsJSON`, Debounce-Save. Wrinkles hier:
  (a) Fonts — MVP System-Fallback ODER `data:`-inline (dann CSP `font-src 'self' data:`); (b)
  `window.EXCALIDRAW_ASSET_PATH='/'`; (c) 9 npm-audit-Findings vor Release.
- **Phase 3 (separat):** `![[skizze.excalidraw]]`-Embed über `markdown.embed.renderer`. Eigenes Increment.

## 11. Akzeptanzkriterien (R1a)

- Ein signiertes Renderer-Plugin (`entrypoints.renderer`, `ui.fileEditors:[{editorId,extensions:['.xyz']}]`,
  **kein** `main` nötig) installiert über die **Prepare/Activate/Commit-Transaktion** (Main+Renderer-Ack,
  Index zuletzt); beim Öffnen einer `.xyz`-Datei ist diese **im FileTree sichtbar** (plugin-Seam), routet über
  den `FileEditorResolver` und mountet die eigene React-Root in einen Host-Tab (**ein** Tab pro
  `(pluginId, filePath)`).
- Externe Renderer nutzen die **neue** `ExternalRendererRegistry`. Das Plugin hat **volle Host-Rechte**
  (electronAPI erreichbar) — die Host-API wird als Komfort dokumentiert, **nicht** als Grenze (Test prüft
  Ehrlichkeit der Doku, nicht eine nicht-existente Schranke).
- `plugin:rendererEntry` served **exakt** die `VerifiedRendererPayload`-Bytes (I-L1/I-L5); **keine
  manipulierten Bytes werden ausgeführt** (Disk-Tausch nach Prepare irrelevant; Start-Re-Verify fail-closed).
- Loader akzeptiert **nur** ein **Single-File-ESM** (kein externer/dynamischer Chunk, kein `eval`) — Test.
- Upgrade/erneute Aktivierung: **Deactivate-Previous vor Kandidatenstart** (Drain+Stop des Vorgängers) →
  nie zwei Versionen gleichzeitig (Test, R1-F14). **Inkl. Test des späten Hybrid-Fehlers (R1-F17):** Main-
  `stop()` wirft **nach** erfolgreichem Renderer-Unload → Vorgänger `restart-required/partially-stopped`,
  `active.json`/Versionsordner **unangetastet**, kein Kandidatenstart.
- Disable/Uninstall folgt der **§5.5-Ressourcenmatrix** je Ausgang (Test je `success | error | timeout`,
  **wortgleich** zu §5.5/§9-I-S4 — R1-F16): **`success`** → Host-Chrome **und** Payload entfernt,
  Index/Version aktualisiert; **`error`** → Host-Chrome entfernt, **Payload behalten**, Index/Version
  unangetastet, `restart-required`; **`timeout`** → **nichts** renderer-seitig entfernt, alles unangetastet,
  `restart-required`. Kein Nachfolger bei `error`/`timeout`. **Kein** garantierter Zombie-frei-Anspruch
  (Option-A-Trade-off).
- Endungs-Kollision (Kern oder zwei Plugins, inkl. Normalisierung/`.pdf.md`) → terminale Ablehnung **vor**
  Index-Commit (Test). `registerFileEditor` ohne Extensions; fehlender/doppelter Manifest-Beitrag → terminal.
- Renderer-only-Install nicht mehr abgelehnt; **Main-only-Plugins, gebündelte Renderer-Plugins und
  PDF-Rendering unverändert**. `npm run typecheck` + `npm run test` + `npm run build` grün.

## 12. Offene Follow-ups (NICHT in R1)

- **F-RH1 Asset-Protokoll/Fonts:** `mgxplugin://` auf der Default-Session für relative Plugin-Assets (größere
  CSP-Änderung) — erst wenn Single-File-ESM + `data:`-Inline nicht reichen.
- **F-RH2 `utilityProcess`-Isolation** (Roadmap #10) — würde echte Least-Privilege ermöglichen (≈ Option B).
- **F-RH3 Disk-Renderer-Plugin Enable/Disable-UI** (vgl. Runtime-Loader F2).
- **F-RH5 Embed-Slot** (Phase 3) — eigenes ADR.
- **F-RH6 Multi-Fenster-Besitzer-Aggregation (Codex-Impl-F28, bewusste R1a-Grenze).** R1a setzt **ein
  Plugin-Host-Fenster** voraus: der Aktivierungs-Push ist ein Broadcast, und der Besitzer einer
  `rendererInstanceId` wird beim ersten `ok`-Ack gebunden (gerichteter Teardown + Fremd-Ack-Verwerfung, §5.5).
  Lädt **mehr als ein** Fenster denselben Kandidaten, bleibt der Plugin-Code in den Nicht-Besitzer-Fenstern
  geladen → potenzieller Doppelbetrieb. Echte Korrektheit braucht: Aktivierung an **genau ein** Host-`webContents`
  zielen **vor** Code-Auslieferung (Activate-Warter an dessen Sender-ID binden) **oder** eine Owner-**Menge**
  führen und Aktivierung+Teardown aggregieren. Da MindGraph aktuell genau ein Plugin-Host-Fenster betreibt,
  ist das deferiert.
- **F-RH7 Zustellungs-gekoppelte Tombstone-Lebensdauer (Codex-Impl-F29, bewusste R1a-Grenze).** Der
  Outcome-Tombstone (§5.5, F22/F27) lebt aktuell in einem 64er-Ringpuffer; unter sehr hoher Aktivierungs-Last
  (>64 instanceIds vor Konsum) könnte ein noch **unbestätigtes** `error`/`timeout` verdrängt werden → späterer
  Teardown fiele auf `success`. Robuste Lösung: Lebensdauer an die **bestätigte Zustellung** an Main koppeln
  (Tombstone erst nach erfolgreichem `pluginRendererTornDown`-Ack/zweiter Bestätigung verwerfen, fehlgeschlagene
  Zustellung retrybar), TTL/Ring erst danach. Für den Ein-Fenster-Normalbetrieb (kein Massen-Churn) deferiert.

> *(F-RH4 „mehrere Tabs derselben Datei" ist mit R1-F10 entschieden: ein Tab pro `(pluginId, filePath)`. Kein
> offener Follow-up mehr.)*

---

## Changelog — Review-Runden (NICHT normativ; §§4–12 sind die Spezifikation)

> Adversariales Review durch Codex (`docs/codex-collab/renderer-host-adr-review.md`). Diese Liste ist die
> Entscheidungs-Historie; alle Beschlüsse sind **oben in §§4–12 eingearbeitet** (R1-F11: keine zweite,
> widersprechende Spec mehr).

**Runde 1 (F01–F10):** F01 Trust-Modell ehrlich (volle Host-Rechte, User-Entscheid) → §4/§5.4/§9-I-S2.
F02 `InstalledPluginRuntime` → §5.1. F03 Single-File-ESM + Blob bis Unload → §5.3/§6. F04 `VerifiedRendererPayload`
(kein bytesCache-Widerspruch) → §5.3. F05 In-Flight-Drain → §5.5. F06 best-effort Teardown → §9-I-S4.
F07 plugin-bewusste Datei-Seam (im Code verifiziert) → §7. F08 `registerFileEditor` ohne Extensions → §6/§8.
F09 `FileEditorResolver` → §8. F10 Mount-Vertrag eng + ein Tab pro `(pluginId,filePath)` → §7.

**Runde 2 (F11–F13):** **F11** Amendments waren nur angehängt + Vorrang-Klausel → widersprüchliche Doppel-Spec.
**Behoben:** §§4–12 neu geschrieben, ersetzte Sätze gelöscht, Review-Historie nur noch dieser Changelog.
**F12** Aktivierungs-Transaktion war nicht definiert → **Prepare/Activate/Commit-Protokoll** §5.2 (Main-Acks,
Renderer-Ack via IPC, Index zuletzt, getestete Timeout-/Missing-Renderer-Pfade). **F13** Timeout-Folgen waren
nur UI → **fail-closed Zustandsregel** §5.5 (Timeout → `restart-required`, Index/Payload/Version unangetastet,
kein Nachfolger).

**Runde 3 (F14–F15):** **F14** Transaktion stoppte den Vorgänger nicht vor Kandidatenstart (Doppelbetrieb bis
Commit möglich) → neuer Schritt **Deactivate-Previous** in §5.2 (Drain+Stop des Vorgängers zuerst; fail-closed
bei Drain/Stop-Fehler). **F15** §5.5/§11 („unangetastet") widersprach I-S4 (`finally` entfernt Ressourcen) →
**Teardown-Ressourcenmatrix `success | error | timeout`** in §5.5, verbindlich auch für §9-I-S4 und §11.

**Runde 4 (F16–F17):** **F16** I-S4/Changelog/§11 gaben die `error`-Spalte uneinheitlich wieder (Chrome
entfernen ja/nein) → alle drei **wortgleich** an die §5.5-Matrix angeglichen, muss/darf entschieden:
`success` entfernt Chrome+Payload; `error` entfernt **Chrome** (host-eigen, muss), behält Payload/Index/Version;
`timeout` entfernt nichts. **F17** `Deactivate-Previous` ist sequenziell — Main-`stop()`-Fehler **nach**
Renderer-Unload macht „Payload unangetastet" unmöglich → §5.2 trennt **persistenten** Zustand
(`active.json`/Versionsordner, immer unangetastet) von **Live**-Zustand (`restart-required` bzw.
`partially-stopped`); §11 testet den späten Hybrid-Fehlerpfad.

**Runde 5 (F18–F19):** **F18** Drain-Timeout setzte „bleibt `active`", obwohl das Call-Gate gesperrt blieb
(„active mit geschlossenem Gate") → §5.2: Drain-Timeout ist **nicht** sicher reaktivierbar → **`restart-required`**
(nur ein Abbruch **vor** Schritt 2 lässt den Vorgänger `active`). **F19** §5.3 invalidierte Payload pauschal bei
„fehlgeschlagenem Upgrade" (Kandidat/Vorgänger vermengt) → Invalidierung pro **`(pluginId, version, generation)`**:
Kandidat bei jedem Abbruch verwerfen, Vorgänger **nur** per §5.5-Matrix.
