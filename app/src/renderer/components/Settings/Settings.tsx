import React, { useState, useEffect } from 'react'
import { useUIStore, ACCENT_COLORS, AI_LANGUAGES, FONT_FAMILIES, UI_LANGUAGES, BACKGROUND_COLORS, ICON_SETS, OUTLINE_STYLES, type Language, type FontFamily, type BackgroundColor, type IconSet, type OutlineStyle } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import {
  TemplateConfig,
  CustomTemplate,
  DEFAULT_TEMPLATES,
  loadTemplateConfig,
  saveTemplateConfig,
  generateRandomId
} from '../../utils/templateEngine'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
}

type Tab = 'general' | 'editor' | 'templates' | 'integrations' | 'shortcuts'

type BuiltInTemplateKey = 'empty' | 'dailyNote' | 'zettel' | 'meeting'

type SelectedTemplate = {
  type: 'builtin'
  key: BuiltInTemplateKey
} | {
  type: 'custom'
  id: string
}

const BUILTIN_LABELS: Record<BuiltInTemplateKey, string> = {
  empty: 'Leere Notiz',
  dailyNote: 'Daily Note',
  zettel: 'Zettel',
  meeting: 'Meeting'
}

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [zoteroStatus, setZoteroStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string; size: number }>>([])

  // UI Store
  const {
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    backgroundColor,
    setBackgroundColor,
    loadLastVaultOnStart,
    setLoadLastVaultOnStart,
    language,
    setLanguage,
    fontFamily,
    setFontFamily,
    editorFontSize,
    setEditorFontSize,
    editorLineNumbers,
    setEditorLineNumbers,
    editorHeadingFolding,
    setEditorHeadingFolding,
    editorOutlining,
    setEditorOutlining,
    outlineStyle,
    setOutlineStyle,
    editorShowWordCount,
    setEditorShowWordCount,
    editorDefaultView,
    setEditorDefaultView,
    autoSaveInterval,
    setAutoSaveInterval,
    ollama,
    setOllama,
    pdfCompanionEnabled,
    setPdfCompanionEnabled,
    pdfDisplayMode,
    setPdfDisplayMode,
    canvasDefaultCardWidth,
    setCanvasDefaultCardWidth,
    iconSet,
    setIconSet,
    smartConnectionsEnabled,
    setSmartConnectionsEnabled,
    notesChatEnabled,
    setNotesChatEnabled
  } = useUIStore()

  const { t } = useTranslation()

  const { vaultPath } = useNotesStore()

  // Template State
  const [templates, setTemplates] = useState<TemplateConfig>(DEFAULT_TEMPLATES)
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedTemplate>({ type: 'builtin', key: 'dailyNote' })
  const [templateHasChanges, setTemplateHasChanges] = useState(false)
  const [isSavingTemplates, setIsSavingTemplates] = useState(false)

  // Zotero Status prüfen
  useEffect(() => {
    if (isOpen && activeTab === 'integrations') {
      checkZoteroConnection()
      checkOllamaConnection()
    }
  }, [isOpen, activeTab])

  // Templates laden
  useEffect(() => {
    if (isOpen && activeTab === 'templates' && vaultPath) {
      loadTemplateConfig(vaultPath).then(config => {
        if (!config.custom) {
          config.custom = []
        }
        setTemplates(config)
        setTemplateHasChanges(false)
      })
    }
  }, [isOpen, activeTab, vaultPath])

  const checkZoteroConnection = async () => {
    setZoteroStatus('checking')
    try {
      const connected = await window.electronAPI.zoteroCheck()
      setZoteroStatus(connected ? 'connected' : 'disconnected')
    } catch {
      setZoteroStatus('disconnected')
    }
  }

  const checkOllamaConnection = async () => {
    setOllamaStatus('checking')
    try {
      const connected = await window.electronAPI.ollamaCheck()
      setOllamaStatus(connected ? 'connected' : 'disconnected')

      if (connected) {
        const models = await window.electronAPI.ollamaModels()
        setOllamaModels(models)
        // Wenn noch kein Modell ausgewählt und Modelle verfügbar sind, erstes auswählen
        if (!ollama.selectedModel && models.length > 0) {
          setOllama({ selectedModel: models[0].name })
        }
      }
    } catch {
      setOllamaStatus('disconnected')
    }
  }

  // Template Functions
  const getSelectedContent = (): string => {
    if (selectedTemplate.type === 'builtin') {
      return templates[selectedTemplate.key]
    } else {
      const custom = templates.custom.find(t => t.id === selectedTemplate.id)
      return custom?.content || ''
    }
  }

  const getSelectedName = (): string => {
    if (selectedTemplate.type === 'builtin') {
      return BUILTIN_LABELS[selectedTemplate.key]
    } else {
      const custom = templates.custom.find(t => t.id === selectedTemplate.id)
      return custom?.name || ''
    }
  }

  const handleTemplateContentChange = (content: string) => {
    if (selectedTemplate.type === 'builtin') {
      setTemplates(prev => ({
        ...prev,
        [selectedTemplate.key]: content
      }))
    } else {
      setTemplates(prev => ({
        ...prev,
        custom: prev.custom.map(t =>
          t.id === selectedTemplate.id ? { ...t, content } : t
        )
      }))
    }
    setTemplateHasChanges(true)
  }

  const handleTemplateNameChange = (name: string) => {
    if (selectedTemplate.type === 'custom') {
      setTemplates(prev => ({
        ...prev,
        custom: prev.custom.map(t =>
          t.id === selectedTemplate.id ? { ...t, name } : t
        )
      }))
      setTemplateHasChanges(true)
    }
  }

  const handleCreateTemplate = () => {
    const newTemplate: CustomTemplate = {
      id: generateRandomId(8),
      name: 'Neues Template',
      content: `# {{title}}\n\n{{cursor}}`
    }
    setTemplates(prev => ({
      ...prev,
      custom: [...prev.custom, newTemplate]
    }))
    setSelectedTemplate({ type: 'custom', id: newTemplate.id })
    setTemplateHasChanges(true)
  }

  const handleDeleteTemplate = () => {
    if (selectedTemplate.type !== 'custom') return
    if (!confirm('Template wirklich löschen?')) return

    setTemplates(prev => ({
      ...prev,
      custom: prev.custom.filter(t => t.id !== selectedTemplate.id)
    }))
    setSelectedTemplate({ type: 'builtin', key: 'dailyNote' })
    setTemplateHasChanges(true)
  }

  const handleSaveTemplates = async () => {
    if (!vaultPath) return
    setIsSavingTemplates(true)
    try {
      await saveTemplateConfig(vaultPath, templates)
      setTemplateHasChanges(false)
    } catch (error) {
      console.error('Fehler beim Speichern der Templates:', error)
    }
    setIsSavingTemplates(false)
  }

  const handleResetTemplate = () => {
    if (selectedTemplate.type === 'builtin') {
      setTemplates(prev => ({
        ...prev,
        [selectedTemplate.key]: DEFAULT_TEMPLATES[selectedTemplate.key]
      }))
      setTemplateHasChanges(true)
    }
  }

  const handleClose = () => {
    if (templateHasChanges) {
      if (confirm('Ungespeicherte Template-Änderungen verwerfen?')) {
        onClose()
      }
    } else {
      onClose()
    }
  }

  // Keyboard handler for Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, templateHasChanges])

  if (!isOpen) return null

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t('settings.title')}</h2>
          <button className="settings-close" onClick={handleClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M4 12L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <nav className="settings-nav">
            <button
              className={`settings-nav-item ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M9 1V3M9 15V17M1 9H3M15 9H17M3.5 3.5L5 5M13 13L14.5 14.5M3.5 14.5L5 13M13 5L14.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {t('settings.tab.general')}
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'editor' ? 'active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M13.5 2.5L15.5 4.5L6 14H4V12L13.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('settings.tab.editor')}
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'templates' ? 'active' : ''}`}
              onClick={() => setActiveTab('templates')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M5 6H13M5 9H13M5 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {t('settings.tab.templates')}
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'integrations' ? 'active' : ''}`}
              onClick={() => setActiveTab('integrations')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M6 9H12M9 6V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="11" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="2" y="11" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="11" y="11" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              {t('settings.tab.integrations')}
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'shortcuts' ? 'active' : ''}`}
              onClick={() => setActiveTab('shortcuts')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="1" y="5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M4 8H5M7 8H8M10 8H11M13 8H14M5 11H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {t('settings.tab.shortcuts')}
            </button>
          </nav>

          <div className="settings-content">
            {/* Allgemein Tab */}
            {activeTab === 'general' && (
              <div className="settings-section">
                <h3>{t('settings.general.theme')}</h3>
                <div className="settings-row">
                  <label>{t('settings.general.theme')}</label>
                  <select
                    value={theme}
                    onChange={e => setTheme(e.target.value as 'light' | 'dark' | 'system')}
                  >
                    <option value="system">{t('settings.general.theme.system')}</option>
                    <option value="light">{t('settings.general.theme.light')}</option>
                    <option value="dark">{t('settings.general.theme.dark')}</option>
                  </select>
                </div>
                <div className="settings-row">
                  <label>{t('settings.general.accentColor')}</label>
                  <div className="accent-color-picker">
                    {(Object.keys(ACCENT_COLORS) as Array<keyof typeof ACCENT_COLORS>).map(colorKey => (
                      <button
                        key={colorKey}
                        className={`accent-color-btn ${accentColor === colorKey ? 'active' : ''}`}
                        style={{ backgroundColor: ACCENT_COLORS[colorKey].color }}
                        onClick={() => setAccentColor(colorKey)}
                        title={ACCENT_COLORS[colorKey].name}
                      />
                    ))}
                  </div>
                </div>
                <div className="settings-row">
                  <label>{t('settings.general.backgroundColor')}</label>
                  <div className="accent-color-picker background-picker">
                    {(Object.keys(BACKGROUND_COLORS) as BackgroundColor[]).map(colorKey => (
                      <button
                        key={colorKey}
                        className={`accent-color-btn ${backgroundColor === colorKey ? 'active' : ''}`}
                        style={{ backgroundColor: BACKGROUND_COLORS[colorKey].light }}
                        onClick={() => setBackgroundColor(colorKey)}
                        title={BACKGROUND_COLORS[colorKey].name}
                      />
                    ))}
                  </div>
                </div>
                <div className="settings-row">
                  <label>{t('settings.general.language')}</label>
                  <select
                    value={language}
                    onChange={e => setLanguage(e.target.value as Language)}
                  >
                    {(Object.keys(UI_LANGUAGES) as Language[]).map(lang => (
                      <option key={lang} value={lang}>{UI_LANGUAGES[lang]}</option>
                    ))}
                  </select>
                </div>
                <div className="settings-row">
                  <label>{t('settings.general.font')}</label>
                  <select
                    value={fontFamily}
                    onChange={e => setFontFamily(e.target.value as FontFamily)}
                  >
                    <optgroup label="Sans-Serif">
                      {(Object.keys(FONT_FAMILIES) as FontFamily[])
                        .filter(font => FONT_FAMILIES[font].category === 'sans')
                        .map(font => (
                          <option key={font} value={font}>{FONT_FAMILIES[font].name}</option>
                        ))}
                    </optgroup>
                    <optgroup label="Nerd Fonts">
                      {(Object.keys(FONT_FAMILIES) as FontFamily[])
                        .filter(font => FONT_FAMILIES[font].category === 'nerd')
                        .map(font => (
                          <option key={font} value={font}>{FONT_FAMILIES[font].name}</option>
                        ))}
                    </optgroup>
                  </select>
                </div>

                <h3>{t('settings.general.vault')}</h3>
                <div className="settings-row">
                  <label>{t('settings.general.loadLastVault')}</label>
                  <input
                    type="checkbox"
                    checked={loadLastVaultOnStart}
                    onChange={e => setLoadLastVaultOnStart(e.target.checked)}
                  />
                </div>
              </div>
            )}

            {/* Editor Tab */}
            {activeTab === 'editor' && (
              <div className="settings-section">
                <h3>Darstellung</h3>
                <div className="settings-row">
                  <label>Schriftgröße</label>
                  <div className="settings-input-group">
                    <input
                      type="number"
                      min="10"
                      max="24"
                      value={editorFontSize}
                      onChange={e => setEditorFontSize(parseInt(e.target.value) || 15)}
                    />
                    <span>px</span>
                  </div>
                </div>
                <div className="settings-row">
                  <label>Zeilennummern anzeigen</label>
                  <input
                    type="checkbox"
                    checked={editorLineNumbers}
                    onChange={e => setEditorLineNumbers(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>Überschriften falten</label>
                  <input
                    type="checkbox"
                    checked={editorHeadingFolding}
                    onChange={e => setEditorHeadingFolding(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>Outlining (Listen falten)</label>
                  <input
                    type="checkbox"
                    checked={editorOutlining}
                    onChange={e => setEditorOutlining(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>Outline-Stil</label>
                  <select
                    value={outlineStyle}
                    onChange={e => setOutlineStyle(e.target.value as OutlineStyle)}
                    disabled={!editorOutlining}
                  >
                    {(Object.keys(OUTLINE_STYLES) as OutlineStyle[]).map(key => (
                      <option key={key} value={key}>
                        {OUTLINE_STYLES[key].name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="settings-row">
                  <label>Wörter-/Zeichenzähler</label>
                  <input
                    type="checkbox"
                    checked={editorShowWordCount}
                    onChange={e => setEditorShowWordCount(e.target.checked)}
                  />
                </div>

                <h3>Verhalten</h3>
                <div className="settings-row">
                  <label>Standard-Ansicht</label>
                  <select
                    value={editorDefaultView}
                    onChange={e => setEditorDefaultView(e.target.value as 'edit' | 'live-preview' | 'preview')}
                  >
                    <option value="edit">Bearbeiten</option>
                    <option value="live-preview">Live Preview</option>
                    <option value="preview">Vorschau</option>
                  </select>
                </div>
                <div className="settings-row">
                  <label>Auto-Save Intervall</label>
                  <select
                    value={autoSaveInterval}
                    onChange={e => setAutoSaveInterval(parseInt(e.target.value))}
                  >
                    <option value="0">Deaktiviert</option>
                    <option value="500">0,5 Sekunden</option>
                    <option value="1000">1 Sekunde</option>
                    <option value="2000">2 Sekunden</option>
                    <option value="5000">5 Sekunden</option>
                  </select>
                </div>

                <h3>PDF Companion</h3>
                <div className="settings-row">
                  <label>PDF Companion aktiviert</label>
                  <input
                    type="checkbox"
                    checked={pdfCompanionEnabled}
                    onChange={e => setPdfCompanionEnabled(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>Anzeige im Dateibaum</label>
                  <select
                    value={pdfDisplayMode}
                    onChange={e => setPdfDisplayMode(e.target.value as 'both' | 'companion-only' | 'pdf-only')}
                    disabled={!pdfCompanionEnabled}
                  >
                    <option value="companion-only">Nur Companion (.pdf.md)</option>
                    <option value="both">PDF und Companion</option>
                    <option value="pdf-only">Nur PDF</option>
                  </select>
                </div>
                <div className="settings-info">
                  <p>
                    <strong>PDF Companion</strong> erstellt automatisch Markdown-Dateien für PDFs,
                    die Tagging, Verlinkung und Notizen ermöglichen.
                  </p>
                </div>

                <h3>Canvas</h3>
                <div className="settings-row">
                  <label>Standard-Kartenbreite</label>
                  <div className="settings-input-group">
                    <input
                      type="range"
                      min="150"
                      max="400"
                      step="10"
                      value={canvasDefaultCardWidth}
                      onChange={e => setCanvasDefaultCardWidth(parseInt(e.target.value))}
                      style={{ width: '120px' }}
                    />
                    <span>{canvasDefaultCardWidth}px</span>
                  </div>
                </div>
                <div className="settings-info">
                  <p>
                    <strong>Kartenbreite</strong> bestimmt die Mindestbreite für Karten im Canvas.
                    Größere Werte zeigen mehr Inhalt, kleinere Werte ermöglichen kompaktere Darstellung.
                  </p>
                </div>

                <h3>Dateibaum</h3>
                <div className="settings-row">
                  <label>Icon-Stil</label>
                  <select
                    value={iconSet}
                    onChange={e => setIconSet(e.target.value as IconSet)}
                  >
                    {(Object.keys(ICON_SETS) as IconSet[]).map(key => (
                      <option key={key} value={key}>
                        {ICON_SETS[key].name} - {ICON_SETS[key].description}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="settings-info">
                  <p>
                    <strong>Icon-Stil</strong> ändert die Darstellung von Ordnern im Dateibaum.
                    Individuelle Ordner-Farben und -Icons können per Rechtsklick angepasst werden.
                  </p>
                </div>

                <h3>Werkzeuge</h3>
                <div className="settings-row">
                  <label>Wikilinks entfernen</label>
                  <button
                    className="btn-secondary"
                    onClick={async () => {
                      if (!vaultPath) {
                        alert('Bitte zuerst einen Vault öffnen')
                        return
                      }
                      // Öffne Ordnerauswahl-Dialog
                      const folderPath = await window.electronAPI.openVault()
                      if (folderPath && folderPath.startsWith(vaultPath)) {
                        await window.electronAPI.stripWikilinksInFolder(folderPath, vaultPath)
                      } else if (folderPath) {
                        alert('Bitte wähle einen Ordner innerhalb des aktuellen Vaults')
                      }
                    }}
                  >
                    Ordner auswählen...
                  </button>
                </div>
                <div className="settings-info">
                  <p>
                    <strong>Wikilinks entfernen</strong> entfernt die [[Klammern]] aus allen Markdown-Dateien
                    im gewählten Ordner. Der verlinkte Text bleibt erhalten.<br/>
                    Beispiel: <code>[[Notiz]]</code> → <code>Notiz</code>, <code>[[Notiz|Alias]]</code> → <code>Alias</code>
                  </p>
                  <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
                    <strong>Tipp:</strong> Rechtsklick auf einen Ordner im Dateibaum → "Wikilinks entfernen"
                  </p>
                </div>
              </div>
            )}

            {/* Templates Tab */}
            {activeTab === 'templates' && (
              <div className="settings-templates">
                <div className="settings-templates-sidebar">
                  <div className="settings-templates-section">
                    <div className="settings-templates-section-title">Standard</div>
                    {(Object.keys(BUILTIN_LABELS) as BuiltInTemplateKey[]).map(key => (
                      <button
                        key={key}
                        className={`settings-templates-item ${selectedTemplate.type === 'builtin' && selectedTemplate.key === key ? 'active' : ''}`}
                        onClick={() => setSelectedTemplate({ type: 'builtin', key })}
                      >
                        {BUILTIN_LABELS[key]}
                      </button>
                    ))}
                  </div>

                  <div className="settings-templates-section">
                    <div className="settings-templates-section-title">
                      Eigene
                      <button className="settings-templates-add" onClick={handleCreateTemplate}>+</button>
                    </div>
                    {templates.custom.map(template => (
                      <button
                        key={template.id}
                        className={`settings-templates-item ${selectedTemplate.type === 'custom' && selectedTemplate.id === template.id ? 'active' : ''}`}
                        onClick={() => setSelectedTemplate({ type: 'custom', id: template.id })}
                      >
                        {template.name}
                      </button>
                    ))}
                    {templates.custom.length === 0 && (
                      <div className="settings-templates-empty">Keine eigenen Templates</div>
                    )}
                  </div>
                </div>

                <div className="settings-templates-editor">
                  <div className="settings-templates-editor-header">
                    {selectedTemplate.type === 'custom' ? (
                      <input
                        type="text"
                        className="settings-templates-name-input"
                        value={getSelectedName()}
                        onChange={e => handleTemplateNameChange(e.target.value)}
                        placeholder="Template-Name"
                      />
                    ) : (
                      <span className="settings-templates-name">{getSelectedName()}</span>
                    )}
                    <div className="settings-templates-actions">
                      {selectedTemplate.type === 'builtin' && (
                        <button onClick={handleResetTemplate}>Standard</button>
                      )}
                      {selectedTemplate.type === 'custom' && (
                        <button className="danger" onClick={handleDeleteTemplate}>Löschen</button>
                      )}
                    </div>
                  </div>
                  <textarea
                    className="settings-templates-textarea"
                    value={getSelectedContent()}
                    onChange={e => handleTemplateContentChange(e.target.value)}
                    spellCheck={false}
                  />
                  <div className="settings-templates-help">
                    <strong>Variablen:</strong> {`{{title}}`}, {`{{date}}`}, {`{{date:DD.MM.YYYY}}`}, {`{{time}}`}, {`{{datetime}}`}, {`{{weekday}}`}, {`{{week}}`}, {`{{timestamp}}`}, {`{{uuid}}`}, {`{{cursor}}`}
                  </div>
                  {templateHasChanges && (
                    <div className="settings-templates-footer">
                      <button className="primary" onClick={handleSaveTemplates} disabled={isSavingTemplates}>
                        {isSavingTemplates ? 'Speichern...' : 'Templates speichern'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Integrationen Tab */}
            {activeTab === 'integrations' && (
              <div className="settings-section">
                <h3>Ollama - Lokale KI</h3>
                <div className="settings-row">
                  <label>Status</label>
                  <div className="settings-status">
                    {ollamaStatus === 'checking' && (
                      <span className="status-checking">Prüfe Verbindung...</span>
                    )}
                    {ollamaStatus === 'connected' && (
                      <span className="status-connected">Verbunden ({ollamaModels.length} Modelle)</span>
                    )}
                    {ollamaStatus === 'disconnected' && (
                      <span className="status-disconnected">Nicht verbunden</span>
                    )}
                    <button className="settings-refresh" onClick={checkOllamaConnection}>
                      Aktualisieren
                    </button>
                  </div>
                </div>

                {ollamaStatus === 'connected' && (
                  <>
                    <div className="settings-row">
                      <label>KI-Funktionen aktiviert</label>
                      <input
                        type="checkbox"
                        checked={ollama.enabled}
                        onChange={e => setOllama({ enabled: e.target.checked })}
                      />
                    </div>
                    <div className="settings-row">
                      <label>Modell</label>
                      <select
                        value={ollama.selectedModel}
                        onChange={e => setOllama({ selectedModel: e.target.value })}
                        disabled={!ollama.enabled}
                      >
                        {ollamaModels.map(model => (
                          <option key={model.name} value={model.name}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="settings-row">
                      <label>Standard-Übersetzungssprache</label>
                      <select
                        value={ollama.defaultTranslateLanguage}
                        onChange={e => setOllama({ defaultTranslateLanguage: e.target.value as typeof ollama.defaultTranslateLanguage })}
                        disabled={!ollama.enabled}
                      >
                        {AI_LANGUAGES.map(lang => (
                          <option key={lang.code} value={lang.code}>
                            {lang.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className="settings-info">
                  <p>
                    <strong>Ollama</strong> ermöglicht lokale KI-Funktionen ohne Cloud-Dienste.
                  </p>
                  <p>
                    Installiere Ollama von <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">ollama.ai</a> und starte es.
                  </p>
                  <p>
                    <strong>Nutzung:</strong> Text markieren → Rechtsklick → KI-Funktion wählen
                  </p>
                  <p>
                    <strong>Transparenz:</strong> Jede KI-Nutzung wird automatisch als Fußnote dokumentiert.
                  </p>
                </div>

                <h3 style={{ marginTop: '32px' }}>KI-Funktionen (optional)</h3>
                <div className="settings-info" style={{ marginBottom: '16px' }}>
                  <p>
                    KI ist ein Werkzeug, kein Ersatz für eigenes Denken. Diese Features sind
                    standardmäßig deaktiviert – aktiviere nur was du bewusst nutzen möchtest.
                    Benötigt einen lokalen Ollama-Server.
                  </p>
                </div>
                <div className="settings-row">
                  <label>
                    Smart Connections aktivieren
                    <span className="settings-hint">Findet ähnliche Notizen via KI-Embeddings</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={smartConnectionsEnabled}
                    onChange={e => setSmartConnectionsEnabled(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>
                    Notes Chat aktivieren
                    <span className="settings-hint">Stelle Fragen an deine Notizen</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={notesChatEnabled}
                    onChange={e => setNotesChatEnabled(e.target.checked)}
                  />
                </div>

                <h3 style={{ marginTop: '32px' }}>Zotero / Better BibTeX</h3>
                <div className="settings-row">
                  <label>Status</label>
                  <div className="settings-status">
                    {zoteroStatus === 'checking' && (
                      <span className="status-checking">Prüfe Verbindung...</span>
                    )}
                    {zoteroStatus === 'connected' && (
                      <span className="status-connected">Verbunden</span>
                    )}
                    {zoteroStatus === 'disconnected' && (
                      <span className="status-disconnected">Nicht verbunden</span>
                    )}
                    <button className="settings-refresh" onClick={checkZoteroConnection}>
                      Aktualisieren
                    </button>
                  </div>
                </div>
                <div className="settings-info">
                  <p>
                    Um Zotero zu nutzen, muss <strong>Zotero</strong> mit dem <strong>Better BibTeX</strong> Plugin laufen.
                  </p>
                  <p>
                    Öffne die Zotero-Suche mit <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>
                  </p>
                </div>
              </div>
            )}

            {/* Tastenkürzel Tab */}
            {activeTab === 'shortcuts' && (
              <div className="settings-section settings-shortcuts">
                <h3>Navigation</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>K</kbd>
                    <span>Quick Switcher - Notizen wechseln oder neue erstellen</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>P</kbd>
                    <span>Schnellsuche - In allen Notizen suchen</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>,</kbd>
                    <span>Einstellungen öffnen</span>
                  </div>
                </div>

                <h3>Notizen & Templates</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>
                    <span>Template-Picker - Template einfügen oder neue Notiz mit Template</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>
                    <span>Zotero-Suche - Literatur einfügen (Zotero muss laufen)</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>S</kbd>
                    <span>Notiz speichern</span>
                  </div>
                </div>

                <h3>Editor</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>E</kbd>
                    <span>Editor-Ansicht wechseln (Bearbeiten / Live Preview / Vorschau)</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>B</kbd>
                    <span>Fett formatieren</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>I</kbd>
                    <span>Kursiv formatieren</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>
                    <span>Code formatieren</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>
                    <span>Durchgestrichen formatieren</span>
                  </div>
                </div>

                <h3>Wikilinks</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>[[</kbd>
                    <span>Wikilink beginnen - Tippe [[ um eine andere Notiz zu verlinken</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Klick</kbd>
                    <span>Wikilink öffnen - Zur verlinkten Notiz springen</span>
                  </div>
                </div>

                <h3>Ansicht</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Sidebar-Button</kbd>
                    <span>Sidebar ein-/ausblenden</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>View-Switcher</kbd>
                    <span>Zwischen Editor, Split und Canvas wechseln</span>
                  </div>
                </div>

                <div className="settings-info" style={{ marginTop: '24px' }}>
                  <p><strong>Tipp:</strong> Verwende Wikilinks <code>[[Notizname]]</code> um deine Notizen miteinander zu verbinden und einen Knowledge Graph aufzubauen.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-footer">
          <div className="settings-version">
            <strong>MindGraph Notes</strong> v0.9.2
          </div>
          <div className="settings-credits">
            Entwickelt von Jochen Leeder
          </div>
        </div>
      </div>
    </div>
  )
}
