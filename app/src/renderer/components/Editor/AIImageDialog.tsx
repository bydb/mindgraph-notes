import React, { useState, useRef, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'

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
  { label: 'Klein (256x256)', width: 256, height: 256 },
  { label: 'Mittel (512x512)', width: 512, height: 512 },
  { label: 'Groß (768x768)', width: 768, height: 768 },
  { label: 'Breit (768x512)', width: 768, height: 512 },
  { label: 'Hoch (512x768)', width: 512, height: 768 },
]

export const AIImageDialog: React.FC<AIImageDialogProps> = ({ onClose, onInsert }) => {
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
        setError(result.error || 'Unbekannter Fehler')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
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
            <h3>KI-Bildgenerierung</h3>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
          <div className="ai-image-dialog-disabled">
            KI-Funktionen sind deaktiviert.
            <br />
            Aktiviere Ollama in den Einstellungen.
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
            <h3>KI-Bildgenerierung</h3>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
          <div className="ai-image-dialog-disabled">
            Kein Bildgenerierungs-Modell gefunden.
            <br />
            Installiere z.B. <code>ollama pull x/flux2-klein</code>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-image-dialog-overlay" onClick={onClose}>
      <div className="ai-image-dialog" onClick={e => e.stopPropagation()}>
        <div className="ai-image-dialog-header">
          <h3>KI-Bildgenerierung</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="ai-image-dialog-content">
          {/* Model Selection */}
          <div className="ai-image-field">
            <label>Modell</label>
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
            <label>Beschreibung</label>
            <textarea
              ref={promptInputRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Beschreibe das gewünschte Bild..."
              rows={3}
              disabled={isLoading}
            />
            <small>Tipp: Beschreibe das Bild auf Englisch für bessere Ergebnisse</small>
          </div>

          {/* Size Presets */}
          <div className="ai-image-field">
            <label>Größe</label>
            <div className="ai-image-presets">
              {PRESET_SIZES.map(preset => (
                <button
                  key={preset.label}
                  className={`preset-btn ${settings.width === preset.width && settings.height === preset.height ? 'active' : ''}`}
                  onClick={() => handlePresetSize(preset)}
                  disabled={isLoading}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="ai-image-advanced-toggle">
            <button onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced ? '▼' : '▶'} Erweiterte Einstellungen
            </button>
          </div>

          {showAdvanced && (
            <div className="ai-image-advanced">
              <div className="ai-image-field-row">
                <div className="ai-image-field">
                  <label>Breite</label>
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
                  <label>Höhe</label>
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
                  <label>Schritte</label>
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
              <small>Mehr Schritte = bessere Qualität, aber langsamer</small>
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
                {progress ? `Schritt ${progress.completed} von ${progress.total}` : 'Starte Generierung...'}
              </span>
            </div>
          )}
        </div>

        <div className="ai-image-dialog-footer">
          <button className="cancel-btn" onClick={onClose} disabled={isLoading}>
            Abbrechen
          </button>
          <button
            className="generate-btn"
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim() || !selectedModel}
          >
            {isLoading ? 'Generiere...' : 'Bild generieren'}
          </button>
        </div>
      </div>
    </div>
  )
}
