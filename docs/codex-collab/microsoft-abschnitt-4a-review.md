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

### Runde 2

### F14 — Passwort-IDs kollidieren bei Groß-/Kleinschreibung
Schwere: mittel
ADR-Stelle: app/src/main/email/credentialPath.ts:16
Status: [OFFEN]

Die neue Prüfung schließt Pfadtrenner, Unicode und Längen über 80 Zeichen aus; `email-` als Dateipräfix verhindert auch Windows-Gerätenamen als ganzen Dateinamen (`app/src/main/email/credentialPath.ts:16-30`). Sie erlaubt aber `Konto_2-b` und `konto_2-b` als verschiedene IDs, deren `email-<id>.enc` auf einem nicht zwischen Groß- und Kleinschreibung unterscheidenden macOS-/Windows-Dateisystem dieselbe Datei ist. `email-save-password` schreibt diese Datei und `email-load-password` gibt ihren entschlüsselten Inhalt zurück (`app/src/main/email/ipc.ts:130-135`, `app/src/main/email/ipc.ts:159-177`). Damit trennt die Prüfung zwei zulässige Passwort-Konten dort nicht. Die App erzeugt derzeit Zeitstempel-IDs (`app/src/renderer/components/Settings/EmailSettingsTab.tsx:179-180`); die IPC-Grenze akzeptiert aber auch andere Renderer-IDs. Der Test erklärt Großbuchstaben ausdrücklich für zulässig, prüft keine Kollision (`app/src/main/email/credentialPath.test.ts:6-9`, `app/src/main/email/credentialPath.test.ts:20-25`).

Vorschlag: IDs an der IPC-Grenze kanonisieren oder auf ein eindeutiges, nur kleingeschriebenes Format begrenzen; Bestandskonten vor einer Migration berücksichtigen.

### F15 — Abmeldung kann einen schon geladenen Bindungszustand überholen
Schwere: hoch
ADR-Stelle: app/src/main/email/microsoftAuth.ts:375
Status: [OFFEN]

Die Antwort auf F06 verspricht, dass ein vor der Abmeldung begonnener Markenabruf danach nichts mehr herausgibt. `getImapAuth`/`getGraphToken` lesen jedoch zuerst die Bindung, und `silentToken` merkt den Widerrufszähler erst danach (`app/src/main/email/microsoftAuth.ts:397-402`, `app/src/main/email/microsoftAuth.ts:375-391`, `app/src/main/email/microsoftAuth.ts:570-579`). Beginnt `logout` zwischen diesen Schritten, erhöht es den Zähler und setzt die Bindung auf `signed-out` (`app/src/main/email/microsoftAuth.ts:548-560`); der Abruf kann anschließend mit der alten `signed-in`-Bindung den bereits erhöhten Zähler übernehmen. Ändert er sich bis zur Rückgabe nicht erneut, besteht die Schlussprüfung und eine Marke kann nach der Abmeldung an den aufrufenden Main-Code zurückgehen. Die Tests decken nur einen Abruf ab, der bereits in `acquireTokenSilent` hängt, nicht diese Lücke zwischen Bindungslesen und Zähleraufnahme.

Vorschlag: Zähler vor dem Bindungslesen erfassen und nach dem Markenabruf vergleichen, oder Bindungslesen, Markenabruf und Abmeldung pro Konto koordinieren.

### F16 — Beschädigter Eintrag sperrt alle Konten ohne Reparaturweg
Schwere: mittel
ADR-Stelle: app/src/main/email/microsoftAuth.ts:299
Status: [OFFEN]

F03 ist gegen stillen Datenverlust gehärtet, aber jetzt macht jeder ungültige Eintrag die gesamte `accounts.enc` unlesbar (`app/src/main/email/microsoftAuth.ts:299-309`). `login` bricht vor dem Browser ab, `status` meldet nur einen Fehler und `logout` kann ebenfalls keine Bindung entfernen (`app/src/main/email/microsoftAuth.ts:450-452`, `app/src/main/email/microsoftAuth.ts:539-559`). Ein einzelner beschädigter oder veralteter Eintrag sperrt so auch intakte Konten; die neue Einstellungsseite entfernt eine Karte erst nach erfolgreichem `logout` (`app/src/renderer/components/Settings/EmailMicrosoftAccounts.tsx:109-116`). Es gibt in diesen Pfaden keinen Export, Quarantäne- oder Zurücksetzungsweg für den Nutzer. Die Antwort auf F03 ist damit als Schutz vor Überschreiben tragfähig, aber nicht als wiederherstellbarer Zustand.

Vorschlag: Einen bewusst ausgelösten, sicheren Reparaturpfad mit Sicherung der verschlüsselten Originaldatei vorsehen; intakte Einträge nicht still verlieren.

### F17 — Nach Annahme durch Graph kann die Erfolgsantwort hängen
Schwere: hoch
ADR-Stelle: app/src/main/email/graphSend.ts:154
Status: [OFFEN]

Nach HTTP `202` wartet `sendViaGraph` vor der Rückgabe auf `locateSentCopy` (`app/src/main/email/graphSend.ts:135-161`). Diese Funktion verbindet sich erneut per IMAP, listet Ordner und sucht bis zu viermal unter Mailbox-Lock; die 2,5-Sekunden-Pausen und der Socket-Timeout sind keine Gesamtfrist für den gesamten Ablauf (`app/src/main/email/ipc.ts:2448-2472`). Hängt ein IMAP-Befehl oder dauert die Suche lange, bleibt `email-send` offen, obwohl Microsoft die Mail bereits angenommen hat. Ein Benutzer kann nach scheinbarem Stillstand erneut senden; der Erfolg ist bis zur Rückgabe weder im Store noch im Banner sichtbar (`app/src/renderer/stores/emailStore.ts:1017-1037`). Der Test deckt nur sofort auflösende Such-Fakes ab (`app/src/main/email/graphSend.test.ts:150-157`).

Vorschlag: Den angenommenen Versand unabhängig von der Suche sofort als Erfolg festhalten und die UID später ergänzen, oder die Suche mit einer harten Gesamtfrist und eindeutigem Ergebnis beenden.

### F18 — Erneut anmelden kann unbemerkt ein anderes Konto binden
Schwere: mittel
ADR-Stelle: app/src/renderer/components/Settings/EmailMicrosoftAccounts.tsx:37
Status: [OFFEN]

Die Karte ruft `signIn(account.id)` auf, doch der Hook legt das vom Browser gelieferte Konto bereits in `email.accounts` an oder ersetzt es, bevor er `expectedAccountId` vergleicht (`app/src/renderer/components/Settings/EmailMicrosoftAccounts.tsx:43-69`, `app/src/renderer/components/Settings/EmailMicrosoftAccounts.tsx:136-140`). Bei Auswahl eines anderen Microsoft-Kontos bleibt die alte Karte bestehen und eine neue erscheint; die Meldung `other-account` ist nur ein nachträglicher Hinweis. Die Anmeldung im Main bindet das neue Konto ebenfalls sofort (`app/src/main/email/microsoftAuth.ts:509-532`). Wer auf der alten Karte „Erneut anmelden“ klickt, kann dadurch einen zweiten Zugang schaffen, obwohl die Aktion auf das bestehende Konto zielt.

Vorschlag: Die erwartete ID vor der Bindungsübernahme prüfen oder die Aktion explizit als „weiteres Konto hinzufügen“ bestätigen lassen; hierfür braucht der Main eine passende Vertragsgrenze.

### F19 — Abbruchknopf einer Karte kann eine andere Anmeldung beenden
Schwere: mittel
ADR-Stelle: app/src/renderer/components/Settings/EmailMicrosoftAccounts.tsx:78
Status: [OFFEN]

Jede Microsoft-Karte und die Hinzufügen-Zeile erzeugen einen eigenen Hook mit lokalem `pending` (`app/src/renderer/components/Settings/EmailMicrosoftAccounts.tsx:33-35`, `app/src/renderer/components/Settings/EmailMicrosoftAccounts.tsx:92`, `app/src/renderer/components/Settings/EmailMicrosoftAccounts.tsx:170-179`). `cancel()` schickt dagegen einen globalen IPC-Aufruf ohne Versuchskennung; im Main bricht er die jeweils aktuelle `activeLogin` ab (`app/src/main/email/ipc.ts:217-220`, `app/src/main/email/microsoftAuth.ts:535-536`). Startet B, während A noch auf Antwort wartet, kann der weiterhin sichtbare Abbruchknopf von A die Anmeldung von B beenden. Ein Klick ist damit nicht dem angezeigten Vorgang zugeordnet.

Vorschlag: Eine Versuchskennung durch UI und IPC führen oder alle Anmeldeknöpfe und Abbruchknöpfe über einen gemeinsamen Zustand koordinieren.

### F20 — Unklarer Graph-Versand wird im Schreibfenster wie eine sichere Absage behandelt
Schwere: hoch
ADR-Stelle: app/src/renderer/components/InboxPanel/ComposeView.tsx:298
Status: [OFFEN]

Graph liefert bei Verbindungsabbruch nach dem Abschicken oder bei Serverfehler `success:false, uncertain:true` samt Message-ID (`app/src/main/email/graphSend.ts:125-151`). Der Store reicht das Ergebnis zwar durch (`app/src/renderer/stores/emailStore.ts:1017-1077`), das Schreibfenster prüft aber nur `success` und zeigt die allgemeine Fehlerdarstellung (`app/src/renderer/components/InboxPanel/ComposeView.tsx:298-302`). Der Entwurf bleibt sendbar; ein erneuter Klick kann eine zweite Mail erzeugen. Der Fehlertext fordert zwar zum Nachsehen im Ordner „Gesendet“ auf, doch `uncertain` und die Message-ID werden nicht als Zustand gespeichert oder für eine Nachprüfung verwendet. Das ist gerade bei verzögerter Gesendet-Kopie ein realer Doppelversandpfad.

Vorschlag: Einen gesonderten unklaren Versandzustand mit Message-ID im Entwurf führen und erneutes Senden erst nach bewusstem Entscheid ermöglichen.

### F21 — Größenprüfung erfolgt erst nach vollständigem Einlesen aller Anhänge
Schwere: mittel
ADR-Stelle: app/src/main/email/graphSend.ts:106
Status: [OFFEN]

Die 25-MB-Grenze wird erst nach `renderRawMessage(mailOptions)` geprüft (`app/src/main/email/graphSend.ts:106-111`). Dieser Aufruf lässt Nodemailer alle Anhangdateien in einen `Buffer` serialisieren (`app/src/main/email/outgoing.ts:65-68`, `app/src/main/email/outgoing.ts:155-159`); anschließend entsteht für den Graph-Request noch eine Base64-Zeichenkette (`app/src/main/email/graphSend.ts:119-123`). Bei einem sehr großen Anhang kann der Main-Prozess daher viel Speicher verbrauchen oder scheitern, bevor die freundliche Größenabsage möglich ist. `findMissingAttachments` prüft nur Erreichbarkeit, nicht Größe (`app/src/main/email/outgoing.ts:30-41`). Der Test verwendet nur einen großen Mailtext mit künstlich kleiner Grenze, keinen großen Dateianhang (`app/src/main/email/graphSend.test.ts:98-105`).

Vorschlag: Gesamtgröße der Dateien vor dem MIME-Aufbau konservativ abschätzen und große Anhänge früh abweisen; die tatsächliche MIME-Grenze danach beibehalten.

### F22 — Alte Marken können beim Registrierungswechsel erhalten bleiben
Schwere: mittel
ADR-Stelle: app/src/main/email/microsoftAuth.ts:529
Status: [OFFEN]

Die Antwort auf F04 behauptet, beim Wechsel der Anwendungs-ID oder des Mandanten werde das alte Cache-Konto entfernt. Der Code schreibt zuerst die neue Bindung und unterdrückt danach jeden Fehler von `removeFromCache(previous)` mit einer Warnung (`app/src/main/email/microsoftAuth.ts:521-532`). Die Anmeldung meldet also Erfolg, obwohl der alte verschlüsselte Cache samt erneuerbarer Marke auf der Platte bleiben kann (`app/src/main/email/microsoftAuth.ts:337-346`, `app/src/main/email/microsoftAuth.ts:369-373`). Ein späteres `logout` entfernt nur das Konto aus dem Cache der *neuen* Bindung (`app/src/main/email/microsoftAuth.ts:552-566`). Der F04-Test prüft nur die erfolgreiche Entfernung (`app/src/main/email/microsoftAuth.test.ts:397-410`).

Vorschlag: Fehlgeschlagene Alt-Cache-Bereinigung als überprüfbaren Zustand festhalten und beim nächsten Start/Logout erneut versuchen; Erfolg nicht als vollständige Bereinigung darstellen.

### F23 — Der entscheidende Handler ist weiterhin nicht als Ganzes geprüft
Schwere: mittel
ADR-Stelle: app/src/main/email/ipc.ts:2507
Status: [OFFEN]

`chooseSendTransport` ist isoliert getestet (`app/src/shared/emailAccountKind.test.ts:17-35`), `sendViaGraph` mit nachgebautem `fetch` und nachgebauter Gesendet-Suche (`app/src/main/email/graphSend.test.ts:25-38`, `app/src/main/email/graphSend.test.ts:150-164`). Der tatsächliche `email-send`-Handler verbindet beides jedoch mit Empfängerprüfung, IPC-Rückgaben, Fehlerfang, Passwortzweig und IMAP-Append (`app/src/main/email/ipc.ts:2499-2541`, `app/src/main/email/ipc.ts:2543-2640`). Es gibt für diesen Handler keinen Test, der bei widersprüchlichen IDs sicher nur einen Transport beobachtet oder nach `202` einen langsamen/fehlerhaften IMAP-Abgleich und einen UI-Neustart prüft. Die Aussage „je Aufruf genau ein Transportweg“ ist für die reine Wahlfunktion belegt, nicht für die gesamte Nebenwirkungskette.

Vorschlag: Den Handler mit kontrollierten SMTP-, Graph- und IMAP-Adaptern prüfen; insbesondere Annahme durch Graph plus Ausfall der Gesendet-Suche und beide ID-Widersprüche abdecken.

### F24 — Graph-Zeitlimit endet vor dem Lesen der Fehlerantwort
Schwere: mittel
ADR-Stelle: app/src/main/email/graphSend.ts:131
Status: [OFFEN]

Der `AbortController` überwacht nur das Warten auf `fetch(...)`; im `finally` wird sein Timer sofort gelöscht (`app/src/main/email/graphSend.ts:114-133`). Bei einem Status ungleich `202` wird danach `response.text()` ohne Frist gelesen (`app/src/main/email/graphSend.ts:135-151`). Trifft ein Fehlerstatus mit langsamem oder nie abgeschlossenem Body ein, hängt `email-send` trotz nomineller 180-Sekunden-Grenze. Bei einem `5xx` ist zudem gerade unklar, ob Microsoft die Mail bereits angenommen hat; der UI-Entwurf bleibt in einem unentschiedenen, weiterhin sendbaren Zustand. Die Tests benutzen fertige `Response`-Bodies, keinen stockenden Body (`app/src/main/email/graphSend.test.ts:107-127`).

Vorschlag: Den Abort bis nach dem begrenzten Lesen der Antwort aktiv lassen und die maximale Fehlerbody-Größe begrenzen; bei ausbleibender Antwort den unklaren Zustand mit Message-ID melden.

### F25 — Verspätete Anmeldung kann die neue Anmeldung aus dem Cache entfernen
Schwere: hoch
ADR-Stelle: app/src/main/email/microsoftAuth.ts:478
Status: [OFFEN]

Wird Anmeldung A durch B aufgegeben, entfernt der späte Erfolg von A das MSAL-Konto, solange `loadBindings()` noch keine `signed-in`-Bindung derselben Registrierung sieht (`app/src/main/email/microsoftAuth.ts:475-487`). B schreibt diese Bindung aber erst *nach* dem erfolgreichen interaktiven Ergebnis und weiteren `await`-Schritten (`app/src/main/email/microsoftAuth.ts:489-525`). Kommt A genau in diesem Fenster mit demselben MSAL-Konto zurück, kann `removeAccount` dessen Cache-Eintrag entfernen, den B für die anschließende stille Erneuerung braucht. B kann dann bereits eine Konto-ID an die Oberfläche liefern, deren Abruf-/Versandstatus fehlende Marken meldet (`app/src/main/email/microsoftAuth.ts:529-532`). Der vorhandene Test gibt A erst frei, nachdem `await auth.login()` für B vollständig zurückgekehrt ist (`app/src/main/email/microsoftAuth.test.ts:436-448`); er beweist diese Überschneidung nicht. Ob die echte Bibliothek die beiden interaktiven Vorgänge am selben Client in diesem Zeitfenster zulässt, ist nicht gemessen.

Vorschlag: Verspätete Ergebnisse und Bindungsänderungen je Cache-Konto serialisieren; den Race-Test so steuern, dass A während Bs Bindungsschreiben endet, und mit echter MSAL im gepackten Build gegenprüfen.

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

### Antworten auf Runde 2 (Nachtlauf 10./11.11.2026)

Der Nutzer hat für diese Nacht auf die Vorlage verzichtet („erledigt alles“). Umgesetzt ist, was
trägt und eindeutig zu beheben war; liegen geblieben ist, was eine Produktentscheidung braucht oder
bestehende Passwort-Konten berührt. Alle zwölf Befunde tragen.

- **F14 [DISKUSSION]** — trägt. Nicht umgesetzt: Eine Beschränkung auf Kleinbuchstaben ändert, welche
  Konto-IDs bestehender Passwort-Konten gelten; ob es Altbestand mit Großbuchstaben gibt, weiß ich
  nicht. Kein neuer Zugriff: Wer `Konto` abfragen kann, kann auch `konto` abfragen. Entscheidung
  des Nutzers.
- **F15 [ADRESSIERT]** — `getImapAuth`/`getGraphToken` erfassen den Widerrufszähler vor dem Lesen der
  Bindung und reichen ihn an `silentToken`. Test löst die Abmeldung genau während des Bindungslesens
  aus; per Gegenprobe belegt, dass er ohne die Korrektur fehlschlägt.
- **F16 [ADRESSIERT]** — `resetStorage()` verschiebt alle Dateien der Ablage unverändert in einen
  Unterordner `zurueckgesetzt-<Zeit>` (nichts wird gelöscht), IPC `email-microsoft-reset-storage`,
  in der Karte und der Hinzufügen-Zeile ein Hinweis mit Knopf, der nur bei `storage-unreadable`
  erscheint. Danach meldet jedes Konto „Anmeldung nötig“. Nur per Test geprüft, nicht an der
  laufenden App (hätte das Testkonto des Nutzers abgemeldet).
- **F17 [ADRESSIERT]** — die Suche nach der Gesendet-Kopie hat in `sendViaGraph` eine harte Frist
  (`GRAPH_LOCATE_TIMEOUT_MS`, 12 s); hängt sie, kommt der Erfolg trotzdem zurück. Die IMAP-Verbindung
  der hängenden Suche läuft in ihr eigenes Socket-Zeitlimit.
- **F18 [ADRESSIERT]** — `login({ expectedAccountId })`: ergibt die Anmeldung ein anderes Konto, wird
  nichts gebunden und das fremde Konto wieder aus dem Cache genommen (außer es war schon eingerichtet
  und angemeldet), Fehler `account-mismatch`. Das Microsoft-Fenster ist mit dem erwarteten Konto
  vorbelegt (`loginHint`). Die Oberfläche legt bei einer Karte kein Konto mehr an.
- **F19 [ADRESSIERT]** — ein gemeinsamer Anmeldezustand für alle Karten und die Hinzufügen-Zeile:
  läuft eine Anmeldung, sind die übrigen Anmeldeknöpfe gesperrt, und „Abbrechen“ wirkt nur dort, wo
  sie gestartet wurde. Nur per Typprüfung und Build geprüft, nicht auf dem Bildschirm.
- **F20 [ADRESSIERT]** — das Schreibfenster merkt sich einen unklaren Versand je Entwurf; der nächste
  Klick auf „Senden“ verlangt eine ausdrückliche Bestätigung („Erst nachsehen“ / „Trotzdem erneut
  senden“). Die Message-ID wird nicht für eine automatische Nachprüfung benutzt. Nicht auf dem
  Bildschirm geprüft.
- **F21 [ADRESSIERT]** — Größe wird vor dem Aufbau aus den Dateigrößen abgeschätzt (Faktor 1,37);
  Test mit einer dünn besetzten 60-MB-Datei: Absage ohne Einlesen, ohne Markenabruf.
- **F22 [ADRESSIERT]** — scheitert das Entfernen aus dem Cache einer früheren Registrierung, steht sie
  als `stale` an der Bindung und wird bei jeder An- und Abmeldung erneut versucht; die Abmeldung
  meldet ehrlich, wenn etwas liegen bleibt.
- **F23 [DISKUSSION]** — trägt. Nicht umgesetzt: Ein Test des ganzen Handlers verlangt, den SMTP-Zweig
  aus `ipc.ts` herauszulösen — eine Änderung am Versand aller bestehenden Konten, die ich nicht
  ohne Gegenprobe des Nutzers machen wollte.
- **F24 [ADRESSIERT]** — die Frist bleibt aktiv, bis die Antwort samt Fehlertext gelesen ist; kommt
  der Text nicht, entscheidet der Status allein (5xx bleibt „unklar“).
- **F25 [ADRESSIERT, Beweis fehlt]** — ein Cache-Konto, das eine nicht aufgegebene Anmeldung
  erworben hat, wird synchron vermerkt (`claimed`), bevor irgendetwas anderes läuft; eine verspätete
  aufgegebene Anmeldung nimmt es nicht weg. Der zugehörige Test besteht aber auch OHNE die Korrektur
  (Gegenprobe gemacht): Mit dem nachgebauten Client lässt sich das Zeitfenster nicht herstellen.
  Belegt ist also das gewünschte Verhalten, nicht die Schließung der Lücke.

Geprüft: typecheck, build, vitest gesamt 3732 grün (shellExecution.test.ts im Gesamtlauf ein
Zeitlimit-Ausfall, einzeln grün). Gebaute App mit dem Testprofil des Nutzers, nur lesend: das zuvor
angemeldete Konto ist weiter berechtigt (alte Bindung ohne `stale` wird gelesen), Verbindungstest
und Ordnerliste gehen, ein vom Renderer genannter fremder Server wird nicht kontaktiert.

## Status

Runde 2 beantwortet (Nachtlauf). Offen für den Nutzer: F14, F23; Sichtprüfung der Oberfläche zu F16, F19, F20.
