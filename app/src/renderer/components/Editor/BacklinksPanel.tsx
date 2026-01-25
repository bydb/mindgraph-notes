import React, { useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'

interface BacklinksPanelProps {
  isSecondary?: boolean
}

export const BacklinksPanel: React.FC<BacklinksPanelProps> = ({ isSecondary = false }) => {
  const { notes, getSelectedNote, getSecondarySelectedNote, selectNote, selectSecondaryNote } = useNotesStore()
  const selectedNote = isSecondary ? getSecondarySelectedNote() : getSelectedNote()
  const [isCollapsed, setIsCollapsed] = useState(false)

  if (!selectedNote) {
    return null
  }

  const backlinks = selectedNote.incomingLinks
    .map(id => notes.find(n => n.id === id))
    .filter(Boolean)

  // Klick auf Backlink öffnet Note im gleichen Panel
  const handleBacklinkClick = (noteId: string) => {
    if (isSecondary) {
      selectSecondaryNote(noteId)
    } else {
      selectNote(noteId)
    }
  }

  return (
    <div className={`backlinks-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div
        className="backlinks-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="backlinks-header-left">
          Backlinks
          <span className="backlinks-count">{backlinks.length}</span>
        </div>
        <span className="backlinks-toggle">▼</span>
      </div>
      <div className="backlinks-content">
        {backlinks.length === 0 ? (
          <p className="no-backlinks">Keine Backlinks</p>
        ) : (
          <ul className="backlinks-list">
            {backlinks.map(note => (
              <li
                key={note!.id}
                className="backlink-item"
                onClick={() => handleBacklinkClick(note!.id)}
              >
                <span className="backlink-icon">📄</span>
                <span className="backlink-title">{note!.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
