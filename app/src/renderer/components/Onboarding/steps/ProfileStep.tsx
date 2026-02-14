import React from 'react'
import { useTranslation } from '../../../utils/translations'
import type { UserProfile } from '../../../stores/uiStore'

interface ProfileStepProps {
  selectedProfile: UserProfile
  onSelectProfile: (profile: UserProfile) => void
  onBack: () => void
  onNext: () => void
}

const profiles: { id: Exclude<UserProfile, null>; icon: JSX.Element }[] = [
  {
    id: 'schueler',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
        <path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/>
      </svg>
    )
  },
  {
    id: 'studium',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2"/>
        <path d="M12 2v4"/>
        <path d="m15 5.2-1.8 3.2"/>
        <path d="m19.4 8-3.2 1.8"/>
        <path d="M22 12h-4"/>
        <path d="m19.4 16-3.2-1.8"/>
        <path d="m15 18.8-1.8-3.2"/>
        <path d="M12 22v-4"/>
        <path d="m9 18.8 1.8-3.2"/>
        <path d="m4.6 16 3.2-1.8"/>
        <path d="M2 12h4"/>
        <path d="m4.6 8 3.2 1.8"/>
        <path d="m9 5.2 1.8 3.2"/>
      </svg>
    )
  },
  {
    id: 'wissensmanagement',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.4V20h6v-2.6c2.9-1.1 5-4 5-7.4a8 8 0 0 0-8-8z"/>
        <path d="M9 22h6"/>
        <path d="M12 2v4"/>
        <path d="M8 10h8"/>
        <path d="M10 14h4"/>
      </svg>
    )
  }
]

export const ProfileStep: React.FC<ProfileStepProps> = ({
  selectedProfile,
  onSelectProfile,
  onBack,
  onNext
}) => {
  const { t } = useTranslation()

  return (
    <div className="onboarding-step">
      <div className="onboarding-step-header">
        <span className="onboarding-step-indicator">{t('onboarding.step', { current: '1', total: '4' })}</span>
        <div className="onboarding-progress">
          <div className="onboarding-progress-dot active" />
          <div className="onboarding-progress-dot" />
          <div className="onboarding-progress-dot" />
          <div className="onboarding-progress-dot" />
        </div>
      </div>

      <h2 className="onboarding-step-title">{t('onboarding.profile.title')}</h2>
      <p className="onboarding-step-desc">{t('onboarding.profile.subtitle')}</p>

      <div className="onboarding-vault-options">
        {profiles.map(({ id, icon }) => (
          <button
            key={id}
            className={`onboarding-vault-option ${selectedProfile === id ? 'selected' : ''}`}
            onClick={() => onSelectProfile(selectedProfile === id ? null : id)}
          >
            <div className="onboarding-vault-option-icon">{icon}</div>
            <div className="onboarding-vault-option-text">
              <span className="onboarding-vault-option-title">
                {t(`onboarding.profile.${id}.title` as any)}
              </span>
              <span className="onboarding-vault-option-desc">
                {t(`onboarding.profile.${id}.desc` as any)}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="onboarding-nav">
        <button className="onboarding-btn-secondary" onClick={onBack}>
          {t('onboarding.back')}
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!selectedProfile && (
            <button className="onboarding-btn-secondary" onClick={onNext}>
              {t('onboarding.profile.skip')}
            </button>
          )}
          <button className="onboarding-btn-primary" onClick={onNext}>
            {t('onboarding.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
