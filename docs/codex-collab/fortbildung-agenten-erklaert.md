# Fortbildung „Wie arbeiten Agenten?" – Auffassung zur Prüfung

## Aufgabe

Zielgruppe: Lehrkräfte und Referenten in der Lehrkräftefortbildung, keine Entwickler.
Ziel: (1) verstehen, wie ein Agent grundsätzlich arbeitet, (2) sehen, wie sich der
Notiz-Agent (petrolfarbener „Agent"-Knopf) in MindGraph Notes von anderen Agenten
unterscheidet, (3) wissen, welche Einstellungen man konkret verändern kann.
Endprodukt: eine Grafik (Excalidraw), die im Vortrag gezeigt wird.

**Bitte an Codex:** Prüfe jede Aussage gegen den Code. Besonders: stimmt jede
Behauptung in Abschnitt 2 und 3 so? Fehlt eine Einstellung, ist eine falsch
benannt, oder ist ein Vergleich in Abschnitt 4 unfair/falsch? Findings als F01… mit
Datei:Zeile.


## Kontext/Anker

- Lauf-Schleife, Iterationsgrenzen: `app/src/main/noteAgent/loop.ts:24`, `:41`, `:333`
- Werkzeugdefinitionen: `app/src/main/noteAgent/skills.ts` (alle `name: '…'`), `shellTools.ts`, `computerTools.ts`
- Modellweg + Cloud-Freigabe: `app/src/shared/agentRoute.ts:42` (`classifyRoute`), `:86` (`evaluateCloudGate`)
- Staging statt Direktschreiben: `app/src/main/noteAgent/staging.ts:1-18`
- Shell-Budget: `app/src/main/noteAgent/shellExecution.ts:17`; Rechner-Budget: `app/src/main/noteAgent/computerControl.ts:22`
- Gedächtnis + Skills: `app/src/main/noteAgent/skillsLoader.ts:11`, `:179`; Merksatz-Vorschlag: `app/src/main/noteAgent/memorySuggestion.ts:1-5`
- Agent-Tab, Modellpräzedenz: `app/src/renderer/components/Agent/AgentView.tsx:190-192`
- Einstellungen: `app/src/renderer/components/Settings/Settings.tsx:1789-1800`, `AgentShellSection.tsx`, `ComputerControlSection.tsx`, `AgentCloudConsentCard.tsx`; persistierte Schlüssel `app/src/renderer/stores/uiStore.ts:1309`
- Starter-Skills: `app/resources/starter-skills/`

## Auffassung (Prüfgegenstand)

## 1. Was jeder Agent tut (Kernschleife – gilt für alle)

Auftrag → Modell plant den nächsten Schritt → wählt ein **Werkzeug** → App führt es
aus → Modell sieht das Ergebnis → nächster Schritt … → Abschluss.
Der Unterschied zwischen Chatbot und Agent: der Agent darf Werkzeuge aufrufen und
mehrere Schritte ohne Zwischenfrage gehen. Das Modell selbst „tut" nichts – es
schreibt nur, welches Werkzeug es mit welchen Werten möchte. **Was ein Agent darf,
entscheidet der Rahmen um das Modell, nicht das Modell.**

Didaktischer Kern: Der Unterschied zwischen Agenten liegt fast nie in der Schleife,
sondern im Rahmen: Wo rechnet das Modell? Was darf es lesen? Was darf es schreiben?
Wer gibt frei? Wie lange darf es laufen?

## 2. Der Rahmen des Notiz-Agenten (Behauptungen)

1. **Wo rechnet das Modell** – Lokal (Ollama), Cloud (OpenRouter, LLMBase, Ollama-Cloud)
   oder „nicht geprüft" (LM Studio). Die App stuft den Weg selbst ein
   (`shared/agentRoute.ts`, Main `classifyAgentRoute`) und zeigt ihn auf der Karte.
   Lokal nur nach Metadatenprüfung, nicht nach Name/Port.
   Cloud nur nach einmaliger Zustimmung (`noteAgentCloudConsentVersion`), bei
   OpenRouter/LLMBase zusätzlich Feature-Opt-in für den Notiz-Agenten.
2. **Was er lesen darf** – Notizen im Vault (`note_search`, `note_read` nur `.md`,
   optional `vault_search` über den lokalen Vault-Index) und ausdrücklich angehängte
   Dateien/Ordner (`read_attachment`, `list_context_folder`, `read_context_file`,
   `collect_table`). Keine beliebigen Dateien des Rechners, kein Upload-Dialog.
   Web nur mit Modul + Globus pro Lauf.
3. **Was er schreiben darf** – nie direkt ins Vault. Alles landet zuerst in
   `.mindgraph/agent-staging/<runId>/`; der Mensch übernimmt oder verwirft jede
   Ergebnis-Karte. Höchstens zwei Ergebnisse pro Lauf (jedes Format einmal), mit
   Webrecherche genau eins plus deterministisch erzeugter Quellenblock.
   Ausgabeformate: Notiz, Word (auch mit Briefkopf-Vorlage / Formular), Excel,
   PowerPoint nach Vorlage, HTML-Seite, Edumap, Bild.
4. **Werkzeuge sind benannte Vorgänge, kein freier Code** – Ausnahmen nur per Opt-in:
   Shell (Betriebssystem-Sandbox, Schreiben nur im Arbeitsordner) und
   Rechner-Steuerung (vier feste Vorgänge: öffnen, im Finder zeigen, drucken,
   Mail-Entwurf – nie senden).
5. **Wie lange** – 12 Schritte, 20 mit Ordner/Shell/Rechner-Steuerung; Budgets für
   Web, Shell (20 Befehle), Rechner (10 Vorgänge, Fehlversuche zählen).
6. **Wissen und Gedächtnis sind sichtbare Notizen** – Skills als `Skills/<name>/SKILL.md`
   im Vault (Starter-Skills: Arbeitsblatt, Elternbrief, Protokoll, Edumap, Präsentation
   …), Gedächtnis als `Skills/Agent-Gedächtnis.md`. Ein Merksatz wird nach dem Lauf nur
   vorgeschlagen, gespeichert erst per Klick „Merken".
7. **Transparenz** – Aufklapper „Welche Daten wohin gehen", Laufprotokoll mit
   Schritten und Zeit, Arbeitsbilanz (gemessene aktive Zeit gegen Referenzzeit).

## 3. Einstellungen, die man konkret ändern kann

| Ebene | Einstellung | Standard |
|---|---|---|
| Pro Auftrag | Modell (Picker im Agent-Tab) | Modul-Override → globales Modell |
| Pro Auftrag | Ziel­ordner (ohne Ziel: nur Umschreib-Vorschlag der Notiz) | leer |
| Pro Auftrag | Anhänge: Notizen, Dateien, Ordner | keine |
| Pro Auftrag | Globus = Webrecherche | aus |
| Pro Auftrag | Shell-Schalter + Systemdialog | aus |
| Pro Auftrag | Rechner-Schalter + Systemdialog | aus |
| Einstellungen → KI | Cloud-Zustimmung Notiz-Agent | nicht erteilt |
| Einstellungen → KI | OpenRouter / LLMBase: für Notiz-Agent freigeben + Modell | aus |
| Einstellungen → KI | Vault-Index (Opt-in pro Vault) → `vault_search` | aus |
| Einstellungen → KI | Webrecherche-Anbieter Tavily / SearXNG / Linkup + Schlüssel | – |
| Einstellungen → KI | Shell-Schutzgrenzen: Lesen nur Anhänge ↔ ganzer Vault; Netz gesperrt ↔ erlaubt | nur Anhänge, Netz gesperrt |
| Einstellungen → KI | Rechner-Steuerung: erlaubte Vorgänge + Programme (Drucken aus) | – |
| Einstellungen → Module | Webrecherche, Agent-Shell, Rechner-Steuerung, Bild-Generierung | alle aus |
| Einstellungen → Skills | Skills ein/aus, eigene Skills anlegen | Starter-Skills |
| Vault | `Skills/Agent-Gedächtnis.md` von Hand bearbeiten | leer |
| Allgemein → Zeitbilanz | Referenzzeit je Tätigkeit / Skill | – |

Nicht einstellbar (bewusst): Schreiben direkt ins Vault, Shell schreibt außerhalb des
Arbeitsordners, Mail senden, `.mindgraph` lesen, Modell erweitert seine eigenen Rechte.

## 4. Vergleich mit anderen Agenten (typische Voreinstellung, nicht absolut)

| Frage | Chat-Assistent mit Agent-Modus (z. B. ChatGPT, Copilot) | Coding-Agent im Terminal (z. B. Claude Code, Codex) | Notiz-Agent MindGraph |
|---|---|---|---|
| Wo rechnet das Modell? | Cloud des Anbieters | Cloud des Anbieters | wählbar, lokal möglich, Weg wird angezeigt |
| Was liest er? | Hochgeladenes, Web, verbundene Konten | ganzer Projektordner, oft mehr | Vault + ausdrückliche Anhänge |
| Wie schreibt er? | eigene Dokumente/Antworten in der Cloud | direkt in Dateien, Freigabestufen einstellbar | nur Vorschlag, Mensch übernimmt |
| Werkzeuge | Browser, Code-Umgebung in der Cloud | freie Shell | benannte Vorgänge, Shell nur opt-in + Sandbox |
| Wissen über mich | Anbieter-Gedächtnis | Projektdatei (CLAUDE.md / AGENTS.md) | Skills + Gedächtnis als Notiz im Vault |

Aussage für die Fortbildung: Kein Agent ist „sicher" oder „unsicher" an sich – man
fragt bei jedem Agenten dieselben fünf Fragen (Wo rechnet er? Was liest er? Was
schreibt er? Wer gibt frei? Wie lange darf er?). MindGraph beantwortet sie sichtbar
und mit einer engen Voreinstellung.

## 5. Grafik-Plan (Excalidraw)

Drei Bereiche nebeneinander/untereinander:
A. Kernschleife (Kreis: Auftrag → Planen → Werkzeug → Ergebnis → … → Abschluss).
B. Notiz-Agent als Zwiebel: Modell in der Mitte, Ringe = Lesen / Werkzeuge /
   Schreiben (Staging → Mensch) / Budget; außen Regler = Einstellungen.
C. Fünf Fragen als Vergleichsraster (drei Spalten).

## Codex-Findings

### F01 — Kernschleife zu absolut formuliert
Schwere: mittel
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:31
Status: [OFFEN]
„Gilt für alle“ und „wählt ein Werkzeug“ sind als Definition zu eng: Der Notiz-Agent kann ohne Werkzeugaufruf mit einer Textantwort erfolgreich enden (`app/src/main/noteAgent/loop.ts:367-410`). Das Modell erzeugt auch diesen Antworttext; „tut nichts“ meint nur, dass es Werkzeugwirkungen nicht selbst ausführt. Andere Agenten müssen keine identische Schleife haben.
Vorschlag: Als typischen Werkzeug-Agenten-Ablauf kennzeichnen und erklären: Das Modell erzeugt Text oder Werkzeuganfragen; die App entscheidet und führt erlaubte Aufrufe aus.

### F02 — „Keine beliebigen Dateien“ braucht die Shell-Ausnahme
Schwere: hoch
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:52
Status: [OFFEN]
Die Aussage gilt für die normalen Datei-Werkzeuge, nicht für einen freigegebenen Shell-Lauf. In den Einstellungen kann `readScope: 'vault'` den ganzen Vault lesbar machen; mit `network: true` darf der Shell-Prozess auch Netzwerkverbindungen öffnen (`app/src/shared/shellGuardrails.ts:10-19`, `app/src/main/noteAgent/loop.ts:92-101`). Ordner-Anhänge eröffnen zudem `folder_digest` und `peek_dataset`, die in der Aufzählung fehlen (`app/src/main/noteAgent/loop.ts:223-233`).
Vorschlag: Die normale Leseliste als Grundmodus bezeichnen und Shell-Rechte sowie Ordnerauswertung gesondert nennen.

### F03 — `.mindgraph` ist für `note_read` nicht pauschal gesperrt
Schwere: hoch
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:97
Status: [OFFEN]
`note_read` übernimmt die Telegram-Lesefunktion (`app/src/main/noteAgent/skills.ts:725-752`). Diese verlangt `.md` und Vault-Containment, schließt aber `.mindgraph` nicht aus (`app/src/main/telegram/agent/tools/notes.ts:81-102`, `app/src/main/telegram/agent/tools/vaultPaths.ts:47-56`). Eine dort liegende Markdown-Datei kann per bekanntem Pfad gelesen werden. Dass der Vault-Index versteckte Pfade ausschließt (`app/src/shared/rag/vaultIndex.ts:205-218`), ändert `note_read` nicht.
Vorschlag: „`.mindgraph` lesen“ aus „nicht einstellbar“ streichen oder die Lesesperre im Code tatsächlich durchsetzen und danach erneut prüfen.

### F04 — Ergebniszahl nur im Prompt begrenzt
Schwere: hoch
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:59
Status: [OFFEN]
„Höchstens zwei Ergebnisse, jedes Format einmal“ ist eine Anweisung an das Modell (`app/src/main/noteAgent/loop.ts:188`), keine harte Grenze: `registerResult` fügt jedes Ergebnis ohne Zähl- oder Formatprüfung hinzu (`app/src/main/noteAgent/runRegistry.ts:304-311`). Bei Shell-Läufen erlaubt `shell_stage_file` ausdrücklich bis zu zehn Ergebnis-Karten (`app/src/main/noteAgent/shellTools.ts:49-52`). Bilder können ebenfalls eigene Karten vor dem Dokument erzeugen (`app/src/main/noteAgent/skills.ts:1448-1484`). Im Web-Lauf ist nur der abschließende Dokument-Writer einmalig begrenzt; Bilder davor sind möglich (`app/src/main/noteAgent/skills.ts:1466-1468`).
Vorschlag: „Im Grundmodus weist die App das Modell zu höchstens zwei Dateien an; Shell kann bis zu zehn anbieten. Bei Webrecherche genau ein abschließendes Dokument, gegebenenfalls mit zuvor erzeugten Bildern.“

### F05 — „Nie direkt ins Vault“ verdeckt andere Wirkungen
Schwere: mittel
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:57
Status: [OFFEN]
Für Ergebnis-Writer stimmt das Staging (`app/src/main/noteAgent/staging.ts:1-4`). Ein bestätigter Merksatz wird aber direkt nach `Skills/Agent-Gedächtnis.md` geschrieben (`app/src/main/noteAgent/skillsLoader.ts:209-229`), und freigegebene Rechner-Vorgänge können drucken oder einen Mail-Entwurf in Apple Mail anlegen (`app/src/main/noteAgent/computerControl.ts:73-100`). Die Ergebnis-Karten sind damit nicht die einzige menschliche Freigabestelle für Wirkungen.
Vorschlag: „Erzeugte Ergebnisdateien werden vor der Übernahme zwischengespeichert“ sagen; Merken, Drucken und Mail-Entwurf als eigene Aktionen nennen.

### F06 — Bild-Generierung ist ein zusätzlicher Cloud-Weg
Schwere: hoch
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:46
Status: [OFFEN]
Die Aufzählung der Modellwege kann bei Laien den Eindruck erzeugen, ein lokal eingestelltes Modell halte den gesamten Auftrag lokal. `generate_image` ruft Google Nano Banana mit dem Bild-Prompt auf (`app/src/main/noteAgent/skills.ts:1444-1474`); es erscheint, sobald Bild-Modul **und** Google-AI-Studio-Key vorhanden sind (`app/src/main/index.ts:4805-4815`). Die Oberfläche sagt ausdrücklich, dass der Prompt auch Angaben aus Notizen oder Anhängen enthalten kann (`app/src/renderer/utils/i18n/agentCard.ts:75-76`). Websuche und erlaubtes Shell-Netz sind weitere getrennte Datenwege (`app/src/renderer/utils/i18n/agentCard.ts:73-79`).
Vorschlag: Modellweg und zusätzliche Dienste getrennt visualisieren; „lokales Modell“ nicht als Aussage über den ganzen Lauf verwenden.

### F07 — Bild-Key als notwendige Einstellung fehlt
Schwere: mittel
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:92
Status: [OFFEN]
Die Tabelle nennt nur den Modul-Schalter. Ohne hinterlegten Google-AI-Studio-Key wird `generate_image` nicht angeboten (`app/src/main/index.ts:4805-4815`). Das Key-Feld steht unter Einstellungen → KI auf der Karte „Bild-Generierung“ (`app/src/renderer/components/Settings/Settings.tsx:1785-1789`, `app/src/renderer/components/Settings/ImageGenerationSection.tsx:61-80`). Die Bildgenerierung ist kein bloß lokales Ausgabeformat.
Vorschlag: Eigene Zeile „KI → Bild-Generierung: Google-AI-Studio-Key; Standard kein Key“ ergänzen.

### F08 — Starter-Skills sind kein allgemeiner Standardbestand
Schwere: mittel
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:93
Status: [OFFEN]
Die Skills-Seite bietet „Starter-Skills installieren“ als eigene Handlung (`app/src/renderer/components/Settings/SkillsSection.tsx:171-186`). `listVaultSkills` gibt bei fehlendem `Skills/`-Ordner eine leere Liste zurück; vorhandene Skills sind standardmäßig aktiv, solange sie nicht unter `skillsDisabled` stehen (`app/src/main/noteAgent/skillsLoader.ts:40-82`). „Standard: Starter-Skills“ setzt also deren Installation voraus.
Vorschlag: Standard „keine, falls nicht installiert; installierte Skills zunächst aktiv“ und Starter-Skills als Installationsoption ausweisen.

### F09 — Vault-Index braucht Modul, Aufbau und lokales Embedding
Schwere: mittel
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:88
Status: [OFFEN]
Die Index-Karte erscheint nur bei aktivem `project-rag`-Modul und nicht im LM-Studio-Zweig (`app/src/renderer/components/Settings/Settings.tsx:1775-1783`). Der Schalter allein stellt `vault_search` nicht bereit: Main bietet es nur an, wenn `isQueryable` wahr ist (`app/src/main/index.ts:4817-4829`); die Oberfläche hat dafür einen eigenen Erstellen/Neuaufbauen-Schritt (`app/src/renderer/components/Settings/VaultIndexSection.tsx:145-192`).
Vorschlag: „Module → Notizen befragen (RAG) einschalten; KI → Vault-Index pro Vault aktivieren und erstellen; `vault_search` erst bei abfragbarem Index“ schreiben.

### F10 — Zielordner ohne Ziel ist im Agent-Tab nicht startbar
Schwere: hoch
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:81
Status: [OFFEN]
Die Tabelle verspricht einen Modus „ohne Ziel: nur Umschreib-Vorschlag der Notiz“. Im beschriebenen Agent-Tab setzt `canRun` aber `hasTarget` voraus (`app/src/renderer/components/Agent/AgentView.tsx:405-406`, `:458-467`); dieser Lauf hat zudem keine Ausgangsnotiz, sondern `noteContent: ''` (`app/src/renderer/components/Agent/AgentView.tsx:486-491`).
Vorschlag: Zielordner als Pflichtfeld des Agent-Tabs erklären; falls ein anderer Editor-Modus gemeint ist, ihn ausdrücklich benennen und separat belegen.

### F11 — Modellstandard unterschlägt die Tab-Auswahl
Schwere: niedrig
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:80
Status: [OFFEN]
`effectiveModel` hat drei Stufen: Auswahl im Tab → Modul-Override → globales Modell (`app/src/renderer/components/Agent/AgentView.tsx:190-193`). Die Tabellenzelle nennt nur die letzten zwei und lässt die mögliche explizite Auswahl missverständlich erscheinen.
Vorschlag: „Tab-Auswahl → Modul-Override → globales Modell“ eintragen.

### F12 — Zeitbilanz ist eine Schätzung mit Auslassungen
Schwere: mittel
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:74
Status: [OFFEN]
Die „Referenzzeit“ wird vom Nutzer eingetragen und als geschätzt oder gemessen markiert (`app/src/renderer/components/Settings/GeneralSettingsTab.tsx:273-298`); für Skills fragt die Ergebnis-Karte nach einer pauschalen Referenz für alle Läufe (`app/src/renderer/components/Agent/SkillReferencePrompt.tsx:1-6`). Ohne gemessene aktive Zeit wird ein Lauf nicht bewertet (`app/src/shared/activityLog.ts:1093-1100`), und der ausgewiesene Nutzen ist `Referenzzeit minus aktive Zeit`, nicht eine objektiv gemessene Einsparung (`app/src/shared/activityLog.ts:1116-1124`).
Vorschlag: „Arbeitsbilanz: gemessene Vordergrundzeit gegen eine vom Nutzer gesetzte Referenz; nur bewertbare Läufe, Schätzwerte entsprechend kennzeichnen“.

### F13 — „Cloud des Anbieters“ und Cloud-Dokumente sind zu pauschal
Schwere: mittel
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:104
Status: [OFFEN]
Die Produktspalten vermischen ChatGPT/ChatGPT Work, Microsoft 365 Copilot und Coding-Agenten. ChatGPT Work kann laut [OpenAI-Dokumentation](https://help.openai.com/en/articles/20001548-agent-security-and-local-work-sync-in-chatgpt) auch mit freigegebenen lokalen Dateien und Werkzeugen auf einem verbundenen Rechner arbeiten. Microsofts [Word/Excel/PowerPoint-Agenten](https://learn.microsoft.com/en-gb/copilot/microsoft-365/wordexcelppt-agents) erstellen Dateien in OneDrive; Copilot ist daher kein einheitlicher „Chat-Assistent“, dessen Schreibweise stets „eigene Dokumente/Antworten in der Cloud“ ist. Auch die Zeile „Was liest er?“ hängt bei Copilot von den Berechtigungen der Datenquelle ab ([Microsoft-Dokumentation](https://learn.microsoft.com/en-us/sharepoint/manage-access-agents-in-sharepoint)).
Vorschlag: Konkrete Betriebsarten und Produkte benennen oder die Spalten als mögliche Beispiele statt typische feste Voreinstellungen formulieren.

### F14 — Vergleich lässt Freigaben und Datengrenzen der anderen Agenten weg
Schwere: mittel
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:105
Status: [OFFEN]
„Ganzer Projektordner, oft mehr“ und „freie Shell“ klingen wie unbegrenzte Standardrechte. Coding-Agenten können Sandbox- und Freigabestufen haben; OpenAI beschreibt für Codex ausdrücklich Freigaben für Befehle, Dateiänderungen, Netz und verbundene Werkzeuge ([OpenAI-Dokumentation](https://developers.openai.com/blog/mastering-codex-remote-for-engineering)). Umgekehrt ist MindGraphs Spalte nicht ausnahmslos „nur Vorschlag“: mit Opt-in gibt es Shell- und Rechnerwirkungen (`app/src/main/noteAgent/loop.ts:92-111`, `app/src/main/noteAgent/computerControl.ts:73-100`).
Vorschlag: In jeder Spalte zwischen voreingestellter Berechtigung, erweiterbarer Freigabe und tatsächlichem Ausführungsort unterscheiden; die fünf Fragen für alle Produkte gleich beantworten.

### F15 — „Enge Voreinstellung“ braucht Plattform- und Qualitätsgrenzen
Schwere: mittel
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:110
Status: [OFFEN]
Die Shell- und Rechner-Module sind derzeit macOS-spezifisch (`app/src/renderer/stores/uiStore.ts:592-594`), und „lokal“ beschreibt nur den überprüften Modellweg, nicht Datenschutz oder Ergebnisrichtigkeit (`app/src/shared/agentRoute.ts:38-64`; weitere Datenwege: `app/src/renderer/utils/i18n/agentCard.ts:73-81`). Die App kann einen Lauf sogar mit reiner Modell-Textantwort ohne Datei abschließen (`app/src/main/noteAgent/loop.ts:381-410`); die Ergebnisprüfung bleibt Sache des Menschen.
Vorschlag: Für Laien ausdrücklich ergänzen: „Lokal“ heißt nur, dass das geprüfte Modell auf diesem Rechner läuft. Inhalte und Ergebnisse trotzdem prüfen; aktivierte Zusatzdienste und freigegebene Aktionen getrennt beachten.

### F16 — Zwölf „Schritte“ sind Modellrunden, nicht Werkzeugaktionen
Schwere: mittel
Stelle: docs/codex-collab/fortbildung-agenten-erklaert.md:67
Status: [OFFEN]
`MAX_ITERATIONS = 12` und `MAX_ITERATIONS_FOLDER = 20` begrenzen die Schleife der Modellaufrufe (`app/src/main/noteAgent/loop.ts:24-41`, `:333-349`). In einer Runde werden alle zurückgegebenen `toolCalls` nacheinander ausgeführt (`app/src/main/noteAgent/loop.ts:413-435`); die Zahl der Werkzeugaktionen ist also nicht gleich 12 bzw. 20. Web begrenzt separat auf acht Suchen und zehn Abrufe (`app/src/shared/webResearch.ts:79-80`).
Vorschlag: „Bis zu 12 Modellrunden, mit Ordner/Shell/Rechner bis zu 20; innerhalb einer Runde können mehrere Werkzeuge laufen. Dazu eigene Werkzeug-Budgets“ formulieren.

Nachprüfung Runde 2: F01, F04, F07–F12, F13/F14 und F16 sind in der Grafik im Wesentlichen umgesetzt; F03 ist wie angekündigt aus der Grafik entfernt. F02, F05, F06 und F15 sind nur mit den folgenden Präzisierungen tragfähig. Die Aussage, dass Webrecherche nicht mit Shell oder Rechner im selben Lauf kombinierbar ist, stimmt (`app/src/main/index.ts:4625-4627`, `:4662-4666`). Zielordnerpflicht, Cloud-Gate und der fehlende Sendevorgang der **Rechner-Steuerung** sind ebenfalls belegt (`app/src/renderer/components/Agent/AgentView.tsx:405-406`, `:458-459`; `app/src/shared/agentRoute.ts:86-100`; `app/src/shared/computerControl.ts:14-26`).

### F17 — Rechner-Steuerung hat keine Sandbox
Schwere: hoch
Stelle: docs/fortbildung/agenten-verstehen.excalidraw:1409
Status: [OFFEN]
„Shell / Rechner: … mit Sandbox“ schreibt beiden Fähigkeiten denselben Schutz zu. Die Rechner-Steuerung wirkt ausdrücklich **außerhalb** einer Sandbox; ihr Schutz sind vier fest benannte Vorgänge und die Freigabe je Lauf (`app/src/main/noteAgent/computerControl.ts:1-10`, `app/src/shared/computerControl.ts:24-26`). Nur Shell-Befehle laufen durch `sandbox-exec` (`app/src/main/noteAgent/shellExecution.ts:194-207`). Die Grafik zeigt die Formulierung im großen Werkzeugkasten, daher ist das für Lehrkräfte ein zentraler falscher Sicherheitseindruck.
Vorschlag: „Shell: Sandbox; Rechner: vier feste Vorgänge, Freigabe pro Lauf“ getrennt schreiben.

### F18 — Dritter Modellweg „nicht geprüft“ fehlt
Schwere: hoch
Stelle: docs/fortbildung/agenten-verstehen.excalidraw:1257
Status: [OFFEN]
Die Grafik nennt nur „lokal (von der App geprüft) oder Cloud“ und wiederholt diese Zweiteilung im Vergleichsraster (`docs/fortbildung/agenten-verstehen.excalidraw:1257`, `:3032`). Der Code kennt aber `unverified`: LM Studio wird immer so eingestuft; Ollama bei fehlender/uneindeutiger Metadatenprüfung ebenfalls (`app/src/shared/agentRoute.ts:15-16`, `:50-64`). Für `unverified` greift die Cloud-Zustimmung nicht (`app/src/shared/agentRoute.ts:86-91`), obwohl die Oberfläche davor warnt, dass Vault-Inhalte den Rechner verlassen können (`app/src/renderer/utils/i18n/agentCard.ts:59-67`).
Vorschlag: Drei Wege zeigen: „nachweislich lokal“, „Cloud mit Zustimmung“, „Ausführungsort nicht geprüft (z. B. LM Studio)“.

### F19 — „Web nur mit Globus“ gilt nicht bei Shell-Netz
Schwere: mittel
Stelle: docs/fortbildung/agenten-verstehen.excalidraw:1331
Status: [OFFEN]
Für die eingebauten `web_search`/`web_fetch`-Werkzeuge stimmt der Globus (`app/src/main/noteAgent/loop.ts:255-259`). Die Grafik sagt zugleich „Web nur mit Globus“ im Lesekasten und Vergleichsraster (`docs/fortbildung/agenten-verstehen.excalidraw:1331`, `:3201`). Eine freigegebene Shell mit `network: true` kann jedoch selbst Internetverbindungen aufbauen; `sandbox-exec` verbietet Netz nur, wenn diese Einstellung aus ist (`app/src/shared/shellGuardrails.ts:10-19`, `app/src/main/noteAgent/shellSandbox.ts:63-69`). Der orange Kasten „Shell-Netz, falls erlaubt“ widerspricht der pauschalen Kurzform.
Vorschlag: „Eingebaute Webrecherche nur mit Globus; die gesondert freigegebene Shell kann bei erlaubtem Netz ebenfalls ins Internet“.

### F20 — „Mails senden“ ist nur als Rechner-Vorgang ausgeschlossen
Schwere: hoch
Stelle: docs/fortbildung/agenten-verstehen.excalidraw:2646
Status: [OFFEN]
Die rote Liste „Bewusst nicht einstellbar: Mails senden“ lässt einen absoluten Ausschluss erwarten. Das stimmt für die Rechner-Steuerung: Sie hat `mail_draft`, keinen Sende-Vorgang (`app/src/shared/computerControl.ts:14-26`; `app/src/main/noteAgent/computerControl.ts:73-100`). Eine freigegebene Shell führt jedoch frei formulierte Befehle aus (`app/src/main/noteAgent/shellExecution.ts:120-130`, `:194-207`); mit eingeschaltetem Netz verbietet das Sandbox-Profil keinen Internetzugang (`app/src/main/noteAgent/shellSandbox.ts:63-69`). Damit kann Shell-Code grundsätzlich einen Mail- oder API-Versand auslösen. Die Grafik trennt diese Reichweite nicht und überträgt die Zusage des festen Mail-Entwurfs auf den ganzen Agenten.
Vorschlag: „Rechner-Steuerung: nur Mail-Entwurf, kein Sende-Werkzeug. Bei freigegebener Shell mit Netz sind eigene Netzwerkaktionen möglich.“

### F21 — Nicht jede Zusatzfähigkeit wird pro Auftrag freigegeben
Schwere: mittel
Stelle: docs/fortbildung/agenten-verstehen.excalidraw:3539
Status: [OFFEN]
„Du: jede Ergebnis-Karte und jede Zusatzbefugnis pro Auftrag“ ist für Shell und Rechner richtig: Beide brauchen Schalter und Systemdialog (`app/src/main/index.ts:4877-4895`, `:4911-4938`). Bildgenerierung wird aber bei eingeschaltetem Modul und vorhandenem Google-Key **ohne Lauf-Schalter oder Laufdialog** als Werkzeug angeboten (`app/src/main/index.ts:4805-4815`, `app/src/main/noteAgent/loop.ts:241-247`). Der Vault-Index wird bei Abfragbarkeit ebenfalls automatisch angeboten (`app/src/main/index.ts:4817-4829`). Cloud-Zustimmung ist versioniert und bleibt für spätere Läufe gespeichert (`app/src/shared/agentRoute.ts:67-76`, `:86-100`).
Vorschlag: „Du entscheidest über Ergebnis-Karten. Shell und Rechner bestätigst du je Auftrag; Bild-Modul, Vault-Index und Cloud-Zustimmung gelten nach ihrer Einrichtung weiter.“

### F22 — Entwurfsdatei liegt technisch bereits im Vault
Schwere: mittel
Stelle: docs/fortbildung/agenten-verstehen.excalidraw:1809
Status: [OFFEN]
„Ergebnisdatei als Entwurf (liegt noch nicht im Vault)“ ist wörtlich falsch: Die App speichert sie unter `<vault>/.mindgraph/agent-staging/<runId>/` (`app/src/main/noteAgent/staging.ts:1-4`, `:20-25`). Sie ist noch keine übernommene, sichtbare Notiz im Zielordner und vom Sync ausgeschlossen (`app/src/main/noteAgent/staging.ts:5-6`). Für Lehrkräfte ist der Unterschied relevant, wenn „Vault“ als lokaler Dateispeicher und nicht nur als sichtbare Notizsammlung verstanden wird.
Vorschlag: „Liegt zunächst im internen Entwurfsbereich des Vaults; erst nach Übernehmen im Zielordner“.

### F23 — Zentrale Fachwörter bleiben ohne Erklärung
Schwere: niedrig
Stelle: docs/fortbildung/agenten-verstehen.excalidraw:2366
Status: [OFFEN]
Die Grafik richtet sich laut Prüfauftrag an Lehrkräfte ohne Entwicklerhintergrund (`docs/codex-collab/fortbildung-agenten-erklaert.md:5-9`), setzt aber „Vault“, „Shell“, „Opt-in“, „Modellrunden“ und `SKILL.md` voraus. Besonders „Vault“ meint einmal den ganzen Dateibaum und bei „noch nicht im Vault“ offenbar nur die sichtbaren Notizen; das verstärkt F22. Der Code verwendet tatsächlich einen Vault-Pfad als Dateiwurzel (`app/src/main/noteAgent/staging.ts:20-25`) und Modellrunden als Iterationen (`app/src/main/noteAgent/loop.ts:24-41`, `:333`).
Vorschlag: Kleine Legende oder mündlichen Sprechtext ergänzen: „Vault = dein Notizordner“, „Shell = Befehle an das Betriebssystem“, „Opt-in = bewusst einschalten“, „Modellrunde = eine Anfrage an das Modell“.

Nachprüfung Runde 3: F17–F23 sind in Excalidraw und PNG umgesetzt; Sandbox und Rechner-Vorgänge, drei Modellwege, Globus gegenüber Shell-Netz, Mail-Entwurf, Freigabearten, interner Entwurfsbereich und Wörterbuch stimmen nun mit den geprüften Codepfaden überein. Eine neue Übertreibung steht in F24.

### F24 — „Dauerhaft“ überzeichnet gespeicherte Freigaben
Schwere: niedrig
Stelle: docs/fortbildung/agenten-verstehen.excalidraw:3539
Status: [OFFEN]
„Einmal eingerichtet, dann dauerhaft: Bild, Vault-Suche, Cloud-Zustimmung“ kann Lehrkräfte glauben lassen, die Freigaben seien unwiderruflich oder die Funktionen blieben stets verfügbar. Alle drei können wieder ausgeschaltet werden: Cloud-Zustimmung per Schalter (`app/src/renderer/components/Settings/AgentCloudConsentCard.tsx:18-38`), Vault-Index per Schalter (`app/src/renderer/components/Settings/VaultIndexSection.tsx:139-145`), Bild-Modul beziehungsweise Schlüssel (`app/src/renderer/components/Settings/ImageGenerationSection.tsx:50-74`). Bei einer neuen Zustimmungs-Version ist Cloud außerdem erneut freizugeben (`app/src/shared/agentRoute.ts:67-76`).
Vorschlag: „Einmal eingerichtet, gilt für spätere Aufträge – bis du es ausschaltest: Bild, Vault-Suche, Cloud-Zustimmung“.

Nachprüfung Runde 4: Die sechs neuen Tests bestehen (18/18 in `vaultPaths.test.ts`). Direkte `.mindgraph`-Pfade, andere Großschreibung und ein Symlink dorthin werden über `resolveInVaultSafe` abgewehrt; NFD/NFC verändert den ASCII-Namen `.mindgraph` nicht. Unter macOS ist ein Windows-Backslash ein wörtliches Zeichen im Dateinamen, kein Pfadtrenner; auf Windows nutzt `path.sep` den dortigen Trenner. Die übrigen Zugriffswege und Grenzen stehen in F25–F29.

### F25 — DOCX-Vorlagen umgehen die neue Sperre
Schwere: hoch
Stelle: app/src/main/noteAgent/skills.ts:946
Status: [OFFEN]
Der Notiz-Agent darf `write_docx` mit einem vom Modell gesetzten `template` aufrufen (`app/src/main/noteAgent/skills.ts:888-928`, `app/src/main/noteAgent/loop.ts:214`). Dessen eigener `resolveInVault` prüft nur lexikalisches Vault-Containment, weder `.mindgraph` noch Symlinks (`app/src/main/noteAgent/skills.ts:207-219`); anschließend folgen `fs.stat` und `fs.readFile` (`:944-950`). Eine bekannte `.docx` in `.mindgraph` oder ein Vault-interner Symlink dorthin kann so als Vorlage gelesen und in ein Ergebnis übernommen werden. `fill_docx_form` nutzt denselben Weg, sofern eine Skill den Aufruf freischaltet (`app/src/main/noteAgent/skills.ts:1050-1056`, `app/src/main/noteAgent/loop.ts:234-239`). Die sechs neuen Tests rufen nur `resolveInVaultSafe` auf und prüfen diesen Pfad nicht (`app/src/main/telegram/agent/tools/vaultPaths.test.ts:100-137`).
Vorschlag: Beide DOCX-Vorlagenleser über denselben internen Pfadschutz und eine gegen Symlink-Tausch abgesicherte Dateiöffnung führen; Werkzeugtests mit internem Pfad und internem Symlink ergänzen.

### F26 — `project_ask` kann interne Projektquellen erfassen
Schwere: mittel
Stelle: app/src/main/telegram/agent/tools/vaultPaths.ts:79
Status: [OFFEN]
`ensureAbsInVaultSafe` prüft nur Vault-Containment, nicht `.mindgraph` (`app/src/main/telegram/agent/tools/vaultPaths.ts:79-94`). `project_ask` übergibt genau diese Funktion an die RAG-Quelle (`app/src/main/telegram/agent/tools/project.ts:13-17`, `:78-98`). Wird ein gültig markierter Projektordner innerhalb von `.mindgraph` entdeckt, liest `collectSourceFiles` dessen nicht versteckte Markdown-Dateien; der Scan überspringt nur *unterhalb* des übergebenen Projektordners versteckte Namen (`app/src/main/projectStatus/discovery.ts:334-365`, `app/src/main/rag/index.ts:61-83`). Das setzt eine entsprechende Projektkonfiguration und `_STATUS.md` voraus, ist also kein Zugriff allein durch einen frei gewählten `project_ask`-Pfad. `ensureAbsInVaultSafe` wird zugleich legitim für den RAG-Index in `.mindgraph` benutzt (`app/src/main/rag/index.ts:112-117`); eine pauschale Sperre dort würde diesen Aufrufer brechen.
Vorschlag: Interne Ordner bereits bei der Projektentdeckung beziehungsweise vor dem Quell-Scan ausschließen; den erlaubten Index-Schreibpfad getrennt behandeln. Einen Test für einen markierten Projektordner in `.mindgraph` ergänzen.

### F27 — Einzelanhänge aus `.mindgraph` bleiben lesbar
Schwere: mittel
Stelle: app/src/main/index.ts:4458
Status: [OFFEN]
Der IPC-Pfad zum Anhängen einer Vault-Datei akzeptiert jeden Pfad innerhalb des freigegebenen Vaults, auch `.mindgraph` (`app/src/main/index.ts:4452-4467`, `:1347-1364`). `registerContextAttachment` prüft Typ und Größe, keinen internen Ordner (`app/src/main/noteAgent/contextFiles.ts:131-165`). `read_attachment` liefert den Inhalt nach erneutem realpath-Containment, wiederum ohne `.mindgraph`-Ausschluss (`app/src/main/noteAgent/skills.ts:356-379`, `app/src/main/noteAgent/contextFiles.ts:51-60`, `:770-775`). Das erfordert, dass eine solche Einzeldatei zuvor angehängt wird; die Ordner-Anhangswerkzeuge sperren versteckte Pfade separat (`app/src/main/noteAgent/folderInventory.ts:40-59`, `:269-275`).
Vorschlag: Einzeldatei-Anhänge innerhalb von `.mindgraph` beim Registrieren und unmittelbar vor dem Lesen zurückweisen, falls die Aussage „für kein Agent-Werkzeug erreichbar“ gelten soll; sonst die Ausnahme ausdrücklich benennen.

### F28 — Hardlinks und Pfadtausch bleiben Grenzen des Guards
Schwere: mittel
Stelle: app/src/main/telegram/agent/tools/vaultPaths.ts:55
Status: [OFFEN]
`realpath` erkennt Symlinks, nicht jedoch einen Hardlink außerhalb von `.mindgraph` auf dieselbe interne Datei. Ein solcher vorhandener Link erfüllt beide Segmentprüfungen (`app/src/main/telegram/agent/tools/vaultPaths.ts:52-58`, `:68-72`); `note_read` könnte darüber den Inhalt lesen, `note_append` oder `task_toggle` denselben Inode ändern (`app/src/main/telegram/agent/tools/notes.ts:98-100`, `:190-195`; `app/src/main/telegram/agent/tools/tasks.ts:76-99`). Das setzt einen zuvor lokal angelegten Hardlink voraus. Daneben bleibt ein zeitlicher Spalt zwischen `realpath` und den späteren `readFile`/`writeFile`-Aufrufen: ein gleichzeitig schreibberechtigter Prozess kann einen Pfadteil gegen einen Symlink tauschen. Die neuen Tests prüfen nur statische Pfade (`app/src/main/telegram/agent/tools/vaultPaths.test.ts:100-137`).
Vorschlag: Die Zusage auf normale Pfade und stabile Dateisystemzustände begrenzen oder Lesen/Schreiben an geprüfte Handles und einen gegen Pfadtausch geschützten Zugriff binden; Hardlink- und deterministische Tauschtests ergänzen. Hardlinks lassen sich durch `realpath` allein nicht erkennen.

### F29 — Zielordner kann interner App-Ordner sein
Schwere: niedrig
Stelle: app/src/main/index.ts:4614
Status: [OFFEN]
Der Notiz-Agent-Lauf prüft den gewählten Zielordner nur mit `assertSafePath`, das auf Vault-Containment prüft (`app/src/main/index.ts:4614-4620`, `:1347-1364`). Falls `.mindgraph` oder ein Unterordner als Ziel gewählt wird, listet `list_target_folder` dort sichtbare Dateinamen (`app/src/main/noteAgent/skills.ts:811-820`); nach der Übernahme durch den Nutzer kann der Accept-Pfad eine Ergebnisdatei dort schreiben (`app/src/main/index.ts:5095-5112`). Der Agent allein wählt den Zielordner nicht und der Schreibvorgang braucht die Nutzerübernahme. Die absolute Aussage „kein Agent-Werkzeug“ beziehungsweise „nie schreiben“ ist trotzdem zu weit.
Vorschlag: Interne Ordner bei der Zielordnerprüfung ausschließen und diesen Fall in einem Lauf-Test abdecken; den beabsichtigten Staging-Bereich in `.mindgraph` als interne App-Ausnahme präzise benennen.

Nachprüfung Runde 5: F25 ist für die beiden DOCX-Vorlagenaufrufe behoben; die frühere lexikalische Vault-Pfadfunktion in `skills.ts` ist entfernt. Andere vom Modell angegebene Vorlagen- und Bildpfade in diesem Werkzeugregister nutzen bereits `readVaultBinary` (`app/src/main/noteAgent/skills.ts:1247`, `:1350`, `:1379`); `read_skill_file` ist auf einen aktivierten Skill-Ordner mit realpath-Prüfung begrenzt (`app/src/main/noteAgent/skillsLoader.ts:94-101`, `:164-173`). Die Kommentare zu nutzergewählten Einzelanhängen (F27) und zu Hardlinks/gleichzeitigem Pfadtausch (F28) treffen im Kern zu. Gezielte Tests: 23/23 bestanden; `npm run typecheck` bestanden. Zwei Präzisierungen folgen.

### F30 — `O_NOFOLLOW` schützt nur das letzte Pfadsegment
Schwere: mittel
Stelle: app/src/main/noteAgent/skills.ts:932
Status: [OFFEN]
Die neuen Kommentare zu beiden DOCX-Werkzeugen sagen pauschal „O_NOFOLLOW gegen Pfadtausch“ (`app/src/main/noteAgent/skills.ts:932-933`, `:1035-1036`); der Kommentar am gemeinsamen Leser behauptet, ein zwischen Prüfung und Öffnen untergeschobener Link sei ausgeschlossen (`:210-225`). `O_NOFOLLOW` verhindert aber nur einen Symlink als *letztes* Segment des an `fs.open` übergebenen Pfads. Tauscht ein lokal schreibberechtigter Prozess nach `resolveInVaultSafe` einen übergeordneten Ordner gegen einen Symlink auf `.mindgraph`, kann `fs.open` dessen Inhalt weiterhin erreichen. Der neue Kommentar in `vaultPaths.ts` benennt genau diese Restgrenze zutreffend (`app/src/main/telegram/agent/tools/vaultPaths.ts:68-72`). Die statischen DOCX-Tests prüfen den Tausch nicht (`app/src/main/noteAgent/docxTemplatePath.test.ts:52-76`).
Vorschlag: Die Kommentare auf „Schutz gegen Austausch der Zieldatei durch einen Symlink“ begrenzen und den weiterhin möglichen Tausch eines Elternordners ausdrücklich ausnehmen; für eine stärkere Zusage wäre ein am geprüften Verzeichnis verankerter Zugriff nötig.

### F31 — Positivtest prüft keine gültige DOCX-Vorlage
Schwere: niedrig
Stelle: app/src/main/noteAgent/docxTemplatePath.test.ts:68
Status: [OFFEN]
Die Positivkontrolle verwendet absichtlich „kein zip“ und erwartet für beide Werkzeuge einen Parserfehler (`app/src/main/noteAgent/docxTemplatePath.test.ts:68-76`). Das zeigt, dass ein normaler Vault-Pfad bis zur Verarbeitung gelangt, belegt aber nicht, dass `write_docx` und `fill_docx_form` nach dem Wechsel auf `readVaultBinary` eine gültige Vorlage weiterhin erfolgreich füllen und als Ergebnis registrieren. Die Sperrtests selbst sind aussagekräftig (`:52-65`); aus dem geänderten Lesecode ist kein konkreter Bruch eines üblichen Vorlagenpfads erkennbar (`app/src/main/noteAgent/skills.ts:216-229`, `:930-945`, `:1033-1045`).
Vorschlag: Je Werkzeug einen erfolgreichen Lauf mit einer kleinen gültigen DOCX-Vorlage prüfen, etwa mit den vorhandenen DOCX-Testressourcen; so ist auch der legitime Aufrufer nachgewiesen.

Nachprüfung Runde 6: F26 ist für `project_ask` über `discoverProjects` behoben; F29 ist für `note-agent-run` und die erneute Prüfung bei `note-agent-accept-result` behoben. Die gemeinsame Aussage, interne Projektordner seien über die Projektfunktionen unerreichbar, gilt wegen F32/F33 noch nicht. Die Zielordner-Picker der Agentenansicht und Macher-Leiste beziehen ihre Ordner aus dem FileTree (`AgentView.tsx:362-372`, `AiActionBar.tsx:119-127`); dessen Main-Reader blendet versteckte Ordner aus (`index.ts:2078-2086`). Die Prüfung im Main bleibt für manipulierte oder gespeicherte Werte maßgeblich. Die Pfadprüfung ist relativ zur kanonischen Vault-Wurzel (`vaultPaths.ts:88-91`); ein Vault mit `.mindgraph` in einem *übergeordneten* Pfad wird deshalb nicht allein deswegen gesperrt. `catch(() => true)` in der Projektentdeckung überspringt bei Kanonisierungsfehlern das betreffende Projekt; das ist ein Verfügbarkeitsverlust bei Dateisystemfehlern, kein offener Lesepfad. Die F29-Prädikat-Tests decken die IPC-Verkabelung und die erneute Prüfung beim Accept nicht ab; dafür fehlen Handler-Tests. Gezielte Tests: 24/24 bestanden; `npm run typecheck` bestanden.

### F32 — Direkte Projekt-RAG-IPC umgeht die Projektsperre
Schwere: mittel
Stelle: app/src/main/index.ts:7850
Status: [OFFEN]
`project-rag-index`, `project-rag-query` und `project-rag-answer` nehmen `projectFolderRel` unmittelbar vom IPC-Aufrufer und rufen die RAG-Engine ohne `discoverProjects` oder `isAppInternalRealPath` auf (`index.ts:7850-7855`, `:7865-7869`, `:7878-7890`). `collectSourceFiles` scannt den übergebenen Projektordner selbst und überspringt versteckte Namen erst *unterhalb* dieses Ordners (`app/src/main/rag/index.ts:61-78`). Für `projectFolderRel = '.mindgraph/unterordner'` werden dort liegende sichtbare Markdown-Dateien daher trotz der Discovery-Änderung gelesen, eingebettet und als Auszüge abrufbar; `assertSafePath` prüft nur das Vault-Containment (`index.ts:1348-1371`). Der reguläre `ProjectRagModal` übergibt zwar einen entdeckten `project.folderRel` (`ProjectRagModal.tsx:98`, `:117`, `:143`), die IPC-Grenze erzwingt diese Herkunft aber nicht. Ein bereits angelegter Index kann außerdem über `project-rag-rerank-candidates` anhand eines frei übergebenen `folderRel` ausgewertet werden (`index.ts:8232-8253`).
Vorschlag: Den Projektordner an der gemeinsamen RAG-Eingangsgrenze vor Status, Index, Query, Antwort und Reranking kanonisch gegen `.mindgraph` prüfen; den legitimen Index-Speicherpfad getrennt lassen. Einen Test mit direktem internen Projektordner statt nur über Discovery ergänzen.

### F33 — Projekt-Status-IPC nimmt interne Ordner direkt an
Schwere: mittel
Stelle: app/src/main/index.ts:6005
Status: [OFFEN]
Die neue Sperre sitzt nur in `discoverProjects`. `project-status-mark` bildet dagegen aus dem frei übergebenen `projectFolderRel` den Zielpfad `_STATUS.md` und schreibt nach bloßem Vault-Containment (`index.ts:5983-6014`); `project-status-set-status` kann einen solchen Marker ändern (`:6163-6197`). `project-status-crystallize` reicht den Ordner ebenso direkt an `crystallizeProject` weiter (`:6025-6055`), das Marker und Projektquellen liest und einen Wochen-Draft im selben Ordner schreibt (`app/src/main/projectStatus/crystallizer.ts:803-825`, `:896-905`). Auch `project-status-generate-synonyms` liest Projektdateien und schreibt seinen Cache direkt in diesen Ordner (`index.ts:6078-6089`, `app/src/main/projectStatus/synonymGenerator.ts:166-201`). Ein IPC-Aufruf mit einem existierenden Ordner in `.mindgraph` oder einem Link dorthin benötigt keine Entdeckung. Der normale Renderer arbeitet mit entdeckten Projekten; die Main-Handler selbst halten die interne Grenze nicht ein.
Vorschlag: Die Projektordner an den direkten Projekt-Status-Eingängen kanonisch auf Vault-Zugehörigkeit und `.mindgraph`-Ausschluss prüfen, bevor gelesen oder geschrieben wird. Die Änderung mit direkten IPC- beziehungsweise Service-Tests für interne Ordner und interne Symlinks belegen.

### F34 — Discovery-Symlink-Test prüft den neuen Guard nicht
Schwere: niedrig
Stelle: app/src/main/projectStatus/discovery.test.ts:37
Status: [OFFEN]
Der Test legt einen Symlink `Projekte/Link` auf `.mindgraph/versteckt` an und erwartet, dass nur `Echt` gefunden wird (`discovery.test.ts:37-41`). `discoverProjects` überspringt jedoch bereits vor dem neuen Guard alle Einträge, für die `Dirent.isDirectory()` falsch ist (`discovery.ts:342-355`); ein Symlink ist dort `isSymbolicLink()`. Der Test bestünde deshalb auch ohne `isAppInternalRealPath`. Die anderen Tests decken eine direkt gewählte interne Projektwurzel und den Ordner `.mindgraph` als unmittelbaren Vault-Eintrag ab, aber nicht den behaupteten Symlink auf eine interne Projektwurzel.
Vorschlag: Einen Symlink als `projectsFolderRel` auf `.mindgraph` (mit markiertem Unterordner) testen; dabei läuft ein echter Verzeichniseintrag durch den neuen Guard. Den bisherigen Test als Prüfung des Symlink-Ausschlusses kennzeichnen oder ersetzen.

## Claude-Antwort

Alle Befunde nachgemessen (10.10.2026), keiner falsch. Entscheidung des Nutzers: Vorgehen wie empfohlen, F03 getrennt.

- F01 [ADRESSIERT] Grafik: „typischer Werkzeug-Agent", Ausgang „Antwort oder Entwurf", Modell „schreibt Text oder einen Wunsch".
- F02 [ADRESSIERT] Leseliste als Grundmodus; Shell-Grenzen (ganzer Vault / Netz) als Einstellung gezeigt.
- F03 [ADRESSIERT] Bestätigt und behoben (10.10.2026): `resolveInVaultSafe` (`app/src/main/telegram/agent/tools/vaultPaths.ts`) sperrt `.mindgraph` vor und nach der Symlink-Auflösung, ohne Groß-/Kleinschreibung — gilt für alle Aufrufer (note_read/note_create/note_append, task_toggle, readVaultBinary). 6 Regressionstests in `vaultPaths.test.ts`.
- F04 [ADRESSIERT] Keine Ergebnis-Obergrenze mehr in der Grafik behauptet.
- F05 [ADRESSIERT] „Ergebnisdateien als Entwurf"; Merksatz (per Klick), Drucken und Mail-Entwurf als eigene Wirkungen.
- F06 [ADRESSIERT] Eigener Kasten „Zusätzliche Wege neben dem Modell" + „Lokales Modell ≠ ganzer Lauf lokal".
- F07 [ADRESSIERT] Bild: eigener Google-Schlüssel.
- F08 [ADRESSIERT] Skills: „Starter installieren, ein/aus, eigene".
- F09 [ADRESSIERT] Vault-Index: Modul, Opt-in, erstellen.
- F10 [ADRESSIERT] Zielordner im Agent-Tab als Pflicht; Umschreib-Modus der Leiste nicht in der Grafik.
- F11 [ADRESSIERT] Tab → Modul-Vorgabe → globales Modell.
- F12 [ADRESSIERT] Zeitbilanz nur als „eigene Referenzzeiten" unter Einstellungen, keine Einsparungsaussage.
- F13/F14 [ADRESSIERT] Produktvergleich ersetzt durch „Fünf Fragen an jeden Agenten" – MindGraph-Spalte ausgefüllt, zweite Spalte füllen die Teilnehmenden aus.
- F15 [ADRESSIERT] „nur Mac" markiert; Fußzeile „Lokal heißt nur …, das Ergebnis prüfst du trotzdem."
- F16 [ADRESSIERT] „bis 12 Modellrunden (20 mit Ordner/Shell/Rechner); Web 8 Suchen, 10 Abrufe".

Runde 2 (Nutzer-Freigabe 10.10.2026, F17/F18/F20/F21 im Code nachgemessen):
- F17 [ADRESSIERT] Werkzeugkasten: „Shell: Sandbox · Rechner: 4 feste Vorgänge, keine Sandbox (beide Mac)".
- F18 [ADRESSIERT] Drei Modellwege im Kasten und in Frage 1, inkl. „nicht geprüft (z. B. LM Studio)".
- F19 [ADRESSIERT] „Webrecherche nur mit Globus (Shell mit erlaubtem Netz: ebenfalls)".
- F20 [ADRESSIERT] Rote Spalte: „Rechner-Steuerung sendet Mails (nur Entwurf)" + Achtung-Hinweis zu Shell mit Netz.
- F21 [ADRESSIERT] Frage 4 getrennt: pro Auftrag (Karten, Shell, Rechner, Globus) vs. einmal eingerichtet (Bild, Vault-Suche, Cloud-Zustimmung).
- F22 [ADRESSIERT] „Ergebnis als Entwurf (interner Entwurfsbereich, noch nicht im Zielordner)"; rote Spalte „direkt in den Zielordner".
- F23 [ADRESSIERT] Zeile „Kleines Wörterbuch" (Vault, Shell, Opt-in, Modellrunde).
- F24 [ADRESSIERT] „Einmal eingerichtet, bis du es ausschaltest“.

Runde 4 (Nutzer-Freigabe 10.10.2026, F25 nachgemessen: fremde Datei wurde gelesen und erst am ZIP-Format verworfen):
- F25 [ADRESSIERT] `write_docx` (Vorlage) und `fill_docx_form` lesen über `readVaultBinary` (symlink-sicher via `resolveInVaultSafe`, `.mindgraph`-Sperre, `O_NOFOLLOW`); die lexikalische `resolveInVault` in `skills.ts` ist entfernt. Tests: `app/src/main/noteAgent/docxTemplatePath.test.ts` (Symlink nach außen, `.mindgraph`, Positivkontrolle; vorher 4 rot).
- F26 [ADRESSIERT] (Nachtrag 10.10.2026) `discoverProjects` überspringt Projektordner, die kanonisch in `.mindgraph` liegen (`isAppInternalRealPath`) — gilt für project_ask, Dashboard und Workflows. Tests `app/src/main/projectStatus/discovery.test.ts` (Wurzel `.mindgraph`/`.MindGraph`, Vault-Wurzel; vorher 2 rot). Index-Schreibpfad (`ensureAbsInVaultSafe`) unverändert.
- F27 [ADRESSIERT] Als bewusste Ausnahme benannt (Kommentar `vaultPaths.ts`): Einzelanhänge wählt der Nutzer, nicht das Modell.
- F28 [ADRESSIERT] Grenzen im Kommentar benannt (Hardlinks, gleichzeitiger Pfadtausch setzen lokalen Schreibzugriff voraus); für Vorlagen zusätzlich `O_NOFOLLOW`.
- F29 [ADRESSIERT] (Nachtrag 10.10.2026) `note-agent-run` lehnt einen Zielordner in `.mindgraph` ab, `note-agent-accept-result` prüft unmittelbar vor dem Schreiben erneut (`app/src/main/index.ts`). Prädikat getestet in `vaultPaths.test.ts`; die IPC-Handler selbst haben keinen Unit-Test.

Runde 5:
- F30 [ADRESSIERT] Kommentare präzisiert: O_NOFOLLOW schützt nur gegen Tausch der Zieldatei, nicht eines Elternordners (`skills.ts` readVaultBinary + beide DOCX-Stellen).
- F31 [ADRESSIERT] Positivtests mit echten Vorlagen: `write_docx` mit `{{INHALT}}`-Vorlage und `fill_docx_form` mit Tabellenvorlage laufen erfolgreich und registrieren je ein Ergebnis (`docxTemplatePath.test.ts`, 7/7).

Runde 6 (Nutzer-Freigabe 10.10.2026):
- F32 [ABGELEHNT: Projekt-RAG-IPC nimmt Pfade vom Renderer, nicht vom Modell. Der allgemeine `read-file`-Handler erreicht jede Vault-Datei inkl. `.mindgraph` (`app/src/main/index.ts:2140`) — eine Sperre an diesen Eingängen schützt nichts gegen einen kompromittierten Renderer. Die Grenze dieser Runde gilt für modellgewählte Pfade.]
- F33 [ABGELEHNT: wie F32 — Projekt-Status-IPC, Pfade aus der Oberfläche (nur entdeckte Projekte).]
- F34 [ADRESSIERT] Test ersetzt: Projekt-Wurzel als Symlink auf `.mindgraph` (läuft durch den neuen Guard; ohne Fix rot). Der alte Fall bleibt als „Symlink-Einträge werden übersprungen" gekennzeichnet.

## Status

Runde 1: Prüfauftrag an Codex (Fakten-Prüfung Abschnitte 2–4). 16 Findings, beantwortet.
Runde 2: Texte der fertigen Grafik (`docs/fortbildung/agenten-verstehen.excalidraw`) zur Prüfung.
Runde 2: 7 Findings (F17–F23), alle adressiert. Runde 3: F17–F23 bestätigt, F24 (Wortlaut) adressiert. Grafik abgeschlossen, Abnahme durch den Nutzer.
F03 behoben; Runde 4: F25 behoben, F27/F28 benannt, F26/F29 im Nachtrag behoben. Runde 6: F32/F33 abgelehnt, F34 adressiert. Abgeschlossen. Runde 5: F30/F31 adressiert. Committet.
