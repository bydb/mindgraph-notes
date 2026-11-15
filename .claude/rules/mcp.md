---
paths:
  - "app/src/main/mcp/**"
  - "app/src/shared/mcp*"
  - "app/src/renderer/components/Settings/McpSection*"
  - "app/src/renderer/components/Agent/McpServerPicker*"
---

# Externe Werkzeuge (MCP) im Notiz-Agenten

> Plan mit drei Fassungen und zwei Planrunden: `docs/codex-collab/mcp-anbindung.md` (Fassung 3 gilt,
> dort auch Messberichte Abschnitt 0 und 3). Code-Prüfung F01–F22: `docs/codex-collab/mcp-abschnitt-1-4-review.md`.
> Abschnitt 5 (Microsoft-Anmeldung für MCP-Server) ist gebaut, aber nur mit nachgebauter MSAL getestet —
> nie gegen Microsoft oder Business Central.

## Grundsatz: wer garantiert was
- **MindGraph kann bei einem fremden Server nicht feststellen, ob ein Werkzeug nur liest.** „Nur lesen“ garantiert das Fremdsystem (bei Business Central die MCP-Konfiguration mit nur „Allow Read“). Die Oberfläche darf das nie als eigene Prüfung ausgeben. Der Lese-Hinweis des Servers (`readOnlyHint`) wird angezeigt, nie geglaubt.
- Was MindGraph erzwingt: welche Werkzeuge das Modell sieht (Freigabe je Werkzeug mit Prüfsumme), was ein Lauf mit Fremddaten zusätzlich darf (nichts: keine Shell, kein Web, keine Rechner-Steuerung, keine Bilderzeugung — auch in Folgeaufträgen), und was ein lokales Programm erreicht (Sandbox).

## Ablauf und Orte
- Reiner Kern, getestet: `shared/mcp.ts` (Namen `mcp__<server>__<werkzeug>`, Prüfsummen-Grundlage, `toolBlockedReason`, `capPageSizeArgs`, `mcpResultToText`, Herkunft `mergeForeignData`, Laufstart `mcpRunGate`).
- Main: `main/mcp/store.ts` (Ablage unter userData, nie im Vault/Sync; Geheimnisse verschlüsselt, an GENAU ein Origin gebunden; `put` ist eine Transaktion mit `expectedBindingHash`), `sandbox.ts` (eigenes Profil + Selbsttest + Startprobe), `httpFetch.ts` (eigener Netzweg), `client.ts` (offizielles SDK `@modelcontextprotocol/sdk`, exakt verankert), `agentTools.ts` (Werkzeugansicht je Lauf), `ipc.ts` (Einstellungen, alle Freigaben per Main-Dialog).
- Lauf: `index.ts` `note-agent-run` — `mcpRunGate` NACH Modellweg und `imageGen`, VOR `startRun`/`dropContinuation`; Verbindungen vor `startRun`; Fenster-Prüfung danach; Schließen im `finally`. Loop: `lookupTool` an allen drei Stellen, fremde Werkzeuge wie `LOCK_ONLY_TOOLS` (vorher sperren, nachher nur sichtbar kürzen, nie verwerfen).

## Was nicht wieder aufgeweicht werden darf
- **Kein Speichern und keine Werkzeugfreigabe ohne nativen Main-Dialog** (`dialog.showMessageBox`). Der Renderer schlägt nur vor; eine Freigabe trägt die Prüfsumme, die der Main selbst bei „Werkzeuge anzeigen“ gesehen hat.
- **Ein unbestätigtes Programm wird nie gestartet** — auch nicht zur Probe. Reihenfolge in `saveStdio`: reine Pfadprüfung → Dialog → Selbsttest + `--version` im echten Profil → speichern (Codex F09).
- **Nur absolute Programmpfade, keine Auflöser** (`npx`, `uvx`, Shells, `env` …). Prüfsummen von Programm, Skript und Sperrdatei; ändert sich eine, startet nichts bis zur Neufreigabe. Nach `brew upgrade node` ist das gewollt.
- **Sandbox-Profil**: eigenes, nicht `buildSandboxProfile` der Shell (deren Home-Ausnahmen `.nvm`/`.pyenv` sind für fremde Programme zu weit). **Alle bekannten Vaults (`approvedVaultRoots`) immer gesperrt**, egal was der Renderer schickt; freigegeben nur der Vault des Laufs bei `vaultRead`, darin liegende andere Vaults danach wieder gesperrt, `.mindgraph` immer zuletzt gesperrt. Die Reihenfolge ist Teil der Sicherheit (letzte Regel gewinnt). Programm in einem Vault → abgelehnt. Kommt ein Vault dazu, beendet `addApprovedRoot` alle laufenden und startenden MCP-Verbindungen (`revokeActiveMcpSessions`).
- **Netzweg**: keine Weiterleitungen (die Anmeldemarke ginge sonst an ein anderes Ziel), https nur bzw. http für ein per Dialog freigegebenes Origin im eigenen Netz, Byte-Grenze auf dem Strom, DNS-Pinning aus `webResearch/egress.ts`. Nicht `safeFetch` nehmen — der sammelt Antworten bis zum Ende, MCP antwortet als Strom.
- **Sitzungswechsel und Listenänderung** sperren den Server für den Rest des Laufs, auch die auslösende Antwort (Prüfung nach `callTool`).
- **Herkunft vor dem Aufruf setzen**, nicht danach: auch eine Fehlermeldung des Servers ist fremder Text. `foreignData` wird über alle Folgeaufträge vererbt.
- **Microsoft-Anmeldung** (`main/mcp/microsoftLogin.ts`): eigene Instanz, eigene Ablage `userData/mcp-auth/<serverId>.enc`, NIE die Mail-Anmeldung (`main/email/microsoftAuth.ts`) erweitern — sonst meldet „Mail zurücksetzen“ das ERP ab. Das Konto (Mandant + Objekt-ID) steht in `http.microsoft.account` und ist Teil der Bindung: ein anderes Konto = neue Werkzeugfreigaben. `getToken` gibt keine Marke für ein anderes Konto als das der Bindung. Mit Microsoft-Anmeldung gibt es keine eigene `Authorization`-Kopfzeile. `TenantId` (GUID) muss der Mandant der Anmeldung sein. Berechtigung `…/Financials.ReadWrite.All` ist abgeleitet, nicht gemessen. Abmelden erst NACH erfolgreichem Speichern, nie vor einem Dialog.
- **Business Central**: freigebbar nur das dokumentierte Lesemuster `List_<Set>_PAG|QRY<ID>` (vorläufig, am Testzugang messen), dynamische Werkzeuge (`bc_actions_*`, `bc_data_*`, `list_companies`) nie; `TenantId`, `EnvironmentName`, `Company`, `ConfigurationName` Pflicht; Nutzer bestätigt „Konfiguration nur lesend“.
- **Seitengrößen-Deckel** entscheidet nach dem WERT (rekursiv, Zahl-als-Text, `null`), nur für eindeutige Namen (`top`, `limit`, `pagesize` …). `count`, `first`, `size`, `max` bewusst nicht — oft Fachwerte oder Offsets.

## Dienste per Katalog und OAuth (Abschnitt 6, Fassung 2, seit 15.11.2026)
- Katalog `shared/mcpCatalog.ts` (fest in der App): Plaud, Notion, Linear, Atlassian (OAuth), Business Central (öffnet das Formular). Der Renderer schickt nur die Katalog-ID (`mcp-add-catalog`), der Main baut Adresse und Anmeldung aus der Vorlage und VERGLEICHT die Live-Metadaten nur — weichen sie ab, wird nicht verbunden („MindGraph aktualisieren“). `oauth` aus dem Renderer wird in `mcp-save-http` verworfen.
- **Regel „gleiches Origin“** (`shared/mcpOAuth.ts`, getestet): Issuer, Anmeldeseite, Markenausgabe, Registrierung auf genau dem Origin der MCP-Adresse, nur https, PKCE S256, öffentlicher Client. Asana/HubSpot/GitHub erfüllen das nicht (fremder Anmeldeserver oder keine DCR) und bleiben außen vor. Nicht auf den `authProvider` des SDK umstellen: dessen Erkennung folgt jedem Metadaten-Verweis.
- Ablauf `main/mcp/oauthLogin.ts`: DCR bei jeder Anmeldung (Rückruf `127.0.0.1:<freier Port>/callback`), ein AbortController für den ganzen Versuch, Rückruf mit falschem `state` → 400 ohne Abbruch, Marke erst per `commit` NACH erfolgreichem `store.put` aktiv. Jede neue Anmeldung setzt die Werkzeugfreigaben zurück (kein Konto-Merkmal im generischen OAuth); Erneuern per `refresh_token` behält sie und gibt nur eine Marke heraus, wenn die Anmeldung noch gilt.
- Personendaten (`personalData`, im Zweifel ja): Cloud-Lauf → eigener nativer Dialog je Server+Anbieter (`confirmMcpPersonalDataForRun`), auch für aus dem Vorauftrag geerbte Server; Lauf startet nur mit den Bindungen, die der Dialog sah (`expectedBindings`).
- Plaud hat einen Netz-Server (`https://mcp.plaud.ai/mcp`); das lokale Paket `@plaud-ai/mcp` (npx, Telemetrie an PostHog, Marke in `~/.plaud`) wird nicht gebraucht. Lokale Selbstinstallation (6.3) ist bewusst NICHT gebaut; Vorgaben dafür: F23–F28, F31; nie Electron als Node (`ELECTRON_RUN_AS_NODE`, F25).
- Auffindbarkeit: Suchindex-Eintrag `ai-mcp` (Plaud, Notion, Jira …), ModuleOffCard bei ausgeschaltetem Modul, Picker lädt nach `mindgraph:settingsClosed` neu.

## Gemessen (14.11.2026)
- Sandbox: Vault-Server (Node, 19 Werkzeuge) startet in 360–510 ms; `.mindgraph`, Home, Netz, Schreiben im Vault → EPERM.
- Werkzeugwahl: qwen3.5:4b und qwen3.8:27b-mlx 54/54 bei 5/10/17 Werkzeugen, ~110 Token je Werkzeug → `MCP_MAX_TOOLS_PER_RUN = 17`.
- Echter Loop mit erfundenem ERP und versteckter Anweisung: 10/10 bestanden, 0× befolgt; qwen3.5:4b übernimmt die Anweisung aber wörtlich als Tabellenspalte in die Notiz (3/5) — die Vorschau vor der Übernahme ist dort die Schutzstufe.
- **Notion echt (15.11.2026, Testprofil, qwen3.8:27b-mlx):** 77 Werkzeuge; 14 freigegebene belegten ~21 000 Token → Lauf voll vor Schritt 1 (Anlass für `MCP_MAX_TOOL_TOKENS_PER_RUN = 8000`, Tokenanzeige je Werkzeug, Notion-Empfehlungen). Mit nur `notion-search` + `notion-fetch` (~3 700): Start 40 %, 1 Suche + 5 Abrufe (je < 1 s, ~31 700 Zeichen), Notiz 389 Wörter, vom Nutzer als quellentreu bestätigt; Ende bei 69 % von 32 768. Seitdem bekommen MCP-Läufe `AGENT_NUM_CTX_WEB` (65 536) — nicht gemessen, ob das die Ergebnisse verbessert.
- Live-Harness: `MINDGRAPH_MCP_EVAL=1 EVAL_MODEL=… EVAL_REPS=… npx vitest run src/main/mcp/eval/mcpEval.live.test.ts`. Während einer Messreihe nichts unter `app/src` ändern.

## Offen
- Business Central am Testzugang (Berechtigung, echte Werkzeugnamen, Administratorzustimmung), signierte/notarisierte App (unsigniertes Paket geprüft: SDK aus `app.asar` + sandbox-exec gehen), Windows/Linux-Sandbox (dort nur ausdrücklich volle Rechte), Macher-Leiste ohne eigene Serverauswahl, Fragen N1–N4 aus dem Plan (Cloud-Zustimmung, Name).
- Abschnitt 6: echte Anmeldung bei Plaud/Notion/Linear/Atlassian mit Konto noch nicht durchgespielt (Registrierung und Anmeldeseite geprüft); Werkzeugnamen außer Plaud ungemessen, deshalb ohne Empfehlungen.
