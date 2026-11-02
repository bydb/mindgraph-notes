# Petrol-Chat: Verlauf speichern, Notizen einbeziehen, Bilder verstehen

## Aufgabe

Vergleich mit Claude und Codex (Gespräch 01.11.2026): Dem Petrol-Chat fehlen drei Dinge, die
Nutzer von jedem Chat erwarten.

1. **Gespräche bleiben erhalten.** Heute verschwindet der Verlauf, wenn man den Tab schließt oder
   die App neu startet.
2. **Notizen ins Gespräch holen.** Heute verwirft der Main jeden Kontext und jeden Anhang. Wer nach
   einer Notiz fragen will, muss in den Auftrag wechseln oder in den Notiz-Chat im rechten Panel.
3. **Bilder verstehen.** Ein Foto vom Whiteboard, ein abfotografiertes Formular, ein Screenshot.
   Heute geht das nur über den Umweg Vision-OCR.
4. **Der Agent liest Scans und Bilder** (ergänzt 02.11.2026, Rev. 5). Heute liest er PDFs nur
   mit Textebene und Bilder gar nicht, auch nicht in angehängten Ordnern.

Gesucht ist ein **Entwurf mit Reihenfolge**, kein Code. Codex prüft adversarial, besonders
Datenschutz, Speicherort, Verhalten bei Cloud-Wegen und die Annahmen über Ollama. Keine Code-Edits,
kein Commit.

Damit sind die Stufen 2 und 3 aus `chat-und-agent.md` gemeint. Stufe 3 wird hier bewusst
**kleiner** geschnitten: Notizen kommen nur auf ausdrücklichen Wunsch ins Gespräch, nicht über eine
Werkzeugschleife des Modells (Begründung in Teil 2).

## Kontext / Anker

- Verlauf heute: `renderer/stores/petrolChatStore.ts:1-19` („Gespeichert wird bewusst noch nichts
  (Stufe 2: Format, Löschen, Aufbewahrung, Verschlüsselung offen)“). Beim Schließen des Tabs
  `dispose` (`petrolChatStore.ts:379`, aufgerufen aus `tabStore.ts`).
- Zusage „liest keine Notizen von selbst“: im Main erzwungen, `main/index.ts:6462-6466` setzt für
  `chatMode === 'petrol'` `context = ''` und `contextAttachmentIds = undefined`. Laut CLAUDE.md muss
  jeder, der dem Chat Notizzugriff gibt, die Statuszeile in `PetrolChat.tsx` mit ändern.
- Webantworten: Auszüge liegen nur im Main-Speicher (`main/llm/petrolWebSnapshots.ts`),
  „Hiermit weiterfragen“ hängt an `snapshotId` + `scopeId`.
- Anhänge im Agenten: Registry pro Renderer, nicht persistiert (`main/noteAgent/contextFiles.ts:97`),
  Formate `EXT_TO_KIND` (`:76-91`), **keine Bildformate**.
- Bilder an Ollama gibt es schon: `vision-ocr-extract-page` (`main/index.ts` um Zeile 9614) schickt
  `images: [base64]` an `/api/chat`. Ollama meldet die Fähigkeit `vision` in `/api/tags`
  (`main/ollamaCapabilities.ts`, Beispiel `shared/chatModels.test.ts:7`: `qwen3.5:4b` mit
  `vision`).
- Cloud-Freigabe des Chats: `petrolCloudAllowed` (`shared/webChat.ts`), Routen-Preflight wie beim
  Agenten. Harte Regel aus dem Nutzergedächtnis: keine personenbezogenen Daten ohne eigenes Opt-in
  in die Cloud, Transparenz statt Sperre.

## Entwurf (Claude)

> **Rev. 2 (01.11.2026, nach Codex-Runde 1):** Die verbindlichen Festlegungen stehen unter
> „Claude-Antwort → Rev. 2“. Wo der Text unten widerspricht, gilt Rev. 2.

### Teil 1 — Gespräche speichern

**Was der Nutzer sieht:** Links im Agent-Tab (im Chat-Modus) eine einklappbare Liste
„Gespräche“, neueste oben, Titel = erste Frage (gekürzt, kein Modellaufruf). Knöpfe: neues
Gespräch, umbenennen, löschen, „alle löschen“. Ein geschlossener Tab verliert nichts mehr. Ein
neuer Tab startet leer und bietet die Liste an.

**Speicherort: `userData/petrol-chats/<vault-hash>/<id>.json`, nicht im Vault.**
- Nicht im Vault, weil der Vault synchronisiert und indexiert wird (Vault-Index, Smart
  Connections). Ein Chat mit Mail-Inhalten soll nicht über den Sync-Server wandern und nicht als
  Suchtreffer im Vault-Chat auftauchen.
- Pro Vault getrennt, weil Gespräche Bezug auf Notizen eines Vaults haben.
- Wer ein Gespräch behalten oder teilen will, nutzt „Als Notiz speichern“ (gibt es schon).
- Nachteil: kein Gespräch auf dem Zweitgerät. Das ist so gewollt und muss in den Einstellungen
  stehen.

**Verschlüsselung:** Vorschlag `electron.safeStorage` wie bei den Zugangsdaten. Bekannte Falle:
unter Linux mit Hyprland (Arch-Rechner) ist safeStorage nicht verfügbar. Dann **nicht** still im
Klartext speichern, sondern ohne Speicherung weiterlaufen lassen und das in der Liste sagen
(„Gespräche werden auf diesem Rechner nicht gespeichert, weil …“). Frage an Codex: Reicht
safeStorage hier, oder ist das Theater, weil `userData` ohnehin nur dem Nutzer gehört?

**Aufbewahrung:** Standard 90 Tage seit letzter Nachricht, einstellbar (30 / 90 / 365 / nie
löschen). Wie bei `contextMemory`. Aufräumen beim Start, nie während ein Gespräch offen ist.

**Format:** genau die heutigen `PetrolChatMessage`-Objekte plus Kopf
(`version`, `id`, `title`, `createdAt`, `updatedAt`, `model` der letzten Antwort). Gestoppte und
fehlerhafte Nachrichten bleiben drin, mit ihren Markierungen. Schreiben nur bei geändertem Inhalt
(Loop-Falle aus dem Workflow-Canvas), atomar über Temp-Datei + Rename.

**Webantworten nach dem Neustart:** Die eingefrorenen Auszüge liegen nur im Speicher. Vorschlag:
Quellen, Prüfbericht und Antwort werden gespeichert, die Auszüge nicht. Nach dem Neustart ist
„Hiermit weiterfragen“ an alten Antworten **ausgegraut mit Grund** („Die Seiten dieser Antwort
liegen nicht mehr vor. Neu suchen?“). Die stille Vormerkung als Nachfrage
(`chat-antwortqualitaet-und-globus.md`) darf bei geladenen Gesprächen nicht greifen, weil der
Snapshot fehlt. Auszüge zu speichern wäre möglich, kostet aber Platz und speichert fremde
Webseiten auf Platte. Erst wenn Nutzer es vermissen.

**Bewusst nicht in Teil 1:** ein Gedächtnis über Gespräche hinweg („Petrol weiß noch, dass ich
Lehrer bin“). Das wäre ein eigener Datenweg in jeden Prompt und braucht eine sichtbare, editierbare
Liste. Der Agent hat mit `memorySuggestion.ts` schon einen Ansatz, darauf später aufbauen.

### Teil 2 — Notizen ausdrücklich ins Gespräch holen

**Kein Werkzeug-Loop für Notizen im Chat (vorerst).** Gründe:
- Codex F04 aus `chat-und-agent.md` gilt weiter: Ein Loop mit 27B-Modell braucht Minuten, ein
  Chat muss in Sekunden antworten.
- Die Zusage „liest keine Notizen von selbst“ ist einfach zu verstehen und im Main erzwungen. Ein
  Modell, das selbst entscheidet, welche Notizen es liest, macht daraus „liest, was es für nötig
  hält“. Über einen Cloud-Weg heißt das: Inhalte gehen hinaus, die der Nutzer nie ausgewählt hat.
- Der Auftrag kann das schon („Im Auftrag weitermachen …“).

**Stattdessen zwei ausdrückliche Wege:**

**2a — Notiz anhängen (Büroklammer oder `[[` im Eingabefeld).** Der Nutzer wählt eine oder mehrere
Notizen. Sie erscheinen als Marken über dem Eingabefeld. Der Main liest sie selbst (über
`assertSafePath`, nur `.md`, nicht `.mindgraph`) und setzt sie als UNTRUSTED-Kontext abgegrenzt in
den Prompt, wie `main/noteAgent/chatContext.ts`. Der Renderer schickt nur Pfade, nie Inhalte.
Grenzen: höchstens 5 Notizen, je 8 000 Zeichen, bei Kürzung ein sichtbarer Hinweis an der Marke.
Die Zusage in der Statuszeile wird zu: **„Liest nur Notizen, die Sie anhängen.“**

**2b — Vault-Knopf neben dem Globus.** Wie der Globus, aber für den Vault: Die Frage läuft über den
bestehenden Weg `vault-rag-answer` (Treffer, Fußnoten, Satzprüfung, Quellen zweigeteilt). Nur
sichtbar, wenn der Vault-Index abfragbar ist (`isQueryable`). Der Vault-Chat bleibt wie heute
**nur lokal**, daran ändert sich nichts.

**Cloud-Weg bei 2a:** Transparenz statt Sperre (Nutzerentscheidung 24.09.2026), aber mit klarer
Anzeige. Ist der Chat auf einem Cloud-Weg, steht an jeder angehängten Notiz „geht an
OpenRouter“. Vorschlag zusätzlich: Notizen aus dem Mail-Ordner (`‼️📧 - emails/` bzw. dem
konfigurierten Ordner) und aus dem Brain-Ordner werden beim Anhängen auf Cloud-Wegen mit einer
Rückfrage bestätigt. Begründung: Für Mail gibt es die harte Regel „Cloud nur per eigenem Opt-in“.
Frage an Codex und an den Nutzer: Rückfrage oder nur Kennzeichnung?

**Im gespeicherten Verlauf (Teil 1)** stehen nur Pfad und Hash der angehängten Notiz, nicht der
Inhalt. Beim Weiterschreiben eines alten Gesprächs liest der Main die Notiz neu. Ist der Hash
anders, steht an der Marke „Notiz hat sich seitdem geändert“. Fehlt sie, „Notiz nicht mehr
vorhanden“, und sie geht nicht in den Prompt.

### Teil 3 — Bilder verstehen

**Was der Nutzer sieht:** Bild ins Eingabefeld ziehen, einfügen (⌘V) oder per Büroklammer wählen.
Vorschaubild als Marke. Darunter, wenn nötig, ein Hinweis zum Modell.

**Modell prüfen, nie still verwerfen.** Das Bild geht nur an ein Modell, das `vision` meldet
(Ollama `/api/tags`). Kann das gewählte Modell keine Bilder:
- Gibt es ein lokales Vision-Modell, bietet die Marke an: „Mit <Modell> ansehen“ (nur für diese
  Nachricht).
- Sonst: „Text aus dem Bild lesen“ über die bestehende Vision-OCR bzw. Apple Vision OCR. Der
  erkannte Text wird sichtbar als Anhang eingefügt, der Nutzer sieht, was das Modell bekommt.
- Kein stiller Rückfall. Eine Antwort ohne Bild, die so tut, als hätte das Modell es gesehen, wäre
  der schlimmste Fall.
- LM Studio meldet keine Fähigkeiten: Bild schicken, Fehler verständlich übersetzen
  (`friendlyOllamaError`-Muster).

**Bild aufbereiten im Renderer, vor dem Senden:** über ein Canvas neu kodieren, lange Seite
höchstens 1600 px, JPEG. Das spart Kontext und **entfernt EXIF-Daten**, also auch GPS-Position und
Gerät. Das ist für Handyfotos wichtig, besonders auf Cloud-Wegen.

**Cloud:** OpenRouter und LLMBase erwarten das OpenAI-Format (`content` als Liste mit
`image_url`). `chatClient.ts` schickt heute nur Text-`content`. Das ist eine eigene Erweiterung.
Vorschlag: Bilder in Stufe 3a nur lokal (Ollama), Cloud in 3b. Auf Cloud-Wegen steht an der Marke
„Bild geht an …“, wie bei Notizen.

**Verlauf:** Ollama schickt jedes Bild bei jeder Folgenachricht erneut durch den Encoder. Bei drei
Fotos im Gespräch wird jede Antwort langsam. Vorschlag: Ein Bild geht nur in der Runde ans Modell,
in der es angehängt wurde. Danach steht im Verlauf für das Modell
„[Bild: whiteboard.jpg, in Runde 2 angehängt]“ plus die eigene Antwort von damals. Fragt der
Nutzer später erneut nach dem Bild, gibt es an der Marke „erneut zeigen“. Gespeichert (Teil 1)
wird das aufbereitete Bild in `userData/petrol-chats/<vault-hash>/media/`, mit demselben
Löschzyklus wie das Gespräch.

**Ehrliche Anzeige:** Vision-Modelle erfinden gern Text in Bildern, besonders bei Handschrift und
kleinen Zahlen. An Antworten zu einem Bild steht klein: „Bildinhalt vom Modell gelesen, nicht
geprüft.“ Zahlen aus dem Bild nie als belegt markieren.

**Erst messen** (Nutzerregel „Erst messen, dann tunen“): kleines Prüfset mit 12 Bildern
(Whiteboard, Formular, Handschrift, Screenshot einer Tabelle, Diagramm, Foto ohne Text) mit
erwarteten Fakten. Kandidaten: `qwen3.5:4b` (8-GB-Rechner), ein größeres Qwen-VL, Gemma mit
Vision. Ergebnis als eigenes Modul `vision-chat` in `modelCompatibility.ts`, erst danach eine
Empfehlung im Hinweis.

**Nicht in Teil 3:** Bilder im Agenten (`read_context_file`), PDF-Scans im Chat, Videos. PDFs
laufen weiter über die vorhandene OCR. Bilder im Agenten: Teil 4 (Rev. 5). Der Cloud-Bildweg aus
3b wird mit dem Agenten zusammen gebaut, siehe Punkt 19.

### Reihenfolge

1. **Teil 1 (Verlauf).** Grundlage für alles andere, und das Format muss Anhänge und Bilder von
   Anfang an kennen (`version` + Felder `attachments`, `images`).
2. **Teil 3a (Bilder lokal).** Klein, abgeschlossen, großer Nutzen für die Zielgruppe, kein neuer
   Weg nach draußen.
3. **Teil 2a (Notiz anhängen)**, dann **2b (Vault-Knopf)**.
4. **Teil 3b (Bilder über Cloud)** nach dem Prüfset.

## Fragen an Codex

1. **Speicherort und Schutz:** Trägt `userData` statt Vault? Bringt safeStorage hier echten Schutz,
   oder reicht Dateirecht 0600? Wie verhält es sich, wenn ein Vault umbenannt oder verschoben wird
   (Hash über Pfad?)
2. **Snapshots:** Bricht etwas, wenn geladene Webantworten keinen Snapshot haben? Prüfe
   besonders die automatische Nachfrage-Vormerkung und „Erneut senden“ im `petrolChatStore`.
3. **Teil 2a:** Ist die Grenze „Renderer schickt nur Pfade, Main liest“ an jeder Stelle haltbar,
   auch für `[[`-Autocomplete und für Notizen außerhalb von `notesRootFolder`? Welche Prüfungen aus
   `contextFiles.ts` müssen übernommen werden?
4. **Mail-Notizen auf Cloud-Wegen:** Rückfrage oder Kennzeichnung? Woran erkennt man zuverlässig
   eine Mail-Notiz (Ordner, Frontmatter)?
5. **Bilder:** Stimmt die Annahme, dass Ollama Bilder im Verlauf jedes Mal neu kodiert? Ist das
   Ersetzen alter Bilder durch einen Platzhalter fachlich haltbar, oder verliert das Modell damit
   den Faden? Was macht LM Studio mit `images`?
6. **EXIF:** Entfernt die Neukodierung über Canvas EXIF zuverlässig, auch bei HEIC aus der
   iPhone-Zwischenablage? Muss die Ausrichtung vorher angewendet werden?
7. **Ollama-Aktivität und Vault-Indexer:** Muss ein Bild-Chat anders als Vordergrund zählen
   (Encoder-Last)?
8. **Reihenfolge:** Würdest du anders schneiden?

## Offene Nutzerentscheidungen

- Aufbewahrung: Standard 90 Tage?
- Mail-/Brain-Notizen auf Cloud-Wegen: Rückfrage oder nur Kennzeichnung?
- Bilder in Stufe 3a nur lokal?

## Codex-Findings

### F01 — Die Webauszüge stehen bereits im zu speichernden Nachrichtentyp
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:70-81
Status: [OFFEN]
„Heutige `PetrolChatMessage`-Objekte“ speichern die Auszüge doch: Die fertige Antwort übernimmt `r` vollständig in `web` (`app/src/renderer/stores/petrolChatStore.ts:303-310`); `WebChatResult.sources` enthält `WebSource.excerpt` (`app/src/shared/webChat.ts:213-224,266-283`). Auch `webPartial.sources` bei gestoppten Antworten enthält Auszüge (`app/src/renderer/stores/petrolChatStore.ts:353-356`). Der Entwurf widerspricht sich und würde fremde Seitentexte dauerhaft verschlüsselt auf Platte legen. Nur `snapshotId` aus dem JSON zu entfernen reicht nicht.
Vorschlag: Persistenz-DTO mit expliziter Feldliste bauen; aus `sources`/`webPartial.sources` die `excerpt`-Felder entfernen und Anzeige, Export sowie Prüfbericht nach Laden mit Metadaten ohne Auszüge testen. Wenn der Prüfbericht Auszüge zur Darstellung braucht, diesen Datenbedarf ausdrücklich entscheiden.

### F02 — Snapshot-Verfügbarkeit ist weder aus der Nachricht noch aus dem Alter ableitbar
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:75-80
Status: [OFFEN]
Snapshots laufen schon nach drei Stunden ab, fallen oberhalb von 30 pro Absender heraus und sind an `senderId` und `scopeId` gebunden (`app/src/main/llm/petrolWebSnapshots.ts:21-45,62-65`). „Neues Gespräch“ und Tab schließen löschen sie (`app/src/renderer/stores/petrolChatStore.ts:372-385`), Fensterende ebenso (`app/src/main/index.ts:6817-6824`). Der Knopf „Hiermit weiterfragen“ erscheint allein wegen `msg.web.snapshotId` (`app/src/renderer/components/Agent/PetrolChat.tsx:502-511`); die automatische Vormerkung setzt ebenfalls allein diese Kennung (`app/src/renderer/stores/petrolChatStore.ts:311-315`). `followUpMissing` prüft nur, ob eine passende *Nachricht* vorhanden ist, nicht den Main-Snapshot (`app/src/renderer/components/Agent/PetrolChat.tsx:157-163,270-273`). Das Problem besteht also auch ohne Neustart; beim Laden ist jede alte Kennung ungültig.
Vorschlag: Snapshot-Kennung nur als flüchtigen Laufzustand behandeln; beim Laden und nach Ablauf/Fehler `followUp` löschen, Knopf deaktivieren und Grund zeigen. Für noch offene Tabs Verfügbarkeit im Main abfragen oder einen `snapshotGone`-Fehler in einen dauerhaften UI-Status überführen.

### F03 — „Erneut senden“ kann einen abgelaufenen Snapshot erneut benutzen
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:75-80
Status: [OFFEN]
Bei einer gescheiterten Nachfrage bleibt `followUpSnapshotId` an der Frage (`app/src/renderer/stores/petrolChatStore.ts:248-253`); der Fehlerknopf ruft `send(question.content, question.followUpSnapshotId, question)` auf, sofern *diese* Antwort kein `snapshotGone` trägt (`app/src/renderer/components/Agent/PetrolChat.tsx:604-617`). `send` bevorzugt die Kennung auch dann, wenn der Globus inzwischen anders geschaltet ist (`app/src/renderer/components/Agent/PetrolChat.tsx:295-316`). Nach Neustart, TTL oder Tabwechsel kann damit ein gespeicherter Fehler wiederholt werden, bis der Main erneut „Snapshot weg“ meldet (`app/src/main/index.ts:6953-6962`).
Vorschlag: Beim Laden jede `followUpSnapshotId` für Wiederholung als nicht verfügbar markieren und eine explizite neue Websuche anbieten; alte Fehler nicht blind als Snapshot-Nachfrage wiederholen.

### F04 — „Nur Pfade“ plus `assertSafePath` bindet eine Notiz nicht an den aktiven Vault
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:99-104
Status: [OFFEN]
`assertSafePath` akzeptiert jeden Pfad innerhalb *irgendeines* freigegebenen Vault-Roots (`app/src/main/index.ts:1361-1388`). Der vorhandene Anhang-IPC prüft zusätzlich `assertApprovedVault(vaultPath)`, löst den gewählten Pfad kanonisch auf und bindet die Registrierung an dessen Root (`app/src/main/index.ts:4486-4502`); beim späteren Lesen wird der Root erneut geprüft (`app/src/main/noteAgent/contextFiles.ts:48-60,770-774`). Eine neue Chat-IPC mit bloßen absoluten Renderer-Pfaden und einmaligem `assertSafePath` könnte deshalb eine Notiz aus einem anderen freigegebenen Vault oder nach einem Symlink-Tausch lesen. Die `.md`-Grenze gehört in den Main, nicht in den `[[`-Picker.
Vorschlag: Aktuellen Vault explizit übergeben und mit `assertApprovedVault` prüfen; relative Notizpfade vor dem Join ablehnen/normalisieren, kanonischen Pfad auf *diesen* Root begrenzen, Typ/Dateigröße vor dem Lesen prüfen und vor **jedem** Send erneut kanonisch lesen. Für `[[` nur Treffer aus der aktuellen Vault-Notizliste anbieten; auch Notizen außerhalb `notesRootFolder` zulassen, denn diese Einstellung steuert neue Arbeitsnotizen (`app/src/renderer/stores/uiStore.ts:704`), nicht die Sicherheitsgrenze.

### F05 — Geänderte Notizen und alter Modellverlauf geraten auseinander
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:118-121
Status: [OFFEN]
Der Store baut jeden neuen Modellaufruf aus abgeschlossenen früheren Fragen und Antworten (`app/src/renderer/stores/petrolChatStore.ts:224-235,318-323`); `chatHistoryForModel` filtert nur `origin: web` und `origin: vault-rag` (`app/src/renderer/utils/chatHistory.ts:17-24`). Wenn eine angehängte Notiz später geändert oder gelöscht wird, können ihre Inhalte in einer früheren *Assistentenantwort* weiter im Modellverlauf stehen, obwohl die Marke „geändert“ oder „nicht vorhanden“ sagt. Dasselbe gilt beim Umschalten von lokal auf Cloud. Pfad+Hash dokumentiert zudem nicht den tatsächlich gesendeten Ausschnitt oder die Kürzung.
Vorschlag: Pro Wechsel Herkunft und freigegebene Datenbasis modellieren; bei geänderter/fehlender Notiz die Fortsetzung explizit neu starten oder frühere Antworten aus dem Modellkontext ausschließen. Gesendeten Hash, Ausschnittlänge und Kürzungsstatus pro Anfrage auditierbar halten, ohne automatisch den ganzen Inhalt zu persistieren.

### F06 — Cloud-Freigabe muss im Main und für den gesamten ausgehenden Verlauf gelten
Schwere: kritisch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:111-116
Status: [OFFEN]
Der normale Petrol-Chat reicht `history` an den Cloud-Aufruf weiter (`app/src/renderer/stores/petrolChatStore.ts:230-232,318-323`); der Main bildet alle Nachrichten in den Cloud-Request ab (`app/src/main/index.ts:6557-6588`). Anders als `petrol-chat-web` mit `petrolCloudAllowed` (`app/src/main/index.ts:6903-6912`) prüft `ollama-chat` für Petrol nur, ob sich ein Cloud-Key auflösen lässt; `resolveCloudChatOptions` kontrolliert lediglich Modell, Provider und Key (`app/src/main/index.ts:6572-6588,11572-11583`). Die heutige Feature-Freigabe steckt in der Renderer-Modellauswahl (`app/src/renderer/components/Agent/PetrolChat.tsx:202-206`). Neue Notiztexte dürfen nicht auf dieser impliziten Grenze beruhen; bei einem späteren Cloud-Wechsel wandern außerdem frühere lokale Antworten mit. Eine Marke „geht an OpenRouter“ an **aktuellen** Anhängen beschreibt diese Datenwege nicht vollständig.
Vorschlag: Für Notiz-Anhänge Main-seitig gespeichertes `notes-chat`-Opt-in, konkreten Anbieter und Modell prüfen; vor jedem Cloud-Send den *gesamten* ausgehenden Prompt samt historischer Notiz-/Bildinhalte ausweisen und eine eigene Freigabe für diesen Datenweg verlangen. Entsprechende Prüfung auch für `lmstudio-chat`/Ollama-Cloud-Routen festlegen.

### F07 — Mail-Erkennung über Ordner allein verfehlt Kopien und umbenannte Notizen
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:111-116
Status: [OFFEN]
Der Mailordner ist konfigurierbar (`app/src/renderer/stores/uiStore.ts:1205`; `app/src/main/index.ts:13353-13357`), und erzeugte Mailnotizen tragen `email-id` im Frontmatter (`app/src/main/index.ts:13570`). Ein Nutzer kann solche Notizen verschieben oder kopieren; Ordnerklassifikation allein ist daher keine verlässliche Personendaten-Erkennung. Der Brain-Ordner ist ebenfalls konfigurierbar (`app/src/main/index.ts:15530-15535`). Die Frage „Rückfrage oder Kennzeichnung?“ greift zu kurz: `notes-chat`-Opt-in erteilt keine konkrete Freigabe für den **Inhalt** jeder neu angehängten Mail, und historische Antworten können den Inhalt mitführen (F05/F06).
Vorschlag: Für Mail/Brain vor dem Cloud-Send eine ausdrückliche, an diese Anfrage und den tatsächlichen Anbieter gebundene Bestätigung. Ordner **und** Frontmatter (`email-id`) als Warnsignale nutzen, unbekannte/personenbezogene Notizen nicht als sicher klassifizieren; auch allgemein den gesamten Prompt statt nur die aktuelle Marke anzeigen.

### F08 — Vault-Knopf ist kein weiterer Modus desselben Chat-Aufrufs
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:106-109
Status: [OFFEN]
`vault-rag-answer` hat eigene IPC-Streaming-Kanäle, Abbruchkennung und Main-seitig erzwungenes lokales Modell (`app/src/main/index.ts:8779-8817,8844-8857`); der Petrol-Store kennt nur Petrol-Text/Web und deren Abbruch (`app/src/renderer/stores/petrolChatStore.ts:224-323,340-369`). `isQueryable` ist bislang nur eine interne Manager-Methode und prüft Indexdateien/Embed-Modell, nicht die volle Abfragebereitschaft (`app/src/main/rag/vaultRagManager.ts:652-670`); die Renderer-IPC `vault-rag-status` liefert Status statt dieses Booleschen Wertes (`app/src/main/index.ts:8699-8705`; `app/src/shared/types.ts:1053`). Zudem filtert `chatHistoryForModel` Vault-Wechsel nur, wenn sie `origin: 'vault-rag'` tragen (`app/src/renderer/utils/chatHistory.ts:19-24`).
Vorschlag: Vault-Wechsel mit eigener Nachricht-/Ergebnisform, Stream-Zuordnung, Stopp, Quellenanzeige und `origin: 'vault-rag'` integrieren; `isQueryable` Main-seitig exponieren oder den Status korrekt auswerten. Bei Indexwechsel den tatsächlichen Fehler sichtbar zeigen.

### F09 — `vision` in `/api/tags` ist eine Eignungsanzeige, keine lokale Sicherheitsgarantie
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:128-137
Status: [OFFEN]
Der Parser reicht `capabilities` sowie `remote_model`/`remote_host` getrennt durch (`app/src/main/ollamaCapabilities.ts:40-63`); der Chat-Picker filtert derzeit nur auf `completion` und lässt Einträge ohne Capability-Feld zu (`app/src/shared/chatModels.ts:8-26`; `app/src/renderer/components/Agent/PetrolChat.tsx:184-206`). Ein `vision`-Flag allein beweist also weder `completion` noch lokale Ausführung, und ältere Ollama-Versionen können die Fähigkeit nicht melden (`app/src/main/ollamaCapabilities.ts:30-33`). Die bestehende Vision-OCR-Modellliste verwendet sogar nur Namensmuster (`app/src/main/index.ts:7333-7344`).
Vorschlag: Für Bilder `vision` **und** `completion` prüfen, bei fehlender Angabe `/api/show`/Testaufruf nutzen und vor dem Send die lokale Route samt Remote-Metadaten wie beim Vault-Chat erzwingen. Ein `*:cloud`/Remote-Modell darf nicht unter „3a nur lokal“ laufen.

### F10 — Bild- und Text-Fallback brauchen je Backend einen eigenen Request-Typ
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:128-145
Status: [OFFEN]
`vision-ocr-extract-page` zeigt nur einen **einzelnen** Ollama-Aufruf mit `images: [base64Image]`, ohne Verlauf und ohne Main-seitige Modellprüfung (`app/src/main/index.ts:9614-9646`). `ollama-chat` und `lmstudio-chat` typisieren Nachrichten dagegen mit `content: string` und senden sie so weiter (`app/src/main/index.ts:6453,6604-6617,7640,7712-7723`); `ChatMessage`/`streamCloudChat` sind ebenfalls textbasiert (`app/src/main/llm/chatClient.ts:45-54,917-926`). LM Studio versteht laut [eigener Dokumentation](https://lmstudio.ai/docs/developer/openai-compat) Bildteile in OpenAI-kompatiblen Chat-Completions, aber **kein** Ollama-`images`-Feld. „Bild schicken, Fehler übersetzen“ prüft nicht, ob es überhaupt beim Modell angekommen ist.
Vorschlag: Getrennte, validierte Payloads für Ollama-`images` und LM-Studio/OpenAI-`image_url`; Erfolg nur melden, wenn die jeweilige Schnittstelle Bildinput unterstützt. OCR-Fallback sichtbar als *Text aus OCR* kennzeichnen und nicht als gesehenes Bild.

### F11 — Bild nur in der ersten Runde entfernt entscheidenden Gesprächskontext
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:148-154
Status: [OFFEN]
Ollamas API erwartet den Chatverlauf als `messages`-Array und Bilddaten an der betreffenden Nachricht ([Ollama Vision](https://docs.ollama.com/capabilities/vision), [Chat API](https://docs.ollama.com/api/chat)); der vorhandene Petrol-Store sendet bei jeder Folgefrage die aus Text gebaute Historie erneut (`app/src/renderer/stores/petrolChatStore.ts:230-232,318-323`). Werden alte Bilder durch Platzhalter ersetzt, sieht das Modell nur seine möglicherweise fehlerhafte frühere Beschreibung. Bei „Was steht links unten?“ oder Korrektur einer Zahl ist das fachlich nicht dasselbe Bild. Die Behauptung „jedes Bild bei jeder Folgenachricht erneut durch den Encoder“ ist für diese App **noch nicht gemessen**; aus dem Requestformat folgt erneute Übertragung, nicht zwingend fehlender Server-Cache.
Vorschlag: Standardverhalten anhand Latenz, `prompt_eval_cached_count` und Speicher messen; Bildfragen explizit an das ursprüngliche Bild binden und bei Bedarf das Bild erneut senden. Textplatzhalter als Kontextverlust kenntlich machen, nicht als vollwertige Fortsetzung.

### F12 — Canvas-Neukodierung setzt erfolgreiche Dekodierung und korrekte Orientierung voraus
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:139-141
Status: [OFFEN]
Ein frisch aus Pixeln erzeugtes JPEG enthält gewöhnlich keine EXIF-Metadaten des Originals; das hilft nur, **wenn** Clipboard/Datei als Bild dekodiert, korrekt ausgerichtet und ausschließlich die neue Datei übertragen und gespeichert wird. `createImageBitmap` verwendet standardmäßig EXIF-Orientierung; `drawImage` hatte browserabhängige Orientierungsprobleme ([MDN createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap), [MDN drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage)). Für HEIC gibt der Entwurf keinen abgesicherten Dekodierweg an; das vorhandene Clipboard/Bild-Handling belegt einen solchen Chat-Weg nicht, die PDF-OCR nimmt bereits Base64 entgegen (`app/src/main/index.ts:9614-9639`).
Vorschlag: Formatdetektion und Dekodierfehler explizit behandeln; iPhone-HEIC aus Datei und Zwischenablage sowie EXIF-Orientierungen 1–8 mit echten Beispielen prüfen. Vor Speichern/Senden das resultierende JPEG auf Metadatenfreiheit und sichtbare Orientierung testen; Originaldateiname und Originalbytes nicht als Fallback übertragen.

### F13 — Aufbewahrung, Medien und Vault-Wechsel brauchen eine gemeinsame Löschregel
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:52-73,148-154
Status: [OFFEN]
Die vorgeschlagene JSON-Datei und `media/` haben unterschiedliche Lebenszyklen, falls „Gespräch löschen“, „alle löschen“, 90-Tage-Aufräumen oder ein unterbrochener Schreibvorgang nur eine Seite entfernt. Der heutige Store kennt lediglich Tab-Scope und `clear`/`dispose` (`app/src/renderer/stores/petrolChatStore.ts:85-104,372-387`); der Agent-Tab ist sogar fensterweit eindeutig und nicht vaultgebunden (`app/src/renderer/stores/tabStore.ts:224-235`), während `notesStore.setVaultPath` den Pfad separat setzt (`app/src/renderer/stores/notesStore.ts:95-101`). Eine aktive Unterhaltung könnte beim Vault-Wechsel im falschen Vault fortgesetzt oder gespeichert werden. Ein Hash über den absoluten Pfad trennt zwar Vaults, aber Verschieben/Umbenennen erzeugt einen neuen Schlüssel (Vorbild: `app/src/main/activityLedger.ts:32-35`).
Vorschlag: Gesprächs-ID und aktiven Vault im Store binden; bei Vault-Wechsel auf andere Gespräche umschalten und laufende Requests sauber abbrechen. Medien per Referenzzähler/Manifest dem Gespräch zuordnen und Lösch-/Crash-Recovery als Einheit definieren. Für verschobene Vaults eine explizite Migration oder den Verlust der Zuordnung als Produktentscheidung nennen.

### F14 — `safeStorage` hat Nutzen, aber 0600 und Schlüsselausfall bleiben getrennte Fragen
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:52-68
Status: [OFFEN]
`userData` trennt die Chats vom Vault-Sync und vom Vault-Index; es verhindert keine Betriebssystem-Backups oder andere Synchronisation des Profilordners (die App nutzt denselben Ort für lokale Protokolle, `app/src/main/activityLedger.ts:1-11`). Dateirechte `0600` schützen gegen andere Benutzerkonten, nicht gegen Prozesse unter demselben Konto oder Backup-Kopien. `safeStorage` bietet auf macOS zusätzlichen Keychain-Schutz, unter Windows vor allem Schutz gegen andere Benutzerkonten und unter Linux je nach Schlüsselbund unterschiedliche Garantien ([Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)). Der dokumentierte Hyprland-Fall mit `basic_text` ist real (`app/src/main/index.ts:11155-11170`). Der Entwurf sagt nicht, was bei *späterem* Schlüsselverlust mit bereits gespeicherten Chats passiert; auch die Medien sollen denselben Schutz erhalten.
Vorschlag: Vertraulichkeitsziel und Wiederherstellbarkeit benennen; JSON **und** Medien verschlüsseln, Dateien/Verzeichnisse restriktiv anlegen, Schlüssel-/Entschlüsselungsfehler sichtbar und ohne Klartext-Fallback behandeln. Wenn Speichern ausfällt, Chatfunktion weiter erlauben, aber das betroffene Gespräch nicht als dauerhaft gesichert anzeigen.

### F15 — Reihenfolge: Datenvertrag und Privacy-Grenzen vor Bild-UX
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:169-176
Status: [OFFEN]
Teil 1 soll schon `attachments` und `images` definieren, obwohl die Persistenzabbildung für Webquellen falsch ist (F01) und Bild-/Notizwechsel eigene Datenwege und Verlaufsregeln brauchen (F05/F06/F10). Ein Schema mit leeren Feldern löst diese Entscheidungen nicht. Der Vault-Knopf hat zusätzlich eigene Stream-/Abbruchmechanik (F08), während Bild 3a ebenfalls Main-/Preload-/Store-Verträge verändert (`app/src/main/index.ts:6453,6604-6617,8779-8817`).
Vorschlag: Zuerst Persistenz-DTO, Lösch-/Vault-Wechsel und Snapshot-Restore vollständig festlegen und umsetzen; dann Notiz-Anhänge samt Main-Sicherheits- und Cloud-Gate, danach Vault-Modus als eigener Wechsel. Bilder erst nach festem Medien-/Request-Vertrag und dem Prüfset integrieren; lokale Bilder können unabhängig von 2b vorgezogen werden, sobald die Grenzen stehen.

### F16 — Bildchat zählt als Vordergrund, der vorhandene OCR-Fallback nicht
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:128-135,195-196
Status: [OFFEN]
Ein Bildaufruf über den bestehenden `ollama-chat`-Handler würde bereits während des ganzen lokalen Laufs als Vordergrund zählen (`app/src/main/index.ts:6453,6695-6700`; `app/src/main/rag/ollamaActivity.ts:89-128`); der Vault-Indexer wartet vor Embeddings auf diesen Zähler (`app/src/main/rag/vaultIndexer.ts:275-277`). Encoder-Last braucht keine eigene Gewichtsklasse. Der vorgeschlagene Fallback über `vision-ocr-extract-page` hat aber keinen `withOllamaActivity`-Wrapper (`app/src/main/index.ts:9614-9646`), sodass Indexer und OCR gleichzeitig rechnen können. Ein neuer Bild-IPC könnte die Abdeckung ebenfalls umgehen.
Vorschlag: Jeden **lokalen** Ollama-Bildpfad einschließlich OCR in denselben Vordergrund-Zähler aufnehmen, Cloud- und LM-Studio-Wege ausnehmen; Abbruch und Fehler müssen den Zähler über `finally` freigeben (`app/src/main/rag/ollamaActivity.ts:80-87`).

### F17 — Anhänge und Globus haben noch keinen definierten gemeinsamen Datenweg
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:99-116
Status: [OFFEN]
Beim eingeschalteten Globus geht der Petrol-Store über `petrolChatWeb` und schickt Frage, Verlauf, Modellweg und Snapshot-Kennung, aber weder Kontext noch Anhang-IDs (`app/src/renderer/stores/petrolChatStore.ts:266-283`). Die Web-IPC nimmt nur diese Form entgegen und plant Suchen aus `question` (`app/src/main/index.ts:6836-6869,7051`; `app/src/main/llm/petrolWebLoop.ts:340-355`). Ein nach 2a angehängter Zettel würde bei Webfragen entweder still ignoriert oder erst durch eine neue Integration in Suchplanung und Modellprompt gelangen. Letzteres kann personenbezogene Notizinhalte auch als Suchanfrage an den Suchanbieter geben, unabhängig vom gewählten *Modell*-Cloud-Weg. Die vorgeschlagene Marke „geht an OpenRouter“ erfasst diesen Weg nicht.
Vorschlag: Für Globus+Anhang eine ausdrückliche Produktregel festlegen: Kombination sperren oder den Anhang ausschließlich dem Antwortmodell als gesonderten Kontext geben und aus Suchplanung/Suchworten heraushalten. Vor dem Senden alle tatsächlichen Empfänger nennen. Dasselbe gilt für „Hiermit weiterfragen“ mit angehängten Notizen, das derzeit nur die eingefrorenen Webauszüge kennt (`app/src/main/index.ts:6953-6967`).

### Runde 2 – Nachprüfung

Nachprüfung F01: teilweise – Rev. 2 definiert ein eigenes Persistenzformat ohne `excerpt` (`docs/codex-collab/chat-verlauf-notizen-bilder.md:494-499`); die tatsächliche Hydrierung und der Widerspruch um die entfernte Snapshot-ID sind offen (F19). Der Laufzeittyp enthält weiterhin `excerpt` (`app/src/shared/webChat.ts:213-224`).

Nachprüfung F02: teilweise – `alive()` prüft Absender, Scope und TTL (`app/src/main/llm/petrolWebSnapshots.ts:53-59`), und der Store räumt eine verfallene Vormerkung ab (`app/src/renderer/stores/petrolChatStore.ts:194-205,245-258`). Für geladene Gespräche ohne gespeicherte ID kann die jetzige UI den angekündigten deaktivierten Knopf nicht zeigen (F19).

Nachprüfung F03: teilweise – Ein als verfallen erkannter Snapshot sperrt „Erneut senden“ (`app/src/renderer/components/Agent/PetrolChat.tsx:626-635`); die Wiederherstellung alter Fragen ohne `followUpSnapshotId` ist noch nicht definiert (`docs/codex-collab/chat-verlauf-notizen-bilder.md:494-499`).

Nachprüfung F04: gelöst – Rev. 2 verlangt Vault-Bindung, `validatePath`, kanonische Root-Prüfung und erneutes Lesen (`docs/codex-collab/chat-verlauf-notizen-bilder.md:512-516`); Umsetzung steht aus.

Nachprüfung F05: teilweise – Basis und Ausschluss geänderter Notizen sind vorgesehen (`docs/codex-collab/chat-verlauf-notizen-bilder.md:518-523`); indirekt aus solchen Antworten entstandene spätere Wechsel bleiben ungeklärt (F20).

Nachprüfung F06: teilweise – Der neue Main-Check schützt explizite OpenRouter-/LLMBase-Requests mit `notes-chat`-Freigabe (`app/src/main/index.ts:6572-6600`; `app/src/shared/webChat.ts:194-200`). Der lokale Ollama-Zweig kann ein Ollama-Cloud-Modell ohne dieses Gate ansprechen (F18). Vault-RAG bleibt über einen eigenen lokalen Handler (`app/src/renderer/components/NotesChat/NotesChat.tsx:757-763`; `app/src/main/index.ts:8803-8816`); Socratic/Grill laufen durch denselben geprüften `ollama-chat`-Cloud-Zweig (`app/src/renderer/components/NotesChat/NotesChat.tsx:828-844`). Der E-Mail-Modus behält sein separates `email-draft`-Gate (`app/src/main/index.ts:6559-6570`).

Nachprüfung F07: teilweise – Ordner **oder** `email-id`/`type: brain-day` sind im Plan genannt (`docs/codex-collab/chat-verlauf-notizen-bilder.md:531-534`), passend zu erzeugten Frontmatter-Feldern (`app/src/main/index.ts:13589-13595`; `app/src/main/brain/dailyConsolidation.ts:267-269`). Die Rückfrage ist noch eine offene Nutzerentscheidung (`docs/codex-collab/chat-verlauf-notizen-bilder.md:561-565`).

Nachprüfung F08: gelöst – eigener Vault-Wechseltyp, Stream, Abbruch und `isQueryable`-IPC sind spezifiziert (`docs/codex-collab/chat-verlauf-notizen-bilder.md:536-538`); Umsetzung steht aus.

Nachprüfung F09: gelöst – Rev. 2 verlangt `resolveLocalModel` sowie `vision` **und** `completion` (`docs/codex-collab/chat-verlauf-notizen-bilder.md:540-543`); Umsetzung steht aus.

Nachprüfung F10: gelöst – getrennte Ollama- und OpenAI-Bildnutzlasten sowie klarer OCR-Text sind spezifiziert (`docs/codex-collab/chat-verlauf-notizen-bilder.md:540-544`); Umsetzung steht aus.

Nachprüfung F11: teilweise – Folgefragen behalten bis zwei Bilder (`docs/codex-collab/chat-verlauf-notizen-bilder.md:545-548`), aber die Grenze „zwei“ ist vor der angekündigten Messung gesetzt; der Ersatz eines dritten älteren Bildes bleibt ein bewusster Kontextverlust.

Nachprüfung F12: gelöst – Orientierungstest, EXIF-Prüfung und Ablehnung von HEIC in 3a sind spezifiziert (`docs/codex-collab/chat-verlauf-notizen-bilder.md:549-551`); die Dekodierannahme muss mit echten Dateien geprüft werden.

Nachprüfung F13: teilweise – Ordner und Vault-Bindung sind festgelegt (`docs/codex-collab/chat-verlauf-notizen-bilder.md:501-510`), aber die Main-Snapshots sind noch an die Tab-ID statt Gesprächs-ID gebunden (F22; `app/src/renderer/stores/petrolChatStore.ts:185-187,418-427`).

Nachprüfung F14: gelöst – Verschlüsselung von JSON **und** Medien, Rechte und Fehlerfall sind festgelegt (`docs/codex-collab/chat-verlauf-notizen-bilder.md:501-510`); Umsetzung steht aus.

Nachprüfung F15: gelöst – die Reihenfolge beginnt jetzt mit Datenvertrag und Speicherung (`docs/codex-collab/chat-verlauf-notizen-bilder.md:553-559`).

Nachprüfung F16: teilweise – die Vordergrundzählung ist im Plan zugesagt (`docs/codex-collab/chat-verlauf-notizen-bilder.md:540-544`), `vision-ocr-extract-page` läuft im Code weiter ohne Wrapper (`app/src/main/index.ts:9636-9667`).

Nachprüfung F17: gelöst – Globus und Nachfragen mit Anhang werden in 2a gesperrt (`docs/codex-collab/chat-verlauf-notizen-bilder.md:527-529`); Umsetzung steht aus.

### F18 — Ollama-Cloud-Modelle umgehen das neue `notes-chat`-Gate
Schwere: kritisch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:458-462,518-526
Status: [OFFEN]
Die neue Prüfung läuft nur bei `cloud?.model` (`app/src/main/index.ts:6576-6582`). Ohne Cloud-Objekt geht `model` direkt an `${OLLAMA_API_URL}/api/chat` (`app/src/main/index.ts:6617-6623`); dort kann ein `*:cloud`-Modell oder ein neutrales Modell mit `remote_model`/`remote_host` über denselben lokalen Port tatsächlich extern rechnen (`app/src/main/rag/localModel.ts:1-10,94-117`). Die normalen Notiz-Chat-Wege schicken ausgewählten Modellnamen und Notizkontext auch ohne Cloud-Objekt (`app/src/renderer/components/NotesChat/NotesChat.tsx:815-844`); Petrol ebenso (`app/src/renderer/stores/petrolChatStore.ts:364-369`). Der Picker filtert nur `completion`, nicht Remote-Modelle (`app/src/shared/chatModels.ts:19-26`). Deshalb trägt die Aussage „Main prüft jeden Cloud-Weg“ nicht; mit Ollama-Cloud kann Notiz-/Mailtext ohne `notes-chat`-Opt-in hinausgehen.
Vorschlag: Vor jedem Ollama-`/api/chat` mit personenbezogenem Kontext Main-seitig `resolveLocalModel` ausführen oder den als Remote eingestuften Ollama-Weg an eine eigene gespeicherte Freigabe binden. Den Fall `cloud = null`, `model = '*:cloud'` und den Fall `remote_host` explizit testen.

### F19 — Ohne gespeicherte Snapshot-ID verschwindet der angekündigte deaktivierte Knopf
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:494-499
Status: [OFFEN]
Rev. 2 streicht `snapshotId`/`followUpSnapshotId` aus `StoredChatMessage`, will aber geladene Webantworten als „Seiten nicht mehr da“ markieren. Die jetzige Anzeige rendert den Nachfragen-Knopf **nur**, wenn `msg.web.snapshotId` existiert; erst innerhalb dieser Bedingung wählt sie aktiv oder deaktiviert (`app/src/renderer/components/Agent/PetrolChat.tsx:518-530`). `snapshotIdsIn` und der F02-Check sehen ohne ID ebenfalls nichts (`app/src/renderer/stores/petrolChatStore.ts:163-170,245-249`). Auch „Erneut senden“ erkennt eine ehemalige Nachfrage ohne `followUpSnapshotId` nicht als verfallen (`app/src/renderer/components/Agent/PetrolChat.tsx:626-635`). Der Text „gab es“ braucht also eine eigene persistente Struktur und eigene Rendering-Zweige; `goneSnapshots = alle` kann ohne Kennungen nicht wirken.
Vorschlag: Pro Antwort/Frage ein persistentes `hadSnapshot`/`wasFollowUp` speichern, nach Hydrierung ausdrücklich als verfallen anzeigen und Wiederholen einer alten Snapshot-Nachfrage sperren. Keine künstliche ID erzeugen, die der Main nie kannte.

### F20 — Die Datenbasis muss Vererbung durch spätere Antworten erfassen
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:518-526
Status: [OFFEN]
Rev. 2 speichert je Wechsel `basis.notes`, schließt bei geänderter Notiz aber nur „Wechsel, die auf dieser Notiz beruhen“ aus. Im bestehenden Chat gehen frühere Assistentenantworten ungefiltert in die nächste Modellanfrage (`app/src/renderer/stores/petrolChatStore.ts:275-279,364-369`; `app/src/renderer/utils/chatHistory.ts:19-24`). Beispiel: Antwort 1 zitiert eine angehängte Mail; Antwort 2 fasst Antwort 1 zusammen, ohne dass eine Notiz erneut angehängt ist. Wenn die Mail gelöscht wird oder der Nutzer danach Cloud wählt, wäre Antwort 2 mit leerem `basis.notes` weiterhin im Verlauf und könnte den Mailinhalt verraten. Der Plan definiert keine transitive Herkunft.
Vorschlag: Die Datenbasis jedes neuen Wechsels aus **allen** tatsächlich mitgesendeten Vorgängern und aktuellen Anhängen ableiten; beim Wegfall einer Quelle sämtliche davon abhängigen Nachfolger aus dem Modellverlauf nehmen. Für Cloud-Wechsel zusätzlich vor dem Send den effektiv gefilterten Verlauf Main-seitig prüfen.

### F21 — 200er-IPC-Grenze markiert ungeprüfte spätere Snapshots als verfallen
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:463-471
Status: [OFFEN]
Der Store sendet alle noch nicht als verfallen bekannten IDs und behandelt jede nicht zurückgegebene ID als weg (`app/src/renderer/stores/petrolChatStore.ts:245-258`). Der neue IPC prüft jedoch nur `ids.slice(0, 200)` (`app/src/main/index.ts:6850-6855`). Hat ein langer Verlauf mehr als 200 noch ungeprüfte Kennungen, kann eine gültige neue Kennung jenseits dieser Grenze nie in `alive` stehen und wird dauerhaft `goneSnapshots` hinzugefügt. Der Main bewahrt zwar höchstens 30 Snapshots pro Absender, aber gerade diese können am Ende einer langen Historie stehen (`app/src/main/llm/petrolWebSnapshots.ts:21-36`). Die Tests decken nur zwei Kennungen ab (`app/src/main/llm/petrolWebSnapshots.test.ts:40-52`).
Vorschlag: Im Renderer in 200er-Blöcken prüfen oder nur die ersten 200 IDs an den Main **und** an den Vergleich geben; bevorzugt die neuesten IDs zuerst prüfen.

### F22 — Snapshot-Scope bleibt Tab-ID, obwohl Rev. 2 mehrere Gespräche je Tab vorsieht
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:47-59,501-510
Status: [OFFEN]
Heute ist `scopeId` die Tab-ID (`app/src/renderer/stores/petrolChatStore.ts:314-325`); `clear` und `dispose` löschen alle Main-Snapshots dieses Scopes (`app/src/renderer/stores/petrolChatStore.ts:185-187,418-427`; `app/src/main/llm/petrolWebSnapshots.ts:61-68`). Der Agent-Tab ist pro Fenster eindeutig (`app/src/renderer/stores/tabStore.ts:224-235`). Rev. 2 will mehrere gespeicherte Gespräche über dieselbe Tab-Liste anbieten, beschreibt aber keine neue Snapshot-Bindung. Wird „neues Gespräch“ weiterhin über `clear(tabId)` umgesetzt, verliert auch ein anderes, noch innerhalb der drei Stunden abrufbares Gespräch seine eingefrorenen Seiten; beim Zurückwechseln schlägt „Hiermit weiterfragen“ fehl.
Vorschlag: Snapshot-Scope auf die Gesprächs-ID (zusätzlich zum Absender) umstellen; beim Wechsel nur die alte Anfrage stoppen, nicht fremde Gesprächs-Snapshots löschen. `checkSnapshots` muss Antworten an die beim Start geprüfte Gesprächs-ID binden, damit ein spätes Alive-Ergebnis nicht in den inzwischen gewechselten Tab-Scope geschrieben wird (`app/src/renderer/stores/petrolChatStore.ts:245-258`).

### Runde 3 – Nachprüfung

Nachprüfung F16: teilweise – Der Wrapper umschließt den gesamten OCR-IPC und räumt auch bei Fehlern im `finally` auf (`app/src/main/index.ts:9639-9694`; `app/src/main/rag/ollamaActivity.ts:80-86,112-129`). Ein Ollama-Cloud-Modell wird trotzdem als lokale Vordergrundlast gezählt und erhält PDF-Seiten ohne Wegprüfung (F25).

Nachprüfung F18: teilweise – Das Main-Preflight erkennt `cloud-tag` und `remote_host` (`app/src/main/index.ts:4585-4593`; `app/src/shared/agentRoute.ts:60-64`). Die Notes-Chat-Anzeige schweigt bis zum Ergebnis und bei `unverified`, obwohl Senden möglich bleibt (F23); Vault/Projekt zeigen den Weg eines Modells, das dort nicht verwendet wird (F24). Rev. 3 spezifiziert die Cloud-Behandlung für 2a, aber nicht für Anhänge, die nur noch im Verlauf stehen (F26).

Nachprüfung F19: gelöst – Rev. 3 sieht `hadSnapshot`/`wasFollowUp` und eigene Anzeigezweige ohne künstliche Kennung vor (`docs/codex-collab/chat-verlauf-notizen-bilder.md:601-605`); Umsetzung ausstehend.

Nachprüfung F20: teilweise – Rev. 3 vererbt die Basis über mitgesendete Wechsel und verlangt einen Main-Check (`docs/codex-collab/chat-verlauf-notizen-bilder.md:607-614`); Herkunft und Integrität der vom Renderer gelieferten Basis bleiben offen (F27).

Nachprüfung F21: gelöst – Der Renderer prüft höchstens 200 Kennungen, neueste zuerst, und markiert nur tatsächlich geprüfte als verfallen (`app/src/renderer/stores/petrolChatStore.ts:163-173,248-262`); die IPC-Grenze ist ebenfalls 200 (`app/src/main/index.ts:6850-6856`). Der Test deckt 205 Kennungen ab (`app/src/renderer/stores/petrolChatStore.test.ts:187-201`).

Nachprüfung F22: gelöst – Rev. 3 bindet Snapshots an Gesprächs-IDs, schützt einen laufenden Check beim Gesprächswechsel und definiert den Verfall beim Tab-Schließen ausdrücklich (`docs/codex-collab/chat-verlauf-notizen-bilder.md:616-621`); Umsetzung ausstehend.

### F23 — Ungeprüfter Modellweg bleibt ohne Warnung sendbar
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:39-41
Status: [OFFEN]
`cloudRoute` ist nur bei einem erfolgreichen Preflight mit `kind === 'cloud'` gesetzt; während der Prüfung und bei Fehler oder `unverified` verschwindet die Wegzeile vollständig (`app/src/renderer/components/NotesChat/NotesChat.tsx:124-141,1167-1169`). Der Senden-Knopf und `sendMessage` warten nicht auf das Ergebnis (`app/src/renderer/components/NotesChat/NotesChat.tsx:763-766,1441-1445`). Ein `remote_host`-Modell kann daher vor der Antwort oder bei fehlgeschlagener `/api/tags`-Prüfung Notizkontext über Ollama senden, ohne dass die neue Transparenzanzeige erscheint (`app/src/main/index.ts:4585-4593,6617-6623`; `app/src/main/rag/localModel.ts:62-77,110-117`). Der `routeKey` und das `cancelled`-Flag verhindern alte Antworten nach Modellwechseln; bei geänderten Ollama-Metadaten unter demselben Modellnamen läuft der Effekt aber nicht erneut (`app/src/renderer/components/NotesChat/NotesChat.tsx:124-140`; `app/src/main/rag/localModel.ts:53-65`).
Vorschlag: Bis zur geklärten Einstufung sichtbar „Modellweg wird geprüft“ bzw. „Modellweg nicht prüfbar; Inhalte können den Rechner verlassen“ anzeigen; vor dem Senden den tatsächlichen Weg erneut einstufen und die Umfangszeile daran binden.

### F24 — Im Vault- und Projektmodus zeigt die Zeile den falschen Modellweg
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:39-41
Status: [OFFEN]
Die neue Zeile richtet sich allein nach `selectedModel`/`activeCloudRoute`, nicht nach `contextMode` (`app/src/renderer/components/NotesChat/NotesChat.tsx:120-141,1167-1169`). Vault-Anfragen gehen vorher an `vaultRagAnswer`; dessen Main löst ein lokales Modell auf (`app/src/renderer/components/NotesChat/NotesChat.tsx:779-785`; `app/src/main/index.ts:8821-8832`). Projekt-Anfragen gehen an `projectRagAnswer` statt an die gewählte Cloud-Route und erzwingen dort ebenfalls ein lokales Antwortmodell (`app/src/renderer/components/NotesChat/NotesChat.tsx:788-812`; `app/src/main/index.ts:8620-8649`). Im Vault-Modus bleibt auch die Anhangwarnung an den gewählten Cloud-Weg gebunden (`app/src/renderer/components/NotesChat/NotesChat.tsx:1395-1408`). Das kann „Inhalte verlassen den Rechner“ für einen tatsächlich lokalen Lauf behaupten; umgekehrt sagt die Zeile nichts über den im Vault-/Projektpfad wirklich genutzten Weg.
Vorschlag: Den Routenhinweis aus dem tatsächlich gewählten Sendepfad ableiten oder in Vault/Projekt die eigene lokale Route anzeigen.

### F25 — Vision-OCR kann PDF-Seiten an Ollama-Cloud senden
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:39-41,128-136,198-199
Status: [OFFEN]
Die OCR-Modellliste filtert nur Namensmuster, nicht `:cloud` oder `remote_host`, und die Einstellungen bewahren sogar einen nicht mehr gelisteten Modellnamen als auswählbare Option (`app/src/main/index.ts:7356-7367`; `app/src/renderer/components/Settings/IntegrationsTab.tsx:280-287`). Der PDF-Viewer schickt die gerenderte Seite mit diesem Modell an `vision-ocr-extract-page` (`app/src/renderer/components/PDFViewer/PDFViewer.tsx:236-276`); der Main sendet sie ohne Modellwegprüfung als `images` an Ollama (`app/src/main/index.ts:9639-9652,9663-9670`). Bei Ollama-Cloud verlässt damit die PDF-Seite den Rechner. Der neue Wrapper zählt den gesamten Cloud-Lauf zudem als lokale Vordergrundaktivität und pausiert den Vault-Indexer unnötig (`app/src/main/index.ts:9639-9694`; `app/src/main/rag/ollamaActivity.ts:112-129`; `app/src/main/rag/vaultIndexer.ts:266-279`).
Vorschlag: Vor der ersten Seite Main-seitig `resolveLocalModel` verlangen oder den Cloud-Weg samt PDF-Umfang sichtbar bestätigen; den Aktivitätszähler nur für tatsächlich lokale OCR-Läufe setzen.

### F26 — Wegprüfung nur bei aktuellem Anhang übersieht belasteten Verlauf
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:593-606,607-614
Status: [OFFEN]
Rev. 3 verlangt die Main-Einstufung ausdrücklich „vor JEDEM Senden mit Notiz-Anhang“. Nach Punkt 10 kann aber ein neuer Wechsel allein über mitgesendete frühere Antworten eine Notiz-Basis erben, obwohl aktuell kein Anhang mehr gesetzt ist. Dann muss auch dieser Sendepfad als Ollama-Cloud oder ungeprüft erkannt werden; sonst greifen Umfangszeile, Mail-Rückfrage und der Main-Filter nicht. Der heutige normale Chat sendet Verlauf und Kontext über `ollama-chat`, dessen Cloud-Gate weiterhin nur `cloud?.model` prüft (`app/src/renderer/components/NotesChat/NotesChat.tsx:850-866`; `app/src/main/index.ts:6576-6582,6617-6623`).
Vorschlag: Vor **jedem** Modell-Senden mit einem Notiz-bezogenen Verlauf den tatsächlichen Weg im Main einstufen, unabhängig davon, ob die aktuelle Eingabe einen Anhang hat.

### F27 — Vom Renderer gelieferte Basis ist keine verlässliche Main-Prüfung
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:607-614
Status: [OFFEN]
Rev. 3 sagt, der Main „erhält die Basis je Verlaufseintrag“ und prüft danach den gefilterten Verlauf. Der bisherige Chat nimmt aber `messages` und `context` als Renderer-Parameter an (`app/src/main/index.ts:6453-6455`) und reicht `allMessages` an den Modellweg weiter (`app/src/main/index.ts:6597-6600,6617-6623`). Ein ausgelassenes oder falsches `basis.notes` wäre aus einem freien Antworttext nicht rekonstruierbar; ein Main-Check derselben gelieferten Metadaten kann die behauptete Herkunft daher nicht belegen. Gerade die nach F06 geforderte Cloud-Grenze darf nicht von einem Renderer-Feld abhängen.
Vorschlag: Verlauf und Basis im Main als eine Einheit führen oder die Einträge vor dem Cloud-Senden gegen Main-gehaltene Gesprächsdaten binden; aktuelle Notizdateien dort erneut prüfen.

## Claude-Antwort

### Runde 1 (01.11.2026)

Alle 17 Befunde gegengeprüft. F01, F02, F04, F06 und F16 habe ich selbst am Code nachgemessen,
sie stimmen. Kein Befund war falsch. Der Nutzer hat drei Schritte freigegeben: F06 sofort beheben,
F02/F03 sofort beheben, Plan überarbeiten. Code-Änderungen (Stand HEAD `dbb08bb5` plus
uncommittet):

- **F06 [ADRESSIERT, Code]** `ollama-chat` prüft für jeden Chat-Modus außer `email` mit
  Cloud-Modell die gespeicherte Freigabe `notes-chat` samt Modell (`petrolCloudAllowed`),
  `app/src/main/index.ts` direkt nach der E-Mail-Prüfung (um Zeile 6572). Betrifft Petrol-Chat
  UND Notiz-Chat (beide nutzen im Renderer `cloudRoutesForFeature('notes-chat')`). `lmstudio-chat`
  hat keinen Cloud-Zweig. Für Teil 2 gilt zusätzlich Rev. 2, Punkt 4.
- **F02 [ADRESSIERT, Code]** Neuer IPC `petrol-chat-snapshots-alive(scopeId, ids)` →
  `WebSnapshotStore.alive` (Teilmenge, nie Auszüge; Test in `petrolWebSnapshots.test.ts`).
  Store-Feld `goneSnapshots` + `checkSnapshots` (`petrolChatStore.ts`): Abfrage beim Öffnen, bei
  Fensterfokus und alle fünf Minuten (`PetrolChat.tsx`). Verfallene Kennung → vorgemerkte
  Nachfrage fällt weg, der Knopf zeigt deaktiviert „Seiten nicht mehr da“ mit Grund.
  Ein `snapshotGone` aus dem Main trägt die Kennung ebenfalls ein.
- **F03 [ADRESSIERT, Code]** „Erneut senden“ einer Nachfrage auf eine verfallene Kennung
  erscheint nicht mehr; stattdessen der Hinweis `followUpGoneHint`. Tests in
  `petrolChatStore.test.ts` (Abschnitt „verfallene Seiten“).
- Prüfung: `npm run typecheck` sauber, `npm run test` 3226 grün; einziger Ausfall
  `shellExecution.test.ts` (Umgebungsprobe, 5-s-Zeitlimit unter Parallel-Last, allein grün,
  nicht berührt). `electron-vite build` sauber.

Übrige Befunde: in den Plan übernommen, Code folgt erst nach Freigabe.

- **F01 [ADRESSIERT, Plan]** Rev. 2 Punkt 1.
- **F04 [ADRESSIERT, Plan]** Rev. 2 Punkt 3.
- **F05 [ADRESSIERT, Plan]** Rev. 2 Punkt 4.
- **F07 [ADRESSIERT, Plan]** Rev. 2 Punkt 5.
- **F08 [ADRESSIERT, Plan]** Rev. 2 Punkt 6.
- **F09–F12 [ADRESSIERT, Plan]** Rev. 2 Punkt 7.
- **F13 [ADRESSIERT, Plan]** Rev. 2 Punkt 2.
- **F14 [ADRESSIERT, Plan]** Rev. 2 Punkt 2.
- **F15 [ADRESSIERT, Plan]** Rev. 2 Reihenfolge.
- **F16 [ADRESSIERT, Plan; Code offen]** `vision-ocr-extract-page` bekommt `withOllamaActivity`
  (lokal), ist eine kleine Sofortänderung, aber nicht freigegeben. Jeder neue lokale Bildweg
  läuft durch denselben Zähler.
- **F17 [ADRESSIERT, Plan]** Rev. 2 Punkt 4, letzter Absatz.

### Rev. 2 — verbindliche Festlegungen

**1. Gespeichert wird ein eigenes Format, nicht der Laufzeit-Typ (F01).** `StoredChatMessage`
mit expliziter Feldliste. Aus `web.sources` und `webPartial.sources` fällt `excerpt` heraus,
ebenso `snapshotId`/`followUpSnapshotId` (nur noch als „gab es“ markiert). Nach dem Laden gilt
jede alte Kennung als verfallen (`goneSnapshots` = alle). „Prüfung je Satz“ zeigt nach dem Laden,
was ohne Auszug darstellbar ist; braucht sie den Auszug, steht dort „nach dem Neustart nicht
verfügbar“. Test: Anzeige, Export und Prüfbericht eines geladenen Gesprächs ohne Auszüge.

**2. Ein Ordner je Gespräch, Schutz und Vault-Bindung (F13, F14).**
`userData/petrol-chats/<vault-hash>/<gespräch-id>/` mit `chat.json` und `media/`. Löschen,
Aufbewahrung und „alle löschen“ entfernen immer den ganzen Ordner. Beim Start fallen Ordner ohne
lesbares `chat.json` weg (Absturzreste). JSON **und** Medien über `safeStorage` verschlüsselt,
Ordner 0700, Dateien 0600. Nicht entschlüsselbar → Gespräch als „nicht lesbar“ gelistet, nie
Klartext-Rückfall. Ohne `safeStorage` (Hyprland, `basic_text`): Chat geht, gespeichert wird
nicht, die Liste sagt es. Gespräche hängen am Vault-Pfad. Ein verschobener Vault verliert die
Zuordnung (Produktentscheidung, steht in den Einstellungen). Der Store bindet jedes Gespräch an
den Vault; ein Vault-Wechsel bricht eine laufende Anfrage ab und zeigt die Gespräche des neuen
Vaults. `userData` liegt im OS-Backup — das steht als Satz in den Einstellungen.

**3. Notizen anhängen nur innerhalb des offenen Vaults (F04).** IPC nimmt `vaultPath` +
vault-relativen Pfad. `assertApprovedVault(vaultPath)`, dann `validatePath`, kanonisch auflösen
und auf GENAU diesen Root begrenzen (wie `contextFiles.ts:48-60`). Nur `.md`, Größengrenze vor
dem Lesen, nie `.mindgraph`. Bei **jedem** Senden neu lesen und neu prüfen. Das `[[`-Menü bietet
nur Notizen der aktuellen Notizliste an. `notesRootFolder` ist keine Grenze.

**4. Was an ein Modell geht, entscheidet der Main pro Anfrage (F05, F06, F17).**
- Jeder Wechsel trägt eine Datenbasis: `basis: { notes: [{ rel, hash, sentChars, truncated }], route }`.
  Inhalte werden nicht gespeichert, nur diese Angaben.
- Ändert sich eine Notiz oder fehlt sie, oder wechselt das Gespräch von lokal auf Cloud, gehen
  die Wechsel, die auf dieser Notiz beruhen, **nicht mehr in den Modellverlauf**. Sie bleiben
  sichtbar, markiert mit „nicht mehr im Gespräch fürs Modell“. Kein stiller Neustart.
- Auf Cloud-Wegen: Main prüft `notes-chat`-Freigabe + Modell (seit F06 vorhanden). Vor dem
  Senden nennt die Zeile über der Eingabe den ganzen ausgehenden Umfang: „Geht an OpenRouter:
  Frage, Verlauf (n Wechsel), Notizen A, B“.
- **Globus + Anhang ist in 2a gesperrt** (F17): bei eingeschaltetem Globus sind Anhänge
  ausgegraut mit Hinweis, ebenso „Hiermit weiterfragen“ mit Anhängen. Notizinhalte erreichen nie
  die Suchplanung oder den Suchdienst. Eine Lockerung braucht eine eigene Entscheidung.

**5. Mail- und Brain-Notizen (F07).** Erkannt über Ordner ODER Frontmatter (`email-id`,
`type: brain-day`). Auf Cloud-Wegen: Rückfrage je Anfrage und Anbieter (Empfehlung, Nutzer
bestätigt noch). Andere Notizen gelten dadurch nicht als „sicher“ — sie stehen in der
Umfangszeile aus Punkt 4.

**6. Vault-Knopf als eigener Wechseltyp (F08).** Eigene Nachrichtform mit `origin: 'vault-rag'`,
eigene Stream-Zuordnung und Stopp über den bestehenden `vault-rag-answer`-Weg. `isQueryable`
bekommt einen IPC. Der Fehlergrund (kein Index, Modell anders) wird angezeigt.

**7. Bilder (F09–F12, F16).**
- 3a nur Ollama, nur nach `resolveLocalModel` (keine Cloud-Tags, kein `remote_host`), Modell
  braucht `vision` UND `completion`. Fehlen Angaben: `/api/show`; sonst nicht angeboten.
- Eigene Nutzlast je Backend: Ollama `images`; LM Studio und Cloud (`image_url`) erst in 3b.
- Texterkennung als Ausweg ist sichtbar „Text aus Texterkennung“, nie „Bild gesehen“.
- Folgefragen: erst messen (Latenz, `prompt_eval_count`, Speicher), Prüfset vorher. Bis dahin
  geht ein Bild bei Folgefragen MIT, solange höchstens zwei Bilder im Gespräch sind; darüber
  wird ein älteres Bild sichtbar durch „[Bild … nicht mehr mitgeschickt]“ ersetzt und die Marke
  bietet „erneut zeigen“.
- Aufbereitung: `createImageBitmap(..., { imageOrientation: 'from-image' })`, dann JPEG. HEIC
  wird in 3a abgelehnt mit Hinweis (Chromium dekodiert es nicht). Test: Orientierungen 1–8 und
  kein APP1/EXIF-Block im Ergebnis. Originalbytes oder -dateiname gehen nie mit.

### Rev. 2 — Reihenfolge (F15)

1. **Datenvertrag + Speichern:** Format aus Punkt 1, Ordner/Schutz/Vault-Bindung aus Punkt 2.
2. **2a Notizen anhängen** mit Punkt 3–5.
3. **2b Vault-Knopf** (Punkt 6).
4. **3a Bilder lokal** nach dem Prüfset (Punkt 7).
5. **3b Bilder über LM Studio/Cloud.**

### Offene Nutzerentscheidungen (Stand Rev. 2)

- Aufbewahrung Standard 90 Tage — vorläufig angenommen.
- Mail-/Brain-Notizen auf Cloud: Rückfrage — vorläufig angenommen.
- Bilder zuerst nur lokal — vorläufig angenommen.

### Runde 2 (01.11.2026)

Alle fünf neuen Befunde gegengeprüft, alle tragen. Nutzer hat vier Schritte freigegeben.

- **F18 [ADRESSIERT, Code + Plan]** Bestätigt (`main/rag/localModel.ts:97-111`): ein Ollama-
  `:cloud`- oder `remote_host`-Modell rechnet extern, obwohl es über den lokalen Port läuft; die
  Lücke bestand vor F06, die Beschreibung meines Fixes war zu breit. **Keine Sperre**
  (Nutzerregel „Transparenz statt Sperre“; ein `:cloud`-Modell setzt Anmeldung bei ollama.com und
  bewusstes Laden voraus). Stattdessen: Notiz-Chat holt den Modellweg per
  `noteAgentRoutePreflight` wie der Petrol-Chat und zeigt bei `cloud` unter der Modellwahl
  „Cloud über ollama.com · Inhalte verlassen den Rechner“ (`NotesChat.tsx`, Klasse
  `notes-chat-route is-out`); die Cloud-Warnung der Anhangzeile (`cloudSelected`) greift jetzt
  auch bei `remote_host`, nicht nur am Namen. Plan: Rev. 3 Punkt 8.
- **F19 [ADRESSIERT, Plan]** Rev. 3 Punkt 9.
- **F20 [ADRESSIERT, Plan]** Rev. 3 Punkt 10.
- **F21 [ADRESSIERT, Code]** Renderer schickt die neuesten Kennungen zuerst, höchstens
  `SNAPSHOT_CHECK_MAX` = 200 (= Grenze im Main); nicht geprüfte gelten nicht als verfallen.
  Test „prüft höchstens die neuesten 200“ in `petrolChatStore.test.ts`.
- **F22 [ADRESSIERT, Plan]** Rev. 3 Punkt 11.
- **F16 [ADRESSIERT, Code]** `vision-ocr-extract-page` läuft jetzt über
  `wrapIpcWithOllamaActivity('vision-ocr', …)` (`main/index.ts`, um Zeile 9639).
- Prüfung: `npm run typecheck` sauber, `npm run test` 3228 grün (235 Dateien), `electron-vite build`
  sauber. Nicht in der laufenden App geprüft.

### Rev. 3 — Ergänzungen (gelten zusätzlich zu Rev. 2)

**8. Ollama-Cloud zählt als Cloud (F18).** Überall, wo Rev. 2 „Cloud-Weg“ sagt, ist der vom Main
eingestufte Weg gemeint (`classifyAgentRoute`: OpenRouter, LLMBase, Ollama mit `cloud-tag` oder
`remote_host`), nie nur „ein Cloud-Objekt wurde mitgeschickt“. Für 2a heißt das: Umfangszeile,
Mail-/Brain-Rückfrage und Ausschluss abhängiger Wechsel gelten auch bei Ollama-Cloud. Der Main
stuft vor JEDEM Senden mit Notiz-Anhang neu ein; schlägt die Einstufung fehl, gilt der Weg als
nicht lokal. Eine eigene gespeicherte Freigabe für Ollama-Cloud gibt es nicht (Nutzerentscheidung
01.11.2026, Transparenz statt Sperre). Tests: `cloud = null` + `model = '*:cloud'`, und `remote_host`.

**9. Gespeicherte Webwechsel tragen Merkmale statt Kennungen (F19).** `StoredChatMessage` hat
`hadSnapshot: true` (Antwort) bzw. `wasFollowUp: true` (Frage). Nach dem Laden zeigt eine Antwort mit
`hadSnapshot` den deaktivierten Knopf „Seiten nicht mehr da“, eine Frage mit `wasFollowUp` hat
kein „Erneut senden“, sondern den Hinweis `followUpGoneHint`. Es wird keine künstliche Kennung
erzeugt. Anzeige-Bedingungen in `PetrolChat.tsx` prüfen künftig `snapshotId ODER hadSnapshot`.

**10. Datenbasis vererbt sich (F20).** Die Datenbasis eines Wechsels ist die Vereinigung aus den
eigenen Anhängen und den Datenbasen ALLER Wechsel, die bei dieser Anfrage im Modellverlauf
mitgingen. Fällt eine Notiz weg oder ändert sich, oder ist der neue Weg Cloud und die Basis
enthält Notizen, die für diesen Weg nicht freigegeben sind: Alle Wechsel, deren Basis sie
enthält, gehen nicht mehr in den Modellverlauf — also auch spätere Zusammenfassungen. Der Main
erhält die Basis je Verlaufseintrag und prüft den gefilterten Verlauf vor einem Cloud-Senden
selbst; der Renderer filtert nur vor, er entscheidet nicht. Test: Antwort 2 fasst Antwort 1
(aus Mail) zusammen, Mail gelöscht → beide fehlen im Verlauf fürs Modell.

**11. Seiten hängen am Gespräch, nicht am Tab (F22).** `scopeId` der Snapshots wird die
Gesprächs-ID. „Neues Gespräch“ legt ein neues Gespräch an und löscht nur die Seiten eines
VERWORFENEN Gesprächs, nie die eines gespeicherten; Wechsel zwischen Gesprächen stoppt nur die
laufende Anfrage. `checkSnapshots` merkt sich die Gesprächs-ID beim Start und schreibt ein spätes
Ergebnis nur in genau dieses Gespräch. Tab schließen verwirft die Seiten aller Gespräche dieses
Tabs (wie heute).

### Runde 3 (01.11.2026)

Alle fünf Befunde gegengeprüft, alle tragen. Nutzer hat freigegeben: F23–F25 im Code, F26/F27 als
Rev. 4, OCR mit Cloud-Modellen sperren (Ausnahme von „Transparenz statt Sperre“, weil bei der
Texterkennung niemand bewusst Cloud wählt). Danach Ende der Prüfrunden, Beginn Teil 1.

- **F23 [ADRESSIERT, Code]** Die Wegzeile im Notiz-Chat zeigt jetzt auch „Modellweg wird geprüft“,
  „Modellweg nicht prüfbar · Inhalte könnten den Rechner verlassen“ (Fehlschlag, orange) und den
  ungeprüften Ollama-/LM-Studio-Weg (grau). Nur ein geprüft lokales Modell hat keine Zeile.
  **Nicht umgesetzt:** Neueinstufung unmittelbar vor dem Senden und Sperre des Sendens während
  der Prüfung — gehört zu Rev. 4 (Main führt das Gespräch und stuft selbst ein).
- **F24 [ADRESSIERT, Code]** Zeile und Cloud-Warnung der Anhangzeile entfallen im Vault-Modus,
  die Zeile auch im Projekt-Modus (beide rechnen im Main erzwungen lokal).
- **F25 [ADRESSIERT, Code]** `vision-ocr-extract-page` verlangt vor der ersten Anfrage
  `resolveLocalModel(model)`; Cloud-Tag, `remote_host`, fehlendes Modell → Fehler mit
  `describeLocalModelError`, keine Seite verlässt den Rechner. Der Vordergrund-Zähler greift nur
  ohne Cloud-Tag. `vision-ocr-models` filtert Remote-/Cloud-Modelle heraus und entscheidet nach
  Ollamas `vision` + `completion` (Namensmuster nur ohne Fähigkeitsangabe, ergänzt um
  `deepseek-ocr`). Auf dem Entwicklungsrechner fielen damit `qwen3.5:cloud`, `kimi-k2.5:cloud`
  und `ministral-3:14b-cloud` (nur `remote_host`, kein `:cloud`-Tag) heraus.
- **F26 [ADRESSIERT, Plan]** Rev. 4 Punkt 12.
- **F27 [ADRESSIERT, Plan]** Rev. 4 Punkt 12.
- Prüfung: typecheck und build sauber; `npm run test` 3227 grün, rot nur der bekannte
  `shellExecution.test.ts`-Zeitlimitfall unter Parallel-Last (nicht berührt, allein grün).
  Nicht in der App geprüft.

### Rev. 4 — der Main führt das Gespräch (F26, F27)

**12.** Verlauf, Datenbasis je Wechsel und Gesprächs-ID liegen im Main (passend zu Teil 1: dort
wird ohnehin gespeichert). Der Renderer schickt nur Gesprächs-ID, neue Frage, gewählten Weg und
Anhangpfade; er bekommt Anzeige-Daten zurück. Vor **jedem** Modellaufruf eines Gesprächs — mit
oder ohne aktuellen Anhang — stuft der Main den Weg ein (`classifyAgentRoute`), baut den
Modellverlauf aus seinen eigenen Daten, wendet die Vererbungsregel aus Punkt 10 an und prüft
Freigaben (Punkt 4/5/8). Eine vom Renderer gelieferte Herkunft gibt es nicht mehr. Der heutige
`ollama-chat`-Weg mit Renderer-Verlauf bleibt nur für den Notiz-Chat im Panel, bis er
nachzieht. Folge für den Umfang: Teil 1 enthält damit den Umzug des Petrol-Verlaufs in den Main
(Streaming-Kanal, Abbruch und Snapshot-Bindung bleiben, Kennung = Gesprächs-ID).

### Rev. 5 — Teil 4: Der Agent liest Scans und Bilder (02.11.2026, Nutzerwunsch)

**Anlass.** Nutzer: „Ich dachte, der Agent kann jetzt auch PDF in einem Ordner lesen und Bilder
usw.“ Stand im Code (`main/noteAgent/contextFiles.ts:76-91`, `EXT_TO_KIND`): lesbar sind
`.xlsx/.xls`, `.docx`, `.pptx`, `.pdf`, `.md`, `.txt`, `.csv`, `.html`.
- **PDF nur mit Textebene** (`contextFiles.ts:690-716`, pdfjs `getTextContent`). Ein Scan endet
  mit „PDF hat keine Textebene (Scan?)“.
- **Bilder gar nicht**: Sie zählen im Manifest nur als „N nicht unterstützte Dateien
  übersprungen“ (`contextFiles.ts:883`), ohne Namen. Wer einen Ordner mit Fotos von
  Rückläufen anhängt, erfährt nicht einmal, welche fehlen.
- Heutiger Umweg: Vision OCR je PDF von Hand, dann die Begleitnotiz anhängen. Für Bilder gibt es
  keinen Umweg.
- **Gemischte PDFs** (Textseiten plus eingescannte Anlage): Geprüft wurde nur, ob die ganze Datei
  40 Zeichen Text hat. Die Scan-Seiten fehlten ohne Hinweis, die Datei galt als gelesen.

**Ziel.** Gescannte PDFs und Bilder in Anhängen und Ordner-Anhängen werden vom Agenten gelesen,
über dieselbe Texterkennung wie der Vision-OCR-Knopf (`main/visionOcr.ts`, `extractOcrPage`,
mit Wiederholungsschutz seit 02.11.2026).

**13. Nur lokal, wie beim Knopf (F25).** Die Erkennung läuft ausschließlich über ein lokales
Ollama-Modell (`resolveLocalModel`, Modell aus `ui-settings.json` → `visionOcr.model`, nie aus
den Run-Parametern). Fehlt ein lokales Vision-Modell oder ist Vision OCR aus, meldet das Werkzeug
das mit nächstem Schritt („Einstellungen → Integrationen → Vision OCR“), nie stilles Überspringen.
Der **erkannte Text** geht danach wie jeder gelesene Inhalt an das Agent-Modell, auch an ein
Cloud-Modell. Die Karte nennt das unter „Welche Daten wohin gehen“: „Text aus Scans und Bildern
(auf diesem Rechner erkannt)“. Transparenz statt Sperre, wie bei allen anderen Anhängen.

**13a. Gemischte PDFs: Seiten ohne Textebene (Nutzerentscheidung 02.11.2026).**
- **Stufe 1 — gebaut, vor Teil 1** (kleiner Ehrlichkeits-Fix, keine Abhängigkeit von Teil 1
  oder 4): `shared/pdfPageText.ts` (`assemblePdfText`, getestet) prüft jede Seite. Unter
  `PDF_PAGE_MIN_CHARS` (40 Zeichen ohne Leerraum) steht ein Vermerk an der Seite („kein Text
  gefunden — leer, Bild oder Scan“ bzw. „kaum Text (N Zeichen)“, vorhandener Text bleibt) und am
  Ende `[ohne Textebene: Seiten 2, 7–9 von N gelesenen Seiten …]`. `folder_digest` übernimmt das
  als Teilstatus, die Ordner-Lesung als Status „gelesen (ohne Textebene: …)“. Eine Datei ganz
  ohne Text wirft wie bisher. Gegenprobe mit echter PDF (Text–Scan–Text) über
  `extractFileContentRaw`: Seite 2 benannt; reiner Scan und reine Text-PDF unverändert.
- **Schwelle vorläufig**: 40 Zeichen ist geschätzt, nicht gemessen. Ein Scan mit Stempel oder
  Seitenzahl als echtem Text liegt meist darunter, eine fast leere Textseite (Kapiteltitel) auch —
  sie bekommt dann einen harmlosen Vermerk. An echten PDFs messen, bevor die Zahl fest wird.
- **Stufe 2 — in 4a**: Nur die Seiten mit Vermerk gehen durch `extractOcrPage`, der Rest bleibt
  auf der Textebene. Die erkannten Seiten tragen „Seite N (Texterkennung)“. Seitenbudget aus
  Punkt 16 zählt nur diese Seiten. Offen für Codex: Was gilt bei einer Seite mit Textebene, die
  zusätzlich ein eingescanntes Bild mit Text trägt (Briefkopf als Bild, Tabelle als Grafik)?
  Stufe 1 erkennt das nicht.

**14. Wo die Seiten gerendert werden.** Der Renderer rendert PDF-Seiten heute per pdfjs auf ein
Canvas (`PDFViewer.tsx`). Im Main gibt es kein Canvas. Zwei Wege, vor dem Bau zu entscheiden:
(a) verstecktes `BrowserWindow` mit pdfjs, wie `remarkable/bookPdf.ts` es für `printToPDF`
schon tut; (b) ein natives Canvas-Paket. Vorschlag (a): keine neue Abhängigkeit, dieselbe
pdfjs-Version (5.4.296, exakt verankert). Bilder brauchen kein Rendern, nur Verkleinern auf die
eingestellte Seitenbreite und EXIF-Drehung (siehe Punkt 7: `createImageBitmap` mit
`imageOrientation 'from-image'`, HEIC abgelehnt).

**15. Werkzeug und Manifest.**
- `read_context_file` erkennt „PDF ohne Textebene“ und Bilder (`.png`, `.jpg`, `.jpeg`, `.webp`,
  `.tif`) und ruft die Erkennung auf. Neue Art `image` in `EXT_TO_KIND`.
- Das Manifest (`list_context_folder`) **nennt** Bilder und Scans mit „Scan, N Seiten,
  Texterkennung nötig (ca. M s)“, statt sie in der Übersprungen-Zahl zu verstecken.
- Die Rückgabe trägt die Seitenhinweise aus `extractOcrPage` (Wiederholung entfernt,
  unvollständig, fehlgeschlagen) und die Kennzeichnung „per Texterkennung gelesen, kann
  Lesefehler enthalten“. Bei Zahlen aus Scans soll das Ergebnis darauf hinweisen.
- Ergebnis je Datei per Inhalts-Hash im Staging des Laufs zwischenspeichern: Ein zweites Lesen
  derselben Datei kostet keine zweite Erkennung.

**16. Grenzen und Zeit.** Eine Seite braucht lokal 2–11 s (Messung 02.11.2026), ein Ordner mit
60 eingescannten Rückläufen also Minuten. Deshalb:
- Seitenbudget je Lauf, z. B. 40 Seiten, sichtbar gemeldet, nie still gekürzt.
- Die Erkennung zählt als Ollama-Vordergrund und pausiert den Vault-Indexer
  (`wrapIpcWithOllamaActivity`-Logik, F16).
- Fortschritt im Lauf-Protokoll („Texterkennung Seite 3/12 · Rücklauf_07.pdf“).
- Bei einem lokalen Agent-Modell laufen Erkennung und Agent auf derselben Maschine
  nacheinander. Zwei Modelle im Speicher können auf 8–16 GB eng werden; `assessLocalRunRisk`
  prüfen, bevor die Erkennung startet.

**17. `collect_table` bleibt beim Bisherigen.** Tabellen aus Fotos zusammenführen ist ein eigener,
späterer Schritt. Erkannter Markdown-Tabellentext ist zu unzuverlässig, um ihn ungeprüft in eine
Excel-Zusammenführung zu kippen.

**18. Weg B: Das Agent-Modell sieht die Seite selbst (4c, ergänzt 02.11.2026).** Punkt 13–17
(Weg A) liefert nur Text. Diagramme, Fotos, Whiteboard-Pfeile und Layout gehen verloren. Versteht
das Agent-Modell Bilder, soll es die Seite als Bild bekommen können.
- **Messung 02.11.2026** (App-Weg `extractOcrPage`, 6 Seiten × 2): `qwen3.8:27b-mlx` meldet
  `vision` und liest so genau wie glm-ocr (Testseiten fehlerfrei, alle Zahlen, Kreuz im Formular
  erkannt, Artikelseite 96 % der Wörter), aber langsamer (4–27 s je Seite, erste bis 54 s).
  Das Modell kann es, die App gibt ihm heute nur kein Bild.
- **Werkzeug:** `view_context_page({ file, page })` liefert die gerenderte Seite bzw. das Bild als
  Bildanhang der Werkzeugantwort. Nur freigeschaltet, wenn das Agent-Modell Bilder versteht
  (Ollama: `vision` in `/api/tags`; Cloud siehe Punkt 19). Sonst fehlt das Werkzeug, und Weg A
  bleibt der einzige.
- **Nur lokal in 4c.** Punkt 13 bleibt: Ohne eigene Freigabe verlässt kein Bild den Rechner. Bei
  einem Cloud-Agenten fehlt `view_context_page`, bis Punkt 19 gebaut ist.
- **Kontext:** Ein Bild kostet viel mehr Kontext als sein Text. Bildbudget je Lauf (z. B. 8
  Seiten), sichtbar gemeldet. Der Prompt sagt: erst `read_context_file` (Text), Bild nur, wenn
  der Auftrag Grafik, Layout oder Foto betrifft oder der Text als unvollständig markiert ist.
- **Verlauf:** Wie im Chat (Punkt 11): Ein Bild geht nur in der Runde ans Modell, in der es
  abgerufen wurde. Danach steht im Verlauf „[Seite 3 von Rücklauf_07.pdf angesehen]“ plus die
  eigene Auswertung. Sonst kodiert Ollama jedes Bild in jedem Schritt neu.
- **Ehrliche Anzeige:** Aussagen aus Bildern stehen im Ergebnis als „vom Modell im Bild gelesen,
  nicht geprüft“. Zahlen daraus nie als belegt.
- **Vorteil auf kleinen Rechnern:** Mit einem Vision-fähigen Agent-Modell braucht es kein zweites
  Modell (glm-ocr) im Speicher.

**19. Bilder über Cloud-Anbieter (OpenRouter, LLMBase), für Chat (3b) und Agent.** Anlass:
Frage des Nutzers, was der Agent mit Haiku über LLMBase kann. Antwort heute: dasselbe wie lokal,
nur Text. Claude-Modelle verstehen Bilder und PDFs, aber `main/llm/` schickt auf Cloud-Wegen nur
Text-`content`, kein `image_url` (geprüft 02.11.2026).
- **Eine gemeinsame Erweiterung** des Cloud-Clients für Chat (3b) und Agent (Punkt 18): Nachricht
  als Liste aus Text- und Bildteilen (OpenAI-Format `image_url` mit `data:`-URL). Bild vorher
  aufbereiten wie in Teil 3: lange Seite höchstens 1600 px, JPEG, ohne EXIF.
- **Fähigkeit prüfen:** OpenRouter meldet im Katalog die Eingabearten (`architecture.input_modalities`
  bzw. `modality`), gecacht wie die Preise in `cloudPricing.ts`. LLMBase hat dafür keinen
  belegten Katalog. Dort Bild nur nach einmaligem Probeaufruf je Modell, sonst Fehler
  verständlich übersetzen. Nie still ohne Bild weitermachen.
- **Eigene Freigabe für Bilder.** Die vorhandenen Freigaben (`notes-chat`, `note-agent`) decken
  Text. Bilder sind eine neue Datenart: Fotos zeigen Personen, Räume, Dokumente mit Unterschrift.
  Deshalb eine eigene Zustimmung „Bilder an <Anbieter> senden“ je Funktion (Chat, Agent), mit
  Versionszähler wie `NOTE_AGENT_CLOUD_CONSENT_VERSION`. Die Karte nennt unter „Welche Daten
  wohin gehen“: „Bilder und Seitenbilder aus Anhängen“. Ohne Zustimmung gilt Weg A: lokal
  erkannter Text geht hinaus, kein Bild.
- **Kontextfenster:** Bei LLMBase rechnet die App pauschal mit 32 768 Token
  (`shared/contextBudget.ts:17`, `ASSUMED_CONTEXT_WINDOW`, weil für LLMBase nicht belegt ist, dass
  ein Überlauf laut scheitert, Codex F01 in `agent-cloud-kontextfenster.md`). Bilder fressen dieses
  Fenster schnell. Bildbudget bei LLMBase deshalb kleiner (z. B. 3 Seiten je Lauf), bis der
  Überlauf-Nachweis für LLMBase da ist. OpenRouter nutzt das Katalogfenster wie heute.
- **Kosten:** Bildeingaben kosten bei den Anbietern extra. Die Arbeitsbilanz zählt sie über die
  gemeldeten Token mit, die Karte nennt vor dem Start die Zahl der Bildseiten.

**Bewusst nicht in Teil 4:** PDFs als ganze Datei an Cloud-Modelle schicken (Claude kann das
nativ). Das umginge Seitenbudget, lokale Erkennung und Anzeige je Seite. Wenn überhaupt, später
als eigener Punkt mit Messung.

**Reihenfolge.** Teil 4 hängt nicht am Datenvertrag aus Teil 1 und könnte vorgezogen werden.
**Nutzerentscheidung 02.11.2026: nicht vorziehen**, Teil 4 kommt nach Teil 1–3. Er braucht nur
`extractOcrPage` (vorhanden) und Punkt 14. Innerhalb von Teil 4: 4a gescannte PDFs (Weg A),
4b Bilder (Weg A), 4c Seitenbild für lokale Vision-Modelle (Punkt 18), danach Punkt 19 zusammen
mit 3b. Vor dem Bau Codex-Prüfung von Punkt 13–19.

## Status

Rev. 5a, 02.11.2026: Punkt 13a (gemischte PDFs) ergänzt, Stufe 1 gebaut (uncommittet).

Rev. 5, 02.11.2026: Teil 4 (Agent liest Scans und Bilder) aufgenommen, mit Weg A (lokale
Texterkennung, Punkt 13–17), Weg B (Seitenbild für Vision-Modelle, Punkt 18) und dem Cloud-Bildweg
für Chat und Agent (Punkt 19). Noch ungeprüft. Reihenfolge entschieden: Teil 1 zuerst, Teil 4
nicht vorgezogen. Offen: Codex-Runde zu Punkt 13–19.

Rev. 4, 01.11.2026. Im Code behoben (uncommittet): F02, F03, F06, F16, F18 (Anzeige), F21,
F23, F24, F25. Prüfrunden beendet (Nutzerentscheidung). Nächster Schritt: Teil 1 —
Main-geführtes Gespräch, Datenvertrag, Speichern.
