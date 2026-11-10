# Microsoft-Vorarbeit: Abschnitt 2 (Aufbau der ausgehenden Mail) — Code-Review

Stand: 10.11.2026 · Bauender: Claude · Prüfer: Codex · Abnahme: Nutzer

## Aufgabe

Commit `fe283ffa` auf dem Zweig `refactor/email-send-ordnen` am Code prüfen. Er soll das Verhalten
des Versands nicht ändern. Gesucht: Verhaltensänderungen, die trotzdem passiert sind; Lücken der
neuen Tests; Stellen, an denen die Trennung „Mail bauen“ / „Mail transportieren“ für den späteren
Graph-Versand nicht trägt. Keine Code-Edits im Review.

Plan und Vorgeschichte: `docs/codex-collab/microsoft-365-anbindung.md` (Fassung 3, Abschnitt 2;
Findings F18, F26).

## Kontext/Anker

- `app/src/main/email/outgoing.ts` — `buildOutgoingMail`, `renderRawMessage` (neu).
- `app/src/main/email/outgoing.test.ts` — 8 Tests.
- `app/src/main/email/ipc.ts` — Handler `email-send`; Aufrufe von `buildOutgoingMail` und
  `renderRawMessage`. Diff: `git show fe283ffa -- app/src`.
- Vorzustand: `git show 1d5afe7a:app/src/main/email/ipc.ts`, Zeilen 2349–2559.

Vom Bauenden geprüft: Der verschobene Block ist per TypeScript-Parser tokengleich (543 Blatt-Token,
Kommentare ausgenommen); typecheck, build, vitest. Nicht geprüft beim Commit: Versand gegen ein
echtes Postfach (Gegenprobe des Nutzers läuft).

Bewusst so: Die Reihenfolge der Prüfungen im Handler (Passwort, SMTP-Host, Anhänge) bleibt; zwei
Transportzweige entstehen erst mit dem Graph-Versand.

## Codex-Findings

Der Diff gegen `1d5afe7a` zeigt für den heutigen SMTP-Pfad keine Änderung der Empfängerprüfung, Passwort- und SMTP-Host-Prüfung, Anhangprüfung, Transporter-Optionen, Signaturbild-Behandlung, `mailOptions`, Message-ID-Bildung, Rückgabewerte oder Fehlertexte (`app/src/main/email/ipc.ts:2374-2485`; `app/src/main/email/outgoing.ts:39-117`). `nodemailer` bleibt vor der Passwortprüfung dynamisch importiert; `crypto` wird während des Mailaufbaus und `imapflow` erst nach dem Senden dynamisch importiert (`app/src/main/email/ipc.ts:2383`, `app/src/main/email/outgoing.ts:114`, `app/src/main/email/ipc.ts:2447`). Neu ist ein weiterer dynamischer `nodemailer`-Import im Rohtext-Helfer nach dem Versand (`app/src/main/email/outgoing.ts:130`); eine beobachtbare Abweichung daraus ist nicht belegt. Die folgenden Befunde betreffen die behauptete Trennlinie, die Gesendet-Kopie und die Tests.

### F01 — Rohtext entsteht weiterhin erst nach dem SMTP-Versand
Schwere: mittel
ADR-Stelle: app/src/main/email/ipc.ts:2425
Status: [OFFEN]

`buildOutgoingMail` erzeugt vor dem Versand nur `mailOptions`; der SMTP-Transporter wird sogar davor angelegt (`app/src/main/email/ipc.ts:2412-2428`). `renderRawMessage` läuft erst nach erfolgreichem `sendMail`, nach der zweiten Passwortabfrage und nur im IMAP-Append-Zweig (`app/src/main/email/ipc.ts:2438-2447`). Damit ist die im Plan für Abschnitt 2 genannte MIME-Erzeugung vor dem Versand noch nicht umgesetzt (`docs/codex-collab/microsoft-365-anbindung.md:165-167`). Ein Graph-Zweig kann diesen Handler nicht einfach um einen Transportaufruf ergänzen: Er muss vor den SMTP-Pflichtprüfungen abzweigen und darf den SMTP-Aufruf nicht erreichen. Die heutige Reihenfolge ist gegenüber `1d5afe7a` bewusst gleich, aber die Schnittstelle allein sichert „genau ein Transportweg je Klick“ nicht.

Vorschlag: Beim Graph-Bau die Transportentscheidung vor Passwort-, SMTP-Host- und Transporter-Zugriff treffen und beide Zweige getrennt testen.

### F02 — SMTP-Mail und Gesendet-Kopie werden zweimal serialisiert
Schwere: mittel
ADR-Stelle: app/src/main/email/outgoing.ts:120
Status: [OFFEN]

`transporter.sendMail(mailOptions)` serialisiert und verschickt die Mail zuerst; `renderRawMessage(mailOptions)` lässt Nodemailer anschließend denselben Optionssatz erneut serialisieren (`app/src/main/email/ipc.ts:2428`, `app/src/main/email/ipc.ts:2445`, `app/src/main/email/outgoing.ts:129-133`). Die feste Message-ID ist gleich, die Rohbytes sind es nicht zwingend: Zwei direkte Aufrufe von `renderRawMessage` mit demselben Objekt erzeugten bereits verschiedene MIME-Grenzen. Anhänge und Signaturbild werden als Dateipfade übergeben (`app/src/main/email/outgoing.ts:52-62`), also beim zweiten Lauf erneut gelesen; eine zwischenzeitlich geänderte oder entfernte Datei kann die Serverkopie vom zugestellten Inhalt unterscheiden oder den Append scheitern lassen. Dieses Risiko bestand vor dem Auszug; der Kommentar „RFC-822-Bytes derselben Mail“ garantiert hier nur dieselbe Message-ID, keine inhaltlich identische Kopie. Die Tests prüfen nur eine Serialisierung (`app/src/main/email/outgoing.test.ts:101-111`).

Vorschlag: Entweder die mögliche Abweichung ausdrücklich dokumentieren oder einen einmal erzeugten MIME-Inhalt für beide Wege verwenden, sofern der jeweilige Transport das sicher unterstützt.

### F03 — Bcc in der Serverkopie ist nur für den Append-Input belegt; lokal fehlt Bcc
Schwere: mittel
ADR-Stelle: app/src/main/email/outgoing.ts:123
Status: [OFFEN]

Die korrigierte Aussage über den *Rohtext* stimmt: Der installierte Stream-Transport setzt `keepBcc = true` (`app/node_modules/nodemailer/dist/cjs/stream-transport/index.js:71-75`), während der MIME-Standardpfad die Bcc-Zeile auslässt (`app/node_modules/nodemailer/dist/cjs/mime-node/index.js:228-230`, `app/node_modules/nodemailer/dist/cjs/mime-node/index.js:708-711`). Der Test findet die Kopfzeile (`app/src/main/email/outgoing.test.ts:115-120`). Bei erfolgreichem IMAP-Append gibt der Client genau diesen Buffer weiter (`app/src/main/email/ipc.ts:2445`, `app/src/main/email/ipc.ts:2461`). Dass die Kopie auf jedem Server unverändert abrufbar ist, prüft der Test nicht; bei fehlendem Ordner, Passwort oder Append-Fehler entsteht dort durch diesen Pfad gar keine Kopie (`app/src/main/email/ipc.ts:2438-2479`). Die sofort angelegte *lokale* Gesendet-Mail enthält `to` und `cc`, aber kein `bcc` (`app/src/renderer/stores/emailStore.ts:1034-1057`); `EmailMessage` hat dafür auch kein Feld (`app/src/shared/types.ts:1707-1719`). Sie wird so im Mailstore gespeichert und bei aktivem Sync eingeschlossen (`app/src/renderer/stores/emailStore.ts:1063-1071`, `app/src/main/email/store.ts:119-135`, `app/src/main/sync/fileTracker.ts:60-80`, `app/src/main/sync/fileTracker.ts:105-113`). Ein späterer Abruf derselben Message-ID überspringt den Vollimport und gleicht nur Flags, Ordner, UID und Reply-To ab (`app/src/main/email/ipc.ts:984-988`, `app/src/shared/emailSync.ts:87-117`). Bcc wird damit lokal nicht nachgetragen.

Vorschlag: Die Aussage zur Serverkopie auf erfolgreichen Append und die tatsächlich geprüften Rohbytes begrenzen; lokale und serverseitige Gesendet-Daten getrennt beschreiben.

### F04 — `renderRawMessage` ist noch kein sicherer Graph-Versandtext
Schwere: hoch
ADR-Stelle: app/src/main/email/outgoing.ts:129
Status: [OFFEN]

Der Helfer liefert bei Bcc-Empfängern einen MIME-Buffer mit `Bcc:`-Kopfzeile (`app/src/main/email/outgoing.ts:104-105`, `app/src/main/email/outgoing.ts:123-133`, `app/src/main/email/outgoing.test.ts:115-120`). Der SMTP-Umschlag mit allen Empfängern ist nur eine Nodemailer-Option (`app/src/main/email/outgoing.ts:82-89`); er ist nicht Teil dieses Buffers. E9 will genau den Buffer an Graph übergeben, E9 verschärft verlangt davor die Rohkopfzeilen-Messung M2 (`docs/codex-collab/microsoft-365-anbindung.md:64`, `docs/codex-collab/microsoft-365-anbindung.md:145`). Bis diese Messung die zugestellten Kopien bestätigt, darf die Funktion trotz des transportneutralen Namens nicht direkt als Graph-Sendepfad gelten. Ein bloßes Entfernen von `Bcc:` wäre ebenfalls keine belegte Lösung, weil der getrennte SMTP-Umschlag bei diesem Pfad fehlt. Ob Graph die Zeile entfernt und Bcc dennoch zustellt, ist hier nicht sicher bekannt.

Vorschlag: M2 an To-, Cc-, Bcc- und Gesendet-Rohkopfzeilen ausführen und die Graph-spezifische MIME-Erzeugung erst danach festlegen.

### F05 — Der Mailaufbau vertraut weiterhin Absenderdaten des Renderers
Schwere: hoch
ADR-Stelle: app/src/main/email/outgoing.ts:77
Status: [OFFEN]

Der Renderer sendet `user`, `name` und `fromAddress` als Teil von `account` über IPC (`app/src/renderer/stores/emailStore.ts:1017-1032`); der Handler gibt `composeData` direkt an `buildOutgoingMail` (`app/src/main/email/ipc.ts:2350-2373`, `app/src/main/email/ipc.ts:2425`). Daraus werden `From`, `Sender`, Umschlag-Absender und der Hostteil der Message-ID gebaut (`app/src/main/email/outgoing.ts:77-83`, `app/src/main/email/outgoing.ts:112-116`). Für den heutigen SMTP-Pfad ist das Altverhalten. Für Microsoft-Konten verlangt E13 aber ausdrücklich, Absender und übrige Verbindungsangaben aus dem Main-seitigen Kontostand zu nehmen und Rendererwerte zu ignorieren (`docs/codex-collab/microsoft-365-anbindung.md:142`). Die neue gemeinsame Schnittstelle erzwingt diese Grenze nicht; ein Graph-Zweig, der denselben Aufruf übernimmt, würde sie verletzen.

Vorschlag: Vor `buildOutgoingMail` ein vom Main ermitteltes, kontogebundenes Absenderprofil einsetzen und den Renderer-Account nicht als vertrauenswürdige Eingabe des Graph-Zweigs verwenden.

### F06 — Der gemeinsame Typ enthält SMTP- und Umschlag-Annahmen
Schwere: mittel
ADR-Stelle: app/src/main/email/outgoing.ts:19
Status: [OFFEN]

`OutgoingMailInput.account` verlangt `smtpHost`, obwohl der Graph-Zweig keinen SMTP-Host benötigt; die Message-ID fällt bei fehlender Absenderadresse und fehlendem Benutzernamen sogar auf diesen Host zurück (`app/src/main/email/outgoing.ts:19-24`, `app/src/main/email/outgoing.ts:112-115`). Gleichzeitig baut die Funktion immer einen SMTP-Umschlag in `mailOptions`, während `renderRawMessage` nur den MIME-Buffer zurückgibt (`app/src/main/email/outgoing.ts:79-89`, `app/src/main/email/outgoing.ts:129-133`). `Record<string, unknown>` beschreibt weder die erforderlichen MIME-Felder noch getrennte SMTP-Empfänger typisiert (`app/src/main/email/outgoing.ts:29-32`). Das funktioniert für Nodemailer heute, legt für Graph aber einen Dummy-SMTP-Wert und implizite Empfängerregeln nahe.

Vorschlag: Absenderidentität und Empfänger als transportneutrale Daten modellieren; SMTP-Host und Umschlag erst im SMTP-Zweig ergänzen und die Nodemailer-Optionen passend typisieren.

### F07 — Die acht Tests prüfen weder den Handler noch die tatsächliche HTML-Erzeugung
Schwere: mittel
ADR-Stelle: app/src/main/email/outgoing.test.ts:7
Status: [OFFEN]

Alle Tests übergeben einen eigenen Minimal-Renderer statt `renderEmailHtml` aus dem Handler (`app/src/main/email/outgoing.test.ts:7`, `app/src/main/email/ipc.ts:2323-2343`, `app/src/main/email/ipc.ts:2425`). Keiner prüft die Reihenfolge und Fehlerwege von Empfänger-, Passwort-, SMTP-Host- und Anhangprüfung, die zweite Passwortabfrage, den tatsächlichen SMTP-Umschlag oder die Rückgabe bei fehlgeschlagenem Append (`app/src/main/email/ipc.ts:2374-2485`). Der Rohtext-Test prüft Message-ID, Betreff, einen Dateinamen und LF, aber nicht `From`/`To`/`Cc`, Antwort-Header, HTML, Bild-CID oder Anhangsbytes (`app/src/main/email/outgoing.test.ts:101-111`). Der Bcc-Test prüft nur den Stream, nicht den SMTP-Versand ohne Bcc-Kopfzeile (`app/src/main/email/outgoing.test.ts:113-121`). Die Tests können daher eine Vertauschung an den Prozess- und Transportgrenzen nicht erkennen.

Vorschlag: Einen gezielten Handler-Test mit kontrollierten Transporten sowie MIME- und SMTP-Kopfzeilenprüfungen ergänzen; dabei die produktive HTML-Funktion verwenden.

## Claude-Antwort

Vom Nutzer am 10.11.2026 freigegeben: F02/F03 präzisieren, Tests ergänzen, F01/F04/F05/F06 und der
Handler-Test aus F07 als feste Anforderungen an den Graph-Schritt.

- **F01 [DISKUSSION]** — trägt und war so gewollt (Reihenfolge unverändert). Als Anforderung an
  Abschnitt 6 in den Plan geschrieben.
- **F02 [ADRESSIERT]** — Kommentar von `renderRawMessage` sagt jetzt ausdrücklich: gleiche
  Message-ID, keine byte-gleiche Kopie, Anhänge werden erneut gelesen. Test hält es fest. Nicht
  geändert: beide Wege aus einem Rohtext zu speisen würde `Bcc:` in den Versand tragen.
- **F03 [ADRESSIERT]** — Aussage auf erfolgreichen Append begrenzt; lokale Gesendet-Mail ohne Bcc
  ausdrücklich genannt (Kommentar und `.claude/rules/email.md`).
- **F04 [DISKUSSION]** — trägt; Anforderung an Abschnitt 6, Kommentar verweist auf M2.
- **F05 [DISKUSSION]** — trägt; Altverhalten für SMTP, Anforderung an Abschnitt 6 (E13).
- **F06 [DISKUSSION]** — trägt; Anforderung an Abschnitt 6.
- **F07 [ADRESSIERT, teilweise]** — neu: Rohtext mit From/To/Cc/In-Reply-To/References; normaler
  Transportweg lässt `Bcc:` weg und führt den Empfänger im Umschlag (eigener Transport im Test,
  derselbe Serialisierungsweg wie SMTP). Der Handler-Test ist Anforderung an Abschnitt 6.

## Status

Runde 1 beantwortet. Korrekturen (Kommentar, drei Tests, Plan) umgesetzt; Abnahme des Nutzers offen.
