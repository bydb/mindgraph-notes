import React, { memo, useState, useRef, useEffect } from 'react'
import { type NodeProps, NodeResizer } from 'reactflow'

export interface LabelNodeData {
  text: string
  color?: string
  fontSize?: 'small' | 'medium' | 'large'
  isEditing?: boolean
  onTextChange?: (labelId: string, newText: string) => void
  onEditingDone?: (labelId: string) => void
}

// Vordefinierte Farben
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

const fontSizes = {
  small: '14px',
  medium: '18px',
  large: '24px'
}

export const LabelNode: React.FC<NodeProps<LabelNodeData>> = memo(({ id, data, selected }) => {
  const { text, color, fontSize = 'medium', isEditing, onTextChange, onEditingDone } = data

  const [editValue, setEditValue] = useState(text)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Update editValue when text changes externally
  useEffect(() => {
    setEditValue(text)
  }, [text])

  const handleSave = () => {
    const newText = editValue.trim()
    if (newText && newText !== text && onTextChange) {
      onTextChange(id, newText)
    }
    if (onEditingDone) {
      onEditingDone(id)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(text)
      if (onEditingDone) {
        onEditingDone(id)
      }
    }
  }

  // Farb-Styling bestimmen
  const colorStyle = color && colorPalette[color]
    ? colorPalette[color]
    : { bg: 'var(--label-bg, rgba(255,255,255,0.9))', border: 'var(--label-border, #ddd)', text: 'var(--text-primary)' }

  return (
    <>
      <NodeResizer
        minWidth={100}
        minHeight={40}
        isVisible={selected}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div
        className={`label-node ${selected ? 'selected' : ''}`}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 40,
          padding: '8px 16px',
          boxSizing: 'border-box',
          background: color ? colorStyle.bg : colorStyle.bg,
          borderColor: selected ? 'var(--accent-color)' : colorStyle.border,
          color: color ? colorStyle.text : colorStyle.text,
          fontSize: fontSizes[fontSize],
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="label-node-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: fontSizes[fontSize] }}
          />
        ) : (
          <span className="label-node-text">{text}</span>
        )}
      </div>
    </>
  )
})

LabelNode.displayName = 'LabelNode'
