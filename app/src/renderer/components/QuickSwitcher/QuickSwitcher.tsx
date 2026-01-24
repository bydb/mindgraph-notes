import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import type { Note } from '../../../shared/types'

interface QuickSwitcherProps {
  isOpen: boolean
  onClose: () => void
  onSelectNote: (noteId: string) => void
  onCreateNote: (title: string) => void
}

interface SearchResult {
  note: Note
  matchType: 'title' | 'path' | 'content'
  score: number
}

export const QuickSwitcher: React.FC<QuickSwitcherProps> = ({
  isOpen,
  onClose,
  onSelectNote,
  onCreateNote
}) => {
  const { notes, selectedNoteId } = useNotesStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Fuzzy-Suche mit Scoring
  const searchResults = useMemo((): SearchResult[] => {
    if (!searchQuery.trim()) {
      // Ohne Query: Zeige zuletzt verwendete / alle Notizen
      return notes
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
        .slice(0, 20)
        .map(note => ({ note, matchType: 'title' as const, score: 100 }))
    }

    const query = searchQuery.toLowerCase()
    const results: SearchResult[] = []

    for (const note of notes) {
      const titleLower = note.title.toLowerCase()
      const pathLower = note.path.toLowerCase()

      let score = 0
      let matchType: 'title' | 'path' | 'content' = 'title'

      // Exakter Titel-Match
      if (titleLower === query) {
        score = 100
        matchType = 'title'
      }
      // Titel beginnt mit Query
      else if (titleLower.startsWith(query)) {
        score = 90
        matchType = 'title'
      }
      // Titel enthält Query
      else if (titleLower.includes(query)) {
        score = 70
        matchType = 'title'
      }
      // Fuzzy-Match im Titel
      else if (fuzzyMatch(query, titleLower)) {
        score = 50
        matchType = 'title'
      }
      // Pfad enthält Query
      else if (pathLower.includes(query)) {
        score = 30
        matchType = 'path'
      }

      if (score > 0) {
        results.push({ note, matchType, score })
      }
    }

    // Sortiere nach Score
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
  }, [notes, searchQuery])

  // Zeige "Neu erstellen" Option wenn keine Treffer
  const showCreateOption = searchQuery.trim().length > 0 &&
    !searchResults.some(r => r.note.title.toLowerCase() === searchQuery.toLowerCase())

  // Reset bei Öffnen
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0)
      setSearchQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Reset selection bei Query-Änderung
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('.quick-switcher-item')
      const selectedEl = items[selectedIndex] as HTMLElement
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const totalItems = searchResults.length + (showCreateOption ? 1 : 0)

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => Math.min(prev + 1, totalItems - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          handleSelection()
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, searchResults, selectedIndex, showCreateOption, onClose])

  const handleSelection = () => {
    if (showCreateOption && selectedIndex === searchResults.length) {
      // "Neu erstellen" ausgewählt
      onCreateNote(searchQuery.trim())
      onClose()
    } else if (searchResults[selectedIndex]) {
      onSelectNote(searchResults[selectedIndex].note.id)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="quick-switcher-overlay" onClick={onClose}>
      <div className="quick-switcher" onClick={e => e.stopPropagation()}>
        <div className="quick-switcher-header">
          <input
            ref={inputRef}
            type="text"
            className="quick-switcher-search"
            placeholder="Notiz suchen oder erstellen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="quick-switcher-list" ref={listRef}>
          {searchResults.length === 0 && !showCreateOption ? (
            <div className="quick-switcher-empty">
              {searchQuery ? 'Keine Notizen gefunden' : 'Keine Notizen vorhanden'}
            </div>
          ) : (
            <>
              {searchResults.map((result, index) => (
                <div
                  key={result.note.id}
                  className={`quick-switcher-item ${index === selectedIndex ? 'selected' : ''} ${result.note.id === selectedNoteId ? 'current' : ''}`}
                  onClick={() => {
                    onSelectNote(result.note.id)
                    onClose()
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span className="quick-switcher-icon">📄</span>
                  <div className="quick-switcher-info">
                    <span className="quick-switcher-title">
                      {highlightMatch(result.note.title, searchQuery)}
                    </span>
                    <span className="quick-switcher-path">{result.note.path}</span>
                  </div>
                  {result.note.id === selectedNoteId && (
                    <span className="quick-switcher-current-badge">aktuell</span>
                  )}
                </div>
              ))}

              {showCreateOption && (
                <div
                  className={`quick-switcher-item create ${selectedIndex === searchResults.length ? 'selected' : ''}`}
                  onClick={() => {
                    onCreateNote(searchQuery.trim())
                    onClose()
                  }}
                  onMouseEnter={() => setSelectedIndex(searchResults.length)}
                >
                  <span className="quick-switcher-icon">➕</span>
                  <div className="quick-switcher-info">
                    <span className="quick-switcher-title">
                      "{searchQuery}" erstellen
                    </span>
                    <span className="quick-switcher-path">Neue Notiz anlegen</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="quick-switcher-footer">
          <span>↑↓ navigieren</span>
          <span>↵ öffnen</span>
          <span>Esc schließen</span>
        </div>
      </div>
    </div>
  )
}

// Einfacher Fuzzy-Match
function fuzzyMatch(query: string, text: string): boolean {
  let queryIndex = 0
  for (let i = 0; i < text.length && queryIndex < query.length; i++) {
    if (text[i] === query[queryIndex]) {
      queryIndex++
    }
  }
  return queryIndex === query.length
}

// Highlight matching text
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)

  if (index === -1) return text

  return (
    <>
      {text.substring(0, index)}
      <mark>{text.substring(index, index + query.length)}</mark>
      {text.substring(index + query.length)}
    </>
  )
}
