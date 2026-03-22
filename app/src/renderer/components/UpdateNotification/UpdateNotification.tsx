import React, { useState, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'

export const UpdateNotification: React.FC = () => {
  const { updateAvailable, setUpdateAvailable } = useUIStore()
  const { t } = useTranslation()
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    // Listen for auto-update events (macOS)
    if (window.electronAPI.onAutoUpdateProgress) {
      window.electronAPI.onAutoUpdateProgress((progress) => {
        setDownloadProgress(progress.percent)
      })
    }
    if (window.electronAPI.onAutoUpdateDownloaded) {
      window.electronAPI.onAutoUpdateDownloaded((info) => {
        setDownloadProgress(null)
        setUpdateReady(true)
        setUpdateAvailable({ available: true, version: info.version, autoUpdate: true })
      })
    }
  }, [setUpdateAvailable])

  if (!updateAvailable?.available) return null

  const handleAction = () => {
    if (updateReady && updateAvailable.autoUpdate) {
      // macOS: Install and restart
      window.electronAPI.installUpdate()
    } else if (updateAvailable.releaseUrl) {
      // Windows/Linux: Open download page
      window.open(updateAvailable.releaseUrl, '_blank')
    }
  }

  const handleDismiss = () => {
    setUpdateAvailable(null)
    setDownloadProgress(null)
    setUpdateReady(false)
  }

  const getStatusText = () => {
    if (downloadProgress !== null) {
      return t('update.downloading', { percent: String(downloadProgress) })
    }
    if (updateReady) {
      return t('update.ready')
    }
    return t('update.available', { version: updateAvailable.version || '' })
  }

  const getButtonText = () => {
    if (updateReady && updateAvailable.autoUpdate) {
      return t('update.restart')
    }
    return t('update.download')
  }

  return (
    <div className="update-notification">
      <div className="update-notification-content">
        <svg className="update-notification-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {updateReady ? (
            // Checkmark icon when ready
            <><circle cx="12" cy="12" r="10" /><polyline points="9 12 12 15 16 10" /></>
          ) : downloadProgress !== null ? (
            // Download icon while downloading
            <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>
          ) : (
            // Info icon when available
            <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>
          )}
        </svg>
        <span className="update-notification-text">
          {getStatusText()}
        </span>
        {downloadProgress === null && (
          <button className="update-notification-download" onClick={handleAction}>
            {getButtonText()}
          </button>
        )}
      </div>
      {downloadProgress === null && (
        <button className="update-notification-dismiss" onClick={handleDismiss} title={t('common.close')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}
