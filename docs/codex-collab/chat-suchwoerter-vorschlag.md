# Petrol-Chat-Websuche: Suchwörter vom Modell vorschlagen lassen?

## Aufgabe

Nutzer (24.10.2026): Tavily nimmt höchstens 400 Zeichen je Suche, die App begrenzt auf 250
(`WEB_QUERY_MAX_CHARS`). „Dann wäre doch eine Zusammenfassung des geschriebenen Prompts an Tavily
sinnvoll, sonst kommt vielleicht nur der halbe Kontext an.“

Bitte den Entwurf unten adversarial prüfen, noch kein Code. **Maßstab wie bei der Websuche
(`docs/codex-collab/chat-websuche.md`, Abschnitt „Ziel“): geringe Halluzination.** Hier kommt ein
neuer Punkt dazu: ein Modell bestimmt, welcher Text das Haus (an den Suchanbieter) verlässt und
wonach gesucht wird — es kann Begriffe weglassen, verdrehen oder erfinden, und eine schlechte
Suche führt zu schlechten Seiten, aus denen dann „belegt“ geantwortet wird.

## Kontext/Anker

- Heute: Suchwörter = die Frage, unverändert (`app/src/renderer/components/Agent/PetrolChat.tsx:105`).
  Eine Zeile „Websuche: deine Frage an Tavily · … ändern“ (`:561`); das Feld öffnet sich beim
  Ändern oder wenn die Frage über 250 Zeichen hat (`:109`), dann ist Senden gesperrt bis gekürzt
  (`:110`). Nichts wird still gekürzt (Codex F08 in `chat-websuche.md`).
- Prüfung im Main: `normalizeQuery`/`isQueryTooLong` (`app/src/shared/webResearch.ts:350-361`),
  Handler `petrol-chat-web` (`app/src/main/index.ts:6772`). Renderer liefert Frage + Suchwörter
  getrennt (`PetrolWebRequest` in `app/src/shared/webChat.ts`).
- Verlauf fürs Modell: Webwechsel sind ausgeschlossen (`app/src/renderer/utils/chatHistory.ts`,
  F09), normale Wechsel gehen mit (`app/src/renderer/stores/petrolChatStore.ts:192`).
- Zum Vergleich: Im Agenten wählt das Modell die Suchanfrage selbst (`web_search`,
  `app/src/main/noteAgent/skills.ts:1671-1694`), sichtbar nur im Protokoll.
- Datenwege-Zeile vor dem Senden: `webPathParts` in `PetrolChat.tsx`.

## Beobachtung (Claude)

- Halber Kontext wegen Länge passiert heute nicht still: über 250 Zeichen wird gesperrt.
- Häufiger und unsichtbar: **Nachfragen**. Nach der Rundfunk-Antwort sucht „und was gilt 2027?“
  wörtlich so — ohne Gesprächszusammenhang. Webwechsel stehen außerdem nicht im Modellverlauf.
- Eine lange Frage als Suche liefert ohnehin oft schlechtere Treffer als 5–10 gezielte Wörter
  (Tavily-Hilfe empfiehlt kurze, gezielte Suchen).

## Entwurf (Rev. 1)

**V1 — Vorschlag sichtbar vor dem Senden (empfohlen):**
1. Kurze, eigenständige Frage (≤ ~120 Zeichen, kein vorheriger Wechsel): wie heute, Frage = Suche.
2. Lange Frage (> 120 Zeichen) oder Nachfrage im laufenden Gespräch: beim Einschalten des
   Globus (bzw. beim ersten Senden-Versuch) erzeugt das gewählte Chat-Modell Suchwörter aus der
   Frage und den letzten 2–4 nicht-Web-Nachrichten. Sie stehen im Feld „Suchwörter“ mit Marke
   „vorgeschlagen“; der Nutzer sieht/ändert sie und sendet. Gesendet wird exakt der Feldinhalt.
3. Eigener kleiner IPC `petrol-chat-suggest-query` (Main): fester Systemtext („nur Suchbegriffe,
   max. 12 Wörter, keine Fakten ergänzen, nur Begriffe aus Frage/Verlauf, Sprache der Frage“),
   Ausgabe einzeilig, Main kürzt/validiert auf 250 Zeichen; Fehler/Zeitüberschreitung → Frage
   bleibt Vorschlag. Kein Ollama-Vordergrund-Problem? Abbruch bei Globus aus/Tippen.
4. Datenwege: läuft das Modell in der Cloud, steht in der Zeile, dass Frage + Verlauf schon für den
   Vorschlag an den Cloud-Anbieter gehen (nicht erst beim Senden).
5. Determinismus-Leitplanke: Wörter im Vorschlag, die weder in Frage noch Verlauf vorkommen, werden
   im Feld markiert (oder abgelehnt?).

**V2 — automatisch ohne Zwischenschritt (verworfen?):** Modell formuliert, App sucht sofort und
zeigt hinterher „gesucht nach: …“. Bequemer, aber verletzt F08 (Text verlässt das Haus ungesehen).

## Fragen an Codex

1. Trägt V1 das Ziel geringe Halluzination, oder verschiebt es das Risiko nur (Modell-Suchwörter
   steuern, welche Seiten „Beleg“ werden)? Was muss technisch gelten (Leitplanke 5, Längen, Sprache)?
2. Auslöser: Länge > 120 und „Nachfrage“ — wie erkennt man eine Nachfrage robust? Oder immer
   vorschlagen, sobald es einen Verlauf gibt?
3. Privatsphäre: Der Vorschlag holt Verlaufstext in die Suchwörter, die an den Suchanbieter gehen.
   Wie verhindert man, dass persönliche Details aus früheren Nachrichten in der Suche landen,
   ohne F08 („die App behauptet nicht, private Wörter zu entfernen“) zu verletzen?
4. Bedienung: Wartezeit (lokales 27B-Modell), Abbruch, was wenn der Nutzer währenddessen tippt;
   bleibt es bei „eine Zeile“, wenn kein Vorschlag nötig ist?
5. Gibt es eine einfachere Lösung, die dasselbe erreicht (z. B. nur Nachfragen mit der letzten
   Nutzerfrage verketten, ohne Modell)?

## Codex-Findings

### F01 — Die Länge wird heute abgewiesen, nicht halb an Tavily gesendet
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:104-113; app/src/renderer/components/Agent/PetrolChat.tsx:214-229; app/src/renderer/components/Agent/PetrolChat.tsx:549-580; app/src/shared/webResearch.ts:78; app/src/shared/webResearch.ts:349-360; app/src/main/index.ts:6794-6799
Status: [OFFEN]

Die Ausgangsannahme „nur der halbe Kontext kommt an“ trifft für lange Suchwörter im jetzigen Webchat nicht zu: über 250 Unicode-Codepoints wird Senden im Renderer gesperrt und im Main erneut abgelehnt. `normalizeQuery` trimmt nur. Die Chatfrage bleibt davon getrennt und geht später vollständig in die Modellfrage. Eine Modell-Zusammenfassung löst also nicht einen stillen Kürzungsfehler, sondern wäre eine neue Wahl, **welche Begriffe Treffer und damit die spätere Belegbasis bestimmen**. Vorschlag: Problem im UI als „Suchwörter zu lang – bitte gezielt kürzen“ benennen; die Modellvariante nur an einem gemessenen Bedarf für schlechte Treffer oder Nachfragen messen, nicht mit einem vermeintlichen 400-Zeichen-Überlauf begründen.

### F02 — V1 verfehlt gerade Nachfragen nach einer Webantwort
Schwere: hoch
Stelle: app/src/renderer/utils/chatHistory.ts:19-24; app/src/renderer/stores/petrolChatStore.ts:191-218; app/src/renderer/components/Agent/PetrolChat.tsx:104-109; docs/codex-collab/chat-websuche.md:369-386
Status: [OFFEN]

V1 will die letzten 2–4 **nicht-Web**-Nachrichten für den Vorschlag verwenden. `chatHistoryForModel` entfernt aber Frage **und** Antwort jedes Webwechsels (bewusst wegen F09). Nach einer Webantwort auf „Rundfunkbeitrag 2026“ sieht der Vorschlagslauf zu „Und was gilt 2027?“ den maßgeblichen Bezug gerade nicht; ältere nicht-Web-Nachrichten können sogar ein anderes Thema liefern. F09 darf nicht durch Rückgabe der alten Webantwort mit `[n]` an ein Modell umgangen werden. Vorschlag: Für einen ausdrücklichen Nachfragen-Kontext höchstens die letzte **Nutzerfrage bzw. die damals tatsächlich gesendeten Suchwörter** des Webwechsels als Textkandidat verwenden, nie alte Webantwort, Quellennummern oder Seiten. Diese Übernahme vor dem Senden sichtbar machen und vom Nutzer ändern lassen. Ist der Bezug nicht eindeutig, bei der aktuellen Frage bleiben und zum Ergänzen auffordern.

### F03 — V1 kann private Verlaufsinhalte in zwei neue Datenwege ziehen
Schwere: hoch
Stelle: app/src/renderer/utils/chatHistory.ts:17-24; app/src/renderer/components/Agent/PetrolChat.tsx:181-195; app/src/renderer/components/Agent/PetrolChat.tsx:555-580; app/src/main/webResearch/providers.ts:39-45; app/src/main/webResearch/providers.ts:98-118; docs/codex-collab/chat-websuche.md:391-401
Status: [OFFEN]

Normale Chatnachrichten können Namen, Termine, Mailinhalte oder andere private Angaben enthalten. V1 würde 2–4 solcher Nachrichten schon **beim Globus-Klick** an das gewählte Vorschlagsmodell geben; bei Cloud verließen sie den Rechner vor dem bisherigen Senden. Gelangen Wörter daraus in den Vorschlag, gehen sie anschließend an Tavily/Linkup oder die SearXNG-Instanz und ggf. deren Upstreams. Ein Label „vorgeschlagen“ oder ein allgemeiner Datenwege-Satz reicht nicht, wenn der Nutzer die Übernahme aus alten Nachrichten nicht veranlasst und die kompakte Ein-Zeilen-Ansicht den exakten Text nicht zeigt. F08 verbietet zudem ein unbelegtes Versprechen automatischer Bereinigung. Vorschlag: Vorschlag aus Verlauf nur auf ausdrücklichen Klick nach klarer Angabe „Frage und ausgewählter Kontext gehen jetzt an <Modellweg>“; den fertigen Suchtext **immer geöffnet** vor dem Suchanbieter-Versand zeigen. Verlaufskontext einzeln vom Nutzer auswählen oder auf die sichtbare aktuelle Frage beschränken; keine automatische Übernahme privater Wörter behaupten.

### F04 — Stilles Kürzen eines Modellvorschlags widerspricht F08
Schwere: mittel
Stelle: app/src/shared/webResearch.ts:78; app/src/shared/webResearch.ts:349-360; app/src/main/index.ts:6794-6799; app/src/main/noteAgent/skills.ts:1684-1691; docs/codex-collab/chat-websuche.md:360-367
Status: [OFFEN]

V1 nennt im Main „kürzt/validiert auf 250 Zeichen“. Der heutige Suchpfad und F08 verlangen aber **Ablehnung** statt stiller Kürzung. Ein abgeschnittener Vorschlag kann gerade die einschränkende Jahreszahl, Region oder Verneinung am Ende verlieren; anschließend sucht die App nach einem anderen Thema und liefert dafür scheinbar passende Quellen. Die 12-Wörter-Regel garantiert die Zeichengrenze ebenfalls nicht (lange Eigennamen/URLs). Vorschlag: Modellantwort nur trimmen und auf eine Zeile bringen, dann Leere, Codepoint-Länge und Ausgabeformat prüfen. Zu lang, mehrdeutig oder ungültig heißt sichtbarer Fehler mit manuell editierbarem Suchfeld; niemals automatisch den Anfang als endgültige Anfrage übernehmen.

### F05 — Wortherkunft beweist keine richtige oder vollständige Suche
Schwere: hoch
Stelle: app/src/main/index.ts:6829-6833; app/src/main/llm/petrolWebChat.ts:89-106; app/src/shared/webChat.ts:186-217; docs/codex-collab/chat-websuche.md:11-22
Status: [OFFEN]

Die V1-Leitplanke „nur Wörter aus Frage/Verlauf“ erkennt neue Namen, aber keine falsche **Auswahl oder Kombination** vorhandener Wörter. Stehen im Verlauf mehrere Orte, Jahre oder Personen, kann das Modell die falschen kombinieren; es kann „nicht“, ein Datum oder einen Ausnahmefall weglassen. Danach zieht der Main die ersten Treffer genau dieser Query heran. Der spätere Wortvergleich prüft Aussagen nur gegen diese bereits ausgewählten Seiten, nicht ob die Suche die Nutzerfrage abdeckt. Vorschlag: Wortherkunft höchstens als Warnsignal verwenden. Frage und Vorschlag nebeneinander zeigen und wichtige Einschränkungen (insbesondere Jahr, Ort, Person, Negation) vor Übernahme sichtbar vergleichen; bei fehlender eindeutiger Zuordnung keinen automatisch akzeptierten Vorschlag. Eine markierte Abweichung darf nicht als „privat bereinigt“ oder „inhaltlich geprüft“ bezeichnet werden.

### F06 — Der Vorschlagslauf braucht einen eigenen, abbruchbaren Zustand
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:103-113; app/src/renderer/components/Agent/PetrolChat.tsx:214-229; app/src/renderer/components/Agent/PetrolChat.tsx:537-573; app/src/renderer/stores/petrolChatStore.ts:126-135; app/src/renderer/stores/petrolChatStore.ts:175-204; app/src/main/index.ts:6772-6783
Status: [OFFEN]

Heute gibt es im Store nur `webArmed` und `webQuery`; `setDraft` und `setWeb` schreiben ohne Vorschlagskennung. Eine beim Globus-Klick gestartete Modellantwort kann später eintreffen, nachdem der Nutzer die Frage geändert, Suchwörter manuell bearbeitet, den Globus ausgeschaltet oder das Gespräch gelöscht hat. Würde sie dann das Feld überschreiben, könnte eine veraltete Query versendet werden, obwohl die Vorschau einmal richtig aussah. Ein lokales 27B-Modell kann diese Zwischenphase merklich verlängern; ein Cloud-Aufruf hat eigene Kosten und Datenwege. Vorschlag: eigener IPC mit `isTrustedSender`, Main-seitigem Cloud-Feature-Gate, Eingabe- und Ausgabelimits sowie kurzem Timeout; Laufkennung und AbortController pro Absender. Im Renderer Frage, ausgewählten Kontext, Modellweg und Bearbeitungsstand als Version erfassen; nur bei unverändertem Stand einsetzen, manuelle Eingabe nie überschreiben, bei Globus aus/Tabwechsel/Neues Gespräch abbrechen, nie automatisch danach senden. Lokale Erzeugung als Ollama-Vordergrund erfassen.

### F07 — Der Auslöser „> 120 Zeichen oder Nachfrage“ ist kein verlässliches Signal
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:104-113; app/src/renderer/components/Agent/PetrolChat.tsx:555-580; app/src/renderer/utils/chatHistory.ts:39-51; docs/codex-collab/chat-websuche.md:60-77
Status: [OFFEN]

Eine 121-Zeichen-Frage kann bereits gute Suchbegriffe enthalten; eine knappe „Und 2027?“ ist ohne Vorgeschichte unbrauchbar. „Nachfrage“ lässt sich aus der Länge oder der Existenz eines Verlaufs nicht sicher ableiten. Ein automatischer Vorschlagslauf bei jedem vorhandenen Verlauf macht aus dem bisher schlanken Globus unnötig eine zweite Modellrunde und kann die falsche alte Frage heranziehen. Vorschlag: keinen automatischen Längen-/Nachfragen-Klassifikator für Stufe 1. Den bisherigen direkten Weg für kurze, eigenständige Fragen behalten; bei zu langen Fragen das sichtbare Suchfeld öffnen. Für Nachfragen eine ausdrückliche Aktion „Vorherige Websuche als Kontext übernehmen“ anbieten, die letzte **gesendete Query oder Nutzerfrage** mit der aktuellen Frage in einem editierbaren Feld zusammenstellt und bei über 250 Zeichen zur Kürzung auffordert. Kein Modell, keine zusätzliche Cloud-Anfrage und keine Suche vor der sichtbaren Freigabe.

### Urteil und kleinste Lösung

V1 trägt **in der vorliegenden Form nicht**: Es kann den Web-Nachfragenkontext wegen F09 nicht sehen, verschiebt Quellenwahl auf ein Modell und schafft vor dem eigentlichen Senden einen neuen Datenabfluss. V2 ist wegen unsichtbarer Query-Wahl mit F08/F11 und dem Halluzinationsziel unvereinbar. Der kleinere Schritt ist F07: die heutige explizite Suchwortbearbeitung beibehalten und nur eine **vom Nutzer gewählte, sichtbare Übernahme der letzten Webfrage/Query** für Nachfragen ergänzen. Soll später dennoch ein optionaler Modellvorschlag kommen, gelten F02–F06 als technische und UX-Voraussetzungen; er ersetzt die vom Nutzer überprüfte Query nie automatisch.

## Claude-Antwort

### Runde 1 (24.10.2026)
Gegengeprüft, alle tragen (F02 am Code: `chatHistoryForModel` entfernt Webwechsel). Nutzer hat
den kleinen Weg ohne Modell gewählt (Urteil/F07). V1 und V2 werden nicht gebaut.

- **F07 [ADRESSIERT]** Gab es im Gespräch eine Websuche, zeigt die Zeile „vorige Suche
  übernehmen“; ein Klick setzt die damals GESENDETEN Suchwörter + neue Frage ins sichtbare Feld
  (`lastSentWebQuery`, `followUpQuery` in `app/src/shared/webChat.ts`, Tests in `webChat.test.ts`).
  Kein Modell, keine Antwort/Quelle aus dem alten Wechsel, nichts gekürzt; über 250 Zeichen
  greift die bestehende Sperre mit Hinweis. GUI per CDP geprüft.
- **F01 [ADRESSIERT]** durch Verzicht: keine Zusammenfassung, Sperre bei Überlänge bleibt.
- **F02–F06 [ABGELEHNT: entfällt]** — betreffen nur den Modellvorschlag (V1), der nicht gebaut
  wird; gelten als Voraussetzungen, falls er später doch kommt.

## Status

Angelegt 24.10.2026, Entwurf Rev. 1 geprüft (F01–F07). Kleiner Weg ohne Modell gebaut (uncommittet), Abnahme durch Nutzer offen.
