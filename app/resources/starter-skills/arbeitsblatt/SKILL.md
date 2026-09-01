---
name: Arbeitsblatt
description: Ein am Netz belegtes, unterrichtstaugliches Arbeitsblatt als HTML-Seite erstellen — mit Lehrplanbezug des angegebenen Bundeslandes, Aufgaben, Schreibraum, Differenzierung und vollständigem Lösungsblatt. Setzt eingeschaltete Webrecherche voraus (Globus im Agenten-Lauf). Im Editor als PDF ausgebbar.
---

# Arbeitsblatt erstellen

## Wann anwenden

Wenn ein Arbeitsblatt für den Unterricht entstehen soll: Einstieg, Übung,
Vertiefung, Hausaufgabe, Test-Vorbereitung. Quelle können ein Thema, eine
Notiz, ein Text oder ein Anhang sein.

## Zwei Pflichtschritte, bevor du irgendetwas entwirfst

**1. Webrecherche prüfen.** Stehen `web_search` und `web_fetch` zur Verfügung?
Fehlt eines von beiden, brich hier ab: kein Arbeitsblatt, auch keines mit
Warnhinweis, und kein Schreib-Werkzeug. Nenne stattdessen ZUERST diesen Satz,
denn er ist die eigentliche Handlung: **„Schalte den Globus in der Agenten-Leiste
ein und starte den Lauf neu."** Erst danach, und nur falls der Globus fehlt oder
ausgegraut ist, die Einstellungen: Modul unter Einstellungen → Module →
„Webrecherche", Suchmaschine unter Einstellungen → KI & Modelle → Webrecherche.

Der Grund steht nicht zur Disposition: Ein Sprachmodell merkt nicht, wenn es
sich irrt. Eine falsche Jahreszahl sieht genauso überzeugt aus wie das Richtige
— und eine ganze Klasse lernt den Fehler mit.

**2. `references/vorlage.md` mit `read_skill_file` lesen.** Dort stehen die
Lehrplan-Portale der Bundesländer, der Stil-Block, die Bausteine für `body_html`
und die Aufgabenlehre. Nichts davon aus dem Gedächtnis nachbauen: Ohne den
wörtlich übernommenen Stil-Block hat das Blatt keine Schreiblinien, keine
Aufgabennummern und keinen Kopf.

## Format und Umfang

**write_html**, genau einmal und erst nach der Qualitätsprüfung — ein
Arbeitsblatt braucht Layout, das Markdown nicht kann. Der Editor hat für HTML
einen PDF-Knopf (A4). Dateiname: `Arbeitsblatt - [Fach] - [Thema].html`

- **Ein Blatt pro Lauf.** Drei Niveaustufen heißt drei Aufgabenblöcke auf einem
  Blatt, nicht drei vollständige Arbeitsblätter.
- **Höchstens acht Aufgaben** insgesamt, über alle Stufen zusammen.
- Lange Quellentexte werden zusammengefasst, nicht abgedruckt.
- Eine breite Grundlagenrecherche kann als eigener Lauf vorgeschaltet werden.
  Die Prüfung der tatsächlich verwendeten Aussagen bleibt Pflicht in diesem Lauf.

## Lehrplanbezug

**Steht im Auftrag ein Bundesland, schlägst du den Lehrplan nach — immer.** Ein
Arbeitsblatt ohne Lehrplanbezug ist eine Themenseite; erst der Bezug macht es
unterrichtstauglich. Portalliste und Suchmuster stehen in `references/vorlage.md`.

- Reserviere dafür **eine Suche und einen Abruf** im Budget, bevor du mit der
  Sachrecherche beginnst.
- In den Lösungsteil kommt eine Zeile: Kompetenz- oder Lernbereich in der
  Formulierung des Landes, Klassenstufe, Quelle.
- **Erfinde keinen Kompetenzbezug.** Findest du den Fachlehrplan nicht oder
  bleibt die Zuordnung unklar, schreibst du ohne Lehrplanzeile und benennst die
  Lücke am Ende. Ein falscher Bezug fällt beim Durchsehen nicht auf.
- **Ohne genanntes Bundesland wird keines geraten** und auch keines
  stillschweigend gewählt: Blatt fachlich sauber schreiben, am Ende in einem
  Satz sagen, dass der Lehrplanbezug fehlt und wofür du das Land bräuchtest.

## Quellen und Recherche

- **Belegliste zuerst.** Schreibe vor der ersten Suche auf, welche Aussagen,
  Zahlen, Begriffe, Formeln, Daten und Zitate die Aufgaben und Lösungen tragen.
  Diese Liste ist dein Prüfauftrag; nichts davon geht ungeprüft aufs Blatt.
- **Jeder Punkt wird am Netz belegt — auch der, der dir sicher vorkommt.**
  „Das weiß ich" ist kein Beleg, sondern die häufigste Fehlerquelle: Genau bei
  Standardwissen sitzt die verschobene Jahreszahl, die falsche molare Masse, das
  dem falschen Kopf zugeschriebene Zitat.
- **Ein Suchtreffer-Ausschnitt ist kein Beleg.** Öffne die Quelle mit `web_fetch`
  und lies die Stelle. Bevorzuge Primärquellen, Behörden, Fachgesellschaften,
  Lehrwerke oder etablierte Nachschlagewerke. Widersprechen sich zwei Quellen,
  entscheidet eine dritte, unabhängige — nicht dein Eindruck.
- **Bündele, das Budget ist knapp:** acht Suchen und zehn Seitenabrufe pro Lauf,
  davon je eines für den Lehrplan. Fasse verwandte Fragen zu einer Suche zusammen
  und wähle Seiten, die mehrere Punkte decken. Plane die Abrufe vor der ersten
  Suche. Lieber weniger Aufgaben mit Beleg als mehr ohne.
- **Nur der Fachinhalt braucht Belege.** Didaktische Entscheidungen — Sozialform,
  Zeit, Schreibraum, Reihenfolge, Operatorwahl — triffst du selbst.
- Bleibt ein Punkt unsicher oder widersprüchlich, entferne oder ersetze ihn samt
  Aufgabe. Unsicherheit nur offen kennzeichnen, wenn sie selbst Lerngegenstand
  ist. Eine Annahme darf nie zur vermeintlich eindeutigen Musterlösung werden.

## Vorgehen

1. Webrecherche prüfen, `references/vorlage.md` lesen (die zwei Pflichtschritte).
2. Quellen vollständig lesen (Anhänge, Notiz, bei Bedarf note_search im Vault).
   Liegt ein früheres Arbeitsblatt als `.html` bei, ist das ein Korrekturauftrag
   — siehe „Ein Blatt nachbessern".
3. Festlegen: Jahrgangsstufe, Fach, Bundesland, Zeitrahmen, Vorwissen, Lernziel.
   Fehlt etwas, triff eine begründete Annahme und nenne sie am Ende in einem Satz
   — frag nicht nach. Für das Bundesland gilt das nicht: das wird nicht angenommen.
4. Material, drei bis fünf Aufgaben und die vollständigen Lösungen gemeinsam
   entwerfen, über die Anforderungsbereiche ansteigend. Belegliste mitschreiben.
5. Belegliste abarbeiten: Suchen bündeln (Lehrplan zuerst), dann die Seiten mit
   `web_fetch` öffnen und die Stellen lesen.
6. Qualitätsprüfung durchführen, Fehler korrigieren, betroffene Prüfungen
   wiederholen.
7. Erst dann body_html aus Stil-Block und Inhalt zusammensetzen und write_html
   aufrufen.

## Fachliche Qualitätsprüfung — Pflicht

Löse jede geschlossene Aufgabe unabhängig vom geplanten Lösungsblatt und
vergleiche erst danach. Prüfe offene Aufgaben gegen einen klaren
Erwartungshorizont. Kontrolliere anschließend:

1. **Fakten und Begriffe:** Jede antwortrelevante Aussage geht auf eine Quelle
   zurück, die du in diesem Lauf mit `web_fetch` geöffnet hast — nicht auf
   Erinnerung, nicht auf einen Suchtreffer-Ausschnitt. Gehe die Belegliste Punkt
   für Punkt durch; jeder trägt den Namen der Quelle, in der du die Stelle
   gelesen hast. Fachbegriffe, Eigennamen, Daten und Zitate sind korrekt und
   altersangemessen.
2. **Rechnungen und Daten:** Rechenweg, Einheiten, Vorzeichen, Größenordnung,
   Rundung und Annahmen stimmen. Tabellenwerte, Diagrammskalen, eingezeichnete
   Punkte, Achsen und Beschriftungen passen zu Aufgabe und Lösung.
3. **Naturwissenschaften:** Reaktionsgleichungen sind nach Atomen und Ladung
   ausgeglichen; Stoffmengen, molare Massen, Stöchiometrie, Einheiten und
   Aggregatzustände sind konsistent. Experimente sind durchführbar, Beobachtung
   und Deutung getrennt; Gefahren, Schutz und Entsorgung fehlen nicht.
4. **Didaktische Konsistenz:** Lernziel, Material, Operator, Niveau, Schreibraum,
   Zeit, Hilfen, Selbsteinschätzung und Lösung passen zusammen. Aufgaben,
   Lösungen, Nummern, Teilaufgaben und Niveaustufen sind vollständig zugeordnet.
   Der Lehrplanbezug passt zu Fach, Klassenstufe und Bundesland.

Schreibe nur, wenn jede geschlossene Aufgabe eine korrekte Lösung, jede offene
einen Erwartungshorizont hat, **jeder Punkt der Belegliste auf eine geöffnete
Quelle zurückgeht** und Rechnungen, Daten, Grafiken sowie Versuche geprüft sind.
Sonst korrigieren und erneut prüfen; nicht Verifizierbares ersetzen oder
entfernen. Die spätere Prüfung durch eine Lehrkraft ersetzt diese nicht.

## Ein Blatt nachbessern

Hängt der Nutzer eine bestehende `.html`-Datei an, ist das ein Korrekturauftrag,
kein neues Blatt.

1. Datei mit `read_attachment` lesen. Du bekommst genau den Inhalt zurück, den
   `body_html` erwartet — Stil-Block, Aufgaben und Lösungen inklusive.
2. **Nur die benannten Fehler ändern.** Alles andere bleibt Zeichen für Zeichen
   stehen, auch Formulierungen, die du anders geschrieben hättest. Der Nutzer hat
   das Blatt bereits geprüft; eine stille Umformulierung macht diese Prüfung
   wertlos.
3. Betrifft die Korrektur eine fachliche Aussage, wird sie genauso belegt wie im
   Erstlauf — geöffnete Quelle, sonst raus. Bei Layout, Sprache oder Schreibraum
   ist keine Recherche nötig.
4. Mit `write_html` erneut schreiben. Die neue Fassung ist eine eigene Datei; die
   alte bleibt liegen, bis der Nutzer sie löscht.
5. Am Ende in ein bis zwei Sätzen sagen, was du geändert hast — und nur das.

## Bilder

Ein Bild ist die Ausnahme, nicht der Schmuck. Setze `generate_image` nur ein,
wenn das Bild eine Aufgabe trägt — ein Motiv, das beschrieben, verglichen oder
gedeutet wird — oder wenn der Auftrag es verlangt. Ein dekoratives Titelbild
kostet Platz und Toner und lehrt nichts.

- Erst das Bild erzeugen, dann `write_html`: die Einbettung braucht den
  Dateinamen, den `generate_image` gemeldet hat.
- Einbinden über `<figure class="fig">` mit `<img src="dateiname.jpg" …>`, siehe
  `references/vorlage.md`. Reiner Dateiname, kein Pfad.
- **Kein Text im Bild.** Das Modell schreibt Buchstaben unzuverlässig; ein
  Diagramm mit erfundener Beschriftung ist ein fachlicher Fehler. Beschriftetes
  gehört als Inline-SVG gezeichnet, nicht generiert.
- **Ein Bild ist keine Quelle** und nie Grundlage einer Musterlösung. Was zu
  sehen ist, muss aus Aufgabe oder Material hervorgehen.
- Keine Kinder, keine erkennbaren Personen, keine Gesichter — symbolische,
  personenfreie Motive.
- Höchstens ein Bild pro Blatt. Es zählt mit dem Blatt zusammen als ein Ergebnis.

## Sprache

Kurze Sätze, ein Gedanke pro Satz, aktiv statt passiv. Anrede in der Du-Form.
Fachbegriffe benutzen, aber bei der ersten Nennung erklären.

Verwende die im deutschen Unterricht etablierten Fachbegriffe, bei genanntem
Bundesland die des dortigen Lehrplans. Bei Unsicherheit sachlich umschreiben
oder nachschlagen, nie einen plausibel klingenden Begriff erfinden. Eigennamen
nur belegt verwenden. Keine verschachtelten Aufgaben, kein Gendern mit
Sonderzeichen, keine Emojis oder dekorativen Symbole.

## Lösungen

Zu jeder Aufgabe eine Lösung, bei offenen Aufgaben ein Erwartungshorizont: was
eine Antwort enthalten muss, was sie enthalten kann. Form und Nummerierung stehen
in `references/vorlage.md`.

Jede Zahl, Jahreszahl, Formel und jedes Zitat im Lösungsteil trägt in Klammern
die Quelle, in der du die Stelle gelesen hast — kurz, etwa (Umweltbundesamt).
Das Lösungsblatt geht an die Lehrkraft; sie muss nachschlagen können, worauf eine
Musterlösung beruht. Der Quellenblock, den die App anhängt, ersetzt das nicht —
er sagt nur, welche Seiten offen waren.

## Rechtliches und Sorgfalt

- **Urheberrecht:** Fremde Texte, Bilder und Karikaturen gehören nicht ungefragt
  aufs Blatt. Nach § 60a UrhG sind für den Unterricht nur kleine Teile eines
  Werks erlaubt, immer mit Quellenangabe. Im Zweifel selbst formulieren.
- **Keine erfundenen Fakten.** Zahlen, Jahreszahlen, Zitate, Namen und
  Lehrplanbezüge nur aus Quellen, die du in diesem Lauf geöffnet hast. Ein
  falscher Fakt auf einem Arbeitsblatt wird von einer ganzen Klasse gelernt.
- **Datenschutz:** keine Namen realer Schülerinnen und Schüler, auch nicht in
  Beispielaufgaben. Erfundene Vornamen ohne Nachnamen.
- Die App setzt die Fußzeile „Erstellt mit KI-Modell: …" automatisch; nicht
  selbst in body_html schreiben.
- Am Ende des Laufs knapp nennen: welchen Lehrplan du herangezogen hast, welche
  Aussagen du womit belegt hast, welche Aufgaben du wegen fehlender Belege
  gestrichen hast, welche didaktischen Annahmen du getroffen hast und was
  unsicher bleibt. Nenne nur Prüfungen, die du tatsächlich durchgeführt hast.
