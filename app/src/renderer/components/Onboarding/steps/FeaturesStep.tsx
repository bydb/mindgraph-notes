import React from 'react'
import { useTranslation } from '../../../utils/translations'

interface FeaturesStepProps {
  onFinish: () => void
}

export const FeaturesStep: React.FC<FeaturesStepProps> = ({ onFinish }) => {
  const { t } = useTranslation()
  const isMac = navigator.platform.includes('Mac')
  const mod = isMac ? '\u2318' : 'Ctrl+'

  const shortcuts = [
    { keys: `${mod}K`, label: t('onboarding.done.quickSearch') },
    { keys: `${mod}N`, label: t('onboarding.done.newNote') },
    { keys: `${mod},`, label: t('onboarding.done.settings') },
    { keys: `${mod}\u21E7Z`, label: t('onboarding.done.zotero') },
  ]

  const features = [
    { name: t('onboarding.done.feature.canvas'), desc: t('onboarding.done.feature.canvasDesc'), icon: 'canvas' },
    { name: t('onboarding.done.feature.terminal'), desc: t('onboarding.done.feature.terminalDesc'), icon: 'terminal' },
    { name: t('onboarding.done.feature.ai'), desc: t('onboarding.done.feature.aiDesc'), icon: 'ai' },
    { name: t('onboarding.done.feature.flashcards'), desc: t('onboarding.done.feature.flashcardsDesc'), icon: 'flashcards' },
    { name: t('onboarding.done.feature.zotero'), desc: t('onboarding.done.feature.zoteroDesc'), icon: 'zotero' },
  ]

  return (
    <div className="onboarding-step">
      <div className="onboarding-step-header">
        <span className="onboarding-step-indicator">{t('onboarding.step', { current: '3', total: '3' })}</span>
        <div className="onboarding-progress">
          <div className="onboarding-progress-dot active" />
          <div className="onboarding-progress-dot active" />
          <div className="onboarding-progress-dot active" />
        </div>
      </div>

      <h2 className="onboarding-step-title">{t('onboarding.done.title')}</h2>
      <p className="onboarding-step-desc">{t('onboarding.done.tips')}</p>

      <div className="onboarding-shortcuts">
        {shortcuts.map(s => (
          <div key={s.keys} className="onboarding-shortcut">
            <kbd className="onboarding-kbd">{s.keys}</kbd>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="onboarding-features">
        {features.map(f => (
          <div key={f.icon} className="onboarding-feature-card">
            <FeatureIcon icon={f.icon} />
            <div className="onboarding-feature-text">
              <span className="onboarding-feature-name">{f.name}</span>
              <span className="onboarding-feature-desc">{f.desc}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="onboarding-nav onboarding-nav-center">
        <button className="onboarding-btn-primary onboarding-btn-finish" onClick={onFinish}>
          {t('onboarding.done.start')}
        </button>
      </div>
    </div>
  )
}

const FeatureIcon: React.FC<{ icon: string }> = ({ icon }) => {
  switch (icon) {
    case 'canvas':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>
          <line x1="9" y1="6" x2="15" y2="6"/><line x1="6" y1="9" x2="6" y2="15"/><line x1="18" y1="9" x2="18" y2="15"/>
        </svg>
      )
    case 'terminal':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
      )
    case 'ai':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/>
        </svg>
      )
    case 'flashcards':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M14 4v4"/>
        </svg>
      )
    case 'zotero':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      )
    default:
      return null
  }
}
