import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useEmailStore } from '../../stores/emailStore'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useContactStore } from '../../stores/contactStore'
import { useTranslation } from '../../utils/translations'
import { sanitizeHtml } from '../../utils/sanitize'
import type { ComposeAttachment } from '../../../shared/types'
import { isMicrosoftAccountId } from '../../../shared/emailAccountKind'
import {
  hasOpenRecipientGroup,
  looksLikeRecipientList,
  mergeRecipients,
  parseRecipientList,
  type Recipient
} from '../../../shared/emailRecipients'

type RecipientField = 'to' | 'cc' | 'bcc'
const RECIPIENT_FIELDS: RecipientField[] = ['to', 'cc', 'bcc']

export const ComposeView: React.FC = () => {
  const { t } = useTranslation()
  const { composeState, setComposeState, sendEmail, isSending, closeCompose, discardDraft, draftSaveError } = useEmailStore()
  const { email: emailSettings, languageTool: ltSettings } = useUIStore()
  const { vaultPath } = useNotesStore()
  const { searchContacts } = useContactStore()

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const [confirmEmptySubject, setConfirmEmptySubject] = useState(false)
  // Unklarer Versand (Verbindung brach nach dem Absenden ab): Die Mail kann schon unterwegs
  // sein. Ein zweiter Klick auf „Senden“ darf sie nicht still doppelt verschicken — erst nach
  // ausdrücklicher Bestätigung (Codex F20, microsoft-abschnitt-4a-review.md).
  const [uncertainSend, setUncertainSend] = useState(false)
  const [confirmResend, setConfirmResend] = useState(false)
  // Der Vermerk gehört zu genau einem Entwurf: bei einem anderen Entwurf gilt er nicht mehr.
  const composeDraftId = composeState?.draftId
  useEffect(() => { setUncertainSend(false); setConfirmResend(false) }, [composeDraftId])
  const [inputs, setInputs] = useState<Record<RecipientField, string>>({ to: '', cc: '', bcc: '' })
  const [invalid, setInvalid] = useState<Record<RecipientField, string[]>>({ to: [], cc: [], bcc: [] })
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
  const [suggestions, setSuggestions] = useState<Record<RecipientField, ReturnType<typeof searchContacts>>>({ to: [], cc: [], bcc: [] })
  const [showDropdown, setShowDropdown] = useState<Record<RecipientField, boolean>>({ to: false, cc: false, bcc: false })
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmMissingAttachments, setConfirmMissingAttachments] = useState(false)

  // Kontakte bei jedem Öffnen neu aufbauen — sonst fehlen seit dem letzten
  // Build gesendete/abgerufene Adressen (Liste ist flüchtig, kein Cache nötig)
  useEffect(() => {
    void useContactStore.getState().buildContacts(vaultPath || undefined)
  }, [vaultPath])

  if (!composeState) return null

  const account = emailSettings.accounts.find(a => a.id === composeState.accountId)
  // Microsoft-Konten senden über Graph und brauchen keinen SMTP-Server.
  const hasSmtp = account?.smtpHost || isMicrosoftAccountId(account?.id)
  // Weiterleitung: solange Originalanhänge laden, ist Senden gesperrt (UI und
  // Store). Fehlen danach Dateien, braucht der Versand eine bewusste Freigabe.
  const forwardLoading = composeState.forwardAttachments?.status === 'loading'
  const forwardIncomplete = !!composeState.forwardAttachments && (
    composeState.forwardAttachments.status === 'failed' ||
    (composeState.forwardAttachments.status === 'done' && (composeState.forwardAttachments.skipped?.length ?? 0) > 0)
  )
  // Getippte, noch nicht übernommene Adresse in „An“ zählt: Senden übernimmt sie zuerst.
  const sendBlocked = isSending || !hasSmtp || (composeState.to.length === 0 && !inputs.to.trim()) || forwardLoading

  const recipientsOf = (field: RecipientField): Recipient[] =>
    field === 'to' ? composeState.to : (composeState[field] || [])

  /** Text eines Feldes in Chips umsetzen. Liest den Store frisch, damit beim Senden
   *  drei Felder nacheinander übernommen werden können, ohne sich zu überschreiben.
   *  Liefert die Einträge, die keine gültige Adresse sind (bleiben im Feld stehen). */
  const commitField = (field: RecipientField, text: string = inputs[field]): string[] => {
    const current = useEmailStore.getState().composeState
    if (!current) return []
    const parsed = parseRecipientList(text)
    if (parsed.recipients.length > 0) {
      const existing = field === 'to' ? current.to : (current[field] || [])
      setComposeState({ ...current, [field]: mergeRecipients(existing, parsed.recipients) })
    }
    setInputs(prev => ({ ...prev, [field]: parsed.rest }))
    setInvalid(prev => ({ ...prev, [field]: parsed.invalid }))
    setShowDropdown(prev => ({ ...prev, [field]: false }))
    return parsed.invalid
  }

  const removeRecipient = (field: RecipientField, index: number) => {
    const current = useEmailStore.getState().composeState
    if (!current) return
    const list = field === 'to' ? current.to : (current[field] || [])
    setComposeState({ ...current, [field]: list.filter((_, i) => i !== index) })
  }

  const handleSelectContact = (email: string, name: string, field: RecipientField) => {
    const current = useEmailStore.getState().composeState
    if (!current) return
    const existing = field === 'to' ? current.to : (current[field] || [])
    setComposeState({ ...current, [field]: mergeRecipients(existing, [{ name, address: email }]) })
    setInputs(prev => ({ ...prev, [field]: '' }))
    setInvalid(prev => ({ ...prev, [field]: [] }))
    setShowDropdown(prev => ({ ...prev, [field]: false }))
  }

  const handleInputChange = (field: RecipientField, value: string) => {
    // Komma/Semikolon auf oberster Ebene schließt einen Eintrag ab — aber nicht
    // mitten in "Müller, Hans" oder <…>.
    const last = value.slice(-1)
    if ((last === ',' || last === ';') && !hasOpenRecipientGroup(value.slice(0, -1)) && value.slice(0, -1).includes('@')) {
      commitField(field, value.slice(0, -1))
      return
    }
    setInputs(prev => ({ ...prev, [field]: value }))
    if (invalid[field].length > 0) setInvalid(prev => ({ ...prev, [field]: [] }))
    if (value.length >= 2 && !looksLikeRecipientList(value)) {
      setSuggestions(prev => ({ ...prev, [field]: searchContacts(value) }))
      setShowDropdown(prev => ({ ...prev, [field]: true }))
    } else {
      setShowDropdown(prev => ({ ...prev, [field]: false }))
    }
  }

  /** Einfügen: Das einzeilige Feld würde die Zeilenumbrüche verschlucken
   *  („a@x.deb@y.de“). Deshalb den Text selbst aus der Zwischenablage lesen. */
  const handlePaste = (field: RecipientField, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text/plain')
    if (!pasted || !looksLikeRecipientList(pasted)) return // Einzelwort/-adresse: normales Einfügen
    e.preventDefault()
    const input = e.currentTarget
    const before = inputs[field].slice(0, input.selectionStart ?? inputs[field].length)
    const after = inputs[field].slice(input.selectionEnd ?? inputs[field].length)
    commitField(field, `${before}\n${pasted}\n${after}`)
  }

  const handleKeyDown = (field: RecipientField, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || (e.key === 'Tab' && inputs[field].trim())) {
      e.preventDefault()
      const list = suggestions[field]
      // Vorschlag nur für einen einzelnen getippten Suchbegriff — nie für eine Liste.
      if (showDropdown[field] && list.length > 0 && !looksLikeRecipientList(inputs[field])) {
        handleSelectContact(list[0].email, list[0].name, field)
      } else {
        commitField(field)
      }
    }
    if (e.key === 'Backspace' && !inputs[field]) {
      const list = recipientsOf(field)
      if (list.length > 0) removeRecipient(field, list.length - 1)
    }
    if (e.key === 'Escape') setShowDropdown(prev => ({ ...prev, [field]: false }))
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

  const handleSend = async (allowEmptySubject = false, allowMissingAttachments = false, allowResend = false) => {
    if (!vaultPath || isSending || !hasSmtp || forwardLoading) return
    // Erst alle drei Felder übernehmen. Bleibt irgendwo eine ungültige Eingabe stehen,
    // geht nichts raus — sonst erreicht die Mail nur einen Teil der Empfänger.
    const leftovers = RECIPIENT_FIELDS.flatMap(field => commitField(field))
    if (leftovers.length > 0) return
    if (!useEmailStore.getState().composeState?.to.length) return
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
    if (uncertainSend && !allowResend) {
      setConfirmResend(true)
      return
    }
    setConfirmResend(false)
    setSendStatus('idle')
    setErrorMsg('')

    const result = await sendEmail(vaultPath)
    if (!result.success) {
      setSendStatus('error')
      setErrorMsg(result.error || t('inbox.compose.error'))
      // Bleibt gesetzt, bis ein Versuch eindeutig endet (Erfolg schließt das Fenster,
      // eine sichere Absage setzt zurück).
      setUncertainSend(result.uncertain === true)
    }
  }

  const getSourceIcon = (sources: string[]) => {
    const icons: string[] = []
    if (sources.includes('email')) icons.push('📧')
    if (sources.includes('edoobox')) icons.push('📅')
    if (sources.includes('vault')) icons.push('📝')
    return icons.join('')
  }

  const renderSuggestionDropdown = (list: ReturnType<typeof searchContacts>, show: boolean, field: RecipientField) => {
    if (!show || list.length === 0) return null
    return (
      <div className="inbox-compose-dropdown">
        {list.map(contact => (
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

      {/* Empfänger: An / CC / BCC — gleiche Logik für alle drei Felder */}
      {RECIPIENT_FIELDS.map(field => (
        <div className="inbox-compose-row" key={field}>
          <label>{t(`inbox.compose.${field}`)}:</label>
          <div className="inbox-compose-recipients-wrapper">
            <div className={`inbox-compose-recipients${invalid[field].length > 0 ? ' is-invalid' : ''}`}>
              {recipientsOf(field).map((r, i) => (
                <span key={`${r.address}-${i}`} className="inbox-compose-chip" title={r.name ? r.address : undefined}>
                  {r.name || r.address}
                  <button type="button" aria-label={t('inbox.compose.removeRecipient')} onClick={() => removeRecipient(field, i)}>&times;</button>
                </span>
              ))}
              <input
                type="text"
                value={inputs[field]}
                aria-label={t(`inbox.compose.${field}`)}
                aria-invalid={invalid[field].length > 0 || undefined}
                onChange={e => handleInputChange(field, e.target.value)}
                onPaste={e => handlePaste(field, e)}
                onKeyDown={e => handleKeyDown(field, e)}
                onBlur={() => {
                  setTimeout(() => setShowDropdown(prev => ({ ...prev, [field]: false })), 200)
                  commitField(field)
                }}
                placeholder={field === 'to' && composeState.to.length === 0 ? t('inbox.compose.addRecipient') : ''}
              />
            </div>
            {invalid[field].length > 0 && (
              <div className="inbox-compose-recipient-error" role="alert">
                {t('inbox.compose.invalidRecipient').replace('{list}', invalid[field].join(', '))}
              </div>
            )}
            {renderSuggestionDropdown(suggestions[field], showDropdown[field], field)}
          </div>
        </div>
      ))}
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
      {confirmResend && (
        <div role="alert" className="inbox-compose-warning">
          {t('inbox.compose.uncertainResendWarning')}
          <div className="inbox-compose-actions">
            <button className="inbox-compose-cancel" autoFocus onClick={() => setConfirmResend(false)}>
              {t('inbox.compose.uncertainResendCancel')}
            </button>
            <button className="inbox-compose-send" disabled={sendBlocked} onClick={() => handleSend(true, true, true)}>
              {t('inbox.compose.uncertainResendConfirm')}
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
