# Petrol-Chat-Websuche: Suchwörter aus der Frage und weniger Fehlalarm in der Prüfung

## Aufgabe

Nutzer (25.10.2026) hat dieselbe Alltagsfrage in Claude und im Petrol-Chat (Globus an, LLMBase ·
deepseek-v4.1-flash) gestellt: „Ich will mir selbst ein Balkonkraftwerk mit 8 Modulen installieren
was kosten die Module“. Claude nannte eine Preisspanne, die 2000-Wp-Grenze und drei Wege. Petrol
antwortete: „Zu den Kosten einzelner Module steht in den abgerufenen Seiten nichts“, dazu drei
gelbe Marken, eine davon falsch. Ziel des Chats ist „schnell mal was fragen, gute Antwort“
(Memory `project-petrol-chat-purpose`), bei unverändertem Maßstab **geringe Halluzination**
(`docs/codex-collab/chat-websuche.md`, Abschnitt „Ziel“).

Der Nutzer hat zwei Punkte freigegeben, die schon gebaut sind (uncommittet). **Bitte die Umsetzung
adversarial prüfen**: Löcher suchen, keinen Code ändern.

1. **Suchwörter aus der Frage, ohne Modell.** Bisher ging der getippte Satz wörtlich an den
   Suchanbieter. Jetzt werden Füllwörter weggelassen (nur weggelassen, nie ergänzt oder
   umgeschrieben), und die Zeile über dem Eingabefeld zeigt vor dem Senden genau den Suchtext.
2. **Weniger Fehlalarm in der Satzprüfung.**
   - a) „Zahl nicht in der Seite: 8“: Die 8 stammt aus der Frage. Solche Zahlen heißen jetzt
     getrennt „Zahl aus deiner Frage: 8“, als neutrale Marke ohne Warnfarbe.
   - b) Der Satz „… steht nichts. [1] nennt als Einstiegspreis …“ wurde mit dem nächsten Satz
     verschmolzen, weil `[1]` als nachgestellte Nummer galt. Das „nichts“ hing deshalb als
     „Verneinung“ am Beleg des zweiten Satzes, und die Erkennung „Lücke benannt“ griff nicht.
     Jetzt eröffnet eine Nummer vor einem kleingeschriebenen Wort den neuen Satz.
   - c) Eine Verneinung, die in einem Satz der zitierten Seite mit demselben Verneinungswort und
     mindestens 60 % der Inhaltswörter wiederkehrt, wird nicht mehr markiert („gespiegelt“).

Ausdrücklich NICHT Teil dieser Runde: abgelehnte große Seiten (priwatt.de „zu groß“,
`fetchExtract.ts:101` `rejectTruncatedBody`) und die Frage, ob Petrol bei leeren Seiten aus
allgemeinem Wissen ergänzen darf. Beides folgt später.

## Wie der Chat jetzt sucht (für den Prüfer)

- Globus an → `PetrolChat.tsx` berechnet `suggestedWebQuery = searchWordsFromQuestion(draft)`
  (`app/src/renderer/components/Agent/PetrolChat.tsx:121`). Ohne eigene Eingabe des Nutzers ist das
  der Suchtext (`:122`).
- Die eingeklappte Zeile zeigt „Websuche bei Tavily nach: Balkonkraftwerk 8 Modulen installieren
  kosten Module“, sobald der Suchtext von der Frage abweicht (`:705-709`), sonst wie bisher
  „Websuche: deine Frage an Tavily“. „ändern“ öffnet das Feld mit dem Vorschlag (`:711`).
- Gesendet wird `webQueryNorm` (unverändert, `send()`), der Main prüft wie bisher Länge und Leere
  (`app/src/main/index.ts` Handler `petrol-chat-web`, ab `:6809`). Der Verlauf zeigt bei
  abweichendem Suchtext schon heute „Suchwörter: …“ an der Frage (`PetrolChat.tsx:550`).
- Die Modellfrage bleibt die vollständige getippte Frage. Nur die Suche bekommt die Stichwörter.

## Kontext/Anker

- Suchwörter: `app/src/shared/webChat.ts:313` (`SEARCH_FILLER`), `:350` (`searchWordsFromQuestion`).
  Verneinungen (`nicht`, `kein…`, `ohne`) stehen bewusst nicht in der Liste (Codex F05,
  `chat-suchwoerter-vorschlag.md`). Unter zwei verbleibenden Wörtern gilt die Frage unverändert.
- Frühere Entscheidungen, gegen die zu prüfen ist: `docs/codex-collab/chat-suchwoerter-vorschlag.md`
  (F01–F07; V1/V2 mit Modellvorschlag abgelehnt, F08 „gesendet wird exakt der sichtbare Text,
  nichts still gekürzt“), `chat-suchqualitaet.md` (Gesprächssatz-Warnung `looksConversational`,
  Sperrliste).
- Zahlen aus der Frage: `app/src/shared/webChat.ts:686` (`questionNumbers`), `:718`
  (`sentenceExtras` mit neuem Parameter `question`), Aufruf `app/src/main/index.ts:7008`.
  Anzeige: `app/src/renderer/utils/webAnswerMarkdown.ts:21-45` (Marke `questionNumber`,
  `NEUTRAL_FLAGS`, `onlyNeutralFlags`), `app/src/renderer/components/Agent/PetrolWebAnswer.tsx:25,43,71,134-137`,
  CSS `.petrol-web-flag.is-neutral` (vorher `is-gap`). Export/Kopie: `PetrolChat.tsx:312`
  (`webFlagLabel`, die neutrale Marke erscheint dort unter „Hinweise“).
- Gespiegelte Verneinung: `app/src/shared/webChat.ts:747` (`negationMirrored`, Schwelle 0,6).
- Satztrennung: `app/src/shared/rag/citations.ts:322-331`. **Gilt auch für den Vault-Chat**
  (gemeinsamer Prüfer `analyzeCitations`).
- Tests: `app/src/shared/webChat.test.ts` (Blöcke „Weniger Fehlalarm …“ und „Suchwörter aus der
  Frage …“), `app/src/shared/rag/citations.test.ts` (Block „Quellennummer als Satzanfang …“).

## Messung (25.10.2026, Dev-App, Tavily, echte Suche und Abrufe, Modellphase abgebrochen)

Fünf Alltagsfragen, je drei Suchtexte: **A** = Frage wörtlich (bisher), **B** = `searchWordsFromQuestion`
(neu), **C** = Suchanfrage eines Modells (qwen3.8:27b, nur zum Vergleich, nicht gebaut).
Bewertet sind die drei abgerufenen Seiten (Host | Titel).

| Fall | A Frage wörtlich | B Stichwörter (gebaut) | C Modell (nur Vergleich) |
|---|---|---|---|
| 0 Balkonkraftwerk, 8 Module, Kosten | balkonstrom „installieren lassen“, adac „Speicher“, ndr „Wann lohnt sich“; priwatt „zu groß“ | alpha-solar „Große Balkonkraftwerke mit 8 Modulen“, drbo „mit 8 Modulen“, balkonstrom „Was kostet ein Balkonkraftwerk?“ | alpha-solar, flexisolar „mit 8 Modulen kaufen“, balkonstrom „Was kostet …“ |
| 1 Kühlschrank brummt | arekoreshop, haus.de, mediamarkt.at | arekoreshop, mediamarkt.de, haus.de | gleich wie B |
| 2 Elterngeld bei 3000 brutto | meinelterngeld24 „Elterngeld bei 3.000 Euro Brutto: 1.080–1.444 €“, smart-rechner, einfach-elterngeld | einfach-elterngeld, elterngeld.de, kindergeld.org (alle Rechner, keine Zahl zu 3000) | elterngeld.net „Höchstbetrag“, finanztip, zbfs.bayern |
| 3 Wärmepumpe Haus 1975 | viessmann, sfs-schaible, reduco „60er-/70er-Haus“ | reduco, viessmann, finanztip „Eignet sich Dein Haus?“ | heizungsfinder, energie-experten, n-tv (allgemein, schlechter) |
| 4 Auto nach Kroatien, Vignette | merkur „Maut und Vignette“, vignetim, oeamtc „Maut & Vignette“ | merkur, billiger-mietwagen, autopay „Maut nach Kroatien“ | autopay, tollwayr, oeamtc |

**Ehrliche Lesart:** B ist in Fall 0 klar besser, in Fall 2 schlechter (A fand die Seite mit genau
der Zahl), in 1, 3, 4 etwa gleich. C ist nicht besser als B. Eine Wiederholung je Variante; in
Fall 4 lief die Messung noch mit einer älteren Füllwortliste („beachten“, „nach“ blieben stehen).
Das ist **kein eindeutiger Sieg** nach unserer Regel „Sieger nur bei mehr Treffern“ — Fall 2 zeigt,
dass Tavily ganze Sätze teils gut versteht. Frage an Codex dazu unten (Frage 6).

## Fragen an Codex

1. Trägt die Füllwortliste das Ziel, oder entfernt sie Wörter, die eine Frage umdrehen oder
   eingrenzen (Ort, Zeit, Person, Ausnahme, „über/unter/bis“)? Konkrete Gegenbeispiele bitte.
2. F08: Ist „sichtbar in der eingeklappten Zeile, vor dem Senden“ genug, oder muss der Nutzer die
   Kürzung bestätigen? Wird irgendwo noch der volle Satz statt der Stichwörter (oder umgekehrt)
   gesendet oder angezeigt (Nachfrage-Übernahme `followUpQuery`, „Im Agenten neu recherchieren“,
   Verlauf, Web-Themen)?
3. Zahl aus der Frage als NEUTRALE Marke: Öffnet das einer Suggestivfrage („Sind es 20 Euro?“ →
   „Der Beitrag beträgt 20 Euro [1]“) einen Weg, eine falsche Zahl ohne Warnfarbe als Seitenbeleg
   durchzubringen? Was wäre die richtige Darstellung?
4. Gespiegelte Verneinung: Lässt sich die 60-%-Regel austricksen (Verneinung im Seitensatz bezieht
   sich auf etwas anderes, Doppelverneinung, Satztrenner der Seiten)?
5. Satztrennung: Bricht die neue Regel Fälle im Vault-Chat (Abkürzungen, Zitate, Listen,
   `[1]` gefolgt von Kleinschreibung, die doch zum alten Satz gehört)?

6. Rechtfertigt die Messung (1 besser, 1 schlechter, 3 gleich) die Änderung des Standards, oder
   wäre ein anderer Weg besser (z. B. Stichwörter nur bei langen Fragen, oder beide Suchen und
   Treffer zusammenführen)? Mit Blick auf Kosten (Tavily-Abfragen) und Wartezeit.

## Codex-Findings

### F01 — Die Füllwortliste entfernt sachliche Einschränkungen
Schwere: hoch
Stelle: app/src/shared/webChat.ts:324; app/src/shared/webChat.ts:330; app/src/shared/webChat.ts:350; app/src/renderer/components/Agent/PetrolChat.tsx:121
Status: [OFFEN]

Die Liste streicht nicht nur Gesprächsfüllung: „mit“, „oder“, „nur“, „nach“, „seit“, „heute“ und „gestern“ können den gesuchten Fall bestimmen. „Preis mit oder ohne Speicher“ wird zu „Preis ohne Speicher“; der angefragte Vergleich verschwindet. „Was gilt bei Kündigung nach Elternzeit?“ verliert die zeitliche Beziehung. Auch der Ortsname „Oder“ wird wegen `toLowerCase()` als Bindewort entfernt: „Hochwasser an der Oder 2025“ ergibt „Hochwasser 2025“. Der spätere Wortvergleich prüft nur die so ausgewählten Seiten, nicht die Abdeckung der ursprünglichen Frage. Die sichtbare Suchzeile erlaubt Korrektur, aber die Änderung ist als Standard voreingestellt und wird nicht als inhaltliche Auslassung markiert. Vorschlag: Keine allgemeine Streichliste als Standard; höchstens eng nachgewiesene Gesprächsanfänge entfernen und sachliche Relationen, Zeitwörter sowie mögliche Eigennamen bewahren. Gegenbeispiele zu Vergleich, Zeit und Ort als Tests aufnehmen.

### F02 — Eine falsche Zahl aus der Frage wirkt neutral belegt
Schwere: hoch
Stelle: app/src/shared/webChat.ts:718; app/src/shared/webChat.ts:728; app/src/renderer/utils/webAnswerMarkdown.ts:24; app/src/renderer/components/Agent/PetrolWebAnswer.tsx:108; app/src/renderer/components/Agent/PetrolWebAnswer.tsx:134
Status: [OFFEN]

Die vorhandene Suggestivfragen-Probe belegt bereits den Pfad: Quelle „Der Beitrag beträgt 18,36 Euro“, Frage „Sind es 20 Euro?“, Antwort „Der Beitrag beträgt 20 Euro [1]“ (`webChat.test.ts:300-304`). `20` wird aus `missingNumbers` entfernt und als `questionNumbers` geführt. Wegen der übrigen gemeinsamen Wörter erreicht der Satz die Schwelle für `cited-high` (`shared/rag/citations.ts:415-427`); seine einzige Marke ist dann neutral, die Zeile erhält kein `is-weak`, und die Kurzprüfung zählt keine fehlende Zahl. Die App zeigt somit eine falsche Zahl mit Quellenziffer und „hoher Wortübereinstimmung“, obwohl die Seite sie nicht enthält. Vorschlag: Jede Zahl, die in der zitierten Seite fehlt, als Warnung belassen; ihre Herkunft aus der Frage ergänzend nennen („nur aus deiner Frage, nicht in der Quelle“). Den Fall als vollständigen Test von Bericht, Flag und Anzeige prüfen.

### F03 — Gleiche Verneinung kann die Aussage umkehren
Schwere: hoch
Stelle: app/src/shared/webChat.ts:747; app/src/shared/webChat.ts:751; app/src/shared/webChat.ts:755; app/src/renderer/utils/webAnswerMarkdown.ts:46
Status: [OFFEN]

`negationMirrored` verlangt nur dasselbe Verneinungswort irgendwo im Seitensatz und 60 % der **verschiedenen** Inhaltswörter des Antwortsatzes. Quelle: „Die Solaranlage mit Speicher ist nicht erlaubt.“ Antwort: „Die Solaranlage ohne Speicher ist nicht erlaubt [1].“ Das veränderte „mit/ohne“ kehrt den betroffenen Fall um; trotzdem treffen „Solaranlage“, „Speicher“ und „erlaubt“ drei von vier Inhaltswörtern, und „nicht“ steht in beiden Sätzen. Die Verneinungswarnung entfällt; der allgemeine Wortvergleich stuft den Satz ebenfalls hoch ein (`shared/rag/citations.ts:415-427`). Eine längere Seite mit mehreren ähnlichen Fallbeschreibungen bietet denselben Weg. Vorschlag: Verneinung nicht durch Wortanteil „freisprechen“. Die Marke als Hinweis auf eine nicht geprüfte logische Beziehung belassen, bis eine Prüfung die Zuordnung von Subjekt, Bedingung und Verneinung tatsächlich tragen kann.

### F04 — Die Gesprächswarnung prüft erst die umgeschriebene Suche
Schwere: mittel
Stelle: app/src/shared/webChat.ts:295; app/src/shared/webChat.ts:313; app/src/shared/webChat.ts:350; app/src/renderer/components/Agent/PetrolChat.tsx:149
Status: [OFFEN]

Die bisherige Warnung galt für Gesprächssätze als Suchtext. Nun prüft `looksConversational` nur noch `webQueryNorm`, nachdem `searchWordsFromQuestion` den Anfang entfernt hat. „Okay, schauen wir mal: Elterngeld 2025“ wird zu „schauen Elterngeld 2025“: „Okay“, „wir“ und „mal“ fallen weg, „schauen“ bleibt; die Warnmuster am Anfang greifen nicht mehr. Der Nutzer bekommt damit weder den bisherigen Gesprächssatz-Hinweis noch eine gezielte Meldung, dass „schauen“ ein untauglicher Suchbegriff ist. Vorschlag: Bei automatisch erzeugten Suchwörtern auch die ursprüngliche Frage auf Gesprächsform prüfen oder die Transformation nur anwenden, wenn nach Entfernen des Gesprächsanfangs eigenständige Sachbegriffe übrig bleiben.

### Urteil zu Frage 6

Die Messung trägt eine Änderung des Standards noch nicht: ein besserer, ein schlechterer und drei etwa gleiche Fälle bei nur einer Wiederholung. B sollte vorerst ein sichtbarer, editierbarer Vorschlag für klar lange oder gesprächige Fragen sein; auch die Längenschwelle braucht Gegenproben. Zwei automatische Tavily-Suchen verdoppeln die Suchabfragen, erhöhen Wartezeit und lösen die hier gefundenen semantischen Auslassungen nicht. F08 bleibt im aktuellen Sendepfad technisch gewahrt (`PetrolChat.tsx:703-711`, `:277`, `main/index.ts:6847-6849`): der tatsächlich gesendete Suchtext ist vorher sichtbar und wird nicht still gekürzt. Dafür braucht es keine weitere Bestätigung, wohl aber eine klare Kennzeichnung des automatischen Weglassens. Die Nachfrage-Übernahme hängt die vorige gesendete Query nur nach Nutzerklick an (`PetrolChat.tsx:137-139`); Web-Themen und „Im Agenten neu recherchieren“ verwenden bewusst die ursprüngliche Nutzerfrage (`chatHistory.ts:79`, `PetrolChat.tsx:436-441`) und sind damit neue, möglicherweise anders treffende Suchen. Für die neue Satztrennung fand ich keinen belegten zusätzlichen Vault-Fehler: `[1]` vor kleingeschriebenem Wort wird zum nächsten Satz gezogen (`shared/rag/citations.ts:322-330`); die zwei vorhandenen Tests prüfen genau diesen Fall und den großgeschriebenen Gegenfall (`citations.test.ts:232-245`).

### Runde 2

Nachprüfung F01: **[NICHT BEHOBEN]** Der Standard ist wieder die wörtliche Frage (`app/src/renderer/components/Agent/PetrolChat.tsx:120`), und die drei deutschen Gegenbeispiele sind repariert (`app/src/shared/webChat.test.ts:498-502`). Das angebotene Kürzen entfernt aber im Englischen weiterhin „with“ und „or“ (`app/src/shared/webChat.ts:336-338`); siehe F05. Die Großschreibungsregel hat zudem einen Ortsnamen-Grenzfall, siehe F06.

Nachprüfung F02: **[BEHOBEN]** `questionNumber` steht nicht mehr in `NEUTRAL_FLAGS` (`app/src/renderer/utils/webAnswerMarkdown.ts:24`), `WebCheck` zählt diese Sätze in der Zahlenwarnung und färbt ihre Zeile als schwach (`app/src/renderer/components/Agent/PetrolWebAnswer.tsx:116-118`, `:133-141`). `webFlagLabel` verwendet für Anzeige und Export denselben Wortlaut „nur aus deiner Frage, nicht in der Seite“ (`PetrolWebAnswer.tsx:43`, `app/src/renderer/utils/i18n/petrolChat.ts:169`, `PetrolChat.tsx:309-315`).

Nachprüfung F03: **[BEHOBEN]** `sentenceExtras` setzt `negation` wieder bei jedem erkannten Verneinungswort in einem zitierten Satz; die Freigabe durch `negationMirrored` ist entfernt (`app/src/shared/webChat.ts:758-760`). Der frühere „mit/ohne Speicher“-Gegenfall wird jetzt ausdrücklich getestet (`app/src/shared/webChat.test.ts:315-319`).

Nachprüfung F04: **[BEHOBEN]** `offerSearchWords` prüft `looksConversational` auf der Originalfrage (`app/src/shared/webChat.ts:375-382`); nach Übernahme der vorgeschlagenen Query bezieht `webQueryChatty` die Originalfrage weiter ein (`app/src/renderer/components/Agent/PetrolChat.tsx:151`). Beim Klick öffnet sich das Feld mit dem konkreten Suchtext (`PetrolChat.tsx:709-710`, `:719-727`); gesendet wird genau `webQueryNorm` (`:279`). Die Qualität des angebotenen Texts bleibt ein eigener Befund F07.

### F05 — Englischer Vergleich kippt trotz der deutschen Reparatur
Schwere: hoch
Stelle: app/src/shared/webChat.ts:336-338; app/src/shared/webChat.ts:353-365; app/src/shared/webChat.ts:375-382
Status: [OFFEN]

„Can you compare the price with or without storage?“ ist zugleich ein erkannter Gesprächssatz (`looksConversational`) und wird als Stichwortangebot zu „compare price without storage“: Die englische Liste entfernt `with` und `or`, lässt `without` stehen. Damit verschwindet genau wie zuvor im deutschen F01 der Preisvergleich mit Speicher; die vorgeschlagenen Treffer können nur eine Seite des Vergleichs belegen. Der Nutzer muss zwar klicken, aber der Knopf stellt die Kürzung als brauchbare Stichwörter dar. Die Tests decken nur den deutschen Vergleich ab (`app/src/shared/webChat.test.ts:498-502`). Vorschlag: Englische Relationswörter für Vergleich und Ausschluss ebenso bewahren; mit/ohne- und with/without-Paare einschließlich der UI-Angebotsentscheidung testen.

### F06 — Großgeschriebener Ortsname nach Doppelpunkt fällt weiter weg
Schwere: mittel
Stelle: app/src/shared/webChat.ts:356-364; app/src/shared/webChat.ts:375-382
Status: [OFFEN]

Die neue Namensregel schützt „Oder“ nur mitten im Satz ohne vorangehendes Satzzeichen. In „Bitte suche Informationen zum Fluss: Oder Hochwasser 2025“ gilt `Oder` wegen `Fluss:` als Satzanfang und wird als Bindewort entfernt. Die Frage hat acht Wörter und mindestens drei Streichungen; `offerSearchWords` bietet also eine Suche ohne den Flussnamen an. Der Test „an der Oder“ prüft diesen Grenzfall nicht (`app/src/shared/webChat.test.ts:501`). Vorschlag: Großgeschriebene mögliche Eigennamen nicht allein wegen eines vorangehenden Doppelpunkts entfernen; bei mehrdeutigen Fällen lieber die sichtbare Originalfrage belassen.

### F07 — Angebot für Gesprächssätze enthält weiter Gesprächswörter
Schwere: mittel
Stelle: app/src/shared/webChat.ts:333-335; app/src/shared/webChat.ts:375-382; app/src/shared/webChat.test.ts:504-509; app/src/renderer/components/Agent/PetrolChat.tsx:709-710
Status: [OFFEN]

Der neue Knopf wird gerade für „Okay, schauen wir mal: Elterngeld 2025“ angeboten. Der zugehörige Test erwartet wörtlich „schauen Elterngeld 2025“: `schauen` bleibt, obwohl es hier nur Teil der Gesprächsform ist. Nach Klick steht der Text zwar sichtbar im Feld, aber die App bietet eine erkennbar schlechtere Sachsuche als „Elterngeld 2025“ aktiv an. Die weiter sichtbare Gesprächswarnung aus F04 behebt die schlechte Auswahl nicht. Vorschlag: Bei Gesprächssätzen den bekannten Auftakt als ganze Wendung entfernen oder für diesen Fall nur das manuell editierbare Feld anbieten; kein Stichwortangebot mit verbliebenem Gesprächsverb.

## Claude-Antwort

### Runde 1 (25.10.2026)
Alle vier Befunde nachgestellt, alle tragen (F01: „Preis mit oder ohne Speicher“ → „Preis ohne
Speicher“, „an der Oder“ verschwand; F02: Satz `cited-high` mit nur neutraler Marke; F03:
„ohne Speicher nicht erlaubt“ ohne Verneinungsmarke; F04: „schauen Elterngeld 2025“ ohne Warnung).
Nutzer hat die Empfehlung freigegeben.

- **F01 [ADRESSIERT]** Stichwörter sind kein Standard mehr, nur noch ein Knopf „Stichwörter
  verwenden“ (`offerSearchWords`: ab 8 Wörtern mit mindestens 3 Füllwörtern oder bei Gesprächssatz).
  Liste enger: „mit“, „oder“, „nur“, „nach“, „seit“, „heute“, „gestern“ bleiben; ein großgeschriebenes
  Füllwort mitten im Satz bleibt (Name). Tests „Vergleich, Zeit und Namen bleiben“.
- **F02 [ADRESSIERT]** Zahl aus der Frage bleibt Warnung („Zahl nur aus deiner Frage, nicht in der
  Seite: 8“), zählt in der Kurzprüfung mit; `NEUTRAL_FLAGS` enthält nur noch `gap`.
- **F03 [ADRESSIERT]** `negationMirrored` entfernt; jede Verneinung in einem Satz mit Nummer wird
  wieder markiert. Die falsche Marke aus dem Nutzerfall beseitigt allein die neue Satztrennung.
- **F04 [ADRESSIERT]** Angebot prüft die Originalfrage auf Gesprächsform; nach Übernahme der
  Stichwörter warnt die Zeile weiter, wenn die Originalfrage ein Gesprächssatz war.
- **Frage 6:** Standard bleibt die wörtliche Frage. Für einen Standardwechsel braucht es eine
  größere Messung (etwa 20 Fragen mit Wiederholungen).

Belege: typecheck grün, betroffene Testdateien 84/84, Gesamtlauf 3017 grün (2 Shell-Umgebungsprobe- und
1 Index-Test scheitern nur unter Last an der Zeitgrenze, einzeln grün), Build grün. Nicht geprüft:
GUI (Knopf in Zeile und Feld).

### Runde 2 (25.10.2026)
Nachgestellt: F05 und F07 tragen, F06 nicht. Nutzer hat F05 und F07 freigegeben.

- **F05 [ADRESSIERT]** „with“ und „or“ von der englischen Liste genommen; Test „englischer
  Vergleich bleibt erhalten“ („compare price with or without storage“).
- **F06 [ABGELEHNT: trifft nicht zu]** „oder“ steht seit Runde 1 nicht mehr auf der Liste.
  Nachgestellt: „Bitte suche Informationen zum Fluss: Oder Hochwasser 2025“ ergibt
  „Informationen Fluss Oder Hochwasser 2025“; der Flussname bleibt.
- **F07 [ADRESSIERT]** Gesprächsauftakt fällt vor dem Kürzen als ganze Wendung (`OPENER_RE` in
  `app/src/shared/webChat.ts`: Interjektion nur mit Satzzeichen oder mit folgender Wendung wie
  „schauen wir mal“, „lass uns mal schauen“, „sag mal“). „Okay, schauen wir mal: Elterngeld 2025“
  bietet „Elterngeld 2025“ an; „Okay, schauen wir mal“ allein bietet nichts an; „Gut Hohenhaus
  Öffnungszeiten“ bleibt unangetastet.

Belege: typecheck grün, betroffene Testdateien 86/86, Gesamtlauf 3018 grün. Rot sind nur die
Shell-Umgebungsprobe (Zeitgrenze 5 s beim Python-Import, Datei unverändert, um 13:05 einzeln grün)
und unter Last ein Index-Test (einzeln grün).

## Status

Angelegt 25.10.2026. Runde 1 (F01–F04) und Runde 2 (F05–F07) geprüft; F06 abgelehnt, Rest adressiert. Abnahme durch Nutzer offen.
