import React, { useState } from 'react'
import { useTranslation } from '../../../utils/translations'
import type { UserProfile } from '../../../stores/uiStore'

interface IntentStepProps {
  selectedProfile: UserProfile
  onSelectProfile: (profile: UserProfile) => void
  vaultPath: string | null
  setVaultPath: (path: string) => void
  onBack: () => void
  onNext: () => void
}

const profiles: { id: Exclude<UserProfile, null>; icon: React.ReactNode }[] = [
  {
    id: 'student',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
        <path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/>
      </svg>
    )
  },
  {
    id: 'researcher',
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
    id: 'professional',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        <line x1="12" y1="12" x2="12" y2="12.01"/>
      </svg>
    )
  },
  {
    id: 'writer',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
      </svg>
    )
  },
  {
    id: 'developer',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
    )
  },
  {
    id: 'viewer',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    )
  }
]

export const IntentStep: React.FC<IntentStepProps> = ({
  selectedProfile,
  onSelectProfile,
  vaultPath,
  setVaultPath,
  onBack,
  onNext
}) => {
  const { t, language } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showVault, setShowVault] = useState(false)

  const handleOpenExisting = async () => {
    setError(null)
    try {
      const result = await window.electronAPI.openVault()
      if (result) {
        setVaultPath(result)
      }
    } catch (err) {
      console.error('[Onboarding] Failed to open vault:', err)
      setError(String(err))
    }
  }

  const confirmIfNotEmpty = async (dirPath: string): Promise<boolean> => {
    const isEmpty = await window.electronAPI.checkDirectoryEmpty(dirPath)
    if (isEmpty) return true
    return new Promise((resolve) => {
      const confirmed = window.confirm(t('onboarding.vault.directoryNotEmpty'))
      resolve(confirmed)
    })
  }

  const handleCreateStarter = async () => {
    setError(null)
    try {
      const result = await window.electronAPI.selectVaultDirectory()
      if (!result) return
      const confirmed = await confirmIfNotEmpty(result)
      if (!confirmed) return
      setLoading(true)
      await window.electronAPI.createStarterVault(result, language)
      setVaultPath(result)
    } catch (err) {
      console.error('[Onboarding] Failed to create starter vault:', err)
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleCreateEmpty = async () => {
    setError(null)
    try {
      const result = await window.electronAPI.selectVaultDirectory()
      if (!result) return
      const confirmed = await confirmIfNotEmpty(result)
      if (!confirmed) return
      setLoading(true)
      await window.electronAPI.createEmptyVault(result)
      setVaultPath(result)
    } catch (err) {
      console.error('[Onboarding] Failed to create empty vault:', err)
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

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

      {!showVault ? (
        <>
          <h2 className="onboarding-step-title">{t('onboarding.intent.title')}</h2>
          <p className="onboarding-step-desc">{t('onboarding.intent.subtitle')}</p>

          <div className="onboarding-intent-grid">
            {profiles.map(({ id, icon }) => (
              <button
                key={id}
                className={`onboarding-intent-card ${selectedProfile === id ? 'selected' : ''}`}
                onClick={() => onSelectProfile(selectedProfile === id ? null : id)}
              >
                <div className="onboarding-intent-icon">{icon}</div>
                <div className="onboarding-intent-text">
                  <span className="onboarding-intent-title">
                    {t(`onboarding.intent.${id}.title` as any)}
                  </span>
                  <span className="onboarding-intent-badges">
                    {t(`onboarding.intent.${id}.badges` as any)}
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
                <button className="onboarding-btn-text" onClick={() => setShowVault(true)}>
                  {t('onboarding.profile.skip')}
                </button>
              )}
              <button className="onboarding-btn-primary" onClick={() => setShowVault(true)}>
                {t('onboarding.next')}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <h2 className="onboarding-step-title">{t('onboarding.vault.title')}</h2>

          <div className="onboarding-vault-options">
            <button className="onboarding-vault-option" onClick={handleOpenExisting} disabled={loading}>
              <div className="onboarding-vault-option-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div className="onboarding-vault-option-text">
                <span className="onboarding-vault-option-title">{t('onboarding.vault.openExisting')}</span>
                <span className="onboarding-vault-option-desc">{t('onboarding.vault.openExistingDesc')}</span>
              </div>
            </button>

            {selectedProfile !== 'viewer' && (
              <button className="onboarding-vault-option" onClick={handleCreateStarter} disabled={loading}>
                <div className="onboarding-vault-option-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <div className="onboarding-vault-option-text">
                  <span className="onboarding-vault-option-title">{t('onboarding.vault.createStarter')}</span>
                  <span className="onboarding-vault-option-desc">{t('onboarding.vault.createStarterDesc')}</span>
                </div>
                {loading && <span className="onboarding-vault-loading">...</span>}
              </button>
            )}

            {selectedProfile !== 'viewer' && (
              <button className="onboarding-vault-option" onClick={handleCreateEmpty} disabled={loading}>
                <div className="onboarding-vault-option-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    <line x1="12" y1="11" x2="12" y2="17"/>
                    <line x1="9" y1="14" x2="15" y2="14"/>
                  </svg>
                </div>
                <div className="onboarding-vault-option-text">
                  <span className="onboarding-vault-option-title">{t('onboarding.vault.createEmpty')}</span>
                  <span className="onboarding-vault-option-desc">{t('onboarding.vault.createEmptyDesc')}</span>
                </div>
              </button>
            )}
          </div>

          {error && <div className="onboarding-vault-error">{error}</div>}

          {vaultPath && (
            <div className="onboarding-vault-selected">
              {t('onboarding.vault.selected', { path: vaultPath.split(/[/\\]/).pop() || vaultPath })}
            </div>
          )}

          <div className="onboarding-nav">
            <button className="onboarding-btn-secondary" onClick={() => setShowVault(false)}>
              {t('onboarding.back')}
            </button>
            <button className="onboarding-btn-primary" onClick={onNext} disabled={!vaultPath || loading}>
              {t('onboarding.next')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
