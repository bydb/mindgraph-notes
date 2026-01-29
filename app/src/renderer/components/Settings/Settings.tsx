import React, { useState, useEffect } from 'react'
import { useUIStore, ACCENT_COLORS, AI_LANGUAGES, FONT_FAMILIES, UI_LANGUAGES, BACKGROUND_COLORS, ICON_SETS, OUTLINE_STYLES, type Language, type FontFamily, type BackgroundColor, type IconSet, type OutlineStyle, type LLMBackend } from '../../stores/uiStore'
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
  const [lmstudioStatus, setLmstudioStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string; size: number }>>([])
  const [lmstudioModels, setLmstudioModels] = useState<Array<{ name: string; size: number }>>([])

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
    setNotesChatEnabled,
    smartConnectionsWeights,
    setSmartConnectionsWeights
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
      checkLmstudioConnection()
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
        // Wenn Ollama als Backend und noch kein Modell ausgewählt
        if (ollama.backend === 'ollama' && !ollama.selectedModel && models.length > 0) {
          setOllama({ selectedModel: models[0].name })
        }
      }
    } catch {
      setOllamaStatus('disconnected')
    }
  }

  const checkLmstudioConnection = async () => {
    setLmstudioStatus('checking')
    try {
      const connected = await window.electronAPI.lmstudioCheck(ollama.lmStudioPort)
      setLmstudioStatus(connected ? 'connected' : 'disconnected')

      if (connected) {
        const models = await window.electronAPI.lmstudioModels(ollama.lmStudioPort)
        setLmstudioModels(models)
        // Wenn LM Studio als Backend und noch kein Modell ausgewählt
        if (ollama.backend === 'lm-studio' && !ollama.selectedModel && models.length > 0) {
          setOllama({ selectedModel: models[0].name })
        }
      }
    } catch {
      setLmstudioStatus('disconnected')
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
      name: t('settings.templates.newTemplate'),
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
    if (!confirm(t('settings.templates.deleteConfirm'))) return

    setTemplates(prev => ({
      ...prev,
      custom: prev.custom.filter(tpl => tpl.id !== selectedTemplate.id)
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
      if (confirm(t('settings.templates.unsavedConfirm'))) {
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
                <h3>{t('settings.editor.display')}</h3>
                <div className="settings-row">
                  <label>{t('settings.editor.fontSize')}</label>
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
                  <label>{t('settings.editor.showLineNumbers')}</label>
                  <input
                    type="checkbox"
                    checked={editorLineNumbers}
                    onChange={e => setEditorLineNumbers(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.foldHeadings')}</label>
                  <input
                    type="checkbox"
                    checked={editorHeadingFolding}
                    onChange={e => setEditorHeadingFolding(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.outlining')}</label>
                  <input
                    type="checkbox"
                    checked={editorOutlining}
                    onChange={e => setEditorOutlining(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.outlineStyle')}</label>
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
                  <label>{t('settings.editor.wordCounter')}</label>
                  <input
                    type="checkbox"
                    checked={editorShowWordCount}
                    onChange={e => setEditorShowWordCount(e.target.checked)}
                  />
                </div>

                <h3>{t('settings.editor.behavior')}</h3>
                <div className="settings-row">
                  <label>{t('settings.editor.defaultViewLabel')}</label>
                  <select
                    value={editorDefaultView}
                    onChange={e => setEditorDefaultView(e.target.value as 'edit' | 'live-preview' | 'preview')}
                  >
                    <option value="edit">{t('settings.editor.viewEdit')}</option>
                    <option value="live-preview">{t('settings.editor.viewLivePreview')}</option>
                    <option value="preview">{t('settings.editor.viewPreview')}</option>
                  </select>
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.autoSaveInterval')}</label>
                  <select
                    value={autoSaveInterval}
                    onChange={e => setAutoSaveInterval(parseInt(e.target.value))}
                  >
                    <option value="0">{t('settings.editor.autoSaveDisabled')}</option>
                    <option value="500">0.5 {t('settings.editor.autoSaveSeconds')}</option>
                    <option value="1000">1 {t('settings.editor.autoSaveSeconds')}</option>
                    <option value="2000">2 {t('settings.editor.autoSaveSeconds')}</option>
                    <option value="5000">5 {t('settings.editor.autoSaveSeconds')}</option>
                  </select>
                </div>

                <h3>{t('settings.pdf.title')}</h3>
                <div className="settings-row">
                  <label>{t('settings.pdf.enabled')}</label>
                  <input
                    type="checkbox"
                    checked={pdfCompanionEnabled}
                    onChange={e => setPdfCompanionEnabled(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>{t('settings.pdf.displayMode')}</label>
                  <select
                    value={pdfDisplayMode}
                    onChange={e => setPdfDisplayMode(e.target.value as 'both' | 'companion-only' | 'pdf-only')}
                    disabled={!pdfCompanionEnabled}
                  >
                    <option value="companion-only">{t('settings.pdf.companionOnly')}</option>
                    <option value="both">{t('settings.pdf.both')}</option>
                    <option value="pdf-only">{t('settings.pdf.pdfOnly')}</option>
                  </select>
                </div>
                <div className="settings-info">
                  <p>
                    <strong>{t('settings.pdf.title')}</strong> {t('settings.pdf.description')}
                  </p>
                </div>

                <h3>{t('settings.canvas.title')}</h3>
                <div className="settings-row">
                  <label>{t('settings.canvas.cardWidth')}</label>
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
                    {t('settings.canvas.cardWidthDesc')}
                  </p>
                </div>

                <h3>{t('settings.fileTree.title')}</h3>
                <div className="settings-row">
                  <label>{t('settings.fileTree.iconStyle')}</label>
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
                    {t('settings.fileTree.iconStyleDesc')}
                  </p>
                </div>

                <h3>{t('settings.tools.title')}</h3>
                <div className="settings-row">
                  <label>{t('settings.tools.stripWikilinks')}</label>
                  <button
                    className="btn-secondary"
                    onClick={async () => {
                      if (!vaultPath) {
                        alert(t('settings.tools.openVaultFirst'))
                        return
                      }
                      const folderPath = await window.electronAPI.openVault()
                      if (folderPath && folderPath.startsWith(vaultPath)) {
                        await window.electronAPI.stripWikilinksInFolder(folderPath, vaultPath)
                      } else if (folderPath) {
                        alert(t('settings.tools.selectFolderInVault'))
                      }
                    }}
                  >
                    {t('settings.tools.selectFolder')}
                  </button>
                </div>
                <div className="settings-info">
                  <p>
                    {t('settings.tools.stripWikilinksDesc')}<br/>
                    {t('settings.tools.stripWikilinksExample')}
                  </p>
                  <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
                    {t('settings.tools.stripWikiliksHint')}
                  </p>
                </div>
              </div>
            )}

            {/* Templates Tab */}
            {activeTab === 'templates' && (
              <div className="settings-templates">
                <div className="settings-templates-sidebar">
                  <div className="settings-templates-section">
                    <div className="settings-templates-section-title">{t('settings.templates.standard')}</div>
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
                      {t('settings.templates.own')}
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
                      <div className="settings-templates-empty">{t('settings.templates.noCustom')}</div>
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
                        <button onClick={handleResetTemplate}>{t('settings.templates.standard')}</button>
                      )}
                      {selectedTemplate.type === 'custom' && (
                        <button className="danger" onClick={handleDeleteTemplate}>{t('settings.templates.delete')}</button>
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
                        {isSavingTemplates ? t('settings.templates.saving') : t('settings.templates.saveTemplates')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Integrationen Tab */}
            {activeTab === 'integrations' && (
              <div className="settings-section">
                <h3>{t('settings.integrations.localAI')}</h3>

                <div className="settings-row">
                  <label>{t('settings.integrations.aiEnabled')}</label>
                  <input
                    type="checkbox"
                    checked={ollama.enabled}
                    onChange={e => setOllama({ enabled: e.target.checked })}
                  />
                </div>

                <div className="settings-row">
                  <label>{t('settings.integrations.backend')}</label>
                  <select
                    value={ollama.backend}
                    onChange={e => {
                      const newBackend = e.target.value as LLMBackend
                      setOllama({ backend: newBackend, selectedModel: '' })
                    }}
                    disabled={!ollama.enabled}
                  >
                    <option value="ollama">Ollama (localhost:11434)</option>
                    <option value="lm-studio">LM Studio (localhost:{ollama.lmStudioPort})</option>
                  </select>
                </div>

                {/* Ollama Settings */}
                {ollama.backend === 'ollama' && (
                  <>
                    <div className="settings-row">
                      <label>Ollama Status</label>
                      <div className="settings-status">
                        {ollamaStatus === 'checking' && (
                          <span className="status-checking">{t('settings.checkingConnection')}</span>
                        )}
                        {ollamaStatus === 'connected' && (
                          <span className="status-connected">{t('settings.connected')} ({ollamaModels.length} {t('settings.models')})</span>
                        )}
                        {ollamaStatus === 'disconnected' && (
                          <span className="status-disconnected">{t('settings.notConnected')}</span>
                        )}
                        <button className="settings-refresh" onClick={checkOllamaConnection}>
                          {t('settings.refresh')}
                        </button>
                      </div>
                    </div>

                    {ollamaStatus === 'connected' && (
                      <div className="settings-row">
                        <label>{t('settings.integrations.ollama.model')}</label>
                        <select
                          value={ollama.selectedModel}
                          onChange={e => setOllama({ selectedModel: e.target.value })}
                          disabled={!ollama.enabled}
                        >
                          <option value="">{t('settings.selectModel')}</option>
                          {ollamaModels.map(model => (
                            <option key={model.name} value={model.name}>
                              {model.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="settings-info">
                      <p>
                        <strong>Ollama</strong> {t('settings.integrations.ollamaDesc')}
                      </p>
                      <p>
                        {t('settings.integrations.installOllama')} <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">ollama.ai</a>
                      </p>
                    </div>
                  </>
                )}

                {/* LM Studio Settings */}
                {ollama.backend === 'lm-studio' && (
                  <>
                    <div className="settings-row">
                      <label>LM Studio Port</label>
                      <div className="settings-input-group">
                        <input
                          type="number"
                          min="1"
                          max="65535"
                          value={ollama.lmStudioPort}
                          onChange={e => setOllama({ lmStudioPort: parseInt(e.target.value) || 1234 })}
                          style={{ width: '80px' }}
                        />
                        <button className="settings-refresh" onClick={checkLmstudioConnection}>
                          {t('settings.connect')}
                        </button>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>LM Studio Status</label>
                      <div className="settings-status">
                        {lmstudioStatus === 'checking' && (
                          <span className="status-checking">{t('settings.checkingConnection')}</span>
                        )}
                        {lmstudioStatus === 'connected' && (
                          <span className="status-connected">{t('settings.connected')} ({lmstudioModels.length} {t('settings.models')})</span>
                        )}
                        {lmstudioStatus === 'disconnected' && (
                          <span className="status-disconnected">{t('settings.notConnected')}</span>
                        )}
                        <button className="settings-refresh" onClick={checkLmstudioConnection}>
                          {t('settings.refresh')}
                        </button>
                      </div>
                    </div>

                    {lmstudioStatus === 'connected' && (
                      <div className="settings-row">
                        <label>{t('settings.integrations.ollama.model')}</label>
                        <select
                          value={ollama.selectedModel}
                          onChange={e => setOllama({ selectedModel: e.target.value })}
                          disabled={!ollama.enabled}
                        >
                          <option value="">{t('settings.selectModel')}</option>
                          {lmstudioModels.map(model => (
                            <option key={model.name} value={model.name}>
                              {model.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="settings-info">
                      <p>
                        <strong>LM Studio</strong> {t('settings.integrations.lmstudioDesc')}
                      </p>
                      <p>
                        Download: <a href="https://lmstudio.ai" target="_blank" rel="noopener noreferrer">lmstudio.ai</a>
                      </p>
                      <p>
                        <strong>Setup:</strong> {t('settings.integrations.lmstudioSetup')}
                      </p>
                    </div>
                  </>
                )}

                <div className="settings-row">
                  <label>{t('settings.integrations.defaultTranslation')}</label>
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

                <div className="settings-info" style={{ marginTop: '12px' }}>
                  <p>
                    {t('settings.integrations.usage')}
                  </p>
                  <p>
                    {t('settings.integrations.transparency')}
                  </p>
                </div>

                <h3 style={{ marginTop: '32px' }}>{t('settings.integrations.aiFeatures')}</h3>
                <div className="settings-info" style={{ marginBottom: '16px' }}>
                  <p>
                    {t('settings.integrations.aiFeaturesDesc')}
                  </p>
                </div>
                <div className="settings-row">
                  <label>
                    {t('settings.integrations.smartConnections')}
                    <span className="settings-hint">{t('settings.integrations.smartConnectionsHint')}</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={smartConnectionsEnabled}
                    onChange={e => setSmartConnectionsEnabled(e.target.checked)}
                  />
                </div>

                {/* Smart Connections Weights Configuration */}
                {smartConnectionsEnabled && (
                  <div className="settings-subsection" style={{ marginLeft: '8px', paddingLeft: '12px', borderLeft: '2px solid var(--border-color)' }}>
                    <div className="settings-row" style={{ marginBottom: '8px' }}>
                      <label style={{ fontWeight: 500, fontSize: '13px' }}>{t('smartConnections.weights.title')}</label>
                    </div>

                    <div className="settings-row">
                      <label>{t('smartConnections.weights.embedding')}</label>
                      <div className="settings-input-group">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={smartConnectionsWeights.embedding}
                          onChange={e => setSmartConnectionsWeights({ embedding: parseInt(e.target.value) })}
                          style={{ width: '100px' }}
                        />
                        <span style={{ minWidth: '40px', textAlign: 'right' }}>{smartConnectionsWeights.embedding}%</span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('smartConnections.weights.keyword')}</label>
                      <div className="settings-input-group">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={smartConnectionsWeights.keyword}
                          onChange={e => setSmartConnectionsWeights({ keyword: parseInt(e.target.value) })}
                          style={{ width: '100px' }}
                        />
                        <span style={{ minWidth: '40px', textAlign: 'right' }}>{smartConnectionsWeights.keyword}%</span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('smartConnections.weights.wikilink')}</label>
                      <div className="settings-input-group">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={smartConnectionsWeights.wikilink}
                          onChange={e => setSmartConnectionsWeights({ wikilink: parseInt(e.target.value) })}
                          style={{ width: '100px' }}
                        />
                        <span style={{ minWidth: '40px', textAlign: 'right' }}>{smartConnectionsWeights.wikilink}%</span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('smartConnections.weights.tags')}</label>
                      <div className="settings-input-group">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={smartConnectionsWeights.tags}
                          onChange={e => setSmartConnectionsWeights({ tags: parseInt(e.target.value) })}
                          style={{ width: '100px' }}
                        />
                        <span style={{ minWidth: '40px', textAlign: 'right' }}>{smartConnectionsWeights.tags}%</span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('smartConnections.weights.folder')}</label>
                      <div className="settings-input-group">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={smartConnectionsWeights.folder}
                          onChange={e => setSmartConnectionsWeights({ folder: parseInt(e.target.value) })}
                          style={{ width: '100px' }}
                        />
                        <span style={{ minWidth: '40px', textAlign: 'right' }}>{smartConnectionsWeights.folder}%</span>
                      </div>
                    </div>

                    <div className="settings-row" style={{ marginTop: '8px' }}>
                      <label>{t('smartConnections.weights.total')}</label>
                      <span style={{
                        fontWeight: 500,
                        color: (smartConnectionsWeights.embedding + smartConnectionsWeights.keyword + smartConnectionsWeights.wikilink + smartConnectionsWeights.tags + smartConnectionsWeights.folder) === 100
                          ? 'var(--text-primary)'
                          : 'var(--color-warning, #ff9500)'
                      }}>
                        {smartConnectionsWeights.embedding + smartConnectionsWeights.keyword + smartConnectionsWeights.wikilink + smartConnectionsWeights.tags + smartConnectionsWeights.folder}%
                      </span>
                    </div>

                    <div className="settings-info" style={{ marginTop: '8px' }}>
                      <p style={{ fontSize: '12px' }}>{t('smartConnections.weights.hint')}</p>
                    </div>
                  </div>
                )}

                <div className="settings-row">
                  <label>
                    {t('settings.integrations.notesChat')}
                    <span className="settings-hint">{t('settings.integrations.notesChatHint')}</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={notesChatEnabled}
                    onChange={e => setNotesChatEnabled(e.target.checked)}
                  />
                </div>

                <h3 style={{ marginTop: '32px' }}>{t('settings.integrations.zotero')}</h3>
                <div className="settings-row">
                  <label>Status</label>
                  <div className="settings-status">
                    {zoteroStatus === 'checking' && (
                      <span className="status-checking">{t('settings.checkingConnection')}</span>
                    )}
                    {zoteroStatus === 'connected' && (
                      <span className="status-connected">{t('settings.connected')}</span>
                    )}
                    {zoteroStatus === 'disconnected' && (
                      <span className="status-disconnected">{t('settings.notConnected')}</span>
                    )}
                    <button className="settings-refresh" onClick={checkZoteroConnection}>
                      {t('settings.refresh')}
                    </button>
                  </div>
                </div>
                <div className="settings-info">
                  <p>
                    {t('settings.integrations.zoteroDesc')}
                  </p>
                  <p>
                    {t('settings.integrations.zoteroShortcut')} <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>
                  </p>
                </div>
              </div>
            )}

            {/* Tastenkürzel Tab */}
            {activeTab === 'shortcuts' && (
              <div className="settings-section settings-shortcuts">
                <h3>{t('settings.shortcuts.navigation')}</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>K</kbd>
                    <span>{t('settings.shortcuts.quickSwitcher')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>P</kbd>
                    <span>{t('settings.shortcuts.quickSearch')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>,</kbd>
                    <span>{t('settings.shortcuts.openSettings')}</span>
                  </div>
                </div>

                <h3>{t('settings.shortcuts.notesTemplates')}</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>
                    <span>{t('settings.shortcuts.templatePicker')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>
                    <span>{t('settings.shortcuts.zoteroSearch')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>S</kbd>
                    <span>{t('settings.shortcuts.saveNote')}</span>
                  </div>
                </div>

                <h3>{t('settings.shortcuts.editorSection')}</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>E</kbd>
                    <span>{t('settings.shortcuts.switchView')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>B</kbd>
                    <span>{t('settings.shortcuts.bold')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>I</kbd>
                    <span>{t('settings.shortcuts.italic')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>
                    <span>{t('settings.shortcuts.code')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>
                    <span>{t('settings.shortcuts.strikethrough')}</span>
                  </div>
                </div>

                <h3>{t('settings.shortcuts.wikilinks')}</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>[[</kbd>
                    <span>{t('settings.shortcuts.startWikilink')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Click</kbd>
                    <span>{t('settings.shortcuts.openWikilink')}</span>
                  </div>
                </div>

                <h3>{t('settings.shortcuts.view')}</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Sidebar-Button</kbd>
                    <span>{t('settings.shortcuts.toggleSidebar')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>View-Switcher</kbd>
                    <span>{t('settings.shortcuts.switchViews')}</span>
                  </div>
                </div>

                <div className="settings-info" style={{ marginTop: '24px' }}>
                  <p>{t('settings.shortcuts.tip')}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-footer">
          <div className="settings-version">
            <strong>MindGraph Notes</strong> v1.0.4
          </div>
          <div className="settings-credits">
            {t('settings.footer.developedBy')} Jochen Leeder
          </div>
        </div>
      </div>
    </div>
  )
}
