# Benchmark-Plan: Welche Modelle taugen fürs agentische Arbeiten?

Status: **Konzept zum Gegenlesen** (2026-07-26). Noch kein Code.
Zielartefakt: gefüllte Verdict-Matrix für das Modul `note-agent` + eine Empfehlung, die
im Modell-Picker sichtbar wird.

## 1. Warum die vorhandenen Benchmarks die Frage nicht beantworten

Der Harness in `~/dev/brain-model-benchmark/` misst **One-Shot-Qualität**: ein Prompt rein,
eine Antwort raus, Bewertung gegen erwartete Felder (`bench-task-extraction-v2.mjs` und
Geschwister). Das ist die richtige Messung für Mail-Analyse, Brain und Dashboard.

Der Notiz-Agent stellt eine andere Anforderung. Er fährt eine Schleife (`main/noteAgent/loop.ts`,
`MAX_ITERATIONS` 12): Modell wählt ein Tool, bekommt ein Ergebnis zurück, wählt das nächste
Tool, und beendet irgendwann sauber mit einem Artefakt. Ein Modell kann exzellente
Zusammenfassungen schreiben und trotzdem in dieser Schleife nutzlos sein — es ruft das falsche
Tool, erfindet Parameter, ignoriert Tool-Ergebnisse oder hört nie auf. Umgekehrt kann ein
mittelmäßiger Texter ein zuverlässiger Werkzeugbenutzer sein.

Konkret ist `'note-agent': {}` in `shared/modelCompatibility.ts:332` bis heute **leer**.
Für den Nutzer heißt das: jedes Modell zeigt „Nicht getestet", und die einzige harte Aussage
ist die Tool-Capability — also ob es überhaupt funktioniert, nicht ob es etwas taugt.

## 2. Was gemessen werden muss

Sechs Dimensionen, absteigend nach Härte:

1. **Tool-Syntax** — kommen wohlgeformte `tool_calls` zurück, oder schreibt das Modell den
   Aufruf als Fließtext? (Binär. Fällt ein Modell hier durch, ist alles Weitere egal.)
2. **Tool-Auswahl** — wird für „lies die angehängte Notiz" auch `read_note` gewählt und nicht
   `web_search`?
3. **Argument-Treue** — stimmen Dateinamen/Pfade/Suchbegriffe, oder werden sie halluziniert?
   (Der häufigste stille Fehler.)
4. **Ergebnis-Verwertung** — fließt der Inhalt eines Tool-Ergebnisses nachweislich ins
   Artefakt, oder schreibt das Modell aus dem Prompt-Gedächtnis weiter?
5. **Terminierung** — endet der Lauf mit `write_note`/`write_html`, oder läuft er ins
   Iterations-Limit? (Zählt als Fehlschlag, auch wenn ein Artefakt entsteht.)
6. **Kosten** — Iterationen bis fertig, Sekunden gesamt, RAM-Peak.

Bewusst **nicht** gemessen: Textqualität des Artefakts. Die ist Geschmackssache und wird von
den vorhandenen Modul-Benchmarks abgedeckt. Hier geht es um Werkzeuggebrauch.

## 3. Testfälle

Acht Fälle, gestaffelt nach nötiger Schrittzahl. Alle laufen gegen einen **festen Mini-Vault**
im Repo des Harness (nicht gegen den echten Vault — sonst sind die Ergebnisse nicht
reproduzierbar und der Lauf schreibt in echte Notizen).

| ID | Fall | Erwartete Tool-Kette | Prüft vor allem |
|---|---|---|---|
| a01 | „Fasse die offene Notiz als Merkzettel zusammen" | `write_note` | Syntax, Terminierung |
| a02 | „Lies Notiz X und erstelle daraus eine Checkliste" | `read_note` → `write_note` | Argument-Treue |
| a03 | „Suche alles zu Stichwort Y und bündle es" | `search_notes` → `read_note` → `write_note` | Auswahl, Verwertung |
| a04 | „Vergleiche Notiz X und Y in einer Tabelle" | 2× `read_note` → `write_note` | Mehrfach-Aufruf gleiches Tool |
| a05 | Nicht existierende Notiz genannt | `read_note` (Fehler) → Rückfrage/Alternative | Fehlerbehandlung statt Halluzination |
| a06 | „Erstelle eine wissenschaftliche Seite zu Z" | `write_html` | Body-only-Kontrakt, KaTeX |
| a07 | Auftrag mit aktivem Skill im Vault | Skill-Discovery → passende Kette | Skills Stufe 1 |
| a08 | Bewusst unterspezifiziert („mach was Sinnvolles") | beliebig, aber terminierend | Kein Endlos-Loop |

a05 und a08 sind die interessanten: Sie trennen Modelle, die einen Fehler *verarbeiten*, von
solchen, die ihn wegerfinden oder daran hängenbleiben.

**Wiederholungen: 3 pro Modell und Fall.** Aus den bisherigen Läufen wissen wir, dass die
Varianz bei N=4-10 zwischen 10 und 25 Prozentpunkten liegt — bei Tool-Loops erwarte ich eher
mehr, weil sich ein Fehlgriff in Schritt 1 durch die ganze Kette zieht. Einzelläufe wären
wertlos.

## 4. Bewertung

Automatisch auswertbar, ohne LLM-as-Judge (der wäre hier zirkulär):

- Der Harness protokolliert die **echte Tool-Call-Sequenz** — die kann gegen die erwartete
  Kette diffed werden.
- Argument-Treue: geprüfte Pfade/Suchbegriffe müssen im Mini-Vault existieren.
- Ergebnis-Verwertung: ein pro Fall definierter **Canary-String** steht nur im Tool-Ergebnis,
  nie im Prompt. Taucht er im Artefakt auf, wurde das Ergebnis wirklich gelesen.
- Terminierung: `hitMaxIterations` aus dem Loop-Ergebnis.

Verdict-Ableitung für die Matrix:

| Verdict | Kriterium |
|---|---|
| `green` | Tool-Syntax 100 %, Terminierung ≥ 90 %, Argument-Treue ≥ 90 %, Canary ≥ 80 % |
| `yellow` | Tool-Syntax 100 %, aber eine Kennzahl darunter |
| `red` | Tool-Syntax < 100 % oder Terminierung < 50 % |
| `untested` | kein Lauf |

`note-agent` bleibt `damageRelevant: false` — auch ein rotes Modell soll wählbar bleiben, es
warnt nur deutlich. Der Nutzer sieht jedes Artefakt vor der Übernahme als Karte; ein schlechter
Agent verschwendet Zeit, richtet aber keinen Schaden an. (Das ist die bestehende Linie
„Opt-in + Transparenz statt Enforcement".)

## 5. Die eigentliche Empfehlung: drei Filter, nicht einer

Eine Empfehlung „nimm Modell X fürs agentische Arbeiten" ist der Schnitt aus drei unabhängigen
Dingen, die heute alle existieren, aber nirgends zusammenlaufen:

1. **Kann es Tools?** — seit heute autoritativ aus Ollamas `capabilities`
   (`main/ollamaCapabilities.ts`); bei LM Studio antwortet LM Studio selbst.
2. **Passt es in den RAM?** — `checkModelRamFit()`, Schwelle `ram < total - 2`.
3. **Taugt es was?** — genau die Lücke, die dieser Benchmark füllt.

Punkt 2 verdient beim Agenten eine **eigene, strengere Schwelle**. Die 2-GB-Reserve ist für
One-Shot-Chat kalibriert. Im Agent-Loop wächst der Kontext mit jedem Tool-Ergebnis — nach acht
Schritten mit gelesenen Notizen liegt der KV-Cache deutlich über dem eines Einzelprompts. Ich
schlage vor, den RAM-Peak in Fall a04/a07 zu messen und daraus eine Agent-Reserve abzuleiten,
statt sie zu raten.

### Beispiel: 8-GB-MacBook mit M2

Mit der bestehenden Schwelle bleiben dort nur Modelle unter 6 GB übrig. Von deinen aktuell
installierten:

| Modell | RAM | Tools | Agent-tauglich? |
|---|---|---|---|
| `qwen3.5:4b` | ~4 GB | ja | einziger realistischer Kandidat — **ungemessen** |
| `ministral-3:8b` | ~6 GB | ja | fällt knapp durch (6 < 6 ist falsch) |
| `qwen2.5-coder:1.5b` | ~1 GB | ja | vermutlich zu klein für Mehrschritt — **ungemessen** |
| `gemma4:12b-mlx` | ~11 GB | ja | chancenlos auf 8 GB |
| `qwen3.5:0.8b` | ~1 GB | ja | laut Memory generell unbrauchbar |

Das Feld ist also winzig, und über den einzigen ernsthaften Kandidaten wissen wir für den
Agent-Loop **nichts**. Genau deshalb halte ich den Benchmark für nötig, bevor wir 1.0 mit einer
Empfehlung ausliefern: Wenn `qwen3.5:4b` die Mehrschritt-Fälle nicht packt, ist die ehrliche
Aussage für 8-GB-Geräte „Notiz-Agent braucht Cloud oder mehr RAM" — und die sollte im Onboarding
stehen, nicht der Nutzer nach drei Fehlläufen selbst herausfinden.

## 6. LM Studio muss mitlaufen

Der Harness spricht heute nur `localhost:11434`. Da der Agent seit heute auch über LM Studio
läuft, braucht er einen Backend-Schalter (`--backend ollama|lmstudio`), weil sich zwei Dinge
unterscheiden können:

- **Prompt-Template**: dieselben Gewichte können in LM Studio ein anderes Tool-Template haben
  als in Ollama. Gleiches Modell, anderes Verhalten — das ist messbar und sollte gemessen
  werden, bevor wir eine Empfehlung backendübergreifend aussprechen.
- **Fehlerverhalten**: LM Studio hat kein `capabilities`-Feld; ein Modell ohne Tool-Template
  antwortet dort mit einem Fehler (oder ignoriert die Tools still — genau das gehört
  überprüft).

## 7. Was am Ende in die App wandert

1. `MODEL_COMPATIBILITY.modules['note-agent']` gefüllt, `version` hochgezogen.
2. Ein Helfer `recommendedAgentModels(installed, totalRamGb)` in `shared/modelCompatibility.ts`,
   der die drei Filter aus Abschnitt 5 kombiniert.
3. Sichtbar im Modell-Picker der KI-Leiste, wenn der Agent-Modus aktiv ist (Zielordner gesetzt)
   — dort, wo die Entscheidung fällt, nicht nur in den Einstellungen.
4. Analyse-Dokument unter `~/2026/100 - ✅ Projekte/110 - MindGraph-Notes/` wie bei den
   bisherigen Benchmarks.

## 8. Offene Fragen an dich

1. **Mini-Vault**: eigenes Fixture im Harness-Repo, oder eine Kopie des Demo-Vaults? Ich
   tendiere zum Fixture (klein, stabil, keine Überschneidung mit echten Notizen).
2. **Modell-Feld**: nur was du installiert hast, oder gezielt 8-GB-Kandidaten nachziehen
   (`llama3.2:3b`, `granite3.x:2b`)? Für eine belastbare 8-GB-Empfehlung bräuchte es Letzteres.
3. **Cloud mitmessen?** Ein `glm-5`/`kimi-k2.5` als Referenz-Obergrenze wäre nützlich, um zu
   sehen, ob ein Fall grundsätzlich lösbar ist oder der Testfall selbst zu schwer formuliert
   wurde. Kostet Tokens.
4. **Agent-RAM-Reserve**: messen (Vorschlag oben) oder erstmal pauschal auf 3 GB anheben?
