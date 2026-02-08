import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { Note } from '../../../shared/types'

interface LocalNoteNodeData {
  title: string
  note: Note
  color?: string
  isRoot: boolean
  isExpanded: boolean
  hiddenConnections: number
  onExpand: (noteId: string) => void
  onClick: (noteId: string) => void
}

// Color palette matching NoteNode
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

export const LocalNoteNode: React.FC<NodeProps<LocalNoteNodeData>> = memo(({ data, selected }) => {
  const { title, note, color, isRoot, isExpanded, hiddenConnections, onExpand, onClick } = data

  // Determine color style
  const colorStyle = color && colorPalette[color]
    ? colorPalette[color]
    : { bg: 'var(--node-bg)', border: 'var(--node-border)', text: 'var(--text-primary)' }

  const linkCount = (data as any).linkCount ?? (note.outgoingLinks.length + note.incomingLinks.length)

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClick(note.id)
  }

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onExpand(note.id)
  }

  return (
    <div
      className={`local-note-node ${selected ? 'selected' : ''} ${isRoot ? 'root' : ''} ${isExpanded ? 'expanded' : ''}`}
      style={{
        background: color ? colorStyle.bg : 'var(--node-bg)',
        borderColor: selected ? 'var(--accent-color)' : isRoot ? 'var(--accent-color)' : colorStyle.border,
        borderWidth: isRoot ? 2 : 1,
        color: color ? colorStyle.text : 'var(--text-primary)',
      }}
      onDoubleClick={handleDoubleClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="node-handle"
      />

      <div className="local-note-node-content">
        {/* Root indicator */}
        {isRoot && (
          <span className="local-note-node-root-badge">START</span>
        )}

        {/* Title */}
        <span className="local-note-node-title">{title}</span>

        {/* Meta info */}
        <div className="local-note-node-meta">
          {linkCount > 0 && (
            <span className="local-note-node-links">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.7 }}>
                <path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9c-.086 0-.17.01-.25.031A2 2 0 0 1 7 10H4a2 2 0 1 1 0-4h2.354M9.646 5.5H12a3 3 0 1 1 0 6H9a3 3 0 0 1-2.83-4H7c.086 0 .17.01.25.031A2 2 0 0 0 9 10h3a2 2 0 1 0 0-4H9.646z"/>
              </svg>
              {linkCount}
            </span>
          )}
          {note.tags.length > 0 && (
            <span className="local-note-node-tags">
              {note.tags.slice(0, 2).map(tag => (
                <span key={tag} className="local-note-node-tag">#{tag}</span>
              ))}
              {note.tags.length > 2 && (
                <span className="local-note-node-tag-more">+{note.tags.length - 2}</span>
              )}
            </span>
          )}
        </div>

        {/* Expand button - only show if there are hidden connections and not expanded */}
        {hiddenConnections > 0 && !isExpanded && (
          <button
            className="local-note-node-expand"
            onClick={handleExpandClick}
            title={`${hiddenConnections} weitere Verbindungen anzeigen`}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="8" y1="3" x2="8" y2="13" />
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
            {hiddenConnections}
          </button>
        )}

        {/* Expanded indicator */}
        {isExpanded && (
          <span className="local-note-node-expanded-badge">erweitert</span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="node-handle"
      />
    </div>
  )
})

LocalNoteNode.displayName = 'LocalNoteNode'

export default LocalNoteNode
