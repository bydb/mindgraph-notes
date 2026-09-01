# Vorlage: Lehrplan-Portale, Stil-Block, Bausteine, Aufgabenlehre

Diese Datei ist Pflichtlektüre, bevor du ein Arbeitsblatt schreibst. Der
Stil-Block muss WÖRTLICH übernommen werden — ohne ihn hat das Blatt kein
Layout, keine Schreiblinien und keine Aufgabennummern.

## Lehrplan-Portale der Bundesländer

Amtliche Portale. Nimm immer das des genannten Landes, nie einen Verlag und nie
das Portal eines anderen Landes: Fachbegriffe, Klassenstufen und
Kompetenzformulierungen unterscheiden sich zwischen den Ländern erheblich.

| Bundesland | Amtliches Portal |
| --- | --- |
| Baden-Württemberg | bildungsplaene-bw.de |
| Bayern | lehrplanplus.bayern.de |
| Berlin | bildungsserver.berlin-brandenburg.de (Rahmenlehrplan, gemeinsam mit Brandenburg) |
| Brandenburg | bildungsserver.berlin-brandenburg.de |
| Bremen | lis.bremen.de (Bildungspläne) |
| Hamburg | hamburg.de (Bildungspläne der Schulbehörde) |
| Hessen | kultusministerium.hessen.de (Kerncurricula) |
| Mecklenburg-Vorpommern | bildung-mv.de (Rahmenpläne) |
| Niedersachsen | cuvo.nibis.de (Kerncurricula) |
| Nordrhein-Westfalen | schulentwicklung.nrw.de (Lehrplannavigator) |
| Rheinland-Pfalz | lehrplaene.bildung-rp.de |
| Saarland | saarland.de (Bildungsserver, Lehrpläne) |
| Sachsen | schulportal.sachsen.de (Lehrplandatenbank) |
| Sachsen-Anhalt | lisa.sachsen-anhalt.de (Lehrpläne und Rahmenrichtlinien) |
| Schleswig-Holstein | fachportal.lernnetz.de (Fachanforderungen) |
| Thüringen | schulportal-thueringen.de (Lehrpläne) |

Stand: 09/2026, zusammengestellt nach dem Deutschen Bildungsserver. Führt eine
Adresse ins Leere, suche nach dem Portalnamen statt zu raten.

Eine gezielte Suche aus Portal, Fach, Schulart und Klassenstufe (etwa
`lehrplanplus.bayern.de Chemie Gymnasium Jahrgangsstufe 9`), dann ein Abruf des
Fachlehrplans. Übernommen werden Kompetenz- oder Lernbereich in der
Formulierung des Landes und die Klassenstufe.

## Style-Block

Steht als ERSTES in body_html, wird **wörtlich** übernommen und setzt das Blatt
auf Grotesk-Schrift, 14 px, rund 25 mm Rand:

```html
<style>
:root{--bg:#fff;--fg:#000;--muted:#555;--rule:#9a9a9a;--accent:#2d82ae;--accent-soft:#e1f1df;--accent-line:#67bb5f;--fig-line:#2d82ae;--fig-line-2:#b05a1e;--fig-grid:#dfe3e8}
body{font-family:"Open Sans","Segoe UI",system-ui,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:18px;color:#000;background:#fff}
article{max-width:40rem;padding:1rem 1rem 2rem;counter-reset:aufgabe equation figure}
header.paper{display:none}
.ab-kopf{border-bottom:1px solid #000;padding-bottom:.55rem;margin:0 0 1.5rem}
.ab-kopf .titel{display:block;font-weight:600;font-size:16px;line-height:21px;margin-bottom:1rem}
.ab-kopf .felder{display:flex;gap:1.6rem;line-height:28px}
.ab-kopf .feld{flex:1 1 auto;display:flex;align-items:baseline;gap:.4rem;white-space:nowrap}
.ab-kopf .feld::after{content:"";flex:1 1 auto;border-bottom:1px solid var(--rule);transform:translateY(-.2em)}
.ab-kopf .feld-datum{flex:0 0 13rem}
h2.abschnitt{color:var(--accent);font-size:17px;line-height:22px;font-weight:600;border-bottom:1px solid #000;padding-bottom:.3rem;margin:1.8rem 0 1.1rem}
.stufe{display:inline-block;color:#000;border:1px solid #000;border-radius:999px;padding:0 .5rem;font-size:12px;margin-right:.4rem;vertical-align:.1em}
.aufgabe{display:grid;grid-template-columns:1.6rem 1fr;margin:0 0 1.5rem;break-inside:avoid;page-break-inside:avoid}
.aufgabe::before{counter-increment:aufgabe;content:counter(aufgabe);grid-column:1;width:18px;height:18px;border:1px solid #000;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:12px;margin-top:1px}
.aufgabe>*{grid-column:2;margin-top:0}
.aufgabe>*+*{margin-top:.6rem}
.aufgabe p{margin:0}
.lead{font-weight:700}
.ab-meta{font-size:12px;color:var(--muted)}
.linien{height:calc(var(--n,4)*1.9rem);background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(1.9rem - 1px),var(--rule) calc(1.9rem - 1px),var(--rule) 1.9rem)}
.hilfe{background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:7px;padding:7px 9px}
.hilfe>b:first-child,.hilfe>strong:first-child{display:block;margin-bottom:.15rem}
.kasten{border:1px solid #000;border-radius:7px;padding:7px 9px}
.wahl{list-style:none;padding-left:0;margin:0}
.wahl li{margin:.3rem 0}
.wahl li::before{content:"\2610";margin-right:.5rem}
.loesungen{break-before:page;page-break-before:always;margin-top:2rem}
table{font-size:14px}
.equation{overflow:visible}
.equation::after{content:none}
.equation .katex-display{padding-right:0}
</style>
```

## Bausteine für body_html

Muster — immer mit echtem Inhalt füllen, nie mit Platzhaltern übernehmen.

**Sonderzeichen direkt schreiben.** Umlaute, ß, Anführungszeichen und Gedankenstriche
als UTF-8-Zeichen, nie als HTML-Entity ausgeben.

**Kopfzeile** (direkt nach dem Style-Block; sie ersetzt die Überschrift, der
Titel erscheint NICHT zusätzlich groß über dem Blatt). Der Titel steht oben,
darunter laufen Name und Datum als **beschreibbare Linien** — genau so
übernehmen, nicht wieder in eine Zeile quetschen:
```html
<div class="ab-kopf">
  <span class="titel">Thema des Blatts</span>
  <div class="felder"><span class="feld">Name:</span><span class="feld feld-datum">Datum:</span></div>
</div>
```
Die Linien entstehen aus dem CSS (`::after`), nicht aus Unterstrichen im Text.
Schreibe also **keine** `___`-Ketten und keine leeren Tabellenzellen dafür.

**Aufgabe** — die Nummer im Kreis setzt die Seite selbst. **Niemals selbst
nummerieren**, sonst steht die Nummer doppelt:
```html
<section class="aufgabe">
  <p><span class="lead">Ergebnisraum:</span> Aufgabentext mit dem Operator am Anfang.</p>
  <p class="ab-meta">Einzelarbeit &middot; 10 Minuten &middot; AFB I</p>
  <div class="linien" style="--n:5"></div>
</section>
```
Der fette Vorspann `<span class="lead">` ist optional und benennt in ein bis
zwei Wörtern, worum es geht.

**Zwischenüberschrift**, mit optionalem Niveau-Kennzeichen:
```html
<h2 class="abschnitt"><span class="stufe">B</span>Ursachen der Revolution</h2>
```

**Weitere Bausteine**
- Schreibraum: `<div class="linien" style="--n:6"></div>` — `--n` ist die Zahl
  der Linien. Eine Linie fasst rund zwölf handgeschriebene Wörter.
- Hilfestellung (grüner Kasten): `<div class="hilfe"><b>Tipp</b>Ein Ansatz …</div>`
- Material, Merksatz oder Zitat: `<div class="kasten">…</div>`
- Ankreuzaufgabe: `<ul class="wahl"><li>Antwort</li>…</ul>`
- Tabelle zum Ausfüllen: `<div class="table-wrap">` um ein `<table>`;
  leere `<td></td>` sind die Felder zum Eintragen
- Formel im Text `\(a^2 + b^2 = c^2\)`, abgesetzt `<div class="equation">$$ … $$</div>`
- **Leerstellen in einer Formel** als `\underline{\hspace{2cm}}`, NICHT als `\qquad`.
  `\qquad` erzeugt nur Abstand: Ein `HCl + NaOH \rightarrow \qquad + \qquad` rendert
  als Pfeil, viel Leere und ein einsames Pluszeichen weit rechts — es sieht kaputt aus
  und zeigt der Klasse nicht, wohin sie schreiben soll (real aufgetreten, 01.09.2026).
  Richtig: `$$HCl_{(aq)} + NaOH_{(aq)} \rightarrow \underline{\hspace{2cm}} + \underline{\hspace{2cm}}$$`
- Grafik (selbst gezeichnet): `<figure class="fig">` + Inline-SVG mit `viewBox`, ohne width/height,
  Farben nur aus `var(--fig-line)`, `var(--fig-line-2)`, `var(--muted)`,
  `currentColor` + `<figcaption>`. Die Nummer („Abbildung N:") setzt die Seite
  selbst. Die `viewBox` lässt seitlich Platz für zentrierte Beschriftungen.
- Bild (nur eigene, mit `generate_image` erzeugte — siehe SKILL.md, Abschnitt
  „Bilder"): reiner Dateiname ohne Pfad, Bild und Blatt landen im selben Ordner.
  ```html
  <figure class="fig">
    <img src="dateiname.jpg" alt="Was zu sehen ist">
    <figcaption>Bildunterschrift, die die Aufgabe stützt</figcaption>
  </figure>
  ```
  Die Nummer („Abbildung N:") setzt die Seite selbst. Breite kommt aus dem
  Seiten-Stil — kein `width`/`height` setzen.
- Lösungen: `<section class="loesungen"><h2 class="abschnitt">Lösungen</h2>…</section>` —
  beginnt automatisch auf einer neuen Seite

**Was nicht geht:** wiederholte Kopf-/Fußzeilen und automatische Seitenzahlen.
Die Kopfzeile steht nur auf Seite 1.


## Aufbau des Blatts

Reihenfolge: Kopfzeile; Lernziel als Ich-kann-Satz im ersten `.kasten`; nötiges
Material; ansteigende Aufgaben; Zusatzaufgabe für Schnelle; Selbsteinschätzung;
Lösungen auf eigener Seite.

**Nur echte Aufgaben bekommen `class="aufgabe"`.** Selbsteinschätzung, Lernziel und
Material sind `.kasten` oder einfache Abschnitte — steckt die Selbsteinschätzung in
einem `.aufgabe`-Block, zählt die Seite sie mit und die Klasse sieht eine Aufgabe 6,
die keine ist (real aufgetreten, 01.09.2026).

**Länge:** Aufgabenteil auf einer Seite, höchstens zwei — mit Niveaustufen
höchstens drei. Plane ein, dass Aufgaben wegen `break-inside: avoid` vollständig
auf die nächste Seite rutschen können.

## Differenzierung in Niveaustufen

Keine getrennten Blätter erzeugen: ein gemeinsamer Materialteil, danach A-, B-
und C-Block mit je zwei bis drei Aufgaben. A arbeitet gestützt am Material
(AFB I–II), B verlangt eigene Einordnung (AFB II), C ein Urteil (AFB III).
Alle Stufen verfolgen dasselbe Lernziel; A erhält Hilfen, kleinere Schritte und
Satzanfänge. Lösungen nach Stufen gruppieren.

## Aufgaben stellen

- **Jede Aufgabe beginnt mit einem Operator:**
  - AFB I (Wiedergeben): nenne, benenne, gib wieder, beschreibe
  - AFB II (Anwenden): erkläre, erläutere, vergleiche, ordne ein, wende an
  - AFB III (Urteilen): beurteile, bewerte, diskutiere, nimm Stellung, entwickle
- Erste Aufgabe AFB I und für alle lösbar; mindestens eine erreicht AFB III.
- Pro Aufgabe **eine** Anforderung; zwei Operatoren werden zwei Aufgaben.
- Jede Aufgabe nennt Sozialform und Zeit; die Summe passt in den Zeitrahmen und
  lässt zehn Minuten Luft.
- Hilfen geben Ansatz, Beispiel oder Satzanfang, nie die halbe Lösung.
- Schreibraum an die erwartete Antwort anpassen; im Zweifel eine Linie mehr.

## Lösungsblatt — Form

- Lösungen selbst nummerieren (`<b>1</b> …`); außerhalb der `.aufgabe`-Blöcke
  entsteht keine Kreisziffer.
- Zuoberst die Lehrplanzeile, sofern ein Bundesland genannt war.
- Bei Rechenaufgaben den Rechenweg, nicht nur das Ergebnis. Mehrere richtige
  Antworten ausdrücklich kennzeichnen.
- Nach Niveaustufen gruppieren, wenn differenziert wurde.
