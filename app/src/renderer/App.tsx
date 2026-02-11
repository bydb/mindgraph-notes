import React, { useState, useCallback, useRef, useEffect } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { Sidebar } from './components/Sidebar/Sidebar'
import { MarkdownEditor } from './components/Editor/MarkdownEditor'
import { BacklinksPanel } from './components/Editor/BacklinksPanel'
import { GraphCanvas } from './components/Canvas/GraphCanvas'
import { LocalCanvas } from './components/Canvas/LocalCanvas'
import { PDFViewer } from './components/PDFViewer/PDFViewer'
import { ImageViewer } from './components/ImageViewer/ImageViewer'
import { Terminal } from './components/Terminal/Terminal'
import { QuickSearch } from './components/QuickSearch/QuickSearch'
import { ZoteroSearch } from './components/ZoteroSearch/ZoteroSearch'
import { QuickSwitcher } from './components/QuickSwitcher/QuickSwitcher'
import { TemplatePicker } from './components/TemplatePicker/TemplatePicker'
import { TemplateSettings } from './components/TemplatePicker/TemplateSettings'
import { Settings } from './components/Settings/Settings'
import { WhatsNew } from './components/WhatsNew/WhatsNew'
import { Onboarding } from './components/Onboarding/Onboarding'
import { UpdateNotification } from './components/UpdateNotification/UpdateNotification'
import { QuizModal } from './components/Quiz/QuizModal'
import { FlashcardsPanel, FlashcardStudy, FlashcardEditor } from './components/Flashcards'
import { useFlashcardStore } from './stores/flashcardStore'
import { OverduePanel } from './components/OverduePanel/OverduePanel'
import { TagsPanel } from './components/TagsPanel/TagsPanel'
import { SmartConnectionsPanel } from './components/SmartConnectionsPanel/SmartConnectionsPanel'
import { NotesChat } from './components/NotesChat/NotesChat'
import { TabBar } from './components/TabBar/TabBar'
import { useUIStore, ACCENT_COLORS, FONT_FAMILIES, BACKGROUND_COLORS, initializeUISettings } from './stores/uiStore'
import { useTabStore } from './stores/tabStore'
import { useTranslation } from './utils/translations'
import { useNotesStore } from './stores/notesStore'
import { useReminderStore } from './stores/reminderStore'
import { useSyncStore } from './stores/syncStore'
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
  const { viewMode, setViewMode, toggleSidebar, sidebarVisible, splitPosition, setSplitPosition, sidebarWidth, setSidebarWidth, theme, setTheme, accentColor, backgroundColor, fontFamily, setPendingTemplateInsert, textSplitEnabled, setTextSplitEnabled, textSplitPosition, setTextSplitPosition, smartConnectionsEnabled, notesChatEnabled, flashcardsEnabled, customLogo, customAccentColor, customBackgroundColorLight, customBackgroundColorDark } = useUIStore()
  const { notes, vaultPath, selectNote, selectedPdfPath, selectedImagePath, secondarySelectedNoteId, navigateBack, navigateForward, selectedNoteId } = useNotesStore()
  const { tabs, activeTabId, openEditorTab, setActiveTab, closeTab } = useTabStore()
  const activeTab = tabs.find(t => t.id === activeTabId)
  const { t } = useTranslation()
  const { startChecking, stopChecking } = useReminderStore()
  const syncEnabled = useSyncStore(state => state.syncEnabled)
  const syncStatus = useSyncStore(state => state.syncStatus)
  const [terminalVisible, setTerminalVisible] = useState(false)
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const [zoteroSearchOpen, setZoteroSearchOpen] = useState(false)
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [templateSettingsOpen, setTemplateSettingsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [overduePanelOpen, setOverduePanelOpen] = useState(false)
  const [tagsPanelOpen, setTagsPanelOpen] = useState(false)
  const [smartConnectionsOpen, setSmartConnectionsOpen] = useState(false)
  const [notesChatOpen, setNotesChatOpen] = useState(false)
  const { isPanelOpen: flashcardsPanelOpen, setPanel: setFlashcardsPanelOpen } = useFlashcardStore()
  const [pendingNoteTitle, setPendingNoteTitle] = useState<string | null>(null)

  // Helper to switch right panel - clicking opens that panel and closes others
  const switchRightPanel = useCallback((panel: 'overdue' | 'tags' | 'smartConnections' | 'notesChat' | 'flashcards') => {
    const isCurrentlyOpen =
      panel === 'overdue' ? overduePanelOpen :
      panel === 'tags' ? tagsPanelOpen :
      panel === 'smartConnections' ? smartConnectionsOpen :
      panel === 'notesChat' ? notesChatOpen :
      panel === 'flashcards' ? flashcardsPanelOpen : false

    // Close all panels
    setOverduePanelOpen(false)
    setTagsPanelOpen(false)
    setSmartConnectionsOpen(false)
    setNotesChatOpen(false)
    setFlashcardsPanelOpen(false)

    // If the panel wasn't open, open it
    if (!isCurrentlyOpen) {
      switch (panel) {
        case 'overdue': setOverduePanelOpen(true); break
        case 'tags': setTagsPanelOpen(true); break
        case 'smartConnections': setSmartConnectionsOpen(true); break
        case 'notesChat': setNotesChatOpen(true); break
        case 'flashcards': setFlashcardsPanelOpen(true); break
      }
    }
  }, [overduePanelOpen, tagsPanelOpen, smartConnectionsOpen, notesChatOpen, flashcardsPanelOpen, setFlashcardsPanelOpen])

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

  // UI-Settings beim App-Start laden + Onboarding prüfen
  useEffect(() => {
    const init = async () => {
      await initializeUISettings()
      // Nach dem Laden prüfen ob Onboarding abgeschlossen ist
      const { onboardingCompleted, setOnboardingOpen } = useUIStore.getState()
      if (!onboardingCompleted) {
        setOnboardingOpen(true)
      }
    }
    init()
  }, [])

  // Update-Checker & What's New beim App-Start
  useEffect(() => {
    const checkVersionAndUpdates = async () => {
      try {
        // 1. Aktuelle Version holen
        const currentVersion = await window.electronAPI.getAppVersion()
        const { lastSeenVersion, setLastSeenVersion, setWhatsNewOpen, setUpdateAvailable } = useUIStore.getState()

        console.log('[App] Current version:', currentVersion, 'Last seen:', lastSeenVersion)

        // 2. What's New zeigen wenn neue Version (aber nicht beim allerersten Start)
        if (lastSeenVersion && currentVersion !== lastSeenVersion) {
          console.log('[App] New version detected, showing What\'s New')
          setWhatsNewOpen(true)
        }

        // Beim allerersten Start die Version setzen ohne Modal zu zeigen
        if (!lastSeenVersion) {
          setLastSeenVersion(currentVersion)
        }

        // 3. Update-Check nach 5s Verzögerung (im Hintergrund)
        setTimeout(async () => {
          try {
            const updateInfo = await window.electronAPI.checkForUpdates()
            console.log('[App] Update check result:', updateInfo)
            if (updateInfo.available) {
              setUpdateAvailable(updateInfo)
            }
          } catch (error) {
            console.error('[App] Update check failed:', error)
          }
        }, 5000)
      } catch (error) {
        console.error('[App] Version check failed:', error)
      }
    }

    // Kurze Verzögerung damit UI erst fertig laden kann
    const timer = setTimeout(checkVersionAndUpdates, 1000)
    return () => clearTimeout(timer)
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

  // Tab-System: Bidirektionaler Sync zwischen Tabs und Notiz-Auswahl
  // Verwendet getState() um Loops zu vermeiden
  const syncTabsWithNotes = useCallback(() => {
    const { selectedNoteId: currentNoteId } = useNotesStore.getState()
    const { tabs: currentTabs, activeTabId: currentActiveTabId } = useTabStore.getState()

    const activeTab = currentTabs.find(t => t.id === currentActiveTabId)

    // Wenn aktiver Tab eine Notiz ist, die nicht ausgewählt ist → Notiz auswählen
    if (activeTab?.type === 'editor' && activeTab.noteId !== currentNoteId) {
      useNotesStore.getState().selectNote(activeTab.noteId, false)
    }
  }, [])

  // Wenn activeTabId sich ändert → sync
  useEffect(() => {
    if (activeTabId) {
      syncTabsWithNotes()
    }
  }, [activeTabId, syncTabsWithNotes])

  // Wenn Notiz ausgewählt wird → Tab öffnen/aktivieren (direkter Zugriff ohne Loop)
  useEffect(() => {
    if (!selectedNoteId) return

    const { tabs: currentTabs, activeTabId: currentActiveTabId, openEditorTab: openTab } = useTabStore.getState()

    // Prüfen ob Tab für diese Notiz schon aktiv ist
    const existingTab = currentTabs.find(t => t.type === 'editor' && t.noteId === selectedNoteId)
    if (existingTab && existingTab.id === currentActiveTabId) {
      return // Schon aktiv, nichts tun
    }

    const selectedNote = notes.find(n => n.id === selectedNoteId)
    if (selectedNote) {
      openTab(selectedNoteId, selectedNote.title)
    }
  }, [selectedNoteId, notes])

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
    if (accentColor === 'custom') {
      root.style.setProperty('--accent-color', customAccentColor)
      root.style.setProperty('--accent-hover', customAccentColor)
      root.style.setProperty('--accent-subtle', `${customAccentColor}20`)
    } else {
      const colors = ACCENT_COLORS[accentColor]
      root.style.setProperty('--accent-color', colors.color)
      root.style.setProperty('--accent-hover', colors.hover)
      root.style.setProperty('--accent-subtle', `${colors.color}20`)
    }
  }, [accentColor, customAccentColor])

  // Schriftart auf document anwenden
  useEffect(() => {
    const root = document.documentElement
    const font = FONT_FAMILIES[fontFamily]
    root.style.setProperty('--font-family', font.value)
  }, [fontFamily])

  // Hintergrundfarbe auf document anwenden
  useEffect(() => {
    const root = document.documentElement
    if (backgroundColor === 'custom') {
      root.style.setProperty('--bg-primary-custom', customBackgroundColorLight)
      root.style.setProperty('--bg-primary-custom-dark', customBackgroundColorDark)
    } else {
      const bg = BACKGROUND_COLORS[backgroundColor]
      root.style.setProperty('--bg-primary-custom', bg.light)
      root.style.setProperty('--bg-primary-custom-dark', bg.dark)
    }
  }, [backgroundColor, customBackgroundColorLight, customBackgroundColorDark])

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
      // Cmd+[ / Ctrl+[ für Navigation zurück (wie Browser)
      if ((e.metaKey || e.ctrlKey) && e.key === '[' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        navigateBack()
      }
      // Cmd+] / Ctrl+] für Navigation vorwärts (wie Browser)
      if ((e.metaKey || e.ctrlKey) && e.key === ']' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        navigateForward()
      }
      // Cmd+W / Ctrl+W für Tab schließen
      if ((e.metaKey || e.ctrlKey) && e.key === 'w' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        const { tabs, activeTabId, closeTab } = useTabStore.getState()
        if (activeTabId && tabs.length > 0) {
          closeTab(activeTabId)
        }
      }
      // Cmd+Option+Left für vorherigen Tab
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        const { tabs, activeTabId, setActiveTab } = useTabStore.getState()
        const currentIndex = tabs.findIndex(t => t.id === activeTabId)
        if (currentIndex > 0) {
          setActiveTab(tabs[currentIndex - 1].id)
        }
      }
      // Cmd+Option+Right für nächsten Tab
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        const { tabs, activeTabId, setActiveTab } = useTabStore.getState()
        const currentIndex = tabs.findIndex(t => t.id === activeTabId)
        if (currentIndex < tabs.length - 1) {
          setActiveTab(tabs[currentIndex + 1].id)
        }
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
              {customLogo ? (
                <img src={customLogo} width="22" height="22" style={{ borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
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
              )}
            </div>
            <span className="app-title">MindGraph Notes</span>
            <span className="beta-badge">Beta</span>
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
                Canvas
              </ViewModeButton>
              <span className="view-mode-separator" />
              <button
                className={`view-mode-btn ${textSplitEnabled ? 'active' : ''}`}
                onClick={() => setTextSplitEnabled(!textSplitEnabled)}
                disabled={viewMode !== 'editor'}
                title={t('titlebar.textSplit')}
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
                title={t('titlebar.settings')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
              <button
                className={`view-mode-btn overdue-btn ${overduePanelOpen ? 'active' : ''} ${taskStats.overdue > 0 ? 'has-overdue' : ''}`}
                onClick={() => switchRightPanel('overdue')}
                title={`${t('titlebar.overdue')} (${taskStats.overdue})`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                {taskStats.overdue > 0 && (
                  <span className="overdue-badge">{taskStats.overdue}</span>
                )}
              </button>
              <button
                className={`view-mode-btn ${tagsPanelOpen ? 'active' : ''}`}
                onClick={() => switchRightPanel('tags')}
                title={t('titlebar.tags')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
              </button>
              {smartConnectionsEnabled && (
                <button
                  className={`view-mode-btn ${smartConnectionsOpen ? 'active' : ''}`}
                  onClick={() => switchRightPanel('smartConnections')}
                  title={t('titlebar.smartConnections')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 2v4"/>
                    <path d="M12 18v4"/>
                    <path d="M4.93 4.93l2.83 2.83"/>
                    <path d="M16.24 16.24l2.83 2.83"/>
                    <path d="M2 12h4"/>
                    <path d="M18 12h4"/>
                    <path d="M4.93 19.07l2.83-2.83"/>
                    <path d="M16.24 7.76l2.83-2.83"/>
                  </svg>
                </button>
              )}
              {notesChatEnabled && (
                <button
                  className={`view-mode-btn ${notesChatOpen ? 'active' : ''}`}
                  onClick={() => switchRightPanel('notesChat')}
                  title={t('titlebar.notesChat')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
              )}
              {flashcardsEnabled && (
                <button
                  className={`view-mode-btn ${flashcardsPanelOpen ? 'active' : ''}`}
                  onClick={() => switchRightPanel('flashcards')}
                  title={t('titlebar.flashcards')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M10 4v4" />
                    <path d="M14 4v4" />
                  </svg>
                </button>
              )}
              <button
                className={`view-mode-btn ${terminalVisible ? 'active' : ''}`}
                onClick={() => setTerminalVisible(!terminalVisible)}
                title={t('titlebar.terminal')}
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

            {/* Workspace wrapper - contains TabBar and workspace */}
            <div className="workspace-wrapper">
              {/* TabBar - only show when there are canvas tabs */}
              {tabs.length > 0 && <TabBar />}

              <div className={`workspace ${viewMode} ${activeTab?.type === 'canvas' ? 'has-canvas-tab' : ''} ${(textSplitEnabled || overduePanelOpen || tagsPanelOpen || (smartConnectionsOpen && smartConnectionsEnabled) || (notesChatOpen && notesChatEnabled) || (flashcardsPanelOpen && flashcardsEnabled)) && viewMode === 'editor' ? 'text-split' : ''}`} ref={workspaceRef}>

              {/* Editor Panel - visible in editor and split mode */}
              <div
                className="editor-panel"
                style={{
                  display: viewMode === 'canvas' ? 'none' : 'flex',
                  flex: viewMode === 'editor'
                    ? ((textSplitEnabled || overduePanelOpen || tagsPanelOpen || (smartConnectionsOpen && smartConnectionsEnabled) || (notesChatOpen && notesChatEnabled) || (flashcardsPanelOpen && flashcardsEnabled))
                        ? `0 0 ${textSplitPosition}%`
                        : (activeTab?.type === 'canvas'
                            ? `0 0 ${splitPosition}%`
                            : 1))
                    : `0 0 ${splitPosition}%`
                }}
              >
                {selectedPdfPath && vaultPath ? (
                  <PDFViewer filePath={`${vaultPath}/${selectedPdfPath}`} fileName={selectedPdfPath.split('/').pop() || selectedPdfPath} relativePath={selectedPdfPath} />
                ) : selectedImagePath && vaultPath ? (
                  <ImageViewer filePath={`${vaultPath}/${selectedImagePath}`} fileName={selectedImagePath.split('/').pop() || selectedImagePath} />
                ) : (
                  <>
                    <MarkdownEditor />
                    <BacklinksPanel />
                  </>
                )}
              </div>

              {/* Text Split Divider - in editor mode when text-split is enabled (takes priority over canvas tab) */}
              {viewMode === 'editor' && (textSplitEnabled || overduePanelOpen || tagsPanelOpen || (smartConnectionsOpen && smartConnectionsEnabled) || (notesChatOpen && notesChatEnabled) || (flashcardsPanelOpen && flashcardsEnabled)) && (
                <div className="text-split-divider" onMouseDown={handleTextSplitDividerMouseDown} />
              )}

              {/* Secondary Panel (Text Split / Overdue / Tags / Flashcards / etc.) - takes priority over canvas tab */}
              {viewMode === 'editor' && (textSplitEnabled || overduePanelOpen || tagsPanelOpen || (smartConnectionsOpen && smartConnectionsEnabled) || (notesChatOpen && notesChatEnabled) || (flashcardsPanelOpen && flashcardsEnabled)) && (
                <div className="editor-panel editor-panel-secondary" style={{ flex: `0 0 ${100 - textSplitPosition}%` }}>
                  {overduePanelOpen ? (
                    <OverduePanel onClose={() => setOverduePanelOpen(false)} />
                  ) : tagsPanelOpen ? (
                    <TagsPanel onClose={() => setTagsPanelOpen(false)} />
                  ) : (smartConnectionsOpen && smartConnectionsEnabled) ? (
                    <SmartConnectionsPanel onClose={() => setSmartConnectionsOpen(false)} />
                  ) : (notesChatOpen && notesChatEnabled) ? (
                    <NotesChat onClose={() => setNotesChatOpen(false)} />
                  ) : (flashcardsPanelOpen && flashcardsEnabled) ? (
                    <FlashcardsPanel onClose={() => setFlashcardsPanelOpen(false)} />
                  ) : secondarySelectedNoteId ? (
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
                        <p>{t('textSplit.placeholder.instruction')}</p>
                        <p className="text-split-placeholder-hint">{t('textSplit.placeholder.hint')}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Split Divider for LocalCanvas Tab - only when text-split is NOT active */}
              {viewMode === 'editor' && activeTab?.type === 'canvas' && !(textSplitEnabled || overduePanelOpen || tagsPanelOpen || (smartConnectionsOpen && smartConnectionsEnabled) || (notesChatOpen && notesChatEnabled) || (flashcardsPanelOpen && flashcardsEnabled)) && (
                <div className="split-divider" onMouseDown={handleDividerMouseDown} />
              )}

              {/* Local Canvas Panel - only when text-split is NOT active */}
              {viewMode === 'editor' && activeTab?.type === 'canvas' && !(textSplitEnabled || overduePanelOpen || tagsPanelOpen || (smartConnectionsOpen && smartConnectionsEnabled) || (notesChatOpen && notesChatEnabled) || (flashcardsPanelOpen && flashcardsEnabled)) && (
                <div className="local-canvas-panel" style={{ flex: `0 0 ${100 - splitPosition}%` }}>
                  <LocalCanvas tabId={activeTab.id} rootNoteId={activeTab.noteId} />
                </div>
              )}

              {/* Split Divider - in split mode */}
              {viewMode === 'split' && (
                <div className="split-divider" onMouseDown={handleDividerMouseDown} />
              )}

              {/* Canvas Panel - only render when in split or canvas mode */}
              {(viewMode === 'split' || viewMode === 'canvas') && (
                <div
                  key={`canvas-${viewMode}`}
                  className={`canvas-panel ${viewMode === 'canvas' ? 'canvas-fullwidth' : ''}`}
                  style={{
                    display: 'flex',
                    flex: viewMode === 'canvas' ? 1 : `0 0 ${100 - splitPosition}%`
                  }}
                >
                  <GraphCanvas key={`graph-${viewMode}`} />
                </div>
              )}

            </div>
            </div>{/* end workspace-wrapper */}
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
                  <span className="task-open" title={t('footer.openTasks')}>
                    • {taskStats.open} {t('footer.open')}
                  </span>
                )}
                {taskStats.critical > 0 && (
                  <span className="task-critical" title={t('footer.criticalTasks')}>
                    • {taskStats.critical} {t('footer.critical')}
                  </span>
                )}
                {taskStats.overdue > 0 && (
                  <span className="task-overdue" title={t('footer.overdueTasks')}>
                    • {taskStats.overdue} {t('footer.overdueCount')}
                  </span>
                )}
              </span>
            </>
          )}
          {syncEnabled && (
            <>
              <span className="status-separator">|</span>
              <button
                className={`sync-status-indicator ${
                  syncStatus === 'done' || syncStatus === 'idle' ? 'synced' :
                  syncStatus === 'error' ? 'error' :
                  'syncing'
                }`}
                onClick={() => setSettingsOpen(true)}
                title="Sync"
              >
                <svg className={`sync-status-icon ${syncStatus !== 'idle' && syncStatus !== 'done' && syncStatus !== 'error' ? 'syncing' : ''}`} viewBox="0 0 14 14" fill="none">
                  <path d="M2 7C2 4.24 4.24 2 7 2C8.66 2 10.1 2.84 11 4.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  <path d="M12 7C12 9.76 9.76 12 7 12C5.34 12 3.9 11.16 3 9.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  <path d="M9 4H11V2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M5 10H3V12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
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

      {/* What's New Modal (shown after update) */}
      <WhatsNew />

      {/* Quiz Modal */}
      <QuizModal />

      {/* Flashcard Modals */}
      <FlashcardStudy />
      <FlashcardEditor />

      {/* Update Notification Banner */}
      <UpdateNotification />

      {/* Onboarding (Fullscreen Overlay beim ersten Start) */}
      <Onboarding />
    </ReactFlowProvider>
  )
}

export default App
