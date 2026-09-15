import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import type { Note } from '../../../shared/types'
import { matchNoteName, type NoteNameSource } from '../../../shared/noteSearchNames'

interface QuickSearchProps {
  isOpen: boolean
  onClose: () => void
  /** Vorbelegter Suchbegriff (Sprachbefehl „suche nach ..."). Leer = wie bisher. */
  initialQuery?: string
}

interface SearchResult {
  note: Note
  matchType: 'title' | 'tag' | 'content'
  matchText: string
  /** Bei Titeltreffern: welcher Name gepasst hat. Dateiname/Frontmatter werden mit angezeigt. */
  nameSource?: NoteNameSource
}

export const QuickSearch: React.FC<QuickSearchProps> = ({ isOpen, onClose, initialQuery = '' }) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const { notes, selectNote } = useNotesStore()
  const vaultPath = useNotesStore(s => s.vaultPath)
  const [loadingContent, setLoadingContent] = useState(false)
  const loadingRef = useRef(false)

  // Nach einem Start aus dem Notes-Cache haben die Notizen `content: ''` — die
  // Volltextsuche fand dann still nur, was seit dem Start geöffnet wurde (ein
  // Treffer statt elf für denselben Begriff). Beim Öffnen der Suche
  // werden fehlende Inhalte deshalb einmal in Paketen nachgeladen; die Treffer
  // aktualisieren sich, sobald ein Paket da ist.
  useEffect(() => {
    if (!isOpen || !vaultPath || loadingRef.current) return
    const stubs = useNotesStore.getState().notes.filter(n => !n.content && n.path.toLowerCase().endsWith('.md'))
    if (stubs.length === 0) return
    loadingRef.current = true
    setLoadingContent(true)
    void (async () => {
      try {
        const CHUNK = 250
        for (let i = 0; i < stubs.length; i += CHUNK) {
          const chunk = stubs.slice(i, i + CHUNK)
          const loaded = await window.electronAPI.readFilesBatch(vaultPath, chunk.map(n => n.path)) as Record<string, string | null>
          const store = useNotesStore.getState()
          store.setNotes(store.notes.map(n => {
            const c = n.content ? null : loaded[n.path]
            return typeof c === 'string' && c ? { ...n, content: c } : n
          }))
        }
      } catch (err) {
        console.error('[QuickSearch] Inhalte nachladen fehlgeschlagen', err)
      } finally {
        loadingRef.current = false
        setLoadingContent(false)
      }
    })()
  }, [isOpen, vaultPath])

  // Fokus auf Input wenn geöffnet
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery)
      setSelectedIndex(0)
      // Bei vorbelegtem Begriff den Text markieren: Überschreiben bleibt möglich,
      // ohne dass erst geleert werden muss.
      setTimeout(() => {
        inputRef.current?.focus()
        if (initialQuery) inputRef.current?.select()
      }, 50)
    }
  }, [isOpen, initialQuery])

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

    // Suche nach Namen (höchste Priorität): H1-Titel, Dateiname, Frontmatter-Titel.
    // `note.title` allein reicht nicht — KI-Zusammenfassungen heißen fast immer
    // „Zusammenfassung", der sprechende Name steht nur im Dateinamen/Frontmatter.
    for (const note of notes) {
      const hit = matchNoteName(note, queryLower)
      if (hit) {
        searchResults.push({
          note,
          matchType: 'title',
          matchText: hit.text,
          nameSource: hit.source
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
            placeholder={t('quickSearch.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="quick-search-hint">{t('quickSearch.escHint')}</span>
        </div>

        <div className="quick-search-results" ref={resultsRef}>
          {results.length === 0 ? (
            <div className="quick-search-empty">
              {loadingContent ? t('quickSearch.loadingContent') : t('quickSearch.noResults')}
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
                  {result.matchType === 'title' && result.nameSource && result.nameSource !== 'title' && (
                    <div className="quick-search-result-match">
                      {result.nameSource === 'fileName'
                        ? t('quickSearch.matchFileName')
                        : t('quickSearch.matchFrontmatterTitle')}
                      {': '}
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
            {t('quickSearch.recentlyEdited')}
          </div>
        )}
      </div>
    </div>
  )
}
