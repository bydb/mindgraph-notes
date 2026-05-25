# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

## [0.7.0-beta] - 2026-05-25

### Features

- **Workflow Canvas — visuelle Automations- und Integrationsschicht (neues Modul, opt-in)**: Module werden als verbindbare Bausteine mit typisierten Ports auf einem Canvas platziert (React Flow). Aktivierung über Einstellungen → Module → „Workflow Canvas", danach erscheint der „Workflow"-Tab.
  - **Bausteine** für 5 Module: E-Mail (Auslöser, analysieren), Projekt (erkennen via Keyword-Matcher, Kontext aus `_STATUS.md` laden), Ollama (Zusammenfassen, Antwort entwerfen, Aufgaben extrahieren, Klassifizieren, Freier Prompt), Notiz (erstellen, suchen, anhängen), Menschliche Prüfung.
  - **Typisierte Ports mit Validierung**: kompatible Eingänge leuchten beim Verbinden, unpassende werden blockiert; Pflicht-Eingänge und Zyklen werden geprüft.
  - **Simulieren** (deterministischer Trockenlauf mit Beispielausgaben) und **Ausführen** (echter Lauf gegen lokales Ollama). Das Lauf-Panel zeigt die Schrittfolge inklusive tatsächlicher Ausgaben (z.B. extrahierte Aufgaben).
  - **Auslöser**: manuell (Seed = ausgewählte Mail) oder automatisch bei neuer relevanter Mail (exactly-once über einen `emails.json`-Marker, hart gedeckelte Batch-Größe gegen Last-Spitzen).
  - **Menschliche Prüfung als Hand-off**: bei manuellem Lauf öffnet sich das Compose-Fenster mit dem Ollama-Antwortentwurf (die Antwortadresse wird bei Formular-Mails aus dem Body gezogen); bei einem Event-Lauf entsteht eine Aufgabe. Das Senden bleibt immer beim Menschen.
  - **Sicherheit**: schreibende Aktionen laufen über die abgesicherte Schreibgrenze (`assertSafePath` + Backup); LLM-Aktionen auf untrusted Mail-Inhalt respektieren die Modell-Hard-Locks; Bausteine deaktivierter Module stoppen den Lauf sauber.
  - **Notizen aus Workflows** werden im Vault-Format angelegt (Zettelkasten-ID `YYYYMMDDhhmm`, YAML-Frontmatter) und als Workflow-erzeugt gekennzeichnet (`source: workflow`, `workflow: "<Name>"`, Hinweiszeile im Body). Bestehende Notizen werden nie überschrieben.
- **E-Mail-Markdown-Vorschau**: Das Compose-Fenster hat einen Vorschau-Umschalter, der exakt das gesendete HTML rendert (fett, kursiv, Listen, Trennlinien, Überschriften).

### Improvements

- **Abgesicherte Schreibgrenze `writeFileSafe`** zentral aus dem `write-file`-Handler extrahiert (`assertSafePath` + Auto-Heal + Backup + Empty-Write-Block) — vom Handler und vom Workflow-Runner gemeinsam genutzt, sodass es nur einen Schreibpfad gibt.
- **`matchEmailToProjects`** als geteilter Keyword-Matcher nach `shared/projectMatch.ts` portiert (von Inbox und Workflow-Runner genutzt).

### Fixes

- **`##`-Überschriften in gesendeten E-Mails** werden jetzt als fette Zeile gerendert statt als Rohtext angezeigt.

## [0.6.57-beta] - 2026-05-24

### Improvements

- **Email→Projekt-Zuordnung: Komposita und Auto-Identitäts-Keywords**: Das Projekt-Matching in `utils/projectMatch.ts` ist deutlich robuster geworden:
  - **Auto-Identitäts-Keywords aus Projektname + Ordnername**: Jedes Projekt wird ab sofort immer über seinen eigenen Namen erkannt — unabhängig davon, was der Crystallizer ins `_STATUS.md` schreibt. `stripFolderPrefix` entfernt das `NNN - `-Präfix, dann werden sowohl der ganze Name (z.B. „Mars Abenteuer") als auch einzelne Tokens (≥4 Zeichen, z.B. `Mars`, `Abenteuer`) als Match-Terms registriert. Schlechte Crystallizer-Keywords wie `fragt, nach, Teilnahme` können das echte Projekt-Signal damit nicht mehr überdecken.
  - **Komposita-Match für deutsche Wörter**: Neuer `compoundPrefix`-Modus mit `(^|[^\p{L}\p{N}])TERM[\p{L}\p{N}]*`-RegExp lässt einzelne Identitäts-Tokens am Anfang deutscher Komposita matchen — z.B. `Mars` in `Marslandschaft`. Suffix-Matches wie `landMars` werden ausgeschlossen. **Schutz**: Compound-Match feuert nur im Subject, nicht im Body — sonst würden Newsletter-Footer mit Wörtern wie „Marshmallow" fälschlich matchen.
  - **Dreistufige Sortierung**: `subjectHitCount` → `hitCount` total → Priority als Tiebreaker. Ein einziger Subject-Treffer schlägt jetzt beliebig viele Body-Treffer. „Roll-Up Marslandschaft" im Subject wird also nie wieder von einer Body-/Signatur-Mailflut eines anderen Projekts überstimmt.

## [0.6.56-beta] - 2026-05-24

### Improvements

- **„Neu analysieren" setzt manuellen Projekt-Override zurück**: Bisher rechnete der „🔄 Neu analysieren"-Button im Email-Detail nur die KI-Analyse (Relevanz, Sentiment, Summary, Tasks) neu — eine evtl. vorhandene manuelle Projekt-Zuordnung (`userProject`) blieb aber bestehen und schlug das Auto-Match weiterhin. Damit konnte z.B. eine Mail mit `Marslandschaft` im Subject hartnäckig dem falschen Projekt zugeordnet bleiben, selbst nach Reanalyse. Wer „Neu analysieren" klickt, will explizit alles neu berechnen lassen — inkl. Projekt-Zuordnung. Wenn ein Override existierte, wird er vor der Analyse gelöscht, und das frische Auto-Match (mit der in 0.6.55 korrigierten Subject-/Priority-Sortierung) greift wieder. Bulk-Analyse von vielen Mails lässt manuelle Zuordnungen weiterhin in Ruhe — nur der explizite Reanalyse-Klick einer einzelnen Mail löscht den Override.

## [0.6.55-beta] - 2026-05-24

### Fixes

- **Email-Zuordnung zu Projekten: Subject-Treffer schlagen jetzt Priority**: Mails wurden bislang dem falschen Projekt zugeordnet, sobald ein `priority: high`-Projekt mit schwachen Stopwort-artigen Keywords (z.B. `fragt, nach, Teilnahme`) zufällig im Body matchete — selbst wenn das Subject einer Mail eindeutig auf ein anderes `priority: med`-Projekt zeigte (Beispiel: „Re: Roll-Up Marslandschaft" landete bei „143 - Digitaltag" statt bei „160 - Mars Abenteuer", obwohl `Marslandschaft` direkt im Subject stand). Drei zusammenhängende Änderungen in `utils/projectMatch.ts`:
  - **Subject-Hits werden 5× gewichtet** (vorher: gleiche Gewichtung wie Body). Ein Projektname im Subject ist Absicht; im Body/Footer/Quoted-Text ist er meistens Rauschen.
  - **Priority ist jetzt Tiebreaker, nicht Hauptsortierung**. Vorher dominierte Priority unbedingt — `high` schlug `med` bei beliebigem hitCount-Unterschied. Jetzt: hitCount entscheidet, Priority nur bei Gleichstand.
  - **Stopword-Liste erweitert** um häufige Crystallizer-Füllwörter (`nach, teilnahme, fragt, einen, sendet, erstentwurf, bitte, gerne, soll, will, kommt, geht` + Konjugationen). Diese kommen aus dem Project-Status-Crystallizer-Output und sollten gar nicht erst matchen.

## [0.6.54-beta] - 2026-05-24

### Fixes

- **Callouts überleben WYSIWYG-Roundtrip**: Im Lesen-Modus wurden Callouts (`> [!note]`, `> [!summary]`, `> [!warning]`, …) bei jedem Save stillschweigend zerlegt — aus einem mehrzeiligen Callout-Block wurde Klartext mit Emoji-Präfix, der Callout verschwand. Ursache: Turndown's Default-Behandlung von `<details>`- und `<div class="callout">`-Knoten hat die Callout-Struktur nicht erkannt. Neue Turndown-Regel `callout` liest jetzt `data-callout-type`/`data-callout-fold`/`data-callout-title`-Attribute (in `processCallouts` gesetzt) und rekonstruiert daraus `> [!type][+-] title\n> body…`-Markdown. Body-HTML wird rekursiv durch Turndown gejagt und mit `> `-Präfix versehen. Faltbare Callouts (`[!type]+`/`[!type]-`) und custom Titel bleiben erhalten.

## [0.6.53-beta] - 2026-05-24

### Features

- **Mermaid-Diagramme im Notes-Chat**: Wenn der Notes-Chat (Header-Button „KI") eine Antwort mit einem ` ```mermaid `-Block produziert, wird der Block jetzt als gerendertes Diagramm angezeigt — nicht mehr als roher Code. Funktioniert mit allen von Mermaid unterstützten Diagrammtypen (Flowchart, Sequence, Mindmap, Timeline, Pie, Quadrant, Sankey, Class, ER, State, …). Sicherheit über `securityLevel: 'strict'` analog Editor und Flashcards. Rendering läuft nur auf finalen Messages, nicht während des Streamings — verhindert Render-Errors auf unvollständigem SVG-Output.

### Improvements

- **Tabellen-Styling im Reading-Modus, Flashcards und Notes-Chat modernisiert**: Vereinheitlichtes Tabellen-Look-and-Feel über drei bisher separat gestylte Render-Pfade. Konsistente Border-, Header- und Zell-Tokens via `color-mix()`-Variablen — Tabellen wirken jetzt in allen drei Kontexten gleichwertig hochwertig, statt sich je nach Rendering-Pipeline zu unterscheiden.
- **Blog: Tabellen-Styling und summary-Callout im Stylesheet**: Die Blog-Seiten (`docs/blog/`) bekommen dasselbe Tabellen-Styling wie die App, plus eine neue `[!summary]`-Callout-Variante. Damit Tabellen und Zusammenfassungs-Boxen in MindGraph-Notes-Artikeln (`mindgraph-notes.de/blog`) optisch ankommen.
- **Blog: Lokale-Modelle-Artikel überarbeitet**: Der Artikel „Lokale Modelle, ehrlich gerechnet" wurde inhaltlich präzisiert und mit zusätzlichen Datenpunkten aus den 160 Benchmark-Läufen vom Mai untermauert.

### Security

- **20 Dependency-Vulnerabilities gepatcht**: `npm audit fix` schließt unter anderem DOMPurify-XSS-Bypasses (genutzt in `sanitizeHtml()` überall — Editor, Notes-Chat, Email-Analyse), Mermaid-CSS-Injection (relevant durch den neuen Notes-Chat-Mermaid-Renderer), nodemailer-SMTP-Command-Injection im Absender-Name-Feld (Email-Send-Pfad), xmldom-XML-Injection (via mailparser-Dependency-Tree — Email-Receive-Pfad), `ws`-Uninitialized-Memory-Disclosure und mehrere Lodash-Prototype-Pollution-Pfade. Alle Updates blieben in den bestehenden Semver-Ranges, nur `package-lock.json` verändert. Reduktion von 22 offenen Alerts auf 1 lokal.
- **`@anthropic-ai/sdk` 0.91 → 0.98**: Schließt die letzte verbliebene Memory-Tool-File-Permission-Vulnerability (von uns nicht genutzt). Unsere SDK-Surface ist minimal (ein `messages.create`-Call in `main/llm/chatClient.ts`, kein Streaming, kein Tool-Use), Breaking-Changes zwischen 0.91 und 0.98 betreffen ausschließlich Managed-Agents- und Auth-Features — kein Code-Anpassung nötig. Übrig: nur noch `xlsx` (SheetJS), für den es keinen npm-Fix-Pfad gibt (kein attacker-controlled Input in unserem Code, Risiko akzeptiert).

## [0.6.52-beta] - 2026-05-22

### Features

- **Onboarding: KI ist nie mehr Vorbedingung — drei klare Pfade beim Start**: Bisher konnte der Welcome-Coach in eine Fehlermeldung laufen, wenn weder Ollama noch ein Anthropic-Key vorhanden war (Button grau, kurzer Tooltip). Neuer Flow: Der Coach-Button bleibt immer klickbar. Bei fehlendem Backend routet das Onboarding in einen neuen **AI-Setup-Step** mit drei Karten — (1) **Ollama installieren** (OS-Erkennung mac/win/linux, Copy-Command, 3-s-Polling auf `coach:precheck` mit Auto-Advance bei Erkennung), (2) **Anthropic-API-Key eintragen** (re-used `telegram-save-anthropic-key`-IPC), (3) **Ohne KI weitermachen** (springt in den klassischen Wizard, KI bleibt aus). WelcomeScreen zeigt zusätzlich eine **AI-Status-Pill** (KI bereit / nicht eingerichtet / Prüfe …).
- **Neue Coach-Q&A-KB-Einträge**: `modules.md` (Kern vs. Module, wo schalte ich sie um, vollständige Modul-Liste nach Kategorie) und `schnellerfassung.md` (drei Wege ins Quick-Capture-Fenster, Diktat-Button ⌘D, Tags, Zielordner). Damit beantwortet der Header-Bot jetzt auch Fragen zu Modul-Verwaltung und Quick Capture korrekt aus der KB statt zu raten.

### Improvements

- **Einheitliche Produktidentität in README, package.json und Website**: Die drei Außentexte beschrieben MindGraph Notes bisher dreifach unterschiedlich („Notiz-App", „minimalistische Markdown-App", „lokaler KI-Workspace") und führten Nutzer mit einer Feature-Liste statt mit einem Verhalten ins Produkt. Neue gemeinsame Lead-Aussage: **„Zeigt dir, was heute wichtig ist."** (EN: „Shows you what matters today.") — was die App tatsächlich tut (Notizen, Aufgaben, Mails, Dokumente nach Relevanz sortieren), nicht was sie technisch enthält. Nav-Logo von „MindGraph Workspace" auf „MindGraph Notes" vereinheitlicht.
- **Coach Q&A-Bot: KB-First statt vorschnell aufgeben**: Der Bot im App-Header hat zu schnell „weiß ich nicht sicher" gesagt, auch wenn die KB den passenden Eintrag enthielt — nur mit leicht anderer Wortwahl („Widgets einstellen" vs. KB-Heading „Wo stellst du Widgets ein?"). Prompt schärft jetzt: KB muss Wort für Wort geprüft werden, abweichendes Vokabular ist kein Grund zum Abbrechen. „Weiß ich nicht" nur, wenn die KB explizit nichts hat. Anlaufpunkt-Hinweise zeigen jetzt auf **mindgraph-notes.de** statt auf den nicht-existenten Help-Guide oder README.
- **KB-Eintrag `dashboard.md` erweitert**: Konkretere Antwort auf „Wie konfiguriere ich Widgets?" — vorher nur `Settings → Allgemein → Dashboard` mit einem Satz, jetzt mit Master-Schalter, Widgets-Sektion (Checkbox + ▲/▼-Sortierung), Morning-Briefing-Optionen und Aufgaben-Vorlauf strukturiert ausgeschrieben. Keywords um Synonyme („einstellen", „konfigurieren", „anzeigen", „ausblenden", „sortieren", „aktivieren", „deaktivieren") erweitert.

## [0.6.51-beta] - 2026-05-22

### Features

- **Email-Notizen als 4. Quelle im Project-Status-Crystallizer**: Der wöchentliche Projekt-Status (`_STATUS.md`) bezieht jetzt zusätzlich zu Brain-Tagen, Projektdateien und Inbox-Notes auch die analysierten Email-Notizen aus dem Email-Ordner mit ein (Default `‼️📧 - emails`, übernommen aus den Email-Settings). 30-Tage-Lookback, Keyword-Match im Mail-Body, ein Satz Kontext-Snippets analog Inbox. Der Crystallizer-Prompt instruiert das LLM explizit, **Absender aus dem `von:`-Frontmatter als Stakeholder** und **`@[[YYYY-MM-DD]]`-Termine aus den Email-„Aufgaben"-Sektionen als „Wichtige Daten"** zu nutzen — Emails sind in der Praxis die konkreteste Quelle für „Wer hat was wann gesagt".

### Improvements

- **Status-Frontmatter zeigt `emails_included:`** — alle in den aktuellen Lauf eingeflossenen Email-Notiztitel (max 8) sind im Output-Frontmatter sichtbar, analog `brain_days_included:` und `inbox_notes_included:`.
- **`ProjectStatusResult.emailNotesUsed`** wird zurückgeliefert — UI/Telemetrie kann nachvollziehen, wie viele Email-Notizen pro Status-Lauf berücksichtigt wurden.
- **Fehlertext erweitert**: „Keine Quellen gefunden" nennt jetzt auch Email-Notizen, damit Nutzer beim Debugging die richtige Quelle prüfen.

## [0.6.50-beta] - 2026-05-21

### Features

- **IMAP-Ordner werden im Email-Modul angezeigt — nicht mehr nur INBOX**: Neuer Folder-Picker oberhalb der Filter-Leiste im Inbox-Panel zeigt pro Account die komplette Mailbox-Struktur vom Server (INBOX, Sent/Gesendet, Drafts, Junk, Trash, Archive, eigene Unterordner). Sortierung: INBOX immer oben, dann nach RFC-6154-SPECIAL-USE-Flag (Drafts → Sent → Junk → Trash → Archive), dann alphabetisch. Hierarchische Pfade (z.B. `INBOX.Archive.2025`) werden eingerückt dargestellt. Folder-Wechsel triggert sofort einen Fetch des neuen Ordners.
- **Neuer IPC-Handler `email-list-folders`**: Listet IMAP-Mailboxen via `ImapFlow.list()` inkl. SPECIAL-USE-Flags, Subscription-Status und `\Noselect`-Erkennung. Folder-Liste wird beim Panel-Mount pro Account einmal geladen und cached transient im emailStore (kein Sync, kein Persist).
- **Mails per IMAP zwischen Ordnern verschieben**: Neuer „Verschieben"-Button in der Mail-Detail-Ansicht öffnet ein Dropdown mit allen Ordnern des Accounts (außer dem aktuellen). Klick verschiebt die Mail per `imapflow.messageMove()` server-seitig. Fallback auf COPY+EXPUNGE bei IMAP-Servern ohne MOVE-Extension. Bei Erfolg wandert die Mail in den Ziel-Ordner und die View springt zurück zur Liste, wenn der Zielordner nicht der gerade aktive ist.

### Improvements

- **`email-fetch` ist folder-aware**: Der Handler akzeptiert jetzt pro Account ein optionales `folder`-Feld (Default `'INBOX'`). `getMailboxLock(fetchFolder)` ersetzt das hardcoded `'INBOX'`. `lastFetchedAt`-Keys laufen pro `${accountId}::${folder}` für Nicht-INBOX, INBOX-Datum bleibt backward-compatible unter `accountId`.
- **`EmailMessage.folder`-Feld + Filter im Store**: Jede Mail wird mit ihrem Quell-Ordner getaggt. `getFilteredEmails()` zeigt nur Mails aus dem aktiven Folder pro Account. Legacy-Mails ohne Folder-Feld werden als `INBOX` behandelt — keine Datenmigration nötig.
- **Gesendete Mails landen im richtigen Sent-Folder**: Beim Senden wird das `folder`-Feld auf den `sentMailbox`-Pfad aus dem IMAP-Append gesetzt (z.B. `INBOX.Sent`). Damit erscheinen gesendete Mails nur im Sent-Folder-View und leaken nicht mehr durch andere Ordner.
- **`EmailSettings.activeFolders`** wird in `uiStore.email` persistiert — die Folder-Auswahl überlebt App-Restart.

### Fixes

- **Sent-Mails leakten durch alle Folder-Views**: Vor dem Fix waren gesendete Mails (`sent: true`) im Folder-Filter pauschal durchgelassen — sie erschienen damit auch im Kontaktformular-, Archive- oder eigenen Unterordnern. Jetzt werden sie korrekt nach `folder`-Feld gefiltert; Legacy-Sent-Mails ohne Folder-Feld erscheinen nur noch in der INBOX-Ansicht.

## [0.6.49-beta] - 2026-05-21

### Features

- **Email-Detail-Ansicht umgestellt — Original primär, Zusammenfassung optional**: Der Original-Mailtext wird jetzt direkt im Analyse-Block zwischen „Modell" und Kategorien angezeigt (vorher hinter Toggle versteckt). Die KI-Zusammenfassung ist umgekehrt unter einem schmalen „Zusammenfassung anzeigen"-Toggle. Begründung: in der Praxis liest man primär die Original-Mail, die Zusammenfassung dient nur dem Triage. Termin- und Aktivitäts-Extraktion bleibt unverändert sichtbar.
- **Weiterleiten-Button in der Mail-Detail-Ansicht**: Neuer „Weiterleiten"-Button zwischen „Antworten" und „Mit KI diskutieren". Öffnet das Compose-Modal mit klassischem Forward-Header (Von / Datum / Betreff / An / optional Anhänge namentlich), `Fwd:`-Präfix im Subject, leerem Empfänger-Feld, ohne `inReplyTo`/`references` (Forward ist kein Thread-Reply). Original-Anhänge werden im Forward-Header textuell erwähnt, aber nicht binär mit-angehängt (Minimal-Variante).
- **Projekt-Zuordnung für Emails (Keyword + LLM-Synonyme)**: Neue Zeile „Projekt" im Email-Analyse-Block zeigt das thematisch passende Projekt als Chip — basierend auf den `keywords:` in der `_STATUS.md` plus automatisch generierten Synonymen. Klick öffnet die `_STATUS.md` des Projekts im neuen Tab. Live-Berechnung im Renderer (keine Persistenz), reagiert sofort auf Keyword-Änderungen. Bei 0 Treffern bleibt die Zeile aus.
- **Projekt-Synonym-Generator (Ollama, lokal)**: Pro Projekt wird ein Cache `.project-synonyms.json` erzeugt — der LLM extrahiert 8–12 thematisch verwandte Begriffe aus `_STATUS.md` + den 10 neuesten Projektdateien. Dadurch matcht „Fachforum" auch dann, wenn deine Keywords nur „Fachtag" enthalten. Triggerbar manuell pro Projekt im ProjectStatus-Widget (Button „🏷 N") oder automatisch beim wöchentlichen Crystallize-Lauf, wenn der Cache fehlt oder älter als 7 Tage ist. Cache ist Pro-Device (vom Sync ausgeschlossen).
- **Override-Dropdown für falsche Auto-Zuordnungen**: „+ andere"-Button neben dem Projekt-Chip öffnet ein Dropdown mit alternativen Treffern, allen Projekten und „— Keinem Projekt zuordnen". Manuell gewählte Projekte werden persistent in `emails.json` (`userProject`-Feld) gespeichert und visuell durch gestrichelten Chip-Rand markiert.

### Improvements

- **Stopword-Filter für Projekt-Match**: Generische Wörter (Information, Informationen, Raum, Frau, Mann, Herr, Hallo, Email, Tag, Woche, Termin, Datei, Dokument, OK, etc.) werden beim Matching ignoriert — egal ob sie in den `_STATUS.md`-Keywords oder den LLM-Synonymen stehen. Verhindert Falsch-Treffer durch zu generische Keywords, ohne dass die `_STATUS.md` bereinigt werden muss.
- **Match-Diagnose im Chip-Tooltip**: Hover über den Projekt-Chip zeigt jetzt die konkreten Begriffe, die zum Treffer geführt haben (z.B. „Gematcht über: Mittelhessen, Fachforum"). Bei manuellem Override: „manuell zugewiesen". Hilft, problematische Keywords schnell zu identifizieren.
- **IMAP-Sent-Append-Robustheit**: Forward-Mails verwenden denselben SMTP-/IMAP-Pfad wie Reply, inkl. konsistenter `Message-ID` für die Kopie im Gesendet-Ordner.
- **Dropdown-Positionierung**: Projekt-Override-Dropdown ist rechtsbündig verankert (`right: 0`) statt linksbündig — verhindert Clipping am rechten Inbox-Panel-Rand. Lange Projektnamen wrappen sauber.

### Fixes

- **Email-Body-Schutz vor Wikilink-Korruption bleibt**: Auto-Heal für Backslash-Escape-Folgen (`\[`, `\]`) läuft unverändert in jedem `.md`-Write-Pfad — keine Regression durch den neuen `setEmailProject`-Pfad.
- **Sync schließt `.project-synonyms.json` aus**: Pro-Device-LLM-Cache bleibt lokal, kein Sync-Konflikt zwischen Geräten.

## [0.6.48-beta] - 2026-05-18

### Improvements

- **Coach-Bot KB-Retriever — implizite Keywords**: Der Retriever zieht jetzt automatisch die Modul-`id` aus dem Frontmatter und den Dateinamen-Stamm als hochgewichtete Keywords rein. Damit findet er einen Modul-Eintrag auch dann, wenn der KB-Autor vergessen hat, das Modul-Wort manuell in `keywords:` zu listen. Robustheit gegen genau die Klasse von Fehlern, bei denen die Frage „Smart Connections was ist das?" keinen Top-K-Treffer mehr lieferte, obwohl die Datei `modules/smart-connections.md` existierte.
- **KB: Smart Connections** — Keywords um `smart`, `connections`, `smart-connections`, `smartconnections`, `verknüpfung`, `vernetzung` ergänzt.
- **KB: Edoobox-Modul (Veranstaltungsagent)** — Eintrag deutlich ausgebaut: Alias-Hinweis „auch bekannt als Veranstaltungsagent" prominent oben, Workflow in 6 nummerierten Schritten (DOCX-Import → Prüfen → edoobox-API-Push → WordPress-Marketing-Draft mit Ollama-/Imagen-Generierung → Dashboard-Tracking → IQ-Auswertung), Keywords um `veranstaltungsagent`, `agent`, `agenten`, `fortbildungen`, `formular`, `docx`, `schulamt` erweitert.

## [0.6.47-beta] - 2026-05-17

### Features

- **MindGraph Coach (adaptives Onboarding)**: Komplett neuer Chat-Coach, der vor dem klassischen Persona-Wizard mit einer offenen Frage startet („Was willst du mit MindGraph machen?"), 2–4 Rückfragen stellt und dann *einzeln bestätigte* Aktionen vorschlägt — Vault wählen, Editor-Mode setzen, Module aktivieren, Widgets konfigurieren, Profil empfehlen, Beispielordner/-notizen anlegen. KB-RAG über versionierte Markdown-Wissensbasis in `app/resources/coach-kb/` (14 Module, 7 Workflows, App-Themen). Pflicht-Mini-Brief direkt nach Vault-Wahl zu Markdown und den drei Editor-Modi (Markdown / Schreiben / Lesen) mit `set-editor-mode`-Vorschlag. Privacy-first auto-Backend Ollama → Anthropic via bestehendem `chatClient`. Eigenes IPC-Layer (`coach:precheck`, `coach:start`, `coach:respond`), Renderer-Store `coachStore.ts`, UI in `Onboarding/Coach/`.
- **CoachBot im Header — dauerhafter Q&A-Helfer**: Kleines Roboter-Icon oben in der Action-Leiste (akzentuiert + sanfter Erstnutzer-Pulse). Klick öffnet Popover mit Chat — beantwortet jede Frage zu MindGraph aus derselben KB wie der Onboarding-Coach. Backend-Toggle **Lokal (Ollama) ↔ Cloud (Claude)** im Header, persistiert in `coachBotBackend`. Default ist **Lokal** — Cloud nur per bewusster User-Wahl (privacy-first). Markdown-Rendering via `markdown-it` + `sanitizeHtml` (Listen, Bold, Code-Blöcke). Differenzierte Antwortlängen: kurz für Faktenfragen, 8–15 Sätze für „Was ist X / Wie funktioniert X", Kurs-Format für „Tutorial / Schritt für Schritt". Anti-Halluzinations-Regel im System-Prompt verhindert generisches Editor-Wissen aus anderen Apps (Split-View, Vorschau-Panel etc.).
- **Antares-Widget: offene Registrierungen mit Namen**: Aufklappbarer Block unter den Status-Buttons mit Tabelle (Name, Entleiher-Nr, Schule, Klasse). Standardmäßig offen, da neue Registrierungen typischerweise eine Aktion erfordern. Antares-API reverse-engineered via Browser-Inspection: zweischrittiges Pattern (`/result?id=2` mit `autosearch=true` als Body → `/search?table=entleiher&id=2` mit `page=1&rows=50` Pagination). Davor lieferte der Aufruf entweder alle 12 684 Entleiher oder SQL ERROR.
- **Antares-Widget: ablaufende Lizenzen (365 Tage)**: Neuer aufklappbarer Details-Block listet alle Lizenzen, die in den nächsten 365 Tagen auslaufen — Titel, Quelle, Lizenz-Nr, Ablaufdatum. Neuer Service-Endpoint `listLizenzenAblauf(daysAhead)` mit Filter-Body `endfrom=heute&endto=heute+N&searchtype=e`, IPC `antares-list-lizenzen-ablauf`, Typ `AntaresLizenz` in `shared/types.ts`. Lädt parallel im Store-`loadAll()`.
- **HelpGuide: drei neue Topics** — Sprache (Voice/TTS/STT), Projekt-Status (Crystallizer-Wochen-Entwurf), Antares (Medienzentrum-Verleih) mit jeweils direkten Sprung-Buttons in die passenden Settings-Tabs. Plus neue Icons (`crystal`, `voice`).

### Improvements

- **Zugangsdaten-Tab vervollständigt**: Antares-Credentials waren bisher nicht aufgeführt, obwohl sie über safeStorage verschlüsselt sind — jetzt sichtbar mit Status (Username + Passwort gesetzt/leer). Anthropic-Key-Note präzisiert: war fälschlich „nur für /ask und /briefing im Telegram-Bot", ist jetzt korrekt „Cloud-LLM (Claude) für Notes-Chat, Coach-Bot, Smart-Connections-Reranker, Email-Analyse, Telegram-Bot" — der Key wird seit längerem von vielen Modulen mitgenutzt, lebt UI-mäßig aber historisch immer noch im Telegram-Tab.
- **Onboarding-Wizard erweitert**: Neuer Step `coach` zwischen `welcome` und `intent`. WelcomeScreen bekommt drei Buttons (Coach starten / Klassisches Setup / Vault öffnen) mit Pre-Check, der den Coach-Button bei fehlendem Backend deaktiviert. IntentStep zeigt einen Coach-Vorschlags-Hinweis und überspringt die Vault-Subpage, wenn der Coach bereits einen Vault gewählt hat.

### Fixes

- **Antares `listOffeneRegistrierungen`**: Lieferte vorher entweder leer oder den kompletten Datenbestand (12 684 Entleiher). Ursache: falsche Aufteilung von `autosearch=true` zwischen `primeSearchMask` (kein Body) und `/search` (mit `autosearch=true` statt Pagination). Behoben durch Reverse-Engineering der echten Antares-Browser-Requests: `primeSearchMask` sendet jetzt `autosearch=true` plus optionale Filter im Body, `/search` nur noch `page` + `rows`.
- **`primeSearchMask` allgemein robuster**: Erlaubt jetzt zusätzliche Body-Parameter (`endfrom`, `endto`, `searchtype` u.a.), damit Filter wie „Lizenzen in 365 Tagen" überhaupt möglich werden.

## [0.6.46-beta] - 2026-05-17

### Features

- **Projekt-Status-Crystallizer**: Neues Dashboard-Widget, das pro markiertem Projekt einen wöchentlichen Status-Entwurf erzeugt — aus deinen Tagesnotizen (Brain), Inbox-Mails und Projekt-Dateien. Komplett lokal via Ollama (`localhost:11434`, hardcoded — keine Cloud-Fallbacks). Markierung pro Projekt durch eine `_STATUS.md`-Datei im Projektordner mit Frontmatter (`keywords`, `priority`). Ergebnis landet als `_STATUS-<ISO-Woche>.md` im Projektordner — nie überschreibend, Drafts der gleichen Woche werden zu `(2)`, `(3)` etc. Engine in `main/projectStatus/` (crystallizer/discovery/wikilinkLint/cleanup), UI in `renderer/components/ProjectStatusPanel/`, Zustand-Store `projectStatusStore.ts`. Sechstes Modul in der Modell-Kompatibilitäts-Matrix (`shared/modelCompatibility.ts`) mit empirischen Verdicts für gemma4:latest (grün), qwen3.6:latest (grün, langsam, 48 GB RAM), ministral-3:8b (gelb — Floskel-Tendenz). Volle Doku in `docs/feature-crystallizer.md`, priorisiertes Backlog in `docs/feature-crystallizer-todo.md`.
- **Einstellungen → Projekt-Ordner (Crystallizer)**: Eigener Folder-Picker in Einstellungen → Allgemein → Vault, analog zum Notizen-Ordner. Standard ist leer — bei nicht gesetztem Pfad zeigt das Widget eine erklärende Empty-State-Sektion mit Verweis auf die Einstellungen und deaktiviert „+ Projekt markieren". Damit funktioniert das Modul für jedes Vault, nicht nur PARA-Strukturen.
- **„🛠 Prüfen & aufräumen"-Review-Modal**: Pro Lint-Finding (⚠ Halluzination, 💡 Linkvervollständigung, 📝 Markdown-Syntax-Verdacht) ein 🗑-Knopf, der die betroffene Zeile aus der erzeugten Status-Notiz entfernt — inkl. frischem Lint-Pass nach dem Entfernen. Findings sind nach Klasse gruppiert mit kurzer Erklärung pro Gruppe. Backend in `main/projectStatus/cleanup.ts` mit `cleanupFindings()`.
- **„🗂 Wochen-Entwürfe aufräumen"-Modal**: Bei ≥2 Drafts pro Woche wird das Badge „N Entwürfe diese Woche" klickbar. Modal listet alle Drafts mit Datum/Zeit, markiert den neuesten, bietet einzeln 🗑 + Bulk-Aktion „Alle bis auf den neuesten löschen". Engine erlaubt nur Dateinamen, die exakt dem `_STATUS-YYYY-WWW(*).md`-Pattern entsprechen — kein Path-Traversal möglich.
- **Excel-Tabellen als Crystallizer-Quelle**: `.xlsx`-Dateien im Projektordner werden via `parseExcel()` (`office/officeService.ts`) gelesen und pro Sheet als Markdown-Tabelle in den Prompt gegeben. Lock-Files (`~$…`) und versteckte Dateien werden übersprungen. Wichtig u.a. für Rebranding-Checklisten, in denen der User dokumentiert hat, was schon erledigt ist.

### Improvements

- **Sentence-Level Vorfilter** für Brain-Tage und Inbox-Notes: Multi-thematische Quellen (Wochen-Infomailings, die mehrere Projekte mischen) werden vor dem LLM-Aufruf auf Satz-Ebene gefiltert — nur Sätze mit Keyword-Treffer plus optional ein Nachbar-Satz gehen ins Prompt. Off-Topic-Inhalt erreicht das LLM gar nicht erst. Verlässt sich nicht mehr auf Prompt-Anweisungen wie „bitte ignoriere das andere".
- **Quellen→Sektion-Trennung im Prompt**: „In einem Satz" und „Status" speisen sich aus Projekt-Dateien (was IST das Projekt); „Diese Woche" ausschließlich aus Brain-Tagen (mit Fallback „Diese Woche keine konkrete Bewegung am Projekt sichtbar" wenn nichts da ist); Stakeholder/Wichtige Daten/Risiken primär aus Projekt-Dateien. Faustregel im Prompt: *„Wenn nur Brain dir sagt, worum es im Projekt geht, ist das ein Bug."*
- **NFC-Unicode-Normalisierung im Wikilink-Lint-Vault-Index**: macOS speichert Filenames als NFD (`a` + Combining Diaeresis), LLM-Output ist NFC (precomposed `ä`). Ohne Normalisierung versagten Byte-Vergleiche bei Umlauten. Python3 `unicodedata.normalize('NFC', …)` läuft beim Index-Aufbau über alle Vault-Basenames — `iconv -f UTF-8-MAC` ist trotz Name kein NFC-Normalisierer (Lessons-Learned vom Bash-Prototyp übernommen).
- **Wikilink-Lint mit Suffix- und Prefix-Match**: Ein `[[AIS.chat Umstellung Zeitplan]]` wird als 💡-Vorschlag (statt ⚠ Halluzination) markiert, wenn `202605121001 - 🔴 AIS.chat Umstellung Zeitplan.md` existiert (Suffix-Match nach Space). Bei ZK-ID-Targets (`[[202604301437]]`) wird Prefix-Match versucht. Plus Emoji-Strip am Anfang des Targets, damit `[[⏳ Zeitplan & Zuständigkeiten]]` auf `Zeitplan & Zuständigkeiten.md` matcht.
- **Markdown-Syntax-Verdacht (📝)**: Lint erkennt orphan `[Text]` Single-Bracket-Patterns, die auf eine Vault-Datei zeigen würden, und schlägt die Wikilink-Form vor. Footnotes (`[^1]`), Checkboxen (`[x]`) und echte Markdown-Links (`[Text](url)`) werden korrekt ignoriert.
- **Auto-Migration für project-status-Widget**: Bestehende Vaults bekommen das Widget bei der nächsten App-Versions-Migration automatisch in die Dashboard-Widget-Liste eingefügt, analog zur Antares-Widget-Migration in v0.6.45.
- **CLAUDE.md aktualisiert** (Stand 0.6.46-beta): Stores 15 → 16 inkl. `antaresStore`, `ResearchPanel` → `SemanticScholarPanel`, neue Service-Dateien (`antaresService`, `attendanceListService`, `iqReportService`, `ankiImport`) ergänzt, Smart-Connections-Sektion mit bge-m3-Default und LLM-as-Judge-Reranker, neue Antares-CS-Integrations-Sektion, Phantom-Notiz-Filter in der Brain-Sektion.

### Fixes

- **Gemma-„nested"-Wikilink-Reparatur** (`[[Teilversion[[Vollversion]]]`): Wenn das Modell sich beim Wikilink-Schreiben umentscheidet, hängt es manchmal beide Varianten aneinander. Cleanup-Sed-Pass in `crystallizer.ts` extrahiert die innere (gewählte) Variante. Tritt auch bei `think:false` auf — ist kein Streaming-Artefakt, sondern Modell-Eigenheit.
- **Brain-Tag-Wikilink-Format-Halluzination**: Gemma-Modelle produzierten manchmal `[[Brain-Tag 2026-05-13]]` statt `[[2026-05-13]]`, weil der Prompt-Hinweis „Brain-Tag" als Label interpretiert wurde. Behoben durch (a) Brain-Section-Heading direkt als `### [[2026-05-13]]` zu formatieren, damit das Modell die Form mimt, (b) explizites Anti-Beispiel im Prompt, (c) Sentence-Level-Vorfilter, der die meisten halluzinierten Brain-Tags strukturell verhindert.
- **Ollama-Streaming-Artefakte beim Wikilink-Schreiben**: Die ursprüngliche CLI-Pipeline (`ollama run`) ließ ANSI-Cursor-Codes durch, die zwischen Token-Updates zerhackte Wörter hinterließen. Umgestellt auf HTTP-API (`http://localhost:11434/api/generate`) mit `stream: false` und `think: false`. Saubere Antwort in einem Rutsch, ~30 % schnellere Latenz.
- **Brain-Filter berücksichtigt YAML-Frontmatter nicht mehr**: Der Brain-Sensor durchsuchte ursprünglich auch den Frontmatter-Bereich der Tagesdatei. Das matchte z.B. das Keyword „Ollama" im `generated_by: "ollama:gemma4:latest"` von *jedem* Brain-Tag und brachte deshalb für jedes Projekt mit Modell-bezogenen Keywords alle Brain-Tage ins Prompt. Frontmatter wird jetzt vor dem Keyword-Check abgestrippt — sowohl im Crystallizer als auch im Brain-Signal-Alter der Projekt-Übersicht.

### Docs

- **`docs/feature-crystallizer.md`**: Mehrwert-orientierte Feature-Beschreibung für Nicht-KI-Experten — drei Personas (Mittelstand-Geschäftsführerin, Schulleiter, freie Beraterin), konkrete Szenarien, ehrliche Limitations-Liste, Privacy als strukturelles Argument, technische Eckdaten für die Pitch.
- **`docs/feature-crystallizer-todo.md`**: Priorisiertes Backlog (A vor Pitch, B nach Pitch, C nice-to-have) mit Aufwand-Schätzungen und Demo-Impact-Bewertung. Bereits behobene Punkte abgehakt, offene Punkte mit klarer „Was-warum-wie"-Struktur.

## [0.6.45-beta] - 2026-05-16

### Features

- **Antares CS Integration für Medienzentren**: Neues Modul „Antares Medienzentrum" liest Entleiher- und Verleih-Daten aus Antares CS 2.0.4 (h+h Software) — dem Verleihsystem vieler deutscher Medienzentren. Verbindet sich über den eigenen Admin-/Mitarbeiter-Account (Cookie+PID-Session wie im Browser), keine offizielle API nötig. Credentials in `electron.safeStorage` verschlüsselt. Dashboard-Widget in voller Breite zeigt das vertraute 3-Spalten-Layout aus dem Antares-Original (Nutzerverwaltung / Technikverleih / Medienverleih) mit Status-Kacheln für offene Registrierungen, offene Anfragen/Vorbestellungen und überfällige Rückgaben — plus aufklappbare Mahnungs-Tabelle mit Leihnr/Titel/Entleiher/Schule/Rückgabedatum. Konfiguration unter Einstellungen → Module → „Antares Medienzentrum" aktivieren, dann Einstellungen → Agenten → Antares-Sektion: URL/Kontext/Credentials + Verbindungstest. Auto-Migrate ergänzt das Widget bei bestehenden Installationen. Doku in `docs/antares-integration.md`.
- **Smart Connections: LLM-as-Judge-Reranker (opt-in, experimentell)**: Wenn aktiviert, bewertet das aktuell ausgewählte Ollama-Chat-Modell nach der Embedding-Suche die Top-Kandidaten paarweise auf Relevanz und sortiert die Liste um. Hintergrund: Ollama unterstützt aktuell keine nativen Cross-Encoder-Reranker — dedizierte Reranker-GGUFs crashen den Loader oder geben Müll-Tokens aus. Workaround: Standard-Chat-Modell mit strukturiertem JSON-Output (Fallback-Parser für Modelle, die trotz Anweisung Fließtext liefern). Funktioniert mit jedem Modell, das du bereits geladen hast (gemma4, qwen3.6, …) — kein zusätzlicher Download. Trade-off: nicht task-spezifisch trainiert, ~1–3 s pro Kandidat, Scores eher grob in Bändern. Toggle unter Einstellungen → Integrationen → Smart Connections.

### Improvements

- **bge-m3 als bevorzugtes Embedding-Modell**: Smart Connections bevorzugt jetzt `bge-m3` (multilingual) vor `nomic-embed-text`, sofern installiert. bge-m3 liefert deutlich bessere Score-Spreizung für deutsche Vaults — Notizen über verwandte Themen bekommen klarere Similarity-Werte, statt im 0.7–0.85-Brei zu verschwinden. Falls weder bge-m3 noch nomic installiert sind, wird das erste verfügbare Embedding-Modell genutzt.
- **Email-Metadaten-Block aus Embeddings filtern**: Der Bold-Markdown-Block aus dem Email-Template (`**Von:** …`, `**An:** …`, `**Datum:** …`, `**Relevanz:** …`, `**Stimmung:** …`, `**Kategorien:** …`, `**Betreff:** …`) wird vor dem Embedding rausgekürzt. Vorher zog dieser gemeinsame Header alle Mail-Notizen in einen großen „Metadaten-Cluster", in dem inhaltlich unverwandte Mails fälschlich als ähnlich angezeigt wurden. Verbunden mit `CACHE_VERSION=2`: alte Embeddings werden beim ersten Öffnen einmal neu berechnet.

### Fixes

- **Brain-Tagesgedächtnis: keine Phantom-Notizen mehr**: Der Brain-Sensor sammelte Events (Öffnen/Updaten/Erstellen) anhand des `contextMemory`-Logs, in dem auch Pfade von Notizen stehen, die später gelöscht oder verschoben wurden. Vorher legte der Sensor für solche Events einen synthetischen Eintrag mit aus dem Pfad abgeleitetem Titel an — Brain bekam dann „berührte Notizen" gemeldet, die im aktuellen Vault gar nicht mehr existierten. Fix: nur Events zu Notizen, die das `notesStore` aktuell kennt, werden weitergereicht.

## [0.6.44-beta] - 2026-05-15

### Features

- **Drag & Drop aus dem Finder in den FileTree**: Beliebige Dateien können jetzt aus dem macOS/Linux/Windows-Datei-Manager direkt auf einen Ordner im FileTree gezogen werden — sie werden als Kopie ins Vault übernommen. Multi-File-Drops werden unterstützt; Name-Konflikte werden automatisch mit `-1`, `-2`, ... aufgelöst. Sicherheit: `assertApprovedVault` + `validatePath` + `realpath` für die Source, damit keine Symlink-Tricks ins Vault wandern. Externe Drops zeigen den `copy`-Cursor, interne Drag-Aktionen (Notiz von Ordner A nach Ordner B) bleiben weiterhin `move`.
- **Bild-Drop im Lesen-Modus**: Bilder können jetzt auch im Lesen-Modus (WYSIWYG-Preview) per Drag & Drop direkt in die Notiz gezogen werden — bisher ging das nur im Schreiben-Modus. Sofortige Darstellung via inline Data-URL, gleichzeitiger Commit an die Markdown-Source mit korrektem Wikilink (`![[…]]`). Leerzeichen vor und nach dem Bild werden automatisch ergänzt, damit der Image-Wikilink valide bleibt — markdown-it ist strikt: `Text![[file]]` ohne Whitespace wird nicht als Bild erkannt.
- **Konfigurierbarer Bilder-Ordner**: Einstellungen → Editor → „Bilder-Ordner". Standard ist `.attachments` (versteckt, sync-eingeschlossen); kann auf jeden vault-relativen Pfad geändert werden, z.B. `Bilder` oder `300 - 📦 Ressourcen/380 - 🏞 Bilder`. Bei nicht-Standard-Pfaden enthält der Image-Wikilink den vollen relativen Pfad — sonst kann der Lesen-Modus-Image-Loader das frisch kopierte Bild nicht finden, weil das fileTree noch nicht neu eingelesen ist.

### Fixes

- **macOS Quick Look kapert keine Datei-Drops mehr**: Beim Drag & Drop einer Datei auf das App-Fenster öffnete macOS bisher die Datei mit dem Standard-Viewer (Vorschau / Quick Look), wenn der Drop nicht von einem spezifischen Component-Handler abgefangen wurde — selbst wenn der dragover preventDefault gemacht hatte. Fix: globaler Window-Level Drag-Default-Killer in `App.tsx`, der bei jedem Drop mit `Files`-MIME-Type `preventDefault` aufruft. Spezifische Handler (FileTree, Editor, Preview-Drop) laufen in capture-Phase davor und übernehmen die eigentliche Logik unverändert.
- **Bild im Lesen-Modus klebte am Text**: Der eingefügte `<img>` wurde direkt an den vorigen Text gehängt → im Markdown stand `Text!![[file]]` mit doppeltem `!` (`![` als Image-Marker + vorheriges Zeichen ohne Whitespace). markdown-it parst das nicht als Image, daher zeigte der Lesen-Modus nur ein kaputtes Image-Icon mit Dateinamen statt des Bildes. Fix: vor und nach dem `<img>` automatisch Whitespace ergänzen, falls die Umgebung kein Whitespace ist. Plus sofortige Bildanzeige via inline Data-URL und Prefill des `loadedImagesRef`-Caches.

## [0.6.43-beta] - 2026-05-15

### Fixes

- **Smart Connections crasht nicht mehr an Markdown-Bold in Headings**: Wenn eine Notiz im Vault eine Überschrift wie `## **Frühstück**` enthielt, brach die Ähnlichkeits-Berechnung mit `SyntaxError: Invalid regular expression: /\b**frühstück**\b/i: Nothing to repeat` ab — das Smart-Connections-Panel zeigte stumpf „Fehler bei der Berechnung", obwohl Ollama, das Embedding-Modell und der Cache alle in Ordnung waren. Ursache: der Heading-Tokenizer in `extractKeywords()` (`SmartConnectionsPanel.tsx`) hatte `*` nicht in seiner Zeichenklasse, dadurch landete `**frühstück**` als ein einzelnes Token im Keyword-Array. Beim anschließenden `new RegExp('\\b' + kw + '\\b')` in `calculateKeywordMatch()` wurden die `**` als Quantor interpretiert → Exception, gesamter Berechnungs-Lauf verworfen. Fix in zwei Schichten: (a) Splitter um `*` erweitert, damit Markdown-Formatierung gleich beim Tokenisieren wegfällt; (b) neuer `escapeRegExp()`-Helper neutralisiert Sonderzeichen vor der RegExp-Konstruktion — damit kann auch ein zukünftiger Tokenizer-Bug oder ein Keyword mit Sonderzeichen (`.`, `?`, `(`, `[` etc.) das Panel nicht mehr aushebeln.

## [0.6.42-beta] - 2026-05-15

### Fixes

- **Stillschweigendes Auseinanderlaufen von Modell-Einstellungen behoben**: In v0.6.41 wurde die neue Kompatibilitäts-Sektion (Einstellungen → Integrationen) eingeführt, parallel existiert aber weiter das ältere „Analyse-Modell"-Feld pro Modul (z.B. im Email-Tab). Die Architektur ist Absicht — Tab-Felder haben die höchste Priorität in der Chain (`email.analysisModel` → `moduleModelOverrides[task-extraction]` → globales `selectedModel`) und sind für Power-User gedacht, die pro Modul granular einstellen wollen. Problem: das Tab-Feld war **stumm**, die Kompatibilitäts-Sektion zeigte fröhlich „✅ Geeignet" auf einem ganz anderen Modell, und niemand konnte sehen, dass tatsächlich noch das alte qwen3.5 durchläuft. Konkreter Vorfall: eine eingehende Mail wurde am 15.05.2026 mit `qwen3.5:9b-mlx-bf16` analysiert, obwohl global und in der Kompatibilitäts-Sektion längst `gemma4:latest` eingestellt war — weil im Email-Tab noch der alte Wert stand und der Hard-Lock nicht griff (qwen3.5 ist für Task-Extraktion „yellow", nicht „red").

### Improvements

- **Kompatibilitäts-Sektion zeigt Tab-Overrides ehrlich an**: Pro Modul wird jetzt geprüft, ob ein Tab-Feld die Sektion überstimmt. Wenn ja, erscheint eine gelbe Warnung mit dem überschreibenden Modell-Namen und einem Verweis auf den zuständigen Tab — und der Verdict-Indikator + Hard-Lock-Check beziehen sich auf das **effektiv** verwendete Modell, nicht mehr nur auf den Sektion-Override. Damit kann die Sektion nicht mehr falsches Vertrauen erzeugen.
- **Verdict-Icons im Email-Tab**: Das „Analyse-Modell"-Dropdown (Einstellungen → E-Mail Integration) zeigt jetzt vor jedem Modell die gleichen ✅⚠️🔴❔-Icons wie die Kompatibilitäts-Sektion. Darunter erscheint eine kompakte Verdict-Pill mit Begründung („🟡 Mit Vorbehalt — Richtungs-Erkennung nur 63 %"). Damit sind die Folgen einer Modell-Wahl direkt am Auswahl-Punkt sichtbar.
- **Re-Analyse einzelner Mails**: Im Mail-Detail-View neben dem Modell-Label gibt es jetzt einen kleinen „🔄 Neu analysieren"-Button. Damit kann eine Mail, die mit einem ungeeigneten Modell ausgewertet wurde, mit dem aktuellen Modell-Setting neu beurteilt werden — vorher gab es keinen Weg, eine falsche Analyse zu reparieren, weil der Auto-Analyse-Filter (`!e.analysis && !e.noteCreated`) bereits analysierte Mails komplett übersprang. `emailStore.reanalyzeEmail(vaultPath, emailId)` als neue Action, IPC-Handler `email-analyze` überschreibt das `analysis`-Feld bei expliziter `emailIds`.

### Docs

- **Blogartikel „Lokale Modelle, ehrlich gerechnet"**: Neuer Artikel zur Modell-Kompatibilitäts-Matrix mit 160 Benchmark-Läufen, Methodik, Befunden und Konsequenzen für die App. In mehreren Iterationen redaktionell überarbeitet — einfachere Sprache, ehrlichere Beispiele (qwen3.6-Output als Interpretation statt Erfindung, persönliches Sport-Beispiel entfernt), präzisere Begriffe (Kontextfenster statt „Platz im Kopf"), Email-Modul als Kontext der Tests, KMU-Perspektive im Schluss. Header-Bild responsiv (`max-width: 100%`).

## [0.6.41-beta] - 2026-05-14

### Features

- **Modell-Kompatibilitäts-Matrix für lokale Modelle**: Neuer „Beipackzettel" in den Einstellungen (Integrationen → Ollama) zeigt pro Modul (Brain, Mail-Task-Extraktion, Mail-Zusammenfassung, Dashboard-Snapshot, Smart Connections) klar an, wie gut das aktuell aktive Modell für die jeweilige Funktion geeignet ist — vier Verdicts (✅ geeignet / ⚠️ eingeschränkt / 🔴 Modul gesperrt / ⚪ nicht getestet) plus Metriken (Format-Treue, Latenz, RAM-Bedarf, Wikilink-Halluzinationen, Recall, Richtungs-Erkennung). Datengrundlage sind 160 Benchmark-Läufe (5 Modelle × {Task-Extraktion v1+v2, Brain-Regression, Mail-Summary, Dashboard-Snapshot}) vom 14.05.2026 im externen Test-Harness `~/dev/brain-model-benchmark/`. Single-Source-of-Truth: `app/src/shared/modelCompatibility.ts` (`MODEL_COMPATIBILITY`, `getModelVerdict`, `greenModelsForModule`, `isHardLocked`, `RECOMMENDED_DEFAULTS`).
- **Pro-Modul Modell-Override**: Power-User können in den Einstellungen pro Modul ein anderes Modell als das globale „aktive Modell" wählen — sinnvoll, weil kein einzelnes 7–14B-Modell in allen vier getesteten Klassen Top-Performer ist (z.B. `ministral-3:8b` ist Brain-Champion, `gemma4:latest` schnellster Task-Extractor). Override-Felder im `uiStore.ts` (`ollama.moduleModelOverrides`), Migration für Bestands-Settings ergänzt fehlende Felder mit leeren Defaults. Prio-Reihenfolge im Code: Tab-spezifisches Setting (z.B. `email.analysisModel`) → Modul-Override → globales `selectedModel`.
- **Hard-Lock für schadensrelevante Module**: `damageRelevant: true` auf `task-extraction` und `dashboard-snapshot` — bei `verdict: 'red'` wird das Modul für dieses Modell **im Code** deaktiviert (`isHardLocked()` returnt true). Beispiel: `llama3.1:8b` ist beim Dashboard-Snapshot hard-locked, weil es im Bench auf einen Prompt-Injection-Versuch („Yarr! Aktualität ist nicht relevant…") reinfiel und 100/100 Score mit Pirate-Reason zurückgab — bei UNTRUSTED Notiz-Inhalt ein Sicherheitsrisiko. `emailStore.analyzeEmails()` prüft `isHardLocked(model, 'task-extraction')` und überspringt die Analyse mit Warning. `RadarWidget` prüft `isHardLocked(model, 'dashboard-snapshot')` und deaktiviert die KI-Analyse im Radar.
- **`ActiveModelStatusBadge`** unter dem Modell-Picker in den Einstellungen (Ollama + LM Studio): kompakter Status-Indikator, der auf einen Blick zeigt, ob das gewählte Modell für die wichtigsten Module geeignet ist.

### Improvements

- **Empirische Korrektur von Datenmismatches**: Zwei Werte in `modelCompatibility.ts` an die Roh-Benchmark-Daten angepasst — `brain.llama3.1:8b.criticalTitlesLinkedPct` 30 → 50 (Aggregat aus `brain-regression-2026-05-14.md`), `task-extraction.qwen3.6:latest.directionAccuracyPct` 95 → 100 (`task-extraction-v2-2026-05-14.md`, Befund 3: nur das 36B-Modell hat die Richtungs-Erkennung in c08 korrekt).
- **Dashboard-RadarWidget — Override-Prio konsistent**: `aiModel = radarAiModel || moduleOverride || ollamaSelectedModel`. Vorher gab es nur den Dashboard-spezifischen `radarAiModel` und das globale Modell; das neue Modul-Override-Feld liegt jetzt sauber dazwischen.
- **Brain-Aktivitäts-Widget — gleiche Override-Logik**: `brainModel = brainModelOverride || ollamaSelectedModel`. Der Button „Tag abschließen" und alle disabled-Checks beziehen sich jetzt auf `brainModel`, nicht mehr direkt auf `ollamaSelectedModel`.
- **64 neue Translation-Keys** (DE + EN) unter `settings.integrations.compatibility.*` — Titel, Beschreibung, Verdict-Labels, Metric-Labels, Modul-Bezeichnungen, Halluzinations-Stufen, Untested-Hinweis, Hard-Lock-Begründung.

### Docs

- **`CLAUDE.md` umfassend aktualisiert** (Stand 14.05.2026): 13 → 15 Zustand-Stores aufgezählt, `main/index.ts` ~6000 → ~9000 Zeilen, neue Sektionen zu Notiz-Kategorien (🔴🟢🔵), drei Editor-Modi mit Turndown-Escape-Constraint, Modell-Kompatibilitäts-Matrix, Brain-Modul (hardcoded localhost:11434), Relevanz-Radar, lokalem Kontextgedächtnis, Telegram-Agent (Tool-Use mit Confirm-Flow), automatische Backups, eingebautes Whisper STT, FS-IPC-Security-Model erweitert. Email-Sektion um IMAP-Sent-Append (v0.6.37) und Link-Konverter (v0.6.39) ergänzt; Sync-Sektion um Plaintext-Hash-Vergleich und Tombstone-Retention.

## [0.6.40-beta] - 2026-05-13

### Fixes

- **Task-Datums-Korruption im WYSIWYG-Preview gestoppt**: Beim Bearbeiten von Notizen im Preview-Modus hat der HTML→Markdown-Roundtrip (Turndown) systematisch Wikilink-Brackets in Task-Datumsmarkern escaped — aus `(@[[2026-05-08]])` wurde `(@\[\[2026-05-08\]\])`, beim nächsten Commit `(@\\\[\\\[2026-05-08\\\]\\\])`, dann `(@\\\\\\\[\\\\\\\[2026-05-08\\\\\\\]\\\\\\\])` — Backslash-Zahl wuchs exponentiell mit `2ⁿ−1`. Folge: das „Aufgaben & Termine"-Panel erkannte das Datum nicht mehr, Termine verschwanden in den „kein Datum"-Bucket, Tags wurden mehrfach dupliziert. Ursache: `wysiwygTurndown` benutzte das Default-Escape, das `[`, `]` und `\` mit Backslashes verfremdet — bei jedem Commit wurden bereits eingefügte Backslashes ein weiteres Mal escaped. Fix: Turndown-Escape selektiv konfiguriert — `[`, `]`, `\`, `_` bleiben jetzt unangetastet (Wikilinks und Identifier überleben), Block-Start-Marker (`#`, `>`, `-`, `+`, `1.`, ``` ``` ```, `==`, `~~~`) und Inline-Emphasis (`*`, `` ` ``) werden weiter escaped, damit Klartext nicht versehentlich zu Markdown-Syntax aufgewertet wird.
- **Auto-Heal für bereits korrupte Wikilinks**: Falls eine Notiz das eskalierte Muster noch enthält oder ein anderer Schreiber das Verhalten reproduziert, heilen die IPC-Handler `write-file`, `tasks-update-line` und `tasks-create` jeden `.md`-Write transparent zurück: `\[\[…\]\]`, `\\\[\\\[…\\\]\\\]`, `\\\\\\\[\\\\\\\[…\\\\\\\]\\\\\\\]` etc. werden vor dem Schreiben zu sauberem `[[…]]` zurückgebaut. Der vorherige Inhalt landet wie üblich unter `.mindgraph/backups/`. Kein Klick-Error im Editor mehr, kein erneutes Eskalieren.
- **REMINDER_REGEX im Task-Parser tolerant gemacht**: Der Datums-Regex in `taskExtractor.ts` erkennt jetzt auch `(@\[\[YYYY-MM-DD\]\])`, `(@\\\[\\\[…\\\]\\\])` usw. und akzeptiert beliebig viele Backslashes vor jedem Bracket. Damit zeigen vorhandene, leicht beschädigte Tasks im Panel sofort wieder das richtige Datum, und beim ersten Save über `buildTaskLine` schreibt sich die Zeile von alleine in die saubere Form zurück. Die globale Variante (`REMINDER_REGEX_GLOBAL`) strippt zusätzlich mehrfach-Vorkommen pro Zeile, falls mehrere Fragmente entstanden waren.

## [0.6.39-beta] - 2026-05-13

### Fixes

- **Links in E-Mail-Signatur und -Body funktionieren jetzt**: Bisher landeten URLs und E-Mail-Adressen in der Signatur sowie im Mail-Body als unklickbarer Plain Text beim Empfänger — der HTML-Konverter beim Versand unterstützte zwar Bold/Italic, aber keine Links. Der Konverter erkennt jetzt vier Link-Varianten und wandelt sie in echte `<a>`-Tags um: Markdown-Links `[Text](https://url)`, Markdown-Mailto-Links `[Text](mailto:...)`, nackte URLs (`https://…`) und nackte E-Mail-Adressen (`name@domain.tld`). Negative Lookbehinds verhindern Doppel-Linking innerhalb bereits gerenderter Tags und schützen E-Mails in URL-Query-Parametern. Der Hinweistext unter dem Signatur-Feld (Einstellungen → Agenten → E-Mail) erklärt die Syntax. Das Signatur-Feld selbst bleibt ein einfaches Textarea — die Konvertierung passiert beim Senden.

## [0.6.38-beta] - 2026-05-13

### Fixes

- **macOS Mikrofon-Zugriff fürs Diktieren**: Auf macOS schlug das Diktieren im Transport-Fenster und im Hauptfenster mit „permission denied" fehl — ohne dass je ein System-Permission-Dialog erschien. Ursache: Bei aktiviertem Hardened Runtime reicht der `NSMicrophoneUsageDescription`-Eintrag in der Info.plist alleine nicht aus, das passende Entitlement `com.apple.security.device.audio-input` muss zusätzlich in `entitlements.mac.plist` stehen. Fehlt es, blockiert macOS den Zugriff stumm. Mit dem Fix erscheint jetzt beim ersten Diktat-Versuch der erwartete macOS-Dialog „MindGraph Notes möchte auf das Mikrofon zugreifen". Via `entitlementsInherit` wird das Recht automatisch an alle Renderer- und Helper-Prozesse vererbt, also auch ans Schnellerfassungs-Fenster.

## [0.6.37-beta] - 2026-05-13

### Features

- **Diktat direkt in der Schnellerfassung (⌘D)**: Das Transport-Capture-Fenster hat jetzt einen eigenen Diktat-Button neben „Task einfügen". `⌘D` startet/stoppt die Whisper-Aufnahme, das Transkript wird an der Cursor-Position eingefügt — mit automatischer Whitespace-Heuristik vor/nach der Einfügung. Das Whisper-Modell wird beim ersten Diktat im Transport-Fenster on-demand vorbereitet (eigener Renderer-Prozess, eigener RAM-Cache). Status wird über Toasts angezeigt („Modell lädt", „Diktat läuft", „Transkribiere").
- **Gesendete Mails landen jetzt auch im IMAP-„Gesendet"-Ordner**: Bislang hat MindGraph Notes Mails nur über SMTP versendet — die Mail kam beim Empfänger an, war aber nicht im Webmail (z. B. all-inkl) oder auf anderen Geräten sichtbar. Apple Mail macht nach jedem Send automatisch einen IMAP-`APPEND` in den Sent-Folder; MindGraph jetzt auch. Nach erfolgreichem `sendMail` baut nodemailer die Mail per `streamTransport` als RFC-822-Buffer, imapflow verbindet sich zum IMAP-Account und lädt die Kopie hoch. Sent-Folder-Detection via `\Sent` SPECIAL-USE-Flag (RFC 6154) mit Fallbacks auf bekannte Namen (`INBOX.Sent`, `Gesendet`, `INBOX.Gesendet`, `Sent Items`, `Gesendete Objekte`, etc.). Konsistente `Message-ID` zwischen SMTP-Versand und IMAP-Kopie. Fehler beim Append kippen den Send-Erfolg nicht — stattdessen erscheint eine gelbe Warnung („Mail gesendet, aber Speichern im Gesendet-Ordner schlug fehl: …") unter dem grünen Status.

### Improvements

- **Mikrofon-Permissions explizit gemanaged**: Neue `setupMediaPermissions()`-Funktion im Main-Process whitelistet `file://` + `localhost:5173` für Audio-Zugriff, lehnt alles andere ab. Auf macOS wird `systemPreferences.askForMediaAccess('microphone')` aufgerufen, sodass der System-Dialog erscheint statt einer stummen Verweigerung.
- **Transport-Fenster bleibt bei Fokus-Verlust offen**: Der bisherige `on('blur', hide)`-Listener ist entfernt — nötig, damit der macOS-Mic-Permission-Dialog das Schnellerfassungs-Fenster nicht wegnimmt. Außerdem bequemer beim Diktieren mit längeren Pausen.
- **STT-Fehler propagieren an den Aufrufer**: `cb.onError?.()` wird jetzt in allen drei Fehlerpfaden (`Aufnahme zu kurz`, `Kein Ton erkannt`, `Keine Sprache erkannt`) aufgerufen, nicht nur im voiceStore gesetzt. Damit landen Fehler in den Toast-Notifications der Aufrufer (z. B. TransportCapture) statt unsichtbar zu bleiben. Bessere Mikrofon-Fehlermeldung verweist auf macOS Datenschutz & Ton-Eingabe.
- **Robusterer Clipboard-Zugriff**: Neuer `utils/clipboard.ts`-Helper nutzt bevorzugt Electron's native Clipboard-API (`electronAPI.clipboardReadText`/`WriteText`) und fällt nur auf `navigator.clipboard` zurück, wenn der IPC-Pfad fehlt. Wird konsistent in MarkdownEditor, AgentPanel, CodeViewer, Flashcards, NotesChat, OfficeViewer, Settings, Sidebar/FileTree verwendet.
- **Transport-UI: Settings im Schnellerfassungs-Fenster**: `initializeUISettings()` wird im Bootstrap des Transport-Renderers aufgerufen, sodass `speech.sttEngine`/`transformersModel` und andere globale UI-Settings im separaten Renderer-Prozess verfügbar sind.

### Fixes

- **STT-Übersetzungstexte präzisiert**: Hinweistexte für „Modell vorbereiten" stellen jetzt klar, dass das Vorladen pro Fenster wirkt — der Transport-Renderer ist ein eigener Process mit eigenem RAM-Cache, das Vorladen im Settings-Tab des Hauptfensters wirkt dort nicht automatisch.

## [0.6.36-beta] - 2026-05-11

### Features

- **Research-Panel mit OpenAlex als zweiter Quelle**: Das bisherige Semantic-Scholar-Panel heißt jetzt **Research** und kann zwischen Semantic Scholar und OpenAlex umschalten. OpenAlex liefert über 240 Mio. wissenschaftliche Werke inkl. Topics, Open-Access-PDFs und DOIs. Abstracts werden aus dem `abstract_inverted_index` rekonstruiert. Sucht parallel mit Race-Condition-Schutz (`latestSearchRef`) — alte Antworten überschreiben neuere Ergebnisse nicht mehr. Settings-Tab "Integrationen" hat einen neuen "Research"-Block mit OpenAlex-API-Key (verschlüsselt via `safeStorage`) und Mailto-Adresse (Plain-Text, für den "polite pool" mit höheren Rate-Limits ohne API-Key). Beide Werte können auch via `OPENALEX_API_KEY` / `OPENALEX_MAILTO`-Env überschrieben werden.
- **Echte CSL-Zitierstile in der Zotero-Suche**: Statt nur des hardcodierten MindGraph-Formats lässt sich jetzt jeder in Zotero installierte CSL-Style auswählen. Das Style-Dropdown lädt primär über Better-BibTeX JSON-RPC (`cayw.styles`) — funktioniert plattformunabhängig, egal wo Zotero seine Daten liegen hat. Fallback: paralleler FS-Scan über die Default-Pfade auf macOS/Windows/Linux plus optionalem `ZOTERO_DATA_DIR`-Override. Die Bibliographie wird dann von Better-BibTeX in echtem APA/MLA/Chicago/etc. zurückgegeben (`item.bibliography` JSON-RPC). Eingebaute Built-in-Stile bleiben verfügbar: MindGraph (Autor, Jahr, Titel), BibTeX (`@citekey`), Pandoc (`[@citekey]`). Die Auswahl wird in `localStorage` persistiert.
- **Zitate funktionieren jetzt auch im Lesen-Modus**: Zitate und Fußnoten aus Zotero/Research lassen sich an der Cursor-Position einfügen, während die Notiz im Preview-Modus offen ist (vorher nur im Source-Mode). Die DOM-Selection wird via `rememberPreviewSelection` über Toolbar-Klicks hinweg festgehalten, `execCommand('insertText')` mit Range-Fallback handhabt das eigentliche Einfügen, der Commit-Pipeline schreibt zurück durch CodeMirror.

### Improvements

- **Semantic-Scholar-Suche gehärtet**: Response-Cache (10 Min), In-Flight-Deduplication (parallele Re-Renders erzeugen nicht mehr mehrere API-Calls), Rate-Limiter respektiert jetzt den `Retry-After`-Header statt einer fixen 1100ms-Sperre. Optionaler API-Key via `SEMANTIC_SCHOLAR_API_KEY` / `S2_API_KEY`-Env hebt das Rate-Limit deutlich.
- **WYSIWYG-Editor: KaTeX-Math-Roundtrip**: Math-Ausdrücke (`$...$` / `$$...$$`) überleben jetzt den Lese-Modus-Roundtrip. Neue Turndown-Regel liest die LaTeX-Quelle aus dem KaTeX-`annotation`-Tag und erkennt Block- vs. Inline-Math über die `.katex-display`-Klasse.
- **Bilder im Live-Preview-Cache behalten data-src**: Bilder, die mit aufgelöstem `src="data:..."`-URL aus dem Cache geladen wurden, bleiben mit `data-src`-Attribut versehen, damit die WYSIWYG-Turndown-Konvertierung sie zurück zu Wikilinks (`![[bild.png]]`) macht. Zusätzlicher Fallback für Bilder ohne `data-src` über das `alt`-Attribut (Original-Filename).
- **`/openalex-check` hittet jetzt einen existierenden Endpoint**: Vorher wurde `/rate-limit` abgefragt — der existiert in der OpenAlex-API gar nicht und antwortete immer mit 404. Jetzt geht eine billige Probe-Query gegen `/works?per_page=1&select=id` raus und liest das Rate-Limit aus dem `x-ratelimit-remaining`-Header.
- **Zotero-Styles laden parallel statt seriell**: Statt jede CSL-Datei nacheinander zu lesen, wird der gesamte Style-Ordner via `Promise.allSettled` parallelisiert — spürbar bei Power-Usern mit 100+ installierten Styles.

## [0.6.35-beta] - 2026-05-11

### Fixes

- **Spracheingabe meldet nicht mehr fälschlich „Kein Audio erkannt"**: Chromium startet den `AudioContext` nach `getUserMedia` nicht zuverlässig — er bleibt im `suspended`-State, und die RMS-Pegelmessung liefert konstant 0, obwohl das Mikrofon Audio sendet. Der MediaRecorder lief unabhängig davon weiter und hätte verwertbares Audio gehabt, wurde aber wegen `peakLevel < 0.005` verworfen. Jetzt wird der AudioContext direkt nach dem Erzeugen via `resume()` aktiv geweckt, und ein `analyserUsable`-Flag merkt sich, ob der Context überhaupt im `running`-State Daten geliefert hat. Der „Kein Audio erkannt"-Reject greift nur noch, wenn die Pegelmessung tatsächlich funktioniert hat — ansonsten geht die Aufnahme an Whisper, statt verworfen zu werden. Zusätzlich loggt das STT-Modul jetzt `trackMuted`, `trackEnabled`, `readyState` und den `AudioContext`-State, um echte Mikrofon-Probleme besser diagnostizieren zu können.

## [0.6.34-beta] - 2026-05-11

### Fixes

- **Dashboard verschwindet nicht mehr nach dem Mount**: Seit 0.6.33-beta ruft der DashboardView beim ersten Öffnen einmalig `reloadVaultNotesForDashboard()` auf — das setzt die `notes`-Liste neu und triggert in `App.tsx` einen `useEffect`, der bei jedem `notes`-Update den `selectedNoteId`-Tab aktiviert. Konsequenz: wer das Dashboard öffnete, sah einen kurzen Moment das Dashboard und dann wieder die zuletzt geöffnete Notiz — wie ein Crash. Der Effect merkt sich jetzt via Ref die letzte `selectedNoteId` und überschreibt bewusst aktive Non-Editor-Tabs (Dashboard, Canvas, Code) nicht mehr, wenn der Re-Run nur durch ein `notes`-Update kam.

### Improvements

- **„Lesen" ist jetzt der Standard-Editor-Modus**: Default für `editorDefaultView` ist von `live-preview` auf `preview` geändert. Wer eine Notiz öffnet, landet im fertig formatierten Lesen-Modus statt im Schreiben-Modus — passt besser zu typischer Vault-Nutzung (90% Lesen, 10% Editieren). Die alte Migration, die jeden gespeicherten `preview`-Wert wieder auf `live-preview` zurücksetzte (außer beim Viewer-Profil), wurde entfernt — die Einstellung greift jetzt wirklich.

## [0.6.33-beta] - 2026-05-10

### Features

- **Quick-Event-Modal**: Neue Komponente (`Sidebar/QuickEventModal.tsx`), erreichbar u.a. über den Kalender-Button im Overdue-Panel. Einen Termin in einem Schritt anlegen — Titel, Datum, Uhrzeit, Dauer, Ort — die App schreibt eine Markdown-Notiz mit korrektem Frontmatter und kopiert ggf. zum konfigurierten Transport-Ziel. Der Modal hängt jetzt in `App.tsx` statt in der Sidebar, damit er auch bei zugeklappter Sidebar erreichbar bleibt.
- **Konfigurierbare Aufgaben-Lead-Time**: Im Dashboard-Tab der Einstellungen lässt sich pro Stufe (kritisch / normal) festlegen, wie viele Tage vor Fälligkeit eine Aufgabe in den „Bald fällig"-Bucket rückt. Default: kritisch=7, normal=1. Der Aufgaben-Bucket im Dashboard-Widget heißt jetzt **Bald** (innerhalb Lead-Time) und **Später** (dahinter, bis 14 Tage Voraus) statt eines pauschalen 7-Tage-Fensters.
- **Soft-Highlight für dringende Tasks im Editor**: Tasks mit `#dringend`, `#kritisch`, `#urgent`, `!!`, `[!]` o.ä. bekommen im Live-Preview-Modus einen leichten roten Hintergrund. Das Pattern liegt in `shared/taskExtractor.ts` (`CRITICAL_TASK_PATTERN`) und wird sowohl vom Parser als auch vom Editor-Decorator wiederverwendet.
- **Email-Notizen erben Reply-Urgency**: Wenn die KI-Analyse `replyUrgency='high'` liefert, taggt die Email-Notiz die generierten Tasks mit `#dringend` und ergänzt das Frontmatter-Tag. Damit wandern dringende Email-Antworten automatisch in den kritischen Lead-Time-Bucket.
- **Web-Recherche- und Smart-Connections-Buttons im Radar**: Pro Radar-Zeile zwei dezente Action-Buttons (erscheinen beim Hover): 🌐 öffnet Google mit dem bereinigten Notiz-Titel als Suchquery (Zettelkasten-ID-Präfix wird vorher entfernt), 🧠 wählt die Notiz aus und öffnet das SmartConnections-Panel. Bewusst on-demand statt Auto-Vorschlägen.

### Improvements

- **Dashboard-Initial-Load lädt Vault frisch**: Beim ersten Mount des Dashboards läuft jetzt einmalig dieselbe Reload-Operation wie beim „Aktualisieren"-Button. Vorher kamen nach Cmd+R die Notizen ohne Content aus dem Sidebar-Cache, frontmatter-markierte Problem-Notizen wurden nicht erkannt, und der Radar zeigte einen anderen Stand als nach Klick auf den Refresh-Knopf. Jetzt sehen beide Wege denselben Daten-Pool.
- **Radar-Score-Mischung statt `Math.max`**: KI-Score (0–100) ist die Hauptbewertung, Heuristik (Termin heute, kritische Tasks, frische Bearbeitung) addiert einen gedeckelten Boost (max +25). Vorher hat `Math.max` die Heuristik-Skala plattgebügelt — jede Notiz mit aiScore ≥ 40 landete oben, aktuelle Tagessignale wurden unsichtbar. Notizen ohne KI-Analyse mit aktivem Trigger bekommen einen Default-Sockel von 35, damit sie nicht systematisch hinter analysierten Altlasten landen.
- **Auto-Lösungsvorschläge im Radar entfernt**: Die grünen „Lösung:"- und „Kontext:"-Badges (Keyword-/später Embedding-basiert) waren bei Notizen wie „Termin mit Jens" reine Spekulation, weil die App das Weltwissen nicht hat. Stattdessen entscheidet der Nutzer explizit über die neuen Action-Buttons. Auch der Smart-Pairing-Score-Booster ist weg, der auf demselben unzuverlässigen Signal lief.
- **Radar-AI-Worker: Kandidaten einmalig vorgefiltert**: Bei großen Vaults (4000+ Notizen) hat die alte Per-Render-Kandidaten-Filterung das Dashboard sekundenlang einfrieren lassen. Jetzt werden problem-/solution-/info-Notizen einmal pro Snapshot gefiltert.
- **Radar-AI-Spinner-State zuverlässig**: Wenn der Effect während eines laufenden KI-Batches re-fired (z.B. weil sich `aiEnabled` kurzzeitig ändert), wurde im alten Closure `canUpdateLocalState=false` gesetzt — damit liefen die per-Notiz-`setAnalyzingIds(...delete)`-Aufrufe ins Leere und der Spinner drehte endlos, obwohl der `[Radar] AI worker batch finished`-Log längst erschien. Am Batch-Ende werden jetzt defensiv alle eigenen Kandidaten-IDs aus dem Set entfernt.

### Cleanup

- **Tote Pfade nach Lösungs-UI-Entfernung**: `findRadarConnection`, `scoreEmbeddingConnection`, `cosineSimilarity`, `EmbeddingsCache`-Typen, `correction`-State + `correctionCandidates`-Memo, `renderConnection`, `solveDialog`-State + `SolveProblemDialog`-Komponente, `handleConfirmSolve`-Callback und der Embeddings-Cache-Loader im RadarWidget — alle nicht mehr erreichbar, alle entfernt.
- **`CRITICAL_TASK_PATTERN` zentralisiert**: Das Regex-Pattern für kritische Tasks wandert aus `isCriticalTask` heraus und wird von Parser und Editor-Decorator gemeinsam genutzt — vorher war es zweimal hingeschrieben, hatte das Risiko auseinanderzulaufen.

## [0.6.32-beta] - 2026-05-09

### Fixes

- **Wikilinks im Lesen-Modus öffnen wieder die Zielnotiz**: In v0.6.31-beta wurde versehentlich Cmd/Ctrl als Voraussetzung eingeführt, damit man im Wikilink-Text editieren kann — in der Praxis hat ein normaler Klick aber einfach nichts mehr getan, weil der Lesen-Modus zum Lesen, nicht Editieren gedacht ist. Jetzt öffnet jeder Klick die verlinkte Notiz, analog zu externen Links und konsistent mit Obsidians Read-View. Wer im Wikilink-Text etwas ändern will, wechselt in den Schreiben- oder Markdown-Modus.

### Improvements

- **Wikilink-Klick-Handler ist robuster gegen verschachtelte Formatierung**: Statt nur direkte `target.classList`-Treffer zu zählen, sucht der Handler jetzt via `closest('.wikilink')` nach dem nächsten Wikilink-Anker im Klick-Pfad. Damit funktioniert der Klick auch zuverlässig, wenn der Wikilink-Text fett, kursiv oder anderweitig geschachtelt ist.

## [0.6.31-beta] - 2026-05-08

### Features

- **Externe Links und Wikilinks im Lesen-Modus klickbar**: Im neuen WYSIWYG-Lesen-Modus blockierte das `contentEditable` bisher den Default-Klick auf Links — der Cursor wurde gesetzt, statt dem Link zu folgen. Markdown-Links (`[text](url)`), `mailto:` und `tel:` öffnen jetzt direkt via `shell.openExternal` im System-Browser/Mail-Client. Wikilinks öffnen weiterhin per Cmd/Ctrl+Klick (damit man im Wikilink-Text noch editieren kann), externe Links per einfachem Klick.
- **Wikilinks aus der Floating-Toolbar einfügen**: Neuer `[[ ]]`-Button neben dem 🔗-Link-Button. Text markieren → Button → Notiznamen tippen → Live-Filter zeigt passende Notizen aus dem Vault, ↑/↓ navigiert, Enter wählt. Bei keinem exakten Treffer steht „Neue Notiz erstellen" oben in der Liste — wird beim Auswählen physisch im Vault angelegt (gleicher Flow wie das CodeMirror-Autocomplete im Schreiben-Modus).
- **Pointer-Cursor auf klickbaren Elementen** im Lesen-Modus: Externe Links, Wikilinks, PDF- und Office-Embeds sowie Checkboxen zeigen jetzt eine Hand statt des Text-Cursors aus dem `contentEditable`.

### Improvements

- **Floating-Toolbar nur bei aktiver Markierung**: Im Lesen-Modus erschien die Format-Toolbar bisher schon beim reinen Fokussieren — auch wenn man nur den Cursor setzen wollte. Jetzt taucht sie erst auf, sobald wirklich Text markiert ist (Notion/Medium-Style), und verschwindet wieder, wenn die Markierung kollabiert.
- **Inline-URL-Input statt `window.prompt`**: Der Link-Button öffnete bisher einen Browser-Prompt-Dialog, der in Electron-Renderern blockiert ist und daher nichts tat. Jetzt erscheint stattdessen ein Eingabefeld direkt in der Toolbar — Enter bestätigt, Escape bricht ab. Die ursprüngliche Markierung wird gespeichert und vor dem `createLink`-Befehl wiederhergestellt, damit der Link tatsächlich auf der gewünschten Stelle landet.
- **Toolbar bleibt aktiv beim Bearbeiten in Sub-Inputs**: Der Blur-Handler ignoriert jetzt Fokus-Wechsel innerhalb der Toolbar (z.B. ins URL-Input) — der Editier-Commit wird nicht ausgelöst, die Toolbar nicht weggenommen, solange der User mitten in einer Aktion ist.

### Fixes

- **Wikilink-Pipe-Alias-Syntax wird jetzt gerendert**: `[[Notiz|Anzeigetext]]` zeigte bisher die Pipe und das `|Anzeigetext`-Suffix als Teil des Link-Texts — der markdown-it-Renderer parste die Obsidian-Standard-Pipe-Syntax gar nicht. Jetzt wird der Anzeigetext korrekt extrahiert, das Link-Ziel zeigt nur auf den Notiznamen vor dem `|`. Betrifft alle Wikilinks im Vault, die je mit Alias geschrieben wurden — auch über das CodeMirror-Autocomplete im Schreiben-Modus eingefügte.

## [0.6.3-beta] - 2026-05-08

### Features

- **Neuer „Schreiben"-Modus als Standard**: Die Editor-Ansichten heißen jetzt **Markdown** (Quelltext, optional), **Schreiben** (formatierte Live-Ansicht, neuer Default) und **Lesen** (read-only mit Inline-Edit). Der Schreiben-Modus zeigt nur noch das fertige Schriftbild — Markdown-Marker (`**`, `_`, `#`, `[[…]]`) sind komplett ausgeblendet, statt nur auf der Cursor-Zeile sichtbar zu werden. Wer den reinen Quelltext braucht, aktiviert den Markdown-Modus über den Schalter in den Einstellungen.
- **Lesen-Modus mit Inline-Editing**: Die bisher rein gerenderte Vorschau ist jetzt direkt editierbar. Beim Markieren erscheint eine Floating-Toolbar mit Bold/Kursiv/Überschriften/Listen/Link, die Änderungen werden via `turndown` zurück in Markdown konvertiert und gespeichert. Damit lassen sich kleine Korrekturen an einer fertig formatierten Notiz machen, ohne die Ansicht zu wechseln.
- **Cmd/Ctrl+Click öffnet Wikilinks und externe Links** im Schreiben-Modus, normale Klicks bleiben fürs Bearbeiten reserviert. Inline-Checkboxen lassen sich per Klick togglen.

### Improvements

- **LanguageTool-Vorschläge sind ehrlicher**: Vorschläge, die nur Whitespace ändern (z.B. ein verstecktes Leerzeichen einfügen oder entfernen), sehen im Button identisch zum Original aus und haben User in der Vergangenheit zu unbeabsichtigten Annahmen verleitet. Solche Replacements werden jetzt rausgefiltert.
- **LanguageTool: Cursor bleibt nach „Übernehmen" stehen**, statt ans Ende des korrigierten Worts zu springen. Wer mitten im Satz korrigiert, kann ohne Maus-Reach weiterschreiben.
- **Settings-Schutz**: Wer den Markdown-Modus deaktiviert, hat ihn nicht mehr versehentlich als Default ausgewählt — die Voreinstellung springt automatisch auf „Schreiben". Migration für Bestandsuser: alter `preview`-Default wird beim Start auf `live-preview` umgeschrieben (außer beim Profil „Nur ansehen").
- **UI durchgängig auf neue Modus-Bezeichnungen**: Buttons, Tooltips, Settings-Labels, Onboarding-Guide und Hilfe-Texte wurden auf Deutsch und Englisch konsistent umgestellt.

### Fixes

- **WYSIWYG-Roundtrip schützt PDF-, Office-, Mermaid- und Dataview-Embeds**: Wer im Lesen-Modus Text neben einem PDF-Embed bearbeitete, hat das Embed beim Speichern stillschweigend verloren — der HTML→Markdown-Roundtrip strippte den Embed-Container, bevor `turndown` ihn überhaupt zu sehen bekam. Jetzt rekonstruieren vier neue Turndown-Regeln die Original-Syntax aus den `data`-Attributen (`data-filename` für PDF/Office, `data-query` für Dataview, neu `data-source` für Mermaid, da der `<pre>` beim SVG-Render verschwindet). Round-Trip mit 14 Szenarien getestet — auch Edits zwischen mehreren Embeds, Sonderzeichen im Mermaid-Code und Multiline-Dataview-Queries sind sicher.

## [0.6.2-beta] - 2026-05-07

### Fixes

- **Editor blockt leeren Autosave**: Wenn der Editor-State während einer Notiz auf "leer" zurückfällt (etwa durch einen UI-Glitch beim Tab-Wechsel oder ein Race beim Laden), schreibt der Autosave nicht mehr 0 Bytes über den vorherigen Inhalt. Stattdessen wird der Save verworfen und der Vorfall in der Konsole protokolliert.
- **Phantom-Sync-Konflikte vermieden**: Bevor die Sync-Engine eine `.sync-conflict-YYYY-MM-DD`-Kopie erzeugt, wird die Remote-Datei jetzt entschlüsselt und der Plaintext-Hash mit der lokalen Datei verglichen. Identischer Inhalt → kein Conflict-File, nur Manifest-Update. Verhindert, dass nach einem Sync-Roundtrip identische Dateien als Konflikt aufschlagen.

### Improvements

- **Automatische Markdown-Backups vor jedem Schreiben**: Der `write-file`-IPC-Handler legt vor jedem Überschreiben einer `.md`-Datei eine Kopie unter `<vault>/.mindgraph/backups/JJJJ-MM-TT/<relpath>/<dateiname>.<timestamp>.bak` ab. Zusätzlich blockt der Handler leere Writes auf nicht-leere Markdown-Dateien hart auf Main-Prozess-Ebene — zweite Verteidigungslinie unabhängig vom Editor. Backups sind vom Sync ausgeschlossen, bleiben also lokal.
- **LanguageTool-Button mit Status**: Der Prüfen-Button zeigt jetzt drei Zustände — "Prüft…" während der Anfrage, "Keine Fehler" nach einem sauberen Durchlauf, ein rotes `!`-Badge mit Fehlermeldung im Tooltip wenn der LanguageTool-Server nicht erreichbar war. Vorher gab es nur die Fehler-Anzahl, sonst stiller Fallback.

## [0.6.1-beta] - 2026-05-06

### Improvements

- **Dashboard-Refresh liest den Vault frisch von Disk**: Der Refresh-Button rebuildet nicht mehr nur den Snapshot aus dem In-Memory-Cache, sondern liest das Verzeichnis neu ein (`readDirectory` + `readFilesBatch`) und ersetzt die Notes im `notesStore`. Wichtig, wenn extern (anderes Gerät, Sync, externer Editor) geschrieben wurde und der Watcher das noch nicht aufgenommen hat — das Dashboard zeigt dann sofort den aktuellen Stand statt veraltete Karten.
- **Race-Condition beim Refresh entschärft**: Über eine `loadRequestId` schreibt nur das letzte angeforderte Snapshot in den State. Schnelles Mehrfach-Klicken auf den Refresh-Button kann den jüngeren Snapshot nicht mehr durch einen älteren überschreiben.
- **Visuelles Feedback während Refresh**: Das Refresh-Icon rotiert während des Reloads (bestehende `dashboard-view-spin`-Keyframe wiederverwendet), der Button ist `disabled` mit `cursor: progress` und 0.65 Opacity. Damit ist sichtbar, dass der Reload läuft — bei großen Vaults dauert das `readFilesBatch` spürbar.
- **`pdfCompanionEnabled` wird respektiert**: Beim Refresh werden `.pdf.md`-Companions nur eingelesen, wenn das entsprechende Setting aktiv ist — konsistent mit dem regulären Vault-Load in der Sidebar.

## [0.6.0-beta] - 2026-05-05

### Features

- **Brain — lokales Tagesgedächtnis (Phase 1)**: Neuer Button „Tag abschließen" im Aktivitäts-Widget verdichtet den heutigen Tag in eine strukturierte Markdown-Notiz im Vault (Default: `800 - 🧠 brain/JJJJ/MM/TT.md`). Drei Sensoren werden eingelesen: berührte Notizen (aus `contextMemory` + Datei-mtime), erledigte Aufgaben, empfangene/beantwortete Mails — plus optional die heutige Daily-Note als „Journal"-Quelle (Body bis 2000 Zeichen, Frontmatter abgeschnitten). Der Output folgt einem festen 4-Sektionen-Schema (Heute im Fokus / Was ich gemacht habe / Offene Fäden / Beobachtung) und ist über Frontmatter (`type: brain-day`, `sources`, `counts`, `themes`) maschinenlesbar.
- **Privacy als Code-Eigenschaft**: Brain-IPC-Handler ruft ausschließlich `localhost:11434` (Ollama) — hardcoded, nicht über die generischen LLM-Provider-Switche. Kein Cloud-API-Pfad, kein Telemetrie-Versand. Marketing-Aussage „verlässt nie deinen Rechner" ist damit verifizierbar.
- **Eigener Settings-Tab „Gehirn"**: konfigurierbarer Speicherort, Erklärung der Funktionsweise, Privacy-Hinweis. `brain.folderPath` ist im uiStore persistiert und wird über die IPC-Pipeline an den Main-Prozess gegeben (sanitisiert gegen absolute Pfade und `..`-Komponenten).
- **Aktivitäts-Widget → Gehirn-Identität**: Titel zweizeilig (`GEHIRN` + Untertitel „Lokales Tagesgedächtnis"), SVG-Hirn-Icon im Akzent-Kreis, Akzentstreifen links, Status-Streifen unter dem Header (`Heute um HH:MM Uhr verdichtet · Notiz öffnen` bei vorhandener Tagesnotiz, sonst pulsierendes „Heute noch nicht verdichtet").

### Improvements

- **Wikilink-Disziplin im Brain-Prompt**: Regeln stehen jetzt am Ende des Prompts (modellfreundlicher), nummeriert, mit konkreten Richtig/Falsch-Beispielen für Wikilinks, „Offene Fäden" (keine Mikrotasks, max 3 Punkte) und „Beobachtung" (deskriptiv, nicht bewertend). Zusätzlicher Postprocessor wickelt exakte Notiz-Titel im Output nachträglich in `[[…]]`, falls das Modell die Regel ignoriert. Temperatur auf 0.2 für strikteres Format-Following.
- **Tageszusammenfassungen werden nie überschrieben**: bestehende Brain-Notizen bleiben unangetastet — wiederholte Klicks erzeugen `TT (2).md`, `TT (3).md` usw. Human-in-the-Loop-Garantie als Architektur-Eigenschaft.
- **„Notiz öffnen" springt direkt in den Editor**: Status-Link findet die Brain-Notiz path-tolerant im Notes-Store und öffnet sie via `selectNote(id)` im Editor; nur Fallback auf Finder-Reveal, falls der Watcher die frisch geschriebene Datei noch nicht aufgenommen hat.
- **Markdown-Rendering im Aktivitäts-Insight (Vorgänger-Feature)**: Bullets und `**fett**` werden jetzt korrekt gerendert statt als Roh-Markdown angezeigt — über `markdown-it` + `sanitizeHtml`. (Inzwischen durch das Brain ersetzt.)

### Removed

- **„Lokal einordnen"-Button entfernt**: redundant zu „Tag abschließen", das dasselbe tut und das Ergebnis als persistente, durchsuchbare, verlinkbare Notiz im Vault ablegt. Modul ist damit eindeutig: ein Knopf, eine Geste, eine Notiz.

## [0.5.36-beta] - 2026-05-05

### Fixes

- **CI-Build für 0.5.34/0.5.35 schlug fehl, weil halb-committete Änderungen am Aktivitäts-Widget einkompiliert wurden**: das `DashboardView.tsx` aus 0.5.33 referenzierte bereits `memory.recentNotes7d`, `note.score` und den Translation-Key `dashboard.activity.recentContextTitle` — die zugehörigen Erweiterungen in `contextMemory.ts` (gewichtetes Event-Scoring + `recentNotes7d`-Fallback-Feld) und `translations.ts` lagen aber nur im Working-Tree und wurden nie gepusht. Lokal lief tsc grün, im CI brach der Build mit fünf TS-Fehlern ab. Die fehlenden Stücke sind jetzt drin.

### Improvements (rückwirkend wirksam, weil mit Fix gleich nachgeliefert)

- **Aktivitäts-Widget bekommt gewichtetes Event-Scoring**: statt reiner Event-Count-Sortierung wird jetzt nach Score gewichtet — `task_created`/`task_updated` zählen am stärksten (4/3), `note_opened` mittel (3), `note_created`/`note_updated` (2), `note_deleted` schwach (0.5). Inbox-/E-Mail-/Eingang-Folder werden mit Faktor 0.35 abgewertet, weil dort Notizen nur „durchwandern" und nicht den Arbeitskontext darstellen.
- **„Wahrscheinlicher Arbeitskontext" + „Zuletzt berührt"-Fallback**: bei genug Daten zeigt das Widget die top-bewerteten Kontexte (≥2 Events oder Score ≥4); bei dünner Datenlage fällt es auf die zuletzt berührten Notizen zurück, statt einer leeren Liste. Title-Label im UI wechselt entsprechend.

## [0.5.35-beta] - 2026-05-05

### Fixes

- **Unterordner anlegen schlug fehl**: Regression aus dem FS-IPC-Hardening (Commit 98c8595, v0.5.13-beta). Der `prompt-new-folder`-Handler prüfte den `basePath` mit `assertApprovedVault`, das nur Vault-Roots akzeptiert — beim Rechtsklick auf einen beliebigen Unterordner war `basePath = {vault}/{subfolder}` und damit nicht in `approvedVaultRoots`, also wurde der Save-Dialog mit „Vault-Pfad nicht autorisiert" verweigert. Handler nutzt jetzt `assertSafePath`, das rekursiv gegen die Vault-Roots prüft (Symlink-aware via realpath) und damit jede Tiefe innerhalb des Vaults durchlässt — Defense-in-Depth bleibt erhalten.

## [0.5.34-beta] - 2026-05-05

### Fixes

- **Sync-Konflikte auf 🔴-Notizen behoben**: der Radar-AI-Worker schrieb sein Analyse-Ergebnis (`relevanceScore`/`relevanceReason`/`relevanceCheckedAt`/`relevanceModel`) bisher direkt ins Frontmatter der jeweiligen 🔴-Notiz. Bei Multi-Device-Setups analysieren beide Geräte unabhängig dieselben Notizen → beide schreiben → Sync-Engine produziert `.sync-conflict-YYYY-MM-DD`-Dateien. Auch auf einem Gerät provozierte jeder 6h-Refresh einen `change`-Watcher → `pushFile` → Race-Risiko bei laufendem Sync. Der KI-Score wandert jetzt in einen deviceinternen `localStorage`-Cache (`mindgraph:relevance-cache:{vaultPath}`); die Notiz-Datei wird durch eine Analyse nicht mehr verändert. Frontmatter-Reader bleibt als Fallback für vor 0.5.34-beta analysierte Notizen — bestehende Relevanzfelder werden nicht migriert (würde wieder Sync-Push triggern), sondern erst durch die nächste Analyse vom Cache überschrieben.

## [0.5.33-beta] - 2026-05-05

### Features

- **Neues „Aktivität"-Dashboard-Widget**: Statistik-Grid (Notizen gesamt, heute berührt, neu in 7 Tagen, geändert in 30 Tagen, Kontext-Events 7d, Aufgaben-Events 7d) plus zwei Bar-Charts: Top-Ordner nach Änderungen + Top-Notizen nach Aufrufen/Bearbeitungen. Optionaler „Local Insight"-Button schickt die Statistik an Ollama und gibt eine Markdown-Bullet-Zusammenfassung des aktiven Arbeitskontexts zurück (max 5 Punkte, deutsch). Default-aktiv für alle Profile (Student/Researcher/Professional/Writer/Developer); Migration ergänzt das Widget bei bestehenden Vaults direkt hinter „Relevante Notizen".
- **Lokales Kontextgedächtnis (`contextMemory.ts`)**: localStorage-basiertes Event-Log (`note_opened`, `note_created`, `note_updated`, `note_deleted`, `task_created`, `task_updated`) mit Throttling pro Event-Typ + Note (z.B. `note_opened` 30s, `note_updated` 60s). 90-Tage-Retention, max 2500 Events. Zero-Backend, alles im Renderer. Speist die Top-Notes-Bars im Aktivität-Widget und ist der Datenstand für die Ollama-Insight.

### Fixes

- **Nicht-Markdown-Dateien wurden vom Notizart-Filter verschluckt**: in `FileTree.tsx` sortierte der Filter PDFs, DOCX/XLSX und Bilder mit `return null` aus, sobald irgendein Kind-Filter aktiv war — die Dateien verschwanden sichtbar aus dem Tree, obwohl der Filter logisch nur für Markdown-Notizen gilt. Jetzt werden Nicht-Markdown-Einträge unbedingt durchgereicht (`return entry`).

## [0.5.32-beta] - 2026-05-05

### Improvements

- **Settings-Tabs entkoppelt: „Email" und „Edoobox" sind jetzt eigene Tabs**: vorher steckten beide unter einem gemeinsamen „Agenten"-Tab, was die Email-Settings de facto unauffindbar machte. Email hat jetzt einen eigenen Sidebar-Eintrag mit Briefumschlag-Icon (sichtbar nur wenn `email`-Modul aktiv); der frühere Tab heißt nun „Edoobox" und enthält nur noch edoobox/Marketing/IQ. Routing aus dem Credentials-Health-Check zeigt entsprechend auf den neuen `email`-Tab.
- **Modul-Naming entpersonalisiert: „Medienzentrum-Suite" → „Edoobox Modul"**: konsistent durchgezogen über Modul-Liste, Settings-Tab-Label, Help-Guide und beide Sprachen. „Medienzentrum" war ein interner Branchenbegriff, „Edoobox" beschreibt das, was das Modul tatsächlich macht.
- **Tasks-Panel umbenannt: „Überfällige Tasks" → „Aufgaben & Termine"**: das Panel zeigte schon immer überfällig + heute + morgen + undatiert — der alte Titel suggerierte fälschlich „nur Überfälliges". Titlebar-Tooltip, Panel-Header, Loading-State und Empty-State alle synchronisiert (DE+EN).
- **Compose & Quick-Add als Modal-Overlays via `createPortal`**: vorher wurde der Compose-View in das schmale rechte Inbox-Panel gequetscht — kaum nutzbar. Jetzt zentriertes Modal (860×760, Blur-Backdrop), das ursprüngliche Panel zeigt einen Empty-State mit Stift-Icon. Quick-Add im Tasks-Panel analog (520×max, top-aligned, responsive). Portal hängt am `document.body`, damit weder Panel-Container noch Sidebar das Overlay clippen.
- **Email-Instruktionen-Template entpersonalisiert**: das beim ersten Email-Setup angelegte `Email-Instruktionen.md` enthielt fest verdrahtet „Name: Jochen Leeder" und „Medienzentrum"-Spezifika als Relevanz-Kriterien. Jetzt generischer Platzhalter („Persönliche Ansprache", „Projekt-/Organisationsbezug", „Eigene Schlüsselwörter"). Bestehende Vaults sind nicht betroffen — nur Neueinrichtungen.
- **Prompt-Injection-Warnbanner aus Inbox-Panel entfernt**, durch dezenteren Hinweis im Email-Settings-Tab ersetzt („KI-Hinweis — E-Mails sind untrusted Input. Lokale KI empfohlen.").

### Fixes

- **„Heute fällig" wurde ab Nachmittag fälschlich als „überfällig" markiert**: `isOverdue(date)` verglich gegen `new Date()` statt gegen den Tagesanfang — eine Aufgabe mit Fälligkeit heute 00:00 galt ab 00:01 als überfällig. Vergleicht jetzt gegen `todayStart` (Mitternacht heute), womit Tasks erst ab dem Folgetag rotzeigend werden. Fix in `taskExtractor.ts` (vault-weit, betrifft auch Dashboard-Counter) + `OverduePanel.tsx`.

### Internal

- **`main/index.ts`-Email-Sektion entboilerplatet**: vier IPC-Handler hatten je ihren eigenen safeStorage- und Settings-Lese-Boilerplate inline. Zentrale Helper (`loadEmailPassword`, `loadEmailSettings`, `getEmailRetainDays`, `sendEmailWindowEvent`) plus Konstanten (`DEFAULT_EMAIL_RETAIN_DAYS`, `DEFAULT_EMAIL_INSTRUCTION_NOTE`, `DEFAULT_EMAIL_INSTRUCTIONS`) ersetzen ~120 Zeilen Duplikation. Kein Verhaltens-Change.
- **`EmailAccount.fromAddress?: string`** im Type — Vorbereitung für separate From-Address vs. IMAP-User in einem späteren Schritt.

## [0.5.31-beta] - 2026-05-04

### Fixes

- **„Relevanz entfernen" wirkt jetzt wirklich**: vorher wurde nur der `category|noteKind|kind:`-Eintrag aus dem Frontmatter genommen — der farbige Punkt blieb trotzdem stehen, weil `getNoteKind` als Fallback das Emoji im Dateinamen/Pfad matched. Jetzt strippt der Handler zusätzlich das 🔴/🟢/🔵-Emoji aus dem Dateinamen via `stripNoteKindMarker` und benennt die Datei via `renameFile` um (`updateNotePath` aktualisiert die Note-ID im Store, anschließend Tree-Refresh).

### Improvements

- **Notes-Stammordner-Badge im Sidebar-Header**: das frühere `Notes: <Name>` produzierte bei Folder-Namen wie „Notes" das tautologische `Notes: Notes`. Badge zeigt jetzt ein dezentes Folder-Icon (SVG) + den ID-Präfix-bereinigten Folder-Namen, ohne hardcodiertes englisches „Notes:"-Prefix. Ellipsen + Tooltip mit vollem Pfad bleiben.
- **Badge-Styling angepasst**: subtilerer Border (kein accent-Mix mehr), `gap: 4px` zwischen Icon und Label, `padding: 1px 6px 1px 5px`, Icon mit `opacity: 0.72`. Wirkt aufgeräumter neben der Notiz-Anzahl.

## [0.5.30-beta] - 2026-05-04

### Improvements

- **Relevanz-Counter im Sidebar-Header zählt nur noch den konfigurierten Notes-Stammordner**: vorher waren die 🔴/🟢/🔵-Chips vault-weit, was unintuitiv wirkte — wer eine Notiz aus „Notes" rausgeschoben hatte, sah sie nicht mehr im Tree, aber der Counter zählte sie weiter. Counter scoped jetzt auf `notesRootFolder` (das, was im „Notes: …"-Badge steht); Punkte an einzelnen Notizen außerhalb des Stammordners bleiben sichtbar wie bisher. Ohne konfigurierten Notes-Root fällt das Verhalten auf vault-weit zurück.
- **„Relevanz entfernen"-Eintrag im Kontextmenü**: das Submenu „Relevanz ändern" hatte bisher nur Problem/Lösung/Info — jetzt gibt es darunter (mit Trenner) den Eintrag „Relevanz entfernen", der `category|noteKind|kind:` aus dem Frontmatter rausnimmt. Wenn der Frontmatter-Block dadurch leer wird, wird er ganz entfernt.

### Fixes

- **Submenu-Layout: fehlender Abstand zwischen Punkt und Label**: `.context-submenu .context-menu-item` setzt `display: block` und überschreibt damit das `gap: 8px` von `.note-kind-menu-item`. Im Submenu klebte der farbige Punkt direkt am Wort („●Problem"). Jetzt explizit Flex-Layout im Submenu wiederhergestellt.

## [0.5.29-beta] - 2026-05-04

### Fixes

- **Radar-Widget („Relevante Notizen") stabilisiert**: das Modul stürzte regelmäßig nach Refresh ab, weil mehrere ineinandergreifende useEffects + localStorage-Writes in eine Recompute-Schleife liefen. Drei zusammenhängende Fixes: (1) `t` aus `useTranslation` ist jetzt per `useCallback` stabil — vorher war es bei jedem Render eine neue Funktion, wodurch das `radarSnapshot`-`useMemo` pro Render neu lief und der Persist-Effect localStorage-Writes auf jeden Render auslöste. (2) `persistRadarSnapshot` dedupliziert über einen Ref — identische Score-Maps schreiben nicht mehr. (3) `loadSnapshot` ist in try/catch/finally gewrappt — ein einzelner kaputter Sub-Call (edoobox-Timeout, korruptes Frontmatter, Kalender-Permission-Race) crasht nicht mehr die ganze Snapshot-Promise.
- **ErrorBoundary pro Dashboard-Widget**: ein Render-Crash im Radar zog vorher das ganze Dashboard mit (weiße Fläche). Jeder Widget-Slot hat jetzt seine eigene Boundary mit „Erneut versuchen"-Button — Fehler im Radar lassen Tasks/Mails/Kalender unberührt.
- **Verlorener Force-Refresh-Klick im Radar-AI-Worker**: wer während eines laufenden Ollama-Batches nochmal den Refresh-Button drückte, dessen Klick verschluckte sich (consumed-Tick wurde im Early-Return-Pfad nicht gespiegelt). Der Batch-`finally` gleicht jetzt Tick-Mismatch ab und holt einen ausstehenden Refresh nach.
- **Anwesenheitsliste mit >9 Teilnehmern**: das DOCX-Template hat 9 Zeilen pro Seite, die Erzeugung war hart auf 9 begrenzt und warf für größere Veranstaltungen einen Fehler. Generator hängt bei Bedarf zusätzliche Seiten an (Page-Break + Tabellen-Replikat), Obergrenze jetzt 100 Teilnehmer gesamt. Konstante im Renderer (`AgentPanel`) entsprechend erhöht.
- **InboxPanel-Übersetzung**: „markiert als bearbeitet"-Indikator nutzte fälschlich den Aktions-Key `inbox.markHandled` (Verb) statt des Status-Keys `inbox.markedHandled` (Partizip).

## [0.5.28-beta] - 2026-05-03

### Fixes

- **Radar AI Worker startet keine Doppelläufe mehr beim schnellen Wechsel ins Dashboard**: der Concurrency-Lock lag bisher als `useRef` am Widget. Beim Unmount/Remount (z. B. wenn man das Dashboard zumacht und kurz danach wieder öffnet) bekam jeder neue Mount einen frischen Ref → der laufende Ollama-Batch lief im Hintergrund weiter, parallel startete eine neue Schleife. Lock liegt jetzt als Modul-Singleton (`radarAiWorkerRunning`) und überlebt Mount/Unmount; lokale State-Updates werden nach Unmount per `canUpdateLocalState`-Flag verworfen, damit React keine Set-State-Aufrufe auf einer abgemeldeten Komponente bekommt.

### Docs

- **Whisper-Diktat auf der Webseite sichtbar gemacht**: neuer Module-Chip „Diktat & Vorlesen" (DE) / „Dictation & TTS" (EN), Erweiterung der „Lokale KI"-Kapability-Card und JSON-LD-`featureList`-Eintrag — vorher kam Whisper auf mindgraph-notes.de gar nicht vor.

## [0.5.27-beta] - 2026-05-03

### Features

- **Diktieren ohne lokale Whisper-Installation**: neue eingebaute STT-Engine läuft direkt im Renderer via `@huggingface/transformers` v4 + ONNX Runtime — kein `pip install`, kein PATH-Geraffel, keine ffmpeg-Abhängigkeit mehr für Endkundinnen. Modell wird beim ersten Diktat einmalig von HuggingFace geladen (~80 MB `tiny`, ~175 MB `base`, ~480 MB `small`) und im Browser-Cache offline behalten.
- **Engine-Switch in Settings → Sprache**: Default ist *Eingebaut (empfohlen)*; Power-User können auf *Lokales Whisper-CLI* umstellen, wenn sie Whisper selbst installiert haben. „Modell vorbereiten"-Button + Status-Chip zeigen, ob das Modell schon im Speicher liegt.
- **Voice-Toast mit Download-Fortschritt**: während des Erst-Downloads zeigt der Toast unten rechts welche Datei gerade lädt und einen Progress-Bar.

### Improvements

- **macOS-Mic-Permission im signierten Build**: `NSMicrophoneUsageDescription` ergänzt — sonst kann die ausgelieferte App nicht aufs Mikrofon zugreifen.
- **CSP gehärtet** für Modell-Download: `connect-src` erlaubt `huggingface.co`, `cas-bridge.xethub.hf.co`, `cdn.jsdelivr.net`; `script-src` erlaubt `wasm-unsafe-eval` + `blob:` für den Worker; `worker-src 'self' blob:`.
- **Onboarding & Dashboard**: `focus`- und `radar`-Widget sind jetzt für alle Profile (student/researcher/professional/writer/developer) Default — vorher fehlten sie in allen Profil-Voreinstellungen.
- **Radar AI Worker**: `forceRefreshTick` wird nur einmal verbraucht statt endlos neu auszulösen, wenn der Refresh-Button geklickt wird.
- **Schnellerfassung & FileTree**: neue Notizen aus Quick-Capture (Transport) und aus dem FileTree werden sofort in den notesStore eingefügt + selektiert, sodass keine manuelle Watcher-Wartezeit mehr nötig ist.

### Fixes

- **ONNX-Runtime-Inkompatibilität mit quantisiertem Whisper-Decoder**: Xenova-`q8`-Decoder vermisst beim Laden mit aktuellem onnxruntime-web `MatMulNBits`-Scales und startet gar nicht. Fix: Encoder bleibt quantisiert (`q8`, ~25 MB), Decoder läuft als `fp32` (~150 MB) — Modellgröße bleibt akzeptabel, aber Initialisierung läuft jetzt durch.
- **Whisper-Worker hing in „Modell wird initialisiert"**: WebGPU-Init im Electron-Worker terminierte nicht zuverlässig. Fix: explizit `device: 'wasm'` mit `numThreads: 1` (Electron-Renderer hat ohne COOP/COEP keinen SharedArrayBuffer für Multi-Thread-WASM).
- **`setIdle()` nach erfolgreichem Modell-Load**: Status-Toast blieb sonst auf „Modell wird initialisiert …" stehen, obwohl die Pipeline bereit war.
- **FileTree-Filter bei unbekanntem Note-Kind**: Einträge ohne erkennbares `kind` wurden komplett ausgeblendet. Jetzt werden sie wieder durchgereicht (statt verschluckt).

### Security & Privacy

- **STT-Audio-Datei wird jetzt immer gelöscht**: vorher blieb der temporäre WebM-Mitschnitt bei leerem Transkript / Fehler im `tmpdir` liegen. Aus Datenschutzgründen wird er jetzt unbedingt entfernt; Debug-Erhalt nur noch via `MINDGRAPH_KEEP_STT_AUDIO=1`.
- **Whisper-CLI-Pfad-Allowlist**: auch absoluter `whisperCommand`-Pfad wird gegen `ALLOWED_COMMAND_NAMES` (`whisper`, `whisper-ctranslate2`, `whisper-cpp`, `whisper-cli`) geprüft — verhindert das Ausführen beliebiger Binaries via Settings.

## [0.5.26-beta] - 2026-04-30

### Fixes
- **KI-Analyse-Self-Trigger endgültig behoben**: die 60s-Toleranz aus 0.5.25-beta war zu knapp. Watcher-Echo, Sync-Engine-Pushs und andere Hintergrund-Updates konnten `modifiedAt` von bereits analysierten Notizen mehrere Minuten nach unserer Frontmatter-Schreibung anstoßen, was dazu führte dass beim Tab-Wechsel ohne erkennbaren Auslöser eine bereits gerenderte Notiz erneut analysiert wurde — und dabei der Render-Crash auftrat. Wir entfernen jetzt das modifiedAt-basierte Re-Triggering komplett: Re-Analyse erfolgt nur noch (a) wenn die Notiz noch nie analysiert wurde, (b) wenn der Cache älter als das konfigurierte Refresh-Intervall ist (Default 6h), oder (c) wenn der User den Refresh-Button im Radar-Header klickt. User-Edits werden so verlässlich nach 6h oder via Knopfdruck erfasst, ohne false-positive-Trigger durch Hintergrund-Schreibungen.
- **Worker setzt modifiedAt auf checkedAt-Zeitpunkt**: das selbst geschriebene Update erzeugt jetzt keine künstliche Differenz mehr zwischen `modifiedAt` und `relevanceCheckedAt`.

## [0.5.25-beta] - 2026-04-30

### Fixes
- **KI-Analyse-Loop bei Tab-Wechsel zum Dashboard**: der Worker schreibt beim Cachen seines `relevanceScore` ins Frontmatter auch `modifiedAt: new Date()`. Der Re-Analyze-Filter prüfte `modifiedAt > checkedAt` — und genau das war nach jedem eigenen Schreibvorgang true (1 ms Differenz). Folge: jedes Öffnen des Dashboards triggerte sofort eine vollständige Re-Analyse aller 🔴-Notizen, was unter Last bis zum Render-Crash führen konnte. Fix: 60-Sekunden-Toleranz im Filter — Self-Writes werden ignoriert, echte User-Edits weiter erkannt.
- **Tooltip am KI-Refresh-Button im Radar-Header unleserlich**: das App-Tooltip-System zeichnet Tooltips standardmäßig oberhalb des Elements, im Widget-Header lag das auf dem akzent-getönten Hintergrund und wurde abgeschnitten. Tooltips im Widget-Header rendern jetzt nach unten (analog Titlebar / Sidebar-Header / Editor-Toolbar).

## [0.5.24-beta] - 2026-04-30

### Fixes
- **Dashboard flackerte permanent während KI-Relevance-Analyse**: der Worker rief beim Schreiben jedes Frontmatter-Updates `updateNote` auf, was den `notes`-State änderte, der `loadSnapshot`-Callback wurde neu erzeugt, useEffect feuerte den Reload mit `setIsLoading(true)` — sichtbar als Reset-Schleife alle paar Sekunden. Fix: `setIsLoading(true)` nur beim initialen Mount, alle weiteren Reloads laufen silent. Plus 800ms-Debounce auf den Re-Trigger, damit viele schnelle Worker-Updates zu einem einzigen Reload zusammengefasst werden.

## [0.5.23-beta] - 2026-04-30

### Features

- **Neues Dashboard-Widget „Relevante Notizen"** — sammelt 🔴-Problem-Notizen aus dem Vault und scort sie nach mehreren Signal-Quellen, damit vergessene oder still gewordene Probleme wieder ins Sichtfeld kommen:
  - **Heuristik-Score**: offene Tasks (overdue ×8, today ×5, critical ×4, upcoming ×2), Backlinks von 🟢/🔵 (×2), Mail-Bezug (×4 pro passender Mail der letzten 7 Tage), Termin-Bezug (×5 pro Kalender-Match in 7 Tagen), Stille (>7 Tage ohne Bewegung trotz offener Tasks +3), Frische (modifiedAt < 3 Tage +6, < 7 Tage +3) und Datum-im-Titel-Heuristik (`Fachforum 27.05` → +1 bis +6 je nach Abstand).
  - **KI-Relevanz-Analyse via Ollama** pro 🔴-Notiz: schreibt `relevanceScore` (0-100) und `relevanceReason` (1-Satz-Begründung) ins Frontmatter. Refresh alle 6h, Concurrency-Lock + Batches á 2 verhindert Ollama-Überlast. KI-Score überschreibt Heuristik-Score wenn aussagekräftig (≥40), sonst zählt der Heuristik-Score weiter als Floor. Notizen mit hohem KI-Score erscheinen auch ohne Heuristik-Trigger im Radar.
  - **Smart-Pairing**: pro 🔴 wird die thematisch passendste 🟢 (Lösung) und 🔵 (Kontext) automatisch ermittelt — Keyword-Tokenizer mit Stop-Words, Title-Match, Backlink-Bonus, Folder-Bonus. Pro Pairing `✓ × …`-Buttons als persistentes Feedback (localStorage), `…` öffnet Korrektur-Picker für manuelle Auswahl. Pairing zählt nur als Score-Booster, nicht als eigenständiger Relevanz-Trigger.
  - **Closing-Workflow** (`✓✓ als gelöst`): Dialog mit zwei Optionen — Backlink in der Lösung anlegen, offene Tasks in der Notiz erledigen. Schreibt `status: solved` + `solvedBy` + `solvedAt` ins Frontmatter, optional `solvedFor: [...]` in die Lösung. Solved-Counter im Footer („Diese Woche gelöst: 3"). 🔴 bleibt rot, verschwindet nur aus dem aktiven Radar.
  - **Sleeping-Bucket** (💤): rote Notizen ohne aktiven Trigger und seit > 14 Tagen unangefasst landen in einer kollabierbaren Sub-Sektion, sortiert nach Stille-Dauer. Verhindert dass das Dashboard mit Karteileichen verstopft, aber wirft sie nicht weg.
  - **Δ-Druck (Trend-Anzeige)**: pro Tag wird ein Score-Snapshot in localStorage abgelegt (max 7 Tage). Im UI dezenter monochromer Indikator: `▴ 5` (Score gestiegen), `▾ 3` (gefallen), `·` (unverändert), `★` (neu im Radar).
- **FileTree-Farbfilter** — drei Chip-Buttons 🔴🟢🔵 in der FileTree-Header-Leiste filtern nach Notiz-Kategorie. Click toggelt, Right-Click setzt nur diese eine Farbe. Counter-Badge zeigt Anzahl pro Kategorie. Zustand persistiert in `uiStore.fileTreeKindFilter`.
- **„Relevanz ändern"-Submenu** im Datei-Kontextmenü: drei Einträge (🔴 Problem / 🟢 Lösung / 🔵 Info) schreiben `category:` direkt ins Frontmatter, ohne dass der Datei-Name angefasst werden muss.
- **Standard-Notizenordner** als eigenes Setting (`notesRootFolder`) — neue Notizen aus dem Sidebar-Plus landen automatisch im konfigurierten Ordner. Sidebar zeigt Setup-Banner wenn leer, neuer IPC-Handler `select-folder-in-vault` validiert per `assertSafePath`, dass die Auswahl innerhalb des Vaults liegt.

### Improvements

- **Strikte 🔴-Erkennung im Radar**: nur Frontmatter `category:` ODER Titel mit Emoji-Marker am Anfang oder direkt nach " - " (matched z. B. `202604221336 - 🔴 Digitalwoche`). Pfad-Fallback und Inline-Emoji-Match werden bewusst ausgeschlossen, damit Zettelkasten-Notizen mit zufälligen Emojis im Inhalt/Pfad nicht versehentlich als Probleme klassifiziert werden.
- **Frontmatter-Helper-Bibliothek** in `noteKind.ts`: `getNoteStatus`, `markProblemSolvedInContent`, `addSolvedForBacklinkInContent`, `completeOpenTasksInContent`, `getNoteRelevance`, `setNoteRelevanceInContent`, `getNoteKindFromTitleStrict` — saubere YAML-Manipulation mit Quote-Escaping und List-Merge für `solvedFor`.
- **`category|noteKind|kind`-Aliasing**: Frontmatter-Erkennung akzeptiert jetzt alle drei Schreibweisen für die Notiz-Kategorie.

### Settings

- Neue Felder in `dashboard`-Block: `radarAiEnabled`, `radarAiRefreshIntervalHours` (Default 6h), `radarAiModel` (leer = nutzt `ollama.selectedModel`). Migration für bestehende Configs ergänzt fehlende Defaults beim ersten Start.
- Neuer Top-Level-Key `notesRootFolder` (persistiert), Setup-UI in Settings („Ordner wählen / Notes anlegen / Zurücksetzen").

## [0.5.22-beta] - 2026-04-29

### Fixes
- **CI-Build-Fix für 0.5.21-beta**: ungenutzte `height`-Variable in `hierarchicalLayout` entfernt (`tsc --noEmit` schlug auf macOS, Linux und Windows mit `TS6133` fehl, deshalb wurden für 0.5.21-beta keine Release-Assets gebaut). Inhalt von 0.5.21-beta ist sonst identisch.

## [0.5.21-beta] - 2026-04-29 (broken — no release assets)

### Features
- **Hierarchischer Layout-Algorithmus deutlich verbessert** — drei Schwächen behoben, die zusammen für sichtbare Crossings und massiv verschwendeten Whitespace sorgten:
  - **Virtuelle Dummy-Nodes für Long-Edges** (`insertVirtualNodes`): Edges, die mehr als ein Layer überspringen (z. B. Layer 0 → Layer 2), werden vor der Crossing-Min in einen Chain aus Single-Layer-Edges durch unsichtbare Dummies verwandelt. Damit beteiligen sich Long-Edges am Barycenter-Ordering — vorher hingen sie quer durchs Layout.
  - **Median-basierte Y-Koordinaten mit Min-Distance**: ersetzt das naive sequentielle Stapeln. 24 Refinement-Iterationen ziehen jeden Knoten zur mittleren Y-Position seiner Graph-Nachbarn, mit Top-Down-Min-Distance-Constraints zwischen Layer-Nachbarn. Anschließende Translation auf `top = padding`, damit das Layout am oberen Canvas-Rand beginnt.
  - **Layer-Width = Median mit Cap (480 px)** statt `max(card-widths)`: eine einzelne übergroße Karte (z. B. manuell auf 1500 px gezogen) sprengt nicht mehr das gesamte Layout. Die Riesenkarte überlappt visuell in den Gap, alle anderen Layer bleiben kompakt.
  - **Horizontaler Layer-Gap auf 60 px** (vorher implizit `cardWidth + 80` → bei breiten Karten >300 px Gap). Layers stehen sichtbar enger zusammen.
- **Diagnose-Logs für Layout-Debugging**: `[Layout] Hierarchical: N dummies inserted, crossings X → Y` und `[Layout] Hierarchical card widths per layer: L0=[…] L1=[…]` machen Auffälligkeiten (z. B. Outlier-Karten) sofort sichtbar.

### Improvements
- **Design-Pass quer durchs Workspace** — Übergang vom soliden Pill-Design auf einen ruhigeren, color-mix-basierten Look:
  - **`color-mix()`-Token überall**: Hintergründe, Borders, Hover-States werden aus den CSS-Variablen gemischt (`color-mix(in srgb, var(--accent-color) 11%, var(--bg-primary))` u. ä.). Theme- und Akzentfarbe färben jetzt automatisch durch alle Subtilitäten durch — keine hartkodierten Hover- und Active-Werte mehr.
  - **View-Mode-Switcher als Tab-Bar**: Editor / Split / Graph / Dashboard mit Text-Labels neben den Icons, im Container mit Border + Padding + Box-Shadow. Active-State ist farbiger Text + heller Hintergrund + dezenter Schatten statt voller Akzentfarbe als Vollfläche.
  - **Sidebar polished**: Header höher (44 → 48 px), eigener `bg-primary`-Mix-Background, Letter-Spacing 0.1em. Der `+`-Button wird zum Primary-Action mit Akzent-getöntem Hintergrund + Border. `.btn-icon` einheitlich 28×28 mit 7-px-Radius. Vault-Info in eigenem `.vault-meta`-Container.
  - **Status-Dot in Bookmarks + FileTree**: Note-Kind-Indikator (🔴 Problem / 🟢 Lösung / 🔵 Info) zieht jetzt auch in Bookmarks und FileTree ein. Bookmark-Titel werden via `stripNoteKindMarker` von rohen Emojis bereinigt.
  - **Edge-Farben dezenter**: `--edge-color` `#c0c0c0 → #b8bec7`, manuelle Edges `#0a84ff → #3478d4`.
- **Dashboard-Widgets mit farbigem Akzent-Strich**: jedes Widget hat eine 3-px-Top-Bar in der zugehörigen Akzentfarbe via `inset 0 3px 0` Box-Shadow — Tasks rot, Emails gelb, Calendar accent, Bookings grün. Header-Hintergrund leicht in der Akzentfarbe getönt (5 %), Counter-Badge passt Border + Text-Tönung an. Hover-Background mit Akzent-Tint.
- **Dashboard-Grid kompakter**: `auto-fill, minmax(320px, 1fr)` → `auto-fit, minmax(320px, 380px)`. Karten werden nicht mehr auf volle Breite gestreckt, behalten ihre natürliche Größe bei großem Fenster.
- **SVG-Export-Button bekommt Icon + Label** statt nur dem Text „SVG".

## [0.5.20-beta] - 2026-04-29

### Features
- **Notiz-Kategorien als zentrales UI-Konzept** — neue Utility `utils/noteKind.ts` definiert drei funktionale Kategorien: 🔴 *Problem* (Aktion/Problem), 🟢 *Lösung* (Wissen/Guide), 🔵 *Info* (Info/Reader). Jede Kategorie kennt Emoji, Label, AI-Kategorie-Bezeichnung, Dot-Farbe und Canvas-Hintergrundfarbe. Erkennung aus Frontmatter (`category:`), Titel-Emoji, Pfad — mit Aliassen (red/problem/aktion · green/solution/lösung/wissen/guide · blue/info/reader).
- **Farbiger Status-Dot überall in der UI** — kompakter 10-px-Dot statt rohes Emoji im Editor-Header, in den NoteNodes des Wissensgraphen, im Hover-Label der DotNodes, in den TabBar-Tabs und im FileTree. Ein-Stelle-Quelle für Farbe und Bedeutung; Workspace wirkt deutlich aufgeräumter.
- **AI-Layout im Canvas nutzt funktionale Kategorien** — beim AI-Sortieren werden Karten anhand ihrer Notiz-Kategorie eingefärbt (`canvasColor` aus `noteKind`) und mit AI-Kategorie-Label (`Aktion/Problem` / `Wissen/Guide` / `Info/Reader`) ans Layout-Modell durchgereicht. Vorher inline hartkodierte Emoji-Logik in GraphCanvas.tsx.
- **Transport-Capture nutzt zentrale Kategorien-Definition** — die Schnellerfassung baut ihre Kategorien-Buttons jetzt aus `NOTE_KINDS` statt aus dupliziertem Mapping. Konsistente Farben + Labels.

### Improvements
- **Website-Positionierung** — Title, OG-Tags, Twitter-Card, JSON-LD-Description und Feature-Liste auf „Lokaler KI-Workspace für Wissen, Projekte & Dokumente" geschärft. Statt Feature-Aufzählung steht das Workspace-Konzept im Vordergrund (local-first, KI, Wissensgraph, Email, Aufgaben, Dokumente).

## [0.5.19-beta] - 2026-04-29

### Features
- **Telegram-Agent-Modus mit Tool-Use (experimentell)** — neuer Command `/agent <auftrag>` (oder freier Text bei aktivem Agent-Modus) mit echtem Tool-Use-Loop. Der Bot kann jetzt Notizen suchen (`note_search`), volltext lesen (`note_read`), neu anlegen (`note_create`), an bestehende Notizen anhängen (`note_append`), Tasks listen (`task_list`), Tasks abhaken (`task_toggle`) und den Kalender abfragen (`calendar_list`). Aktuell nur über Ollama (Modell muss Tool-Calling beherrschen — empfohlen: `mistral-nemo:12b-instruct`, `llama3.1:8b`, `qwen2.5-coder:14b`; Gemma kann es nicht).
- **Confirm-Flow für Schreib-Operationen** — alle schreibenden Tools (`note_create`, `note_append`, `task_toggle`) lösen vor der Ausführung eine Telegram-Nachricht mit Inline-Buttons „✅ Erlauben / ❌ Abbrechen" aus. Auto-Deny nach 2 Min Timeout. `isWrite`-Flag im Tool selbst ist die harte Sicherheitsgrenze — auch ohne expliziten Eintrag in `agentConfirmTools` wird gefragt.
- **Settings-Tab „Telegram" → Agent-Modus** — neuer Block: Aktivierung, Inbox-Ordner für `note_create` (mit Vault-Folder-Autocomplete und sinnvollem Default `000 - 📥 inbox/010 - 📥 Notes`), Iterations-Limit (1-15, Default 8), Tool-Allowlist pro Tool mit Beschreibung, klare Markierung schreibender Tools (rot).
- **Freier Text → Agent bei aktivem Modus** — wenn der Agent-Modus eingeschaltet ist, gehen normale Telegram-Nachrichten ohne `/`-Prefix automatisch durch den Agent statt durch das read-only `/ask`. Schreib-Tools sind durch den Confirm-Flow weiterhin abgesichert.

### Improvements
- **`safeReplyMarkdown` für LLM-Antworten** — Telegram lehnte bisher LLM-Antworten mit unbalancierten Markdown-Sonderzeichen (`*`, `_`, `` ` ``) hart ab. Neuer Helper retried Plain-Text bei Parse-Fehlern; verwendet in `/briefing`, `/ask` und Agent-Antworten. Behebt „Bad Request: can't parse entities".
- **Ollama-Modell-Validierung** — `pickDefaultOllamaModel` wirft jetzt einen klaren Fehler, wenn das in den Settings konfigurierte Modell nicht installiert ist (statt still auf irgendein anderes auszuweichen). Tool-fähige Modelle stehen oben in der Auto-Pick-Reihenfolge (`qwen3`, `qwen2.5-coder`, `llama3.1`, `mistral-nemo`).
- **Bessere Diagnose-Logs** — `[Telegram Agent] start/iteration/run tool` und `[Telegram] requestConfirm/callback_query` machen das Debuggen von Tool-Use-Pfaden im Server-Log einfach.
- **Agent-Loop nicht mehr blockierend** — `bot.command('agent', …)` und der Free-Text-Handler dispatchen den Agent-Loop jetzt im Hintergrund (`void runAgent(...).catch(...)`). Vorher konnte ein laufender Agent das Polling und damit auch Confirm-Klicks blockieren.

### Architecture
- **`chatClient.chatWithTools()`** — neue Tool-aware Chat-Funktion parallel zum bestehenden `chat()`. Mappt Ollama-Wire-Format (`role: tool`, `tool_calls.function.{name, arguments}`) auf interne `ToolCall`-Struktur, generiert synthetische IDs für Anthropic-Roundtrips (Anthropic-Tool-Use folgt später).
- **`main/telegram/agent/`** — neue Module: `loop.ts` (Iterations-Loop mit Progress-Callback + Confirm-Hook + dynamisch gebauter System-Prompt mit Anti-Pseudo-JSON-Regel), `confirm.ts` (Promise-Registry für Pending-Confirmations, Timeout-getrieben), `tools/registry.ts` (zentraler Katalog mit `isWrite`-Flag), `tools/notes.ts`, `tools/tasks.ts`, `tools/calendar.ts`. Path-Traversal-Schutz in jedem Schreib-Tool über `resolveInVault`-Check.

### Repo
- Untracked `pitch-infografik-briefing.md` ist außerhalb dieses Releases.

## [0.5.18-beta] - 2026-04-27

### Features
- **Teilnehmerliste herunterladen** — neuer Button im Veranstaltungs-Dashboard (expandiertes Offer) erzeugt eine vorausgefüllte Anwesenheitsliste als `.docx` auf Basis der gebündelten Schulamt-Vorlage (Staatliches Schulamt für den Landkreis Gießen und den Vogelsbergkreis). Befüllt werden Veranstaltungstitel (Zeilenumbruch nach „Teilnehmerliste für die AG:"), Ort, LA-Nummer, Schuljahr (automatisch aus dem ersten Termin abgeleitet), Sitzungstermine und alle Teilnehmer (Name, Vorname, Personalnummer, Schule). Beide Form-Kopien der Vorlage werden identisch befüllt.
- **Sitzungstermine pro Offer aus edoobox** — neuer `listDatesForOffer`-Service-Call (`/v2/date/list?filter=offer=…`) liefert alle Termine eines Angebots für die Spaltenüberschriften der Teilnehmerliste.
- **Personalnummer und Schule aus edoobox** — `listBookingsForOffer` extrahiert jetzt zusätzlich `data_1` (Schule) und `data_2` (Personalnummer) aus dem User-Profil und reicht sie an Buchungen + Teilnehmerliste durch.

### Improvements
- **Teilnehmer alphabetisch sortiert** — Buchungen in der Anwesenheitsliste werden nach Nachname (`localeCompare` mit deutscher Collation) sortiert.
- **Stornierte Buchungen werden ausgeblendet** — `listBookingsForOffer` überspringt Buchungen mit `canceled: true`. Dashboard-Liste, Teilnehmerzähler und Teilnehmerliste-DOCX zeigen nur noch aktive Anmeldungen, was die Inkonsistenz zwischen Belegungs-Ring (z. B. 6/15) und sichtbarer Teilnehmerzahl behebt.

## [0.5.17-beta] - 2026-04-26

### Security
- **File-System-IPC gegen Renderer-Kompromittierung gehärtet** — die FS-Handler (read-file, write-file, delete-*, rename-file, move-file, etc.) nahmen vorher beliebige absolute Pfade vom Renderer entgegen. Ein kompromittierter Renderer (XSS in fremder Markdown, kompromittiertes npm-Paket, Mermaid-/KaTeX-Bypass) hätte ~/.ssh, Browser-Cookies oder beliebige Dateien lesen/schreiben können. Neue Defense-in-Depth-Schicht: zentrale Whitelist `approvedVaultRoots`, befüllt nur über vom Benutzer bestätigte Aktionen (OS-Dialog, persistierte Settings); `assertSafePath` löst Symlinks via `realpath` und prüft jeden Pfad gegen die Whitelist; `assertApprovedVault` schützt vault-relative Handler. `set-last-vault` lehnt nicht-bestätigte Pfade ab — Renderer kann sich nicht selbst Pfade approven. Vault-Roots können nicht via `delete-directory`/`delete-files` gelöscht werden. Patches in ~50 IPC-Handlern.
- **Vault-relative IPC-Pfade härter validiert** — wo der Renderer einen relativen Sub-Pfad vorgibt (Email-Inbox-Ordner, Readwise-Sync-Folder, Office-Import-Targetfolder, .attachments), wurde `path.join` durch `validatePath` ersetzt. Schließt Path-Traversal über den relativen Parameter (`../../etc`).
- **Activation-Codes atomar claimen** — Validierung und Claim erfolgten zweistufig, zwei parallele Connects konnten denselben Sync-Code beanspruchen. Jetzt atomar in einem `UPDATE` mit Bedingung; Code wird nach Claim deaktiviert.
- **Sync-Speicherlimit bei Datei-Updates** — das 5-GB-Vault-Limit verglich `currentSize + neueGröße` ohne die alte Größe abzuziehen, sodass legitime Updates nahe am Limit fehlschlagen konnten. Jetzt: `currentSize - oldSize + neueGröße`.

### Sonstiges
- Lizenz von MIT auf AGPL-3.0-or-later geändert.

## [0.5.16-beta] - 2026-04-24

### Features
- **Neuer Settings-Tab „Zugangsdaten"** — zentrale Übersicht aller gespeicherten Credentials (API-Keys, IMAP/SMTP-Passwörter, Bot-Tokens etc.) mit direkter Navigation zum jeweiligen Settings-Tab

### Fixes
- **Neuanmeldungen aus edoobox im Dashboard** — das Booking-Widget blieb leer, weil `loadDashboard()` zwar die Angebote, nicht aber die zugehörigen Buchungen geladen hat (Bookings wurden bisher nur on-demand beim Aufklappen eines Offers im AgentPanel gefetched). Jetzt werden für alle aktiven Offers mit `bookingCount > 0` und End-Datum innerhalb der letzten 30 Tage die Buchungen parallel nachgeladen, sobald Dashboard oder Morning-Briefing geöffnet wird. Die Ansicht zeigt alle aktiven Anmeldungen der letzten 14 Tage; stornierte Buchungen werden ausgefiltert

### Improvements
- **Telegram-Bot in Hilfe-Graph und Website dokumentiert** — neuer Hilfe-Eintrag erklärt die Bot-Commands; die Website listet den Telegram-Bot als Feature

## [0.5.15-beta] - 2026-04-22

### Features
- **Priorisierte Ordner im Telegram-Bot** — neues Setting im Telegram-Tab: ein oder mehrere Vault-Ordner (z. B. deine Inbox `000 - 📥 inbox/010 - 📥 Notes`), deren Notizen automatisch Kontext für `/ask` liefern — unabhängig davon, ob deine Frage passende Keywords enthält. Autocomplete mit allen Vault-Ordnern als Vorschlag
- **Neuer Command `/inbox`** — listet die 10 zuletzt geänderten Notizen aus den priorisierten Ordnern mit Titel, Pfad und Alter („heute", „gestern", „vor 3d"). Ohne konfigurierte Ordner gibt der Bot einen freundlichen Hinweis, wie man sie einträgt
- **Priority-Notizen fließen automatisch in `/ask` ein** — Excerpts (je ~800 Zeichen) der neuesten Priority-Notizen werden als Block „PRIORISIERTE NOTIZEN" in den LLM-Kontext eingebettet, zusätzlich zur normalen Keyword-Suche

## [0.5.14-beta] - 2026-04-22

### Features
- **Kalender im Telegram-Bot** — neuer Command `/agenda` zeigt Termine für heute und morgen aus dem macOS-Kalender, gruppiert nach Tag mit Uhrzeit und Ort
- **Kalender-Kontext in `/briefing` und `/ask`** — das Morning-Briefing enthält jetzt automatisch heutige + morgige Termine. Freie Fragen via `/ask` kennen zusätzlich die Agenda der nächsten 7 Tage, sodass Fragen wie „was steht nächsten Mittwoch an?" auch Kalender-Termine mit einbeziehen. Fehlt der macOS-Kalender-Zugriff, weist der Bot freundlich auf „Dashboard → Kalender → Zugriff erteilen" hin

### Improvements
- **Kalender-Service als Shared Module** — die Swift-/EventKit-Logik wurde aus `calendar-get-events` in `main/calendar/calendarService.ts` extrahiert, damit Dashboard und Telegram-Bot die gleiche Implementierung nutzen. Weniger Code-Duplikation, einheitliches Permission-Handling

## [0.5.13-beta] - 2026-04-22

### Fixes
- **Timeblocking-Fehler „Command failed: swift -e …" bei Erstnutzung** — der Timeout beim Event-Erstellen war mit 15 Sekunden zu knapp: wenn beim allerersten Timeblock der macOS-Permission-Dialog auftauchte, wurde der Swift-Prozess gekillt bevor der User reagieren konnte. Timeout auf 120 Sekunden erhöht (entspricht dem von `calendar-request-access`)
- **Klartextverständliche Fehlermeldungen im Kalender-Code-Pfad** — statt der rohen Node-Fehlermeldung mit dem kompletten Swift-Quellcode zeigt MindGraph jetzt kontextsensitive Hinweise: „Kalender-Dialog wurde nicht rechtzeitig beantwortet" bei Timeout, „Xcode Command Line Tools fehlen" bei `xcode-select`-/ENOENT-Fehlern, oder den Verweis auf Dashboard → „Zugriff erteilen" für den generischen Fall

## [0.5.12-beta] - 2026-04-22

### Features
- **Telegram-Bot für Vault-Zugriff von unterwegs** — Fragen stellen, Tasks abfragen und Morning-Briefings direkt in Telegram empfangen. Bot läuft lokal im Electron-Main-Prozess (grammy), Daten verlassen den Rechner nicht. Neuer Settings-Tab „Telegram" mit Bot-Token (verschlüsselt via `electron.safeStorage`), Whitelist-Chat-IDs, LLM-Backend-Auswahl und Discovery-Mode zum Ermitteln der eigenen Chat-ID
- **Telegram-Commands** — `/today` / `/todos` für heute fällige Tasks, `/overdue` für überfällige, `/week` für die nächsten 7 Tage, `/briefing` für ein LLM-generiertes Morning-Briefing (Tasks + relevante Emails), `/ask <frage>` für freie Fragen mit Vault-Kontext. Freier Text wird automatisch als `/ask` behandelt
- **Anthropic-API-Integration** — neuer unified Chat-Client (`main/llm/chatClient.ts`) mit Ollama + Anthropic und „Auto"-Fallback (Ollama bevorzugt, Anthropic wenn nicht erreichbar). Unterstützt Opus 4.7, Sonnet 4.6 und Haiku 4.5. API-Key verschlüsselt via safeStorage

### Improvements
- **Kalender-Permission-Fix im Dashboard** — bisher konnte der Permission-Dialog beim ersten Dashboard-Aufruf nicht zuverlässig erscheinen; der Zugriff wurde oft erst über das Timeblocking-Feature getriggert und das Widget zeigte stumm „Keine Termine". Jetzt unterscheidet `calendar-get-events` zwischen „leer" und „kein Zugriff", und das Widget zeigt bei fehlendem Zugriff einen expliziten **„Zugriff erteilen"**-Button mit kontextueller Fehlermeldung (z. B. Hinweis auf Systemeinstellungen bei persistenter Ablehnung)
- **Shared Task-Extractor** — `extractTasks()` und Types `ExtractedTask` / `TaskSummary` wurden aus `renderer/utils/linkExtractor.ts` nach `shared/taskExtractor.ts` verschoben und vom Renderer re-exportiert. Damit können auch Main-Prozess-Komponenten (z. B. der Telegram-Bot) Task-Parsing ohne Code-Duplikation nutzen

### Fixes
- **Neuer `calendar-request-access`-IPC** — triggert den macOS-Kalender-Permission-Dialog aktiv und wartet bis zu 2 Minuten auf die User-Reaktion. Unterscheidet zwischen `granted`, `alreadyGranted`, `denied`, `deniedPersistent` (nur via Systemeinstellungen lösbar) und liefert der UI klare Status-Codes

## [0.5.11-beta] - 2026-04-21

### Features
- **Neues Modul „Sprache" (opt-in)** — Vorlesen (TTS) und Diktieren (STT) in Editor, Preview und Flashcards. Aktivierbar in Einstellungen → Module. Eigener Settings-Tab „Sprache" mit Engine-Auswahl, Voice/Rate/Pitch, Whisper-Konfiguration und Flashcard-Auto-Play
- **TTS-Engine „System-Stimmen"** — nutzt die lokalen OS-Stimmen (macOS Siri-Voices, Windows SAPI, Linux speech-dispatcher) über die Web Speech API. Keine Cloud, keine Latenz
- **TTS-Engine „ElevenLabs"** — hochwertige Cloud-Stimmen (v. a. für Deutsch) über api.elevenlabs.io. API-Key wird via `electron.safeStorage` verschlüsselt lokal abgelegt, nie an Dritte gesendet. Stimmen-Liste wird on-demand geladen und nach Kategorie gruppiert (Premade / Professional / Instant Clone / Voice Design), damit Plan-Beschränkungen sofort sichtbar sind. Wählbare Modelle `multilingual v2`, `turbo v2.5`, `flash v2.5` plus Stability/Similarity-Slider
- **STT mit Whisper** — Diktat per MediaRecorder (WebM/Opus) im Renderer, Transkription durch die Whisper-CLI im Main-Process. Auto-Detect von `whisper` (openai-whisper) und `whisper-ctranslate2` im erweiterten PATH (inkl. Homebrew, pip, pyenv), alternativ absoluter Pfad im Settings-Feld. Sprache wählbar (Auto/de/en/fr/es/it), Modell zwischen `tiny` und `large`
- **Vorlese-Button im Preview** — schwebender, sticky Button rechts oben im Preview-Modus. Mit Text-Selektion liest er die Auswahl, ohne Selektion die ganze Notiz. Beim Scrollen bleibt er sichtbar
- **Vorlese- & Diktier-Buttons in der Editor-Toolbar** — Lautsprecher liest Selektion oder gesamte Notiz, Mikrofon startet/stoppt das Diktat und fügt das Transkript an der Cursor-Position ein. Buttons erscheinen nur, wenn das Sprache-Modul aktiv ist
- **TTS in Flashcards** — Play-Button an Vorder- und Rückseite, optionales Auto-Vorlesen beim Kartenwechsel (Setting)
- **Voice-Status-Toast** — schwebende Benachrichtigung unten rechts mit Transkriptions-Spinner, Fehlermeldungen und „Zu den Sprach-Einstellungen"-Link bei fehlenden Abhängigkeiten

### Improvements
- **Audio-Pegel-Check vor Transkription** — AudioContext-Analyser misst während der Aufnahme den RMS-Peak. Stille Aufnahmen (unter Schwelle) werden nicht an Whisper geschickt, sondern zeigen direkt eine Fehlermeldung mit Device-Namen aus macOS — vermeidet minutenlange Whisper-Läufe ohne Ergebnis
- **ffmpeg-Check im Main** — Whisper braucht ffmpeg zum Dekodieren von WebM; fehlt es, läuft Whisper normalerweise still durch und liefert leeres Transkript. Der neue Check gibt stattdessen eine klare Installations-Anweisung aus
- **Markdown-zu-Sprechtext** — strippt Code-Blöcke, Wikilinks, Callout-Syntax, Frontmatter und Listenmarker, damit TTS keine „Sternchen Raute Klammer"-Geräusche mehr produziert
- **CSP erweitert um `media-src blob: data:`** — `<audio>`-Wiedergabe von synthetisiertem ElevenLabs-MP3 funktioniert jetzt zuverlässig ohne „Media load rejected by URL safety check"-Fehler
- **Debug-Logging für Voice-Pipeline** — Main loggt Whisper-Start/-Finished mit Dauer, stderr, Transkript-Preview und Device-/Blob-Metadaten; Renderer loggt MediaRecorder-Events. Bei leerer Transkription bleibt die WebM-Aufnahme für manuelle Inspektion erhalten

### Fixes
- **`MEDIA_ERR_SRC_NOT_SUPPORTED` bei Vorlesen** — Audio-Handler (`onplay`/`onended`/`onerror`) werden jetzt vor dem Dispose genullt, damit das Pausieren kein Fehler-Event mehr triggert und der nächste Vorlese-Aufruf sauber startet
- **Transkription fügte bei Stille nichts ein, ohne Rückmeldung** — jetzt gibt's einen klaren Toast „Keine Sprache erkannt" bzw. „Kein Audio erkannt" mit Device-Name, statt den User rätseln zu lassen

## [0.5.10-beta] - 2026-04-21

### Features
- **Neues „Nur ansehen"-Profil im Onboarding** — reiner Viewer-Modus für alte Laptops. Schaltet alle schweren Features aus (KI, Email, Agent, Dashboard, Transport, Sync, Flashcards, LanguageTool, Readwise, reMarkable, Docling, Vision OCR), Preview ist Standard. Im Vault-Step wird statt „Starter-Vault erstellen" direkt „Bestehenden Ordner öffnen" angeboten — ideal um GitHub-Repos oder beliebige Markdown-Ordner schnell anzusehen
- **Code-Viewer mit Syntax-Highlighting** — `.py`, `.js`, `.ts`, `.go`, `.rs`, `.sh`, `.json`, `.yaml`, `.sql` und ~20 weitere Sprachen öffnen sich als neuer Tab direkt im FileTree. Read-Only, mit Zeilennummern, Sprach-Badge, Kopieren-Button und GitHub-Light / VS-Code-Dark+-Farben abhängig vom App-Theme. Ignoriert automatisch `node_modules`, `.git`, `dist`, `build`, `__pycache__`, `.venv` etc.
- **„In VS Code öffnen"** — Button im CodeViewer-Header und Rechtsklick-Eintrag im FileTree für Code-Dateien. Nutzt `code` CLI mit erweitertem PATH (macOS, Linux, Windows), Fallback über `vscode://file`-Protocol
- **Zotero als offizielles Modul** — in Kategorie „Forschung & Wissen" mit rotem Z-Badge im Modul-Tab. Titlebar-Button öffnet die Zotero-Suche (⌘⇧Z) nur noch wenn das Modul aktiv ist
- **Quick-Capture-Button in der Titlebar** — „+"-Icon rechts neben dem Zahnrad öffnet das Schnellerfassungs-Fenster aus der App heraus. Aktivierbar in Einstellungen → Schnellerfassung
- **Aufgaben & Termine als echtes Task-Panel** — bisher nur Read-only Anzeige, jetzt voll editierbar: Checkbox toggelt `[ ]`/`[x]` direkt in die Ursprungsnotiz, Inline-Edit von Text und Datum (datetime-local-Picker), Tag-Chips mit Autocomplete aus allen Vault-Tags, „+"-Button zum Anlegen neuer Aufgaben (Ziel: Daily Note / Inbox / bestehende Task-Notizen). Neue Sektion „Ohne Datum" für Inbox-artige Tasks. Konfliktschutz: zwischenzeitliche Änderungen an der Notiz werden erkannt
- **Shortcut-Recorder für Schnellerfassung** — im Settings-Feld „Tastenkürzel" kann man jetzt einfach die gewünschte Kombination drücken statt den Electron-Accelerator manuell einzutippen. Live-Feedback ob die Kombi vom OS akzeptiert wurde (rot = bereits vergeben, grün = aktiv). Escape bricht ab
- **Onboarding-Neustart-Button** — im Hilfe-Graph oben rechts ein neuer „Onboarding neu starten"-Button, der das Profil zurücksetzt und den Einrichtungs-Assistenten wieder öffnet (zusätzlich zum bestehenden ⌘⇧O-Shortcut)

### Improvements
- **Schnellerfassung (ehemals „Transport") plattformübergreifend** — `setupTray()` läuft jetzt auf Linux/Windows, nicht nur macOS. Tray-Erstellung ist robust gegenüber Desktops ohne StatusNotifier/AppIndicator (Cinnamon etc.) — globaler Shortcut wird auch ohne Tray-Icon registriert
- **Konsistente Benennung „Schnellerfassung"** — in allen UI-Texten (Settings-Tab, Titlebar-Tooltip, Help-Graph-Node, Tray-Menü, Fenster-Titel). Interne Code-IDs bleiben `transport` für Rückwärtskompatibilität
- **Module-Tab ist jetzt die einzige Aktivierungsstelle** — Integrations- und Agenten-Tab haben keine Enable-Toggles mehr, zeigen stattdessen einen „Modul deaktiviert → Zum Modul-Tab"-Hinweis wenn das Modul aus ist. Redundante Toggle-Only-Sektionen (Notes Chat, Flashcards, Semantic Scholar) wurden aus Integrations entfernt
- **Zielordner-Picker in Schnellerfassungs-Settings** — statt Pfad eintippen gibt's jetzt ein Dropdown mit allen Vault-Unterordnern. Standard-Zielordner-Auswahl kombiniert konfigurierte Destinations + alle Vault-Ordner. Schema-Migration von `defaultDestinationIndex` → `defaultDestinationFolder`
- **Quick-Capture-Fenster ist immer ein Popover** — `fullscreenable: false`, `maximizable: false`, `minimizable: false` plus Sicherheitsnetz bei Maximize/Fullscreen durch den Window-Manager (Cinnamon Super+Up etc.)
- **Inline-Tags für Tasks** — `#tag`-Syntax in der Task-Zeile wird separat vom Text erkannt und als Chip auf der Karte angezeigt. `buildTaskLine()`-Helper im `linkExtractor` baut Task-Markdown konsistent mit Einrückung, Listen-Marker, Tags und Datum
- **Sidebar-Shortcut-Konflikt gefixt** — Ctrl/Cmd+N triggert „Neue Notiz" nur noch ohne zusätzliches Shift/Alt, kollidiert nicht mehr mit globalen Schnellerfassungs-Kombinationen wie Ctrl+Shift+N
- **FileTree ignoriert Code-Junk-Ordner** — `node_modules`, `.git`, `.next`, `dist`, `build`, `target`, `.turbo`, `__pycache__`, `.pytest_cache`, `.venv`, `.idea`, `.vscode` werden beim Vault-Laden komplett übersprungen — GitHub-Repos bleiben übersichtlich

### Fixes
- **Schnellerfassungs-Shortcut wurde ignoriert** — gespeicherter Shortcut aus den Settings wurde beim App-Start nie gelesen (Hardcode auf `Ctrl+Shift+N`), und Settings-Änderungen wurden nicht an den Main-Prozess weitergereicht. Jetzt: initiales Laden aus UI-Settings + IPC-Handler `transport-update-shortcut` für Live-Updates
- **„Nur Standard-Zielordner" leer**, wenn keine Destinations konfiguriert — Dropdown kombiniert nun Destinations + Vault-Subdirs und enthält immer wählbare Optionen
- **Auto-Mode `maximize` / `fullscreen`** für Quick-Capture-Fenster blockiert (Cinnamon / Windows-Snap-Layouts)

## [0.5.9-beta] - 2026-04-20

### Features
- **Emails im Dashboard als erledigt markieren** — im Widget "Zu beantworten" erscheint beim Hover ein grüner Häkchen-Button, mit dem eine Mail sofort aus der Liste genommen werden kann (z. B. wenn sie telefonisch beantwortet wurde). Der Status wird persistent in `emails.json` gespeichert (`analysis.replyHandled`) und bleibt auch nach einer KI-Reanalyse erhalten
- **Toggle in der Inbox-Detail-Ansicht** — Button "Als erledigt markieren" neben Antworten/Diskutieren. Erledigte Mails zeigen statt des roten/orangefarbenen "Antwort erwartet"-Badges einen grünen "Erledigt"-Badge. Toggle-Verhalten: Klick rückgängig machen macht sie wieder unerledigt

## [0.5.8-beta] - 2026-04-20

### Features
- **Notizen direkt in WordPress veröffentlichen** — neuer **WP**-Button im Editor-Header (neben PDF/DOCX) öffnet einen Publish-Dialog mit Titel (aus Frontmatter oder Notiz-Titel), Status-Auswahl (Entwurf/Veröffentlichen) und HTML-Vorschau. Referenzierte Bilder (Obsidian `![[…]]` und Standard `![](…)`) werden automatisch in die WP-Medienbibliothek hochgeladen und URLs ersetzt. Button erscheint nur bei aktivem Marketing-Modul + konfigurierter WordPress-URL
- **KI-Funktionen im Rechtsklick-Kontextmenü** — der AI-Assistent (Übersetzen, Zusammenfassen, Fortsetzen, Verbessern, eigener Prompt), bisher nur über Cmd+Shift+A erreichbar, taucht jetzt als erster Eintrag (🤖 KI-Assistent) im Format-Menü auf, wenn Text selektiert ist und Ollama aktiv. Alt+Rechtsklick öffnet weiterhin direkt das AI-Menü

## [0.5.7-beta] - 2026-04-19

### Features
- **Canvas → MindGraph umbenannt** — konsistentes Branding in der gesamten UI (View-Mode-Button, Settings-Tab, Help-Tab, Context-Menü "Im MindGraph erkunden", Tab-Prefix "MindGraph: Notiz", Mission "MindGraph öffnen"). Code-interne Identifier (`viewMode: 'canvas'`, `type: 'canvas'`, `GraphCanvas`-Komponente) bleiben unverändert — kein Migrations-Aufwand
- **Logo-Konsistenz** — View-Mode-Button und HelpGuide-Zentrum nutzen jetzt dasselbe 8-Knoten-Netzwerk-Muster wie das App-Icon/Titlebar-Logo. Vorher: 3-Kreise-Dreieck bzw. ⌘-artiges 4-Ecken-X — jetzt einheitlich

### Fixes
- **MindGraph-Ansicht öffnet nicht bei aktivem Dashboard-Tab** — Canvas-Panel wurde explizit ausgeblendet, wenn `activeTab.type === 'dashboard'`. Klick auf den MindGraph-Button im Titlebar hatte keinen sichtbaren Effekt. Fix: `viewMode === 'canvas'` blendet jetzt den Editor-Bereich (inkl. Dashboard) zuverlässig aus; Split-Modus zeigt Dashboard links + Graph rechts

## [0.5.6-beta] - 2026-04-19

### Fixes
- **Kalender-Zugriff auf macOS 14+** — `NSCalendarsUsageDescription` + `NSCalendarsFullAccessUsageDescription` (und Reminders/AppleEvents) in `extendInfo` ergänzt. Ohne diese Strings zeigte macOS den Permission-Prompt stumm nicht an, die App erschien nicht in der Privacy-Liste — Dashboard-Kalender und Timeblocking blieben stumm. Nach dem Update erscheint beim ersten Kalender-Zugriff der Prompt, und MindGraph Notes taucht in Systemeinstellungen → Datenschutz → Kalender auf
- **Timeblock-Handler**: Swift-Helper prüft jetzt `authorizationStatus` vor dem Request, unterscheidet sauber zwischen `fullAccess` / `writeOnly` / `notDetermined` / `denied`, gibt `needsPermission`-Flag zurück
- **Timeblock-Modal** zeigt bei verweigertem Zugriff einen "Systemeinstellungen öffnen"-Button, der direkt zum Kalender-Privacy-Panel springt

## [0.5.5-beta] - 2026-04-19

### Features
- **Dashboard als Tab-Typ** — neuer zentraler Workspace-View neben Editor/Split/Canvas, nicht mehr rechts-Panel
  - Vier Kern-Widgets: Aufgaben (überfällig/heute/Woche), Zu beantworten (Emails mit KI-Urgency), Kalender (EventKit), Neue Anmeldungen (edoobox)
  - Responsive Grid (auto-fit), Refresh-Button, Click-to-navigate zu Notizen
  - Konfigurierbare Widget-Reihenfolge + Sichtbarkeit im neuen Settings-Tab
- **Morning Briefing** — einmal pro Tag beim App-Start als Modal mit Tages-Überblick (Tasks / Emails / Termine / Anmeldungen). Deaktivierbar, `lastBriefingDate`-Tracking
- **Heute im Fokus + Timeblocking** — neues Focus-Widget mit Top-5 Tasks (kritisch > überfällig > heute) + dynamischer Tages-Narrative
  - Pro Task ein **"Zeit blocken"-Button** → Modal mit Dauer-Pills (30/45/60/90/120 min) und automatisch vorgeschlagenem nächsten freien Kalender-Slot
  - Neuer IPC-Handler `calendar-create-event` via EventKit-Swift-Helper
- **Modul-Konzept (Kern vs. Plugins)** — Dashboard, Editor, Wissensgraph, Tasks, Templates, Transport, Sync sind Kern; 11 weitere Module (Email, MZ-Suite, Flashcards, Smart Connections, Notes-Chat, LanguageTool, Semantic Scholar, Readwise, reMarkable, Docling, Vision OCR) sind aktivierbar
  - Neuer Settings-Tab "Module" mit Toggle-Liste gruppiert nach 7 Kategorien
  - Modul-spezifische Config-Tabs (Medienzentrum, reMarkable) nur sichtbar wenn Modul aktiv
- **Settings-Navigation neu strukturiert** — Sections "Grundlagen", "Workflow", "Module" mit visuellen Labels; "Automationen" umbenannt zu "Medienzentrum"
- **Onboarding 4-Schritte-Flow** — Welcome → Intent → AI → **Dashboard-Setup (neu)** → Missions. Widgets und Morning-Briefing werden direkt beim Setup konfiguriert, mit Profil-abhängigen Defaults
- **HelpGuide erweitert** — neue Knoten für Dashboard, Morning Briefing, Agent (bisher nur "Business"). Detail-Popup bekommt farbigen "Öffnen"-Button mit Deep-Link zum Feature oder Settings-Tab
- **Prompt-Injection-Schutz gehärtet** — Email-Analyse und Email-KI-Chat-Kontext werden jetzt HTML-/Control-Char-/Zero-Width-/Bidi-gestrippt und in `BEGIN_UNTRUSTED_CONTEXT`-Marker eingerahmt. System-Prompt weist das Modell explizit an, keine Instruktionen aus externen Mails zu befolgen
- **Website (mindgraph-notes.de) komplett aufgefrischt**
  - Neuer Hero mit Dashboard-Fokus ("Dein Tag im Blick. Dein Wissen verbunden.")
  - Stilisierter SVG-Screenshot als Hero-Visual (verlustfrei skalierend, Dummy-Daten)
  - Capability-Section von 6 auf 7 Karten — Dashboard als featured Kachel
  - Neue "Warum MindGraph?"-Section mit 4 USP-Vergleichskarten
  - Modul-Chip-Strip visualisiert Kern vs. Plugins
  - FAQ um Obsidian-Vergleich und Stabilitäts-Aussage erweitert
  - SEO: `featureList` im JSON-LD, og/twitter-Tags, title/description aktualisiert

### Improvements
- **TypeScript: 131 → 0 Errors** — kompletter Typecheck-Pass, @types/sql.js/mailparser/nodemailer + ambient-declarations für markdown-it-Plugins, ElectronAPI-Interface vervollständigt, ungenutzte Imports/Vars aufgeräumt
- **CI-Gate `tsc --noEmit`** — neuer `.github/workflows/typecheck.yml` läuft bei Push/PR; `prebuild`-npm-Hook verhindert Build mit TS-Errors; neues `npm run typecheck` Script
- **Dev-Erkundung**: tote Onboarding-Dateien entfernt (ProfileStep, VaultStep, FeaturesStep, AISetupStep) — nur noch aktive Schritte im Code

### Fixes
- **Kalender-Widget**: vergangene Events (dayOffset < 0) und Events mit ungültigem Datum werden korrekt herausgefiltert — keine "IN -3 TAGEN" oder "IN NAN TAGEN" mehr
- **reactflow Node-Type-Kollision** in GraphCanvas (target: e.target as `globalThis.Node`)
- **NodeChange-Union**: Typeguard bevor `change.id` gelesen wird
- **sync/fileTracker Dirent-Typkompatibilität** mit Node 20+
- **uiStore** `ACCENT_COLORS`/`BACKGROUND_COLORS`: fehlender `custom`-Eintrag ergänzt
- **PropertiesPanel**: `t(key, fallback)` → `t(key)` auf 6 Aufrufstellen (API-Drift)
- **Flashcards/Quiz MarkdownContent**: `vaultPath ?? undefined` gegen `null`-Typ-Mismatch
- **PDFViewer page.render** um fehlendes `canvas`-Param ergänzt
- **SmartConnectionsPanel**: `currentEmbedding` Typ auf `number[] | undefined` mit `?? undefined` statt `|| undefined`

## [0.5.4-beta] - 2026-04-17

### Improvements
- **IQ-Auswertung: Sortierung** — Vergangene Veranstaltungen werden jetzt nach Start-Datum absteigend sortiert (neueste zuerst) statt nach interner ID

## [0.5.3-beta] - 2026-04-17

### Features
- **IQ-Auswertung (Hessen)** — Neuer Tab im Agenten-Panel zum Erstellen der offiziellen IQ-Rückmeldung als .docx
  - Gebündelte Word-Vorlage (`iq-template.docx`) mit Platzhaltern und benannten FORMCHECKBOX-Formfields
  - Prefill aus edoobox: Titel, Beginn/Ende, Ort, LA-Nr. (Prefix automatisch entfernt), Teilnehmerzahl
  - Auswahl vergangener Veranstaltungen (Filter `date_end < heute`)
  - Editierbares Formular mit Evaluations-Checkboxen und "Download .docx"
  - Hessische Lehrkräfte werden automatisch mit der Gesamt-Teilnehmerzahl synchronisiert
  - Veranstaltungsnummer und Beitrag pro Teilnehmer verwenden `/` als Standard

### Improvements
- **edoobox Dashboard-Scope** — `listOffersForDashboard` akzeptiert jetzt `scope: 'active' | 'past' | 'all'` (IQ-Tab nutzt `past`, Dashboard + Marketing weiterhin `active`)
- **Präsenz-Feld auf Buchungen** — `EdooboxBooking.present?` kartiert `present` / `presence` / `attended` / `anwesend` Felder der Booking-Detail-API; rohe Feldnamen werden beim ersten Aufruf geloggt für spätere Auswertung

## [0.5.2-beta] - 2026-04-17

### Features
- **Email-Anhaenge** — Dateien an Emails anhaengen (Bueroklammer-Button in der Compose-Toolbar)
  - Mehrfachauswahl per nativem Datei-Dialog
  - Anhaenge-Liste mit Dateiname, Groesse und Entfernen-Button
  - Dateien werden als nodemailer-Attachments versendet
- **LanguageTool im Email-Compose** — Rechtschreib- und Grammatikpruefung direkt in der Compose-Ansicht
  - Stift-Button korrigiert alle Fehler sofort im Text (erster Vorschlag wird angewandt)
  - Korrigierte Stellen werden gruen hervorgehoben (blendet nach 4s aus)
  - Badge zeigt Anzahl der Korrekturen
- **Email-Antwort mit Zitat** — Beim Antworten wird die Original-Email zitiert
  - Zitat-Header mit Datum und Absender
  - Jede Zeile mit `>` zitiert (Standard-Email-Format)
  - Im HTML als gestylte Blockquotes mit grauer Linie

## [0.5.1-beta] - 2026-04-16

### Features
- **Interaktive Hilfeseite (Wissensgraph)** — Die Hilfe (⌘/) ist jetzt ein interaktiver Graph mit React Flow
  - Features als Knoten, Verbindungen zeigen Zusammenhaenge
  - Klick auf Knoten oeffnet Detail-Panel mit Beschreibung und Shortcuts
  - Knoten sind draggbar, zoombar, mit Kategorie-Farbcodierung
  - Ersetzt die bisherige statische "Erste Schritte"-Seite

### Improvements
- **Kategorie-Farben in der Titelleiste** — Titlebar-Buttons haben jetzt farbige Hover-Effekte die Feature-Gruppen visuell kennzeichnen
  - 🔵 Blau: Editor/Einstellungen
  - 🟣 Violett: KI-Features (Smart Connections, Notes Chat)
  - 🟡 Amber: Organisation (Tasks, Tags, Flashcards)
  - 🟢 Gruen: Integrationen (Email, Semantic Scholar, Terminal, edoobox)

## [0.5.0-beta] - 2026-04-16

### Features
- **Transport (Quick Capture)** — Schnelle Notizerfassung ueber die macOS-Menuleiste
  - **Tray-Icon** in der macOS-Menuleiste (immer sichtbar, Rechtsklick-Menue: Quick Capture / MindGraph oeffnen / Beenden)
  - **Schwebendes Capture-Fenster** (zentriert, always-on-top, schliesst bei Fokusverlust)
  - **Globaler Shortcut** `Cmd+Shift+N` — funktioniert auch wenn MindGraph nicht im Vordergrund ist
  - **Kategorie-System**: 🔴 Aktion, 🟢 Wissen, 🔵 Info (Emoji im Dateinamen)
  - **Tag-Auswahl** aus vordefinierten Tags + freie Tag-Eingabe direkt im Capture-Fenster
  - **Task-Einfuegung** mit Datum/Uhrzeit (`- [ ] Aufgabe (@[[YYYY-MM-DD]] HH:MM)`)
  - **Zielordner-Auswahl** — alle Vault-Unterordner rekursiv verfuegbar, konfigurierbare Favoriten in Settings
  - **YAML-Frontmatter** (title, date, tags, category) + Dateinamen-Format: `YYYYMMDDHHMM - {emoji} {Titel}.md`
  - **Auto-Oeffnung** der Notiz im Hauptfenster nach Transport
  - **Settings-Tab** fuer Zielordner, Tags und Shortcut-Konfiguration
  - Basiert auf der standalone Transport-App, jetzt vollstaendig in MindGraph integriert

## [0.4.8-beta] - 2026-04-16

### Improvements
- **Vision-Modell-Erkennung erweitert** — Qwen 3.x und Gemma 4 werden jetzt als Vision-faehige Modelle erkannt und im Vision-OCR-Dropdown angezeigt (vorher nur llava, glm-ocr, qwen2.x)

## [0.4.7-beta] - 2026-04-16

### Features
- **Ordner von Task-Zaehlung ausschliessen** — Rechtsklick auf Ordner im FileTree → „Von Task-Zaehlung ausschliessen". Ausgeschlossene Ordner werden in Header-Badge, Footer-Stats und OverduePanel ignoriert. Setting wird persistiert. Ideal fuer alte Archiv-Ordner mit vielen historischen Tasks.

### Fixes
- **Ueberfaellige Tasks: Badge-Zaehlung stimmte nicht mit OverduePanel ueberein** — Der gecachte `overdue`-Wert wurde zum Zeitpunkt des Notiz-Ladens berechnet und nie aktualisiert. Tasks die nach dem Laden ueberfaellig wurden, fehlten im Badge. Fix: Faelligkeitsdaten werden jetzt als ISO-Strings im Cache gespeichert und bei jedem Anzeigen live gegen das aktuelle Datum geprueft.
- **CI: Release-Step schlug seit v0.4.3 fehl** — `builder-debug.yml` und `latest-mac.yml` wurden von mehreren Plattform-Jobs mit identischem Namen hochgeladen, was zu GitHub API 404 fuehrte. Fix: `builder-debug.yml` ausgeschlossen, `latest-mac.yml` nur von einem Job uploaden.
- **CI: Apple Notarization repariert** — Abgelaufenes Developer Agreement verhinderte Notarisierung seit v0.4.3. DMGs sind jetzt wieder signiert und notarisiert.

## [0.4.6-beta] - 2026-04-15

### Features
- **Office-Formate** — Excel, Word und PowerPoint werden jetzt nativ unterstuetzt
  - 📊 **Excel (.xlsx, .xls)**: Eingebauter Sheet-Viewer mit Tab-Navigation pro Arbeitsblatt, „Als Markdown kopieren" und „In aktive Notiz einfuegen"
  - 📝 **Word (.docx)**: Sauberer Viewer mit mammoth-Rendering + DOMPurify-Sanitization, „Als Notiz importieren" (Bilder werden nach `.attachments/` extrahiert)
  - 📽️ **PowerPoint (.pptx)**: Slide-Navigator mit Texten, eingebetteten Bildern und Vortragsnotizen, „Als Slides-Notiz importieren"
  - **DOCX-Export**: Neuer Button im Editor-Header exportiert die aktuelle Notiz als `.docx`
  - **Wikilink-Embeds**: `![[datei.xlsx]]`, `![[datei.docx]]`, `![[datei.pptx]]` rendern klickbare Karten, die den jeweiligen Viewer oeffnen
  - **FileTree**: Office-Dateien bekommen eigene farbige Icons (XLS gruen, DOC blau, PPT orange)

### Improvements
- **DOCX-Import: Struktur-bewusster Parser** — statt flachem Text werden Formularfelder erkannt und in Obsidian-Callouts umgewandelt
  - Schattierte Word-Tabellenzellen werden basierend auf ihrer Hintergrundfarbe zu passenden Callouts (gruen → tip, blau → info, gelb → example, orange → warning, rot → danger)
  - Word-Titel-Style und bold+grosse Schrift werden als Heading-1/2 erkannt
  - Literale Bullet-Zeichen (`• ● ○ ▪`) werden in korrekte Markdown-Listen konvertiert
  - Leere „Ihre Eingabe"-Tabellen werden zu aufklappbaren Note-Callouts mit sichtbarem Platz zum Eintippen
  - Hyperlinks, Bold/Italic-Runs und eingebettete Bilder bleiben erhalten
  - Benachbarte Word-Runs mit gleicher Formatierung werden zusammengefuehrt (keine `**foo****bar**`-Artefakte mehr)

## [0.4.5-beta] - 2026-04-13

### Fixes
- **Sync: PDF-Korruption behoben** — Dateien wurden bei der Uebertragung abgeschnitten (truncated bei ~512KB), was 141 PDFs im Vault zerstoert hat
  - Server prueft jetzt beim Upload die Datenintegritaet (Groesse muss mit deklarierter Groesse uebereinstimmen)
  - Server liefert beim Download Hash und Groesse mit, damit der Client validieren kann
  - Client prueft nach Entschluesselung SHA-256-Hash und Dateigroesse — beschaedigte Dateien werden nicht mehr auf die Platte geschrieben
  - Caddy Reverse-Proxy: `flush_interval -1` fuer sofortige WebSocket-Durchleitung konfiguriert

### Improvements
- **Website Redesign** — Fokus auf Funktionen und Faehigkeiten, technische Dokumentation entfernt
- **Neuer Blog-Artikel** — "Weltmodelle, fragile Agenten und die Seele der Maschine"

## [0.4.4-beta] - 2026-03-27

### Fixes
- **Auto-Update funktioniert jetzt** — macOS Artifact-Name-Mismatch behoben (Punkte vs. Bindestriche in Dateinamen)
- **Herunterladen-Button im Update-Banner** reagiert jetzt korrekt (triggert Download oder oeffnet Release-Seite)

## [0.4.3-beta] - 2026-03-27

### Features
- **Apple Kalender Integration** — Email-KI prueft automatisch deine Kalender-Termine bei Terminanfragen
  - Liest Termine per Swift/EventKit direkt aus Apple Calendar (macOS)
  - Intelligente Filterung: nur relevante Termine (genannte Daten +/- 1 Tag, naechste 7 Tage)
  - KI erkennt Kalender-Konflikte und weist im Entwurf darauf hin
- **Rechtsklick-Kontextmenue** — Kopieren, Einfuegen, Ausschneiden, Alles auswaehlen in der gesamten App
- **Compose Formatierungs-Toolbar** — Fett, Kursiv, Aufzaehlung, Trennlinie beim Email-Verfassen
  - Markdown-artige Formatierung wird beim Senden in HTML konvertiert

### Improvements
- **Email-spezifischer KI-Prompt** — Eigener Modus fuer den Email-Chat mit klaren Anweisungen (fertige Entwuerfe, keine Platzhalter)
- **Ollama Streaming Timeout** — 5-Minuten-Timeout verhindert endloses "Denkt nach..." bei grossen Kontexten

### Fixes
- **CC-Empfaenger erhielten keine Emails** — CC-Adressen fehlten im SMTP-Envelope
- **Reply-Badge Tooltip abgeschnitten** — Von nativem `title` auf `data-tooltip` umgestellt
- **Sicherheitsfix: Kalender-Datums-Validierung** gegen Code-Injection im Swift-Template
- **npm Dependency Updates** — picomatch (ReDoS), tar (Path Traversal), nodemailer (SMTP Injection)

## [0.4.2-beta] - 2026-03-26

### Features
- **Smart Email Client** — Vom passiven Email-Reader zum kontextbewussten Email-Assistenten
  - **Emails senden** via SMTP (nodemailer) direkt aus der App
  - **Compose-View** im Apple-Mail-Stil mit Empfaenger-Autocomplete aus Kontakten
  - **Antworten-Button** in der Email-Detail-Ansicht — Reply mit vorausgefuelltem Betreff und Empfaenger
  - **KI-Chat** — Emails mit dem Ollama-Assistenten besprechen, Fragen stellen, Kontext verstehen
  - **Entwurf-Generator** — KI erstellt Antwortentwuerfe basierend auf dem vollen Kontext
  - **"Als Antwort verwenden"** — KI-Entwurf direkt in die Compose-View uebernehmen
  - **Kontext-Engine** — KI kennt: Vault-Notizen, edoobox-Veranstaltungen, Kontakt-Historie, offene Tasks
  - **Kontakt-Aggregation** — Automatische Zusammenfuehrung aus Email-Historie, edoobox-Buchungen, Vault-Wikilinks
  - **Signatur** mit Bild-Upload und Text (Bild wird als CID-Attachment in HTML-Email eingebettet)
  - **Absender-Konfiguration** — Name + E-Mail-Adresse pro Account
  - **"Antwort erwartet"**-Erkennung — KI markiert Emails die eine Antwort brauchen (rot/orange/blau je nach Dringlichkeit)
  - **Anhang-Erkennung** — Bueroklammer-Icon in der Liste mit Dateinamen
  - **"Original anzeigen"** — Aufklappbarer Originaltext unter der Analyse
- **Marketing-Tab** im AgentPanel — WordPress Publishing, Ollama Content-Generierung, Google Imagen Bilder

### Improvements
- **InboxPanel View-Switcher** — Drei Ansichten: Liste, Compose, KI-Chat ueber Header-Buttons
- **SMTP-Einstellungen** pro Email-Account (Host, Port, TLS)
- **Tooltips** fuer alle Inbox-Buttons mit korrekter Positionierung
- **Senden-Button** deutlich sichtbar in Blau (#2563eb)

## [0.4.1-beta] - 2026-03-25

### Features
- **edoobox Veranstaltungen anlegen** — DOCX-Akkreditierungsformulare importieren und direkt als Angebot in edoobox erstellen
  - Titel, Beschreibung, Termine, Ort, Teilnehmerzahl, Preis werden automatisch aus dem Formular extrahiert
  - Editierbare Felder im AgentPanel nach Import — alle Werte vor dem Senden anpassen
  - Kategorie-Dropdown mit edoobox-Kategorien
  - Korrekte API V2-Integration: Offer + Place + Beschreibungstext (HTML) + Termine
- **edoobox Booking-Dashboard** — Alle Angebote mit Anmeldezahlen auf einen Blick
  - Occupancy-Donut-Charts pro Angebot (gruen/gelb/rot je nach Auslastung)
  - Aufklappbare Teilnehmerlisten mit Name, E-Mail und Buchungsdatum
  - Neuanmeldungen der letzten 7 Tage hervorgehoben mit Badge und Dot
  - Tab-Switcher: Import | Dashboard
  - edoobox-Logo im Dashboard-Header und in den Settings

### Improvements
- **Vereinfachte edoobox-Settings** — Nur noch API Key und Secret, kein Webhook/API-Version/Base-URL mehr
- **Website** — Ueberarbeitete Startseite mit verbessertem Messaging, FAQ-Sektion und Agenten-Feature

## [0.4.0-beta] - 2026-03-22

### Features
- **macOS Auto-Update** — Updates werden automatisch im Hintergrund heruntergeladen und per Klick auf "Neu starten" installiert
  - Nutzt `electron-updater` mit GitHub Releases als Provider
  - Fortschrittsanzeige waehrend des Downloads
  - Drei Zustaende in der UI: "Update verfuegbar" → "Wird heruntergeladen..." → "Jetzt neu starten"
  - Windows/Linux behalten den manuellen Download-Link (kein Code Signing vorhanden)
  - `publish`-Config in package.json fuer automatische Update-Erkennung

### Improvements
- **Update-Benachrichtigung** — Komplett ueberarbeitet mit dynamischen Icons (Info → Download → Checkmark) und kontextsensitiven Buttons

## [0.3.8-beta] - 2026-03-21

### Features
- **Neues Onboarding (komplett ueberarbeitet)** — 4 Schritte statt 5, fokussiert auf Aha-Momente
  - **Intent-Step**: 5 Nutzerprofile (Student, Researcher, Professional, Writer, Developer) mit Feature-Badges, Profil- und Vault-Auswahl auf einer Seite
  - **KI-Features-Step**: Feature-orientierte Darstellung ("Quiz generieren, mit Notizen chatten, Texte verbessern") statt technischem "Integrationen pruefen"
  - **Missions-Step**: Interaktive Checkliste ("Notiz erstellen, verlinken, Canvas oeffnen") ersetzt den statischen Icon-Dump
  - **Welcome-Screen**: Neuer Untertitel "Dein Wissen vernetzen. Lokal. Privat. Mit KI." mit animiertem Graph-Logo
- **Erweiterter Starter Vault** — 12 statt 5 Dateien, alle untereinander verlinkt
  - Neuer Schnellstart-Ordner mit 4 Anleitungen (Erste Schritte, Verlinken, Canvas, KI-Features)
  - Hub-Notiz "Wissensnetz" verlinkt auf alle Notizen — Stern-Graph im Canvas beim ersten Oeffnen
  - Markdown Showcase (Tabellen, Callouts, LaTeX, Mermaid, Code) und Projektplanung (Tasks mit Datum)
  - Komplett bilingual (DE + EN)

### Improvements
- **Vault-Wechsel nach Onboarding** — Sidebar laedt jetzt den im Onboarding gewaehlten Vault korrekt, auch nach Reset via Shift+Cmd+O
- **Profil-Migration** — Alte Profilnamen (schueler/studium/wissensmanagement) werden automatisch auf neue Namen migriert
- **Help Guide** nutzt jetzt die Missions-Checkliste statt den alten Feature-Guide

## [0.3.7-beta] - 2026-03-13

### Features
- **Tooltip-System** — Alle Icon-Buttons zeigen jetzt beim Hover einen gestylten Tooltip mit Beschreibung
  - CSS-basiertes Tooltip-System mit Akzentfarben-Styling
  - Automatische Positionierung (nach unten für Titlebar/Toolbar, nach oben für Panels)
  - Randkorrektur für Buttons am linken/rechten Bildschirmrand
  - Alle hardcodierten deutschen Tooltip-Strings durch i18n-Keys ersetzt (DE + EN)
- **Vault-Settings** — Neuer Settings-Tab "Vault" zur Feature-Steuerung pro Vault
  - Daily Note, Readwise, E-Mail, edoobox Agent und reMarkable einzeln pro Vault aktivierbar
  - Deaktivierte Features werden ausgegraut mit Hinweis zur globalen Konfiguration
  - Einstellungen werden in `.mindgraph/vault-settings.json` gespeichert

### Improvements
- **Settings-Persistenz verbessert** — Deep-Merge beim Laden von Settings, sodass neue Sub-Properties aus Updates nicht verloren gehen
  - Merge-Strategie statt Überschreiben beim Speichern (verhindert Datenverlust)
  - Guard verhindert Speichern bevor Settings geladen wurden (Race-Condition-Fix)

## [0.3.6-beta] - 2026-03-12

### Features
- **Faltbare Callouts** — Obsidian-kompatible ein-/ausklappbare Callouts mit `+` und `-` Modifier
  - `> [!note]+` — faltbar, standardmäßig offen
  - `> [!note]-` — faltbar, standardmäßig geschlossen
  - Animierter Pfeil-Indikator im Titel
  - Funktioniert in Preview-Ansicht via `<details>`/`<summary>` HTML-Elemente
  - Live-Preview zeigt Fold-Indikator (▼/▶) im Editor
- **Verschachtelte Callouts** — Callouts können jetzt ineinander verschachtelt werden (z.B. `> > [!warning]` innerhalb eines `> [!note]`)
- **Markdown im Callout-Titel** — Titel unterstützen jetzt Inline-Markdown (fett, kursiv, Code, Links etc.)

## [0.3.5-beta] - 2026-03-12

### Features
- **Tägliche Notiz (Daily Note)** — Neuer Button in der Sidebar (neben der Suche) zum schnellen Erstellen/Öffnen der täglichen Journal-Notiz
  - Nutzt das Template-System: Built-in Templates (Daily Note, Zettel, Meeting) und eigene Custom Templates wählbar
  - Konfigurierbares Datumsformat (DD.MM.YY, YYYY-MM-DD, etc.) für den Dateinamen
  - Konfigurierbarer Speicherort im Vault
  - Eigener Einstellungs-Tab "Tägliche Notiz"
  - Template-Variablen ({{date:FORMAT}}, {{weekday}}, {{cursor}} etc.) werden automatisch ersetzt
  - Wenn Notiz bereits existiert, wird sie direkt geöffnet statt neu erstellt
- **Drag & Drop Wikilinks aus Smart Connections** — Notizen aus dem Smart-Connections-Panel können per Drag & Drop als `[[Wikilink]]` in den Editor gezogen werden

### Improvements
- **reMarkable als eigener Einstellungs-Tab** — reMarkable-Einstellungen sind jetzt ein separater Punkt in den Settings (vorher unter Automationen)
- **Einstellungen reorganisiert** — Neue Tab-Reihenfolge: Tägliche Notiz und reMarkable als eigenständige Bereiche

## [0.3.4-beta] - 2026-03-12

### Features
- **Semantic Scholar Integration** — Neues Right-Side-Panel zur Suche in über 200 Millionen wissenschaftlichen Publikationen direkt aus der App
  - Paper-Suche mit Debounce und Enter-Sofortsuche
  - Filter: Jahrbereich, Fachgebiet, Min. Zitierungen, Open Access Only
  - Paper-Details aufklappbar mit Abstract, Venue und Aktions-Buttons
  - **Zitation einfügen** (IEEE-Format) direkt an der Cursor-Position im Editor
  - **Literaturnotiz erstellen** — Markdown-Notiz mit Frontmatter, Abstract und Metadaten im `Literatur/`-Ordner
  - Open-Access-PDF direkt öffnen, Semantic Scholar Link im Browser öffnen
  - Rate Limiter (1 Req/s) mit automatischem Retry bei 429-Fehlern
  - Ein-/Ausschaltbar in den Einstellungen (Integrationen)
  - Titlebar-Button (Buch-Icon) nur sichtbar wenn aktiviert
  - Vollständig übersetzt (DE/EN)

## [0.3.3-beta] - 2026-03-11

### Features
- **Ordner anpinnen (Pinned Folders)** — Tief verschachtelte Ordner können per Rechtsklick an die Sidebar angepinnt werden und erscheinen prominent oben im FileTree, unabhängig von ihrer Position in der Ordnerstruktur
- **Canvas: Emoji-Dot-Kategorisierung bei KI-Clustering** — "Thematisch gruppieren" erkennt jetzt 🔴🟢🔵 Emoji-Dots in Notiz-Titeln, färbt die Karten automatisch nach Kategorie ein und weist die KI an, nach Kategorien zu clustern
- **Emoji-Dots auf Canvas-Karten** — Notiz-Titel zeigen jetzt Emoji-Dots (🔴🟢🔵) aus dem Dateinamen auch auf Canvas-Karten an

### Improvements
- **Verbesserte Titel-Extraktion** — `extractTitle()` extrahiert Emojis aus dem Dateinamen und stellt sie dem H1-Titel voran
- **Cache-Invalidierung** für korrekte Darstellung neuer Titel (NOTES_CACHE_VERSION bump)

### Fixes
- **Canvas-Titel-Clipping** — CSS für Notiz-Titel auf Canvas-Karten von `-webkit-line-clamp` auf `max-height` umgestellt, damit Emojis nicht abgeschnitten werden

## [0.3.2-beta] - 2026-03-10

### Fixes
- **Sync: Gelöschte Dateien werden nicht mehr zurückgespielt** — Dateien die auf einem Gerät gelöscht wurden, wurden von selten genutzten Geräten wieder hochgeladen. Ursache: `syncedAt` wurde nie für identische Dateien gesetzt, sodass Löschungen nach Ablauf der Server-Tombstones (7 Tage) nicht mehr erkannt wurden.
  - `syncedAt` wird jetzt für alle beim Sync identischen Dateien markiert
  - Neu heruntergeladene Dateien werden korrekt in das lokale Manifest übernommen
  - Server-Tombstone-Retention von 7 auf 90 Tage erhöht (Safety Net für selten genutzte Geräte)

## [0.3.1-beta] - 2026-03-10

### Features
- **KI-Anordnung im Canvas** — Drei neue KI-gestützte Layout-Funktionen im Anordnen-Menü:
  - **Thematisch gruppieren**: KI analysiert Titel und Tags, gruppiert Karten automatisch in thematische Spalten
  - **Lernpfad erstellen**: KI ordnet Karten in optimaler Lernreihenfolge an (Grundlagen → Aufbauendes)
  - **Verbindungen vorschlagen**: KI erkennt inhaltliche Zusammenhänge und erstellt fehlende Edges
- **Canvas Lesemodus** — Neuer Toggle (Auge-Icon) in der Canvas-Toolbar:
  - Hover-Zoom: Karten vergrößern sich beim Überfahren (Faktor per Slider einstellbar, 1x–8x)
  - Titel-Tooltip über der Karte beim Hover
  - Karten nicht verschiebbar/verbindbar im Lesemodus
- **Verbindungslinien ein-/ausblenden** — Neuer Toggle zum Ausblenden aller Edges (praktisch für Grid-Ansicht)

### Improvements
- **Größere Canvas-Karten** — Default-Kartenbreite von 220px auf 280px erhöht, Max von 400px auf 500px
- **Bessere Bildanzeige** — Bilder auf Karten max 200px statt 150px hoch
- **Lesbarere Texte** — Callout/Tag Font-Größen erhöht (10→11px), besseres Line-Height
- **Settings-Slider** für Kartenbreite geht jetzt bis 500px

### Fixes
- **Titel-Clipping behoben** — Karten-Border-Radius und Content-Overflow verursachten abgeschnittene Buchstaben oben links
- **Robustes KI-JSON-Parsing** — LLM-Ausgaben mit Markdown-Blöcken, Trailing-Commas und Sonderzeichen werden korrekt verarbeitet

## [0.3.0-beta] - 2026-03-09

### Highlights
- **Open Beta** — MindGraph Notes verlässt die Alpha-Phase!
- **macOS Code Signing & Notarization** — Keine Gatekeeper-Warnung mehr, die App wird als "Notarized Developer ID" erkannt
- **Snap Store Integration** — Linux-Builds werden automatisch im Snap Store veröffentlicht (`snap install mindgraph-notes`)

### Fixes
- **Terminal-Reset Bug behoben** — Nach dem Neustart des Terminals wurden Mouse-Tracking-Escape-Sequenzen als Klartext angezeigt (z.B. nach Nutzung von OpenCode/Claude). Terminal-Zustand wird jetzt vollständig zurückgesetzt.

### Infrastructure
- Apple Developer ID Zertifikat (signiert + notarisiert via CI)
- Snap Store Account registriert, CI-Pipeline erweitert
- Website: Alpha-Signup-Formular durch direkte Download-Links ersetzt

## [0.2.29-alpha] - 2026-03-08

### Improvements
- **Onboarding Profil "Schule"**: Aktiviert jetzt PDF Companion, Vision OCR und Notes Chat — Schüler können PDFs direkt in Karteikarten umwandeln und Fragen zum Lernstoff stellen
- **Onboarding Profil "Studium"**: Vision OCR und Notes Chat werden jetzt ebenfalls aktiviert
- **Notes Chat im Onboarding**: Wird jetzt für alle Profile im Feature-Guide angezeigt

### Fixes
- **Cmd/Ctrl+Click Split-View wiederhergestellt**: Multi-Select nutzt jetzt Shift+Click statt Cmd/Ctrl+Click — Split-View funktioniert wieder wie gewohnt

## [0.2.28-alpha] - 2026-03-08

### Features
- **Vision OCR (Ollama)**: PDF-Inhalte via Ollama Vision-Modelle extrahieren — funktioniert mit gedruckten und handgeschriebenen Dokumenten. Kein Docker/Docling nötig, alles lokal über Ollama. Empfohlene Modelle: glm-ocr, qwen2.5-vl
- **Multi-Select im FileTree**: Dateien mit Cmd/Ctrl+Click auswählen und per Batch löschen oder in andere Ordner verschieben
- **Email-Analyse: Modell-Anzeige**: Im Inbox-Panel wird jetzt angezeigt, welches KI-Modell die Email analysiert hat

### Improvements
- **Email-Analyse: Verbesserte Termin-Erkennung**: Prompt erkennt jetzt zuverlässig Termine, Uhrzeiten und Zoom/Teams/Meet-Links — auch in weitergeleiteten E-Mails
- **Email-Analyse: Ollama Chat API**: Umstellung von `/api/generate` auf `/api/chat` — kompatibel mit Reasoning-Modellen (Qwen3.5, DeepSeek) inkl. `think: false` und `<think>`-Stripping
- **Email-Analyse: Erhöhtes Body-Limit**: 1.500 → 3.000 Zeichen — weitergeleitete Mails werden nicht mehr abgeschnitten
- **Email-Modell in Settings**: Analyse-Modell-Dropdown im Agenten-Tab funktioniert jetzt korrekt (Ollama-Models werden geladen)
- **Quiz: Content-Limit erhöht**: 15.000 → 25.000 Zeichen für bessere Quiz-Qualität bei langen Dokumenten/PDFs

### Fixes
- **Email-Duplikate verhindert**: Dreifacher Schutz gegen doppelte E-Mail-Notizen (noteCreated-Flag, email-id Frontmatter, Dateiname-Check)
- **Email-Fetch Deduplizierung**: Beim Zusammenführen neuer E-Mails werden Duplikate nach ID gefiltert
- **Docling standardmäßig deaktiviert**: Vision OCR ist der empfohlene Weg für PDF-Extraktion
- **reMarkable standardmäßig deaktiviert**: Muss bei Bedarf in den Settings aktiviert werden

## [0.2.27-alpha] - 2026-03-07

### Features
- **LaTeX-Rendering im Notes Chat**: Mathematische Formeln ($...$, $$...$$) werden jetzt im Chat mit KaTeX gerendert — statt rohem LaTeX-Text
- **LaTeX-Brackets-Support**: Zusätzlich zu `$...$` wird jetzt auch `\(...\)` / `\[...\]` Notation in Editor, Flashcards und Notes Chat unterstützt

### Improvements
- **Quiz: Reasoning-Modell-Kompatibilität (Qwen3.5, DeepSeek)**: `think: false` Parameter deaktiviert interne Denkblöcke bei Reasoning-Modellen — verhindert Timeouts und Token-Verschwendung
- **Quiz: Bessere Prompts**: Explizite Anweisung zur exakten Fragenanzahl, LaTeX-Nutzung für Formeln und ausführlichere Antworten (2-4 Sätze)
- **Quiz: `<think>`-Block-Stripping**: Antworten von Reasoning-Modellen werden vor dem JSON-Parsing automatisch bereinigt
- **Quiz: Erhöhtes Timeout**: 90s → 180s für langsamere lokale Modelle
- **DOMPurify: KaTeX-Tags erlaubt**: `<eq>`, `<eqn>`, `aria-hidden` zur Sanitization-Allowlist hinzugefügt — verhindert, dass KaTeX-Ausgaben von DOMPurify entfernt werden

### Sync
- **FileTracker & SyncEngine Verbesserungen**: Optimierungen am File-Tracking und Sync-Engine

## [0.2.26-alpha] - 2026-03-04

### Improvements
- **Notes Cache v2**: Cache-Invalidierung bei Versionsänderung oder Vault-Pfad-Wechsel — verhindert veraltete Daten nach Updates
- **Auto-Extraktion in updateNote**: Links, Tags, Headings, Blocks und Task-Stats werden automatisch aus dem Content extrahiert, wenn eine Notiz aktualisiert wird — konsistentere Metadaten ohne manuelle Aufrufe
- **Overdue-Tasks tagesbasiert**: Überfällige Tasks werden jetzt nach Tag (Mitternacht) statt nach exakter Uhrzeit berechnet — Tasks mit heutigem Datum werden nicht mehr fälschlicherweise als überfällig angezeigt

### Docs
- **README überarbeitet**: Karteikarten, E2E Sync, E-Mail-Inbox, Slash Commands, reMarkable und edoobox-Agent als Features ergänzt
- **Blog**: Neuer Artikel "Slash Commands in MindGraph Notes"
- **SEO**: Neue Landing Page "Obsidian Alternative" unter `/obsidian-alternative/`

## [0.2.25-alpha] - 2026-03-02

### Features
- **Slash Commands im Editor**: Tippe `/` am Zeilenanfang oder nach einem Leerzeichen, um ein filterbares Dropdown-Menü mit 28 Befehlen zu öffnen — wie in Obsidian oder Notion. Enthält Datum/Zeit-Stempel, Formatierung (Headings, Tasks, Code-Blöcke, Tabellen, Zitate, Trennlinien), 10 Callout-Typen und Template-Picker. Navigation per Pfeiltasten, Auswahl mit Enter/Tab, Schließen mit Escape
- **Konfigurierbare Datums-/Zeitformate**: In den Editor-Einstellungen können Datums- und Zeitformat für Slash Commands angepasst werden (Default: `DD.MM.YYYY` / `HH:mm`) mit Live-Vorschau
- **Datum-Wikilinks**: `/today`, `/tomorrow` und `/yesterday` fügen Wikilinks zum jeweiligen Datum ein (z.B. `[[2026-03-02]]`)

## [0.2.24-alpha] - 2026-03-01

### Features
- **Canvas: Notiz duplizieren**: Neuer "Duplizieren"-Eintrag im Rechtsklick-Kontextmenü auf Canvas-Karten. Erstellt eine Kopie der Notiz im gleichen Ordner und platziert die neue Karte leicht versetzt neben dem Original — mit gleicher Farbe, Größe und Dimensionen

## [0.2.23-alpha] - 2026-02-27

### Features
- **Canvas: Zusammenfassungen auf Karten**: Callout-Zusammenfassungen (summary, tldr, abstract, note, info) werden jetzt direkt auf den Canvas-Karten angezeigt — inkl. deutscher Aliase (Zusammenfassung, tl-dr). Neuer Toggle zum Ein-/Ausblenden in der Toolbar
- **Canvas: Floating Focus Bar**: Fokus-Modus-Controls sind jetzt eine schwebende Leiste direkt auf dem Canvas (statt in der Toolbar). Verhindert abgeschnittene Buttons bei schmalen Fenstern. Escape-Taste beendet den Fokus-Modus
- **Canvas: Anordnen-Dropdown**: Alignment-, Distribute- und Layout-Tools sind jetzt in einem einzigen "Anordnen"-Dropdown vereint — spart ~270px Toolbar-Breite
- **Email: Konfigurierbarer Inbox-Ordner**: Email-Notizen können jetzt in einem frei wählbaren Ordner erstellt werden (Settings → Agenten → Email-Ordner), statt fest auf `‼️📧 - emails`

### Improvements
- **Callout-Extraktion verbessert**: Robusterer Parser für Callouts in Notizen mit korrekter Behandlung von Multiline-Inhalten und Typ-Aliase
- **Canvas-Toolbar kompakter**: Gesamtersparnis von ~440px Breite bei aktivem Fokus-Modus, kein Overflow mehr bei schmalen Fenstern oder geöffneter Sidebar

## [0.2.22-alpha] - 2026-02-26

### Features
- **In-App Ollama Model Download**: Ollama-Modelle können jetzt direkt in der App heruntergeladen werden — kein Terminal mehr nötig. Dropdown mit empfohlenen Modellen (Ministral 8B, Gemma 3, Llama 3.2, Qwen 3, Mistral 7B), Freitext-Eingabe für beliebige Modelle, Fortschrittsbalken mit Prozentanzeige
- **Ollama Model löschen**: Installierte Modelle können direkt in den Settings per Klick entfernt werden
- **Onboarding Model Download**: Wenn Ollama verbunden aber keine Modelle installiert sind, wird im Onboarding ein Download angeboten

## [0.2.21-alpha] - 2026-02-25

### Fixes
- **Lokalisierung: Main-Process-Dialoge**: Alle nativen Dialoge (Notiz/Ordner löschen, umbenennen, verschieben, PDF-Export, Vault-Auswahl, Wikilink-Stripping, Logo-/Formular-Auswahl) respektieren jetzt die Spracheinstellung des Users — zuvor waren diese hardcoded auf Deutsch

## [0.2.20-alpha] - 2026-02-25

### Features
- **reMarkable PDF-Optimierung**: Neuer "Optimieren + Export"-Button — PDFs werden vor dem Upload via Ghostscript oder qpdf komprimiert (automatischer Fallback)
- **reMarkable USB Debug-Panel**: Klappbares Debug-Panel zeigt USB-Geräteinformationen (Vendor, Product, IDs), Verbindungsstatus und letzten Export-Modus

### Improvements
- **reMarkable Upload-Stabilität**: Upload-Flow komplett überarbeitet mit 20 Retry-Versuchen, Reachability-Checks vor jedem Versuch und manuell gebautem multipart/form-data via `electron.net` (behebt Probleme mit reMarkable Paper Pro)
- **reMarkable Branding**: Logo im Panel-Header statt reinem Text
- **Titlebar-Badges**: Overdue- und Inbox-Badges teilen jetzt eine gemeinsame `.titlebar-mini-badge`-Basisklasse mit einheitlichem Design

### Security
- **Path Traversal Schutz**: Neuer zentraler `validatePath()`-Helper verhindert Pfad-Ausbrüche aus dem Vault bei allen Datei-IPC-Handlern (read-files-batch, ensure-pdf-companion, sync-pdf-companion, copy-image-to-attachments, write-image-from-base64, remarkable-upload-pdf, remarkable-optimize-pdf, remarkable-download-document)
- **checkCommandExists Whitelist**: `check-command-exists` IPC-Handler akzeptiert nur noch explizit erlaubte Kommandos (opencode, claude, wsl, gs, qpdf) statt beliebiger Eingaben

## [0.2.19-alpha] - 2026-02-25

### Fixes
- **Wikilink Hover-Preview**: Vorschau rendert jetzt LaTeX und Callouts korrekt durch dieselbe Rendering-Pipeline wie die normale Markdown-Preview

## [0.2.18-alpha] - 2026-02-24

### Fixes
- **reMarkable USB-Verbindung**: Stabilere Erkennung und Dokumentabfrage über `electron.net`, inklusive robusterem JSON-Parsing und Kompatibilität für `VissibleName`/`VisibleName`

## [0.2.17-alpha] - 2026-02-24

### Features
- **reMarkable USB-Integration**: Neue native Anbindung an reMarkable-Geräte mit Import-/Export-Workflow für Notizen über USB
- **reMarkable Panel**: Neues Sidebar-Panel inklusive Gerätestatus, Aktionen und UI-Flow für die reMarkable-Synchronisierung

### Improvements
- **Main/Preload IPC-Erweiterung**: Neue reMarkable-Handler und geteilte Typen für eine saubere, sichere Bridge zwischen Main- und Renderer-Process
- **Website-Onboarding für Windows**: Klarere Hinweise für Windows-Nutzer im Alpha-Signup-Flow

## [0.2.16-alpha] - 2026-02-23

### Features
- **Windows + WSL Support**: KI-Tool-Erkennung sucht jetzt automatisch innerhalb von WSL (Windows Subsystem for Linux) nach opencode und claude — der 🤖-Button startet `wsl opencode` bzw. `wsl claude` direkt aus dem Terminal. **Windows-User können damit erstmals das volle KI-Terminal nutzen!**
- **Alpha-Tester Signup**: Neue Anmeldesektion auf der Website — E-Mail-Formular (Formspree) mit OS-Auswahl, Honeypot-Bot-Schutz und WSL-Schnellstart-Anleitung für Windows-User
- **Discord-Integration**: Discord-Link mit offiziellem Logo im Signup-Footer und auf der gesamten Website

### Improvements
- **Signup-Formular Redesign**: Poliertes UI mit Accent-Gradient-Leiste, Alpha-Badge, Inline-Icons in Eingabefeldern und Discord-Logo im Footer
- **Download-Gate**: Downloads sind jetzt hinter dem Alpha-Tester-Formular — Besucher melden sich zuerst an
- **GitHub-Sicherheit**: Dependabot für wöchentliche npm-Dependency-Checks aktiviert, Branch Protection auf master (kein Force-Push)

## [0.2.15-alpha] - 2026-02-23

### Features
- **Force Sync**: Bei SAFETY-Fehlern (Mass-Deletion-Schutz) erscheint jetzt ein "Sync erzwingen"-Button, um den Sync manuell zu bestätigen und fortzusetzen

### Fixes
- **AI-Tool Erkennung**: `~/.opencode/bin` zum erweiterten PATH hinzugefügt — opencode wird jetzt korrekt erkannt und bevorzugt statt auf claude zurückzufallen

## [0.2.14-alpha] - 2026-02-22

### Features
- **Syntax Highlighting**: Code-Blöcke in der Preview werden jetzt mit highlight.js farblich hervorgehoben — unterstützt 20+ Sprachen (JS, TS, Python, Rust, Go, SQL, etc.) mit VS Code-inspiriertem Dark-Theme
- **Code Copy Button**: Kopierschaltfläche auf Code-Blöcken in Editor-Preview, Flashcards und NotesChat — mit visueller Bestätigung nach dem Kopieren
- **CodeMirror Sprachunterstützung**: Fenced Code Blocks im Editor erhalten jetzt Syntax Highlighting für JS, TS, JSX, TSX, HTML und CSS

### Improvements
- **Tab-Titel Sync**: Tab-Titel aktualisieren sich automatisch wenn sich der Notiz-Titel ändert
- **Canvas Tab-Titel**: "In Canvas öffnen" zeigt jetzt den tatsächlichen Notiz-Titel statt des Dateinamens
- **Code-Block Styling**: Modernisiertes Design mit dunklem Hintergrund, Zeilennummern und abgerundeten Ecken

## [0.2.13-alpha] - 2026-02-21

### Features
- **Smart AI-Tool Erkennung**: Terminal-Bot-Button erkennt automatisch verfügbare AI-CLI-Tools (opencode bevorzugt, claude als Fallback) — Button passt Tooltip an und wird deaktiviert wenn kein Tool gefunden wird

## [0.2.12-alpha] - 2026-02-20

### Features
- **Ordner ausblenden**: Ordner können per Rechtsklick im FileTree ausgeblendet werden — versteckte Ordner über Augen-Toggle in der Sidebar temporär einblendbar (ausgegraut), Einstellung persistiert in graph.json

## [0.2.11-alpha] - 2026-02-20

### Features
- **Apple Erinnerungen**: Aus E-Mail-Aktionen und Notiz-Tasks direkt Apple Erinnerungen erstellen (macOS) — mit Titel, Fälligkeitsdatum, Uhrzeit und Kontext
- **InboxPanel suggestedActions**: Vorgeschlagene Aktionen aus der E-Mail-Analyse werden jetzt im Detail-View angezeigt — mit Datum-Badges und Reminder-Button
- **FileTree Kontextmenü**: Neuer Menüpunkt "Apple Erinnerungen erstellen" für Markdown-Dateien — erstellt Erinnerungen aus allen offenen Tasks mit Datum

### Improvements
- **E-Mail-Zusammenfassung**: Markdown-Formatierung (fett, kursiv) wird jetzt in der Zusammenfassung gerendert

## [0.2.10-alpha] - 2026-02-19

### Features
- **E-Mail-Integration**: IMAP-Abruf mit automatischer Ollama-Analyse — E-Mails werden regelmäßig abgerufen, nach Relevanz gefiltert und als Notizen im Vault gespeichert
- **E-Mail-Konfiguration**: Mehrere Accounts, Instruktions-Notiz für individuelle Analyse-Anweisungen, Relevanz-Schwellenwert, Abrufintervall und Modellauswahl
- **edoobox-Agent**: Akkreditierungsformulare (.docx) importieren, Veranstaltungen automatisch parsen und an edoobox API senden
- **Agent Panel**: Neues UI-Panel zur Verwaltung importierter Veranstaltungen mit Status-Tracking (Importiert/Gesendet/Fehler)
- **Agenten-Tab**: Neuer Settings-Tab "Agenten" — E-Mail und edoobox zentral konfigurierbar

### Improvements
- **E-Mail → Agenten-Tab**: E-Mail-Einstellungen von "Integrationen" nach "Agenten" verschoben — logisch konsistente Gruppierung aller automatisierten Aufgaben
- **E-Mail-Sicherheit**: Prompt-Injection-Warnung im E-Mail-Modul für sicherheitsbewusste Nutzung

### Fixes
- **E-Mail-Abruf**: Neueste E-Mails werden zuerst geladen, 3-Tage-Fenster für neue Vaults verhindert Massenimport

## [0.2.7-alpha] - 2026-02-16

### Features
- **Readwise-Integration**: Native Synchronisierung von Readwise-Highlights in den Vault — Bücher, Artikel, Podcasts und mehr mit Cover-Bildern, Kategorie-Filter, inkrementellem Sync und Auto-Sync
- **Readwise-Kategorien**: Auswählbare Kategorien (Bücher, Artikel, Tweets, Podcasts, Supplementals) zum gezielten Filtern der Synchronisierung
- **Readwise-Cover**: Buchcover werden automatisch heruntergeladen und lokal gespeichert

### Improvements
- **Readwise-Dateien**: Nach dem Sync werden neue Notizen sofort im Editor mit Inhalt angezeigt — kein Vault-Reload mehr nötig

## [0.2.6-alpha] - 2026-02-16

### Fixes
- **LanguageTool**: Korrekturvorschläge werden jetzt zuverlässig im Popup angezeigt — Click-Handler nutzt nun CodeMirror's Position-API statt unzuverlässige DOM-Traversierung
- **LanguageTool**: Popup schließt sich beim Klick außerhalb automatisch

## [0.2.5-alpha] - 2026-02-15

### Features
- **Sync-Trash**: Vom Sync gelöschte Dateien werden in `.sync-trash/` verschoben statt unwiderruflich gelöscht — Dateien sind jetzt wiederherstellbar
- **Flashcard-Merge**: Sync-Konflikte bei Flashcards werden per JSON-Merge nach Card-ID gelöst statt überschrieben

### Improvements
- **Sync-Sicherheit**: Strengere Mass-Deletion-Schwellenwerte (>10% und ≥10 Dateien) für lokale und remote Löschungen
- **Manifest-Handling**: Frisches Manifest bei neuem Vault verhindert fehlerhafte Löschungen durch veraltete syncedAt-Werte

## [0.2.4-alpha] - 2026-02-15

### Features
- **Selektive Synchronisierung**: Ordner und Dateitypen können vom Sync ausgeschlossen werden (Einstellungen > Sync)
- **Sync-Protokoll**: Transparentes Log aller Sync-Aktivitäten (Uploads, Downloads, Konflikte, Fehler) in den Einstellungen
- **Gelöschte Dateien wiederherstellen**: Auf dem Server gelöschte Dateien werden 7 Tage aufbewahrt und können wiederhergestellt werden
- **Sync-Server**: mindgraph-sync-server als Teil des Repositories hinzugefügt

### Improvements
- **Sync-Sicherheit**: Mass-Deletion-Schutz verhindert versehentliches Löschen von >50% der lokalen Dateien
- **Vault-ID-Validierung**: Sync prüft die Vault-ID auf korrektes Format, verhindert korrupte IDs
- **notes-cache.json vom Sync ausgeschlossen**: Interne Cache-Dateien werden nicht mehr synchronisiert
- **Lokale Dateilöschungen**: Werden jetzt korrekt erkannt und an den Server propagiert
- **Gelöschte Dateien UI**: Automatisches Neuladen nach Wiederherstellung, Neu-Laden-Button immer sichtbar
- **Onboarding**: Setzt sich beim erneuten Öffnen auf die erste Seite zurück (Shift+Cmd+O)
- **Properties Panel**: Wird jetzt auch bei neuen Dateien ohne Frontmatter angezeigt

### Fixes
- **Kritischer Sync-Bug behoben**: Korrupte Vault-ID konnte dazu führen, dass alle lokalen Dateien gelöscht werden
- **Server Soft-Delete**: Server verwendet jetzt Soft-Delete statt Hard-Delete für Dateien

### Website
- Alle Emojis durch SVG-Icons ersetzt
- Neuer Blog-Post: "Preiskampf, Sicherheitskrise und das Web als KI-Datenbank"

## [0.2.3-alpha] - 2026-02-14

### Features
- **Formatierungsleiste**: Neue sichtbare Toolbar mit Buttons für Bold, Italic, Strikethrough, Code, Überschriften (H1-H3), Listen, Checkboxen, Zitate, Links und Trennlinien
- **Hilfe-Guide**: Icon-Übersicht jederzeit aufrufbar über `?`-Button in der Titelleiste oder `Cmd+/`
- **Aufzählungslisten in applyFormat**: Neue Formatierungsoptionen für Bullet Lists, nummerierte Listen und horizontale Trennlinien

### Improvements
- **Onboarding überarbeitet**: Icon-Übersicht auf Seite 3 zeigt jetzt alle App-Icons korrekt, profilspezifisch (Smart Connections, Notes Chat nur für Wissensarbeiter)
- **Schüler-Profil**: Startet jetzt mit sichtbarer Formatierungsleiste und Preview-Modus
- **Alle Profile**: Dateien öffnen standardmäßig in der Preview-Ansicht
- **Live Preview erweitert**: Versteckt jetzt auch Aufzählungszeichen (`- `), nummerierte Listen und Blockquotes (`> `) visuell

### Fixes
- **Settings-Hinweistexte**: Labels und Beschreibungen in den Einstellungen werden nicht mehr ohne Zeilenumbruch zusammengeschoben (`.settings-hint` CSS Fix)
- **Sidebar**: Such-Icon in der Übersicht ergänzt

## [1.0.27-alpha] - 2026-02-13

### Security Fixes
- **Registrierungs-Gate fuer Sync**: Client wartet jetzt auf Server-Bestaetigung (`registered`) bevor Sync-Operationen starten. Zuvor konnte ein geloeschtes Vault weiterhin Dateien hochladen.
- **Server-seitige Registrierungspruefung**: Alle Dateioperationen (Upload, Download, Delete, Manifest) pruefen ob der Client registriert ist.

### Bug Fixes
- **Geloeschtes Vault konnte Dateien hochladen**: Ein vom Server geloeschtes Vault konnte sich reconnecten und Dateien hochladen, da der Client nicht auf die Registrierungsbestaetigung wartete.
- **Server Vault-Loeschung bereinigt files-Tabelle**: `deleteVault()` loescht jetzt sowohl `vault_meta` als auch `files` Eintraege.

### Improvements
- Admin API: Neue Endpoints `GET /admin/vaults` und `DELETE /admin/vaults/:id`

## [1.0.26-alpha] - 2026-02-13

### Features
- **E2E-verschlüsselte Vault-Synchronisation**: Vollständig verschlüsselte Synchronisation über WebSocket-Relay-Server mit AES-256-GCM-Verschlüsselung
- **Aktivierungscode-System**: Sync erfordert einen Aktivierungscode zur Registrierung neuer Vaults
- **Konfigurierbarer Relay-Server**: Eigene Sync-Server-URL kann in den Einstellungen angegeben werden
- **Per-Vault Sync-Konfiguration**: Jedes Vault speichert seine Sync-Einstellungen unabhängig

### Security & Safety
- **Cross-Vault-Schutz**: `savedForVault`-Feld validiert, dass Sync-Konfiguration zum korrekten Vault gehört
- **SyncEngine Destroyed-Flag**: Blockiert alle Dateioperationen nach Disconnect
- **Pfad-Traversal-Schutz**: Jeder Dateischreibvorgang prüft, dass das Ziel innerhalb des Vault-Verzeichnisses liegt
- **Race-Condition-Schutz**: Erkennt Vault-Wechsel während asynchroner Sync-Operationen

### Improvements
- Parallele Uploads/Downloads (5 gleichzeitig)
- Sync-Lock verhindert konkurrierende Operationen
- Automatische Wiederverbindung bei Vault-Wechsel

## [1.0.23-beta] - 2026-02-09

### Features
- **Anki Import (.apkg)**: Karteikarten aus Anki-Decks importieren mit Medien-Extraktion (Bilder, Audio). Unterstützt Basic, Reversed und Cloze-Karten
- **Bilder im Karteikarten-Editor**: Bild-Upload per Button (File-Picker) und Clipboard-Paste (Cmd+V) beim Erstellen von Karteikarten
- **Bidirektionale Canvas-Verbindungen**: Neue Verbindungen im Canvas werden automatisch in beide Dateien geschrieben (Hin- und Rücklink)
- **Bidirektionale Edge-Darstellung**: Hin- und Rücklinks werden als eine Kante mit Pfeilen an beiden Enden dargestellt statt als zwei separate Kanten

### Fixes
- **Flashcard-Bilder**: Bilder in Karteikarten werden jetzt korrekt angezeigt (MarkdownContent mit vaultPath-basierter Bildauflösung)
- **Canvas: Notiz im gefilterten Ordner**: Neue Notizen aus Canvas-Drag werden jetzt im aktuell gefilterten Ordner erstellt
- **Link-Zählung**: Bild-Embeds (`![[bild.svg]]`) werden nicht mehr als Wikilinks gezählt
- **Link-Zählung im FileTree**: Zeigt jetzt nur ausgehende Wikilinks (konsistent mit dem Dokumentinhalt)
- **Dateinamen mit Leerzeichen**: Bilder mit Leerzeichen im Dateinamen werden jetzt korrekt in Markdown eingefügt (Leerzeichen → Bindestrich)

## [1.0.22-beta] - 2026-02-08

### Security
- **DOMPurify HTML-Sanitization**: Alle `dangerouslySetInnerHTML`- und `innerHTML`-Ausgaben werden jetzt mit DOMPurify sanitized — verhindert XSS über bösartige Markdown-Dateien, SVGs oder AI-Antworten
- **SVG-Sanitization**: SVG-Dateien im ImageViewer werden mit spezieller SVG-Sanitization gerendert (Script-Tags, Event-Handler und foreignObject werden entfernt)
- **HTML-Escaping**: Alle user-kontrollierten Werte (Dateinamen, Notiz-Namen, Fehlermeldungen) in innerHTML-Templates werden jetzt HTML-escaped
- **Mermaid Security**: `securityLevel` von `loose` auf `strict` geändert — verhindert Click-Callbacks und HTML-Labels in Diagrammen
- **KaTeX Trust**: `trust` von `true` auf `false` geändert — blockiert potenziell gefährliche KaTeX-Befehle
- **Zustand Selector-Optimierung**: `useShallow` für Store-Aufrufe im MarkdownEditor — verhindert unnötige Re-Renders bei Panel-Wechseln

### Fixes
- **Preview-Bilder bei Panel-Wechsel**: Geladene Bilder werden jetzt gecacht und direkt in den HTML-String eingebettet — SVGs/Bilder verschwinden nicht mehr beim Öffnen von Karteikarten oder anderen Panels

## [1.0.21-beta] - 2026-02-08

### Features
- **Standard-Ansicht Preview**: Notizen öffnen jetzt standardmäßig in der Preview-Ansicht statt im Editor. Einstellbar unter Settings → Editor → Standard-Ansicht.

### Fixes
- **Bilder/SVGs in Preview zuverlässig**: Eingebettete Bilder (SVG, PNG etc.), Wikilink-Embeds und PDFs werden jetzt zuverlässig beim ersten Laden und nach Panel-Wechseln (z.B. Karteikarten) angezeigt
- **Live-Preview Bild-Caching**: Bilder im Live-Preview-Modus werden gecacht, um wiederholte IPC-Aufrufe zu vermeiden und Flickern zu reduzieren

## [1.0.20-beta] - 2026-02-07

### Features
- **Karteikarten Statistik-Dashboard**: Neuer "Statistik"-Tab im Karteikarten-Panel
  - **Lern-Streak**: Aktuelle Streak-Tage, längster Streak und Lerntage gesamt mit Flammen-Icon
  - **Kalender-Heatmap**: 12-Wochen Aktivitätsübersicht im GitHub-Style (5 Grün-Abstufungen)
  - **Quick Stats**: Karten gesamt, aktive Karten, heute gelernt/richtig, gefestigte Karten, durchschn. Leichtigkeit
  - **Anstehende Wiederholungen**: 7-Tage Balkendiagramm mit fälligen Karten pro Tag
  - **Backward-Kompatibilität**: Bestehende Lern-Daten werden automatisch aus lastReview übernommen
  - Persistenz in separater `study-stats.json` (unabhängig von flashcards.json)

### Fixes
- **SVG-Bildansicht**: SVG-Dateien werden jetzt korrekt in der Bildansicht dargestellt (inline-Rendering statt base64 Data-URL, behebt Darstellungsprobleme bei SVGs ohne explizite width/height)

## [1.0.19-beta] - 2026-02-06

### Features
- **Akzentfarben**: 6 neue Farben (Rosé, Koralle, Malve, Mint, Limette, Gold) → 12 Akzentfarben gesamt
- **Hintergrundfarben**: 6 neue Farben (Rosenblatt, Kirschblüte, Meeresschaum, Pistazie, Limonade, Baumwolle) → 15 Hintergründe gesamt
- **Custom Logo**: Eigenes Logo hochladen, das in der Titelleiste angezeigt wird (PNG, SVG, JPG, WebP)
- **Dynamische Version**: Settings-Footer zeigt aktuelle App-Version statt hardcoded v1.0.5
- **Beta-Badge**: Beta-Status sichtbar in Titelleiste, Settings-Footer und package.json
- **Kontextmenü**: Emojis durch einheitliche SVG-Icons ersetzt
- **Preview-Kopieren**: Rechtsklick im Preview-Modus zeigt Kopieren-Menü für selektierten Text

### UI
- **Farb-Picker**: Flex-Wrap für Akzent- und Hintergrundfarben (mehrzeilige Darstellung)

## [1.0.18] - 2026-02-06

### Fixes
- **Windows Installer**: Installation jetzt nach `C:\Program Files\` statt ins User-Verzeichnis (NSIS `perMachine`)
- **Windows Taskbar**: Taskleisten-Pin bleibt nach Updates erhalten (stabiler Installationspfad)
- **Windows Installer UX**: Installations-Dialog mit Ordnerauswahl statt One-Click-Install

## [1.0.17] - 2026-02-06

### Fixes
- **Vault-Persistierung**: Vault wird nach App-Neustart wieder korrekt geladen (Race Condition zwischen Settings-Laden und Vault-Loading behoben)
- **Upgrade-Pfad**: Bestehende User sehen beim Update kein unnötiges Onboarding mehr

## [1.0.16] - 2026-02-05

### Features
- **Onboarding**: Willkommen-Screen mit Setup-Wizard beim ersten Start
  - Sprachwahl (Deutsch/Englisch) direkt auf dem Welcome-Screen
  - Vault-Einrichtung: Bestehenden Vault öffnen, Starter-Vault oder leeren Vault erstellen
  - Starter-Vault mit Beispielnotizen (Canvas, Dataview, Flashcards, Zotero)
  - KI-Setup: Automatische Erkennung von Ollama und LM Studio
  - Feature-Übersicht mit Tastenkürzel-Tipps

### Fixes
- **Canvas**: Hierarchisches Layout stürzt nicht mehr ab bei zyklischen Verlinkungen (A→B→C→A)
- **Canvas Performance**: Layout-Algorithmus optimiert (Map-Lookups statt indexOf, niedrigere Fallback-Schwellen, 3s Timeout)

## [1.0.15] - 2026-02-05

### Fixes
- **Windows**: Dateien werden nicht mehr doppelt im Canvas angezeigt beim Erstellen neuer Notizen (Pfad-Normalisierung für Windows Backslashes)

## [1.0.14] - 2026-02-03

### Features
- **Windows-Support**: MindGraph Notes ist jetzt auch für Windows verfügbar (Installer + Portable)
- **Terminal**: Plattformübergreifende Terminal-Unterstützung (PowerShell auf Windows, zsh auf macOS/Linux)

## [1.0.13] - 2026-02-03

### Fixes
- **FileTree**: Beim Umbenennen von Dateien wird die ursprüngliche Dateiendung beibehalten (jpg, png, pdf.md, etc.) statt immer .md anzuhängen
- **Editor**: Race-Condition beim Notizwechsel behoben - der Editor zeigt jetzt zuverlässig den Content der ausgewählten Notiz

## [1.0.12] - 2026-02-03

### Features
- **FileTree**: Rechtsklick auf Ordner → "Im Canvas anzeigen" öffnet Canvas mit diesem Ordner gefiltert

### Fixes
- Properties Panel: Hinzufügen von neuen Eigenschaften mit + Button funktioniert jetzt
- **Canvas Performance**: Große Vaults (3000+ Notizen) werden jetzt schnell im Canvas angezeigt durch gecachte Ordner-Counts
- **Sidebar-Panels**: Klick auf Panel-Button öffnet dieses Panel und schließt andere automatisch

## [1.0.11] - 2026-02-02

### Features
- **Tag-Autocomplete**: Im Properties Panel werden beim Tags-Feld alle existierenden Vault-Tags als Vorschläge angezeigt

### Fixes
- YAML-Arrays werden jetzt immer im Block-Format mit Spiegelstrichen gespeichert
- `#` Präfix wird automatisch von Tags entfernt (Anzeige und Speicherung)
- Komma-Eingabe zum Hinzufügen neuer Tags funktioniert jetzt korrekt

## [1.0.10] - 2026-02-02

### Features
- **Dataview Query System**: Abfragen von Notizen nach Metadaten
  - Query-Typen: `LIST` und `TABLE`
  - `FROM`: Filtern nach Tags (`#tag`) und Ordnern (`"Folder/Path"`)
  - `WHERE`: Bedingungen mit Vergleichen (`=`, `!=`, `>`, `<`, `>=`, `<=`)
  - `SORT`: Sortierung mit `ASC`/`DESC`
  - `LIMIT`: Ergebnisse begrenzen
  - Built-in Funktionen: `contains()`, `length()`, `lower()`, `default()`
  - Zugriff auf `file.*` Felder und YAML-Frontmatter

- **Properties Panel**: Komfortable Bearbeitung von YAML-Frontmatter
  - Anzeige oberhalb des Editors
  - Automatische Typ-Erkennung: Boolean (Checkbox), Zahlen, Datum, Arrays, Text
  - Eigenschaften hinzufügen und entfernen
  - Erhält Original-Schreibweise der Keys (z.B. `Künstler`)
  - **Tag-Autocomplete**: Vorschläge aus allen existierenden Vault-Tags
  - YAML-Arrays immer im Block-Format mit Spiegelstrichen

- **Dataview-Hilfe**: Neuer Tab in Einstellungen mit Syntax-Dokumentation

### Technische Änderungen
- Edit-Modus zeigt Dataview-Code, Live-Preview zeigt Ergebnisse
- Frontmatter-Caching für bessere Query-Performance
- Support für deutsche Umlaute in Frontmatter-Feldnamen
- Große Zahlen (Timestamps) werden als Text statt als Zahl angezeigt
- Neue Stores: `dataviewStore.ts`
- Neue Utils: `metadataExtractor.ts`, `dataview/` (Parser, Executor, Renderer)
- CodeMirror-Extension für Dataview-Block-Rendering

## [1.0.9] - 2026-02-01

### Features
- **Karteikarten & Quiz-System**: Lerne aus deinen Notizen mit Spaced Repetition
  - Rechtsklick auf Notiz oder Ordner → "Quiz starten" generiert Fragen via Ollama
  - Quiz-Fragen können als Karteikarten gespeichert werden
  - **SM-2 Algorithmus**: Optimale Wiederholungsintervalle für effektives Lernen
  - Karteikarten-Panel zeigt alle Karten gruppiert nach Themen/Ordnern
  - Lern-Session mit Bewertung (Nochmal/Schwer/Gut/Einfach)
  - Manuelle Karten erstellen und bearbeiten
  - Markdown und LaTeX werden vollständig gerendert

### Einstellungen
- **Karteikarten ein-/ausschalten**: Neuer Toggle in Einstellungen → Integrationen
- Hinweis wenn Ollama nicht konfiguriert ist

### Technische Änderungen
- Neue Stores: `quizStore.ts`, `flashcardStore.ts`
- Neue Komponenten: `QuizModal`, `FlashcardsPanel`, `FlashcardStudy`, `FlashcardEditor`
- IPC-Handler für Quiz-Generierung und Flashcard-Persistenz
- Pro-Vault Speicherung in `.mindgraph/flashcards.json`

## [1.0.8] - 2026-01-31

### Features
- **Update-Checker**: Automatische Prüfung auf neue Versionen via GitHub Releases API
  - Zeigt Benachrichtigungsbanner wenn neue Version verfügbar ist
  - Link zum direkten Download der neuen Version
  - Kann per Klick geschlossen werden

- **What's New Modal**: Zeigt Neuigkeiten nach App-Update
  - Automatische Anzeige nach Versionsänderung
  - Zeigt CHANGELOG-Inhalt der aktuellen Version als Markdown
  - Persistiert gesehene Version um Modal nur einmal zu zeigen

### Technische Änderungen
- Neue IPC-Handler: `get-app-version`, `check-for-updates`, `get-whats-new-content`
- UIStore erweitert um `lastSeenVersion`, `updateAvailable`, `whatsNewOpen`
- CHANGELOG.md wird in App-Resources für Produktion inkludiert

## [1.0.7] - 2026-01-31

### Features
- **Verschieben nach...**: Neue Kontextmenü-Option im Dateibaum
  - Dateien und Ordner können in andere Ordner verschoben werden
  - Dialog zeigt alle verfügbaren Ordner mit Einrückung an
  - Ordner-Farben und -Icons werden im Dialog angezeigt
  - Explizite Bestätigung durch "Verschieben"-Button
  - Vault-Root als Ziel verfügbar

### UI-Verbesserungen
- Ausgewählter Zielordner wird visuell hervorgehoben
- Verhindert Verschieben eines Ordners in sich selbst
- **Einheitliches Design-System**: Konsistente Abstände und Button-Größen
  - Alle Header (Sidebar, Tab-Bar, Editor) auf 44px Höhe vereinheitlicht
  - Einheitliche Button-Größen (28px) über die gesamte App
  - Konsistente horizontale Abstände (16px)
  - Tab-Bereich an Radius-Ausrichtung angepasst
  - SVG-Icons statt Emojis in der Sidebar

### Fixes
- NotesChat: Scroll-Bug behoben (Fenster scrollte bei LLM-Streaming weg)

## [1.0.6] - 2026-01-30

### Features
- **LanguageTool Integration**: Integrierte Grammatik- und Rechtschreibprüfung
  - Unterstützt lokale Docker-Instanz (`docker run -d -p 8010:8010 erikvl87/languagetool`)
  - Unterstützt LanguageTool Premium API mit Username + API-Key
  - Fehler werden direkt im Editor markiert (rot = Rechtschreibung, blau = Grammatik, gelb = Stil)
  - Klick auf markierte Fehler zeigt Popup mit Korrekturvorschlägen
  - "Ignorieren"-Funktion mit persistenter Speicherung
  - YAML-Frontmatter wird automatisch von der Prüfung ausgeschlossen
  - Konfigurierbare Sprache (automatisch, Deutsch, Englisch, etc.)

### Technische Änderungen
- Neues CodeMirror Extension für LanguageTool mit StateField und ViewPlugin
- IPC-Handler für lokale und API-basierte Grammatikprüfung
- Persistente Speicherung von ignorierten Regeln im uiStore

## [1.0.5] - 2026-01-29

### Features
- **Docling PDF-Extraktion**: Automatische Text-, Tabellen- und Bildextraktion aus PDFs
  - Docker-Integration (`docker run -p 5001:5001 ds4sd/docling-serve`)
  - Konvertiert PDFs zu sauberem Markdown
  - OCR-Support für gescannte Dokumente
  - Konfigurierbar in Einstellungen → Integrationen

### Technische Änderungen
- IPC-Handler für Docling-API-Kommunikation
- PDF-Extraktion UI im PDF Viewer

## [1.0.4] - 2026-01-29

### Features
- **Smart Connections**: KI-basierte ähnliche Notizen mit konfigurierbaren Gewichtungen
  - Embedding-Ähnlichkeit (semantisch)
  - Keyword-Matching
  - Wikilink-Verbindungen
  - Gemeinsame Tags
  - Ordner-Nähe
  - Gewichtungen individuell anpassbar in Einstellungen

### Verbesserungen
- Smart Connections Panel zeigt detaillierte Scores
- Performance-Optimierungen für große Vaults

## [1.0.3] - 2026-01-29

### Features
- **Vollständige Internationalisierung (i18n)**: Deutsche und englische Übersetzungen für alle UI-Komponenten
- **Terminal-Übersetzungen**: Statusmeldungen (verbunden/beendet) werden jetzt lokalisiert
- **GraphCanvas-Übersetzungen**: Toolbar, Filter, Focus-Mode, Dialoge vollständig übersetzt
- **150+ neue Übersetzungsschlüssel** für durchgängige Mehrsprachigkeit

### Technische Änderungen
- `tRef` Pattern im Terminal für sprachreaktive Übersetzungen in Callbacks
- Marker-basierte Übersetzung für Main-Process-Nachrichten

## [1.0.2] - 2026-01-28

### Features
- **Panel-Übersetzungen**: SmartConnections, TagsPanel, OverduePanel vollständig übersetzt
- **UI-Tooltips**: Alle Button-Tooltips und Labels lokalisiert

### Fixes
- Fehlende Übersetzungen auf der Website nachgetragen

## [1.0.1] - 2026-01-28

### Features
- **Sidebar-Übersetzungen**: FileTree, Bookmarks, Sidebar-Komponenten übersetzt
- **Editor-Übersetzungen**: AI-Menüs, Backlinks, WikilinkAutocomplete lokalisiert

## [1.0.0] - 2026-01-27

### Major Release
- **Erster stabiler Release** mit vollständiger Feature-Parität
- **Tab-System**: Mehrere Notizen und Canvas-Ansichten als Tabs
- **Local Canvas**: Fokussierte Graphansicht mit schrittweiser Erweiterung
- **Sprachunterstützung**: Grundlegende DE/EN Lokalisierung

## [0.9.9] - 2026-01-27

### Features
- **Local Canvas**: Rechtsklick → "Im Canvas erkunden" zeigt nur Root + direkte Verbindungen
- **Expand-Buttons**: `+X` an Nodes zeigt versteckte Verbindungen
- **Tab-System**: Canvas öffnet als Tab neben Editor-Tabs
- **View Modes**: Editor / Split / Canvas (Vollbild) / Text-Split

### UI Verbesserungen
- Einheitliche 44px Header-Höhe
- Perfekte Kreis-Buttons im Header

## [0.9.8] - 2026-01-26

### Features
- **Smart Connections Panel**: KI-basierte ähnliche Notizen finden
- **Embedding-Support**: Ollama-Embeddings für semantische Suche
- **Verbessertes Tagging**: Tag-Filter und -Verwaltung optimiert

## [0.9.7] - 2026-01-25

### Features
- **Text-Split View**: Zwei Notizen nebeneinander vergleichen (Cmd/Ctrl+Click im FileTree)
- **Draggable Divider**: Anpassbare Trennlinie zwischen Split-Panels
- **App-Logo als Theme Toggle**: MindGraph-Logo im Header zum Wechseln zwischen Dark/Light Mode
- **Markdown Folding**: Code-Blöcke, Callouts und Frontmatter einklappbar

### UI Verbesserungen
- **Gerundete Ecken**: Moderneres Design mit abgerundeten Header-Bereichen
- **Backlinks Panel Redesign**: Kompaktere Darstellung mit Akzentfarben
- **Wikilink Hover Preview**: Vorschau beim Hovern über Wikilinks
- **Outline Style Variants**: Verschiedene Styles für die Gliederungsansicht
- **Word Count**: Wortzähler im Editor-Footer
- **Tag Autocomplete**: Automatische Vervollständigung für Tags

### Fixes
- Dark Mode Konsistenz verbessert
- Logo verwendet Akzentfarbe für bessere Theme-Integration

## [0.9.6] - 2026-01-25

### Performance Optimizations
- **Massive Vault-Ladezeit-Verbesserung**: Ladezeit reduziert von ~85 Sekunden auf ~2-5 Sekunden für Vaults mit 3000+ Notizen
- **Notes Caching**: Intelligentes Caching-System mit mtime-basierter Invalidierung
- **Lazy Loading**: Notizen laden zunächst nur Metadaten, Inhalt bei Bedarf
- **Backlinks Optimierung**: O(n) Algorithmus statt O(n²)
- **Ordner standardmäßig eingeklappt**: Schnelleres initiales Rendering
- **Verzögerte Task-Statistiken**: Task-Statistiken werden nach UI-Bereitschaft berechnet

### UI Verbesserungen
- **Einheitliches Button-Styling**: Konsistente border-radius über alle UI-Elemente
- **SVG Icons**: Emojis durch professionelle SVG-Icons ersetzt (Einstellungen-Zahnrad, Terminal-Icon)
- **Titlebar Dragging**: Funktioniert jetzt über den gesamten Titlebar-Bereich
- **Editor Toolbar**: Angepasst an Titlebar-Styling für visuelle Konsistenz

### Technische Änderungen
- Batch-Datei-Lesen IPC Handler für reduzierten Overhead
- React Strict Mode Double-Render Guard
- Task-Statistiken Caching pro Notiz

## [0.9.5] - 2026-01-24

### Fixes
- Canvas Labels erscheinen nicht mehr in allen Ordneransichten
- Flux2 Titel-Übersetzung korrigiert

## [0.9.4] - 2026-01-24

### Features
- Verbessertes Terminal mit benutzerfreundlicher Fehlermeldung
- Konsistente UI-Elemente

## [0.9.3] - 2026-01-24

### Features
- Terminal-Integration verbessert
- Fehlerbehandlung optimiert

## [0.9.2] - 2026-01-24

### Features
- Terminal-Komponente mit xterm.js
- PTY-basierte Shell-Integration

## [0.9.1] - 2026-01-22

### Features
- Flux2 Bildgenerierung via Ollama
- Verbesserte KI-Integration

## [0.9.0] - 2026-01-22

### Features
- Task-Management im Footer mit Statistiken
- Reminder-System für Tasks

## [0.8.x] - 2026-01-21/22

### Features
- Canvas Labels und Styling
- PDF Companion Verbesserungen
- Zotero Integration
- Template-System

## [0.7.0] - 2026-01-21

### Features
- Wissensgraph mit React Flow
- Verschiedene Layout-Algorithmen
- Node-Styling und Farben

## [0.6.0] - 2026-01-20

### Features
- KI-Integration mit Ollama
- Kontextmenü für KI-Aktionen
- Transparente Dokumentation via Fußnoten

## [0.5.0] - 2026-01-20

### Features
- Live Preview Modus
- Split View (Editor + Canvas)
- Backlinks Panel

## [0.4.x] - 2026-01-20

### Features
- Mermaid Diagramme
- LaTeX/KaTeX Support
- Callouts

## [0.3.x] - 2026-01-19/20

### Features
- Wikilinks mit Autocomplete
- Quick Switcher (Cmd+K)
- Schnellsuche (Cmd+P)

## [0.2.0] - 2026-01-18

### Features
- Dateibaum mit Kontextmenü
- Drag & Drop für Dateien
- Themes (Light/Dark)

## [0.1.0] - 2026-01-18

### Initial Release
- Markdown Editor mit CodeMirror
- Grundlegende Dateiverwaltung
- Vault-basierte Speicherung
