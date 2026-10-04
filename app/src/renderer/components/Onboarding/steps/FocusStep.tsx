import React from 'react'
import { useTranslation } from '../../../utils/translations'
import type { WorkFocus } from '../../../../shared/workFocus'
import { StepIndicator } from './StepIndicator'
import { AgentFocusHint } from './AgentFocusHint'

interface FocusStepProps {
  value: WorkFocus
  onChange: (focus: WorkFocus) => void
  onBack: () => void
  onNext: () => void
  /** Im Wizard mit Schrittanzeige; im Direktweg „Vault öffnen“ ohne. */
  stepNumber?: number
  totalSteps?: number
  /** Direktweg: der KI-Schritt entfällt, deshalb steht der Rechner-Hinweis hier. */
  showAgentHint?: boolean
  nextLabel?: string
  error?: string | null
  busy?: boolean
}

// Schwerpunkt-Schritt (docs/codex-collab/schwerpunkt-beim-einrichten.md §4). Gespeichert
// wird erst beim Abschluss des Assistenten — diese Ansicht hält nur die Auswahl.
const OPTIONS: Array<{ id: WorkFocus; icon: React.ReactNode }> = [
  {
    id: 'notes',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    )
  },
  {
    id: 'agent',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8V4H8"/>
        <rect x="4" y="12" width="16" height="8" rx="2"/>
        <path d="M2 14h2"/>
        <path d="M20 14h2"/>
        <path d="M15 16h.01"/>
        <path d="M9 16h.01"/>
      </svg>
    )
  }
]

export const FocusStep: React.FC<FocusStepProps> = ({ value, onChange, onBack, onNext, stepNumber, totalSteps, showAgentHint, nextLabel, error, busy }) => {
  const { t } = useTranslation()
  return (
    <div className="onboarding-step">
      {stepNumber !== undefined && totalSteps !== undefined && <StepIndicator current={stepNumber} total={totalSteps} />}

      <h2 className="onboarding-step-title">{t('onboarding.focus.title')}</h2>
      <p className="onboarding-step-desc">{t('onboarding.focus.subtitle')}</p>

      <div className="onboarding-intent-grid" role="radiogroup" aria-label={t('onboarding.focus.title')}>
        {OPTIONS.map(({ id, icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            className={`onboarding-intent-card ${value === id ? 'selected' : ''}`}
            onClick={() => onChange(id)}
          >
            <div className="onboarding-intent-icon">{icon}</div>
            <div className="onboarding-intent-text">
              <span className="onboarding-intent-title">{t(`onboarding.focus.${id}.title` as const)}</span>
              <span className="onboarding-intent-badges">{t(`onboarding.focus.${id}.desc` as const)}</span>
            </div>
          </button>
        ))}
      </div>

      {showAgentHint && value === 'agent' && <AgentFocusHint />}
      {error && <div className="onboarding-ai-hint onboarding-error" role="alert">{error}</div>}

      <div className="onboarding-nav">
        <button className="onboarding-btn-secondary" onClick={onBack} disabled={busy}>
          {t('onboarding.back')}
        </button>
        <button className="onboarding-btn-primary" onClick={onNext} disabled={busy}>
          {nextLabel ?? t('onboarding.next')}
        </button>
      </div>
    </div>
  )
}
