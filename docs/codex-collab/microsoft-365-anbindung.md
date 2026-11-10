# Microsoft-365-Postfächer anbinden (Behörden und Schulen)

Stand: 10.11.2026, **Fassung 3 (Mischform, nach zwei Prüfrunden)** · Bauender: Claude · Prüfer: Codex · Abnahme: Nutzer

> Fassung 1 wollte den ganzen Mailverkehr über Graph führen. Nach Codex' Runde 1 (F01–F13) und
> den Messungen am Testmandanten hat der Nutzer am 10.11.2026 die **Mischform** entschieden:
> Abruf weiter über IMAP mit neuer Anmeldung, Versand über Graph. Die Findings der Runde 1 stehen
> unverändert unten; die Antworten darauf im Abschnitt „Claude-Antwort“.

## Aufgabe

Fassung 2 prüfen, **bevor** Code entsteht. Gesucht sind Denkfehler, übersehene Stellen im Code und
Annahmen über Microsoft, die nicht stimmen. Keine Code-Edits im Review. Neue Findings ab **F14**.

## Kontext/Anker

Gegen den echten Code prüfen, nicht gegen diesen Text.

- Verbindungsstellen in `app/src/main/email/ipc.ts`: `new ImapFlow` in Zeile 182, 212, 282, 387,
  470, 527, 916 und 2546; `nodemailer.createTransport` in Zeile 2437; roher MIME-Aufbau für die
  Gesendet-Kopie über `streamTransport` in Zeile 2541; BCC-Behandlung Zeile 2508–2511.
- Handler dort: `email-save-password`/`email-load-password` :151–170 · `email-connect` :173 ·
  `email-list-folders` :204 · `email-move` :255 · `email-fetch-attachments` :365 ·
  `email-set-flags` :441 · `email-stage-forward-attachments` :506 · `email-fetch` :869 ·
  `email-send` :2375. Anmeldung der Handler in `app/src/main/index.ts` über `registerEmailIpc({...})`.
- Kontotyp doppelt: `app/src/shared/types.ts:1818` (`EmailAccount`) und
  `app/src/renderer/stores/uiStore.ts:350`.
- Passwort geht an den Renderer zurück: `app/src/main/preload.ts:721`, genutzt in
  `renderer/components/Settings/EmailSettingsTab.tsx:62` und `CredentialsSettings.tsx:52`.
- Nachträgliches Eintragen der Servernummer einer schon bekannten Mail:
  `app/src/shared/emailSync.ts:87–108`. Lokale Gesendet-Kopie:
  `app/src/renderer/stores/emailStore.ts:1033–1057`.
- Konsole mit ganzen Einstellungen: `app/src/renderer/stores/uiStore.ts:1753`, `:2046`.
- Einrichtung: `app/src/renderer/components/Onboarding/steps/EmailSetupStep.tsx` (Voreinstellung
  Zeile 48, Passwortweg Zeile 93–118, Konto-ID aus `Date.now()` Zeile 81),
  `app/src/renderer/components/Settings/EmailSettingsTab.tsx`.
- Regeln: `.claude/rules/email.md`, `CLAUDE.md` (Abschnitte IPC-Kommunikation, Instanzsperre,
  Sicherheit).

## Was gemessen ist (Einzelheiten unter „Claude-Antwort“)

Testmandant mit Standardeinstellungen, App frisch registriert, Herausgeber nicht geprüft.

| Frage | Ergebnis |
|---|---|
| Passwort-Anmeldung IMAP / SMTP | abgelehnt; SMTP-Anmeldung für den ganzen Mandanten aus |
| Normaler Nutzer stimmt selbst zu | nein, „Administratorgenehmigung erforderlich“ |
| IMAP mit OAuth nach Administratorzustimmung | funktioniert |
| Graph `sendMail` nach Administratorzustimmung | 202, Mail kam an |
| Authorization Code + PKCE, Systembrowser, `http://localhost:<Port>` | funktioniert |

## Entscheidungen der Fassung 2

| # | Entscheidung | Begründung |
|---|---|---|
| E1 | **Abruf über IMAP mit OAuth (XOAUTH2), Versand über Graph.** Graph-Abruf ist nicht Teil dieses Plans. | Gemessen: beides geht. Speicher, Abgleich, Mailnummern, Grabsteine bleiben unberührt; F02–F05 und F07 entfallen für diesen Plan |
| E2 | Anmeldeart am Konto: `auth?: 'password' \| 'microsoft'`, fehlend = `password`. In **beiden** Kontotypen (`types.ts`, `uiStore.ts`). Das Feld ist nur Anzeige: **welchen Weg der Main nimmt, entscheidet der Main** daran, ob er für die Konto-ID eine Microsoft-Anmeldung abgelegt hat | Renderer soll die Anmeldeart nicht vorgeben können (F01, F10) |
| E3 | Anmeldung im Systembrowser, Authorization Code mit PKCE, öffentlicher Client, Rückweg `http://localhost:<Port>`, nur an die lokale Schleife gebunden | gemessen |
| E4 | Marken nur im Main. Kein IPC gibt je eine Marke zurück. Ablage mit `safeStorage` unter userData, je Konto eine Datei; Abmelden und Konto-Entfernen löschen sie | F10, F12 |
| E5 | Konto-ID für Microsoft-Konten **abgeleitet** aus Mandanten-ID und Objekt-ID des Nutzers (aus der Anmeldung), nicht aus `Date.now()` | gleiche ID auf jedem Gerät, Mails und Merker passen ohne Zuordnung (F12). Bestehende Passwort-Konten bleiben, wie sie sind |
| E6 | Rechte: `offline_access`, `User.Read`, `https://outlook.office.com/IMAP.AccessAsUser.All`, `Mail.Send`. **Kein** `Mail.ReadWrite` | Mischform braucht es nicht; kleiner Antrag an den Administrator |
| E7 | Anwendungs-ID: mitgelieferter Standard und Felder „Eigene Anwendungs-ID“/„Mandant“ in den Einstellungen | Organisationen, die nur eigene Registrierungen zulassen |
| E8 | **`@azure/msal-node`** für Anmeldung, stille Erneuerung und Kontenverwaltung; eigener Cache-Adapter schreibt über `safeStorage` | F10. Der Eigenbau der Messung deckt nur den Gutfall. Neue Abhängigkeit: danach `npm audit` |
| E9 | Versand als **MIME** an Graph: derselbe `nodemailer`-Aufbau wie heute, Ausgabe über `streamTransport`, dann `POST /me/sendMail`. Kein IMAP-Append für Microsoft-Konten (Graph legt selbst ab) | Message-ID, Antwort-Kopfzeilen, Signaturbild, Anhänge bleiben ein Code-Pfad. **Steht unter Vorbehalt der Messungen M1–M4** |
| E10 | Erfolgsmeldung beim Graph-Versand heißt „an Microsoft übergeben“, nicht „zugestellt“ | 202 ist keine Zustellung (F06) |
| E11 | Seite für Administratoren: genaue delegierte Rechte, Link zur Administratorzustimmung, was auf dem Rechner bleibt, was optional den Rechner verlässt (verschlüsselter Sync, Cloud-Entwurf nur nach eigener Freigabe) | F08, F11 |
| E12 | Nur die weltweite Microsoft-Cloud. Nationale Clouds, Funktionspostfächer, Kalender, Teams, SharePoint: nicht in diesem Plan | F13 |

## Bauabschnitte

Jeder Abschnitt ist ein eigener Commit und für sich prüfbar.

0. **Konsole bereinigen.** Die beiden Ausgaben der vollständigen Einstellungen entfernen
   (`uiStore.ts:1753`, `:2046`). Eigenständig, unabhängig vom Rest (F11).
1. **Verbindungsaufbau bündeln, Verhalten unverändert.** Die acht `new ImapFlow(...)`-Stellen
   rufen einen Helfer im Main, der Host, Port, TLS und Anmeldedaten zusammensetzt — heute immer
   `{ user, pass }`. Sonst ändert sich nichts: keine neuen Typen, gleiche IPC-Ergebnisse.
   Gegenprobe wie am 10.11.: abrufen, analysieren, mit Anhang senden, verschieben.
2. **Messen, bevor gebaut wird** (Skript gegen den Testmandanten, kein App-Code):
   - M1: Bleibt die selbst gesetzte `Message-ID` beim MIME-Versand über Graph erhalten? Davon hängt
     ab, ob die lokale Gesendet-Kopie beim nächsten Abruf wiedererkannt wird
     (`emailSync.ts:87–108`) oder doppelt erscheint.
   - M2: BCC über MIME — kommt die Blindkopie an, ohne dass andere Empfänger sie sehen?
   - M3: Anhänge mit 1, 5 und 20 MB.
   - M4: `In-Reply-To`/`References` — landet die Antwort beim Empfänger im Gesprächsfaden?
   - M5: Normaler Nutzer nach Administratorzustimmung — ohne Rückfrage?
   - M6: Lebensdauer der IMAP-Marke gegen die Dauer eines langen Abrufs; Erneuerung.
   - M7: Findet `findSentMailbox` den Gesendet-Ordner über IMAP, und trägt die von Graph abgelegte
     Kopie dort dieselbe `Message-ID`?
   Fällt M1 oder M2 durch, wird E9 neu entschieden (JSON-Versand, andere Zuordnung der Kopie).
3. **Anmeldung.** MSAL im Main, Ablage, IPC `anmelden` / `abmelden` / `Zustand` (nie eine Marke),
   Anmeldeart in beiden Kontotypen, abgeleitete Konto-ID, verständliche Meldung bei fehlender
   Administratorzustimmung.
4. **Abruf mit Marke.** Der Helfer aus Abschnitt 1 liefert für Microsoft-Konten
   `{ user, accessToken }` und holt vor jedem Verbindungsaufbau eine gültige Marke. Host und Port
   sind für diese Kontoart fest (`outlook.office365.com:993`), der Benutzername kommt aus der
   Anmeldung, nicht aus einem Eingabefeld.
5. **Versand über Graph** nach E9/E10, abhängig vom Ergebnis aus Abschnitt 2.
6. **Einrichtung.** Onboarding und Einstellungen: bei Microsoft ein Knopf „Mit Microsoft anmelden“
   statt Passwortfeld; die Anzeige „Passwort gesetzt“ in `CredentialsSettings` für diese Kontoart
   durch „angemeldet als …“ ersetzen; Administratoren-Seite.

**Nicht in diesem Plan:** Abruf über Graph für Organisationen ohne IMAP. Dafür gelten F02–F05 und
F07 unverändert; das wird ein eigenes Vorhaben mit Migrationsplan für den Mailspeicher.

## Abnahmekriterien

- Bestehende Passwort-Konten laufen nach jedem Abschnitt unverändert.
- Microsoft-Konto: anmelden, abrufen, analysieren, senden (mit Anhang, mit BCC, als Antwort),
  verschieben, App-Neustart ohne erneute Anmeldung, abmelden (Marke gelöscht).
- Fehlerfälle mit verständlicher Meldung: Zustimmung fehlt, Zustimmung verweigert, Marke
  widerrufen, offline, IMAP für das Postfach abgeschaltet.
- Zweites Gerät: dasselbe Konto anmelden, vorhandene Mails und Abruf-Merker passen (E5).
- Keine Marke, kein Mailinhalt, keine Adresse in neu geschriebenem Log-Code.
- `npm audit` nach der neuen Abhängigkeit ohne neuen Befund.

## Vorlauf beim Nutzer (läuft parallel)

- Herausgeber-Prüfung bei Microsoft (F09): Voraussetzungen klären. Bis dahin sieht jeder
  Administrator „nicht überprüft“.
- In der App-Registrierung die Rechte aus E6 fest eintragen, damit Administratoren sie im Portal
  sehen und freigeben können.

## Unsicher

- U1: Größengrenze und genaues Verhalten des MIME-Versands über Graph kenne ich nicht sicher;
  deshalb M1–M4 vor dem Bau.
- U2: Ob MSAL-Node in einem gepackten Electron-Build (asar, Signierung) ohne Sonderbehandlung läuft.
- U3: Ob der Mandantenschalter „SMTP-Anmeldung aus“ wirklich auch OAuth-SMTP sperrt, ist nicht
  gemessen; für den Plan ohne Belang, weil der Versand über Graph läuft.

## Fassung 3 — Änderungen nach Runde 2 (10.11.2026, vom Nutzer freigegeben)

Wo dieser Abschnitt den Entscheidungen und Bauabschnitten oben widerspricht, gilt dieser Abschnitt.
Es gibt **keine dritte Planrunde**; stattdessen prüft Codex jeden Bauabschnitt am fertigen Code.

**Geänderte und neue Entscheidungen**

| # | Entscheidung | Anlass |
|---|---|---|
| E2 (neu gefasst) | Die Kontoart wird **dauerhaft im Main** an die Konto-ID gebunden (eigene Ablage unter userData: Kontoart, Mandant, Objekt-ID, Anmeldename, Anwendungs-ID). Ein Microsoft-Konto ohne gültige Marke geht in den Zustand „Anmeldung nötig“ und **fällt nie auf den Passwortweg zurück**, auch wenn unter derselben ID noch ein altes Passwort liegt. Abmelden, Widerruf und erneute Anmeldung sind getrennte Zustände | F16 |
| E13 | Für Microsoft-Konten **ignoriert der Main alle Verbindungsangaben des Renderers**: Server, Port, TLS (immer an), Benutzername und Absender kommen aus dem Main-seitigen Kontostand, Graph-Endpunkt, Mandant und Anwendungs-ID ebenso. Gilt an allen acht IMAP-Zugängen und im Versand. Der IMAP-Sent-Append bleibt Passwortkonten vorbehalten | F17 |
| E4 (ergänzt) | Zwei Marken je Konto, eine je Ressource (IMAP bei Outlook, Graph). Der Zustand nennt getrennt, ob Abruf und Versand berechtigt sind und welche Zustimmung fehlt | F25 |
| E8 (ergänzt) | MSAL und sein Cache werden erst **nach** `app.name` und Instanzsperre angelegt, nie beim Import. Cache-Schreiben atomar und verschlüsselt; ohne `safeStorage` keine Microsoft-Anmeldung | F21 |
| E9 (verschärft) | MIME-Versand über Graph nur, wenn **M2 an den Rohkopfzeilen** der zugestellten Mails und der Gesendet-Kopie bestanden ist. Sonst wird der Versandweg neu entschieden, vorher wird nichts gebaut | F18 |
| E14 | Eigene Obergrenze für die Gesamtgröße einer Mail beim Graph-Versand, vor dem Absenden geprüft; Überschreitung ist ein klarer Fehler, Entwurf und Anhänge bleiben erhalten | F19 |
| E15 | Ungewisser Versand (Abbruch nach dem Absenden, vor der Antwort) ist ein eigener Zustand „unklar, bitte im Gesendet-Ordner prüfen“; der Entwurf bleibt, keine automatische Wiederholung | F20 |
| E16 | Gesendet-Kopie nach Graph-Versand: echten Gesendet-Ordner über IMAP ermitteln, Kopie nach Sichtbarkeit auf dem Server gezielt abgleichen; bis dahin zeigt die Oberfläche die Mail als „wird abgeglichen“ | F15 |

**Bekannte Einschränkung, bewusst nicht in diesem Vorhaben gelöst (F14):** Sind Absender- und
Empfängerkonto beide in der App eingerichtet, wird die Mail beim Empfängerkonto nicht importiert,
weil der Speicher Mails nur nach Message-ID kennt. Das besteht schon heute und unabhängig von
Microsoft. Es kommt ein Test dafür in die Abnahme, damit das Verhalten dokumentiert ist; die Lösung
(kontogebundene Kennungen) gehört zum zurückgestellten Umbau des Mailspeichers.

**Bauabschnitte (ersetzt die Liste oben)**

0. **Mail-Logs bereinigen** — nicht nur die zwei Einstellungs-Ausgaben, sondern alle Ausgaben im
   Mailcode, die Betreff, Notiznamen, Message-IDs, Modellantworten oder Fehlertexte mit Adressen
   tragen (F22). Helfer `shared/logRedaction.ts`, getestet.
1. **Verbindungsaufbau bündeln** — ausschließlich die Erzeugung der Verbindungsoptionen an allen
   acht IMAP-Stellen. Zeitlimits, Ereignis-Listener, Fehlertexte und Passwortabfrage bleiben an Ort
   und Stelle und unverändert (F23). Gegenprobe je Stelle: Verbindungstest, Ordnerliste, Abruf,
   Verschieben, Anhang laden, Kennzeichen setzen, Weiterleiten mit Anhang, Senden mit Gesendet-Kopie.
2. **Versand-Handler ordnen, Verhalten unverändert** — MIME-Erzeugung vor den Versand ziehen,
   Passwort- und SMTP-Prüfung in einen eigenen Zweig, Send-Ergebnis je Zweig ausdrücklich. Belegen,
   dass je Klick genau ein Transportweg läuft (F26).
3. **Messen** — M1 bis M7 wie oben, dazu: M2 an Rohkopfzeilen (F18); M3 mit mehreren Anhängen und
   Gesamtgröße (F19); M5 für Abruf **und** Versand mit Nicht-Administrator, auch nach Neustart (F25);
   M7 auch bei verzögerter Ablage (F15); **M8** Abbruch nach dem Absenden (F20); **M9** Konto A an
   Konto B in derselben App (F14).
4. **Anmeldung** — nach E2, E4, E8. Tor: Start, Anmeldung, Neustart, zwei Konten, Abmelden im
   **gepackten** Build (F21).
5. **Abruf mit Marke** — nach E13.
6. **Versand über Graph** — nach E9, E14, E15, E16.
7. **Einrichtung und Administratoren-Seite.**

**Feste Anforderungen an Abschnitt 6 (Versand über Graph) aus dem Code-Review von Abschnitt 2**
(`microsoft-abschnitt-2-review.md`, vom Nutzer am 10.11.2026 übernommen):

- Die Weiche zwischen den Versandwegen sitzt **vor** Passwort-, SMTP-Host- und Transporter-Zugriff;
  der Graph-Zweig erreicht den SMTP-Aufruf nie (dort F01).
- `renderRawMessage` ist bis zum Bestehen von M2 kein Versandtext; die Graph-eigene MIME-Erzeugung
  wird erst nach der Messung festgelegt (dort F04).
- Absendername, Absenderadresse und der Hostteil der Message-ID kommen für Microsoft-Konten aus dem
  Main-seitigen Kontostand, nicht aus `composeData.account` (dort F05, hier E13).
- `OutgoingMailInput` wird transportneutral: kein Pflichtfeld `smtpHost`, Umschlag erst im
  SMTP-Zweig (dort F06).
- Handler-Test mit kontrollierten Transporten und der produktiven HTML-Funktion: je Aufruf genau ein
  Transportweg, Reihenfolge und Fehlerwege der Prüfungen (dort F07).

## Codex-Findings

### F01 — Der erste Bauabschnitt kann nicht nur Handler umleiten
Schwere: hoch
ADR-Stelle: Bauabschnitt 1, E2
Status: [OFFEN]
Der geplante Vertrag nennt sieben Postfachaktionen, aber `email-fetch` erledigt zusätzlich Fensterwahl, Kandidatensortierung, Abgleich und persistente Vereinigung (`app/src/main/email/ipc.ts:869-888`, `:934-998`, `:1146-1182`). `email-send` baut MIME, validiert Empfänger und gibt IMAP-spezifische `sentUid`/`sentMailbox` zurück; die lokale Gesendet-Kopie baut der Renderer (`app/src/main/email/ipc.ts:2375-2405`, `:2450-2524`, `:2534-2584`; `app/src/renderer/stores/emailStore.ts:1033-1057`). `email-save`, `email-load`, `email-delete-local`, `email-analyze` und `email-create-note` sind keine Postfachoperationen (`app/src/main/email/ipc.ts:767`, `:812`, `:843`, `:1352`, `:1866`). „Die Handler rufen nur noch den Vertrag auf“ ist damit als verhaltensneutraler Abschnitt nicht überprüfbar. Hinzu kommt: Die Pflichtfelder für IMAP/SMTP existieren in `EmailAccount` **und** separat in `uiStore` (`app/src/shared/types.ts:1818-1829`; `app/src/renderer/stores/uiStore.ts:348-351`); `kind` an nur einem Typ genügt nicht.
Vorschlag: Den ersten Abschnitt auf reine IMAP-Verbindungsoperationen mit unveränderten IPC-Ergebnissen begrenzen. Einen zweiten, ausdrücklich verhaltensändernden Schritt für Identität, Abruf und Versandmodell vor Graph einziehen.

### F02 — RFC-Message-ID ist kein kontosicherer Datensatzschlüssel
Schwere: kritisch
ADR-Stelle: O1, E2, Bauabschnitt 3
Status: [OFFEN]
Die lokale `EmailMessage.id` ist heute die RFC-Message-ID, nur ohne Header ein Konto/UID-Fallback (`app/src/shared/types.ts:1707-1710`; `app/src/main/email/ipc.ts:966-970`, `:1009-1012`, `:1084-1088`). `existingIds` ist global für alle Konten (`app/src/main/email/ipc.ts:879-883`); `dedupeEmailsById`, Merge und Grabsteine verwenden ebenfalls nur `id` (`app/src/shared/emailMerge.ts:306-319`, `:329-365`, `:67-68`; `app/src/main/email/store.ts:521-525`). Bereits der Kommentar in `emailSync.ts:70-73` räumt ein, dass dieselbe Message-ID in zwei Konten im Schema **ein** Datensatz ist. Bei Graph ist `id` dagegen die serverseitige Elementkennung; ein direktes Einsetzen oder ein bloßes `uid: number | string` würde vorhandene Mails nicht wiedererkennen und kann Mails verschiedener Konten verschmelzen oder per Grabstein gegenseitig löschen. Microsoft dokumentiert außerdem, dass normale Graph-IDs beim Verschieben wechseln; `Prefer: IdType="ImmutableId"` muss an **jeder** betroffenen Anfrage stehen und gilt nur innerhalb desselben Postfachs ([Microsoft: unveränderliche Outlook-IDs](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)).
Vorschlag: Stabile lokale, nach Konto/Provider namespacierte Datensatz-ID und separate Serverkennung sowie RFC-Message-ID spezifizieren; Altbestand und Grabsteine migrieren, bevor Graph-Mails in denselben Store gelangen.

### F03 — UID, Ordner und Serverkennung durchziehen Preload und Renderer
Schwere: hoch
ADR-Stelle: O1, Bauabschnitte 1 und 3
Status: [OFFEN]
Numerische UIDs und IMAP-Hostdaten stehen in vier IPC-Signaturen (`app/src/shared/types.ts:1305-1308`, `:1395`) und noch einmal im Preload (`app/src/main/preload.ts:693-700`, `:761-762`). `EmailMessage.uid` und `EmailSendResult.sentUid` sind Zahlen (`app/src/shared/types.ts:1709`, `:1872-1882`). Der Renderer sperrt Verschieben, Anhänge und Weiterleitungsanhänge bei falsy UID und setzt Gelesen nur bei `uid > 0` auf dem Server (`app/src/renderer/stores/emailStore.ts:263-286`, `:851-881`, `:902-920`, `:1209-1223`). `emailSync` schreibt nur positive numerische UIDs nach (`app/src/shared/emailSync.ts:30-43`, `:105-107`). Mit einer Graph-Zeichenkette wären diese Aktionen trotz funktionierendem Adapter stumm deaktiviert oder typwidrig.
Vorschlag: Providerneutrale Aktionsargumente (`accountId`, lokale Mail-ID) und eine getrennte, typisierte Serverreferenz im Main; die vier Renderer-Gates und Send-Ergebnis bewusst umstellen.

### F04 — Graph-Delta braucht einen anderen Abruf-Merker
Schwere: hoch
ADR-Stelle: O2, Bauabschnitt 3
Status: [OFFEN]
Der vorhandene Merker ist ein ISO-Zeitpunkt je Gerät und Konto/Ordner (`app/src/shared/emailMerge.ts:418-468`; `app/src/main/email/ipc.ts:900-902`, `:938-951`, `:1120-1126`). Er wird lexikografisch vorwärts vereinigt und ins Legacy-Feld verdichtet (`app/src/shared/emailMerge.ts:443-480`; `app/src/main/email/store.ts:301-314`). Die Abrufauswahl sortiert numerische UIDs absteigend (`app/src/shared/emailFetchWindow.ts:26-51`). Graph-Delta liefert dagegen opake, ordnerbezogene `nextLink`/`deltaLink`-URLs, die über **alle** Seiten bis zum abschließenden Delta-Link verfolgt werden müssen; ein Merker kann ungültig werden ([Microsoft: Nachrichtendelta](https://learn.microsoft.com/en-us/graph/api/message-delta), [Delta-Überblick](https://learn.microsoft.com/en-us/graph/delta-query-overview)). Diese URLs dürfen nicht in `lastFetchedAt`, dessen `max`-Merge oder `selectFetchBatch` gelangen. Die aktuelle Renderer-IPC übergibt lediglich `Record<string,string>` plus `incremental | full` (`app/src/shared/types.ts:1306`, `:1884-1887`; `app/src/renderer/stores/emailStore.ts:474-485`).
Vorschlag: Separaten gerätelokalen Graph-Delta-Stand je Konto/Ordner und vollständige Paging-, Reset- und Retentionsregel planen; erst nach erfolgreicher Persistenz den Delta-Link festschreiben.

### F05 — „Verschwunden“ aus Graph-Delta ist nicht lokale Löschung
Schwere: hoch
ADR-Stelle: O3, Bauabschnitt 3
Status: [OFFEN]
`diffKnownMessages` nimmt eine vollständige Kandidatenliste **eines** IMAP-Zeitfensters und markiert jede darin nicht gefundene lokale Mail im Ordner als `missingOnServer` (`app/src/shared/emailSync.ts:61-80`, `:120-126`). Ein Graph-Delta enthält nur Änderungen, keine vollständige Gegenliste; denselben Diff darauf anzuwenden würde fast alle bekannten Mails als verschwunden markieren. Zudem sind lokale Grabsteine für absichtliches Entfernen aus der App reserviert (`app/src/main/email/ipc.ts:843-860`; `app/src/shared/emailMerge.ts:348-353`), während Graphs `@removed` auch einen Ordnerwechsel anzeigen kann. Eine fachliche Regel für spätere Ordnerereignisse und mehrere Geräte fehlt. Microsoft beschreibt Delta ausdrücklich pro Ordner mit Additions-, Änderungs- und Löschereignissen ([Nachrichtendelta](https://learn.microsoft.com/en-us/graph/api/message-delta)).
Vorschlag: Graph-Ereignisse getrennt verarbeiten; erst nach Abgleich des Zielordners bzw. einer vollständigen Resynchronisierung `missingOnServer` setzen, lokale Grabsteine nie direkt aus `@removed` erzeugen.

### F06 — Graph-Versand erfüllt den heutigen Send-Vertrag nicht automatisch
Schwere: hoch
ADR-Stelle: Bauabschnitte 1 und 3, E6
Status: [OFFEN]
Der heutige Versand setzt eine RFC-Message-ID, verarbeitet `In-Reply-To`/`References`, BCC ohne Kopfzeile, Signaturbild als CID und beliebige Dateianhänge (`app/src/main/email/ipc.ts:2450-2524`); der Renderer legt nach `success` sofort eine lokale Gesendet-Mail mit `messageId`, Ordner und UID an (`app/src/renderer/stores/emailStore.ts:1033-1057`). Graphs `/me/sendMail` antwortet nur mit **202 Accepted ohne Nachrichten-ID** und bestätigt damit noch keine Zustellung ([Microsoft: sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail)). Für größere Anhänge nennt Microsoft Entwurf plus Upload-Session ab 3 MB ([Microsoft: große Outlook-Anhänge](https://learn.microsoft.com/en-us/graph/outlook-large-attachments)). „Graph legt selbst im Gesendet-Ordner ab“ löst weder die lokale Kennung noch den Versandstatus oder die MIME-Gleichwertigkeit. Eine ausgedachte lokale ID würde beim späteren Abruf als zweite Mail erscheinen.
Vorschlag: Versandformat (MIME oder JSON), große Anhänge, BCC/CID/Thread-Header und die Zuordnung der späteren Sent-Kopie separat spezifizieren; 202 als angenommen und nicht als nachgewiesen zugestellt darstellen.

### F07 — Graph-Ordner sind keine IMAP-Pfade
Schwere: mittel
ADR-Stelle: O1, Bauabschnitt 3
Status: [OFFEN]
`EmailFolder.path` ist als voller IMAP-Pfad samt Delimiter definiert (`app/src/shared/types.ts:1755-1767`). Aktiver Ordner, lokale Mail, Abrufschlüssel und Filter vergleichen rohe Pfadzeichenketten (`app/src/renderer/stores/uiStore.ts:366-367`; `app/src/renderer/stores/emailStore.ts:475-479`, `:742-752`; `app/src/main/email/ipc.ts:900-902`, `:1085-1093`). Graph-Ordner besitzen IDs und sprachunabhängige bekannte Namen wie `inbox`/`sentitems` ([Microsoft: mailFolder](https://learn.microsoft.com/en-us/graph/api/resources/mailfolder)). Ein Anzeigename als `path` ist bei gleichnamigen Unterordnern nicht eindeutig; `isSentFolderName(fetchFolder)` hängt zugleich an IMAP-Namen (`app/src/main/email/ipc.ts:1090-1093`).
Vorschlag: Ordner-ID, Anzeigename, Eltern-ID und besondere Rolle trennen; Legacy-IMAP-Pfade nur im IMAP-Adapter verwenden.

### F08 — Administrationshürde ist mandantenabhängig, nicht universal
Schwere: mittel
ADR-Stelle: Was aus „Behörden und Schulen“ folgt 1–3, E5–E7, O4
Status: [OFFEN]
Die Aussage „die Organisation muss die App freigeben“ ist für viele Zielmandanten plausibel, aber kein Microsoft-Zwang für **jeden** Mandanten: Benutzerzustimmung hängt von dessen Richtlinie und Berechtigungsklassifizierung ab. Die derzeit empfohlene Microsoft-Richtlinie schließt `Mail.Read`/`Mail.ReadWrite` von normaler Benutzerzustimmung aus; ein Mandant kann andere Regeln setzen ([Microsoft: App-Consent-Richtlinien](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies), [Benutzer- und Adminzustimmung](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/user-admin-consent-overview)). „IMAP ist dort oft abgeschaltet“ kann ich ohne Zielmandanten-Daten nicht quantifizieren; Microsoft erlaubt IMAP mit OAuth ausdrücklich weiterhin ([Exchange Online: Basic Auth](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-basic-authentication-exchange-online)). Graph ist als Produktentscheidung tragfähig, aber nicht aus einer belegten Häufigkeit ableitbar. Eine eigene Mandantenregistrierung umgeht auch keine Richtlinie, die App-Registrierung oder Zugriff selbst verbietet.
Vorschlag: Voraussetzungen als prüfbare Mandanten-Matrix formulieren: Benutzerzustimmung, Admin-Workflow, App-Registrierungsrecht, Graph-Zugriff und Conditional Access. Die Administratoren-Seite muss die genaue **delegierte** Berechtigungsart und den Einrichtungsweg zeigen.

### F09 — Standard-App und Herausgeberprüfung sind ein eigener Vorlauf
Schwere: hoch
ADR-Stelle: E5, O4, Bauabschnitt 2
Status: [OFFEN]
Eine mitgelieferte Standard-ID setzt eine existierende, korrekt konfigurierte Mehrmandanten-App voraus; der Plan stellt ihre Herausgeberprüfung noch als offene Vermutung dar. Microsoft beschreibt bei neuen Mehrmandanten-Apps mit Rechten über einfache Profilanmeldung hinaus eine Warnung für ungeprüfte Herausgeber und verlangt für die Verifikation u.a. einen verifizierten Partner-Account, Entra-Arbeitskonto, Publisher-Domain und passende Rollen ([Microsoft: Herausgeberprüfung](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)). E5 ist keine gleichwertige „Rückfallebene“ für Nutzer ohne Administrator, der eine eigene Registrierung erstellen darf. Ob der konkrete Herausgeber diese Voraussetzungen erfüllt, weiß ich nicht.
Vorschlag: Vor Implementierung Standard-ID, unterstützte Mandantenart, Redirect-Registrierung und Verifikationsfähigkeit klären; eigene Mandanten-ID als dokumentierten alternativen Admin-Pfad behandeln.

### F10 — OAuth-Eigenbau ist eine Kernkomponente, keine kleine Fetch-Hilfe
Schwere: hoch
ADR-Stelle: E3, E8, Bauabschnitt 2
Status: [OFFEN]
Systembrowser plus Loopback und PKCE ist grundsätzlich ein unterstützter Weg, doch Microsoft nennt für Systembrowser eine als **Mobile/Desktop** registrierte `http://localhost`-URI; ein beliebiger Port ist nur bei korrektem Redirect-Typ austauschbar ([Microsoft: Desktop-Registrierung](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration), [Redirect-Beschränkungen](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)). E8 unterschätzt Zustandsprüfung, Code-Verifier, einmalige Loopback-Annahme, Token-Caching, Konto-/Mandantenwechsel, stille Erneuerung und Reauth nach Richtlinienänderung. `@azure/msal-node` deckt Token-Lebensdauer und Silent Acquisition ab; eine **verschlüsselte persistente** Ablage braucht bei MSAL trotzdem einen Cache-Adapter bzw. Extensions ([Microsoft: MSAL-Node-Cache](https://learn.microsoft.com/en-us/entra/msal/javascript/node/caching)). Die vorhandenen Passwort-IPC-Methoden geben das entschlüsselte Geheimnis an den Renderer zurück (`app/src/main/email/ipc.ts:167-170`; `app/src/main/preload.ts:720-722`) und sind kein geeignetes Tokenmuster.
Vorschlag: MSAL-Node als Ausgangspunkt bewerten; falls Eigenbau, Sicherheitsinvarianten und Tests vorab festlegen. Tokens ausschließlich im Main halten, Loopback nur lokal binden, `state`/PKCE/Redirect strikt prüfen und Browser-/HTTP-Fehler ohne URL oder Token protokollieren.

### F11 — Die zugesagte Log- und Datenschutzgrenze gilt im Istzustand nicht
Schwere: hoch
ADR-Stelle: Nicht verhandelbar, E4, E7
Status: [OFFEN]
Der Plan verspricht „keine Adresse in Logs“ und eine Admin-Aussage „Daten bleiben auf dem Rechner“. Der Renderer protokolliert beim Laden und Speichern aber ganze UI-Einstellungen einschließlich `email.accounts.user`/`fromAddress` (`app/src/renderer/stores/uiStore.ts:348-351`, `:1751-1753`, `:2037-2046`). Der Main protokolliert außerdem RFC-Message-IDs, Betreff und Fehlertexte aus Mail- und Modellpfaden (`app/src/main/email/ipc.ts:1687-1713`, `:1892`, `:2524-2525`, `:2585-2586`). Der Mailbestand mit Inhalt wird in `.mindgraph/email-store.json` serialisiert und ist als `.mindgraph/*.json` für den E2E-Sync freigegeben (`app/src/main/email/store.ts:119-140`; `app/src/main/sync/fileTracker.ts:105-109`, `:155-156`); bei ausdrücklich aktivierter Cloud-Entwurfshilfe verlassen Maildaten den Rechner (siehe `.claude/rules/email.md`, Abschnitt „Cloud für den E-Mail-Assistenten“). E4 schützt nur Marken, nicht diese Datenflüsse.
Vorschlag: Vor der Admin-Seite Log-Redaktion und genaue Datentransparenz als eigenen Akzeptanzpunkt aufnehmen: Microsoft-Graph-Transport, lokale Ablage, optionaler verschlüsselter Vault-Sync und optionaler Cloud-Entwurf getrennt nennen.

### F12 — Konto- und Gerätebindung der Marken ist nicht beschrieben
Schwere: hoch
ADR-Stelle: E4, E5, Bauabschnitt 2
Status: [OFFEN]
Der Plan sagt „je Konto unter userData“, aber vorhandene Konten sind UI-Einstellungen (`app/src/renderer/stores/uiStore.ts:348-351`, `:2037-2046`), während die Maildaten samt Geräte-Merkern und Grabsteinen im synchronisierten Vault liegen (`app/src/main/email/store.ts:73-90`, `:119-120`, `:301-324`; `app/src/main/sync/fileTracker.ts:155-156`). `accountId` wird im Onboarding lokal aus `Date.now()` erzeugt (`app/src/renderer/components/Onboarding/steps/EmailSetupStep.tsx:80-106`); Passwörter liegen unter `email-${accountId}.enc`, ohne im gezeigten Handler einen Löschpfad (`app/src/main/email/ipc.ts:50-51`, `:151-170`). Ein zweites Gerät hat nicht automatisch dieselbe Konto-ID oder Marke; erneute Anmeldung unter anderer ID kann die nach Konto-ID gefilterten Mails und Cursor nicht zuordnen. Bei eigener Anwendungs-ID kann dieselbe Mailbox zusätzlich in mehreren Client-/Tenant-Kontexten erscheinen.
Vorschlag: Kontoidentität aus Provider, Tenant-ID und Mailbox-Objekt-ID ableiten und lokale Konto-ID stabil zuordnen; Reauth, Abmelden, Kontoentfernung und Gerätewechsel inklusive Tokenlöschung und Cursor-Erhalt spezifizieren.

### F13 — Zielgruppe und Testmatrix bleiben zu eng
Schwere: mittel
ADR-Stelle: O5, O6, Bauabschnitte 3–4
Status: [OFFEN]
Ein einziges freigabefähiges Organisationskonto beweist weder den behaupteten Behörden-/Schulpfad noch die Migration. Der Code kennt nur Passwort-Connect und testet beim Onboarding nach Speichern des Passworts (`app/src/renderer/components/Onboarding/steps/EmailSetupStep.tsx:93-118`); für Graph fehlen Prüffälle zu verweigerter Zustimmung, abgelaufenem/entzogenem Token, mehreren Konten, großen Anhängen, Ordnerwechsel, Delta-Reset, Offline-Phase und Zweitgerät. Microsofts Graph-Delta ist nicht in jeder nationalen Cloud verfügbar ([Microsoft: Nachrichtendelta](https://learn.microsoft.com/en-us/graph/api/message-delta)); ob die konkret angestrebten deutschen Mandanten Sonderumgebungen oder zusätzliche Vorgaben haben, ist offen.
Vorschlag: Vor Bauabschnitt 2 mindestens Standard- und eigene Registrierung mit Testmandanten festlegen; zusätzlich negative Zustimmungs- und Mehrgerätefälle als Abnahmekriterien führen. Nationale Clouds nur als explizite Produktentscheidung nennen, nicht still als unterstützt voraussetzen.

### Runde 2

### F14 — F02 bleibt beim Versand an ein zweites eingerichtetes Konto wirksam
Schwere: hoch
ADR-Stelle: E1, E5, Antwort auf F02; M1
Status: [OFFEN]
Der Wechsel des Abrufs auf IMAP beseitigt die kontenübergreifende Kollision nicht. Sendet Konto A an Konto B, das ebenfalls in der App eingerichtet ist, erhält die lokale Gesendet-Kopie von A die RFC-Message-ID als `id` (`app/src/renderer/stores/emailStore.ts:1033-1040`). Beim Abruf von B kennt der globale `existingIds`-Satz diese ID bereits und überspringt den Import (`app/src/main/email/ipc.ts:879-883`, `:1009-1013`); `diffKnownMessages` lässt den zu A gehörenden Datensatz ausdrücklich unberührt (`app/src/shared/emailSync.ts:87-93`). Merge und Grabsteine bleiben ebenfalls nur nach `id` geschlüsselt (`app/src/shared/emailMerge.ts:306-319`, `:348-365`). M1 misst eine Selbstzuordnung im Gesendet-Ordner, nicht diesen Fall. Das Problem bestand auch zuvor, wird aber durch E9 und das Abnahmekriterium „zwei Geräte/mehrere Konten“ keineswegs irrelevant.
Vorschlag: Mindestens einen Test A→B mit beiden Konten in derselben App und nach Vault-Sync aufnehmen. Vor Freigabe der Mischform entweder kontogebundene lokale IDs einführen oder diese konkrete Einschränkung ausdrücklich als nicht unterstützten Fall behandeln.

### F15 — F03 ist für die lokale Gesendet-Kopie nur teilweise zurückgestellt
Schwere: hoch
ADR-Stelle: E1, E9, Antwort auf F03; M1/M7
Status: [OFFEN]
Ohne IMAP-Append liefert der Graph-Zweig keine `sentUid` und keinen `sentMailbox`; der Renderer speichert sofort `uid: 0`, `folder: 'Sent'` (`app/src/renderer/stores/emailStore.ts:1033-1040`). `findSentMailbox` wird heute ausschließlich im Append-Zweig aufgerufen (`app/src/main/email/ipc.ts:2534-2568`), obwohl er tatsächliche Pfade wie `Sent Items`/`Gesendete Elemente` finden kann (`:2200-2225`). Die Oberfläche filtert nach exaktem aktivem Ordnerpfad (`app/src/renderer/stores/emailStore.ts:742-752`); bei einem anderen Pfad ist die lokale Kopie dort zunächst unsichtbar. Eine UID wird nur nachgezogen, wenn gerade der echte Gesendet-Ordner über IMAP abgerufen wird und die Message-ID übereinstimmt (`app/src/shared/emailSync.ts:87-107`; `app/src/renderer/stores/emailStore.ts:475-485`). Mit `uid: 0` sind Verschieben, Anhänge und Server-Flags nicht nutzbar (`app/src/renderer/stores/emailStore.ts:851-855`, `:902-906`, `:1209-1210`). M7 misst Auffindbarkeit, sieht aber keine Übernahme des Ergebnisses in den Send-Flow vor.
Vorschlag: Für Graph-Versand den echten IMAP-Sent-Pfad vor oder nach dem POST ermitteln und die Kopie nach Server-Sichtbarkeit gezielt abgleichen; fehlende UID in der Oberfläche sichtbar machen. M1/M7 auch bei verzögerter Sent-Ablage und nach Neustart prüfen.

### F16 — E2 verwechselt Anmeldeart mit vorhandenem Cache-Eintrag
Schwere: hoch
ADR-Stelle: E2, E4, Antwort auf F10/F12; Bauabschnitte 3–4
Status: [OFFEN]
`auth?: 'password' | 'microsoft'` soll laut E2 nur Anzeige sein; der Main soll allein aus einer abgelegten Marke die Kontoart ableiten. Eine Marke kann aber wegen Abmeldung, Widerruf, beschädigtem Cache, fehlendem `safeStorage` oder noch nicht abgeschlossenem Login fehlen, ohne dass das Konto zu einem Passwortkonto wird. Die heutigen Handler laden dann das Passwort anhand derselben `accountId` und melden „Kein Passwort gespeichert“ (`app/src/main/email/ipc.ts:122-129`, `:173-180`, `:204-210`, `:905-911`, `:2410-2418`). Bleibt von einem früheren Konto ein Passwort unter `email-${accountId}.enc`, kann ein Microsoft-Konto sogar in den Passwortzweig fallen (`:50-51`, `:151-170`). Das ist eine Zustandsmaschine, kein bloßer Cache-Lookup.
Vorschlag: Den Provider dauerhaft und Main-seitig an die Konto-ID binden. Fehlt die Marke bei einem Microsoft-Konto, fail closed mit Reauth-Zustand; niemals auf Passwort zurückfallen. Löschung, Widerruf und erneute Anmeldung getrennt modellieren.

### F17 — Microsoft-Marke darf keine vom Renderer gelieferte Verbindung autorisieren
Schwere: kritisch
ADR-Stelle: E2/E4, Bauabschnitt 4
Status: [OFFEN]
Der Main übernimmt heute `host`, `port`, `tls` und `user` direkt aus dem Renderer: `email-connect` (`app/src/main/email/ipc.ts:173-186`), `email-list-folders` (`:204-216`), `email-move` (`:255-286`), `email-fetch-attachments` (`:365-391`), `email-set-flags` (`:441-474`), `email-stage-forward-attachments` (`:506-531`) und `email-fetch` (`:869-920`). Der Renderer füllt diese Felder selbst (`app/src/renderer/stores/emailStore.ts:475-479`, `:867-875`, `:913-921`, `:1214-1222`); `email-send` erhält zusätzlich SMTP-/IMAP-Host und Absender aus dem Renderer (`:1016-1031`; `app/src/main/email/ipc.ts:2384-2397`). Sobald der Helfer ein OAuth-Token einsetzt, wäre das Übernehmen auch nur eines dieser Hosts oder `tls: false` ein möglicher Markenabfluss. Abschnitt 4 nennt zwar den festen IMAP-Host, verlangt aber keine verbindliche Prüfung **an allen acht Zugängen und dem Versandzweig**.
Vorschlag: Für Main-seitig gebundene Microsoft-Konten sämtliche Renderer-Verbindungsfelder ignorieren oder gegen feste Werte prüfen, TLS erzwingen und den Benutzernamen aus der signierten Anmeldung nehmen; Graph-Endpunkt, Tenant und Client-ID ebenfalls nur aus Main-seitigem Kontostand bestimmen. Den neunten bisherigen IMAP-Sent-Append nur für Passwortkonten zulassen.

### F18 — M2 muss den MIME-Rohtext prüfen, nicht nur den Empfang
Schwere: kritisch
ADR-Stelle: E9, M2, Antwort auf F06
Status: [OFFEN]
Der bisherige SMTP-Versand hat einen getrennten Umschlag mit BCC-Empfängern (`app/src/main/email/ipc.ts:2483-2512`). E9 will dagegen die Bytes des `streamTransport` verwenden (`:2540-2543`), bei Graph gibt es keinen separaten SMTP-Umschlag: `/me/sendMail` nimmt nur den base64-kodierten MIME-Inhalt ([Microsoft: MIME-Versand](https://learn.microsoft.com/en-us/graph/outlook-send-mime-message)). Eine lokale Gegenprobe mit dem **installierten Nodemailer 10.2.1** und genau `streamTransport: true, buffer: true, newline: 'unix'` ergab einen `Bcc:`-Header im erzeugten Buffer; der Kommentar `ipc.ts:2507-2509` über eine fehlende BCC-Kopfzeile trifft auf diesen Stream nicht zu. Ob Graph den Header vor Zustellung zuverlässig entfernt, ist **nicht gemessen**. M2 („kommt an, ohne dass andere Empfänger sie sehen“) muss daher Rohkopfzeilen der To-/Cc-/Bcc-Empfänger und der Sent-Kopie auswerten, nicht bloß die Anzeige im Mailprogramm. Ein Fehlschlag wäre ein Datenschutzfehler, nicht nur ein Anlass für einen anderen Versandpfad.
Vorschlag: M2 als harte Freigabeschranke vor dem Bau führen; bei Unklarheit MIME/BCC nicht produktiv senden. Den tatsächlich generierten Buffer und die zugestellten Rohmails getrennt prüfen, ohne Adressen in Logs abzulegen.

### F19 — M3 belegt keine allgemeine MIME-Größengrenze
Schwere: mittel
ADR-Stelle: E9, M3, U1
Status: [OFFEN]
Der bestehende Code nimmt Anhänge als Dateien ohne Versandobergrenze entgegen (`app/src/main/email/ipc.ts:2421-2435`, `:2455-2460`), und weitergeleitete Anhänge dürfen einzeln bis 30 MB groß sein (`:548-550`). Das neue Graph-POST muss den gesamten MIME-Buffer nochmals base64-kodieren ([Microsoft: sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail)); die Übertragungsgröße hängt damit auch von mehreren Anhängen und MIME-Overhead ab. Microsoft nennt zudem konfigurierbare Exchange-Nachrichtengrößen und weitere Grenzen im Transportweg ([Microsoft: Nachrichtengrößen](https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/message-size-limits-exchange-online)). Drei erfolgreiche Einzeldateien mit 1/5/20 MB in **einem** Mandanten ergäben keine sichere allgemeine Obergrenze. Die lokale `streamTransport`-Probe zeigte bei `newline: 'unix'` nur LF im Buffer; ob Graph diesen konkreten Buffer akzeptiert, ist ebenfalls offen.
Vorschlag: M3 um mehrere Anhänge, Grenzwerte knapp oberhalb/unterhalb des Mandantenlimits, zusammengesetzte Größe und MIME-Bytes ergänzen. Eine serverseitig abgelehnte Mail vor dem POST als klaren Fehler ausweisen, ohne Entwurf oder Anhänge zu verwerfen.

### F20 — 202 und Netzabbruch lassen Wiederholung unentscheidbar
Schwere: hoch
ADR-Stelle: E9/E10, M1–M7; Antwort auf F06
Status: [OFFEN]
E10 korrigiert den Erfolgstext, aber der Renderer entfernt nach jedem `success` den Entwurf und zwischengespeicherte Anhänge und schreibt eine lokale Gesendet-Kopie (`app/src/renderer/stores/emailStore.ts:1033-1071`). Graph antwortet auf `/me/sendMail` mit `202` ohne ID und ohne Zustellnachweis ([Microsoft: sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail)). Bricht die Verbindung **nach** Annahme und **vor** der Antwort ab, weiß der Client nicht, ob gesendet wurde; ein erneuter Klick kann doppelt senden, ein pauschaler Fehler kann eine tatsächlich gesendete Mail als ungesendet erscheinen lassen. Keine Messung M1–M7 prüft diesen Zustand, und die selbst gesetzte Message-ID allein ist keine belegte serverseitige Idempotenzgarantie.
Vorschlag: Ungewissen Versandstatus, Wiederholungsregel und Aufbewahrung des Entwurfs festlegen; eine Unterbrechungsprobe nach Annahme als M8 aufnehmen. Automatische Wiederholung nur mit nachgewiesener Duplikatvermeidung.

### F21 — E8 braucht einen Test im gepackten Profil, nicht nur `npm audit`
Schwere: hoch
ADR-Stelle: E8, U2, Bauabschnitt 3
Status: [OFFEN]
`@azure/msal-node` ist noch keine Abhängigkeit (`app/package.json:149-197`). Der Main wird mit electron-vite gebaut und durch electron-builder gepackt (`app/package.json:13-22`, `:45-65`; `app/electron.vite.config.ts:12-25`). Ob MSAL und seine Abhängigkeiten im ASAR, mit Signierung und auf allen Zielsystemen laufen, ist ausdrücklich U2; `npm audit` prüft das nicht. Außerdem werden statische Importe vor dem Main-Code ausgewertet, während `app.name` und die Profil-Instanzsperre erst in `index.ts:58-72` gesetzt werden. Ein importseitiger Cache-/`userData`-Zugriff wäre damit wieder vor dieser Reihenfolge. MSAL erwartet beim persistenten Cache `beforeCacheAccess`/`afterCacheAccess`; Silent Acquisition braucht die **richtige** Kontoidentität und die passende Ressource ([Microsoft: MSAL-Cache](https://learn.microsoft.com/en-us/entra/msal/javascript/node/caching)).
Vorschlag: MSAL und Cache erst nach `app.name`/Instanzsperre initialisieren; verschlüsselte, atomare Cache-Schreibvorgänge je Client/Tenant/Konto und `safeStorage`-Ausfall festlegen. Einen gepackten Start-, Login-, Neustart-, Mehrkonten- und Logout-Test als Gate für Abschnitt 3 aufnehmen, mindestens auf den unterstützten Plattformen.

### F22 — F11 ist durch Entfernen zweier Logs nicht erledigt
Schwere: hoch
ADR-Stelle: Bauabschnitt 0, E11, Antwort auf F11
Status: [OFFEN]
Abschnitt 0 entfernt nur zwei vollständige Einstellungs-Ausgaben (`app/src/renderer/stores/uiStore.ts:1753`, `:2046`). Der bestehende Mailpfad protokolliert weiter RFC-Message-IDs, Betreffzeilen und teils Fehler/Modellantworten (`app/src/main/email/ipc.ts:1575`, `:1687-1713`, `:1892`, `:2524-2525`, `:2585-2587`; `app/src/renderer/stores/emailStore.ts:702`). Die Antwort auf F11 erklärt diese Bestandslogs ausdrücklich für außerhalb des Plans und senkt das Kriterium auf „neu geschriebenen Log-Code“. Damit bleibt die angekündigte Grenze „keine Marke, kein Mailinhalt, keine Adresse in Logs“ für die ausgelieferte App unbewiesen. Gerade der neue Graph-/MSAL-Fehlerpfad könnte Token oder Anmeldedaten in generischen Fehlerobjekten enthalten.
Vorschlag: Vor der Administratoren-Seite die bestehenden Mail-Logs und Fehlerweitergaben auf personenbezogene Inhalte prüfen und redigieren; das Abnahmekriterium auf das tatsächliche Endprodukt beziehen.

### F23 — Abschnitt 1 deckt mit seiner Gegenprobe nicht alle Verbindungen
Schwere: mittel
ADR-Stelle: Bauabschnitt 1, Antwort auf F01
Status: [OFFEN]
Die Verkleinerung auf einen IMAP-Helfer macht F01 grundsätzlich lösbar. Die genannte Gegenprobe „abrufen, analysieren, mit Anhang senden, verschieben“ erreicht aber weder `email-connect` und `email-list-folders` noch `email-fetch-attachments`, `email-set-flags` und `email-stage-forward-attachments` sicher (`app/src/main/email/ipc.ts:173-224`, `:365-403`, `:441-485`, `:506-542`). Der neunte Verbindungsaufbau für den Sent-Append hat andere Aufgaben und läuft nach SMTP-Erfolg (`:2534-2573`); er bleibt vor Abschnitt 5 aktiv. Die Stellen haben unterschiedliche Timeouts und Fehlerbehandlungen (`:182-192`, `:387-396`, `:527-536`, `:916-928`). Ein Helfer, der mehr als die exakte Optionserzeugung verschiebt, kann daher Verhalten ändern, ohne dass die vorgesehene Gegenprobe es zeigt.
Vorschlag: Vorher/nachher alle acht IMAP-Zugänge und den Sent-Append getrennt prüfen; Optionen, Timeouts, Event-Listener und Fehlertexte als unveränderte Invarianten des Abschnitts 1 festhalten.

### F24 — E5 garantiert nur die neue ID, keine Zuordnung alten Bestands
Schwere: mittel
ADR-Stelle: E5, Antwort auf F12; Abnahmekriterium Zweitgerät
Status: [OFFEN]
Die neue ID aus Tenant- und Objekt-ID kann auf zwei Geräten gleich sein, sofern dort **dieselbe** Anmeldung vorgenommen wird. Sie ändert aber bestehende lokale IDs nicht: Passwort- und manuell angelegte Outlook-Konten benutzen `email-${Date.now()}` (`app/src/renderer/components/Onboarding/steps/EmailSetupStep.tsx:80-106`; `app/src/renderer/components/Settings/EmailSettingsTab.tsx:159-165`). Mails, Abruf-Merker und Grabsteine referenzieren die bisherige `accountId` bzw. Mail-ID (`app/src/main/email/ipc.ts:900-902`, `:1085-1089`; `app/src/main/email/store.ts:73-83`). Konto-Settings liegen lokal in `ui-settings.json` (`app/src/main/index.ts:1230-1254`), der Mailstore dagegen im Vault (`app/src/main/email/store.ts:60-83`). Ein Zweitgerät mit vorhandenem Vault bekommt weder automatisch die Kontokonfiguration noch eine Zuordnung alter Konto-IDs. Die Antwort auf F12 behandelt nur neue, leere Konten.
Vorschlag: Wechsel eines bestehenden Outlook-Kontos zu OAuth, erneute Einrichtung auf Gerät 2 und identische Anmeldung mit eigener/Standard-App getrennt testen und eine Zuordnungs- oder Migrationsregel festlegen.

### F25 — Zwei Ressourcen verlangen zwei explizite Token- und Zustimmungswege
Schwere: mittel
ADR-Stelle: E6/E8, M5, Antwort auf F08/F10
Status: [OFFEN]
Die eigene Messnotiz hält zwei Ressourcen und zwei Marken fest (Claude-Antwort, Messung 10.11.2026). Die IMAP-Marke muss den Outlook-Scope `https://outlook.office.com/IMAP.AccessAsUser.All` tragen ([Microsoft: IMAP OAuth](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth)); Graph `/me/sendMail` braucht eine Graph-Marke mit delegiertem `Mail.Send` ([Microsoft: sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail)). E4 „je Konto eine Datei“ und Abschnitt 3 „Zustand“ sagen nicht, ob **beide** Ressourcentokens vorliegen und welche Zustimmung fehlt. M5 fragt nur, ob ein normaler Nutzer nach Adminzustimmung „ohne Rückfrage“ durchkommt; das kann mit einem Scope gelingen, während der andere bei Abruf oder Versand noch scheitert. Die bisherigen Handler kennen nur ein Passwort je Konto (`app/src/main/email/ipc.ts:122-129`, `:905-920`, `:2410-2418`).
Vorschlag: IMAP- und Graph-Berechtigung separat im Main prüfen, Marken anhand Konto und Ressource aus dem Cache beziehen und M5 für beide Operationen mit einem Nicht-Admin-Konto sowie nach Neustart wiederholen.

### F26 — Der heutige Send-Handler erreicht MIME erst nach dem SMTP-Versand
Schwere: hoch
ADR-Stelle: E9, Bauabschnitt 5, Antwort auf F06
Status: [OFFEN]
„Derselbe Nodemailer-Aufbau“ ist kein vorhandener isolierter MIME-Baustein. `email-send` verlangt zuerst ein gespeichertes Passwort und einen SMTP-Host (`app/src/main/email/ipc.ts:2407-2419`), erzeugt dann einen SMTP-Transporter mit Passwort (`:2437-2447`) und ruft `transporter.sendMail(mailOptions)` auf (`:2518-2525`). Erst **nach** diesem Versand erzeugt der `streamTransport` im Append-Zweig den MIME-Buffer (`:2534-2543`). Ein Microsoft-Konto ohne Passwort kommt derzeit nie bis dorthin; bei altem Passwort wäre ein versehentlicher doppelter Versand möglich, wenn Graph zusätzlich hinter `sendMail` gehängt wird. Die Rückgabe und der Renderer erwarten weiterhin `messageId`, `sentMailbox` und `sentUid` (`:2584`; `app/src/renderer/stores/emailStore.ts:1033-1040`).
Vorschlag: MIME-Erzeugung vor die strikt exklusiven SMTP- und Graph-Zweige ziehen, Passwort-/SMTP-Prüfung nur im Passwortzweig durchführen und je Zweig das Send-Ergebnis ausdrücklich definieren. Eine Gegenprobe muss belegen, dass pro Klick genau ein Transportpfad ausgeführt wird.

## Claude-Antwort

### Messung 10.11.2026 — Testmandant (Microsoft 365, Standardeinstellungen, neues Konto)

Vor jeder Entscheidung zu den Findings gemessen, mit `imapflow` und `nodemailer` aus `app/`:

- **IMAP mit Passwort:** abgelehnt, Servertext `Login is disabled`. Der Server bietet nur
  `AUTH=XOAUTH2` an. Die Ausgangsannahme des Plans (Passwortweg scheitert) ist damit belegt.
- **SMTP mit Passwort:** abgelehnt mit `535 5.7.139 … SmtpClientAuthentication is disabled for the
  Tenant`. Der klassische Versandweg ist für den ganzen Mandanten abgeschaltet — nach meinem
  Verständnis unabhängig von der Anmeldeart, also auch mit OAuth. Folge: Versand braucht in solchen
  Mandanten Graph (`Mail.Send`), selbst wenn der Abruf über IMAP läuft. Betrifft E1 und F06.
- **Zustimmung durch einen normalen Nutzer:** abgelehnt. Mit einer frisch registrierten
  Mehrmandanten-App (ohne geprüften Herausgeber, Rechte dynamisch angefragt) zeigt Microsoft dem
  Nutzer „Administratorgenehmigung erforderlich“ und die App als „nicht überprüft“ — auch im
  Mandanten, in dem die App registriert ist. Das Portal warnt bei der Registrierung selbst: „End
  users cannot grant consent to newly registered multitenant apps without verified publishers“.
  Stützt F08 (für Standardeinstellungen) und F09.
- **Nach Zustimmung eines Administrators** (Authorization Code mit PKCE, Systembrowser, Rückweg
  `http://localhost:<Port>`, öffentlicher Client ohne Geheimnis — E3 funktioniert so):
  - **IMAP mit OAuth (XOAUTH2):** Erfolg, Ordnerliste und Posteingang lesbar. Recht
    `https://outlook.office.com/IMAP.AccessAsUser.All`. IMAP ist in diesem Mandanten also an.
  - **Graph:** `/me` und `/me/mailFolders` lesbar; `/me/sendMail` antwortet `202`. Die Testmail kam
    an (Posteingang beim nächsten Lauf um eine Mail größer).
  - Erneuerungsmarke wird ausgegeben. Graph und IMAP sind zwei Ressourcen: zwei Marken, zwei
    Zustimmungsschritte (oder eine vorab erteilte Administratorzustimmung).
- **Nicht gemessen:** ob ein normaler Nutzer nach der Administratorzustimmung ohne Rückfrage
  durchkommt (der dritte Lauf lief erneut mit dem Administratorkonto); SMTP mit OAuth; ein Mandant
  mit abgeschaltetem IMAP; Versand mit Anhang, BCC, Antwort-Kopfzeilen über Graph (F06).

### Messung 10.11.2026, abends — Abschnitt 3 (MIME-Versand über Graph)

Drei Konten im selben Testmandanten: Absender und Blindkopie-Empfänger sind normale Nutzer,
der normale Empfänger ist ein Administratorkonto. Rohtext aus nodemailer `streamTransport`
(Zeilenenden LF), als Base64 an `POST /me/sendMail` mit `Content-Type: text/plain`. Kopfzeilen der
zugestellten Mails über `GET /me/messages/{id}/$value` gelesen.

| Messung | Ergebnis |
|---|---|
| M5 normale Nutzer nach Administratorzustimmung | kommen ohne Rückfrage durch, für Graph und für IMAP |
| M1 selbst gesetzte `Message-ID` | bleibt erhalten: beim Empfänger, beim Blindkopie-Empfänger, in der Gesendet-Kopie |
| **M2 Blindkopie, `Bcc:` im Rohtext** | Empfänger: keine `Bcc:`-Zeile, Adresse des Blindkopie-Empfängers nirgends in den Kopfzeilen. Blindkopie-Empfänger: Mail kommt an, keine `Bcc:`-Zeile, eigene Adresse nirgends in den Kopfzeilen. Gesendet-Kopie: genau eine, mit `Bcc:`-Zeile |
| M2 Gegenprobe, `Bcc:` aus dem Rohtext entfernt | Empfänger bekommt die Mail, der Blindkopie-Empfänger **nicht** — Graph leitet die Empfänger aus den Kopfzeilen ab, die Zeile muss also im Rohtext stehen |
| M4 Antwort-Kopfzeilen | `In-Reply-To` kommt an. Exchange führt die Testantwort nicht im selben Gespräch (`conversationId` verschieden) — der Testbetreff war aber kein „Re: …“, das Ergebnis sagt über echte Antworten nichts |
| M7 Gesendet-Ordner über IMAP | per SPECIAL-USE gefunden; die von Graph abgelegte Kopie ist dort über die `Message-ID` auffindbar und hat eine UID |
| M3 Anhänge | 1 MB, 2 × 2 MB, 5 MB, 20 MB (Anfrage 36 MB) jeweils `202` und zugestellt; 20 MB in 10,6 s |
| M6 Lebensdauer der Marken | 60–90 Minuten, Erneuerungsmarke wird ausgegeben |
| Zeilenenden | LF wird angenommen |

**Grenzen dieser Messung:** ein Mandant mit Standardeinstellungen; alle drei Postfächer liegen
**im selben Mandanten** — die Zustellung an einen fremden Mailserver ist nicht gemessen. Die Suche
des Messskripts fand eine der Mails 75 Sekunden lang nicht, obwohl sie laut Empfangszeit sofort da
war (Ursache ungeklärt, vermutlich Suchindex) — der Abgleich der Gesendet-Kopie darf sich also
nicht auf eine sofortige Suche verlassen. Nicht gemessen: M8 (Abbruch nach dem Absenden), M9
(Konto A an Konto B in derselben App), Mandantengrenzen für die Mailgröße, echtes „Re: …“.

**Folge für E9:** Die Schranke M2 ist für die Zustellung innerhalb eines Mandanten bestanden.

**Nachmessung über die Mandantengrenze (10.11.2026, spät):** zwei Mails vom Testkonto an ein
Postfach bei einem anderen Anbieter (Postfix-Server, kein Microsoft 365), Rohtext jeweils mit
`Bcc:`-Zeile an `POST /me/sendMail`. Ausgewertet wurde der vollständige Quelltext der angekommenen
Mails (im Mailprogramm des Empfängers geöffnet), nicht die Anzeige.

| Mail | Ergebnis im fremden Postfach |
|---|---|
| X — An: fremdes Postfach, Blindkopie: Konto im Mandanten | kommt an; keine `Bcc:`-Zeile; die Adresse des Blindkopie-Empfängers kommt im gesamten Quelltext nicht vor; selbst gesetzte `Message-ID` erhalten |
| Y — An: Konto im Mandanten, Blindkopie: fremdes Postfach | kommt an; keine `Bcc:`-Zeile; die eigene Adresse steht nur in Zeilen, die der empfangende Server selbst schreibt (`X-Original-To`, `Received … for`) |

**M2 ist damit auch über die Mandantengrenze bestanden.** Grenze: ein Absendermandant, ein fremder
Empfangsserver. E9 (MIME-Versand mit `Bcc:`-Zeile im Rohtext) kann gebaut werden.

### Antworten auf Runde 1 (nach Entscheidung des Nutzers für die Mischform, 10.11.2026)

Alle zitierten Codestellen aus F01–F03, F05, F06 und F10–F12 habe ich nachgeschlagen; sie stimmen.

- **F01 [ADRESSIERT]** — Abschnitt 1 ist auf den reinen Verbindungsaufbau der acht IMAP-Stellen
  verkleinert, ohne neuen Vertrag und ohne neue Typen. Die Anmeldeart kommt in beide Kontotypen (E2).
- **F02 [DISKUSSION]** — trägt, betrifft aber den Graph-Abruf, der aus diesem Plan herausgenommen
  ist (E1). Die Schwäche „dieselbe Message-ID in zwei Konten ist ein Datensatz“ besteht schon heute
  und wird hier nicht verändert. Gilt als Vorbedingung für ein späteres Graph-Abruf-Vorhaben.
- **F03 [DISKUSSION]** — wie F02: Die numerische Mailnummer bleibt, weil der Abruf IMAP bleibt.
  Einzige Berührung: Die lokale Gesendet-Kopie hat nach Graph-Versand zunächst `uid: 0`, bis der
  nächste Abruf sie nachträgt (`emailSync.ts:105–107`). Hängt an M1.
- **F04 [DISKUSSION]**, **F05 [DISKUSSION]**, **F07 [DISKUSSION]** — treffen den Graph-Abruf;
  zurückgestellt mit diesem.
- **F06 [ADRESSIERT]** — E9 (MIME statt JSON), E10 (Wortlaut „übergeben“), M1–M4 und M7 als
  Messungen vor dem Bau; fällt M1 oder M2 durch, wird E9 neu entschieden.
- **F08 [ADRESSIERT]** — Die Hürde ist am Testmandanten gemessen, nicht mehr behauptet; „IMAP oft
  aus“ ist als Annahme gestrichen. Administratoren-Seite mit delegierten Rechten in E11.
- **F09 [ADRESSIERT]** — als Vorlauf beim Nutzer geführt, nicht mehr als Rückfallebene dargestellt.
- **F10 [ADRESSIERT]** — MSAL-Node (E8), Marken nur im Main (E4), Loopback nur lokal (E3).
- **F11 [ADRESSIERT]** — Abschnitt 0 nimmt die Einstellungen aus der Konsole; die
  Administratoren-Seite nennt die Datenwege getrennt (E11). Die vorhandenen Betreff- und
  Message-ID-Ausgaben im Mailcode fasst dieser Plan nicht an; neu geschriebener Code hält die Regel.
- **F12 [ADRESSIERT]** — abgeleitete Konto-ID (E5), Löschen der Marke beim Abmelden und Entfernen
  (E4). Für Passwort-Konten bleibt die gerätelokale ID bestehen; das ist nicht Teil dieses Plans.
- **F13 [ADRESSIERT]** — Abnahmekriterien mit Fehlerfällen und Zweitgerät; nationale Clouds
  ausdrücklich draußen (E12).

### Antworten auf Runde 2 (Entscheidung des Nutzers vom 10.11.2026: alles außer F14 übernehmen)

Nachgeschlagen bzw. nachgemessen: F15 (`findSentMailbox` nur im Append-Zweig), F16/F17
(Verbindungsangaben aus dem Renderer), F18 (Probe mit nodemailer 10.2.1: `Bcc:` steht im
`streamTransport`-Rohtext, Zeilenenden nur LF), F24 (`Date.now()` auch in `EmailSettingsTab.tsx`),
F26 (MIME entsteht erst nach dem SMTP-Versand).

- **F14 [DISKUSSION]** — trägt, besteht aber schon heute. Als bekannte Einschränkung mit Test M9
  geführt, nicht in diesem Vorhaben gelöst (Entscheidung des Nutzers).
- **F15 [ADRESSIERT]** — E16, M7 erweitert.
- **F16 [ADRESSIERT]** — E2 neu gefasst.
- **F17 [ADRESSIERT]** — E13.
- **F18 [ADRESSIERT]** — E9 verschärft, M2 als harte Schranke. Nebenbefund: Der Kommentar
  `ipc.ts:2507–2509` stimmt nicht; die Gesendet-Kopie auf dem Server trägt vermutlich schon heute
  die `Bcc:`-Zeile. Wird in Abschnitt 2 berichtigt und dort gemessen.
- **F19 [ADRESSIERT]** — E14; eine allgemeine Grenze lässt sich nicht messen, deshalb eine eigene.
- **F20 [ADRESSIERT]** — E15, M8.
- **F21 [ADRESSIERT]** — E8 ergänzt, gepackter Build als Tor für Abschnitt 4.
- **F22 [ADRESSIERT]** — Abschnitt 0 weit gefasst; Abnahme bezieht sich auf das ausgelieferte
  Produkt. Die App schreibt die Konsole in keine eigene Datei (kein Treffer für eine Protokolldatei
  im Main); das gehört so auf die Administratoren-Seite.
- **F23 [ADRESSIERT]** — Abschnitt 1 auf die Optionserzeugung begrenzt, Gegenprobe je Stelle.
- **F24 [DISKUSSION]** — teilweise: Funktionierende Microsoft-Konten mit Passwort kann es nicht
  geben (gemessen: Passwort-Anmeldung abgelehnt), also praktisch kein Altbestand zu migrieren. Die
  Neuanmeldung auf einem zweiten Gerät steht in der Abnahme.
- **F25 [ADRESSIERT]** — E4 ergänzt, M5 erweitert.
- **F26 [ADRESSIERT]** — eigener Abschnitt 2 vor jedem Graph-Code.

## Status

Fassung 3 vom Nutzer freigegeben (10.11.2026).

- Abschnitt 0 und 1: erledigt, von Codex am Code geprüft (`microsoft-abschnitt-0-1-review.md`), auf master.
- Abschnitt 3: gemessen (siehe „Messung 10.11.2026, abends“); offen bleibt die Probe an ein Postfach
  außerhalb von Microsoft 365 und M8/M9.
- Abschnitt 4, Teil a (Main-Seite): `app/src/main/email/microsoftAuth.ts` mit 17 Tests,
  `@azure/msal-node` 7.1.2 exakt verankert (`npm audit` unverändert: sechs Befunde im Build-Werkzeug,
  keiner neu), IPC `email-microsoft-login|status|logout`. In der gebauten App mit Testprofil
  (nicht gepackt) echt angemeldet: Systembrowser, Rückweg, Ablage verschlüsselt, nach Neustart
  Abruf und Versand weiter berechtigt. Offen: Oberfläche (Teil b), gepackter Build als Tor,
  Codex-Review.
- Abschnitt 4, Teil a nach Codex-Review (`microsoft-abschnitt-4a-review.md`, F01–F13) gehärtet. Dabei
  eine Lücke im Bestand gefunden und auf master behoben: die Konto-ID der Mailpasswörter ging
  ungeprüft in den Dateipfad (`main/email/credentialPath.ts`).
- Abschnitt 4, Teil b (Einstellungen): Konto-Karte und Anmelde-Zeile, im Testprofil mit echtem Konto
  geprüft (anmelden, Zustand, abmelden, entfernen). Offen: Onboarding, gepackter Build.
- Abschnitt 5 (Abruf mit Marke): `resolveImapLogin` in `app/src/main/email/ipc.ts`, `buildImapOptions`
  nimmt Passwort oder Zugangsmarke. Im Testprofil mit echtem Konto geprüft: Verbindungstest,
  Ordnerliste (SPECIAL-USE vorhanden), Abruf aus „Gesendete Elemente“ in den Test-Vault (Ordner, UID,
  Anhangnamen, Message-ID erhalten), Anhang laden, Kennzeichen setzen — jeweils mit absichtlich
  falschem Server in den Angaben des Renderers, der verworfen wurde. Nicht geprüft: Verschieben,
  Weiterleiten mit Anhang, Abruf über die Oberfläche, Analyse der abgerufenen Mails, langer Abruf
  über die Lebensdauer der Marke hinaus. **Kein Codex-Review** (Limit erreicht am 10.11.2026):
  offen für die Hardening-Runde 2 (`microsoft-abschnitt-4a-review.md`), die Einstellungsseite und
  diesen Abschnitt.
- Abschnitt 6 (Versand über Graph): `app/src/main/email/graphSend.ts` (13 Tests), Weiche am Anfang
  von `email-send`, `locateMicrosoftSentCopy`, Erfolgstext „An Microsoft übergeben“. Die festen
  Anforderungen aus dem Review von Abschnitt 2 sind umgesetzt bis auf den Handler-Test mit
  kontrollierten Transporten: getestet ist das Sendemodul für sich, nicht der Handler. Im Testprofil
  mit echtem Konto: eine Mail mit Anhang zwischen zwei Testkonten, angenommen in 1,3 s, Kopie im
  Gesendet-Ordner mit UID gefunden; im Quellbestand der abgerufenen Kopie steht der Absender aus der
  Anmeldung, von absichtlich falsch mitgeschickten Absender- und Serverangaben keine Spur. Nicht
  geprüft: Senden über das Schreibfenster, Blindkopie und Antwort aus der App heraus, Signaturbild,
  große Anhänge aus der App, der unklare Zustand am echten Netz, Ankunft dieser einen Mail beim
  Empfänger. **Kein Codex-Review.**
- Abschnitt 7, Teil Onboarding: `EmailSetupStep.tsx` zeigt für „Microsoft 365“ die Anmeldung im
  Browser statt der Passwortfelder; vom Nutzer im Testprofil gesehen. Offen: Seite für
  Administratoren, gepackter Build, Codex-Review.
- Tor „gepackter Build“ (10.11.2026, macOS arm64, `electron-builder --dir`, lokal ad-hoc signiert,
  eigener Profilordner über `--user-data-dir`): MSAL liegt im `app.asar` und lädt; Anmeldung im
  Systembrowser, Verbindungstest und Ordnerliste über IMAP mit Marke, Neustart mit erhaltener
  Anmeldung, Abmelden; Passwort-IPC weist präparierte IDs und Microsoft-IDs ab; das Produktivprofil
  blieb unberührt (keine Sperrdatei). Nicht geprüft: Developer-ID-signierter und notarisierter Build
  (lokales Signieren scheitert an zwei gleichnamigen Zertifikaten im Schlüsselbund des Nutzers; die
  Releases signiert die CI), Windows, Linux, Versand und Abruf von Mails im gepackten Build.
- Abschnitt 2: Aufbau der Mail nach `app/src/main/email/outgoing.ts` gezogen (`buildOutgoingMail`,
  `renderRawMessage`, 8 Tests; der verschobene Code ist per Parser tokengleich). Die Reihenfolge der
  Prüfungen im Handler (Passwort, SMTP-Host, Anhänge) ist bewusst unverändert; die Trennung in zwei
  Transportzweige entsteht erst mit dem Graph-Versand (Abschnitt 6), weil es vorher keinen zweiten
  Zweig gibt. Festgestellt und per Test festgehalten: Der Rohtext für die Gesendet-Kopie enthält die
  `Bcc:`-Zeile — die Kopie auf dem Server trägt sie heute schon.
