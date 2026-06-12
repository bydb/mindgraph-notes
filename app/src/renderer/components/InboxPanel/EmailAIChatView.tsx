import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useEmailStore } from '../../stores/emailStore'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useContactStore } from '../../stores/contactStore'
import { useAgentStore } from '../../stores/agentStore'
import { useTranslation } from '../../utils/translations'
import { sanitizeHtml } from '../../utils/sanitize'
import { buildEmailContext, fetchCalendarEvents, loadMissingNoteContents } from '../../utils/emailContextBuilder'
import type { CalendarEvent } from '../../../shared/types'

export const EmailAIChatView: React.FC = () => {
  const { t } = useTranslation()
  const {
    aiChatMessages,
    aiChatEmailId,
    isAiChatLoading,
    emails,
    addAiChatMessage,
    setAiChatLoading,
    setComposeState,
    setCurrentView
  } = useEmailStore()
  const { ollama } = useUIStore()
  const { notes } = useNotesStore()
  const { getContactByEmail } = useContactStore()
  const { dashboardOffers } = useAgentStore()

  const [input, setInput] = useState('')
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatEmail = aiChatEmailId ? emails.find(e => e.id === aiChatEmailId) : null

  // Kalender-Events laden
  useEffect(() => {
    if (window.electronAPI.platform === 'darwin') {
      fetchCalendarEvents(30).then(setCalendarEvents)
    }
  }, [chatEmail?.id])

  // Streaming-Listener — eigene Channels, damit der Notes-Chat (onOllamaChatChunk)
  // nicht denselben Listener-Slot überschreibt
  useEffect(() => {
    window.electronAPI.onOllamaEmailChatChunk((chunk: string) => {
      setStreamingContent(prev => prev + chunk)
    })
    window.electronAPI.onOllamaEmailChatDone(() => {
      setIsStreaming(false)
    })
  }, [])

  // Wenn Streaming endet, Nachricht hinzufuegen
  useEffect(() => {
    if (!isStreaming && streamingContent) {
      addAiChatMessage({ role: 'assistant', content: streamingContent })
      setStreamingContent('')
      setAiChatLoading(false)
    }
  }, [isStreaming, streamingContent, addAiChatMessage, setAiChatLoading])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiChatMessages, streamingContent])

  const getContext = useCallback(async () => {
    if (!chatEmail) return ''
    const contact = getContactByEmail(chatEmail.from.address)
    let notesRecord = Object.fromEntries(notes.map(n => [n.id, n]))
    // Cache liefert Notizen oft mit content: '' — für die Kontext-Suche nachladen
    const vaultPath = useNotesStore.getState().vaultPath
    if (vaultPath) {
      notesRecord = await loadMissingNoteContents(notesRecord, chatEmail, vaultPath)
    }
    return buildEmailContext(
      chatEmail,
      emails,
      contact,
      notesRecord,
      dashboardOffers,
      calendarEvents
    )
  }, [chatEmail, emails, notes, dashboardOffers, getContactByEmail, calendarEvents])

  const sendMessage = useCallback(async (text: string) => {
    const userMessage = text.trim()
    if (!userMessage || isAiChatLoading || !ollama.selectedModel) return

    setInput('')
    addAiChatMessage({ role: 'user', content: userMessage })
    setAiChatLoading(true)
    setIsStreaming(true)
    setStreamingContent('')

    try {
      const context = await getContext()

      const messages = [
        ...aiChatMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ]

      const result = await window.electronAPI.ollamaChat(
        ollama.selectedModel,
        messages,
        context,
        'email'
      )
      if (!result.success) {
        setIsStreaming(false)
        setAiChatLoading(false)
        addAiChatMessage({ role: 'assistant', content: `Fehler: ${result.error || 'Unbekannter Fehler'}` })
      }
    } catch (error) {
      setIsStreaming(false)
      setStreamingContent('')
      setAiChatLoading(false)
      addAiChatMessage({ role: 'assistant', content: `Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}` })
    }
  }, [isAiChatLoading, ollama.selectedModel, aiChatMessages, addAiChatMessage, setAiChatLoading, getContext])

  const handleSend = useCallback(() => {
    sendMessage(input)
  }, [sendMessage, input])

  const handleSuggestion = useCallback((text: string) => {
    sendMessage(text)
  }, [sendMessage])

  const handleUseDraft = useCallback((content: string) => {
    if (!chatEmail) return
    const { email: emailSettings } = useUIStore.getState()
    const account = emailSettings.accounts[0]
    const sig = emailSettings.signature ? `\n\n--\n${emailSettings.signature}` : ''
    setComposeState({
      to: [{ name: chatEmail.from.name, address: chatEmail.from.address }],
      subject: chatEmail.subject.startsWith('Re:') ? chatEmail.subject : `Re: ${chatEmail.subject}`,
      body: content + sig,
      inReplyTo: chatEmail.id,
      references: chatEmail.id,
      accountId: account?.id || ''
    })
    setCurrentView('compose')
  }, [chatEmail, setComposeState, setCurrentView])

  const renderMarkdown = (text: string) => {
    return sanitizeHtml(
      text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>')
    )
  }

  if (!chatEmail) {
    return (
      <div className="inbox-aichat-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <p>{t('inbox.aiChat.noEmail')}</p>
      </div>
    )
  }

  return (
    <div className="inbox-aichat">
      {/* Email context bar */}
      <div className="inbox-aichat-context">
        <span className="inbox-aichat-context-label">{t('inbox.aiChat.context')}:</span>
        <span className="inbox-aichat-context-subject">{chatEmail.subject}</span>
        <span className="inbox-aichat-context-from">{chatEmail.from.name || chatEmail.from.address}</span>
      </div>

      {/* Messages */}
      <div className="inbox-aichat-messages">
        {aiChatMessages.length === 0 && !isStreaming && (
          <div className="inbox-aichat-hint">
            <p>Frage mich etwas zu dieser E-Mail, z.B.:</p>
            <div className="inbox-aichat-suggestions">
              <button onClick={() => handleSuggestion('Fasse diese E-Mail zusammen')}>
                Zusammenfassen
              </button>
              <button onClick={() => handleSuggestion('Erstelle einen Antwortentwurf')}>
                {t('inbox.aiChat.generateDraft')}
              </button>
              <button onClick={() => handleSuggestion('Was weiss ich ueber diesen Kontakt?')}>
                Kontakt-Info
              </button>
            </div>
          </div>
        )}
        {aiChatMessages.map((msg, i) => (
          <div key={i} className={`inbox-aichat-message ${msg.role}`}>
            <div
              className="inbox-aichat-message-content"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
            {msg.role === 'assistant' && (
              <button
                className="inbox-aichat-use-draft"
                onClick={() => handleUseDraft(msg.content)}
                title={t('inbox.aiChat.useDraft')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 17 4 12 9 7" />
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                </svg>
                {t('inbox.aiChat.useDraft')}
              </button>
            )}
          </div>
        ))}
        {isStreaming && streamingContent && (
          <div className="inbox-aichat-message assistant">
            <div
              className="inbox-aichat-message-content"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }}
            />
          </div>
        )}
        {isAiChatLoading && !streamingContent && (
          <div className="inbox-aichat-message assistant">
            <div className="inbox-aichat-message-content inbox-aichat-thinking">
              {t('inbox.aiChat.thinking')}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="inbox-aichat-input-bar">
        <textarea
          className="inbox-aichat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={t('inbox.aiChat.placeholder')}
          rows={2}
          disabled={isAiChatLoading}
        />
        <button
          className="inbox-aichat-send"
          onClick={handleSend}
          disabled={isAiChatLoading || !input.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
