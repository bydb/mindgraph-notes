// Modell-Kompatibilitäts-Matrix für lokale Ollama-Modelle in MindGraph Notes.
// Quelle der Wahrheit für die Settings-UI ("Beipackzettel" pro Modul).
//
// Datenstand: 2026-06-02 — basierend auf Benchmarks in
// /Users/jochenleeder/dev/brain-model-benchmark/ und
// "Modell-Kompatibilitaets-Analyse.md".
// 2026-05-28: qwen3.6:27b-mlx ergänzt (MLX-quantisiertes 27B, ~19 GB).
// 2026-06-02: Produkt-Entscheidung — gemma4 und ministral (inkl. Cloud-Variante)
//   aus Matrix, Defaults und Pull-Liste entfernt. Das Mail-Modul läuft erst ab
//   qwen verlässlich. Klare Empfehlung: qwen3.5:4b (8-GB-tauglich, ~3,4 GB) und
//   qwen3.6. qwen3.5:4b ergänzt — einziges getestetes qwen, das auf 8-GB-Macs
//   vollständig in den RAM passt (Live-Test E-Mail: JSON ok, Badges, injektionsfest).
//   llama3.1 bleibt (andere Familie; sein red-Verdict im Dashboard ist eine Warnung).
//   Das Cloud-Test-Szenario (Kunden ohne lokal taugliche Hardware) bleibt erhalten —
//   Cloud-Modell jetzt qwen3.5:cloud statt ministral-3:14b-cloud.
// 2026-06-03: ministral-3:8b UND gemma4:latest wieder aufgenommen. Grund: (1) der
//   Rauswurf-Grund war das E-Mail-Few-Shot-Abschreiben — seit 2026-06-02 an der Prompt-
//   Quelle gefixt (Platzhalter-Schema); (2) ministral war im Bench der Brain-Champion
//   (Rule-5 100 %, 0 Halluzinationen) und ✅ für mail-summary/dashboard, bei ~6 GB statt
//   22 GB. Die 22-GB-Defaults (qwen3.6:27b-mlx) für brain/dashboard/project-status waren
//   auf ≤32-GB-Hardware ein RAM-Killer; Defaults daher auf ministral-3:8b gesenkt.
//   gemma4 war der Few-Shot-Hauptabschreiber (Leipzig) — als Option ok, aber seine Prompts
//   MÜSSEN Platzhalter statt konkrete Beispielwerte nutzen. Defaults bleiben ministral/qwen.
// 2026-06-03 (2): project-status eigenständig gebenchmarkt (bench-project-status.mjs,
//   7 Modelle, 2 Cases × 5 Reps). Strikt-Scorer (Exakt-String-Match) deckelte alle
//   lokalen Modelle künstlich bei 5/10 → als Benchmark-Artefakt erkannt, Scorer auf
//   Ehrlichkeits-Kriterium umgestellt. Fair: qwen3.5:4b 9/10, ministral 10/10, gemma4 9/10
//   (gleichauf). DEFAULT project-status ministral-3:8b → qwen3.5:4b (3,4 GB statt 6 GB,
//   = Mail-Modell). qwen3.5:4b + ministral-3:8b als yellow-Einträge → schließt den
//   "Empfohlen aber ❔ untested"-Widerspruch im Projekt-Status-Panel.
// 2026-06-07: gemma4:12b-mlx (13B, nvfp4, ~10 GB, Apple-Silicon/MLX) komplett gebenchmarkt
//   (alle 5 Chat-Module, je 3 Reps + gemma4:latest als Kalibrierungs-Anker). Ergebnis:
//   task-extraction/mail-summary/dashboard-snapshot/project-status green, brain yellow.
//   Stärker als das GGUF-Schwester gemma4:latest bei task-extraction (Recall + for_whom
//   je 100 % statt 75 %/83 %) und mit niedrigerer Mail-Halluzination (24 % vs 38 %);
//   Dashboard-Injection in allen 3 Reps sauber abgewehrt (Score 0). brain nur yellow,
//   weil es bei stillem Tag in 2/3 Reps eine Platzhalter-„Offene Fäden"-Sektion schreibt
//   (Regel 5) — sonst sauber, qualitativ auf Augenhöhe mit gemma4:latest. Tempo ~2–3×
//   langsamer als latest (~3–15 s/Modul) + vereinzelte nvfp4/MLX-Latenz-Spitzen (50–77 s).
//   Defaults UNVERÄNDERT (gemma4:12b-mlx ist ~10 GB, nicht 8-GB-tauglich), aber in die
//   Pull-Liste aufgenommen (Apple-Silicon/MLX-Option). smart-connections nicht anwendbar
//   (Chat-Modell, kein Embedding).
//
// "verdict":
//   - "green":     Für dieses Modul produktiv geeignet.
//   - "yellow":    Funktioniert mit Einschränkungen — nicht für schadensrelevante Pfade.
//   - "red":       Hard-Lock: Modul muss im Code deaktiviert werden.
//   - "untested":  Noch nicht benchmarkt. UI darf Hinweis anzeigen, aber nichts blocken.

export type Verdict = 'green' | 'yellow' | 'red' | 'untested'

export type ModuleId =
  | 'brain'
  | 'task-extraction'
  | 'mail-summary'
  | 'dashboard-snapshot'
  | 'smart-connections'
  | 'project-status'

export interface ModelMetrics {
  formatCompliancePct?: number
  wikilinkHallucinations?: 'none' | 'rare' | 'frequent'
  criticalTitlesLinkedPct?: number
  rule5CompliancePct?: number
  latencySecondsPerRun?: number
  ramGigabytes?: number
  recallPct?: number
  directionAccuracyPct?: number
}

export interface ModelVerdict {
  verdict: Verdict
  reasons: string[]
  metrics?: ModelMetrics
  notes?: string
}

export interface ModuleDescriptor {
  id: ModuleId
  // damageRelevant: bei "red" wird das Modul gesperrt (Hard-Lock).
  damageRelevant: boolean
}

export const MODULES: ModuleDescriptor[] = [
  { id: 'brain',              damageRelevant: false },
  { id: 'task-extraction',    damageRelevant: true  },
  { id: 'mail-summary',       damageRelevant: false },
  // Dashboard-Snapshot ist damageRelevant, weil Prompt-Injection-Anfälligkeit
  // (siehe llama3.1 im Bench vom 2026-05-14) den Modell-Output direkt in die
  // sichtbare Radar-Anzeige bringt — bei UNTRUSTED Notiz-Inhalt ein Sicherheitsrisiko.
  { id: 'dashboard-snapshot', damageRelevant: true  },
  { id: 'smart-connections',  damageRelevant: false },
  // Project-Status nicht damageRelevant: Output landet in einem klar
  // markierten Draft (`_STATUS-WW.md`), nie in der kanonischen Statusseite.
  // Nutzer reviewt vor dem Übernehmen — Halluzinationen sind Cosmetic, kein Sicherheitsrisiko.
  { id: 'project-status',     damageRelevant: false }
]

export interface ModelCompatibilityData {
  version: string
  modules: Record<ModuleId, Record<string, ModelVerdict>>
}

export const MODEL_COMPATIBILITY: ModelCompatibilityData = {
  version: '2026-06-07',
  modules: {
    brain: {
      'ministral-3:8b': {
        verdict: 'green',
        reasons: [],
        notes: 'Brain-Champion im Bench 14.05.: einziges Modell, das leere Sektionen weglässt (Rule-5 100 %), 0 Halluzinationen, 80 % kritische Titel verlinkt. Nur ~6 GB RAM. Wieder aufgenommen 2026-06-03 (Rauswurf-Grund war E-Mail-Few-Shot, an der Prompt-Quelle gefixt).',
        metrics: { criticalTitlesLinkedPct: 80, rule5CompliancePct: 100, wikilinkHallucinations: 'none', latencySecondsPerRun: 11, ramGigabytes: 6 }
      },
      'gemma4:latest': {
        verdict: 'green',
        reasons: ['Erfindet bei stillem Tag Inhalt für die leere „Offene Fäden"-Sektion (s4)'],
        notes: 'Schnellstes Brain-Modell (~7 s), 0 Halluzinationen im Aggregat, 70 % kritische Titel. ~10 GB RAM. Wieder aufgenommen 2026-06-03.',
        metrics: { criticalTitlesLinkedPct: 70, rule5CompliancePct: 0, wikilinkHallucinations: 'none', latencySecondsPerRun: 7, ramGigabytes: 10 }
      },
      'gemma4:12b-mlx': {
        verdict: 'yellow',
        reasons: ['Regel 5 in 2/3 Läufen verletzt: schreibt bei stillem Tag eine Platzhalter-Sektion „Offene Fäden" („keine offenen Fäden …") statt sie wegzulassen'],
        notes: 'Bench 2026-06-07 (3 Reps): Format ✓, Reihenfolge 100 %, 0 Halluzinationen, 0 unangebrachte Bewertungen, kritische Titel ~73–80 % verlinkt. ~8 s/Lauf, ~11 GB RAM (13B, nvfp4). Qualitativ auf Augenhöhe mit gemma4:latest (green) — Unterschied nur die Platzhalter-Sektion auf stillen Tagen. Brain ist nicht schadensrelevant.',
        metrics: { criticalTitlesLinkedPct: 73, rule5CompliancePct: 33, wikilinkHallucinations: 'none', latencySecondsPerRun: 8, ramGigabytes: 11 }
      },
      'qwen3.5:9b-mlx-bf16': {
        verdict: 'red',
        reasons: ['Nur 50 % kritische Titel verlinkt', 'Erfindet Inhalte für leere Sektionen'],
        metrics: { criticalTitlesLinkedPct: 50, rule5CompliancePct: 0, latencySecondsPerRun: 9, ramGigabytes: 8 }
      },
      'qwen3.6:latest': {
        verdict: 'green',
        reasons: [],
        notes: '36B-Modell — überall stark, aber langsam (~25 s/Lauf) und ≥48 GB RAM.',
        metrics: { criticalTitlesLinkedPct: 90, rule5CompliancePct: 0, latencySecondsPerRun: 25, ramGigabytes: 48 }
      },
      'llama3.1:8b': {
        verdict: 'red',
        reasons: ['In Szenario s3 wurden 0 Wikilinks produziert', 'Subtile Bewertungs-Drift in Reflexion'],
        metrics: { criticalTitlesLinkedPct: 50, rule5CompliancePct: 0, latencySecondsPerRun: 8, ramGigabytes: 8 }
      },
      'qwen3.6:27b-mlx': {
        verdict: 'green',
        reasons: ['Regel 5 in 1/4 Fällen verletzt (leere "Offene Fäden"-Sektion bei stillem Tag)'],
        notes: '0 Halluzinationen, 0 unangebrachte Bewertungen — sehr sauber. Aber ~47 s/Lauf (langsamstes Brain-Modell der Matrix).',
        metrics: { wikilinkHallucinations: 'none', criticalTitlesLinkedPct: 70, rule5CompliancePct: 25, latencySecondsPerRun: 47, ramGigabytes: 22 }
      },
      'qwen3.5:cloud': {
        verdict: 'yellow',
        reasons: ['Cloud: Inhalte werden zur Ollama-Cloud übertragen — Privacy-Promise „verlässt nie deinen Rechner" greift hier nicht', 'Nicht eigenständig benchmarkt — abgeleitet von der lokal getesteten qwen3.5-Familie'],
        notes: 'Cloud-Test-Modell (Ollama-Cloud, `ollama signin`) — kein Download, keine lokale GPU/RAM. Null-Reibungs-Einstieg für Kunden ohne lokal taugliche Hardware. Nur Test/Demo; im Alltag ein lokales qwen.'
      }
    },
    'task-extraction': {
      'ministral-3:8b': {
        verdict: 'yellow',
        reasons: ['Recall 88 % — vergisst in Mehrfach-Task-Mails gelegentlich eine Aufgabe'],
        notes: 'JSON 100 %, Deadlines 100 % (Two-Pass). ~6 GB RAM. Für die schadensrelevante Extraktion qwen bevorzugen; läuft als Brain/Dashboard-Modell aber ohnehin schon im RAM.',
        metrics: { recallPct: 88, latencySecondsPerRun: 3, ramGigabytes: 6 }
      },
      'gemma4:latest': {
        verdict: 'yellow',
        reasons: ['T-Recall 75 % (niedrigste der getesteten 8B)', 'Richtung „wer macht was" (c08) verfehlt — legte die Aufgabe des Absenders auf den User-Stack'],
        notes: 'JSON 100 %, Deadlines 67 %→100 % (größter Two-Pass-Sprung), ~2,5 s, ~10 GB. Damage-relevant: bei Mehrfach-Mails for_whom prüfen. Few-Shot-sensibel — Prompts brauchen Platzhalter statt Beispielwerte.',
        metrics: { directionAccuracyPct: 83, recallPct: 75, latencySecondsPerRun: 3, ramGigabytes: 10 }
      },
      'gemma4:12b-mlx': {
        verdict: 'green',
        reasons: ['needsReply-Erkennung nur 70 % (3/10 Mails falsch — an der Schwelle)', 'Task-Precision 80 % — extrahiert gelegentlich eine Aufgabe zu viel (2 Über-Extraktionen über 30 Fall-Läufe)'],
        notes: 'Bench 2026-06-07 (3 Reps, 10 Fälle): JSON 100 %, Task-Recall 100 %, Deadlines 100 %, Termin-Recall/-Datum 100 % und for_whom 100 % — inkl. der Richtungsfalle c08 („wer macht was") in allen 3 Reps korrekt. Klar stärker als gemma4:latest (Recall 75 %, for_whom 83 %, yellow). ~6 s/Mail, ~11 GB. Few-Shot-sensibel wie die ganze gemma-Familie — Prompts brauchen Platzhalter statt Beispielwerte.',
        metrics: { directionAccuracyPct: 100, recallPct: 100, latencySecondsPerRun: 6, ramGigabytes: 11 }
      },
      'qwen3.5:4b': {
        verdict: 'green',
        reasons: ['Termin-Aktionen oft nur generisch ("Termin" + korrektes Datum) — verliert das „mit wem/Thema". Feld 2026-06-03: Besuchsanfrage → nur "Termin", das große qwen zog die Person heraus. Prompt-Schärfung (Person muss in die Aktion) seit 2026-06-03 mildert das, schließt die Lücke aber nicht ganz.'],
        notes: '8-GB-tauglich (~3,4 GB) — einziges getestetes qwen, das auf 8-GB-Macs vollständig in den RAM passt. Live-Test 2026-06-02 (echte App-Analyse-Logik): valides JSON 3/3, Badges/matchedCriteria, Prompt-Injection 3/3 abgewehrt, Spam korrekt als irrelevant erkannt. Erkannte 3/4 weiche Kriterien (Hybrid-Scorer floort Relevanz über harte Signale). Begrenzte Stichprobe.',
        metrics: { latencySecondsPerRun: 12, ramGigabytes: 4 }
      },
      'qwen3.5:9b-mlx-bf16': {
        verdict: 'yellow',
        reasons: ['Richtungs-Erkennung (for_whom) nur 63 %'],
        metrics: { directionAccuracyPct: 63, recallPct: 88 }
      },
      'qwen3.6:latest': {
        verdict: 'green',
        reasons: [],
        metrics: { directionAccuracyPct: 100, recallPct: 100, latencySecondsPerRun: 7 }
      },
      'llama3.1:8b': {
        verdict: 'yellow',
        reasons: ['Richtungs-Erkennung 63 %', 'Bei seltenen Mustern Recall-Einbruch'],
        metrics: { directionAccuracyPct: 63, recallPct: 80 }
      },
      'qwen3.6:27b-mlx': {
        verdict: 'green',
        reasons: [],
        notes: 'Beste for_whom-Genauigkeit der Matrix (100 %, 10/10). 9/10 Reply-Erkennung. ~9 s/Mail, ~22 GB RAM — präzise, aber nicht 8-GB-tauglich.',
        metrics: { directionAccuracyPct: 100, recallPct: 100, latencySecondsPerRun: 9, ramGigabytes: 22 }
      },
      'qwen3.5:cloud': {
        verdict: 'yellow',
        reasons: ['Cloud: Mail-Inhalte werden zur Ollama-Cloud übertragen', 'Nicht eigenständig benchmarkt — abgeleitet von der lokal getesteten qwen3.5-Familie'],
        notes: 'Cloud-Test-Modell (Ollama-Cloud, `ollama signin`) — kein Download, keine lokale GPU/RAM. Null-Reibungs-Einstieg für Kunden ohne lokal taugliche Hardware. Nur Test/Demo; im Alltag ein lokales qwen.'
      }
    },
    'mail-summary': {
      'ministral-3:8b': {
        verdict: 'green',
        reasons: [],
        notes: 'Beste Relevance-Kalibrierung der Matrix (7/8 in Range), 96 % Avg-Score, ~5,5 s/Mail, ~6 GB RAM.',
        metrics: { recallPct: 96, latencySecondsPerRun: 6, ramGigabytes: 6 }
      },
      'gemma4:latest': {
        verdict: 'green',
        reasons: ['Höchste Halluzinations-Token-Ratio der Matrix (39 %)'],
        notes: '93 % Avg-Score, Sentiment + needsReply 8/8, schnell (~5 s), ~10 GB. Relevance-Range 5/8 (mittel). Wenn die Zusammenfassung als Notiz-Inhalt landet, Halluz.-Ratio bedenken.',
        metrics: { recallPct: 93, latencySecondsPerRun: 5, ramGigabytes: 10 }
      },
      'gemma4:12b-mlx': {
        verdict: 'green',
        reasons: ['Relevance-Score nur ~5/8 in Range — Kalibrierung auf ~3 Mails daneben (wie gemma4:latest)'],
        notes: 'Bench 2026-06-07 (3 Reps): Avg ~95 %, Sentiment 8/8, needsReply 8/8. Halluzinations-Token-Ratio ~24 % — deutlich niedriger als gemma4:latest (38 %). ~6,7 s/Mail (gemma4:latest ~3,7 s — die MLX-Variante ist hier langsamer). ~11 GB. Vereinzelte Latenz-Spitzen (50–73 s, nvfp4/MLX-Stalls).',
        metrics: { recallPct: 95, latencySecondsPerRun: 7, ramGigabytes: 11 }
      },
      'qwen3.5:4b': {
        verdict: 'green',
        reasons: [],
        notes: '8-GB-tauglich (~3,4 GB). Live-Test 2026-06-02: korrekte, knappe Zusammenfassungen ohne Halluzination; Spam zuverlässig als irrelevant (Score 0). Empfehlung für 8-GB-Geräte. Begrenzte Stichprobe.',
        metrics: { latencySecondsPerRun: 6, ramGigabytes: 4 }
      },
      'qwen3.5:9b-mlx-bf16': {
        verdict: 'yellow',
        reasons: ['Relevance-Skala wird oft überschätzt (5/8 Fällen in Range)'],
        metrics: { recallPct: 95, latencySecondsPerRun: 9 }
      },
      'qwen3.6:latest': {
        verdict: 'green',
        reasons: [],
        notes: 'Beste Gesamtgenauigkeit (97 %), aber 12 s/Mail.',
        metrics: { recallPct: 97, latencySecondsPerRun: 12, ramGigabytes: 48 }
      },
      'llama3.1:8b': {
        verdict: 'green',
        reasons: [],
        notes: 'Niedrigste Halluzinations-Ratio (13 %).',
        metrics: { recallPct: 95, latencySecondsPerRun: 6, ramGigabytes: 8 }
      },
      'qwen3.6:27b-mlx': {
        verdict: 'yellow',
        reasons: ['Relevance-Range nur 6/8 (überschätzt klare Anfragen, unterschätzt Reservierungs-Bestätigungen)', 'Halluzinations-Token-Ratio 31.8 % — höchste der getesteten Modelle', '~14 s/Mail (langsamstes Modell der Matrix für mail-summary)'],
        notes: 'Sentiment + needsReply perfekt (8/8). Für Sicherheit relevant, aber zu langsam und zu kreativ für Produktiv-Einsatz.',
        metrics: { recallPct: 97, latencySecondsPerRun: 14, ramGigabytes: 22 }
      },
      'qwen3.5:cloud': {
        verdict: 'yellow',
        reasons: ['Cloud: Mail-Inhalte werden zur Ollama-Cloud übertragen', 'Nicht eigenständig benchmarkt — abgeleitet von der lokal getesteten qwen3.5-Familie'],
        notes: 'Cloud-Test-Modell (Ollama-Cloud, `ollama signin`) — kein Download, keine lokale GPU/RAM. Null-Reibungs-Einstieg für Kunden ohne lokal taugliche Hardware. Nur Test/Demo; im Alltag ein lokales qwen.'
      }
    },
    'dashboard-snapshot': {
      'ministral-3:8b': {
        verdict: 'green',
        reasons: [],
        notes: 'Perfekter Lauf (8/8 Score in Range), Prompt-Injection sauber abgewehrt, schnellstes brauchbares Modell (~1,4 s/Notiz), ~6 GB RAM.',
        metrics: { recallPct: 100, latencySecondsPerRun: 1, ramGigabytes: 6 }
      },
      'gemma4:latest': {
        verdict: 'green',
        reasons: [],
        notes: 'Schnellstes Modell (~1,1 s/Notiz), 98 % Avg, Prompt-Injection sauber ignoriert (Score 10 statt Übernahme). ~10 GB RAM.',
        metrics: { recallPct: 98, latencySecondsPerRun: 1, ramGigabytes: 10 }
      },
      'gemma4:12b-mlx': {
        verdict: 'green',
        reasons: [],
        notes: 'Bench 2026-06-07 (3 Reps): perfekt — 100 % Avg, 8/8 Score in Range, 8/8 Reason-Match in allen 3 Reps. Prompt-Injection in allen 3 Reps sauber abgewehrt (manipulierte Notiz → Score 0 statt Übernahme); damageRelevant-Modul, daher zentral. ~3 s/Notiz (sporadische Stalls bis ~77 s, nvfp4/MLX). ~11 GB RAM.',
        metrics: { recallPct: 100, latencySecondsPerRun: 3, ramGigabytes: 11 }
      },
      'qwen3.5:9b-mlx-bf16': {
        verdict: 'green',
        reasons: ['Leichte Score-Range-Drift in zwei von acht Fällen'],
        metrics: { recallPct: 95, latencySecondsPerRun: 2 }
      },
      'qwen3.6:latest': {
        verdict: 'green',
        reasons: [],
        notes: 'Perfekter Lauf (8/8), erkennt Prompt-Injection sauber.',
        metrics: { recallPct: 100, latencySecondsPerRun: 5, ramGigabytes: 48 }
      },
      'llama3.1:8b': {
        verdict: 'red',
        reasons: ['Fällt auf Prompt-Injection rein (Score=100 und "Yarr!"-Output bei manipulierter Notiz)', 'Sehr enge Score-Bandbreite (oft 81), schlechte Skala-Auflösung'],
        notes: 'Sicherheitsrelevant: Notiz-Inhalt ist UNTRUSTED Input. Hard-Lock empfohlen.'
      },
      'qwen3.6:27b-mlx': {
        verdict: 'green',
        reasons: ['1/8 Range-Drift: überfällige Deadline (d02) als "nicht mehr akut" gewertet, Score 0 statt 81–100 — Interpretations-Sache, kein Bug'],
        notes: 'Prompt-Injection sauber erkannt (8/8). 7/8 Score in Range, 7/8 Reason-Match. ~5 s/Notiz, ~22 GB RAM.',
        metrics: { recallPct: 95, latencySecondsPerRun: 5, ramGigabytes: 22 }
      },
      'qwen3.5:cloud': {
        verdict: 'yellow',
        reasons: ['Cloud: Notiz-Inhalte (UNTRUSTED) werden zur Ollama-Cloud übertragen', 'Prompt-Injection-Resistenz im Cloud-Betrieb nicht eigenständig benchmarkt'],
        notes: 'damageRelevant-Modul: Notiz-Inhalt ist UNTRUSTED Input. Cloud-Test-Modell (`ollama signin`) — kein Download/GPU. Für Kunden ohne lokal taugliche Hardware; Live-Output kontrollieren. Nur Test/Demo.'
      }
    },
    'smart-connections':   {},
    // Project-Status — Empirie aus dem Crystallizer-Bash-Prototyp (Mai 2026) +
    // `bench-project-status.mjs`. 2026-05-28: qwen3.6:27b-mlx — saubere Struktur,
    // korrekte Wikilink-Form ([[YYYY-MM-DD]]), keine Halluzinationen, ~32 s/Projekt.
    // 2026-06-03: 7 kleine/mittlere Modelle gebenchmarkt (2 Cases × 5 Reps). Der erste
    // Scorer prüfte Exakt-String-Match des "keine konkrete Bewegung"-Satzes → deckelte
    // ALLE lokalen Modelle künstlich bei 5/10 (Benchmark-Artefakt: dünne-Woche-Case hat
    // Trivial-Aktivität, Modelle bullet-en sie ehrlich statt den starren Satz). Scorer
    // auf Ehrlichkeits-Kriterium umgestellt (keine Erfindung + ehrliches "kein
    // Fortschritt"-Signal). Fair gemessen: qwen3.5:4b 9/10, ministral-3:8b 10/10,
    // gemma4:latest 9/10 — qualitativ gleichauf (je ~1/15 thin-week-Fabrikation
    // "Theme ausgewählt"). olmo-3:7b-think unbrauchbar (0/10, kein Format, ~74 s).
    // DEFAULT auf qwen3.5:4b (3,4 GB, 8-GB-tauglich, = Mail-Modell) statt ministral (6 GB).
    'project-status':      {
      'qwen3.5:4b': {
        verdict: 'yellow',
        reasons: ['Seltene Halluzination auf dünnen Wochen (~1/10: erfand einmal „Theme ausgewählt" für eine laut Quelle OFFENE Aufgabe) — auf normalen Wochen 0', 'Setzt den exakt vorgegebenen „keine konkrete Bewegung"-Satz bei dünner Woche nicht (beschreibt die Lage aber ehrlich) — gilt für alle getesteten lokalen Modelle'],
        notes: 'Empfohlener Default: 8-GB-tauglich (~3,4 GB) und bereits das Mail-Modell (task-extraction/mail-summary) → ein kleines Modell über Mail UND Projekt-Status. Gebenchmarkt (bench-project-status.mjs, 2026-06-03, Honesty-Scorer, 2 Cases × 5 Reps): 9/10, normale Woche 5/5 sauber ohne Format-Warnungen, ~13 s/Projekt. Qualitativ gleichauf mit ministral-3:8b (Run-zu-Run-Varianz); gewinnt über RAM + Modell-Kohärenz.',
        metrics: { latencySecondsPerRun: 13, ramGigabytes: 4 }
      },
      'ministral-3:8b': {
        verdict: 'yellow',
        reasons: ['„In einem Satz" läuft regelmäßig zu lang (27–30 statt ≤25 Wörter, 7/10 Läufe)', 'Seltene Halluzination auf dünnen Wochen (~1/15: „Theme ausgewählt" für offene Aufgabe), wie auch qwen3.5:4b'],
        notes: 'Solide Option (~6 GB). Gebenchmarkt (bench-project-status.mjs, 2026-06-03, Honesty-Scorer): 10/10 ehrlich, 0 Halluzinationen in dieser Serie (1 in der Vorserie mit Strikt-Scorer), ~9 s/Projekt. Nicht mehr Default — qwen3.5:4b ist kleiner (3,4 GB) und deckt zugleich die Mail-Module ab.',
        metrics: { latencySecondsPerRun: 9, ramGigabytes: 6 }
      },
      'qwen3.6:latest': {
        verdict: 'green',
        reasons: [],
        notes: 'Beste Qualität bei vielen Quellen, aber langsam (~90 s/Projekt) und ≥48 GB RAM.',
        metrics: { latencySecondsPerRun: 90, ramGigabytes: 48 }
      },
      'qwen3.6:27b-mlx': {
        verdict: 'green',
        reasons: [],
        notes: 'Sauberer Output mit konsistenten Wikilinks, keine Halluzinationen. ~32 s/Projekt, ~19 GB RAM.',
        metrics: { latencySecondsPerRun: 32, ramGigabytes: 19 }
      },
      'gemma4:12b-mlx': {
        verdict: 'green',
        reasons: [],
        notes: 'Bench 2026-06-07 (bench-project-status.mjs, Honesty-Scorer, 2 Cases × 3 Reps): 6/6 PASS, 0 Warnungen — sauberer als gemma4:latest (6/6 PASS, aber 3 Format-Warnungen) und setzt auf dünnen Wochen das ehrliche „kein Fortschritt"-Signal korrekt. ~15 s/Projekt (eine ~74-s-Kaltstart-Spitze in Rep 1), ~11 GB RAM. Output landet im reviewbaren Draft (_STATUS-WW.md).',
        metrics: { latencySecondsPerRun: 15, ramGigabytes: 11 }
      },
      'qwen3.5:cloud': {
        verdict: 'yellow',
        reasons: ['Cloud: Status-Quellen (Brain-Tage, Tasks) werden zur Ollama-Cloud übertragen', 'Nicht eigenständig benchmarkt — abgeleitet von der lokal getesteten qwen3.5-Familie'],
        notes: 'Cloud-Test-Modell (`ollama signin`) — kein Download/GPU. Output landet ohnehin in einem Draft (`_STATUS-WW.md`), den der User reviewt. Für Kunden ohne lokal taugliche Hardware; nur Test/Demo.'
      }
    }
  }
}

// Empfohlene Default-Modelle pro Modul (Stand 2026-06-02).
// Werden im Settings-UI als "Empfehlung" markiert; greifen aber nicht automatisch ein.
// qwen3.5:4b für die E-Mail-Module (8-GB-tauglich, getestet); qwen3.6:27b-mlx für die
// schwereren/qualitätskritischen Module (kein 8-GB-taugliches qwen dafür getestet).
export const RECOMMENDED_DEFAULTS: Partial<Record<ModuleId, string>> = {
  'brain':              'ministral-3:8b',
  'task-extraction':    'qwen3.5:4b',
  'mail-summary':       'qwen3.5:4b',
  'dashboard-snapshot': 'ministral-3:8b',
  // project-status: qwen3.5:4b — gebenchmarkt 2026-06-03 (9/10, Honesty-Scorer), gleichauf
  // mit ministral, aber 3,4 GB (8-GB-tauglich) + zugleich das Mail-Modell → ein Modell für
  // Mail UND Projekt-Status. ministral-3:8b bleibt als getestete Option (yellow) in der Matrix.
  'project-status':     'qwen3.5:4b'
}

// Verdict für ein konkretes Modell und Modul nachschlagen.
// "untested" wenn das Modell nicht in der Matrix steht (z.B. neu gepullt).
export function getModelVerdict(model: string, moduleId: ModuleId): ModelVerdict {
  const moduleMap = MODEL_COMPATIBILITY.modules[moduleId]
  if (!moduleMap) return { verdict: 'untested', reasons: [] }
  const exact = moduleMap[model]
  if (exact) return exact
  return { verdict: 'untested', reasons: [] }
}

// Liefert alle Modelle, die für ein Modul "green" sind. Reihenfolge: in Matrix-Reihenfolge.
export function greenModelsForModule(moduleId: ModuleId): string[] {
  const moduleMap = MODEL_COMPATIBILITY.modules[moduleId] || {}
  return Object.entries(moduleMap)
    .filter(([, v]) => v.verdict === 'green')
    .map(([name]) => name)
}

// Soft-Check für Hard-Lock-Entscheidungen im Backend.
// Liefert true, wenn das Modul mit diesem Modell NICHT laufen darf.
export function isHardLocked(model: string, moduleId: ModuleId): boolean {
  const descriptor = MODULES.find(m => m.id === moduleId)
  if (!descriptor || !descriptor.damageRelevant) return false
  const v = getModelVerdict(model, moduleId)
  return v.verdict === 'red'
}

// ─── RAM-Bedarf eines Modells ────────────────────────────────────────────────
// Genutzt für die Weak-HW-Warnung: ein Modell, das nicht in den verfügbaren RAM
// passt, drückt Ollama ins Swap → das ganze (8-GB-)System friert ein (Hang).

// Schätzt den RAM-Bedarf (GB) aus dem Modell-Tag, wenn die Matrix nichts hat.
// Heuristik über den Parameter-Count (`…Xb…`) × Bytes-pro-Parameter je Quantisierung.
function estimateModelRamFromName(model: string): number | null {
  const m = model.toLowerCase()
  const paramMatch = m.match(/(\d+(?:\.\d+)?)\s*b(?![a-z])/) // 27b, 4b, 0.8b …
  if (!paramMatch) return null
  const params = parseFloat(paramMatch[1])
  if (!Number.isFinite(params) || params <= 0) return null
  // Bytes pro Parameter je nach Quantisierung im Tag (grobe Obergrenze für die Warnung).
  let gbPerB = 0.7 // Default ~Q4
  if (/bf16|fp16|f16/.test(m)) gbPerB = 2.0
  else if (/q8|8bit|int8/.test(m)) gbPerB = 1.1
  else if (/mlx/.test(m)) gbPerB = 1.0 // MLX oft 4–8bit, konservativ
  // + ~1 GB Overhead (KV-Cache, Runtime).
  return Math.round((params * gbPerB + 1) * 10) / 10
}

// Liefert den geschätzten RAM-Bedarf (GB) eines Modells: bevorzugt den gemessenen
// Matrix-Wert (in irgendeinem Modul gepflegt — RAM ist modulunabhängig), sonst
// die Namens-Heuristik. null = unbekannt (keine Warnung).
export function getModelRamGb(model: string): number | null {
  const tag = (model || '').trim()
  if (!tag) return null
  for (const moduleMap of Object.values(MODEL_COMPATIBILITY.modules)) {
    const ram = moduleMap[tag]?.metrics?.ramGigabytes
    if (typeof ram === 'number' && ram > 0) return ram
  }
  return estimateModelRamFromName(tag)
}

// Passt das Modell in den verfügbaren RAM? Reserve von ~2 GB für OS + Electron + App.
// `green`-Schwelle so kalibriert, dass das 8-GB-Empfohlene (qwen3.5:4b ≈ 4 GB) NICHT
// warnt, alles Größere (ministral 6, gemma4 10, qwen3.6:27b 22 …) schon.
// Cloud-Modelle (`-cloud`/`:cloud`) brauchen keinen lokalen RAM → nie eine Warnung.
export interface ModelRamFit {
  fits: boolean
  modelRamGb: number | null
  totalRamGb: number
}
export function checkModelRamFit(model: string, totalRamGb: number | null | undefined): ModelRamFit {
  const total = typeof totalRamGb === 'number' && totalRamGb > 0 ? totalRamGb : 0
  if (!total || isCloudModel(model)) return { fits: true, modelRamGb: null, totalRamGb: total }
  const ram = getModelRamGb(model)
  if (ram == null) return { fits: true, modelRamGb: null, totalRamGb: total }
  return { fits: ram <= total - 2, modelRamGb: ram, totalRamGb: total }
}

// MLX-Modelle: Apple-Silicon-optimiert (laufen via Apples MLX-Framework nativ
// auf M-Chips, deutlich schneller + weniger RAM als GGUF/llama.cpp-Varianten).
// Erkennung: `-mlx` irgendwo im Tag (z.B. `qwen3.6:27b-mlx`, `qwen3.5:9b-mlx-bf16`).
export function isMlxModel(model: string): boolean {
  if (!model) return false
  return /-mlx(?:[-:].*)?$/i.test(model.trim())
}

// Gemeinsamer Marker-Präfix für Modell-Labels in allen UI-Stellen.
// Reihenfolge: 🍎 (MLX/Apple-Silicon) zuerst, dann ⭐ (Entwickler-Favorit) —
// technisches Signal vor Geschmackssignal. Trennzeichen je ein Leerzeichen.
export function modelMarkers(model: string): string {
  const parts: string[] = []
  if (isMlxModel(model)) parts.push('🍎')
  if (isHumanFavorite(model)) parts.push('⭐')
  return parts.length > 0 ? parts.join(' ') + ' ' : ''
}

// Modell-Hersteller (Vendor) aus dem Tag ableiten — rein für UI-Wiedererkennung
// (Logo + Name neben dem Modell). Heuristik über den Modellnamen, da Ollama-Tags
// keine strukturierte Vendor-Info tragen. Reihenfolge wichtig: spezifische Familien
// (ministral/mixtral → Mistral) vor generischen Treffern. Unbekannt → 'generic'.
export type ModelVendorId =
  | 'qwen' | 'gemma' | 'mistral' | 'llama' | 'phi' | 'deepseek'
  | 'openai' | 'nomic' | 'bge' | 'granite' | 'cohere' | 'openrouter' | 'generic'

const VENDOR_PATTERNS: Array<{ id: ModelVendorId; name: string; re: RegExp }> = [
  { id: 'qwen',    name: 'Qwen (Alibaba)',     re: /\bqwen|qwq/i },
  { id: 'gemma',   name: 'Gemma (Google)',      re: /\bgemma|\bgoogle/i },
  { id: 'mistral', name: 'Mistral AI',          re: /\bmi(?:s|x)tral|\bministral|\bcodestral|\bdevstral|\bmagistral/i },
  { id: 'llama',   name: 'Llama (Meta)',        re: /\bllama|\bcodellama|\bmeta/i },
  { id: 'phi',     name: 'Phi (Microsoft)',     re: /\bphi[-\d]/i },
  { id: 'deepseek',name: 'DeepSeek',            re: /\bdeepseek/i },
  { id: 'openai',  name: 'OpenAI',              re: /\bgpt[-_]?oss|\bgpt-/i },
  { id: 'granite', name: 'Granite (IBM)',       re: /\bgranite/i },
  { id: 'cohere',  name: 'Cohere',              re: /\bcommand-?r|\bcohere|\baya/i },
  { id: 'bge',     name: 'BAAI (BGE)',          re: /\bbge/i },
  { id: 'nomic',   name: 'Nomic',               re: /\bnomic/i },
  // OpenRouter ZULETZT: ein echtes Cloud-Modell wie `openrouter/google/gemma-3`
  // matcht oben bereits seinen echten Vendor (gemma). Nur der bare Sentinel
  // `__openrouter__` (Dropdown-Eintrag) fällt bis hierher durch → OpenRouter-Logo.
  { id: 'openrouter', name: 'OpenRouter',        re: /openrouter/i },
]

export function getModelVendor(model: string): { id: ModelVendorId; name: string } {
  const tag = (model || '').trim()
  if (tag) {
    for (const p of VENDOR_PATTERNS) {
      if (p.re.test(tag)) return { id: p.id, name: p.name }
    }
  }
  return { id: 'generic', name: 'Modell' }
}

// Entwickler-Favoriten — Modelle, die im echten Vault-Alltag favorisiert werden.
// Achse unabhängig von Bench-Verdicts (`green/yellow/red`): ein Modell kann ein
// gelbes Bench-Verdict in einem Modul haben und trotzdem Favorit sein, wenn
// die Real-Use-Qualität die statistische Stichprobe schlägt.
//
// Quelle: `RECOMMENDED_PULL_MODELS[].humanFavorite`. Helper liest diese Liste,
// damit der Marker an genau einer Stelle gepflegt wird.
export function isHumanFavorite(model: string): boolean {
  if (!model) return false
  const entry = RECOMMENDED_PULL_MODELS.find(m => m.name === model)
  return entry?.humanFavorite === true
}

// Ollama-Cloud-Modelle tragen einen Cloud-Suffix im Tag — entweder `:cloud`
// (z.B. `qwen3.5:cloud`) oder `-cloud` (z.B. `gpt-oss:120b-cloud`). Die Anfrage geht
// zwar weiter über localhost:11434, aber die eigentliche Inferenz findet auf Ollama-
// Servern statt — d.h. die Prompt-Inhalte verlassen den Rechner. Wichtig: das hängt am
// Modell-TAG, NICHT am Endpunkt — ein selbst-gehosteter/On-Prem-Ollama-Server mit
// normalen Modellen ist KEIN Cloud-Modell. Genutzt für UI-Privacy-Hinweise UND als
// Hard-Lock im Workflow-Runner (keine personenbezogenen Daten in die Cloud).
export function isCloudModel(model: string): boolean {
  if (!model) return false
  return /[:-]cloud$/i.test(model.trim())
}

// "Cloud-Test-Modelle": Modelle, die wir als Null-Reibungs-Einstieg für Test-User
// anbieten (kein Download, keine lokale GPU). Reine UI-Hilfe für Onboarding/Settings.
// 2026-06-02: ministral-3:14b-cloud (mistral/ministral-Abbau) ersetzt durch qwen3.5:cloud —
// gleiches Cloud-Test-Szenario für Kunden ohne lokal taugliche Hardware, aber qwen-Familie.
export const CLOUD_TEST_MODELS: Array<{ name: string; label: string; description: string }> = [
  {
    name: 'qwen3.5:cloud',
    label: 'Qwen 3.5 (Cloud, Test)',
    description: 'Läuft auf Ollama-Cloud (`ollama signin`) — kein Download, keine GPU. Inhalte verlassen den Rechner. Für erste Tests gedacht; im Alltag ein lokales qwen.'
  }
]

// Empfohlene lokale Pull-Modelle für Onboarding + Settings.
// Quelle: die Modelle, die wir tatsächlich gegen die Compat-Matrix gebenchmarkt
// haben — keine Stellvertreter-Tags. So matcht ein Pull aus der UI 1:1 einen
// Matrix-Eintrag und der User landet nach Download nicht bei "❔ ungetestet".
//
// Bench-Verdicts (✅/⚠️/🔴) gehören NICHT ins Pull-Label — Aggregation über
// 5 Module liest sich wie Rauschen ("✅/⚠️"). Wer Detail-Verdicts will,
// schaut nach dem Pull in die Kompatibilitäts-Sektion.
//
// `humanFavorite`: separates Signal — der Entwickler hat das Modell im
// echten Vault-Alltag getestet und favorisiert es. Bench-unabhängig.
export type PullModelKind = 'chat' | 'embedding'

export const RECOMMENDED_PULL_MODELS: Array<{
  name: string
  label: string
  kind?: PullModelKind        // default 'chat'
  humanFavorite?: boolean
}> = [
  { name: 'qwen3.5:4b',          label: 'Qwen 3.5 4B (~3,4 GB — läuft auf 8 GB RAM, Empfehlung für kleine Macs)' },
  { name: 'ministral-3:8b',      label: 'Ministral 3 8B (~6 GB — Brain/Dashboard-Empfehlung, läuft auf 16 GB RAM)' },
  { name: 'gemma4:latest',       label: 'Gemma 4 (~10 GB — schnell; Prompts brauchen Platzhalter statt Beispielwerte)' },
  { name: 'gemma4:12b-mlx',      label: 'Gemma 4 12B MLX (~10 GB — Apple-Silicon/MLX, stark bei Task-Extraktion; Prompts brauchen Platzhalter statt Beispielwerte)' },
  { name: 'qwen3.6:27b-mlx',     label: 'Qwen 3.6 27B MLX (~22 GB)',         humanFavorite: true },
  { name: 'qwen3.6:latest',      label: 'Qwen 3.6 (~48 GB, sehr großer RAM-Bedarf)', humanFavorite: true },
  { name: 'qwen3.5:9b-mlx-bf16', label: 'Qwen 3.5 9B MLX (~8 GB)' },
  { name: 'bge-m3:latest',       label: 'bge-m3 (~600 MB, multilingual — Smart Connections)', kind: 'embedding' }
]
