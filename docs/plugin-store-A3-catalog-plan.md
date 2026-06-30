# Plugin-Store A3-Voll — Browsebarer Katalog (Increment „Catalog")

Status: **umgesetzt** (2026-06-30). Baut auf A2 (Download/Verify) + A3-Minimal (Install-per-Repo,
Update-Badges) auf. Setzt Entscheidung **S3** aus `plugin-store-plan.md` um (Obsidian-Muster).

## Problem
Bis A3-Minimal muss der Nutzer den `owner/repo` eines Plugins kennen, um es zu installieren. Es fehlt
**Discovery**: eine durchsuchbare Liste verfügbarer offizieller Plugins.

## Entscheidung
Ein zentrales **`mindgraph-plugins`-Repo** mit **einer** `catalog.json` (Liste von Einträgen:
`id`, `name`, `repo`, optional `description`/`author`/`category`/`tag`). Die App lädt diese eine Datei und
zeigt sie als **„Katalog"-Sektion im Module-Tab** (Settings → Module). Versions-/Update-Stand kommt live
pro Plugin-Repo aus den bestehenden A2-IPCs (`plugin:installed`, `plugin:checkUpdates`).

### Trust: Katalog UNSIGNIERT (bewusst)
`catalog.json` ist **reine Discovery-Metadaten** und wird nicht signiert. Begründung: Jeder Install-Knopf
ruft `plugin:installFromGithub` → `downloadPluginArtifact` → `verifyPluginArtifact` **gegen
`OFFICIAL_KEYS`** (Ed25519). Ein manipulierter Katalog kann daher **keinen Schadcode installieren** — nur
Listing/Beschreibungen verfälschen oder Einträge verstecken. Verteidigung beim Laden:
- **Host-Allowlist** (`isAllowedHost`, schon `*.githubusercontent.com`), **https only**, manuelle Redirects.
- **Size-Cap** 512 KiB (eigener Cap, nicht die 100-MiB-Artefaktgrenze).
- **Schema + Semantik** (`validateCatalog`/`validateCatalogSemantics`, ajv, `additionalProperties:false`,
  eindeutige ids), Repo-Härtung je Eintrag via `parseRepoRef` (ungültige Einträge werden übersprungen).

Katalog-**Signatur** (Ed25519 wie bei Plugins) ist später sauber nachrüstbar; für v1 nicht nötig, da der
Vertrauensanker beim Install sitzt.

### UI: Sektion im Module-Tab (kein eigener Store-Dialog)
Konsistent mit A3-Minimal. Eine `modules-category`-Sektion „Katalog" über „Per Repo installieren". Status je
Eintrag aus vorhandenem State abgeleitet: nicht installiert → **Installieren**; installiert + Update →
**Aktualisieren (cur → latest)**; installiert + aktuell → **Installiert {version}** (disabled). Such-/
Kategorie-Filter/Empfehlungen bleiben **A5**.

## Betroffene Dateien
- **Vertrag:** `app/packages/plugin-api/src/manifest.ts` (`CatalogEntry`, `CatalogDocument`),
  `…/validation.ts` (`CATALOG_SCHEMA`, `validateCatalog`, `validateCatalogSemantics`).
- **Main:** `app/src/main/plugins/catalog.ts` (`fetchCatalog`, `resolveCatalogUrl`, `CATALOG_URL`),
  `…/artifact/limits.ts` (Code `catalog-invalid`), IPC `plugin:catalog` in `app/src/main/index.ts`,
  `app/src/main/preload.ts` (`pluginCatalog`), `app/src/shared/types.ts` (Typ).
- **Renderer:** `app/src/renderer/components/Settings/Settings.tsx` (Katalog-Sektion im `ModulesTab`),
  `…/utils/translations.ts` (DE+EN-Keys), `…/utils/pluginErrors.ts` (`catalog-invalid`-Mapping).
- **Tests:** `app/packages/plugin-api/src/catalog.validation.test.ts`, `app/src/main/plugins/catalog.test.ts`.

## Konfiguration
- Offizieller URL hardcodiert: `https://raw.githubusercontent.com/bydb/mindgraph-plugins/main/catalog.json`.
- Dev-Override `MINDGRAPH_PLUGIN_CATALOG_URL` — **nur in ungepackten Builds** (analog Dev-Keyring), für
  lokale Test-Kataloge/E2E.

## Offen (Folge-Schritte)
- **User legt `bydb/mindgraph-plugins` (public) an** + committet `catalog.json` (Inhalt vorbereitet,
  zunächst nur der Demo-Eintrag) — analog zur Demo-Repo-Aufteilung. Danach zeigt `CATALOG_URL` live darauf.
- GUI-E2E nach Repo-Anlage: Katalog-Sektion zeigt „MindGraph Demo" → Installieren → Status wechselt.
- A5: Suche/Kategorie-Filter/Empfehlungen; optional Katalog-Signatur.
