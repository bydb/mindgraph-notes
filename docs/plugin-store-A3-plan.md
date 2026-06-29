# ADR — Phase A3: Store-UI (Minimal) + Update-Badges

> **Status: FREIGEGEBEN (2026-06-29).** Detailplan zu `docs/plugin-store-plan.md` (Bausteine 7 & 8).
> Setzt auf A2 (`docs/plugin-store-A2-plan.md`) auf — verdrahtet die dort ruhenden IPCs
> `plugin:installFromGithub` + `plugin:checkUpdates` an eine Nutzerfläche.

## 1. Zuschnitt (Minimal)

A3 macht die A2-Pipeline **nutzersichtbar** — **ohne** externes Katalog-Repo. In der bestehenden
„Plugins"-Sektion (Settings → Module, `Settings.tsx`): ein **„Per Repo installieren"-Feld**
(`owner/repo`[+Tag] → `installFromGithub`) und **Update-Badges** je installiertem Plugin
(`checkUpdates` → 1-Klick-„Aktualisieren"). Der browsebare Katalog (`catalog.json`, zentrales
`mindgraph-plugins`-Repo) bleibt **out of scope** (A3-Voll / A5).

## 2. Gelockte Entscheidungen (2026-06-29)

1. **Umfang** = Minimal (Install-per-Repo + Update-Badges), kein Katalog.
2. **Platzierung** = die **bestehende „Plugins"-Sektion** erweitern (kein eigener Tab) — konsolidiert
   mit Datei-Install + Disk-Plugin-Liste.
3. **Update-Check** = **beim Öffnen** der Sektion einmal `checkUpdates` + manueller „Nach Updates
   suchen"-Button. **Kein** Hintergrund-Polling, **kein** automatisches Update.
4. **Sichtbarkeit** = sichtbar, **kein** Katalog-Gate (Install-per-Repo entschärft die „Tür zu nichts").
5. **Update-Knopf** zeigt **`alt → neu`** vor dem Aktualisieren.
6. **Fehler** (Install/Signatur/Download) werden **verständlich** dargestellt (Mapping unten), nicht als
   roher Code/Stacktrace.

## 3. Fehler-Mapping (verständliche Meldungen)

Reiner Renderer-Helfer `utils/pluginErrors.ts`: `ArtifactErrorCode` (Main) → Übersetzungs-Key →
DE/EN-Text. Fallback auf die rohe `error`-Message, sonst „unbekannter Fehler". Gedeckt u.a.:

- **Signatur/Integrität:** `sig-mismatch`/`sig-unknown-key`/`sig-invalid` → „Signatur ungültig — Plugin
  nicht vertrauenswürdig"; `hash-mismatch`/`integrity-invalid` → „Inhalt verändert/beschädigt".
- **Kompatibilität:** `incompatible-app`/`incompatible-api` → „Nicht kompatibel mit dieser App-/API-Version".
- **Download:** `redirect-blocked` → „Download-Ziel ist kein erlaubter GitHub-Host"; `download-failed`/
  `download-timeout` → „Download fehlgeschlagen/Zeitüberschreitung"; `rate-limited` → „GitHub-Limit
  erreicht, später erneut"; `asset-not-found`/`asset-ambiguous`/`release-not-found`/`repo-ref-invalid`.
- **Install:** `id-collision`/`version-conflict`/`workflow-collision`/`manifest-invalid`/`entrypoint-*`/
  `load-failed`.

Wird von Install-per-Repo, Update **und** (retrofit) Datei-Install genutzt — eine Quelle für freundliche
Plugin-Fehler.

## 4. Increments

- **Inc 1 — `utils/pluginErrors.ts`** (reiner Mapper) + `plugins.error.*`-Keys (DE/EN) + Pure-Tests.
- **Inc 2 — „Per Repo installieren"-Feld** in der Plugins-Sektion: `owner/repo`(+Tag)-Input →
  `pluginInstallFromGithub`; Lade-/Erfolg-/Fehler-Zustand (Inc-1-Mapping); Liste refreshen.
- **Inc 3 — Update-Badges**: on-open + manueller `pluginCheckUpdates`; je Plugin mit `hasUpdate` Badge +
  „Aktualisieren (alt → neu)" → `pluginInstallFromGithub(repo)` → refresh + recheck.
- **Verifikation** — typecheck + test + build; Self-Review.

## 5. Reuse vs. Neu

**Reuse:** die A2-IPCs (`pluginInstallFromGithub`/`pluginCheckUpdates`), die bestehende
`installMsg`/`refreshDiskPlugins`-Mechanik, das Sektions-Layout, `useTranslation`. **Neu:**
`utils/pluginErrors.ts`, neue Settings-State/Handler (Install-per-Repo, Updates, Aktualisieren),
`plugins.error.*`-Translations, etwas CSS für Badge/Update-Zeile. **Keine** neuen IPC/Main-Flächen —
A3 ist rein Renderer auf der schon geprüften A2-Grenze.

## 6. Akzeptanzkriterien

- `owner/repo` eingeben → installiert via A2; ungültige Eingabe / Sig-/Download-Fehler erscheinen als
  **verständlicher** Text, nicht als Code.
- Beim Öffnen erscheinen Update-Badges; „Aktualisieren" zeigt `alt → neu` und aktualisiert via A2.
- Kein Auto-Update, kein Hintergrund-Polling; manueller Recheck-Button vorhanden.
- `npm run typecheck` + `npm run test` + `npm run build` grün.

## 7. Out of Scope

- **Browsebare Katalog-Liste** (`catalog.json`, `mindgraph-plugins`-Repo) → A3-Voll / A5.
- **Renderer-Fremd-JS** (S12), **`utilityProcess`-Isolation / private Repos / Auto-Update** → Phase B.
