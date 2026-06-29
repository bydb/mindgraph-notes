// Host-Rahmen um ein externes deklaratives Widget (ADR §4/§5.5).
//   • Pflicht-Demarkation „Externes Plugin · <id>" — vom HOST gezeichnet, nicht vom Plugin
//     beeinflussbar; verhindert, dass ein Widget sich als vertrauenswürdige Host-Chrome ausgibt.
//   • `contain: layout paint style` + `overflow:hidden` gegen jeden residualen positionierten Ausbruch.
//   • ErrorBoundary: ein Render-Crash des Widgets reißt Dashboard/Sidebar nicht mit.
// Tier 1 rendert das feste Vokabular (DeclarativeWidget). Die Demarkation gilt auch hier (nicht nur Tier 2).
import React from 'react'
import type { WidgetView } from '@mindgraph/plugin-api'
import { useTranslation } from '../../utils/translations'
import { DeclarativeWidget } from './DeclarativeWidget'
import './ExternalWidget.css'

class WidgetErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(err: unknown): void {
    console.error('[ext-widget] Render-Fehler im externen Widget:', err)
  }
  render(): React.ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export const ExternalWidgetHost: React.FC<{
  pluginId: string
  view?: WidgetView
  loading?: boolean
  error?: string
}> = ({ pluginId, view, loading, error }) => {
  const { t } = useTranslation()
  return (
    <section className="ext-widget" style={{ contain: 'layout paint style', overflow: 'hidden' }}>
      <header className="ext-widget-demarcation">
        {/* pluginId als reiner Text-Node (auto-escaped) */}
        <span className="ext-widget-demarcation-tag">
          {t('widgets.external.label')} · {pluginId}
        </span>
      </header>
      <div className="ext-widget-body">
        <WidgetErrorBoundary fallback={<div className="ext-widget-error">{t('widgets.external.renderError')}</div>}>
          {error
            ? <div className="ext-widget-error">{error}</div>
            : loading || !view
              ? <div className="ext-widget-loading">{t('widgets.external.loading')}</div>
              : <DeclarativeWidget view={view} />}
        </WidgetErrorBoundary>
      </div>
    </section>
  )
}
