import React, { useCallback, useMemo, useEffect, useState, memo, useRef } from 'react'
import ReactFlow, {
  Node,
  Edge,
  MarkerType,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useReactFlow,
  Connection,
  Panel,
  type NodeChange,
  type EdgeChange,
  type OnConnectEnd,
  getNodesBounds
} from 'reactflow'
import { toSvg } from 'html-to-image'
import 'reactflow/dist/style.css'

import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useGraphStore } from '../../stores/graphStore'
import { useUIStore } from '../../stores/uiStore'
import { NoteNode } from './NoteNode'
import { PdfNode } from './PdfNode'
import { LabelNode } from './LabelNode'
import type { FileEntry } from '../../../shared/types'
import { resolveLink, extractLinks, generateNoteId, extractFirstCardCallout, extractTasks, extractExternalLinks, extractFirstImage } from '../../utils/linkExtractor'
import { applyLayout, type LayoutAlgorithm, type LayoutNode, type LayoutEdge } from '../../utils/layoutAlgorithms'
import { useTranslation } from '../../utils/translations'

// Verfügbare Farben für Nodes
const nodeColors = [
  { name: 'Standard', value: undefined },
  { name: 'Rot', value: '#ffcdd2' },
  { name: 'Orange', value: '#ffe0b2' },
  { name: 'Gelb', value: '#fff9c4' },
  { name: 'Grün', value: '#c8e6c9' },
  { name: 'Blau', value: '#bbdefb' },
  { name: 'Lila', value: '#e1bee7' },
  { name: 'Pink', value: '#f8bbd9' },
  { name: 'Grau', value: '#cfd8dc' },
]

// Kontextmenü Komponente
interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onDelete: () => void
  onColorChange?: (color: string | undefined) => void
  onOpenInEditor?: () => void
  onRename?: () => void
  onEditTags?: () => void
  onAddExternalLink?: () => void
  onAddImage?: () => void
  type: 'node' | 'edge' | 'label'
  currentColor?: string
}

const ContextMenu: React.FC<ContextMenuProps> = memo(({ x, y, onClose, onDelete, onColorChange, onOpenInEditor, onRename, onEditTags, onAddExternalLink, onAddImage, type, currentColor }) => {
  const { t } = useTranslation()
  const [showColors, setShowColors] = useState(false)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.context-menu')) {
        onClose()
      }
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [onClose])

  return (
    <div
      className="context-menu"
      style={{ position: 'fixed', left: x, top: y, zIndex: 1000 }}
    >
      {type === 'node' && (
        <>
          <button
            className="context-menu-item"
            onClick={() => {
              onOpenInEditor?.()
              onClose()
            }}
          >
            {t('graphCanvas.openInEditor')}
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              onRename?.()
              onClose()
            }}
          >
            {t('graphCanvas.rename')}
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              onEditTags?.()
              onClose()
            }}
          >
            {t('graphCanvas.editTags')}
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              onAddExternalLink?.()
              onClose()
            }}
          >
            {t('graphCanvas.addExternalLink')}
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              onAddImage?.()
              onClose()
            }}
          >
            {t('graphCanvas.addImage')}
          </button>

          <div className="context-menu-divider" />

          <button
            className="context-menu-item with-submenu"
            onClick={(e) => {
              e.stopPropagation()
              setShowColors(!showColors)
            }}
          >
            {t('graphCanvas.changeColor')}
            <span className="submenu-arrow">▶</span>
          </button>

          {showColors && (
            <div className="color-picker">
              {nodeColors.map((color) => (
                <button
                  key={color.name}
                  className={`color-option ${currentColor === color.value ? 'selected' : ''}`}
                  style={{ backgroundColor: color.value || 'var(--node-bg)' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onColorChange?.(color.value)
                    onClose()
                  }}
                  title={color.name}
                />
              ))}
            </div>
          )}

          <div className="context-menu-divider" />
        </>
      )}

      {type === 'label' && (
        <>
          <button
            className="context-menu-item"
            onClick={() => {
              onRename?.()
              onClose()
            }}
          >
            {t('graphCanvas.rename')}
          </button>

          <div className="context-menu-divider" />

          <button
            className="context-menu-item with-submenu"
            onClick={(e) => {
              e.stopPropagation()
              setShowColors(!showColors)
            }}
          >
            {t('graphCanvas.changeColor')}
            <span className="submenu-arrow">▶</span>
          </button>

          {showColors && (
            <div className="color-picker">
              {nodeColors.map((color) => (
                <button
                  key={color.name}
                  className={`color-option ${currentColor === color.value ? 'selected' : ''}`}
                  style={{ backgroundColor: color.value || 'var(--node-bg)' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onColorChange?.(color.value)
                    onClose()
                  }}
                  title={color.name}
                />
              ))}
            </div>
          )}

          <div className="context-menu-divider" />
        </>
      )}

      <button className="context-menu-item danger" onClick={onDelete}>
        {type === 'node' ? t('graphCanvas.deleteNote') : type === 'label' ? t('graphCanvas.deleteHeading') : t('graphCanvas.deleteConnection')}
      </button>
    </div>
  )
})

ContextMenu.displayName = 'ContextMenu'

// Tag-Edit Dialog Komponente
interface TagEditDialogProps {
  x: number
  y: number
  noteId: string
  currentTags: string[]
  allTags: string[]
  onClose: () => void
  onSave: (tags: string[]) => void
}

const TagEditDialog: React.FC<TagEditDialogProps> = memo(({ x, y, noteId: _noteId, currentTags, allTags, onClose, onSave }) => {
  const { t } = useTranslation()
  const [tags, setTags] = useState<string[]>(currentTags)
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.tag-edit-dialog')) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Filter suggestions based on input
  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return []
    const searchTerm = inputValue.toLowerCase().replace(/^#/, '')
    return allTags
      .filter(tag =>
        tag.toLowerCase().includes(searchTerm) &&
        !tags.includes(tag)
      )
      .slice(0, 5)
  }, [inputValue, allTags, tags])

  const handleAddTag = (tagName: string) => {
    const cleanTag = tagName.trim().replace(/^#/, '')
    if (cleanTag && !tags.includes(cleanTag)) {
      setTags([...tags, cleanTag])
    }
    setInputValue('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault()
      handleAddTag(inputValue)
    }
  }

  const handleSave = () => {
    // Falls noch Text im Input ist, als Tag hinzufügen
    let finalTags = [...tags]
    if (inputValue.trim()) {
      const cleanTag = inputValue.trim().replace(/^#/, '')
      if (cleanTag && !finalTags.includes(cleanTag)) {
        finalTags.push(cleanTag)
      }
    }
    onSave(finalTags)
    onClose()
  }

  return (
    <div className="tag-edit-dialog-overlay">
      <div
        className="tag-edit-dialog"
        style={{ left: x, top: y }}
      >
        <div className="tag-edit-header">
          <span>{t('graphCanvas.editTags')}</span>
          <button className="tag-edit-close" onClick={onClose}>×</button>
        </div>

        <div className="tag-edit-content">
          {/* Aktuelle Tags */}
          <div className="tag-edit-current">
            {tags.length === 0 ? (
              <span className="tag-edit-empty">{t('graphCanvas.noTags')}</span>
            ) : (
              tags.map(tag => (
                <span key={tag} className="tag-edit-chip">
                  #{tag}
                  <button
                    className="tag-edit-chip-remove"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Input für neue Tags */}
          <div className="tag-edit-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                setShowSuggestions(true)
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              placeholder={t('graphCanvas.addTag')}
              className="tag-edit-input"
            />

            {/* Autocomplete Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="tag-edit-suggestions">
                {suggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    className="tag-edit-suggestion"
                    onClick={() => handleAddTag(suggestion)}
                  >
                    #{suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="tag-edit-actions">
          <button className="tag-edit-cancel" onClick={onClose}>
            {t('graphCanvas.cancel')}
          </button>
          <button className="tag-edit-save" onClick={handleSave}>
            {t('graphCanvas.save')}
          </button>
        </div>
      </div>
    </div>
  )
})

TagEditDialog.displayName = 'TagEditDialog'

// External Link Dialog Komponente
interface ExternalLinkDialogProps {
  x: number
  y: number
  onClose: () => void
  onSave: (url: string, title?: string) => void
}

const ExternalLinkDialog: React.FC<ExternalLinkDialogProps> = memo(({ x, y, onClose, onSave }) => {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.external-link-dialog')) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSave = () => {
    if (!url.trim()) return
    onSave(url.trim(), title.trim() || undefined)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && url.trim()) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <div className="external-link-dialog-overlay">
      <div
        className="external-link-dialog"
        style={{ left: x, top: y }}
      >
        <div className="external-link-header">
          <span>{t('graphCanvas.addExternalLink')}</span>
          <button className="external-link-close" onClick={onClose}>×</button>
        </div>

        <div className="external-link-content">
          <div className="external-link-field">
            <label>URL *</label>
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com"
              className="external-link-input"
            />
          </div>

          <div className="external-link-field">
            <label>{t('graphCanvas.titleOptional')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('graphCanvas.linkDescription')}
              className="external-link-input"
            />
          </div>
        </div>

        <div className="external-link-actions">
          <button className="external-link-cancel" onClick={onClose}>
            {t('graphCanvas.cancel')}
          </button>
          <button
            className="external-link-save"
            onClick={handleSave}
            disabled={!url.trim()}
          >
            {t('graphCanvas.add')}
          </button>
        </div>
      </div>
    </div>
  )
})

ExternalLinkDialog.displayName = 'ExternalLinkDialog'

// Image Upload Dialog Komponente
interface ImageUploadDialogProps {
  x: number
  y: number
  onClose: () => void
  onSave: (file: File) => void
}

const ImageUploadDialog: React.FC<ImageUploadDialogProps> = memo(({ x, y, onClose, onSave }) => {
  const { t } = useTranslation()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.image-upload-dialog')) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      // Create preview URL
      const reader = new FileReader()
      reader.onload = () => {
        setPreviewUrl(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSave = () => {
    if (!selectedFile) return
    onSave(selectedFile)
    onClose()
  }

  return (
    <div className="image-upload-dialog-overlay">
      <div
        className="image-upload-dialog"
        style={{ left: x, top: y }}
      >
        <div className="image-upload-header">
          <span>{t('graphCanvas.addImage')}</span>
          <button className="image-upload-close" onClick={onClose}>×</button>
        </div>

        <div className="image-upload-content">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {previewUrl ? (
            <div className="image-upload-preview">
              <img src={previewUrl} alt="Preview" />
              <button
                className="image-upload-remove"
                onClick={() => {
                  setSelectedFile(null)
                  setPreviewUrl(null)
                  if (fileInputRef.current) {
                    fileInputRef.current.value = ''
                  }
                }}
              >
                ×
              </button>
            </div>
          ) : (
            <button
              className="image-upload-select-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="8" cy="10" r="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M3 17l5-5 3 3 5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>{t('graphCanvas.selectImage')}</span>
            </button>
          )}
        </div>

        <div className="image-upload-actions">
          <button className="image-upload-cancel" onClick={onClose}>
            {t('graphCanvas.cancel')}
          </button>
          <button
            className="image-upload-save"
            onClick={handleSave}
            disabled={!selectedFile}
          >
            {t('graphCanvas.add')}
          </button>
        </div>
      </div>
    </div>
  )
})

ImageUploadDialog.displayName = 'ImageUploadDialog'

// Alignment Toolbar Komponente
interface AlignmentToolbarProps {
  onAlign: (type: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV') => void
  onDistribute: (type: 'horizontal' | 'vertical') => void
  onApplyLayoutPreset: (preset: 'hierarchical' | 'grid' | 'colorCluster' | 'tagCluster') => void
  activeLayoutPreset: 'hierarchical' | 'grid' | 'colorCluster' | 'tagCluster'
  disabled: boolean
  selectedCount: number
}

const AlignmentToolbar: React.FC<AlignmentToolbarProps> = memo(({ onAlign, onDistribute, onApplyLayoutPreset, activeLayoutPreset, disabled, selectedCount }) => {
  const { t } = useTranslation()
  const [showArrangeMenu, setShowArrangeMenu] = useState(false)
  const arrangeMenuRef = useRef<HTMLDivElement>(null)

  // Close arrange menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (arrangeMenuRef.current && !arrangeMenuRef.current.contains(e.target as Node)) {
        setShowArrangeMenu(false)
      }
    }
    if (showArrangeMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showArrangeMenu])

  return (
    <div className="alignment-toolbar">
      <div className="arrange-selector" ref={arrangeMenuRef}>
        <button
          className="alignment-btn arrange-btn"
          onClick={() => setShowArrangeMenu(!showArrangeMenu)}
          title={t('graphCanvas.arrange')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="5" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="1" y="6" width="5" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="10" y="1" width="5" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="10" y="6" width="5" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M1 12h14M1 14.5h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 2"/>
          </svg>
          <span>{t('graphCanvas.arrange')}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="dropdown-arrow">
            <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {showArrangeMenu && (
          <div className="arrange-menu">
            {/* Align Section */}
            <div className="arrange-menu-label">{t('graphCanvas.align')}</div>
            <div className="arrange-menu-grid">
              <button className="alignment-btn" onClick={() => onAlign('left')} disabled={disabled} title={t('graphCanvas.alignLeft')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2v12M5 4h7M5 8h5M5 12h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
              <button className="alignment-btn" onClick={() => onAlign('centerH')} disabled={disabled} title={t('graphCanvas.alignCenter')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M4 5h8M5 8h6M3 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
              <button className="alignment-btn" onClick={() => onAlign('right')} disabled={disabled} title={t('graphCanvas.alignRight')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14 2v12M4 4h7M6 8h5M2 12h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
              <button className="alignment-btn" onClick={() => onAlign('top')} disabled={disabled} title={t('graphCanvas.alignTop')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2h12M4 5v7M8 5v5M12 5v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
              <button className="alignment-btn" onClick={() => onAlign('centerV')} disabled={disabled} title={t('graphCanvas.alignMiddle')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M5 4v8M8 5v6M11 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
              <button className="alignment-btn" onClick={() => onAlign('bottom')} disabled={disabled} title={t('graphCanvas.alignBottom')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 14h12M4 4v7M8 6v5M12 2v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>

            {/* Distribute Section */}
            <div className="arrange-menu-label">{t('graphCanvas.distribute')}</div>
            <div className="arrange-menu-row">
              <button className="alignment-btn" onClick={() => onDistribute('horizontal')} disabled={selectedCount < 3} title={t('graphCanvas.distributeHorizontal')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="5" width="3" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="6.5" y="5" width="3" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="11" y="5" width="3" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </button>
              <button className="alignment-btn" onClick={() => onDistribute('vertical')} disabled={selectedCount < 3} title={t('graphCanvas.distributeVertical')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="2" width="6" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="5" y="6.5" width="6" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="5" y="11" width="6" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </button>
            </div>

            <div className="arrange-menu-divider" />

            {/* Layout Presets */}
            <button
              className={`layout-menu-item ${activeLayoutPreset === 'hierarchical' ? 'active' : ''}`}
              onClick={() => { onApplyLayoutPreset('hierarchical'); setShowArrangeMenu(false) }}
              title={t('graphCanvas.layoutHierarchical')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth="1"/>
                <rect x="1" y="7" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth="1"/>
                <rect x="1" y="12" width="3" height="2" rx="0.5" stroke="currentColor" strokeWidth="1"/>
                <rect x="7" y="4" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth="1"/>
                <rect x="7" y="10" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth="1"/>
                <rect x="12" y="6" width="3" height="4" rx="0.5" stroke="currentColor" strokeWidth="1"/>
                <path d="M4 3.5H6L7 5.5M4 8.5H6L7 6.5M4 13H6L7 11.5M10 5.5H11L12 8M10 11.5H11L12 9" stroke="currentColor" strokeWidth="0.8"/>
              </svg>
              <span>{t('graphCanvas.hierarchical')}</span>
              <span className="layout-hint">{t('graphCanvas.noCrossings')}</span>
              <span className="layout-check">✓</span>
            </button>

            <div className="layout-menu-divider" />

            <button
              className={`layout-menu-item ${activeLayoutPreset === 'grid' ? 'active' : ''}`}
              onClick={() => { onApplyLayoutPreset('grid'); setShowArrangeMenu(false) }}
              title={t('graphCanvas.layoutGrid')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <span>{t('graphCanvas.grid')}</span>
              <span className="layout-hint">{t('graphCanvas.layoutGrid')}</span>
              <span className="layout-check">✓</span>
            </button>

            <button
              className={`layout-menu-item ${activeLayoutPreset === 'colorCluster' ? 'active' : ''}`}
              onClick={() => { onApplyLayoutPreset('colorCluster'); setShowArrangeMenu(false) }}
              title={t('graphCanvas.layoutByColor')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="4" height="3" rx="0.5" fill="#ffcdd2" stroke="#e57373" strokeWidth="0.8"/>
                <rect x="1" y="6" width="4" height="3" rx="0.5" fill="#ffcdd2" stroke="#e57373" strokeWidth="0.8"/>
                <rect x="6" y="2" width="4" height="3" rx="0.5" fill="#fff9c4" stroke="#fff176" strokeWidth="0.8"/>
                <rect x="6" y="6" width="4" height="3" rx="0.5" fill="#fff9c4" stroke="#fff176" strokeWidth="0.8"/>
                <rect x="6" y="10" width="4" height="3" rx="0.5" fill="#fff9c4" stroke="#fff176" strokeWidth="0.8"/>
                <rect x="11" y="2" width="4" height="3" rx="0.5" fill="#bbdefb" stroke="#64b5f6" strokeWidth="0.8"/>
                <rect x="11" y="6" width="4" height="3" rx="0.5" fill="#bbdefb" stroke="#64b5f6" strokeWidth="0.8"/>
              </svg>
              <span>{t('graphCanvas.colorCluster')}</span>
              <span className="layout-hint">{t('graphCanvas.layoutByColor')}</span>
              <span className="layout-check">✓</span>
            </button>

            <button
              className={`layout-menu-item ${activeLayoutPreset === 'tagCluster' ? 'active' : ''}`}
              onClick={() => { onApplyLayoutPreset('tagCluster'); setShowArrangeMenu(false) }}
              title={t('graphCanvas.layoutByTags')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <text x="2" y="5" fontSize="4" fill="currentColor">#A</text>
                <rect x="1" y="6" width="4" height="2" rx="0.3" stroke="currentColor" strokeWidth="0.6"/>
                <rect x="1" y="9" width="4" height="2" rx="0.3" stroke="currentColor" strokeWidth="0.6"/>
                <text x="7" y="5" fontSize="4" fill="currentColor">#B</text>
                <rect x="6" y="6" width="4" height="2" rx="0.3" stroke="currentColor" strokeWidth="0.6"/>
                <rect x="6" y="9" width="4" height="2" rx="0.3" stroke="currentColor" strokeWidth="0.6"/>
                <rect x="6" y="12" width="4" height="2" rx="0.3" stroke="currentColor" strokeWidth="0.6"/>
                <text x="12" y="5" fontSize="4" fill="currentColor">#C</text>
                <rect x="11" y="6" width="4" height="2" rx="0.3" stroke="currentColor" strokeWidth="0.6"/>
              </svg>
              <span>{t('graphCanvas.tagCluster')}</span>
              <span className="layout-hint">{t('graphCanvas.layoutByTags')}</span>
              <span className="layout-check">✓</span>
            </button>
          </div>
        )}
      </div>

      {selectedCount > 0 && (
        <span className="alignment-info" title={`${selectedCount} ${t('graphCanvas.selected')}`}>
          {selectedCount}
        </span>
      )}
    </div>
  )
})

AlignmentToolbar.displayName = 'AlignmentToolbar'

// Stabile Referenzen - MÜSSEN außerhalb der Komponente sein
const nodeTypes = { note: NoteNode, pdf: PdfNode, label: LabelNode } as const
const fitViewOptions = { padding: 0.2 }
const connectionLineStyle = { stroke: 'var(--accent-color)', strokeWidth: 2 }
const defaultEdgeOptions = {
  type: 'default' as const,
  sourceHandle: 'source-right',
  targetHandle: 'target-left'
}

// Hilfsfunktion um PDFs rekursiv aus dem FileTree zu extrahieren
function extractPdfsFromFileTree(entries: FileEntry[], filterPath: string | null): { path: string; title: string }[] {
  const pdfs: { path: string; title: string }[] = []

  function traverse(items: FileEntry[]) {
    for (const item of items) {
      if (item.isDirectory && item.children) {
        traverse(item.children)
      } else if (item.fileType === 'pdf') {
        // Wenn Filter gesetzt, nur PDFs im gefilterten Pfad
        if (filterPath) {
          if (filterPath === '__root__') {
            // Nur PDFs auf Hauptebene
            if (!item.path.includes('/')) {
              pdfs.push({ path: item.path, title: item.name.replace('.pdf', '') })
            }
          } else {
            const itemDir = item.path.split('/').slice(0, -1).join('/')
            if (itemDir === filterPath || itemDir.startsWith(filterPath + '/')) {
              pdfs.push({ path: item.path, title: item.name.replace('.pdf', '') })
            }
          }
        } else {
          pdfs.push({ path: item.path, title: item.name.replace('.pdf', '') })
        }
      }
    }
  }

  traverse(entries)
  return pdfs
}

// Props für Local Canvas Mode
interface GraphCanvasProps {
  localRootNoteId?: string | null  // Wenn gesetzt: nur diese Note + Verbindungen anzeigen
  expandedNoteIds?: Set<string>    // Erweiterte Nodes im Local Mode
  onExpandNode?: (noteId: string) => void  // Callback für Expand-Button
}

// Stabile leere Set-Referenz für Default
const EMPTY_SET = new Set<string>()

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  localRootNoteId = null,
  expandedNoteIds = EMPTY_SET,
  onExpandNode
}) => {
  const allNotes = useNotesStore((s) => s.notes)
  const selectNote = useNotesStore((s) => s.selectNote)
  const selectPdf = useNotesStore((s) => s.selectPdf)
  const selectedNoteId = useNotesStore((s) => s.selectedNoteId)
  const updateNote = useNotesStore((s) => s.updateNote)
  const updateNotePath = useNotesStore((s) => s.updateNotePath)
  const removeNote = useNotesStore((s) => s.removeNote)
  const addNote = useNotesStore((s) => s.addNote)
  const setFileTree = useNotesStore((s) => s.setFileTree)
  const vaultPath = useNotesStore((s) => s.vaultPath)
  const fileTree = useNotesStore((s) => s.fileTree)

  const { positions, manualEdges, labels, viewport, setNodePosition, setViewport, removeManualEdge, setNodeColor, setNodeDimensions, removeNodePosition, addLabel, updateLabel, removeLabel } = useGraphStore()

  const {
    viewMode,
    setViewMode,
    canvasFilterPath, setCanvasFilterPath,
    canvasShowTags, setCanvasShowTags,
    canvasShowLinks, setCanvasShowLinks,
    canvasShowImages, setCanvasShowImages,
    canvasShowSummaries, setCanvasShowSummaries,
    canvasCompactMode, setCanvasCompactMode,
    canvasDefaultCardWidth
  } = useUIStore()

  const { fitView, screenToFlowPosition, getNodes } = useReactFlow()
  const { t } = useTranslation()
  const loadingContentPathsRef = useRef<Set<string>>(new Set())

  // SVG Export Funktion - exportiert das gesamte Canvas
  const handleExportSvg = useCallback(async () => {
    const flowElement = document.querySelector('.react-flow__viewport') as HTMLElement
    if (!flowElement) {
      console.error('React Flow viewport not found')
      return
    }

    const currentNodes = getNodes()
    if (currentNodes.length === 0) {
      console.error('Keine Nodes zum Exportieren')
      return
    }

    // Berechne die Bounding Box aller Nodes
    const nodesBounds = getNodesBounds(currentNodes)

    // Padding um die Nodes herum
    const padding = 50
    const imageWidth = nodesBounds.width + padding * 2
    const imageHeight = nodesBounds.height + padding * 2

    // Berechne den Transform: verschiebe so, dass Nodes ab (padding, padding) beginnen
    const translateX = -nodesBounds.x + padding
    const translateY = -nodesBounds.y + padding

    // Hole die berechnete Hintergrundfarbe
    const computedStyle = getComputedStyle(document.documentElement)
    const bgColor = computedStyle.getPropertyValue('--bg-primary').trim() || '#1a1a2e'

    // Speichere den aktuellen Transform und setze den Export-Transform
    const originalTransform = flowElement.style.transform
    flowElement.style.transform = `translate(${translateX}px, ${translateY}px) scale(1)`

    try {
      const dataUrl = await toSvg(flowElement, {
        backgroundColor: bgColor,
        width: imageWidth,
        height: imageHeight,
        filter: (node) => {
          // Filtere MiniMap, Controls und andere UI-Elemente aus
          const classList = node.classList
          if (!classList) return true
          return !classList.contains('react-flow__minimap') &&
                 !classList.contains('react-flow__controls') &&
                 !classList.contains('react-flow__panel') &&
                 !classList.contains('react-flow__background')
        }
      })

      // Transform zurücksetzen
      flowElement.style.transform = originalTransform

      // Download - dataUrl ist bereits eine data: URL
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `mindgraph-canvas-${new Date().toISOString().split('T')[0]}.svg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('SVG Export fehlgeschlagen:', error)
      // Transform auch bei Fehler zurücksetzen
      flowElement.style.transform = originalTransform
    }
  }, [getNodes])

  // Notizen nach Ordner-Filter oder Local Mode filtern
  const notes = useMemo(() => {
    // Local Mode: nur Root-Note + direkte Verbindungen
    if (localRootNoteId) {
      const rootNote = allNotes.find(n => n.id === localRootNoteId)
      if (!rootNote) return []

      const visibleIds = new Set<string>([localRootNoteId])

      // Hilfsfunktion um Verbindungen einer Note zu finden
      const addConnections = (note: typeof rootNote) => {
        // Outgoing links
        for (const linkText of note.outgoingLinks) {
          const targetNote = allNotes.find(n =>
            n.title === linkText ||
            n.path === linkText ||
            n.path.endsWith(`/${linkText}.md`) ||
            n.path.endsWith(`/${linkText}`)
          )
          if (targetNote) visibleIds.add(targetNote.id)
        }
        // Incoming links (backlinks)
        for (const backlinkId of note.incomingLinks) {
          visibleIds.add(backlinkId)
        }
      }

      // Root-Note Verbindungen hinzufügen
      addConnections(rootNote)

      // Erweiterte Nodes: auch deren Verbindungen hinzufügen
      for (const expandedId of expandedNoteIds) {
        const expandedNote = allNotes.find(n => n.id === expandedId)
        if (expandedNote) {
          addConnections(expandedNote)
        }
      }

      return allNotes.filter(note => visibleIds.has(note.id))
    }

    // Standard Ordner-Filter
    if (!canvasFilterPath) return allNotes
    if (canvasFilterPath === '__root__') {
      // Nur Notizen auf Hauptebene (ohne Ordner)
      return allNotes.filter(note => !note.path.includes('/'))
    }
    return allNotes.filter(note => {
      // Prüfen ob Notiz im gefilterten Ordner liegt (direkt oder Unterordner)
      const noteDir = note.path.split('/').slice(0, -1).join('/')
      return noteDir === canvasFilterPath || noteDir.startsWith(canvasFilterPath + '/')
    })
  }, [allNotes, canvasFilterPath, localRootNoteId, expandedNoteIds])

  useEffect(() => {
    if (!vaultPath) return

    const missingContentNotes = notes.filter(
      note => !note.content && !loadingContentPathsRef.current.has(note.path)
    )
    if (missingContentNotes.length === 0) return

    const pathsToLoad = missingContentNotes.map(note => note.path)
    const notesByPath = new Map(missingContentNotes.map(note => [note.path, note]))
    pathsToLoad.forEach(path => loadingContentPathsRef.current.add(path))

    void (async () => {
      try {
        const contents = await window.electronAPI.readFilesBatch(vaultPath, pathsToLoad) as Record<string, string | null>

        for (const path of pathsToLoad) {
          const content = contents[path]
          const note = notesByPath.get(path)
          if (note && typeof content === 'string') {
            updateNote(note.id, { content })
          }
        }
      } catch (error) {
        console.error('[Canvas] Failed to load note contents for callouts:', error)
      } finally {
        pathsToLoad.forEach(path => loadingContentPathsRef.current.delete(path))
      }
    })()
  }, [notes, vaultPath, updateNote])

  // PDFs nach Ordner-Filter filtern (nur PDFs ohne Companion-Note anzeigen)
  const pdfs = useMemo(() => {
    const allPdfs = extractPdfsFromFileTree(fileTree, canvasFilterPath)
    // Filter out PDFs that have companion notes (they're shown as note nodes instead)
    const companionPdfPaths = new Set(notes.filter(n => n.sourcePdf).map(n => n.sourcePdf))
    return allPdfs.filter(pdf => !companionPdfPaths.has(pdf.path))
  }, [fileTree, canvasFilterPath, notes])

  // Ordnerliste für Filter-Dropdown extrahieren + Counts vorberechnen
  const { folders, folderCounts } = useMemo(() => {
    const folderSet = new Set<string>()
    const counts = new Map<string, number>()

    allNotes.forEach(note => {
      const parts = note.path.split('/')
      if (parts.length > 1) {
        // Alle Ordner-Ebenen hinzufügen
        for (let i = 1; i < parts.length; i++) {
          const folder = parts.slice(0, i).join('/')
          folderSet.add(folder)
        }
        // Count für den direkten Parent-Ordner
        const noteDir = parts.slice(0, -1).join('/')
        counts.set(noteDir, (counts.get(noteDir) || 0) + 1)
      }
    })

    // Auch Unterordner-Counts aggregieren
    const sortedFolders = Array.from(folderSet).sort()
    sortedFolders.forEach(folder => {
      if (!counts.has(folder)) {
        // Zähle alle Notizen in diesem Ordner und Unterordnern
        let count = 0
        allNotes.forEach(note => {
          const noteDir = note.path.split('/').slice(0, -1).join('/')
          if (noteDir === folder || noteDir.startsWith(folder + '/')) {
            count++
          }
        })
        counts.set(folder, count)
      }
    })

    return { folders: sortedFolders, folderCounts: counts }
  }, [allNotes])

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    type: 'node' | 'edge' | 'label'
    id: string
  } | null>(null)

  // Pane Context Menu (Rechtsklick auf leere Fläche)
  const [paneContextMenu, setPaneContextMenu] = useState<{
    x: number
    y: number
    flowPosition: { x: number; y: number }
  } | null>(null)

  // Tag-Edit Dialog State
  const [tagEditDialog, setTagEditDialog] = useState<{
    noteId: string
    x: number
    y: number
  } | null>(null)

  // External Link Dialog State
  const [externalLinkDialog, setExternalLinkDialog] = useState<{
    noteId: string
    x: number
    y: number
  } | null>(null)

  // Image Upload Dialog State
  const [imageUploadDialog, setImageUploadDialog] = useState<{
    noteId: string
    x: number
    y: number
  } | null>(null)

  // Focus Mode State - nur ausgewählte Karten anzeigen
  const [focusMode, setFocusMode] = useState(false)
  const [focusedNodeIds, setFocusedNodeIds] = useState<Set<string>>(new Set())
  const [activeLayoutPreset, setActiveLayoutPreset] = useState<'hierarchical' | 'grid' | 'colorCluster' | 'tagCluster'>('hierarchical')

  // Editing State - welche Node wird gerade bearbeitet
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)

  // State für "Neue Notiz" Dialog beim Ziehen einer Verbindung ins Leere
  const [newNoteDialog, setNewNoteDialog] = useState<{
    x: number
    y: number
    flowPosition: { x: number; y: number }
    sourceNodeId?: string
  } | null>(null)
  const [newNoteName, setNewNoteName] = useState('')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [newNoteTags, setNewNoteTags] = useState('')
  const [newNoteTodos, setNewNoteTodos] = useState('')
  const [newNoteLink, setNewNoteLink] = useState('')
  const [newNoteImage, setNewNoteImage] = useState<File | null>(null)
  const [newNoteImagePreview, setNewNoteImagePreview] = useState<string | null>(null)
  
  // Generiere stabile Positionen für neue Nodes (basierend auf ID-Hash)
  const getStablePosition = useCallback((noteId: string, index: number) => {
    // Einfacher Hash aus der ID für konsistente Positionen
    let hash = 0
    for (let i = 0; i < noteId.length; i++) {
      hash = ((hash << 5) - hash) + noteId.charCodeAt(i)
      hash = hash & hash
    }
    const offsetX = Math.abs(hash % 100) - 50
    const offsetY = Math.abs((hash >> 8) % 100) - 50

    return {
      x: (index % 5) * 200 + 100 + offsetX,
      y: Math.floor(index / 5) * 150 + 100 + offsetY
    }
  }, [])

  // Speichere Positionen für neue Notizen sofort
  useEffect(() => {
    notes.forEach((note, index) => {
      if (!positions[note.id]) {
        const pos = getStablePosition(note.id, index)
        setNodePosition(note.id, pos.x, pos.y)
      }
    })
  }, [notes, positions, getStablePosition, setNodePosition])

  // Titel einer Karte ändern (Datei umbenennen)
  const handleNodeTitleChange = useCallback(async (noteId: string, newTitle: string) => {
    if (!vaultPath) return

    const note = notes.find(n => n.id === noteId)
    if (!note) return

    const oldPath = `${vaultPath}/${note.path}`
    const parentPath = note.path.includes('/')
      ? note.path.substring(0, note.path.lastIndexOf('/'))
      : ''
    const newFileName = `${newTitle}.md`
    const newRelativePath = parentPath ? `${parentPath}/${newFileName}` : newFileName
    const newFullPath = `${vaultPath}/${newRelativePath}`

    // Neue ID basierend auf neuem Pfad generieren
    const newId = generateNoteId(newRelativePath)

    try {
      // Datei umbenennen
      const result = await window.electronAPI.renameFile(oldPath, newFullPath)
      if (result.success) {
        // Content aktualisieren (Titel in der Datei ändern)
        const content = await window.electronAPI.readFile(newFullPath)
        const newContent = content.replace(/^# .+$/m, `# ${newTitle}`)
        await window.electronAPI.writeFile(newFullPath, newContent)

        // Position von alter ID zu neuer ID migrieren
        const oldPosition = positions[noteId]
        if (oldPosition) {
          setNodePosition(newId, oldPosition.x, oldPosition.y)
          if (oldPosition.color) setNodeColor(newId, oldPosition.color)
          if (oldPosition.width && oldPosition.height) {
            setNodeDimensions(newId, oldPosition.width, oldPosition.height)
          }
          // Alte Position entfernen
          removeNodePosition(noteId)
        }

        // Notiz im Store aktualisieren mit neuer ID
        updateNotePath(noteId, newRelativePath, newId)

        // Content separat aktualisieren
        updateNote(newId, { content: newContent })

        // Dateibaum aktualisieren
        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)
      }
    } catch (error) {
      console.error('Fehler beim Umbenennen:', error)
    }
  }, [vaultPath, notes, positions, updateNotePath, updateNote, setFileTree, setNodePosition, setNodeColor, setNodeDimensions, removeNodePosition])

  // Bearbeitungsmodus beenden
  const handleEditingDone = useCallback(() => {
    setEditingNodeId(null)
  }, [])

  // Label Text ändern
  const handleLabelTextChange = useCallback((labelId: string, newText: string) => {
    updateLabel(labelId, { text: newText })
  }, [updateLabel])

  // Tags einer Notiz aktualisieren (Frontmatter)
  const handleSaveTags = useCallback(async (noteId: string, newTags: string[]) => {
    if (!vaultPath) return

    const note = notes.find(n => n.id === noteId)
    if (!note) return

    const filePath = `${vaultPath}/${note.path}`

    try {
      const content = await window.electronAPI.readFile(filePath)
      let newContent: string

      // Prüfe ob Frontmatter existiert
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)

      if (frontmatterMatch) {
        // Frontmatter existiert - Tags-Zeile aktualisieren oder hinzufügen
        const frontmatterContent = frontmatterMatch[1]
        const restContent = content.slice(frontmatterMatch[0].length)

        // Entferne nur die tags-Sektion (tags: und zugehörige - Einträge)
        const lines = frontmatterContent.split('\n')
        const filteredLines: string[] = []
        let inTagsSection = false

        for (const line of lines) {
          const trimmed = line.trim()

          if (trimmed.startsWith('tags:')) {
            inTagsSection = true
            // Wenn inline-Array (tags: [a, b]), einfach überspringen
            continue
          }

          // Wenn wir in der tags-Sektion sind und eine - Zeile sehen, überspringen
          if (inTagsSection && trimmed.startsWith('-')) {
            continue
          }

          // Wenn wir eine neue Key: Zeile sehen, sind wir aus der tags-Sektion raus
          if (inTagsSection && trimmed.match(/^\w+:/)) {
            inTagsSection = false
          }

          // Leere Zeilen in der tags-Sektion überspringen
          if (inTagsSection && trimmed === '') {
            continue
          }

          filteredLines.push(line)
        }

        let updatedFrontmatter = filteredLines.join('\n').trim()

        // Füge neue Tags hinzu wenn vorhanden
        if (newTags.length > 0) {
          const tagsLine = `tags: [${newTags.join(', ')}]`
          updatedFrontmatter = updatedFrontmatter
            ? `${updatedFrontmatter}\n${tagsLine}`
            : tagsLine
        }

        // Wenn Frontmatter jetzt leer ist, entferne sie ganz
        if (!updatedFrontmatter.trim()) {
          newContent = restContent.replace(/^\n+/, '')
        } else {
          newContent = `---\n${updatedFrontmatter}\n---${restContent}`
        }
      } else {
        // Keine Frontmatter - neue hinzufügen wenn Tags vorhanden
        if (newTags.length > 0) {
          const tagsLine = `tags: [${newTags.join(', ')}]`
          newContent = `---\n${tagsLine}\n---\n\n${content}`
        } else {
          newContent = content
        }
      }

      // Datei speichern
      await window.electronAPI.writeFile(filePath, newContent)

      // Store aktualisieren
      updateNote(noteId, {
        content: newContent,
        tags: newTags,
        modifiedAt: new Date()
      })
    } catch (error) {
      console.error('Fehler beim Speichern der Tags:', error)
    }
  }, [vaultPath, notes, updateNote])

  // Externen Link zu einer Notiz hinzufügen
  const handleAddExternalLink = useCallback(async (noteId: string, url: string, title?: string) => {
    if (!vaultPath) return

    const note = notes.find(n => n.id === noteId)
    if (!note) return

    const filePath = `${vaultPath}/${note.path}`

    try {
      const content = await window.electronAPI.readFile(filePath)

      // Format: [Titel](URL) oder nur URL als Link
      const linkText = title ? `[${title}](${url})` : `[${t('graphCanvas.openLink')}](${url})`
      const linkLine = `\n\n🔗 ${linkText}`

      const newContent = content.trimEnd() + linkLine

      await window.electronAPI.writeFile(filePath, newContent)

      updateNote(noteId, {
        content: newContent,
        modifiedAt: new Date()
      })
    } catch (error) {
      console.error('Fehler beim Hinzufügen des externen Links:', error)
    }
  }, [vaultPath, notes, updateNote])

  // Bild zu einer Notiz hinzufügen
  const handleAddImage = useCallback(async (noteId: string, file: File) => {
    if (!vaultPath) return

    const note = notes.find(n => n.id === noteId)
    if (!note) return

    const filePath = `${vaultPath}/${note.path}`

    try {
      // Bild als Base64 lesen und in Attachments speichern
      const reader = new FileReader()
      const dataUrlPromise = new Promise<string>((resolve) => {
        reader.onload = () => {
          resolve(reader.result as string)
        }
        reader.readAsDataURL(file)
      })
      const fullDataUrl = await dataUrlPromise

      // Vollständige DataUrl mit MIME-Type übergeben, damit die Extension korrekt erkannt wird
      const imageResult = await window.electronAPI.writeImageFromBase64(
        vaultPath,
        fullDataUrl,
        file.name
      )

      if (imageResult.success && imageResult.fileName) {
        const content = await window.electronAPI.readFile(filePath)

        // Prüfen ob bereits ein Bild in der Notiz existiert
        const existingImage = extractFirstImage(content)

        let newContent: string
        if (existingImage) {
          // Bild am Ende hinzufügen (wird nicht auf Karte angezeigt, aber ist in der Notiz)
          newContent = content.trimEnd() + `\n\n![[${imageResult.fileName}]]`
        } else {
          // Erstes Bild: Nach dem Titel einfügen, damit es auf der Karte sichtbar ist
          const lines = content.split('\n')
          const titleIndex = lines.findIndex(line => line.startsWith('# '))

          if (titleIndex !== -1) {
            // Nach Titel einfügen
            lines.splice(titleIndex + 1, 0, '', `![[${imageResult.fileName}]]`)
            newContent = lines.join('\n')
          } else {
            // Kein Titel gefunden - am Anfang einfügen
            newContent = `![[${imageResult.fileName}]]\n\n${content}`
          }
        }

        await window.electronAPI.writeFile(filePath, newContent)

        // Notiz aktualisieren
        updateNote(noteId, {
          content: newContent,
          modifiedAt: new Date()
        })

        // Bild-Cache aktualisieren (nur wenn erstes Bild)
        if (!existingImage) {
          setImageDataUrls(prev => ({ ...prev, [noteId]: fullDataUrl }))

          // Bilder-Anzeige automatisch aktivieren wenn deaktiviert
          if (!canvasShowImages) {
            setCanvasShowImages(true)
          }
        }
      }
    } catch (error) {
      console.error('Fehler beim Hinzufügen des Bildes:', error)
    }
  }, [vaultPath, notes, updateNote, canvasShowImages, setCanvasShowImages])

  // Task auf Karte abhaken/aktivieren
  const handleTaskToggle = useCallback(async (noteId: string, taskLine: number, completed: boolean) => {
    if (!vaultPath) return

    const note = notes.find(n => n.id === noteId)
    if (!note) return

    const filePath = `${vaultPath}/${note.path}`

    try {
      // Datei lesen
      const content = await window.electronAPI.readFile(filePath)
      const lines = content.split('\n')

      // Zeile finden (taskLine ist 1-basiert)
      const lineIndex = taskLine - 1
      if (lineIndex < 0 || lineIndex >= lines.length) return

      const line = lines[lineIndex]

      // Task-Checkbox toggeln: - [ ] <-> - [x] oder * [ ] <-> * [x]
      let newLine: string
      if (completed) {
        // Von [ ] zu [x]
        newLine = line.replace(/^(\s*[-*]\s*)\[ \]/, '$1[x]')
      } else {
        // Von [x] zu [ ]
        newLine = line.replace(/^(\s*[-*]\s*)\[x\]/i, '$1[ ]')
      }

      if (newLine === line) return // Keine Änderung

      lines[lineIndex] = newLine
      const newContent = lines.join('\n')

      // Datei speichern
      await window.electronAPI.writeFile(filePath, newContent)

      // Notiz im Store aktualisieren
      updateNote(noteId, { content: newContent })
    } catch (error) {
      console.error('Fehler beim Toggeln des Tasks:', error)
    }
  }, [vaultPath, notes, updateNote])

  // Externen Link im Standard-Browser öffnen
  const handleOpenExternalLink = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  const extractCardCalloutSafe = (content: string) => {
    const parsed = extractFirstCardCallout(content)
    if (parsed) return parsed

    const blockMatch = content.match(/>\s*\[!([^\]\s]+)\]\s*([^\n\r]*)[\r\n]+((?:>.*(?:[\r\n]+|$))*)/i)
    if (!blockMatch) return null

    const rawType = blockMatch[1].toLowerCase()
    const typeAlias: Record<string, string> = {
      zusammenfassung: 'summary',
      'tl-dr': 'tldr',
      tl_dr: 'tldr'
    }
    const type = typeAlias[rawType] || rawType
    const allowedTypes = new Set(['summary', 'tldr', 'abstract', 'note', 'info'])
    if (!allowedTypes.has(type)) return null

    const headerText = (blockMatch[2] || '').trim()
    const body = (blockMatch[3] || '')
      .split(/\r?\n/)
      .map(line => line.replace(/^>\s?/, '').trim())
      .filter(Boolean)
      .join(' ')
      .trim()

    const contentText = body || headerText
    if (!contentText) return null

    const icons: Record<string, string> = {
      summary: '📄',
      tldr: '📄',
      abstract: '📄',
      note: '📝',
      info: 'ℹ️'
    }

    return {
      type,
      title: headerText || type.charAt(0).toUpperCase() + type.slice(1),
      content: contentText,
      icon: icons[type] || '📌'
    }
  }

  const truncateToWordLimit = (text: string, wordLimit: number): string => {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) return ''

    const words = normalized.split(' ')
    if (words.length <= wordLimit) return normalized

    return `${words.slice(0, wordLimit).join(' ')}...`
  }

  const estimateWrappedLineCount = (text: string, charsPerLine: number): number => {
    const words = text.split(' ').filter(Boolean)
    if (words.length === 0) return 0

    let lines = 1
    let currentLineChars = 0

    for (const word of words) {
      const wordLength = word.length

      if (currentLineChars === 0) {
        if (wordLength <= charsPerLine) {
          currentLineChars = wordLength
          continue
        }

        const wrappedWordLines = Math.ceil(wordLength / charsPerLine)
        lines += wrappedWordLines - 1
        currentLineChars = wordLength % charsPerLine || charsPerLine
        continue
      }

      const charsWithSpace = currentLineChars + 1 + wordLength
      if (charsWithSpace <= charsPerLine) {
        currentLineChars = charsWithSpace
        continue
      }

      lines += 1
      if (wordLength <= charsPerLine) {
        currentLineChars = wordLength
      } else {
        const wrappedWordLines = Math.ceil(wordLength / charsPerLine)
        lines += wrappedWordLines - 1
        currentLineChars = wordLength % charsPerLine || charsPerLine
      }
    }

    return lines
  }

  const calculateCalloutHeight = (callout: any, nodeWidth: number): number => {
    if (!callout?.content) return 0

    const previewText = truncateToWordLimit(callout.content, 100)
    if (!previewText) return 0

    const contentWidth = Math.max(nodeWidth - 52, 120)
    const averageCharWidth = 5.2
    const charsPerLine = Math.max(18, Math.floor(contentWidth / averageCharWidth))
    const estimatedLines = estimateWrappedLineCount(previewText, charsPerLine)
    const lineSafetyBuffer = estimatedLines >= 5 ? 1 : 0
    const totalLines = estimatedLines + lineSafetyBuffer

    const headerHeight = 22
    const contentHeight = totalLines * 14
    const paddingAndGaps = 20

    return headerHeight + contentHeight + paddingAndGaps
  }

  // Berechnet die Dimensionen basierend auf Inhalt
  // STRATEGIE: Breite so wählen, dass Titel auf EINE Zeile passt → einfachere Höhenberechnung
  const calculateNodeDimensions = (
    title: string,
    callout: any,
    taskSummary: any,
    hasImage: boolean,
    hasExternalLink: boolean,
    tagCount: number = 0,
    linkCount: number = 0,
    showTags: boolean = true,
    showLinks: boolean = true,
    showSummaries: boolean = true,
    compactMode: boolean = false
  ): { width: number; height: number } => {
    // === BREITE berechnen ===
    // Basis: User-Einstellung für Standard-Kartenbreite
    const baseWidth = canvasDefaultCardWidth

    // Titel-Breite berechnen (ca. 9px pro Zeichen)
    const charWidth = 9
    const titleWidth = title.length * charWidth
    const padding = 32 // 14px links + 14px rechts + 4px Sicherheit

    // Breite = Maximum aus Basis-Breite und Titel-Breite
    // Max: 400px (für sehr lange Titel)
    let width = Math.max(baseWidth, Math.min(titleWidth + padding, 400))

    // Spezielle Inhalte können mehr Breite brauchen
    if (hasImage) width = Math.max(width, baseWidth + 20)
    if (taskSummary?.total > 0) width = Math.max(width, baseWidth)
    if (hasExternalLink) width = Math.max(width, baseWidth)
    if (showSummaries && callout) width = Math.max(width, baseWidth + 20)

    // Tags brauchen Breite - damit mehr Tags nebeneinander passen
    if (showTags && tagCount > 0) {
      // Bei 3+ Tags: Extra Breite damit 2-3 Tags pro Zeile passen
      if (tagCount >= 3) {
        width = Math.max(width, baseWidth + 60)
      }
    }

    // === HÖHE berechnen ===
    // Padding: 10px oben + 10px unten = 20px
    let height = 20

    // Titel: Bei unserer Breiten-Strategie passt der Titel auf eine Zeile
    // Nur bei sehr langen Titeln (>400px breit) kann es zu Umbruch kommen
    const titleFitsOneLine = (titleWidth + padding) <= 400
    const titleLines = titleFitsOneLine ? 1 : 2
    height += titleLines * 26 // ~26px pro Zeile (font-size + line-height)

    // Im Kompakt-Modus: nur Titel, optional Zusammenfassung
    if (compactMode) {
      if (showSummaries && callout) {
        height += calculateCalloutHeight(callout, width)
      }
      return { width, height: Math.max(height, 50) }
    }

    // Bild
    if (hasImage) height += 116 // 100px Bild + 8px gap + 8px margin

    // Externer Link
    if (hasExternalLink) height += 40 // 32px Link + 8px gap

    if (showSummaries && callout) {
      height += calculateCalloutHeight(callout, width)
    }

    // Tasks
    if (taskSummary?.total > 0) {
      const openTasks = taskSummary.tasks.filter((t: any) => !t.completed).length
      const displayedTasks = Math.min(openTasks, 3)
      height += 8 // gap
      height += 28 // Counter
      height += displayedTasks * 26 // Task-Zeilen
      if (openTasks > 3) height += 22 // "+X weitere"
    }

    // Meta-Bereich (Links und Tags)
    const hasVisibleLinks = showLinks && linkCount > 0
    const hasVisibleTags = showTags && tagCount > 0

    if (hasVisibleLinks || hasVisibleTags) {
      height += 12 // gap zum vorherigen Element

      // Link-Anzeige
      if (hasVisibleLinks) {
        height += 24 // Link-Counter mit Icon
      }

      // Tags-Anzeige
      if (hasVisibleTags) {
        const displayedTags = Math.min(tagCount, 3) + (tagCount > 3 ? 1 : 0)
        // Großzügige Tag-Breite: lange Tags wie #Organische_Chemie brauchen ~120px
        // Durchschnitt: ~90px pro Tag
        const effectiveWidth = width - padding
        const tagsPerRow = Math.max(1, Math.floor(effectiveWidth / 95))
        const tagRows = Math.ceil(displayedTags / tagsPerRow)
        // Jede Tag-Zeile: 22px Tag + 8px gap = 30px
        height += tagRows * 30
      }
    }

    // WICHTIG: Extra Höhe wenn Callout UND Tags zusammen vorkommen
    // Diese Kombination ist das Hauptproblem - braucht deutlich mehr Platz!
    if (showSummaries && callout && hasVisibleTags) {
      height += 25
    }

    // Sicherheitspuffer am Ende (wichtig für Rahmen)
    height += 15

    return { width, height }
  }

  // State für Bild-DataURLs (Cache) - speichert auch den Bildpfad für Invalidierung
  const [imageDataUrls, setImageDataUrls] = useState<Record<string, string>>({})
  const [imagePaths, setImagePaths] = useState<Record<string, string>>({}) // Welches Bild wurde geladen
  // Ref um zu tracken welche Bilder gerade geladen werden (verhindert Mehrfach-Laden)
  const loadingImagesRef = useRef<Set<string>>(new Set())

  // Lädt Bild-DataURL für eine Notiz
  const loadImageDataUrl = useCallback(async (noteId: string, imagePath: string) => {
    // Prüfe ob Cache noch gültig ist (gleiches Bild) oder invalidiert werden muss
    const cachedPath = imagePaths[noteId]
    const needsReload = cachedPath && cachedPath !== imagePath

    // Bereits gecached mit gleichem Bild, oder wird gerade geladen
    if (!vaultPath || loadingImagesRef.current.has(noteId)) {
      return
    }

    // Wenn gleiches Bild bereits gecached, nichts tun
    if (imageDataUrls[noteId] && !needsReload) {
      return
    }

    // Als "wird geladen" markieren
    loadingImagesRef.current.add(noteId)

    try {
      // Suche Bild im Vault
      const result = await window.electronAPI.findImageInVault(vaultPath, imagePath)

      if (result.success && result.path) {
        const dataUrlResult = await window.electronAPI.readImageAsDataUrl(result.path)

        if (dataUrlResult.success && dataUrlResult.dataUrl) {
          setImageDataUrls(prev => ({ ...prev, [noteId]: dataUrlResult.dataUrl! }))
          setImagePaths(prev => ({ ...prev, [noteId]: imagePath }))
        }
      }
    } catch (error) {
      console.error('Fehler beim Laden des Bildes:', error)
    } finally {
      // Fertig geladen (egal ob erfolgreich oder nicht)
      loadingImagesRef.current.delete(noteId)
    }
  }, [vaultPath, imageDataUrls, imagePaths])

  // Notizen und PDFs zu Nodes konvertieren
  const initialNodes: Node[] = useMemo(() => {
    // Note-Nodes
    const noteNodes = notes.map((note, index) => {
      // Nutze gespeicherte Position oder generiere Position
      let position = positions[note.id]

      // Im Local Mode: Grid-Layout für bessere Übersicht
      if (!position && localRootNoteId) {
        const isRoot = note.id === localRootNoteId
        if (isRoot) {
          // Root-Note oben in der Mitte
          position = { x: 300, y: 50, pinned: false }
        } else {
          // Verbundene Notizen in Grid darunter
          const connectedIndex = index - (notes[0]?.id === localRootNoteId ? 1 : 0)
          const cols = Math.ceil(Math.sqrt(notes.length - 1)) || 1
          const row = Math.floor(connectedIndex / cols)
          const col = connectedIndex % cols
          const spacingX = 260
          const spacingY = 150
          position = {
            x: 50 + col * spacingX,
            y: 200 + row * spacingY,
            pinned: false
          }
        }
      } else if (!position) {
        const stablePos = getStablePosition(note.id, index)
        position = { ...stablePos, pinned: false }
      }
      const storedWidth = positions[note.id]?.width
      const storedHeight = positions[note.id]?.height

      // Callout für Kartenanzeige extrahieren
      const callout = extractCardCalloutSafe(note.content)

      // Tasks extrahieren
      const taskSummary = extractTasks(note.content)

      // Externe Links extrahieren (nur ersten anzeigen)
      const externalLinks = extractExternalLinks(note.content)
      const externalLink = externalLinks.length > 0 ? externalLinks[0] : null

      // Erstes Bild extrahieren
      const embeddedImage = extractFirstImage(note.content)

      // Bild laden falls vorhanden (loadImageDataUrl prüft Cache-Invalidierung)
      if (embeddedImage) {
        loadImageDataUrl(note.id, embeddedImage.fileName)
      }

      const hasImage = embeddedImage !== null && imageDataUrls[note.id] !== undefined
      const hasExternalLink = externalLink !== null
      const tagCount = note.tags.length
      const linkCount = note.outgoingLinks.filter(l => !/\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?)$/i.test(l)).length

      // Berechne die optimalen Dimensionen basierend auf Inhalt
      const dimensions = calculateNodeDimensions(
        note.title,
        callout,
        taskSummary,
        hasImage,
        hasExternalLink,
        tagCount,
        linkCount,
        canvasShowTags,
        canvasShowLinks,
        canvasShowSummaries,
        canvasCompactMode
      )

      // Calculate hidden connections for Local Mode
      let hiddenConnections = 0
      if (localRootNoteId) {
        const visibleNoteIds = new Set(notes.map(n => n.id))
        // Count outgoing links not visible
        for (const linkText of note.outgoingLinks) {
          const targetNote = allNotes.find(n =>
            n.title === linkText ||
            n.path === linkText ||
            n.path.endsWith(`/${linkText}.md`) ||
            n.path.endsWith(`/${linkText}`)
          )
          if (targetNote && !visibleNoteIds.has(targetNote.id)) {
            hiddenConnections++
          }
        }
        // Count incoming links not visible
        for (const backlinkId of note.incomingLinks) {
          if (!visibleNoteIds.has(backlinkId)) {
            hiddenConnections++
          }
        }
      }

      return {
        id: note.id,
        type: 'note',
        position,
        data: {
          title: note.title,
          note,
          color: positions[note.id]?.color,
          size: positions[note.id]?.size,
          isEditing: editingNodeId === note.id,
          onTitleChange: handleNodeTitleChange,
          onEditingDone: handleEditingDone,
          onTaskToggle: handleTaskToggle,
          onOpenExternalLink: handleOpenExternalLink,
          callout,
          taskSummary: taskSummary.total > 0 ? taskSummary : null,
          externalLink,
          embeddedImage,
          imageDataUrl: imageDataUrls[note.id] || null,
          // Display settings
          linkCount,
          showTags: canvasShowTags,
          showLinks: canvasShowLinks,
          showImages: canvasShowImages,
          showSummaries: canvasShowSummaries,
          compactMode: canvasCompactMode,
          // Local Canvas Mode
          isLocalRoot: localRootNoteId === note.id,
          isExpanded: expandedNoteIds.has(note.id),
          hiddenConnections,
          onExpand: onExpandNode
        },
        // Dimensionen: User-Werte haben Vorrang, sonst berechnete Werte
        style: {
          width: storedWidth || dimensions.width,
          height: Math.max(storedHeight || 0, dimensions.height),
          minHeight: dimensions.height
        }
      }
    })

    // PDF-Nodes
    const pdfNodes = pdfs.map((pdf, index) => {
      const pdfId = `pdf-${generateNoteId(pdf.path)}`
      const position = positions[pdfId] || getStablePosition(pdfId, notes.length + index)

      return {
        id: pdfId,
        type: 'pdf',
        position,
        data: {
          title: pdf.title,
          path: pdf.path,
          color: positions[pdfId]?.color
        },
        style: {
          width: 120,
          height: 80
        }
      }
    })

    // Label-Nodes (Überschriften ohne Datei) - gefiltert nach Ordner-Kontext
    const filteredLabels = labels.filter((label) => {
      // Labels ohne Kontext werden nur angezeigt, wenn kein Filter aktiv ist
      if (!label.folderContext) {
        return !canvasFilterPath
      }
      // Labels mit Kontext werden nur im passenden Ordner angezeigt
      return label.folderContext === canvasFilterPath
    })

    const labelNodes = filteredLabels.map((label) => ({
      id: label.id,
      type: 'label',
      position: { x: label.x, y: label.y },
      data: {
        text: label.text,
        color: label.color,
        fontSize: label.fontSize || 'medium',
        isEditing: editingNodeId === label.id,
        onTextChange: handleLabelTextChange,
        onEditingDone: handleEditingDone
      },
      style: {
        width: label.width || 200,
        height: label.height || 50
      }
    }))

    return [...noteNodes, ...pdfNodes, ...labelNodes]
  }, [notes, pdfs, positions, labels, getStablePosition, editingNodeId, handleNodeTitleChange, handleLabelTextChange, handleEditingDone, handleTaskToggle, handleOpenExternalLink, imageDataUrls, loadImageDataUrl, canvasShowTags, canvasShowLinks, canvasShowImages, canvasShowSummaries, canvasCompactMode, canvasDefaultCardWidth, canvasFilterPath, localRootNoteId, expandedNoteIds, onExpandNode, allNotes])
  
  // Links zu Edges konvertieren - bidirektionale Links zusammenführen
  const initialEdges: Edge[] = useMemo(() => {
    const edgeMap = new Map<string, Edge>()
    // Alle gerichteten Links sammeln für Bidirektional-Erkennung
    const directedLinks = new Set<string>()

    notes.forEach((note) => {
      note.outgoingLinks.forEach((linkText) => {
        const targetNote = resolveLink(linkText, notes)
        if (targetNote && targetNote.id !== note.id) {
          directedLinks.add(`${note.id}->${targetNote.id}`)
        }
      })
    })

    notes.forEach((note) => {
      note.outgoingLinks.forEach((linkText) => {
        const targetNote = resolveLink(linkText, notes)
        if (targetNote && targetNote.id !== note.id) {
          // Kanonischer Key (sortiert) um A→B und B→A als eine Kante zu behandeln
          const ids = [note.id, targetNote.id].sort()
          const canonicalKey = `${ids[0]}-${ids[1]}`

          if (!edgeMap.has(canonicalKey)) {
            const isBidirectional = directedLinks.has(`${targetNote.id}->${note.id}`)

            // Bei bidirektionalen Edges: source/target anhand der x-Position bestimmen
            // Der linke Node wird source (rechts raus), der rechte wird target (links rein)
            let edgeSource = note.id
            let edgeTarget = targetNote.id
            if (isBidirectional) {
              const posA = positions[note.id]
              const posB = positions[targetNote.id]
              if (posA && posB && posA.x > posB.x) {
                edgeSource = targetNote.id
                edgeTarget = note.id
              }
            }

            edgeMap.set(canonicalKey, {
              id: `link-${canonicalKey}`,
              source: edgeSource,
              target: edgeTarget,
              sourceHandle: 'source-right',
              targetHandle: 'target-left',
              type: 'default',
              animated: false,
              style: { stroke: 'var(--edge-color)', strokeWidth: isBidirectional ? 2 : 1.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--edge-color)', width: 12, height: 12 },
              ...(isBidirectional ? {
                markerStart: { type: MarkerType.ArrowClosed, color: 'var(--edge-color)', width: 12, height: 12 }
              } : {}),
              data: { isManual: false, isBidirectional }
            })
          }
        }
      })
    })
    
    // Manuelle Edges hinzufügen
    manualEdges.forEach((e) => {
      edgeMap.set(e.id, {
        ...e,
        sourceHandle: 'source-right',
        targetHandle: 'target-left',
        type: 'default',
        animated: true,
        style: {
          stroke: 'var(--edge-manual-color)',
          strokeWidth: 2,
          strokeDasharray: '5,5'
        },
        data: { isManual: true }
      })
    })
    
    return Array.from(edgeMap.values())
  }, [notes, manualEdges, positions])
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  
  // Referenz für vorherige Notizen-IDs
  const prevNoteIdsRef = useRef<string>('')
  
  // Einfache Hash-Funktion für Content-Vergleich
  const simpleHash = (str: string): number => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash
  }

  // Sync nodes wenn sich Notizen oder Labels ändern
  useEffect(() => {
    // Erzeuge einen Hash aus Note-IDs, Titeln UND Content-Hash (für Task-Änderungen)
    const notesHash = notes.map(n =>
      `${n.id}:${n.title}:${simpleHash(n.content || '')}`
    ).sort().join(',')

    // Labels auch im Hash berücksichtigen
    const labelsHash = labels.map(l =>
      `${l.id}:${l.text}:${l.color || ''}:${l.fontSize || ''}`
    ).sort().join(',')

    const currentHash = `notes:${notesHash}|labels:${labelsHash}`
    const prevHash = prevNoteIdsRef.current

    if (currentHash !== prevHash) {
      setNodes(initialNodes)
      prevNoteIdsRef.current = currentHash
    }
  }, [notes, labels, initialNodes, setNodes])

  // Update Node-Positionen und Farben aus dem Store
  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const storedPos = positions[node.id]
        if (!storedPos) return node

        return {
          ...node,
          position: { x: storedPos.x, y: storedPos.y },
          data: {
            ...node.data,
            color: storedPos.color,
            size: storedPos.size
          }
        }
      })
    )
  }, [positions, setNodes])
  
  // Sync edges when initialEdges change
  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

  // Auto fit view when in Local Mode
  useEffect(() => {
    if (localRootNoteId && notes.length > 0) {
      // Delay to allow nodes to be rendered
      const timer = setTimeout(() => {
        fitView({ padding: 0.3, maxZoom: 1.2, duration: 300 })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [localRootNoteId, notes.length, fitView])

  // Update isEditing state in nodes when editingNodeId changes
  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isEditing: editingNodeId === node.id,
          onTitleChange: handleNodeTitleChange,
          onEditingDone: handleEditingDone,
          onTaskToggle: handleTaskToggle
        }
      }))
    )
  }, [editingNodeId, setNodes, handleNodeTitleChange, handleEditingDone, handleTaskToggle])

  // Update display settings and dimensions in nodes when they change
  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        // Nur Note-Nodes haben diese Eigenschaften
        if (node.type !== 'note' || !node.data.note) {
          return {
            ...node,
            data: {
              ...node.data,
              showTags: canvasShowTags,
              showLinks: canvasShowLinks,
              showImages: canvasShowImages,
              showSummaries: canvasShowSummaries,
              compactMode: canvasCompactMode,
              imageDataUrl: imageDataUrls[node.id] || node.data.imageDataUrl
            }
          }
        }

        const note = node.data.note
        const hasImage = node.data.embeddedImage && (imageDataUrls[node.id] || node.data.imageDataUrl)
        const hasExternalLink = !!node.data.externalLink

        // Dimensionen neu berechnen
        const dimensions = calculateNodeDimensions(
          note.title,
          node.data.callout,
          node.data.taskSummary,
          hasImage,
          hasExternalLink,
          note.tags?.length || 0,
          (note.outgoingLinks?.length || 0) + (note.incomingLinks?.length || 0),
          canvasShowTags,
          canvasShowLinks,
          canvasShowSummaries,
          canvasCompactMode
        )

        return {
          ...node,
          data: {
            ...node.data,
              showTags: canvasShowTags,
              showLinks: canvasShowLinks,
              showImages: canvasShowImages,
              showSummaries: canvasShowSummaries,
              compactMode: canvasCompactMode,
            imageDataUrl: imageDataUrls[node.id] || node.data.imageDataUrl
          },
          style: {
            ...node.style,
            width: dimensions.width,
            height: dimensions.height,
            minHeight: dimensions.height
          }
        }
      })
    )
  }, [canvasShowTags, canvasShowLinks, canvasShowImages, canvasShowSummaries, canvasCompactMode, canvasDefaultCardWidth, imageDataUrls, setNodes])

  // Update imageDataUrl in nodes when images are loaded
  useEffect(() => {
    if (Object.keys(imageDataUrls).length === 0) return

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const imageDataUrl = imageDataUrls[node.id]
        if (imageDataUrl && node.data.imageDataUrl !== imageDataUrl) {
          return {
            ...node,
            data: {
              ...node.data,
              imageDataUrl
            }
          }
        }
        return node
      })
    )
  }, [imageDataUrls, setNodes])

  // Ref um aktuelle Drag-Positionen zu tracken
  const dragPositionsRef = useRef<Record<string, { x: number; y: number }>>({})

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)

    changes.forEach((change) => {
      const isLabel = change.id.startsWith('label-')

      if (change.type === 'position') {
        const pos = change.position || (change as any).positionAbsolute

        if (change.dragging && pos) {
          // Während des Drags: Position merken
          dragPositionsRef.current[change.id] = { x: pos.x, y: pos.y }
        } else if (!change.dragging) {
          // Drag beendet: gespeicherte oder aktuelle Position verwenden
          const finalPos = pos || dragPositionsRef.current[change.id]
          if (finalPos) {
            if (isLabel) {
              updateLabel(change.id, { x: finalPos.x, y: finalPos.y })
            } else {
              setNodePosition(change.id, finalPos.x, finalPos.y)
            }
            delete dragPositionsRef.current[change.id]
          }
        }
      }
      // Handle resize from NodeResizer
      if (change.type === 'dimensions') {
        const dims = (change as any).dimensions
        if (dims?.width && dims?.height) {
          if (isLabel) {
            updateLabel(change.id, { width: dims.width, height: dims.height })
          } else {
            setNodeDimensions(change.id, dims.width, dims.height)
          }
        }
      }
    })
  }, [onNodesChange, setNodePosition, setNodeDimensions, updateLabel])
  
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes)
  }, [onEdgesChange])
  
  // Neue Verbindung erstellen - liest aktuellen Datei-Content
  const handleConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return
    if (connection.source === connection.target) return
    
    const sourceNote = notes.find(n => n.id === connection.source)
    const targetNote = notes.find(n => n.id === connection.target)
    
    console.log('handleConnect:', { sourceNote: sourceNote?.title, targetNote: targetNote?.title, vaultPath })
    
    if (!sourceNote || !targetNote || !vaultPath) {
      console.error('Missing data:', { sourceNote: !!sourceNote, targetNote: !!targetNote, vaultPath: !!vaultPath })
      return
    }
    
    // Prüfen ob Verbindung bereits existiert
    const existingLink = sourceNote.outgoingLinks.some(link => {
      const resolved = resolveLink(link, notes)
      return resolved?.id === targetNote.id
    })
    
    if (existingLink) {
      console.log('Link already exists')
      return
    }
    
    try {
      // WICHTIG: Aktuellen Datei-Content lesen (nicht aus Store!)
      const fullPath = `${vaultPath}/${sourceNote.path}`
      const currentContent = await window.electronAPI.readFile(fullPath)

      // Wikilink zur Notiz hinzufügen
      const newContent = currentContent.trimEnd() + `\n\n[[${targetNote.title}]]`
      await window.electronAPI.writeFile(fullPath, newContent)

      // Store aktualisieren mit neuem Content und Links
      updateNote(sourceNote.id, {
        content: newContent,
        outgoingLinks: extractLinks(newContent),
        modifiedAt: new Date()
      })

      // Bidirektional: Auch Rücklink in Target-Datei einfügen
      const reverseExists = targetNote.outgoingLinks.some(link => {
        const resolved = resolveLink(link, notes)
        return resolved?.id === sourceNote.id
      })
      if (!reverseExists) {
        const targetFullPath = `${vaultPath}/${targetNote.path}`
        const targetContent = await window.electronAPI.readFile(targetFullPath)
        const newTargetContent = targetContent.trimEnd() + `\n\n[[${sourceNote.title}]]`
        await window.electronAPI.writeFile(targetFullPath, newTargetContent)
        updateNote(targetNote.id, {
          content: newTargetContent,
          outgoingLinks: extractLinks(newTargetContent),
          modifiedAt: new Date()
        })
      }
    } catch (error) {
      console.error('Fehler beim Erstellen der Verbindung:', error)
    }
  }, [notes, vaultPath, updateNote])

  // Verbindung ins Leere gezogen - neue Notiz erstellen
  const connectingNodeId = useRef<string | null>(null)

  const onConnectStart = useCallback((_: any, { nodeId }: { nodeId: string | null }) => {
    connectingNodeId.current = nodeId
  }, [])

  const onConnectEnd: OnConnectEnd = useCallback((event) => {
    if (!connectingNodeId.current || !vaultPath) return

    // Prüfen ob auf einer Node gelandet (closest ist robuster als classList.contains)
    const target = event.target as HTMLElement
    const targetIsPane = target.classList.contains('react-flow__pane') ||
      (target.closest('.react-flow') !== null && !target.closest('.react-flow__node'))

    if (targetIsPane && event instanceof MouseEvent) {
      // Ins Leere gezogen - Dialog öffnen
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      setNewNoteDialog({
        x: event.clientX,
        y: event.clientY,
        flowPosition,
        sourceNodeId: connectingNodeId.current
      })
      setNewNoteName('')
    }

    connectingNodeId.current = null
  }, [vaultPath, screenToFlowPosition])

  // Neue Notiz aus Dialog erstellen
  const handleCreateNoteFromDialog = useCallback(async () => {
    if (!newNoteDialog || !newNoteName.trim() || !vaultPath) return

    const noteName = newNoteName.trim()
    const fileName = `${noteName}.md`
    // Notiz im aktuell gefilterten Ordner erstellen (wenn Filter aktiv)
    const relativePath = canvasFilterPath && canvasFilterPath !== '__root__'
      ? `${canvasFilterPath}/${fileName}`
      : fileName
    const filePath = `${vaultPath}/${relativePath}`

    try {
      // Prüfen ob Datei bereits existiert
      const existingNote = notes.find(n => n.title.toLowerCase() === noteName.toLowerCase())
      if (existingNote) {
        alert(`Eine Notiz mit dem Namen "${noteName}" existiert bereits.`)
        return
      }

      // Markdown-Inhalt zusammenbauen
      let initialContent = `# ${noteName}\n\n`

      // Tags als Frontmatter hinzufügen wenn vorhanden
      const tags = newNoteTags.trim()
        .split(/[,\s]+/)
        .map(t => t.replace(/^#/, '').trim())
        .filter(t => t.length > 0)

      if (tags.length > 0) {
        initialContent = `---\ntags:\n${tags.map(t => `  - ${t}`).join('\n')}\n---\n\n# ${noteName}\n\n`
      }

      // Textinhalt als Callout hinzufügen (damit er auf der Karte sichtbar ist)
      if (newNoteContent.trim()) {
        const calloutLines = newNoteContent.trim().split('\n').map(line => `> ${line}`).join('\n')
        initialContent += `> [!summary] Zusammenfassung\n${calloutLines}\n\n`
      }

      // Bild hinzufügen (vor allen anderen Inhalten, damit es oben erscheint)
      if (newNoteImage) {
        try {
          // Bild als Base64 lesen und in Attachments speichern
          const reader = new FileReader()
          const base64Promise = new Promise<string>((resolve) => {
            reader.onload = () => {
              const base64 = (reader.result as string).split(',')[1]
              resolve(base64)
            }
            reader.readAsDataURL(newNoteImage)
          })
          const base64Data = await base64Promise
          const imageResult = await window.electronAPI.writeImageFromBase64(
            vaultPath,
            base64Data,
            newNoteImage.name
          )
          if (imageResult.success && imageResult.fileName) {
            initialContent += `![[${imageResult.fileName}]]\n\n`
          }
        } catch (error) {
          console.error('Fehler beim Speichern des Bildes:', error)
        }
      }

      // Externen Link hinzufügen
      if (newNoteLink.trim()) {
        const link = newNoteLink.trim()
        // Link-Format: [Linktext](URL) oder nur URL
        if (link.startsWith('http://') || link.startsWith('https://')) {
          initialContent += `🔗 [${t('graphCanvas.openLink')}](${link})\n\n`
        } else {
          initialContent += `🔗 [${t('graphCanvas.openLink')}](https://${link})\n\n`
        }
      }

      // Todos hinzufügen
      if (newNoteTodos.trim()) {
        const todoLines = newNoteTodos.trim().split('\n')
        const formattedTodos = todoLines
          .map(line => {
            const trimmed = line.trim()
            if (!trimmed) return ''
            // Wenn bereits mit - [ ] oder - [x] beginnt, beibehalten
            if (/^[-*]\s*\[[ x]\]/.test(trimmed)) return trimmed
            // Sonst als offener Todo formatieren
            return `- [ ] ${trimmed}`
          })
          .filter(line => line.length > 0)
          .join('\n')

        if (formattedTodos) {
          initialContent += '## Aufgaben\n\n' + formattedTodos + '\n'
        }
      }

      // Sicherstellen, dass der Ordner existiert
      if (canvasFilterPath && canvasFilterPath !== '__root__') {
        await window.electronAPI.createDirectory(`${vaultPath}/${canvasFilterPath}`)
      }

      await window.electronAPI.writeFile(filePath, initialContent)

      // Notiz zum Store hinzufügen
      const note = await createNoteFromFile(filePath, relativePath, initialContent)
      addNote(note)

      // Position für neue Node setzen
      setNodePosition(note.id, newNoteDialog.flowPosition.x, newNoteDialog.flowPosition.y)

      // Bidirektionale Wikilinks: Source → neue Note und neue Note → Source
      const sourceNote = notes.find(n => n.id === newNoteDialog.sourceNodeId)
      if (sourceNote) {
        // Wikilink von Source zur neuen Note
        const sourceFullPath = `${vaultPath}/${sourceNote.path}`
        const currentContent = await window.electronAPI.readFile(sourceFullPath)
        const newContent = currentContent.trimEnd() + `\n\n[[${noteName}]]`
        await window.electronAPI.writeFile(sourceFullPath, newContent)

        updateNote(sourceNote.id, {
          content: newContent,
          outgoingLinks: extractLinks(newContent),
          modifiedAt: new Date()
        })

        // Rücklink von neuer Note zur Source-Note
        const updatedNoteContent = initialContent.trimEnd() + `\n\n[[${sourceNote.title}]]`
        await window.electronAPI.writeFile(filePath, updatedNoteContent)
        updateNote(note.id, {
          content: updatedNoteContent,
          outgoingLinks: extractLinks(updatedNoteContent),
          modifiedAt: new Date()
        })
      }

      // Dateibaum aktualisieren
      const tree = await window.electronAPI.readDirectory(vaultPath)
      setFileTree(tree)

      // Dialog schließen und Felder zurücksetzen
      setNewNoteDialog(null)
      setNewNoteName('')
      setNewNoteContent('')
      setNewNoteTags('')
      setNewNoteTodos('')
      setNewNoteLink('')
      setNewNoteImage(null)
      setNewNoteImagePreview(null)

    } catch (error) {
      console.error('Fehler beim Erstellen der Notiz:', error)
    }
  }, [newNoteDialog, newNoteName, newNoteContent, newNoteTags, newNoteTodos, newNoteLink, newNoteImage, vaultPath, notes, addNote, updateNote, setNodePosition, setFileTree, canvasFilterPath])

  const handleNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    // Bei Label-Nodes: In Bearbeitungsmodus wechseln
    if (node.type === 'label') {
      setEditingNodeId(node.id)
    // Bei PDF-Nodes: PDF öffnen
    } else if (node.type === 'pdf') {
      selectPdf(node.data.path)
    } else {
      selectNote(node.id)
      // Wechsel zur Split-Ansicht um die Notiz im Editor zu öffnen
      setViewMode('split')
    }
  }, [selectNote, selectPdf, setViewMode])
  
  // Rechtsklick auf Node (inkl. Labels)
  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    const isLabel = node.id.startsWith('label-')
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: isLabel ? 'label' : 'node',
      id: node.id
    })
  }, [])
  
  // Rechtsklick auf Edge
  const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: 'edge',
      id: edge.id
    })
  }, [])

  // Rechtsklick auf leere Canvas-Fläche
  const handlePaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    setPaneContextMenu({
      x: event.clientX,
      y: event.clientY,
      flowPosition
    })
  }, [screenToFlowPosition])

  // Überschrift (Label) auf Canvas erstellen
  const handleCreateLabel = useCallback((x: number, y: number) => {
    const labelId = addLabel({
      text: t('graphCanvas.newHeading'),
      x,
      y,
      width: 200,
      height: 50,
      fontSize: 'medium',
      folderContext: canvasFilterPath || null  // Ordner-Kontext für gefilterte Ansichten
    })
    // Direkt in Bearbeitungsmodus
    setTimeout(() => setEditingNodeId(labelId), 100)
    setPaneContextMenu(null)
  }, [addLabel, canvasFilterPath, t])

  // Löschen Handler
  const handleDelete = useCallback(async () => {
    if (!contextMenu) return

    // Labels können ohne vaultPath gelöscht werden
    if (contextMenu.type === 'label') {
      removeLabel(contextMenu.id)
      setContextMenu(null)
      return
    }

    if (!vaultPath) return

    if (contextMenu.type === 'node') {
      // Notiz löschen
      const noteToDelete = notes.find(n => n.id === contextMenu.id)
      if (!noteToDelete) return
      
      const fullPath = `${vaultPath}/${noteToDelete.path}`
      
      try {
        const deleted = await window.electronAPI.deleteFile(fullPath)
        if (deleted) {
          // Aus Store entfernen
          removeNote(contextMenu.id)
          
          // Dateibaum neu laden
          const tree = await window.electronAPI.readDirectory(vaultPath)
          setFileTree(tree)
        }
      } catch (error) {
        console.error('Fehler beim Löschen der Notiz:', error)
      }
    } else if (contextMenu.type === 'edge') {
      const edge = edges.find(e => e.id === contextMenu.id)
      if (edge?.data?.isManual) {
        // Manuelle Edge aus Store löschen
        removeManualEdge(contextMenu.id)
      } else if (edge) {
        // Link aus Notiz entfernen
        const sourceNote = notes.find(n => n.id === edge.source)
        const targetNote = notes.find(n => n.id === edge.target)
        
        if (sourceNote && targetNote) {
          try {
            // WICHTIG: Aktuellen Datei-Content lesen
            const fullPath = `${vaultPath}/${sourceNote.path}`
            const currentContent = await window.electronAPI.readFile(fullPath)
            
            // Alle Varianten des Links entfernen
            const linkPatterns = [
              `[[${targetNote.title}]]`,
              `[[${targetNote.path.replace('.md', '')}]]`
            ]
            
            let newContent = currentContent
            linkPatterns.forEach(pattern => {
              newContent = newContent.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
            })
            
            // Leere Zeilen aufräumen
            newContent = newContent.replace(/\n{3,}/g, '\n\n').trim()
            
            await window.electronAPI.writeFile(fullPath, newContent)
            
            updateNote(sourceNote.id, {
              content: newContent,
              outgoingLinks: extractLinks(newContent),
              modifiedAt: new Date()
            })
          } catch (error) {
            console.error('Fehler beim Löschen der Verbindung:', error)
          }
        }
      }
    }
    
    setContextMenu(null)
  }, [contextMenu, edges, notes, vaultPath, updateNote, removeManualEdge, removeNote, removeLabel, setFileTree])
  
  const handleMoveEnd = useCallback((_event: unknown, newViewport: { x: number; y: number; zoom: number }) => {
    setViewport(newViewport)
  }, [setViewport])
  
  // Delete-Taste für ausgewählte Edges
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedEdges = edges.filter(edge => edge.selected)
        for (const edge of selectedEdges) {
          if (edge.data?.isManual) {
            removeManualEdge(edge.id)
          }
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [edges, removeManualEdge])
  
  // Fit view on first load
  useEffect(() => {
    if (notes.length > 0 && Object.keys(positions).length === 0) {
      setTimeout(() => fitView({ padding: 0.2 }), 100)
    }
  }, [notes.length, positions, fitView])

  // Ausgewählte Nodes zählen
  const selectedNodes = useMemo(() => nodes.filter(n => n.selected), [nodes])
  const selectedCount = selectedNodes.length

  // Alignment Handler
  const handleAlign = useCallback((type: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV') => {
    if (selectedNodes.length < 2) return

    const nodeWidths = selectedNodes.map(n => (n.style?.width as number) || 140)
    const nodeHeights = selectedNodes.map(n => (n.style?.height as number) || 70)

    let targetValue: number

    switch (type) {
      case 'left':
        targetValue = Math.min(...selectedNodes.map(n => n.position.x))
        selectedNodes.forEach(n => setNodePosition(n.id, targetValue, n.position.y))
        break
      case 'right':
        targetValue = Math.max(...selectedNodes.map((n, i) => n.position.x + nodeWidths[i]))
        selectedNodes.forEach((n, i) => setNodePosition(n.id, targetValue - nodeWidths[i], n.position.y))
        break
      case 'top':
        targetValue = Math.min(...selectedNodes.map(n => n.position.y))
        selectedNodes.forEach(n => setNodePosition(n.id, n.position.x, targetValue))
        break
      case 'bottom':
        targetValue = Math.max(...selectedNodes.map((n, i) => n.position.y + nodeHeights[i]))
        selectedNodes.forEach((n, i) => setNodePosition(n.id, n.position.x, targetValue - nodeHeights[i]))
        break
      case 'centerH':
        const minX = Math.min(...selectedNodes.map(n => n.position.x))
        const maxX = Math.max(...selectedNodes.map((n, i) => n.position.x + nodeWidths[i]))
        const centerX = (minX + maxX) / 2
        selectedNodes.forEach((n, i) => setNodePosition(n.id, centerX - nodeWidths[i] / 2, n.position.y))
        break
      case 'centerV':
        const minY = Math.min(...selectedNodes.map(n => n.position.y))
        const maxY = Math.max(...selectedNodes.map((n, i) => n.position.y + nodeHeights[i]))
        const centerY = (minY + maxY) / 2
        selectedNodes.forEach((n, i) => setNodePosition(n.id, n.position.x, centerY - nodeHeights[i] / 2))
        break
    }
  }, [selectedNodes, setNodePosition])

  // Distribute Handler
  const handleDistribute = useCallback((type: 'horizontal' | 'vertical') => {
    if (selectedNodes.length < 3) return

    const sortedNodes = [...selectedNodes].sort((a, b) =>
      type === 'horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y
    )

    const nodeWidths = sortedNodes.map(n => (n.style?.width as number) || 140)
    const nodeHeights = sortedNodes.map(n => (n.style?.height as number) || 70)

    if (type === 'horizontal') {
      const firstX = sortedNodes[0].position.x
      const lastX = sortedNodes[sortedNodes.length - 1].position.x + nodeWidths[nodeWidths.length - 1]
      const totalWidth = nodeWidths.reduce((a, b) => a + b, 0)
      const gap = (lastX - firstX - totalWidth) / (sortedNodes.length - 1)

      let currentX = firstX
      sortedNodes.forEach((n, i) => {
        setNodePosition(n.id, currentX, n.position.y)
        currentX += nodeWidths[i] + gap
      })
    } else {
      const firstY = sortedNodes[0].position.y
      const lastY = sortedNodes[sortedNodes.length - 1].position.y + nodeHeights[nodeHeights.length - 1]
      const totalHeight = nodeHeights.reduce((a, b) => a + b, 0)
      const gap = (lastY - firstY - totalHeight) / (sortedNodes.length - 1)

      let currentY = firstY
      sortedNodes.forEach((n, i) => {
        setNodePosition(n.id, n.position.x, currentY)
        currentY += nodeHeights[i] + gap
      })
    }
  }, [selectedNodes, setNodePosition])

  // Auto Grid Handler
  const handleAutoGrid = useCallback(() => {
    // Labels von Layouts ausschließen - sie bleiben als feste Überschriften
    const nodesToArrange = (focusMode ? nodes.filter(n => focusedNodeIds.has(n.id)) : nodes).filter(n => n.type !== 'label')
    if (nodesToArrange.length === 0) return

    const cols = Math.ceil(Math.sqrt(nodesToArrange.length))
    const rows = Math.ceil(nodesToArrange.length / cols)
    const defaultWidth = 220
    const defaultHeight = 180
    const gap = 30
    const startX = 100
    const startY = 100

    // Get actual dimensions for each node
    const nodeSizes = nodesToArrange.map(n => ({
      width: (n.style?.width as number) || (positions[n.id]?.width) || defaultWidth,
      height: (n.style?.height as number) || (positions[n.id]?.height) || defaultHeight
    }))

    // Calculate maximum width for each column
    const colWidths: number[] = Array(cols).fill(0)
    nodesToArrange.forEach((_, i) => {
      const col = i % cols
      colWidths[col] = Math.max(colWidths[col], nodeSizes[i].width)
    })

    // Calculate maximum height for each row
    const rowHeights: number[] = Array(rows).fill(0)
    nodesToArrange.forEach((_, i) => {
      const row = Math.floor(i / cols)
      rowHeights[row] = Math.max(rowHeights[row], nodeSizes[i].height)
    })

    // Calculate cumulative positions (x starts of each column, y starts of each row)
    const colX: number[] = [startX]
    for (let c = 1; c < cols; c++) {
      colX[c] = colX[c - 1] + colWidths[c - 1] + gap
    }
    const rowY: number[] = [startY]
    for (let r = 1; r < rows; r++) {
      rowY[r] = rowY[r - 1] + rowHeights[r - 1] + gap
    }

    // Position each node
    nodesToArrange.forEach((n, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      setNodePosition(n.id, colX[col], rowY[row])
    })

    // Nach dem Anordnen fitView aufrufen
    setTimeout(() => fitView({ padding: 0.3 }), 100)
  }, [nodes, positions, setNodePosition, fitView, focusMode, focusedNodeIds])

  // Layout Algorithm Handler
  const handleLayout = useCallback((algorithm: LayoutAlgorithm) => {
    // Labels von Layouts ausschließen - sie bleiben als feste Überschriften
    const nodesToArrange = (focusMode ? nodes.filter(n => focusedNodeIds.has(n.id)) : nodes).filter(n => n.type !== 'label')

    if (nodesToArrange.length === 0) return

    // Convert React Flow nodes to layout nodes
    const layoutNodes: LayoutNode[] = nodesToArrange.map(node => {
      const position = positions[node.id]
      const noteData = notes.find(n => n.id === node.id)
      // Use larger default sizes to prevent overlaps
      // Actual card sizes are typically 200-280px wide and 100-180px tall
      return {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: position?.width || 240,
        height: position?.height || 140,
        pinned: position?.pinned || false,
        linkCount: noteData?.outgoingLinks.filter(l => !/\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?)$/i.test(l)).length || 0,
        tags: noteData?.tags || [],
        folder: noteData?.path.split('/').slice(0, -1).join('/') || ''
      }
    })

    // Convert edges to layout edges (only for nodes being arranged)
    const nodeIds = new Set(nodesToArrange.map(n => n.id))
    const layoutEdges: LayoutEdge[] = []

    notes.forEach(note => {
      if (!nodeIds.has(note.id)) return

      note.outgoingLinks.forEach(linkText => {
        const targetNote = resolveLink(linkText, notes)
        if (targetNote && nodeIds.has(targetNote.id) && targetNote.id !== note.id) {
          layoutEdges.push({
            source: note.id,
            target: targetNote.id
          })
        }
      })
    })

    // Also include manual edges
    manualEdges.forEach(edge => {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        layoutEdges.push({
          source: edge.source,
          target: edge.target
        })
      }
    })

    // Calculate canvas dimensions
    const canvasWidth = 1600
    const canvasHeight = 1000

    // Apply the selected layout algorithm
    const result = applyLayout(algorithm, layoutNodes, layoutEdges, {
      width: canvasWidth,
      height: canvasHeight,
      padding: 80,
      nodeSpacing: 60,
      iterations: 300
    })

    // Update node positions
    Object.entries(result.positions).forEach(([nodeId, pos]) => {
      setNodePosition(nodeId, pos.x, pos.y)
    })

    // Fit view after layout
    setTimeout(() => fitView({ padding: 0.3 }), 100)
  }, [nodes, notes, positions, manualEdges, setNodePosition, fitView, focusMode, focusedNodeIds])

  // Cluster by Color Handler - gruppiert Karten nach Farbe
  const handleClusterByColor = useCallback(() => {
    // Labels von Layouts ausschließen - sie bleiben als feste Überschriften
    const nodesToArrange = (focusMode ? nodes.filter(n => focusedNodeIds.has(n.id)) : nodes).filter(n => n.type !== 'label')

    if (nodesToArrange.length === 0) return

    // Group nodes by color
    const colorGroups = new Map<string, typeof nodesToArrange>()
    const defaultColor = '__default__'

    // Define color order for consistent clustering
    const colorOrder = [
      '#ffcdd2', // Rot
      '#ffe0b2', // Orange
      '#fff9c4', // Gelb
      '#c8e6c9', // Grün
      '#bbdefb', // Blau
      '#e1bee7', // Lila
      '#f8bbd9', // Pink
      '#cfd8dc', // Grau
      defaultColor // Ohne Farbe zuletzt
    ]

    nodesToArrange.forEach(node => {
      const nodeColor = positions[node.id]?.color || defaultColor
      if (!colorGroups.has(nodeColor)) {
        colorGroups.set(nodeColor, [])
      }
      colorGroups.get(nodeColor)!.push(node)
    })

    // Sort groups by color order
    const sortedColors = [...colorGroups.keys()].sort((a, b) => {
      const indexA = colorOrder.indexOf(a)
      const indexB = colorOrder.indexOf(b)
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
    })

    // Layout parameters
    const nodeWidth = 240
    const nodeHeight = 140
    const horizontalGap = 80 // Gap between color columns
    const verticalGap = 40 // Gap between nodes in same column
    const columnHeaderHeight = 30 // Space for optional color label

    let currentX = 0

    sortedColors.forEach(color => {
      const groupNodes = colorGroups.get(color) || []
      if (groupNodes.length === 0) return

      // Sort nodes within group alphabetically by title
      groupNodes.sort((a, b) => {
        const noteA = notes.find(n => n.id === a.id)
        const noteB = notes.find(n => n.id === b.id)
        return (noteA?.title || '').localeCompare(noteB?.title || '', 'de')
      })

      // Position nodes vertically in this column
      let currentY = columnHeaderHeight

      groupNodes.forEach(node => {
        const pos = positions[node.id]
        const width = pos?.width || nodeWidth
        const height = pos?.height || nodeHeight

        setNodePosition(node.id, currentX, currentY)

        currentY += height + verticalGap
      })

      // Move to next column
      // Use max width of nodes in this column for proper spacing
      const maxWidth = Math.max(...groupNodes.map(n => positions[n.id]?.width || nodeWidth))
      currentX += maxWidth + horizontalGap
    })

    // Fit view after clustering
    setTimeout(() => fitView({ padding: 0.3 }), 100)
  }, [nodes, notes, positions, setNodePosition, fitView, focusMode, focusedNodeIds])

  // Cluster by Tag Handler - gruppiert Karten nach erstem Tag
  const handleClusterByTag = useCallback(() => {
    // Labels von Layouts ausschließen - sie bleiben als feste Überschriften
    const nodesToArrange = (focusMode ? nodes.filter(n => focusedNodeIds.has(n.id)) : nodes).filter(n => n.type !== 'label')

    if (nodesToArrange.length === 0) return

    // Group nodes by their first tag
    const tagGroups = new Map<string, typeof nodesToArrange>()
    const noTagKey = '__no_tag__'

    nodesToArrange.forEach(node => {
      const noteData = notes.find(n => n.id === node.id)
      const firstTag = noteData?.tags[0] || noTagKey
      if (!tagGroups.has(firstTag)) {
        tagGroups.set(firstTag, [])
      }
      tagGroups.get(firstTag)!.push(node)
    })

    // Sort tags alphabetically, but put "no tag" at the end
    const sortedTags = [...tagGroups.keys()].sort((a, b) => {
      if (a === noTagKey) return 1
      if (b === noTagKey) return -1
      return a.localeCompare(b, 'de')
    })

    // Layout parameters
    const nodeWidth = 240
    const nodeHeight = 140
    const horizontalGap = 80
    const verticalGap = 40
    const columnHeaderHeight = 30

    let currentX = 0

    sortedTags.forEach(tag => {
      const groupNodes = tagGroups.get(tag) || []
      if (groupNodes.length === 0) return

      // Sort nodes within group alphabetically by title
      groupNodes.sort((a, b) => {
        const noteA = notes.find(n => n.id === a.id)
        const noteB = notes.find(n => n.id === b.id)
        return (noteA?.title || '').localeCompare(noteB?.title || '', 'de')
      })

      // Position nodes vertically in this column
      let currentY = columnHeaderHeight

      groupNodes.forEach(node => {
        const pos = positions[node.id]
        const height = pos?.height || nodeHeight

        setNodePosition(node.id, currentX, currentY)

        currentY += height + verticalGap
      })

      // Move to next column
      const maxWidth = Math.max(...groupNodes.map(n => positions[n.id]?.width || nodeWidth))
      currentX += maxWidth + horizontalGap
    })

    // Fit view after clustering
    setTimeout(() => fitView({ padding: 0.3 }), 100)
  }, [nodes, notes, positions, setNodePosition, fitView, focusMode, focusedNodeIds])

  const handleApplyLayoutPreset = useCallback((preset: 'hierarchical' | 'grid' | 'colorCluster' | 'tagCluster') => {
    setActiveLayoutPreset(preset)

    if (preset === 'hierarchical') {
      handleLayout('hierarchical')
      return
    }
    if (preset === 'grid') {
      handleAutoGrid()
      return
    }
    if (preset === 'colorCluster') {
      handleClusterByColor()
      return
    }
    handleClusterByTag()
  }, [handleLayout, handleAutoGrid, handleClusterByColor, handleClusterByTag])

  // Focus Mode Handler - ausgewählte Karten fokussieren
  const handleEnterFocusMode = useCallback(() => {
    if (selectedNodes.length === 0) return
    const ids = new Set(selectedNodes.map(n => n.id))
    setFocusedNodeIds(ids)
    setFocusMode(true)
    // Nach dem Fokussieren fitView aufrufen
    setTimeout(() => fitView({ padding: 0.3 }), 100)
  }, [selectedNodes, fitView])

  // Focus Mode beenden
  const handleExitFocusMode = useCallback(() => {
    setFocusMode(false)
    setFocusedNodeIds(new Set())
    setTimeout(() => fitView({ padding: 0.3 }), 100)
  }, [fitView])

  // Karte zum Focus hinzufügen (im Focus Mode)
  const handleAddToFocus = useCallback(() => {
    if (!focusMode || selectedNodes.length === 0) return
    setFocusedNodeIds(prev => {
      const newSet = new Set(prev)
      selectedNodes.forEach(n => newSet.add(n.id))
      return newSet
    })
  }, [focusMode, selectedNodes])

  // Karte aus Focus entfernen
  const handleRemoveFromFocus = useCallback(() => {
    if (!focusMode || selectedNodes.length === 0) return
    setFocusedNodeIds(prev => {
      const newSet = new Set(prev)
      selectedNodes.forEach(n => newSet.delete(n.id))
      // Wenn keine Karten mehr im Focus, Focus Mode beenden
      if (newSet.size === 0) {
        setFocusMode(false)
        return new Set()
      }
      return newSet
    })
  }, [focusMode, selectedNodes])

  // Escape-Taste beendet Fokus-Modus
  useEffect(() => {
    if (!focusMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleExitFocusMode()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusMode, handleExitFocusMode])

  // Neue Karte/Notiz erstellen - öffnet den erweiterten Dialog
  const handleAddNewNote = useCallback(() => {
    if (!vaultPath) return

    // Position in der Mitte des sichtbaren Bereichs berechnen
    const centerX = (-viewport.x + 400) / viewport.zoom
    const centerY = (-viewport.y + 300) / viewport.zoom

    // Dialog öffnen (wie beim Ziehen einer Verbindung, aber ohne sourceNodeId)
    setNewNoteDialog({
      x: window.innerWidth / 2 - 200,
      y: window.innerHeight / 2 - 200,
      flowPosition: { x: centerX, y: centerY },
      sourceNodeId: undefined
    })
  }, [vaultPath, viewport])

  // Focus Mode: Gefilterte Nodes und Edges
  const displayNodes = useMemo(() => {
    if (!focusMode) return nodes
    return nodes.filter(n => focusedNodeIds.has(n.id))
  }, [nodes, focusMode, focusedNodeIds])

  const displayEdges = useMemo(() => {
    if (!focusMode) return edges
    // Im Focus Mode: nur Edges zwischen fokussierten Nodes anzeigen
    return edges.filter(e => focusedNodeIds.has(e.source) && focusedNodeIds.has(e.target))
  }, [edges, focusMode, focusedNodeIds])

  if (allNotes.length === 0) {
    return (
      <div className="canvas-empty">
        <p>{t('graphCanvas.noNotesLoaded')}</p>
        <p className="hint">{t('graphCanvas.openVaultHint')}</p>
      </div>
    )
  }

  return (
    <div className="graph-canvas">
      {/* Filter-Toolbar */}
      <div className="canvas-filter-bar">
        {/* Neue Karte Button */}
        <button
          className="add-note-btn"
          onClick={handleAddNewNote}
          title={t('graphCanvas.addCard')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <div className="canvas-filter-divider" />

        {/* Display Toggles */}
        <div className="canvas-display-toggles">
          <button
            className={`display-toggle-btn ${canvasShowTags ? 'active' : ''}`}
            onClick={() => setCanvasShowTags(!canvasShowTags)}
            title={canvasShowTags ? t('graphCanvas.hideTags') : t('graphCanvas.showTags')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 3h5l7 7-5 5-7-7V3z" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="5" cy="6" r="1" fill="currentColor"/>
            </svg>
          </button>
          <button
            className={`display-toggle-btn ${canvasShowLinks ? 'active' : ''}`}
            onClick={() => setCanvasShowLinks(!canvasShowLinks)}
            title={canvasShowLinks ? t('graphCanvas.hideLinkCount') : t('graphCanvas.showLinkCount')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9c-.086 0-.17.01-.25.031A2 2 0 0 1 7 10H4a2 2 0 1 1 0-4h2.354" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M9.646 10.5H12a3 3 0 1 0 0-6H9a3 3 0 0 0-2.83 4H7c.086 0 .17-.01.25-.031A2 2 0 0 1 9 6h3a2 2 0 1 1 0 4H9.646" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
          <button
            className={`display-toggle-btn ${canvasShowImages ? 'active' : ''}`}
            onClick={() => setCanvasShowImages(!canvasShowImages)}
            title={canvasShowImages ? t('graphCanvas.hideImages') : t('graphCanvas.showImages')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1"/>
              <path d="M1 11l3-3 2 2 4-4 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className={`display-toggle-btn ${canvasShowSummaries ? 'active' : ''}`}
            onClick={() => setCanvasShowSummaries(!canvasShowSummaries)}
            title={canvasShowSummaries ? t('graphCanvas.hideSummaries') : t('graphCanvas.showSummaries')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M4.5 6h7M4.5 8h7M4.5 10h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="canvas-filter-divider" />

        <select
          value={canvasFilterPath || ''}
          onChange={(e) => setCanvasFilterPath(e.target.value || null)}
          className="canvas-filter-select"
        >
          <option value="">{t('graphCanvas.allNotes')} ({allNotes.length})</option>
          <option value="__root__">{t('graphCanvas.rootLevelOnly')}</option>
          {folders.map(folder => (
            <option key={folder} value={folder}>
              📁 {folder} ({folderCounts.get(folder) || 0})
            </option>
          ))}
        </select>
        {canvasFilterPath && (
          <button
            className="canvas-filter-clear"
            onClick={() => setCanvasFilterPath(null)}
            title={t('graphCanvas.resetFilter')}
          >
            ✕
          </button>
        )}
        <span className="canvas-filter-info">
          {notes.length} {t('graphCanvas.notesOf')} {allNotes.length} {t('graphCanvas.notes')}
        </span>

        {/* Alignment Tools - nur im Full Canvas Mode (mehr Platz) */}
        {viewMode === 'canvas' && (
          <>
            <div className="canvas-filter-divider" />

            {/* Focus Mode - nur Enter-Button in Toolbar */}
            {!focusMode && (
              <button
                className="focus-btn"
                onClick={handleEnterFocusMode}
                disabled={selectedCount === 0}
                title={t('graphCanvas.focusMode')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="8" cy="8" r="2" fill="currentColor"/>
                </svg>
                <span>{t('graphCanvas.focus')}</span>
              </button>
            )}

            <div className="canvas-filter-divider" />

            <AlignmentToolbar
              onAlign={handleAlign}
              onDistribute={handleDistribute}
              onApplyLayoutPreset={handleApplyLayoutPreset}
              activeLayoutPreset={activeLayoutPreset}
              disabled={selectedCount < 2}
              selectedCount={selectedCount}
            />
          </>
        )}
      </div>

      {notes.length === 0 ? (
        <div className="canvas-empty">
          <p>{t('graphCanvas.noNotesInFolder')}</p>
          <button className="btn-primary" onClick={() => setCanvasFilterPath(null)}>
            {t('graphCanvas.showAll')}
          </button>
        </div>
      ) : (
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        onMoveEnd={handleMoveEnd}
        nodeTypes={nodeTypes}
        defaultViewport={viewport}
        fitView={Object.keys(positions).length === 0}
        fitViewOptions={fitViewOptions}
        minZoom={0.1}
        maxZoom={2}
        connectionLineStyle={connectionLineStyle}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <Controls />
        <Panel position="top-right" className="canvas-export-panel">
          <button
            className="canvas-export-btn"
            onClick={handleExportSvg}
            title={t('graphCanvas.exportSVG')}
          >
            SVG
          </button>
        </Panel>
        {focusMode && (
          <Panel position="top-center" className="focus-floating-bar">
            <div className="focus-mode-active">
              <span className="focus-indicator" />
              <span>{focusedNodeIds.size} {t('graphCanvas.inFocus')}</span>
            </div>
            <button
              className="focus-btn small"
              onClick={handleAddToFocus}
              disabled={selectedCount === 0}
              title={t('graphCanvas.addToFocus')}
            >
              +
            </button>
            <button
              className="focus-btn small"
              onClick={handleRemoveFromFocus}
              disabled={selectedCount === 0}
              title={t('graphCanvas.removeFromFocus')}
            >
              −
            </button>
            <button
              className="focus-btn exit"
              onClick={handleExitFocusMode}
              title={t('graphCanvas.exitFocusMode')}
            >
              ✕
            </button>
          </Panel>
        )}
        <MiniMap
          nodeColor={(node) => node.data.color || 'var(--node-minimap-color)'}
          maskColor="var(--minimap-mask)"
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          currentColor={
            contextMenu.type === 'node' ? positions[contextMenu.id]?.color :
            contextMenu.type === 'label' ? labels.find(l => l.id === contextMenu.id)?.color :
            undefined
          }
          onClose={() => setContextMenu(null)}
          onDelete={handleDelete}
          onColorChange={(color) => {
            if (contextMenu.type === 'node') {
              setNodeColor(contextMenu.id, color)
            } else if (contextMenu.type === 'label') {
              updateLabel(contextMenu.id, { color })
            }
          }}
          onOpenInEditor={() => {
            if (contextMenu.type === 'node') {
              selectNote(contextMenu.id)
              setViewMode('split')
            }
          }}
          onRename={() => {
            if (contextMenu.type === 'node' || contextMenu.type === 'label') {
              setEditingNodeId(contextMenu.id)
            }
          }}
          onEditTags={() => {
            if (contextMenu.type === 'node') {
              setTagEditDialog({
                noteId: contextMenu.id,
                x: contextMenu.x,
                y: contextMenu.y
              })
            }
          }}
          onAddExternalLink={() => {
            if (contextMenu.type === 'node') {
              setExternalLinkDialog({
                noteId: contextMenu.id,
                x: contextMenu.x,
                y: contextMenu.y
              })
            }
          }}
          onAddImage={() => {
            if (contextMenu.type === 'node') {
              setImageUploadDialog({
                noteId: contextMenu.id,
                x: contextMenu.x,
                y: contextMenu.y
              })
            }
          }}
        />
      )}

      {/* Pane Context Menu (Rechtsklick auf leere Fläche) */}
      {paneContextMenu && (
        <>
          {/* Backdrop zum Schließen bei Klick außerhalb */}
          <div
            className="context-menu-backdrop"
            onClick={() => setPaneContextMenu(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
          />
          {/* Das eigentliche Menü */}
          <div
            className="context-menu"
            style={{ position: 'fixed', left: paneContextMenu.x, top: paneContextMenu.y, zIndex: 1000 }}
          >
            <button
              className="context-menu-item"
              onClick={() => {
                handleCreateLabel(paneContextMenu.flowPosition.x, paneContextMenu.flowPosition.y)
              }}
            >
              {t('graphCanvas.addHeading')}
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                setNewNoteDialog({
                  x: paneContextMenu.x,
                  y: paneContextMenu.y,
                  flowPosition: paneContextMenu.flowPosition,
                  sourceNodeId: undefined
                })
                setPaneContextMenu(null)
              }}
            >
              {t('graphCanvas.createNewNote')}
            </button>
          </div>
        </>
      )}

      {/* Tag-Edit Dialog */}
      {tagEditDialog && (
        <TagEditDialog
          x={tagEditDialog.x}
          y={tagEditDialog.y}
          noteId={tagEditDialog.noteId}
          currentTags={notes.find(n => n.id === tagEditDialog.noteId)?.tags || []}
          allTags={[...new Set(notes.flatMap(n => n.tags))].sort()}
          onClose={() => setTagEditDialog(null)}
          onSave={(tags) => handleSaveTags(tagEditDialog.noteId, tags)}
        />
      )}

      {/* External Link Dialog */}
      {externalLinkDialog && (
        <ExternalLinkDialog
          x={externalLinkDialog.x}
          y={externalLinkDialog.y}
          onClose={() => setExternalLinkDialog(null)}
          onSave={(url, title) => handleAddExternalLink(externalLinkDialog.noteId, url, title)}
        />
      )}

      {/* Image Upload Dialog */}
      {imageUploadDialog && (
        <ImageUploadDialog
          x={imageUploadDialog.x}
          y={imageUploadDialog.y}
          onClose={() => setImageUploadDialog(null)}
          onSave={(file) => handleAddImage(imageUploadDialog.noteId, file)}
        />
      )}

      {/* Dialog für neue Notiz beim Ziehen ins Leere */}
      {newNoteDialog && (
        <div
          className="new-note-dialog-overlay"
          onClick={() => {
            setNewNoteDialog(null)
            setNewNoteName('')
            setNewNoteContent('')
            setNewNoteTags('')
            setNewNoteTodos('')
            setNewNoteLink('')
            setNewNoteImage(null)
            setNewNoteImagePreview(null)
          }}
        >
          <div
            className="new-note-dialog-extended"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t('graphCanvas.createCard')}</h3>

            <div className="new-note-field">
              <label>{t('graphCanvas.titleRequired')}</label>
              <input
                type="text"
                value={newNoteName}
                onChange={(e) => setNewNoteName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setNewNoteDialog(null)
                    setNewNoteName('')
                    setNewNoteContent('')
                    setNewNoteTags('')
                    setNewNoteTodos('')
                    setNewNoteLink('')
                    setNewNoteImage(null)
                    setNewNoteImagePreview(null)
                  } else if (e.key === 'Enter' && newNoteName.trim()) {
                    e.preventDefault()
                    handleCreateNoteFromDialog()
                  }
                }}
                placeholder={t('graphCanvas.noteTitlePlaceholder')}
                autoFocus
              />
            </div>

            <div className="new-note-field">
              <label>{t('graphCanvas.summaryLabel')}</label>
              <textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder={t('graphCanvas.shortDescription')}
                rows={3}
              />
            </div>

            <div className="new-note-field">
              <label>Tags</label>
              <input
                type="text"
                value={newNoteTags}
                onChange={(e) => setNewNoteTags(e.target.value)}
                placeholder="#tag1 #tag2 oder tag1, tag2"
              />
            </div>

            <div className="new-note-field">
              <label>{t('graphCanvas.tasks')}</label>
              <textarea
                value={newNoteTodos}
                onChange={(e) => setNewNoteTodos(e.target.value)}
                placeholder={t('graphCanvas.oneTaskPerLine')}
                rows={3}
              />
            </div>

            <div className="new-note-field">
              <label>{t('graphCanvas.externalLink')}</label>
              <input
                type="url"
                value={newNoteLink}
                onChange={(e) => setNewNoteLink(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className="new-note-field">
              <label>{t('graphCanvas.image')}</label>
              <div className="image-upload-area">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setNewNoteImage(file)
                      // Preview erstellen
                      const reader = new FileReader()
                      reader.onload = () => {
                        setNewNoteImagePreview(reader.result as string)
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                  id="new-note-image-upload"
                  style={{ display: 'none' }}
                />
                {newNoteImagePreview ? (
                  <div className="image-preview">
                    <img src={newNoteImagePreview} alt="Preview" />
                    <button
                      className="image-remove-btn"
                      onClick={() => {
                        setNewNoteImage(null)
                        setNewNoteImagePreview(null)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label htmlFor="new-note-image-upload" className="image-upload-btn">
                    📷 {t('graphCanvas.selectImage')}
                  </label>
                )}
              </div>
            </div>

            <div className="new-note-dialog-buttons">
              <button
                onClick={handleCreateNoteFromDialog}
                className="btn-primary"
                disabled={!newNoteName.trim()}
              >
                {t('graphCanvas.create')}
              </button>
              <button onClick={() => {
                setNewNoteDialog(null)
                setNewNoteName('')
                setNewNoteContent('')
                setNewNoteTags('')
                setNewNoteTodos('')
                setNewNoteLink('')
                setNewNoteImage(null)
                setNewNoteImagePreview(null)
              }}>
                {t('graphCanvas.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
