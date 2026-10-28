# Petrol-Chat Websuche: großer Rahmen bei bekanntem Cloud-Fenster

## Aufgabe

Nutzerbefund (28.10.2026): Mit eingeschaltetem Globus und einem Cloud-Modell über OpenRouter war die Antwort auf eine Listenfrage (Parfüms eines Parfümeurs seit 2023) „schlicht falsch“: die Liste stand weiter unten auf den Quellseiten und kam nie beim Modell an. Ursache am Code: auch für Modelle mit 200k–1M Token galt der Cloud-Rahmen von 40 000 Zeichen. Die Seite wurde bei 8 000 Zeichen abgeschnitten, die Recherche-Schleife sah 3 000 Zeichen je Abruf, die Antwort rund 3 000 je Seite (sourcesMax = max(12 000, n·3000)).

Änderung (uncommittet):
- Bei OpenRouter holt der Handler `petrol-chat-web` das Katalogfenster (`catalogContextLength`, 3 s, abbrechbar; dieselbe Regel wie beim Agenten: `resolveContextWindow` → 75 %, max. 128 000, nur OpenRouter). Mit Quelle `catalog` gilt `webChatWideLimits`: Prompt bis 150 000 Zeichen, Quellen bis Prompt − 20 000, 20 000 Zeichen Seitentext je Abruf, 8 000 je Abruf in der Schleife, bis zu 8 Seiten in der Antwort.
- LLMBase, Ollama-Cloud, LM Studio, lokales Ollama: unverändert.
- OpenRouter-Aufrufe des Chats (Antwort-Stream und Schleife) schicken `transforms: []`, damit ein zu langer Prompt laut scheitert.
- Neue Prompt-Regel: bei „gekürzt“ markierten Seiten und Listenfragen Unvollständigkeit sagen, nichts ergänzen.
- Der Notiz-Agent behält 8 000 Zeichen je Abruf (Standard in `fetchAndExtract`).

Prüfauftrag adversarial: Wird das größere Budget überall konsistent angewandt (Einfrieren, Nachmessen, Nachfrage-Snapshots, `freezeBest`, `maxPagesForPlace`, Nachsuche)? Gibt es Stellen, die weiter mit 3 000 / 12 000 / 40 000 / 6 Seiten rechnen und das Ergebnis still kleiner machen? Satzprüfung, Wörterabgleich und UI mit 20 000-Zeichen-Auszügen und 8 Seiten — Laufzeit (synchron im Main), Speicher der Snapshots, Anzeige? Kosten je Frage, Antwortzeit, Fristen (`LOOP_LIMITS.deadlineMs` 120 s, Antwort-Timeout 300 s)? Sicherheit: mehr untrusted Text im Prompt — ändert das etwas an Prompt-Injection oder an `rejectTruncatedBody`/`WEB_FETCH_MAX_BYTES`? Ist `transforms: []` im Streaming-Aufruf korrekt und auf OpenRouter beschränkt? Widerspricht die neue Prompt-Regel der Regel „Sprich sonst nicht über Auszüge“?

## Kontext/Anker

- `app/src/shared/webChat.ts:52-100` — `WEB_CHAT_WIDE`, `webChatWideLimits`; bisher `WEB_CHAT_CLOUD_BUDGET` (`:39`), `applyWebChatBudget`, `freezeWebSources`, `freezeWebSourcesToFit`
- `app/src/main/index.ts:6900-6925` — Fenster/Rahmen im Handler (`let wide`)
- `app/src/main/index.ts:6960-6985` — `freezeN`/`freezeBest` mit `sourcesMax`
- `app/src/main/index.ts:6995-7030` — `loopChat` (`disableMiddleOut`), `runLoopResearch` mit `excerptChars`
- `app/src/main/index.ts:~7125-7150` — schnelle Suche (`gatherWebSources`, `freezeWebSourcesToFit` mit `sourcesMax`)
- `app/src/main/index.ts:6724-6745` — `streamPetrolWebModel` (Cloud-Stream mit `disableMiddleOut`)
- `app/src/main/llm/chatClient.ts:901-926` — `streamCloudChat` mit `transforms: []`
- `app/src/main/llm/petrolWebLoop.ts:35,160-163,294` — `excerptChars`
- `app/src/main/llm/petrolWebChat.ts:138-145` — `defaultWebGatherDeps(…, pageChars)`
- `app/src/main/webResearch/fetchExtract.ts:62-70,88-92` — `maxChars`
- `app/src/main/llm/petrolWebPrompt.ts` — neue Regel „gekürzt“
- `app/src/main/llm/petrolWebFollowUp.ts:50` — `measureWithFollowUpRoom`
- `app/src/shared/webChatDeep.ts:15-35,182` — `DEEP_LIMITS`, `maxPagesForPlace`
- Agent-Pendant und Begründung F01 (nur OpenRouter): `docs/codex-collab/agent-cloud-kontextfenster.md`
- CLAUDE.md „Recherche-Schleife“ und „Modellwissen in Webantworten“ (Budgets, Cloud 40 000 / 6 Seiten, F66)

## Codex-Findings

### F01 — Schnelle Suche bleibt bei drei Antwortseiten
Schwere: mittel
Stelle: app/src/main/index.ts:7159; app/src/shared/webChat.ts:882
Status: [OFFEN]
Im schnellen Pfad wird zwar `wide.sourcesMax` übergeben (`app/src/main/index.ts:7161`), aber `freezeWebSourcesToFit` bekommt kein `maxSources`-Argument. Sein Standard ist `WEB_CHAT_MAX_SOURCES = 3` (`app/src/shared/webChat.ts:882`, `:27`); auch `gatherWebSources` ruft die Warteschlange ohne neue Grenzen auf (`app/src/main/llm/petrolWebChat.ts:104-113`), sodass sie nach drei brauchbaren Seiten stoppt (`app/src/shared/webChat.ts:672-674`). Das versprochene Limit von acht Seiten (`app/src/shared/webChat.ts:70`) gilt hier nicht. Relevante vierte oder spätere Treffer erreichen die Antwort trotz großem Fenster nicht.
Vorschlag: Seiten- und Abrufgrenzen des schnellen Pfads bei `wide` ausdrücklich weiterreichen oder die Acht-Seiten-Zusage auf den gründlichen Pfad eingrenzen.

### F02 — Fester Rückfall kann höchstens fünf Seiten lesen
Schwere: mittel
Stelle: app/src/main/index.ts:6991; app/src/main/llm/petrolDeepSearch.ts:229
Status: [OFFEN]
Wenn die Standardschleife im ersten Schritt keine Werkzeuge nutzen kann, fällt sie auf `deepRun` zurück (`app/src/main/index.ts:7044-7050`). Dort wird `maxPages` zwar mit dem weiten Limit übergeben (`app/src/main/index.ts:6996-6998`), aber `DEEP_LIMITS.fetches` und `DEEP_LIMITS.ranks` bleiben jeweils fünf (`app/src/shared/webChatDeep.ts:19-22`); `pickAndFetch` nimmt das Minimum daraus (`app/src/main/llm/petrolDeepSearch.ts:229-251`). Auch bei acht verfügbaren Seiten und genug Kontext sind damit höchstens fünf abrufbar.
Vorschlag: Für den weiten Rückfall passende, ausdrücklich gedeckelte Abruf- und Wahlgrenzen parametrisieren oder seine niedrigere Grenze im Ergebnis kenntlich machen.

### F03 — Die Schleife sieht nur den Anfang und erfährt nichts vom Schnitt
Schwere: hoch
Stelle: app/src/main/llm/petrolWebLoop.ts:294
Status: [OFFEN]
Ein weiter Abruf liefert bis zu 20 000 Zeichen (`app/src/shared/webChat.ts:65-68`; `app/src/main/llm/petrolWebChat.ts:145`), die Schleife gibt davon nur die ersten 8 000 weiter (`app/src/main/llm/petrolWebLoop.ts:294-295`). Der Werkzeugtext nennt weder diese Kürzung noch `outcome.truncated`; der Fetch selbst unterdrückt den Textmarker (`app/src/main/llm/petrolWebChat.ts:145`). Das Modell entscheidet mit `{"use": [...]}` oder beendet die Recherche auf dieser Teilansicht (`app/src/main/llm/petrolWebLoop.ts:325-340`), obwohl die gesuchte Liste im restlichen abgerufenen Seitentext stehen kann. Erst der spätere Antwort-Prompt sieht den größeren Ausschnitt.
Vorschlag: Den Schleifenschnitt im Werkzeugergebnis markieren und einen gezielten Folgeabruf oder ein Seitenfenster für den Rest ermöglichen; zumindest die Entscheidung „Frage beantwortbar“ nicht als vollständige Sicht auf die Seite behandeln.

### F04 — Nachfrage kann nach Katalogfrist dieselben Auszüge verlieren
Schwere: mittel
Stelle: app/src/main/index.ts:6907; app/src/main/llm/petrolWebFollowUp.ts:95
Status: [OFFEN]
Das weite Budget wird bei jeder Frage und Nachfrage erneut nur nach einem binnen drei Sekunden gelieferten Katalogwert gesetzt (`app/src/main/index.ts:6907-6914`). Der Katalogcache wird nach sechs Stunden erneuert (`app/src/main/llm/cloudPricing.ts:16`, `:86-98`); ein Snapshot lebt drei Stunden (`app/src/main/llm/petrolWebSnapshots.ts:21`). Dauert eine fällige Erneuerung länger als drei Sekunden, fällt dieselbe Modellroute auf 40 000 Zeichen zurück (`app/src/main/index.ts:6913`; `app/src/shared/webChat.ts:105-107`). `resolveFollowUp` lehnt dann einen zuvor korrekt eingefrorenen großen Snapshot ab, statt ihn mit demselben Modell zu nutzen (`app/src/main/llm/petrolWebFollowUp.ts:91-104`).
Vorschlag: Das beim Einfrieren geprüfte Fenster modellgebunden im Snapshot halten oder einen noch gültigen früheren Katalogwert für Nachfragen verwenden; bei tatsächlich geändertem Modell weiterhin neu prüfen.

### F05 — Größere Werkzeugantworten werden bei jedem Schleifenschritt erneut bezahlt
Schwere: mittel
Stelle: app/src/main/llm/petrolWebLoop.ts:294; app/src/main/llm/petrolWebLoop.ts:314
Status: [OFFEN]
Bis zu acht Abrufe mit je 8 000 Zeichen landen als Werkzeugnachrichten dauerhaft in `messages` (`app/src/main/llm/petrolWebLoop.ts:28`, `:294-295`, `:342-349`). Jeder der bis zu zwölf Modellaufrufe sendet diesen wachsenden Verlauf erneut (`app/src/main/llm/petrolWebLoop.ts:29-30`, `:305-314`); für Cloud ist `maxPromptChars` ausdrücklich nicht gesetzt (`app/src/main/index.ts:7033-7036`). Die 120-Sekunden-Frist begrenzt Laufzeit (`app/src/main/llm/petrolWebLoop.ts:37`, `:173`), aber weder kumulierte Eingabetoken noch Kosten. Das neue 8k-Excerpt kann deshalb die Kosten eines einzelnen Weblaufs mehrfach erhöhen, selbst wenn die finale Antwort kurz ist.
Vorschlag: Kumuliertes Token- oder Kostenbudget für Cloud-Schleifen festlegen und vor jedem Folgeaufruf prüfen; den erreichten Grenzgrund in der Recherchespur melden.

### F06 — Die neue Kürzungswarnung wird als schwacher Beleg bewertet
Schwere: niedrig
Stelle: app/src/main/llm/petrolWebPrompt.ts:50; app/src/main/index.ts:7223
Status: [OFFEN]
Die neue Regel empfiehlt einen eigenen Satz wie „Die Liste auf [2] ist länger, als ich lesen konnte“ (`app/src/main/llm/petrolWebPrompt.ts:50`). Das Merkmal `gekürzt` steht aber nur im Quellenkopf (`app/src/main/llm/petrolWebPrompt.ts:17-20`), während `analyzeCitations` ausschließlich die Auszugstexte erhält (`app/src/main/index.ts:7222-7223`) und zitierte Sätze per Wortüberdeckung mit diesen Texten bewertet (`app/src/shared/rag/citations.ts:357-361`, `:414-427`). Die vom System verlangte Aussage über den Schnitt kann so als schwach belegt erscheinen, obwohl sie aus App-Metadaten stammt. Die Ausnahme „Sprich sonst nicht über Auszüge“ erlaubt die Warnung sprachlich, die Satzprüfung berücksichtigt ihre Herkunft jedoch nicht.
Vorschlag: Kürzungswarnungen als App-Hinweis anzeigen oder die Satzprüfung gezielt mit den Kürzungsmetadaten verbinden.

### F07 — Zwei Ersatzabrufe der schnellen Suche sind unerreichbar
Schwere: mittel
Stelle: app/src/main/llm/petrolWebChat.ts:111; app/src/shared/webChat.ts:639
Status: [OFFEN]
F01 ist für acht erfolgreiche Seiten bis zum Einfrieren durchgereicht (`app/src/main/index.ts:7147-7150`, `:7180-7186`). Die zugesagten zwei Fehlversuche greifen jedoch nicht: `gatherWebSources` ruft `candidatesFromHits` ohne Limit auf (`app/src/main/llm/petrolWebChat.ts:111`), und diese Funktion liefert höchstens acht Kandidaten (`app/src/shared/webChat.ts:639-650`). Die Warteschlange kann deshalb trotz `maxAttempts = 10` (`app/src/main/index.ts:7150`) bei einem einzigen Fehlabruf höchstens sieben brauchbare Seiten erzielen.
Vorschlag: Bei großem Rahmen bis zu zehn Kandidaten zulassen und die vom Suchanbieter tatsächlich lieferbare Trefferzahl prüfen; die Obergrenze der eingefrorenen Seiten bei acht lassen.

### F08 — Die Stand-Zeile fehlt gerade nach erfolgloser Suche
Schwere: mittel
Stelle: app/src/main/llm/petrolWebLoop.ts:256
Status: [OFFEN]
Die neue Stand-Zeile wird nur am Ende eines erfolgreichen Suchlaufs mit mindestens einem Treffer angehängt (`app/src/main/llm/petrolWebLoop.ts:256-269`). Bei null Treffern kehrt `doSearch` vorher mit „Keine Treffer“ zurück (`:256`), bei einem Anbieterfehler vorher mit „Die Suche ist fehlgeschlagen“ (`:241-245`). In genau diesen Fällen erfährt das Modell nicht, wie viele Suchen und Abrufe noch frei sind, obwohl `trace.searches` schon beim Start erhöht wurde (`:235-239`). Das widerspricht der Runde-2-Zusage „Nach jeder Suche“ und kann weitere ungezielte Suchen begünstigen.
Vorschlag: Die Stand-Zeile auch an beide frühen Ergebniswege anhängen; bei Abbruch klar zwischen verbrauchtem Budget und Frist unterscheiden.

### F09 — Teilansicht-Hinweis verspricht im Standardrahmen mehr Text als die Antwort erhält
Schwere: mittel
Stelle: app/src/main/llm/petrolWebLoop.ts:311
Status: [OFFEN]
F03 markiert den Schnitt jetzt außerhalb des fremden Blocks (`app/src/main/llm/petrolWebLoop.ts:305-314`). Der Text „Die Antwort bekommt mehr davon zu sehen“ wird aber auch ohne `wide` angehängt. Im Standard-Cloud-Pfad sieht die Schleife 3 000 Zeichen je Abruf (`app/src/main/llm/petrolWebLoop.ts:35`, `:306`); bei sechs Seiten begrenzt `freezeN` die Antwortquellen auf `6 × 3 000` Zeichen (`app/src/main/index.ts:6995`), die `applyWebChatBudget` gleichmäßig verteilt (`app/src/shared/webChat.ts:778-799`). Sechs lange Seiten ergeben damit höchstens dieselben 3 000 Zeichen je Seite, bei weniger Platz sogar weniger. Das Modell soll die Seite dennoch wegen eines möglicherweise verborgenen Restes in `use` aufnehmen und kann dadurch eine unvollständige Antwort erwarten.
Vorschlag: Den Hinweis vom tatsächlich möglichen Antwortbudget abhängig machen; im Standardrahmen nur sagen, dass die Ansicht gekürzt ist, ohne einen größeren Antwortauszug zu versprechen.

### F10 — Das neue Schleifenbudget passt nicht in jedes „große“ Modellfenster
Schwere: hoch
Stelle: app/src/main/index.ts:7051; app/src/main/llm/petrolWebLoop.ts:327
Status: [OFFEN]
`wide` gilt bereits, sobald das auf 75 % reduzierte Katalogfenster über 32 768 Token liegt (`app/src/shared/contextBudget.ts:91-96`); `webChatWideLimits` kann dann ein Antwortbudget von nur rund 86 000 Zeichen liefern (`app/src/shared/webChat.ts:101-115`). Trotzdem darf die Schleife unabhängig von dieser Größe 14 Abrufe mit je 8 000 Zeichen anhängen, also allein bis zu 112 000 Zeichen Seitentext (`app/src/shared/webChat.ts:66-68`, `:76-78`; `app/src/main/llm/petrolWebLoop.ts:305-314`, `:361-368`). Für Cloud wird `maxPromptChars` nicht gesetzt (`app/src/main/index.ts:7051-7055`), sodass der Verlauf vor jedem Folgeaufruf ungeprüft gesendet wird (`app/src/main/llm/petrolWebLoop.ts:324-333`). OpenRouter soll dank `transforms: []` laut scheitern, aber die Schleife endet dann mit `loop-error` statt das erlaubte Fenster sinnvoll zu nutzen (`app/src/main/llm/petrolWebLoop.ts:334-342`).
Vorschlag: Ein eigenes Schleifenbudget aus dem konkreten Katalogfenster ableiten und vor Folgeaufrufen prüfen; bei Erreichen die gelesenen Seiten geordnet für die Antwort einfrieren.

### F11 — Vorwärmen kann die erste Frage weiterhin verpassen
Schwere: mittel
Stelle: app/src/main/index.ts:4626
Status: [OFFEN]
Der Preflight startet `warmPricingCache` per `void ...then(...)` und wartet weder auf Schlüsselzugriff noch auf den Katalogabruf (`app/src/main/index.ts:4625-4628`). Ein unmittelbar danach gesendeter Weblauf wartet höchstens drei Sekunden auf denselben Katalog (`app/src/main/index.ts:6916-6919`; `app/src/main/llm/chatClient.ts:1018-1033`). Der kalte Abruf darf bis zu zehn Sekunden dauern (`app/src/main/llm/cloudPricing.ts:37-41`). Genau der dokumentierte Erstlauf kann daher weiterhin mit Standardrahmen starten, wenn der Nutzer nach der Modellwahl sofort fragt.
Vorschlag: Den ersten Weblauf bei kaltem Katalog gezielt länger auf den bereits laufenden Abruf warten lassen oder den verfügbaren Rahmen vor dem Senden als Bereitschaftszustand behandeln.

### F12 — Reiner Agenten-Preflight löst jetzt trotz fehlender Freigabe einen Cloud-GET aus
Schwere: niedrig
Stelle: app/src/main/index.ts:4621
Status: [OFFEN]
`note-agent-route-preflight` berechnet zwar zuerst das Agenten-Gate, startet das Vorwärmen aber unabhängig von `gate.ok` (`app/src/main/index.ts:4620-4627`). Die Agentenkarte ruft diesen Handler bereits für die Routenanzeige sowie bei Fokus und Schließen der Einstellungen auf (`app/src/renderer/components/Agent/AgentView.tsx:226-247`). Damit kann eine reine Vorabprüfung bei ausgewähltem OpenRouter-Modell einen Katalog-GET mit gespeichertem API-Schlüssel auslösen, auch wenn der Notiz-Agent für Cloud gesperrt ist (`app/src/main/llm/chatClient.ts:996-1002`; `app/src/main/llm/cloudPricing.ts:37-40`). Es fließen keine Frage oder Vault-Inhalte, aber der bisher als „nur Weg, Freigabe und Zustimmung“ beschriebene Preflight (`app/src/main/index.ts:4614`) hat nun eine externe Nebenwirkung.
Vorschlag: Vorwärmen an den tatsächlich freigegebenen Chat-Pfad binden oder die Netz-Nebenwirkung der gemeinsamen Preflight-Schnittstelle ausdrücklich machen.

### F13 — Die verlängerte Recherche kann die Gesamtdauer auf acht Minuten treiben
Schwere: mittel
Stelle: app/src/main/index.ts:7042; app/src/main/index.ts:6747
Status: [OFFEN]
Für `wide` läuft die Recherche-Schleife jetzt bis zu 180 Sekunden (`app/src/shared/webChat.ts:76-79`; `app/src/main/index.ts:7042-7048`). Jeder einzelne Werkzeug-Modellaufruf darf bis zu 120 Sekunden dauern (`app/src/main/index.ts:7035`), sodass schon ein langsamer Aufruf einen Großteil der neuen 20 Iterationen verbrauchen kann. Danach beginnt die Antwortphase mit einem eigenen 300-Sekunden-Timeout (`app/src/main/index.ts:6743-6747`, `:7225-7229`); die Schleifenfrist umfasst diese Phase nicht (`app/src/main/llm/petrolWebLoop.ts:180`, `:200-203`). Ein Weblauf kann somit rund 480 Sekunden plus Vorlauf beanspruchen. Die neue Iterationszahl ist kein verlässliches nutzbares Budget, und die zusätzliche Minute Recherche verlängert die mögliche Wartezeit unmittelbar.
Vorschlag: Eine Gesamtdauer für Recherche und Antwort festlegen oder die verbleibende Zeit beim Wechsel zur Modellphase sichtbar machen und für deren Timeout berücksichtigen.

### F14 — Ersatzkandidaten bleiben vor `gatherWebSources` auf acht begrenzt
Schwere: mittel
Stelle: app/src/shared/webResearch.ts:81
Status: [OFFEN]
Die Korrektur zu F07 erlaubt in `gatherWebSources` zwar zehn Kandidaten (`app/src/main/llm/petrolWebChat.ts:109-114`), aber alle drei Anbieter-Parser brechen bei `MAX_HITS_PER_SEARCH = 8` ab (`app/src/shared/webResearch.ts:380-418`, `:81`). Tavily fordert zudem schon beim Anbieter nur acht Treffer an (`app/src/main/webResearch/providers.ts:118`). `defaultWebGatherDeps.search` liefert damit nie die zwei Ersatzkandidaten an `gatherWebSources` (`app/src/main/llm/petrolWebChat.ts:148-150`). Im schnellen weiten Pfad sind bei einem Fehlabruf weiterhin höchstens sieben erfolgreiche Seiten möglich, obwohl zehn Abrufstarts erlaubt sind (`app/src/main/index.ts:7156-7159`).
Vorschlag: Für diesen Pfad eine höhere, begrenzte Trefferzahl bis in Anbieteranfrage und Parser durchreichen; sonst die zwei Ersatzabrufe nicht zusagen.

### F15 — `loop-context` verliert die Auswahl der zuletzt gelesenen Seiten
Schwere: hoch
Stelle: app/src/main/llm/petrolWebLoop.ts:333
Status: [OFFEN]
Überschreitet der wachsende Werkzeugverlauf `maxPromptChars`, bricht die Schleife vor dem nächsten Modellaufruf ab (`app/src/main/llm/petrolWebLoop.ts:330-340`). Das Modell kann dann kein abschließendes `{"use": [...]}` liefern; `use` bleibt leer (`app/src/main/llm/petrolWebLoop.ts:198`, `:363`). `finish()` sortiert daraufhin alle Abrufe in ursprünglicher Abrufreihenfolge (`app/src/main/llm/petrolWebLoop.ts:202-210`), und `freezeBest` nimmt davon höchstens acht Quellen (`app/src/main/index.ts:6992-7004`, `:7120-7123`; `app/src/shared/webChat.ts:857-858`). Bei neun oder mehr brauchbaren Seiten kann eine spät gezielt gefundene, entscheidende Seite so aus der Antwort fallen, obwohl gerade ihr Abruf den Grenzwert ausgelöst hat. Der Ablauf markiert zwar `loop-context`, sichert aber die fachliche Priorität der letzten Recherche nicht.
Vorschlag: Beim Kontextstopp relevante zuletzt gelesene Seiten gezielt vorziehen oder vor dem Limit Platz für einen abschließenden Auswahlaufruf reservieren; einen solchen Grenzfall mit mehr als acht Abrufen testen.

### F16 — F10 misst nicht den tatsächlichen Modell-Prompt
Schwere: mittel
Stelle: app/src/main/llm/petrolWebLoop.ts:334
Status: [OFFEN]
Der neue Wächter addiert nur `content.length` und gegebenenfalls `JSON.stringify(tool_calls).length` (`app/src/main/llm/petrolWebLoop.ts:333-335`). Der wirkliche OpenRouter-Request serialisiert zusätzlich Rollen, Werkzeugnachrichten, die umgeformten Funktionsaufrufe und das vollständige `tools`-Schema (`app/src/main/llm/chatClient.ts:771-817`). Außerdem setzt `wide.totalChars` eine pauschale Umrechnung von drei Zeichen je Token an (`app/src/shared/webChat.ts:101-104`, `:46-47`), obwohl die Projekteichung für Tabellen nur 1,86 Zeichen je Token nennt (`app/src/shared/contextBudget.ts:9-14`). Bei textarmen Tabellen oder vielen Werkzeugaufrufen kann der Anbieter deshalb schon vor Erreichen von `maxPromptChars` einen Überlauf melden. Dieser landet nach dem ersten Zug als `loop-error` statt als geordneter `loop-context` (`app/src/main/llm/petrolWebLoop.ts:339-348`).
Vorschlag: Den vollständigen Wire-Prompt samt Werkzeug-Schema mit Reserve messen oder berichtete Prompt-Tokens des Anbieters für Folgeaufrufe nutzen; den Fehlerpfad für Kontextüberlauf gesondert prüfen.

### F17 — Die Schlussauswahl kennt den Inhalt der gelesenen Seiten nicht
Schwere: hoch
Stelle: app/src/main/llm/petrolWebLoop.ts:326
Status: [OFFEN]
Beschreibung: `finalPick` baut einen neuen Modellaufruf nur aus Seitentitel, Host und Textlänge; die zuvor gelesenen Auszüge fehlen vollständig (`app/src/main/llm/petrolWebLoop.ts:323-334`). Bei gleichen oder unspezifischen Titeln kann das Modell deshalb nicht erkennen, welche Seite die Antwort tatsächlich trägt. Die Prüfung danach kontrolliert lediglich, ob die gewählte Nummer gelesen wurde (`app/src/main/llm/petrolWebLoop.ts:335`), nicht die Relevanz. Im großen Rahmen sind 14 Abrufe, aber nur acht Antwortquellen möglich (`app/src/shared/webChat.ts:69-79`); die gewählte Reihenfolge bestimmt, welche Seiten `freezeWebSources` behält (`app/src/main/llm/petrolWebLoop.ts:206-210`; `app/src/shared/webChat.ts:834-857`). Damit bleibt der Verlust einer spät gefundenen tragenden Seite aus F15 möglich. Ein manipulierter Seitentitel kann diese Auswahl zusätzlich beeinflussen, obwohl er gerahmter Fremdtext ist (`app/src/main/llm/petrolWebLoop.ts:328-334`).
Vorschlag: Für die Schlussauswahl kurze bereinigte Inhaltsanker aus jeder gelesenen Seite mitsenden und die Auswahl bei mehr als acht Seiten mit inhaltlich gleichen Titeln prüfen; den Titel allein nicht als Relevanzbeleg behandeln.

### F18 — Schlussauswahl verliert bei Gesprächsfragen das frühere Thema
Schwere: mittel
Stelle: app/src/main/llm/petrolWebLoop.ts:333
Status: [OFFEN]
Beschreibung: Die normale Recherche erhält frühere Webfragen ausdrücklich im Systemtext, damit Anweisungen wie „such gründlicher“ auf das richtige Thema bezogen werden (`app/src/main/llm/petrolWebLoop.ts:127-140`, `:342-344`; Übergabe in `app/src/main/index.ts:7057`). `finalPick` startet dagegen mit nur der aktuellen Frage und der Titelliste (`app/src/main/llm/petrolWebLoop.ts:331-334`). Bei einer solchen Gesprächsfrage fehlt dem Auswahlmodell die sachliche Bezugsfrage; besonders bei allgemeinen Titeln kann es die tragenden Seiten nicht gezielt vorziehen. Ab neun gelesenen Seiten kann diese Reihenfolge die Antwortquellen ändern (`app/src/main/llm/petrolWebLoop.ts:206-210`; `app/src/shared/webChat.ts:857`).
Vorschlag: Die bereits bereinigten `opts.topics` auch in den Schlussauswahlaufruf übernehmen und sie im Test mit einer echten Gesprächsfrage und mehr als acht gelesenen Seiten prüfen.

### F19 — Fehlgeschlagene Schlussauswahl fällt unbemerkt auf Abrufreihenfolge zurück
Schwere: mittel
Stelle: app/src/main/llm/petrolWebLoop.ts:335
Status: [OFFEN]
Beschreibung: Eine nicht parsebare Modellantwort ergibt `[]` (`app/src/main/llm/petrolWebLoop.ts:143-147`); auch jeder Fehler des zusätzlichen Aufrufs wird ohne Kennzeichnung zu `[]` (`app/src/main/llm/petrolWebLoop.ts:330-338`). Danach gibt `finish()` alle Seiten wieder in Abrufreihenfolge aus (`app/src/main/llm/petrolWebLoop.ts:202-210`, `:399-400`). Gerade bei der Kontextgrenze, für die F15 den Auswahlaufruf eingeführt hat, kann dadurch eine späte relevante Seite weiterhin aus den höchstens acht eingefrorenen Quellen fallen (`app/src/shared/webChat.ts:69-79`, `:857`), ohne dass die Spur den Ausfall der Schlussauswahl unterscheidet. Der Test zum neuen Pfad verwendet nur zwei Seiten und eine gültige Auswahlantwort (`app/src/main/llm/petrolWebLoop.test.ts:209-224`).
Vorschlag: Parsefehler und Aufruffehler der Schlussauswahl in der Spur sichtbar machen und den Rückfall mit mindestens neun Seiten sowie einem fehlgeschlagenen oder abgebrochenen Auswahlaufruf prüfen.

### F20 — Der 300-Zeichen-Anker wird still auf 120 Zeichen gekürzt
Schwere: hoch
Stelle: app/src/main/llm/petrolWebLoop.ts:332
Status: [OFFEN]
Beschreibung: Die Korrektur zu F17 setzt zwar `PICK_ANCHOR_CHARS = 300` (`app/src/main/llm/petrolWebLoop.ts:26-27`), gibt den Ausschnitt aber anschließend an `sanitizeHeaderPart` weiter (`app/src/main/llm/petrolWebLoop.ts:330-333`). Dieser Helfer begrenzt ohne dritten Parameter auf 120 Zeichen, bei Überlänge auf 119 Zeichen plus Ellipse (`app/src/main/rag/vaultPrompt.ts:25-28`). Der Schlussaufruf sieht daher höchstens 120 Zeichen Seiteninhalt. Stehen dort nur allgemeine Einleitung oder gleiche Seitenschablonen, bleiben die Inhalte für die Auswahl ununterscheidbar; die Antwort friert trotzdem nur die ersten acht nach dieser Auswahl ein (`app/src/main/llm/petrolWebLoop.ts:209-213`; `app/src/shared/webChat.ts:69-79`, `:857`). Der hohe Befund aus F17 ist für solche Seiten nicht ausgeräumt.
Vorschlag: Für Inhaltsanker eine eigene Bereinigung ohne Kopfzeilenlimit verwenden und die tatsächlich gesendete Länge sowie die Auswahl einer relevanten neunten Seite prüfen.

### F21 — Der Neun-Seiten-Test liest nur acht Seiten
Schwere: mittel
Stelle: app/src/main/llm/petrolWebLoop.test.ts:229
Status: [OFFEN]
Beschreibung: Der Test zu F17–F19 legt neun Treffer in **einer** Suchantwort an und versucht neun `web_fetch`-Aufrufe (`app/src/main/llm/petrolWebLoop.test.ts:229-240`). `doSearch` übernimmt aus jeder Suche jedoch höchstens acht Treffer (`app/src/main/llm/petrolWebLoop.ts:267`; `app/src/main/llm/petrolWebLoop.ts:34-35`); `web_fetch` für Nummer 9 endet deshalb bereits an der Registry-Prüfung (`app/src/main/llm/petrolWebLoop.ts:281-285`). Die Assertions prüfen `pick-failed` und den ersten Eintrag, aber keine neun erfolgreichen Abrufe (`app/src/main/llm/petrolWebLoop.test.ts:241-246`). Der kritische Fall, in dem eine späte neunte Seite beim Rückfall aus den acht Antwortquellen fällt, bleibt ungetestet (`app/src/shared/webChat.ts:69-79`, `:857`).
Vorschlag: Treffer auf mindestens zwei Suchen verteilen und im Test neun erfolgreiche Abrufe sowie die tatsächlich eingefrorenen acht Quellen und die verworfene neunte Seite prüfen.

### F22 — keine neuen Befunde
Schwere: niedrig
Stelle: app/src/main/llm/petrolWebLoop.ts:332; app/src/main/llm/petrolWebLoop.test.ts:226
Status: [OFFEN]
Beschreibung: F20 ist umgesetzt: `sanitizeHeaderPart` erhält für den Inhaltsanker ausdrücklich `PICK_ANCHOR_CHARS = 300` (`app/src/main/llm/petrolWebLoop.ts:26-27`, `:332`); die frühere 120-Zeichen-Grenze greift dort nicht mehr (`app/src/main/rag/vaultPrompt.ts:25-28`). F21 ist umgesetzt: Der Test verteilt neun Treffer auf zwei Suchen, setzt `fetches: 9`, bestätigt neun erfolgreiche Abrufe, das Kennwort hinter der Einleitung, die Vorreihung von Treffer 9 und den markierten Rückfall bei unparsebarer Auswahl (`app/src/main/llm/petrolWebLoop.test.ts:226-257`); 22 Schleifentests liefen grün. In der Gesamtsicht auf das übrige Diff fand ich keinen weiteren hohen oder kritischen Befund: Der große Rahmen bleibt an das bestätigte OpenRouter-Fenster gebunden (`app/src/main/index.ts:6920-6940`), Rechercheverlauf und Antwortquellen haben getrennte Grenzen (`app/src/main/index.ts:6994-7006`, `:7048-7066`), und die Schlussauswahl ist auf gelesene Treffer sowie das Abbruchsignal begrenzt (`app/src/main/llm/petrolWebLoop.ts:326-348`).

## Claude-Antwort

Alle sechs Belege am Code nachgesehen, sie stimmen. Freigabe durch den Nutzer: F01, F03, F04 (28.10.2026).

- **F01** [ADRESSIERT] — Schnelle Suche bekommt bei großem Fenster `maxUsable = wide.maxPages`, `maxAttempts = wide.maxPages + 2` (`gatherWebSources` → `runFetchQueue`) und friert bis zu `wide.maxPages` Seiten ein; die Kopfzeilen-Schätzung rechnet mit derselben Zahl. Betrifft nur ausgeschaltete Recherche-Schleife.
- **F02** [OFFEN] — trägt, betrifft nur den Rückfall bei Modellen ohne Werkzeuge. Nicht freigegeben.
- **F03** [ADRESSIERT] — Das Werkzeugergebnis der Schleife nennt eine Teilansicht als App-Text hinter dem fremden Block („Von dieser Seite siehst du nur den Anfang (x von y Zeichen …). Die Antwort bekommt mehr davon zu sehen. … nimm die Seite trotzdem in "use" auf.“), auch wenn die Seite selbst beim Abruf gekürzt wurde. Gilt für alle Modellwege. Ein Werkzeug zum Nachlesen weiter unten ist bewusst nicht gebaut (eigene Runde). Tests in `petrolWebLoop.test.ts`.
- **F04** [ADRESSIERT] — `petrolWideByModel` merkt sich den zuletzt bestätigten Rahmen je OpenRouter-Modell (nur Speicher). Kommt der Katalog nicht rechtzeitig, gilt der gemerkte Wert; meldet der Katalog ein kleines Fenster, wird der Eintrag gelöscht.
- **F05** [OFFEN] — trägt. Entscheidung nach Vorher-nachher-Messung in der App mit abgelesenen Kosten (Kostenlimit oder kleinerer Schleifenauszug).
- **F06** [OFFEN] — trägt teilweise, sichtbar nur mit eingeschalteter Quellenkritik (Standard aus). Nicht freigegeben.

Belege: `npm run typecheck` grün, `npx electron-vite build` grün, `npm run test` 3182 grün (einziger Fehlschlag `shellExecution.test.ts`, einzeln grün).

### Runde 2 (28.10.2026, nach GUI- und CDP-Tests)

Befunde aus echten Läufen (Dev-App, OpenRouter `openai/gpt-6-luna`, Tavily):
- Erster Lauf der Sitzung bekam den kleinen Rahmen: der kalte Katalogabruf (767 KB) dauerte länger als 3 s. → Katalog wird jetzt in `note-agent-route-preflight` vorgewärmt (nur GET der Modellliste).
- Mit großem Rahmen verbrauchte das Modell 8 Suchen mit fast gleichen Anfragen, las 3 Seiten und lief in die Schrittgrenze (12). Seitenlänge war NICHT der Engpass (meist 1–7k Zeichen).
- Kosten einer ganzen Schleife (13 Aufrufe, Prompt-Cache): rund 0,3 Cent laut OpenRouter-Usage → F05 praktisch kein Kostenproblem bei diesem Modell.

Neu umgesetzt (zur Prüfung):
- `WEB_CHAT_WIDE.loopSearches/loopFetches/loopIterations/loopDeadlineMs` = 8 / 14 / 20 / 180 s, durchgereicht an `runLoopResearch` (`searches`, `fetches`, `iterations`), Prompt nennt das echte Budget.
- Nach jeder Suche App-Text hinter dem fremden Block: „Stand: n Seiten gelesen, noch x Suchen und y Abrufe frei. Mehrere web_fetch in einem Schritt sind möglich.“ Systemtext: „gern mehrere mit einem Schritt“.
- Log `[PetrolWeb] Rahmen groß/Standard`.
- Ergebnis danach: 8 Suchen, 10 Abrufe, 6 brauchbare Seiten; alle drei richtigen Düfte gefunden (Jahre fehlen, weil Fragrantica 403 und Parfumo eine Rumpfseite liefern).

Bitte prüfen: Anker `app/src/main/llm/petrolWebLoop.ts` (maxSearches/maxFetches/maxIterations, Stand-Zeile), `app/src/shared/webChat.ts` (`WEB_CHAT_WIDE`), `app/src/main/index.ts` (Preflight-Vorwärmen, `loopDeadline`, `runLoopResearch`-Optionen, Rahmen-Log).

### Antworten Runde 2 (F07–F13)

- **F07** [ADRESSIERT] — `gatherWebSources` holt bis zu `max(8, maxAttempts)` Kandidaten (`petrolWebChat.ts`).
- **F08** [ADRESSIERT] — `statusLine()` auch nach „Keine Treffer“ und nach fehlgeschlagener Suche; Test „Stand-Zeile auch nach einer Suche ohne Treffer“.
- **F09** [ADRESSIERT] — neue Option `answerSeesMore` (nur großer Rahmen); im Standardrahmen sagt der Hinweis nur „gekürzt“ und rät zu einer gezielten Suche statt mehr Antworttext zu versprechen. Test vorhanden.
- **F10** [ADRESSIERT] — Cloud mit großem Rahmen bekommt `maxPromptChars = wide.totalChars`; die Schleife endet bei Überschreitung geordnet mit `loop-context` und friert ein, statt am Anbieter zu scheitern.
- **F11** [ADRESSIERT] — Wartezeit auf den Katalog im Chat 8 s (abbrechbar). Beleg: erster Lauf nach Neustart hatte „Rahmen groß“.
- **F12** [ADRESSIERT] — Vorwärmen nur, wenn der Weg für Agent (`gate.ok`) oder Chat (`petrolCloudAllowed`) freigegeben ist.
- **F13** [DISKUSSION] — trägt rechnerisch; neu sind davon 60 s (Schleife 120 → 180 s), die 300-s-Antwortfrist bestand schon. In den Läufen dauerten Fragen 10–68 s. Entscheidung über eine Gesamtfrist beim Nutzer.

Messung nach Runde 2 (CDP über `window.electronAPI.petrolChatWeb`, gpt-6-luna, 7 Fragen): Physik-Nobelpreise 2020–2026 vollständig und belegt (18 s); Zotero/Citavi/EndNote-Tabelle mit Hochschulquellen (64 s); WissZeitVG-Stand mit Kabinettsbeschluss und 1. Lesung (53 s); PISA 2025 mit Punktwerten, Auszüge bis 20 000 Zeichen genutzt (26 s); DFG-Programme mit Voraussetzungen von dfg.de (53 s); Rentenbeitrag 2026 (11 s); Parfüm-Liste jetzt Sadonaso 2023 / Risvelium 2025 / Micodelirio 2026 (68 s, deckt sich mit Gegenrecherche). Wiederkehrende Lücke: PDFs (Bundestags-Drucksachen, Referentenentwürfe, nationaler PISA-Bericht) werden als „type“ abgelehnt.

### Antworten Runde 3 (F14–F16)

- **F14** [ADRESSIERT] — Zusage zurückgenommen: schnelle Suche mit großem Rahmen `maxAttempts = maxUsable = 8` (Anbieter liefern höchstens 8 Treffer).
- **F15** [ADRESSIERT] — Endet die Schleife ohne `use` (Kontext-, Schritt- oder Budgetgrenze) und sind ≥ 2 Seiten gelesen, folgt `finalPick()`: ein Aufruf ohne Werkzeuge, nur mit der gerahmten Liste der gelesenen Treffer (Titel · Website · Länge), Antwort `{"use": [...]}`; nur gelesene Nummern zählen. Test „ohne Auswahl an der Kontextgrenze …“. Im Lauf „Exzellenzcluster Bayern“ trat `loop-context` real auf, die Antwort nannte alle zwölf Cluster.
- **F16** [ADRESSIERT] — `maxPromptChars = 0,6 × wide.totalChars` (`LOOP_WIDE_PROMPT_SHARE`) als Abschlag für Rollen, Werkzeug-Schema und Tabellen. Ein dennoch gemeldeter Überlauf endet wie bisher in `loop-error` mit den gelesenen Seiten.
- Nebenbei: `chatWithTools` lässt `tools` weg, wenn die Liste leer ist (Ollama- und OpenAI-kompatibler Pfad), weil manche Server `tools: []` ablehnen.

### Antworten Runde 4 (F17–F19)

- **F17** [ADRESSIERT] — `finalPick` schickt je Seite zusätzlich die ersten 300 Zeichen (`PICK_ANCHOR_CHARS`, bereinigt, im fremden Block). Ein manipulierter Titel bleibt gerahmter Fremdtext; die Auswahl ändert nur die Reihenfolge, nie den Inhalt der Antwortquellen.
- **F18** [ADRESSIERT] — `opts.topics` stehen auch im Systemtext der Schlussauswahl.
- **F19** [ADRESSIERT] — leere oder fehlgeschlagene Schlussauswahl setzt `pick-failed` (bestehende Anzeige „Auswahl fehlgeschlagen …“). Test mit 9 Treffern, Kontextgrenze und unparsebarer Antwort.

### Antworten Runde 5 (F20–F21)

- **F20** [ADRESSIERT] — Anker mit `sanitizeHeaderPart(…, PICK_ANCHOR_CHARS)`, also wirklich 300 Zeichen.
- **F21** [ADRESSIERT] — Test neu: zwei Suchen, neun erfolgreiche Abrufe (`fetches: 9`), Kontextgrenze, Anker-Kennwort hinter 165 Zeichen Einleitung, Auswahl `[9, 1]` stellt die neunte Seite nach vorn; zweiter Lauf mit unparsebarer Auswahl → `pick-failed` und Abrufreihenfolge.

## Status

Sechs Prüfrunden, F01–F22. Umgesetzt: F01, F03, F04, F07–F12, F14–F21. Offen: F02 (Rückfall 5 Seiten), F06 (Hinweissatz in Quellenkritik), F13 (Gesamtdauer, Nutzerentscheidung). F05 durch Messung entschärft (~0,3 Cent je Schleife). Runde 6: keine neuen Befunde. Vom Nutzer abgenommen am 28.10.2026: Chat-Antworten ohne Gendern, PDF-Lesen nicht nötig; F02, F06, F13 bleiben offen.
