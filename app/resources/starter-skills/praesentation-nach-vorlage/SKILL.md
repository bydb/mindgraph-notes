---
name: PowerPoint nach Vorlage
description: Eine PowerPoint-Präsentation im eigenen Hausstil erstellen — aus einer Muster-Präsentation mit Logo, Kopf- und Fußzeile; der Agent liefert Gliederung, Folientexte und Sprechernotizen.
---

# PowerPoint nach Vorlage

## Meine Vorlage

- Vorlage: `Skills/praesentation-nach-vorlage/MindGraph-Hausstil.pptx`

Das ist die mitgelieferte Vorlage im MindGraph-Stil. Mit eingerichtetem
Hausdesign erscheint sie in den Farben und mit dem Logo des Hauses. Für
deinen eigenen Hausstil ersetze den Pfad durch deine Muster-Präsentation
(vault-relativ, `.pptx` oder `.potx`).

Nennt der Auftrag eine andere Vorlage im Vault oder ist eine `.pptx` aus dem
Vault angehängt, gilt diese (vault-relativer Pfad aus der Anhang-Liste). Die
Werkzeuge lesen Vorlagen **nur aus dem Vault**. Liegt die Vorlage außerhalb
oder ist keine eingetragen und keine genannt, erzeuge **keine** Präsentation,
sondern sage in der Abschlussnachricht, was fehlt und wo es hingehört.

Master, Logo, Schriften, Farben und Fußzeile kommen aus der Vorlage und
bleiben unverändert; du lieferst nur die **Folien**.

## Schritt 1: Vorlage ansehen

Rufe `inspect_pptx_template` mit dem Pfad der Vorlage auf. Du erfährst die
**Layouts** (Name, Art, Plätze, ungefähre Zeilenzahl), welche Layouts
**Symbole** zeigen und welche Symbolnamen es gibt, die **Felder** der Vorlage
(`{{…}}`, etwa in der Fußzeile) und ob Gestaltung nur auf Musterfolien liegt.

Nimm Layouts **beim Namen**, wie die Vorlage sie nennt. Hat die Vorlage nur
einfache Layouts (Titel, Inhalt, zwei Inhalte), gelten Schritt 2 und 4; Schritt 3
nur, soweit die Plätze vorhanden sind.

## Schritt 2: Dramaturgie

Eine gute Präsentation ist ein Weg, keine Stoffsammlung.

- **Titelfolie**: Titel, darunter Anlass, Zielgruppe, Datum, Dauer — nur, was aus
  Quelle oder Auftrag hervorgeht. Gibt es ein Bild, nimm „Titelfolie mit Bild".
- **Einstieg**: eine Folie, die das Publikum abholt — zwei oder drei Fragen an
  die Zuhörenden oder die Ausgangslage. Keine Agenda als erste Inhaltsfolie.
- **Orientierung** bei mehr als etwa 8 Folien: Ablauf oder Ziele als Karten
  oder Schritte.
- **Teile**: Jeder Teil beginnt mit einer **Abschnittsfolie** (Dachzeile = Name
  des Teils, bei Veranstaltungen mit Dauer `<Name des Teils> · <Dauer>`; Titel =
  die Frage oder Behauptung des Teils; Untertitel = was darin geschieht;
  `icon`). Danach 3 bis 6 Inhaltsfolien; die letzte trägt eine Kernaussage.
- **Schluss**: Zusammenfassung als nummerierte Punkte (höchstens fünf), danach
  bei Bedarf nächste Schritte auf „Abschluss". Eine „Vielen Dank"-Folie nur,
  wenn der Auftrag sie verlangt.
- **Nur wenn die Quelle einen Fall oder eine Geschichte enthält**: im Einstieg
  anerzählen, mit zwei bis drei offenen Fragen; die Auflösung auf eine Folie am
  Schluss. Keine Geschichten erfinden.
- **Nur bei Übungen**: zuerst Auftrag und Prüffragen ohne Ergebnis, die Lösung
  auf eine eigene Folie danach.
- Faustregel: eine Folie pro 1–2 Minuten. Ist keine Dauer genannt, 12 bis 18
  Folien. **Nennt der Auftrag eine Gesamtdauer**, ergeben alle Phasen samt
  Pausen genau diese Dauer; Notizen und Zeitleiste nennen dieselben Zeiten.
  Bleibt eine Lücke oder wird es zu lang, nichts auffüllen oder verschieben,
  sondern in der Abschlussnachricht melden und einen Puffer vorschlagen. Einen
  Puffer nur aufnehmen, wenn Quelle oder Auftrag ihn vorgeben.

## Schritt 3: Für jede Folie die passende Form

**Zuerst die Aussage, dann die Form.** Frage bei jeder Folie: Was ist das für
ein Inhalt? Danach richtet sich das Layout — nicht umgekehrt.

| Inhalt | Layout | Felder |
|---|---|---|
| 3–4 gleichrangige Aspekte, Bausteine, Rollen, Ziele | „Drei Karten" / „Vier Karten" | `items` mit `icon`, `title`, `text`, optional `label` |
| dasselbe, mit einer Folgerung daraus | „Karten mit Kernaussage" / „Vier Karten mit Kernaussage" | zusätzlich `takeaway` |
| Ablauf, Vorgehen, Reihenfolge | „Drei Schritte" / „Vier Schritte" | `items`, optional mit `icon`; `takeaway` = Hinweis oder Arbeitsauftrag darunter |
| Ablauf mit 3–7 Stationen, besonders wenn sich ein Teil wiederholt | „Ablauf mit Schleife" | `flow`: `steps` mit `label`, `text`, `loop`; `loopLabel`; `takeaway` = Hinweis darunter |
| Leitfragen, Prüfpunkte, Zusammenfassung | „Drei Punkte" / „Vier Punkte" / „Fünf Punkte" | `items` mit `title` und einer Zeile `text` |
| eine Regel und was aus ihr folgt | „Vier Punkte mit Kernaussage" | `takeaway` = die Regel, `items` = die vier Folgen |
| Gegenüberstellung (vorher/nachher, A/B) | „Zwei Inhalte" | `body` und `body2`, je erste Zeile fett als Kopf |
| Beispiel im Wortlaut: Datei, Auftragstext, Auszug | „Dokument und Erläuterung" | `body` = der Wortlaut, `body2` = was daran wichtig ist |
| bis zu drei belegte Zahlen, jede für sich | „Kennzahlen" | `items`: `title` = Zahl, `label` = wofür, `text` = Bedeutung |
| belegte Zahlen im Vergleich (2–8 Werte derselben Größe) | „Balkendiagramm" / „Balkendiagramm mit Text" | `chart`: `caption`, `bars` mit `label`, `value`, `note` = Quelle |
| Ablauf mit Dauern, Tagesplan, Phasen | „Zeitleiste" | `timeline`: `blocks` mit `label`, `value`, bei zwei Teilen `row` |
| Erklärung in ganzen Punkten | „Titel und Inhalt" / „Text mit Kernaussage" | `body` |
| ein Bild, das etwas zeigt | „Bild mit Text" | `image`, `body` |

Regeln dazu:

- **Formwechsel**: nie zweimal hintereinander dasselbe Layout, und höchstens
  jede vierte Inhaltsfolie eine reine Aufzählung. Wiederholt sich eine Form,
  prüfe, ob der Inhalt nicht doch ein Ablauf, ein Vergleich oder ein Beispiel ist.
- **Anzahl muss passen**: Schritte und Punkte zeigen feste Ziffern — genau so
  viele `items` wie das Layout nennt. Passt es nicht, anderes Layout wählen
  oder den Inhalt anders schneiden, nichts auffüllen.
- **Symbole** (`icon`): nur Namen aus der Liste der Inspektion, je Karte ein
  anderes, das den Begriff der Karte trifft. Abschnittsfolien bekommen das
  Symbol ihres Teils.
- **Bild für den Begriff** (`label` einer Karte): ein Alltagswort, das den
  Fachbegriff der Karte greifbar macht. Nur, wenn es wirklich trägt; sonst
  weglassen.
- **Hervorheben** (`highlight: true`): höchstens eine Karte je Folie — die, bei
  der das Publikum selbst etwas tut oder auf die es ankommt. Die Akzentfarbe
  steht für „hier handeln" oder „das merken", nie für Schmuck.
- **Zwei Balken**: dunkel („Kernaussage") = der Satz, den man mitnimmt; hell
  („Hinweisbalken" bei Schritten) = Achtung oder Arbeitsauftrag. Zusammen
  höchstens auf jeder dritten Folie.
- **Kennzahlen, Balkendiagramm und Zeitleiste nur mit Zahlen und Dauern aus
  Quelle oder Auftrag** — gibt es keine, nimm diese Layouts nicht. Im
  Diagramm `highlight` für die Balken, um die es geht; in der Zeitleiste für
  Phasen, in denen das Publikum selbst arbeitet.
- **Ablauf mit Schleife**: `loop: true` bei mindestens zwei benachbarten
  Stationen, die sich wiederholen; `loopLabel` sagt, wann die Schleife endet.
  `label` ein bis drei Wörter.
- **Beispiele im Wortlaut** nur aus der Quelle oder als Übungsmaterial, das
  auf der Folie als erfunden gekennzeichnet ist; im Dokument-Layout Zeile für
  Zeile, ohne Aufzählungszeichen.

## Schritt 4: Folientexte

- **Sprache des Publikums**: Fragen und Arbeitsaufträge mit konkreten Verben
  und Gegenständen, die das Publikum aus seiner Arbeit kennt. Fachwörter nur,
  wenn das Publikum sie kennt oder die Folie sie erklärt. Die Anrede (Sie oder
  du) kommt aus dem Auftrag; nennt er keine, Sie.
- **Erst einführen, dann verwenden**: Namen, Figuren und Fachbegriffe, die das
  Publikum nicht kennt, bei der ersten Verwendung erklären — auf derselben
  Folie oder vorher. Kein Titel setzt etwas voraus, das noch nicht erklärt ist.
- **Ein Begriff für eine Sache**: jede Phase, Rolle und Sache hat genau eine
  Bezeichnung — in Titeln, Dachzeilen, Abläufen und Notizen dieselbe.
- **Der Titel ist eine Aussage**, kein Schlagwort: ein ganzer Satz, der sagt,
  was das Publikum mitnehmen soll. Höchstens zwei Zeilen.
- **Dachzeile** (`kicker`) auf jeder Inhaltsfolie: ein bis drei Wörter, die
  sagen, **was diese Folie ist** („Gegenüberstellung", „Ablauf", „Beispiel",
  „Prüfraster", „Zusammenfassung") — nicht den Titel wiederholen.
- **Karten und Schritte**: `title` ein bis drei Wörter, so kurz, dass er im
  Layout einzeilig bleibt; Fragen und Erklärungen gehören in `text` (ein bis
  zwei kurze Sätze). Schritt-Titel als Verb + Gegenstand.
- **Aufzählungen**: höchstens etwa 6 Punkte, je Punkt eine Zeile; **fett**
  sparsam.
- **Werkzeuge und Verfahren**: auch nennen, was sie nicht können, soweit die
  Quelle es hergibt.
- **Keine Foliennummern** in Folientexten — nach dem Umsortieren stimmen sie
  nicht mehr.
- **Sprechernotizen** (`notes`) für jede Inhaltsfolie: zwei bis fünf Sätze, was
  dazu gesagt wird — Beispiel, Überleitung, bei Arbeitsphasen die Zeitangabe.
  Was auf der Folie keinen Platz hat, gehört hierher.
- **Bilder** nur aus diesem Lauf (`generate_image`) oder als PNG/JPEG aus dem
  Vault, nie verlinken.

## Schritt 5: Prüfen und erzeugen

Prüfe vor dem Aufruf und überarbeite, was nicht passt:

1. Versteht das Publikum jeden Titel ohne Erklärung?
2. Ist jeder unbekannte Name und Fachbegriff bei der ersten Verwendung
   erklärt?
3. Hat jede Sache genau eine Bezeichnung?
4. Sind alle Karten- und Schritt-Titel kurz genug für eine Zeile?
5. Bei einer Gesamtdauer: Ergeben die Zeiten genau diese Dauer, und ist jede
   Lücke gemeldet statt aufgefüllt?
6. Bei Übungen: Steht keine Lösung vor ihrer Übung?

Rufe dann **genau einmal** `write_pptx` auf:

- `file_name`: kurz und sprechend, Endung `.pptx`
- `template`: der Pfad aus „Meine Vorlage" (oder aus Auftrag/Anhang)
- `slides`: alle Folien in Reihenfolge
- `fields`: Werte für die Felder der Vorlage, soweit sie aus Quelle oder Auftrag
  hervorgehen. Ein Feld ohne Wert wird leer gelassen und gemeldet — **nie
  erfinden**.

Lehnt das Werkzeug ab (Folie zu voll, Anzahl passt nicht, Layout unbekannt),
**teile die Folie auf oder kürze** und rufe es mit **allen** Folien erneut auf.

## Abschlussnachricht

Zwei bis vier Sätze: Folienzahl und Aufbau in einem Halbsatz, welche Vorlage
benutzt wurde, und was der Nutzer prüfen sollte — Hinweise des Werkzeugs
(verkleinerte Schrift, leere Felder, ersetzte Symbole, Gestaltung, die nur auf
Musterfolien lag) **immer** weitergeben.

## Regeln

- Nur Inhalte aus den Quellen und dem Auftrag. Keine erfundenen Zahlen, Zitate,
  Namen oder Links und keine erfundenen Beispiele, Aufgaben oder Situationen
  aus dem Alltag des Publikums (die Ausnahme für gekennzeichnetes
  Übungsmaterial gilt dafür nicht). Fehlen sie, bleib allgemein und frag in
  der Abschlussnachricht danach.
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
