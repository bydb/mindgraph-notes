import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { Note } from '../../../shared/types'

interface DotNodeData {
  title: string
  note: Note
  color?: string
  linkCount?: number
}

// Farben für die Punkte
const colorPalette: Record<string, string> = {
  '#ffcdd2': '#e57373',
  '#ffe0b2': '#ffb74d',
  '#fff9c4': '#fff176',
  '#c8e6c9': '#81c784',
  '#bbdefb': '#64b5f6',
  '#e1bee7': '#ba68c8',
  '#f8bbd9': '#f06292',
  '#cfd8dc': '#90a4ae',
}

export const DotNode: React.FC<NodeProps<DotNodeData>> = memo(({ data, selected }) => {
  const { title, note, color } = data

  const linkCount = data.linkCount ?? (note.outgoingLinks.length + note.incomingLinks.length)

  // Größe basierend auf Verlinkungen (min 16px, max 60px)
  const baseSize = 16
  const sizePerLink = 4
  const maxSize = 60
  const size = Math.min(baseSize + linkCount * sizePerLink, maxSize)

  // Farbe bestimmen
  const dotColor = color && colorPalette[color]
    ? colorPalette[color]
    : 'var(--accent-color)'

  return (
    <div
      className={`dot-node ${selected ? 'selected' : ''}`}
      style={{
        width: size,
        height: size,
        backgroundColor: dotColor,
        borderColor: selected ? 'var(--accent-color)' : 'transparent',
      }}
      title={`${title} (${linkCount} Verbindungen)`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="dot-handle"
        style={{ opacity: 0 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="dot-handle"
        style={{ opacity: 0 }}
      />

      {/* Titel als Tooltip bei Hover */}
      <div className="dot-node-label">
        {title}
      </div>
    </div>
  )
})

DotNode.displayName = 'DotNode'
