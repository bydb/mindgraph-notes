# Notiz-Agent: abgeschnittene Modellantworten (`outputCut`)

## Aufgabe

Prüfe adversarial die Behandlung abgeschnittener Modellantworten im Notiz-Agenten-Loop.
Stand: HEAD `19d90e4a` plus uncommittete Änderungen (27.10.2026).

**Anlass (real, 27.10.2026, Lauf `run-9d35daa5363b4c31`, OpenRouter `minimax/minimax-m3.1-flash`):**
Das Modell wollte eine ganze HTML-Seite in einen `write_html`-Aufruf packen und erreichte zweimal
die 8192-Token-Ausgabegrenze des Anbieters (je ~150–170 s). Das abgeschnittene JSON wurde in
`chatClient.ts` zu leeren Argumenten, das Werkzeug lief mit `{}` und meldete „Parameter fehlt“,
das Modell schrieb dieselbe lange Seite erneut. Der Client meldete `outputCut`, der Loop
ignorierte es.

**Neues Verhalten:**
- Bei `outputCut` werden die Werkzeugaufrufe dieser Antwort NIE ausgeführt; jeder bekommt eine
  `tool`-Antwort „Ausgabegrenze, nicht ausgeführt, kürzer schreiben“.
- Ohne Werkzeugaufruf: eine `user`-Nachricht mit demselben Sinn.
- Beim zweiten Abschneiden (`MAX_OUTPUT_CUTS = 2`) oder in der letzten Iteration: lauter
  Abbruch über `failWithHint`.
- Sonderfall: ist das Ergebnis schon da (Web-Lauf: `run.web.wrote`, sonst `run.results.size > 0`)
  und nur die Abschlussantwort ohne Werkzeugaufruf abgeschnitten, endet der Lauf ohne weiteren
  Aufruf mit Vermerk.

Fragen:
1. Kann ein Werkzeugaufruf trotz `outputCut` vollständig sein (Ollama vs. OpenAI-kompatibel),
   so dass das Verwerfen einen legitimen Aufruf kostet? Ist „nie ausführen“ trotzdem richtig?
2. Bleibt der Verlauf protokollgültig (jede `tool_call_id` beantwortet; Ollama-Wire)?
   Kollision mit dem Budget (`addToBudget`), dem Überlauf-Wächter, `nudgedForWrite`,
   `nudgedForQuestion`, Fortsetzung (`run.transcript`)?
3. Ist der Sonderfall „nur Schlussworte abgeschnitten“ sicher, oder kann er einen
   abgeschnittenen ZWEITEN Schreibaufruf (bei Ollama als Text statt Tool-Call) als Erfolg
   verschlucken?
4. Ist `MAX_OUTPUT_CUTS = 2` sinnvoll (ein Feedback-Versuch), auch für lokale Modelle mit
   `num_predict`? Zählt der Zähler richtig über Iterationen hinweg?
5. Fehlt etwas: Arbeitsbilanz/Fehlversuch, Lauf-Protokoll (`onStep`-Label `ausgabe`),
   andere Aufrufer von `chatWithTools` mit demselben Problem (z. B. Telegram-Agent,
   `petrolWebLoop.ts`, `folderDigest.ts`)?

## Kontext/Anker

- `app/src/main/noteAgent/loop.ts:396-425` — neue `outputCut`-Behandlung direkt nach dem Anhängen der Assistenten-Nachricht
- `app/src/main/noteAgent/loop.ts:356` (ca.) — Zähler `outputCuts`
- `app/src/main/noteAgent/loop.ts:427-470` — bestehende Zweige ohne Werkzeugaufruf (Web-Vertrag, Leerlauf, Rückfrage)
- `app/src/main/noteAgent/loop.ts:472` — Ausführung der Werkzeugaufrufe
- `app/src/main/noteAgent/outputCut.ts` — Texte, `MAX_OUTPUT_CUTS`
- `app/src/main/noteAgent/loopOutputCut.test.ts` — fünf Tests
- `app/src/main/llm/chatClient.ts:740-772` — Ollama-Tool-Parsing, `outputCut: done_reason === 'length'`
- `app/src/main/llm/chatClient.ts:840-880` — OpenAI-kompatibles Parsing (kaputtes JSON → `{}`), `outputCut: finish_reason === 'length'`
- `app/src/main/llm/chatClient.ts:778` — `openrouterMessageToWire`
- `CLAUDE.md`, Abschnitt „Notiz-Agent: write_html“, Eintrag „Infografik = ein Bild“ — neue Beschreibung

## Codex-Findings

### F01 — Abgeschnittener Text kann einen ausstehenden zweiten Write verdecken
Schwere: hoch
Stelle: app/src/main/noteAgent/loop.ts:403
Status: [OFFEN]
Der Sonderfall erklärt jeden nichtleeren, abgeschnittenen Text ohne erkannte Tool-Calls zur bloßen Schlussantwort, sobald bereits irgendein Ergebnis vorliegt (`app/src/main/noteAgent/loop.ts:403-407`). Der Client kann bei OpenAI-kompatiblen Antworten Tool-Calls ohne vollständigen Funktionsnamen aus der Liste filtern (`app/src/main/llm/chatClient.ts:839-858`); beim Ollama-Pfad gilt dasselbe (`app/src/main/llm/chatClient.ts:732-753`). Auch ein vom Modell als Text begonnener zweiter Schreibaufruf bleibt unerkannt, denn dieser Loop hat bewusst keinen Text-Tool-Fallback (`app/src/main/noteAgent/loop.ts:1-4`). Nach einem ersten Bild oder einer ersten Datei kann daher eine an der Grenze abgeschnittene Arbeit am zweiten Artefakt als erfolgreicher Abschluss erscheinen. Test 4 setzt nur ein fertiges Ergebnis und eine offensichtlich finale Textantwort ein (`app/src/main/noteAgent/loopOutputCut.test.ts:93-100`); der Gegenfall ist ungeprüft.
Vorschlag: Beim Abschneiden ohne Tool-Call nur dann vorzeitig abschließen, wenn die Antwort erkennbar reine Schlussworte sind; im Zweifel die Kürzungsrückmeldung geben oder mit sichtbarem Hinweis auf ausstehende Arbeit abbrechen.

### F02 — Fehler-Zähler bricht auch nach zwischenzeitlichem Fortschritt beim zweiten Cut ab
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:409
Status: [OFFEN]
`outputCuts` wird einmal vor der Schleife initialisiert und ausschließlich erhöht, nie nach einer vollständigen Antwort zurückgesetzt (`app/src/main/noteAgent/loop.ts:360`, `app/src/main/noteAgent/loop.ts:409-423`, `app/src/main/noteAgent/loop.ts:426-540`). Damit zählt `MAX_OUTPUT_CUTS = 2` (`app/src/main/noteAgent/outputCut.ts:16`) alle Kürzungen eines Laufs, nicht zwei aufeinanderfolgende Versuche für dasselbe Ergebnis: Ein früher abgeschnittener Lese- oder Planungsaufruf und ein viel später abgeschnittener Write führen sofort zum Fehler, obwohl dazwischen Fortschritt lag. Das ist eine mögliche falsche Abbruchentscheidung, besonders bei 20-Iterationen-Ordnerläufen (`app/src/main/noteAgent/loop.ts:44`, `app/src/main/noteAgent/loop.ts:364`). `ollamaNumPredict` wird im Notiz-Agenten nicht eigens gesetzt (`app/src/main/noteAgent/loop.ts:328-336`); der Ollama-Client setzt `num_predict` nur bei ausdrücklicher Option (`app/src/main/llm/chatClient.ts:668-675`). Ob lokale Modelle dennoch serverseitig bei langen Antworten `done_reason: length` melden, wurde **nicht live geprüft**.
Vorschlag: Zähler nach einer vollständigen Antwort zurücksetzen oder Kürzungen nach Artefakt/Phase getrennt zählen; die beabsichtigte Regel ausdrücklich benennen und testen.

### F03 — Die Kürzungsantwort empfiehlt einen möglicherweise unzulässigen Formatwechsel
Schwere: mittel
Stelle: app/src/main/noteAgent/outputCut.ts:19
Status: [OFFEN]
Nach dem ersten Cut erhält das Modell pauschal den Rat, statt einer gestalteten Seite eine Notiz zu wählen (`app/src/main/noteAgent/outputCut.ts:19-24`). Der Web-Vertrag sieht für ausdrücklich verlangte wissenschaftliche HTML-Seiten jedoch `write_html` vor (`app/src/main/noteAgent/loop.ts:145-152`); ein geladener Webseiten-Skill verlangt ebenfalls genau dieses Werkzeug (`app/resources/starter-skills/wissenschaftliche-webseite/SKILL.md:15-21`). Der Retry kann somit eine kürzere, aber auftragsfremde Markdown-Datei erzeugen, die der Loop als erfolgreiches Ergebnis behandelt, sobald `write_note` durchläuft (`app/src/main/noteAgent/skills.ts:1685-1697`). Die Tests prüfen nur, dass die Fehlermeldung „Ausgabegrenze“ enthält, nicht die Formatbindung des erneuten Versuchs (`app/src/main/noteAgent/loopOutputCut.test.ts:63-76`).
Vorschlag: Zur Kürzung innerhalb des verlangten Formats anleiten; einen Formatwechsel nur als transparenten Abbruchhinweis an den Nutzer geben.

### F04 — Telegram-Agent führt weiterhin abgeschnittene Werkzeugaufrufe aus
Schwere: hoch
Stelle: app/src/main/telegram/agent/loop.ts:135
Status: [OFFEN]
`chatWithTools` meldet `outputCut` für Ollama und OpenAI-kompatible Anbieter (`app/src/main/llm/chatClient.ts:766-772`, `app/src/main/llm/chatClient.ts:874-879`). Der Telegram-Agent liest dieses Feld nicht: Er übernimmt die Tool-Calls und führt sie nach seinem Freigabepfad aus (`app/src/main/telegram/agent/loop.ts:135-165`, `app/src/main/telegram/agent/loop.ts:193-239`). Ein abgeschnittener Call kann dort weiterhin als leeres oder teilweises Argumentobjekt ankommen (`app/src/main/llm/chatClient.ts:732-753`, `app/src/main/llm/chatClient.ts:840-858`). Die konkrete Auswirkung hängt vom jeweiligen Tool und der Bestätigungsentscheidung ab; ein echter Telegram-Lauf wurde **nicht geprüft**. `folderDigest` behandelt `outputCut` dagegen bereits eigens (`app/src/main/noteAgent/folderDigest.ts:293-325`, `app/src/main/noteAgent/folderDigest.ts:373-377`).
Vorschlag: Die Nichtausführung abgeschnittener Calls an der gemeinsamen Tool-Grenze oder auch im Telegram-Loop durchsetzen.

### F05 — Web-Recherche-Schleife ignoriert dasselbe Kürzungssignal
Schwere: mittel
Stelle: app/src/main/llm/petrolWebLoop.ts:310
Status: [OFFEN]
Die Petrol-Web-Schleife erhält ebenfalls `chatWithTools`-Antworten (`app/src/main/index.ts:6988-7000`, `app/src/main/llm/petrolWebLoop.ts:310-312`), typisiert lokal aber nur `text` und `toolCalls` und prüft `outputCut` nicht (`app/src/main/llm/petrolWebLoop.ts:310-323`). Sie kann daraufhin einen abgeschnittenen `web_search`-/`web_fetch`-Call ausführen oder einen abgeschnittenen Text mit `parseUseReply` als Endauswahl behandeln (`app/src/main/llm/petrolWebLoop.ts:323-348`). Ein realer Fehlfall wurde **nicht geprüft**. Das neue Verhalten gilt also nur für den Notiz-Agenten, nicht für alle Nutzer des Clients.
Vorschlag: Kürzungssignal an die Recherche-Schleife durchreichen und vor Tool-Ausführung bzw. `parseUseReply` behandeln.

### F06 — Protokoll und Bilanz sind im erkannten Fall grundsätzlich konsistent, aber nicht am Wire getestet
Schwere: niedrig
Stelle: app/src/main/noteAgent/loop.ts:415
Status: [OFFEN]
Für jeden **erkannten** abgeschnittenen Tool-Call hängt der Loop vor dem nächsten Modellaufruf eine Antwort mit derselben ID an (`app/src/main/noteAgent/loop.ts:415-423`). Das passt zur OpenAI-kompatiblen Serialisierung über `tool_call_id` (`app/src/main/llm/chatClient.ts:778-795`); Ollama serialisiert die Antworten in derselben Reihenfolge ohne ID (`app/src/main/llm/chatClient.ts:636-651`). Bei sofortigem Abbruch nach dem zweiten Cut wird keine weitere Anfrage mit offenen IDs gesendet (`app/src/main/noteAgent/loop.ts:409-414`). Budget und Überlauf-Wächter laufen vor dem Kürzungszweig (`app/src/main/noteAgent/loop.ts:373-396`), die Laufkosten werden auch bei Fehlern aus der Telemetrie bilanziert (`app/src/main/index.ts:5045-5061`), und `run.transcript` wird nur beim erfolgreichen Sonderabschluss gesetzt (`app/src/main/noteAgent/loop.ts:404-407`, `app/src/main/noteAgent/runRegistry.ts:254-271`). Die neuen Tests mocken `chatWithTools` und prüfen nur den In-Memory-Verlauf (`app/src/main/noteAgent/loopOutputCut.test.ts:10-16`, `app/src/main/noteAgent/loopOutputCut.test.ts:34-50`); ein echter OpenAI-/Ollama-Wire-Retry nach einem Cut sowie Budgetdruck sind **ungeprüft**.
Vorschlag: Je einen Serialisierungs- bzw. HTTP-Mock-Test für beide Backends und einen Test mit mehreren Tool-Calls plus kleinem Kontextbudget ergänzen.

## Claude-Antwort

Runde 1, nach Freigabe durch den Nutzer (27.10.2026).

- **F01** [ADRESSIERT] Sonderfall „nur Schlussworte abgeschnitten“ gestrichen: jede abgeschnittene Antwort bekommt Rückmeldung (`loop.ts`, `outputCut`-Zweig). Erst beim Abbruch-Kriterium wird unterschieden: kein Ergebnis → Fehler, Ergebnis vorhanden → Ende mit festem Vermerk `CUT_AFTER_RESULT_NOTE` (abgeschnittener Text wird nicht als Abschluss gezeigt). Web-Lauf zählt nur `run.web.wrote`. Tests: „meldet auch nach fertigem Ergebnis jedes Abschneiden zurück“, „endet nach fertigem Ergebnis beim zweiten Abschneiden mit Vermerk“.
- **F02** [ADRESSIERT] `outputCuts = 0` nach jeder nicht abgeschnittenen Antwort; es zählen nur Abbrüche in Folge. Gesamtdauer bleibt durch `maxIterations` begrenzt. Test „zählt nur Abbrüche in Folge“.
- **F03** [ADRESSIERT] Rückmeldung an das Modell: „im verlangten Format und beim selben Werkzeug“ kürzer schreiben; Formatwechsel nur noch in `repeatedCutMessage` als Vorschlag an den Nutzer. Test „rät nicht zum Formatwechsel“.
- **F04** [ADRESSIERT] Telegram-Loop: bei `outputCut` sofortiges Ende mit fester Antwort `TELEGRAM_CUT_REPLY`, nichts ausgeführt — auch nicht über den Text-Fallback. Bewusst ohne Rückmelde-Versuch (Modul eingefroren, nur Sicherheitsfix). Zwei Tests in `telegram/agent/loop.test.ts`.
- **F05** [DISKUSSION] Zurückgestellt (Nutzerentscheidung): Ausgaben der Recherche-Schleife sind kurz, Abschneiden unwahrscheinlich.
- **F06** [DISKUSSION] Kein Code; Wire-Tests stehen aus.

Belege: `npm run typecheck` grün, `npm run test` 228 Dateien / 3146 Tests grün.

## Status

Runde 1 umgesetzt, wartet auf Abnahme durch den Nutzer.
