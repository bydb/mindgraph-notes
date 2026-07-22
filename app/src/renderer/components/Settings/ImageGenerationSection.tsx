// Bild-Generierung (image-generation-Modul) — Settings-Sektion im KI-Tab.
//
// Konfiguriert den Google-Imagen-API-Key des Nutzers. Der Key wird via safeStorage
// im Main-Prozess verschlüsselt abgelegt (IPC image-gen-save/load/delete-key) —
// NICHT im uiStore/localStorage (dort lag er vor der Modul-Entflechtung im Klartext).
// Gerendert nur bei aktivem Modul (Gate in Settings.tsx, analog WebResearchSection).

import React, { useEffect, useState } from 'react'
import { useTranslation } from '../../utils/translations'

export const ImageGenerationSection: React.FC = () => {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hinterlegten Key beim Mounten laden (für die Anzeige im Formular).
  useEffect(() => {
    window.electronAPI.imageGenLoadKey()
      .then(key => {
        if (key) {
          setApiKey(key)
          setSaved(true)
        }
      })
      .catch(() => {})
  }, [])

  const save = async () => {
    setError(null)
    if (!apiKey) {
      const res = await window.electronAPI.imageGenDeleteKey()
      if (res.success) setSaved(true)
      return
    }
    const res = await window.electronAPI.imageGenSaveKey(apiKey)
    if (res.success) {
      setSaved(true)
    } else {
      setError(res.error || t('settings.ai.imageGen.saveFailed'))
    }
  }

  return (
    <>
      <h4 className="settings-section-title">{t('settings.ai.imageGen.title')}</h4>
      <p className="settings-hint">{t('settings.ai.imageGen.description')}</p>

      <div className="settings-row">
        <label>{t('settings.ai.imageGen.apiKey')}</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => { setApiKey(e.target.value); setSaved(false) }}
          placeholder="AIzaSy..."
          className="settings-input"
        />
      </div>

      <div className="settings-row" style={{ gap: '8px' }}>
        <button className="settings-btn" onClick={save}>
          {saved ? t('settings.ai.imageGen.saved') : t('settings.ai.imageGen.save')}
        </button>
        {saved && apiKey && (
          <span className="status-connected">{t('settings.ai.imageGen.keyStored')}</span>
        )}
      </div>
      {error && (
        <div className="settings-row">
          <span className="settings-error-detail">{error}</span>
        </div>
      )}
      <p className="settings-hint">{t('settings.ai.imageGen.privacyHint')}</p>
    </>
  )
}
