import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import type { DisplayHealth } from '../../../shared/displayHealth'
import { REASON_KEYS } from '../Shared/PresentationMode'
import { Row, Toggle } from './SettingsUI'

/**
 * Einstellungen → Allgemein: Präsentationsmodus plus eine kurze Diagnose der aktuellen
 * Bildschirm- und Grafiklage. Liefert ZEILEN (kein eigener Kopf), damit sie in der
 * Darstellungs-Karte sitzen.
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
      <Row label={t('presentation.settingsLabel')} hint={t('presentation.settingsHint')} htmlFor="presentation-mode">
        <Toggle id="presentation-mode" checked={presentationMode} onChange={setPresentationMode} />
      </Row>
      {health && (
        <Row
          label={t('presentation.diagnosticsTitle')}
          hint={
            <>
              {t('presentation.diagDisplays')}: {health.displayCount}
              {' · '}
              {t('presentation.diagRefresh')}: {health.lowestRefreshHz === null ? t('presentation.diagUnknown') : `${health.lowestRefreshHz} Hz`}
              {' · '}
              {t('presentation.diagGpu')}: {gpuLabel}
              {health.reasons.length > 0 && (
                <ul className="sui-hint-list">
                  {health.reasons.map(reason => <li key={reason}>{t(REASON_KEYS[reason])}</li>)}
                </ul>
              )}
            </>
          }
        />
      )}
    </>
  )
}
