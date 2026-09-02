// Leistungsdaten der lokalen Modelle — reine Logik, prozessübergreifend.
//
// Ollama liefert in JEDER Antwort mit, wie lange es gebraucht hat: `load_duration`,
// `prompt_eval_count`/`prompt_eval_duration`, `eval_count`/`eval_duration`,
// `total_duration` (alles Nanosekunden; beim Streaming im letzten Chunk). Die App
// hat davon bisher nur `prompt_eval_count` gelesen, und das nur, um Kontext-
// Überläufe zu erkennen. Der Rest wurde weggeworfen.
//
// Hier steht die Umrechnung und die Statistik. Kein IPC, kein fetch, keine
// Elektron-Abhängigkeit — damit sie testbar bleibt und Main wie Renderer
// dieselbe Rechnung benutzen.

import { type CallUsage, type CostSource, type ModelPricing, callCostUsd, formatUsd } from './llmCost'

export type LlmBackendId = 'ollama' | 'lmstudio' | 'openrouter' | 'llmbase'

// ─── Modulkatalog (docs/measurement-history-plan.md § 4) ─────────────────────
//
// Fester Katalog statt Freitext: Bis 09/2026 setzten nur drei Aufrufer ein Modul, alles
// andere lief als „chat" — die Vergleichstabelle beschrieb damit keine einzige Aufgabe.
// Ein Aufruf ohne Modul ist seit dem Katalog ein Typfehler, kein stilles „chat".
// Die fünf Namen der Kompatibilitätsmatrix (modelCompatibility.ts) sind identisch;
// `dashboard-snapshot` fehlt bewusst — es gibt seit 08/2026 keinen Aufrufer mehr.
export const LLM_MODULES = [
  'chat',              // Notizen-Chat (direkt, sokratisch, grill)
  'ai-bar',            // KI-Leiste: fortsetzen, verbessern, freie Anweisung
  'translate',
  'summarize',
  'note-agent',        // Notiz-Agent inkl. Merkvorschlag
  'telegram',          // Telegram-Bot: Agent, Briefing, Fragen
  'mail-summary',      // Mail-Analyse (lokal wie Cloud)
  'task-extraction',   // Aufgaben-Tagger, Termin aus Mail
  'brain',
  'smart-connections', // LLM-as-Judge-Reranker
  'embedding',         // /api/embeddings — Ollama meldet dort keine Zeiten, nur gezählt
  'quiz',              // Karteikarten und Quiz
  'workflow',          // Workflow-Canvas-Runner
  'plugin',            // Plugin-Host llm.generate
  'crystallizer',      // Projekt-Status
  'synonyms',          // Projekt-Synonyme
  'zettel',            // Zettel-Vorschlag (Tags, Emojis)
  'project-rag',
  'vision-ocr',        // Vision-OCR und OCR-Textbereinigung
  'image',             // Bildgenerierung über Ollama
  'connection-test',   // „Antworte nur mit: OK"
] as const

export type LlmModuleId = typeof LLM_MODULES[number]

const MODULE_SET: ReadonlySet<string> = new Set(LLM_MODULES)

export function isLlmModuleId(value: unknown): value is LlmModuleId {
  return typeof value === 'string' && MODULE_SET.has(value)
}

/**
 * Modul für die Text-Aktionen der KI-Leiste (`ollama-generate`). Der Renderer kennt nur
 * die Aktion; der Main-Prozess übersetzt, damit der Renderer keine Modulnamen erfinden kann.
 */
export function moduleForAiAction(action: string): LlmModuleId {
  switch (action) {
    case 'translate': return 'translate'
    case 'summarize': return 'summarize'
    case 'ocr-cleanup': return 'vision-ocr'
    default: return 'ai-bar'
  }
}

/** Ein einzelner Modell-Lauf. Zeiten in Millisekunden, nicht Nanosekunden. */
export interface LlmRunMetrics {
  at: number                  // Zeitstempel des Laufs (Date.now())
  module: LlmModuleId         // aus dem Katalog oben, kein Freitext
  // Kennung des übergeordneten Laufs (Agentenauftrag, Mail-Extraktion), wenn es
  // einen gibt. Verbindet die Aufrufe mit dem Tätigkeitsprotokoll: Kosten, Token
  // und Rechenzeit werden je Lauf summiert. Ohne runId zählt der Aufruf nur für
  // Einsatz und Leistung (docs/measurement-history-plan.md § 1).
  runId?: string
  model: string
  backend: LlmBackendId
  executionProfile?: string   // nur stabile Profil-ID, niemals Thinking-Inhalt
  wallMs: number              // von der App gestoppt: Anfrage raus bis Antwort da
  promptTokens?: number
  outputTokens?: number
  promptEvalMs?: number       // Zeit fürs Lesen des Prompts
  evalMs?: number             // Zeit fürs Schreiben der Antwort
  loadMs?: number             // Zeit fürs Laden der Gewichte (0 = war warm)
  firstTokenMs?: number       // nur beim Streaming messbar
  // true, wenn das Modell nachgedacht hat und der Denk-Anteil NICHT in
  // outputTokens steckt. Über /api/chat meldet Ollama nur die sichtbare Antwort
  // (geprüft 19.08.2026: eval_count 98 bei rund 370 tatsächlich erzeugten Token),
  // über /api/generate zählt es den Denk-Anteil mit. Ohne diese Markierung sähe
  // ein Reasoning-Lauf dreimal langsamer aus, als er ist.
  hiddenThinking?: boolean
  // ─ Cloud-Aufrufe: was der Aufruf gekostet hat ─────────────────────────────
  // Nur bei 'openrouter'/'llmbase' gesetzt. Lokale Läufe kosten kein Geld — dort
  // bleiben die Felder undefined, was NICHT als 0 gelesen werden darf (siehe
  // llmCost.ts): eine 0 hieße `gemessen: kostenlos`, undefined heißt `nicht erhoben`.
  costUsd?: number
  costSource?: CostSource
  cachedTokens?: number       // Eingabe aus dem Anbieter-Cache (billiger abgerechnet)
  reasoningTokens?: number    // Denk-Token, die mitbezahlt werden, aber nicht im Text stehen
}

/**
 * Ein Kaltstart hat die Gewichte erst in den Speicher holen müssen. Bei einem 27B-
 * Modell sind das zweistellige Sekunden — wer das in einen Modellvergleich mischt,
 * misst das Aufwärmen und nennt es Geschwindigkeit.
 */
export const COLD_START_LOAD_MS = 1000

export function isColdStart(run: LlmRunMetrics): boolean {
  return (run.loadMs ?? 0) >= COLD_START_LOAD_MS
}

/** Token pro Sekunde beim Schreiben der Antwort. null, wenn der Server nichts meldet. */
export function outputTokensPerSecond(run: LlmRunMetrics): number | null {
  if (!run.outputTokens || !run.evalMs || run.evalMs <= 0) return null
  return (run.outputTokens / run.evalMs) * 1000
}

/**
 * Token pro Sekunde beim Lesen des Prompts. Bei großen MLX-Modellen ist das oft
 * der eigentliche Flaschenhals — die Trennung zeigt, ob ein Modell langsam LIEST
 * oder langsam SCHREIBT.
 */
export function promptTokensPerSecond(run: LlmRunMetrics): number | null {
  if (!run.promptTokens || !run.promptEvalMs || run.promptEvalMs <= 0) return null
  return (run.promptTokens / run.promptEvalMs) * 1000
}

/** Ollama meldet Nanosekunden. undefined bleibt undefined (nicht 0 — das hieße „gemessen: null"). */
export function nsToMs(ns: number | undefined | null): number | undefined {
  if (typeof ns !== 'number' || !Number.isFinite(ns) || ns < 0) return undefined
  return ns / 1e6
}

/** Rohantwort von Ollama (/api/chat wie /api/generate) → Kennzahlen. */
export interface OllamaTimings {
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
  total_duration?: number
}

export function fromOllamaResponse(
  timings: OllamaTimings,
  meta: { module: LlmModuleId; model: string; wallMs: number; at: number; backend?: LlmBackendId; firstTokenMs?: number; hiddenThinking?: boolean; executionProfile?: string; runId?: string }
): LlmRunMetrics {
  return {
    at: meta.at,
    module: meta.module,
    ...(meta.runId ? { runId: meta.runId } : {}),
    model: meta.model,
    backend: meta.backend ?? 'ollama',
    executionProfile: meta.executionProfile,
    wallMs: meta.wallMs,
    promptTokens: timings.prompt_eval_count,
    outputTokens: timings.eval_count,
    promptEvalMs: nsToMs(timings.prompt_eval_duration),
    evalMs: nsToMs(timings.eval_duration),
    loadMs: nsToMs(timings.load_duration),
    firstTokenMs: meta.firstTokenMs,
    hiddenThinking: meta.hiddenThinking,
  }
}

/**
 * Antwort eines Cloud-Backends (OpenAI-kompatibel) → Kennzahlen.
 *
 * Gegenstück zu fromOllamaResponse. Cloud-Anbieter melden keine Server-Zeiten,
 * deshalb gibt es hier nur Wanduhrzeit — dafür melden sie, was es gekostet hat.
 * OpenRouter liefert `usage.cost` seit 08/2026 unaufgefordert in jeder Antwort;
 * LLMBase nicht, dort wird aus Token und Katalogpreis gerechnet.
 */
export function fromCloudResponse(
  usage: CallUsage | null,
  meta: {
    module: LlmModuleId; model: string; wallMs: number; at: number
    backend: LlmBackendId; pricing?: ModelPricing | null
    firstTokenMs?: number; executionProfile?: string; runId?: string
  }
): LlmRunMetrics {
  const cost = callCostUsd(usage, meta.pricing)
  return {
    at: meta.at,
    module: meta.module,
    ...(meta.runId ? { runId: meta.runId } : {}),
    model: meta.model,
    backend: meta.backend,
    executionProfile: meta.executionProfile,
    wallMs: meta.wallMs,
    promptTokens: usage?.promptTokens,
    outputTokens: usage?.completionTokens,
    firstTokenMs: meta.firstTokenMs,
    cachedTokens: usage?.cachedTokens,
    reasoningTokens: usage?.reasoningTokens,
    ...(cost ? { costUsd: cost.usd, costSource: cost.source } : {}),
  }
}

// ─── Messgeschichte: Ablage-Regeln (docs/measurement-history-plan.md § 2) ───
//
// Die Aufrufe werden im Main-Prozess auf Platte geschrieben (main/llm/telemetryLedger.ts).
// Hier stehen nur die Regeln, die Main und Renderer gemeinsam kennen müssen:
// was ein gültiger Eintrag ist und wie lange er lebt.

/** Rohdaten bleiben ein Jahr — Mediane und Kaltstart-Ausschluss lassen sich aus Summen nicht rechnen. */
export const TELEMETRY_RETENTION_DAYS = 365
/** Obergrenze danach; die jüngsten Einträge bleiben. Rund 250 Byte je Eintrag → unter 15 MB. */
export const TELEMETRY_MAX_RUNS = 50_000

const BACKENDS: ReadonlySet<string> = new Set<LlmBackendId>(['ollama', 'lmstudio', 'openrouter', 'llmbase'])

/**
 * Prüft einen Eintrag aus der Datei. Zeilenweise, damit eine halb geschriebene
 * oder von Hand veränderte Zeile nur sich selbst verliert, nicht die Geschichte.
 * Zahlenfelder müssen endlich und nicht negativ sein — eine NaN-Zeile würde sonst
 * jede Summe, in der sie steckt, unlesbar machen.
 */
export function isLlmRunMetrics(value: unknown): value is LlmRunMetrics {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const zahl = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x) && x >= 0
  const optZahl = (x: unknown): boolean => x === undefined || zahl(x)
  const optText = (x: unknown): boolean => x === undefined || typeof x === 'string'
  if (!zahl(v.at) || !zahl(v.wallMs)) return false
  // Unbekanntes Modul = ungültige Zeile. Alle je geschriebenen Namen stehen im Katalog;
  // ein fremder Name wäre eine von Hand veränderte Datei, keine alte Version.
  if (!isLlmModuleId(v.module) || typeof v.model !== 'string') return false
  if (typeof v.backend !== 'string' || !BACKENDS.has(v.backend)) return false
  if (!optText(v.runId) || !optText(v.executionProfile)) return false
  for (const key of ['promptTokens', 'outputTokens', 'promptEvalMs', 'evalMs', 'loadMs', 'firstTokenMs', 'costUsd', 'cachedTokens', 'reasoningTokens']) {
    if (!optZahl(v[key])) return false
  }
  if (v.hiddenThinking !== undefined && typeof v.hiddenThinking !== 'boolean') return false
  if (v.costSource !== undefined && v.costSource !== 'reported' && v.costSource !== 'computed') return false
  return true
}

/** Verbleib: erst nach Alter, dann auf die Obergrenze — die jüngsten Einträge bleiben. */
export function pruneLlmRuns(runs: LlmRunMetrics[], nowMs: number): LlmRunMetrics[] {
  const cutoff = nowMs - TELEMETRY_RETENTION_DAYS * 86_400_000
  const kept = runs.filter(r => r.at >= cutoff)
  return kept.length > TELEMETRY_MAX_RUNS ? kept.slice(kept.length - TELEMETRY_MAX_RUNS) : kept
}

// ─── Verbrauch eines Laufs (docs/measurement-history-plan.md § 3) ───────────
//
// Ein Lauf (Agentenauftrag, Mail-Durchlauf) besteht aus vielen Modellaufrufen; der
// Agenten-Loop schickt bei jeder Iteration die ganze Konversation neu. Was er
// gekostet hat, ist die SUMME aller Aufrufe mit seiner runId — nie der letzte.
// Die Summe wandert ins Tätigkeitsprotokoll (activityLog.ts), damit Modell, aktive
// Arbeitszeit, Übernahme und Kosten in EINEM Datensatz stehen.

export interface RunCallTotals {
  /** Alle Modellaufrufe des Laufs. */
  calls: number
  /** Aufrufe, zu denen der Server keine Token gemeldet hat — die Token-Summen sind dann Untergrenzen. */
  callsWithoutTokens: number
  promptTokens?: number
  completionTokens?: number
  /**
   * Gemessene Rechenzeit lokaler Aufrufe (Prompt lesen + Antwort schreiben), in ms.
   * Der ehrliche Preis eines lokalen Modells: gemessene Sekunden, kein geschätzter Strom.
   * Nur ollama/lmstudio; fehlt, wenn kein lokaler Aufruf Zeiten gemeldet hat.
   */
  computeMs?: number
  /** Cloud-Aufrufe (openrouter/llmbase). Die drei Kostenfelder gibt es nur, wenn > 0. */
  cloudCalls: number
  /** Vom Anbieter gemeldet (Abrechnungswahrheit). */
  costReportedUsd?: number
  /** Aus Token × Katalogpreis gerechnet. Wird NIE mit `costReportedUsd` addiert. */
  costComputedUsd?: number
  /** Cloud-Aufrufe ohne Preis — jede Kostensumme mit unpricedCalls > 0 ist eine Untergrenze („≥"). */
  unpricedCalls?: number
}

export function summarizeRunCalls(runs: LlmRunMetrics[]): RunCallTotals {
  const out: RunCallTotals = { calls: runs.length, callsWithoutTokens: 0, cloudCalls: 0 }
  let prompt = 0, completion = 0, compute = 0
  let sawTokens = false, sawCompute = false
  let reported = 0, computed = 0, unpriced = 0
  for (const r of runs) {
    if (typeof r.promptTokens === 'number' || typeof r.outputTokens === 'number') {
      sawTokens = true
      prompt += r.promptTokens ?? 0
      completion += r.outputTokens ?? 0
    } else {
      out.callsWithoutTokens += 1
    }
    const isCloud = r.backend === 'openrouter' || r.backend === 'llmbase'
    if (isCloud) {
      out.cloudCalls += 1
      if (typeof r.costUsd !== 'number') unpriced += 1
      else if (r.costSource === 'reported') reported += r.costUsd
      else computed += r.costUsd
    } else if (typeof r.promptEvalMs === 'number' || typeof r.evalMs === 'number') {
      sawCompute = true
      compute += (r.promptEvalMs ?? 0) + (r.evalMs ?? 0)
    }
  }
  if (sawTokens) { out.promptTokens = prompt; out.completionTokens = completion }
  if (sawCompute) out.computeMs = compute
  if (out.cloudCalls > 0) {
    out.costReportedUsd = reported
    out.costComputedUsd = computed
    out.unpricedCalls = unpriced
  }
  return out
}

/** Prüfung beim Lesen aus dem Tätigkeitsprotokoll — eine NaN-Summe würde jede Auswertung kippen. */
export function isRunCallTotals(value: unknown): value is RunCallTotals {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const zahl = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x) && x >= 0
  const optZahl = (x: unknown): boolean => x === undefined || zahl(x)
  if (!zahl(v.calls) || !zahl(v.callsWithoutTokens) || !zahl(v.cloudCalls)) return false
  for (const key of ['promptTokens', 'completionTokens', 'computeMs', 'costReportedUsd', 'costComputedUsd', 'unpricedCalls']) {
    if (!optZahl(v[key])) return false
  }
  return true
}

export function median(values: number[]): number | null {
  const sorted = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface LlmSummary {
  runs: number
  coldRuns: number
  /** Median, nicht Mittelwert: ein einzelner Kaltstart oder Ausreißer soll die Zahl nicht kippen. */
  outputTps: number | null
  promptTps: number | null
  firstTokenMs: number | null
  hiddenThinkingRuns: number
}

/**
 * Zusammenfassung über eine Auswahl von Läufen. Kaltstarts fließen NICHT in die
 * Geschwindigkeit ein (sie messen das Laden), werden aber gezählt und ausgewiesen.
 */
export function summarize(runs: LlmRunMetrics[]): LlmSummary {
  const warm = runs.filter(r => !isColdStart(r))
  return {
    runs: runs.length,
    coldRuns: runs.length - warm.length,
    outputTps: median(warm.map(outputTokensPerSecond).filter((v): v is number => v !== null)),
    promptTps: median(warm.map(promptTokensPerSecond).filter((v): v is number => v !== null)),
    firstTokenMs: median(warm.map(r => r.firstTokenMs).filter((v): v is number => typeof v === 'number')),
    hiddenThinkingRuns: runs.filter(r => r.hiddenThinking).length,
  }
}

/** Anzeige-Format. Unter 10 mit einer Nachkommastelle, darüber gerundet. */
export function formatTps(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return value < 10 ? value.toFixed(1) : String(Math.round(value))
}

// ─── Auswertung für das Leistungsfenster ─────────────────────────────────────

export interface LlmComparisonRow {
  model: string
  module: LlmModuleId
  summary: LlmSummary
  cost: LlmCostSummary
}

/**
 * Was eine Gruppe von Läufen gekostet hat.
 *
 * `localRuns` und `cloudRuns` stehen getrennt, weil „kostet nichts" und „Kosten
 * nicht bekannt" zwei verschiedene Aussagen sind. Ein lokaler Lauf ist gratis —
 * das ist ein Fakt. Ein Cloud-Lauf ohne Kostenangabe ist eine Lücke. Beides als
 * $0 anzuzeigen wäre die Sorte Kennzahl, die nur gewinnen kann.
 */
export interface LlmCostSummary {
  localRuns: number
  cloudRuns: number
  /** Cloud-Läufe mit bekannter Kostenangabe. */
  pricedRuns: number
  /** Cloud-Läufe ohne — die Summe ist dann eine Untergrenze, kein Gesamtbetrag. */
  unpricedRuns: number
  /** Vom Anbieter gemeldet (Abrechnungswahrheit). */
  reportedUsd: number
  /** Aus Token und Katalogpreis gerechnet. */
  computedUsd: number
  /** null = kein einziger Lauf hatte eine Kostenangabe. NICHT 0. */
  totalUsd: number | null
}

export function summarizeCost(runs: LlmRunMetrics[]): LlmCostSummary {
  const out: LlmCostSummary = {
    localRuns: 0, cloudRuns: 0, pricedRuns: 0, unpricedRuns: 0,
    reportedUsd: 0, computedUsd: 0, totalUsd: null,
  }
  for (const run of runs) {
    const isCloud = run.backend === 'openrouter' || run.backend === 'llmbase'
    if (!isCloud) { out.localRuns += 1; continue }
    out.cloudRuns += 1
    if (typeof run.costUsd !== 'number') { out.unpricedRuns += 1; continue }
    out.pricedRuns += 1
    if (run.costSource === 'reported') out.reportedUsd += run.costUsd
    else out.computedUsd += run.costUsd
  }
  if (out.pricedRuns > 0) out.totalUsd = out.reportedUsd + out.computedUsd
  return out
}

/**
 * Eine Zeile je Kombination aus Modell und Modul.
 *
 * Bewusst NICHT nur je Modell: Dasselbe Modell verhält sich je nach Aufgabe
 * unterschiedlich — die Mail-Zusammenfassung schreibt lange Fließtexte, die
 * Aufgaben-Extraktion kurzes JSON. Ein gemeinsamer Mittelwert über beide würde
 * eine Zahl erzeugen, die keine der beiden Aufgaben beschreibt.
 */
export function buildComparisonRows(runs: LlmRunMetrics[]): LlmComparisonRow[] {
  const groups = new Map<string, LlmRunMetrics[]>()
  for (const run of runs) {
    const key = `${run.model}\u0000${run.module}`
    const list = groups.get(key)
    if (list) list.push(run)
    else groups.set(key, [run])
  }
  const rows: LlmComparisonRow[] = []
  for (const list of groups.values()) {
    rows.push({ model: list[0].model, module: list[0].module, summary: summarize(list), cost: summarizeCost(list) })
  }
  // Schnellste zuerst — das ist die Frage, mit der man auf diese Tabelle schaut.
  // Zeilen ohne messbaren Durchsatz nach hinten, nicht als „0" dazwischen.
  return rows.sort((a, b) => (b.summary.outputTps ?? -1) - (a.summary.outputTps ?? -1))
}

/**
 * Kostenzelle als Text. Die Vorzeichen tragen die Herkunft der Zahl mit, weil
 * eine nackte Summe drei verschiedene Dinge heißen könnte:
 *   'lokal'  — lief auf diesem Rechner, kostet nichts (Fakt, keine Messung)
 *   '—'      — Cloud-Läufe, aber zu keinem eine Kostenangabe
 *   '≥ …'    — mindestens ein Lauf ohne Preis: die Summe ist eine Untergrenze
 *   '≈ …'    — ganz oder teilweise aus Token × Katalogpreis gerechnet
 *   '$…'    — vom Anbieter abgerechnet, ohne Vorbehalt
 */
export interface CostCellLabels {
  /** Lief auf diesem Rechner. Stand hier bis 28.08.2026 fest auf Deutsch. */
  local: string
}

export const DEFAULT_COST_CELL_LABELS: CostCellLabels = { local: 'lokal' }

export function formatCostCell(
  cost: LlmCostSummary,
  labels: CostCellLabels = DEFAULT_COST_CELL_LABELS
): string {
  if (cost.cloudRuns === 0) return labels.local
  if (cost.totalUsd === null) return '—'
  const betrag = formatUsd(cost.totalUsd)
  if (cost.unpricedRuns > 0) return `≥ ${betrag}`
  if (cost.computedUsd > 0) return `≈ ${betrag}`
  return betrag
}

function msToSeconds(ms: number | null): string {
  return ms === null || !Number.isFinite(ms) ? '—' : `${(ms / 1000).toFixed(1)} s`
}

/** Markdown-Tabelle zum Einfügen in eine Notiz oder Videofolie. */
export function toMarkdownTable(rows: LlmComparisonRow[]): string {
  const lines = [
    '| Modell | Modul | Antwort Tok/s | Prompt Tok/s | 1. Wort | Kosten | Läufe | Kaltstarts |',
    '|---|---|---|---|---|---|---|---|',
  ]
  for (const r of rows) {
    const s = r.summary
    const star = s.hiddenThinkingRuns > 0 ? '*' : ''
    lines.push(`| ${r.model} | ${r.module} | ${formatTps(s.outputTps)}${star} | ${formatTps(s.promptTps)} | ${msToSeconds(s.firstTokenMs)} | ${formatCostCell(r.cost)} | ${s.runs} | ${s.coldRuns} |`)
  }
  lines.push('')
  if (rows.some(r => r.summary.hiddenThinkingRuns > 0)) {
    lines.push('Sternchen: enthält Läufe mit Reasoning. Über `/api/chat` meldet Ollama die Denk-Token nicht in `eval_count`; der Wert ist dort zu niedrig.')
    lines.push('')
  }
  lines.push('Median über die warmen Läufe. Kaltstarts (Laden der Gewichte) sind aus der Geschwindigkeit herausgerechnet und getrennt gezählt.')
  if (rows.some(r => r.cost.cloudRuns > 0)) {
    lines.push('')
    lines.push('Kosten: `lokal` = auf diesem Rechner gelaufen, kostet nichts. `≈` = aus Token und Katalogpreis gerechnet. `≥` = mindestens ein Lauf ohne Preisangabe, die Summe ist eine Untergrenze. Ohne Zeichen: vom Anbieter so abgerechnet.')
  }
  return lines.join('\n')
}

/** CSV für Tabellenkalkulation. Semikolon, weil deutsches Excel daran Spalten erkennt. */
export function toCsv(rows: LlmComparisonRow[]): string {
  const esc = (v: string) => /[";]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const num = (v: number | null) => v === null || !Number.isFinite(v) ? '' : String(Math.round(v * 10) / 10).replace('.', ',')
  const out = ['Modell;Modul;Antwort Tok/s;Prompt Tok/s;Zeit bis 1. Wort (ms);Kosten USD;davon abgerechnet;davon gerechnet;Cloud-Laeufe;davon ohne Preis;Laeufe;Kaltstarts;Laeufe mit verstecktem Reasoning']
  for (const r of rows) {
    const s = r.summary
    const c = r.cost
    // Kosten mit voller Genauigkeit: ein Agentenlauf kostet Bruchteile eines Cents,
    // auf zwei Stellen gerundet stünde in der Tabellenkalkulation überall 0.
    const usd = (v: number | null) => v === null ? '' : String(v.toFixed(6)).replace('.', ',')
    out.push([
      esc(r.model), esc(r.module), num(s.outputTps), num(s.promptTps), num(s.firstTokenMs),
      usd(c.totalUsd), usd(c.pricedRuns ? c.reportedUsd : null), usd(c.pricedRuns ? c.computedUsd : null),
      String(c.cloudRuns), String(c.unpricedRuns),
      String(s.runs), String(s.coldRuns), String(s.hiddenThinkingRuns)
    ].join(';'))
  }
  return out.join('\n')
}
