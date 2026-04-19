import React from 'react'
import { useTranslation } from '../../../utils/translations'

interface MissionsStepProps {
  onFinish: () => void
  onBack: () => void
  hasStarterVault?: boolean
  /** When true, hides step indicator and shows close button instead of back/finish */
  standalone?: boolean
}

const missions = [
  {
    id: 'welcome',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    )
  },
  {
    id: 'dashboard',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    )
  },
  {
    id: 'create',
    shortcut: 'Cmd+N',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    )
  },
  {
    id: 'link',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
    )
  },
  {
    id: 'canvas',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3"/>
        <circle cx="18" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="18" r="3"/>
        <line x1="8.5" y1="7.5" x2="15.5" y2="16.5"/>
        <line x1="15.5" y1="7.5" x2="8.5" y2="16.5"/>
      </svg>
    )
  }
]

export const MissionsStep: React.FC<MissionsStepProps> = ({
  onFinish,
  onBack,
  hasStarterVault = false,
  standalone = false
}) => {
  const { t } = useTranslation()

  return (
    <div className="onboarding-step">
      {!standalone && (
        <div className="onboarding-step-header">
          <span className="onboarding-step-indicator">{t('onboarding.step', { current: '4', total: '4' })}</span>
          <div className="onboarding-progress">
            <div className="onboarding-progress-dot active" />
            <div className="onboarding-progress-dot active" />
            <div className="onboarding-progress-dot active" />
            <div className="onboarding-progress-dot active" />
          </div>
        </div>
      )}

      <h2 className="onboarding-step-title">{t('onboarding.missions.title')}</h2>
      <p className="onboarding-step-desc">{t('onboarding.missions.subtitle')}</p>

      <div className="onboarding-missions-list">
        {missions.map((mission, index) => (
          <div
            key={mission.id}
            className={`onboarding-mission-item ${mission.id === 'welcome' && hasStarterVault ? 'auto-done' : ''}`}
          >
            <div className="onboarding-mission-number">{index + 1}</div>
            <div className="onboarding-mission-icon">{mission.icon}</div>
            <div className="onboarding-mission-text">
              <span className="onboarding-mission-title">
                {t(`onboarding.missions.${mission.id}.title` as any)}
              </span>
              <span className="onboarding-mission-desc">
                {t(`onboarding.missions.${mission.id}.desc` as any)}
              </span>
            </div>
            {mission.shortcut && (
              <span className="onboarding-mission-shortcut">{mission.shortcut}</span>
            )}
          </div>
        ))}
      </div>

      <div className="onboarding-missions-hint">
        {t('onboarding.missions.helpHint')}
      </div>

      <div className="onboarding-nav">
        {standalone ? (
          <button className="onboarding-btn-primary" onClick={onFinish}>
            {t('onboarding.guide.close')}
          </button>
        ) : (
          <>
            <button className="onboarding-btn-secondary" onClick={onBack}>
              {t('onboarding.back')}
            </button>
            <button className="onboarding-btn-primary onboarding-btn-finish" onClick={onFinish}>
              {t('onboarding.done.start')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
