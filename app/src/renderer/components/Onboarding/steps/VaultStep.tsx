import React, { useState } from 'react'
import { useTranslation } from '../../../utils/translations'

interface VaultStepProps {
  vaultPath: string | null
  setVaultPath: (path: string) => void
  onBack: () => void
  onNext: () => void
}

export const VaultStep: React.FC<VaultStepProps> = ({ vaultPath, setVaultPath, onBack, onNext }) => {
  const { t, language } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      console.log('[Onboarding] Creating starter vault at:', result, 'language:', language)
      await window.electronAPI.createStarterVault(result, language)
      console.log('[Onboarding] Starter vault created successfully')
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
        <span className="onboarding-step-indicator">{t('onboarding.step', { current: '1', total: '3' })}</span>
        <div className="onboarding-progress">
          <div className="onboarding-progress-dot active" />
          <div className="onboarding-progress-dot" />
          <div className="onboarding-progress-dot" />
        </div>
      </div>

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
      </div>

      {error && (
        <div className="onboarding-vault-error">{error}</div>
      )}

      {vaultPath && (
        <div className="onboarding-vault-selected">
          {t('onboarding.vault.selected', { path: vaultPath.split(/[/\\]/).pop() || vaultPath })}
        </div>
      )}

      <div className="onboarding-nav">
        <button className="onboarding-btn-secondary" onClick={onBack}>
          {t('onboarding.back')}
        </button>
        <button className="onboarding-btn-primary" onClick={onNext} disabled={!vaultPath || loading}>
          {t('onboarding.next')}
        </button>
      </div>
    </div>
  )
}
