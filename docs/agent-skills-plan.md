# MindGraph Agent-Skills — editierbare Skills, Store und Mitlernen

> Status: Konzept (2026-07-04), noch nicht beschlossen. Baut auf dem Notiz-Agenten auf
> (`docs/note-agent-harness-plan.md`, Phase 1+2 shipped in v0.10.6-beta).

## Kurzidee

Der Notiz-Agent bekommt **Skills als Markdown-Dateien im Vault**: wiederverwendbare
Arbeitsanleitungen („so erstellst du ein Protokoll", „so strukturierst du einen
Elternbrief"), die der Agent bei passenden Aufträgen selbst heranzieht. Nutzer können
Skills in den Einstellungen aktivieren, **direkt als Notiz bearbeiten**, neue anlegen
oder aus einem kuratierten Katalog freischalten. Dazu ein sichtbares, bestätigtes
**Mitlernen**: Erkenntnisse aus Läufen landen als editierbare Gedächtnis-Notiz im Vault
— nie als verstecktes Modell-Verhalten.

Pitch-Satz:

> Skills sind Notizen, die dem Agenten beibringen, wie DU arbeitest — lesbar,
> editierbar, teilbar. Und was der Agent dazulernt, steht als Notiz im Vault.

## Marktlage (Recherche 2026-07-04)

**Es gibt einen offenen Standard, und er hat gewonnen.** Anthropic hat das
Agent-Skills-Format (SKILL.md) im Dezember 2025 als offene Spezifikation
veröffentlicht (agentskills.io); binnen Wochen haben es OpenAI (Codex/ChatGPT),
Microsoft (VS Code/Copilot), Google (Gemini CLI), JetBrains, Cursor, Block Goose,
OpenCode, Mistral Vibe u.v.m. übernommen — Stand März 2026 lesen 30+ Tools dieselben
SKILL.md-Dateien. Auch lokale/modell-agnostische Agenten (Goose, OpenCode, nanobot,
fast-agent) unterstützen es — das Format ist NICHT Claude-gebunden.

**Das Format** (Spezifikation auf agentskills.io):

```
mein-skill/
├── SKILL.md          # Pflicht: YAML-Frontmatter (name, description) + Markdown-Anleitung
├── scripts/          # Optional: ausführbarer Code
├── references/       # Optional: Nachschlagematerial
└── assets/           # Optional: Vorlagen
```

**Progressive Disclosure** — der Kern-Mechanismus, der auch zu kleinen lokalen
Modellen passt: (1) *Discovery*: beim Start werden nur name+description aller Skills
geladen; (2) *Aktivierung*: passt ein Auftrag, holt der Agent die volle SKILL.md in
den Kontext; (3) *Ausführung*: referenzierte Dateien nur bei Bedarf. Viele Skills =
kleiner Kontext-Fußabdruck.

**Verfügbare Sammlungen:**
- `anthropics/skills` (GitHub) — offizielle Beispiele; die meisten Apache 2.0. Die
  vier Document-Skills (docx/xlsx/pdf/pptx) sind nur source-available → als Vorbild
  nutzbar, NICHT bündelbar.
- `VoltAgent/awesome-agent-skills` (1000+, kuratiert), dazu Marktplätze wie
  awesomeskill.ai, skillsmp.com, claudeskills.info, agent-skills.cc (30.000+ Skills)
  und `dukelyuu/skills-marketplace` („npm für Agent-Skills").

**Ehrliche Einordnung fürs Kuratieren:** Der Großteil des Marktangebots sind
ENTWICKLER-Skills (Git-Workflows, Framework-Konventionen) — für MindGraph-Nutzer
irrelevant. Die passende Teilmenge sind Wissens-/Dokument-/Schreib-Skills. Der
größere Wert liegt darin, dass MindGraph-Nutzer (Lehrkräfte, PKM-Anwender) EIGENE
Skills schreiben und teilen — Elternbrief, Protokollformat, Teilnehmerliste,
Bewertungsraster. Das ist eine Community-Chance, kein Katalog-Import-Problem.

## Warum das perfekt zu MindGraph passt

1. **Skills sind Markdown — MindGraph ist eine Markdown-App.** Skills liegen im Vault,
   werden im normalen Editor bearbeitet, laufen durch Auto-Backup und E2E-Sync
   (alle Geräte haben dieselben Skills), sind per Wikilink verknüpfbar.
2. **Standard-kompatibel statt Insellösung**: dieselbe SKILL.md funktioniert in
   Claude Code, Codex, Gemini CLI — wer im integrierten Terminal arbeitet, nutzt
   denselben Skill-Ordner doppelt.
3. **Human-in-the-Loop bleibt Architektur**: Skills sind lesbare Anleitungen, kein
   Code. Mitlernen ist eine sichtbare Notiz, kein verstecktes Fine-Tuning.

## Architektur

### 1. Skills im Vault

- Ort: `<vault>/.mindgraph/skills/<skill-name>/SKILL.md` (Standard-Layout, damit
  Fremd-Tools denselben Ordner lesen können). Alternative sichtbarer Ordner —
  Entscheidung offen (Sync + Editor funktionieren in beiden Fällen; `.mindgraph/`
  hält den FileTree ruhig, ein sichtbarer Ordner ist entdeckbarer).
- Frontmatter: `name`, `description` (Pflicht, Spec-konform); MindGraph-Erweiterung
  `enabled: true|false` ODER Aktivierung separat in `vault-settings.json` (sauberer,
  Datei bleibt 100% Spec-konform) — Empfehlung: vault-settings.
- **`scripts/` wird NICHT ausgeführt.** Der Notiz-Agent hat bewusst keinen
  Code-/Shell-Zugriff; Skills sind reine Anleitungen. Enthält ein importierter Skill
  Scripts, wird das beim Import angezeigt und die Scripts werden ignoriert.
  `references/`-Dateien sind in Stufe 3 über den bestehenden Kontext-Reader lesbar.

### 2. Integration in den Agent-Loop (Progressive Disclosure)

- **Discovery**: Der System-Prompt bekommt einen Block „VERFÜGBARE SKILLS" mit
  name+description aller aktivierten Skills (nur Metadaten — skaliert).
- **Aktivierung**: neuer Read-Skill **`use_skill(name)`** liefert den SKILL.md-Body
  (Budget wie Anhänge, Hygiene, kein Delimiter-Zwang — Skills sind vom Nutzer
  installierte Anleitungen, KEINE untrusted Daten wie Anhänge; genau das ist der
  Unterschied zur Kontext-Datei).
- Prompt-Regel analog Vault-Suche: „Passt ein Skill zur Aufgabe, lies ihn ZUERST
  mit use_skill und folge seiner Anleitung."
- Perspektive: dieselbe Discovery-Liste kann später Notes-Chat und Workflow-Canvas
  bedienen (geteilte Executor-Schicht, Phase 3 des Agent-Plans).

### 3. Einstellungen → Skills

- Liste aller Skills (Name, Beschreibung, Quelle: gebündelt/eigen/importiert),
  Toggle pro Skill.
- **„Bearbeiten" öffnet die SKILL.md als ganz normale Notiz im Editor** — kein
  eigener Skill-Editor nötig, MindGraph IST der Editor.
- „Neuer Skill" legt aus Template an (Frontmatter + Gliederung: Wann anwenden /
  Schritte / Beispiele-Platzhalter — ohne konkrete Beispielwerte, Leipzig-Regel).
- Import: SKILL.md-Datei/Ordner vom Rechner ODER aus dem Katalog (Stufe 2).

### 4. Skill-Katalog („Store")

- **Stufe A — gebündelte Starter-Skills** (wie Starter-Vaults, `resources/`):
  5–10 selbst geschriebene, deutsche, geprüfte Skills für die Zielgruppe, z.B.
  Protokoll-Format, Teilnehmerliste-Konventionen, Elternbrief-Ton, Tabellen-Zuordnung,
  Zusammenfassung-für-Kollegium. Kein Netzwerk, kein Risiko, sofortiger Wert.
- **Stufe B — kuratierter Katalog**: JSON-Index (gehostet auf mindgraph-notes.de
  oder GitHub-Repo `mindgraph-skills`), Browser-UI in den Einstellungen:
  Beschreibung + **kompletter SKILL.md-Inhalt als Vorschau VOR der Installation**
  (Transparenz-Prinzip wie beim Cloud-Hinweis), Lizenzanzeige, Ein-Klick-Install in
  den Vault. Kuratiert = von uns geprüft; kein offener Marktplatz mit 30.000
  ungeprüften Einträgen. Apache-2.0-Skills aus `anthropics/skills` und
  awesome-Listen dürfen (mit Attribution) aufgenommen werden; die
  source-available Document-Skills von Anthropic nicht.
- **Community-Perspektive**: Nutzer-Skills teilbar als simple Ordner (Export =
  Ordner kopieren; die Datei IST das Format). Später PR-Workflow ins Katalog-Repo.
- Sicherheitsmodell: Skills sind Instruktionen, kein Code — die strukturellen
  Grenzen des Agenten (Staging, Ergebnis-Karten, kein Vault-Direktschreiben,
  Pfadschutz) gelten unverändert. Ein bösartiger Skill kann den Agenten maximal
  schlecht anleiten — das Ergebnis geht trotzdem durch die menschliche Abnahme.
  Trotzdem: Vorschau vor Aktivierung ist Pflicht-UX.

### 5. Mitlernen (sichtbar, bestätigt — kein verstecktes Lernen)

Vorbild ist das bewährte `Email-Instruktionen.md`-Muster (Vault-Notiz fließt in den
Prompt):

- **`Agent-Gedächtnis.md`** im Vault (bzw. `.mindgraph/skills/_gedaechtnis/SKILL.md`):
  wird bei jedem Lauf in den System-Prompt geladen. Der Nutzer kann dort jederzeit
  selbst Regeln eintragen („Schulnummern sind 4-stellig", „Tabellen immer mit
  Kopfzeile").
- **Bestätigtes Lernen nach dem Lauf**: Nach Übernehmen/Verwerfen einer
  Ergebnis-Karte bietet die UI „Fürs nächste Mal merken…" an — Freitextfeld,
  optional ein LLM-Vorschlag aus dem Lauf-Verlauf („Soll ich mir merken: …?").
  Bestätigt → als Bullet mit Datum in die Gedächtnis-Notiz. Nichts wird ohne Klick
  gespeichert.
- **Pro-Skill-Lernen** (später): eigene „## Gelerntes"-Sektion in der jeweiligen
  SKILL.md, gleiche Bestätigungs-Mechanik.
- Bewusst NICHT: automatisches, unbestätigtes Selbst-Editieren von Skills durch den
  Agenten. Das wäre verstecktes Verhalten und öffnet Feedback-Schleifen
  (Halluzination schreibt sich fest). Human-in-the-Loop ist Architektur.

## Stufenplan

1. **Stufe 1 — Skills-Grundgerüst**: Vault-Skill-Ordner + Loader (Discovery in den
   System-Prompt), `use_skill`-Tool, Settings-Seite (Liste, Toggle, Bearbeiten =
   Notiz öffnen, Neu aus Template), 5 gebündelte deutsche Starter-Skills.
2. **Stufe 2 — Katalog**: kuratierter Index + Vorschau-vor-Install + Import vom
   Rechner; Lizenz-/Quellen-Anzeige.
3. **Stufe 3 — Mitlernen + references/**: Agent-Gedächtnis-Notiz im Prompt,
   „Fürs nächste Mal merken…" nach Läufen, references/-Dateien über den
   Kontext-Reader.

## Implementierungsstand

**Stufe 1 umgesetzt (2026-07-04).** `npm run typecheck`, `npm run test` (639) und `npm run build` grün; Loader per temporärem vitest-Harness verifiziert (Frontmatter-Parse + Ordnernamen-Fallback, Body ohne Frontmatter, Aktivierung in vault-settings.json ohne Feld-Zerstörung, Slug+Template-Anlage mit Duplikat-Schutz, fail-closed bei leerem Body). **GUI-Test offen.**

Entschiedene offene Fragen: sichtbarer Ordner `Skills/` (Skills sind normale Notizen — Editor, Sync, Backup inklusive); Aktivierung in `vault-settings.json` (`skillsDisabled`, SKILL.md bleibt spec-rein); Discovery vorerst nur im Agent-Loop.

Dateien: `main/noteAgent/skillsLoader.ts` (Scan `Skills/*/SKILL.md`, Mini-Frontmatter-Parser ohne YAML-Dependency, Budgets, setSkillEnabled merge-sicher, createSkill mit Umlaut-Slug), `use_skill`-Tool in `skills.ts` (Quelle „Skill: <name>" auf Ergebnis-Karten), Discovery-Block + Vorrang-Regel im System-Prompt (`loop.ts`), IPC `note-skills-list/set-enabled/create/install-starter` (isTrustedSender), Settings-Tab „Skills" (`SkillsSection.tsx`: Liste/Toggle/Bearbeiten-öffnet-Notiz/Neu/Starter-Install), 5 Starter-Skills in `resources/starter-skills/` (Protokoll, Elternbrief, Tabellen-Zuordnung, Teilnehmerliste, Zusammenfassung — via electron-builder `extraResources` gebündelt).

**Stufe 2+3 umgesetzt (2026-07-04).** typecheck/test(639)/build grün; Harness verifiziert (Gedächtnis-Anlage/Append/Kürzung, references-Listing ohne scripts/, Traversal-Schutz, Datei-/Ordner-Import mit scripts-Skip und Duplikat-Schutz). **GUI-Test offen.**

- **Stufe 2 (Katalog + Import):** kuratierter Katalog als statisches JSON auf der Website (`docs/skills/index.json`, generiert aus `docs/skills/src/*.md` — JSON statt Roh-Markdown wegen Jekyll). 6 Skills (CC0-1.0): Selbsttest, Literaturnotiz, Wochenrückblick, Unterrichtsentwurf, Veranstaltungs-Checkliste, Pressemitteilung. Main-seitig `skillsCatalog.ts` (fetch mit Validierung + Cache, Install nur aus dem Main-Cache, strikte id-Prüfung); UI mit **Vorschau-vor-Install** (Install-Button nur in der geöffneten Vorschau) + Lizenz/Quelle-Anzeige; Import vom Rechner (SKILL.md-Datei mit Umlaut-Slug oder Skill-Ordner, scripts/ wird nie mitkopiert und der Skip angezeigt). Achtung: Katalog ist erst nach Push (Pages-Deploy) online abrufbar.
- **Stufe 3 (Mitlernen + references/):** `Skills/Agent-Gedächtnis.md` fließt in jeden Lauf-Prompt („GEDÄCHTNIS DES NUTZERS"); Review-UI „Fürs nächste Mal merken…" hängt bestätigte Merksätze als datierte Bullets an (IPC `note-agent-remember`); `use_skill` listet Zusatzdateien, neues Tool `read_skill_file` liest references/assets mit Containment-Check (scripts/ ausgenommen). LLM-Vorschlag für Merksätze bewusst zurückgestellt.

## Offene Fragen

1. Versteckter (`.mindgraph/skills/`) vs. sichtbarer Skill-Ordner im Vault?
2. Aktivierung im Frontmatter (Datei-portabel) vs. `vault-settings.json` (Spec-rein)?
3. Skill-Discovery auch im Notes-Chat (Fragen-Modus) oder nur im Agent-Loop?
4. Wie viele Discovery-Einträge verträgt ein kleines lokales Modell, bevor die
   Skill-Auswahl kippt? (→ Benchmark-Fall, „erst messen")
5. Katalog-Hosting: eigenes GitHub-Repo mit PR-Kuration vs. statisches JSON auf
   mindgraph-notes.de?
