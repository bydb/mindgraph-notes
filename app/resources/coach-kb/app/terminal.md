---
id: app-terminal
keywords: [terminal, konsole, shell, opencode, claude, claude-code, agent, agentic, ki-tool, ai-tool, vault, skripte, pty, bash, zsh, wsl]
---

# Terminal mit Agentic-Coding-Anbindung

Das eingebaute Terminal in MindGraph ist **nicht** nur eine generische
Shell — sein Zweck ist es, agentische KI-CLIs wie **opencode** oder
**Claude Code** direkt auf deinem Vault arbeiten zu lassen, ohne in
ein zweites Fenster zu wechseln.

## Was das Terminal automatisch tut

- Startet im **Vault-Root** als Working Directory — alle Pfade sind
  vault-relativ, KI-Tools sehen sofort deinen Notiz-Baum.
- Erweitert den PATH um typische Tool-Locations: `/opt/homebrew/bin`,
  `~/.local/bin`, `~/.cargo/bin`, `~/.opencode/bin`, `~/.nvm/…` —
  damit z.B. ein per `brew install opencode` installiertes Binary
  ohne PATH-Frickelei gefunden wird.
- Erkennt beim Öffnen automatisch, ob **opencode** (bevorzugt) oder
  **claude** (Fallback) installiert ist. Auf Windows wird zusätzlich
  WSL geprüft (`wsl which opencode` / `wsl which claude`).
- Zeigt einen **"Start AI Tool"-Button** in der Terminal-Toolbar.
  Klick → der erkannte Befehl wird direkt ins Terminal getippt und
  ausgeführt — z.B. `opencode\n`. Du landest sofort in der Tool-Session
  mit deinem Vault als Working Directory.

## Workflow: Agentic auf den Vault

1. **Tool installieren** (einmalig):
   - `opencode`: siehe https://opencode.ai
   - `claude` (Claude Code CLI): über die Anthropic-Doku
2. Terminal in MindGraph öffnen (Button in der Header-Leiste).
3. "Start AI Tool" klicken — `opencode` oder `claude` startet im Vault.
4. Mit dem Agent reden, z.B. "Refactor alle Tagesnotizen aus 2025 in
   den neuen Frontmatter-Stil".
5. Der Agent liest und schreibt deine Markdown-Dateien direkt.
   MindGraph erkennt die Änderungen via File-Watcher und lädt die
   Notizen neu.

## Konkrete Anwendungsbeispiele

### A. Alle 🔴-Notizen in eine Übersicht zusammenfassen
Klick "Start AI Tool" → in der opencode/claude-Session tippen:

> Geh durch alle Markdown-Dateien im Vault. Sammle alle Notizen mit
> `category: red` im Frontmatter oder 🔴 im Titel. Erstelle eine neue
> Notiz `200 - Übersichten/Offene Probleme.md` mit einer Bullet-Liste:
> Titel als Wikilink, eine Zeile aus dem Body, Datum der letzten
> Änderung.

Der Agent grept, liest, schreibt — du bekommst eine fertige
Übersichts-Notiz, ohne selbst zu skripten.

### B. Bulk-Frontmatter-Migration
> In allen Notizen unter `300 - Schule/` ersetze das alte Feld
> `priority:` durch `prio:` (Werte 1:1 übernehmen). Lass die übrigen
> Felder unverändert.

### C. Tote Wikilinks finden
Ohne Agent, mit Standard-CLI:
```bash
rg -l '\[\[([^]]+)\]\]' . | while read f; do
  rg -o '\[\[([^]]+)\]\]' -r '$1' "$f" | sort -u
done | sort -u | while read link; do
  [ ! -f "$link.md" ] && echo "MISSING: $link"
done
```
Oder mit Agent: "Finde alle Wikilinks im Vault, die auf nicht-
existierende Notizen zeigen, und liste sie nach Häufigkeit."

### D. Vault unter Git stellen
```bash
git init
echo ".mindgraph/" > .gitignore
echo ".obsidian/" >> .gitignore
git add .
git commit -m "Initial vault"
```
Danach: vor größeren Bulk-Operationen (z.B. agentische Refactors)
immer commiten — Rollback per `git reset --hard HEAD` falls der
Agent danebenliegt.

### E. Wöchentliches Backup-Skript
```bash
#!/bin/zsh
DATE=$(date +%Y-%m-%d)
tar -czf ~/Backups/vault-$DATE.tar.gz \
  --exclude='.mindgraph/backups' \
  --exclude='.mindgraph/embeddings-*.json' \
  -C "$(pwd)/.." "$(basename $(pwd))"
echo "Backup: vault-$DATE.tar.gz"
```
Speichern als `vault-backup.sh`, ausführbar machen mit
`chmod +x vault-backup.sh`, dann z.B. Sonntags abends laufen lassen.

### F. Skills mit opencode / Claude Code
Beide Tools unterstützen "Skills" — wiederverwendbare Anweisungen für
wiederkehrende Aufgaben. Beispiel-Skills, die sich für MindGraph-Vaults
lohnen:
- "Wochenrückblick erzeugen aus Daily-Notes der letzten 7 Tage"
- "Lose Notizen aus `Inbox/` thematisch sortieren und in
  Themen-Ordner verschieben"
- "Aus einer langen Meeting-Notiz Aufgaben extrahieren und in
  `300 - Aufgaben/<Projekt>.md` anhängen"

Skills definierst du im jeweiligen Tool (Doku dort), MindGraph bekommt
davon nichts mit — das Terminal ist nur der Einstiegspunkt.

## Manuell statt Button

Du kannst alles auch von Hand: `cd` ist nicht nötig (du bist schon
im Vault), einfach `opencode` oder `claude` tippen. Genauso jedes
andere CLI — `git`, `rg`, `fzf`, `gh`, eigene Skripte.

## Robustheit

- **Reset nach Tool-Beendigung**: wenn ein TUI-Tool (opencode, claude,
  vim, etc.) das Mouse-Tracking nicht sauber abschaltet, würden danach
  Escape-Sequenzen als Klartext erscheinen. Der "Restart"-Knopf im
  Terminal deaktiviert Mouse-Tracking explizit (`\x1b[?1000l`) und
  resettet die Session sauber.
- **WSL-Integration auf Windows**: nutzt automatisch `wsl opencode`
  bzw. `wsl claude`, wenn die Tools nur in WSL und nicht in Windows
  installiert sind.

## Wann was passt

- **opencode**: Open-Source, modellagnostisch (Anthropic, OpenAI,
  Ollama, …). Mehr Kontrolle über das Backend.
- **claude** (Claude Code CLI): tight an Claude-Modelle gebunden,
  exzellente Tool-Use-Qualität. Brauchst einen Anthropic-Account.

Beide sind agentisch — können Dateien lesen, schreiben, Befehle
ausführen. Skills, Sub-Agenten und MCP-Server sind im jeweiligen
Tool konfigurierbar.

## Wofür das Terminal **kein** Ersatz ist

Für tägliche Notiz-Arbeit (Wikilinks setzen, Tasks abhaken, Smart
Connections nutzen) bist du im Editor besser aufgehoben. Das Terminal
ist für **strukturelle Eingriffe** (Bulk-Refactors, Cross-File-Suche
und -Edit, automatisierte Workflows) gedacht — also genau dort, wo
ein agentisches CLI seine Stärken ausspielt.
