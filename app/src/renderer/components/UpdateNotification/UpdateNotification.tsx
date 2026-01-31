import React from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'

export const UpdateNotification: React.FC = () => {
  const { updateAvailable, setUpdateAvailable } = useUIStore()
  const { t } = useTranslation()

  if (!updateAvailable?.available) return null

  const handleDownload = () => {
    if (updateAvailable.releaseUrl) {
      window.open(updateAvailable.releaseUrl, '_blank')
    }
  }

  const handleDismiss = () => {
    setUpdateAvailable(null)
  }

  return (
    <div className="update-notification">
      <div className="update-notification-content">
        <svg className="update-notification-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span className="update-notification-text">
          {t('update.available', { version: updateAvailable.version || '' })}
        </span>
        <button className="update-notification-download" onClick={handleDownload}>
          {t('update.download')}
        </button>
      </div>
      <button className="update-notification-dismiss" onClick={handleDismiss} title={t('common.close')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
