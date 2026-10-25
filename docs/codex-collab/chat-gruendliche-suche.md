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

## Status

Angelegt 25.10.2026. Rev. 1 (F01–F08) und Rev. 2 (F09–F15) geprüft, Rev. 3 geschrieben, Codex-Runde 3 offen. Kein Code.
