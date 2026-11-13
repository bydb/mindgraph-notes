import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { CloudSetup } from './CloudSetup'
import './Onboarding.css'

// Dieselbe geführte Einrichtung wie im Onboarding, erreichbar aus Chat und Agent, wenn kein
// Modell da ist. Wer im Onboarding „Später einrichten“ gewählt hat, landet sonst in den
// Einstellungen und muss den Weg selbst zusammensuchen.
export const CloudSetupModal: React.FC = () => {
  const open = useUIStore(s => s.cloudSetupOpen)
  const setOpen = useUIStore(s => s.setCloudSetupOpen)
  const { t } = useTranslation()
  const [done, setDone] = useState(false)

  useEffect(() => { if (open) setDone(false) }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div className="cloud-setup-backdrop" role="dialog" aria-modal="true" aria-label={t('cloudSetup.title')}>
      <div className="cloud-setup-dialog">
        <h2 className="onboarding-step-title">{t('cloudSetup.title')}</h2>
        <p className="onboarding-step-desc">{t('cloudSetup.intro')}</p>
        <CloudSetup onDone={() => setDone(true)} />
        <div className="onboarding-nav">
          <span />
          <button type="button" className={done ? 'onboarding-btn-primary' : 'onboarding-btn-secondary'} onClick={() => setOpen(false)}>
            {done ? t('cloudSetup.close') : t('cloudSetup.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
