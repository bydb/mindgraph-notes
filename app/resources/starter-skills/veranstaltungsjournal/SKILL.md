---
name: Veranstaltungsjournal
description: Ein Teilnehmenden-Journal für eine Veranstaltung als druckfertige A5-Broschüre erstellen — Leitfrage als Klammer, Dramaturgie vom Ich zum Wir, Farbcode je Phase, Hinweis „privat / zum Austausch / wird geteilt“ bei jeder Aufgabe. Ergebnis ist eine HTML-Seite im MindGraph-Stil mit Druckansicht als A5-Seiten oder als A4-Broschüre zum Falten und Heften.
---

# Veranstaltungsjournal (A5-Broschüre)

## Was entsteht

Ein Heft, das die Teilnehmenden durch die Veranstaltung begleitet: Jede Programmphase hat ihre
Seite(n), jede Aufgabe sagt, wer sie bearbeitet und was mit den Notizen geschieht, und eine
Leitfrage spannt den Bogen von der ersten bis zur letzten Seite. Ausgabe: EINE HTML-Datei mit
`write_html`, jede Seite exakt A5 (148 × 210 mm), druckbar als gefaltete Broschüre.

## Schritt 1: Programm verstehen

Lies die Quelle vollständig (Notiz mit Ablauf, Anhang, Ausschreibung). Sammle:
Veranstalter, Titel, Datum, Ort, Zielgruppe, Leitfrage, Programmpunkte mit Methode und Sozialform,
Pinnwand-/Edumap-Link, Literatur. Fehlt die Leitfrage, formuliere EINE offene, handlungsbezogene
Frage aus Titel und Ziel. Fehlende Angaben (Ort, Link) als `[Ort]`, `[Link]` stehen lassen — nie erfinden.

## Schritt 2: Dramaturgie festlegen (fünf Stufen)

Ordne jeden Programmpunkt einer Stufe zu. Jede Stufe erweitert den sozialen Radius:

| Klasse | Stufe (Standard) | Sozialer Radius | Beispiel-Methoden |
|---|---|---|---|
| `p1` | 1 · ICH | allein reflektieren | Selbsteinschätzung, Modell, eigener Satz |
| `p2` | 1 · ICH UND DU | zu zweit schärfen | Walk and Talk, Partnerinterview |
| `p3` | 2 · WIR | Gruppe verdichtet | Golden Circle, Plakat, Cluster |
| `p4` | 3 · ALLE | Plenum teilt | Galerie, drei Sätze, Bedarfsmatrix |
| `p5` | 4 · GEMEINSAM | mit Gästen/Partnern weiter | Impuls, Fishbowl, Teamarbeit, Vision |

Die Stufen dürfen zum Programm passend umbenannt werden (z. B. ANKOMMEN · ENTDECKEN · VERTIEFEN ·
TEILEN · WEITERGEHEN), die Reihenfolge vom Ich zum Wir bleibt. Einstieg, Tagesübersicht, Schluss
und Weiterarbeit stehen in der Rahmenfarbe (keine Klasse).

## Schritt 3: Seitenplan

Feste Klammer (immer): Deckblatt · Leitfrage-Impulse · S. 1 Zum Journal · S. 2 Der Tag ·
S. 3 Check-in · … Phasenseiten … · Zurück zur Leitfrage · Wie es weitergeht · Notizen · Rückseite.

Dazwischen pro Programmpunkt 1–2 Phasenseiten aus den Bausteinen unten. **Gesamtzahl der Seiten
muss durch 4 teilbar sein** (12, 16, 20, 24) — sonst mit Notizen-Seiten auffüllen. Höchstens 28 Seiten.
Seitenzahlen in der Fußzeile: Deckblatt, Innenumschlag und Rückseite ohne Zahl, danach ab 1 zählen.

Pflicht auf jeder Phasenseite unter dem Titel: `Sozialform · Sichtbarkeit`, wobei Sichtbarkeit genau
eines ist: **privat** (niemand sammelt ein), **zum Austausch** (Person entscheidet, was sie teilt),
**wird geteilt** (fließt in Plakat, Pinnwand oder Karte). Setze Rückverweise mit Seitenzahl, wo Seiten
aufeinander aufbauen („Ihr Satz steht auf S. 6“). Die Schluss-Seite vergleicht mit der ersten Antwort auf S. 2.
Kommen später Gäste dazu, bekommt deren erste Seite eine Begrüßungsbox mit Verweis auf S. 1.

## Schritt 4: HTML schreiben

`write_html` genau einmal: `file_name` = `journal-<kurzname>.html`, `title` = Veranstaltungstitel,
`body_html` = zuerst der Stil-Block unten **wörtlich und vollständig**, danach alle Seiten.
Ganz am Ende von `body_html` steht der Broschüren-Block unten, ebenfalls **wörtlich und vollständig**.
Nur die Bausteine unten verwenden, keine eigenen Stile, kein `$`-Zeichen, keine weiteren Skripte.
Jede Seite ist ein `<section class="seite …">`. Fläche einer Seite: ca. 24 Linien-Einheiten
(Kopf ≈ 4, eine Frage ≈ 1, `--n:5` ≈ 5). Lieber eine Seite mehr als eine überfüllte —
was nicht passt, wird abgeschnitten.

### Stil-Block (wörtlich übernehmen)

```html
<style>
@page{size:148mm 210mm;margin:0}
:root{color-scheme:light;--rahmen:#0b5254;--rahmen-h:#e4efef;--linie:#d6d1c7;--text:#1c1a17;--grau:#5c574e}
html,body{background:#ece8e1!important;margin:0}
article{max-width:none!important;padding:0!important}
header.paper,.ai-provenance{display:none!important}
.seite{--f:var(--rahmen);--h:var(--rahmen-h);width:148mm;height:210mm;box-sizing:border-box;padding:11mm 13mm 16mm;margin:6mm auto;background:#fff;color:var(--text);font:9.5pt/1.35 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;position:relative;overflow:hidden;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact;box-shadow:0 1mm 4mm rgba(0,0,0,.12)}
.seite *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{html,body{background:#fff!important}.seite{margin:0;box-shadow:none}}
.p1{--f:#10696b;--h:#e4efef}.p2{--f:#3f7f5a;--h:#e3efe6}.p3{--f:#c27a36;--h:#f8ebdc}.p4{--f:#6a4c7d;--h:#ece4f0}.p5{--f:#0b5254;--h:#e4efef}
.seite p{margin:0 0 2.5mm}
.band{background:var(--f);color:#fff;font-weight:700;font-size:7.5pt;letter-spacing:.08em;padding:1.5mm 2.5mm;margin:0 0 4mm}
.titel{font-size:17pt;font-weight:700;margin:0;line-height:1.15}
.modus{font-style:italic;color:var(--grau);font-size:8pt;margin:.8mm 0 3.5mm!important}
.frage{font-weight:700;margin:3.5mm 0 0!important}
.hinweis{font-style:italic;color:var(--grau);font-size:8pt;font-weight:400}
.linien{height:calc(var(--n,3)*7.5mm);background:repeating-linear-gradient(to bottom,transparent 0 7.2mm,var(--linie) 7.2mm 7.5mm);margin-bottom:2mm}
.box{background:var(--h);padding:2.5mm 3.5mm;margin:3mm 0}
.box.leit{background:var(--rahmen-h);font-weight:700;font-size:11pt}
.kicker{display:block;font-size:6.5pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--grau);margin-bottom:1mm}
.rahmen{border:.4mm solid var(--f);padding:1mm 3mm;margin:2mm 0}
.gestrichelt{border:.4mm dashed var(--text);padding:2.5mm 3.5mm;margin:3mm 0}
.seite table{font-size:9pt}
table.raster{width:100%;border-collapse:collapse;margin:2mm 0}
table.raster th{width:32%;background:var(--h);text-align:left;vertical-align:top;padding:2mm 2.5mm;font-size:9pt;color:var(--f);border-top:.3mm solid var(--linie)}
table.raster th small{display:block;font-weight:400;color:var(--grau);font-size:7pt;margin-top:.8mm}
table.raster td{border-top:.3mm solid var(--linie);padding:0 0 0 3mm;vertical-align:top}
table.raster tr:last-child>*{border-bottom:.3mm solid var(--linie)}
table.gitter{width:100%;border-collapse:collapse;margin:2mm 0;font-size:8pt}
table.gitter th{background:var(--h);font-size:7.5pt;padding:1.5mm}
table.gitter td,table.gitter th{border:.3mm solid var(--linie);height:7mm;text-align:center}
table.gitter td:first-child,table.gitter th:first-child{text-align:left;padding-left:2mm;width:42%}
table.gitter td.k::after{content:"";display:inline-block;width:2.6mm;height:2.6mm;border:.3mm solid var(--grau)}
ul.kreuz{list-style:none;padding:0;margin:1.5mm 0 2.5mm;columns:2;column-gap:5mm}
ul.kreuz.eins{columns:1}
ul.kreuz li{break-inside:avoid;padding-left:4.5mm;text-indent:-4.5mm;margin-bottom:.8mm}
ul.kreuz li::before{content:"";display:inline-block;width:2.6mm;height:2.6mm;border:.3mm solid var(--grau);margin-right:1.9mm;vertical-align:-.3mm}
ul.kreuz li.leer::after{content:"";display:inline-block;width:80%;border-bottom:.3mm solid var(--linie)}
.spalte{color:var(--f);font-weight:700;break-after:avoid}
table.tag{width:100%;border-collapse:separate;border-spacing:0 .8mm;margin:0 0 1mm}
table.tag th{color:#fff;text-align:left;padding:1.8mm 2.5mm;width:30%;font-size:8pt}
table.tag td{padding:1.8mm 2.5mm;font-size:8.5pt}
table.tag th{background:var(--f)}table.tag td{background:var(--h)}
.klein{font-size:7pt;color:var(--grau)}
.zwei{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.qr{display:flex;gap:4mm;align-items:flex-start;margin:3mm 0}
.qr .feld{flex:0 0 22mm;height:22mm;border:.4mm dashed var(--text);display:flex;align-items:center;justify-content:center;font-size:7pt;color:var(--grau);text-align:center}
.punkte{height:150mm;background-image:radial-gradient(circle,var(--linie) .35mm,transparent .45mm);background-size:5mm 5mm;margin-top:3mm}
.fuss{position:absolute;left:0;right:0;bottom:7mm;text-align:center;font-size:6.5pt;color:var(--grau)}
.deck{padding-top:20mm}
.deck .org{font-size:8pt;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--grau);margin-bottom:3mm!important}
.deck .block{background:var(--rahmen);color:#fff;height:72mm;padding:8mm 6mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end}
.deck .block h1{font-size:30pt;margin:0 0 3mm;letter-spacing:-.01em;color:#fff}
.deck .block p{margin:0;font-size:9.5pt;color:#fff}
.leiste{margin:7mm 0 8mm!important;font-weight:700;font-size:8.5pt;letter-spacing:.1em}
.leiste span{white-space:nowrap}.leiste i{font-style:normal;color:var(--grau);margin:0 1.5mm}
.leiste .p1,.leiste .p2,.leiste .p3,.leiste .p4,.leiste .p5{color:var(--f)}
.deck .lf{font-size:13pt;font-weight:700;line-height:1.3}
.besitz{position:absolute;left:13mm;right:13mm;bottom:28mm;border-bottom:.3mm solid var(--linie);height:12mm}
.rueck .unten{position:absolute;left:0;right:0;bottom:0;height:40mm;background:var(--rahmen);color:#fff;padding:9mm 13mm;box-sizing:border-box}
</style>
```

### Broschüren-Block (wörtlich übernehmen, als Letztes in body_html)

Er setzt eine Leiste über das Journal: „A5-Einzelseiten“ oder „Broschüre A4“. In der Broschüren-Ansicht
stehen je zwei A5-Seiten nebeneinander auf einem A4-Querbogen, schon in Heftreihenfolge (Rückstich);
fehlende Seiten bis zur durch 4 teilbaren Zahl ergänzt er als Leerseiten vor der Rückseite.

```html
<style>
@page bogen{size:297mm 210mm;margin:0}
.werkzeug{position:sticky;top:0;z-index:9;display:flex;gap:2mm;align-items:center;justify-content:center;flex-wrap:wrap;padding:2.5mm;background:#0b5254;color:#fff;font:9pt -apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
.werkzeug button{font:inherit;font-weight:700;border:0;border-radius:1.5mm;padding:1.6mm 3.5mm;background:#fff;color:#0b5254;cursor:pointer}
.werkzeug button.an{background:#c27a36;color:#fff}
.werkzeug span{opacity:.85}
.bogen{page:bogen;display:flex;width:297mm;height:210mm;margin:6mm auto;break-after:page;background:#fff;box-shadow:0 1mm 4mm rgba(0,0,0,.12);position:relative}
.bogen .seite{margin:0!important;box-shadow:none!important;break-after:auto}
.bogen::after{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:.2mm dashed #c9c3b8}
.seite.leer{background:#fff}
@media print{.werkzeug{display:none!important}.bogen{margin:0;box-shadow:none}.bogen::after{display:none}}
</style>
<div class="werkzeug"><button type="button" id="mg-a5" class="an" onclick="mgBroschuere(false)">A5-Einzelseiten</button><button type="button" id="mg-a4" onclick="mgBroschuere(true)">Broschüre A4</button><span id="mg-info">Druck: A5, Ränder keine, Hintergrundgrafiken an</span></div>
<script>
var mgSeiten=null;
function mgBroschuere(an){
  var a=document.querySelector('article')||document.body;
  if(!mgSeiten)mgSeiten=[].slice.call(document.querySelectorAll('.seite'));
  mgSeiten.forEach(function(p){a.appendChild(p)});
  [].slice.call(document.querySelectorAll('.bogen,.seite.leer')).forEach(function(e){e.remove()});
  document.getElementById('mg-a5').className=an?'':'an';
  document.getElementById('mg-a4').className=an?'an':'';
  document.getElementById('mg-info').textContent=an?'Druck: A4 quer, beidseitig an der kurzen Kante, Ränder keine, Hintergrundgrafiken an. Dann falten und mittig heften.':'Druck: A5, Ränder keine, Hintergrundgrafiken an';
  if(!an)return;
  var s=mgSeiten.slice();
  while(s.length%4){var e=document.createElement('section');e.className='seite leer';s.splice(s.length-1,0,e)}
  var n=s.length;
  for(var i=0;i<n/4;i++){
    [[n-1-2*i,2*i],[2*i+1,n-2-2*i]].forEach(function(pr){
      var b=document.createElement('div');b.className='bogen';
      b.appendChild(s[pr[0]]);b.appendChild(s[pr[1]]);a.appendChild(b);
    });
  }
}
if(/broschuere/.test(location.hash))document.addEventListener('DOMContentLoaded',function(){mgBroschuere(true)});
</script>
```

### Bausteine (Muster — immer mit echtem Inhalt füllen, nie `…` stehen lassen)

**Deckblatt** (Rahmenfarbe, ohne Fußzeile):
```html
<section class="seite deck">
<p class="org">Veranstalter</p>
<div class="block"><h1>MEIN JOURNAL</h1><p>Titel der Veranstaltung</p><p>Datum</p><p>Ort</p></div>
<p class="leiste"><span class="p1">ICH</span><i>·</i><span class="p2">ICH UND DU</span><i>·</i><span class="p3">WIR</span><i>·</i><span class="p4">ALLE</span><i>·</i><span class="p5">GEMEINSAM</span></p>
<span class="kicker">Leitfrage des Tages</span><p class="lf">Leitfrage?</p>
<div class="besitz"><span class="kicker">Dieses Journal gehört</span></div>
</section>
```

**Kopf jeder Innenseite** (Phasenklasse `p1`–`p5` an die section, Rahmenseiten ohne Klasse):
```html
<section class="seite p3">
<div class="band">2 · WIR · Wofür wir handeln</div>
<h2 class="titel">Seitentitel</h2>
<p class="modus">Gruppen · wird geteilt (Plakat)</p>
<!-- Inhalt -->
<div class="fuss">Veranstalter | Veranstaltung · 9</div>
</section>
```

**Frage mit Schreiblinien** (`--n` = Zahl der Linien):
`<p class="frage">Frage? <span class="hinweis">kurzer Hinweis</span></p><div class="linien" style="--n:5"></div>`

**Info-Box** (getönt, Phasenfarbe): `<div class="box"><span class="kicker">So sprechen wir</span><p>Regeln…</p></div>`
**Leitfrage-Box**: `<div class="box leit"><span class="kicker">Leitfrage des Tages</span>Leitfrage?</div>`

**Label-Tabelle** (Feld links, Schreibfläche rechts):
```html
<table class="raster">
<tr><th>Überzeugungen<small>Wovon bin ich überzeugt?</small></th><td><div class="linien" style="--n:4"></div></td></tr>
<tr><th>Mission<small>Was treibt mich an?</small></th><td><div class="linien" style="--n:4"></div></td></tr>
</table>
```

**Ankreuzliste** (zweispaltig; `class="kreuz eins"` einspaltig; `li class="leer"` = freie Zeile):
`<ul class="kreuz"><li>Option A</li><li>Option B</li><li class="leer"></li></ul>`
Zwei Gruppen nebeneinander: `<div class="zwei"><div><p class="spalte">Erfahrungen</p><ul class="kreuz eins">…</ul></div><div>…</div></div>`

**Skala/Matrix** (`td class="k"` = Kästchen, leeres `td` = Feld für ○/●):
```html
<table class="gitter"><tr><th>Thema</th><th>1</th><th>2</th><th>3</th><th>4</th><th>nächster Schritt</th></tr>
<tr><td>Modul 1: Thema</td><td></td><td></td><td></td><td></td><td class="k"></td></tr></table>
```

**Ergebnis-Rahmen**: `<p class="frage">Unser Satz:</p><div class="rahmen"><div class="linien" style="--n:3"></div></div>`
**Perspektive** (gestrichelt): `<div class="gestrichelt"><span class="kicker">Aus der anderen Perspektive</span><p>Auftrag</p><div class="linien" style="--n:3"></div></div>`
**Tagesübersicht** (S. 2, eine Zeile je Stufe):
`<table class="tag"><tr class="p1"><th>1 · ICH</th><td>Die eigene Rolle …</td></tr>…</table>`
**QR/Pinnwand** (S. 1): `<div class="qr"><div class="feld">QR-Code einkleben</div><div><b>Alles an einem Ort</b><p>Was hinter dem Code liegt. Link</p></div></div>`
**Zeichenfläche**: `<div class="punkte"></div>` · **Rückseite**: `<section class="seite rueck"><div class="unten"><b>Veranstalter</b><p>Kontakt</p></div></section>`

## Inhalte der festen Seiten

- **Leitfrage-Impulse** (Innenumschlag): Leitfrage als Titel, „Erste Impulse und Gedanken dazu“, `--n:20`.
- **S. 1 Zum Journal**: Titel „So arbeiten Sie mit diesem Journal“; ein Satz, wozu das Heft dient;
  Label-Tabelle mit privat / zum Austausch / wird geteilt (je eine Zeile Erklärung statt Linien:
  `<td><p>…</p></td>`); Haltungssätze „Schreiben Sie in Stichworten. Unfertiges ist erwünscht.
  Keine Seite muss voll werden. Die Folien nennen Ihnen jeweils die passende Seite.“; QR-Block;
  Gitter „Kontakte, die ich weiterpflegen möchte“ (Name · Bereich · Darüber möchte ich weitersprechen, 6 leere Zeilen).
- **S. 2 Der Tag**: Tagesübersicht mit allen Stufen, Leitfrage-Box, „Einzeln · privat“, „Meine erste, spontane Antwort:“ `--n:9`.
- **S. 3 Check-in**: drei kurze Fragen zum Ankommen (z. B. eine Stärke von mir, das habe ich zuletzt neu gelernt, was ich mitnehmen möchte).
- **Zurück zur Leitfrage**: Leitfrage-Box; „Meine Antwort jetzt“ mit Hinweis „Vergleichen Sie mit S. 2“;
  Rückbezug auf das zentrale Ergebnis vom Vormittag mit Seitenzahl; „Mein Satz für die Schlussrunde“.
- **Wie es weitergeht**: Box zur Pinnwand, Hinweis auf Evaluation, „Zum Weiterlesen“ (nur Quellen aus
  dem Programm, sonst weglassen), Notizen.

## Regeln

- Sie-Form, kurze Sätze, keine Emojis. Kopfband in Versalien nur für Stufenname: `2 · WIR · Wofür wir handeln`.
- Theorie höchstens 2–4 Sätze pro Seite, mit Autor und Jahr, nur wenn das Programm sie nennt.
- Jede Seite braucht eine Fußzeile außer Deckblatt, Innenumschlag, Zeichenfläche und Rückseite.
- Keine Personennamen von Teilnehmenden, keine Logos oder Wappen von Institutionen (Platzhalter `[Logo]`).

## Abschluss an den Nutzer

Nenne kurz Seitenzahl und Seitenplan (Seite → Programmpunkt). Druckhinweis in zwei Sätzen:
„Datei im Browser öffnen. Zum Kopieren im Medienzentrum oben ‚Broschüre A4‘ wählen und drucken: A4 quer,
beidseitig an der kurzen Kante, Ränder keine, Hintergrundgrafiken an — dann den Stapel falten und mittig heften.
Für ein digitales PDF ‚A5-Einzelseiten‘ wählen.“
