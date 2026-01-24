import React, { useState, useEffect } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import {
  TemplateConfig,
  CustomTemplate,
  DEFAULT_TEMPLATES,
  loadTemplateConfig,
  saveTemplateConfig,
  generateRandomId
} from '../../utils/templateEngine'

interface TemplateSettingsProps {
  isOpen: boolean
  onClose: () => void
}

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

export const TemplateSettings: React.FC<TemplateSettingsProps> = ({
  isOpen,
  onClose
}) => {
  const { vaultPath } = useNotesStore()
  const [templates, setTemplates] = useState<TemplateConfig>(DEFAULT_TEMPLATES)
  const [selected, setSelected] = useState<SelectedTemplate>({ type: 'builtin', key: 'dailyNote' })
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Templates laden beim Öffnen
  useEffect(() => {
    if (isOpen && vaultPath) {
      loadTemplateConfig(vaultPath).then(config => {
        // Stelle sicher dass custom Array existiert
        if (!config.custom) {
          config.custom = []
        }
        setTemplates(config)
        setHasChanges(false)
      })
    }
  }, [isOpen, vaultPath])

  const getSelectedContent = (): string => {
    if (selected.type === 'builtin') {
      return templates[selected.key]
    } else {
      const custom = templates.custom.find(t => t.id === selected.id)
      return custom?.content || ''
    }
  }

  const getSelectedName = (): string => {
    if (selected.type === 'builtin') {
      return BUILTIN_LABELS[selected.key]
    } else {
      const custom = templates.custom.find(t => t.id === selected.id)
      return custom?.name || ''
    }
  }

  const handleContentChange = (content: string) => {
    if (selected.type === 'builtin') {
      setTemplates(prev => ({
        ...prev,
        [selected.key]: content
      }))
    } else {
      setTemplates(prev => ({
        ...prev,
        custom: prev.custom.map(t =>
          t.id === selected.id ? { ...t, content } : t
        )
      }))
    }
    setHasChanges(true)
  }

  const handleNameChange = (name: string) => {
    if (selected.type === 'custom') {
      setTemplates(prev => ({
        ...prev,
        custom: prev.custom.map(t =>
          t.id === selected.id ? { ...t, name } : t
        )
      }))
      setHasChanges(true)
    }
  }

  const handleCreateNew = () => {
    const newTemplate: CustomTemplate = {
      id: generateRandomId(8),
      name: 'Neues Template',
      content: `# {{title}}\n\n{{cursor}}`
    }
    setTemplates(prev => ({
      ...prev,
      custom: [...prev.custom, newTemplate]
    }))
    setSelected({ type: 'custom', id: newTemplate.id })
    setHasChanges(true)
  }

  const handleDelete = () => {
    if (selected.type !== 'custom') return
    if (!confirm('Template wirklich löschen?')) return

    setTemplates(prev => ({
      ...prev,
      custom: prev.custom.filter(t => t.id !== selected.id)
    }))
    setSelected({ type: 'builtin', key: 'dailyNote' })
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!vaultPath) return
    setIsSaving(true)
    try {
      await saveTemplateConfig(vaultPath, templates)
      setHasChanges(false)
    } catch (error) {
      console.error('Fehler beim Speichern der Templates:', error)
    }
    setIsSaving(false)
  }

  const handleReset = () => {
    if (selected.type === 'builtin') {
      setTemplates(prev => ({
        ...prev,
        [selected.key]: DEFAULT_TEMPLATES[selected.key]
      }))
      setHasChanges(true)
    }
  }

  const handleClose = () => {
    if (hasChanges) {
      if (confirm('Ungespeicherte Änderungen verwerfen?')) {
        onClose()
      }
    } else {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="template-settings-overlay" onClick={handleClose}>
      <div className="template-settings" onClick={e => e.stopPropagation()}>
        <div className="template-settings-header">
          <h2>Template-Einstellungen</h2>
          <button className="template-settings-close" onClick={handleClose}>
            ×
          </button>
        </div>

        <div className="template-settings-content">
          <div className="template-settings-sidebar">
            <div className="template-settings-section-title">Standard</div>
            {(Object.keys(BUILTIN_LABELS) as BuiltInTemplateKey[]).map(key => (
              <button
                key={key}
                className={`template-settings-tab ${selected.type === 'builtin' && selected.key === key ? 'active' : ''}`}
                onClick={() => setSelected({ type: 'builtin', key })}
              >
                {BUILTIN_LABELS[key]}
              </button>
            ))}

            <div className="template-settings-section-title">
              Eigene
              <button
                className="template-settings-add-btn"
                onClick={handleCreateNew}
                title="Neues Template erstellen"
              >
                +
              </button>
            </div>
            {templates.custom.map(template => (
              <button
                key={template.id}
                className={`template-settings-tab ${selected.type === 'custom' && selected.id === template.id ? 'active' : ''}`}
                onClick={() => setSelected({ type: 'custom', id: template.id })}
              >
                {template.name}
              </button>
            ))}
            {templates.custom.length === 0 && (
              <div className="template-settings-empty">
                Noch keine eigenen Templates
              </div>
            )}
          </div>

          <div className="template-settings-editor">
            <div className="template-settings-editor-header">
              {selected.type === 'custom' ? (
                <input
                  type="text"
                  className="template-settings-name-input"
                  value={getSelectedName()}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Template-Name"
                />
              ) : (
                <span>{getSelectedName()}</span>
              )}
              <div className="template-settings-actions">
                {selected.type === 'builtin' && (
                  <button
                    className="template-settings-reset"
                    onClick={handleReset}
                    title="Auf Standard zurücksetzen"
                  >
                    Standard
                  </button>
                )}
                {selected.type === 'custom' && (
                  <button
                    className="template-settings-delete"
                    onClick={handleDelete}
                    title="Template löschen"
                  >
                    Löschen
                  </button>
                )}
              </div>
            </div>
            <textarea
              className="template-settings-textarea"
              value={getSelectedContent()}
              onChange={e => handleContentChange(e.target.value)}
              spellCheck={false}
            />
            <div className="template-settings-help">
              <strong>Variablen:</strong> {`{{title}}`}, {`{{date}}`}, {`{{date:DD.MM.YYYY}}`}, {`{{time}}`}, {`{{datetime}}`}, {`{{weekday}}`}, {`{{week}}`}, {`{{timestamp}}`}, {`{{uuid}}`}, {`{{cursor}}`}
            </div>
          </div>
        </div>

        <div className="template-settings-footer">
          <button
            className="template-settings-btn secondary"
            onClick={handleClose}
          >
            Abbrechen
          </button>
          <button
            className="template-settings-btn primary"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
