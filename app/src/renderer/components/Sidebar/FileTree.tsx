import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { FileEntry } from '../../../shared/types'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useUIStore, FOLDER_COLORS, FOLDER_ICONS, type IconSet } from '../../stores/uiStore'
import { useGraphStore } from '../../stores/graphStore'
import { useTabStore } from '../../stores/tabStore'
import { useBookmarkStore } from '../../stores/bookmarkStore'
import { useQuizStore } from '../../stores/quizStore'
import { generateNoteId, extractTasks } from '../../utils/linkExtractor'
import { useTranslation } from '../../utils/translations'
import { getNoteKind, getNoteKindFromText, NOTE_KINDS, setNoteKindInContent, stripNoteKindMarker, type NoteKindId } from '../../utils/noteKind'

const isMac = window.electronAPI.platform === 'darwin'
const NOTE_KIND_ORDER: NoteKindId[] = ['problem', 'solution', 'info']

type DisplayMode = 'name' | 'path'
type PdfDisplayMode = 'both' | 'companion-only' | 'pdf-only'
type NoteKindIndex = Map<string, NoteKindId>
type FileCustomizations = ReturnType<typeof useGraphStore.getState>['fileCustomizations']

interface FileTreeProps {
  entries: FileEntry[]
  level?: number
  onDrop?: (sourcePath: string, targetPath: string) => void
  displayMode?: DisplayMode
}

interface FileTreeInnerProps extends FileTreeProps {
  pdfCompanionEnabled: boolean
  pdfDisplayMode: PdfDisplayMode
  fileCustomizations: FileCustomizations
  showHiddenFolders: boolean
  noteKindIndex: NoteKindIndex
  activeKindSet: Set<NoteKindId>
  isKindFilterActive: boolean
  kindCounts: Record<NoteKindId, number>
  toggleFileTreeKindFilter?: (kindId: NoteKindId) => void
  showOnlyFileTreeKind?: (kindId: NoteKindId) => void
}

interface FileItemProps {
  entry: FileEntry
  level: number
  onDrop?: (sourcePath: string, targetPath: string) => void
  displayMode: DisplayMode
  noteKindIndex: NoteKindIndex
  activeKindSet: Set<NoteKindId>
  isKindFilterActive: boolean
  kindCounts: Record<NoteKindId, number>
  pdfCompanionEnabled: boolean
  pdfDisplayMode: PdfDisplayMode
  fileCustomizationsForTree: FileCustomizations
  showHiddenFoldersForTree: boolean
  toggleFileTreeKindFilter?: (kindId: NoteKindId) => void
  showOnlyFileTreeKind?: (kindId: NoteKindId) => void
}

interface ContextMenuState {
  x: number
  y: number
  entry: FileEntry
}

interface MoveDialogState {
  entry: FileEntry
  entries?: FileEntry[]  // Multi-select: alle zu verschiebenden Einträge
  selectedTargetPath: string | null
}

// SVG Icons
const ChevronIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    style={{
      transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.15s ease'
    }}
  >
    <path
      d="M4.5 2.5L8 6L4.5 9.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

// Hilfsfunktion um Farbe dunkler zu machen (für Stroke)
const darkenColor = (color: string): string => {
  // Wenn es ein Hex-Code ist, verdunkeln
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 30)
    const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 30)
    const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 30)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }
  return color
}

const buildNoteKindIndex = (notes: ReturnType<typeof useNotesStore.getState>['notes']): NoteKindIndex => {
  const index: NoteKindIndex = new Map()
  notes.forEach(note => {
    const kind = getNoteKind(note)
    if (kind) index.set(note.path, kind.id)
  })
  return index
}

const countNoteKinds = (index: NoteKindIndex): Record<NoteKindId, number> => {
  const counts: Record<NoteKindId, number> = { problem: 0, solution: 0, info: 0 }
  index.forEach(kindId => {
    counts[kindId]++
  })
  return counts
}

interface FolderIconProps {
  open: boolean
  color?: string
  iconSet?: IconSet
}

const FolderIcon: React.FC<FolderIconProps> = ({ open, color = '#F5A623', iconSet = 'default' }) => {
  const strokeColor = darkenColor(color)

  // Emoji Icon Set
  if (iconSet === 'emoji') {
    return <span style={{ fontSize: '14px', lineHeight: 1 }}>{open ? '📂' : '📁'}</span>
  }

  // Minimal Icon Set (Umriss)
  if (iconSet === 'minimal') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M2 4.5C2 3.67 2.67 3 3.5 3H6.17C6.7 3 7.2 3.21 7.59 3.59L8.41 4.41C8.8 4.79 9.3 5 9.83 5H12.5C13.33 5 14 5.67 14 6.5V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
        />
      </svg>
    )
  }

  // Colorful Icon Set (Gradient)
  if (iconSet === 'colorful') {
    const gradientId = `folder-gradient-${color.replace('#', '')}`
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={strokeColor} />
          </linearGradient>
        </defs>
        <path
          d="M2 4.5C2 3.67 2.67 3 3.5 3H6.17C6.7 3 7.2 3.21 7.59 3.59L8.41 4.41C8.8 4.79 9.3 5 9.83 5H12.5C13.33 5 14 5.67 14 6.5V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z"
          fill={`url(#${gradientId})`}
          stroke={strokeColor}
          strokeWidth="0.5"
        />
      </svg>
    )
  }

  // Default Icon Set
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 4.5C2 3.67 2.67 3 3.5 3H6.17C6.7 3 7.2 3.21 7.59 3.59L8.41 4.41C8.8 4.79 9.3 5 9.83 5H12.5C13.33 5 14 5.67 14 6.5V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z"
        fill={color}
        stroke={strokeColor}
        strokeWidth="0.5"
      />
    </svg>
  )
}

const FileIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M4 2C3.45 2 3 2.45 3 3V13C3 13.55 3.45 14 4 14H12C12.55 14 13 13.55 13 13V5.41C13 5.15 12.89 4.9 12.71 4.71L10.29 2.29C10.1 2.11 9.85 2 9.59 2H4Z"
      fill="var(--bg-tertiary)"
      stroke="var(--border-color)"
      strokeWidth="0.5"
    />
    <path
      d="M5 7H11M5 9H11M5 11H9"
      stroke="var(--text-muted)"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
)

const PdfIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M4 2C3.45 2 3 2.45 3 3V13C3 13.55 3.45 14 4 14H12C12.55 14 13 13.55 13 13V5.41C13 5.15 12.89 4.9 12.71 4.71L10.29 2.29C10.1 2.11 9.85 2 9.59 2H4Z"
      fill="#ffebee"
      stroke="#e53935"
      strokeWidth="0.5"
    />
    <text x="8" y="11" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#e53935">PDF</text>
  </svg>
)

const ImageIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="3" width="12" height="10" rx="1" fill="#e3f2fd" stroke="#1976d2" strokeWidth="0.5"/>
    <circle cx="5.5" cy="6.5" r="1.5" fill="#1976d2"/>
    <path d="M2 11L5 8L7 10L10 6L14 11V12C14 12.55 13.55 13 13 13H3C2.45 13 2 12.55 2 12V11Z" fill="#1976d2" fillOpacity="0.5"/>
  </svg>
)

const ExcelIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M4 2C3.45 2 3 2.45 3 3V13C3 13.55 3.45 14 4 14H12C12.55 14 13 13.55 13 13V5.41C13 5.15 12.89 4.9 12.71 4.71L10.29 2.29C10.1 2.11 9.85 2 9.59 2H4Z" fill="#e8f5e9" stroke="#2e7d32" strokeWidth="0.5"/>
    <text x="8" y="11" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#2e7d32">XLS</text>
  </svg>
)

const WordIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M4 2C3.45 2 3 2.45 3 3V13C3 13.55 3.45 14 4 14H12C12.55 14 13 13.55 13 13V5.41C13 5.15 12.89 4.9 12.71 4.71L10.29 2.29C10.1 2.11 9.85 2 9.59 2H4Z" fill="#e3f2fd" stroke="#1565c0" strokeWidth="0.5"/>
    <text x="8" y="11" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#1565c0">DOC</text>
  </svg>
)

const PowerPointIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M4 2C3.45 2 3 2.45 3 3V13C3 13.55 3.45 14 4 14H12C12.55 14 13 13.55 13 13V5.41C13 5.15 12.89 4.9 12.71 4.71L10.29 2.29C10.1 2.11 9.85 2 9.59 2H4Z" fill="#fff3e0" stroke="#e65100" strokeWidth="0.5"/>
    <text x="8" y="11" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#e65100">PPT</text>
  </svg>
)

const FileItem: React.FC<FileItemProps> = ({
  entry,
  level,
  onDrop,
  displayMode,
  noteKindIndex,
  activeKindSet,
  isKindFilterActive,
  kindCounts,
  pdfCompanionEnabled,
  pdfDisplayMode,
  fileCustomizationsForTree,
  showHiddenFoldersForTree,
  toggleFileTreeKindFilter,
  showOnlyFileTreeKind
}) => {
  const { t } = useTranslation()
  // Ordner standardmäßig ZU für schnellstes initiales Rendering
  const [isOpen, setIsOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [newNoteDialog, setNewNoteDialog] = useState<{ folderPath: string } | null>(null)
  const [newNoteName, setNewNoteName] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [pickerDialog, setPickerDialog] = useState<{ type: 'color' | 'icon'; path: string } | null>(null)
  const [moveDialog, setMoveDialog] = useState<MoveDialogState | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [menuReady, setMenuReady] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | null>(null)

  // Click-outside Handler für Kontextmenü
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
        setMenuReady(false)
        setMenuMaxHeight(null)
      }
    }

    // Verzögerung damit der Klick der das Menü öffnet nicht sofort schließt
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 10)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [contextMenu])

  // Menü-Position nach Rendern berechnen (synchron vor dem Paint)
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return

    const menu = contextMenuRef.current
    const rect = menu.getBoundingClientRect()
    const padding = 12
    const titleBarHeight = 52
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth

    let x = contextMenu.x
    let y = contextMenu.y
    let maxHeight: number | null = null

    // Rechter Rand - Menü nach links verschieben
    if (x + rect.width + padding > viewportWidth) {
      x = viewportWidth - rect.width - padding
    }

    // Berechne verfügbare Höhe
    const availableHeight = viewportHeight - titleBarHeight - padding * 2

    // Wenn Menü höher als verfügbarer Platz, max-height setzen und scrollbar machen
    if (rect.height > availableHeight) {
      maxHeight = availableHeight
      y = titleBarHeight + padding
    } else if (y + rect.height + padding > viewportHeight) {
      // Menü nach oben verschieben damit es komplett sichtbar ist
      y = viewportHeight - rect.height - padding
    }

    // Mindestens am oberen/linken Rand (nicht über Titlebar)
    x = Math.max(padding, x)
    y = Math.max(titleBarHeight + padding, y)

    setMenuMaxHeight(maxHeight)
    setMenuPosition({ x, y })
    setMenuReady(true)
  }, [contextMenu])

  const { selectedNoteId, secondarySelectedNoteId, selectedPdfPath, selectedImagePath, selectedOfficePath, selectNote, selectSecondaryNote, selectPdf, selectImage, selectOffice, removeNote, setFileTree, vaultPath, notes, addNote, updateNotePath, fileTree, selectedPaths, togglePathSelection, clearSelection } = useNotesStore()
  const { iconSet, setTextSplitEnabled, flashcardsEnabled, setViewMode, setCanvasFilterPath, taskExcludedFolders, toggleTaskExcludedFolder } = useUIStore()
  const updateNote = useNotesStore(state => state.updateNote)
  const { fileCustomizations, setFileCustomization, removeFileCustomization, toggleFolderHidden, toggleFolderPinned, showHiddenFolders } = useGraphStore()
  const { openCanvasTab, openCodeTab } = useTabStore()
  const { isBookmarked, toggleBookmark } = useBookmarkStore()

  const isPdf = entry.fileType === 'pdf'
  const isImage = entry.fileType === 'image'
  const isExcel = entry.fileType === 'excel'
  const isWord = entry.fileType === 'word'
  const isPowerPoint = entry.fileType === 'powerpoint'
  const isCode = entry.fileType === 'code'
  const isOffice = isExcel || isWord || isPowerPoint
  const officeType: 'excel' | 'word' | 'powerpoint' | null = isExcel ? 'excel' : isWord ? 'word' : isPowerPoint ? 'powerpoint' : null
  const noteId = generateNoteId(entry.path)
  const isMultiSelected = selectedPaths.has(entry.path)
  const isSelected = isMultiSelected || (isPdf
    ? selectedPdfPath === entry.path
    : isImage
      ? selectedImagePath === entry.path
      : isOffice
        ? selectedOfficePath === entry.path
        : selectedNoteId === noteId)
  const isSecondarySelected = !entry.isDirectory && !isPdf && !isImage && !isOffice && secondarySelectedNoteId === noteId

  // Finde die Notiz um Link-Count zu zeigen
  const note = notes.find(n => n.id === noteId)
  const linkCount = note ? note.outgoingLinks.filter(l => !/\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?)$/i.test(l)).length : 0

  // Bookmark Status (nur für Markdown-Notizen)
  const noteIsBookmarked = !entry.isDirectory && !isPdf && !isImage && !isOffice && isBookmarked(noteId)

  // Hole Customization für diesen Eintrag (nur für Ordner)
  const customization = entry.isDirectory ? fileCustomizations[entry.path] : undefined
  const folderColor = customization?.color
  const folderIcon = customization?.icon
  const isFolderHidden = entry.isDirectory && customization?.hidden === true
  const isFolderPinned = entry.isDirectory && customization?.pinned === true
  const hasCustomization = folderColor || folderIcon

  // Display-Name basierend auf displayMode
  const getDisplayName = () => {
    if (entry.isDirectory) {
      // Ordner: immer nur den Ordnernamen anzeigen
      return entry.name
    }
    // Für Bilder und Office-Dateien: vollständigen Namen mit Endung anzeigen
    if (isImage || isOffice) {
      if (displayMode === 'path') {
        return entry.path
      }
      return entry.name
    }
    const extension = isPdf ? '.pdf' : '.md'
    if (displayMode === 'path') {
      // Voller Pfad ohne Endung
      return entry.path.replace(extension, '')
    }
    // Nur Dateiname ohne Endung
    return entry.name.replace(extension, '')
  }
  const displayName = getDisplayName()
  const indexedKindId = noteKindIndex.get(entry.path)
  const noteKind = !entry.isDirectory && !isPdf && !isImage && !isOffice
    ? (indexedKindId ? NOTE_KINDS[indexedKindId] : getNoteKindFromText(displayName) || getNoteKindFromText(entry.path))
    : null
  const visibleDisplayName = noteKind ? stripNoteKindMarker(displayName) : displayName

  // Ermittle die Dateiendung für Nicht-Verzeichnisse
  // Spezialfall: PDF Companion Dateien haben .pdf.md Endung
  const getFileExtension = () => {
    if (entry.isDirectory) return ''
    // PDF Companion Dateien (.pdf.md) speziell behandeln
    if (entry.name.endsWith('.pdf.md')) return '.pdf.md'
    const lastDot = entry.name.lastIndexOf('.')
    return lastDot > 0 ? entry.name.substring(lastDot) : ''
  }
  const fileExtension = getFileExtension()

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      // Select text without extension
      const name = entry.isDirectory ? entry.name : entry.name.replace(fileExtension, '')
      inputRef.current.setSelectionRange(0, name.length)
    }
  }, [isEditing, entry.name, entry.isDirectory, fileExtension])

  const handleClick = (e: React.MouseEvent) => {
    if (isEditing) return

    // Shift+Click: Multi-Select Toggle (für nicht-Ordner)
    if (e.shiftKey && !entry.isDirectory) {
      e.preventDefault()
      togglePathSelection(entry.path)
      return
    }

    // Normaler Klick: Multi-Select aufheben
    if (selectedPaths.size > 0) {
      clearSelection()
    }

    // Cmd/Ctrl+Click: Split-View (Secondary Note)
    if ((e.metaKey || e.ctrlKey) && !entry.isDirectory && !isPdf && !isImage && !isOffice) {
      e.preventDefault()
      setTextSplitEnabled(true)
      selectSecondaryNote(noteId)
      return
    }

    if (entry.isDirectory) {
      setIsOpen(!isOpen)
    } else if (isPdf) {
      selectPdf(entry.path)
    } else if (isImage) {
      selectImage(entry.path)
    } else if (isOffice && officeType) {
      selectOffice(entry.path, officeType)
    } else if (isCode) {
      openCodeTab(entry.path, entry.name)
    } else {
      selectNote(noteId)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    startEditing()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'F2' && isSelected && !isEditing) {
      e.preventDefault()
      startEditing()
    }
  }

  const startEditing = () => {
    const name = entry.isDirectory ? entry.name : entry.name.replace(fileExtension, '')
    setEditName(name)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditName('')
  }

  const handleRename = useCallback(async () => {
    if (!vaultPath || !editName.trim()) {
      cancelEditing()
      return
    }

    const newName = entry.isDirectory ? editName.trim() : `${editName.trim()}${fileExtension}`
    if (newName === entry.name) {
      cancelEditing()
      return
    }

    const oldPath = `${vaultPath}/${entry.path}`
    const parentPath = entry.path.includes('/')
      ? entry.path.substring(0, entry.path.lastIndexOf('/'))
      : ''
    const newRelativePath = parentPath ? `${parentPath}/${newName}` : newName
    const newFullPath = `${vaultPath}/${newRelativePath}`

    try {
      const result = await window.electronAPI.renameFile(oldPath, newFullPath)
      if (result.success) {
        // Update note path in store if it's a file
        if (!entry.isDirectory) {
          const oldNoteId = generateNoteId(entry.path)
          const newNoteId = generateNoteId(newRelativePath)
          updateNotePath(oldNoteId, newRelativePath, newNoteId)
        }

        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)
      }
    } catch (error) {
      console.error('Fehler beim Umbenennen:', error)
    }

    cancelEditing()
  }, [vaultPath, editName, entry, setFileTree, updateNotePath])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    // Bei Multi-Select: rechts geklicktes Item zur Selektion hinzufügen falls nötig
    if (selectedPaths.size > 0 && !selectedPaths.has(entry.path)) {
      // Rechtsklick außerhalb der Selektion → Selektion aufheben
      clearSelection()
    }
    setMenuReady(false)
    setMenuMaxHeight(null)
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }

  const handleDelete = useCallback(async () => {
    if (!contextMenu || !vaultPath) return

    // Multi-Select: Mehrere Dateien löschen
    if (selectedPaths.size > 1 && selectedPaths.has(contextMenu.entry.path)) {
      const paths = Array.from(selectedPaths).map(p => `${vaultPath}/${p}`)
      try {
        const result = await window.electronAPI.deleteFiles(paths)
        if (result.deleted > 0) {
          for (const p of selectedPaths) {
            removeNote(generateNoteId(p))
          }
          clearSelection()
          const tree = await window.electronAPI.readDirectory(vaultPath)
          setFileTree(tree)
        }
      } catch (error) {
        console.error('Fehler beim Batch-Löschen:', error)
      }
      setContextMenu(null)
      return
    }

    // Single Delete
    const fullPath = `${vaultPath}/${contextMenu.entry.path}`

    try {
      const deleted = await window.electronAPI.deleteFile(fullPath)
      if (deleted) {
        const noteId = generateNoteId(contextMenu.entry.path)
        removeNote(noteId)

        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)
      }
    } catch (error) {
      console.error('Fehler beim Löschen:', error)
    }

    setContextMenu(null)
  }, [contextMenu, vaultPath, removeNote, setFileTree, selectedPaths, clearSelection])

  const handleCreateSubfolder = useCallback(async () => {
    if (!contextMenu || !vaultPath || !contextMenu.entry.isDirectory) return

    const basePath = `${vaultPath}/${contextMenu.entry.path}`
    try {
      const folderPath = await window.electronAPI.promptNewFolder(basePath)
      if (folderPath) {
        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)
      }
    } catch (error) {
      console.error('Fehler beim Erstellen des Unterordners:', error)
    }

    setContextMenu(null)
  }, [contextMenu, vaultPath, setFileTree])

  const handleDeleteFolder = useCallback(async () => {
    if (!contextMenu || !vaultPath || !contextMenu.entry.isDirectory) return

    const fullPath = `${vaultPath}/${contextMenu.entry.path}`

    try {
      const deleted = await window.electronAPI.deleteDirectory(fullPath)
      if (deleted) {
        // Alle Notizen aus diesem Ordner entfernen
        const notesToRemove = notes.filter(n =>
          n.path.startsWith(contextMenu.entry.path + '/') || n.path === contextMenu.entry.path
        )
        notesToRemove.forEach(n => removeNote(n.id))

        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)
      }
    } catch (error) {
      console.error('Fehler beim Löschen des Ordners:', error)
    }

    setContextMenu(null)
  }, [contextMenu, vaultPath, notes, removeNote, setFileTree])

  const handleStripWikilinks = useCallback(async () => {
    if (!contextMenu || !vaultPath || !contextMenu.entry.isDirectory) return

    const fullPath = `${vaultPath}/${contextMenu.entry.path}`

    try {
      const result = await window.electronAPI.stripWikilinksInFolder(fullPath, vaultPath)
      if (result.success) {
        // Dateibaum neu laden um Änderungen anzuzeigen
        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)
      }
    } catch (error) {
      console.error('Fehler beim Entfernen der Wikilinks:', error)
    }

    setContextMenu(null)
  }, [contextMenu, vaultPath, setFileTree])

  // Quiz starten
  const { startQuiz } = useQuizStore()
  const { ollama } = useUIStore()

  const handleStartQuiz = useCallback((questionCount: number) => {
    if (!contextMenu) return

    const sourceType = contextMenu.entry.isDirectory ? 'folder' : 'file'
    const sourcePath = contextMenu.entry.path

    startQuiz(sourceType, sourcePath, questionCount)
    setContextMenu(null)
  }, [contextMenu, startQuiz])

  const handleCreateNoteInFolder = useCallback(() => {
    if (!contextMenu || !vaultPath || !contextMenu.entry.isDirectory) return

    const folderPath = `${vaultPath}/${contextMenu.entry.path}`
    setNewNoteDialog({ folderPath })
    setNewNoteName('')
    setContextMenu(null)
  }, [contextMenu, vaultPath])

  const handleSubmitNewNote = useCallback(async () => {
    if (!newNoteDialog || !newNoteName.trim() || !vaultPath) return

    const name = newNoteName.trim()
    const fileName = name.endsWith('.md') ? name : `${name}.md`
    const filePath = `${newNoteDialog.folderPath}/${fileName}`
    try {
      const title = fileName.replace(/\.md$/i, '')
      const content = `# ${title}\n\n`
      await window.electronAPI.writeFile(filePath, content)
      const tree = await window.electronAPI.readDirectory(vaultPath)
      setFileTree(tree)
      const relativePath = filePath.replace(`${vaultPath}/`, '')
      const note = await createNoteFromFile(filePath, relativePath, content)
      addNote(note)
      selectNote(note.id)
    } catch (error) {
      console.error('Fehler beim Erstellen der Notiz:', error)
    }

    setNewNoteDialog(null)
    setNewNoteName('')
  }, [newNoteDialog, newNoteName, vaultPath, setFileTree, addNote, selectNote])

  const handleDuplicate = useCallback(async () => {
    if (!contextMenu || !vaultPath) return

    const fullPath = `${vaultPath}/${contextMenu.entry.path}`

    try {
      const result = await window.electronAPI.duplicateFile(fullPath)
      if (result.success) {
        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)
      }
    } catch (error) {
      console.error('Fehler beim Duplizieren:', error)
    }

    setContextMenu(null)
  }, [contextMenu, vaultPath, setFileTree])

  const handleShowInFinder = useCallback(async () => {
    if (!contextMenu || !vaultPath) return

    const fullPath = `${vaultPath}/${contextMenu.entry.path}`
    await window.electronAPI.showInFolder(fullPath)
    setContextMenu(null)
  }, [contextMenu, vaultPath])

  const handleOpenInVSCode = useCallback(async () => {
    if (!contextMenu || !vaultPath) return
    const fullPath = `${vaultPath}/${contextMenu.entry.path}`
    await window.electronAPI.openInVSCode(fullPath)
    setContextMenu(null)
  }, [contextMenu, vaultPath])

  // Pfad in Zwischenablage kopieren
  const handleCopyRelativePath = useCallback(() => {
    if (!contextMenu) return
    navigator.clipboard.writeText(contextMenu.entry.path)
    setContextMenu(null)
  }, [contextMenu])

  const handleCopyAbsolutePath = useCallback(() => {
    if (!contextMenu || !vaultPath) return
    const fullPath = `${vaultPath}/${contextMenu.entry.path}`
    navigator.clipboard.writeText(fullPath)
    setContextMenu(null)
  }, [contextMenu, vaultPath])

  const handleRenameFromMenu = useCallback(() => {
    setContextMenu(null)
    startEditing()
  }, [])

  // Open note in local canvas tab
  const handleOpenInCanvas = useCallback(() => {
    if (!contextMenu || contextMenu.entry.isDirectory || isPdf || isImage) return
    const noteId = generateNoteId(contextMenu.entry.path)
    const note = notes.find(n => n.id === noteId)
    const title = note?.title || contextMenu.entry.name.replace('.md', '')
    openCanvasTab(noteId, title)
    setContextMenu(null)
  }, [contextMenu, isPdf, isImage, openCanvasTab])

  // Toggle bookmark
  const handleToggleBookmark = useCallback(() => {
    if (!contextMenu || contextMenu.entry.isDirectory || isPdf || isImage) return
    const noteId = generateNoteId(contextMenu.entry.path)
    toggleBookmark(noteId)
    setContextMenu(null)
  }, [contextMenu, isPdf, isImage, toggleBookmark])

  const handleSetNoteKind = useCallback(async (kindId: NoteKindId) => {
    if (!contextMenu || contextMenu.entry.isDirectory || !vaultPath) return

    const targetNoteId = generateNoteId(contextMenu.entry.path)
    const existingNote = notes.find(n => n.id === targetNoteId)
    const fullPath = `${vaultPath}/${contextMenu.entry.path}`

    try {
      const content = existingNote?.content || await window.electronAPI.readFile(fullPath)
      const nextContent = setNoteKindInContent(content, kindId)
      await window.electronAPI.writeFile(fullPath, nextContent)
      updateNote(targetNoteId, {
        content: nextContent,
        title: existingNote?.title || contextMenu.entry.name.replace(/\.md$/, ''),
        modifiedAt: new Date()
      })
    } catch (error) {
      console.error('Fehler beim Ändern der Notizfarbe:', error)
    }

    setContextMenu(null)
  }, [contextMenu, vaultPath, notes, updateNote])

  // Folder Customization Handlers
  const handleSetFolderColor = useCallback((colorId: string, path: string) => {
    console.log('[FileTree] handleSetFolderColor called:', colorId, path)
    const colorInfo = FOLDER_COLORS.find(c => c.id === colorId)
    if (colorInfo && colorId !== 'default') {
      setFileCustomization(path, { color: colorInfo.color })
    } else {
      const existing = fileCustomizations[path]
      if (existing?.icon) {
        setFileCustomization(path, { color: undefined, icon: existing.icon })
      } else {
        removeFileCustomization(path)
      }
    }
    setPickerDialog(null)
  }, [fileCustomizations, setFileCustomization, removeFileCustomization])

  const handleSetFolderIcon = useCallback((iconId: string, path: string) => {
    console.log('[FileTree] handleSetFolderIcon called:', iconId, path)
    const iconInfo = FOLDER_ICONS.find(i => i.id === iconId)
    if (iconInfo && iconId !== 'default') {
      setFileCustomization(path, { icon: iconInfo.emoji })
    } else {
      const existing = fileCustomizations[path]
      if (existing?.color) {
        setFileCustomization(path, { color: existing.color, icon: undefined })
      } else {
        removeFileCustomization(path)
      }
    }
    setPickerDialog(null)
  }, [fileCustomizations, setFileCustomization, removeFileCustomization])

  const handleRemoveCustomization = useCallback(() => {
    if (!contextMenu || !contextMenu.entry.isDirectory) return
    removeFileCustomization(contextMenu.entry.path)
    setContextMenu(null)
  }, [contextMenu, removeFileCustomization])

  const handleToggleFolderHidden = useCallback(() => {
    if (!contextMenu || !contextMenu.entry.isDirectory) return
    toggleFolderHidden(contextMenu.entry.path)
    setContextMenu(null)
  }, [contextMenu, toggleFolderHidden])

  const handleToggleFolderPinned = useCallback(() => {
    if (!contextMenu || !contextMenu.entry.isDirectory) return
    toggleFolderPinned(contextMenu.entry.path)
    setContextMenu(null)
  }, [contextMenu, toggleFolderPinned])

  const isFolderTaskExcluded = contextMenu?.entry.isDirectory && taskExcludedFolders.some(f => contextMenu.entry.path === f || contextMenu.entry.path.startsWith(f + '/'))

  const handleToggleTaskExcluded = useCallback(() => {
    if (!contextMenu || !contextMenu.entry.isDirectory) return
    toggleTaskExcludedFolder(contextMenu.entry.path)
    setContextMenu(null)
  }, [contextMenu, toggleTaskExcludedFolder])

  // Show folder in canvas view
  const handleShowFolderInCanvas = useCallback(() => {
    if (!contextMenu || !contextMenu.entry.isDirectory) return
    setCanvasFilterPath(contextMenu.entry.path)
    setViewMode('canvas')
    setContextMenu(null)
  }, [contextMenu, setCanvasFilterPath, setViewMode])

  // Apple Reminders aus Tasks erstellen
  const [reminderCreating, setReminderCreating] = useState(false)
  const handleCreateAppleReminders = useCallback(async () => {
    if (!contextMenu || !vaultPath || contextMenu.entry.isDirectory || reminderCreating) return

    const fullPath = `${vaultPath}/${contextMenu.entry.path}`
    setReminderCreating(true)
    setContextMenu(null)

    try {
      const content = await window.electronAPI.readFile(fullPath)
      const { tasks } = extractTasks(content)
      const tasksWithDate = tasks.filter(t => !t.completed && t.dueDate)

      if (tasksWithDate.length === 0) {
        await window.electronAPI.showNotification(
          'Apple Reminders',
          t('appleReminders.noTasks')
        )
        setReminderCreating(false)
        return
      }

      let created = 0
      const noteTitle = contextMenu.entry.name.replace('.md', '')

      for (const task of tasksWithDate) {
        const dueDate = task.dueDate!
        const dateStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`
        const hasTime = dueDate.getHours() !== 0 || dueDate.getMinutes() !== 0
        const timeStr = hasTime ? `${String(dueDate.getHours()).padStart(2, '0')}:${String(dueDate.getMinutes()).padStart(2, '0')}` : undefined

        const result = await window.electronAPI.createAppleReminder({
          title: task.text.substring(0, 200),
          notes: noteTitle,
          dueDate: dateStr,
          dueTime: timeStr
        })
        if (result.success) created++
      }

      await window.electronAPI.showNotification(
        'Apple Reminders',
        t('appleReminders.createdCount').replace('{count}', String(created))
      )
    } catch (error) {
      console.error('[Reminders] Failed:', error)
    }

    setReminderCreating(false)
  }, [contextMenu, vaultPath, reminderCreating, t])

  // Collect all folders from file tree
  const collectFolders = useCallback((entries: FileEntry[], parentPath: string = ''): Array<{ path: string; name: string; depth: number }> => {
    const folders: Array<{ path: string; name: string; depth: number }> = []
    const depth = parentPath ? parentPath.split('/').length : 0

    for (const entry of entries) {
      if (entry.isDirectory) {
        folders.push({ path: entry.path, name: entry.name, depth })
        if (entry.children) {
          folders.push(...collectFolders(entry.children, entry.path))
        }
      }
    }
    return folders
  }, [])

  // Open move dialog (single or multi-select)
  const handleOpenMoveDialog = useCallback(() => {
    if (!contextMenu) return
    // Multi-Select: Mehrere Dateien verschieben
    if (selectedPaths.size > 1 && selectedPaths.has(contextMenu.entry.path)) {
      const allEntries: FileEntry[] = []
      const collectEntries = (entries: FileEntry[]) => {
        for (const e of entries) {
          if (selectedPaths.has(e.path)) allEntries.push(e)
          if (e.children) collectEntries(e.children)
        }
      }
      if (fileTree) collectEntries(fileTree)
      setMoveDialog({ entry: contextMenu.entry, entries: allEntries, selectedTargetPath: null })
    } else {
      setMoveDialog({ entry: contextMenu.entry, selectedTargetPath: null })
    }
    setContextMenu(null)
  }, [contextMenu, selectedPaths, fileTree])

  // Select target folder (doesn't move yet)
  const handleSelectTargetFolder = useCallback((targetFolderPath: string) => {
    if (!moveDialog) return
    setMoveDialog({ ...moveDialog, selectedTargetPath: targetFolderPath })
  }, [moveDialog])

  // Execute move (single or multi)
  const handleExecuteMove = useCallback(async () => {
    if (!moveDialog || moveDialog.selectedTargetPath === null || !vaultPath) return

    const targetFolderPath = moveDialog.selectedTargetPath
    const targetDir = targetFolderPath === '' ? vaultPath : `${vaultPath}/${targetFolderPath}`
    const entriesToMove = moveDialog.entries || [moveDialog.entry]

    try {
      for (const entry of entriesToMove) {
        const sourceFullPath = `${vaultPath}/${entry.path}`

        // Don't move to same location
        const currentDir = entry.path.includes('/')
          ? entry.path.substring(0, entry.path.lastIndexOf('/'))
          : ''
        if (currentDir === targetFolderPath) continue

        // Prevent moving folder into itself or its children
        if (entry.isDirectory && targetFolderPath.startsWith(entry.path + '/')) continue

        const result = await window.electronAPI.moveFile(sourceFullPath, targetDir)
        if (result.success) {
          const fileName = entry.name
          const newPath = targetFolderPath === '' ? fileName : `${targetFolderPath}/${fileName}`

          if (!entry.isDirectory && entry.path.endsWith('.md')) {
            const oldNoteId = generateNoteId(entry.path)
            const newNoteId = generateNoteId(newPath)
            updateNotePath(oldNoteId, newPath, newNoteId)
          }
        }
      }

      const tree = await window.electronAPI.readDirectory(vaultPath)
      setFileTree(tree)
      clearSelection()
    } catch (error) {
      console.error('Fehler beim Verschieben:', error)
    }

    setMoveDialog(null)
  }, [moveDialog, vaultPath, setFileTree, updateNotePath, clearSelection])

  const openPickerDialog = useCallback((type: 'color' | 'icon') => {
    if (!contextMenu || !contextMenu.entry.isDirectory) return
    setPickerDialog({ type, path: contextMenu.entry.path })
    setContextMenu(null)
  }, [contextMenu])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu()
      window.addEventListener('click', handleClick)
      return () => window.removeEventListener('click', handleClick)
    }
  }, [contextMenu, closeContextMenu])

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', entry.path)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!entry.isDirectory) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDropOnFolder = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    if (!entry.isDirectory || !vaultPath) return

    const sourcePath = e.dataTransfer.getData('text/plain')
    if (!sourcePath || sourcePath === entry.path) return

    // Prevent dropping parent into child
    if (entry.path.startsWith(sourcePath + '/')) return

    const sourceFullPath = `${vaultPath}/${sourcePath}`
    const targetDir = `${vaultPath}/${entry.path}`

    try {
      const result = await window.electronAPI.moveFile(sourceFullPath, targetDir)
      if (result.success) {
        // Update note paths if needed
        const sourceIsFile = sourcePath.endsWith('.md')
        if (sourceIsFile) {
          const fileName = sourcePath.split('/').pop() || ''
          const newPath = `${entry.path}/${fileName}`
          const oldNoteId = generateNoteId(sourcePath)
          const newNoteId = generateNoteId(newPath)
          updateNotePath(oldNoteId, newPath, newNoteId)
        }

        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)

        // Expand folder after drop
        setIsOpen(true)
      }
    } catch (error) {
      console.error('Fehler beim Verschieben:', error)
    }
  }, [entry, vaultPath, setFileTree, updateNotePath])

  const paddingLeft = level * 12 + 8

  return (
    <div className="file-item">
      <div
        ref={rowRef}
        className={`file-item-row ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${isSecondarySelected ? 'secondary-selected' : ''} ${isDragOver ? 'drag-over' : ''} ${isFolderHidden && showHiddenFolders ? 'file-item-hidden' : ''}`}
        style={{ paddingLeft }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        draggable={!isEditing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropOnFolder}
      >
        {entry.isDirectory ? (
          <>
            <span className="file-chevron">
              <ChevronIcon open={isOpen} />
            </span>
            <span className="file-icon-wrapper">
              {folderIcon ? (
                <span style={{ fontSize: '14px', lineHeight: 1 }}>{folderIcon}</span>
              ) : (
                <FolderIcon open={isOpen} color={folderColor} iconSet={iconSet} />
              )}
            </span>
            {isEditing ? (
              <input
                ref={inputRef}
                className="file-name-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleRename()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelEditing()
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="file-name" onDoubleClick={handleDoubleClick}>{entry.name}</span>
            )}
            {entry.children && !isEditing && (
              <span className="file-count">{entry.children.filter(c => !c.isDirectory).length}</span>
            )}
          </>
        ) : (
          <>
            <span className="file-chevron" style={{ visibility: 'hidden' }}>
              <ChevronIcon open={false} />
            </span>
            <span className="file-icon-wrapper">
              {isPdf ? <PdfIcon /> : isImage ? <ImageIcon /> : isExcel ? <ExcelIcon /> : isWord ? <WordIcon /> : isPowerPoint ? <PowerPointIcon /> : <FileIcon />}
            </span>
            {isEditing ? (
              <input
                ref={inputRef}
                className="file-name-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleRename()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelEditing()
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                {noteKind && (
                  <span
                    className={`note-kind-dot note-kind-${noteKind.id}`}
                    title={noteKind.label}
                    aria-label={noteKind.label}
                  />
                )}
                <span className="file-name" onDoubleClick={handleDoubleClick} title={entry.path}>{visibleDisplayName}</span>
              </>
            )}
            {linkCount > 0 && !isEditing && (
              <span className="file-link-count" title={`${linkCount} ${t('fileTree.connections')}`}>
                {linkCount}
              </span>
            )}
          </>
        )}
      </div>

      {entry.isDirectory && isOpen && entry.children && (
        <div className="file-children">
          <FileTreeInner
            entries={entry.children}
            level={level + 1}
            onDrop={onDrop}
            displayMode={displayMode}
            pdfCompanionEnabled={pdfCompanionEnabled}
            pdfDisplayMode={pdfDisplayMode}
            fileCustomizations={fileCustomizationsForTree}
            showHiddenFolders={showHiddenFoldersForTree}
            noteKindIndex={noteKindIndex}
            activeKindSet={activeKindSet}
            isKindFilterActive={isKindFilterActive}
            kindCounts={kindCounts}
            toggleFileTreeKindFilter={toggleFileTreeKindFilter}
            showOnlyFileTreeKind={showOnlyFileTreeKind}
          />
        </div>
      )}

      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            position: 'fixed',
            left: menuReady ? menuPosition.x : contextMenu.x,
            top: menuReady ? menuPosition.y : contextMenu.y,
            visibility: menuReady ? 'visible' : 'hidden',
            zIndex: 1000,
            ...(menuMaxHeight ? { maxHeight: menuMaxHeight, overflowY: 'auto' } : {})
          }}
        >
          {contextMenu.entry.isDirectory ? (
            <>
              <button onClick={handleCreateNoteInFolder} className="context-menu-item">
                {t('fileTree.newNoteHere')}
              </button>
              <button onClick={handleCreateSubfolder} className="context-menu-item">
                {t('fileTree.newSubfolder')}
              </button>
              <div className="context-menu-divider" />
              {/* Folder Color Picker */}
              <button
                className="context-menu-item"
                onClick={() => openPickerDialog('color')}
              >
                {t('fileTree.changeFolderColor')}
              </button>
              {/* Folder Icon Picker */}
              <button
                className="context-menu-item"
                onClick={() => openPickerDialog('icon')}
              >
                {t('fileTree.changeFolderIcon')}
              </button>
              {hasCustomization && (
                <button onClick={handleRemoveCustomization} className="context-menu-item">
                  {t('fileTree.removeCustomization')}
                </button>
              )}
              <div className="context-menu-divider" />
              <button onClick={handleToggleFolderHidden} className="context-menu-item">
                {isFolderHidden ? t('fileTree.showFolder') : t('fileTree.hideFolder')}
              </button>
              <button onClick={handleToggleFolderPinned} className="context-menu-item">
                {isFolderPinned ? t('fileTree.unpinFolder') : t('fileTree.pinFolder')}
              </button>
              <button onClick={handleToggleTaskExcluded} className="context-menu-item">
                {isFolderTaskExcluded ? t('fileTree.includeInTaskCount') : t('fileTree.excludeFromTaskCount')}
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleCopyRelativePath} className="context-menu-item">
                {t('fileTree.copyRelativePath')}
              </button>
              <button onClick={handleCopyAbsolutePath} className="context-menu-item">
                {t('fileTree.copyAbsolutePath')}
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleRenameFromMenu} className="context-menu-item">
                {t('fileTree.rename')}
              </button>
              <button onClick={handleOpenMoveDialog} className="context-menu-item">
                {t('fileTree.moveTo')}
              </button>
              <button onClick={handleShowInFinder} className="context-menu-item">
                {t('fileTree.showInFinder')}
              </button>
              <button onClick={handleShowFolderInCanvas} className="context-menu-item">
                {t('fileTree.showInCanvas')}
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleStripWikilinks} className="context-menu-item">
                {t('fileTree.stripWikilinks')}
              </button>
              {/* Quiz für Ordner - nur wenn Flashcards und Ollama aktiviert */}
              {flashcardsEnabled && ollama.enabled && ollama.selectedModel && (
                <>
                  <div className="context-menu-divider" />
                  <div className="context-menu-item with-submenu">
                    <span>{t('quiz.startQuiz')}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <div className="context-submenu">
                      <button onClick={() => handleStartQuiz(3)} className="context-menu-item">
                        {t('quiz.questions3')}
                      </button>
                      <button onClick={() => handleStartQuiz(10)} className="context-menu-item">
                        {t('quiz.questions10')}
                      </button>
                      <button onClick={() => handleStartQuiz(15)} className="context-menu-item">
                        {t('quiz.questions15')}
                      </button>
                    </div>
                  </div>
                </>
              )}
              <div className="context-menu-divider" />
              <button onClick={handleDeleteFolder} className="context-menu-item danger">
                {t('fileTree.deleteFolder')}
              </button>
            </>
          ) : (
            <>
              {/* Im Canvas erkunden + Lesezeichen + Quiz - nur für Markdown-Dateien */}
              {!isPdf && !isImage && (
                <>
                  <button onClick={handleToggleBookmark} className="context-menu-item">
                    {noteIsBookmarked ? t('fileTree.removeBookmark') : t('fileTree.addBookmark')}
                  </button>
                  <button onClick={handleOpenInCanvas} className="context-menu-item">
                    {t('fileTree.exploreInCanvas')}
                  </button>
                  <div className="context-menu-item with-submenu">
                    <span>{t('fileTree.changeNoteKind')}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <div className="context-submenu">
                      {NOTE_KIND_ORDER.map(kindId => {
                        const kind = NOTE_KINDS[kindId]
                        return (
                          <button key={kindId} onClick={() => handleSetNoteKind(kindId)} className="context-menu-item note-kind-menu-item">
                            <span className={`note-kind-dot note-kind-${kind.id}`} aria-hidden="true" />
                            <span>{kind.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {/* Quiz für Datei - nur wenn Flashcards und Ollama aktiviert */}
                  {flashcardsEnabled && ollama.enabled && ollama.selectedModel && (
                    <div className="context-menu-item with-submenu">
                      <span>{t('quiz.startQuiz')}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                      <div className="context-submenu">
                        <button onClick={() => handleStartQuiz(3)} className="context-menu-item">
                          {t('quiz.questions3')}
                        </button>
                        <button onClick={() => handleStartQuiz(10)} className="context-menu-item">
                          {t('quiz.questions10')}
                        </button>
                        <button onClick={() => handleStartQuiz(15)} className="context-menu-item">
                          {t('quiz.questions15')}
                        </button>
                      </div>
                    </div>
                  )}
                  {isMac && (
                    <button onClick={handleCreateAppleReminders} className="context-menu-item" disabled={reminderCreating}>
                      {t('fileTree.createAppleReminder')}
                    </button>
                  )}
                  <div className="context-menu-divider" />
                </>
              )}
              <button onClick={handleCopyRelativePath} className="context-menu-item">
                {t('fileTree.copyRelativePath')}
              </button>
              <button onClick={handleCopyAbsolutePath} className="context-menu-item">
                {t('fileTree.copyAbsolutePath')}
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleRenameFromMenu} className="context-menu-item">
                {t('fileTree.rename')}
              </button>
              <button onClick={handleDuplicate} className="context-menu-item">
                {t('fileTree.duplicate')}
              </button>
              <button onClick={handleOpenMoveDialog} className="context-menu-item">
                {selectedPaths.size > 1 && selectedPaths.has(entry.path)
                  ? `${selectedPaths.size} Dateien verschieben`
                  : t('fileTree.moveTo')}
              </button>
              <button onClick={handleShowInFinder} className="context-menu-item">
                {t('fileTree.showInFinder')}
              </button>
              {isCode && (
                <button onClick={handleOpenInVSCode} className="context-menu-item">
                  {t('fileTree.openInVSCode')}
                </button>
              )}
              <div className="context-menu-divider" />
              <button onClick={handleDelete} className="context-menu-item danger">
                {selectedPaths.size > 1 && selectedPaths.has(entry.path)
                  ? `${selectedPaths.size} Dateien löschen`
                  : t('fileTree.deleteNote')}
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {/* Dialog für neue Notiz im Ordner */}
      {newNoteDialog && (
        <div className="new-note-dialog" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 1001 }}>
          <input
            type="text"
            value={newNoteName}
            onChange={(e) => setNewNoteName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmitNewNote()
              if (e.key === 'Escape') { setNewNoteDialog(null); setNewNoteName('') }
            }}
            placeholder={t('fileTree.noteName')}
            autoFocus
          />
          <div className="new-note-dialog-buttons">
            <button onClick={handleSubmitNewNote} className="btn-primary">{t('fileTree.create')}</button>
            <button onClick={() => { setNewNoteDialog(null); setNewNoteName('') }}>{t('fileTree.cancel')}</button>
          </div>
        </div>
      )}

      {/* Color/Icon Picker Dialog */}
      {pickerDialog && createPortal(
        <div className="picker-dialog-overlay" onClick={() => setPickerDialog(null)}>
          <div className="picker-dialog" onClick={e => e.stopPropagation()}>
            <div className="picker-dialog-header">
              {pickerDialog.type === 'color' ? t('fileTree.chooseFolderColor') : t('fileTree.chooseFolderIcon')}
            </div>
            <div className="picker-dialog-content">
              {pickerDialog.type === 'color' ? (
                <div className="picker-color-grid">
                  {FOLDER_COLORS.map(color => (
                    <button
                      key={color.id}
                      className={`picker-color-item ${
                        (color.id === 'default' && !fileCustomizations[pickerDialog.path]?.color) ||
                        fileCustomizations[pickerDialog.path]?.color === color.color ? 'active' : ''
                      }`}
                      onClick={() => handleSetFolderColor(color.id, pickerDialog.path)}
                      title={color.name}
                    >
                      <span className="picker-color-swatch" style={{ backgroundColor: color.color }} />
                      <span className="picker-color-name">{color.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="picker-icon-grid">
                  {FOLDER_ICONS.map(icon => (
                    <button
                      key={icon.id}
                      className={`picker-icon-item ${
                        (icon.id === 'default' && !fileCustomizations[pickerDialog.path]?.icon) ||
                        fileCustomizations[pickerDialog.path]?.icon === icon.emoji ? 'active' : ''
                      }`}
                      onClick={() => handleSetFolderIcon(icon.id, pickerDialog.path)}
                      title={icon.name}
                    >
                      {icon.emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="picker-dialog-footer">
              <button onClick={() => setPickerDialog(null)}>{t('fileTree.cancel')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Move to Folder Dialog */}
      {moveDialog && createPortal(
        <div className="picker-dialog-overlay" onClick={() => setMoveDialog(null)}>
          <div className="picker-dialog move-dialog" onClick={e => e.stopPropagation()}>
            <div className="picker-dialog-header">
              {moveDialog.entries && moveDialog.entries.length > 1
                ? `${moveDialog.entries.length} Dateien verschieben`
                : t('fileTree.moveToTitle', { name: moveDialog.entry.name })}
            </div>
            <div className="picker-dialog-content move-dialog-content">
              {/* Root folder option */}
              <button
                className={`move-folder-item root-folder ${moveDialog.selectedTargetPath === '' ? 'selected' : ''}`}
                onClick={() => handleSelectTargetFolder('')}
              >
                <span className="move-folder-icon">
                  <FolderIcon open={false} color="#F5A623" iconSet={iconSet} />
                </span>
                <span className="move-folder-name">{t('fileTree.vaultRoot')}</span>
              </button>
              {/* All folders */}
              {fileTree && collectFolders(fileTree).map(folder => {
                const entriesToMove = moveDialog.entries || [moveDialog.entry]
                // Don't show folders that are being moved or their children
                for (const e of entriesToMove) {
                  if (e.isDirectory && folder.path === e.path) return null
                  if (e.isDirectory && folder.path.startsWith(e.path + '/')) return null
                }

                const folderCustomization = fileCustomizations[folder.path]
                const isSelected = moveDialog.selectedTargetPath === folder.path
                return (
                  <button
                    key={folder.path}
                    className={`move-folder-item ${isSelected ? 'selected' : ''}`}
                    style={{ paddingLeft: `${folder.depth * 16 + 12}px` }}
                    onClick={() => handleSelectTargetFolder(folder.path)}
                  >
                    <span className="move-folder-icon">
                      {folderCustomization?.icon ? (
                        <span style={{ fontSize: '14px' }}>{folderCustomization.icon}</span>
                      ) : (
                        <FolderIcon open={false} color={folderCustomization?.color} iconSet={iconSet} />
                      )}
                    </span>
                    <span className="move-folder-name">{folder.name}</span>
                  </button>
                )
              })}
            </div>
            <div className="picker-dialog-footer">
              <button onClick={() => setMoveDialog(null)}>{t('fileTree.cancel')}</button>
              <button
                className="btn-primary"
                onClick={handleExecuteMove}
                disabled={moveDialog.selectedTargetPath === null}
              >
                {t('fileTree.moveButton')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// Helper: find a FileEntry by path in the tree (recursive)
function findEntryByPath(entries: FileEntry[], targetPath: string): FileEntry | null {
  for (const entry of entries) {
    if (entry.path === targetPath) return entry
    if (entry.children) {
      const found = findEntryByPath(entry.children, targetPath)
      if (found) return found
    }
  }
  return null
}

function FileTreeInner({
  entries,
  level = 0,
  onDrop,
  displayMode = 'name',
  pdfCompanionEnabled,
  pdfDisplayMode,
  fileCustomizations,
  showHiddenFolders,
  noteKindIndex,
  activeKindSet,
  isKindFilterActive,
  kindCounts,
  toggleFileTreeKindFilter,
  showOnlyFileTreeKind
}: FileTreeInnerProps) {
  const { t } = useTranslation()

  const matchesKindFilter = useCallback((entry: FileEntry): FileEntry | null => {
    if (!isKindFilterActive) return entry

    if (entry.isDirectory) {
      const children = (entry.children || [])
        .map(child => matchesKindFilter(child))
        .filter((child): child is FileEntry => child !== null)
      return { ...entry, children }
    }

    if (entry.fileType && entry.fileType !== 'markdown') return null
    const kindId = noteKindIndex.get(entry.path)
    const kind = kindId ? NOTE_KINDS[kindId] : getNoteKindFromText(entry.name) || getNoteKindFromText(entry.path)
    if (!kind) return entry
    return kind && activeKindSet.has(kind.id) ? entry : null
  }, [activeKindSet, isKindFilterActive, noteKindIndex])

  // Filter entries based on PDF settings and hidden folders
  const filteredEntries = useMemo(() => {
    let filtered = entries

    // Filter hidden folders (unless showHiddenFolders is active)
    if (!showHiddenFolders) {
      filtered = filtered.filter(entry =>
        !entry.isDirectory || !fileCustomizations[entry.path]?.hidden
      )
    }

    if (!pdfCompanionEnabled) {
      // If companion is disabled, show only PDFs (hide .pdf.md files)
      filtered = filtered.filter(entry => !entry.name.endsWith('.pdf.md'))
      return filtered
        .map(entry => matchesKindFilter(entry))
        .filter((entry): entry is FileEntry => entry !== null)
    }

    // Collect all entry names for lookup
    const entryNames = new Set(filtered.map(e => e.name))

    filtered = filtered.filter(entry => {
      const name = entry.name.toLowerCase()

      if (pdfDisplayMode === 'companion-only') {
        // Hide PDFs that have a companion (.pdf.md file)
        if (name.endsWith('.pdf') && !name.endsWith('.pdf.md')) {
          const companionName = entry.name + '.md'
          return !entryNames.has(companionName)
        }
      } else if (pdfDisplayMode === 'pdf-only') {
        // Hide .pdf.md companion files
        if (name.endsWith('.pdf.md')) {
          return false
        }
      }
      // 'both' mode shows everything
      return true
    })

    return filtered
      .map(entry => matchesKindFilter(entry))
      .filter((entry): entry is FileEntry => entry !== null)
  }, [entries, pdfCompanionEnabled, pdfDisplayMode, showHiddenFolders, fileCustomizations, matchesKindFilter])

  // Pinned folders (only at root level)
  const pinnedEntries = useMemo(() => {
    if (level !== 0) return []
    return Object.entries(fileCustomizations)
      .filter(([, c]) => c.pinned)
      .map(([path]) => findEntryByPath(entries, path))
      .filter((e): e is FileEntry => e !== null)
  }, [level, fileCustomizations, entries])

  return (
    <div className="file-tree">
      {level === 0 && (
        <div className="file-kind-filter" aria-label={t('fileTree.kindFilter')}>
          {NOTE_KIND_ORDER.map(kindId => {
            const kind = NOTE_KINDS[kindId]
            const active = activeKindSet.has(kindId)
            return (
              <button
                key={kindId}
                type="button"
                className={`file-kind-filter-btn ${active ? 'active' : ''}`}
                onClick={() => toggleFileTreeKindFilter?.(kindId)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  showOnlyFileTreeKind?.(kindId)
                }}
                aria-label={`${kind.label} (${kindCounts[kindId]})`}
                data-tooltip={`${kind.label} (${kindCounts[kindId]})`}
              >
                <span className={`note-kind-dot note-kind-${kind.id}`} aria-hidden="true" />
                <span className="file-kind-filter-count">{kindCounts[kindId]}</span>
              </button>
            )
          })}
        </div>
      )}
      {level === 0 && pinnedEntries.length > 0 && (
        <div className="pinned-folders-section">
          <div className="pinned-folders-header">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
            </svg>
            <span>{t('fileTree.pinnedFolders')}</span>
          </div>
          {pinnedEntries.map((entry) => (
            <FileItem
              key={`pinned-${entry.path}`}
              entry={entry}
              level={0}
              onDrop={onDrop}
              displayMode={displayMode}
              noteKindIndex={noteKindIndex}
              activeKindSet={activeKindSet}
              isKindFilterActive={isKindFilterActive}
              kindCounts={kindCounts}
              pdfCompanionEnabled={pdfCompanionEnabled}
              pdfDisplayMode={pdfDisplayMode}
              fileCustomizationsForTree={fileCustomizations}
              showHiddenFoldersForTree={showHiddenFolders}
              toggleFileTreeKindFilter={toggleFileTreeKindFilter}
              showOnlyFileTreeKind={showOnlyFileTreeKind}
            />
          ))}
          <div className="pinned-folders-divider" />
        </div>
      )}
      {filteredEntries.map((entry) => (
        <FileItem
          key={entry.path}
          entry={entry}
          level={level}
          onDrop={onDrop}
          displayMode={displayMode}
          noteKindIndex={noteKindIndex}
          activeKindSet={activeKindSet}
          isKindFilterActive={isKindFilterActive}
          kindCounts={kindCounts}
          pdfCompanionEnabled={pdfCompanionEnabled}
          pdfDisplayMode={pdfDisplayMode}
          fileCustomizationsForTree={fileCustomizations}
          showHiddenFoldersForTree={showHiddenFolders}
          toggleFileTreeKindFilter={toggleFileTreeKindFilter}
          showOnlyFileTreeKind={showOnlyFileTreeKind}
        />
      ))}
    </div>
  )
}

export const FileTree: React.FC<FileTreeProps> = ({ entries, level = 0, onDrop, displayMode = 'name' }) => {
  const { pdfCompanionEnabled, pdfDisplayMode, fileTreeKindFilter, toggleFileTreeKindFilter, showOnlyFileTreeKind } = useUIStore()
  const { fileCustomizations, showHiddenFolders } = useGraphStore()
  const notes = useNotesStore(state => state.notes)

  const noteKindIndex = useMemo(() => buildNoteKindIndex(notes), [notes])
  const kindCounts = useMemo(() => countNoteKinds(noteKindIndex), [noteKindIndex])
  const activeKindSet = useMemo(() => new Set(fileTreeKindFilter), [fileTreeKindFilter])
  const isKindFilterActive = fileTreeKindFilter.length < NOTE_KIND_ORDER.length

  return (
    <FileTreeInner
      entries={entries}
      level={level}
      onDrop={onDrop}
      displayMode={displayMode}
      pdfCompanionEnabled={pdfCompanionEnabled}
      pdfDisplayMode={pdfDisplayMode}
      fileCustomizations={fileCustomizations}
      showHiddenFolders={showHiddenFolders}
      noteKindIndex={noteKindIndex}
      activeKindSet={activeKindSet}
      isKindFilterActive={isKindFilterActive}
      kindCounts={kindCounts}
      toggleFileTreeKindFilter={toggleFileTreeKindFilter}
      showOnlyFileTreeKind={showOnlyFileTreeKind}
    />
  )
}
