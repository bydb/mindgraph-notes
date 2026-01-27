import React, { memo, useState, useCallback } from 'react'
import { useBookmarkStore } from '../../stores/bookmarkStore'
import { useNotesStore } from '../../stores/notesStore'

// Star icon
const StarIcon: React.FC<{ filled?: boolean }> = ({ filled }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)

// Close/remove icon
const RemoveIcon: React.FC = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="2" x2="8" y2="8" />
    <line x1="8" y1="2" x2="2" y2="8" />
  </svg>
)

interface BookmarkItemProps {
  noteId: string
  title: string
  onSelect: () => void
  onRemove: () => void
}

const BookmarkItem: React.FC<BookmarkItemProps> = memo(({ noteId, title, onSelect, onRemove }) => {
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRemove()
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    onRemove()
  }

  return (
    <div
      className="bookmark-item"
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      title={title}
    >
      <span className="bookmark-icon">
        <StarIcon filled />
      </span>
      <span className="bookmark-title">{title}</span>
      <button
        className="bookmark-remove"
        onClick={handleRemove}
        title="Lesezeichen entfernen"
      >
        <RemoveIcon />
      </button>
    </div>
  )
})

BookmarkItem.displayName = 'BookmarkItem'

export const BookmarksBar: React.FC = memo(() => {
  const { bookmarks, removeBookmark } = useBookmarkStore()
  const notes = useNotesStore((s) => s.notes)
  const selectNote = useNotesStore((s) => s.selectNote)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleSelectNote = useCallback((noteId: string) => {
    selectNote(noteId)
  }, [selectNote])

  const handleRemoveBookmark = useCallback((noteId: string) => {
    removeBookmark(noteId)
  }, [removeBookmark])

  // Get note titles for bookmarks
  const bookmarkItems = bookmarks
    .map(id => {
      const note = notes.find(n => n.id === id)
      return note ? { id, title: note.title } : null
    })
    .filter((item): item is { id: string; title: string } => item !== null)

  // Don't render if no bookmarks
  if (bookmarkItems.length === 0) {
    return null
  }

  return (
    <div className={`bookmarks-bar ${isCollapsed ? 'collapsed' : ''}`}>
      <div
        className="bookmarks-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className="bookmarks-header-icon">
          <StarIcon filled />
        </span>
        <span className="bookmarks-header-title">Lesezeichen</span>
        <span className="bookmarks-header-count">{bookmarkItems.length}</span>
        <span className={`bookmarks-header-chevron ${isCollapsed ? 'collapsed' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </div>
      {!isCollapsed && (
        <div className="bookmarks-list">
          {bookmarkItems.map(item => (
            <BookmarkItem
              key={item.id}
              noteId={item.id}
              title={item.title}
              onSelect={() => handleSelectNote(item.id)}
              onRemove={() => handleRemoveBookmark(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
})

BookmarksBar.displayName = 'BookmarksBar'

export default BookmarksBar
