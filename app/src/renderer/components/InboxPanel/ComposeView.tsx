import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useEmailStore } from '../../stores/emailStore'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useContactStore } from '../../stores/contactStore'
import { useTranslation } from '../../utils/translations'

export const ComposeView: React.FC = () => {
  const { t } = useTranslation()
  const { composeState, setComposeState, sendEmail, isSending, setCurrentView } = useEmailStore()
  const { email: emailSettings } = useUIStore()
  const { vaultPath } = useNotesStore()
  const { searchContacts } = useContactStore()

  const [toInput, setToInput] = useState('')
  const [ccInput, setCcInput] = useState('')
  const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [signatureImageUrl, setSignatureImageUrl] = useState<string | null>(null)

  // Signatur-Bild laden
  useEffect(() => {
    if (emailSettings.signatureImagePath) {
      window.electronAPI.emailLoadSignatureImage(emailSettings.signatureImagePath)
        .then(url => setSignatureImageUrl(url))
    } else {
      setSignatureImageUrl(null)
    }
  }, [emailSettings.signatureImagePath])
  const [toSuggestions, setToSuggestions] = useState<ReturnType<typeof searchContacts>>([])
  const [ccSuggestions, setCcSuggestions] = useState<ReturnType<typeof searchContacts>>([])
  const [showToDropdown, setShowToDropdown] = useState(false)
  const [showCcDropdown, setShowCcDropdown] = useState(false)
  const toDropdownRef = useRef<HTMLDivElement>(null)
  const ccDropdownRef = useRef<HTMLDivElement>(null)

  // Build contacts on mount
  useEffect(() => {
    const { contacts, buildContacts } = useContactStore.getState()
    if (contacts.length === 0) buildContacts()
  }, [])

  if (!composeState) return null

  const account = emailSettings.accounts.find(a => a.id === composeState.accountId)
  const hasSmtp = account?.smtpHost

  const parseEmailInput = (input: string): { name: string; address: string } | null => {
    const trimmed = input.trim()
    if (!trimmed) return null
    const match = trimmed.match(/^"?(.+?)"?\s*<(.+@.+)>$/)
    if (match) return { name: match[1].trim(), address: match[2].trim() }
    if (trimmed.includes('@')) return { name: '', address: trimmed }
    return null
  }

  const handleAddTo = useCallback(() => {
    const parsed = parseEmailInput(toInput)
    if (parsed) {
      setComposeState({
        ...composeState,
        to: [...composeState.to, parsed]
      })
      setToInput('')
      setShowToDropdown(false)
    }
  }, [toInput, composeState, setComposeState])

  const handleAddCc = useCallback(() => {
    const parsed = parseEmailInput(ccInput)
    if (parsed) {
      setComposeState({
        ...composeState,
        cc: [...(composeState.cc || []), parsed]
      })
      setCcInput('')
      setShowCcDropdown(false)
    }
  }, [ccInput, composeState, setComposeState])

  const handleRemoveTo = useCallback((index: number) => {
    setComposeState({
      ...composeState,
      to: composeState.to.filter((_, i) => i !== index)
    })
  }, [composeState, setComposeState])

  const handleRemoveCc = useCallback((index: number) => {
    setComposeState({
      ...composeState,
      cc: (composeState.cc || []).filter((_, i) => i !== index)
    })
  }, [composeState, setComposeState])

  const handleSelectContact = useCallback((email: string, name: string, field: 'to' | 'cc') => {
    const recipient = { name, address: email }
    if (field === 'to') {
      setComposeState({ ...composeState, to: [...composeState.to, recipient] })
      setToInput('')
      setShowToDropdown(false)
    } else {
      setComposeState({ ...composeState, cc: [...(composeState.cc || []), recipient] })
      setCcInput('')
      setShowCcDropdown(false)
    }
  }, [composeState, setComposeState])

  const handleToInputChange = (value: string) => {
    setToInput(value)
    if (value.length >= 2) {
      setToSuggestions(searchContacts(value))
      setShowToDropdown(true)
    } else {
      setShowToDropdown(false)
    }
  }

  const handleCcInputChange = (value: string) => {
    setCcInput(value)
    if (value.length >= 2) {
      setCcSuggestions(searchContacts(value))
      setShowCcDropdown(true)
    } else {
      setShowCcDropdown(false)
    }
  }

  const handleSend = useCallback(async () => {
    if (!vaultPath || !composeState.to.length) return
    setSendStatus('idle')
    setErrorMsg('')

    const result = await sendEmail(vaultPath)
    if (result.success) {
      setSendStatus('success')
      setTimeout(() => setSendStatus('idle'), 2000)
    } else {
      setSendStatus('error')
      setErrorMsg(result.error || t('inbox.compose.error'))
    }
  }, [vaultPath, composeState, sendEmail, t])

  const getSourceIcon = (sources: string[]) => {
    const icons: string[] = []
    if (sources.includes('email')) icons.push('📧')
    if (sources.includes('edoobox')) icons.push('📅')
    if (sources.includes('vault')) icons.push('📝')
    return icons.join('')
  }

  const renderSuggestionDropdown = (suggestions: ReturnType<typeof searchContacts>, show: boolean, field: 'to' | 'cc', ref: React.RefObject<HTMLDivElement | null>) => {
    if (!show || suggestions.length === 0) return null
    return (
      <div className="inbox-compose-dropdown" ref={ref}>
        {suggestions.map(contact => (
          <div
            key={contact.id}
            className="inbox-compose-dropdown-item"
            onMouseDown={e => {
              e.preventDefault()
              handleSelectContact(contact.email, contact.name, field)
            }}
          >
            <span className="inbox-compose-dropdown-name">{contact.name}</span>
            <span className="inbox-compose-dropdown-email">{contact.email}</span>
            <span className="inbox-compose-dropdown-source">{getSourceIcon(contact.sources)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="inbox-compose">
      {/* Account selector */}
      {emailSettings.accounts.length > 1 && (
        <div className="inbox-compose-row">
          <label>Von:</label>
          <select
            value={composeState.accountId}
            onChange={e => setComposeState({ ...composeState, accountId: e.target.value })}
          >
            {emailSettings.accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name || acc.user}</option>
            ))}
          </select>
        </div>
      )}

      {/* To field */}
      <div className="inbox-compose-row">
        <label>{t('inbox.compose.to')}:</label>
        <div className="inbox-compose-recipients-wrapper">
          <div className="inbox-compose-recipients">
            {composeState.to.map((r, i) => (
              <span key={i} className="inbox-compose-chip">
                {r.name || r.address}
                <button onClick={() => handleRemoveTo(i)}>&times;</button>
              </span>
            ))}
            <input
              type="text"
              value={toInput}
              onChange={e => handleToInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  if (showToDropdown && toSuggestions.length > 0) {
                    handleSelectContact(toSuggestions[0].email, toSuggestions[0].name, 'to')
                  } else {
                    handleAddTo()
                  }
                }
                if (e.key === 'Escape') setShowToDropdown(false)
              }}
              onBlur={() => {
                setTimeout(() => setShowToDropdown(false), 200)
                handleAddTo()
              }}
              placeholder={composeState.to.length === 0 ? t('inbox.compose.addRecipient') : ''}
            />
          </div>
          {renderSuggestionDropdown(toSuggestions, showToDropdown, 'to', toDropdownRef)}
        </div>
      </div>

      {/* CC field */}
      <div className="inbox-compose-row">
        <label>{t('inbox.compose.cc')}:</label>
        <div className="inbox-compose-recipients-wrapper">
          <div className="inbox-compose-recipients">
            {(composeState.cc || []).map((r, i) => (
              <span key={i} className="inbox-compose-chip">
                {r.name || r.address}
                <button onClick={() => handleRemoveCc(i)}>&times;</button>
              </span>
            ))}
            <input
              type="text"
              value={ccInput}
              onChange={e => handleCcInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  if (showCcDropdown && ccSuggestions.length > 0) {
                    handleSelectContact(ccSuggestions[0].email, ccSuggestions[0].name, 'cc')
                  } else {
                    handleAddCc()
                  }
                }
                if (e.key === 'Escape') setShowCcDropdown(false)
              }}
              onBlur={() => {
                setTimeout(() => setShowCcDropdown(false), 200)
                handleAddCc()
              }}
              placeholder=""
            />
          </div>
          {renderSuggestionDropdown(ccSuggestions, showCcDropdown, 'cc', ccDropdownRef)}
        </div>
      </div>

      {/* Subject */}
      <div className="inbox-compose-row">
        <label>{t('inbox.compose.subject')}:</label>
        <input
          type="text"
          className="inbox-compose-subject"
          value={composeState.subject}
          onChange={e => setComposeState({ ...composeState, subject: e.target.value })}
        />
      </div>

      {/* Body */}
      <textarea
        className="inbox-compose-body"
        value={composeState.body}
        onChange={e => setComposeState({ ...composeState, body: e.target.value })}
        placeholder={t('inbox.compose.body')}
      />

      {/* Signatur-Bild Vorschau */}
      {signatureImageUrl && (
        <div className="inbox-compose-sig-image">
          <img src={signatureImageUrl} alt="Signatur" />
        </div>
      )}

      {/* Status messages */}
      {!hasSmtp && (
        <div style={{ padding: '0 4px' }}>
          <span className="inbox-compose-warning">{t('inbox.compose.noSmtp')}</span>
        </div>
      )}
      {sendStatus === 'error' && (
        <div style={{ padding: '0 4px' }}>
          <span className="inbox-compose-error">{errorMsg}</span>
        </div>
      )}
      {sendStatus === 'success' && (
        <div style={{ padding: '0 4px' }}>
          <span className="inbox-compose-success">{t('inbox.compose.sent')}</span>
        </div>
      )}

      {/* Actions */}
      <div className="inbox-compose-actions">
        <button
          className="inbox-compose-send"
          onClick={handleSend}
          disabled={isSending || !hasSmtp || composeState.to.length === 0}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          {isSending ? t('inbox.compose.sending') : t('inbox.compose.send')}
        </button>
        <button
          className="inbox-compose-cancel"
          onClick={() => {
            setComposeState(null)
            setCurrentView('list')
          }}
        >
          {t('inbox.detail.back')}
        </button>
      </div>
    </div>
  )
}
