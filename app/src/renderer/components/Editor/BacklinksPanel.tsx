import React from 'react'
import { useNotesStore } from '../../stores/notesStore'

export const BacklinksPanel: React.FC = () => {
  const { notes, getSelectedNote, selectNote } = useNotesStore()
  const selectedNote = getSelectedNote()
  
  if (!selectedNote) {
    return null
  }
  
  const backlinks = selectedNote.incomingLinks
    .map(id => notes.find(n => n.id === id))
    .filter(Boolean)
  
  if (backlinks.length === 0) {
    return (
      <div className="backlinks-panel">
        <h4>Backlinks</h4>
        <p className="no-backlinks">Keine Backlinks gefunden</p>
      </div>
    )
  }
  
  return (
    <div className="backlinks-panel">
      <h4>Backlinks ({backlinks.length})</h4>
      <ul className="backlinks-list">
        {backlinks.map(note => (
          <li 
            key={note!.id} 
            className="backlink-item"
            onClick={() => selectNote(note!.id)}
          >
            <span className="backlink-icon">←</span>
            <span className="backlink-title">{note!.title}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
