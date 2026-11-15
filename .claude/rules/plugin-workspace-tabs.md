---
paths:
  - "app/src/renderer/plugins/external/**"
  - "app/packages/plugin-api/src/rendererHost.ts"
  - "app/packages/plugin-api/src/manifest.ts"
  - "app/packages/plugin-api/src/validation.ts"
  - "app/src/main/plugins/rendererRuntime.ts"
---

# Externe Plugins: Arbeitsbereich-Tabs, invoke, composeMail (Plugin-API 0.2.3, seit 15.11.2026)

Anlass: das Rechnungs-Plugin **Faktura** (`bydb/mindgraph-faktura-plugin`, ID `mindgraph-faktura`) sollte in einem eigenen Repo leben. Externe Renderer-Plugins konnten bis 0.2.2 nur Datei-Editoren und Embeds — keinen eigenen Tab, keine eigenen Main-Actions aufrufen, kein Schreibfenster öffnen. Alles hier ist **additiv und optional** (`host.x?.()` feature-detected), 0.2.x-Plugins laufen unverändert.

- **`ui.workspaceTabs[]`** im signierten Manifest (`tabId` `^[a-z0-9][a-z0-9-]*$`, `label` ≤40, `icon` nur SVG-Pfadbefehle). Nur mit `entrypoints.renderer`, tabId eindeutig (`validateManifestSemantics`). Der Main liest die Tabs aus dem verifizierten Manifest (`rendererRuntime.describe/servePayload`), nicht aus einem eigenen Aktivierungsfeld — darum keine Änderung an den drei Aktivierungspfaden in `index.ts`.
- **`host.registerWorkspaceTab({tabId, mount})`** nur während `activate()`; jede deklarierte tabId GENAU EINMAL, sonst Aktivierung terminal (`register`). Werkzeuge-Menü listet `externalRendererRegistry.listWorkspaceTabs()`; Tab-Typ `plugin-view`, tabId liegt in `Tab.editorId`. Der Tab wird bei Vault-Wechsel neu gemountet (Key enthält `vaultPath`) — das Plugin erfährt den Wechsel sonst nicht.
- **`host.invoke(actionId, payload)`** nur für Actions mit Präfix `<pluginId>.`; geht über `pluginInvoke`, Schema/Capability prüft die Main-Registry. Komfort, keine Grenze (Option A: das Plugin erreicht `electronAPI` ohnehin).
- **`host.composeMail({to, subject, body, attachments:[{name, bytes}]})`** legt Anhänge über `email-stage-compose-files` ab und setzt `composeState`. **Verschickt nie** — Senden bleibt beim Nutzer. Wirft ohne Mailkonto oder wenn ein Anhang übersprungen würde.
- **`openLink`** öffnet zusätzlich PDFs im Vault im eingebauten Betrachter (exakter Pfad im Dateibaum, nur mit Nutzergeste). Per CDP testen: `Input.dispatchMouseEvent`, ein JS-`click()` zählt nicht als Geste.
- **Nach jeder Änderung an `packages/plugin-api`: `npm run build:signer` + Bundle committen** — der Signier-Workflow prüft Manifeste mit `scripts/sign-plugin.cjs`; ohne Neubau lehnt er `ui.workspaceTabs` ab, und der Drift-Check der CI wird rot.
- Plugins mit `ui.workspaceTabs` brauchen `apiVersion: "^0.2.3"`; ältere Apps (API 0.2.2) lehnen sie am Kompat-Gate ab, bevor das Schema greift.
