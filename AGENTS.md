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

## Aktueller Strang (Kontext)
Wir bauen eine neue Kern-Fähigkeit: einen **signaturbasierten Renderer-Plugin-Host** — das Renderer-JS
eines extern installierten, signierten Plugins direkt in den Haupt-Renderer laden und als UI mounten.
Ziel: **Excalidraw** als Plugin im eigenen Repo/Katalog möglich machen. Die Richtung ist beschlossen
(**Option A**, Trust-per-Signatur wie VS Code/Obsidian). Das ADR steht in
`docs/plugin-renderer-host-plan.md` und wartet auf dein adversariales Review (siehe Aufgaben-Datei).
