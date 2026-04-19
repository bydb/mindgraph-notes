import React, { useState, useEffect } from 'react'
import { useTranslation } from '../../../utils/translations'
import { useUIStore } from '../../../stores/uiStore'

interface AIStepProps {
  onBack: () => void
  onNext: () => void
}

const capabilities = [
  {
    id: 'quiz',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 4v4" /><path d="M14 4v4" />
      </svg>
    )
  },
  {
    id: 'chat',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    )
  },
  {
    id: 'tools',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      </svg>
    )
  }
]

export const AIStep: React.FC<AIStepProps> = ({ onBack, onNext }) => {
  const { t } = useTranslation()
  const { ollama, setOllama } = useUIStore()
  const [ollamaConnected, setOllamaConnected] = useState(false)
  const [lmStudioConnected, setLmStudioConnected] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [checking, setChecking] = useState(true)

  const [pullModelName, setPullModelName] = useState('ministral')
  const [isPulling, setIsPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)

  useEffect(() => {
    checkConnections()
  }, [])

  const checkConnections = async () => {
    setChecking(true)
    try {
      try {
        const result = await window.electronAPI.ollamaCheck()
        if (result) {
          setOllamaConnected(true)
          const models = await window.electronAPI.ollamaModels()
          if (Array.isArray(models) && models.length > 0) {
            setOllamaModels(models.map((m: { name: string }) => m.name))
            if (!ollama.selectedModel && models.length > 0) {
              setOllama({ selectedModel: models[0].name, enabled: true, backend: 'ollama' })
            }
          }
        }
      } catch {
        setOllamaConnected(false)
      }

      try {
        const result = await window.electronAPI.lmstudioCheck()
        if (result) setLmStudioConnected(true)
      } catch {
        setLmStudioConnected(false)
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

  const handlePullModel = async () => {
    if (!pullModelName || isPulling) return
    setIsPulling(true)
    setPullError(null)
    setPullProgress({ status: 'starting...' })

    window.electronAPI.onOllamaPullProgress((progress) => {
      setPullProgress(progress)
    })

    try {
      const result = await window.electronAPI.ollamaPullModel(pullModelName)
      if (result.success) {
        setPullProgress(null)
        const models = await window.electronAPI.ollamaModels()
        if (Array.isArray(models) && models.length > 0) {
          setOllamaModels(models.map((m: { name: string }) => m.name))
        }
        setOllama({ selectedModel: pullModelName, enabled: true, backend: 'ollama' })
      } else {
        setPullError(result.error || 'Unknown error')
        setPullProgress(null)
      }
    } catch (err) {
      setPullError(err instanceof Error ? err.message : 'Unknown error')
      setPullProgress(null)
    } finally {
      setIsPulling(false)
    }
  }

  return (
    <div className="onboarding-step">
      <div className="onboarding-step-header">
        <span className="onboarding-step-indicator">{t('onboarding.step', { current: '2', total: '4' })}</span>
        <div className="onboarding-progress">
          <div className="onboarding-progress-dot active" />
          <div className="onboarding-progress-dot active" />
          <div className="onboarding-progress-dot" />
          <div className="onboarding-progress-dot" />
        </div>
      </div>

      <h2 className="onboarding-step-title">{t('onboarding.aiFeatures.title')}</h2>
      <p className="onboarding-step-desc">{t('onboarding.aiFeatures.subtitle')}</p>

      {/* Capability cards */}
      <div className="onboarding-capability-cards">
        {capabilities.map(({ id, icon }) => (
          <div key={id} className="onboarding-capability-card">
            <div className="onboarding-capability-icon">{icon}</div>
            <span className="onboarding-capability-text">
              {t(`onboarding.aiFeatures.capability.${id}` as any)}
            </span>
          </div>
        ))}
      </div>

      {/* Connection status */}
      <div className="onboarding-guide-label">{t('onboarding.aiFeatures.connectionLabel')}</div>
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
          {ollamaConnected && ollamaModels.length === 0 && !checking && (
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <select
                  value={pullModelName}
                  onChange={e => setPullModelName(e.target.value)}
                  disabled={isPulling}
                  style={{ flex: 1, fontSize: '13px' }}
                >
                  <optgroup label={t('settings.integrations.ollama.recommendedModels')}>
                    <option value="ministral">Ministral 8B (~5 GB)</option>
                    <option value="gemma3:4b">Gemma 3 4B (~3 GB)</option>
                    <option value="llama3.2">Llama 3.2 (~2 GB)</option>
                    <option value="qwen3:4b">Qwen 3 4B (~3 GB)</option>
                    <option value="mistral">Mistral 7B (~4 GB)</option>
                  </optgroup>
                </select>
                <button
                  className="onboarding-btn-primary"
                  onClick={handlePullModel}
                  disabled={isPulling}
                  style={{ padding: '6px 14px', fontSize: '13px' }}
                >
                  {isPulling ? t('settings.integrations.ollama.pulling') : t('settings.integrations.ollama.download')}
                </button>
              </div>
              {isPulling && pullProgress && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div className="inbox-progress-bar">
                    <div style={{
                      width: pullProgress.total
                        ? `${Math.round((pullProgress.completed || 0) / pullProgress.total * 100)}%`
                        : '100%',
                      ...(pullProgress.total ? {} : { animation: 'indeterminate 1.5s infinite linear' })
                    }} />
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {pullProgress.status}
                    {pullProgress.total ? ` — ${Math.round((pullProgress.completed || 0) / pullProgress.total * 100)}%` : ''}
                  </span>
                </div>
              )}
              {pullError && (
                <span style={{ fontSize: '12px', color: 'var(--text-error, #e53935)' }}>
                  {t('settings.integrations.ollama.pullError')}: {pullError}
                </span>
              )}
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

      {!ollamaConnected && !lmStudioConnected && !checking && (
        <div className="onboarding-ai-hint">
          <span>{t('onboarding.ai.installHint')}</span>
          {' '}
          <span className="onboarding-ai-link">{t('onboarding.ai.downloadOllama')}</span>
        </div>
      )}

      <div className="onboarding-nav">
        <button className="onboarding-btn-secondary" onClick={onBack}>
          {t('onboarding.back')}
        </button>
        <div className="onboarding-nav-right">
          <button className="onboarding-btn-text" onClick={handleSkip}>
            {t('onboarding.aiFeatures.later')}
          </button>
          <button className="onboarding-btn-primary" onClick={onNext}>
            {t('onboarding.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
