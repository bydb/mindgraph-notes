import React from 'react'
import { useTranslation } from '../../utils/translations'
import { useUIStore, type Language } from '../../stores/uiStore'

interface WelcomeScreenProps {
  onStartWizard: () => void
  onOpenVault: () => void
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStartWizard, onOpenVault }) => {
  const { t } = useTranslation()
  const { language, setLanguage } = useUIStore()

  return (
    <div className="onboarding-welcome">
      <div className="onboarding-welcome-logo">
        <svg width="64" height="64" viewBox="0 0 100 100" fill="none">
          <circle className="logo-bg" cx="50" cy="50" r="48"/>
          <g stroke="var(--accent-color)" strokeWidth="2.5">
            <line x1="50" y1="22" x2="35" y2="38"/>
            <line x1="50" y1="22" x2="65" y2="38"/>
            <line x1="35" y1="38" x2="65" y2="38"/>
            <line x1="35" y1="38" x2="25" y2="58"/>
            <line x1="35" y1="38" x2="50" y2="52"/>
            <line x1="65" y1="38" x2="75" y2="58"/>
            <line x1="65" y1="38" x2="50" y2="52"/>
            <line x1="25" y1="58" x2="50" y2="52"/>
            <line x1="75" y1="58" x2="50" y2="52"/>
            <line x1="25" y1="58" x2="38" y2="75"/>
            <line x1="50" y1="52" x2="38" y2="75"/>
            <line x1="50" y1="52" x2="62" y2="75"/>
            <line x1="75" y1="58" x2="62" y2="75"/>
            <line x1="38" y1="75" x2="62" y2="75"/>
          </g>
          <g fill="var(--accent-color)">
            <circle cx="50" cy="22" r="7"/>
            <circle cx="35" cy="38" r="7"/>
            <circle cx="65" cy="38" r="7"/>
            <circle cx="25" cy="58" r="7"/>
            <circle cx="50" cy="52" r="7"/>
            <circle cx="75" cy="58" r="7"/>
            <circle cx="38" cy="75" r="7"/>
            <circle cx="62" cy="75" r="7"/>
          </g>
        </svg>
      </div>

      <h1 className="onboarding-welcome-title">{t('onboarding.welcome.title')}</h1>
      <p className="onboarding-welcome-subtitle">{t('onboarding.welcome.subtitle')}</p>

      <div className="onboarding-welcome-actions">
        <button className="onboarding-btn-primary" onClick={onStartWizard}>
          {t('onboarding.welcome.setup')}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        <button className="onboarding-btn-secondary" onClick={onOpenVault}>
          {t('onboarding.welcome.openVault')}
        </button>
      </div>

      <div className="onboarding-language-switcher">
        <button
          className={`onboarding-lang-btn ${language === 'de' ? 'active' : ''}`}
          onClick={() => setLanguage('de' as Language)}
        >
          Deutsch
        </button>
        <span className="onboarding-lang-sep">|</span>
        <button
          className={`onboarding-lang-btn ${language === 'en' ? 'active' : ''}`}
          onClick={() => setLanguage('en' as Language)}
        >
          English
        </button>
      </div>
    </div>
  )
}
