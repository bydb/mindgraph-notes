import React from 'react'
import { useTranslation } from '../../../utils/translations'

interface FeaturesStepProps {
  onFinish: () => void
  onBack: () => void
}

export const FeaturesStep: React.FC<FeaturesStepProps> = ({ onFinish, onBack }) => {
  const { t } = useTranslation()

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

      <h2 className="onboarding-step-title">{t('onboarding.guide.title')}</h2>
      <p className="onboarding-step-desc">{t('onboarding.guide.subtitle')}</p>

      {/* Ansichten */}
      <div className="onboarding-guide-section">
        <span className="onboarding-guide-label">{t('onboarding.guide.views')}</span>
        <div className="onboarding-guide-row">
          <div className="onboarding-guide-item">
            <div className="onboarding-guide-icon-text">Editor</div>
            <span>{t('onboarding.guide.editor')}</span>
          </div>
          <div className="onboarding-guide-item">
            <div className="onboarding-guide-icon-text">Split</div>
            <span>{t('onboarding.guide.split')}</span>
          </div>
          <div className="onboarding-guide-item">
            <div className="onboarding-guide-icon-text">Canvas</div>
            <span>{t('onboarding.guide.canvas')}</span>
          </div>
        </div>
      </div>

      {/* Editor-Modi */}
      <div className="onboarding-guide-section">
        <span className="onboarding-guide-label">{t('onboarding.guide.editorModes')}</span>
        <div className="onboarding-guide-row">
          <div className="onboarding-guide-item">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{t('onboarding.guide.modeEdit')}</span>
          </div>
          <div className="onboarding-guide-item">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 3C4.5 3 1.5 8 1.5 8C1.5 8 4.5 13 8 13C11.5 13 14.5 8 14.5 8C14.5 8 11.5 3 8 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M11.5 2.5L13.5 4.5L10 8L8.5 6.5L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{t('onboarding.guide.modeLivePreview')}</span>
          </div>
          <div className="onboarding-guide-item">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 3C4.5 3 1.5 8 1.5 8C1.5 8 4.5 13 8 13C11.5 13 14.5 8 14.5 8C14.5 8 11.5 3 8 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span>{t('onboarding.guide.modePreview')}</span>
          </div>
        </div>
      </div>

      {/* Toolbar-Icons rechts */}
      <div className="onboarding-guide-section">
        <span className="onboarding-guide-label">{t('onboarding.guide.toolbar')}</span>
        <div className="onboarding-guide-grid">
          <div className="onboarding-guide-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            <span>{t('onboarding.guide.tags')}</span>
          </div>
          <div className="onboarding-guide-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 4v4" /><path d="M14 4v4" />
            </svg>
            <span>{t('onboarding.guide.flashcards')}</span>
          </div>
          <div className="onboarding-guide-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>{t('onboarding.guide.chat')}</span>
          </div>
          <div className="onboarding-guide-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>{t('onboarding.guide.overdue')}</span>
          </div>
          <div className="onboarding-guide-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            <span>{t('onboarding.guide.terminal')}</span>
          </div>
          <div className="onboarding-guide-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span>{t('onboarding.guide.settings')}</span>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="onboarding-guide-section">
        <span className="onboarding-guide-label">{t('onboarding.guide.sidebar')}</span>
        <div className="onboarding-guide-grid">
          <div className="onboarding-guide-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
            <span>{t('onboarding.guide.sidebarToggle')}</span>
          </div>
          <div className="onboarding-guide-item">
            <div className="onboarding-guide-icon-text" style={{ fontSize: '18px', fontWeight: 600 }}>+</div>
            <span>{t('onboarding.guide.newNote')}</span>
          </div>
          <div className="onboarding-guide-item">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M2 4.5A1.5 1.5 0 013.5 3h3.379a1.5 1.5 0 011.06.44l.622.62a.5.5 0 00.354.147H12.5A1.5 1.5 0 0114 5.707V11.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 7v4M6 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <span>{t('onboarding.guide.newFolder')}</span>
          </div>
        </div>
      </div>

      <div className="onboarding-nav">
        <button className="onboarding-btn-secondary" onClick={onBack}>
          {t('onboarding.back')}
        </button>
        <button className="onboarding-btn-primary onboarding-btn-finish" onClick={onFinish}>
          {t('onboarding.done.start')}
        </button>
      </div>
    </div>
  )
}
