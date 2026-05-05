import React, { useEffect } from 'react'
import { useUIStore } from '../../../stores/uiStore'
import type { DashboardWidgetId, UserProfile } from '../../../stores/uiStore'
import { useTranslation } from '../../../utils/translations'

interface DashboardStepProps {
  onBack: () => void
  onNext: () => void
  profile: UserProfile
}

const ALL_WIDGETS: { id: DashboardWidgetId; labelKey: string }[] = [
  { id: 'focus', labelKey: 'dashboard.widgets.focus' },
  { id: 'radar', labelKey: 'dashboard.widgets.radar' },
  { id: 'activity', labelKey: 'dashboard.widgets.activity' },
  { id: 'tasks', labelKey: 'dashboard.widgets.tasks' },
  { id: 'emails', labelKey: 'dashboard.widgets.emails' },
  { id: 'calendar', labelKey: 'dashboard.widgets.calendar' },
  { id: 'bookings', labelKey: 'dashboard.widgets.bookings' }
]

// Profil-spezifische Widget-Voreinstellungen
const profileDefaults = (profile: UserProfile): DashboardWidgetId[] => {
  switch (profile) {
    case 'student':
      return ['focus', 'radar', 'activity', 'tasks', 'calendar']
    case 'researcher':
      return ['focus', 'radar', 'activity', 'tasks', 'emails']
    case 'professional':
      return ['focus', 'radar', 'activity', 'tasks', 'emails', 'calendar', 'bookings']
    case 'writer':
      return ['focus', 'radar', 'activity', 'tasks']
    case 'developer':
      return ['focus', 'radar', 'activity', 'tasks', 'emails']
    default:
      return ['focus', 'radar', 'activity', 'tasks', 'emails', 'calendar', 'bookings']
  }
}

export const DashboardStep: React.FC<DashboardStepProps> = ({ onBack, onNext, profile }) => {
  const { t } = useTranslation()
  const dashboard = useUIStore(s => s.dashboard)
  const setDashboard = useUIStore(s => s.setDashboard)

  // Beim ersten Anzeigen: Profil-Defaults anwenden, aber nur wenn Nutzer nichts abweichendes gewählt hat
  useEffect(() => {
    const defaults = profileDefaults(profile)
    setDashboard({ widgets: defaults })
    // absichtlich nur einmal pro Profil-Wechsel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const toggleWidget = (id: DashboardWidgetId) => {
    const active = dashboard.widgets.includes(id)
    setDashboard({
      widgets: active
        ? dashboard.widgets.filter(w => w !== id)
        : [...dashboard.widgets, id]
    })
  }

  const handleEnabledToggle = (enabled: boolean) => {
    setDashboard({ enabled })
  }

  return (
    <div className="onboarding-step">
      <div className="onboarding-step-header">
        <span className="onboarding-step-indicator">{t('onboarding.step', { current: '3', total: '4' })}</span>
        <div className="onboarding-progress">
          <div className="onboarding-progress-dot active" />
          <div className="onboarding-progress-dot active" />
          <div className="onboarding-progress-dot active" />
          <div className="onboarding-progress-dot" />
        </div>
      </div>

      <h2 className="onboarding-step-title">{t('onboarding.dashboard.title')}</h2>
      <p className="onboarding-step-desc">{t('onboarding.dashboard.subtitle')}</p>

      <div className="onboarding-dashboard-toggle">
        <label>
          <input
            type="checkbox"
            checked={dashboard.enabled}
            onChange={e => handleEnabledToggle(e.target.checked)}
          />
          <span>{t('onboarding.dashboard.enabled')}</span>
        </label>
      </div>

      {dashboard.enabled && (
        <>
          <div className="onboarding-dashboard-section-label">
            {t('onboarding.dashboard.widgetsLabel')}
          </div>
          <div className="onboarding-dashboard-widgets">
            {ALL_WIDGETS.map(w => {
              const active = dashboard.widgets.includes(w.id)
              return (
                <button
                  key={w.id}
                  type="button"
                  className={`onboarding-widget-card ${active ? 'active' : ''}`}
                  onClick={() => toggleWidget(w.id)}
                >
                  <div className="onboarding-widget-check">
                    {active && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                  <span className="onboarding-widget-label">{t(w.labelKey as never)}</span>
                </button>
              )
            })}
          </div>

          <div className="onboarding-dashboard-section-label">
            {t('onboarding.dashboard.briefingLabel')}
          </div>
          <div className="onboarding-dashboard-toggle">
            <label>
              <input
                type="checkbox"
                checked={dashboard.briefingEnabled}
                onChange={e => setDashboard({ briefingEnabled: e.target.checked })}
              />
              <span>{t('onboarding.dashboard.briefingEnabled')}</span>
            </label>
            <span className="onboarding-dashboard-hint">
              {t('onboarding.dashboard.briefingHint')}
            </span>
          </div>
        </>
      )}

      <div className="onboarding-nav">
        <button className="onboarding-btn-secondary" onClick={onBack}>
          {t('onboarding.back')}
        </button>
        <button className="onboarding-btn-primary" onClick={onNext}>
          {t('onboarding.next')}
        </button>
      </div>
    </div>
  )
}
