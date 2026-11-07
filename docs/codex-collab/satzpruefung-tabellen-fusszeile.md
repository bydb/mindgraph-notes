# Satzprüfung: Quellennummer unter der Tabelle und Uhrzeiten mit „Uhr“

## Aufgabe

Nutzertest 07.11.2026 im Petrol-Chat, Frage „Öffnungszeiten Medienzentrum Frankfurt“. Die Antwort
war inhaltlich richtig (Zeiten aus dem neuen Seitenrand, siehe `web-seitenrand-und-links.md`), aber
jede Uhrzeit in der Tabelle trug den roten Befund „Modellwissen, nicht geprüft · Zahl ohne Quelle“.
Zwei Ursachen:

1. **Nummer unter der Tabelle.** Das Modell setzte „[1]“ als eigene Zeile direkt unter die Tabelle
   statt in die Zeilen. Das Zeilenerbe (eine Nummer in einer Zelle gilt für die Zeile) griff nicht.
   Neu: Eine Zeile, die NUR aus Quellennummern besteht (optional „Quelle:“/„Quellen:“/„Source(s):“
   davor, Satzzeichen erlaubt), direkt unter einer Tabelle (höchstens eine Leerzeile dazwischen),
   gilt für alle Tabellenzeilen OHNE eigene Nummer — nur bei GENAU einer gültigen Quelle (wie F05).
   Ohne Leerzeile liest markdown-it „[1]“ als letzte Tabellenzeile; eine LETZTE Zeile, deren Zellen
   nur Nummern tragen, gilt genauso. Danach prüft `sentenceExtras` die Zahlen gegen genau diese Seite.
2. **„08:00-16:00Uhr“.** `WHOLE_VALUE` verlangt nach einer Uhrzeit keinen Buchstaben; die Frankfurter
   Seite schreibt „Uhr“ angeklebt. Neu: in `numberUnits` wird vor dem Abgleich ein Leerzeichen
   zwischen Uhrzeit und angeklebtem „uhr“/„h“ eingefügt.

Prüfe adversarial: Kann die Fußzeilen-Regel eine Zahl fälschlich „belegt“ aussehen lassen (falsche
Tabelle, verschachtelte Strukturen, Listen, Code, Zitate, zwei Tabellen hintereinander, Fußzeile
mitten im Text, Header-Zeile, Zeilen mit eigener ungültiger Nummer)? Wird die Prüfung irgendwo
WEICHER statt nur richtig zugeordnet? Kann die „Uhr“-Ersetzung Zahlen erzeugen, die nicht auf der
Seite stehen, oder Positionen für Bereiche (`RANGE_GAP`) verschieben, sodass Einheiten falsch
zugeordnet werden? Folgen für Anzeige (`renderer/utils/webAnswerMarkdown.ts`), Export,
`supportingSources`, Zusammenfassung (`summary`).

## Kontext/Anker

- `app/src/shared/rag/citations.ts:97` `TABLE_FOOT_REST`, `:99` `TABLE_DELIMITER_LINE`
- `app/src/shared/rag/citations.ts:410-415` Zeilen-Sammlung mit `refsOnly`
- `app/src/shared/rag/citations.ts:430-457` `tableFoot`, `markTableAbove`, Fußzeile als Absatz und als letzte Zeile
- `app/src/shared/rag/citations.ts:459` `rowRef` (eigene Nummer der Zeile hat Vorrang)
- `app/src/shared/webChat.ts:1059` „Uhr“-Ersetzung in `numberUnits`; `WHOLE_VALUE`, `RANGE_GAP`, `sentenceExtras`
- Tests: `app/src/shared/webChat.test.ts:843` (Fußzeile, mit/ohne Leerzeile, „Quelle:“-Varianten,
  falsche Zeit bleibt Befund, eigene Nummer bleibt), `:864` (Uhr/h), `:870` (keine Vererbung bei
  mehreren Quellen, Fließtext, Zwischentext, zwei Leerzeilen, ungültiger Nummer)
- Bestehende Regeln: CLAUDE.md Abschnitt „Antwortqualität bei Listen“ (Zeilenerbe, Codex F01/F05),
  frühere Prüfungen `docs/codex-collab/chat-antwortqualitaet-und-globus.md`

## Codex-Findings

### F01 — Quellenangabe aus fremdem Markdown-Block belegt die Tabelle
Schwere: hoch
Stelle: app/src/shared/rag/citations.ts:439
Status: [OFFEN]
Die Kandidatenprüfung akzeptiert jedes `prose`-Segment; `prevLine` prüft nur physische Nachbarschaft und ignoriert den Markdown-Block. Konkrete Eingabe: `| Kurs | Uhrzeit |\n|---|---|\n| Kurs A | 08:00 |\n\n- [1]` bei Quelle 1 `Kurs B 08:00`. Das `- [1]` ist ein eigener Listenpunkt, keine Tabellenfußzeile. Dennoch erhalten `Kurs A` und `08:00` jeweils `refs: [1]`, `status: cited-high`, und `sentenceExtras` meldet für `08:00` keine fehlende Zahl. `summary.uncited` wird 0 und `supportingSources` enthält 1. Dasselbe tritt mit `> [1]` als eigenem Zitatblock auf. Die Anzeige bekommt folglich keine Marke für fehlende Quellenzuordnung; auch der Export übernimmt diese Einstufung (`app/src/renderer/utils/webAnswerMarkdown.ts:88-100`, `app/src/shared/webChat.ts:1284-1291`).
Vorschlag: Nur eine eigenständige Quellenzeile im passenden Tabellenkontext als Fußzeile akzeptieren; Listen- und Zitatblöcke müssen die Vererbung unterbrechen.

### F02 — Sichtbarer Inline-Code verschwindet bei der Fußzeilenprüfung
Schwere: mittel
Stelle: app/src/shared/rag/citations.ts:414
Status: [OFFEN]
`maskedSlice` ersetzt Inline-Code vollständig durch Leerzeichen (`app/src/shared/rag/citations.ts:379-387`). Dadurch erfüllen Zeilen mit zusätzlichem sichtbarem Inhalt trotzdem `TABLE_FOOT_REST` (`:415`, `:443`). Beispiel: ``| Kurs | Uhrzeit |\n|---|---|\n| Kurs A | 08:00 |\n\n[1] `nur Kurs B` `` mit Quelle 1 `Kurs B 08:00`. Obwohl die letzte Zeile außer `[1]` den sichtbaren Text `nur Kurs B` enthält und daher keine reine Quellenfußzeile ist, werden `Kurs A` und `08:00` als `cited-high` eingestuft; `missingNumbers` bleibt leer. Auch die letzte Tabellenzeile ``| [1] | `nur Kurs B` |`` löst über `refsOnly` dieselbe Vererbung aus (`:453-457`).
Vorschlag: Bei der Entscheidung „nur Quellenangaben“ sichtbaren Inline-Code und andere sichtbare, bisher maskierte Inhalte als zusätzlichen Inhalt werten.

Gesamturteil: Vor einem Commit die beiden Fälle beheben, weil sie unbelegte Tabellenwerte als quellengetragen ausweisen können. Die 106 bestehenden `webChat.test.ts`-Tests bestehen; die Gegenbeispiele wurden direkt mit `analyzeCitations` und `sentenceExtras` nachgestellt. Die angeklebten `Uhr`/`h`-Fälle und die Bereichszuordnung in `numberUnits` ergaben bei den geprüften Eingaben keinen zusätzlichen Befund.

## Claude-Antwort

Runde 1, umgesetzt nach Freigabe durch den Nutzer (07.11.2026). Beide Befunde nachvollzogen.

- **F01** [ADRESSIERT] Die Fußzeilen-Prüfung testet die GANZEN Zeilen des Absatzes ab Zeilenanfang
  (`whole` in `analyzeCitations`): vor und hinter den Nummern darf nur „Quelle(n):“/„Source(s):“ und
  Satzzeichen stehen. `- [1]` und `> [1]` sind damit keine Fußzeile. Test mit den Eingaben aus F01.
- **F02** [ADRESSIERT] „Nur Nummern?“ wird am ungeblendeten Text geprüft — für die Absatz-Fußzeile
  und für die Letzte-Zeile-Variante (`refsOnly`). Die Nummern selbst werden weiter aus dem
  geblendeten Text gezählt (eine `[1]` im Code zählt nicht). Test mit `[1] \`nur Kurs B\`` und
  `| [1] | \`nur Kurs B\` |`.

Belege: typecheck grün, build grün, Satzprüfungs-Tests 269/269 (`webChat.test.ts`, `citations.test.ts`,
`renderer/utils`). Volle Suite bis auf die bekannte Shell-Umgebungsprobe (Zeitlimit im Parallellauf).

Nachtrag 07.11.2026 (Nutzertest Gießen/Darmstadt, nach Freigabe umgesetzt, noch NICHT von Codex geprüft):

- **Cookie-Banner vor defuddle entfernen** (`removeConsentBanners`, `app/src/main/webResearch/pageExtras.ts`,
  Aufruf in `fetchExtract.ts` nach `analyzePage`). Auf medienzentrum-giessen-vogelsberg.de/oeffnungszeiten/
  wählte defuddle einen 479-Zeichen-Absatz des Complianz-Banners statt des 203-Zeichen-Artikels. Entfernt
  werden Elemente mit Markennamen (cmplz, cookiebot, onetrust, borlabs, usercentrics, …) oder eindeutigen
  Wortpaaren (cookie-banner, consent-manager, …) in Klasse/ID — nie <html>/<body>, nie Elemente mit
  Hauptinhalt; „cookie“ allein bleibt (Keksrezept). Gegenprobe: die Seite liefert jetzt die Zeiten.
- **Uhrzeit ohne führende Null vergleichen** (`timeKey` in `app/src/shared/webChat.ts`, nur im Vergleich
  `pageNumbers`/`notOnPage`, die Anzeige behält die Schreibweise der Antwort). Darmstadt: Seite „8:00“,
  Antwort „08:00“.

## Status

Runde 1: 2 Befunde, beide umgesetzt.
Runde 2 (Nachprüfung F01/F02 + Nachtrag Cookie-Banner/Uhrzeit): ENTFÄLLT nach Nutzerentscheidung 07.11.2026. Stand vom Nutzer in der App abgenommen (Öffnungszeiten Gießen, Frankfurt, Darmstadt ohne Befund).
