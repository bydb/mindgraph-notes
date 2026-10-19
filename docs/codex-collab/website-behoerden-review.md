# Website-Review: schnell verständlich für Behörden (Bildung, Hochschule)

## Aufgabe

Jochen will, dass Claude und Codex die Landingpage https://mindgraph-notes.de/ (Quelle: `docs/index.html`)
**komplett** begutachten. Ziel des Nutzers, wörtlich zusammengefasst:

> Jeder Besucher soll möglichst schnell begreifen, **was MindGraph und der Petrol Agent ist** und **warum man
> als Behörde, z. B. in Bildung oder Universität, damit arbeiten sollte**; welche **Vorteile gegenüber anderen
> agentischen Systemen im Kontext Datenschutz** es bietet und **welche Rolle die individuellen Skills**
> mittlerweile spielen. Ziel: eine Seite, die ansprechend und schnell verständlich ist. Wirklich alles
> begutachten — Infos, die früher eine Rolle spielten, können raus, sie machen alles nur unnötig komplex.

Codex ist **Prüfer**. Bitte adversarial prüfen:

1. **5-Sekunden-Test / 30-Sekunden-Test**: Was versteht ein Referent im Schulamt, eine IT-Leitung einer
   Hochschule oder ein Datenschutzbeauftragter nach Hero + erstem Scroll? Was nicht?
2. **Zielgruppen-Passung**: Wo spricht die Seite noch Einzelkämpfer/Power-User/Obsidian-Umsteiger an statt
   Behörde/Bildung/Hochschule? Wo steht Jargon (Vault, Ollama, Dataview, typisierte Ports, SM-2, AES-256-GCM …)
   an einer Stelle, an der ein Entscheider aussteigt?
3. **Streichliste**: Welche Abschnitte/Karten/Module sind historisch gewachsen und verwässern die Botschaft?
   (Kandidaten u. a.: Telegram, Workflow Canvas, Feature-Grid „Was der Workspace kann", Modul-Leiste,
   „Kognition"-Band, Cloud-Abschnitt in der jetzigen Länge, doppelte Abschnitte „Warum"/„Wie es funktioniert"/
   „Was der Workspace kann"/„Warum MindGraph Notes" die dasselbe in vier Varianten sagen.) Konkret: behalten /
   kürzen / streichen / zusammenlegen, mit Begründung.
4. **Was fehlt**: Datenschutz-Differenzierung gegenüber anderen agentischen Systemen (Copilot, ChatGPT-Agent,
   Claude Cowork, OpenClaw o. ä.) — ohne unbelegte Behauptungen über Wettbewerber. Rolle der Skills
   (Starter-Skills: Arbeitsblatt, Elternbrief, Protokoll, Teilnehmerliste, Präsentation nach Vorlage, Edumap,
   Mindmap …). Was eine Behörde zum Entscheiden braucht (Betrieb ohne Konto, Open Source/AGPL,
   Datenwege, Signierung, Offline-Fähigkeit …).
5. **Faktentreue**: Stimmen Aussagen der Seite mit dem Code/CLAUDE.md überein? Veraltetes (Beta-Hinweise,
   Versionsangaben, „Morning Briefing", „KI-Relevanz", Telegram/Anthropic, Prozentzahlen mit Quelle …)?
   Behauptungen, die eine Behörde wörtlich nehmen und die nicht tragen (z. B. „alles lokal", „nie")?
6. **Vorschlag einer Zielstruktur** (Abschnittsfolge, je ein Satz Inhalt), höchstens ~8 Abschnitte bis Download.

**Keine Code-Edits, kein Commit, kein Push.** Findings ausschließlich unten in „Codex-Findings".

## Kontext/Anker

- Seite: `docs/index.html` (2565 Zeilen; DE-Text im Markup, EN im `translations`-Objekt ab ca. Zeile 1830;
  i18n über `data-i18n`). Abschnitte:
  - Nav `docs/index.html:476-494` (Features/Warum/Kognition/Download/Blog/GitHub)
  - Hero `:497-540` (Titel „KI-Arbeit, die du nachprüfen kannst.", Video Mail→Dashboard)
  - Problem „Du bist Chef, Sachbearbeiter und Gedächtnis" `:627-638` (Statistiken HBR/McKinsey)
  - Warum 01 Agent `:645-677` · 02 Vault-Chat `:679-702` · 03 Dashboard `:704-723` · 04 Ein Arbeitsraum `:725-745`
    · 05 Lokale KI `:747-773` · 06 Kognition `:775-790`
  - Proof `:792-805` · Praxis Medienzentrum `:807-820` · Macher `:822-834` · Invite `:836-845`
  - „Ein Werkzeug, sechs Bausteine" `:873-965` (Reiter, drei davon mit demselben alten `screenshot.webp`)
  - „Ein Arbeitsraum, Module nach Bedarf" `#features` `:1354-1500` (9 Karten inkl. Telegram, Workflow Canvas)
  - „Ein integrierter Arbeitsplatz statt acht Apps" `#why` `:1503-1529`
  - Modellqualität `:1531-1549` · Cloud `:1589-1628` · Modul-Leiste `:1630-1658`
  - Release 1.0 `:1660-1678` · Download `:1680-1710` (Fallback-Text „v0.10.27-beta") · FAQ `:1712-1760`
    (u. a. „Ist die App stabil? Sie ist im Beta." und „Haeufige Fragen")
- Produktwahrheit: `CLAUDE.md` (Abschnitte Notiz-Agent, Cloud-Zustimmung/Datenwege, Vault-Index, Shell,
  Rechner-Steuerung, Webrecherche, Agent-Skills), Starter-Skills `app/resources/starter-skills/*/SKILL.md`,
  Skill-Katalog `docs/skills/`.
- Positionierung bisher (beschlossen 04.10.2026): Klammer „Ein lokaler Wissens- und Arbeitsraum, in dem
  KI-Arbeit nachvollziehbar bleibt", Belege Agent → Vault-Chat → Dashboard. Wording-Regel: Vault-Chat
  „mit Quellen", nie „belegt".
- Harte Leitplanken: keine Kundennamen; kein Gendern; Datenschutz-Sätze „standardmäßig" statt absolut,
  wo Cloud-Opt-ins existieren; Nutzer entscheidet über Cloud (Transparenz statt Sperre), Brain bleibt lokal.

## Codex-Findings

### F01 — Der Petrol Agent kommt im ersten Eindruck nicht vor
Schwere: hoch
Stelle: docs/index.html:506
Status: [OFFEN]
Im Hero heißt er nur „der Agent“; „Petrol Agent“ steht im sichtbaren deutschen Text erstmals im Release-Abschnitt bei Zeile 1666. Der 5-Sekunden-Test beantwortet weder, was Petrol ist (der Auftragsagent in MindGraph), noch welches konkrete Arbeitsergebnis eine Behörde erhält. Das Video zeigt Mail → Notiz → Dashboard (Zeilen 521–525) statt einen Agent-Auftrag mit prüfbarem Ergebnis. Erst ab Zeile 645 wird das Produkt greifbar.
Vorschlag: Hero auf „MindGraph = lokaler Arbeitsraum; Petrol Agent = erstellt mit eigenen Unterlagen prüfbare Dokumente“ zuspitzen und ein Behördenbeispiel mit Auftrag → Vorschau → Übernahme direkt dort zeigen.

### F02 — Der erste Scroll spricht ausdrücklich die falsche Zielgruppe an
Schwere: hoch
Stelle: docs/index.html:629
Status: [OFFEN]
„Chef, Sachbearbeiter und Gedächtnis in einer Person“, „keine Assistenz, kein Team“ (Zeilen 629–631) adressiert Soloselbstständige. Später nennt die Seite ihre Zielgruppe sogar „Einzelkämpfer und Power-User“ (Zeile 1507). Für Schulamt, Hochschule und Datenschutzbeauftragte bleiben gemeinschaftliche Prozesse, Vorlagen, Freigabe und Datenwege unsichtbar. Die Medienzentrum-Praxis folgt erst nach sechs „Warum“-Kapiteln (Zeile 807).
Vorschlag: Problemblock streichen und den konkreten Bildungs-/Verwaltungsfall aus Zeile 807 nach dem Hero bringen; „Einzelkämpfer und Power-User“ ersetzen.

### F03 — Skills sind Randnotiz statt Hauptnutzen
Schwere: hoch
Stelle: docs/index.html:650
Status: [OFFEN]
Skills werden als „ganz normale Notiz (offener SKILL.md-Standard)“ eingeführt; der einzige vertiefte Absatz steckt in einem zunächst inaktiven Tab (Zeilen 939–948). Die Seite zeigt keine mitgelieferten Arbeitsanleitungen und keinen Unterschied zwischen allgemeinem Modell und behördenspezifischer Arbeitsweise. Tatsächlich liegen elf Starter-Skills in `app/resources/starter-skills/*/SKILL.md`, darunter Arbeitsblatt, Elternbrief, Protokoll, Teilnehmerliste, Präsentation nach Vorlage, Edumap und Mindmap; `app/src/main/noteAgent/loop.ts:121–127,183–188` bietet passende Skills als Arbeitsanleitung an und lädt sie vor der Ausführung. „Skill: Statusbericht“ im Mockup (Zeile 661) ist dagegen kein mitgelieferter Starter-Skill.
Vorschlag: Frühen eigenständigen Skills-Abschnitt mit 3–4 konkreten Ergebnissen und einer eigenen anpassbaren Behördenvorlage; klar sagen, dass Skills Arbeitsanleitungen sind, keine garantierte Qualität und keine automatische Ausführung.

### F04 — Datenschutz-Vorteil wird behauptet, aber nicht als Datenweg erklärt
Schwere: hoch
Stelle: docs/index.html:750
Status: [OFFEN]
„Deine Daten bleiben bei dir“ und „ohne Datenabfluss“ (Zeile 1521) stehen verstreut neben einem langen Cloud-Verkaufsblock (Zeilen 1589–1626). Für eine Datenschutzprüfung fehlt die kompakte Antwort: Was liegt lokal? Was erhält ein optionales Cloud-Modell bei einem Agent-Lauf? Was geht bei Webrecherche, Bildgenerierung, E-Mail und Sync wohin? Der Code unterscheidet beim Agenten `local`, `cloud` und `unverified` (`app/src/shared/agentRoute.ts:15–16,42–64`); Cloud-Läufe dürfen nach Opt-in auch Vault-Inhalte lesen (`CLAUDE.md:374–377`). Ein pauschaler Vergleich mit anderen Agenten ist ohne belegte Wettbewerberanalyse nicht belastbar.
Vorschlag: Eine knappe Datenweg-Tabelle nach Funktion und Schalter, einschließlich „lokal geprüft / nicht geprüft / Cloud“; Vorteil als eigene überprüfbare Architektur formulieren, ohne Aussagen über Copilot, ChatGPT, Claude oder OpenClaw.

### F05 — LM Studio wird unzulässig als nachweislich lokal dargestellt
Schwere: hoch
Stelle: docs/index.html:751
Status: [OFFEN]
Die Seite setzt „Ollama/LM Studio“ mit „Modellen auf deinem Rechner“ gleich (auch Zeilen 917, 1521, 1612). Für den Petrol-Agenten stuft `app/src/shared/agentRoute.ts:9–11,50–51` LM Studio ausdrücklich als `unverified` ein: Eine Loopback-Adresse beweist den tatsächlichen Rechenort nicht. Ollama kann seinerseits Remote-Modelle verwenden (`app/src/shared/agentRoute.ts:60–62`). Bei einer Behörde ist „lokal“ eine überprüfbare Eigenschaft, kein Produktname.
Vorschlag: „Mit nachweislich lokalem Ollama-Modell lokal; LM Studio wird als nicht geprüft ausgewiesen“ formulieren und den Vorabhinweis des Agenten erwähnen.

### F06 — Quellenprüfung wird als inhaltlicher Faktencheck verkauft
Schwere: hoch
Stelle: docs/index.html:683
Status: [OFFEN]
„Die App prüft, welche Sätze zu ihrer Quelle passen“ und „Findet sie nichts Passendes, sagt sie das“ klingen nach semantischer Belegprüfung mit Ergebnisgarantie. `app/src/shared/rag/citations.ts:4–9,70–71,100–109` prüft Quellennummer, Wortdeckung und wörtliche Zitate, ausdrücklich keine Wahrheit oder inhaltliche Deckung; `app/src/main/rag/vaultPrompt.ts:46–52` fordert das Modell lediglich auf, bei fehlender Quelle nicht zu raten. Das Mockup „Quellen · passen zur Antwort“ (Zeile 693) verstärkt die Überdehnung.
Vorschlag: „Antwort mit Quellenstellen; die App markiert fehlende/ungültige Zitate und geringe Wortdeckung. Inhalt bitte prüfen.“ Im Mockup „zitierte Stellen“ statt „passen zur Antwort“.

### F07 — Freigabe wird zu pauschal versprochen
Schwere: hoch
Stelle: docs/index.html:508
Status: [OFFEN]
„Gespeichert wird erst, wenn du zugestimmt hast“ und „du prüfst jedes Ergebnis“ (Zeilen 649, 943, 1666) beziehen sich technisch auf Ergebnisdateien im Staging und deren Übernahme (`app/src/main/noteAgent/loop.ts:191–192`; `app/src/main/index.ts:5088–5114`). Der optional freigegebene Rechnerzugriff kann dagegen Programme öffnen, drucken oder einen Mail-Entwurf erzeugen, bevor eine Ergebniskarte übernommen wird (`CLAUDE.md:436–444`); Webrecherche sendet Suchanfragen während des Laufs (Zeile 956). Die jetzige Formulierung kann als Freigabe jedes Agentenschritts verstanden werden.
Vorschlag: „Erzeugte Ergebnisdateien werden erst nach deiner Übernahme im Arbeitsordner gespeichert“; separate optionale Vorgänge und Datenwege knapp benennen.

### F08 — Produktversprechen „offline“ und „alles lokal“ ist zu absolut
Schwere: mittel
Stelle: docs/index.html:1719
Status: [OFFEN]
Die Konto-FAQ sagt „Alles läuft lokal“, der Mailvergleich „Alles lokal, kein Cloud-Leak“ (Zeile 1517), obwohl derselbe Auftritt IMAP/SMTP, Sync, Telegram, Webrecherche, Cloud-Modelle und Bildgenerierung nennt (Zeilen 1423, 1436, 955, 1614–1626, 1735). Offline nutzbar sind Kernfunktionen mit lokal installiertem Modell; Mail, Sync, Web und Cloud haben eigene Netzwege. Die Unterscheidung ist für Behörden zentral und derzeit nur verteilt, teils widersprüchlich.
Vorschlag: „Ohne Konto und Cloud-Zwang; Notizen und geeignete lokale KI offline nutzbar“; Netzwerkfunktionen einzeln als optional ausweisen.

### F09 — Sicherheitskarte suggeriert Schutz vor Prompt Injection durch Signierung/Sanitization
Schwere: mittel
Stelle: docs/index.html:1491
Status: [OFFEN]
„Gehärteter Prompt-Injection-Schutz im KI-Modul“ bleibt unbegrenzt; DOMPurify betrifft gerendertes HTML, nicht das Befolgen bösartiger Anweisungen durch ein Modell. `CLAUDE.md:374–377` beschreibt bewusst breite Vault-Leserechte im Cloud-Lauf, und `app/src/main/rag/vaultPrompt.ts:55–57` enthält Promptregeln für fremde Quellen. Signierte Plugins werden in Zeile 1507 erwähnt, aber die Signatur belegt laut Projektvorgabe Herkunft/Integrität, kein Sandboxing. Ohne diese Grenze kann ein Entscheider die Sicherheitsarchitektur falsch einschätzen.
Vorschlag: Schutzgrenzen präzise angeben: Vault-Pfadprüfung, getrennte Cloud-Freigabe, Ergebnisübernahme, Signatur für Herkunft; Prompt Injection als verbleibendes Risiko benennen oder die pauschale Sicherheitskarte streichen.

### F10 — Vier Produktübersichten verdoppeln sich und verdrängen die Entscheidungshilfe
Schwere: hoch
Stelle: docs/index.html:873
Status: [OFFEN]
Auf sechs „Warum“-Kapitel (Zeilen 645–790) folgen sechs Tabs „Wie es funktioniert“ (873–964), neun Feature-Karten (1354–1500), „Warum MindGraph“ (1503–1529) und eine Modul-Leiste (1630–1657). Dashboard, Agent, lokale KI und Arbeitsraum werden mehrfach erklärt. Bis zum Download in Zeile 1680 muss man zudem Kognition, Macher, Motorrad-Einladung, Modellmatrix und langen Cloud-Block passieren. Auf Handy sind drei Tab-Abbildungen dasselbe `screenshot.webp` (Zeilen 935, 948, 961), obwohl die Alt-Texte verschiedene Funktionen behaupten.
Vorschlag: Agentbeispiel und Skills behalten; Vault-Chat/Dashboard auf einen Belegblock kürzen; Tabs, Feature-Grid, „Warum“-Doppelung und Modul-Leiste zusammenlegen oder streichen; Modellmatrix als Vertiefungslink.

### F11 — Historische Module schwächen die Datenschutz-Botschaft
Schwere: mittel
Stelle: docs/index.html:1432
Status: [OFFEN]
Telegram mit Nachrichtenweg über Telegram und optional Anthropic erhält eine eigene Karte (Zeilen 1432–1444), obwohl es experimentell und standardmäßig aus ist. Workflow Canvas erklärt „typisierte Ports“ (1390–1402), die Kognition-Strecke MIT-Studie und Need-for-Cognition-Test (775–789), Flashcards SM-2 (1446–1456), die Integrationskarte diverse Spezialdienste (1473–1485). Diese Inhalte beantworten keine der drei Kernfragen für Behörden und lassen das Produkt wie eine Feature-Sammlung wirken.
Vorschlag: Telegram, Workflow Canvas, Kognition-Band und Lern-/Integrationskarten von der Landingpage streichen; gegebenenfalls in verlinkte Detailseiten verschieben. Praxis Medienzentrum kürzen und als frühes, überprüfbares Beispiel behalten.

### F12 — Zahlen und Einsatzbelege sind nicht nachvollziehbar
Schwere: mittel
Stelle: docs/index.html:633
Status: [OFFEN]
„~1.200×“ mit bloßem „Harvard Business Review“, „~2 Std.“ mit bloßem „McKinsey Global Institute“ und „48 % … Bitkom 2025“ (Zeile 752) haben keine Studie, Methodik oder anklickbare Fundstelle; ihre Übertragbarkeit auf Schulämter/Hochschulen wird nicht erklärt. „3.000+ Notizen, stabil“ (Zeile 799) ist eine interne Praxisaussage, aber keine belastbare Stabilitätsprüfung für Behördendeployment. Aus dem Code lassen sich diese Marketingzahlen nicht verifizieren.
Vorschlag: Statistiken streichen oder exakt belegen und einordnen; Praxisaussage auf „im eigenen Medienzentrum im Einsatz“ begrenzen, keine generelle Stabilitätsgarantie daraus ableiten.

### F13 — Release und Beta widersprechen sich in derselben Seite
Schwere: mittel
Stelle: docs/index.html:1738
Status: [OFFEN]
Hero und Release nennen v1.0.0 als stabil (Zeilen 503, 1664–1666; `app/package.json:3` bestätigt 1.0.0), die FAQ fragt und beantwortet weiterhin „Sie ist im Beta“ (1738–1739). Per JS wird die Versionsnummer aus JSON-LD eingesetzt (`docs/index.html:2385–2422`), aber die Beta-FAQ bleibt auch nach Übersetzung unverändert (`2060–2061`, `2345–2346`). Fallbacks im Download zeigen zudem alte Beta-Versionen (1690–1702), falls das Skript ausfällt.
Vorschlag: Beta-FAQ neu schreiben und Fallbacks aktualisieren; Stabilität konkret als Release-Status statt als unbeschränktes Qualitätsversprechen formulieren.

### F14 — Betriebsvoraussetzungen und Beschaffungssignale kommen zu spät
Schwere: mittel
Stelle: docs/index.html:1680
Status: [OFFEN]
Kein Konto, AGPL und offene Dateien stehen verstreut in Proof, Release und FAQ (Zeilen 799–801, 1671, 1718–1743); der Download erklärt nur „in 2 Minuten startklar“, ohne die Voraussetzung für lokale KI zu nennen. Für IT und Datenschutz fehlen vor dem CTA ein kompakter Betriebssteckbrief, die Abgrenzung „App ohne Modell nutzbar / lokale KI braucht Modell und Hardware“, Plattformen sowie der Hinweis auf Signierung/Prüfbarkeit des Installers. Der Cloud-Block investiert dagegen 39 Zeilen in Anbieter und Modellgrößen (1589–1627).
Vorschlag: Vor Download einen knappen Beschaffungsblock mit Konto, Lizenz, Dateiformat, lokalem Modellbedarf, optionalen Netzwegen und konkreten Release-/Signaturinformationen setzen; Cloud-Anbieterdetails auslagern.

### F15 — Zielstruktur
Schwere: mittel
Stelle: docs/index.html:497
Status: [OFFEN]
Die derzeitige Abschnittsfolge setzt die Entscheidungshilfe erst nach mehreren Wiederholungen und Spezialmodulen zusammen.
Vorschlag: (1) Hero: MindGraph und Petrol Agent in einem Satz plus konkretes Ergebnis. (2) Praxisfall Bildung/Hochschule: Auftrag → Vorlage/Skill → prüfbare Datei. (3) Skills: mitgelieferte Beispiele und eigene Arbeitsanleitung. (4) Nachvollziehbarkeit: Ergebnisübernahme, Vault-Chat mit Quellenstellen, Grenzen der Prüfung. (5) Datenschutz/Datenwege: lokal geprüft, optionales Netz, Cloud-Zustimmung. (6) Betrieb/Beschaffung: Konto, AGPL, Formate, Modellbedarf, Plattformen/Signierung. (7) Kurzer Praxisbeleg und Vertiefungslinks. (8) Download.

### F16 — AGPL-Steckbrief unterschlägt Pflichten bei unveränderter Weitergabe
Schwere: hoch
Stelle: docs/index.html:773
Status: [OFFEN]
„Pflichten entstehen erst, wenn Sie den Code verändert weitergeben oder als Dienst anbieten“ ist falsch. Auch die Weitergabe unveränderter Kopien verlangt Lizenz-/Copyright-Hinweise und Lizenztext; für Objektcode gelten zusätzlich die Quellcode-Bereitstellungsregeln. Das Paket selbst nennt `AGPL-3.0-or-later` (`app/package.json:37`), die Kurzfassung auf der Seite dagegen `AGPL-3.0`. Maßstab: [GNU AGPLv3, §§ 4–6 und 13](https://www.gnu.org/licenses/agpl-3.0.de.html). Für die Beschaffung ist genau diese Vereinfachung riskant.
Vorschlag: Nutzungskosten und Nutzungserlaubnis nennen, Lizenzpflichten bei Weitergabe/Änderung/Netzbetrieb nur mit Verweis auf den Lizenztext skizzieren; Lizenzbezeichnung mit `AGPL-3.0-or-later` abgleichen.

### F17 — Die Datenweg-Tabelle lässt relevante Empfänger aus
Schwere: hoch
Stelle: docs/index.html:748
Status: [OFFEN]
Die Tabelle nennt bei Webrecherche nur Suchanfragen an den Suchdienst, obwohl `web_fetch` auch gefundene Webseiten direkt abruft (`app/src/main/noteAgent/skills.ts:1702–1731`; `CLAUDE.md:284–289`). Die optionale Bildgenerierung sendet Prompts an Google, auch bei lokalem Agent-Modell (`CLAUDE.md:377,386`; `app/src/main/index.ts:4808–4816`). Optional kann die E-Mail-Analyse ein Cloud-Modell nutzen (`app/src/main/index.ts:12211–12222,12422–12426`), während die E-Mail-Zeile nur den eigenen Mailserver nennt. Das SVG nennt vier Ausgänge und vermittelt dadurch einen vollständigen Datenfluss, den die Tabelle nicht einlöst.
Vorschlag: In der kompakten Tabelle zusätzlich Webseitenabruf, Bilddienst und mögliche Cloud-Analyse von Mail-Inhalten ausweisen oder deutlich auf eine vollständige Datenweg-Liste verlinken; den SVG-Text als Auswahl kennzeichnen.

### F18 — „Kein Server des Herstellers“ widerspricht optionalem Sync und Cloud-Lauf
Schwere: hoch
Stelle: docs/index.html:713
Status: [OFFEN]
Die Antwort „Es gibt keinen Server des Herstellers, über den Ihre Inhalte laufen“ ist absolut. Der optionale Sync nutzt laut `CLAUDE.md:522–526` das Relay `sync.mindgraph-notes.de` und überträgt verschlüsselte Vault-Daten; Cloud-Läufe senden Auftrag und gelesene Inhalte an den gewählten Modellanbieter (`CLAUDE.md:374–377`). Selbst wenn der Satz nur unverschlüsselte Inhalte und den Standardbetrieb meinen soll, sagt er das nicht. Hero und HTML-Metadaten versprechen zugleich einen Agenten „der im Haus bleibt“ (`docs/index.html:7,424`), obwohl der Nutzer einen Cloud-Lauf wählen kann.
Vorschlag: „Im lokalen Standardlauf gehen Auftragsinhalte an keinen Modelldienst; beim optionalen Sync verlassen ausschließlich verschlüsselte Daten den Rechner; bei Cloud-Läufen gehen gelesene Inhalte an den gewählten Anbieter“ präzise unterscheiden.

### F19 — Rechnersteuerung hat keine Sandbox
Schwere: hoch
Stelle: docs/index.html:755
Status: [OFFEN]
Die Tabellenzeile „Programme & Kommandozeile … unter macOS in einer Sandbox des Betriebssystems“ fasst zwei verschiedene Rechte zusammen. Nur die Agent-Shell läuft mit Sandbox und Selbsttest (`app/src/main/noteAgent/shellExecution.ts:1–4,51–65`). Die Rechnersteuerung sagt ausdrücklich „hier gibt es KEINE Sandbox“, da Öffnen, Drucken und Mail-Entwurf außerhalb der App wirken (`app/src/main/noteAgent/computerControl.ts:1–10`; `CLAUDE.md:436–444`). Für eine Datenschutz- oder IT-Prüfung ist das eine falsche Schutzbehauptung.
Vorschlag: Zwei Tabellenzeilen: Shell mit macOS-Sandbox und Schreibgrenze; Rechnersteuerung mit fest vorgegebenen Vorgängen, doppelter Freigabe und sofortiger Wirkung außerhalb der App.

### F20 — „Keine Nutzungsdaten“ verschweigt lokales Tätigkeitsprotokoll
Schwere: mittel
Stelle: docs/index.html:714
Status: [OFFEN]
„Keine Nutzungsdaten“ steht erneut im IT-Steckbrief (Zeile 774). Die App führt ein lokales Tätigkeitsprotokoll unter `userData/activity/<Vault-Hash>.json` mit Ereignissen aus Läufen, Übernahmen und Aufgaben (`app/src/main/activityLedger.ts:1–7,28–39,80–91`). Das ist keine Telemetrie, aber durchaus Nutzungsdaten. Ein Datenschutzbeauftragter kann die Aussage als „es werden keine Nutzungsdaten erfasst“ lesen.
Vorschlag: „Keine Nutzungsdaten an den Hersteller, keine Telemetrie/Tracker; lokale Tätigkeitsdaten für die Arbeitsbilanz“ schreiben und Ablageort bzw. Zweck knapp nennen.

### F21 — Das gezeichnete SKILL.md ist als Vorlage technisch falsch
Schwere: mittel
Stelle: docs/index.html:623
Status: [OFFEN]
Das SVG zerlegt `description:` in zwei Zeilen (Zeilen 623–624). Der echte Parser liest nur einen einzeiligen `description:`-Wert und ignoriert die Folgezeile (`app/src/main/noteAgent/skillsLoader.ts:27–37`). Zudem behauptet die Karte „Neue Notiz im Ordner Skills anlegen … fertig“ (Zeile 650); geladen werden ausschließlich Dateien `Skills/<Ordner>/SKILL.md` (`skillsLoader.ts:1–2,53–75`). Wer die Grafik wörtlich nachbaut, erzeugt keinen wirksamen Skill oder nur eine abgeschnittene Beschreibung.
Vorschlag: SVG mit einzeiligem Frontmatter und korrektem Pfad zeichnen; beim eigenen Skill „Unterordner mit SKILL.md“ sagen, gern mit Link zu einer importierbaren Vorlage.

### F22 — Arbeitsblatt wird als sofort lokal nutzbarer Starter-Skill gezeigt
Schwere: mittel
Stelle: docs/index.html:637
Status: [OFFEN]
Die Überschrift „Mitgeliefert – sofort einsetzbar“ umfasst das Arbeitsblatt (Zeile 640). `app/resources/starter-skills/arbeitsblatt/SKILL.md:1–29` verlangt jedoch eingeschaltete Webrecherche; ohne `web_search` und `web_fetch` muss der Skill vor jeder Ausgabe abbrechen. Gerade auf einer Seite, deren Hero und IT-Steckbrief lokalen und Offline-Betrieb hervorheben, ist die fehlende Bedingung entscheidungsrelevant.
Vorschlag: Beim Arbeitsblatt ausdrücklich „Webrecherche erforderlich“ kennzeichnen und den Netzweg im Datenschutzabschnitt mit diesem Beispiel verbinden.

### F23 — Hardwarezahl vermischt Modellklasse und konkrete Messung
Schwere: mittel
Stelle: docs/index.html:777
Status: [OFFEN]
„27-Milliarden-Klasse – rund 18 GB Arbeitsspeicher“ klingt wie eine allgemeine Hardware-Anforderung. Die tatsächlich empfohlene Agent-Konfiguration ist `qwen3.6:27b-mlx` (`app/src/shared/modelCompatibility.ts:629–647`), die Modellmatrix nennt dafür ~19 GB (`docs/model-quality.html:529–535`). ~18 GB gilt für ein anderes 27B-Modell, dessen Skill-Praxistest dort noch aussteht (`docs/model-quality.html:539–545`); dessen Speicherbedarf steigt bei größerem Kontext. „Rechner ab 32 GB“ kann als Faustregel bestehen, die 18-GB-Zahl braucht einen Modell-/Kontextbezug.
Vorschlag: Empfohlenes Modell und dessen Messwert nennen oder die Zahl ganz weglassen; Hardware als Richtwert mit Abhängigkeit von Modell und Kontext ausweisen.

### F24 — Quellen- und Skill-Zusagen klingen deterministischer als der Code
Schwere: mittel
Stelle: docs/index.html:695
Status: [OFFEN]
„Nennt zu jedem Satz die Stelle“ und „liegt nichts Passendes vor, sagt er das“ sind Garantien für Modellverhalten. `app/src/main/rag/vaultPrompt.ts:46–52` fordert Zitate und das Eingeständnis fehlender Quellen nur im Prompt; `app/src/shared/rag/citations.ts:4–9` markiert Verstöße, statt sie zu verhindern. Ebenso ist „folgt dem passenden Skill“ (Zeile 562) eine Promptanweisung, keine erzwungene Ausführung (`app/src/main/noteAgent/loop.ts:121–127,183–188`).
Vorschlag: „Soll jeden inhaltlichen Satz zitieren; die App markiert Sätze ohne Quellenangabe“ und „kann die passende Arbeitsanleitung laden; Ergebnis prüfen“ formulieren.

### F25 — Alte Release-Anker zeigen jetzt auf den Download
Schwere: mittel
Stelle: docs/index.html:809
Status: [OFFEN]
`#features` und `#why` wurden als Alias am passenden Themenanfang erhalten (Zeilen 546, 703). `#changelog` steht dagegen als leeres Element am Anfang des Downloads; die eigentliche Release-Zeile folgt erst in Zeile 834. Alte Links auf den Changelog führen damit nicht zu Release-Informationen. Die FAQ liegt weiterhin unter `#faq` (Zeile 839).
Vorschlag: `id="changelog"` auf die Release-Zeile setzen oder einen kleinen sichtbaren Release-Block damit markieren; bestehende externe Links auf diese vier Anker gezielt gegenprüfen.

### F26 — Dekorative SVG-Icons und Dialoge sind für Tastatur/Screenreader nicht sauber markiert
Schwere: mittel
Stelle: docs/index.html:427
Status: [OFFEN]
Die fünf großen Illustrationen haben `role="img"` und übersetzte `aria-label` (Zeilen 433, 500, 618, 665, 682, 719). Die vielen reinen Icon-SVGs in Buttons, Chips, Karten und Downloads (z. B. Zeilen 427, 573–580, 773–780) haben hingegen weder `aria-hidden="true"` noch einen eigenen Namen und können als unbenannte Grafiken in der Accessibility-Struktur erscheinen. Die Modal-Schließer sind klickbare `<span>` ohne Tastaturfokus (Zeilen 861, 882); `openModal` setzt weder Fokus noch Dialog-Rolle (`1225–1235`).
Vorschlag: Dekorative Icons konsequent aus dem Accessibility-Baum nehmen; Schließer als Buttons und Modals als benannte Dialoge mit Fokusführung ausführen.

### F27 — Drei Datenweg-Spalten sind auf schmalen Handys ohne Ausweichlayout
Schwere: mittel
Stelle: docs/index.html:748
Status: [OFFEN]
Die Tabelle bleibt auch unter 720 px dreispaltig; die mobile Regel reduziert nur Schrift und Zellabstand (`docs/index.html:345–359`). Gleichzeitig unterdrückt `body` horizontales Scrollen (`:91`). Bei 320 px Bildschirmbreite bleiben im `.wrap` nur 288 px für Bereich, Standard und lange Optionssätze. Das kann die dritte Spalte abschneiden oder zu schwer lesbaren Wortbrüchen führen; eine echte mobile Umstellung oder horizontal scrollbarer Tabellenrahmen fehlt.
Vorschlag: Mobile Karten mit Überschrift „Standard / Optional“ oder einen beschrifteten horizontal scrollbaren Tabellencontainer verwenden und bei 320/360 px in DE und EN sichtbar prüfen.

### F28 — Englische Fassung hat vollständige Schlüssel, aber deutsche Metadaten
Schwere: niedrig
Stelle: docs/index.html:7
Status: [OFFEN]
Die statische Schlüsselprüfung fand für alle `data-i18n`- und `data-i18n-aria`-Elemente einen englischen Eintrag; `{vs}` wird aus `softwareVersion` eingesetzt (`docs/index.html:1188–1222`). Nach Umschalten auf EN bleiben jedoch `<title>`, Meta-Description, Open-Graph- und Twitter-Texte deutsch (Zeilen 7–8, 23–35). Alle `hreflang`-Werte zeigen sogar auf dieselbe URL (Zeilen 16–19); ein auf Englisch geteilter Tab erhält daher deutschen Linktext und Suchmaschinen keine eigene englische URL.
Vorschlag: Titel/Metadaten bei Sprachwechsel mitführen; für `hreflang` entweder echte Sprach-URLs bereitstellen oder die gleichlautenden Alternates entfernen.

## Claude-Antwort

Gegengeprüft am Code: F05 (`shared/agentRoute.ts:9-11,50-51`), F06 (`shared/rag/citations.ts:4-9`), F07 (CLAUDE.md Rechner-Steuerung) tragen. Nutzerentscheidungen 19.10.2026: Zielgruppe Bildung **und** Mittelstand, SVG-Grafiken statt Screenshots; Anrede „Sie“ (von Claude gesetzt, beiden Zielgruppen angemessen). `docs/index.html` neu aufgebaut (8 Abschnitte + FAQ statt ~20).

- F01 [ADRESSIERT] Hero nennt Zielgruppe, „Petrol Agent“ und Ergebnis; SVG Auftrag → Agent → „Zur Prüfung“ ersetzt das Mail→Dashboard-Video.
- F02 [ADRESSIERT] Problemblock und „Einzelkämpfer und Power-User“ gestrichen; Beispiele getrennt nach Schule/Hochschule und Verwaltung/Mittelstand; Praxis Medienzentrum als eigener Abschnitt vor dem Download.
- F03 [ADRESSIERT] Eigener Skills-Abschnitt: Was ein Skill ist (SVG der SKILL.md), die 11 mitgelieferten Skills + „eigener Skill“, Hinweis „verlässlicher, nicht fehlerfrei“. Mockup-Skill „Statusbericht“ entfernt.
- F04 [ADRESSIERT] Abschnitt Datenschutz: fünf Fragen + Datenweg-SVG + Tabelle je Bereich (Standard / nur wenn eingeschaltet). Keine Aussagen über Wettbewerber.
- F05 [ADRESSIERT] Lokal = „lokal über Ollama“, App prüft vor jedem Lauf; LM Studio in FAQ als „nicht geprüft“ ausgewiesen.
- F06 [ADRESSIERT] „Zitierte Stellen“ statt „passen zur Antwort“; Text: App markiert Sätze ohne/mit schwacher Quelle, ob die Aussage stimmt, entscheiden Sie; FAQ „Prüft die App, ob eine Antwort stimmt? Nein“.
- F07 [ADRESSIERT] „Ergebnisdateien … erst nach Übernahme gespeichert“; Programme/Kommandozeile, Webrecherche, Mail als eigene Datenwege in der Tabelle.
- F08 [ADRESSIERT] Keine „alles lokal“-Sätze mehr; Offline-Steckbrief nennt Netzwerkfunktionen als einzeln zuschaltbar.
- F09 [ADRESSIERT] Sicherheitskarte mit DOMPurify/Prompt-Injection gestrichen; keine Aussage zur Plugin-Signatur auf der Seite.
- F10 [ADRESSIERT] Reiter, Feature-Grid, „Warum MindGraph Notes“, Modul-Leiste, Cloud-Block gestrichen; Breite nur noch als ein Satz „Außerdem im Arbeitsraum“; Modellmatrix als Link.
- F11 [ADRESSIERT] Telegram, Workflow Canvas, Kognition-Band, Lern-/Integrationskarten von der Startseite entfernt (kognition.html im Footer verlinkt).
- F12 [ADRESSIERT] HBR/McKinsey/Bitkom-Zahlen und „3.000+ Notizen, stabil“ als Beleg entfernt; FAQ nennt nur Einsatz „mit mehreren tausend Notizen“ ohne Garantie.
- F13 [ADRESSIERT] Beta-FAQ ersetzt; Download-Fallbacks auf 1.0.0; Version weiter nur aus JSON-LD.
- F14 [ADRESSIERT] Abschnitt „Für IT und Beschaffung“: Lizenz/AGPL, Konto/Telemetrie, Plattformen + Signierung, Formate, Hardware (27B ≈ 18 GB, Rechner ab 32 GB), Modellmatrix, Offline, Sync selbst betreibbar.
- F15 [ADRESSIERT] Struktur: Hero → Agent → Skills → Nachvollziehbar → Datenschutz → IT-Steckbrief → Praxis → Download (+ FAQ).

Offen/nicht geprüft: `og:image`/`screenshot.png` zeigt weiter das alte Design; Kontakt-Angebot „erproben? Schreiben Sie mir“ ist neu und vom Nutzer noch abzunehmen.

## Status

Runde 1 und 2 adressiert (19.10.2026). Abnahme durch den Nutzer offen.

### Runde 2 (F16–F28)

Alle 13 gegen Code geprüft und getragen; umgesetzt am 19.10.2026 in `docs/index.html`.

- F16 [ADRESSIERT] Lizenz `AGPL-3.0-or-later`; Text: Nutzung frei, wer weitergibt/verändert/als Netzdienst anbietet, hält die Lizenzbedingungen ein.
- F17 [ADRESSIERT] Tabelle um Bilderzeugung (Google, auch bei lokalem Modell), direkten Seitenabruf der Webrecherche und „Analyse mit dem eingestellten Modell“ bei E-Mail ergänzt; Hinweis, dass die App vor jedem Lauf alle Datenwege zeigt.
- F18 [ADRESSIERT] „Im lokalen Standardbetrieb über keinen fremden Server; beim Sync nur verschlüsselte Daten“. Hero-Slogan „der im Haus bleibt“ bleibt — Untertitel sagt „standardmäßig“; Nutzerentscheidung offen.
- F19 [ADRESSIERT] Zwei Zeilen: Kommandozeile (macOS-Sandbox, Schreiben nur im Arbeitsordner) und Programme ansprechen (feste Vorgänge, wirken sofort außerhalb, nichts wird gesendet).
- F20 [ADRESSIERT] „Keine Telemetrie … an den Hersteller gehen keine Nutzungsdaten“; Steckbrief nennt das lokale Tätigkeitsprotokoll.
- F21 [ADRESSIERT] SVG mit einzeiliger `description:`; eigener Skill = Unterordner mit SKILL.md.
- F22 [ADRESSIERT] Arbeitsblatt „Nutzt die Webrecherche“; Gruppenüberschrift nur „Mitgeliefert“.
- F23 [ADRESSIERT] Gemessene ~19 GB des empfohlenen Modells, 32 GB als Richtwert, Bedarf steigt mit Kontext.
- F24 [ADRESSIERT] „soll jeden Satz mit der Stelle versehen“, „nichts gefunden“ als Suchergebnis; Skill „als Arbeitsanleitung“.
- F25 [ADRESSIERT] `id="changelog"` auf der Release-Zeile.
- F26 [ADRESSIERT] Alle Icon-SVGs `aria-hidden`, Schließen als `<button>` mit Label, Modals `role="dialog"` mit Fokusführung und Escape.
- F27 [ADRESSIERT] Tabelle in horizontal scrollbarem Rahmen, unter 720 px Mindestbreite 540 px.
- F28 [ADRESSIERT] Titel und Meta-Description wechseln mit der Sprache; die falschen hreflang-Alternativen (alle gleiche URL) entfernt. OG/Twitter bleiben DE (Crawler führen kein JS aus).

Grenzhinweis Runde 2: `pruefgrenze.sh` meldete eine getrackte Änderung — das war Claudes eigene CLAUDE.md-Anpassung (Release-Schritt 2) nach dem Schnappschuss, nicht der Prüfer.
