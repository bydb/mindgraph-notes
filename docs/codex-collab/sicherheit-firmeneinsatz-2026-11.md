# Sicherheitskorrekturen vor Firmeneinsatz (22.11.2026)

## Aufgabe

Claude hat vor dem Einsatz bei Firmen und Institutionen eine gezielte Sicherheitsprüfung gemacht und
vier Befunde behoben. Die Änderungen liegen **uncommittet** im Arbeitsbaum (Basis `84a98e52`).
Codex prüft die vier Korrekturen adversarial: Sind sie vollständig, umgehbar, oder brechen sie
etwas (Funktionen, Plattformen, Migration)?

**Nicht Teil dieser Aufgabe:** `app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md`
und `app/tsconfig.node.tsbuildinfo` (fremde, ältere Änderungen im Arbeitsbaum).

### Befund 1 — Hauptfenster ließ Navigation auf fremde Dateien zu
Vorher hielt `will-navigate` nur http(s) auf und ließ alles andere durch. Ein relativer Link in
nicht editierbarem Markdown (Vault-Chat `NotesChat.tsx` fängt `<a>` nicht ab) wurde zu `file:///…`
und lud fremdes HTML ins Hauptfenster — mit preload/electronAPI (`sandbox: false`,
`isTrustedSender` prüft nur Hauptrahmen, nicht die URL). Unter Windows `//host/x` → UNC.
Jetzt: reine Entscheidung `decideMainNavigation` (allow / external / block), `will-navigate` UND
`will-redirect`.

### Befund 2 — Readwise- und LanguageTool-API-Schlüssel im Klartext in `ui-settings.json`
Jetzt versiegelt der Main-Prozess `apiKey` an der Dateigrenze (safeStorage → `apiKeyEnc`, `apiKey: ''`)
und öffnet ihn nur in `load-ui-settings` für den Renderer. Renderer unverändert.

### Befund 3 — Whisper lud onnxruntime-web zur Laufzeit von cdn.jsdelivr.net
Deshalb stand jsdelivr in `script-src` und `connect-src` der Haupt-CSP. Jetzt kommen `.mjs`/`.wasm`
(Variante asyncify) per Vite `?url` aus dem App-Paket; jsdelivr ist aus der CSP entfernt.

### Befund 4 — Update-Prüfung bei jedem Start, nicht abschaltbar
Jetzt Schalter `updateCheckOnStart` (Einstellungen → Allgemein → Start) und zentral
`MINDGRAPH_DISABLE_UPDATE_CHECK=1` (Main verweigert `check-for-updates` und `download-update`).

### Was Claude selbst gemessen hat (gebauter Build, `npx electron .`, Wegwerf-Profil, CDP)
- Whisper-Worker lädt `Xenova/whisper-tiny` bis `ready`, CSP ohne jsdelivr.
- `<a href="/etc/hosts">`-Klick und `location.href='file:///etc/hosts'`: beide verworfen
  (`[Security] Navigation des Hauptfensters verworfen`), Seite bleibt `index.html`.
- Schlüssel gespeichert → Datei enthält kein `TESTKEY`, nur `apiKeyEnc`; `loadUISettings` liefert Klartext.
- `MINDGRAPH_DISABLE_UPDATE_CHECK=1` → `updateCheckDisabledByAdmin=true`, `checkForUpdates()` → `{available:false}`.
- typecheck grün; Tests 4206 grün, 1 bekannter Last-Wackler (`shellExecution.test.ts`, einzeln grün).
- **Nicht gemessen:** Windows (UNC, `pathToFileURL` mit Laufwerksbuchstaben), Linux ohne Schlüsselbund,
  echte Transkription (nur Modell-Laden), Dev-Modus (`http://localhost:5173`) nach der Änderung.

## Kontext/Anker

- `app/src/shared/mainNavigation.ts` — `decideMainNavigation` (ganze Datei), Tests `app/src/shared/mainNavigation.test.ts`
- `app/src/main/index.ts:1655-1670` — `appUrl` via `pathToFileURL`, `guardMainNavigation`, `will-navigate` + `will-redirect`
- `app/src/main/index.ts:~1625` — `setWindowOpenHandler` deny (unverändert, Kontext)
- `app/src/main/index.ts:~340` — `web-contents-created` deny (unverändert)
- `app/src/main/plugins/transport.ts:18` — `isTrustedSender` (prüft keine URL)
- `app/src/renderer/components/NotesChat/NotesChat.tsx:471` — Klick-Handler ohne `<a>`-Abfang
- `app/src/main/uiSettingsSecrets.ts` — `sealUiSecrets` / `openUiSecrets`, Tests `app/src/main/uiSettingsSecrets.test.ts`
- `app/src/main/index.ts:1264` — `uiSecretCipher` (safeStorage)
- `app/src/main/index.ts:1285-1296` — `saveUISettings` (flacher Merge, dann versiegeln)
- `app/src/main/index.ts:1878-1881` — `load-ui-settings` öffnet
- `app/src/main/index.ts` — `prune-ui-settings-keys` (liest/schreibt roh, unverändert)
- `app/src/renderer/stores/uiStore.ts` — `readwise.apiKey`, `languageTool.apiKey`, Persistenz
- `app/src/renderer/utils/voice/transformersWorker.ts:11-21` — `?url`-Importe, `wasmPaths`
- `app/node_modules/@huggingface/transformers/dist/transformers.web.js:~7703-7800` — `ensureWasmLoaded`, CDN-Default
- `app/index.html:6` — CSP
- `app/src/shared/updateCheckPolicy.ts` (+ Test)
- `app/src/main/index.ts:11145`, `:11218` — Sperre in `check-for-updates` / `download-update`
- `app/src/main/preload.ts:648` — `updateCheckDisabledByAdmin`
- `app/src/renderer/App.tsx:720-722` — Start-Prüfung
- `app/src/renderer/components/Settings/GeneralSettingsTab.tsx:213-220` — Schalter
- `app/src/shared/types.ts` — `updateCheckDisabledByAdmin`

Prüffragen (nicht abschließend):
1. Gibt es weitere Wege, das Hauptdokument (oder ein anderes Fenster mit preload) auf fremden Inhalt
   zu bringen: `will-frame-navigate`, `did-start-navigation`, Unterrahmen mit `allow-top-navigation`,
   andere BrowserWindows mit preload (Tray/Transport-Fenster), `webContents.loadURL` mit Renderer-Daten?
2. Bricht die Sperre legitime Navigationen (Dev-HMR, Fenster-Recovery/Reload, Hash-Routen, Windows-Pfade)?
3. Versiegelung: Datenverlust oder Rückfall auf Klartext möglich (flacher Merge, Teil-Speichern,
   paralleles Speichern, Mehrgeräte/Sync von `ui-settings.json`, alte `.bak`-Dateien, Linux `basic_text`)?
   Lesen andere Main-Pfade `loadUISettings()` und erwarten dort den Schlüssel?
4. Whisper: lädt transformers.js noch irgendetwas anderes von jsdelivr / einem CDN? Passt die
   onnxruntime-web-Version zu der, die transformers.js erwartet? Funktioniert `?url` im gepackten
   asar (`file://…/app.asar/…`)?
5. Update-Sperre: umgehbar (anderer Update-Pfad, electron-updater automatisch, Windows/Linux-Zweig)?

## Codex-Findings

### F01 — Vorübergehend unlesbarer Schlüssel wird dauerhaft gelöscht
Schwere: hoch
Stelle: app/src/main/uiSettingsSecrets.ts:51
Status: [OFFEN]
`openUiSecrets` entfernt `apiKeyEnc` auch dann, wenn `safeStorage` gerade nicht verfügbar ist oder die Entschlüsselung fehlschlägt, und gibt `apiKey: ''` zurück (`app/src/main/uiSettingsSecrets.ts:51-61`). Der Renderer übernimmt diesen Wert (`app/src/renderer/stores/uiStore.ts:1778-1797`) und sendet bei jeder späteren Änderung *alle* persistierten Gruppen zurück (`app/src/renderer/stores/uiStore.ts:2064-2072`, `:2142-2156`). Der flache Merge ersetzt damit die Gruppe samt noch vorhandener Chiffre; `sealUiSecrets` lässt das leere Feld ohne `apiKeyEnc` unverändert (`app/src/main/index.ts:1293-1295`, `app/src/main/uiSettingsSecrets.ts:32-37`). Ein temporär gesperrter Linux-Schlüsselbund oder ein vorübergehender Entschlüsselungsfehler führt so beim nächsten beliebigen Settings-Save zum unwiederbringlichen Verlust beider Schlüssel. Der Test `uiSettingsSecrets.test.ts:63-66` prüft nur die Anzeige, nicht den anschließenden Save.
Vorschlag: Nicht entschlüsselbare Chiffre beim Save erhalten, bis der Nutzer den Schlüssel ausdrücklich ersetzt oder löscht; Löschabsicht getrennt von einem Ladefehler übertragen und den Ladefehler-→-Save-Pfad testen.

Nachprüfung Runde 2: **nicht geschlossen** — die Chiffre bleibt nur erhalten, solange die globale Merkliste nicht von einem weiteren Leser ersetzt wird (`app/src/main/index.ts:1887`, `app/src/main/uiSettingsSecrets.ts:62`); reproduzierbarer Verlustpfad siehe F05.

### F02 — Alte Klartext-Schlüssel bleiben bis zu einer Einstellungsänderung liegen
Schwere: mittel
Stelle: app/src/main/index.ts:1878
Status: [OFFEN]
Der neue `load-ui-settings`-Handler öffnet die Datei nur für den Renderer (`app/src/main/index.ts:1878-1880`); die Versiegelung passiert ausschließlich in `saveUISettings` (`app/src/main/index.ts:1283-1295`). `initializeUISettings` speichert nach dem Laden nur bei vorhandenen `legacyPresent`-Plugin-Schlüsseln unmittelbar (`app/src/renderer/stores/uiStore.ts:2030-2043`); sonst speichert die Subscription erst nach einer Änderung (`:2142-2156`). Eine bestehende Installation, deren Nutzer nur Notizen liest, behält die Readwise- und LanguageTool-Schlüssel daher unbegrenzt im Klartext in `ui-settings.json`, obwohl der neue Build läuft.
Vorschlag: Alte Klartextfelder beim ersten Laden im Main atomar versiegeln und erst nach erfolgreichem Schreiben den migrierten Stand ausliefern; einen Bestandsprofil-Test ergänzen.

Nachprüfung Runde 2: **geschlossen** hinsichtlich der ausbleibenden Startmigration — `load-ui-settings` stößt sie jetzt selbst an und wartet auf den Schreibvorgang (`app/src/main/index.ts:1880-1883`); keine Rekursion, da `loadUISettings` ausschließlich die Datei liest (`:1273-1279`). Die falsche Verschlüsselungsanzeige bei einem Schreibfehler ist separat F07.

### F03 — Zweites Fenster mit vollem Preload hat keinen Navigationsschutz
Schwere: mittel
Stelle: app/src/main/transport/trayManager.ts:94
Status: [OFFEN]
Das Schnellerfassungsfenster lädt denselben privilegierten Preload wie das Hauptfenster (`app/src/main/transport/trayManager.ts:110-114`), lädt `transport.html` bzw. den Dev-Server (`:130-135`), registriert aber weder `will-navigate` noch `will-redirect` (`app/src/main/transport/trayManager.ts:94-142`). Der neue Guard hängt ausschließlich an `mainWindow.webContents` (`app/src/main/index.ts:1655-1670`); der globale Handler verweigert nur `window.open` (`:339-345`). Damit bleibt die gleiche Klasse von Hauptdokument-Navigation in einem weiteren Fenster mit `electronAPI` möglich, sobald dort ein Link oder eine Navigation aus nicht vertrauenswürdigem Inhalt entsteht. Ein aktueller konkreter Link aus Vault-Inhalt im Transport-UI ist nicht belegt; das Finding betrifft die ungeschützte privilegierte Fläche.
Vorschlag: Navigation aller Fenster mit dem vollen Preload an ihr jeweiliges App-Dokument binden und den Guard für Haupt- und Schnellerfassungsfenster gemeinsam testen.

Nachprüfung Runde 2: **geschlossen** — beide Fenster verwenden den Guard (`app/src/main/index.ts:1668`, `app/src/main/transport/trayManager.ts:137`), der Navigation und Redirect abfängt (`app/src/main/navigationGuard.ts:14-16`); die Schnellerfassung bindet ihn vor dem Laden an `transport.html`, dessen erneutes Laden erlaubt bleibt (`app/src/main/transport/trayManager.ts:134-142`, `app/src/shared/mainNavigation.ts:32-34`).

### F04 — Nutzerseitig abgeschaltete Startprüfung kann vor dem Laden der Einstellung anlaufen
Schwere: mittel
Stelle: app/src/renderer/App.tsx:722
Status: [OFFEN]
Die Settings-Initialisierung läuft asynchron in einem eigenen Effekt (`app/src/renderer/App.tsx:392-397`), während der Update-Effekt nach nur einer Sekunde den aktuellen Store-Wert liest und bei Default `updateCheckOnStart: true` einen weiteren Timer anlegt (`app/src/renderer/App.tsx:698-740`, `app/src/renderer/stores/uiStore.ts:1049-1052`). Braucht `loadUISettings` länger als diese Sekunde, wird trotz gespeichertem `false` der Timer geplant. Selbst wenn die Einstellung in den folgenden fünf Sekunden geladen oder ausgeschaltet wird, prüft dessen Callback sie nicht erneut und ruft `checkForUpdates()` auf (`app/src/renderer/App.tsx:722-724`); die Main-Sperre greift nur bei gesetzter Admin-Umgebungsvariable (`app/src/main/index.ts:11143-11145`). Das ist eine reale Race-Bedingung für die versprochene nutzerseitige Abschaltung.
Vorschlag: Den Startcheck erst nach abgeschlossener Settings-Initialisierung planen und den aktuellen Schalter unmittelbar vor dem IPC-Aufruf erneut prüfen.

Nachprüfung Runde 2: **geschlossen** — der Check wartet auf `uiSettingsReady` und prüft den aktuellen Schalter erneut im Timer (`app/src/renderer/App.tsx:724-730`); die Initialisierung löst das Promise auch im Fehlerpfad über `finally` auf (`app/src/renderer/stores/uiStore.ts:2053-2057`).

### F05 — Weiterer Settings-Leser hebt den Schutz vor Schlüsselverlust auf
Schwere: hoch
Stelle: app/src/main/index.ts:1887
Status: [OFFEN]
`uiSecretsUnreadable` ist eine einzige globale Merkliste (`app/src/main/index.ts:1264-1265`), die **jeder** `load-ui-settings`-Aufruf vollständig ersetzt (`:1886-1887`). Sie beschreibt damit nicht, welchen Schlüssel der spätere speichernde Renderer tatsächlich erhalten hat. Reproduzierbare Folge: Das Hauptfenster lädt bei einem Entschlüsselungsfehler einen leeren Schlüssel; nach wieder möglicher Entschlüsselung öffnet der Nutzer die Schnellerfassung, deren Bootstrap ebenfalls `initializeUISettings()` aufruft (`app/src/renderer/transport/transport.tsx:6-7`). Dieser erfolgreiche zweite Ladevorgang leert die globale Merkliste. Beim nächsten beliebigen Settings-Save des Hauptfensters wird dessen weiterhin leerer Schlüssel als Löschung behandelt; die Chiffre wird entfernt (`app/src/renderer/stores/uiStore.ts:2074-2082`, `app/src/main/index.ts:1296-1297`, `app/src/main/uiSettingsSecrets.ts:59-66`). Die Schreibkette hilft nicht: Schon die beschriebenen vollständig nacheinander ausgeführten Aufrufe reichen aus. Gegenprobe mit den unverändert aus `index.ts` extrahierten Lade-/Speicherfunktionen und einem Speicher-FS sowie Cipher-Double reproduziert den Verlust. Die vorhandenen Tests modellieren nur einen Leser mit unveränderter Merkliste (`app/src/main/uiSettingsSecrets.test.ts:61-81`).
Vorschlag: Schlüsseländerungen von vollständigen Settings-Snapshots trennen und ausdrücklich als Setzen/Löschen übertragen. Mindestens muss der Schutz an die jeweilige Renderer-Generation und den tatsächlich ausgelieferten Schlüsselstand gebunden sein; ein anderer Leser darf ihn nicht aufheben. Den Ablauf Hauptfenster-Ladefehler → erfolgreicher Transport-Load → Hauptfenster-Autosave testen.

Nachprüfung Runde 3: **geschlossen** für den Verlust durch die globale Merkliste — diese ist entfallen; leere Renderer-Felder erhalten die vorhandene Chiffre unabhängig von anderen Lesern (`app/src/main/uiSettingsSecrets.ts:68-75`, `app/src/main/index.ts:1295`). Die Gegenprobe mit zwei Lesevorgängen und anschließendem leerem Save erhält den Schlüssel; nicht leere veraltete Snapshots sind separat F08.

### F06 — Unlesbare gespeicherte Schlüssel können nicht ausdrücklich entfernt werden
Schwere: mittel
Stelle: app/src/main/uiSettingsSecrets.ts:62
Status: [OFFEN]
Für eine als unlesbar gemerkte Gruppe wird bei jedem leeren Feld die alte Chiffre wieder eingesetzt (`app/src/main/uiSettingsSecrets.ts:59-65`). Es gibt keinen getrennten Löschauftrag. Die beiden vorhandenen Entfernen-Aktionen senden ausschließlich `apiKey: ''` (`app/src/renderer/components/Settings/IntegrationsTab.tsx:163`, `:346`) und sind bei einem unlesbaren Schlüssel sogar ausgeblendet: `openUiSecrets` liefert den leeren Wert (`app/src/main/uiSettingsSecrets.ts:94-98`), `saved` wird daraus berechnet (`app/src/renderer/components/Settings/IntegrationsTab.tsx:160`, `:343`), und `SecretField` zeigt Entfernen nur bei `saved === true` (`app/src/renderer/components/Settings/SettingsUI.tsx:521-533`). Der Nutzer sieht somit „kein Schlüssel“, obwohl weiterhin ein Schlüssel auf der Platte liegt, und kann ihn über die Oberfläche nicht löschen. Wird der Schlüsselbund später wieder lesbar, erscheint der alte Schlüssel erneut. Die Speicher-Gegenprobe bestätigt, dass auch ein ausdrücklich gesendetes leeres Feld die Chiffre erhält.
Vorschlag: Den Zustand „gespeichert, derzeit nicht lesbar“ an die Oberfläche melden und eine ausdrücklich bestätigte Löschaktion bereitstellen, die die Chiffre unabhängig von der Entschlüsselbarkeit entfernt. Ein gewöhnlicher Autosave muss sie weiterhin erhalten.

Nachprüfung Runde 3: **geschlossen** hinsichtlich der fehlenden Löschmöglichkeit für unlesbare Chiffren — der Knopf ist nun erreichbar (`app/src/renderer/components/Settings/IntegrationsTab.tsx:69-70`, `:177`, `:360`), und der validierte eigene Befehl entfernt die Chiffre ohne Entschlüsselung (`app/src/main/index.ts:1889-1902`, `app/src/main/uiSettingsSecrets.ts:87-91`). Gegenprobe erfolgreich; Rückgängigmachen und Fehlerbehandlung des Löschens siehe F08–F10.

### F07 — Fehlgeschlagene Migration wird in der Zugangsdatenübersicht als verschlüsselt dargestellt
Schwere: mittel
Stelle: app/src/main/index.ts:1894
Status: [OFFEN]
Der neue IPC `ui-secrets-encrypted` meldet ausschließlich, ob `safeStorage` verfügbar ist, ohne den Dateistand oder das Ergebnis der Migration zu prüfen (`app/src/main/index.ts:1894`). Schlägt das Schreiben beim Start etwa wegen fehlender Schreibrechte fehl, gibt `saveUISettings` nur `false` zurück (`:1304-1306`); `load-ui-settings` liefert anschließend die unveränderten Klartextwerte aus, ohne den Fehler im Rückgabewert kenntlich zu machen (`:1880-1889`). `CredentialsSettings` entfernt dennoch die Klartextmarkierung und Warnkarte anhand dieses Capability-Booleans (`app/src/renderer/components/Settings/CredentialsSettings.tsx:114-118`, `:136`). Reproduziert mit dem tatsächlichen Lade-/Speichercode und einem `EACCES` beim Schreiben: Die Datei enthält weiter den Klartextschlüssel, während `ui-secrets-encrypted` `true` liefert. Die neue Anzeige behauptet dadurch gerade im fehlgeschlagenen Migrationsfall einen Schutz, der nicht besteht.
Vorschlag: Den tatsächlichen Speicherzustand je Schlüssel melden und eine fehlgeschlagene Migration sichtbar machen. Verfügbarkeit der Verschlüsselung und erfolgreich verschlüsselte Ablage müssen getrennte Zustände sein; Migration mit Schreibfehler einschließlich UI-Status testen.

Nachprüfung Runde 3: **geschlossen** für die Gleichsetzung von verfügbarer und tatsächlich erfolgter Verschlüsselung — `uiSecretStatus` erkennt Klartext in der Datei (`app/src/main/uiSettingsSecrets.ts:109-117`), und die Übersicht verwendet diesen Status (`app/src/renderer/components/Settings/CredentialsSettings.tsx:99`, `:117-125`). Die Gegenprobe mit fehlgeschlagener Migration liefert `plaintext`; Fehler beim Lesen des Dateistands sind separat F10.

### F08 — Veralteter nicht leerer Settings-Snapshot stellt gelöschte Schlüssel wieder her
Schwere: mittel
Stelle: app/src/main/uiSettingsSecrets.ts:77
Status: [OFFEN]
Die unter „Claude-Antwort“ benannte Mehrfenster-Grenze bleibt ein tatsächlicher Löschfehler: Der neue Befehl entfernt den Schlüssel erfolgreich (`app/src/main/index.ts:1891-1896`), aber jeder spätere gewöhnliche Save mit einem alten nicht leeren `apiKey` legt ihn erneut an (`app/src/main/uiSettingsSecrets.ts:77-81`). Es gibt weder eine Schlüsselversion noch eine Prüfung, ob der Schlüssel ausdrücklich geändert wurde. Renderer speichern weiterhin sämtliche persistierten Gruppen auch bei einer anderen Einstellungsänderung (`app/src/renderer/stores/uiStore.ts:2069-2077`, `:2147-2161`); die Schnellerfassung hat nach ihrem Bootstrap einen eigenen geladenen Settings-Stand (`app/src/renderer/transport/transport.tsx:6-7`). Sobald ein solcher älterer Stand nach dem Entfernen gespeichert wird, hebt er die Löschung auf. Die Schreibkette verhindert das nicht, weil die Aufrufe vollständig nacheinander erfolgen können. Gegenprobe mit den tatsächlichen Lade-/Lösch-/Speicherfunktionen: laden → `clearUiSecret` liefert `true`, Status `none` → alten Snapshot mit anderer `theme` speichern → Status wieder `encrypted`, alter Schlüssel wieder lesbar. Dasselbe Muster kann einen neu eingetragenen Schlüssel auf den alten zurücksetzen. Der aktuelle Löschtest prüft ausschließlich einen späteren **leeren** Save (`app/src/main/uiSettingsSecrets.test.ts:84-90`).
Vorschlag: Auch Setzen/Ersetzen als ausdrücklichen Schlüsselbefehl behandeln und Schlüsselwerte aus gewöhnlichen Settings-Saves ausnehmen, oder Schlüsseländerungen mit einer Main-seitigen Version gegen veraltete Snapshots absichern. Die entfernte Chiffre darf durch einen unveränderten alten Snapshot nicht wieder entstehen.

### F09 — Fehlgeschlagenes Löschen leert die Oberfläche und entfernt die Wiederholungsmöglichkeit
Schwere: mittel
Stelle: app/src/renderer/components/Settings/IntegrationsTab.tsx:63
Status: [OFFEN]
`removeSecret` leert den Store vor dem IPC-Aufruf und ignoriert dessen boolesches Ergebnis; auch eine Exception wird nur zu einem ebenfalls ignorierten `false` (`app/src/renderer/components/Settings/IntegrationsTab.tsx:63-67`). Schlägt der Schreibvorgang mit `EACCES` fehl, bleibt eine zuvor lesbare Chiffre erhalten und der Main liefert `false` (`app/src/main/index.ts:1895`, `:1899-1901`). Die anschließende Statusabfrage meldet korrekt `encrypted`, aber das Eingabefeld wertet bei leerem Store ausschließlich `unreadable` als gespeichert (`app/src/renderer/components/Settings/IntegrationsTab.tsx:69-70`, `:177`, `:360`). Damit verschwindet der Entfernen-Knopf, der Nutzer erhält keine Fehlermeldung, und die weiterhin gespeicherte Chiffre sieht wie ein erfolgreich entfernter Schlüssel aus. Ein folgender leerer Autosave erhält sie ausdrücklich (`app/src/main/uiSettingsSecrets.ts:68-75`), beim Neustart ist sie wieder da. Reproduziert mit der unverändert extrahierten `removeSecret`-Funktion und dem tatsächlichen Main-Handler bei simuliertem Schreibfehler.
Vorschlag: Den Rückgabewert auswerten, bei fehlgeschlagenem Löschen den ursprünglichen Store-Wert wiederherstellen und einen sichtbaren Fehler mit erneuter Löschmöglichkeit zeigen. Während des Vorgangs den Zustand als ausstehend führen; den Store so mit Autosave koordinieren, dass eine erfolgreiche Löschung nicht rückgängig gemacht wird.

### F10 — Lesefehler werden als fehlender Schlüssel und erfolgreiche Löschung ausgegeben
Schwere: mittel
Stelle: app/src/main/index.ts:1892
Status: [OFFEN]
Die neuen Status- und Löschhandler verwenden `loadUISettings`, das **jeden** Lese- oder JSON-Fehler in `{}` umwandelt (`app/src/main/index.ts:1271-1277`). Beim Löschen wird daraus ein unveränderter Rückgabewert von `clearUiSecret`, worauf der Handler `true` meldet, ohne die Datei zu verändern (`app/src/main/index.ts:1892-1894`, `app/src/main/uiSettingsSecrets.ts:88-89`). Beim Status wird derselbe Fehler zu `none` für beide Gruppen (`app/src/main/index.ts:1885`, `app/src/main/uiSettingsSecrets.ts:112-115`). Gegenprobe: vorhandene verschlüsselte Datei → `readFile` wirft `EACCES` → Löschen liefert `true`, Status `none`; nach wieder möglichem Lesen ist der Schlüssel unverändert vorhanden. Zusätzlich läuft die Statusabfrage außerhalb der Schreibkette und kann während `fs.writeFile` eine bereits geleerte, noch nicht fertig geschriebene Datei lesen (`app/src/main/index.ts:1296`, `:1885`). Auch diese Interleaving-Gegenprobe liefert vorübergehend `none`. Die Integrationsseite fragt nur beim Öffnen und nach Entfernen nach (`app/src/renderer/components/Settings/IntegrationsTab.tsx:58-67`), sodass sie bei einem unlesbaren Schlüssel den Entfernen-Knopf anschließend dauerhaft bis zum erneuten Öffnen verbergen kann.
Vorschlag: Für Status und Löschen einen strikten Leser verwenden, der „Datei fehlt“ von Lese-/Parsefehlern unterscheidet. Bei Fehlern weder `none` noch erfolgreichen Löschabschluss melden. Statusabfragen mit den Schreibvorgängen koordinieren und/oder die Datei atomar ersetzen, damit keine Zwischenstände als gültiger Status ausgegeben werden.

## Claude-Antwort

Alle vier Findings am Code nachgeprüft: tragen. Vom Nutzer am 22.11.2026 zur Umsetzung freigegeben.

### F01 — [ADRESSIERT]
`openUiSecrets` liefert jetzt `{ settings, unreadable }` und meldet unlesbare Gruppen (auch ohne verfügbare
Verschlüsselung); der Main merkt sie sich (`uiSecretsUnreadable`, `app/src/main/index.ts` bei `uiSecretCipher`).
`sealUiSecrets(merged, existing, cipher, unreadable)` übernimmt bei leerem Feld ohne `apiKeyEnc` die Chiffre aus
dem Bestand, wenn die Gruppe beim Laden unlesbar war — ein leeres Feld heißt dort „unbekannt“, nicht „gelöscht“.
Ein neu eingetragener Schlüssel ersetzt die Chiffre und nimmt die Gruppe aus der Merkliste. Tests:
`uiSettingsSecrets.test.ts` „F01: unlesbarer Schlüssel überlebt das nächste Speichern…“, „…ohne verfügbare
Verschlüsselung…“, „…neuer Schlüssel ersetzt die unlesbare Chiffre“ (Ladefehler → Save → später lesbar).
Nicht gemessen: echter gesperrter Linux-Schlüsselbund.

### F02 — [ADRESSIERT]
`load-ui-settings` versiegelt alte Klartextfelder sofort (`hasPlaintextSecrets` → `saveUISettings({})` über
`uiSettingsWriteChain`) und liest danach neu. Gemessen im gebauten Build mit Profil, das beide Schlüssel im
Klartext enthielt: nach dem Start ohne jede Einstellungsänderung 0 Treffer für den Klartext, nur `apiKeyEnc`.

### F03 — [ADRESSIERT]
Sperre ausgelagert nach `app/src/main/navigationGuard.ts` (`attachNavigationGuard`, will-navigate + will-redirect),
gesetzt für Hauptfenster (`index.ts`) und Schnellerfassung (`transport/trayManager.ts`, gebunden an
`transport.html`). Regressionstest `windowSecurity.test.ts` „jedes Fenster mit App-preload setzt
attachNavigationGuard“. Nicht gemessen: Navigation im Schnellerfassungsfenster selbst (kein Link-Weg dort bekannt).

### F04 — [ADRESSIERT]
`uiStore.ts` exportiert `uiSettingsReady` (aufgelöst im `finally` von `initializeUISettings`); `App.tsx` wartet
darauf, bevor die Update-Prüfung geplant wird, und prüft den Schalter im Timer-Callback erneut.

### Beifang aus der GUI-Prüfung
Die Seite Einstellungen → Zugangsdaten markierte Readwise/LanguageTool weiter als „Klartext“ samt Warnkarte.
Neu: IPC `ui-secrets-encrypted` (`index.ts`, preload `uiSecretsEncrypted`, `shared/types.ts`);
`CredentialsSettings.tsx` zeigt „Klartext“ nur noch, wenn safeStorage nicht verfügbar ist.

### Prüfung (gebauter Build, Testprofil, Computer Use + CDP)
- typecheck grün; Tests 4209 grün, 1 bekannter Last-Wackler (`shellExecution.test.ts`).
- Schalter „Beim Start nach Updates suchen“ sichtbar, ausgeschaltet, nach Neustart weiter aus (`updateCheckOnStart: false`).
- Zugangsdaten nach Neustart: beide „Gesetzt“, kein „Klartext“, keine Warnung.
- Notes Chat (lokal qwen3.5:4b): Link `[Bericht oeffnen](/etc/hosts)` in eigener Nachricht UND in der Modellantwort
  angeklickt → beide `[Security] Navigation verworfen (Hauptfenster): file:///etc/hosts`, App bleibt stehen.
- Whisper im Build: generierte deutsche Sprachdatei über den App-Worker transkribiert (tiny und base), 0 Anfragen an
  jsdelivr. Echte Mikrofonaufnahme nicht möglich: ungepacktes Electron hat keine macOS-Mikrofonfreigabe (Pegel 0) —
  nicht selbst erteilt.

### Runde 2: F05–F07 — [ADRESSIERT] durch Umbau statt Flicken (vom Nutzer freigegeben)
Gemeinsame Ursache: aus einem leeren Feld wurde Löschabsicht geraten. Neu (`app/src/main/uiSettingsSecrets.ts`):
- **Gewöhnliches Speichern löscht nie.** `sealUiSecrets(merged, existing, cipher)` holt bei leerem Feld eine vorhandene
  Chiffre aus dem Bestand zurück; ein neuer nicht leerer Schlüssel ersetzt sie. Die globale Merkliste
  `uiSecretsUnreadable` ist entfallen → F05 (zweites Fenster hebt den Schutz auf) gibt es nicht mehr.
  Test „F05: zweites Fenster lädt erfolgreich, erstes Fenster speichert danach sein leeres Feld — Schlüssel bleibt“.
- **Löschen ist ein eigener Befehl**: `clearUiSecret` + IPC `ui-secret-clear` (`index.ts`, `isTrustedSender`,
  `isSealedKeyGroup`, über `uiSettingsWriteChain`). Die Entfernen-Knöpfe in `IntegrationsTab.tsx` rufen ihn; bei
  unlesbarem Schlüssel zeigt das Feld „Gespeichert“ samt Hinweis, Entfernen ist erreichbar → F06.
- **Status aus der Datei**: `uiSecretStatus` → `encrypted | unreadable | plaintext | none`, IPC `ui-secrets-status`
  ersetzt `ui-secrets-encrypted`; `CredentialsSettings.tsx` zeigt „Klartext“/„nicht lesbar“ nach Dateistand → F07
  (fehlgeschlagene Migration bleibt `plaintext`). Test „F07: Status richtet sich nach der Datei…“.
- Gemessen im Build (Computer Use): Profil mit unlesbarer LanguageTool-Chiffre → Chiffre übersteht Start-Saves;
  Zugangsdaten zeigen „Gesetzt · gespeichert, derzeit nicht lesbar“; Integrationen → Entfernen → Datei ohne
  `apiKeyEnc` für languageTool, Readwise-Chiffre unberührt.
- Bekannte Grenze: Ein zweites Fenster, das den Schlüssel lesbar im Store hält und nach einem Entfernen eine
  persistierte Einstellung ändert, schreibt ihn zurück (so schon vor dieser Änderung; Fenster teilen keinen Store).

### Runde 3: F08–F10 (Entscheidung des Nutzers: F09/F10 jetzt, F08 später)

**F08 — [DISKUSSION: zurückgestellt]** Trägt. Ein veralteter Renderer-Snapshot mit nicht leerem Schlüssel stellt
einen gelöschten Schlüssel wieder her. Das Verhalten bestand vor dieser Arbeit genauso (mit Klartext); die
saubere Lösung — Schlüssel aus dem gewöhnlichen Settings-Save herausnehmen und nur über eigene Befehle
setzen/löschen, oder Main-seitige Versionierung — ist ein größerer Umbau des Settings-Speichers. Offener Punkt.

**F09 — [ADRESSIERT]** `IntegrationsTab.tsx` `removeSecret`: erst `clearUiSecret`, nur bei Erfolg den Store leeren;
bei Fehler bleibt der Schlüssel „Gespeichert“, Entfernen erreichbar, Hinweis `settings.integ.secretRemoveFailed`.
Gemessen (Computer Use, `chmod 000` auf ui-settings.json): Meldung erscheint, Feld „Gespeichert …9999“; nach
Freigabe zweiter Klick entfernt den Schlüssel, Readwise-Chiffre unberührt.

**F10 — [ADRESSIERT]** `index.ts`: `readUISettingsStrict` (fehlende Datei = `{}`, jeder andere Lese-/Parsefehler =
Fehler), `ui-secrets-status` liefert bei Fehler `null` und läuft in `uiSettingsWriteChain`, `ui-secret-clear` wirft
bei Lesefehler (→ `false`). `writeUISettingsAtomic` (tmp + rename; unter Windows bei EPERM/EBUSY/EACCES Rückfall
auf direktes Schreiben) für `saveUISettings` und Löschen. Gemessen per CDP bei `chmod 000`: Status `null`,
Löschen `false`, danach Status unverändert `encrypted`; keine `.tmp`-Reste.
Nicht gemessen: Windows-Rename-Rückfall.

## Status

F01–F07, F09, F10 umgesetzt und im Build geprüft. F08 offen (zurückgestellt, Vorbestand). Vom Nutzer zum Commit freigegeben.
