---
paths:
  - "app/src/main/telegram/**"
---

# Telegram-Agent (eingefroren)

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## Telegram-Agent (Tool-Use) — EXPERIMENTELL / eingefroren
- **Status**: als experimentell markiert (Badge + Hinweis in Settings → Telegram), default-aus, wird nicht aktiv weiterentwickelt. Sicherheitsfixes ja, neue Features nein — außer Nutzer wünschen es (siehe Memory).
- `main/telegram/agent/loop.ts` mit Iterations-Limit (Default 8, max 15).
- 7 Tools: `note_search`, `note_read`, `note_create`, `note_append`, `task_list`, `task_toggle`, `calendar_list`.
- **`isWrite: true` ist die harte Sicherheitsgrenze** — jedes Tool mit dieser Flag löst automatisch den Confirm-Flow aus, unabhängig von `agentConfirmTools`-Settings. **Fail-closed**: ohne `requestConfirm`-Callback wird ein bestätigungspflichtiges Tool abgelehnt, nie ausgeführt (getestet in `agent/loop.test.ts`).
- Confirm-Promise-Registry in `confirm.ts`, Auto-Deny nach 2 Min Timeout.
- **Pfad-Schutz**: alle pfadnehmenden Tools nutzen `resolveInVaultSafe()`/`ensureAbsInVaultSafe()` aus `agent/tools/vaultPaths.ts` — lexikalisch UND symlink-sicher (realpath auf den tiefsten existierenden Vorfahren). Symlinks im Vault, die nach außen zeigen, werden abgewiesen; vault-interne Symlinks bleiben erlaubt (Regressionstests in `vaultPaths.test.ts`).
- **Scheduler-Generationszähler** (`scheduler.ts`): jede Config-Änderung/stop() erhöht `generation`; in-flight Timer-Callbacks re-armieren sich nur bei unveränderter Generation und laden die Regel frisch per ID aus der Config — sonst würde eine während der Ausführung gelöschte/geänderte Regel wieder eingeplant bzw. der neue Timer überschrieben.
- `chatClient.chatWithTools()` mapped Ollama-Wire-Format (`role: tool`, `tool_calls.function`) auf interne `ToolCall`-Struktur. Tool-fähige Ollama-Modelle bevorzugt: `qwen3`, `qwen2.5-coder`, `llama3.1`, `mistral-nemo`. Gemma kann **kein** Tool-Calling.
- `safeReplyMarkdown` retried Plain-Text bei Markdown-Parse-Fehlern (Telegram lehnt unbalancierte `*`/`_`/`` ` `` ab).
