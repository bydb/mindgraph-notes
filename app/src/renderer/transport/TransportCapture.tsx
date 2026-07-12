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
  const [mode, setMode] = useState<'note' | 'zettel'>('note')
  const [category, setCategory] = useState('🟢')
  const [content, setContent] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [destinationFolder, setDestinationFolder] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [newTagInput, setNewTagInput] = useState('')
  const [isPreparingModel, setIsPreparingModel] = useState(false)

  // Zettel-Modus: eigene Felder nach der gelebten Zettelkasten-Konvention
  // (Emoji-Cluster im Dateinamen, Zitat / Mein Gedanke / Quelle im Body).
  const [zettelTitle, setZettelTitle] = useState('')
  const [zettelEmojis, setZettelEmojis] = useState('')
  const [zettelQuote, setZettelQuote] = useState('')
  const [zettelThought, setZettelThought] = useState('')
  const [zettelSource, setZettelSource] = useState('')
  const [zettelFolder, setZettelFolder] = useState('')
  const [zettelVaultTags, setZettelVaultTags] = useState<string[]>([])
  const [isSuggesting, setIsSuggesting] = useState(false)
  const zettelContextLoadedRef = useRef(false)

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

    // Bei jedem Fenster-Anzeigen: Reset + Config neu laden (der Modus bleibt erhalten)
    window.electronAPI.onTransportWindowShown(() => {
      dictationHandleRef.current?.cancel()
      dictationHandleRef.current = null
      setContent('')
      setSelectedTags(new Set())
      setCategory('🟢')
      setZettelTitle('')
      setZettelEmojis('')
      setZettelQuote('')
      setZettelThought('')
      setZettelSource('')
      setIsSubmitting(false)
      setStatus(null)
      loadConfig()
      // Focus nach kurzer Verzögerung (Fenster-Animation)
      setTimeout(() => editorRef.current?.focus(), 50)
    })
  }, [loadConfig])

  // Zettel-Kontext (Zettelkasten-Ordner + geerntete Tags) einmal pro Fenster-Leben
  // lazy laden, sobald der Zettel-Modus zum ersten Mal aktiviert wird.
  useEffect(() => {
    if (mode !== 'zettel' || zettelContextLoadedRef.current) return
    zettelContextLoadedRef.current = true
    window.electronAPI.transportZettelContext()
      .then((ctx) => {
        if (ctx.zettelFolder) setZettelFolder((prev) => prev || ctx.zettelFolder!)
        setZettelVaultTags(ctx.tags || [])
      })
      .catch((err) => console.error('[Transport] Zettel-Kontext fehlgeschlagen:', err))
  }, [mode])

  // Moduswechsel: gewählte Tags nicht in den anderen Modus mitschleppen.
  const switchMode = (next: 'note' | 'zettel'): void => {
    if (next === mode) return
    setMode(next)
    setSelectedTags(new Set())
    setNewTagInput('')
  }

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

      // Cmd+T: Task einfügen (nur Notiz-Modus — fügt in den Notiz-Editor ein)
      if ((e.metaKey || e.ctrlKey) && e.key === 't' && mode === 'note') {
        e.preventDefault()
        setShowTaskModal(true)
      }

      // Cmd+D: Diktat starten/stoppen (nur Notiz-Modus, Ziel ist der Notiz-Editor)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && !showTaskModal && mode === 'note') {
        e.preventDefault()
        void toggleDictation()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [content, destinationFolder, selectedTags, category, showTaskModal, isDictating, voiceStatus,
    mode, zettelTitle, zettelEmojis, zettelQuote, zettelThought, zettelSource, zettelFolder])

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

  // KI-Vorschlag: Tags + Emoji-Cluster aus Titel/Zitat/Gedanke (lokales Ollama,
  // gleiche Modell-Präzedenz wie der Aufgaben-Tagger).
  const handleSuggestMeta = async (): Promise<void> => {
    if (isSuggesting) return
    const ollama = useUIStore.getState().ollama
    const model = ollama?.moduleModelOverrides?.['task-extraction'] || ollama?.selectedModel || ''
    if (!model) {
      showStatusToast('Kein Ollama-Modell konfiguriert.', 'error')
      return
    }
    if (!zettelTitle.trim() && !zettelQuote.trim() && !zettelThought.trim()) {
      showStatusToast('Erst Titel, Zitat oder Gedanke eingeben.', 'error')
      return
    }
    setIsSuggesting(true)
    try {
      const res = await window.electronAPI.zettelSuggestMeta({
        model,
        title: zettelTitle,
        quote: zettelQuote,
        thought: zettelThought,
        candidateTags: zettelVaultTags
      })
      if (!res.success) {
        showStatusToast(res.error || 'Vorschlag fehlgeschlagen', 'error')
        return
      }
      if (res.emojis) setZettelEmojis(res.emojis)
      if (res.tags && res.tags.length > 0) {
        setSelectedTags((prev) => new Set([...prev, ...res.tags!]))
      }
      if (!res.emojis && (!res.tags || res.tags.length === 0)) {
        showStatusToast('Keine Vorschläge erhalten.', 'error')
      }
    } catch (err) {
      showStatusToast(err instanceof Error ? err.message : 'Vorschlag fehlgeschlagen', 'error')
    } finally {
      setIsSuggesting(false)
    }
  }

  const handleZettelSubmit = async (): Promise<void> => {
    const title = zettelTitle.trim()
    const folder = zettelFolder || destinationFolder
    if (!title || (!zettelQuote.trim() && !zettelThought.trim()) || !folder || isSubmitting) return

    setIsSubmitting(true)
    try {
      const result = await window.electronAPI.transportSaveZettel({
        title,
        emojis: zettelEmojis,
        quote: zettelQuote.trim(),
        thought: zettelThought.trim(),
        source: zettelSource.trim(),
        tags: Array.from(selectedTags),
        destinationFolder: folder
      })

      if (result.success && result.relativePath) {
        showStatusToast('Zettel erfasst!', 'success')
        await window.electronAPI.transportOpenInMain(result.relativePath)
        setTimeout(() => {
          window.electronAPI.transportClose()
        }, 400)
      } else {
        showStatusToast(result.error || 'Fehler beim Speichern', 'error')
      }
    } catch {
      showStatusToast('Fehler beim Speichern', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (): Promise<void> => {
    if (mode === 'zettel') {
      await handleZettelSubmit()
      return
    }
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
        {/* Modus: Schnellnotiz | Zettel */}
        <div className="transport-mode-switch">
          <button
            className={`transport-mode-btn ${mode === 'note' ? 'selected' : ''}`}
            onClick={() => switchMode('note')}
          >
            Notiz
          </button>
          <button
            className={`transport-mode-btn ${mode === 'zettel' ? 'selected' : ''}`}
            onClick={() => switchMode('zettel')}
          >
            Zettel
          </button>
        </div>

        {mode === 'note' && (
          <>
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
          </>
        )}

        {mode === 'zettel' && (
          <>
            {/* Zielordner (mit erkanntem Zettelkasten vorbelegt) */}
            <div className="transport-destination">
              <label>Ziel:</label>
              <select
                value={zettelFolder || destinationFolder}
                onChange={(e) => setZettelFolder(e.target.value)}
              >
                {allDestinations.length === 0 && (
                  <option value="">Kein Ordner verfügbar</option>
                )}
                {zettelFolder && !allDestinations.some(d => d.folder === zettelFolder) && (
                  <option value={zettelFolder}>{zettelFolder}</option>
                )}
                {allDestinations.map(dest => (
                  <option key={dest.folder} value={dest.folder}>
                    {dest.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Emoji-Cluster + Titel — die Emojis erzählen die Mini-Geschichte des Zettels */}
            <div className="transport-zettel-titlerow">
              <input
                className="transport-zettel-input transport-zettel-emojis"
                type="text"
                placeholder="🌍💡"
                title="Emoji-Cluster für den Dateinamen (KI schlägt vor, du entscheidest)"
                value={zettelEmojis}
                onChange={(e) => setZettelEmojis(e.target.value)}
              />
              <input
                className="transport-zettel-input transport-zettel-title"
                type="text"
                placeholder="Titel des Zettels"
                value={zettelTitle}
                onChange={(e) => setZettelTitle(e.target.value)}
                autoFocus
              />
            </div>

            <textarea
              className="transport-zettel-area"
              placeholder="Zitat oder Kernidee (wörtlich aus der Quelle)…"
              value={zettelQuote}
              onChange={(e) => setZettelQuote(e.target.value)}
            />
            <textarea
              className="transport-zettel-area"
              placeholder="Mein Gedanke: Was bedeutet das? Welche Implikationen?…"
              value={zettelThought}
              onChange={(e) => setZettelThought(e.target.value)}
            />
            <input
              className="transport-zettel-input"
              type="text"
              placeholder="Quelle: [[Notiz]], Literaturangabe oder URL"
              value={zettelSource}
              onChange={(e) => setZettelSource(e.target.value)}
            />
          </>
        )}

        {/* Toolbar: Tags + Aktionen (Notiz: Diktat/Task — Zettel: KI-Vorschlag) */}
        <div className="transport-toolbar">
          <div className="transport-tags">
            {(mode === 'zettel' ? zettelVaultTags.slice(0, 10) : predefinedTags).map(tag => (
              <button
                key={tag}
                className={`transport-tag-chip ${selectedTags.has(tag) ? 'selected' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
            {/* Custom Tags (manuell hinzugefügte + KI-Vorschläge) */}
            {Array.from(selectedTags)
              .filter(tag => !(mode === 'zettel' ? zettelVaultTags.slice(0, 10) : predefinedTags).includes(tag))
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
          {mode === 'zettel' && (
            <div className="transport-tool-actions">
              <button
                className="transport-task-btn"
                onClick={() => void handleSuggestMeta()}
                disabled={isSuggesting}
                title="Tags + Emojis per lokaler KI vorschlagen"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                  <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
                </svg>
                {isSuggesting ? 'Denke…' : 'Tags & Emojis'}
              </button>
            </div>
          )}
          {mode === 'note' && (
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
          )}
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
            disabled={isSubmitting || (mode === 'note'
              ? !content.trim() || !destinationFolder
              : !zettelTitle.trim() || (!zettelQuote.trim() && !zettelThought.trim()) || !(zettelFolder || destinationFolder))}
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
