import React, { useState, useRef, useEffect } from 'react'
import { useUIStore, AI_LANGUAGES, AILanguageCode } from '../../stores/uiStore'

type AIAction = 'translate' | 'summarize' | 'continue' | 'improve' | 'custom'

interface AIContextMenuProps {
  x: number
  y: number
  selectedText: string
  onClose: () => void
  onResult: (result: AIResult) => void
}

export interface AIResult {
  success: boolean
  result?: string
  error?: string
  action: AIAction
  model: string
  prompt: string
  originalText: string
  targetLanguage?: string
  customPrompt?: string
  timestamp: string
}

const ACTION_LABELS: Record<AIAction, { icon: string; label: string; description: string }> = {
  translate: { icon: '🌐', label: 'Übersetzen', description: 'Text in andere Sprache übersetzen' },
  summarize: { icon: '📝', label: 'Zusammenfassen', description: 'Text prägnant zusammenfassen' },
  continue: { icon: '✍️', label: 'Fortsetzen', description: 'Text im gleichen Stil weiterschreiben' },
  improve: { icon: '✨', label: 'Verbessern', description: 'Grammatik und Stil verbessern' },
  custom: { icon: '💬', label: 'Eigener Prompt', description: 'Eigene Anweisung eingeben' }
}

export const AIContextMenu: React.FC<AIContextMenuProps> = ({
  x,
  y,
  selectedText,
  onClose,
  onResult
}) => {
  const { ollama } = useUIStore()
  const [isLoading, setIsLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState<AIAction | null>(null)
  const [showLanguageSubmenu, setShowLanguageSubmenu] = useState(false)
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const [customPromptText, setCustomPromptText] = useState('')
  const customPromptInputRef = useRef<HTMLInputElement>(null)

  // Focus input when custom prompt opens
  useEffect(() => {
    if (showCustomPrompt && customPromptInputRef.current) {
      customPromptInputRef.current.focus()
    }
  }, [showCustomPrompt])

  const handleAction = async (action: AIAction, targetLanguage?: string, customPrompt?: string) => {
    if (!ollama.enabled || !ollama.selectedModel) {
      onClose()
      return
    }

    setIsLoading(true)
    setLoadingAction(action)

    try {
      const response = await window.electronAPI.ollamaGenerate({
        model: ollama.selectedModel,
        prompt: customPrompt || '',
        action: action === 'custom' ? 'custom' : action,
        targetLanguage: targetLanguage || (action === 'translate' ? getLanguageName(ollama.defaultTranslateLanguage) : undefined),
        originalText: selectedText,
        customPrompt: customPrompt
      })

      const result = response as AIResult
      if (customPrompt) {
        result.customPrompt = customPrompt
      }
      onResult(result)
    } catch (error) {
      console.error('[AI] Error:', error)
      onResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unbekannter Fehler',
        action,
        model: ollama.selectedModel,
        prompt: customPrompt || '',
        originalText: selectedText,
        customPrompt,
        timestamp: new Date().toISOString()
      })
    } finally {
      setIsLoading(false)
      setLoadingAction(null)
      setShowCustomPrompt(false)
      setCustomPromptText('')
      onClose()
    }
  }

  const handleCustomPromptSubmit = () => {
    if (customPromptText.trim()) {
      handleAction('custom', undefined, customPromptText.trim())
    }
  }

  const getLanguageName = (code: AILanguageCode): string => {
    const lang = AI_LANGUAGES.find(l => l.code === code)
    return lang?.name || 'Englisch'
  }

  // Positionierung anpassen, damit das Menü nicht außerhalb des Viewports ist
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 300),
    zIndex: 10000
  }

  if (!ollama.enabled) {
    return (
      <div className="ai-context-menu" style={menuStyle}>
        <div className="ai-context-menu-disabled">
          KI-Funktionen sind deaktiviert.
          <br />
          Aktiviere sie in den Einstellungen.
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Overlay zum Schließen */}
      <div className="ai-context-menu-overlay" onClick={onClose} />

      <div className="ai-context-menu" style={menuStyle}>
        <div className="ai-context-menu-header">
          <span className="ai-icon">🤖</span>
          <span>KI-Assistent</span>
          <span className="ai-model">{ollama.selectedModel}</span>
        </div>

        {/* Übersetzen - Klick = Standard-Sprache, Hover = Auswahl */}
        <div
          className="ai-context-menu-item has-submenu"
          onMouseEnter={() => setShowLanguageSubmenu(true)}
          onMouseLeave={() => setShowLanguageSubmenu(false)}
          onClick={() => !isLoading && handleAction('translate', getLanguageName(ollama.defaultTranslateLanguage))}
        >
          <span className="ai-action-icon">{ACTION_LABELS.translate.icon}</span>
          <span className="ai-action-label">
            {ACTION_LABELS.translate.label} → {getLanguageName(ollama.defaultTranslateLanguage)}
          </span>
          {isLoading && loadingAction === 'translate' ? (
            <span className="ai-loading-spinner" />
          ) : (
            <span className="ai-submenu-arrow">▶</span>
          )}

          {showLanguageSubmenu && !isLoading && (
            <div className="ai-context-submenu">
              {AI_LANGUAGES.map(lang => (
                <div
                  key={lang.code}
                  className="ai-context-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAction('translate', lang.name)
                  }}
                >
                  <span className="ai-action-label">→ {lang.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Andere Aktionen */}
        {(['summarize', 'continue', 'improve'] as AIAction[]).map(action => (
          <div
            key={action}
            className={`ai-context-menu-item ${isLoading && loadingAction === action ? 'loading' : ''}`}
            onClick={() => !isLoading && handleAction(action)}
          >
            <span className="ai-action-icon">{ACTION_LABELS[action].icon}</span>
            <span className="ai-action-label">{ACTION_LABELS[action].label}</span>
            {isLoading && loadingAction === action && (
              <span className="ai-loading-spinner" />
            )}
          </div>
        ))}

        {/* Trennlinie */}
        <div className="ai-context-menu-divider" />

        {/* Eigener Prompt */}
        {!showCustomPrompt ? (
          <div
            className="ai-context-menu-item"
            onClick={() => setShowCustomPrompt(true)}
          >
            <span className="ai-action-icon">{ACTION_LABELS.custom.icon}</span>
            <span className="ai-action-label">{ACTION_LABELS.custom.label}</span>
          </div>
        ) : (
          <div className="ai-custom-prompt">
            <input
              ref={customPromptInputRef}
              type="text"
              placeholder="Was soll die KI tun?"
              value={customPromptText}
              onChange={(e) => setCustomPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCustomPromptSubmit()
                } else if (e.key === 'Escape') {
                  setShowCustomPrompt(false)
                  setCustomPromptText('')
                }
              }}
              disabled={isLoading}
            />
            <button
              onClick={handleCustomPromptSubmit}
              disabled={isLoading || !customPromptText.trim()}
            >
              {isLoading && loadingAction === 'custom' ? (
                <span className="ai-loading-spinner" />
              ) : (
                '→'
              )}
            </button>
          </div>
        )}

        <div className="ai-context-menu-footer">
          <small>Wird als Fußnote dokumentiert</small>
        </div>
      </div>
    </>
  )
}
