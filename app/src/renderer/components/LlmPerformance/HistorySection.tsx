// Messgeschichte im Leistungsfenster: Einsatz, Kosten, Zeitgewinn, Leistung über einen
// wählbaren Zeitraum (docs/measurement-history-plan.md § 5).
//
// Daten kommen aus zwei Logbüchern des Main-Prozesses, beide nur lesend:
//   - Telemetrie-Logbuch (userData/telemetry) über `getLlmTelemetryRange`
//   - Tätigkeitsprotokoll (userData/activity) über `activityEvents`
// Gerechnet wird hier im Render mit useMemo — die reinen Funktionen liegen in
// shared/measurementHistory.ts und sind dort getestet. Dieser Baustein zeichnet nur.
//
// Farbe folgt dem Modell, nicht dem Rang: Die Farbliste wird einmal je Zeitraum aus der
// Einsatz-Häufigkeit gebildet und in allen vier Ansichten benutzt. Ab dem neunten Modell
// heißt es „Andere".

import { useEffect, useMemo, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import { ACTIVITY_TYPE_LABEL_KEY, jobLines } from '../../utils/impactText'
import { formatCostCell, formatTps, type LlmRunMetrics } from '../../../shared/llmTelemetry'
import { formatUsd } from '../../../shared/llmCost'
import type { ActivityEvent, ValuedType, ReferenceMinutes, ReferenceSources, ActivitySummary } from '../../../shared/activityLog'
import {
  rangeBounds, buildBuckets, bucketUsage, bucketCost, bucketPerformance, bucketSavedTime, formatMinutes, MIN_POINT_RUNS,
  type HistoryRange, type Bucket,
} from '../../../shared/measurementHistory'
import { historyToMarkdown, historyToCsv } from '../../../shared/measurementHistoryExport'
import { StackedBars, SignedBars, LineChart, DotPlot, Legend, seriesColor, MAX_SERIES, type LegendItem } from '../Shared/charts/charts'
import './HistorySection.css'

const RANGES: HistoryRange[] = ['today', '7d', '30d', '12m']
const RANGE_KEY: Record<HistoryRange, TranslationKey> = {
  today: 'llmPerf.range.today', '7d': 'llmPerf.range.7d', '30d': 'llmPerf.range.30d', '12m': 'llmPerf.range.12m',
}
// Schluessel fuer 'Andere' - kann kein Modellname sein (Ollama-Tags enthalten keine Leerzeichen).
const OTHER_KEY = ' other'

type T = (key: TranslationKey, params?: Record<string, string | number>) => string

function bucketLabel(b: Bucket, lang: string): string {
  const d = new Date(b.from)
  const loc = lang === 'de' ? 'de-DE' : 'en-US'
  switch (b.grain) {
    case 'hour': return `${d.getHours()}h`
    case 'day': return d.toLocaleDateString(loc, { day: 'numeric', month: 'numeric' })
    case 'week': return d.toLocaleDateString(loc, { day: 'numeric', month: 'numeric' })
    case 'month': return d.toLocaleDateString(loc, { month: 'short' })
  }
}

function bucketTitle(b: Bucket, lang: string, t: T): string {
  const loc = lang === 'de' ? 'de-DE' : 'en-US'
  const d = new Date(b.from)
  switch (b.grain) {
    case 'hour': return `${d.toLocaleDateString(loc)} ${d.getHours()}:00–${d.getHours() + 1}:00`
    case 'day': return d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'long' })
    case 'week': return t('llmPerf.history.weekOf', { date: d.toLocaleDateString(loc, { day: 'numeric', month: 'numeric' }) })
    case 'month': return d.toLocaleDateString(loc, { month: 'long', year: 'numeric' })
  }
}

export function HistorySection() {
  const { t, language } = useTranslation()
  const vaultPath = useNotesStore(s => s.vaultPath)
  const referenceMinutes = useUIStore(s => s.impact.referenceMinutes)
  const referenceSources = useUIStore(s => s.impact.referenceSources)
  const hourlyRate = useUIStore(s => s.impact.hourlyRate)
  const currency = useUIStore(s => s.impact.currency)
  const [range, setRange] = useState<HistoryRange>('7d')
  const [runs, setRuns] = useState<LlmRunMetrics[] | null>(null)
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [oldestRunAt, setOldestRunAt] = useState<number | null>(null)
  const [copied, setCopied] = useState<'md' | 'csv' | null>(null)
  // Zählt hoch, wenn Main einen neuen Aufruf oder ein neues Ereignis meldet — die einzige
  // Quelle für ein Nachladen. Ohne sie blieb eine offene Historie während einer Vorführung
  // auf dem Stand des Öffnens, während die Sitzungstabelle darunter längst weiter war.
  const [tick, setTick] = useState(0)

  // Zeitraum-Grenzen je Auswahl und je Nachladen — `now` wird dabei mit erneuert, sonst
  // fehlt nach Mitternacht der neue Tag.
  const bounds = useMemo(() => rangeBounds(range, Date.now()), [range, tick])
  const buckets = useMemo(() => buildBuckets(bounds.from, bounds.to, bounds.grain), [bounds])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // Entprellt: Ein Agentenlauf schreibt mehrere Aufrufe und zwei Ereignisse binnen
    // Sekunden. Beide Logbücher hängen in Main an einer Warteschlange, ein Lesen nach
    // der Meldung sieht den gemeldeten Eintrag also bereits.
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => setTick(n => n + 1), 500) }
    const offActivity = window.electronAPI.onActivityChanged(payload => {
      if (!payload?.vaultPath || payload.vaultPath === vaultPath) bump()
    })
    const offRun = window.electronAPI.onLlmTelemetryRun(() => bump())
    return () => { clearTimeout(timer); offActivity?.(); offRun?.() }
  }, [vaultPath])

  useEffect(() => {
    let cancelled = false
    setRuns(null)
    window.electronAPI.getLlmTelemetryRange({ from: bounds.from, to: bounds.to })
      .then(r => { if (!cancelled) setRuns(r) })
      .catch(() => { if (!cancelled) setRuns([]) })
    return () => { cancelled = true }
  }, [bounds])

  useEffect(() => {
    let cancelled = false
    window.electronAPI.getLlmTelemetryOldestAt()
      .then(at => { if (!cancelled) setOldestRunAt(typeof at === 'number' ? at : null) })
      .catch(() => { if (!cancelled) setOldestRunAt(null) })
    return () => { cancelled = true }
  }, [bounds])

  useEffect(() => {
    let cancelled = false
    if (!vaultPath) { setEvents([]); return }
    setEvents(null)
    window.electronAPI.activityEvents(vaultPath)
      .then(res => { if (!cancelled) setEvents(res.success && res.events ? res.events : []) })
      .catch(() => { if (!cancelled) setEvents([]) })
    return () => { cancelled = true }
  }, [vaultPath, bounds])

  const usage = useMemo(() => bucketUsage(runs ?? [], buckets), [runs, buckets])
  const cost = useMemo(() => bucketCost(runs ?? [], buckets), [runs, buckets])
  const performance = useMemo(() => bucketPerformance(runs ?? [], buckets), [runs, buckets])
  const saved = useMemo(() => bucketSavedTime(events ?? [], buckets, referenceMinutes), [events, buckets, referenceMinutes])
  // Ab wann die beiden Logbücher überhaupt Daten haben. Beide beginnen mit der
  // Installation der Version, die sie schreibt — das Tätigkeitsprotokoll früher als das
  // Telemetrie-Logbuch. Eine 12-Monats-Ansicht über ein zwei Wochen altes Logbuch muss
  // das sagen, sonst liest man leere Monate als „nichts gemacht".
  const oldestEventAt = useMemo(() => {
    if (!events || events.length === 0) return null
    let min = Infinity
    for (const e of events) if (e.at < min) min = e.at
    return min
  }, [events])

  // Farbe je Modell, einmal je Zeitraum, nach Einsatz-Häufigkeit.
  const colorIndex = useMemo(() => new Map(usage.models.map((m, i) => [m, i] as const)), [usage.models])
  const colorOf = (key: string) => key === OTHER_KEY ? seriesColor(MAX_SERIES) : seriesColor(colorIndex.get(key) ?? MAX_SERIES)
  const labelOf = (key: string) => key === OTHER_KEY ? t('llmPerf.history.otherModels') : key
  const foldKey = (model: string) => (colorIndex.get(model) ?? MAX_SERIES) < MAX_SERIES ? model : OTHER_KEY
  // Stapel in JEDEM Balken gleich geordnet (häufigstes Modell unten), sonst springt eine
  // Farbe zwischen den Säulen hin und her und das Auge liest Bewegung, wo keine ist.
  const stackOrder = (a: { key: string }, b: { key: string }) =>
    (a.key === OTHER_KEY ? MAX_SERIES : colorIndex.get(a.key) ?? MAX_SERIES) - (b.key === OTHER_KEY ? MAX_SERIES : colorIndex.get(b.key) ?? MAX_SERIES)

  const label = (b: Bucket) => bucketLabel(b, language)
  const title = (b: Bucket) => bucketTitle(b, language, t)
  const loading = runs === null || events === null

  const copy = async (kind: 'md' | 'csv') => {
    const input = {
      rangeLabel: t(RANGE_KEY[range]), bucketLabel: label, usage, cost, performance, saved,
      referenceNote: `${referenceNoteText(referenceMinutes, referenceSources, t)} ${t('llmPerf.history.foregroundNote')}${saved.total.correctedRuns > 0 ? ` ${t(saved.total.correctedRuns === 1 ? 'llmPerf.history.correctedOne' : 'llmPerf.history.corrected', { n: saved.total.correctedRuns, minutes: Math.round(saved.total.correctedMs / 60_000) })}` : ''}`,
    }
    await window.electronAPI.clipboardWriteText(kind === 'md' ? historyToMarkdown(input) : historyToCsv(input))
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 2000)
  }

  // ── Einsatz ──
  const usageBuckets = usage.buckets.map(b => {
    const folded = new Map<string, number>()
    for (const [m, n] of Object.entries(b.byModel)) folded.set(foldKey(m), (folded.get(foldKey(m)) ?? 0) + n)
    return { label: label(b.bucket), title: title(b.bucket), segments: [...folded.entries()].map(([key, value]) => ({ key, value })).sort(stackOrder) }
  })
  const usageLegend: LegendItem[] = usage.models.slice(0, MAX_SERIES).map(m => ({ key: m, label: m, color: colorOf(m), value: String(runsOfModel(usage, m)) }))
  if (usage.models.length > MAX_SERIES) usageLegend.push({ key: OTHER_KEY, label: labelOf(OTHER_KEY), color: colorOf(OTHER_KEY) })

  // ── Kosten ──
  const cloudBuckets = cost.buckets.map(b => ({
    label: label(b.bucket), title: title(b.bucket),
    value: b.cost.cloudRuns === 0 ? null : (b.cost.totalUsd ?? 0),
    hatched: b.cost.unpricedRuns > 0 || b.cost.computedUsd > 0,
    note: costNote(b.cost.cloudRuns, b.cost.unpricedRuns, b.cost.computedUsd, t),
  }))
  const computeBuckets = cost.buckets.map(b => {
    const folded = new Map<string, number>()
    for (const [m, ms] of Object.entries(b.computeMsByModel)) folded.set(foldKey(m), (folded.get(foldKey(m)) ?? 0) + ms / 60_000)
    return { label: label(b.bucket), title: title(b.bucket), segments: [...folded.entries()].map(([key, value]) => ({ key, value: Math.round(value * 10) / 10 })).sort(stackOrder) }
  })
  const computeLegend: LegendItem[] = cost.localModels.filter(m => (colorIndex.get(m) ?? MAX_SERIES) < MAX_SERIES)
    .map(m => ({ key: m, label: m, color: colorOf(m), value: `${formatMinutes(sumCompute(cost, m))} min` }))

  // ── Zeitgewinn ──
  const changeByBucket = new Map<number, string[]>()
  for (const c of saved.referenceChanges) {
    const idx = buckets.findIndex(b => c.at >= b.from && c.at < b.to)
    if (idx < 0) continue
    const line = `${t(ACTIVITY_TYPE_LABEL_KEY[c.activityType])}: ${c.fromMinutes ?? '—'} → ${c.toMinutes ?? '—'} min`
    changeByBucket.set(idx, [...(changeByBucket.get(idx) ?? []), line])
  }
  const savedBuckets = saved.buckets.map((b, i) => ({
    label: label(b.bucket), title: title(b.bucket),
    // Ein Eimer mit ausschließlich Fehlversuchen ist ein Minus, keine Lücke.
    value: b.valuedRuns + b.saved.wastedRuns === 0 ? null : b.saved.totalMinutes,
    note: savedNote(b.valuedRuns, b.saved.wastedRuns, wastedMinutesOf(b.saved), b.saved.unmeasuredRuns, t),
    marker: changeByBucket.has(i) ? `${t('llmPerf.history.referenceChanged')}\n${changeByBucket.get(i)!.join('\n')}` : undefined,
  }))
  const valuedTotal = saved.total.lines.reduce((n, l) => n + l.runs, 0)
  const wastedTotal = saved.total.wastedRuns
  const wastedMinutesTotal = wastedMinutesOf(saved.total)
  // Minuten gibt es, sobald irgendein Lauf bewertet ist — auch wenn es nur Fehlversuche sind.
  const valuedAny = valuedTotal + wastedTotal > 0
  const loc = language === 'de' ? 'de-DE' : 'en-US'
  // Zeitwert = Szenariorechnung mit dem eingetragenen Stundensatz, kein Geldfluss. Eine
  // Nettozeile gegen die USD-Ausgaben gibt es nur in derselben Währung — ein Wechselkurs
  // wäre eine dritte, ungemessene Zahl.
  const currencyCode = (currency ?? 'EUR').toUpperCase()
  const money = (value: number): string => {
    try { return new Intl.NumberFormat(loc, { style: 'currency', currency: currencyCode }).format(value) }
    catch { return `${value.toFixed(2)} ${currencyCode}` }
  }
  const timeValue = typeof hourlyRate === 'number' && hourlyRate > 0 && valuedAny
    ? money(saved.total.totalMinutes / 60 * hourlyRate) : null
  // Der Saldo erbt die Vorbehalte der Ausgaben (Review F11): Aufrufe ohne Preis machen die
  // Ausgaben zur Untergrenze und den Saldo damit zur OBERGRENZE („≤"); gerechnete Kosten
  // machen ihn zur Schätzung („≈"). Beides steht am Wert, nicht nur im Kleingedruckten.
  const netMoneyRaw = timeValue !== null && currencyCode === 'USD' && cost.total.cloudRuns > 0 && typeof cost.total.totalUsd === 'number'
    ? saved.total.totalMinutes / 60 * (hourlyRate ?? 0) - cost.total.totalUsd : null
  const netMoney = netMoneyRaw === null ? null
    : `${cost.total.unpricedRuns > 0 ? '≤ ' : cost.total.computedUsd > 0 ? '≈ ' : ''}${money(netMoneyRaw)}`
  const netMoneyNote = netMoneyRaw === null ? null
    : cost.total.unpricedRuns > 0 ? t('llmPerf.benefit.netUpperBound', { n: cost.total.unpricedRuns })
    : cost.total.computedUsd > 0 ? t('llmPerf.benefit.netComputed') : null
  const benefitLines = [
    saved.totalSummary.acceptedTotal > 0 ? t('llmPerf.benefit.acceptedResults', { n: saved.totalSummary.acceptedTotal }) : null,
    saved.totalSummary.emailTasks > 0 ? t('llmPerf.benefit.emailTasks', { n: saved.totalSummary.emailTasks, emails: saved.totalSummary.emailsAnalyzed }) : null,
    ...jobLines(saved.totalSummary, t),
    wastedTotal > 0 ? t('llmPerf.history.wasted', { n: wastedTotal, minutes: wastedMinutesTotal }) : null,
    saved.total.unmeasuredRuns > 0 ? t('llmPerf.history.unmeasured', { n: saved.total.unmeasuredRuns }) : null,
    saved.total.unpricedTypes.length > 0 ? t('llmPerf.history.noReference', { types: saved.total.unpricedTypes.map(ty => t(ACTIVITY_TYPE_LABEL_KEY[ty])).join(', ') }) : null,
  ].filter((s): s is string => s !== null)
  const coverage = [
    oldestRunAt !== null && oldestRunAt > bounds.from ? t('llmPerf.history.coverageCalls', { date: new Date(oldestRunAt).toLocaleDateString(loc) }) : null,
    oldestEventAt !== null && oldestEventAt > bounds.from ? t('llmPerf.history.coverageRuns', { date: new Date(oldestEventAt).toLocaleDateString(loc) }) : null,
  ].filter((s): s is string => s !== null)
  const dotRows = groupByType(saved.byModel).map(([type, rows]) => ({
    key: type, label: t(ACTIVITY_TYPE_LABEL_KEY[type]),
    dots: rows.map(r => ({ key: r.model, value: r.medianActiveMinutes, n: r.runs, title: `${t(ACTIVITY_TYPE_LABEL_KEY[type])} · ${r.model}` })),
  }))
  const dotModels = [...new Set(saved.byModel.map(r => r.model))]
  const dotLegend: LegendItem[] = dotModels.map(m => ({ key: m, label: m, color: colorOf(m) }))

  // ── Leistung ──
  const perfSeries = performance.filter(s => !s.cloud && (colorIndex.get(s.model) ?? MAX_SERIES) < MAX_SERIES)
  const perfLines = perfSeries.map(s => ({
    key: `${s.model}${s.hiddenThinking ? '*' : ''}`,
    label: `${s.model}${s.hiddenThinking ? ' *' : ''}`,
    color: colorOf(s.model),
    dashed: s.hiddenThinking,
    points: s.points.map(p => ({ value: p.outputTps, title: `${title(p.bucket)}${p.coldRuns ? `\n${t('llmPerf.history.coldExcluded', { n: p.coldRuns })}` : ''}\nN = ${p.runs}` })),
  }))
  const perfLegend: LegendItem[] = perfSeries.map(s => ({
    key: `${s.model}${s.hiddenThinking ? '*' : ''}`, label: `${s.model}${s.hiddenThinking ? ' *' : ''}`,
    color: colorOf(s.model), line: true, dashed: s.hiddenThinking,
    value: `${formatTps(s.overallTps)} ${t('llmPerf.history.tpsShort')} · N = ${s.totalRuns}`,
  }))
  const cloudSeries = performance.filter(s => s.cloud)
  const perfHiddenSmall = performance.filter(s => !s.cloud).length - perfSeries.length

  const empty = !loading && usage.total === 0 && saved.totalSummary.runsFinished === 0 && saved.totalSummary.emailRuns === 0

  return (
    <section className="llmhist">
      <div className="llmhist-toolbar">
        <div className="llmhist-ranges" role="tablist">
          {RANGES.map(r => (
            <button key={r} role="tab" aria-selected={r === range} className={r === range ? 'is-active' : ''} onClick={() => setRange(r)}>
              {t(RANGE_KEY[r])}
            </button>
          ))}
        </div>
        <div className="llmhist-export">
          <button onClick={() => copy('md')} disabled={loading}>{copied === 'md' ? t('llmPerf.copied') : t('llmPerf.copyMarkdown')}</button>
          <button onClick={() => copy('csv')} disabled={loading}>{copied === 'csv' ? t('llmPerf.copied') : t('llmPerf.copyCsv')}</button>
        </div>
      </div>

      {loading && <p className="viz-empty">{t('llmPerf.history.loading')}</p>}
      {empty && <p className="viz-empty">{t('llmPerf.history.empty')}</p>}

      {!loading && !empty && (
        <>
          {coverage.length > 0 && <p className="llmhist-foot llmhist-coverage">{coverage.join(' ')}</p>}

          {/* Nutzenbilanz — Ergebnisse und Netto-Zeit zuerst, die technischen Blöcke danach. */}
          <div className="llmhist-block llmhist-benefit">
            <header>
              <h2>{t('llmPerf.benefit.title')}</h2>
              <p className="llmhist-stats">
                <span><b>{valuedAny ? `${Math.round(saved.total.totalMinutes)} min` : '—'}</b> {t('llmPerf.benefit.net')}</span>
                {timeValue !== null && <span><b>{timeValue}</b> {t('llmPerf.benefit.timeValue', { rate: hourlyRate ?? 0, cur: currencyCode })}</span>}
                <span><b>{cost.total.cloudRuns ? formatCostCell(cost.total, { local: t('llmPerf.cost.local') }) : '—'}</b> {t('llmPerf.benefit.spend')}</span>
                {netMoney !== null && <span><b>{netMoney}</b> {t('llmPerf.benefit.netMoney')}</span>}
              </p>
            </header>
            {benefitLines.length > 0
              ? <ul className="llmhist-benefit-list">{benefitLines.map((line, i) => <li key={i}>{line}</li>)}</ul>
              : <p className="viz-empty">{t('llmPerf.benefit.none')}</p>}
            <p className="llmhist-foot">
              {typeof hourlyRate === 'number' && hourlyRate > 0 ? t('llmPerf.benefit.scenarioNote') : t('llmPerf.benefit.noRate')}
              {timeValue !== null && netMoney === null && ` ${t('llmPerf.benefit.currencyNote', { cur: currencyCode })}`}
              {netMoneyNote && ` ${netMoneyNote}`}
            </p>
          </div>

          {/* Einsatz */}
          <div className="llmhist-block">
            <header>
              <h2>{t('llmPerf.history.usage')}</h2>
              <p className="llmhist-stats">
                <span><b>{usage.total}</b> {t('llmPerf.history.calls')}</span>
                <span><b>{usage.local}</b> {t('llmPerf.history.local')}</span>
                <span><b>{usage.cloud}</b> {t('llmPerf.history.cloud')}</span>
              </p>
            </header>
            {usage.total > 0 ? (
              <>
                <StackedBars buckets={usageBuckets} colorOf={colorOf} labelOf={labelOf} unit={t('llmPerf.history.calls')} />
                <Legend items={usageLegend} />
              </>
            ) : <p className="viz-empty">{t('llmPerf.history.noCalls')}</p>}
          </div>

          {/* Kosten */}
          <div className="llmhist-block">
            <header>
              <h2>{t('llmPerf.history.cost')}</h2>
              <p className="llmhist-stats">
                <span><b>{cost.total.cloudRuns ? formatCostCell(cost.total, { local: t('llmPerf.cost.local') }) : '—'}</b> {t('llmPerf.history.cloudCost')}</span>
                {cost.total.unpricedRuns > 0 && <span className="llmhist-caveat">{t('llmPerf.history.unpriced', { n: cost.total.unpricedRuns })}</span>}
                <span><b>{formatMinutes(cost.computeMsTotal)} min</b> {t('llmPerf.history.computeTime')}</span>
                {cost.localRunsWithoutTiming > 0 && <span className="llmhist-caveat">{t('llmPerf.history.noTiming', { n: cost.localRunsWithoutTiming })}</span>}
              </p>
            </header>
            {cost.total.cloudRuns > 0 && (
              <>
                <h3>{t('llmPerf.history.cloudCostChart')}</h3>
                <SignedBars buckets={cloudBuckets} color={seriesColor(0)} unit="USD" formatValue={v => formatUsd(v)} />
              </>
            )}
            {cost.computeMsTotal > 0 && (
              <>
                <h3>{t('llmPerf.history.computeChart')}</h3>
                <StackedBars buckets={computeBuckets} colorOf={colorOf} labelOf={labelOf} unit="min" height={150} />
                <Legend items={computeLegend} />
              </>
            )}
            {cost.total.cloudRuns === 0 && cost.computeMsTotal === 0 && <p className="viz-empty">{t('llmPerf.history.noCost')}</p>}
          </div>

          {/* Zeitgewinn */}
          <div className="llmhist-block">
            <header>
              <h2>{t('llmPerf.history.saved')}</h2>
              <p className="llmhist-stats">
                <span><b>{valuedAny ? `${Math.round(saved.total.totalMinutes)} min` : '—'}</b> {t('llmPerf.history.savedMinutes')}</span>
                <span><b>{valuedTotal}</b> {t('llmPerf.history.valuedRuns')}</span>
                {wastedTotal > 0 && <span className="llmhist-caveat">{t('llmPerf.history.wasted', { n: wastedTotal, minutes: wastedMinutesTotal })}</span>}
                {saved.total.correctedRuns > 0 && <span className="llmhist-caveat">{t(saved.total.correctedRuns === 1 ? 'llmPerf.history.correctedOne' : 'llmPerf.history.corrected', { n: saved.total.correctedRuns, minutes: Math.round(saved.total.correctedMs / 60_000) })}</span>}
                {saved.total.unmeasuredRuns > 0 && <span className="llmhist-caveat">{t('llmPerf.history.unmeasured', { n: saved.total.unmeasuredRuns })}</span>}
                {saved.total.unpricedTypes.length > 0 && (
                  <span className="llmhist-caveat">{t('llmPerf.history.noReference', { types: saved.total.unpricedTypes.map(ty => t(ACTIVITY_TYPE_LABEL_KEY[ty])).join(', ') })}</span>
                )}
              </p>
            </header>
            {valuedAny || saved.referenceChanges.length > 0 ? (
              <>
                <SignedBars buckets={savedBuckets} color={seriesColor(2)} unit="min" />
                <p className="llmhist-foot">{referenceNoteText(referenceMinutes, referenceSources, t)}</p>
                <p className="llmhist-foot">{t('llmPerf.history.foregroundNote')}</p>
              </>
            ) : <p className="viz-empty">{t('llmPerf.history.noSaved')}</p>}
            <CorrectionForm summary={saved.totalSummary} vaultPath={vaultPath} loc={loc} t={t} />
            {dotRows.length > 0 && (
              <>
                <h3>{t('llmPerf.history.byModel')}</h3>
                <DotPlot rows={dotRows} colorOf={colorOf} unit="min" />
                <Legend items={dotLegend} />
              </>
            )}
            {saved.byModelHidden > 0 && <p className="llmhist-foot">{t('llmPerf.history.byModelHidden', { n: saved.byModelHidden, min: MIN_POINT_RUNS })}</p>}
          </div>

          {/* Leistung */}
          <div className="llmhist-block">
            <header>
              <h2>{t('llmPerf.history.performance')}</h2>
            </header>
            {perfLines.length > 0 ? (
              <>
                <LineChart series={perfLines} labels={buckets.map(label)} unit={t('llmPerf.history.tpsShort')} formatValue={v => formatTps(v)} />
                <Legend items={perfLegend} />
              </>
            ) : <p className="viz-empty">{t('llmPerf.history.noPerformance', { min: MIN_POINT_RUNS })}</p>}
            {(cloudSeries.length > 0 || perfHiddenSmall > 0) && (
              <p className="llmhist-foot">
                {cloudSeries.length > 0 && t('llmPerf.history.cloudNoTps', { models: cloudSeries.map(s => s.model).join(', ') })}
                {cloudSeries.length > 0 && perfHiddenSmall > 0 && ' '}
                {perfHiddenSmall > 0 && t('llmPerf.history.perfFolded', { n: perfHiddenSmall })}
              </p>
            )}
          </div>

          <p className="llmhist-foot llmhist-device">{t('llmPerf.history.perDevice')}</p>
        </>
      )}
    </section>
  )
}

// ─── kleine Helfer, nur Text und Summen ──────────────────────────────────────

function runsOfModel(usage: ReturnType<typeof bucketUsage>, model: string): number {
  return usage.buckets.reduce((n, b) => n + (b.byModel[model] ?? 0), 0)
}

function sumCompute(cost: ReturnType<typeof bucketCost>, model: string): number {
  return cost.buckets.reduce((n, b) => n + (b.computeMsByModel[model] ?? 0), 0)
}

function groupByType<R extends { activityType: ValuedType }>(rows: R[]): Array<[ValuedType, R[]]> {
  const m = new Map<ValuedType, R[]>()
  for (const r of rows) m.set(r.activityType, [...(m.get(r.activityType) ?? []), r])
  return [...m.entries()]
}

function costNote(cloudRuns: number, unpriced: number, computed: number, t: T): string {
  const parts = [`N = ${cloudRuns}`]
  if (unpriced > 0) parts.push(t('llmPerf.history.unpriced', { n: unpriced }))
  if (computed > 0) parts.push(t('llmPerf.costHint.computed'))
  return parts.join('\n')
}

function savedNote(valued: number, wasted: number, wastedMinutes: number, unmeasured: number, t: T): string {
  const parts = [`${t('llmPerf.history.valuedRuns')}: ${valued}`]
  if (wasted > 0) parts.push(t('llmPerf.history.wasted', { n: wasted, minutes: wastedMinutes }))
  if (unmeasured > 0) parts.push(t('llmPerf.history.unmeasured', { n: unmeasured }))
  return parts.join('\n')
}

/** Aktive Minuten aller Fehlversuche, aus den Rohwerten gerundet — nicht Summe gerundeter Zeilen. */
function wastedMinutesOf(saved: { lines: Array<{ wastedMs: number }> }): number {
  return Math.round(saved.lines.reduce((ms, l) => ms + l.wastedMs, 0) / 60_000)
}

function referenceNoteText(reference: ReferenceMinutes, sources: ReferenceSources | undefined, t: T): string {
  const entries = Object.entries(reference).filter(([, v]) => typeof v === 'number' && v > 0) as Array<[ValuedType, number]>
  if (entries.length === 0) return t('llmPerf.history.noReferenceSet')
  // Die Quelle steht an jeder Zahl: Eine gestoppte Referenz ist eine andere Aussage als eine geschätzte.
  const quelle = (ty: ValuedType) => t(sources?.[ty] === 'measured' ? 'llmPerf.history.refMeasured' : 'llmPerf.history.refEstimated')
  return t('llmPerf.history.referenceNote', { list: entries.map(([ty, v]) => `${t(ACTIVITY_TYPE_LABEL_KEY[ty])} ${v} min (${quelle(ty)})`).join(', ') })
}

/**
 * Nacharbeit nachtragen, die die App nicht sehen konnte (Review F02). Eine Angabe des
 * Nutzers, keine Messung — der Kern prüft Ziel und Größe, die Bilanz weist den Nachtrag
 * überall aus. Kandidaten sind die Läufe und Vorgänge des gewählten Zeitraums.
 */
function CorrectionForm({ summary, vaultPath, loc, t }: { summary: ActivitySummary; vaultPath: string | null; loc: string; t: T }) {
  const [target, setTarget] = useState('')
  const [minutes, setMinutes] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const candidates = [
    ...summary.acceptedRuns.map(r => ({ id: r.runId, at: r.at, type: r.activityType, model: r.model, activeMs: r.activeMs, corrected: r.correctedMs ?? 0, failed: false })),
    ...summary.discardedRuns.map(r => ({ id: r.runId, at: r.at, type: r.activityType as ValuedType, model: r.model, activeMs: r.activeMs, corrected: r.correctedMs ?? 0, failed: true })),
    ...summary.jobRuns.map(j => ({ id: j.jobId, at: j.at, type: (j.channels[0] ?? (j.jobKind === 'attendance-list' ? 'attendance-list' : 'wp-post')) as ValuedType, model: j.model, activeMs: j.activeMs, corrected: j.correctedMs ?? 0, failed: j.abandoned })),
  ]
    // Ohne Messung kein Nachtrag: Zusatzzeit kann die unbekannte Basis nicht ersetzen (Review F13).
    .filter(c => c.activeMs !== null)
    .sort((a, b) => b.at - a.at).slice(0, 30)
  if (candidates.length === 0) return null
  const label = (c: typeof candidates[number]) => {
    const when = new Date(c.at).toLocaleString(loc, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
    const aktiv = c.activeMs === null ? t('llmPerf.correction.unmeasured') : `${Math.round(c.activeMs / 60_000)} min`
    return `${when} · ${t(ACTIVITY_TYPE_LABEL_KEY[c.type])}${c.model ? ` · ${c.model}` : ''} · ${aktiv}${c.corrected ? ` (+${Math.round(c.corrected / 60_000)})` : ''}${c.failed ? ` · ${t('llmPerf.correction.failed')}` : ''}`
  }
  const submit = async () => {
    const min = Number(minutes)
    if (!vaultPath || !target || !Number.isFinite(min) || min <= 0) return
    setState('saving')
    try {
      const res = await window.electronAPI.activityCorrectTime(vaultPath, target, Math.round(min * 60_000))
      setState(res.success ? 'ok' : 'error')
      if (res.success) setMinutes('')
    } catch { setState('error') }
    window.setTimeout(() => setState('idle'), 2500)
  }
  return (
    <div className="llmhist-correction">
      <h3>{t('llmPerf.correction.title')}</h3>
      <p className="llmhist-foot">{t('llmPerf.correction.hint')}</p>
      <div className="llmhist-correction-row">
        <select value={target} onChange={e => setTarget(e.target.value)} aria-label={t('llmPerf.correction.target')}>
          <option value="">{t('llmPerf.correction.choose')}</option>
          {candidates.map(c => <option key={c.id} value={c.id}>{label(c)}</option>)}
        </select>
        <input type="number" min={1} max={480} step={1} value={minutes} onChange={e => setMinutes(e.target.value)} placeholder={t('llmPerf.correction.minutes')} aria-label={t('llmPerf.correction.minutes')} />
        <button onClick={submit} disabled={state === 'saving' || !target || !minutes}>
          {state === 'ok' ? t('llmPerf.correction.saved') : state === 'error' ? t('llmPerf.correction.rejected') : t('llmPerf.correction.submit')}
        </button>
      </div>
    </div>
  )
}
