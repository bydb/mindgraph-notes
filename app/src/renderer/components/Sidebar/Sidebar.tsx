import React, { useEffect, useCallback, useState, useRef } from 'react'
import { FileTree } from './FileTree'
import { BookmarksBar } from './BookmarksBar'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useGraphStore } from '../../stores/graphStore'
import { useTabStore } from '../../stores/tabStore'
import { useDataviewStore } from '../../stores/dataviewStore'
import { useTranslation } from '../../utils/translations'
import { extractTaskStatsForCache } from '../../utils/linkExtractor'
import { parseFrontmatter } from '../../utils/metadataExtractor'
import type { Note, NotesCache, NoteFrontmatter } from '../../../shared/types'

interface SidebarProps {
  onOpenSearch?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenSearch }) => {
  const { vaultPath, fileTree, notes, setVaultPath, setFileTree, setNotes, addNote, selectNote, setLoading } = useNotesStore()
  const { sidebarWidth, sidebarVisible, fileTreeDisplayMode, setFileTreeDisplayMode } = useUIStore()
  const loadGraphData = useGraphStore((s) => s.loadFromVault)
  const resetGraphStore = useGraphStore((s) => s.reset)
  const clearAllTabs = useTabStore((s) => s.clearAllTabs)
  const { t } = useTranslation()

  // State für neue Notiz Dialog
  const [newNoteDialogOpen, setNewNoteDialogOpen] = useState(false)
  const [newNoteName, setNewNoteName] = useState('')
  const newNoteInputRef = useRef<HTMLInputElement>(null)

  // Guard gegen doppeltes Laden (React Strict Mode)
  const isLoadingRef = useRef(false)

  const handleOpenVault = useCallback(async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available')
      return
    }

    try {
      const path = await window.electronAPI.openVault()
      if (!path) return

      // WICHTIG: Alten Vault aufräumen bevor neuer geladen wird
      window.electronAPI.unwatchDirectory() // Stoppt alten File-Watcher
      resetGraphStore() // Setzt Graph-Positionen zurück
      clearAllTabs() // Schließt alle Canvas-Tabs
      setNotes([]) // Leert alte Notizen
      setFileTree([]) // Leert alten Dateibaum

      setVaultPath(path)

      // 1. FileTree SOFORT laden und anzeigen
      const tree = await window.electronAPI.readDirectory(path)
      setFileTree(tree)
      console.log('[Sidebar] FileTree geladen, UI bereit')

      // 2. Notizen im HINTERGRUND laden
      await new Promise(resolve => setTimeout(resolve, 50))

      setLoading(true)
      const loadedNotes = await loadAllNotes(path, tree)
      setNotes(loadedNotes)
      setLoading(false)

      // Graph-Daten aus dem Vault laden
      await loadGraphData(path)

      window.electronAPI.watchDirectory(path, async (event: string, changedFilePath: string) => {
        console.log('File changed:', event, changedFilePath)

        // Dateibaum neu laden
        const newTree = await window.electronAPI.readDirectory(path)
        setFileTree(newTree)

        // Bei neuer oder geänderter Datei: Notizen neu laden
        if (event === 'add' || event === 'change') {
          // Normalisiere Pfade für plattformübergreifende Kompatibilität (Windows verwendet \, Unix verwendet /)
          const normalizedChangedPath = changedFilePath.replace(/\\/g, '/')
          const normalizedVaultPath = path.replace(/\\/g, '/')
          const relativePath = normalizedChangedPath.replace(normalizedVaultPath + '/', '')
          if (relativePath.endsWith('.md')) {
            try {
              const content = await window.electronAPI.readFile(changedFilePath)
              const note = await createNoteFromFile(changedFilePath, relativePath, content)

              // Prüfen ob Notiz bereits existiert
              const existingNote = useNotesStore.getState().getNoteByPath(relativePath)
              if (existingNote) {
                // Update existing note
                useNotesStore.getState().updateNote(existingNote.id, {
                  content,
                  title: note.title,
                  outgoingLinks: note.outgoingLinks,
                  tags: note.tags,
                  modifiedAt: new Date()
                })
              } else {
                // Add new note
                addNote(note)
              }
            } catch (error) {
              console.error('Fehler beim Laden der geänderten Datei:', error)
            }
          }
        } else if (event === 'unlink') {
          // Datei gelöscht - auch hier Pfade normalisieren
          const normalizedChangedPath = changedFilePath.replace(/\\/g, '/')
          const normalizedVaultPath = path.replace(/\\/g, '/')
          const relativePath = normalizedChangedPath.replace(normalizedVaultPath + '/', '')
          const existingNote = useNotesStore.getState().getNoteByPath(relativePath)
          if (existingNote) {
            useNotesStore.getState().removeNote(existingNote.id)
          }
        }
      })
      
      setLoading(false)
    } catch (error) {
      console.error('Fehler beim Öffnen des Vaults:', error)
      setLoading(false)
    }
  }, [setVaultPath, setFileTree, setNotes, setLoading, loadGraphData, resetGraphStore, clearAllTabs])
  
  const handleNewNote = useCallback(() => {
    if (!vaultPath) {
      handleOpenVault()
      return
    }
    setNewNoteName('')
    setNewNoteDialogOpen(true)
    setTimeout(() => newNoteInputRef.current?.focus(), 50)
  }, [vaultPath, handleOpenVault])

  const handleSubmitNewNote = useCallback(async () => {
    if (!window.electronAPI || !vaultPath || !newNoteName.trim()) return

    const name = newNoteName.trim()
    // Immer .md Endung erzwingen
    const fileName = name.endsWith('.md') ? name : `${name}.md`
    const filePath = `${vaultPath}/${fileName}`

    try {
      // Notiz erstellen
      const result = await window.electronAPI.createNote(filePath)

      // Dateibaum neu laden
      const tree = await window.electronAPI.readDirectory(vaultPath)
      setFileTree(tree)

      // Notiz zum Store hinzufügen
      const note = await createNoteFromFile(filePath, fileName, result.content)
      addNote(note)
      selectNote(note.id)

      setNewNoteDialogOpen(false)
      setNewNoteName('')
    } catch (error) {
      console.error('Fehler beim Erstellen der Notiz:', error)
    }
  }, [vaultPath, newNoteName, setFileTree, addNote, selectNote])

  const handleNewFolder = useCallback(async () => {
    if (!window.electronAPI) return

    if (!vaultPath) {
      handleOpenVault()
      return
    }

    try {
      const folderPath = await window.electronAPI.promptNewFolder(vaultPath)
      if (!folderPath) return

      // Dateibaum neu laden
      const tree = await window.electronAPI.readDirectory(vaultPath)
      setFileTree(tree)
    } catch (error) {
      console.error('Fehler beim Erstellen des Ordners:', error)
    }
  }, [vaultPath, setFileTree, handleOpenVault])

  // Beim Start: Letzten Vault automatisch laden (wartet auf onboardingCompleted)
  const onboardingCompleted = useUIStore((s) => s.onboardingCompleted)
  useEffect(() => {
    if (!onboardingCompleted) return // Warten bis Settings geladen & Onboarding abgeschlossen

    const loadLastVault = async () => {
      // Guard gegen doppeltes Laden
      if (!window.electronAPI || vaultPath || isLoadingRef.current) return
      isLoadingRef.current = true

      // Determine which vault to load: either already set (from onboarding) or last used
      let targetVault = vaultPath
      if (!targetVault) {
        try {
          targetVault = await window.electronAPI.getLastVault()
        } catch (error) {
          console.error('[Sidebar] Failed to get last vault:', error)
        }
      }
      if (!targetVault) {
        isLoadingRef.current = false
        return
      }

      try {
        console.log('[Sidebar] Auto-loading vault:', targetVault)

        setVaultPath(targetVault)

        // 1. FileTree SOFORT laden und anzeigen
        const tree = await window.electronAPI.readDirectory(targetVault)
        setFileTree(tree)
        setLoading(false) // UI sofort freigeben!

        console.log('[Sidebar] FileTree geladen, UI bereit')

        // 2. Notizen im HINTERGRUND laden (blockiert UI nicht)
        // requestIdleCallback oder setTimeout damit React erst rendern kann
        await new Promise(resolve => setTimeout(resolve, 50))

        setLoading(true) // Zeige Lade-Indikator für Notizen
        const loadedNotes = await loadAllNotes(targetVault, tree)
        setNotes(loadedNotes)
        setLoading(false)

        // Graph-Daten aus dem Vault laden
        await loadGraphData(targetVault)

        // Nach Onboarding: Willkommen-Notiz automatisch öffnen
        const welcomeNote = loadedNotes.find(n =>
          n.path === 'Willkommen.md' || n.path === 'Welcome.md'
        )
        if (welcomeNote) {
          selectNote(welcomeNote.id)
        }

        // File-Watcher starten
        window.electronAPI.watchDirectory(targetVault, async (event: string, changedFilePath: string) => {
          console.log('File changed:', event, changedFilePath)

          const newTree = await window.electronAPI.readDirectory(targetVault!)
          setFileTree(newTree)

          if (event === 'add' || event === 'change') {
            // Normalisiere Pfade für plattformübergreifende Kompatibilität (Windows verwendet \, Unix verwendet /)
            const normalizedChangedPath = changedFilePath.replace(/\\/g, '/')
            const normalizedVaultPath = targetVault!.replace(/\\/g, '/')
            const relativePath = normalizedChangedPath.replace(normalizedVaultPath + '/', '')
            if (relativePath.endsWith('.md')) {
              try {
                const content = await window.electronAPI.readFile(changedFilePath)
                const note = await createNoteFromFile(changedFilePath, relativePath, content)

                const existingNote = useNotesStore.getState().getNoteByPath(relativePath)
                if (existingNote) {
                  useNotesStore.getState().updateNote(existingNote.id, {
                    content,
                    title: note.title,
                    outgoingLinks: note.outgoingLinks,
                    tags: note.tags,
                    modifiedAt: new Date()
                  })
                } else {
                  addNote(note)
                }
              } catch (error) {
                console.error('Fehler beim Laden der geänderten Datei:', error)
              }
            }
          } else if (event === 'unlink') {
            // Auch hier Pfade normalisieren
            const normalizedChangedPath = changedFilePath.replace(/\\/g, '/')
            const normalizedVaultPath = targetVault!.replace(/\\/g, '/')
            const relativePath = normalizedChangedPath.replace(normalizedVaultPath + '/', '')
            const existingNote = useNotesStore.getState().getNoteByPath(relativePath)
            if (existingNote) {
              useNotesStore.getState().removeNote(existingNote.id)
            }
          }
        })

        setLoading(false)
      } catch (error) {
        console.error('Fehler beim Auto-Laden des Vaults:', error)
        setLoading(false)
      }
    }

    loadLastVault()
  }, [onboardingCompleted, vaultPath]) // Reagiert auf Settings-Laden UND Onboarding-Abschluss

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        handleNewNote()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        handleOpenVault()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNewNote, handleOpenVault])
  
  if (!sidebarVisible) {
    return null
  }
  
  return (
    <div className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar-header">
        <h2>MindGraph Notes</h2>
        <div className="sidebar-header-actions">
          {onOpenSearch && (
            <button className="btn-icon" onClick={onOpenSearch} title={t('sidebar.search')}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          <button className="btn-icon" onClick={handleNewNote} title="Neue Notiz (Cmd+N)">
            +
          </button>
          <button className="btn-icon" onClick={handleNewFolder} title="Neuer Ordner">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 4.5A1.5 1.5 0 013.5 3h3.379a1.5 1.5 0 011.06.44l.622.62a.5.5 0 00.354.147H12.5A1.5 1.5 0 0114 5.707V11.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 7v4M6 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
          <button className="btn-icon" onClick={handleOpenVault} title={t('sidebar.openVault')}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 4.5A1.5 1.5 0 013.5 3h3.379a1.5 1.5 0 011.06.44l.622.62a.5.5 0 00.354.147H12.5A1.5 1.5 0 0114 5.707V11.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      
      {vaultPath ? (
        <>
          <div className="vault-info">
            <span className="vault-name">{vaultPath.split('/').pop()}</span>
            <span className="notes-count">{notes.length} {t('sidebar.notesCount')}</span>
            <button
              className={`display-mode-toggle ${fileTreeDisplayMode === 'path' ? 'active' : ''}`}
              onClick={() => setFileTreeDisplayMode(fileTreeDisplayMode === 'name' ? 'path' : 'name')}
              title={fileTreeDisplayMode === 'name' ? 'Volle Pfade anzeigen' : 'Nur Dateinamen anzeigen'}
            >
              {fileTreeDisplayMode === 'name' ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3h8M3 7h8M3 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3h10M4 7h8M6 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          </div>
          <BookmarksBar />
          <div className="sidebar-content">
            <FileTree entries={fileTree} displayMode={fileTreeDisplayMode} />
          </div>
        </>
      ) : (
        <div className="sidebar-empty">
          <p>Kein Vault geöffnet</p>
          <button className="btn-primary" onClick={handleOpenVault}>
            Vault öffnen
          </button>
        </div>
      )}

      {/* Dialog für neue Notiz */}
      {newNoteDialogOpen && (
        <div className="new-note-dialog-overlay" onClick={() => setNewNoteDialogOpen(false)}>
          <div className="new-note-dialog" onClick={(e) => e.stopPropagation()}>
            <input
              ref={newNoteInputRef}
              type="text"
              placeholder="Name der neuen Notiz..."
              value={newNoteName}
              onChange={(e) => setNewNoteName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newNoteName.trim()) handleSubmitNewNote()
                if (e.key === 'Escape') setNewNoteDialogOpen(false)
              }}
              autoFocus
            />
            <div className="new-note-dialog-buttons">
              <button onClick={() => setNewNoteDialogOpen(false)}>
                Abbrechen
              </button>
              <button onClick={handleSubmitNewNote} className="btn-primary" disabled={!newNoteName.trim()}>
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Hilfsfunktion zum rekursiven Laden aller Notizen MIT CACHE
async function loadAllNotes(basePath: string, entries: any[]): Promise<Note[]> {
  const startTime = Date.now()
  const notes: Note[] = []

  // 1. Cache und Dateien mit mtime laden (parallel)
  console.log('[Sidebar] Starte Laden...')
  const [cache, filesWithMtime] = await Promise.all([
    window.electronAPI.loadNotesCache(basePath) as Promise<NotesCache | null>,
    window.electronAPI.getFilesWithMtime(basePath) as Promise<Array<{ path: string; mtime: number }>>
  ])
  console.log(`[Sidebar] Cache und mtime geladen in ${Date.now() - startTime}ms`)

  const cachedNotes = cache?.notes || {}
  const newCache: NotesCache = {
    version: 1,
    vaultPath: basePath,
    notes: {}
  }

  // Map für schnellen mtime-Lookup
  const mtimeMap = new Map(filesWithMtime.map(f => [f.path, f.mtime]))

  // Check if PDF companion feature is enabled
  const { pdfCompanionEnabled } = useUIStore.getState()

  // Sammle alle PDFs und existierende Companions
  const companionPaths = new Set<string>()

  if (pdfCompanionEnabled) {
    function collectPdfCompanions(items: any[]) {
      for (const item of items) {
        if (item.isDirectory && item.children) {
          collectPdfCompanions(item.children)
        } else if (!item.isDirectory && item.path.endsWith('.pdf.md')) {
          companionPaths.add(item.path)
        }
      }
    }
    collectPdfCompanions(entries)
  }

  // 2. Alle Markdown-Pfade sammeln (ohne PDF-Companions wenn pdfCompanionEnabled)
  const allMdPaths = filesWithMtime
    .map(f => f.path)
    .filter(p => !(pdfCompanionEnabled && p.endsWith('.pdf.md')))

  // 3. Trenne gecachte von neuen Dateien
  const cachedPaths: string[] = []
  const newPaths: string[] = []

  for (const relativePath of allMdPaths) {
    const mtime = mtimeMap.get(relativePath)!
    const cached = cachedNotes[relativePath]
    if (cached && cached.mtime === mtime) {
      cachedPaths.push(relativePath)
    } else {
      newPaths.push(relativePath)
    }
  }

  console.log(`[Sidebar] ${cachedPaths.length} aus Cache, ${newPaths.length} neu zu laden`)

  // Collect frontmatter from cache for dataview
  const frontmatterMap = new Map<string, NoteFrontmatter>()

  // 4. Gecachte Notizen OHNE Content laden (super schnell!)
  let fromCache = 0
  for (const relativePath of cachedPaths) {
    const cached = cachedNotes[relativePath]!
    fromCache++
    const note: Note = {
      id: cached.id,
      path: cached.path,
      title: cached.title,
      content: '', // Content wird lazy geladen!
      outgoingLinks: cached.outgoingLinks,
      incomingLinks: [],
      tags: cached.tags,
      headings: cached.headings,
      blocks: cached.blocks,
      sourcePdf: cached.sourcePdf,
      taskStats: cached.taskStats, // Task-Stats aus Cache für Vault-Statistiken
      createdAt: new Date(cached.createdAt),
      modifiedAt: new Date(cached.modifiedAt)
    }
    // Collect cached frontmatter for dataview
    if (cached.frontmatter) {
      frontmatterMap.set(cached.id, cached.frontmatter)
    }
    newCache.notes[relativePath] = cached
    notes.push(note)
  }

  // 5. Nur NEUE Dateien laden und parsen
  let fromDisk = 0
  if (newPaths.length > 0) {
    const readStart = Date.now()
    const newContents = await window.electronAPI.readFilesBatch(basePath, newPaths) as Record<string, string | null>
    console.log(`[Sidebar] ${newPaths.length} neue Dateien in ${Date.now() - readStart}ms gelesen`)

    for (const relativePath of newPaths) {
      const content = newContents[relativePath]
      if (content === null) continue

      const mtime = mtimeMap.get(relativePath)!
      fromDisk++
      try {
        const fullPath = `${basePath}/${relativePath}`
        const note = await createNoteFromFile(fullPath, relativePath, content)

        // Task-Stats extrahieren für Cache
        const taskStats = extractTaskStatsForCache(content)
        note.taskStats = taskStats

        // Frontmatter für Dataview Cache extrahieren
        const frontmatter = parseFrontmatter(content)
        // Add to frontmatter map for dataview
        frontmatterMap.set(note.id, frontmatter)

        // Zum Cache hinzufügen
        newCache.notes[relativePath] = {
          id: note.id,
          path: note.path,
          title: note.title,
          outgoingLinks: note.outgoingLinks,
          tags: note.tags,
          headings: note.headings,
          blocks: note.blocks,
          sourcePdf: note.sourcePdf,
          taskStats: taskStats,
          frontmatter: frontmatter,  // Frontmatter für Dataview
          mtime: mtime,
          createdAt: note.createdAt.getTime(),
          modifiedAt: note.modifiedAt.getTime()
        }
        notes.push(note)
      } catch {
        // Datei konnte nicht geparst werden
      }
    }
  }

  console.log(`[Sidebar] ${fromCache} aus Cache (ohne Content), ${fromDisk} neu geparst`)

  // 5. PDF Companion Handling (auch aus Batch-Ergebnis)
  if (pdfCompanionEnabled && companionPaths.size > 0) {
    // Companions wurden schon im Batch gelesen, hole sie aus allContents
    // Aber sie wurden gefiltert - lade sie separat mit Batch
    const companionPathsArray = Array.from(companionPaths)
    const companionContents = await window.electronAPI.readFilesBatch(basePath, companionPathsArray) as Record<string, string | null>

    for (const companionPath of companionPathsArray) {
      const content = companionContents[companionPath]
      if (!content) continue

      const mtime = mtimeMap.get(companionPath)
      const cached = cachedNotes[companionPath]

      // Extrahiere source PDF
      const sourceMatch = content.match(/source:\s*"([^"]+)"/)
      const companionDir = companionPath.substring(0, companionPath.lastIndexOf('/'))
      const sourcePdf = sourceMatch
        ? (companionDir ? `${companionDir}/${sourceMatch[1]}` : sourceMatch[1])
        : undefined

      if (cached && mtime && cached.mtime === mtime) {
        // Cache-Hit
        const note: Note = {
          id: cached.id,
          path: cached.path,
          title: cached.title,
          content,
          outgoingLinks: cached.outgoingLinks,
          incomingLinks: [],
          tags: cached.tags,
          headings: cached.headings,
          blocks: cached.blocks,
          sourcePdf,
          taskStats: cached.taskStats,
          createdAt: new Date(cached.createdAt),
          modifiedAt: new Date(cached.modifiedAt)
        }
        newCache.notes[companionPath] = cached
        notes.push(note)
      } else {
        // Cache-Miss
        try {
          const fullPath = `${basePath}/${companionPath}`
          const note = await createNoteFromFile(fullPath, companionPath, content)
          note.sourcePdf = sourcePdf

          // Task-Stats extrahieren
          const taskStats = extractTaskStatsForCache(content)
          note.taskStats = taskStats

          if (mtime) {
            newCache.notes[companionPath] = {
              id: note.id,
              path: note.path,
              title: note.title,
              outgoingLinks: note.outgoingLinks,
              tags: note.tags,
              headings: note.headings,
              blocks: note.blocks,
              sourcePdf,
              taskStats,
              mtime,
              createdAt: note.createdAt.getTime(),
              modifiedAt: note.modifiedAt.getTime()
            }
          }
          notes.push(note)
        } catch {
          // Companion konnte nicht geparst werden
        }
      }
    }
  }

  // 6. Populate dataview store's frontmatter cache
  // This is critical because notes are loaded without content, so frontmatter must come from cache
  const dataviewState = useDataviewStore.getState()
  const currentFmCache = new Map(dataviewState.frontmatterCache)
  for (const [noteId, fm] of frontmatterMap) {
    currentFmCache.set(noteId, fm)
  }
  useDataviewStore.setState({ frontmatterCache: currentFmCache })
  console.log(`[Sidebar] Dataview frontmatter cache populated with ${frontmatterMap.size} entries`)

  // 7. Cache speichern (im Hintergrund)
  window.electronAPI.saveNotesCache(basePath, newCache).catch(console.error)

  const elapsed = Date.now() - startTime
  console.log(`[Sidebar] ${notes.length} Notizen in ${elapsed}ms geladen (${fromCache} aus Cache, ${fromDisk} neu geparst)`)

  return notes
}
