import React, { useEffect, useState, useRef, useMemo } from 'react'
import { EditorView } from '@codemirror/view'
import { useNotesStore } from '../../stores/notesStore'
import { extractParagraphs, generateBlockId, findNoteForWikilink } from '../../utils/linkExtractor'
import { useTranslation } from '../../utils/translations'
import { flattenFilePaths, type VaultFileKind } from '../../../shared/fileLinkTarget'
import { suggestLinkTargets } from '../../../shared/linkSuggestions'
import { FileKindIcon } from './FileKindIcon'

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
  /** Dateiart für das Symbol im Notiz-/Datei-Modus (ersetzt `icon`). */
  fileKind?: VaultFileKind | 'create'
  /** Nicht wählbar (z. B. Dateiname mit `#` oder `|`). */
  disabled?: boolean
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
  const { t } = useTranslation()
  const { notes, vaultPath, fileTree } = useNotesStore()
  // Alle Dateien des Vaults (nicht nur Notizen) — Grundlage für [[-Vorschläge auf PDFs, Bilder, Office.
  const allPaths = useMemo(() => flattenFilePaths(fileTree), [fileTree])
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
  // Gleicher Resolver wie beim Klick: voller Pfad zuerst — sonst bleiben Überschriften/Absätze
  // leer, sobald die Vervollständigung bei Namensdopplung einen Pfad eingefügt hat (Codex F22).
  const targetNoteData = useMemo(() => {
    if (!targetNote) return null
    return findNoteForWikilink(targetNote, notes)
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
      const { items: suggestions, exactMatch } = suggestLinkTargets(query, allPaths, notes)
      const matching: AutocompleteItem[] = suggestions.map(sg => ({
        id: sg.path,
        label: sg.label,
        sublabel: sg.target === null
          ? t('wikilink.unsupportedChars', { chars: (sg.blockedBy ?? []).join(' ') })
          : sg.path,
        icon: '',
        fileKind: sg.kind,
        disabled: sg.target === null,
        value: sg.target ?? ''
      }))

      // Neuanlage nur, wenn kein vorhandener Name exakt passt — auch kein PDF/Bild
      // gleichen Namens (Codex F25) — und nur hinter den Treffern, damit Enter nicht
      // versehentlich eine Notiz anlegt, wo eine Datei gemeint war.
      const typed = query.trim()
      const hasForeignExtension = /\.[a-z0-9]{1,5}$/i.test(typed) && !/\.md$/i.test(typed)
      if (typed && !exactMatch && !hasForeignExtension) {
        matching.push({
          id: '__create_new__',
          label: typed,
          sublabel: t('wikilink.createNewNote'),
          icon: '',
          fileKind: 'create',
          value: typed,
          createNewNote: true
        })
      }
      return matching
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
          sublabel: `H${h.level} (${t('wikilink.heading')})`,
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
  }, [mode, notes, allPaths, targetNoteData, targetNote, query, targetContent, t])

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
    if (item.disabled) return
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
      case 'note': return t('wikilink.notesAndFiles')
      case 'heading': return `${t('wikilink.headingsIn')} "${targetNote}"`
      case 'block': return `${t('wikilink.paragraphsIn')} "${targetNote}"`
      case 'tag': return t('wikilink.tags')
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
            {mode === 'note' && t('wikilink.noFilesFound')}
            {mode === 'heading' && t('wikilink.noHeadingsFound')}
            {mode === 'block' && t('wikilink.noParagraphsFound')}
            {mode === 'tag' && t('wikilink.noTagsFound')}
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={item.id}
              className={`wikilink-autocomplete-item ${index === selectedIndex ? 'selected' : ''} ${item.needsBlockId ? 'needs-id' : ''} ${item.createNewNote ? 'create-new' : ''} ${item.disabled ? 'disabled' : ''}`}
              aria-disabled={item.disabled || undefined}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className={`wikilink-autocomplete-icon ${item.needsBlockId ? 'new-id' : ''} ${item.createNewNote ? 'create-new' : ''}`}>
                {item.fileKind ? <FileKindIcon kind={item.fileKind} /> : item.icon}
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
        <span>{t('wikilink.navigate')}</span>
        <span>{t('wikilink.pressEnterToSelect')}</span>
        <span>{t('wikilink.pressEscToClose')}</span>
      </div>
    </div>
  )
}
