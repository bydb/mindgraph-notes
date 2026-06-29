# ADR — Phase A2: Install-/Signatur-Pipeline (GitHub-Download)

> **Status: FREIGEGEBEN (2026-06-29).** Detailplan zu `docs/plugin-store-plan.md` (Bausteine 5 & 8).
> Setzt auf die fertigen Fundamente A0/3 (Artefakt-Verifier) + A1 (Runtime-Loader, Install-from-File) auf.
> Voraussetzung A-pre („Kern entkennt Plugins") ist erfüllt.

## 1. Ziel & Zuschnitt

A2 setzt **einen GitHub-Download-Frontend vor die bestehende Verify+Install-Pipeline**. Ein Plugin wird
per `owner/repo` installiert: neuestes Release auflösen → signiertes `.mgxplugin`-Asset laden → in den
unveränderten Pfad `installAndActivate(buffer)` geben. Plus ein **read-only Update-Checker** (Versions-
Badge). **Keine Store-UI** (das ist A3), **kein Katalog-Repo**, **kein** Renderer-Fremd-JS (S12, vertagt).

**Kernbefund der Naht-Analyse:** `installAndActivate(deps, archive: Buffer)` (`plugins/runtime/manage.ts:170`)
nimmt direkt einen **Buffer**. Der Download-Buffer fließt damit 1:1 in die schon signaturgeprüfte Pipeline
(`verifyPluginArtifact` → Quarantäne → atomarer Install → `activate`). A2 ruft den Verifier **nicht** neu
auf — er ist Teil von `installAndActivate`. Alles im **Main-Prozess**; über IPC gehen nur `{owner,repo}`
rein und Metadaten raus (kein Buffer über IPC).

## 2. Gelockte Entscheidungen (2026-06-29)

1. **Eingabe** = `owner/repo`-Kurzform; neuestes Release per GitHub-Releases-API aufgelöst.
2. **Release-Wahl** = neuestes **Nicht-Prerelease** (`GET /releases/latest` schließt Draft+Prerelease per
   GitHub-Semantik aus); konkreter Tag optional überschreibbar (`/releases/tags/{tag}`).
3. **Redirect-/Host-Sicherheit** = Redirects **manuell** folgen, jeder Hop-Host gegen eine **GitHub-Allowlist**
   geprüft; harte **Größen-** (streaming-abort) + **Timeout**-Limits; Download ist **untrusted bis zum
   Ed25519-Verify** in der Pipeline.
4. **Auth** = nur **öffentliche** Repos, **kein Token** (unauth GitHub-API, 60 Req/h/IP — für Einzelnutzer ok;
   bei Überschreitung klare Fehlermeldung).
5. **Kein Katalog-Repo** in A2 — Direkt-Install per Repo; `catalog.json`/Store-UI ist A3.

## 3. Security-Design des Downloaders (der A2-Kern)

`app/src/main/plugins/download.ts` (neu). **Fail-closed** an jeder Stufe:

- **`parseRepoRef(input)`** — akzeptiert strikt `owner/repo` (GitHub-Charset, kein Pfad/`..`/Query/Schema);
  alles andere → Fehler. Rein, getestet.
- **`resolveReleaseAsset(owner, repo, tag?)`** — `GET https://api.github.com/repos/{owner}/{repo}/releases/latest`
  (oder `/releases/tags/{tag}`) mit `User-Agent: MindGraph-Notes` + `Accept: application/vnd.github+json`.
  Aus `assets[]` genau **ein** Asset mit Endung `.mgxplugin` wählen (0 oder >1 → Fehler, kein Raten).
  Liefert `{ assetUrl, tag, version }`.
- **`downloadCapped(url, limits)`** — der sicherheitskritische Teil:
  - **Manuelles Redirect-Following** (`fetch(url, { redirect: 'manual' })`): bei 3xx den `Location`-Host gegen
    `GITHUB_HOST_ALLOWLIST` prüfen, sonst abbrechen. Max. 5 Hops.
  - **Host-Allowlist:** `api.github.com`, `github.com`, `codeload.github.com`, `objects.githubusercontent.com`,
    `release-assets.githubusercontent.com`, `*.githubusercontent.com`. **Kein** beliebiger Host → kein
    SSRF/Exfil-Vektor, selbst wenn ein Release-Asset bösartig umgeleitet würde.
  - **Streaming-Größen-Abbruch:** Body über den Reader akkumulieren, bei Überschreiten von
    `limits.maxArchiveBytes` (100 MiB) **sofort abbrechen** — `content-length` wird **nicht** vertraut.
  - **Timeout:** `AbortController`, Gesamt-Deadline (Default 60 s).
  - Rückgabe: `Buffer` (komprimiertes Artefakt, weiterhin untrusted).
- **Danach:** `installAndActivate(buffer)` übernimmt — `gunzipCapped` + Tar-Extract + **Ed25519-Verify** +
  Integrity-Hashes + Manifest-Kompat-Gate + Quarantäne + atomarer Install + Aktivierung. Erst hier wird das
  Artefakt vertrauenswürdig.

> Verteidigungstiefe: Selbst ein durch die Allowlist gelangter bösartiger Buffer scheitert am Ed25519-Verify
> (App hat den Public Key eingebaut). Die Allowlist verhindert zusätzlich, dass der Downloader als
> SSRF/Exfil-Werkzeug zu beliebigen Hosts missbraucht wird.

## 4. Increment-Plan

- **Inc 1 — `download.ts`** (`parseRepoRef`, `isAllowedHost`, `resolveReleaseAsset`, `downloadCapped`) + Pure-Tests
  (fetch injizierbar; Mocks für latest/tag/missing-asset/oversize/bad-redirect/timeout).
- **Inc 2 — IPC `plugin:installFromGithub`** (`index.ts` + `preload.ts` + `shared/types`): `isTrustedSender` →
  parse → resolve → download → `serializePluginOp(installAndActivate(buffer))` → `publishExternalWidgetState()`
  → Metadaten. Fehler normalisiert (ArtifactError-Codes + Netz/HTTP).
- **Inc 3 — `update-checker.ts`** + IPC `plugin:checkUpdates`: je installiertem Plugin mit `manifest.repo`
  (optionales, http-validiertes Feld — vorhanden) owner/repo parsen, `releases/latest` holen, **semver-Vergleich**
  → `[{id,current,latest,hasUpdate,repo}]`. **Read-only** (lädt nichts auto — Badge, Install via Inc 2). Plugins
  ohne `repo` werden übersprungen + gemeldet.
- **Verifikation** — typecheck + test + build grün; adversariale Self-Review (bösartiger Redirect, oversize,
  manipuliertes Asset → Verify schlägt fehl).

## 5. Wiederverwendung vs. Neu (aus der Naht-Analyse)

**1:1 wiederverwendet (keine Änderung):** `installAndActivate` (Buffer!), `verifyPluginArtifact`,
`discoverVersion`, `assertSafeStoreVersionDir`, `buildKeyring`, `serializePluginOp`, Quarantäne, `blockedIds`,
`limits.ts`. **Neu:** `download.ts`, `update-checker.ts`, zwei IPC-Handler, preload+Typen. `readArchiveFileCapped`
(Pfad) bekommt **kein** Buffer-Pendant — der Download-Buffer geht direkt in `installAndActivate`, dessen
`gunzipCapped`/Extract die Limits ohnehin erzwingt; der Größen-Abbruch passiert schon beim Streamen.

## 6. Akzeptanzkriterien

- Ein öffentliches Repo mit signiertem `.mgxplugin`-Release lässt sich per `owner/repo` installieren; ein
  unsigniertes/manipuliertes Asset wird **abgelehnt** (Ed25519-Verify), ohne dass etwas Aktives entsteht.
- Redirect zu einem Nicht-GitHub-Host → **abgebrochen**; Asset > 100 MiB → **streaming-abgebrochen**;
  Timeout greift.
- `plugin:checkUpdates` meldet je Plugin mit `repo` korrekt `hasUpdate`; ohne `repo` → übersprungen.
- `isTrustedSender` auf beiden Handlern; keine Buffer über IPC; keine Secrets/Token.
- `npm run typecheck` + `npm run test` + `npm run build` grün.

## 7. Out of Scope (bewusst)

- **Store-UI / Katalog-Repo / `catalog.json`** → A3.
- **Renderer-Fremd-JS** (heruntergeladenes React mounten, S12) → eigener Spike.
- **Auto-Update-Install** (der Checker meldet nur; Installieren bleibt User-ausgelöst über Inc 2).
- **Private Repos / Token-Auth**, **`utilityProcess`-Isolation** → Phase B.
