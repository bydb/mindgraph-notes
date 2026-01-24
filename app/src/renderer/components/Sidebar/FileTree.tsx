import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { FileEntry } from '../../../shared/types'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { generateNoteId } from '../../utils/linkExtractor'

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

const FolderIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    {open ? (
      <path
        d="M2 4.5C2 3.67 2.67 3 3.5 3H6.17C6.7 3 7.2 3.21 7.59 3.59L8.41 4.41C8.8 4.79 9.3 5 9.83 5H12.5C13.33 5 14 5.67 14 6.5V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z"
        fill="#F5A623"
        stroke="#E09612"
        strokeWidth="0.5"
      />
    ) : (
      <path
        d="M2 4.5C2 3.67 2.67 3 3.5 3H6.17C6.7 3 7.2 3.21 7.59 3.59L8.41 4.41C8.8 4.79 9.3 5 9.83 5H12.5C13.33 5 14 5.67 14 6.5V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z"
        fill="#F5A623"
        stroke="#E09612"
        strokeWidth="0.5"
      />
    )}
  </svg>
)

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
  const [isOpen, setIsOpen] = useState(true)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [newNoteDialog, setNewNoteDialog] = useState<{ folderPath: string } | null>(null)
  const [newNoteName, setNewNoteName] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const { selectedNoteId, selectedPdfPath, selectedImagePath, selectNote, selectPdf, selectImage, removeNote, setFileTree, vaultPath, notes, updateNotePath } = useNotesStore()

  const isPdf = entry.fileType === 'pdf'
  const isImage = entry.fileType === 'image'
  const noteId = generateNoteId(entry.path)
  const isSelected = isPdf
    ? selectedPdfPath === entry.path
    : isImage
      ? selectedImagePath === entry.path
      : selectedNoteId === noteId

  // Finde die Notiz um Link-Count zu zeigen
  const note = notes.find(n => n.id === noteId)
  const linkCount = note ? note.outgoingLinks.length + note.incomingLinks.length : 0

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

  const handleClick = () => {
    if (isEditing) return
    if (entry.isDirectory) {
      setIsOpen(!isOpen)
    } else if (isPdf) {
      // PDF direkt im Viewer anzeigen
      selectPdf(entry.path)
    } else if (isImage) {
      selectImage(entry.path)
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
        className={`file-item-row ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
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
              <FolderIcon open={isOpen} />
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
              <span className="file-link-count" title={`${linkCount} Verbindungen`}>
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
                Neue Notiz hier
              </button>
              <button onClick={handleCreateSubfolder} className="context-menu-item">
                Neuer Unterordner
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleCopyRelativePath} className="context-menu-item">
                Relativen Pfad kopieren
              </button>
              <button onClick={handleCopyAbsolutePath} className="context-menu-item">
                Absoluten Pfad kopieren
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleRenameFromMenu} className="context-menu-item">
                Umbenennen
              </button>
              <button onClick={handleShowInFinder} className="context-menu-item">
                Im Finder zeigen
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleStripWikilinks} className="context-menu-item">
                Wikilinks entfernen
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleDeleteFolder} className="context-menu-item danger">
                Ordner löschen
              </button>
            </>
          ) : (
            <>
              <button onClick={handleCopyRelativePath} className="context-menu-item">
                Relativen Pfad kopieren
              </button>
              <button onClick={handleCopyAbsolutePath} className="context-menu-item">
                Absoluten Pfad kopieren
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleRenameFromMenu} className="context-menu-item">
                Umbenennen
              </button>
              <button onClick={handleDuplicate} className="context-menu-item">
                Duplizieren
              </button>
              <button onClick={handleShowInFinder} className="context-menu-item">
                Im Finder zeigen
              </button>
              <div className="context-menu-divider" />
              <button onClick={handleDelete} className="context-menu-item danger">
                Notiz löschen
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
            placeholder="Notiz-Name..."
            autoFocus
          />
          <div className="new-note-dialog-buttons">
            <button onClick={handleSubmitNewNote} className="btn-primary">Erstellen</button>
            <button onClick={() => { setNewNoteDialog(null); setNewNoteName('') }}>Abbrechen</button>
          </div>
        </div>
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
