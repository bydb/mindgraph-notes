# Quellenbelegter Chat über den ganzen Vault — Implementierungsplan

Stand: 2026-09-18, **Rev. 3** nach dem adversarialen Review durch Codex (`docs/codex-collab/vault-chat-plan-review.md`, F01–F18 vom 17.09., Nachprüfung mit F19–F22 vom 18.09., alle gegen den Code bestätigt) und mit **Phase 4 (Notiz-Agent)** als Ausblick. Rev. 1 und 2 vom 17.09. sind überholt; geänderte Entscheidungen tragen den Vermerk „(Rev. 2, Fxx)“ bzw. „(Rev. 3, Fxx / Rückfrage n)“. Vorbild-Struktur: `web-research-plan.md`, `note-agent-harness-plan.md`.

## Worum es geht

Der Nutzer stellt im Notiz-Chat eine Frage an **alle** seine Notizen und bekommt eine Antwort mit **prüfbaren Quellenangaben**: Jeder inhaltliche Satz trägt eine Fußnote auf Datei und Textstelle, ein Klick öffnet die Stelle, und die App prüft deterministisch, was sie deterministisch prüfen kann: ob die Quellennummer gültig ist, ob ein wörtliches Zitat im Original steht, wie hoch die Wortdeckung zwischen Satz und Stelle ist, und ob ein Satz überhaupt eine Quelle nennt. **Sie behauptet nicht, dass ein Satz wahr oder aus der Stelle logisch abgeleitet ist** (Rev. 2, F08). Das Versprechen lautet: Du siehst bei jedem Satz, worauf er sich stützt, und du siehst, wenn er sich auf nichts stützt.

Auslöser war der Vergleich mit Iris.ai (17.09.2026). Der Unterschied soll bleiben, dass bei uns Beleg und Prüfung im Code sichtbar sind und alles lokal läuft.

## Ausgangslage (gegen den Code geprüft)

Ein Drittel existiert als **Projekt-RAG** (opt-in Modul `project-rag`, `uiStore.ts:581`):

- **Engine** rein und prozessübergreifend in `shared/rag/{types,chunking,similarity}.ts`. Chunking markdown-bewusst, 1200 Zeichen, 200 Überlappung (`chunking.ts:28–30`, `chunkMarkdown` ab :114). **Die Chunks tragen heute keine Quellspannen**: Absätze werden getrimmt, Leerzeilen rekonstruiert, Überlappung per `slice()`, Mini-Chunks verschmolzen. Ein Chunk ist deshalb nicht zwingend ein zusammenhängender Substring des Originals (F01).
- **Main-Seite** in `main/rag/`: `embed.ts` (hart `http://localhost:11434`, :12; `embedText` mit internem Timeout-Controller ohne fremdes `AbortSignal`, :24 ff.; `embedBatch` hält alle Ergebnisse als `number[][]`, :66), `index.ts` (JSON-Index pro Projekt, Slug plus Hash, `ragIndexPath` :38; Build-Lock :173; inkrementell über mtime, `buildOrUpdateIndex` :179), `retrieve.ts` (`DEFAULT_MIN_SCORE 0.3` :23 **mit Top-1-Fallback** :76–82; `DEFAULT_KEYWORD_WEIGHT 0` :29, gemessen am 06.06.2026; `buildRagPrompt` :117 setzt Notizinhalt roh unter die Systemregeln und verlangt `[[Dateiname]]`-Zitate).
- **IPC** `project-rag-query` (`main/index.ts:7375`) und `project-rag-answer` (:7388, streamt `-chunk/-done/-sources`, `think:false`). **Der Handler nimmt Embedding- und Chat-Modell als Strings vom Renderer** und prüft nicht auf Cloud-Tags (F11). Die Preload-Abonnenten rufen `removeAllListeners` (`preload.ts:376–394`), Ereignisse tragen keine Request-ID (F17).
- **Oberflächen**: NotesChat `ContextMode 'project'` (`NotesChat.tsx:62`), Quellenliste nach dem Streaming (:310, :352–358); Dashboard `ProjectStatusPanel/ProjectRagModal.tsx` (Index-Build nur auf Klick, :111); Telegram `project_ask`; Workflow-Node `project.rag`.
- **Eval-Harness** `app/scripts/rag-eval.ts` (Hit@1/3/5, Recall@5, MRR über Dateitreffer; keine Antwort- oder Zitatstruktur).
- **Sync**: `.mindgraph/rag/` ausgeschlossen (`fileTracker.ts:109`). Der Sync-Code dokumentiert selbst, dass mtime als Änderungsbeweis versagt hat (real 09.06.2026, `fileTracker.ts:10–23`); dort gilt der Inhalts-Hash.
- **Umfeld**: Genau ein Datei-Watcher im Main (`watch-directory`, `main/index.ts:6708`), beim Vault-Wechsel geschlossen, Ereignisse gehen an den Renderer. Kein gemeinsamer Ollama-Zustand über die Aufrufer hinweg (F05). `isCloudModel` existiert (`shared/modelCompatibility.ts:1046`) und wird von Brain und Workflow-Runner als Sperre genutzt. Kategorie-Erkennung liegt im Renderer (`renderer/utils/noteKind.ts`), die allgemeine `getNoteKind` ist locker, nur `getNoteKindFromTitleStrict` ist strikt (F12).

Was heute **fehlt**:

1. **Reichweite.** Der Chat-Modus „Alle“ nimmt **die ersten 50 Notizen der Liste** (`NotesChat.tsx:393–395`). Kein Retrieval.
2. **Belege.** Keine Zuordnung Satz → Quelle, keine Prüfung, keine Markierung fehlender Quellen.
3. **Textstelle anspringen.** Keine Fähigkeit „Notiz an Stelle X öffnen“ im Renderer.
4. **Speicherformat.** JSON mit Zahlen als Text (Smart-Connections-Cache: 101 MB für 4995 Notizen auf Notiz-Ebene).

**Maßzahlen des realen Vaults** (17.09.2026): 4995 Notizen, 14,85 Mio. Zeichen Markdown, grob **15.000 Chunks**. Float32 bei 1024 Dimensionen: **61 MB** Vektoren. Drei E-Mail-Ordner (681 + 125 + 60 Notizen) mit teils identischen Inhalten.

## Beschlossener Stand (Rev. 3)

### A. Einverständnis, Reichweite, Modelle

1. **Ort: NotesChat, neuer Kontextmodus `vault`, ersetzt „Alle“.** Sichtbarkeit des Modus über das Modul `project-rag` (Label wird „Notizen befragen (RAG)“).
   **Eigenes Opt-in pro Vault** (Rev. 2, F06): Das Modul-Flag reicht nicht als Einverständnis für einen Vollscan über 5000 Notizen. Der Index entsteht nur nach der ausdrücklichen Aktion „Vault-Index erstellen“ mit angezeigtem Umfang (Dateien, geschätzte Chunks, geschätzte Dauer aus einer Stichprobe). Zustand `vaultRag.enabled` und `vaultRag.excludeFolders` liegen in `vault-settings.json` (Vault-Eigenschaft); Build-Fortschritt, Pause und Checkpoints liegen gerätelokal in `userData`. Migration setzt `enabled` nie auf `true`. Abschalten oder Vault-Wechsel **stoppt den Job**, nicht nur die Anzeige.

2. **Vertrag v1: einzelne Vault-Frage, kein Verlauf** (Rev. 2, F14). Der Handler bekommt genau eine Frage. Jede Antwort behält ihr eigenes Quellen-Snapshot. Folgefragen mit Pronomen („und danach?“) werden in v1 nicht aufgelöst; der Chat sagt das in der Legende. Eine spätere Frage-Umformulierung aus den letzten zwei Zügen darf nur die **Suchanfrage** verändern, nie Belege aus früheren Antworten liefern.
   **Verlauf getrennt halten** (Rev. 3, F22): Der normale Chat schickt die letzten zehn Nachrichten aus demselben Zustand und kann sie über einen Cloud-Anbieter senden. Vault-Antworten enthalten Notiz- und Mail-Text und dürfen deshalb **nie** in einen späteren Cloud-Verlauf geraten. Nachrichten tragen `origin: 'vault-rag'` und `vaultPath`; der Verlaufsaufbau des normalen Chats schließt alle `vault-rag`-Nachrichten aus, unabhängig vom Anbieter (nicht nur bei Cloud, damit ein späterer Anbieterwechsel keine Lücke öffnet). Beim Quellenklick wird `vaultPath` mit dem aktiven Vault verglichen, sonst öffnet `fileRel` nach einem Vault-Wechsel eine gleichnamige fremde Datei. Integrationstest mit synthetischem Marker: Vault-Antwort, Modus- und Anbieterwechsel, nächste Frage; der Marker fehlt im ausgehenden Payload. Verbindlich vor der Chat-Integration in Phase 2.

3. **Privacy: lokal, Main-seitig erzwungen** (Rev. 2, F11). `localhost:11434` allein sperrt Ollama-Cloud-Modelle nicht (`:cloud`/`-cloud` laufen über denselben Port, die Inferenz läuft bei Ollama). Deshalb: Der Main liest Embedding- und Chat-Modell **aus `ui-settings.json`** (wie der Shell-Handler sein Flag), nicht aus Renderer-Strings, und lehnt beide mit `isCloudModel` fail-closed ab. Eigener Modell-Override `vault-rag` in den Einstellungen, Präzedenz `moduleModelOverrides['vault-rag']` → `selectedModel`; ist das Ergebnis ein Cloud-Tag oder kein Ollama-Modell, antwortet der Handler mit einer Fehlermeldung, die ein lokales Modell verlangt. Kein stiller Fallback auf ein anderes Modell.
   **Prüfung über Metadaten, nicht nur über den Namen** (Rev. 3, F21): `isCloudModel` ist eine Namensheuristik. Ollama weist Cloud-Modelle in `/api/tags` zusätzlich über `remote_model`/`remote_host` aus; der Parser `parseOllamaModels` (`main/ollamaCapabilities.ts:35`) verwirft diese Felder heute. Neue Main-Funktion `resolveLocalModel(name)`: liest `/api/tags`, findet den exakt aufgelösten Eintrag, lehnt ab bei Cloud-Suffix **oder** Remote-Metadaten **oder** wenn der Eintrag fehlt oder mehrdeutig ist. Nicht auflösbar heißt nicht lokal. Die Sperre sitzt an **beiden** Rollen und an der **gemeinsamen Embedding-Grenze** (`embed.ts`), damit `project-rag-index`, `project-rag-query` (bettet über `ensureIndex` auch Notizen ein) und interne Verbraucher sie nicht umgehen. Alle drei Projekt-RAG-Handler werden umgestellt, nicht nur `project-rag-answer`. Tests: neutral benanntes Modell mit Remote-Metadaten, Cloud-Modell an index/query/answer, kein Notiztext verlässt den Prozess vor erfolgreicher Prüfung; Fixtures für Ollama-Versionen mit und ohne die Felder.

### B. Index

4. **Ein Container pro Vault und Embedding-Identität, atomar** (Rev. 2, F02, F03). Statt zwei Dateien eine Binärdatei `.mindgraph/rag/vault-<slug>--<hash12>.ragbin`: Header (Magic, Formatversion, Generation, Chunk-Zahl, Dimension, Byte-Längen, Prüfsumme), danach Metadaten-Block (JSON, längenpräfixiert), danach der Float32-Block. Geschrieben als Temp-Datei, per `fsync` gesichert, per `rename` umgeschaltet: **ein** Rename, also atomar. Eine Abfrage arbeitet auf dem im Speicher geladenen Snapshot und wird von einem Swap nicht berührt. Beim Laden werden Längen und Prüfsumme geprüft; passt etwas nicht, gilt der Index als fehlend (kein Raten). Verwaiste Temp-Dateien werden beim Start entfernt.
   **Identität** = Slug plus Hash über (Modellname, Ollama-Digest, Dimension, `RAG_VAULT_INDEX_VERSION` inkl. Chunking-Version, Ausschlusskonfiguration). **Der Digest kommt aus `/api/tags`** (Rev. 3, F20): `ShowResponse` von `/api/show` enthält keinen Digest, `ListModelResponse` schon; `parseOllamaModels` muss ihn durchreichen. Fehlt der Digest, gilt die Identität als ungültig und der Handler lehnt ab, kein Rückfall auf den Tag allein. Der Digest wird **vor und nach** dem Build sowie **vor und nach** jeder Frage-Einbettung geprüft, erst dann läuft Cosine (Abschlussprüfung 18.09.); ein Modellwechsel während des Laufs verwirft den Lauf, statt einen gemischten Index zu veröffentlichen. Regressionstest in Phase 1. Weicht beim Laden oder bei der Frage-Einbettung etwas ab (anderer Digest nach `pull`, andere Dimension), wird **nicht** verglichen, sondern ein Voll-Rebuild angeboten. Tests mit realistischen `tags`-Fixtures, fehlendem Digest und Digest-Wechsel im laufenden Build.

5. **Chunk-Text im Index, Spannen aus dem Chunker, Frische über Hash** (Rev. 2, F01; ersetzt Rev. 1 „Text aus der Datei“). Ein mtime-Treffer beweist nichts; der Sync hat das real gezeigt. Deshalb:
   - `chunkMarkdown` wird so umgebaut, dass es auf einer **kanonischen Zeichenfolge** arbeitet (BOM entfernt, CRLF → LF) und pro Chunk `sourceStart`/`sourceEnd` (UTF-16-Indizes in der kanonischen Folge) plus `startLine` liefert. Getrimmte Ränder, Überlappung und Mini-Chunk-Verschmelzung werden als Spanne über das Original abgebildet, nicht als neu zusammengesetzter Text. `RAG_INDEX_VERSION` steigt; die kleinen Projekt-Indizes werden einmal neu gebaut.
   - Pro Datei `sourceHash` (SHA-256 der kanonischen Folge), pro Chunk `chunkHash`. Der **Chunk-Text wird im Index gespeichert** (rund 15 MB) und ist die Grundlage für Prompt, Hover und Prüfung.
   - Vor Prompt, Hover und Klick wird die Datei gelesen und ihr Hash mit `sourceHash` verglichen. Stimmt er, sind Text und Spanne gültig. Stimmt er nicht, wird **nie** mit alten Offsets in den neuen Text geschnitten: Die Datei wird synchron neu gechunkt, der Chunk per `chunkHash` relokalisiert; gelingt das nicht, fällt der Treffer aus dem Kontext heraus, die Antwort zeigt „Quelle hat sich geändert“, und die Datei kommt in die Index-Warteschlange.
   **Relokalisierung nur bei eindeutigem Treffer** (Rev. 3, Rückfrage 1): Zwei identische Passagen derselben Datei tragen denselben `chunkHash`. Alle Treffer werden geprüft; bei mehr als einem Treffer wird **kein** erster gewählt, der Chunk gilt als nicht relokalisierbar. Eine Einfügung kann Chunk-Grenzen verschieben, obwohl die Passage noch existiert; das führt dann zu „Quelle hat sich geändert“, eine unscharfe Suche gibt es in v1 nicht. Nach erfolgreicher Relokalisierung werden Hash, Spanne, Zeile und Überschrift aus demselben frisch gelesenen Snapshot übernommen und die aktiven Filter erneut geprüft. Fällt nach der Frischeprüfung der letzte Treffer weg, endet der Handler ohne Modellaufruf mit „Keine passende Quelle gefunden“ (genauer als „im Vault nicht vorhanden“). Der einmal ausgegebene Antwort- und Quellentext bleibt unverändert; eine spätere Frischeprüfung aktualisiert nur den angezeigten Quellenzustand.
   **Koordinatenvertrag**: `sourceStart`/`sourceEnd` beziehen sich auf die **vollständige kanonisierte Datei einschließlich Frontmatter**; Embedding-Chunks dürfen Frontmatter auslassen. Invariante, in Tests erzwungen: `canonical.slice(start, end) === chunk.text`. Die Navigation (Entscheidung 16) bildet diese Koordinaten auf den tatsächlich geladenen Editor- oder Vorschautext ab, statt BOM-, CRLF- oder Frontmatter-Verschiebungen zu übergehen.
   - Tests: gleiche mtime und Größe bei anderem Inhalt, CRLF↔LF, BOM, Frontmatter-Änderung ohne Body-Änderung, wiederholter Absatz, doppelte Überschrift, Restore aus Backup; identischer Chunk zweimal in einer Datei, unveränderte Passage bei verschobenen Chunk-Grenzen, erfolgreicher Umzug mit aktualisierter Überschrift, alle Treffer nach Frischeprüfung verworfen.

6. **Indexer: streamend, unterbrechbar, mit Checkpoints** (Rev. 2, F04). Neuer `main/rag/vaultIndexer.ts`, nicht `embedBatch`:
   - Dateien werden in Paketen von 20 verarbeitet; **das Paket ist die Checkpoint-Einheit, nicht die Scheduling-Einheit** (Rev. 3, Rückfrage 2). Chunking und Hashing pro Paket mit `setImmediate`-Grenzen, damit der Main-Thread atmet. Liegt der gemessene Event-Loop-Lag im Build über 50 ms, wandern Chunking und Hashing in einen `utilityProcess` (Entscheidung nach Messung in Phase 1, nicht vorher).
   - Vektoren landen sofort in einem wachsenden Segment (Float32Array-Blöcke à 1024 Chunks), nie als `number[][]`-Vollbestand.
   - `embedText` bekommt ein optionales `AbortSignal`, das bis in `fetch` reicht. **Pause wird vor jedem einzelnen Embedding-Request geprüft**, nicht erst an Paketgrenzen; begrenzte Parallelität (3). Beginnt ein Vordergrund-Aufruf, startet der Indexer keinen weiteren Request; bereits laufende Requests werden abgebrochen und später wiederholt (ihr Timeout liegt bei 60 s, das wäre sonst die Pausenlatenz). **Abbrechen** bricht laufende Requests ab.
   - **Checkpoints referenzieren dauerhaft geschriebene Staging-Segmente** (Rev. 3, F19): Nach jedem Paket werden Vektoren und Chunk-Metadaten des Pakets als Segmentdatei mit Längen und Prüfsumme nach `userData/rag-staging/<identität>/` geschrieben, erst danach wird der Checkpoint (`erledigte Dateien mit Hash`, Segmentliste) atomar veröffentlicht. Ein Neustart lädt die Segmente und gleicht die erledigten Dateien erneut per Hash ab: unverändert und weiterhin zulässig → übernommen; inzwischen geändert → neu eingebettet; gelöscht oder jetzt ausgeschlossen → entfernt. „Nur das unvollständige letzte Paket wiederholen“ gilt ausschließlich für unveränderte, zulässige Dateien (Abschlussprüfung 18.09.). Die Identität des Checkpoints bindet Vault, Modell-Digest, Format- und Chunking-Version und Ausschlusskonfiguration; passt etwas nicht, wird das Staging verworfen. Staging-Dateien liegen getrennt von den Commit-Temps, damit die Startbereinigung sie nicht löscht. Test mit echtem Prozessneustart: fertige unveränderte Dateien brauchen keine neuen Embeddings, der Container enthält danach alle erwarteten Chunks.
   - Gemessen und im Plan als Zahl festgehalten (Rev. 3): Dauer Voll-Build, Peak-RSS des Main, Event-Loop-Lag und Reaktionszeit der Oberfläche während Build und Swap.

7. **Ollama-Koordination: klein, ehrlich benannt** (Rev. 2, F05). Es gibt keinen gemeinsamen Busy-Zustand über alle Ollama-Aufrufer. Eingeführt wird ein Main-seitiger Zähler `ollamaActivity` (Vordergrund-Aufrufe melden `begin()`/`end()`), den der Indexer vor jedem Embedding-Request abfragt (Abschlussprüfung 18.09.: die Paketgrenze ist nur Checkpoint-Einheit). **Instrumentiert werden in Phase 1**: `ollama-chat`, `project-rag-answer`, `vault-rag-answer`, Mail-Analyse, Brain-Konsolidierung, Notiz-Agent-Läufe (über die Registry). **Nicht abgedeckt in v1** und so dokumentiert: Telegram-Agent, Workflow-Runner, Smart-Connections-Embeddings aus dem Renderer. `begin()`/`end()` laufen über `try/finally` mit idempotenter Freigabe, damit Fehler und Abbrüche den Zähler nicht hängen lassen; der Indexer zählt sich selbst nie als Vordergrund. Die Einstellungs-Oberfläche formuliert (Rev. 3, Rückfrage 2): „Pausiert vor dem nächsten Embedding-Aufruf, solange Chat, Mail-Analyse, Brain oder Notiz-Agent laufen; ein laufender Aufruf kann noch enden. Telegram, Workflows und Smart Connections sind ausgenommen.“ Konkurrenztest gehört zur Phase-1-Abnahme: Vordergrund startet **mitten** in einem großen Paket, es werden keine neuen Hintergrund-Requests gestartet, Wiederaufnahme erst nach Ende aller erfassten Läufe. „Kein Chat-Timeout“ allein genügt nicht.

8. **Watcher und Lebenszyklus** (Rev. 2, F16). Kein zweiter Watcher. Der bestehende `watch-directory`-Watcher bekommt im Main einen Fanout: Neben dem Renderer speist er eine Index-Warteschlange mit normalisierten `add`/`change`/`unlink`-Ereignissen (Rename erscheint als unlink + add). Die Warteschlange wird 30 s entprellt, während Build oder Pause **gesammelt, nicht verworfen**, und nach jedem Commit gegen einen frischen Dateisnapshot abgeglichen. Vault-Wechsel, Modul-Aus, Fenster-Neuladen und App-Quit brechen Job und Timer ab. Eine gemeinsame Funktion `isIndexable(relPath)` gilt für Vollscan **und** Watcher: `.mindgraph`, `.trash`, `.sync-trash`, versteckte Ordner, „Templates“, `vaultRag.excludeFolders`, Dateien unter 200 Zeichen netto. E-Mail-Notizen bleiben drin.

9. **Metadaten für Filter, im Shared-Modul** (Rev. 2, F12). Pro Chunk zusätzlich `kind` (🔴🟢🔵 oder leer), `dateValue` und `dateSource` (`frontmatter` | `filename` | `mtime`). Die reine Erkennung (Frontmatter-Feld, strikter Titel-Marker, Zeitstempel-ID im Dateinamen) zieht nach `shared/noteKind.ts`; `renderer/utils/noteKind.ts` re-exportiert sie, damit es eine Quelle bleibt. Ordnerfilter sind normalisierte, vault-relative Präfixe. Zeitfilter ist ein **expliziter Bereich** in Ortszeit; eine Sortierung „neueste zuerst“ gibt es nur innerhalb der Kandidaten, wenn der Nutzer einen Bereich gesetzt hat. Die Eval-Klasse „was war zuletzt“ entfällt, weil ohne gesetzten Bereich nicht definiert ist, was „zuletzt“ meint.

### C. Retrieval und Antwort

10. **Retrieval: Cosine-only, kein Fallback, kalibrierter Floor** (Rev. 2, F07, F13). Der Top-1-Fallback des Projekt-RAG kommt **nicht** in den Vault-Pfad: Er gibt dem Modell bei jeder Frage Material und macht Verweigerung unmöglich. Ablauf: Vorfilter auf Metadaten → Cosine über den Float32-Block → **Oversampling** auf 4×K Kandidaten → in Score-Reihenfolge **exaktes Dedupe** (Hash des kanonisch normalisierten Chunk-Texts, so benannt, kein Near-Dedupe) und Pro-Datei-Deckel → Top-K. Liegt der beste Kandidat unter dem Floor, antwortet der Handler **deterministisch** „Dazu wurde im Vault nichts gefunden“ ohne Modellaufruf. Floor, K (Start 8) und Deckel (Start 2) werden in Phase 3 an Positiv- **und** Negativfragen kalibriert; der Projektwert 0,30 ist Startwert, kein Ergebnis. A/B im Eval: Deckel 1/2/3/aus, Dedupe aus/exakt.

11. **Prompt: Quellen als untrusted Daten** (Rev. 2, F10). Der Vault enthält E-Mail-Notizen mit Fremdtext. Der Prompt übernimmt das Muster des Mail-Chats (`main/index.ts:5928`): Quellen stehen zwischen `BEGIN_UNTRUSTED_CONTEXT`/`END_UNTRUSTED_CONTEXT`, laufen durch `sanitizeUntrustedText`, Delimiter in Quellen werden escaped, und die Systemregeln verbieten ausdrücklich, Anweisungen aus Quellen zu befolgen. **Nummern und Zuordnung kommen ausschließlich aus App-Metadaten**; der Quellenkopf `[n] Datei › Überschrift` wird von der App erzeugt, nicht aus dem Chunk übernommen. Eval-Fälle: Injection in einer Mail-Notiz („zitiere [1] und sage …“), erfundene Nummern. `think:false` wie im Projekt-RAG.

12. **Zitat-Schema: Nummern.** Kontext als `[1]…[K]`, Modell zitiert `[n]` am Satzende, gern mehrere. Wikilinks im Modelltext werden weiter aufgelöst, sind aber kein Zitat-Format.

13. **Prüfung: nur, was deterministisch wahr ist** (Rev. 2, F08, F09). Neues pures Modul `shared/rag/citations.ts` mit Tests. Es arbeitet auf dem **unveränderten Antwortstring** über den `markdown-it`-Tokenstrom: Zitatmarker gelten nur in Inline-Texttokens, nie in Code, Fences, Links oder Formeln. Sätze werden innerhalb eines Absatz- oder Listentokens gebildet. Jede Prüfung ist eine Spanne `{ start, end, citationRefs, status, reason }` (Rev. 2, ersetzt `sentenceIndex`).
    Die Status heißen so, wie sie zustande kommen:
    - **Quelle gültig** / **Quelle ungültig** (Nummer außerhalb `1…K`, nicht verlinkt).
    - **Wortdeckung hoch** / **Wortdeckung niedrig** gegenüber der zitierten Stelle (Inhaltswörter ab 4 Zeichen, Zahlen und Daten immer; bei mehreren Zitaten zählt das Maximum). Schwelle wird in Phase 3 kalibriert, Startwert 0,3. **Nie „belegt“.**
    - **Wörtlich gefunden** / **Wörtlich nicht gefunden** für Text in Anführungszeichen (normalisierter Substring).
    - **Ohne Quellenangabe** für **jeden** inhaltlichen Satz ohne `[n]`, nicht nur für Sätze mit Zahlen. **Ausnahme nur für vollständige, alleinstehende Segmente aus einer kleinen exakten Liste** (Rev. 3, Rückfrage 3) nach eng definierter Normalisierung (Leerraum, abschließende Interpunktion): „Kurz gesagt:“ allein bleibt neutral, „Kurz gesagt: Das Budget beträgt 10.000 Euro.“ und „Zusammengefasst ist das Projekt beendet.“ werden markiert. Kein `startsWith`, kein Klassifikator. Die Verweigerung ist eine vom Main erzeugte strukturierte Antwortart, keine Textausnahme; ein vom Modell angehängter Satz erbt sie nicht. Beide Beispiele sind Tests in Phase 2.
    Die Legende im Chat sagt: „Die App prüft Quellennummern, wörtliche Zitate und Wortdeckung. Sie prüft nicht, ob eine Aussage wahr ist oder aus der Stelle folgt.“ Ein Entailment-Prüfer (LLM-Richter) ist **nicht** Teil von v1; falls später, nur separat gemessen und mit eigener Unsicherheitsangabe.

14. **Antwortformat strukturiert.** Chat-Nachricht mit `citations: { n, fileRel, heading, sourceHash, sourceStart, sourceEnd, startLine, fresh }[]` und `checks[]` (Spannen, siehe 13). Rendering als Fußnoten mit Farbpunkt über bestehende Farb-Tokens, keine Emojis. „Als Notiz speichern“ schreibt `[^n]`-Fußnoten mit Wikilink, die Status-Kürzel als Fußnoten-Zusatz und den Provenienz-Callout. Roundtrip-Tests: gerenderter Chat, Kopieren, Speichern, erneutes Rendern.

15. **Streaming mit Request-ID, gezieltes Unsubscribe, Abbruch** (Rev. 2, F17). Jede Antwort und jeder Build bekommt eine `requestId`; **jedes** Ereignis (`chunk`, `sources`, `done`, `progress`, `error`) trägt sie, der Renderer ignoriert fremde IDs. Die neuen Preload-Funktionen geben eine Unsubscribe-Funktion zurück statt `removeAllListeners`. Eigener IPC `vault-rag-cancel` mit Main-seitigem `AbortController`; Aufräumen bei `webContents`-Zerstörung. Der Projekt-RAG-Pfad wird auf dasselbe Muster gehoben, sobald der Vault-Pfad steht.

16. **Textstelle öffnen: Ziel ist Hash plus Spanne, nicht die Überschrift** (Rev. 2, F15). Navigationsziel `{ fileRel, sourceHash, sourceStart, sourceEnd, startLine, requestId }`. Der `tabStore` hält eine ausstehende Navigation **gebunden an Notiz-ID und Request-ID**; sie wird erst konsumiert, wenn der Editor den Inhalt mit passendem Hash geladen hat. CodeMirror-Modi: Selection setzen und `EditorView.scrollIntoView`. Lesen-Modus: `markdown-it` setzt beim Rendern Quellzeilen-Attribute (`token.map`), gescrollt wird zum Block, der `startLine` enthält. Bei Hash-Abweichung oder fehlender Stelle: **sichtbarer Hinweis „Quelle wurde geändert“** und Notiz oben öffnen. Kein stiller Sprung nach oben. Test mit doppelter Überschrift.

17. **Erst messen, dann tunen, mit Holdout** (Rev. 2, F18). Zwei getrennte Fragensätze: `rag-eval.vault-tune.json` (Kalibrierung von Floor, Support-Schwelle, K, Deckel) und `rag-eval.vault-holdout.json` (nur Endmessung). Jeder Satz mit 20 Positivfragen in zwei Klassen (thematisch, wörtlich) und 8 Negativfragen, deren Antwort nicht im Vault steht. Metriken: Hit@1/3, MRR; **No-answer Precision und Recall**; pro Satz Zitat-Abdeckung, gültige Nummern, wörtliche Zitat-Integrität; False-Green (hohe Deckung bei von Hand als nicht gestützt bewertetem Satz) und False-Red. Handbewertung an 20 Antworten wird **vor** der Schwellenwahl eingefroren, Abweichungen zwischen zwei Bewertungsdurchgängen dokumentiert. `rag-eval.ts` bekommt `--scope vault` und eine Antwort-/Zitatstruktur.

18. **Nicht in v1 (bewusst):** Graph-RAG, Mehrfachsuche durch einen Agenten, HyDE, Reranker (gemessen ohne Nutzen), Near-Dedupe (MinHash), Entailment-Prüfer, Verlauf/Folgefragen, Wiederverwendung des Smart-Connections-Caches, Telegram- und Workflow-Anbindung, Dashboard-Widget.

## Datenfluss

```
„Vault-Index erstellen“ (Opt-in pro Vault, Umfang angezeigt)
  → vaultIndexer (Main): Pakete à 20 Dateien
      kanonisieren (BOM, CRLF) → chunkMarkdown mit Spannen → sourceHash/chunkHash
      → embedText(signal) in kleinen Batches → Float32-Segmente
      → Checkpoint pro Paket; Pause vor jedem Request, wenn ollamaActivity > 0
  → Container-Datei temp → fsync → rename (ein Swap)
  Watcher-Fanout → Index-Warteschlange (30 s, gesammelt) → inkrementeller Commit

Frage im NotesChat (Modus vault, Filter Ordner/Kategorie/Zeitraum)
  → IPC vault-rag-answer(vaultPath, query, filters, requestId)
  → Main: Modelle aus ui-settings.json, isCloudModel → Ablehnung
  → Vorfilter (meta) → Cosine (Float32) → 4×K → Dedupe exakt + Deckel → Top-K
  → unter Floor: deterministisch „nichts gefunden“ (kein Modellaufruf)
  → Frischeprüfung je Chunk (sourceHash; sonst relokalisieren oder auslassen)
  → Prompt: Systemregeln + BEGIN_UNTRUSTED_CONTEXT [1]…[K] END_UNTRUSTED_CONTEXT
  → Ollama /api/chat (think:false, stream, AbortController)
  → Ereignisse mit requestId → Renderer
  → Ende: citations.ts über den Tokenstrom → checks[] als Spannen
  Klick auf Fußnote → Navigation { fileRel, sourceHash, Spanne, requestId }
```

## Phasen

### Phase 1 — Container, Indexer, Koordination, Lebenszyklus (ohne Chat-Oberfläche)

- `shared/rag/chunking.ts`: kanonische Folge, Spannen, `chunkHash`; `RAG_INDEX_VERSION` hoch; Tests aus Entscheidung 5.
- `shared/rag/vaultIndex.ts`: Container-Format (Header, Prüfsumme), Metadaten-Typen, Identitäts-Hash, `isIndexable`, Filter-Prädikate; Tests inkl. abgeschnittener und korrupter Datei.
- `shared/noteKind.ts`: reine Erkennung (Frontmatter, strikter Titel, Datum aus Dateiname); Renderer re-exportiert.
- `main/rag/vaultIndexer.ts` (Pakete, Segmente, Checkpoints, Pause/Abbruch, `AbortSignal` in `embedText`), `main/rag/vaultStore.ts` (Laden mit Validierung, atomarer Swap, Temp-Bereinigung), `main/rag/ollamaActivity.ts` (Zähler mit `try/finally`, Instrumentierung der sechs Vordergrundpfade), `main/rag/localModel.ts` (`resolveLocalModel` über `/api/tags` mit Digest und Remote-Feldern; `parseOllamaModels` reicht `digest`, `remote_model`, `remote_host` durch), Staging-Segmente und Checkpoints, Watcher-Fanout und Warteschlange in `main/index.ts`. Alle drei Projekt-RAG-Handler und `embed.ts` erhalten die Modellprüfung.
- IPC `vault-rag-status`, `vault-rag-build` (start/pause/cancel), `vault-rag-query`; alle Ereignisse mit `requestId`; Unsubscribe-Funktionen im Preload.
- Einstellungen (Rev. 2, F18: **Übersetzungen in Phase 1**, `settingsPages.ts`): Opt-in-Karte mit Umfangsschätzung, Fortschritt, Pause/Abbrechen, Ausschlussordner (`ChipSelect`), Indexgröße, Alter, Modell-Override `vault-rag` mit Cloud-Sperre-Hinweis.

**Akzeptanz (gemessen, nicht geschätzt):** Voll-Build über 4995 Notizen läuft mit Fortschritt; Zahlen für Dauer, Peak-RSS, Event-Loop-Lag und Reaktionszeit stehen in Rev. 3. Pause und Abbruch wirken innerhalb eines Pakets. Neustart setzt am Checkpoint fort. Eine Notizänderung führt nur zur Neu-Einbettung dieser Datei. Crash zwischen Temp und Rename hinterlässt den alten Index unversehrt. Korrupter oder abgeschnittener Container wird als fehlend erkannt. Modellwechsel mit anderem Digest löst Rebuild-Angebot aus, kein Cosine. Konkurrenztest Build + Mail + Brain + Chat: kein Chat-Timeout. Vault-Wechsel während Build stoppt den Job. Abfrage ohne Frage-Embedding unter 100 ms, mit unter 2 s. Cloud-Tag oder Remote-Metadaten als Chat- oder Embedding-Modell werden an Index, Query und Answer abgelehnt, auch bei manipuliertem IPC-Aufruf, und kein Notiztext verlässt den Prozess vor der Prüfung. Prozessneustart mitten im Build: keine erneuten Embeddings für fertige Dateien, Container vollständig. Digest fehlt oder wechselt im Lauf: Ablehnung bzw. Verwerfen des Laufs. Pause greift vor dem nächsten Embedding-Request, nicht erst nach dem Paket.

### Phase 2 — Zitate, Prüfung, Oberfläche

- `shared/rag/citations.ts` mit Tests (Tokenstrom, Spannen, Nummern, Anführungszeichen, Umlaute, Zahlenformate, Datumsformate, Listen, Code-Blöcke, vorhandene `[n]` in Code).
- Prompt-Variante Vault (untrusted-Delimiter, Nummern, Verweigerungsformel, „nur das Ergebnis“).
- IPC `vault-rag-answer` mit Streaming, `vault-rag-cancel`, Quellen-Ereignis mit `citations[]`; Frischeprüfung und Relokalisierung.
- NotesChat: Modus `vault` mit Filterleiste, Fußnoten, Legende, Hover-Textstelle, „Als Notiz speichern“ mit `[^n]`; Modus „Alle“ entfällt. Übersetzungen in `translations.ts`.
- Navigation zur Textstelle (Entscheidung 16) in allen drei Editor-Modi.

**Akzeptanz:** Ungültige Nummern sichtbar und nicht verlinkt. Jeder inhaltliche Satz trägt einen Status. Injection-Fall aus dem Eval führt nicht zu einem als „Wortdeckung hoch“ markierten Fremdbefehl im Antworttext (die Quelle steht im Kontext, der Befehl darf nicht in der Antwort auftauchen; falls doch, ist er als solcher erkennbar). Kein Klick landet still oben: Entweder die Stelle, oder der Hinweis „Quelle wurde geändert“. Panel schließen bricht den Main-Fetch ab. Paralleles Projekt-Modal und Vault-Chat vermischen keine Ereignisse. Marker-Test aus Entscheidung 2: Eine Vault-Antwort erscheint nach Modus- und Anbieterwechsel nicht im ausgehenden Payload. Die beiden Überleitungs-Beispiele aus Entscheidung 13 werden korrekt markiert.

### Phase 3 — Filter, Messung, Feinschliff

- Tuning- und Holdout-Set, `--scope vault`, Metriken aus Entscheidung 17; Kalibrierung Floor / Support / K / Deckel nur auf dem Tuning-Set, Endzahlen vom Holdout in Rev. 3 und Memory.
- A/B Deckel und Dedupe; Konkurrenz- und Lebenszyklus-Tests als dauerhafte Testfälle.
- CHANGELOG-Eintrag in Nutzerfassung mit der ehrlichen Formulierung aus Entscheidung 13.

### Phase 4 — Notiz-Agent: `vault_search` und geprüfte Quellen in `write_note` (nach Abnahme von Phase 1–3)

Ausgangslage (gegen den Code geprüft, 18.09.2026): Der Notiz-Agent sucht heute mit `note_search`, einem Adapter auf das Telegram-Werkzeug (`main/noteAgent/skills.ts:583`), **rein nach Stichworten** und mit leerem `embeddingModel`. Semantisch verwandte Notizen findet er nicht. Quellen landen als Wikilink in `run.sources`, ohne Textstelle und ohne Prüfung. Der Agent läuft über den einheitlichen Chat-Client (`main/llm/chatClient.ts:5`), der neben Ollama auch OpenRouter und LLMBase bedient; das Cloud-Routing ist per `CloudFeatureId 'note-agent'` freischaltbar (`main/index.ts:4279`).

**Die Suche erbt die Sperren, der Lauf nicht.** Ein lokales Embedding macht den Agent-Lauf nicht lokal: Die gefundenen Passagen stehen im nächsten Modellaufruf und verlassen mit einem Cloud-Modell den Rechner; über `web_search` könnten sie in Suchanfragen wandern, über `generate_image` in einen Bildprompt. Deshalb gilt für Phase 4:

1. **`vault_search` nutzt denselben Index, dieselbe Frischeprüfung (Entscheidung 5) und dieselbe lokale Modellprüfung an der Embedding-Grenze (Entscheidung 3).** Zusätzlich beschränkt auf die **erlaubten Ordner des Agent-Laufs**: Ohne Ordner-Anhang durchsucht das Werkzeug den ganzen Vault nur, wenn der Nutzer den Lauf ausdrücklich als „Vault-Recherche“ startet (Schalter in der Macher-Leiste, analog Globus für Web). Ergebnisse kommen als untrusted Block mit App-erzeugten Quellenköpfen (Entscheidung 11).
2. **Vault-Recherche erzwingt ein geprüftes lokales Antwortmodell für den gesamten Lauf.** Der `note-agent-run`-Handler löst das Chat-Modell über `resolveLocalModel` auf; ist Cloud-Routing für `note-agent` aktiv oder das Modell nicht lokal, startet der Lauf nicht (Fehlermeldung, kein stiller Fallback). Muster: die Ausschlussregel Shell × Web (`main/index.ts:4326`). **Ausgeschlossen im selben Lauf**: `web_search`, `web_fetch`, `generate_image` und jedes weitere Werkzeug, das Text an einen externen Dienst sendet, **ausdrücklich auch die Agent-Shell**, sofern ihre Netzsperre nicht technisch erzwungen ist (Abschlussprüfung 18.09.). Die Allowlist wird im Main gebaut, nicht aus Renderer-Params.
3. **Stabile Quellenkennungen über mehrere Suchaufrufe.** Jeder Treffer bekommt eine laufweite Kennung `S1, S2, …`, die an `(fileRel, sourceHash, chunkHash)` gebunden ist; derselbe Chunk in einem zweiten Aufruf trägt dieselbe Kennung. Das Modell zitiert `[S3]`, nie Dateinamen. `run.sources` hält Kennung, Datei, Spanne und Hash.
4. **Zuerst `write_note`.** Beim Schreiben läuft `shared/rag/citations.ts` über den Notiztext mit den Kennungen des Laufs: gültige Kennungen werden zu `[^Sn]`-Fußnoten mit Wikilink und Textstelle, ungültige bleiben sichtbar als „Quelle ungültig“, Sätze ohne Kennung erhalten „ohne Quellenangabe“ als Fußnoten-Zusatz; die Status-Legende steht im Provenienz-Callout. Der deterministische Quellenblock wird vom Main erzeugt (Muster Webrecherche 0e), nicht vom Modell. **Tabellen, DOCX, HTML folgen separat**, jedes Format mit eigenem Beleg-Vertrag.
5. **Nicht in Phase 4**: Telegram-`note_search` (bleibt Stichwortsuche), Workflow-Runner, Folgeaufträge über mehrere Läufe.

**Akzeptanz:** Vault-Recherche-Lauf mit Cloud-Routing wird abgelehnt, bevor ein Modellaufruf stattfindet. Marker-Test: ein synthetischer Marker aus einer Vault-Passage erscheint in keinem Payload an **externe** Dienste (Web, Bild, Cloud); der geprüfte lokale Ollama-Aufruf darf und muss den Quelltext enthalten. Zwei `vault_search`-Aufrufe mit überlappenden Treffern liefern identische Kennungen. Eine geschriebene Notiz enthält für jede gültige Kennung eine Fußnote mit Textstelle; erfundene Kennungen sind sichtbar. Eval: dieselben Holdout-Fragen als Agent-Aufträge „Schreibe eine Notiz zu …“, gemessen wird Zitat-Abdeckung und Anteil ungültiger Kennungen.

## Umsetzungsstand Phase 1 (18.09.2026)

Gebaut nach Freigabe; Regressionstests, `typecheck`, `test` und `build` grün. Messwerte am Ende dieses Abschnitts.

**Rein und getestet (`shared/`)**
- `shared/rag/chunking.ts` — kanonische Folge, Spannen, Surrogat-sichere Schnitte, kurzer erster Chunk wandert in den nächsten; 19 Tests inkl. Invariante `canonical.slice(start, end) === text`, CRLF/BOM/Frontmatter, doppelte Passage, doppelte Überschrift, verschobene Grenzen.
- `shared/rag/vaultIndex.ts` — Container (Header mit drei CRC32, Meta, Float32), inkrementelle CRC, Identität, `isIndexable`, Filter, `cosineRow`; 20 Tests inkl. abgeschnitten, angehängt, gekipptes Byte in Meta/Vektoren/Header, falsches Magic, unausgerichteter Puffer.
- `shared/noteKind.ts` — Kategorie-Kern (strikt) und Notiz-Datum mit Herkunft; Renderer re-exportiert. 9 Tests.

**Main (`main/rag/`)**
- `localModel.ts` — `resolveLocalModel` über `/api/tags` (Digest, `remote_model`/`remote_host`), Cache 15 s, `fresh`; 8 Tests inkl. neutral benanntes Remote-Modell, Digest-Wechsel nach pull, Ollama nicht erreichbar.
- `embed.ts` — `AbortSignal` bis in `fetch`, `EmbeddingAbortedError`, Modellprüfung **an der gemeinsamen Embedding-Grenze** (deckt Projekt-RAG index/query/answer mit ab).
- `ollamaActivity.ts` — Vordergrund-Zähler mit idempotentem Ende; instrumentiert: `ollama-chat`, `email-analyze`, `brain-consolidate-day`, `project-rag-answer`, `vault-rag-query`, Notiz-Agent (`runRegistry.startRun/finishRun`). 6 Tests.
- `vaultStore.ts` — Pfade, Laden mit Validierung ohne zweite Kopie, atomares Schreiben (Temp → fsync → ein Rename), Temp-Bereinigung, Staging-Segmente + Checkpoint; 8 Tests.
- `vaultIndexer.ts` — Pakete à 20 als Checkpoint-Einheit, Pause **vor jedem Request**, Abbruch laufender Requests bei Vordergrundbeginn mit Wiederholung, Staging-Segmente vor Checkpoint, Resume mit Hash-Abgleich (geändert → neu, gelöscht → raus), Digest vor und nach dem Build, inkrementeller Modus; 9 Integrationstests mit gemocktem Ollama (Voll-Build, Identität, Digest-Wechsel, Abbruch + Wiederaufnahme, geänderte/gelöschte Dateien, inkrementell, Vordergrund mitten im Paket, Nutzer-Pause).
- `vaultRetrieve.ts` — Vorfilter, Cosine, Oversampling, exaktes Dedupe, Pro-Datei-Deckel, Floor ohne Fallback, Digest vor und nach der Frage-Einbettung, Frischeprüfung mit eindeutiger Relokalisierung; 7 Tests.
- `vaultRagManager.ts` — Opt-in pro Vault in `vault-settings.json` (Main-seitig RMW), Status, Umfangsschätzung, Build-Steuerung, Watcher-Warteschlange (30 s, gesammelt während Build), Abfrage mit Stale-Nachzug.
- `index.ts` — IPC `vault-rag-status/config-set/estimate/build/build-control/query`, Watcher-Fanout in `watch-directory`, `unwatch-directory` und `before-quit` stoppen den Job; `project-rag-answer` prüft das Chat-Modell lokal. `preload.ts`: Abonnenten geben Unsubscribe zurück.

**Renderer**
- `Settings/VaultIndexSection.tsx` (Einstellungen → KI → Vault-Index, nur bei Modul `project-rag` und Ollama): Opt-in, Modell, Index-Stand, Umfang schätzen, Erstellen/Neu aufbauen, Fortschritt mit Pause/Fortsetzen/Abbrechen, Ausschlussordner, Hinweis zur Pausen-Abdeckung. Übersetzungen de/en in `settingsPages.ts`.
- `vaultSettingsStore` schreibt fremde Schlüssel mit (sonst löschte ein Feature-Toggle das Opt-in). Modul-Label „Notizen befragen (RAG)“.

**Nacharbeiten nach eigener Durchsicht des Managers (18.09.2026, nach der Messung)**
1. **Ausschlussordner gelten sofort für Abfragen** (`vaultRetrieve.ts:rankCandidates` mit `excludeFolders`, `vaultRagManager.ts:query`). Vorher lieferte ein neu ausgeschlossener Ordner bis zum Neuaufbau weiter Quellen. Neu freigegebene Ordner kommen erst mit dem Neuaufbau in den Index; die Abfrage meldet dafür `excludeMismatch`.
2. **Doppelstart-Sperre** über die gesamte Startphase (`starting`-Flag): zwei gleichzeitige Starts erzeugen genau einen Job.
3. **Obergrenze der Warteschlange** (`queueMaxWaitMs`, 5 min): dauerndes Schreiben setzte den 30-s-Timer sonst endlos zurück.
4. **Konfiguration eifrig beim Vault-Wechsel** geladen; ohne bekanntes Opt-in nimmt der Watcher-Fanout nichts an.
5. **Symlink-sicherer Vault-Vergleich** (`vaultAliases` mit resolve + realpath): ein Klick mit dem gespeicherten Pfad bricht den Job des Watchers nicht mehr ab.
Dazu `vaultRagManager.test.ts` (12 Tests, gemockter Indexer, echter Speicher, echte Abfrage): Konfiguration mit Erhalt fremder Schlüssel, Opt-in-Pflicht, Doppelstart, Pause/Fortsetzen/Abbrechen, Abschalten bricht ab, Vault-Wechsel bricht ab, Symlink kein Abbruch, Warteschlange (Filter, inkrementell, Obergrenze, Sammeln während des Laufs), Ausschluss bei Abfrage, veraltete Treffer in die Warteschlange, Fehlerfälle.

**Werkzeug**: `npm run vault:bench -- --vault <pfad>` (Headless-Messlauf); `scripts/run-ts.mjs` biegt `electron` auf einen Stub um — davon profitiert auch `rag:eval`, das seit der Telemetrie-Einführung nicht mehr startete.

**Testlauf unter Last (18.09.2026):** `npm run test` mit regulärem 5-Sekunden-Limit, während der Messlauf Ollama mit drei parallelen Embedding-Anfragen belegte: **1 Test fehlgeschlagen** — `shellExecution.test.ts` „nennt Interpreter mit Pfad …“ (Umgebungsprobe, echter `sandbox-exec`-Python-Aufruf) lief über 5 s. Ein Wiederholungslauf mit 30 s Limit ging durch, **ersetzt aber den regulären Lauf nicht**.
**Nachprüfung ohne Last (12:40 Uhr, Messlauf beendet):** Der Test besteht **allein** mit dem regulären 5-s-Limit fünfmal hintereinander (dreimal im Arbeitsstand, zweimal auf einem unveränderten Checkout von HEAD). In der **vollen parallelen Suite** schlägt er auf diesem Rechner heute **auch auf dem unveränderten HEAD** mit demselben Timeout fehl (1 failed von 1976 bei HEAD, 1 failed von 2061 im Arbeitsstand); um 11:22 Uhr war dieselbe volle Suite im Arbeitsstand noch grün. Der Ausfall hängt also an der Rechnerlast durch die parallelen Vitest-Worker beim echten `sandbox-exec`-Python-Probelauf, nicht an dieser Änderung. Für die Abnahme bleibt die Bedingung: die volle Suite muss mit 5 s grün sein; dokumentiert ist, dass das derzeit rechnerabhängig ist und schon vor dieser Arbeit so war.

**Noch nicht abgenommen:** GUI-Durchklick der Einstellungs-Karte in der laufenden App (nur Typecheck/Build); **Konkurrenztest über den tatsächlichen App-Pfad** (Build läuft in der App, dann Chat, Mail-Analyse, Brain, Notiz-Agent starten: keine neuen Embedding-Requests während des Vordergrunds, Wiederaufnahme danach). Der Vordergrund-Mechanismus ist bisher nur im Unit-Test mit gemocktem Ollama belegt. Die Chat-Antwortzeit während des Headless-Messlaufs (unten) ist ein Lastmesswert ohne Pause, **kein Beleg für die Pausenlogik**. Codex-Nachprüfung der Umsetzung steht aus; die abschließende Code- und Messabnahme von Phase 1 ebenfalls.

**Messung Voll-Build (18.09.2026, `npm run vault:bench -- --vault ~/2026`)**

Bedingungen: Headless-Node-Prozess (kein Electron, `electron`-Stub), `bge-m3:latest` über lokales Ollama, Concurrency 3, Paket 20, keine Ausschlussordner (Archiv inklusive), Staging in `userData` des Skripts. Die installierte App lief parallel auf demselben Vault; der Nutzer arbeitete währenddessen nicht aktiv mit Ollama. Der Vordergrund-Mechanismus konnte in diesem Lauf **nicht** greifen (der Zähler lebt im App-Prozess, nicht im Skript), die Zahlen sind also der ungebremste Fall.

| Größe | Wert |
|---|---|
| Indexierbare Notizen | 4544 (von 4995; versteckte Ordner, Vorlagen ausgenommen) |
| Chunks | 19 030 (Schätzung im Plan war ~15 000) |
| Dauer Voll-Build | 22 min 19 s (≈ 14 Chunks/s) |
| Peak-RSS des Prozesses während des Builds | 389 MB |
| Event-Loop-Lag (50-ms-Ticker, 26 255 Messungen) | p95 2 ms · max 261 ms (einmalige Spitze beim Schreiben) |
| Container | 96 MB (`vault-bge-m3-latest--cd99a9005099.ragbin`, davon ≈ 78 MB Vektoren, Rest Meta mit Chunk-Text) |
| Laden + Validieren des Containers | 303 ms · RSS danach 536 MB (Prozess trug noch die Build-Reste) |
| Cosine über 19 030 Chunks, ohne Frage-Embedding | 35 ms |
| Volle Abfrage (Digest davor/danach, Embedding, Cosine, Dedupe, Frischeprüfung) | 143 ms · 8 Treffer · bester Score 0,561 · 0 veraltete Dateien |
| Chat `qwen3.5:4b` (≈ 50 Token) **während** des Builds, ohne Pause | 2,0–2,1 s (≈ 25 tok/s) |
| Derselbe Chat **nach** dem Build | 0,9 s (≈ 63 tok/s); erster Aufruf 4,0 s wegen Modell-Laden |

Bewertung gegen die Phase-1-Abnahme: Abfrage < 100 ms ohne und < 2 s mit Frage-Embedding **erfüllt**; Build läuft mit Fortschritt und die Abfrage ist danach ohne Rebuild nutzbar. **Offen**: Peak-RSS 389 MB liegt über der im Plan genannten 150-MB-Schwelle für die Int8-Erwägung. Ursache ist die Zusammensetzung am Ende (Segmente + Zielpuffer); die Vollkopie im Job-Ergebnis wurde nach der Messung entfernt (der Manager lädt den Container aus der Datei), eine Wiederholung der Messung steht aus. Die Chat-Verlangsamung unter Last (2,0 s statt 0,9 s) ist genau der Fall, den die Pause im App-Pfad verhindern soll; ob sie das tut, muss der Konkurrenztest in der App zeigen.

Beispieltreffer der Abfrage „Was war beim letzten Termin mit dem Schulamt besprochen?“: eine Inbox-Notiz, eine Archiv-Notiz eines Termins, zwei Brain-Tage und eine Mail-Notiz, Scores 0,55–0,56, alle als frisch geprüft. Die Scores liegen eng beieinander; die Rangfolge an der Spitze ist genau das, was Phase 3 misst.

## Umsetzungsstand Phase 2, kleiner Schnitt (18.09.2026)

Bewusst klein, wie mit dem Nutzer vereinbart: erst Nutzung beobachten, dann ausbauen.

**Gebaut**
- `shared/rag/citations.ts` (+14 Tests): Spannen im unveränderten Antwortstring; Code-Zäune und Inline-Code maskiert; Sätze je Segment (Überschriften, Trennlinien, Tabellen keine Sätze; Listenmarker gehören nicht zum Satz; Ordnungszahlen wie „18. September" trennen nicht); Status `cited-high`/`cited-low`/`cited-unchecked`/`cited-invalid`/`uncited`/`transition`; Wortdeckung als Maximum über mehrere Zitate; wörtliche Zitate gefunden/nicht gefunden; Überleitung nur als exaktes, alleinstehendes Segment. Dokumentierte Grenze im Test: Negation („nicht 10.000") ist hohe Wortdeckung, keine Wahrheit.
- `main/rag/vaultPrompt.ts`: Quellen als `BEGIN_UNTRUSTED_CONTEXT`-Block über `sanitizeUntrustedText`, Delimiter in Quellen entschärft, Köpfe `[n] Datei › Überschrift` aus Metadaten, Nummern-Zitate, keine Quellenliste, Anweisungen aus Quellen verboten.
- IPC `vault-rag-answer` / `vault-rag-answer-cancel` (`main/index.ts`): Chat-Modell Main-seitig aus `ui-settings.json` (`moduleModelOverrides['vault-rag']`, sonst `selectedModel`), `resolveLocalModel` fail-closed, Vordergrund-Zähler, Retrieval über den Manager (Ausschlussliste greift), deterministische Antwortarten `not-found` (unter Floor, kein Modellaufruf) und `no-fresh-source`, Streaming mit `requestId` auf jedem Ereignis, `think:false`, `AbortController` pro Anfrage, Zitatprüfung im Main nach dem Stream. Telemetrie-Modul `vault-rag`.
- `preload.ts`: Abonnenten geben Unsubscribe zurück. Typen `VaultRagAnswerDone` in `shared/types.ts`.
- NotesChat: Modus **Vault** ersetzt den Knopf „Alle", sobald das Modul `project-rag` an ist (sonst bleibt „Alle"). Einzelne Frage, kein Verlauf. Antwort-Nachricht trägt `origin: 'vault-rag'`, `vaultPath`, `citations`; **der Verlauf des normalen Chats schließt Vault-Antworten immer aus** (F22). Rendering: `[n]` als klickbare Hochzahl, darunter Quellenliste (Datei › Überschrift · Zeile, „neu gefunden" bei Relokalisierung) mit Klick auf die Notiz (nur im selben Vault), Prüfzusammenfassung, Liste der markierten Sätze (ohne Quellenangabe, niedrige Wortdeckung, ungültige Nummer, Zitat nicht im Original), Hinweis bei geänderter Ausschlussliste, Legende („prüft nicht, ob eine Aussage wahr ist"). Kopieren/Speichern/Anhängen: `[n]` → `[^n]`, Fußnoten mit Wikilink, Prüfzeile als Zitatblock, Provenienz-Callout wie bisher. Schließen des Panels bricht die laufende Anfrage ab.
- Übersetzungen de/en in `translations.ts` (`notesChat.vault*`), Stile in `styles/index.css` (`nc-cite`, `nc-vault-*`).

**Bewusst weggelassen (nach Nutzung entscheiden):** Sprung zur Textstelle (Entscheidung 16; Klick öffnet nur die Notiz), Filterleiste (Ordner, Kategorie, Zeitraum), Modell-Override-Picker für `vault-rag` in den Einstellungen (Main liest den Schlüssel bereits), Verlauf/Folgefragen, Injection-Eval (Phase 3).

**GUI-Durchklick in der Dev-App (18.09.2026, 13:00 Uhr, Modelltest-Vault, isoliertes Profil, CDP-getrieben, `qwen3.8:27b-mlx` + `bge-m3`):**
- Einstellungen → KI → Vault-Index: Karte sichtbar, Opt-in-Schalter, „Umfang schätzen“ (63 Notizen · 96 KB · etwa 98 Abschnitte), „Vault-Index erstellen“ → Fortschritt lief, nach wenigen Sekunden „Fertig · 63 von 63 Notizen · 184 eingebettet“, Index-Zeile „184 Abschnitte aus 63 Notizen · 888 KB“. Schätzung 98 vs. real 184 Chunks: die 1000-Zeichen-Faustregel unterschätzt kurze Notizen (Mini-Chunk-Grenze 200) — Schätzung als „etwa“ belassen oder in Phase 3 kalibrieren.
- Notiz-Chat: Modus „Vault“ ersetzt den Knopf „Alle“, Kontextzeile zeigt den Modus. Frage „Welche Geräte sind laut den Rückmeldungen defekt und welche Inventarnummern haben sie?“ → Antwort nach ≈ 40 s (Modell-Laden inklusive), vier Geräte mit Nummern, jeder Punkt mit `[n]` als klickbarer Hochzahl; Quellenliste [1]–[8] mit Datei › Überschrift · Zeile; Prüfung „5 Sätze · 1 ohne Quellenangabe · 0 niedrige Wortdeckung · 0 ungültige Nummern · 0 Zitate nicht im Original“, der Einleitungssatz korrekt als „ohne Quellenangabe“ gelistet; Legende sichtbar. Statusleiste zeigt „21 Tok/s · vault-rag“.
- Klick auf Hochzahl [1] öffnete die Notiz „03 - Rückmeldung Realschule Cotta“ im Editor.
- „Als Notiz speichern“: Datei mit `ki-modell`-Frontmatter, `[^n]`-Fußnoten mit Wikilinks und Zeilen, Prüfzeile als Zitatblock, Provenienz-Callout — wie vorgesehen.
- **Beobachtung für Phase 3 (Recall):** Der Prüfstand enthält fünf defekte Geräte (Notizen 03/07/12/17/20); die Antwort nannte vier. Notiz 07 fehlte in den Top-8, weil vier Plätze an „Was nicht gut gelaufen ist“-Abschnitte anderer Notizen gingen (Scores dicht beieinander). Das ist die im Plan erwartete Spitzen-Rangfolge-Frage; Kandidaten: K, Deckel, Oversampling — nur mit Messung ändern.
- Testartefakte entfernt (gespeicherte Notiz, `vault-*.ragbin`, `vaultRag` in `vault-settings.json`), Dev-App beendet.

**Nutzertest am echten Vault (18.09.2026, 13:50–14:00 Uhr, Dev-App, `qwen3.8:27b-mlx`):**
- Erster Griff ging in den Ordner-Modus (Projektordner, 29 Notizen) — dort gibt es keine Belege; das Symbol des Vault-Modus (zwei Personen, vom alten „Alle“) sagt nichts über Quellenangaben. **Befund UI:** eigenes Symbol/Label „Vault“ nötig.
- Im Vault-Modus lief die Mechanik (Zitate, Quellen [1]–[8] mit Zeilen, Prüfung), aber die Einschätzungsfrage „Wie schätzt du die Fähigkeiten von MindGraph Notes für Einkaufskoordination ein“ bekam eine dünne Antwort: zwei Sätze, der erste eine Verweigerung („Quellen liefern keine Informationen“) → als „ohne Quellenangabe“ markiert, der zweite mit fünf Zitaten korrekt gedeckt. Die acht Treffer waren gestreut (Erklärungsnotiz, YouTube-Skript, Pitch, Roadmap). Der Ordner-Modus mit 29 ganzen Notizen lieferte zur selben Frage eine ausführliche Einschätzung — ohne Belege.
- **Einordnung:** 8 × 1200 Zeichen tragen Nachschlagefragen, keine Synthese. Drei Kandidaten für Phase 3 (nur mit Messung): mehr Abschnitte bei Synthese-Fragen (16 statt 8), Ordnerfilter im Vault-Modus (Entscheidung 9 vorziehen), Verweigerungsformel des Modells als eigene Antwortart statt „ohne Quellenangabe“ (Entscheidung 13 sah eine Main-erzeugte Verweigerung vor; im kleinen Schnitt verweigert das Modell selbst im Text).

- Zweiter Durchlauf, Nachschlagefrage „Was waren die letzten E-Mails von <externe Ansprechpartnerin> zu <Hardware-Thema>“: fünf Sätze, alle zitiert, 0 ungültig, 0 niedrige Deckung, alle Stellen frisch; Antwort chronologisch (Juni → Juli → 15./16. September) mit Datum je Schritt, Treffer aus Mail-Notizen (Abschnitte „Zusammenfassung“ und „Aufgaben“ derselben Notiz, Deckel 2 sinnvoll). Eine der acht Quellen wurde nicht zitiert — in der Liste künftig gedimmt zeigen. **Trennlinie für den CHANGELOG:** Personen, Mails, Termine, Zahlen → Vault-Modus mit Belegen; Einschätzungen und Synthese → Ordner-Modus ohne Belege.

- **Fehler gefunden und behoben (14:02 Uhr):** Klick auf Quelle [7] (Mail-Notiz „2026-07-01 …") öffnete die Brain-Tagesnotiz „…/2026/09/01.md". Ursache: Die Quellen nutzten die unscharfe Wikilink-Auflösung des Chats (`resolveNoteId`, zuletzt „enthält"-Vergleich); der Dateiname „01" ist Teilstring des Mail-Pfads. Fix: `resolveSourceNoteId` vergleicht den vault-relativen Pfad exakt (Fallback: Pfad-Suffix), nie unscharf. Lehre für Entscheidung 16: Navigation zu Quellen immer über den exakten Pfad, die Wikilink-Heuristik ist für Modelltext gedacht, nicht für App-Metadaten.

- **Auffindbarkeit nachgebessert (14:15 Uhr, Nutzerwunsch):** Der Vault-Knopf im Chat trägt jetzt ein eigenes Symbol (Buch mit Haken) und das sichtbare Wort „Vault“ (`has-label`), nicht mehr das Personen-Symbol des alten Modus „Alle“. Neuer Einstieg „Vault befragen (Antworten mit Quellen)“ im Werkzeug-Menü und in der Befehlspalette (`panel-vault-chat`, Requirement `vaultChat` = Notes-Chat + RAG-Modul): öffnet den Chat (nie toggeln) und setzt den Modus über `modeRequest`. Die Vault-Index-Karte sagt bei vorhandenem Index, wo man ihn benutzt. Ein eigenes Panel oder Dashboard-Widget bewusst nicht — erst, wenn Phase 4 die Belege zur Fähigkeit über mehrere Zugänge macht.

**Codex-Umsetzungsreview (18.09.2026, F23–F38): keine Abnahme.** Sechzehn Befunde, alle bestätigt. Runde 1 behoben: Quellenköpfe untrusted (F23), Vault-Frage nie im Cloud-Verlauf (F24), kein Erstaufbau ohne Klick und Modul-Aus Main-seitig (F33), realpath-Schutz für alle Index- und Konfigurationszugriffe (F34), frische Modellprüfung vor jedem Request (F35). Runde 2 behoben: Abbruch-Lebenszyklus mit Sender-Bindung (F29), Generation gegen Vault-Wechsel in der Startphase (F30), gemeinsamer Fehlerzustand der Embedding-Worker (F31), Änderungsmenge bis zum Commit und kein Neustart nach Abbruch (F32), frische Metadaten und Filter bei Relokalisierung (F36), defekte Segmente aus dem Checkpoint und fsync (F37). Runde 3 behoben: eine Marker-Quelle für Prüfer, Anzeige und Export (F25), Tabellenzellen geprüft und Überschriften sichtbar ungeprüft, Satzgrenzen nach Zahlen, kurze Zitate (F26), Fußnoten mit vollem Pfad, eindeutigen IDs und Prüfdetails, Export in fremden Vault blockiert (F27). Codex-Nachprüfung: 8 bestätigt, 6 teilweise offen → Runde 4 behoben (Marker als Markdown-Token, eindeutige Fußnoten-IDs und unverfälschte Pfade, Starttoken vor allen Wartepunkten, Änderungsmenge nur im selben Vault plus Rescan-Marker, mkdir nur unter geprüftem Elternpfad, eindeutige Segmentnamen und Hash-Rekonstruktion). **F28 umgesetzt**: Quellenklick mit Frischeprüfung im Main, Relokalisierung, Sprung zur Textstelle in allen drei Editor-Modi, sichtbarer Hinweis bei geänderter oder fehlender Quelle; im GUI am echten Vault geprüft (Lesen und Markdown, geänderte und wiederhergestellte Quelle) — dabei einen Zeilenversatz nach Callout-Blöcken gefunden und behoben, der Fall „Datei fehlt“ ist nur per Unit-Test belegt. Offen: Abnahmeliste (F38). Details und Anker in der Review-Datei.

**Noch nicht abgenommen:** Handbewertung von 20 Antworten (Phase 3); Konkurrenztest im App-Pfad; Codex-Nachprüfung der Runden 1–3.

## Risiken und Gegenmittel

- **Falsche Stelle als Beleg** (F01): Hash statt mtime, Spannen aus dem Chunker, nie mit alten Offsets schneiden.
- **Halber Index** (F02): ein Container, ein Rename, Prüfsumme beim Laden.
- **Cloud-Modell über localhost** (F11, F21): Main-seitige Sperre auf beiden Modellen über Name **und** Remote-Metadaten, an der gemeinsamen Embedding-Grenze, Modelle aus Konfiguration.
- **Verlorene Vektoren nach Neustart** (F19): Staging-Segmente vor dem Checkpoint, Identität gebunden.
- **Falsche Modell-Identität** (F20): Digest aus `/api/tags`, geprüft vor und nach dem Build.
- **Vault-Text im Cloud-Verlauf** (F22): Nachrichten mit Herkunft, Verlaufsaufbau schließt sie aus.
- **Ollama-Sturm** (F05): Aktivitätszähler mit benannter Abdeckung, Prüfung vor jedem Request, ein Build zur Zeit, 30-s-Entprellung. Der Client-Abbruch beweist keine sofortige Entlastung des Ollama-Servers; der Konkurrenztest misst die Antwortzeit des Vordergrund-Chats. Dev-Falle: zwei Apps auf einem Vault.
- **RAM und Bedienbarkeit** (F04): Segmente statt `number[][]`, Messung von Lag und RSS, `utilityProcess` als Ausweichplan nach Messung.
- **Scheinbelege durch Fallback** (F07): kein Fallback, deterministische Verweigerung unter dem Floor.
- **Prompt-Injection aus Mail-Notizen** (F10): untrusted-Delimiter, Sanitizer, Zuordnung nur aus Metadaten.
- **Zu viel versprochene Prüfung** (F08): Status heißen, was sie sind; Legende und CHANGELOG sagen es.
- **Duplikate und Dominanz** (F13): Oversampling, exaktes Dedupe, Pro-Datei-Deckel, A/B gemessen.
- **Reasoning-Modelle**: `think:false`. **Kontextfenster**: 8 × 1200 Zeichen sind rund 3000 Token; `num_ctx` nur bei Bedarf wie in `main/index.ts:5276`.
- **Index-Migration**: Versions- oder Digest-Wechsel = Rebuild-Angebot mit Fortschritt, kein Hänger.

## Offen nach Rev. 2

- Ob Chunking und Hashing in einen `utilityProcess` müssen, entscheidet die Lag-Messung in Phase 1.
- **Freigabe**: Codex-Abschlussprüfung 18.09.2026 empfiehlt den Start von Phase 1; der Nutzer hat sie weitergegeben. Freigegeben ist der Beginn, nicht das Ergebnis: nach der Umsetzung sind Regressionstests, Messungen, `typecheck`, `test` und `build` vorzulegen.
- Phase 4 (Notiz-Agent) wird erst nach Abnahme von Phase 1–3 geplant im Detail; die fünf Bedingungen oben sind gesetzt, Werkzeug-Schnittstelle und Fußnoten-Format in Notizen folgen als Rev. 4.
- Ob der Projekt-RAG den Top-1-Fallback behält (dort trifft das Modell die Einschätzung; die Verweigerungs-Anforderung gilt dort nicht), oder ob beide Pfade angeglichen werden. Vorschlag: getrennt lassen, in der Doku begründen.
- Near-Dedupe und Entailment-Prüfer bleiben Folgeentscheidungen nach Messung.
