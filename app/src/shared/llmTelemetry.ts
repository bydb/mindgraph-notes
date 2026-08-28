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

/** Ein einzelner Modell-Lauf. Zeiten in Millisekunden, nicht Nanosekunden. */
export interface LlmRunMetrics {
  at: number                  // Zeitstempel des Laufs (Date.now())
  module: string              // 'task-extraction', 'note-agent', 'chat', …
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
  meta: { module: string; model: string; wallMs: number; at: number; backend?: LlmBackendId; firstTokenMs?: number; hiddenThinking?: boolean; executionProfile?: string }
): LlmRunMetrics {
  return {
    at: meta.at,
    module: meta.module,
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
    module: string; model: string; wallMs: number; at: number
    backend: LlmBackendId; pricing?: ModelPricing | null
    firstTokenMs?: number; executionProfile?: string
  }
): LlmRunMetrics {
  const cost = callCostUsd(usage, meta.pricing)
  return {
    at: meta.at,
    module: meta.module,
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
  module: string
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
    const key = `${run.model} ${run.module}`
    const list = groups.get(key)
    if (list) list.push(run)
    else groups.set(key, [run])
  }
  const rows: LlmComparisonRow[] = []
  for (const [key, list] of groups) {
    const [model, module] = key.split(' ')
    rows.push({ model, module, summary: summarize(list), cost: summarizeCost(list) })
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
export function formatCostCell(cost: LlmCostSummary): string {
  if (cost.cloudRuns === 0) return 'lokal'
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
