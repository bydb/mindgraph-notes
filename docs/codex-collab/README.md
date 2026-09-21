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

## Herdr-Schleife (Bauender ↔ Prüfer)

Seit 20.09.2026 läuft die **Mechanik** dieser Schleife automatisch: Claude startet den Codex-Prüfer
selbst in einer Nachbar-Pane, wartet auf das Ergebnis und liest die Befunde zurück. Werkzeug ist
[Herdr](https://herdr.dev) (Open-Source-Multiplexer in Rust, lokal, kein Konto, keine Telemetrie).

**Rollen:** **Bauender** = Claude (schreibt Code, beantwortet Findings) · **Prüfer** = Codex
(prüft adversarial, ändert keinen Code). Die Rollen sind dieselben wie oben — Herdr ersetzt nur die
Kopierleitung zwischen beiden Fenstern, nicht das Protokoll.

**Automatisiert wird nur die Mechanik.** Die **Abnahme bleibt beim Nutzer** — ausdrücklicher Schritt,
keine Formsache. Zwei Modelle, die sich gegenseitig abnicken, sehen aus wie Sorgfalt und sind keine.

### Einmal einrichten

```bash
brew install herdr
herdr integration install claude    # Zustands-Hook, damit Herdr idle/working/done sicher erkennt
herdr integration install codex
herdr --skill > ~/.claude/skills/herdr/SKILL.md
```

Beim ersten Codex-Start fragt Codex einmal nach **Hook-Trust** für den Herdr-Zustands-Hook
(`~/.codex/herdr-agent-state.sh`, SessionStart). Das ist eine Vertrauensentscheidung des Nutzers.

### Jedes Mal

Claude muss **innerhalb** einer Herdr-Pane laufen (`HERDR_ENV=1`), sonst steuert er nichts:

```bash
herdr          # Session starten
# in einer Pane:
claude
# darin:
/pruefen <thema>
```

Der Ablauf steht in `.claude/commands/pruefen.md`. Kurzform der Mechanik:

```bash
scripts/pruefgrenze.sh vorher docs/codex-collab/<thema>.md   # Vorzustand festhalten
herdr pane split --current --direction right --cwd "$PWD" --no-focus
herdr agent start pruefer --kind codex --pane <pane-id> --timeout 120000 \
  -- --sandbox workspace-write --ask-for-approval never
herdr agent prompt pruefer "<auftrag mit pfad der aufgabendatei>" --wait --timeout 1800000
scripts/pruefgrenze.sh nachher docs/codex-collab/<thema>.md  # Grenze + Ergebnis prüfen
sed -n '/^## Codex-Findings/,/^## Claude-Antwort/p' docs/codex-collab/<thema>.md
```

**Warum die Findings in die Datei gehören:** Terminal-Scraping über `herdr agent read` verliert lange
Antworten (Alternate-Screen, Scrollback). Die Aufgabendatei ist ohnehin der Kanal — der Prüfer schreibt
dorthin, Claude liest sie mit `sed` von der Platte. **Nicht mit `git diff`:** im Erstlauf ist die
Aufgabendatei unversioniert, darauf gibt `git diff` stillschweigend null Zeilen aus — der Normalfall
sähe aus wie ein leerer Lauf.

**Warum `--ask-for-approval never`:** sonst hängt der Prüfer an einem Dialog und `agent prompt` antwortet
`agent_blocked`. **Warum `workspace-write`:** der Prüfer muss seine Findings in die Aufgabendatei schreiben
können.

**Warum `scripts/pruefgrenze.sh` und nicht `git status`:** Dass der Prüfer nur die Aufgabendatei anfasst,
ist Konvention — nachmessen muss man sie trotzdem. `git status` allein kann das nicht: es wird erst nach
dem Lauf erhoben, und auf demselben Branch liegen schon Änderungen, also beweist ein `M` nicht, wer es war.
Eine Datei, die vorher schon `M` war, kann der Prüfer weiter verändern, ohne dass sich die Statuszeile
rührt. Und `.claude/` ist ignoriert — dort könnte er den Ablauf selbst umschreiben, unsichtbar für git.
Das Skript nimmt deshalb vor dem Lauf Inhalts-Hashes (einschließlich der ignorierten Steuerpfade) und
vergleicht danach. Es hält keinen bösartigen Prüfer auf, der das Skript selbst verändert; es fängt Unfälle
und macht die Behauptung überprüfbar.

**Zwei Tore gehören dem Nutzer.** Nach dem Gegenprüfen der Befunde legt Claude vor und hält an — der Nutzer
entscheidet, was umgesetzt wird. Danach setzt Claude nur das Freigegebene um und legt erneut vor. Ein Halt
bei vierzehn Befunden, nicht vierzehn Rückfragen; aber eben ein Halt. Ohne dieses erste Tor liefe der
automatisierte Ablauf an der Regel weiter oben vorbei („Code entsteht erst nach Freigabe durch den User"),
und „die Abnahme bleibt beim Nutzer" wäre nur noch eine Aussage über den Commit.

## Aktive Aufgaben
| Datei | Wer | Aufgabe | Status |
|---|---|---|---|
| `rechner-steuerung-review.md` | **Codex** → Claude | Adversariales Review der Rechner-Steuerung des Notiz-Agenten (Programme über Skriptschnittstellen ansprechen) | ✅ Runde 1: F01–F07 bestätigt und von Claude abgearbeitet (sechs behoben, F02/F06 teilweise mit benanntem Restrisiko); ⏸ Runde 2 nicht gelaufen (Prüfer im Nutzungslimit); GUI-Gegenprobe und Nutzerabnahme offen |
| `vault-chat-plan-review.md` | **Claude** | Adversariales Review von `docs/vault-chat-plan.md` (quellenbelegter Chat über den ganzen Vault: Binär-Index, Nummern-Zitate, deterministische Belegprüfung) | Rev. 3 von Codex abschließend geprüft: F01–F22 auf Planebene adressiert, technische Startempfehlung Phase 1 erteilt; Nutzerfreigabe und spätere Implementierungsabnahme getrennt; Phase 4 als Ausblick akzeptiert |
| `renderer-host-adr-review.md` | **Codex** | Adversariales Review von `docs/plugin-renderer-host-plan.md` | ⏳ wartet auf Codex |
| `excalidraw-font-fix-review.md` | **Codex** | Adversariales Review des Excalidraw-Font-CSP-Build-Patches (Fragilität/Korrektheit/Export), self-contained | ✅ F01–F10 (2 Runden) von Claude adressiert + live re-verifiziert (7 Familien echte Metriken, fail-closed) → wartet auf Codex-Re-Check R2 |
| `modell-leistung-demo-review.md` | **Codex** → Claude | Eignung von „Modell-Leistung" als Effizienz-Demo; Entwurf Arbeitsbilanz inkl. Veranstaltungen | ✅ F01–F07 beantwortet; Paket 1 umgesetzt + GUI-geprüft; Paket 2 (Veranstaltungen, Nutzenbilanz) umgesetzt, F08–F11 nachgebessert, GUI-geprüft (CDP); Paket 3 (Nachtrag, Referenzquelle) umgesetzt und GUI-geprüft; F12–F16 behoben → alles uncommitted, wartet auf Sichtung |
| `email-client-funktionsreview.md` | **Codex** → Claude | Funktionsreview des E-Mail-Clients (Versand, Abruf, Entwürfe, Suche) | ✅ F01–F10 von Claude bestätigt; Paket 1 (Versandvertrauen) + Paket 2 (Entwürfe, Weiterleiten mit Anhängen, Abruffenster, Suche, Server-Abgleich, BCC, Gelesen/Ungelesen) + Paket 3 (Papierkorb, verschwundene Mails mit Grabstein) umgesetzt; Codex-Nachprüfung F11–F16 behoben (Store-Tests für Vault-Wechsel/Download-Übergänge), released als v0.11.7-beta → Mailserver-Gegenproben offen; F05 Stufe 3 abgelehnt |
