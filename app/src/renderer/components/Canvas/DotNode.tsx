import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { Note } from '../../../shared/types'
import { getNoteKind, stripNoteKindMarker } from '../../utils/noteKind'

interface DotNodeData {
  title: string
  note: Note
  color?: string
  linkCount?: number
  dotSize?: number
}

// Pastellfarben der Karten (NOTE_KINDS.canvasColor + Farbwahl im Kontextmenü)
// auf kräftigere Punktfarben abbilden — ein Pastellton ist als 16-px-Punkt
// gegen den Canvas-Hintergrund nicht mehr unterscheidbar.
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

// Punktgröße nach Verlinkungsgrad (wie in Obsidian: stark vernetzte Notizen
// werden größer). Wird auch von GraphCanvas gebraucht, damit der React-Flow-
// Wrapper exakt so groß ist wie der Punkt — sonst stimmen Trefferfläche,
// Auswahlrahmen und Kantenansatz nicht mit dem Sichtbaren überein.
// Bewusst Wurzel- statt linearer Skalierung: linear (16 + 4·n) erreicht den
// Deckel schon bei 11 Verbindungen. Am echten Vault (3686 Notizen) landeten
// damit 22 Notizen auf derselben Maximalgröße — die Notiz mit 11 Verbindungen
// sah aus wie die mit 399. Mit der Wurzel sind es noch 2, und die Stufen
// zwischen 11 / 20 / 45 Verbindungen bleiben sichtbar.
export function dotSizeForLinks(linkCount: number): number {
  const baseSize = 14
  const scale = 7
  const maxSize = 60
  return Math.round(Math.min(baseSize + scale * Math.sqrt(linkCount), maxSize))
}

export const DotNode: React.FC<NodeProps<DotNodeData>> = memo(({ data, selected }) => {
  const { title, note, color } = data
  const noteKind = getNoteKind(note)
  const displayTitle = noteKind ? stripNoteKindMarker(title) : title

  const linkCount = data.linkCount ?? (note.outgoingLinks.length + note.incomingLinks.length)
  const size = data.dotSize ?? dotSizeForLinks(linkCount)

  // Farbe: manuell gesetzte Kartenfarbe → Notiz-Kategorie (🔴🟢🔵) → Akzent
  const dotColor = (color && (colorPalette[color] ?? color))
    || noteKind?.dotColor
    || 'var(--accent-color)'

  return (
    <div
      className={`dot-node ${selected ? 'selected' : ''}`}
      style={{
        width: size,
        height: size,
        backgroundColor: dotColor,
        borderColor: selected ? 'var(--accent-color)' : 'transparent',
      }}
      // BEWUSST kein title-Attribut: das zeichnet macOS als zweite,
      // unformatierte Sprechblase über die eigene Beschriftung unten — beide
      // erscheinen gleichzeitig und überlappen sich. Eine Quelle reicht.
      aria-label={`${displayTitle} (${linkCount} Verbindungen)`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="dot-handle"
        style={{ opacity: 0 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="dot-handle"
        style={{ opacity: 0 }}
      />

      {/* Einzige Beschriftung, erscheint bei Hover (CSS: .dot-node:hover .dot-node-label).
          Die Verbindungszahl steht hier mit drin, weil das title-Attribut oben
          entfallen ist — sie erklärt, warum dieser Punkt so groß ist. */}
      <div className="dot-node-label">
        {noteKind && (
          <span
            className={`note-kind-dot note-kind-${noteKind.id}`}
            aria-label={noteKind.label}
          />
        )}
        <span className="dot-node-label-title">{displayTitle}</span>
        <span className="dot-node-label-count">{linkCount}</span>
      </div>
    </div>
  )
})

DotNode.displayName = 'DotNode'
