import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
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
import { getVaultTaskStats } from './utils/linkExtractor'
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
  const { viewMode, setViewMode, toggleSidebar, sidebarVisible, splitPosition, setSplitPosition, sidebarWidth, setSidebarWidth, theme, setTheme, accentColor, backgroundColor, fontFamily, setPendingTemplateInsert, textSplitEnabled, setTextSplitEnabled, textSplitPosition, setTextSplitPosition } = useUIStore()
  const { notes, vaultPath, selectNote, selectedPdfPath, selectedImagePath, secondarySelectedNoteId } = useNotesStore()
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
  const isTextSplitDraggingRef = useRef(false)

  // Link-Count und Task-Stats verzögert berechnen für schnelleren UI-Start
  const [linkCount, setLinkCount] = useState(0)
  const [taskStats, setTaskStats] = useState<ReturnType<typeof getVaultTaskStats>>({
    total: 0, completed: 0, open: 0, critical: 0, overdue: 0
  })

  useEffect(() => {
    if (notes.length === 0) {
      setLinkCount(0)
      setTaskStats({ total: 0, completed: 0, open: 0, critical: 0, overdue: 0 })
      return
    }

    // Verzögert berechnen damit UI sofort nutzbar ist
    const timer = setTimeout(() => {
      // Link-Count
      const count = notes.reduce((acc, note) => acc + note.outgoingLinks.length, 0)
      setLinkCount(count)

      // Task-Stats
      const stats = getVaultTaskStats(notes)
      setTaskStats(stats)
    }, 100) // Kurze Verzögerung, UI first

    return () => clearTimeout(timer)
  }, [notes])

  // UI-Settings beim App-Start laden
  useEffect(() => {
    initializeUISettings()
  }, [])

  // Reminder-System starten - verzögert um UI nicht zu blockieren
  useEffect(() => {
    if (notes.length === 0) return

    // 2 Sekunden warten bis UI geladen ist, dann Reminders starten
    const timer = setTimeout(() => {
      startChecking(notes)
    }, 2000)

    return () => {
      clearTimeout(timer)
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

  // Text-Split Divider Drag-Handler
  const handleTextSplitDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isTextSplitDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isTextSplitDraggingRef.current || !workspaceRef.current) return

      const rect = workspaceRef.current.getBoundingClientRect()
      const newPosition = ((moveEvent.clientX - rect.left) / rect.width) * 100
      setTextSplitPosition(newPosition)
    }

    const handleMouseUp = () => {
      isTextSplitDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [setTextSplitPosition])

  return (
    <ReactFlowProvider>
      <div className="app">
        <div className="titlebar">
          <div className="titlebar-left">
            <div className="view-mode-switcher">
              <button className="view-mode-btn" onClick={toggleSidebar} title="Sidebar umschalten">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {sidebarVisible ? (
                    <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>
                  ) : (
                    <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="14 9 17 12 14 15"/></>
                  )}
                </svg>
              </button>
            </div>
            <div
              className="app-logo"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Light Mode aktivieren' : 'Dark Mode aktivieren'}
            >
              <svg width="22" height="22" viewBox="0 0 100 100" fill="none">
                <circle className="logo-bg" cx="50" cy="50" r="48"/>
                {/* Verbindungslinien */}
                <g className="logo-lines" stroke="var(--accent-color)" strokeWidth="2.5">
                  <line x1="50" y1="22" x2="35" y2="38"/>
                  <line x1="50" y1="22" x2="65" y2="38"/>
                  <line x1="35" y1="38" x2="65" y2="38"/>
                  <line x1="35" y1="38" x2="25" y2="58"/>
                  <line x1="35" y1="38" x2="50" y2="52"/>
                  <line x1="65" y1="38" x2="75" y2="58"/>
                  <line x1="65" y1="38" x2="50" y2="52"/>
                  <line x1="25" y1="58" x2="50" y2="52"/>
                  <line x1="75" y1="58" x2="50" y2="52"/>
                  <line x1="25" y1="58" x2="38" y2="75"/>
                  <line x1="50" y1="52" x2="38" y2="75"/>
                  <line x1="50" y1="52" x2="62" y2="75"/>
                  <line x1="75" y1="58" x2="62" y2="75"/>
                  <line x1="38" y1="75" x2="62" y2="75"/>
                </g>
                {/* Nodes */}
                <g className="logo-nodes" fill="var(--accent-color)">
                  <circle cx="50" cy="22" r="7"/>
                  <circle cx="35" cy="38" r="7"/>
                  <circle cx="65" cy="38" r="7"/>
                  <circle cx="25" cy="58" r="7"/>
                  <circle cx="50" cy="52" r="7"/>
                  <circle cx="75" cy="58" r="7"/>
                  <circle cx="38" cy="75" r="7"/>
                  <circle cx="62" cy="75" r="7"/>
                </g>
              </svg>
            </div>
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
              <span className="view-mode-separator" />
              <button
                className={`view-mode-btn ${textSplitEnabled ? 'active' : ''}`}
                onClick={() => setTextSplitEnabled(!textSplitEnabled)}
                title="Text-Split: Zwei Notizen vergleichen (Cmd/Ctrl+Klick in Sidebar für zweite Notiz)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="8" height="18" rx="1"/>
                  <rect x="13" y="3" width="8" height="18" rx="1"/>
                </svg>
              </button>
            </div>
          </div>
          
          <div className="titlebar-right">
            <div className="view-mode-switcher">
              <button
                className="view-mode-btn"
                onClick={() => setSettingsOpen(true)}
                title="Einstellungen (Cmd+,)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
                            <button
                className={`view-mode-btn ${terminalVisible ? 'active' : ''}`}
                onClick={() => setTerminalVisible(!terminalVisible)}
                title="Terminal ein/ausblenden"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 17 10 11 4 5"/>
                  <line x1="12" y1="19" x2="20" y2="19"/>
                </svg>
              </button>
            </div>
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

            <div className={`workspace ${viewMode} ${textSplitEnabled ? 'text-split' : ''}`} ref={workspaceRef}>
              {/* Primary Editor Panel */}
              <div
                className="editor-panel"
                style={{
                  display: viewMode === 'canvas' ? 'none' : 'flex',
                  flex: textSplitEnabled && viewMode === 'editor' ? `0 0 ${textSplitPosition}%` : (viewMode === 'split' ? `0 0 ${splitPosition}%` : 1)
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

              {/* Text Split Divider */}
              {textSplitEnabled && viewMode === 'editor' && (
                <div
                  className="text-split-divider"
                  onMouseDown={handleTextSplitDividerMouseDown}
                />
              )}

              {/* Secondary Editor Panel (Text Split) */}
              {textSplitEnabled && viewMode === 'editor' && (
                <div
                  className="editor-panel editor-panel-secondary"
                  style={{ flex: `0 0 ${100 - textSplitPosition}%` }}
                >
                  {secondarySelectedNoteId ? (
                    <>
                      <MarkdownEditor isSecondary />
                      <BacklinksPanel isSecondary />
                    </>
                  ) : (
                    <div className="text-split-placeholder">
                      <div className="text-split-placeholder-content">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="12" y1="18" x2="12" y2="12"/>
                          <line x1="9" y1="15" x2="15" y2="15"/>
                        </svg>
                        <p>Cmd/Ctrl+Klick auf eine Notiz</p>
                        <p className="text-split-placeholder-hint">um sie hier zu öffnen</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
          {taskStats.total > 0 && (
            <>
              <span className="status-separator">|</span>
              <span className="status-item status-tasks">
                <span className="task-count">
                  ✓ {taskStats.completed}/{taskStats.total}
                </span>
                {taskStats.open > 0 && (
                  <span className="task-open" title="Offene Tasks">
                    • {taskStats.open} offen
                  </span>
                )}
                {taskStats.critical > 0 && (
                  <span className="task-critical" title="Kritische Tasks">
                    • {taskStats.critical} kritisch
                  </span>
                )}
                {taskStats.overdue > 0 && (
                  <span className="task-overdue" title="Überfällige Tasks">
                    • {taskStats.overdue} überfällig
                  </span>
                )}
              </span>
            </>
          )}
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
