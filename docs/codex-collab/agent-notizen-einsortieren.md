# Agent: Notizen finden und einsortieren (Vorschlag, noch nichts gebaut)

## Aufgabe

Prüfung eines **Plans** — es gibt noch keinen Code. Bitte gegen den echten Code prüfen, ob der
Plan trägt, wo er Lücken hat und welche Annahmen falsch sind. Kein Code-Edit, kein Commit, kein Push.

### Anlass (25.11.2026, echter Lauf)

Auftrag des Nutzers im Agent-Tab: „Suche mir alle Notizen heraus, die mit dem Thema künstliche
Intelligenz zu tun haben, erstelle dafür einen eigenen Ordner und lege diese in den Ordner.“
Lokal, `qwen3.8:27b-mlx`, 65 536 Token, Shell eingeschaltet, ein Ordner mit 83 Notizen angehängt.

Ergebnis: nach 31 Minuten vom Nutzer abgebrochen, kein Ergebnis, Runde 7 von 20.
- 15 Suchaufrufe (`note_search`, `vault_search`) über den ganzen Vault, je mit Auszügen im Kontext.
- 27,9 Minuten Modellzeit in 7 Aufrufen, davon 76 % Einlesen des Prompts (14 000–32 000 Token je
  Runde, kein einziger Zwischenspeicher-Treffer), 23 % Schreiben.
- Der Agent hat **kein Werkzeug zum Verschieben**; die Shell schreibt nur im Arbeitsordner. Er
  hätte bestenfalls Kopien als Ergebnisdateien geliefert.
- Einen Pfad mit Emojis im Dateinamen schrieb das Modell falsch ab („MISS“ in der Shell-Probe).
- Im Vault gibt es bereits einen thematisch passenden Ordner; der Agent wusste davon nichts.

Bemerkung des Nutzers: Ein Kommandozeilen-Agent mit Dateiwerkzeugen hätte denselben Auftrag
schnell erledigt. Das stimmt, und der Grund ist lehrreich: Er sucht mit EINEM Aufruf über alle
Dateien und bekommt nur Pfade zurück, legt den Ordner an und verschiebt — drei, vier Runden, ohne
dass je ein Notizinhalt durch den Kontext läuft. Genau diese Arbeitsweise fehlt dem Notiz-Agenten.

### Ziel

Der Agent soll Aufträge der Art „finde alle Notizen zu X und lege sie nach Y“ in wenigen Runden
erledigen können — mit Werkzeugen, die wie Dateiwerkzeuge arbeiten, aber mit den Grenzen der App:
nichts verlässt den Vault, **nichts wird ohne Klick des Nutzers verschoben**, alles ist
rückholbar.

## Vorschlag (Rev. 2, nach Codex F01–F17)

Rev. 1 wollte den Verschiebe-Plan auf dem Verschieben der Seitenleiste aufbauen. Die Prüfung hat
gezeigt, dass dieses Verschieben selbst brüchig ist (F01–F06, F09) und der vorhandene Befehl für
einen geprüften Plan ungeeignet (F08). Rev. 2 teilt deshalb in drei Stufen; jede ist für sich
nützlich, und keine setzt eine ungeprüfte Annahme der nächsten voraus.

### Grundsätze (unverändert)

1. Werkzeuge im bestehenden Loop statt eines Sonderwegs. Das Modell steuert, die App setzt Grenzen.
2. Inhalte laufen nicht durch den Kontext: Die App hält eine **Notizmenge** am Lauf, das Modell
   sieht Zahl, Kurzzeilen und eine Kennung.
3. Das Modell tippt keine Pfade ab, es nennt Nummern der Notizmenge.
4. Am Vault ändert sich nichts ohne Klick des Nutzers.

### Stufe 1 — Finden und sammeln (kein Verschieben)

**Werkzeug `find_notes`** (liest nur):
- Parameter: `terms` (Suchwörter, eines genügt), optional `scope`, optional `from_set` mit `drop`
  (Nummern) oder `keep_only` (Suchwörter).
- **Umfang (F10, E1):** `scope: attached` ist Standard, sobald ein Ordner anhängt. `scope: vault`
  ist nur möglich, wenn der Nutzer es für den Lauf freigegeben hat — die Auftragskarte zeigt vor
  dem Start, dass Titel und Fundstellen aus dem ganzen Vault ans Modell gehen können, mit Empfänger
  bei Cloud und ungeprüftem Weg. Ohne Anhang und ohne Freigabe antwortet das Werkzeug mit einer
  Ablehnung, die den Weg nennt (Ordner anhängen oder „ganzer Vault“ freigeben).
- **Suche (F11):** Der Durchlauf über die `.md`-Dateien wird aus `telegram/vaultQueries.ts`
  (`searchVault`) herausgelöst und für Mengen neu spezifiziert: Felder Dateiname, Frontmatter-Titel,
  H1, Text; Treffer als vollständige Menge statt Top-N; stabile Sortierung (Feldgewicht, dann
  Pfad); Abbruchsignal; `note_search` bleibt unverändert.
- **Vollständigkeit (F12):** Keine Dateiobergrenze unterhalb des Vaults — entweder wird alles im
  gewählten Umfang gelesen, oder die Menge trägt das Kennzeichen „unvollständig“ mit Grund
  (Abbruch, Zeitgrenze, unlesbare Dateien). Eine unvollständige Menge darf in Stufe 3 nicht
  verschoben werden. Laufzeit und Lesekosten bei 5 000 Notizen werden vor dem Bau gemessen.
- **`meaning` entfällt in Stufe 1.** Die Bedeutungssuche liefert höchstens acht Treffer und kann
  „alle“ nicht leisten; sinngemäße Treffer ohne Stichwort sind die bekannte Lücke dieser Stufe und
  stehen als solche im Ergebnis.
- **Rückgabe:** Kennung, Gesamtzahl, Vollständigkeit, je Notiz eine Zeile (`n17 · Titel · Ordner ·
  Fundstelle bis 100 Zeichen`), höchstens 120 Zeilen; jede Zeile außerhalb des Anhangs ist als
  solche markiert (wie heute bei `note_search`). Sind es mehr als 120, sagt die Rückgabe, dass das
  Modell den Rest nicht gesehen hat. Dazu die Ordner mit den meisten Treffern.
- **Nummern (F12):** Nummern gelten je Menge und ändern sich nie; `from_set` erzeugt eine NEUE
  Menge mit denselben Nummern für die verbliebenen Notizen. So bleibt „n17“ über Verfeinerungen
  dieselbe Notiz.
- **Lebensdauer (F14):** Notizmengen hängen am Lauf (Sender + Vault), werden wie Datensätze in den
  Fortsetzungszustand übernommen und verfallen mit ihm. Vor jeder Verwendung prüft die App, dass
  die Datei noch am selben Pfad liegt; fehlende Einträge werden genannt, nicht still ausgelassen.

**Ergebnis der Stufe 1: eine Sammelnotiz.** Neues Schreibwerkzeug `write_note_list`: Parameter
`set`, `file_name`, `title`, optional `intro` (ein Absatz), optional `drop`. Die App schreibt die
Notiz selbst aus der Menge — eine Zeile je Notiz mit Wikilink und Fundstelle, gruppiert nach
Ordner. Das Modell erzeugt keine Liste von Hand (keine abgetippten Pfade, kaum Ausgabe-Token). Die
Notiz ist eine gewöhnliche Ergebnisdatei im bestehenden Ablauf (Karte, Vorschau, Übernehmen).
Wikilinks werden so geschrieben, dass sie bei Namensdoppeln eindeutig bleiben (mit Ordnerpfad nur,
wenn nötig) — und sind damit selbst pfadgebunden, siehe Stufe 2.

Zielbild Stufe 1: `find_notes` → optional verfeinern → `write_note_list` → Abschlusstext. Drei bis
vier Runden, ohne Shell.

### Rev. 3 — Festlegungen für Stufe 1 nach Codex F18–F38 (gelten vor dem Text oben)

- **Umfang nur angehängte Ordner IM Vault** (F18, F33): `scope: vault` entfällt in Stufe 1 ganz —
  damit braucht es keine neue Freigabe und keinen neuen Datenweg. Ordner von außerhalb des Vaults
  werden nicht durchsucht (keine Vault-Pfade, keine Verweise); hängt nur ein solcher an, lehnt das
  Werkzeug mit dem Weg ab. Der ganze Vault bleibt eine offene Entscheidung (E1).
- **Grenzen des Durchlaufs** (F19): je Datei höchstens 2 MB (größere werden gezählt und genannt),
  Gesamtzeit begrenzt, Abbruchsignal zwischen den Dateien, Verknüpfungen werden nicht verfolgt.
  „Vollständig“ heißt: Durchlauf beendet und keine Datei übersprungen.
- **Werkzeugklasse** (F20): `find_notes` begrenzt seine Antwort selbst und wird wie `collect_table`
  nie nachträglich verworfen (`LOCK_ONLY_TOOLS`).
- **Verweise** (F21): Die Sammelnotiz verlinkt immer mit vollem vault-relativem Pfad und Titel als
  Anzeigetext — eindeutig ohne Blick auf den ganzen Vault. Enthält der Pfad Zeichen, die einen
  Wikilink zerbrechen (`| # ^ [ ]`), steht die Notiz als Klartextpfad mit Grund in einem eigenen
  Abschnitt. Preis: Diese Verweise hängen am Ordnerpfad und brechen beim Verschieben (Stufe 2).
- **Veraltete Mengen** (F22): Je Eintrag wird der Inhalts-Hash gemerkt. `write_note_list` liest
  jede Datei neu; fehlt sie oder passt sie nach einer Änderung nicht mehr zu den Suchwörtern,
  steht sie in einem Abschnitt „Seit der Suche geändert“ statt in der Liste.
- **Web-Lauf und Lese-Abdeckung** (F23): Beide Werkzeuge gibt es nicht in Web-Läufen.
  `write_note_list` ist von der Lese-Rückfrage ausgenommen — die Sammelnotiz behauptet nicht, die
  Notizen gelesen zu haben, sie nennt Fundstellen.
- **Große Sammelnotiz** (F34): Die Karte nennt Zahl der Notizen und Ordner; reicht die Vorschau
  nicht bis zum Ende, sagt sie das.
- **Ein Markdown-Ergebnis** (F38): `write_note_list` lehnt ab, wenn der Lauf schon eine
  Markdown-Datei erzeugt hat, und umgekehrt zählt sie als die Markdown-Datei des Laufs.
- **Kurze Suchwörter**: Wörter bis drei Zeichen („KI“) treffen nur als ganzes Wort; in
  Großbuchstaben geschriebene nur in dieser Schreibweise. Sonst träfe „KI“ jedes „Kind“.

### Stufe 2 — Verschieben in der App richtig machen (ohne Agent)

Voraussetzung für Stufe 3 und für sich ein Gewinn beim Verschieben von Hand.

- **Ein Main-seitiges Sammel-Verschieben** (F04, F08, F17): eigener IPC, nimmt vault-relative
  Quellen und ein Ziel im SELBEN Vault; legt einen neuen Zielordner erst beim Vollzug an (Eltern
  erneut geprüft, leere Neuanlage bei Fehlschlag zurückgenommen); **nie überschreiben** — Ziel wird
  exklusiv belegt, Namensgleichheit ist ein Ergebnis je Datei, kein Dialog; Ergebnis je Datei
  (verschoben / übersprungen mit Grund). Der vorhandene `move-file` bleibt für Einzelfälle der
  Seitenleiste, bis sie auf den neuen Weg umgestellt ist.
- **Eine Alt→Neu-Migration im Renderer** (F01–F03): ein Schritt, der nach dem Sammel-Verschieben
  alle pfad- oder ID-gebundenen Zustände nachführt — Notizliste, beide Auswahlen,
  Navigationshistorie, Tabs (Editor und Canvas), Graph-Positionen und Kanten, Lesezeichen,
  Erinnerungen, Projektstatus-Entwürfe; das Kontextgedächtnis bekommt ein Umzugsereignis statt
  umgeschriebener Geschichte. Nur für tatsächlich verschobene Einträge. Watcher-Ereignisse der
  Serie werden mit der Migration abgestimmt (kein `unlink`/`add` als „gelöscht + neu“).
- **Verweise** (F05): Vor dem Vollzug werden eingehende Wikilinks MIT Ordnerpfad auf die
  betroffenen Notizen gesucht. Die Vorschau nennt sie; beim Vollzug werden sie umgeschrieben (über
  den Schreibweg mit Sicherung). Titelbasierte Verweise bleiben unberührt.
- **Einbettungen** (F06): Vor dem Vollzug wird je Notiz geprüft, ob relative Bild-/PDF-Verweise
  am neuen Ort noch dieselbe Datei treffen. Tun sie es nicht, wird die Notiz in der Vorschau
  markiert und standardmäßig NICHT verschoben; Umschreiben der Verweise ist eine spätere Ausbaustufe.
- **Offene Notizen** (F09): Je Datei Identität und Inhalts-Hash beim Planen festhalten, beim
  Vollzug erneut prüfen; eine im Editor offene Notiz mit ungespeicherten Änderungen wird erst
  gespeichert oder ausgesetzt. Nach dem Verschieben darf kein Speicherlauf den alten Pfad neu
  anlegen — der Editor wechselt über die Migration auf den neuen Pfad.
- **Sync** (F07): Das Sammel-Verschieben läuft als eine Einheit; währenddessen startet kein
  automatischer Sync, danach genau einer. Tests: 50 unveränderte Dateien, 50 mit einer parallel
  geänderten, Ordner-Verschieben, je auf beiden Seiten.
- **Vault-Index** (F16): nach der Serie gezielt einen Abgleich anstoßen; bis er fertig ist,
  werden Treffer gegen die aktuelle Datei geprüft (das tut `verifyHits` bereits).
- **Rückgängig:** derselbe Weg rückwärts, mit denselben Prüfungen (Datei unverändert am neuen Ort,
  alter Platz frei).

### Stufe 3 — Verschiebe-Plan des Agenten

Erst nach Stufe 2.

- **`propose_move`**: Parameter `set`, `target_folder`, optional `only`/`except` (Nummern),
  `reason`. Nur für vollständige Mengen.
- **Eigener Ergebnistyp** (F13), keine getarnte Datei: Plan mit eigener Karte, eigenem
  Übernehmen/Verwerfen/Rückgängig, eigener Regel für „Ergebnis des Laufs“ (ein Plan zählt als
  Ergebnis für das Nachfassen im Loop), für die Aufbewahrung offener Karten und für die Zeitbilanz
  (eigene Tätigkeitsart, kein Dateiformat).
- **Bindung an den geprüften Plan** (F08, F09): Der Main erzeugt eine nicht erratbare Plan-Kennung,
  gebunden an Sender, Lauf und Vault, einmal verbrauchbar. Der Renderer schickt beim Vollzug nur
  die Kennung und die Nummern der ABGEWÄHLTEN Einträge — keine Pfade. Ein geändertes Ziel ist eine
  Main-seitige Neuplanung mit neuer Kennung (F17). Beim Vollzug wird alles erneut geprüft und über
  das Sammel-Verschieben aus Stufe 2 ausgeführt.
- **Erlaubte Quellen und Ziele** (F15, E4): Main-seitig getrennt festgelegt und in der Vorschau
  begründet. Vorschlag: nie Quelle oder Ziel sind `.mindgraph`, `Skills`, der Brain-Ordner, der
  Mail-Ordner und alles unter einem ausgeblendeten Ordner; Verknüpfungen werden nicht verfolgt.
  `find_notes` kennzeichnet solche Treffer schon in der Menge als „nicht verschiebbar“, damit
  `propose_move` nicht massenhaft verwirft.
- **Vorhandene Ordner** (E2): Liegen viele Treffer schon in einem Ordner oder gibt es einen
  ähnlich benannten, nennt die Karte ihn als Alternative zum neuen Ordner.

### Bewusst nicht vorgesehen

- Kein freies `move`/`rename`/`mkdir` für das Modell, kein Schreibrecht der Shell im Vault.
- Kein Modellurteil je Notiz in diesen drei Stufen (spätere Ausbaustufe nach dem Muster
  `folder_digest`).
- Keine anderen Mengenänderungen (Tags, Umbenennen, Löschen).

### Offene Entscheidungen des Nutzers

- E1: `scope: vault` als Freigabe je Lauf (Vorschlag oben) — oder dauerhafte Einstellung?
- E2: Soll die Karte vorhandene Ordner aktiv vorschlagen?
- E3: Wie lange bleibt „Rückgängig“ verfügbar?
- E4: Liste der gesperrten Ordner.
- E5: Reihenfolge — Stufe 1 zuerst (schnell, ohne Ordner) oder Stufe 2 zuerst (Ordner, größer)?

### Messplan

- Vor Stufe 1: Laufzeit und Lesekosten eines vollständigen Durchlaufs bei 5 000 Notizen (F11/F12).
- Stufe 1 im Mess-Harness (`noteAgent/eval/`): 60 erzeugte Notizen, 14 zum Thema (3 davon nur
  sinngemäß, ohne Stichwort — die bekannte Lücke), 3 fremde mit beiläufiger Nennung. Gewertet:
  Trefferquote und Fehltreffer der Menge, Vollständigkeit der Sammelnotiz, Rundenzahl, Dauer;
  Vergleich mit heute. Zusätzlich ein Durchlauf mit 600 Notizen, damit die 120-Zeilen-Grenze greift.
- Stufe 2: Tests je betroffenem Zustand (Tabs, Lesezeichen, Graph, Erinnerungen, Verweise,
  Einbettungen), Sync-Tests wie oben.

## Kontext/Anker

- `app/src/main/noteAgent/skills.ts:1062` — `note_search` (Stichwortsuche, wenige Treffer mit
  Auszug; über `telegram/agent/tools/notes.ts:47`)
- `app/src/main/noteAgent/skills.ts:1123` — `vault_search` (Bedeutungssuche über den Vault-Index,
  höchstens 8 Treffer); Regeln in `.claude/rules/vault-rag.md`
- `app/src/main/noteAgent/skills.ts:386` — `registerStagedResult` (wie Ergebnisse heute entstehen:
  Datei im Staging, Karte, Übernahme)
- `app/src/main/noteAgent/runRegistry.ts:41` — Ergebnisarten (`kind`); `:429` `registerDataset`
  (Muster „Daten am Lauf, nicht im Kontext“)
- `app/src/main/noteAgent/ipc.ts:954` — `note-agent-accept-result` (Übernahme einer Karte)
- `app/src/main/index.ts:3319` — IPC `move-file` (Pfadprüfung, Dialog bei Namensgleichheit,
  `fs.rename`, Tagesprotokoll `noteMovedForDayLog`)
- `app/src/renderer/components/Sidebar/FileTree.tsx:1157` — Verschieben in der Seitenleiste:
  nach `moveFile` folgt `updateNotePath(oldNoteId, newPath, newNoteId)` und Neuladen des Baums
- `app/src/main/sync/fileTracker.ts:364` — Löschbremse des Sync (`DELETION_GUARD`, ab 25
  unerklärten Löschungen oder 10 % wird blockiert)
- `app/src/main/noteAgent/loop.ts` — Werkzeugliste, Rundenlogik, „genau ein Write“ im Web-Lauf
- `.claude/rules/note-agent.md` — „Der Agent liest NUR, was angehängt ist“, Ordner-Werkzeuge,
  Datenwege, Lese-Abdeckung

### Fragen an den Prüfer

1. **Verschieben über den Seitenleisten-Weg**: Was hängt außer `updateNotePath` noch am Pfad
   einer Notiz (Graph-Positionen, Lesezeichen, Erinnerungen, Kontextgedächtnis, Vault-Index,
   Flashcards, Projektstatus)? Was bricht bei 50 Verschiebungen in einer Schleife?
2. **Wikilinks und Einbettungen**: Welche Verweise hängen am Ordnerpfad (`[[ordner/notiz]]`,
   relative Bildpfade, PDF-Einbettungen)? Aktualisiert die App sie beim Verschieben?
3. **Sync**: Sehen andere Geräte 50 verschobene Notizen als 50 Löschungen plus 50 neue Dateien,
   und greift dann die Löschbremse? Wie verhält sich das heute beim Verschieben eines Ordners?
4. **Sicherheit**: Der Vollzug kommt als IPC aus dem Renderer. Wie bindet man ihn an genau den
   Plan, den der Main beim Erzeugen geprüft hat (keine frei gewählten Pfade aus dem Renderer,
   erneute Prüfung beim Vollzug, Verknüpfungen, Wettlauf mit dem Editor)?
5. **Datenwege**: `find_notes` liefert Titel und Fundstellen aus dem ganzen Vault ans Modell —
   bei Cloud-Modellen an den Anbieter. Reicht die bestehende Angabe in „Welche Daten wohin gehen“,
   und verträgt sich `scope: vault` mit „Der Agent liest NUR, was angehängt ist“?
6. **Loop**: Passt eine Karte, die keine Datei ist, in `run.results`, in „zwei Ergebnisse pro
   Lauf“, in Folgeläufe, in die Zeitbilanz? Wo bräuchte es Sonderfälle?
7. **Suche**: Gibt es im Main schon eine Volltextsuche über den Vault, die sich wiederverwenden
   lässt (Schnellsuche, Notiz-Cache), statt neu zu lesen? Kosten bei 5 000 Notizen?
8. Was fehlt im Plan?

## Codex-Findings

### F01 — Seitenleisten-Verschieben aktualisiert keine Notiz-Identität vollständig
Schwere: hoch
Stelle: app/src/renderer/stores/notesStore.ts:177
Status: [OFFEN]
`generateNoteId` hasht den Pfad (`app/src/renderer/utils/linkExtractor.ts:190`). `updateNotePath` ersetzt nur `notes` und `selectedNoteId`, nicht `secondarySelectedNoteId`, Navigationshistorie oder Mehrfachauswahl (`notesStore.ts:16`, `:30`, `:34`, `:177-189`). Die Seitenleiste ruft genau diese Aktion nach jedem Move auf (`FileTree.tsx:1157-1165`). Der Plan kann daraus nicht ableiten, dass Notiz-IDs und alle Ansichten nach 50 Moves stimmen. Ein Ordner-Move ist noch schlechter: Für Verzeichnisse wird die Aktion überhaupt nicht aufgerufen (`FileTree.tsx:1162`).
Vorschlag: Eine gebündelte Alt→Neu-Pfad/ID-Migration für alle betroffenen Zustände definieren; Ordner-Moves und Rückgängig mitprüfen.

### F02 — Tabs, Graph und Lesezeichen behalten alte IDs/Pfade
Schwere: hoch
Stelle: app/src/renderer/stores/tabStore.ts:100
Status: [OFFEN]
Editor- und Canvas-Tabs speichern `noteId` (`tabStore.ts:100-139`), Canvas-Erweiterungen ebenfalls (`:376-401`); `updateTabTitle` ändert nur Titel (`:464-475`). Graph-Positionen und manuelle Kanten werden über Node-IDs gehalten, Datei-Anpassungen über Pfade (`graphStore.ts:19-22`, `:117-125`, `:287-315`). Lesezeichen persistieren Notiz-IDs in `localStorage` (`bookmarkStore.ts:15-27`, `:30-59`). Keiner dieser Zustände wird durch den Seitenleisten-Move migriert (`FileTree.tsx:1157-1172`). Nach dem Verschieben zeigen Karten/Bookmarks auf alte Identitäten; Graph-Anordnungen können verloren wirken.
Vorschlag: Vor dem Vollzug Referenzen erfassen und nach erfolgreichem Move gesammelt migrieren; bei teilweisem Erfolg nur tatsächlich verschobene Einträge.

### F03 — Erinnerungen, Kontextgedächtnis und Projektstatus sind ebenfalls pfadgebunden
Schwere: mittel
Stelle: app/src/renderer/stores/reminderStore.ts:18
Status: [OFFEN]
Erinnerungs-IDs enthalten die Notiz-ID (`reminderStore.ts:18-20`, `:77-99`); ein Move erzeugt damit eine neue Kennung und kann bereits gemeldete fällige Tasks erneut melden. Der laufende Intervall hält ein `notes`-Snapshot, bis `App.tsx:749-760` ihn nach dem Store-Update neu startet. Kontext-Ereignisse speichern alte `noteId`/`notePath` (`contextMemory.ts:11-29`, `:37-45`), während `updateNotePath` kein Umzugsereignis schreibt (`notesStore.ts:177-189`). Projektstatus-Entwürfe merken `notePath` (`projectStatusStore.ts:141-144`, `:289`). Für diese Pfade/IDs und die Tagesprotokollierung (`main/index.ts:2400-2407`) fehlt ein Konsistenzvertrag, auch beim Undo.

### F04 — 50 Einzel-Updates und Watcher-Ereignisse sind kein atomarer Batch
Schwere: hoch
Stelle: app/src/renderer/components/Sidebar/FileTree.tsx:1144
Status: [OFFEN]
Die Seitenleiste ruft `moveFile` seriell je Eintrag auf und setzt danach je Notiz `updateNotePath`; erst am Schluss lädt sie den Baum neu (`FileTree.tsx:1144-1172`). Jedes `updateNotePath` berechnet Backlinks über den gesamten Notizbestand neu (`notesStore.ts:177-188`, `:343-370`). Zugleich meldet Chokidar `add`/`unlink` an den Renderer (`main/index.ts:7758-7779`), dessen Handler bei `unlink` die alte Notiz entfernt und bei `add` eine neue hinzufügt (`Sidebar.tsx:81-117`). Reihenfolge und Zwischenzustände sind damit nicht kontrolliert; ein Batch aus 50 ist weder UI-seitig noch dateiseitig atomar.
Vorschlag: Main-seitigen Batch mit per-Datei-Ergebnis und einem Renderer-Abgleich/Migrationsschritt planen; Watcher-Ereignisse währenddessen mit der Migration abstimmen.

### F05 — Pfadbasierte Wikilinks werden beim Move nicht umgeschrieben
Schwere: hoch
Stelle: app/src/renderer/utils/linkExtractor.ts:74
Status: [OFFEN]
`findNoteForWikilink` bevorzugt den exakten vault-relativen Pfad (`linkExtractor.ts:82-94`); die Backlink-Berechnung indiziert ebenfalls den aktuellen Pfad (`notesStore.ts:349-359`). Der Move-Handler tut nur `fs.rename` und Tagesprotokoll (`main/index.ts:3319-3351`), die Seitenleiste nur ID-/Baum-Update (`FileTree.tsx:1157-1172`). `[[alter/ordner/notiz]]` bleibt im Markdown stehen und kann nach dem Verschieben ins Leere oder bei Namensdoppeln auf eine falsche Notiz fallen.
Vorschlag: Alle eingehenden pfadgebundenen Verweise vorab inventarisieren und dem Nutzer die Textänderungen samt Grenzen/Backups anzeigen; alternativ solche Moves explizit als linkbrechend kennzeichnen.

### F06 — Relative Bild- und PDF-Verweise ändern ihre Bedeutung
Schwere: hoch
Stelle: app/src/renderer/components/Editor/MarkdownEditor.tsx:583
Status: [OFFEN]
Bilder werden zuerst relativ zum Ordner der Notiz gesucht, erst danach per eindeutiger Vault-Suche (`MarkdownEditor.tsx:583-601`). PDFs nutzen dieselbe ordnerbezogene Kandidatenfolge und danach eine Vault-Suche (`:4365-4399`). Wird nur die `.md` verschoben, zeigen `![](bild.png)`, `![[bild.png]]` und PDF-Einbettungen mit relativen Pfaden möglicherweise nicht mehr auf dasselbe Asset. Bei Namensdoppeln hilft der Fallback nicht zuverlässig. Der bestehende Move schreibt keine Markdown-Verweise um (`main/index.ts:3319-3351`).
Vorschlag: Abhängigkeiten vorab auflösen; benötigte Verweise relativ zum neuen Ort umschreiben oder betroffene Notizen aus dem Batch ausschließen.

### F07 — Sync-Bremse erkennt unveränderte Moves, aber nicht jeden Zwischenzustand
Schwere: mittel
Stelle: app/src/main/sync/fileTracker.ts:396
Status: [OFFEN]
Die Frage nach „50 Löschungen“ ist pauschal falsch: `assessDeletions` rechnet gleiche Inhalts-Hashes bei gegenläufigen Transfers als Rename/Move heraus (`fileTracker.ts:411-506`); der Sync nutzt das für beide Richtungen (`syncEngine.ts:875-924`). Das gilt auch für einen verschobenen Ordner, sofern die Dateien unverändert und im selben Diff sichtbar sind. Der Plan nennt aber weder Batch-/Sync-Koordination noch den Fall, dass Auto-Sync oder ein Editor-Write zwischen einzelnen Moves einen Teilstand sieht: `move-file` protokolliert nur einen einzelnen Rename (`main/index.ts:3319-3351`), der Watcher schiebt neue Dateien einzeln an den Sync (`:7781-7792`). Bei fehlenden Gegen-Hashes greift die Bremse ab 25 oder über 10 % (`fileTracker.ts:372-377`, `:494-503`).
Vorschlag: Batch und Sync-Zeitpunkt festlegen; Testfälle für unveränderte/parallel geänderte 50 Dateien und Ordner-Move auf beiden Geräten aufnehmen.

### F08 — Plan-Vollzug darf den freien `move-file`-IPC nicht benutzen
Schwere: kritisch
Stelle: app/src/main/index.ts:3319
Status: [OFFEN]
`move-file` akzeptiert frei übergebene absolute Quelle und Zielordner, prüft beide nur gegen *irgendeinen* erlaubten Vault und bietet bei Kollision sogar Überschreiben an (`main/index.ts:3321-3348`). Das erfüllt weder „genau geprüfter Plan“ noch „kein Überschreiben“. Die Prüfung und `fs.rename` sind zudem getrennt (`:3328-3348`), ein Ziel kann dazwischen entstehen. Der bestehende Agent-Accept ist dagegen an Sender, Lauf und `resultId` gebunden (`noteAgent/ipc.ts:954-959`, `runRegistry.ts:439-455`).
Vorschlag: Eigenen Main-IPC mit opaker Plan-ID, Sender-/Vault-Bindung und einmaligem Verbrauch bauen. Beim Vollzug jede ausgewählte Quelle/Zielidentität und Ausschlüsse neu prüfen, gleiches Vault erzwingen und Ziel exklusiv/no-replace reservieren; Renderer übermittelt nur IDs der abgewählten Einträge, keine Pfade.

### F09 — Geprüfte Pfade können vor dem Vollzug wechseln; Editor kann nach dem Move zurückschreiben
Schwere: hoch
Stelle: app/src/main/index.ts:1472
Status: [OFFEN]
`assertSafePath` kanonisiert vorhandene Vorfahren zum Prüfzeitpunkt (`main/index.ts:1472-1499`), schützt aber allein nicht vor einem danach ausgetauschten Symlink/Dateiinhalt. Das Agent-Accept prüft den festgeschriebenen Zielordner unmittelbar vor dem Schreiben erneut (`noteAgent/ipc.ts:964-973`). Der Editor speichert über `selectedNote.path` (`MarkdownEditor.tsx:1627-1640`); während einer Vorschau kann der Inhalt geändert werden, nach einem Move kann ein noch offener Autosave den alten Pfad neu erzeugen. „Unverändert“ für Undo braucht daher mehr als den Dateinamen.
Vorschlag: Beim Planen Datei-Identität/Hash/mtime erfassen, beim Vollzug und Undo erneut prüfen, aktive Editor-Speicherläufe koordinieren und bei Abweichung pro Datei sichtbar aussetzen.

### F10 — Datenweg-Hinweis und Umfang müssen konkretisiert werden
Schwere: hoch
Stelle: app/src/renderer/utils/i18n/agentCard.ts:100
Status: [OFFEN]
Der heutige Hinweis nennt „gelesene Vault-Notizen und Suchauszüge“ sowie Ordnerauswertung angehängter Dateien (`agentCard.ts:100`); `find_notes` würde bis zu 120 Titel/Ordner/Fundstellen aus dem ganzen Vault pro Aufruf an dasselbe Modell geben. Die bestehende Vault-Suche liefert höchstens acht Treffer (`noteAgent/skills.ts:1123-1143`), `note_search` höchstens 20 (`telegram/agent/tools/notes.ts:61-76`). Der Systemprompt erlaubt zwar bereits vaultweite Notizsuche, markiert Treffer außerhalb des Anhangs (`noteAgent/loop.ts:139`, `skills.ts:1069-1078`); die Regeldatei behauptet gleichzeitig „liest NUR, was angehängt ist“ (`.claude/rules/note-agent.md:29`). Der neue Standard `scope: vault` ohne Anhang und eine große Trefferliste verschärfen diesen Widerspruch.
Vorschlag: Umfang und maximale Metadatenmenge vor Start sichtbar machen; Außen-Anhang-Markierung für jede Fundstelle beibehalten und Datenwegtext anpassen, insbesondere für Cloud/ungeprüften Modellweg.

### F11 — Wiederverwendbare Main-Suche existiert, erfüllt den Mengenvertrag aber nicht
Schwere: mittel
Stelle: app/src/main/telegram/vaultQueries.ts:118
Status: [OFFEN]
`searchVault` läuft im Main durch alle `.md`, liest sie und sucht Keywords im Dateiinhalt (`vaultQueries.ts:120-168`); der Agent nutzt es bereits über `note_search` (`telegram/agent/tools/notes.ts:46-78`). H1 und Frontmatter werden dabei als Inhalt mitgesucht, aber nicht als eigene Felder gewichtet; ein Treffer nur im Dateinamen fehlt. Die Funktion liefert nur Top-N samt langen Auszügen und hat keine `from_set`-Semantik. Eine zweite Main-Suche für Workflows liest ebenfalls Dateien, aber kappt bei 3 000 Dateien und zehn Ergebnissen (`main/index.ts:2636-2638`, `:2701-2734`). Die Schnellsuche nutzt den Renderer-Notizcache (`QuickSearch.tsx:41-52`), der für einen Main-seitig geprüften Plan keine autoritative Quelle ist.
Vorschlag: Den bestehenden Traversierungs-/Suchcode gezielt extrahieren, aber Treffer-Menge, Felder, Ausschlüsse, stabile Sortierung, Abbruch und sichtbare Grenzen neu spezifizieren; für 5 000 Notizen Laufzeit/I/O messen.

### F12 — `meaning` und Mengen-Obergrenzen tragen das Zielbild noch nicht
Schwere: mittel
Stelle: app/src/main/noteAgent/skills.ts:1123
Status: [OFFEN]
Der abfragbare Vault-Index liefert derzeit höchstens acht semantische Treffer je `vault_search` (`skills.ts:1123-1143`); das ist keine vollständige Menge aller sinngemäßen Notizen. Der Plan setzt für `find_notes` 2 000 gescannte Dateien und 400 Treffer an, das Messszenario prüft aber nur 60 Dateien. Bei 5 000 Notizen wäre „alle“ schon per Definition unvollständig. Außerdem kann eine auf 120 Modellzeilen gekürzte Menge 400 Einträge enthalten, die das Modell nicht einzeln prüfen kann. `from_set` muss festlegen, ob Nummern unveränderlich bleiben, wie eine neue Menge nummeriert wird und ob eine nur teilweise sichtbare Menge vorgeschlagen werden darf.
Vorschlag: Unvollständige Scans und semantische Top-K-Treffer als solche kennzeichnen; für „alle“ entweder vollständige Abdeckung erzwingen oder den Move bei Kappung sperren.

### F13 — Nicht-Datei-Karte passt nicht in den bestehenden Ergebnis-Lebenszyklus
Schwere: hoch
Stelle: app/src/main/noteAgent/runRegistry.ts:37
Status: [OFFEN]
`AgentResultEntry` verlangt `stagingPath`, Dateiname und eine Datei-`kind` (`runRegistry.ts:37-54`); `registerStagedResult` schreibt tatsächlich eine Staging-Datei (`skills.ts:386-408`). Accept kopiert/schreibt diese Datei in den festen Lauf-Zielordner (`noteAgent/ipc.ts:964-1023`), Discard/Preview und die UI erwarten Dateikarten (`AgentRunPanel.tsx:336-405`). Ein Move-Plan braucht dagegen Zielordnerwechsel, Einzelauswahl, Teilfehler und Undo. `run.results.size` steuert zudem Erfolg/Schreib-Nachfassen im Loop (`loop.ts:584`, `:648-661`, `:717-724`), offene Karten steuern Retention (`runRegistry.ts:185-202`), Accept zeichnet Datei-Format in der Zeitbilanz auf (`noteAgent/ipc.ts:1001-1019`). „Zwei Ergebnisse pro Lauf“ steht in der Regeldatei (`.claude/rules/note-agent.md:31`), wird durch eine dritte Plan-Art aber nicht automatisch korrekt abgebildet.
Vorschlag: Plan als eigenen Ergebnistyp mit eigenem Accept/Discard/Undo und expliziter Loop-/Bilanz-/Retention-Semantik entwerfen; nicht als `md`-Staging-Datei tarnen.

### F14 — Notizmengen überleben Folgeläufe derzeit nicht
Schwere: mittel
Stelle: app/src/main/noteAgent/runRegistry.ts:327
Status: [OFFEN]
`registerDataset` speichert Tabellen am Lauf (`runRegistry.ts:429-436`), und `finishRun` übernimmt gerade diese Datensätze in den Fortsetzungszustand (`:327-346`). Für geplante Notizmengen gibt es dort weder Feld noch Kopier-/Ablaufregel. Der Folgelauf holt den alten Zustand vor `startRun` (`noteAgent/ipc.ts:385-397`); ein `from_set` aus einem vorigen Lauf wäre ohne eigene Fortsetzungslogik unbekannt. Zugleich können Karten nach Retention verschwinden (`runRegistry.ts:185-202`).
Vorschlag: Lebensdauer und Vault-/Sender-Bindung der Mengen einschließlich Folgelauf, Abbruch, Vault-Wechsel und Stale-Dateien festlegen.

### F15 — Ausschlüsse und Zielordner sind noch keine prüfbare Policy
Schwere: hoch
Stelle: app/src/main/noteAgent/loop.ts:243
Status: [OFFEN]
Der Agent darf heute per `note_search`/`note_read` den Vault durchsuchen und der Prompt nennt Brain ausdrücklich als Informationsquelle (`loop.ts:243-250`). Der Plan will Brain, `Skills` und Mail-Ordner womöglich vom *Verschieben* ausschließen, lässt die Liste aber offen. Damit kann `find_notes` Treffer liefern, die `propose_move` später massenhaft verwirft; schlimmer ist ein vom Modell gewählter Zielordner in einem geschützten Bereich. `assertSafePath` prüft nur erlaubte Vault-Wurzeln, keine fachlichen Verzeichnisse (`main/index.ts:1472-1499`).
Vorschlag: Quell- und Zielpolicy Main-seitig getrennt festlegen, auch für verschachtelte Ordner, Symlinks und bereits vorhandene thematische Ordner; abgelehnte Treffer und Gründe in der Vorschau zeigen.

### F16 — Vault-Index muss nach der Serie konsistent nachziehen
Schwere: mittel
Stelle: app/src/main/index.ts:7764
Status: [OFFEN]
Der Vault-Index hängt am Chokidar-Watcher und bekommt `add`/`unlink` je Datei (`main/index.ts:7764-7779`, `rag/vaultRagManager.ts:470-491`). Seine Warteschlange wird verzögert abgearbeitet; der Abgleich hasht Dateien und startet bei Änderungen einen inkrementellen Indexlauf (`vaultRagManager.ts:572-636`). Ein Move ändert den Index-Schlüssel von altem zu neuem Pfad, auch wenn der Inhalt identisch bleibt; zwischen Vollzug und abgeschlossenem Indexlauf kann `meaning` also alte Pfade liefern. Der Plan beschreibt weder diesen Zwischenzustand noch eine Abschluss-/Fehlermeldung für die Karte.
Vorschlag: Nach dem Batch einen Index-Abgleich gezielt anstoßen und den Status sichtbar halten; Suchergebnisse vor `propose_move` und beim Accept stets gegen die aktuelle Datei prüfen.

### F17 — „Neuer Zielordner“ ist im vorhandenen Move-Weg nicht enthalten
Schwere: mittel
Stelle: app/src/main/index.ts:3322
Status: [OFFEN]
`move-file` erwartet einen vorhandenen Zielordner (`main/index.ts:3322-3326`, `:3348`); die Seitenleiste wählt vorhandene Ordner aus dem Dateibaum (`FileTree.tsx:1183-1190`). Der Plan erlaubt `target_folder` „neu oder vorhanden“ und eine spätere Änderung der Ordnerauswahl, spezifiziert aber weder die Main-seitige Anlage noch deren Sicherheits-/Kollisionsprüfung, Aufräumen bei null verschobenen Notizen oder die Bindung eines geänderten Ziels an einen neu geprüften Plan.
Vorschlag: Zielwechsel als Main-seitige Neuplanung behandeln und neue Ordner erst beim Vollzug unter erneut geprüften Eltern anlegen; leere Neuanlagen bei Fehlschlag zurücknehmen.

### F18 — Vault-Freigabe ist noch kein Main-seitiger Laufzustand (F10)
Schwere: hoch
Stelle: app/src/main/noteAgent/ipc.ts:245
Status: [OFFEN]
Rev. 2 nennt einen sichtbaren Schalter „ganzer Vault“, aber nicht, wo die Zustimmung vertrauenswürdig entsteht und geprüft wird. Der aktuelle Start-IPC nimmt Laufparameter aus dem Renderer (`ipc.ts:245-275`), bindet in `startRun` nur Anhänge und Vault an den Lauf (`:661-681`). Bei der Cloud-Zustimmung liest der Main dagegen selbst Einstellungen und prüft sie beim Start erneut (`:283-298`, `:499-504`). Ein bloßes `scope: vault`-Flag aus dem Renderer wäre keine Freigabe; `find_notes` könnte alle Titel und Fundstellen an ein Cloud-Modell senden. 
Vorschlag: Freigabe Main-seitig beim Laufstart prüfen/erzeugen, als unveränderlichen Umfang am `AgentRun` speichern und im Werkzeug gegen diesen Wert prüfen; für Folgeläufe die Freigabe ausdrücklich neu festlegen.

### F19 — Unbegrenzter Scan braucht Byte-, Zeit- und Abbruchgrenzen (F12)
Schwere: hoch
Stelle: app/src/main/telegram/vaultQueries.ts:19
Status: [OFFEN]
Rev. 2 streicht die Dateiobergrenze, nennt aber nur einen späteren Messlauf. Der wiederverwendete Main-Pfad läuft rekursiv und seriell durch alle Dateien (`vaultQueries.ts:19-37`) und liest jede Trefferkandidatin ohne Größenlimit vollständig als UTF-8 (`:40-45`, `:132-159`). Ein einzelnes sehr großes `.md`, ein langsames Laufwerk oder 5 000 Dateien kann den Agenten lange vor der Modellrunde beschäftigen. „Unvollständig bei Zeitgrenze“ hilft nur, wenn Traverse, Lesen und Auswertung tatsächlich abbrechbar und pro Datei begrenzt sind.
Vorschlag: Byte- und Zeitbudget je Datei und Gesamtauftrag, prüfbares Abbruchsignal zwischen Einträgen, begrenzte Parallelität sowie gezählte Ausfälle definieren; „vollständig“ nur bei abgeschlossenem Scan ohne übersprungene Datei.

### F20 — `find_notes` ist trotz Leselabel ein zustandsänderndes Werkzeug
Schwere: hoch
Stelle: app/src/main/noteAgent/loop.ts:51
Status: [OFFEN]
`find_notes` legt laut Rev. 2 eine Menge am Lauf an. Der Loop behandelt reine Lesewerkzeuge anders als Datensatz-Werkzeuge: Er kann ein zu großes Leseergebnis *nach* dem Aufruf durch einen Fehlertext ersetzen (`loop.ts:51-64`, `:855-887`). Dann existiert die Menge, aber das Modell sieht ihre Kennung nicht. `collect_table` wird wegen derselben Nebenwirkung nur vor dem Aufruf gesperrt (`:60-64`, `:821-825`).
Vorschlag: `find_notes` mit `LOCK_ONLY_TOOLS`-Semantik und von vornherein begrenzter Antwort behandeln oder die Menge erst nach erfolgreicher Budgetprüfung registrieren. Fehler, Abbruch und Wiederholung müssen alte Mengen gezielt entsorgen.

### F21 — Sammelnotiz kann nicht jede Notiz als gültigen eindeutigen Wikilink schreiben
Schwere: hoch
Stelle: app/src/shared/fileLinkTarget.ts:5
Status: [OFFEN]
Rev. 2 verspricht eindeutige Links „mit Ordnerpfad nur, wenn nötig“. Der vorhandene Linkziel-Helfer prüft Eindeutigkeit gegen *Dateinamen und H1-Titel aller Notizen* (`fileLinkTarget.ts:5-10`, `:90-103`), nicht nur gegen Namensdoppel. Er verweigert Ziele mit `| # ^ [ ]`, auch wenn das Problem erst im benötigten Ordnerpfad steckt (`:12-15`, `:113-120`). Für solche Dateien ist ein gültiger Wikilink unmöglich; `[[kurzname]]` könnte eine andere Notiz öffnen (`linkExtractor.ts:112-129`). Stufe 1 kann diese Fälle ohne Verschieben erzeugen, also ist sie nicht automatisch fehlerfrei.
Vorschlag: `buildFileLinkTarget` wiederverwenden; nicht verlinkbare Treffer als Klartextpfad mit sichtbarem Grund ausgeben und Vollständigkeit der Sammelnotiz getrennt von Linkbarkeit messen.

### F22 — Mengen werden bei Inhaltsänderung fachlich veraltet (F14)
Schwere: mittel
Stelle: app/src/main/noteAgent/runRegistry.ts:327
Status: [OFFEN]
Rev. 2 prüft vor Nutzung nur, ob eine Datei noch unter demselben Pfad liegt. Eine Notiz kann nach `find_notes` am selben Ort bearbeitet werden und nicht mehr zum Suchbegriff passen; Titel und Fundstelle der Menge bleiben dann alt. Im heutigen Fortsetzungszustand werden Datensätze als Snapshot kopiert (`runRegistry.ts:327-346`, `:378-389`), und ein Folgelauf kann erst später starten (`noteAgent/ipc.ts:385-397`). `write_note_list` würde veraltete Belege als aktuelle Liste schreiben; Stufe 3 könnte auf Basis derselben Menge Verschiebungen vorschlagen.
Vorschlag: Pro Eintrag Inhalts-Hash und Suchbegriff/Suchversion speichern; vor Schreiben oder Vorschlagen geänderte Einträge neu prüfen oder die ganze Menge als veraltet markieren und erneutes `find_notes` verlangen.

### F23 — `write_note_list` kollidiert mit Web-Vertrag und Ordner-Lese-Abdeckung
Schwere: hoch
Stelle: app/src/main/noteAgent/loop.ts:355
Status: [OFFEN]
Rev. 2 sagt nicht, ob die neuen Werkzeuge im Web-Lauf angeboten werden. Dort erlaubt der Loop nur bestimmte Ergebnisformate mit deterministischem Quellenblock und verlangt genau einen Write (`loop.ts:201-211`, `:355-368`); `run.web.wrote` wird bei `write_note` ausdrücklich gesetzt (`skills.ts:2188-2200`). Ein `write_note_list` ohne diese Integration lässt den Web-Lauf nach erfolgreicher Karte weiter schreiben oder als erfolglos enden. Bei angehängtem Ordner und großem lokalem Fenster hält der Loop den ersten Write zurück, bis *alle* Ordnerdateien als gelesen gelten (`loop.ts:490-495`, `:828-852`); eine `find_notes`-Menge zählt bisher nicht in `folderFilesRead` (`runRegistry.ts:300-305`). Der Sammelauftrag kann dadurch wieder in den teuren Einzel-Leseweg geraten.
Vorschlag: Web-Läufe zunächst ausdrücklich ausschließen oder Quellen-/Ein-Write-Vertrag integrieren. Für `write_note_list` eine eigene Lese-Abdeckungsregel festlegen, die Suchtreffer-Abdeckung von vollständig ans Modell gelesenen Dateien trennt.

### F24 — Flashcards und Quiz fehlen in Stufe 2 (F01–F03)
Schwere: hoch
Stelle: app/src/shared/types.ts:338
Status: [OFFEN]
Die Migrationsliste von Rev. 2 nennt beide Lernzustände nicht. `Flashcard.sourceNote` ist ein Quellpfad (`types.ts:338-341`), und der Editor filtert Karten exakt über `note.path` (`renderer/components/Editor/ContextPanel.tsx:252`): nach einem Move verschwinden sie aus dem Kontextpanel, obwohl die Karte fortbesteht. Quiz-Fortschritt ist nach `filePath` indiziert (`renderer/stores/quizStore.ts:29-38`, `:184-224`), laufende Quiz-Konfiguration und Fragen tragen `sourcePath`/`sourceFile` (`types.ts:279-301`, `Quiz/QuizModal.tsx:74-88`). Ein Sammel-Move trennt diese Verknüpfungen.
Vorschlag: Flashcard- und Quiz-Daten samt Persistenz/aktiver Sitzung in die Alt→Neu-Migration und die Rückgängig-Migration aufnehmen.

### F25 — Dataview-Frontmatter ist an alte IDs gebunden
Schwere: mittel
Stelle: app/src/renderer/stores/dataviewStore.ts:65
Status: [OFFEN]
Rev. 2 nennt Dataview nicht. Dessen Index enthält Ordner→Notiz-IDs und Frontmatter pro Notiz-ID (`dataviewStore.ts:17-35`, `:65-106`). Die Sidebar lädt viele Notizen mit leerem `content` und legt ihr Frontmatter deshalb separat unter der *alten* ID ab (`Sidebar.tsx:883-890`). Nach einer Pfad-/ID-Migration nimmt `rebuildIndexes` den alten Cache unverändert mit; für die neue ID kann es bei einem Content-Stub nichts neu parsen (`dataviewStore.ts:65-107`). Das Editor-Effect baut zwar Indizes bei `notes`-Änderung neu und leert dabei Query-Caches (`MarkdownEditor.tsx:1208-1216`, `dataviewStore.ts:124-129`), aber verlorenes Frontmatter rekonstruiert das nicht.
Vorschlag: Dataview-Frontmatter-Cache und Indizes mit der Alt→Neu-Tabelle migrieren oder betroffene Inhalte vor dem Neuaufbau lesen; Ordnerfilter bei Teilfehler/Undo prüfen.

### F26 — Annotationen-Sidecars bleiben am alten Ort zurück
Schwere: hoch
Stelle: app/src/renderer/utils/annotations.ts:129
Status: [OFFEN]
Rev. 2 listet Annotationen nicht. Lese-Annotationen liegen in einer *zweiten* Datei neben der Notiz, abgeleitet aus deren Pfad (`annotations.ts:129-134`). Der Lesen-Modus lädt und bearbeitet ausschließlich diese Sidecar am aktuellen Notizpfad (`MarkdownEditor.tsx:3583-3594`, `:4525-4544`, `:4792-4795`). Wird nur die Quellnotiz verschoben, verschwinden Highlights und neue Annotationen entstehen am neuen Ort; die alte Datei bleibt zurück. Die Sidecar enthält zusätzlich Rücklinks auf den Quellnamen (`annotations.ts:141-156`, `:160-178`).
Vorschlag: Sidecar als abhängige Datei vorab erkennen, gemeinsam mit Quelle behandeln und deren Rücklinks/Frontmatter prüfen; Konflikte oder geschützte Sidecars müssen den Move aussetzen.

### F27 — Ordner-Moves brauchen Konfigurationsmigration oder expliziten Ausschluss
Schwere: hoch
Stelle: app/src/renderer/stores/uiStore.ts:746
Status: [OFFEN]
Rev. 2 testet ausdrücklich „Ordner-Verschieben“, spezifiziert aber nur Notiz-Zustände. Persistierte Einstellungen halten Vault-relative Ordnerpfade für Bilder, neue Notizen, Projekte sowie ein-/ausgeschlossene Task-Ordner (`uiStore.ts:746`, `:768-769`, `:860-863`, `:1444-1449`). Werden diese Ordner oder ein Vorfahr verschoben, zeigen die Einstellungen weiter auf den alten Ort; neue Bilder/Notizen landen gegebenenfalls wieder dort (`MarkdownEditor.tsx:3354-3382`, `uiStore.ts:1537-1548`). Graph-Dateianpassungen sind ebenfalls nach Pfad gespeichert (`graphStore.ts:287-315`).
Vorschlag: Stufe 2 entweder ausdrücklich auf einzelne `.md` beschränken und Ordner-Moves separat planen oder sämtliche konfigurierten Pfadpräfixe migrieren.

### F28 — Tagesprotokoll und Wirkungsbilanz sind keine Renderer-Zustände
Schwere: mittel
Stelle: app/src/main/dayLog.ts:242
Status: [OFFEN]
Die Rev.-2-Migration sitzt ausdrücklich im Renderer. Das bestehende Verschieben schreibt zusätzlich Main-seitig `recordNoteMove` (`main/index.ts:2400-2407`, `:3348-3351`); dieses zieht frühere Tagesprotokoll-Pfade nach und erzeugt bei Einzelnotizen ein Move-Ereignis (`dayLog.ts:242-259`). Der neue Sammel-IPC benutzt `move-file` gerade nicht automatisch. Für Stufe 3 ist eine eigene Zeitbilanzart genannt, doch der heutige Accept verbucht nur angenommene Datei-Ergebnisse mit `format` (`noteAgent/ipc.ts:1001-1019`, `shared/activityLog.ts:141-157`). Ohne Main-seitige Integration erscheinen die Moves im Tagesüberblick und der Agent-Bilanz nicht korrekt.
Vorschlag: Für jeden tatsächlich erfolgreichen Move und Undo Main-seitig Protokoll-/Bilanzereignisse definieren; Teilfehler und verworfene Pläne getrennt halten.

### F29 — Pfad-Verweise schreiben und Verschieben bilden keine sichere Einheit (F05/F09)
Schwere: hoch
Stelle: app/src/main/index.ts:2462
Status: [OFFEN]
Rev. 2 sagt „über den Schreibweg mit Sicherung“, aber nicht, wie ein Batch bei geänderten Quellnotizen, abweichenden Link-Dateien oder Schreibfehlern konsistent bleibt. `writeFileSafe` sichert und schreibt je Markdown-Datei unter einer *dateibezogenen* Sperre (`main/index.ts:2462-2497`); es bietet keinen gemeinsamen Compare-and-Swap/Commit mit `fs.rename` (`:3348-3351`). Scheitert die fünfte Link-Umschreibung nach vier erfolgreichen, zeigt die Vorschau nicht mehr den aktuellen Stand und Undo müsste sowohl Moves als auch die schon umgeschriebenen Dateien zurückführen. Die bloße Existenz von Backups stellt diese Beziehung nicht automatisch her.
Vorschlag: Änderungsplan für alle betroffenen Markdown-Dateien mit Vor-Hashes erstellen; vor jedem Schreiben erneut vergleichen, Teilfehler und Rückweg je Operation journalisieren, nach dem Batch Backlinks neu prüfen. Auto-Heal (`main/index.ts:2471-2475`) und offene Editoren in die Prüfung einbeziehen.

### F30 — Stufe-2-IPC kann den Klickvertrag der Stufe 3 umgehen (F08)
Schwere: kritisch
Stelle: app/src/main/index.ts:3319
Status: [OFFEN]
Rev. 2 baut zuerst einen Sammel-IPC, der vault-relative Quellen und Ziel aus dem Renderer annimmt. Erst *Stufe 3* verlangt eine opake Main-Plan-Kennung. So kann ein kompromittierter Renderer den frei aufrufbaren Stufe-2-IPC direkt verwenden und den behaupteten Klick „nichts wird ohne Klick verschoben“ umgehen; schon `move-file` zeigt das Muster frei übergebener Pfade (`main/index.ts:3319-3326`, `preload.ts:58`). Die Plan-Bindung von `propose_move` schützt nur dessen eigenen Accept, solange daneben ein ungebundener Batch existiert.
Vorschlag: Stufe 2 selbst über eine Main-seitig erzeugte, geprüfte Vorschau/Operation mit einmaliger Kennung vollziehen oder für den Batch eine Main-seitig überprüfbare Nutzerbestätigung verlangen. Erst diese Grenze für Stufe 3 wiederverwenden.

### F31 — `verifyHits` macht verschobene Notizen bis zum Reindex unsichtbar (F16)
Schwere: mittel
Stelle: app/src/main/rag/vaultRetrieve.ts:265
Status: [OFFEN]
Rev. 2 sagt, Indextreffer würden bis zum Abgleich mit `verifyHits` gegen die aktuelle Datei geprüft. Das schützt vor einem *falschen* alten Treffer, findet aber keine neu verschobene Notiz: `verifyHits` liest nur `chunk.fileRel` aus dem alten Index und verwirft fehlende Pfade als stale (`vaultRetrieve.ts:276-297`); `queryVaultIndex` gibt nur die danach verbleibenden Treffer zurück (`:419-427`). „Abgleich anstoßen“ ist zudem nicht „Index aktualisiert“: der Manager startet nach Scan/Hash einen asynchronen inkrementellen Build (`vaultRagManager.ts:607-642`). Semantische Suchergebnisse sind in diesem Intervall unvollständig.
Vorschlag: `meaning`/`vault_search` während des Reindex mit sichtbarem Hinweis auf unvollständige Treffer versehen oder bis zum fertigen Index sperren; Abschluss und Fehler des Builds für die Move-Karte verfolgen.

### F32 — Undo braucht einen vom Lauf unabhängigen, dauerhaften Vollzugsbeleg (F13/F17)
Schwere: hoch
Stelle: app/src/main/noteAgent/runRegistry.ts:439
Status: [OFFEN]
Rev. 2 verspricht Rückgängig in Stufe 2/3, benennt aber nur die einmal verbrauchbare Plan-Kennung. Im heutigen Ergebnisvertrag markiert `takeResult` die Karte vor Accept als verbraucht (`runRegistry.ts:439-446`), und `pruneRunIfConsumed` entfernt beendete Läufe (`:458-462`); Retention evakuiert weitere Läufe (`:196-205`). Nach erfolgreichem Teil-Move sind außerdem nur tatsächlich verschobene Quellen rücksetzbar, und die ursprüngliche Menge/Plan-Auswahl kann inzwischen veraltet sein. Eine verbrauchte Plan-Kennung reicht nicht als Undo-Basis.
Vorschlag: Nach jedem Vollzug einen getrennten Main-seitigen Beleg mit den *wirklichen* Alt→Neu-Paaren, Datei-Identitäten, Link-Umschreibungen und Teilfehlern speichern; Dauer und Löschung dieser Belege vor Stufe 3 festlegen.

### F33 — „Angehängter Ordner“ kann außerhalb des Vaults liegen
Schwere: hoch
Stelle: app/src/main/noteAgent/ipc.ts:202
Status: [OFFEN]
Rev. 2 setzt `scope: attached` standardmäßig bei irgendeinem Ordner-Anhang und verspricht eine vault-relative Sammelnotiz. Der OS-Dialog lässt ausdrücklich externe Ordner zu (`ipc.ts:202-225`), und der Attachment-Zustand unterscheidet `insideVault` (`contextFiles.ts:32-45`, `:180-200`). Die aktuelle Außen-Anhang-Markierung berücksichtigt nur *Vault*-Ordner (`skills.ts:107-113`). Sucht `find_notes` in einem externen Anhang, haben Treffer keinen Vault-Pfad und können nicht als interne Wikilinks oder spätere Move-Quellen verwendet werden. Sucht es stattdessen nur im Vault, verletzt der Default die Erwartung „angehängter Ordner“.
Vorschlag: `find_notes` in Stufe 1 klar auf `insideVault`-Ordner beschränken; bei ausschließlich externem Anhang sichtbar ablehnen oder eine getrennte Klartextliste ohne Vault-Wikilinks spezifizieren. Beim Planen der späteren Verschiebung externe Treffer grundsätzlich ausschließen.

### F34 — Große Sammelnotiz ist mit der heutigen Vorschau nicht vollständig prüfbar
Schwere: mittel
Stelle: app/src/main/noteAgent/ipc.ts:1051
Status: [OFFEN]
Rev. 2 lässt eine vollständige Menge beliebiger Größe als gewöhnliche Ergebnisdatei zu. Die aktuelle Ergebnisvorschau kappt Text bei 200 000 Zeichen (`ipc.ts:1034-1059`), während `writeStagingFile` die generierte Datei ohne Mengengrenze schreibt (`staging.ts:54-62`). Bei einem großen Vault könnte die Sammelnotiz vollständig übernommen werden, obwohl der Nutzer nur ihren Anfang prüfen konnte. Die 120-Zeilen-Grenze betrifft nur die Modellantwort, nicht die Ergebnisdatei.
Vorschlag: Umfang/Zeilenzahl und abgeschnittene Vorschau deutlich auf der Karte nennen, eine vollständige paginierte Prüfung anbieten oder für die Sammelnotiz eine eigene sichtbare Größen-/Teilungsregel festlegen.

### F35 — Sync-Pause allein stimmt den Watcher nicht ab (F04/F07)
Schwere: hoch
Stelle: app/src/main/index.ts:7772
Status: [OFFEN]
Rev. 2 verspricht „währenddessen kein automatischer Sync, danach genau einer“ und abgestimmte Watcher-Ereignisse, beschreibt aber keinen gemeinsamen Sperr-/Warteschlangenmechanismus. Der vorhandene Watcher sendet jedes `add`/`unlink` sofort an den Renderer und an den Vault-Index (`main/index.ts:7772-7779`); bei `add`/`change` ruft er außerdem unabhängig vom regulären Intervall `syncEngine.pushFile` auf (`:7781-7792`). Eine Pause nur des Auto-Sync-Timers verhindert weder diese Einzel-Pushes noch `unlink`/`add` im Renderer (`Sidebar.tsx:93-117`).
Vorschlag: Ein Batch-Token muss *vor dem ersten Rename* alle drei Verbraucher koordinieren (Renderer, Index, Sync), Ereignisse puffern und nach Abschluss samt Teilfehlern kontrolliert freigeben; Abbruch und App-Schließung mitbedenken.

### F36 — „Ausgeblendeter Ordner“ ist keine vorhandene Main-Policy (F15)
Schwere: mittel
Stelle: app/src/renderer/stores/graphStore.ts:318
Status: [OFFEN]
Rev. 2 will Quellen und Ziele unter ausgeblendeten Ordnern Main-seitig sperren. `hidden` wird derzeit als `fileCustomizations[path]` im Renderer-GraphStore gesetzt (`graphStore.ts:287-315`, `:318-341`) und über `graph-data.json` gespeichert (`main/index.ts:8233-8257`). Der Main-Plan müsste diese Datei selbst vertrauenswürdig lesen, Vererbungsregeln für Unterordner definieren und sie bei Vorschau *und* Vollzug frisch prüfen. Ein einmal aus dem Renderer übergebenes „hidden“-Flag wäre keine Main-Prüfung. Auch der Brain-Ordner ist konfigurierbar (`uiStore.ts:294`, `:1188`) und darf nicht nur als fester Name geprüft werden.
Vorschlag: Geschützte Ordner aus Main-seitigen aktuellen Einstellungen und Graph-Daten ableiten, Pfadpräfixe kanonisch vergleichen und Änderungen zwischen Vorschau und Vollzug sichtbar als Plan-Verfall behandeln.

### F37 — Eingebettete Notizen fehlen in der Pfad-Verweisliste (F05)
Schwere: hoch
Stelle: app/src/renderer/utils/linkExtractor.ts:6
Status: [OFFEN]
Rev. 2 sucht vor dem Move „eingehende Wikilinks mit Ordnerpfad“. Wenn dafür die vorhandenen `outgoingLinks`/Backlinks benutzt werden, fehlen Notiz-Einbettungen `![[ordner/notiz]]`: `extractLinks` schließt sie durch `(?<!!)` ausdrücklich aus (`linkExtractor.ts:6-26`). Der Lesen-Modus behandelt solche Einbettungen gesondert und speichert ihren Pfad in `data-note` (`wysiwygNoteEmbedRule.ts:32-40`). Ein Move der Zieldatei kann deshalb die eingebettete Ansicht brechen, obwohl die gewöhnlichen Backlinks als vollständig erscheinen.
Vorschlag: Nicht aus dem Backlink-Index auf Vollständigkeit schließen; für die Rewrite-Vorschau auch Notiz-Einbettungen und deren Fragmente/Aliasse direkt im Markdown erfassen und nach dem Move prüfen.

### F38 — Neuer Markdown-Writer muss die Formatgrenze mit `write_note` teilen
Schwere: niedrig
Stelle: app/src/main/noteAgent/loop.ts:252
Status: [OFFEN]
Stufe 1 nennt `write_note_list` eine gewöhnliche `.md`-Ergebnisdatei. Der Systemprompt erlaubt höchstens zwei Dateien und jedes Format nur einmal (`loop.ts:252`); `run.results` registriert Ergebnisse derzeit ohne Formatprüfung (`runRegistry.ts:415-425`). Bleibt `write_note_list` unabhängig von `write_note`, kann derselbe Lauf zwei Markdown-Karten erzeugen und die eigene Ergebnisregel verletzen. Bei Web-Läufen gilt zusätzlich F23.
Vorschlag: Beide Werkzeuge auf dieselbe Markdown-Ergebnisquote binden und die Prompt-/Toolbeschreibung darauf abstimmen.

## Claude-Antwort

Runde 1, 25.11.2026. Die zentralen Befunde am Code nachgeprüft (Notiz-ID als Pfad-Hash und
`updateNotePath`, Suchreihenfolge der Einbettungen, `assessDeletions`, `move-file` mit
Überschreiben-Dialog, `searchVault`): sie tragen. Der Plan ist als Rev. 2 in drei Stufen
umgeschrieben; es gibt weiterhin keinen Code.

- **F01 [ADRESSIERT]** — Stufe 2: gebündelte Alt→Neu-Migration statt `updateNotePath` je Notiz.
- **F02 [ADRESSIERT]** — Stufe 2: Tabs, Graph, Lesezeichen in der Migration.
- **F03 [ADRESSIERT]** — Stufe 2: Erinnerungen, Projektstatus; Kontextgedächtnis per Umzugsereignis.
- **F04 [ADRESSIERT]** — Stufe 2: Main-seitiger Batch mit Ergebnis je Datei, Watcher abgestimmt.
- **F05 [ADRESSIERT]** — Stufe 2: Pfad-Verweise vorab suchen, in der Vorschau nennen, umschreiben.
- **F06 [ADRESSIERT]** — Stufe 2: betroffene Notizen markieren und standardmäßig auslassen;
  Umschreiben relativer Einbettungen bewusst später.
- **F07 [ADRESSIERT]** — Meine Frage war zu pauschal; Stufe 2 legt Batch und Sync-Zeitpunkt fest
  und nennt die Tests.
- **F08 [ADRESSIERT]** — Stufe 3: eigener IPC mit Plan-Kennung, Renderer schickt nur Abwahlen;
  Stufe 2: nie überschreiben.
- **F09 [ADRESSIERT]** — Stufe 2: Identität/Hash beim Planen und Vollzug, offene Notizen.
- **F10 [ADRESSIERT]** — Stufe 1: `scope: vault` nur nach sichtbarer Freigabe, Markierung außerhalb
  des Anhangs je Zeile. Der Widerspruch zur Regel „liest NUR, was angehängt ist“ besteht heute
  schon durch `note_search`; die Regeldatei wird beim Bau berichtigt.
- **F11 [ADRESSIERT]** — Stufe 1: Durchlauf aus `searchVault` herauslösen, Mengenvertrag neu.
- **F12 [ADRESSIERT]** — Stufe 1: keine Dateiobergrenze, Kennzeichen „unvollständig“, feste
  Nummern, `meaning` gestrichen.
- **F13 [ADRESSIERT]** — Stufe 3: eigener Ergebnistyp. Stufe 1 bleibt bewusst bei einer echten Datei.
- **F14 [ADRESSIERT]** — Stufe 1: Lebensdauer der Mengen, Übernahme in den Fortsetzungszustand.
- **F15 [ADRESSIERT]** — Stufe 3: getrennte Quell-/Ziel-Regeln, Liste als E4 beim Nutzer.
- **F16 [ADRESSIERT]** — Stufe 2: Abgleich nach der Serie.
- **F17 [ADRESSIERT]** — Stufe 2/3: Ordner erst beim Vollzug, Zielwechsel als Neuplanung.

Runde 2, 25.11.2026 (F18–F38). Acht Befunde am Code nachgeprüft (Annotationen-Sidecar,
Lernkarten/Quiz am Pfad, Linkziel-Helfer, Ordner außerhalb des Vaults, Werkzeugklassen im Loop,
Dateiüberwachung → Sync je Datei, Einbettungen im Link-Auszug): sie tragen. Nutzerentscheidung:
Stufe 1 jetzt bauen, Stufe 2 als eigenes Vorhaben mit eigenem Plan, Stufe 3 danach.

- **F18 [ADRESSIERT]** — Rev. 3: kein `scope: vault` in Stufe 1, also keine Freigabe nötig.
- **F19 [ADRESSIERT]** — Rev. 3: Größen-, Zeit- und Abbruchgrenzen; „vollständig“ definiert.
- **F20 [ADRESSIERT]** — Rev. 3: `LOCK_ONLY_TOOLS`, selbst begrenzte Antwort.
- **F21 [ADRESSIERT]** — Rev. 3: immer Pfad-Verweis mit Anzeigetext, sonst Klartextpfad mit Grund.
  `buildFileLinkTarget` wird bewusst NICHT genutzt: er braucht Namen und H1 aller Vault-Notizen.
- **F22 [ADRESSIERT]** — Rev. 3: Hash je Eintrag, Neuprüfung beim Schreiben.
- **F23 [ADRESSIERT]** — Rev. 3: nicht im Web-Lauf, Ausnahme von der Lese-Rückfrage.
- **F24–F32, F35–F37 [DISKUSSION]** — betreffen Stufe 2 und 3. Sie tragen und zeigen, dass
  Stufe 2 ein eigenes Vorhaben ist: zunächst nur einzelne Notizen statt Ordner (F27), Bindung an
  eine Main-seitig geprüfte Vorschau schon in Stufe 2 (F30), dauerhafter Vollzugsbeleg (F32),
  gemeinsames Batch-Token für Dateiüberwachung, Sync und Index (F35). Werden in einem eigenen
  Plan aufgenommen; hier nichts gebaut.
- **F33 [ADRESSIERT]** — Rev. 3: nur Ordner im Vault.
- **F34 [ADRESSIERT]** — Rev. 3: Umfang auf der Karte, Hinweis bei gekappter Vorschau.
- **F38 [ADRESSIERT]** — Rev. 3: ein Markdown-Ergebnis je Lauf.

## Status

Rev. 3, 25.11.2026. Stufe 1 wird gebaut; Stufe 2 und 3 sind nicht begonnen und brauchen einen eigenen Plan.

### Nachtrag 25.11.2026 — sinngemäße Ergänzung über den Vault-Index (nach Stufe 1, nicht von Codex geprüft)

Der Testlauf von Stufe 1 fand 9 bzw. 7 von 14 Notizen. `find_notes` fragt deshalb zusätzlich den
Vault-Index mit dem Thema ab und nimmt Notizen ohne Suchwort als gekennzeichnete Gruppe in die
Menge auf. Schwelle geeicht an den Worttreffern statt fester Zahl; Messwerte und Grenzen stehen in
`.claude/rules/note-agent.md`. Ergebnis im selben Testordner: 12 von 14, keine falsche Notiz.
Datenweg unverändert gegenüber `vault_search`: Einbettung lokal, Titel und Auszüge der Kandidaten
gehen an das Modell des Laufs.
