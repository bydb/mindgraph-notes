---
name: Edumap erstellen
description: Eine Edumap (digitale Pinnwand der hessischen Medienzentren) als importierbare JSON-Datei erstellen — als Informationsablage oder als Mitmach-Map für Lernende, immer übersichtlich statt überladen.
---

# Edumap erstellen

## Was eine Edumap ist

Edumaps (edumaps.de, in Hessen über das Edupool der Medienzentren erreichbar) ist
eine digitale Pinnwand. Eine Map besteht aus **Spalten** (nebeneinander) und
**Boxen** in den Spalten. Jede Spalte kann unter ihrem Titel eine **Leitfrage oder
einen Arbeitsauftrag** tragen. Über der Map kann ein kurzer **Hinweiszettel** hängen.
Die Map wird in Edumaps geteilt; Lernende oder Kolleginnen und Kollegen können
je nach Freigabe lesen, eigene Boxen anlegen oder kommentieren.

Das Ergebnis dieses Skills ist eine JSON-Datei, die in Edumaps über
**„Map erstellen" → „Map importieren" → „Edumaps (json)"** geladen wird.

## Wann anwenden

Wenn aus einer Notiz, einem Unterrichts- oder Fortbildungsvorhaben, Material oder
Stichpunkten eine Edumap entstehen soll.

## Schritt 1: Zweck klären

Bestimme zuerst, welchem Zweck die Map dient. Ergibt er sich nicht aus dem
Auftrag, wähle den naheliegenden und nenne die Annahme in der Abschlussnachricht.

1. **Ablage** — Informationen und Material geordnet bereitstellen
   (Materialsammlung zu einem Thema, Kursbegleitung, Linksammlung,
   Organisatorisches). Alle Spalten enthalten fertige Boxen.
2. **Mitmachen** — Lernende arbeiten auf der Map: sammeln, antworten,
   reflektieren, Ergebnisse ablegen. Die Mitmach-Spalten bleiben **leer** und
   tragen einen klaren Arbeitsauftrag; höchstens eine Beispielbox zeigt, wie ein
   Beitrag aussehen soll.
3. **Kursbegleitung (Mischform)** — Material pro Termin oder Modul plus
   Reflexions- oder Sammelspalten, in die Teilnehmende schreiben.

## Schritt 2: Aufbau planen

- Eine Map, ein Thema. Was nicht dazugehört, kommt nicht auf die Map.
- **Spalten** in Lese- oder Arbeitsreihenfolge von links nach rechts:
  - Ablage: nach Themen oder Materialart (z. B. „Einstieg", „Erklärvideos",
    „Übungen", „Vertiefung").
  - Mitmachen: nach Arbeitsschritten (z. B. „1 Vermuten", „2 Recherchieren",
    „3 Ergebnisse"), vorne eine Spalte „Auftrag und Ablauf".
  - Kursbegleitung: eine Spalte pro Termin oder Modul (mit Datum im Titel) plus
    eine oder zwei Reflexionsspalten.
- **3 bis 6 Spalten** sind der Normalfall, mehr als 8 geht nicht.
- **Pro Spalte 2 bis 6 Boxen**, mehr als 10 geht nicht. Lieber eine Spalte mehr
  als eine überfüllte.
- Jede Box trägt **eine** Sache: ein Material, eine Information, einen Auftrag.

## Schritt 3: Boxen schreiben

- **Titel**: kurz und sprechend („Erklärvideo: Treibhauseffekt", nicht „Video 1").
- **Inhalt**: wenige Zeilen, höchstens etwa 5 Stichpunkte. Listen mit „- ",
  Wichtiges **fett**, Links als `[Text](https://…)` oder als nackte URL. Kein HTML,
  keine Tabellen, keine Überschriften-Hierarchien.
- Bei Material: ein Satz, wozu es dient oder was damit zu tun ist.
- Bei Terminen: Wochentag, Datum, Uhrzeit, Ort.
- **Leitfragen und Arbeitsaufträge** stehen in der `annotation` der Spalte, nicht in
  einer Box: kurz, eindeutig, in Du-Form für Lernende bzw. in der Anrede, die die
  Quelle nutzt. Sagt, **was** in die Box gehört und **wie viel**
  („Schreibe 1–2 Stichpunkte: Was hat dich überrascht?").
- **Farben sparsam** und mit Bedeutung, nicht zur Dekoration. Bewährt:
  `blau` für Material- und Informationsspalten, `orange` für Mitmach- und
  Reflexionsspalten, `rot` für Zusatztermine oder Wichtiges. Box-Farben nur, wenn
  sie etwas unterscheiden (z. B. `mint` für Beispielbox).

## Schritt 4: Mitmach-Maps absichern

- Ein Hinweiszettel (`hint`) sagt die Regel in einem Satz, z. B.
  „Lege pro Aufgabe eine eigene Box an und schreibe deinen Vornamen in den Titel."
- **Datenschutz**: keine Namen, Adressen oder sonstigen personenbezogenen Daten von
  Lernenden auf die Map schreiben. Wird eine Kennung gebraucht, im Hinweis nur
  Vornamen oder ein selbstgewähltes Kürzel verlangen.
- Keine Aufträge, die Fotos von Personen, private Erfahrungen oder Noten
  öffentlich auf der Map verlangen.

## Schritt 5: Erzeugen

Rufe **genau einmal** `write_edumap` auf:

- `file_name`: sprechend, kurz, Endung `.json` (z. B. `klimawandel-8b.json`)
- `title`: Titel der Map (bei Kursen mit Zeitraum oder Lerngruppe)
- `columns`: Spalten von links nach rechts, jede mit `title`, optional
  `annotation`, `color` und `boxes` (`title`, `content`, optional `color`).
  Eine Mitmach-Spalte hat **keine** `boxes`, aber immer eine `annotation`.
- optional `hint` und `lang`

Meldet das Werkzeug eine Überschreitung, **kürze inhaltlich** (zusammenfassen,
Nebensächliches streichen, auf zwei Spalten verteilen) und rufe es mit der
vollständigen Map erneut auf.

## Abschlussnachricht

Nenne in zwei bis vier Sätzen: den Zweck, den du angenommen hast, den Aufbau
(Spalten in einem Halbsatz) und was nach dem Import in Edumaps noch einzustellen
ist. Das JSON trägt **keine** Freigaben — bei Mitmach-Maps muss die Lehrkraft in
Edumaps selbst festlegen, wer Boxen anlegen darf (Teilen-Link mit
Bearbeitungsrecht), ob Kommentare sichtbar sind und ob ein Map-Passwort gilt.
Dateien (PDFs, Bilder) lassen sich erst nach dem Import in die Boxen hochladen.

## Regeln

- **Nie überladen**: lieber weniger, dafür klar. Jede Box muss einen Grund haben,
  auf der Map zu sein.
- Nur Inhalte aus den Quellen und dem Auftrag. Links nur, wenn sie in der Quelle
  stehen — keine URLs erfinden. Fehlt ein Material, eine Box mit dem Hinweis
  „Material folgt" statt eines erfundenen Links.
- Keine Namen realer Personen aus den Quellen in Mitmach-Spalten übernehmen
  (auch keine Beispielbeiträge mit echten Namen).
- Kein Gendern mit Sonderzeichen; neutrale Formulierungen wählen
  („Teilnehmende", „Lernende").
- Keine Emojis in Titeln und Boxen, außer die Quelle verwendet sie.
- Steht `write_edumap` in diesem Lauf nicht zur Verfügung, schreibe stattdessen mit
  `write_note` eine Markdown-Notiz mit demselben Aufbau (eine `##`-Überschrift pro
  Spalte, darunter Leitfrage kursiv und die Boxen als `###`-Abschnitte), damit die
  Map von Hand angelegt werden kann — und sage das in der Abschlussnachricht.
