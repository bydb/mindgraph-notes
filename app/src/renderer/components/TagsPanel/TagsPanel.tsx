import React, { useMemo, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'

interface TagCount {
  tag: string
  count: number
}

interface TagsPanelProps {
  onClose: () => void
}

export const TagsPanel: React.FC<TagsPanelProps> = ({ onClose }) => {
  const { notes, selectNote } = useNotesStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  // Sammle alle Tags und zähle sie
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {}

    for (const note of notes) {
      if (note.tags) {
        for (const tag of note.tags) {
          const normalizedTag = tag.toLowerCase()
          counts[normalizedTag] = (counts[normalizedTag] || 0) + 1
        }
      }
    }

    // Konvertiere zu Array und sortiere nach Anzahl (absteigend)
    const sorted: TagCount[] = Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)

    return sorted
  }, [notes])

  // Filtere Tags nach Suchbegriff
  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return tagCounts
    const query = searchQuery.toLowerCase()
    return tagCounts.filter(t => t.tag.includes(query))
  }, [tagCounts, searchQuery])

  // Finde Notizen mit ausgewähltem Tag
  const notesWithTag = useMemo(() => {
    if (!selectedTag) return []
    return notes.filter(note =>
      note.tags?.some(t => t.toLowerCase() === selectedTag.toLowerCase())
    )
  }, [notes, selectedTag])

  const handleTagClick = (tag: string) => {
    setSelectedTag(selectedTag === tag ? null : tag)
  }

  const handleNoteClick = (noteId: string) => {
    selectNote(noteId)
  }

  const maxCount = tagCounts.length > 0 ? tagCounts[0].count : 1

  return (
    <div className="tags-panel">
      <div className="tags-panel-header">
        <div className="tags-panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          <span>Tags</span>
          <span className="tags-panel-count">{tagCounts.length}</span>
        </div>
        <button className="tags-panel-close" onClick={onClose} title="Schließen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="tags-panel-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder="Tags durchsuchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="tags-panel-content">
        {selectedTag ? (
          // Zeige Notizen mit ausgewähltem Tag
          <div className="tags-notes-view">
            <div className="tags-notes-header">
              <button className="tags-back-btn" onClick={() => setSelectedTag(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <span className="tags-notes-tag">#{selectedTag}</span>
              <span className="tags-notes-count">{notesWithTag.length} Notizen</span>
            </div>
            <div className="tags-notes-list">
              {notesWithTag.map(note => (
                <div
                  key={note.id}
                  className="tags-note-item"
                  onClick={() => handleNoteClick(note.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span className="tags-note-title">{note.title}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Zeige Tag-Liste
          <div className="tags-list">
            {filteredTags.length === 0 ? (
              <div className="tags-empty">
                {searchQuery ? 'Keine Tags gefunden' : 'Keine Tags im Vault'}
              </div>
            ) : (
              filteredTags.map(({ tag, count }) => (
                <div
                  key={tag}
                  className="tags-item"
                  onClick={() => handleTagClick(tag)}
                >
                  <div className="tags-item-info">
                    <span className="tags-item-name">#{tag}</span>
                    <span className="tags-item-count">{count}</span>
                  </div>
                  <div className="tags-item-bar">
                    <div
                      className="tags-item-bar-fill"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
