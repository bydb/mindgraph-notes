# AGENTS.md — MindGraph Notes (für Codex)

Hi Codex 👋 — du arbeitest hier mit **Claude (Anthropic)** zusammen an **MindGraph Notes**, einer
Electron + electron-vite + React 19 + TypeScript Notiz-App (Obsidian-ähnlich, mit Wissensgraph,
Flashcards, Email-Client, lokalem Brain, E2E-Sync). Dies ist deine Orientierungsdatei — das Pendant
zu Claudes `CLAUDE.md`.

## Zuerst lesen
- **`CLAUDE.md`** (Repo-Wurzel) = die **vollständige** Projekt-Doku (Tech-Stack, Architektur-Patterns,
  Sicherheits-Constraints, Plugin-System, Release-Prozess). **Bitte lesen** — sie ist die Single-Source
  für „wie dieses Projekt tickt". Diese Datei dupliziert sie bewusst nicht, sondern verweist.
- **`docs/codex-collab/README.md`** = das Zusammenarbeits-Protokoll zwischen dir und Claude
  (wie wir Aufgaben übergeben, Findings austauschen, Status markieren).
- **Aktive Aufgabe:** `docs/codex-collab/renderer-host-adr-review.md` — adversariales Review des ADR
  `docs/plugin-renderer-host-plan.md`.

## Befehle (immer aus `app/`)
```bash
cd app
npm run typecheck   # tsc --noEmit — schnellster Korrektheits-Check (deckt main + renderer + shared ab)
npm run test        # vitest run — Unit-Tests für pure shared/-Logik
npm run build       # electron-vite build — bündelt die 3 Prozesse getrennt, fängt Prozessgrenzen-Fehler
npm run dev         # Dev-Server (UI manuell verifizieren)
```
Nach Code-Änderungen: **typecheck + test**; bei prozessgrenzen-relevanten Änderungen zusätzlich **build**.

## Harte Leitplanken (Auszug — Details in `CLAUDE.md`)
- **Sprache:** Projekt, Doku und ADRs sind auf **Deutsch**. Kein Gendern in generierten Texten.
- **Sicherheit:** HTML/SVG immer über `app/src/renderer/utils/sanitize.ts`; Vault-Dateizugriff im Main nur
  über `assertSafePath` / `assertApprovedVault` / `writeFileSafe`; kein `dangerouslySetInnerHTML` ohne
  Sanitization; Mermaid `securityLevel:'strict'`, KaTeX `trust:false`.
- **Plugin-System:** Signatur = Herkunft/Integrität (Ed25519 + `integrity.json`), kein Sandboxing. Der
  **bundled** Renderer-Plugin-Pfad (`import.meta.glob`, In-Repo) bleibt unangetastet. Alle Plugin-ADRs
  liegen in `docs/plugin-*.md`.
- **Zustand-Selektoren** dürfen **kein** neues Array/Objekt zurückgeben (`.filter()/.map()`) → Render-Loop
  („Maximum update depth"). Stabile Referenz selektieren, im Render filtern. Autosave nur bei geändertem Inhalt.
- **Keine Commits/Pushes ohne ausdrückliche Aufforderung** des Users. Wir arbeiten auf **demselben Branch**;
  koordiniere ausschließlich über das Handoff-Doc, nicht durch stilles Überschreiben.

## Wenn Claude dich startet (Herdr)

Seit 20.09.2026 startet Claude dich für Prüfaufträge selbst — in einer Nachbar-Pane unter
[Herdr](https://herdr.dev), mit `--sandbox workspace-write --ask-for-approval never`. Du merkst davon
nichts außer: der Auftrag kommt als Prompt, nicht vom Menschen getippt. Es ändert **nichts** am Protokoll.

Was dabei von dir erwartet wird:

- **Schreib deine Findings in die genannte Aufgabendatei** unter `docs/codex-collab/`, Abschnitt
  „Codex-Findings" — nicht nur in den Chat. Claude liest die Datei von der Platte; lange Antworten
  gehen beim Auslesen des Terminals verloren.
- **Kein Code-Edit, kein Commit, kein Push.** Claude misst das nach: `scripts/pruefgrenze.sh` nimmt vor
  deinem Lauf Inhalts-Hashes des Arbeitsbaums (auch der von git ignorierten Pfade wie `.claude/`) und
  vergleicht danach. Außer der Aufgabendatei darf sich nichts geändert haben.
- Findings im Format aus `docs/codex-collab/README.md` (`### Fxx`, Schwere, `datei:zeile`, `[OFFEN]`),
  belegt gegen den **echten Code**.
- Adversarial prüfen. Bestätigung ist wertlos — gegenseitiges Abnicken sieht aus wie Sorgfalt und ist keine.
  Die Abnahme macht am Ende der Nutzer, nicht wir beide.

Einmalig fragt Codex beim Start nach **Hook-Trust** für `~/.codex/herdr-agent-state.sh` (SessionStart,
meldet deinen Zustand an Herdr). Claude fragt den Nutzer, bevor er das beantwortet.

## Aktueller Strang (Kontext)
Wir planen einen **quellenbelegten Chat über den ganzen Vault**: den bestehenden Projekt-RAG
(`app/src/main/rag/`, `shared/rag/`) auf alle Notizen ausweiten, Vektoren binär statt als JSON ablegen,
das Modell mit Nummern `[n]` zitieren lassen und jede Aussage deterministisch gegen die zitierte Stelle
prüfen (belegt / schwach / unbelegt / ungültig). Embedding und Antwort bleiben hart auf `localhost:11434`.
Dein Review (F01–F22) ist eingearbeitet (`docs/vault-chat-plan.md` Rev. 3). **Phase 1 ist umgesetzt** (`app/src/main/rag/`,
`shared/rag/vaultIndex.ts`, `Settings/VaultIndexSection.tsx`); Anker für deine Nachprüfung stehen in
`docs/codex-collab/vault-chat-plan-review.md` unter „Umsetzungsnotiz Phase 1“. Nichts committet.
