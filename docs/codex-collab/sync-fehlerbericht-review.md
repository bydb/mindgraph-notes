# Sync: Fehlerbericht, Protokolldatei, Passphrase-Speicherung — Prüfung

## Aufgabe

Adversariale Prüfung der **uncommitteten** Änderungen am Sync-Modul. Keine Code-Edits,
keine Commits, keine Pushes — nur Findings in den Abschnitt „Codex-Findings" dieser Datei.

**Anlass (real, 09/2026):** Auf einem neu aufgesetzten Arch-Linux-Rechner (Omarchy/Hyprland)
scheiterten beim Erstabgleich eines 7400-Dateien-Vaults rund 200 Downloads. Sichtbar war
davon genau EINE Datei — die Meldung nannte `failures[0]` und dahinter „…". Welche Dateien
fehlten, war nirgends abrufbar: das Protokoll lag nur im Arbeitsspeicher des Renderers,
gedeckelt auf 200 Einträge, und überschrieb sich bei 200 Fehlschlägen selbst. Zusätzlich
stand der Sync auf diesem Rechner dauerhaft still, weil `safeStorage.isEncryptionAvailable()`
unter Hyprland `false` liefert (Chromium wählt bei unbekanntem `XDG_CURRENT_DESKTOP` den
Speicher `basic_text`) — die Passphrase wurde nie abgelegt, und der Renderer hat den
Rückgabewert von `syncSavePassphrase` weggeworfen.

Drei Änderungen sollen das beheben:
1. Passphrase-Speicherung scheitert nicht mehr still (Grund statt `false`, sichtbar in der UI).
2. Die Fehlermeldung nennt drei Pfade plus Rest, die vollständige Liste geht als
   `failures` an die Oberfläche.
3. Das Protokoll wird zusätzlich nach `<vault>/.mindgraph/sync-log.txt` geschrieben.

## Vier Punkte, die ausdrücklich geprüft werden sollen

Das sind Entscheidungen, die ich getroffen, aber **nicht gemessen** habe. Ich suche
Gegenargumente, keine Bestätigung.

1. **Ein `appendFile` pro Protokollzeile** (`app/src/main/sync/syncEngine.ts:174`).
   Ein Voll-Sync über 7400 Dateien erzeugt grob 14 000 Protokollzeilen, jede mit eigenem
   Öffnen/Schreiben/Schließen. Ich halte das für vertretbar, weil es serialisiert neben dem
   Hauptpfad läuft und niemand darauf wartet. Stimmt das unter Last? Wie verhält es sich,
   wenn der Vault auf einem langsamen oder gemounteten Dateisystem liegt (SMB, externe
   Platte)? Gibt es einen Pfad, auf dem die Warteschlange den Sync doch ausbremst oder
   Speicher aufbaut, weil sie schneller wächst als sie abgearbeitet wird?

2. **`logWriteChain` als wachsende Promise-Kette** (`app/src/main/sync/syncEngine.ts:112`,
   Verkettung in `:178`). Ich sehe kein Leck — jedes Glied löst sich auf, die Referenz
   zeigt immer nur auf das letzte. Aber das ist eine Behauptung, keine Messung. Kann eine
   lange Kette Haltepunkte aufbauen (Closures über `entry`/`ziel`)? Verhält sich das anders,
   wenn ein Glied sehr lange hängt (blockierender Mount)?

3. **Verwerfen der Protokollzeilen nach `disconnect()`**
   (`app/src/main/sync/syncEngine.ts:178`, Prüfung auf `this.destroyed` INNERHALB des
   verketteten Rückrufs). Begründung: Die Datei hat die SAFETY-Regel „nach dem Trennen keine
   Dateioperation"; eine verspätete Zeile legte sonst Ordner in einem Vault an, den die App
   gerade losgelassen hat (im Testlauf real aufgetreten: `ENOTEMPTY` beim Aufräumen).
   Preis: Die letzten Zeilen eines Laufs gehen verloren, wenn jemand währenddessen den Vault
   wechselt — ausgerechnet die Zeilen, die erklären würden, warum der Lauf endete.
   Ist die Abwägung richtig? Gibt es einen Weg, beides zu haben, ohne `disconnect()`
   asynchron zu machen (es gibt `void` zurück)?

4. **Geänderter IPC-Vertrag** — `syncSavePassphrase` und `syncRestore` geben statt `boolean`
   jetzt Objekte zurück (`app/src/shared/types.ts:1204`, `:1206`; Implementierung
   `app/src/main/index.ts:10323` und `:10386`). Ich habe alle Aufrufer gesucht und nur
   `syncStore.ts` gefunden, `tsc --noEmit` ist sauber. Stimmt das? Gibt es Aufrufer, die
   `tsc` nicht sieht — Plugins, dynamische Zugriffe über `window.electronAPI[...]`,
   Tests, die den alten Vertrag nachbauen? Und: Ist `restored: false` an jeder Stelle
   gleichwertig zum alten `false` behandelt, oder kippt irgendwo die Wahrheitsprüfung
   (ein Objekt ist immer truthy)?

## Kontext/Anker

Stand: uncommittet auf `master`. `git diff --stat` zeigt 7 geänderte Dateien, dazu zwei neue
(`app/src/main/sync/syncEngineFailureReport.test.ts`, `app/src/main/sync/testRelay.ts`).

**Hauptpfade**

- `app/src/main/sync/syncEngine.ts:44` — `SYNC_LOG_REL_PATH`, `SYNC_LOG_MAX_BYTES`,
  `SYNC_LOG_ROTATE_CHECK_EVERY`
- `app/src/main/sync/syncEngine.ts:157` — `sendLog` ruft jetzt `appendToLogFile`
- `app/src/main/sync/syncEngine.ts:165` — `logFilePath()` (leer ohne Vault)
- `app/src/main/sync/syncEngine.ts:174` — `appendToLogFile` (fire-and-forget, serialisiert)
- `app/src/main/sync/syncEngine.ts:200` — `flushLog()` (nur von Tests genutzt)
- `app/src/main/sync/syncEngine.ts:205` — `rotateLogFile` (eine Vorgängerdatei, Prüfung
  nur jede 500. Zeile)
- `app/src/main/sync/syncEngine.ts:1076` — Aufbau der Kurzmeldung (`benenne`), `failures`,
  `logFile` im `SyncResult`
- `app/src/main/index.ts:10179` — `secretStorageBackend()` (nur Linux)
- `app/src/main/index.ts:10323` — `sync-save-passphrase` gibt `SecretStorageResult`
- `app/src/main/index.ts:10386` — `sync-restore` gibt `SyncRestoreResult`
- `app/src/shared/types.ts` — `SyncFailure`, `SecretStorageProblem`, `SecretStorageResult`,
  `SyncRestoreResult`, erweitertes `SyncResult`
- `app/src/renderer/stores/syncStore.ts:270` — Auto-Wiederherstellung wertet Grund aus
- `app/src/renderer/stores/syncStore.ts:297` / `:323` — `initSync` / `joinSync` prüfen
  den Rückgabewert
- `app/src/renderer/stores/syncStore.ts:347` — `restoreSync`
- `app/src/renderer/components/Settings/SyncSettingsTab.tsx` — Warnhinweis und Aufklapper
  mit der vollständigen Fehlerliste

**Was ich selbst schon geprüft habe** (bitte gegenprüfen, nicht wiederholen):

- Der Vault-Watcher ignoriert jeden Pfadteil mit führendem Punkt
  (`app/src/main/index.ts:6946`, `ignored: /(^|[\/\\])\../`), also auch `.mindgraph/`.
  Die Protokollzeilen lösen daher weder `file-changed` noch `pushFile` aus — kein
  Schreib-Watcher-Reload-Kreis.
- `.txt` unter `.mindgraph` ist nicht syncbar (`fileTracker.ts` `shouldInclude` lässt dort
  nur `.json` durch), das Protokoll bleibt also geräte-lokal. Ein Test hält das fest.
- `npm run typecheck` sauber, `npm run test` 2251 grün / 1 übersprungen, `npm run build` durch.

**Wo ich besonders Löcher vermute** (nicht darauf beschränken):

- Rotation: Die Größe wird nur jede 500. Zeile geprüft und `logLinesSinceRotateCheck` wird
  nie zurückgesetzt. Kann die Datei über die 2-MB-Grenze hinauswachsen, und ist
  `fs.rename` auf eine Datei, in die gerade angehängt wird, überall unkritisch?
- `logFilePath()` ist öffentlich, aber der Rückgabewert landet über `SyncResult.logFile`
  im Renderer: ein absoluter Pfad des Nutzers geht damit in den Renderer-Zustand. Ist das
  ein Problem (Anzeige, Weitergabe), und stimmt es mit der Fehlermeldung überein, die den
  vault-RELATIVEN Pfad nennt?
- `secretStorageIssue` im Store wird nur an wenigen Stellen zurückgesetzt. Kann ein
  veralteter Hinweis stehen bleiben, nachdem das Problem behoben ist?
- Der neue Testhelfer `testRelay.ts` liegt in `app/src/main/sync/` und ist damit
  produktionsnah. Kann er in ein Bündel geraten?

## Codex-Findings

### F01 — Hängender Log-Schreibzug hält eine unbegrenzte Promise-Kette fest
Schwere: hoch
Stelle: app/src/main/sync/syncEngine.ts:174
Status: [OFFEN]
`sendLog` reiht jede Zeile ohne Rückdruck ein (`syncEngine.ts:157-162`); jedes Glied schließt dabei `ziel` und `zeile` ein (`:174-190`). Solange die Kette vorankommt, können erledigte Glieder freigegeben werden. Hängt aber schon ein `mkdir`, `stat`, `rename` oder `appendFile` auf einem blockierten Mount (`:185-189`, `:205-212`), bleiben alle später angehängten Reaktionen samt ihrer Strings über die noch nicht erfüllte Kette erreichbar. Die einzelne Referenz auf das letzte Promise verhindert das nicht: Dieses Promise hängt transitiv von allen Vorgängern ab. Ein Voll-Sync kann deshalb schneller Tausende Einträge und Dateisystemoperationen produzieren, als der Mount sie abbaut; es gibt weder Queue-Limit noch Zusammenfassung oder Abbruchsignal. Der Sync wartet zwar nicht direkt auf die Datei, konkurriert aber weiter mit ihr um Dateisystem-/Mount-Ressourcen.
Vorschlag: Zeilen in einem begrenzten Puffer sammeln und in Blöcken schreiben; bei Erreichen des Limits eine explizite „N Zeilen verworfen“-Zeile reservieren. Schreiboperationen zusätzlich mit abbrechbarem Timeout behandeln.

### F02 — `disconnect()` garantiert weder „keine Dateioperation danach“ noch einen vollständigen Log-Tail
Schwere: hoch
Stelle: app/src/main/sync/syncEngine.ts:179
Status: [OFFEN]
Die `destroyed`-Prüfung erfolgt nur einmal vor dem ersten `await` (`syncEngine.ts:179-185`). Wird danach `disconnect()` aufgerufen (`:1905-1921`), kann das bereits laufende Glied nach `mkdir` trotzdem noch rotieren und anhängen (`:185-189`). Die im Kommentar und in der Konsolenmeldung behauptete SAFETY-Eigenschaft ist damit für laufende Arbeit falsch. Umgekehrt verwerfen alle noch nicht gestarteten Glieder nach dem Trennen ihre Zeilen (`:179-184`), obwohl Produktionsergebnisse sofort nach `sendLog` zurückgegeben werden (`:1120-1134`) und nur der Test ausdrücklich `flushLog()` aufruft (`syncEngineFailureReport.test.ts:91-101`). Die Oberfläche verspricht dennoch, jede Fehlerzeile stehe auf der Platte (`renderer/utils/i18n/settingsPages.ts:77-78`). So fehlen beim Vault-Wechsel/App-Ende gerade die letzten Diagnosezeilen, während eine schon begonnene Zeile den losgelassenen Vault weiterhin berühren kann.
Vorschlag: Entweder `disconnect()`/Engine-Wechsel um einen begrenzten, expliziten Flush ergänzen oder einen pro Prozess verwalteten Batch-Logger verwenden, dessen Ziel nicht mit der Engine-Lebensdauer freigegeben wird. Mit dem jetzigen fire-and-forget-Vertrag lassen sich beide Garantien nicht gleichzeitig geben.

### F03 — Rotation ist keine 2-MB-Grenze und widerspricht der „vollständigen Liste“
Schwere: mittel
Stelle: app/src/main/sync/syncEngine.ts:186
Status: [OFFEN]
Die Größe wird nur vor jeder 500. eingereihten Zeile geprüft (`syncEngine.ts:186-188`); bis zur nächsten Prüfung kann die Datei um 499 beliebig lange Meldungen über 2 MB hinauswachsen. Ab der Rotation steht der frühere Teil nur noch in `sync-log.txt.1`, während Ergebnis und UI ausschließlich `sync-log.txt` ausweisen (`:1098-1108`, `renderer/components/Settings/SyncSettingsTab.tsx:213-215`). Bei der nächsten Rotation überschreibt/ersetzt derselbe feste Vorgängerpfad erneut den vorherigen Stand; außerdem wird ein fehlgeschlagenes `rename` vollständig verschluckt und danach weiter an die zu große Datei angehängt (`syncEngine.ts:205-212`). Damit ist weder die Grenze hart noch die beworbene vollständige Liste zuverlässig unter dem angezeigten Pfad vorhanden (`renderer/utils/i18n/settingsPages.ts:77-78`). Das nie zurückgesetzte Modulo-Zählwerk ist für sich genommen dagegen kein Fehler: Es löst weiterhin alle 500 Zeilen aus.
Vorschlag: Rotation als bewusst dokumentiertes Zweidateien-Protokoll in der UI nennen und beide Pfade anbieten; Zeilengröße begrenzen und einen Rename-Fehler zumindest sichtbar machen.

### F04 — Fehlerliste, Logpfad und Speicherwarnung laufen beim Vault-Wechsel in den nächsten Vault über
Schwere: mittel
Stelle: app/src/renderer/stores/syncStore.ts:252
Status: [OFFEN]
Zustand wird beim Vault-Wechsel nur partiell überschrieben (`syncStore.ts:252-258`). `syncFailures`, `syncLogFile`, `syncLog` und `secretStorageIssue` bleiben deshalb vom vorherigen Vault erhalten; auch der Sicherheits-Abzweig setzt nur die alten Basisfelder zurück (`:239-248`). Bei einem Vault ohne aktivierten Sync wird keine Wiederherstellung gestartet, die das korrigieren könnte (`:260-266`), der Speicherhinweis wird aber selbst im deaktivierten Zustand gerendert (`SyncSettingsTab.tsx:104-109`). Bei einem anderen aktivierten Vault können bis zum Ergebnis der asynchronen Wiederherstellung zusätzlich die alte Fehlerliste und der absolute Pfad des vorherigen Vaults erscheinen (`SyncSettingsTab.tsx:188-215`). Nutzer können so Fehler und lokale Pfade dem falschen Vault zuordnen.
Vorschlag: Sämtliche transienten Felder atomar beim Wechsel zurücksetzen und erst Ergebnisse anwenden, deren Vault-Identität noch stimmt.

### F05 — Linux-Backend-Hinweis diagnostiziert auch Netzwerk- und Schreibfehler als Schlüsselbundproblem
Schwere: mittel
Stelle: app/src/renderer/components/Settings/SyncSettingsTab.tsx:72
Status: [OFFEN]
Sobald irgendein Backend-Name vorhanden ist, hängt die UI denselben Schlüsselbund-/Startparameter-Rat an jeden Problemtyp an (`SyncSettingsTab.tsx:72-81`). Der Main-Prozess liefert `backend` aber auch bei fehlender Datei und bei jedem beliebigen Fehler aus `join`, `connect` oder der Vault-Prüfung (`main/index.ts:10386-10423`). Damit empfiehlt etwa ein `join-failed` wegen nicht erreichbarem Relay zusätzlich `--password-store=gnome-libsecret`, obwohl der eigene Grundtext korrekt Netzwerk und Relay-Adresse nennt (`renderer/utils/i18n/settingsPages.ts:70-73`). Zudem löscht ein später erfolgreicher manueller Sync die Warnung nicht (`syncStore.ts:378-385`); bei einem vorübergehenden `join-failed` kann sie daher nach Wiederherstellung weiterstehen.
Vorschlag: Backend-Hilfe nur für `no-encryption` anzeigen; `join-failed` getrennt behandeln und nach nachgewiesen erfolgreicher Verbindung zurücksetzen.

### F06 — Ein globaler Passphrase-Slot kann den falschen Vault mit dem falschen Schlüssel starten
Schwere: hoch
Stelle: app/src/main/index.ts:10164
Status: [OFFEN]
Die Renderer-Konfiguration ist pro Vault gespeichert (`renderer/stores/syncStore.ts:59-60`), die verschlüsselte Passphrase dagegen immer in genau derselben globalen Datei (`main/index.ts:10164-10166`, Schreiben `:10334-10336`). Das Einrichten eines zweiten Vaults überschreibt somit den Schlüssel des ersten. Beim späteren Auto-Restore liest der Main-Prozess diese globale Datei, unabhängig vom angeforderten `vaultPath`/`vaultId`, und startet die Engine damit (`:10395-10417`). `join()` leitet daraus ohne Validierung den Dateischlüssel ab (`main/sync/syncEngine.ts:260-293`); der Relay-Handshake registriert nur die Vault-ID und prüft den Schlüssel nicht (`:327-347`). Beim nächsten Auto-Sync kann die Engine daher Dateien eines Vaults mit der Passphrase eines anderen ver- bzw. zu entschlüsseln versuchen. Derselbe Pfad entsteht nach `write-failed`: Der Fehler lässt eine eventuell vorhandene alte Credentials-Datei unangetastet (`main/index.ts:10334-10339`), während der Renderer die neue vault-spezifische Konfiguration trotzdem als aktiviert persistiert (`renderer/stores/syncStore.ts:299-309`, `:325-335`). Die neue sichtbare Warnung verhindert diesen automatischen Fehlstart nach einem Neustart nicht.
Vorschlag: Credentials pro Vault-ID speichern und vor Auto-Sync einen mit dem Schlüssel authentifizierten Vault-Marker prüfen. Nach einem fehlgeschlagenen Speichern darf eine alte Passphrase nicht als Credential der neuen Konfiguration gelten.

### F07 — Der Test-Relay bindet unnötig extern und sein Start-Promise hat keinen Fehlerpfad
Schwere: niedrig
Stelle: app/src/main/sync/testRelay.ts:45
Status: [OFFEN]
`new WebSocketServer({ port: 0 })` bindet ohne Host-Einschränkung, obwohl die Tests anschließend ausschließlich `127.0.0.1` verwenden (`testRelay.ts:45-54`). Das Start-Promise lauscht nur auf `listening` und kann bei einem Bindefehler weder ablehnen noch sauber aufräumen (`:46-48`). Im eingeschränkten Prüflauf scheiterte das Binden an `0.0.0.0` mit `EPERM`; dadurch lief `beforeEach` nicht zu Ende, während `afterEach` trotzdem auf die noch nicht gesetzten Variablen zugriff (`syncEngineFailureReport.test.ts:34-43`). Das ist kein nachgewiesener Produktfehler, macht die neuen Integrationstests aber unnötig umgebungsabhängig und verschleiert die ursprüngliche Fehlerursache durch Folgefehler.
Vorschlag: Explizit an `127.0.0.1` binden, `error` in dasselbe Promise verdrahten und den Teardown gegen teilweise fehlgeschlagenes Setup absichern.

### Geprüft ohne weiteren Befund

- Der geänderte IPC-Vertrag wird in den auffindbaren Renderer-Aufrufern korrekt über `.saved` beziehungsweise `.restored` ausgewertet (`renderer/stores/syncStore.ts:266-283`, `:297-300`, `:323-326`, `:346-357`); Preload und Typdeklaration stimmen überein (`main/preload.ts:611-615`, `shared/types.ts:1204-1206`). Eine dynamische oder Plugin-Verwendung der beiden Methoden ist im Quellbaum nicht vorhanden.
- `testRelay.ts` ist nur aus den beiden Testdateien importiert (`main/sync/deletionGuard.integration.test.ts:12-18`, `main/sync/syncEngineFailureReport.test.ts:14-18`). Der Produktions-Build hat allein `src/main/index.ts` als Main-Einstieg (`electron.vite.config.ts:13-20`); der Helper ist von dessen Importgraph nicht erreichbar und wird damit nicht ins Produktionsbündel gezogen.
- Der absolute `logFile`-Pfad erweitert die Renderer-Berechtigung hier nicht erkennbar: Die Einstellungsseite besitzt bereits den Vault-Pfad (`renderer/components/Settings/SyncSettingsTab.tsx:26-28`). Der eigentliche Konsistenzfehler ist die Rotation beziehungsweise der vault-übergreifend stehenbleibende Zustand aus F03/F04.

### F08 — Ein blockierter Log-Mount blockiert jetzt den gesamten Electron-Main-Prozess
Schwere: hoch
Stelle: app/src/main/sync/syncEngine.ts:236
Status: [OFFEN]
F01/F02 sind hinsichtlich der Promise-Kette repariert, aber durch eine Verfügbarkeitsregression ersetzt: Der 250-ms-Timer ruft direkt `writeLogBlock()` auf (`app/src/main/sync/syncEngine.ts:202-209`); darin laufen `mkdirSync`, `statSync`, gegebenenfalls `renameSync` und `appendFileSync` auf dem Main-Thread (`:235-268`). Die 250 ms begrenzen nur den Startzeitpunkt, nicht die Dauer eines Systemaufrufs. Bei einem nicht antwortenden SMB-Mount können damit auch unabhängige IPC-Aufrufe, Socket-Ereignisse und Zeitgeber nicht mehr bearbeitet werden. Der Einwand, Downloads hingen auf demselben Mount ohnehin, trägt nicht: Ein ausstehender asynchroner Download lässt den Event-Loop frei; diese synchronen Aufrufe halten ihn an. Auch normales Beenden erzwingt diesen Zugriff über `before-quit → disconnect → writeLogBlock` (`app/src/main/index.ts:14677-14685`, `app/src/main/sync/syncEngine.ts:2002-2007`). Der Preis ist daher nicht garantiert ein „kleines Anhängen“. Gegenprobe mit den unverändert extrahierten Schreibmethoden und einem simulierten 150-ms-Warten in `appendFileSync`: Ein unabhängiger 10-ms-Timer wurde erst nach 155 ms ausgeführt; das ist ein Scheduling-Nachweis, keine SMB-Latenzmessung.
Vorschlag: Begrenzten Puffer behalten, Dateisystemarbeit aus dem Main-Thread auslagern und Abschluss/Abbruch mit einem ausdrücklich begrenzten Wartevertrag lösen; ein Main-Thread-Timer kann einen synchron blockierenden Systemaufruf nicht unterbrechen.

### F09 — Schreibfehler löschen den ganzen Block ohne den zugesagten Verlusthinweis
Schwere: mittel
Stelle: app/src/main/sync/syncEngine.ts:226
Status: [OFFEN]
`take()` leert sowohl Zeilen als auch Verwurfszähler vor dem ersten Dateizugriff (`app/src/main/sync/logBuffer.ts:47-52`, `app/src/main/sync/syncEngine.ts:226`). Schlägt anschließend `mkdirSync` oder `appendFileSync` etwa mit ENOSPC/EACCES fehl, schluckt der Catch den Fehler und bewahrt weder Block noch Verlustzahl auf (`app/src/main/sync/syncEngine.ts:235-241`). Nach Behebung schreibt der nächste Block ohne Kennzeichnung der Lücke weiter; selbst eine bereits erzeugte Überlaufwarnung geht dabei verloren (`:227-233`). Damit bleibt F02 in Bezug auf die vollständige Abschlussdiagnose offen, und die neue Aussage „Musste das Schreiben Zeilen auslassen, steht das dort als eigene Zeile“ ist weiterhin falsch (`app/src/renderer/utils/i18n/settingsPages.ts:78`). Gegenprobe mit den echten extrahierten Methoden: erster Append wirft ENOSPC, zweiter gelingt; danach ist `hasWork=false`, und der zweite Block enthält ausschließlich seine neue Nutzzeile, keinen Verlusthinweis.
Vorschlag: Fehlgeschlagene Blöcke zumindest in einem begrenzten Verlustzähler erfassen und beim nächsten erfolgreichen Schreiben ausweisen; bei dauerhaftem Fehler den Protokollstatus außerhalb dieser Datei sichtbar machen.

### F10 — Fehlgeschlagene Rotation meldet das Problem, begrenzt die Datei aber weiterhin nicht
Schwere: mittel
Stelle: app/src/main/sync/syncEngine.ts:264
Status: [OFFEN]
F03 ist bezüglich des Rename-Fehlerpfads nur teilweise behoben: Ein fehlgeschlagenes `renameSync` erzeugt nun korrekt Text (`app/src/main/sync/syncEngine.ts:264-268`), anschließend hängt der Aufrufer jedoch Hinweis und gesamten Block an dieselbe bereits zu große Datei an (`:237-238`). Ein konkret erreichbarer Fall ist ein schreibbares `sync-log.txt`, während das Verzeichnis keine Umbenennung zulässt oder `sync-log.1.txt` ein Verzeichnis ist. Jeder weitere Block vergrößert dann die Datei; „bis auf einen Block hart“ gilt in diesem Fehlerzustand nicht. Die Gegenprobe mit Größe 2 MiB und simuliertem Rename-EACCES ergab weiterhin erfolgreiches Anhängen oberhalb der Grenze, inklusive Warnung. Außerdem nennt die Kurzmeldung nach wie vor nur `sync-log.txt` als „full list“ (`:1169`), obwohl der frühere Teil rotiert sein kann und beim erneuten Rotieren derselbe Vorgängerpfad ersetzt wird (`:264`). Die zwei Pfade in der Detailansicht reparieren diese Kurzmeldung nicht.
Vorschlag: Bei gescheiterter Rotation eine ausdrücklich begrenzte Ausweichstrategie wählen und den Aufbewahrungsumfang ehrlich benennen; die Kurzmeldung ebenfalls auf beide Dateien bzw. das begrenzte Protokoll verweisen lassen.

### F11 — 2000 Zeilen sind keine Speicher- oder Blockgrößengrenze
Schwere: mittel
Stelle: app/src/main/sync/logBuffer.ts:20
Status: [OFFEN]
Der neue Puffer begrenzt ausschließlich die Anzahl der Strings, nicht deren Länge (`app/src/main/sync/logBuffer.ts:20-25`); die Engine übernimmt die vollständige Meldung und fügt alle Strings zu einem Block zusammen (`app/src/main/sync/syncEngine.ts:204`, `:233`). Unter anderem können Fehlermeldungen aus dem Relay unverändert zu `Error` werden (`:1829`) und über den Upload-Catch in diesen Puffer gelangen (`:837-840`). Somit kann bereits eine kleine Anzahl sehr großer Meldungen einen großen Speicher-/Schreibblock erzeugen; der Deckel von 2000 Einträgen belegt nicht die behauptete begrenzte Speichernutzung. Auch Rotation teilt einen Block über 2 MiB nicht auf: Nach einmaligem Umbenennen wird der gesamte Block geschrieben (`:237-238`, `:260-265`). F01/F03 sind insoweit noch nicht vollständig adressiert.
Vorschlag: Zusätzlich ein Bytebudget pro Zeile und für den gesamten Puffer/Schreibblock durchsetzen, Kürzungen ausdrücklich zählen und kennzeichnen.

### F12 — Auto-Sync verwirft die vollständige Fehlerliste und lässt alte Ergebnisse stehen
Schwere: mittel
Stelle: app/src/main/sync/syncEngine.ts:1962
Status: [OFFEN]
Zusatzbefund am aktuellen Stand, bereits in Runde 1 vorhanden: Der periodische Sync wertet das erfüllte `SyncResult` nicht aus (`app/src/main/sync/syncEngine.ts:1956-1966`), obwohl nur dieses Ergebnis `failures`, `logFile` und `previousLogFile` enthält (`:1171-1179`). Das Fortschrittsereignis sendet im Fehlerfall nur Status und Kurztext (`:1169-1170`). Im Renderer übernimmt ausschließlich `triggerSync()` die vollständige Liste und löscht sie bei Erfolg (`app/src/renderer/stores/syncStore.ts:395-416`); der Fortschrittslistener aktualisiert diese Felder überhaupt nicht (`:520-531`). Konkrete Folge: Scheitern beim Auto-Sync 200 Dateien, erscheint keine neue vollständige Liste; folgt auf einen manuell gescheiterten Lauf ein erfolgreicher Auto-Sync, bleibt dessen alte Liste trotzdem als „Vollständige Liste des letzten Laufs“ stehen (`app/src/renderer/utils/i18n/settingsPages.ts:77`). Der neue Logpfad zur Diagnose fehlt im ersten Fall ebenfalls in der Detailansicht, weil diese eine nichtleere `syncFailures`-Liste voraussetzt (`app/src/renderer/components/Settings/SyncSettingsTab.tsx:205-230`).
Vorschlag: Das abgeschlossene Ergebnis jedes Laufs über einen gemeinsamen, mit Vault-/Laufidentität versehenen Kanal in den Store übernehmen, unabhängig davon, wer den Lauf gestartet hat.

### Runde 2 - geprüft ohne weiteren Befund

- F01: Die unbegrenzt wachsende Promise-Kette ist entfernt und die Zahl gepufferter Einträge wird tatsächlich begrenzt (`app/src/main/sync/logBuffer.ts:20-25`), vorbehaltlich F08/F11.
- F02: Nach Rückkehr aus `disconnect()` ist für den neuen Logger kein nachträglicher Schreibpfad erkennbar, weil er den Timer löscht, den Rest synchron entnimmt und spätere Einreihungen an `logClosed` scheitern (`app/src/main/sync/syncEngine.ts:2002-2007`, `:203`, `:224-226`).
- F03: Bei erfolgreicher Rotation wird jetzt vor jedem Block geprüft und die Detailansicht nennt beide Dateipfade (`app/src/main/sync/syncEngine.ts:237`, `:253-265`; `app/src/renderer/components/Settings/SyncSettingsTab.tsx:218-225`).
- F04: Der neue Leerzustand setzt die vorhandenen transienten Felder in beiden Wechselabzweigen tatsächlich zurück (`app/src/renderer/stores/syncStore.ts:29-37`, `:263-275`).
- F05: Die Teilablehnung trägt, weil ein erfolgreicher Sync keine erfolgreiche Passphrase-Speicherung beweist; die Implementierung entfernt deshalb beim manuellen Erfolg nur `join-failed`, und die Backend-Hilfe ist auf `no-encryption` begrenzt (`app/src/renderer/stores/syncStore.ts:408`; `app/src/renderer/components/Settings/SyncSettingsTab.tsx:83-85`).
- F07: Loopback-Bindung, Ablehnung bei Startfehler und abgesicherter Teardown sind umgesetzt (`app/src/main/sync/testRelay.ts:58-62`; `app/src/main/sync/syncEngineFailureReport.test.ts:41-47`; `app/src/main/sync/deletionGuard.integration.test.ts:38-44`).

Testlauf Runde 2: `cd app && npx vitest run src/main/sync` ergab **102 bestanden, 20 fehlgeschlagen; 7 Testdateien bestanden, 2 fehlgeschlagen** in 2,83 s; sämtliche 20 Fehler stammen aus `listen EPERM: operation not permitted 127.0.0.1`, sodass das Relay auch mit der neuen Bindung hier nicht läuft, nun aber sofort und ohne die alten Teardown-Folgefehler scheitert. Die Integrationsergebnisse sind daher in diesem Sandkasten weiterhin nicht nachgewiesen. Die oben genannten zusätzlichen Gegenproben liefen ohne Netzwerk und ohne Dateischreibzugriffe mit extrahierten Originalmethoden und simulierten Dateisystemantworten. F06 wurde auftragsgemäß nicht erneut geprüft.

## Claude-Antwort

Alle Befunde am echten Code gegengeprüft. **F01–F05 und F07 umgesetzt, F06 offen** (Entscheidung
des Nutzers: eigene Aufgabe). Belege am Ende.

### F01 — [ADRESSIERT]

Nicht gepflastert, sondern der Entwurf ersetzt. Es gibt keine Promise-Kette mehr.

Jetzt: gedeckelter Puffer (`logBuffer.ts`, reine Logik, 2000 Zeilen) plus Schreiben in Blöcken auf
einem 250-ms-Zeitgeber — und zwar **synchron** (`syncEngine.ts:222` `writeLogBlock`). Damit gibt es
weder Rückstau noch festgehaltene Zeichenketten: Der Puffer ist ein Array mit Deckel, und ein
Zeitgeber ist gelaufen oder nicht.

Dein Vorschlag „N Zeilen verworfen reservieren" ist übernommen. Verworfen werden **neue** Zeilen,
nicht alte — kommt das Schreiben nicht nach, erklären die frühen Zeilen den Anfang der Störung.
Die Zahl geht als eigene Zeile in denselben Block (`syncEngine.ts:229`).

Der Einwand „konkurriert um Mount-Ressourcen" trifft jetzt ~100× weniger Schreibvorgänge. Zur
Einordnung, ohne dir zu widersprechen: Blockiert der Mount, hängen auch die Downloads, die in
denselben Vault schreiben — die Protokoll-Warteschlange wäre nicht das, was zuerst bricht.

### F02 — [ADRESSIERT]

Du hast recht, und zwar in beide Richtungen. Der Kommentar behauptete eine Eigenschaft, die der
Code nicht hatte.

Beides ist aufgelöst, weil das Schreiben synchron ist: Nach `disconnect()` ist nichts mehr
unterwegs, das noch schreiben könnte. `disconnect()` setzt `logClosed`, löscht den Zeitgeber und
schreibt den Rest selbst hinaus (`syncEngine.ts:2002`). Die letzten Diagnosezeilen gehen damit
nicht mehr verloren — der Preis ist ein einzelnes kleines Anhängen beim Trennen.

Der falsche Kommentar ist weg. Der UI-Satz „Jede Zeile steht auch im Protokoll auf der Platte"
ebenfalls; er lautet jetzt „Protokoll auf der Platte: {path}. Musste das Schreiben Zeilen
auslassen, steht das dort als eigene Zeile."

### F03 — [ADRESSIERT]

- Die Größe wird **vor jedem Block** geprüft, nicht jede 500. Zeile (`syncEngine.ts:253`
  `rotateLogFileIfNeeded`). Die Grenze ist damit bis auf einen Block hart.
- Ein fehlgeschlagenes Umbenennen wird nicht mehr verschluckt: Es erzeugt eine Hinweiszeile mit
  Grund, die dem nächsten Block vorangestellt wird (`syncEngine.ts:268`).
- Beide Pfade stehen in der Oberfläche. Die Vorgängerdatei heißt jetzt `sync-log.1.txt` statt
  `sync-log.txt.1` und wird über `SyncResult.previousLogFile` mitgeliefert.

Deine Korrektur zum Modulo-Zählwerk ist richtig und angenommen — das war kein Fehler, meine
Vermutung dazu war falsch. Das Zählwerk gibt es jetzt ohnehin nicht mehr.

### F04 — [ADRESSIERT]

`TRANSIENTER_LEERSTAND` in `syncStore.ts:29` setzt beim Vault-Wechsel alle transienten Felder
atomar zurück — auch den Sicherheits-Abzweig. Eingeschlossen ist `syncLog`, das dieses Leck schon
vor meiner Änderung hatte.

### F05 — [ADRESSIERT, Vorschlag zur Hälfte ABGELEHNT]

Der Kern stimmt: Der Schlüsselbund-Rat hing an jedem Problemtyp. Er erscheint jetzt nur noch bei
`no-encryption` (`SyncSettingsTab.tsx:83`).

**Abgelehnt: die Warnung nach jedem erfolgreichen Sync zurückzusetzen.** Bei `join-failed` ist das
richtig und umgesetzt (`syncStore.ts:408`). Bei `no-encryption` wäre es falsch: Dort läuft der Sync
in dieser Sitzung sehr wohl, die Passphrase ist nur nicht abgelegt — die Warnung muss bis zur
Behebung stehen bleiben. Sie nach einem geglückten Lauf zu löschen, baute genau die stille Falle
neu, gegen die diese ganze Änderung antritt.

### F06 — [OFFEN]

Am Code bestätigt: `getSyncCredentialsPath()` (`index.ts:10164`) ist global, die Konfiguration pro
Vault. Der Befund trägt, auch der Nachsatz zu `write-failed`.

Er ist aber **vollständig vorbestehend** und von diesen drei Änderungen nicht berührt — und die
Reparatur braucht einen Migrationsweg für alle, die heute die globale Datei haben. Der Nutzer hat
entschieden: eigene Aufgabe, nicht in einer Änderung, die Fehlermeldungen verbessert.

### F07 — [ADRESSIERT]

`testRelay.ts:58` bindet an `127.0.0.1`, der `error`-Fall ist ins selbe Versprechen verdrahtet, und
die Teardowns beider Testdateien vertragen ein halb gescheitertes Setup.

### Was sich an den Tests geändert hat

Mein erster Überlauftest lief über den echten Sync und hing damit an einer Zeitschranke: Leert der
250-ms-Zeitgeber den Puffer mitten im Lauf, läuft er nie über. Unter Volllast ist er durchgefallen.
Statt die Schranke zu verstellen, ist die Pufferlogik jetzt rein (`logBuffer.ts`) und in
`logBuffer.test.ts` deterministisch geprüft (5 Tests). Der Integrationstest prüft dafür neu, dass
`disconnect()` den Rest hinausschreibt und dass beide Protokollpfade gemeldet werden.

### Belege

`npm run typecheck` sauber · `npm run test` **2258 grün / 1 übersprungen, 178 Dateien** ·
`npm run build` durch. Die Protokolllogik liegt im gebauten Bündel
(`out/main/chunks/syncEngine-*.js` enthält `sync-log.txt`, `sync-log.1.txt` und die
Verwurfs-Zeile); `FakeRelay` kommt in `out/` nirgends vor — deine Einschätzung dazu ist gemessen
bestätigt.

Ein Hinweis zu deinem Lauf: Der fehlgeschlagene Test in deiner Umgebung war F07 selbst. Die Tests
liefen bei dir also nicht — dein Urteil steht auf Lesen, die grünen Zahlen oben sind meine Messung.


### Runde 2 — Antwort auf F08–F12

Alle fünf am Code gegengeprüft, alle tragen. Der Nutzer hat alle fünf freigegeben, F08 in der
Variante „App läuft weiter". Anker diesmal vor dem Schreiben per `grep` geprüft — in Runde 1 lagen
neun daneben, weil ich sie geschätzt hatte.

### F08 — [ADRESSIERT]

Du hast recht, und mein Einwand aus Runde 1 war falsch: Ein hängender asynchroner Download lässt
die Ereignisschleife frei, ein `appendFileSync` nicht. Ich hatte einen Rückstau gegen eine
eingefrorene App getauscht.

Dritter Entwurf: gedeckelter Puffer **und** asynchrones Schreiben, höchstens EIN Vorgang
gleichzeitig (`syncEngine.ts:236` `writeLogBlock`, Einzelflug über `logWriting`; Anstoß über
`scheduleLogWrite` `:218`). Kein `fsSync` mehr in der Datei.

Den Preis nenne ich diesmal ausdrücklich, statt ihn wegzubehaupten: Nach `disconnect()` kann EIN
letzter Block noch landen (`syncEngine.ts:2068`). Er enthält nur Zeilen von vor dem Trennen und
geht nur ins Protokoll dieses Vaults. „Blockiert nie", „verliert den Schluss nicht" und „nach dem
Trennen kein Schreibvorgang" sind zu dritt nicht zu haben, solange `disconnect()` synchron ist —
aufgegeben ist das dritte. Steht so im Kommentar über `SYNC_LOG_FLUSH_DELAY_MS`.

### F09 — [ADRESSIERT]

Ein gescheiterter Block wird nicht mehr verschluckt: `noteLost` (`logBuffer.ts:57`, Aufruf
`syncEngine.ts:263`) zählt seine Zeilen zu den fehlenden, und das nächste geglückte Schreiben weist
die Zahl aus. Die Überlaufmarke eines gescheiterten Blocks wird dabei nicht doppelt gezählt.

Nach einem Fehler wird NICHT sofort erneut geschrieben (`syncEngine.ts:270` nur nach Erfolg) — bei
vollem Datenträger wäre das eine Endlosschleife. Die nächste Protokollzeile stößt es wieder an.

Test ohne Attrappe: am Protokollpfad liegt ein Ordner (`EISDIR`), danach wird er entfernt.

### F10 — [ADRESSIERT]

Scheitert das Umbenennen, wird **neu begonnen** statt angehängt (`syncEngine.ts:255`,
`rotateLogFileIfNeeded` `:287`). Die Datei ist damit auch im Fehlerzustand begrenzt; der ältere
Inhalt geht verloren, und die Hinweiszeile sagt das samt Grund. Die Kurzmeldung nennt beide
Dateien (`syncEngine.ts:1227`).

Zwei Tests mit echtem Dateisystem: geglückte Rotation bei 2 MiB, und gescheiterte Rotation mit
einem nicht leeren Ordner am Vorgängerpfad.

### F11 — [ADRESSIERT]

Drei Deckel statt einem (`logBuffer.ts:23`, `push` `:37`; Werte `syncEngine.ts:76`): 2000 Zeilen,
2000 Zeichen je Zeile (Kürzung gekennzeichnet), 1 MB insgesamt — gerechnet in Bytes, nicht Zeichen.
`maxBytes` liegt bewusst unter der Rotationsgrenze: Ein Block passt nach einer Rotation immer in
die frische Datei, damit ist auch dein Einwand „Rotation teilt einen Block über 2 MiB nicht auf"
erledigt. Zeilenumbrüche in Meldungen werden ersetzt, ein Eintrag bleibt eine Zeile.

### F12 — [ADRESSIERT]

Für mich der wichtigste Befund der Runde — er traf Reparatur Nr. 2 im Kern, und er stand seit
Runde 1 im Code.

`SyncProgress` trägt jetzt die Abschlussdaten (`types.ts:185`); `sendProgress` hängt bei JEDEM
Fehlerabschluss Vault und Protokollpfade an (`syncEngine.ts:339`), der Teilfehler-Abschluss schickt
die Liste mit (`:1230`). Der Store übernimmt sie im Fortschritts-Listener, unabhängig vom Aufrufer,
verwirft Daten eines fremden Vaults und räumt die Liste bei `done` ab (`syncStore.ts:524`). Der
Protokollpfad in der Oberfläche hängt jetzt am Fehler, nicht an der Dateiliste
(`SyncSettingsTab.tsx:223`).

### Belege Runde 2

`npm run typecheck` sauber · `npm run build` durch · `npm run test` zweimal: **2268 grün /
1 übersprungen, 178 Dateien**.

Gegenprobe der neuen Tests: drei Reparaturen ausgebaut (F09 `noteLost`, F10 Neubeginn, F12 Liste im
Kanal) — genau die drei zugehörigen Tests wurden rot, alle anderen blieben grün. Danach Original
wiederhergestellt.

Ein Test außerhalb dieses Auftrags wackelt unter Volllast: `noteAgent/shellExecution.test.ts`
„Umgebungsprobe" (im ersten der beiden Läufe rot, im zweiten grün, allein ausgeführt immer grün).
Er startet echte Interpreter mit Zeitgrenze und ist damit lastempfindlich — vorbestehend, nicht
angefasst.

Zu deinem Testlauf: Dein Sandkasten verbietet auch `listen` auf `127.0.0.1`. Die Integrationstests
bleiben bei dir unbelegt; sie scheitern jetzt aber sofort und mit der eigentlichen Ursache.

### Nachtrag — Sichtprüfung in der laufenden App (nach Runde 2, von Codex NICHT gesehen)

Dev-App gegen isoliertes Profil und Modelltest-Vault, Zustand des Anlassfalls per CDP in den Store
gesetzt (200 Fehlschläge, `no-encryption` mit `basic_text`). Geprüft sind damit Optik und Wortlaut,
nicht der Datenfluss. Vier Korrekturen:

1. **Dateiname fehlte in der Fehlerliste.** Ein langer Grund drückte `.sui-list-main` auf null
   Breite — ausgerechnet bei den Einträgen mit der ausführlichsten Meldung stand keine Datei da.
   Jetzt zweizeilig (`.sui-list-stack` in `SettingsUI.css`): Pfad oben, Grund darunter, voller
   Pfad als `title`. Nachgemessen: 510 px statt 0.
2. **Der Startschalter brach hinter `--` um.** Steht jetzt als eigene, kopierbare `<code>`-Zeile.
3. Überschrift des Speicherhinweises lief ohne Trennung in den Text — eigene Zeile.
4. Deutsches „und N weitere" in der englischen Kurzmeldung — jetzt „and N more", Test angepasst.

### Nachtrag 22.09.2026 — Ursache der Fehlschläge gefunden: die App kappt sich selbst

Gegenprobe mit frischem Vault auf dem Linux-Rechner: wieder 194 gescheiterte Downloads. Das
Sync-Protokoll (Foto) zeigt die Kette:

```
10:12:40  Conflict: .mindgraph/email-store.json
10:12:44  Mailliste vereinigt: 627 lokal + 628 entfernt → 627 Mails
10:12:49  Disconnected
10:12:51  Connected
10:13:15  Mailliste vereinigt, aber nicht hochgeladen: Upload acknowledgment timeout
```

Die Mailliste ist 34 MB (als base64-Nachricht ~45 MB). Während sie hochgeht, (1) steckt der
Heartbeat-Ping hinter ihr in der Sendewarteschlange → kein Pong binnen 30 s → die App hält die
Verbindung für tot und **kappt sie selbst** (`startHeartbeat`); alle wartenden Downloads fallen
mit „Not connected" um; (2) läuft die feste 30-s-Frist auf die Upload-Bestätigung ab. Der
Konflikt bleibt, der nächste Auto-Sync wiederholt alles. Erklärt beide Läufe (200 und 194).

**Änderung** (nicht von Codex gesehen — Kandidat für Runde 3):
- `transferTiming.ts` (rein, 9 Tests): `socketLooksAlive` — Pong ODER Byte-Fortschritt in
  einer Richtung zählt als lebendig; `transferTimeoutMs` — Frist aus erwarteter Größe bei
  angenommenen 2 Mbit/s, base64-Aufblähung eingerechnet, Deckel 15 min.
- Heartbeat liest `_socket.bytesRead/bytesWritten` (ws-Interna, abgesichert, Test bricht bei
  Umbenennung) und terminiert nur ohne Pong UND ohne Byte. Abriss durch Heartbeat geht ins
  Sync-Protokoll.
- `waitForAck`: Frist nach Fortschritt (`bufferedAmount` sinkt → Frist beginnt neu), 30 s
  Stillstand oder 15 min hart. Fehlertext nennt, ob noch Bytes in der Warteschlange lagen.
- `requestFile`: Frist aus der Größe im zuletzt geholten Server-Manifest.

Offen: Ob es nach der Änderung wirklich durchläuft, zeigt erst ein Build auf dem Linux-Rechner —
die Bedingung (langsamer Upload, 45-MB-Nachricht) lässt sich auf Loopback nicht nachstellen.

## Status

Runde 2 abgeschlossen. F01–F05 und F07–F12 adressiert, F06 offen (eigene Aufgabe, vorbestehend). Sichtprüfung in der Dev-App erfolgt (s. Nachtrag). Offen: Gegenprobe auf dem Arch-Rechner, danach Abnahme durch den Nutzer und Release.
