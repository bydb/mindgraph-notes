import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import type { DisplayHealth, DisplayRiskReason } from '../../../shared/displayHealth'
import './PresentationMode.css'

/**
 * Hält den Präsentationsmodus mit dem DOM synchron und bietet ihn an, sobald der Main-Prozess
 * eine riskante Bildschirm-Konstellation meldet (Beamer, AirPlay, ausgefallene GPU).
 *
 * Bewusst nur ein Angebot, kein Automatismus: Die App schaltet das Aussehen nicht ungefragt um.
 * Wird global in App.tsx gemountet.
 */
export const PresentationMode: React.FC = () => {
  const { t } = useTranslation()
  const presentationMode = useUIStore(s => s.presentationMode)
  const hintDismissed = useUIStore(s => s.presentationHintDismissed)
  const setPresentationMode = useUIStore(s => s.setPresentationMode)
  const setHintDismissed = useUIStore(s => s.setPresentationHintDismissed)
  const [health, setHealth] = useState<DisplayHealth | null>(null)

  // Klasse am body, damit die Regeln in index.css alles erreichen — auch Inhalte, die
  // per createPortal außerhalb des React-Baums hängen (Compose-Modal, Command Palette).
  useEffect(() => {
    document.body.classList.toggle('presentation-mode', presentationMode)
    return () => document.body.classList.remove('presentation-mode')
  }, [presentationMode])

  useEffect(() => {
    let active = true

    window.electronAPI.getDisplayHealth()
      .then(initial => { if (active) setHealth(initial) })
      .catch(() => { /* Diagnose ist optional — ohne sie läuft die App normal weiter */ })

    const unsubscribe = window.electronAPI.onDisplayHealthChanged(next => {
      if (active) setHealth(next)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (!health?.risky || presentationMode || hintDismissed) return null

  return (
    <div className="presentation-hint" role="status">
      <div className="presentation-hint-head">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        <strong>{t('presentation.hintTitle')}</strong>
        <button
          className="presentation-hint-close"
          onClick={() => setHintDismissed(true)}
          aria-label={t('presentation.dismiss')}
          title={t('presentation.dismiss')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="presentation-hint-body">{t('presentation.hintBody')}</p>

      <ul className="presentation-hint-reasons">
        {health.reasons.map(reason => (
          <li key={reason}>{t(REASON_KEYS[reason])}</li>
        ))}
      </ul>

      <button className="presentation-hint-action" onClick={() => setPresentationMode(true)}>
        {t('presentation.enable')}
      </button>
    </div>
  )
}

/**
 * Reason-Code → Übersetzungs-Key, explizit statt per Template zusammengebaut: So merkt der
 * Compiler sofort, wenn ein neuer Grund ohne Übersetzung dazukommt.
 */
export const REASON_KEYS: Record<DisplayRiskReason, TranslationKey> = {
  'software-rendering': 'presentation.reason.software-rendering',
  'low-refresh-rate': 'presentation.reason.low-refresh-rate',
  'mixed-scale-factors': 'presentation.reason.mixed-scale-factors',
  'likely-mirroring': 'presentation.reason.likely-mirroring'
}
