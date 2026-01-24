import React, { useEffect, useCallback } from 'react'
import { FileTree } from './FileTree'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useGraphStore } from '../../stores/graphStore'

export const Sidebar: React.FC = () => {
  const { vaultPath, fileTree, notes, setVaultPath, setFileTree, setNotes, addNote, selectNote, setLoading } = useNotesStore()
  const { sidebarWidth, sidebarVisible, fileTreeDisplayMode, setFileTreeDisplayMode } = useUIStore()
  const loadGraphData = useGraphStore((s) => s.loadFromVault)
  const resetGraphStore = useGraphStore((s) => s.reset)

  const handleOpenVault = useCallback(async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available')
      return
    }

    try {
      const path = await window.electronAPI.openVault()
      if (!path) return

      setLoading(true)

      // WICHTIG: Alten Vault aufräumen bevor neuer geladen wird
      window.electronAPI.unwatchDirectory() // Stoppt alten File-Watcher
      resetGraphStore() // Setzt Graph-Positionen zurück
      setNotes([]) // Leert alte Notizen
      setFileTree([]) // Leert alten Dateibaum

      setVaultPath(path)

      const tree = await window.electronAPI.readDirectory(path)
      setFileTree(tree)

      const loadedNotes = await loadAllNotes(path, tree)
      setNotes(loadedNotes)

      // Graph-Daten aus dem Vault laden
      await loadGraphData(path)

      window.electronAPI.watchDirectory(path, async (event: string, changedFilePath: string) => {
        console.log('File changed:', event, changedFilePath)

        // Dateibaum neu laden
        const newTree = await window.electronAPI.readDirectory(path)
        setFileTree(newTree)

        // Bei neuer oder geänderter Datei: Notizen neu laden
        if (event === 'add' || event === 'change') {
          const relativePath = changedFilePath.replace(path + '/', '')
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
          // Datei gelöscht
          const relativePath = changedFilePath.replace(path + '/', '')
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
  }, [setVaultPath, setFileTree, setNotes, setLoading, loadGraphData, resetGraphStore])
  
  const handleNewNote = useCallback(async () => {
    if (!window.electronAPI) return
    
    if (!vaultPath) {
      // Vault muss zuerst geöffnet werden
      handleOpenVault()
      return
    }
    
    try {
      // Native Save-Dialog öffnen
      const filePath = await window.electronAPI.promptNewNote()
      if (!filePath) return
      
      // Notiz erstellen
      const result = await window.electronAPI.createNote(filePath)
      
      // Dateibaum neu laden
      const tree = await window.electronAPI.readDirectory(vaultPath)
      setFileTree(tree)
      
      // Prüfen ob die Datei im Vault liegt
      if (filePath.startsWith(vaultPath)) {
        const relativePath = filePath.replace(vaultPath + '/', '')
        const note = await createNoteFromFile(filePath, relativePath, result.content)
        addNote(note)
        selectNote(note.id)
      }
    } catch (error) {
      console.error('Fehler beim Erstellen der Notiz:', error)
    }
  }, [vaultPath, setFileTree, addNote, selectNote, handleOpenVault])

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

  // Beim Start: Letzten Vault automatisch laden
  useEffect(() => {
    const loadLastVault = async () => {
      if (!window.electronAPI || vaultPath) return

      try {
        const lastVault = await window.electronAPI.getLastVault()
        if (lastVault) {
          console.log('[Sidebar] Auto-loading last vault:', lastVault)
          setLoading(true)

          setVaultPath(lastVault)

          const tree = await window.electronAPI.readDirectory(lastVault)
          setFileTree(tree)

          const loadedNotes = await loadAllNotes(lastVault, tree)
          setNotes(loadedNotes)

          // Graph-Daten aus dem Vault laden
          await loadGraphData(lastVault)

          // File-Watcher starten
          window.electronAPI.watchDirectory(lastVault, async (event: string, changedFilePath: string) => {
            console.log('File changed:', event, changedFilePath)

            const newTree = await window.electronAPI.readDirectory(lastVault)
            setFileTree(newTree)

            if (event === 'add' || event === 'change') {
              const relativePath = changedFilePath.replace(lastVault + '/', '')
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
              const relativePath = changedFilePath.replace(lastVault + '/', '')
              const existingNote = useNotesStore.getState().getNoteByPath(relativePath)
              if (existingNote) {
                useNotesStore.getState().removeNote(existingNote.id)
              }
            }
          })

          setLoading(false)
        }
      } catch (error) {
        console.error('Fehler beim Auto-Laden des Vaults:', error)
        setLoading(false)
      }
    }

    loadLastVault()
  }, []) // Nur einmal beim Mount

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
        <button className="btn-icon" onClick={handleNewNote} title="Neue Notiz (Cmd+N)">
          +
        </button>
        <button className="btn-icon" onClick={handleNewFolder} title="Neuer Ordner">
          📂
        </button>
        <button className="btn-icon" onClick={handleOpenVault} title="Vault öffnen (Cmd+O)">
          📁
        </button>
      </div>
      
      {vaultPath ? (
        <>
          <div className="vault-info">
            <span className="vault-name">{vaultPath.split('/').pop()}</span>
            <span className="notes-count">{notes.length} Notizen</span>
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
    </div>
  )
}

// Hilfsfunktion zum rekursiven Laden aller Notizen
async function loadAllNotes(basePath: string, entries: any[]): Promise<any[]> {
  const notes: any[] = []

  // Check if PDF companion feature is enabled
  const { pdfCompanionEnabled } = useUIStore.getState()

  // Sammle alle PDFs und existierende Companions
  const pdfPaths: string[] = []
  const existingCompanions: { path: string; content: string }[] = []

  function collectFiles(items: any[]) {
    for (const item of items) {
      if (item.isDirectory && item.children) {
        collectFiles(item.children)
      } else if (!item.isDirectory) {
        if (item.fileType === 'pdf') {
          pdfPaths.push(item.path)
        } else if (item.path.endsWith('.pdf.md')) {
          existingCompanions.push({ path: item.path, content: '' })
        }
      }
    }
  }

  if (pdfCompanionEnabled) {
    collectFiles(entries)
  }

  // Erstelle Set der PDF-Pfade für schnelle Lookup
  const pdfPathSet = new Set(pdfPaths)
  // Map von PDF-Pfad zu Companion-Pfad (für Companions die bereits zum PDF gehören)
  const pdfToCompanion = new Map<string, string>()
  // Orphaned Companions (deren source PDF nicht mehr existiert)
  const orphanedCompanions: { path: string; content: string; sourcePdf: string }[] = []

  // Lade Companion-Inhalte und prüfe ob source PDF noch existiert
  for (const companion of existingCompanions) {
    try {
      const fullPath = `${basePath}/${companion.path}`
      const content = await window.electronAPI.readFile(fullPath)
      companion.content = content

      // Extrahiere source aus Frontmatter
      const sourceMatch = content.match(/source:\s*"([^"]+)"/)
      if (sourceMatch) {
        const sourcePdf = sourceMatch[1]
        // Finde den vollen Pfad zur source PDF
        const companionDir = companion.path.substring(0, companion.path.lastIndexOf('/'))
        const expectedPdfPath = companionDir ? `${companionDir}/${sourcePdf}` : sourcePdf

        if (pdfPathSet.has(expectedPdfPath)) {
          // PDF existiert noch, alles ok
          pdfToCompanion.set(expectedPdfPath, companion.path)
        } else {
          // PDF existiert nicht mehr - orphaned companion
          orphanedCompanions.push({ ...companion, sourcePdf: expectedPdfPath })
        }
      }
    } catch (error) {
      console.error(`Fehler beim Lesen von ${companion.path}:`, error)
    }
  }

  // Finde PDFs ohne Companions
  const pdfsWithoutCompanions = pdfPaths.filter(pdf => !pdfToCompanion.has(pdf))

  // Versuche orphaned Companions mit PDFs ohne Companions zu matchen
  // (basierend auf gleichem Verzeichnis)
  for (const orphan of orphanedCompanions) {
    const orphanDir = orphan.path.substring(0, orphan.path.lastIndexOf('/'))

    // Suche PDF im selben Verzeichnis ohne Companion
    const matchingPdf = pdfsWithoutCompanions.find(pdf => {
      const pdfDir = pdf.substring(0, pdf.lastIndexOf('/'))
      return pdfDir === orphanDir
    })

    if (matchingPdf) {
      // Sync: Aktualisiere Companion mit neuem PDF-Namen
      console.log(`[PDF Sync] Synchronisiere ${orphan.path} -> ${matchingPdf}`)
      const syncResult = await window.electronAPI.syncPdfCompanion(orphan.path, matchingPdf, basePath)

      if (syncResult.success && syncResult.newPath && syncResult.content) {
        // Entferne PDF aus der Liste ohne Companions
        const idx = pdfsWithoutCompanions.indexOf(matchingPdf)
        if (idx > -1) pdfsWithoutCompanions.splice(idx, 1)

        // Füge als normalen Companion hinzu
        pdfToCompanion.set(matchingPdf, syncResult.newPath)

        // Erstelle Note
        const fullPath = `${basePath}/${syncResult.newPath}`
        const note = await createNoteFromFile(fullPath, syncResult.newPath, syncResult.content)
        note.sourcePdf = matchingPdf
        notes.push(note)
      }
    }
  }

  // Erstelle neue Companions für verbleibende PDFs ohne Companions
  const companionPaths = new Set<string>()
  for (const pdfPath of pdfsWithoutCompanions) {
    try {
      const result = await window.electronAPI.ensurePdfCompanion(pdfPath, basePath)
      companionPaths.add(result.path)
      pdfToCompanion.set(pdfPath, result.path)

      const fullPath = `${basePath}/${result.path}`
      const note = await createNoteFromFile(fullPath, result.path, result.content)
      note.sourcePdf = pdfPath
      notes.push(note)
    } catch (error) {
      console.error(`Fehler beim Erstellen der PDF-Companion für ${pdfPath}:`, error)
    }
  }

  // Lade existierende Companions die bereits gematcht wurden
  for (const [pdfPath, companionPath] of pdfToCompanion.entries()) {
    // Überspringe wenn bereits als Note hinzugefügt
    if (notes.some(n => n.path === companionPath)) continue

    try {
      const fullPath = `${basePath}/${companionPath}`
      const content = await window.electronAPI.readFile(fullPath)
      const note = await createNoteFromFile(fullPath, companionPath, content)
      note.sourcePdf = pdfPath
      notes.push(note)
      companionPaths.add(companionPath)
    } catch (error) {
      console.error(`Fehler beim Laden von ${companionPath}:`, error)
    }
  }

  // Lade normale Markdown-Dateien (aber keine PDF-Companions)
  async function loadFromEntries(items: any[]) {
    for (const entry of items) {
      if (entry.isDirectory && entry.children) {
        await loadFromEntries(entry.children)
      } else if (!entry.isDirectory && entry.path.endsWith('.md')) {
        // Überspringe PDF-Companion-Dateien
        if (entry.path.endsWith('.pdf.md') || companionPaths.has(entry.path)) {
          continue
        }
        try {
          const fullPath = `${basePath}/${entry.path}`
          const content = await window.electronAPI.readFile(fullPath)
          const note = await createNoteFromFile(fullPath, entry.path, content)
          notes.push(note)
        } catch (error) {
          console.error(`Fehler beim Laden von ${entry.path}:`, error)
        }
      }
    }
  }

  await loadFromEntries(entries)
  return notes
}
