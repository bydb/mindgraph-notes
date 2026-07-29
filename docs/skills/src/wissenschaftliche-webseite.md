---
name: Wissenschaftliche Webseite
description: Eine wissenschaftliche HTML-Seite mit Formeln (LaTeX) und Grafiken (SVG) erstellen — aus Notizen, Anhängen oder einem Thema. Öffnet sich direkt in der HTML-Vorschau der App.
---

# Wissenschaftliche Webseite erstellen

## Wann anwenden

Wenn ein fachliches oder wissenschaftliches Thema als ansprechend gesetzte
HTML-Seite aufbereitet werden soll: Herleitungen mit Formeln, erklärende
Diagramme, Tabellen, Literaturangaben. Quelle können Notizen, Anhänge oder
das Wissen zum Thema sein.

## Vorgehen

1. Lies zuerst alle Quellen vollständig (Notiz, Anhänge, bei Bedarf note_search).
2. Gliedere den Stoff: Zusammenfassung, nummerierte Abschnitte (1, 2, 3 im
   Überschriftentext), am Ende Literatur. Eine Seite erzählt EINEN Gedankengang.
3. Erzeuge die Seite genau einmal mit write_html: title = Seitentitel,
   body_html = Artikel-Inhalt nach den Bausteinen unten.

## Bausteine für body_html

Das Seitengerüst (Titel, Schriften, Farben, Formel-Rendering) kommt von der App —
body_html enthält nur den Artikel-Inhalt aus diesen Bausteinen. Die Bausteine sind
Muster: IMMER vollständig mit echtem Inhalt füllen, NIEMALS wörtlich mit
Platzhaltern oder Auslassungspunkten übernehmen.

- Untertitel/Autor: `<p class="byline"><span class="author">Name</span> · Kontext</p>`
- Zusammenfassung: `<div class="abstract"><h2>Zusammenfassung</h2><p>3-4 Sätze</p></div>`
- Abschnitt: `<section><h2>1&nbsp;&nbsp;Überschrift</h2><p>Absatztext</p></section>`
- Formel im Fließtext: `\(E = mc^2\)`
- Abgesetzte Formel (wird automatisch nummeriert):
  `<div class="equation">$$ m\,\ddot{x} + c\,\dot{x} + k\,x = 0 $$</div>`
- Abbildung (wird automatisch nummeriert — „Abbildung N:" nicht selbst schreiben):
  `<figure class="fig">` + genau EIN vollständiges Inline-SVG + `<figcaption>Was zu
  sehen ist.</figcaption>` + `</figure>`
- Tabelle: `<div class="table-wrap">` um ein normales `<table>`-Element mit
  `<caption>`; Zahlenspalten mit `class="num"`
- Quellenverweis im Text: `<sup class="cite"><a href="#ref-1">[1]</a></sup>`
- Literatur am Ende: `<section class="references">` mit `<h2>Literatur</h2>` und
  `<ol>`, jeder Eintrag `<li id="ref-1">Autor: <i>Titel</i>. Verlag, Jahr.</li>`

## Regeln für Formeln

- Standard-LaTeX ohne Pakete: Brüche `\frac{a}{b}`, Wurzeln `\sqrt{x}`,
  griechische Buchstaben, `\sum`, `\int`, Matrizen `\begin{pmatrix}…\end{pmatrix}`.
- Deutsche Dezimalzahlen in Formeln: `0{,}05` (sonst falscher Abstand nach dem Komma).
- Keine Formel-Nummern von Hand — die Nummerierung macht die Seite selbst.
- In SVG-Beschriftungen funktioniert KEIN LaTeX — dort einfache Textform wählen
  (Unicode wie ω₀ ist erlaubt) oder die Erklärung in die Bildunterschrift verlagern.

## Regeln für SVG-Grafiken

- Immer Inline-SVG mit `viewBox` (z.B. `0 0 640 300`), keine width/height-Attribute,
  keine externen Referenzen oder Rasterbilder.
- Farben NUR aus den CSS-Variablen der Seite: `var(--fig-line)` (Hauptlinie),
  `var(--fig-line-2)` (Zweitlinie), `var(--muted)` (Hilfslinien/Nebentext),
  `var(--fig-grid)` (Gitter), `currentColor` (Achsen und Beschriftung) —
  so funktioniert die Grafik in Hell und Dunkel.
- Beschriftung als `<text>`-Elemente mit `font-size="14"`, nicht als Pfade.
- `polyline`/`polygon`: `points` NUR mit Leerzeichen und Kommas trennen
  (`points="0,270 100,180 200,120"`) — Semikolons machen die Grafik unsichtbar.
  Alle Koordinaten müssen innerhalb der viewBox liegen (keine negativen Werte).
- Lieber eine einfache, korrekte Grafik (Achsen, eine Kurve, Beschriftung)
  als eine komplexe, die nicht stimmt. Koordinaten vorher überschlagen:
  Ursprung, Achsenrichtung, Wertebereich.

## Regeln

- title wird als Überschrift gesetzt — im body_html KEIN `<h1>` und keine
  Titel-Wiederholung.
- Nur Fakten aus den gelesenen Quellen; Herleitungen, die du ergänzt, müssen
  fachlich korrekt sein — im Zweifel weglassen.
- Sachlicher Ton, vollständige Sätze, keine Emojis.
- Dateiname: sprechend und kurz, Endung .html (z.B. `gedaempfter-oszillator.html`).
