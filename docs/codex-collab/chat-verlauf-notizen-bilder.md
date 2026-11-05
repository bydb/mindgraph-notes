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

### Runde 4

### F28 — Der OCR-Helper selbst erzwingt kein lokales Modell
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:783-789
Status: [OFFEN]
`extractOcrPage` akzeptiert eine beliebige URL und einen beliebigen Modellnamen und sendet das Seitenbild sofort (`app/src/main/visionOcr.ts:21-52`). Nur der heutige PDF-Viewer-IPC prüft davor `resolveLocalModel` (`app/src/main/index.ts:9647-9657`). Punkt 13 will den Helper zusätzlich direkt aus Agent-Werkzeugen nutzen; wer dort nur `extractOcrPage` aufruft, umgeht die einzige Datenschutzgrenze. Die Modellauflösung darf zudem nicht bloß einmal je Lauf erfolgen: `resolveLocalModel` kann seine Modellliste 15 Sekunden cachen (`app/src/main/rag/localModel.ts:53-65,94-117`).
Vorschlag: Einen gemeinsamen Main-seitigen OCR-Einstieg bauen, der das Modell aus `ui-settings.json` liest, unmittelbar vor jedem Bild mit frischen Ollama-Metadaten als lokal und visionfähig prüft und erst dann `extractOcrPage` aufruft. Agent und Viewer benutzen denselben Einstieg.

### F29 — Reine Scan-PDFs haben keinen Seitenvermerk für Stufe 2
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:791-807
Status: [OFFEN]
Stufe 2 will „nur die Seiten mit Vermerk“ durch OCR schicken. Bei einer PDF ganz ohne Textebene wirft `assemblePdfText` jedoch **vor** der Erzeugung von Seitenvermerken (`app/src/shared/pdfPageText.ts:39-50`; Test `app/src/shared/pdfPageText.test.ts:28-30`); `extractPdfText` gibt nur den zusammengesetzten String zurück (`app/src/main/noteAgent/contextFiles.ts:686-715`). Der reine Scan erreicht die geplante Seitenauswahl also nicht.
Vorschlag: Die Extraktion zuerst als strukturierte Seitenliste mit Text, Seitenzahl und OCR-Bedarf zurückgeben; OCR darauf anwenden und erst danach den Gesamttext bilden. „Ganz ohne Text“ erst nach erfolgloser OCR als Fehler behandeln.

### F30 — Seitenstatus steckt im Text und kann beim Kürzen verschwinden
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:791-807,817-826
Status: [OFFEN]
Die Zusammenfassung fehlender Textseiten steht **am Ende** des Strings (`app/src/shared/pdfPageText.ts:55-60`). Die Ordnerlesung kürzt auf 6000 Zeichen bzw. das Restbudget und ruft `pdfNoTextNote` erst danach auf (`app/src/main/noteAgent/contextFiles.ts:850-864`); so wird eine gemischte PDF unter Umständen als bloß „gelesen (gekürzt)“ geführt, obwohl Scanseiten fehlen. `read_context_file` kann außerdem nur Zeilenfenster des Strings liefern (`app/src/main/noteAgent/contextFiles.ts:653-674`). Ein Seitenvermerk ist kein belastbarer Statuskanal für OCR-Fehler, Budgetende und nicht gerenderte Seiten.
Vorschlag: Seitenstatus und Abdeckung getrennt vom gekürzten Modelltext führen; Datei-/Werkzeugrückgabe soll gelesene, erkannte, übersprungene, fehlgeschlagene und nicht erreichte Seiten ausdrücklich zählen.

### F31 — OCR hat keinen Agent-Abbruch und Erfolg ohne Stream-Ende
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:828-836
Status: [OFFEN]
`extractOcrPage` erzeugt nur seinen eigenen Zwei-Minuten-Controller und nimmt kein `AbortSignal` des Agent-Laufs an (`app/src/main/visionOcr.ts:21-28,51-52`), während der Agent einen eigenen Abbruchcontroller besitzt (`app/src/main/noteAgent/runRegistry.ts:205-209`; `app/src/main/noteAgent/loop.ts:332-335`). Bei 40 Seiten kann der nominelle Seitenetat somit bis zu 80 Minuten OCR bedeuten; ein Nutzerabbruch stoppt einen laufenden OCR-Aufruf nicht. Endet der Antwortstream ohne `done`-Chunk, liefert der Helper vorhandenen Teiltext trotzdem als `success: true`, ohne `incomplete` zu setzen (`app/src/main/visionOcr.ts:67-84,103-117`). Schlägt schon `fetch` fehl, liegt das `clearTimeout` außerhalb eines umschließenden `finally` (`app/src/main/visionOcr.ts:22-28,67-101`).
Vorschlag: Lauf-Signal und ein echtes Laufzeitbudget bis zum Fetch durchreichen, Timer in einem äußeren `finally` aufräumen und fehlendes Stream-Ende als unvollständig/Fehler kennzeichnen. Fehlgeschlagene Seiten im Lauf-Protokoll einzeln ausweisen.

### F32 — Die OCR-Anbindung deckt nicht alle Agent-Leser ab
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:779-781,817-826
Status: [OFFEN]
Punkt 15 nennt `read_context_file`, das Ziel aber auch direkte Anhänge und ganze Ordner. Ein direkter Anhang läuft über `readAttachmentRaw` (`app/src/main/noteAgent/contextFiles.ts:226-241`), eine einzelne Ordnerdatei über `read_context_file` (`app/src/main/noteAgent/contextFiles.ts:653-674`) und `folder_digest` liest alle passenden Dateien nochmals über `readFolderSourcesForDigest` (`app/src/main/noteAgent/contextFiles.ts:1208-1257`; `app/src/main/noteAgent/folderDigest.ts:175-217`). Ohne gemeinsame OCR-Strecke kann derselbe Scan je nach Werkzeug gelesen, als Fehler gemeldet oder still nur teilweise verarbeitet werden; der geplante Hash-Cache im Staging muss alle Wege teilen.
Vorschlag: OCR unterhalb aller drei Leser an die gemeinsame Dateiextraktion anbinden, mit Run-ID, Inhalts-Hash, Seitenbudget und Seitenstatus als gemeinsamem Ergebnis. `folder_digest` und `read_attachment` gezielt mit Scan-PDF und Bild testen.

### F33 — Ein PDF-Exportfenster ist noch kein sicherer Seitenrenderer
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:809-815
Status: [OFFEN]
Der angeführte BrowserWindow-Pfad lädt derzeit erzeugtes HTML aus einer Temp-Datei und ruft `printToPDF` auf (`app/src/main/index.ts:9112-9118,9315-9345`); er rendert keine Seite einer fremden PDF zu OCR-Pixeln. Der heutige PDF-Viewer rendert im normalen Renderer auf Canvas (`app/src/renderer/components/PDFViewer/PDFViewer.tsx:259-276`). Für 4a braucht das versteckte Fenster daher einen neuen, isolierten PDF-Byte-Transfer, Seitenwahl, Pixelrückgabe und Abbruch; für 4b brauchen auch Fotos im Main Dekodierung, EXIF-Drehung und Neukodierung, obwohl Punkt 14 dort „nur Verkleinern“ annimmt.
Vorschlag: Vor 4a/4b einen kleinen Main-zu-Isolat-Raster-Prototyp mit einer echten Scan-PDF und einem gedrehten Foto prüfen; keine Vault-Pfade oder beliebige Skripte ins Fenster geben, Fenster und Bytes bei Abbruch freigeben.

### F34 — LLMBase bietet Bildfähigkeiten im Katalog an
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:873-876
Status: [OFFEN]
`cloudPricing.ts` liest heute nur Preis und Kontextfenster (`app/src/main/llm/cloudPricing.ts:43-54`), und auch `listCloudModels` verwirft zusätzliche Katalogfelder (`app/src/main/llm/chatClient.ts:1079-1096`). Das OpenRouter-Feld `architecture.input_modalities` ist in der [offiziellen Models-API](https://openrouter.ai/docs/api/api-reference/models/get-models) belegt. Die [LLMBase-Modelldokumentation](https://llmbase.ai/docs/inference/model-discovery/) belegt ebenfalls `input_modalities` und `supported_input_image_media_types` aus `/v1/models?metadata=true`. Ein kostenpflichtiger „Probeaufruf je Modell“ ist daher weder die erste noch eine zuverlässige Fähigkeitsprüfung für JPEG.
Vorschlag: Beide Katalogformate getrennt parsen und für das konkrete Modell `image` sowie `image/jpeg` verlangen; fehlende/unklare Angaben als unbekannt anzeigen und nur nach ausdrücklicher Entscheidung einen Probeaufruf mit Testbild erwägen.

### F35 — Drei Bildseiten sichern das 32k-Kontextbudget nicht
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:883-889
Status: [OFFEN]
`resolveContextWindow` ignoriert LLMBase-Katalogwerte bewusst und setzt 32768 an, selbst wenn ein Modell weniger Kontext hätte (`app/src/shared/contextBudget.ts:73-97`); die derzeitige Schätzung zählt nur Textzeichen (`app/src/shared/contextBudget.ts:33-46`; `app/src/main/noteAgent/loop.ts:348-365`). Der Bildpreis im Kontext hängt von Modell und Aufbereitung ab; „höchstens 3 Seiten“ beweist weder, dass Prompt plus Werkzeuge plus Bilder hineinpassen, noch dass das Modell alle Bilder verarbeitet. LLMBase dokumentiert `context_length` je Modell im [Katalog](https://llmbase.ai/docs/inference/model-discovery/), während die App ihn bereits abfragt, aber für dieses Backend nicht verwendet (`app/src/main/llm/chatClient.ts:1010-1019`).
Vorschlag: Bildanteil separat budgetieren und vor jedem Aufruf die tatsächlich zusammengestellte multimodale Nutzlast prüfen; bei LLMBase den Katalogwert mindestens als **obere** Grenze nutzen und unbekannte Bildkosten/Überläufe sichtbar als Fehler behandeln.

### F36 — Agent-Cloud-Bildweg hat in 1.2 kein Werkzeug
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:866-882,901-910
Status: [OFFEN]
Punkt 19 koppelt Agent-Bilder an Punkt 18 (`view_context_page`), Rev. 6 verspricht Agent-Bilder über Cloud, schließt aber 4c/Punkt 18 ausdrücklich aus. Im echten Agent-Loop gibt es derzeit nur textliefernde `read_attachment`/`read_context_file`-Werkzeuge (`app/src/main/noteAgent/loop.ts:231-240`; `app/src/main/llm/chatClient.ts:45-54,772-812`). Die gemeinsame Erweiterung des Cloud-Clients allein erzeugt keine Bildteile in einer Agent-Nachricht. 4a/4b liefern laut Punkt 13 nur OCR-Text; ein Cloud-Agent sieht damit in 1.2 kein Bild.
Vorschlag: Entweder Agent-Bildinput aus dem 1.2-Versprechen nehmen oder einen ausdrücklich begrenzten Bildlieferweg samt Werkzeug, Bildbudget und Zustimmung in 1.2 aufnehmen. OCR-Text und „Bild vom Modell gesehen“ getrennt anzeigen.

### F37 — Ollama-Cloud-Vision fällt zwischen 3a und 3b
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:643-654,866-882,901-910
Status: [OFFEN]
3a verlangt `resolveLocalModel` und lehnt dadurch `:cloud` sowie `remote_host` ab (`app/src/main/rag/localModel.ts:94-117`); 3b/Punkt 19 beschreiben nur OpenRouter und LLMBase. Ein Ollama-Cloud-Modell kann dennoch `vision` melden, und derselbe lokale Port kann extern rechnen (`app/src/main/rag/localModel.ts:1-10`; `app/src/main/index.ts:6617-6624`). Der Entwurf sagt weder, ob solche Modelle für Bilder ausdrücklich unzulässig bleiben, noch wie die Bildzustimmung und die Anzeige bei einer Unterstützung aussehen würden.
Vorschlag: Für 1.2 Ollama-Cloud-Bilder sichtbar ablehnen **oder** sie als eigenen Cloud-Bildweg mit derselben Main-seitigen Zustimmung und Umfangsanzeige wie OpenRouter/LLMBase spezifizieren; `vision` allein nie als Lokalbeweis verwenden.

### F38 — `images` mit `bytes` ist noch kein tragfähiger Nachrichtenvertrag
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:597-613,912-917
Status: [OFFEN]
Der vorgeschlagene Eintrag `{ id, mime, width, height, bytes }` sagt nicht, ob ein Bild in dieser Anfrage wirklich ans Modell ging, als OCR-Text ersetzt, wegen fehlender Fähigkeit abgewiesen oder in Folgefragen erneut gesendet wurde. Genau diese Zustände unterscheiden Teil 3 und Rev. 2; der heutige Chat-Verlauf besteht aus reinen Textnachrichten (`app/src/renderer/stores/petrolChatStore.ts:28-60`; `app/src/main/llm/chatClient.ts:45-54`). Ein großes `bytes`-Feld direkt je Nachricht lässt außerdem die spätere Trennung von verschlüsseltem `chat.json` und `media/` aus Teil 1 offen.
Vorschlag: Jetzt einen versionierten Laufzeitvertrag für Bildreferenz, aufbereitete Binärdaten, Sendestatus/Route und OCR-Herkunft definieren; Persistenz-DTO und Medienabbildung als getrennte Projektion festhalten. Darauf 3a, 3b und Teil 1 aufbauen.

### F39 — Reihenfolge 1.2 muss Bildvertrag und OCR-Infrastruktur vorziehen
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:895-910,912-917
Status: [OFFEN]
Rev. 6 zieht Bilder vor Teil 1, nennt aber nur Funktionsblöcke, keine Abhängigkeiten. Der Chat benötigt zuerst Bildzustand und Request-Form (`app/src/renderer/stores/petrolChatStore.ts:28-60`; `app/src/main/index.ts:6454,6598-6600`); 4b kann vorhandenes `extractOcrPage` auf Bilder anwenden, während 4a zusätzlich einen Main-seitigen PDF-Rasterweg braucht (`app/src/main/visionOcr.ts:21-52`; `app/src/main/noteAgent/contextFiles.ts:686-715`; `app/src/main/index.ts:9112-9118`). Punkt 19 hängt schließlich an Katalogfähigkeit, Main-Zustimmung und demselben multimodalen Client (`app/src/main/llm/cloudPricing.ts:43-54`; `app/src/main/llm/chatClient.ts:573-591,772-812,902-927`). Ohne diese Reihenfolge droht ein halbfertiger Agent-Bildweg oder ein Datenvertrag, den Teil 1 erneut ändern muss.
Vorschlag: (1) Bildnachricht und Aufbereitung, (2) 3a lokal, (3) Cloud-Fähigkeit/Zustimmung und 3b, (4) gemeinsamer Agent-OCR-Einstieg mit Abbruch/Budget, (5) 4b Bilder, (6) PDF-Raster und 4a; Agent-Cloud-Bildinput erst nach Entscheidung zu F36.

### F40 — Bildzustimmung braucht ein Main-Gate am wirklichen Payload
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:877-882
Status: [OFFEN]
Punkt 19 fordert eine zusätzliche Zustimmung je Funktion, legt aber nicht fest, wer sie vor dem Versand prüft. Die heutigen Main-Gates entscheiden nur nach Cloud-Route bzw. Textfreigabe (`app/src/main/index.ts:4596-4612,4793-4798,6573-6583`); die Chat- und Agent-Clients schicken derzeit ohnehin nur Text (`app/src/main/llm/chatClient.ts:45-54,790-812,917-927`). Sobald dort `image_url` ergänzt wird, muss der Main am **tatsächlichen** multimodalen Request prüfen, ob Bildbytes vorliegen, welche Funktion/Route sie sendet und ob genau dafür die gespeicherte Bildzustimmung gilt. Eine bloße Karte oder ein Renderer-Flag würde die neue Datenart nicht schützen.
Vorschlag: Einen zentralen Main-seitigen Bild-Gate für Chat und Agent definieren; erst danach die Bildteile in die Provider-Nutzlast umwandeln. Ohne Zustimmung ausdrücklich OCR-Text oder eine sichtbare Ablehnung wählen, nie still ein Bild weglassen.

### F41 — Textreiche PDF-Seiten können dennoch ungelesene Scanbilder enthalten
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:791-807,901-910
Status: [OFFEN]
Die vorhandene Stufe 1 markiert eine Seite nur bei weniger als 40 sichtbaren Textzeichen (`app/src/shared/pdfPageText.ts:10-18,39-52`). Stufe 2 schickt nur markierte Seiten zur OCR. Ein Brief mit normalem Text und eingescanntem Formular oder einer Grafik-Tabelle auf derselben Seite überschreitet die Schwelle, wird als vollständig gelesen behandelt und gelangt in 1.2 nicht zum Bildmodell; 4c ist ausdrücklich ausgeschlossen. Umgekehrt kann eine wirklich leere Seite Budget verbrauchen, weil sie ebenfalls markiert wird. Der Entwurf benennt das Problem, entscheidet aber den Status solcher Seiten nicht.
Vorschlag: Nicht behaupten, textreiche Seiten seien visuell vollständig gelesen. Für 1.2 entweder eine explizite „ganze Seite per OCR prüfen“-Option mit Budget anbieten oder bei PDFs mit gemischtem Inhalt sichtbar „Bilder auf Textseiten nicht geprüft“ ausweisen; leere Seiten separat erkennen.

### Runde 5

### F42 — JPEG-Prüfung lässt Metadaten und fremde Nutzbytes durch
Schwere: hoch
ADR-Stelle: app/src/shared/chatImages.ts:65
Status: [OFFEN]
`inspectJpeg` gibt nach SOF und wenigen weiteren Headersegmenten zurück, ohne Scan, EOI oder angehängte Bytes zu prüfen (`app/src/shared/chatImages.ts:81-100`). Es markiert nur APP1/APP13 als Metadaten (`app/src/shared/chatImages.ts:79,93`); APP2/COM und Bytes nach EOI dürfen beliebige Kameradaten oder andere private Inhalte tragen. `checkChatImagesWire` reicht anschließend die **unveränderte** Base64-Nutzlast weiter (`app/src/shared/chatImages.ts:140-145`), die `cloudContent` als Data-URL an den Anbieter sendet (`app/src/main/llm/chatClient.ts:906-910,929-939`). Damit kann ein manipulierter Renderer die Zusage „ohne Ortsangaben und Kameradaten“ umgehen; die Main-Prüfung beweist kein neu kodiertes JPEG (`app/src/renderer/utils/i18n/petrolChat.ts:31-32`). Die Tests erzeugen nur kurze synthetische JPEGs mit APP1 vor/nach SOF (`app/src/shared/chatImages.test.ts:9-19,25-38`).
Vorschlag: Im Main selbst dekodieren und zu einem frischen JPEG kodieren oder ein vollständig geparstes JPEG ohne zusätzliche Segmente/Trailer verlangen; APP2, COM, nachgelagertes APP1 und Bytes nach EOI gezielt testen.

### F43 — Widerruf der Bildfreigabe wirkt nicht vor dem nächsten Upload
Schwere: hoch
ADR-Stelle: app/src/main/index.ts:6575
Status: [OFFEN]
Der Bildschalter ändert zunächst nur den Renderer-Store (`app/src/renderer/components/Settings/CloudProviderSection.tsx:257-267`; `app/src/renderer/stores/uiStore.ts:1464`); dessen Speicherung ist um 300 ms verzögert (`app/src/renderer/stores/uiStore.ts:2043-2048,2066-2081`). Der Main liest die alte Zustimmung aus `ui-settings.json` vor der bis zu dreisekündigen Katalogabfrage (`app/src/main/index.ts:6568-6584`). Nach einem sichtbaren Widerruf kann daher noch ein Bild mit der vorherigen Zustimmung freigegeben und später verschickt werden (`app/src/main/index.ts:6631-6639`). Umgekehrt scheitert ein sofortiger Versand nach „Bilder freigeben“ am noch alten Plattenstand. Der Bildschalter nutzt `flushUISettings` nicht, obwohl diese Funktion für genau solche Main-Gates vorgesehen ist (`app/src/renderer/stores/uiStore.ts:2050-2063`).
Vorschlag: Bildzustimmung synchron und mit bestätigtem Speichererfolg ändern; unmittelbar vor dem Cloud-Fetch erneut gegen die aktuelle Main-Kopie prüfen und einen Widerruf während des Preflights berücksichtigen.

### F44 — Unbekannte OpenRouter-Bildfähigkeit wird als Versandfreigabe behandelt
Schwere: hoch
ADR-Stelle: app/src/shared/chatImageGate.ts:73
Status: [OFFEN]
`getModelImageInput` liefert bei Katalogfehler oder fehlendem Modell/Feld `unknown` (`app/src/main/llm/cloudPricing.ts:92-105,108-120`); der Handler erzeugt denselben Wert nach drei Sekunden Timeout (`app/src/main/index.ts:6576-6584`). Das Cloud-Gate sperrt nur `vision === 'no'` und lässt `unknown` für **OpenRouter und LLMBase** durch (`app/src/shared/chatImageGate.ts:73-85`), obwohl Rev. 7 für OpenRouter ein belegtes `architecture.input_modalities: image` verlangt (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1074-1079`). Die Bilder gehen damit bei einer nicht verifizierten OpenRouter-Fähigkeit bereits im ersten Request hinaus; ein Provider-Fehler kommt erst danach. Auch bei positivem `image`-Wert prüft der Parser kein JPEG-Medienformat (`app/src/main/llm/cloudPricing.ts:46-59`).
Vorschlag: OpenRouter bei `unknown` fail-closed behandeln; für LLMBase die beschlossene Ausnahme ausdrücklich separat führen und unterstützte JPEG-Eingabe prüfen, soweit der Katalog sie nennt.

### F45 — OCR akzeptiert unbekannte lokale Vision-Fähigkeit
Schwere: mittel
ADR-Stelle: app/src/main/ocr/localOcr.ts:45
Status: [OFFEN]
Der gemeinsame OCR-Einstieg lehnt ein Modell ohne `vision` nur dann ab, **wenn** `capabilities` überhaupt vorhanden sind (`app/src/main/ocr/localOcr.ts:45-49`). `resolveLocalModel` kennzeichnet fehlende Fähigkeiten ausdrücklich als möglich (`app/src/main/rag/localModel.ts:37-43,119`). Danach geht das Seitenbild an `/api/chat` (`app/src/main/ocr/localOcr.ts:53-55`; `app/src/main/visionOcr.ts:54-76`). Das verletzt die Rev.-7-Zusage einer frischen Vision-Prüfung vor jeder Seite (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1098-1105`); der Chat-Bildweg lehnt denselben unbekannten Zustand korrekt ab (`app/src/shared/chatImageGate.ts:58-64`). Der OCR-Test deckt nur explizites Nicht-Vision ab (`app/src/main/ocr/localOcr.test.ts:19-27`).
Vorschlag: Fehlende `capabilities` im OCR-Einstieg ablehnen und diesen Fall testen.

### F46 — Erkannter Bildtext verliert seine Herkunft vor späteren Cloud-Fragen
Schwere: mittel
ADR-Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:260
Status: [OFFEN]
Der OCR-Ausweg schreibt den erkannten Text als gewöhnlichen Entwurf (`app/src/renderer/components/Agent/PetrolChat.tsx:260-270`); beim Senden wird daraus nur `content`, ohne maschinenlesbare OCR-Herkunft (`app/src/renderer/stores/petrolChatStore.ts:314-319,386-402`). Spätere Fragen übernehmen diesen Inhalt über `chatHistoryForModel` (`app/src/renderer/utils/chatHistory.ts:19-24`; `app/src/renderer/stores/petrolChatStore.ts:292-293,334-345`). Ein Wechsel auf OpenRouter/LLMBase schickt ihn als Text, auch über den Web-Antwortweg (`app/src/main/index.ts:6949-6952,7289-7293,6792-6810`), ohne die Bildzustimmung zu prüfen; dort gilt nur die allgemeine `notes-chat`-Freigabe (`app/src/main/index.ts:6972-6975`). Das direkte Bild/Web-Verbot schützt nur die aktuelle Bild-Nutzlast (`app/src/renderer/stores/petrolChatStore.ts:296-298`). Der Nutzer sieht den OCR-Text beim ersten Senden, aber die spätere Weitergabe des Foto-Inhalts im Verlauf wird nicht gesondert ausgewiesen.
Vorschlag: OCR-Herkunft im Nachrichtenvertrag erhalten; bei Cloud- oder Web-Folgefragen bildabgeleiteten Verlauf ausdrücklich anzeigen und zur Auswahl stellen oder ohne neue Freigabe aus dem Verlauf nehmen.

### F47 — Fremde PDF wird vor dem Rasterfenster im Main geparst und ist dort nicht abbrechbar
Schwere: hoch
ADR-Stelle: app/src/main/noteAgent/contextFiles.ts:713
Status: [OFFEN]
`extractPdfText` ruft `pdfjs.getDocument`, `getTextContent` und `getOperatorList` im Main auf, bevor das abgeschottete Rasterfenster startet (`app/src/main/noteAgent/contextFiles.ts:713-753,762-765`). In dieser Phase gibt es weder Agent-Abbruchprüfung noch Seitenfrist; beim `folder_digest` sind bis zu 500 Seiten pro PDF erlaubt (`app/src/main/noteAgent/contextFiles.ts:1264,1343-1344`). Die Aussage, die fremde PDF werde in einem Sandbox-Prozess geparst, gilt daher nur für das **zweite** Parsen im Rasterfenster (`app/src/main/ocr/pdfRaster.ts:5-9,41-49`; `app/src/renderer/pdfRaster/pdfRaster.ts:26-30`). Ein defektes oder aufwendiges PDF kann den Main schon vor der ersten abbrechbaren Rasterseite blockieren.
Vorschlag: Text- und Operator-Extraktion ebenfalls in einen isolierten, abbrechbaren Prozess verlagern oder zumindest harte Zeit-/Seiten-/Laufgrenzen um den Main-Parser setzen; große und defekte PDFs im Test einbeziehen.

### F48 — 40 Seiten begrenzen Aufrufe, nicht die Laufzeit oder parallele OCR
Schwere: hoch
ADR-Stelle: app/src/main/ocr/agentOcr.ts:17
Status: [OFFEN]
Das Agent-Budget zählt 40 OCR-Aufrufe (`app/src/main/ocr/agentOcr.ts:17-31,77-92`), jeder darf aber bis zu 120 Sekunden laufen (`app/src/main/visionOcr.ts:24-25,32-45`), zusätzlich bis zu 60 Sekunden je Raster-Operation (`app/src/main/ocr/pdfRaster.ts:16-17,109-118`). Ohne Laufzeitdeckel kann ein Auftrag theoretisch deutlich über eine Stunde nur mit OCR beschäftigt sein. Der Chat-IPC legt für jede OCR-Anfrage einen eigenen Controller an und serialisiert oder begrenzt parallele Aufrufe nicht (`app/src/main/index.ts:9709-9731`); gleiche `requestId` überschreiben einander im globalen Map, und ein Abort ist nicht an den Absender gebunden (`app/src/main/index.ts:9716-9718,9733-9735`). Die UI erlaubt zwar nur einen Lauf, der Main erzwingt das nicht (`app/src/renderer/components/Agent/PetrolChat.tsx:253-255`).
Vorschlag: Zeit- und Parallelitätsbudget Main-seitig pro Absender/Lauf setzen, OCR-Anfragen eindeutig an den Sender binden und doppelte Kennungen ablehnen; Gesamtabbruch gegen laufendes und wartendes Raster testen.

### F49 — Alter Fensterstart kann ein neues Rasterfenster schließen
Schwere: mittel
ADR-Stelle: app/src/main/ocr/pdfRaster.ts:62
Status: [OFFEN]
Bei einem Timeout/Abbruch schließt `withTimeout` das globale Fenster (`app/src/main/ocr/pdfRaster.ts:74-83`). Der ursprüngliche `load`/`ready`-Promise lebt weiter; sein `ready.catch(() => closeRasterWindow())` schließt **ohne Identitätsprüfung** das jeweils aktuelle globale Fenster (`app/src/main/ocr/pdfRaster.ts:62-71`). Ist der alte Fensterstart später fehlgeschlagen und hat ein Folgeauftrag bereits ein neues Fenster geöffnet, zerstört der alte Catch den neuen Auftrag. Die Queue serialisiert Aufträge, verhindert diese späte Promise-Reaktion aber nicht (`app/src/main/ocr/pdfRaster.ts:107-126`). Ein Test für Timeout während des Fensterstarts und sofortigen Folgelauf fehlt (keine `pdfRaster`-Tests im Stand).
Vorschlag: Catch/Timeout nur das zugehörige `BrowserWindow` schließen lassen; nach Abbruch jeden alten Promise und jede Fensterkennung gegen den aktuellen Lauf prüfen.

### F50 — PDF-Abdeckung wird wieder aus untrusted Text erraten
Schwere: hoch
ADR-Stelle: app/src/main/noteAgent/contextFiles.ts:789
Status: [OFFEN]
`assemblePdfPages` erzeugt zwar `PdfCoverage` getrennt vom Text (`app/src/shared/pdfPageText.ts:48-73,124-131`), `extractPdfText` verwirft die Struktur sofort mit `.text` (`app/src/main/noteAgent/contextFiles.ts:784-789`). Ordner- und Digest-Status suchen anschließend per `lastIndexOf` nach Zeichenfolgen wie `[Texterkennung:` **im gesamten PDF-Text** (`app/src/shared/pdfPageText.ts:150-170`; `app/src/main/noteAgent/contextFiles.ts:931-946,1344-1353`). Eine PDF, deren Textebene selbst einen solchen String enthält, kann somit OCR-/Fehlseitenstatus vortäuschen; Kürzungswege kopieren diese gefundenen Strings weiter (`app/src/main/noteAgent/contextFiles.ts:684-689`). Rev. 7 versprach gerade eine vom Modelltext getrennte Abdeckung (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1116-1122`).
Vorschlag: `PdfCoverage` durch die Leser bis zu Manifest, Digest und UI tragen; Textvermerke nur aus dieser Struktur erzeugen, nie als Statusquelle wieder einlesen.

### F51 — Frühe Bildablehnung hat keinen Bildstatus und keinen OCR-Ausweg
Schwere: mittel
ADR-Stelle: app/src/main/llm/chatImageRequest.ts:68
Status: [OFFEN]
Wenn die Main-Byteprüfung ein Bild wegen Metadaten, Größe oder ungültigem JPEG ablehnt, ruft `prepareChatImageRequest` `reject` **ohne IDs** auf und liefert eine leere `imageDelivery` (`app/src/main/llm/chatImageRequest.ts:62-69`). Der Store hängt zwar die leere Map an die Frage (`app/src/renderer/stores/petrolChatStore.ts:412-415`), die Bildmarke zeigt dann keinen „nicht gesendet“-Status (`app/src/renderer/components/Agent/PetrolChat.tsx:682-688`). Der versprochene Knopf „Text aus dem Bild lesen“ erscheint nur bei `kind === 'rejected'` (`app/src/renderer/components/Agent/PetrolChat.tsx:713-716`). Der Nutzer sieht bloß den allgemeinen Fehler, obwohl die Frage mit Bild im Verlauf bleibt.
Vorschlag: Bereits aus den gültig lesbaren IDs der Wire-Eingabe für jede frühe Ablehnung einen Status zurückgeben; bei unlesbaren Bytes die ganze Frage sichtbar als abgelehnt markieren und OCR nur anbieten, wenn das Bild sicher dekodiert werden kann.

### F52 — Release-kritische Grenzen sind nur mit Mocks oder gar nicht getestet
Schwere: mittel
ADR-Stelle: app/src/main/llm/chatImageRequest.test.ts:15
Status: [OFFEN]
Die Bild-Gate-Tests prüfen einen synthetischen JPEG-Header und gemockte Modellauflösung/Katalogantworten (`app/src/shared/chatImages.test.ts:9-21,25-54`; `app/src/main/llm/chatImageRequest.test.ts:5-13,20-47`). Die OCR-Tests ersetzen Extraktion bzw. Bildvorbereitung durch Fakes (`app/src/main/ocr/localOcr.test.ts:19-35`; `app/src/main/ocr/agentOcr.test.ts:5-8,11-45`). Für den tatsächlichen `ollama-chat`/`lmstudio-chat`-IPC, Widerruf während des Katalog-Preflights, verstecktes Rasterfenster und gemischte PDF mit Abbruch gibt es damit keinen automatisierten Gegenbeleg; der Status nennt den echten Cloud-Bildweg und das 12-Bilder-Prüfset selbst noch offen (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1140-1145,1164-1172`).
Vorschlag: Vor 1.2 gezielte Integrationstests an den genannten Grenzen und den angekündigten Cloud-/Bild-Gegenproben durchführen; insbesondere Metadaten-Trailer, OCR-Abbruch und Folgelauf nach Raster-Timeout prüfen.

### F53 — Weggelassene Verlaufsbilder sind nur für das Modell sichtbar markiert
Schwere: mittel
ADR-Stelle: app/src/shared/chatImages.ts:218
Status: [OFFEN]
`planImageHistory` hängt den Vermerk „Bild nicht mehr mitgeschickt“ an den **ausgehenden** Nachrichtentext (`app/src/shared/chatImages.ts:214-223`). Der Store sendet diese geplanten Nachrichten, behält im sichtbaren Verlauf aber `before` mit den ursprünglichen Fragen/Bildmarken (`app/src/renderer/stores/petrolChatStore.ts:386-402,412-421`). `ChatImageDelivery` kennt zwar `history-dropped` (`app/src/shared/chatImages.ts:37-42`), der Main meldet aber nur gesendete IDs (`app/src/main/llm/chatImageRequest.ts:111-117`), und die Oberfläche zeigt nur den alten Bildstatus (`app/src/renderer/components/Agent/PetrolChat.tsx:682-688`). Der Nutzer kann bei einer Folgefrage nicht erkennen, welche älteren Bilder das Modell gerade nicht mehr sah, obwohl Rev. 7 den Vermerk als sichtbare Verlaufsregel festlegt (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1065-1066`).
Vorschlag: Für jede Anfrage die weggelassenen IDs aus dem Main zurückmelden und den Hinweis beim betreffenden Bild bzw. bei der aktuellen Antwort sichtbar machen; den Status des ursprünglichen Versands getrennt behalten.

### Runde 6

### F54 — F43: Sichtbarer Widerruf kann vor dem Speichern noch überholt werden
Schwere: hoch
ADR-Stelle: app/src/renderer/components/Settings/CloudProviderSection.tsx:263
Status: [OFFEN]
Der Bildfreigabe-Schalter in den Einstellungen und der Freigabe-Knopf im Petrol-Chat setzen zuerst den Renderer-Store und starten `flushUISettings()` ohne dessen Ergebnis abzuwarten oder bei Schreibfehler zurückzurollen (`app/src/renderer/components/Settings/CloudProviderSection.tsx:263-269`; `app/src/renderer/components/Agent/PetrolChat.tsx:853-857`). `flushUISettings` reiht den Schreibvorgang zudem hinter schon laufende Saves ein (`app/src/renderer/stores/uiStore.ts:2003-2026,2055-2063`). Der Main prüft vor `streamCloudChat` zwar erneut, liest aber nur den bis dahin gespeicherten Plattenstand (`app/src/main/index.ts:6631-6647`). Nach sichtbarem Widerruf kann eine reine Textfolgefrage sofort gesendet werden, weil die UI-Sperre nur neue Entwurfsbilder betrachtet (`app/src/renderer/components/Agent/PetrolChat.tsx:279-284,378-383`); der Store hängt aber bis zu zwei ältere Bildnachrichten an (`app/src/renderer/stores/petrolChatStore.ts:386-403`). Bei verzögerter oder fehlgeschlagener Speicherung kann der Main dafür noch die alte Zustimmung lesen und die Verlaufsbilder hochladen. Der neue Main-Check schließt das F43-Fenster also nicht vollständig.
Vorschlag: Den Zustimmungswechsel bis zur bestätigten Speicherung als „wird geändert“ behandeln, Senden mit tatsächlichen ausgehenden Bildern einschließlich Verlauf dabei sperren und bei `false` den UI-Wert zurückrollen; Widerruf außerdem Main-seitig sofort registrieren, damit ein laufender Preflight ihn sieht.

### F55 — F47: Die PDF-Frist bricht keine einzelne Parser-Operation ab
Schwere: hoch
ADR-Stelle: app/src/main/noteAgent/contextFiles.ts:728
Status: [OFFEN]
Die 60-Sekunden-Uhr startet erst **nach** `pdfjs.getDocument(...).promise` und wird nur am Beginn der nächsten Seite geprüft (`app/src/main/noteAgent/contextFiles.ts:724-740`). `doc.getPage`, `page.getTextContent`, `page.getOperatorList` und `doc.destroy` werden ohne Timeout oder Abbruchsignal abgewartet (`app/src/main/noteAgent/contextFiles.ts:741-769`). Ein einzelner hängender Parser-Schritt kann daher den Main weit länger als 60 Sekunden belegen; ein Agent-Stopp greift erst an der nächsten Schleifenprüfung. Die Antwort zu F47 verspricht „hört nach 60 s auf“ (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1192-1194`), was der Code nicht erzwingt.
Vorschlag: Die PDF-Parserarbeit in einen abbrechbaren Prozess verlagern oder echte, durchgesetzte Fristen um Dokumentöffnung und Seitenoperationen setzen; mindestens einen blockierenden Einzelseitenfall testen.

### F56 — F50: Gesamtbudget schneidet strukturierte PDF-Vermerke erneut ab
Schwere: mittel
ADR-Stelle: app/src/main/noteAgent/contextFiles.ts:1254
Status: [OFFEN]
Der neue `ExtractMeta` transportiert PDF-Vermerke tatsächlich getrennt vom Dateiinhalt (`app/src/main/noteAgent/contextFiles.ts:703-708,805-807`). Im Leser für mehrere Kontextanhänge werden diese Vermerke gegebenenfalls nach dem Datei-Limit angehängt (`app/src/main/noteAgent/contextFiles.ts:1243-1250`), **danach** kürzt aber das kumulative `remainingBefore` den ganzen String erneut und hängt nur einen allgemeinen Gesamtbudget-Hinweis an (`app/src/main/noteAgent/contextFiles.ts:1254-1264`). Eine gemischte PDF kann dadurch im Notiz-Chat wieder ohne Hinweis auf ungelesene Scan-Seiten oder unvollständige OCR beim Modell landen; die Rückgabe meldet nur `truncated`, keine Abdeckung (`app/src/main/noteAgent/contextFiles.ts:1206-1209,1264`). Das ist ein noch offener Weg von F50, obwohl `pdfCoverageNotes` selbst nicht mehr aus fremdem Text liest.
Vorschlag: Nach der **letzten** Kürzung einen knappen, budgetierten Vermerk aus `ExtractMeta` anfügen und die Abdeckung zusätzlich strukturiert im Leseergebnis halten.

### F57 — F53: Beim Stopp verschwindet der Hinweis auf fehlende Verlaufsbilder
Schwere: mittel
ADR-Stelle: app/src/renderer/stores/petrolChatStore.ts:420
Status: [OFFEN]
`imagesDropped` wird nur auf eine erfolgreich abgeschlossene Antwort geschrieben (`app/src/renderer/stores/petrolChatStore.ts:420-423`). Stoppt der Nutzer während des Streams, bleibt eine bereits erzeugte Teilantwort sichtbar, wird aber ohne `imagesDropped` gespeichert (`app/src/renderer/stores/petrolChatStore.ts:426-455`). Die Oberfläche zeigt den Hinweis ausschließlich bei diesem Feld der Antwort (`app/src/renderer/components/Agent/PetrolChat.tsx:774-781`). Gerade bei einer Teilantwort über ältere Bilder ist somit wieder unsichtbar, welche Bilder das Modell nicht erhielt; F53 ist nur für fertige Antworten behoben.
Vorschlag: Die Zahl bereits beim Versand an der laufenden Frage/Anfrage speichern und beim Stopp in die Teilantwort übernehmen.

### F58 — F48: Chat-OCR läuft nach Fensterende weiter; ungültige Kennung wird ersetzt
Schwere: mittel
ADR-Stelle: app/src/main/index.ts:9720
Status: [OFFEN]
Die neue Map begrenzt die OCR auf eine Anfrage je `senderId` und schützt den Abort vor fremden Fenstern (`app/src/main/index.ts:9720-9726,9746-9749`). Es gibt aber keinen `destroyed`-Handler für den Absender; beim Schließen des Fensters läuft die OCR bis zu vier Bilder nacheinander weiter, jeweils mit bis zu 120 Sekunden Standardfrist (`app/src/main/index.ts:9734-9743`; `app/src/main/visionOcr.ts:24-25,32-41`). Der IPC akzeptiert zudem eine nicht-stringförmige Kennung und speichert dafür `''`, während der Abort nur eine Stringkennung annimmt (`app/src/main/index.ts:9726,9746-9749`). Ein Abbruch mit der ursprünglichen ungültigen Kennung erreicht den Lauf nicht; die weiterlaufende OCR hält Ollama unnötig im Vordergrund (`app/src/main/ocr/localOcr.ts:57-65`).
Vorschlag: Kennung vor Belegung validieren, beim `sender.destroyed` den Controller abbrechen und den Listener im `finally` entfernen.

### Runde 7

### F59 — Verschachtelte Webdaten umgehen die Feldliste
Schwere: hoch
ADR-Stelle: app/src/shared/petrolChatStored.ts:91
Status: [OFFEN]
`toStoredWeb` übernimmt `report`, `extras`, `provenance`, `skipped` und `deep` als ganze Objekte/Arrays (`app/src/shared/petrolChatStored.ts:91-103`); `toStoredMessage` kopiert außerdem `imageDelivery` und `imageRecipients` nur flach (`app/src/shared/petrolChatStored.ts:125-129`). Die behauptete explizite Feldliste gilt damit nur für die äußere Nachricht und `sources`. Besonders `report`, `extras` und `deep` akzeptieren beim Laden beliebige zusätzliche JSON-Felder (`app/src/shared/petrolChatStored.ts:233-249`). Ein künftig oder fehlerhaft hinzugefügtes `deep.excerpt`, `report.snapshotId` oder ähnliches landet somit trotz `toStoredMessage` im verschlüsselten JSON und wird wieder akzeptiert; der Test prüft nur die heutigen Beispieldaten und ein äußeres Zusatzfeld (`app/src/shared/petrolChatStored.test.ts:55-77,106-113`).
Vorschlag: Auch alle verschachtelten Web- und Bild-Metadaten mit expliziten Projektionen und passenden exakten Schemata behandeln; Negativtests für Auszug, Snapshot-Kennung und Bildbytes in jeder frei übernommenen Struktur.

### F60 — „Strenges Laden“ akzeptiert Daten, an denen die Anzeige scheitert
Schwere: hoch
ADR-Stelle: app/src/shared/petrolChatStored.ts:233
Status: [OFFEN]
Für `report` genügen beliebige Arrays `refs`/`sentences` und ein beliebiges Objekt `summary`; `extras` braucht nur ein JSON-Array, `deep` nur ein JSON-Objekt (`app/src/shared/petrolChatStored.ts:233-249`). Daher akzeptiert `parseStoredChat` z. B. `deep: {}`, `extras: [null]` oder `report: {refs: [], sentences: [null], usedSources: [], summary: {}}` (`app/src/shared/petrolChatStored.ts:302-305`). Nach `restoreMessage` werden diese Werte unverändert an die Anzeige gegeben (`app/src/shared/petrolChatStored.ts:146-152`), die `deep.queries.some`, `extras.filter(x => x.gap)` und `sn.status` liest (`app/src/renderer/components/Agent/PetrolWebAnswer.tsx:354-359,136-145,165-175`). Ein als lesbar gelistetes Gespräch kann so beim Anzeigen abstürzen. Die Tests prüfen keine defekten verschachtelten Strukturen (`app/src/shared/petrolChatStored.test.ts:90-134`).
Vorschlag: `CitationReport`, `SentenceExtra`, `WebDeepInfo` und deren Unterobjekte vollständig prüfen; für optionale historische Felder eine ausdrücklich versionierte Migration statt beliebiger JSON-Werte.

### F61 — Geladene Webprüfung behauptet weiter Belegstatus ohne Seitenauszug
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:792
Status: [OFFEN]
Rev. 2 verlangt bei auszugabhängiger „Prüfung je Satz“ nach dem Laden „nach dem Neustart nicht verfügbar“ (`docs/codex-collab/chat-verlauf-notizen-bilder.md:792-797`). `restoreMessage` setzt die Auszüge leer, behält aber `report` und `extras` samt zuvor aus Auszügen berechneten Werten (`app/src/shared/petrolChatStored.ts:91-103,146-150`; Berechnung `app/src/main/index.ts:7327-7335`). Die jetzige Anzeige verwendet deren Status und Warnungen unverändert, ohne Verfügbarkeitsmerkmal (`app/src/renderer/components/Agent/PetrolChat.tsx:747-752`; `app/src/renderer/components/Agent/PetrolWebAnswer.tsx:136-180`). Schritt 5 nennt nur Snapshot-Knopf, Nachfrage-Hinweis und einen Test „ohne Auszüge“, aber keinen Anzeigezustand für die nicht mehr nachvollziehbare Satzprüfung (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1359-1361`).
Vorschlag: Geladene Prüfung als gespeichertes Ergebnis mit fehlender nachprüfbarer Textbasis kennzeichnen und auszugabhängige Details ausdrücklich „nach dem Neustart nicht verfügbar“ anzeigen; Anzeige und Export darauf testen.

### F62 — Die vorhandene Anzeige ignoriert beide Wiederherstellungsmerkmale
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:1359
Status: [OFFEN]
Schritt 1 setzt `hadSnapshot` und `wasFollowUp` (`app/src/shared/petrolChatStored.ts:118-121,146-152`), aber der deaktivierte Quellenknopf wird derzeit nur innerhalb `msg.web?.snapshotId` gerendert (`app/src/renderer/components/Agent/PetrolChat.tsx:592-604`). Bei einer geladenen gescheiterten Nachfrage ist `followUpSnapshotId` weg; „Erneut senden“ erscheint deshalb wieder und `followUpGoneHint` fehlt (`app/src/renderer/components/Agent/PetrolChat.tsx:717-728`). Die Frage hat zudem weiter `followUp: true`, wodurch sie als Nachfrage etikettiert bleibt (`app/src/renderer/components/Agent/PetrolChat.tsx:703-705`). Der Bauplan verschiebt die Korrektur auf Schritt 5; Schritt 4 lädt die Gespräche aber bereits und bietet die Oberfläche an (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1352-1361`).
Vorschlag: Laden und Anzeige der Merkmale in einem Schritt ausliefern; beide Zweige einschließlich Retry und automatischer Vormerkung mit einem real geladenen Gespräch testen.

### F63 — Fehlende Mediendatei wird zum scheinbar nutzbaren Bild
Schwere: hoch
ADR-Stelle: app/src/shared/petrolChatStored.ts:141
Status: [OFFEN]
`restoreMessage` erzeugt bei fehlender Mediendatei ein Bild mit `dataBase64: ''`, und der Test erklärt das als erwartete Rundreise (`app/src/shared/petrolChatStored.ts:141-152`; `app/src/shared/petrolChatStored.test.ts:149-152`). Die Oberfläche zeigt dann ein kaputtes `<img>` ohne Fehlhinweis (`app/src/renderer/components/Agent/PetrolChat.tsx:690-699`). Beim Weiterfragen nimmt der Store die Bild-ID trotzdem in `known` und ggf. in die nächste Nutzlast (`app/src/renderer/stores/petrolChatStore.ts:351-373`); die Main-Prüfung lehnt die leeren Bytes als ungültiges JPEG ab (`app/src/shared/chatImages.ts:128-146`). Schritt 2 räumt nur *unreferenzierte* Medien auf und definiert keinen Fehlerzustand für ein referenziertes, fehlendes oder nicht entschlüsselbares Bild (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1326-1337`).
Vorschlag: Fehlendes oder defektes Medium als unlesbares Gespräch bzw. als sichtbaren, nicht erneut sendbaren Bildstatus behandeln; Laden und Folgefrage dafür testen.

### F64 — Die 2000er-Kürzung kann einen Antwortanfang ohne Frage speichern
Schwere: mittel
ADR-Stelle: app/src/shared/petrolChatStored.ts:317
Status: [OFFEN]
`buildStoredChat` schneidet blind die letzten 2000 *Nachrichten* ab (`app/src/shared/petrolChatStored.ts:315-325`), obwohl der eigene Vertrag begründet, dass eine Frage nicht ohne Antwort in den Modellverlauf darf (`app/src/shared/petrolChatStored.ts:14-16`). Bei 2001 regulär wechselnden Nachrichten kann das erste gespeicherte Element eine Assistentenantwort sein. `parseStoredChat` prüft nur Einzelobjekte, nicht die Reihenfolge (`app/src/shared/petrolChatStored.ts:267-305`); `toTurns` zeigt die Antwort allein, und `completedTurns`/`chatHistoryForModel` lassen sie als Modellkontext durch (`app/src/renderer/components/Agent/PetrolChat.tsx:1122-1133`; `app/src/renderer/utils/chatHistory.ts:19-24,39-50`).
Vorschlag: Nur an vollständigen Wechselgrenzen kürzen und die Sequenz beim Laden prüfen; Test jenseits der 2000er-Grenze mit Stopp- und Fehlerwechseln.

### F65 — Bild-IDs sind als Dateischlüssel nicht gesprächsweit eindeutig
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:1327
Status: [OFFEN]
Schritt 2 verwendet `media/<bild-id>.jpg.enc` als einzigen Dateischlüssel und fordert nur ein Zeichenmuster (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1326-1337`). `parseStoredChat` prüft das Muster pro Bild, aber keine Eindeutigkeit über alle Nachrichten (`app/src/shared/petrolChatStored.ts:251-259,267-305`). `imageIdsIn` entfernt Duplikate sogar bewusst (`app/src/shared/petrolChatStored.ts:133-135`). Zwei verschiedene Bilder mit derselben ID würden somit eine Mediendatei teilen; nach Laden zeigt mindestens eine Frage falsche Bytes. Die Renderer-ID besteht aus Zeitstempel und pro Renderer neu startendem Zähler (`app/src/renderer/utils/chatImagePrep.ts:18,45-53`) und ist keine gesprächsweite Main-Zusage.
Vorschlag: IDs beim Anhängen im Main gesprächsweit vergeben oder Kollisionen mit unterschiedlichen Bytes strikt zurückweisen; Laden auf doppelte IDs prüfen und einen Kollisionsfall testen.

### F66 — Der Main-Bauplan bindet die Gesprächs-ID nicht an ihren Vault
Schwere: hoch
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:1339
Status: [OFFEN]
Rev. 2 verlangt eine Bindung jedes Gesprächs an den Vault (`docs/codex-collab/chat-verlauf-notizen-bilder.md:799-808`), und der Ablagepfad wird aus `vaultPath` abgeleitet (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1326-1327`). Schritt 3 lässt den Renderer aber `{ conversationId, vaultPath, ... }` je Anfrage schicken und nennt nur eine Speicherkarte je Absender und ID (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1339-1342`). Ein Abgleich gegen den beim Erzeugen/Öffnen fest gebundenen, genehmigten Vault sowie der Umgang mit gleicher ID unter anderem Vault fehlen. Die heutigen Chat-Handler erhalten ihren Verlauf und Scope ebenfalls als Renderer-Angaben (`app/src/renderer/stores/petrolChatStore.ts:299-315,368-373`; `app/src/main/index.ts:6959-6962`). Ohne diese Grenze kann ein Gespräch nach Vault-Wechsel unter falschem Vault fortgesetzt oder gespeichert werden.
Vorschlag: Im Main Gesprächsschlüssel `(Absender, kanonischer genehmigter Vault, Gesprächs-ID)` führen, Vault bei Erzeugung/Öffnung festbinden und jede spätere Anfrage mit abweichendem Vault ablehnen; Wechsel während Stream und Speicherkette testen.

### F67 — Stopp-Bruchstück braucht mehr als die Textstücke im Main
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:1345
Status: [OFFEN]
Schritt 3 sagt, der Main kenne das Stopp-Bruchstück aus dem Stream und speichere Stopp/Fehler selbst (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1344-1348`). Für Web-Stopp entsteht die gespeicherte Nachricht heute aber aus *zwei* Kanälen: Textstücken und `petrol-chat-progress` mit bereits feststehenden Quellen, Fehlern und Suchanfragen (`app/src/renderer/stores/petrolChatStore.ts:188-214,418-437`). Der Web-Handler sendet diese Quellen vor der Modellphase und gibt beim Abort ein `stopped`-Ergebnis ohne Antworttext zurück (`app/src/main/index.ts:7294-7305,7316-7325`). Der Bauplan erwähnt weder die Übernahme dieser Fortschrittsdaten in den neuen Main-Gesprächszustand noch die Regel für spät eintreffende Stopp-Ergebnisse; sonst gehen `webPartial`, `webSentQueries` und der Quellenbezug des Bruchstücks verloren.
Vorschlag: Pro Anfrage im Main Text, Webfortschritt und Bildzustand sammeln; beim Stopp genau einmal atomar finalisieren und ein spätes Ergebnis nur für Metadaten desselben Wechsels nachtragen. Suche-, Modell- und Direktstopp testen.

### F68 — Exakte Formprüfung akzeptiert geerbte JavaScript-Schlüssel
Schwere: mittel
ADR-Stelle: app/src/shared/petrolChatStored.ts:216
Status: [OFFEN]
`shape` prüft unbekannte Schlüssel mit `k in fields` statt auf eigene Schemafelder (`app/src/shared/petrolChatStored.ts:216-218`). Da `fields` ein normales Objekt ist, sind `__proto__`, `constructor` und `toString` dort über die Prototypkette vorhanden. Ein per `JSON.parse` geladenes Gespräch mit z. B. `{"__proto__":{"excerpt":"..."}}` an Kopf, Nachricht oder Quelle besteht deshalb diesen Teil der Prüfung, obwohl der Vertrag unbekannte Felder ablehnen will (`app/src/shared/petrolChatStored.ts:221,267-305`). Der Test verwendet nur `extra`, das tatsächlich abgelehnt wird (`app/src/shared/petrolChatStored.test.ts:106-113`).
Vorschlag: `Object.hasOwn(fields, k)` oder ein nullprototypisches Schema verwenden und die drei Schlüssel als Negativfälle testen.

### Runde 8

### F69 — Zwei offene Fragen bestehen die neue Wechselfolgen-Prüfung
Schwere: mittel
ADR-Stelle: app/src/shared/petrolChatStored.ts:313
Status: [OFFEN]
`validSequence` erlaubt jede Folge von Nutzerfragen und prüft bei zwei Fragen hintereinander nicht, ob die erste als `stopped` markiert ist (`app/src/shared/petrolChatStored.ts:313-319,387-392`). Genau diese Markierung ist aber der Grund für die Ausnahme; ohne sie bleibt die erste Frage beim späteren Modellverlauf als offene Frage stehen, weil `completedTurns` sie nur bei eigenem `stopped` oder direkt folgender fehlerhafter/gestoppter Antwort entfernt (`app/src/renderer/utils/chatHistory.ts:32-50`). Ein gespeichertes `[user ohne stopped, user, assistant]` gilt daher als lesbar und liefert beide Fragen ans Modell. Der neue Test deckt nur die markierte Ausnahme ab (`app/src/shared/petrolChatStored.test.ts:299-304`).
Vorschlag: Auf eine Nutzerfrage darf nur dann direkt eine weitere folgen, wenn die erste `stopped: true` trägt; diesen Negativfall beim Laden und Bauen testen.

### F70 — `written` umgeht nach dem ersten Save den Schutz für nicht lesbare Gespräche
Schwere: hoch
ADR-Stelle: app/src/main/petrolChats/storage.ts:180
Status: [OFFEN]
`save` prüft `readChat` auf `unreadable` nur, solange `written` für den Ordner fehlt (`app/src/main/petrolChats/storage.ts:180-188`). Nach einem erfolgreichen Save steht der Hash im Cache (`app/src/main/petrolChats/storage.ts:202-204`). Wird `chat.json.enc` danach beschädigt oder der Schlüssel gewechselt, liefert derselbe Inhalt bei `exists(file)` sofort `false` („unverändert“), ohne die Lesbarkeit zu prüfen; ein geänderter Inhalt überspringt den `readChat`-Zweig und überschreibt sogar die nicht lesbare Datei (`app/src/main/petrolChats/storage.ts:180-202`). Das widerspricht der Zusage, nicht lesbare Gespräche nie zu überschreiben (`app/src/main/petrolChats/storage.ts:11-14,166-170`). Der Fremdschlüsseltest nutzt dafür eine **neue** Storage-Instanz und verfehlt den Cache-Fall (`app/src/main/petrolChats/storage.test.ts:177-186`).
Vorschlag: Cache nur als Beschleunigung für eine nachweislich unveränderte Datei verwenden (Dateiidentität/mtime oder erneute Lesbarkeit prüfen); Schutz gegen Schlüsselwechsel und externe Beschädigung mit derselben Instanz testen.

### F71 — Unverändertes JSON und vorhandene Dateien verhindern die Bildreparatur
Schwere: hoch
ADR-Stelle: app/src/main/petrolChats/storage.ts:180
Status: [OFFEN]
Der Hash für „unverändert“ enthält nur `JSON.stringify(chat)` (`app/src/main/petrolChats/storage.ts:176-180`). Ein erster Save darf `chat.json.enc` mit Bildverweis schreiben, obwohl `images` fehlen oder ungültig sind (`app/src/main/petrolChats/storage.ts:191-202`; sogar als Testfall `app/src/main/petrolChats/storage.test.ts:134-142`). Ein zweiter Save mit **demselben Chat und nun gültigen Bildbytes** kehrt wegen `written` oder nach Neustart wegen gleicher JSON-Datei vor der Medienschleife zurück (`app/src/main/petrolChats/storage.ts:180-188`); das Bild bleibt dauerhaft fehlend. Ist eine Mediendatei vorhanden, aber beschädigt oder mit falschem Schlüssel verschlüsselt, wird sie bei geändertem Chat ebenfalls wegen bloßem `exists(target)` nie repariert (`app/src/main/petrolChats/storage.ts:194-200,300-306`). `readMedia` fasst auch einen Entschlüsselungsfehler als „fehlend“ auf (`app/src/main/petrolChats/storage.ts:300-306`); nach `restoreMessage` steht die ID in `imagesMissing`, und `cleanup` hält nur Dateien für `images` fest (`app/src/shared/petrolChatStored.ts:330-344`; `app/src/main/petrolChats/storage.ts:264-270`). Ein nur vorübergehender Medienfehler kann so beim nächsten Speichern/Aufräumen zur endgültigen Löschung des Chiffrats werden.
Vorschlag: Vor „unverändert“ referenzierte Medien mitprüfen; fehlende Medien aus gelieferten Bytes nachschreiben, beschädigte nicht still ersetzen, sondern einen expliziten Reparatur-/Fehlerzustand führen. Temporären Entschlüsselungsfehler von dauerhaft fehlender Datei unterscheiden.

### F72 — „Alle löschen“ ist nicht gegen gleichzeitiges Speichern serialisiert
Schwere: hoch
ADR-Stelle: app/src/main/petrolChats/storage.ts:217
Status: [OFFEN]
`save` und `delete` benutzen nur eine Kette je Gesprächsordner (`app/src/main/petrolChats/storage.ts:128-135,172-175,208-214`). `deleteAll` liest einmal die vorhandenen IDs, wartet nur deren `delete` ab und entfernt danach den gesamten Vault-Ordner (`app/src/main/petrolChats/storage.ts:217-223`). Ein Save für eine neue ID, der nach dem `readdirSafe` beginnt, steht in keiner dieser Ketten und kann vor dem abschließenden `fs.rm(vdir)` erfolgreich antworten, obwohl sein Gespräch unmittelbar danach verschwindet. Auch ein später Save für eine bereits gelöschte ID kann zwischen deren `delete` und dem Root-`rm` laufen. Der Test führt Save und „alle löschen“ nur nacheinander aus (`app/src/main/petrolChats/storage.test.ts:209-214`).
Vorschlag: Eine Vault-weite Sperre/Generation für `deleteAll` und alle Saves einführen; beim Löschen neue Saves blockieren oder danach ausdrücklich als neues Gespräch behandeln. Gleichzeitige Saves für alte und neue IDs testen.

### F73 — `path.resolve` bindet einen Vault-Alias nicht an denselben Ablageordner
Schwere: mittel
ADR-Stelle: docs/codex-collab/chat-verlauf-notizen-bilder.md:1473
Status: [OFFEN]
Rev. 9 nennt einen „kanonischen genehmigten Vault“, konkret aber `assertApprovedVault` plus `path.resolve` (`docs/codex-collab/chat-verlauf-notizen-bilder.md:1473-1478`). Der Main nimmt sowohl den aufgelösten als auch den per `realpath` ermittelten Vault-Root in seine Genehmigungsliste auf (`app/src/main/index.ts:1258-1266,1281-1285`). `vaultKey` hasht den übergebenen String ohne Kanonisierung (`app/src/main/petrolChats/storage.ts:71-73,109-115`). Derselbe physische Vault über einen Symlink-Pfad und seinen realen Pfad erhält deshalb zwei Gesprächslisten; ein Gespräch kann beim Wechsel zwischen diesen genehmigten Aliasen scheinbar verschwinden, obwohl der Vault nicht verschoben wurde. Der Storage-Test prüft nur zwei tatsächlich unterschiedliche Pfadstrings (`app/src/main/petrolChats/storage.test.ts:152-156`).
Vorschlag: Beim Anlegen/Öffnen `realpath` des genehmigten Vault-Roots als stabile Gesprächsbindung verwenden und genau diesen Pfad an die Ablage geben; Symlink-Alias gegen Realpfad testen.

### F74 — Medien werden weder an Bildgrenzen noch an gespeicherte Maße gebunden
Schwere: mittel
ADR-Stelle: app/src/main/petrolChats/storage.ts:310
Status: [OFFEN]
Der gespeicherte Bildvertrag erlaubt ein beliebiges nichtnegatives `byteLength` und Maße bis 1600, aber prüft keine Beziehung zur Mediendatei (`app/src/shared/petrolChatStored.ts:228-230`). `isCleanJpeg` prüft nur, dass die Base64-Daten als JPEG-Kopf erkannt werden und kein Metadatenblock gemeldet wird; Dateigröße, tatsächliche Breite/Höhe und `byteLength` werden nicht gegen den Verweis geprüft (`app/src/main/petrolChats/storage.ts:310-315`). `save` akzeptiert die Bytes aus `images[imageId]` unabhängig von diesen Metadaten, `load` gibt sie ebenso zurück (`app/src/main/petrolChats/storage.ts:194-202,153-163`). Dadurch kann ein anderes gültiges JPEG unter derselben ID angezeigt und bei Folgefragen ans Modell geschickt werden; auch sehr große Strings gehen in `safeStorage.encryptString` (`app/src/main/petrolChats/electronCrypto.ts:24-25`). Der Test verwendet nur passende synthetische Bilddaten (`app/src/main/petrolChats/storage.test.ts:55-57,82-93`).
Vorschlag: Vor Speichern und nach Entschlüsseln tatsächliche Größe und Maße mit `StoredChatImage` vergleichen und die 3-MB-Grenze aus `shared/chatImages.ts` erzwingen; vertauschte und übergroße Medien testen.

### F75 — Die Liste entschlüsselt jedes gesamte Gespräch synchron im Main
Schwere: mittel
ADR-Stelle: app/src/main/petrolChats/storage.ts:138
Status: [OFFEN]
`list` ruft für jede ID seriell `readChat` auf (`app/src/main/petrolChats/storage.ts:138-150`), das jeweils die ganze verschlüsselte Datei liest, mit `safeStorage.decryptString` entschlüsselt und alle Nachrichten prüft (`app/src/main/petrolChats/storage.ts:278-297`; `app/src/main/petrolChats/electronCrypto.ts:24-25`). Der Vertrag begrenzt nur die Zahl der Nachrichten, nicht `content`, Quellentitel/URLs oder sonstige Strings (`app/src/shared/petrolChatStored.ts:101-114,239-273`). Mit vielen oder großen Gesprächen blockiert die synchrone Entschlüsselung den Main-Prozess beim Öffnen der Liste; bei fehlendem Schlüssel wird die Datei sogar vollständig gelesen, bevor `unavailableReason` geprüft wird (`app/src/main/petrolChats/storage.ts:283-291`). Die Tests messen nur zwei kleine Gespräche (`app/src/main/petrolChats/storage.test.ts:200-207`).
Vorschlag: Gesamtgröße von Chat und Medien begrenzen; Liste mit begrenzter Parallelität oder einem separat verschlüsselten Kopf/Index laden und den Schlüsselstatus vor dem Datei-Read prüfen. Kosten mit vielen großen Gesprächen messen.

### F76 — Rename allein sichert den neuen Gesprächsstand nicht gegen Stromausfall
Schwere: mittel
ADR-Stelle: app/src/main/petrolChats/storage.ts:340
Status: [OFFEN]
`writeAtomic` schreibt eine Temp-Datei und benennt sie um, ruft aber weder `fsync` für die Datei noch für das Verzeichnis auf (`app/src/main/petrolChats/storage.ts:340-349`). Damit ist der Wechsel für laufende Leser atomar sichtbar, aber nach einem OS-Absturz oder Stromausfall nicht dauerhaft zugesichert; bei einem neuen Gespräch können insbesondere bereits geschriebene Medien und `chat.json.enc` unterschiedlich wiederkehren (`app/src/main/petrolChats/storage.ts:191-203`). Der vorhandene Test prüft nur, dass nach einem regulär abgeschlossenen Save keine Temp-Datei übrig ist (`app/src/main/petrolChats/storage.test.ts:108-115`).
Vorschlag: Temp-Dateien vor Rename synchronisieren und die betroffenen Verzeichnisse nach Rename synchronisieren; beim Laden fehlende referenzierte Medien als Crash-Fall behandeln.

### F77 — Bild-Retry benutzt dieselbe ID und macht das Gespräch unspeicherbar
Schwere: hoch
ADR-Stelle: app/src/shared/petrolChatStored.ts:301
Status: [OFFEN]
Die Oberfläche nimmt bei „Erneut senden“ einer fehlgeschlagenen Bildfrage die vorhandenen `retryOf.images` unverändert (`app/src/renderer/components/Agent/PetrolChat.tsx:375-404,717-720`). Der Store hängt diese Bilder mit ihren bisherigen IDs an eine **neue** Nutzerfrage im selben Gespräch (`app/src/renderer/stores/petrolChatStore.ts:280-286`); die alte Frage bleibt sichtbar. Der neue gesprächsweite Check zählt beide Vorkommen als Kollision und `buildStoredChat` wirft (`app/src/shared/petrolChatStored.ts:301-310,420-436`). So kann ein regulärer Retry nach einem Modellfehler die spätere Speicherung des ganzen Gesprächs verhindern. Der Duplikattest verwendet nur zwei künstlich gleich benannte Bilder, nicht den realen Retry-Pfad (`app/src/shared/petrolChatStored.test.ts:307-316`).
Vorschlag: Beim Retry eine neue Bild-ID für die neue Nachricht vergeben und die Bytes unter ihr ablegen, oder eine bewusst geteilte, unveränderliche Medienreferenz als eigene Vertragsform einführen; Retry nach Fehler und Stopp mit anschließendem Speichern testen.

### Runde 9

### F78 — Verspätetes Öffnen bindet einen verlassenen Tab wieder an den alten Vault
Schwere: hoch
ADR-Stelle: app/src/renderer/stores/petrolChatStore.ts:287
Status: [OFFEN]
`send` wartet beim ersten Senden auf `petrolConvOpen`, während `conv` im Store noch `null` ist (`app/src/renderer/stores/petrolChatStore.ts:287-297`). Ein Vault-Wechsel in diesem Fenster wird von `vaultChanged` wegen `!sc.conv` ignoriert (`app/src/renderer/stores/petrolChatStore.ts:439-443`; Aufruf bei Pfadwechsel in `app/src/renderer/components/Agent/PetrolChat.tsx:122-124`). Auch `clear` oder `dispose` annullieren das wartende Öffnen nicht (`app/src/renderer/stores/petrolChatStore.ts:420-436`). Nach dessen Auflösung setzt `send` die alte Vault-Bindung wieder ein und schickt die Frage an diesen Vault (`app/src/renderer/stores/petrolChatStore.ts:304-305,343-355`); nach `dispose` erzeugt `patch` den entfernten Bereich erneut (`app/src/renderer/stores/petrolChatStore.ts:192-194`). Der Vault-Test öffnet erst vollständig und wechselt dann (`app/src/renderer/stores/petrolChatStore.test.ts:96-105`).
Vorschlag: Öffnen an eine Generation des Tabs und den aktuellen Vault koppeln; bei Wechsel, `clear` und `dispose` ein spätes Ergebnis verwerfen und die eben erzeugte Gesprächs-ID im Main schließen. Den verzögerten `open`-Fall testen.

### F79 — Alte Stopp-Antwort kann eine spätere Frage aus der Anzeige entfernen
Schwere: hoch
ADR-Stelle: app/src/renderer/stores/petrolChatStore.ts:414
Status: [OFFEN]
`stop` setzt `activeScope` sofort auf `null` und beginnt erst dann den asynchronen `petrolConvStop`-Aufruf (`app/src/renderer/stores/petrolChatStore.ts:401-416`). Damit darf `send` schon eine neue Frage im selben Gespräch beginnen (`app/src/renderer/stores/petrolChatStore.ts:276-278,323-340`). Ist diese schnelle zweite Antwort fertig, bevor die alte Stopp-Antwort eintrifft, erfüllt letztere wieder `activeScope !== id` und dieselbe `conv.id` und ersetzt **alle** Nachrichten durch ihren älteren Stand (`app/src/renderer/stores/petrolChatStore.ts:414-416`). Im Main wird der Nachrichtenwert der Stopp-Rückgabe vor dem wartenden Speichern gebildet (`app/src/main/petrolChats/conversation.ts:389-412`); die zweite Frage kann währenddessen anlaufen, weil `conv.turn` schon `null` ist (`app/src/main/petrolChats/conversation.ts:394-396,229-232`). Der Store-Test prüft nur Stopp ohne anschließende Frage (`app/src/renderer/stores/petrolChatStore.test.ts:116-131`).
Vorschlag: Stopp-Ergebnisse nur für die zugehörige Wechselgeneration übernehmen oder den nächsten Send bis zum Stopp-Abschluss sperren; verzögerten Stopp mit schneller Folgefrage testen.

### F80 — Der Renderer bestimmt weiterhin eine gespeicherte Modell-Herkunftsangabe
Schwere: mittel
ADR-Stelle: app/src/shared/petrolChat.ts:87
Status: [OFFEN]
Der neue IPC-Vertrag enthält `runLabel` aus dem Renderer (`app/src/shared/petrolChat.ts:74-88`; Erzeugung in `app/src/renderer/components/Agent/PetrolChat.tsx:397-408`). `parseSendRequest` kopiert es ungeprüft hinsichtlich des tatsächlichen Modellwegs (`app/src/main/petrolChats/conversation.ts:515-528`). Für Chatantworten übernimmt der Main dieses Label als `model` (`app/src/main/petrolChats/conversation.ts:370-380`), und die Projektion speichert es sogar im Gesprächskopf (`app/src/shared/petrolChatStored.ts:437-450`). Ein Renderer kann damit beispielsweise eine Cloud-Antwort als lokales Modell ausgeben; die Zusage, dass die Herkunft aus dem Main stammt, gilt für dieses sichtbare und persistente Feld nicht.
Vorschlag: Anzeigename und Weg nach der tatsächlichen Route im Main bilden bzw. vom Handler zurückgeben; `runLabel` nicht als autoritative Herkunft übernehmen.

### F81 — Direkter Web-IPC bleibt ein Weg zu renderergewählten eingefrorenen Quellen
Schwere: mittel
ADR-Stelle: app/src/main/index.ts:7370
Status: [OFFEN]
`petrol-chat-web` bleibt über die Preload-API erreichbar (`app/src/main/preload.ts:392-396`). Der direkte Handler entfernt zwar `history` und `webTopics`, lässt aber `scopeId` und `snapshotId` aus `params` stehen (`app/src/main/index.ts:7370-7374`). `runPetrolWeb` löst eine so bezeichnete eingefrorene Quelle anhand des vom Renderer angegebenen Bereichs und der Kennung auf (`app/src/main/index.ts:6954-6958,7041-7049`). Damit kann derselbe Absender den Gesprächs-IPC und dessen Main-geführte Bindung umgehen und einen bekannten Snapshot eines anderen Gesprächs als Grundlage wählen; der reguläre Weg setzt `scopeId` dagegen aus `conv.id` (`app/src/main/petrolChats/conversation.ts:284-300`).
Vorschlag: Den direkten Messweg für Snapshot-Nachfragen sperren oder Bereich und Snapshot an ein offenes Gespräch des Absenders binden; eine direkte Anfrage mit fremder Gesprächs-ID und bekannter Snapshot-ID testen.

### F82 — Anfragekennungen kollidieren fensterübergreifend
Schwere: mittel
ADR-Stelle: app/src/main/index.ts:7404
Status: [OFFEN]
`petrolConvEvents` ist global allein nach `requestId` indiziert; eine gleichzeitig laufende Kennung eines anderen Fensters wird bei `petrol-conv-send` abgewiesen (`app/src/main/index.ts:7403-7404,7489-7503`). Der Renderer erzeugt die Kennung aus Millisekunde und einem nur im jeweiligen Renderer-Modul geführten Zähler (`app/src/renderer/stores/petrolChatStore.ts:166-171,308`). Zwei Fenster, die ihre erste Frage in derselben Millisekunde senden, können deshalb kollidieren. Die Abbruchverwaltung benutzt bereits den Absender **plus** Kennung (`app/src/main/index.ts:6428-6434`), die neue Ereigniszuordnung jedoch nicht.
Vorschlag: Auch den Event-Schlüssel aus `sender.id` und `requestId` bilden; parallele Fenster mit gleicher Kennung testen.

### F83 — Speicherfehler wird im Anzeige-Spiegel als eingeschaltete Speicherung geführt
Schwere: hoch
ADR-Stelle: app/src/renderer/stores/petrolChatStore.ts:380
Status: [OFFEN]
Der Main meldet einen fehlgeschlagenen Save ausdrücklich als `storage: 'failed'` und lässt das Gespräch im Speicher weiterlaufen (`app/src/main/petrolChats/conversation.ts:481-499`; Test `app/src/main/petrolChats/conversation.test.ts:267-278`). Bei einer regulären Antwort ersetzt der Store `'failed'` durch den bisherigen Modus, typischerweise `'on'` (`app/src/renderer/stores/petrolChatStore.ts:375-380`); beim Stopp übernimmt er `res.storage` überhaupt nicht (`app/src/renderer/stores/petrolChatStore.ts:414-417`). Der Scope-Typ kann `'failed'` zudem gar nicht halten (`app/src/renderer/stores/petrolChatStore.ts:85-89`; `app/src/shared/petrolChat.ts:91-97`). So kann Schritt 4 aus dem Renderer-Zustand keine wahrheitsgemäße „nicht gespeichert“-Anzeige bauen; beim Schließen geht das nur im Speicher gehaltene Gespräch verloren (`app/src/renderer/stores/petrolChatStore.ts:173-179,420-435`).
Vorschlag: Speicherfehler als eigenen sichtbaren Zustand im Scope führen, auch nach Stopp und Wiederholungsversuch; Fehlerantwort und Tab-Schließen im Store-Test prüfen.

### F84 — Aufräumen gilt schon vor Erfolg als erledigt und parallele Öffnungen warten nicht
Schwere: mittel
ADR-Stelle: app/src/main/index.ts:7462
Status: [OFFEN]
`cleanupPetrolChatsOnce` setzt den Vault in `petrolChatsCleaned`, **bevor** die Schlüsselverfügbarkeit geprüft und das Aufräumen ausgeführt ist (`app/src/main/index.ts:7460-7472`). Bei vorübergehend fehlendem Schlüssel oder einer Exception gibt es während dieses Programmlaufs keinen weiteren Versuch. Zudem kehrt ein zweiter gleichzeitiger `petrol-conv-open` wegen des bereits gesetzten Merkers sofort zurück, während der erste noch auf `loadUISettings` bzw. `storage.cleanup` wartet (`app/src/main/index.ts:7461-7468,7478-7486`). `openIds` wird nur beim tatsächlichen Aufruf von `cleanup` abgenommen (`app/src/main/index.ts:7468`), während `storage.load` parallel zur Aufräum-Schreibkette läuft (`app/src/main/petrolChats/storage.ts:146-154,171-181,268-283`); eine Öffnung und das Löschen eines abgelaufenen Gesprächs können so gegeneinander laufen.
Vorschlag: Das laufende Cleanup-Promise je Vault teilen und erst nach erfolgreichem Abschluss als erledigt markieren; temporären Schlüsselausfall und zwei gleichzeitige Öffnungen testen.

### F85 — Ein Öffnen lädt und überträgt sämtliche Bildbytes des Gesprächs auf einmal
Schwere: mittel
ADR-Stelle: app/src/main/index.ts:7478
Status: [OFFEN]
Die Ablage liest beim Öffnen jede referenzierte Mediendatei in `images` (`app/src/main/petrolChats/storage.ts:171-181`); `PetrolConversations.open` setzt sämtliche Bytes in die Laufzeitnachrichten und gibt den kompletten Verlauf zurück (`app/src/main/petrolChats/conversation.ts:203-212`). `petrol-conv-open` reicht diese Antwort unverkleinert per IPC weiter (`app/src/main/index.ts:7478-7486`). Das Schema erlaubt 2000 Nachrichten und bis zu vier Bilder je Nutzerfrage, jedes bis 3 MB (`app/src/shared/petrolChatStored.ts:30-32,256-271`; `app/src/shared/chatImages.ts:16-20`); die 16-MB-Grenze schützt nur die verschlüsselte Gesprächsdatei, nicht die Summe der Medien (`app/src/main/petrolChats/storage.ts:191-199`). Schon deutlich darunter kann ein einziges Öffnen den Main, IPC und Renderer mit sehr vielen Base64-Strings belasten.
Vorschlag: Gesamtbudget für Medien je Gespräch und einen gestuften Bildabruf oder Lazy Loading für die Anzeige vorsehen; Öffnen mit vielen Bildern als Lastfall messen.

### Runde 10

### F86 — Fehlgeschlagenes Öffnen verwirft das bisherige, womöglich ungespeicherte Gespräch
Schwere: hoch
ADR-Stelle: app/src/renderer/stores/petrolChatStore.ts:505
Status: [OFFEN]
`openConversation` schließt das bisherige Gespräch im Main und leert den Renderer-Bereich **vor** `petrolConvOpen` (`app/src/renderer/stores/petrolChatStore.ts:503-510`). Meldet das Öffnen danach „nicht lesbar“ oder wirft es, gibt die Funktion nur den Fehler zurück und stellt weder Nachrichten noch Gesprächs-ID wieder her (`app/src/renderer/stores/petrolChatStore.ts:510-520`). `close` entfernt das alte Gespräch nach dem Save-Versuch aus dem Main-Speicher (`app/src/main/petrolChats/conversation.ts:448-455`); bei `storage: 'failed'`, `memory` oder fehlendem Schlüssel ist dessen bisheriger Inhalt damit verloren (`app/src/main/petrolChats/conversation.ts:192-195,525-537`). Die Liste zeigt den Öffnungsfehler, aber keine Warnung vor dem Wechsel (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:53-57,124-128`); der Store-Test prüft beim Fehler nur den Rückgabestring (`app/src/renderer/stores/petrolChatStore.test.ts:334-338`).
Vorschlag: Erst das Ziel laden, dann das alte Gespräch schließen und den Bereich tauschen; einen fehlgeschlagenen Öffnungsversuch aus einem nur im Speicher vorhandenen Gespräch testen.

### F87 — Geladenes Gespräch und neues Senden können denselben Tab gleichzeitig übernehmen
Schwere: hoch
ADR-Stelle: app/src/renderer/stores/petrolChatStore.ts:497
Status: [OFFEN]
`openConversation` markiert seinen ausstehenden `petrolConvOpen` nicht in `opening` und setzt auch keinen eigenen Ladezustand (`app/src/renderer/stores/petrolChatStore.ts:497-520`). Während es nach dem Leeren des Bereichs auf den Main wartet, sieht `send` weder `activeScope` noch `opening.has(id)`, legt ein **anderes** neues Gespräch an und kann die Frage bereits senden (`app/src/renderer/stores/petrolChatStore.ts:307-332,349-390`). Beide Wege teilen dann dieselbe Generation: die spätere Ladeantwort kann `conv` und Nachrichten über die laufende Antwort setzen, deren Send-Ergebnis anschließend Nachrichten des ersten Gesprächs unter der ID des geladenen zeigt (`app/src/renderer/stores/petrolChatStore.ts:317,405-428,501-520`). Auch ein während `await stopping.get(id)` geschlossener Tab wird danach wieder geöffnet, weil `openConversation` die Generation erst **nach** diesem Await erhöht (`app/src/renderer/stores/petrolChatStore.ts:497-502`; `dispose` erhöht sie in `app/src/renderer/stores/petrolChatStore.ts:485-494`). Die Liste liegt als normale Fläche über dem weiterhin bedienbaren Chat (`app/src/renderer/components/Agent/PetrolChat.tsx:672-683`; `app/src/renderer/styles/index.css:23221-23227`).
Vorschlag: Zielöffnung ab Beginn als tabgebundenen, abbrechbaren Vorgang markieren; Senden bis zum Abschluss sperren und Generation/Vault sowohl vor als auch nach jedem Await prüfen. Verzögertes Laden mit Send, `clear`, `dispose` und Vault-Wechsel testen.

### F88 — Löschen und Alle löschen haben keine Main-seitige Sperre gegen Wiederöffnen und spätes Speichern
Schwere: hoch
ADR-Stelle: app/src/main/index.ts:7550
Status: [OFFEN]
`petrol-conv-delete` schließt erst die gerade erfassten Instanzen und ruft **danach** `storage.delete` auf; `delete-all` macht dasselbe mit `closeVault` und `storage.deleteAll` (`app/src/main/index.ts:7549-7573`; `app/src/main/petrolChats/conversation.ts:463-465,479-482`). Dazwischen und während des Löschens können andere IPC-Aufrufe dieselbe ID wieder öffnen oder ein neues Gespräch des Vaults anlegen (`app/src/main/index.ts:7492-7499`; `app/src/main/petrolChats/conversation.ts:197-226`). `storage.load` läuft außerhalb der Vault-Schreibkette, und spätere Saves werden **nach** `delete`/`deleteAll` in diese Kette gestellt und können die Dateien erneut anlegen (`app/src/main/petrolChats/storage.ts:146-154,171-181,191-193,245-259`). Weder die Main-Handler noch `PetrolConversations` führen während des Löschens eine Sperre oder Generation. Die neuen Tests schließen nur nacheinander zwei Fenster und prüfen kein Löschen mit gleichzeitigem Öffnen/Senden (`app/src/main/petrolChats/conversation.test.ts:320-327`).
Vorschlag: Löschen pro Vault/ID mit Öffnen und Speichern in einer gemeinsamen Main-seitigen Transaktion oder Generation serialisieren; ein paralleles `open` und ein spätes Send-Ergebnis nach `delete`/`delete-all` testen.

### F89 — Umbenennen aus einem zweiten Fenster kann neuere Nachrichten überschreiben
Schwere: hoch
ADR-Stelle: app/src/main/index.ts:7539
Status: [OFFEN]
`isOpen` prüft nur den aufrufenden Absender. Ist dasselbe Gespräch in einem anderen Fenster offen, lädt `petrol-conv-rename` eine **zweite** `Conversation`-Instanz aus der Platte, ändert dort den Titel und speichert deren gesamten Nachrichtenstand (`app/src/main/index.ts:7538-7546`; `app/src/main/petrolChats/conversation.ts:209-226,435-440,525-534`). Eine währenddessen im anderen Fenster abgeschlossene Frage kann dadurch aus der gespeicherten Datei verschwinden, wenn der Titel-Save nach deren Save kommt. Kommt dessen Save später, enthält seine Instanz noch den alten Titel und nimmt die Umbenennung zurück. Die Vault-Kette ordnet nur die vollständigen Writes, sie führt die beiden In-Memory-Stände nicht zusammen (`app/src/main/petrolChats/storage.ts:146-154,191-240`). Der Rename-Test verwendet nur einen Absender (`app/src/main/petrolChats/conversation.test.ts:329-337`).
Vorschlag: Titeländerungen über einen gemeinsamen Gesprächsstand oder eine gezielte, versionierte Mutation der zuletzt gespeicherten Datei ausführen; zwei Fenster mit parallelem Send und Rename testen.

### F90 — Löschen in einem Fenster lässt den Verlauf in anderen Fenstern als offen stehen
Schwere: mittel
ADR-Stelle: app/src/main/index.ts:7556
Status: [OFFEN]
`closeEverywhere` und `closeVault` entfernen die Main-Instanzen aller Fenster, aber die Lösch-Handler senden diesen Fenstern kein Ereignis zur Anzeige-Aktualisierung (`app/src/main/index.ts:7549-7573`; `app/src/main/petrolChats/conversation.ts:448-465,479-482`). Nur die Liste des **aufrufenden** Fensters ruft bei dessen aktueller ID `onCurrentDeleted` auf (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:58-70`; Verdrahtung in `app/src/renderer/components/Agent/PetrolChat.tsx:672-681`). Ein anderes Fenster behält `scope.conv` und die Nachrichten, bis ein weiteres Senden an `PetrolConversations.get` mit „Gespräch nicht offen“ scheitert (`app/src/renderer/stores/petrolChatStore.ts:390-420`; `app/src/main/petrolChats/conversation.ts:234-239`).
Vorschlag: Löschung an alle betroffenen Fenster melden und deren Scope gezielt leeren; Zweifenster-Test einschließlich Renderer-Zustand ergänzen.

### F91 — Bildladen nach Punkt 29 ist weder im Main noch im Renderer bedarfsweise
Schwere: mittel
ADR-Stelle: app/src/main/petrolChats/storage.ts:176
Status: [OFFEN]
`petrol-conv-open` entfernt Bildbytes erst aus der **IPC-Antwort** (`app/src/main/index.ts:7491-7501`). Zuvor liest `storage.load` weiterhin **jede** Mediendatei und `PetrolConversations.open` hält alle Base64-Strings im Main-Speicher (`app/src/main/petrolChats/storage.ts:171-181`; `app/src/main/petrolChats/conversation.ts:217-226`). Danach fordert der Renderer per Effekt sofort sämtliche Bilder ohne Bytes an, unabhängig davon, welche Marke sichtbar ist (`app/src/renderer/components/Agent/PetrolChat.tsx:126-128`; `app/src/renderer/stores/petrolChatStore.ts:524-535`). Ein Gespräch mit 40 Bildern verursacht also beim Öffnen weiterhin 40 Medienreads und anschließend bis zu 40 parallele Bild-IPCs; das in Rev. 9 Punkt 29 versprochene Laden „erst bei Bedarf“ und die dafür genannte Lastmessung sind so nicht eingelöst.
Vorschlag: Medien erst auf Anforderung der sichtbaren Marke aus der Ablage lesen und gleichzeitige Abrufe begrenzen; den 40-Bilder-Fall für Main-Speicher, Öffnungszeit und IPC-Zahl messen.

### F92 — „Erneut senden“ einer geladenen Frage lässt fehlende Bilder still weg
Schwere: hoch
ADR-Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:398
Status: [OFFEN]
Ein beim Laden nicht lesbares Bild liegt in `imagesMissing`, während `images` nur vorhandene Bilder enthält (`app/src/shared/petrolChatStored.ts:347-360`). Die Anzeige benennt das fehlende Bild (`app/src/renderer/components/Agent/PetrolChat.tsx:728-736`), bietet bei einer fehlgeschlagenen Antwort aber weiterhin „Erneut senden“ an (`app/src/renderer/components/Agent/PetrolChat.tsx:747-755`). Der Retry nimmt ausschließlich `retryOf.images`; bei einem einzigen fehlenden Bild ist das eine leere Liste, bei mehreren eine unvollständige (`app/src/renderer/components/Agent/PetrolChat.tsx:387-401`). Der Main bekommt dann eine Textfrage ohne die ursprünglichen Bildreferenzen (`app/src/renderer/stores/petrolChatStore.ts:390-400`; `app/src/main/petrolChats/conversation.ts:249-255,278-284`). Bei einer Frage nach dem Bild kann das Modell so antworten, ohne dass der Retry auf den Verlust hinweist.
Vorschlag: Retry sperren oder die fehlenden Bilder ausdrücklich anzeigen und eine bewusste Textfrage verlangen; geladenen Fehlerwechsel mit `imagesMissing` testen.

### F93 — Ohne verfügbaren Schlüssel verschwinden gespeicherte Dateien sogar aus der Löschliste
Schwere: mittel
ADR-Stelle: app/src/main/index.ts:7511
Status: [OFFEN]
`petrol-conv-list` gibt bei `unavailableReason()` sofort `items: []` zurück (`app/src/main/index.ts:7505-7513`). Die Ablage könnte vorhandene Dateien in diesem Zustand als `unreadable` mit ID und Dateizeit listen, ohne sie zu entschlüsseln (`app/src/main/petrolChats/storage.ts:157-168,315-328`). Die Oberfläche bietet „Alle löschen“ aber nur bei einer nichtleeren Liste an und zeigt somit bei temporär gesperrtem Schlüsselbund weder die vorhandenen Gespräche noch einen Löschweg (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:96-100,148-158`). Das widerspricht dem dortigen Hinweis, nicht lesbare Gespräche könnten gelöscht werden (`app/src/renderer/utils/i18n/petrolChat.ts:72-78`).
Vorschlag: IDs auch ohne Schlüssel als nicht lesbar auflisten oder mindestens „Alle löschen“ unabhängig vom Entschlüsselungsstatus anbieten; Schlüsselverlust mit vorhandenen Chiffraten testen.

### F94 — Gleiche Bild-ID mit gleichen Maßen darf andere Bildbytes bezeichnen
Schwere: hoch
ADR-Stelle: app/src/main/petrolChats/conversation.ts:514
Status: [OFFEN]
`checkNewImages` vergleicht eine wiederverwendete ID nur anhand von Name, Breite, Höhe und `byteLength`, nicht anhand der Bytes (`app/src/main/petrolChats/conversation.ts:500-520`). Bei nichtleeren neuen Bytes ersetzt der Main sie gerade **nicht** durch sein eigenes Bild (`app/src/main/petrolChats/conversation.ts:251-255`). Ein anderes gültiges JPEG mit derselben Länge und denselben Maßen kann deshalb unter der alten ID in `known` das historische Bild überschreiben und als Verlaufsbild ans Modell gehen (`app/src/main/petrolChats/conversation.ts:350-367`). Beim Speichern gilt die vorhandene Mediendatei dagegen schon als passend, sobald ihre Metadaten stimmen; sie wird nicht durch die neuen Bytes ersetzt (`app/src/main/petrolChats/storage.ts:219-234,346-355`). Laufzeit, Modellaufruf und wieder geladenes Gespräch können somit für **dieselbe ID verschiedene Pixel** meinen.
Vorschlag: Bei wiederverwendeter ID nur leere Bytes als Verweis akzeptieren oder neue Bytes mit dem Main-eigenen Bildinhalt vergleichen; zwei gleich große JPEGs mit gleichen Maßen und verschiedenen Pixeln testen.

### F95 — Die Gesprächsliste setzt und restauriert den Tastaturfokus nicht
Schwere: mittel
ADR-Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:1150
Status: [OFFEN]
Der Schalter für die Liste steht am Ende des Chats; die geöffnete Liste wird **vor** Verlauf und Eingabe in die DOM-Reihenfolge eingefügt (`app/src/renderer/components/Agent/PetrolChat.tsx:672-683,1141-1153`). Beim Öffnen gibt es keinen Fokuswechsel in die Region (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:29-50,88-104`): Wer den Schalter mit Tab/Enter bedient, bleibt unten; der nächste Tab-Schritt führt an der neu eingefügten Liste vorbei. Beim Öffnen eines Gesprächs oder Löschen einer Zeile verschwindet außerdem der betätigte Button ohne Fokus-Rückgabe (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:53-79,125-140`). Nur das Rename-Eingabefeld hat `autoFocus` (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:104-114`).
Vorschlag: Beim Öffnen den Listen-Kopf oder ersten Eintrag fokussieren, beim Schließen den Schalter; nach Löschen/Umbenennen Fokus auf einen verbleibenden Eintrag setzen und die Bestätigung per Tastatur erreichbar halten.

### F96 — Eine verspätete Listenantwort kann Ergebnisse des vorigen Vaults anzeigen
Schwere: mittel
ADR-Stelle: app/src/renderer/components/Agent/PetrolChatHistory.tsx:37
Status: [OFFEN]
`load` bindet zwar den jeweiligen `vaultPath`, hat aber weder Abbruch noch eine Sequenzprüfung vor `setItems`/`setMode` (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:37-49`). Bleibt die Liste bei einem Vault-Wechsel geöffnet, können die Requests für A und B parallel laufen; eine verspätete Antwort von A überschreibt dann die bereits angezeigten B-Einträge. `open`, `remove`, `removeAll` und `rename` benutzen anschließend den **aktuellen** `vaultPath` B mit den sichtbaren IDs bzw. der Anzahl aus A (`app/src/renderer/components/Agent/PetrolChatHistory.tsx:53-78,101-158`); `PetrolChat` hält `historyOpen` beim Vault-Wechsel unverändert (`app/src/renderer/components/Agent/PetrolChat.tsx:123-129,672-681`).
Vorschlag: Antworten nur für den aktuellen Vault und den neuesten Ladeaufruf übernehmen; Vault-Wechsel mit verzögerten Listenantworten testen.

### F97 — Geladene Webantwort verweist in der festen App-Antwort auf einen gesperrten Knopf
Schwere: niedrig
ADR-Stelle: app/src/renderer/utils/i18n/petrolChat.ts:142
Status: [OFFEN]
Die feste Antwort auf Fragen nach alten Webquellen fordert zum Klick auf „Hiermit weiterfragen“ an der Antwort oben auf (`app/src/renderer/utils/i18n/petrolChat.ts:142`; Darstellung in `app/src/renderer/components/Agent/PetrolChat.tsx:745-746`). Nach dem Laden trägt die frühere Antwort nur `hadSnapshot`, keine `snapshotId` mehr (`app/src/shared/petrolChatStored.ts:281-284,347-351`), und genau dieser Knopf ist deaktiviert (`app/src/renderer/components/Agent/PetrolChat.tsx:605-607`). Der Main kann die feste Antwort auch bei geladenen Webwechseln aus deren Themenfragen erzeugen (`app/src/main/petrolChats/conversation.ts:263-275`). Der sichtbare Handlungsrat ist in diesem Zustand nicht ausführbar.
Vorschlag: Die feste Antwort bei geladenen Quellen auf „Globus einschalten und neu suchen“ umstellen; einen geladenen Webwechsel mit anschließender Frage nach einer alten Quelle testen.

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

### Rev. 6 — Bilder zuerst, für Release 1.2 (Nutzerentscheidung 02.11.2026)

**Entscheidung.** Die Bilderunterstützung kommt VOR Teil 1 und geht zusammen in Release 1.2.
Umfang „lokal + Cloud“:
- **3a** Bilder im Petrol-Chat über lokale Vision-Modelle (Ollama).
- **3b + Punkt 19** Bilder über OpenRouter und LLMBase, für Chat und Agent, mit eigener
  Bild-Zustimmung.
- **4a + 4b** Der Agent liest gescannte PDF-Seiten (inkl. Stufe 2 von 13a) und Bilder per lokaler
  Texterkennung (Punkt 13–17).
- **Nicht in 1.2:** 4c (Weg B, Seitenbild an das Agent-Modell, Punkt 18), Teil 1 und 2.

**Was das für F15 heißt.** F15 verlangte den Datenvertrag (Teil 1) vor der Bild-UX, damit das
Speicherformat Bilder von Anfang an kennt. Heute speichert der Petrol-Chat gar nichts
(`renderer/stores/petrolChatStore.ts:1-19`), Bilder leben also nur im Speicher des Tabs, wie
jeder andere Verlauf. Vorschlag: Die Bildnachricht bekommt schon jetzt die Form, die Rev. 2
Punkt 1 für `StoredChatMessage` vorsieht (`images: [{ id, mime, width, height, bytes }]`, nur
aufbereitete Bytes), damit Teil 1 sie später nur noch schreibt. Gespeichert wird in 1.2 nichts.

**Anker für die Prüfung (Cloud-Bildweg, neu).**
- Chat-Aufruf: `main/index.ts:6454` (`ollama-chat`, Parameter `messages` nur `{role, content: string}`),
  Petrol-Zweig `:6463`, LM Studio `:7668`.
- Cloud-Client: `main/llm/chatClient.ts:47` (`content: string`), Nachrichtenabbildung `:585`,
  `:641-648`, `:777-791`. Bilder kennt der Client nicht.
- OpenRouter-Katalog: `main/llm/cloudPricing.ts:43-51` liest nur `pricing` und `context_length`.
  Ein Feld für Eingabearten (in Punkt 19 als `architecture.input_modalities` angenommen) wird
  heute nicht gelesen; der Name ist **nicht** am echten Katalog geprüft.
- Agent-Lesen: `main/noteAgent/contextFiles.ts` (`EXT_TO_KIND`, `extractPdfText` mit
  `shared/pdfPageText.ts` seit Stufe 1 von 13a), Texterkennung `main/visionOcr.ts`
  (`extractOcrPage`), Aufruf heute nur aus `main/index.ts` (`vision-ocr-extract-page`).

### Runde 4 (02.11.2026)

Alle 14 Befunde gegen den Code geprüft. 13 tragen, F34 teilweise (OpenRouter in der offiziellen
Doku bestätigt, LLMBase-Doku antwortet mit 403, wird am echten Zugang geprüft). Nutzer hat
freigegeben: F30 sofort beheben, Empfehlungen zu F36/F37/F41 übernehmen, Rest als Rev. 7,
Bau in der Reihenfolge aus F39.

- **F28 [ADRESSIERT, Plan]** Rev. 7 Punkt 23: ein gemeinsamer OCR-Einstieg im Main, Prüfung vor
  jeder Seite mit frischen Metadaten. Viewer, Chat und Agent nutzen nur ihn.
- **F29 [ADRESSIERT, Plan]** Rev. 7 Punkt 25: Seitenliste statt fertigem String, „ohne Text“
  erst nach erfolgloser Erkennung.
- **F30 [ADRESSIERT, Code]** Der Vermerk wird jetzt vor dem Kürzen gelesen
  (`contextFiles.ts`, Ordner-Lesung) bzw. nach dem Kürzen wieder angehängt
  (`keepPdfNoTextNote` in `shared/pdfPageText.ts`, getestet), an allen fünf Lesestellen:
  Ordner-Lesung, direkter Anhang, `read_context_file`, `extractFileContentRaw`,
  `readContextBlock`. Gleiche Lücke bestand bei den Einzeldatei-Wegen (15 000 Zeichen). Der
  strukturierte Seitenstatus aus dem Vorschlag kommt mit Rev. 7 Punkt 25.
- **F31 [ADRESSIERT, Plan]** Rev. 7 Punkt 23.
- **F32 [ADRESSIERT, Plan]** Rev. 7 Punkt 24: Erkennung unterhalb von
  `extractContentFromBuffer`, also für alle drei Leser.
- **F33 [ADRESSIERT, Plan]** Rev. 7 Punkt 25: Seitenraster ist neue Arbeit, erst Prototyp.
  Punkt 14 (a) „wie bookPdf.ts“ war falsch begründet.
- **F34 [ADRESSIERT, Plan]** Rev. 7 Punkt 21.
- **F35 [ADRESSIERT, Plan]** Rev. 7 Punkt 21: Bildkosten in Token schätzen und prüfen.
- **F36 [ADRESSIERT, Entscheidung]** Nutzerentscheidung 02.11.2026: In 1.2 bekommt der Agent
  aus Bildern und Scans nur lokal erkannten Text, auch mit Cloud-Modell. Bildeingabe an
  Cloud-Modelle gibt es in 1.2 nur im Chat. Punkt 19 (Agent-Teil) wandert mit Punkt 18 nach 1.2.
- **F37 [ADRESSIERT, Entscheidung]** Ollama-Cloud-Modelle bekommen in 1.2 keine Bilder, sichtbar
  abgelehnt mit „Bilder nur lokal oder über OpenRouter/LLMBase“.
- **F38 [ADRESSIERT, Plan]** Rev. 7 Punkt 20.
- **F39 [ADRESSIERT, Plan]** Rev. 7 Reihenfolge übernimmt den Vorschlag.
- **F40 [ADRESSIERT, Plan]** Rev. 7 Punkt 22.
- **F41 [ADRESSIERT, Entscheidung]** Nutzerentscheidung 02.11.2026: keine Erkennung von
  Textseiten in 1.2, aber sichtbarer Vermerk „Bilder auf Textseiten nicht geprüft“, wenn eine
  Textseite Bilder enthält; leere Seiten werden getrennt erkannt (Rev. 7 Punkt 25).

### Rev. 7 — Bauplan für 1.2 (02.11.2026, nach Runde 4)

Ersetzt die Reihenfolge aus Rev. 5/6. Umfang: 3a, 3b (nur Chat), 4a, 4b. Nicht in 1.2: 4c,
Punkt 18, Agent-Teil von Punkt 19, Teil 1, Teil 2, LM Studio mit Bildern.

**20. Bildvertrag (F38).** `shared/chatImages.ts`, Version `CHAT_IMAGE_CONTRACT = 1`.
- Laufzeit: `ChatImage { v: 1, id, name, mime: 'image/jpeg', width, height, byteLength, dataBase64 }`.
  Nur aufbereitete Bytes. `name` ist reine Anzeige und geht nie an ein Modell; das Modell sieht
  „Bild 1“, „Bild 2“.
- Zustellung je Bild und Anfrage, vom Main zurückgemeldet:
  `ChatImageDelivery = { kind: 'image', route: 'local' | 'cloud', target } | { kind: 'ocr', model }
  | { kind: 'rejected', reason }`. Die Frage trägt `images` und `imageDelivery`.
- Folgefragen (Rev. 2 Punkt 7): höchstens zwei Bilder gehen im Verlauf mit, ältere werden durch
  „[Bild … nicht mehr mitgeschickt]“ ersetzt. Der Main zählt das selbst nach, nicht nur der
  Renderer.
- Gespeichert wird in 1.2 nichts. Teil 1 bildet `dataBase64` später auf `media/<id>.jpg` ab
  (eigene Projektion `StoredChatImage`, ohne Bytes im JSON).
- Aufbereitung im Renderer: `createImageBitmap(..., { imageOrientation: 'from-image' })`, lange
  Seite höchstens 1600 px, JPEG 0,85. HEIC wird abgelehnt. Höchstens 4 Bilder je Nachricht,
  Eingabe höchstens 25 MB je Bild.

**21. Fähigkeit und Kosten (F34, F35, F37).**
- Ollama: `vision` + `completion` aus den Ollama-Angaben, nach `resolveLocalModel`. Cloud-Tag oder
  `remote_host` → abgelehnt (F37).
- OpenRouter: `architecture.input_modalities` enthält `image`, gecacht mit den Preisen
  (`cloudPricing.ts`). LLMBase: Katalog am echten Zugang prüfen; ohne Angabe gilt „unbekannt“,
  das Bild geht dann mit, und ein Fehler wird verständlich übersetzt, nie still ohne Bild.
- Kosten: je Bild `ceil(Breite × Höhe / 750)` Token (Schätzung nach Anthropic-Formel, bei 1600 px
  höchstens rund 2 700). Summe der Bilder einer Anfrage höchstens 50 % des Fensters. Für LLMBase
  gilt weiter die Annahme 32 768, also höchstens rund 16 000 Token Bilder. Darüber lehnt der Main
  ab, die Marke nennt den Grund.

**22. Bild-Prüfstelle im Main (F40).** Pure Entscheidung in `shared/chatImageGate.ts`
(`decideChatImageRoute`, getestet), aufgerufen im `ollama-chat`-Handler, bevor ein Bild in eine
Anbieter-Nutzlast umgewandelt wird. Prüft am wirklichen Request:
- Bytes: JPEG-Kennung, keine EXIF-Daten, Maße aus dem JPEG-Kopf höchstens 1600 px, Größe.
- Modus: nur `petrol`. Websuche (Globus) nimmt keine Bilder an.
- Weg: lokal geprüft + Vision; oder OpenRouter/LLMBase mit `notes-chat`-Freigabe, genau diesem
  Modell UND der Bild-Zustimmung `chatImageCloudConsentVersion ≥ CHAT_IMAGE_CLOUD_CONSENT_VERSION`
  (uiStore, Main liest `ui-settings.json`). Zustimmung auf der Bildmarke oder in Einstellungen →
  Cloud-Anbieter, Text nennt „Fotos können Personen, Räume und Unterschriften zeigen“.
- Sonst: Ablehnung mit Grund, nie stilles Weglassen. Ausweg auf der Marke: „Text aus dem Bild
  lesen“ (lokale Erkennung, Punkt 23), der erkannte Text steht sichtbar in der Nachricht.
- An Antworten zu Bildern steht „Bildinhalt vom Modell gelesen, nicht geprüft“.

**23. Gemeinsamer OCR-Einstieg (F28, F31).** `main/ocr/localOcr.ts`:
- liest Modell und Schalter aus `ui-settings.json` (`visionOcr`), nie aus Parametern;
- vor JEDER Seite `resolveLocalModel` ohne Cache und Vision-Prüfung;
- meldet Ollama-Vordergrund an (Indexer pausiert);
- reicht ein `AbortSignal` bis zum `fetch` durch, Timer in einem äußeren `finally`;
- ein Stream ohne `done` gilt als `incomplete`, nie als vollständig;
- Viewer-Knopf (`vision-ocr-extract-page`), Chat-Ausweg und Agent rufen nur diesen Einstieg.
  `extractOcrPage` wird nicht mehr direkt importiert (Test prüft die Importe).

**24. Agent liest Bilder (4b, F32).** Neue Art `image` (`.png`, `.jpg`, `.jpeg`, `.webp`) in
`EXT_TO_KIND`. Die Erkennung hängt an `extractContentFromBuffer` über einen optionalen
Lauf-Kontext `{ signal, budget, cache }`; damit nutzen direkter Anhang, `read_context_file` und
`folder_digest` dieselbe Strecke. Ohne Lauf-Kontext (Notiz-Chat-Anhänge) bleibt es beim heutigen
„nicht unterstützt“. Bild im Main verkleinern über `nativeImage` (kein Canvas nötig); ob es die
EXIF-Drehung anwendet, wird beim Bau gemessen. Budget 40 Seiten je Lauf, Cache je Inhalts-Hash
im Lauf. Manifest nennt Bilder mit „Texterkennung nötig“. Rückgabe: „per Texterkennung gelesen,
kann Lesefehler enthalten“.

**25. Agent liest Scans (4a, F29, F30, F33, F41).**
- `extractPdfPages` liefert eine Seitenliste `{ n, text, chars, hasImages }`. Seiten unter der
  Schwelle MIT Bild → Erkennung; ohne Text und ohne Bild → „leer“, kostet kein Budget.
- Abdeckung als Struktur `PdfCoverage { textPages, ocrPages, ocrFailed, emptyPages, notReached,
  imagesOnTextPages }`, getrennt vom Modelltext; Ordner-Status und `folder_digest` lesen sie,
  nicht den String. „Ganz ohne Text“ erst nach erfolgloser Erkennung.
- `imagesOnTextPages > 0` → Vermerk „Bilder auf Textseiten nicht geprüft“ (F41).
- Seitenraster: erst ein Prototyp (verstecktes Fenster mit pdfjs 5.4.296 und Canvas, ohne
  Preload, `isEvalSupported: false`), gemessen an Zeit, Speicher und Ergebnis. Scheitert er,
  kommt 4a nicht in 1.2; 4b und der Seitenvermerk bleiben.

**Reihenfolge (F39).**
1. Bildvertrag + Aufbereitung (Punkt 20).
2. 3a: Bilder im Chat lokal (Punkt 21 Ollama, 22).
3. Cloud-Fähigkeit, Bild-Zustimmung, 3b (Punkt 21, 22, Erweiterung `chatClient.ts`).
4. Gemeinsamer OCR-Einstieg + Chat-Ausweg „Text aus dem Bild lesen“ (Punkt 23).
5. 4b Bilder im Agenten (Punkt 24).
6. PDF-Raster-Prototyp, dann 4a (Punkt 25).
Vor dem Release: Prüfset mit 12 Bildern (Teil 3) an den installierten Vision-Modellen. Eine
Modellempfehlung im Hinweis erst danach.

### Runde 5 (02.11.2026) — Prüfung des gebauten Codes

Alle 12 Befunde gegen den Code geprüft; 11 tragen, F46 nicht. Nutzer hat freigegeben: alles außer
F46, F47 in kleiner Form.

- **F42 [ADRESSIERT, Code]** Der Main kodiert jedes Bild vor dem Versand neu (`nativeImage`,
  `chatImageRequest.ts` `reencode`), die echten Maße zählen danach. In der App geprüft: JPEG mit
  angehängten Fremdbytes nach dem Bildende → neu kodiert gesendet, richtig gelesen.
- **F43 [ADRESSIERT, Code]** Bildschalter in Einstellungen und an der Bildmarke rufen
  `flushUISettings`; der Main liest die Zustimmung unmittelbar vor dem Cloud-Versand erneut und
  lehnt bei Widerruf ab („Nichts wurde gesendet“).
- **F44 [ADRESSIERT, Code]** OpenRouter mit `vision: unknown` → abgelehnt (`unknown-capabilities`);
  LLMBase bleibt die benannte Ausnahme. Medienformat-Prüfung aus dem Katalog nicht gebaut (Feld
  unbelegt).
- **F45 [ADRESSIERT, Code]** `ocrImageLocal` lehnt fehlende Fähigkeitsangabe ab; Test.
- **F46 [ABGELEHNT]** Erkannter Text steht sichtbar im Eingabefeld und wird vom Nutzer selbst
  abgeschickt; danach ist er Text wie jeder getippte. Schon das erste Senden an die Cloud braucht
  nur die Chat-Freigabe. Sonderbehandlung im Verlauf widerspräche „Transparenz statt Sperre“.
- **F47 [ADRESSIERT, klein]** Formulierung in `pdfRaster.ts` und `CLAUDE.md` korrigiert (nur das
  Rastern läuft abgeschottet); `extractPdfText` prüft den Abbruch je Seite und hört nach 60 s auf
  (Rest als „gekürzt“). Textebene in einen eigenen Prozess verlagern: offen, nach 1.2.
- **F48 [ADRESSIERT, Code]** Zeitbudget 15 min je Lauf (`AGENT_OCR_TIME_BUDGET_MS`), Seitenfrist =
  Restzeit; Chat-OCR je Fenster genau eine, Abbruch nur mit passender Kennung desselben Fensters.
  Beim Prüfen in der App gefunden: Belegung lag hinter dem ersten `await`, eine zweite Anfrage
  rutschte durch — jetzt vor dem ersten `await`, in der App erneut geprüft.
- **F49 [ADRESSIERT, Code]** `closeIfCurrent`: ein später Fehler schließt nur sein Fenster.
  Kein automatischer Test (BrowserWindow in vitest nicht verfügbar).
- **F50 [ADRESSIERT, Code]** Vermerke und Status nur aus der Abdeckung (`pdfCoverageNotes`,
  `ExtractMeta.pdfNotes`), Text-Parser `pdfNoTextNote`/`pdfNotes`/`keepPdfNoTextNote` entfernt;
  Test: PDF mit „[Texterkennung: …]“ im Text erzeugt keinen Vermerk.
- **F51 [ADRESSIERT, Code]** Frühe Ablehnung meldet jede Bildkennung als „rejected“; Test und
  in der App geprüft.
- **F52 [TEILWEISE]** Tests für F42/F44/F45/F48/F50/F51 ergänzt; echte Wege in der Dev-App geprüft
  (Neukodierung, Ablehnungen, OCR-Sperre). Offen: Cloud-Bildweg am echten Anbieter, Prüfset.
- **F53 [ADRESSIERT, Code]** Antwort zeigt „N ältere Bilder gingen nicht mehr mit“.

### Runde 6 (02.11.2026) — Nachprüfung

Alle fünf Befunde tragen; Nutzer hat alle freigegeben. F46-Ablehnung von Codex nicht beanstandet.

- **F54 [ADRESSIERT, Code]** `setChatImageConsentDurable` (uiStore): Zustimmung gilt erst nach
  bestätigtem Schreiben, bei Fehlschlag Rücksprung und Hinweis; währenddessen Schalter gesperrt
  und im Chat kein Senden, sobald Entwurf oder Verlauf Bilder enthält.
- **F55 [ADRESSIERT, Code]** `withPdfDeadline` um `getDocument`, `getPage`, `getTextContent`,
  `getOperatorList` (Restfrist aus 60 s, Abbruchsignal), `destroy` höchstens 5 s abgewartet; Frist
  vor der ersten Seite → eigene Fehlermeldung statt „keine Textebene“. Test mit einem nie fertigen
  Schritt. Grenze im Code und in CLAUDE.md benannt: ein den Main blockierender Schritt ist so
  nicht hart abbrechbar (eigener Prozess nach 1.2).
- **F56 [ADRESSIERT, Code]** `readContextBlock`: PDF-Vermerke nach der letzten Kürzung, Platz
  dafür vom Gesamtbudget reserviert.
- **F57 [ADRESSIERT, Code]** Zahl der nicht mitgeschickten Bilder hängt am laufenden Auftrag und
  geht beim Stopp in die Teilantwort; Test.
- **F58 [ADRESSIERT, Code]** Chat-OCR lehnt ungültige Kennungen ab und bricht beim Schließen des
  Fensters ab (`destroyed`), Listener wird im `finally` entfernt.

Prüfrunden damit beendet (Nutzerentscheidung). Offen vor Release: Nutzerabnahme, Cloud-Bildweg am
echten Anbieter, Prüfset.

### Rev. 8 — Bauplan Teil 1 (04.11.2026, Start nach 1.2.1)

Grundlage: Teil 1 oben, Rev. 2 Punkt 1–2, Rev. 3 Punkt 9 und 11, Rev. 4 Punkt 12. Branch
`feature/chat-verlauf`. Seit dem Plan dazugekommen: Bilder im Chat (1.2, Laufzeitvertrag
`shared/chatImages.ts`) und die Gesprächsform (`chat-wie-codex.md`). Teil 2 (Notizen) baut auf
diesem Schnitt auf, ist aber nicht Teil davon.

**Schritt 1 — Datenvertrag (rein, getestet).** `shared/petrolChat.ts` nimmt den Laufzeittyp
`PetrolChatMessage` aus dem Renderer-Store auf (der Main braucht ihn ab Schritt 3).
`shared/petrolChatStored.ts`:
- `StoredChatMessage` mit expliziter Feldliste, Abbildung `toStoredMessage` kopiert nur bekannte
  Felder. Aus `web.sources` und `webPartial.sources` fällt `excerpt`, `snapshotId` wird
  `hadSnapshot: true`, `followUpSnapshotId` wird `wasFollowUp: true` (Rev. 3 Punkt 9). Bilder:
  `StoredChatImage` ohne `dataBase64`.
- `parseStoredChat(unknown)`: strenge Prüfung beim Laden. Ist der Kopf oder eine Nachricht
  ungültig, gilt das ganze Gespräch als „nicht lesbar“. Einzelne Nachrichten werden nicht still
  weggelassen, sonst stünde eine Frage ohne Antwort im Verlauf.
- `restoreMessage`: setzt `excerpt: ''`. `hadSnapshot` und `wasFollowUp` bleiben erhalten. Bilder
  bekommen ihre Bytes aus `media/`.
- `chatTitle` (erste Frage, Leerraum zusammengefasst, 60 Zeichen), `isChatExpired`
  (Aufbewahrung 30/90/365/nie, gemessen an `updatedAt`).

**Schritt 2 — Ablage im Main (getestet mit eingespieltem Schlüssel).** `main/petrolChats/`:
`userData/petrol-chats/<sha256(vaultPath)[0..16]>/<gespräch-id>/chat.json.enc` + `media/<bild-id>.jpg.enc`.
- `safeStorage` für JSON und Medien, Ordner 0700, Dateien 0600, atomar über Temp-Datei + Rename,
  eine Schreibkette je Gespräch, Schreiben nur bei geändertem Inhalt.
- Verfügbarkeit: `safeStorage.isEncryptionAvailable()`, unter Linux zusätzlich nicht
  `basic_text`. Ist der Schlüssel nicht verfügbar, wird nicht gespeichert, und die Liste nennt den
  Grund. Lässt sich ein Gespräch nicht entschlüsseln, wird es als „nicht lesbar“ gelistet und
  nur das Löschen angeboten.
- Aufräumen beim Start, je Vault beim ersten Zugriff: abgelaufene Gespräche, Ordner ohne
  `chat.json.enc` (Absturzreste), Medien ohne Verweis. Ein gerade offenes Gespräch wird nicht
  angefasst.
- Gesprächs-ID vom Main vergeben (`randomBytes(16)` hex), Bild-ID nach `/^[\w-]{1,64}$/`.

**Schritt 3 — Der Main führt das Gespräch (Rev. 4).** Neues `main/petrolChats/conversations.ts`
mit dem Verlauf je Absender und Gesprächs-ID im Speicher, beim Öffnen von der Platte geladen.
- Der Renderer schickt `{ conversationId, vaultPath, question, images, Weg }`, weder Verlauf noch
  Themenfragen. Der Main baut den Modellverlauf selbst: `completedTurns`, Ausschluss der
  Webwechsel, `webTopicQuestions` und `planImageHistory` wandern nach `shared/`.
- Frage und Antwort hängt der Main selbst an und speichert. Der Renderer bekommt die fertige
  Anzeige-Nachricht zurück (Stücke weiter über `petrol-chat-chunk`). Stopp und Fehler legt
  ebenfalls der Main ab. Das Bruchstück schickt der Renderer nicht mehr mit, der Main kennt es
  aus dem Stream.
- `petrol-chat-web`: dasselbe, `scopeId` der Snapshots = Gesprächs-ID (Rev. 3 Punkt 11).
- LM Studio und Ollama/Cloud nutzen denselben Gesprächsweg. Der Notiz-Chat bleibt auf
  `ollama-chat` mit Renderer-Verlauf.

**Schritt 4 — Oberfläche.** Liste „Gespräche“ im Chat-Modus (einklappbar, neueste oben,
umbenennen, löschen, alle löschen, „nicht lesbar“, Hinweis bei fehlendem Schlüssel). „Neues
Gespräch“ legt ein neues an. Ein neuer Tab startet leer. Tab schließen verliert nichts mehr.
Vault-Wechsel bricht die laufende Anfrage ab und zeigt die Liste des neuen Vaults. Einstellungen:
Aufbewahrung (Standard 90 Tage), Sätze zu „nur auf diesem Rechner“, „im Backup des Rechners“
und „verschobener Vault verliert die Zuordnung“.

**Schritt 5 — Geladene Gespräche ehrlich zeigen.** Antworten mit `hadSnapshot` zeigen „Seiten
nicht mehr da“, Fragen mit `wasFollowUp` den Hinweis `followUpGoneHint`. Keine stille Vormerkung
als Nachfrage. Export und Prüfbericht ohne Auszüge sind getestet.

**Prüfung je Schritt:** typecheck, Tests, `electron-vite build`. Ab Schritt 3 zusätzlich in der
Dev-App über CDP: senden, stoppen, Neustart, laden, weiterfragen, Bild, Webantwort.

### Runde 7 (04.11.2026)

Alle zehn Befunde habe ich gegen den Code geprüft. F60 und F68 habe ich mit einem eigenen Skript
nachgemessen: `__proto__` am Kopf wurde angenommen, ebenso `deep: {}`, `extras: [null]` und
`sentences: [null]`. Acht Befunde tragen, F61 und F65 teilweise. Der Nutzer hat die Empfehlung
freigegeben.

- **F59 [ADRESSIERT, Code]** Jede Struktur hat jetzt genau ein Schema mit `copy` (Speichern) und
  `check` (Laden), auf jeder Ebene: Prüfbericht, Satzprüfung, gründliche Suche, Provenienz,
  übersprungene Treffer, Bildzustellung. `toStoredMessage` bildet nur die Merkmale und kopiert dann
  über das Schema. Ein Negativtest prüft acht verschachtelte Fremdfelder (Auszug, Kennung, Bytes).
- **F60 [ADRESSIERT, Code]** `CitationReport`, `SentenceExtra`, `WebDeepInfo` (samt `hits`) und
  `WebSkippedHit` werden vollständig geprüft, mit Aufzählungswerten. Sechs defekte Formen werden
  abgelehnt (Test).
- **F61 [TEILWEISE → Rev. 9 Punkt 28]** Die Anzeige braucht die Auszüge nicht, sie zeigt das
  Ergebnis der Prüfung vom Zeitpunkt der Antwort. „Behauptet Belegstatus“ trifft es deshalb nicht.
  Trotzdem bekommt sie eine sichtbare Kennzeichnung.
- **F62 [ADRESSIERT, Plan]** Rev. 9 Punkt 28: Schritt 4 und 5 werden ein Schritt.
- **F63 [ADRESSIERT, Code + Plan]** Daten: Ein Bild ohne lesbare Mediendatei steht nach dem Laden
  in `imagesMissing` (ohne Bytes), nicht mit leeren Bytes in `images`. Es geht also nie an ein
  Modell und bleibt auch beim nächsten Speichern als fehlend markiert (Test). Anzeige: Rev. 9
  Punkt 28.
- **F64 [ADRESSIERT, Code]** `trimToTurns` kürzt nur an einer Wechselgrenze. Beim Laden wird die
  Reihenfolge geprüft: keine Antwort am Anfang, nie zwei Antworten hintereinander. Zwei Fragen
  hintereinander sind erlaubt (Stopp vor dem ersten Wort). Test mit über 2000 Nachrichten,
  gestoppten Fragen und Fehlern.
- **F65 [TEILWEISE, Code + Plan]** Eine Kollision ist bei Zeitstempel und Zähler praktisch
  unwahrscheinlich, die Abhilfe kostet aber wenig. Doppelte Bild-IDs lehnt das Laden ab, das Bauen
  wirft `StoredChatError`. Zusätzlich gilt kein Name aus `Object.prototype` als Bild-ID:
  `__proto__` passt auf `[\w-]`, das hat mein eigener Test gefunden. Rev. 9 Punkt 27: Der Main
  prüft die Eindeutigkeit beim Anhängen.
- **F66 [ADRESSIERT, Plan]** Rev. 9 Punkt 26.
- **F67 [ADRESSIERT, Plan]** Rev. 9 Punkt 27.
- **F68 [ADRESSIERT, Code]** `Object.hasOwn` statt `in`, Schlüssel von Bild-Wörterbüchern nur als
  geprüfte Bild-ID. Test mit `__proto__`, `constructor`, `toString` und `hasOwnProperty` an Kopf,
  Nachricht und Quelle.
- `buildStoredChat` schreibt nur, was `parseStoredChat` wieder lädt (sonst `StoredChatError`).
- Prüfung: typecheck sauber, `npm run test` 3342 grün. Rot war nur der bekannte
  Zeitlimit-Fall `shellExecution.test.ts` (allein grün). `electron-vite build` sauber.

### Rev. 9 — Ergänzungen zum Bauplan (nach Runde 7)

**26. Gespräch fest an seinen Vault gebunden (F66).** Der Main führt Gespräche unter dem
Schlüssel `(Absender, kanonischer genehmigter Vault, Gesprächs-ID)`. Der Vault wird beim Anlegen
bzw. Öffnen festgelegt: `assertApprovedVault`, dann `fs.realpath` (F73, sonst hätte derselbe Vault
über einen Symlink zwei Gesprächslisten). Genau dieser Pfad geht an die Ablage. Jede spätere Anfrage, deren Vault
abweicht, wird abgelehnt, ebenso eine ID, die unter diesem Vault nicht existiert. Die Speicherkette
schreibt in den Ordner des gebundenen Vaults, nie in den des aktuellen Renderers. Tests: Wechsel
während des Streams, späte Speicherung nach Wechsel, gleiche ID unter anderem Vault.

**27. Der Main sammelt den ganzen Wechsel (F67, F65).** Je Anfrage hält der Main einen
Wechselzustand: Frage, Textstücke, Webfortschritt (Quellen, Fehler, nicht Abgerufenes, gesendete
Suchanfragen) und Bildzustellung. Beim Stopp schließt er den Wechsel genau einmal ab und bildet das
Bruchstück daraus (`webPartial`, `webSentQueries`, `imagesDropped`), wie heute der Renderer-Stopp.
Ein spätes Ergebnis desselben Wechsels darf nur noch Angaben nachtragen (Suchanfragen), nie den
Text oder den Abschluss. Bild-IDs prüft der Main beim Anhängen auf Eindeutigkeit im Gespräch.
Tests: Stopp in der Suche, in der Modellphase und bei einer direkten Frage.

**28. Laden und Anzeige gehen zusammen aus (F62, F61, F63).** Schritt 4 und 5 sind ein Schritt.
Ohne die Anzeige der Merkmale wird kein Gespräch geladen. Dazu gehören:
- `hadSnapshot` → „Seiten nicht mehr da“;
- `wasFollowUp` → kein „Erneut senden“, `followUpGoneHint`, keine stille Vormerkung;
- Prüfung je Satz eines geladenen Gesprächs → „geprüft beim Antworten · Seiten nicht mehr da“;
- `imagesMissing` → Marke „Bild nicht mehr vorhanden“, nicht erneut sendbar.
Tests mit einem echt geladenen Gespräch: Erneut senden, Vormerkung, Bild, Export.

### Runde 8 (04.11.2026)

Alle neun Befunde habe ich gegen den Code geprüft. Sieben tragen, F70 und F75 teilweise. Bei F71
ist es schlimmer als beschrieben: Ein vorübergehender Lesefehler machte aus dem Bild beim nächsten
Speichern `imagesMissing`, danach löschte das Aufräumen die intakte Datei. Der Nutzer hat alle
neun freigegeben.

- **F69 [ADRESSIERT, Code]** Zwei Fragen hintereinander nur, wenn die erste `stopped` trägt
  (Test).
- **F70 [ADRESSIERT, Code; teilweise]** Der Merker trägt Hash, Größe und Dateizeit. Weicht die
  Datei ab, wird sie neu gelesen. Ist sie nicht lesbar, wird nicht überschrieben und nicht
  „unverändert“ gemeldet (Test mit derselben Instanz, beschädigte Datei und Schlüsselwechsel).
  Nicht übernommen: Ein von dieser Instanz geladenes und gehaltenes Gespräch gilt beim
  Überschreiben nicht als verloren. Ab Schritt 3 ist der Main-Stand die Wahrheit.
- **F71 [ADRESSIERT, Code]** `imagesMissing` gibt es nur zur Laufzeit, gespeichert bleibt jedes
  Bild unter `images`. Die Bildschleife läuft vor der Prüfung auf „unverändert“. Eine fehlende
  oder unpassende Datei wird nur durch passende Bytes ersetzt (F74). Tests: Nachtragen bei
  unverändertem Gespräch, vorübergehender Lesefehler mit Laden, Speichern und Aufräumen (Datei
  bleibt, Bild kommt wieder), kaputte Datei ersetzt.
- **F72 [ADRESSIERT, Code]** Eine Kette je Vault für Speichern, Löschen, „alle löschen“ und
  Aufräumen. Test: Speichern vorher, „alle löschen“, Speichern nachher, gleichzeitig gestartet.
- **F73 [ADRESSIERT, Plan]** Rev. 9 Punkt 26 nennt jetzt `fs.realpath`. Den Pfad liefert der
  Aufrufer (Schritt 3), die Ablage selbst kanonisiert nicht.
- **F74 [ADRESSIERT, Code]** `matchesImage`: JPEG ohne Metadaten, Länge = `byteLength`, höchstens
  3 MB, Maße aus dem JPEG-Kopf = gespeicherte Maße. Geprüft beim Speichern und beim Laden, die
  Dateigröße schon vor dem Entschlüsseln.
- **F75 [ADRESSIERT, Code; teilweise]** Schlüssel und Dateigröße werden vor dem Lesen geprüft,
  Gesprächsdatei höchstens 16 MB (größer: nicht speichern, `too-large`, bzw. „nicht lesbar“).
  Mehr Parallelität hilft nicht, weil `decryptString` synchron läuft. Ein eigener Kopf für die
  Liste kommt erst, wenn die Messung in Schritt 4 es verlangt.
- **F76 [ADRESSIERT, Code]** `fsync` der Temp-Datei vor dem Rename, des Ordners danach (wo das
  Dateisystem es erlaubt). Fehlt ein Bild nach einem Absturz, ist das der Fall „fehlt beim Laden“
  (F63).
- **F77 [ADRESSIERT, Code]** Dieselbe ID mit denselben Angaben ist EIN unveränderliches Bild mit
  einer Mediendatei (`imageMetaIn`). Abgelehnt wird nur eine ID mit abweichenden Angaben. Test mit
  dem echten Retry-Verlauf (Fehler, dieselbe Frage mit demselben Bild).
- Prüfung: typecheck sauber, `npm run test` 3370 grün. Rot nur `shellExecution.test.ts`
  (bekannt), `electron-vite build` sauber. 85 Tests in Datenvertrag, Ablage und Store.

### Runde 9 (05.11.2026)

Alle acht Befunde habe ich gegen den Code geprüft. Sieben tragen, F85 teilweise. Bei F79 kommt
eine zweite Seite hinzu: Beide IPC-Aufrufe warten im Main zuerst auf `realpath`. Kam die neue
Frage vor dem Stopp an, lehnte der Main sie mit „läuft schon eine Antwort“ ab. Der Nutzer hat
F78–F84 im Code und F85 als Plan freigegeben.

- **F78 [ADRESSIERT, Code]** Generation je Tab (`generations`). „Neues Gespräch“, Tab zu und
  Vault-Wechsel zählen hoch. `vaultChanged` greift auch während des Öffnens (Vault der Öffnung).
  Ein spätes Öffnen wird verworfen und das eben angelegte Gespräch im Main geschlossen. Tests:
  Vault-Wechsel und Tab zu während eines verzögerten Öffnens.
- **F79 [ADRESSIERT, Code]** Ein laufender Stopp wird je Tab gemerkt (`stopping`), eine neue Frage
  wartet auf seinen Abschluss. Stopp- und späte Ergebnisse gelten nur für ihren Wechsel
  (`turnSeqs`) und ihre Generation. Test: verzögerter Stopp, sofortige Folgefrage, danach das
  späte Ergebnis der ersten Anfrage. In der App geprüft (Oberfläche, qwen3.8:27b-mlx): Stopp nach
  3 s, die sofort nachgeschobene Frage wurde angenommen und beantwortet.
- **F80 [ADRESSIERT, Code]** `runLabel` ist aus dem Vertrag entfernt. Der Main bildet das Label
  (`answerLabel`, gleiche Form wie `cloudRoutesForFeature`), ein mitgeschicktes Label wird
  ignoriert (Test).
- **F81 [ADRESSIERT, Code]** `petrol-chat-web` direkt lehnt `snapshotId` ab und läuft ohne
  `scopeId`, legt also auch keine neuen Auszüge an. Nachfragen misst man über `petrolConvSend`. In
  der App geprüft.
- **F82 [ADRESSIERT, Code]** `petrolConvEvents` ist nach Fenster + Kennung geschlüsselt. Die
  Lauf-Eingaben tragen `senderId`.
- **F83 [ADRESSIERT, Code]** Der Store führt `'failed'` als eigenen Zustand (`nextStorage`), auch
  nach Stopp und spätem Ergebnis. „unverändert“ ändert nichts (Test). Die Anzeige folgt in
  Schritt 4.
- **F84 [ADRESSIERT, Code]** `OnceShared`: Das Aufräumen je Vault wird geteilt, gilt erst nach
  Erfolg als erledigt, und wer öffnet, wartet darauf. Tests: gleichzeitige Aufrufe,
  Fehlschlag/Fehler werden wiederholt.
- **F85 [TEILWEISE → Rev. 9 Punkt 29]** Im jetzigen Stand öffnet die App noch kein gespeichertes
  Gespräch, die Last entsteht erst mit Schritt 4. Deshalb dort gelöst.
- Prüfung: typecheck sauber, `npm run test` 3392 grün. Rot nur `shellExecution.test.ts`
  (bekannt), `electron-vite build` sauber.

### Runde 10 (05.11.2026)

Alle zwölf Befunde habe ich gegen den Code geprüft, alle tragen. F88–F90 treten nur bei mehreren
Fenstern auf. Bei F88 kommt ein konkreter Weg hinzu: Ein spätes Ergebnis der gründlichen Suche
speicherte ein bereits geschlossenes Gespräch und legte es nach dem Löschen wieder an. Beim Bauen
selbst gefunden: Brach ein Tab-Wechsel das Öffnen ab, blieb die Öffnungs-Sperre stehen und der
Tab konnte nie wieder senden. Jetzt hat die Sperre einen Besitzer (`openingOwner`). Der Nutzer hat
alle zwölf freigegeben.

- **F86 [ADRESSIERT, Code]** `openConversation` lädt erst das Ziel und tauscht danach. Scheitert
  das Öffnen, bleibt das bisherige Gespräch unberührt (Test).
- **F87 [ADRESSIERT, Code]** Öffnen ist ein laufender Vorgang des Tabs (`opening` + Besitzer).
  Senden und ein zweites Öffnen sind gesperrt, die Generation zählt sofort hoch. Test: Senden
  während des Öffnens, Tab zu währenddessen, Senden danach geht.
- **F88 [ADRESSIERT, Code]** Ein geschlossenes Gespräch speichert nie mehr (`closed`).
  `beginDelete`/`endDelete` lassen Öffnen und Anlegen während des Löschens scheitern. Test: spätes
  Ergebnis der gründlichen Suche nach dem Löschen, Öffnen und Anlegen während des Löschens.
- **F89 [ADRESSIERT, Code]** Ein Gespräch ist nur in einem Fenster offen, ein zweites Fenster
  bekommt „in einem anderen Fenster offen“. Umbenennen nimmt die offene Kopie (`openSender`).
  Test: Umbenennen und danach Senden, die Datei hat beides.
- **F90 [ADRESSIERT, Code]** `closeEverywhere`/`closeVault` liefern die Fenster. Diese bekommen
  `petrol-conv-closed`, der Store leert die Anzeige (Test).
- **F91 [ADRESSIERT, Code]** `storage.load(..., { media: false })` und `storage.loadImage`: Der
  Main liest ein Bild erst, wenn eine Marke es anfragt oder es als Verlaufsbild ans Modell geht
  (`ensureBytes`). Fehlt die Datei, wandert das Bild nach `imagesMissing`. Fehlt ein Verlaufsbild
  beim Senden, wird nichts gesendet, die Antwort ist ein ehrlicher Fehler. Im Renderer lädt eine
  Marke erst, wenn sie sichtbar wird (`LoadWhenVisible`), höchstens drei zugleich. Tests: Öffnen
  liest keine Bilddatei, Verlaufsbild erst beim Senden, fehlende Datei, Begrenzung auf drei.
  **Gemessen** in der App: 40 Bilder mit 1600 × 1200 (zusammen 48,7 MB, bewusst schlecht
  komprimierbar). Öffnen 1 ms und 15 KB ohne Bildbytes, ein Bild 11 ms. Über die Oberfläche luden
  zuerst 12 von 40 Marken, nach dem Hochscrollen 24.
- **F92 [ADRESSIERT, Code]** Kein „Erneut senden“ bei fehlendem Bild, dafür ein Hinweis
  (`retryImageMissing`).
- **F93 [ADRESSIERT, Code]** Ohne Schlüssel listet `petrol-conv-list` die Gespräche als „nicht
  lesbar“, sie lassen sich löschen.
- **F94 [ADRESSIERT, Code]** Bei einer bekannten Bild-ID nimmt der Main immer seine eigenen Bytes
  (Test mit anderen Pixeln bei gleicher Länge und gleichen Maßen).
- **F95 [ADRESSIERT, Code]** Beim Öffnen der Liste geht der Fokus auf ihren Kopf. Escape und
  „Schließen“ geben ihn an „Gespräche“ zurück, nach dem Öffnen eines Gesprächs geht er in die
  Eingabe. Nach dem Löschen landet er auf dem Eintrag an derselben Stelle, die Bestätigung bekommt
  den Fokus. In der App geprüft (Fokus nach Öffnen, Escape und Gesprächswechsel).
- **F96 [ADRESSIERT, Code]** Es zählt nur die neueste Listenantwort (`loadSeq`), beim Vault-Wechsel
  schließt die Liste.
- **F97 [ADRESSIERT, Code]** In geladenen Gesprächen mit verfallenen Seiten steht ein eigener Text
  (`oldWebSourceNoteRestored`).
- Prüfung: typecheck sauber, `npm run test` 3406 grün, rot nur `shellExecution.test.ts`
  (bekannt), `electron-vite build` sauber.

**29. Bilder beim Öffnen erst bei Bedarf (F85).** `petrol-conv-open` liefert ein geladenes
Gespräch ohne Bildbytes. Die Bildmarken holen sie einzeln über einen eigenen IPC (Gesprächs-ID +
Bild-ID, Vault geprüft, nur Bilder dieses Gesprächs) und halten sie im Renderer. „Erneut senden“
und „Text aus dem Bild lesen“ holen fehlende Bytes vorher. Belastung messen: ein Gespräch mit
40 Bildern öffnen.

## Status

Rev. 8, 04.11.2026: Bauplan Teil 1 (Schritt 1–5). Schritt 1 gebaut (uncommittet, Branch
`feature/chat-verlauf`): `shared/petrolChat.ts` (Laufzeittyp, neu `hadSnapshot`/`wasFollowUp`),
`shared/petrolChatStored.ts` + Test (19 grün; Auszüge, Kennungen und Bildbytes fehlen im JSON,
unbekannte Felder werden weder geschrieben noch geladen, Rundreise stabil). typecheck sauber.
Nächster Schritt: 2 (Ablage im Main).

Runde 7, 04.11.2026: F59, F60, F63 (Daten), F64, F65, F68 im Code behoben, F61, F62, F66, F67
als Rev. 9 Punkt 26–28 in den Plan übernommen. 38 Tests im Datenvertrag. Offen: Nutzerabnahme,
danach Schritt 2.

Schritt 2 gebaut, 04.11.2026 (uncommittet): `main/petrolChats/storage.ts` (`PetrolChatStorage`,
ohne Electron, Schlüssel/Uhr/ID eingespielt) und `main/petrolChats/electronCrypto.ts`
(`safeStorage`, unter Linux `basic_text` = nicht speichern). Ablage wie Rev. 8 Schritt 2. Bilder
werden vor dem Gespräch geschrieben und nur als JPEG ohne Metadaten. Ein kaputtes oder fehlendes
Bild fehlt beim Laden (F63), das Gespräch bleibt lesbar. Ein nicht lesbares Gespräch wird nie
überschrieben, nur zum Löschen angeboten, und läuft nach der Dateizeit ab. Die Kopf-ID muss zum
Ordner passen. 17 Tests (Rundreise, kein Klartext auf der Platte, Rechte 0700/0600, keine
Temp-Reste, unveränderter Inhalt auch nach neuer Instanz, Schreibkette, ohne Schlüssel,
fremder Schlüssel, Aufräumen). `npm run test` 3359 grün (rot nur `shellExecution.test.ts`,
bekannt), typecheck und build sauber. Noch nicht angeschlossen: kein IPC, `safeStorage` nicht in
der echten App gemessen. Nächster Schritt: 3 (Main führt das Gespräch, Rev. 9 Punkt 26/27).

Runde 8, 04.11.2026: F69–F77 umgesetzt (F73 als Plan, F70/F75 im kleineren Umfang). Offen:
Nutzerabnahme, Codex-Nachprüfung, danach Schritt 3.

Schritt 3 gebaut, 04.11.2026 (uncommittet): Der Main führt das Gespräch.
- `main/petrolChats/conversation.ts` (`PetrolConversations`): Verlauf, Themenfragen, feste
  App-Antwort und Verlaufsbilder aus den eigenen Daten (`shared/chatHistory.ts`, verschoben aus
  dem Renderer). Bindung (Absender, Vault, ID). Wechselzustand mit Abgriff, Stopp genau einmal,
  spätes Ergebnis nur mit Suchanfragen (Rev. 9 Punkt 26/27). Bild-IDs nur für dasselbe Bild.
  Speichern nach jedem Abschluss, ein Speicherfehler beendet das Gespräch nicht.
- `main/index.ts`: Die drei Handler sind als Funktionen herausgezogen. `petrol-conv-open/-send/
  -stop/-close` sind neu. `tappedEvent` leitet weiter und liest Textstücke und Fortschritt mit.
  Der Vault kommt über `assertApprovedVault` + `realpath`. `ollama-chat`/`lmstudio-chat` mit
  `petrol` lehnen ab, `petrol-chat-web` direkt läuft ohne Verlauf und Themen. Aufräumen je Vault
  einmal je Programmlauf.
- Renderer: `petrolChatStore.ts` ist der Anzeige-Spiegel (Gesprächs-ID, `vaultChanged`,
  Bildbytes bleiben lokal). `PetrolChat.tsx` reicht den Vault durch.
- Tests: 17 Gesprächsmodul, 16 Store (neu geschrieben, die Logikfälle F08/F09/F57 und die
  Empfänger liegen jetzt im Main-Test). `npm run test` 3384 grün, rot nur `shellExecution.test.ts`
  (bekannt). typecheck und build sauber.
- In der echten App geprüft (eigenes Testprofil und Test-Vault im Scratchpad, Build mit `file://`,
  CDP 9223), mit `qwen3.5:4b`: zweite Frage kennt die erste (Verlauf vom Main). Direkter
  `ollama-chat` mit `petrol` abgelehnt, fremder Vault und fremde ID abgelehnt. Stopp nach 2,5 s
  liefert ein Bruchstück, das späte Ergebnis ändert nichts. Bild (Testrechnung aus Canvas) lokal
  richtig gelesen, Folgefrage mit Verlaufsbild aus dem Main richtig. Schließen und Wiederöffnen
  von der Platte: 10 Nachrichten, Bildbytes da. Platte: `safeStorage`-Chiffrat (`v10`), 0700/0600,
  kein Klartext in Gespräch und Bild. Über die Oberfläche (qwen3.8:27b-mlx): zwei Fragen mit
  Bezug richtig, zweites Gespräch gespeichert.
- Nicht geprüft: Websuche und Nachfrage am echten Dienst (kein Schlüssel im Testprofil), LM Studio,
  Cloud-Weg, Tab schließen in der App.
Offen: Nutzerabnahme, Codex-Prüfung von Schritt 3, danach Schritt 4+5 (Liste und Anzeige
geladener Gespräche, Rev. 9 Punkt 28).

Runde 9, 05.11.2026: F78–F84 umgesetzt, F85 als Rev. 9 Punkt 29. Nächster Schritt: 4+5 (Liste,
Anzeige geladener Gespräche, Bilder bei Bedarf; Rev. 9 Punkt 28/29).

Schritt 4+5 gebaut, 05.11.2026 (uncommittet), Rev. 9 Punkt 28/29:
- Main: `petrol-conv-list` (wartet auf das Aufräumen, nennt den Speichermodus) und
  `petrol-conv-image` (Bytes je Bild, nur dieses Gespräch, dieses Fenster, dieser Vault). Neu sind
  außerdem `-rename` (auch für nicht offene Gespräche: laden, umbenennen, schließen),
  `-delete` (vorher `closeEverywhere`) und `-delete-all` (vorher `closeVault`). `petrol-conv-open`
  liefert keine Bildbytes. „Erneut senden“ mit leeren Bytes: Der Main nimmt sein eigenes Bild,
  ein unbekanntes Bild ohne Bytes wird abgelehnt.
- Datenvertrag: `restored` an geladenen Nachrichten (gehört nicht zum Speicherformat).
- Renderer: `PetrolChatHistory.tsx` (Liste über dem Verlauf, Bestätigungen in der Zeile, Hinweise
  zum Speichern), `openConversation` (stoppt, wartet auf den Stopp, neue Generation, keine
  Vormerkung) und `loadImage` (Generation geprüft). Anzeige: `hadSnapshot`, `wasFollowUp`,
  „geprüft beim Antworten“, Ladeplatzhalter und Marke „Bild nicht mehr vorhanden“, OCR-Knopf erst
  mit Bytes, „nicht gespeichert“ in der Fußzeile. Einstellungen → KI → Chat-Verlauf: Aufbewahrung
  30/90/365/nie mit den Sätzen zu Rechner, Backup und verschobenem Vault.
- Tests: 4 neue im Gesprächsmodul, 2 im Store. `npm run test` 3398 grün, rot nur
  `shellExecution.test.ts` (bekannt). typecheck und build sauber.
- In der echten App über die Oberfläche geprüft (Testprofil, CDP 9223):
  - Liste mit drei Gesprächen aus früheren Läufen (Titel, Zeit, Modell). Das Gespräch mit Bild
    geöffnet: Liste schließt, Bildmarke lädt nach (800 px).
  - Die Folgefrage im geladenen Gespräch nach „dem Bild von vorhin“ wurde mit „4711“ richtig
    beantwortet, das Bild kam von der Platte ans Modell.
  - Umbenennen auf „Testrechnung“ bleibt. Löschen mit Bestätigung in der Zeile: auf der Platte
    noch 2 Gespräche. Optik per Screenshot geprüft.
- Nicht geprüft: Anzeige einer geladenen Webantwort mit `hadSnapshot`/`wasFollowUp` in der App
  (im Testprofil kein Suchschlüssel; durch Unit-Tests der Projektion und der Store-Übernahme
  gedeckt), nicht lesbares Gespräch in der Liste, Einstellungskarte in der App, Linux/`basic_text`,
  Messung „40 Bilder öffnen“ aus Punkt 29.
Offen: Nutzerabnahme, Codex-Prüfung von Schritt 4+5, danach Commit/PR.

Runde 10, 05.11.2026: F86–F97 umgesetzt, 40-Bilder-Messung und Tastaturbedienung in der App
geprüft. Offen: Nutzerabnahme, danach Commit/PR.

Nutzerabnahme, 05.11.2026, erster Befund: Die Liste über dem Chat verdrängt bei vielen Gesprächen
den Schreibbereich, sie gehört nach links. Umgebaut: `PetrolChatHistory` ist jetzt ein Abschnitt
der linken Seitenleiste (`Sidebar.tsx`, über dem Dateibaum). Er ist nur sichtbar, solange der
Agent-Tab im Chat-Modus vorne ist, lässt sich einklappen (`petrolChatHistoryOpen`, gespeichert)
und hat einen eigenen Scrollbereich (höchstens 42 % der Seitenleiste). Zeilen wie im Dateibaum,
Umbenennen und Löschen erst bei Hover/Fokus, „+“ für ein neues Gespräch. Der Knopf „Gespräche“ im
Chat klappt den Abschnitt auf, zeigt die Seitenleiste und setzt den Fokus dorthin. In der App per
Screenshot geprüft.

Prüfset (02.11.2026, 12 synthetische Bilder, am Rechner erzeugt, über den echten Chat-Weg mit
Main-Prüfung und Neukodierung; Fakten per Textabgleich, Bild ohne Text = ehrliches „kein Text“):

| Bild | gemma4:e4b-mlx | ministral-3:8b | qwen3-vl:8b | qwen3.5:4b | qwen3.8:27b-mlx |
|---|---|---|---|---|---|
| 01-rechnung | 3/3 8s | 3/3 9s | 3/3 26s | 3/3 7s | 3/3 27s |
| 02-tabelle | 8/8 4s | 8/8 5s | 8/8 103s | 8/8 4s | 8/8 17s |
| 03-formular | 1/1 3s | 1/1 3s | 1/1 8s | 1/1 4s | 1/1 13s |
| 04-handschrift | 3/3 3s | 3/3 4s | 3/3 15s | 3/3 4s | 3/3 12s |
| 05-whiteboard | 3/3 3s | 3/3 4s | 3/3 18s | 3/3 5s | 3/3 12s |
| 06-diagramm | 2/2 3s | 2/2 4s | 2/2 10s | 2/2 4s | 2/2 15s |
| 07-kleinschrift | 1/1 3s | 1/1 4s | 1/1 47s | 1/1 4s | 1/1 12s |
| 08-kontrast | 1/1 3s | 1/1 4s | 1/1 14s | 1/1 4s | 1/1 16s |
| 09-gedreht | 1/1 3s | 1/1 4s | 1/1 13s | 1/1 4s | 1/1 12s |
| 10-ohnetext | ✓ 2s | ✓ 4s | ✓ 11s | ✓ 4s | ✓ 13s |
| 11-zweispaltig | 1/1 3s | 1/1 4s | 1/1 19s | 1/1 4s | 1/1 12s |
| 12-screenshot | 1/1 6s | 0/1 8s | 1/1 17s | 1/1 7s | 1/1 25s |
| **voll richtig** | **12/12** | **11/12** | **12/12** | **12/12** | **12/12** |
| Fakten | 25/25 | 24/25 | 25/25 | 25/25 | 25/25 |
| Zeit gesamt | 41 s | 55 s | 302 s | 52 s | 186 s |

Alle fünf lokalen Modelle lesen das Set (fast) fehlerfrei, auch Handschrift-Schrift, schwachen
Kontrast, 90°-Drehung; keines erfand Text im Foto ohne Text. Unterschied ist vor allem Zeit:
gemma4:e4b-mlx und qwen3.5:4b um 3–8 s je Bild, qwen3-vl:8b bis 103 s (Tabelle). Das Set ist zu
sauber, um Modelle zu trennen — echte Handyfotos (Schatten, Schräge, Unschärfe) fehlen. Deshalb
KEIN Eintrag in modelCompatibility.ts und keine Modellempfehlung in der App (Regel „erst messen“);
nächster Schritt dafür: Set mit echten, nicht personenbezogenen Fotos. Testaufbau-Fehler beim ersten
Lauf: sips-JPEG mit EXIF → vom Main korrekt abgelehnt, im Fenster neu kodiert nachgelaufen.

Abnahme in der Dev-App (02.11.2026, über CDP, Computer-Use lieferte keinen Bildschirm): Bild im Chat
lokal (qwen3.8:27b-mlx, richtig), Cloud-Bildweg am echten Anbieter (OpenRouter, Haiku 5.5, Testbild,
richtig, nach sichtbarer Freigabe), Widerruf sofort in der Datei und Textfrage mit Verlaufsbildern
danach abgelehnt, „Stattdessen Text daraus lesen“ (hochkant gespeichertes Foto, richtig), Agent mit
Ordner aus zwei Fotos und zwei PDFs (alle Werte richtig, Zwischenspeicher griff). Dabei gefunden und
behoben: Anhangsuche und Dateidialog boten keine Bilder an, Infotext nannte Bilder und Scans noch als
„nicht lesbar“; Bilder jetzt nur im Agent-Auftrag angeboten (`useContextVaultFiles({ images })`).
Nachgezogen (Nutzerentscheidung 02.11.2026): Bildmarke sammelt alle Empfänger
(`imageRecipients`); lehnt der Weg nur Verlaufsbilder ab, geht die Textfrage ohne sie, die Antwort
nennt den Grund (`imagesWithheld`). Vermerk fürs Modell neu (`imageOmittedNote`): Haiku las das alte
„nicht mitgeschickt“ als „nie ein Bild“ und erklärte die richtige Antwort für erfunden. In der App
geprüft. Offen: Prüfset, Commit/PR/Release.

Runde 6 (02.11.2026): F54–F58 umgesetzt, Prüfrunden beendet.

Runde 5 (02.11.2026): 11 von 12 Befunden umgesetzt, F46 abgelehnt. Offen vor Release: Prüfset, Cloud-Bildweg am echten Anbieter, Nutzerabnahme.

Rev. 7, 02.11.2026: Runde 4 beantwortet, F30 im Code behoben, Bauplan für 1.2 mit Reihenfolge aus F39.
Gebaut (uncommittet): Schritt 1–3 — Bildvertrag (`shared/chatImages.ts`), Prüfstelle
(`shared/chatImageGate.ts`, `main/llm/chatImageRequest.ts`), Bilder im Petrol-Chat lokal und über
OpenRouter/LLMBase mit eigener Zustimmung (Bildmarke + Einstellungen → Cloud-Anbieter). In der
Dev-App geprüft: Chromium-JPEG ohne APP1, qwen3.5:4b liest Testrechnung richtig, Ablehnung bei
Ollama-Cloud (Tag und `remote_host`), Modell ohne Vision, fehlenden Bytes, falschem Modus.
Cloud-Bildweg nicht am echten Anbieter geprüft.
Schritt 4 gebaut (uncommittet): `main/ocr/localOcr.ts` als einziger Einstieg (Modell aus
ui-settings.json, frische Lokal-/Vision-Prüfung je Seite, Vordergrund, Abbruchsignal; Test
verbietet andere Importe von `extractOcrPage`). `visionOcr.ts`: äußeres finally, Signal bis
fetch, Stream ohne `done` = unvollständig (F31). PDF-Knopf nutzt den Einstieg und ignoriert das
Modell aus dem Renderer. Chat: „Stattdessen Text daraus lesen“ an der Bildzeile und „Text aus
dem Bild lesen“ an abgelehnten Bildfragen, Text als „Bild n“ sichtbar im Eingabefeld, abbrechbar.
Beim Prüfen gefunden und behoben: glm-ocr hing auf einer kurzen Seite in Endloszeilen ```
(50 s bis zur Ausgabegrenze, der Wortvergleich sah nichts) — `ocrRepetition.ts` erkennt jetzt
≥ 12 gleiche Zeilen ohne Text am Ende (`OCR_JUNK_RUN`), danach 1,9 s und sauberer Text.
Schritt 5 gebaut (uncommittet): Art `image` (JPEG, PNG; WebP/HEIC bewusst nicht, `nativeImage`
öffnet sie nicht verlässlich). `main/ocr/agentOcr.ts`: Lauf-Zustand (Einstellungen beim Start,
40 Bilder/Seiten, Zwischenspeicher je sha256), Verkleinern auf 1600 px über `nativeImage`.
**`nativeImage` wendet die EXIF-Drehung nicht an** (gemessen) — `shared/imageOrientation.ts`
liest den Tag und dreht die Pixel selbst (getestet, alle 8 Fälle). Lauf-Kontext geht an
`read_attachment`, `read_context_file` und `folder_digest`; ohne ihn (Notiz-Chat) „nur im
Agent-Auftrag lesbar“. Systemtext nennt Bilder samt Prüfhinweis bzw. „nicht eingerichtet“,
Manifest markiert Bilder, Datenwege-Karte nennt erkannten Bildtext. Echter Lauf (qwen3.8:27b-mlx,
Foto mit Pixeln hochkant + Orientation 6): Nummer und Betrag richtig, Ergebnis mit Prüfhinweis.
Schritt 6 gebaut (uncommittet): Prototyp verstecktes Fenster bestanden (gemischte Test-PDF:
erste Seite 0,34 s inkl. Fensterstart, danach 35–63 ms je Seite, Fenster ~140–200 MB, schließt
nach 60 s Leerlauf) → 4a in 1.2. `extractPdfText` liefert Seiten mit Bildangabe (Operatorliste),
rastert Seiten ohne Text mit Bild und erkennt sie über `ocrForAgent` (Budget/Cache des Laufs);
`assemblePdfPages` führt Abdeckung (erkannt, fehlgeschlagen, Budget, leer, ungelesen, Bilder auf
Textseiten) und wirft erst, wenn nach der Erkennung kein Text da ist (F29). Echter Lauf
(qwen3.8:27b-mlx): gemischte PDF Seite 2 und reine Scan-PDF gelesen, Liste korrekt, zweite
Erkennung aus dem Zwischenspeicher. Offen vor Release: Prüfset 12 Bilder, Cloud-Bildweg am
echten Anbieter, Codex-Nachprüfung von Rev. 7.

Rev. 6, 02.11.2026: Bilder (3a, 3b, 4a, 4b, Punkt 19) vor Teil 1, Ziel Release 1.2. Codex-Runde 4 zu Teil 4, Punkt 19 und Rev. 6.

Rev. 5a, 02.11.2026: Punkt 13a (gemischte PDFs) ergänzt, Stufe 1 gebaut (uncommittet).

Rev. 5, 02.11.2026: Teil 4 (Agent liest Scans und Bilder) aufgenommen, mit Weg A (lokale
Texterkennung, Punkt 13–17), Weg B (Seitenbild für Vision-Modelle, Punkt 18) und dem Cloud-Bildweg
für Chat und Agent (Punkt 19). Noch ungeprüft. Reihenfolge entschieden: Teil 1 zuerst, Teil 4
nicht vorgezogen. Offen: Codex-Runde zu Punkt 13–19.

Rev. 4, 01.11.2026. Im Code behoben (uncommittet): F02, F03, F06, F16, F18 (Anzeige), F21,
F23, F24, F25. Prüfrunden beendet (Nutzerentscheidung). Nächster Schritt: Teil 1 —
Main-geführtes Gespräch, Datenvertrag, Speichern.
