# Vergleichsmodus — Bauvertrag

Stand: 25.08.2026, zweite Fassung nach methodischer Durchsicht. **Noch kein Code.** Was hier steht,
ist die Zusage, gegen die gebaut wird — insbesondere die Regeln, die sich später nicht mehr
nachrüsten lassen, weil sie in der Datenschicht sitzen.

## Wozu

Die Zeitbilanz (`docs/voice-command-plan.md`) beantwortet „Was hat mir MindGraph heute abgenommen?"
auf Grundlage einer **Schätzung des Nutzers**. Für die eigene Motivation reicht das; vor einem
Einkauf nicht. Die erste Rückfrage lautet, woher die Vergleichszahl stammt.

Der Vergleichsmodus soll einen Satz tragen können wie:

> Aufgabenklasse Angebotsauswertung, 6 Fälle zugeteilt, 4 abgeschlossen (2 je Weg).
> Der Median der gesamtaktiven Zeit betrug konventionell 42 und mit MindGraph 11 Minuten.
> Ein MindGraph-Fall wurde verworfen und von Hand fertiggestellt; seine 38 Minuten sind enthalten.

Nicht „sank von 42 auf 11": Es sind **nicht dieselben Fälle** vorher und nachher, sondern zwei
Gruppen. Ein Satz mit „sank" behauptet eine Messwiederholung, die es nicht gibt.

## 1. Kampagne als eigene Entität

Eine **Kampagne** ist der Rahmen, in dem verglichen wird. Sie hält fest, was während des Laufs
unveränderlich bleibt:

- Aufgabenklasse (eine, nie mehrere)
- Einschlussregeln — was ist ein vergleichbarer Fall, was gehört nicht dazu
- **Akzeptanzdefinition**: was gilt in dieser Kampagne als brauchbares Ergebnis (vorab, nicht
  hinterher)
- Beginn und Ende
- Randomisierungsverfahren samt Parametern
- Protokollversion

Fälle verweisen auf ihre Kampagne. **Mehrere Aufgabenklassen laufen als getrennte Kampagnen, ohne
gemeinsame Kennzahl** — Fälle aus verschiedenen Klassen dürfen nie in einen Median fallen.

Ändert sich eine Messregel, entsteht eine neue Protokollversion und damit eine neue Kampagne. Alte
und neue Regeln in einer Auswertung zu mischen wäre der leiseste und schwerste Fehler.

## 2. Zuteilung

**Die App teilt zu, nicht der Nutzer.** Wer selbst wählt, schiebt die kniffligen Fälle unbewusst auf
den Weg, dem er mehr zutraut, und misst am Ende diese Vorauswahl.

**Zuteilung erst nach dem Anlegen** des Falls (Kurzbezeichnung, Einschlussprüfung), nie vorher. Wer
den Weg vorher sieht, wählt indirekt doch aus.

**Keine festen Viererblöcke.** Bei 2:2 in Vierergruppen ist nach drei Fällen der vierte Weg sicher
bekannt, bei zwei gleichen Anfängen sogar die beiden folgenden. Stattdessen eine **balancierende
Zufallsregel** (Urnenmodell nach Efron): Liegt ein Weg vorn, bekommt der andere die höhere
Wahrscheinlichkeit — vorhergesagt werden kann die einzelne Zuteilung aber nie, weil jede Zuteilung
ein echter Zufallszug bleibt.

- Der Zufallsgenerator wird **eingespeist**, nicht importiert. Nur so ist die Regel prüfbar.
- Gespeichert wird je Fall der gezogene Weg **und der Ungleichstand im Moment der Ziehung**. Damit
  ist die Zuteilung nachvollziehbar, ohne dass ein gespeicherter Startwert die nächste Ziehung
  verraten würde.
- **Die Zuteilung wird atomar mit dem Fall geschrieben und nie geändert.** Kein Umteilen, kein
  Löschen, kein „der zählt nicht".

## 3. Fallzustände — alle Zugeteilten bleiben im Nenner

| Zustand | Bedeutung |
|---|---|
| `offen` | zugeteilt, in Arbeit |
| `abgeschlossen` | fertig, bewertet |
| `abgebrochen` | nicht zu Ende geführt (mit Grund) |
| `nicht messbar` | bearbeitet, aber Zeiten fehlen oder sind unbrauchbar (mit Grund) |

Kennzahlen rechnen **nur mit vollständigen Werten**, weisen aber immer daneben aus: „4 abgeschlossen
von 6 zugeteilt". Ohne diese zweite Zahl entsteht Überlebensbias — es überlebt, was gut lief.

## 4. Die Hauptkennzahl

**Gesamtaktive Zeit bis zum nutzbaren Ergebnis**, je Fall:

```
Gesamtaktive Zeit = Auftrag + Vordergrundzeit + Prüfung + Nacharbeit + Rückfallarbeit
```

**Rückfallarbeit ist der Kern dieser Regel.** Wird ein MindGraph-Ergebnis verworfen und der Fall
danach von Hand fertiggestellt, gehört diese Handarbeit **weiterhin zum zugeteilten
MindGraph-Fall**. Sonst werden Fehlschläge künstlich billig: Ein Weg, der in der Hälfte der Fälle
scheitert, sähe blendend aus, weil nur die geglückten Fälle seine Zeit tragen.

Das ist das Prinzip „Auswertung nach Zuteilung, nicht nach tatsächlich benutztem Werkzeug". Es ist
unbequem und der einzige Grund, warum die Zahl am Ende etwas wert ist.

Die Bestandteile erscheinen zusätzlich einzeln — sie erklären, WO die Zeit liegt. Die Hauptaussage
ist aber immer die Summe.

**Durchlaufzeit** ist eine eigene Größe mit vier Zeitpunkten: Anlage · Arbeitsbeginn ·
Ergebnisbereitstellung · Abschluss. Sie ersetzt die aktive Zeit nie, sondern ergänzt sie.

## 5. Herkunft jedes Werts

Jeder Zeitwert trägt seine Herkunft mit — in der Datei, in der Anzeige, im Export:

| Herkunft | Bedeutung |
|---|---|
| `vordergrund-automatisch` | von der App erfasst, solange ihr Fenster vorn war |
| `gestoppt` | Stoppuhr in der App, vom Nutzer gestartet und beendet |
| `nachgetragen` | hinterher eingetragen |
| `korrigiert` | geänderter Wert; Originalwert und Grund bleiben gespeichert |
| `nicht gemessen` | fehlt (Fall gilt als `nicht messbar`) |

**Was `vordergrund-automatisch` wirklich heißt, muss dabeistehen:** Die App erfasst, dass ihr Fenster
vorn war — nicht, dass jemand getippt hat. Beides ist nicht dasselbe, und die Bezeichnung darf keine
Genauigkeit behaupten, die es nicht gibt.

Bewusst wird **keine Tastaturaktivität** als Abschaltkriterium verwendet: Ein Ergebnis zu lesen und
zu prüfen ist Arbeit ohne Tastenanschlag. Eine Pausenerkennung über Tastatur würde genau die
Prüfarbeit kleinrechnen — und damit ausgerechnet die MindGraph-Seite bevorteilen.

Stattdessen: **Sitzungen statt Summen.** Gespeichert werden Arbeitssitzungen je Fall (Beginn, Ende,
Herkunft, Unterbrechungen). Auffällige Sitzungen (sehr lang, ohne Unterbrechung) werden
**gekennzeichnet, nicht gekappt**.

**Der 30-Minuten-Deckel der Tagesbilanz gilt hier nicht.** Er ist dort richtig, weil eine
Mittagspause sonst als Prüfzeit erschiene. Ein Vergleichsfall darf legitim zwei Stunden dauern; ein
Deckel würde lange Fälle systematisch kürzen und — weil er nur auf der automatisch erfassten Seite
greift — die MindGraph-Seite einseitig begünstigen.

## 6. Qualität

Bewertet wird **beim Abschluss**, am **fertigen Ergebnis**, mit demselben Maßstab für beide Wege:

> unbrauchbar · wesentliche Mängel · kleinere Mängel · vollständig brauchbar

Der Maßstab ist die **Akzeptanzdefinition der Kampagne**, festgelegt bevor der erste Fall läuft.
Ohne sie bewertet man am Ende die eigene Erwartung.

**Nacharbeitsbedarf und Übernahme sind keine Qualitätsstufen**, sondern eigene Prozessgrößen: Wie
viel Nacharbeit nötig war, steckt in der Zeit; ob übernommen oder verworfen wurde, ist die
Übernahmequote. „Mit Nacharbeit" als Qualitätsstufe vermischte beides.

**Ehrliche Grenze: nicht verblindet.** Wer weiß, welchen Weg er gegangen ist, bewertet nicht
neutral. Das gehört in den Export, nicht in eine Fußnote.

## 7. Auswertung

- **Median mit Interquartilsabstand**, nicht Mittelwert. Bei diesen Fallzahlen regiert sonst ein
  Ausreißer.
- **N immer neben der Zahl**, dazu „x von y zugeteilten Fällen abgeschlossen".
- **Unter drei abgeschlossenen Fällen je Weg: keine Kennzahl.** Dann Einzelfälle und der Hinweis,
  wie viele fehlen. Ein Median aus zwei Werten ist deren Mittel und täuscht Verlässlichkeit vor.
- **Keine Signifikanztests.** Bei diesen Zahlen wäre ein p-Wert Theater.
- **Kein Kappen bei null.** Ist MindGraph langsamer, steht das so da.
- **Kein Schluss.** Die App zeigt Zahlen; „74 % schneller" sagt der Mensch, der die Fälle kennt.

## 8. Datenhaltung

`userData/comparisons/<sha256(vaultPath)>.json` — nicht im Vault, damit die Kampagne nicht über
iCloud oder Dropbox doppelt geführt wird (gleiche Begründung wie beim Tätigkeitsprotokoll).

Grobe Form:

```ts
interface Campaign {
  id: string
  taskClass: string
  inclusionRules: string
  acceptanceDefinition: string
  randomization: { method: 'efron-biased-coin'; bias: number }
  protocolVersion: number
  startedAt: number
  endedAt?: number
}

interface Case {
  id: string
  campaignId: string
  label: string                       // einziger Freitext, bleibt lokal
  arm: 'konventionell' | 'mindgraph'  // atomar mit dem Fall geschrieben, nie geändert
  imbalanceAtDraw: number
  state: 'offen' | 'abgeschlossen' | 'abgebrochen' | 'nicht messbar'
  stateReason?: string
  createdAt: number
  startedAt?: number
  resultReadyAt?: number
  closedAt?: number
  sessions: WorkSession[]
  accepted?: boolean                  // nur im MindGraph-Arm
  quality?: 1 | 2 | 3 | 4
}

interface WorkSession {
  kind: 'auftrag' | 'vordergrund' | 'pruefung' | 'nacharbeit' | 'rueckfallarbeit'
  from: number
  to: number
  origin: 'vordergrund-automatisch' | 'gestoppt' | 'nachgetragen' | 'korrigiert'
  originalMs?: number                 // bei 'korrigiert'
  correctionReason?: string
  flagged?: 'ungewoehnlich-lang'
}
```

**Freitext gibt es an zwei Stellen**: Kurzbezeichnung des Falls und Korrekturgrund. Beide bleiben
lokal; der Export nennt Fälle als „Fall 3", nicht als „Angebot Müller".

## 9. Export

Bericht als Markdown und CSV: Kopf mit Kampagne, Akzeptanzdefinition, Randomisierungsverfahren,
Zeitraum und Fallzahlen; Tabelle der Fälle mit Zustand und Herkunft der Werte; darunter die
Kennzahlen; am Ende die Grenzen (nicht verblindet, konventionelle Zeiten gestoppt statt gemessen).
Der Bericht geht ins Controlling — er muss ohne die App verständlich sein.

## 10. Abgrenzung

- **Kein Modellvergleich.** Der steckt in der Zeitbilanz und beantwortet eine andere Frage.
- **Nichts läuft automatisch.** Eine Kampagne entsteht, weil jemand sie anlegt, und endet, weil
  jemand sie beendet. **Abschluss eines Falls ausschließlich manuell** — eine automatische Frist
  verfälscht die Durchlaufzeit.
- **Keine Empfehlung aus wenigen Fällen.**

## 11. Entschiedene Punkte

1. **Konventionelle Zeit**: Stoppuhr als Standard; Nachtrag und Korrektur erlaubt, jeweils mit
   eigener Herkunft.
2. **Korrekturzeit**: an den **Fall und seine Arbeitssitzungen** gebunden, nicht an eine Datei.
   Nacharbeit an einer Vault-Datei wird automatisch erfasst, Nacharbeit in Excel oder einem anderen
   Programm per Stoppuhr.
3. **Abschluss**: ausschließlich manuell.
4. **Oberfläche**: eigener Tab. Eine Kampagne hat Anfang und Ende — das ist kein Dauer-Widget.
5. **Mehrere Aufgabenklassen**: ja, aber ausschließlich als getrennte Kampagnen ohne gemeinsame
   Kennzahl.

## 12. Offen

- Wie streng ist die Einschlussprüfung? Freitextregel und Häkchen des Nutzers, oder strukturierte
  Kriterien? Strukturiert ist prüfbarer, kostet aber Aufwand bei jedem Fall.
- Ab wann gilt eine Sitzung als `ungewoehnlich-lang`? Vorschlag: relativ zum Median der Kampagne,
  nicht als feste Minutenzahl.
- Soll eine Kampagne pausierbar sein (Urlaub, Projektwechsel), und was heißt das für die
  Durchlaufzeit?

## 13. Stand der Umsetzung

**Schritt 1 ist gebaut** (26.08.2026): `shared/comparison/` mit `types.ts`, `randomization.ts`,
`model.ts`, `metrics.ts` und 34 Tests. Rein, ohne Oberfläche, ohne Persistenz.

Was dabei aus dem Vertrag in Code wurde:

- **Zuteilung und Anlegen in EINEM Schritt** (`createCase`). Dazwischen darf keine Lücke sein: Ein
  Fall ohne Zuteilung wäre die Gelegenheit, ihn nach dem Blick auf den Weg wieder zu verwerfen.
- **Endzustände sind endgültig.** `abgeschlossen`, `abgebrochen` und `nicht-messbar` lassen sich
  nicht mehr verlassen; jede Funktion gibt ein neues Objekt zurück und fasst ihre Eingabe nicht an.
  Getestet wird beides — auch, dass die Eingabe unverändert bleibt.
- **Ausgleich über die ZUTEILUNG, nicht über die Abschlüsse.** Sonst verschiebt ein abgebrochener
  Fall die Verteilung.
- **Abschluss ohne Arbeitssitzung wird abgewiesen** — so ein Fall ist nicht abgeschlossen, sondern
  nicht messbar.
- **Korrektur nur mit Grund**, Originalwert bleibt erhalten. Eine Korrektur ohne Spur wäre von einer
  Erfindung nicht zu unterscheiden.
- **Kennzahlen nur aus abgeschlossenen Fällen**, Nenner aus allen zugeteilten, `null` statt Median
  unterhalb der Mindestzahl.

**Schritt 2 ist gebaut** (26.08.2026): Persistenz und Erfassung im MindGraph-Arm.

- `shared/comparison/validation.ts` — prüft jede gespeicherte Zeile. Der gefährlichste Fund ist ein
  Fall **ohne gültigen Weg**: Er ließe sich nachträglich zuteilen, und genau das darf nie möglich
  sein. Eine korrigierte Sitzung ohne Originalwert und Grund wird ebenfalls abgewiesen.
- `main/comparisonStore.ts` — `userData/comparisons/<hash(vault)>.json`, serielle Warteschlange,
  atomares Schreiben. Beschädigte Zeilen fallen weg, die Kampagne bleibt.
- **Die Regeln setzt der Main durch, nicht die Oberfläche.** Der Renderer schickt Absichten
  („Fall anlegen", „abschließen"), der Main zieht den Weg mit `crypto.randomInt` und wendet die
  reinen Modellfunktionen an. Ein Renderer kann damit weder umteilen noch löschen.
- **Anschluss an den Agent-Lauf**: Trägt ein Lauf eine `comparisonCaseId`, wandern die ohnehin
  gemessenen Zeiten zusätzlich als Arbeitssitzungen in den Fall — Auftragszeit beim Lauf-Ende,
  Vordergrund- und Prüfzeit bei der Entscheidung, dazu der Übernahme-Status. Ein bereits
  abgeschlossener Fall nimmt nichts mehr an; nachträgliches Anhängen wäre nicht prüfbar.

Gegengeprüft in der laufenden App: Kampagne angelegt, sechs Fälle gezogen (3:3, ohne festes Muster),
Sitzungen eingetragen, abgeschlossen. Der Bericht zeigt konventionell 40 min gegen MindGraph 12 min
im Median — **einschließlich des gescheiterten Falls mit 47 min**, der die Rückfallarbeit trägt.
Alle Sperren greifen über die IPC-Grenze: abgeschlossene Fälle nehmen nichts mehr an, unbekannte
Kampagnen und Fälle werden abgewiesen, eine Kampagne ohne Akzeptanzdefinition entsteht gar nicht.

Noch nicht gebaut: Stoppuhr für den konventionellen Arm, Oberfläche, Export.

## 14. Reihenfolge

1. **Datenschicht, Zuteilung und Kennzahlen** (rein, getestet, ohne Oberfläche): Kampagne, Fall,
   Sitzungen, Urnenmodell mit eingespeistem Zufall, Gesamtzeit inklusive Rückfallarbeit,
   Nenner-Regel, Mindestfallzahl.
2. **Erfassung im MindGraph-Arm**: an die bestehenden Messungen andocken, Fall-Bezug herstellen,
   Nacharbeit und Rückfallarbeit ergänzen.
3. **Erfassung im konventionellen Arm**: Stoppuhr, Nachtrag, Korrektur.
4. **Auswertung und Export.**
5. **Erst danach** die Frage, ob und wie das in eine Verkaufsunterlage einfließt.

Schritt 1 ist die eigentliche Arbeit: Dort sitzen die Regeln, die sich später nicht mehr korrigieren
lassen, ohne alle bereits erhobenen Fälle unbrauchbar zu machen.
