# Petrol-Chat: Recherche-Ergebnisse weiterverwenden (Chat-Nachfrage und Übergabe an den Agenten)

## Aufgabe

Nutzertest 24.10.2026 (Claude per CDP in der Dev-App, Thema BFSG/BITV für Medienzentren):

1. Web: „Was verlangt das BFSG … gilt es für Volkshochschulen/Medienzentren?“ → gute, belegte Antwort.
2. Web-Nachfrage BITV 2.0 (mit gekürzten Suchwörtern) → sehr gute, belegte Antwort inkl. Widerspruch.
3. OHNE Globus: „Fass das Besprochene als kurze Checkliste … zusammen.“ → Modell: **„Ich habe hier
   im Chat keinen Verlauf“**, dann generische Checkliste aus dem Gedächtnis (inkl. erfundenem „GVG“).
4. „Notiz mit Petrol ausarbeiten“ an Antwort 3 → Agent hat korrekt als ungeprüft markiert, aber
   inhaltlich nur die leere Allgemein-Checkliste.

Ursache (beabsichtigt): Webwechsel gehen nie in den Modellverlauf (F09 in
`docs/codex-collab/chat-websuche.md`; `app/src/renderer/utils/chatHistory.ts:19`), und an
Webantworten gibt es bewusst keinen Agenten-Knopf (F03 in `docs/codex-collab/chat-daraus-erstellen.md`;
`app/src/renderer/components/Agent/PetrolChat.tsx:388`). Folge: **Der natürliche Weg
Recherche → Zusammenfassen/Weiterarbeiten → Agent ist heute unterbrochen.** Im Fenster stehen
zwei Webantworten, das Modell kennt keine.

Gesucht: ein Entwurf, wie recherchierte Inhalte weiterverwendet werden können, **ohne** die
Gründe von F09/F03 zu verletzen. Noch kein Code.

**Maßstab: geringe Halluzination** (Abschnitt „Ziel“ in `chat-websuche.md`): keine Quellennummer ohne
Quelle, nichts, was das Modell nicht gesehen hat, als „belegt“; Anzeige nie stärker als Prüfung.
Dazu Laienverständlichkeit und Datenwege (Cloud-Modell bekäme sonst Webauszüge im Verlauf, F11).

## Kontext/Anker

- Eingefrorene Quellen je Webantwort: `WebSource` (n, Titel, URL, Host, Abrufzeit, **modell-sichtbarer
  Auszug**, gekürzt) + `CitationReport` + `extras` an der Nachricht (`app/src/shared/webChat.ts`,
  `app/src/renderer/stores/petrolChatStore.ts`, Feld `web`). Auszüge sind bereits bereinigt
  (`prepareWebExcerpt`) und je Seite ≤ ~4000 Zeichen.
- Export mit Fußnoten + Prüfhinweisen: `withWebFootnotes` (`app/src/shared/webChat.ts`).
- Agent-Übergabe heute: `applyMakeTask` (PetrolChat.tsx) → `noteAgentStore.setDraft` + `chatHandover`;
  Agent bekommt nur `instruction` (Text), Anhänge sind Vault-Dateien (`attachments`).
- Agenten-Web: Main-geführte URL-Allowlist + Quellen-Vertrag „genau ein Write“
  (`app/src/main/noteAgent/skills.ts`, Webrecherche-Abschnitt in CLAUDE.md).
- Websuche-Prompt: `app/src/main/llm/petrolWebPrompt.ts` („nur aus diesen Auszügen“).

## Ideen (Claude, zur Prüfung — nicht vorentschieden)

A. **Hinweis statt Lösung:** Folgt nach Webwechseln eine Frage ohne Globus, steht über dem Senden:
   „Petrol kennt die Webantworten nicht. Für Nachfragen den Globus einschalten; zum Weiterarbeiten
   ‚Recherche an den Agenten geben‘.“ Billig, löst nichts, verhindert aber falsche Erwartung.
B. **Webantworten ausdrücklich in den Kontext holen (Chat):** Auswahl „diese Recherche einbeziehen“;
   dann geht die Antwort **samt eingefrorenen Auszügen und Quellenliste** als eigener, untrusted
   Kontextblock mit (gleicher Prompt-Vertrag wie die Webantwort: nur daraus, Nummern beibehalten),
   und die neue Antwort wird wieder gegen dieselben Auszüge geprüft. Kosten: Kontextbudget,
   Cloud-Datenweg.
C. **Recherche an den Agenten:** Knopf an Webantworten „Recherche an Petrol-Agent geben …“: übergibt
   Antwort + Quellenliste + Auszüge als **Anhang** (z. B. temporäre Quelldatei im Arbeitsordner des
   Laufs, nicht im Vault), Auftrag „Notiz/Folien daraus, nur aus diesen Quellen, Fußnoten
   beibehalten“; Agent-Ergebnis mit deterministisch angehängtem Quellenblock wie bei der
   Agenten-Webrecherche.
D. **Sammeln:** mehrere Webantworten eines Gesprächs als „Recherchemappe“ zusammenführen, dann B/C.

## Fragen an Codex

1. Welche der Ideen trägt das Ziel geringe Halluzination, welche verlagert nur das Risiko? Was ist
   der kleinste sinnvolle Schritt für jetzt, was gehört in Stufe 2?
2. B: Wie bleiben Nummern und Prüfung stimmig, wenn mehrere Webantworten mit je eigenen [1]–[3]
   zusammenkommen (Neunummerierung, Kollision)? Reicht das 20 000-Zeichen-Budget?
3. C: Wie kommen Auszüge zum Agenten, ohne den Vault zu beschreiben und ohne den Agenten-Web-Vertrag
   (Allowlist, genau ein Write, Quellenblock) zu umgehen? Wie wird das Agenten-Ergebnis an die
   Chat-Quellen gebunden (Fußnoten, Prüfung)?
4. Datenwege: Was muss vor dem Senden sichtbar sein, wenn Webauszüge an ein Cloud-Modell gehen?
5. Was davon braucht ein Laie, ohne das Prinzip „Webantworten sind nicht im Verlauf“ verstehen zu müssen?

Hinweis: Parallel ändert Claude zwei Kleinigkeiten aus demselben Test (lange zusammengesetzte
Suchwörter → Hinweis; Marke „ohne Quellennummer“ bei ehrlichen „steht nicht drin“-Sätzen). Bitte
nicht als Teil dieser Aufgabe prüfen.

## Codex-Findings

### F01 — A verhindert eine falsche Erwartung, „Globus an“ stellt den Bezug aber nicht her
Schwere: mittel
Stelle: app/src/renderer/utils/chatHistory.ts:19-24; app/src/renderer/components/Agent/PetrolChat.tsx:225-235; app/src/renderer/stores/petrolChatStore.ts:191-218; docs/codex-collab/chat-websuche.md:369-386
Status: [OFFEN]

Der Testfehler ist am Code erklärbar: `chatHistoryForModel` entfernt beide Seiten jedes Webwechsels, und die nächste Suche benutzt nur die aktuelle, vom Nutzer sichtbare Query. A ist als sofortiger Hinweis sinnvoll, löst aber die gewünschte Zusammenfassung nicht. Der vorgeschlagene Satz „Für Nachfragen den Globus einschalten“ kann sogar die nächste Enttäuschung auslösen: „Fass das Besprochene zusammen“ sucht dann wörtlich nach diesen Wörtern, ohne BFSG/BITV-Kontext. Vorschlag: neben dem Eingabefeld nach einer Webantwort klar sagen: „Frühere Webantworten werden bei dieser Nachricht nicht mitgelesen. Für eine neue Recherche nenne das Thema erneut und prüfe die Suchwörter.“ Einen allgemeinen, thematisch unabhängigen Chat nicht dauerhaft mit dem Hinweis blockieren; keine Behauptung, der Globus allein erinnere sich.

### F02 — B braucht eine Main-seitig gebundene Quellenauswahl statt Renderer-Text als Beleg
Schwere: hoch
Stelle: app/src/shared/webChat.ts:147-171; app/src/renderer/stores/petrolChatStore.ts:28-45; app/src/renderer/stores/petrolChatStore.ts:207-236; app/src/main/index.ts:6772-6803; app/src/main/index.ts:6910-6916
Status: [OFFEN]

Heute sind Antwort, Auszüge und Bericht nach dem Lauf im Renderer gespeichert; der Main-Handler für `petrol-chat-web` nimmt eine Query entgegen und sucht neu. Ein B-Folgeaufruf müsste sonst vom Renderer gelieferte `WebSource[]` als angeblich selbst abgerufene Seiten akzeptieren. Das widerspricht dem Vertrauensziel „keine Quelle, die die App nicht selbst abgerufen hat“ und macht bei manipuliertem Renderer eine gefälschte Belegbasis möglich. Vorschlag für Stufe 2: ausgewählte Webläufe im Main pro Absender und Gespräch mit opaker Laufkennung und begrenzter Lebensdauer wiederfinden, beim Folgeaufruf nur diese Kennungen annehmen; `isTrustedSender`, Gesprächszuordnung, Löschen/Tabwechsel und Größenlimits durchsetzen. Die genaue, ursprünglich modell-sichtbare Auszugsversion bleibt die Ausgangsbasis (F05/F19); neue Kürzung wird als neue Version sichtbar.

### F03 — Eine alte Webantwort ist kein Quellentext für die neue Zusammenfassung
Schwere: hoch
Stelle: app/src/shared/webChat.ts:147-153; app/src/main/index.ts:6910-6916; app/src/renderer/utils/chatHistory.ts:1-24; app/src/main/llm/petrolWebPrompt.ts:27-53
Status: [OFFEN]

B sagt „Antwort samt Auszügen“ in einen Kontextblock. Die frühere Antwort ist aber bereits Modelltext und kann trotz `CitationReport` ungestützte Sätze enthalten; der Bericht ist Wortvergleich, kein Faktencheck. Werden ihre `[n]` und ihr Wortlaut als gleichrangige Daten mit den Seitenauszügen erneut eingespeist, kann die nächste Antwort eine alte Erfindung paraphrasieren und mit echten Quellennummern ausstatten. Das wäre genau die von F09 verhinderte Aufwertung. Vorschlag: Für die neue belegte Antwort nur die ausgewählten **Auszüge** als Sachbasis verwenden; alte Frage/Antwort höchstens als deutlich getrennten Gesprächswunsch bzw. ungeprüften Entwurf, nie als Beleg. `analyzeCitations` und Zusatzprüfungen für die **neue** Antwort neu ausführen; den alten Bericht nicht als neues Prüfergebnis übernehmen.

### F04 — Nummern aus zwei Webantworten kollidieren zwangsläufig
Schwere: hoch
Stelle: app/src/shared/webChat.ts:388-423; app/src/main/llm/petrolWebPrompt.ts:27-37; app/src/main/index.ts:6913-6916; app/src/shared/webChat.ts:508-529
Status: [OFFEN]

Jede Webantwort nummeriert ihre höchstens drei Quellen neu ab `[1]`. Im Test können BFSG-Quelle `[1]` und BITV-Quelle `[1]` völlig andere Seiten sein. „Nummern beibehalten“ in B/D reicht deshalb nicht; ein gemeinsamer Prompt oder Export mit beiden Karten macht Referenzen mehrdeutig. Auch die Fußnotenfunktion setzt Nummern innerhalb **eines** Berichts um, nicht über mehrere Webläufe. Vorschlag: bei einer ausgewählten Kombination vor dem Modellaufruf ein neues, dichtes Nummernschema erzeugen und eine unveränderliche Zuordnung `(Weblauf, alte Nummer, Auszugsversion) → neue Nummer` für Prompt, neuen Prüfbericht, Anzeige und Export verwenden. Alte Antworten bleiben in ihren Karten unverändert; falls sie als Kontexttext gezeigt werden, ihre alten Zitate nicht als neue gültige Zitate parsen. Deduplizieren nach URL allein ist unsicher, wenn dieselbe Seite zu zwei Zeitpunkten unterschiedliche Auszüge lieferte.

### F05 — Zwei eingefrorene Webantworten passen nicht automatisch ins gemeinsame Budget
Schwere: hoch
Stelle: app/src/shared/webChat.ts:20-47; app/src/shared/webChat.ts:338-378; app/src/main/index.ts:6853-6864; app/src/main/index.ts:6882-6892
Status: [OFFEN]

Eine Webantwort darf bis zu 12 000 Zeichen Quellen enthalten; zwei Antworten können vor Systemtext, Frage und Verlauf bereits 24 000 Zeichen liefern. Der bestehende 20 000-Zeichen-Deckel mit Modellfenster-Reserve gilt nur für den einzelnen `petrol-chat-web`-Lauf. B/D brauchen ein eigenes Budget über **alle ausgewählten** Auszüge. Stilles Weglassen oder erneutes Kürzen würde die neue Prüfung von dem trennen, was in den alten Quellenkarten sichtbar ist; kritische Ausnahmen am Ende können verschwinden. Vorschlag: vor dem Senden Anzahl und Zeichen/Token begrenzen, die tatsächlich neu modell-sichtbaren Auszüge einfrieren und in der Auswahl anzeigen, welche Seiten oder Textteile nicht mitgehen. Wenn beide Themen nicht ausreichend hineinpassen, den Lauf ablehnen oder zur engeren Auswahl auffordern. Die neue Antwort nur gegen die neu eingefrorenen Auszüge prüfen; fehlende Seiten nicht als benutzt markieren.

### F06 — C kann keinen gewöhnlichen Dateianhang „im Arbeitsordner“ nur durch einen Knopf erzeugen
Schwere: hoch
Stelle: app/src/main/noteAgent/contextFiles.ts:27-45; app/src/main/noteAgent/contextFiles.ts:131-165; app/src/main/noteAgent/contextFiles.ts:223-240; app/src/renderer/stores/noteAgentStore.ts:391-399; app/src/main/index.ts:4538-4555
Status: [OFFEN]

Die heutigen Agent-Anhänge sind registrierte vorhandene Dateien mit ID und erneut geprüfter Lesbarkeit. `noteAgentRun` nimmt nur `attachmentIds`; es gibt keinen typisierten In-Memory-Anhang für einen eingefrorenen Weblauf. Eine temporäre Markdown-Datei müsste Main-seitig angelegt, registriert, beim Abbruch/Vault- oder Tabwechsel geräumt und beim Lesen gegen Austausch geschützt werden. `read_attachment` kappt Text zudem bei 15 000 Zeichen, sodass mehrere Auszüge oder Warnungen teilweise fehlen könnten. Ein Pfad im Auftragswortlaut oder eine vom Renderer gewählte Datei wäre kein gleichwertiger sicherer Kanal. Vorschlag für Stufe 2: eigener opaker, Main-eigener Recherchekontext aus den gespeicherten Webläufen mit explizitem Budget und Lebensdauer; nicht als allgemeiner Vault-Anhang tarnen. Das Agentenmodell muss wissen, welche Auszüge es tatsächlich erhalten hat und welche fehlen.

### F07 — Der Agenten-Quellenblock beweist keine Aussagen aus übergebenen Chatquellen
Schwere: hoch
Stelle: app/src/main/noteAgent/skills.ts:1643-1663; app/src/shared/webResearch.ts:438-455; app/src/main/noteAgent/skills.ts:1702-1749; app/src/main/index.ts:4810-4833
Status: [OFFEN]

C setzt „deterministisch angehängter Quellenblock wie bei Agenten-Webrecherche“ mit belegtem Ergebnis gleich. `mergeDeterministicSources` listet aber nur erfolgreich **in diesem Agentenlauf** per `web_fetch` abgerufene URLs; er kennt keine eingefrorenen Chat-Auszüge und prüft keinen Ergebnissatz. Ein beigefügter Webtext ohne neue Abrufe erzeugt daher keinen solchen Block. Werden bloß URLs aus dem Auftrag übernommen und erneut abgerufen, kann die Seite inzwischen anders lauten; das ist eine **neue Recherche**, nicht die alte Belegbasis. Außerdem erlaubt der Webmodus nur bestimmte Writer und genau einen Write, nicht pauschal „Notiz/Folien“ mit Satzprüfung. Vorschlag: für echte C-Übergabe eigener Quellenvertrag mit Snapshot-IDs, kanonischen Auszügen und neuer Prüfung des erzeugten Notiztexts; Quellenblock aus genau den zugelassenen Snapshots deterministisch erzeugen. Für Folien braucht es eine eigene, zur Folienstruktur passende Prüf-/Quellenregel. Bis dahin keine UI-Behauptung „aus diesen Chatquellen belegt“.

### F08 — B/C/D ändern den Datenweg vor dem Senden, nicht erst nach dem Lauf
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:250-269; app/src/renderer/components/Agent/AgentView.tsx:502-528; app/src/main/llm/petrolWebPrompt.ts:27-53; docs/codex-collab/chat-websuche.md:391-401
Status: [OFFEN]

Der Nutzer kann Webseiten lokal mit einem lokalen Modell gelesen haben und später für Zusammenfassung oder Agent einen Cloud-Weg wählen. Dann verlassen die ausgewählten Seitenauszüge, eventuell Chatfragen/-antworten und andere Agent-Anhänge den Rechner **erneut**, diesmal an den Modellanbieter; eine neue Websuche würde zusätzlich Suchwörter und Abrufe auslösen. Die bisherige Cloud-Zeile des Webchats beschreibt nur den damaligen Lauf, nicht diese spätere Übergabe. Vorschlag: vor jeder B/C/D-Ausführung in einfacher Sprache die ausgewählten Recherchen, den konkreten Modellweg, Zahl/Umfang der Auszüge und ggf. erneute Suche anzeigen; Cloud-Feature-Freigabe Main-seitig für den jeweiligen neuen Weg prüfen. „Nur zusammenfassen“ und „neu im Web suchen“ sichtbar trennen; kein automatisches Mitnehmen des gesamten Verlaufs oder stilles Cloud-Routing.

### F09 — D braucht Auswahl und Herkunft je Weblauf, sonst wird die Mappe zum neuen Gedächtnis
Schwere: mittel
Stelle: app/src/renderer/stores/petrolChatStore.ts:28-45; app/src/renderer/stores/petrolChatStore.ts:185-236; app/src/shared/webChat.ts:147-160; app/src/renderer/utils/chatHistory.ts:19-24
Status: [OFFEN]

Eine „Recherchemappe“ aus allen Webantworten des Gesprächs würde erneut alte oder thematisch fremde Ergebnisse als Kontext einschleusen und F09 praktisch umgehen. Die Store-Nachricht kennt zwar Quellen und Bericht, aber kein für eine mehrteilige Mappe bestätigtes Set, keinen gemeinsamen Nummernraum und keine Freigabe für einen späteren Modellweg. Vorschlag: D erst in Stufe 2 als **bewusste Auswahl einzelner fertiger Webantworten** mit sichtbarem Thema, Abrufdatum, Kürzungs-/Prüfstatus und Entfernen-Knopf. Keine automatische Sammlung und keine Übernahme gestoppter/fehlerhafter Läufe; die finale Auswahl wird pro neuem Folgeauftrag erneut bestätigt.

## Urteil und kleinster Schritt

**A trägt nur als ehrlicher Zwischenzustand. B ist die richtige Richtung für belegte Chat-Nachfragen, benötigt aber Main-seitige Snapshot-Bindung, Neunummerierung, gemeinsames Budget und neue Prüfung. C braucht zusätzlich einen eigenen Agenten-Quellenvertrag; der heutige Dateianhang und URL-Quellenblock tragen das nicht. D ist eine spätere Auswahloberfläche für B/C, kein schneller Speichertrick.**

Jetzt: Nach einer Webantwort bei einer Nachricht ohne Globus kurz und konkret erklären, dass die frühere Recherche nicht mitgelesen wird. Daneben eine klar benannte Aktion **„Im Agenten neu recherchieren …“** anbieten: Sie bereitet aus der zugehörigen *Nutzerfrage* einen editierbaren Auftrag vor, benennt ausdrücklich „neue Suche, bisherige Antwort und Quellen werden nicht übernommen“, führt zur bestehenden Auftragskarte und lässt den Nutzer Webrecherche, Modellweg, Ablage und Start sichtbar prüfen. Für den Testfall kann der Nutzer dort BFSG und BITV im Auftrag zusammen nennen. Der Agent nutzt danach seine bestehenden Such-/Abrufgrenzen und seinen Quellenblock für **neu** gelesene Seiten; die App darf das Ergebnis nicht als gegen die alten Chatquellen geprüft ausgeben.

In Stufe 2: zuerst B für **eine** ausdrücklich ausgewählte Webantwort mit dem eingefrorenen Auszug als alleiniger Sachbasis und neuer Satzprüfung; dann mehrere ausgewählte Antworten mit Neunummerierung und Budget (D); C erst nach einem eigenen, Main-seitig gebundenen Agenten-Kontext und einer Prüfung des Ergebnisses gegen genau diese Snapshots. Bei jedem Schritt die tatsächlichen Datenwege vor dem Senden zeigen. Bis dahin bleiben die bisherigen F09/F03-Sperren erhalten.

## Codex-Findings — Runde 2

### F10 — Ollama-Cloud kann Snapshot-Auszüge ohne Main-Freigabe erhalten
Schwere: hoch
Stelle: app/src/main/index.ts:6860-6870; app/src/shared/webChat.ts:107-113; app/src/shared/agentRoute.ts:57-63; app/src/main/index.ts:6718-6731
Status: [OFFEN]

Bei einem in Ollama gewählten Cloud-Modell liefert `classifyAgentRoute` den Weg `ollama-cloud`. `params.cloud` bleibt dabei `null`, weshalb `petrolCloudAllowed` sofort `true` zurückgibt. Der Nachfragezweig schickt anschließend die gespeicherten Auszüge über Ollamas `/api/chat`, das für dieses Modell an ollama.com weiterleitet. Die sichtbare Wegprüfung kann „Cloud“ anzeigen, aber Main verlangt für diesen **tatsächlichen** Cloud-Weg keine gespeicherte Chat-Freigabe. Das ist gerade beim Wechsel von einer lokalen Erstsuche zu Ollama-Cloud eine neue Datenweitergabe.

Vorschlag: Das Gate an `route.kind/provider` binden, nicht nur an `params.cloud`. Für `ollama-cloud` eine ausdrücklich gespeicherte Freigabe für diesen Chatweg prüfen oder die Nachfrage dort sperren; vor dem Senden muss ollama.com als Empfänger der alten Auszüge stehen. Einen Test für lokale Erstsuche → Ollama-Cloud-Nachfrage mit fehlender Freigabe am Handler vorsehen.

### F11 — Zeichenbudget garantiert kein passendes Tokenfenster
Schwere: hoch
Stelle: app/src/main/llm/petrolWebFollowUp.ts:94-115; app/src/shared/webChat.ts:51-65; app/src/main/index.ts:6870-6873; app/src/main/index.ts:6972-6981
Status: [OFFEN]

`resolveFollowUp` misst UTF-16-Zeichen; `webChatCharBudget` und `webChatNumCtx` rechnen pauschal mit drei Zeichen je Token. Bei kurzen Tokens, Tabellen oder CJK-Text kann derselbe eingefrorene Auszug deutlich mehr Tokens brauchen. Für ein Ollama-Modell mit 8192 Tokens lässt der Zeichendeckel fast 20 000 Zeichen zu und `num_ctx` wird bei 8192 gekappt: Ein formal passender Prompt kann tatsächlich überlaufen und von Ollama vorne gekürzt werden — ausgerechnet Systemregel oder Quelle fallen dann still weg. Für LM Studio wird die Kontextlänge gar nicht abgefragt; dort gelten immer 20 000 Zeichen und es wird kein `num_ctx` gesetzt. Die Tests benutzen nur ASCII und prüfen Zeichenlängen (`app/src/main/llm/petrolWebFollowUp.test.ts:119-154`), nicht die tatsächliche Modell-Eingabe.

Vorschlag: Vor dem Modellaufruf ein zur gewählten Laufzeit passendes Tokenbudget ermitteln oder bei nicht bestimmbarer Grenze konservativ ablehnen. Bei Überlauf die Nachfrage mit verständlicher Meldung stoppen; die eingefrorenen Auszüge weder still abschneiden noch als vollständig gelesen anzeigen.

### F12 — Verlaufskürzung kann eine Assistentenantwort ohne Frage stehen lassen
Schwere: mittel
Stelle: app/src/shared/webChat.ts:74-86; app/src/main/llm/petrolWebFollowUp.ts:106-115; app/src/main/index.ts:6965-6969
Status: [OFFEN]

`shortenHistoryToFit` entfernt einzelne alte Nachrichten. Bei Verlauf `[Nutzerfrage, Assistentenantwort]` und Platz nur für die Antwort fällt die Frage weg, die Antwort bleibt als erste Verlaufsnachricht im Prompt. Diese frühere normale Chatantwort kann unbelegte Modellbehauptungen enthalten; ohne ihre Frage wirkt sie wie eigenständiger Kontext neben den eingefrorenen Quellen. Der Test prüft nur einen Fall, in dem zufällig zwei Nachrichten fallen (`app/src/main/llm/petrolWebFollowUp.test.ts:79-95`).

Vorschlag: Beim Budgetieren ganze Gesprächswechsel entfernen und keinen Verlauf mit verwaister Assistentenantwort beginnen lassen. Den Ein-Nachricht-Überhang sowie wechselnde Rollenfolgen testen.

## Claude-Antwort

### Runde 1 (24.10.2026, Nutzer: „bau den kleinsten Schritt“)
Gegengeprüft (Quellen nur im Renderer gespeichert, Nummern je Webantwort ab [1],
`mergeDeterministicSources` nur für Abrufe des Agentenlaufs) — tragen.

- **F01 [ADRESSIERT]** Hinweis im Chat, sobald nach einer Websuche ohne Globus getippt wird:
  „Frühere Webantworten werden bei dieser Nachricht nicht mitgelesen. Für eine neue Recherche
  nenne das Thema erneut und prüfe die Suchwörter.“ (`petrolChat.webNotRemembered`, PetrolChat.tsx).
- **Kleinster Schritt [ADRESSIERT]** Knopf „Im Agenten neu recherchieren …“ an Webantworten (auch
  bei „nichts Lesbares“): Erklärung → Auftragsentwurf nur aus der FRAGE („Recherchiere im Web …
  Stütze jede Sachaussage auf eine abgerufene Seite; Unbelegtes als offen“), Webrecherche
  vorgewählt und sichtbar, Shell/Rechner aus; Übergabe-Hinweis `kind: 'research'` sagt „neu im Web
  — bisherige Antwort und Quellen werden nicht übernommen“. Keine Behauptung, das Ergebnis sei gegen
  die Chatquellen geprüft. GUI per CDP geprüft.
- **F02–F09 [OFFEN, Stufe 2]** B (eine Webantwort ausdrücklich einbeziehen, Main-seitige Snapshots,
  nur Auszüge als Sachbasis, neue Prüfung) → D (mehrere, Neunummerierung, Budget, Auswahl) → C
  (eigener Agenten-Quellenvertrag mit Snapshot-IDs). Datenwege vor jedem Schritt sichtbar (F08).

### Runde 2 (24.10.2026 — geschrieben vom Entwicklungsassistenten pi im Auftrag des Nutzers, nicht von Claude)
Alle drei Findings am Code nachgemessen; der Nutzer hat nur F12 zur Umsetzung freigegeben.

- **F10 [OFFEN: Nutzerentscheidung]** Getragen, aber nicht auf die Nachfrage beschränkt. `petrolCloudAllowed(null, …)`
  gibt `true` (`app/src/shared/webChat.ts:107-114`); das einzige Chat-Gate sitzt in `petrol-chat-web`
  (`app/src/main/index.ts:6867`), der normale Chat hat keins. Ein Ollama-Modell mit Cloud-Tag erreicht
  `ollama.com` also in Chat, Suche und Nachfrage ohne gespeicherte Freigabe; die Anzeige vor dem Senden nennt
  den Empfänger (`PetrolChat.tsx`, `webModelPath`). Eine Sperre oder Pflichtfreigabe für alle Wege ist eine
  Datenschutzregel.
- **F11 [OFFEN: Nutzerentscheidung]** Getragen, vorbestehend (gleicher Weg im Such-Zweig), eher „mittel“.
  Gemessen: `num_ctx` folgt aus 3 Zeichen je Token. Bei 8192 Tokens überläuft dichter Text ab 2,5 Zeichen/Token,
  bei 16k/32k (num_ctx 10240) ab 2. LM Studio kennt gar kein Fenster. Eine vorsichtigere Schätzung kürzt die
  Seitenauszüge für alle.
- **F12 [ADRESSIERT]** Gemessen: `[Frage, Antwort]` mit Platz nur für die Antwort ließ `["assistant"]` stehen.
  `dropLeadingAssistants` (`app/src/shared/webChat.ts`) entfernt verwaiste Antworten in `shortenHistoryToFit`
  (Nachfrage) UND in `applyWebChatBudget` (Such-Zweig, dort stand dasselbe Muster mit `history.shift()`).
  Der alte Test „Verlauf fällt zuerst“ hielt das Fehlverhalten fest und wurde angepasst. Tests:
  `webChat.test.ts` (4 Fälle), `petrolWebFollowUp.test.ts`; per Mutation geprüft.

## Status

Angelegt 24.10.2026 nach Nutzertest; Codex F01–F09. Kleinster Schritt gebaut (uncommittet); F02–F09 = Stufe 2.

### Stufe 2, Schritt B — begonnen 24.10.2026, angeschlossen (uncommittet)
Fertig und verdrahtet: Snapshot-Ablage, Typen, `followUp`-Prompt, Handler-Zweig (Kennung statt
Suche, Auszüge nicht neu gekürzt, Verlauf kürzen sonst ablehnen, Snapshot nur bei zitierter
Antwort, `dropSender` bei destroyed), IPC `petrol-chat-snapshots-drop`, Store, Knopf
„Hiermit weiterfragen“, Chip mit Datenweg vor dem Senden, Hinweis „nicht neu abgerufen“,
ergänzter `oldWebSourceNote`. typecheck grün, Tests der Ablage, des Budgets, des Prompts und
des Stores grün. Keine GUI-Gegenprobe in der laufenden Dev-App. Codex-Prüfung und Nutzerabnahme
offen. Stufe C/D (mehrere Antworten, Agenten-Vertrag) nicht angefasst.

### Schritt B: Nacharbeit nach kritischer Durchsicht (24.10.2026, Entwicklungsassistent pi, nicht Claude)
Eigene Durchsicht des angeschlossenen Codes. Nutzer hat die vier Punkte zur Umsetzung freigegeben und
entschieden: **eine ausgeschaltete Webrecherche sperrt Nachfragen NICHT** (sie sperrt nur neue Suchen;
der Cloud-Weg wird weiter geprüft).

- **Handler-Zweig nicht getestet** — behoben. Die Logik liegt jetzt in
  `app/src/main/llm/petrolWebFollowUp.ts` (`parseFollowUpRequest`, `resolveFollowUp`,
  `measureWithFollowUpRoom`) mit `petrolWebFollowUp.test.ts`: kaputte Kennung wird abgelehnt und läuft
  nie als Suche, fremdes Fenster/Gespräch/unbekannte Kennung ergibt „nicht mehr da“, die Auszüge
  kommen byte-gleich zurück, nur der Verlauf wird gekürzt.
- **Kleine Kontextfenster lehnten die Nachfrage ab** (gemessen: 4096 und 6144 Tokens) — behoben. Die
  erste Antwort misst sich am größeren von Such- und Nachfrage-Prompt plus 400 Zeichen Platz für die
  Frage (`FOLLOWUP_QUESTION_RESERVE_CHARS`). Die Meldung unterscheidet jetzt „Frage zu lang“ von
  „Seiten für das gewählte Modell zu groß“ (z. B. Modellwechsel nach der Antwort). Der Test benutzt
  bewusst eine feste Fragelänge; mit Reserve 0 schlagen genau 4096 und 6144 fehl (per Mutation geprüft).
- **Nachfrage zählte als „Thema einer früheren Webfrage“** — behoben (`webTopicQuestions` überspringt
  `followUp`, Test in `chatHistory.test.ts`).
- **„Erneut senden“ an toter Kennung** — behoben: `WebChatResult.snapshotGone`; ohne Seiten gibt es
  keinen Wiederholen-Knopf, sondern den Hinweis, mit dem Globus neu zu recherchieren.
- Nicht behoben, bewusst: Nachfrage-Ketten sehen die vorige Nachfrage nicht (Webwechsel bleiben aus
  dem Modellverlauf); jede Nachfrageantwort legt eine neue Kennung an (30 je Fenster, ältere fallen
  heraus); „Antwort aus 0 Seiten …“ blitzt kurz beim Start auf; Export nennt die Nachfrage nicht.
- Verifiziert: `tsc` 0 Fehler, `vitest` 2984 grün (ein bekannter Last-Ausreißer `shellExecution`,
  einzeln grün), `electron-vite build` in ein Wegwerfverzeichnis grün. **Nicht in der laufenden App
  geprüft** — dafür braucht es eine Websuche mit zitierter Quelle.
- Die Dev-App muss neu gestartet werden, um diesen Stand zu laden.

Nutzer, 24.10.2026, nach Neustart der Dev-App: „es funktioniert wie es soll“. Der Umfang der Probe ist nicht
einzeln festgehalten, eine förmliche Abnahme und ein Commit sind nicht erklärt. Offen: Codex F10 (Ollama-Cloud ohne
Main-Freigabe) und F11 (Token- statt Zeichenbudget) als Nutzerentscheidungen; Nachprüfung durch Codex für F12.
