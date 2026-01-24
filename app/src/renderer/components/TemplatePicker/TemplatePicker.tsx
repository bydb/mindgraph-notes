import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import {
  parseTemplate,
  isTemplateFile,
  TemplateInfo,
  loadTemplateConfig
} from '../../utils/templateEngine'

interface TemplatePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (content: string, cursorPosition?: number) => void
  onOpenSettings?: () => void
  noteTitle?: string
}

export const TemplatePicker: React.FC<TemplatePickerProps> = ({
  isOpen,
  onClose,
  onSelect,
  onOpenSettings,
  noteTitle
}) => {
  const { notes, vaultPath } = useNotesStore()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [builtInTemplates, setBuiltInTemplates] = useState<TemplateInfo[]>([])
  const [userTemplates, setUserTemplates] = useState<TemplateInfo[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Lade Built-in Templates (anpassbar) und User-Templates aus dem Vault
  useEffect(() => {
    if (!isOpen || !vaultPath) return

    const loadAllTemplates = async () => {
      // Lade anpassbare Built-in Templates + eigene Templates aus Config
      const config = await loadTemplateConfig(vaultPath)
      const builtIn: TemplateInfo[] = [
        { name: 'Leere Notiz', path: '__empty__', content: config.empty },
        { name: 'Daily Note', path: '__daily__', content: config.dailyNote },
        { name: 'Zettel', path: '__zettel__', content: config.zettel },
        { name: 'Meeting', path: '__meeting__', content: config.meeting },
      ]

      // Eigene Templates aus Config hinzufügen
      if (config.custom && config.custom.length > 0) {
        for (const custom of config.custom) {
          builtIn.push({
            name: custom.name,
            path: `__custom_${custom.id}__`,
            content: custom.content
          })
        }
      }
      setBuiltInTemplates(builtIn)

      // Lade User-Templates aus Templates-Ordner im Vault
      const templates: TemplateInfo[] = []
      for (const note of notes) {
        if (isTemplateFile(note.path)) {
          try {
            const fullPath = `${vaultPath}/${note.path}`
            const content = await window.electronAPI.readFile(fullPath)
            templates.push({
              name: note.title,
              path: note.path,
              content
            })
          } catch (error) {
            console.error(`Fehler beim Laden von Template ${note.path}:`, error)
          }
        }
      }
      setUserTemplates(templates)
    }

    loadAllTemplates()
  }, [isOpen, notes, vaultPath])

  // Alle Templates kombinieren
  const allTemplates = useMemo(() => {
    return [...builtInTemplates, ...userTemplates]
  }, [builtInTemplates, userTemplates])

  // Gefilterte Templates
  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return allTemplates

    const query = searchQuery.toLowerCase()
    return allTemplates.filter(t =>
      t.name.toLowerCase().includes(query)
    )
  }, [allTemplates, searchQuery])

  // Reset bei Öffnen
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0)
      setSearchQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Reset selection bei Filter-Änderung
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredTemplates.length > 0) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, filteredTemplates.length])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => Math.min(prev + 1, filteredTemplates.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredTemplates[selectedIndex]) {
            handleSelect(filteredTemplates[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredTemplates, selectedIndex, onClose])

  const handleSelect = (template: TemplateInfo) => {
    const { content, cursorPosition } = parseTemplate(template.content, noteTitle)
    onSelect(content, cursorPosition)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="template-picker-overlay" onClick={onClose}>
      <div className="template-picker" onClick={e => e.stopPropagation()}>
        <div className="template-picker-header">
          <input
            ref={inputRef}
            type="text"
            className="template-picker-search"
            placeholder="Template suchen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="template-picker-list" ref={listRef}>
          {filteredTemplates.length === 0 ? (
            <div className="template-picker-empty">
              Keine Templates gefunden
            </div>
          ) : (
            filteredTemplates.map((template, index) => (
              <div
                key={template.path}
                className={`template-picker-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleSelect(template)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="template-picker-icon">
                  {template.path.startsWith('__') ? '📋' : '📄'}
                </span>
                <span className="template-picker-name">{template.name}</span>
                {!template.path.startsWith('__') && (
                  <span className="template-picker-path">{template.path}</span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="template-picker-footer">
          <span>↑↓ navigieren</span>
          <span>↵ auswählen</span>
          <span>Esc schließen</span>
          {onOpenSettings && (
            <button
              className="template-picker-settings-btn"
              onClick={() => {
                onClose()
                onOpenSettings()
              }}
            >
              Bearbeiten
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
