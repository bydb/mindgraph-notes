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

Lege 4 bis 10 Suchbegriffe fest: das Thema, Schreibvarianten (Photosynthese /
Fotosynthese), Ober- und Unterbegriffe, gängige Fachbegriffe der Zielgruppe.
Ein Begriff pro Wort oder kurzer Wortgruppe — das Portal sucht nach Wortanfängen,
ganze Sätze finden nichts.

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

```
python3 edupool_suche.py zeige treffer.json --zielgruppe gs
```

Die Ausgabe ist eine nummerierte Liste nur der angefragten Zielgruppe: Titel,
Medienart, Laufzeit, Jahr, Mediennummer, Adressaten, Anfang der Beschreibung.
FWU-Module derselben Produktion sind schon zu einer Zeile `[Reihe: n Teile]`
zusammengefasst. Bei langer Liste steht am Ende der Befehl für die Fortsetzung
(`--ab N`) — lies alles, bevor du auswählst.

Die Zuordnung zur Zielgruppe macht das Skript nach dem Adressaten-Feld, nicht
nach Gefühl: Untergrenze Klasse 1–4 oder „Sonderpädagogische Förderung" →
Grund- und Förderschule; ab Klasse 5, Berufsbildende Schule, Erwachsenenbildung →
weiterführend. Spannen wie „Klasse 3–10" erscheinen in beiden Listen. Einträge
ohne Adressaten-Feld stehen am Ende mit „Adressaten fehlen" — nimm sie höchstens
als Grenzfall auf.

Wähle dann nach Titel und Beschreibung aus:
- **Kern** — passt direkt zum Thema und zur Zielgruppe. In der Regel 5 bis 20.
- **Grenzfälle** — berührt das Thema nur am Rand oder Adressaten fehlen.
- Alles andere lässt du weg.

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
- Nur Aussagen, die aus Titel, Beschreibung und Adressaten der `zeige`-Liste
  folgen. Keine Inhalte erfinden, die dort nicht stehen.

Biete die Datei mit `shell_stage_file` als Ergebnis an.

## Was die Notiz bewusst nicht tut

- **OER-Treffer** (Sodix) werden nur gezählt, nicht aufgelistet. Fragt der Auftrag
  ausdrücklich danach, nenne sie in der Einordnung zusammengefasst.
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
