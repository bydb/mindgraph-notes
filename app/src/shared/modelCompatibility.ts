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
  version: '2026-06-02',
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
      'qwen3.5:4b': {
        verdict: 'green',
        reasons: [],
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
    // Project-Status — noch keine systematischen Benchmarks. Empirie aus dem
    // Crystallizer-Bash-Prototyp (Mai 2026, Pre-Demo Startup-Weekend):
    // qwen3.6 stark bei langen Quellenketten. 2026-05-28: qwen3.6:27b-mlx gegen
    // Crystallizer-Prompt (`bench-project-status.mjs`) — saubere Struktur, korrekte
    // Wikilink-Form ([[YYYY-MM-DD]]), keine Halluzinationen. Latenz ~32 s/Projekt.
    // 2026-06-02: gemma4/ministral entfernt — Empfehlung qwen3.6.
    'project-status':      {
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
  'brain':              'qwen3.6:27b-mlx',
  'task-extraction':    'qwen3.5:4b',
  'mail-summary':       'qwen3.5:4b',
  'dashboard-snapshot': 'qwen3.6:27b-mlx',
  'project-status':     'qwen3.6:27b-mlx'
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

// Ollama-Cloud-Modelle haben einen `-cloud`-Suffix im Tag (z.B. `qwen3.5:cloud`).
// Die Anfrage geht zwar weiter über localhost:11434, aber die eigentliche Inferenz
// findet auf Ollama-Servern statt — d.h. die Prompt-Inhalte verlassen den Rechner.
// Für UI-Hinweise (Privacy-Warnung) gedacht, nicht für Hard-Locks.
export function isCloudModel(model: string): boolean {
  if (!model) return false
  return /-cloud$/i.test(model.trim())
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
  { name: 'qwen3.6:27b-mlx',     label: 'Qwen 3.6 27B MLX (~22 GB)',         humanFavorite: true },
  { name: 'qwen3.6:latest',      label: 'Qwen 3.6 (~48 GB, sehr großer RAM-Bedarf)', humanFavorite: true },
  { name: 'qwen3.5:9b-mlx-bf16', label: 'Qwen 3.5 9B MLX (~8 GB)' },
  { name: 'bge-m3:latest',       label: 'bge-m3 (~600 MB, multilingual — Smart Connections)', kind: 'embedding' }
]
