# Umsetzung: Einstufung, Aufklärung, vault_search, Index-Abgleich (Pakete 1–4)

## Aufgabe

Adversariale Prüfung der UMSETZUNG des beschlossenen Plans
(`docs/codex-collab/agent-vault-search-und-index-abgleich.md`, Abschnitt „Umsetzungsplan“, F01–F32).
Stand: HEAD `bfb9c032` plus uncommittete Änderungen (enthält auch Paket A der Auftragskarte und zwei
Linux-CI-Testreparaturen). Nutzerentscheidung steht: Transparenz statt Sperre, vault_search für alle.

Bitte prüfen: Trägt jedes Paket die zugehörigen Findings? Neue Löcher? Tests ausreichend?

## Kontext/Anker

**Paket 1 — Einstufung + Zustimmung**
- `app/src/shared/agentRoute.ts` (+ `.test.ts`) — `classifyRoute`, `NOTE_AGENT_CLOUD_CONSENT_VERSION`, `hasCloudConsent`
- `app/src/main/index.ts` — `classifyAgentRoute`, `checkNoteAgentCloudGate`, IPC `note-agent-route-preflight`
  (Suche: „Modellweg des Agenten“); im `note-agent-run`-Handler Einstufung + Gate direkt nach `chatOptions`
  (Suche: „Einstufung des Weges VOR jedem Vault-Inhalt“), `route` in `startRun` und Startantwort
- `app/src/main/noteAgent/runRegistry.ts` — `route`, `vaultSearch`; Ollama-Vordergrund nur bei `route.kind !== 'cloud'`
- `app/src/renderer/stores/uiStore.ts` — `noteAgentCloudConsentVersion` (persistiert → ui-settings.json)
- `app/src/renderer/stores/noteAgentStore.ts` — `run.route`, `startGate`
- `app/src/renderer/components/Settings/AgentCloudConsentCard.tsx`, `Settings.tsx` (Anker `ai-agent-cloud-consent`),
  `CloudProviderSection.tsx` (Label „Notiz-Agent (Aufträge mit Vault-Zugriff)“)

**Paket 2 — Aufklärung**
- `app/src/renderer/components/Agent/AgentView.tsx` — Preflight (`runPreflight`), Modell-Zeile mit Weg-Etikett,
  Cloud-Kurzzeile, Zustimmungs-/Opt-in-Box, Aufklapper „Welche Daten wohin gehen“; `canRun` mit `gateBlock`
- `app/src/renderer/utils/i18n/agentCard.ts` — `route*`, `cloudShort`, `unverifiedShort`, `flow*`, `consent*`
- Korrigiert: `app/src/renderer/utils/translations.ts` (`settings.cloud.imageGen.desc`, `settings.ai.imageGen.privacyHint`, DE+EN),
  `app/src/main/index.ts` Rechner-Dialog (Apple-Mail-Satz)

**Paket 3 — vault_search**
- `app/src/main/rag/vaultRagManager.ts` — `isQueryable`
- `app/src/main/index.ts` — `vaultSearch`-Closure mit `withOllamaActivity('vault-query')` (Suche: „Vault-Index als Suchwerkzeug“)
- `app/src/main/noteAgent/skills.ts` — Werkzeug `vault_search`; `noteAgent/vaultSearchFormat.ts` (+ `.test.ts`)
- `app/src/main/noteAgent/loop.ts` — Allowlist + Prompt-Zeilen
- `CLAUDE.md` Abschnitt Vault-Index (Retrieval-Beschreibung, neuer Absatz zum Agenten)

**Paket 4 — Abgleich**
- `app/src/shared/rag/reconcile.ts` (+ `.test.ts`) — `diffIndexAgainstVault`
- `app/src/main/rag/vaultRagManager.ts` — `scheduleReconcile`, `reconcile` (ohne Modell/Neuschreiben bei „unverändert“,
  Identitätsprüfung → `needs-rebuild`, Drosselung über `waitForOllamaIdle`), `lastReconcile` im Status
- `app/src/main/index.ts` — Aufruf nach `setVault` (Öffnen, 60 s), `engine.onSyncComplete` (20 s, nur bei Downloads)
- `app/src/main/sync/syncEngine.ts` — `onSyncComplete`
- `app/src/renderer/components/Settings/VaultIndexSection.tsx`, `shared/types.ts` — Anzeige „zuletzt abgeglichen“

Nachweis Claude: typecheck, build grün; Tests 2471 grün (bekannter Timeout-Wackler `shellExecution.test.ts`).
Messung/GUI folgt in der Dev-App gegen den echten Vault.

## Codex-Findings

## Claude-Antwort

### Codex-Lauf fehlgeschlagen (24.09.2026, 09:0x)
Codex hat das Nutzungslimit erreicht („try again at Sep 27th, 2026 12:54 PM“) und keine Findings geschrieben.
Die Grenzverletzung im Prüfskript stammt von Claudes eigener Änderung an `agentRoute.ts` während des Laufs.
**Codex-Prüfung der Umsetzung steht aus — ab 27.09. nachholen.**

### Selbstprüfung (Claude) anhand der Findings F01–F32 des Plans
Behoben während der Selbstprüfung:
- `t()` ersetzte `{param}` nur beim ersten Vorkommen → „geht an {provider}“ stand roh in der Karte. Jetzt alle Vorkommen.
- Ollama-Cloud-Label „Ollama (Cloud)“ → `ollama.com` (tatsächlicher Empfänger).
- Lauf-Kopfzeile (`AgentRunPanel`, auch Macher-Leiste) zeigte Ollama-Cloud als „lokal“ → nutzt `run.route`
  (lokal / Cloud (Label) / „Ausführungsort nicht geprüft“).
- Consent-Fehlermeldung nannte keinen Ort zum Zustimmen → nennt Agent-Tab und Einstellungen.
- Abgleich meldete bei gleichzeitig gestartetem Watcher-Lauf „Fehler“ → legt die Änderungen in dessen Warteschlange.
- Gate-Regel aus `index.ts` in `shared/agentRoute.ts` `evaluateCloudGate` verschoben und getestet
  (fehlender Opt-in, untergeschobenes Modell, fehlende Zustimmung, Ollama-Cloud).
- Schrittanzeige kannte `vault_search` nicht (nur Name ohne Suchbegriff) → `summarizeArgs` ergänzt.
Neue Tests: `agentRoute.test.ts` (12), `vaultSearchFormat.test.ts` (5), `reconcile.test.ts` (4),
`vaultRagManager.test.ts` +4 (unverändert ohne Lauf/Schreiben, geändert/neu/gelöscht → ein Lauf, Digest-Wechsel →
needs-rebuild ohne Lauf, ohne Index/Opt-in nichts).

### GUI-/Laufprüfung in der Dev-App (echter Vault, Computer-Use + CDP)
- Agent-Karte: lokales Modell → „Auf diesem Rechner über Ollama“ (geprüft); `qwen3.5:cloud` → „Cloud über ollama.com“,
  Kurzzeile, Zustimmungskasten, Startknopf „Cloud-Zustimmung fehlt“; Aufklapper „Welche Daten wohin gehen“.
- Main-Gate direkt per IPC (Oberfläche umgangen): Ollama-Cloud-Lauf ohne Zustimmung → abgelehnt, `code: consent`,
  Einstufung `cloud`. Zustimmung NICHT erteilt (bleibt Nutzerentscheidung, `noteAgentCloudConsentVersion = 0`).
- Echter Lauf `qwen3.8:27b-mlx`, Beispiel Wissensrecherche: `vault_search` angeboten und im ersten Schritt genutzt,
  danach 3× `note_read` (u.a. `370 – Schulungen/Datenschutz/…`), Antwort mit Zusammenfassung. Kein Ergebnis-File
  (Modell antwortete direkt), Vault unverändert.
- Abgleich beim Öffnen (Messung): 2995 Dateien, 11 MB gelesen, unverändert, 1,4–1,6 s, kein Modell, kein Schreiben.
- Einstellungen: Zustimmungskarte unter den Cloud-Anbietern; Vault-Index „Zuletzt abgeglichen um 09:04 …“;
  korrigierter Bild-Generierungs-Text.
Nachweis: typecheck, build grün; Tests 2480 grün (bekannter Timeout-Wackler `shellExecution.test.ts`).
Nicht geprüft: echter OpenRouter/LLMBase-Lauf (kein Schlüssel hinterlegt), LM Studio, Sync-Abgleich (braucht
Downloads), Windows.

## Status

Review angefragt 24.09.2026. Codex-Limit erreicht → Selbstprüfung + GUI-Prüfung durchgeführt; Codex-Review ab 27.09. nachholen.
