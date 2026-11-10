# Microsoft-Vorarbeit: Abschnitt 0 (Mail-Logs) und Abschnitt 1 (IMAP-Optionen) — Code-Review

Stand: 10.11.2026 · Bauender: Claude · Prüfer: Codex · Abnahme: Nutzer

## Aufgabe

Zwei Commits auf dem Zweig `feat/microsoft-vorarbeit` am Code prüfen. Beide sollen das Verhalten
der App nicht ändern (Abschnitt 0 nur die Konsolenausgabe). Gesucht: Verhaltensänderungen, die
trotzdem passiert sind; Stellen, an denen weiter Personenbezug im Log landet; Fälle, in denen der
Filter zu viel oder zu wenig ersetzt. Keine Code-Edits im Review.

Plan und Vorgeschichte: `docs/codex-collab/microsoft-365-anbindung.md` (Fassung 3, Abschnitte 0
und 1; Findings F11, F22, F23).

## Kontext/Anker

- Commit `5e293a2b` — `app/src/shared/logRedaction.ts` (+ Test), Aufrufe in
  `app/src/main/email/ipc.ts`, `app/src/renderer/stores/emailStore.ts`,
  `app/src/renderer/stores/uiStore.ts`. Diff: `git show 5e293a2b`.
- Commit `13c65ef4` — `app/src/main/email/connection.ts` (+ Test), acht Aufrufe in
  `app/src/main/email/ipc.ts`. Diff: `git show 13c65ef4 -- app/src`.
- Vorzustand zum Vergleich: `git show 271b1969:app/src/main/email/ipc.ts`.

Vom Bauenden geprüft: typecheck, build, vitest (ein bekannter Zeitlimit-Ausfall in
`shellExecution.test.ts` im Gesamtlauf, einzeln grün); sechs IMAP-Stellen per CDP in der gebauten
App bis zum Verbindungsversuch; Gegenprobe des Nutzers am echten Postfach (abrufen, senden mit
Anhang samt Gesendet-Kopie, weiterleiten, verschieben) ohne Fehler, im Log keine Adresse.

Bekannt und bewusst so: Vault-Pfade und Konto-IDs (`email-<Zeitstempel>`) stehen weiter im Log.

## Codex-Findings

Vergleich von `271b1969` mit `5e293a2b` und `13c65ef4`: An den acht IMAP-Aufrufen sind Host, Port, Benutzer, Passwort, `secure` (einschließlich `!!imapTls` beim Gesendet-Append), `logger`, beide Zeitlimits, Listener und Fehlerwege gleich geblieben (`app/src/main/email/ipc.ts:184`, `app/src/main/email/ipc.ts:210`, `app/src/main/email/ipc.ts:276`, `app/src/main/email/ipc.ts:377`, `app/src/main/email/ipc.ts:456`, `app/src/main/email/ipc.ts:509`, `app/src/main/email/ipc.ts:894`, `app/src/main/email/ipc.ts:2520`; `app/src/main/email/connection.ts:34`). In `5e293a2b` wurden keine Rückgabewerte oder UI-Fehlertexte geändert; die folgenden Befunde betreffen die Logwirkung und die zusätzlich ausgeführte Filterarbeit. In `InboxPanel`, `emailContextBuilder` und `main/workflows` gibt es keine direkten `console`-Aufrufe.

### F01 — Modellantwort erscheint weiterhin im Analyse-Log
Schwere: hoch
ADR-Stelle: app/src/main/email/ipc.ts:1547
Status: [OFFEN]

Bei ungültigem JSON übernimmt `httpError` die ersten 160 Zeichen der Modellantwort (`app/src/main/email/ipc.ts:1547-1548`). Nach einem fehlgeschlagenen Analyseversuch wird dieser Fehler als `lastError` geloggt (`app/src/main/email/ipc.ts:1676-1677`). `redactForLog` entfernt Namen und Mailinhalt nicht (`app/src/shared/logRedaction.ts:31-38`). Bei einem kurzen Modellnamen wie `gpt-oss` beginnt der Antwort-Auszug an Zeichen 153 des Fehlertexts; die zusätzliche Kürzung auf 160 Zeichen lässt noch sieben Zeichen der Antwort im Log. Das neue Längen-Log an `app/src/main/email/ipc.ts:1549` schließt diesen zweiten Weg nicht.

Vorschlag: Für die Konsole einen festen Fehlercode und die Antwortlänge loggen; den UI-Fehlertext getrennt behandeln.

### F02 — Fehler gelangt nach der Main-Bereinigung unbereinigt ins Renderer-Log
Schwere: hoch
ADR-Stelle: app/src/main/email/ipc.ts:809
Status: [OFFEN]

`email-save` bereinigt den Fehler nur für seine eigene Konsole, gibt aber `error.message` unverändert per IPC zurück (`app/src/main/email/ipc.ts:809-810`). Der Renderer schreibt genau `result.error` ohne Filter in die Konsole (`app/src/renderer/stores/emailStore.ts:415`, `app/src/renderer/stores/emailStore.ts:445`). Ein Fehlertext mit Adresse oder Message-ID wird damit trotz bereinigtem Main-Log erneut ausgegeben. Weitere rohe Fehler-Logs stehen unter anderem in `app/src/renderer/stores/emailStore.ts:408`, `app/src/renderer/stores/emailStore.ts:518`, `app/src/renderer/stores/emailStore.ts:623`, `app/src/renderer/stores/contactStore.ts:136` und beim Mail-Workflow in `app/src/renderer/stores/workflowStore.ts:647`; ob deren konkrete Fehler Maildaten enthalten, hängt vom Auslöser ab.

Vorschlag: Alle Mail-bezogenen Konsolenausgaben an beiden Prozessgrenzen bereinigen; den für die Oberfläche benötigten Fehlertext davon getrennt lassen.

### F03 — Frei benannte IMAP-Ordner stehen weiter direkt im Log
Schwere: mittel
ADR-Stelle: app/src/main/email/ipc.ts:300
Status: [OFFEN]

Beim Verschieben werden Quell- und Zielordner, beim Abruf `fetchFolder` und beim Gesendet-Append der gefundene Ordnername ohne Filter geloggt (`app/src/main/email/ipc.ts:300`, `app/src/main/email/ipc.ts:958`, `app/src/main/email/ipc.ts:2539`). Benutzer können Ordner nach Personen, Fällen oder Projekten benennen. Die ausdrückliche Ausnahme im Review-Kontext nennt Vault-Pfade und Konto-IDs (`docs/codex-collab/microsoft-abschnitt-0-1-review.md:29`), nicht Ordnernamen.

Vorschlag: Ordnerpfade in Konsolenausgaben durch eine opake Kennung oder eine feste Rollenbezeichnung ersetzen.

### F04 — Adressfilter lässt Unicode und URL-kodierte Adressen durch
Schwere: hoch
ADR-Stelle: app/src/shared/logRedaction.ts:17
Status: [OFFEN]

`ADDRESS_RE` akzeptiert nur ASCII im lokalen Teil und im Domainteil (`app/src/shared/logRedaction.ts:18`). Der direkte Funktionsaufruf ergibt für `max@büro.de` unveränderten Text und für `büro@schule.de` sogar `bü<adresse>`; eine IDN-Domain in Punycode wird dagegen erfasst. `max%40schule.de` bleibt ebenfalls stehen, weil `%40` nicht als `@` erkannt wird. Ein Anzeigename wie `Müller <büro@schule.de>` bleibt als `Müller <message-id>` sichtbar, da `MESSAGE_ID_RE` jede passende Klammeradresse als Message-ID behandelt (`app/src/shared/logRedaction.ts:17`, `app/src/shared/logRedaction.ts:36`). Die Tests decken nur ASCII-Adressen ab (`app/src/shared/logRedaction.test.ts:5-15`).

Vorschlag: Fehlertexte grundsätzlich als potenziell personenbezogen behandeln und nur gezielt freigegebene Diagnosedaten loggen; ergänzend Unicode-, IDN-, URL-kodierte und Anzeigenamen-Fälle testen.

### F05 — Markenfilter erfasst nur einige Schreibweisen und kann Marken teilweise stehen lassen
Schwere: hoch
ADR-Stelle: app/src/shared/logRedaction.ts:15
Status: [OFFEN]

`BEARER_RE` erkennt nur die aufgezählten Feldnamen, Trenner und Zeichenklassen (`app/src/shared/logRedaction.ts:16`). Direkte Funktionsaufrufe lassen `Authorization: Basic dXNlcjpwYXNzd29yZA==` und `token=0.AXoA1234567890%2Ffoo%2Bbar` unverändert; bei `Authorization: Bearer abcdefghijklmnop%2Fsecret` bleibt `%2Fsecret` nach `<marke>` stehen. Ob genau diese Formen in den hier eingesetzten Bibliotheken vorkommen, ist nicht belegt; als allgemeine Aussage „Zugangsmarken werden ersetzt“ trägt der Helfer nicht. Umgekehrt wird ein gewöhnliches `code: 1234567890123456` als Marke ersetzt und kann Diagnoseinformation verdecken (`app/src/shared/logRedaction.ts:16`). Die Tests verwenden nur JWT und einen einfachen `refresh_token` (`app/src/shared/logRedaction.test.ts:17-23`).

Vorschlag: Keine beliebigen Fehlerobjekte mit möglichem Geheimnis loggen; für bekannte Fehlerquellen nur freigegebene Felder ausgeben und Tokenformate gezielt testen.

### F06 — Filterarbeit ist vor der Kürzung unbegrenzt und kann den Fehlerweg bremsen
Schwere: mittel
ADR-Stelle: app/src/shared/logRedaction.ts:33
Status: [OFFEN]

Alle globalen regulären Ausdrücke laufen über den vollständigen Fehlertext; auf 2.000 Zeichen gekürzt wird erst danach (`app/src/shared/logRedaction.ts:33-38`). `ADDRESS_RE` beginnt mit einer beliebig langen Zeichenklasse und prüft an vielen Startpositionen erneut auf `@` (`app/src/shared/logRedaction.ts:18`). Bei `a` ohne `@` stieg die Laufzeit im direkten Node-Aufruf ungefähr von 10 ms für 4.000 auf 160 ms für 16.000 Zeichen. Ein langer vom Server oder Modell stammender Fehler kann daher den vermeintlich reinen Konsolenpfad merklich verzögern. Der Längentest prüft nur die Ausgabe, nicht den Aufwand (`app/src/shared/logRedaction.test.ts:38-42`).

Vorschlag: Eingabetext vor den Mustern begrenzen und Muster ohne wiederholtes Abtasten langer Präfixe verwenden; einen Test mit langer Nicht-Adresse ergänzen.

### F07 — `mailRef` ist kollisionsanfällig und über Logdateien hinweg verknüpfbar
Schwere: niedrig
ADR-Stelle: app/src/shared/logRedaction.ts:41
Status: [OFFEN]

Die Referenz ist ein ungesalzener 32-Bit-FNV-Hash (`app/src/shared/logRedaction.ts:42-49`). Im direkten Aufruf ergeben die verschiedenen IDs `<cf3sut@a.de>` und `<19f7nm0@a.de>` beide `mail#e5cbd88f`; `undefined` und die leere ID ergeben ebenfalls dieselbe Kennung. Die Ausgabe ist außerdem über Sitzungen und Geräte stabil, sodass dieselbe Mail in zusammengeführten Logs wiedererkannt werden kann. Der Test vergleicht nur zwei willkürliche IDs (`app/src/shared/logRedaction.test.ts:53-67`).

Vorschlag: Die Kennung nur als Diagnosehilfe ohne Eindeutigkeits- oder Anonymitätszusage dokumentieren; falls Verknüpfbarkeit unerwünscht ist, einen sitzungsgebundenen Zufallsbezug verwenden.

### F08 — Die Tests sichern die acht Aufrufverträge nicht ab
Schwere: niedrig
ADR-Stelle: app/src/main/email/connection.test.ts:4
Status: [OFFEN]

Die zwei Helfertests prüfen nur ein Standardobjekt und einen TLS/Timeout-Gegenfall (`app/src/main/email/connection.test.ts:4-34`). Sie prüfen weder die acht tatsächlichen Zuordnungen in `app/src/main/email/ipc.ts:184`, `app/src/main/email/ipc.ts:210`, `app/src/main/email/ipc.ts:276`, `app/src/main/email/ipc.ts:377`, `app/src/main/email/ipc.ts:456`, `app/src/main/email/ipc.ts:509`, `app/src/main/email/ipc.ts:894` und `app/src/main/email/ipc.ts:2520` noch den Sonderfall `!!account.imapTls` beim Append (`app/src/main/email/ipc.ts:2521`). Der manuelle Diff-Vergleich zeigt aktuell keine Abweichung; ein später vertauschtes Feld oder Zeitlimit würde durch diese Tests nicht auffallen.

Vorschlag: Die Optionen an den Aufrufgrenzen mit gezielten Tests oder einem strukturellen Vergleich zum festgehaltenen Vorzustand absichern.

## Claude-Antwort

Alle acht Befunde nachgestellt (direkte Aufrufe des Helfers, Laufzeitmessung, Logstellen
nachgeschlagen); sie stimmen. Vom Nutzer am 10.11.2026 freigegeben: F01–F06 beheben, F07
dokumentieren, F08 zurückstellen.

- **F01 [ADRESSIERT]** — `firstSentenceForLog` (`app/src/shared/logRedaction.ts`) loggt nur den
  ersten Satz des für die Oberfläche gebauten Fehlertexts; der Antwort-Auszug steht dahinter und
  fällt weg. Test mit genau dem Fall „gpt-oss“. Der UI-Fehlertext ist unverändert.
- **F02 [ADRESSIERT]** — elf Fehlerausgaben in `renderer/stores/emailStore.ts`, eine in
  `contactStore.ts` und `runForNewEmails` in `workflowStore.ts` laufen durch `redactForLog`. Die
  übrigen `workflowStore`-Ausgaben (kein Mailbezug) sind nicht angefasst.
- **F03 [ADRESSIERT]** — `folderRef`: Standardordner bleiben lesbar, eigene Ordner werden zur
  Kennung. Eingesetzt beim Verschieben, beim Abruf-Kontingent und beim Gesendet-Append.
- **F04 [ADRESSIERT]** — Adressmuster negativ formuliert (Umlaute, IDN), `%40`, Anzeigename vor
  einer Klammeradresse (in Anführungszeichen oder ein bis drei großgeschriebene Wörter). Klammerformen
  mit `@` heißen jetzt `<kennung>`, weil Adresse und Message-ID nicht unterscheidbar sind.
  Grenze bleibt: Ein Name ohne Adresse rutscht durch — steht so im Dateikopf.
- **F05 [ADRESSIERT]** — `Bearer`/`Basic` mit beliebigem Rest, Felder `token`, `secret`, `password`
  u.a., `code=` nur noch als URL-Parameter; ein nacktes `code: 1234…` bleibt lesbar.
- **F06 [ADRESSIERT]** — Eingabe wird vor den Mustern auf 4000 Zeichen gekürzt, das Adressmuster
  beginnt nur an einer Wortgrenze (Lookbehind). Test: 200 000 Zeichen ohne `@` und drei weitere
  ungünstige Eingaben jeweils unter 100 ms.
- **F07 [ADRESSIERT]** — im Dateikopf als Diagnosehilfe ohne Eindeutigkeits- oder
  Anonymitätszusage dokumentiert; fehlende Kennung ergibt `mail#unbekannt` statt eines Hashs.
- **F08 [DISKUSSION]** — zurückgestellt: Die acht Aufrufe ändern sich in Plan-Abschnitt 5 (Abruf
  mit Marke) und bekommen dort Tests an der Aufrufgrenze.

Geprüft: typecheck, `logRedaction.test.ts` (18 Tests), Gesamtlauf vitest 3658 grün; ein Ausfall in
`shellExecution.test.ts` (Zeitlimit, tritt bei laufender Dev-App in jedem Gesamtlauf auf, einzeln grün).

## Status

Runde 1 beantwortet, Korrekturen im Arbeitsbaum (nicht committet). Wartet auf Abnahme des Nutzers.
