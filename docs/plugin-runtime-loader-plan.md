# A1 — Runtime-Loader (Disk-Install + Aktivierung), Main-only (Plan / ADR)

> **Status: ENTWURF — zur Review.** Erster Schritt von **Phase A1**, frisch von `master` nach Merge
> #27 (A0/3). Branch `feat/plugin-runtime-loader`. Baut auf dem verifizierten Artefaktformat
> (`docs/plugin-artifact-format-plan.md`) + der Manifest-/Kompat-Schicht (A0/2) auf.

## Ziel

Externe `.mgxplugin`-Artefakte zur **Laufzeit** laden und ausführen — die eigentliche neue
**Vertrauensgrenze** (Drittanbieter-Code im Main-Prozess). Genau die fünf Schritte:

1. `.mgxplugin` auswählen / einlesen
2. `verifyPluginArtifact()` (A0/3)
3. atomare Installation **+ Rollback**
4. Registry-Aktivierung von `main.js`
5. Neustart-/Fehler-/Manipulations-Tests

**Main-only.** Renderer-Plugins (UI-Beiträge) sind ein **separater zweiter Spike** — bewusst
ausgeklammert, um die Vertrauensgrenze klein zu halten.

## Sicherheitslage (unverändert aus A0/3)

In Phase A kommt Sicherheit aus **Signatur + Autorvertrauen**, nicht aus Laufzeit-Isolation. Ein
installiertes `main.js` läuft im Vertrauen des Main-Prozesses bis zur `utilityProcess`-Sandbox
(Roadmap #10). A1 verschiebt das nicht — es macht die Grenze nur *betretbar* und stellt sicher,
dass **nur signierte, kompatible, unveränderte** Artefakte sie passieren.

## Beschlossene Entscheidungen (Vorschlag)

### 1. Install-Ort + atomare Installation + Rollback

- Quarantäne: `userData/plugins/.quarantine/<rand>/` (Verifikation schreibt hierhin, A0/3).
- Finaler Ort: **`userData/plugins/<id>/<version>/`** (versioniert nebeneinander).
- **Atomar:** in `…/<id>/<version>.tmp-<rand>/` materialisieren (aus der Quarantäne), dann
  `rename()` auf den finalen Pfad (atomar innerhalb desselben Dateisystems). Schlägt irgendetwas
  fehl → temp + Quarantäne löschen, **kein** Teil-Install. Existiert die Zielversion bereits →
  Abbruch (idempotent, kein stilles Überschreiben).
- Pfad-Schutz: `id`/`version` stammen **nur aus dem verifizierten Manifest** (nicht aus Dateinamen),
  zusätzlich gegen `assertSafePath` (kein Traversal über die `userData/plugins`-Wurzel hinaus).

### 2. Re-Verifikation beim Laden (nicht nur beim Install)

Beim Install werden **payload + `integrity.json` + `integrity.json.sig`** persistiert. Bei **jedem
Laden** (App-Start) wird das installierte Verzeichnis **erneut verifiziert** (Hashes gegen
`integrity.json` + Ed25519 gegen Keyring). Begründung: erfüllt den Manipulations-Test (jemand
tauscht `main.js` auf der Platte aus) — Trust-on-Install allein würde das nicht erkennen. Kosten:
einmal sha256 über die Payload pro Plugin beim Start (günstig; kein erneutes Entpacken nötig).

### 3. Trust-Keyring (Produktion sicher, Dev testbar)

- Die App pinnt den **offiziellen SPKI-Public-Key** (`mindgraph-official-…`) im Verifier-Keyring.
- **Solange kein Prod-Key provisioniert ist, ist der Produktions-Keyring leer → es lässt sich real
  KEIN Fremd-Artefakt laden** (`sig-unknown-key`). Das ist beabsichtigt und macht A1 vor der
  Maintainer-Freischaltung sicher inert.
- **Dev-Escape (nur Dev-Builds):** ein Dev-Keyring-Eintrag aus `MINDGRAPH_PLUGIN_DEV_PUBKEY`
  (SPKI) / Dev-Setting — in Produktions-Builds ignoriert. So sind Loader + Tests ohne Prod-Key
  fahrbar.

### 4. Registry-Integration (eine Registry, zwei Quellen)

- `discoverMainPlugins()` liefert heute gebündelte Quellen via `import.meta.glob`. A1 ergänzt
  **Disk-Quellen**: pro installiertem (+ re-verifiziertem) Plugin eine `MainPluginSource` mit
  `loadEntry = () => require(<installiertes main.js>)` (CJS, via `createRequire`).
- Dieselbe `PluginRegistry` validiert das Manifest **erneut** (Defense-in-Depth) + Kompat-Gates +
  Capability-/Hard-Lock-Prüfungen. Ein defektes/inkompatibles/manipuliertes Disk-Plugin landet im
  bestehenden terminalen `error`-Zustand (kein App-Start-Risiko, Isolation pro Plugin).
- Aktivierung respektiert den Modulschalter wie bei gebündelten Plugins (A-pre).

### 5. IPC + minimaler Einstieg

- IPC `plugin-install` (Datei-Dialog → Bytes → verify → atomarer Install → Registry-Reload),
  `plugin-uninstall` (deaktivieren + Verzeichnis entfernen), `plugin-list` (Zustände).
- **Main-only:** eine schlichte Settings-Aktion „Plugin installieren" genügt; echte Plugin-UX/
  Store-Ansicht ist später. Kein Renderer-Beitrags-Mechanismus in diesem Spike.

## Tests (Schritt 5)

1. **Happy:** install → aktivieren → Action invoken (Dev-Key/-Keyring).
2. **Neustart:** installiertes Plugin wird re-entdeckt, re-verifiziert, (wenn enabled) aktiviert.
3. **Rollback:** verify schlägt fehl → **kein** Install-Verzeichnis, Quarantäne sauber entfernt.
4. **Manipulation:** installiertes `main.js`/`manifest.json` nachträglich ändern → Laden/Aktivieren
   wird abgelehnt (Re-Verify hash-/sig-mismatch).
5. **Inkompatibel:** `apiVersion`/`minAppVersion` passt nicht → beim Register geblockt (A0/2-Gate).

## Scope-Grenze

- **Kein Renderer-Plugin-Loading** (UI-Beiträge) → zweiter A1-Spike.
- **Keine** Laufzeit-Isolation (`utilityProcess`) → Roadmap #10.
- **Kein** Store-Frontend/Auto-Update von Plugins → später.
- Realer Fremd-Load erst nach Provisionierung des Prod-Keys (Maintainer).

## Offene Punkte für die Review

1. **Re-Verify-on-Load** (Empfehlung) vs. Trust-on-Install — Kosten/Sicherheit ok?
2. Install-Layout `userData/plugins/<id>/<version>/` + Persistenz von `integrity.json`+`.sig` — ok?
3. **Dev-Keyring-Escape** via Env/Setting (nur Dev-Builds) — gewünschte Form?
4. Mehrere Versionen: **nebeneinander** (Vorschlag) vs. Ersetzen?
5. A1-Umfang jetzt: Loader + IPC **+ minimaler Install-Button**, oder Loader/IPC ohne UI in diesem Spike?

## Akzeptanzkriterien

- `verifyPluginArtifact()` ist der einzige Pfad in die Installation; nichts wird ohne grüne
  Verifikation aktiviert.
- Re-Verify beim Start; manipuliertes Install-Verzeichnis wird abgelehnt (Test).
- Rollback lässt nie ein Teil-Install zurück (Test).
- `npm run typecheck` + `npm run test` + `npm run build` grün; gebündelte Plugins unverändert.
