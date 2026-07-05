import React from 'react'
import { useTranslation } from '../../../utils/translations'

interface StepIndicatorProps {
  current: number
  total: number
}

// Gemeinsame Schrittanzeige für alle Wizard-Steps. Die Gesamtzahl hängt vom
// gewählten Profil ab (office/professional durchlaufen zusätzlich den
// E-Mail-Setup-Step) — deshalb dynamisch statt hartcodierter "X von 4"-Header.
export const StepIndicator: React.FC<StepIndicatorProps> = ({ current, total }) => {
  const { t } = useTranslation()

  return (
    <div className="onboarding-step-header">
      <span className="onboarding-step-indicator">
        {t('onboarding.step', { current: String(current), total: String(total) })}
      </span>
      <div className="onboarding-progress">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`onboarding-progress-dot ${i < current ? 'active' : ''}`} />
        ))}
      </div>
    </div>
  )
}
