// Rendert eine WidgetView aus dem festen v1-Vokabular (stats/list/keyValue/progress/badge) als
// native React-Komponente des HOSTS. ADR §4 / Invarianten I-D1..I-D3:
//   • Plugin-Strings ausschließlich als React-TEXT-Nodes (auto-escaped).
//   • KEIN `dangerouslySetInnerHTML`, KEIN sanitizeHtml — kein roher Plugin-HTML-Pfad.
//   • Styles sind HOST-berechnet (Status-Enum→feste Farbe, geklammerter Prozentwert), NIE aus
//     Plugin-Daten (das Vokabular trägt keine Präsentationsfelder, WIDGET_VIEW_SCHEMA additionalProperties:false).
import React from 'react'
import type { WidgetView, WidgetStatus } from '@mindgraph/plugin-api'
import './ExternalWidget.css'

const STATUS_COLOR: Record<WidgetStatus, string> = { red: '#e5484d', green: '#30a46c', blue: '#4a9eff' }

const StatusDot: React.FC<{ status?: WidgetStatus }> = ({ status }) =>
  status ? <span className="ext-widget-dot" style={{ background: STATUS_COLOR[status] }} aria-hidden="true" /> : null

export const DeclarativeWidget: React.FC<{ view: WidgetView }> = ({ view }) => {
  switch (view.kind) {
    case 'stats':
      return (
        <div className="ext-widget-stats">
          {view.items.map((it, i) => (
            <div key={i} className="ext-widget-stat">
              <div className="ext-widget-stat-value">
                {it.value}
                {it.trend ? (
                  <span className={`ext-widget-trend trend-${it.trend}`} aria-hidden="true">
                    {it.trend === 'up' ? '▲' : it.trend === 'down' ? '▼' : '–'}
                  </span>
                ) : null}
              </div>
              <div className="ext-widget-stat-label">{it.label}</div>
            </div>
          ))}
        </div>
      )
    case 'list':
      return (
        <ul className="ext-widget-list">
          {view.items.map((it, i) => (
            <li key={i} className="ext-widget-list-item">
              <StatusDot status={it.status} />
              <span className="ext-widget-list-title">{it.title}</span>
              {it.subtitle ? <span className="ext-widget-list-sub">{it.subtitle}</span> : null}
              {it.badge ? <span className="ext-widget-pill">{it.badge}</span> : null}
            </li>
          ))}
        </ul>
      )
    case 'keyValue':
      return (
        <dl className="ext-widget-kv">
          {view.rows.map((r, i) => (
            <div key={i} className="ext-widget-kv-row">
              <dt>{r.key}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      )
    case 'progress': {
      const pct = Math.max(0, Math.min(100, (view.value / view.max) * 100))
      return (
        <div className="ext-widget-progress">
          {view.label ? <div className="ext-widget-progress-label">{view.label}</div> : null}
          <div className="ext-widget-progress-track">
            <div className="ext-widget-progress-bar" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    }
    case 'badge':
      return (
        <span className="ext-widget-pill">
          <StatusDot status={view.status} />
          {view.text}
        </span>
      )
    default:
      return null
  }
}
