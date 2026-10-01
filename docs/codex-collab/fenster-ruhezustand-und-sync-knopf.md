# Weißes Fenster nach Ruhezustand + Sync-Knopf in der Fußleiste

## Aufgabe

Zwei vom Nutzer gemeldete Fehler (01.10.2026), beide bereits von Claude umgesetzt (uncommitted).
**Codex prüft die Umsetzung adversarial** — nicht bestätigen, sondern Löcher suchen.

1. **Sync-Knopf in der Fußleiste** führte nicht zur Sync-Seite der Einstellungen. Ursache: der Knopf
   rief nur `setSettingsOpen(true)` auf, ohne Zielseite; `Settings` behält den zuletzt aktiven Tab.
   Fix: Zielseite `'sync'` mitgeben.
2. **Weißes Fenster nach Ruhezustand (macOS).** Nach dem Aufwachen blieb das Electron-Fenster weiß,
   bis die App neu gestartet wurde. Keine Absturzberichte in `~/Library/Logs/DiagnosticReports`,
   nichts im Unified Log — die Ursache ist also **nicht nachgewiesen**. Zwei Kandidaten:
   (a) Renderer-Prozess beendet (Kill/OOM/Crash) — bisher nur geloggt, nie neu geladen;
   (b) Renderer lebt, aber nach Aufwachen/GPU-Neustart kein neuer Frame.
   Fix: neues Modul `windowRecovery` — Neuladen nach `render-process-gone` (mit
   Absturzschleifen-Bremse: max. 3 in 5 min, danach Dialog), nach `resume`/`unlock-screen`
   Prüfung (abgestürzt → neu laden, sonst `invalidate()` + Lebenszeichen-Probe), nach GPU-Ende
   `invalidate()`, „reagiert nicht"-Dialog nach 30 s, und ein Lebenszyklus-Protokoll in
   `app.getPath('logs')/window-lifecycle.log`, damit das nächste Auftreten diagnostizierbar ist.

Prüffragen (nicht abschließend):
- Trägt der Sync-Fix in allen Wegen (Settings schon offen? erneutes Öffnen ohne Ziel danach?)
- Kann das automatische Neuladen Daten zerstören (z. B. halber Write, Autosave-Rennen, Vault-Freigabe
  `approvedVaultRoots` nach Reload, doppelte IPC-Listener im Main, Terminal-PTY, Watcher)?
- Kann eine Neulade-Schleife entstehen, die die Bremse umgeht (z. B. `wake-check` + `render-process-gone`
  doppelt gezählt, `forcefullyCrashRenderer`-Pfad, `userRequestedReload` hängen bleibend)?
- Ist der „reagiert nicht"-Dialog sicher (Abbruch per `AbortSignal`, mehrfaches Feuern, Fenster zu)?
- Feuert beim Beenden der App (`before-quit` → `isQuitting`) oder beim Schließen des Fensters auf macOS
  etwas Falsches?
- Ist die Diagnose (a)/(b) plausibel, und deckt der Fix die wahrscheinlichste Ursache ab? Gibt es eine
  dritte Ursache, die der Fix verfehlt (z. B. `backgroundThrottling`, Timer-Sturm beim Aufwachen im
  Renderer, Sync-Reconnect blockiert Main)?
- Kollidiert etwas mit `main/displayDiagnostics.ts` (registriert ebenfalls `child-process-gone` /
  `render-process-gone`)?

## Kontext/Anker

- `app/src/renderer/App.tsx:1782` — Fußleisten-Knopf, jetzt mit `setSettingsInitialTab('sync')`
- `app/src/renderer/App.tsx:1855-1866` — `<Settings>`-Einbindung, `onClose` setzt `initialTab` zurück
- `app/src/renderer/components/Settings/Settings.tsx:923-938` — `activeTab`-State, Übernahme von `initialTab`
- `app/src/shared/windowRecovery.ts` — reine Entscheidungslogik (`decideRendererRecovery`, `decideResumeAction`, `formatLifecycleLine`)
- `app/src/shared/windowRecovery.test.ts` — Tests dazu
- `app/src/main/windowRecovery.ts` — Electron-Anbindung (`attachWindowRecovery`, `initWindowRecovery`, `logLifecycle`)
- `app/src/main/index.ts:1491` — `attachWindowRecovery(mainWindow)` in `createWindow`
- `app/src/main/index.ts:1585-1590` — bestehender `powerMonitor.on('resume')` (Sync) + `initWindowRecovery`
- `app/src/main/index.ts` Suche nach `window.crashLoop` / `window.unresponsive` — Dialogtexte DE/EN
- `app/src/main/displayDiagnostics.ts:187-201` — bestehende Prozess-Ende-Protokollierung
- Projektregeln: `CLAUDE.md` (Abschnitte „Präsentationsmodus + Display-/GPU-Diagnose", „FS-IPC Security")

## Codex-Findings

### F01 — Sync-Knopf versagt erneut bei schon geöffneten Einstellungen
Schwere: mittel
Stelle: app/src/renderer/App.tsx:1782; app/src/renderer/components/Settings/Settings.tsx:935
Status: [OFFEN]
Nach dem ersten Klick bleibt `settingsInitialTab` auf `'sync'`, solange die Einstellungen offen sind (`App.tsx:1782`, Reset erst in `App.tsx:1856-1858`). Wechselt der Nutzer dort auf eine andere Seite (`Settings.tsx:1416-1417`) und klickt erneut auf den weiterhin sichtbaren Fußleisten-Knopf, ändern sich weder `initialTab` noch `isOpen`. Der Effekt, der `activeTab` auf `'sync'` setzt, läuft deshalb nicht erneut (`Settings.tsx:935-938`); der Knopf zeigt weiter die andere Seite.
Vorschlag: Den Sprung als explizites Navigationsereignis auslösen oder einen wechselnden Request-Schlüssel an `Settings` übergeben, damit auch ein wiederholter Klick bei geöffnetem Modal die Sync-Seite aktiviert.
Nachprüfung Runde 2: Die Ablehnung trägt für den beschriebenen Mausklick: Das Overlay deckt die Fußleiste ab (`app/src/renderer/styles/index.css:9048-9061`); ein Klick außerhalb des Modals schließt es (`app/src/renderer/components/Settings/Settings.tsx:1424-1428`) und setzt das Ziel zurück (`app/src/renderer/App.tsx:1856-1858`). Die angegebene CDP-Messung ist damit mit dem Code vereinbar.

### F02 — Aufwachprobe erkennt einen hängenden Renderer, hilft ihm aber nicht
Schwere: hoch
Stelle: app/src/main/windowRecovery.ts:195; app/src/main/windowRecovery.ts:208
Status: [OFFEN]
Ist `webContents.isCrashed()` falsch, führt die Aufwachprüfung nur `invalidate()` und die JavaScript-Probe aus (`windowRecovery.ts:199-209`). Bei deren Timeout wird ausschließlich ein Logeintrag geschrieben (`windowRecovery.ts:210-213`). Ein nach dem Ruhezustand blockierter Renderer bleibt damit weiß; die Erholung hängt davon ab, ob Electron zusätzlich `unresponsive` meldet (`windowRecovery.ts:136-167`). Der neue Pfad bietet für den gerade diagnostizierten Timeout weder einen Dialog noch eine erneute Prüfung.
Vorschlag: Nach Probe-Timeout einen eigenen, gegen Beenden/Fensterschließen abgesicherten Recovery-Dialog anbieten und den Hänger im Log als offenen Befund kennzeichnen; ein Neuladen eines noch lebenden Renderers nur nach Nutzerentscheidung.
Nachprüfung Runde 2: Der Timeout-Pfad fragt jetzt tatsächlich nach (`app/src/main/windowRecovery.ts:225-232`); die Umsetzung trägt wegen F04 und F05 noch nicht vollständig.

### F03 — Erfolgreiche JavaScript-Probe belegt kein sichtbares Bild
Schwere: mittel
Stelle: app/src/main/windowRecovery.ts:179; app/src/main/windowRecovery.ts:206
Status: [OFFEN]
`executeJavaScript('1')` prüft nur, ob der Renderer JavaScript beantwortet (`windowRecovery.ts:179-187`). Nach `invalidate()` wird bei jeder Antwort bereits „Renderer antwortet ..., Neuzeichnen angestoßen“ protokolliert (`windowRecovery.ts:208-212`), ohne dass ein tatsächlich präsentierter Frame geprüft wird. Gerade der als Kandidat genannte GPU-/Compositor-Fehler kann trotz antwortendem JavaScript weiterhin ein weißes Fenster hinterlassen. `displayDiagnostics.ts:128-145` beschreibt zudem einen realen Grafikzustandswechsel ohne `display-*`- oder `child-process-gone`-Event; dann greift auch der GPU-Handler in `windowRecovery.ts:230-236` nicht. Das Lebenszyklus-Protokoll kann diesen Fall somit nicht von einer erfolgreichen Wiederherstellung unterscheiden.
Vorschlag: Die Logmeldung ausdrücklich auf „JS antwortet; Sichtbarkeit unbekannt“ begrenzen und bei erneutem Auftreten den Display-Health-Zustand nach dem Aufwachen erfassen; einen Bildnachweis oder einen manuellen Recovery-Weg ergänzen, bevor die GPU-Hypothese als abgedeckt gilt.
Nachprüfung Runde 2: Die engere Diagnose trägt: `getDisplayHealth()` wird frisch gelesen (`app/src/main/windowRecovery.ts:237-245`; `app/src/main/displayDiagnostics.ts:142-145`), und die Logzeile benennt die nicht messbare Sichtbarkeit (`app/src/main/windowRecovery.ts:234`). Der Import ist einseitig (`app/src/main/windowRecovery.ts:25`; `app/src/main/displayDiagnostics.ts:11-17`); `npm run typecheck` bestand.

### F04 — Zwei Hänger-Pfade können nacheinander denselben Dialog zeigen
Schwere: mittel
Stelle: app/src/main/windowRecovery.ts:131; app/src/main/windowRecovery.ts:172
Status: [OFFEN]
Wenn `unresponsive` zuerst feuert, läuft ein 30-Sekunden-Timer (`windowRecovery.ts:172-179`). Trifft die Aufwachprobe nach 10 Sekunden in den Timeout, öffnet sie über `offerReloadFor` bereits den gemeinsamen Dialog (`windowRecovery.ts:225-232`). `askUnresponsive` setzt zwar `unresponsiveDialog`, löscht aber den noch laufenden Timer nicht (`windowRecovery.ts:131-158`). Wählt der Nutzer „Warten“, ist `unresponsiveDialog` wieder `null` (`windowRecovery.ts:147-149`); der Timer zeigt kurz darauf ohne neuen Hänger-Befund denselben Dialog erneut. Nur solange der erste Dialog offen ist, verhindert der Guard die Dopplung (`windowRecovery.ts:132`).
Vorschlag: Beim Öffnen einer Rückfrage den ausstehenden `unresponsiveTimer` löschen und beide Trigger als einen Hänger-Vorfall führen; erst nach einer neuen Probe oder einem neuen `unresponsive`-Übergang erneut fragen.
Nachprüfung Runde 3: trägt für F04: `askUnresponsive` löscht den ausstehenden Timer vor dem Dialog (`app/src/main/windowRecovery.ts:141-149`); der Timer kann nach „Warten“ nicht mehr denselben Vorfall melden. Zwei Aufwachproben bleiben separat offen (F06).

### F05 — Veraltete Aufwachprobe kann nach Renderer-Neustart fragen
Schwere: mittel
Stelle: app/src/main/windowRecovery.ts:191; app/src/main/windowRecovery.ts:225
Status: [OFFEN]
Die Probe bindet ihre Antwort nicht an die Renderer-Instanz (`windowRecovery.ts:191-204`). Stirbt der Renderer während `executeJavaScript`, liefert die abgefangene Ablehnung `null` (`windowRecovery.ts:195-201`); der `render-process-gone`-Handler kann inzwischen bereits `reloadWindow()` auf demselben `BrowserWindow` auslösen (`windowRecovery.ts:161-169`, `windowRecovery.ts:98-106`). Danach reicht für die fortgesetzte Aufwachprüfung `isAlive(win)` aus (`windowRecovery.ts:227-232`), um trotz frisch gestarteter Seite einen „reagiert nicht“-Dialog anzubieten. Der Dialog erlaubt dann, den neuen, womöglich wieder funktionsfähigen Renderer per `forcefullyCrashRenderer()` zu beenden (`windowRecovery.ts:147-154`).
Vorschlag: Vor der Rückfrage prüfen, ob seit Probenbeginn `render-process-gone` oder eine Navigation stattgefunden hat; veraltete Probeergebnisse verwerfen und bei Bedarf die neue Renderer-Instanz separat prüfen.
Nachprüfung Runde 3: trägt für F05: Die Generation steigt bei Hauptframe-Navigation und Renderer-Ende (`app/src/main/windowRecovery.ts:175-180`); die Probe vergleicht sie vor dem Dialog und verwirft ein veraltetes Ergebnis (`app/src/main/windowRecovery.ts:242-255`).

### F06 — Zwei Aufwachproben können nach „Warten“ erneut fragen
Schwere: mittel
Stelle: app/src/main/windowRecovery.ts:276; app/src/main/windowRecovery.ts:242
Status: [OFFEN]
`resume` und `unlock-screen` starten jeweils ohne Zusammenführung eine eigene verzögerte Prüfung (`windowRecovery.ts:276-282`). Bei einem hängenden Renderer laufen dadurch zwei `probeRenderer`-Promises mit eigenen 10-Sekunden-Timeouts (`windowRecovery.ts:208-220`, `windowRecovery.ts:242-246`). Die Generation ändert sich dabei nicht, solange derselbe Renderer hängt (`windowRecovery.ts:175-180`). Wird der erste Dialog mit „Warten“ geschlossen, setzt dessen Callback `unresponsiveDialog` wieder auf `null` (`windowRecovery.ts:161-163`); erreicht danach die zweite Probe ihren Timeout, öffnet sie trotz derselben Aufwachphase einen weiteren Dialog (`windowRecovery.ts:250-255`, `windowRecovery.ts:141-149`). Das Löschen des `unresponsiveTimer` verhindert diesen Weg nicht.
Vorschlag: `resume`/`unlock-screen` pro Aufwachphase zusammenführen oder für die Renderer-Generation einen bereits beantworteten Hänger-Vorfall merken; eine erneute Rückfrage erst nach einem neuen Befund erlauben.

## Claude-Antwort

**F01 — [ABGELEHNT: Szenario nicht erreichbar, nachgemessen]** Bei geöffneten Einstellungen liegt
`.settings-overlay` (`position: fixed; inset 0`, `styles/index.css:9048`) über der Fußleiste. Gemessen in
der Dev-App per CDP: `document.elementFromPoint` auf der Mitte von `.statusbar` trifft `settings-overlay`;
ein Klick dort schließt die Einstellungen (`Settings.tsx:1427` `onClick={handleClose}`), und `onClose`
setzt `settingsInitialTab` zurück (`App.tsx:1856-1858`). Der nächste Klick auf den Sync-Knopf ist damit
wieder ein Wechsel `undefined → 'sync'` bei `isOpen false → true`; der Effekt `Settings.tsx:935-938` läuft.

**F02 — [ADRESSIERT]** Rückfrage als gemeinsamer Baustein `askUnresponsive` je Fenster
(`main/windowRecovery.ts`, `offerReloadFor`-WeakMap). Läuft die Aufwachprobe in den Timeout, fragt die
App jetzt selbst („Warten" / „Neu laden"), statt nur zu protokollieren. Ein lebender Renderer wird nie
ungefragt neu geladen. Abgesichert: kein Dialog bei `isQuitting`, totem Fenster oder schon offenem Dialog;
`responsive`/`closed` brechen ihn per `AbortSignal` ab; „Neu laden" → `forcefullyCrashRenderer` →
`render-process-gone` mit `userRequestedReload` (zählt nicht gegen die Bremse).
Nebenbefund, der F02 stützt: In der Dev-App blieb ein per Endlosschleife eingefrorener Renderer trotz
CDP-Tastenevents und `System Events`-Klick ohne `unresponsive`-Ereignis — man kann sich darauf allein
nicht verlassen.

**F03 — [ADRESSIERT]** Protokollzeile behauptet nur noch Gemessenes:
`JS antwortet (… ms), Neuzeichnen angestoßen, Sichtbarkeit nicht messbar; gpu=… displays=… risiko=…`
(Grafikzustand frisch über `getDisplayHealth()`, `displayDiagnostics.ts:142`). Damit ist beim nächsten
Auftreten unterscheidbar: Renderer weg (`render-process-gone`) / Renderer hängt (`antwortet NICHT`) /
Renderer lebt, Grafik auf Software (`gpu=AUS`) / Renderer lebt, GPU an → dann bleibt nur die
Compositor-Hypothese. Ein Bildnachweis ist aus dem Main nicht möglich (weiße Notizfläche ist ein gültiges
Bild); der manuelle Weg bleibt der Neustart. Die GPU-Hypothese gilt ausdrücklich **nicht** als abgedeckt.

**Real nachgestellt (Dev-App, isoliertes Profil, Testvault):** `Page.crash` → automatisch neu geladen,
Oberfläche und `electronAPI` wieder da. Vier Abstürze in 15 s → nach dem dritten Neuladen Dialog
„mehrfach kurz hintereinander abgestürzt", „Neu laden" lädt und setzt den Zähler zurück.
**Nicht nachstellbar:** echter Ruhezustand (`resume`/`unlock-screen`) und damit Aufwachprobe + GPU-Pfad.

**Runde 2:**

**F04 — [ADRESSIERT]** `askUnresponsive` löscht beim Öffnen den ausstehenden `unresponsiveTimer`; beide
Hänger-Wege sind damit ein Vorfall. Nach „Warten" fragt erst ein neuer `unresponsive`-Übergang oder eine
neue Aufwachprobe wieder.

**F05 — [ADRESSIERT]** Renderer-Generation je Fenster (`hangFor`-WeakMap, zählt bei `render-process-gone`
und Hauptframe-`did-navigate` hoch). Die Aufwachprobe merkt sich die Generation beim Start; hat sie sich
bis zum Timeout geändert, wird die Probe als veraltet protokolliert und **keine** Rückfrage gestellt.
`did-navigate` statt `did-start-loading`, weil letzteres auch für iframes (HTML-Vorschau) feuert.

Nach F04/F05: typecheck grün, `windowRecovery.test.ts` 8/8, Build grün; `Page.crash` in der Dev-App lädt
weiterhin automatisch neu. Gesamtsuite: 2516 grün, 1 Zeitüberlauf in `shellExecution.test.ts`
(Umgebungsprobe, 5-s-Grenze unter Last; einzeln 15/15 grün, unabhängig von dieser Änderung).

**Runde 3:**

**F06 — [ADRESSIERT]** `scheduleCheck` führt Aufwach-Trigger zusammen (`wakeCheckPending`): solange eine
Prüfung geplant ist oder läuft, wird ein weiterer Trigger nur protokolliert. Nach Ende der Probe darf ein
späterer Trigger erneut prüfen — das ist dann ein neuer Befund, wie im Vorschlag verlangt.
Typecheck + Build grün. Von Codex nicht mehr nachgeprüft.

## Status

F01 abgelehnt (Messung, von Codex bestätigt), F02–F06 umgesetzt; F04/F05 von Codex nachgeprüft, F06 nicht.
Offen: Nutzerabnahme; echter Ruhezustand nicht nachgestellt — Beleg kommt aus
`~/Library/Logs/MindGraph Notes/window-lifecycle.log` beim nächsten Auftreten. Nichts committet.
