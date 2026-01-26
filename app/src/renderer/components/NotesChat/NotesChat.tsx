import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNotesStore } from '../../stores/notesStore'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  question?: string      // Die vorherige User-Frage (nur bei assistant)
  model?: string         // Das verwendete Modell (nur bei assistant)
  timestamp?: Date       // Zeitpunkt der Antwort (nur bei assistant)
}

interface OllamaModel {
  name: string
  size: number
}

type ContextMode = 'current' | 'folder' | 'all'

interface NotesChatProps {
  onClose: () => void
}

export const NotesChat: React.FC<NotesChatProps> = ({ onClose }) => {
  const { notes, selectedNoteId, vaultPath } = useNotesStore()
  const [models, setModels] = useState<OllamaModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [isOllamaAvailable, setIsOllamaAvailable] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [contextMode, setContextMode] = useState<ContextMode>('current')
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Aktuelle Notiz
  const currentNote = notes.find(n => n.id === selectedNoteId)

  // Verfügbare Ordner extrahieren
  const folders = Array.from(new Set(
    notes
      .map(n => n.path.split('/').slice(0, -1).join('/'))
      .filter(p => p.length > 0)
  )).sort()

  // Ollama und Modelle prüfen
  useEffect(() => {
    const checkOllama = async () => {
      setIsLoading(true)
      try {
        const available = await window.electronAPI.ollamaCheck()
        setIsOllamaAvailable(available)

        if (available) {
          const modelList = await window.electronAPI.ollamaModels()
          setModels(modelList)

          // Standard-Modell auswählen (bevorzugt llama3, mistral, oder das erste)
          const preferredModels = ['llama3', 'llama3.2', 'mistral', 'qwen']
          const preferred = modelList.find(m =>
            preferredModels.some(p => m.name.toLowerCase().includes(p))
          )
          if (preferred) {
            setSelectedModel(preferred.name)
          } else if (modelList.length > 0) {
            setSelectedModel(modelList[0].name)
          }
        }
      } catch (err) {
        console.error('[NotesChat] Error checking Ollama:', err)
      } finally {
        setIsLoading(false)
      }
    }

    checkOllama()
  }, [])

  // Auto-scroll zu neuen Nachrichten
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Streaming-Listener einrichten
  useEffect(() => {
    window.electronAPI.onOllamaChatChunk((chunk) => {
      setStreamingContent(prev => prev + chunk)
    })

    window.electronAPI.onOllamaChatDone(() => {
      setIsStreaming(false)
    })
  }, [])

  // Letzte User-Frage speichern für Metadaten
  const lastUserQuestion = useRef<string>('')

  // Wenn Streaming endet, Nachricht zu Messages hinzufügen
  useEffect(() => {
    if (!isStreaming && streamingContent) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: streamingContent,
        question: lastUserQuestion.current,
        model: selectedModel,
        timestamp: new Date()
      }])
      setStreamingContent('')
    }
  }, [isStreaming, streamingContent, selectedModel])

  // Kontext-Text basierend auf Modus generieren
  const getContextText = useCallback(async (): Promise<string> => {
    if (!vaultPath) return ''

    let relevantNotes = notes

    switch (contextMode) {
      case 'current':
        if (currentNote) {
          relevantNotes = [currentNote]
        } else {
          return ''
        }
        break
      case 'folder':
        if (selectedFolder) {
          relevantNotes = notes.filter(n => n.path.startsWith(selectedFolder + '/') || n.path === selectedFolder)
        } else {
          return ''
        }
        break
      case 'all':
        // Alle Notizen (limitiert auf die ersten 50 um Kontext nicht zu sprengen)
        relevantNotes = notes.slice(0, 50)
        break
    }

    // Lade Inhalte für Notizen ohne Content
    const notesNeedingContent = relevantNotes.filter(n => !n.content)
    if (notesNeedingContent.length > 0) {
      const paths = notesNeedingContent.map(n => n.path)
      const contents = await window.electronAPI.readFilesBatch(vaultPath, paths)
      for (const note of notesNeedingContent) {
        if (contents[note.path]) {
          (note as any)._loadedContent = contents[note.path]
        }
      }
    }

    // Kontext-Text erstellen
    const contextParts: string[] = []
    for (const note of relevantNotes) {
      const content = note.content || (note as any)._loadedContent || ''
      if (content.trim()) {
        contextParts.push(`## ${note.title}\n${content}`)
      }
    }

    // Limitiere Kontext auf ~50000 Zeichen
    let context = contextParts.join('\n\n---\n\n')
    if (context.length > 50000) {
      context = context.slice(0, 50000) + '\n\n[... weitere Notizen gekürzt ...]'
    }

    return context
  }, [contextMode, currentNote, selectedFolder, notes, vaultPath])

  // Nachricht senden
  const sendMessage = async () => {
    if (!inputValue.trim() || !selectedModel || isStreaming) return

    const userMessage = inputValue.trim()
    lastUserQuestion.current = userMessage
    setInputValue('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsStreaming(true)
    setStreamingContent('')

    try {
      const context = await getContextText()
      if (!context) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Keine Notizen zum Chatten verfügbar. Wähle eine Notiz aus oder ändere den Kontext-Modus.'
        }])
        setIsStreaming(false)
        return
      }

      // Nur die letzen 10 Nachrichten für den Chat-Verlauf
      const recentMessages = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }))
      recentMessages.push({ role: 'user', content: userMessage })

      await window.electronAPI.ollamaChat(selectedModel, recentMessages, context)
    } catch (err) {
      console.error('[NotesChat] Error sending message:', err)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Fehler beim Senden der Nachricht. Bitte versuche es erneut.'
      }])
      setIsStreaming(false)
    }
  }

  // Enter zum Senden (Shift+Enter für neue Zeile)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Chat leeren
  const clearChat = () => {
    setMessages([])
    setStreamingContent('')
  }

  // Nachricht kopieren mit Metadaten
  const copyMessage = async (msg: ChatMessage, index: number) => {
    try {
      // Datum/Zeit formatieren
      const dateStr = msg.timestamp
        ? msg.timestamp.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : ''
      const timeStr = msg.timestamp
        ? msg.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : ''

      // Kopiertext mit Callout erstellen
      let copyText = msg.content

      // Trennlinie und Metadaten als Callout
      copyText += '\n\n---\n'
      copyText += `> [!quote] KI-generiert\n`
      if (msg.question) {
        copyText += `> **Frage:** *${msg.question}*\n`
      }
      copyText += `> **Modell:** ${msg.model || 'unbekannt'} | ${dateStr}, ${timeStr}`

      await navigator.clipboard.writeText(copyText)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch (err) {
      console.error('[NotesChat] Copy failed:', err)
    }
  }

  // Kontext-Info Text
  const getContextInfo = (): string => {
    switch (contextMode) {
      case 'current':
        return currentNote ? `Notiz: ${currentNote.title}` : 'Keine Notiz ausgewählt'
      case 'folder':
        if (selectedFolder) {
          const count = notes.filter(n => n.path.startsWith(selectedFolder + '/') || n.path === selectedFolder).length
          return `Ordner: ${selectedFolder} (${count} Notizen)`
        }
        return 'Kein Ordner ausgewählt'
      case 'all':
        return `Alle Notizen (${Math.min(notes.length, 50)} von ${notes.length})`
    }
  }

  return (
    <div className="notes-chat-panel">
      <div className="notes-chat-header">
        <div className="notes-chat-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Notes Chat</span>
        </div>
        <button className="notes-chat-close" onClick={onClose} title="Schließen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="notes-chat-loading">
          <div className="notes-chat-spinner"></div>
          <p>Prüfe Ollama...</p>
        </div>
      ) : !isOllamaAvailable ? (
        <div className="notes-chat-unavailable">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>Ollama nicht verfügbar</p>
          <span>Starte Ollama für den Chat mit deinen Notizen</span>
        </div>
      ) : models.length === 0 ? (
        <div className="notes-chat-unavailable">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <p>Kein Chat-Modell</p>
          <span>Installiere z.B.: ollama pull llama3.2</span>
        </div>
      ) : (
        <>
          {/* Einstellungen */}
          <div className="notes-chat-settings">
            <div className="notes-chat-model-row">
              <label>Modell:</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isStreaming}
              >
                {models.map(model => (
                  <option key={model.name} value={model.name}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="notes-chat-context-row">
              <label>Kontext:</label>
              <div className="notes-chat-context-buttons">
                <button
                  className={contextMode === 'current' ? 'active' : ''}
                  onClick={() => setContextMode('current')}
                  disabled={isStreaming}
                  title="Aktuelle Notiz"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </button>
                <button
                  className={contextMode === 'folder' ? 'active' : ''}
                  onClick={() => setContextMode('folder')}
                  disabled={isStreaming}
                  title="Ordner"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
                <button
                  className={contextMode === 'all' ? 'active' : ''}
                  onClick={() => setContextMode('all')}
                  disabled={isStreaming}
                  title="Alle Notizen"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </button>
              </div>
              {contextMode === 'folder' && (
                <select
                  className="notes-chat-folder-select"
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  disabled={isStreaming}
                >
                  <option value="">Ordner wählen...</option>
                  {folders.map(folder => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="notes-chat-context-info">
              {getContextInfo()}
            </div>
          </div>

          {/* Chat-Nachrichten */}
          <div className="notes-chat-messages">
            {messages.length === 0 && !streamingContent ? (
              <div className="notes-chat-welcome">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p>Stelle Fragen zu deinen Notizen</p>
                <span>Das KI-Modell hat Zugriff auf den ausgewählten Kontext</span>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div key={idx} className={`notes-chat-message ${msg.role}`}>
                    <div className="notes-chat-message-content">
                      {msg.content}
                    </div>
                    {msg.role === 'assistant' && (
                      <button
                        className={`notes-chat-copy ${copiedIndex === idx ? 'copied' : ''}`}
                        onClick={() => copyMessage(msg, idx)}
                        title={copiedIndex === idx ? 'Kopiert!' : 'Kopieren'}
                      >
                        {copiedIndex === idx ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                ))}
                {streamingContent && (
                  <div className="notes-chat-message assistant streaming">
                    <div className="notes-chat-message-content">
                      {streamingContent}
                      <span className="notes-chat-cursor">|</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Eingabe */}
          <div className="notes-chat-input-area">
            {messages.length > 0 && (
              <button
                className="notes-chat-clear"
                onClick={clearChat}
                disabled={isStreaming}
                title="Chat leeren"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            )}
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Frage stellen..."
              disabled={isStreaming}
              rows={1}
            />
            <button
              className="notes-chat-send"
              onClick={sendMessage}
              disabled={!inputValue.trim() || isStreaming}
              title="Senden (Enter)"
            >
              {isStreaming ? (
                <div className="notes-chat-spinner-small"></div>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
