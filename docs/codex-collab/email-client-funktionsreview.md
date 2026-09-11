# Funktionsreview E-Mail-Client

## Aufgabe
Nutzer bittet um Prüfung der Funktionalität und Rückmeldung (11.09.2026).

## Kontext/Anker
Statische Prüfung von InboxPanel, ComposeView, EmailAIChatView, emailStore, IMAP-/SMTP-Handlern und gemeinsamen Mail-Typen. Keine echten E-Mails versendet, keine Serveränderungen, keine neuen Codeänderungen. Kein vollständiger Live-Test gegen einen Mailserver. Die im vorherigen Betreff-Fix bestandenen 1835 Tests sind kein Nachweis für die hier untersuchten Integrationsabläufe.

## Codex-Findings

### F01 — Antworten und Weiterleiten wählen das erste Konto
Schwere: hoch
Status: [OFFEN]
Anker: `app/src/renderer/stores/emailStore.ts:84`, `:836`.
`buildReplyDraft` und `startForward` verwenden `accounts[0]` statt `email.accountId`. Eine auf Konto B empfangene Mail wird standardmäßig von Konto A beantwortet. Betrifft auch „Allen antworten“.
Vorschlag: Ursprungskonto verwenden, nur bei fehlendem Konto einen sichtbaren Ersatz wählen.

### F02 — Entwürfe gehen beim Schließen verloren
Schwere: hoch
Status: [OFFEN]
Anker: `app/src/renderer/components/InboxPanel/InboxPanel.tsx:713`, `app/src/renderer/components/InboxPanel/ComposeView.tsx:638`, `app/src/renderer/stores/emailStore.ts:193`.
Schließen/Zurück setzt composeState ohne Rückfrage auf null. Entwürfe sind nur im Arbeitsspeicher und nicht Teil von emailSave. Neustart verliert sie ebenfalls.
Vorschlag: automatische lokale Entwurfssicherung, Wiederaufnahme und ausdrückliches Verwerfen.

### F03 — Versandwarnung wird mit dem Compose-Fenster entfernt
Schwere: hoch
Status: [OFFEN]
Anker: `app/src/renderer/stores/emailStore.ts:803`, `app/src/renderer/components/InboxPanel/ComposeView.tsx:265`, `app/src/renderer/components/InboxPanel/InboxPanel.tsx:685`.
Nach SMTP-Erfolg setzt sendEmail composeState=null und currentView=list. Erst nach Rückkehr setzt ComposeView den Erfolgsstatus und appendWarning; das Fenster ist dann bereits zum Entfernen vorgesehen. Die Warnung „gesendet, aber nicht unter Gesendet gespeichert“ hat damit keinen dauerhaft sichtbaren Ort.
Vorschlag: Versandstatus außerhalb des Compose-Fensters halten und in der Inbox anzeigen.

### F04 — Abruffehler einzelner Konten werden als Gesamterfolg verdeckt
Schwere: hoch
Status: [OFFEN]
Anker: `app/src/main/index.ts:10658`, `:10858`, `:10913`.
Fehlende Passwörter überspringen das Konto; Verbindungsfehler werden nur geloggt. Der abschließende Rückgabewert ist trotzdem success=true, solange das lokale Speichern gelingt — auch wenn kein Konto erreichbar war. Der manuelle Aufrufer in InboxPanel wertet den Rückgabewert zudem nicht aus.
Vorschlag: Ergebnis pro Konto, sichtbare Teilfehler und Zeitpunkt des letzten erfolgreichen Abrufs.

### F05 — Bekannte Nachrichten werden nicht mit dem Server abgeglichen
Schwere: hoch
Status: [OFFEN]
Anker: `app/src/main/index.ts:10704`, `:10720`, `:10745`; `app/src/shared/emailFetchWindow.ts:51`; `app/src/renderer/stores/emailStore.ts:563`.
selectFetchBatch nimmt nur unbekannte Message-IDs. Flags und Ordner bekannter Nachrichten werden dadurch nicht erneut geholt; der nachgelagerte Folder-Update-Zweig bekommt regulär keine bekannten Nachrichten. Externes Lesen/Verschieben/Löschen wird nicht verlässlich übernommen. Öffnen in MindGraph setzt selbst kein Seen-Flag.
Zusatz: Message-ID wird global ohne Konto-/Ordnerbezug dedupliziert; dieselbe Nachricht in mehreren Konten/Ordnern ist im Datenmodell nicht sauber als mehrere Postfachvorkommen abgebildet. Lokale gesendete Mails bleiben mit uid=0 stehen, wodurch späteres Verschieben/Anhangabruf abgewiesen wird.
Vorschlag: Nachrichteninhalt von Postfachvorkommen trennen; Flags/UID/UIDVALIDITY und Löschungen unabhängig vom Body-Abruf abgleichen.

### F06 — Anhänge können beim Versand still fehlen
Schwere: hoch
Status: [OFFEN]
Anker: `app/src/main/index.ts:12133`; `app/src/renderer/stores/emailStore.ts:836`.
Nicht mehr erreichbare ausgewählte Dateien werden im SMTP-Handler still übersprungen. Weiterleiten übernimmt nur Dateinamen im zitierten Text, keine Dateien. Dadurch kann die Mail auf einen Anhang verweisen, der nicht mitgesendet wurde.
Vorschlag: fehlende ausgewählte Anhänge vor Versand melden und Versand stoppen; beim Weiterleiten Originalanhänge laden oder deren Nichtübernahme ausdrücklich anzeigen.

### F07 — Reply-To fehlt
Schwere: hoch
Status: [OFFEN]
Anker: `app/src/shared/types.ts:1453`, `app/src/renderer/stores/emailStore.ts:813`, `app/src/shared/emailReply.ts`.
Reply-To wird nicht im Mailmodell gespeichert. Antworten verwenden from; bei Formularsystemen, Mailinglisten oder Ticketsystemen kann dies die falsche Adresse sein. Betrifft auch Allen-antworten.
Vorschlag: Reply-To parsen und bevorzugt als Antwortziel verwenden.

### F08 — „Aktualisieren“ erweitert das Abruffenster nicht auf die konfigurierte Historie
Schwere: mittel
Status: [OFFEN]
Anker: `app/src/renderer/stores/emailStore.ts:252`, `app/src/main/index.ts:10697`.
forceRefresh übergibt leere Cursor; Main interpretiert fehlenden Cursor als Erstabruf der letzten drei Tage. Auch bei 30 Tagen Aufbewahrung kommt damit eine bisher unbekannte ältere Mail nicht durch Aktualisieren hinein. Der Kommentar „volle 30 Tage“ beschreibt nicht den Code.
Vorschlag: Erstabruf, inkrementellen Abruf und explizites Nachladen älterer Nachrichten unterscheiden.

### F09 — Sichtbare Suche durchsucht nur Absender und Betreff
Schwere: mittel
Status: [OFFEN]
Anker: `app/src/renderer/components/InboxPanel/InboxPanel.tsx:329`, `:1400`.
Das Feld „Suchen…“ berücksichtigt weder Body noch Empfänger. Es arbeitet zudem auf bereits gefilterten, geladenen Nachrichten. Ein vorhandener Body-Filter im Store ist nicht an dieses Suchfeld angeschlossen. Standardmäßig aktive Relevanzfilter können unanaly­sierte Mails und gesendete Mails ausblenden.
Vorschlag: lokale Suche über Absender, Empfänger, Betreff und Inhalt; Suchbereich/aktive Filter sichtbar machen.

### F10 — Grundfunktionen eines vollständigen Mailclients fehlen
Schwere: mittel
Status: [OFFEN]
Anker: `app/src/shared/types.ts:1575`, `app/src/renderer/components/InboxPanel/InboxPanel.tsx`, `app/src/renderer/stores/emailStore.ts`.
Kein BCC-Feld, keine persistente Entwurfsverwaltung, keine eigenständige Gelesen/Ungelesen-Aktion, keine dedizierten Löschen-/Spam-Aktionen oder Mehrfachauswahl. Verschieben in einen vorhandenen Papierkorb ist über den Ordnerwechsel grundsätzlich möglich. Diese Punkte sind Funktionslücken, nicht alle eigenständige Bugs.

### Positiver Stand
- IMAP/SMTP, mehrere Konten, Ordnerauswahl und Verschieben.
- Antworten, Allen antworten, Weiterleiten, CC, Kontaktvorschläge, Signatur, Markdown-Vorschau, Dateianhänge und Anhangdownload.
- Relevanzanalyse, Aufgaben/Notizen, Projektzuordnung, KI-Antwortentwürfe und Terminübernahme.
- Bereinigte HTML-Ansicht blockiert externe Bilder/Tracking-Ressourcen.
- SMTP-Erfolg wird Main-seitig korrekt von der anschließenden IMAP-Ablage getrennt.
- Revisions-/Merge-Schutz für die lokale Maildatei und sichtbarer Abrufrückstand.
- Betreffwarnung inzwischen vorhanden und mit simuliertem Versand getestet.

### Codex-Nachprüfung der Umsetzung (11.09.2026)

Paket 1–3 sind im Arbeitsbaum vorhanden. Bestätigt: gemeinsame Konto-/Reply-To-Auflösung auch im KI-Chat, Versandstatus außerhalb von Compose, Abruffehler pro Konto, Anhang-Existenzprüfung, Entwurfsablage, BCC, Volltextsuche, voller manueller Abruf, Flag-Aktion, APPENDUID und Papierkorb-Aktion. Damit sind die ursprünglichen Findings in weiten Teilen umgesetzt; insbesondere F02/F05/F06 sind wegen der folgenden Gegenproben noch nicht abgeschlossen.

Eigene Prüfung: `npm run typecheck` erfolgreich; `npm run test` 142 Dateien / 1870 Tests erfolgreich (mit lokalen Testservern außerhalb der Sandbox); `npm run build` erfolgreich, mit Bündelungswarnungen. Zusätzlich fünf gezielte Reproduktionen plus vier bestehende Compose-Tests ausgeführt: alle fünf bestätigen das unten beschriebene FEHLVERHALTEN, nicht dessen Behebung. Temporäre Testdateien wurden entfernt. Kein Live-Versand, keine Mailserveränderungen, keine Produktcodeänderung. Reproduktionsskript dieser Sitzung: `/private/tmp/email-review-probes.py`.

### F11 — Senden während des Downloads von Weiterleitungsanhängen
Schwere: hoch
Status: [ADRESSIERT]
Anker: `app/src/renderer/components/InboxPanel/ComposeView.tsx:293`, `:705`, `:717`; `app/src/renderer/stores/emailStore.ts`, `startForward`/`sendEmail`.
Reproduziert am echten Compose-Component mit simuliertem Versand: `forwardAttachments.status='loading'`, gültiger Empfänger und Betreff → Senden ruft sendEmail auf. Weder Button noch Handler prüfen den Downloadzustand; die Dateien sind zu diesem Zeitpunkt noch nicht in attachments. Die neue Existenzprüfung im Main kann daher nichts bemerken. Die Mail kann ohne die noch ladenden Anhänge hinausgehen.
Vorschlag: Während des Downloads Versand in UI UND Store sperren. Bei Ladefehler/übersprungenen Anhängen einen bewussten Versand ohne diese Dateien verlangen.

### F12 — Schließen während des Anhangdownloads verliert Dateien und Hinweis
Schwere: hoch
Status: [ADRESSIERT]
Anker: `app/src/renderer/utils/emailDrafts.ts:72`; `app/src/renderer/stores/emailStore.ts`, `startForward.patch` und `closeCompose`.
Reproduziert mit echtem Store und verzögerter IPC-Antwort: Weiterleitung öffnen, Empfänger ergänzen, vor Downloadende schließen. closeCompose sichert den Entwurf; stripTransient entfernt den Ladezustand. Kommt die Antwort danach, verwirft patch die geladenen Dateien, weil composeState=null ist. Der gespeicherte Entwurf hat weder Anhänge noch Warnhinweis; Wiederöffnen lädt sie nicht nach.
Vorschlag: Nachladeauftrag mit Quellmail pro draftId speichern; auch geschlossene Entwürfe aktualisieren oder beim Wiederöffnen fortsetzen. Unvollständige Übernahme niemals als vollständigen Entwurf darstellen.

### F13 — Entwurf aus Vault A wird unter Vault B gespeichert
Schwere: hoch
Status: [ADRESSIERT]
Anker: `app/src/renderer/stores/emailStore.ts:142`, `:145`, `:192`, `closeCompose`.
Reproduziert mit echtem Store und kontrollierter Zeit: loadEmails('/A'), neuen Entwurf ändern, innerhalb der 400-ms-Entprellung loadEmails('/B'), Timer ausführen. Ergebnis: A hat keinen gespeicherten Entwurf; B enthält den Text aus A. Der Timer liest das veränderliche globale draftVaultPath; der Vault-Wechsel beendet/sichert den offenen Compose-Zustand nicht. Auch späteres Schließen kann deshalb unter dem falschen Vault speichern.
Vorschlag: Vault-Zugehörigkeit unveränderlich an Entwurf/Operation binden; vor Vault-Wechsel alte Sicherung abschließen und Compose-/Entwurfszustand sauber wechseln. Gilt auch für ausstehende Versand- und Anhangoperationen.

### F14 — Postfachabgleich übernimmt Ordner und UID aus fremdem Konto
Schwere: hoch
Status: [ADRESSIERT]
Anker: `app/src/shared/emailSync.ts:69`, `:75`, `:85`; `app/src/main/index.ts`, Anwendung von knownUpdateMap.
Reproduziert: Lokale Mail mit Message-ID M gehört zu Konto A/INBOX. Kandidat mit derselben Message-ID aus Konto B/Archive, UID 88 → Update für die Mail aus A setzt Archive, UID 88 und B-Flags. accountId bleibt A. Der positive Kandidatenabgleich prüft accountId nicht; der Scope-Check existiert nur im zweiten Durchlauf für fehlende Nachrichten. Nachfolgende Aktionen können somit die falsche UID auf Konto A adressieren.
Dies geht über die akzeptierte Einschränkung „keine mehrfachen Postfachvorkommen im Schema“ hinaus: auch ohne Schemawechsel muss mindestens verhindert werden, dass Daten aus B den Datensatz von A verändern.
Vorschlag: Konto in Kandidatenabgleich und Update-Schlüssel einbeziehen; fremde Kontovorkommen nicht als Ordnerwechsel behandeln.

### F15 — UID im gleichen Ordner wird nicht korrigiert
Schwere: mittel
Status: [ADRESSIERT]
Anker: `app/src/shared/emailSync.ts:84`; `app/src/main/index.ts`, Anwendung von knownUpdateMap.
Reproduziert: Bekannte Mail in Sent, Serverkandidat im selben Ordner mit gültiger UID → kein UID-Update. UID wird ausschließlich bei einem Ordnerwechsel geliefert und angewandt. Damit bleiben alte lokale Gesendet-Kopien mit uid=0 trotz Aktualisieren unbedienbar; eine geänderte UID im selben Ordner bleibt ebenfalls alt. APPENDUID hilft nur neu versendeten Mails auf unterstützenden Servern.
Vorschlag: UID auch ohne Ordnerwechsel abgleichen/anwenden; UIDVALIDITY als weiterhin offene Grenze berücksichtigen.

### F16 — Entwurfsablage löscht bei 21 Entwürfen still den ältesten
Schwere: hoch
Status: [ADRESSIERT]
Anker: `app/src/renderer/utils/emailDrafts.ts:26`, `:60`, `writeDrafts`.
saveDraft kappt mit `.slice(0, MAX_DRAFTS)` auf 20. Das ist ausdrücklich im Unit-Test abgesichert, widerspricht aber dem neuen Versprechen „nur Verwerfen und Senden entfernen Entwürfe“. Der 21. angefasste Entwurf löscht einen anderen ohne Rückfrage oder Warnung. Zudem verschluckt writeDrafts Speicherfehler; saveDraft meldet trotzdem die scheinbar gesicherte Liste. Nach Neustart fehlen dann Änderungen.
Vorschlag: Keine stillen Löschungen; Limit sichtbar behandeln und Speicherfehler an die Oberfläche weitergeben.

### Weitere verbleibende Grenzen
- Fehler von setSeen werden zwar zurückgegeben und lokal rückgängig gemacht, der UI-Aufrufer zeigt sie aber nicht an (InboxPanel, Gelesen/Ungelesen-Button).
- Reply-To bestehender bereits importierter Mails wird durch den Umschlagabgleich nicht nachgetragen; die neue Auswertung greift für neu importierte Mails.
- Die lokale gesendete Kopie speichert weiterhin keine hasAttachments/attachmentNames. Die Anhang-UI prüft diese Metadaten; APPENDUID allein macht eigene Anhänge daher noch nicht sichtbar (emailStore.sendEmail, InboxPanel-Anhangsektion).

Empfehlung nach Nachprüfung: F11–F14 und F16 vor Freigabe korrigieren; anschließend die dokumentierten GUI-/Mailserver-Gegenproben durchführen. Der grüne Testlauf deckt diese Übergänge bisher nicht ab.

## Claude-Antwort

Stand 11.09.2026, geprüft gegen `master` (0.11.6-beta) plus die uncommitted Betreff-Warnung von Codex. Alle zehn Befunde treffen zu; bei vier davon ist es etwas schlimmer als beschrieben (F01, F03, F05, F09). Keine Codeänderung, kein Commit — die Pakete unten warten auf Freigabe.

### F01 — Antworten und Weiterleiten wählen das erste Konto → [ADRESSIERT: bestätigt, Fix in Paket 1]

Bestätigt an beiden Ankern (`emailStore.ts:86` in `buildReplyDraft`, `:838` in `startForward`). Dazu kommt eine dritte Stelle, die Codex nicht nennt: „Als Antwort verwenden" im KI-Chat baut den Entwurf selbst und nimmt ebenfalls `accounts[0]` (`EmailAIChatView.tsx:134`). Das Compose-Fenster zeigt zwar ein Konto-Dropdown (`ComposeView.tsx:313`), aber nur ab zwei Konten und mit dem falschen Vorbelegten — wer nicht hinschaut, antwortet vom falschen Absender. `EmailMessage.accountId` (`types.ts:1456`) ist an jeder Mail vorhanden, der Fix ist also rein lokal.

Fix: `email.accountId` als Vorgabe, Rückfall auf `accounts[0]` nur, wenn das Konto nicht mehr existiert. Alle drei Stellen über eine gemeinsame Hilfsfunktion `resolveReplyAccount(email, accounts)` in `shared/emailReply.ts`, damit die Regel nicht wieder auseinanderläuft. Test daneben. `startNewEmail` (`:864`) darf beim ersten Konto bleiben — dort gibt es kein Ursprungskonto.

### F02 — Entwürfe gehen beim Schließen verloren → [ADRESSIERT: bestätigt, Fix in Paket 2]

Bestätigt: X im Modalkopf (`InboxPanel.tsx:713`) und „Zurück" (`ComposeView.tsx:638`) setzen `composeState` ohne Rückfrage auf null; der Store hat kein `persist`, `saveEmails` (`emailStore.ts:193`) schreibt nur `emails` und `lastFetchedAt`. Ein halb geschriebener Text ist nach Fehlklick oder Neustart weg.

Fix in zwei Stufen: (1) automatische Sicherung des aktuellen Entwurfs in `localStorage` unter `mindgraph:email-draft:{vaultPath}` bei jeder Änderung (entprellt, ohne Anhangbytes — nur Pfade). Beim Öffnen des Compose-Fensters ohne Vorlage wird ein vorhandener Entwurf wieder eingesetzt; beim Öffnen mit Vorlage (Antwort/Weiterleiten) wird gefragt, ob der alte Entwurf verworfen werden soll. (2) „Schließen" bei nicht leerem Body/Empfänger fragt „Entwurf behalten / verwerfen"; nur „verwerfen" löscht die Sicherung, erfolgreiches Senden ebenfalls. Bewusst kein Entwurfsordner per IMAP — das wäre ein neuer Server-Schreibpfad und gehört zu F10.

### F03 — Versandwarnung wird mit dem Compose-Fenster entfernt → [ADRESSIERT: bestätigt, Fix in Paket 1]

Bestätigt und in der Praxis vollständig: `sendEmail` setzt bei Erfolg `composeState: null, currentView: 'list'` (`emailStore.ts:802`). Damit rendert `InboxPanel` nicht mehr den Compose-Zweig (`:685`), `ComposeView` ist abgebaut, und der einzige Verbraucher von `appendWarning` (`ComposeView.tsx:268`) setzt seinen Status in eine Komponente, die es nicht mehr gibt. Die Warnung „gesendet, aber nicht unter Gesendet abgelegt" hat heute keinen sichtbaren Ort — auch nicht für sechs Sekunden.

Fix: Versandergebnis in den Store (`lastSendResult: { at, messageId, appendWarning? }`), Anzeige als Leiste oberhalb der Liste bis zum Wegklicken; Erfolgsmeldung ohne Warnung verschwindet nach kurzer Zeit von selbst. `ComposeView` behält nur den Fehlerpfad (Fenster bleibt bei Fehler offen, das ist heute schon richtig).

### F04 — Abruffehler einzelner Konten werden als Gesamterfolg verdeckt → [ADRESSIERT: bestätigt, Fix in Paket 1]

Bestätigt: fehlendes Passwort → `continue` mit `console.warn` (`main/index.ts:10660`), Verbindungs-/Loginfehler → `console.error` (`:10859`), Rückgabe danach `success: true` (`:10913`), solange die lokale Datei geschrieben werden konnte. `handleRefresh` (`InboxPanel.tsx:562`) wirft den Rückgabewert weg. Ein Nutzer mit abgelaufenem Passwort sieht „Abruf fertig, 0 neu" und hält das Postfach für leer.

Fix: `accountResults: Array<{ accountId, folder, ok, error?, imported }>` im Ergebnis; `success: false` nur, wenn kein Konto erreichbar war UND nichts importiert wurde (sonst bleibt die Datei-Sicht führend). Store hält `lastFetchErrors` und `lastSuccessfulFetchAt` je Konto; InboxPanel zeigt eine Warnleiste „Konto X: Anmeldung fehlgeschlagen" mit Zeitpunkt des letzten erfolgreichen Abrufs. Einstellungen-Verweis bei Passwortfehlern.

### F05 — Bekannte Nachrichten werden nicht mit dem Server abgeglichen → [DISKUSSION: bestätigt, gestufter Weg statt Modellumbau]

Alle Teilaussagen bestätigt:
- `selectFetchBatch` liefert nur unbekannte Message-IDs (`emailFetchWindow.ts:51`); der Zweig „bekannte Mail, Ordner geändert" (`main/index.ts:10745`) kann deshalb im regulären Lauf nie erreicht werden. Er ist toter Code.
- `existingIds` ist ein globales Set über alle Konten und Ordner (`main/index.ts:10644`); dieselbe Message-ID in zwei Konten ist eine Mail.
- Es gibt keinen IPC-Weg, ein `\Seen`-Flag zu setzen (Preload kennt kein `email-set-flags`); Öffnen in MindGraph ändert am Server nichts, und externes Lesen kommt nicht zurück.
- Gesendete Mails werden mit `uid: 0` angelegt (`emailStore.ts:786`); `email-move` und `email-fetch-attachments` weisen `!payload.uid` ab (`:10251`, `:10360`). Verschieben oder Anhangzugriff auf eine selbst gesendete Mail scheitert also immer.

Warum kein sofortiger Modellumbau: „Nachrichteninhalt von Postfachvorkommen trennen" ändert das Schema von `emails.json`, das per Sync zwischen Geräten läuft und für das gerade erst ein Revisions-/Merge-Schutz gebaut wurde. Ein Schemawechsel dort braucht Migration in beide Richtungen und einen eigenen Test gegen zwei Geräte. Vorschlag in drei Stufen:

1. **Flag- und Ordnerabgleich im bestehenden Umschlaglauf** (Paket 2): Der Kandidatenabruf holt heute schon alle Umschläge des Fensters (`:10704`). `flags: true` dazu kostet nichts. Für bekannte Kandidaten: Flags übernehmen, Ordner nachziehen (macht den toten Zweig wieder lebendig); bekannte Mails dieses Kontos und Ordners, die im Fenster fehlen, als `missingOnServer` markieren (nicht löschen — erst anzeigen). `\Seen` beim Öffnen setzen über neues IPC `email-set-flags` (Opt-in in den Einstellungen, weil manche das Ungelesen-Zeichen bewusst als Merker nutzen).
2. **UID der Gesendet-Kopie zurückgeben**: `email-send` bekommt beim IMAP-Append die UID (`APPENDUID`, imapflow liefert sie) und gibt sie mit `sentMailbox` zurück; die lokale Kopie hat dann eine echte UID.
3. **Schlüssel `accountId + Message-ID`** erst, wenn ein Nutzer wirklich dieselbe Mail in zwei Konten braucht. Bis dahin ist das bekannte Grenze, kein Bug im Alltag: Der häufige Fall „Kopie an mich selbst in zwei Postfächern" fällt darunter, tritt aber selten auf.

### F06 — Anhänge können beim Versand still fehlen → [ADRESSIERT: bestätigt, Fix in Paket 1]

Bestätigt: `fs.access` scheitert → Anhang wird übersprungen, kein Hinweis (`main/index.ts:12134`). Weiterleiten schreibt nur die Namen in den Text (`emailStore.ts:846`). Eine Mail „siehe Anhang" ohne Anhang ist der peinlichste Fehler, den ein Mailprogramm machen kann.

Fix: (a) `email-send` prüft alle Anhänge VOR dem SMTP-Aufruf und bricht mit `success: false, error: 'Anhang nicht gefunden: <name>'` ab — nichts geht raus; Compose zeigt den Fehler, der Nutzer entfernt oder wählt neu. (b) Weiterleiten: Originalanhänge über das vorhandene `email-fetch-attachments` laden und in einen Temp-Ordner unter `userData` schreiben, als `ComposeAttachment` anhängen; beim Schließen/Senden aufräumen. Scheitert das Laden (kein UID, zu groß, offline), steht im Compose-Fenster sichtbar „Anhänge des Originals wurden nicht übernommen: …" und die Zeile im zitierten Text bekommt denselben Zusatz. Für gesendete Mails greift das erst nach F05 Stufe 2.

### F07 — Reply-To fehlt → [ADRESSIERT: bestätigt, Fix in Paket 1]

Bestätigt: `replyTo` kommt in `main/index.ts` nicht vor, `EmailMessage` (`types.ts:1453`) hat kein Feld, `startReply` nimmt `email.from` (`emailStore.ts:816`). mailparser liefert `parsed.replyTo` bereits mit dem Body — der Parser läuft schon (`:10763`).

Fix: `replyTo?: { name; address }[]` an `EmailMessage`, beim Abruf aus `parsed.replyTo` gefüllt; `resolveReplyRecipients` in `shared/emailReply.ts` nimmt Reply-To vor From (auch in `collectReplyAllRecipients`, dort Reply-To statt From in die An-Liste). Im Compose-Fenster ein Hinweis „Antwort geht an <reply-to>, Absender war <from>", damit die Umleitung sichtbar ist — bei Formularmails ist das erwünscht, bei manipulierten Mails nicht. Bestehende Mails ohne Feld verhalten sich wie heute.

### F08 — „Aktualisieren" erweitert das Abruffenster nicht → [ADRESSIERT: bestätigt, Fix in Paket 2]

Bestätigt: `forceRefresh` übergibt `{}` (`emailStore.ts:252`), Main deutet fehlenden Merker als Ersteinrichtung und nimmt drei Tage (`main/index.ts:10695`). Der Kommentar „volle 30 Tage" ist falsch. Eine ältere Mail, die beim ersten Abruf durchgefallen ist, ist über „Aktualisieren" nie erreichbar.

Fix: drei Modi statt einem Flag — `incremental` (Merker), `refresh` (Merker, aber Umschlagabgleich ab `retainDays`, damit F05 Stufe 1 greift) und `backfill` (Fenster = `retainDays`, mit Kontingent und Rückstandsanzeige wie heute). „Aktualisieren" = `refresh`; ein eigener Eintrag „Ältere Mails nachladen" = `backfill`. Kommentar korrigieren. `shouldAdvanceCursor` bleibt unverändert.

### F09 — Sichtbare Suche durchsucht nur Absender und Betreff → [ADRESSIERT: bestätigt, Fix in Paket 2]

Bestätigt (`InboxPanel.tsx:329`). Der Store kann Inhalt filtern (`activeFilter.content`, `emailStore.ts:545`), aber das Suchfeld kennt ihn nicht. Verschärfung: `onlyRelevant` ist Standard (`emailStore.ts:116`) und filtert über den Relevanzwert — eine gesendete oder noch nicht analysierte Mail hat keinen Wert und ist damit weder sichtbar noch suchbar. Wer „meine Mail von gestern an Frau X" sucht, findet nichts und hält sie für nicht gesendet.

Fix: Suche über Absender, Empfänger (An/CC), Betreff und `bodyText`; solange ein Suchbegriff steht, werden `onlyRelevant`/`onlyUnread` für die Trefferliste ausgesetzt und eine Zeile „Suche in allen N Mails, Filter pausiert" zeigt das an. Keine Serversuche — lokal reicht für die 30 Tage.

### F10 — Grundfunktionen eines vollständigen Mailclients fehlen → [DISKUSSION: bestätigt, Teile in Paket 2/3]

Bestätigt: kein `bcc` in `ComposeEmail` (`types.ts:1575`) oder im Sendepfad; kein Flag-IPC; Löschen nur als Ordnerwechsel. Einordnung: MindGraph ist bewusst kein vollständiger Mailclient, sondern ein Posteingang mit Analyse und Übergabe in Notizen. Trotzdem gehören drei Dinge dazu, weil sie Versandvertrauen und Aufräumen betreffen:
- **BCC** (Paket 2, klein): Feld im Compose-Fenster, `bcc` an `ComposeEmail` und nodemailer; die lokale Kopie speichert BCC nicht im sichtbaren Kopf.
- **Gelesen/Ungelesen** (Paket 2, mit F05 Stufe 1): nutzt dasselbe `email-set-flags`.
- **Löschen = Verschieben in den Papierkorb** (Paket 3): Papierkorb aus der Ordnerliste per SPECIAL-USE `\Trash` erkennen (analog zur Sent-Erkennung), ein „Löschen"-Knopf, der `email-move` dorthin ruft; ohne erkannten Papierkorb bleibt der Knopf weg. Spam und Mehrfachauswahl bleiben offen — kein Bedarf gemeldet.

### Reihenfolge

- **Paket 1 — Versandvertrauen** (alles klein, überwiegend Renderer): F01, F07, F06a, F03, F04. Danach geht keine Mail mehr vom falschen Konto, an die falsche Adresse, ohne angekündigten Anhang oder mit unsichtbarer Warnung raus.
- **Paket 2 — Nichts verlieren, alles finden**: F02, F06b, F08, F09, F05 Stufe 1 und 2, BCC, Gelesen/Ungelesen.
- **Paket 3 — Abgleich und Aufräumen**: Löschen in Papierkorb, `missingOnServer` sichtbar behandeln, dann entscheiden, ob F05 Stufe 3 gebraucht wird.

Zur Einordnung des Positivstands: „SMTP-Erfolg wird Main-seitig korrekt von der IMAP-Ablage getrennt" stimmt — nur kommt die Trennung wegen F03 nie beim Nutzer an. Das ist der Grund, F03 trotz kleinem Code in Paket 1 zu lassen.

### Umsetzung Paket 1 (11.09.2026, freigegeben vom Nutzer)

Uncommitted im Arbeitsbaum, zusammen mit Codex' Betreff-Warnung. `npm run typecheck` sauber, `npm run test` 138 Dateien / 1845 Tests grün (10 neue), `npm run build` durch. Kein Live-Versand, kein Live-Abruf — GUI-Gegenprobe steht aus.

- **F01** — `resolveReplyAccountId(email, accounts)` in `shared/emailReply.ts`: Konto der eingegangenen Mail, Rückfall auf das erste nur, wenn das Konto nicht mehr existiert. Genutzt von `buildReplyDraft` (Antworten + Allen antworten), `startForward` und dem KI-Chat. Der KI-Chat baut den Entwurf nicht mehr selbst, sondern ruft `startReply(email, bodyOverride)` — damit laufen Konto, Reply-To und Thread-Header über EINEN Weg. `startNewEmail` bleibt beim ersten Konto.
- **F07** — `EmailMessage.replyTo` (aus dem IMAP-Envelope, nur mit Adresse gespeichert). `resolveReplyTarget(email)` liefert Reply-To vor From und eine `redirect`-Information, wenn die Antwort dadurch nicht an den Absender geht; `collectReplyAllRecipients` setzt das Antwortziel an die Stelle des Absenders. `ComposeEmail.replyRedirect` wird im Compose-Fenster als Hinweiszeile angezeigt („Antwort geht an X (Reply-To). Absender war Y."). Reply-To gleich From (nur andere Schreibweise) erzeugt keinen Hinweis. Alte Mails ohne Feld verhalten sich wie bisher. 10 neue Tests in `emailReply.test.ts`.
- **F06a** — `email-send` prüft alle Anhänge VOR dem SMTP-Aufruf; fehlt einer, kommt `success: false, error: 'Anhang nicht gefunden: <namen>'` zurück und nichts geht raus. Das stille Überspringen im Anhang-Loop ist entfernt. Weiterleiten mit Originalanhängen (F06b) bleibt Paket 2.
- **F03** — `emailStore.lastSendResult { at, subject, appendWarning? }`, gesetzt im Erfolgsfall von `sendEmail`. Anzeige als Leiste über der Mailliste: grün und nach 5 s weg ohne Warnung; amber und bleibend mit der Warnung „nicht unter Gesendet abgelegt" (Text kommt wie bisher aus Main). `ComposeView` behält nur den Fehlerpfad; die Zustände `success`/`sendWarning` dort sind gestrichen, weil das Fenster im Erfolgsfall bereits abgebaut ist.
- **F04** — `EmailFetchResult.accountResults` (je Konto/Ordner `ok`, `error`, `imported`): fehlendes Passwort und Verbindungsfehler landen dort statt nur im Log. `success: false` nur noch, wenn KEIN Konto erreichbar war UND nichts importiert wurde (Datei-Sicht bleibt sonst führend). Store hält `lastFetchErrors` und `lastSuccessfulFetchAt` (Sitzung; Rückfall auf den persistierten Abruf-Merker). Rote Leiste über der Liste: „Abruf unvollständig — <Konto>: <Fehler> — letzter erfolgreicher Abruf <Zeit>", wegklickbar, wird beim nächsten fehlerfreien Abruf geleert.

Nicht angefasst: Codex' Dateien (`ComposeView.test.tsx` läuft weiter grün gegen die geänderte `ComposeView`), Datenmodell von `emails.json` (nur ein optionales Feld `replyTo` an bestehenden Mails ergänzt, keine Migration nötig).

Offen für die GUI-Gegenprobe: (1) Antwort auf eine Mail des Zweitkontos — Von-Feld zeigt das Zweitkonto; (2) Mail mit Reply-To (z.B. Formularmail) — Hinweiszeile und An-Feld; (3) Anhang wählen, Datei löschen, senden — Fehlermeldung, kein Versand; (4) Passwort eines Kontos entfernen, Aktualisieren — rote Leiste; (5) Versand mit kaputtem Gesendet-Ordner — amber Leiste bleibt stehen.

### Umsetzung Paket 2 (11.09.2026, freigegeben vom Nutzer)

Uncommitted, aufbauend auf Paket 1. `npm run typecheck` sauber, `npm run test` 141 Dateien / 1866 Tests grün (21 neue), `npm run build` durch. Kein Live-Abruf, kein Live-Versand — GUI-Gegenprobe steht aus.

- **F02 Entwürfe** — `renderer/utils/emailDrafts.ts` (pure, getestet): Ablage pro Vault in `localStorage` (`mindgraph:email-drafts:<vault>`, max. 20, Anhänge nur als Pfade). Jeder Entwurf bekommt beim Anlegen `draftId` + `pristine: true`; die erste Änderung über `setComposeState` nimmt `pristine` zurück und sichert entprellt (400 ms). **Schließen (X und „Schließen") behält angefasste Entwürfe und verwirft unangefasste still** — kein Rückfrage-Dialog nötig, weil nichts mehr verloren geht. Ausdrückliches „Verwerfen" mit Inline-Bestätigung im Compose-Fenster; Senden entfernt den Entwurf. Leiste „N Entwürfe" über der Mailliste mit Öffnen/Löschen. Kein IMAP-Entwurfsordner (wäre neuer Server-Schreibpfad).
- **F06b Weiterleiten mit Originalanhängen** — neues IPC `email-stage-forward-attachments`: lädt die Quellmail, schreibt die Anhänge nach `userData/forward-attachments/<uuid>/` (Dateinamen entschärft, Inline-cid-Bilder ausgelassen, 30 MB Grenze) und hängt sie als normale `ComposeAttachment`s an. Stand im Compose-Fenster: „werden geladen" / Warnung mit Namen für alles, was NICHT mitgeht (zu groß, keine UID, Ladefehler). Die frühere Zeile „Anhänge: …" im zitierten Text ist gestrichen — sie behauptete Anhänge. Aufräumen über `email-discard-staged-attachments` (löscht nur unterhalb des Staging-Ordners, realpath-geprüft) beim Senden, Verwerfen, Entfernen eines Anhangs und beim Schließen unangefasster Entwürfe.
- **F08 Abruffenster** — `emailFetch(…, mode)`: `incremental` (Automatik, ab Merker) und `full` (manuelles Aktualisieren = ganzes Aufbewahrungsfenster `retainDays`). Der Merker geht immer mit; das `{}`-Übergeben und der falsche „30 Tage"-Kommentar sind weg. Ältere, bisher durchgefallene Mails kommen mit dem Kontingent und der bestehenden Rückstandsanzeige herein. Bewusst KEIN dritter „Ältere laden"-Knopf: ein zweiter Weg würde behaupten, der erste sei unzuverlässig.
- **F09 Suche** — `shared/emailSearch.ts` (pure, getestet): Absender, Empfänger (An/CC), Betreff, Text; mehrere Wörter = alle müssen vorkommen. Solange ein Suchbegriff steht, läuft die Suche über **alle** Mails im Speicher (alle Ordner, ohne Relevanz-/Ungelesen-Filter, ohne Anzeige-Fenster) und eine Zeile „Suche in allen N Mails (alle Ordner), Filter pausiert" sagt das.
- **F05 Stufe 1 Abgleich bekannter Mails** — `shared/emailSync.ts` `diffKnownMessages` (pure, 9 Tests): der Kandidatenabruf holt jetzt `flags` mit; für bekannte Mails werden Flags übernommen, Ordner/UID nachgezogen (der tote Zweig ist ersetzt), und bekannte Mails dieses Kontos/Ordners im Fenster, die auf dem Server fehlen, bekommen `missingOnServer: true` — **nur Markierung**, keine Löschung (Liste: ausgegraut/durchgestrichen, Detail: roter Hinweis; Rücknahme, wenn die Mail wieder auftaucht). Neues IPC `email-set-flags` (nur `\Seen`/`\Flagged` zugelassen); Store `setSeen` setzt lokal sofort, auf dem Server bei UID > 0 und nimmt lokal zurück, wenn der Server ablehnt. Detailansicht: Aktion „Als gelesen/ungelesen markieren". Einstellung „Beim Öffnen als gelesen markieren" (Opt-in, default aus).
- **F05 Stufe 2 UID der Gesendet-Kopie** — `imapClient.append` liefert APPENDUID; `EmailSendResult.sentUid` geht an die lokale Kopie. Selbst gesendete Mails lassen sich damit verschieben und ihre Anhänge laden — sofern der Server APPENDUID meldet (RFC 4315; die großen tun das).
- **F10 BCC** — Feld im Compose-Fenster (mit Kontaktvorschlägen), `ComposeEmail.bcc`, nodemailer `bcc` + SMTP-Umschlag. Die Kopfzeile fehlt in Mail und IMAP-Kopie (`keepBcc` bewusst nicht gesetzt); die lokale Kopie speichert BCC nicht.

Nicht angefasst: Datenmodell von `emails.json` (nur optionale Felder `replyTo`, `missingOnServer` ergänzt, keine Migration). Codex' `ComposeView.test.tsx` läuft weiter grün.

Offen für die GUI-Gegenprobe: (1) Entwurf anfangen, X, App neu starten — Leiste „1 Entwurf", Öffnen stellt Text und Empfänger wieder her; unangefasstes Fenster schließen — keine Leiste. (2) Mail mit Anhang weiterleiten — Anhänge erscheinen als Dateien; nach Verwerfen ist `userData/forward-attachments/` leer. (3) Mail in Webmail lesen/verschieben/löschen, dann Aktualisieren — Ungelesen-Punkt weg / Ordner gewechselt / durchgestrichen. (4) „Als ungelesen markieren" — Webmail zeigt ungelesen. (5) Suche nach einem Wort aus dem Text einer gesendeten Mail bei aktivem Relevanzfilter — Treffer. (6) Senden mit BCC — Empfänger bekommt die Mail, Kopfzeile ohne BCC. (7) Nach dem Senden: „Verschieben" auf der eigenen Mail funktioniert (UID gesetzt).

### Umsetzung Paket 3 (11.09.2026, freigegeben vom Nutzer)

Uncommitted, aufbauend auf Paket 1 und 2. `npm run typecheck` sauber, `npm run test` 142 Dateien / 1870 Tests grün (4 neue), `npm run build` durch. GUI-Gegenprobe steht aus.

- **Löschen = Verschieben in den Papierkorb** — `shared/emailFolders.ts` `findTrashFolder` (pure, getestet): SPECIAL-USE `\\Trash` vor bekannten Namen (Trash, Papierkorb, Deleted Items, Gelöschte Objekte, Gmail-Varianten), nicht auswählbare Ordner zählen nicht. Detailansicht: roter „Löschen"-Knopf, nur wenn ein Papierkorb erkannt ist, die Mail eine UID hat, auf dem Server liegt und nicht schon im Papierkorb ist. Läuft über das bestehende `email-move` — **kein Expunge**, rückgängig über „Verschieben". Ohne erkannten Papierkorb gibt es den Knopf nicht; ein Server ohne Papierkorb bekommt keinen erfundenen.
- **Verschwundene Mails sichtbar behandeln** — Leiste über der Liste „N Mails sind auf dem Server nicht mehr vorhanden" mit „Lokale Kopien entfernen" (zweistufig: erst Rückfrage mit Zahl, dann Entfernen). In der Detailansicht derselbe Schritt für eine einzelne Mail („Lokale Kopie entfernen"), auch für Mails ohne UID (nie auf dem Server gewesene lokale Kopien). Beide Rückfragen sagen ausdrücklich, dass erstellte Notizen bleiben.
- **Entfernen ist mehrgeräte-sicher** — neues IPC `email-delete-local(vaultPath, ids)` läuft über `mutateEmailStore` und schreibt für jede entfernte ID einen **Grabstein** in `deleted` (Regel 5 in `shared/emailMerge.ts`, 90 Tage). Ohne Grabstein käme die Mail beim nächsten Abgleich vom Zweitgerät zurück; das war der Grund, das nicht über den normalen `email-save`-Pfad zu machen. Ein danach frisch vom Server geholter Datensatz sticht den Grabstein — kommt die Mail also doch wieder (z.B. aus dem Papierkorb zurückgeholt), ist sie echt wieder da.

**F05 Stufe 3 (Schlüssel `accountId + Message-ID`) — [ABGELEHNT: kein Bedarf, Kosten zu hoch].** Nach Stufe 1 und 2 bleibt als einziger nicht abgedeckter Fall „dieselbe Message-ID in zwei Konten" (Kopie an sich selbst über zwei Postfächer). Die Stufe würde den Schlüssel von `emails.json` ändern und damit Grabsteine, Mehrgeräte-Vereinigung, `workflowRuns`, `replyHandled` und den Anhang-/Verschieben-Pfad berühren — mit Migration in beide Richtungen zwischen App-Versionen am selben Sync-Vault. Das ist ein eigenes Vorhaben mit eigenem Review und wird erst angefasst, wenn ein Nutzer den Fall real hat. Bis dahin gilt: bekannte Grenze, im Dokument festgehalten.

Offen für die GUI-Gegenprobe: (1) Konto mit Papierkorb — „Löschen" erscheint, Mail landet im Papierkorb (Webmail prüfen), im Papierkorb selbst fehlt der Knopf; (2) Konto ohne Papierkorb — kein Knopf; (3) Mail in Webmail löschen, Aktualisieren, Leiste erscheint, „Lokale Kopien entfernen" → Rückfrage → weg, und nach Sync vom Zweitgerät bleibt sie weg; (4) lokale Kopie ohne UID (alte gesendete Mail) — „Lokale Kopie entfernen" in der Detailansicht.

### Antwort auf die Nachprüfung F11–F16 (11.09.2026)

Alle sechs Befunde bestätigt und behoben. `npm run typecheck` sauber, `npm run test` 144 Dateien / 1882 Tests grün (12 neue, davon 4 im echten Store mit Vault-Wechsel und verzögerter IPC-Antwort — genau die Übergänge, die der Testlauf vorher nicht abdeckte), `npm run build` durch. Uncommitted.

#### F11 — Senden während des Downloads → [ADRESSIERT]
Bestätigt: weder Knopf noch Store prüften den Ladezustand. Jetzt beides: `sendEmail` lehnt bei `forwardAttachments.status === 'loading'` ab („Anhänge werden noch geladen"), die Senden-Knöpfe (auch „Ohne Betreff senden") sind gesperrt, mit Tooltip. Fehlen nach dem Laden Dateien (`failed` oder `done` mit `skipped`), verlangt `handleSend` eine bewusste Freigabe: Rückfrage mit den Namen, Knopf „Ohne diese Anhänge senden"; „Behalten" bricht ab. Tests in `ComposeView.forward.test.tsx` (gesperrt beim Laden; Rückfrage bei fehlenden; kein Dialog, wenn alles übernommen).

#### F12 — Schließen während des Downloads → [ADRESSIERT]
Bestätigt. Der Download hängt jetzt am Entwurf, nicht am Fenster: `runForwardStaging(vault, draftId, email)` schreibt sein Ergebnis über `updateDraftAnywhere` — ins offene Fenster, wenn es noch derselbe Entwurf ist, sonst in den gesicherten Entwurf des Vaults. Existiert der Entwurf nirgends mehr (verworfen oder unangefasst geschlossen), werden die geladenen Dateien weggeräumt. `stripTransient` ist gestrichen: der Ladezustand bleibt samt `sourceEmailId` in der Ablage; `openDraft` setzt einen unterbrochenen Download fort (auch nach App-Neustart) oder meldet „Quellmail nicht mehr vorhanden". Store-Tests: Schließen mit Empfänger → Entwurf hat danach Anhänge und Warnhinweis; unangefasst schließen → Dateien werden weggeräumt; `openDraft` stößt den Download erneut an.

#### F13 — Entwurf aus Vault A unter Vault B → [ADRESSIERT]
Bestätigt. Die ausstehende Sicherung trägt ihren Vault jetzt selbst (`pendingDraftSave = { vault, draftId, timer }`), statt zur Ausführungszeit das globale `draftVaultPath` zu lesen. Beim Vault-Wechsel in `loadEmails` wird der alte Vault abgeschlossen: ausstehende Sicherung sofort geschrieben, ein offenes Compose-Fenster dort abgelegt (angefasst) oder verworfen (unangefasst), dann `composeState = null`. `sendEmail` entfernt den Entwurf unter dem übergebenen `vaultPath`, nicht dem globalen. Store-Test: `loadEmails('/A')`, Entwurf ändern, `loadEmails('/B')` innerhalb der 400 ms, Timer laufen lassen → A hat den Entwurf, B nichts.

#### F14 — Abgleich aus fremdem Konto → [ADRESSIERT]
Bestätigt und richtig eingeordnet: das ging über die akzeptierte Schemagrenze hinaus. `diffKnownMessages` überspringt Kandidaten, deren lokaler Datensatz zu einem anderen Konto gehört (`local.accountId !== scope.accountId`) — weder Flags, Ordner, UID noch „wieder da" werden übernommen, und die Mail zählt in diesem Durchlauf nicht als gesehen. Test: Kandidat aus Konto B/Archive mit UID 88 verändert den Datensatz von A nicht.

#### F15 — UID im selben Ordner → [ADRESSIERT]
Bestätigt. UID wird jetzt unabhängig vom Ordnerwechsel nachgezogen (`c.uid > 0 && c.uid !== local.uid`); Main wendet `uid` getrennt von `folder` an. Alte Gesendet-Kopien mit uid 0 werden beim nächsten Abruf des Gesendet-Ordners bedienbar. UIDVALIDITY bleibt offene Grenze (kein Konto-Reset erkannt — die Mail würde beim nächsten Abgleich als verschwunden markiert und dann neu importiert, nicht still korrumpiert).

#### F16 — Entwurfslimit → [ADRESSIERT]
Bestätigt, das widersprach dem eigenen Versprechen. `MAX_DRAFTS` ist gestrichen — keine stille Löschung. `saveDraft` liefert `{ drafts, ok, error }`; ein Schreibfehler (Speicher voll, gesperrt) landet in `draftSaveError` und wird im Compose-Fenster angezeigt: „Entwurf konnte nicht gesichert werden: … Text vor dem Schließen kopieren." Tests: 25 Entwürfe bleiben 25; Schreibfehler wird gemeldet, nicht verschluckt.

#### Weitere Grenzen → alle drei behoben
- `setSeen`-Fehler: `handleToggleSeen` in der Detailansicht zeigt den Fehler 5 s an (gleiche Stelle wie Verschieben-Fehler).
- Reply-To bereits importierter Mails: der Umschlagabgleich trägt es nach (`KnownMessageUpdate.replyTo`, nur wenn lokal keins vorhanden). Test vorhanden.
- Lokale gesendete Kopie: `hasAttachments`/`attachmentNames` werden aus dem Entwurf gesetzt; zusammen mit APPENDUID sind eigene Anhänge damit abrufbar.

Offen bleibt die GUI-/Mailserver-Gegenprobe aller drei Pakete (Listen in den Abschnitten oben).

## Status
Review abgeschlossen (Codex, 11.09.2026). Claude-Antwort 11.09.2026: alle zehn Befunde bestätigt, drei Umsetzungspakete vorgeschlagen. Paket 1 (F01, F03, F04, F06a, F07) und Paket 2 (F02, F06b, F08, F09, F05 Stufe 1+2, BCC, Gelesen/Ungelesen) am 11.09.2026 umgesetzt — uncommitted, typecheck/test/build grün, GUI-Gegenproben offen. Paket 3 (Papierkorb-Löschen, verschwundene Mails entfernen mit Grabstein) am 11.09.2026 umgesetzt — uncommitted, typecheck/test/build grün. F05 Stufe 3 abgelehnt (kein Bedarf, Schemawechsel). Codex-Nachprüfung F11–F16 (11.09.2026) von Claude bestätigt und behoben, inkl. der drei weiteren Grenzen; 1882 Tests grün. Alles in v0.11.7-beta released (11.09.2026, Commit `32ced3f4`) — die GUI-/Mailserver-Gegenproben laufen jetzt am Installer. Codex-Empfehlung: Keine Implementierung der Findings. Empfehlung: zuerst Versandvertrauen (F01–F04, F06–F07), anschließend Postfachabgleich/Entwürfe und Suche ausbauen; F02 gehört wegen Textverlust ebenfalls in die erste Umsetzungsrunde.
