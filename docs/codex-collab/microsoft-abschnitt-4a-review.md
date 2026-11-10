# Microsoft-Anmeldung, Abschnitt 4 Teil a (Main-Seite) — Code-Review

Stand: 10.11.2026 · Bauender: Claude · Prüfer: Codex · Abnahme: Nutzer

## Aufgabe

Den jüngsten Commit auf dem Zweig `feat/microsoft-anmeldung` am Code prüfen (`git show HEAD`).
Er bringt die Microsoft-365-Anmeldung in den Main-Prozess, noch ohne Oberfläche. Gesucht:
Sicherheitslücken (Markenabfluss, Rückfall auf den Passwortweg, Umgehung über IPC, Pfade),
Zustandsfehler (Abmelden, Widerruf, zwei Konten, zwei Geräte, beschädigte Ablage, gleichzeitige
Aufrufe), falsche Annahmen über `@azure/msal-node` 7.1.2, Verstöße gegen die Start-Reihenfolge
(`app.name` vor jedem userData-Zugriff), Lücken der Tests. Keine Code-Edits im Review.

Plan: `docs/codex-collab/microsoft-365-anbindung.md`, Abschnitt „Fassung 3“ (E2, E4, E5, E8, E13)
und die Messungen unter „Claude-Antwort“.

## Kontext/Anker

- `app/src/main/email/microsoftAuth.ts` — das Modul (neu).
- `app/src/main/email/microsoftAuth.test.ts` — 17 Tests mit nachgebauter Bibliothek.
- `app/src/main/email/ipc.ts` — Anlegen von `microsoftAuth` und die Handler
  `email-microsoft-login`, `email-microsoft-status`, `email-microsoft-logout`.
- `app/src/main/preload.ts`, `app/src/shared/types.ts` — Brücke und Typen.
- `app/package.json` — `@azure/msal-node` exakt `7.1.2`; Typen der Bibliothek unter
  `app/node_modules/@azure/msal-node/types/`.
- Start-Reihenfolge: `app/src/main/index.ts` (App-Name, Instanzsperre, Aufruf `registerEmailIpc`),
  Test `app/src/main/appNameOrder.test.ts`.

Vom Bauenden geprüft: typecheck, build, vitest; in der gebauten (nicht gepackten) App mit
Testprofil echt angemeldet, nach Neustart Abruf und Versand weiter berechtigt, in den
Ablagedateien kein Klartext. Nicht geprüft: gepackter Build, Windows/Linux, Oberfläche.

Bewusst so: Die Handler prüfen den Aufrufer nicht eigens (wie die übrigen Mail-Handler); die
mitgelieferte Anwendungs-ID steht im Quelltext (öffentlicher Client, kein Geheimnis).

## Codex-Findings

Der neue `email-microsoft-*`-IPC gibt selbst nur Kontoname und Zustandsfelder zurück (`app/src/main/email/ipc.ts:191-219`); Cache und temporäre Schreibdatei werden vor dem Schreiben verschlüsselt und neue temporäre Dateien mit Modus `0600` angelegt (`app/src/main/email/microsoftAuth.ts:183-189`). Die installierten MSAL-Typen unterstützen `openBrowser`, `prompt`, `extraScopesToConsent`, `acquireTokenSilent`, `removeAccount` und beide Cache-Plugin-Hooks (`app/node_modules/@azure/msal-node/types/request/InteractiveRequest.d.ts:8-33`, `app/node_modules/@azure/msal-common/types/request/CommonAuthorizationUrlRequest.d.ts:37-57`, `app/node_modules/@azure/msal-node/types/client/PublicClientApplication.d.ts:48-56`, `app/node_modules/@azure/msal-node/types/cache/ITokenCache.d.ts:6-14`, `app/node_modules/@azure/msal-common/types/cache/interface/ICachePlugin.d.ts:1-5`). Der installierte MSAL-Code verwendet PKCE, einen auf `127.0.0.1` gebundenen Loopback-Listener und `form_post` (`app/node_modules/@azure/msal-node/dist/client/PublicClientApplication.mjs:117-166`, `app/node_modules/@azure/msal-node/dist/network/LoopbackClient.mjs:78-95`). Der neue Modulimport führt keinen `userData`-Zugriff aus; `app.name` und Instanzsperre stehen vor `registerEmailIpc` (`app/src/main/index.ts:63-68`, `app/src/main/index.ts:11989-12001`). Die bestehende, ausdrücklich ausgenommene Dev-Profil-Isolation greift allerdings schon vor `app.name` auf `userData` zu (`app/src/main/index.ts:38-43`). Diese positiven Befunde heben die folgenden Lücken nicht auf.

### F01 — Alter Passwort-IPC entschlüsselt den Microsoft-Cache für den Renderer
Schwere: kritisch
ADR-Stelle: app/src/main/email/ipc.ts:171
Status: [OFFEN]

`email-load-password` nimmt eine beliebige `accountId`, liest `email-${accountId}.enc`, entschlüsselt mit demselben `safeStorage` und gibt den Klartext per IPC zurück (`app/src/main/email/ipc.ts:54-55`, `app/src/main/email/ipc.ts:126-133`, `app/src/main/email/ipc.ts:171-174`). Der neue MSAL-Cache heißt `email-microsoft-cache-<SHA256(clientId|tenant)[0:20]>.enc` und verwendet genau dieselbe Verschlüsselung (`app/src/main/email/microsoftAuth.ts:205-206`, `app/src/main/email/ipc.ts:179-184`). MSAL serialisiert seinen Cache als JSON mit gespeicherten Token-Einträgen (`app/node_modules/@azure/msal-node/dist/cache/TokenCache.mjs:42-56`, `app/node_modules/@azure/msal-common/dist/cache/CacheManager.mjs:222-224`). Für die mitgelieferte ID und `organizations` ist der passende alte IPC-Parameter berechenbar: `microsoft-cache-339c9ef9e2e96785ff74`. So verlässt der serialisierte MSAL-Cache einschließlich eventuell gespeicherter Erneuerungsmarken den Main-Prozess. Mit `accountId = 'microsoft-accounts'` lässt sich auch die Bindungsdatei lesen. Umgekehrt kann `email-save-password` beide Dateien mit vom Renderer geliefertem, verschlüsseltem Inhalt überschreiben (`app/src/main/email/ipc.ts:155-164`). Die Aussage „Marken nie über IPC“ ist damit falsch, obwohl die drei neuen Handler keine Marke zurückgeben.

Vorschlag: Den alten Passwort-IPC auf tatsächlich registrierte Passwort-Konto-IDs beschränken und die Microsoft-Dateien in einen getrennten, über diesen Pfad unerreichbaren Namensraum legen; Lesen und Schreiben adversarial testen.

### F02 — Bestehende IMAP- und SMTP-Handler umgehen die Microsoft-Kontobindung
Schwere: kritisch
ADR-Stelle: app/src/main/email/ipc.ts:221
Status: [OFFEN]

Keiner der acht IMAP-Zugänge und auch `email-send` ruft `isMicrosoftAccount` oder `getImapAuth`/`getGraphToken` auf. Verbindungstest, Ordnerliste und Abruf laden weiter ein Passwort und übernehmen Host, Port, TLS und Benutzer vom Renderer (`app/src/main/email/ipc.ts:221-235`, `app/src/main/email/ipc.ts:249-261`, `app/src/main/email/ipc.ts:929-945`); der Versand lädt ein Passwort und baut einen SMTP-Transporter mit Rendererwerten (`app/src/main/email/ipc.ts:2432-2469`). Die übrigen Passwortstellen stehen bei `ipc.ts:318`, `ipc.ts:419`, `ipc.ts:499`, `ipc.ts:552` und `ipc.ts:2486`. Ein Passwort unter einer Microsoft-Konto-ID kann über den weiterhin offenen `email-save-password`-Handler abgelegt werden (`app/src/main/email/ipc.ts:155-164`); danach laufen diese Handler über den Passwortweg. Ohne Passwort melden sie nur „Kein Passwort gespeichert“, nicht „Anmeldung nötig“. Die neue Bindung schützt derzeit ausschließlich Aufrufer der neuen Modulmethoden.

Vorschlag: Vor Freigabe einer Microsoft-Kontoart sämtliche Mailzugänge im Main an die bindende Kontoart koppeln; Passwort-IPC für diese IDs sperren.

### F03 — Beschädigte Bindungsablage wird zu „unbekannt“ und kann überschrieben werden
Schwere: hoch
ADR-Stelle: app/src/main/email/microsoftAuth.ts:171
Status: [OFFEN]

`readEncrypted` deutet außer `ENOENT` auch Zugriffsfehler und Entschlüsselungsfehler als `null`; ungültiges JSON ergibt still `{}` (`app/src/main/email/microsoftAuth.ts:171-199`). Dadurch liefern `status` und `isMicrosoftAccount` für zuvor gebundene IDs `known:false` beziehungsweise `false` (`app/src/main/email/microsoftAuth.ts:283-284`, `app/src/main/email/microsoftAuth.ts:341-342`, `app/src/main/email/microsoftAuth.ts:367-368`). `logout` meldet für dieselbe ID Erfolg, ohne etwas zu entfernen (`app/src/main/email/microsoftAuth.ts:345-347`). Eine neue Anmeldung liest `{}` und ersetzt die Bindungsdatei mit nur dem neuen Eintrag (`app/src/main/email/microsoftAuth.ts:333-337`). Damit gehen andere Kontobindungen verloren; ein späterer Passwort/Graph-Router, der `false` als Passwortkonto deutet, würde gerade im Fehlerfall auf den falschen Weg fallen. Auf einem neuen Gerät ist die Bindung ebenfalls zunächst unbekannt, weil sie nur unter lokalem `userData` liegt (`app/src/main/email/microsoftAuth.ts:169`, `app/src/main/email/microsoftAuth.ts:191-203`).

Vorschlag: Fehlende, unlesbare und beschädigte Ablage unterscheiden; bei Beschädigung fail-closed bleiben und vor Überschreiben eine Wiederherstellung oder bewusste Neuanlage verlangen. Die Kontoart darf nicht allein aus dem Vorhandensein dieser Datei folgen.

### F04 — Zweite Anwendungs-ID überschreibt dieselbe Konto-ID und hinterlässt alten Cache
Schwere: hoch
ADR-Stelle: app/src/main/email/microsoftAuth.ts:321
Status: [OFFEN]

Die Konto-ID hängt nur von Mandant und lokaler Nutzerkennung ab (`app/src/main/email/microsoftAuth.ts:119-123`, `app/src/main/email/microsoftAuth.ts:321`), die Cache-Datei dagegen von `clientId|tenant` (`app/src/main/email/microsoftAuth.ts:205-206`). Meldet sich derselbe Nutzer einmal mit der Standard- und einmal mit einer eigenen Anwendungs-ID an, ersetzt `bindings[accountId] = binding` die erste Zuordnung (`app/src/main/email/microsoftAuth.ts:329-336`). `logout` entfernt nur den Account aus dem Cache der zuletzt gebundenen Anwendungs-ID (`app/src/main/email/microsoftAuth.ts:345-360`); die erste verschlüsselte Cache-Datei samt Marken bleibt liegen. Ob MSAL bei beiden Registrierungen exakt dieselbe `localAccountId` liefert, ist nicht garantiert; wenn ja, tritt dieser Konflikt unmittelbar auf, wenn nein, verletzt die abgeleitete ID die zugesagte Geräte-/Registrierungsstabilität (siehe F07).

Vorschlag: Wechsel der Anwendungs-ID ausdrücklich als Migration behandeln, alten Cache bereinigen und die Bindung auf Kollisionen prüfen.

### F05 — MSAL-Konto wird nur nach `homeAccountId`, nicht nach Mandant ausgewählt
Schwere: hoch
ADR-Stelle: app/src/main/email/microsoftAuth.ts:246
Status: [OFFEN]

Die Bindung speichert `tenantId` und `objectId`, `findMsalAccount` nimmt aber das erste Cache-Konto mit passender `homeAccountId` (`app/src/main/email/microsoftAuth.ts:58-69`, `app/src/main/email/microsoftAuth.ts:246-249`). Bei mehreren Mandantenprofilen desselben Nutzers können `homeAccountId` gleich und `tenantId`/`localAccountId` verschieden sein; MSAL modelliert solche Tenant-Profile ausdrücklich (`app/node_modules/@azure/msal-common/dist/account/AccountInfo.mjs:29-45`). `acquireTokenSilent` und `removeAccount` erhalten dann gegebenenfalls das falsche Profil (`app/src/main/email/microsoftAuth.ts:255-260`, `app/src/main/email/microsoftAuth.ts:357-360`). Ob die konkrete Kombination im Testmandanten vorkommt, ist nicht gemessen; der Code erzwingt die gespeicherte Mandantenzuordnung jedenfalls nicht.

Vorschlag: Cache-Konto gegen `homeAccountId`, `tenantId` und lokale Konto-ID der Bindung prüfen; einen Gastkonto-/Mehrmandantenfall mit echter MSAL testen.

### F06 — Login, Status und Logout sind nicht als ganze Operationen serialisiert
Schwere: hoch
ADR-Stelle: app/src/main/email/microsoftAuth.ts:155
Status: [OFFEN]

`writeChain` umfasst nur einzelne Schreibblöcke, nicht `login`, `status`, `silentToken` oder den kompletten `logout` (`app/src/main/email/microsoftAuth.ts:155-161`, `app/src/main/email/microsoftAuth.ts:293-365`). Ein bereits laufendes `getImapAuth` kann die Bindung vor `logout` lesen und die Marke erst nach dessen Rückkehr liefern (`app/src/main/email/microsoftAuth.ts:251-260`, `app/src/main/email/microsoftAuth.ts:371-374`). `logout` kann während einer interaktiven Anmeldung noch keine Bindung finden und erfolgreich zurückkehren; der spätere Login schreibt sie danach als `signed-in` (`app/src/main/email/microsoftAuth.ts:333-338`, `app/src/main/email/microsoftAuth.ts:345-347`). Der Cache-Adapter serialisiert nur `afterCacheAccess`-Schreibvorgänge, nicht `beforeCacheAccess` plus MSAL-Operation als Einheit (`app/src/main/email/microsoftAuth.ts:226-233`); parallele Cache-Zugriffe und ein Absturz vor `rename` sind nicht abgedeckt. Zwei App-Instanzen mit verschiedenen Profilen haben getrennte Dateien und Sperren; eine gemeinsame atomare Anmelde-/Abmeldesemantik gibt es zwischen ihnen nicht (`app/src/main/index.ts:38-68`).

Vorschlag: Pro Konto einen Zustands-Lock für Login, Markenabruf und Logout definieren; Cache-Lese-/Schreibzyklus und Abbruchstellen gezielt testen.

### F07 — `localAccountId` ist nicht stets die Entra-Objekt-ID
Schwere: mittel
ADR-Stelle: app/src/main/email/microsoftAuth.ts:318
Status: [OFFEN]

Der Code setzt `account.localAccountId` ohne Prüfung mit der Objekt-ID gleich und leitet daraus die dauerhafte Konto-ID ab (`app/src/main/email/microsoftAuth.ts:119-123`, `app/src/main/email/microsoftAuth.ts:317-326`). Die installierte `@azure/msal-common`-Implementierung belegt jedoch `localAccountId` aus `oid || sub` (`app/node_modules/@azure/msal-common/dist/account/AccountInfo.mjs:29-43`). Fehlt `oid`, ist `sub` laut [Microsofts Claim-Referenz](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference) anwendungsabhängig; die behauptete Stabilität über eigene und Standard-Anwendungs-ID ist dann falsch. Der Fake-Test gibt immer dieselbe erfundene OID zurück (`app/src/main/email/microsoftAuth.test.ts:11-13`, `app/src/main/email/microsoftAuth.test.ts:89-99`).

Vorschlag: Den `oid`-Claim ausdrücklich prüfen oder den unterstützten Identitätsfall enger definieren; Test mit fehlendem `oid` und zwei Anwendungs-IDs ergänzen.

### F08 — Browserabbruch kann die Anmeldung unbegrenzt offen lassen
Schwere: mittel
ADR-Stelle: app/src/main/email/microsoftAuth.ts:299
Status: [OFFEN]

Die echte MSAL-Version wartet nach dem Browseröffnen auf `authCodeListener` (`app/node_modules/@azure/msal-node/dist/client/PublicClientApplication.mjs:147-150`). Das sichtbare `waitForRedirectUri`-Zeitlimit gilt nur für den Start des Loopback-Servers (`app/node_modules/@azure/msal-node/dist/client/PublicClientApplication.mjs:263-275`); der Listener hat im installierten `LoopbackClient` keinen erkennbaren Gesamttimer (`app/node_modules/@azure/msal-node/dist/network/LoopbackClient.mjs:22-27`, `app/node_modules/@azure/msal-node/dist/network/LoopbackClient.mjs:100-135`). Schließt der Nutzer den Browser ohne Rückruf, bleibt `login` daher möglicherweise dauerhaft offen. `classifyMicrosoftError` kennt zwar Abbruch-/Timeout-Texte, setzt aber selbst kein Limit (`app/src/main/email/microsoftAuth.ts:133`, `app/src/main/email/microsoftAuth.ts:293-315`). Ein echter Browserabbruch wurde in den Fake-Tests nicht simuliert.

Vorschlag: Einen kontrollierten Abbruch/Timeout des gesamten interaktiven Vorgangs vorsehen und in der gepackten App prüfen.

### F09 — Linux-Backend und Crash-Dauerhaftigkeit sind nicht nachgewiesen
Schwere: mittel
ADR-Stelle: app/src/main/email/ipc.ts:181
Status: [OFFEN]

Die Freigabe prüft nur `safeStorage.isEncryptionAvailable()` (`app/src/main/email/ipc.ts:179-184`, `app/src/main/email/microsoftAuth.ts:163-166`). [Electron dokumentiert](https://www.electronjs.org/docs/latest/api/safe-storage), dass `basic_text` unter Linux mit einem fest kodierten Passwort keinen Schutz bietet; der Code prüft `getSelectedStorageBackend()` nicht. Ob die hier verwendete Electron-Version bei `basic_text` `isEncryptionAvailable()` als wahr meldet, ist nicht sicher, deshalb ist dies eine zu messende Sicherheitsgrenze, kein nachgewiesener Klartextfall. Außerdem schreibt `writeEncrypted` einen verschlüsselten PID-Temporärpfad und benennt ihn um, ohne `fsync`/Bereinigung eines liegen gebliebenen `.tmp` (`app/src/main/email/microsoftAuth.ts:183-189`). `mode: 0600` gilt beim Anlegen, garantiert aber weder Windows-ACLs noch die Rechte einer bereits vorhandenen Datei. Der Fake-Test prüft nur den erfolgreichen Lauf und das Fehlen von `.tmp` danach (`app/src/main/email/microsoftAuth.test.ts:71-76`, `app/src/main/email/microsoftAuth.test.ts:136-145`).

Vorschlag: Linux-Backend im Zielbuild prüfen, Dateirechte auf Zielsystemen messen und Abbruch zwischen Schreiben und Umbenennen sowie verwaiste Tempdateien testen.

### F10 — Fehlerklassifikation nennt unterschiedliche Ursachen gleich
Schwere: mittel
ADR-Stelle: app/src/main/email/microsoftAuth.ts:125
Status: [OFFEN]

Jedes `access_denied` wird als „Zustimmung abgelehnt“ klassifiziert, auch wenn ein Mandanten- oder Richtlinienfehler vorliegt; `consent_required` und `AADSTS65001` werden pauschal „Neuanmeldung nötig“ (`app/src/main/email/microsoftAuth.ts:130-135`). Die Priorität der Muster macht beispielsweise `{ errorCode: 'access_denied', errorMessage: 'user_cancelled' }` zu `consent-declined` statt `cancelled`. In `silentToken` werden ungeprüfte MSAL-Fehlertexte zwar durch `redactForLog` geschickt, aber dieser Filter ist kein Nachweis, dass ein künftiges Tokenformat nie in einem Fehlertext steht (`app/src/main/email/microsoftAuth.ts:261-265`, `app/src/main/email/microsoftAuth.ts:312-315`, `app/src/shared/logRedaction.ts:35-40`). Die UI bekommt feste Meldungen; die Log-Grenze ist schwächer. Die Tests prüfen nur ausgewählte Fehlercodes (`app/src/main/email/microsoftAuth.test.ts:102-114`).

Vorschlag: Fehler nach konkreten MSAL-Codes und Untercodes priorisieren und im Log nur freigegebene Codes, keine beliebigen Fehlernachrichten ausgeben.

### F11 — Der MSAL-Nachbau beweist die kritischen Integrationen nicht
Schwere: mittel
ADR-Stelle: app/src/main/email/microsoftAuth.test.ts:15
Status: [OFFEN]

Der Fake ruft `openBrowser` mit einer fest erfundenen URL auf, setzt immer genau ein Konto und liefert für die zweite Ressource ohne echte Cache-/Refresh-Logik eine Marke (`app/src/main/email/microsoftAuth.test.ts:22-64`). Sein `removeAccount` überspringt sogar das echte `beforeCacheAccess` (`app/src/main/email/microsoftAuth.test.ts:57-60`, `app/node_modules/@azure/msal-node/dist/cache/TokenCache.mjs:140-153`). Die „Verschlüsselung“ ist nur umkehrbares Base64 mit Zeichenumkehr (`app/src/main/email/microsoftAuth.test.ts:71-79`). Damit beweisen die 17 Tests weder das Verhalten der echten `acquireTokenInteractive`-/`acquireTokenSilent`-Aufrufe über zwei Ressourcen noch PKCE/Loopback-Abbruch, MSAL-Cache-Format, zwei Konten in einem Cache, Mandantenprofile, Widerruf, Dateirechte, parallele Operationen oder den gepackten Build. Vor allem prüfen sie die Kollision mit `email-load-password` und die acht alten IMAP-/SMTP-Handler nicht (`app/src/main/email/ipc.ts:155-174`, `app/src/main/email/ipc.ts:221-261`). Die echte Testanmeldung im ungepackten Build belegt nur einen Gutfall; gepackter Build und andere Betriebssysteme bleiben offen (`docs/codex-collab/microsoft-abschnitt-4a-review.md:29-31`).

Vorschlag: Zuerst einen Integrationstest für F01/F02, danach echte MSAL-Gegenproben für Mehrkonto, Mehrmandant, Logout/Neustart, Widerruf und Fehlerfälle im gepackten Build ergänzen.

### F12 — Geerbte Objektschlüssel gelten als Microsoft-Konten
Schwere: niedrig
ADR-Stelle: app/src/main/email/microsoftAuth.ts:191
Status: [OFFEN]

`loadBindings` liefert ein normales Objekt (`{}`), und `status`, `logout` sowie `isMicrosoftAccount` lesen mit `bindings[accountId]` ohne Prüfung auf einen eigenen Schlüssel (`app/src/main/email/microsoftAuth.ts:191-199`, `app/src/main/email/microsoftAuth.ts:341-347`, `app/src/main/email/microsoftAuth.ts:367-368`). Schon bei leerer Ablage ist daher `isMicrosoftAccount('__proto__')` oder `isMicrosoftAccount('constructor')` wahr; `status` meldet für solche vom Renderer frei übergebbaren IDs `known:true` statt „unbekannt“ (`app/src/main/email/ipc.ts:204-215`). Das ist keine echte Microsoft-Bindung und widerspricht der Kontoart-Erkennung. Der Test verwendet nur eine gewöhnliche unbekannte ID (`app/src/main/email/microsoftAuth.test.ts:191-196`).

Vorschlag: Bindungen als `Object.create(null)` oder `Map` halten und beim Lesen `Object.hasOwn` verwenden; Schlüssel aus der Ablage validieren.

### F13 — Browser- und Konfigurationsprüfung ist nur eine Syntaxgrenze
Schwere: niedrig
ADR-Stelle: app/src/main/email/microsoftAuth.ts:306
Status: [OFFEN]

`GUID_RE` und `TENANT_RE` verbieten Schrägstriche und unerwartete Authority-Pfade, prüfen aber nur die Form, nicht die tatsächlich registrierte Anwendungs-ID oder Mandantenzugehörigkeit (`app/src/main/email/microsoftAuth.ts:116-117`, `app/src/main/email/microsoftAuth.ts:208-213`). `openBrowser` verlangt den exakten Host-Präfix `https://login.microsoftonline.com/` und sperrt damit den im Test geprüften Suffix-Host; Pfad, Mandant, `client_id` und `redirect_uri` der geöffneten URL werden nicht gegen den aufgebauten Antrag geprüft (`app/src/main/email/microsoftAuth.ts:306-309`, `app/src/main/email/microsoftAuth.test.ts:205-210`). Im normalen Ablauf erzeugt MSAL diese URL selbst, daher ist kein konkreter Angriff über den installierten Client belegt. Als Sicherheitsgrenze gegen eine falsch gelieferte Bibliotheks-URL trägt die Kommentar-Aussage „nur die Anmeldeseite“ jedoch weniger, als sie verspricht.

Vorschlag: URL mit `new URL` auf Origin und erwarteten Autorisierungspfad prüfen; Antragparameter bei Bedarf gegen Client-ID, Mandant und lokalen Redirect abgleichen.

## Claude-Antwort

Alle dreizehn Befunde tragen. Nachgestellt bzw. nachgeschlagen: F01 (Pfadrechnung, Handler), F02,
F12 (`({})['constructor']`), der Dev-Profil-Zugriff vor `app.name` (Altbestand, nicht von diesem
Commit). Vom Nutzer am 10.11.2026 freigegeben: alles beheben, F11 mit Tests für die kritischen
Fälle, echte Proben am gepackten Build.

- **F01 [ADRESSIERT]** — zwei Teile. (a) Die Lücke bestand unabhängig von Microsoft: die Konto-ID
  ging ungeprüft in den Pfad, `x/../openrouter` las `openrouter.enc`. Behoben auf master in
  `1dc52ddd` (`app/src/main/email/credentialPath.ts`, Tests). (b) Die Microsoft-Ablage liegt jetzt
  im Unterordner `microsoft-auth/`; die geprüfte ID kann keinen Schrägstrich tragen. In der
  gebauten App gegengeprüft: `x/../microsoft-auth/accounts` und der Cache-Name liefern `null`.
- **F02 [ADRESSIERT, teilweise]** — `emailCredentialFileName` wirft für IDs in Microsoft-Form; damit
  kann weder ein Passwort unter einer Microsoft-ID abgelegt noch gelesen werden, und alle
  Passwort-Zweige enden für solche Konten mit „Kein Passwort gespeichert“ (fail-closed). Das
  Umleiten der acht IMAP-Zugänge und des Versands auf die Marke ist Plan-Abschnitt 5/6 und steht aus.
- **F03 [ADRESSIERT]** — Fehlend (`ENOENT`) und unlesbar sind getrennt; unlesbar, kein JSON oder
  kein Objekt ergibt `storage-unreadable`, auch in `login` (vor dem Öffnen des Browsers) und
  `logout`. Die Datei wird dabei nicht verändert (Test vergleicht die Bytes). Die Kontoart folgt
  aus der Form der ID, nicht aus der Datei; eine Microsoft-ID ohne Ablage ist `reauth-required`.
- **F04 [ADRESSIERT]** — beim Wechsel von Anwendungs-ID oder Mandant wird das Konto aus dem Cache
  der alten Registrierung entfernt.
- **F05 [ADRESSIERT]** — Abgleich über `homeAccountId`, `tenantId` und `localAccountId`; Test mit
  zwei Mandantenprofilen bei gleicher `homeAccountId`.
- **F06 [ADRESSIERT, teilweise]** — Abmelden erhöht zuerst einen Zähler im Speicher; ein
  Markenabruf, der davor begann, gibt danach nichts heraus (Test). Immer nur eine Anmeldung, eine
  zweite gibt die erste auf. Nicht gelöst: Abmelden WÄHREND einer noch laufenden Anmeldung desselben
  Kontos — die Anmeldung gewinnt, weil sie später abgeschlossen wird. Halte ich für richtig, ist
  aber eine Entscheidung. Zwei App-Instanzen mit demselben Profil verhindert die Instanzsperre.
- **F07 [ADRESSIERT]** — die Anmeldung verlangt den `oid`-Claim und dessen Gleichheit mit
  `localAccountId`; sonst Abbruch, Konto wieder aus dem Cache. Mit der echten Bibliothek ergab die
  zweite Anmeldung desselben Kontos dieselbe ID wie die erste.
- **F08 [ADRESSIERT]** — Zeitlimit fünf Minuten, `cancelLogin` samt IPC; eine aufgegebene
  Anmeldung, die später doch ankommt, wird verworfen und ihr Konto aus dem Cache genommen. Der
  Loopback-Listener der Bibliothek bleibt bis dahin offen; schließen kann ich ihn nicht.
- **F09 [ADRESSIERT, teilweise]** — Linux mit Backend `basic_text` zählt nicht als Verschlüsselung;
  Schreiben mit `fsync`, Schreibreste werden beim ersten Zugriff entfernt, Ordner `0700`. Nicht
  gemessen: Verhalten auf einem echten Linux- und Windows-System.
- **F10 [ADRESSIERT]** — Reihenfolge nach Priorität, eigene Codes `consent-required`,
  `access-denied`, `offline`, `timeout`; AADSTS-Nummern als ganze Zahl. Im Log steht nur noch das
  Codewort der Bibliothek, nie eine Fehlernachricht.
- **F11 [ADRESSIERT, teilweise]** — 31 Tests, je Befund mindestens einer; der Dateikopf sagt, was
  der Nachbau nicht belegt. Mit der echten Bibliothek in der gebauten (nicht gepackten) App
  geprüft: Anmeldung, Neustart, Abbrechen, Abmelden, Neustart nach Abmelden, Querlesen über den
  Passwort-IPC. Offen für den gepackten Build: zwei Konten, Gastkonto, Widerruf, Zeitlimit.
- **F12 [ADRESSIERT]** — Bindungen als `Map`, nur IDs in Microsoft-Form, die zu Mandant und Objekt
  des Eintrags passen.
- **F13 [ADRESSIERT]** — Prüfung mit `new URL`: Herkunft, Pfad `/<Mandant>/oauth2/v2.0/authorize`,
  `client_id`, lokaler `redirect_uri`.

Nicht Teil dieses Commits: der Dev-Profil-Zugriff vor `app.name` (`app/src/main/index.ts:38-43`).

## Status

Runde 1 beantwortet, Korrekturen umgesetzt. Abnahme des Nutzers offen.
