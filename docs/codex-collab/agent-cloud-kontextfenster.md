# Agent: Kontextfenster bei Cloud-Läufen aus dem Anbieterkatalog

## Aufgabe

Nutzerbeobachtung (28.10.2026): Im Petrol Agent (Auftrag-Modus, Notiz-Agent-Loop) läuft mit Claude Haiku über OpenRouter oft „der Kontext voll“ — Lesen wird gesperrt bzw. der Lauf bricht mit „Arbeitsspeicher des Modells … ist voll“ ab.

Ursache: `resolveContextWindow` lieferte für jeden Nicht-Ollama-Weg pauschal 32 768 Token (frühere Vorsichtsentscheidung F29/F35: Katalogwert ist kein garantiertes Endpunkt-Fenster). Zusammen mit 8 192 Antwortreserve und der bewusst überschätzenden Token-Schätzung blieben real ~15–20k Token für Werkzeugergebnisse.

Änderung (uncommittet, Stand HEAD + Working Tree):
- Für `openrouter`/`llmbase` wird `context_length` aus dem Modellkatalog genommen (derselbe Abruf/Cache wie die Preise), davon 75 %, Deckel 128 000, nie unter 32 768. LM Studio und Ollama unverändert.
- Der Loop löst das Fenster einmal auf (await auf den Katalog vor dem ersten Aufruf) und reicht es an `folder_digest` weiter.
- Überlauf jenseits des echten Endpunkt-Fensters soll laut als Fehler kommen, weil `disableMiddleOut` die stille Mitten-Kompression von OpenRouter abschaltet.

Prüfauftrag: adversarial. Ist die Lockerung sicher? Wo kann das größere Budget still Inhalte verlieren, falsche Fehlermeldungen erzeugen, Kosten unerwartet treiben oder einen Lauf verzögern/blockieren? Stimmt die Annahme, dass ein zu großes Budget bei OpenRouter UND LLMBase laut scheitert? Greift `looksTruncated`/`contextTruncationMessage` sinnvoll bei Cloud? Gibt es weitere Stellen, die noch mit 32 768 rechnen oder das Fenster selbst neu bestimmen?

## Kontext/Anker

- `app/src/shared/contextBudget.ts:65-93` — `CATALOG_WINDOW_SHARE`, `CATALOG_WINDOW_MAX`, `resolveContextWindow(backend, numCtx, catalogTokens)`
- `app/src/shared/contextBudget.test.ts:34-62` — neue Tests
- `app/src/main/llm/cloudPricing.ts:40-100` — Katalog-Cache speichert `context_length` (`contextByModel`), `getModelContextLength`, gemeinsames `ensureCatalog` (TTL 6 h, Fehler → null)
- `app/src/main/llm/chatClient.ts:1003-1015` — `catalogContextLength(opts)`
- `app/src/main/llm/chatClient.ts:533` — `disableMiddleOut` → `transforms: []` (nur OpenRouter!)
- `app/src/main/noteAgent/loop.ts:329-358` — `chatOptions`, Budget-Aufbau, Spur-Meldung
- `app/src/main/noteAgent/loop.ts:380-395` — `hasRoomForNextCall`, `looksTruncated`
- `app/src/main/noteAgent/folderDigest.ts:54,163` — Fenster aus `deps.contextWindowTokens`
- `app/src/main/noteAgent/skills.ts:75,635` — Durchreichen über `NoteAgentContext`
- `app/src/shared/contextGuard.ts` — Überlauf-Erkennung
- CLAUDE.md, Abschnitt „Notiz-Agent: Modellweg, Cloud-Zustimmung und Datenwege“ — neuer Punkt „Kontextfenster bei Cloud-Läufen“

## Codex-Findings

### F01 — LLMBase hat keine Absicherung gegen stille Kürzung
Schwere: hoch
Stelle: app/src/main/llm/chatClient.ts:529
Status: [OFFEN]
`resolveContextWindow` gibt auch `llmbase` bis zu 128.000 Token frei (`app/src/shared/contextBudget.ts:73-92`). Die im Plan als Überlaufschutz angeführte Option `transforms: []` wird jedoch ausschließlich für `openrouter` gesetzt (`app/src/main/llm/chatClient.ts:529-534`); LLMBase erhält den normalen Request ohne eine entsprechende Vorgabe (`app/src/main/llm/chatClient.ts:809-819`). Der Code belegt damit nicht, dass ein zu großer LLMBase-Prompt laut scheitert. Wenn LLMBase oder sein Modell-Endpunkt Inhalte kürzt und eine erfolgreiche Antwort liefert, kann der Agent auf unvollständigem Kontext weiterarbeiten.
Vorschlag: Das Überlaufverhalten von LLMBase am echten Endpunkt verifizieren und bis dahin das größere Budget dort nicht freigeben oder eine nachweisbare Vollständigkeitsprüfung einführen.

### F02 — Gleichbleibende Tokenzahl lässt stille Kürzung durch
Schwere: hoch
Stelle: app/src/shared/contextGuard.ts:60
Status: [OFFEN]
`looksTruncated` erkennt nur einen Rückgang um mehr als 10 % oder weniger als 60 % der Zeichen-Untergrenze (`app/src/shared/contextGuard.ts:64-75`). Kürzt ein Endpunkt bei erreichtem Fenster fortlaufend ältere Nachrichten, während `usage.prompt_tokens` ungefähr auf Fensterniveau bleibt, trifft keine Bedingung zu. Der Loop ersetzt dann seine Budgetschätzung durch genau diesen gemeldeten Wert (`app/src/main/noteAgent/loop.ts:393-397`, `app/src/shared/contextBudget.ts:113-129`) und kann weiter lesen und senden, obwohl frühere Inhalte fehlen. Das größere Katalogbudget erweitert den Bereich, in dem diese unbewiesene Vollständigkeit akzeptiert wird.
Vorschlag: Das erwartete Wachstum der gesendeten Historie gegen die nächste Prompt-Token-Meldung prüfen und bei ausbleibendem Wachstum laut abbrechen; die Prüfung mit einem Endpunkt testen, der gleitend kürzt.

### F03 — Cloud-Kürzung meldet fälschlich angefordertes `num_ctx`
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:393
Status: [OFFEN]
Der Loop setzt `numCtx` auch bei Cloud-Läufen auf 32.768 bzw. bei Webrecherche 65.536 (`app/src/main/noteAgent/loop.ts:328-336`), aber der Cloud-Request sendet dieses Feld nicht (`app/src/main/llm/chatClient.ts:809-819`). Bei erkanntem Kürzungsverdacht reicht der Loop den Wert dennoch an `contextTruncationMessage` (`app/src/main/noteAgent/loop.ts:393-394`), das daraus „Angefordert waren 32.768/65.536 Token“ und eine Modellmaximum-Diagnose erzeugt (`app/src/shared/contextGuard.ts:83-93`). Das widerspricht der nun verwendeten Kataloggröße und führt bei Cloud zum falschen nächsten Schritt.
Vorschlag: Für Cloud die tatsächlich verwendete Katalog-/Budgetgröße und ihren unsicheren Ursprung nennen; `requestedCtx` nur für Ollama übergeben.

### F04 — Katalogabruf verzögert Start und reagiert nicht auf Abbruch
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:344
Status: [OFFEN]
Vor der ersten Agent-Anfrage wird der Katalog zwingend abgewartet (`app/src/main/noteAgent/loop.ts:344-376`). Der Katalog-Fetch hat einen eigenen 10-Sekunden-Timeout und erhält das Abbruchsignal des Laufs nicht (`app/src/main/llm/cloudPricing.ts:37-43`); ein Cache-Miss oder abgelaufener Eintrag kann daher jeden Start um bis zu diesen Timeout verzögern, auch wenn der Nutzer in der Zwischenzeit abbricht. Die erste sichtbare Kontext-Spur kommt erst nach dem `await` (`app/src/main/noteAgent/loop.ts:351-355`).
Vorschlag: Katalogabfrage mit dem Lauf-Abbruchsignal verbinden und den Start ohne verfügbaren Cache-Wert mit dem konservativen Fenster fortsetzen; alternativ den Wartezustand sichtbar machen.

### F05 — Fehlgeschlagener Refresh verwendet alten Katalogwert weiter
Schwere: mittel
Stelle: app/src/main/llm/cloudPricing.ts:86
Status: [OFFEN]
Nach sechs Stunden wird ein veralteter Eintrag neu geladen (`app/src/main/llm/cloudPricing.ts:16,86-89`). Scheitert der Abruf, schluckt `ensureCatalog` den Fehler und lässt den bisherigen Cache unverändert (`app/src/main/llm/cloudPricing.ts:92-98`); `getModelContextLength` liefert daraus trotzdem den alten Wert (`app/src/main/llm/cloudPricing.ts:76-84`). Die Aussage „Fehler → null“ in der Aufgabendatei gilt somit nur ohne früheren Cache. Bei einer zwischenzeitlichen Reduktion des verfügbaren Modellfensters behält der Agent ein womöglich zu großes Budget.
Vorschlag: Nach fehlgeschlagenem Refresh keinen abgelaufenen Kontextwert als aktuell zurückgeben oder den Stale-Fallback ausdrücklich begrenzen und kennzeichnen.

### F06 — Höheres Fenster kann die Cloud-Kosten eines Laufs stark erhöhen
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:378
Status: [OFFEN]
Bis zu zwölf, bei Ordner-/Shell-/Rechner-Läufen zwanzig Iterationen senden jedes Mal die gesamte gewachsene Historie erneut (`app/src/main/noteAgent/loop.ts:24-44,369-385`; `app/src/main/llm/chatClient.ts:809-819`). Das neue Fenster erlaubt dafür bis zu 128.000 statt 32.768 Token (`app/src/shared/contextBudget.ts:65-92`); es gibt im Loop nur eine Kontext-, keine Kostenbremse, und `costOfCalls` bilanziert erst beim Abschluss (`app/src/main/noteAgent/loop.ts:478,562`). Ein langer Cloud-Lauf kann daher deutlich mehr bezahlte Eingabetoken verbrauchen, bevor der Nutzer eine Summe sieht.
Vorschlag: Vor weiteren Cloud-Aufrufen eine sichtbare Kostenprognose oder ein konfigurierbares Lauf-Limit auf Basis der bisherigen Usage/Preise prüfen.

## Claude-Antwort

Nachgemessen am Code, alle sechs Belege stimmen. Freigabe durch den Nutzer: F01, F03, F04 (28.10.2026).

- **F01** [ADRESSIERT] — Katalogfenster nur noch für OpenRouter (`CATALOG_BACKENDS` in `app/src/shared/contextBudget.ts`). LLMBase bleibt bei 32 768, bis sein Überlaufverhalten am echten Endpunkt geprüft ist. Test in `contextBudget.test.ts`.
- **F02** [OFFEN] — Lücke ist echt, aber nicht neu (bestand mit 32 768 genauso) und greift nur, wenn ein OpenRouter-Endpunkt trotz `transforms: []` still kürzt UND unter 75 % seines Katalogwerts liegt. Nicht freigegeben; Kandidat für eine eigene Härtung von `looksTruncated` (erwartetes Wachstum prüfen).
- **F03** [ADRESSIERT] — `contextTruncationMessage` bekommt `requestedCtx` nur noch bei Ollama; bei Cloud mit Katalogfenster nennt sie das gerechnete Budget und dass der bedienende Endpunkt vermutlich kleiner ist (`app/src/shared/contextGuard.ts`, Aufruf in `loop.ts`). Test in `contextGuard.test.ts`.
- **F04** [ADRESSIERT] — `catalogContextLength(opts, { timeoutMs, signal })` wartet höchstens `CATALOG_WAIT_MS` = 3 s und reagiert auf den Lauf-Abbruch; danach gilt die Annahme, der Abruf füllt im Hintergrund den Cache weiter (`app/src/main/llm/chatClient.ts`, `loop.ts`). Tests in `app/src/main/llm/chatClient.catalog-context.test.ts`.
- **F05** [OFFEN] — trägt technisch; Kontextfenster schrumpfen selten, die 75 % lassen Luft. Nicht freigegeben.
- **F06** [OFFEN] — bewusster Zielkonflikt, dem Nutzer vorher genannt. Eine Kostenbremse ist eine eigene Funktion mit UI. Nicht freigegeben.

Belege: `npm run typecheck` grün, `npm run test` 231 Dateien / 3173 Tests grün, neuer Testfile 4/4.

## Status

Runde 1 beantwortet (F01/F03/F04 umgesetzt, F02/F05/F06 offen). Abnahme durch den Nutzer ausstehend.
