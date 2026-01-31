import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { FileEntry } from '../../../shared/types'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore, FOLDER_COLORS, FOLDER_ICONS, type IconSet } from '../../stores/uiStore'
import { useGraphStore } from '../../stores/graphStore'
import { useTabStore } from '../../stores/tabStore'
import { useBookmarkStore } from '../../stores/bookmarkStore'
import { generateNoteId } from '../../utils/linkExtractor'
import { useTranslation } from '../../utils/translations'

type DisplayMode = 'name' | 'path'

interface FileTreeProps {
  entries: FileEntry[]
  level?: number
  onDrop?: (sourcePath: string, targetPath: string) => void
  displayMode?: DisplayMode
}

interface FileItemProps {
  entry: FileEntry
  level: number
  onDrop?: (sourcePath: string, targetPath: string) => void
  displayMode: DisplayMode
}

interface ContextMenuState {
  x: number
  y: number
  entry: FileEntry
}

interface MoveDialogState {
  entry: FileEntry
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

const FileItem: React.FC<FileItemProps> = ({ entry, level, onDrop, displayMode }) => {
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

  const { selectedNoteId, secondarySelectedNoteId, selectedPdfPath, selectedImagePath, selectNote, selectSecondaryNote, selectPdf, selectImage, removeNote, setFileTree, vaultPath, notes, updateNotePath, fileTree } = useNotesStore()
  const { iconSet, textSplitEnabled } = useUIStore()
  const { fileCustomizations, setFileCustomization, removeFileCustomization } = useGraphStore()
  const { openCanvasTab } = useTabStore()
  const { isBookmarked, toggleBookmark } = useBookmarkStore()

  const isPdf = entry.fileType === 'pdf'
  const isImage = entry.fileType === 'image'
  const noteId = generateNoteId(entry.path)
  const isSelected = isPdf
    ? selectedPdfPath === entry.path
    : isImage
      ? selectedImagePath === entry.path
      : selectedNoteId === noteId
  const isSecondarySelected = !entry.isDirectory && !isPdf && !isImage && secondarySelectedNoteId === noteId

  // Finde die Notiz um Link-Count zu zeigen
  const note = notes.find(n => n.id === noteId)
  const linkCount = note ? note.outgoingLinks.length + note.incomingLinks.length : 0

  // Bookmark Status (nur für Markdown-Notizen)
  const noteIsBookmarked = !entry.isDirectory && !isPdf && !isImage && isBookmarked(noteId)

  // Hole Customization für diesen Eintrag (nur für Ordner)
  const customization = entry.isDirectory ? fileCustomizations[entry.path] : undefined
  const folderColor = customization?.color
  const folderIcon = customization?.icon
  const hasCustomization = folderColor || folderIcon

  // Display-Name basierend auf displayMode
  const getDisplayName = () => {
    if (entry.isDirectory) {
      // Ordner: immer nur den Ordnernamen anzeigen
      return entry.name
    }
    // Für Bilder: vollständigen Namen mit Endung anzeigen
    if (isImage) {
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

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      // Select text without extension
      const name = entry.isDirectory ? entry.name : entry.name.replace('.md', '')
      inputRef.current.setSelectionRange(0, name.length)
    }
  }, [isEditing, entry.name, entry.isDirectory])

  const handleClick = (e: React.MouseEvent) => {
    if (isEditing) return
    if (entry.isDirectory) {
      setIsOpen(!isOpen)
    } else if (isPdf) {
      // PDF direkt im Viewer anzeigen
      selectPdf(entry.path)
    } else if (isImage) {
      selectImage(entry.path)
    } else {
      // Cmd/Ctrl+Click: In sekundäres Panel öffnen (wenn Text-Split aktiv)
      if (textSplitEnabled && (e.metaKey || e.ctrlKey)) {
        selectSecondaryNote(noteId)
      } else {
        selectNote(noteId)
      }
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
    const name = entry.isDirectory ? entry.name : entry.name.replace('.md', '')
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

    const newName = entry.isDirectory ? editName.trim() : `${editName.trim()}.md`
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

    // Berechne Position mit Viewport-Grenzen
    const menuWidth = 180  // Geschätzte Menübreite
    const menuHeight = entry.isDirectory ? 320 : 240  // Ordner-Menü ist höher
    const padding = 8

    let x = e.clientX
    let y = e.clientY

    // Prüfe rechten Rand
    if (x + menuWidth + padding > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding
    }

    // Prüfe unteren Rand
    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding
    }

    // Mindestens am oberen/linken Rand
    x = Math.max(padding, x)
    y = Math.max(padding, y)

    setContextMenu({ x, y, entry })
  }

  const handleDelete = useCallback(async () => {
    if (!contextMenu || !vaultPath) return

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
  }, [contextMenu, vaultPath, removeNote, setFileTree])

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

  const handleCreateNoteInFolder = useCallback(() => {
    if (!contextMenu || !vaultPath || !contextMenu.entry.isDirectory) return

    const folderPath = `${vaultPath}/${contextMenu.entry.path}`
    setNewNoteDialog({ folderPath })
    setNewNoteName('')
    setContextMenu(null)
  }, [contextMenu, vaultPath])

  const handleSubmitNewNote = useCallback(async () => {
    if (!newNoteDialog || !newNoteName.trim() || !vaultPath) return

    const filePath = `${newNoteDialog.folderPath}/${newNoteName.trim()}.md`
    try {
      await window.electronAPI.writeFile(filePath, `# ${newNoteName.trim()}\n\n`)
      const tree = await window.electronAPI.readDirectory(vaultPath)
      setFileTree(tree)
    } catch (error) {
      console.error('Fehler beim Erstellen der Notiz:', error)
    }

    setNewNoteDialog(null)
    setNewNoteName('')
  }, [newNoteDialog, newNoteName, vaultPath, setFileTree])

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
    const title = contextMenu.entry.name.replace('.md', '')
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

  // Open move dialog
  const handleOpenMoveDialog = useCallback(() => {
    if (!contextMenu) return
    setMoveDialog({ entry: contextMenu.entry, selectedTargetPath: null })
    setContextMenu(null)
  }, [contextMenu])

  // Select target folder (doesn't move yet)
  const handleSelectTargetFolder = useCallback((targetFolderPath: string) => {
    if (!moveDialog) return
    setMoveDialog({ ...moveDialog, selectedTargetPath: targetFolderPath })
  }, [moveDialog])

  // Execute move
  const handleExecuteMove = useCallback(async () => {
    if (!moveDialog || moveDialog.selectedTargetPath === null || !vaultPath) return

    const targetFolderPath = moveDialog.selectedTargetPath
    const sourceFullPath = `${vaultPath}/${moveDialog.entry.path}`
    const targetDir = targetFolderPath === '' ? vaultPath : `${vaultPath}/${targetFolderPath}`

    // Don't move to same location
    const currentDir = moveDialog.entry.path.includes('/')
      ? moveDialog.entry.path.substring(0, moveDialog.entry.path.lastIndexOf('/'))
      : ''
    if (currentDir === targetFolderPath) {
      setMoveDialog(null)
      return
    }

    // Prevent moving folder into itself or its children
    if (moveDialog.entry.isDirectory && targetFolderPath.startsWith(moveDialog.entry.path + '/')) {
      setMoveDialog(null)
      return
    }

    try {
      const result = await window.electronAPI.moveFile(sourceFullPath, targetDir)
      if (result.success) {
        // Update note paths if needed
        const fileName = moveDialog.entry.name
        const newPath = targetFolderPath === '' ? fileName : `${targetFolderPath}/${fileName}`

        if (!moveDialog.entry.isDirectory && moveDialog.entry.path.endsWith('.md')) {
          const oldNoteId = generateNoteId(moveDialog.entry.path)
          const newNoteId = generateNoteId(newPath)
          updateNotePath(oldNoteId, newPath, newNoteId)
        }

        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)
      }
    } catch (error) {
      console.error('Fehler beim Verschieben:', error)
    }

    setMoveDialog(null)
  }, [moveDialog, vaultPath, setFileTree, updateNotePath])

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
        className={`file-item-row ${isSelected ? 'selected' : ''} ${isSecondarySelected ? 'secondary-selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
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
              {isPdf ? <PdfIcon /> : isImage ? <ImageIcon /> : <FileIcon />}
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
              <span className="file-name" onDoubleClick={handleDoubleClick} title={entry.path}>{displayName}</span>
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
          <FileTree entries={entry.children} level={level + 1} onDrop={onDrop} displayMode={displayMode} />
        </div>
      )}

      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000
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
              <div className="context-menu-divider" />
              <button onClick={handleStripWikilinks} className="context-menu-item">
                {t('fileTree.stripWikilinks')}
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleDeleteFolder} className="context-menu-item danger">
                {t('fileTree.deleteFolder')}
              </button>
            </>
          ) : (
            <>
              {/* Im Canvas erkunden + Lesezeichen - nur für Markdown-Dateien */}
              {!isPdf && !isImage && (
                <>
                  <button onClick={handleToggleBookmark} className="context-menu-item">
                    {noteIsBookmarked ? t('fileTree.removeBookmark') : t('fileTree.addBookmark')}
                  </button>
                  <button onClick={handleOpenInCanvas} className="context-menu-item">
                    {t('fileTree.exploreInCanvas')}
                  </button>
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
                {t('fileTree.moveTo')}
              </button>
              <button onClick={handleShowInFinder} className="context-menu-item">
                {t('fileTree.showInFinder')}
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleDelete} className="context-menu-item danger">
                {t('fileTree.deleteNote')}
              </button>
            </>
          )}
        </div>
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
              {t('fileTree.moveToTitle', { name: moveDialog.entry.name })}
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
                // Don't show current folder or current file's parent
                const currentDir = moveDialog.entry.path.includes('/')
                  ? moveDialog.entry.path.substring(0, moveDialog.entry.path.lastIndexOf('/'))
                  : ''
                if (folder.path === currentDir) return null
                // Don't show the folder itself if moving a folder
                if (moveDialog.entry.isDirectory && folder.path === moveDialog.entry.path) return null
                // Don't show children of a folder being moved
                if (moveDialog.entry.isDirectory && folder.path.startsWith(moveDialog.entry.path + '/')) return null

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

export const FileTree: React.FC<FileTreeProps> = ({ entries, level = 0, onDrop, displayMode = 'name' }) => {
  const { pdfCompanionEnabled, pdfDisplayMode } = useUIStore()

  // Filter entries based on PDF settings
  const filteredEntries = useMemo(() => {
    if (!pdfCompanionEnabled) {
      // If companion is disabled, show only PDFs (hide .pdf.md files)
      return entries.filter(entry => !entry.name.endsWith('.pdf.md'))
    }

    // Collect all entry names for lookup
    const entryNames = new Set(entries.map(e => e.name))

    return entries.filter(entry => {
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
  }, [entries, pdfCompanionEnabled, pdfDisplayMode])

  return (
    <div className="file-tree">
      {filteredEntries.map((entry) => (
        <FileItem key={entry.path} entry={entry} level={level} onDrop={onDrop} displayMode={displayMode} />
      ))}
    </div>
  )
}
