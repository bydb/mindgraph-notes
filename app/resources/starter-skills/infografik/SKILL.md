---
name: Infografik
description: Aus einer Notiz, einem Text oder einer Recherche eine Infografik als EIN Bild erstellen — Titel, wenige Kernaussagen mit Zahlen, klare Gliederung, lesbare Beschriftung. Ergebnis ist eine JPEG-Datei, keine HTML-Seite.
---

# Infografik erstellen

## Was entsteht

Genau **ein Bild** (JPEG, Hochformat 3:4), das ein Thema auf einen Blick
erklärt: Überschrift, drei bis sechs Blöcke mit Kernaussagen, wo vorhanden mit
Zahlen, dazu einfache Symbole oder ein kleines Diagramm. Das Bild steht für
sich — man versteht es ohne Begleittext.

Erzeugt wird es **ausschließlich** mit `generate_image` und `mode: "infografik"`.
Baue **keine** HTML-Seite, kein SVG und keine Excalidraw-Zeichnung als Ersatz.

## Schritt 0: Werkzeug prüfen — vor allem anderen

Sieh nach, ob `generate_image` unter deinen Werkzeugen steht, **bevor** du liest
oder recherchierst. Fehlt es, fehlt das Modul „Bild-Generierung" oder der
Google-Schlüssel (Einstellungen → KI → Bild-Generierung).

- **Ohne Webrecherche**: Hör sofort auf und sage dem Nutzer genau das.
- **Mit Webrecherche**: Recherchiere nicht. Schreibe mit `write_note` eine
  Notiz mit genau einem Satz: „Infografik nicht erstellt: Das Modul
  Bild-Generierung ist aus oder der Google-Schlüssel fehlt (Einstellungen → KI →
  Bild-Generierung).“ Der Recherche-Modus kann nur mit einer geschriebenen Datei
  enden, sonst meldet die App einen irreführenden Fehler.

## Schritt 1: Inhalt beschaffen

- Geht es um eine Notiz oder ein Thema im Vault, lies zuerst die Quelle
  (`note_read`, bei Bedarf `note_search`). Die Infografik verdichtet, was da
  steht — sie erfindet nichts dazu.
- Bei eingeschalteter Webrecherche: höchstens zwei bis drei Seiten lesen, das
  reicht für eine Grafik.
- Kommt der Inhalt aus dem Auftrag selbst, arbeite damit.

## Schritt 2: Inhalt verdichten

Plane den Text, bevor du an Gestaltung denkst. Weniger ist hier fast immer besser:
Bildmodelle setzen kurze Beschriftungen sauber, lange Sätze verunstalten sie.

- **Titel**: höchstens 6 Wörter.
- **Untertitel** (optional): höchstens 12 Wörter.
- **3 bis 6 Blöcke**, jeder mit
  - einer Überschrift (höchstens 4 Wörter),
  - einer Aussage (höchstens 12 Wörter),
  - optional einer Kennzahl („42 %", „3 von 4", „seit 2023").
- **Fußzeile** (optional): Quelle in Kurzform, z. B. „Quelle: Destatis 2025".
- Insgesamt höchstens etwa 80 Wörter sichtbarer Text.
- **Zahlen nur aus Quelle oder Auftrag.** Fehlt eine Zahl, lass den Block ohne
  Zahl — nie schätzen, nie runden, ohne es zu sagen.
- Keine Personennamen, Adressen oder Gesichter echter Personen.

## Schritt 3: Prompt schreiben

Der Prompt beschreibt Layout und Stil auf **Englisch** und nennt jeden
sichtbaren Text **wörtlich in Anführungszeichen** in der Sprache des Nutzers
(meist Deutsch). Umlaute und ß ausschreiben, nie umschreiben (ä, nicht ae).

Aufbau, in dieser Reihenfolge:

1. Art und Format: `A clean vertical infographic, portrait 3:4, flat vector style.`
2. Stil: `White background, petrol (#1f6f78) and dark slate as main colors,
   one warm accent color, generous whitespace, simple line icons, sans-serif
   typography, high contrast, all text sharp and legible.`
3. Titel: `Title at the top in large bold letters: "…"`, ggf. Untertitel.
4. Gliederung: `Below, N sections arranged as …` — wähle EINE Form:
   - Raster (2 × 2 oder 2 × 3) für gleichrangige Punkte,
   - senkrechte Abfolge mit Pfeilen für Schritte und Abläufe,
   - Zeitstrahl für Entwicklungen,
   - zwei Spalten für Vergleiche (vorher/nachher, pro/contra),
   - ein einfaches Balken- oder Kreisdiagramm, wenn die Zahlen das tragen.
5. Jeder Block einzeln: `Section 1 with a [icon] icon, heading "…", text "…",
   big number "…".`
6. Fußzeile: `Small footer text: "Quelle: …"`
7. Abschluss: `No other text. No watermark. No logos. No photorealistic people.`

Bei Diagrammen die Werte ausdrücklich nennen und sagen, dass die Balken
proportional sein sollen. Bei Themen mit Kindern und Jugendlichen nur Symbole,
keine Figuren.

Der Prompt darf höchstens 400 Wörter und 3000 Zeichen haben, die App lehnt
längere ab. Schreibe den Modus genau so: `mode: "infografik"`.

## Schritt 4: Bild erzeugen

```
generate_image({
  file_name: "<thema-kurz>-infografik.jpg",
  mode: "infografik",
  aspect_ratio: "3:4",
  prompt: "<Prompt aus Schritt 3>"
})
```

- Querformat (`"16:9"`) nur, wenn der Nutzer es verlangt, z. B. für eine Folie.
- Schlägt der Aufruf fehl, lies die Fehlermeldung, kürze oder entschärfe den
  Prompt und versuche es **höchstens einmal** neu.

## Schritt 5: Abschluss

- **Ohne Webrecherche**: Das Bild ist das Ergebnis. Schreibe keine weitere
  Datei. Antworte kurz mit dem Dateinamen und den Kernaussagen, die im Bild
  stehen, damit der Nutzer die Beschriftung gegen die Quelle prüfen kann.
- **Mit Webrecherche**: Der Recherche-Modus verlangt genau eine Ergebnisdatei.
  Schreibe deshalb danach mit `write_note` eine **kurze** Begleitnotiz: das Bild
  per `![[dateiname.jpg]]`, darunter die Kernaussagen als Liste mit den Zahlen.
  Die Quellen hängt die App selbst an. Keine langen Erklärungen.

## Hinweis an den Nutzer

Bildmodelle setzen Text meist richtig, aber nicht immer. Weise in der
Abschlussantwort in einem Satz darauf hin, dass Beschriftungen und Zahlen im
Bild vor der Weitergabe geprüft werden sollten.
