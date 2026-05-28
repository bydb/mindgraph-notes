// OllamaSetupStep — Pre-Coach-Pfad, wenn weder Ollama läuft noch ein
// Anthropic-Key gesetzt ist. Drei Optionen in einer Karte:
//   1. Ollama installieren (Install-Anleitung pro OS + Live-Polling)
//   2. Anthropic-API-Key eintragen (reused aus Telegram-Modul)
//   3. Ohne KI weitermachen (App funktioniert auch so)
//
// Sobald Polling Ollama erkennt oder der Anthropic-Key erfolgreich gespeichert
// wurde, ruft die Komponente `onBackendReady()` auf — das Onboarding routet
// dann zum Coach. `onSkip()` springt direkt zum klassischen Wizard ohne KI.

import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../../utils/translations'

interface OllamaSetupStepProps {
  onBackendReady: (backend: 'ollama' | 'anthropic') => void
  onSkip: () => void
  onBack: () => void
}

type OS = 'mac' | 'win' | 'linux'

function detectOS(): OS {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('win')) return 'win'
  return 'linux'
}

const INSTALL_COMMANDS: Record<OS, string> = {
  mac: 'brew install ollama && ollama serve',
  win: 'winget install Ollama.Ollama',
  linux: 'curl -fsSL https://ollama.com/install.sh | sh'
}

// Empfohlenes Default-Modell für Office-User: 8B-Klasse, läuft auf 16-GB-RAM-
// Maschinen, Tool-fähig, gute Email-Analyse-Werte in der Modell-Compat-Matrix.
const DEFAULT_OLLAMA_MODEL = 'ministral'

export const OllamaSetupStep: React.FC<OllamaSetupStepProps> = ({
  onBackendReady,
  onSkip,
  onBack
}) => {
  const { t } = useTranslation()
  const [os, setOs] = useState<OS>(detectOS())
  const [copied, setCopied] = useState(false)
  const [polling, setPolling] = useState(true)
  const [detected, setDetected] = useState(false)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [modelPulling, setModelPulling] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const stoppedRef = useRef(false)
  const modelPullStartedRef = useRef(false)

  // Polling: alle 3 s `coach:precheck` neu aufrufen. Sobald ein Backend da ist,
  // wird auto-Advance ausgelöst (mit 1.2 s Verzögerung, damit der "erkannt"-
  // Status sichtbar bleibt — sonst wirkt es wie ein UI-Glitch).
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const check = async () => {
      if (cancelled || stoppedRef.current) return
      try {
        const res = await window.electronAPI.coachPrecheck()
        if (cancelled) return
        if (res.backend !== 'none') {
          const backend = res.backend
          stoppedRef.current = true
          setDetected(true)
          setPolling(false)
          // Bei Ollama: Default-Modell im Hintergrund pullen, damit Brain/
          // E-Mail-Analyse direkt nach dem Onboarding funktionieren. Wir warten
          // bewusst NICHT auf den Pull, sondern lassen den User durchklicken —
          // er kann den Coach starten, während der Download läuft.
          if (backend === 'ollama' && !modelPullStartedRef.current) {
            modelPullStartedRef.current = true
            setModelPulling(true)
            window.electronAPI
              .ollamaPullModel(DEFAULT_OLLAMA_MODEL)
              .then(result => {
                setModelPulling(false)
                if (result?.success) setModelReady(true)
              })
              .catch(() => setModelPulling(false))
          }
          setTimeout(() => onBackendReady(backend), 1200)
          return
        }
      } catch {
        // Polling-Fehler ignorieren — Nutzer kann manuell prüfen
      }
      timer = setTimeout(check, 3000)
    }

    check()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [onBackendReady])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMANDS[os])
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard kann in sandboxed Renderern blockiert sein — still scheitern
    }
  }

  const handleOpenOllamaSite = () => {
    window.open('https://ollama.com/download', '_blank')
  }

  const handleManualCheck = async () => {
    setPolling(true)
    try {
      const res = await window.electronAPI.coachPrecheck()
      if (res.backend !== 'none') {
        const backend = res.backend
        setDetected(true)
        setPolling(false)
        stoppedRef.current = true
        if (backend === 'ollama' && !modelPullStartedRef.current) {
          modelPullStartedRef.current = true
          setModelPulling(true)
          window.electronAPI
            .ollamaPullModel(DEFAULT_OLLAMA_MODEL)
            .then(result => {
              setModelPulling(false)
              if (result?.success) setModelReady(true)
            })
            .catch(() => setModelPulling(false))
        }
        setTimeout(() => onBackendReady(backend), 1200)
      } else {
        setPolling(false)
      }
    } catch {
      setPolling(false)
    }
  }

  const handleSaveAnthropic = async () => {
    if (!anthropicKey.trim() || savingKey) return
    setSavingKey(true)
    setKeyError(null)
    try {
      const ok = await window.electronAPI.telegramSaveAnthropicKey(anthropicKey.trim())
      if (ok) {
        stoppedRef.current = true
        setDetected(true)
        setTimeout(() => onBackendReady('anthropic'), 600)
      } else {
        setKeyError(t('onboarding.aiSetup.anthropicError'))
      }
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : t('onboarding.aiSetup.anthropicError'))
    } finally {
      setSavingKey(false)
    }
  }

  const instructionKey = (`onboarding.aiSetup.${os}Instructions`) as
    | 'onboarding.aiSetup.macInstructions'
    | 'onboarding.aiSetup.winInstructions'
    | 'onboarding.aiSetup.linuxInstructions'

  return (
    <div className="onboarding-step onboarding-ai-setup">
      <div className="onboarding-step-header">
        <span className="onboarding-step-indicator">{t('onboarding.aiSetup.title')}</span>
      </div>

      <h2 className="onboarding-step-title">{t('onboarding.aiSetup.title')}</h2>
      <p className="onboarding-step-desc">{t('onboarding.aiSetup.subtitle')}</p>
      <p className="onboarding-ai-setup-privacy">{t('onboarding.aiSetup.privacy')}</p>

      {/* Variante 1: Ollama installieren */}
      <section className="onboarding-ai-setup-card">
        <header className="onboarding-ai-setup-card-head">
          <h3>{t('onboarding.aiSetup.installHeading')}</h3>
          <div
            className={`onboarding-ai-setup-status ${detected ? 'detected' : polling ? 'polling' : ''}`}
            role="status"
            aria-live="polite"
          >
            {detected ? (
              <>
                <span className="dot dot-green" />
                {t('onboarding.aiSetup.detected')}
              </>
            ) : polling ? (
              <>
                <span className="dot dot-pulse" />
                {t('onboarding.aiSetup.waiting')}
              </>
            ) : (
              <button
                type="button"
                className="onboarding-btn-text"
                onClick={handleManualCheck}
              >
                {t('onboarding.aiSetup.recheck')}
              </button>
            )}
          </div>
        </header>

        <div className="onboarding-ai-setup-os-tabs" role="tablist">
          {(['mac', 'win', 'linux'] as OS[]).map(opt => (
            <button
              key={opt}
              type="button"
              role="tab"
              aria-selected={os === opt}
              className={`onboarding-ai-setup-os-tab ${os === opt ? 'active' : ''}`}
              onClick={() => setOs(opt)}
            >
              {opt === 'mac' ? 'macOS' : opt === 'win' ? 'Windows' : 'Linux'}
            </button>
          ))}
        </div>

        <p className="onboarding-ai-setup-os-hint">{t(instructionKey)}</p>

        <div className="onboarding-ai-setup-cmd">
          <code>{INSTALL_COMMANDS[os]}</code>
          <button
            type="button"
            className="onboarding-btn-secondary onboarding-btn-small"
            onClick={handleCopy}
          >
            {copied ? t('onboarding.aiSetup.copied') : t('onboarding.aiSetup.copyCommand')}
          </button>
        </div>

        <button
          type="button"
          className="onboarding-btn-text"
          onClick={handleOpenOllamaSite}
        >
          {t('onboarding.aiSetup.openOllamaSite')} ↗
        </button>

        {(modelPulling || modelReady) && (
          <p className="onboarding-ai-setup-os-hint" style={{ marginTop: '8px' }}>
            {modelReady ? `✓ ${t('onboarding.aiSetup.modelReady')}` : t('onboarding.aiSetup.modelPulling')}
          </p>
        )}
      </section>

      {/* Variante 2: Anthropic-Key */}
      <section className="onboarding-ai-setup-card">
        <header className="onboarding-ai-setup-card-head">
          <h3>{t('onboarding.aiSetup.anthropicHeading')}</h3>
        </header>
        <p className="onboarding-ai-setup-os-hint">{t('onboarding.aiSetup.anthropicHint')}</p>
        <div className="onboarding-ai-setup-anthropic">
          <input
            type="password"
            placeholder={t('onboarding.aiSetup.anthropicPlaceholder')}
            value={anthropicKey}
            onChange={e => setAnthropicKey(e.target.value)}
            disabled={savingKey || detected}
          />
          <button
            type="button"
            className="onboarding-btn-primary onboarding-btn-small"
            onClick={handleSaveAnthropic}
            disabled={!anthropicKey.trim() || savingKey || detected}
          >
            {savingKey ? t('onboarding.aiSetup.anthropicSaving') : t('onboarding.aiSetup.anthropicSave')}
          </button>
        </div>
        {keyError && <p className="onboarding-ai-setup-error">{keyError}</p>}
      </section>

      {/* Variante 3: Ohne KI */}
      <section className="onboarding-ai-setup-card onboarding-ai-setup-card-skip">
        <header className="onboarding-ai-setup-card-head">
          <h3>{t('onboarding.aiSetup.skipHeading')}</h3>
        </header>
        <p className="onboarding-ai-setup-os-hint">{t('onboarding.aiSetup.skipHint')}</p>
        <button
          type="button"
          className="onboarding-btn-secondary"
          onClick={onSkip}
        >
          {t('onboarding.aiSetup.continueWithoutAI')}
        </button>
      </section>

      <div className="onboarding-nav">
        <button type="button" className="onboarding-btn-secondary" onClick={onBack}>
          {t('onboarding.back')}
        </button>
      </div>
    </div>
  )
}
