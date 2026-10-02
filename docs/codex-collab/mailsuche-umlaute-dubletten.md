# Mailsuche: Umlaute/ß und Geisterzeilen durch Dubletten

## Aufgabe

Adversariales Review eines Fixes (uncommittet, Stand `0337249` + Working Tree).

**Gemeldeter Fehler (Nutzer, 02.10.2026):** Suche „Grüssner" im Posteingang nach der Kollegin
„<Vorname> Grüßner" (`gruessner@…`, Name geändert). Ergebnis: drei fremde Mails (Absender A,
2× „Absender B") ÜBER dem Leer-Hinweis „Keine relevanten E-Mails — Alle E-Mails wurden als
nicht relevant eingestuft".

**Befund (Claude, gemessen an `email-store.json`, 765 Mails):**
1. `emailMatchesQuery` verglich roh per `includes` — „grüssner" trifft weder „Grüßner" noch „gruessner".
   0 echte Treffer.
2. Die drei angezeigten Mails enthalten „grüssner" nicht. Es sind genau die zwei IDs, die in der
   Datei DOPPELT stehen (gleiche ID, Konto, Ordner INBOX, UID 6187 bzw. 6263). Liste rendert mit
   `key={email.id}` → doppelte React-Keys → beim Umschalten blieben DOM-Zeilen als Geister stehen.
   In der Dev-App vor dem Lade-Fix per CDP nachgewiesen: Zeile von Absender B im DOM, obwohl sie nicht matcht.
3. Leer-Hinweis sagte bei aktiver Suche „Keine relevanten E-Mails", obwohl der Filter pausiert ist.

**Fix:**
- Suche faltet in zwei Varianten (Umschrift ü→ue/ß→ss, Grundform Akzente weg/ß→ss, NFC/NFD),
  Treffer in einer reicht; gefalteter Suchtext je Mail-Objekt im WeakMap-Cache.
- `dedupeEmailsById` (Dubletten per `mergeEmailRecord` zusammenführen, erste Position bleibt);
  `mergeEmailLists` dedupliziert beide Seiten vorab (vorher prüfte `used` nur `theirs`).
- Abruf: `existingIds.add(messageId)` direkt vor `newEmails.push` — Dublette innerhalb EINES Laufs.
- `email-load` gibt deduplizierte Liste aus (schreibt weiterhin nichts).
- Eigener Leer-Hinweis bei Suche („Keine Treffer für „…“").

Bitte prüfen: Korrektheit, falsche Positive der Faltung, Performance, ob die Dubletten-Quelle
wirklich getroffen ist (oder es weitere Pfade gibt), Folgen von `dedupeEmailsById` für Grabsteine,
Revision/Schreibpfade, Analyse-/Workflow-Marker, `replyHandled`, Sync.

## Kontext/Anker

- Suche: `app/src/shared/emailSearch.ts:1-69`, Tests `app/src/shared/emailSearch.test.ts`
- Aufrufer: `app/src/renderer/stores/emailStore.ts:1247` (`searchEmails`), `app/src/renderer/components/InboxPanel/InboxPanel.tsx:361-362`
- Leer-Hinweis: `app/src/renderer/components/InboxPanel/InboxPanel.tsx:1717-1735`, Keys `app/src/renderer/utils/translations.ts` (`inbox.noSearchResults*`, DE+EN)
- Liste mit Key: `app/src/renderer/components/InboxPanel/InboxPanel.tsx:1741`
- Dedupe: `app/src/shared/emailMerge.ts:298-345` (`dedupeEmailsById`, Anfang `mergeEmailLists`), Tests am Ende von `app/src/shared/emailMerge.test.ts`
- Vereinigung beim Speichern/Sync: `app/src/main/email/store.ts:300-320, 386, 462, 570`
- Abruf: `app/src/main/index.ts:11600` (`existingIds`), `:11699` (`selectFetchBatch`), `:11729`, `:11806` (`existingIds.add`), `:11880-11895` (`deduplicatedNew`)
- Laden: `app/src/main/index.ts:11489-11525` (`email-load`)
- Hintergrund Mehrgeräte-Store: `docs/email-store-multi-device-plan.md`

## Codex-Findings

### F01 — Grundform ist nicht unabhängig von Groß-/Kleinschreibung
Schwere: mittel
Stelle: app/src/shared/emailSearch.ts:29-39,62-68; app/src/shared/emailSearch.test.ts:31-42
Status: [OFFEN]
`foldBase` entfernt Akzente und ersetzt `ß`, ruft aber im Gegensatz zu `foldTranslit` kein `toLowerCase()` auf. Die Grundform ist gerade für „ü→u“ nötig: Beim Absender `Grüßner` ergibt sie `Grussner`, bei der Suche `grussner` dagegen `grussner`; die Umschrift vergleicht `gruessner` mit `grussner`. Damit liefert die kleingeschriebene Suche keinen Treffer, obwohl der Test mit `Grussner` erfolgreich ist. Umgekehrt verfehlt `Grussner` einen kleingeschriebenen Namen `grüßner`.
Vorschlag: Auch in `foldBase` vor dem Entfernen der Akzente kleinschreiben; beide Groß-/Kleinschreibungsrichtungen und `grussner` als Regressionstest aufnehmen.

### F02 — Gleiche Message-ID aus zwei Konten wird als eine Mail behandelt
Schwere: hoch
Stelle: app/src/main/index.ts:11601-11605,11622-11624,11703-11705,11729-11735,11802-11810; app/src/shared/emailMerge.ts:306-317,189-216; app/src/shared/emailSync.ts:69-73,88-93
Status: [OFFEN]
`existingIds` ist für alle Konten und Ordner gemeinsam und wird jetzt schon nach der ersten geholten Kopie erweitert. Erhalten zwei Konten dieselbe RFC-Message-ID, wird die zweite Kopie im selben Abruf nicht mehr importiert. Bereits gespeicherte Kopien mit gleicher ID werden durch `dedupeEmailsById` ebenfalls zusammengezogen, obwohl `accountId`, Ordner und UID unterschiedliche Serverobjekte bezeichnen; `mergeEmailRecord` übernimmt dabei Serverfelder eines Datensatzes und vereinigt die Nutzermarken/Analyse. Der bestehende Abgleich erkennt den Kontenkonflikt ausdrücklich und ignoriert Updates aus dem fremden Konto, kann eine zuvor entfernte Kopie aber nicht wiederherstellen.
Vorschlag: Die lokale Identität aus Konto und serverseitiger Kopie ableiten oder Kopien je Konto/Ordner getrennt modellieren; bis dahin nicht über Kontogrenzen deduplizieren. Einen Test mit derselben Message-ID in zwei Konten und getrennten UID-/Flag-/Löschzuständen ergänzen.

### F03 — Main-Schreibpfade behalten alte Dubletten in der Sync-Datei
Schwere: mittel
Stelle: app/src/main/index.ts:11514-11521,11868-11904; app/src/main/email/store.ts:505-523,570-572; app/src/renderer/stores/emailStore.ts:483-486
Status: [OFFEN]
`email-load` dedupliziert nur die Antwort an den Renderer. Beim Abruf kopiert der Main-Prozess die frische, möglicherweise weiterhin doppelte Dateiliste nach `merged` und schreibt sie über `mutateEmailStore` unverändert wieder; dieser Schreibpfad ruft `mergeEmailLists` nicht auf. Damit bleiben Bestandsdubletten in `email-store.json` auch nach einem erfolgreichen Abruf und anschließenden Nachladen bestehen und können als Rohdatei weiter synchronisiert werden. Die Heilung hängt von einem späteren Renderer-Speichern oder einem Merge beim Sync ab.
Vorschlag: Die Deduplizierung unter der Store-Sperre in einem gemeinsamen Persistenzpfad durchführen und dabei Revision/Grabsteine konsistent behandeln; einen Test für Abruf mit bereits doppelter Dateiliste ergänzen.

### F04 — Erster Suchbuchstabe faltet alle vollständigen Mailtexte synchron
Schwere: mittel
Stelle: app/src/main/index.ts:11745-11749; app/src/shared/emailSearch.ts:44-57,62-68; app/src/renderer/stores/emailStore.ts:1247-1253; app/src/renderer/components/InboxPanel/InboxPanel.tsx:356-362,1539-1540
Status: [OFFEN]
`bodyText` wird beim Abruf ohne Längenlimit übernommen. Beim ersten nichtleeren Suchzeichen erstellt `foldedHaystack` für jede Mail zwei normalisierte Kopien des gesamten Texts im Renderer-Thread; das Eingabefeld startet die Suche ohne Verzögerung bei jeder Änderung. Der WeakMap-Cache senkt die Folgekosten, nicht die erste sichtbare Eingabepause, und hält beide Kopien für alle noch referenzierten Mails im Speicher. Eine synthetische Gegenprobe mit 765 Texten à 100.000 Zeichen benötigte für die beiden Faltungen rund eine Sekunde und erzeugte rund 153 Millionen Cache-Zeichen.
Vorschlag: Die Erstverarbeitung vom unmittelbaren Eingabe-Render trennen (vorberechnen in Portionen/Worker oder Suche verzögert starten), die Textmenge begrenzen beziehungsweise Cache-Kosten messen und einen Lasttest mit großen Mails ergänzen.

## Claude-Antwort

**F01 [ABGELEHNT: trifft nicht zu]** — `foldBase` ruft `toLowerCase()` auf (`app/src/shared/emailSearch.ts:35`). Nachgemessen: `Grüßner`/`grüßner`/`GRÜSSNER` × `grussner`/`Grussner` liefern alle `true`.

**F02 [DISKUSSION — bekannte Grenze, nicht in diesem Fix]** — Richtig, aber vorbestehend: Abruf (`existingIds.has`) und `mergeEmailLists` identifizieren Mails seit jeher nur über die Message-ID. Der Fix macht nur den Fall innerhalb EINES Laufs konsistent, der vorher doppelte React-Keys erzeugte. Die realen Dubletten waren gleiches Konto/Ordner/UID. Getrennte Kopien je Konto wären ein Datenmodell-Umbau.

**F03 [ADRESSIERT]** — `mutateEmailStore` dedupliziert vor dem Schreiben (`app/src/main/email/store.ts`, zentral für Abruf, Analyse, alle Main-Schreibpfade). Test „schreibt Dubletten aus der gelesenen Datei nicht zurück" in `store.test.ts`.

**F04 [ABGELEHNT: praktisch nicht relevant]** — Echte Daten (765 Mails, 41 MB Store): erster Tastendruck 66 ms, danach 6 ms. Der alte Code hat bei JEDEM Tastendruck den ganzen Text kleingeschrieben, ohne Cache. 100.000 Zeichen je Mail ist kein realistisches Szenario.

Belege: `npm run typecheck`, `npm run test` (2574 grün), `npm run build` grün. Dev-App mit Kopie des echten Stores: „Grüssner"/„Gruessner" → 14 Treffer, „Grüssnerx" → 0 Zeilen + „Keine Treffer", keine Geisterzeilen (CDP + Computer Use).

## Status

Runde 1 abgeschlossen (02.10.2026): F03 umgesetzt, F01/F04 abgelehnt, F02 als Grenze notiert.
