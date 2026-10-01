---
name: PowerPoint nach Vorlage
description: Eine PowerPoint-Präsentation im eigenen Hausstil erstellen — aus einer Muster-Präsentation mit Logo, Kopf- und Fußzeile; der Agent liefert Gliederung, Folientexte und Sprechernotizen.
---

# PowerPoint nach Vorlage

## Meine Vorlage

- Vorlage: `Skills/praesentation-nach-vorlage/MindGraph-Hausstil.pptx`

Das ist die mitgelieferte Vorlage im MindGraph-Stil (Logo, Petrol, Arial). Für
deinen eigenen Hausstil ersetze den Pfad durch deine Muster-Präsentation
(vault-relativ, `.pptx` oder `.potx`).

Nennt der Auftrag eine andere Vorlage im Vault, gilt diese. Ist eine `.pptx` aus
dem Vault angehängt, nimm ihren vault-relativen Pfad aus der Anhang-Liste. Die
Werkzeuge lesen Vorlagen **nur aus dem Vault** — liegt die Vorlage außerhalb
(angehängte Datei von woanders), erzeuge keine Präsentation und bitte den Nutzer,
sie in den Vault zu legen. Ist hier nichts eingetragen und auch sonst keine
Vorlage genannt, erzeuge ebenfalls **keine** Präsentation, sondern sage in der
Abschlussnachricht, dass eine Vorlage fehlt und wo sie eingetragen wird.

## Was die Vorlage liefert und was du lieferst

Aus der Vorlage kommen **Master, Logo, Hintergründe, Schriften, Farben und
Fußzeile** — sie werden nicht verändert. Du lieferst nur die **Folien**: Layout,
Titel, Text, optional Bild und Sprechernotizen. Die Musterfolien der Vorlage
werden durch deine Folien ersetzt.

## Schritt 1: Vorlage ansehen

Rufe `inspect_pptx_template` mit dem Pfad der Vorlage auf. Du erfährst:

- welche **Layouts** es gibt (Name, Art, Platzhalter, ungefähre Zeilenzahl),
- welche **Felder** die Vorlage hat (z. B. `{{VERANSTALTUNG}}` in der Fußzeile),
- ob Gestaltung **nur auf Musterfolien** liegt und deshalb auf neuen Folien fehlt.

Nimm Layouts **beim Namen**, wie die Vorlage sie nennt (bei gleichnamigen
Layouts mit dem Zusatz `[Master n]`, den die Inspektion anzeigt). Die Art (`title`,
`content`, `two-content`, `section`, `picture`, `title-only`) hilft, das passende
Layout zu finden.

## Schritt 2: Gliederung

- Erste Folie: **Titelfolie** mit Titel und Untertitel (Anlass, Datum, Ort oder
  Zielgruppe — nur, was aus der Quelle hervorgeht).
- Bei mehr als etwa 8 Folien: eine **Agenda**-Folie nach dem Titel und
  **Abschnittsfolien** zwischen den Teilen.
- Am Ende eine Folie mit **Zusammenfassung oder nächsten Schritten** — hat die
  Vorlage ein Layout wie „Abschluss", nimm es dafür. Eine
  „Vielen Dank"-Folie nur, wenn der Auftrag sie verlangt.
- Faustregel: eine Folie pro 1–2 Minuten Vortrag. Ist keine Dauer genannt,
  10 bis 15 Folien.

## Schritt 2b: Abwechslung statt Aufzählung

Eine Präsentation, die nur aus Aufzählungen besteht, wirkt schlicht. Hat die
Vorlage Gestaltungs-Layouts (die Inspektion zeigt Plätze wie „Karte 1",
„Schritt 1", „Kennzahl 1" oder „Kernaussage"), nutze sie bewusst:

- **3 oder 4 gleichrangige Aspekte** (Gründe, Bereiche, Fragen) → „Drei Karten"
  bzw. „Vier Karten". Je Karte: `label` (1–2 Wörter), `title` (kurze Aussage),
  `text` (1–2 Sätze). Höchstens **eine** Karte mit `highlight: true` — die, auf
  die es ankommt.
- **Ablauf, Vorgehen, Reihenfolge** → „Drei Schritte" oder „Vier Schritte" —
  die Zahl der Einträge muss genau passen. Je Schritt `title` (Verb +
  Gegenstand: „Regeln klären") und `text`.
- **Zahlen, die die Quelle nennt** → „Kennzahlen". `title` ist die Zahl selbst
  („78 %", „1 von 5"), `label` die Gruppe, `text` was sie bedeutet.
  **Nur Zahlen aus der Quelle oder dem Auftrag — nie schätzen oder erfinden.**
  Gibt es keine belegten Zahlen, nimm dieses Layout nicht.
- **Die eine Botschaft einer Folie** → `takeaway` auf „Karten mit Kernaussage"
  oder „Text mit Kernaussage": ein kurzer, zugespitzter Satz. Sparsam, höchstens
  zwei- bis dreimal pro Präsentation.
- Faustregel: höchstens jede zweite Inhaltsfolie eine reine Aufzählung.

## Schritt 3: Folientexte

- **Eine Kernaussage pro Folie.** Der Titel sagt sie, möglichst als Aussage
  („Sprachmodelle erfinden Quellen"), nicht als Schlagwort („Probleme").
- **Höchstens etwa 6 Punkte** pro Folie, je Punkt eine Zeile, Stichworte statt
  ganzer Sätze. Was mehr Platz braucht, gehört in die Sprechernotizen oder auf
  eine zweite Folie.
- Aufzählung mit `- `, Unterpunkt mit zwei Leerzeichen davor, Nummerierung mit
  `1. `. Wichtiges **fett**, sparsam.
- **Dachzeile** (`kicker`), wenn das Layout eine hat: ein bis drei Wörter, die den
  Teil benennen („Ausgangslage", „Beispiel", „Vorschlag") — nicht den Titel
  wiederholen. Die Vorlage setzt sie in Großbuchstaben.
- Gegenüberstellungen (Vorteile/Nachteile, vorher/nachher) auf ein Layout mit
  zwei Inhalten: linke Spalte `body`, rechte `body2`, jede mit einer fetten
  ersten Zeile als Spaltenkopf (`**Vorteile**`).
- **Sprechernotizen** (`notes`) für jede Inhaltsfolie: zwei bis fünf Sätze, was
  der Vortragende dazu sagt — Beispiele, Zahlen, Überleitung zur nächsten Folie.
- Bilder: nur ein Bild, das in diesem Lauf erzeugt wurde (`generate_image`, falls
  verfügbar) oder als PNG/JPEG im Vault liegt. Dateiname in `image`, Layout mit
  Bildplatzhalter oder zwei Inhalten wählen. Keine Bilder erfinden oder
  verlinken.

## Schritt 4: Erzeugen

Rufe **genau einmal** `write_pptx` auf:

- `file_name`: kurz und sprechend, Endung `.pptx`
- `template`: der Pfad aus „Meine Vorlage" (oder aus Auftrag/Anhang)
- `slides`: alle Folien in Reihenfolge, jede mit `layout`, `title` und je nach
  Layout `kicker`, `subtitle`, `body`, `body2`, `items`, `takeaway`, `image`, `notes`
- `fields`: Werte für die Felder der Vorlage, soweit sie aus Quelle oder Auftrag
  hervorgehen. Ein Feld ohne Wert wird leer gelassen und gemeldet — **nie
  erfinden**.

Lehnt das Werkzeug ab (Folie zu voll, Layout unbekannt), **teile die Folie auf
oder kürze** und rufe es mit **allen** Folien erneut auf.

## Abschlussnachricht

Zwei bis vier Sätze: Folienzahl und Aufbau in einem Halbsatz, welche Vorlage
benutzt wurde, und was der Nutzer prüfen sollte — Hinweise des Werkzeugs
(verkleinerte Schrift, leere Felder, Gestaltung, die nur auf Musterfolien lag)
**immer** weitergeben.

## Regeln

- Nur Inhalte aus den Quellen und dem Auftrag. Keine erfundenen Zahlen, Zitate,
  Namen oder Links. Fehlt etwas, sag es in der Abschlussnachricht.
- Personenbezogene Daten (Namen von Schülern, Teilnehmerlisten, Adressen)
  gehören nicht auf Folien, die gezeigt werden.
- Kein Gendern mit Sonderzeichen; neutrale Formulierungen wählen.
- Keine Emojis in Titeln und Folientexten, außer die Quelle verwendet sie.
- Mit Webrecherche: erst suchen und lesen, dann **genau einmal** `write_pptx`.
  Die Folie „Quellen" mit allen gelesenen Seiten hängt die App selbst an —
  schreibe **keine** eigene Quellenfolie und keine URLs auf die Folien.
- Steht `write_pptx` in diesem Lauf nicht zur Verfügung, schreibe mit
  `write_note` eine Markdown-Gliederung (eine `##`-Überschrift pro Folie,
  darunter die Punkte und die Notizen als Zitat) und sage in der
  Abschlussnachricht ausdrücklich, dass deshalb keine PowerPoint-Datei entstand.
