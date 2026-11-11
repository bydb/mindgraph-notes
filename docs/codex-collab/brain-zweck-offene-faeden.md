# Brain: Wozu ist es da — und trägt „Offene Fäden“ eine neue Rückblick-Seite?

## Aufgabe

Produktfrage, kein Code-Review. Der Nutzer fragt nach dem Stil-Umbau des Rückblicks
(`brain-rueckblick-stil.md`): „Was ist das Brain, welche Botschaft steckt dahinter, hat es mit dem
Index zu tun, was bringt es dem Nutzer so, wie es dargestellt wird, und was hat es mit meinem
Arbeitskontext zu tun?“

Claudes Antwort an ihn (Kurzfassung): Das Brain ist heute ein Tagesprotokoll; der Rückblick zählt
nur zusammen (Tage, Berührungen, Schlagworte) und liefert keinen nächsten Schritt. Mit dem
Vault-Index hat es nichts zu tun (bewusst ausgeschlossen), mit dem Arbeitskontext fast nichts.
Vorschlag war: den Rückblick auf **„Offene Fäden“** umbauen. Vorher sollten die echten
Tagesnotizen angesehen werden — das ist geschehen, Ergebnis unten.

Codex soll **angreifen und eine klare Empfehlung geben**: Trägt das Material eine solche Seite?
Welcher der Wege A–D ist richtig, oder ein anderer? Was wäre der kleinste ehrliche Schritt?

**Feste Randbedingungen:**
- Brain rechnet nur über `localhost:11434` (Ollama). Nie auf den Cloud-Provider-Switch.
- Personenbezogene Inhalte nicht in die Cloud. Deshalb stehen hier **keine Namen und keine
  Originalsätze** aus den Tagesnotizen, nur Zahlen und Muster. Bitte den Vault nicht selbst lesen.
- Tageszusammenfassungen werden nie überschrieben (Mensch entscheidet).
- Nutzerurteil (mehrfach bestätigt): Wert = **eine konkrete Sache + warum + eine Aktion, als
  Satz**. Keine Visualisierung von allem, keine Listen von allem.
- „Transparenz vor Entfernung“: nichts streichen, was Absicht sein könnte, ohne nachzusehen.

## Kontext/Anker

- Erzeugung der Tagesnotiz: `app/src/main/brain/dailyConsolidation.ts` (Sensoren, Prompt,
  4-Sektionen-Schema, Wikilink-Postprocessor, Phantom-Filter).
- Rückblick/Zeitstrahl: `app/src/renderer/components/Canvas/BrainConstellation.tsx` (Digest ab
  ca. Zeile 172: zählt `counts`, `themes`, ausgehende Links; liest die Abschnitte NICHT).
- Index-Ausschluss: `app/src/shared/rag/indexPolicy.ts:1-45` (`type: brain-day` ist keine Quelle).
- Arbeitskontext im Editor: `app/src/renderer/components/Editor/ContextPanel.tsx:190ff` (nur rote
  Notizen: Projekt, offene Aufgaben) — liest kein Brain.
- Dashboard: `app/src/renderer/components/DashboardPanel/` (Relevanz-Radar, Aktivität,
  „Wahrscheinlicher Arbeitskontext“ aus `utils/contextMemory.ts`).
- Mailclient kennt unbeantwortete/relevante Mails selbst (`app/src/main/email/`, `emailStore`).
- Leiste: „Brain“ ist einer der Hauptknöpfe (`App.tsx`, `view-mode-switcher`).

### Befund aus den echten Tagesnotizen (lokal ausgewertet, 11.11.2026)

- **142 Tagesnotizen** seit Mai 2026, zuletzt 23 pro Monat — das Brain wird also praktisch
  jeden Arbeitstag erzeugt. An 4 Tagen gibt es zwei Fassungen (`TT.md` und `TT (2).md`) mit
  unterschiedlichem Inhalt.
- Abschnitte: „Heute im Fokus“ 142×, „Was ich gemacht habe“ 142×, „Offene Fäden“ 133×,
  „Beobachtung“ 123×. Offene Fäden: im Mittel 3 Punkte (max. 5), 367 insgesamt.
- **62 % der Fäden sind „Mail X ist noch unbeantwortet / Rückmeldung an Y steht aus“.** Der Rest:
  Entscheidungen („Teilnahme an Fortbildung am … entscheiden“), Klärungen mit Personen,
  Prüfaufträge. Fäden zur eigentlichen Projektarbeit (z.B. Softwareentwicklung, Konzepte)
  kommen kaum vor — die Sensoren sehen Notizen, Aufgaben und Mails, nicht die Arbeit selbst.
- **Nur 43 % der Fäden tragen einen Wikilink**, in den letzten Wochen noch weniger (14 von 60).
  Der Rest nennt Absender und Thema als Fließtext — nicht anklickbar. Ob die vorhandenen Links
  auflösen, ist NICHT sauber gemessen (per Dateiname nur 24 von 139; die App löst über Titel auf).
- **Wiederkehr als Signal:** Von 139 verschiedenen verlinkten Fäden tauchen 20 an ≥ 2 Tagen auf,
  9 an ≥ 3 Tagen. Derselbe Vorgang erscheint aber auch ohne Link an mehreren Tagen in
  wechselnder Formulierung — einmal mit zwei verschiedenen Personennamen für denselben Vorgang
  (vermutlich Modellfehler).
- **Kein Erledigt-Zustand.** Ein Faden vom 2. steht am 9. wieder da, wenn er noch offen ist;
  wird er erledigt, verschwindet er einfach. Das Brain weiß nie, ob ein alter Faden noch offen ist.
- **„Beobachtung“ ist fast jeden Tag derselbe Satztyp**: „stark durch Mail-Verkehr geprägt,
  N empfangen, M beantwortet, wenig abgeschlossene Aufgaben“.
- Der heutige Rückblick nennt als „Themen, die sich durchzogen“ Mail-Schlagworte („dringend“,
  „kontakt“) und als „durchgehend beschäftigt“ einen Mail-Betreff, der an 2 Tagen vorkam.

### Claudes Einschätzung (zum Angreifen)

1. Die „Offenen Fäden“ sind **konkret und plausibel**, aber zu 62 % eine Nacherzählung von
   „unbeantwortete Mails“ — das weiß der Mailclient genauer und aktueller (er kennt den
   Antwortstatus). Eine Rückblick-Seite, die sie auflistet, wäre ein zweiter, schlechterer
   Posteingang mit veraltetem Stand.
2. Das **einzige Eigene** des Brains ist die Zeitachse: was über mehrere Tage immer wieder
   auftaucht und liegen bleibt. Das kann weder Posteingang noch Aufgabenliste.
3. Ohne Erledigt-Abgleich ist jede Aussage „offen seit …“ unzuverlässig.

### Wege

- **A — Rückblick = „Was liegen blieb“:** deterministisch aus den Tagesnotizen: Fäden, die an
  ≥ 2 Tagen vorkommen (über Wikilink-Ziel), höchstens 3, mit „zuletzt am …“ und Klick zur Notiz;
  vor der Anzeige gegen den echten Zustand prüfen (Mail beantwortet? Aufgabe erledigt? Notiz als
  gelöst markiert?) und Erledigtes weglassen. Monatszahlen darunter, klein. Voraussetzung:
  Tagesnotiz-Prompt/Postprocessor muss Fäden zuverlässig verlinken.
- **B — Brain als Morgensatz statt Seite:** kein eigener Hauptknopf; EIN Satz im Dashboard bzw.
  beim Start: „Seit drei Tagen liegt X — weitermachen?“ Die Brain-Seite wird Archiv (Zeitstrahl).
- **C — Brain füttert den Agenten:** eigenes Werkzeug „woran arbeitet der Nutzer gerade“ (letzte
  N Tagesnotizen), getrennt vom Suchindex; bei Cloud-Modellen nur nach Zustimmung mit Datenliste.
- **D — So lassen:** Stil ist repariert; das Brain bleibt Protokoll, Wert liegt in der
  Tagesnotiz selbst (die der Nutzer täglich erzeugt), nicht im Monatsblick.

**Fragen an Codex:**

1. Trägt das Material Weg A — oder ist A ohne verlässlichen Erledigt-Abgleich und ohne
   verlässliche Links ein Versprechen, das die Daten nicht halten?
2. Ist B der ehrlichere Schritt (ein Satz, eine Aktion), und wo gehört er hin?
3. Was sagt der Code: Lässt sich „Faden erledigt?“ deterministisch prüfen (Mail-Antwortstatus,
   Task-Status, `getNoteStatus`), und über welche Schlüssel (Wikilink-Ziel → Notiz → Mail-ID)?
4. Sollte der Tagesnotiz-Prompt geändert werden (Fäden strukturiert im Frontmatter mit
   Notiz-Verweis statt Fließtext)? Das wäre eine Änderung am Kern — Risiko?
5. Gehört „Brain“ weiter als Hauptknopf in die Leiste?
6. Was ist die Botschaft, die das Brain ehrlich tragen kann — in einem Satz?

## Codex-Findings

### F01 — Die Produktdiagnose unterschätzt das vorhandene Brain und überschätzt die Statusquellen
Schwere: mittel
datei:zeile: `app/src/main/brain/dailyConsolidation.ts:83-120,267-285`; `app/src/renderer/components/Canvas/BrainConstellation.tsx:179-223,448-466`; `app/src/renderer/components/Editor/ContextPanel.tsx:95-117,257-276`; `app/src/renderer/components/DashboardPanel/DashboardView.tsx:442-448,608-625`
Status: [OFFEN]
Das Brain ist mehr als ein Tageszähler: Der Prompt sieht vier erzählende Sektionen vor (leere dürfen entfallen), und Wikilinks der Tagesnotiz können als Backlinks im Editor-Kontext erscheinen. Der Monats-Digest liest diese Sektionen tatsächlich nicht; sein „durchgehend beschäftigt“ entsteht aus **beliebigen** ausgehenden Links an mindestens zwei Tagen, nicht aus „Offene Fäden“. Das Dashboard hat schon einen 7-Tage-Arbeitskontext aus Ereignissen. Claudes Satz „das einzige Eigene ist die Zeitachse“ ist zu eng: Eigen sind auch ein vom Nutzer lesbares, nicht überschriebenes Tageszeugnis und dessen Quellenverknüpfungen. Der Mailclient ist aktueller, aber seine Antwortmarkierung ist keine vollständige automatische Wahrheit (F04).
Vorschlag: Brain als lokalen, quellengebundenen Tagesrückblick mit historischer Wiederkehr beschreiben. Die neue Zusage „heute noch offen“ erst nach eigenem Statusnachweis machen.

### F02 — Frage 1 / Weg A: Die Daten tragen keinen zuverlässigen „Was liegen blieb“-Status
Schwere: hoch
datei:zeile: `app/src/main/brain/dailyConsolidation.ts:107-120,205-235,338-344`; `app/src/renderer/utils/brainSensors.ts:95-132`; `app/src/renderer/components/Canvas/BrainConstellation.tsx:156-196,218-223`; `app/src/renderer/utils/linkExtractor.ts:98-130`
Status: [OFFEN]
Der Prompt fordert höchstens drei Fäden, aber keine stabile Faden-ID und keinen Typ. Der Postprocessor verlinkt nur exakte Titel bearbeiteter/erstellter Notizen; Mail-Absender und Betreff werden als Text ohne Mail-ID an das Modell gegeben. Ein Wikilink irgendwo in der Tagesnotiz beweist nicht, dass er in „Offene Fäden“ steht; `resolveLink` akzeptiert zuletzt sogar einen unscharfen Pfadtreffer. Die in der Aufgabe genannten 43 % verlinkten Fäden sind nur eine Vorprüfung; die Auflösungsquote in der App ist offen. Weg A würde die verlinkte Minderheit bevorzugen und unklare Fälle still ausblenden. Bei mehreren Fassungen desselben Tages muss zudem erst geklärt werden, ob ein Faden an zwei **Kalendertagen** oder nur in zwei Dateien vorkam.
Vorschlag: A in dieser Form ablehnen. Ein möglicher späterer Satz darf höchstens „in den Tagesnotizen vom … und … erwähnt“ behaupten, bis Fadenidentität und aktueller Zustand messbar belegt sind. Keine Überschrift „Was liegen blieb“ und kein „offen seit“ aus historischen Erwähnungen ableiten.

### F03 — Frage 2 / Weg B: Ein Satz passt, aber nicht als morgendliche Offenheitsbehauptung
Schwere: mittel
datei:zeile: `app/src/renderer/components/DashboardPanel/DashboardView.tsx:442-448,546-585,608-635`; `app/src/renderer/utils/contextMemory.ts:21-34,121-174`; `app/src/renderer/App.tsx:538-563`; `app/src/renderer/components/Canvas/BrainConstellation.tsx:448-466`
Status: [OFFEN]
Die Form von B trifft das Nutzerurteil „eine Sache + warum + Aktion“. Der vorgeschlagene Satz „Seit drei Tagen liegt X — weitermachen?“ behauptet jedoch einen aktuellen unerledigten Zustand, den Brain nicht kennt. Er verdrängt womöglich den bereits vorhandenen Dashboard-Arbeitskontext, dessen 7-Tage-Ranking Öffnungen/Bearbeitungen zählt, ebenfalls ohne Offenheitsstatus. Die automatische Tagesnotiz läuft zu einer eingestellten Uhrzeit, nicht zwingend morgens; am Morgen kann nur der Stand von gestern vorliegen.
Vorschlag: Wenn die Eignung gemessen ist, genau **einen** optionalen historischen Hinweis im bestehenden Brain-/Aktivitätswidget des Dashboards zeigen: „X tauchte in zwei Tagesnotizen auf; zuletzt am … — Tagesnotiz öffnen.“ Der Grund ist die belegte Wiederkehr, die Aktion führt zur Quelle. Ohne qualifizierten Kandidaten kein Hinweis. Die Brain-Seite bleibt als Rückblick und Zeitstrahl erreichbar.

### F04 — Frage 3: Mail-Antwortstatus ist nur bei eindeutiger Mail-ID prüfbar
Schwere: hoch
datei:zeile: `app/src/shared/types.ts:1549-1559,1734-1770,1807-1828`; `app/src/renderer/utils/brainSensors.ts:117-140`; `app/src/main/brain/dailyConsolidation.ts:65-77`; `app/src/renderer/stores/emailStore.ts:158-179,943-962,1036-1062`; `app/src/main/email/ipc.ts:1581-1589,1832-1844`
Status: [OFFEN]
Im Mailbestand gibt es `accountId`, Message-ID (`id`), `needsReply`, `replyHandled`, `inReplyTo` und `references`. Das Brain-Sensorformat reduziert eine Mail aber auf Absender, Betreff, Relevanz und `needsReply`; die gespeicherte Tagesnotiz hat keinen Rückschlüssel auf die Mail. Ein Wikilink auf eine aus Mail erzeugte Notiz ist kein garantierter Join zur Mail-ID. `replyHandled` wird manuell gesetzt; die lokale gesendete Kopie wird gespeichert, aber der gezeigte Sendepfad markiert die Ursprungsmail nicht automatisch erledigt. `needsReply` ist ein Modellurteil und kann fehlen. Betreff/Name oder Thread-Ähnlichkeit reichen nicht für deterministisches Filtern.
Vorschlag: Nur mit eindeutigem `(accountId, messageId)` und einer explizit definierten Zustandsregel prüfen; unbekannt/fehlend muss „unklar“ bleiben. Eine gesendete Antwort nur dann als Beleg werten, wenn `inReplyTo`/`references` verlässlich auf genau diese Mail zeigen; externe Antworten, Telefonate und verlorene lokale Kopien bleiben Grenzen.

### F05 — Frage 3: Aufgaben und Notizstatus decken Fäden nur in Sonderfällen ab
Schwere: hoch
datei:zeile: `app/src/shared/taskExtractor.ts:5-22,110-147`; `app/src/renderer/components/Editor/ContextPanel.tsx:190-248,376-394`; `app/src/renderer/utils/noteKind.ts:144-184,209-229`; `app/src/renderer/utils/brainSensors.ts:114-115,137-140`
Status: [OFFEN]
`extractTasks` erkennt `- [ ]`/`- [x]` mit Text und Zeile innerhalb einer konkreten Notiz, aber der Brain-Sensor liefert nur Tageszähler; `examples` ist leer. Ein prosaischer Faden lässt sich nicht ohne Quellpfad und Task-Identität auf einen Checkbox-Status abbilden. `getNoteStatus` liest `status: solved|archived` aus Frontmatter und gibt bei fehlendem/unbekanntem Status `open` zurück; das ist **kein** Nachweis, dass ein erwähnter Vorgang noch offen ist. Der Editor nutzt offene Tasks und Projektkontext nur bei roten Problem-Notizen. Ein Wikilink auf eine beliebige Notiz darf deshalb nicht als „Faden erledigt/offen“ interpretiert werden.
Vorschlag: Status nur für explizit referenzierte Objekte auswerten: Mail-ID, Task in Quellnotiz oder markierte Problem-Notiz. Für alles andere historische Erwähnung statt Offenheitsurteil; bei leerem Cache aktuelle Datei lesen und „unbekannt“ von „offen“ unterscheiden.

### F06 — Frage 4: Strukturierte Fäden im Frontmatter wären jetzt eine Scheinsicherheit
Schwere: hoch
datei:zeile: `app/src/main/brain/dailyConsolidation.ts:98-120,162-185,205-235,242-285,288-309,338-363`; `app/src/renderer/utils/brainSensors.ts:95-112,124-140`
Status: [OFFEN]
Der Prompt verlangt ausdrücklich Markdown **ohne** Modell-Frontmatter; die App fügt danach eigenes Frontmatter für Provenienz, Counts und Tags hinzu. Ein neues `open_threads`-Feld aus freiem Modelltext würde IDs und Erledigt-Signale vortäuschen, die im Input fehlen. Es könnte außerdem den 220-Wörter-Prompt, den Wikilink-Postprocessor und manuell bearbeitbare Tagesnotizen gegen einen strukturierten Spiegel laufen lassen. Wegen der unveränderlichen Tagesnotizen entstehen zugleich alte und neue Schemas; die vier abweichenden Zweitfassungen dürfen nicht still zusammengeführt werden.
Vorschlag: Prompt zunächst nicht umbauen. Erst mit lokalem, menschlich geprüftem Korpus Sektionserkennung, Linkauflösung, Identitäts- und Statusquote messen. Falls strukturierte Referenzen später nötig sind, nur aus nachweisbaren Sensor-IDs deterministisch erzeugen, als zusätzliche versionierte Metadaten; den Satztext und alte Notizen weder ersetzen noch überschreiben.

### F07 — Frage 5: „Brain“ noch nicht aus der Hauptleiste entfernen
Schwere: mittel
datei:zeile: `app/src/renderer/App.tsx:1347-1352,1745-1758`; `app/src/renderer/components/Canvas/BrainConstellation.tsx:364-405,445-468`; `app/src/renderer/components/DashboardPanel/DashboardView.tsx:546-585,629-650`; `app/src/shared/rag/indexPolicy.ts:1-14,34-41`
Status: [OFFEN]
Weg B koppelt „ein Morgensatz“ an „kein eigener Hauptknopf“, ohne Nutzung des Brain-Knopfs oder des Zeitstrahls zu kennen. Der Knopf führt heute zu Rückblick **und** Zeitstrahl/Graphzugang, während das Dashboard die Tagesnotiz erzeugt und ihren Status zeigt. Eine Entfernung würde diese Wege verstecken; die feste Regel „Transparenz vor Entfernung“ spricht dagegen. Der Vault-Chat-Index schließt Brain-Tagesnotizen ausdrücklich als Quellen aus; der Brain-Knopf ist kein anderer Eingang in denselben Index.
Vorschlag: Brain vorerst in der Leiste lassen, als „Rückblick“ verständlich beschriften und die Funktion nach Nutzungsmessung neu bewerten. Bei späterem Umzug müssen Tagesnotiz, Zeitstrahl und Graph weiterhin sichtbare Einstiege behalten.

### F08 — Frage 6: Ehrliche Botschaft in einem Satz
Schwere: niedrig
datei:zeile: `app/src/renderer/utils/brainSensors.ts:59-152`; `app/src/main/brain/dailyConsolidation.ts:83-120,267-285,312-363`; `app/src/renderer/components/Canvas/BrainConstellation.tsx:198-223`; `app/src/shared/rag/indexPolicy.ts:1-14`
Status: [OFFEN]
Empfohlene Botschaft: **„Das Brain hält lokal fest, was deine Notizen, Aufgaben und Mails an einem Tag über deine Arbeit zeigen, und lässt dich wiederkehrende Themen mit ihren Tagesnotizen nachverfolgen.“** Sie benennt die Sensorgrenze und die historische Funktion, ohne vollständiges Arbeitsverständnis, aktuellen Erledigt-Status oder Indexsuche zu behaupten. Die Tagesnotiz ist ein Modelltext mit Nutzerkontrolle; der Monats-Digest zählt nur ausgewählte Metadaten und Links.
Vorschlag: Diese Zusage in Produkttext und UI verwenden; „kennt deinen Arbeitskontext“ und „zeigt, was noch offen ist“ nicht versprechen.

### F09 — Weg C ist ein eigenes Datenschutz- und Qualitätsprojekt, keine Abkürzung
Schwere: hoch
datei:zeile: `app/src/main/brain/dailyConsolidation.ts:8,162-174,312-324`; `app/src/shared/rag/indexPolicy.ts:1-14,34-41`; `app/src/renderer/components/Editor/ContextPanel.tsx:119-188`; `app/src/renderer/utils/contextMemory.ts:67-82,121-174`
Status: [OFFEN]
Die Brain-Erzeugung ist hart auf `localhost:11434` begrenzt und lehnt Cloud-Tags ab. Der Ausschluss aus dem Vault-Chat-Index ist eine Quellenqualitätsregel gegen Selbstzitieren, nicht der Nachweis, dass Agent-Werkzeuge Brain-Inhalte sicher verwenden. Ein neues Werkzeug „woran arbeitet der Nutzer“ würde personenbezogene Tagesnotizen gezielt an den Agenten geben und bei Cloud-Modell potentiell übertragen. Zudem enthält der Editor bereits Ähnlichkeitssuche und das Dashboard lokale Ereignissignale; C braucht einen klaren Mehrwert und Quellenbelege, nicht bloß einen weiteren Zusammenfassungsweg.
Vorschlag: C derzeit zurückstellen. Falls später gewollt: lokale Ausführung als Default, pro Anfrage transparente Datenliste und ausdrückliche Zustimmung vor jeder Cloud-Übertragung; keine automatische Aufnahme in den Vault-Index und keine Umgehung des Brain-Cloud-Verbots.

### F10 — Weg D ist als Zwischenstand besser als ein unbelegter Umbau
Schwere: mittel
datei:zeile: `app/src/main/brain/dailyConsolidation.ts:288-309,312-363`; `app/src/renderer/components/DashboardPanel/DashboardView.tsx:463-497,515-585`; `app/src/renderer/components/Canvas/BrainConstellation.tsx:198-223,445-468`
Status: [OFFEN]
D ist nicht „nichts tun“: Die lokale Tagesnotiz bleibt ein überprüfbares Archiv, und der Rückblick zeigt bisher nur historische Häufigkeiten. Eine neue „Offene Fäden“-Seite würde aus alten Modellformulierungen eine aktuelle Handlungsaufforderung machen. Das ist ohne Messung riskanter als die unvollkommene, aber begrenzte heutige Aussage. Andererseits löst D die Produktfrage „wozu Brain?“ noch nicht: Der Zusammenhang zwischen Tagesnotiz, historischem Rückblick und möglicher nächster Handlung wird nicht erklärt.
Vorschlag: D als vorläufige Funktion wählen, den bestehenden Rückblick ehrlich benennen/erklären und einen Ein-Satz-Hinweis nach B erst nach Eignungsnachweis ergänzen. A und C nicht parallel anfangen.

### F11 — Der kleinste ehrliche nächste Schritt ist eine Eignungsmessung mit klarer Ausfallregel
Schwere: hoch
datei:zeile: `app/src/main/brain/dailyConsolidation.ts:113-120,338-344`; `app/src/renderer/utils/brainSensors.ts:95-112,124-140`; `app/src/renderer/components/Canvas/BrainConstellation.tsx:156-196,218-223`; `app/src/renderer/utils/linkExtractor.ts:98-130`; `app/src/renderer/utils/contextMemory.ts:121-174`
Status: [OFFEN]
Die Zahlen und Muster in dieser Aufgabe sind eine vom Nutzer/Claude gelieferte Stichprobe, keine von Codex unabhängig geprüften Vault-Daten. Für eine Handlungsfunktion fehlen mindestens: Anteil korrekt erkannter „Offene Fäden“-Abschnitte und Fäden, Anteil eindeutig aufgelöster **Faden**-Links (nicht aller Links), Wiederkehr über verschiedene Kalendertage samt Zweitfassungen, Typverteilung, Zuordnung zu Mail-ID/Task/Problem-Notiz, Falsch-„offen“-Rate nach späteren Änderungen und Quote tatsächlich nützlicher „eine Sache + warum + Aktion“-Kandidaten. Auch messen, wie oft kein qualifizierter Kandidat vorliegt. `contextMemory` liefert nur lokale Ereignisse und Rankings, keine Ground Truth für Erledigung.
Vorschlag: Vor Produktcode eine lokale, personenbezogen nicht exportierte, manuell bewertete Stichprobe mit diesen Quoten und expliziter Unknown-Kategorie erstellen. Kleinste unmittelbare UI-Maßnahme danach: höchstens **ein** historisch formulierter, anklickbarer Satz im bestehenden Dashboard-Brain-Widget; bei fehlender eindeutiger Quelle nichts anzeigen. Erst bei belegbar niedriger Falschbehauptungsrate Statuswörter wie „offen“ erwägen.

**Gesamtempfehlung:** Weg D als ehrlichen Zwischenstand halten, die Botschaft aus F08 sichtbar machen und den Brain-Knopf vorerst behalten. Zuerst F11 messen; dann allenfalls B als einen quellengebundenen historischen Satz im vorhandenen Dashboard-Widget erproben. Weg A („Was liegen blieb“) wegen fehlender IDs, lückenhafter Links und unzuverlässigem Erledigt-Abgleich nicht zusagen. Weg C als getrennte, ausdrücklich autorisierte Agent-Funktion zurückstellen. Tagesnotizen nicht überschreiben, den Prompt nicht vorschnell strukturieren und Brain-Daten weder über den Vault-Index noch still über Cloud-Modelle schicken.

## Claude-Antwort

Runde 1 (11.11.2026). Nutzer: „Codex hat recht“, Gesamtempfehlung ausführen.

- **F01, F08, F10 [ADRESSIERT]** — Weg D als Zwischenstand. Rückblick ehrlich beschriftet
  (`BrainConstellation.tsx`): „Am häufigsten wiederkehrend: X — in N Tagesnotizen erwähnt“ statt
  „Durchgehend beschäftigt hat dich“; „Häufigste Schlagworte der Tagesnotizen“ statt „Themen, die sich
  durchzogen“; „über die Tage zusammen rund N Notizen berührt“; Erklärzeile `brain.digestAbout`
  (sagt ausdrücklich: kein Offen-Status). Gleiche Sätze in der Zeitstrahl-Karte.
- **F02, F04, F05, F06, F09 [ADRESSIERT durch Verzicht]** — kein Weg A, kein Prompt-Umbau, kein Weg C.
- **F03 [OFFEN]** — Ein-Satz-Hinweis im Dashboard erst nach Messung.
- **F07 [ADRESSIERT]** — Brain-Knopf bleibt.
- **F11 [IN ARBEIT]** — Stichprobe lokal erzeugt (außerhalb des Repos, nicht exportiert). Erste
  maschinelle Quoten: 130 Kalendertage, 367 Fäden, 208 ohne Link; 138 verschiedene verlinkte Fäden,
  davon 75 eindeutig auf eine Notiz auflösbar, 34 mehrdeutig, 29 nicht gefunden. An ≥ 2 Kalendertagen
  wiederkehrend: 21, davon eindeutig auflösbar: **8** (in sechs Monaten). Handbewertung durch den
  Nutzer steht aus.

## Status

Runde 1: Beschriftung umgesetzt (nicht committet), Messung läuft (11.11.2026).
