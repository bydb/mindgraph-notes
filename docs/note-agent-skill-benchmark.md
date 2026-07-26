# Benchmark: Notiz-Agent mit aktiven Skills

Stand: 26.07.2026

## Ziel

Der bisherige Agent-Benchmark misst vor allem die Zuverlässigkeit einfacher
Tool-Ketten. Für das Produktversprechen reicht das nicht: Der Notiz-Agent muss
auch die im Vault aktivierten Arbeitsanleitungen laden, ihre Regeln auf
Quelldaten anwenden und ein fachlich brauchbares Artefakt erzeugen.

Dieser Benchmark prüft deshalb den vollständigen Skill-Ablauf:

1. passenden Skill aus allen aktiven Skills auswählen,
2. `use_skill` als erstes Werkzeug aufrufen,
3. benötigte Anhänge, Notizen und Skill-Referenzen lesen,
4. genau einen passenden Writer aufrufen,
5. den Skill-Vertrag im erzeugten Artefakt einhalten,
6. den Lauf ohne Fehler oder Wiederholung beenden.

Der Runner bildet auch den Abschlussvertrag des Produkt-Loops nach: Beendet ein
Modell den Lauf vollständig still und ohne Artefakt, wird es einmal ausdrücklich
zum Schreiben angestoßen. Ein zweiter leerer Abschluss gilt als Fehler.

Die Qualitätsprüfung ist deterministisch. Es gibt keinen LLM-as-Judge und damit
keine Cloud-Abhängigkeit in der Bewertung.

## Datenschutzgrenze

Der Runner ist absichtlich **local only**:

- Er akzeptiert nur `localhost`, `127.0.0.1` oder `::1`.
- Unterstützt werden Ollama und LM Studio.
- Er liest aus dem angegebenen Vault ausschließlich aktivierte `SKILL.md`-Dateien
  und deren über `read_skill_file` angeforderte Zusatzdateien.
- Er liest keine echten Notizen oder Anhänge aus dem Vault.
- Sämtliche Falldaten sind synthetisch und im Repository versioniert.
- Writer werden simuliert. Es entstehen keine DOCX-, XLSX-, HTML- oder
  Markdown-Dateien im Vault.
- Ergebnisse enthalten Hashes der verwendeten Skill- und Agent-Dateien. Dadurch
  ist später erkennbar, mit welchem Stand gemessen wurde.

Ein OpenRouter-Lauf kann separat als Qualitätsobergrenze sinnvoll sein, zählt
aber nicht als Nachweis für die lokale Produktqualität und ist in diesem Runner
bewusst nicht implementiert.

## Testkorpus

| Fall | Skill | Erwartetes Ergebnis | Zentrale Prüfungen |
|---|---|---|---|
| `s01_elternbrief` | Elternbrief | DOCX | Sie-Anrede, ausgeschriebene Termine, Kosten, vollständiger Rückmeldeabschnitt |
| `s02_protokoll` | Protokoll | Markdown | TOPs, Diskussion/Beschluss, Aufgaben-Tabelle, offene Angaben |
| `s03_zusammenfassung` | Zusammenfassung | Markdown | exakte Zahlen und Namen, offene Frage, Längengrenze, keine Ergänzungen |
| `s04_literaturnotiz` | Literaturnotiz | Markdown | vollständige Quelle, Pflichtabschnitte, Seiten und exakte Befunde |
| `s05_webseiten_artikel` | Webseiten-Artikel | Markdown | Frontmatter, 300–600 Wörter, Anonymisierung, Transparenz- und Freigabehinweis |
| `s06_wissenschaftliche_webseite` | Wissenschaftliche Webseite | HTML | Body-only, Abstract, Abschnitte, Formel, valides Inline-SVG, Literatur |
| `s07_teilnehmerliste` | Teilnehmerliste | XLSX | Datensparsamkeit, Sortierung, Dubletten, leere Unterschriftenspalte |
| `s08_tabellen_zuordnung` | Tabellen-Zuordnung | XLSX | beide Quellen gelesen, Reihenfolge, normalisierter Join, „nicht gefunden“ |
| `s09_akkreditierung` | Akkreditierung | ausgefüllte DOCX-Vorlage | Referenz gelesen, exakter Vorlagenpfad, korrekte Tabellenzellen, keine erfundenen Personendaten |

## Ausführung

Alle Befehle laufen aus `app/`.

Zuerst Konfiguration und aktive Skills prüfen:

```bash
node scripts/note-agent-skill-benchmark.mjs \
  --skills-vault /Pfad/zum/Vault \
  --dry-run
```

Installierte Modelle anzeigen:

```bash
node scripts/note-agent-skill-benchmark.mjs --backend ollama --list-models
node scripts/note-agent-skill-benchmark.mjs --backend lmstudio --list-models
```

Kurzer Smoke-Test:

```bash
node scripts/note-agent-skill-benchmark.mjs \
  --skills-vault /Pfad/zum/Vault \
  --backend ollama \
  --models qwen3.5:4b \
  --cases s01_elternbrief,s08_tabellen_zuordnung \
  --reps 1 \
  --out benchmarks/note-agent-skills/results/smoke.json
```

Belastbarer Lauf:

```bash
node scripts/note-agent-skill-benchmark.mjs \
  --skills-vault /Pfad/zum/Vault \
  --backend ollama \
  --models qwen3.5:4b,ministral-3:8b,qwen3.6:27b-mlx \
  --reps 3 \
  --out benchmarks/note-agent-skills/results/ollama-skills-2026-07-26.json
```

LM Studio wird mit demselben Korpus separat gemessen:

```bash
node scripts/note-agent-skill-benchmark.mjs \
  --skills-vault /Pfad/zum/Vault \
  --backend lmstudio \
  --models publisher/model-id \
  --reps 3 \
  --out benchmarks/note-agent-skills/results/lmstudio-skills-2026-07-26.json
```

Ein abgebrochener Lauf kann mit demselben Befehl fortgesetzt werden. Bereits
vorhandene Kombinationen aus Modell, Fall und Wiederholung werden übersprungen.
Ändern sich Agent-Code, Testkorpus, Skill-Dateien, Backend oder Kontextgröße,
verweigert der Runner das Vermischen mit der alten Ergebnisdatei.

## Auswertung

Ein Fall besteht nur, wenn alle harten Kriterien erfüllt sind:

- native, syntaktisch gültige Tool-Calls,
- passender Skill zuerst und genau einmal,
- alle erforderlichen Quellen vor dem Writer gelesen,
- genau ein Writer und der für den Skill vorgesehene Dateityp,
- Writer ist das letzte Werkzeug,
- keine Tool-Fehler, kein Timeout, kein Iterationslimit,
- skill-spezifischer Artefaktvertrag vollständig erfüllt,
- abschließende Antwort vorhanden.

Für eine Produktfreigabe sollten pro Modell drei Wiederholungen je Fall laufen.
Ein Modell sollte erst als lokal empfohlen werden, wenn es:

- alle neun Skills mindestens einmal besteht,
- über alle 27 Läufe mindestens 90 Prozent erreicht,
- in keinem datenschutzrelevanten Fall systematisch erfindet oder
  personenbezogene Angaben übernimmt,
- auf der vorgesehenen RAM-Klasse mit realistischem Kontextfenster läuft.

Die drei Modellgrößen im Beispiel dienen unterschiedlichen Fragen:

- kleines Modell: Ist das Produktversprechen auf 8-GB-Geräten realistisch?
- mittleres Modell: Wo liegt der brauchbare lokale Standard?
- großes lokales Modell: Ist der Test grundsätzlich mit lokaler Inferenz lösbar?

Erst danach sollten die Ergebnisse in
`shared/modelCompatibility.ts` und in Empfehlungen des Modell-Pickers übernommen
werden.
