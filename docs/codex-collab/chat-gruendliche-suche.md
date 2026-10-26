# Petrol-Chat: „gründliche“ Websuche als kleine Agent-Schleife

## Aufgabe

Nutzer (25.10.2026) nach eigenem Test: „die Suche im Netz ist echt lausig, es werden Quellen
gesucht, die oft nicht passen. Warum macht der Agent-Modus das so viel besser?“ Vorher Vergleich
mit Claude bei derselben Alltagsfrage (Balkonkraftwerk mit 8 Modulen): Claude nennt Preisspanne,
2000-Wp-Grenze und Wege; Petrol findet allgemeine Ratgeber und eine veraltete „600 Watt“-Seite.

Ursache ist der Aufbau, nicht das Modell (Code nachgesehen, Tabelle unten). Der Nutzer hat
entschieden, einen Entwurf für eine **zweite Stufe „gründlich“** schreiben und prüfen zu lassen.
**Bitte den Entwurf adversarial prüfen, noch kein Code.** Maßstab bleibt **geringe Halluzination**
(`docs/codex-collab/chat-websuche.md`, „Ziel“), dazu jetzt ausdrücklich **Antwortqualität für
Alltagsfragen** (Memory `project-petrol-chat-purpose`: „schnell mal was fragen, gute Antwort“).

**Dieser Entwurf hebt eine frühere Entscheidung auf**: `chat-suchwoerter-vorschlag.md` lehnte ab,
dass ein Modell die Suchwörter wählt (V1/V2, F03, F05, F08 „gesendet wird exakt der sichtbare
Text“). Im Agenten ist genau das seit jeher so (`web_search`, `skills.ts:1690`). Der Nutzer nimmt
den Grundsatzwechsel für die Stufe „gründlich“ bewusst in Kauf; zu prüfen ist, **was technisch gelten
muss, damit er nicht in Halluzination, Datenabfluss oder Injection kippt**.

## Ist-Zustand: warum der Agent besser sucht

| | Chat (Globus, heute) | Agent (Auftrag mit Web) |
|---|---|---|
| Suchwörter | Getippter Satz wörtlich (`PetrolChat.tsx:120`), optional Stichwörter per Klick | Modell formuliert (`skills.ts:1690-1713`) |
| Suchen | 1 | bis 8 (`MAX_WEB_SEARCHES_PER_RUN`, `shared/webResearch.ts:79`) |
| Seitenauswahl | keine: erste Treffer der Reihe nach (`candidatesFromHits`, `shared/webChat.ts:470`; `runFetchQueue` `:509`) | Modell liest Titel + Anriss (`formatSearchResults`, `skills.ts:121`) und öffnet gezielt |
| Seiten | höchstens 3 (`WEB_CHAT_MAX_SOURCES`, `webChat.ts:27`) | bis 10 (`MAX_WEB_FETCHES_PER_RUN`) |
| Große Seiten | abgelehnt (`rejectTruncatedBody: true`, `main/llm/petrolWebChat.ts:144`) | gekürzt gelesen (`skills.ts:1744`, ohne `rejectTruncatedBody`) |
| Nachsuchen | nie | Modell entscheidet |

Real gemessen (25.10.2026, Dev-App, Tavily): wörtliche Frage → „installieren lassen“, „Speicher“,
„Wann lohnt sich“; priwatt.de (Händler mit Preisen) „zu groß“ verworfen. Gleiche Frage mit
Stichwörtern → Seiten mit 8-Modul-Sets und Preisen. Tavily-Treffer schwanken zwischen zwei
Läufen derselben Anfrage (Elterngeld: einmal Seite mit Betrag zu 3000 brutto, eine Stunde später
nur Rechner).

## Entwurf (Rev. 1)

### Bedienung
- Der Globus bekommt zwei Stufen: **schnell** (heute, unverändert) und **gründlich**. Umschalter
  in der Webzeile unter dem Eingabefeld („Gründlich suchen“), Zustand pro Tab wie `webArmed`
  (`renderer/stores/petrolChatStore.ts:90`). Standard: offen — Frage 7.
- Datenwege-Zeile vor dem Senden nennt bei „gründlich“: „Frage an <Modellweg> (Suchplanung),
  Suchwörter an Tavily, bis zu 3 Suchen, Seiten von diesem Rechner“.
- Während des Laufs Fortschritt in Stufen: „Suche plane … · Suche 1/2: „…“ · Seiten wählen ·
  Lese 3 Seiten · Antwort“.
- Nach der Antwort steht an der Frage **jede tatsächlich gesendete Suchanfrage** („gesucht nach:
  „Balkonkraftwerk 8 Module Preis“, „Balkonkraftwerk 2000 Wp Grenze“) und welche Treffer gewählt
  bzw. verworfen wurden.

### Ablauf im Main (eigener Zweig im Handler `petrol-chat-web`, `main/index.ts:6809`)
Keine freie Tool-Schleife, sondern **feste Schritte, die der Main führt**; das Modell liefert in
jedem Schritt nur strukturierte Werte (JSON), die der Main prüft:

1. **Planen.** Eingabe: NUR die aktuelle Frage (kein Verlauf — F03 aus `chat-suchwoerter-vorschlag.md`)
   und das Datum. Ausgabe `{ "queries": ["…", "…"] }`, 1–3 Einträge, je ≤ 120 Zeichen.
   Main: trimmen, leere/doppelte raus, Länge prüfen (zu lang = verworfen, nie gekürzt, F04),
   höchstens 3. Scheitert der Schritt (kein JSON, Zeitlimit) → Rückfall auf die getippte Frage
   als einzige Suche, sichtbar vermerkt.
2. **Suchen.** Main führt die Anfragen aus (parallel, gemeinsame Netzfrist), `splitSkippedHits`
   (Sperrliste) auf jede Trefferliste, Dedupe über normalisierte URL, höchstens 12 Kandidaten.
3. **Wählen.** Eingabe: Frage + nummerierte Kandidaten (Titel, Host, Anriss; Anriss und Titel
   bereinigt, als UNTRUSTED abgegrenzt, je Anriss ≤ 300 Zeichen). Ausgabe `{ "pick": [3, 1, 7] }`,
   höchstens 4 Nummern. Main nimmt nur gültige Nummern aus der eigenen Liste (das Modell kann
   keine URL einbringen). Leere oder ungültige Wahl → die ersten 4 Kandidaten wie bei „schnell“.
4. **Lesen.** Main ruft die gewählten Seiten ab, **große Seiten gekürzt statt verworfen**
   (Anfang bis `WEB_FETCH_MAX_BYTES`, Kürzung im Quellenblock als „gekürzt“ sichtbar), sonst wie
   heute (`fetchAndExtract`, Egress-Kern, Frist).
5. **Nachsuchen (höchstens einmal).** Weniger als 2 lesbare Seiten → Planen erneut mit der
   Information „diese Suchen brachten nichts Lesbares: …“ (nur eigene Suchwörter, keine
   Seiteninhalte), eine Suche, Wählen, Lesen. Gesamt höchstens 3 Suchen, 5 Abrufe.
6. **Antworten** wie heute: eingefrorene Auszüge (`freezeWebSourcesToFit`, `webChat.ts:692`),
   Systemtext `petrolWebPrompt.ts`, Satzprüfung `analyzeCitations` + `sentenceExtras`,
   Quellenliste nur aus abgerufenen Seiten, Snapshot für „Hiermit weiterfragen“.

### Grenzen und Sicherheit
- Gesamtfrist z. B. 60 s für Netz + Planen + Wählen; Abbruch „Stopp“ bricht jeden Schritt ab
  (gemeinsames Signal wie heute, `claimPetrolRequest`).
- Cloud-Freigabe und Modellweg wie heute (`petrolCloudAllowed`, `classifyAgentRoute`) — VOR dem
  ersten Modellaufruf, da schon die Planung die Frage an den Modellweg schickt.
- Ollama-Vordergrund nur für die lokalen Modellschritte (wie F04 der Websuche).
- Telemetriezeile inhaltsarm (keine Suchwörter, keine URLs), wie heute `[PetrolWeb]`.
- Kein Werkzeugaufruf über `chatWithTools`: feste Schritte mit JSON sind auch mit Modellen ohne
  Tool-Calling machbar und für den Main prüfbar.

## Entwurf (Rev. 2, nach Codex F01–F08)

Ändert Rev. 1 an diesen Stellen; was hier nicht steht, gilt aus Rev. 1.

### R1 — Wählbar, mit ehrlicher Einwilligung (F03, Urteil Frage 7)
- „Gründlich“ ist **Opt-in pro Frage**, nicht Standard. Schalter in der Webzeile; Zustand pro Tab,
  nach dem Senden zurück auf „schnell“ (eine bewusste Wahl je Frage).
- Text vor dem Senden, wörtlich: „Gründlich: Das Modell (<Modellweg>) erstellt aus deiner Frage
  bis zu 3 Suchanfragen und schickt sie an <Anbieter>. Du siehst sie erst danach.“
- Planungsdaten im Main **hart**: nur `question` und Datum; `history`/`webTopics` werden für die
  Planung nicht gelesen (Code-Grenze, nicht Prompt).
- Hinterher an der Frage: jede **gesendete** Anfrage, jede **verworfene** Planungszeile mit Grund
  („zu lang“, „doppelt“), Rückfälle, und welche Treffer gewählt bzw. nicht gewählt wurden.
- Sensible Frage: der schnelle Modus mit sichtbarem Suchfeld bleibt daneben verfügbar.

### R2 — Nachfragen ohne Bezug suchen nicht blind (F02)
- Vor der Planung prüft der Main deterministisch auf unaufgelösten Bezug: Frage ≤ 6 Wörter UND
  (beginnt mit „und“/„aber“/„was ist mit“/„wie ist es mit“ ODER enthält Bezugswörter „das“, „die“,
  „dort“, „davon“, „dafür“ als Kopf ohne Substantiv aus ≥ 5 Buchstaben). Treffer → kein Lauf;
  Hinweis „Worauf bezieht sich das? Ergänze das Thema oder nimm die vorige Suche“ mit dem
  vorhandenen Knopf „vorige Suche übernehmen“ (`followUpQuery`, F07 aus
  `chat-suchwoerter-vorschlag.md`). Der Verlauf geht nie in die Planung.
- Fehlalarm ist erwünscht billig (ein Hinweis), ein verpasster Bezug führt zu R5-Lücken.

### R3 — Ein Laufzustand: Budget, Frist, Abbruch (F04, F08)
- Vor Schritt 1 legt der Main an: `deadline = start + 60 s` (lokales Modell: 90 s, Frage 6),
  einen AbortController, Zähler `searchesStarted` (max 3 = 2 Plan + 1 reservierte Nachsuche) und
  `fetchesStarted` (max 5 gesamt). Gezählt wird beim **Start**, Fehlschläge zählen mit.
- Jeder Netz- und Modellaufruf bekommt die **Restfrist** (`deadline - now`), nicht eigene 25 s;
  `gatherWebSources` wird dafür um `deadlineAt` erweitert statt pro Aufruf einen Timer zu setzen.
- Vor/nach jedem `await` und vor Progress/Snapshot: Abbruch und `event.sender` prüfen.
- Frist erreicht → Antwort aus dem, was eingefroren ist, gekennzeichnet „Recherche abgebrochen
  (Zeit)“; nichts Eingefrorenes → wie heute `nothing-readable`.

### R4 — Was gewählt wird, wird Beleg (F05)
- Kandidaten werden **reihum** aus den Trefferlisten der Anfragen zusammengeführt (1. von A,
  1. von B, 2. von A …), URL-Dubletten zusammengelegt mit Herkunft („aus Suche 1 und 2“), max 12.
- Modell wählt höchstens **4**; genau diese werden abgerufen und — sofern lesbar — eingefroren.
  Dafür wird `WEB_CHAT_MAX_SOURCES` für „gründlich“ auf 4 angehoben, das Budget
  (`applyWebChatBudget`) teilt den Platz auf 4 Seiten; die Reihenfolge ist die **Wahlreihenfolge**
  (`freezeWebSources` bekommt eine Ordnung statt `candidate.index`).
- Nicht eingefroren, obwohl abgerufen (Budget), wird als „abgerufen, nicht verwendet“ gezeigt.

### R5 — Abdeckungsprüfung ohne Modell (F01, F06)
- Aus der Frage werden **Prüfbegriffe** gebildet: Zahlen, Substantive (großgeschrieben, ≥ 4
  Zeichen, nicht am Satzanfang oder in der Füllwortliste), Verneinungen samt Folgewort, Jahreszahlen.
- Nach dem Lesen: welche Prüfbegriffe kommen in **keinem** eingefrorenen Auszug vor (gleiche
  Wortnormalisierung wie `contentWords`, Komposita-Kopf wie `shared/rag/lexical.ts`)?
- Fehlen welche UND Budget übrig → **eine** Nachsuche: Planung bekommt die Frage + „in den
  gelesenen Seiten fehlt: 8, Module“ (nur Prüfbegriffe aus der Frage, keine Seiteninhalte).
- Danach immer sichtbar an der Antwort: „In den gelesenen Seiten nicht gefunden: …“. Der
  Antwort-Prompt bekommt dieselbe Liste und muss diese Punkte als Lücke benennen.
- Rückfälle (Planung ungültig → Frage wörtlich; Wahl ungültig → erste 4) erscheinen als
  „eingeschränkte Recherche: <Grund>“ an der Antwort, nie still.
- Die Prüfung heißt „Begriffe gefunden“, nie „Frage beantwortet“ — sie beweist Wortvorkommen,
  nicht Inhalt.

### R6 — Große Seiten: Ausschnitte statt Seitenanfang (F07)
- Ist der Body gekappt (`res.truncated`) ODER der extrahierte Text länger als
  `WEB_PAGE_CONTEXT_MAX_CHARS`, nimmt der Main statt des Anfangs **Ausschnitte**: Absätze, die
  Prüfbegriffe (R5) enthalten, je mit einem Absatz davor/danach, in Seitenreihenfolge, bis zur
  Auszugsgrenze; dazwischen „[…]“.
- Anzeige an der Quelle: „Ausschnitte (Seite gekürzt geladen)“ bzw. „Ausschnitte“, im Export
  ebenso. Byte-Kappung und Auszugskappung getrennt ausgewiesen.
- Der Antwort-Prompt sagt bei solchen Quellen „im gelesenen Ausschnitt“, nie „die Seite enthält
  nicht“. Für Seiten ohne einen einzigen Prüfbegriff gibt es keinen Ausschnitt → als „kein
  passender Abschnitt“ gezählt, nicht eingefroren.
- „schnell“ bleibt unverändert (Ablehnung großer Bodies).

### R7 — Messung vor Bau-Freigabe als Standard (F01, Urteil)
Testsammlung (15 Alltagsfragen; je „schnell“ und „gründlich“, 3 Wiederholungen, gleiches Modell):

1. Ich will ein Balkonkraftwerk mit 8 Modulen installieren, was kosten die Module?
2. Wie viel Elterngeld bekomme ich bei 3000 Euro brutto?
3. Lohnt sich eine Wärmepumpe für ein Haus von 1975?
4. Was brauche ich mit dem Auto in Kroatien, Vignette oder Maut?
5. Was kostet ein Stromspeicher mit oder ohne Montage?
6. Welche Medikamente darf man nicht mit Alkohol nehmen?
7. Wie hoch ist der Rundfunkbeitrag 2027?
8. Darf mein Vermieter die Miete nach einer Modernisierung erhöhen, und um wie viel?
9. Welche Zimmerpflanzen sind giftig für Katzen?
10. Ab wann gilt die neue Grundsteuer und was ändert sich für Mieter?
11. Unterschied zwischen ETF und Fonds bei den Kosten?
12. Wie lange ist ein Brief der Deutschen Post innerhalb Deutschlands unterwegs?
13. Kann ich mit einem Führerschein Klasse B einen Anhänger mit 1000 kg ziehen?
14. Was kostet eine Bahncard 50 für Studenten?
15. Gibt es eine Förderung für Lastenräder in Hessen?

Gezählt je Lauf: Antwort enthält die Kernangabe (Zahl/Regel, vorher von Hand aus einer
Primärquelle notiert); falsche Angabe; benannte Lücke; Zeit; Tavily-Abfragen. „gründlich“ wird nur
Standard bei **mehr Kernangaben ohne mehr falsche** (Regel „Sieger nur bei mehr Treffern“).

## Entwurf (Rev. 3, nach Codex Runde 2: schlanker statt mehr Absicherung)

Rev. 3 ersetzt R2, R4, R5, R6 und R7 aus Rev. 2. **R1 und R3 gelten weiter** (trugen laut
Runde 2), mit der Änderung zu R3 in S5. Leitlinie: keine feste Regel behauptet etwas zu beweisen,
was sie nicht beweisen kann; Grenzen werden angezeigt statt mit Heuristiken überdeckt.

### S1 — Nachfragen: Hinweis statt Sperre, Bezug in die sichtbare Frage (F02, F09)
- Keine Sperre. Ist die Frage kurz (≤ 6 Wörter) und gab es im Gespräch eine Websuche, zeigt die
  Webzeile bei „gründlich“ einen **Hinweis**: „Bezieht sich das auf deine vorige Suche? Der
  gründliche Modus sieht nur diese Frage.“ mit Knopf „Thema ergänzen“.
- „Thema ergänzen“ setzt die vorige **gesendete** Frage/Suche vor die neue Frage **ins
  Eingabefeld selbst** (sichtbar, editierbar), nicht in `webQuery`. Der Planer liest weiter nur
  `question` (R1) — damit bekommt er das Thema genau dann, wenn der Nutzer es sichtbar übernommen hat.
- Die Heuristik ist nur Anlass für den Hinweis; ein Fehlalarm kostet einen ignorierbaren Satz.

### S2 — Wörterabgleich nur als Anzeige und Anlass, nie als Beweis (F01, F06, F10)
- Nach dem Einfrieren: Zahlen und Wörter (≥ 3 Zeichen, nicht in `SEARCH_FILLER`, inklusive kurzer
  großgeschriebener Fachkürzel wie „ETF“) aus der Frage, die in **keinem eingefrorenen Auszug**
  vorkommen. Zahlen werden normalisiert verglichen („3.000“ = „3000“ = „3 000“); Wörter über den
  gemeinsamen Wortstamm aus `shared/rag/lexical.ts` erweitert um einfache Endungen (-n, -en, -e, -s).
- Anzeige an der Antwort: „Diese Wörter aus deiner Frage kommen in den gelesenen Seiten nicht vor:
  8, Module“. **Nie** „Frage beantwortet“/„abgedeckt“; eine leere Liste wird nicht angezeigt
  (keine grüne Bestätigung).
- Darf die eine reservierte Nachsuche auslösen (R3). Ausbleiben der Nachsuche behauptet nichts.
- Der Antwort-Prompt bekommt die Liste und soll diese Punkte als Lücke benennen.

### S3 — Große Seiten wie bisher abgelehnt, Ersatz rückt nach (F07, F11, F12)
- Keine Ausschnitte. `rejectTruncatedBody` bleibt auch bei „gründlich“; eine zu große Seite zählt
  als Abruf im Budget (R3) und erscheint wie heute als „zu groß“.
- Hat das Modell Ersatzkandidaten gewählt (Wahl bis zu 6 Nummern in Rangfolge, abgerufen werden
  der Reihe nach bis zur Seitenzahl aus S4), rückt der nächste nach, solange das Abrufbudget reicht.
- Damit entfällt jede neue Datenstruktur für Kürzungsarten; `fetchAndExtract` bleibt unverändert.

### S4 — Seitenzahl nach Platz im Modell, Wahlreihenfolge bleibt (F05, F13)
- Vor dem Abruf berechnet der Main aus Kontextfenster, **fertigem** Systemtext (inkl. S2-Liste
  in Höchstlänge), Frage, Verlaufsbudget und Nachfrage-Reserve (`measureWithFollowUpRoom`) den
  Platz für Auszüge; Seitenzahl `n = min(4, floor(Platz / 1500))`, mindestens 1. Bei `n = 0`
  kein gründlicher Lauf, sichtbarer Grund („Modellfenster zu klein für gründliche Suche“).
- Eingefroren werden die ersten `n` lesbaren Seiten **in Wahlreihenfolge**
  (`freezeWebSources` bekommt die Ordnung), `WEB_CHAT_MAX_SOURCES` gilt nur für „schnell“.
- Ergibt das Einfrieren trotzdem einen Auszug unter 1500 Zeichen, fällt die letzte Seite heraus
  und wird als „abgerufen, aus Platzgründen nicht verwendet“ angezeigt.

### S5 — Recherchefrist und Nutzer-Stopp getrennt (F08, F14)
- Zwei Signale: `userAbort` (Stopp, Fenster zu, Tab weg) und `researchDeadline` (60 s, lokales
  Modell 90 s, ab Lauf-Start).
- Die Recherchefrist bricht **nur** Planung, Suchen, Wahl und Abrufe ab; was bis dahin eingefroren
  ist, geht in die Antwortphase, die nur am `userAbort` hängt. Kennzeichnung „Recherche nach
  Zeitlimit beendet“.
- Planung scheitert (kein JSON, Frist) → genau einmal Rückfall auf die Frage wörtlich als Suche,
  gezählt im selben Budget, sichtbar als „eingeschränkte Recherche: Planung fehlgeschlagen“.
  Wahl scheitert → Kandidaten in Trefferreihenfolge, sichtbar „eingeschränkte Recherche: Auswahl
  fehlgeschlagen“.

### S6 — Messung (F15)
- Vorher je Frage aus R7-Liste festgelegt und im Repo abgelegt: Kernangabe(n), eine Primärquelle
  mit Abrufdatum, zulässige Lücke, schwere Fehler (falsche Zahl/Regel, fehlende wesentliche
  Einschränkung). Risikoklasse: Alltag / Geld / Recht / Gesundheit.
- Läufe gepaart und zeitnah (schnell und gründlich direkt nacheinander, Reihenfolge wechselnd),
  3 Wiederholungen, gleiches Modell; gesichert werden Suchanfragen, Treffer, eingefrorene Auszüge,
  Antwort.
- Bewertung je Antwort nach Raster (Kernangabe richtig / falsch / fehlt, Einschränkung fehlt,
  Quelle trägt die Angabe ja/nein), ohne Kenntnis des Modus (Dateien vor der Bewertung umbenannt).
- „gründlich“ wird Standard nur bei mehr richtigen Kernangaben UND keiner zusätzlichen schweren
  Falschaussage in irgendeiner Risikoklasse.

## Fragen an Codex

1. **Halluzination durch Suchwahl:** Das Modell bestimmt jetzt, welche Seiten „Beleg“ werden
   (F05 alt). Reicht „Suchwörter hinterher sichtbar + Auswahl nur aus eigener Liste + Satzprüfung
   wie bisher“? Was fehlt (z. B. Pflicht, verworfene Treffer zu zeigen; Abdeckung der Frage)?
2. **Injection:** Titel und Anrisse der Suchtreffer gehen ans Modell (Schritt 3). Was kann eine
   präparierte Trefferseite damit erreichen, wenn das Modell nur Nummern zurückgeben darf?
   Und in Schritt 5?
3. **Datenwege:** Planung schickt die Frage an den Modellweg, bevor gesucht wird; Suchwörter
   verlassen das Haus ungesehen. Ist die Datenwege-Zeile vor dem Senden plus „gesucht nach“
   hinterher genug? Darf die Planung je etwas aus dem Verlauf nehmen (Nachfragen wie „und 2027?“)?
4. **Große Seiten gekürzt:** Welche Risiken entstehen (Seitenanfang = Navigation/Cookie-Text,
   Preis steht weiter unten), und wie ehrlich muss die Anzeige sein?
5. **Rückfälle:** Sind die Rückfälle (Planung scheitert → Frage wörtlich; Wahl leer → erste 4)
   richtig, oder verschleiern sie, dass „gründlich“ gar nicht gründlich war?
6. **Kosten/Zeit:** bis zu 3 Tavily-Suchen + 2–3 Modellaufrufe vor der Antwort. Lokales 27B-Modell:
   tragbar? Sollte „gründlich“ bei lokalem Modell anders begrenzt sein?
7. **Standard:** Soll „gründlich“ Standard des Globus sein (Alltagsfragen-Ziel) oder Opt-in?
8. Gibt es einen einfacheren Weg mit demselben Gewinn (z. B. nur Seitenauswahl durch das Modell
   ohne eigene Suchwörter, oder nur große Seiten gekürzt + mehr Kandidaten)?

## Codex-Findings

### F01 — Mehr Suchen beweisen keine Abdeckung der Frage
Schwere: hoch  
Stelle: `app/src/main/index.ts:7003`, `app/src/main/llm/petrolWebPrompt.ts:41`, `app/src/shared/rag/citations.ts:357`  
Status: [OFFEN]  
Beschreibung: Der Entwurf lässt dasselbe Modell Suchaspekte festlegen und Treffer auswählen. Fehlt etwa „8 Module“ oder die verlangte Jahreszahl schon in den Suchwörtern, können die gewählten Auszüge die Frage nicht beantworten. Die heutige Satzprüfung (`analyzeCitations`/`sentenceExtras`, `index.ts:7003–7008`) prüft eine fertige Antwort gegen die *gewählten* Auszüge, nicht, ob diese die ursprüngliche Frage abdecken. „Gesucht nach“ und Quellenangaben hinterher beheben diesen Auswahlfehler nicht; eine Teilantwort kann dadurch gut belegt aussehen.  
Vorschlag: Vor der Antwort die wesentlichen Bedingungen der Originalfrage gegen die tatsächlich eingefrorenen Auszüge prüfen und fehlende Aspekte in Antwort und Anzeige ausdrücklich nennen. Suchplan und Auswahl dürfen diese Bedingungen nicht still streichen. Ein Testkorpus mit Mehrfachbedingungen, Datum, Negation und Vergleichsfragen muss den Gewinn gegenüber „schnell“ messen.

### F02 — Folgefragen ohne Bezugswort sind für den Suchplan unlösbar
Schwere: hoch  
Stelle: `app/src/renderer/stores/petrolChatStore.ts:225`, `app/src/main/index.ts:6851`, `app/src/main/index.ts:6938`  
Status: [OFFEN]  
Beschreibung: Schritt 1 sieht ausdrücklich nur die aktuelle Frage. Bei „Und 2027?“ oder „Was kostet das?“ fehlt das Thema, obwohl der Chat Gesprächsverlauf und frühere Web-Themenfragen getrennt führt. Das Modell müsste den Bezug erfinden; spätere Verlaufsgabe für die Antwort repariert die falsche Recherche nicht. Pauschal den Verlauf an die Planung zu geben würde umgekehrt private Gesprächsinhalte in Suchanfragen verwandeln.  
Vorschlag: Solche unaufgelösten Bezüge vor der Suche erkennen und eine Konkretisierung verlangen oder eine für den Nutzer sichtbare, ausdrücklich bestätigte Suchfrage mit Bezug erstellen. Verlauf nur mit gesonderter bewusster Freigabe in die Planung übernehmen; niemals still in die Anbieteranfragen.

### F03 — Modellgewählte Suchwörter verlassen den Rechner ungesehen
Schwere: hoch  
Stelle: `app/src/renderer/components/Agent/PetrolChat.tsx:701`, `app/src/main/index.ts:6845`, `app/src/main/noteAgent/skills.ts:1703`  
Status: [OFFEN]  
Beschreibung: Die heutige Webzeile macht den Suchtext vor dem Senden editierbar; der Main prüft ihn auf Länge. Bei „gründlich“ würden erst nach dem Senden generierte Wörter unmittelbar an Tavily oder SearXNG gehen. Der vorgeschlagene allgemeine Datenweg-Hinweis ist keine Einsicht in den tatsächlichen Text. Auch ohne Verlauf kann das Modell einen Namen oder andere Details der Frage unnötig wiederholen oder neue Behauptungen als Suchwörter ausgeben. Die bewusste Aufhebung der alten F08-Regel erfordert eine andere klare Einwilligungsgrenze.  
Vorschlag: Vor dem Klick ausdrücklich sagen, dass das Modell bis zu drei *nicht vorab prüfbare* Suchanfragen aus der aktuellen Frage erstellt und an den gewählten Anbieter sendet. Für sensible Fragen einen sichtbaren Prüf-/Editierschritt oder den schnellen Modus anbieten. Im Main strikt nur die aktuelle Frage und das Datum als Planungsdaten zulassen, jede tatsächlich gesendete Anfrage samt Fehler/Fallback danach anzeigen.

### F04 — Such- und Abrufbudgets widersprechen einander
Schwere: hoch  
Stelle: `app/src/shared/webResearch.ts:78`, `app/src/main/noteAgent/skills.ts:1702`, `app/src/shared/webChat.ts:509`  
Status: [OFFEN]  
Beschreibung: Schritt 1 gestattet bis zu drei Suchen; Schritt 5 hängt noch eine an, während die Grenze „insgesamt höchstens 3“ verspricht. Die Agentenprüfung zählt auch fehlgeschlagene externe Versuche vor dem Aufruf (`skills.ts:1708`); ein gleiches Zählprinzip fehlt im Entwurf. Ebenso muss ein erneutes Wählen/Lesen die fünf Abrufe *gesamt* zählen, statt die `runFetchQueue`-Vorgabe von fünf pro Aufruf erneut zu verwenden. Sonst stimmen Kosten, Anzeige und Abbruchgrenzen nicht.  
Vorschlag: Vor dem ersten Aufruf ein einziges Main-seitiges Laufbudget anlegen: z. B. höchstens zwei Plansuchen plus eine reservierte Nachsuche, höchstens fünf begonnene Abrufe insgesamt; Fehlschläge mitzählen. Kein weiterer Start bei erschöpftem Budget. Den tatsächlich verwendeten und verworfenen Plan mit Gründen anzeigen.

### F05 — „Bis zu vier Seiten gewählt“ werden heute auf drei reduziert
Schwere: hoch  
Stelle: `app/src/shared/webChat.ts:27`, `app/src/shared/webChat.ts:648`, `app/src/main/index.ts:6943`  
Status: [OFFEN]  
Beschreibung: `freezeWebSources` sortiert Abrufe nach `candidate.index` und behält nur die ersten drei brauchbaren Einträge (`:653–668`). Bei der geplanten Wahl von vier Nummern kann die vierte trotz erfolgreichem Abruf ohne Auszug und Quellenangabe verschwinden; zudem kann die Trefferrangfolge die Reihenfolge der Modellwahl überschreiben. Eine für die Frage entscheidende Seite wird dann zwar abgerufen, aber nicht zur Belegbasis. Auch eine gemeinsame Kandidatenliste von höchstens zwölf aus bis zu 24 Treffern kann bei bloßem Aneinanderhängen spätere Suchanfragen vor der Wahl ganz verdrängen (`candidatesFromHits` bewahrt Anbieterreihenfolge, `webChat.ts:469–480`).  
Vorschlag: Kandidaten fair über Suchanfragen zusammenführen; URL-Dubletten und deren Herkunft erhalten. Höchstens so viele Seiten wählen/abrufen, wie der Antwortpfad tatsächlich einfriert, oder dessen Limit und Budget bewusst erhöhen. Auswahlrangfolge erhalten und jeden verfallenen Abruf offen ausweisen.

### F06 — Leere Auswahl und zwei lesbare Seiten sind kein Qualitätsnachweis
Schwere: mittel  
Stelle: `app/src/shared/webChat.ts:509`, `app/src/main/llm/petrolWebChat.ts:101`, `app/src/main/index.ts:6957`  
Status: [OFFEN]  
Beschreibung: Der Entwurf ersetzt eine ungültige Auswahl durch die ersten vier Treffer und löst eine Nachsuche nur bei weniger als zwei *lesbaren* Seiten aus. Zwei lesbare, aber sachlich unpassende Ratgeber beenden damit die Recherche; eine ungültige Modellauswahl führt unbemerkt zum bisherigen First-hit-Verfahren zurück. Der heutige Pfad kennt „lesbar“ als nichtleeren extrahierten Text, nicht als Antwort auf die Frage.  
Vorschlag: Planungs-/Auswahl-Fallback und die Zahl unpassender Seiten im Ergebnis als eingeschränkte Recherche kennzeichnen. Eine Nachsuche an nachweislich fehlende Frageaspekte binden, nicht allein an HTTP-/Text-Erfolg. Wenn die Abdeckung nicht prüfbar ist, die Lücke benennen statt „gründlich“ zu suggerieren.

### F07 — Teil-HTML und Präfix-Auszug können entscheidende Angaben verschlucken
Schwere: hoch  
Stelle: `app/src/main/webResearch/fetchExtract.ts:85`, `app/src/main/webResearch/fetchExtract.ts:99`, `app/src/main/webResearch/fetchExtract.ts:121`  
Status: [OFFEN]  
Beschreibung: Ohne `rejectTruncatedBody` wird nach 1,5 MB ein möglicherweise unvollständiges HTML-Dokument geparst (`:99–118`); anschließend bleiben nur die ersten 8.000 Zeichen des extrahierten Markdown (`:59–66`). Preis, Grenzwert oder Einschränkung weiter unten fehlt. `originalChars` bezeichnet dabei die Länge des aus dem *Teil-HTML* gewonnenen Textes, nicht die vollständige Seite. Das bloße Etikett „gekürzt“ erklärt nicht, welcher Teil gelesen wurde; „die Seite enthält dazu nichts“ wäre falsch. Die bisherige Ablehnung großer Bodies (`petrolWebChat.ts:144`) wurde gerade gegen diesen Schein vollständiger Lektüre eingebaut.  
Vorschlag: Byte-Kappung und Auszug-Kappung getrennt ausweisen. Abgeschnittenes HTML nicht wie eine vollständig gelesene Seite behandeln; entweder weiterhin ablehnen oder gezielte, prüfbare Textstellen extrahieren. Die Antwort nur über den tatsächlich eingefrorenen Auszug sprechen lassen („im gelesenen Auszug nicht gefunden“), und den Kürzungsstatus an Quelle und Export erhalten.

### F08 — Frist und Abbruch brauchen einen einzigen Laufzustand
Schwere: mittel  
Stelle: `app/src/main/llm/petrolWebChat.ts:54`, `app/src/main/index.ts:6809`, `app/src/main/index.ts:6989`  
Status: [OFFEN]  
Beschreibung: `gatherWebSources` setzt derzeit bei jedem Aufruf einen eigenen 25-Sekunden-Timer (`:54–62`). Wiederverwendung für drei parallele Suchen plus Nachsuche kann die geplante Gesamtfrist von 60 Sekunden verlängern; Planung und Auswahl brauchen eigene abbrechbare Modellaufrufe und zählen ebenfalls hinein. Der vorhandene Streaming-Aufruf deckt erst die Antwort ab. Insbesondere beim lokalen 27B-Modell können zwei bis drei Voraufrufe die Wartezeit dominieren, ohne dass Netzlimits helfen.  
Vorschlag: Im Main vor Schritt 1 eine absolute Deadline, einen gemeinsamen AbortController und atomare Zähler für Suchen/Abrufe anlegen; vor und nach jedem `await` sowie vor Progress-/Snapshot-Ausgabe Abbruch und Fensterkennung prüfen. Nur die verbleibende Frist an Netz- und Modellaufrufe geben, auf Timeout mit erkennbarer Teilrecherche enden. Laufzeit und Ergebnisqualität mit dem lokalen Zielmodell messen, bevor ein Standard festgelegt wird.

## Urteil

**Frage 7:** „Gründlich“ zunächst als bewusst wählbare Stufe, nicht als Standard. Die Mehrkosten, Wartezeit und die unsichtbar erzeugten Anbieteranfragen sind real; ein Qualitätsgewinn ist für die geschilderten Fälle plausibel, aber nicht nachgewiesen. Erst mit Messung an echten Alltagsfragen, einschließlich falscher und unbeantworteter Antworten, über einen Standard entscheiden.

**Frage 8:** Der kleinste Versuch ist eine zusätzliche Seitenauswahl aus den bestehenden acht Treffern und ein klar markierter Abruf großer Seiten. Das hilft bei falsch ausgewählten/zu großen Treffern, kann aber eine schlechte Ausgangssuche nicht heilen. Für den geschilderten Balkonkraftwerk-Fall ist eine zweite, gezielte Anfrage nötig; sie kann zunächst als sichtbarer, vom Nutzer bestätigter Stichwortvorschlag laufen. Erst wenn das messbar nicht reicht, lohnt die automatische mehrstufige Planung.

### Runde 2

Nachprüfung des **Entwurfs**, noch keiner Implementierung:

- **F01 — trägt nicht:** R5 prüft nur einzelne Wortvorkommen, keine Beziehung, Bedingung oder Antwort auf die Originalfrage; die heutige Satzprüfung tut das ebenfalls nicht (`app/src/shared/rag/citations.ts:4–9,415–427`). Siehe F10.
- **F02 — trägt nicht:** R2 fängt „Und 2027?“ ab, aber etwa „Was kostet es?“ oder „Wie viel dann?“ nicht; der angebotene Knopf ändert nur `webQuery`, während die Planung laut R1 nur `question` liest (`app/src/renderer/components/Agent/PetrolChat.tsx:138–139,262–280`). Siehe F09.
- **F03 — trägt:** R1 nennt die ungesehenen Anbieteranfragen vorab und beschränkt die Planungsdaten im Main auf Frage und Datum; die heutige sichtbare Anfrage bleibt im schnellen Modus (`app/src/renderer/components/Agent/PetrolChat.tsx:119–120,705–727`). Das setzt die Main-seitige Modusprüfung voraus; umgesetzt ist es noch nicht.
- **F04 — trägt:** R3 reserviert die dritte Suche und zählt gestartete Abrufe laufweit statt je `runFetchQueue`-Aufruf (`app/src/shared/webChat.ts:514–519`); die Zeitbehandlung ist gesondert in F14 offen.
- **F05 — trägt nicht:** R4 behebt Reihenfolge und Drei-Seiten-Grenze auf Planebene, aber `applyWebChatBudget` kann trotz vier lesbarer Abrufe Auszüge auf null kürzen; die Zusage „was gewählt wird, wird Beleg“ braucht eine Mindestgröße oder sichtbares Verwerfen (`app/src/shared/webChat.ts:609–638,668–682`). Siehe F13.
- **F06 — trägt nicht:** R5 ersetzt die Zwei-Seiten-Regel durch Begriffsabgleich und markiert Rückfälle, doch ein Vorkommen in irgendeinem Auszug ist kein Nachweis für eine passende Seite; der Trigger kann trotz unpassender Treffer ausbleiben (`app/src/shared/rag/citations.ts:101–109`). Siehe F10/F11.
- **F07 — trägt nicht:** R6 will Absätze aus dem ganzen Text auswählen, aber `fetchAndExtract` kappt Markdown heute bereits auf 8.000 Zeichen vor Rückgabe und parst bei Byte-Kappung nur Teil-HTML (`app/src/main/webResearch/fetchExtract.ts:99–130`). Siehe F11/F12.
- **F08 — trägt nicht:** Eine absolute Frist ist richtig; R3 vermischt jedoch Ablauf der Recherchefrist mit dem Abbruchsignal, obwohl die anschließende Antwort denselben Controller benötigt (`app/src/main/index.ts:6981–7001`). Siehe F14.

### F09 — Bezugsheuristik sperrt klare Fragen und lässt unklare durch
Schwere: hoch  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:103–110`, `app/src/renderer/components/Agent/PetrolChat.tsx:138–139`, `app/src/renderer/components/Agent/PetrolChat.tsx:262–280`  
Status: [OFFEN]  
Beschreibung: Die Startwörter „und“/„aber“ sperren kurze, selbständige Fragen wie „Und was kostet eine Bahncard?“; Fragen wie „Was kostet es?“, „Wie viel dann?“ oder englisches „And in 2027?“ rutschen durch. Das ≥5-Buchstaben-Substantiv ist kein verlässlicher Bezugstest. Der vorgeschlagene Ausweg „vorige Suche übernehmen“ setzt derzeit nur `webQuery`; R1 verbietet dem Planer aber, dieses Feld zu lesen. Damit bleibt gerade die abgefangene Anschlussfrage ohne Thema.  
Vorschlag: Bei ungeklärtem Bezug eine **vollständige, sichtbare neue Frage** verlangen oder aus Frage und früherem Thema als editierbaren Entwurf anbieten; erst diese bestätigte Frage darf in den Planer. Heuristik nur als Hinweis verwenden, nicht als harte Sperre für selbständige Fragen. Grenzfälle mit Deutsch, Englisch, Flexion und Satzanfängen testen.

### F10 — Prüfbegriffe sind weder vollständig noch eine Abdeckungsprüfung
Schwere: hoch  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:131–143`, `app/src/shared/rag/citations.ts:101–109`, `app/src/shared/rag/lexical.ts:89–94`  
Status: [OFFEN]  
Beschreibung: Die Regel streicht das erste Substantiv einer Frage („Elterngeld 2027?“), kurze fachliche Angaben wie „ETF“, „B“ und „kg“ sowie Relationen wie „mit **oder ohne** Montage“. `contentWords` trennt bzw. normalisiert weder „3000“ und „3.000“ noch „Module“ und „Modulen“ gleich; der Komposita-Abgleich in `lexical.ts` kennt nur gleiche Wortenden, keine Beugung. Umgekehrt können alle Wörter irgendwo in vier Auszügen stehen, ohne dass eine Quelle die gefragte Kombination oder Regel trägt. Die Liste „In den gelesenen Seiten nicht gefunden“ wäre dann leer und die Nachsuche bliebe aus, obwohl die Kernfrage unbeantwortet ist.  
Vorschlag: R5 auf **diagnostische Suchhilfe** begrenzen und sichtbar „Wörter gefunden“ nennen, nie als hinreichenden Qualitäts- oder Retry-Test verwenden. Kernbedingungen einschließlich kurzer Fachbegriffe, Zahlenformaten, Vergleich/Alternative und zusammengehörigen Aussagen getrennt behandeln; bei nicht entscheidbarer Abdeckung eine Lücke ausweisen. Fälle aus R7 als konkrete Gegenbeispiele testen.

### F11 — Stichwortfenster können Gegenbelege und Kontext ausblenden
Schwere: hoch  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:145–154`, `app/src/main/llm/petrolWebPrompt.ts:41–58`, `app/src/shared/rag/citations.ts:415–427`  
Status: [OFFEN]  
Beschreibung: R6 nimmt Absätze mit Prüfbegriffen und Nachbarabsätze, bis das Zeichenlimit voll ist. Ein Treffer auf „2000 Wp“ im ersten Produktblock kann so eine spätere Einschränkung, Aktualisierung oder Gegenposition verdrängen; eine Seite ohne exakt diese Wörter fällt ganz heraus, obwohl sie dieselbe Sache anders formuliert. Eine präparierte Seite kann Prüfbegriffe vor eine Anweisung oder erfundene Zahl setzen und damit genau diesen Absatz in die Belegbasis ziehen. Die UNTRUSTED-Grenze im Antwort-Prompt reduziert das Befolgungsrisiko, prüft aber die Auswahl nicht; die Satzprüfung vergleicht nur mit den ausgewählten Auszügen.  
Vorschlag: Absätze nach festen, nachvollziehbaren Regeln mit Kontext und Abschnittsüberschrift wählen; Gegenbelege und spätere Korrekturen nicht still durch ein frühes Zeichenlimit verdrängen. Fehlende exakte Wörter dürfen eine lesbare Seite nicht automatisch disqualifizieren. Die Anzeige muss sagen, dass **nur ausgewählte Ausschnitte** geprüft wurden. Injection-Fälle mit Prüfbegriffen unmittelbar vor einer Anweisung in die Tests aufnehmen.

### F12 — Die heutige Abrufschnittstelle kann R6 nicht liefern
Schwere: hoch  
Stelle: `app/src/main/webResearch/fetchExtract.ts:59–66`, `app/src/main/webResearch/fetchExtract.ts:85–130`, `app/src/shared/webChat.ts:170–171`, `app/src/main/llm/petrolWebChat.ts:144`  
Status: [OFFEN]  
Beschreibung: Für R6 müssen Absätze **vor** der 8.000-Zeichen-Kappung ausgewählt werden. `fetchAndExtract` liefert jedoch nur den Anfang zurück; `originalChars` ist bei Byte-Kappung bloß die Länge des aus Teil-HTML extrahierten Texts. `WebFetchOutcome` hat nur ein gemeinsames `truncated`-Boolean, obwohl R6 Byte- und Auszugskappung in Antwort, Export und späterer Snapshot-Nachfrage getrennt kennzeichnen will. Ohne neuen Datenvertrag erscheint der erste Seitenanfang als „Ausschnitt“ oder die Kennzeichnung geht beim Einfrieren verloren.  
Vorschlag: Extraktion und Auswahl **vor** `truncate` trennen; Teil-HTML entweder verwerfen oder ausdrücklich als unvollständig behandeln. `bodyTruncated`, `excerptSelected` und `excerptTruncated` aus dem Main bis `WebSource`, Anzeige, Export und Snapshot durchreichen; nur den finalen, vorbereiteten und budgetierten Auszug einfrieren.

### F13 — Vier Seiten können im kleinen Fenster zur Scheinsammlung werden
Schwere: mittel  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:122–129`, `app/src/shared/webChat.ts:51–65`, `app/src/shared/webChat.ts:604–638`, `app/src/shared/webChat.ts:692–705`  
Status: [OFFEN]  
Beschreibung: Bei 4096 Kontexttokens beträgt das aktuelle Gesamtbudget nur `(4096−1536)×3 = 7680` Zeichen. Darin stecken Systemtext, Frage, Verlauf und Reserve für eine Nachfrage (`app/src/main/llm/petrolWebFollowUp.ts:50–62`); R5 ergänzt noch eine Begriffsliste. `applyWebChatBudget` teilt den Rest gleichmäßig auf vier Seiten und kann jedem nur wenige oder null Zeichen geben. `freezeWebSourcesToFit` kürzt bei Überschreitung weiter am Ende; null Auszüge fallen heraus. „Vier gewählt“ darf folglich nicht als „vier inhaltlich geprüft“ erscheinen.  
Vorschlag: Vor dem Abruf aus dem **fertigen** Systemtext und Modellfenster eine Mindestlänge pro Auszug berechnen. Wenn vier nicht sinnvoll passen, weniger Seiten auswählen/einfrieren und den Grund anzeigen; die endgültige Abdeckungsprüfung erst über diese finalen Auszüge ausführen. Für 4096/6144 Tokens und lange Fragen/Verläufe eigene Budgetfälle messen.

### F14 — Recherchefrist und Antwortabbruch widersprechen sich
Schwere: mittel  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:112–120`, `app/src/main/index.ts:6811–6821`, `app/src/main/index.ts:6981–7001`  
Status: [OFFEN]  
Beschreibung: R3 verlangt, bei Fristablauf aus bereits eingefrorenen Auszügen noch zu antworten. Der heutige `req.controller.signal` steuert aber **auch** die Antwort; wenn die absolute Frist diesen Controller abbricht, endet der Modellaufruf als „stopped“ statt mit einer gekennzeichneten Teilantwort. Wird er nicht abgebrochen, können Planung/Netz nach Frist weiterlaufen. Rev. 1 verspricht 60 Sekunden für Planung, Auswahl und Netz, R3 sagt „jeder Modellaufruf“, ohne die Antwortphase und ihre eigene Grenze eindeutig auszunehmen.  
Vorschlag: Nutzer-Stopp und Recherchefrist getrennt modellieren: Frist stoppt weitere Planung/Suche/Abrufe, erhält bereits finalisierte Auszüge und erlaubt eine **eigene, begrenzte Antwortphase**; Nutzer-Stopp beendet beide. Vor jeder Ausgabe auf Fenster/Request prüfen. Ein Planungs-Timeout darf nicht zugleich den in Rev. 1 versprochenen wörtlichen Fallback und das gesamte Laufbudget neu starten.

### F15 — Das Messkriterium kann einen schlechteren Modus zum Sieger erklären
Schwere: hoch  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:157–178`, `app/src/main/index.ts:7006–7008`, `app/src/shared/rag/citations.ts:4–9`  
Status: [OFFEN]  
Beschreibung: „Kernangabe enthalten, ohne mehr falsche“ prüft nicht, ob die Zahl/Regel zur **konkreten Frage** passt oder von den tatsächlich eingefrorenen Auszügen getragen wird. Ein Modus kann mehr Kernwörter nennen, dabei unbelegte Nebensätze oder falsche Ausnahmen hinzufügen, und nach der vorgeschlagenen Zählung gewinnen. Der Korpus mischt zudem Medizin, Recht und Geld mit Alltagsfragen; ein zusätzlicher falscher Rat in einem solchen Fall lässt sich nicht durch zwei richtige Produktpreise kompensieren. Tavily schwankt laut Ist-Zustand zwischen Läufen, drei Wiederholungen ohne gepaarte zeitnahe Durchläufe verwechseln Suchqualität mit Anbieterdrift.  
Vorschlag: Vorher pro Frage Kernbedingungen, gültige Quellen mit Abrufdatum, zulässige Lücke und schwerwiegende Fehler festlegen. Jede Antwort blind auf Korrektheit, Relevanz, Quellenstütze und fehlende Einschränkungen bewerten; pro Frage und Risikoklasse ausweisen. Läufe zeitnah paaren und Reihenfolge wechseln, Query-/Treffer-/Auszugssnapshots für Nachvollziehbarkeit sichern. Standardwechsel nur ohne neue schwerwiegende Falschaussagen.

**Urteil:** Rev. 2 ist für den Bau in dieser Form noch nicht reif. R1 und die Laufzähler aus R3 sind tragfähige Grenzen; R2 muss den Bezug wirklich in die sichtbare Frage bringen, R5 darf Worttreffer nicht als Antwortabdeckung behandeln, und R6 braucht einen anderen Extraktions- und Provenienzvertrag. Vor einem Standardwechsel sind Budgetfälle kleiner Modelle und eine quellenbezogene, gepaarte Messung nötig.

### Runde 3

Nachprüfung des **Entwurfs** gegen den heutigen Code; S1–S6 sind noch nicht implementiert:

- **F09 — trägt:** S1 sperrt keine selbständige Frage mehr und lässt den Nutzer den Bezug sichtbar in `draft` ergänzen; der heutige Knopf ändert dagegen nur `webQuery` (`app/src/renderer/components/Agent/PetrolChat.tsx:138–139,262–280`). Die Herkunft des angebotenen alten Texts bleibt in F16 offen.
- **F10 — trägt nicht:** S2 nennt den Abgleich ausdrücklich nur Diagnose, lässt ihn aber weiterhin die Nachsuche steuern; die neue Endungs- und Zahlengleichsetzung kann die Anzeige „Wörter … kommen nicht vor“ sachlich falsch machen (`app/src/shared/rag/citations.ts:101–109`, `app/src/shared/rag/lexical.ts:89–94`). Siehe F17.
- **F11 — trägt:** S3 streicht die angreifbare Absatz-Auswahl ganz; der heutige Petrol-Abruf lehnt Byte-Kappung bereits ab (`app/src/main/llm/petrolWebChat.ts:144`, `app/src/main/webResearch/fetchExtract.ts:99–101`).
- **F12 — trägt:** Mit S3 werden weder Volltext-Ausschnitte noch getrennte Kürzungsarten gebraucht; `fetchAndExtract` kann unverändert den bisherigen, höchstens 8.000 Zeichen langen Auszug liefern (`app/src/main/webResearch/fetchExtract.ts:59–66,121–130`).
- **F13 — trägt nicht:** S4 rechnet vor dem Abruf mit einer „fertigen“ Größe, obwohl Titel, finale Hosts und tatsächliche Auszüge dann noch fehlen; der aktuelle Budgetpfad misst deshalb **nach** dem Einfrieren erneut und kürzt (`app/src/shared/webChat.ts:686–705`). Siehe F19.
- **F14 — trägt nicht:** Zwei getrennte Signale sind richtig, aber S5 verspricht nach Ablauf der Recherchefrist noch einen neuen Such-Fallback und benennt die Bindung an `claimPetrolRequest`/Antwort/Snapshot nicht ausreichend (`app/src/main/index.ts:6403–6429,6989–7013`). Siehe F20.
- **F15 — trägt nicht:** S6 verbessert Raster und Paarung, aber umbenannte Dateien machen die Bewertung bei sichtbaren Suchstrategien nicht verlässlich blind; die 15 vorab selbst festgelegten Goldwerte und schweren Fehler bleiben ohne unabhängige Prüfung anfällig (`docs/codex-collab/chat-gruendliche-suche.md:234–245`). Siehe F21.

### F16 — „Vorige Suche“ ist im gründlichen Modus nicht eindeutig gespeichert
Schwere: mittel  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:186–194`, `app/src/shared/webChat.ts:250–268`, `app/src/renderer/stores/petrolChatStore.ts:238–269`  
Status: [OFFEN]  
Beschreibung: S1 will die vorige **gesendete** Frage/Suche in das Eingabefeld setzen. `lastSentWebQuery` liest heute genau **ein** `webQuery` der letzten Webfrage, auch wenn der Lauf scheiterte. Bei „gründlich“ gehen nach dem Senden bis zu drei modellgenerierte Anfragen heraus; keine davon kann vorab im bisherigen `webQuery` stehen. Der Knopf könnte somit eine gar nicht gesendete Frage oder nur eine von mehreren Anfragen als „vorige Suche“ ausgeben. Ein Modellwortlaut kann zudem das ursprüngliche Anliegen verkürzen.  
Vorschlag: Für S1 ausschließlich die letzte **vom Nutzer gesendete Frage** eines passenden Gesprächs verwenden und den Knopf „Vorige Frage als Thema ergänzen“ nennen; Suchanfragen separat als Laufprovenienz speichern. Gescheiterte/gestoppte Läufe und spätere Themenwechsel bei der Auswahl klar behandeln. Den zusammengesetzten `draft` sichtbar und editierbar lassen.

### F17 — Gleichgesetzte Wortformen verfälschen die wörtliche Diagnose
Schwere: mittel  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:195–205`, `app/src/shared/rag/citations.ts:100–109`, `app/src/shared/rag/lexical.ts:84–94`  
Status: [OFFEN]  
Beschreibung: S2 sagt „Diese Wörter … kommen … nicht vor“, vergleicht aber ausdrücklich auch Endungsvarianten und Zahlenformate. „Module“ und „Modul“ werden so wahrscheinlich gleichgesetzt, obwohl das Wort der Frage wörtlich fehlt; „3.000“ kann auf fremdsprachigen Seiten eine Dezimalzahl statt „3000“ sein. Umgekehrt ist `sharesCompoundHead` in `lexical.ts` nur eine private Endungsheuristik, kein deutscher Wortstamm oder Locale-Parser. Der Matcher kann sowohl eine falsche Lücke anzeigen als auch die einzige Nachsuche wegen eines irrelevanten Varianten-Treffers unterdrücken.  
Vorschlag: Exakte Vorkommen und heuristische Varianten getrennt ausweisen; nur eindeutig normalisierte deutsche Tausender-Schreibweisen gleichsetzen. Bei Varianten den Text „ähnliche Wörter gefunden“ verwenden und niemals daraus eine negative Aussage über den wörtlichen Seiteninhalt ableiten. Die Nachsuche darf bei mehrdeutigen Varianten nicht als erledigt gelten; Gegenbeispiele wie Modul/Module, 3.000/3,000 und Abkürzungen testen.

### F18 — Ersatzrang sechs ist bei fünf Abrufen unerreichbar
Schwere: mittel  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:206–212`, `app/src/shared/webChat.ts:509–556`, `app/src/main/llm/petrolWebChat.ts:101–113`  
Status: [OFFEN]  
Beschreibung: S3 lässt sechs Wahl-Nummern zu, R3 aber höchstens fünf **gestartete** Abrufe im ganzen Lauf. Der sechste Kandidat kann niemals geöffnet werden. Nach einer ersten Lesephase mit fünf Fehlversuchen kann auch eine reservierte Nachsuche keine Seite mehr liefern. `runFetchQueue` besitzt zudem eigene `attempts`/`usable`-Zähler pro Aufruf; die heutige `gatherWebSources`-Funktion sucht sofort und ruft selbst ab. Sie lässt sich für „erst alle Suchen, dann wählen, dann Ersatz lesen“ nicht durch bloßes Wiederholen aufrufen.  
Vorschlag: Höchstens fünf Ersatzränge anfordern, tatsächlich verbleibende Abrufe vor jeder Wahl nennen und den Nachsuchpfad nur anbieten, wenn Abrufbudget **und** Frist noch reichen. Suche, Kandidatenwahl und Abruf für „gründlich“ getrennt orchestrieren; ein gemeinsamer Main-Zähler muss jeden Start vor dem `fetchPage`-Aufruf atomar zählen.

### F19 — Die Mindestlänge muss nach echter Promptmessung gelten
Schwere: hoch  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:213–222`, `app/src/shared/webChat.ts:604–638`, `app/src/shared/webChat.ts:648–705`, `app/src/main/llm/petrolWebFollowUp.ts:50–62`  
Status: [OFFEN]  
Beschreibung: `measureWithFollowUpRoom` erwartet bereits fertige `WebSource`-Objekte. Vor dem Abruf fehlen finale URL/Host, Titel, Länge und Kürzungsstatus; die S2-Liste steht sogar erst **nach** dem Einfrieren fest. Eine Vorabrechnung kann nur eine Obergrenze reservieren. Der heutige `applyWebChatBudget` hält Verlauf nur bis zum allgemeinen Quellenminimum von 3.000 Zeichen zurück, nicht bis `1500 × n`; das Nachmessen in `freezeWebSourcesToFit` kann danach weitere Seiten kürzen. „Letzte Seite herausnehmen“ allein lässt die anderen Auszüge in der bereits klein zugeteilten Länge und kann die relevante letzte Quelle statt weniger Verlauf opfern.  
Vorschlag: Vor dem Abruf konservativ nur eine **Obergrenze** für `n` bestimmen. Nach Abruf mit echten Quellen, finalem S2-Text und `measureWithFollowUpRoom` Verlauf zuerst bis zur vorgesehenen Quellenreserve reduzieren, dann Auszüge neu verteilen und **erneut messen**. Fällt eine Quelle heraus, neu einfrieren und nummerieren; Mindestlänge für alle verbliebenen Auszüge prüfen oder sichtbar weniger Quellen/keine Antwort melden. 4096-/6144-Token-Fälle mit langen Titeln, Verlauf und Nachfragen testen.

### F20 — Ein abgelaufener Recherchelauf kann keinen Such-Fallback mehr starten
Schwere: hoch  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:223–232`, `app/src/main/index.ts:6403–6429`, `app/src/main/index.ts:6811–6821`, `app/src/main/index.ts:6989–7013`  
Status: [OFFEN]  
Beschreibung: S5 sagt zugleich „Planung scheitert (Frist) → wörtlich suchen“ und „Recherchefrist bricht Suche ab“. Ist die absolute Frist abgelaufen, ist ein weiterer externer Aufruf unzulässig; ein neuer Timer würde das Limit unterlaufen. Das vorhandene `req.controller` ist die vom Renderer per Kennung gestoppte Anfrage und steuert auch Antwort und Snapshot. Ein zweiter Controller muss **einseitig** daran hängen: Nutzer-Stopp beendet beide, Recherche-Timeout nur Planung/Netz. Nach Timeout eingetroffene Abrufe dürfen weder Quellen noch einen Snapshot ergänzen.  
Vorschlag: JSON-Fehler **vor** Fristablauf darf genau einen wörtlichen Fallback versuchen, sofern Restzeit und Suchbudget reichen; Fristablauf selbst führt nur zu gekennzeichneter Antwort aus bereits final eingefrorenen Auszügen oder „nichts Lesbares“. `req.controller.signal` über alle Phasen einschließlich Antwort/Snapshot erhalten, separaten Recherche-Controller daran koppeln und `stopped`/`timeout` im Ergebnis unterscheiden.

### F21 — S6 braucht überprüfbare Goldwerte und eine zweite Bewertung
Schwere: mittel  
Stelle: `docs/codex-collab/chat-gruendliche-suche.md:234–245`, `app/src/shared/rag/citations.ts:4–9`  
Status: [OFFEN]  
Beschreibung: 15 Fragen × 2 Modi × 3 Läufe ergeben 90 Antworten; Claude kann die Läufe und Artefakte erstellen, aber das Umbenennen der Dateien verbirgt den Modus nicht unbedingt (Suchanfragen, Antwortstil und Seitenzahl verraten ihn). Ein selbst erstellter Goldwert aus **einer** Primärquelle kann zeitabhängige, regionale oder individuelle Bedingungen verfehlen, besonders bei Elterngeld, Recht, Medizin und Förderungen. Die bestehende Zitatprüfung ist ausdrücklich kein Faktencheck. Eine alleinige Bewertung durch den Bauenden würde einen Standardwechsel nicht unabhängig belegen.  
Vorschlag: Vor der Implementierung Goldwerte mit Geltungsdatum, Region, Annahmen und ggf. mehreren Primärquellen versionieren. Erst Antworten ohne Provenienz bewerten, danach Quellenstütze getrennt prüfen; Grenzfälle und schwere Fehler von einer zweiten Person oder einem unabhängigen Prüfer anhand der gesicherten Artefakte adjudizieren lassen. Claude kann die 90 Läufe vorbereiten und vorbewerten, die Entscheidung über „Standard“ sollte erst nach dieser Gegenprüfung fallen.

**Urteil:** Rev. 3 ist **noch nicht baureif**. Minimal fehlen (1) eine eindeutige Quelle für S1s sichtbaren Themenzusatz und ehrliche S2-Begriffslabels, (2) ein Abruf-/Budgetablauf, der Ersatzränge, finale Promptmessung und Mindestlänge zusammenführt, sowie (3) eine widerspruchsfreie Trennung von Recherche-Timeout und Nutzer-Stopp. S6 kann als spätere Abnahme vorbereitet werden; die Standardentscheidung braucht die unabhängige Quellenprüfung.

### Code-Prüfung

Stand `5f7d1b41` plus uncommittete Änderungen. Gezielte Läufe: `petrolDeepSearch.test.ts`, `webChatDeep.test.ts`, `webChat.test.ts`, `citations.test.ts`, `petrolWebChat.test.ts` — 112 Tests grün. Die folgenden Fälle werden dadurch nicht widerlegt.

### F22 — Nachsuche prüft andere Texte als die spätere Antwort
Schwere: hoch  
Stelle: `app/src/main/llm/petrolDeepSearch.ts:276–280`, `app/src/main/index.ts:6982–7023`, `app/src/shared/webChat.ts:704–735`  
Status: [OFFEN]  
Beschreibung: `runDeepResearch` entscheidet über die einzige Nachsuche anhand aller **rohen** lesbaren Abrufe. Der Handler friert erst danach ein, kürzt per Budget und lässt gegebenenfalls Seiten ganz fallen. Steht z. B. „8 Module“ erst am Ende eines 8.000-Zeichen-Auszugs, gilt der Begriff vor dem Einfrieren als gefunden; nach der Kürzung fehlt er in allen Modellquellen. `deepInfo.terms` meldet das korrekt, aber das Suchbudget wird nicht mehr genutzt. Dasselbe passiert, wenn ein Abruf wegen `maxPages` oder Mindestlänge nicht zur Belegbasis wird. Der Test zur Nachsuche (`petrolDeepSearch.test.ts:72–86`) verwendet kurze Texte ohne anschließendes Einfrieren.  
Vorschlag: Über Nachsuche erst anhand der **final eingefrorenen Auszüge** entscheiden oder nach dem ersten Einfrieren genau einmal neu bewerten, bevor die restliche Suche startet. Danach erneut einfrieren und nur diese endgültigen Texte für Prompt, Anzeige und Satzprüfung verwenden; einen integrierten Test mit Stichwort hinter der Budgetgrenze ergänzen.

### F23 — Bei einer Seite verschwindet eine erfolgreiche Nachsuche
Schwere: hoch  
Stelle: `app/src/main/llm/petrolDeepSearch.ts:148–157`, `app/src/main/llm/petrolDeepSearch.ts:294–296`, `app/src/main/index.ts:6996–7002`  
Status: [OFFEN]  
Beschreibung: Bei `maxPages = 1` und einer lesbaren ersten Seite wird wegen fehlender Wörter trotzdem ein Nachsuch-Abruf gestartet (`slots = 1`). `ordered()` behält aber **mindestens eine** alte Seite (`Math.max(1, 1 − retryOk.length)`), stellt die neue dahinter und `freezeN(1)` friert wieder nur die alte ein. Die Nachsuche verbraucht Anbieter- und Abrufbudget, kann die Antwort aber nie verbessern. Die Tests prüfen Verdrängung nur mit `maxPages: 2` (`petrolDeepSearch.test.ts:72–86`).  
Vorschlag: Bei erfolgreicher Nachsuche `maxPages − retryOk.length` alte Seiten behalten, auch wenn das null ist. Test mit `maxPages: 1`, einer unpassenden ersten und einer passenden neuen Seite; die neue muss Quelle `[1]` werden.

### F24 — Suchplan und Trefferwahl können die Belegbasis semantisch verschieben
Schwere: hoch  
Stelle: `app/src/shared/webChatDeep.ts:78–94`, `app/src/main/llm/petrolDeepSearch.ts:71–105`, `app/src/main/llm/petrolDeepSearch.ts:267–274`  
Status: [OFFEN]  
Beschreibung: Der Main prüft JSON, Länge und Nummern, aber keinen Bezug der Modellanfragen zu Zahlen/Jahr/Ort der Frage. Eine formal gültige Anfrage zu „Rundfunkbeitrag 2026“ nach einer Frage zu 2027 wird ohne Rückfrage gesucht. Bei der Wahl können Titel/Anrisse trotz `UNTRUSTED`-Delimiter das Modell zu einer gültigen Nummer einer präparierten Seite lenken; die URL-Allowlist verhindert eine fremde URL, nicht diese Auswahl. Das Testbeispiel `petrolDeepSearch.test.ts:148–152` belegt nur, dass Delimiter vorhanden sind und keine URL im Prompt steht. Die spätere Zitatprüfung vergleicht wiederum nur mit den so gewählten Seiten.  
Vorschlag: Mindestens die harten Bedingungen der Nutzerfrage (insbesondere Jahreszahlen, Mengen, Ort und Negation) in Plan und Auswahl als Verlustwarnung prüfen; bei Verlust die ursprüngliche Frage zusätzlich suchen oder die Einschränkung sichtbar als nicht recherchiert markieren. Für die Trefferwahl adversariale Titel/Anrisse testen und die gewählten sowie übergangenen Kandidaten in der Provenienz halten. Keine Qualitätsbehauptung aus einer gültigen JSON-Nummer ableiten.

### F25 — Gerade bei Fehler und Stopp verschwinden gesendete Suchanfragen
Schwere: hoch  
Stelle: `app/src/main/index.ts:6971–6977`, `app/src/renderer/components/Agent/PetrolChat.tsx:573–620`, `app/src/renderer/stores/petrolChatStore.ts:178–199`, `app/src/renderer/stores/petrolChatStore.ts:322–340`  
Status: [OFFEN]  
Beschreibung: Bei einem Suchfehler ohne lesbare Seite gibt der Main vor Aufbau von `deepInfo` ein `error` zurück. Bei einem Fehler der Antwortphase kann `deepInfo` im Ergebnis stehen, aber der Renderer zeigt im Fehlerzweig nur `WebSkippedLine` und `WebProvenanceLine`, **nicht** `WebDeepLine`. Bei Nutzer-Stopp verwirft der Store die Fortschritts-Anfragen und erhält nur die Quellen als `webPartial`. Damit ist die R1-Zusage „jede tatsächlich gesendete Suchanfrage hinterher sichtbar“ genau in den Fällen unerfüllt, in denen der Nutzer wissen muss, was das Modell an den Anbieter geschickt hat. Tests decken diesen Renderer-Pfad nicht.  
Vorschlag: Einen Main-seitigen Deep-Trace auch in `error`/`stopped`/`nothing-readable` zurückgeben und im Renderer in jedem Endzustand anzeigen. Beim Stopp die bis dahin gesendeten Anfragen aus dem Fortschritt behalten, falls der IPC-Abbruch kein Ergebnis mehr liefert. Versuch und bestätigten Anbietererfolg getrennt benennen.

### F26 — „Treffer gewählt“ zeigt nur Zähler statt die Auswahl
Schwere: mittel  
Stelle: `app/src/shared/webChat.ts:220–238`, `app/src/main/llm/petrolDeepSearch.ts:220–244`, `app/src/renderer/components/Agent/PetrolWebAnswer.tsx:248–259`  
Status: [OFFEN]  
Beschreibung: `WebDeepInfo` speichert `candidates` und `picked` nur als Zahlen. `WebDeepLine` zeigt „x von y Treffern gewählt“ sowie verwendete Quellen und einige ungenutzte **abgerufene** Hosts, aber keine Liste der gewählten und verworfenen Suchtreffer. R1 verspricht ausdrücklich „welche Treffer gewählt bzw. nicht gewählt wurden“. Der Nutzer kann damit eine modellgesteuerte Auslassung eines amtlichen oder aktuellen Treffers nicht nachvollziehen; die Zahl klingt wie eine Auswahlprüfung.  
Vorschlag: Pro Kandidat mindestens Host/Titel, Such-Herkunft und Status `gewählt`/`abgerufen`/`verworfen`/`nicht versucht` speichern und begrenzt aufklappbar anzeigen. Diese Angaben aus Main-Daten erzeugen, nicht aus Renderer-Zählern ableiten.

### F27 — Zahlen mit verschiedener Einheit gelten nun als auf der Seite vorhanden
Schwere: hoch  
Stelle: `app/src/shared/webChat.ts:784–825`, `app/src/main/index.ts:7125–7127`  
Status: [OFFEN]  
Beschreibung: `numberTokens` löst aus alphanumerischen Wörtern nur die Ziffern heraus. `sentenceExtras` akzeptiert danach einen Zahlentreffer, sobald **irgendein** zitierter Auszug dieselben Ziffern enthält. Eine Antwort „800Wp-Set“ gegen eine Seite über „800W-Wechselrichter“ verliert so die Warnung „Zahl nicht in der Seite“, obwohl die Einheiten für Balkonkraftwerke gerade entscheidend sind. Zuvor blieb `800wp-set` gegenüber `800w-wechselrichter` als ganzes Inhaltswort verschieden. Der neue GUI-Test (`webChat.test.ts:539–545`) prüft nur die gewünschte Entschärfung bei „8-Modul-Preise“, nicht kollidierende Einheiten. Das betrifft schnellen **und** gründlichen Webchat; der Vault-Chat ruft `sentenceExtras` nicht auf.  
Vorschlag: Zahlen in Wortverbindungen nur für die **Frage-Zahl-Warnung** isolieren, nicht als Seitenbeleg freisprechen. Für Maße und Einheiten (W/Wp, kW/kWh, brutto/netto) den vollständigen Token oder eine typisierte Zahl-Einheit-Paarung vergleichen. Einen Test mit gleichem Zahlenwert und anderer Einheit ergänzen.

### F28 — Eine unbelegte Gegenbehauptung kann als neutrale Lücke erscheinen
Schwere: hoch  
Stelle: `app/src/shared/webChat.ts:766–776`, `app/src/shared/webChat.ts:808–814`, `app/src/renderer/utils/webAnswerMarkdown.ts:23–40`  
Status: [OFFEN]  
Beschreibung: `isGapStatement` lässt jetzt Zahlen aus der Frage in einem unzitierten Satz zu und erkennt auch „Quelle“ im Singular. Beispielsweise erfüllt „Die Quelle bestätigt 2027 nicht, 20 Euro sind falsch.“ bei der Frage „Kostet es 2027 20 Euro?“ alle Bedingungen: kurz, `Quelle`, `nicht`, nur Fragezahlen. Der zweite Satzteil behauptet jedoch unbelegt, dass 20 Euro falsch sind. `sentenceFlags` ersetzt dann `uncited` durch die neutrale Marke `gap`; die Prüfzusammenfassung zieht ihn sogar von den unzitierten Sätzen ab (`PetrolWebAnswer.tsx:110–112`). Das ist eine Regression im schnellen wie im gründlichen Webchat. Die neuen Tests (`webChat.test.ts:532–536`) enthalten keinen solchen zusammengesetzten Satz.  
Vorschlag: Lücken-Ausnahme nur für enge Satzformen ohne zusätzliche Wertung/Gegenbehauptung zulassen oder gemischte Sätze weiterhin als `uncited` markieren. Fragezahlen allein dürfen eine zusätzliche Behauptung nicht neutralisieren. Gegenbeispiel samt Varianten mit „aber“, „sondern“ und Doppelpunkt testen.

### F29 — Der Planungs-Fallback wird als wörtliche Suche bezeichnet, auch wenn er Wörter streicht
Schwere: mittel  
Stelle: `app/src/main/llm/petrolDeepSearch.ts:255–264`, `app/src/renderer/utils/i18n/petrolChat.ts:137–140`, `app/src/renderer/components/Agent/PetrolWebAnswer.tsx:248–257`  
Status: [OFFEN]  
Beschreibung: Ist die getippte Frage über 250 Zeichen lang, verwendet der Fallback `searchWordsFromQuestion(question)`. Das entfernt Wörter und kann Bedingungen verlieren; trotzdem lautet die sichtbare Einschränkung „Planung fehlgeschlagen, mit deiner Frage gesucht“. Ist auch der Stichworttext zu lang, findet gar keine Suche statt und dieselbe Meldung bleibt. Die tatsächlich versuchte Anfrage erscheint zwar bei Erfolg im Trace, die zusammenfassende Aussage und der in Rev. 1 zugesagte wörtliche Fallback sind falsch. Der Fallback-Test (`petrolDeepSearch.test.ts:58–63`) nutzt nur eine kurze Frage.  
Vorschlag: Fallback auf lange Frage nicht still umformulieren; entweder vorab sichtbare Kürzung durch den Nutzer verlangen oder „automatisch gebildete Stichwörter“ mit tatsächlichem Text und ausgelassenen Bedingungen benennen. Ohne gültige Anfrage ausdrücklich „nicht gesucht“ ausgeben. Grenztests bei 251 und bei weiterhin zu langen Stichwörtern ergänzen.

### F30 — Der Opt-in-Schalter verschwindet bei langen Fragen
Schwere: mittel  
Stelle: `app/src/renderer/components/Agent/PetrolChat.tsx:146–150`, `app/src/renderer/components/Agent/PetrolChat.tsx:717–755`  
Status: [OFFEN]  
Beschreibung: Der Knopf „gründlich suchen“ steht nur in der kompakten Webzeile (`!webQueryOpen`). Sobald die Frage länger als die Suchanbietergrenze ist oder der Nutzer das Suchfeld geöffnet hat, rendert nur das Suchfeld, ohne diesen Knopf. Gerade bei langen Fragen, für die die Modellplanung sinnvoll sein soll, kann ein Laie den gründlichen Modus nicht wählen; im Feld bleibt die schnelle Suche wegen zu langer `webQuery` gesperrt. Die reinen Deep-Tests prüfen diesen UI-Zustand nicht.  
Vorschlag: Den Umschalter in beiden Webzeilen zeigen; bei Wechsel zu „gründlich“ das Suchfeld schließen und vor dem Senden den neuen Datenweg-Text anzeigen. Einen Komponenten-/GUI-Test mit Frage über 250 Zeichen und geöffnetem Suchfeld ergänzen.

**Urteil:** Such- und Abrufstarts sind im Deep-Orchestrator tatsächlich auf 3/5 begrenzt; die Recherchefrist bricht das gemeinsame Recherche-Signal ab und `runFetchQueue` stuft erst danach eintreffende Abrufe als Timeout ein (`petrolDeepSearch.ts:122–131,230–244`; `webChat.ts:543–550`). Die Antwort verwendet weiterhin `req.controller.signal`, sodass Nutzer-Stopp auch dort greift (`index.ts:7107–7120`). Planung bekommt zunächst nur Frage und Datum; die Nachplanung zusätzlich eigene Suchwörter und daraus berechnete Fragebegriffe (`petrolDeepSearch.ts:71–87,282–285`). Der Vault-Chat nutzt `sentenceExtras` nicht; dort ist aus den Änderungen an `webChat.ts` keine direkte Regression ersichtlich (`index.ts:8697`; `index.ts:7127`). **Abnahme: offen.** F22/F23 können die einzige Nachsuche wirkungslos machen; F25–F29 lassen Auswahl und Prüfstatus glaubwürdiger erscheinen, als der Code trägt. Die grünen Tests prüfen diese Übergänge nicht.

### Code-Prüfung Runde 2

**Nachprüfung F22–F30:** F22: Die Nachsuche prüft jetzt dieselbe `freezeBest`-Funktion wie die endgültige Antwort (`petrolDeepSearch.ts:308–311`, `index.ts:6973–6984,7026`); der probeweise Aufruf bereitet höchstens fünf Abrufe auf, ein eigener Korrektheitsfehler ist nicht erkennbar. F23: Die Ersatzseite darf bei `maxPages = 1` die alte vollständig verdrängen (`petrolDeepSearch.ts:157–167`). F24: weiterhin nur teilweise, siehe F31/F32. F25: siehe F35. F26: siehe F36. F27/F28: siehe F33/F34. F29: Herkunft und „nicht gesucht“ werden jetzt zutreffend unterschieden (`petrolDeepSearch.ts:283–294`, `PetrolWebAnswer.tsx:241–247,275–279`); zur Verwerfung aller Plananfragen siehe F37. F30: Der Umschalter steht auch im geöffneten Suchfeld (`PetrolChat.tsx:748–770`). Die gezielten Tests `webChat.test.ts`, `webChatDeep.test.ts` und `petrolDeepSearch.test.ts` laufen mit 84/84 grün; die folgenden Gegenfälle sind darin nicht enthalten.

### F31 — Späte Jahreszahl wird beim Schutz der Suchanfragen übersehen
Schwere: hoch  
Stelle: `app/src/shared/webChatDeep.ts:187–204`, `app/src/shared/webChatDeep.ts:253–261`, `app/src/main/llm/petrolDeepSearch.ts:274–282`  
Status: [OFFEN]  
Beschreibung: `questionTerms` beendet die Sammlung nach zehn Begriffen. `numbersMissingInQueries` betrachtet ausschließlich diese Liste. Steht ein entscheidendes Jahr oder eine Menge erst nach zehn anderen Inhaltswörtern, bleibt eine Modellanfrage mit anderem Jahr unbeanstandet; die zusätzliche Suche mit Frage-Stichwörtern entfällt. Beispiel: zehn Sachbegriffe vor „2027“, Modell plant nur „… 2026“. Auch der spätere Wörterabgleich meldet diese ausgelassene Zahl dann nicht.  
Vorschlag: Zahlen/Jahre aus der **gesamten** Frage unabhängig von der Zehn-Begriffe-Grenze prüfen und für die Anzeige sowie den Such-Guard erhalten; Test mit einer Zahl hinter dem zehnten Begriff.

### F32 — Der vorsorgliche Suchlauf verbraucht die einzige adaptive Nachsuche
Schwere: mittel  
Stelle: `app/src/main/llm/petrolDeepSearch.ts:274–282`, `app/src/main/llm/petrolDeepSearch.ts:297–335`, `app/src/shared/webChatDeep.ts:14–20`  
Status: [OFFEN]  
Beschreibung: Liefert das Modell zwei formal gültige Anfragen ohne eine Fragezahl, hängt der Main sofort die Stichwortsuche als **dritte** Anfrage an. Nach dem Seitenabruf kann `checkQuestionTerms` eine reale Lücke erkennen, `canMore` ist wegen drei bereits gestarteter Suchen jedoch falsch. Selbst wenn die Guard-Suche null oder unpassende Treffer lieferte und noch Abrufbudget frei ist, wird keine gezielte Nachsuche mehr geplant. Der Test zu F24 belegt nur den Fall mit **einer** geplanten Anfrage (`petrolDeepSearch.test.ts:180–191`).  
Vorschlag: Das dritte Suchkontingent bis nach Prüfung der ersten Quellen zurückhalten oder eine der beiden geplanten Anfragen durch die Guard-Anfrage ersetzen; Fall „zwei Plananfragen + erfolglose Guard-Anfrage + fehlender Begriff“ testen.

### F33 — Prozent und getrennte Einheiten passieren die Zahlenprüfung
Schwere: hoch  
Stelle: `app/src/shared/rag/citations.ts:101–109`, `app/src/shared/webChat.ts:820–829`, `app/src/shared/webChat.ts:855–870`  
Status: [OFFEN]  
Beschreibung: F27 schützt angehängte Buchstabeneinheiten wie `800Wp` gegen `800W`. `contentWords` entfernt aber `%`; bei Leerzeichen trennt es auch Buchstabeneinheiten vom Zahlenwort. Eine Antwort „20 %“ gegen eine zitierte Seite mit „20 Euro“ hat auf beiden Seiten denselben `numberParts`-Wert `20` und erhält keine Zahlenwarnung. Dasselbe gilt für „800 Wp“ gegen „800 W“. Der F27-Test prüft nur angehängte Einheiten (`webChat.test.ts:548–560`). Gerade diese abweichenden Maße können eine zitierte, falsche Aussage glaubwürdig machen.  
Vorschlag: Zahl und unmittelbar folgende Einheit bzw. Prozentzeichen aus dem Originaltext als Paar prüfen; unbekannte oder getrennte Einheiten konservativ markieren. Tests mit `20 %`/`20 Euro` und `800 Wp`/`800 W`.

### F34 — Doppelpunkt und erneutes „Quelle“ neutralisieren eine Gegenbehauptung
Schwere: hoch  
Stelle: `app/src/shared/webChat.ts:794–809`, `app/src/renderer/utils/webAnswerMarkdown.ts:23–40`  
Status: [OFFEN]  
Beschreibung: F28 sperrt bestimmte Gegenwörter und prüft Satzteile nach Komma/Semikolon; der Doppelpunkt wird ausdrücklich nicht getrennt. Bei der Frage „Steigt der Beitrag 2027 auf 20 Euro?“ gilt „Die Quelle nennt dazu nichts: 2027 steigt der Beitrag auf 20 Euro.“ dennoch als neutrale `gap`: Quelle und Negation stehen vor dem Doppelpunkt, beide Zahlen stammen aus der Frage, ein `GAP_COUNTER`-Wort fehlt. Auch nach Komma reicht im zweiten Teil das Wort „Quelle“, etwa „Die Quelle nennt dazu nichts, die Quelle bestätigt 20 Euro.“ So verschwindet die Warnung für eine unzitierte Sachbehauptung.  
Vorschlag: Die Lücken-Ausnahme auf reine Aussagen über fehlende Information begrenzen; bei Doppelpunkt und weiteren Teilsätzen mit eigenem Sachprädikat `uncited` behalten. Beide Beispiele als Gegenproben testen.

### F35 — Stopp kann eine bereits gestartete Suchanfrage aus der Spur verlieren
Schwere: mittel  
Stelle: `app/src/main/llm/petrolDeepSearch.ts:194–199`, `app/src/main/index.ts:6989–6991`, `app/src/renderer/stores/petrolChatStore.ts:187–203`, `app/src/renderer/stores/petrolChatStore.ts:286–299`, `app/src/renderer/stores/petrolChatStore.ts:324–350`  
Status: [OFFEN]  
Beschreibung: Der Main startet die Suche unmittelbar nach dem asynchron gesendeten Fortschrittsereignis. Stoppt der Nutzer, nachdem die Anfrage an den Anbieter ging, aber bevor das Fortschrittsereignis im Renderer verarbeitet wurde, speichert `stop()` keine `webSentQueries`. Danach setzt `abortCurrent()` die Kennung auf `null`; verspäteter Fortschritt und das Main-Ergebnis mit vollständiger Spur werden verworfen. Damit ist die Zusage „jede tatsächlich gesendete Suchanfrage hinterher sichtbar“ trotz F25 nicht verlässlich.  
Vorschlag: Beim Stopp die vom Main bestätigte Spur an die gestoppte Frage nachtragen oder eine geordnete Abschlussnachricht mit gestarteten Anfragen verarbeiten; einen Test für „Suchstart vor Stopp, Fortschritt nach Stopp“ ergänzen.

### F36 — Zwei Weiterleitungen auf dieselbe Seite gelten beide als verwendet
Schwere: mittel  
Stelle: `app/src/shared/webChat.ts:725–739`, `app/src/main/index.ts:7031–7045`, `app/src/renderer/components/Agent/PetrolWebAnswer.tsx:250–286`  
Status: [OFFEN]  
Beschreibung: Die eingefrorene Quelle trägt die **Ziel-URL** nach Weiterleitung. `unusedUrls` vergleicht jede erfolgreiche Ziel-URL mit der eingefrorenen Liste; leiten zwei gewählte Treffer auf dieselbe Seite, gilt auch ein wegen `maxPages` nicht eingefrorener Treffer als benutzt. In der aufklappbaren Liste bleibt er `read` („gelesen und verwendet“), obwohl nur der andere Abruf als Quelle vorliegt. Das verdeckt, welche Wahl tatsächlich zur Belegbasis wurde.  
Vorschlag: Verwendete Abrufe über stabile Kandidaten-/Abrufkennung statt nur über `finalUrl` zuordnen und gleiche Zielseiten vor dem Einfrieren deduplizieren; Weiterleitungsfall mit `maxPages = 1` testen.

### F37 — Sind alle Modellanfragen ungültig, fehlen die versprochenen Ablehnungsgründe
Schwere: niedrig  
Stelle: `app/src/shared/webChatDeep.ts:78–95`, `app/src/main/llm/petrolDeepSearch.ts:269–285`, `app/src/renderer/components/Agent/PetrolWebAnswer.tsx:295–296`  
Status: [OFFEN]  
Beschreibung: `parsePlanReply` sammelt zwar `rejected`, liefert bei null gültigen Anfragen aber insgesamt `null`. Der Main setzt dann nur `plan-failed` und zeigt den Fallback; die verworfenen Texte und Gründe gelangen nie in `trace.rejected`. Eine ausschließlich zu lange oder leere Modellanfrage wird entgegen der zugesagten Spur nicht mit Ablehnungsgrund angezeigt.  
Vorschlag: Ein syntaktisch lesbares JSON auch mit leerer `queries`-Liste samt `rejected` zurückgeben; der Main kann weiterhin den Fallback wählen und die Gründe anzeigen. Test mit ausschließlich zu langer Modellanfrage.

### Code-Prüfung Runde 3

**Nachprüfung F31–F37:** F31 trägt: Zahlen nach dem zehnten Wort bleiben in `questionTerms` (`webChatDeep.ts:194–212`). F32 trägt für den getesteten Fall mit fehlender Zahl; die verbleibenden Grenzen stehen in F42/F43. F33 behebt die Beispiele mit `%` und getrenntem `Wp`, aber Bereiche, Uhrzeiten und Schreibvarianten bleiben problematisch (F39–F41). F34 sperrt die beiden gemeldeten Gegenbeispiele; eine weitere Aussageform bleibt neutral (F44). F35 trägt beim normalen Main-Abschluss: die Anfrage wird nach Stopp über `questionAt` ergänzt (`petrolChatStore.ts:248–253,287–297`). F36 ordnet verwendete Abrufe nun über Kennungen zu, führt aber eine Regression beim Sammeln verschiedener Seiten ein (F38). F37 trägt für lesbares JSON mit ausschließlich ungültigen Anfragen (`webChatDeep.ts:78–97`, `petrolDeepSearch.ts:271–282`). Die drei gezielten Testsuiten laufen mit 91/91 grün; die folgenden Gegenfälle prüfen sie nicht.

### F38 — Deduplizierung nach dem Abruf lässt brauchbare Treffer liegen
Schwere: hoch  
Stelle: `app/src/shared/webChat.ts:569–605`, `app/src/shared/webChat.ts:703–750`, `app/src/main/llm/petrolWebChat.ts:101–113`  
Status: [OFFEN]  
Beschreibung: Die schnelle Suche beendet ihre Abruf-Warteschlange nach drei `ok`-Seiten; Weiterleitungen auf dieselbe Zielseite zählen dabei mehrfach als brauchbar. Erst danach fasst `freezeWebSources` sie zusammen. Führen die ersten drei Treffer auf dieselbe Zielseite, bleibt genau **eine** Quelle übrig, obwohl Treffer 4 und 5 innerhalb des bestehenden Abrufbudgets andere Quellen liefern könnten. Vor F36 gingen drei Auszüge ins Modell; nach der Änderung wird die Belegbasis ohne Ersatz kleiner. Der F36-Test ruft nur `freezeWebSources` direkt auf (`webChat.test.ts:159–169`) und belegt keinen Nachrücker im echten Sammelpfad. Dasselbe Problem kann die Seitenzahl der gründlichen Suche verringern.  
Vorschlag: Ein Duplikat nach finaler URL im Abruf-Zähler nicht als weitere brauchbare Quelle behandeln und innerhalb des vorhandenen Startbudgets den nächsten Kandidaten versuchen; Sammeltest mit drei Weiterleitungen auf eine Seite plus eigenständigem vierten Treffer.

### F39 — Ein Leistungsbereich verliert die Einheit seiner ersten Zahl
Schwere: hoch  
Stelle: `app/src/shared/webChat.ts:855–869`, `app/src/shared/webChat.ts:890–894`, `app/src/shared/webChat.ts:910–925`  
Status: [OFFEN]  
Beschreibung: `numberUnits('600–800 W')` liefert `600` und `800w`, weil die Einheit nur unmittelbar auf die letzte Zahl folgt. Eine zitierte Seite mit „600 Wp und 800 W“ liefert `600wp` und `800w`; `pageNumbers` fügt außerdem die nackte `600` hinzu. Damit erhält die Antwort „600–800 W [1]“ **keine Zahlenwarnung**, obwohl die Seite für 600 nur Wp statt W nennt. Das betrifft auch die schnelle Suche, die dieselbe `sentenceExtras`-Prüfung verwendet (`index.ts:7150–7152`).  
Vorschlag: Bei Zahlenbereichen die nachgestellte Einheit auf beide Endpunkte beziehen oder den gesamten Bereich als Einheit prüfen; Gegenprobe `600–800 W` gegen `600 Wp und 800 W`.

### F40 — Uhrzeit und Schrägstrichdatum werden als lose Ziffern belegt
Schwere: hoch  
Stelle: `app/src/shared/webChat.ts:855–869`, `app/src/shared/webChat.ts:890–925`  
Status: [OFFEN]  
Beschreibung: Der neue Matcher zerlegt `12:30 Uhr` in `12` und `30`. Steht auf der Seite „Öffnet 12:45 Uhr; Einlass 30 Minuten vorher“, sind beide Ziffern irgendwo vorhanden und die falsche Antwort „Öffnet 12:30 Uhr [1]“ bekommt keine Zahlenwarnung. Beim Schrägstrichdatum bleibt derselbe strukturelle Fehler: `03/04/2026` und `04/03/2026` haben dieselbe lose Zahlenmenge, obwohl sie bei gleicher Datums-Konvention verschiedene Tage bezeichnen. Die Zeitangabe ist eine neue Regression gegenüber dem vorher ganz verglichenen `12:30`-Token.  
Vorschlag: Uhrzeiten und Datumsangaben vor Einzelzahlen erkennen und als zusammenhängende Werte vergleichen; bei unklaren Formaten konservativ warnen. Tests für falsche Uhrzeit mit anderweitig vorkommender Minute und vertauschtes Schrägstrichdatum.

### F41 — Gängige Schreibweisen derselben Einheit erzeugen Fehlalarme
Schwere: mittel  
Stelle: `app/src/shared/webChat.ts:842–855`, `app/src/shared/webChat.ts:910–925`  
Status: [OFFEN]  
Beschreibung: Die neue Einheitenliste versteht `m` und `g`, aber nicht „Meter“ und „Gramm“. `numberUnits('3 m')` wird `3m`, `numberUnits('3 Meter')` nur `3`; eine korrekt zitierte Antwort erhält so eine Zahlenwarnung. Auch `5,5 %` und `5.5 %` bleiben als dieselbe Dezimalzahl in deutscher/englischer Schreibweise verschieden. Diese Prüfung läuft ebenfalls in der **schnellen** Suche und kann deren zuvor unauffällige Antworten neu als fragwürdig markieren. Die Tests decken nur Euro/€, Jahre/Jahren und identische Kurzformen (`webChat.test.ts:581–594`).  
Vorschlag: Häufige ausgeschriebene Maße ergänzen, Dezimalpunkt/-komma nur bei eindeutigem Dezimalformat angleichen und unbekannte Einheiten nicht als sicheren Unterschied ausgeben; Gegenproben in schnellem und gründlichem Modus.

### F42 — Eine Jahreszahl in irgendeiner Teilquelle ersetzt keine Suche zum richtigen Teilthema
Schwere: hoch  
Stelle: `app/src/shared/webChatDeep.ts:227–268`, `app/src/main/llm/petrolDeepSearch.ts:277–280`, `app/src/main/llm/petrolDeepSearch.ts:304–320`  
Status: [OFFEN]  
Beschreibung: `numbersMissingInQueries` prüft alle geplanten Anfragen als eine Menge; `checkQuestionTerms` prüft alle Auszüge ebenfalls als eine Menge. Bei einer Frage nach **Leistung und Förderung 2027** kann das Modell „Leistung 2026“ und „Förderung 2027“ suchen. Die Zahl 2027 gilt dann im Plan und in der Förderungsseite als vorhanden; die deterministische Guard-Nachsuche für Leistung 2027 startet nicht. Der Nutzer sieht zwar beide Suchtexte, aber die Antwort kann eine fachlich passende 2026-Seite als Beleg für den falschen Jahresstand nutzen.  
Vorschlag: Harte Bedingungen je Suchaspekt beziehungsweise je ausgewählter Seite prüfen; mindestens die Kombination „Teilthema + Jahr“ erhalten und bei Verlust sichtbar als nicht recherchiert markieren. Test mit zwei Aspekten und nur einem korrekt datierten Treffer.

### F43 — Bei langen Fragen verliert die deterministische Nachsuche ihren Zahlenschutz
Schwere: mittel  
Stelle: `app/src/main/llm/petrolDeepSearch.ts:272–280`, `app/src/main/llm/petrolDeepSearch.ts:317–329`, `app/src/shared/webResearch.ts:349–360`  
Status: [OFFEN]  
Beschreibung: Ist die aus der Frage gebildete Stichwortfassung länger als die Anbietergrenze, überspringt der Main trotz `guardNeeded` den deterministischen Suchlauf und fragt wieder das Modell. Dessen neue Anfrage wird nur auf JSON/Form und Länge geprüft; dieselbe Jahreszahl kann erneut fehlen. Gerade für lange Fragen, für die „gründlich“ angeboten wird, bleibt F32 damit nur bedingt erfüllt. Der UI-Hinweis `numbersNotInQueries` nennt den Verlust im ersten Plan, aber keinen ausgefallenen Guard.  
Vorschlag: Für diesen Fall eine deterministische, begrenzte Anfrage bilden, die die fehlende Zahl und die nötigen Sachbegriffe behält, oder die nicht durchgeführte Schutzsuche ausdrücklich anzeigen. Grenztest mit Stichwortfassung über 400 Zeichen und erneut falsch geplantem Jahr.

### F44 — Ein anderes Verb hinter Doppelpunkt bleibt neutrale Lücke
Schwere: mittel  
Stelle: `app/src/shared/webChat.ts:818–837`, `app/src/renderer/utils/webAnswerMarkdown.ts:23–40`  
Status: [OFFEN]  
Beschreibung: F34 erkennt hinter dem Doppelpunkt nur eine Zahl am Anfang oder ein Verb aus `GAP_CLAIM_VERB`. Bei der Frage „Steigt der Beitrag 2027 auf 20 Euro?“ gilt „Die Quelle nennt dazu nichts: der Beitrag erhöht sich 2027 auf 20 Euro.“ weiterhin als neutrale `gap`: „erhöht“ steht nicht in der Verbliste, beide Zahlen stammen aus der Frage, und der Nachsatz wird nicht weiter zerlegt. Der Nachsatz ist aber eine unzitierte Sachbehauptung; die neutrale Marke entfernt ihre Warnfarbe.  
Vorschlag: Nach dem Doppelpunkt nur enge Benennungen des fehlenden Gegenstands zulassen, statt eine Liste behauptender Verben als Ausschluss zu verwenden; die Gegenprobe als unzitierten Satz testen.

## Claude-Antwort

### Runde 1 (25.10.2026)
Gegengeprüft: alle acht tragen (F05 nachgesehen: `freezeWebSources` behält nur 3 nach
Trefferrang, `shared/webChat.ts:653,668`; F04 ist ein Widerspruch in meinem Entwurf). Nutzer hat
die Überarbeitung freigegeben. Antworten stehen als Rev. 2 oben im Entwurf:

- **F01 [ADRESSIERT im Entwurf]** R5 (Abdeckungsprüfung) + R7 (Messkorpus).
- **F02 [ADRESSIERT im Entwurf]** R2 (Bezugsprüfung, kein Verlauf in der Planung).
- **F03 [ADRESSIERT im Entwurf]** R1 (Opt-in je Frage, wörtliche Einwilligung, harte Planungsdaten).
- **F04 [ADRESSIERT im Entwurf]** R3 (ein Budget 2+1 Suchen, 5 Abrufe, Start zählt).
- **F05 [ADRESSIERT im Entwurf]** R4 (reihum zusammenführen, 4 gewählt = 4 eingefroren, Wahlreihenfolge).
- **F06 [ADRESSIERT im Entwurf]** R5 (Nachsuche an fehlende Prüfbegriffe, Rückfälle sichtbar).
- **F07 [ADRESSIERT im Entwurf]** R6 (Ausschnitte nach Prüfbegriffen, ehrliche Kennzeichnung).
- **F08 [ADRESSIERT im Entwurf]** R3 (eine Frist, ein Abbruch, Restfrist an jeden Aufruf).
- **Frage 8 [ABGELEHNT: nur Seitenauswahl]** Der Nutzerfall scheitert an der ersten Suche (Codex
  bestätigt das im Urteil); nur Auswahl aus acht schlechten Treffern hilft dort nicht.

### Runde 2 (25.10.2026)
Gegengeprüft (Stichproben: `fetchExtract.ts:59-66` kappt vor Rückgabe; Budget bei 4096 Tokens
rund 7.700 Zeichen). F09–F15 tragen. Statt weiterer Heuristiken mit Nutzerfreigabe Rev. 3:
- **F09 [ADRESSIERT im Entwurf]** S1 (Hinweis statt Sperre, Thema sichtbar in die Frage).
- **F10 [ADRESSIERT im Entwurf]** S2 (nur Anzeige/Anlass, Zahl-/Endungsnormalisierung, nie „abgedeckt“).
- **F11, F12 [ADRESSIERT im Entwurf]** S3 (Ausschnitte gestrichen, große Seiten bleiben abgelehnt).
- **F13 [ADRESSIERT im Entwurf]** S4 (Seitenzahl aus Platz, Mindestlänge 1500).
- **F14 [ADRESSIERT im Entwurf]** S5 (Frist und Stopp getrennt, eigene Antwortphase).
- **F15 [ADRESSIERT im Entwurf]** S6 (vorab festgelegte Kernangaben, gepaart, blind, Risikoklassen).

### Runde 3 (25.10.2026) und Umsetzung
Nachgeprüft: F16–F21 tragen; F16–F20 sind als Bauvorgaben umgesetzt, F21 als Vorgehen für die
Messung (Claude bereitet vor, der Nutzer entscheidet über den Standard). Nutzerfreigabe: bauen,
danach Code-Prüfung durch Codex.

Gebaut (uncommittet):
- `app/src/shared/webChatDeep.ts` — Grenzen `DEEP_LIMITS`, `parsePlanReply` (verwirft mit Grund,
  kürzt nie), `parsePickReply` (nur eigene Nummern), `mergeCandidatesRoundRobin` (reihum,
  Herkunft), `maxPagesForPlace`, `checkQuestionTerms` (wörtlich / ähnlich / fehlt, F17),
  `looksLikeBareFollowUp` (nur Hinweis, F09), `previousWebQuestion` + `withPreviousQuestion`
  (vorige NUTZERfrage, F16). Tests `webChatDeep.test.ts`.
- `app/src/main/llm/petrolDeepSearch.ts` — `runDeepResearch`: Planen (nur Frage + Datum), Suchen,
  Wählen, Lesen, höchstens eine Nachsuche; ein Zähler für Suchen (3) und begonnene Abrufe (5),
  Ränge ≤ Restbudget (F18); Recherchefrist getrennt vom Nutzer-Stopp, Rückfall nur vor Fristablauf
  (F20); Seiten der Nachsuche verdrängen die letzten der ersten Runde. Tests mit gefälschtem Modell,
  Suchdienst und Abruf: `petrolDeepSearch.test.ts`.
- `app/src/main/index.ts` Handler `petrol-chat-web`: Zweig `deep` (Obergrenze der Seiten vor dem
  Abruf, echtes Einfrieren mit `sourcesMin = n × 1500` und Neu-Einfrieren bei zu kurzem Auszug,
  F19), `deepTermsBlock` im Systemtext (Platz reserviert), Ergebnis `deep` (`WebDeepInfo`).
  `streamPetrolWebModel` mit `noThink` für Planen/Wählen.
- Renderer: Schalter „gründlich suchen“ in der Webzeile, wörtlicher Einwilligungstext, Hinweis
  „Vorige Frage als Thema ergänzen“ (setzt den Entwurf), Fortschritt Plan/Suche „…“/Wahl/Abruf,
  `WebDeepLine` unter der Antwort (gesendete Anfragen, Verworfenes, Einschränkungen, nicht
  Verwendetes, Wörterabgleich). Nach dem Senden zurück auf „schnell“.
- Dazu die vier GUI-Befunde: Gesprächssatz-Warnung prüft nur noch den Suchtext; Lücken-Satz mit
  Zahl aus der Frage und Einzahl („Auszug“) gilt als Lücke; Zahlen in Wortverbindungen
  („8-Modul-Preise“) werden nur als Zahl verglichen; deutsche Tausender gleichgesetzt.

Belege: typecheck grün, Gesamtlauf 3045 grün (1 bekannter Zeit-Test der Shell-Umgebungsprobe),
Build grün. Nicht geprüft: GUI und echter Lauf (Bildschirm gesperrt, Dev-App wartet auf
Schlüsselbund).

### Code-Prüfung F22–F30 (25.10.2026) — alle neun vom Nutzer freigegeben

- **F22 [ADRESSIERT]** `DeepDeps.excerpts` (`petrolDeepSearch.ts`): die Nachsuche-Entscheidung
  läuft über die Auszüge, die der Main probeweise einfriert (`freezeBest` in `index.ts`, dieselbe
  Funktion wie beim echten Einfrieren). Test „F22: … Auszüge, die das Modell sähe“.
- **F23 [ADRESSIERT]** `ordered()`: `Math.max(0, …)` statt `Math.max(1, …)` — Seiten der Nachsuche
  ersetzen notfalls alle alten. Test „F23: bei Platz für eine Seite …“.
- **F24 [ADRESSIERT, teilweise]** `numbersMissingInQueries` (`webChatDeep.ts`): fehlt eine Zahl
  oder ein Jahr der Frage in allen geplanten Anfragen, sucht die Stichwortfassung der Frage
  zusätzlich (Herkunft `guard`, verbraucht ggf. das Nachsuch-Budget). Anzeige „Nicht in den
  Suchanfragen des Modells: 2027“. Semantische Verschiebung ohne Zahl (Ort, Verneinung) und eine
  einseitige Trefferwahl erkennt das nicht — dafür bleibt die Trefferliste (F26) sichtbar.
- **F25 [ADRESSIERT]** `traceInfo()` in `index.ts`: Spur auch bei `stopped` und `error`;
  `WebDeepLine` jetzt im Fehlerzweig. Stopp im Renderer (der das Main-Ergebnis verwirft): die
  bis dahin gesendeten Anfragen aus dem Fortschritt landen als `webSentQueries` an der Frage.
- **F26 [ADRESSIERT]** `trace.hits` / `WebDeepInfo.hits`: jeder zur Wahl stehende Treffer mit
  Ausgang (gelesen und verwendet / gelesen, kein Platz / Abruf gescheitert / gewählt, nicht mehr
  abgerufen / nicht gewählt), Runde 2 markiert; aufklappbar unter der Zählzeile. Titel über
  `sanitizeSourceTitle`, nur als Text gerendert.
- **F27 [ADRESSIERT]** `numberParts` / `numberCore` (`webChat.ts`): Seitenbeleg über ganze
  Zahlteile mit Einheit („800wp“ ≠ „800w“), zerlegt nur an Bindestrich/Schrägstrich; der reine
  Zahlenkern zählt nur für „aus deiner Frage“. Tests F27.
- **F28 [ADRESSIERT]** `isGapStatement`: keine Gegenbehauptungs-Wörter (`GAP_COUNTER`), und jeder
  weitere Satzteil nach Komma/Semikolon/Gedankenstrich muss selbst eine Lücke oder Quelle nennen.
  Doppelpunkt trennt bewusst nicht („… nichts: der Betrag für 3.000 €“). Tests F28.
- **F29 [ADRESSIERT]** Herkunft `fallback` (getippte Frage) / `fallback-words` (daraus gebildete
  Stichwörter), Einschränkung `no-search`, wenn gar nicht gesucht wurde; Anzeige je Herkunft.
- **F30 [ADRESSIERT]** Schalter „gründlich suchen“ auch im geöffneten Suchfeld.

Belege: typecheck grün, Gesamtlauf 3054 grün (der bekannte Zeit-Test der Shell-Umgebungsprobe
fiel einmal, einzeln grün), Build grün. Nicht geprüft: GUI und echter Lauf.

### Code-Prüfung Runde 2, F31–F37 (25.10.2026) — vom Nutzer freigegeben („mache weiter“)

- **F31 [ADRESSIERT]** `questionTerms`: die Zehnergrenze gilt nur für Wörter, Zahlen/Jahre
  zählen immer — damit auch für `numbersMissingInQueries` und den Wörterabgleich. Test F31.
- **F32 [ADRESSIERT]** Keine vorsorgliche Zusatzsuche mehr. `numbersNotInQueries` wird nur
  festgehalten; fehlt eine dieser Zahlen nach Runde 1 auch in den (probeweise eingefrorenen)
  Auszügen, ist die eine Nachsuche deterministisch die Stichwortfassung der Frage (Herkunft
  `guard`, kein neuer Planungsaufruf). Höchstens 3 Suchen bleiben. Tests „F24/F32“ (Zahl im
  Auszug → keine Zusatzsuche; zwei Plananfragen + Zahl fehlt → Nachsuche mit Stichwörtern,
  3 Modellaufrufe).
- **F33 [ADRESSIERT]** `numberUnits` (`webChat.ts`) liest Zahl + direkt folgende bekannte
  Einheit aus dem Originaltext, auch mit Leerzeichen und als Zeichen (`%`, `€`, `$`); Einheiten
  auf eine Schreibweise gebracht (€ = Euro, Jahre = Jahren). Eine Zahl MIT Einheit gilt nur mit
  derselben Einheit als belegt, eine Zahl ohne Einheit mit jeder Fundstelle. Unbekanntes Wort nach
  der Zahl („8 Module“) bleibt reine Zahl. Anzeige „20 %“, „800 Wp“, „2696 €“. Tests F33.
- **F34 [ADRESSIERT]** `isGapStatement`: hinter einem Doppelpunkt kein behauptendes Verb
  (`GAP_CLAIM_VERB`) und kein Beginn mit einer Zahl; weitere Satzteile vor dem Doppelpunkt
  brauchen ein eigenes Fehlen-Wort, ein erneutes „Quelle“ reicht nicht mehr. Tests F34.
- **F35 [ADRESSIERT]** Store: nach einem Stopp wird das trotzdem eintreffende Main-Ergebnis
  nicht mehr ganz verworfen — seine `deep.queries` werden als `webSentQueries` an die Frage
  nachgetragen (über `questionAt`). Kein Unit-Test (Store/IPC), nur Typprüfung.
- **F36 [ADRESSIERT]** `freezeWebSources` legt Abrufe mit gleicher Zieladresse zusammen
  (vorher wurden sie als zwei Quellen eingefroren — betrifft auch die schnelle Suche) und
  liefert `used`/`duplicates` als Abrufkennungen; der Main ordnet Treffer darüber zu, neuer
  Ausgang „führt auf dieselbe Seite wie ein anderer Treffer“. Test F36.
- **F37 [ADRESSIERT]** `parsePlanReply` liefert bei lesbarem JSON ohne gültige Anfrage eine
  leere Liste mit Gründen; der Main zeigt die Gründe und nimmt den Rückfall. Test F37.

Belege: typecheck grün, Gesamtlauf 3061 grün (bekannter Zeit-Test der Shell-Umgebungsprobe),
Build grün. Nicht geprüft: GUI und echter Lauf.

### Code-Prüfung Runde 3, F38–F44 (25.10.2026) — vom Nutzer freigegeben („mache weiter“)

- **F38 [ADRESSIERT]** `runFetchQueue` zählt eine Weiterleitung auf eine schon gelesene Zielseite
  nicht als brauchbar (`seenFinal`, in der gründlichen Suche über beide Runden geteilt); der
  nächste Treffer rückt im vorhandenen Startbudget nach. Test F38; zwei ältere
  Warteschlangen-Tests bekamen eigene Zieladressen.
- **F39 [ADRESSIERT]** `numberUnits`: in einem Bereich („600–800 W“, „600 bis 800 W“) gilt die
  Einheit für beide Enden. Test F39.
- **F40 [ADRESSIERT]** Uhrzeiten, Schrägstrich- und ISO-Datum werden vor den Einzelzahlen als
  ganzer Wert erkannt (`WHOLE_VALUE`). Test F40.
- **F41 [ADRESSIERT]** Ausgeschriebene Einheiten (Meter, Gramm, Kilogramm, Kilometer, Liter,
  Kilowatt …) und eindeutige Dezimalzahlen (1–2 Nachkommastellen: 5.5 = 5,5). Test F41.
- **F44 [ADRESSIERT]** Jede Zahl hinter dem Doppelpunkt lässt die Warnung stehen (statt
  Verbliste allein). Bewusst strenger: „… nichts: der Betrag für 3.000 €“ ist wieder gelb; die
  Form „Zum Betrag für 3.000 € steht nichts“ bleibt Lücke. Test angepasst und F44.
- **F42 [ADRESSIERT, nur Anzeige]** Jede Anfrage trägt `withoutNumbers`; die Anzeige schreibt
  „(ohne 2027)“ hinter die Anfrage. Keine Prüfung je Teilthema — die App weiß nicht verlässlich,
  welche Zahl zu welchem Aspekt gehört.
- **F43 [ADRESSIERT, nur Anzeige]** Einschränkung `guard-skipped` („Schutzsuche mit deinen
  Stichwörtern nicht möglich (zu lang)“), dann plant wie bisher das Modell.

Belege: typecheck grün, Gesamtlauf 3067 grün, Build grün. Prüfschleife danach auf Empfehlung
beendet (abnehmender Ertrag, Randfälle der Zahlenprüfung); nächster Schritt GUI-Test.

### GUI-Test 25.10.2026 (Dev-App, CDP)

Frage „Ich will mir selbst ein Balkonkraftwerk mit 8 Modulen installieren was kosten die Module“, gründlich:
- **qwen3.5:4b lokal**, 25 s: Plan „Balkonkraftwerk 8 Module Kosten“ + „Selbst installiertes
  Balkonmodul Preis“ (Anzeige „ohne 8“), Shops gewählt, Antwort benennt die Lücke. Befund: die
  Nachsuch-Planung des kleinen Modells lieferte gelegentlich kaputtes JSON → bisher still keine
  Nachsuche. **Behoben:** Einschränkung `retry-plan-failed` + Nachsuche mit den Stichwörtern
  der Frage (Test).
- **OpenRouter gpt-6-luna**, 24 s: Nachsuche lief, alpha-solar.shop (8-Modul-Seite) gelesen,
  ehrliche Antwort. In der GUI: Antwort mit Preisen für 8 Module (800–1.600 €, 1.072 €).
  Befund: Seiten schreiben die Währung VORAN („ab €53,90“, „€1.072“) → Fehlalarm „Zahl nicht in
  der Seite“. **Behoben:** `PREFIX_CURRENCY` in `numberUnits` (Test).
- Oberfläche: Einwilligungstext nennt Modellweg und Datenweg korrekt (lokal / OpenRouter),
  Trefferliste aufklappbar und lesbar, Badge „Web · gründlich“. YouTube-Treffer in der Liste ist
  Absicht (Nutzerentscheidung 24.10.2026).

- **Nutzertest „Erstelle mir eine Zusammenfassung der politischen Ereignisse von heute“** (schnell,
  OpenRouter): Recycling-Preise aus Texas. Nachgestellt: derselbe wörtliche Satz liefert bei Tavily
  wechselnd Nachrichtenseiten (1×) oder Recycling-Seiten (2×) — Anbieter-Schwankung bei
  Befehlssätzen; die App benannte die Lücke korrekt. Gründlich plant „politische Ereignisse heute
  25. Oktober 2026“ und fand in drei Läufen Nachrichtenseiten (einmal `pick-failed`, nicht
  wiederholbar). Befund: „Erstelle“/„Zusammenfassung“ galten als fehlende Prüfbegriffe und lösten
  eine unnötige Nachsuche aus. **Behoben:** `TASK_WORDS` nur im Wörterabgleich (Füllwortliste der
  Suchwörter unverändert). Offen: die Antwort des Modells blieb trotz Schlagzeilen sehr
  zurückhaltend („bestätigen nicht, dass heute“) — Prompt-Frage, nicht angefasst.

- **Nachgemessen (schnell, Tavily):** „Erstelle mir eine Zusammenfassung der politischen Ereignisse
  von heute“ wörtlich → 3× Recycling-Seiten; „Zusammenfassung politischen Ereignisse heute“ 2× und
  „Erstelle Zusammenfassung politischen Ereignisse heute“ (= Angebot „Stichwörter verwenden“) 1×
  ZDFheute/Tagesspiegel/FAZ; „Zusammenfassung der politischen Ereignisse von heute“ → knowunity.de.
  Befund: die Gesprächssatz-Warnung erkannte Aufforderungen nicht. **Behoben:** `CHATTY_REQUEST`
  in `looksConversational` (nur Warnung, sendet weiter wörtlich), Hinweistext nennt zusätzlich
  „gründlich suchen“. Gegenproben ohne Warnung im Test.

## Status

Angelegt 25.10.2026. Rev. 1–3 geprüft (F01–F21). Gebaut nach Rev. 3 + F16–F20. Code-Prüfung F22–F44 umgesetzt (drei Runden). GUI-Test 25.10.2026 mit lokal und OpenRouter, zwei Befunde behoben. Abnahme durch den Nutzer offen.
