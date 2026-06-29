# MindGraph Notes — Plugin-Template (Main-only, A0/3)

Starter für ein **Main-only**-Plugin. Es baut zu einem self-contained CommonJS-`main.js` und wird
als signiertes `.mgxplugin`-Artefakt verteilt. Renderer-Plugins (UI) folgen in einem späteren
Schritt (A1) — dieses Template deckt sie bewusst noch nicht ab.

> Verbindlicher Format-/Sicherheitsvertrag: `docs/plugin-artifact-format-plan.md` im Hauptrepo.

## Struktur

```
manifest.json          # v2-Manifest (entrypoints.main = "main.js")
src/main.ts            # Main-Entry: nur @mindgraph/plugin-api importieren
build.mjs              # esbuild → dist/main.js (CJS) + kanonische dist/manifest.json
esbuild.config.mjs     # geteilte Build-Optionen + Built-in-Bann
scripts/keygen-dev.mjs # erzeugt EINEN lokalen Dev-Key (git-ignoriert)
```

## Main-ABI (verbindlich)

- `src/main.ts` exportiert `export default definePluginMain(...)`.
- Der Build erzeugt **self-contained CommonJS**: `require("main.js")` liefert direkt den
  `PluginMainEntry`. Node lädt eine lose `.js` ohne nahe `package.json` als CommonJS.
- **Keine** Node-/Electron-Built-ins (`fs`, `path`, `electron`, …) — der Build bricht sonst ab.
  Host-Dienste kommen ausschließlich über `ctx.host` (capability-gated).

## Lokaler Ablauf

```bash
nvm use                # Node-Version aus .nvmrc (exakt gepinnt)
npm install            # benötigt @mindgraph/plugin-api ab npm (>= 0.2.0)
npm run build          # → dist/main.js + dist/manifest.json
npm run keygen:dev     # erzeugt local.dev-key.json (git-ignoriert)
```

Packen + Signieren (zu `.mgxplugin`) und die Verifikation übernimmt die Pipeline / das offizielle
Toolchain-CLI; lokal wird mit dem **Dev-Key** signiert und gegen einen Test-Keyring verifiziert.
Der Dev-Key wird **nie automatisch** verwendet und **nie committet**.

## Sicherheit / Signierung

- **Phase A:** Sicherheit kommt aus **Signatur + Autorvertrauen**, nicht aus Laufzeit-Isolation.
- **Dev-Signierung (lokal/PR-CI):** ephemerer bzw. via `keygen:dev` erzeugter Dev-Key.
- **Release-Signierung (Produktion):** läuft **ausschließlich** im geschützten CI-Environment mit
  einem dort hinterlegten Secret. Es werden hier **nur Secret-Namen** dokumentiert, niemals Werte:
  - `PLUGIN_SIGNING_KEY` — Ed25519-Privatschlüssel (PKCS#8 PEM), nur im Environment `release-signing`.
  - npm-Publish des API-Pakets nutzt **Trusted Publishing (OIDC)** + `--provenance` — **kein**
    langlebiger npm-Token.

## Kompatibilität

`apiVersion` (SemVer-Range) und `minAppVersion` werden beim Laden gegen die App geprüft
(`semver.satisfies` / `semver.gte`). Inkompatible Plugins werden gar nicht erst aktiviert.
