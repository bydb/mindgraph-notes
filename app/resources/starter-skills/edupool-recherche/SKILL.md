---
name: Edupool-Recherche
description: Unterrichtsmedien im Edupool Hessen für eine Zielgruppe (Grund- und Förderschule ODER weiterführende Schulen) recherchieren und als Notiz mit Mediennummern und Direktlinks aufbereiten — Grundlage für eine Medienliste, den Startseiten-Text und eine Edumap. Setzt den Shell-Zugriff des Agenten mit freigegebenem Netz voraus.
---

# Edupool-Recherche

## Wann anwenden

Wenn zu einem Thema passende Medien aus dem Edupool Hessen gesucht werden sollen,
etwa für eine neue Medienliste oder um eine bestehende Liste zu ergänzen.
Gesucht wird im öffentlichen Gast-Katalog eines Medienzentrums (Standort), ohne
Anmeldung. Die Medienliste selbst legt der Nutzer danach mit seinem Konto an.

## Drei Pflichtprüfungen, bevor du suchst

**1. Shell vorhanden?** Steht `shell_execute` nicht zur Verfügung, brich ab und
nenne zuerst diesen Satz: **„Schalte im Agenten-Lauf den Shell-Zugriff ein und
starte den Lauf neu."** Danach, falls der Schalter fehlt: Einstellungen → Module →
„Agent-Shell", und unter Einstellungen → KI → „Agent-Shell: Schutzgrenzen" bei
„Netzwerk für die Shell" das Netz erlauben. Ohne Shell gibt es keinen Weg in
den Edupool — das Portal braucht eine Sitzung, die eine einzelne Seitenabfrage
nicht hat. Nicht über `web_search` ausweichen.

**2. Standort genannt?** Der Auftrag muss die Standortnummer des Medienzentrums
nennen (die Zahl hinter `standort=` in der Adresse der eigenen
Edupool-Startseite, z. B. 39 für Wiesbaden). Fehlt sie, brich ab und bitte darum.
Nie eine Nummer raten — jeder Standort hat einen anderen Katalog.

**3. Zielgruppe genannt?** Es gibt genau zwei:
- `gs` — Grund- und Förderschule
- `wf` — Weiterführende Schulen

Jede Liste gilt für genau eine davon, nie für beide. Fehlt die Zielgruppe, brich
ab und frage nur danach.

## Schritt 1: Skript bereitstellen

Kopiere das Skript in den Arbeitsordner (den Skill-Ordner nennt `use_skill`):

```
cp "<Skill-Ordner>/scripts/edupool_suche.py" . && python3 edupool_suche.py --help
```

Meldet das „Operation not permitted" (die Shell darf nur Anhänge lesen), lies
`scripts/edupool_suche.py` mit `read_skill_file` und schreibe den Inhalt
unverändert in den Arbeitsordner:

```
cat > edupool_suche.py <<'PY'
<Inhalt der Datei, unverändert>
PY
python3 edupool_suche.py --help
```

Das Skript fragt den Edupool nur lesend ab und wertet die Antworten aus. Ändere es
nicht; scheitert es, melde die Fehlermeldung.

## Schritt 2: Suchen

Lege 3 bis 6 **themenspezifische** Suchbegriffe fest: das Thema,
Schreibvarianten (Photosynthese / Fotosynthese), eng zugehörige Fachbegriffe
(Chlorophyll). Ein Begriff pro Wort — das Portal sucht nach Wortanfängen, ganze
Sätze finden nichts.

**Keine Allerweltswörter** wie „Pflanzen", „Blatt", „Sauerstoff", „Wasser",
„Tiere": sie bringen Tausende Treffer zu fremden Themen (real: „Pflanzen" 2280),
füllen die Liste mit Ameisen- und Herzfilmen und verdrängen die passenden Titel.
Ein Begriff mit mehr als 500 Treffern ist fast immer zu allgemein.

**Umlaute und ß so schreiben, wie sie im Wort stehen** (Blüte, Bestäubung,
Ernährung), nie als ae/oe/ue/ss umschreiben — der Katalog kennt nur die echte
Schreibweise (real: „Bestaeubung" 0 Treffer). Meldet das Skript `HINWEIS: …
Umlaute`, suche den Begriff richtig geschrieben neu.

Rufe die Suche mit **höchstens drei Begriffen pro Befehl** auf und setze
`timeout_ms` auf 120000. Weitere Aufrufe mit derselben `--out`-Datei sammeln
dazu, doppelte Treffer werden zusammengeführt:

```
python3 edupool_suche.py suche --standort 39 --begriffe Fotosynthese Photosynthese Chlorophyll --out treffer.json
```

Ausgaben und was sie bedeuten:
- `OK: …` — weiter.
- `PORTAL-FEHLER: …` — die Schnittstelle antwortet nicht mehr wie erwartet. Brich
  ab, nenne die Meldung wörtlich, **erfinde keine Treffer**. Die Schnittstelle ist
  nicht dokumentiert und kann sich mit jedem Edupool-Update ändern.
- `NETZ-FEHLER: …` — meist ist das Netz für die Shell gesperrt (siehe Prüfung 1).

## Schritt 3: Sichten

Immer mit `--stichwort` — Wortanfänge des Themas, klein geschrieben, die in
Titel, Beschreibung oder Fächern vorkommen müssen:

```
python3 edupool_suche.py zeige treffer.json --zielgruppe gs --stichwort fotosynth photosynth chlorophyll
```

Die Ausgabe ist eine nummerierte Liste nur der angefragten Zielgruppe und nur der
Titel, die zu den Stichworten passen: Titel, Medienart, Laufzeit, Jahr,
Mediennummer, Adressaten, Anfang der Beschreibung. FWU-Module derselben
Produktion sind zu einer Zeile `[Reihe: n Teile; passend: …]` zusammengefasst;
„passend" nennt die Folgen, die das Thema behandeln. Die Nummern sind fest und
gelten so für `notiz`, auch wenn Lücken in der Zählung sind.

Sind es zu wenige Treffer, ergänze ein Stichwort (z. B. einen Unterbegriff) und
rufe `zeige` erneut auf. Ohne `--stichwort` nur, wenn das Thema kein eigenes Wort
hat. Einträge ohne Adressaten-Feld zeigt `--offene`.

**Lies `treffer.json` nicht mit eigenen Befehlen aus** (kein `cat`, kein eigenes
Python). Die Datei ist groß, jeder Auszug kostet Kontext, und ein voller Kontext
beendet den Lauf, bevor die Notiz entsteht. Alles Nötige liefert `zeige`.

Die Zuordnung zur Zielgruppe macht das Skript nach dem Adressaten-Feld, nicht
nach Gefühl: Untergrenze Klasse 1–4 oder „Sonderpädagogische Förderung" →
Grund- und Förderschule; ab Klasse 5, Berufsbildende Schule, Erwachsenenbildung →
weiterführend; „bis Jahrgangsstufe 6" zählt zu beiden. Spannen wie „Klasse 3–10"
erscheinen in beiden Listen. Einträge ohne erkennbare Zielgruppe (Adressaten
fehlen, Lehrerfortbildung, „sonstiges") sind ausgeblendet — nimm sie höchstens
als Grenzfall auf.

Wähle dann nach Titel und Beschreibung aus, **nur Nummern aus der gefilterten
`zeige`-Liste**:
- **Kern** — behandelt das Thema selbst und passt zur Zielgruppe. Lieber 4 gute
  als 15 lose. Für Grund- und Förderschule gibt es zu Fachthemen oft nur wenige
  Titel — dann ist die Liste eben kurz, und die Einordnung sagt das.
- **Grenzfälle** — berührt das Thema erkennbar am Rand (z. B. eine Reihe, in der
  nur eine Folge davon handelt).
- Ein Titel ohne Bezug zum Thema gehört nirgends hin, auch nicht als Grenzfall.
- Jede Nummer nur einmal.

Von mehreren Fassungen desselben Titels (Film, Online-Medium, „interaktiv")
nimm in den Kern die, die für die Zielgruppe am brauchbarsten ist, die anderen
höchstens als Grenzfall.

## Schritt 4: Notiz erzeugen

Die Tabelle baut das Skript aus den Nummern der `zeige`-Liste — schreibe sie
**nicht** selbst ab, sonst verrutschen Mediennummern und Links:

```
python3 edupool_suche.py notiz treffer.json --zielgruppe gs --thema "Fotosynthese" --kern 1,4,7 --rand 9 --out edupool-fotosynthese-gs.md
```

Hänge danach eine kurze Einordnung an (`cat >> … <<'MD'`), unter `## Einordnung`:
- 3 bis 8 Sätze, sachlich, ohne Werbesprache, an die Lehrkräfte der Zielgruppe
  gerichtet.
- Was die Kernauswahl abdeckt, wofür sich einzelne Titel eignen (Einstieg,
  Erarbeitung, Wiederholung), was fehlt oder nur in Grenzfällen vorkommt.
- Reihen als Reihe nennen, nicht jede Folge.
- **Nur Aussagen, die in der `zeige`-Zeile stehen** (Titel, Beschreibung,
  Adressaten, passende Folgen). Was ein Medium behandelt, nur so weit die
  Beschreibung es sagt — nicht aus dem Titel weiterdenken („berührt Sauerstoff
  und Kohlendioxid" steht in keiner Beschreibung des Gase-Checks).
- **„Was fehlt" nur als Befund über die Trefferliste** („kein Titel für Klasse
  1–2", „nur zwei Reihen zum Thema"), nie als Vermutung über Bedarfe, die die
  Liste nicht zeigt (z. B. einzelne Förderschwerpunkte).

Biete die Datei mit `shell_stage_file` als Ergebnis an.

## Was die Notiz bewusst nicht tut

- **OER-Treffer** (Sodix) werden standardmäßig nur gezählt. Verlangt der Auftrag
  OER („mit OER", „auch freie Materialien"), rufe `zeige … --oer` auf: die
  passenden OER der Zielgruppe stehen dann unter eigenen Nummern `O1, O2, …`.
  Wähle die thematisch passenden und übergib sie mit
  `notiz … --oer 9,14`; die Notiz bekommt den Abschnitt „OER-Material (frei
  verfügbar)" mit Direktlink, ohne Mediennummer. OER gehören nie in Kern oder
  Grenzfälle.
- **Titel der anderen Zielgruppe** werden weggelassen und nur gezählt.
- **Mediennummer** ist nur die Nummer mit 55 am Anfang. Titel ohne solche Nummer
  (z. B. Studyflix) haben keine Nummer — nicht ergänzen.
- **Lizenzlage**: Die Gast-Sitzung zeigt den Katalog, nicht, was das eigene Konto
  freigeschaltet hat. Der Hinweis steht in der Notiz.

## Danach: Startseiten-Text und Edumap (eigener Lauf)

Nicht in diesem Lauf. Sage in der Abschlussnachricht, wie es weitergeht:

1. Mediennummern aus der Notiz nach dem Anmelden in die Edupool-Suche kopieren
   und die Medienliste anlegen.
2. Neuer Agent-Lauf mit der Notiz als Anhang: **„Schreibe den Text für den
   Artikel auf der Edupool-Startseite"** — kurz, sachlich, Zielgruppe nennen,
   nur Titel aus der Notiz.
3. Optional neuer Lauf mit dem Skill „Edumap erstellen" und der Notiz als Anhang.
   Bewährter Aufbau: erste Spalte „Worum geht's?" (Einführung, Zugang, Freigabe,
   Gut zu wissen), danach Sachspalten nach Zugang zum Thema oder Medienart. Der
   Map-Titel nennt die Zielgruppe. Für die Zugangs-Box die Adressen des eigenen
   Standorts nehmen (`https://hessen.edupool.de/home?standort=<N>&login=1`) und
   auf die Kachel „Edupool / Medienzentrum" im Schulportal Hessen hinweisen.
   Freigabe-Box: Detailansicht des Mediums öffnen, „Dieses Medium befristet
   freigeben", Zugang an die Lerngruppe weitergeben (gilt 14 Tage).
   Kontaktadresse nur, wenn sie im Auftrag steht.

Coverbilder kommen beim Edumap-Import nicht mit; sie müssen nach dem Import von
Hand in die Boxen.

## Abschlussnachricht

Zwei bis vier Sätze: Standort, Zielgruppe, Suchbegriffe, Zahl der Kern- und
Grenzfall-Titel, und die nächsten Schritte von oben. Gab es Einträge ohne
Adressaten-Feld, sag das.
