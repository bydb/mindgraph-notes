import React, { useState, useRef, useEffect, useCallback } from 'react'
import TaskInsertModal from './TaskInsertModal'
import { NOTE_KINDS } from '../utils/noteKind'
import { startDictation, type DictationHandle } from '../utils/voice/stt'
import { useVoiceStore } from '../stores/voiceStore'
import { useUIStore } from '../stores/uiStore'
import { ensureTransformersModel } from '../utils/voice/transformersStt'

interface Category {
  emoji: string
  label: string
  color: string
}

const CATEGORIES: Category[] = [
  { emoji: NOTE_KINDS.problem.emoji, label: NOTE_KINDS.problem.label, color: NOTE_KINDS.problem.dotColor },
  { emoji: NOTE_KINDS.solution.emoji, label: NOTE_KINDS.solution.label, color: NOTE_KINDS.solution.dotColor },
  { emoji: NOTE_KINDS.info.emoji, label: NOTE_KINDS.info.label, color: NOTE_KINDS.info.dotColor }
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
  const [isPreparingModel, setIsPreparingModel] = useState(false)

  // Config aus Main Process
  const [destinations, setDestinations] = useState<{ label: string; folder: string }[]>([])
  const [predefinedTags, setPredefinedTags] = useState<string[]>([])
  const [vaultSubdirs, setVaultSubdirs] = useState<string[]>([])
  const [hasVault, setHasVault] = useState(false)

  const editorRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef(content)
  const dictationHandleRef = useRef<DictationHandle | null>(null)
  const voiceStatus = useVoiceStore(s => s.status)
  const activeVoiceContextId = useVoiceStore(s => s.activeContextId)
  const lastVoiceError = useVoiceStore(s => s.lastError)
  const setVoiceError = useVoiceStore(s => s.setError)
  const isDictating = activeVoiceContextId === 'transport' && (voiceStatus === 'recording' || voiceStatus === 'transcribing' || voiceStatus === 'loading')

  useEffect(() => {
    contentRef.current = content
  }, [content])

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

        // Bevorzugt: direkt gespeicherter Zielordner. Fallback: alter Index in destinations.
        const rawCfg = config.transport as unknown as {
          defaultDestinationFolder?: string
          defaultDestinationIndex?: number
          destinations?: { folder: string }[]
        }
        let defaultFolder = rawCfg.defaultDestinationFolder || ''
        if (!defaultFolder && typeof rawCfg.defaultDestinationIndex === 'number' && rawCfg.destinations?.length) {
          const idx = Math.min(Math.max(rawCfg.defaultDestinationIndex, 0), rawCfg.destinations.length - 1)
          defaultFolder = rawCfg.destinations[idx]?.folder || ''
        }
        if (!defaultFolder && rawCfg.destinations?.length) {
          defaultFolder = rawCfg.destinations[0].folder
        }
        if (!defaultFolder && subdirs.length > 0) {
          defaultFolder = subdirs[0]
        }
        if (defaultFolder) setDestinationFolder(defaultFolder)
      }
    } catch (err) {
      console.error('[Transport] Config laden fehlgeschlagen:', err)
    }
  }, [])

  useEffect(() => {
    loadConfig()

    // Bei jedem Fenster-Anzeigen: Reset + Config neu laden
    window.electronAPI.onTransportWindowShown(() => {
      dictationHandleRef.current?.cancel()
      dictationHandleRef.current = null
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

  useEffect(() => {
    return () => {
      dictationHandleRef.current?.cancel()
      dictationHandleRef.current = null
    }
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

      // Cmd+D: Diktat starten/stoppen
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && !showTaskModal) {
        e.preventDefault()
        void toggleDictation()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [content, destinationFolder, selectedTags, category, showTaskModal, isDictating, voiceStatus])

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

  const insertTranscript = (text: string): void => {
    const trimmed = text.trim()
    if (!trimmed) return

    const textarea = editorRef.current
    const current = contentRef.current
    if (!textarea) {
      const insertion = current ? `\n${trimmed}` : trimmed
      const next = current + insertion
      contentRef.current = next
      setContent(next)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = current.substring(0, start)
    const after = current.substring(end)
    const needsSpaceBefore = before.length > 0 && !/[\s\n]$/.test(before)
    const needsSpaceAfter = after.length > 0 && !/^[\s\n.,;:!?]/.test(after)
    const insertion = `${needsSpaceBefore ? ' ' : ''}${trimmed}${needsSpaceAfter ? ' ' : ''}`
    const next = before + insertion + after
    const newPos = before.length + insertion.length

    contentRef.current = next
    setContent(next)

    setTimeout(() => {
      textarea.selectionStart = newPos
      textarea.selectionEnd = newPos
      textarea.focus()
    }, 0)
  }

  const toggleDictation = async (): Promise<void> => {
    if (voiceStatus === 'transcribing' || voiceStatus === 'loading') return

    if (isDictating) {
      const handle = dictationHandleRef.current
      dictationHandleRef.current = null
      if (handle) {
        try {
          showStatusToast('Transkribiere…', 'success')
          const transcript = await handle.stop()
          if (!transcript.trim()) {
            const error = useVoiceStore.getState().lastError || lastVoiceError
            showStatusToast(error || 'Keine Sprache erkannt.', 'error')
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          showStatusToast(message, 'error')
        }
      }
      return
    }

    if (voiceStatus !== 'idle') {
      showStatusToast('Es läuft bereits eine andere Sprachaktion.', 'error')
      return
    }

    try {
      setVoiceError(null)
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Mikrofonzugriff ist in diesem Fenster nicht verfügbar.')
      }

      const speech = useUIStore.getState().speech
      if (speech.sttEngine !== 'whisper-cli') {
        showStatusToast('Whisper wird vorbereitet…', 'success')
        setIsPreparingModel(true)
        try {
          await ensureTransformersModel(speech.transformersModel || 'base')
        } finally {
          setIsPreparingModel(false)
        }
      }

      const handle = await startDictation({
        contextId: 'transport',
        onStart: () => showStatusToast('Diktat läuft…', 'success'),
        onTranscript: insertTranscript,
        onError: (error) => showStatusToast(error, 'error')
      })
      dictationHandleRef.current = handle
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showStatusToast(message, 'error')
    }
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
        showStatusToast('Erfasst!', 'success')

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
          <div className="transport-tool-actions">
            <button
              className={`transport-task-btn transport-dictation-btn ${isDictating ? 'active' : ''}`}
              onClick={() => void toggleDictation()}
              title={isDictating ? 'Diktat beenden (⌘D)' : 'Diktat starten (⌘D)'}
              disabled={voiceStatus === 'transcribing' || voiceStatus === 'loading' || isPreparingModel}
            >
              {isDictating ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
              {isPreparingModel
                ? 'Modell lädt'
                : voiceStatus === 'transcribing' || voiceStatus === 'loading' ? 'Transkribiere'
                : isDictating ? 'Stop' : 'Diktat'}
            </button>
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
            {isSubmitting ? 'Erfasse…' : 'Erfassen ⌘↵'}
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
