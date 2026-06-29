# A1 — Runtime-Loader (Disk-Install + Aktivierung), Main-only (Plan / ADR)

> **Status: BESCHLOSSEN — Umsetzung läuft (Draft-PR #28).** Erster Schritt von **Phase A1**, frisch
> von `master` nach Merge #27 (A0/3). Branch `feat/plugin-runtime-loader`. Baut auf dem verifizierten
> Artefaktformat (`docs/plugin-artifact-format-plan.md`) + der Manifest-/Kompat-Schicht (A0/2) auf.
> Entscheidungen unten in Review-Runde 1 bestätigt/präzisiert.

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

### 1. Install-Layout, Versionierung, atomare Aktivierung + Rollback

- Quarantäne: `userData/plugins/.quarantine/<rand>/` (Verifikation schreibt hierhin, A0/3).
- Store: **`userData/plugins/store/<id>/<version>/`** (Payload + persistiertes `integrity.json` +
  `integrity.json.sig`). **Mehrere Versionen dürfen nebeneinander installiert sein.**
- **Aktivierungsindex außerhalb der Versionsordner:** `userData/plugins/active.json` (atomar via
  temp+`rename` geschrieben) bildet `id → aktive Version` ab. **Discovery lädt ausschließlich die in
  `active.json` eingetragene aktive Version — nicht alles Gefundene.**
- **Atomar materialisieren:** aus der Quarantäne nach `store/<id>/<version>.tmp-<rand>/`, dann
  `rename()` auf `store/<id>/<version>/`. Schlägt etwas fehl → temp + Quarantäne löschen, **kein**
  Teil-Install.
- **Upgrade schaltet erst nach erfolgreichem Verify + Load atomar um:** neue Version materialisieren →
  re-verifizieren → Entry laden → **erst dann** `active.json` atomar auf die neue Version zeigen.
  Die vorherige Version **bleibt für Rollback erhalten** (automatisches Aufräumen: später).
- Pfad-Schutz: `id`/`version` stammen **nur aus dem verifizierten Manifest** (nicht aus Dateinamen),
  zusätzlich gegen `assertSafePath` (kein Traversal über die `userData/plugins`-Wurzel hinaus).

### 1b. Idempotenz nur bei byte-identischem Artefakt

`id@version` bereits installiert → Re-Install ist **idempotent nur, wenn das Artefakt
byte-identisch** ist (Vergleich über die verifizierten Datei-Hashes / das gespeicherte
`integrity.json`). **Abweichender Inhalt unter derselben Version ist ein Fehler** (kein stilles
Überschreiben, keine Mehrdeutigkeit, welche Bytes „Version X" sind).

### 1c. ID-Kollisionsschutz (Kern-Integrität)

Eine externe Plugin-ID darf **niemals** ein gebündeltes Plugin oder eine reservierte Kern-ID
überschreiben. Kollisionen werden **sowohl beim Installieren als auch beim Laden explizit
abgelehnt** (terminaler Fehler), nie still gewinnt-erster/letzter. Die Sperrliste = IDs der
gebündelten Plugins (`discoverMainPlugins`) ∪ reservierter Kern-IDs.

### 2. Re-Verifikation beim Laden (nicht nur beim Install)

Beim Install werden **payload + `integrity.json` + `integrity.json.sig`** persistiert. Bei **jedem
App-Start** wird das installierte Verzeichnis **erneut verifiziert** (Hashes gegen `integrity.json`
+ Ed25519 gegen Keyring). **Fail-closed:** schlägt die Re-Verifikation fehl, wird das Plugin **nicht
geladen** und landet im Zustand **`error`/`unavailable`** — die **Installation bleibt unangetastet**
(kein Auto-Löschen). Begründung: erfüllt den Manipulations-Test (jemand tauscht `main.js` auf der
Platte aus). Kosten: einmal sha256 über die Payload pro Plugin beim Start (günstig; kein erneutes
Entpacken nötig).

### 3. Trust-Keyring (Produktion sicher, Dev testbar)

- Die App pinnt den **offiziellen SPKI-Public-Key** (`mindgraph-official-…`) im Verifier-Keyring.
- **Solange kein Prod-Key provisioniert ist, ist der Produktions-Keyring leer → es lässt sich real
  KEIN Fremd-Artefakt laden** (`sig-unknown-key`). Das ist beabsichtigt und macht A1 vor der
  Maintainer-Freischaltung sicher inert.
- **Dev-Escape (ausschließlich Dev-Builds):** nur wenn **`!app.isPackaged`** UND der Pfad
  **`MINDGRAPH_PLUGIN_DEV_KEYRING_PATH`** explizit gesetzt ist, werden die SPKI-Public-Keys aus
  **dieser Datei** in den Keyring gemischt. **Kein stiller Fallback**, kein Inline-ENV-Key. In
  Produktions-Builds (`app.isPackaged`) wird der Pfad ignoriert. **Tests** injizieren den Keyring
  weiterhin per **Dependency Injection** (nicht über die ENV).

### 4. Registry-Integration (eine Registry, zwei Quellen)

- `discoverMainPlugins()` liefert heute gebündelte Quellen via `import.meta.glob`. A1 ergänzt
  **Disk-Quellen**: pro Plugin **nur die in `active.json` aktive Version** (+ re-verifiziert) eine
  `MainPluginSource` mit `loadEntry = () => require(<installiertes main.js>)` (CJS via `createRequire`).
- **ID-Kollision beim Laden:** eine Disk-Quelle, deren `id` ein gebündeltes/reserviertes Plugin
  trifft, wird **verworfen** (terminaler Fehler, gebündeltes Plugin gewinnt immer) — nicht „erste
  ID gewinnt".
- Dieselbe `PluginRegistry` validiert das Manifest **erneut** (Defense-in-Depth) + Kompat-Gates +
  Capability-/Hard-Lock-Prüfungen. Ein defektes/inkompatibles/manipuliertes/re-verify-fehlerhaftes
  Disk-Plugin landet im terminalen `error`-Zustand (kein App-Start-Risiko, Isolation pro Plugin).
- Aktivierung respektiert den Modulschalter wie bei gebündelten Plugins (A-pre).

### 5. IPC + minimaler Einstieg

- IPC `plugin-install` (Datei-Dialog → Bytes → verify → atomarer Install → Registry-Reload),
  `plugin-uninstall` (deaktivieren + Verzeichnis entfernen), `plugin-list` (Zustände).
- **Minimaler Spike-Umfang:** Datei auswählen/installieren, **installierte aktive Version** anzeigen
  und **verständlicher Fehlerstatus**. **Noch kein** Store, keine Update-UX, keine Versionsverwaltung.
  Kein Renderer-Beitrags-Mechanismus in diesem Spike.

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

## Entschieden (Review-Runde 1)

1. **Re-Verify bei jedem App-Start: ja, fail-closed.** Fehler → nicht laden, `error/unavailable`,
   Installation unangetastet (§2).
2. **Layout `store/<id>/<version>/` + atomarer Aktivierungsindex `active.json` außerhalb der
   Versionsordner.** Discovery lädt **nur die aktive Version** (§1).
3. **Dev-Keyring nur bei `!app.isPackaged` UND `MINDGRAPH_PLUGIN_DEV_KEYRING_PATH`** (expliziter
   Dateipfad), kein stiller Fallback; Tests per DI (§3).
4. **Mehrere Versionen installiert, genau eine aktiv.** Upgrade schaltet erst nach erfolgreichem
   Verify + Load atomar um; Vorgänger bleibt für Rollback; Auto-Cleanup später (§1).
5. **Minimaler UI-Umfang** (auswählen/installieren, aktive Version, Fehlerstatus) (§5).
6. **ID-Kollisionsschutz** (gebündelt/reserviert nie überschreibbar; Ablehnung bei Install + Load) (§1c).
7. **Idempotenz nur bei byte-identischem Artefakt**; abweichender Inhalt unter gleicher Version =
   Fehler (§1b).

## Akzeptanzkriterien

- `verifyPluginArtifact()` ist der einzige Pfad in die Installation; nichts wird ohne grüne
  Verifikation aktiviert.
- Re-Verify beim Start (fail-closed); manipuliertes Install-Verzeichnis wird abgelehnt (Test).
- Rollback lässt nie ein Teil-Install zurück; aktive Version wechselt erst nach Verify+Load (Test).
- ID-Kollision mit gebündeltem Plugin wird bei Install **und** Load abgelehnt (Test).
- Re-Install byte-identisch = idempotent; abweichend = Fehler (Test).
- `npm run typecheck` + `npm run test` + `npm run build` grün; gebündelte Plugins unverändert.

## Entschieden (Review-Runde 2 — Integrationsreview Wiring)

8. **Index-Commit ZULETZT (ADR-konform, bestätigt).** `installPluginArtifact()` materialisiert +
   re-verifiziert NUR; es setzt `active.json` NICHT. Den Index committet `manage.installAndActivate()`
   erst nach erfolgreichem Load + Activate. Verhindert eine Crash-Schleife, falls der Prozess während
   `start()` abbricht (sonst zeigte der persistente Index auf eine crash-loopende Version).
9. **Doppelfehler (Aktivierung scheitert UND `stop()` der neuen Version wirft) = `PluginRestartRequiredError`.**
   Die Vorgängerversion wird NICHT in-Process reaktiviert (sonst liefen zwei Versionen + geleakte
   Timer gleichzeitig). Der kaputte Entry bleibt für einen Stop-Retry; der Index zeigt weiter auf den
   Vorgänger (lädt sauber beim Neustart); die UI meldet „Neustart erforderlich".
10. **Workflow-Action-Kollision = TERMINALE Ablehnung des Plugins.** Deklariert ein Disk-Plugin eine
    Action-ID, die mit einer Kern- oder fremden/besitzlosen Plugin-Action kollidiert, wird die
    Aktivierung abgelehnt (kein still-degradiertes Plugin mit nur teilweise registriertem Vertrag).
    Owner-Tracking entfernt beim Uninstall nur die EIGENEN Actions.
11. **Schreibende Plugin-IPC (install/uninstall) sind serialisiert** (Promise-Kette) — `active.json`
    ist read-modify-write; ohne Serialisierung verlöre eine nebenläufige Operation einen Eintrag.
12. **Doppelfehler behält den Kandidatenordner (kein destruktives Startup-GC).** Der nach einem
    Doppelfehler bewusst behaltene (evtl. noch laufende) Entry darf seinen Versionsordner nicht
    verlieren — `cleanupFreshVersion` läuft NUR nach sauberem Stop. Der dormante Ordner bleibt als
    inaktive Version liegen (Mehrversions-Design §1/§4). **Bewusst KEIN `reconcileStore`-GC:** ein
    fail-closed `readActiveIndex()` (fehlende/beschädigte `active.json` → `{active:{}}`) würde sonst
    als autoritative Löschliste den ganzen Store wischen. Sicheres GC erst später (F5, Tombstones /
    nur nach validiertem Index).
13. **Fehler beim finalen Index-Commit = dieselbe Recovery-Transaktion.** Wirft `setActiveVersion`
    (I/O/Permissions/Disk-voll) NACH erfolgreicher Aktivierung, läuft die neue Version bereits, ist
    aber nicht persistiert → gleicher Rollback wie bei einem Aktivierungsfehler (`rollbackStartedVersion`:
    neue Version sauber stoppen + Vorgänger live; bei Stop-Doppelfehler `PluginRestartRequiredError`).
    **Uninstall analog:** scheitert der `active.json`-Austrag, wird die noch persistierte aktive Version
    wieder registriert + aktiviert. Der Commit-Writer ist per `ManageDeps.commitActiveVersion`
    injizierbar (Test).
14. **Workflow-Action-Kollision wird AUCH beim Startup terminal behandelt.** `discoverAndRegisterInstalled`
    prüft vor jeder Registrierung `findWorkflowActionCollisions`; eine Kollision (z.B. durch ein
    App-Update neu entstandene Kern-ID) erzeugt einen Discover-Fehler (`workflow-collision`) statt einer
    partiell registrierten Quelle — gleiches Verhalten wie im Install-Pfad.

## Offene ADR-Follow-ups (bekannte Low-Risiken, bewusst zurückgestellt)

- **F1 — `stop()`-Timeout:** Ein Plugin, dessen `stop()` nie auflöst (Hang, nicht Reject), lässt
  `unregister()`/das Upgrade unbegrenzt hängen. Folge-PR: `stop()` mit hartem Timeout umschließen →
  bei Überschreitung wie ein Stop-Fehler behandeln (`PluginRestartRequiredError`).
- **F2 — Gegatete Disk-Plugins re-enablen:** Ein Disk-Plugin mit `manifest.module.enabledPath` ohne
  zugehörigen UI-Toggle (Disk-Plugins sind nicht in `MODULES`) ist nach Neustart still `disabled` und
  nicht reaktivierbar. Folge-PR: pro Disk-Plugin einen Enable/Disable-Schalter in der Verwaltungs-UI
  (oder Disk-Plugins generisch in die Modul-Liste aufnehmen).
- **F3 — TOCTOU `stat`→`readFile` beim Archiv-Lesen:** Wird die (user-gewählte) Datei zwischen
  Größen-`stat` und `readFile` getauscht, ist der OOM-Schutz umgehbar. Niedrig (lokaler Schreib-Race
  auf genau diesen Pfad nötig). Folge-PR: per `open()`+`fstat`+streamendes Lesen mit Hard-Cap auf
  EINEM File-Handle.
- **F4 — Action-ID-Namespacing nicht erzwungen:** `workflowAction.id` ist nicht schema-seitig auf
  ein `<pluginId>.`-Präfix beschränkt. Der Schaden (Shadowing/Löschen fremder Actions) ist durch den
  Owner-Guard (§10) verhindert; das Namespacing-Schema bleibt als Härtung offen (Manifest-v2-Update).
- **F5 — Sicheres Store-GC (dormante/verwaiste Versionsordner):** Inaktive Versionen (Rollback-
  Vorgänger, nach Doppelfehler behaltene Kandidaten, alte Upgrade-Versionen) sammeln sich an. Ein
  naives „lösche alles nicht-Aktive laut `active.json`" ist gefährlich (fail-closed-Index → Total-
  löschung). Folge-PR: Tombstone-/Generationszähler je Version + GC NUR nach nachweislich validem,
  nicht-leerem Index; Reaktivierungsfenster für Rollback respektieren.
