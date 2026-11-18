---
name: Vier-Felder-Matrix
description: Inhalte in vier Felder ordnen — SWOT, Eisenhower (wichtig/dringend), Aufwand und Nutzen, Vor- und Nachteile — als Excalidraw-Zeichnung zum Weiterarbeiten. Jeder Eintrag ist eine eigene Karte, die man zwischen den Feldern verschieben kann.
---

# Vier-Felder-Matrix erstellen

## Was entsteht

Eine Excalidraw-Zeichnung (`.excalidraw`) mit vier gleich großen Feldern. Jeder
Eintrag steht auf einer eigenen Karte, die sich in Excalidraw verschieben,
ändern und ergänzen lässt. Die Feldflächen und Achsen sind gesperrt, damit man
sie beim Ziehen der Karten nicht versehentlich mitnimmt. Layout, Schrift und
Farben setzt die App — du lieferst nur Felder und Einträge.

Erzeugt wird die Datei **ausschließlich** mit dem Werkzeug `write_excalidraw`
und `diagram: "matrix"`. Schreibe nie selbst JSON und nie eine
`.excalidraw`-Datei mit `write_note`.

## Wann anwenden

- **SWOT**: Stärken, Schwächen, Chancen, Risiken eines Vorhabens.
- **Eisenhower**: Aufgaben nach Wichtigkeit und Dringlichkeit.
- **Aufwand und Nutzen**: Ideen oder Maßnahmen priorisieren.
- **Vor- und Nachteile** zweier Möglichkeiten (vier Felder: A dafür, A dagegen,
  B dafür, B dagegen).
- Jede andere Einordnung, die sich sauber in zwei mal zwei Felder teilt.

Nicht für Listen ohne zwei klare Unterscheidungen — dafür eine Notiz.

## Schritt 1: Inhalt beschaffen

- Geht es um eine Notiz, ein Protokoll oder einen Anhang, lies zuerst die
  Quelle. Die Matrix ordnet, was dort steht — sie erfindet keine Punkte dazu.
- Kommen die Punkte aus dem Auftrag selbst, arbeite damit. Ist ein Feld nach
  der Quelle leer, bleibt es leer: Ein leeres Feld ist eine Aussage und lädt
  zum Ergänzen ein.

## Schritt 2: Felder festlegen

Die Felder kommen in **fester Reihenfolge**: oben links, oben rechts, unten
links, unten rechts.

- **SWOT**: Stärken, Schwächen, Chancen, Risiken — ohne Achsen. Stärken
  `kind: "solution"`, Schwächen `kind: "problem"`, die anderen ohne `kind`.
- **Eisenhower**: Achsen `x_axis` (label „Dringlichkeit“, low „nicht
  dringend“, high „dringend“) und `y_axis` (label „Wichtigkeit“, low
  „unwichtig“, high „wichtig“). Dann ist oben rechts wichtig und dringend
  („Sofort erledigen“), oben links wichtig, nicht dringend („Planen“), unten
  rechts dringend, nicht wichtig („Abgeben“), unten links („Weglassen“).
- **Aufwand und Nutzen**: `x_axis` Aufwand (low „gering“, high „hoch“),
  `y_axis` Nutzen (low „gering“, high „hoch“). Oben links ist dann „Schnelle
  Gewinne“, oben rechts „Große Vorhaben“, unten links „Kleinkram“, unten rechts
  „Zeitfresser“.
- Achsen nur, wenn die Felder wirklich an zwei Achsen hängen. `low` steht
  links bzw. unten, `high` rechts bzw. oben — prüfe, dass die Feldtitel dazu
  passen.

## Schritt 3: Einträge formulieren

- Höchstens 6 Einträge je Feld, Stichworte statt Sätze, höchstens 80 Zeichen.
- Nur lateinische Schrift: Umlaute, ß, Ziffern und übliche Satzzeichen gehen.
  Keine Emojis, keine Pfeile, kein Markdown. Die App lehnt solche Zeichen ab
  und nennt sie.
- Keine Doppelungen in einem Feld. Steht etwas in zwei Feldern, entscheide dich.
- `kind` am Feld nur, wenn die Farbe etwas bedeutet (siehe SWOT) — nicht vier
  verschiedene Farben aus Dekoration.

## Schritt 4: Erzeugen

Rufe `write_excalidraw` auf mit `file_name` (sprechend, Endung `.excalidraw`),
`diagram: "matrix"`, optional `title` (Überschrift), `quadrants` und optional
`x_axis`/`y_axis`. `style: "skizze"` nur, wenn der Auftrag nach Brainstorming
oder Skizze klingt. Lehnt die App ab, steht im Fehler, was zu ändern ist:
korrigiere genau das und rufe das Werkzeug erneut mit der **vollständigen**
Matrix auf.

Schreibe **keine** Begleitnotiz mit Einbettung. Die Zeile zum Einbetten zeigt
die Ergebniskarte nach dem Übernehmen.

## Abschlussnachricht

Kurz: welche Art Matrix, wie viele Einträge je Feld, was du bewusst weggelassen
oder keinem Feld zugeordnet hast. Hinweis: Die Karten lassen sich in Excalidraw
zwischen den Feldern verschieben.

## Beispiel (nur die Form)

```json
{
  "file_name": "Aufgaben Eisenhower.excalidraw",
  "diagram": "matrix",
  "title": "Aufgaben bis Ende Mai",
  "quadrants": [
    { "title": "Planen", "items": ["Fortbildungsreihe vorbereiten"] },
    { "title": "Sofort erledigen", "kind": "problem", "items": ["Förderantrag bis Freitag"] },
    { "title": "Weglassen", "items": [] },
    { "title": "Abgeben", "items": ["Raumbuchung", "Protokoll schreiben"] }
  ],
  "x_axis": { "label": "Dringlichkeit", "low": "nicht dringend", "high": "dringend" },
  "y_axis": { "label": "Wichtigkeit", "low": "unwichtig", "high": "wichtig" }
}
```
