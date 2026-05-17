# Projekt-Status-Crystallizer

> **Status:** Feature-Spezifikation für v0.7.x
> **Zielgruppe dieses Dokuments:** Entscheider, Nutzer ohne KI-Hintergrund, Pitch-Vorbereitung

---

## Worum es geht — in einem Satz

Ein Sonntag-Werkzeug in MindGraph Notes, das aus deinen täglichen Notizen
für **jedes deiner laufenden Projekte automatisch eine Wochenstand-Übersicht
erstellt** — auf deinem Rechner, ohne dass irgendwer mitliest.

---

## Das Problem, das du wahrscheinlich kennst

Du hast mehrere Projekte gleichzeitig — Kundenaufträge, Veranstaltungen,
Reorganisationen, Lehraufträge, Bauvorhaben. Über die Woche notierst du
in MindGraph Notes:

- Was war im Meeting?
- Welche Mail ist gekommen?
- Was muss ich nicht vergessen?
- Was hat XY gesagt?

Sonntagabend willst du wissen: *Wo stehe ich eigentlich bei Projekt A,
Projekt B, Projekt C?* Und stellst fest: Du hast 40 Notizen, drei
Maileingänge und einen Stapel offener Aufgaben — aber keinen **Status**.

Das ist nicht dein Problem. Das ist die Architektur deiner Werkzeuge:
Sie sammeln, aber konsolidieren nicht. Niemand schreibt dir Sonntags
einen ehrlichen Wochenbericht. Bislang nicht.

---

## Was der Crystallizer für dich tut

**Du klickst auf einen Knopf. Pro Projekt entsteht eine Notiz, die dir
in 30 Sekunden zeigt:**

1. **Wie steht's?** — 🔴 Brennt / 🟡 Läuft, aber zäh / 🟢 Im Plan
2. **Was hat sich diese Woche getan?** — konkrete Aktionen, mit Verweis auf
   deine Original-Notizen
3. **Was hängt?** — Mails ohne Antwort, Entscheidungen ohne Schluss, Aufgaben
   ohne Termin
4. **Welche Daten kommen?** — Deadlines, Termine, in zeitlicher Reihenfolge
5. **Wer ist beteiligt?** — Personen, die in deinen Notizen vorkommen
6. **Was könnte schiefgehen?** — Risiken, soweit sie aus deinen Notizen ableitbar sind

Plus: **Hinweise zur Sauberkeit** deines Vaults — z. B. wenn drei Notizen
zum gleichen Projekt verstreut liegen und besser in einen Ordner sollten.

---

## Drei Szenarien, in deiner Welt

### 1. Maria, Geschäftsführerin (Mittelstand, 18 Mitarbeiter)

Maria führt parallel:
- den Relaunch der Firmenwebsite mit einer Agentur
- die ISO-9001-Vorbereitung
- eine Personalsuche für die Werkstattleitung
- Kundenprojekt „Müller-Lieferung Q3"

Sie schreibt jeden Tag 10–15 Minuten Notizen in MindGraph Notes — Meetings,
Telefonate, eigene Gedanken. Mailseingang läuft mit. Sonntagabend setzt
sie sich ihre Wochenplanung vor.

**Vor MindGraph Notes:** Sie öffnet 4–5 Ordner, scrollt durch Notizen,
versucht sich zu erinnern. Dauert 45 Minuten. Sie geht mit dem Gefühl ins
Bett, dass sie sicher etwas vergessen hat. Manchmal ruft Montag früh
jemand an, der seit 10 Tagen auf eine Antwort wartet.

**Mit Crystallizer:** Sie klickt einmal. Vier Status-Karten erscheinen.
Sie liest sie in 8 Minuten. Bei der ISO-Vorbereitung steht **„Offener
Faden: Audit-Termin Mitte Juni — bisher keine Bestätigung von Herrn Weber"**.
Sie schickt eine kurze Mail. Erledigt. Sie geht entspannt ins Bett.

### 2. Dr. Schmidt, Schulleiter

Vier parallele Vorhaben:
- Digitale Endgeräte-Beschaffung (Förderantrag läuft)
- Schulhof-Umgestaltung (Eltern-AG)
- Neueinstellungen (zwei Stellen offen)
- Schulinspektion in 8 Wochen

**Schmerz:** Er bekommt täglich Mails vom Schulträger, von Eltern,
vom Schulamt. Er notiert hastig. Er hat keine Zeit, alles am Ende der
Woche zu sortieren.

**Mit Crystallizer:** Der Status zur „Schulhof-Umgestaltung" zeigt ihm:
„Stakeholder: Frau Becker (Vorsitzende AG), Herr Demir (Architekt).
Wichtige Daten: Materialliste bis 23.05., Spielgerätebestellung bis 06.06.
Offener Faden: Kostenvoranschlag Sandlieferung steht aus."

In MindGraph Notes liegen 23 Notizen über 6 Wochen verteilt — der
Crystallizer hat sie zusammengefasst, ohne dass Dr. Schmidt sie alle
gelesen hat.

### 3. Anna, freiberufliche Beraterin

Sieben Kundenprojekte parallel, jedes verschieden.

**Mit Crystallizer:** Vor jedem Kundenmeeting öffnet sie die `_STATUS`-Notiz
des Kunden und ist in 60 Sekunden vorbereitet. Was haben wir letztes Mal
besprochen? Was haben wir vereinbart? Was steht noch aus? — Alles da,
aus ihren eigenen Mitschriften destilliert, nicht aus dem Gedächtnis
rekonstruiert.

Sie spart sich pro Kundenmeeting 15–20 Minuten Vorbereitungszeit. Bei
sieben Kunden á 1 Meeting pro Woche: **knapp 2 Stunden, wöchentlich**.

---

## Was der Crystallizer **nicht** tut (wichtig)

Damit du keine falschen Erwartungen aufbaust:

- **Er ersetzt dein Denken nicht.** Er destilliert, was du selbst geschrieben
  hast. Er erfindet keine Pläne, keine Strategien, keine Entscheidungen.
- **Er schreibt dir keine Mails.** Er schlägt dir vor, dass du eine schreiben
  solltest — aber tippen tust du sie.
- **Er ist nicht 100% richtig.** Wenn deine Notizen unscharf sind, ist der
  Status unscharf. Du siehst aber immer, **welche Quellnotizen er verwendet
  hat** — du kannst gegenprüfen.
- **Er sendet nichts ins Internet.** Wirklich nichts. Die Verarbeitung läuft
  auf deinem Rechner. Wenn du dein WLAN ausschaltest, funktioniert es weiter.
- **Er kostet keine monatliche Gebühr.** Open Source, einmal eingerichtet,
  läuft weiter.

---

## Warum Datenschutz hier ein echter Vorteil ist

Wenn Sie als Maria, Dr. Schmidt oder Anna versuchen würden, das Gleiche mit
Microsoft Copilot, ChatGPT oder Notion AI zu machen, müssten Sie Folgendes
hinnehmen:

- Mandantengespräche fließen in fremde Server
- Personalentscheidungs-Notizen werden zur Trainings-Grundlage
- Schul-Korrespondenz mit Eltern verlässt die Bildungs-Infrastruktur
- DSGVO-Pflichten werden komplexer, nicht einfacher

**Mit MindGraph Notes:** Die KI, die deinen Status schreibt, läuft auf
deinem Rechner. Sie heißt Ollama, ist Open Source, und niemand hat Zugriff.
Du brauchst keinen Auftragsverarbeitungsvertrag. Keine DSGVO-Erweiterung.
Keinen Datenschutz-Audit. Du musst niemandem erklären, wo deine Daten
liegen — sie liegen bei dir.

Das ist nicht „auch sicher" — das ist **strukturell anders**.

---

## Was du tun musst, damit es funktioniert

Drei Schritte. Einmalig pro Projekt.

### Schritt 1: Projekt markieren

In MindGraph Notes hast du einen Ordner pro Projekt. Du machst Rechtsklick
auf den Ordner → **„Als Status-Projekt markieren"**.

Ein kleines Fenster fragt:
- **Welche Begriffe identifizieren dieses Projekt?** (z. B. „Müller, Q3, Lieferung")
- **Wie wichtig ist das gerade?** (Hoch / Mittel / Niedrig)

Vorschläge kommen automatisch aus den Dateinamen in deinem Ordner.
Du kannst sie übernehmen oder anpassen.

→ Eine kleine Datei `_STATUS.md` entsteht in deinem Projektordner. Das war's.

### Schritt 2: Wochen-Status erzeugen

Im Dashboard erscheint ein neues Feld: **„Projekt-Status"**. Es listet
deine markierten Projekte mit Ampel-Anzeige (zuletzt erzeugt: vor 3 Tagen).

Du klickst **„Aktualisieren"**. Pro Projekt 30–60 Sekunden Wartezeit.
Dann steht in jedem Projektordner ein `_STATUS-W21.md` (für Kalenderwoche 21).

### Schritt 3: Lesen + entscheiden

Du öffnest die Notiz. Du liest. Du entscheidest:
- Brauchbar → mergen mit deiner kanonischen Status-Notiz, Entwurf löschen
- Teilweise brauchbar → die guten Teile übernehmen, Rest wegwerfen
- Nicht brauchbar → Keywords nachjustieren, neu erzeugen

Beim ersten Mal pro Projekt: 10 Minuten Setup + 5 Minuten Review.
Ab der zweiten Woche: nur noch 3–5 Minuten Review pro Projekt.

---

## Wie du erkennst, dass es für dich funktioniert

Nach 3 Sonntagen mit dem Crystallizer sollte gelten:

- ✅ Du fragst dich Sonntagabend nicht mehr „Was war diese Woche bei X?"
- ✅ Du gehst mit Klarheit in die neue Woche statt mit unspezifischem
  Unbehagen
- ✅ Vor wichtigen Meetings hast du in 2 Minuten den Stand parat
- ✅ Du übersiehst keine offenen Mails mehr, die seit Tagen auf Antwort
  warten

Wenn nach 3 Sonntagen nichts davon zutrifft, ist das System nicht falsch
eingestellt — sondern für dich vielleicht nicht das richtige Werkzeug.
Wir respektieren das.

---

## Wo der Crystallizer in MindGraph Notes lebt

Wenn du den Code anschaust:

- **Engine** (`app/src/main/projectStatus/`): liest deine Notizen,
  filtert nach Projekt-Keywords, fragt das lokale Sprachmodell, schreibt
  den Status zurück ins Vault.
- **Lint** (`app/src/main/projectStatus/wikilinkLint.ts`): prüft den
  Output gegen alle existierenden Notizen, markiert Halluzinationen.
- **UI** (`app/src/renderer/components/ProjectStatusPanel/`): das Widget
  im Dashboard, der Markierungs-Dialog, die Status-Anzeige.
- **Speicher** (`_STATUS.md` und `_STATUS-WXX.md`): Markdown-Dateien in
  deinen Projektordnern. Lesbar in jedem Editor — auch ohne MindGraph Notes.

Du behältst die Kontrolle. Wenn du MindGraph Notes morgen löschst, bleiben
deine Status-Notizen lesbar.

---

## Technische Eckdaten für die Pitch

- **Lokales Sprachmodell** via Ollama (z. B. `gemma4`, `qwen3.6`,
  `ministral-3:8b`). Standard-Empfehlung: gemma4 — schnell, mehrsprachig,
  kein Cloud-Account nötig.
- **Hardware-Anforderung:** macOS / Windows / Linux mit ≥16 GB RAM, M1/M2
  oder vergleichbar (heute Standard-Geschäfts-Notebook).
- **Datenfluss:** Notizen → Filter (lokal, keine KI) → Sprachmodell (lokal,
  via `http://localhost:11434`) → Markdown-Datei → Editor-Anzeige.
- **Audit-Trail:** jede Status-Notiz dokumentiert in ihrem Frontmatter,
  welches Modell sie erzeugt hat, welche Brain-Tage einbezogen wurden,
  und wann sie entstand.
- **Wikilink-Validierung:** alle Verweise (`[[Notiz X]]`) werden gegen
  den Vault-Index geprüft. Erfundene Verweise werden mit ⚠ markiert.
- **Fail-Safe:** wenn das Sprachmodell ausfällt, schlägt der Vorgang fehl
  mit klarer Fehlermeldung — es gibt **niemals** einen halluzinierten
  Cloud-Fallback.

---

## Zur Pitch-Story

Der Crystallizer ist **der konkrete Use Case**, der die abstrakte
Aussage „lokaler KI-Arbeitsplatz" greifbar macht. Ein
Mittelstand-Geschäftsführer versteht „Wochen-Status pro Projekt" sofort —
„Wissensgraph" und „LLM" muss man ihm dreimal erklären.

In der 60-Sekunden-Pitch:

> „Stellen Sie sich vor: Sonntagabend, ein Klick — und Sie sehen für
> jedes Ihrer fünf Projekte den aktuellen Stand. Wer ist dran, was
> hängt, welche Frist kommt. Aus Ihren eigenen Notizen destilliert,
> auf Ihrem Rechner, ohne dass jemand mitliest. Das ist MindGraph Notes."

Am Stand danach: die App öffnen, ein markiertes Projekt zeigen,
einen Klick, 30 Sekunden warten, fertigen Status zeigen. *Klarheit
durch eine Demo, die wirklich läuft.*

---

## Honest Limitations

Wir bauen das Feature für Menschen, die Zeit haben für 5 Minuten Review
pro Projekt pro Woche — nicht für vollautomatischen, blindgläubigen
Einsatz.

**Schwächen, die wir gemessen haben:**
- Bei sehr dünner Notizenlage (≤ 3 Notizen pro Woche) wird der Status
  generisch. Das ist Mathematik, nicht Modellschwäche.
- Bei Projekten mit sehr ähnlichen Begriffen (z. B. zwei Kunden namens
  „Müller") kann der Filter beide treffen. Du justierst die Keywords
  manuell nach.
- Kleinere Modelle (≤ 8B Parameter) neigen zu schmückenden Floskeln.
  Empfehlung: `gemma4:latest` (12B) oder größer für die Synthese.
- Sehr lange Notizen (> 30 KB) werden gekürzt, um in den Kontext des
  Modells zu passen.

Wir verstecken das nicht. Es steht in der Status-Notiz selbst, welche
Quellen verwendet wurden und welches Modell gearbeitet hat — du kannst
jederzeit gegenprüfen.

---

*Letzte Aktualisierung: 2026-05-17 — Erstentwurf für v0.7.x*
