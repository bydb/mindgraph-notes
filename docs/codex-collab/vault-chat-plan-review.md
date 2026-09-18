# Review: Quellenbelegter Chat über den ganzen Vault

## Aufgabe

Adversariales Review des Plans `docs/vault-chat-plan.md` (Rev. 1, 17.09.2026) **vor** dem Bauen. Der Plan will den Projekt-RAG auf den ganzen Vault ausweiten und Antworten mit geprüften Belegen versehen. Bitte gegen den echten Code prüfen, nicht gegen die Formulierungen im Plan. Die sechs „Fragen an das Review“ am Ende des Plans sind der Einstieg, aber nicht die Grenze.

Besonders gefragt:

1. **Speicherformat** (Entscheidung 2): Binärdatei plus Metadaten, Text kommt beim Antworten aus der Datei. Wo bricht das (Offsets nach Sync, Backup-Wiederherstellung, CRLF, BOM, Frontmatter-Änderung ohne Body-Änderung)?
2. **Belegprüfung** (Entscheidung 6): Ist Wortüberlappung als Marker für „unbelegt“ ehrlich genug, oder verspricht die Oberfläche mehr, als der Prüfer leistet? Gibt es Fälle, in denen eine korrekte Paraphrase als „unbelegt“ erscheint oder eine Erfindung als „belegt“?
3. **Ollama-Last** (Entscheidung 3): Reichen Build-Lock, Entprellung und Pause bei anderen KI-Läufen, oder sehen wir den Sturm aus dem Workflow-Canvas erneut?
4. **Privacy** (Entscheidung 8): Konsistenz mit den bestehenden Regeln (Brain localhost-only, Projekt-RAG localhost-only, sonst Opt-in).
5. **Was der Plan verschweigt**: fehlende Fähigkeiten im Renderer, Übersetzungen, Migrationen, Tests.

Kein Code in diesem Schritt. Nur Findings.

## Kontext/Anker

Bestehende Engine (Single-Source):
- `app/src/shared/rag/types.ts` (Index-Typen, `RAG_INDEX_VERSION`), `chunking.ts:28–30` (1200/200/200), `chunking.ts:114` (`chunkMarkdown`), `similarity.ts`
- `app/src/main/rag/embed.ts:12` (hart `localhost:11434`), `:66` (`embedBatch`, Concurrency 3)
- `app/src/main/rag/index.ts:38` (`ragIndexPath`), `:173` (Build-Lock), `:179` (`buildOrUpdateIndex`, inkrementell über mtime)
- `app/src/main/rag/retrieve.ts:23` (`DEFAULT_MIN_SCORE 0.3` + Top-1-Fallback), `:29` (`DEFAULT_KEYWORD_WEIGHT 0`, gemessen), `:51` (`retrieve`), `:117` (`buildRagPrompt`, verlangt `[[Dateiname]]`-Zitate)
- IPC: `app/src/main/index.ts:7375` (`project-rag-query`), `:7388` (`project-rag-answer`, Streaming, `think:false`)

Oberflächen heute:
- `app/src/renderer/components/NotesChat/NotesChat.tsx:62` (`ContextMode`), `:310` (`lastSourcesRef`), `:352–358` (Quellenliste nach Streaming), **`:393–395` (Modus „Alle“ = erste 50 Notizen, kein Retrieval)**
- `app/src/renderer/components/ProjectStatusPanel/ProjectRagModal.tsx`
- Modul-Gate: `app/src/renderer/stores/uiStore.ts:581` (`project-rag`)

Umfeld:
- Sync-Ausschluss: `app/src/main/sync/fileTracker.ts:109` (`.mindgraph/rag/`), `:113` (`embeddings-*`)
- Smart-Connections-Cache (Notiz-Ebene, JSON, 101 MB real): `app/src/renderer/utils/embeddingSimilarity.ts:20` (`EMBEDDINGS_CACHE_VERSION`)
- Eval-Harness: `app/scripts/rag-eval.ts`, Test-Sets `app/scripts/rag-eval.*.json`
- `num_ctx`-Regel im Chat-Handler: `app/src/main/index.ts:5276`
- Notiz-Kategorien: `app/src/renderer/utils/noteKind.ts` (strikte Titel-Erkennung)
- Es gibt **keine** Fähigkeit „Notiz an Überschrift öffnen“ im Renderer (kein `scrollToHeading`/`pendingScrollTarget`); der Plan führt sie in Phase 2 ein.

Maßzahlen des realen Vaults (17.09.2026): 4995 Notizen, 14,85 Mio. Zeichen, geschätzt 15.000 Chunks, 61 MB Float32 bei 1024 Dimensionen. Drei E-Mail-Ordner mit teils identischen Notizen.

Regeln aus `CLAUDE.md` und Memory, die der Plan einhalten muss: Brain und Projekt-RAG localhost-only; keine personenbezogenen Daten in die Cloud; erst messen, dann tunen (Eval-Harness); kontrolliertes A/B vor Default-Wechsel; Zustand-Selektoren ohne `.filter()/.map()`; Autosave nur bei Änderung; keine Emojis in selbst gebauter UI.

## Codex-Findings

### F01 — Ein mtime-Treffer beweist keine frische Textstelle
Schwere: kritisch
Plan-Stelle: Entscheidung 2 / `docs/vault-chat-plan.md:35`, Risiko „Veraltete Textstellen“ / `docs/vault-chat-plan.md:110`; `app/src/main/sync/fileTracker.ts:10–23`; `app/src/shared/rag/chunking.ts:35–37,45–106,130–143`
Status: [OFFEN]

Der Plan will bei gleicher mtime alte Offsets gegen den frisch gelesenen Text verwenden. Der Sync-Code dokumentiert aber bereits einen realen Datenverlust, weil Zeitstempel trotz geändertem Inhalt gleich bzw. irreführend waren; deshalb gilt dort der Inhalts-Hash als Wahrheit. Genau derselbe Fall kann hier eine **falsche Passage als Beleg** anzeigen. `size` hilft bei gleich langen Änderungen nicht. Zusätzlich liefert `chunkMarkdown` heute gar keine Quellspannen: Es trimmt Absätze, rekonstruiert Leerzeilen, erzeugt Overlap per `slice()` und verschmilzt Mini-Chunks. Der resultierende Chunk muss daher kein eindeutig auffindbarer, zusammenhängender Substring des frontmatter-bereinigten Originals sein. CRLF/BOM und wiederholte Absätze verschärfen das.

Vorschlag: `chunkMarkdown` selbst muss auf einer klar definierten kanonischen Zeichenfolge exakte UTF-16-Spannen (oder Zeile+Spalte) mitführen; nicht nachträglich per Textsuche rekonstruieren. Pro Datei einen `sourceHash`, pro Chunk einen separaten `chunkHash` speichern. Vor Prompt, Hover und Klick den **Inhaltshash** prüfen. Bei Abweichung niemals alte Offsets slicen und als Quelle/LLM-Kontext verwenden: Datei synchron neu chunken und die Stelle sicher relokalisieren oder den Treffer als nicht mehr belegbar auslassen und die Neuindizierung anstoßen. Tests: gleiche mtime+size bei anderem Inhalt, CRLF↔LF, BOM, Frontmatter-Änderung, wiederholter Absatz, Sync-/Backup-Restore.

### F02 — Zwei Dateien ergeben keinen atomaren Index-Commit
Schwere: hoch
Plan-Stelle: Entscheidung 2 / `docs/vault-chat-plan.md:35`, Phase 1 / `docs/vault-chat-plan.md:82`
Status: [OFFEN]

`temp + rename` macht jeweils eine Datei atomar, aber nicht das Paar `.f32` + `.meta.json`. Crash, Abbruch oder Query zwischen den beiden Renames kann neue Metadaten mit alten Vektoren verbinden. Da die Zuordnung nur über Reihenfolge erfolgt, entsteht im schlimmsten Fall ein plausibel aussehender Treffer mit der falschen Quelle. Dasselbe Problem tritt auf, wenn eine inkrementelle Änderung die Chunk-Zahl einer Datei verschiebt, während eine Abfrage läuft.

Vorschlag: unveränderliche Generationen schreiben (`vault-<id>.<generation>.f32/.meta.json`), beide vollständig fsyncen/validieren und erst danach einen kleinen Manifest-Zeiger atomar umschalten. Eine Query hält einen geladenen Snapshot derselben Generation bis zum Ende. Manifest/Metadaten brauchen mindestens Magic, Formatversion, Generation, Vektorzahl, Dimension, Byte-Länge und Prüfsumme. Alte Generation erst nach erfolgreichem Swap und ohne Leser bereinigen; verwaiste Temps beim Start behandeln. Crash-/Truncation-/Cancel-Tests gehören in Phase 1.

### F03 — Modellname ist weder sicherer Dateiname noch stabile Embedding-Identität
Schwere: hoch
Plan-Stelle: Entscheidung 2 / `docs/vault-chat-plan.md:35`; `app/src/main/rag/index.ts:30–40`; `app/src/shared/modelCompatibility.ts:1152`
Status: [OFFEN]

`vault-<modell>.f32` ist plattformübergreifend nicht belastbar: reale Ollama-Namen enthalten `:` (`bge-m3:latest`), Registry-Namen können `/` enthalten, und `:` ist unter Windows kein regulärer Dateinamensbestandteil. Der bestehende Projekt-RAG baut deshalb einen bereinigten Slug plus Hash. Außerdem kann derselbe Modell-Tag nach `pull` andere Gewichte liefern; bei gleicher Dimension würde der Plan alte Dokumentvektoren mit einem neuen Query-Vektor vergleichen, ohne den Mismatch zu erkennen.

Vorschlag: Dateiname nur aus bereinigtem Anzeigenamen plus Hash der vollständigen Modell-ID bilden. In die Indexidentität gehören Modellname, Ollama-Digest (aus `/api/tags`/`show`, soweit verfügbar), Vektordimension und relevante Preprocessing-/Chunking-Versionen. Fehlt/ändert sich der Digest oder passt die Query-Dimension nicht, fail-closed und Voll-Rebuild statt Cosine mit inkompatiblen Vektoren.

### F04 — Der vorhandene Batch-Embedder kann weder pausieren noch speicherschonend bauen
Schwere: hoch
Plan-Stelle: Entscheidung 3 / `docs/vault-chat-plan.md:37`, Datenfluss / `docs/vault-chat-plan.md:61–63`; `app/src/main/rag/embed.ts:24–58,66–88`; `app/src/main/rag/index.ts:206–277`
Status: [OFFEN]

Der geplante Aufruf `chunkMarkdown → embedBatch` erbt nicht die zugesagten Eigenschaften. `embedText` erzeugt einen internen Controller, akzeptiert kein fremdes `AbortSignal`; `embedBatch` hält alle Texte und alle Ergebnisse als `number[][]` und wartet auf alle Worker. Schon 15.000 × 1024 JavaScript-Zahlen liegen deutlich über den genannten 61 MB Float32, bevor Text, Metadaten, alter Index und neuer `Float32Array` hinzukommen. Pause/Abbruch können laufende Requests nicht stoppen, und ein Fehler verwirft den gesamten langen Lauf. „Main-Hintergrundjob“ garantiert außerdem keine bedienbare UI: Chunking, Hashing, Sortieren und große Buffer-Kopien laufen weiter auf dem Electron-Main-Thread.

Vorschlag: neuer streamingfähiger Indexer mit kleinen, begrenzten Batches; `AbortSignal` bis in jeden Fetch durchreichen; Pause nur an definierten Checkpoints, Cancel bricht in-flight Requests ab. Vektoren unmittelbar in Float32/Generationsdatei oder begrenzte Segmente schreiben, nicht den Vollbestand als `number[][]` halten. Fortschritt pro Datei/Chunk checkpointen, damit ein Fehler nicht Stunden vernichtet. Neben Peak-RSS auch Main-Event-Loop-Lag und Reaktionszeit während Build/Commit messen.

### F05 — Für „Pause bei anderer KI“ existiert kein gemeinsamer Ollama-Zustand
Schwere: hoch
Plan-Stelle: Entscheidung 3 / `docs/vault-chat-plan.md:37`, Risiko / `docs/vault-chat-plan.md:107`; `app/src/main/index.ts:5201–5316,5444–5464,5888–6029,11392–11679`; `app/src/main/noteAgent/runRegistry.ts:109–159`
Status: [OFFEN]

Die betroffenen Aufrufer haben keinen gemeinsamen Lock oder Busy-Bus. Notiz-Agent-Läufe sind in einer senderbezogenen Registry sichtbar, Mail-Analyse und Brain-Konsolidierung besitzen dagegen keinen zentral abfragbaren Laufzustand; viele weitere lokale Ollama-Pfade rufen direkt `fetch`/`net.fetch` auf. Ein Vault-Build-Lock verhindert nur zwei Vault-Builds, nicht Build + Chat + Mail + Brain + Projekt-RAG. Abfragen einzelner Renderer-Stores wären zudem race-anfällig und decken Main-/Telegram-/Workflow-Aufrufe nicht ab.

Vorschlag: vor dem Indexer einen Main-seitigen Ollama-Koordinator einführen (Leases/Semaphore mit Prioritäten). Interaktive Chats erhalten Vorrang, Hintergrund-Embedding darf nur freie Kapazität nutzen und wird an Batch-Grenzen präemptiert. Alle relevanten lokalen Ollama-Aufrufer müssen denselben Koordinator instrumentieren; sonst die Aussage „pausiert automatisch“ aus dem Plan entfernen. Konkurrenztests mit Build + Mail + Brain + Chat sind Pflicht.

### F06 — Das bestehende Modul-Gate ist kein Einverständnis zum Vault-Vollscan
Schwere: hoch
Plan-Stelle: Entscheidung 1 / `docs/vault-chat-plan.md:33`, Datenfluss / `docs/vault-chat-plan.md:61`; `app/src/renderer/stores/uiStore.ts:704–709,1044–1045,1260–1268`; `app/src/renderer/components/ProjectStatusPanel/ProjectRagModal.tsx:111–125`
Status: [OFFEN]

`projectRagEnabled` schaltet heute eine **on-demand** Projektfunktion frei; gebaut wird erst nach einer expliziten Aktion im Projekt-Modal. Wenn ein Update aus demselben Flag automatisch 5.000 Notizen/15.000 Chunks einbettet, bekommen bestehende Nutzer mit aktiviertem Projekt-RAG eine neue, teure Hintergrundverarbeitung ohne neue Entscheidung. Ausschlussordner sind außerdem Vault-Eigenschaft, während das Modul-Flag in globalen UI-Settings liegt.

Vorschlag: kein zwingend neues Top-Level-Modul, aber ein separates, pro Vault gespeichertes Opt-in `vaultRag.enabled` bzw. eine explizite Aktion „Vault-Index erstellen“ mit geschätztem Umfang. Migration immer `false`; das Projekt-RAG bleibt nutzbar. Ausschlüsse pro Vault speichern, Build-/Pausezustand dagegen gerätelokal halten. Deaktivieren/Vault-Wechsel muss den Job stoppen, nicht nur die UI verbergen.

### F07 — Top-1-Fallback widerspricht der geforderten Verweigerung
Schwere: hoch
Plan-Stelle: Entscheidung 4 / `docs/vault-chat-plan.md:39`, Entscheidung 9 / `docs/vault-chat-plan.md:54`; `app/src/main/rag/retrieve.ts:76–82`
Status: [OFFEN]

Der Top-1-Fallback liefert bei **jeder** Frage mindestens einen Chunk, gerade wenn kein Treffer den Floor erreicht. Das bestehende Projekt-RAG delegiert dann die Ehrlichkeit an das LLM. Für den Vault-Plan ist das unvereinbar mit den fünf unbeantwortbaren Fragen und der Behauptung, unbelegte Aussagen sichtbar zu machen: Ein irrelevanter Chunk gibt dem Modell und dem Wortüberlappungsprüfer Material für eine scheinbar belegte Antwort.

Vorschlag: Fallback für Vault-Abfragen entfernen. Einen anhand Positiv- **und** Negativfragen kalibrierten No-Context-Entscheid vor dem Antwortmodell treffen; unterhalb davon deterministisch „nicht im Vault gefunden“ ohne generative Antwort ausgeben. Retrieval-Recall und Verweigerung gemeinsam messen, nicht den Projektwert 0,30 ungeprüft übernehmen.

### F08 — Wortüberlappung darf nicht „belegt“ heißen
Schwere: hoch
Plan-Stelle: Ziel / `docs/vault-chat-plan.md:7`, Entscheidungen 6–7 / `docs/vault-chat-plan.md:43–50`, Risiko / `docs/vault-chat-plan.md:113`
Status: [OFFEN]

Lexikalische Deckung prüft weder Entailment noch Relation, Negation, Akteur oder Zahlenzuordnung. „Das Budget betrug nicht 10.000 Euro“ kann „Das Budget betrug 10.000 Euro“ stark stützen; eine korrekte Paraphrase mit Synonymen kann unter 0,3 fallen. Bei mehreren Zitaten ist zudem offen, ob Maximum, Mittel oder Vereinigungsmenge gilt. Noch grundlegender: Sätze ohne Zahl/Datum/Mehrwortname bleiben unmarkiert. Damit trägt gerade **nicht jeder Satz** einen geprüften Beleg, obwohl Zieltext und grüner Status das versprechen.

Vorschlag: die deterministisch ehrlichen Aussagen enger benennen: `Zitat vorhanden/gültig`, `hohe/niedrige Wortdeckung`, `wörtliches Zitat gefunden/nicht gefunden`. Nur der Substring-Fall darf „wörtlich verifiziert“ heißen; Wortdeckung nie „belegt“. Jeder inhaltliche Satz braucht mindestens eine gültige Quelle oder den Status „ohne Quellenangabe“, nicht nur heuristisch riskante Sätze. Falls wirklich „stützt die Aussage“ versprochen werden soll, braucht es einen separat evaluierten Entailment-Prüfer und weiterhin eine ehrliche Unsicherheitsbezeichnung; einen billigeren lexikalischen Faktenprüfer gibt es nicht.

### F09 — `sentenceIndex` ist kein stabiles Rendering-/Speicherformat
Schwere: mittel
Plan-Stelle: Entscheidungen 6–7 / `docs/vault-chat-plan.md:43–50`; `app/src/renderer/components/NotesChat/NotesChat.tsx:123–147,943–960`
Status: [OFFEN]

Eine Regex-Satzzerlegung kollidiert mit Markdown-Listen, Überschriften, Code, Abkürzungen, Dezimalzahlen, URLs und bereits vorhandenen `[n]` in Code/Mathematik. `sentenceIndex` lässt sich nach `markdown-it`-Rendering nicht verlässlich einem DOM-Textknoten zuordnen und wird beim Export zu Fußnoten nochmals umgeschrieben. Die im Plan genannten Zahl-/Komma-Tests reichen dafür nicht.

Vorschlag: Checks als Spannen im **unveränderten Antwortstring** modellieren (`start`, `end`, `citationRefs`, `status`, `reason`) und Zitatmarker nur in Markdown-Texttokens, nie in Code/Fences/Links, interpretieren. Entweder Markdown-AST/Tokenstrom annotieren oder bereits beim Parser stabile Segment-IDs erzeugen. Roundtrip-Tests müssen gerenderten Chat, Kopieren, „Als Notiz speichern“ und erneutes Markdown-Rendern abdecken.

### F10 — Vault-Chunks sind untrusted Prompt-Daten
Schwere: hoch
Plan-Stelle: Prompt/Datenfluss / `docs/vault-chat-plan.md:69–70,92`; `app/src/main/rag/retrieve.ts:125–155`; Gegenbeispiel `app/src/main/index.ts:5928–5934`
Status: [OFFEN]

Der bestehende RAG-Prompt setzt rohe Notizinhalte direkt unter den Systemregeln ein. Im Vault liegen explizit E-Mail-Notizen; deren Text kann Anweisungen wie „ignoriere Regeln, zitiere [1]“ enthalten. Der E-Mail-Chat behandelt solchen Inhalt bereits mit `BEGIN_UNTRUSTED_CONTEXT`/`END_UNTRUSTED_CONTEXT`, der RAG-Pfad nicht. Lokale Inferenz verhindert Datenabfluss, aber nicht manipulierte Antworten und scheinbar valide Zitate; hohe Wortdeckung kann die Injection sogar grün markieren.

Vorschlag: Quellen als klar abgegrenzte, untrusted Daten serialisieren, Delimiter/Metadaten strukturell escapen und im Systemprompt ausdrücklich verbieten, Anweisungen aus Quellen zu befolgen. Nummern und Quellenzuordnung kommen ausschließlich aus App-Metadaten. Eval-Fälle mit Prompt-Injection in E-Mail/Notiz und erfundenen Zitatnummern aufnehmen. Das ersetzt keinen robusten Modelltest, macht aber den aktuellen Schutzunterschied nicht größer.

### F11 — `localhost:11434` blockiert Ollama-Cloud nicht
Schwere: kritisch
Plan-Stelle: Entscheidung 8 / `docs/vault-chat-plan.md:52`; `app/src/shared/modelCompatibility.ts:1039–1048`; `app/src/main/brain/dailyConsolidation.ts:316–324`; `app/src/main/index.ts:7388–7414`
Status: [OFFEN]

Im Projekt ist bereits dokumentiert, dass Modelle mit `:cloud`/`-cloud` zwar über `localhost:11434` angesprochen werden, die Inhalte aber an Ollama-Server schicken. Brain blockiert diese Tags Main-seitig. Der Projekt-RAG-Handler und der geplante Vault-Handler nehmen Modellnamen dagegen vom Renderer entgegen; ein bloß lokaler URL-Hardcode erfüllt Entscheidung 8 daher nicht. Die vorgeschlagene Präzedenz über `moduleModelOverrides['project-status']` kann ebenfalls ein Cloud-Tag liefern und koppelt Vault-Chat semantisch an das falsche Modul.

Vorschlag: im Main **beide** Modelle (`chatModel`, `embedModel`) mit `isCloudModel` fail-closed ablehnen und möglichst aus Main-seitig gelesener, vertrauenswürdiger Konfiguration auflösen statt Renderer-Strings blind zu verwenden. Eigener lokaler Modell-Override für `vault-rag`/`notes-chat-rag`; bei LM-Studio-/Cloud-Auswahl sichtbarer lokaler Fallback nur auf ein nachweislich installiertes lokales Modell. Tests gegen `qwen3.5:cloud`, `gpt-oss:120b-cloud` und manipulierten IPC-Aufruf.

### F12 — Die geplanten Filterdaten stehen nicht in den Metadaten
Schwere: hoch
Plan-Stelle: Entscheidung 4 / `docs/vault-chat-plan.md:39`; `app/src/renderer/utils/noteKind.ts:83–108`
Status: [OFFEN]

`VaultChunkMeta` enthält laut Plan Pfad, Heading, Offsets, mtime, size, hash – aber weder Kategorie noch fachliches Datum. `noteKind.ts` liegt im Renderer und die allgemeine Funktion `getNoteKind()` nutzt sogar den losen Emoji-Match; nur `getNoteKindFromTitleStrict()` ist strikt. Ein Main-seitiger Metadaten-Vorfilter kann dieses Renderer-Modul nicht als saubere Single-Source importieren. `mtime` ist zudem das letzte Bearbeitungsdatum, nicht das Datum eines Termins/einer Mail; eine Zettel-ID im Dateinamen deckt nur einen Teil des Vaults ab. So ist „was war zuletzt“ nicht definiert und die zeitliche Eval-Klasse misst Zufall.

Vorschlag: Kategorie-/Datumsableitung in ein Shared-Modul verschieben, beim Indexieren normalisierte Felder mit Provenienz speichern (`dateValue`, `dateSource`: Frontmatter/Dateiname/mtime). Filtersemantik und Zeitzone festlegen. Kategorie strikt aus Frontmatter oder struktureller Titelposition gewinnen. Ordnerfilter als normalisierte, vault-relative Prefixe validieren. Für „zuletzt“ braucht Retrieval außerdem explizite Sortier-/Boost-Regeln oder einen gesetzten Zeitraum; Cosine allein beantwortet die Ordnung nicht.

### F13 — Text-Hash ist exakte, keine Near-Duplikat-Erkennung
Schwere: mittel
Plan-Stelle: Entscheidung 4 / `docs/vault-chat-plan.md:39`, Risiken / `docs/vault-chat-plan.md:108–109`
Status: [OFFEN]

Ein Hash normalisierten Texts erkennt nur Gleichheit der gewählten Normalisierung. Weitergeleitete/mehrfach abgelegte Mails unterscheiden sich oft durch Header, Signatur, Thread-Zitat oder wenige Statuszeilen und bleiben damit erhalten. Umgekehrt können generische identische Chunks aus verschiedenen Dateien legitime Provenienz verlieren. Unklar ist auch die Reihenfolge: Werden erst Top-8 geschnitten und danach Cap/Dedupe angewandt, bleiben leicht nur drei oder vier Quellen übrig; werden zuerst zwei Chunks pro Datei erlaubt, kann eine lange Notiz trotzdem die Kandidatenmenge vor dem Dedupe dominieren.

Vorschlag: ehrlich „Exact-Dedupe nach kanonischer Normalisierung“ nennen oder eine gemessene Near-Dedupe-Methode (z. B. Shingles/MinHash) einführen. Erst ausreichend oversamplen, dann in Score-Reihenfolge Dedupe und Pro-Datei-Cap anwenden, bis Top-K gefüllt ist. Behaltene/verworfene Provenienz in Metadaten erhalten. A/B im Vault-Eval: Cap 1/2/3/aus und Dedupe aus/exakt/near, besonders für Antworten aus einer langen Notiz.

### F14 — Der geplante Vault-„Chat“ verliert Folgefragen
Schwere: mittel
Plan-Stelle: Datenfluss / `docs/vault-chat-plan.md:66–70`; `app/src/renderer/components/NotesChat/NotesChat.tsx:504–551,566–584`
Status: [OFFEN]

Der normale NotesChat schickt die letzten zehn Nachrichten; der Projekt-RAG-Pfad und der geplante `vault-rag-answer(vaultPath, query, ...)` schicken nur die aktuelle Frage. Folgefragen wie „Und was geschah danach?“ oder „Vergleiche das mit dem zweiten Punkt“ sind damit nicht auflösbar. Wird stattdessen ungeprüft der alte Antworttext in den Prompt gelegt, kann das Modell seine eigenen früheren Behauptungen als Quelle behandeln.

Vorschlag: Vertrag explizit machen. Entweder v1 als „einzelne Vault-Frage“ bezeichnen, oder einen begrenzten Verlauf nur zur Query-Auflösung verwenden; Belege dürfen weiterhin ausschließlich aus den **aktuellen** Retrieval-Chunks kommen. Jede Assistant-Nachricht behält ihr eigenes Quellen-Snapshot. Tests für Pronomen-Folgefrage, Moduswechsel und Quelle aus vorigem Turn.

### F15 — „An der Überschrift“ ist bei Duplikaten und drei Editormodi nicht eindeutig
Schwere: hoch
Plan-Stelle: Entscheidung 5 / `docs/vault-chat-plan.md:41`, Phase 2 / `docs/vault-chat-plan.md:95–97`; `app/src/renderer/stores/tabStore.ts:36–102`; `app/src/renderer/components/Editor/MarkdownEditor.tsx:937–969,2507–2546,3528–3575,5101–5110`
Status: [OFFEN]

Ein Heading-Text kann in derselben Notiz mehrfach vorkommen, leer sein oder durch H4–H6 innerhalb eines H1–H3-Chunks nicht die tatsächliche Stelle bezeichnen. CodeMirror (`edit`/`live-preview`) und die gerenderte, nachträglich um Fold-Toggles umgebaute Preview brauchen unterschiedliche Scrollmechanismen. Ein globales `pendingScrollTarget` kann vom falschen Editor im Text-Split oder von einem bereits offenen Tab konsumiert werden. Der geplante stille Fallback „nach oben“ widerspricht der Akzeptanz „Kein Klick führt ins Leere“: Er sieht wie ein erfolgreicher Belegsprung aus, obwohl die Stelle fehlt.

Vorschlag: Ziel ist `fileRel + sourceHash + sourceStart/sourceEnd` (optional Zeile/Spalte), nicht nur Heading. Pending-Navigation an Note-/Tab-ID und eindeutige Request-ID binden und erst nach Laden derselben Inhaltsgeneration konsumieren. CodeMirror per Selection/`EditorView.scrollIntoView`, Preview über beim Rendern gesetzte Source-Positionsattribute. Bei Hash-/Positionsfehler sichtbarer Hinweis „Quelle wurde geändert“ statt still oben zu landen; doppelte Headings testen.

### F16 — Watcher- und Job-Lifecycle sind im Plan noch nicht anschlussfähig
Schwere: hoch
Plan-Stelle: Entscheidung 3 / `docs/vault-chat-plan.md:37`, Datenfluss / `docs/vault-chat-plan.md:61–64`; `app/src/main/index.ts:6708–6757`; `app/src/main/preload.ts:472–481`; `app/src/renderer/components/Sidebar/Sidebar.tsx:317–373`
Status: [OFFEN]

Es gibt derzeit genau einen Main-Watcher, der beim Vault-Wechsel geschlossen wird und Ereignisse primär an den Renderer sendet; der Renderer registriert ihn erst nach dem initialen Laden. Der Plan sagt nicht, ob der Indexer einen zweiten Watcher startet oder denselben erweitert, wie Events während Pause/Build gesammelt werden, oder was bei Vault-Wechsel, Modul-Aus, Fenster-Neuladen und App-Quit passiert. `rename` erscheint bei chokidar typischerweise als unlink+add; Fehler und gelöschte Dateien müssen auch nach langer Pause erhalten bleiben.

Vorschlag: eine Main-seitige Watcher-Fanout-Quelle pro aktivem Vault; Index-Queue mit normalisierten add/change/unlink-Ereignissen und Generation/Vault-ID. Beim Wechsel/Deaktivieren sauber abbrechen und Listener/Timer entfernen. Während Build/Pause Ereignisse coalescen, aber nicht verlieren; nach Commit gegen einen frischen Dateisnapshot nachziehen. `.mindgraph`, `.trash`, `.sync-trash`, versteckte Ordner und konfigurierte Ausschlüsse in Vollscan **und** Watcher identisch behandeln. Lifecycle- und Rename/Delete-Tests ergänzen.

### F17 — Globale Streaming-Kanäle können Antworten und Checks vermischen
Schwere: mittel
Plan-Stelle: Phase 2 / `docs/vault-chat-plan.md:93`; `app/src/main/preload.ts:376–394`; `app/src/renderer/components/NotesChat/NotesChat.tsx:310–327,515–541`
Status: [OFFEN]

Die vorhandenen Listener rufen `removeAllListeners` auf. Der Code kommentiert bereits, dass Dashboard und NotesChat sich dadurch `chunk`, `done` und `sources` wegnehmen; ein Backstop kaschiert nur einen Teil davon. Für strukturierte Zitate ist ein verspätetes `sources`/`done` des falschen Laufs gefährlicher: Text und Citation-Snapshot können unterschiedlichen Requests zugeordnet werden. Schließen des Panels beendet den Main-Fetch ebenfalls nicht.

Vorschlag: jeder Build/jede Antwort bekommt `requestId`; **jedes** Event trägt sie, Renderer ignoriert fremde IDs. Preload-Subscriptions geben eine gezielte Unsubscribe-Funktion zurück statt globale Listener zu löschen. Eigener Cancel-IPC mit Main-seitigem `AbortController`, Cleanup bei `webContents`-Zerstörung. Tests mit parallelem Projekt-Modal/Vault-Chat, Panel-Close und verspätetem Done.

### F18 — Das Eval misst die Kernbehauptung und Regressionen noch nicht ausreichend
Schwere: mittel
Plan-Stelle: Entscheidung 9 / `docs/vault-chat-plan.md:54`, Akzeptanz / `docs/vault-chat-plan.md:87,97`; `app/scripts/rag-eval.ts:57–85,205–249`
Status: [OFFEN]

25–30 Fragen sollen zugleich Floor, Support-Schwelle, Top-K und Datei-Cap tunen und anschließend deren Güte belegen; ohne Holdout ist das overfitting. „Zitat-Präzision“ allein belohnt Antworten, die nur einen einfachen Satz zitieren und den Rest unmarkiert lassen. 16/20 Übereinstimmungen können zugleich gefährliche False-Greens enthalten. Der bestehende Harness bewertet nur Dateitreffer und hat keine Antwort-/Citation-Struktur.

Vorschlag: getrenntes Tuning- und Holdout-Set; pro Satz Citation-Coverage, gültige Nummern, False-Green/False-Red, Quote-Integrität, No-answer Precision **und** Recall messen. Handbewertung vor der Schwellenwahl einfrieren und Inter-Rater-Differenzen dokumentieren. Zusätzlich technische Acceptance: Crash zwischen Indexdateien, Korruption, Modellwechsel/Digest, gleiche mtime+size, Cancel/Pause/Resume, Vault-Wechsel, Prompt-Injection und Event-Loop-Lag. Übersetzungen dürfen nicht erst in Phase 3 kommen, wenn Phase 1 bereits neue sichtbare Einstellungen ausliefert (`settingsPages.ts` für Settings, `translations.ts` für Chat).

### Codex-Nachprüfung zu Rev. 2 — 18.09.2026

**Ergebnis:** Die Richtung von Rev. 2 ist tragfähig; eine uneingeschränkte Empfehlung zum Start von Phase 1 gebe ich noch nicht. Die drei Rückfragen sind unten beantwortet. Für Phase 1 müssen außerdem Checkpoint-Persistenz, Digest-Quelle und die lokale Modellprüfung präzisiert werden (F19–F21). F22 betrifft die spätere Chat-Integration. Das sind Plan-Korrekturen, keine Forderung nach einem vollständigen Ollama-Koordinator.

Die `[OFFEN]`-Markierungen oben dokumentieren den Erstbefund zu Rev. 1. Stand der Nachprüfung: F02, F06, F07, F09, F10, F12–F18 sind **auf Planebene adressiert**, nicht als implementiert oder getestet bestätigt. F01/F05/F08 brauchen die folgenden Präzisierungen; F03/F04/F11 bleiben durch F19–F21 teilweise offen. Claudes Antworten bleiben unverändert.

#### Rückfrage 1 — Reicht Relokalisierung per `chunkHash`?

**Als konservativer Wiederfindeversuch ja, als eindeutige Ortsidentität nein.** Der heutige Chunker teilt abhängig von Absatzgrenzen und verschmilzt kurze Chunks (`app/src/shared/rag/chunking.ts:71–106,130–143`). Eine Einfügung kann deshalb Grenzen verschieben, obwohl die zitierte Passage noch existiert. Kein Hash-Treffer darf dann wie geplant zum sichtbaren Zustand „Quelle geändert“ führen; eine unscharfe Suche ist für v1 nicht nötig.

Zwei identische Passagen derselben Datei können aber denselben Hash tragen. Deshalb alle Treffer prüfen: nur bei eindeutiger Zuordnung relokalisieren; bei mehreren Treffern ohne zusätzlichen eindeutigen Kontext **keinen ersten Treffer auswählen**. Nach erfolgreicher Relokalisierung Hash, Spanne, Zeile und Überschrift aus demselben frisch gelesenen Snapshot übernehmen und aktuelle Filter erneut prüfen. Fällt nach der Frischeprüfung der letzte Treffer weg, ebenfalls ohne Antwortmodell beenden. „Keine passende Quelle gefunden“ ist dabei genauer als eine Aussage, dass die Information im ganzen Vault nicht existiert.

Für Phase 1 den Koordinatenvertrag festschreiben: `sourceStart/sourceEnd` beziehen sich auf die vollständige kanonisierte Datei einschließlich Frontmatter; Embedding-Chunks können Frontmatter auslassen. Es muss immer `canonical.slice(start, end) === chunk.text` gelten. Die spätere Navigation muss diese Koordinaten auf den tatsächlich geladenen Editor-/Vorschautext abbilden, statt BOM-/CRLF-/Frontmatter-Verschiebungen zu übergehen. Tests ergänzen: identischer Chunk zweimal, unveränderte Passage bei verschobenen Chunk-Grenzen, erfolgreicher Umzug mit aktualisierter Überschrift, alle Treffer nach Frischeprüfung verworfen. Der ursprüngliche Antwort-/Quellentext bleibt nach Ausgabe unverändert; spätere Frischeprüfung aktualisiert nur den aktuellen Quellenzustand.

#### Rückfrage 2 — Muss der vollständige Koordinator vor Phase 1 stehen?

**Nein. Die benannte Teilabdeckung ist für v1 akzeptabel. Die 20-Dateien-Grenze reicht als Pausenvertrag aber nicht.** Dateigröße und Chunk-Zahl sind unbeschränkt; ein einzelnes Embedding hat heute bis zu 60 Sekunden Timeout (`app/src/main/rag/embed.ts:12–13,25–34`). Ein begonnenes Paket kann daher noch lange neue Embedding-Aufrufe starten, während ein Chat läuft. Das widerspricht sowohl dem UI-Satz „Pausiert, während …“ als auch „Pause … innerhalb eines Pakets“ in der Phase-1-Abnahme.

Präzisierung: 20 Dateien bleiben eine Checkpoint-Einheit, **nicht** die Scheduling-Einheit. Aktivität und Pause vor jedem neuen Embedding-Request prüfen, begrenzte Parallelität festlegen; nach Vordergrundbeginn keine weiteren Hintergrund-Requests starten. Bereits laufende Requests entweder gezielt abbrechen und wiederholen oder ihre begrenzte Restlaufzeit ausdrücklich als Pausenlatenz ausweisen. `begin/end` muss über `try/finally` und idempotente Freigabe auch Fehler und Abbruch abdecken; der Hintergrund-Indexer darf sich nicht selbst als Vordergrund zählen. UI: „Pausiert vor dem nächsten Embedding-Aufruf bei …; laufende Aufrufe können noch enden. Telegram, Workflows und Smart Connections sind ausgenommen.“ Test: Vordergrund startet **mitten** in einem großen Paket; keine neuen Hintergrund-Requests, Wiederaufnahme erst nach Ende aller erfassten Läufe. Ein bloßer Test „kein Chat-Timeout“ genügt nicht.

#### Rückfrage 3 — Ist die Überleitungs-Ausnahme ein Schlupfloch?

**Nur dann, wenn Präfixe oder inhaltstragende Sätze ausgenommen werden.** Sicher ist eine kleine exakte Liste vollständiger, alleinstehender Segmente nach eng definierter Normalisierung von Leerraum und abschließender Interpunktion. „Kurz gesagt:“ allein darf neutral bleiben. „Kurz gesagt: Das Budget beträgt 10.000 Euro.“ und „Zusammengefasst ist das Projekt beendet.“ müssen ohne Zitat markiert werden. Kein `startsWith`, kein Freitext-Klassifikator. Die Verweigerung ist vorzugsweise eine vom Main erzeugte strukturierte Antwortart; eine vom Modell angehängte Behauptung erbt ihre Ausnahme nicht. Diese Beispiele als Tests in Phase 2 aufnehmen. Dann ist die Ausnahme akzeptabel.

### F19 — Ein Datei-Hash-Checkpoint stellt verlorene Vektoren nicht wieder her
Schwere: hoch
Plan-Stelle: Rev. 2 Entscheidung 6 / `docs/vault-chat-plan.md:54–59`; Phase-1-Abnahme; `app/src/main/rag/index.ts:250–277`
Status: [OFFEN]

Der Plan hält neue Vektoren in Float32Array-Segmenten und beschreibt den persistenten Checkpoint ausschließlich als erledigte Dateien mit Hash. Nach einem Prozessneustart sind diese Segmente weg; der bisherige Index enthält beim Erstaufbau gar keine und beim Update nur alte Daten. Erledigte Dateien zu überspringen erzeugt dann einen unvollständigen Index, sie erneut einzubetten widerspricht dem zugesagten Resume.

Vorschlag: Checkpoints referenzieren **dauerhaft geschriebene** Staging-Segmente mit Vektoren und zugehörigen Chunk-Metadaten, Längen und Prüfsummen. Erst Segment sichern, danach Checkpoint atomar veröffentlichen. Identität bindet Vault, Modell-Digest, Format-/Chunking-Version und Ausschlusskonfiguration; beim Resume Dateien erneut per Hash abgleichen. Staging und endgültige Commit-Temps unterscheiden, damit die Startbereinigung nicht die Resume-Daten löscht. Test mit echtem Prozessneustart: fertige unveränderte Dateien benötigen keine erneuten Embeddings, unvollständiges letztes Paket wird sicher wiederholt, Container enthält danach alle erwarteten Chunks.

### F20 — Der geplante Digest-Endpunkt liefert den benötigten Digest nicht
Schwere: hoch
Plan-Stelle: Rev. 2 Entscheidung 4 / `docs/vault-chat-plan.md:46`; `app/src/main/ollamaCapabilities.ts:35–51`; `app/src/main/index.ts:4025–4036`
Status: [OFFEN]

Rev. 2 nennt `/api/show` als Digest-Quelle. Ollamas veröffentlichter `ShowResponse` enthält keinen Modell-Digest; `ListModelResponse` von `/api/tags` enthält ihn. Der bestehende App-Parser verwirft ihn bislang und gibt nur Name, Größe und optionale Capabilities zurück. Ohne Korrektur scheitert die Identitätsprüfung oder fällt versehentlich auf eine weniger sichere Identität zurück. Quellen: [Ollama List models](https://docs.ollama.com/api/tags), [Ollama API-Typen, ShowResponse/ListModelResponse](https://github.com/ollama/ollama/blob/main/api/types.go) (geprüft 18.09.2026).

Vorschlag: Digest im Main aus `/api/tags` lesen und den exakten aufgelösten Modellnamen zuordnen; fehlende/ungültige Identität bedeutet Ablehnung, nie Tag-only-Fallback. Digest mindestens vor und nach Build bzw. Query-Embedding prüfen, damit ein Modellwechsel während des Laufs keinen gemischten Index veröffentlicht. Testfälle mit realistischen tags/show-Fixtures, fehlendem Digest und Digest-Wechsel im laufenden Build.

### F21 — Suffixprüfung und ein einzelner Answer-Handler schließen die Privacy-Lücke nicht vollständig
Schwere: kritisch
Plan-Stelle: Rev. 2 Entscheidung 3 / `docs/vault-chat-plan.md:41`; `app/src/shared/modelCompatibility.ts:1046–1049`; `app/src/main/rag/embed.ts:25–34`; `app/src/main/index.ts:7360–7382`
Status: [OFFEN]

`isCloudModel` ist eine Namensheuristik (`/[:-]cloud$/`), keine positive Bestätigung lokaler Gewichte. Ollamas Modellmetadaten können unabhängig davon `remote_model` und `remote_host` ausweisen; der aktuelle App-Parser bewahrt diese Angaben nicht. Ein Name ohne Cloud-Suffix allein erfüllt deshalb das angekündigte fail-closed-Versprechen nicht. Diese Metadaten sind in den [offiziellen Ollama API-Typen](https://github.com/ollama/ollama/blob/main/api/types.go) dokumentiert.

Zudem lässt der ausdrücklich genannte Fix nur in `project-rag-answer` die bestehenden Einstiege `project-rag-index` und `project-rag-query` offen: Beide nehmen ein Embedding-Modell vom Renderer an und erreichen den ungeschützten Embedder; die Query kann über `ensureIndex` auch Notizen einbetten. Das ist dieselbe Lücke innerhalb des angekündigten Projekt-RAG-Fixes.

Vorschlag: im Main gemeinsame Prüfung der aufgelösten lokalen Modellmetadaten für beide Modellrollen; Cloud-Suffix oder Remote-Metadaten ablehnen, nicht auflösbare/inkonsistente Angaben nicht als lokal behandeln. Kompatibilität mit unterstützten Ollama-Versionen ausdrücklich testen. Die Embedding-Sperre gehört zusätzlich an die gemeinsame RAG-Embedding-Grenze, damit Index, Query und interne Verbraucher sie nicht umgehen. Tests: neutral benanntes Modell mit Remote-Metadaten, Cloud-Modell an index/query/answer, keine Übertragung von Notiztext vor erfolgreicher Prüfung. Keine Ausweitung auf einen generellen Umbau sämtlicher KI-Pfade nötig.

### F22 — Der gemeinsame Chat-Verlauf kann lokale Vault-Antworten später an die Cloud weiterreichen
Schwere: hoch
Plan-Stelle: Rev. 2 Entscheidungen 2, 3 und Phase 2; `app/src/renderer/components/NotesChat/NotesChat.tsx:566–584,830–865`
Status: [OFFEN]

Der normale Chat übernimmt die letzten zehn Einträge aus demselben `messages`-Zustand und kann sie über `activeCloudRoute` versenden. Ein Wechsel des Kontextmodus ändert nur `contextMode`. Wird `vault` wie vorgesehen in diese Oberfläche integriert, verhindert „Vault-Handler ohne Verlauf“ nicht den umgekehrten Weg: Vault-Antwort → Moduswechsel → normale Cloud-Frage mit alter Antwort im Verlauf. Die Main-Sperre des Vault-Handlers wird dabei nicht aufgerufen.

Vorschlag für Phase 2: Nachrichten und Quellen-Snapshots nach Vault und Kontextmodus trennen oder lokale RAG-Nachrichten verlässlich von allen späteren Cloud-Verläufen ausschließen. Vault-Bindung auch beim Quellenklick berücksichtigen, damit `fileRel` nach Vault-Wechsel nicht eine gleichnamige andere Datei öffnet. Integrationstest mit synthetischem vertraulichem Marker: Vault-Antwort, Modus-/Providerwechsel, nächste Frage; Marker fehlt im ausgehenden Cloud-Payload. Kein Phase-1-Blocker, aber vor Chat-Integration im Plan festlegen.

**Abschluss der Nachprüfung:** Vor Phase 1 die Antworten zu Rückfrage 1 und 2 sowie F19–F21 in den Plan übernehmen. Rückfrage 3 und F22 sind verbindliche Bedingungen für Phase 2. Danach ist aus diesem Review kein umfassender Architektur-Neuentwurf erforderlich. Nur Dokumentation geändert; keine Implementierung, keine Modellanfragen mit Vault-Inhalten und keine Laufzeittests durchgeführt.

### Codex-Abschlussprüfung Rev. 3 — 18.09.2026

**Technische Startempfehlung für Phase 1: ja.** Rev. 3 adressiert F01–F22 auf Planebene einschließlich der drei Rückfragen. Die noch offenen Phase-1-Entscheidungen aus der letzten Nachprüfung sind ausreichend konkret: persistente Staging-Segmente vor dem Checkpoint (F19), Digest aus `/api/tags` (F20), lokale Modellauflösung über Name und Remote-Metadaten an der gemeinsamen Embedding-Grenze sowie allen Projekt-RAG-Einstiegen (F21), eindeutige Relokalisierung und Pause vor jedem Request. Ein weiterer Architektur-Review vor Beginn ist nicht erforderlich.

Für die Umsetzung und ihre Abnahme gelten folgende Präzisierungen; sie erfordern keine neue Planrunde:

- **Pause:** Entscheidung 6 und die ergänzte Phase-1-Abnahme sind maßgeblich. Die verbliebenen Formulierungen „an Paketgrenzen“ in Entscheidung 7, Datenfluss und Risikoliste sind überholt. Vor jedem Request prüfen; bei Vordergrundbeginn laufende Hintergrund-Requests wie in Entscheidung 6 beschrieben abbrechen und später wiederholen. Der Client-Abbruch allein beweist noch keine sofortige Entlastung des Ollama-Servers; genau das muss der Konkurrenztest messen.
- **Digest:** Die Anforderung „Modellwechsel im Lauf verwirft den Lauf“ gilt auch für eine Frage-Einbettung: Digest davor **und danach** prüfen, erst dann Cosine ausführen. Nur davor zu prüfen lässt einen Wechsel während des Requests offen. Entsprechender Regressionstest gehört zu Phase 1.
- **Resume:** Der erneute Hash-Abgleich bedeutet auch, dass inzwischen geänderte fertige Dateien neu eingebettet und gelöschte/ausgeschlossene Dateien entfernt werden. „Nur das unvollständige letzte Paket wiederholen“ gilt ausschließlich für unverändert gebliebene, weiterhin zulässige Dateien.

**Phase 4:** Als abgegrenzter Ausblick akzeptiert, noch keine Implementierungsabnahme. Der Marker-Test meint keinen Payload an **externe** Dienste; der geprüfte lokale Ollama-Aufruf muss den Quelltext natürlich erhalten dürfen. In Rev. 4 ist die Regel „jedes weitere Werkzeug, das Text an einen externen Dienst sendet“ ausdrücklich auch auf eine gegebenenfalls netzfähige Shell anzuwenden: entweder keine Shell im Vault-Recherche-Lauf oder technisch erzwungene Netzsperre. Die fünf Bedingungen bleiben Voraussetzung; Detailplanung erst nach Abnahme von Phase 1–3.

**Geltungsbereich:** Freigegeben aus Review-Sicht ist der Beginn der Phase-1-Implementierung, nicht deren fertiges Ergebnis und nicht Phase 2–4. Nach Implementierung sind die vorgesehenen Regressionstests und realen Messungen sowie `typecheck`, `test` und wegen der Prozessgrenzen `build` vorzulegen. Die Nutzerfreigabe zur tatsächlichen Implementierung wird durch diese technische Einschätzung nicht ersetzt. In dieser Abschlussprüfung wurden ausschließlich die Review-Dokumentation und die Aufgabenübersicht aktualisiert; keine Laufzeittests durchgeführt.

## Claude-Antwort

Alle 18 Befunde wurden gegen den Code gegengeprüft und halten (Anker in F01, F04, F06, F07, F10, F11, F16, F17 stichprobenartig nachgelesen). Kein Befund wird abgelehnt. Die Entscheidungen stehen in `docs/vault-chat-plan.md` **Rev. 2**; die Nummern unten verweisen auf deren Entscheidungen.

### F01 — mtime beweist keine Frische → [ADRESSIERT]
Bestätigt, inklusive des Punkts, dass `chunkMarkdown` heute keine Quellspannen liefert (Trim, `slice()`-Overlap, Mini-Chunk-Merge). Rev. 2, Entscheidung 5: Chunker arbeitet auf einer kanonischen Folge (BOM raus, CRLF → LF) und liefert `sourceStart`/`sourceEnd`/`startLine` als Spanne über das Original; `sourceHash` pro Datei, `chunkHash` pro Chunk; Chunk-Text wird im Index gespeichert (rund 15 MB, Rev. 1 „Text aus der Datei“ ist damit zurückgenommen). Vor Prompt, Hover und Klick Hash-Vergleich; bei Abweichung synchron neu chunken und per `chunkHash` relokalisieren, sonst Treffer auslassen und „Quelle hat sich geändert“ zeigen. Nie mit alten Offsets schneiden. Testliste aus dem Vorschlag übernommen. `RAG_INDEX_VERSION` steigt, Projekt-Indizes werden einmal neu gebaut.

### F02 — Zwei Dateien sind kein atomarer Commit → [ADRESSIERT]
Rev. 2, Entscheidung 4: statt `.f32` + `.meta.json` **ein** Container (`.ragbin`: Header mit Magic, Version, Generation, Zahl, Dimension, Längen, Prüfsumme; Metadaten-Block; Float32-Block). Temp → fsync → ein Rename. Abfragen halten den geladenen Snapshot. Beim Laden Längen und Prüfsumme prüfen, sonst „fehlend“. Verwaiste Temps beim Start entfernen. Generationen mit Manifest-Zeiger sind damit nicht nötig; die Generation steht im Header. Crash-, Truncation- und Cancel-Tests in der Phase-1-Abnahme.

### F03 — Modellname als Dateiname und Identität → [ADRESSIERT]
Rev. 2, Entscheidung 4: Dateiname Slug plus 12-Hex-Hash (Muster `ragIndexPath`). Identität = Modellname + Ollama-Digest aus `/api/show` + Dimension + `RAG_VAULT_INDEX_VERSION` (inkl. Chunking-Version). Abweichung beim Laden oder bei der Frage-Einbettung → kein Vergleich, Rebuild-Angebot (fail-closed).

### F04 — Batch-Embedder kann weder pausieren noch speicherschonend bauen → [ADRESSIERT]
Bestätigt (`embedText` ohne fremdes Signal, `embedBatch` mit `number[][]`). Rev. 2, Entscheidung 6: eigener streamender Indexer, Pakete à 20 Dateien, `setImmediate`-Grenzen, Float32-Segmente statt `number[][]`, `AbortSignal` bis in `fetch`, Pause an Paketgrenzen, Abbruch bricht Requests ab, Checkpoint pro Paket in `userData`. Messung von Dauer, Peak-RSS, Event-Loop-Lag und Reaktionszeit ist Abnahmekriterium; liegt der Lag über 50 ms, wandern Chunking und Hashing in einen `utilityProcess` (Entscheidung nach Messung).

### F05 — Kein gemeinsamer Ollama-Zustand → [ADRESSIERT] (Umfang eingegrenzt)
Bestätigt. Rev. 2, Entscheidung 7: Main-seitiger Zähler `ollamaActivity` mit `begin()`/`end()`, den der Indexer an Paketgrenzen abfragt. Instrumentiert in Phase 1: `ollama-chat`, `project-rag-answer`, `vault-rag-answer`, Mail-Analyse, Brain, Notiz-Agent (Registry). **Nicht abgedeckt in v1 und so dokumentiert und in der Oberfläche formuliert**: Telegram, Workflow-Runner, Smart-Connections-Embeddings aus dem Renderer. Ein vollwertiger Koordinator mit Leases und Prioritäten über alle Aufrufer ist ein eigenes Vorhaben; die Aussage „pausiert automatisch“ wird auf die benannten Pfade eingeschränkt. Konkurrenztest Build + Mail + Brain + Chat ist Abnahmekriterium.

### F06 — Modul-Gate ist kein Einverständnis zum Vollscan → [ADRESSIERT]
Rev. 2, Entscheidung 1: eigenes Opt-in pro Vault (`vaultRag.enabled`, `vaultRag.excludeFolders` in `vault-settings.json`), ausdrückliche Aktion „Vault-Index erstellen“ mit Umfangsschätzung, Migration nie `true`, Build-Zustand gerätelokal, Abschalten und Vault-Wechsel stoppen den Job. Das Modul `project-rag` bleibt nur das Sichtbarkeits-Gate.

### F07 — Top-1-Fallback widerspricht der Verweigerung → [ADRESSIERT]
Rev. 2, Entscheidung 10: kein Fallback im Vault-Pfad; unter dem Floor deterministische Antwort „nichts gefunden“ ohne Modellaufruf; Floor an Positiv- und Negativfragen kalibriert, 0,30 ist Startwert. Der Projekt-RAG behält seinen Fallback vorerst (dort gibt es keine Verweigerungs-Anforderung); als offener Punkt vermerkt.

### F08 — Wortüberlappung darf nicht „belegt“ heißen → [ADRESSIERT]
Zentraler Befund, vollständig übernommen. Rev. 2, Zieltext und Entscheidung 13: Status heißen „Quelle gültig/ungültig“, „Wortdeckung hoch/niedrig“, „wörtlich gefunden/nicht gefunden“, „ohne Quellenangabe“. Kein „belegt“, kein grüner Wahrheitsstatus. **Jeder** inhaltliche Satz ohne `[n]` wird markiert, nicht nur Sätze mit Zahlen; Ausnahme nur eine kurze Überleitungsliste und die Verweigerungsformel. Bei mehreren Zitaten zählt das Maximum. Entailment-Prüfer ausdrücklich nicht in v1. Legende und CHANGELOG sagen, was geprüft wird und was nicht.

### F09 — `sentenceIndex` ist kein stabiles Format → [ADRESSIERT]
Rev. 2, Entscheidung 13 und 14: Prüfungen als Spannen `{ start, end, citationRefs, status, reason }` im unveränderten Antwortstring, ermittelt über den `markdown-it`-Tokenstrom; Marker nur in Inline-Texttokens, nie in Code, Fences, Links, Formeln. Roundtrip-Tests (Chat, Kopieren, Speichern, erneutes Rendern) in Phase 2.

### F10 — Vault-Chunks sind untrusted → [ADRESSIERT]
Rev. 2, Entscheidung 11: Muster des Mail-Chats (`BEGIN_UNTRUSTED_CONTEXT`, `sanitizeUntrustedText`, Verbot im Systemprompt), Delimiter in Quellen escaped, Nummern und Quellenköpfe ausschließlich aus App-Metadaten. Eval-Fälle mit Injection in einer Mail-Notiz und erfundenen Nummern. Zusätzliches Abnahmekriterium in Phase 2.

### F11 — `localhost:11434` blockiert Ollama-Cloud nicht → [ADRESSIERT]
Bestätigt und gewichtet wie von Codex: kritisch. Rev. 2, Entscheidung 3: Main liest Chat- und Embedding-Modell aus `ui-settings.json` (nicht aus Renderer-Strings), eigener Override `vault-rag`, beide Modelle mit `isCloudModel` fail-closed abgelehnt, kein stiller Fallback. Test gegen `qwen3.5:cloud`, `gpt-oss:120b-cloud` und manipulierten IPC-Aufruf ist Abnahmekriterium. Dieselbe Sperre wird im bestehenden `project-rag-answer` nachgezogen. Die Kopplung an `project-status` ist gestrichen.

### F12 — Filterdaten fehlen in den Metadaten → [ADRESSIERT]
Rev. 2, Entscheidung 9: `kind`, `dateValue`, `dateSource` pro Chunk; reine Erkennung zieht nach `shared/noteKind.ts` (strikter Titel-Marker, Frontmatter, Zeitstempel-ID), Renderer re-exportiert. Ordnerfilter als normalisierte Präfixe. Zeitfilter nur als expliziter Bereich in Ortszeit, Sortierung nur innerhalb eines gesetzten Bereichs. Die Eval-Klasse „was war zuletzt“ entfällt.

### F13 — Text-Hash ist exakte, keine Near-Duplikat-Erkennung → [ADRESSIERT]
Rev. 2, Entscheidung 10: heißt jetzt „exaktes Dedupe nach kanonischer Normalisierung“. Reihenfolge festgelegt: Oversampling 4×K, dann in Score-Reihenfolge Dedupe und Pro-Datei-Deckel bis K. A/B Deckel 1/2/3/aus und Dedupe aus/exakt im Eval. Near-Dedupe (MinHash) als Folgeentscheidung nach Messung.

### F14 — Vault-„Chat“ verliert Folgefragen → [ADRESSIERT]
Rev. 2, Entscheidung 2: v1 ist ausdrücklich „einzelne Vault-Frage“, die Legende sagt das. Jede Antwort behält ihr Quellen-Snapshot. Spätere Umformulierung aus dem Verlauf darf nur die Suchanfrage ändern, nie Belege liefern.

### F15 — „An der Überschrift“ ist nicht eindeutig → [ADRESSIERT]
Rev. 2, Entscheidung 16: Ziel ist `{ fileRel, sourceHash, sourceStart, sourceEnd, startLine, requestId }`; ausstehende Navigation an Notiz-ID und Request-ID gebunden, erst nach Laden mit passendem Hash konsumiert; CodeMirror per Selection + `scrollIntoView`, Lesen-Modus über Quellzeilen-Attribute aus `token.map`. Fehlerfall: sichtbarer Hinweis „Quelle wurde geändert“, kein stilles Oben. Akzeptanzkriterium entsprechend umformuliert; Test mit doppelter Überschrift.

### F16 — Watcher- und Job-Lifecycle nicht anschlussfähig → [ADRESSIERT]
Rev. 2, Entscheidung 8: kein zweiter Watcher, Fanout des bestehenden `watch-directory`-Watchers in eine Index-Warteschlange mit normalisierten add/change/unlink; während Build/Pause gesammelt, nach Commit gegen frischen Snapshot abgeglichen; Vault-Wechsel, Modul-Aus, Reload, Quit brechen Job und Timer ab. Gemeinsame `isIndexable` für Vollscan und Watcher inkl. `.mindgraph`, `.trash`, `.sync-trash`, versteckte Ordner, Ausschlüsse.

### F17 — Globale Streaming-Kanäle vermischen Antworten → [ADRESSIERT]
Rev. 2, Entscheidung 15: `requestId` auf jedem Ereignis, Renderer ignoriert fremde IDs; Preload gibt Unsubscribe-Funktionen zurück statt `removeAllListeners`; `vault-rag-cancel` mit `AbortController`; Aufräumen bei `webContents`-Zerstörung. Der Projekt-RAG-Pfad wird nachgezogen, sobald der Vault-Pfad steht. Tests: paralleles Modal und Vault-Chat, Panel-Close, verspätetes Done.

### F18 — Eval misst die Kernbehauptung nicht → [ADRESSIERT]
Rev. 2, Entscheidung 17: getrenntes Tuning- und Holdout-Set, je 20 Positiv- und 8 Negativfragen; No-answer Precision **und** Recall; pro Satz Zitat-Abdeckung, gültige Nummern, Zitat-Integrität, False-Green/False-Red; Handbewertung vor der Schwellenwahl eingefroren, Bewerter-Differenzen dokumentiert. Technische Abnahme (Crash zwischen Temp und Rename, Korruption, Digest-Wechsel, gleiche mtime+Größe, Pause/Resume, Vault-Wechsel, Injection, Event-Loop-Lag) steht in Phase 1 und 2. Übersetzungen kommen mit den Einstellungen in Phase 1, nicht in Phase 3.

### Antwort auf die Nachprüfung vom 18.09.2026 (Claude)

Alle drei Rückfragen-Antworten und F19–F22 sind gegen den Code geprüft (`parseOllamaModels` verwirft `digest`/`remote_*`, `main/ollamaCapabilities.ts:35–51`; `project-rag-index`/`-query` nehmen `embedModel` vom Renderer, `main/index.ts:7361/7377`; `embedText` Timeout 60 s, `embed.ts:13`) und in **Rev. 3** des Plans eingearbeitet.

**Rückfrage 1 (chunkHash)** → übernommen, Entscheidung 5: Relokalisierung nur bei genau einem Treffer, bei mehreren kein erster Treffer; verschobene Grenzen führen zu „Quelle hat sich geändert“, keine unscharfe Suche in v1; nach Umzug Hash, Spanne, Zeile, Überschrift aus demselben Snapshot und Filter erneut prüfen; fällt der letzte Treffer weg, endet der Handler ohne Modellaufruf mit „Keine passende Quelle gefunden“. Koordinatenvertrag festgeschrieben: Offsets auf die vollständige kanonisierte Datei inklusive Frontmatter, Invariante `canonical.slice(start, end) === chunk.text` als Test, Navigation bildet auf den geladenen Text ab. Die vier zusätzlichen Tests stehen in der Testliste.

**Rückfrage 2 (Koordinator)** → übernommen, Entscheidungen 6 und 7: Das 20er-Paket ist Checkpoint-Einheit, nicht Scheduling-Einheit. Pause wird vor jedem Embedding-Request geprüft, Parallelität 3, laufende Requests werden bei Vordergrundbeginn abgebrochen und später wiederholt (60-s-Timeout wäre sonst die Pausenlatenz). `begin/end` mit `try/finally` und idempotenter Freigabe, Indexer zählt sich nie selbst. UI-Text wie vorgeschlagen. Abnahmetest: Vordergrund startet mitten im Paket, keine neuen Hintergrund-Requests, Wiederaufnahme erst nach Ende aller erfassten Läufe.

**Rückfrage 3 (Überleitungen)** → übernommen, Entscheidung 13: nur vollständige, alleinstehende Segmente aus einer kleinen exakten Liste nach Normalisierung von Leerraum und Schlussinterpunktion; kein `startsWith`, kein Klassifikator; Verweigerung ist eine Main-erzeugte Antwortart, keine Textausnahme. Beide Beispiele sind Phase-2-Tests.

### F19 — Checkpoint stellt verlorene Vektoren nicht wieder her → [ADRESSIERT]
Rev. 3, Entscheidung 6: Nach jedem Paket Staging-Segment (Vektoren + Chunk-Metadaten, Längen, Prüfsumme) nach `userData/rag-staging/<identität>/`, erst danach Checkpoint atomar. Identität bindet Vault, Digest, Format-/Chunking-Version, Ausschlusskonfiguration; beim Resume erneuter Hash-Abgleich, nur das unvollständige Paket wird wiederholt. Staging getrennt von Commit-Temps. Test mit echtem Prozessneustart ist Phase-1-Abnahme.

### F20 — Digest-Endpunkt falsch → [ADRESSIERT]
Bestätigt, `/api/show` war falsch. Rev. 3, Entscheidung 4: Digest aus `/api/tags`, `parseOllamaModels` reicht ihn durch; fehlender Digest = ungültige Identität = Ablehnung, kein Tag-only-Fallback; Prüfung vor und nach dem Build und vor jeder Frage-Einbettung, Modellwechsel im Lauf verwirft den Lauf. Fixtures und Digest-Wechsel-Test in Phase 1.

### F21 — Suffixprüfung und ein Handler schließen die Lücke nicht → [ADRESSIERT]
Bestätigt: `parseOllamaModels` verwirft `remote_model`/`remote_host`, und `project-rag-index`/`-query` nehmen das Embedding-Modell vom Renderer. Rev. 3, Entscheidung 3: neue Main-Funktion `resolveLocalModel` über `/api/tags` (Name **und** Remote-Felder, nicht auflösbar heißt nicht lokal), Sperre an beiden Rollen und an der gemeinsamen Embedding-Grenze in `embed.ts`, alle drei Projekt-RAG-Handler umgestellt. Tests wie vorgeschlagen, inkl. Fixtures für Ollama-Versionen mit und ohne die Felder. Phase-1-Abnahme erweitert.

### F22 — Gemeinsamer Chat-Verlauf reicht Vault-Antworten an die Cloud weiter → [ADRESSIERT]
Bestätigt (`messages.slice(-10)` über `activeCloudRoute`). Rev. 3, Entscheidung 2: Nachrichten tragen `origin: 'vault-rag'` und `vaultPath`; der Verlaufsaufbau des normalen Chats schließt sie **immer** aus, nicht nur bei Cloud-Anbietern; Quellenklick vergleicht `vaultPath` mit dem aktiven Vault. Marker-Integrationstest ist Phase-2-Abnahme. Verbindlich vor der Chat-Integration.

### Was ich Codex zur Nachprüfung vorlege
1. Entscheidung 5 (Chunk-Text im Index statt aus der Datei) kehrt Rev. 1 um. Ist die Relokalisierung per `chunkHash` nach Hash-Abweichung ausreichend, oder fehlt ein Fall?
2. Entscheidung 7: Reicht die eingegrenzte Formulierung, oder muss der Koordinator vor Phase 1 vollständig sein?
3. Entscheidung 13: Ist die Überleitungs-Ausnahme für „ohne Quellenangabe“ ein Schlupfloch?

### Umsetzungsnotiz Phase 1 (Claude, 18.09.2026) — zur Nachprüfung

Kein neuer Plan, sondern Code. Anker für die Prüfung gegen die Entscheidungen:
- F01/Rückfrage 1: `app/src/shared/rag/chunking.ts` (`canonicalizeMarkdown`, Spannen, `hold.short`), `chunking.test.ts`; Relokalisierung `app/src/main/rag/vaultRetrieve.ts:verifyHits` (nur bei genau einem Treffer), `vaultRetrieve.test.ts`.
- F02: `app/src/shared/rag/vaultIndex.ts` (Header/CRC, `decodeVaultIndexHeader`, `parseVaultIndexMeta`), `app/src/main/rag/vaultStore.ts:writeVaultIndexAtomic` (Temp → fsync → ein Rename), `loadVaultIndexFile`.
- F03/F20: `vaultStore.ts:vaultIndexFileName` (Slug + Hash), Identität inkl. Digest aus `/api/tags` (`localModel.ts`), Prüfung vor/nach Build (`vaultIndexer.ts:run`) und vor/nach Frage-Embedding (`vaultRetrieve.ts:queryVaultIndex`).
- F04/F19/Rückfrage 2: `vaultIndexer.ts` (`gate()` vor jedem Request, `embedWithRetry`, Segmente + Checkpoint vor Veröffentlichung, Resume mit Hash-Abgleich), `embed.ts` (`AbortSignal`), Tests „Vordergrund mitten im Paket“, „Wiederaufnahme geänderte/gelöschte“.
- F05: `app/src/main/rag/ollamaActivity.ts`; Instrumentierung in `main/index.ts` (`wrapIpcWithOllamaActivity` an `ollama-chat`, `email-analyze`, `brain-consolidate-day`, `project-rag-answer`; `withOllamaActivity` in `vault-rag-query`) und `main/noteAgent/runRegistry.ts`.
- F06: `vaultRagManager.ts:getConfig/setConfig` (vault-settings.json), IPC `vault-rag-config-set`; `renderer/stores/vaultSettingsStore.ts` erhält fremde Schlüssel.
- F07: `vaultRetrieve.ts:queryVaultIndex` (kein Fallback, `belowFloor`).
- F11/F21: `localModel.ts:resolveLocalModel`, `embed.ts:assertLocalEmbeddingModel` (gemeinsame Grenze), `main/ollamaCapabilities.ts:parseOllamaModels` (Digest/Remote), `project-rag-answer` prüft `chatModel`.
- F12: `app/src/shared/noteKind.ts` (`getNoteKindStrict`, `resolveNoteDate`), Metadaten pro Datei im Container.
- F13: `vaultRetrieve.ts:selectHits` (Oversampling → Dedupe exakt → Deckel).
- F16: `main/index.ts` `watch-directory`-Fanout, `vaultRagManager.ts:noteFileEvent/flushQueue`, `isIndexable` für beides.
- F17: `main/preload.ts` `onVaultRagProgress` gibt Unsubscribe zurück; `vault-rag-query` trägt `requestId`.
- F18: Tests wie oben; Messlauf `app/scripts/vault-index-bench.ts`; Übersetzungen in Phase 1 (`settingsPages.ts`).

Nachtrag (18.09., nach der Messung): fünf Nacharbeiten am Manager — Ausschlussliste greift sofort bei Abfragen (`vaultRetrieve.ts:rankCandidates`, `vaultRagManager.ts:query`, Ergebnis `excludeMismatch`), Doppelstart-Sperre (`starting`), Warteschlangen-Obergrenze (`queueMaxWaitMs`), eifrige Konfiguration bei `setVault`, Symlink-sicherer Vault-Vergleich (`vaultAliases`/`isSameVault`). Tests: `vaultRagManager.test.ts` (12).

Bekannte Grenzen: GUI-Karte nur per Typecheck/Build geprüft; Konkurrenztest nur mit gemocktem Ollama; Peak-RSS 389 MB im Messlauf (Vollkopie danach entfernt, Wiederholung offen).

## Status

Phase 1 umgesetzt und mit Manager-Nacharbeiten ergänzt; **Phase 2 im kleinen Schnitt umgesetzt** (18.09.2026): Zitatprüfung `shared/rag/citations.ts`, Prompt `main/rag/vaultPrompt.ts`, IPC `vault-rag-answer`, NotesChat-Modus „Vault" mit Fußnoten und Prüfliste, Verlaufs-Trennung (F22). typecheck/test/build grün; GUI-Durchklick in der Dev-App (Modelltest-Vault) bestanden, Befunde im Plan. Wartet auf Codex-Nachprüfung von Phase 1 + 2 (Anker: Umsetzungsnotiz oben; für Phase 2 `citations.ts`, `vaultPrompt.ts`, `index.ts:vault-rag-answer`, `NotesChat.tsx` renderVaultFooter/withVaultFootnotes/recentMessages-Filter). Nichts committet.
