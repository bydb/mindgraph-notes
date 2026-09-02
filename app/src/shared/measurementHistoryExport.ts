// Export der Messgeschichte als Markdown und CSV (docs/measurement-history-plan.md § 8).
//
// Dieselben Eimer wie die Diagramme, als Tabelle — für Videofolien, Notizen, Tabellen-
// kalkulation. Die Untergrenzen-Zeichen („≥", „≈") und die N-Spalten reisen mit; eine
// exportierte Zahl ohne ihren Vorbehalt wäre die unehrlichste Form der Weitergabe.

import { formatCostCell, formatTps } from './llmTelemetry'
import { formatMinutes, type CostHistory, type PerformanceSeries, type SavedTimeHistory, type UsageHistory, type Bucket } from './measurementHistory'

export interface HistoryExportInput {
  rangeLabel: string
  bucketLabel: (b: Bucket) => string
  usage: UsageHistory
  cost: CostHistory
  performance: PerformanceSeries[]
  saved: SavedTimeHistory
  /** Referenzminuten je Tätigkeitsart als Text, für die Fußnote („bewertet mit heutiger Referenz"). */
  referenceNote: string
}

const csvEsc = (v: string) => /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
const csvNum = (v: number | null | undefined) => v === null || v === undefined || !Number.isFinite(v) ? '' : String(Math.round(v * 100) / 100).replace('.', ',')

export function historyToMarkdown(input: HistoryExportInput): string {
  const out: string[] = []
  out.push(`# Messgeschichte — ${input.rangeLabel}`, '')

  out.push('## Einsatz', '')
  const models = input.usage.models
  out.push(`| Zeitraum | Aufrufe | lokal | Cloud | ${models.join(' | ')} |`)
  out.push(`|---|---|---|---|${models.map(() => '---').join('|')}|`)
  for (const b of input.usage.buckets) {
    if (b.total === 0) { out.push(`| ${input.bucketLabel(b.bucket)} | — | | | ${models.map(() => '').join(' | ')} |`); continue }
    out.push(`| ${input.bucketLabel(b.bucket)} | ${b.total} | ${b.local} | ${b.cloud} | ${models.map(m => b.byModel[m] ?? '').join(' | ')} |`)
  }
  out.push('', `Gesamt: ${input.usage.total} Aufrufe, davon ${input.usage.local} lokal und ${input.usage.cloud} in der Cloud. „—" = keine Aufrufe, keine Null.`, '')

  out.push('## Kosten und Rechenzeit', '')
  out.push('| Zeitraum | Cloud-Kosten | Cloud-Aufrufe | ohne Preis | Rechenzeit lokal (min) | lokal ohne Zeiten |')
  out.push('|---|---|---|---|---|---|')
  for (const b of input.cost.buckets) {
    if (b.cost.cloudRuns === 0 && b.computeMsTotal === 0 && b.localRunsWithoutTiming === 0) { out.push(`| ${input.bucketLabel(b.bucket)} | — | | | | |`); continue }
    out.push(`| ${input.bucketLabel(b.bucket)} | ${b.cost.cloudRuns ? formatCostCell(b.cost) : '—'} | ${b.cost.cloudRuns || ''} | ${b.cost.unpricedRuns || ''} | ${b.computeMsTotal ? formatMinutes(b.computeMsTotal) : ''} | ${b.localRunsWithoutTiming || ''} |`)
  }
  out.push('', `Gesamt Cloud: ${input.cost.total.cloudRuns ? formatCostCell(input.cost.total) : 'keine Cloud-Aufrufe'}${input.cost.total.unpricedRuns ? ` (${input.cost.total.unpricedRuns} ohne Preis — Untergrenze)` : ''}. Rechenzeit lokal: ${formatMinutes(input.cost.computeMsTotal)} min gemessen${input.cost.localRunsWithoutTiming ? `, ${input.cost.localRunsWithoutTiming} lokale Aufrufe ohne Zeiten` : ''}. Kein Strompreis, keine Schätzung.`, '')

  out.push('## Zeitgewinn (geschätzt)', '')
  out.push('| Zeitraum | Minuten | bewertete Läufe | nicht gemessen |')
  out.push('|---|---|---|---|')
  for (const b of input.saved.buckets) {
    if (b.valuedRuns === 0 && b.saved.unmeasuredRuns === 0) { out.push(`| ${input.bucketLabel(b.bucket)} | — | | |`); continue }
    out.push(`| ${input.bucketLabel(b.bucket)} | ${b.valuedRuns ? Math.round(b.saved.totalMinutes) : '—'} | ${b.valuedRuns} | ${b.saved.unmeasuredRuns || ''} |`)
  }
  out.push('', `Gesamt: ${Math.round(input.saved.total.totalMinutes)} Minuten aus ${input.saved.total.lines.reduce((n, l) => n + l.runs, 0)} bewerteten Läufen; ${input.saved.total.unmeasuredRuns} Läufe nicht gemessen. ${input.referenceNote}`)
  if (input.saved.referenceChanges.length) {
    out.push('', 'Referenz geändert: ' + input.saved.referenceChanges.map(c => `${new Date(c.at).toLocaleDateString()} ${c.activityType} ${c.fromMinutes ?? '—'} → ${c.toMinutes ?? '—'} min`).join('; '))
  }
  if (input.saved.byModel.length) {
    out.push('', '| Tätigkeit | Modell | Läufe | Median aktive Minuten | Mittel |', '|---|---|---|---|---|')
    for (const r of input.saved.byModel) out.push(`| ${r.activityType} | ${r.model} | ${r.runs} | ${Math.round(r.medianActiveMinutes)} | ${Math.round(r.meanActiveMinutes)} |`)
  }
  if (input.saved.byModelHidden) out.push('', `${input.saved.byModelHidden} Modellzeile(n) mit weniger als 3 Läufen nicht gezeigt.`)
  out.push('')

  out.push('## Leistung (Ausgabe-Token/s, Median warmer Läufe)', '')
  const labels = input.usage.buckets.map(b => input.bucketLabel(b.bucket))
  out.push(`| Modell | gesamt | Läufe | ${labels.join(' | ')} |`)
  out.push(`|---|---|---|${labels.map(() => '---').join('|')}|`)
  for (const s of input.performance) {
    const name = `${s.model}${s.hiddenThinking ? ' *' : ''}${s.cloud ? ' (Cloud)' : ''}`
    out.push(`| ${name} | ${s.cloud ? '—' : formatTps(s.overallTps)} | ${s.totalRuns} | ${s.points.map(p => p.outputTps === null ? (p.runs ? `(${p.runs})` : '') : formatTps(p.outputTps)).join(' | ')} |`)
  }
  out.push('', 'Kein Wert unter drei warmen Läufen je Eimer; „(N)" = Läufe vorhanden, aber zu wenige. Kaltstarts sind herausgerechnet. Sternchen: verstecktes Reasoning, Wert zu niedrig. Cloud-Modelle melden keine Serverzeiten.')
  return out.join('\n')
}

export function historyToCsv(input: HistoryExportInput): string {
  const out: string[] = ['Bereich;Zeitraum;Kennzahl;Wert;N;Hinweis']
  for (const b of input.usage.buckets) {
    const label = input.bucketLabel(b.bucket)
    out.push(['Einsatz', label, 'Aufrufe', b.total ? String(b.total) : '', '', b.total ? '' : 'keine Aufrufe'].map(csvEsc).join(';'))
    for (const [m, n] of Object.entries(b.byModel)) out.push(['Einsatz', label, `Aufrufe ${m}`, String(n), '', ''].map(csvEsc).join(';'))
  }
  for (const b of input.cost.buckets) {
    const label = input.bucketLabel(b.bucket)
    if (b.cost.cloudRuns) out.push(['Kosten', label, 'Cloud USD', csvNum(b.cost.totalUsd), String(b.cost.cloudRuns), b.cost.unpricedRuns ? `${b.cost.unpricedRuns} ohne Preis (Untergrenze)` : ''].map(csvEsc).join(';'))
    if (b.computeMsTotal) out.push(['Kosten', label, 'Rechenzeit lokal min', csvNum(b.computeMsTotal / 60_000), '', b.localRunsWithoutTiming ? `${b.localRunsWithoutTiming} ohne Zeiten` : ''].map(csvEsc).join(';'))
  }
  for (const b of input.saved.buckets) {
    const label = input.bucketLabel(b.bucket)
    if (b.valuedRuns) out.push(['Zeitgewinn', label, 'Minuten (geschätzt)', csvNum(b.saved.totalMinutes), String(b.valuedRuns), b.saved.unmeasuredRuns ? `${b.saved.unmeasuredRuns} nicht gemessen` : ''].map(csvEsc).join(';'))
  }
  for (const s of input.performance) {
    s.points.forEach((p, i) => {
      if (p.outputTps === null) return
      out.push(['Leistung', input.bucketLabel(input.usage.buckets[i].bucket), `Tok/s ${s.model}${s.hiddenThinking ? ' *' : ''}`, csvNum(p.outputTps), String(p.runs), p.coldRuns ? `${p.coldRuns} Kaltstarts herausgerechnet` : ''].map(csvEsc).join(';'))
    })
  }
  return out.join('\n')
}
