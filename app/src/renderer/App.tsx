import React, { useState, useCallback, useRef, useEffect } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { Sidebar } from './components/Sidebar/Sidebar'
import { MarkdownEditor } from './components/Editor/MarkdownEditor'
import { BacklinksPanel } from './components/Editor/BacklinksPanel'
import { GraphCanvas } from './components/Canvas/GraphCanvas'
import { PDFViewer } from './components/PDFViewer/PDFViewer'
import { ImageViewer } from './components/ImageViewer/ImageViewer'
import { Terminal } from './components/Terminal/Terminal'
import { QuickSearch } from './components/QuickSearch/QuickSearch'
import { ZoteroSearch } from './components/ZoteroSearch/ZoteroSearch'
import { QuickSwitcher } from './components/QuickSwitcher/QuickSwitcher'
import { TemplatePicker } from './components/TemplatePicker/TemplatePicker'
import { TemplateSettings } from './components/TemplatePicker/TemplateSettings'
import { Settings } from './components/Settings/Settings'
import { useUIStore, ACCENT_COLORS, FONT_FAMILIES, BACKGROUND_COLORS, initializeUISettings } from './stores/uiStore'
import { useTranslation } from './utils/translations'
import { useNotesStore } from './stores/notesStore'
import { useReminderStore } from './stores/reminderStore'
import './styles/index.css'

type ViewMode = 'editor' | 'split' | 'canvas'

const ViewModeButton: React.FC<{ 
  mode: ViewMode
  currentMode: ViewMode
  onClick: () => void
  children: React.ReactNode 
}> = ({ mode, currentMode, onClick, children }) => (
  <button 
    className={`view-mode-btn ${currentMode === mode ? 'active' : ''}`}
    onClick={onClick}
  >
    {children}
  </button>
)

const App: React.FC = () => {
  const { viewMode, setViewMode, toggleSidebar, sidebarVisible, splitPosition, setSplitPosition, sidebarWidth, setSidebarWidth, theme, setTheme, accentColor, backgroundColor, fontFamily, setPendingTemplateInsert } = useUIStore()
  const { notes, vaultPath, selectNote, selectedPdfPath, selectedImagePath } = useNotesStore()
  const { t } = useTranslation()
  const { startChecking, stopChecking } = useReminderStore()
  const [terminalVisible, setTerminalVisible] = useState(false)
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const [zoteroSearchOpen, setZoteroSearchOpen] = useState(false)
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [templateSettingsOpen, setTemplateSettingsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingNoteTitle, setPendingNoteTitle] = useState<string | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const contentAreaRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const isSidebarDraggingRef = useRef(false)

  const linkCount = notes.reduce((acc, note) => acc + note.outgoingLinks.length, 0)

  // UI-Settings beim App-Start laden
  useEffect(() => {
    initializeUISettings()
  }, [])

  // Reminder-System starten wenn Notizen geladen sind
  useEffect(() => {
    if (notes.length > 0) {
      startChecking(notes)
    }
    return () => {
      stopChecking()
    }
  }, [notes, startChecking, stopChecking])

  // Notification-Klick Handler: Notiz auswählen wenn User auf Notification klickt
  useEffect(() => {
    window.electronAPI.onNotificationClicked((noteId: string) => {
      console.log('[App] Notification clicked, selecting note:', noteId)
      selectNote(noteId)
    })
  }, [selectNote])

  // Theme auf document anwenden
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', theme)
    }
  }, [theme])

  // Akzentfarbe auf document anwenden
  useEffect(() => {
    const root = document.documentElement
    const colors = ACCENT_COLORS[accentColor]
    root.style.setProperty('--accent-color', colors.color)
    root.style.setProperty('--accent-hover', colors.hover)
    root.style.setProperty('--accent-subtle', `${colors.color}20`)
  }, [accentColor])

  // Schriftart auf document anwenden
  useEffect(() => {
    const root = document.documentElement
    const font = FONT_FAMILIES[fontFamily]
    root.style.setProperty('--font-family', font.value)
  }, [fontFamily])

  // Hintergrundfarbe auf document anwenden
  useEffect(() => {
    const root = document.documentElement
    const bg = BACKGROUND_COLORS[backgroundColor]
    root.style.setProperty('--bg-primary-custom', bg.light)
    root.style.setProperty('--bg-primary-custom-dark', bg.dark)
  }, [backgroundColor])

  // Theme Toggle Handler
  const toggleTheme = useCallback(() => {
    if (theme === 'dark') {
      setTheme('light')
    } else {
      setTheme('dark')
    }
  }, [theme, setTheme])

  // Quick Switcher: Notiz erstellen
  const handleCreateNoteFromSwitcher = useCallback((title: string) => {
    setPendingNoteTitle(title)
    setTemplatePickerOpen(true)
  }, [])

  // Template ausgewählt: Neue Notiz erstellen ODER in aktuelle Notiz einfügen
  const handleTemplateSelect = useCallback(async (content: string, cursorPosition?: number) => {
    // Fall 1: Neue Notiz erstellen (von Quick Switcher)
    if (pendingNoteTitle && vaultPath) {
      const fileName = `${pendingNoteTitle}.md`
      const filePath = `${vaultPath}/${fileName}`

      try {
        await window.electronAPI.writeFile(filePath, content)
        // Notiz wird automatisch über FileWatcher erkannt
        setTimeout(() => {
          const note = notes.find(n => n.title === pendingNoteTitle)
          if (note) {
            selectNote(note.id)
          }
        }, 200)
      } catch (error) {
        console.error('Fehler beim Erstellen der Notiz:', error)
      }

      setPendingNoteTitle(null)
      return
    }

    // Fall 2: In aktuelle Notiz einfügen (Cmd+Shift+T alleine)
    setPendingTemplateInsert({ content, cursorPosition })
  }, [pendingNoteTitle, vaultPath, notes, selectNote, setPendingTemplateInsert])

  // Globale Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd+P / Ctrl+P für Schnellsuche
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        setQuickSearchOpen(true)
      }
      // Cmd+Shift+Z / Ctrl+Shift+Z für Zotero-Suche
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        setZoteroSearchOpen(true)
      }
      // Cmd+K / Ctrl+K für Quick Switcher (wie VS Code, Slack)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setQuickSwitcherOpen(true)
      }
      // Cmd+Shift+T / Ctrl+Shift+T für Template Picker
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        setTemplatePickerOpen(true)
      }
      // Cmd+, für Einstellungen (wie bei macOS üblich)
      if ((e.metaKey || e.ctrlKey) && e.key === ',' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        setSettingsOpen(true)
      }
      // Cmd+Shift+, für Template-Einstellungen (Legacy)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ',') {
        e.preventDefault()
        e.stopPropagation()
        setSettingsOpen(true) // Öffnet jetzt auch Settings
      }
    }

    // Capture-Phase verwenden, damit Event vor anderen Handlern abgefangen wird
    window.addEventListener('keydown', handleGlobalKeyDown, true)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true)
  }, [])

  // Sidebar-Divider Drag-Handler
  const handleSidebarDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isSidebarDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isSidebarDraggingRef.current) return
      // Min 180px, Max 500px
      const newWidth = Math.max(180, Math.min(500, moveEvent.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      isSidebarDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [setSidebarWidth])

  // Split-Divider Drag-Handler
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !workspaceRef.current) return

      const rect = workspaceRef.current.getBoundingClientRect()
      const newPosition = ((moveEvent.clientX - rect.left) / rect.width) * 100
      setSplitPosition(newPosition)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [setSplitPosition])
  
  return (
    <ReactFlowProvider>
      <div className="app">
        <div className="titlebar">
          <div className="titlebar-left">
            <button className="btn-icon" onClick={toggleSidebar} title="Sidebar umschalten">
              {sidebarVisible ? '◀' : '▶'}
            </button>
            <span className="app-title">MindGraph Notes</span>
          </div>
          
          <div className="titlebar-center">
            <div className="view-mode-switcher">
              <ViewModeButton mode="editor" currentMode={viewMode} onClick={() => setViewMode('editor')}>
                {t('viewMode.editor')}
              </ViewModeButton>
              <ViewModeButton mode="split" currentMode={viewMode} onClick={() => setViewMode('split')}>
                {t('viewMode.split')}
              </ViewModeButton>
              <ViewModeButton mode="canvas" currentMode={viewMode} onClick={() => setViewMode('canvas')}>
                {t('viewMode.canvas')}
              </ViewModeButton>
            </div>
          </div>
          
          <div className="titlebar-right">
            <button
              className="btn-icon"
              onClick={() => setSettingsOpen(true)}
              title="Einstellungen (Cmd+,)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 1V3M8 13V15M1 8H3M13 8H15M3 3L4.5 4.5M11.5 11.5L13 13M3 13L4.5 11.5M11.5 4.5L13 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              className={`btn-icon ${terminalVisible ? 'active' : ''}`}
              onClick={() => setTerminalVisible(!terminalVisible)}
              title="Terminal ein/ausblenden (Claude Code)"
            >
              ⌘
            </button>
          </div>
        </div>
        
        <div className="main-content">
          <div className="content-area" ref={contentAreaRef}>
            {sidebarVisible && (
              <>
                <div style={{ width: sidebarWidth, minWidth: sidebarWidth, flexShrink: 0 }}>
                  <Sidebar />
                </div>
                <div
                  className="sidebar-divider"
                  onMouseDown={handleSidebarDividerMouseDown}
                />
              </>
            )}

            <div className={`workspace ${viewMode}`} ref={workspaceRef}>
              <div
                className="editor-panel"
                style={{
                  display: viewMode === 'canvas' ? 'none' : 'flex',
                  flex: viewMode === 'split' ? `0 0 ${splitPosition}%` : 1
                }}
              >
                {selectedPdfPath && vaultPath ? (
                  <PDFViewer
                    filePath={`${vaultPath}/${selectedPdfPath}`}
                    fileName={selectedPdfPath.split('/').pop() || selectedPdfPath}
                  />
                ) : selectedImagePath && vaultPath ? (
                  <ImageViewer
                    filePath={`${vaultPath}/${selectedImagePath}`}
                    fileName={selectedImagePath.split('/').pop() || selectedImagePath}
                  />
                ) : (
                  <>
                    <MarkdownEditor />
                    <BacklinksPanel />
                  </>
                )}
              </div>

              {viewMode === 'split' && (
                <div
                  className="split-divider"
                  onMouseDown={handleDividerMouseDown}
                />
              )}

              <div
                className="canvas-panel"
                style={{
                  display: viewMode === 'editor' ? 'none' : 'flex',
                  flex: viewMode === 'split' ? `0 0 ${100 - splitPosition}%` : 1
                }}
              >
                <GraphCanvas />
              </div>
            </div>
          </div>

          {/* Terminal am unteren Rand - immer verfügbar */}
          <Terminal
            visible={terminalVisible}
            onToggle={() => setTerminalVisible(false)}
          />
        </div>
        
        <div className="statusbar">
          <span className="status-item">
            {vaultPath ? vaultPath.split('/').pop() : t('statusbar.noVault')}
          </span>
          <span className="status-separator">|</span>
          <span className="status-item">{notes.length} {t('statusbar.notes')}</span>
          <span className="status-separator">|</span>
          <span className="status-item">{linkCount} {t('statusbar.links')}</span>
          <span className="status-separator">|</span>
          <button
            className="status-btn"
            onClick={() => setTerminalVisible(!terminalVisible)}
          >
            {terminalVisible ? '▼ Terminal' : '▲ Terminal'}
          </button>
        </div>
      </div>

      {/* Quick Search Modal */}
      <QuickSearch
        isOpen={quickSearchOpen}
        onClose={() => setQuickSearchOpen(false)}
      />

      {/* Zotero Search Modal */}
      <ZoteroSearch
        isOpen={zoteroSearchOpen}
        onClose={() => setZoteroSearchOpen(false)}
      />

      {/* Quick Switcher Modal (Cmd+K) */}
      <QuickSwitcher
        isOpen={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
        onSelectNote={(noteId) => {
          selectNote(noteId)
          setQuickSwitcherOpen(false)
        }}
        onCreateNote={handleCreateNoteFromSwitcher}
      />

      {/* Template Picker Modal (Cmd+Shift+T) */}
      <TemplatePicker
        isOpen={templatePickerOpen}
        onClose={() => {
          setTemplatePickerOpen(false)
          setPendingNoteTitle(null)
        }}
        onSelect={handleTemplateSelect}
        onOpenSettings={() => setTemplateSettingsOpen(true)}
        noteTitle={pendingNoteTitle || undefined}
      />

      {/* Template Settings Modal (Legacy - jetzt in Settings integriert) */}
      <TemplateSettings
        isOpen={templateSettingsOpen}
        onClose={() => setTemplateSettingsOpen(false)}
      />

      {/* Settings Modal (Cmd+,) */}
      <Settings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </ReactFlowProvider>
  )
}

export default App
