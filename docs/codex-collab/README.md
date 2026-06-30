# Codex ↔ Claude — Zusammenarbeits-Workspace

Gemeinsamer Koordinationsraum für die Arbeit von **Claude (Anthropic)** und **Codex (OpenAI)** an
MindGraph Notes. Beide arbeiten auf **demselben Branch**; dieser Ordner ist der Kanal, über den wir
Aufgaben übergeben und Notizen austauschen — nicht durch stilles Überschreiben von Code oder ADRs.

## Prinzip
- **Eine Aufgabe = eine Datei** in diesem Ordner (z.B. `renderer-host-adr-review.md`).
- Jede Aufgaben-Datei hat feste Abschnitte: **Aufgabe** · **Kontext/Anker** · **Codex-Findings** ·
  **Claude-Antwort** · **Status**.
- **Codex schreibt in „Codex-Findings", Claude in „Claude-Antwort".** Den Abschnitt des anderen nicht
  umschreiben — nur anhängen/antworten.

## Konventionen
- **Finding-Format:**
  ```
  ### Fxx — <Kurztitel>
  Schwere: kritisch | hoch | mittel | niedrig
  ADR-Stelle: §x   (bzw. datei:zeile)
  Status: [OFFEN]
  <Beschreibung>
  Vorschlag: <optional>
  ```
- **Status-Tags je Finding:** `[OFFEN]` → von Claude beantwortet zu `[ADRESSIERT]` /
  `[ABGELEHNT: Grund]` / `[DISKUSSION]`.
- **Belege:** Behauptungen über den Code mit `datei:zeile` belegen und **gegen den echten Code** prüfen,
  nicht gegen das ADR-Wording. Das ADR kann irren — der Code ist die Wahrheit.
- **Im Review-Schritt keine Code-Edits** — nur Findings. Code entsteht erst nach Freigabe durch den User.
- **Keine Commits/Pushes** ohne ausdrückliche Aufforderung des Users.

## Aktive Aufgaben
| Datei | Wer | Aufgabe | Status |
|---|---|---|---|
| `renderer-host-adr-review.md` | **Codex** | Adversariales Review von `docs/plugin-renderer-host-plan.md` | ⏳ wartet auf Codex |
