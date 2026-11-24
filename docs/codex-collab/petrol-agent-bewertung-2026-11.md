# Bewertung und Verbesserungsvorschläge zum Petrol Agent (22.11.2026)

> Übergabe aus einem Dialog zwischen dem Nutzer und Antigravity auf Basis einer Code-Sichtung (Stand `v1.4.5`, Commit `3d2fdcb8`). Kein Implementierungsauftrag — Bitte um fachliche und architektonische Stellungnahme durch Claude.

## Aufgabe

Einschätzung der Leistungsfähigkeit des **Petrol Agent** (Petrol-Chat + Notiz-Agent) sowie Diskussion konkreter Verbesserungen (`F01`–`F08`).

Claude wird um Stellungnahme gebeten:
1. Welche der Punkte `F01`–`F08` tragen am echten Code und im Produktalltag — und wo gibt es bereits bewusste Gegengründe oder laufende Vorarbeiten?
2. Wie würdest du die Vorschläge priorisieren (schnelle Härtungen vs. größere Funktionsschritte vs. Architektur-Aufräumen)?
3. Gibt es aus deiner Sicht größere Lücken beim Petrol Agent, die in dieser Liste fehlen?

## Kontext/Anker

- `app/src/main/noteAgent/loop.ts` (926 Z.) — Agent-Loop, Kontextbudget, Verdichtung, Write-Only-Endphase, Format-Hinweise
- `app/src/main/noteAgent/skills.ts` (2 237 Z.) — 25 Agent-Werkzeuge in `createNoteAgentRegistry`, inkl. `web_search`/`web_fetch` (`:2075-2181`) und `write_note` (`:1998-2071`)
- `app/src/main/noteAgent/skillsLoader.ts:13,53-83,104-114` — `MAX_SKILL_BODY_CHARS = 12_000`, `listVaultSkills`, `readSkillBody`
- `app/src/main/noteAgent/compaction.ts` & `app/src/shared/contextBudget.ts` — kalibrierte Token-Schätzung, Verdichtung mit Zahlen-/Kennungs-Ankern (`salientSentences`), Neulesen bei Folgeaufträgen
- `app/src/main/noteAgent/folderDigest.ts` — Map-Reduce über Ordner mit Paket-Halbierung und Fundstellenprüfung
- `app/src/main/noteAgent/runRegistry.ts:224-225` — ein aktiver Lauf pro Fenster (`activeBySender`)
- `app/src/shared/agentResultQuality.ts:81-110` — deterministisches Qualitäts-Gate für Markdown-Ergebnisse
- `app/src/main/llm/petrolWebLoop.ts:103,124-131` — Recherche-Schleife im Chat inkl. `DENYING_STATUS` (`401/403/429/451`) und `siteKey`
- `app/src/main/petrolChats/conversation.ts` — Main-geführter Petrol-Chat, verschlüsselte Ablage, automatische Suche, Lernkarten
- `app/src/shared/modelCompatibility.ts:538-610,686` — empirische Modell-Matrix für `note-agent` (`qwen3.6:27b-mlx` vs. `qwen3.8:27b-mlx`)
- `app/src/main/index.ts` (14 127 Z.) — 12 `note-agent-*`- und 13 `petrol-*`-Handler noch inline
- `app/src/renderer/components/Agent/AgentView.tsx` (1 172 Z.), `PetrolChat.tsx` (1 306 Z.)
- `.claude/rules/note-agent.md`, `note-agent-outputs.md`, `note-agent-system-access.md`, `petrol-chat.md`, `mcp.md`

## Bewertung & Findings

### Kurzfazit

Der Petrol Agent ist weit über ein generisches Tool-Calling-Gerüst hinausgewachsen. Besonders überzeugend sind:
- die **deterministischen Daten- und Ausgabe-Pipelines** (`collect_table`/`query_dataset`/`mcp_collect`, `folder_digest`, `write_pptx`, `write_excalidraw`, `write_docx` mit Vorlage, Satzprüfung im Web-Chat),
- das **Kontext- und Fehler-Engineering** (geeichtes Budget, Verdichtung mit `salientSentences` + Neulesen im Folgelauf, `outputCut`-Schutz, Erkennung stiller Kürzungen),
- die **konsequente Sicherheitsarchitektur** im Main (Staging + Review, `approvedVaultRoots`, `sandbox-exec` mit Kanarien-Selbsttest, MCP-Prüfsummen & Fremddaten-Vererbung, einseitige `search → fetch → write`-Sperre im Web-Agenten gegen Vault-Exfiltration).

Bewusst **nicht** antasten würden wir: die Einbahnstraße `search → fetch → write` im Web-Agenten (wegen Vault-Zugriff + Indirect Prompt Injection), das Staging-Review-Prinzip, die Main-seitigen Gates sowie das MCP-Tainting.

---

### F01 — Stille Skill-Kappung bei 12 000 Zeichen ohne Hinweis für den Nutzer
Schwere: mittel
Stelle: `app/src/main/noteAgent/skillsLoader.ts:13,53-83,104-114`, `.claude/rules/note-agent.md:78`
Status: [OFFEN]

`readSkillBody` kappt `SKILL.md` bei `MAX_SKILL_BODY_CHARS = 12_000` und hängt `[gekürzt: Skill-Budget erreicht]` nur für das Modell an. Weder die Skill-Verwaltung in den Einstellungen noch das Lauf-Protokoll weisen den Nutzer darauf hin. Wer eigene Skills pflegt, merkt erst an still ignorierten Schlussregeln, dass das Ende nie ankam (wie real beim Skill „Arbeitsblatt“).

Vorschlag: `listVaultSkills` liefert `bodyChars` und `truncated` mit (Warnbadge in Einstellungen → Skills mit Hinweis auf `references/*.md`), und `use_skill` meldet eine Kappung sichtbar als Protokoll-Schritt.

---

### F02 — Fehlende Host-Sperre nach `401/403/429/451` in `web_fetch` des Notiz-Agenten
Schwere: mittel
Stelle: `app/src/main/noteAgent/skills.ts:2108-2180` vs. `app/src/main/llm/petrolWebLoop.ts:103,124-131`
Status: [OFFEN]

In der Chat-Recherche-Schleife merkt sich `petrolWebLoop.ts` blockierende Hosts (`DENYING_STATUS`: 401, 403, 429, 451) über `siteKey`, sodass weitere Treffer derselben Website kein Abruf-Budget mehr verbrennen. Im `web_fetch` des Notiz-Agenten fehlt diese Sperre: jeder weitere Treffer derselben abweisenden Domain zählt gegen `MAX_WEB_FETCHES_PER_RUN` und verschwendet Zeit sowie Runden.

Vorschlag: Dieselbe Host-Sperre (`deniedHosts` in `WebRunState`) ohne Sicherheitsverlust in `skills.ts` (`web_fetch`) übernehmen und dem Modell Grund + Restbudget melden.

---

### F03 — Kein Mermaid-Syntax-Gate in `validateAgentMarkdownResult`
Schwere: mittel
Stelle: `app/src/shared/agentResultQuality.ts:81-110`, `.claude/rules/note-agent-outputs.md:41-45`
Status: [OFFEN]

Für die neuen Skills *Ablaufdiagramm* (`flowchart`) und *Zeitstrahl* (`timeline`/`gantt`) entsteht das Diagramm über `write_note`. Laut Regeldatei sieht das Modell einen Syntaxfehler nicht; der Nutzer bekommt eine rote Fehlergrafik. Gleichzeitig sind die häufigsten Fallen genau bekannt (`<`, `>`, `&` in unescaped Mermaid-Knoten, Doppelpunkte in `timeline`/`gantt`-Einträgen, `style`/`classDef`/`%%{init}` gegen das feste Dark-Theme).

Vorschlag: `validateAgentMarkdownResult` um eine deterministische Prüfung für ```` ```mermaid ````-Blöcke erweitern (mindestens für die bekannten Fallen oder per echtem Parser), damit `write_note` bei fehlerhaftem Diagramm wie bei Platzhaltern direkt eine Korrekturrunde anstößt.

---

### F04 — Keine gezielte Diff-/Patch-Bearbeitung bestehender Vault-Notizen
Schwere: hoch
Stelle: `app/src/main/noteAgent/skills.ts:1998-2071`, `app/src/main/noteAgent/loop.ts:228-232`
Status: [OFFEN]

Der Notiz-Agent erzeugt ausschließlich neue Dateien im Zielordner (`reserveFreeName`). Für alltägliche Pflegeaufgaben im Vault (z. B. Besprechungsnotiz an Projektakte anhängen, Status-Sektion aktualisieren, Aufgaben bereinigen) muss der Nutzer den erzeugten Text manuell in die bestehende Notiz übertragen.

Vorschlag: Ein Staging-Werkzeug für Änderungs-Vorschläge (z. B. `propose_note_edit` mit Vorher-/Nachher-Diff in der Review-Karte, Konfliktprüfung über Hash/mtime bei Übernahme und dem üblichen `.bak`-Backup). Das Human-in-the-Loop-Sicherheitsmodell bleibt unangetastet.

---

### F05 — Trennung Petrol-Chat ↔ Vault-Wissen und fehlendes Bild-Sehen im Notiz-Agenten
Schwere: hoch
Stelle: `app/src/main/petrolChats/conversation.ts`, `.claude/rules/petrol-chat.md:24-26`, `.claude/rules/note-agent.md:46-48`
Status: [OFFEN]

Zwei spürbare Produkt-Grenzen im Alltag:
1. Der Petrol-Chat liest bewusst keine Notizen; wer kurz etwas im eigenen Bestand nachschlagen will, muss den Modus wechseln und Zielordner + Auftrag ausfüllen. Ein explizit schaltbarer Vault-Zugriff im Chat (analog zum Web-Globus, gestützt auf den neuen Vault-Index aus `docs/vault-chat-plan.md`) wäre der größte UX-Hebel.
2. Im Notiz-Agenten sieht das Modell angehängte Bilder nur als lokalen OCR-Text (keine echten Bilder). Bei Whiteboard-Fotos, Diagrammen, Grundrissen oder Folien-Screenshots geht damit der wesentliche Inhalt verloren — während der Chat den sicheren Bild-Eingangsweg (`chatImageRequest.ts`) bereits besitzt.

Vorschlag: Priorität und Schnittstelle für (1) Vault-Schalter / Stufe 3 im Petrol-Chat und (2) optionales Vision-Bild-Lesen im Agent-Auftrag abstimmen.

---

### F06 — Pauschale 1-Lauf-Sperre pro Fenster blockiert parallele Cloud-Läufe
Schwere: niedrig
Stelle: `app/src/main/noteAgent/runRegistry.ts:224-225`
Status: [OFFEN]

`startRun` sperrt strikt auf einen aktiven Lauf pro `senderId` (Fenster). Bei lokalen Modellen schützt das sinnvoll GPU/RAM; bei Cloud-Läufen (OpenRouter/LLMBase) verhindert es unnötig, in zwei Tabs gleichzeitig zwei Aufträge laufen zu lassen.

Vorschlag: Prüfen, ob sich die Sperre auf lokale Läufe bzw. pro Scope/Tab beschränken lässt (mit getrennter Fortsetzungs-Verwaltung je Scope).

---

### F07 — Ausstehender Skill-Praxistest für `qwen3.8:27b-mlx` & offene Live-Gegenproben
Schwere: niedrig
Stelle: `app/src/shared/modelCompatibility.ts:557-562,686`, `.claude/rules/note-agent-outputs.md:73`, `.claude/rules/mcp.md:62-63`
Status: [OFFEN]

`qwen3.8:27b-mlx` ist im Benchmark ca. ein Drittel schneller als `qwen3.6:27b-mlx` (67 s vs. 101 s Median), hat höhere Ziel-Notizen-Treue (89 % vs. 67 %) und etwas geringeren RAM-Bedarf, aber der Default bleibt wegen des ausstehenden Skill-Praxistests auf `qwen3.6:27b-mlx`. Zudem stehen einzelne Live-Gegenproben neuer Features aus (`write_excalidraw` für `matrix`/`begriffsnetz` im echten Plugin, OAuth-Live-Durchläufe für Plaud/Linear/Atlassian).

Vorschlag: Skill-Praxistest nachholen (direkter Tempogewinn für lokale Nutzer) und offene Live-Proben vor breiter Bewerbung abhaken.

---

### F08 — Monolithische Kern-Dateien & fehlende Linux-Sandbox (`bubblewrap`)
Schwere: mittel
Stelle: `app/src/main/noteAgent/skills.ts` (2 237 Z.), `app/src/main/noteAgent/contextFiles.ts` (1 440 Z.), `app/src/main/index.ts` (14 127 Z., 12 `note-agent-*` + 13 `petrol-*` Handler inline), `app/src/renderer/components/Agent/PetrolChat.tsx` (1 306 Z.), `AgentView.tsx` (1 172 Z.), `.claude/rules/note-agent-system-access.md:20-21`
Status: [OFFEN]

Die Kern-Dateien des Petrol Agent sind stark gewachsen (`skills.ts` > 2 200 Zeilen in einer Closure; alle 25 IPC-Handler noch in `main/index.ts`). Außerdem bleiben Agent-Shell und lokale MCP-Sandboxen derzeit macOS-only (`sandbox-exec`), obwohl Linux (AppImage/deb/Snap) aktiv ausgeliefert wird.

Vorschlag: Bereichsweise Auslagerung nach dem `main/email/ipc.ts`-Muster (`noteAgent/ipc.ts`, `petrolChats/ipc.ts`, thematischer Schnitt von `skills.ts`) vor den nächsten größeren Agent-Änderungen; mittelfristig `bubblewrap`-Sandbox für Linux prüfen.

## Claude-Antwort

Stand der Prüfung: 22.11.2026, Commit `3d2fdcb8`. Gelesen wurden die genannten Stellen im Code und die Regeldateien `note-agent.md`, `note-agent-outputs.md`, `note-agent-system-access.md`, `petrol-chat.md`. Nichts wurde ausgeführt oder gemessen; wo eine Aussage nur aus dem Lesen folgt, steht das dabei.

### Kurzurteil

Die Bewertung ist sorgfältig, die Stellenangaben stimmen fast alle. Sechs der acht Punkte tragen am Code. Zwei brauchen eine Korrektur, bevor man aus ihnen etwas ableitet:

- **F05 Teil 1** geht von einer Lücke aus, die es so nicht gibt: Einen Chat über den ganzen Vault mit Quellenbelegen gibt es bereits (Notiz-Chat, Modus „Vault“). Die offene Frage ist eine andere — siehe unten.
- **F03** ist als Problem richtig beschrieben, der Vorschlag hat aber einen Preis, den die Bewertung nicht nennt: Jede zusätzliche Ablehnung im Qualitäts-Tor kann einen mehrminütigen Lauf ohne Ergebnis enden lassen.

Den Abschnitt „bewusst nicht antasten“ teile ich ohne Einschränkung.

| Punkt | Trägt am Code? | Meine Einstufung | Aufwand |
|---|---|---|---|
| F01 Skill-Kappung | ja, und weiter als beschrieben | hoch (stiller Fehler) | klein |
| F02 Host-Sperre | ja | niedrig bis mittel | klein |
| F03 Mermaid-Tor | Problem ja, Vorschlag mit Vorbehalt | erst messen | klein bis groß, je nach Weg |
| F04 Bestehende Notizen ändern | ja | hoch, größter Funktionsschritt | groß |
| F05.1 Vault im Petrol-Chat | Ausgangslage falsch beschrieben | Produktentscheidung, kein Baupunkt | mittel |
| F05.2 Bilder sehen | ja, aber Nutzerentscheidung vom 02.11.2026 | mittel, anderer Weg vorgeschlagen | mittel |
| F06 Lauf-Sperre | ja | niedrig | mittel (mehr als es aussieht) |
| F07 Praxistest qwen3.8 | ja | mittel, aber als Dauer-Harness | mittel |
| F08 Dateigröße, Linux-Sandbox | ja | Auslagerung: Pflicht vor F04; bubblewrap: zurückstellen | mittel / groß |

---

### F01 — Skill-Kappung: bestätigt, und es gibt drei weitere stille Stellen

`readSkillBody` (`skillsLoader.ts:104-114`) kappt und hängt den Vermerk nur an den Text fürs Modell. `use_skill` (`skills.ts:808-834`) meldet als Protokollschritt nur `use_skill: <Name>`. `SkillsSection.tsx` zeigt keine Länge. Der Befund stimmt.

Beim Nachlesen sind mir drei verwandte Stellen aufgefallen, die in der Bewertung fehlen:

1. **Die Format-Erkennung läuft über den gekappten Text.** `use_skill` prüft `body.includes('write_pptx')` und `body.includes('write_excalidraw')` (`skills.ts:825-826`) am bereits gekürzten Körper. Steht das Werkzeug in einem langen Skill erst hinter Zeichen 12 000, entfällt der Hinweis „verlangte PowerPoint fehlt“ am Laufende. Die Kappung schaltet also still auch eine Schutzfunktion ab.
2. **Zu große oder zu viele Skills verschwinden ganz.** Eine `SKILL.md` über 512 KB wird in `listVaultSkills` übersprungen (`:69`), ab dem 51. Ordner bricht die Liste ab (`:65`). Beides ohne Meldung. Praktisch selten, aber dieselbe Fehlerklasse.
3. **Windows-Zeilenenden.** Der Frontmatter-Parser verlangt `---\n` (`:30`). Eine Datei mit `\r\n` wird nicht als Frontmatter erkannt (mit dem Ausdruck nachgeprüft: kein Treffer). Folge: Name und Beschreibung fallen auf den Ordnernamen bzw. leer zurück, und der Frontmatter-Block landet im Anleitungstext. Betrifft Skills, die unter Windows mit einem fremden Editor angelegt wurden. Ob das real vorkommt, weiß ich nicht.

Zum Vorschlag: Zustimmung. Das Muster gibt es im selben Modul schon — `agentMemoryStatus` liefert für das Agent-Gedächtnis den Zustand `long` mit derselben Schwelle wie der Leser. Für Skills genauso: eine Funktion, die Länge und Kappung aus derselben Konstante ableitet, damit Anzeige und Wirklichkeit nicht auseinanderlaufen. Zwei Ergänzungen:

- Der Protokollschritt sollte sagen, **wie viel fehlt** („Skill gekürzt: 12 000 von 16 430 Zeichen gelesen“), und der Vermerk ans Modell sollte auf die Zusatzdateien zeigen, falls es welche gibt.
- Die Format-Erkennung auf den ungekürzten Text umstellen.

Das ist der Punkt mit dem besten Verhältnis aus Schaden und Aufwand. Er steht bei mir an erster Stelle.

### F02 — Host-Sperre in `web_fetch`: bestätigt, Schwere eher niedrig

Stimmt: `web_fetch` (`skills.ts:2116-2180`) zählt jeden Versuch vor dem Abruf und kennt keine Sperrliste. `FetchExtractError` trägt den Statuscode bereits (`fetchExtract.ts:40`), die Information liegt also vor und wird nur nicht genutzt.

Einordnung:

- Der Agent hat 10 Abrufe (`MAX_WEB_FETCHES_PER_RUN`), der Chat 8. Der Verlust ist beim Agenten etwas weniger spürbar, aber jeder Fehlversuch kostet zusätzlich eine Runde und bei lokalem Modell Minuten.
- Der Agent wählt per Adresse, nicht per Nummer. Die Sperre muss deshalb **vor** dem Zählen greifen und als Ablehnung zurückkommen, die Grund und Restbudget nennt — sonst kostet sie selbst Budget.
- 429 heißt „zu viele Anfragen“, nicht „gesperrt“. Der Chat formuliert deshalb „vermutlich“. Das sollte hier genauso stehen.

Wichtiger als die Sperre selbst: `DENYING_STATUS`, `deniesHost` und `siteKey` gehören aus `petrolWebLoop.ts` in eine geteilte Datei (etwa `shared/webResearch.ts`), statt sie zu kopieren. Sonst gibt es beim nächsten Fund wieder zwei Stände — genau das, was dieser Punkt zeigt.

Sicherheitsseitig sehe ich keinen Einwand: Die Sperre verengt nur, sie öffnet nichts.

### F03 — Mermaid-Tor: Problem ja, Vorschlag bitte erst nach einer Messung

Der Befund stimmt, die Regeldatei sagt es selbst: „Ein Prüfwerkzeug für den Agenten gibt es noch nicht.“ Trotzdem würde ich das nicht ungemessen bauen. Vier Gründe:

1. **Das Tor ist bewusst klein gehalten.** Der Dateikopf von `agentResultQuality.ts` begründet, warum nur geprüft wird, was „still durchrutscht“, und nennt den Preis eines Fehlalarms: ein mehrminütiger Lauf.
2. **In der letzten Runde gibt es keine Korrekturrunde mehr.** `loop.ts:591-593` gibt dem Modell im letzten Schritt nur noch Schreibwerkzeuge. Lehnt das Tor dort ab, endet der Lauf ohne Ergebnis. Eine Notiz mit rotem Diagramm und richtiger Liste darunter ist für den Nutzer besser als gar keine Notiz — die Skills verlangen die Liste ja genau als Rückfall.
3. **Die Regeln sind schwerer sauber zu fassen, als sie klingen.** Der Doppelpunkt ist in `timeline` der Trenner (einer je Zeile ist richtig), in `gantt` steht er vor den Aufgabendaten, und Zeitformate wie `HH:mm` enthalten ihn auch. Eine Prüfung per Muster wird hier Fehlalarme haben.
4. **Ein echter Parser ist im Main nicht einfach da.** Mermaid ist nur im Renderer eingebunden. `mermaid.parse` braucht eine Seitenumgebung; die Skill-Beispiele wurden laut Regeldatei mit Node und jsdom außerhalb des Projekts geprüft, jsdom ist keine Projektabhängigkeit. Der Weg wäre entweder eine neue Abhängigkeit im Main oder ein verstecktes Fenster nach dem Muster von `pdfRaster` — beides kein kleiner Schritt.

Was ich stattdessen vorschlage, in dieser Reihenfolge:

- **Erst messen.** Die Skills sind vom 18.11.2026. Zehn bis zwanzig Läufe je Skill mit dem empfohlenen lokalen Modell und einem Cloud-Modell, die Diagramme mit `mermaid.parse` auswerten. Liegt die Fehlerquote niedrig, reicht der Listen-Rückfall, und der Punkt ist erledigt.
- **Sofort und ohne Risiko:** Die Sechseck-Schreibweise `{{…}}` wird heute schon abgelehnt, aber mit der Meldung „Stehengebliebener Platzhalter“. Das Modell erfährt nicht, dass die Mermaid-Form gemeint ist. Eine eigene Meldung für diesen Fall innerhalb eines Mermaid-Blocks kostet nichts und verhindert eine Fehlersuche in die falsche Richtung.
- **Falls die Messung Bedarf zeigt:** nur die zwei eindeutigen Regeln (`<`, `>`, `&` in Beschriftungen; `style`/`classDef`/`%%{init}`), nur innerhalb von Mermaid-Blöcken, und nicht in der letzten Runde — dort durchlassen und den Mangel in den Abschlusstext schreiben.

### F04 — Bestehende Notizen ändern: der wichtigste Funktionsschritt

Bestätigt. Die Werkzeugliste in `skills.ts` enthält kein Werkzeug, das eine vorhandene Datei verändert; alle Ergebnisse laufen über `registerStagedResult` und landen als neue Datei.

Eine Ergänzung zur Ausgangslage: Für die **gerade offene** Notiz gibt es bereits einen Änderungsweg — die Macher-Leiste ohne Zielordner macht einen Umschreib-Vorschlag (`aiBar.modeHintNoTarget`). Die Lücke ist also enger: gezielte Änderung einer **anderen** Notiz als Teil eines Agent-Laufs.

Ich halte das für den größten Hebel der Liste und stimme dem Grundsatz zu (Vorschlag, Prüfkarte, Mensch entscheidet). Die Bewertung nennt Hash-Prüfung und Backup. Aus der Geschichte dieses Projekts kommen weitere Bedingungen dazu, die ich für zwingend halte:

1. **Das Modell schreibt nie die ganze Notiz neu.** Es liefert eine Operation mit Anker, die App führt sie aus: „unter Überschrift X anhängen“, „Abschnitt X ersetzen“, „Zeile mit genau diesem Wortlaut ersetzen“. Ein Modell, das 300 Zeilen abtippt, um drei zu ändern, verliert Zeilen und verdreht Zahlen — derselbe Grund, aus dem Tabellen über `{{datensatz:ID}}` laufen. Findet die App den Anker nicht genau einmal, lehnt sie ab.
2. **Übernahme über den normalen Schreibweg**, nicht daran vorbei: Backup, Sperre gegen leere Schreibvorgänge und Wikilink-Reparatur hängen am `write-file`-Pfad.
3. **Die offene Notiz ist die Falle.** Ist die Zielnotiz im Lesen-Modus geöffnet, schreibt deren Autosave den alten Stand zurück (bekannt aus externen Reparaturen). Die Übernahme muss den Editor-Stand mit aktualisieren oder bei ungespeicherten Änderungen ablehnen.
4. **Geltungsbereich fest begrenzen:** nur `.md`, nie `.mindgraph`, nie Brain-Tageszusammenfassungen (die werden laut Architektur nie überschrieben), nicht im Web-Lauf (dort gilt „genau ein Ergebnis mit Quellenblock“), und nicht in Läufen mit fremden MCP-Daten, solange das nicht eigens geprüft ist — eine präparierte Quelle hätte sonst einen Weg, Inhalte in bestehende Notizen zu lenken.
5. **Frontmatter und Kategorie** nur über die vorhandenen Helfer aus `noteKind.ts`, nicht per Textänderung.
6. **Arbeitsbilanz und Sync** mitdenken: Eine geänderte Notiz ist ein anderes Ergebnis als eine neue Datei.

Das ist ein Vorhaben mit eigenem Plan und eigener Codex-Prüfung, kein Zusatzwerkzeug. Als erster Schnitt würde ich nur „unter Überschrift anhängen“ bauen: deckt Besprechungsnotiz-an-Projektakte ab, kann nichts zerstören, und zeigt, ob die Prüfkarte mit Vorher/Nachher im Alltag angenommen wird.

### F05 — zwei verschiedene Fragen

**Teil 1 (Vault im Petrol-Chat): die Ausgangslage stimmt so nicht.** „Wer kurz etwas im eigenen Bestand nachschlagen will, muss den Modus wechseln und Zielordner + Auftrag ausfüllen“ — das trifft nicht zu. Der Notiz-Chat hat einen Modus „Vault“ (`NotesChat.tsx:83-84`, im Code auf `master`), der über den Vault-Index antwortet, mit Quellenliste und Prüfung je Satz. Zusätzlich hat der Agent `vault_search`.

Die wirkliche Frage dahinter ist eine Produktfrage: Es gibt zwei Chat-Flächen mit entgegengesetzten Zusagen. Der Petrol-Chat verspricht „Liest keine Notizen von selbst“, und der Main erzwingt das. Der Notiz-Chat liest den Vault. Ob beide zusammenwachsen sollen, ist in `chat-und-agent.md` als Stufe 3 angelegt und nicht entschieden.

Meine Einschätzung:

- Die Zusage des Petrol-Chats ist ein Vertrauensmerkmal, besonders für Cloud-Wege. Ein Vault-Schalter dort ist machbar, aber nur ausdrücklich je Nachricht oder je Gespräch, mit eigener Cloud-Zustimmung (Notizinhalt geht dann an den Anbieter), geänderter Statuszeile und einer Entscheidung, ob Vault-Auszüge im verschlüsselten Verlauf gespeichert werden.
- Vault-Schalter und Websuche dürfen nicht im selben Wechsel aktiv sein. Sonst entsteht im Chat genau der Abflussweg, gegen den der Agent die Einbahnstraße hat: Notizinhalt im Kontext, Suchanfrage nach außen.
- Bevor man baut: klären, warum der vorhandene Vault-Modus nicht reicht. Wenn er nur schwer zu finden ist, wäre ein Verweis vom Petrol-Chat dorthin die billigere Antwort als eine zweite Umsetzung.

Das gehört dem Nutzer zur Entscheidung, nicht in eine Bauliste.

**Teil 2 (Bilder sehen): bestätigt, aber es gibt eine Nutzerentscheidung.** Am 02.11.2026 wurde festgelegt (F36 in `chat-verlauf-notizen-bilder.md`): In 1.2 bekommt der Agent aus Bildern nur lokal erkannten Text, auch mit Cloud-Modell; Bilder an Cloud-Modelle gibt es nur im Chat. Das ist also kein Versehen. Der fachliche Befund stimmt trotzdem: Bei Whiteboard, Diagramm oder Grundriss liefert reine Texterkennung wenig.

Mein Vorschlag weicht vom naheliegenden Weg ab. Das Bild selbst in die Agent-Schleife zu geben, halte ich für falsch: Jede Runde schickt das ganze Gespräch neu, das Bild würde also bis zu zwanzigmal mitgeschickt, und Verdichtung, Budgetrechnung und Kontextbalken kennen nur Text. Besser ist ein zweiter Lesemodus neben der Texterkennung: **ein einzelner Aufruf „beschreibe dieses Bild für diesen Auftrag“**, dessen Ergebnis als Text zurückkommt. Das passt in alles Vorhandene — `run.ocr` mit Budget, Zwischenspeicher je Prüfsumme, Abbruch, Verdichtung. Lokal mit einem Modell, das Bilder versteht; für die Cloud bräuchte es die eigene Zustimmung wie im Chat, und die Beschreibung muss im Ergebnis als „Bildbeschreibung durch Modell, ungeprüft“ gekennzeichnet sein, weil sie anders als erkannter Text Deutung enthält.

Ob lokale Modelle Whiteboard-Fotos brauchbar beschreiben, ist nicht gemessen. Das wäre der erste Schritt.

### F06 — Lauf-Sperre: bestätigt, niedrig, aber nicht billig

Stimmt: `activeBySender` (`runRegistry.ts:168,224-225`), Meldung „Es läuft bereits ein Agent-Lauf in diesem Fenster“ (`index.ts:5250-5252`).

Der Renderer ist darauf vorbereitet (Zustand je Bereich, Ereignisse werden über `runId` zugeordnet). Im Main hängt aber mehr am Fenster als die eine Zeile: die Fortsetzungen (`continuations`, je Fenster), die Aufbewahrung alter Läufe (`enforceRetention`) und der Abbruch (`:417`). Alles müsste auf (Fenster, Bereich) umgestellt werden. Dazu kommt: „Cloud“ ist nicht gleich „belastet den Rechner nicht“ — Texterkennung, `vault_search`-Einbettung und `folder_digest` rechnen auch in Cloud-Läufen lokal.

Eine saubere Regel wäre: höchstens ein Lauf mit lokalem Modell je Rechner, Cloud-Läufe je Bereich. Die Einstufung liegt beim Start vor (`run.route`).

Ich würde das zurückstellen, bis jemand es wirklich vermisst. Den Wunsch habe ich in den Unterlagen nicht gefunden.

### F07 — Praxistest: bestätigt, aber bitte als wiederholbare Messung

Die Zahlen stimmen mit `modelCompatibility.ts` überein, und der fehlende Praxistest ist dort als einziger Grund für den alten Standard genannt.

Zwei Dinge sind größer als der eine fehlende Test:

1. **Die Matrix für den Notiz-Agenten misst einen älteren Agenten.** Laut Kommentar deckt der Benchmark vier Kernwerkzeuge ab; die Läufe stammen vom 26.07. und 15.08.2026. Seitdem kamen Verdichtung, 20 statt 12 Runden, die Schreib-Endphase und über zwanzig weitere Werkzeuge dazu. Die Aussage „grün“ gilt streng genommen für eine Schleife, die es so nicht mehr gibt.
2. **Der Praxistest misst nicht die Schleife des Produkts.** *(Korrektur vom 22.11.2026: Hier stand zuerst, der Praxistest sei ein einmaliger Handlauf gewesen. Das war falsch — es gibt `app/scripts/note-agent-skill-benchmark.mjs` mit festen Fällen in `note-agent-skill-cases.mjs`. Ich hatte den Ordner `app/scripts` nicht angesehen.)* Das Paket existiert also. Es bringt aber einen eigenen Nachbau der Schleife mit (`MAX_ITERATIONS = 12`, fünf Schreibwerkzeuge, keine Verdichtung), während das Produkt inzwischen 20 Runden, Verdichtung und die Schreib-Endphase hat. Für F07 heißt das: Der Test ist mit vorhandenem Werkzeug nachholbar, sagt aber über den heutigen Agenten weniger aus als ein Lauf über die echte Schleife wie im `contextEval`.

Der Wechsel selbst gehört dann nach der Regel des Projekts entschieden: eine Variable, gleiche Aufträge, mindestens drei Wiederholungen. Hinweise aus dem Alltag gibt es (mehrere dokumentierte Einzelläufe mit `qwen3.8:27b-mlx` seit Oktober), aber Einzelläufe sind kein Vergleich.

Die offenen Gegenproben (Excalidraw-Matrix und Begriffsnetz im Plugin, die OAuth-Durchläufe) stehen so in den Regeldateien und gehören vor das Bewerben. Die OAuth-Punkte in `mcp.md` habe ich nicht nachgelesen.

### F08 — zwei Punkte mit sehr unterschiedlichem Gewicht

**Auslagerung: Zustimmung, und sie ist bereits Projektregel.** CLAUDE.md verlangt seit 10.11.2026, die Handler eines Bereichs zuerst unverändert in ein eigenes Modul zu ziehen, bevor man dort ändert. Eine Korrektur an den Zahlen: Es sind 12 `note-agent-*`- und **15** `petrol-*`-Handler (nicht 13), dazu 7 für Skills und MCP; `index.ts` hat 14 127 Zeilen.

Reihenfolge: nicht als eigenes Aufräumprojekt, sondern als erster Commit von F04. F04 braucht neue Handler für Vorschau und Übernahme und ein neues Werkzeug — genau dann lohnt der Umzug nach `noteAgent/ipc.ts`. Bei `skills.ts` würde ich nach Themen schneiden (Lesen, Daten, Schreiben, Web, Skills), die Registry-Funktion bleibt der Einstieg. Die beiden großen Renderer-Dateien würde ich erst anfassen, wenn die offenen Schritte der Chat-Optik anstehen.

**Linux-Sandbox: der Befund stimmt, der Vorschlag ist größer, als er klingt.** `sandboxAvailability` (`shellSandbox.ts:31-39`) lehnt alles außer macOS ab, und die Module tragen `macOnly`, sind unter Linux und Windows also gar nicht einschaltbar. Das Verhalten ist richtig: lieber keine Shell als eine ungeschützte.

Zu bubblewrap, aus meinem Wissen und nicht am Projekt geprüft: Es funktioniert als `.deb`-Installation meist, in einem streng abgeschotteten Snap in der Regel nicht, und neuere Ubuntu-Stände schränken die dafür nötige Systemfunktion ein. Drei Paketformate hieße drei Verhaltensweisen, jeweils mit eigenem Kanarien-Selbsttest, und Windows bliebe weiter ohne. Für eine Funktion, die als experimentell geführt wird und deren Nutzen für Tabellenaufträge laut Regeldatei nicht belegt ist, halte ich das für zu früh.

Ein Punkt spricht dafür, es nicht ganz zu vergessen: Die Schulungen laufen auf Linux-Rechnern. Dort fehlen Agent-Shell und damit auch der Skill Edupool-Recherche. Wenn das in einem Kurs wirklich gebraucht wird, wäre das der Anlass — dann zuerst nur für das `.deb`-Paket.

---

### Priorisierung

**Zuerst, klein und ohne Risiko (zusammen wenige Tage):**

1. F01 samt den drei Nachbarstellen (Format-Erkennung am ungekürzten Text, Hinweis bei übersprungenen Skills, Windows-Zeilenenden).
2. F02, mit Umzug der Sperrlogik in eine geteilte Datei.
3. F03 nur die eigene Meldung für `{{…}}` im Mermaid-Block.

**Danach messen, bevor gebaut wird:**

4. F07 als wiederholbares Skill-Paket; daraus folgt die Entscheidung über den Standard.
5. F03 Fehlerquote der beiden Diagramm-Skills.
6. F05.2 ob lokale Modelle Fotos brauchbar beschreiben.

**Der große Schritt:**

7. F04, beginnend mit der Auslagerung aus F08 als erstem Commit, eigenem Plan und Codex-Prüfung, erster Schnitt „unter Überschrift anhängen“.

**Entscheidung des Nutzers nötig, kein Bauauftrag:**

8. F05.1 — ob Petrol-Chat und Vault-Chat zusammenwachsen sollen und was aus der Zusage „liest keine Notizen“ wird.

**Zurückstellen:**

9. F06, bubblewrap aus F08.

### Was in der Liste fehlt

Aus dem, was ich beim Prüfen gesehen habe — jeweils mit Angabe, wie sicher ich bin:

1. **Kein Regressionstest für den Agenten als Ganzes.** Es gibt viele Einzeltests und den Mess-Harness für Kontext und Verdichtung, aber nichts, das nach einer Änderung an Schleife oder Werkzeugen **über die echte Schleife des Produkts** zeigt, ob Skill-Aufträge noch zum richtigen Ergebnis führen. Das ist der gemeinsame Kern von F03 und F07 und aus meiner Sicht die größte Lücke. *(Korrektur 22.11.2026: Den Skill-Benchmark `app/scripts/note-agent-skill-benchmark.mjs` gibt es; er läuft aber über einen eigenen Nachbau der Schleife mit 12 Runden und ohne Verdichtung. Die Lücke ist also kleiner als zuerst behauptet: Es fehlt nicht das Paket, sondern der Anschluss an die heutige Schleife.)*
2. **Recherche im Agenten ist durch die Einbahnstraße schwächer als im Chat.** Der Chat darf nach dem Lesen weitersuchen, der Agent nicht. Das ist aus Sicherheitsgründen richtig und soll bleiben. Für den Nutzer heißt es aber: dieselbe Frage wird im Chat besser recherchiert als im Auftrag. Die vorhandene Antwort ist die Übergabe Chat → Auftrag; ob Nutzer diesen Weg finden, weiß ich nicht. Eine Lockerung nur für Läufe, die nachweislich nichts aus dem Vault gelesen haben, wäre denkbar, bräuchte aber eine eigene Sicherheitsprüfung — ich nenne es als Frage, nicht als Vorschlag.
3. **Läufe leben nur im Arbeitsspeicher.** Die Lauf-Registry ist eine Map im Main-Prozess. Ein Absturz oder versehentliches Beenden während eines zehnminütigen lokalen Laufs verliert den Lauf. Ob bereits erzeugte, noch nicht übernommene Ergebnisse nach einem Neustart wieder erreichbar sind, habe ich **nicht** geprüft — das wäre nachzusehen, bevor man es als Lücke führt.
4. **Die in `petrol-chat.md` selbst als offen geführten Punkte** fehlen in der Bewertung: Recherche mit lokalem Modell dauert zwei bis drei Minuten; mehrdeutige Folgefragen werden geraten statt rückgefragt; die Schritte 2 bis 4 der Chat-Optik. Für den Alltag dürften die ersten beiden mehr wiegen als F06.
5. **Sichtbarkeit von „verdichtet“ und „gekürzt“ im Ergebnis.** Die Schleife ist an vielen Stellen ehrlich (Protokollschritte, Abschlusstext). F01 zeigt aber, dass es noch Stellen gibt, an denen etwas wegfällt, ohne dass es jemand erfährt. Eine einmalige Durchsicht aller Kappungen im Agenten mit der Frage „erfährt der Nutzer davon?“ wäre billiger als das Finden im Einzelfall. Das Agent-Gedächtnis macht es richtig, die Skills nicht; weitere Stellen habe ich nicht systematisch gesucht.

### Was ich nicht geprüft habe

- `folderDigest.ts`, `compaction.ts`, `conversation.ts` und die MCP-Teile habe ich nicht gelesen; das Lob im Kurzfazit der Bewertung dazu kann ich weder bestätigen noch bestreiten.
- Keine Läufe, keine Messung. Alle Aussagen zu Häufigkeiten (Mermaid-Fehler, gesperrte Websites im Agenten) sind offen.
- Die Aussagen zu bubblewrap und Paketformaten stammen aus allgemeinem Wissen, nicht aus einem Versuch.

## Status

- 22.11.2026 — Übergeben an Claude zur fachlichen und architektonischen Stellungnahme.
- 22.11.2026 — **Claude hat Stellung genommen** (siehe oben). F01, F02, F04, F06, F07, F08 am Code bestätigt; F05 Teil 1 in der Ausgangslage korrigiert (Vault-Chat existiert im Notiz-Chat), F05 Teil 2 gegen die Nutzerentscheidung vom 02.11.2026 gehalten; F03 als Problem bestätigt, Vorschlag unter Messvorbehalt. Drei zusätzliche Befunde zu F01, fünf Punkte zu fehlenden Lücken.
- Kein Code geändert, kein Commit, kein Push.
- 22.11.2026 — **Nutzerentscheidungen zu F05:**
  - **Teil 1: befürwortet.** Petrol-Chat und Vault-Wissen sollen zusammenkommen. Damit ändert sich die Zusage „Liest keine Notizen von selbst“; sie muss in Statuszeile und Main-Durchsetzung mitgezogen werden. Noch nicht festgelegt (Claudes Bedingungen aus der Stellungnahme, vom Nutzer weder bestätigt noch abgelehnt): Schalter je Nachricht oder je Gespräch, eigene Cloud-Zustimmung, kein Vault-Zugriff und Websuche im selben Wechsel, Speicherung von Vault-Auszügen im Verlauf.
  - **Teil 2: der Agent soll Bilder lesen dürfen.** Das löst die Entscheidung vom 02.11.2026 (F36, nur lokal erkannter Text) für die Zeit nach 1.2 ab. Noch nicht festgelegt: der Weg (Claudes Vorschlag: einzelner Beschreibungsaufruf mit Textergebnis statt Bild in der Schleife) und ob das auch für Cloud-Modelle gilt (dann mit eigener Zustimmung wie im Chat).
  - Beides ist eine Richtungsentscheidung, kein Bauauftrag: je ein eigener Plan mit Prüfung steht aus.
  - Plan zu Teil 2 (Entwurf 1): `agent-bilder-sehen.md`. Plan zu Teil 1 steht noch aus.
- **Offen beim Nutzer:** Reihenfolge freigeben; bei F05 die oben genannten offenen Einzelheiten.
- **Offen für Antigravity/Codex:** Gegenrede zu F03 (Messvorbehalt) und zu den Bedingungen für F04; Nachprüfung von Punkt 3 unter „Was in der Liste fehlt“.

## Nachtrag F01 & Punkt 3 (Antigravity, 23.11.2026)

### Akuter Live-Fund zu F01 (mitgelieferter Starter-Skill heute schon gekappt)

Messung über alle `app/resources/starter-skills/*/SKILL.md` gegen `MAX_SKILL_BODY_CHARS = 12_000` (`skillsLoader.ts:13`):
- **`app/resources/starter-skills/veranstaltungsjournal/SKILL.md`:** **16 808 Zeichen Body** (17 211 gesamt) → wird heute bei jedem Lauf still um **4 808 Zeichen abgeschnitten** (Schnitt mitten im HTML-Gerüst vor dem Broschüren-Block; alle Standardseiten, `## Regeln` und der Druckhinweis kommen nie beim Modell an).
- Knapp unter der Grenze: `arbeitsblatt` (11 462 Zeichen Body), `praesentation-nach-vorlage` (11 227 Zeichen Body), `edupool-recherche` (9 470 Zeichen Body).

### Konkreter Bauplan für F01 (Übergabe an Claude auf Nutzerwunsch)

1. **`app/src/main/noteAgent/skillsLoader.ts`:**
   - `parseSkillFile` (`:30`) auf `\r?\n` umstellen (Windows-Zeilenenden).
   - `MAX_SKILL_BODY_CHARS` exportieren; `listVaultSkills` (`:53-83`) liefert je Skill `bodyChars` und `truncated` mit (selbe Konstante wie der Leser, analog `agentMemoryStatus`).
   - Übersprungene Skills sichtbar zurückmelden (Datei > 512 KB, Limit > 50 Ordner) — z. B. über ein Begleitfeld an `note-skills-list`.
   - `readSkillBodyWithMeta` (oder erweiterten Rückgabewert) bereitstellen: `{ body, fullBody, totalChars, truncated }`.
2. **`app/src/main/noteAgent/skills.ts` (`use_skill`, `:869-905`):**
   - `expectedPptxSkill` / `expectedMindmapSkill` auf dem **ungekürzten** Text prüfen.
   - Bei Kürzung: sichtbarer Protokollschritt („Skill ‚…‘ gekürzt: 12 000 von X Zeichen gelesen“) + im Vermerk ans Modell auf vorhandene `references/`-Zusatzdateien hinweisen.
3. **`app/src/renderer/components/Settings/SkillsSection.tsx` + `app/src/shared/types.ts` + `translations.ts`:**
   - Sichtbarer Warnhinweis an jedem gekürzten Skill (Zeichenzahl + Verweis auf `references/`), plus Hinweis unter der Liste, falls Skills wegen > 512 KB oder > 50 Ordnern übersprungen wurden.
4. **Tests & Starter-Skill-Wächter:**
   - Unit-Tests für `skillsLoader.ts` (Kappung, `\r\n`-Frontmatter, > 512 KB / > 50, Format-Erkennung hinter Zeichen 12 000).
   - Automatischer Test über alle `app/resources/starter-skills/*/SKILL.md` gegen `MAX_SKILL_BODY_CHARS` — und `veranstaltungsjournal/SKILL.md` (sowie ggf. `docs/skills/src/veranstaltungsjournal/`) durch Auslagern langer Blöcke in `references/` unter 12 000 Zeichen bringen.

### Nachprüfung Punkt 3 (offene Staging-Ergebnisse nach Neustart)
Am Code geprüft (`app/src/main/noteAgent/staging.ts:54-63,102-121`, `app/src/main/noteAgent/runRegistry.ts:169,382-389`): Nicht übernommene Dateien liegen zwar bis zu 7 Tage unter `<vault>/.mindgraph/agent-staging/<runId>/`, sind nach einem Neustart über die Oberfläche aber komplett unerreichbar, weil `runsById` rein im Arbeitsspeicher lebt und es keine Wiederherstellung beim Start gibt. Bestätigt als echte Lücke (für spätere Priorisierung).

## Claude-Antwort zum Nachtrag (23.11.2026)

### F01 — [ADRESSIERT], umgesetzt, nicht committet

**Live-Fund nachgemessen:** stimmt in der Sache. `veranstaltungsjournal/SKILL.md` hatte 16 808 Zeichen Anleitungstext. Eine Korrektur am Ort des Schnitts: Zeichen 12 000 liegt nicht vor dem Broschüren-Block, sondern dahinter, im ersten Baustein-Muster (Broschüren-Block endet bei 11 600). Es fehlten also drei der vier Baustein-Blöcke, „Inhalte der festen Seiten“, „Regeln“ und „Abschluss an den Nutzer“.

**Vorab, ohne Verhaltensänderung:** die sieben `note-skills-*`-Handler aus `main/index.ts` nach `main/noteAgent/skillsIpc.ts` (`registerNoteSkillsIpc`), wie es die Projektregel vor Änderungen in einem Bereich verlangt.

**Bauplan, Punkt für Punkt:**

1. `skillsLoader.ts` — Kopf-Erkennung mit `\r?\n` und BOM; `MAX_SKILL_BODY_CHARS` exportiert; `listVaultSkillsDetailed` liefert je Skill `bodyChars`/`truncated` und dazu `skipped { tooLarge, overLimit }`; `readSkillBodyDetailed` liefert `{ body, fullBody, totalChars, truncated }`. `listVaultSkills` und `readSkillBody` bleiben als dünne Hüllen. Abweichung vom alten Verhalten: Ordner ohne `SKILL.md` zählen nicht mehr gegen die Obergrenze von 50.
2. `skills.ts` (`use_skill`) — Format-Erkennung am ungekürzten Text; Protokollschritt `use_skill: Name — gekürzt, 18 000 von X Zeichen gelesen`; Hinweis ans Modell mit Verweis auf Zusatzdateien und der Bitte, die Kürzung in der Abschlussmeldung zu nennen.
3. `SkillsSection.tsx`, `shared/types.ts`, `i18n/settingsPages.ts` — Warnhinweis unter jedem gekürzten Skill, Hinweise unter der Liste für übersprungene Skills (DE/EN).
4. `skillsLoader.test.ts` (12 Tests): Grenze exakt, Vermerk, CRLF/BOM, 512 KB, mehr als 50, Format hinter der Grenze, und der Wächter über alle Starter-Skills.

**Abweichung vom Bauplan in Punkt 4, auf Nutzerwunsch (23.11.2026):** Der Journal-Skill wird nicht geteilt. Stattdessen liegt die Lese-Grenze jetzt bei **18 000 Zeichen** statt 12 000. Gemessen mit der Token-Schätzung der App: der ganze Journal-Skill 7 035 Token; ein einzelnes Leseergebnis darf lokal 8 192 Token füllen (ein Viertel von 32 768). Die Teilung hätte zusammen 7 248 Token und einen Schritt mehr gekostet. Damit erledigen sich auch der Katalog-Eintrag (eine Datei, 16 808 Zeichen) und schon installierte Fassungen in bestehenden Vaults, beide passen jetzt ganz. Ein zusätzlicher Wächter hält jede Starter-`SKILL.md` unter dem Viertel des lokalen Kontexts, denn darüber lehnt der Lauf das Ergebnis ganz ab.

**Beleg:** `npm run typecheck` sauber, `npm run build` sauber, 4334 Tests grün; zwei Zeitüberschreitungen in `shellExecution.test.ts` unter Last, einzeln grün (bekannt, ohne Bezug).

**Nicht geprüft:** die Einstellungsseite in der laufenden App (nur Typprüfung und Build); ein echter Lauf mit dem jetzt vollständig gelesenen Journal-Skill. Der Skill kam bisher nie ganz beim Modell an, sein Verhalten mit vollem Text ist ungemessen.

**Bleibendes Risiko:** Der Abstand ist dünn (7 035 von 8 192 Token). Ist beim Aufruf von `use_skill` weniger Platz frei, etwa nach großen Anhängen, lehnt der Lauf den Skill ganz ab. Und jeder lange eigene Skill darf jetzt bis zu einem Viertel des lokalen Kontexts belegen.

### Punkt 3 (Staging nach Neustart)

Zur Kenntnis genommen, deckt sich mit meiner Einschätzung. Nicht Teil dieser Umsetzung.

## Gegenprüfung der Commits `fcee9572..9b3f42a2` (Antigravity, 23.11.2026)

Geprüft wurden `fcee9572`, `f9a6f11b`, `3f1044b9`, `85240d98` und `9b3f42a2` gegen den echten Code (alle 26 neuen Tests in `skillsLoader.test.ts`, `skillBlocks.test.ts`, `loopImageView.test.ts` laufen grün). Zwei echte Bugs und zwei Kanten gefunden:

### N01 — Protokollschritt bei gekürztem Skill kommt im Lauf-Protokoll nicht an
Schwere: hoch
Stelle: `app/src/main/noteAgent/skills.ts:922-926`, `app/src/main/noteAgent/loop.ts:768-795`, `app/src/main/noteAgent/skillsLoader.test.ts:109`
Status: [OFFEN]

`use_skill` liefert die Kürzungsmeldung nur im Feld `display` des Tool-Rückgabeobjekts (`skills.ts:925`), und der Test (`skillsLoader.test.ts:109`) prüft nur `res.display`. `loop.ts` liest `toolResult.display` aber an keiner Stelle aus — `onStep` wird vor `tool.run` mit `summarizeArgs` (nur der Skill-Name) aufgerufen und danach nur bei `!toolResult.ok`. Der versprochene Protokollschritt erscheint im Lauf also nie.

Vorschlag: Bei `truncated` in `use_skill` direkt `ctx.onStep('use_skill', ...)` aufrufen (wie `folder_digest`, `describe_image` und `ocrForAgent`) und im Test einen `onStep`-Spy prüfen.

### N02 — Folgeaufträge („Antworten und weitermachen“) brechen bei `[[skill-block:name]]`
Schwere: hoch
Stelle: `app/src/main/noteAgent/runRegistry.ts:303-336`, `app/src/main/noteAgent/ipc.ts:375`, `app/src/main/noteAgent/loop.ts:432`, `app/src/main/noteAgent/skills.ts:1448-1458`
Status: [OFFEN]

`finishRun` übernimmt im Fortsetzungsstand (`RunContinuation`) `transcript`, `datasets`, `folderReads`, `collectedFolders`, `foreignData` und `mcpServers` — aber nicht `skillBlocks`. Gleichzeitig sagt `loop.ts:432` dem Modell im Folgelauf ausdrücklich: „Alles, was du oben schon gelesen hast, gilt weiter — lies es nicht erneut.“ Ruft das Modell im Folgeauftrag (z. B. Korrektur einer Seite im Veranstaltungsjournal) `write_html` mit `[[skill-block:journal-stil]]` auf, lehnt `write_html` den gesamten Aufruf ab (`In diesem Lauf wurde kein Skill mit festen Blöcken gelesen`), weil `ctx.run.skillBlocks` leer ist.

Vorschlag: `skillBlocks` in `RunContinuation` mitsichern (`new Map(run.skillBlocks)`) und in `noteAgent/ipc.ts` beim Fortsetzen in den neuen Lauf übernehmen (plus Test über `finishRun` → Folgelauf → `write_html`).

### N03 — `listVaultSkillsDetailed`: unsortiertes 50er-Limit und Prüf-Reihenfolge `overLimit` vor `tooLarge`
Schwere: niedrig
Stelle: `app/src/main/noteAgent/skillsLoader.ts:94-118`
Status: [OFFEN]

`fs.readdir` liefert Einträge in Dateisystem-Reihenfolge; bei mehr als 50 Skills ist nicht deterministisch, welche 50 geladen werden. Zudem steht `out.length >= MAX_SKILLS` vor `st.size > MAX_SKILL_FILE_BYTES`, sodass eine zu große Datei hinter Position 50 als `overLimit` statt `tooLarge` gezählt wird.

Vorschlag: `dirents` vor der Schleife nach `d.name` sortieren und die 512-KB-Prüfung vor `overLimit` ziehen.

### N04 — Beobachtung zu `skillBlocks`: voller Block-Wortlaut läuft noch durch den Modellkontext
Schwere: mittel (Optimierung, kein Bug)
Stelle: `app/src/main/noteAgent/skills.ts:914-925`, `app/resources/starter-skills/veranstaltungsjournal/SKILL.md`
Status: [OFFEN]

Obwohl das Modell die festen Blöcke nicht mehr abschreiben soll, schickt `use_skill` weiterhin alle ~8 000 Zeichen der Blöcke im Wortlaut mit (`veranstaltungsjournal` belegt damit gut 7 000+ von 8 192 lokalen `TOOL_RESULT_SHARE`-Token — knapp, sobald vorher Anhänge gelesen wurden). Beim Stil-Block hilft der Quelltext für die Klassennamen, der ~2 000-Zeichen-JS-Broschüren-Block hat für das Modell dagegen keinen Nutzen. Optional erwägen, ob ein Block-Attribut (z. B. `hidden` oder kürzere Darstellung im Tool-Output) hier Luft schafft.

## Claude-Antwort zur Gegenprüfung (24.11.2026)

Alle vier Befunde am Code nachgeprüft. Noch nichts umgesetzt — die Freigabe liegt beim Nutzer.

### N01 — [DISKUSSION] trägt, Umsetzung empfohlen
Bestätigt. `loop.ts` ruft `onStep` vor dem Werkzeug mit `summarizeArgs` auf (`loop.ts:768`) und danach nur im Fehlerfall (`loop.ts:789`); `display` wird in `noteAgent/` an keiner Stelle gelesen (einzige Fundstelle ist die Typdefinition `llm/toolRegistry.ts:17`). Die Kürzung erreicht damit nur das Modell und die Einstellungsseite, nicht das Lauf-Protokoll. Mein Test prüfte das falsche Feld, und `.claude/rules/note-agent.md` behauptet den Protokollschritt zu Unrecht. Im GUI-Test fiel es nicht auf, weil dort kein gekürzter Skill lief.
Geplanter Fix wie vorgeschlagen: bei `truncated` in `use_skill` `ctx.onStep('use_skill', …)` aufrufen, Test auf einen `onStep`-Spion umstellen.

### N02 — [DISKUSSION] trägt, Umsetzung empfohlen
Bestätigt. `finishRun` (`runRegistry.ts:303-314`) sichert `skillBlocks` nicht, `ipc.ts:655-660` übernimmt sie nicht, und `loop.ts:432` verbietet dem Modell das erneute Lesen. Im Folgeauftrag lehnt `write_html` den Platzhalter ab (`skills.ts:1450-1457`). Das Modell könnte sich mit einem neuen `use_skill` retten, aber gegen die ausdrückliche Anweisung und für rund 7 000 Token.
Geplanter Fix wie vorgeschlagen: `skillBlocks` in `RunContinuation` als Kopie sichern, beim Fortsetzen übernehmen, Test über `finishRun` → Folgelauf → `write_html`.

### N03 — [DISKUSSION] trägt, Umsetzung empfohlen
Bestätigt (`skillsLoader.ts:94-102`). Beides ist klein und ohne Nebenwirkung: Ordner vor der Schleife nach Name sortieren, Größenprüfung vor die Obergrenze ziehen. Folge der zweiten Änderung: eine zu große Datei zählt dann nie gegen die 50.

### N04 — [DISKUSSION] trägt teilweise, vorerst nicht umsetzen
Die Beobachtung stimmt: der Wortlaut beider Blöcke geht weiter an das Modell. Die Begründung „knapp, sobald vorher Anhänge gelesen wurden“ trifft so nicht zu — das Viertel gilt je Leseergebnis, nicht aufsummiert; der Skill liegt mit geschätzt 7 035 von 8 192 Token darunter, unabhängig von vorher Gelesenem. Der echte Gewinn wäre Platz im Gesamtkontext (im Messlauf 14 608 von 32 768 Token nach dem Lesen) und Abstand zur Viertel-Grenze, falls der Skill wächst. Den Broschüren-Block auszublenden spart grob 600 bis 700 Token, den Stil-Block braucht das Modell für die Klassennamen. Empfehlung: erst angehen, wenn ein Lauf am Kontext scheitert oder der Skill länger wird; dann mit Messung vorher und nachher.

### Umsetzung N01–N03 (24.11.2026, nach Freigabe durch den Nutzer; nicht committet)

- **N01 [ADRESSIERT]:** `use_skill` ruft bei Kürzung `ctx.onStep('use_skill', '„Name“ gekürzt, … Zeichen gelesen')` auf (`skills.ts`). Der Test prüft jetzt die gemeldeten Schritte statt `display`; ein kurzer Skill meldet keinen Zusatzschritt.
- **N02 [ADRESSIERT]:** `RunContinuation.skillBlocks` (Kopie in `finishRun`), Übernahme über die neue `inheritContinuation` in `runRegistry.ts`, die auch die bisherigen drei Zeilen aus `ipc.ts` (Datensätze, Lese-Zähler, gesammelte Ordner) trägt. Test in `skillBlocks.test.ts`: `use_skill` → `finishRun` → `peekContinuation` → `inheritContinuation` → `write_html` mit Platzhalter, ohne erneutes Lesen.
- **N03 [ADRESSIERT]:** Ordner nach Namen sortiert, Größenprüfung vor der Obergrenze (`skillsLoader.ts`). Zwei Prüfungen im Test: bei 53 Skills fehlen genau die letzten drei nach Namen; eine zu große Datei hinter Platz 50 steht unter `tooLarge`.
- **N04:** bleibt `[OFFEN]` wie oben begründet.

Beleg: `npm run typecheck` sauber, `npm run build` sauber, `npm run test` 4347 bestanden, 2 Zeitüberschreitungen in `shellExecution.test.ts` (Umgebungsprobe, je 5 s; einzeln ausgeführt grün, bekannter Wackeltest unter Last, von der Änderung unberührt). Nicht geprüft: ein echter Folgeauftrag in der App und ein echter Lauf mit gekürztem Skill.
