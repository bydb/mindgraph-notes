---
name: Mindmap erstellen
description: Aus einer Notiz, einem Thema oder Stichpunkten eine Mindmap als Excalidraw-Zeichnung im MindGraph-Stil erstellen — Mitte, Äste, Blätter, übersichtlich statt überladen.
---

# Mindmap erstellen

## Was entsteht

Eine Excalidraw-Zeichnung (`.excalidraw`): ein Thema in der Mitte, rundherum
Äste mit Oberbegriffen, an jedem Ast einige Blätter mit Stichworten. Layout,
Schrift und Farben setzt die App — du lieferst nur die Gliederung. Die Datei
öffnet im Excalidraw-Editor von MindGraph und lässt sich dort weiter bearbeiten.

Erzeugt wird die Datei **ausschließlich** mit dem Werkzeug `write_excalidraw`.
Schreibe nie selbst JSON und nie eine `.excalidraw`-Datei mit `write_note`.

## Wann anwenden

Wenn ein Thema als Überblick „auf einen Blick" gebraucht wird: Ideen sammeln
und ordnen, ein Projekt oder eine Fortbildung gliedern, den Inhalt einer Notiz
oder eines Textes zusammenfassen, Argumente oder Bereiche sortieren.

## Schritt 1: Inhalt beschaffen

- Geht es um eine Notiz oder ein Thema im Vault, lies zuerst die Quelle
  (`note_read`, bei Bedarf `note_search`). Eine Mindmap fasst zusammen, was da
  ist — sie erfindet keine Inhalte dazu.
- Kommt der Inhalt aus dem Auftrag selbst (Stichpunkte, Thema), arbeite damit.

## Schritt 2: Gliederung planen

- **Mitte**: das Thema in zwei bis fünf Wörtern. Kein Satz.
- **Äste**: 3 bis 7 Oberbegriffe, gleichrangig und ohne Überschneidung
  (höchstens 8 sind möglich). Reihenfolge = Lesereihenfolge: Die App legt die
  Äste abwechselnd rechts und links an, oben beginnend.
- **Blätter**: je Ast 2 bis 5 Stichworte (höchstens 6). Ein Ast darf auch ohne
  Blätter stehen, wenn er für sich spricht.
- Höchstens 40 Knoten insgesamt. Lieber eine zweite Mindmap als eine volle.
- Eine Ebene unter den Ästen ist die Grenze — tiefere Gliederung gehört in
  eine Notiz, nicht in die Mindmap.

## Schritt 3: Knoten formulieren

- **Stichworte statt Sätze**: „Datenschutz klären", nicht „Wir müssen noch den
  Datenschutz klären". Knoten höchstens 80 Zeichen, die Mitte höchstens 60;
  mehr als drei Zeilen lehnt die App ab.
- **Nur lateinische Schrift**: Umlaute, ß, Ziffern und übliche Satzzeichen
  gehen. Keine Emojis, keine Pfeile, keine Formeln, kein Markdown (`**`, `-`,
  `#`). Die App lehnt solche Zeichen ab und nennt sie.
- Keine Doppelungen unter Geschwistern.

## Schritt 4: Kategorien (optional)

`kind` färbt einen Knoten in den Farben der MindGraph-Notizkategorien:

- `problem` — offene Frage, Hindernis, etwas, das zu tun ist (rot)
- `solution` — Lösung, Antwort, bewährtes Vorgehen (grün)
- `info` — Hintergrund, Fakt, Beleg (blau)

Nur setzen, wenn der Inhalt es wirklich trägt — eine Mindmap, in der jeder
Knoten gefärbt ist, sagt nichts mehr. Ohne `kind` bleibt ein Knoten im
Petrol-Grundton.

## Schritt 5: Links (optional)

`link` macht einen Knoten zum Sprungpunkt auf eine Notiz: `[[Ordner/Notiz]]`,
Pfad wie bei `note_read`, ohne `.md`.

- Nur Notizen verlinken, die du in diesem Lauf gelesen oder gefunden hast.
- Keine URLs, keine Abschnitte (`#…`).
- Gibt es den Namen mehrfach im Vault, lehnt die App den Kurznamen ab — dann
  den vollen Pfad angeben.

## Schritt 6: Stil

- `klar` (Standard): saubere Linien, Schrift Nunito — für Unterlagen,
  Präsentationen, Dokumentation.
- `skizze`: Handzeichnungs-Optik, Schrift Excalifont — für Brainstorming und
  Ideensammlungen. Nur wenn der Auftrag das nahelegt.

## Schritt 7: Erzeugen

Rufe `write_excalidraw` auf mit `file_name` (sprechend, Endung `.excalidraw`),
`title`, `branches` und optional `style`. Lehnt die App ab, steht im Fehler,
was zu ändern ist: korrigiere genau das und rufe das Werkzeug erneut mit der
**vollständigen** Mindmap auf.

Schreibe **keine** Begleitnotiz mit Einbettung. Die genaue Zeile zum Einbetten
(`![[…excalidraw]]`) zeigt die Ergebniskarte nach dem Übernehmen — beim
Übernehmen kann sich der Dateiname noch ändern, deshalb nennst du keine eigene.

## Abschlussnachricht

Kurz: welches Thema, wie viele Äste, was du bewusst weggelassen hast, und dass
die Karte nach dem Übernehmen die Einbettungszeile zeigt. Hast du einen Zweck
oder Stil angenommen, nenne die Annahme.

## Beispiel für die Gliederung (nur die Form)

```json
{
  "file_name": "Projektstart Mindmap.excalidraw",
  "title": "Projektstart",
  "branches": [
    { "text": "Ziele", "children": [{ "text": "Ergebnis bis Juni" }, { "text": "Messbar machen" }] },
    { "text": "Offene Fragen", "kind": "problem", "children": [{ "text": "Budget" }, { "text": "Zuständigkeiten" }] },
    { "text": "Beteiligte", "children": [{ "text": "Fachgruppe" }, { "text": "Schulleitung" }] }
  ]
}
```
