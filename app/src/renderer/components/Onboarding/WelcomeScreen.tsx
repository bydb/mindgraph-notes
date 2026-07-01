import React, { useEffect, useState } from 'react'
import { useTranslation } from '../../utils/translations'
import { useUIStore, type Language } from '../../stores/uiStore'
import { MindGraphLogo } from '../Shared/MindGraphLogo'

interface WelcomeScreenProps {
  onStartWizard: () => void
  onOpenVault: () => void
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStartWizard, onOpenVault }) => {
  const { t } = useTranslation()
  const { language, setLanguage } = useUIStore()
  const [backend, setBackend] = useState<'ollama' | 'none' | null>(null)

  // Pre-Check informiert nur über den KI-Status (Ollama erreichbar?).
  useEffect(() => {
    let cancelled = false
    window.electronAPI.ollamaCheck()
      .then((ok: boolean) => {
        if (!cancelled) setBackend(ok ? 'ollama' : 'none')
      })
      .catch(() => {
        if (!cancelled) setBackend(null)
      })
    return () => { cancelled = true }
  }, [])

  const statusLabel =
    backend === null ? t('onboarding.welcome.aiStatusChecking')
    : backend === 'none' ? t('onboarding.welcome.aiStatusSetupNeeded')
    : t('onboarding.welcome.aiStatusReady').replace('{backend}', 'Ollama')
  const statusClass =
    backend === null ? 'checking'
    : backend === 'none' ? 'pending'
    : 'ready'

  return (
    <div className="onboarding-welcome">
      <div className="onboarding-welcome-logo">
        <div className="onboarding-welcome-animation">
          <MindGraphLogo size={64} edgesClassName="graph-edges" nodesClassName="graph-nodes" />
        </div>
      </div>

      <h1 className="onboarding-welcome-title">{t('onboarding.welcome.title')}</h1>
      <p className="onboarding-welcome-subtitle">{t('onboarding.welcome.subtitle')}</p>

      <div className={`onboarding-welcome-ai-status ${statusClass}`} role="status" aria-live="polite">
        <span className="onboarding-welcome-ai-status-dot" />
        {statusLabel}
      </div>

      <div className="onboarding-welcome-actions">
        <button
          className="onboarding-btn-primary"
          onClick={onStartWizard}
        >
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
