import React, { memo, useState, useRef, useEffect } from 'react'
import { Handle, Position, type NodeProps, NodeResizer } from 'reactflow'
import type { Note } from '../../../shared/types'
import type { ExtractedCallout, TaskSummary, ExtractedExternalLink, ExtractedImage } from '../../utils/linkExtractor'

interface NoteNodeData {
  title: string
  note: Note
  color?: string
  size?: 'small' | 'medium' | 'large'
  width?: number
  height?: number
  isEditing?: boolean
  onTitleChange?: (noteId: string, newTitle: string) => void
  onEditingDone?: (noteId: string) => void
  onTaskToggle?: (noteId: string, taskLine: number, completed: boolean) => void
  onOpenExternalLink?: (url: string) => void
  callout?: ExtractedCallout | null
  taskSummary?: TaskSummary | null
  externalLink?: ExtractedExternalLink | null
  embeddedImage?: ExtractedImage | null
  imageDataUrl?: string | null
  // Display settings
  showTags?: boolean
  showLinks?: boolean
  showImages?: boolean
  compactMode?: boolean
}

// Vordefinierte Farben - müssen mit nodeColors in GraphCanvas.tsx übereinstimmen
const colorPalette: Record<string, { bg: string; border: string; text: string }> = {
  '#ffcdd2': { bg: 'linear-gradient(135deg, #ffcdd2 0%, #ef9a9a 100%)', border: '#e57373', text: '#b71c1c' },
  '#ffe0b2': { bg: 'linear-gradient(135deg, #ffe0b2 0%, #ffcc80 100%)', border: '#ffb74d', text: '#e65100' },
  '#fff9c4': { bg: 'linear-gradient(135deg, #fff9c4 0%, #fff59d 100%)', border: '#fff176', text: '#f57f17' },
  '#c8e6c9': { bg: 'linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 100%)', border: '#81c784', text: '#2e7d32' },
  '#bbdefb': { bg: 'linear-gradient(135deg, #bbdefb 0%, #90caf9 100%)', border: '#64b5f6', text: '#1565c0' },
  '#e1bee7': { bg: 'linear-gradient(135deg, #e1bee7 0%, #ce93d8 100%)', border: '#ba68c8', text: '#7b1fa2' },
  '#f8bbd9': { bg: 'linear-gradient(135deg, #f8bbd9 0%, #f48fb1 100%)', border: '#f06292', text: '#c2185b' },
  '#cfd8dc': { bg: 'linear-gradient(135deg, #cfd8dc 0%, #b0bec5 100%)', border: '#90a4ae', text: '#455a64' },
}

// Formatiert ein Datum für die Task-Anzeige
function formatTaskDate(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const taskDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (taskDay.getTime() === today.getTime()) {
    return `Heute ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }
  if (taskDay.getTime() === tomorrow.getTime()) {
    return `Morgen ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }

  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${day}.${month}`
}

// Custom comparison - re-render when display settings or other important data changes
const arePropsEqual = (prevProps: NodeProps<NoteNodeData>, nextProps: NodeProps<NoteNodeData>) => {
  return (
    prevProps.selected === nextProps.selected &&
    prevProps.data.title === nextProps.data.title &&
    prevProps.data.color === nextProps.data.color &&
    prevProps.data.isEditing === nextProps.data.isEditing &&
    prevProps.data.showTags === nextProps.data.showTags &&
    prevProps.data.showLinks === nextProps.data.showLinks &&
    prevProps.data.showImages === nextProps.data.showImages &&
    prevProps.data.compactMode === nextProps.data.compactMode &&
    prevProps.data.imageDataUrl === nextProps.data.imageDataUrl &&
    prevProps.data.note.tags.length === nextProps.data.note.tags.length &&
    prevProps.data.note.outgoingLinks.length === nextProps.data.note.outgoingLinks.length &&
    prevProps.data.note.incomingLinks.length === nextProps.data.note.incomingLinks.length
  )
}

export const NoteNode: React.FC<NodeProps<NoteNodeData>> = memo(({ data, selected }) => {
  const {
    title, note, color, isEditing, onTitleChange, onEditingDone, onTaskToggle, onOpenExternalLink,
    callout, taskSummary, externalLink, embeddedImage, imageDataUrl,
    showTags = true, showLinks = true, showImages = true, compactMode = false
  } = data

  const [editValue, setEditValue] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Update editValue when title changes externally
  useEffect(() => {
    setEditValue(title)
  }, [title])

  const handleSave = () => {
    const newTitle = editValue.trim()
    if (newTitle && newTitle !== title && onTitleChange) {
      onTitleChange(note.id, newTitle)
    }
    if (onEditingDone) {
      onEditingDone(note.id)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(title)
      if (onEditingDone) {
        onEditingDone(note.id)
      }
    }
  }

  // Farb-Styling bestimmen
  const colorStyle = color && colorPalette[color]
    ? colorPalette[color]
    : { bg: 'var(--node-bg)', border: 'var(--node-border)', text: 'var(--text-primary)' }

  const linkCount = note.outgoingLinks.length + note.incomingLinks.length

  return (
    <>
      <NodeResizer
        minWidth={80}
        minHeight={50}
        isVisible={selected}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div
        className={`note-node ${selected ? 'selected' : ''} ${callout ? 'has-callout' : ''} ${taskSummary && taskSummary.total > 0 ? 'has-tasks' : ''}`}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 50,
          padding: '10px 14px',
          boxSizing: 'border-box',
          background: color ? colorStyle.bg : 'var(--node-bg)',
          borderColor: selected ? 'var(--accent-color)' : colorStyle.border,
          color: color ? colorStyle.text : 'var(--text-primary)',
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          id="target-left"
          className="node-handle"
        />

        <div className="note-node-content">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="note-node-title-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="note-node-title">
              {note.sourcePdf && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6, verticalAlign: 'middle', opacity: 0.7 }}>
                  <path d="M4 1C3.45 1 3 1.45 3 2V14C3 14.55 3.45 15 4 15H12C12.55 15 13 14.55 13 14V5.41C13 5.15 12.89 4.9 12.71 4.71L10.29 2.29C10.1 2.11 9.85 2 9.59 2H4Z" fill="#ffebee" stroke="#e53935" strokeWidth="0.8"/>
                  <text x="8" y="11" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#e53935">PDF</text>
                </svg>
              )}
              {title}
            </span>
          )}

          {/* Bild-Anzeige (nur wenn Bilder aktiviert und nicht im Kompakt-Modus) */}
          {showImages && !compactMode && embeddedImage && imageDataUrl && (
            <div className="note-node-image">
              <img src={imageDataUrl} alt={embeddedImage.fileName} />
            </div>
          )}

          {/* Externer Link (nur wenn nicht im Kompakt-Modus) */}
          {!compactMode && externalLink && (
            <div
              className="note-node-external-link"
              onClick={(e) => {
                e.stopPropagation()
                if (onOpenExternalLink) {
                  onOpenExternalLink(externalLink.url)
                }
              }}
            >
              <span className="external-link-icon">🔗</span>
              <span className="external-link-text">
                {externalLink.text || new URL(externalLink.url).hostname}
              </span>
            </div>
          )}

          {/* Callout-Anzeige (nur wenn nicht im Kompakt-Modus) */}
          {!compactMode && callout && (
            <div className={`note-node-callout callout-type-${callout.type}`}>
              <div className="note-node-callout-header">
                <span className="note-node-callout-icon">{callout.icon}</span>
                <span className="note-node-callout-title">{callout.title}</span>
              </div>
              <div className="note-node-callout-content">
                {callout.content.length > 100
                  ? callout.content.substring(0, 100) + '...'
                  : callout.content}
              </div>
            </div>
          )}

          {/* Task-Anzeige (nur wenn nicht im Kompakt-Modus) */}
          {!compactMode && taskSummary && taskSummary.total > 0 && (
            <div className="note-node-tasks">
              <div className={`task-counter ${taskSummary.hasOverdue ? 'overdue' : ''}`}>
                <span className="task-counter-check">✓</span>
                <span>{taskSummary.completed}/{taskSummary.total}</span>
              </div>
              <ul className="task-list">
                {taskSummary.tasks
                  .filter(t => !t.completed)
                  .slice(0, 3)
                  .map((task, i) => (
                    <li key={i} className={task.isOverdue ? 'overdue' : ''}>
                      <label
                        className="task-checkbox-label"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="task-checkbox"
                          checked={task.completed}
                          onChange={(e) => {
                            e.stopPropagation()
                            if (onTaskToggle) {
                              onTaskToggle(note.id, task.line, !task.completed)
                            }
                          }}
                        />
                        <span className="task-text">{task.text.length > 30 ? task.text.substring(0, 30) + '...' : task.text}</span>
                      </label>
                      {task.dueDate && (
                        <span className={`task-due ${task.isOverdue ? 'overdue' : ''}`}>
                          {formatTaskDate(task.dueDate)}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
              {taskSummary.tasks.filter(t => !t.completed).length > 3 && (
                <div className="task-more">
                  +{taskSummary.tasks.filter(t => !t.completed).length - 3} weitere
                </div>
              )}
            </div>
          )}

          {/* Meta-Infos (Links und Tags) - nur wenn nicht alles ausgeblendet */}
          {(!compactMode && (showLinks || showTags)) && (
            <div className="note-node-meta">
              {showLinks && linkCount > 0 && (
                <span className="note-node-links">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.7 }}>
                    <path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9c-.086 0-.17.01-.25.031A2 2 0 0 1 7 10H4a2 2 0 1 1 0-4h2.354M9.646 5.5H12a3 3 0 1 1 0 6H9a3 3 0 0 1-2.83-4H7c.086 0 .17.01.25.031A2 2 0 0 0 9 10h3a2 2 0 1 0 0-4H9.646z"/>
                  </svg>
                  {linkCount}
                </span>
              )}
              {showTags && note.tags.length > 0 && (
                <div className="note-node-tags">
                  {note.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="note-node-tag">#{tag}</span>
                  ))}
                  {note.tags.length > 3 && (
                    <span className="note-node-tag-more">+{note.tags.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <Handle
          type="source"
          position={Position.Right}
          id="source-right"
          className="node-handle"
        />
      </div>
    </>
  )
}, arePropsEqual)

NoteNode.displayName = 'NoteNode'
