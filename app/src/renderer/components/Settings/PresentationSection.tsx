import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import type { DisplayHealth } from '../../../shared/displayHealth'
import { REASON_KEYS } from '../Shared/PresentationMode'

/**
 * Einstellungen → Allgemein: Präsentationsmodus plus eine kurze Diagnose der aktuellen
 * Bildschirm- und Grafiklage.
 *
 * Die Diagnose steht bewusst hier und nicht nur im Log: Wenn die App am Beamer einbricht, muss
 * man ohne Terminal sehen können, ob die Grafikbeschleunigung ausgefallen ist.
 */
export const PresentationSection: React.FC = () => {
  const { t } = useTranslation()
  const presentationMode = useUIStore(s => s.presentationMode)
  const setPresentationMode = useUIStore(s => s.setPresentationMode)
  const [health, setHealth] = useState<DisplayHealth | null>(null)

  useEffect(() => {
    let active = true

    window.electronAPI.getDisplayHealth()
      .then(initial => { if (active) setHealth(initial) })
      .catch(() => { /* Diagnose ist optional */ })

    const unsubscribe = window.electronAPI.onDisplayHealthChanged(next => {
      if (active) setHealth(next)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const gpuLabel = health?.hardwareAccelerated === true
    ? t('presentation.diagGpuHardware')
    : health?.hardwareAccelerated === false
      ? t('presentation.diagGpuSoftware')
      : t('presentation.diagUnknown')

  return (
    <>
      <h3>{t('presentation.title')}</h3>
      <div className="settings-row">
        <div>
          <label>{t('presentation.settingsLabel')}</label>
          <div className="settings-hint">{t('presentation.settingsHint')}</div>
        </div>
        <input
          type="checkbox"
          checked={presentationMode}
          onChange={e => setPresentationMode(e.target.checked)}
        />
      </div>

      {health && (
        <div className="settings-row">
          <div>
            <label>{t('presentation.diagnosticsTitle')}</label>
            <div className="settings-hint">
              {t('presentation.diagDisplays')}: {health.displayCount}
              {' · '}
              {t('presentation.diagRefresh')}: {health.lowestRefreshHz === null
                ? t('presentation.diagUnknown')
                : `${health.lowestRefreshHz} Hz`}
              {' · '}
              {t('presentation.diagGpu')}: {gpuLabel}
            </div>
            {health.reasons.length > 0 && (
              <ul className="settings-hint" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {health.reasons.map(reason => (
                  <li key={reason}>{t(REASON_KEYS[reason])}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}
