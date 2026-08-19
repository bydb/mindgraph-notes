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

export type LlmBackendId = 'ollama' | 'lmstudio' | 'openrouter' | 'llmbase'

/** Ein einzelner Modell-Lauf. Zeiten in Millisekunden, nicht Nanosekunden. */
export interface LlmRunMetrics {
  at: number                  // Zeitstempel des Laufs (Date.now())
  module: string              // 'task-extraction', 'note-agent', 'chat', …
  model: string
  backend: LlmBackendId
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
  meta: { module: string; model: string; wallMs: number; at: number; backend?: LlmBackendId; firstTokenMs?: number; hiddenThinking?: boolean }
): LlmRunMetrics {
  return {
    at: meta.at,
    module: meta.module,
    model: meta.model,
    backend: meta.backend ?? 'ollama',
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
