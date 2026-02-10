import React, { useState, useEffect } from 'react'
import { useTranslation } from '../../../utils/translations'
import { useUIStore } from '../../../stores/uiStore'

interface AISetupStepProps {
  onBack: () => void
  onNext: () => void
}

export const AISetupStep: React.FC<AISetupStepProps> = ({ onBack, onNext }) => {
  const { t } = useTranslation()
  const { ollama, setOllama } = useUIStore()
  const [ollamaConnected, setOllamaConnected] = useState(false)
  const [lmStudioConnected, setLmStudioConnected] = useState(false)
  const [zoteroConnected, setZoteroConnected] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    checkConnections()
  }, [])

  const checkConnections = async () => {
    setChecking(true)
    try {
      // Check Ollama
      try {
        const result = await window.electronAPI.ollamaCheck()
        if (result) {
          setOllamaConnected(true)
          const models = await window.electronAPI.ollamaModels()
          if (Array.isArray(models) && models.length > 0) {
            setOllamaModels(models.map((m: { name: string }) => m.name))
            // Auto-select first model if none selected
            if (!ollama.selectedModel && models.length > 0) {
              setOllama({ selectedModel: models[0].name, enabled: true, backend: 'ollama' })
            }
          }
        }
      } catch {
        setOllamaConnected(false)
      }

      // Check LM Studio
      try {
        const result = await window.electronAPI.lmstudioCheck()
        if (result) {
          setLmStudioConnected(true)
        }
      } catch {
        setLmStudioConnected(false)
      }

      // Check Zotero + Better BibTeX
      try {
        const result = await window.electronAPI.zoteroCheck()
        setZoteroConnected(!!result)
      } catch {
        setZoteroConnected(false)
      }
    } finally {
      setChecking(false)
    }
  }

  const handleSkip = () => {
    setOllama({ enabled: false })
    onNext()
  }

  const handleModelChange = (model: string) => {
    setOllama({ selectedModel: model, enabled: true, backend: 'ollama' })
  }

  return (
    <div className="onboarding-step">
      <div className="onboarding-step-header">
        <span className="onboarding-step-indicator">{t('onboarding.step', { current: '2', total: '3' })}</span>
        <div className="onboarding-progress">
          <div className="onboarding-progress-dot active" />
          <div className="onboarding-progress-dot active" />
          <div className="onboarding-progress-dot" />
        </div>
      </div>

      <h2 className="onboarding-step-title">{t('onboarding.integrations.title')}</h2>
      <p className="onboarding-step-desc">{t('onboarding.integrations.description')}</p>

      {/* KI-Modelle */}
      <div className="onboarding-guide-label">{t('onboarding.integrations.aiLabel')}</div>
      <div className="onboarding-ai-providers">
        <div className={`onboarding-ai-provider ${ollamaConnected ? 'connected' : ''}`}>
          <div className="onboarding-ai-provider-header">
            <span className="onboarding-ai-provider-name">Ollama</span>
            <span className={`onboarding-ai-status ${ollamaConnected ? 'connected' : ''}`}>
              {checking ? '...' : ollamaConnected ? t('onboarding.ai.connected') : t('onboarding.ai.notDetected')}
            </span>
          </div>
          {ollamaConnected && ollamaModels.length > 0 && (
            <div className="onboarding-ai-model-select">
              <label>{t('onboarding.ai.model')}:</label>
              <select
                value={ollama.selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
              >
                {ollamaModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className={`onboarding-ai-provider ${lmStudioConnected ? 'connected' : ''}`}>
          <div className="onboarding-ai-provider-header">
            <span className="onboarding-ai-provider-name">LM Studio</span>
            <span className={`onboarding-ai-status ${lmStudioConnected ? 'connected' : ''}`}>
              {checking ? '...' : lmStudioConnected ? t('onboarding.ai.connected') : t('onboarding.ai.notDetected')}
            </span>
          </div>
        </div>
      </div>

      {!ollamaConnected && !checking && (
        <div className="onboarding-ai-hint">
          <span>{t('onboarding.ai.installHint')}</span>
          {' '}
          <span className="onboarding-ai-link">{t('onboarding.ai.downloadOllama')}</span>
        </div>
      )}

      {/* Zotero */}
      <div className="onboarding-guide-label" style={{ marginTop: 18 }}>{t('onboarding.integrations.zoteroLabel')}</div>
      <div className="onboarding-ai-providers">
        <div className={`onboarding-ai-provider ${zoteroConnected ? 'connected' : ''}`}>
          <div className="onboarding-ai-provider-header">
            <span className="onboarding-ai-provider-name">Zotero + Better BibTeX</span>
            <span className={`onboarding-ai-status ${zoteroConnected ? 'connected' : ''}`}>
              {checking ? '...' : zoteroConnected ? t('onboarding.ai.connected') : t('onboarding.ai.notDetected')}
            </span>
          </div>
        </div>
      </div>

      {!zoteroConnected && !checking && (
        <div className="onboarding-ai-hint">
          {t('onboarding.integrations.zoteroHint')}
        </div>
      )}

      <div className="onboarding-nav">
        <button className="onboarding-btn-secondary" onClick={onBack}>
          {t('onboarding.back')}
        </button>
        <div className="onboarding-nav-right">
          <button className="onboarding-btn-text" onClick={handleSkip}>
            {t('onboarding.ai.skip')}
          </button>
          <button className="onboarding-btn-primary" onClick={onNext}>
            {t('onboarding.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
