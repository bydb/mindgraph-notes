# Bilder und Dateien ins Mail-Schreibfenster ziehen oder einfügen

## Aufgabe
Prüfung von Commit `999c3ae2` (auf `master`, gepusht): Im Schreibfenster lassen sich Dateien
ablegen (Drag-and-drop) oder mit ⌘V einfügen. Bilder erscheinen im Mailtext an der Cursorstelle,
andere Dateien werden gewöhnlicher Anhang. Auslöser war der Wunsch, Screenshots direkt in eine
Mail zu ziehen.

Gesucht sind Löcher, nicht Bestätigung. Besonders:

1. **Sicherheit der Prozessgrenze.** Der Renderer gilt als möglicherweise kompromittiert.
   Kann er über `email-stage-compose-files` oder das erweiterte `email-render-html` etwas lesen,
   schreiben oder überschreiben, was er nicht soll (Pfad-Ausbruch über den Dateinamen,
   Symlinks, Speicher-/Plattenverbrauch, Datei außerhalb des Zwischenverzeichnisses als
   `data:`-Adresse zurückbekommen)?
2. **HTML der ausgehenden Mail.** Kann über Beschriftung, Dateiname oder Platzhalter fremdes
   HTML in die Mail oder in die Vorschau gelangen? Kann die Marke `MGINLINE<nonce>N<i>E`
   vom Renderer-Text vorgetäuscht oder von `renderEmailHtml` zerlegt werden?
3. **Datenverlust und stille Abweichung.** Fälle, in denen ein Bild behauptet, aber nicht
   mitgeschickt wird, oder mitgeht, obwohl es gelöscht wurde. Fälle, in denen ein Entwurf
   (localStorage, Pfade statt Bytes) auf eine Datei zeigt, die es nicht mehr gibt.
   Verwaiste Kopien im Zwischenverzeichnis.
4. **Zusammenspiel mit Bestehendem.** Weiterleiten (`forwardAttachments`), Entwurfsablage,
   `retireOpenCompose`, Microsoft-Versand über Graph (Größenschätzung), IMAP-Gesendet-Kopie,
   Rechtschreibprüfung (LanguageTool ändert den Text), Antworten/Zitieren.
5. **Bedienung.** Cursorstelle, wenn die Vorschau offen ist oder das Feld nie den Fokus hatte;
   Einfügen aus Word/Excel/Finder; Ablegen von Ordnern; mehrere Dateien.

## Kontext/Anker
Stand: `999c3ae2`. Projektregeln: `CLAUDE.md` (FS-IPC-Sicherheit), `.claude/rules/email.md`
(Abschnitt „Bilder im Mailtext“).

- Platzhalter-Logik (pur, getestet): `app/src/shared/emailInlineImages.ts`
  (`inlineImageToken`, `referencedInlineIds`, `splitInlineAttachments`, `sendableAttachments`,
  `insertInlineTokens`, `removeInlineToken`, `inlineTokensToPlainText`),
  Tests `app/src/shared/emailInlineImages.test.ts`
- Kopie beim Ablegen: `app/src/main/email/ipc.ts:684` (Grenzen), `:686` (`sniffImageExt`),
  `:694` (`email-stage-compose-files`); Aufräumen `:753` (`email-discard-staged-attachments`)
- Vorschau mit Bildern: `app/src/main/email/ipc.ts:2528` (`email-render-html`)
- Versandaufbau: `app/src/main/email/outgoing.ts:28` (`inlineImageTag`), `:41`
  (`renderBodyWithInlineImages`), `:113` (Teilung in eingebettet/gewöhnlich), `:175` (Reintext);
  Tests `app/src/main/email/outgoing.test.ts` (Block „Bilder im Text“)
- Graph-Versand nutzt denselben Aufbau: `app/src/main/email/graphSend.ts` (`findMissingAttachments`,
  Größenschätzung über `input.attachments`)
- Schreibfenster: `app/src/renderer/components/InboxPanel/ComposeView.tsx:79` (Vorschau-Aufruf),
  `:131` (`addDroppedFiles`), `:189` (Anhangsleiste zeigt nur Bilder mit Platzhalter),
  `:477` (`onDrop`), `:485` (`onPaste`); Tests `ComposeView.test.tsx` (Block „Bilder ablegen / einfügen“)
- Store: `app/src/renderer/stores/emailStore.ts:298` (`discardStagedAttachments`, erkennt Kopien
  am Pfadbestandteil `forward-attachments`), `:1021` (nur sendbare Anhänge gehen an `email-send`),
  `:1042` (lokale Gesendet-Kopie ohne Platzhalter)
- Typen/Preload: `app/src/shared/types.ts` (`ComposeAttachment.inlineId`, `width`),
  `app/src/main/preload.ts` (`emailStageComposeFiles`, `emailRenderHtml`)

Bekannte, bewusste Entscheidungen (bitte trotzdem angreifen, wenn sie falsch sind):
- Der Renderer schickt Bytes, keinen Pfad. Kopiert wird nach `userData/forward-attachments/<uuid>/`.
- Ein Bild ohne Platzhalter im Text geht nicht mit, auch nicht als Anhang.
- Unbekannte Platzhalter verschwinden beim Versand; die Vorschau zeigt „[Bild fehlt: …]“.
- Anzeigebreite höchstens 640 Pixel (festes `width`-Attribut wegen Outlook).
- Einfügen greift nur, wenn die Zwischenablage kein `text/plain` enthält.

Nicht geprüft vom Bauenden: echte Mausgeste mit dem macOS-Screenshot-Vorschaubild über alle Wege,
Darstellung einer echt verschickten Mail in Outlook und anderen Programmen.

## Codex-Findings

### F01 — Versand kann das noch laufende Einfügen überholen
Schwere: hoch
ADR-Stelle: app/src/renderer/components/InboxPanel/ComposeView.tsx:131
Status: [OFFEN]
`addDroppedFiles` liest jede Datei asynchron (`:137–144`) und wartet danach auf das Staging-IPC (`:149`); erst bei `:167` gelangen Bildplatzhalter und Anhang in den Store. Währenddessen bleibt der Senden-Knopf aktiv (`:124`, `:851–854`), und `sendEmail` nimmt sofort den bisherigen `composeState` (`app/src/renderer/stores/emailStore.ts:1003–1021`). Wer nach dem Ablegen sofort sendet, kann daher eine erfolgreiche Mail ohne das gerade abgelegte Bild verschicken. Kommt die Staging-Antwort erst nach dem Senden, räumt `:157–161` die Kopie weg; der Nutzer erhält keinen Hinweis, dass die Mail ohne Bild hinausging.
Vorschlag: Einen Übernahmezähler pro Entwurf führen, Versand bis zum Abschluss sperren und den ausstehenden Zustand auch im Store prüfen.

### F02 — Renderer kann Staging und Vorschau unbegrenzt wiederholen
Schwere: hoch
ADR-Stelle: app/src/main/email/ipc.ts:684
Status: [OFFEN]
Die Main-Grenze begrenzt nur auf 20 Dateien mit je 30 MiB **pro Aufruf** (`:684–685`, `:698`, `:711`). Jeder Aufruf erzeugt vor der Inhaltsprüfung ein neues Verzeichnis (`:702–703`) und schreibt bis zu 600 MiB (`:730–741`); es gibt weder Gesamtbudget noch Ablaufbereinigung. Ein kompromittierter Renderer kann den Handler wiederholt aufrufen, ohne die zurückgegebenen Pfade je in einen Entwurf zu übernehmen. `email-render-html` kann zusätzlich bis zu 20 solcher Dateien pro Aufruf vollständig lesen und als Base64 in die IPC-Antwort kopieren (`:2534–2545`), ebenfalls ohne Gesamt- oder Antwortlimit. Das erlaubt Speicher- und Plattenerschöpfung allein über diese neuen IPCs.
Vorschlag: Gesamtlimit und Lebensdauer für Staging-Dateien im Main erzwingen; Vorschau auf tatsächlich referenzierte Kennungen und ein kleines Antwortbudget begrenzen.

### F03 — Unbekannter oder beschädigter Bildplatzhalter verschwindet beim Versand
Schwere: hoch
ADR-Stelle: app/src/main/email/outgoing.ts:116
Status: [OFFEN]
`renderBodyWithInlineImages` ersetzt einen syntaktisch gültigen Platzhalter ohne passenden Anhang durch die leere Zeichenfolge (`app/src/main/email/outgoing.ts:48–54`, `:119–123`); `inlineTokensToPlainText` tut dasselbe (`app/src/shared/emailInlineImages.ts:109–112`). Ein beschädigter oder fehlender `inlineId` wird nicht als Versandfehler gemeldet. Besonders relevant ist die automatische Rechtschreibprüfung: Sie sendet den gesamten Body einschließlich technischer Bildmarken an LanguageTool und übernimmt dessen Korrekturen ohne Schutz der Marke (`app/src/renderer/components/InboxPanel/ComposeView.tsx:324–367`). Die Vorschau meldet bei unbekannter Kennung noch „Bild fehlt“ (`app/src/main/email/ipc.ts:2554–2556`), die tatsächlich gesendete HTML- und Reintext-Mail entfernt den Hinweis aber still. Wenn die Korrektur die Syntax des Platzhalters zerstört, bleibt stattdessen ein roher Platzhalter im Mailtext stehen und das Bild wird ebenfalls ausgelassen (`app/src/shared/emailInlineImages.ts:22–23`, `:60–70`).
Vorschlag: Vor dem Versand alle Bildreferenzen gegen vorhandene Anhänge prüfen und bei Abweichung blockieren; technische Marken von der Rechtschreibkorrektur ausnehmen.

### F04 — Entfernte Bilder bleiben unsichtbar im Entwurf und auf der Platte
Schwere: mittel
ADR-Stelle: app/src/renderer/components/InboxPanel/ComposeView.tsx:187
Status: [OFFEN]
Löscht man den Platzhalter direkt im Textfeld, blendet `shownAttachments` das Bild sofort aus (`:187–189`), lässt den Anhang aber in `composeState.attachments` (`:708–715`). Nur der Entfernen-Knopf ruft die Lösch-IPC auf (`:744–755`); dieser Knopf ist nun unsichtbar. Der Entwurf speichert den Pfad weiter in `localStorage` (`app/src/renderer/utils/emailDrafts.ts:68–74`), und `retireOpenCompose` behält Inhaltsentwürfe samt Kopien (`app/src/renderer/stores/emailStore.ts:229–239`). Auch ein nie wieder geöffneter Entwurf hält die Datei damit unbegrenzt vor. `sendableAttachments` lässt sie zwar beim Senden weg (`app/src/shared/emailInlineImages.ts:60–77`), der versprochene Löschvorgang beim Entfernen aus dem Text erfolgt aber nicht.
Vorschlag: Nicht mehr referenzierte Staging-Bilder beim Textwechsel aus dem Entwurf entfernen und im Main löschen; Entwurfsdateien beim Start auf verwaiste Kopien prüfen.

### F05 — Bildtyp und MIME-Typ können auseinanderfallen
Schwere: mittel
ADR-Stelle: app/src/main/email/ipc.ts:686
Status: [OFFEN]
Das Staging erkennt PNG/JPEG/GIF/WebP nur an wenigen Anfangsbytes (`:686–691`), behält den übergebenen Dateinamen mit seiner bisherigen Erweiterung aber bei (`:718–741`). `buildOutgoingMail` übergibt beim CID-Anhang nur `filename`, `path`, `cid` und `contentDisposition`, keinen erkannten `contentType` (`app/src/main/email/outgoing.ts:133–134`). Bei einer PNG-Datei namens `scan.pdf` entsteht so ein als Bild angekündigter Platzhalter und eine Bildvorschau, während die MIME-Erkennung des Versands am falschen Dateinamen hängt; Empfänger können ein defektes eingebettetes Bild sehen. Dasselbe gilt für bloße Signaturbytes, die kein decodierbares Bild sind: Die Breitenprüfung fängt den Fehler ab und der Anhang geht trotzdem als Inline-Bild mit (`app/src/main/email/ipc.ts:736–741`).
Vorschlag: Erkannte Bildart als MIME-Typ an den Versand durchreichen und Bilddaten vor dem Einbetten tatsächlich decodieren.

### F06 — Mehrfachablage liest alle Dateien vor der Main-Grenze
Schwere: mittel
ADR-Stelle: app/src/renderer/components/InboxPanel/ComposeView.tsx:136
Status: [OFFEN]
Die Oberfläche liest in `addDroppedFiles` alle abgelegten Dateien bis 30 MiB nacheinander vollständig in `Uint8Array` (`:136–144`), bevor das Main-IPC nur die ersten 20 verarbeitet (`app/src/main/email/ipc.ts:698–700`). Bei vielen Dateien werden also alle Bytes im Renderer gehalten und über IPC serialisiert; zusätzliche Dateien werden erst dort als übersprungen gemeldet. Das kann die Oberfläche lange blockieren oder den Renderer erschöpfen, obwohl die dokumentierte 20-Dateien-Grenze scheinbar greift.
Vorschlag: Bereits vor `arrayBuffer()` auf 20 Dateien und eine Gesamtgröße begrenzen; Überschüsse sofort als übersprungen melden.

### F07 — Ablegen im Text nutzt die letzte Auswahl, nicht die Ablegestelle
Schwere: niedrig
ADR-Stelle: app/src/renderer/components/InboxPanel/ComposeView.tsx:165
Status: [OFFEN]
`onDrop` übergibt nur die Dateien (`:477–483`); `addDroppedFiles` setzt Bildmarken an `cursorRef.current` oder bei nie fokussiertem Textfeld an Position 0 (`:164–167`). Weder die Mausposition beim Ablegen noch die Position im Vorschautext wird ausgewertet. Wer ein Bild sichtbar zwischen zwei Absätze zieht, bekommt es deshalb an der zuletzt selektierten Stelle oder am Anfang, auch wenn die Maus anderswo steht.
Vorschlag: Beim Drop auf dem Textfeld die Ablegestelle ermitteln; andernorts die tatsächliche Einfügestelle sichtbar ankündigen.

## Claude-Antwort

Runde 1, 11.11.2026. Alle sieben Befunde am Code nachgemessen; der Nutzer hat F01, F03, F05,
F06 und einen Teil von F02 freigegeben. Stand: `999c3ae2` plus uncommittete Änderungen.

### F01 — [ADRESSIERT]
Trägt (Schwere eher mittel: das Fenster ist bei einem Screenshot Millisekunden lang, bei 30 MB
länger). Das Schreibfenster zählt laufende Übernahmen (`ComposeView.tsx:150`, `dropBusy`).
Solange eine läuft, ist „Senden“ gesperrt, `handleSend` bricht zusätzlich über die Ref ab, und
eine Zeile „Datei wird übernommen …“ steht im Fenster. Test: „sperrt Senden, solange eine
abgelegte Datei noch übernommen wird“. Nicht im Store geprüft: der Zähler lebt im Fenster, und
`sendEmail` wird nur von dort aufgerufen.

### F02 — [ADRESSIERT] (Teil) / [ABGELEHNT: Gesamtbudget]
Umgesetzt ist der Vorschau-Teil: `email-render-html` liest nur noch Bilder, deren Kennung im Text
steht, jede Kennung einmal, und insgesamt höchstens `COMPOSE_STAGE_MAX_TOTAL_BYTES`
(`ipc.ts:2544`). Die Ablage hat jetzt zusätzlich eine Gesamtgrenze je Aufruf (100 MiB).
Abgelehnt: Gesamtbudget über alle Aufrufe und Ablaufbereinigung. Grund: Ein kompromittierter
Renderer kann die Platte schon über die normalen Schreibwege im Vault füllen, die neue Ablage
ändert die Lage nicht. Eine Bereinigung beträfe außerdem die Weiterleitungs-Anhänge und die
Entwurfsablage (Pfade im localStorage) genauso und ist ein eigenes Thema.

### F03 — [ADRESSIERT]
Trägt. Drei Änderungen:
1. Die Rechtschreibprüfung verwirft Treffer, die einen Platzhalter berühren
   (`ComposeView.tsx:363`, `inlineTokenRanges`).
2. Ein Platzhalter ohne Bild sperrt den Versand mit Klartext, im Fenster
   (`ComposeView.tsx:422`) und als zweite Grenze im Main vor der Weiche der Transportwege
   (`ipc.ts:2658`). Erkannt werden gültige Platzhalter mit unbekannter Kennung und beschädigte
   Reste `](bild:` (`shared/emailInlineImages.ts:50`, `findBrokenInlineTokens`, getestet).
3. Zusatz, von Codex nicht genannt: Das Ergebnis der Rechtschreibprüfung überschrieb den Text
   mit dem Stand vom Beginn der Prüfung. Ein währenddessen abgelegtes Bild verlor so seinen
   Platzhalter. Jetzt wird das Ergebnis verworfen, wenn sich der Text inzwischen geändert hat
   (`ComposeView.tsx:360`).
`buildOutgoingMail` selbst bleibt nachsichtig (entfernt unbekannte Platzhalter); die Sperre
sitzt davor.

### F04 — [ABGELEHNT: bewusste Entscheidung, Schwere niedrig]
Teilweise richtig beschrieben, aber nicht „unbegrenzt“: Die Kopie wird beim Senden und beim
Verwerfen des Entwurfs gelöscht (`emailStore.ts`, `discardStagedAttachments` über alle
`attachments` des Entwurfs, auch nicht mehr referenzierte). Sie bleibt so lange liegen, wie der
Entwurf lebt. Das ist Absicht: Ein versehentlich gelöschter Platzhalter kommt mit Rückgängig
zurück, und das Bild ist dann noch da. Vom Nutzer als „warten“ entschieden.

### F05 — [ADRESSIERT]
Trägt; nachgemessen: nodemailer leitet aus `scan.pdf` `application/pdf` ab. Beim Ablegen bekommt
ein erkanntes Bild die passende Endung angehängt (`ipc.ts:740`), und der Versand setzt die
Bildart ausdrücklich (`outgoing.ts:137`). PNG und JPEG werden beim Ablegen wirklich geöffnet;
gelingt das nicht, wird die Datei gewöhnlicher Anhang statt Bild im Text (`ipc.ts:722`).
Grenze: GIF und WebP werden weiter nur am Dateianfang erkannt, weil `nativeImage` sie nicht
verlässlich öffnet. Test: „setzt die Bildart ausdrücklich …“.

### F06 — [ADRESSIERT]
Trägt. Anzahl (20), Einzelgröße (30 MiB) und Gesamtgröße (100 MiB) werden im Fenster geprüft,
bevor eine Datei gelesen wird (`ComposeView.tsx:156`); die Grenzen stehen einmal in
`shared/emailInlineImages.ts` und gelten im Main genauso. Test: „liest höchstens 20 abgelegte
Dateien und nennt die übrigen“.

### F07 — [ABGELEHNT: so bestellt]
Der Nutzer hat ausdrücklich „an der Cursorstelle“ verlangt. Die Mausposition in einem
`<textarea>` zu treffen wäre ein Umbau ohne Auftrag.

## Status
Runde 1 beantwortet (11.11.2026). Umsetzung uncommitted auf `999c3ae2`; Abnahme durch den Nutzer steht aus.
Typecheck und Build bestanden; Tests 3773 bestanden, im Gesamtlauf ein fremder zeitabhängiger Test (`noteAgent/shellExecution.test.ts`) mit Zeitüberschreitung, einzeln bestanden.
