---
name: Begriffsnetz
description: Zusammenhänge zwischen Begriffen als Begriffsnetz (Concept Map) zeichnen — Begriffe als Kästen, beschriftete Pfeile wie „verursacht“ oder „ist Teil von“. Als Excalidraw-Zeichnung zum Weiterarbeiten; Pfeile bleiben beim Verschieben an den Begriffen.
---

# Begriffsnetz erstellen

## Was entsteht

Eine Excalidraw-Zeichnung (`.excalidraw`): Begriffe als Kästen, verbunden durch
Pfeile, auf denen steht, **wie** die Begriffe zusammenhängen. Jede Verbindung
lässt sich als Satz lesen: „Photosynthese — erzeugt → Traubenzucker“. Die
Pfeile sind an die Begriffe gebunden — verschiebt man einen Kasten in
Excalidraw, gehen die Pfeile mit. Anordnung, Schrift und Farben setzt die App:
oben die allgemeinen Begriffe, darunter die, auf die Pfeile zeigen.

Erzeugt wird die Datei **ausschließlich** mit dem Werkzeug `write_excalidraw`
und `diagram: "begriffsnetz"`. Schreibe nie selbst JSON und nie eine
`.excalidraw`-Datei mit `write_note`.

## Wann anwenden

Wenn es um Zusammenhänge geht, nicht nur um eine Gliederung: Ursachen und
Wirkungen, Bestandteile, Abhängigkeiten, ein Fachgebiet für den Unterricht,
Begriffe eines Textes in Beziehung setzen, Wissen vor einer Prüfung ordnen.

Unterschied zur Mindmap: Die Mindmap gliedert ein Thema in Äste. Das
Begriffsnetz verbindet Begriffe quer und sagt an jeder Verbindung, was sie
bedeutet. Reicht eine Gliederung, nimm die Mindmap.

## Schritt 1: Inhalt beschaffen

- Geht es um eine Notiz, einen Text oder ein Kapitel, lies zuerst die Quelle.
  Das Netz zeigt die Zusammenhänge, die dort stehen — keine erfundenen.
- Kommt der Inhalt aus dem Auftrag selbst, arbeite damit. Bei Unterrichts-
  themen nur gesichertes Fachwissen.

## Schritt 2: Leitfrage und Begriffe

- **Leitfrage** als `title`, zum Beispiel „Wie ernähren sich Pflanzen?“. Sie
  hält das Netz zusammen und entscheidet, was hineingehört.
- **Begriffe**: 5 bis 12 (höchstens 15). Substantive oder kurze Wendungen,
  höchstens 60 Zeichen, keine Sätze.
- Der **erste** Begriff ist der Hauptbegriff — er wird hervorgehoben.
- Keine Doppelungen und keine fast gleichen Begriffe („Licht“ und
  „Sonnenlicht“ — entscheide dich für einen).

## Schritt 3: Beziehungen

- Jede Beziehung: `from` (Begriff), `to` (Begriff), `label` (Verb oder kurze
  Wendung, höchstens 30 Zeichen): „verursacht“, „besteht aus“, „ist Teil von“,
  „braucht“, „erzeugt“, „führt zu“, „ist ein Beispiel für“.
- `from` und `to` müssen **genau** den Text eines Begriffs der Liste tragen
  (Groß- und Kleinschreibung egal). Ein Tippfehler lehnt die App ab und nennt
  die gültigen Begriffe.
- Die Richtung zählt: Der Pfeil zeigt von `from` nach `to`, gelesen als Satz.
  Prüfe jeden Satz: „Licht — braucht → Photosynthese“ ist falsch herum.
- Jeder Begriff braucht mindestens einen Pfeil — sonst gehört er nicht ins Netz.
- 1 bis 2 Beziehungen je Begriff sind meist genug; höchstens 25 insgesamt.
  Querverbindungen zwischen entfernten Begriffen sind der eigentliche Wert
  eines Begriffsnetzes, aber nur, wenn sie inhaltlich stimmen.

## Schritt 4: Kategorien und Links (optional)

- `kind` färbt einen Begriff: `problem` (offene Frage, Hindernis), `solution`
  (Lösung, bewährtes Vorgehen), `info` (Hintergrund, Fakt). Sparsam einsetzen.
- `link` macht einen Begriff zum Sprungpunkt auf eine Notiz: `[[Ordner/Notiz]]`
  ohne `.md` — nur Notizen, die du in diesem Lauf gelesen oder gefunden hast.

## Schritt 5: Erzeugen

Rufe `write_excalidraw` auf mit `file_name` (sprechend, Endung `.excalidraw`),
`diagram: "begriffsnetz"`, `title`, `concepts` und `relations`.
`style: "skizze"` nur bei Brainstorming. Lehnt die App ab, steht im Fehler,
was zu ändern ist: korrigiere genau das und rufe das Werkzeug erneut mit dem
**vollständigen** Netz auf.

Schreibe **keine** Begleitnotiz mit Einbettung. Die Zeile zum Einbetten zeigt
die Ergebniskarte nach dem Übernehmen.

## Abschlussnachricht

Kurz: Leitfrage, wie viele Begriffe und Beziehungen, was du bewusst
weggelassen hast. Hinweis: Die Anordnung ist ein Vorschlag — in Excalidraw
lassen sich Begriffe verschieben, die Pfeile gehen mit.

## Beispiel (nur die Form)

```json
{
  "file_name": "Photosynthese Begriffsnetz.excalidraw",
  "diagram": "begriffsnetz",
  "title": "Wie ernähren sich Pflanzen?",
  "concepts": [
    { "text": "Photosynthese" },
    { "text": "Licht" },
    { "text": "Traubenzucker" },
    { "text": "Chloroplasten", "kind": "info" },
    { "text": "Wachstum" }
  ],
  "relations": [
    { "from": "Photosynthese", "to": "Licht", "label": "braucht" },
    { "from": "Photosynthese", "to": "Traubenzucker", "label": "erzeugt" },
    { "from": "Chloroplasten", "to": "Photosynthese", "label": "sind Ort der" },
    { "from": "Traubenzucker", "to": "Wachstum", "label": "ermöglicht" }
  ]
}
```
