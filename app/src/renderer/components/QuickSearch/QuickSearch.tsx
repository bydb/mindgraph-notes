import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import type { Note } from '../../../shared/types'

interface QuickSearchProps {
  isOpen: boolean
  onClose: () => void
}

interface SearchResult {
  note: Note
  matchType: 'title' | 'tag' | 'content'
  matchText: string
}

export const QuickSearch: React.FC<QuickSearchProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const { notes, selectNote } = useNotesStore()

  // Fokus auf Input wenn geöffnet
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Suchergebnisse berechnen
  const results: SearchResult[] = useMemo(() => {
    if (!query.trim()) {
      // Zeige zuletzt geänderte Notizen wenn keine Suche
      return notes
        .slice()
        .sort((a, b) => {
          const aTime = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0
          const bTime = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0
          return bTime - aTime
        })
        .slice(0, 10)
        .map(note => ({
          note,
          matchType: 'title' as const,
          matchText: note.title
        }))
    }

    const searchResults: SearchResult[] = []
    const queryLower = query.toLowerCase()
    const addedNoteIds = new Set<string>()

    // Suche nach Titel (höchste Priorität)
    for (const note of notes) {
      if (note.title.toLowerCase().includes(queryLower)) {
        searchResults.push({
          note,
          matchType: 'title',
          matchText: note.title
        })
        addedNoteIds.add(note.id)
      }
    }

    // Suche nach Tags
    for (const note of notes) {
      if (addedNoteIds.has(note.id)) continue

      const matchingTag = note.tags.find(tag =>
        tag.toLowerCase().includes(queryLower)
      )
      if (matchingTag) {
        searchResults.push({
          note,
          matchType: 'tag',
          matchText: `#${matchingTag}`
        })
        addedNoteIds.add(note.id)
      }
    }

    // Suche im Inhalt
    for (const note of notes) {
      if (addedNoteIds.has(note.id)) continue

      const contentLower = note.content.toLowerCase()
      const matchIndex = contentLower.indexOf(queryLower)
      if (matchIndex !== -1) {
        // Extrahiere Kontext um den Match
        const start = Math.max(0, matchIndex - 30)
        const end = Math.min(note.content.length, matchIndex + query.length + 30)
        let excerpt = note.content.substring(start, end)
        if (start > 0) excerpt = '...' + excerpt
        if (end < note.content.length) excerpt = excerpt + '...'

        searchResults.push({
          note,
          matchType: 'content',
          matchText: excerpt.replace(/\n/g, ' ')
        })
        addedNoteIds.add(note.id)
      }
    }

    return searchResults.slice(0, 15)
  }, [query, notes])

  // Auswahl zurücksetzen wenn Ergebnisse sich ändern
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  // Keyboard Navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (results[selectedIndex]) {
          selectNote(results[selectedIndex].note.id)
          onClose()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [results, selectedIndex, selectNote, onClose])

  // Scroll ausgewähltes Element in Sicht
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Klick auf Ergebnis
  const handleResultClick = useCallback((result: SearchResult) => {
    selectNote(result.note.id)
    onClose()
  }, [selectNote, onClose])

  // Klick außerhalb schließt
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  if (!isOpen) return null

  return (
    <div className="quick-search-backdrop" onClick={handleBackdropClick}>
      <div className="quick-search-modal">
        <div className="quick-search-input-wrapper">
          <svg className="quick-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="quick-search-input"
            placeholder="Suche nach Notizen, Tags oder Inhalt..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="quick-search-hint">ESC zum Schließen</span>
        </div>

        <div className="quick-search-results" ref={resultsRef}>
          {results.length === 0 ? (
            <div className="quick-search-empty">
              Keine Ergebnisse gefunden
            </div>
          ) : (
            results.map((result, index) => (
              <div
                key={result.note.id}
                className={`quick-search-result ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleResultClick(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="quick-search-result-icon">
                  {result.matchType === 'title' && '📄'}
                  {result.matchType === 'tag' && '🏷️'}
                  {result.matchType === 'content' && '📝'}
                </div>
                <div className="quick-search-result-content">
                  <div className="quick-search-result-title">{result.note.title}</div>
                  {result.matchType !== 'title' && (
                    <div className="quick-search-result-match">
                      {result.matchText}
                    </div>
                  )}
                </div>
                <div className="quick-search-result-path">
                  {result.note.path}
                </div>
              </div>
            ))
          )}
        </div>

        {!query && (
          <div className="quick-search-footer">
            Zuletzt bearbeitet
          </div>
        )}
      </div>
    </div>
  )
}
