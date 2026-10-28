import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useEmailStore } from '../../stores/emailStore'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useContactStore } from '../../stores/contactStore'
import { useEventAgentBridge } from '../../stores/eventAgentBridge'
import { useTranslation } from '../../utils/translations'
import { sanitizeHtml } from '../../utils/sanitize'
import { buildEmailContext, fetchCalendarEvents, loadMissingNoteContents, LEAN_EMAIL_CONTEXT } from '../../utils/emailContextBuilder'
import { cloudRoutesForFeature, cloudProviderForSentinel, type CloudProviderId } from '../../../shared/llmBackend'
import { assessLocalRunRisk } from '../../../shared/localRunRisk'
import { ModelPicker } from '../Shared/ModelPicker'
import { Toggle } from '../Settings/SettingsUI'
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
    startReply
  } = useEmailStore()
  const { ollama } = useUIStore()
  const totalRamGb = useUIStore(s => s.systemTotalRamGb)
  const { notes } = useNotesStore()
  const { getContactByEmail } = useContactStore()
  const dashboardOffers = useEventAgentBridge(s => s.offers)

  const [input, setInput] = useState('')
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatEmail = aiChatEmailId ? emails.find(e => e.id === aiChatEmailId) : null

  // Cloud nur, wenn „E-Mail-Assistent" beim Anbieter freigegeben ist (der Main prüft das
  // noch einmal selbst). Wie im Notes-Chat: freigegebener Anbieter ist voreingestellt,
  // pro Sitzung auf lokal umschaltbar. Mit Cloud geht standardmäßig nur der schlanke
  // Kontext hinaus (Mail + Verlauf mit dem Kontakt), der Rest nur per Schalter.
  const cloudRoutes = cloudRoutesForFeature('email-draft', { openrouter: ollama.openrouter, llmbase: ollama.llmbase })
  const defaultCloudProvider = cloudRoutes[0]?.provider ?? null
  const [cloudProvider, setCloudProvider] = useState<CloudProviderId | null>(defaultCloudProvider)
  useEffect(() => { setCloudProvider(defaultCloudProvider) }, [defaultCloudProvider])
  const activeCloudRoute = cloudProvider ? (cloudRoutes.find(r => r.provider === cloudProvider) ?? null) : null
  const [shareFullContext, setShareFullContext] = useState(false)
  const localModel = ollama.selectedModel
  const localRisk = activeCloudRoute ? null : assessLocalRunRisk(localModel, totalRamGb)
  const canSend = !!activeCloudRoute || !!localModel

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

  const getContext = useCallback(async (lean: boolean) => {
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
      calendarEvents,
      lean ? LEAN_EMAIL_CONTEXT : {}
    )
  }, [chatEmail, emails, notes, dashboardOffers, getContactByEmail, calendarEvents])

  const sendMessage = useCallback(async (text: string) => {
    const userMessage = text.trim()
    if (!userMessage || isAiChatLoading || !canSend) return

    setInput('')
    addAiChatMessage({ role: 'user', content: userMessage })
    setAiChatLoading(true)
    setIsStreaming(true)
    setStreamingContent('')

    try {
      const context = await getContext(!!activeCloudRoute && !shareFullContext)

      const messages = [
        ...aiChatMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ]

      const cloud = activeCloudRoute ? { model: activeCloudRoute.model, provider: activeCloudRoute.provider } : null
      const result = await window.electronAPI.ollamaChat(
        localModel,
        messages,
        context,
        'email',
        cloud
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
  }, [isAiChatLoading, canSend, localModel, activeCloudRoute, shareFullContext, aiChatMessages, addAiChatMessage, setAiChatLoading, getContext])

  const handleSend = useCallback(() => {
    sendMessage(input)
  }, [sendMessage, input])

  const handleSuggestion = useCallback((text: string) => {
    sendMessage(text)
  }, [sendMessage])

  // Über denselben Weg wie „Antworten": Ursprungskonto, Reply-To, Thread-Header.
  // Vorher baute der Chat den Entwurf selbst — mit accounts[0] und from.
  const handleUseDraft = useCallback((content: string) => {
    if (!chatEmail) return
    startReply(chatEmail, content)
  }, [chatEmail, startReply])

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
      {/* Kopf: worum es geht, womit gerechnet wird und was dabei hinausgeht — eine Karte
          in der Sprache der Agent-Karte (Modellzeile + Wegmarke), zugeschnitten aufs schmale Panel. */}
      <div className="inbox-aichat-head">
        <div className="inbox-aichat-head-mail">
          <span className="inbox-aichat-head-eyebrow">{t('inbox.aiChat.aboutEmail')}</span>
          <span className="inbox-aichat-head-subject" title={chatEmail.subject}>{chatEmail.subject}</span>
          <span className="inbox-aichat-head-from" title={chatEmail.from.address}>{chatEmail.from.name || chatEmail.from.address}</span>
        </div>

        <div className="inbox-aichat-head-route">
          <div className="inbox-aichat-head-row">
            <span className="inbox-aichat-head-label">{t('agentCard.rowModel')}</span>
            <span className={`agent-card-route ${activeCloudRoute ? 'is-out' : ''}`}>
              {t(activeCloudRoute ? 'inbox.aiChat.routeCloud' : 'inbox.aiChat.routeLocalMark')}
            </span>
          </div>
          <ModelPicker
            value={activeCloudRoute ? activeCloudRoute.sentinel : localModel}
            models={[...cloudRoutes.map(r => ({ name: r.sentinel })), ...(localModel ? [{ name: localModel }] : [])]}
            onChange={name => setCloudProvider(cloudProviderForSentinel(name))}
            getLabel={name => cloudRoutes.find(r => r.sentinel === name)?.label ?? name}
            placeholder={localModel ? undefined : { value: '', label: t('inbox.aiChat.routeLocalNone') }}
            disabled={isAiChatLoading}
            ariaLabel={t('agentCard.rowModel')}
            maxWidth="100%"
          />

          {activeCloudRoute ? (
            <>
              <p className="inbox-aichat-head-note">{t('inbox.aiChat.cloudSends')}</p>
              <label className="inbox-aichat-head-switch">
                <Toggle
                  checked={shareFullContext}
                  onChange={setShareFullContext}
                  disabled={isAiChatLoading}
                />
                <span>{t('inbox.aiChat.shareFullContext')}</span>
              </label>
              <p className="inbox-aichat-head-note is-small">
                {t(shareFullContext ? 'inbox.aiChat.extrasGo' : 'inbox.aiChat.extrasStay')}
              </p>
            </>
          ) : localRisk && localRisk.risk !== 'ok' ? (
            <div className={`inbox-aichat-head-warn ${localRisk.risk === 'too-big' ? 'is-severe' : ''}`} role="note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="inbox-aichat-head-warn-body">
                <span>
                  {t(localRisk.risk === 'too-big' ? 'inbox.aiChat.localTooBig' : 'inbox.aiChat.localTight', {
                    model: localModel,
                    model_gb: String(localRisk.modelRamGb),
                    total_gb: String(localRisk.totalRamGb)
                  })}
                </span>
                {cloudRoutes.length > 0 ? (
                  <button
                    type="button"
                    className="agent-card-btn"
                    onClick={() => setCloudProvider(cloudRoutes[0].provider)}
                    disabled={isAiChatLoading}
                  >
                    {t('inbox.aiChat.useProvider', { provider: cloudRoutes[0].label })}
                  </button>
                ) : (
                  <span className="inbox-aichat-head-note is-small">{t('inbox.aiChat.localSetupCloud')}</span>
                )}
              </div>
            </div>
          ) : (
            <p className="inbox-aichat-head-note">{t('inbox.aiChat.localStays')}</p>
          )}
        </div>
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
          disabled={isAiChatLoading || !input.trim() || !canSend}
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
