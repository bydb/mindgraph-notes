import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useEmailStore } from '../../stores/emailStore'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useContactStore } from '../../stores/contactStore'
import { useTranslation } from '../../utils/translations'
import { sanitizeHtml } from '../../utils/sanitize'
import type { ComposeAttachment } from '../../../shared/types'

export const ComposeView: React.FC = () => {
  const { t } = useTranslation()
  const { composeState, setComposeState, sendEmail, isSending, closeCompose, discardDraft, draftSaveError } = useEmailStore()
  const { email: emailSettings, languageTool: ltSettings } = useUIStore()
  const { vaultPath } = useNotesStore()
  const { searchContacts } = useContactStore()

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const [confirmEmptySubject, setConfirmEmptySubject] = useState(false)
  const [toInput, setToInput] = useState('')
  const [ccInput, setCcInput] = useState('')
  // Nur der Fehlerpfad lebt hier. Bei Erfolg baut der Store das Fenster sofort ab;
  // Erfolg und „nicht unter Gesendet abgelegt" zeigt die Inbox (lastSendResult).
  const [sendStatus, setSendStatus] = useState<'idle' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [signatureImageUrl, setSignatureImageUrl] = useState<string | null>(null)
  const [ltChecking, setLtChecking] = useState(false)
  const [ltCorrectionCount, setLtCorrectionCount] = useState(0)
  const [ltHighlights, setLtHighlights] = useState<{ offset: number; length: number }[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')

  // Markdown-Vorschau: rendert genau das HTML, das beim Senden erzeugt wird.
  useEffect(() => {
    if (!previewOpen) return
    let cancelled = false
    window.electronAPI.emailRenderHtml(useEmailStore.getState().composeState?.body || '')
      .then(html => { if (!cancelled) setPreviewHtml(html) })
    return () => { cancelled = true }
  }, [previewOpen, composeState?.body])

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
  const [bccSuggestions, setBccSuggestions] = useState<ReturnType<typeof searchContacts>>([])
  const [showToDropdown, setShowToDropdown] = useState(false)
  const [showCcDropdown, setShowCcDropdown] = useState(false)
  const [showBccDropdown, setShowBccDropdown] = useState(false)
  const [bccInput, setBccInput] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmMissingAttachments, setConfirmMissingAttachments] = useState(false)
  const toDropdownRef = useRef<HTMLDivElement>(null)
  const ccDropdownRef = useRef<HTMLDivElement>(null)
  const bccDropdownRef = useRef<HTMLDivElement>(null)

  // Kontakte bei jedem Öffnen neu aufbauen — sonst fehlen seit dem letzten
  // Build gesendete/abgerufene Adressen (Liste ist flüchtig, kein Cache nötig)
  useEffect(() => {
    void useContactStore.getState().buildContacts(vaultPath || undefined)
  }, [vaultPath])

  if (!composeState) return null

  const account = emailSettings.accounts.find(a => a.id === composeState.accountId)
  const hasSmtp = account?.smtpHost
  // Weiterleitung: solange Originalanhänge laden, ist Senden gesperrt (UI und
  // Store). Fehlen danach Dateien, braucht der Versand eine bewusste Freigabe.
  const forwardLoading = composeState.forwardAttachments?.status === 'loading'
  const forwardIncomplete = !!composeState.forwardAttachments && (
    composeState.forwardAttachments.status === 'failed' ||
    (composeState.forwardAttachments.status === 'done' && (composeState.forwardAttachments.skipped?.length ?? 0) > 0)
  )
  const sendBlocked = isSending || !hasSmtp || composeState.to.length === 0 || forwardLoading

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

  const handleAddBcc = useCallback(() => {
    const parsed = parseEmailInput(bccInput)
    if (parsed) {
      setComposeState({
        ...composeState,
        bcc: [...(composeState.bcc || []), parsed]
      })
      setBccInput('')
      setShowBccDropdown(false)
    }
  }, [bccInput, composeState, setComposeState])

  const handleRemoveBcc = useCallback((index: number) => {
    setComposeState({
      ...composeState,
      bcc: (composeState.bcc || []).filter((_, i) => i !== index)
    })
  }, [composeState, setComposeState])

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

  const handleSelectContact = useCallback((email: string, name: string, field: 'to' | 'cc' | 'bcc') => {
    const recipient = { name, address: email }
    if (field === 'to') {
      setComposeState({ ...composeState, to: [...composeState.to, recipient] })
      setToInput('')
      setShowToDropdown(false)
    } else if (field === 'cc') {
      setComposeState({ ...composeState, cc: [...(composeState.cc || []), recipient] })
      setCcInput('')
      setShowCcDropdown(false)
    } else {
      setComposeState({ ...composeState, bcc: [...(composeState.bcc || []), recipient] })
      setBccInput('')
      setShowBccDropdown(false)
    }
  }, [composeState, setComposeState])

  const handleBccInputChange = (value: string) => {
    setBccInput(value)
    if (value.length >= 2) {
      setBccSuggestions(searchContacts(value))
      setShowBccDropdown(true)
    } else {
      setShowBccDropdown(false)
    }
  }

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

  const applyFormat = useCallback((type: 'bold' | 'italic' | 'list' | 'hr') => {
    const textarea = bodyRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentState = useEmailStore.getState().composeState
    if (!currentState) return
    const text = currentState.body
    const selected = text.substring(start, end)
    let replacement = ''
    let cursorOffset = 0

    switch (type) {
      case 'bold':
        replacement = selected ? `**${selected}**` : '**Text**'
        cursorOffset = selected ? replacement.length : 2
        break
      case 'italic':
        replacement = selected ? `*${selected}*` : '*Text*'
        cursorOffset = selected ? replacement.length : 1
        break
      case 'list':
        if (selected) {
          replacement = selected.split('\n').map(line => `• ${line}`).join('\n')
        } else {
          replacement = '• '
        }
        cursorOffset = replacement.length
        break
      case 'hr':
        replacement = '\n———\n'
        cursorOffset = replacement.length
        break
    }

    const newBody = text.substring(0, start) + replacement + text.substring(end)
    setComposeState({ ...currentState, body: newBody })
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + cursorOffset, start + cursorOffset)
    }, 0)
  }, [setComposeState])

  // LanguageTool: Text pruefen und direkt korrigieren
  const checkAndCorrect = useCallback(async () => {
    if (!composeState?.body.trim() || !ltSettings.enabled) return
    setLtChecking(true)
    setLtCorrectionCount(0)
    try {
      const result = await window.electronAPI.languagetoolAnalyze(
        composeState.body,
        ltSettings.language || 'auto',
        ltSettings.mode,
        ltSettings.url,
        ltSettings.apiUsername,
        ltSettings.apiKey
      )
      if (result.success && result.matches && result.matches.length > 0) {
        // Korrekturen vorwaerts sammeln, dann rueckwaerts anwenden
        let correctedText = composeState.body
        const sorted = [...result.matches]
          .filter((m: { replacements: { value: string }[] }) => m.replacements && m.replacements.length > 0)
          .sort((a: { offset: number }, b: { offset: number }) => b.offset - a.offset)

        // Positionen der Korrekturen im neuen Text tracken
        const corrections: { offset: number; length: number }[] = []
        let count = 0
        for (const match of sorted) {
          const replacement = match.replacements[0].value
          correctedText =
            correctedText.substring(0, match.offset) +
            replacement +
            correctedText.substring(match.offset + match.length)
          corrections.push({ offset: match.offset, length: replacement.length })
          count++
        }

        // Offsets korrigieren (vorwaerts berechnen fuer die Highlights)
        // Da wir rueckwaerts angewandt haben, sind die Offsets im finalen Text verschoben
        // Sortiere vorwaerts und berechne kumulative Verschiebung
        const forwardSorted = [...result.matches]
          .filter((m: { replacements: { value: string }[] }) => m.replacements && m.replacements.length > 0)
          .sort((a: { offset: number }, b: { offset: number }) => a.offset - b.offset)
        const highlights: { offset: number; length: number }[] = []
        let shift = 0
        for (const match of forwardSorted) {
          const replacement = match.replacements[0].value
          highlights.push({ offset: match.offset + shift, length: replacement.length })
          shift += replacement.length - match.length
        }

        if (count > 0) {
          setComposeState({ ...composeState, body: correctedText })
          setLtCorrectionCount(count)
          setLtHighlights(highlights)
          // Highlights + Badge nach 4s ausblenden
          setTimeout(() => {
            setLtCorrectionCount(0)
            setLtHighlights([])
          }, 4000)
        }
      }
    } catch { /* ignore */ }
    setLtChecking(false)
  }, [composeState, ltSettings, setComposeState])

  const handleSend = useCallback(async (allowEmptySubject = false, allowMissingAttachments = false) => {
    if (!vaultPath || !composeState.to.length || isSending || !hasSmtp || forwardLoading) return
    if (!composeState.subject.trim() && !allowEmptySubject) {
      setConfirmEmptySubject(true)
      return
    }
    setConfirmEmptySubject(false)
    if (forwardIncomplete && !allowMissingAttachments) {
      setConfirmMissingAttachments(true)
      return
    }
    setConfirmMissingAttachments(false)
    setSendStatus('idle')
    setErrorMsg('')

    const result = await sendEmail(vaultPath)
    if (!result.success) {
      setSendStatus('error')
      setErrorMsg(result.error || t('inbox.compose.error'))
    }
  }, [vaultPath, composeState, isSending, hasSmtp, forwardLoading, forwardIncomplete, sendEmail, t])

  const getSourceIcon = (sources: string[]) => {
    const icons: string[] = []
    if (sources.includes('email')) icons.push('📧')
    if (sources.includes('edoobox')) icons.push('📅')
    if (sources.includes('vault')) icons.push('📝')
    return icons.join('')
  }

  const renderSuggestionDropdown = (suggestions: ReturnType<typeof searchContacts>, show: boolean, field: 'to' | 'cc' | 'bcc', ref: React.RefObject<HTMLDivElement | null>) => {
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

      {/* Reply-To-Umleitung sichtbar machen: Antwort geht NICHT an den Absender. */}
      {composeState.replyRedirect && (
        <div className="inbox-compose-redirect" role="note">
          {t('inbox.compose.replyRedirect')
            .replace('{replyTo}', composeState.replyRedirect.replyTo)
            .replace('{from}', composeState.replyRedirect.from)}
        </div>
      )}

      {/* Weiterleiten: Stand der Originalanhänge. Was nicht mitgeht, wird gesagt —
          eine Mail darf keine Anhänge behaupten, die sie nicht hat. */}
      {composeState.forwardAttachments && composeState.forwardAttachments.status === 'loading' && (
        <div className="inbox-compose-forward-note" role="status">{t('inbox.compose.forwardLoading')}</div>
      )}
      {composeState.forwardAttachments && composeState.forwardAttachments.status === 'done' && (composeState.forwardAttachments.skipped?.length ?? 0) > 0 && (
        <div className="inbox-compose-forward-note is-warning" role="alert">
          {t('inbox.compose.forwardSkipped').replace('{names}', composeState.forwardAttachments.skipped!.join(', '))}
        </div>
      )}
      {composeState.forwardAttachments && composeState.forwardAttachments.status === 'failed' && (
        <div className="inbox-compose-forward-note is-warning" role="alert">
          {t('inbox.compose.forwardFailed')
            .replace('{names}', (composeState.forwardAttachments.skipped || []).join(', ') || '?')
            .replace('{error}', composeState.forwardAttachments.error || '')}
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

      {/* BCC field */}
      <div className="inbox-compose-row">
        <label>{t('inbox.compose.bcc')}:</label>
        <div className="inbox-compose-recipients-wrapper">
          <div className="inbox-compose-recipients">
            {(composeState.bcc || []).map((r, i) => (
              <span key={i} className="inbox-compose-chip">
                {r.name || r.address}
                <button onClick={() => handleRemoveBcc(i)}>&times;</button>
              </span>
            ))}
            <input
              type="text"
              value={bccInput}
              onChange={e => handleBccInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  if (showBccDropdown && bccSuggestions.length > 0) {
                    handleSelectContact(bccSuggestions[0].email, bccSuggestions[0].name, 'bcc')
                  } else {
                    handleAddBcc()
                  }
                }
                if (e.key === 'Escape') setShowBccDropdown(false)
              }}
              onBlur={() => {
                setTimeout(() => setShowBccDropdown(false), 200)
                handleAddBcc()
              }}
              placeholder=""
            />
          </div>
          {renderSuggestionDropdown(bccSuggestions, showBccDropdown, 'bcc', bccDropdownRef)}
        </div>
      </div>

      {/* Subject */}
      <div className="inbox-compose-row">
        <label>{t('inbox.compose.subject')}:</label>
        <input
          type="text"
          className="inbox-compose-subject"
          ref={subjectRef}
          value={composeState.subject}
          onChange={e => {
            setConfirmEmptySubject(false)
            setComposeState({ ...composeState, subject: e.target.value })
          }}
        />
      </div>

      {/* Formatting toolbar + Body */}
      <div className="inbox-compose-format-bar">
        <button
          type="button"
          data-tooltip="Fett"
          onMouseDown={e => { e.preventDefault(); applyFormat('bold') }}
        >
          <strong>F</strong>
        </button>
        <button
          type="button"
          data-tooltip="Kursiv"
          onMouseDown={e => { e.preventDefault(); applyFormat('italic') }}
        >
          <em>K</em>
        </button>
        <button
          type="button"
          data-tooltip="Aufzählung"
          onMouseDown={e => { e.preventDefault(); applyFormat('list') }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          data-tooltip="Trennlinie"
          onMouseDown={e => { e.preventDefault(); applyFormat('hr') }}
        >
          —
        </button>
        <button
          type="button"
          className={previewOpen ? 'lt-corrected' : ''}
          data-tooltip={previewOpen ? 'Bearbeiten' : 'Vorschau (gerendertes Markdown)'}
          onMouseDown={e => { e.preventDefault(); setPreviewOpen(o => !o) }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        <span style={{ flex: 1 }} />
        {ltSettings.enabled && (
          <button
            type="button"
            className={ltCorrectionCount > 0 ? 'lt-corrected' : ''}
            data-tooltip={ltChecking ? t('inbox.compose.ltChecking') : t('inbox.compose.ltCheck')}
            onMouseDown={e => { e.preventDefault(); checkAndCorrect() }}
            disabled={ltChecking}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            {ltCorrectionCount > 0 && <span className="lt-corrected-badge">{ltCorrectionCount} korrigiert</span>}
          </button>
        )}
        <button
          type="button"
          data-tooltip={t('inbox.compose.addAttachment')}
          onMouseDown={async e => {
            e.preventDefault()
            const files: ComposeAttachment[] = await window.electronAPI.emailSelectAttachments()
            if (files.length > 0 && composeState) {
              setComposeState({
                ...composeState,
                attachments: [...(composeState.attachments || []), ...files]
              })
            }
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
      </div>
      <div className="inbox-compose-body-wrapper">
        {previewOpen ? (
          <div
            className="inbox-compose-body inbox-compose-preview"
            style={{ overflowY: 'auto', padding: '12px', whiteSpace: 'normal' }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }}
          />
        ) : (
        <>
        {/* Highlight-Overlay fuer LanguageTool Korrekturen */}
        {ltHighlights.length > 0 && (
          <div className="inbox-compose-lt-overlay" aria-hidden="true">
            {(() => {
              const text = composeState.body
              const parts: React.ReactNode[] = []
              let lastEnd = 0
              const sorted = [...ltHighlights].sort((a, b) => a.offset - b.offset)
              sorted.forEach((h, i) => {
                if (h.offset > lastEnd) {
                  parts.push(<span key={`t${i}`}>{text.substring(lastEnd, h.offset)}</span>)
                }
                parts.push(
                  <mark key={`h${i}`} className="lt-correction-mark">
                    {text.substring(h.offset, h.offset + h.length)}
                  </mark>
                )
                lastEnd = h.offset + h.length
              })
              if (lastEnd < text.length) {
                parts.push(<span key="end">{text.substring(lastEnd)}</span>)
              }
              return parts
            })()}
          </div>
        )}
        <textarea
          ref={bodyRef}
          className="inbox-compose-body"
          value={composeState.body}
          onChange={e => {
            setComposeState({ ...composeState, body: e.target.value })
            setLtHighlights([])
          }}
          placeholder={t('inbox.compose.body')}
        />
        </>
        )}
      </div>

      {/* Anhaenge */}
      {composeState.attachments && composeState.attachments.length > 0 && (
        <div className="inbox-compose-attachments">
          {composeState.attachments.map((att, i) => (
            <div key={i} className="inbox-compose-attachment">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              <span className="inbox-compose-attachment-name">{att.filename}</span>
              <span className="inbox-compose-attachment-size">
                {att.size < 1024 ? `${att.size} B` : att.size < 1048576 ? `${(att.size / 1024).toFixed(0)} KB` : `${(att.size / 1048576).toFixed(1)} MB`}
              </span>
              <button
                className="inbox-compose-attachment-remove"
                onClick={() => {
                  // Zwischengespeicherte Weiterleitungs-Anhänge gleich mit wegräumen.
                  if (att.path.includes('forward-attachments')) {
                    void window.electronAPI.emailDiscardStagedAttachments([att.path])
                  }
                  setComposeState({
                    ...composeState,
                    attachments: composeState.attachments!.filter((_, idx) => idx !== i)
                  })
                }}
                title={t('inbox.compose.removeAttachment')}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

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

      {/* Actions */}
      {confirmEmptySubject && (
        <div role="alert" className="inbox-compose-warning">
          {t('inbox.compose.emptySubjectWarning')}
          <div className="inbox-compose-actions">
            <button
              className="inbox-compose-cancel"
              autoFocus
              onClick={() => {
                setConfirmEmptySubject(false)
                subjectRef.current?.focus()
              }}
            >
              {t('inbox.compose.addSubject')}
            </button>
            <button
              className="inbox-compose-send"
              disabled={sendBlocked}
              onClick={() => handleSend(true)}
            >
              {t('inbox.compose.sendWithoutSubject')}
            </button>
          </div>
        </div>
      )}
      {confirmMissingAttachments && (
        <div role="alert" className="inbox-compose-warning">
          {t('inbox.compose.missingAttachmentsWarning').replace(
            '{names}',
            (composeState.forwardAttachments?.skipped || []).join(', ') || '?'
          )}
          <div className="inbox-compose-actions">
            <button className="inbox-compose-cancel" autoFocus onClick={() => setConfirmMissingAttachments(false)}>
              {t('inbox.compose.keep')}
            </button>
            <button
              className="inbox-compose-send"
              disabled={sendBlocked}
              onClick={() => handleSend(true, true)}
            >
              {t('inbox.compose.sendWithoutAttachments')}
            </button>
          </div>
        </div>
      )}
      {draftSaveError && (
        <div role="alert" className="inbox-compose-warning">
          {t('inbox.compose.draftSaveFailed').replace('{error}', draftSaveError)}
        </div>
      )}
      <div className="inbox-compose-actions">
        <button
          className="inbox-compose-send"
          onClick={() => handleSend()}
          disabled={sendBlocked}
          title={forwardLoading ? t('inbox.compose.forwardLoading') : undefined}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          {isSending ? t('inbox.compose.sending') : t('inbox.compose.send')}
        </button>
        <button
          className="inbox-compose-cancel"
          onClick={() => closeCompose()}
          title={t('inbox.compose.closeHint')}
        >
          {t('inbox.compose.close')}
        </button>
        {composeState.draftId && !confirmDiscard && (
          <button
            className="inbox-compose-cancel inbox-compose-discard"
            onClick={() => setConfirmDiscard(true)}
          >
            {t('inbox.compose.discard')}
          </button>
        )}
      </div>
      {confirmDiscard && (
        <div role="alert" className="inbox-compose-warning">
          <span>{t('inbox.compose.discardConfirm')}</span>
          <div className="inbox-compose-actions">
            <button className="inbox-compose-cancel" onClick={() => setConfirmDiscard(false)}>
              {t('inbox.compose.keep')}
            </button>
            <button
              className="inbox-compose-send inbox-compose-discard"
              onClick={() => { if (composeState.draftId) void discardDraft(composeState.draftId) }}
            >
              {t('inbox.compose.discardYes')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
