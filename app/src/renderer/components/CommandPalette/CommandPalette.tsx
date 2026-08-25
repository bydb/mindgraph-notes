import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from '../../utils/translations'
import { useUIStore } from '../../stores/uiStore'
import { useVoiceCommandStore } from '../../stores/voiceCommandStore'
import { VoiceCommandPanel } from './VoiceCommandPanel'

// Aktions-Palette (Cmd+Shift+P): öffnet Panels, Ansichten, Tabs und Werkzeuge
// per Textsuche. Cmd+P/Cmd+K finden nur Notizen — für ~30 Oberflächen braucht
// es einen Einstieg, der Aktionen auffindbar macht, ohne Icons zu memorieren.
export interface CommandAction {
  id: string
  label: string
  /** Gruppen-Überschrift in der Liste (bereits übersetzt) */
  category: string
  /** Zusätzlicher Match-Text (z.B. englische/deutsche Synonyme) */
  keywords?: string
  shortcut?: string
  run: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  actions: CommandAction[]
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, actions }) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const speech = useUIStore(state => state.speech)
  const voiceState = useVoiceCommandStore(state => state.state)
  const voiceSubmit = useVoiceCommandStore(state => state.submit)
  const voiceStart = useVoiceCommandStore(state => state.startListening)
  const voiceStop = useVoiceCommandStore(state => state.stopListening)
  const voiceAbort = useVoiceCommandStore(state => state.abort)
  const voiceActive = voiceState.kind !== 'idle'
  // Eine Bedingung, nicht zwei: ein zweiter Opt-in-Schalter für einen Knopf, der bis
  // zum Klick nichts tut, versteckt die Funktion mehr als er schützt.
  const micEnabled = speech.enabled
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter(a => {
      const haystack = `${a.label} ${a.category} ${a.keywords ?? ''}`.toLowerCase()
      if (haystack.includes(q)) return true
      return fuzzyMatch(q, haystack)
    })
  }, [actions, query])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      // Schließen gibt das Mikrofon frei und beendet eine laufende Sprachausgabe.
      voiceAbort('blur')
    }
  }, [isOpen, voiceAbort])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('.quick-switcher-item')
      const selectedEl = items[selectedIndex] as HTMLElement | undefined
      selectedEl?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filtered[selectedIndex]) {
            const action = filtered[selectedIndex]
            onClose()
            action.run()
          } else if (query.trim()) {
            // Genau hier tat die Palette bisher nichts: kein Treffer, Enter verpufft.
            // Ein ganzer Satz ("was ist überfällig") landet deshalb im Erkenner, ohne
            // dass sich das bestehende Verhalten bei Treffern ändert.
            void voiceSubmit(query, 'keyboard', t)
          }
          break
        case 'Escape':
          e.preventDefault()
          // Erst die Sprachschicht zurücksetzen, dann die Palette schließen —
          // sonst nimmt ein Escape mitten in der Aufnahme das Mikrofon mit.
          if (voiceActive) voiceAbort('escape')
          else onClose()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filtered, selectedIndex, onClose, query, voiceActive, voiceAbort, voiceSubmit, t])

  if (!isOpen) return null

  return (
    <div className="quick-switcher-overlay" onClick={onClose}>
      <div className="quick-switcher" onClick={e => e.stopPropagation()}>
        <div className="quick-switcher-header command-palette-header">
          <input
            ref={inputRef}
            type="text"
            className="quick-switcher-search"
            placeholder={t('commandPalette.placeholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {micEnabled && (
            <button
              className={`voice-mic-button ${voiceState.kind === 'listening' ? 'recording' : ''}`}
              title={voiceState.kind === 'listening' ? t('voiceCommand.stopListening') : t('voiceCommand.startListening')}
              onClick={() => {
                if (voiceState.kind === 'listening') void voiceStop(t)
                else void voiceStart(t)
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            </button>
          )}
        </div>

        <VoiceCommandPanel t={t} onClose={onClose} />

        <div className="quick-switcher-list" ref={listRef} style={voiceActive ? { display: 'none' } : undefined}>
          {filtered.length === 0 ? (
            <div className="quick-switcher-empty">{t('commandPalette.noResults')}</div>
          ) : (
            filtered.map((action, index) => {
              const showCategory = index === 0 || filtered[index - 1].category !== action.category
              return (
                <React.Fragment key={action.id}>
                  {showCategory && (
                    <div className="command-palette-category">{action.category}</div>
                  )}
                  <div
                    className={`quick-switcher-item ${index === selectedIndex ? 'selected' : ''}`}
                    onClick={() => {
                      onClose()
                      action.run()
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="quick-switcher-info">
                      <span className="quick-switcher-title">{highlightMatch(action.label, query)}</span>
                    </div>
                    {action.shortcut && (
                      <span className="command-palette-shortcut">{action.shortcut}</span>
                    )}
                  </div>
                </React.Fragment>
              )
            })
          )}
        </div>

        <div className="quick-switcher-footer">
          <span>{t('common.navigate')}</span>
          <span>{t('common.enterOpen')}</span>
          <span>{t('wikilink.pressEscToClose')}</span>
        </div>
      </div>
    </div>
  )
}

export function fuzzyMatch(query: string, text: string): boolean {
  let queryIndex = 0
  for (let i = 0; i < text.length && queryIndex < query.length; i++) {
    if (text[i] === query[queryIndex]) {
      queryIndex++
    }
  }
  return queryIndex === query.length
}

export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)
  if (index === -1) return text
  return (
    <>
      {text.substring(0, index)}
      <mark>{text.substring(index, index + query.length)}</mark>
      {text.substring(index + query.length)}
    </>
  )
}
