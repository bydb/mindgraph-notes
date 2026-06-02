import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useEmailStore } from '../../stores/emailStore'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useProjectStatusStore } from '../../stores/projectStatusStore'
import { useTranslation } from '../../utils/translations'
import { sanitizeHtml, sanitizeEmailHtml } from '../../utils/sanitize'
import { matchEmailToProjects, gateProjectMatch } from '../../utils/projectMatch'
import { ComposeView } from './ComposeView'
import { EmailAIChatView } from './EmailAIChatView'
import { FolderPicker } from './FolderPicker'
import { IconCalendar } from '../Shared/Icons'
import type { EmailMessage } from '../../../shared/types'

const isMac = window.electronAPI.platform === 'darwin'

// URLs und E-Mail-Adressen im Klartext-Body anklickbar machen. Bewusst tolerant, aber
// ohne Satzzeichen am Ende in die URL zu ziehen.
const BODY_LINK_RE = /(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"']+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

function linkifyText(text: string, onLink: (href: string) => void): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  BODY_LINK_RE.lastIndex = 0
  while ((m = BODY_LINK_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const raw = m[0]
    const trail = raw.match(/[.,;:!?)\]}>"']+$/)?.[0] || ''
    const core = trail ? raw.slice(0, raw.length - trail.length) : raw
    const href = m[3] ? `mailto:${core}` : (m[2] ? `https://${core}` : core)
    nodes.push(
      <a key={`lnk-${key++}`} href={href} className="inbox-body-link" onClick={(e) => { e.preventDefault(); onLink(href) }}>{core}</a>
    )
    if (trail) nodes.push(trail)
    last = m.index + raw.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function base64ToUtf8(b64: string): string {
  try {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return ''
  }
}

interface ParsedIcsEvent { title: string; startIso: string; durationMinutes: number; notes: string }

function parseIcsDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/)
  if (!m) return null
  const [, y, mo, d, hh, mi, ss, z] = m
  if (!hh) return new Date(+y, +mo - 1, +d, 0, 0, 0) // reines Datum
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi, +(ss || '0')))
  // Ohne Z (auch bei TZID): als lokale Zeit interpretieren — pragmatisch, deckt Buchungssysteme ab.
  return new Date(+y, +mo - 1, +d, +hh, +mi, +(ss || '0'))
}

// Erstes VEVENT aus einer .ics-Datei in ein Kalender-Event übersetzen.
function parseIcsEvent(ics: string): ParsedIcsEvent | null {
  const unfolded = ics.replace(/\r?\n[ \t]/g, '') // RFC5545 line-unfolding
  const lines = unfolded.split(/\r?\n/)
  let inEvent = false
  const fields: Record<string, string> = {}
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; continue }
    if (line === 'END:VEVENT') break
    if (!inEvent) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const left = line.slice(0, idx)
    const semi = left.indexOf(';')
    const name = (semi === -1 ? left : left.slice(0, semi)).toUpperCase()
    if (!(name in fields)) fields[name] = line.slice(idx + 1)
  }
  const decode = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
  if (!fields['DTSTART']) return null
  const start = parseIcsDate(fields['DTSTART'])
  if (!start || isNaN(start.getTime())) return null
  let durationMinutes = 60
  if (fields['DTEND']) {
    const end = parseIcsDate(fields['DTEND'])
    if (end && !isNaN(end.getTime())) {
      const diff = Math.round((end.getTime() - start.getTime()) / 60000)
      if (diff > 0) durationMinutes = diff
    }
  }
  const title = decode(fields['SUMMARY'] || 'Termin')
  const loc = fields['LOCATION'] ? `Ort: ${decode(fields['LOCATION'])}` : ''
  const desc = fields['DESCRIPTION'] ? decode(fields['DESCRIPTION']) : ''
  return { title, startIso: start.toISOString(), durationMinutes, notes: [loc, desc].filter(Boolean).join('\n\n') }
}

interface InboxPanelProps {
  onClose: () => void
}

export const InboxPanel: React.FC<InboxPanelProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const { vaultPath } = useNotesStore()
  const {
    isFetching,
    isAnalyzing,
    fetchProgress,
    analysisProgress,
    analysisError,
    clearAnalysisError,
    activeFilter,
    getFilteredEmails,
    setFilter,
    fetchEmails,
    selectedEmailId,
    setSelectedEmail,
    currentView,
    setCurrentView,
    setComposeState,
    startReply,
    startForward,
    startNewEmail,
    setAiChatEmail,
    markReplyHandled,
    reanalyzeEmail
  } = useEmailStore()
  const { email: emailSettings } = useUIStore()
  const projectsRootFolder = useUIStore(s => s.projectsRootFolder)
  const projects = useProjectStatusStore(s => s.projects)
  const projectsLastLoadedAt = useProjectStatusStore(s => s.lastLoadedAt)
  const projectSynonyms = useProjectStatusStore(s => s.synonyms)
  const loadProjects = useProjectStatusStore(s => s.load)
  const loadAllSynonyms = useProjectStatusStore(s => s.loadAllSynonyms)
  const setEmailProject = useEmailStore(s => s.setEmailProject)

  const emails = useEmailStore(state => state.emails)
  const folders = useEmailStore(s => s.folders)
  const moveEmail = useEmailStore(s => s.moveEmail)
  const fetchAttachments = useEmailStore(s => s.fetchAttachments)
  const [searchQuery, setSearchQuery] = useState('')
  const [reminderStatus, setReminderStatus] = useState<Record<number, 'loading' | 'success' | 'error'>>({})
  const [showSummary, setShowSummary] = useState(false)
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [showMoveDropdown, setShowMoveDropdown] = useState(false)
  const [moveStatus, setMoveStatus] = useState<'idle' | 'moving' | 'error'>('idle')
  const [moveError, setMoveError] = useState<string>('')
  // Body-Ansicht (Text mit klickbaren Links ↔ sanitisiertes HTML) + Anhang-Handling.
  const [bodyHtmlView, setBodyHtmlView] = useState(false)
  const [attachmentList, setAttachmentList] = useState<Array<{ filename: string; contentType: string; size: number; contentBase64: string | null; tooLarge: boolean }> | null>(null)
  const [attachmentError, setAttachmentError] = useState('')
  const [attachmentAction, setAttachmentAction] = useState<Record<number, 'busy' | 'done' | 'error'>>({})
  const [icsMsg, setIcsMsg] = useState('')

  // Body-/Anhang-State bei Mailwechsel zurücksetzen (sonst Leak aus der vorherigen Mail).
  useEffect(() => {
    setBodyHtmlView(false)
    setAttachmentList(null)
    setAttachmentError('')
    setAttachmentAction({})
    setIcsMsg('')
  }, [selectedEmailId])

  const openLink = useCallback((href: string) => {
    if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
      window.electronAPI.openExternal(href)
    }
  }, [])

  // Links im sanitisierten HTML-Body abfangen → immer extern öffnen, nie In-App-Navigation.
  const handleBodyHtmlClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
    if (!el) return
    e.preventDefault()
    openLink(el.getAttribute('href') || '')
  }, [openLink])

  const renderEmailBody = useCallback((email: EmailMessage) => {
    if (bodyHtmlView && email.bodyHtml) {
      return (
        <div
          className="inbox-body-html"
          onClick={handleBodyHtmlClick}
          dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(email.bodyHtml) }}
        />
      )
    }
    return <pre>{linkifyText(email.bodyText, openLink)}</pre>
  }, [bodyHtmlView, handleBodyHtmlClick, openLink])

  const renderBodyBlock = useCallback((email: EmailMessage) => (
    <div className="inbox-analysis-section">
      {email.bodyHtml && (
        <button
          className="inbox-bodyview-toggle"
          onClick={() => setBodyHtmlView(v => !v)}
          data-tooltip={bodyHtmlView ? t('inbox.detail.textView') : t('inbox.detail.htmlView')}
        >
          {bodyHtmlView ? t('inbox.detail.textView') : t('inbox.detail.htmlView')}
        </button>
      )}
      <div className="inbox-original-text">
        {renderEmailBody(email)}
      </div>
    </div>
  ), [bodyHtmlView, renderEmailBody, t])

  // Anhänge bei Bedarf vom Server nachladen (Inhalt wird beim Abruf nicht gespeichert).
  const ensureAttachments = useCallback(async () => {
    if (attachmentList) return attachmentList
    if (!selectedEmailId) return null
    setAttachmentError('')
    const res = await fetchAttachments(selectedEmailId)
    if (!res.success || !res.attachments) {
      setAttachmentError(res.error || t('inbox.detail.attachmentError'))
      return null
    }
    setAttachmentList(res.attachments)
    return res.attachments
  }, [attachmentList, selectedEmailId, fetchAttachments, t])

  const handleAttachment = useCallback(async (index: number, action: 'save' | 'calendar') => {
    setAttachmentAction(s => ({ ...s, [index]: 'busy' }))
    setIcsMsg('')
    setAttachmentError('')
    try {
      const list = await ensureAttachments()
      const att = list?.[index]
      if (!att || !att.contentBase64) {
        setAttachmentError(att?.tooLarge ? t('inbox.detail.attachmentTooLarge') : t('inbox.detail.attachmentError'))
        setAttachmentAction(s => ({ ...s, [index]: 'error' }))
        return
      }
      if (action === 'calendar') {
        const ev = parseIcsEvent(base64ToUtf8(att.contentBase64))
        if (!ev) {
          setAttachmentError(t('inbox.detail.icsParseError'))
          setAttachmentAction(s => ({ ...s, [index]: 'error' }))
          return
        }
        const r = await window.electronAPI.calendarCreateEvent(ev)
        if (r.success) {
          setIcsMsg(t('inbox.detail.icsAdded'))
          setAttachmentAction(s => ({ ...s, [index]: 'done' }))
        } else {
          setAttachmentError(r.error || t('inbox.detail.icsParseError'))
          setAttachmentAction(s => ({ ...s, [index]: 'error' }))
        }
      } else {
        const r = await window.electronAPI.emailSaveAttachment(att.filename, att.contentBase64)
        if (r.success) {
          setAttachmentAction(s => ({ ...s, [index]: 'done' }))
        } else if (r.canceled) {
          setAttachmentAction(s => { const n = { ...s }; delete n[index]; return n })
        } else {
          setAttachmentError(r.error || t('inbox.detail.attachmentError'))
          setAttachmentAction(s => ({ ...s, [index]: 'error' }))
        }
      }
    } catch (e) {
      setAttachmentError(e instanceof Error ? e.message : t('inbox.detail.attachmentError'))
      setAttachmentAction(s => ({ ...s, [index]: 'error' }))
    }
  }, [ensureAttachments, t])

  useEffect(() => {
    if (vaultPath && projectsRootFolder && projectsLastLoadedAt === null) {
      loadProjects(vaultPath, projectsRootFolder)
    }
  }, [vaultPath, projectsRootFolder, projectsLastLoadedAt, loadProjects])

  useEffect(() => {
    if (vaultPath && projects.length > 0) {
      loadAllSynonyms(vaultPath)
    }
  }, [vaultPath, projects, loadAllSynonyms])

  // Folder-Liste pro Account beim Öffnen des Panels einmal laden.
  const loadFolders = useEmailStore(s => s.loadFolders)
  const accountIds = useMemo(() => emailSettings.accounts.map(a => a.id), [emailSettings.accounts])
  useEffect(() => {
    for (const id of accountIds) {
      loadFolders(id).catch(() => { /* Fehler ist im Store gespeichert */ })
    }
  }, [accountIds, loadFolders])

  const filteredEmails = getFilteredEmails()

  // Suchfilter anwenden
  const displayEmails = searchQuery
    ? filteredEmails.filter(e =>
        e.from.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.from.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.subject.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : filteredEmails

  const selectedEmail = selectedEmailId
    ? emails.find(e => e.id === selectedEmailId)
    : null

  const projectMatches = useMemo(() => {
    if (!selectedEmail || projects.length === 0) return []
    return matchEmailToProjects(
      { subject: selectedEmail.subject, bodyText: selectedEmail.bodyText },
      projects,
      projectSynonyms
    )
  }, [selectedEmail, projects, projectSynonyms])

  // Konfidenz-Gate über das Roh-Match (Single-Source, geteilt mit dem Workflow-Runner).
  const projectGate = useMemo(() => gateProjectMatch(projectMatches), [projectMatches])

  // Aktives Projekt = User-Override falls gesetzt, sonst NUR bei hoher Konfidenz.
  // userProject === null bedeutet "explizit kein Projekt" → keine Auto-Anzeige.
  const activeProject = useMemo(() => {
    if (!selectedEmail) return null
    if (selectedEmail.userProject === null) return null
    if (selectedEmail.userProject) {
      const explicit = projects.find(p => p.folderRel === selectedEmail.userProject)
      if (explicit) return explicit
    }
    return projectGate.confidence === 'high' ? projectGate.top?.project || null : null
  }, [selectedEmail, projects, projectGate])

  // Kandidaten fürs Override-Dropdown: alle gematchten Projekte außer dem aktiven.
  const otherProjectCandidates = useMemo(() => {
    return projectMatches
      .map(m => m.project)
      .filter(p => !activeProject || p.folderRel !== activeProject.folderRel)
  }, [projectMatches, activeProject])

  const activeMatch = useMemo(() => {
    if (!activeProject) return null
    return projectMatches.find(m => m.project.folderRel === activeProject.folderRel) || null
  }, [projectMatches, activeProject])

  // Sichtbare Zustände (nur wenn kein Auto-Projekt zugeordnet ist und der User nicht
  // explizit "kein Projekt" gewählt hat).
  const autoCleared = selectedEmail?.userProject === null
  const showProjectSuggestion = !activeProject && !autoCleared && projectGate.confidence === 'low' && !!projectGate.top
  const showProjectAmbiguous = !activeProject && !autoCleared && projectGate.confidence === 'ambiguous' && projectGate.candidates.length > 0
  const showProjectNone = !activeProject && !showProjectSuggestion && !showProjectAmbiguous

  useEffect(() => {
    setShowProjectDropdown(false)
    setShowMoveDropdown(false)
    setMoveStatus('idle')
    setMoveError('')
  }, [selectedEmailId])

  // Klick außerhalb schließt das Move-Dropdown.
  useEffect(() => {
    if (!showMoveDropdown) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.inbox-move-wrapper')) {
        setShowMoveDropdown(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [showMoveDropdown])

  // Folder-Liste für den "Verschieben"-Picker — kommt aus dem schon geladenen Folders-State
  // (FolderPicker triggert das auf Panel-Mount). Source-Folder rausfiltern + sortieren.
  const moveCandidates = useMemo(() => {
    if (!selectedEmail) return []
    const list = folders[selectedEmail.accountId] || []
    const source = selectedEmail.folder || 'INBOX'
    const SPECIAL_ORDER: Record<string, number> = {
      '\\Inbox': 0, '\\Drafts': 1, '\\Sent': 2, '\\Junk': 3, '\\Trash': 4, '\\Archive': 5, '\\All': 6
    }
    return list
      .filter(f => f.selectable !== false && f.path !== source)
      .sort((a, b) => {
        const aIsInbox = a.path === 'INBOX' || a.specialUse === '\\Inbox'
        const bIsInbox = b.path === 'INBOX' || b.specialUse === '\\Inbox'
        if (aIsInbox && !bIsInbox) return -1
        if (bIsInbox && !aIsInbox) return 1
        const aS = a.specialUse ? (SPECIAL_ORDER[a.specialUse] ?? 99) : 99
        const bS = b.specialUse ? (SPECIAL_ORDER[b.specialUse] ?? 99) : 99
        if (aS !== bS) return aS - bS
        return a.path.localeCompare(b.path, undefined, { sensitivity: 'base', numeric: true })
      })
  }, [selectedEmail, folders])

  const handleMove = useCallback(async (destination: string) => {
    if (!vaultPath || !selectedEmail) return
    setShowMoveDropdown(false)
    setMoveStatus('moving')
    setMoveError('')
    const result = await moveEmail(vaultPath, selectedEmail.id, destination)
    if (!result.success) {
      setMoveStatus('error')
      setMoveError(result.error || 'Fehler')
      setTimeout(() => { setMoveStatus('idle'); setMoveError('') }, 4000)
    } else {
      setMoveStatus('idle')
    }
  }, [vaultPath, selectedEmail, moveEmail])

  const handleOpenProjectStatus = useCallback((folderRel: string) => {
    const statusRel = `${folderRel}/_STATUS.md`
    const notesState = useNotesStore.getState()
    const note = notesState.getNoteByPath(statusRel)
    if (note) {
      notesState.selectNote(note.id)
      onClose()
      return
    }
    if (vaultPath) {
      window.electronAPI.showInFolder(`${vaultPath}/${statusRel}`).catch(() => {})
    }
  }, [vaultPath, onClose])

  const handlePickProject = useCallback(async (folderRel: string) => {
    if (!vaultPath || !selectedEmail) return
    await setEmailProject(vaultPath, selectedEmail.id, folderRel)
    setShowProjectDropdown(false)
    handleOpenProjectStatus(folderRel)
  }, [vaultPath, selectedEmail, setEmailProject, handleOpenProjectStatus])

  const handleClearProject = useCallback(async () => {
    if (!vaultPath || !selectedEmail) return
    await setEmailProject(vaultPath, selectedEmail.id, null)
    setShowProjectDropdown(false)
  }, [vaultPath, selectedEmail, setEmailProject])

  const handleRefresh = useCallback(async () => {
    if (!vaultPath || isFetching) return
    await fetchEmails(vaultPath, true)
  }, [vaultPath, isFetching, fetchEmails])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Gestern'
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    }
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
  }

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return '#22c55e'
      case 'negative': return '#ef4444'
      case 'urgent': return '#f59e0b'
      default: return '#94a3b8'
    }
  }

  const getSentimentLabel = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return t('inbox.sentiment.positive')
      case 'negative': return t('inbox.sentiment.negative')
      case 'urgent': return t('inbox.sentiment.urgent')
      default: return t('inbox.sentiment.neutral')
    }
  }

  const handleCreateReminder = useCallback(async (action: Record<string, unknown> | string, index: number) => {
    if (!selectedEmail) return
    setReminderStatus(prev => ({ ...prev, [index]: 'loading' }))

    try {
      let title: string
      let dueDate: string | undefined
      let dueTime: string | undefined

      if (typeof action === 'object' && action !== null) {
        title = String(action.action || action.beschreibung || '')
        const rawDate = String(action.date || action.datum || '')
        const rawTime = String(action.time || action.uhrzeit || '')
        dueDate = rawDate.match(/^\d{4}-\d{2}-\d{2}$/) ? rawDate : undefined
        const timeMatch = rawTime.match(/(\d{1,2}:\d{2})/)
        dueTime = timeMatch ? timeMatch[1] : undefined
      } else {
        title = String(action)
        const isoMatch = title.match(/(\d{4}-\d{2}-\d{2})/)
        dueDate = isoMatch ? isoMatch[1] : undefined
        const timeMatch = title.match(/(\d{1,2}:\d{2})/)
        dueTime = timeMatch ? timeMatch[1] : undefined
      }

      const notes = `Von: ${selectedEmail.from.name || selectedEmail.from.address}\nBetreff: ${selectedEmail.subject}`

      const result = await window.electronAPI.createAppleReminder({
        title: title.substring(0, 200),
        notes,
        dueDate,
        dueTime
      })

      setReminderStatus(prev => ({ ...prev, [index]: result.success ? 'success' : 'error' }))
    } catch {
      setReminderStatus(prev => ({ ...prev, [index]: 'error' }))
    }
  }, [selectedEmail])

  // View-Switcher Header (shared across all views)
  const renderHeader = (showBack?: boolean, backAction?: () => void) => (
    <div className="inbox-panel-header">
      <div className="inbox-panel-title">
        {showBack && (
          <button
            className="inbox-panel-close"
            data-tooltip={t('inbox.detail.back')}
            onClick={backAction}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        <span>{t('inbox.title')}</span>
      </div>
      <div style={{ display: 'flex', gap: '2px' }}>
        {/* Compose button */}
        <button
          className={`inbox-header-btn ${currentView === 'compose' ? 'active' : ''}`}
          onClick={() => startNewEmail()}
          data-tooltip={t('inbox.compose')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>{t('inbox.compose.short')}</span>
        </button>
        {/* AI Chat button */}
        <button
          className={`inbox-header-btn ${currentView === 'aiChat' ? 'active' : ''}`}
          onClick={() => {
            useEmailStore.getState().clearAiChat()
            setCurrentView('aiChat')
          }}
          data-tooltip={t('inbox.aiChat.title')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>KI</span>
        </button>
        {/* Refresh */}
        <button
          className="inbox-panel-close"
          onClick={handleRefresh}
          disabled={isFetching}
          data-tooltip={t('inbox.refresh')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isFetching ? 'spinning' : ''}>
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
          </svg>
        </button>
        <button className="inbox-panel-close" data-tooltip={t('panel.close')} onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )

  // Compose view
  if (currentView === 'compose') {
    return (
      <>
        <div className="inbox-panel inbox-panel-compose-shell">
          {renderHeader(true, () => setCurrentView(selectedEmailId ? 'detail' : 'list'))}
          <div className="inbox-compose-shell-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>{t('inbox.compose')}</span>
          </div>
        </div>
        {createPortal(
          <div className="inbox-compose-overlay" role="dialog" aria-modal="true" aria-label={t('inbox.compose')}>
            <div className="inbox-compose-modal">
              <div className="inbox-compose-modal-header">
                <div className="inbox-compose-modal-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  <span>{t('inbox.compose')}</span>
                </div>
                <button
                  className="inbox-panel-close"
                  data-tooltip={t('panel.close')}
                  onClick={() => {
                    setComposeState(null)
                    setCurrentView(selectedEmailId ? 'detail' : 'list')
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="inbox-compose-modal-body">
                <ComposeView />
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    )
  }

  // AI Chat view
  if (currentView === 'aiChat') {
    return (
      <div className="inbox-panel">
        {renderHeader(true, () => setCurrentView(selectedEmailId ? 'detail' : 'list'))}
        <div className="inbox-panel-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <EmailAIChatView />
        </div>
      </div>
    )
  }

  // Detail view
  if (selectedEmail && currentView === 'detail') {
    return (
      <div className="inbox-panel">
        {renderHeader(true, () => { setSelectedEmail(null); setCurrentView('list') })}
        <div className="inbox-panel-content">
          <div className="inbox-email-detail">
            <div className="inbox-email-detail-header">
              <h3>{selectedEmail.subject}</h3>
              <div className="inbox-email-detail-meta">
                <span className="inbox-email-from">{selectedEmail.from.name || selectedEmail.from.address}</span>
                <span className="inbox-email-date">{formatDate(selectedEmail.date)}</span>
              </div>
              {/* Needs reply indicator */}
              {selectedEmail.analysis?.needsReply && !selectedEmail.analysis.replyHandled && (
                <div className={`inbox-needs-reply ${selectedEmail.analysis.replyUrgency || 'medium'}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 17 4 12 9 7" />
                    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                  </svg>
                  <span>{t(`inbox.needsReply.${selectedEmail.analysis.replyUrgency || 'medium'}`)}</span>
                </div>
              )}
              {selectedEmail.analysis?.replyHandled && (
                <div className="inbox-needs-reply handled">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{t('inbox.markedHandled')}</span>
                </div>
              )}

              {/* Attachments: Inhalt wird on-demand vom Server geladen (siehe handleAttachment) */}
              {selectedEmail.hasAttachments && selectedEmail.attachmentNames && selectedEmail.attachmentNames.length > 0 && (
                <div className="inbox-attachment-info">
                  <div className="inbox-attachment-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    <span>{selectedEmail.attachmentNames.length} {t('inbox.detail.attachments')}</span>
                  </div>
                  <div className="inbox-attachment-list">
                    {selectedEmail.attachmentNames.map((name, i) => {
                      const loaded = attachmentList?.[i]
                      const displayName = loaded?.filename || name
                      const isIcs = /\.ics$/i.test(displayName) || !!loaded?.contentType?.toLowerCase().includes('calendar')
                      const status = attachmentAction[i]
                      const busy = status === 'busy'
                      return (
                        <div key={i} className="inbox-attachment-row">
                          <span className="inbox-attachment-name" title={displayName}>{displayName}</span>
                          <span className="inbox-attachment-actions">
                            {isIcs && isMac && (
                              <button
                                className="inbox-attachment-btn"
                                onClick={() => handleAttachment(i, 'calendar')}
                                disabled={busy}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                {status === 'done' ? <span>✓</span> : <IconCalendar size={12} />}
                                {t('inbox.detail.addToCalendar')}
                              </button>
                            )}
                            <button
                              className="inbox-attachment-btn"
                              onClick={() => handleAttachment(i, 'save')}
                              disabled={busy}
                            >
                              {busy ? '…' : '💾'} {t('inbox.detail.saveAttachment')}
                            </button>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {icsMsg && <div className="inbox-attachment-ok">{icsMsg}</div>}
                  {attachmentError && <div className="inbox-attachment-err">{attachmentError}</div>}
                </div>
              )}

              {/* Action buttons */}
              <div className="inbox-email-actions">
                <button className="inbox-action-btn" onClick={() => startReply(selectedEmail)} data-tooltip={t('inbox.reply.tooltip')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 17 4 12 9 7" />
                    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                  </svg>
                  {t('inbox.reply')}
                </button>
                <button className="inbox-action-btn" onClick={() => startForward(selectedEmail)} data-tooltip={t('inbox.forward.tooltip')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 17 20 12 15 7" />
                    <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
                  </svg>
                  {t('inbox.forward')}
                </button>
                <button className="inbox-action-btn" onClick={() => setAiChatEmail(selectedEmail.id)} data-tooltip={t('inbox.discuss.tooltip')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {t('inbox.discuss')}
                </button>
                {selectedEmail.analysis?.needsReply && (
                  <button
                    className="inbox-action-btn"
                    onClick={() => vaultPath && markReplyHandled(vaultPath, selectedEmail.id, !selectedEmail.analysis?.replyHandled)}
                    data-tooltip={selectedEmail.analysis?.replyHandled ? t('inbox.markUnhandled') : t('inbox.markHandled')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {selectedEmail.analysis?.replyHandled ? t('inbox.markUnhandled') : t('inbox.markHandled')}
                  </button>
                )}
                {/* Move-to-folder */}
                {selectedEmail.uid > 0 && (
                  <div className="inbox-move-wrapper">
                    <button
                      className={`inbox-action-btn ${showMoveDropdown ? 'is-open' : ''}`}
                      onClick={() => setShowMoveDropdown(v => !v)}
                      disabled={moveStatus === 'moving' || moveCandidates.length === 0}
                      data-tooltip={moveCandidates.length === 0 ? t('inbox.move.noFolders') : t('inbox.move.tooltip')}
                    >
                      {moveStatus === 'moving' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinning">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          <polyline points="12 11 12 17" />
                          <polyline points="9 14 12 17 15 14" />
                        </svg>
                      )}
                      {t('inbox.move')}
                    </button>
                    {showMoveDropdown && moveCandidates.length > 0 && (
                      <div className="inbox-move-dropdown" role="menu">
                        <div className="inbox-move-dropdown-header">{t('inbox.move.header')}</div>
                        {moveCandidates.map(f => {
                          const segs = f.path.split(f.delimiter || '/').filter(Boolean)
                          const display = f.path === 'INBOX' ? 'Inbox' : (segs[segs.length - 1] || f.path)
                          return (
                            <button
                              key={f.path}
                              type="button"
                              className="inbox-move-dropdown-item"
                              onClick={() => handleMove(f.path)}
                              title={f.path}
                            >
                              <span>{display}</span>
                              {f.path !== display && (
                                <span className="inbox-move-dropdown-path">{f.path}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {moveStatus === 'error' && (
                <div className="inbox-move-error" role="alert">{moveError}</div>
              )}
            </div>

            {selectedEmail.analysis && (() => {
              const criticalCategories = ['phishing', 'spam', 'scam', 'malware', 'betrug']
              const hasCritical = selectedEmail.analysis.categories.some(cat => {
                const catStr = (typeof cat === 'string' ? cat : String(cat)).toLowerCase()
                return criticalCategories.some(c => catStr.includes(c))
              })

              return (
                <div className={`inbox-email-analysis ${hasCritical ? 'inbox-analysis-critical' : ''}`}>
                  {hasCritical && (
                    <div className="inbox-critical-warning">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span>Kritisch — möglicher Phishing/Spam</span>
                    </div>
                  )}

                  <div className="inbox-analysis-row">
                    <span className="inbox-analysis-label">{t('inbox.detail.relevance')}</span>
                    <div className="inbox-analysis-value">
                      <div className="inbox-relevance-bar">
                        <div
                          className="inbox-relevance-fill"
                          style={{ width: `${selectedEmail.analysis.relevanceScore}%` }}
                        />
                      </div>
                      <span>{selectedEmail.analysis.relevanceScore}%</span>
                    </div>
                  </div>

                  {selectedEmail.analysis.relevanceReasons && selectedEmail.analysis.relevanceReasons.length > 0 && (
                    <div className="inbox-analysis-row" style={{ alignItems: 'flex-start' }}>
                      <span className="inbox-analysis-label">{t('inbox.detail.relevanceReasons')}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1 }}>
                        {selectedEmail.analysis.relevanceReasons.map((reason, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: 'color-mix(in srgb, var(--accent-color) 14%, transparent)',
                              color: 'var(--text-secondary, var(--text-muted))',
                              border: '1px solid color-mix(in srgb, var(--accent-color) 25%, transparent)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="inbox-analysis-row">
                    <span className="inbox-analysis-label">{t('inbox.detail.sentiment')}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="inbox-sentiment-dot" style={{ background: getSentimentColor(selectedEmail.analysis.sentiment) }} />
                      {getSentimentLabel(selectedEmail.analysis.sentiment)}
                    </span>
                  </div>

                  {selectedEmail.analysis.model && (
                    <div className="inbox-analysis-row">
                      <span className="inbox-analysis-label">{t('inbox.detail.model')}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {selectedEmail.analysis.model}
                        <button
                          type="button"
                          onClick={() => vaultPath && reanalyzeEmail(vaultPath, selectedEmail.id)}
                          disabled={isAnalyzing || !vaultPath}
                          title={t('inbox.detail.reanalyzeHint')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            cursor: isAnalyzing ? 'wait' : 'pointer',
                            opacity: isAnalyzing ? 0.5 : 1
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="23 4 23 10 17 10"/>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                          </svg>
                          {t('inbox.detail.reanalyze')}
                        </button>
                      </span>
                    </div>
                  )}

                  {projects.length > 0 && (
                    <div className="inbox-analysis-row">
                      <span className="inbox-analysis-label">{t('inbox.detail.project')}</span>
                      <div className="inbox-project-row">
                        {/* ZUGEORDNET: hohe Konfidenz oder manueller Override */}
                        {activeProject && (
                          <button
                            type="button"
                            className={`inbox-project-chip priority-${activeProject.marker.priority} ${selectedEmail.userProject ? 'is-user-set' : ''}`}
                            onClick={() => handleOpenProjectStatus(activeProject.folderRel)}
                            title={(() => {
                              const base = t('inbox.detail.openProjectStatus')
                              if (selectedEmail.userProject) return `${base}\n${t('inbox.detail.matchManual')}`
                              if (activeMatch && activeMatch.matchedTerms.length > 0) {
                                return `${base}\n${t('inbox.detail.matchedTerms')}: ${activeMatch.matchedTerms.join(', ')}`
                              }
                              return base
                            })()}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            <span>{activeProject.marker.project || activeProject.folderName}</span>
                          </button>
                        )}

                        {/* VORSCHLAG: niedrige Konfidenz, nicht automatisch zugeordnet */}
                        {showProjectSuggestion && projectGate.top && (
                          <div className="inbox-project-suggestion">
                            <span
                              className="inbox-project-suggestion-label"
                              title={projectGate.top.matchedTerms.length > 0
                                ? `${t('inbox.detail.matchedTerms')}: ${projectGate.top.matchedTerms.join(', ')}`
                                : undefined}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
                              </svg>
                              {t('inbox.detail.suggestion')}: {projectGate.top.project.marker.project || projectGate.top.project.folderName}
                            </span>
                            <button
                              type="button"
                              className="inbox-project-suggestion-accept"
                              onClick={() => projectGate.top && handlePickProject(projectGate.top.project.folderRel)}
                              title={t('inbox.detail.acceptSuggestion')}
                            >✓</button>
                            <button
                              type="button"
                              className="inbox-project-suggestion-dismiss"
                              onClick={handleClearProject}
                              title={t('inbox.detail.dismissSuggestion')}
                            >×</button>
                          </div>
                        )}

                        {/* MEHRDEUTIG: mehrere Projekte gleichauf — bewusst keine Vorauswahl */}
                        {showProjectAmbiguous && (
                          <div className="inbox-project-ambiguous">
                            <span className="inbox-project-ambiguous-label">{t('inbox.detail.ambiguous')}</span>
                            {projectGate.candidates.map(m => (
                              <button
                                key={m.project.folderRel}
                                type="button"
                                className={`inbox-project-chip is-candidate priority-${m.project.marker.priority}`}
                                onClick={() => handlePickProject(m.project.folderRel)}
                              >
                                <span>{m.project.marker.project || m.project.folderName}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* KEIN PROJEKT erkannt */}
                        {showProjectNone && (
                          <span className="inbox-project-none">{t('inbox.detail.noMatch')}</span>
                        )}

                        {/* Override-Dropdown — in ALLEN Zuständen erreichbar */}
                        <div className="inbox-project-dropdown-wrapper">
                          <button
                            type="button"
                            className="inbox-project-more-btn"
                            onClick={() => setShowProjectDropdown(v => !v)}
                            title={t('inbox.detail.otherProjects')}
                          >
                            {showProjectDropdown ? '×' : '+'} {activeProject ? t('inbox.detail.other') : t('inbox.detail.assignProject')}
                          </button>
                          {showProjectDropdown && (
                            <div className="inbox-project-dropdown" role="menu">
                              {otherProjectCandidates.length > 0 && (
                                <div className="inbox-project-dropdown-section">
                                  <div className="inbox-project-dropdown-heading">{t('inbox.detail.suggestions')}</div>
                                  {otherProjectCandidates.map(p => (
                                    <button
                                      key={p.folderRel}
                                      type="button"
                                      className="inbox-project-dropdown-item"
                                      onClick={() => handlePickProject(p.folderRel)}
                                    >
                                      {p.marker.project || p.folderName}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {projects.some(p => (!activeProject || p.folderRel !== activeProject.folderRel) && !otherProjectCandidates.some(c => c.folderRel === p.folderRel)) && (
                                <div className="inbox-project-dropdown-section">
                                  <div className="inbox-project-dropdown-heading">{t('inbox.detail.allProjects')}</div>
                                  {projects
                                    .filter(p => (!activeProject || p.folderRel !== activeProject.folderRel) && !otherProjectCandidates.some(c => c.folderRel === p.folderRel))
                                    .map(p => (
                                      <button
                                        key={p.folderRel}
                                        type="button"
                                        className="inbox-project-dropdown-item"
                                        onClick={() => handlePickProject(p.folderRel)}
                                      >
                                        {p.marker.project || p.folderName}
                                      </button>
                                    ))}
                                </div>
                              )}
                              {(activeProject || selectedEmail.userProject !== null) && (
                                <div className="inbox-project-dropdown-section">
                                  <button
                                    type="button"
                                    className="inbox-project-dropdown-item is-clear"
                                    onClick={handleClearProject}
                                  >
                                    {t('inbox.detail.noProject')}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {renderBodyBlock(selectedEmail)}

                  {selectedEmail.analysis.summary && (
                    <>
                      <button
                        className="inbox-original-toggle"
                        onClick={() => setShowSummary(!showSummary)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {showSummary ? (
                            <polyline points="18 15 12 9 6 15" />
                          ) : (
                            <polyline points="6 9 12 15 18 9" />
                          )}
                        </svg>
                        {showSummary ? t('inbox.detail.hideSummary') : t('inbox.detail.showSummary')}
                      </button>
                      {showSummary && (
                        <div className="inbox-analysis-section">
                          <h4>{t('inbox.detail.summary')}</h4>
                          <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(
                            selectedEmail.analysis.summary
                              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                              .replace(/\*(.+?)\*/g, '<em>$1</em>')
                          ) }} />
                        </div>
                      )}
                    </>
                  )}

                  {selectedEmail.analysis.categories.length > 0 && (
                    <div className="inbox-analysis-row">
                      <span className="inbox-analysis-label">{t('inbox.detail.categories')}</span>
                      <div className="inbox-categories">
                        {selectedEmail.analysis.categories.map((cat, i) => {
                          const catStr = typeof cat === 'string' ? cat : String(cat)
                          const isCritical = criticalCategories.some(c => catStr.toLowerCase().includes(c))
                          return (
                            <span key={i} className={`inbox-category-tag ${isCritical ? 'inbox-category-critical' : ''}`}>{catStr}</span>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {selectedEmail.analysis.suggestedActions && selectedEmail.analysis.suggestedActions.length > 0 && (
                    <div className="inbox-analysis-section">
                      <h4>{t('inbox.detail.suggestedActions')}</h4>
                      <div className="inbox-actions-list">
                        {selectedEmail.analysis.suggestedActions.map((action, i) => {
                          const isObj = typeof action === 'object' && action !== null
                          const obj = isObj ? action as Record<string, unknown> : null
                          const text = obj ? String(obj.action || obj.beschreibung || '') : String(action)
                          const date = obj ? String(obj.date || obj.datum || '') : ''
                          const time = obj ? String(obj.time || obj.uhrzeit || '') : ''
                          const timeMatch = time.match(/(\d{1,2}:\d{2})/)
                          const status = reminderStatus[i]

                          if (!text || text === '{}') return null

                          return (
                            <div key={i} className="inbox-action-item">
                              <span className="inbox-action-text">{text}</span>
                              <div className="inbox-action-meta">
                                {date && date.match(/^\d{4}-\d{2}-\d{2}$/) && (
                                  <span className="inbox-action-date">
                                    {date}{timeMatch ? ` ${timeMatch[1]}` : ''}
                                  </span>
                                )}
                                {isMac && (
                                  <button
                                    className={`inbox-reminder-btn ${status || ''}`}
                                    onClick={() => handleCreateReminder(action, i)}
                                    disabled={status === 'loading' || status === 'success'}
                                    title={status === 'success' ? t('inbox.detail.reminderCreated') : status === 'error' ? t('inbox.detail.reminderFailed') : 'Apple Reminder'}
                                  >
                                    {status === 'loading' ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinning">
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                      </svg>
                                    ) : status === 'success' ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    ) : status === 'error' ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                      </svg>
                                    ) : (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                      </svg>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {!selectedEmail.analysis && renderBodyBlock(selectedEmail)}

          </div>
        </div>
      </div>
    )
  }

  // List view (default)
  return (
    <div className="inbox-panel">
      {renderHeader()}

      {/* Folder picker (one per account) */}
      {emailSettings.accounts.length > 0 && (
        <FolderPicker
          onFolderChange={() => {
            if (vaultPath) fetchEmails(vaultPath, true)
          }}
        />
      )}

      {/* Filter Bar */}
      <div className="inbox-filter-bar">
        <input
          type="text"
          className="inbox-search"
          placeholder={t('inbox.search')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <label className="inbox-filter-checkbox">
          <input
            type="checkbox"
            checked={activeFilter.onlyRelevant || false}
            onChange={e => setFilter({ onlyRelevant: e.target.checked })}
          />
          <span>{t('inbox.onlyRelevant')}</span>
        </label>
      </div>

      {/* Progress */}
      {isFetching && fetchProgress && (
        <div className="inbox-progress">
          <span>{fetchProgress.status}</span>
          {fetchProgress.total > 0 && (
            <div className="inbox-progress-bar">
              <div style={{ width: `${(fetchProgress.current / fetchProgress.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}
      {isAnalyzing && analysisProgress && (
        <div className="inbox-progress">
          <span>{t('inbox.analyzing')} {analysisProgress.current}/{analysisProgress.total}</span>
          <div className="inbox-progress-bar">
            <div style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }} />
          </div>
        </div>
      )}
      {analysisError && (
        <div
          className="inbox-progress"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '8px',
            background: 'color-mix(in srgb, #e5484d 14%, var(--bg-secondary, transparent))',
            border: '1px solid color-mix(in srgb, #e5484d 35%, transparent)',
            borderRadius: '6px',
            padding: '8px 10px',
          }}
        >
          <span style={{ fontSize: '12px', lineHeight: 1.4, color: 'var(--text-primary)' }}>⚠️ {analysisError}</span>
          <button
            type="button"
            onClick={clearAnalysisError}
            title={t('common.close')}
            style={{
              flexShrink: 0,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '14px',
              lineHeight: 1,
              padding: '2px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Email List */}
      <div className="inbox-panel-content">
        {displayEmails.length === 0 ? (
          <div className="inbox-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <p>{emailSettings.accounts.length === 0 ? t('inbox.empty') : (activeFilter.onlyRelevant ? t('inbox.noRelevant') : t('inbox.empty'))}</p>
            <span>{emailSettings.accounts.length === 0 ? t('inbox.emptyHint') : (activeFilter.onlyRelevant ? t('inbox.noRelevantHint') : '')}</span>
          </div>
        ) : (
          <div className="inbox-list">
            {displayEmails.map(email => (
              <div
                key={email.id}
                className={`inbox-email-item ${!email.flags.includes('\\Seen') ? 'unread' : ''} ${email.sent ? 'sent' : ''}`}
                onClick={() => {
                  setSelectedEmail(email.id)
                  setCurrentView('detail')
                }}
              >
                <div className="inbox-email-avatar">
                  {email.sent ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  ) : (
                    (email.from.name || email.from.address).charAt(0).toUpperCase()
                  )}
                </div>
                <div className="inbox-email-content">
                  <div className="inbox-email-top">
                    <span className="inbox-email-sender">
                      {email.sent ? `An: ${email.to[0]?.name || email.to[0]?.address || ''}` : (email.from.name || email.from.address)}
                    </span>
                    <span className="inbox-email-time">{formatDate(email.date)}</span>
                  </div>
                  <div className="inbox-email-subject">{email.subject}</div>
                  <div className="inbox-email-snippet">{email.snippet}</div>
                </div>
                <div className="inbox-email-indicators">
                  {email.analysis?.needsReply && (
                    <span className={`inbox-reply-badge ${email.analysis.replyUrgency || 'medium'}`} data-tooltip={t('inbox.needsReply')}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 17 4 12 9 7" />
                        <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                      </svg>
                    </span>
                  )}
                  {email.hasAttachments && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <title>{email.attachmentNames?.join(', ') || 'Anhang'}</title>
                      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  )}
                  {email.analysis && (
                    <span
                      className="inbox-sentiment-dot"
                      style={{ background: getSentimentColor(email.analysis.sentiment) }}
                      title={getSentimentLabel(email.analysis.sentiment)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
