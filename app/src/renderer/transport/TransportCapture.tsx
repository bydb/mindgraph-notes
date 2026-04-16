import React, { useState, useRef, useEffect, useCallback } from 'react'
import TaskInsertModal from './TaskInsertModal'

declare global {
  interface Window {
    electronAPI: {
      transportGetConfig: () => Promise<{
        vaultPath: string | null
        transport: {
          destinations: { label: string; folder: string }[]
          predefinedTags: string[]
          defaultDestinationIndex: number
        } | null
      }>
      transportListVaultSubdirs: () => Promise<string[]>
      transportSaveNote: (data: {
        title: string
        category: string
        tags: string[]
        content: string
        destinationFolder: string
      }) => Promise<{ success: boolean; relativePath?: string; error?: string }>
      transportOpenInMain: (relativePath: string) => Promise<void>
      transportClose: () => Promise<void>
      onTransportWindowShown: (callback: () => void) => void
    }
  }
}

interface Category {
  emoji: string
  label: string
  color: string
}

const CATEGORIES: Category[] = [
  { emoji: '🔴', label: 'Aktion', color: '#ff3b30' },
  { emoji: '🟢', label: 'Wissen', color: '#34c759' },
  { emoji: '🔵', label: 'Info', color: '#0a84ff' }
]

export default function TransportCapture(): React.ReactElement {
  const [category, setCategory] = useState('🟢')
  const [content, setContent] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [destinationFolder, setDestinationFolder] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [newTagInput, setNewTagInput] = useState('')

  // Config aus Main Process
  const [destinations, setDestinations] = useState<{ label: string; folder: string }[]>([])
  const [predefinedTags, setPredefinedTags] = useState<string[]>([])
  const [vaultSubdirs, setVaultSubdirs] = useState<string[]>([])
  const [hasVault, setHasVault] = useState(false)

  const editorRef = useRef<HTMLTextAreaElement>(null)

  // Config laden
  const loadConfig = useCallback(async () => {
    try {
      const [config, subdirs] = await Promise.all([
        window.electronAPI.transportGetConfig(),
        window.electronAPI.transportListVaultSubdirs()
      ])

      setHasVault(!!config.vaultPath)
      setVaultSubdirs(subdirs)

      if (config.transport) {
        setDestinations(config.transport.destinations || [])
        setPredefinedTags(config.transport.predefinedTags || [])
        const defaultIdx = config.transport.defaultDestinationIndex || 0
        if (config.transport.destinations?.length > 0) {
          setDestinationFolder(config.transport.destinations[defaultIdx]?.folder || config.transport.destinations[0].folder)
        }
      }
    } catch (err) {
      console.error('[Transport] Config laden fehlgeschlagen:', err)
    }
  }, [])

  useEffect(() => {
    loadConfig()

    // Bei jedem Fenster-Anzeigen: Reset + Config neu laden
    window.electronAPI.onTransportWindowShown(() => {
      setContent('')
      setSelectedTags(new Set())
      setCategory('🟢')
      setIsSubmitting(false)
      setStatus(null)
      loadConfig()
      // Focus nach kurzer Verzögerung (Fenster-Animation)
      setTimeout(() => editorRef.current?.focus(), 50)
    })
  }, [loadConfig])

  // Auto-Focus beim Laden
  useEffect(() => {
    editorRef.current?.focus()
  }, [])

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Escape: Fenster schließen
      if (e.key === 'Escape' && !showTaskModal) {
        e.preventDefault()
        window.electronAPI.transportClose()
      }

      // Cmd+Enter: Transport
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }

      // Cmd+T: Task einfügen
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        setShowTaskModal(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [content, destinationFolder, selectedTags, category, showTaskModal])

  const toggleTag = (tag: string): void => {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const handleTaskInsert = (taskLine: string): void => {
    const textarea = editorRef.current
    if (!textarea) {
      setContent(prev => prev + (prev ? '\n' : '') + taskLine)
      return
    }

    const start = textarea.selectionStart
    const before = content.substring(0, start)
    const after = content.substring(textarea.selectionEnd)

    const needsNewlineBefore = before.length > 0 && !before.endsWith('\n')
    const needsNewlineAfter = after.length > 0 && !after.startsWith('\n')

    const insertion = (needsNewlineBefore ? '\n' : '') + taskLine + (needsNewlineAfter ? '\n' : '')
    const newContent = before + insertion + after
    setContent(newContent)

    // Cursor nach der Einfügung platzieren
    setTimeout(() => {
      if (textarea) {
        const newPos = start + insertion.length
        textarea.selectionStart = newPos
        textarea.selectionEnd = newPos
        textarea.focus()
      }
    }, 0)
  }

  const showStatusToast = (message: string, type: 'success' | 'error'): void => {
    setStatus({ message, type })
    setTimeout(() => setStatus(null), 2500)
  }

  const handleSubmit = async (): Promise<void> => {
    const text = content.trim()
    if (!text || !destinationFolder || isSubmitting) return

    setIsSubmitting(true)

    try {
      // Titel aus erster Zeile extrahieren
      const firstLine = text.split('\n')[0]
      const title = firstLine.replace(/^#+\s*/, '').trim().substring(0, 100) || 'Unbenannt'

      const result = await window.electronAPI.transportSaveNote({
        title,
        category,
        tags: Array.from(selectedTags),
        content: text,
        destinationFolder
      })

      if (result.success && result.relativePath) {
        showStatusToast('Transportiert!', 'success')

        // Notiz im Hauptfenster öffnen
        await window.electronAPI.transportOpenInMain(result.relativePath)

        // Fenster schließen nach kurzer Verzögerung
        setTimeout(() => {
          window.electronAPI.transportClose()
        }, 400)
      } else {
        showStatusToast(result.error || 'Fehler beim Speichern', 'error')
      }
    } catch (err) {
      showStatusToast('Fehler beim Speichern', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Destination-Optionen: konfigurierte Destinations + alle Vault-Unterordner
  const allDestinations = (() => {
    const configured = destinations.map(d => ({ label: d.label, folder: d.folder }))
    const fromVault = vaultSubdirs
      .filter(dir => !destinations.some(d => d.folder === dir))
      .map(dir => ({ label: dir, folder: dir }))
    return [...configured, ...fromVault]
  })()

  if (!hasVault) {
    return (
      <div className="transport-body" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: 'var(--transport-text-secondary)' }}>Kein Vault geöffnet. Bitte öffne zuerst einen Vault in MindGraph.</p>
      </div>
    )
  }

  return (
    <>
      <div className="transport-body">
        {/* Kategorie-Auswahl */}
        <div className="transport-categories">
          {CATEGORIES.map(cat => (
            <button
              key={cat.emoji}
              className={`transport-category-btn ${category === cat.emoji ? 'selected' : ''}`}
              onClick={() => setCategory(cat.emoji)}
            >
              <span className="category-dot" style={{ background: cat.color }} />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Zielordner */}
        <div className="transport-destination">
          <label>Ziel:</label>
          <select
            value={destinationFolder}
            onChange={(e) => setDestinationFolder(e.target.value)}
          >
            {allDestinations.length === 0 && (
              <option value="">Kein Ordner verfügbar</option>
            )}
            {allDestinations.map(dest => (
              <option key={dest.folder} value={dest.folder}>
                {dest.label}
              </option>
            ))}
          </select>
        </div>

        {/* Editor */}
        <textarea
          ref={editorRef}
          className="transport-editor"
          placeholder="Erste Zeile = Titel. Einfach losschreiben..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        {/* Toolbar: Tags + Task-Button */}
        <div className="transport-toolbar">
          <div className="transport-tags">
            {predefinedTags.map(tag => (
              <button
                key={tag}
                className={`transport-tag-chip ${selectedTags.has(tag) ? 'selected' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
            {/* Custom Tags (manuell hinzugefügte) */}
            {Array.from(selectedTags)
              .filter(tag => !predefinedTags.includes(tag))
              .map(tag => (
                <button
                  key={tag}
                  className="transport-tag-chip selected"
                  onClick={() => toggleTag(tag)}
                  title="Klicken zum Entfernen"
                >
                  {tag} ✕
                </button>
              ))}
            <input
              className="transport-tag-input"
              type="text"
              placeholder="+ Tag"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTagInput.trim()) {
                  e.preventDefault()
                  const tag = newTagInput.trim()
                  setSelectedTags(prev => new Set(prev).add(tag))
                  setNewTagInput('')
                }
              }}
            />
          </div>
          <button
            className="transport-task-btn"
            onClick={() => setShowTaskModal(true)}
            title="Task einfügen (⌘T)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            Task
          </button>
        </div>

        {/* Actions */}
        <div className="transport-actions">
          <button
            className="transport-btn transport-btn-secondary"
            onClick={() => window.electronAPI.transportClose()}
          >
            Abbrechen
          </button>
          <button
            className="transport-btn transport-btn-primary"
            onClick={handleSubmit}
            disabled={!content.trim() || !destinationFolder || isSubmitting}
          >
            {isSubmitting ? 'Transportiere...' : 'Transport ⌘↵'}
          </button>
        </div>
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <TaskInsertModal
          onInsert={handleTaskInsert}
          onClose={() => setShowTaskModal(false)}
        />
      )}

      {/* Status Toast */}
      {status && (
        <div className={`transport-status ${status.type}`}>
          {status.message}
        </div>
      )}
    </>
  )
}
