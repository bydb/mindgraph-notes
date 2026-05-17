# Crystallizer — Test-Befunde & offene Aufgaben

> Stand: 2026-05-17, nach erster Test-Runde mit Projekt `134 - AIS chat change`.
> Geordnet nach Priorität — alles unter „A" hätte vor dem 29.05.-Pitch echten
> Demo-Mehrwert, alles unter „B" und „C" ist Backlog.

---

## ✅ Bereits behoben während des Tests

| Befund | Status | Wo behoben |
|---|---|---|
| `[[Brain-Tag 2026-05-13]]` statt `[[2026-05-13]]` | Behoben | Prompt-Anti-Beispiel + Brain-Heading als `[[…]]` formatiert |
| Stakeholder Anna/Marcus/Daniela fälschlich AIS.chat zugeordnet | Mitigated | Prompt: „NUR wenn Beteiligung am AKTUELLEN Projekt klar — sonst weglassen" |
| Keine Möglichkeit, Halluzinationen zu entfernen | Behoben | „🛠 Prüfen"-Modal mit 🗑-Knopf pro Finding |
| Widget-Layout überlagert sich bei schmaler Spalte | Behoben | Spalten-Layout (Name oben, Meta mittig, Buttons unten, wrapping) |
| Excel-Tabellen ignoriert | Behoben | `parseExcel()` aus `office/officeService.ts` integriert |
| `projectStatusCleanup is not a function` | Behoben | Preload neu geladen nach Dev-Restart |
| Widget nicht im Settings-Picker | Behoben | `'project-status'` in `Settings.tsx` widgetLabels/IDs ergänzt |

---

## 🅰 Priorität A — vor 29.05. wenn Zeit ist

### A1 · PDF-OCR-Trigger im Crystallizer-Flow automatisieren
**Wichtige Klarstellung**: Vision OCR (Ollama) gibt es schon, und die PDF-Companion-Logik (`ensure-pdf-companion` IPC-Handler) erzeugt automatisch ein `<datei>.pdf.md` mit Stub-Inhalt (Frontmatter + Bild-Embed + leerer Notizen-Sektion). Wenn der Nutzer manuell OCR ausführt und den Text in die Companion schreibt, **liest der Crystallizer den Inhalt heute schon** — `<datei>.pdf.md` ist eine normale `.md`-Datei in `gatherProjectFiles`.

**Was wirklich fehlt**: das manuelle Hin-und-Her. Aktuell muss der Nutzer pro PDF:
1. PDF öffnen
2. Vision OCR seitenweise laufen lassen
3. Texte zusammenkopieren
4. In die Companion-`.pdf.md` einfügen
5. Crystallizer erneut auslösen

**A1 als reine Automatisierung**: eine „🧠 OCR ausstehender PDFs in diesem Projekt" Aktion, die alle `.pdf` ohne substantielle Companion findet, automatisch durch Vision-OCR jagt und die Ergebnisse in die Companion-Datei schreibt. Danach Crystallizer-Lauf sieht die Inhalte automatisch.

**Wo**:
- IPC: existiert (`vision-ocr-extract-page`, page-by-page); neuer Wrapper `vision-ocr-extract-document` mit PDF-zu-Bilder-Konvertierung + Batch-OCR + Companion-Write
- Alternativ: existierende **Docling**-Integration nutzen (Docker), die fertigen Markdown liefert
- UI: in der Projekt-Zeile ein zusätzlicher Knopf **„📄 PDFs vorbereiten (3)"**, der dann eine kleine Progress-Bar zeigt

**Aufwand realistisch**: 4–6 h (PDF → Bilder rendern ist nicht trivial, Vision-OCR ist langsam, Companion-Schreib-Flow muss sauber sein).

**Demo-Impact**: hoch — du klickst einmal „PDFs vorbereiten", dann „Wochenstand erzeugen", und der Status zitiert plötzlich „laut Styleguide S. 26 ist die korrekte Schreibweise…".

**Was du SOFORT ohne Code-Änderung tun kannst** (für eine Demo-Probe vor dem 29.05.):
1. Im Vault auf jedes der 3 PDFs in `134 - AIS chat change/` einmal klicken → „Vision OCR" laufen lassen → Text in die `.pdf.md` einfügen
2. Crystallizer erneut starten — der Status ist dann reicher

Wenn das Ergebnis dir gefällt, ist A1 berechtigt zu bauen. Wenn schon der Output mit Excel reicht, kannst du A1 fallen lassen.

### A2 · „Alle ⚠ entfernen"-Bulk-Aktion im Prüfen-Modal
**Warum**: Aktuell pro Finding ein Klick. Bei 4–5 Halluzinationen wird's tippy.
**Wie**: Modal-Button **„Alle als gelöscht markieren"** → schickt alle ⚠-Refs auf einmal an `projectStatusCleanup`.
**Aufwand**: 20 min.
**Demo-Impact**: mittel — macht die Demo flüssiger („eine Klick und alles weg").

### A3 · Keyword-Editor pro Projekt (ohne YAML-Frickelei)
**Warum**: Wenn der Status zu wenig oder zu viel matcht, muss man aktuell `_STATUS.md` manuell editieren. Für Nicht-KI-Experten zu technisch.
**Wie**: In jeder Projekt-Zeile ein **⚙-Knopf** → Dialog mit aktuellen Keywords, Priority, „Speichern" → schreibt `_STATUS.md` mit der bestehenden `markProject`-Funktion neu.
**Aufwand**: 1 h.
**Demo-Impact**: mittel — entspannt die Demo, weil schnell justierbar.

### A4 · Mehrere Drafts pro Woche aufräumen
**Warum**: Bei Testen entstehen `_STATUS-2026-W20 (2).md`, `(3).md`, `(4).md` etc. Niemand will sieben Drafts vom selben Tag im Vault.
**Wie**: In Projekt-Zeile **Badge „4 Entwürfe"** → Klick → Dialog mit Liste aller `_STATUS-WXX*.md`, pro Eintrag Datum + 🗑-Knopf. Alternativ: Auto-Cleanup, bei dem alte Drafts der gleichen Woche automatisch zu `_STATUS-WXX.archive.md` umbenannt werden.
**Aufwand**: 1 h.
**Demo-Impact**: niedrig (Demo läuft auch ohne), aber für die Test-Phase wichtig.

---

## 🅱 Priorität B — Nach der Pitch

### B1 · DOCX/PPTX-Support (analog Excel)
**Warum**: Manche Projekte haben Word-Pflichtenhefte oder PowerPoint-Folien. Genau der gleiche Pfad wie Excel, nur andere Parser (existieren schon in `officeService.ts` als `parseDocx`, `parsePptx`).
**Wie**: Erweiterung von `gatherProjectFiles` um `.docx` (→ `parseDocx` → `markdown` Feld) und `.pptx` (→ `parsePptx` → Slide-Text + Notes joinen).
**Aufwand**: 30 min.

### B2 · Status-Wochenverlauf (Diff W20 → W21)
**Warum**: Die Karpathy-Wette ist „Wissen kompoundiert über Wochen". Aktuell ist jeder Status isoliert. Ein Wochen-zu-Wochen-Diff zeigt: *„Was hat sich seit W20 geändert?"*
**Wie**: Neuer Status liest den vorherigen `_STATUS-W(NN-1).md` ein, übergibt ihn dem LLM als Kontext „so war es letzte Woche", LLM markiert **NEU**/**weiter offen**/**erledigt** pro Bulletpoint.
**Aufwand**: 2 h (Prompt-Engineering + UI-Spalte).

### B3 · Automatischer Sonntag-Lauf
**Warum**: Man soll's nicht vergessen. Cron-artiger Trigger.
**Wie**: Existierende `reminderStore`-Architektur nutzen oder einfacher: Settings → „Sonntag 09:00 Wochenstand automatisch erzeugen" + macOS-Notification.
**Aufwand**: 1–2 h.

### B4 · „Bearbeiten"-Aktion für die kanonische `_STATUS.md`
**Warum**: Aktuell ist `_STATUS.md` nur Marker. Der „echte Status" sollte vom Nutzer aus dem Draft gemergt werden. Ein „Aus Draft übernehmen"-Knopf, der den Body des `_STATUS-WW.md` (ohne Hinweis-Sektion) in `_STATUS.md` schreibt.
**Aufwand**: 30 min.

### B5 · Brain-Lookback konfigurierbar
**Warum**: 7 Tage feste Window. Manche Projekte arbeiten in 14-Tage-Sprints, andere täglich.
**Wie**: Pro `_STATUS.md` ein zusätzliches Frontmatter-Feld `brain_lookback_days: 14`.
**Aufwand**: 20 min.

---

## 🅲 Priorität C — Backlog / Nice-to-have

### C1 · Inline-Lint-Marker (⚠ direkt am Wikilink)
Statt nur in der Sektion am Ende. Verlangt sorgfältige Markdown-Substitution.

### C2 · Modell-A/B-Test im Widget
„Erzeuge mit gemma4 und qwen3.6 parallel — zeig mir beide und ich wähle".

### C3 · Stale-Projekte als Sektion oben anzeigen
Aktuell nur durch gelben Hintergrund markiert. Eine Sektion „⚠ Diese Projekte haben seit 14+ Tagen kein Signal — pausieren oder befeuern?" wäre prominent.

### C4 · Custom-Sektionen pro Projekt
Per `_STATUS.md`-Frontmatter `sections: [stand, diese_woche, offene, risiken]` — Nutzer entscheidet, welche Sektionen das LLM produziert.

### C5 · Quellen-Provenance pro Aussage
Aktuell stehen Wikilinks am Ende einer Aussage. Eine erweiterte Variante zeigt **mehrere** Backlinks: „[Brain 13.05, Inbox-Note Foo, Projektdatei Bar]".

### C6 · Excel-Sheet-Auswahl statt „alle Sheets"
Bei größeren Excels nur das „Status"-Sheet einbinden, nicht alle. Per Frontmatter konfigurierbar.

### C7 · Persistenz der `lastResults` über App-Neustart
Aktuell verlierst du den Prüfen-Dialog, wenn du die App schließt. `_STATUS-WW.md` ist persistent, aber die Findings-Liste regeneriert sich erst beim nächsten Lauf.

### C8 · Settings-Tab „Projekt-Status"
Aktuell ist das Feature im Dashboard. Ein eigener Settings-Tab mit Modell-Override, Standard-Lookback, Standard-Projekte-Ordner, etc.

### C9 · Lint: Erkennen von wiederkehrenden Halluzinationen pro Projekt
Wenn `[[Brain-Tag 2026-05-13]]` immer wieder erscheint, sollte das System lernen und es als „in diesem Projekt häufiges Modell-Artefakt" markieren.

### C10 · Internationalisierung: vollständige Übersetzung
Aktuell sind viele Strings nur Inline-DE/EN-Switch. Vollumfänglich nach `translations.ts` ziehen.

---

## 🐛 Beobachtete Verhaltens-Eigenheiten (nicht zwingend Bugs)

- **gemma4:latest** schreibt manchmal Floskeln wie „im Plan" oder „läuft" trotz Prompt-Verbot. Größere Modelle (qwen3.6, gemma4:31b) sind disziplinierter — auf M2 32GB aber zäh.
- Wenn ein Brain-Tag *einen* Keyword-Treffer hat, wird der **komplette** Tagesinhalt ans LLM gegeben — auch wenn der Treffer nur eine Mail-Bemerkung war. Das produziert die „Stakeholder-Bug"-Klasse. Mögliches Refinement: Brain-Inhalt um den Keyword-Treffer herum **lokal kürzen** (3 Zeilen Kontext statt ganzer Tag).
- Excel-Tabellen werden als Markdown-Tabelle übergeben. Wenn die Tabelle sehr breit ist (viele Spalten), könnte das Modell Spalten-Bezüge falsch interpretieren. Bei deinem Rebranding-Checklist-Format okay.

---

## Wenn ich eine Sache zuerst angehen würde

**A1 — PDF via Vision-OCR**. Konkrete Begründung:

In deinem Test hast du gesagt: *„in der Excel habe ich dokumentiert, dass ich die Edumaps, Moodle und Folien angepasst habe."* Das fühlt sich gut an, jetzt ist es drin. **Aber dieselbe Logik gilt für die drei PDFs** — Styleguide, Handreichung, Pressemitteilung enthalten die normativen Regeln (Schreibweise, URL, Marken-Disclaimer). Mit OCR drin sagt der Status nicht nur „du hast Folien gemacht", sondern auch *„entspricht den Schreibweise-Vorgaben aus Styleguide S. 26"*.

Das ist die Sorte Sätze, die einen Mittelstand-Geschäftsführer am Stand sagen lässt: *„Moment, das weiß meine Software über meine Projekte? Wie?"*
