# Speicherbild für lokale Modelle

Prüfer dieser Runde: **agy** (statt Codex). Der Abschnitt heißt weiter „Codex-Findings“, weil
`scripts/pruefgrenze.sh` genau diese Überschrift erwartet.

## Aufgabe

Prüfe das am 25.11.2026 gebaute Speicherbild adversarial: Rechnung, Messung, das Beenden fremder
Programme und die Aussagen, die die Oberfläche dem Nutzer macht. Stand: Commit `ad698130` plus
uncommittete Änderungen im Arbeitsbaum (Balken im Modell-Menü, gemeinsamer Messwert, Größe je
Prozess aus `top`).

Was das Feature tut:

- Einstellungen → KI, Karte „Speicherbild“: maßstäblicher Balken (System und Programme · Modell ·
  Rechenpuffer · gefülltes Kontextfenster · frei · „wird ausgelagert“) und ein Satz, wie viele Token
  Kontext neben dem lokalen Modell noch in den Arbeitsspeicher passen.
- Modell-Menü der Auftragskarte: derselbe Balken unter dem Kontext-Regler, Warnung, wenn ein volles
  Fenster nicht passt, Link „Platz schaffen“ zur Karte.
- „Platz schaffen“: schlägt laufende Programme zum Beenden vor, beendet die Auswahl nach einem
  nativen Dialog per AppleScript `quit`, öffnet sie später wieder.
- Die App merkt sich nach jedem lokalen Ollama-Aufruf ein Wertepaar (Token im Kontext, Größe laut
  `/api/ps`) und rechnet daraus die Kosten je Token selbst.

Worauf es ankommt (bitte gezielt angreifen):

1. **Sicherheit des Beendens.** Kann ein kompromittierter Renderer über
   `note-agent-memory-relief-quit` etwas beenden oder starten, das der Nutzer nicht bestätigt hat?
   Stimmt die Zusage „nie die App selbst, nie Ollama, keine Systemdienste“? Ist der AppleScript-Aufruf
   injektionsfrei? Was passiert bei zwei Programmen gleichen Namens an verschiedenen Pfaden, bei einem
   Pfad mit `.app` im Benutzerordner, bei Symlinks? `open -g -a <pfad>` beim Wiederöffnen: kann der
   Pfad zwischen Beenden und Öffnen ausgetauscht worden sein?
2. **Richtigkeit der Rechnung.** `memoryPicture`, `memoryBar`, `reliefPlan`, `fitModelMemory`,
   `kvBytesPerTokenFromShow`, `usedBytesFromVmStat`. Stimmen die Fälle geladen/ungeladen,
   gemessen/Vorausrechnung/Modellaufbau? Doppelzählungen, negative Werte, Division durch null,
   Einheiten (GiB gegen GB)?
3. **Messung.** Ist `Anonymous pages − purgeable + wired + compressor` eine haltbare Größe für
   „belegt“? Ist `/api/ps`-Größe gegen `promptTokens + outputTokens` ein sauberes Wertepaar (auch bei
   Streaming, bei mehreren Modellen, bei Aufrufen mit anderem `num_ctx`, bei GGUF)? Kann eine
   schlechte Stichprobe die Anpassung dauerhaft verderben?
4. **Ehrlichkeit der Oberfläche.** Wo behauptet ein Text mehr, als gemessen ist? Besonders:
   „mindestens rund“, „hat die App selbst gemessen“, „passt“, der Gewinn je Programm aus `top`.
5. **Robustheit.** Log-Parsing (`latestContextProjection`) bei geändertem Ollama-Format, fehlende
   Dateien, `top`/`ps`/`vm_stat` langsam oder nicht vorhanden, gleichzeitige Schreibzugriffe auf
   `model-memory.json` und `memory-projections.json`, Zustand über HMR/Neustart
   (`closedHere` liegt nur im Arbeitsspeicher).
6. **Projektregeln.** Verstöße gegen `CLAUDE.md` und `.claude/rules/settings-ui.md`
   (keine Inline-Styles in Einstellungen, Handler nur in der `register…`-Funktion, kein Duplikat von
   Logik), fehlende Tests für Main-Code.

## Kontext/Anker

Reine Logik, getestet (`app/src/shared/memoryPicture.test.ts`, 24 Tests):

- `app/src/shared/memoryPicture.ts:40` `latestContextProjection` — Ollamas Vorausrechnung aus dem Log
- `app/src/shared/memoryPicture.ts:65` `kvBytesPerTokenFromShow` — GGUF, Kosten je Token aus dem Modellaufbau
- `app/src/shared/memoryPicture.ts:95` `usedBytesFromVmStat`
- `app/src/shared/memoryPicture.ts:136` `groupProcesses` — je Programm, nur beendbare, `footprints` aus `top`
- `app/src/shared/memoryPicture.ts:181` `addMemorySample`, `:193` `fitModelMemory`
- `app/src/shared/memoryPicture.ts:210` `footprintsFromTop`
- `app/src/shared/memoryPicture.ts:265` `memoryPicture`
- `app/src/shared/memoryPicture.ts:307` `reliefPlan`, `:347` `memoryBar`

Main:

- `app/src/main/noteAgent/memoryPicture.ts:125` `readMemoryPicture` — liest `vm_stat`, `sysctl`, `ps`, `top`, Log, `/api/tags`, `/api/ps`, `/api/show`
- `app/src/main/noteAgent/memoryPicture.ts:65` `contextProjection` — Log, Vorgänger-Log, eigene Ablage
- `app/src/main/noteAgent/memoryRelief.ts:30` `closableNow`, `:48` `quitAppsForRelief`, `:84` `reopenAppsAfterRelief`
- `app/src/main/llm/modelMemory.ts:35` `sampleModelMemory`, `:57` `measuredModelMemory`
- `app/src/main/llm/telemetry.ts:106` Aufruf von `sampleModelMemory` in `recordLlmRun`
- `app/src/main/noteAgent/ipc.ts:349` `note-agent-memory-picture`, `:362` `-relief-quit`, `:370` `-relief-reopen`
- `app/src/main/preload.ts` und `app/src/shared/types.ts`: `noteAgentMemoryPicture`, `noteAgentMemoryReliefQuit`, `noteAgentMemoryReliefReopen`

Renderer:

- `app/src/renderer/components/Settings/MemoryPictureCard.tsx:20` Karte, `:84` Balken, `:118` Plan, `:127` Beenden
- `app/src/renderer/components/Agent/ContextWindowRow.tsx:49` Plan und Balken im Modell-Menü, `:53` Übergabe an die Karte, `:56` Nachmessen
- `app/src/renderer/utils/memoryPictureClient.ts:23` gemeinsamer Messwert, `:50` Übergabe von Modell und Stand
- Texte: `app/src/renderer/utils/i18n/settingsPages.ts` (`settings.memoryPicture.*`), `app/src/renderer/utils/i18n/agentCard.ts` (`agentCard.context*`)
- Stile: `app/src/renderer/components/Settings/SettingsUI.css` (`.sui-membar*`, `.sui-relief*`), `app/src/renderer/styles/index.css` (`.agent-card-membar`)

Beschreibung des Stands in den Projektregeln: `.claude/rules/note-agent.md`, Absatz „Speicherbild“.

Messwerte, auf denen die Rechnung beruht (25.11.2026, M2 Max 32 GB, Ollama 0.40.18,
`qwen3.8:27b-mlx`, Fenster 32 768, Größe laut `/api/ps`): 17,22 GiB bei 22 Token · 17,71 bei 7 022 ·
18,41 bei 16 725 · 19,14 bei 28 056. Ollamas eigene Vorausrechnung im Log nennt für dasselbe Modell
5,89 GB für 32 768 Token plus 4 GB `workspace`.

Bekannte Lücken, die kein Finding brauchen: nur macOS auf Apple Silicon; Token-Zahl nicht auf das
Modellmaximum begrenzt; der Weg über Knopf und Dialog ist nur vom Nutzer von Hand ausprobiert.

## Codex-Findings

*Hinweis zum Prüfumfang:* Gemäß Prüfauftrag wurden keine Programme, Tests oder Modelle gestartet; Aussagen zum Laufzeitverhalten von `osascript`, `open`, `top`, `vm_stat` und Ollama `/api/ps` stützen sich auf den gelesenen Code und die dokumentierten Schnittstellen, nicht auf eine Live-Ausführung. Geprüft und ohne Befund: die drei neuen IPC-Handler liegen korrekt in `registerNoteAgentIpc` mit `isTrustedSender` (`app/src/main/noteAgent/ipc.ts:349-377`), die Zustand-Selektoren in `MemoryPictureCard.tsx:25-28,45-46` und `ContextWindowRow.tsx:15-16` liefern stabile Referenzen/Primitive, und der `osascript`-Aufruf injiziert keinen Pfad in den Skripttext (`app/src/main/noteAgent/memoryRelief.ts:73`, Pfad kommt über `argv` und beginnt durch den Filter immer mit `/`).

### F01 — `memoryRelief`: Pfadtausch-TOCTOU, Symlink-Umgehung und unbestätigtes `open -g -a`
Schwere: hoch
Stelle: app/src/main/noteAgent/memoryRelief.ts:5-6,17,30-38,50-66,74,84-91; app/src/shared/memoryPicture.ts:145-150; app/src/main/noteAgent/ipc.ts:362-377
Status: [OFFEN]
Das Sicherheitsversprechen „nie die App selbst, nie Ollama, keine Systemdienste“ und das Wiederöffnen sind an mehreren Stellen umgehbar:
1. **Pfadtausch (TOCTOU) und lautloses Wiederöffnen ohne Rückfrage (`memoryRelief.ts:17,74,84-91`, `ipc.ts:370-377`):** `closedHere` speichert nur den rohen Pfadstring `target` (auch unter dem für den Nutzer frei beschreibbaren `/Users/...`). `reopenAppsAfterRelief` führt darauf ohne nativen Bestätigungsdialog, ohne `lstat`/`realpath` und ohne Prüfung auf `Contents/Info.plist`, Bundle-ID, Inode oder Signatur `/usr/bin/open -g -a <target>` aus. Wird das Bündel zwischen Beenden und Wiederöffnen ausgetauscht oder durch einen Symlink ersetzt (z. B. durch ein Skript oder die Agent-Shell), startet MindGraph fremden Code. Ein kompromittierter Renderer kann `note-agent-memory-relief-reopen` zudem jederzeit still auslösen, sobald zuvor einmal ein Programm beendet wurde.
2. **Symlink-Umgehung und zu breiter `/Users/`-Filter (`shared/memoryPicture.ts:145,148`):** `groupProcesses` prüft nur den lexikalischen `comm`-Pfad aus `ps` mit `/^(.*?\/([^/]+)\.app)\//` und `/^\/(Applications|System\/Applications|Users)\//` ohne `realpath`. Ein über einen Symlink unter `/Users/.../foo.app` gestarteter Systemdienst — oder MindGraph selbst — umgeht `ownName` und den Pfadfilter. Gleichzeitig erfasst `/Users/` pauschal `~/Library/` (Hintergrund-Helfer, LaunchAgents, Updater- und Sync-`.app`-Bündel) sowie gewöhnliche Projektordner mit `.app`-Domain im Namen (z. B. `/Users/<name>/dev/projekt.app/server`, wobei `bundle` auf den Ordner `projekt.app` matched). Der Kopfkommentar `memoryRelief.ts:5-6` unterschlägt außerdem, dass `/System/Applications` zugelassen ist.
3. **Zu breite Zielmenge für einen kompromittierten Renderer (`memoryRelief.ts:30-38,50-54`):** `closableNow()` wendet weder `MIN_APP_BYTES` noch `TOP_APPS` an; der Renderer kann also beliebige kleine laufende Programme (VPN, Passwortmanager, Backup- oder `~/Library`-Helfer) an `note-agent-memory-relief-quit` übergeben.
Vorschlag: Vor Dialog, `quit` und `open` jedes Ziel über `lstat`/`realpath` als echtes, nicht verlinktes `.app`-Bündel (`Contents/Info.plist`) verifizieren; `~/Library/` ausschließen; die eigene App zusätzlich über PID und kanonischen Bundle-Pfad ausschließen; für `reopenAppsAfterRelief` Bundle-Identität (kanonischer Pfad + `CFBundleIdentifier` + Inode/Signatur) erneut prüfen und nur nach Nutzeraktion/Dialog öffnen.

### F02 — `groupProcesses` & `memoryRelief`: Gleichnamige Programme an zwei Pfaden, fehlende Deduplizierung und `osascript` ohne Lauf- oder Erfolgsprüfung
Schwere: hoch
Stelle: app/src/shared/memoryPicture.ts:137-155; app/src/main/noteAgent/memoryRelief.ts:50-76; app/src/renderer/utils/i18n/settingsPages.ts:59-60
Status: [OFFEN]
1. **Namenskollision bei zwei Programmen gleichen Namens an verschiedenen Pfaden (`shared/memoryPicture.ts:137-155`):** `sums` und `paths` sind nach `name` (nicht nach `bundle`-Pfad) geschlüsselt; `if (bundle && !paths.has(name)) paths.set(name, bundle[1])` behält still nur den ersten gefundenen Pfad. Laufen z. B. `/Applications/Foo.app` und `/Users/<name>/Downloads/Foo.app` gleichzeitig, werden ihre Speichergrößen vermischt, nur eine Kopie wird beendet und die andere läuft weiter. Im Bestätigungsdialog (`memoryRelief.ts:54,61`) erscheinen ausschließlich `names`, niemals der Pfad — bei Namenskollisionen oder einem Bündel unter `/Users/.../Mail.app` kann der Nutzer nicht erkennen, welches Programm tatsächlich gemeint ist.
2. **Keine Deduplizierung von `paths` und Risiko des Neustarts durch `osascript` (`memoryRelief.ts:50-54,73`):** `wanted` wird nicht dedupliziert; ein kompromittierter Renderer kann denselben Pfad bis zu 12-mal übergeben, sodass er 12-mal im Dialog steht und 12-mal `osascript` aufgerufen wird. Das AppleScript `tell application (item 1 of argv) to quit` (`:73`) prüft nicht `if application (item 1 of argv) is running then`. Ist das Zielprogramm während des modalen Dialogs (oder durch einen vorherigen Duplikat-Aufruf) bereits beendet worden, kann AppleScript es zum Zustellen von `quit` erst wieder starten (Live-Ausführung nicht geprüft).
3. **Ungeprüfte Erfolgsbehauptung „Beendet“ (`memoryRelief.ts:73-74`, `settingsPages.ts:59`):** `res.ok` (Exit-Code 0 von `osascript`) trägt das Programm sofort in `closed` und `closedHere` ein, ohne per `ps` zu prüfen, ob der Prozess tatsächlich beendet wurde. Lehnt der Nutzer eine „Änderungen sichern?“-Rückfrage ab oder ignoriert eine App das Apple-Event asynchron, meldet die Oberfläche trotzdem „Beendet: …“ und bietet die noch laufende App unter „Wieder öffnen“ an.
Vorschlag: In `groupProcesses` nach kanonischem Bündelpfad gruppieren (nicht nach `name`), `targets` in `quitAppsForRelief` deduplizieren, im Dialog bei Pfaden außerhalb `/Applications` und `/System/Applications` (oder bei gleichen Namen) den Pfad anzeigen, im AppleScript vor `quit` auf `is running` prüfen und den tatsächlichen Austritt der Prozesse vor dem Eintragen in `closed`/`closedHere` gegen `ps` verifizieren.

### F03 — Widersprüchliche Speicherrechnung bei geladenem Modell (`baseModelBytes` enthält Rechenpuffer trotz `bufferBytes = 0`; `memoryBar` vs. `reliefPlan` vs. Kopfzeile)
Schwere: hoch
Stelle: app/src/shared/memoryPicture.ts:271-283,307-321,347-363; app/src/renderer/components/Settings/MemoryPictureCard.tsx:76-116,184-205; app/src/renderer/components/Agent/ContextWindowRow.tsx:49-50,90-107
Status: [OFFEN]
1. **Rechenpuffer wird bei geladenem Modell in `baseModelBytes` weiter aufgeschlagen (`shared/memoryPicture.ts:271,274`):** Ist ein Modell geladen (`loaded === true`), noch nicht selbst gemessen (`measured == null`) und liegt eine Ollama-Vorausrechnung mit `workspaceBytes` (z. B. 4 GiB) vor, setzt Zeile 271 `bufferBytes = 0`, Zeile 274 rechnet aber trotzdem `baseModelBytes = unloadedBytes + input.projection.workspaceBytes` (z. B. 17 + 4 = 21 GiB).
   - Auswirkung in `memoryBar` (`:351`): `context = Math.max(0, picture.baseModelBytes + full - modelBytes)`. Bei `modelBytes = 17,2 GiB`, `baseModelBytes = 21 GiB` und `full = 5,5 GiB` (32k Token) berechnet `memoryBar` **`context = 9,3 GiB`** — die 4 GiB Rechenpuffer landen fälschlich im gelben Abschnitt „Kontext, 32.768 Token gefüllt“ (3,8 GiB mehr als `full`).
   - Auswirkung als direkter Widerspruch auf derselben Karte (`MemoryPictureCard.tsx:109-115,193-204`): Bei `total = 32 GiB`, `other = 8,8 GiB`, `modelBytes = 17,2 GiB` ergibt `freeBytes = 6,0 GiB` → `tokensFit ≈ 36 000` (> 32 768) → grüne Kopfzeile „Das Modell ist geladen. Es passen noch mindestens rund 36.000 Token Kontext dazu.“ Direkt darunter rechnet `reliefPlan` (`:309`) mit `baseModelBytes = 21 GiB` → `needBytes = 26,5 GiB` → `deficitBytes = 3,3 GiB` → gelbe Warnung „Es fehlen 3,3 GB“ und roter Balken „Wird ausgelagert 3,3 GB“.
2. **Abweichung zwischen `reliefPlan` und `memoryBar` bei `modelBytes > baseModelBytes + full`:** Hält das geladene Modell bereits mehr Speicher als `baseModelBytes + full` (z. B. GGUF mit größerem `num_ctx` geladen oder MLX nach langem Lauf; genau dieser Fall steht in `memoryPicture.test.ts:249` mit `modelBytes = 20 GiB`), setzt `memoryBar` (`:351,353`) `context = 0` und `needed = otherBytes + 20 GiB`, während `reliefPlan` (`:309`) mit `needBytes = 19 GiB` rechnet. Bei `otherBytes = 12,5 GiB` auf 32 GiB liefert `reliefPlan` `deficitBytes = 0` („passt“), `memoryBar` aber `overBytes = 0,5 GiB` und `freeBytes = 0`. `ContextWindowRow.tsx:92-106` rendert dann den roten Überlaufbalken direkt über dem Text „Passt in den Arbeitsspeicher: … 0,0 GB bleiben frei.“
Vorschlag: Eine konsistente Bedarfsrechnung für alle drei Stellen erzwingen: bei `loaded === true` keinen ungeladenen `workspaceBytes` mehr in `baseModelBytes` addieren (oder ihn konsistent auch in `freeBytes`/`bufferBytes` berücksichtigen) und in `reliefPlan` bei geladenem Modell `Math.max(picture.modelBytes, needBytes)` verwenden, damit `deficitBytes > 0` und `memoryBar.overBytes > 0` immer übereinstimmen.

### F04 — Selbstmessung (`sampleModelMemory` / `fitModelMemory`): Falsche Anpassung bei GGUF, Verzerrung durch Denk-/Bild-Token und Ausreißer-Vergiftung
Schwere: hoch
Stelle: app/src/main/llm/telemetry.ts:106; app/src/main/llm/modelMemory.ts:35-63; app/src/shared/memoryPicture.ts:164-166,181-207,277-280; app/src/shared/llmTelemetry.ts:89-94
Status: [OFFEN]
Das Wertepaar `(promptTokens + outputTokens, /api/ps size)` ist über die heterogenen Aufrufe der App hinweg unsauber und macht die Anpassung dauerhaft unzuverlässig:
1. **GGUF erzeugt trotz gegenteiliger Annahme eine scheinbar gültige Gerade (`shared/memoryPicture.ts:164-166,190-191`):** Verschiedene Aufrufstellen übergeben demselben GGUF-Modell unterschiedliche `num_ctx`-Werte (`ollama-generate` dynamisch 4k–64k in `app/src/main/index.ts:5189-5191`, `streamPetrolWebModel` in `app/src/main/index.ts:6236`, `note-agent-run` 32k–262k in `app/src/main/noteAgent/ipc.ts:552`). Lädt ein GGUF-Modell wie `qwen3.5:4b` bei einem kurzen Lauf mit `num_ctx=4k` (`2,9 GB` bei 500 Token), beim Agent-Lauf mit `32k` (`4,0 GB` bei 12 000 Token) und beim Web-Lauf mit `64k` (`5,1 GB` bei 25 000 Token), fittet `fitModelMemory` eine Steigung von ~94 KB/Token (fast 3× so hoch wie die echten 32 KB/Token). Da `measured` gegen `architecture` gewinnt (`shared/memoryPicture.ts:277-280`), verdrängt diese Fehl-Anpassung die Modellaufbau-Rechnung, entfernt den GGUF-Hinweis `sourceArch` und behauptet „selbst gemessen“.
2. **Fehlende Denk-Token und eingemischte Bild-/OCR-Läufe (`telemetry.ts:106`):** Laut eigenem Befund in `shared/llmTelemetry.ts:89-94` unterschlägt Ollama auf `/api/chat` Denk-Token in `eval_count`. `telemetry.ts:106` ignoriert `run.hiddenThinking` — die Token-Koordinate ist systematisch zu klein, die Steigung zu hoch. Ebenso fließen Vision-OCR- und `describeImage`-Aufrufe (`app/src/main/visionOcr.ts:143`, `app/src/main/noteAgent/describeImage.ts:160`) mit Bild-Encoder-Speicher in die Text-Kontext-Messung ein.
3. **High-Water-Mark / Race beim asynchronen `/api/ps`-Aufruf (`telemetry.ts:106`, `modelMemory.ts:35-50`):** `sampleModelMemory` läuft fire-and-forget. Hält Ollama/MLX den Speicherpool eines vorangegangenen langen Laufs vor oder läuft bereits der nächste Aufruf, wird ein kurzer Aufruf mit der hohen `/api/ps`-Größe gepaart und überschreibt den unteren 1 000-Token-Bucket.
4. **Ungewichtete OLS ohne Güteprüfung (`R²`), ohne Ausreißer-Filter, ohne Modell-Digest und ohne `:latest`-Normalisierung (`shared/memoryPicture.ts:193-207`, `modelMemory.ts:41-48,59`):** Ein einzelner Ausreißer bei hoher Tokenzahl kippt die OLS-Gerade über seine Hebelwirkung dauerhaft (er bleibt im eigenen 1 000-Token-Bucket bis zu 40 andere Buckets lang erhalten). Selbst stark streuende Daten wie `(100, 20 GB), (3000, 17 GB), (5000, 21 GB)` werden akzeptiert, weil weder `R²` noch Residuen geprüft werden. Nach einem `ollama pull` derselben Modellbezeichnung vermischen sich alte und neue Gewichte, da kein `digest` gespeichert wird. Zudem normalisiert `modelMemory.ts:41` zwar für `/api/ps` auf `:latest`, speichert und liest aber unter dem rohen `store[model]` (`:45,48,59`) — `modell` und `modell:latest` landen in getrennten Einträgen.
Vorschlag: Samples an kanonischen Modellnamen + `digest` (und bei GGUF an `num_ctx` statt Tokenzahl, bzw. GGUF aus der Füllstands-Anpassung ausschließen) binden; `hiddenThinking`- und Vision/OCR-Aufrufe ausklammern; robuste Steigungsschätzung (z. B. Theil-Sen) samt Güteschwelle (`R²`/max. Residuum) prüfen.

### F05 — Unvereinbare Messgrößen für „Platz schaffen“: `top`-Footprint (inkl. Swap + unkomprimiertem Speicher) und summierter `ps`-RSS 1:1 gegen RAM-Defizit
Schwere: hoch
Stelle: app/src/shared/memoryPicture.ts:143,149,307-321; app/src/main/noteAgent/memoryPicture.ts:130-132,143,146; app/src/renderer/components/Settings/MemoryPictureCard.tsx:121,212,219-220; app/src/renderer/utils/i18n/settingsPages.ts:56
Status: [OFFEN]
`otherBytes` und `deficitBytes` stammen aus `vm_stat` (`Anonymous − purgeable + wired + compressor`) und messen ausschließlich **physisch im RAM belegten Speicher** (ohne ausgelagerte SSD-Seiten und mit komprimierter Größe im Compressor). `groupProcesses` (`shared/memoryPicture.ts:143`) weist jedem Prozess dagegen `Math.max(ps_rss, top_mem)` zu und addiert dies über alle Hilfsprozesse eines Bündels:
- `top -l 1 -stats pid,mem` meldet den `phys_footprint` einschließlich **bereits ausgelagerter Seiten** und der **unkomprimierten** Größe komprimierter Seiten. Beendet der Nutzer eine stark ausgelagerte App (z. B. `ps` RSS 0,5 GB, `top` 4,5 GB), sinkt der `vm_stat`-RAM-Bedarf weit weniger als um 4,5 GB.
- Umgekehrt zählt `ps` RSS gemeinsam genutzte Frameworks/Libraries (z. B. Chromium/Electron-Renderer) **je Hilfsprozess mehrfach**, sodass das Aufsummieren den freigebbaren RAM ebenfalls überschätzt.
Trotzdem vergleichen `reliefPlan` (`:315,320`) und `MemoryPictureCard.tsx:121,219-220` die Summe `selectedBytes` 1:1 mit `plan.deficitBytes` und versprechen „Auswahl: {gb} GB — das reicht.“ (`settingsPages.ts:56`). Derselbe Einheitenbruch trifft auch `ollamaBytes` (`main/noteAgent/memoryPicture.ts:143,146`): ausgelagerte Ollama-Seiten aus `top` fließen in `loadedBytes` und werden in `shared/memoryPicture.ts:269` von RAM-`usedBytes` abgezogen.
Vorschlag: Für `ollamaBytes` keine Swap-einschließenden `top`-Footprints gegen `vm_stat` abziehen; in „Platz schaffen“ die Programmgröße nicht als garantierte 1:1-RAM-Ersparnis mit „das reicht“ gegen `deficitBytes` aufrechnen, sondern als grobe Obergrenze inkl. Auslagerung/geteiltem Speicher ausweisen und die Nachmessung als Maßstab nennen.

### F06 — `reliefPlan`: Negatives Programm-Budget (`allowedOtherBytes < 0`) und falscher Schließvorschlag bei physikalisch zu großem Fenster
Schwere: hoch
Stelle: app/src/shared/memoryPicture.ts:307-321; app/src/renderer/components/Settings/MemoryPictureCard.tsx:202-223; app/src/renderer/utils/i18n/settingsPages.ts:53,56
Status: [OFFEN]
In `reliefPlan` (`shared/memoryPicture.ts:309-311`) gilt `allowedOtherBytes = picture.totalBytes - needBytes` und `deficitBytes = Math.max(0, picture.otherBytes - allowedOtherBytes)`. Sobald Modell + Zielfenster größer sind als der gesamte Arbeitsspeicher (z. B. `qwen3.8:27b-mlx` mit 262k Fenster auf 32 GB: `needBytes ≈ 35,9 GB > 32 GB`, oder mit Ollama-Vorausrechnung schon ab 98k Fenster), wird **`allowedOtherBytes` negativ** (z. B. `-3,9 GB`).
- `MemoryPictureCard.tsx:204` gibt dem Nutzer dann wörtlich aus: „Dafür dürfen System und Programme höchstens -3,9 GB belegen — jetzt sind es 9,0 GB. Es fehlen 12,9 GB.“
- `reliefPlan` schlägt dennoch Programme zum Beenden vor, obwohl das Ziel selbst bei 0 GB für macOS und alle Programme unmöglich passt (dasselbe gilt faktisch schon bei `allowedOtherBytes < MIN_OTHER_BYTES`). Zusammen mit den überschätzten `top`-Footprints (F05) kann `selectedBytes >= deficitBytes` sogar `true` werden und „das reicht“ behaupten.
Vorschlag: In `reliefPlan` ein Feld (z. B. `impossible: boolean`) führen, sobald `allowedOtherBytes < MIN_OTHER_BYTES` (bzw. `needBytes > totalBytes - MIN_OTHER_BYTES`), dann keine Programme zum Schließen vorschlagen und stattdessen klar melden, dass das gewählte Kontextfenster für diesen Arbeitsspeicher zu groß ist.

### F07 — Mehrere gleichzeitig geladene Ollama-Modelle und CPU-Offload verfälschen `otherBytes` und `modelBytes`
Schwere: mittel
Stelle: app/src/main/noteAgent/memoryPicture.ts:143-146; app/src/shared/memoryPicture.ts:147,267-273
Status: [OFFEN]
1. **Zwei Modelle gleichzeitig geladen:** `groupProcesses` (`shared/memoryPicture.ts:147`) addiert alle Prozesse mit `ollama` im Namen oder Pfad (einschließlich aller geladenen Modelle wie `bge-m3` + `qwen3.8:27b-mlx` und sogar fremder Apps wie `OllamaMonitor.app`) in ein einziges `ollamaBytes`. Über `loadedBytes = loaded ? Math.max(ollamaBytes, loaded.sizeBytes) : null` (`main/noteAgent/memoryPicture.ts:146`) wird beim Öffnen des Speicherbilds für `bge-m3` (1,2 GB) der gesamte Ollama-Verbrauch (z. B. 19,2 GB) als `modelBytes` von `bge-m3` verbucht.
2. **Anderes Modell geladen, ungeladenes Modell betrachtet:** Ist ein großes Modell in Ollama geladen und wählt der Nutzer ein anderes, ungeladenes Modell im Speicherbild, ist `loaded === null`; `otherBytes = usedBytes` rechnet das fremde Ollama-Modell vollständig zu „System und Programme“ hinzu, obwohl Ollama aus der „Platz schaffen“-Liste herausgefiltert ist (`shared/memoryPicture.ts:147`).
3. **Teilweiser CPU-Offload (GGUF `mmap`) und Runner-Pfade:** Bei `mmap`-geladenen CPU-Anteilen liegen Gewichte im File-Cache (nicht in `Anonymous`/`wired`), `usedBytes` enthält sie also nicht, während `otherBytes = usedBytes - loadedBytes` dennoch `loaded.sizeBytes` voll abzieht und `otherBytes` künstlich auf `MIN_OTHER_BYTES` (2 GiB) drückt. Zudem übersieht `/\/ollama(\s|$)/i` Runner-Binaries in Unterordnern wie `/opt/homebrew/Cellar/ollama/.../mlx-runner`.
Vorschlag: `/api/ps` vollständig auswerten, andere geladene Ollama-Modelle gesondert ausweisen (statt sie in `otherBytes` oder das falsche `modelBytes` zu werfen) und `ollamaBytes` nur dann heranziehen, wenn genau das abgefragte Modell in `/api/ps` geladen ist.

### F08 — Überzogene Zusagen der Oberfläche („ohne Auslagerung“ bis 100 % RAM, „mindestens rund“, GGUF-Widerspruch in `settingOver`)
Schwere: mittel
Stelle: app/src/renderer/utils/i18n/settingsPages.ts:38-39,43,51-52,65; app/src/renderer/utils/i18n/agentCard.ts:20; app/src/renderer/components/Settings/MemoryPictureCard.tsx:106-116,195-197
Status: [OFFEN]
Mehrere Texte versprechen mehr Sicherheit, als Messung und Rechnung hergeben:
1. **„ohne Auslagerung“ bis 100 % des physischen RAM (`shared/memoryPicture.ts:275,310`, `settingsPages.ts:52`, `agentCard.ts:20`):** Bei `otherBytes + needBytes = 31,9 GB` von `32,0 GB` meldet die Oberfläche „Passt in den Arbeitsspeicher … bis {allowed} GB geht es ohne Auslagerung“ bzw. „0,1 GB bleiben frei“. Auf macOS Apple Silicon komprimiert und lagert das System deutlich vor 100 % Auslastung aus, und GPU/MLX-Belegungen stoßen an das Wired-Limit `iogpu.wired_limit_mb` (~66–75 % des RAM).
2. **„mindestens rund {n} Token“ (`settingsPages.ts:38-39`, EN `:440-441`):** Die unbestätigte Ollama-Vorausrechnung wird als garantierte Untergrenze dargestellt, obwohl sie nur an einem Modell gegengeprüft wurde, gegen 100 % RAM ohne Sicherheitsabstand gerechnet wird und bei geladenem Modell `bufferBytes = 0` setzt.
3. **Selbstwiderspruch bei GGUF in `settingOver` (`MemoryPictureCard.tsx:195-197`, `settingsPages.ts:43,65`):** `settingOver` behauptet pauschal „Belegt wird der Speicher erst, wenn sich das Fenster füllt.“ — auch wenn `tokenSource === 'architecture'` (GGUF) aktiv ist, obwohl `sourceArch` am Ende derselben Karte ausdrücklich schreibt: „Dieses Modellformat belegt das ganze eingestellte Fenster schon beim Laden, nicht erst, wenn es sich füllt.“
4. **„hat die App an diesem Modell selbst gemessen“ (`settingsPages.ts:51`):** Nennt weder Stichprobenzahl noch abgedeckte Token-Spanne; ab 3 Punkten über 4 000 Token Spanne wird still bis 262 144 Token extrapoliert (siehe F04).
Vorschlag: Sicherheitsabstand/GPU-Limit einplanen oder „ohne Auslagerung“ und „mindestens“ durch vorsichtige Formulierungen („rechnerisch frei“, „grobe Schätzung“) ersetzen; `settingOver` für `tokenSource === 'architecture'` anpassen; bei `sourceMeasured` Zahl der Messpunkte und höchste gemessene Tokenzahl nennen.

### F09 — „Platz schaffen“ aus dem Modell-Menü verliert Tab-Modelle, rechnet mit anderem Ziel und zeigt falsche Warnungen durch `roundTokens`/Loaded-Vergleich
Schwere: mittel
Stelle: app/src/renderer/components/Settings/MemoryPictureCard.tsx:29,44,47,68,75,90,115,195; app/src/renderer/components/Agent/ContextWindowRow.tsx:42-53; app/src/renderer/components/Agent/AgentView.tsx:200,219; app/src/renderer/components/Settings/Settings.tsx:968-974
Status: [OFFEN]
1. **Per-Tab gewähltes Modell wird verworfen (`MemoryPictureCard.tsx:29,44`):** Wählt der Nutzer im Agent-Tab ein lokales Modell (`localModel`, `AgentView.tsx:200,219`), das nicht in `inUse` (`selectedModel`, `overrides`, `emailModel`) steht, und klickt in `ContextWindowRow` auf „Platz schaffen“, scheitert `picked && inUse.includes(picked)` — die Einstellungskarte zeigt still `selectedModel` statt des angeklickten Modells.
2. **Abweichendes Zielfenster trotz gemeinsamem Cache (`MemoryPictureCard.tsx:75` vs. `ContextWindowRow.tsx:42-44`):** Ist `picked` zwar in `inUse`, aber `picked !== agentModel`, rechnet `MemoryPictureCard` mit `32 768` (`AGENT_CONTEXT_DEFAULT`) statt `wanted`. Umgekehrt klemmt `ContextWindowRow` `wanted` auf `effective` (über `modelMax` aus `noteAgentContextInfo`), `MemoryPictureCard` dagegen nicht. Damit zeigen Menü und Karte entgegen dem Zweck von `memoryPictureClient.ts:3-7` unterschiedliche Zahlen und Defizite.
3. **Falsche Warnung durch `roundTokens` und bei geladenem Modell (`MemoryPictureCard.tsx:90,115,195`):** `tokens` ist per `roundTokens` auf volle 1 000 abgerundet. Bei `tokensFit = 32 900` (32 768 passt!) ergibt `tokens = 32 000 < 32 768` → Warnfarbe + `settingOver`, direkt über grünem `reliefFits` („passt“). Bei geladenem Modell (`picture.loaded === true`) ist `tokensFit` nur der *zusätzlich* freie Platz; passen zu 20k geladenen Token noch 15k dazu (gesamt 35k > 32 768), greift `15 000 < 32 768` trotzdem als Warnung.
4. **Anker-Sprung ins Leere & verstecktes Dropdown (`Settings.tsx:968-974`, `MemoryPictureCard.tsx:47,68`):** `Settings.tsx` scrollt nach 90 ms zu `ai-memory-picture`. Bei Cache-Miss (oder Modell-Fallback) liefert `MemoryPictureCard` während der Messung `null` (Höhe 0) — der Sprung läuft ins Leere. Ist `selectedModel` ein Cloud-Modell, versteckt `state: 'hidden'` die ganze Karte samt `<Select>`, sodass andere lokale Modelle aus `inUse` gar nicht auswählbar sind.
Vorschlag: `picked` in die Modellliste von `MemoryPictureCard` aufnehmen, Ziel-Kontext bei `openMemoryPictureFor` übergeben, Warnbedingung an `plan.deficitBytes > 0` (statt `roundTokens(tokensFit) < wanted`) koppeln, beim Laden einen Platzhalter rendern und bei nicht-lokalem `selectedModel` auf ein lokales Modell aus `inUse` ausweichen.

### F10 — Ungeschützte Nebenläufigkeit, nicht-atomares Schreiben und fehlende Validierung bei `memory-projections.json` und `model-memory.json`
Schwere: mittel
Stelle: app/src/main/noteAgent/memoryPicture.ts:56-79; app/src/main/llm/modelMemory.ts:16-54
Status: [OFFEN]
1. **`memory-projections.json` ohne Schreib-Serialisierung und atomaren Tausch (`main/noteAgent/memoryPicture.ts:69-77`):** Parallele `readMemoryPicture`-Aufrufe (z. B. Einstellungen + Modell-Menü oder rascher Modellwechsel) lesen und überschreiben dieselbe Datei gleichzeitig (Lost Updates oder halb geschriebenes JSON bei Absturz). Zeile 75 vergleicht außerdem `contextLength` und `fullContextBytes`, vergisst aber `workspaceBytes` — ändert sich nur der Rechenpuffer, bleibt der alte Wert stehen. Zeile 59 prüft nicht `!Array.isArray(json)` und Zeile 72 validiert `workspaceBytes` nicht: fehlt das Feld in einem Eintrag, erzeugt `unloadedBytes + undefined` in `shared/memoryPicture.ts:274` ein `NaN` für `baseModelBytes`.
2. **Initial-Load-Race, nicht-atomares Schreiben und fehlende Typprüfung in `modelMemory.ts:16-50`:** Rufen zwei parallele `sampleModelMemory`-Läufe `load()` auf, solange `cache === null` ist, lesen beide die Datei und die zweite Kopie überschreibt die Änderungen der ersten. `fs.writeFile` in Zeile 49 schreibt direkt auf die Zieldatei (nicht Temp-Datei + `rename`), sodass ein Abbruch die ganze Messdatei zerstört (`load()` setzt sie beim nächsten Start still auf `{}`). Ist `store[model]` durch eine beschädigte Datei kein Array, wirft `addMemorySample` (`samples.filter`) still und blockiert jede weitere Aufnahme für dieses Modell.
Vorschlag: `load()` über eine geteilte `loadingPromise` serialisieren, für beide Dateien eine Schreib-Queue mit atomarem Temp-Datei-`rename` nutzen, alle Felder beim Laden strikt validieren (inkl. `workspaceBytes` und Sample-Arrays) und `workspaceBytes` im Änderungsvergleich prüfen.

### F11 — Fragiles Log-Parsing (`latestContextProjection`): Parallele Runner vertauschen Modelle, `logTail`-Schnitt, fehlende `:latest`- und Quote-Behandlung
Schwere: mittel
Stelle: app/src/shared/memoryPicture.ts:26-53; app/src/main/noteAgent/memoryPicture.ts:32-47,65-79
Status: [OFFEN]
1. **Überlappende Runner-Starts ordnen Vorausrechnungen dem falschen Modell zu (`shared/memoryPicture.ts:41-51`):** Laut Testfixture (`memoryPicture.test.ts:9-10`) liegen ~8–10 Sekunden zwischen `starting mlx runner subprocess` und `MLX automatic parallelism`. Startet Ollama dazwischen einen zweiten Runner (z. B. `bge-m3` oder ein zweites Modell), überschreibt dessen Startzeile das einzige Zustandsfeld `current`, und die kurz darauf erscheinende Parallelism-Zeile des ersten Modells wird dem falschen Modell zugeschrieben und in `memory-projections.json` dauerhaft gespeichert.
2. **Unnormierter Modellname und Anführungszeichen (`shared/memoryPicture.ts:26,46`):** `model=(\S+)` übernimmt Anführungszeichen (`model="foo"`), falls `slog` den Namen quotiert; `current !== model` schlägt dann fehl. Ebenso fehlt der `:latest`-Abgleich (anders als in `modelWeightsBytes` `:87-88` und `loadedModelFromPs` `localContext.ts:39`): loggt Ollama `model=foo:latest` während die App `foo` sucht (oder umgekehrt), liefert der Parser `null`.
3. **2-MB-Log-Schwanz und fester Dateipfad (`main/noteAgent/memoryPicture.ts:32-47,66-68`):** Schneidet `logTail` zwischen Runner-Start und Parallelism-Zeile (oder mitten in der ersten Zeile), bleibt `current === ''` und die Vorausrechnung geht verloren. Der feste Pfad `~/.ollama/logs/server.log` findet zudem keine Logs von `ollama serve` (Homebrew/Terminal), während alte Einträge in `memory-projections.json` ohne Ablaufzeit oder Digest ewig weiter gelten, auch nach Format- oder Modelländerungen.
Vorschlag: Modellnamen normalisieren (Quotes entfernen, `:latest` angleichen), bei Teil-Lesung in `logTail` die erste abgeschnittene Zeile verwerfen, Runner-Zuordnung nach Möglichkeit über Port/Zeitstempel absichern und Cache-Einträge in `memory-projections.json` mit Zeitstempel/Digest versehen.

### F12 — `kvBytesPerTokenFromShow` ignoriert Sliding-Window-Attention, Hybrid-/MLA-Architekturen, `OLLAMA_NUM_PARALLEL` und `general.architecture`
Schwere: mittel
Stelle: app/src/shared/memoryPicture.ts:56-92
Status: [OFFEN]
1. **Sliding-Window-Attention (Gemma 2/3/4, Mistral u. a.) und MLA (DeepSeek):** `kvBytesPerTokenFromShow` behandelt alle Schichten als vollen globalen KV-Cache, obwohl SWA-Schichten ihren Speicher beim lokalen Fenster (z. B. 512/1024 Token) begrenzen und DeepSeek-MLA komprimierte Latent-Vektoren verwendet — die Kosten je Token werden teils um Faktoren überschätzt.
2. **`OLLAMA_NUM_PARALLEL` unberücksichtigt:** Der Kommentar (`:58`) behauptet, die Rechnung liege „auf der sicheren Seite“. Bei `OLLAMA_NUM_PARALLEL = 2` oder `4` reserviert Ollama jedoch den KV-Cache mehrfach — die Formel unterschätzt den Bedarf dann um den Faktor 2–4.
3. **Schlüssel-Suche ohne `general.architecture`-Präfix und fehlende `isFinite`-Prüfung (`:68-73,79`):** `pick()` liefert den ersten passenden Suffix-Treffer aus `Object.entries(info)` statt `info['general.architecture']` als Präfix zu nutzen (`memoryPicture.test.ts:79` enthält es). Im Array-Reduce (`:79`) fehlt `Number.isFinite(n)`.
Vorschlag: `general.architecture` als Schlüsselpräfix verwenden, `Number.isFinite` ergänzen, bei SWA-/MLA-Architekturen (`sliding_window`, `kv_lora_rank`) korrekt differenzieren oder `null` zurückgeben statt zu schätzen, und `OLLAMA_NUM_PARALLEL` als Einschränkung in `sourceArch` nennen.

### F13 — 60-s-Fehlercache, Prozess-Sturm ohne In-Flight-Deduplizierung, Stale-Response-Races und stilles `top`-Timeout
Schwere: mittel
Stelle: app/src/renderer/utils/memoryPictureClient.ts:18-38; app/src/renderer/components/Agent/ContextWindowRow.tsx:56-59,70; app/src/renderer/components/Settings/MemoryPictureCard.tsx:54-66,135,146; app/src/main/noteAgent/memoryPicture.ts:26-30,127-140
Status: [OFFEN]
1. **Fehler und Timeouts werden 60 Sekunden lang als `null` gecacht (`memoryPictureClient.ts:26,36`):** Läuft `vm_stat` unter starkem Swap-Druck ins 4-s-Timeout (`main/noteAgent/memoryPicture.ts:28,139-140`) oder ist Ollama kurz nicht erreichbar, speichert `cache.set(model, { at: Date.now(), data: null })` dieses `null` für `FRESH_MS = 60_000`. `MemoryPictureCard` blendet sich komplett aus (ohne „Neu messen“-Knopf) und probiert es 60 Sekunden lang nicht erneut.
2. **Kein In-Flight-Deduplicating → Prozess-Sturm (`memoryPictureClient.ts:23-38`, `ContextWindowRow.tsx:56-59,70`):** `cache.set` erfolgt erst nach `await`. Mehrfaches Hineinfahren in `ContextWindowRow` (oder paralleles Öffnen von Menü und Einstellungen) startet während laufender Messungen wiederholt parallel `vm_stat`, `sysctl`, `ps`, `top` sowie drei Ollama-HTTP-Aufrufe.
3. **Stale-Response-Races (`ContextWindowRow.tsx:56-59`, `MemoryPictureCard.tsx:54-66`):** `refreshIfStale` prüft weder Unmount noch Modellwechsel; ebenso fehlt `MemoryPictureCard.load` eine Request-ID. Beim schnellen Modellwechsel kann die verspätete Antwort von Modell A die Anzeige von Modell B überschreiben. Zudem laufen die festen `setTimeout(..., 4000)` / `1500` (`MemoryPictureCard.tsx:135,146`) nach dem Schließen der Einstellungen ungebremst weiter.
4. **Stilles `top`-Timeout (`main/noteAgent/memoryPicture.ts:28,132`):** Überschreitet `top -l 1 -stats pid,mem` unter genau dem Speicherdruck, bei dem „Platz schaffen“ gebraucht wird, die 4 s, liefert `run()` still `''`; ausgelagerte Programme fallen unter `MIN_APP_BYTES` und verschwinden kommentarlos aus der Liste.
Vorschlag: `null`-Ergebnisse nicht 60 s lang cachen, laufende Abfragen pro Modell in einer `inFlight`-Map zusammenführen, Request-IDs/Unmount-Guards in `MemoryPictureCard` und `ContextWindowRow` ergänzen und ein `top`-Timeout sichtbar melden oder großzügiger bemessen.

### F14 — `closedHere` geht bei Neustart verloren; keinerlei automatisierte Tests für den neuen Main-Code
Schwere: mittel
Stelle: app/src/main/noteAgent/memoryRelief.ts:17,48-92; app/src/main/noteAgent/memoryPicture.ts:1-155; app/src/main/llm/modelMemory.ts:1-63
Status: [OFFEN]
1. **Flüchtiger `closedHere`-Zustand (`memoryRelief.ts:17,63`):** Der native Dialog verspricht „Über das Speicherbild lassen sie sich danach wieder öffnen“, aber `closedHere` existiert nur im Arbeitsspeicher des Main-Prozesses. Nach einem Neustart, Absturz oder Dev-Reload ist die Liste weg; umgekehrt bleiben manuell wieder geöffnete Programme während der Sitzung dauerhaft in `reopenable`.
2. **Fehlende Main-Tests (Projektregel / Prüfpunkt 6):** Getestet ist nur die reine Logik in `app/src/shared/memoryPicture.test.ts`. Für den sicherheitskritischen `osascript`/`open`-Code in `memoryRelief.ts` (Allowlist-Abgleich gegen `closableNow`, Dialogabbruch, Argumentreihenfolge — vergleiche das getestete `setComputerProcessStarterForTests`-Muster in `app/src/main/noteAgent/computerControl.ts:45`), für `main/noteAgent/memoryPicture.ts` (`logTail`, `contextProjection`-Cache, `loadedBytes`) und für `main/llm/modelMemory.ts` (Nebenläufigkeit, defektes JSON, `:latest`) existiert kein einziger Test.
Vorschlag: Prozessstarter, `fetch` und Dateisystem in den drei Main-Modulen injizierbar machen und gezielte Unit-Tests ergänzen; den Dialogtext für „Wieder öffnen“ auf die laufende Sitzung eingrenzen (oder sicher mit Bundle-Identität persistieren und gegen laufende Prozesse abgleichen).

### F15 — Duplizierte und abweichende Balken-Darstellung, Inline-Styles, toter `appsGain`-Zweig, GiB/GB-Inkonsistenz und veraltete Regeln
Schwere: niedrig
Stelle: app/src/renderer/components/Agent/ContextWindowRow.tsx:7,48-51,92-98; app/src/renderer/components/Settings/MemoryPictureCard.tsx:14,71,89,154-182,239-243,249; app/src/renderer/components/Settings/SettingsUI.css:827; app/src/main/noteAgent/memoryPicture.ts:26-30,142; app/src/main/noteAgent/memoryRelief.ts:19-27; .claude/rules/note-agent.md:67
Status: [OFFEN]
1. **Duplizierte, auseinanderlaufende Balken-Logik (`MemoryPictureCard.tsx:155-182` vs. `ContextWindowRow.tsx:92-98`):** `ContextWindowRow` importiert direkt `'../Settings/SettingsUI.css'` (`:7`), verschmilzt `bufferBytes` unter dem Tooltip „Modell“ in `is-model` und prüft in Zeile 94–95 `bar.modelBytes + bar.bufferBytes > 0` bzw. `bar.contextBytes > 0` vor dem Abschneiden am RAM-Ende. Bei vollem RAM entstehen `width: 0%`-Divs, die `.sui-membar-seg { min-width: 2px }` (`SettingsUI.css:827`) als falsche 2-px-Farbstreifen sichtbar macht.
2. **Inline-Styles in Einstellungen (`.claude/rules/settings-ui.md:14`):** `MemoryPictureCard.tsx:156` verwendet `style={{ width: pct(bytes) }}` inline (und `ContextWindowRow.tsx:93-97` ebenso).
3. **Toter Codezweig `appsGain` (`MemoryPictureCard.tsx:154,239-243`):** `appsGain` hängt an `gain >= 1000` (braucht `picture.bytesPerToken`) innerhalb von `{!plan && apps.length > 0 && over > 0}`. `!plan` tritt aber fast ausschließlich bei `!bytesPerToken` ein (`shared/memoryPicture.ts:308`), sodass `gain` dort `0` bleibt und `appsGain` praktisch unerreichbar ist.
4. **Duplizierte Main-Helfer, Einheiten und Doku-Drift:** `ownAppName()` und `run()` sind in `main/noteAgent/memoryPicture.ts:26-30,142` und `main/noteAgent/memoryRelief.ts:19-27` doppelt vorhanden. Alle Werte werden durch `1024**3` (GiB) bzw. `1024` (KiB) geteilt, aber als `GB`/`KB` beschriftet, was gegenüber dezimalen Ollama-Angaben (`5,89 GB` vs. `5,5 GiB`) um ~7 % abweicht; `footprintsFromTop` (`shared/memoryPicture.ts:213`) erkennt zudem nur `K|M|G` (kein `B`/`T`). `.claude/rules/note-agent.md:67` führt das bereits gebaute Modell-Menü noch als „Nicht gebaut“ und beschreibt die Programmgröße noch ohne `top`.
Vorschlag: Gemeinsame `MemoryBarView`-Komponente (ohne 0%-`min-width`-Artefakte) und geteilte Main-Helfer auslagern, `appsGain`-Bedingung bereinigen, `.claude/rules/note-agent.md:67` aktualisieren und die Binär-/Dezimal-Einheit konsistent handhaben.

### Runde 2

Nachprüfung gegen Commit `763f4d7b` (nur Code gelesen, keine Programme/Tests/Modelle ausgeführt).

#### Stand der Findings aus Runde 1
- **F01:** teilweise — `PROGRAM_FOLDER` (`app/src/shared/memoryPicture.ts:142,172`), `offerAppsForRelief` (`app/src/main/noteAgent/memoryRelief.ts:53-55,105`), `ownBundlePath` (`:48-50`) und Symlink-/`realpath`-Prüfung (`:58-69`) sind umgesetzt; aber `bundleIdentity` lässt In-Place-Manipulation von Binary/`Info.plist` durch (F16), `offerAppsForRelief` wird bedingungslos überschrieben (F19), und dialogfreies Wiederöffnen ist so nicht haltbar.
- **F02:** teilweise — Pfad-Gruppierung (`app/src/shared/memoryPicture.ts:162,173-175`), Pfad-Label (`app/src/main/noteAgent/memoryRelief.ts:83-86,117`; `MemoryPictureCard.tsx:161,246`), Deduplizierung (`memoryRelief.ts:99`) und 6-s-`ps`-Nachprüfung (`:129-141`) sind umgesetzt; zur Ablehnung des `osascript`-Teilpunkts siehe Bewertung unten.
- **F03:** behoben — `baseModelBytes` zählt `workspaceBytes` bei geladenem Modell nicht mehr mit (`app/src/shared/memoryPicture.ts:324`), und `reliefPlan` rechnet Bedarf und Lücke direkt aus `memoryBar` (`app/src/shared/memoryPicture.ts:374-396`).
- **F04:** teilweise — Theil-Sen (`app/src/shared/memoryPicture.ts:226-247`), `modelMemoryKey` (`app/src/main/llm/modelMemory.ts:32-35`) und `loaded.length !== 1` (`:84`) sind umgesetzt; aber `measuredModelMemory` prüft keinen Digest, GGUF-Ausschluss ist fail-open, Streaming-`hiddenThinking` bleibt `false` und das Toleranzband akzeptiert Rauschen (F18; Bildaufrufe und High-Water-Mark weiter offen wie benannt).
- **F05:** behoben — „das reicht“ durch Obergrenzen-Hinweis ersetzt (`app/src/renderer/utils/i18n/settingsPages.ts:49-50,59,61`; `MemoryPictureCard.tsx:247,255`) und `loadedBytes` nutzt nur noch `loaded.sizeBytes` (`app/src/main/noteAgent/memoryPicture.ts:155`).
- **F06:** teilweise — `reliefPlan.impossible` verhindert negatives Budget und Schließvorschläge (`app/src/shared/memoryPicture.ts:380-384`), aber bei gleichzeitigem `overModel > 0` verschluckt `MemoryPictureCard.tsx:129-137,232-237` die `impossible`-Meldung komplett (F17).
- **F07:** nicht behoben — zurückgestellt; `readMemoryPicture` (`app/src/main/noteAgent/memoryPicture.ts:141,155`) trennt fremde geladene Modelle weiter nicht von `otherBytes` (nur `sampleModelMemory` bricht bei `loaded.length !== 1` ab, `modelMemory.ts:84`).
- **F08:** teilweise — „mindestens rund“ und `settingOver` sind weg (`settingsPages.ts:38-39`), `tight` unter 1 GiB und Stichprobenangabe sind da (`shared/memoryPicture.ts:342,394`, `settingsPages.ts:46,56`); aber `gpuLimitFromLog` missdeutet dynamisches `available` als Hardware-Grenze (F17) und `maxTokens` zählt Ausreißer mit (F18).
- **F09:** teilweise — Tab-Modell in `inUse` (`MemoryPictureCard.tsx:48`), `targetTokens`-Übergabe (`memoryPictureClient.ts:70-75`), Warnfarbe über `plan` (`MemoryPictureCard.tsx:154`) und Ladeplatzhalter (`:84-96`) sind umgesetzt; aber `asked.targetTokens` blockiert danach den Kontextregler, und `picker` blendet die Karte auf nicht unterstützten Plattformen/LM Studio ein (F20).
- **F10:** teilweise — `modelMemory.ts:58-73` nutzt geteilte `loading`-Promise, Temp-Datei + `rename` und `parseModelMemoryStore`; `memory-projections.json` in `app/src/main/noteAgent/memoryPicture.ts:56-83` ist unverändert offen.
- **F11:** nicht behoben — zurückgestellt (`app/src/shared/memoryPicture.ts:40-53`, `app/src/main/noteAgent/memoryPicture.ts:32-47,67-83`).
- **F12:** nicht behoben — Formel in `app/src/shared/memoryPicture.ts:65-92` unverändert; nur der Hinweistext in `settingsPages.ts:69` ergänzt.
- **F13:** teilweise — kein `null`-Cache (`memoryPictureClient.ts:42,47-50`), `inFlight`-Map (`:25,37-38`), Request-ID/`alive` (`MemoryPictureCard.tsx:59-74,173-191`), `mounted`/`shownModel` (`ContextWindowRow.tsx:57-65`) und 8-s-`top`-Timeout mit `sizesPartial` (`main/noteAgent/memoryPicture.ts:138,166`) sind umgesetzt; aber `fresh = true` übernimmt veraltete `inFlight`-Läufe, im `hidden`-Zustand fehlt „Neu messen“ und `ContextWindowRow` behält bei Ausfall alte Daten (F20, F21).
- **F14:** teilweise — Sitzungshinweis im Dialog/Text ergänzt (`memoryRelief.ts:119`, `settingsPages.ts:65`); neue Tests (`memoryRelief.test.ts`, `modelMemory.test.ts`) lassen zentrale Pfade ungetestet (F22), `closedHere` weiter flüchtig und `main/noteAgent/memoryPicture.ts` ungetestet.
- **F15:** teilweise — `appsGain` entfernt, `ownBundlePath` vereinheitlicht (`memoryRelief.ts:48-50`); Balken-Duplikat inkl. 0%-`min-width`-Artefakt (`ContextWindowRow.tsx:99-101`), Inline-Styles, GiB/GB und doppeltes `run()` unverändert offen.

#### Bewertung zu Frage (3): Ablehnung in F02 & „Wiederöffnen ohne zweiten Dialog“
- **Ablehnung in F02 (`osascript … to quit` startet beendete App nicht):** Nur **eingeschränkt haltbar**. Die Messung an `/System/Applications/Calculator.app` auf macOS 26.6 ist für Apple-Systemprogramme plausibel, beweist aber nicht, dass `tell application (item 1 of argv) to quit` bei beliebigen Drittanbieter-, Electron- oder älteren Bündeln unter `~/Applications` niemals startet. Zudem trägt `quitAppsForRelief` (`app/src/main/noteAgent/memoryRelief.ts:124-141`) ein Programm, das während des Dialogs bereits geschlossen wurde, ohne `is running`-Prüfung trotzdem in `closed` und `closedHere` ein. `if application (item 1 of argv) is running then` im Skript kostet eine Zeile und schließt beides aus.
- **Diskussionspunkt F01 („Wiederöffnen ohne zweiten Dialog“):** **In der aktuellen Form nicht haltbar.** Die Begründung stützt sich auf „ein unverändertes Programm“. Genau das garantiert `bundleIdentity` (`app/src/main/noteAgent/memoryRelief.ts:58-69`) aber nicht, weil es nur Ordner- und `Info.plist`-Inode prüft (siehe F16). Selbst mit echter Integritätsprüfung bliebe offen, dass ein kompromittierter Renderer `note-agent-memory-relief-reopen` still während eines Laufs auslösen und gerade geschlossene Programme im Hintergrund wieder starten kann, um den Arbeitsspeicher erneut zu füllen. Ohne starke Integritätsprüfung (mindestens Hash von `Info.plist` + Executable oder `codesign --verify`) gehört ein Dialog davor — insbesondere für `~/Applications`.

### F16 — `bundleIdentity` lässt In-Place-Manipulation von Binary und `Info.plist` durch; `skipped` beim Wiederöffnen wird verschluckt
Schwere: hoch
Stelle: app/src/main/noteAgent/memoryRelief.ts:58-69,150-170; app/src/renderer/components/Settings/MemoryPictureCard.tsx:184-193
Status: [OFFEN]
1. **Umgehbare Integritätsprüfung (`memoryRelief.ts:58-69,159-164`):** `bundleIdentity` prüft lediglich die Inodes des `.app`-Ordners (`bundleIno`) und von `Contents/Info.plist` (`plistIno`, ohne `st_dev`). In jedem benutzerbeschreibbaren Bündel (insbesondere unter `~/Applications/...`, oder einem beschreibbaren `/Applications/...`) kann ein Angreifer, Skript oder die Agent-Shell das eigentliche Binary unter `Contents/MacOS/*` bzw. eine Bibliothek unter `Contents/Frameworks/*` austauschen — oder `Contents/Info.plist` in-place überschreiben (`O_TRUNC` ändert den Inode nicht!). Beide Inodes bleiben identisch; `reopenAppsAfterRelief` startet dann ohne Rückfrage fremden Code per `open -g -a`.
2. **Stilles Verschlucken von `skipped` und Fehlern (`MemoryPictureCard.tsx:184-193`, `memoryRelief.ts:160-169`):** `reopenAppsAfterRelief` liefert `{ reopened, skipped }`, aber `MemoryPictureCard.tsx:187` verwirft den Rückgabewert komplett. Wird ein Bündel wegen Inode-Abweichung übersprungen (und aus `closedHere` gelöscht) oder scheitert `open -g -a` (`!res.ok`), erhält der Nutzer keinerlei Rückmeldung.
Vorschlag: `bundleIdentity` um `st_dev` sowie SHA-256 von `Contents/Info.plist` und dem darin genannten `CFBundleExecutable` (oder `codesign --verify`) erweitern; für `~/Applications` bzw. ohne vollständige Signaturprüfung beim Wiederöffnen einen Bestätigungsdialog zeigen; `skipped` und fehlgeschlagene Starts in `MemoryPictureCard.tsx` anzeigen.

### F17 — `gpuLimitFromLog` missdeutet Ollamas momentanes `available` als Hardware-Obergrenze und sperrt „Platz schaffen“ fälschlich aus
Schwere: hoch
Stelle: app/src/shared/memoryPicture.ts:99-109,375-384; app/src/main/noteAgent/memoryPicture.ts:65,71,160; app/src/shared/memoryPicture.test.ts:92-94; app/src/renderer/components/Settings/MemoryPictureCard.tsx:129-137,232-263; app/src/renderer/utils/i18n/settingsPages.ts:47
Status: [OFFEN]
1. **Dynamische Momentaufnahme als statisches Hardware-Limit (`shared/memoryPicture.ts:99-109`, `main/noteAgent/memoryPicture.ts:65,71`):** `gpuLimitFromLog` liest `available="..."` aus der jüngsten `msg="gpu memory"`-Zeile. Schon das eigene Testfixture (`memoryPicture.test.ts:92-94`) zeigt, dass `available` auf demselben Rechner schwankt (`20.0 GiB` vs. `24.5 GiB`): in Ollamas Scheduler ist `available` der *zum Zeitpunkt des Log-Eintrags frei verfügbare* Grafikspeicher, nicht das feste Hardware-Limit (`iogpu.wired_limit_mb`). War zu diesem Zeitpunkt bereits ein Modell geladen oder anderer Speicher belegt, sinkt `available` stark ab, wird in `lastGpuLimit` festgehalten (`main/noteAgent/memoryPicture.ts:71`) und löst in `reliefPlan` (`shared/memoryPicture.ts:380`) fälschlich `impossible: 'gpu'` aus — die Karte verweigert dann alle Schließvorschläge mit „auch wenn alle Programme geschlossen sind“, obwohl Schließen helfen würde.
2. **Überhöhte Vorausrechnung sperrt das 32k-Standardfenster mit „Wähle ein kleineres Fenster“ (`shared/memoryPicture.ts:377,380`, `settingsPages.ts:47`):** Bei ungeladenem, ungemessenem Modell addiert `needBytes` Ollamas 4-GiB-`bufferBytes` und die überhöhte Vorausrechnung (`17 + 4 + 5,5 = 26,5 GiB > 24,5 GiB` für `qwen3.8:27b-mlx` bei 32 768 Token). `reliefPlan` stuft damit selbst das kleinste Standardfenster als `impossible: 'gpu'` ein, schlägt kein „Platz schaffen“ vor und fordert „Wähle ein kleineres Fenster“, obwohl 32 768 bereits die kleinste Stufe ist und real nur ~19,5 GiB benötigt.
3. **`overModel > 0` verschluckt `impossible` komplett (`MemoryPictureCard.tsx:129-137,232-237`):** Ist gleichzeitig `overModel > 0` und `plan.impossible != null`, trifft Zeile 129 vor Zeile 132/135, während die Zeilen 232 und 237 wegen `!plan.impossible` ausgeblendet bleiben — die Karte nennt dann weder die Unmöglichkeit noch bietet sie „Platz schaffen“ an.
Vorschlag: Hardware-GPU-Grenze nicht aus dem schwankenden Log-Feld `available` ziehen (stattdessen `sysctl -n iogpu.wired_limit_mb` bzw. dokumentiertes Systemlimit); unbestätigte Ollama-Vorausrechnungen nicht als harte `impossible`-Sperre gegen „Platz schaffen“ verwenden; in `MemoryPictureCard.tsx` bei `plan.impossible` den Hinweis unabhängig von `overModel > 0` anzeigen.

### F18 — `modelMemory.ts` & `fitModelMemory`: `measuredModelMemory` ignoriert Digest (Altdaten/GGUF bleiben aktiv), GGUF-Filter fail-open, Streaming-`hiddenThinking` unwirksam, Rauschen passiert Toleranzband
Schwere: hoch
Stelle: app/src/main/llm/modelMemory.ts:76-110; app/src/main/llm/telemetry.ts:107; app/src/main/index.ts:6127,6266,8516; app/src/shared/memoryPicture.ts:226-247
Status: [OFFEN]
1. **Digest wird beim Lesen nie geprüft (`modelMemory.ts:104-110`):** `measuredModelMemory(model)` liest `store[modelMemoryKey(model)]?.samples` ohne Abgleich gegen den aktuellen Digest aus `/api/tags`. Nach einem `ollama pull` derselben Modellbezeichnung gelten die alten Messwerte bis zum nächsten Aufruf weiter. Schlimmer noch: für ein GGUF-Modell mit Alt-Samples aus der Version vor Commit `763f4d7b` bricht `sampleModelMemory` jetzt in Zeile 88 ab, ohne den alten Eintrag zu löschen — die vergifteten GGUF-Samples gewinnen über `measured` (`shared/memoryPicture.ts:327-330`) dauerhaft gegen die `architecture`-Rechnung.
2. **GGUF-Filter fail-open und Vision/OCR weiter ungefiltert (`modelMemory.ts:88`, `telemetry.ts:107`):** `hit.details?.format === 'gguf'` schließt nur exakt klein geschriebenes `'gguf'` aus; fehlt `details`/`format`, wird trotzdem gemessen (was Ollama für MLX in `details.format` liefert, konnte ohne Modellstart nicht live geprüft werden). Vision-OCR- und `describeImage`-Aufrufe (`telemetry.ts:107`) bleiben weiter in der Messung.
3. **`!run.hiddenThinking` greift bei Streaming-Aufrufen nicht (`telemetry.ts:107`, `main/index.ts:6127,6266,8516`):** Im Streaming (`ollama-chat`, `streamPetrolWebModel`) prüft `!!json.message?.thinking` nur den abschließenden `json.done`-Chunk, in dem `thinking` leer ist; `project-rag` (`:8516`) setzt das Feld gar nicht. Reasoning-Streaming-Läufe fließen daher weiter mit zu niedriger Tokenzahl in `sampleModelMemory` ein.
4. **Zu breite Residuen-Grenze und Ausreißer in `maxTokens`/`samples` (`shared/memoryPicture.ts:230,243-246`):** Bei `baseBytes = 17,2 GiB` liegt `bound = Math.max(0.3 GiB, 0.02 * baseBytes)` bei `±0,344 GiB` (Gesamtbreite 0,69 GiB) — über die Mindestspanne von 4 000 Token mehr als das 2,4-Fache der echten 0,28 GiB Änderung. Reines Rauschen wie `[(1000, 17,0 GiB), (3000, 17,34 GiB), (5000, 17,1 GiB)]` passiert mit `off = 0` als scheinbar „selbst gemessene“ ~26 KB/Token. Außerdem berechnen Zeile 230 und 246 `maxTokens` und `samples` über alle `clean`-Paare *einschließlich* Ausreißer: ein einzelner Ausreißer bei 100 000 Token lässt die Oberfläche fälschlich „bis 100.000 Token“ melden.
Vorschlag: In `measuredModelMemory` aktuellen Digest (und Format) aus `/api/tags` prüfen und GGUF-/Alteinträge verwerfen; `hiddenThinking` beim Streaming über alle Chunks akkumulieren und Vision/OCR in `telemetry.ts` ausschließen; Güteprüfung in `fitModelMemory` an der beobachteten Y-Spanne (`R²`) ausrichten und `maxTokens`/`samples` nur aus Inliern berechnen.

### F19 — Globales `offerAppsForRelief` überschreibt laufende Nutzerauswahl bei Hintergrund-Refresh und schaltet Apps auch ohne Defizit frei
Schwere: mittel
Stelle: app/src/main/noteAgent/memoryRelief.ts:30,53-55,105; app/src/main/noteAgent/memoryPicture.ts:149-151
Status: [OFFEN]
`readMemoryPicture` ruft bei jeder Messung bedingungslos `offerAppsForRelief(offered)` auf (`memoryPicture.ts:151`):
1. Zeigt die Einstellungskarte 10 Programme an und löst währenddessen das Modell-Menü im Hintergrund ein `readMemoryPicture` aus, bei dem `top` ins Timeout läuft (`sizesPartial: true`), überschreibt das die globale `offered`-Map mit weniger Programmen (ohne ausgelagerte Apps). Beim Klick auf „Ausgewählte beenden“ verwirft `memoryRelief.ts:105` (`!offered.has(candidate)`) die angehakten Programme still — der Klick liefert ohne jede Meldung `{ closed: [], failed: [] }`.
2. Umgekehrt schaltet jeder `note-agent-memory-picture`-Aufruf eines kompromittierten Renderers die Top-10-Programme (`>= 100 MB`) in `offered` frei, selbst wenn gar kein Defizit besteht (`deficitBytes === 0`) oder `impossible` gilt.
Vorschlag: `offered` nicht blind bei `sizesPartial`/Hintergrund-Aufrufen verkürzen (z. B. kurzes Ablauf-Fenster mit Merge oder Angebots-Token pro Messung) und `targets.length === 0` bei nicht-leerer Nutzerauswahl sichtbar melden.

### F20 — `MemoryPictureCard`: Karte erscheint trotz Ausschluss auf Windows/Linux/Intel/LM Studio; Kontextregler nach „Platz schaffen“ wirkungslos; kein Retry bei Fehler
Schwere: mittel
Stelle: app/src/renderer/components/Settings/MemoryPictureCard.tsx:31-36,48-50,65,79-97,105
Status: [OFFEN]
1. **Karte auf nicht unterstützten Plattformen und bei LM Studio sichtbar (`:48-50,65,79-97`):** Sobald `inUse.length > 1` gilt (Standardmodell plus irgendein Modul-Override oder E-Mail-Modell), ist `picker` truthy. Unter Windows, Linux, Intel-Mac oder bei `isLmStudio === true` setzt `load()` `state: 'hidden'`, aber Zeile 88 (`if (data.state === 'hidden' && !picker) return null`) greift nicht — die Karte erscheint dort dauerhaft mit dem irreführenden Text `noPicture` („kein lokales Ollama-Modell, oder die Messung hat nicht geantwortet“).
2. **Kontextregler nach „Platz schaffen“ eingefroren (`:31-36,105`):** Kommt der Nutzer über „Platz schaffen“ aus dem Modell-Menü (`asked = { model, targetTokens }`), übersteuert `asked.targetTokens` in Zeile 105 dauerhaft `wanted`. Verstellt der Nutzer anschließend den Regler in `AgentContextCard` direkt über der Karte, wird `asked` nicht zurückgesetzt (`useEffect` `:34-36` reagiert nur auf `selectedModel`) — der Balken folgt dem Regler nicht mehr.
3. **Kein „Neu messen“-Knopf im Ausfall-Zustand (`:94`):** Bleibt die Karte bei `state: 'hidden'` wegen `picker` sichtbar (z. B. nach einem `vm_stat`-Timeout), bietet Zeile 94 keine „Neu messen“-Aktion an.
Vorschlag: `isLmStudio` und echte Plattform-Nichtunterstützung klar vom Ausfall eines einzelnen Modells trennen und dort immer `null` zurückgeben; `asked` beim Ändern von `wanted` zurücksetzen; im Ausfall-Zustand eine „Neu messen“-Aktion anbieten.

### F21 — `memoryPictureClient`: `fresh = true` liefert alte `inFlight`-Messung; `ContextWindowRow` behält bei Ausfall veraltete Daten
Schwere: mittel
Stelle: app/src/renderer/utils/memoryPictureClient.ts:33-57; app/src/renderer/components/Agent/ContextWindowRow.tsx:61-65; app/src/renderer/components/Settings/MemoryPictureCard.tsx:178
Status: [OFFEN]
1. **Veraltete Messung nach „Ausgewählte beenden“ oder „Neu messen“ (`memoryPictureClient.ts:37-38`):** `loadMemoryPicture(model, true)` gibt sofort `inFlight.get(model)` zurück, falls bereits eine Messung läuft. Da `top` jetzt bis zu 8 s laufen darf (`main/noteAgent/memoryPicture.ts:138`), kann eine vor dem Beenden angestoßene Hintergrundmessung noch laufen, wenn `quitSelected` nach 2,5 s `load(true)` aufruft (`MemoryPictureCard.tsx:178`) — die Karte zeigt dann den Speicherstand von *vor* dem Beenden als Nachmessung an.
2. **Veraltete Daten im Modell-Menü nach Ausfall (`ContextWindowRow.tsx:64`):** `refreshIfStale` aktualisiert `memory` nur bei `if (data && ...)`. Wird Ollama inzwischen beendet oder scheitert die Messung (`null`), bleibt still der alte Balken stehen.
Vorschlag: Bei `fresh === true` eine neue Abfrage starten (mit Generation-Zähler, damit ältere Antworten den Cache nicht überschreiben) und in `ContextWindowRow` bei fehlgeschlagener Nachmessung `setMemory(null)` setzen.

### F22 — Neue Main-Tests (`modelMemory.test.ts`, `memoryRelief.test.ts`) lassen zentrale Sicherheits- und Kernpfade ungetestet
Schwere: mittel
Stelle: app/src/main/llm/modelMemory.test.ts:1-26; app/src/main/llm/modelMemory.ts:76-110; app/src/main/noteAgent/memoryRelief.test.ts:1-88; app/src/main/noteAgent/memoryRelief.ts:58-69,83-86,159-165; app/src/shared/memoryPicture.test.ts:221-230
Status: [OFFEN]
Die neuen Tests decken die im Antworttext beanspruchten Sicherheits- und Messgarantien nur teilweise ab:
1. **`modelMemory.test.ts` (26 Zeilen) testet die Kernfunktionen gar nicht:** Geprüft werden nur `modelMemoryKey` und `parseModelMemoryStore`. `sampleModelMemory`, `measuredModelMemory`, Digest-Wechsel, GGUF-Ausschluss (`details.format === 'gguf'`), Multi-Modell-Ausschluss (`loaded.length !== 1`), geteilte `loading`-Promise und atomares `persist` sind **ungetestet** — `sampleModelMemory` schaltet sich unter `process.env.VITEST` sogar selbst ab (`modelMemory.ts:77`, genau das Muster, das `computerControl.ts:36-44` verworfen hat).
2. **`memoryRelief.test.ts` prüft die Kern-Sicherheitszweige nicht:** Ungedeckt sind (a) der `skipped`-Pfad bei verändertem Bündel in `reopenAppsAfterRelief` (`memoryRelief.ts:159-164`), (b) die Symlink-, `realpath`- und `Info.plist`-Prüfung in `bundleIdentity` (Test 2 nutzt nur einen nicht existierenden Pfad → `ENOENT`), (c) die Ortsanzeige `label` bei gleichen Namen oder `~/Applications` (`:83-86`), (d) `ownBundlePath`-Ausschluss und (e) der `VITEST`-Wächter (`:98,151`). Zudem hängt die Suite am echten `/System/Applications/Calculator.app` des Host-Systems und läuft unter Linux gar nicht (`describe.skipIf`).
3. **`memoryPicture.test.ts` (`:221-230`):** Testet Ausreißer nur in der Mitte (`tokens: 3000`, verdeckt den `maxTokens`-Fehler) und Streuung nur mit 3–4 GB Sprüngen statt im ±0,3-GB-Rauschband.
Vorschlag: In `modelMemory.ts` `fetch` und Speicherpfad für Tests injizierbar machen und alle Kernpfade abdecken; in `memoryRelief.test.ts` temporäre Test-Bündel (Symlink, fehlende `Info.plist`, Bündeltausch → `skipped`, Namenskollision im Dialog) prüfen.

## Claude-Antwort

Runde 1, 25.11.2026. Vom Nutzer freigegeben: F01–F06, F08, F09, F13. Zurückgestellt: F07, F10, F11,
F12, F14, F15 — wo eine Korrektur ohnehin anfiel, steht es dabei. Belege: `npm run typecheck` grün,
`npx electron-vite build` grün, `npm run test` 4485 bestanden und 1 rot (`shellExecution.test.ts`,
Umgebungsprobe, bekannter Wackler unter Last; einzeln 15/15 grün). Oberfläche in der Dev-App über
CDP geprüft: Modell-Menü bei 32k/65k/131k/262k und der Sprung zur Karte.

### F01 — [ADRESSIERT], Wiederöffnen ohne Dialog [DISKUSSION]
- Programmordner statt Benutzerordner: nur noch `/Applications`, `/System/Applications`,
  `~/Applications` (`app/src/shared/memoryPicture.ts`, `PROGRAM_FOLDER`). `~/Library`, Projektordner
  auf `.app` und reine Befehlszeilenprogramme fallen heraus. Test „nur Programmordner …“.
- Der Renderer darf nur nennen, was der Main zuvor angeboten hat (`offerAppsForRelief`, gefüllt in
  `readMemoryPicture`), und was jetzt noch läuft.
- Jedes Ziel wird als echtes Bündel geprüft (`bundleIdentity`: kein Symlink, `realpath` gleich dem
  Pfad, `Contents/Info.plist`). Die eigene App über ihren Bündelpfad (`ownBundlePath`), nicht mehr
  über den Namen.
- Wiederöffnen: nur, wenn am Pfad noch dasselbe Bündel liegt (Inode von Bündel und Info.plist,
  beim Beenden gemerkt); sonst wird nichts gestartet. Einen zweiten nativen Dialog habe ich NICHT
  eingebaut: es ist ein Klick des Nutzers auf ein Programm, das er selbst gerade geschlossen hat.
  Ein kompromittierter Renderer kann damit höchstens ein vom Nutzer benutztes, unverändertes
  Programm wieder starten. Wenn das nicht reicht, ist ein Dialog schnell ergänzt.
- Kopfkommentar nennt `/System/Applications`.

### F02 — [ADRESSIERT], ein Teilpunkt [ABGELEHNT: gemessen]
- Gruppiert wird nach Bündelpfad; gleiche Namen an zwei Orten bleiben zwei Einträge, Liste und
  Dialog zeigen dann den Ort (`label` in `memoryRelief.ts`, `nameCount` in der Karte).
- Ziele werden dedupliziert (Test: dreimal derselbe Pfad → ein `osascript`).
- „Beendet“ gilt nur für das, was danach nicht mehr läuft: nach `quit` wird bis zu 6 s gegen `ps`
  nachgesehen; was noch läuft, steht unter „Läuft noch“ und kommt nicht in „Wieder öffnen“.
- Abgelehnt: „`quit` kann ein nicht laufendes Programm erst starten“. Am Rechner-Programm
  gemessen (25.11.2026, macOS 26.6): Programm zu → `osascript … to quit` → Exit 0, Programm bleibt
  zu. Derselbe Versuch bestätigt aber den dritten Teilpunkt: Exit 0 heißt nicht „beendet“.

### F03 — [ADRESSIERT]
- Geladen zählt der Rechenpuffer nicht mehr in `baseModelBytes` (`memoryPicture`).
- `reliefPlan` rechnet Bedarf und Lücke aus `memoryBar` — Balken, Kopfzeile und Plan haben eine
  Quelle. Tests: „geladen ohne eigene Messung …“, „geladen: Plan und Balken nennen dieselbe Lücke“.

### F04 — [ADRESSIERT] bis auf zwei Reste
- GGUF wird nicht mehr gemessen (`details.format === 'gguf'` in `/api/ps`), Aufrufe mit
  `hiddenThinking` auch nicht, und nichts, solange mehr als ein Modell geladen ist.
- Gerade über Mediane (Theil-Sen) mit Güteprüfung: mehr als ein Viertel der Paare weiter als
  0,3 GiB bzw. 2 % neben der Geraden → keine Messung. Tests mit Ausreißer und mit streuenden Paaren.
- Ein Eintrag je Modell (`name` = `name:latest`), gebunden an den Digest; nach `ollama pull`
  beginnt die Messung neu.
- Rest, offen: Bildaufrufe über dasselbe Modell (`describeImage`) fließen weiter ein; die Paarung
  eines kurzen Aufrufs mit der Größe eines langen davor ist nicht verhindert, nur durch die
  Mediane entschärft.

### F05 — [ADRESSIERT]
- Die Karte verspricht nicht mehr „das reicht“: je Programm „bis … GB“, darunter „Auswahl: bis zu
  X GB bei Y GB Lücke. Ob es reicht, zeigt die Messung nach dem Beenden.“ und ein Satz, warum die
  Größe eine Obergrenze ist.
- Für das geladene Modell zählt nur noch Ollamas Angabe aus `/api/ps`, keine Prozessgröße aus
  `top` (`readMemoryPicture`).

### F06 — [ADRESSIERT]
- `reliefPlan.impossible`: `'memory'`, wenn für System und Programme unter 2 GiB blieben, `'gpu'`,
  wenn Modell plus Fenster über der Grenze der Grafikeinheit liegen. Dann keine Schließvorschläge
  und ein eigener Satz statt eines negativen Budgets. In der Dev-App gesehen: 131 072 und 262 144
  Token → „Passt auf diesem Rechner nicht … höchstens 24,5 GB“.

### F07 — [OFFEN] (zurückgestellt)
Unverändert bis auf die Messung (siehe F04: kein Wertepaar bei mehreren geladenen Modellen).
Ein fremdes geladenes Modell zählt weiter als „System und Programme“.

### F08 — [ADRESSIERT]
- Grenze der Grafikeinheit aus dem Ollama-Log (`gpuLimitFromLog`, hier 24,5 GiB) als harte Grenze;
  „passt knapp“ unter 1 GiB Rest (`tight`) mit dem Hinweis, dass macOS vorher auslagert.
- „mindestens rund“ ist weg; die Vorausrechnung heißt „Nach Ollamas Vorausrechnung … rund“, und
  die Quellenzeile sagt, dass sie bei einem nachgemessenen Modell mehr als doppelt zu hoch lag.
- Der Satz „Belegt wird der Speicher erst, wenn sich das Fenster füllt“ (`settingOver`) ist
  entfernt; der Widerspruch zur GGUF-Zeile entfällt damit.
- „selbst gemessen“ nennt jetzt Zahl der Wertepaare und den größten gemessenen Füllstand und
  sagt, dass größere Fenster hochgerechnet sind.
- Nicht belegt: was jenseits der 24,5 GiB wirklich passiert (Fehler oder nur langsam). Der Text
  sagt deshalb „kann laut Ollama höchstens … belegen“ und nicht, was dann geschieht.

### F09 — [ADRESSIERT] bis auf einen Rest
- Das Modell aus dem Tab bleibt erhalten (kommt in die Auswahl der Karte), und das Menü übergibt
  sein Fenster mit (`openMemoryPictureFor(model, shown, targetTokens)`).
- Die Warnfarbe hängt am Plan, nicht an der abgerundeten Token-Zahl.
- Während der Messung steht die Karte mit „Wird gemessen …“; bei einem Modell ohne Speicherbild
  bleibt die Auswahl sichtbar.
- Rest, offen: Wer die Karte ohne das Menü öffnet, bekommt beim Agent-Modell den eingestellten
  Wert, nicht den auf das Modellmaximum begrenzten.

### F10 — [OFFEN] für `memory-projections.json`, für `model-memory.json` miterledigt
`modelMemory.ts`: eine gemeinsame Ladung, Schreiben über Temp-Datei und `rename`, strenge Prüfung
beim Lesen (`parseModelMemoryStore`, getestet). `memory-projections.json` ist unverändert.

### F11 — [OFFEN] (zurückgestellt)

### F12 — [OFFEN] bis auf den Text
Die Quellenzeile für GGUF nennt jetzt, dass die Schätzung Sonderbauarten und mehrere gleichzeitige
Anfragen nicht kennt. Die Formel ist unverändert.

### F13 — [ADRESSIERT]
- Fehlschläge werden nicht mehr gemerkt; laufende Messungen je Modell werden geteilt (`inFlight`).
- Verspätete Antworten überschreiben nichts mehr (Anfragezähler in der Karte, Modellvergleich im
  Menü), nach dem Schließen laufen keine Nachmessungen mehr an.
- `top` bekommt 8 s; antwortet es nicht, steht in der Karte, dass die Größen unvollständig sind.

### F14 — [OFFEN] bis auf Tests und Text
- Tests: `memoryRelief.test.ts` (nicht angeboten → nichts; kein echtes Bündel → nichts; Abbruch →
  kein Befehl; festes Skript, Pfad als Argument, einmal je Ziel; läuft weiter → nicht beendet;
  von Hand gestartet → nicht doppelt geöffnet) und `modelMemory.test.ts`. Der Prozessstarter ist
  ersetzbar (`setReliefRunnerForTests`); im Testlauf ohne Ersatz wirft der Code, statt zu starten.
- Dialog und Karte sagen jetzt „solange MindGraph geöffnet bleibt“. Die Liste selbst bleibt
  flüchtig. `main/noteAgent/memoryPicture.ts` hat weiter keinen Test.

### F15 — [OFFEN] bis auf drei Punkte
Erledigt: toter `appsGain`-Zweig samt Texten entfernt, `.claude/rules/note-agent.md` auf dem Stand,
`ownAppName` gibt es nur noch einmal (`ownBundlePath`). Offen: zwei Darstellungen des Balkens,
`style={{ width }}` für die Abschnittsbreite, Beschriftung „GB“ für binäre Werte, `run()` doppelt.

### Runde 2 — Antworten (25.11.2026)

Eigene Messungen vor der Umsetzung: `fitModelMemory` mit agys Rauschbeispiel lieferte 26 KB je Token
als „gemessen“; mit einem Ausreißer bei 100 000 Token `maxTokens: 100000`; `reliefPlan` für ein
ungemessenes, nicht geladenes Modell bei 32 768 Token `impossible: 'gpu'` mit 26,5 GB. Alle drei
bestätigt. Nicht bestätigt: die 665 `gpu memory`-Zeilen des Tages nennen durchweg 24,5 GiB, und
Ollama meldet MLX-Modelle als `safetensors`, GGUF als `gguf`.

**F16 [ADRESSIERT]** — Vor „Wieder öffnen“ fragt der Main jetzt selbst nach und nennt Name und Ort
(`memoryRelief.ts`, `reopenAppsAfterRelief(window, en)`); der Diskussionspunkt aus Runde 1 ist damit
zugunsten des Prüfers entschieden. Übersprungene und fehlgeschlagene Starts kommen als `skipped` /
`failed` zurück und stehen in der Karte („Nicht wieder geöffnet: …“). Ein fehlgeschlagener Start
bleibt in der Liste. Nicht gebaut: Prüfsummen über `Info.plist` und Programmdatei — der Dialog
deckt den Fall ab, in dem die Kennung nichts merkt, mit weniger Code.

**F17 [ADRESSIERT, Teil 1 ABGELEHNT: gemessen]** — Teil 2: „geht gar nicht“ gibt es nur noch bei
belastbarer Rechnung (`tokenSource !== 'projection'`, `shared/memoryPicture.ts` `reliefPlan`); mit
Ollamas Vorausrechnung bleibt es bei „es fehlen … GB“ mit Schließvorschlägen. Teil 3: die Kopfzeile
prüft `impossible` vor „Modell passt nicht“. Teil 1 abgelehnt: auf diesem Rechner ist `available`
über 665 Zeilen bei stark wechselnder Belegung konstant 24,5 GiB; der vorgeschlagene Ersatz
`iogpu.wired_limit_mb` steht hier auf 0 und liefert nichts. Was jenseits der Grenze wirklich
passiert, bleibt ungemessen.

**F18 [ADRESSIERT: 1, 4 · OFFEN: 2, 3]** — 1: `measuredModelMemory` prüft gegen `/api/tags`
(`usableModelMemory`): anderer Digest oder GGUF → Eintrag gilt nicht und wird gelöscht; nennt Ollama
das Modell nicht, gilt nichts. 4: Toleranz richtet sich am gemessenen Anstieg aus, der Anstieg muss
die Toleranz ums Doppelte übersteigen; `samples` und `maxTokens` zählen nur passende Paare.
2: der GGUF-Vergleich ist jetzt unabhängig von der Schreibweise; ein Modell ganz ohne Formatangabe
wird weiter gemessen, Bildaufrufe ebenso. 3 (verdecktes Denken bei gestreamten Antworten): nicht
gemessen, nicht angefasst.

**F19 [ADRESSIERT: 1 · OFFEN: 2]** — Angebote werden ergänzt statt ersetzt und gelten fünf Minuten.
War etwas ausgewählt und nichts davon läuft noch oder ist noch angeboten, kommt `stale: true`
zurück; die Karte sagt es und misst neu. Teil 2 (ein fremder Aufrufer schaltet Angebote frei)
bleibt: vor jedem Beenden steht weiter der native Dialog.

**F20 [ADRESSIERT]** — Mit LM Studio, außerhalb von macOS und auf Rechnern ohne Speicherbild
(`reason: 'platform'`) gibt es die Karte nicht mehr, auch nicht mit Modellauswahl. Dreht der Nutzer
am Regler, gilt wieder dessen Wert. Im Zustand „kein Speicherbild“ gibt es „Neu messen“.

**F21 [ADRESSIERT]** — `loadMemoryPicture(model, true)` startet immer eine neue Messung; eine ältere
Antwort überschreibt keine jüngere (`started`). `ContextWindowRow` übernimmt auch einen Fehlschlag.

**F22 [ADRESSIERT, teilweise]** — Die Regeln der Messablage sind als reine Funktionen herausgezogen
und geprüft (`nextModelMemoryEntry`, `usableModelMemory`; fünf Tests statt zwei). `memoryRelief.test.ts`
prüft jetzt Ablehnen und Fehlschlag beim Wiederöffnen, das Ergänzen der Angebote, `stale` und
`bundleIdentity` an echten Testordnern (Symlink, fehlende `Info.plist`, getauschter Ordner).
Offen: `sampleModelMemory`/`persist` mit Netz und Ablage, der Ortszusatz im Dialog bei gleichen
Namen, `ownBundlePath`, `main/noteAgent/memoryPicture.ts`.

**F02 (Nachtrag) [ADRESSIERT]** — Das Skript beendet nur, was läuft (`QUIT_SCRIPT`: `if application
… is running then tell … to quit`). Am Rechner-Programm gemessen: nicht laufend → kein Start;
laufend → beendet.

Belege: `npm run typecheck` grün, `npx electron-vite build` grün, `npm run test` 4 493 bestanden,
1 rot (`shellExecution.test.ts` Umgebungsprobe, einzeln 15 von 15 grün). In der Dev-App gelesen:
`qwen3.8:27b-mlx` „measured“ mit 4 Paaren bis 28 056, `inkling-2-mini` „projection“, `qwen3.5:4b`
„architecture“; Karte bei 65 536 Token „passt rechnerisch“. Nicht geprüft: die beiden nativen
Dialoge (Beenden, Wieder öffnen) per Klick in der App, die Karte unter Windows/Linux.

## Status

Runde 2 beantwortet, 25.11.2026 — Prüfer agy. Runde 1 committet (`763f4d7b`); die Korrekturen der
Runde 2 sind umgesetzt und vom Nutzer am 25.11.2026 abgenommen. Offen: F07, F10
(Vorausrechnungs-Ablage), F11, F12 (Formel), F14 (Ablage der beendeten Programme, Test für
`memoryPicture.ts` im Main), F15 (Balken-Darstellung, Einheiten), F17 Teil 1 (abgelehnt, Verhalten
jenseits der Grenze ungemessen), F18 Teile 2 und 3, F19 Teil 2, Reste aus F04, F09 und F22.
