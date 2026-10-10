# Fortbildungsfolie: Dieselben fünf Fragen an drei Agenten

## Aufgabe

Eine Folie für eine Lehrkräftefortbildung (Zielgruppe ohne Technikhintergrund) vergleicht den
Notiz-Agenten von MindGraph Notes („Petrol-Agent“) mit zwei Coding-Agenten: Claude Code und
Codex CLI. Raster sind die fünf Fragen der Fortbildungsgrafik (siehe
`fortbildung-agenten-erklaert.md`, dort F01–F34 geprüft). Jede Zelle muss stimmen, und zwar für
die **Standardeinstellung** mit Hinweis auf das, was man umstellen kann. Der Vergleich darf
keinen der Agenten unfair schlechter oder besser darstellen.

**Bitte an Codex:** Prüfe jede Zelle adversarial.
- Spalte Codex gegen dein eigenes Programm (`codex --help`, `codex sandbox --help`,
  Konfiguration, offizielle Doku, soweit offline erreichbar).
- Spalte Claude Code gegen `claude --help` und was sich sonst lokal belegen lässt
  (`~/.claude/settings.json` nur auf Schlüsselnamen, keine Geheimnisse).
- Spalte Petrol-Agent gegen `app/src` (Belege aus der Vorrunde gelten weiter).
Unbelegbares als solches markieren, nicht raten.

## Kontext/Anker

- `codex --help` (v0.160.0): `--sandbox read-only | workspace-write | danger-full-access`,
  `--ask-for-approval <policy>`, `--oss` + `--local-provider lmstudio|ollama`,
  `--dangerously-bypass-approvals-and-sandbox`.
- `claude --help` (v2.1.294): `--permission-mode acceptEdits | auto | bypassPermissions |
  manual | dontAsk | plan`, `--allowedTools`/`--disallowedTools`,
  `--dangerously-skip-permissions`; Hooks in `~/.claude/settings.json` (heute real: ein
  Git-Hook blockierte einen Push-Befehl).
- Petrol-Agent: `app/src/shared/agentRoute.ts`, `app/src/main/noteAgent/staging.ts`,
  `app/src/main/noteAgent/loop.ts:24`, `:41`, `app/src/shared/shellGuardrails.ts`.

## Folienentwurf (Prüfgegenstand)

Titel: **Dieselben fünf Fragen an drei Agenten**  ·  Dachzeile: Vergleich

| Frage | Petrol-Agent (MindGraph Notes) | Claude Code | Codex CLI |
|---|---|---|---|
| Wo rechnet das Modell? | Sie wählen: lokal (von der App geprüft) oder Cloud nach Zustimmung | Cloud (Anthropic-Modelle) | Cloud (OpenAI) – lokal möglich über Ollama oder LM Studio |
| Was darf er lesen? | Vault-Notizen und was Sie anhängen | Alles, was Ihr Benutzerkonto lesen kann | Je nach Sandbox-Stufe; Standard: Lesen auf dem Rechner, Schreiben nur im Projektordner |
| Was darf er bewirken? | Entwürfe – erst Ihr Klick legt sie ab | Dateien direkt ändern, Befehle ausführen | Dateien im Projektordner ändern, Befehle in der Sandbox |
| Wer gibt frei? | Sie, für jedes Ergebnis | Freigabemodus: Rückfrage vor Änderungen und Befehlen bis „frei arbeiten“; eigene Sperrregeln möglich | Freigabestufe: nachfragen bis „nie fragen“ |
| Wie lange darf er? | Bis 12 Modellrunden (20 mit Ordner) | Kein festes Limit | Kein festes Limit |
| **Sicherheitsnetz** | **vorher**: Entwurf, dann Übernahme | **nachher**: Versionsverwaltung (Git), Durchsicht | **Sandbox** plus Git |

Kernsatz unter der Tabelle: *Enger Rahmen mit Sicherung vorher – oder weiter Rahmen mit
Sicherung hinterher. Welcher passt, hängt davon ab, wer damit arbeitet.*

## Codex-Findings

Geprüft am 10.10.2026 mit `codex-cli 0.162.1` und `claude 2.1.294`. `codex --help`, `codex sandbox --help` und `claude --help` lieferten die verfügbaren Optionen, aber nicht alle wirksamen Standardwerte; dafür sind unten die jeweiligen Produktdokumente getrennt angegeben. Aus `~/.claude/settings.json` wurden nur Schlüsselnamen und `permissions.defaultMode` ausgegeben, keine Hook-Inhalte oder Geheimnisse. Ein tieferer Sandbox-Test über `codex sandbox macos --help` war in dieser verschachtelten Sandbox gesperrt (`sandbox-exec: sandbox_apply: Operation not permitted`); die Aussagen zur Codex-Sandbox stützen sich daher auf Hilfe, die für diese Sitzung übergebene Berechtigungsanzeige und die offizielle Dokumentation.

### F01 — Codex-Standard hängt vom Arbeitsordner ab
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:39` (Codex)
Status: [OFFEN]

„Standard: Lesen auf dem Rechner, Schreiben nur im Projektordner“ behauptet einen einzigen Startmodus. Die [Codex-Dokumentation](https://learn.chatgpt.com/docs/agent-approvals-security) nennt für versionierte Ordner `workspace-write` + `on-request`, für nicht versionierte Ordner `read-only`; vor Vertrauen in den Ordner kann ebenfalls `read-only` gelten. Schreibbare Wurzeln umfassen auch temporäre Ordner und können mit `--add-dir` erweitert werden (`codex --help`: `--add-dir`). Der Begriff „Projektordner“ ist damit zu eng.

Vorschlag: Zelle Codex/Lesen: „Je nach Startmodus: Im Git-Projekt meist Lesen und Bearbeiten im Arbeitsbereich; ohne Vertrauensfreigabe oder Git kann zunächst nur Lesen gelten. Weitere Ordner lassen sich freigeben.“

### F02 — Codex-Leserechte sind keine pauschale Rechnerfreigabe
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:39` (Codex)
Status: [OFFEN]

„Lesen auf dem Rechner“ kann wie uneingeschränkter Zugriff auf alle Dateien verstanden werden. Die laufende Berechtigungsanzeige dieser Codex-Sitzung gewährt `:root` lesend, mit ausdrücklich engeren Einträgen für `.git`, `.agents`, `.codex`, `.aws`; das belegt eine breite **konkrete** Konfiguration, keinen universellen Standard. [Codex-Permissions](https://learn.chatgpt.com/docs/permissions) dokumentiert auch Profile, die Lesezugriff außerhalb des Workspace verweigern, und `deny`-Regeln für einzelne Pfade. `codex sandbox --help` bietet `--sandbox-state-readable-root`. Betriebssystemrechte bleiben zusätzlich maßgeblich. Die exakte Standard-Lesemenge aller Installationen ist aus `codex --help` allein **unbelegt**.

Vorschlag: Zelle Codex/Lesen zusammen mit F01: „Welche Dateien lesbar sind, bestimmen Betriebssystem und Sandbox-Profil; im üblichen Projektmodus darf Codex den Arbeitsbereich lesen, weitere Lesewege sind konfigurierbar.“

### F03 — Claude-Leserechte sind ebenfalls begrenzbar
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:39` (Claude Code)
Status: [OFFEN]

„Alles, was Ihr Benutzerkonto lesen kann“ unterschlägt Claude-Codes `Read`-Sperrregeln und die Einstellung `permissions.blockReadsOutsideWorkingDirectories`. Die [Claude-Permissions-Dokumentation](https://code.claude.com/docs/en/permissions) beschreibt `Read(./.env)` als Sperre und Lesezugriffe im Arbeitsordner als ohne Rückfrage; Zugriffe auf Netzpfade werden gesondert geprüft. `claude --help` nennt `--add-dir`, `--allowedTools` und `--disallowedTools`. Eine pauschale Aussage, dass jede benutzerlesbare Datei tatsächlich zugänglich ist, ist damit falsch.

Vorschlag: Zelle Claude/Lesen: „Dateien im Arbeitsbereich; weitere lesbare Orte sind möglich. Regeln können Dateien und Ordner sperren.“

### F04 — Claude rechnet in der Cloud, aber nicht zwingend bei Anthropic
Schwere: niedrig
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:38` (Claude Code)
Status: [OFFEN]

„Cloud (Anthropic-Modelle)“ ist als Modellfamilie plausibel, vermischt aber Modell und Rechenort. Die [Claude-Code-Bereitstellungsdokumentation](https://code.claude.com/docs/en/third-party-integrations) nennt Anthropic, Amazon Bedrock, Google Cloud und Microsoft Foundry als mögliche Cloud-Wege. `claude --help` nennt `--model`, aber keinen lokal betriebenen Modellanbieter. Ein lokaler Rechenweg ist für diese Installation **unbelegt**.

Vorschlag: Zelle Claude/Modellort: „Cloud: Claude-Modelle, je nach Einrichtung über Anthropic oder einen Cloud-Anbieter.“

### F05 — Petrols lokaler Modellweg ist nicht für jeden Anbieter verifiziert
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:38` (Petrol)
Status: [OFFEN]

`app/src/shared/agentRoute.ts:9-11,47-64` stuft LM Studio ausdrücklich als `unverified` ein; nur ein positiv geprüftes Ollama-Modell gilt als `local`. Für Cloud verlangt `evaluateCloudGate` die versionierte Zustimmung (`:67-100`), OpenRouter/LLMBase zusätzlich ein Feature-Opt-in. Die Zelle „lokal (von der App geprüft)“ klingt, als sei jeder lokale Anbieter geprüft. „Nach Zustimmung“ kann fälschlich als Zustimmung bei jedem Lauf gelesen werden; `app/src/renderer/stores/uiStore.ts:1092,1309` speichert die einmalige, versionierte Freigabe.

Vorschlag: Zelle Petrol/Modellort: „Ollama lokal, wenn die App es bestätigt; LM Studio: Rechenort ungeprüft. Cloud nur nach einmaliger Zustimmung und gegebenenfalls Opt-in.“

### F06 — Petrol liest mehr als angehängte Dateien und Vault-Notizen
Schwere: niedrig
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:39` (Petrol)
Status: [OFFEN]

Die Grundidee stimmt, ist aber für eine Berechtigungstabelle unvollständig. `app/src/main/noteAgent/loop.ts:176-187` nennt alle Vault-Notizen einschließlich Brain-Tagesgedächtnis, angehängte Einzeldateien **und Ordner**. `:233-239` ermöglicht bei vorhandenen Skills auch deren Anleitung und Referenzdateien; `:187` und `:214` lesen den Zielordner für Namenskollisionen/Vorlagen. „Was Sie anhängen“ allein lässt diese weiteren Quellen unsichtbar.

Vorschlag: Zelle Petrol/Lesen: „Vault-Notizen, angehängte Dateien und Ordner; bei Bedarf Zielordner und eingerichtete Skill-Vorlagen.“

### F07 — Petrol kann optional sofort außerhalb des Entwurfs wirken
Schwere: hoch
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:40-41,43` (Petrol)
Status: [OFFEN]

Für Ergebnisdateien gilt Staging und Einzelübernahme (`app/src/main/noteAgent/staging.ts:1-4,54-62`; `app/src/main/index.ts:5091-5121`). Die Aussage „Entwürfe – erst Ihr Klick legt sie ab“ gilt **nicht** für optionale Shell und Rechner-Steuerung: Beide sind standardmäßig aus (`app/src/renderer/stores/uiStore.ts:1086-1089`); nach dem Einschalten holt `app/src/main/index.ts:4883-4909,4917-4944` eine Freigabe pro Lauf ein und erklärt ausdrücklich, dass Befehle/Vorgänge danach ohne Einzelbestätigung sofort wirken. `app/src/main/noteAgent/computerTools.ts:17-19,48-55,60-75` erlaubt Öffnen, Drucken und Mail-Entwurf; Drucken ist nicht rückholbar. Die Sicherheitsnetz-Zelle behauptet damit eine Sicherung vor jeder Wirkung, die der Code nicht bietet.

Vorschlag: Zelle Petrol/Bewirken: „Ergebnisdateien erst nach Ihrer Übernahme; optionale Shell und Rechner-Steuerung wirken nach Freigabe schon während des Laufs.“ Zelle Petrol/Sicherheitsnetz: „Ergebnisdateien: Entwurf und Einzelübernahme; Zusatzaktionen: Freigabe vor dem Lauf.“

### F08 — „Sie, für jedes Ergebnis“ beschreibt nur Ergebnisdateien
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:41` (Petrol)
Status: [OFFEN]

Die Annahme jeder Ergebnisdatei geschieht separat (`app/src/renderer/components/Agent/AgentRunPanel.tsx:271-278`, `app/src/main/index.ts:5091-5095`). Shell und Rechner-Steuerung werden jedoch einmal **für den Lauf** autorisiert (`app/src/main/index.ts:4893-4900,4936-4944`), einzelne Befehle und Druckvorgänge danach nicht mehr. Auch die Cloud-Zustimmung ist eine gespeicherte Version und keine Ergebnisfreigabe (`app/src/shared/agentRoute.ts:67-100`).

Vorschlag: Zelle Petrol/Freigabe: „Sie übernehmen jede Ergebnisdatei einzeln; Zusatzfunktionen erlauben Sie vor dem Lauf.“

### F09 — Claude-Freigabe wird in dieser Einrichtung automatisch beurteilt
Schwere: hoch
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:41` (Claude Code)
Status: [OFFEN]

Die Zelle legt nahe, Rückfragen seien der Standard dieser Gegenüberstellung. `python3 -c ...` las aus `~/.claude/settings.json` ausschließlich `permissions.defaultMode: auto` und die Hook-Ereignisnamen `PreToolUse`, `SessionStart`. Laut [Claude-Permissions](https://code.claude.com/docs/en/permissions) prüft im `auto`-Modus ein Hintergrund-Klassifikator viele Aktionen statt des Nutzers. `claude --help` nennt `manual`, `acceptEdits`, `auto`, `dontAsk`, `plan`, `bypassPermissions`; `--dangerously-skip-permissions` überspringt Abfragen. Der aufgabenseitig erwähnte Hook-Block eines Push-Befehls belegt nur eine lokale Zusatzregel, keinen generellen Produktschutz; Hook-Inhalte wurden nicht gelesen oder ausgegeben.

Vorschlag: Zelle Claude/Freigabe: „Je nach Modus: Rückfrage, automatische Prüfung oder vorab erlaubte Aktionen; eigene Sperrregeln möglich. Hier: automatische Prüfung.“

### F10 — Codex trennt Freigabepolitik und Sandbox
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:41` (Codex)
Status: [OFFEN]

`codex --help` nennt `--ask-for-approval on-request|never` und separat `--sandbox read-only|workspace-write|danger-full-access`; `--approve-for-me` kann Anfragen automatisch prüfen. Die [Codex-Dokumentation](https://learn.chatgpt.com/docs/agent-approvals-security) nennt für ein vertrautes Git-Projekt `workspace-write` + `on-request` als typischen Start, aber auch `read-only` vor Vertrauen. „Nie fragen“ (`never`) bedeutet **nicht** automatisch Vollzugriff: fehlende Sandbox-Rechte bleiben gesperrt. Die Zelle verschweigt zudem, dass Aktionen **innerhalb** der Sandbox schon bei `on-request` ohne Einzelrückfrage laufen.

Vorschlag: Zelle Codex/Freigabe: „Im üblichen Projektmodus arbeitet Codex im Arbeitsbereich ohne Einzelrückfrage; für Netz oder darüber hinaus fragt er. Sandbox und Rückfragen lassen sich getrennt einstellen.“

### F11 — Rundenzahl und Laufdauer sind verschieden
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:42` (alle drei Spalten)
Status: [OFFEN]

Bei Petrol begrenzt `app/src/main/noteAgent/loop.ts:24,41,333-349` **äußere Modelliterationen** auf 12 beziehungsweise 20; 20 gilt auch bei Shell und Rechner-Steuerung, nicht nur bei Ordneranhang. `:336-337` zählt zusätzliche Modellaufrufe aus Werkzeugen gesondert. „Wie lange“ klingt nach Zeitlimit, das diese Zahlen nicht ausdrücken. `claude --help` nennt `--max-budget-usd` für `--print`, aber keinen festen Rundenwert; `codex --help` nennt ebenfalls keinen Rundenwert. Ein grundsätzlich unbegrenzter Lauf beider Coding-Agenten ist damit **unbelegt** (Nutzungs-, Kontext- und Budgetgrenzen bleiben möglich).

Vorschlag: Frage: „Wie viele Arbeitsschritte pro Auftrag?“ Petrol-Zelle: „12 äußere Modellrunden; 20 mit Ordner, Shell oder Rechner-Steuerung.“ Claude- und Codex-Zellen jeweils: „Kein festes Rundenlimit in der CLI-Hilfe belegt; Nutzung und Kontext begrenzen praktisch.“

### F12 — Git ist bei keinem Coding-Agenten eine automatische Nachkontrolle
Schwere: hoch
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:43` (Claude Code und Codex)
Status: [OFFEN]

Git protokolliert oder sichert Änderungen nicht schon durch die bloße Nutzung eines Coding-Agenten. Ein Git-Repository, ein Commit und eine menschliche Diff-Durchsicht sind zusätzliche Arbeitsschritte. Bei Claude existieren auch **vorherige** Berechtigungsprüfungen und optional Sandboxen ([Claude-Permissions](https://code.claude.com/docs/en/permissions), besonders Tabelle „Permission system“ und „How permissions interact with sandboxing“). Bei Codex begrenzt die Sandbox lokale Befehle **vorher**; sie ersetzt die Durchsicht nicht, und [Codex dokumentiert](https://learn.chatgpt.com/docs/agent-approvals-security), dass Websuche, MCP/Apps und Browser eigene Kontrollen haben. Die asymmetrische Gegenüberstellung „Claude nachher“ gegen „Codex Sandbox plus Git“ ist damit irreführend.

Vorschlag: Claude/Sicherheitsnetz: „Berechtigungsregeln vor Aktionen; Änderungen anschließend prüfen und bei versionierten Dateien mit Git vergleichen oder zurücknehmen.“ Codex/Sicherheitsnetz: „Sandbox und Freigaben vor Aktionen; Änderungen anschließend prüfen und bei versionierten Dateien mit Git vergleichen oder zurücknehmen.“

### F13 — Der Kernsatz behauptet zwei starre Sicherheitsmodelle
Schwere: hoch
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:45-46`
Status: [OFFEN]

F07-F12 zeigen: Petrol hat für Ergebnisdateien einen Übernahmeschritt, bei freigeschalteter Shell/Rechner-Steuerung aber Wirkungen während des Laufs. Claude Code und Codex besitzen beide Freigaben **vor** bestimmten Aktionen; Durchsicht und Git können bei beiden **nachher** folgen. „Enger Rahmen ... oder weiter Rahmen“ koppelt Sicherheit an den Produktnamen statt an tatsächlich eingestellte Rechte und Werkzeuge. Das könnte Lehrkräfte zu der falschen Schlussfolgerung führen, Coding-Agenten hätten nur nachträgliche Sicherungen.

Vorschlag: Kernsatz: „Entscheidend sind die eingeschalteten Werkzeuge und Freigaben: Was darf der Agent lesen, was darf er sofort ändern, und was prüft ein Mensch vor oder nach dem Lauf?“

Ohne Befund nach Abgleich: Codex-Cloudweg mit `--oss`/`--local-provider lmstudio|ollama` als lokale Option (`codex --help`); Claude-Dateiänderung und Befehlsausführung (`claude --help`, [Berechtigungstabelle](https://code.claude.com/docs/en/permissions)); Petrols Staging und spätere Einzelübernahme **für Ergebnisdateien** (`app/src/main/noteAgent/staging.ts:54-62`, `app/src/main/index.ts:5091-5121`). Diese Aussagen sind nur in den oben genannten Zellen wegen ihrer Verallgemeinerung zu korrigieren.

Nachprüfung Runde 2 (10.10.2026): F04 und F07–F08/F13 sind in der überarbeiteten Fassung im Kern umgesetzt. F01–F03, F05–F06 und F09–F12 bleiben an den folgenden Stellen teilweise offen; F14–F19 betreffen ausschließlich die neue Tabelle, den Kernsatz und die Fußnote unter „Claude-Antwort“.

### F14 — Beide Coding-Agenten können außerhalb des Arbeitsordners lesen
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:182` (Claude Code und Codex CLI in der überarbeiteten Tabelle)
Status: [OFFEN]

Die Kurzform „Arbeitsordner; weitere Orte/Lesewege möglich“ liest sich als Lesegrenze im Standardmodus. Für Claude beschreibt die [Berechtigungsdokumentation](https://code.claude.com/docs/en/permissions) ausdrücklich Lesezugriffe **außerhalb** der Arbeitsverzeichnisse und die erst zuschaltbare Sperre `permissions.blockReadsOutsideWorkingDirectories`; `~/.claude/settings.json` enthält hier unter `permissions` nur `defaultMode: auto`, keine solche Sperre (Runde-1-Schlüsselprüfung). Für Codex gewährt das für **diese** Sitzung übergebene Berechtigungsprofil `:root` lesend; die [Codex-Dokumentation](https://learn.chatgpt.com/docs/permissions) zeigt ein eigenes „workspace-only“-Profil mit `":root" = "deny"`, um Lesen außerhalb einzuschränken. Aus `codex --help` allein ist die Lesemenge des allgemeinen Defaults weiterhin **unbelegt**. Die neue Fassung darf deshalb weder enge noch globale Standard-Leserechte pauschal behaupten.

Vorschlag: Claude/Lesen: „Arbeitsordner und weitere für das Benutzerkonto lesbare Dateien; Sperrregeln können Zugriffe begrenzen.“ Codex/Lesen: „Arbeitsordner; je nach Sandbox-Profil auch Dateien außerhalb. Lesezugriff lässt sich begrenzen.“

### F15 — Petrols Zielordner und Cloud-Opt-in fehlen weiterhin
Schwere: niedrig
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:181-182` (Petrol in der überarbeiteten Tabelle)
Status: [OFFEN]

F05/F06 sind nur teilweise umgesetzt: `app/src/shared/agentRoute.ts:91-100` verlangt bei OpenRouter/LLMBase **zusätzlich** zur einmaligen Cloud-Zustimmung ein Feature-Opt-in für genau das eingestellte Modell. `app/src/main/noteAgent/loop.ts:183-187,214,233-239` erlaubt neben Vault, Anhängen und Skills auch `list_target_folder` für Namen und Vorlagen im gewählten Zielordner. Wer „Cloud nach einmaliger Zustimmung“ und die abschließende Leseliste wörtlich nimmt, übersieht beide Wege.

Vorschlag: Petrol/Modellort: „Ollama lokal, wenn die App es bestätigt; LM Studio ungeprüft. Cloud nach einmaliger Zustimmung, je nach Anbieter zusätzlich mit Opt-in.“ Petrol/Lesen: „Vault-Notizen, Anhänge und Ordner; bei Bedarf Zielordner und eingerichtete Skills.“

### F16 — Codex fragt jenseits des Arbeitsordners nicht immer
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:184` (Codex CLI in der überarbeiteten Tabelle)
Status: [OFFEN]

„Darüber hinaus Rückfrage“ ist als allgemeine Zusage falsch: `codex --help` bietet `--ask-for-approval never` (keine Rückfrage, ein Sandbox-Fehler wird an das Modell zurückgegeben) und `--approve-for-me` (automatische Prüfung). Selbst beim üblichen `on-request` kann ein Befehl **innerhalb** des Arbeitsordners wegen gesperrtem Netzwerk eine Freigabe benötigen; die [Codex-Dokumentation](https://learn.chatgpt.com/docs/agent-approvals-security) nennt Netzwerk und Änderungen außerhalb des Workspace getrennt. F10 verlangte diese Trennung.

Vorschlag: Codex/Freigabe: „Üblich: im Arbeitsbereich ohne Einzelrückfrage; für gesperrtes Netz oder Änderungen außerhalb fragt Codex. Rückfragen und Sandbox sind getrennt einstellbar.“

### F17 — Claude-Modus „auto“ bleibt in der Standardfußnote unsichtbar
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:184,190` (Claude Code und Fußnote der überarbeiteten Fassung)
Status: [OFFEN]

Die neue Zelle zählt Modi auf, aber die Fußnote nennt die Tabelle „typische Standardeinstellungen“. Für die hier konkret verglichene Installation wurde in Runde 1 `permissions.defaultMode: auto` aus `~/.claude/settings.json` ausgelesen; laut [Claude-Permissions](https://code.claude.com/docs/en/permissions) prüft dann ein Klassifikator viele Aktionen statt einer menschlichen Rückfrage. Ohne diese Angabe kann „automatische Prüfung“ als bloß mögliche Umstellung statt als **hier wirksamer Modus** verstanden werden. F09 ist damit nur teilweise umgesetzt.

Vorschlag: Claude/Freigabe: „Hier: automatische Prüfung. Umstellbar auf Rückfrage, vorab erlaubte Aktionen oder Planmodus; eigene Sperrregeln möglich.“

### F18 — „Kein festes Rundenlimit“ ist stärker als der Beleg
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:185` (Claude Code und Codex CLI in der überarbeiteten Tabelle)
Status: [OFFEN]

F11 beanstandete bereits, dass die Hilfeausgaben **keinen festen Rundenwert nennen**, nicht dass das Fehlen jedes internen, betrieblichen oder tariflichen Limits bewiesen wäre. `claude --help` zeigt `--max-budget-usd` für Druckläufe; `codex --help` bietet keinen belegten allgemeinen Rundenzähler. „Kein festes Rundenlimit“ macht aus diesem Nichtbeleg eine positive unbegrenzte Zusicherung und ist daher in beiden Zellen **unbelegt**.

Vorschlag: Beide Zellen: „Kein festes Rundenlimit in der CLI-Hilfe ausgewiesen; Nutzung und Kontext begrenzen den Lauf praktisch.“

### F19 — Fußnote verspricht Einstellbarkeit auch für feste Petrol-Grenzen
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:186,190` (Sicherheitsnetz und Fußnote der überarbeiteten Fassung)
Status: [OFFEN]

„Bei allen drei Agenten einstellbar“ bezieht sich grammatisch auf die ganze Tabelle. Beim Petrol-Agenten sind aber Staging/Einzelübernahme für Ergebnisdateien (`app/src/main/noteAgent/staging.ts:1-4`, `app/src/main/index.ts:5091-5121`) und 12/20 Iterationen (`app/src/main/noteAgent/loop.ts:24,41,333`) fest im Code; nur Zusatzfunktionen sind Opt-ins (`app/src/renderer/stores/uiStore.ts:1085-1092`). Auch „mit Git zurücknehmbar“ in beiden Coding-Agenten-Spalten gilt nur für versionierte Dateien; neue, nicht versionierte Ergebnisse sind dadurch nicht automatisch gesichert (F12). Die Fußnote führt so eine neue pauschale Behauptung ein und verwässert die Sicherheitsnetz-Zeile.

Vorschlag: Fußnote: „Grundmodus und zuschaltbare Funktionen, Stand Oktober 2026. Einzelne Rechte sind einstellbar; feste Produktgrenzen bleiben bestehen.“ Sicherheitsnetz Claude/Codex jeweils am Ende: „Git hilft bei versionierten Dateien; Durchsicht erfolgt durch den Menschen.“

Nachprüfung Runde 3 (10.10.2026): Die Kürzungen zu Leseumfang, Rundenzahl, Git und Kernsatz erhalten die Korrekturen aus F14–F19. Zwei Kürzungen in Modellweg und Freigabe machen wichtige Bedingungen wieder unklar:

### F20 — Cloud-Zustimmung ist einmalig, nicht pro Lauf
Schwere: niedrig
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:252` (Petrol in „Endfassung auf der Folie“)
Status: [OFFEN]

Aus „Cloud nach **einmaliger** Zustimmung“ wurde „Cloud nach Zustimmung“. Gerade in der Zeile „Wer gibt frei?“ steht daneben die Freigabe **vor dem Lauf** für Zusatzfunktionen; Lehrkräfte können daraus eine erneute Cloud-Frage bei jedem Auftrag ableiten. Tatsächlich speichert `app/src/renderer/stores/uiStore.ts:1092,1309` die versionierte Cloud-Zustimmung; `app/src/shared/agentRoute.ts:67-76,91-100` prüft sie beim Cloud-Lauf. Das Anbieter-Opt-in blieb korrekt erhalten.

Vorschlag: Petrol/Modellort: „Ollama lokal (App bestätigt); LM Studio ungeprüft. Cloud nach **einmaliger** Zustimmung, teils mit Opt-in.“

### F21 — Codex-Rückfrage klingt wieder ausnahmslos
Schwere: mittel
Stelle: `docs/codex-collab/fortbildung-agentenvergleich.md:255` (Codex CLI in „Endfassung auf der Folie“)
Status: [OFFEN]

„Für gesperrtes Netz oder außerhalb fragt Codex“ verliert das „Üblich“ aus F16 und unterscheidet nicht zwischen erlaubtem Lesen außerhalb und gesperrten **Änderungen**. `codex --help` nennt `--ask-for-approval on-request|never` und `--approve-for-me`; bei `never` wird nicht gefragt, bei automatischer Prüfung nicht zwingend der Mensch. Die [Codex-Dokumentation](https://learn.chatgpt.com/docs/agent-approvals-security) beschreibt die Rückfrage für Netz und Änderungen außerhalb im üblichen `on-request`-Modus. Der jetzige Text verspricht sie für alle Einstellungen.

Vorschlag: Codex/Freigabe: „Üblich: im Arbeitsbereich ohne Einzelrückfrage; bei gesperrtem Netz oder Änderungen außerhalb fragt Codex. Umstellbar.“

## Claude-Antwort

Alle 13 Findings angenommen (10.10.2026). Belegbares gegengeprüft (`codex --help`, `claude --help`, Petrol-Anker aus der Vorrunde); die zitierte Web-Dokumentation nicht selbst gelesen. F09 trifft auch meine Chat-Aussage über mich selbst: diese Sitzung läuft im Modus `auto`.

F01–F13 [ADRESSIERT] durch die überarbeitete Fassung:

**Titel:** Dieselben fünf Fragen an drei Agenten · **Dachzeile:** Vergleich

| Frage | Petrol-Agent (MindGraph Notes) | Claude Code | Codex CLI |
|---|---|---|---|
| Wo rechnet das Modell? | Lokal (Ollama, von der App geprüft) oder Cloud nach einmaliger Zustimmung; LM Studio: Rechenort ungeprüft | Cloud: Claude-Modelle über Anthropic oder einen Cloud-Anbieter | Cloud (OpenAI); lokal möglich über Ollama oder LM Studio |
| Was darf er lesen? | Vault-Notizen, angehängte Dateien und Ordner, eingerichtete Skills | Arbeitsordner; weitere Orte möglich, Sperrregeln einstellbar | Arbeitsordner; weitere Lesewege über das Sandbox-Profil einstellbar |
| Was darf er sofort bewirken? | Ergebnisdateien erst nach Ihrer Übernahme. Mit Opt-in während des Laufs: Shell, Öffnen, Drucken, Mail-Entwurf | Dateien ändern, Befehle ausführen | Dateien im Arbeitsordner ändern, Befehle in der Sandbox |
| Wer gibt frei? | Sie: jede Ergebnisdatei einzeln; Zusatzfunktionen vor dem Lauf | Je nach Modus: Rückfrage, automatische Prüfung oder vorab erlaubt; eigene Sperrregeln möglich | Im Arbeitsordner ohne Einzelrückfrage, darüber hinaus Rückfrage; Sandbox und Rückfragen getrennt einstellbar |
| Wie viele Arbeitsschritte? | 12 Modellrunden (20 mit Ordner, Shell oder Rechner-Steuerung) | Kein festes Rundenlimit | Kein festes Rundenlimit |
| Sicherheitsnetz | Vorher: Entwurf, dann Übernahme (nicht für freigegebene Zusatzfunktionen) | Vorher: Berechtigungsregeln. Nachher: Durchsicht, mit Git zurücknehmbar | Vorher: Sandbox und Freigaben. Nachher: Durchsicht, mit Git zurücknehmbar |

**Kernsatz:** Nicht der Name des Agenten entscheidet, sondern sein Rahmen: Was darf er lesen, was darf er sofort ändern – und was prüft ein Mensch vorher oder nachher?

**Fußnote:** Typische Standardeinstellungen, Stand Oktober 2026 – bei allen drei Agenten einstellbar.

Runde 2: F14–F19 [ADRESSIERT] mit den Ersatztexten aus den Findings, für die Folie gekürzt. **Endfassung auf der Folie:**

| Frage | Petrol-Agent (MindGraph Notes) | Claude Code | Codex CLI |
|---|---|---|---|
| Wo rechnet das Modell? | Ollama lokal (von der App bestätigt); LM Studio ungeprüft. Cloud nach Zustimmung, je nach Anbieter mit Opt-in | Cloud: Claude-Modelle über Anthropic oder einen Cloud-Anbieter | Cloud (OpenAI); lokal möglich über Ollama oder LM Studio |
| Was darf er lesen? | Vault-Notizen, Anhänge und Ordner; bei Bedarf Zielordner und eingerichtete Skills | Arbeitsordner und weitere lesbare Dateien Ihres Kontos; Sperrregeln möglich | Arbeitsordner; je nach Sandbox-Profil auch außerhalb; begrenzbar |
| Was darf er sofort bewirken? | Ergebnisdateien erst nach Ihrer Übernahme. Mit Opt-in während des Laufs: Shell, Öffnen, Drucken, Mail-Entwurf | Dateien ändern, Befehle ausführen | Dateien im Arbeitsordner ändern, Befehle in der Sandbox |
| Wer gibt frei? | Sie: jede Ergebnisdatei einzeln; Zusatzfunktionen vor dem Lauf | Gezeigte Einrichtung: automatische Prüfung. Umstellbar: Rückfrage, vorab erlaubt, Planmodus | Im Arbeitsbereich ohne Rückfrage; für gesperrtes Netz oder außerhalb fragt Codex |
| Wie viele Arbeitsschritte? | 12 Modellrunden (20 mit Ordner, Shell oder Rechner-Steuerung), fest | Kein festes Limit ausgewiesen; Nutzung und Kontext begrenzen | Kein festes Limit ausgewiesen; Nutzung und Kontext begrenzen |
| Sicherheitsnetz | Vorher: Entwurf, dann Übernahme (nicht für freigegebene Zusatzfunktionen) | Vorher: Berechtigungen. Nachher: Ihre Durchsicht; Git bei versionierten Dateien | Vorher: Sandbox und Freigaben. Nachher: Ihre Durchsicht; Git bei versionierten Dateien |

**Kernsatz:** Nicht der Name entscheidet, sondern der Rahmen: Was darf er lesen, was sofort ändern – und wer prüft wann?

**Fußnote:** Grundmodus und zuschaltbare Funktionen, Stand Oktober 2026. Claude Code wie in der gezeigten Einrichtung (Modus „auto“). Einzelne Rechte sind einstellbar, feste Produktgrenzen bleiben.

Runde 3: F20 [ADRESSIERT] „Cloud nach einmaliger Zustimmung, teils mit Opt-in“ (Ersatztext wörtlich). F21 [ADRESSIERT] „Üblich: im Arbeitsbereich ohne Einzelrückfrage; bei gesperrtem Netz oder Änderungen außerhalb fragt Codex. Umstellbar.“ (wörtlich). Folie als native Tabelle gebaut, 11,5 pt, validiert und gerendert.

## Status

Runde 1: 13 Findings, angenommen. Runde 2: 6 Findings (F14–F19), angenommen. Runde 3: 2 Findings (F20, F21), wörtlich übernommen. Abgeschlossen: 21 Findings, alle adressiert.
