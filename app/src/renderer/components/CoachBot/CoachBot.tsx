// CoachBot — dauerhaft erreichbarer Q&A-Helfer im Header.
// Klein, fokussiert, ephemerer Chatverlauf, KEINE Setup-Actions.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import MarkdownIt from 'markdown-it'
import { sanitizeHtml } from '../../utils/sanitize'
import { useUIStore } from '../../stores/uiStore'
import { useCoachBotStore } from '../../stores/coachBotStore'
import { useTranslation } from '../../utils/translations'
import './CoachBot.css'

export const CoachBot: React.FC = () => {
  const open = useUIStore(s => s.coachBotOpen)
  const setOpen = useUIStore(s => s.setCoachBotOpen)
  const { t } = useTranslation()
  const bot = useCoachBotStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Markdown-Renderer für Bot-Antworten — saubere Listen, Bold, Italic, Code.
  // Identisches Pattern wie in NotesChat.tsx — html: false + Sanitization.
  const md = useMemo(() => new MarkdownIt({ html: false, linkify: true, breaks: true }), [])

  // Auto-Scroll bei neuer Nachricht
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [bot.messages, bot.loading])

  // Auto-Focus beim Öffnen
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [open])

  // ESC zum Schließen
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || bot.loading) return
    setInput('')
    await bot.ask(text)
  }, [input, bot])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!open) return null

  return createPortal(
    <>
      <div className="coachbot-backdrop" onClick={() => setOpen(false)} />
      <div className="coachbot-panel" role="dialog" aria-label={t('coachbot.title')}>
        <div className="coachbot-header">
          <div className="coachbot-header-title">
            <RobotIcon />
            <span>{t('coachbot.title')}</span>
          </div>
          <div className="coachbot-header-actions">
            {bot.messages.length > 0 && (
              <button
                className="coachbot-clear-btn"
                onClick={() => bot.clear()}
                title={t('coachbot.clear')}
              >
                {t('coachbot.clear')}
              </button>
            )}
            <button className="coachbot-close-btn" onClick={() => setOpen(false)} title={t('coachbot.close')}>
              ✕
            </button>
          </div>
        </div>

        <div className="coachbot-messages" ref={scrollRef}>
          {bot.messages.length === 0 && (
            <div className="coachbot-empty">
              <RobotIcon size={32} />
              <p className="coachbot-empty-title">{t('coachbot.empty.title')}</p>
              <p className="coachbot-empty-desc">{t('coachbot.empty.desc')}</p>
              <div className="coachbot-suggestions">
                <button onClick={() => bot.ask(t('coachbot.suggest.kategorien'))}>{t('coachbot.suggest.kategorien')}</button>
                <button onClick={() => bot.ask(t('coachbot.suggest.modi'))}>{t('coachbot.suggest.modi')}</button>
                <button onClick={() => bot.ask(t('coachbot.suggest.shortcuts'))}>{t('coachbot.suggest.shortcuts')}</button>
                <button onClick={() => bot.ask(t('coachbot.suggest.terminal'))}>{t('coachbot.suggest.terminal')}</button>
              </div>
            </div>
          )}
          {bot.messages.map(msg => (
            <div key={msg.id} className={`coachbot-msg coachbot-msg-${msg.role}`}>
              {msg.role === 'assistant' ? (
                <div
                  className="coachbot-msg-bubble coachbot-msg-md"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(md.render(msg.text)) }}
                />
              ) : (
                <div className="coachbot-msg-bubble">{msg.text}</div>
              )}
            </div>
          ))}
          {bot.loading && (
            <div className="coachbot-typing">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
          )}
        </div>

        <div className="coachbot-input">
          <textarea
            ref={textareaRef}
            className="coachbot-input-textarea"
            placeholder={t('coachbot.input.placeholder')}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={2}
            disabled={bot.loading}
          />
          <button
            className="coachbot-send-btn"
            onClick={handleSend}
            disabled={bot.loading || !input.trim()}
            title={t('coachbot.input.send')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}

// Kleines Roboter-Icon — wird sowohl im Header-Button als auch im Empty-State genutzt.
export const RobotIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="13" rx="2"/>
    <path d="M12 2v3"/>
    <circle cx="12" cy="5" r="1"/>
    <circle cx="9" cy="14" r="1.2" fill="currentColor"/>
    <circle cx="15" cy="14" r="1.2" fill="currentColor"/>
    <path d="M9 18h6"/>
    <line x1="3" y1="13" x2="2" y2="13"/>
    <line x1="22" y1="13" x2="21" y2="13"/>
  </svg>
)
