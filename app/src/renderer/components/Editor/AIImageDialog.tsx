import React, { useState, useRef, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'

interface AIImageDialogProps {
  onClose: () => void
  onInsert: (markdownImage: string) => void
}

interface ImageSettings {
  width: number
  height: number
  steps: number
}

const PRESET_SIZES = [
  { key: 'sizeSmall', width: 256, height: 256 },
  { key: 'sizeMedium', width: 512, height: 512 },
  { key: 'sizeLarge', width: 768, height: 768 },
  { key: 'sizeWide', width: 768, height: 512 },
  { key: 'sizeTall', width: 512, height: 768 },
]

export const AIImageDialog: React.FC<AIImageDialogProps> = ({ onClose, onInsert }) => {
  const { t } = useTranslation()
  const { ollama } = useUIStore()
  const { vaultPath } = useNotesStore()

  const [prompt, setPrompt] = useState('')
  const [imageModels, setImageModels] = useState<Array<{ name: string; size: number }>>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [settings, setSettings] = useState<ImageSettings>({ width: 512, height: 512, steps: 8 })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const promptInputRef = useRef<HTMLTextAreaElement>(null)

  // Load available image models on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        const models = await window.electronAPI.ollamaImageModels()
        setImageModels(models)
        if (models.length > 0) {
          setSelectedModel(models[0].name)
        }
      } catch (err) {
        console.error('Failed to load image models:', err)
      }
    }
    loadModels()
  }, [])

  // Focus prompt input
  useEffect(() => {
    if (promptInputRef.current) {
      promptInputRef.current.focus()
    }
  }, [])

  // Listen for progress updates
  useEffect(() => {
    window.electronAPI.onOllamaImageProgress((prog) => {
      setProgress(prog)
    })
  }, [])

  const handleGenerate = async () => {
    if (!prompt.trim() || !selectedModel || !vaultPath) return

    setIsLoading(true)
    setError(null)
    setProgress(null)

    try {
      const result = await window.electronAPI.ollamaGenerateImage({
        model: selectedModel,
        prompt: prompt.trim(),
        vaultPath,
        width: settings.width,
        height: settings.height,
        steps: settings.steps
      })

      if (result.success && result.fileName) {
        // Insert markdown image reference
        const markdownImage = `![[${result.fileName}]]`
        onInsert(markdownImage)
        onClose()
      } else {
        setError(result.error || t('aiImage.unknownError'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('aiImage.unknownError'))
    } finally {
      setIsLoading(false)
      setProgress(null)
    }
  }

  const handlePresetSize = (preset: typeof PRESET_SIZES[0]) => {
    setSettings(prev => ({ ...prev, width: preset.width, height: preset.height }))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleGenerate()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const formatSize = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb.toFixed(1)} GB`
  }

  if (!ollama.enabled) {
    return (
      <div className="ai-image-dialog-overlay" onClick={onClose}>
        <div className="ai-image-dialog" onClick={e => e.stopPropagation()}>
          <div className="ai-image-dialog-header">
            <h3>{t('aiImage.title')}</h3>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
          <div className="ai-image-dialog-disabled">
            {t('aiImage.disabled')}
            <br />
            {t('aiImage.enableOllama')}
          </div>
        </div>
      </div>
    )
  }

  if (imageModels.length === 0) {
    return (
      <div className="ai-image-dialog-overlay" onClick={onClose}>
        <div className="ai-image-dialog" onClick={e => e.stopPropagation()}>
          <div className="ai-image-dialog-header">
            <h3>{t('aiImage.title')}</h3>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
          <div className="ai-image-dialog-disabled">
            {t('aiImage.noModel')}
            <br />
            {t('aiImage.installModel')} <code>ollama pull x/flux2-klein</code>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-image-dialog-overlay" onClick={onClose}>
      <div className="ai-image-dialog" onClick={e => e.stopPropagation()}>
        <div className="ai-image-dialog-header">
          <h3>{t('aiImage.title')}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="ai-image-dialog-content">
          {/* Model Selection */}
          <div className="ai-image-field">
            <label>{t('aiImage.model')}</label>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              disabled={isLoading}
            >
              {imageModels.map(model => (
                <option key={model.name} value={model.name}>
                  {model.name} ({formatSize(model.size)})
                </option>
              ))}
            </select>
          </div>

          {/* Prompt */}
          <div className="ai-image-field">
            <label>{t('aiImage.description')}</label>
            <textarea
              ref={promptInputRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('aiImage.placeholder')}
              rows={3}
              disabled={isLoading}
            />
            <small>{t('aiImage.tip')}</small>
          </div>

          {/* Size Presets */}
          <div className="ai-image-field">
            <label>{t('aiImage.size')}</label>
            <div className="ai-image-presets">
              {PRESET_SIZES.map(preset => (
                <button
                  key={preset.key}
                  className={`preset-btn ${settings.width === preset.width && settings.height === preset.height ? 'active' : ''}`}
                  onClick={() => handlePresetSize(preset)}
                  disabled={isLoading}
                >
                  {t(`aiImage.${preset.key}` as const)}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="ai-image-advanced-toggle">
            <button onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced ? '▼' : '▶'} {t('aiImage.advancedSettings')}
            </button>
          </div>

          {showAdvanced && (
            <div className="ai-image-advanced">
              <div className="ai-image-field-row">
                <div className="ai-image-field">
                  <label>{t('aiImage.width')}</label>
                  <input
                    type="number"
                    value={settings.width}
                    onChange={e => setSettings(prev => ({ ...prev, width: parseInt(e.target.value) || 512 }))}
                    min={64}
                    max={1024}
                    step={64}
                    disabled={isLoading}
                  />
                </div>
                <div className="ai-image-field">
                  <label>{t('aiImage.height')}</label>
                  <input
                    type="number"
                    value={settings.height}
                    onChange={e => setSettings(prev => ({ ...prev, height: parseInt(e.target.value) || 512 }))}
                    min={64}
                    max={1024}
                    step={64}
                    disabled={isLoading}
                  />
                </div>
                <div className="ai-image-field">
                  <label>{t('aiImage.steps')}</label>
                  <input
                    type="number"
                    value={settings.steps}
                    onChange={e => setSettings(prev => ({ ...prev, steps: parseInt(e.target.value) || 8 }))}
                    min={1}
                    max={50}
                    disabled={isLoading}
                  />
                </div>
              </div>
              <small>{t('aiImage.stepsTip')}</small>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="ai-image-error">
              {error}
            </div>
          )}

          {/* Progress */}
          {isLoading && (
            <div className="ai-image-progress">
              <div className="ai-image-progress-bar">
                <div
                  className="ai-image-progress-fill"
                  style={{ width: progress ? `${(progress.completed / progress.total) * 100}%` : '0%' }}
                />
              </div>
              <span>
                {progress ? t('aiImage.stepProgress', { current: progress.completed, total: progress.total }) : t('aiImage.starting')}
              </span>
            </div>
          )}
        </div>

        <div className="ai-image-dialog-footer">
          <button className="cancel-btn" onClick={onClose} disabled={isLoading}>
            {t('aiImage.cancel')}
          </button>
          <button
            className="generate-btn"
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim() || !selectedModel}
          >
            {isLoading ? t('aiImage.generating') : t('aiImage.generate')}
          </button>
        </div>
      </div>
    </div>
  )
}
