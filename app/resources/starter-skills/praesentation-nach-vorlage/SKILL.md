---
name: PowerPoint nach Vorlage
description: Eine PowerPoint-Präsentation im eigenen Hausstil erstellen — aus einer Muster-Präsentation mit Logo, Kopf- und Fußzeile; der Agent liefert Gliederung, Folientexte und Sprechernotizen.
---

# PowerPoint nach Vorlage

## Meine Vorlage

- Vorlage: `Skills/praesentation-nach-vorlage/MindGraph-Hausstil.pptx`

Das ist die mitgelieferte Vorlage im MindGraph-Stil (Karten mit Symbolen,
Schritte, Punktelisten, Abschnittsfolien). Mit eingerichtetem Hausdesign
erscheint sie automatisch in den Farben und mit dem Logo des Hauses. Für
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
Titel, Text, optional Symbole, Bild und Sprechernotizen. Die Musterfolien der
Vorlage werden durch deine Folien ersetzt.

## Schritt 1: Vorlage ansehen

Rufe `inspect_pptx_template` mit dem Pfad der Vorlage auf. Du erfährst:

- welche **Layouts** es gibt (Name, Art, Plätze, ungefähre Zeilenzahl),
- ob ein Layout **Symbole** zeigt und welche Symbolnamen es gibt,
- welche **Felder** die Vorlage hat (z. B. `{{ANLASS}}` in der Fußzeile),
- ob Gestaltung **nur auf Musterfolien** liegt und deshalb auf neuen Folien fehlt.

Nimm Layouts **beim Namen**, wie die Vorlage sie nennt. Hat die Vorlage nur
einfache Layouts (Titel, Inhalt, zwei Inhalte), gelten Schritt 2 und 4; Schritt 3
nur, soweit die Plätze vorhanden sind.

## Schritt 2: Dramaturgie

Eine gute Präsentation ist ein Weg, keine Stoffsammlung.

- **Titelfolie**: Titel, darunter Anlass, Zielgruppe, Datum, Dauer — nur, was aus
  Quelle oder Auftrag hervorgeht. Gibt es ein Bild, nimm „Titelfolie mit Bild".
- **Einstieg**: eine Folie, die das Publikum abholt — zwei oder drei Fragen an
  die Zuhörenden oder die Ausgangslage. Keine Agenda als erste Inhaltsfolie.
- **Orientierung** bei mehr als etwa 8 Folien: Ablauf oder Ziele („Am Ende
  können Sie …") als Karten oder Schritte.
- **Teile**: Jeder Teil beginnt mit einer **Abschnittsfolie** (Dachzeile = Name
  des Teils, bei Veranstaltungen mit Dauer: „Grundlagen · 20 Min."; Titel = die
  Frage oder Behauptung des Teils; Untertitel = was darin geschieht; `icon`).
  Danach 3 bis 6 Inhaltsfolien. Ein Teil endet mit einer Folie, die eine
  Kernaussage trägt.
- **Schluss**: Zusammenfassung als nummerierte Punkte (höchstens fünf), danach
  bei Bedarf nächste Schritte auf „Abschluss". Eine „Vielen Dank"-Folie nur,
  wenn der Auftrag sie verlangt.
- Faustregel: eine Folie pro 1–2 Minuten. Ist keine Dauer genannt, 12 bis 18
  Folien.

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
  anderes, das den Begriff trifft („lupe" für Suchen, „schild" für Schutz).
  Abschnittsfolien bekommen das Symbol ihres Teils.
- **Bild für den Begriff** (`label` einer Karte): ein Alltagswort, das den
  Fachbegriff greifbar macht („Modell" — „der Kopf", „Werkzeuge" — „die
  Hände"). Nur, wenn es wirklich trägt; sonst weglassen.
- **Hervorheben** (`highlight: true`): höchstens eine Karte je Folie — die, bei
  der das Publikum selbst etwas tut oder auf die es ankommt. Die Akzentfarbe
  ist knapp: sie steht für „hier handeln" oder „das merken", nie für Schmuck.
- **Zwei Balken**: dunkel („Kernaussage") = der Satz, den man mitnimmt; hell
  („Hinweisbalken" bei Schritten) = Achtung oder Arbeitsauftrag. Zusammen
  höchstens auf jeder dritten Folie.
- **Kennzahlen und Balkendiagramm nur mit Zahlen aus Quelle oder Auftrag** —
  nie schätzen oder erfinden. Gibt es keine belegten Zahlen, nimm diese
  Layouts nicht. Im Diagramm `value` als reine Zahl, die Einheit in `caption`,
  die Quelle in `note`; `highlight` für die Balken, um die es geht.
- **Ablauf mit Schleife**: `loop: true` bei den Stationen, die sich
  wiederholen — sie müssen nebeneinander stehen (mindestens zwei) und
  bekommen den Rückpfeil; `loopLabel` sagt, wann die Schleife endet. `label`
  ein bis drei Wörter, `text` eine kurze Zeile. Ohne `loop` wird es eine
  einfache Kette.
- **Zeitleiste**: `value` ist die Dauer als Zahl (Einheit `unit`, sonst
  Minuten); die Breite der Blöcke folgt ihr. `highlight: true` für Phasen, in
  denen das Publikum selbst arbeitet, `pause: true` für Pausen, `legend` erklärt
  die beiden Farben. Nur Dauern aus Quelle oder Auftrag.
- **Beispiele im Wortlaut** nur aus der Quelle oder als erkennbar erfundenes
  Übungsbeispiel; im Dokument-Layout Zeile für Zeile, ohne Aufzählungszeichen.

## Schritt 4: Folientexte

- **Der Titel ist eine Aussage**, kein Schlagwort: „Ein Chat antwortet – ein
  Agent erledigt einen Auftrag" statt „Chat und Agent". Höchstens zwei Zeilen.
- **Dachzeile** (`kicker`) auf jeder Inhaltsfolie: ein bis drei Wörter, die
  sagen, **was diese Folie ist** („Gegenüberstellung", „Ablauf", „Beispiel",
  „Prüfraster", „Zusammenfassung") — nicht den Titel wiederholen.
- **Karten und Schritte**: `title` ein bis drei Wörter, `text` ein bis zwei
  kurze Sätze. Schritt-Titel als Verb + Gegenstand („Auftrag geben").
- **Aufzählungen**: höchstens etwa 6 Punkte, je Punkt eine Zeile. Mit `- `,
  Unterpunkt mit zwei Leerzeichen davor, Nummerierung mit `1. `. Wichtiges
  **fett**, sparsam.
- **Sprechernotizen** (`notes`) für jede Inhaltsfolie: zwei bis fünf Sätze, was
  dazu gesagt wird — Beispiel, Überleitung, bei Arbeitsphasen die Zeitangabe.
  Was auf der Folie keinen Platz hat, gehört hierher.
- Bilder: nur ein Bild, das in diesem Lauf erzeugt wurde (`generate_image`,
  falls verfügbar) oder als PNG/JPEG im Vault liegt. Keine Bilder erfinden oder
  verlinken.

## Schritt 5: Erzeugen

Rufe **genau einmal** `write_pptx` auf:

- `file_name`: kurz und sprechend, Endung `.pptx`
- `template`: der Pfad aus „Meine Vorlage" (oder aus Auftrag/Anhang)
- `slides`: alle Folien in Reihenfolge, jede mit `layout`, `title` und je nach
  Layout `kicker`, `subtitle`, `body`, `body2`, `items`, `takeaway`, `icon`,
  `timeline`, `chart`, `flow`, `image`, `notes`
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
