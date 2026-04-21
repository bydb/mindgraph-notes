import React, { useEffect } from 'react'
import { useVoiceStore } from '../../stores/voiceStore'
import { useIsModuleEnabled } from '../../utils/modules'
import { useTranslation } from '../../utils/translations'

// Schwebender Toast unten rechts, der Voice-Fehler sichtbar macht und den
// laufenden Transkriptions-Status anzeigt. Wird global in App.tsx gemountet.
export const VoiceStatusToast: React.FC = () => {
  const { t } = useTranslation()
  const speechEnabled = useIsModuleEnabled('speech')
  const status = useVoiceStore(s => s.status)
  const lastError = useVoiceStore(s => s.lastError)
  const setError = useVoiceStore(s => s.setError)

  // Fehler nach 6 Sekunden automatisch wegblenden
  useEffect(() => {
    if (!lastError) return
    const timer = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(timer)
  }, [lastError, setError])

  if (!speechEnabled) return null

  const isWhisperMissing = lastError != null && /whisper/i.test(lastError) && /nicht installiert|not installed|ENOENT|not found/i.test(lastError)

  const openSpeechSettings = () => {
    window.dispatchEvent(new CustomEvent('mindgraph:openSettings', { detail: { tab: 'speech' } }))
    setError(null)
  }

  // Transkriptions-Indikator
  if (status === 'transcribing') {
    return (
      <div className="voice-toast voice-toast-info">
        <div className="voice-toast-spinner" />
        <span>{t('voice.transcribing')}</span>
      </div>
    )
  }

  if (!lastError) return null

  return (
    <div className="voice-toast voice-toast-error" role="alert">
      <div className="voice-toast-content">
        <div className="voice-toast-message">{lastError}</div>
        {isWhisperMissing && (
          <button className="voice-toast-action" onClick={openSpeechSettings}>
            {t('voice.openSettings')}
          </button>
        )}
      </div>
      <button className="voice-toast-close" onClick={() => setError(null)} aria-label="Schließen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
