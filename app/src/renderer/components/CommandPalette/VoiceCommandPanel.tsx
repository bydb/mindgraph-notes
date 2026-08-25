import React, { useEffect, useRef, useState } from 'react'
import { useVoiceCommandStore } from '../../stores/voiceCommandStore'
import { getVoiceUiBridge } from '../../voice/uiBridge'
import type { FollowUp } from '../../../shared/voiceCommands/types'
import './VoiceCommandPanel.css'

type TFn = (key: any, params?: Record<string, string | number>) => string

interface Props {
  t: TFn
  onClose: () => void
}

/**
 * Zeigt den Zustand der Sprachbefehle innerhalb der Befehlspalette — keine eigene Fläche.
 *
 * Das Transkript steht oben und ist editierbar. Whisper verhört sich im Deutschen
 * regelmäßig; wer nicht sieht, was verstanden wurde, schreibt den Fehler der App zu.
 * Enter im korrigierten Feld erkennt neu.
 */
export const VoiceCommandPanel: React.FC<Props> = ({ t, onClose }) => {
  const state = useVoiceCommandStore(s => s.state)
  const submit = useVoiceCommandStore(s => s.submit)
  const chooseOption = useVoiceCommandStore(s => s.chooseOption)
  const runDirect = useVoiceCommandStore(s => s.runDirect)
  const reset = useVoiceCommandStore(s => s.reset)
  const stopListening = useVoiceCommandStore(s => s.stopListening)

  const transcript = 'transcript' in state ? state.transcript ?? '' : ''
  const [draft, setDraft] = useState(transcript)
  const paramRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(transcript) }, [transcript])

  // Navigierende Aktionen schließen die Palette: die Navigation selbst ist die
  // Rückmeldung, und eine offene Palette würde das Ziel verdecken.
  useEffect(() => {
    if (state.kind === 'answer' && state.actionKind === 'navigate') {
      onClose()
      reset()
    }
  }, [state, onClose, reset])

  // Fehlender Parameter: das Eingabefeld ist der schnellere Weg als noch einmal sprechen.
  useEffect(() => {
    if (state.kind === 'clarify' && state.reason === 'missing-param') {
      setTimeout(() => paramRef.current?.focus(), 30)
    }
  }, [state])

  if (state.kind === 'idle') return null

  const runFollowUp = (followUp: FollowUp) => {
    if (followUp.kind === 'command') {
      getVoiceUiBridge()?.runCommand(followUp.commandId)
      onClose()
      reset()
      return
    }
    void runDirect(followUp.action, t)
  }

  const TranscriptField = (
    <div className="voice-transcript">
      <label className="voice-transcript-label">{t('voiceCommand.transcriptLabel')}</label>
      <input
        className="voice-transcript-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            void submit(draft, 'keyboard', t)
          }
        }}
      />
    </div>
  )

  if (state.kind === 'listening') {
    return (
      <div className="voice-panel">
        <div className="voice-status voice-status-live">{t('voiceCommand.listening')}</div>
        <button className="voice-secondary" onClick={() => void stopListening(t)}>{t('voiceCommand.stopListening')}</button>
      </div>
    )
  }

  if (state.kind === 'preparing' || state.kind === 'transcribing' || state.kind === 'running') {
    const label = state.kind === 'preparing'
      ? t('voiceCommand.preparing')
      : state.kind === 'transcribing' ? t('voiceCommand.transcribing') : t('voiceCommand.working')
    return (
      <div className="voice-panel">
        <div className="voice-status">{label}</div>
      </div>
    )
  }

  if (state.kind === 'clarify') {
    return (
      <div className="voice-panel">
        {TranscriptField}
        {state.reason === 'missing-param' ? (
          <>
            <div className="voice-status">{t('voiceCommand.missingQuery')}</div>
            <input
              ref={paramRef}
              className="voice-param-input"
              placeholder={t('voiceCommand.missingQueryPlaceholder')}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                e.stopPropagation()
                const value = (e.target as HTMLInputElement).value.trim()
                if (value) void submit(`suche nach ${value}`, 'keyboard', t)
              }}
            />
          </>
        ) : (
          <>
            <div className="voice-status">{t('voiceCommand.ambiguous')}</div>
            <div className="voice-options">
              {state.options.map((option, index) => (
                <button
                  key={option.id}
                  className="voice-option"
                  onClick={() => void chooseOption(index, t)}
                >
                  <span className="voice-option-index">{index + 1}</span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  if (state.kind === 'fallback') {
    return (
      <div className="voice-panel">
        {TranscriptField}
        <div className="voice-status">{t('voiceCommand.notUnderstood')}</div>
        <div className="voice-options">
          {state.entries.map(entry => {
            if (entry.kind === 'search-notes') {
              return (
                <button
                  key="search-notes"
                  className="voice-option"
                  onClick={() => {
                    getVoiceUiBridge()?.openQuickSearch(entry.query)
                    onClose()
                    reset()
                  }}
                >
                  {t('voiceCommand.fallbackSearch', { query: entry.query })}
                </button>
              )
            }
            const label = getVoiceUiBridge()?.getAvailableCommands().find(c => c.id === entry.id)?.label ?? entry.id
            return (
              <button
                key={entry.id}
                className="voice-option"
                onClick={() => {
                  getVoiceUiBridge()?.runCommand(entry.id)
                  onClose()
                  reset()
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="voice-panel">
        {transcript ? TranscriptField : null}
        <div className="voice-status voice-status-error">{state.message}</div>
      </div>
    )
  }

  // state.kind === 'answer' mit kind 'answer' (navigierende sind oben geschlossen worden)
  const { card } = state
  return (
    <div className="voice-panel">
      {/* Ohne Äußerung kein „Verstanden als" — die Karte kann auch ohne Frage entstehen
          (Klick auf die Tagesbilanz in der Statusleiste), und ein leeres Eingabefeld
          über der Antwort sieht dann aus wie ein Fehler. */}
      {transcript ? TranscriptField : null}
      <div className="voice-card">
        <div className="voice-card-title">{card.title}</div>
        {card.lines.length === 0 ? (
          <div className="voice-card-empty">{card.emptyText ?? t('voiceCommand.card.nothing')}</div>
        ) : (
          <ul className="voice-card-lines">
            {card.lines.map((line, i) => (
              <React.Fragment key={i}>
                {line.group && line.group !== card.lines[i - 1]?.group && (
                  <li className="voice-card-group">{line.group}</li>
                )}
                <li className="voice-card-line">
                  <span>{line.text}</span>
                  {typeof line.dueIn === 'number' && line.dueIn < 0 && (
                    <span className="voice-card-due">{t('voiceCommand.card.daysOverdue', { days: Math.abs(line.dueIn) })}</span>
                  )}
                </li>
              </React.Fragment>
            ))}
          </ul>
        )}
        {card.footnote && <div className="voice-card-footnote">{card.footnote}</div>}
        {card.followUps.length > 0 && (
          <div className="voice-card-followups">
            {card.followUps.map((followUp, i) => (
              <button key={i} className="voice-secondary" onClick={() => runFollowUp(followUp)}>
                {followUp.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
