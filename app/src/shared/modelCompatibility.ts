// Modell-Kompatibilitäts-Matrix für lokale Ollama-Modelle in MindGraph Notes.
// Quelle der Wahrheit für die Settings-UI ("Beipackzettel" pro Modul).
//
// Datenstand: 2026-05-14 — basierend auf Benchmarks in
// /Users/jochenleeder/dev/brain-model-benchmark/ und
// "Modell-Kompatibilitaets-Analyse.md".
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
  version: '2026-05-14',
  modules: {
    brain: {
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
      'gemma4:latest': {
        verdict: 'green',
        reasons: ['Erfindet gelegentlich leere Sektionen (Regel-5-Konflikt im Prompt)'],
        metrics: { criticalTitlesLinkedPct: 80, rule5CompliancePct: 25, latencySecondsPerRun: 7, ramGigabytes: 10 }
      },
      'llama3.1:8b': {
        verdict: 'red',
        reasons: ['In Szenario s3 wurden 0 Wikilinks produziert', 'Subtile Bewertungs-Drift in Reflexion'],
        metrics: { criticalTitlesLinkedPct: 50, rule5CompliancePct: 0, latencySecondsPerRun: 8, ramGigabytes: 8 }
      },
      'ministral-3:8b': {
        verdict: 'green',
        reasons: [],
        notes: 'Einziges Modell, das Regel 5 (leere Sektionen weglassen) korrekt befolgt.',
        metrics: { formatCompliancePct: 100, wikilinkHallucinations: 'none', criticalTitlesLinkedPct: 80, rule5CompliancePct: 100, latencySecondsPerRun: 11, ramGigabytes: 6 }
      }
    },
    'task-extraction': {
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
      'gemma4:latest': {
        verdict: 'green',
        reasons: [],
        notes: 'Mit Two-Pass-Resolver: Deadline-Genauigkeit 67 % → 100 %.',
        metrics: { directionAccuracyPct: 90, recallPct: 100, latencySecondsPerRun: 3 }
      },
      'llama3.1:8b': {
        verdict: 'yellow',
        reasons: ['Richtungs-Erkennung 63 %', 'Bei seltenen Mustern Recall-Einbruch'],
        metrics: { directionAccuracyPct: 63, recallPct: 80 }
      },
      'ministral-3:8b': {
        verdict: 'yellow',
        reasons: ['Recall nur 88 % — gelegentlich vergessene Aufgaben'],
        metrics: { directionAccuracyPct: 88, recallPct: 88 }
      }
    },
    'mail-summary': {
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
      'gemma4:latest': {
        verdict: 'green',
        reasons: ['Relevance leicht überschätzt'],
        notes: 'Schnellster (5 s/Mail).',
        metrics: { recallPct: 93, latencySecondsPerRun: 5, ramGigabytes: 10 }
      },
      'llama3.1:8b': {
        verdict: 'green',
        reasons: [],
        notes: 'Niedrigste Halluzinations-Ratio (13 %).',
        metrics: { recallPct: 95, latencySecondsPerRun: 6, ramGigabytes: 8 }
      },
      'ministral-3:8b': {
        verdict: 'green',
        reasons: [],
        notes: 'Beste Relevance-Range-Compliance (7/8), schnell.',
        metrics: { recallPct: 96, latencySecondsPerRun: 6, ramGigabytes: 6 }
      }
    },
    'dashboard-snapshot': {
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
      'gemma4:latest': {
        verdict: 'green',
        reasons: [],
        notes: 'Schnellster (~1 s/Notiz), Score-Kalibrierung solide.',
        metrics: { recallPct: 98, latencySecondsPerRun: 1, ramGigabytes: 10 }
      },
      'llama3.1:8b': {
        verdict: 'red',
        reasons: ['Fällt auf Prompt-Injection rein (Score=100 und "Yarr!"-Output bei manipulierter Notiz)', 'Sehr enge Score-Bandbreite (oft 81), schlechte Skala-Auflösung'],
        notes: 'Sicherheitsrelevant: Notiz-Inhalt ist UNTRUSTED Input. Hard-Lock empfohlen.'
      },
      'ministral-3:8b': {
        verdict: 'green',
        reasons: [],
        notes: 'Perfekter Lauf (8/8), erkennt Injection, präzise Skala.',
        metrics: { recallPct: 100, latencySecondsPerRun: 1, ramGigabytes: 6 }
      }
    },
    'smart-connections':   {},
    // Project-Status — noch keine systematischen Benchmarks. Empirie aus dem
    // Crystallizer-Bash-Prototyp (Mai 2026, Pre-Demo Startup-Weekend):
    // gemma4:latest produzierte saubere Status-Drafts mit 0–1 ⚠ pro Lauf,
    // qwen3.6:latest stärker bei langen Quellenketten, aber 25s/Lauf.
    // Kleine Modelle (≤8B) neigten zu generischen Floskeln in "Diese Woche".
    'project-status':      {
      'gemma4:latest': {
        verdict: 'green',
        reasons: [],
        notes: 'Empirisch sauber, schnell (~30 s/Projekt auf M2). Empfohlener Standard.',
        metrics: { latencySecondsPerRun: 30, ramGigabytes: 10 }
      },
      'qwen3.6:latest': {
        verdict: 'green',
        reasons: [],
        notes: 'Beste Qualität bei vielen Quellen, aber langsam (~90 s/Projekt) und ≥48 GB RAM.',
        metrics: { latencySecondsPerRun: 90, ramGigabytes: 48 }
      },
      'ministral-3:8b': {
        verdict: 'yellow',
        reasons: ['Neigt zu Floskeln in "Diese Woche"', 'Wenige Backlinks bei dichten Quellen'],
        notes: 'Reicht für simple Projekte mit ≤2 Brain-Tagen; bei dichteren Wochen besser gemma4.',
        metrics: { latencySecondsPerRun: 12, ramGigabytes: 6 }
      }
    }
  }
}

// Empfohlene Default-Modelle pro Modul (Stand 2026-05-14).
// Werden im Settings-UI als "Empfehlung" markiert; greifen aber nicht automatisch ein.
export const RECOMMENDED_DEFAULTS: Partial<Record<ModuleId, string>> = {
  'brain':              'ministral-3:8b',
  'task-extraction':    'gemma4:latest',
  'mail-summary':       'ministral-3:8b',
  'dashboard-snapshot': 'gemma4:latest',
  'project-status':     'gemma4:latest'
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
