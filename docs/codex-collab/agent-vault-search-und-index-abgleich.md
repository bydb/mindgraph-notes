# Agent: Suche über den Vault-Index + Index-Abgleich beim Öffnen und stündlich

## Aufgabe

**Plan-Review, kein Code.** Zwei Ideen des Nutzers (24.09.2026, beim Testen der neuen Agent-Karte):

1. **Der Notiz-Agent soll den Vault-Index nutzen.** Heute sucht er nur per Stichwort (`note_search`); das
   Beispiel „Suche in meinen Notizen nach Datenschutz bei Cloud-Diensten …“ findet dann keine Notiz über
   „DSGVO bei AWS“.
2. **Der Index soll sich regelmäßig selbst prüfen** (Vorschlag des Nutzers: stündlich).

Bitte adversarial prüfen: trägt der Plan gegen den Code, was fehlt, was ist gefährlich, was ist überflüssig?
Besonders die Entscheidungsfrage unter 1e.

### 1 — Werkzeug `vault_search` für den Notiz-Agenten (Claudes Entwurf)

a) **Neues Werkzeug** `vault_search({ query, max_results? })` neben `note_search`, nicht als Ersatz.
   Liefert Treffer als Pfad + Überschriften-Pfad + kurzer Textausschnitt (Chunk), keine ganzen Notizen;
   der Agent liest weiter mit `note_read`. Beschreibung für das Modell: „Suche nach Bedeutung, findet auch
   Notizen ohne die genauen Wörter; danach relevante Treffer mit note_read lesen.“
b) **Nur angeboten, wenn** Modul `project-rag` an, `vaultRag.enabled` für diesen Vault, ein gültiger
   Index geladen ist und das Embedding-Modell lokal auflösbar ist (`resolveLocalModel`). Sonst fehlt das
   Werkzeug in der Allowlist (`noteAgent/loop.ts:188ff.`) und im Prompt — kein Werkzeug, das nur Fehler liefert.
c) **Derselbe Weg wie „Vault befragen“:** `getVaultRagManager().query(...)` (wie `vault-rag-query`,
   `main/index.ts:7793`) mit `selectForQuery`/Frischeprüfung (`vaultRetrieve.ts`, `verifyHits`), Floor
   ohne Top-1-Fallback — unter der Schwelle „nichts gefunden“. `withOllamaActivity`? Der Agent-Lauf ist
   schon Vordergrund (`ollamaActivity.ts`), der Indexer pausiert ohnehin.
d) **Quellen:** Treffer zählen NICHT als „gelesen“ (Paket B / F06: „nur gefunden“), erst `note_read`.
e) **Entscheidungsfrage Cloud:** „Vault befragen“ lehnt nicht-lokale Chat-Modelle ab, weil der Vault
   Mail-Notizen enthält (`index.ts:7822ff.`, `resolveLocalModel`). Der Agent darf heute mit Cloud-Modell
   per `note_search`/`note_read` jede Notiz lesen und an den Anbieter geben (Opt-in `note-agent`, Hinweis auf
   der Karte). Optionen:
   - (i) `vault_search` auch bei Cloud anbieten — konsistent mit `note_read`, Karte nennt den Datenweg;
   - (ii) `vault_search` nur bei lokalem Chat-Modell — konsistent mit „Vault befragen“, aber inkonsistent mit
     `note_read`;
   - (iii) (i) plus Ausschluss der Mail-Notiz-Ordner aus Treffern bei Cloud.
   Nutzer-Grundsätze (Memory): „keine personenbezogenen Daten in die Cloud, Mail-Inhalte auch nicht“ UND
   „sonst keine Cloud-Sperren, Nutzer entscheidet; Opt-in + Transparenz“. Claude tendiert zu (ii) oder (iii).
f) **Budget:** Treffer ≤ 8, Ausschnitt je Treffer gekappt (Kontext ist knapp, 12/20 Iterationen).
g) **Karte (Paket A):** Zeile „Unterlagen“ ergänzt bei vorhandenem Index „… zusätzlich lesen – auch über
   den Vault-Index (Suche nach Bedeutung)“? Oder kein UI.

### 2 — Index-Abgleich (Claudes Entwurf)

Befund: Der Index folgt dem Datei-Watcher (`vaultRagManager.ts:446 noteFileEvent`, 30 s entprellt). Beim
Öffnen des Vaults gibt es keinen Abgleich (`setVault` `:138–156` lädt nur Konfiguration). Änderungen,
während die App zu ist (Sync von anderem Gerät, anderer Editor, verpasste Watcher-Ereignisse im
Ruhezustand), bleiben bis zur nächsten Änderung derselben Datei draußen. Treffer sind trotzdem nicht falsch
(Frischeprüfung per `sourceHash`), nur unvollständig.

a) **Beim Öffnen des Vaults** (und nach App-Start) einmal `startBuild(vault, 'incremental', undefined,
   rescanAll=true)` (`:309`, `:514`) — hasht alle Dateien, bettet nur Geänderte/Neue ein, entfernt Gelöschte.
   Nur wenn Index autorisiert/vorhanden (kein stiller Erstaufbau, F33).
b) **Stündlich** dasselbe, aber nur wenn: App-Fenster offen, kein Job läuft, kein Vordergrund-Ollama
   (Pause-Logik greift ohnehin vor jedem Embedding), letzter Abgleich ≥ 60 min her. Kein Vollaufbau.
c) **Kosten:** Hashen von ~4600 Dateien pro Abgleich; Embeddings nur für Geändertes. Akku/CPU?
   Alternative zu (b): Abgleich nach jedem abgeschlossenen Sync-Lauf statt stündlich.
d) **Sichtbarkeit:** Einstellungen → Vault-Index zeigt „zuletzt abgeglichen …“.

## Kontext/Anker

- `app/src/main/rag/vaultRagManager.ts` — `setVault` :138, `startBuild` :309, `noteFileEvent` :446,
  `flushQueue`, Rescan-Marker `'*'`, `pendingChanges`
- `app/src/main/rag/vaultRetrieve.ts` — `selectForQuery` :140, Defaults :75–109, `verifyHits`
- `app/src/main/rag/localModel.ts` — `resolveLocalModel`; `app/src/main/rag/embed.ts` — lokale Embedding-Grenze
- `app/src/main/rag/ollamaActivity.ts` — Vordergrund/Pause
- `app/src/main/index.ts:7742–7990` — Vault-RAG-IPC (`vault-rag-query` :7793, `vault-rag-answer` :7822)
- `app/src/main/noteAgent/loop.ts:188–229` — Werkzeug-Allowlist; `:150–163` Lese-/Arbeitsweise-Prompt
- `app/src/main/noteAgent/skills.ts:588` — `note_search` im Agenten; `telegram/agent/tools/notes.ts:47`
- `CLAUDE.md` Abschnitt „Vault-Index“ (mtime ist kein Frischebeweis, lokal = Metadaten, Opt-in pro Vault,
  Watcher-Fanout, Floor ohne Top-1-Fallback)
- `docs/vault-chat-plan.md`, `docs/codex-collab/vault-chat-plan-review.md`

## Codex-Findings

### F01 — Cloud-Entscheidung: vorerst Option ii
Schwere: hoch
Stelle: app/src/main/index.ts:4564
Status: [OFFEN]
Bei Cloud-Routing erhält der Anbieter alle Werkzeugantworten des Agenten. `vault_search` würde mit Chunk-Texten zusätzliche, semantisch gefundene Notizen dorthin geben. Das widerspricht dem genannten Grundsatz zu Personen- und Maildaten. Option (i) ist deshalb nicht durch den Kartenhinweis gedeckt. Option (iii) schützt nur bekannte Ordner; Personenangaben können überall stehen, und `note_search`/`note_read` bleiben offen (`app/src/main/telegram/agent/tools/notes.ts:46–102`). Ein Mail-Ordnerfilter dürfte zudem nicht erst nach dem Ranking erfolgen (`app/src/main/rag/vaultRetrieve.ts:169–183`). Der heutige Cloud-Agent ist bereits eine Lücke in diesem Grundsatz; sie rechtfertigt keine weitere Datenquelle. Auch `CLAUDE.md:223` begründet die lokale Grenze für „Vault befragen“ mit den Mail-Notizen.
Vorschlag: Für das neue Werkzeug (ii) wählen: nur bei nachweislich lokalem Agent-Chatmodell anbieten, Main-seitig anhand des tatsächlich gewählten Backends/Modells prüfen. Daneben die bestehende Cloud-Freigabe für `note_search`/`note_read` als eigene Produktentscheidung klären; bis dahin keine Zusage „Personendaten bleiben lokal“. Option (iii) höchstens als zusätzliche, ausdrücklich unvollständige Schranke.

### F02 — Lokalitätsprüfung muss Chat- und Embedding-Modell trennen
Schwere: hoch
Stelle: app/src/main/index.ts:4571
Status: [OFFEN]
Der Agent kann `ollama`, `lmstudio` oder Cloud als Chat-Backend wählen (`:4564–4578`). `resolveLocalModel` prüft nur Ollama-Modelle per `/api/tags` (`app/src/main/rag/localModel.ts:94–117`); die Prüfung des Embedding-Modells in 1b beweist nichts über das Chatmodell. Ein LM-Studio-Backend ist in der Route lokal konfiguriert, wird aber mit diesem Resolver nicht verifiziert. Ein Ollama-Modell mit Cloud-Suffix/`remote_host` kann trotz fehlendem `params.cloud` entfernt laufen. Die Allowlist im Loop allein ist damit keine verlässliche Cloud-Grenze.
Vorschlag: Backend und Modell aus der Main-seitig aufgelösten `chatOptions` ableiten. Für Ollama `resolveLocalModel` auf das Chatmodell anwenden; für LM Studio eine eigene überprüfbare Lokalitätsregel festlegen oder das Werkzeug bis dahin nicht freigeben. Das Embedding-Modell unabhängig davon lokal prüfen.

### F03 — Werkzeug-Verfügbarkeit ist mehr als „Index geladen“
Schwere: mittel
Stelle: app/src/main/rag/vaultRagManager.ts:252
Status: [OFFEN]
`getStatus` lädt den vollständigen Container, meldet aber auch bei `excludeMismatch` oder `policyOutdated` `index.exists=true` (`:260–277`) und vergleicht den Digest nicht mit dem aktuell gewählten Embedding-Modell. `query` lädt den Container selbst (`:534–549`); erst `queryVaultIndex` prüft den aktuellen Digest und die Dimension (`app/src/main/rag/vaultRetrieve.ts:390–400`). Ein einmaliger Angebots-Check kann zwischen Start und Aufruf außerdem veralten. „Kein Werkzeug, das nur Fehler liefert“ ist so nicht garantierbar; eine volle Status-Abfrage vor jedem Agent-Lauf kostet Speicher/I/O.
Vorschlag: Verfügbarkeit im Main pro Lauf mit Modul, Opt-in, lesbarem Index und aktueller Identität prüfen, möglichst ohne mehrfaches Voll-Laden. Beim Werkzeugaufruf trotzdem Fehlerfälle sauber melden und dem Agenten `note_search` als Fallback nennen. Inkompatiblen Index als „Neuaufbau nötig“ anzeigen, nicht still als nutzbar.

### F04 — Suchauszug ist bereits gelesener Inhalt
Schwere: hoch
Stelle: app/src/main/rag/vaultRetrieve.ts:25
Status: [OFFEN]
Ein `VaultHit` enthält den Chunk-Text. Wenn `vault_search` diesen als Werkzeugantwort liefert, hat das Modell den Auszug tatsächlich gesehen (`app/src/main/noteAgent/loop.ts:329–342`); „Treffer zählen NICHT als gelesen, erst `note_read`“ aus 1d ist daher sachlich falsch. Umgekehrt liest `note_read` maximal 8000 Zeichen (`app/src/main/telegram/agent/tools/notes.ts:100–102`), obwohl sein Beschreibungstext „vollen Inhalt“ sagt. Die bestehende `run.sources`-Liste erfasst nur erfolgreiche `note_read`-Aufrufe als bloßen Basenamen (`app/src/main/noteAgent/skills.ts:561–569`), ohne Abschnitt oder Aussageprüfung.
Vorschlag: Provenienz getrennt benennen: „Suchauszug gesehen“ und „Notiz bis 8000 Zeichen gelesen“, jeweils mit Vault-Pfad und ggf. Abschnitt. `vault_search` nicht still zu `run.sources` als „gelesen“ hinzufügen. Aus Trefferlisten weder Fußnoten noch „belegt“ ableiten; dafür ist eine eigene Aussageprüfung nötig.

### F05 — Frischeprüfung beweist keine vollständige Suche
Schwere: mittel
Stelle: app/src/main/rag/vaultRetrieve.ts:403
Status: [OFFEN]
`verifyHits` liest und hasht nur die bereits ausgewählten Treffer (`:414` und `:261–364`). Veraltete, gelöschte oder inzwischen ausgeschlossene Treffer fallen weg; die Rangliste wird danach nicht aus weiteren Kandidaten aufgefüllt. Dateien, die seit dem letzten Indexlauf neu hinzukamen oder relevanter wurden, können gar nicht kandidieren. Deshalb bedeutet „Keine Treffer“ nur „keine frischen Treffer im aktuellen Index über dem Floor“, nicht „im Vault gibt es nichts“; `noFreshSource` und `belowFloor` sind unterschiedliche Zustände (`:411–422`).
Vorschlag: Diese Einschränkung im Tool-Ergebnis und im Agent-Prompt abbilden. Bei leerem/ausgedünntem Ergebnis auf `note_search` ausweichen und Indexalter/Abgleichstatus nennen; keine Vollständigkeit oder Belegtheit suggerieren.

### F06 — 8 Treffer begrenzen das Prompt-Budget nicht
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:263
Status: [OFFEN]
Jede Werkzeugantwort bleibt über die Iterationen im Nachrichtenverlauf (`:329–342`). Acht vollständige Chunks pro Aufruf können mehrfach anfallen; danach kommen `note_read` mit bis zu 8000 Zeichen je Notiz und ggf. Anhang-/Skill-Inhalte. Der Kontext-Überlauf wird erst nach einem Modellaufruf erkannt (`:263–275`). „Ausschnitt gekappt“ in 1f nennt weder eine Gesamtschranke noch eine sichtbare Kürzungsmarke.
Vorschlag: Für `vault_search` harte Grenzen für Query-Länge, `max_results`, Zeichen je Auszug und gesamte Werkzeugantwort festlegen, mit explizitem `… gekürzt`. Modell zum gezielten Nachlesen einzelner Pfade anleiten; nicht wiederholte große Trefferblöcke fördern.

### F07 — Agent-Abbruch muss die Suchanfrage erreichen
Schwere: mittel
Stelle: app/src/main/rag/vaultRagManager.ts:525
Status: [OFFEN]
`query` akzeptiert ein `AbortSignal` und reicht es zur Einbettung weiter (`:529`, `:544–548`); der Agent-Loop bricht zwar zwischen Werkzeugaufrufen ab (`app/src/main/noteAgent/loop.ts:315–330`), ein neu registriertes Werkzeug muss aber ausdrücklich `run.abort.signal` weitergeben. Ohne das kann eine abgebrochene Agent-Anfrage lokal weiterrechnen, während der nächste Lauf startet. Die IPC-Abfrage „Vault befragen“ übergibt selbst kein Signal (`app/src/main/index.ts:7793–7803`) und ist dafür keine vollständige Vorlage.
Vorschlag: `vault_search` direkt in Main an den Manager anbinden und das Lauf-Signal übergeben; Abbruch im Tool als Abbruch behandeln, nicht als „keine Treffer“.

### F08 — Pausenregel schützt nur Embedding-Requests
Schwere: mittel
Stelle: app/src/main/rag/vaultIndexer.ts:371
Status: [OFFEN]
Der Agent wird in `startRun` ungeachtet des Backends für seine gesamte Laufzeit als Ollama-Vordergrund gezählt (`app/src/main/noteAgent/runRegistry.ts:193–198`). Die Aussage „Indexer pausiert ohnehin“ trägt damit heute auch bei Cloud-Agenten, widerspricht aber der allgemeinen Cloud-Aussage in `CLAUDE.md:219`. Die Aktivitätsregel bricht laufende Embeddings ab; vor jedem Embedding wartet `gate` (`app/src/main/rag/vaultIndexer.ts:285–305`). Vault-Scan, Datei-Hashing und finales Zusammensetzen/Schreiben (`:401–403`, `:467–493`, `:539–595`) sind dadurch nicht pausiert und können mit einem Agent-Lauf um I/O und Speicher konkurrieren.
Vorschlag: Im Plan präzise von Embedding-Pause sprechen. Für automatische Vollabgleiche zusätzlich Leerlauf/Fensterzustand und ggf. Drosselung des Datei-Scans vorsehen. Die Cloud-Agent-Zählung bewusst entscheiden; wird sie korrigiert, braucht `vault_search` eine eigene Vordergrund-Aktivität nur um die lokale Embedding-Abfrage.

### F09 — Automatischer Abgleich kann zum Vollaufbau werden
Schwere: hoch
Stelle: app/src/main/rag/vaultIndexer.ts:406
Status: [OFFEN]
`startBuild(..., 'incremental', ..., true)` verspricht keinen rein inkrementellen Lauf. Der Job bildet die Identität aus aktuellem Modell/Digest/Dimension/Versionen (`:376–390`). Ist kein kompatibler Container vorhanden, lädt er nur die Datei dieser Identität oder startet ohne Bestand (`:406–415`); danach müssen alle Chunks eingebettet werden. Der vorhandene Watcher prüft vor Start nur, ob *irgendeine* Indexdatei existiert (`app/src/main/rag/vaultRagManager.ts:500–514`). Ein bloßes „Index autorisiert/vorhanden“ in 2a verhindert daher nach Modellwechsel, Versionswechsel oder Korruption keinen stillen teuren Neubau.
Vorschlag: Automatik nur bei validiertem, wiederverwendbarem Bestand gleicher Embedding-Identität starten. Andernfalls „Neuaufbau erforderlich“ anzeigen und den expliziten Erstellen/Neuaufbauen-Weg nutzen. Opt-in bleibt notwendig, ist aber allein kein Kosten-Gate.

### F10 — `rescanAll` ist ein kompletter Lese- und Schreibdurchlauf
Schwere: hoch
Stelle: app/src/main/rag/vaultIndexer.ts:473
Status: [OFFEN]
Mit `rescanAll=true` greift der Schnellpfad für unveränderte Dateien nicht (`:473–483`): jede indexierbare Datei wird erneut gelesen und gehasht, nach rekursivem Scan mit Pfadprüfung/`stat` (`:128–171`). Auch ohne neue Embeddings werden alle behaltenen Vektoren zusammengesetzt und der ganze Container atomar neu geschrieben (`:563–594`; Messnotiz: 19.030 Chunks, Peak-RSS 389 MB). Beim Öffnen plus stündlich ist das für große Vaults und Laptops kein kostenloser Hintergrundcheck; `startBuild` meldet zudem schon nach Jobstart Erfolg (`app/src/main/rag/vaultRagManager.ts:371–411`).
Vorschlag: Öffnungsabgleich asynchron und erst nach UI-Bereitschaft/Leerlauf; nicht pro Öffnen ohne Zeitgrenze. Zunächst Messwerte für realen Vault und no-op-Abgleich erheben, Intervall danach festlegen. „Zuletzt abgeglichen“ nur nach erfolgreich abgeschlossenem Job speichern, nicht nach dessen Start; no-op möglichst ohne Container-Neuschreiben ermöglichen.

### F11 — Öffnungs-Hook hat einen Initialisierungs-Wettlauf
Schwere: mittel
Stelle: app/src/main/index.ts:6968
Status: [OFFEN]
Beim `watch-directory` wird `setVault(dirPath)` ausdrücklich ohne `await` gestartet; erst danach wird der Watcher-Fanout eingerichtet (`:6968–6971`). `setVault` lädt Konfiguration/Modulflag asynchron und kann einen alten Job abbrechen (`app/src/main/rag/vaultRagManager.ts:138–155`, `:159–175`). Ein zusätzliches fire-and-forget-`startBuild` an dieser Stelle kann gegen die Initialisierung oder einen Vault-Wechsel laufen; der Manager schützt zwar spätere Starts per Generation, der Plan benennt aber keinen geordneten Lifecycle.
Vorschlag: Öffnungsabgleich erst nach abgeschlossenem `setVault` für genau denselben genehmigten Vault anstoßen; bei Wechsel/Schließen geplante Timer und Jobs verwerfen. Ein einziger Scheduler für Öffnen, Watcher und Sync sollte Starts zusammenfassen.

### F12 — Stündlich und nach Sync sind kein Entweder-oder
Schwere: mittel
Stelle: app/src/main/sync/syncEngine.ts:1328
Status: [OFFEN]
Der Sync meldet einen erfolgreichen Abschluss über `sync-progress: done` (`:1328–1340`), auch bei Auto-Sync; `sync-now` deckt nur den manuellen Pfad ab (`app/src/main/index.ts:10318–10323`). Der Renderer speichert daraus `lastSyncTime` (`app/src/renderer/stores/syncStore.ts:520–540`), was als Index-Scheduler im Main zu indirekt und beim Vault-Wechsel fehleranfällig wäre. Watcher-Events können heruntergeladene Dateien bereits nachziehen, erfassen aber verpasste Ereignisse nicht sicher. Ein stündlicher Scan ersetzt den zeitnahen Sync-Abgleich nicht; ein Sync-Abgleich erfasst Änderungen durch andere Editoren bei geschlossener App nicht.
Vorschlag: Erfolgreichen Sync im Main als Anlass für einen entprellten Abgleich desselben Vaults verwenden, mit Index-Job/Watcher zusammenfassen und ohne Downloads keinen Vollscan erzwingen. Dazu einen seltenen Leerlauf-Check als Sicherheitsnetz statt starren Stundentakt planen; Fehler- und Abbruchläufe nicht als „abgeglichen“ zählen.

### F13 — Dokumentation und UI-Aussage zum Retrieval aktualisieren
Schwere: niedrig
Stelle: CLAUDE.md:221
Status: [OFFEN]
Die Vault-Index-Dokumentation nennt noch „Cosine-only“ und Floor 0,30; der echte Code verwendet Floor 0,50 und Lexical-Reranking mit Gewicht 0,3 (`app/src/main/rag/vaultRetrieve.ts:75–82`, `:140–153`). Für den neuen Agenten ist daher die Aussage „Suche nach Bedeutung“ richtig, aber ein leerer Treffer kann auch aus der kalibrierten Schwelle und den Filtern folgen. Die Kartenzeile „Unterlagen … zusätzlich lesen“ wäre ungenau: der Agent kann nur indexierte Markdown-Chunks suchen und danach `.md` per `note_read` lesen (`app/src/shared/rag/vaultIndex.ts:205–224`; `app/src/main/telegram/agent/tools/notes.ts:92–102`).
Vorschlag: CLAUDE.md an den aktuellen Retrieval-Code angleichen. Wenn die Karte ergänzt wird, bedingt formulieren: „Bei aktivem Vault-Index auch Suche nach Bedeutung in indexierten Markdown-Notizen“; kein „alle Unterlagen“ und keine implizite Vollständigkeit.

### Empfehlung

1. Zuerst die Cloud-Grenze festlegen: **Option (ii)** für `vault_search`, anhand der tatsächlichen Agent-Route im Main; zugleich die bestehende Cloud-Lesefreigabe als separates Datenschutzproblem entscheiden. Option (iii) reicht nicht als Schutz vor Personendaten.
2. Danach das Werkzeug mit gemeinsamem Retrieval, Lauf-Abbruchsignal, hartem Antwortbudget und ehrlicher Kennzeichnung von Suchauszügen bauen. Leere Treffer und Quellenstatus getrennt behandeln.
3. Den Index-Abgleich zunächst nach Öffnen und erfolgreichem Sync als gedrosselten, zusammengefassten Hintergrundlauf für einen nachweislich kompatiblen Bestand planen. Kosten an großen Vaults messen; erst dann ein seltenes Leerlauf-Intervall bestimmen. Keinen stündlichen Vollscan und keinen stillen Neubau als Default zusagen.

### F14 — Schranke in den Note-Agent-Adapter, nicht global in Telegram
Schwere: hoch
Stelle: app/src/main/noteAgent/skills.ts:57
Status: [OFFEN]
`note_search` und `note_read` des Notiz-Agenten sind Adapter auf dieselben Werkzeugobjekte wie der Telegram-Agent (`:57–66`, `:561–596`; `app/src/main/telegram/agent/tools/notes.ts:46–107`). Eine Cloud-Sperre direkt in `notes.ts` hätte ohne neuen Kontext entweder auch Telegram zur Folge oder müsste dort aus Renderer-Parametern erraten werden. Der heutige Note-Agent-Adapter verwirft sogar alle Ausschlüsse (`excludedFolders: []`). Zusätzlich ignoriert `searchVault` sein vorhandenes Feld `excludedFolders` vollständig: Es scannt und bewertet jede gefundene Markdown-Datei (`app/src/main/telegram/vaultQueries.ts:120–168`). „Vor dem Ranking“ ist mit dem jetzigen Aufruf daher noch nicht umgesetzt.
Vorschlag: Beim Start des Notiz-Agenten eine Main-seitig ermittelte, unveränderliche Lese-Policy in `AgentRun`/`NoteAgentContext` ablegen. `skills.ts` setzt sie für seine `note_search`-/`note_read`-Adapter durch. Die generische `searchVault`-Funktion darf optional ausgeschlossene kanonische Wurzeln vor Lesen/Bewerten anwenden; Telegram bleibt mit seinem eigenen Kontext unverändert. Tests müssen beide Aufrufer getrennt abdecken.

### F15 — Cloud-Erkennung muss vor jedem Vault-Inhalt fail-closed stehen
Schwere: kritisch
Stelle: app/src/main/index.ts:4560
Status: [OFFEN]
Für OpenRouter/LLMBase ist `isCloudChatBackend(chatOptions.backend)` zuverlässig (`app/src/main/llm/chatClient.ts:29–35`). Ein Ollama-Cloud-Modell bleibt dagegen `backend: 'ollama'` (`app/src/main/index.ts:4577–4578`). Die Renderer-Erkennung sieht nur `:cloud`/`-cloud` im Namen (`app/src/renderer/components/Agent/AgentView.tsx:175–181`); ein neutral benanntes Modell mit `remote_host` erkennt nur `resolveLocalModel` aus den echten `/api/tags`-Metadaten (`app/src/main/rag/localModel.ts:94–117`). Der aktuelle Agent-Start ruft diese Prüfung für das Chatmodell nicht auf. Damit kann ein als lokal behandelter Lauf Inhalte an Ollama Cloud geben.
Vorschlag: Nach dem Auflösen von `chatOptions`, aber vor Skills, Gedächtnis, Anhängen und Loop, im Main klassifizieren: OpenRouter/LLMBase = Cloud; Ollama nur nach frischem erfolgreichem `resolveLocalModel(chatOptions.ollamaModel)` = nachweislich lokal; `cloud-tag`/`remote` = Cloud. `missing`, `ambiguous`, `no-digest` und `unreachable` dürfen keine Freigabe von Vault-Lesepfaden bewirken; Lauf ablehnen oder mit gesperrten Vault-Quellen starten. Die Klassifikation samt Anbieterbezeichnung in den Run übernehmen, nicht später aus dem Modellnamen rekonstruieren.

### F16 — `inboxFolderName` ist keine stabile Mail-Grenze
Schwere: hoch
Stelle: app/src/renderer/components/Settings/EmailSettingsTab.tsx:252
Status: [OFFEN]
Der Ordnername ist ein frei änderbares globales UI-Setting. Ändern speichert nur den neuen Wert (`app/src/renderer/stores/uiStore.ts:1429–1431`); der alte Ordner wird weder umbenannt noch als geschützt vermerkt. Neue Mailnotizen werden jeweils in den gerade übergebenen Namen geschrieben (`app/src/main/index.ts:12499–12513`). Nach einer Umbenennung bleiben alte Mailnotizen deshalb in einem nun ungeschützten Ordner. Ein rein lexikalischer Präfixvergleich wäre außerdem durch alternative Separatoren, `..`, Groß-/Kleinschreibung, Unicode-Varianten und einen Vault-internen Symlink-Alias fehleranfällig. Die Mail-Erzeugung selbst verwendet hier nur `validatePath`, keine kanonische Symlink-Prüfung (`app/src/main/index.ts:1177–1184`, `:12369–12378`).
Vorschlag: Geschützte Mailwurzeln pro Vault Main-seitig führen: aktueller und Default-Ordner plus bei Änderungen persistierte Historie. Vor einer Entscheidung vorhandene Wurzeln per `realpath` kanonisieren und Zugehörigkeit mit `path.relative` prüfen. Zusätzlich echte Mailnotizen unabhängig vom Ablageort anhand ihres App-Frontmatters (`email-id`, Tag `email`; `app/src/main/index.ts:12583–12593`) erkennen. Ungültige oder nach außen zeigende Mailordner fail-closed behandeln.

### F17 — `note_read` braucht eine kanonische Einzeldatei-Prüfung
Schwere: hoch
Stelle: app/src/main/telegram/agent/tools/notes.ts:92
Status: [OFFEN]
Ein Ausschluss in der Suchliste schützt den direkten Aufruf nicht: `note_read` akzeptiert einen Vault-relativen Pfad und liest ihn nach `resolveInVaultSafe` (`:92–102`). Damit kann das Modell einen bekannten Pfad aus Auftrag, Wikilink, Skill, Gedächtnis oder früherer Tool-Antwort direkt anfordern. `.mindgraph` ist zwar beim rekursiven `note_search` bereits verborgen (`app/src/main/telegram/vaultQueries.ts:16–37`), bei `note_read` aber nicht. Eine Prüfung des rohen Arguments lässt Alias-Pfade offen; `resolveInVaultSafe` liefert gerade den kanonischen Zielpfad und löst Vault-interne Symlinks auf (`app/src/main/telegram/agent/tools/vaultPaths.ts:47–56`).
Vorschlag: Im Note-Agent-Adapter das Ziel zuerst kanonisch auflösen, dann gegen `.mindgraph`, alle geschützten Mailwurzeln und Mail-Frontmatter prüfen und erst danach lesen. Dieselbe Policy muss Suchtreffer vor dem Ranking prüfen. Ablehnungen als klare Datenschutzsperre ausgeben, nicht als „Datei fehlt“.

### F18 — Mail-Anhänge bei Cloud ablehnen
Schwere: hoch
Stelle: app/src/main/noteAgent/contextFiles.ts:123
Status: [OFFEN]
Zur offenen Frage: Ja, Vault-Anhänge aus einem geschützten Mailordner oder `.mindgraph` müssen bei einem Cloud-Lauf abgelehnt werden. „Vom Nutzer gewählt“ hebt den ausdrücklich harten Grundsatz „Mail-Inhalte nie in die Cloud“ nicht auf; ohne Startdialog würde die Kartenbehauptung „Mail-Notizen ausgenommen“ sonst direkt falsch. Die Registry kennt intern absoluten Pfad, Vault-Zugehörigkeit und kanonischen Vault-Root (`:24–51`, `:123–156`), gibt diese Angaben dem Loop aber absichtlich nicht heraus (`:191–198`). Neben `read_attachment` existieren `list_context_folder`, `read_context_file` und `collect_table` als weitere Pfade in denselben Ordner (`app/src/main/noteAgent/skills.ts:300–448`).
Vorschlag: Anhängen weiterhin erlauben, damit derselbe Anhang lokal nutzbar bleibt; beim Cloud-Start alle Attachment-IDs Main-seitig gegen die kanonischen Sperrwurzeln prüfen und den Start mit benanntem Anhang ablehnen. Bei Ordner-Anhängen zusätzlich jede Datei unmittelbar vor dem Lesen prüfen, damit Umbenennen/Symlink-Wechsel und Unterordner nicht umgehen. Externe Dateien oder außerhalb kopierte Mailinhalte kann die App nicht zuverlässig als Mail erkennen; das muss der Kartentext ausdrücklich von der Garantie ausnehmen.

### F19 — Prompt lädt weitere Vault-Inhalte an den Werkzeugen vorbei
Schwere: hoch
Stelle: app/src/main/index.ts:4606
Status: [OFFEN]
Die vorgeschlagene Sperre erfasst nur zwei Tools, der Cloud-Prompt bekommt aber weitere Vault-Inhalte: Skill-Namen/-Beschreibungen und Agent-Gedächtnis werden vor dem Lauf geladen (`:4606–4609`); das Gedächtnis steht immer im Systemprompt (`app/src/main/noteAgent/loop.ts:95–109`). `use_skill` und `read_skill_file` lesen anschließend Body und Zusatzdateien aus dem Vault (`app/src/main/noteAgent/skills.ts:500–557`). Außerdem akzeptiert der Main `noteContent` und der Loop setzt bis zu 8000 Zeichen als „AKTUELLE NOTIZ“ ein (`app/src/main/index.ts:4418–4424`; `app/src/main/noteAgent/loop.ts:65`, `:174–175`). Die heutige Agent-Karte sendet zwar leer (`app/src/renderer/components/Agent/AgentView.tsx:403–408`), die Main-Grenze garantiert das aber nicht.
Vorschlag: Die Cloud-Policy vor diesen Reads bestimmen. Main-seitig für Cloud `noteContent` entweder selbst anhand eines autorisierten Notizpfads laden und prüfen oder nur leer akzeptieren. Skills, Skill-Dateien und Agent-Gedächtnis in der Datenschutzbeschreibung nennen; wenn der harte Mailinhalt-Schutz gelten soll, brauchen auch sie Provenienz/Schutz oder dürfen bei Cloud nicht ungeprüft in den Prompt.

### F20 — Brain und Projektstatus tragen Mailinhalt aus dem Mailordner heraus
Schwere: kritisch
Stelle: app/src/main/brain/dailyConsolidation.ts:65
Status: [OFFEN]
Eine Ordnersperre schützt nur Originale. Brain-Tagesnotizen enthalten Absender und Betreff relevanter Mails (`:65–76`) und markieren `emails` als Quelle (`:260–283`). Projektstatus-Drafts lesen Mailnotizen ausdrücklich ein (`app/src/main/projectStatus/crystallizer.ts:254–300`, `:817–827`) und speichern `emails_included` im Frontmatter (`:763–790`). Beide liegen außerhalb des Mailordners; der Agent-Prompt fordert `note_search` heute sogar ausdrücklich über alle Notizen einschließlich Brain auf (`app/src/main/noteAgent/loop.ts:156–161`). Gleiches gilt grundsätzlich für manuell kopierte Mailauszüge in normalen Notizen oder Skills. Claudes Satz „Mail-Notizen ausgenommen“ verhindert daher nicht, dass Mail-Inhalte an die Cloud gehen.
Vorschlag: Mindestens die bekannten abgeleiteten Typen bei Cloud anhand ihres Frontmatters (`type: brain-day`, `sources: emails`, `type: project-status-draft`, `emails_included`) aus Suche und Lesen ausschließen. Für frei kopierte Inhalte gibt es ohne Herkunftsmarkierung keine zuverlässige Erkennung. Entweder den harten Grundsatz auf entsprechend markierte/direkte Mailquellen begrenzen und das ehrlich sagen, oder Cloud-Vault-Lesen insgesamt sperren, bis eine durchgängige Herkunftsmarkierung existiert.

### F21 — Cloud-Shell umgeht jede Notizwerkzeug-Sperre
Schwere: kritisch
Stelle: app/src/main/index.ts:4684
Status: [OFFEN]
Cloud-Modell und Shell sind heute kombinierbar. Bei `readScope: 'vault'` gibt der Main der Shell den gesamten Vault als Lesepfad (`:4684–4689`); das Sandbox-Profil sperrt davon nur `.mindgraph`, nicht den Mail-Notiz-Ordner (`app/src/main/noteAgent/shellSandbox.ts:47–76`). Ein Cloud-Agent kann daher Mailnotizen mit `cat`, Python oder jedem anderen erlaubten Programm lesen, und die Befehlsausgabe geht als Tool-Ergebnis an das Modell. Der Dialog weist sogar allgemein darauf hin, dass Cloud Befehlsausgaben erhält (`app/src/main/index.ts:4694–4699`), verspricht aber keine Mailausnahme.
Vorschlag: Für Cloud-Läufe entweder Shell vollständig sperren oder nur `readScope: attachments` zulassen und dabei F18 erzwingen. Soll Vault-Shell bei Cloud bleiben, muss das OS-Profil alle kanonischen/historischen Mailwurzeln zusätzlich nach der Vault-Erlaubnis wieder sperren und der Selbsttest genau diese Sperre prüfen. Eine Prompt-Regel reicht hier nicht.

### F22 — Kartenhinweis wäre in der vorgeschlagenen Form falsch
Schwere: hoch
Stelle: app/src/renderer/utils/i18n/agentCard.ts:61
Status: [OFFEN]
„Vault-Notizen … Mail-Notizen ausgenommen“ klingt wie eine Inhaltsgarantie, die F16–F21 widerlegen. Zugleich bezeichnet die Karte nicht nachweislich lokale Routen bewusst als „Ausführungsort nicht geprüft“ (`:61`), während sie Ollama Cloud nur per Namenssuffix erkennt. Im laufenden Zustand setzt sie das Cloud-Etikett sogar nur, wenn `run.cloudLabel` aus einem expliziten OpenRouter/LLMBase-Weg stammt (`app/src/renderer/components/Agent/AgentView.tsx:683–691`); ein Ollama-Cloud-Modell wird nach Start dadurch als lokale Route gezeigt. Der heutige Text nennt Anhänge und Personendaten korrekt als Cloud-Inhalt (`app/src/renderer/utils/i18n/agentCard.ts:64`); ein pauschales „Mail-Notizen ausgenommen“ würde diese Warnung verwässern.
Vorschlag: Route und Label aus der Main-seitigen Klassifikation F15 an den Renderer zurückgeben. Ehrliche Kurzform nur für tatsächlich Erzwungenes: „Direkte Mailnotizen aus den geschützten Mailordnern und interne `.mindgraph`-Daten werden gesperrt. Andere Vault-Notizen und ausdrücklich angehängte Dateien gehen an {Anbieter}; kopierte oder abgeleitete Mailinhalte kann die App nicht vollständig erkennen.“ Wenn der Produkttext „Mail-Inhalte gehen nie“ sagen soll, bleibt als ehrliche Grenze Cloud-Vault-Lesen einschließlich Vault-Anhängen/Skills/Shell aus.
Ein zusätzlicher Startdialog ist dann nicht nötig: Die dauerhaft sichtbare Karte genügt, sofern ihre Route aus dem Main kommt, die Schranken technisch greifen und der Text diese Grenzen vor dem Start vollständig nennt.

### Empfehlung Runde 2

1. Zuerst eine einzige Main-seitige Laufklassifikation und Lese-Policy einführen; sie muss Ollama-Metadaten berücksichtigen und vor jedem Vault-Inhalt feststehen. Die Telegram-Werkzeuge nicht global mit Note-Agent-Produktregeln verändern.
2. Direkte Mailquellen über kanonische aktuelle/historische Wurzeln **und** Mail-Frontmatter sperren: Suche vor dem Ranking, direkter Read, `.mindgraph`, alle Ordnerwerkzeuge und Vault-Anhänge. Zur offenen Frage: bekannte Mailordner-Anhänge bei Cloud am Start ablehnen.
3. Vor Freigabe des Kartentexts die Nebenkanäle schließen: Brain/Projektstatus, Skill/Gedächtnis/`noteContent` und besonders Cloud-Shell. Ohne durchgängige Herkunftsmarkierung keine Garantie „Mail-Inhalte ausgenommen“ geben; die technisch engere Ordnersperre samt Grenzen konkret benennen.

### F23 — Die Inhaltsliste zum Chatanbieter ist noch unvollständig
Schwere: hoch
Stelle: app/src/main/noteAgent/loop.ts:337
Status: [OFFEN]
Die neue Liste nennt Eingaben und gelesene Quellen, aber nicht alles, was tatsächlich in späteren Modellanfragen landet. Der Loop hängt jede erfolgreiche Werkzeugantwort und auch Werkzeugfehler an den Nachrichtenverlauf (`:337–350`); dazu gehören erzeugte Entwürfe, Tabellen-/Dateibeschreibungen, Webtreffer sowie Pfade und Fehlermeldungen. Nach einem erfolgreichen Lauf startet außerdem automatisch eine weitere Anfrage an dasselbe Modell: Auftrag, Namen, Arten und Beschreibungen der erzeugten Dateien gehen für den Merksatz-Vorschlag erneut an den Anbieter (`app/src/main/noteAgent/memorySuggestion.ts:23–38`; Aufruf `app/src/main/index.ts:4796–4806`). „Agent-Gedächtnis“ bezeichnet dagegen nur den bereits gespeicherten Inhalt und deckt diese zweite Anfrage sprachlich nicht ab.
Vorschlag: Beim Chatanbieter vollständig nennen: Auftrag, Anhänge, eingelesene Vault-/Skill-/Gedächtnisinhalte, Suchauszüge, alle Werkzeugergebnisse und -fehler sowie erzeugte Entwürfe. Den automatischen Merksatz-Vorschlag separat ausweisen: „Nach einem erfolgreichen Lauf gehen Auftrag und Ergebnisbeschreibungen nochmals an denselben Modellanbieter; gespeichert wird der Vorschlag erst nach deinem Klick.“

### F24 — Web hat drei Datenwege statt nur „abgerufene Seiten“
Schwere: hoch
Stelle: app/src/main/noteAgent/skills.ts:1051
Status: [OFFEN]
`web_search` übermittelt die vom Modell formulierte Suchanfrage an SearXNG, Linkup oder Tavily (`app/src/main/webResearch/providers.ts:32–60`, `:65–95`, `:98–128`). Weil das Modell die Anfrage aus Vault-Inhalten ableiten kann, können darin Namen oder Mailangaben stehen. `web_fetch` ruft danach die Zielwebsite direkt auf (`app/src/main/webResearch/fetchExtract.ts:72–79`), wodurch diese mindestens Anfrage-, Netzwerk- und IP-Daten erhält. Erst der lokal extrahierte Seiteninhalt wird als Werkzeugantwort wieder an das Chatmodell gegeben (`app/src/main/noteAgent/loop.ts:337–342`). Die geplante Form „mit Web die abgerufenen Seiten“ nennt nur den letzten dieser Wege.
Vorschlag: Im Aufklapper nach Empfänger trennen: „Suchanfragen, möglicherweise aus deinen Unterlagen abgeleitet → eingestellter Suchdienst; angeforderte URL → jeweilige Website; Treffer und gelesene Seiten → Modellanbieter.“ Den tatsächlichen Suchdienstnamen aus der Main-Konfiguration anzeigen.

### F25 — Bild-Prompts können sehr wohl Notiz- und Mailangaben enthalten
Schwere: hoch
Stelle: app/src/main/noteAgent/skills.ts:949
Status: [OFFEN]
Der Agent formuliert den `generate_image`-Prompt selbst und kann dafür zuvor gelesene Vault-Inhalte verwenden; genau dieser Text geht an Google (`:962–975`; `app/src/main/imageGen/imagenService.ts:143–159`). Die derzeitige Karte nennt nur einen „Bildauftrag“ (`app/src/renderer/utils/i18n/agentCard.ts:70`), während die Einstellungen sogar „keine Notiz- oder Mail-Inhalte, nur der Bild-Prompt“ versprechen (`app/src/renderer/utils/translations.ts:97`, `:3075`). Das ist eine Scheingrenze: Der Bild-Prompt kann Notiz- oder Mailinhalt in umformulierter oder wörtlicher Form enthalten. Google ist außerdem ein eigener Empfänger, unabhängig davon, ob das Chatmodell lokal oder in der Cloud läuft.
Vorschlag: Einstellungen und Karte gemeinsam korrigieren: „Wenn der Agent ein Bild erzeugt, geht sein Bild-Prompt an Google. Er kann Angaben aus Auftrag, Notizen oder Anhängen enthalten.“ Dies bedingt anzeigen, sobald das Bildwerkzeug verfügbar ist, auch bei lokalem Chatmodell.

### F26 — F15 braucht zwei Main-Verträge: Vorabprüfung und Laufklassifikation
Schwere: kritisch
Stelle: app/src/main/index.ts:4560
Status: [OFFEN]
Die autoritative Stelle im Lauf ist unmittelbar nach dem Aufbau der echten `chatOptions` (`:4560–4579`) und vor Skill- und Gedächtnislesen (`:4606–4609`). Für Ollama muss dort ein frischer `resolveLocalModel`-Befund ausgewertet werden; Namenssuffixe im Renderer reichen nicht. Eine Rückgabe des `note-agent-run`-Handlers kann die Karte aber erst **nach** dem Start aktualisieren und damit die Zusage „vor dem Lauf“ nicht erfüllen. Heute berechnet der Renderer die Route vorher selbst aus Modellname und `params.cloud` (`app/src/renderer/components/Agent/AgentView.tsx:169–181`), und der laufende Store übernimmt weiter Rendererangaben statt eines Main-Befunds (`app/src/renderer/stores/noteAgentStore.ts:352–395`). Zwischen einer Vorabprüfung und dem Start können sich Modellmetadaten zudem ändern.
Vorschlag: Einen Main-Preflight für die aktuell gewählte Route einführen und bei Backend-/Modellwechsel neu laden; Rückgabe als typisiertes `{ kind: 'local' | 'cloud' | 'unverified', providerLabel, model }`. Beim Start denselben Klassifizierer erneut ausführen, das Ergebnis im `AgentRun` speichern und in der unmittelbaren Startantwort zurückgeben. Die Karte zeigt vor dem Start den Preflight und während des Laufs ausschließlich den gespeicherten Laufbefund. Tests müssen einen Metadatenwechsel zwischen Preflight und Start abdecken.

### F27 — „Nicht auflösbar“ und LM Studio brauchen eine ehrliche dritte Route
Schwere: hoch
Stelle: app/src/main/rag/localModel.ts:94
Status: [OFFEN]
`resolveLocalModel` kann neben Cloud auch `missing`, `ambiguous`, `no-digest` und `unreachable` liefern; daraus folgt weder lokal noch Cloud. Nach der festgelegten Produktlinie darf der Lauf weiter möglich bleiben, aber der Kartentext darf ihn nicht als lokal behandeln. LM Studio wird zwar über einen erzwungenen Loopback-Endpunkt angesprochen (`app/src/main/index.ts:4142–4145`), `/v1/models` beweist jedoch nicht, wo LM Studio das Modell tatsächlich ausführt. „Über LM Studio“ ist daher ein Transportbefund, kein Nachweis lokaler Modellausführung.
Vorschlag: Bei Ollama-Cloud-Tag/`remote_host` „Cloud über Ollama“ anzeigen; bei den übrigen Resolverfehlern „Ausführungsort nicht geprüft – Vault-Inhalte können den gewählten Modellweg verlassen“. Für LM Studio: „Über LM Studio auf diesem Rechner; Ausführungsort des Modells nicht geprüft.“ `vault_search` gemäß Nutzerentscheidung in beiden Fällen anbieten; Suchanfrage lokal einbetten und Suchauszüge als möglicherweise extern gesendet behandeln.

### F28 — Ein Opt-in genügt nur mit Main-Gate und erneuter Zustimmung
Schwere: kritisch
Stelle: app/src/shared/llmBackend.ts:116
Status: [OFFEN]
Der vorhandene Opt-in `canUseCloudForFeature('note-agent', …)` ist inhaltlich die richtige Ebene: Er autorisiert bereits Notizinhalte für die gesamte Funktion und ein zweiter `vault_search`-Opt-in würde `note_search`, Skills und Anhänge künstlich ausblenden. Technisch ist er aber nur ein Renderer-Gate. Der Main vertraut `params.cloud` und prüft beim Auflösen lediglich Route und Schlüssel (`app/src/main/index.ts:4431–4432`, `:4564–4570`), nicht das gespeicherte `cloudFeatures`. Ollama-Cloud läuft ohne `params.cloud` als Ollama-Weg und berührt diesen Opt-in gar nicht. Außerdem haben Bestandsnutzer „Notiz-Agent (Dateien erzeugen)“ unter dem alten, engeren Hinweis bestätigt (`app/src/renderer/components/Settings/CloudProviderSection.tsx:157–166`); das neue semantische Durchsuchen des ganzen Vaults war darin nicht erkennbar.
Vorschlag: Keinen zweiten Schalter pro Werkzeug einführen. Stattdessen den einen `note-agent`-Cloud-Opt-in verständlich auf „Aufträge mit Vault-Zugriff“ erweitern, bestehende Freigaben einmalig versioniert erneut bestätigen lassen und ihn im Main anhand gespeicherter Einstellungen erzwingen. Für Ollama-Cloud eine gleichwertige einmalige Funktionsfreigabe vorsehen. Ein manipuliertes `params.cloud` darf das Gate nicht umgehen; schwache Hardware bleibt nach bewusster Freigabe vollständig unterstützt.

### F29 — Telemetrie ist kein weiterer externer Empfänger, Fehlertexte schon Modellinhalt
Schwere: mittel
Stelle: app/src/shared/llmTelemetry.ts:70
Status: [OFFEN]
Die eingebaute LLM-Telemetrie enthält Modell, Backend, Zeiten, Token und Kosten, aber keine Prompts, Antworten oder Dateinamen (`:70–103`). Sie wird lokal im `userData`-Verzeichnis protokolliert (`app/src/main/llm/telemetryLedger.ts:8–17`, `:33–39`) und nicht an einen Telemetriedienst versandt. Sie als Cloud-Datenweg aufzulisten wäre deshalb ebenso irreführend wie sie ganz zu verschweigen, wenn „vollständig“ auch lokale Speicherung meint. Werkzeug- und Dienstfehler sind dagegen echte Modellinhalte, weil der Loop sie in die nächste Anfrage übernimmt (`app/src/main/noteAgent/loop.ts:343–350`); ein Google-Fehler kann beispielsweise bis zu 300 Zeichen der Dienstantwort enthalten (`app/src/main/imageGen/imagenService.ts:162–176`).
Vorschlag: Im Aufklapper einen kurzen lokalen Abschnitt ergänzen: „Die App speichert lokal technische Laufdaten wie Modell, Dauer, Token und Kosten; keine Aufträge oder Dateiinhalte. Es gibt keinen Telemetrie-Versand.“ Fehlertexte unter „Werkzeugergebnisse an den Modellanbieter“ einschließen, nicht als separaten Telemetriekanal darstellen.

### F30 — Shell-Netz und Apple Mail sind weitere bedingte Empfänger
Schwere: hoch
Stelle: app/src/shared/shellGuardrails.ts:10
Status: [OFFEN]
„Mit Shell alles, was die Shell lesen darf“ beschreibt nur, was über die Befehlsausgabe zum Chatmodell gelangt. Ist das Shell-Netz freigegeben (`:12–19`, `:25–27`), können bestätigte Befehle lesbare Inhalte zusätzlich an beliebige Netzziele senden. Die Rechner-Steuerung übergibt bei `computer_mail_draft` Empfänger, Betreff, Text und Anhänge an Apple Mail (`app/src/main/noteAgent/computerControl.ts:503–535`); ein dort konfiguriertes Konto kann Entwürfe synchronisieren. Das ist kein Versand durch MindGraph, aber ein weiterer Datenweg, den die pauschale Main-Dialog-Aussage „gibt keine nach draussen“ derzeit sogar verneint (`app/src/main/index.ts:4741`).
Vorschlag: Bedingt nennen: „Shell-Ausgaben → Modellanbieter; bei erlaubtem Shell-Netz können Befehle weitere Dienste kontaktieren.“ Für Rechner-Steuerung: „Mailentwürfe und Anhänge → Apple Mail; Synchronisierung richtet sich nach deinem Mailkonto.“ Den nativen Rechner-Dialog ebenfalls korrigieren und Dienste nicht fälschlich dem Chatanbieter zurechnen.

### F31 — Die vollständige Liste gehört in einen Aufklapper
Schwere: mittel
Stelle: app/src/renderer/utils/i18n/agentCard.ts:62
Status: [OFFEN]
Die heutige Kurzzeile plus ein Absatz ist bereits dicht (`:62–65`). Mail-Notizen, Brain, Projektstatus, Skills, Gedächtnis, Shell, Web, Bilder, Merksatz und Telemetrie in denselben sichtbaren Absatz zu packen überfordert Einsteiger und macht die Empfänger trotzdem unklar. Eine generische Formulierung kann die gemeinsame Regel ehrlich zusammenfassen; konkrete Beispiele und bedingte Nebenwege brauchen progressive Offenlegung.
Vorschlag: Sichtbare Kurzform: **„Cloud über {Anbieter}: Dein Auftrag und alles, was der Agent liest oder erstellt, wird an {Anbieter} gesendet. Das kann Namen, Mailinhalte und andere Personendaten enthalten.“** Darunter **„Welche Daten wohin gehen“** als Aufklapper, nach Empfänger gegliedert: Modellanbieter; Suchdienst und Zielwebsites; Google-Bilddienst; Shell-Netzziele; Apple Mail; lokale Laufdaten. Beim Modellanbieter explizit Vault-Suchauszüge, Mail-/Brain-/Projektstatus, Skills, Gedächtnis, Anhänge, Werkzeugergebnisse/-fehler, Entwürfe und Merksatz-Vorschlag nennen. Nur aktivierte/verfügbare Nebenwege anzeigen, aber die Cloud-Grundzeile dauerhaft vor dem Start stehen lassen.

### F32 — Abnahmekriterien und Messpunkte fehlen noch im Paketplan
Schwere: mittel
Stelle: app/src/main/rag/vaultRagManager.ts:309
Status: [OFFEN]
Die Produktentscheidungen legen das Verhalten fest, aber noch keine prüfbare Paketfolge. Besonders Klassifikation/Opt-in, Datenwegtext, Retrieval-Budget und automatischer Index-Abgleich berühren verschiedene Prozessgrenzen. Wird `vault_search` vor Main-Klassifikation und Aufklärung aktiviert, entsteht zwischenzeitlich genau der irreführende Cloud-Pfad. Für den Öffnungs-/Sync-Abgleich fehlen weiterhin Zielwerte für no-op-Dauer, Peak-RSS, gelesene Bytes und Container-Neuschreiben bei großen Vaults; für das Werkzeug fehlen Messungen des kumulierten Promptwachstums über mehrere Such- und Leseaufrufe.
Vorschlag: Erst Route/Opt-in/Preflight samt Rendereranzeige und Datenweg-Aufklapper bauen; dann `vault_search` mit Abbruch, Frischekennzeichnung und Gesamtbudget; zuletzt den gemeinsamen Öffnungs-/Sync-Scheduler. Automatisierung erst nach Messung an kleinem und real großem Vault freigeben. Tests: alle Providerpfade einschließlich Ollama `cloud-tag`/`remote_host`, Resolverfehler und LM Studio; manipuliertes Cloud-IPC; Preflight-Start-Rennen; lokale Einbettung plus Cloud-Übermittlung der Treffer; Mehrfachsuche unter Promptlimit; Abbruch; Sync-/Öffnungs-Deduplizierung; inkompatibler Index darf keinen stillen Vollaufbau starten.

### Empfehlung Runde 3

1. **Route und Zustimmung zuerst:** einen gemeinsamen Main-Klassifizierer plus Preflight bauen, den bestehenden `note-agent`-Cloud-Opt-in Main-seitig erzwingen, Bestandsfreigaben wegen des erweiterten Vault-Zugriffs einmalig neu bestätigen und Ollama-Cloud gleich behandeln. Kein eigener `vault_search`-Opt-in.
2. **Aufklärung vor Werkzeugfreigabe:** die kurze Cloud-Zeile aus F31 dauerhaft zeigen; Details nach tatsächlichen Empfängern und aktivierten Fähigkeiten aufklappen. Bild-Prompt-Texte und den Rechner-Dialog gleichzeitig korrigieren.
3. **Dann `vault_search`:** nur mit lokal verifiziertem Embedding-Modell, ehrlichem „Suchauszug gesehen“, Frische-/Unvollständigkeitshinweis, Lauf-Abbruchsignal und hartem kumuliertem Promptbudget. Der Chatweg darf lokal, Cloud oder „nicht geprüft“ sein; genau dieser Main-Befund bleibt am Lauf sichtbar.
4. **Index-Abgleich zuletzt:** Öffnen und erfolgreicher Sync gehen in denselben gedrosselten Scheduler, nur mit kompatiblem Bestand und ohne stillen Neuaufbau. No-op-I/O, Laufzeit, Peak-RSS und Container-Schreibmenge am echten großen Vault messen; danach erst Zeitfenster und Drosselung festlegen.

## Claude-Antwort

### Nutzerentscheidungen (24.09.2026)
1. **`vault_search` nur mit nachweislich lokalem Chat-Modell** (Option ii, F01). Prüfung Main-seitig aus den
   aufgelösten `chatOptions`, Chat- und Embedding-Modell getrennt (F02); LM Studio bis zu einer eigenen
   Lokalitätsregel ohne `vault_search`.
2. **Bestehende Cloud-Lesefreigabe (`note_search`/`note_read` mit Cloud-Modell) bekommt einen eigenen
   Vorschlag** — siehe unten, zur Prüfung.
3. **Index-Abgleich nach Öffnen und nach erfolgreichem Sync** (zusammengefasst, gedrosselt, nur bei
   kompatiblem Bestand), vorher Kosten am echten Vault messen; kein stündlicher Vollscan (F09–F12).

### Vorschlag zu Entscheidung 2 (Claude, zur Prüfung)
Grundsätze des Nutzers: Mail-Inhalte nie in die Cloud (hart); sonst Opt-in + Transparenz statt Sperre.
a) **Harte Schranke nur für Mail-Notizen:** Läuft der Agent über einen Cloud-Weg (OpenRouter/LLMBase oder
   Ollama-Cloud-Modell), lehnen `note_search`/`note_read` Pfade im Mail-Notiz-Ordner (`email.inboxFolderName`,
   Standard `‼️📧 - emails`) und in `.mindgraph` ab und lassen sie aus Trefferlisten weg — VOR dem Ranking.
   Ehrlich benannt als „Mail-Notizen-Ordner“, nicht als Schutz aller Personendaten.
b) **Transparenz für den Rest:** Der Cloud-Hinweis der Karte sagt ausdrücklich „Notizen aus deinem Vault, die der
   Agent selbst findet, gehen an <Anbieter> – Mail-Notizen ausgenommen“.
c) **Kein zusätzlicher Startdialog** (die Karte nennt den Datenweg vor dem Start; ein Dialog pro Lauf würde
   weggeklickt). Offen: ob der Main die Cloud-Route bei Anhängen aus dem Mail-Ordner ebenfalls ablehnt.
d) Angehängte Dateien bleiben erlaubt — der Nutzer hat sie selbst gewählt.

### Nutzerentscheidung Runde 2 (24.09.2026) — ersetzt Entscheidung 1 und den Vorschlag zu 2
Codex empfahl nach F14–F22, Cloud-Agenten das Vault-Lesen ganz zu sperren (dichteste Lösung). Nutzer lehnt
ab: „Was passiert mit Menschen, die schwache Hardware haben? Die bleiben außen vor — das geht nicht. Klare
Hinweise, und jeder darf selbst entscheiden.“ (Deckt sich mit der Produktlinie „keine Cloud-Sperren, Nutzer
entscheidet; Opt-in + Transparenz“; Ausnahme bleibt nur Brain.)

Damit gilt:
1. **`vault_search` für alle** — auch bei Cloud-Modell, mit demselben klaren Hinweis wie `note_read`.
   Die Suchanfrage wird immer lokal eingebettet (lokale Embedding-Grenze bleibt, `embed.ts`); ist der Index
   nicht lokal nutzbar, gibt es das Werkzeug nicht. F02 (Embedding-Lokalität getrennt prüfen), F03–F07
   (Verfügbarkeit, Suchauszug = gesehen, keine Vollständigkeit, Budget, Abbruchsignal) bleiben verbindlich.
2. **Keine Mail-Sperre als Default.** Stattdessen (a) **F15 Pflicht:** Main-seitige Lokal/Cloud-Klassifikation
   vor jedem Vault-Inhalt (OpenRouter/LLMBase = Cloud; Ollama nur nach `resolveLocalModel` = lokal;
   `cloud-tag`/`remote_host` = Cloud; nicht auflösbar = „nicht geprüft“), Ergebnis samt Anbieter an den
   Renderer, Karte zeigt sie vor UND während des Laufs (F22). (b) **Vollständige Datenweg-Liste** auf der Karte
   bei Cloud: Auftrag, Anhänge, selbst gefundene und gelesene Vault-Notizen — ausdrücklich inkl.
   Mail-Notizen, Tageszusammenfassungen, Projekt-Status —, Agent-Gedächtnis und Skills, mit Shell alles, was
   die Shell lesen darf, mit Web die abgerufenen Seiten (F19–F21 als Inhaltsliste, nicht als Sperre).
3. **Optional später** (nur auf Wunsch): Schalter pro Cloud-Lauf „Mail-Notizen nicht lesen“, ehrlich
   beschrieben als Sperre für Mail-Ordner (aktuell + historisch, kanonisch) und Mail-/Brain-/Projektstatus-
   Frontmatter, ohne Erkennung kopierter Auszüge (F14, F16–F18, F20 als Bauanleitung).
4. Index-Abgleich unverändert nach Entscheidung 3 (nach Öffnen + nach Sync, gedrosselt, nur kompatibler
   Bestand, vorher messen; F09–F12).

### Umsetzungsplan (beschlossen 24.09.2026, nach Runde 3)

Grundsatz: Transparenz statt Sperre, der Nutzer entscheidet; schwache Hardware wird nicht ausgeschlossen.
Kein Paket gibt einen Datenweg frei, bevor Einstufung und Aufklärung dafür stehen (F32).

**Paket 1 — Einstufung und Zustimmung im Main (F15, F26, F27, F28)**
- Gemeinsamer Klassifizierer `classifyAgentRoute(chatOptions)` → `{ kind: 'local' | 'cloud' | 'unverified',
  providerLabel, model }`: OpenRouter/LLMBase = cloud; Ollama nur nach frischem `resolveLocalModel` = local,
  `cloud-tag`/`remote_host` = cloud (Label „Ollama (Cloud)“), übrige Resolverfehler = unverified;
  LM Studio = unverified („auf diesem Rechner erreichbar, Ausführungsort nicht geprüft“).
- Neuer IPC `note-agent-route-preflight` für die Karte (neu bei Backend-/Modellwechsel und Fokus).
- `note-agent-run`: Klassifizierer direkt nach Aufbau der `chatOptions`, VOR Skills/Gedächtnis/Anhängen erneut;
  Ergebnis in `AgentRun`, in der Startantwort zurück, Karte zeigt während des Laufs nur diesen Laufbefund.
- Opt-in `note-agent` Main-seitig aus `ui-settings.json` erzwingen (manipuliertes `params.cloud` wirkungslos);
  gilt auch für Ollama-Cloud. Opt-in-Text auf „Aufträge mit Vault-Zugriff“ erweitern und Bestandsfreigaben
  einmalig versioniert neu bestätigen lassen. Kein eigener Opt-in pro Werkzeug.
- Tests: alle Providerpfade inkl. `cloud-tag`/`remote_host`, Resolverfehler, LM Studio; manipuliertes Cloud-IPC;
  Metadatenwechsel zwischen Preflight und Start.

**Paket 2 — Aufklärung auf der Karte und falsche Texte korrigieren (F23–F25, F29–F31)**
- Sichtbare Kurzzeile bei cloud: „Cloud über {Anbieter}: Dein Auftrag und alles, was der Agent liest oder
  erstellt, geht an {Anbieter}. Das kann Namen, Mail-Inhalte und andere Personendaten enthalten.“
  Bei unverified: „Ausführungsort nicht geprüft – Vault-Inhalte können den gewählten Modellweg verlassen.“
- Aufklapper „Welche Daten wohin gehen“, nach Empfänger, nur aktuell mögliche Wege:
  Modellanbieter (Auftrag, Anhänge, Vault-Suchauszüge und gelesene Notizen inkl. Mail/Brain/Projektstatus,
  Skills, Gedächtnis, alle Werkzeugergebnisse und -fehler, Entwürfe, Merksatz-Vorschlag nach dem Lauf);
  Suchdienst (Suchanfragen, ggf. aus Unterlagen abgeleitet) und Zielwebsites (Abrufe); Google (Bild-Prompt,
  kann Angaben aus Notizen enthalten — auch bei lokalem Chatmodell); Shell-Netzziele (nur bei erlaubtem Netz);
  Apple Mail (Entwürfe und Anhänge, Synchronisierung nach Mailkonto); lokal gespeichert: technische Laufdaten
  ohne Inhalte, kein Telemetrie-Versand.
- Korrigieren: Einstellungen Bild-Generierung („keine Notiz- oder Mail-Inhalte“ ist falsch,
  `translations.ts:97,3075`), nativer Rechner-Dialog („gibt keine nach draussen“, `index.ts:4741`).

**Paket 3 — Werkzeug `vault_search` (F02–F07, F13)**
- Nur mit lokal verifiziertem Embedding-Modell und kompatiblem Index; Chatweg darf local/cloud/unverified sein
  (Laufbefund bleibt sichtbar). Direkt an `VaultRagManager.query` mit `run.abort.signal`.
- Ergebnis: Pfad, Überschriften-Pfad, gekappter Auszug; harte Grenzen für Query-Länge, Trefferzahl, Zeichen je
  Auszug und Gesamtantwort mit sichtbarem „… gekürzt“. Hinweis „keine frischen Treffer über der Schwelle ≠ gibt
  es nicht“ mit Verweis auf `note_search`.
- Provenienz: „Suchauszug gesehen“ getrennt von „Notiz gelesen (bis 8000 Zeichen)“ — Vorlage für Paket B der
  Ergebnis-Karte.
- CLAUDE.md-Abschnitt „Vault-Index“ an den echten Retrieval-Code angleichen (Floor 0,50, lexikalische
  Nachgewichtung 0,3).
- Tests: Verfügbarkeit (Modul/Opt-in/Index/Identität), Abbruch, Mehrfachsuche unter Promptlimit, lokale
  Einbettung plus Cloud-Übermittlung der Treffer.

**Paket 4 — Index-Abgleich nach Öffnen und Sync (F09–F12)**
- Ein gemeinsamer, entprellter Scheduler für Öffnen (nach abgeschlossenem `setVault`), erfolgreichen Sync
  (Main-seitig, `sync-progress: done`) und Watcher; Starts zusammenfassen, bei Vault-Wechsel verwerfen.
- Nur bei validiertem Bestand gleicher Embedding-Identität; sonst „Neuaufbau erforderlich“ anzeigen, nie still
  neu aufbauen. „Zuletzt abgeglichen“ erst nach erfolgreichem Jobende.
- VOR Freigabe messen (klein + echter großer Vault): No-op-Dauer, gelesene Bytes, Peak-RSS, Container-
  Neuschreiben; möglichst No-op ohne Neuschreiben. Danach Drosselung und ggf. seltenen Leerlauf-Check festlegen.
- Tests: Öffnen/Sync-Deduplizierung, inkompatibler Index startet keinen Vollaufbau.

**Voraussetzung:** Paket A (Auftragskarte) getestet und committet. Pakete 1–3 ändern den Main-Prozess —
Dev-App muss dafür neu starten; nicht während laufender Tests.

## Status

Plan-Review angefragt 24.09.2026. 13 Findings; Nutzerentscheidungen 1–3 getroffen; Runde 2: 22 Findings; Nutzerentscheidung „Transparenz statt Sperre, vault_search für alle“. Runde 3: 32 Findings; Umsetzungsplan (Pakete 1–4) beschlossen.
