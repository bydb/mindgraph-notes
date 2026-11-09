---
paths:
  - "app/src/plugins/antares/**"
  - "app/src/plugins/edoobox/**"
  - "app/src/plugins/wordpress/**"
  - "app/src/renderer/stores/antaresStore*"
  - "app/src/renderer/stores/edoobox*"
  - "app/src/renderer/stores/wordpress*"
  - "app/src/renderer/components/Terminal/**"
  - "app/src/main/plugins/**"
  - "docs/antares-integration.md"
---

# Antares, edoobox, Terminal

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## Antares CS Integration (Medienzentren-Verleih, seit v0.6.45)
- Plugin `app/src/plugins/antares/` (`service.ts`, `main/index.ts`, `renderer/AntaresWidget.tsx`) + `renderer/stores/antaresStore.ts`.
- **Reverse-engineered gegen Antares CS 2.0.4** (h+h Software / antares.net) — das Verleihsystem vieler deutscher Medienzentren. Keine offizielle API; Cookie+PID-Session wie im Browser. Endpunkte können mit Antares-Upgrades brechen.
- **Credentials über `host.secrets`** des Plugins (safeStorage, je Plugin getrennt). Plugin-Aktionen: `antares.saveCredentials`, `antares.loadCredentials`, `antares.check` (Verbindungstest), dazu `antares.dashboardCounts`, `antares.listMahnungenGeraete`/`…Medien`, `antares.listEntleiher` u.a.
- **Read-only**: liest Entleiher, Verleihe, offene Anfragen, Mahnungen. **Kein Schreibzugriff** — Sicherheitsentscheidung.
- **Dashboard-Widget** in voller Breite: 3-Spalten-Layout aus dem Antares-Original (Nutzerverwaltung / Technikverleih / Medienverleih) mit Status-Kacheln + aufklappbare Mahnungs-Tabelle (Leihnr/Titel/Entleiher/Schule/Rückgabedatum).
- **Aktivierung**: Einstellungen → Module → „Antares Medienzentrum" toggle, dann Einstellungen → Agenten → Antares-Sektion: URL/Kontext/Credentials + Verbindungstest. Auto-Migrate ergänzt das Widget bei bestehenden Installationen.
- Dokumentation: `docs/antares-integration.md`.

## edoobox-Agent

- Akkreditierungsformulare (.docx) importieren → Veranstaltungsdaten automatisch parsen → an edoobox API senden
- Plugin `app/src/plugins/edoobox/` (`service.ts`, `formularParser.ts`, `attendanceListService.ts`, `iqReportService.ts`, `renderer/AgentPanel.tsx`, `renderer/agentStore.ts`); WordPress liegt im eigenen Plugin `app/src/plugins/wordpress/`.
- **formularParser.ts**: Extrahiert Titel, Termine, Referenten, Ort, Preis, Kontakt, Teilnehmer aus DOCX
- **service.ts** (edoobox): API-Client für edoobox (v1 Query-Params, v2 JWT), Webhook-Support (Zapier)
- **plugins/wordpress/service.ts**: WordPress REST API Client (Posts erstellen, Medien uploaden)
- **AgentPanel.tsx**: UI mit Tabs: Import | Dashboard | Marketing
- **agentStore.ts**: Zustand Store für Events, Dashboard-Offers, Bookings, Marketing
- Dashboard: Occupancy-Charts, Teilnehmerlisten, Neuanmeldungen
- Marketing-Tab: WP Publishing, Ollama Content-Generierung, Google Nano Banana Bilder
- Settings im **Agenten-Tab**: API Key/Secret über `host.secrets` des Plugins; alte `userData/edoobox-credentials.enc` migriert `migrateEdooboxCredentialsToPlugin` (`main/index.ts`) einmalig
- Plugin-Aktionen: `edoobox.saveCredentials` / `edoobox.loadCredentials`, `edoobox.importEvent`, `edoobox.parseFormular`, `edoobox.generateAttendanceList`, `edoobox.generateIqReport`, `edoobox.marketing*`

## Terminal (xterm.js + PTY)

- Integriertes Terminal via `node-pty` (Main) + `@xterm/xterm` (Renderer)
- Smart AI-Tool Detection via `checkCommandExists` — macOS/Linux: `opencode` (bevorzugt) → `claude`; **Windows: natives `claude` → natives `opencode` → WSL** (`wsl opencode` / `wsl claude`), da Claude Code nativ unter Windows läuft und opencode dort unzuverlässig ist
- WSL-Start des AI-Tools nutzt `wsl --cd "<vaultPath>"` — Tool startet direkt im Vault (via `/mnt/<drive>/…`), nicht im WSL-Home
- Shell unter Windows: `pwsh.exe` (PowerShell 7) bevorzugt, Fallback `powershell.exe` (5.1) — Detection gecacht in `resolveWindowsShell()`
- Terminal startet im Vault-Verzeichnis (vom Renderer übergebenes `cwd`, validiert via `existsSync`), Fallback Home
- Erweiterter PATH in `main/index.ts` (sowohl `terminal-create` als auch `check-command-exists`): enthält `/opt/homebrew/bin`, `~/.local/bin`, `~/.cargo/bin`, `~/.opencode/bin`, `~/.nvm/...`; Windows zusätzlich `%USERPROFILE%\.local\bin` (Claude-Code-Installer), `\.cargo\bin`, `\AppData\Roaming\npm`, `\scoop\shims`
- Bei neuen CLI-Tools: Pfad in **beiden** `additionalPaths`-Arrays in `main/index.ts` ergänzen
- **Terminal-Reset**: `handleRestart()` muss Mouse-Tracking-Modi deaktivieren (`\x1b[?1000l` etc.) und `term.reset()` aufrufen (nicht nur `clear()`), sonst werden Escape-Sequenzen als Klartext angezeigt nach Programmen wie opencode/claude
