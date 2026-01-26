import React, { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { Note } from '../../../shared/types'

interface SimpleNoteNodeData {
  title: string
  note: Note
  isRoot: boolean
  isExpanded: boolean
  hiddenConnections: number
  onExpand: (noteId: string) => void
  onClick: (noteId: string) => void
}

export const SimpleNoteNode: React.FC<NodeProps<SimpleNoteNodeData>> = memo(({ data, selected }) => {
  const { title, note, isRoot, isExpanded, hiddenConnections, onExpand, onClick } = data

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onClick(note.id)
  }, [note.id, onClick])

  const handleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onExpand(note.id)
  }, [note.id, onExpand])

  // Verbindungsanzahl
  const totalConnections = note.outgoingLinks.length + note.incomingLinks.length

  return (
    <div
      className={`simple-note-node ${isRoot ? 'is-root' : ''} ${selected ? 'selected' : ''} ${isExpanded ? 'is-expanded' : ''}`}
      onClick={handleClick}
    >
      <Handle type="target" position={Position.Top} className="simple-node-handle" />

      {/* Root Badge */}
      {isRoot && <div className="simple-node-root-badge">Root</div>}

      {/* Title */}
      <div className="simple-node-title">{title || 'Unbenannt'}</div>

      {/* Stats */}
      <div className="simple-node-stats">
        {totalConnections} Verbindung{totalConnections !== 1 ? 'en' : ''}
      </div>

      {/* Expand Button */}
      {hiddenConnections > 0 && !isExpanded && (
        <button
          className="simple-node-expand-btn"
          onClick={handleExpand}
          title={`${hiddenConnections} weitere Verbindungen anzeigen`}
        >
          +{hiddenConnections}
        </button>
      )}

      {/* Expanded Indicator */}
      {isExpanded && (
        <div className="simple-node-expanded-indicator">erweitert</div>
      )}

      <Handle type="source" position={Position.Bottom} className="simple-node-handle" />
    </div>
  )
})

SimpleNoteNode.displayName = 'SimpleNoteNode'

export default SimpleNoteNode
