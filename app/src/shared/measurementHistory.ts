// Messgeschichte — reine Auswertelogik über Zeiträume (docs/measurement-history-plan.md § 8).
//
// Vier Fragen, eine Zeitachse: Einsatz, Kosten, Zeitgewinn, Leistung. Alles hier ist
// Rechnen ohne IPC, ohne React, ohne Elektron — damit es testbar bleibt und die Regeln
// aus § 6 an EINER Stelle stehen:
//
//   - Tage ohne Daten sind Lücken, keine Nullen (ein Eimer ohne Aufrufe hat `runs: 0`
//     und `null`-Werte, nie 0 Token/s).
//   - N steht neben jeder aggregierten Zahl.
//   - Kein Punkt unter N = 3 (MIN_POINT_RUNS), weder Zeitgewinn noch Leistung.
//   - Untergrenzen heißen Untergrenzen (unpricedRuns > 0 → „≥").
//   - Die App zieht keinen Schluss: hier gibt es keine „beste" Zeile.
//
// Wiederverwendet wird, was es gibt: summarize/summarizeCost/isColdStart aus
// llmTelemetry.ts, summarizeActivity/estimateSavedMinutes aus activityLog.ts. Nichts
// davon ist hier dupliziert.

import {
  isColdStart, median, summarize, summarizeCost, outputTokensPerSecond,
  type LlmRunMetrics, type LlmCostSummary, type LlmModuleId,
} from './llmTelemetry'
import {
  estimateSavedMinutes, summarizeActivity,
  type ActivityEvent, type ActivitySummary, type ActivityType, type ReferenceMinutes, type SavedTime, type ModelComparisonRow,
} from './activityLog'

export type HistoryRange = 'today' | '7d' | '30d' | '12m'
export type BucketGrain = 'hour' | 'day' | 'week' | 'month'

/** Unter drei Läufen kein Punkt — dieselbe Grenze wie MIN_CASES_PER_ARM im Vergleichsmodus. */
export const MIN_POINT_RUNS = 3

export interface Bucket {
  from: number
  /** exklusiv */
  to: number
  grain: BucketGrain
}

// ─── Zeitraum → Eimer ────────────────────────────────────────────────────────

function startOfLocalDay(ms: number): Date {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Montag 00:00 lokal der Woche, in der `ms` liegt. */
function startOfLocalWeek(ms: number): Date {
  const d = startOfLocalDay(ms)
  const dow = (d.getDay() + 6) % 7 // Mo=0 … So=6
  d.setDate(d.getDate() - dow)
  return d
}

function startOfLocalMonth(ms: number): Date {
  const d = startOfLocalDay(ms)
  d.setDate(1)
  return d
}

function stepBucket(start: Date, grain: BucketGrain): Date {
  const d = new Date(start.getTime())
  switch (grain) {
    case 'hour': d.setHours(d.getHours() + 1); break
    case 'day': d.setDate(d.getDate() + 1); break
    case 'week': d.setDate(d.getDate() + 7); break
    case 'month': d.setMonth(d.getMonth() + 1); break
  }
  return d
}

/**
 * Zeitraum und Körnung für den Umschalter. Der Zeitraum endet immer am Ende des heutigen
 * Tages (lokal), damit die letzte Säule „heute" ist und nicht mitten im Tag abbricht.
 *
 *   heute    → Stunden-Eimer des heutigen Tages
 *   7 Tage   → 7 Tages-Eimer, heute eingeschlossen
 *   30 Tage  → 30 Tages-Eimer
 *   12 Monate → 12 Monats-Eimer, angefangen beim Monatsersten vor elf Monaten
 */
export function rangeBounds(range: HistoryRange, nowMs: number): { from: number; to: number; grain: BucketGrain } {
  const todayStart = startOfLocalDay(nowMs)
  const tomorrow = stepBucket(todayStart, 'day')
  switch (range) {
    case 'today':
      return { from: todayStart.getTime(), to: tomorrow.getTime(), grain: 'hour' }
    case '7d': {
      const from = new Date(todayStart.getTime()); from.setDate(from.getDate() - 6)
      return { from: from.getTime(), to: tomorrow.getTime(), grain: 'day' }
    }
    case '30d': {
      const from = new Date(todayStart.getTime()); from.setDate(from.getDate() - 29)
      return { from: from.getTime(), to: tomorrow.getTime(), grain: 'day' }
    }
    case '12m': {
      const from = startOfLocalMonth(nowMs); from.setMonth(from.getMonth() - 11)
      const to = stepBucket(startOfLocalMonth(nowMs), 'month')
      return { from: from.getTime(), to: to.getTime(), grain: 'month' }
    }
  }
}

/** Eimer lückenlos von `from` bis `to`; Wochen beginnen montags, alles in lokaler Zeit. */
export function buildBuckets(from: number, to: number, grain: BucketGrain): Bucket[] {
  let start: Date
  switch (grain) {
    case 'hour': { start = new Date(from); start.setMinutes(0, 0, 0); break }
    case 'day': start = startOfLocalDay(from); break
    case 'week': start = startOfLocalWeek(from); break
    case 'month': start = startOfLocalMonth(from); break
  }
  const out: Bucket[] = []
  while (start.getTime() < to) {
    const next = stepBucket(start, grain)
    out.push({ from: start.getTime(), to: Math.min(next.getTime(), to), grain })
    start = next
  }
  return out
}

function inBucket(at: number, b: Bucket): boolean {
  return at >= b.from && at < b.to
}

// ─── Einsatz ─────────────────────────────────────────────────────────────────

export interface UsageBucket {
  bucket: Bucket
  total: number
  local: number
  cloud: number
  byModel: Record<string, number>
  byModule: Partial<Record<LlmModuleId, number>>
}

export interface UsageHistory {
  buckets: UsageBucket[]
  /** Modelle nach Häufigkeit im Zeitraum, absteigend — bestimmt Farbe und Stapelreihenfolge. */
  models: string[]
  modules: LlmModuleId[]
  total: number
  local: number
  cloud: number
}

export function isCloudBackend(run: LlmRunMetrics): boolean {
  return run.backend === 'openrouter' || run.backend === 'llmbase'
}

export function bucketUsage(runs: LlmRunMetrics[], buckets: Bucket[]): UsageHistory {
  const modelCount = new Map<string, number>()
  const moduleCount = new Map<LlmModuleId, number>()
  const out: UsageBucket[] = buckets.map(b => ({ bucket: b, total: 0, local: 0, cloud: 0, byModel: {}, byModule: {} }))
  let total = 0, local = 0, cloud = 0
  for (const r of runs) {
    const ub = out.find(u => inBucket(r.at, u.bucket))
    if (!ub) continue
    ub.total += 1; total += 1
    if (isCloudBackend(r)) { ub.cloud += 1; cloud += 1 } else { ub.local += 1; local += 1 }
    ub.byModel[r.model] = (ub.byModel[r.model] ?? 0) + 1
    ub.byModule[r.module] = (ub.byModule[r.module] ?? 0) + 1
    modelCount.set(r.model, (modelCount.get(r.model) ?? 0) + 1)
    moduleCount.set(r.module, (moduleCount.get(r.module) ?? 0) + 1)
  }
  const byCountDesc = <K,>(m: Map<K, number>): K[] => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(e => e[0])
  return { buckets: out, models: byCountDesc(modelCount), modules: byCountDesc(moduleCount), total, local, cloud }
}

// ─── Kosten und Rechenzeit ───────────────────────────────────────────────────

export interface CostBucket {
  bucket: Bucket
  cost: LlmCostSummary
  /** Gemessene Rechenzeit lokaler Aufrufe je Modell, ms. Kein Strompreis, keine Schätzung. */
  computeMsByModel: Record<string, number>
  computeMsTotal: number
  /** Lokale Aufrufe, die keine Zeiten gemeldet haben (Embeddings, Bilder) — Rechenzeit ist dann eine Untergrenze. */
  localRunsWithoutTiming: number
}

export interface CostHistory {
  buckets: CostBucket[]
  total: LlmCostSummary
  computeMsTotal: number
  localRunsWithoutTiming: number
  /** Lokale Modelle nach Rechenzeit, absteigend. */
  localModels: string[]
}

export function computeMsOf(run: LlmRunMetrics): number | null {
  if (isCloudBackend(run)) return null
  if (typeof run.promptEvalMs !== 'number' && typeof run.evalMs !== 'number') return null
  return (run.promptEvalMs ?? 0) + (run.evalMs ?? 0)
}

export function bucketCost(runs: LlmRunMetrics[], buckets: Bucket[]): CostHistory {
  const perModel = new Map<string, number>()
  let computeMsTotal = 0, localRunsWithoutTiming = 0
  const out: CostBucket[] = buckets.map(b => {
    const inside = runs.filter(r => inBucket(r.at, b))
    const computeMsByModel: Record<string, number> = {}
    let sum = 0, missing = 0
    for (const r of inside) {
      if (isCloudBackend(r)) continue
      const ms = computeMsOf(r)
      if (ms === null) { missing += 1; continue }
      computeMsByModel[r.model] = (computeMsByModel[r.model] ?? 0) + ms
      perModel.set(r.model, (perModel.get(r.model) ?? 0) + ms)
      sum += ms
    }
    computeMsTotal += sum; localRunsWithoutTiming += missing
    return { bucket: b, cost: summarizeCost(inside), computeMsByModel, computeMsTotal: sum, localRunsWithoutTiming: missing }
  })
  const inRange = runs.filter(r => buckets.some(b => inBucket(r.at, b)))
  return {
    buckets: out,
    total: summarizeCost(inRange),
    computeMsTotal,
    localRunsWithoutTiming,
    localModels: [...perModel.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]),
  }
}

// ─── Leistung ────────────────────────────────────────────────────────────────

export interface PerformancePoint {
  bucket: Bucket
  /** Median der Ausgabe-Token/s über die warmen Läufe des Eimers; null = kein Punkt (N < 3 oder keine Messung). */
  outputTps: number | null
  runs: number
  coldRuns: number
}

export interface PerformanceSeries {
  model: string
  /** true = Läufe mit verstecktem Reasoning; eigene Linie, nie mit sichtbaren gemischt. */
  hiddenThinking: boolean
  /** Cloud-Modelle melden keine Serverzeiten — dort gibt es keine Token/s, nur Wanduhrzeit. */
  cloud: boolean
  points: PerformancePoint[]
  /** Median über den ganzen Zeitraum (warme Läufe), für die Legende. */
  overallTps: number | null
  totalRuns: number
}

export function bucketPerformance(runs: LlmRunMetrics[], buckets: Bucket[], minRuns: number = MIN_POINT_RUNS): PerformanceSeries[] {
  const groups = new Map<string, LlmRunMetrics[]>()
  for (const r of runs) {
    if (!buckets.some(b => inBucket(r.at, b))) continue
    const key = `${r.model} ${r.hiddenThinking ? 1 : 0}`
    const list = groups.get(key)
    if (list) list.push(r); else groups.set(key, [r])
  }
  const series: PerformanceSeries[] = []
  for (const list of groups.values()) {
    const cloud = isCloudBackend(list[0])
    const points: PerformancePoint[] = buckets.map(b => {
      const inside = list.filter(r => inBucket(r.at, b))
      const warm = inside.filter(r => !isColdStart(r))
      const tpsValues = warm.map(outputTokensPerSecond).filter((v): v is number => v !== null)
      const enough = tpsValues.length >= minRuns
      return { bucket: b, outputTps: enough ? median(tpsValues) : null, runs: inside.length, coldRuns: inside.length - warm.length }
    })
    series.push({
      model: list[0].model,
      hiddenThinking: !!list[0].hiddenThinking,
      cloud,
      points,
      overallTps: summarize(list).outputTps,
      totalRuns: list.length,
    })
  }
  // Häufigste zuerst — Farbe folgt dem Modell, nicht seinem Rang (Zuweisung beim Aufrufer).
  return series.sort((a, b) => b.totalRuns - a.totalRuns || a.model.localeCompare(b.model))
}

// ─── Zeitgewinn ──────────────────────────────────────────────────────────────

export interface SavedTimeBucket {
  bucket: Bucket
  summary: ActivitySummary
  saved: SavedTime
  /** Läufe mit Übernahme UND Messung — die Grundlage der Minuten. 0 = kein Balken, kein „0 min". */
  valuedRuns: number
}

export interface ReferenceChange {
  at: number
  activityType: ActivityType
  fromMinutes: number | null
  toMinutes: number | null
}

export interface SavedTimeHistory {
  buckets: SavedTimeBucket[]
  /** Über den ganzen Zeitraum, mit derselben (heutigen) Referenz. */
  total: SavedTime
  totalSummary: ActivitySummary
  /** Je Tätigkeitsart und Modell — nur Zeilen mit mindestens MIN_POINT_RUNS Läufen. */
  byModel: ModelComparisonRow[]
  /** Zeilen, die wegen N < 3 nicht gezeigt werden — gezählt, damit die Lücke benannt ist. */
  byModelHidden: number
  referenceChanges: ReferenceChange[]
}

export function bucketSavedTime(
  events: ActivityEvent[],
  buckets: Bucket[],
  reference: ReferenceMinutes,
  minRuns: number = MIN_POINT_RUNS
): SavedTimeHistory {
  // Immer mit ALLEN Ereignissen rechnen — die Übernahme kann in einem anderen Eimer
  // liegen als das Lauf-Ende (siehe summarizeActivity).
  const out: SavedTimeBucket[] = buckets.map(b => {
    const summary = summarizeActivity(events, { from: b.from, to: b.to })
    const saved = estimateSavedMinutes(summary, reference)
    return { bucket: b, summary, saved, valuedRuns: saved.lines.reduce((n, l) => n + l.runs, 0) }
  })
  const from = buckets[0]?.from ?? 0
  const to = buckets[buckets.length - 1]?.to ?? 0
  const totalSummary = summarizeActivity(events, { from, to })
  const total = estimateSavedMinutes(totalSummary, reference)
  const byModel = total.byModel.filter(r => r.runs >= minRuns)
  const referenceChanges: ReferenceChange[] = events
    .filter((e): e is Extract<ActivityEvent, { kind: 'reference-changed' }> => e.kind === 'reference-changed' && e.at >= from && e.at < to)
    .map(e => ({ at: e.at, activityType: e.activityType, fromMinutes: e.fromMinutes, toMinutes: e.toMinutes }))
    .sort((a, b) => a.at - b.at)
  return { buckets: out, total, totalSummary, byModel, byModelHidden: total.byModel.length - byModel.length, referenceChanges }
}

// ─── Formatierung, die Main und Renderer teilen ──────────────────────────────

/** Minuten aus ms, für Rechenzeit: unter einer Minute mit einer Nachkommastelle. */
export function formatMinutes(ms: number): string {
  const min = ms / 60_000
  if (min < 1) return min.toFixed(1)
  return String(Math.round(min))
}
