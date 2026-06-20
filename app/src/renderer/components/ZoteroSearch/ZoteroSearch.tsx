import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import {
  searchZotero,
  isZoteroAvailable,
  formatAuthors,
  formatYear,
  generateStyledCitation,
  generateLiteratureNoteWithAnnotations,
  generateLiteratureNoteFilename,
  CITATION_STYLE_OPTIONS,
  DEFAULT_CITATION_STYLE,
  listCitationStyles,
  type CitationStyle,
  type CitationStyleOption,
  type ZoteroSearchResult
} from '../../services/zoteroService'

interface ZoteroSearchProps {
  isOpen: boolean
  onClose: () => void
  onInsertCitation?: (citation: string) => void
}

type ActionMode = 'citation' | 'footnote' | 'note'
const CITATION_STYLE_STORAGE_KEY = 'mindgraph.zotero.citationStyle'

function loadCitationStyle(): CitationStyle {
  const savedStyle = localStorage.getItem(CITATION_STYLE_STORAGE_KEY)
  if (savedStyle === 'apa') return DEFAULT_CITATION_STYLE
  return savedStyle || DEFAULT_CITATION_STYLE
}

export const ZoteroSearch: React.FC<ZoteroSearchProps> = ({ isOpen, onClose, onInsertCitation }) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ZoteroSearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [zoteroAvailable, setZoteroAvailable] = useState<boolean | null>(null)
  const [actionMode, setActionMode] = useState<ActionMode>('citation')
  const [citationStyle, setCitationStyle] = useState<CitationStyle>(loadCitationStyle)
  const [citationStyles, setCitationStyles] = useState<CitationStyleOption[]>(CITATION_STYLE_OPTIONS)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { vaultPath, addNote, selectNote: selectNoteInStore } = useNotesStore()

  // Prüfe Zotero-Verfügbarkeit beim Öffnen
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
      setZoteroAvailable(null)
      setTimeout(() => inputRef.current?.focus(), 50)

      isZoteroAvailable().then(available => {
        setZoteroAvailable(available)
      })

      listCitationStyles().then(styles => {
        setCitationStyles(styles)

        setCitationStyle(currentStyle => {
          if (styles.some(style => style.id === currentStyle)) return currentStyle
          const defaultStyle = styles.find(style => style.id === DEFAULT_CITATION_STYLE)?.id || styles[0]?.id || 'mindgraph'
          localStorage.setItem(CITATION_STYLE_STORAGE_KEY, defaultStyle)
          return defaultStyle
        })
      })
    }
  }, [isOpen])

  // Debounced Search
  useEffect(() => {
    if (!query.trim() || !zoteroAvailable) {
      setResults([])
      return
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const searchResults = await searchZotero(query)
        setResults(searchResults)
        setSelectedIndex(0)
      } catch (err) {
        console.error('[ZoteroSearch] Search error:', err)
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [query, zoteroAvailable])

  // Zitation einfügen
  const insertCitation = useCallback(async (result: ZoteroSearchResult) => {
    const citation = await generateStyledCitation(result, citationStyle)
    console.log('[ZoteroSearch] Inserting citation:', citation)

    if (onInsertCitation) {
      onInsertCitation(citation)
    } else {
      // Dispatch custom event to insert at cursor in editor
      window.dispatchEvent(new CustomEvent('insert-text-at-cursor', { detail: citation }))
    }
    onClose()
  }, [citationStyle, onInsertCitation, onClose])

  // Fußnote einfügen
  const insertFootnote = useCallback(async (result: ZoteroSearchResult) => {
    const citation = await generateStyledCitation(result, citationStyle)
    console.log('[ZoteroSearch] Inserting footnote for:', citation)

    // Dispatch event to insert footnote (editor will handle the logic)
    window.dispatchEvent(new CustomEvent('insert-footnote', {
      detail: { citation, citekey: result.citekey }
    }))
    onClose()
  }, [citationStyle, onClose])

  const handleCitationStyleChange = useCallback((style: CitationStyle) => {
    setCitationStyle(style)
    localStorage.setItem(CITATION_STYLE_STORAGE_KEY, style)
  }, [])

  // Literaturnotiz erstellen
  const createLiteratureNote = useCallback(async (result: ZoteroSearchResult) => {
    if (!vaultPath) {
      console.error('[ZoteroSearch] Kein Vault geöffnet')
      return
    }

    // Hole Annotationen aus Zotero
    let annotations: string[] = []
    try {
      const notesData = await window.electronAPI.zoteroGetNotes(result.citekey)
      console.log('[ZoteroSearch] Notes data:', notesData)

      // Main-Prozess gibt bereits ein String-Array zurück
      if (Array.isArray(notesData)) {
        annotations = notesData.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      }
    } catch (err) {
      console.error('[ZoteroSearch] Fehler beim Laden der Annotationen:', err)
    }

    const content = generateLiteratureNoteWithAnnotations(result, annotations)
    const filename = generateLiteratureNoteFilename(result)

    // Erstelle Notiz im Literatur-Ordner
    const literaturePath = `${vaultPath}/Literatur`

    try {
      // Prüfe ob Ordner existiert, wenn nicht erstelle ihn
      await window.electronAPI.ensureDir(literaturePath)

      const filePath = `${literaturePath}/${filename}`
      const relativePath = `Literatur/${filename}`

      // Schreibe die Datei
      await window.electronAPI.writeFile(filePath, content)

      // Erstelle Note-Objekt und füge zum Store hinzu
      const newNote = await createNoteFromFile(filePath, relativePath, content)
      addNote(newNote)

      // Wähle die neue Notiz aus
      selectNoteInStore(newNote.id)
    } catch (err) {
      console.error('[ZoteroSearch] Fehler beim Erstellen der Literaturnotiz:', err)
    }

    onClose()
  }, [vaultPath, addNote, selectNoteInStore, onClose])

  // Aktion ausführen
  const handleSelect = useCallback((result: ZoteroSearchResult) => {
    switch (actionMode) {
      case 'citation':
        insertCitation(result)
        break
      case 'footnote':
        insertFootnote(result)
        break
      case 'note':
        createLiteratureNote(result)
        break
    }
  }, [actionMode, insertCitation, insertFootnote, createLiteratureNote])

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
          handleSelect(results[selectedIndex])
        }
        break
      case 'Tab':
        e.preventDefault()
        setActionMode(m => {
          if (m === 'citation') return 'footnote'
          if (m === 'footnote') return 'note'
          return 'citation'
        })
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [results, selectedIndex, handleSelect, onClose])

  // Scroll ausgewähltes Element in Sicht
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Klick außerhalb schließt
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  if (!isOpen) return null

  return (
    <div className="zotero-search-backdrop" onClick={handleBackdropClick}>
      <div className="zotero-search-modal">
        <div className="zotero-search-header">
          <div className="zotero-search-title">
            <span className="zotero-icon">📚</span>
            {t('zoteroSearch.title')}
          </div>
          <div className="zotero-action-toggle">
            <button
              className={`action-btn ${actionMode === 'citation' ? 'active' : ''}`}
              onClick={() => setActionMode('citation')}
            >
              {t('zoteroSearch.citation')}
            </button>
            <button
              className={`action-btn ${actionMode === 'footnote' ? 'active' : ''}`}
              onClick={() => setActionMode('footnote')}
            >
              {t('zoteroSearch.footnote')}
            </button>
            <button
              className={`action-btn ${actionMode === 'note' ? 'active' : ''}`}
              onClick={() => setActionMode('note')}
            >
              {t('zoteroSearch.note')}
            </button>
          </div>
        </div>

        <div className="zotero-search-input-wrapper">
          <svg className="zotero-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="zotero-search-input"
            placeholder={t('zoteroSearch.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={zoteroAvailable === false}
          />
          <span className="zotero-search-hint">{t('zoteroSearch.tabSwitchesMode')}</span>
        </div>

        <div className="zotero-style-row">
          <label className="zotero-style-label" htmlFor="zotero-citation-style">
            {t('zoteroSearch.citationStyle')}
          </label>
          <select
            id="zotero-citation-style"
            className="zotero-style-select"
            value={citationStyle}
            onChange={(e) => handleCitationStyleChange(e.target.value as CitationStyle)}
          >
            {citationStyles.map(option => (
              <option key={option.id} value={option.id}>
                {option.label} - {option.description}
              </option>
            ))}
          </select>
        </div>

        {zoteroAvailable === false && (
          <div className="zotero-error">
            <span className="error-icon">⚠️</span>
            <div>
              <strong>{t('zoteroSearch.notReachable')}</strong>
              <p>{t('zoteroSearch.notReachableHint')}</p>
            </div>
          </div>
        )}

        {zoteroAvailable === null && (
          <div className="zotero-loading">
            {t('zoteroSearch.connecting')}
          </div>
        )}

        {zoteroAvailable && (
          <div className="zotero-search-results" ref={resultsRef}>
            {isLoading ? (
              <div className="zotero-loading">{t('zoteroSearch.searching')}</div>
            ) : results.length === 0 && query ? (
              <div className="zotero-empty">
                {t('zoteroSearch.noResults')}
              </div>
            ) : results.length === 0 ? (
              <div className="zotero-empty">
                {t('zoteroSearch.enterSearchTerm')}
              </div>
            ) : (
              results.map((result, index) => (
                <div
                  key={result.citekey}
                  className={`zotero-result ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="zotero-result-type">
                    {result.item.itemType === 'book' && '📖'}
                    {result.item.itemType === 'journalArticle' && '📄'}
                    {result.item.itemType === 'conferencePaper' && '🎤'}
                    {result.item.itemType === 'thesis' && '🎓'}
                    {result.item.itemType === 'webpage' && '🌐'}
                    {!['book', 'journalArticle', 'conferencePaper', 'thesis', 'webpage'].includes(result.item.itemType) && '📑'}
                  </div>
                  <div className="zotero-result-content">
                    <div className="zotero-result-title">{result.item.title}</div>
                    <div className="zotero-result-meta">
                      <span className="zotero-result-authors">{formatAuthors(result.item)}</span>
                      <span className="zotero-result-year">{formatYear(result.item)}</span>
                      {result.item.publicationTitle && (
                        <span className="zotero-result-source">{result.item.publicationTitle}</span>
                      )}
                    </div>
                  </div>
                  <div className="zotero-result-citekey">
                    @{result.citekey}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="zotero-search-footer">
          <span>↑↓ {t('zoteroSearch.navigate')}</span>
          <span>↵ {actionMode === 'citation' ? t('zoteroSearch.insertCitation') : actionMode === 'footnote' ? t('zoteroSearch.insertFootnote') : t('zoteroSearch.createNote')}</span>
          <span>TAB {t('zoteroSearch.mode')}</span>
          <span>ESC {t('zoteroSearch.close')}</span>
        </div>
      </div>
    </div>
  )
}
