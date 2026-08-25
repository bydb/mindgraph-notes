# Vergleichsmodus — Entwurf

Stand: 25.08.2026. **Noch kein Code.** Dieses Dokument beschreibt, was gebaut werden soll, wo die
Grenzen liegen und welche Entscheidungen offen sind.

## Wozu

Die Zeitbilanz (`docs/voice-command-plan.md`, Abschnitte zu Wirkungsbilanz und Zeitgewinn) beantwortet
die Frage „Was hat mir MindGraph heute abgenommen?" — auf Grundlage einer **Schätzung des Nutzers**.
Für die eigene Motivation reicht das. Vor einem Einkauf reicht es nicht: Die erste Rückfrage lautet,
woher die Vergleichszahl stammt, und die Antwort „hat der Nutzer selbst eingetragen" beendet das
Gespräch.

Der Vergleichsmodus soll einen Satz tragen können wie:

> Bei 8 Angebotsauswertungen sank die aktive Bearbeitungszeit im Median von 42 auf 11 Minuten
> (4 Fälle konventionell, 4 mit MindGraph, zufällig zugeteilt). Übernahmequote 3 von 4.
> Ergebnisqualität: 3× „gut", 1× „mit Nacharbeit".

Nicht mehr, aber auch nicht weniger. Ein solcher Satz hält einer Nachfrage stand, eine große Zahl
ohne Herkunft nicht.

## 1. Versuchsanlage

**Nicht dieselbe Aufgabe zweimal.** Der naheliegende Aufbau — eine Aufgabe erst von Hand, dann mit
MindGraph — misst beim zweiten Durchgang vor allem Erinnerung. Man kennt das Ergebnis schon, weiß,
wo die Zahlen stehen, und ist deshalb schneller. Der Effekt geht in dieselbe Richtung wie der zu
messende und lässt sich nachträglich nicht herausrechnen.

**Stattdessen: vergleichbare Fälle derselben Aufgabenklasse.** Der Nutzer legt eine Aufgabenklasse
an („Angebotsauswertung", „Rückläufe aus Schulen zusammenführen") und trägt echte Vorgänge als Fälle
ein, sobald sie anfallen. Jeder Fall wird **zufällig** einem der beiden Wege zugeteilt.

**Zuteilung durch die App, nicht durch den Nutzer.** Wer selbst wählt, schiebt die kniffligen Fälle
unbewusst auf den Weg, dem er mehr zutraut — und misst am Ende diese Vorauswahl. Die Zuteilung
erfolgt **blockweise** (je vier Fälle zwei und zwei, Reihenfolge zufällig): Bei kleinen Zahlen
verhindert das die Klumpung „erst sechs konventionell, dann sechs mit MindGraph", die sonst
schlicht den Lernfortschritt über die Zeit misst.

**Zuteilung vor der Bearbeitung, nach dem Anlegen.** Der Fall wird mit Kurzbezeichnung angelegt,
dann zeigt die App den Weg an. Wer den Weg vorher sieht, wählt indirekt doch aus.

**Abbrüche zählen.** Ein begonnener und nicht beendeter Fall bleibt als „abgebrochen" stehen und
erscheint in der Auswertung. Ohne das überlebt nur, was gut lief.

## 2. Was gemessen wird

| Größe | konventionell | mit MindGraph |
|---|---|---|
| Aktive Bearbeitungszeit | **selbst gestoppt** | gemessen (Auftrag + Vordergrundzeit + Prüfung) |
| Korrekturzeit danach | selbst gestoppt | **gemessen** (Bearbeitung der Ergebnisdatei) |
| Durchlaufzeit | vom Anlegen bis zum Abschluss | dito |
| Übernahmequote | entfällt | übernommen / verworfen |
| Ergebnisqualität | Bewertung des Bearbeiters | dito |

**Der Unterschied zwischen „gemessen" und „selbst gestoppt" wird überall mitgeführt** — in der
Datenhaltung, in der Anzeige und im Export. Er ist der ehrlichste Teil des ganzen Vorhabens: Die
konventionelle Seite kann MindGraph nicht messen, weil Excel, Outlook und der Dateimanager nicht mit
ihr reden. Wer das verschweigt, verkauft eine Schätzung als Messung.

**Korrekturzeit ist neu und heute die größte Lücke.** Was nach der Übernahme an der Ergebnisdatei
geschieht, sieht die Bilanz bisher gar nicht — dabei entscheidet gerade das über den echten Nutzen.
Vorschlag: aktive Bearbeitungszeit **an der übernommenen Datei** (Editor im Vordergrund, Tastatur
aktiv), bis der Fall geschlossen wird, gedeckelt wie die übrigen Messungen. Auf der konventionellen
Seite bleibt sie eine Stoppuhr-Angabe.

**Ergebnisqualität** kann keine Maschine bewerten. Vier Stufen, für beide Wege dieselben:
unbrauchbar · mit Nacharbeit · gut · besser als sonst. **Ehrliche Grenze: nicht verblindet.** Wer
weiß, welchen Weg er gegangen ist, bewertet nicht neutral. Das gehört in den Export, nicht in eine
Fußnote.

## 3. Auswertung

- **Median statt Mittelwert**, dazu der Interquartilsabstand. Bei acht Fällen regiert sonst ein
  Ausreißer die Aussage.
- **N je Weg immer sichtbar**, direkt neben jeder Zahl. „Median 11 min" ohne „aus 4 Fällen" ist
  keine Aussage, sondern eine Andeutung.
- **Unter drei Fällen je Weg: keine Kennzahl.** Die App zeigt dann die Einzelfälle und sagt, wie
  viele noch fehlen. Ein Median aus zwei Werten ist deren Mittel und suggeriert Verlässlichkeit,
  die nicht da ist.
- **Keine Signifikanztests.** Bei diesen Fallzahlen wäre ein p-Wert Theater. Wer ihn verlangt,
  braucht eine andere Studie, keine andere Anzeige.
- **Kein Kappen bei null**, wie in der Zeitbilanz: Ist MindGraph langsamer, steht das so da.

## 4. Datenhaltung

`userData/comparisons/<sha256(vaultPath)>.json`, gleiche Begründung wie beim Tätigkeitsprotokoll:
nicht im Vault, damit es nicht über iCloud oder Dropbox auf mehreren Geräten doppelt geführt wird.

Gespeichert je Fall: Kennung, Aufgabenklasse, zugeteilter Weg, Zeitstempel, die Messwerte, Herkunft
jedes Werts (gemessen / selbst gestoppt), Übernahme-Status, Qualitätsstufe, Abbruchgrund.

**Freitext gibt es genau an einer Stelle**: der Kurzbezeichnung des Falls, die der Nutzer selbst
vergibt. Sie bleibt lokal und wandert nicht in Auswertungen, die man weitergibt — der Export nennt
Fälle als „Fall 3", nicht als „Angebot Müller".

## 5. Export

Ein Bericht als Markdown und als CSV: Kopf mit Aufgabenklasse, Zeitraum, Fallzahlen und
Zuteilungsverfahren; Tabelle der Fälle; darunter die Kennzahlen. Jede Zahl trägt ihre Herkunft.
Der Bericht ist das, was ins Controlling geht — deshalb muss er ohne die App verständlich sein und
seine eigenen Grenzen benennen.

## 6. Abgrenzung

- **Kein Modellvergleich.** Der steckt in der Zeitbilanz („Nach Modell") und beantwortet eine andere
  Frage: welches Modell, nicht welcher Arbeitsweg.
- **Nichts läuft automatisch.** Ein Vergleich entsteht nur, weil jemand ihn anlegt, und endet, weil
  jemand ihn beendet. Eine im Hintergrund mitlaufende Dauerstudie wäre weder erklärbar noch ehrlich.
- **Keine Empfehlung aus wenigen Fällen.** Die App zeigt Zahlen, sie zieht keinen Schluss („MindGraph
  ist 74 % schneller"). Den Schluss zieht der Mensch, der die Fälle kennt.

## 7. Offene Entscheidungen

1. **Wie wird die konventionelle Zeit erfasst?** Stoppuhr in der App (genauer, aber man muss daran
   denken) oder Eintrag am Ende (bequemer, aber gerundet und erinnerungsverzerrt). Vorschlag:
   Stoppuhr mit der Möglichkeit, den Wert nachträglich zu korrigieren — jede Korrektur wird als
   solche gespeichert.
2. **Woran hängt die Korrekturzeit?** An der übernommenen Datei ist naheliegend, greift aber nicht,
   wenn die Nacharbeit in Excel stattfindet. Dann bleibt auch dort nur die Stoppuhr.
3. **Wann endet ein Fall?** Manuell („Fall abschließen") oder automatisch nach Frist? Automatisch
   spart Klicks, verfälscht aber die Durchlaufzeit.
4. **Wo lebt die Oberfläche?** Eigener Tab, Bereich im Dashboard oder Abschnitt in den
   Einstellungen. Der Vergleich ist eine Kampagne mit Anfang und Ende — das spricht für einen
   eigenen Tab, nicht für ein Dauer-Widget.
5. **Mehrere Aufgabenklassen gleichzeitig?** Technisch einfach, in der Auswertung heikel: Fälle aus
   verschiedenen Klassen dürfen nie in einen Median fallen.

## 8. Reihenfolge

1. **Datenschicht und Zuteilung** (rein, getestet): Fälle, Blockrandomisierung, Kennzahlen mit
   Herkunft, Mindestfallzahl-Regel. Ohne Oberfläche prüfbar.
2. **Erfassung mit MindGraph**: an die bestehenden Messungen andocken, Fall-Bezug herstellen,
   Korrekturzeit ergänzen.
3. **Erfassung konventionell**: Stoppuhr und Nachtrag.
4. **Auswertung und Export.**
5. **Erst danach** die Frage, ob und wie das in eine Verkaufsunterlage einfließt.

Die Schritte 1 und 2 sind die eigentliche Arbeit. Wer bei 4 anfängt, baut eine Anzeige für Zahlen,
die es noch nicht gibt.
