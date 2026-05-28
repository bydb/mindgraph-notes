// CoachStep — Container für den adaptiven Onboarding-Chat.
//
// Vereint Begrüßung, Chat-Verlauf, Action-Karten und Endscreen in einer Komponente.
// Sub-Komponenten (Message, ActionCard, Input, Summary) sind hier inline, weil
// sie eng gekoppelt und kompakt sind — ein Split wäre Overhead ohne Nutzen.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { UserProfile } from '../../../stores/uiStore'
import { useCoachStore, type CoachAction, type CoachMessage } from '../../../stores/coachStore'
import { useTranslation } from '../../../utils/translations'
import { executeAction } from './coachActionExecutor'

interface CoachStepProps {
  vaultPath: string | null
  onVaultChosen: (path: string) => void
  onSkipToClassic: () => void
  onFinish: () => void
  isRestart?: boolean
}

export const CoachStep: React.FC<CoachStepProps> = ({
  vaultPath,
  onVaultChosen,
  onSkipToClassic,
  onFinish,
  isRestart = false
}) => {
  const { t, language } = useTranslation()
  const coach = useCoachStore()
  const startedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Einmaliger Start
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    coach.precheckAndStart(isRestart || !!vaultPath)
    // Bei Restart oder schon-vorhandenem-Vault gilt vaultReady=true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-Scroll bei neuer Message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [coach.conversation, coach.loading])

  const handleActionDecision = useCallback(async (msg: CoachMessage, action: CoachAction, accept: boolean) => {
    await coach.decideAction(msg.id, action.actionId, accept)
    if (!accept) return
    const ctx = {
      vaultPath,
      onVaultChosen: (path: string) => {
        onVaultChosen(path)
        coach.markVaultReady()
      }
    }
    const result = await executeAction(action, ctx, language as 'de' | 'en')
    if (result.ok) {
      coach.reportActionResult(msg.id, action.actionId, 'executed')
      if (action.type === 'suggest-profile') {
        coach.setSuggestedProfile(action.payload.profile as UserProfile)
      }
    } else {
      coach.reportActionResult(msg.id, action.actionId, 'failed', result.error)
    }
  }, [coach, vaultPath, onVaultChosen, language])

  // Pre-Check-Fehler / kein Backend
  if (coach.phase === 'error' && coach.backend === 'none') {
    return (
      <div className="onboarding-step onboarding-coach">
        <h2 className="onboarding-step-title">{t('onboarding.coach.errorTitle')}</h2>
        <p className="onboarding-step-desc">{coach.backendDetail || t('onboarding.coach.errorNoBackend')}</p>
        <div className="onboarding-nav">
          <button className="onboarding-btn-secondary" onClick={onSkipToClassic}>
            {t('onboarding.coach.skipToClassic')}
          </button>
        </div>
      </div>
    )
  }

  const isDone = coach.phase === 'done'

  return (
    <div className="onboarding-step onboarding-coach">
      <div className="onboarding-step-header">
        <span className="onboarding-step-indicator">{t('onboarding.coach.stepIndicator')}</span>
      </div>

      <div className="onboarding-coach-header">
        <h2 className="onboarding-step-title">{t('onboarding.coach.title')}</h2>
        {coach.backend && (
          <span className="onboarding-coach-backend" title={coach.backendDetail}>
            Ollama
          </span>
        )}
      </div>

      <div className="onboarding-coach-conversation" ref={scrollRef}>
        {coach.conversation.map(msg => (
          <CoachMessageView
            key={msg.id}
            msg={msg}
            onDecide={(action, accept) => handleActionDecision(msg, action, accept)}
          />
        ))}
        {coach.loading && (
          <div className="onboarding-coach-typing">
            <span className="dot" /><span className="dot" /><span className="dot" />
          </div>
        )}
      </div>

      {!isDone && (
        <CoachInput
          disabled={coach.loading || coach.phase === 'error'}
          onSubmit={text => coach.sendUserText(text)}
        />
      )}

      <div className="onboarding-nav onboarding-coach-nav">
        <button className="onboarding-btn-secondary" onClick={onSkipToClassic}>
          {t('onboarding.coach.skipToClassic')}
        </button>
        <button
          className="onboarding-btn-primary"
          onClick={() => { coach.finish(); onFinish() }}
          disabled={!vaultPath}
          title={!vaultPath ? t('onboarding.coach.needVaultFirst') : undefined}
        >
          {t('onboarding.coach.continueToWizard')}
        </button>
      </div>
    </div>
  )
}

// ─── Sub: Message + Actions ────────────────────────────────────────────

interface CoachMessageViewProps {
  msg: CoachMessage
  onDecide: (action: CoachAction, accept: boolean) => void
}

const CoachMessageView: React.FC<CoachMessageViewProps> = ({ msg, onDecide }) => {
  return (
    <div className={`onboarding-coach-msg onboarding-coach-msg-${msg.role}`}>
      <div className="onboarding-coach-msg-text">
        {msg.text.split('\n\n').map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      {msg.actions && msg.actions.length > 0 && (
        <div className="onboarding-coach-actions">
          {msg.actions.map(action => (
            <CoachActionCard
              key={action.actionId}
              action={action}
              onDecide={accept => onDecide(action, accept)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sub: Action-Card ──────────────────────────────────────────────────

interface CoachActionCardProps {
  action: CoachAction
  onDecide: (accept: boolean) => void
}

const CoachActionCard: React.FC<CoachActionCardProps> = ({ action, onDecide }) => {
  const { t } = useTranslation()
  const statusBadge =
    action.status === 'executed' ? t('onboarding.coach.action.done')
    : action.status === 'failed' ? t('onboarding.coach.action.failed')
    : action.status === 'declined' ? t('onboarding.coach.action.declined')
    : null

  return (
    <div className={`onboarding-coach-action-card status-${action.status}`}>
      <div className="onboarding-coach-action-head">
        <span className="onboarding-coach-action-type">{action.type}</span>
        {statusBadge && <span className="onboarding-coach-action-status">{statusBadge}</span>}
      </div>
      <div className="onboarding-coach-action-title">{action.title}</div>
      <div className="onboarding-coach-action-desc">{action.description}</div>
      {action.error && <div className="onboarding-coach-action-error">{action.error}</div>}
      {action.status === 'pending' && (
        <div className="onboarding-coach-action-btns">
          <button className="onboarding-btn-primary onboarding-btn-small" onClick={() => onDecide(true)}>
            {t('onboarding.coach.action.accept')}
          </button>
          <button className="onboarding-btn-secondary onboarding-btn-small" onClick={() => onDecide(false)}>
            {t('onboarding.coach.action.decline')}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Sub: Input ────────────────────────────────────────────────────────

interface CoachInputProps {
  disabled: boolean
  onSubmit: (text: string) => void
}

const CoachInput: React.FC<CoachInputProps> = ({ disabled, onSubmit }) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const handleSend = () => {
    if (!text.trim() || disabled) return
    onSubmit(text)
    setText('')
  }
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }
  return (
    <div className="onboarding-coach-input">
      <textarea
        className="onboarding-coach-input-textarea"
        placeholder={t('onboarding.coach.input.placeholder')}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKey}
        rows={2}
        disabled={disabled}
      />
      <button
        className="onboarding-btn-primary onboarding-btn-small"
        onClick={handleSend}
        disabled={disabled || !text.trim()}
      >
        {t('onboarding.coach.input.send')}
      </button>
    </div>
  )
}
