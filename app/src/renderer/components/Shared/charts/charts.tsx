// Vier Diagrammformen für die Messgeschichte, in eigenem SVG.
//
// Warum keine Bibliothek: vier Formen (gestapelte Balken, Balken mit negativem Bereich,
// Linie mit Lücken, Punktdiagramm) rechtfertigen kein Bundle-Gewicht und keinen weiteren
// Audit-Pfad; und die Gestaltung soll der App folgen, nicht der Bibliothek.
//
// Regeln, die alle vier einhalten (docs/measurement-history-plan.md § 6, § 9):
//   - Lücken bleiben Lücken: null wird nicht gezeichnet, eine Linie wird über eine Lücke
//     nicht durchgezogen.
//   - Werte stehen als Tooltip (<title>) am Element, nicht als Zahl auf jedem Punkt.
//   - Text trägt Text-Token; Farbe kommt nur über --viz-N auf Flächen und Linien.
//   - Farbe folgt dem Schlüssel (Modell), nicht dem Rang — die Zuweisung macht der Aufrufer.

import type { ReactNode } from 'react'
import './charts.css'

export const MAX_SERIES = 8

/** Farbe für den n-ten Schlüssel (0-basiert). Ab dem neunten: „Andere". */
export function seriesColor(index: number): string {
  return index >= 0 && index < MAX_SERIES ? `var(--viz-${index + 1})` : 'var(--viz-other)'
}

export interface LegendItem {
  key: string
  label: string
  color: string
  value?: string
  line?: boolean
  dashed?: boolean
}

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length === 0) return null
  return (
    <ul className="viz-legend">
      {items.map(it => (
        <li key={it.key}>
          <span
            className={`viz-legend-chip${it.line ? ' is-line' : ''}${it.dashed ? ' is-dashed' : ''}`}
            style={it.dashed ? { color: it.color } : { background: it.color }}
          />
          <span>{it.label}</span>
          {it.value !== undefined && <span className="viz-legend-value">{it.value}</span>}
        </li>
      ))}
    </ul>
  )
}

// ─── Gemeinsame Geometrie ────────────────────────────────────────────────────

const PAD = { top: 8, right: 8, bottom: 22, left: 34 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const norm = v / exp
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * exp
}

function yTicks(max: number, min = 0): number[] {
  const span = max - min
  const rawStep = span / 4
  const exp = Math.pow(10, Math.floor(Math.log10(rawStep || 1)))
  const norm = rawStep / exp
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * exp
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

/** Nur so viele X-Beschriftungen, dass sie nicht kollidieren. */
function labelEvery(count: number, width: number): number {
  const perLabel = 34
  return Math.max(1, Math.ceil(count / Math.max(1, Math.floor(width / perLabel))))
}

function Frame({ width, height, children, xLabels, yTickValues, yScale, plotLeft, plotRight, formatY }: {
  width: number; height: number; children: ReactNode
  xLabels: Array<{ x: number; text: string }>
  yTickValues: number[]; yScale: (v: number) => number
  plotLeft: number; plotRight: number
  formatY: (v: number) => string
}) {
  return (
    <svg className="viz" viewBox={`0 0 ${width} ${height}`} role="img">
      <defs>
        <pattern id="viz-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--viz-hatch)" strokeWidth="2" />
        </pattern>
      </defs>
      <g className="viz-grid">
        {yTickValues.map(v => (
          <line key={v} x1={plotLeft} x2={plotRight} y1={yScale(v)} y2={yScale(v)} />
        ))}
      </g>
      <g className="viz-axis">
        {yTickValues.map(v => (
          <text key={v} x={plotLeft - 6} y={yScale(v) + 3} textAnchor="end">{formatY(v)}</text>
        ))}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={height - 6} textAnchor="middle">{l.text}</text>
        ))}
      </g>
      {children}
    </svg>
  )
}

// ─── Gestapelte Balken ───────────────────────────────────────────────────────

export interface StackedBucket {
  label: string
  /** Vollständige Beschreibung für den Tooltip, z.B. „Mi 12.8.". */
  title: string
  segments: Array<{ key: string; value: number }>
}

export function StackedBars({ buckets, colorOf, labelOf, height = 170, unit }: {
  buckets: StackedBucket[]
  colorOf: (key: string) => string
  labelOf: (key: string) => string
  height?: number
  unit: string
}) {
  const width = 720
  const n = buckets.length
  if (n === 0) return null
  const totals = buckets.map(b => b.segments.reduce((s, x) => s + x.value, 0))
  const max = niceMax(Math.max(0, ...totals))
  const plotLeft = PAD.left, plotRight = width - PAD.right
  const plotTop = PAD.top, plotBottom = height - PAD.bottom
  const yScale = (v: number) => plotBottom - (v / max) * (plotBottom - plotTop)
  const slot = (plotRight - plotLeft) / n
  const barW = Math.max(2, Math.min(28, slot * 0.7))
  const every = labelEvery(n, plotRight - plotLeft)
  const xLabels = buckets.map((b, i) => ({ x: plotLeft + slot * i + slot / 2, text: i % every === 0 ? b.label : '' })).filter(l => l.text)
  return (
    <Frame width={width} height={height} xLabels={xLabels} yTickValues={yTicks(max)} yScale={yScale}
      plotLeft={plotLeft} plotRight={plotRight} formatY={v => String(v)}>
      <line className="viz-baseline" x1={plotLeft} x2={plotRight} y1={yScale(0)} y2={yScale(0)} />
      {buckets.map((b, i) => {
        if (totals[i] === 0) return null
        const x = plotLeft + slot * i + (slot - barW) / 2
        let acc = 0
        return (
          <g key={i}>
            {b.segments.filter(s => s.value > 0).map(s => {
              const y0 = yScale(acc), y1 = yScale(acc + s.value)
              acc += s.value
              return (
                <rect key={s.key} className="viz-bar" x={x} y={y1} width={barW} height={Math.max(1, y0 - y1)} fill={colorOf(s.key)} rx={1}>
                  <title>{`${b.title}\n${labelOf(s.key)}: ${s.value} ${unit}\n${totals[i]} ${unit} gesamt`}</title>
                </rect>
              )
            })}
          </g>
        )
      })}
    </Frame>
  )
}

// ─── Balken mit negativem Bereich ────────────────────────────────────────────

export interface SignedBucket {
  label: string
  title: string
  /** null = keine Daten (Lücke). 0 wird als flacher Strich gezeichnet, nicht als nichts. */
  value: number | null
  /** Zusatz für den Tooltip (N, Vorbehalte). */
  note?: string
  /** Schraffiert, wenn der Wert unter Vorbehalt steht (z.B. Untergrenze). */
  hatched?: boolean
  /** Senkrechte Markierung (z.B. Referenz geändert). */
  marker?: string
}

export function SignedBars({ buckets, color, height = 170, unit, formatValue }: {
  buckets: SignedBucket[]
  color: string
  height?: number
  unit: string
  formatValue?: (v: number) => string
}) {
  const width = 720
  const n = buckets.length
  if (n === 0) return null
  const values = buckets.map(b => b.value).filter((v): v is number => v !== null)
  const maxV = niceMax(Math.max(0, ...values))
  const minV = values.some(v => v < 0) ? -niceMax(Math.max(0, ...values.map(v => -v))) : 0
  const plotLeft = PAD.left, plotRight = width - PAD.right
  const plotTop = PAD.top, plotBottom = height - PAD.bottom
  const yScale = (v: number) => plotBottom - ((v - minV) / (maxV - minV)) * (plotBottom - plotTop)
  const slot = (plotRight - plotLeft) / n
  const barW = Math.max(2, Math.min(28, slot * 0.7))
  const every = labelEvery(n, plotRight - plotLeft)
  const xLabels = buckets.map((b, i) => ({ x: plotLeft + slot * i + slot / 2, text: i % every === 0 ? b.label : '' })).filter(l => l.text)
  const fmt = formatValue ?? ((v: number) => String(Math.round(v)))
  return (
    <Frame width={width} height={height} xLabels={xLabels} yTickValues={yTicks(maxV, minV)} yScale={yScale}
      plotLeft={plotLeft} plotRight={plotRight} formatY={v => fmt(v)}>
      <line className="viz-baseline" x1={plotLeft} x2={plotRight} y1={yScale(0)} y2={yScale(0)} />
      {buckets.map((b, i) => {
        const cx = plotLeft + slot * i + slot / 2
        const marker = b.marker ? (
          <line key={`m${i}`} className="viz-marker" x1={cx} x2={cx} y1={plotTop} y2={plotBottom}>
            <title>{b.marker}</title>
          </line>
        ) : null
        if (b.value === null) return marker
        const x = cx - barW / 2
        const y0 = yScale(0), y1 = yScale(b.value)
        const negative = b.value < 0
        const top = Math.min(y0, y1)
        const h = Math.max(1, Math.abs(y0 - y1))
        return (
          <g key={i}>
            {marker}
            <rect className={`viz-bar${negative ? ' viz-bar-negative' : ''}`} x={x} y={top} width={barW} height={h} rx={1}
              fill={negative ? undefined : (b.hatched ? 'url(#viz-hatch)' : color)}>
              <title>{`${b.title}\n${fmt(b.value)} ${unit}${b.note ? `\n${b.note}` : ''}`}</title>
            </rect>
          </g>
        )
      })}
    </Frame>
  )
}

// ─── Linie mit Lücken ────────────────────────────────────────────────────────

export interface LineSeries {
  key: string
  label: string
  color: string
  dashed?: boolean
  /** null = kein Punkt; die Linie wird dort unterbrochen. */
  points: Array<{ value: number | null; title: string }>
}

export function LineChart({ series, labels, height = 190, unit, formatValue }: {
  series: LineSeries[]
  labels: string[]
  height?: number
  unit: string
  formatValue?: (v: number) => string
}) {
  const width = 720
  const n = labels.length
  if (n === 0 || series.length === 0) return null
  const all = series.flatMap(s => s.points.map(p => p.value)).filter((v): v is number => v !== null)
  const max = niceMax(Math.max(0, ...all))
  const plotLeft = PAD.left, plotRight = width - PAD.right
  const plotTop = PAD.top, plotBottom = height - PAD.bottom
  const yScale = (v: number) => plotBottom - (v / max) * (plotBottom - plotTop)
  const slot = (plotRight - plotLeft) / n
  const xAt = (i: number) => plotLeft + slot * i + slot / 2
  const every = labelEvery(n, plotRight - plotLeft)
  const xLabels = labels.map((l, i) => ({ x: xAt(i), text: i % every === 0 ? l : '' })).filter(l => l.text)
  const fmt = formatValue ?? ((v: number) => String(Math.round(v)))
  return (
    <Frame width={width} height={height} xLabels={xLabels} yTickValues={yTicks(max)} yScale={yScale}
      plotLeft={plotLeft} plotRight={plotRight} formatY={v => fmt(v)}>
      {series.map(s => {
        // Segmente zwischen Lücken getrennt zeichnen — nie über eine Lücke hinweg.
        const segments: string[] = []
        let current: string[] = []
        s.points.forEach((p, i) => {
          if (p.value === null) { if (current.length) segments.push(current.join(' ')); current = []; return }
          current.push(`${xAt(i)},${yScale(p.value)}`)
        })
        if (current.length) segments.push(current.join(' '))
        return (
          <g key={s.key}>
            {segments.map((pts, i) => (
              <polyline key={i} className={`viz-line${s.dashed ? ' viz-line-dashed' : ''}`} points={pts} stroke={s.color} />
            ))}
            {s.points.map((p, i) => p.value === null ? null : (
              <g key={i}>
                <circle className="viz-point-halo" cx={xAt(i)} cy={yScale(p.value)} r={10} />
                <circle className="viz-point" cx={xAt(i)} cy={yScale(p.value)} r={3.5} fill={s.color}>
                  <title>{`${p.title}\n${s.label}: ${fmt(p.value)} ${unit}`}</title>
                </circle>
              </g>
            ))}
          </g>
        )
      })}
    </Frame>
  )
}

// ─── Punktdiagramm ───────────────────────────────────────────────────────────

export interface DotRow {
  key: string
  label: string
  dots: Array<{ key: string; value: number; n: number; title: string }>
}

export function DotPlot({ rows, colorOf, unit, formatValue }: {
  rows: DotRow[]
  colorOf: (key: string) => string
  unit: string
  formatValue?: (v: number) => string
}) {
  const width = 720
  const rowH = 30
  const labelW = 150
  if (rows.length === 0) return null
  const height = PAD.top + rows.length * rowH + PAD.bottom
  const all = rows.flatMap(r => r.dots.map(d => d.value))
  const max = niceMax(Math.max(1, ...all))
  const plotLeft = labelW, plotRight = width - PAD.right
  const xScale = (v: number) => plotLeft + (v / max) * (plotRight - plotLeft)
  const fmt = formatValue ?? ((v: number) => String(Math.round(v)))
  const ticks = yTicks(max)
  return (
    <svg className="viz" viewBox={`0 0 ${width} ${height}`} role="img">
      <g className="viz-grid">
        {ticks.map(v => <line key={v} x1={xScale(v)} x2={xScale(v)} y1={PAD.top} y2={height - PAD.bottom} />)}
      </g>
      <g className="viz-axis">
        {ticks.map(v => <text key={v} x={xScale(v)} y={height - 6} textAnchor="middle">{fmt(v)}</text>)}
      </g>
      {rows.map((r, ri) => {
        const cy = PAD.top + ri * rowH + rowH / 2
        return (
          <g key={r.key}>
            <text className="viz-row-label" x={0} y={cy + 4}>{r.label}</text>
            {r.dots.map(d => (
              <g key={d.key}>
                <circle className="viz-dot" cx={xScale(d.value)} cy={cy} r={6} fill={colorOf(d.key)}>
                  <title>{`${d.title}\n${fmt(d.value)} ${unit}, N = ${d.n}`}</title>
                </circle>
                <text className="viz-dot-n" x={xScale(d.value)} y={cy - 9} textAnchor="middle">{d.n}</text>
              </g>
            ))}
          </g>
        )
      })}
    </svg>
  )
}
