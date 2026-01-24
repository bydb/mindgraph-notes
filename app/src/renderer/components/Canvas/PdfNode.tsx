import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'

interface PdfNodeData {
  title: string
  path: string
  color?: string
}

export const PdfNode: React.FC<NodeProps<PdfNodeData>> = memo(({ data, selected }) => {
  const { title, color } = data

  return (
    <div
      className={`pdf-node ${selected ? 'selected' : ''}`}
      style={{
        background: color ? `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)` : undefined,
        borderColor: color || undefined
      }}
    >
      <Handle type="target" position={Position.Left} id="target-left" className="node-handle" />

      <div className="pdf-node-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 2C5.45 2 5 2.45 5 3V21C5 21.55 5.45 22 6 22H18C18.55 22 19 21.55 19 21V7.41C19 7.15 18.89 6.9 18.71 6.71L14.29 2.29C14.1 2.11 13.85 2 13.59 2H6Z"
            fill="#ffebee"
            stroke="#e53935"
            strokeWidth="1"
          />
          <text x="12" y="16" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#e53935">PDF</text>
        </svg>
      </div>

      <div className="pdf-node-title" title={title}>
        {title}
      </div>

      <Handle type="source" position={Position.Right} id="source-right" className="node-handle" />
    </div>
  )
})

PdfNode.displayName = 'PdfNode'

export default PdfNode
