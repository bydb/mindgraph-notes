// Einstellungen → Dashboard (Redesign 09/2026): Widgets als Schalter-Zeilen mit Reihenfolge,
// Morning Briefing, Aufgaben-Vorlauf.

import React from 'react'
import { useUIStore } from '../../stores/uiStore'
import type { TabTFn } from './settingsTypes'
import { PageHeader, SectionTitle, Card, Row, Toggle, NumberInput } from './SettingsUI'

const ALL_WIDGETS = ['focus', 'radar', 'activity', 'tasks', 'emails', 'calendar', 'bookings', 'antares', 'project-status'] as const
type WidgetId = typeof ALL_WIDGETS[number]

export const DashboardSettingsTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  const dashboard = useUIStore(state => state.dashboard)
  const setDashboard = useUIStore(state => state.setDashboard)
  const taskLeadTime = useUIStore(state => state.taskLeadTime)
  const setTaskLeadTime = useUIStore(state => state.setTaskLeadTime)

  const widgetLabels: Record<WidgetId, string> = {
    focus: t('dashboard.widgets.focus'),
    radar: t('dashboard.widgets.radar'),
    activity: t('dashboard.widgets.activity'),
    tasks: t('dashboard.widgets.tasks'),
    emails: t('dashboard.widgets.emails'),
    calendar: t('dashboard.widgets.calendar'),
    bookings: t('dashboard.widgets.bookings'),
    antares: t('dashboard.widgets.antares'),
    'project-status': t('dashboard.widgets.projectStatus')
  }

  const toggleWidget = (id: WidgetId) => {
    const active = dashboard.widgets.includes(id)
    setDashboard({ widgets: active ? dashboard.widgets.filter(w => w !== id) : [...dashboard.widgets, id] })
  }
  const moveWidget = (id: WidgetId, direction: -1 | 1) => {
    const idx = dashboard.widgets.indexOf(id)
    if (idx < 0) return
    const target = idx + direction
    if (target < 0 || target >= dashboard.widgets.length) return
    const next = [...dashboard.widgets]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setDashboard({ widgets: next })
  }
  // Aktive Widgets in ihrer Reihenfolge zuerst, dann die ausgeschalteten
  const ordered: WidgetId[] = [
    ...dashboard.widgets.filter((w): w is WidgetId => (ALL_WIDGETS as readonly string[]).includes(w)),
    ...ALL_WIDGETS.filter(w => !dashboard.widgets.includes(w))
  ]

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.dashboard.title')} subtitle={t('settings.dashboard.subtitle')} />

      <Card>
        <Row label={t('settings.dashboard.enabled')} htmlFor="dash-enabled">
          <Toggle id="dash-enabled" checked={dashboard.enabled} onChange={v => setDashboard({ enabled: v })} />
        </Row>
      </Card>

      <SectionTitle title={t('settings.dashboard.widgets')} meta={t('settings.dashboard.widgetsMeta', { n: dashboard.widgets.length, total: ALL_WIDGETS.length })} />
      <Card>
        {ordered.map(id => {
          const active = dashboard.widgets.includes(id)
          const position = dashboard.widgets.indexOf(id)
          return (
            <Row key={id} label={widgetLabels[id]} htmlFor={`dash-widget-${id}`} disabled={!active}>
              {active && (
                <span className="sui-order">
                  <button type="button" className="sui-order-btn" disabled={position <= 0} onClick={() => moveWidget(id, -1)} title={t('settings.dashboard.moveUp')} aria-label={t('settings.dashboard.moveUp')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                  </button>
                  <button type="button" className="sui-order-btn" disabled={position >= dashboard.widgets.length - 1} onClick={() => moveWidget(id, 1)} title={t('settings.dashboard.moveDown')} aria-label={t('settings.dashboard.moveDown')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                </span>
              )}
              <Toggle id={`dash-widget-${id}`} checked={active} onChange={() => toggleWidget(id)} />
            </Row>
          )
        })}
      </Card>

      <SectionTitle title={t('settings.dashboard.briefing')} />
      <Card>
        <Row label={t('settings.dashboard.briefingEnabled')} hint={t('settings.dashboard.briefingHint')} htmlFor="dash-briefing">
          <Toggle id="dash-briefing" checked={dashboard.briefingEnabled} onChange={v => setDashboard({ briefingEnabled: v })} />
        </Row>
        <Row label={t('settings.dashboard.briefingIncludeCalendar')} htmlFor="dash-briefing-cal">
          <Toggle id="dash-briefing-cal" checked={dashboard.briefingIncludeCalendar} onChange={v => setDashboard({ briefingIncludeCalendar: v })} />
        </Row>
        <Row label={t('settings.dashboard.calendarDaysAhead')}>
          <NumberInput value={dashboard.calendarDaysAhead} min={0} max={14} onCommit={v => setDashboard({ calendarDaysAhead: v })} unit={t('settings.dashboard.days')} />
        </Row>
      </Card>

      <SectionTitle title={t('settings.tasks.leadTime.title')} />
      <Card>
        <Row label={t('settings.tasks.leadTime.criticalShort')} hint={t('settings.tasks.leadTime.hint')}>
          <NumberInput value={taskLeadTime.critical} min={0} max={30} onCommit={v => setTaskLeadTime({ critical: v })} unit={t('settings.dashboard.days')} />
        </Row>
        <Row label={t('settings.tasks.leadTime.normalShort')}>
          <NumberInput value={taskLeadTime.normal} min={0} max={30} onCommit={v => setTaskLeadTime({ normal: v })} unit={t('settings.dashboard.days')} />
        </Row>
      </Card>
    </div>
  )
}
