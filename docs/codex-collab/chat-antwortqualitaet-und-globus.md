# Petrol-Chat: Antwortqualität bei Listen, Globus bleibt an, Nachfrage ohne Klick

## Aufgabe

Adversarial prüfen, nicht bestätigen. Drei zusammenhängende Änderungen nach einem Nutzertest mit 1.1.5 (Claude Haiku 5.5 über OpenRouter, Frage „alle Nasomatto-Düfte, nach Beliebtheit sortiert“):

1. **Antwortregeln (Systemtext der Webantwort).** Vorher listete das Modell jede Variante (Extrait / Oil-based) als eigenen Duft, begann mit „keine vollständige Liste“ und setzte `[2]` in jede Tabellenzelle. Die Daten waren vollständig (dieselben Zahlen wie in einer Referenzantwort von Claude). Neu: Ergebnis zuerst; erst ordnen und Seiten abgleichen; Varianten = ein Eintrag; keine selbst gerechneten Zahlen; fette Zwischenzeilen erlaubt; Quellennummer einmal je Tabellenzeile hinter dem Namen.
2. **Satzprüfung.** Eine Nummer in irgendeiner Zelle einer Tabellenzeile gilt für alle Zellen dieser Zeile ohne eigene Nummer (`rowRefs`). Eine Rangspalte (reine Ganzzahl in erster Spalte) gilt als Etikett, auch wenn sie eine Nummer erbt.
3. **Chat-Bedienung (Nutzerwunsch).** Der Globus bleibt nach dem Senden an; der letzte Klick wird als `petrolWebSticky` (uiStore, persistiert) für neue Chats gemerkt. Jede erfolgreiche Webantwort mit `snapshotId` wird automatisch als Nachfrage vorgemerkt (`followUp`); wirksam nur bei ausgeschaltetem Globus, sichtbar als Hinweis mit „Nicht einbeziehen“.

Gesucht: Regressionen und Löcher. Insbesondere:
- Kann das Zeilen-Erbe eine falsche Zahl freisprechen oder eine Zelle einer falschen Quelle zuordnen (Kopfzeile, mehrzeilige Zellen, Tabellen ohne führendes `|`, zwei Tabellen, Zellen mit eigener ungültiger Nummer, Zitate in Zellen)? Fallen Fußnoten-Export, `supportingSources`, Warnzählung, Anzeige (`markKind`) dadurch anders aus?
- Kann die Rangspalten-Regel echte Sachzahlen in der ersten Spalte verschlucken (z. B. „| 8 | GB |“, „| 12 | Cluster |“)?
- Widersprechen die neuen Prompt-Regeln älteren (z. B. „In Sätzen ohne Nummer keine Zahlen“, „nicht über Auszüge reden“, Quellen-/Modellwissen-Trennung, Vault-/Follow-up-Weg)? Gilt der Prompt auch für Nachfragen (`followUp`) und ist das dort richtig?
- Globus: Datenweg und Kosten (jede Frage sucht im Netz, auch „Danke“), Wechselwirkung mit `webDeep`, `webQuery`, `offerPreviousTopic`, „Erneut senden“, Übergabe an den Auftrag, Tab-Wechsel, Modul aus / Webrecherche nicht eingerichtet, Cloud-Freigabe. Ist ein persistierter „an“-Zustand für neue Nutzer/Profile ein stiller Datenweg?
- Automatische Nachfrage: Kann eine Nachfrage an eine falsche/alte Antwort binden (Stopp, Fehler, Nachfrage-Kette, „Neues Gespräch“, mehrere Tabs, verworfener Snapshot)? Widerspricht das den alten Entscheidungen (Webwechsel nie im Modellverlauf, `asksAboutOldWebSources`, F01 aus chat-recherche-zum-agenten.md „ehrlich sagen, dass sie nicht mitgelesen werden“)?

## Kontext/Anker

- Systemtext: `app/src/main/llm/petrolWebPrompt.ts:45-57`; Tests `app/src/main/llm/petrolWebPrompt.test.ts`
- Zeilen-Erbe: `app/src/shared/rag/citations.ts:368-380` (Vorlauf), `:411` (Erbe)
- Rangspalte: `app/src/shared/webChat.ts:1173-1175` (`sentenceExtras`), `isTableLabelCell` ebenda
- Tests: `app/src/shared/webChat.test.ts:807-830`
- Globus: `app/src/renderer/stores/uiStore.ts:745,1111,1336,1449`; `app/src/renderer/stores/petrolChatStore.ts:147` (Startwert), `:258` (kein Zurücksetzen mehr); `app/src/renderer/components/Agent/PetrolChat.tsx` Globus-Knopf (`setPetrolWebSticky`) und Suchfeld-Aus
- Automatische Nachfrage: `app/src/renderer/stores/petrolChatStore.ts:314`; Anzeige/Senden `app/src/renderer/components/Agent/PetrolChat.tsx:163,298` und Hinweis `followUpActive`; Snapshot nur bei zitierter Quelle `app/src/main/index.ts:7264`
- Texte: `app/src/renderer/utils/i18n/petrolChat.ts` (`followUpChip`, `followUpNoSearch`)
- Store-Tests: `app/src/renderer/stores/petrolChatStore.test.ts:124ff`
- Frühere Entscheidungen: CLAUDE.md Abschnitt „Agent-Tab: Umschalter Chat | Auftrag“ (Websuche im Chat, Hiermit weiterfragen, Quellenkritik); `docs/codex-collab/chat-websuche.md`, `chat-recherche-zum-agenten.md`, `chat-webthema-im-verlauf.md`
- Messung (CDP, Haiku 5.5, Frage wörtlich): 1.1.5 → 31 Zeilen mit Varianten; neu 6 Läufe → 15 Düfte, Varianten getrennt, Warnungen meist 1–4 (ein Lauf 29 vor der Schärfung „in JEDER Zeile“, einer 15 rot durch Summen vor „Rechne keine neuen Zahlen“). Kontrollen Exzellenzcluster/A13 sauber.

## Codex-Findings

### F01 — Maskierte Quellennummern belegen plötzlich die ganze Tabellenzeile
Schwere: hoch
Stelle: app/src/shared/rag/citations.ts:376
Status: [OFFEN]
Beschreibung: Der neue Vorlauf durchsucht den **rohen** Zell-Span nach `[n]` (`app/src/shared/rag/citations.ts:368-379`). Erst der zweite Durchlauf blendet Inline-Code und Linkziele mit `ranges` aus (`:387-411`). Eigene In-Memory-Gegenprobe mit `analyzeCitations` und `sentenceExtras`: Für `| \`[1]\` | 9999 |` bei Quelle 1 mit Text `9999` meldet der Bericht **keine** echte Referenz (`report.refs=[]`, `usedSources=[]`), aber beide Zellen erben `[1]`; `9999` wird `cited-high`, ohne Zahlenwarnung. Dasselbe passiert mit `[1]` im Ziel von `[X](https://x.test/[1])`. `supportingSources` führt Quelle 1 trotzdem (`app/src/shared/rag/citations.ts:469-474`), während der Fußnotenexport nur echte `report.refs` umwandelt und hier keine Fußnote erzeugt (`app/src/shared/webChat.ts:1234-1238`). So widersprechen sich Anzeige, Prüfbilanz und Export; eine unzitierte Zahl kann als belegt erscheinen.
Vorschlag: `rowRefs` ausschließlich aus den im zweiten Durchlauf nach Maskierung erkannten gültigen `CitationRef` aufbauen; danach die Zell-Erbschaft bestimmen. Inline-Code und Linkziele als Gegenproben testen.

### F02 — Eine Sachzahl in Spalte eins wird als Rang ohne Prüfung freigesprochen
Schwere: hoch
Stelle: app/src/shared/webChat.ts:1175
Status: [OFFEN]
Beschreibung: Die neue Regel betrachtet jede reine Ganzzahl bis drei Stellen in der ersten Tabellenspalte als Etikett, unabhängig von Spaltenkopf und Bedeutung (`app/src/shared/webChat.ts:1120-1129`, `:1173-1175`). Eigene Gegenprobe: `| Größe | Einheit | / |---|---| / | 8 | GB [1] |` mit Quelle 1 `GB` ergibt für `8` zwar `refs:[1]` und `status:cited-low`, aber `sentenceExtras` liefert `label:true`, `missingNumbers:[]`; `sentenceFlags` beendet bei `label` sofort und unterdrückt damit auch die Warnmarke (`app/src/renderer/utils/webAnswerMarkdown.ts:88-99`). Dasselbe betrifft etwa `| 12 | Cluster [1] |`. Die Sachzahl kann fehlen oder falsch sein und bleibt trotzdem ohne rote Zahlwarnung.
Vorschlag: Rangspalten nur bei explizitem Rang-/Positionskopf (oder einer geprüften fortlaufenden Sequenz) ausnehmen; sonst die erste Zahl wie jede andere Sachzahl gegen die Quelle prüfen.

### F03 — „Erneut senden“ umgeht einen sichtbar eingeschalteten Globus
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:297
Status: [OFFEN]
Beschreibung: Nach einem Webfehler bleibt `webArmed` nun an, weil `send` es nicht mehr zurücksetzt (`app/src/renderer/stores/petrolChatStore.ts:248-263`, `:304-315`); der Globus zeigt weiter `is-on` (`app/src/renderer/components/Agent/PetrolChat.tsx:725-736`). Der Fehlerknopf ruft jedoch `send(turn.question.content, ...)` auf (`:600-608`). Wegen `text !== undefined` ist `withWeb` dann stets `false`, und bei einer gescheiterten frischen Websuche fehlt auch `followId` (`:290-310`): Der Store nimmt den normalen Chat-Zweig ohne neue Suche (`app/src/renderer/stores/petrolChatStore.ts:266-267`, `:318-323`). Der Nutzer kann so nach einem Suchfehler unter aktivem Globus eine ungestützte Modellantwort erhalten. Vor der Änderung war der Globus nach dem Senden aus; die neue Persistenz macht den alten Retry-Pfad irreführend.
Vorschlag: Den Wiederholungsweg aus der fehlgeschlagenen Frage ableiten und bei aktivem Globus eine neue Websuche starten, oder vor dem Retry sichtbar und eindeutig auf „ohne Web“ umschalten.

### F04 — Aufforderung zum Zählen widerspricht dem Verbot neuer Zahlen
Schwere: mittel
Stelle: app/src/main/llm/petrolWebPrompt.ts:46
Status: [OFFEN]
Beschreibung: Der neue Systemtext verlangt bei mitgezählten Varianten die Zahl der **eigenständigen** Einträge (`app/src/main/llm/petrolWebPrompt.ts:46`), verbietet unmittelbar danach neue Rechnungen und erlaubt Zahlen nur, wenn sie bereits im Auszug stehen (`app/src/main/llm/petrolWebPrompt.ts:47-49`). Enthält eine Seite nur die Varianteneinträge, muss das Modell die Anzahl erst durch Zusammenfassen und Zählen bilden; diese Zahl kann den eigenen Belegprüfer nicht bestehen. Eigene Gegenprobe: `15 eigenständige Düfte [1].` bei einer Quelle ohne die ausdrücklich genannte Zahl `15` liefert `sentenceExtras.missingNumbers=['15']` (`app/src/shared/webChat.ts:1185-1190`). Gerade die neue Listenregel fordert also eine Aussage, die als rote Zahlwarnung endet.
Vorschlag: Entweder nur eine auf der Seite ausdrücklich genannte Anzahl verlangen oder eine eigene, überprüfbare Zählregel für eindeutig benannte Einträge einführen; die beiden Prompt-Regeln dabei vereinbaren.

### F05 — Gemischte Zeilen vererben alle Quellen an unmarkierte Zellen
Schwere: mittel
Stelle: app/src/shared/rag/citations.ts:379
Status: [OFFEN]
Beschreibung: `rowRefs` vereinigt alle gültigen Nummern einer physischen Tabellenzeile und gibt **jede** davon an eine Zelle ohne eigene Nummer weiter (`app/src/shared/rag/citations.ts:373-379`, `:411`). Die Prüfung wählt bei Wortdeckung das Maximum über diese Quellen (`:430-442`); `sentenceExtras` akzeptiert Zahlen, die in **irgendeiner** davon stehen (`app/src/shared/webChat.ts:1185-1190`). Gegenprobe: Bei `| P [1] | Falsch [2] | 9999 |`, Quelle 1 `P 9999`, Quelle 2 `etwas ganz anderes`, erhält `9999` die Referenzen `[1,2]` und `cited-high`; der explizite Satz `Falsch [2]` bleibt `cited-low`, dennoch zählt `supportingSources` auch Quelle 2 wegen der geerbten Hochwertung (`app/src/shared/rag/citations.ts:469-474`). Die Anzeige kann damit eine Quelle als tragend aufführen, die die betreffende unmarkierte Zelle gar nicht stützt.
Vorschlag: Bei mehreren verschiedenen Quellennummern in einer Zeile unmarkierte Sachzellen nicht automatisch mit der Vereinigung belegen; eine eindeutige Zuweisung verlangen oder den mehrdeutigen Status sichtbar lassen.

### F06 — „Neues Gespräch“ ignoriert den gespeicherten Globus-Startwert
Schwere: mittel
Stelle: app/src/renderer/stores/petrolChatStore.ts:375
Status: [OFFEN]
Beschreibung: Ein neu angelegter Chat-Bereich übernimmt `petrolWebSticky` als `webArmed` (`app/src/renderer/stores/petrolChatStore.ts:138-150`), und der letzte Globus-Klick schreibt diesen Wert persistiert (`app/src/renderer/components/Agent/PetrolChat.tsx:733-736`; `app/src/renderer/stores/uiStore.ts:1336`, `:1449`). Der Knopf „Neues Gespräch“ ruft dagegen `clear()` auf (`app/src/renderer/components/Agent/PetrolChat.tsx:911-913`), das im **selben Tab** `webArmed:false` setzt, ohne `petrolWebSticky` zu ändern (`app/src/renderer/stores/petrolChatStore.ts:372-375`). Bei gespeichertem `true` startet das neue Gespräch im alten Tab ohne Web, ein neuer Tab dagegen mit Web. Das widerspricht der Zusage „für neue Chats“ und macht den Datenweg vom Weg zur Gesprächserstellung abhängig.
Vorschlag: `clear()` mit dem gespeicherten Startwert initialisieren oder den Geltungsbereich des Sticky-Werts ausdrücklich auf neue Tabs beschränken und entsprechend anzeigen.

### F07 — Auch eine reine Bestätigung löst mit dauerhaftem Globus Recherche aus
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:297
Status: [OFFEN]
Beschreibung: Solange der Globus an bleibt (`app/src/renderer/stores/petrolChatStore.ts:258-263`), behandelt `send()` auch `Danke` oder eine andere reine Gesprächsbestätigung als Webauftrag und verwendet den Entwurf als Suchanfrage (`app/src/renderer/components/Agent/PetrolChat.tsx:147-153`, `:292-310`). Im schnellen Weg beginnt `gatherWebSources` damit unmittelbar eine Anbieter-Suche (`app/src/main/llm/petrolWebChat.ts:86-90`). Im Schleifenweg führt selbst „kein Werkzeug“ im ersten Modellzug zum festen Recherche-Rückfall (`app/src/main/llm/petrolWebLoop.ts:379-381`; `app/src/main/index.ts:7074-7080`). Das erzeugt unnötige Netzabfragen und Modellkosten; der gespeicherte An-Zustand wiederholt dies auch in neuen Tabs (`app/src/renderer/stores/petrolChatStore.ts:147`). Die Gesprächssatz-Erkennung ist nur ein Hinweis, keine Sperre (`app/src/renderer/components/Agent/PetrolChat.tsx:177-181`).
Vorschlag: Für kurze Bestätigungen vor dem Senden einen klaren Webweg-Hinweis mit einmaliger Wahl anbieten oder den Recherche-Rückfall ohne Suchauftrag vermeiden; die bewusste Daueraktivierung des Globus beibehalten.

### F08 — Erlaubte fette Zwischenzeilen erscheinen als ungeprüftes Modellwissen
Schwere: niedrig
Stelle: app/src/main/llm/petrolWebPrompt.ts:57
Status: [OFFEN]
Beschreibung: Der neue Prompt erlaubt Zwischenzeilen wie `**Einordnung**` (`app/src/main/llm/petrolWebPrompt.ts:57`). Für `analyzeCitations` ist das ein normaler Absatz ohne Nummer, also `status:'uncited'` statt eine Überschrift mit `status:'unchecked'` (`app/src/shared/rag/citations.ts:172-175`, `:423-446`). Eigene Gegenprobe mit genau `**Einordnung**` ergab `summary.uncited=1`; bei eingeschalteter Quellenkritik macht `sentenceFlags` daraus `uncited` und `markKind` die Modellwissen-Markierung (`app/src/renderer/utils/webAnswerMarkdown.ts:73-80`, `:88-94`; Anzeige in `app/src/renderer/components/Agent/PetrolChat.tsx:630-634`). Eine reine Abschnittsbezeichnung wird damit wie eine unbelegte inhaltliche Aussage gezählt.
Vorschlag: Erlaubte reine fette Zwischenzeilen in der Segmentierung als ungeprüfte Abschnittstitel behandeln oder diese Form im Prompt nicht empfehlen.

### F09 — Fetter Tatsachensatz umgeht Beleg- und Zahlenprüfung
Schwere: hoch
Stelle: app/src/shared/rag/citations.ts:366
Status: [OFFEN]
Beschreibung: Die F08-Korrektur erkennt jede allein stehende Fettzeile bis 60 Zeichen ohne `[n]` als Abschnittstitel, auch einen vollständigen Tatsachensatz mit Zahl oder Preis (`app/src/shared/rag/citations.ts:362-366`). Der Zweig überspringt dann die Satz- und Referenzprüfung und setzt `unchecked` (`app/src/shared/rag/citations.ts:416-420`); `sentenceExtras` prüft bei fehlenden Referenzen nur Sätze mit `status:'uncited'` auf unbelegte Zahlen (`app/src/shared/webChat.ts:1199-1206`). Eigene Laufzeitprobe: `**Der Preis beträgt 199 €.**` bei einer Quelle ohne Preis ergibt `summary.sentences=0`, `summary.unchecked=1`, keine fehlende oder unbelegte Zahl. Die Anzeige erhält nur die Überschriftenmarke (`app/src/renderer/utils/webAnswerMarkdown.ts:88-99`). So kann ein fett gesetzter Fakt die Quellenkritik umgehen.
Vorschlag: Nur knappe Bezeichnungen ohne Satz- oder Mengenangabe als Abschnittstitel ausnehmen; vollständige Aussagen und Zahlen in Fettzeilen weiter als Sätze prüfen.

### F10 — Ziffern verschwinden aus Suchanfragen vor der Dank-Erkennung
Schwere: mittel
Stelle: app/src/shared/webChat.ts:1291
Status: [OFFEN]
Beschreibung: `isAcknowledgement` entfernt **alle Ziffern und Satzzeichen**, bevor es die übrigen Wörter gegen den Dank-Wortschatz prüft (`app/src/shared/webChat.ts:1277-1292`). Eigene Laufzeitprobe: `Super 8`, `Top 10` und `OK 2026` ergeben jeweils `true`. Bei eingeschaltetem Globus setzt `send` dafür `withWeb=false` (`app/src/renderer/components/Agent/PetrolChat.tsx:298-303`); der Store nimmt den normalen Chat-Zweig statt `petrolChatWeb` (`app/src/renderer/stores/petrolChatStore.ts:266-269`, `:318-323`). Eine knappe Produktsuche wie „Super 8“ oder eine Nachfrage „Top 10“ bekommt so trotz sichtbarem Globus eine Antwort ohne Recherche.
Vorschlag: Ziffern und andere sachliche Token als Ausschluss für reine Bestätigungen behandeln; den Webweg bei mehrdeutigen Kurztexten nicht still abschalten.

### F11 — Häufige Dankesformeln lösen weiterhin eine Websuche aus
Schwere: mittel
Stelle: app/src/shared/webChat.ts:1277
Status: [OFFEN]
Beschreibung: Der feste Wortschatz lässt gewöhnliche reine Bestätigungen wie `Vielen lieben Dank`, `Herzlichen Dank` und `Merci beaucoup` durchfallen (eigene Laufzeitprobe: jeweils `false`; `app/src/shared/webChat.ts:1277-1292`). Mit aktivem Globus setzt `send` deshalb `withWeb=true` (`app/src/renderer/components/Agent/PetrolChat.tsx:298-300`) und schickt den Dank als Suchanfrage (`:313-316`); im schnellen Pfad ruft `gatherWebSources` den Suchanbieter tatsächlich auf (`app/src/main/llm/petrolWebChat.ts:86-90`). F07 ist damit für verbreitete Dankesformen nur teilweise behoben, einschließlich der unnötigen Netz- und Modellkosten.
Vorschlag: Den Dank-Wortschatz um gebräuchliche Modifikatoren und Sprachformen ergänzen und Positiv- wie Negativfälle testen; sachliche Wörter und Ziffern weiterhin ausschließen.

### F12 — Prosa mit Pipe fälscht den Rang-Kopf der nächsten Tabelle
Schwere: mittel
Stelle: app/src/shared/webChat.ts:1145
Status: [OFFEN]
Beschreibung: `isRankCell` sucht rückwärts bis zur ersten Zeile **mit irgendeinem** `|` und hält diese für den Tabellenkopf, ohne die von Markdown tatsächlich geparste Tabellenkopfzeile zu prüfen (`app/src/shared/webChat.ts:1141-1151`). Eigene Laufzeitprobe mit `Rang | früher\nGröße | Einheit\n--- | ---\n8 | GB [1]`: `analyzeCitations` behandelt `Rang | früher` als Prosa und `Größe | Einheit` als Tabellenkopf, aber `sentenceExtras` meldet für die Sachzahl `8` `label:true`, `missingNumbers:[]` trotz Quelle `Test GB` ohne `8` (`app/src/shared/webChat.ts:1195-1198`). Eine direkt vorangehende Prosa-Zeile mit Pipe kann so F02 erneut auslösen, auch bei Tabellen ohne führendes `|`.
Vorschlag: Den Tabellenkopf über die Trennzeile unmittelbar vor den Datenzeilen bestimmen; rückwärts laufende Prosa-Zeilen nicht als Kopf zulassen.

## Claude-Antwort

Runde 1, alle Befunde vom Nutzer freigegeben („wie empfohlen“, 28.10.2026).

- **F01 [ADRESSIERT]** `rowSeen` zählt Nummern erst nach `maskedSlice` (gleiche Maskierung wie die Satzprüfung, jetzt ein gemeinsamer Helfer), `app/src/shared/rag/citations.ts`. Test: Inline-Code und Linkziel vererben nichts, `9999` bleibt „Zahl ohne Quelle“.
- **F02 [ADRESSIERT]** Rangspalte nur unter einem Rang-Kopf (`#`, Nr., Rang, Platz, Rank, Pos.) in Spalte eins (`isRankCell`, `app/src/shared/webChat.ts`). Test: `| 8 | GB [1] |` ohne Rang-Kopf → `missingNumbers: ['8']`.
- **F03 [ADRESSIERT]** „Erneut senden“ einer gescheiterten Websuche sucht wieder, solange der Globus an ist (`retryOf` in `send`, `PetrolChat.tsx`), mit gespeichertem `webQuery`/`webDeep`; ohne Globus wie bisher ohne Web. Keine Prüfung von `webQueryProblem` beim Wiederholen (gilt dem aktuellen Entwurf).
- **F04 [ADRESSIERT]** Systemtext: Anzahl eigenständiger Einträge nur, wenn eine Seite sie nennt; sonst nicht selbst zählen.
- **F05 [ADRESSIERT]** Geerbt wird nur bei genau einer gültigen Quelle in der Zeile und ohne ungültige Nummer. Test: `| P [1] | Falsch [2] | 9999 |` → `9999` ohne Nummer, Quelle 2 nicht tragend.
- **F06 [ADRESSIERT]** `clear()` übernimmt `petrolWebSticky`. Test im Store.
- **F07 [ADRESSIERT]** `isAcknowledgement` (`app/src/shared/webChat.ts`, getestet): höchstens fünf Wörter aus kleinem Bestätigungswortschatz, kein Fragezeichen → normaler Chat ohne Suche, auch bei Globus an. Zusätzlich selbst gefunden: die vorgemerkte Nachfrage geht nur mit, wenn ihr Hinweis sichtbar ist (Globus aus) — vorher ging „Danke“ bei Globus an als Snapshot-Nachfrage.
- **F08 [ADRESSIERT]** `isBoldLabelLine` in `citations.ts`: eine ganze Zeile nur aus kurzem Fettdruck (≤ 60 Zeichen, ohne `[n]`) gilt wie eine Überschrift (`unchecked`). Test.

Belege: Typecheck grün; ganze Suite 3198 grün, nur `shellExecution.test.ts` (Zeitgrenze unter Last, einzeln 15/15 grün); Build grün. Zwei neue Haiku-Läufe der Parfüm-Frage: 15 Düfte, Varianten getrennt, Warnungen 2 bzw. 5. Ein Lauf setzt `[1][3]` in jede Zelle (zwei Parfumo-Seiten je Zeile → kein Erbe, F05) — korrekt, aber unruhig; nicht geändert.

Runde 2, vom Nutzer freigegeben („ja mach weiter“, 28.10.2026):

- **F09 [ADRESSIERT]** `isBoldLabelLine`: nur knappe Bezeichnung — keine Ziffer, kein Satzende (`.!?;`), höchstens fünf Wörter. Test: `**Der Preis beträgt 199 €.**` bleibt `uncited` mit `unsourcedNumbers: ['199 €']`.
- **F10 [ADRESSIERT]** `isAcknowledgement` lehnt jede Ziffer ab (wie Fragezeichen). Test: „Super 8“, „Top 10“, „OK 2026“ → false.
- **F11 [ADRESSIERT]** Wortschatz um lieben, herzlichen, herzlich, besten, recht, beaucoup, much, so, many ergänzt (Kernwort bleibt Pflicht). Test: „Vielen lieben Dank“, „Herzlichen Dank“, „Merci beaucoup“, „Thank you so much“ → true.
- **F12 [ADRESSIERT]** `isRankCell` sucht den Kopf direkt über der Trennzeile des zusammenhängenden Blocks; fehlt die Trennzeile oder liegt Prosa dazwischen, kein Rang. Test: `Rang | früher` vor einer Tabelle → kein Etikett; echter Rang-Kopf ohne führendes `|` → Etikett.

Belege: Typecheck grün, 2123 Tests in shared/renderer/main/llm grün.

## Status

Runde 1: F01–F08, Runde 2: F09–F12, alle umgesetzt. Runde 3 kam nicht zustande (Codex-Kontingent erschöpft, Auftrag nicht angenommen). Nutzerentscheidung 28.10.2026: ohne Runde 3 veröffentlichen, der Nutzer testet selbst. Nachprüfung von F09–F12 offen.
