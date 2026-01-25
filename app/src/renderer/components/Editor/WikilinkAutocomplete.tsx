import React, { useEffect, useState, useRef, useMemo } from 'react'
import { EditorView } from '@codemirror/view'
import { useNotesStore } from '../../stores/notesStore'
import { extractParagraphs, generateBlockId } from '../../utils/linkExtractor'

export type AutocompleteMode = 'note' | 'heading' | 'block' | 'tag'

// Erweiterte Selection-Info für Block-Referenzen und neue Notizen
export interface BlockSelectionInfo {
  value: string           // Der fertige Wikilink-Wert
  needsBlockId: boolean   // Muss eine Block-ID generiert werden?
  targetNotePath?: string // Pfad zur Zieldatei
  targetLine?: number     // Zeilennummer für die Block-ID
  generatedId?: string    // Die generierte Block-ID
  createNewNote?: boolean // Soll eine neue Notiz erstellt werden?
  newNoteName?: string    // Name der neuen Notiz
}

export interface WikilinkAutocompleteProps {
  view: EditorView | null
  isOpen: boolean
  mode: AutocompleteMode
  targetNote: string | null  // Für heading/block: welche Notiz
  triggerPos: number         // Cursor-Position für Popup-Positionierung
  query: string              // Filter-Text
  onClose: () => void
  onSelect: (value: string, mode: AutocompleteMode, blockInfo?: BlockSelectionInfo) => void
}

interface AutocompleteItem {
  id: string
  label: string
  sublabel?: string
  icon: string
  value: string
  // Für Block-Items
  needsBlockId?: boolean
  targetLine?: number
  // Für neue Notizen
  createNewNote?: boolean
}

export const WikilinkAutocomplete: React.FC<WikilinkAutocompleteProps> = ({
  view,
  isOpen,
  mode,
  targetNote,
  triggerPos,
  query,
  onClose,
  onSelect
}) => {
  const { notes, vaultPath } = useNotesStore()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Position berechnen
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  // Content der Zieldatei für Block-Modus
  const [targetContent, setTargetContent] = useState<string | null>(null)

  useEffect(() => {
    if (!view || !isOpen) {
      setPosition(null)
      return
    }

    const coords = view.coordsAtPos(triggerPos)
    if (coords) {
      // Position unterhalb des Cursors
      setPosition({
        x: coords.left,
        y: coords.bottom + 4
      })
    }
  }, [view, isOpen, triggerPos])

  // Finde die Zielnotiz für heading/block Mode
  const targetNoteData = useMemo(() => {
    if (!targetNote) return null
    const normalizedTarget = targetNote.toLowerCase()
    return notes.find(n => {
      const titleLower = n.title.toLowerCase()
      const fileNameWithoutExt = n.path.split('/').pop()?.replace('.md', '').toLowerCase() || ''
      return titleLower === normalizedTarget || fileNameWithoutExt === normalizedTarget
    }) || null
  }, [targetNote, notes])

  // Lade Content der Zieldatei für Block-Modus
  useEffect(() => {
    if (mode !== 'block' || !targetNoteData || !vaultPath) {
      setTargetContent(null)
      return
    }

    const loadContent = async () => {
      try {
        const fullPath = `${vaultPath}/${targetNoteData.path}`
        const content = await window.electronAPI.readFile(fullPath)
        setTargetContent(content)
      } catch (error) {
        console.error('Fehler beim Laden der Zieldatei:', error)
        setTargetContent(null)
      }
    }

    loadContent()
  }, [mode, targetNoteData, vaultPath])

  // Items basierend auf Mode generieren
  const items = useMemo((): AutocompleteItem[] => {
    const queryLower = query.toLowerCase()

    if (mode === 'note') {
      const matchingNotes = notes
        .filter(n => {
          if (!queryLower) return true
          return n.title.toLowerCase().includes(queryLower) ||
                 n.path.toLowerCase().includes(queryLower)
        })
        .slice(0, 20)
        .map(n => ({
          id: n.id,
          label: n.title,
          sublabel: n.path,
          icon: '📄',
          value: n.title
        }))

      // Prüfe ob es einen exakten Treffer gibt (case-insensitive)
      const exactMatch = notes.some(n =>
        n.title.toLowerCase() === queryLower ||
        n.path.replace('.md', '').toLowerCase() === queryLower ||
        n.path.split('/').pop()?.replace('.md', '').toLowerCase() === queryLower
      )

      // Wenn Query vorhanden und kein exakter Treffer, zeige "Neue Notiz erstellen" Option
      if (query.trim() && !exactMatch) {
        const createItem: AutocompleteItem = {
          id: '__create_new__',
          label: query.trim(),
          sublabel: 'Neue Notiz erstellen',
          icon: '➕',
          value: query.trim(),
          createNewNote: true
        }
        // Füge "Erstellen" Option am Anfang ein
        return [createItem, ...matchingNotes]
      }

      return matchingNotes
    }

    if (mode === 'heading' && targetNoteData) {
      const headings = targetNoteData.headings || []
      return headings
        .filter(h => {
          if (!queryLower) return true
          return h.text.toLowerCase().includes(queryLower)
        })
        .map(h => ({
          id: `h-${h.line}`,
          label: h.text,
          sublabel: `H${h.level}`,
          icon: '#'.repeat(h.level),
          value: `${targetNote}#${h.text}`
        }))
    }

    if (mode === 'block' && targetNoteData && targetContent) {
      // Extrahiere alle Absätze aus dem Content
      const paragraphs = extractParagraphs(targetContent)

      return paragraphs
        .filter(p => {
          if (!queryLower) return true
          return p.content.toLowerCase().includes(queryLower) ||
                 (p.existingId && p.existingId.toLowerCase().includes(queryLower))
        })
        .slice(0, 30)  // Limitiere auf 30 Items
        .map(p => {
          if (p.existingId) {
            // Absatz hat bereits eine Block-ID
            return {
              id: `b-${p.existingId}`,
              label: p.content,
              sublabel: `^${p.existingId}`,
              icon: '^',
              value: `${targetNote}#^${p.existingId}`,
              needsBlockId: false,
              targetLine: p.line
            }
          } else {
            // Absatz braucht eine neue Block-ID
            return {
              id: `p-${p.line}`,
              label: p.content,
              sublabel: '+ neue ID',
              icon: '+',
              value: '', // Wird beim Select generiert
              needsBlockId: true,
              targetLine: p.line
            }
          }
        })
    }

    // Fallback: Zeige Headings wenn kein Content geladen
    if (mode === 'block' && targetNoteData && !targetContent) {
      const headings = targetNoteData.headings || []
      return headings
        .filter(h => {
          if (!queryLower) return true
          return h.text.toLowerCase().includes(queryLower)
        })
        .map(h => ({
          id: `h-${h.line}`,
          label: h.text,
          sublabel: `H${h.level} (Überschrift)`,
          icon: '#'.repeat(h.level),
          value: `${targetNote}#${h.text}`
        }))
    }

    // Tag-Modus: Sammle alle Tags aus allen Notizen
    if (mode === 'tag') {
      const allTags = new Map<string, number>() // tag -> count

      for (const note of notes) {
        if (note.tags) {
          for (const tag of note.tags) {
            allTags.set(tag, (allTags.get(tag) || 0) + 1)
          }
        }
      }

      // Sortiere nach Häufigkeit, dann alphabetisch
      const sortedTags = Array.from(allTags.entries())
        .sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1] // Häufigkeit absteigend
          return a[0].localeCompare(b[0]) // Alphabetisch
        })
        .filter(([tag]) => {
          if (!queryLower) return true
          return tag.toLowerCase().includes(queryLower)
        })
        .slice(0, 30)
        .map(([tag, count]) => ({
          id: `tag-${tag}`,
          label: tag,
          sublabel: `${count} Notiz${count !== 1 ? 'en' : ''}`,
          icon: '#',
          value: tag
        }))

      // Option zum Erstellen eines neuen Tags
      if (query.trim() && !allTags.has(query.trim())) {
        const createItem: AutocompleteItem = {
          id: '__create_tag__',
          label: query.trim(),
          sublabel: 'Neuen Tag erstellen',
          icon: '+',
          value: query.trim(),
          createNewNote: false // Missbrauche nicht, aber markiere als "neu"
        }
        return [createItem, ...sortedTags]
      }

      return sortedTags
    }

    return []
  }, [mode, notes, targetNoteData, targetNote, query, targetContent])

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0)
  }, [items.length, query])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Handle selection
  const handleSelect = (item: AutocompleteItem) => {
    if (item.createNewNote) {
      // Neue Notiz erstellen
      const blockInfo: BlockSelectionInfo = {
        value: item.value,
        needsBlockId: false,
        createNewNote: true,
        newNoteName: item.value
      }
      onSelect(item.value, mode, blockInfo)
    } else if (item.needsBlockId && targetNoteData) {
      // Generiere neue Block-ID
      const newBlockId = generateBlockId()
      const blockInfo: BlockSelectionInfo = {
        value: `${targetNote}#^${newBlockId}`,
        needsBlockId: true,
        targetNotePath: targetNoteData.path,
        targetLine: item.targetLine,
        generatedId: newBlockId
      }
      onSelect(blockInfo.value, mode, blockInfo)
    } else {
      onSelect(item.value, mode)
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          e.stopPropagation()
          setSelectedIndex(prev => Math.min(prev + 1, items.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          e.stopPropagation()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          e.stopPropagation()
          if (items[selectedIndex]) {
            handleSelect(items[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          onClose()
          break
        case 'Tab':
          e.preventDefault()
          e.stopPropagation()
          if (items[selectedIndex]) {
            handleSelect(items[selectedIndex])
          }
          break
      }
    }

    // Use capture phase to intercept before CodeMirror
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, items, selectedIndex, onClose, mode, targetNoteData, targetNote])

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen || !position) return null

  const getHeaderText = () => {
    switch (mode) {
      case 'note': return 'Notizen'
      case 'heading': return `Überschriften in "${targetNote}"`
      case 'block': return `Absätze in "${targetNote}"`
      case 'tag': return 'Tags'
    }
  }

  return (
    <div
      ref={containerRef}
      className="wikilink-autocomplete"
      style={{
        left: position.x,
        top: position.y
      }}
    >
      <div className="wikilink-autocomplete-header">
        {getHeaderText()}
      </div>

      <div className="wikilink-autocomplete-list" ref={listRef}>
        {items.length === 0 ? (
          <div className="wikilink-autocomplete-empty">
            {mode === 'note' && 'Keine Notizen gefunden'}
            {mode === 'heading' && 'Keine Überschriften gefunden'}
            {mode === 'block' && 'Keine Absätze gefunden'}
            {mode === 'tag' && 'Keine Tags gefunden'}
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={item.id}
              className={`wikilink-autocomplete-item ${index === selectedIndex ? 'selected' : ''} ${item.needsBlockId ? 'needs-id' : ''} ${item.createNewNote ? 'create-new' : ''}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className={`wikilink-autocomplete-icon ${item.needsBlockId ? 'new-id' : ''} ${item.createNewNote ? 'create-new' : ''}`}>
                {item.icon}
              </span>
              <span className="wikilink-autocomplete-label">{item.label}</span>
              {item.sublabel && (
                <span className={`wikilink-autocomplete-sublabel ${item.needsBlockId ? 'new-id' : ''} ${item.createNewNote ? 'create-new' : ''}`}>
                  {item.sublabel}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="wikilink-autocomplete-footer">
        <span>↑↓ navigieren</span>
        <span>↵ auswählen</span>
        <span>Esc schließen</span>
      </div>
    </div>
  )
}
