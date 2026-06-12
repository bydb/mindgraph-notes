import { create } from 'zustand'
import type { EmailMessage, EmailFilter, EmailFetchResult, EmailFolder, ComposeEmail, EmailSendResult } from '../../shared/types'
import { isSentMail } from '../../shared/emailRelevance'
import { useUIStore } from './uiStore'
import { useNotesStore } from './notesStore'

interface EmailState {
  emails: EmailMessage[]
  lastFetchedAt: Record<string, string>
  isFetching: boolean
  isAnalyzing: boolean
  fetchProgress: { current: number; total: number; status: string } | null
  analysisProgress: { current: number; total: number } | null
  analysisError: string | null
  activeFilter: EmailFilter
  unreadRelevantCount: number
  selectedEmailId: string | null
  // Folders per account (transient, refreshed on panel open)
  folders: Record<string, EmailFolder[]>
  foldersLoading: Record<string, boolean>
  foldersError: Record<string, string>
  // Compose
  composeState: ComposeEmail | null
  isSending: boolean
  // AI Chat
  aiChatMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  aiChatEmailId: string | null
  isAiChatLoading: boolean
  // View
  currentView: 'list' | 'detail' | 'compose' | 'aiChat'

  // Actions
  loadEmails: (vaultPath: string, skipAutoActions?: boolean) => Promise<void>
  saveEmails: (vaultPath: string) => Promise<void>
  fetchEmails: (vaultPath: string, forceRefresh?: boolean) => Promise<EmailFetchResult>
  loadFolders: (accountId: string, force?: boolean) => Promise<void>
  setActiveFolder: (accountId: string, folder: string) => void
  moveEmail: (vaultPath: string, emailId: string, destinationFolder: string) => Promise<{ success: boolean; error?: string }>
  fetchAttachments: (emailId: string) => Promise<{ success: boolean; attachments?: Array<{ filename: string; contentType: string; size: number; contentBase64: string | null; tooLarge: boolean }>; error?: string }>
  analyzeEmails: (vaultPath: string, emailIds?: string[]) => Promise<void>
  reanalyzeEmail: (vaultPath: string, emailId: string) => Promise<void>
  clearAnalysisError: () => void
  setupEmail: (vaultPath: string) => Promise<boolean>
  createNotesForRelevantEmails: (vaultPath: string) => Promise<number>
  getFilteredEmails: () => EmailMessage[]
  setFilter: (filter: Partial<EmailFilter>) => void
  setSelectedEmail: (id: string | null) => void
  updateUnreadRelevantCount: () => void
  markReplyHandled: (vaultPath: string, emailId: string, handled: boolean) => Promise<void>
  markWorkflowRun: (vaultPath: string, emailId: string, workflowId: string, runId: string) => Promise<void>
  setEmailProject: (vaultPath: string, emailId: string, folderRel: string | null) => Promise<void>
  // Compose actions
  setComposeState: (state: ComposeEmail | null) => void
  setCurrentView: (view: 'list' | 'detail' | 'compose' | 'aiChat') => void
  sendEmail: (vaultPath: string) => Promise<EmailSendResult>
  startReply: (email: EmailMessage) => void
  startForward: (email: EmailMessage) => void
  startNewEmail: () => void
  // AI Chat actions
  setAiChatEmail: (emailId: string | null) => void
  addAiChatMessage: (msg: { role: 'user' | 'assistant'; content: string }) => void
  setAiChatLoading: (loading: boolean) => void
}

export const useEmailStore = create<EmailState>()((set, get) => ({
  emails: [],
  lastFetchedAt: {},
  isFetching: false,
  isAnalyzing: false,
  fetchProgress: null,
  analysisProgress: null,
  analysisError: null,
  activeFilter: { onlyRelevant: true },
  unreadRelevantCount: 0,
  selectedEmailId: null,
  folders: {},
  foldersLoading: {},
  foldersError: {},
  composeState: null,
  isSending: false,
  aiChatMessages: [],
  aiChatEmailId: null,
  isAiChatLoading: false,
  currentView: 'list' as const,

  loadEmails: async (vaultPath: string, skipAutoActions?: boolean) => {
    try {
      const data = await window.electronAPI.emailLoad(vaultPath)
      if (data) {
        set({
          emails: data.emails || [],
          lastFetchedAt: data.lastFetchedAt || {}
        })
        get().updateUnreadRelevantCount()

        // Wenn von analyzeEmails aufgerufen: keine Auto-Aktionen (verhindert Loop)
        if (skipAutoActions) return

        // Unanalysierte E-Mails automatisch analysieren (auch ohne IMAP-Fetch)
        const isCurrentlyAnalyzing = get().isAnalyzing
        const { email: emailSettings } = useUIStore.getState()
        // Gesendete Mails nicht auto-analysieren — Relevanz/needsReply ist für eigene Mails sinnlos.
        // isSentMail erkennt auch IMAP-gefetchte Sent-Mails (folder=Gesendet ohne sent-Flag).
        const unanalyzed = (data.emails || []).filter((e: EmailMessage) => !e.analysis && !isSentMail(e))
        if (!isCurrentlyAnalyzing && emailSettings.autoAnalyze && unanalyzed.length > 0) {
          setTimeout(() => get().analyzeEmails(vaultPath), 1000)
        }

        // Notizen nur für analysierte relevante E-Mails erstellen, die noch keine Notiz haben
        const needsNote = (data.emails || []).filter((e: { analysis?: { relevanceScore?: number }; noteCreated?: boolean }) =>
          e.analysis && !e.noteCreated && (e.analysis.relevanceScore || 0) >= emailSettings.relevanceThreshold
        )
        if (needsNote.length > 0) {
          setTimeout(() => get().createNotesForRelevantEmails(vaultPath), 500)
        }
      }
    } catch (error) {
      console.error('[EmailStore] Failed to load emails:', error)
    }
  },

  saveEmails: async (vaultPath: string) => {
    try {
      const { emails, lastFetchedAt } = get()
      await window.electronAPI.emailSave(vaultPath, { emails, lastFetchedAt })
    } catch (error) {
      console.error('[EmailStore] Failed to save emails:', error)
    }
  },

  fetchEmails: async (vaultPath: string, forceRefresh?: boolean) => {
    const { email } = useUIStore.getState()
    if (!email.enabled || email.accounts.length === 0) {
      return { success: false, newCount: 0, totalCount: 0, error: 'Nicht konfiguriert' }
    }

    set({ isFetching: true, fetchProgress: { current: 0, total: 0, status: 'Starte Abruf...' } })

    // Progress-Listener
    window.electronAPI.onEmailFetchProgress((progress) => {
      set({ fetchProgress: progress })
    })

    try {
      // Bei forceRefresh: lastFetchedAt ignorieren → volle 30 Tage
      const fetchSince = forceRefresh ? {} : get().lastFetchedAt
      // Jeder Account fetchet seinen aktiven Folder (Default INBOX).
      const accountsWithFolder = email.accounts.map(a => ({
        ...a,
        folder: email.activeFolders?.[a.id] || 'INBOX'
      }))
      const result = await window.electronAPI.emailFetch(
        vaultPath,
        accountsWithFolder,
        fetchSince,
        email.maxEmailsPerFetch
      )

      if (result.success) {
        // Neu laden nach Fetch (skipAutoActions: fetchEmails steuert Analyse selbst)
        await get().loadEmails(vaultPath, true)

        // Auto-Analyse wenn aktiviert
        if (email.autoAnalyze && (result.newCount > 0 || forceRefresh)) {
          // Verzögert starten damit UI aktualisiert
          setTimeout(() => get().analyzeEmails(vaultPath), 500)
        }
      }

      return result
    } catch (error) {
      console.error('[EmailStore] Fetch failed:', error)
      return { success: false, newCount: 0, totalCount: 0, error: 'Abruf fehlgeschlagen' }
    } finally {
      set({ isFetching: false, fetchProgress: null })
    }
  },

  analyzeEmails: async (vaultPath: string, emailIds?: string[]) => {
    // Guard: Verhindere parallele Analyse-Durchläufe
    if (get().isAnalyzing) return

    const { email, ollama } = useUIStore.getState()
    // Priorität: email.analysisModel (Email-Tab) → Modul-Override (Kompatibilitäts-Sektion) → globales selectedModel.
    const moduleOverride = ollama.moduleModelOverrides?.['task-extraction'] || ''
    const model = email.analysisModel || moduleOverride || ollama.selectedModel
    if (!model) {
      console.warn('[EmailStore] No model configured for analysis')
      return
    }
    const { isHardLocked } = await import('../../shared/modelCompatibility')
    if (isHardLocked(model, 'task-extraction')) {
      console.warn(`[EmailStore] Modell ${model} ist für Mail-Task-Extraktion gesperrt (Hard-Lock). Analyse übersprungen — bitte in den Einstellungen ein anderes Modell wählen.`)
      return
    }

    set({ isAnalyzing: true, analysisProgress: { current: 0, total: 0 }, analysisError: null })

    window.electronAPI.onEmailAnalysisProgress((progress) => {
      set({ analysisProgress: progress })
    })

    try {
      const result = await window.electronAPI.emailAnalyze(vaultPath, model, emailIds, email.lowPowerMode) as
        | { success: boolean; analyzed?: number; failed?: number; total?: number; lastError?: string | null; error?: string }
        | undefined
      // Neu laden nach Analyse (skipAutoActions: verhindert erneuten analyzeEmails-Aufruf)
      await get().loadEmails(vaultPath, true)

      // Stilles Scheitern (OOM, fehlendes Modell, Timeout) sichtbar machen — sonst behält
      // die Mail still ein evtl. gesyncten Fremd-Modell-Datensatz und der Nutzer merkt nichts.
      if (result && result.success === false) {
        set({ analysisError: result.error || `Analyse mit „${model}" fehlgeschlagen.` })
      } else if (result && typeof result.failed === 'number' && result.failed > 0) {
        const total = result.total ?? (result.failed + (result.analyzed || 0))
        const detail = result.lastError ? ` ${result.lastError}` : ''
        set({ analysisError: `${result.failed} von ${total} Mails konnten mit „${model}" nicht analysiert werden.${detail}` })
      }

      // Notizen für relevante Emails erstellen
      const created = await get().createNotesForRelevantEmails(vaultPath)
      if (created > 0) {
        console.log(`[EmailStore] ${created} notes created from relevant emails`)
      }
    } catch (error) {
      console.error('[EmailStore] Analysis failed:', error)
      set({ analysisError: error instanceof Error ? error.message : 'Analyse fehlgeschlagen.' })
    } finally {
      set({ isAnalyzing: false, analysisProgress: null })
    }
  },

  clearAnalysisError: () => set({ analysisError: null }),

  reanalyzeEmail: async (vaultPath: string, emailId: string) => {
    // Forciert eine Neu-Analyse einer einzelnen Mail mit dem aktuellen Modell-State.
    // Der email-analyze-Handler überschreibt analysis bei expliziter emailId, auch wenn schon vorhanden.
    // Vor der Analyse einen evtl. vorhandenen manuellen Projekt-Override löschen, damit
    // das frische Auto-Match (matchEmailToProjects) wieder greift. Wer „Neu analysieren"
    // klickt, will explizit alles neu berechnen lassen — inkl. Projekt-Zuordnung.
    const { emails } = get()
    const hadOverride = emails.some(e => e.id === emailId && e.userProject !== undefined)
    if (hadOverride) {
      set({
        emails: emails.map(e =>
          e.id === emailId ? { ...e, userProject: undefined } : e
        )
      })
      await get().saveEmails(vaultPath)
    }
    await get().analyzeEmails(vaultPath, [emailId])
  },

  setupEmail: async (vaultPath: string) => {
    try {
      const { email: emailSettings } = useUIStore.getState()
      const result = await window.electronAPI.emailSetup(vaultPath, emailSettings.inboxFolderName)
      if (result.success) {
        if (result.instructionPath) {
          // Instruktions-Notiz Pfad in Settings setzen
          const { setEmail } = useUIStore.getState()
          setEmail({ instructionNotePath: result.instructionPath })
        }
        // FileTree aktualisieren (neuer Ordner + Instruktions-Notiz)
        const tree = await window.electronAPI.readDirectory(vaultPath)
        useNotesStore.getState().setFileTree(tree)
      }
      return result.success
    } catch (error) {
      console.error('[EmailStore] Setup failed:', error)
      return false
    }
  },

  createNotesForRelevantEmails: async (vaultPath: string) => {
    const { emails } = get()
    const { email: emailSettings } = useUIStore.getState()
    let created = 0

    // Nur Emails ohne noteCreated-Flag verarbeiten
    const relevantEmails = emails.filter(e =>
      e.analysis &&
      !e.noteCreated &&
      e.analysis.relevanceScore >= emailSettings.relevanceThreshold
    )

    if (relevantEmails.length === 0) return 0

    const updatedEmails = [...emails]

    for (const email of relevantEmails) {
      try {
        const result = await window.electronAPI.emailCreateNote(vaultPath, email, emailSettings.inboxFolderName)
        if (result.success) {
          // noteCreated-Flag setzen (verhindert erneute Notiz-Erstellung)
          const idx = updatedEmails.findIndex(e => e.id === email.id)
          if (idx !== -1) {
            updatedEmails[idx] = { ...updatedEmails[idx], noteCreated: true, notePath: result.path } as typeof updatedEmails[number]
          }
          if (!result.alreadyExists) {
            created++
          }
        }
      } catch (error) {
        console.error('[EmailStore] Failed to create note for email:', email.subject, error)
      }
    }

    // State und Persistenz aktualisieren mit noteCreated-Flags
    set({ emails: updatedEmails })
    await get().saveEmails(vaultPath)

    // FileTree aktualisieren wenn Notizen erstellt wurden
    if (created > 0) {
      try {
        const tree = await window.electronAPI.readDirectory(vaultPath)
        useNotesStore.getState().setFileTree(tree)
      } catch (error) {
        console.error('[EmailStore] Failed to refresh file tree:', error)
      }
    }

    return created
  },

  getFilteredEmails: () => {
    const { emails, activeFilter } = get()
    const { email: emailSettings } = useUIStore.getState()
    const activeFolders = emailSettings.activeFolders || {}

    return emails.filter((email) => {
      // Folder-Scope: nur Mails aus dem aktuell gewählten Folder des jeweiligen Accounts.
      // Legacy-Mails ohne folder-Feld werden 'INBOX' zugeordnet.
      // Gesendete Mails ohne folder-Feld (vor dem Folder-Patch) bleiben sichtbar, sobald
      // ein Sent-Folder aktiv ist — sonst nur in INBOX, damit sie nicht durch alle Folder leaken.
      const expected = activeFolders[email.accountId] || 'INBOX'
      const actual = email.folder || (email.sent ? '__sent_unknown__' : 'INBOX')
      if (actual === '__sent_unknown__') {
        // Heuristik für Legacy-sent ohne folder: nur INBOX zeigen (damit sie nicht überall auftauchen).
        if (expected !== 'INBOX') return false
      } else if (actual !== expected) {
        return false
      }

      // Nur relevante
      if (activeFilter.onlyRelevant) {
        if (!email.analysis?.relevant && (email.analysis?.relevanceScore || 0) < emailSettings.relevanceThreshold) {
          return false
        }
      }

      // Nur ungelesene
      if (activeFilter.onlyUnread && email.flags.includes('\\Seen')) {
        return false
      }

      // Absender-Filter
      if (activeFilter.sender) {
        const q = activeFilter.sender.toLowerCase()
        if (!email.from.name.toLowerCase().includes(q) && !email.from.address.toLowerCase().includes(q)) {
          return false
        }
      }

      // Betreff-Filter
      if (activeFilter.subject && !email.subject.toLowerCase().includes(activeFilter.subject.toLowerCase())) {
        return false
      }

      // Inhalt-Filter
      if (activeFilter.content && !email.bodyText.toLowerCase().includes(activeFilter.content.toLowerCase())) {
        return false
      }

      // Sentiment-Filter
      if (activeFilter.sentiment && email.analysis?.sentiment !== activeFilter.sentiment) {
        return false
      }

      return true
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  },

  setFilter: (filter: Partial<EmailFilter>) => {
    set((state) => ({
      activeFilter: { ...state.activeFilter, ...filter }
    }))
  },

  setSelectedEmail: (id: string | null) => {
    set({ selectedEmailId: id })
  },

  loadFolders: async (accountId: string, force?: boolean) => {
    const state = get()
    if (state.foldersLoading[accountId]) return
    if (!force && state.folders[accountId]?.length) return

    const { email } = useUIStore.getState()
    const account = email.accounts.find(a => a.id === accountId)
    if (!account) return

    set(s => ({
      foldersLoading: { ...s.foldersLoading, [accountId]: true },
      foldersError: { ...s.foldersError, [accountId]: '' }
    }))

    try {
      const result = await window.electronAPI.emailListFolders(account)
      if (result.success) {
        set(s => ({
          folders: { ...s.folders, [accountId]: result.folders },
          foldersLoading: { ...s.foldersLoading, [accountId]: false }
        }))
      } else {
        set(s => ({
          foldersLoading: { ...s.foldersLoading, [accountId]: false },
          foldersError: { ...s.foldersError, [accountId]: result.error || 'Unbekannter Fehler' }
        }))
      }
    } catch (error) {
      console.error('[EmailStore] loadFolders failed:', error)
      set(s => ({
        foldersLoading: { ...s.foldersLoading, [accountId]: false },
        foldersError: { ...s.foldersError, [accountId]: error instanceof Error ? error.message : 'Fehler' }
      }))
    }
  },

  setActiveFolder: (accountId: string, folder: string) => {
    const { setEmail, email } = useUIStore.getState()
    setEmail({
      activeFolders: { ...(email.activeFolders || {}), [accountId]: folder }
    })
    // Auswahl/Detail zurücksetzen, damit Detail-View keine Mail aus altem Folder zeigt.
    set({ selectedEmailId: null, currentView: 'list' })
  },

  moveEmail: async (vaultPath: string, emailId: string, destinationFolder: string) => {
    const { emails } = get()
    const email = emails.find(e => e.id === emailId)
    if (!email) return { success: false, error: 'Mail nicht gefunden' }
    if (!email.uid) return { success: false, error: 'Mail hat keine IMAP-UID' }

    const { email: emailSettings } = useUIStore.getState()
    const account = emailSettings.accounts.find(a => a.id === email.accountId)
    if (!account) return { success: false, error: 'Account nicht gefunden' }

    const sourceFolder = email.folder || 'INBOX'
    if (sourceFolder === destinationFolder) {
      return { success: false, error: 'Quell- und Zielordner identisch' }
    }

    try {
      const result = await window.electronAPI.emailMove({
        accountId: account.id,
        host: account.host,
        port: account.port,
        user: account.user,
        tls: account.tls,
        sourceFolder,
        uid: email.uid,
        destinationFolder
      })
      if (!result.success) return { success: false, error: result.error }

      // Lokal: folder + uid aktualisieren, Selektion zurücksetzen wenn nötig.
      const next = emails.map(e => e.id === emailId
        ? { ...e, folder: destinationFolder, uid: result.newUid ?? e.uid }
        : e
      )
      const newState: Partial<EmailState> = { emails: next }
      // Wenn die verschobene Mail gerade selektiert war und der Zielordner nicht aktiv ist:
      // Selektion droppen + zurück zur Liste.
      const activeFolders = useUIStore.getState().email.activeFolders || {}
      const currentActive = activeFolders[account.id] || 'INBOX'
      if (get().selectedEmailId === emailId && currentActive !== destinationFolder) {
        newState.selectedEmailId = null
        newState.currentView = 'list'
      }
      set(newState as EmailState)
      await get().saveEmails(vaultPath)
      return { success: true }
    } catch (error) {
      console.error('[EmailStore] moveEmail failed:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Move fehlgeschlagen' }
    }
  },

  fetchAttachments: async (emailId: string) => {
    const { emails } = get()
    const email = emails.find(e => e.id === emailId)
    if (!email) return { success: false, error: 'Mail nicht gefunden' }
    if (!email.uid) return { success: false, error: 'Mail hat keine IMAP-UID' }

    const { email: emailSettings } = useUIStore.getState()
    const account = emailSettings.accounts.find(a => a.id === email.accountId)
    if (!account) return { success: false, error: 'Account nicht gefunden' }

    try {
      return await window.electronAPI.emailFetchAttachments({
        accountId: account.id,
        host: account.host,
        port: account.port,
        user: account.user,
        tls: account.tls,
        folder: email.folder || 'INBOX',
        uid: email.uid
      })
    } catch (error) {
      console.error('[EmailStore] fetchAttachments failed:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Anhänge konnten nicht geladen werden' }
    }
  },

  updateUnreadRelevantCount: () => {
    const { emails } = get()
    const { email: emailSettings } = useUIStore.getState()

    const count = emails.filter((e) =>
      !e.flags.includes('\\Seen') &&
      e.analysis &&
      e.analysis.relevanceScore >= emailSettings.relevanceThreshold
    ).length

    set({ unreadRelevantCount: count })
  },

  markReplyHandled: async (vaultPath: string, emailId: string, handled: boolean) => {
    const { emails } = get()
    const next = emails.map(e => {
      if (e.id !== emailId || !e.analysis) return e
      return {
        ...e,
        analysis: {
          ...e.analysis,
          replyHandled: handled,
          replyHandledAt: handled ? new Date().toISOString() : undefined
        }
      }
    })
    set({ emails: next })
    await get().saveEmails(vaultPath)
  },

  // Exactly-once-Marker für Workflow-Auslösung (Decision #5).
  markWorkflowRun: async (vaultPath: string, emailId: string, workflowId: string, runId: string) => {
    const { emails } = get()
    const next = emails.map(e => {
      if (e.id !== emailId || !e.analysis) return e
      return {
        ...e,
        analysis: {
          ...e.analysis,
          workflowRuns: { ...(e.analysis.workflowRuns || {}), [workflowId]: runId }
        }
      }
    })
    set({ emails: next })
    await get().saveEmails(vaultPath)
  },

  setEmailProject: async (vaultPath: string, emailId: string, folderRel: string | null) => {
    const { emails } = get()
    const next = emails.map(e => e.id === emailId ? { ...e, userProject: folderRel } : e)
    set({ emails: next })
    await get().saveEmails(vaultPath)
  },

  // Compose actions
  setComposeState: (state) => set({ composeState: state }),

  setCurrentView: (view) => set({ currentView: view }),

  sendEmail: async (vaultPath: string) => {
    const { composeState, emails } = get()
    if (!composeState) return { success: false, error: 'Kein Entwurf' }

    const { email: emailSettings } = useUIStore.getState()
    const account = emailSettings.accounts.find(a => a.id === composeState.accountId)
    if (!account) return { success: false, error: 'Account nicht gefunden' }

    set({ isSending: true })
    try {
      const result = await window.electronAPI.emailSend({
        ...composeState,
        attachments: composeState.attachments || [],
        account: {
          id: account.id,
          smtpHost: account.smtpHost,
          smtpPort: account.smtpPort,
          smtpTls: account.smtpTls,
          imapHost: account.host,
          imapPort: account.port,
          imapTls: account.tls,
          user: account.user,
          name: account.name,
          fromAddress: account.fromAddress
        },
        signatureImagePath: emailSettings.signatureImagePath || undefined
      })
      if (result.success) {
        // Gesendete Email tracken. folder = wo die Mail per IMAP-Append abgelegt wurde
        // (Sent/Gesendet). Damit erscheint sie nur im Sent-Folder, nicht in jedem.
        const sentEmail: EmailMessage = {
          id: result.messageId || `sent-${Date.now()}`,
          uid: 0,
          accountId: composeState.accountId,
          folder: result.sentMailbox || 'Sent',
          from: { name: '', address: account.user },
          to: composeState.to,
          subject: composeState.subject,
          date: new Date().toISOString(),
          snippet: composeState.body.substring(0, 200),
          bodyText: composeState.body,
          flags: ['\\Seen'],
          fetchedAt: new Date().toISOString(),
          sent: true
        }
        set({ emails: [...emails, sentEmail], composeState: null, currentView: 'list' })
        await get().saveEmails(vaultPath)
      }
      return result
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Senden fehlgeschlagen' }
    } finally {
      set({ isSending: false })
    }
  },

  startReply: (email: EmailMessage) => {
    const { email: emailSettings } = useUIStore.getState()
    const account = emailSettings.accounts[0]
    const sig = emailSettings.signature ? `\n\n--\n${emailSettings.signature}` : ''

    // Original-Email zitieren
    const date = email.date ? new Date(email.date).toLocaleString() : ''
    const sender = email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address
    const quotedHeader = `\n\nAm ${date} schrieb ${sender}:\n`
    const originalText = (email.bodyText || email.snippet || '').trim()
    const quotedBody = originalText.split('\n').map(line => `> ${line}`).join('\n')

    set({
      composeState: {
        to: [{ name: email.from.name, address: email.from.address }],
        subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        body: sig + quotedHeader + quotedBody,
        inReplyTo: email.id,
        references: email.id,
        accountId: account?.id || ''
      },
      currentView: 'compose'
    })
  },

  startForward: (email: EmailMessage) => {
    const { email: emailSettings } = useUIStore.getState()
    const account = emailSettings.accounts[0]
    const sig = emailSettings.signature ? `\n\n--\n${emailSettings.signature}` : ''

    const date = email.date ? new Date(email.date).toLocaleString() : ''
    const sender = email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address
    const toLine = (email.to || []).map(r => r.name ? `${r.name} <${r.address}>` : r.address).join(', ')
    const attachLine = email.attachmentNames && email.attachmentNames.length > 0
      ? `\nAnhänge: ${email.attachmentNames.join(', ')}`
      : ''
    const header = `\n\n---------- Weitergeleitete Nachricht ----------\nVon: ${sender}\nDatum: ${date}\nBetreff: ${email.subject}\nAn: ${toLine}${attachLine}\n\n`
    const originalText = (email.bodyText || email.snippet || '').trim()
    const subject = /^fwd?:\s/i.test(email.subject) ? email.subject : `Fwd: ${email.subject}`

    set({
      composeState: {
        to: [],
        subject,
        body: sig + header + originalText,
        accountId: account?.id || ''
      },
      currentView: 'compose'
    })
  },

  startNewEmail: () => {
    const { email: emailSettings } = useUIStore.getState()
    const account = emailSettings.accounts[0]
    const sig = emailSettings.signature ? `\n\n--\n${emailSettings.signature}` : ''
    set({
      composeState: {
        to: [],
        subject: '',
        body: sig,
        accountId: account?.id || ''
      },
      currentView: 'compose'
    })
  },

  // AI Chat actions
  setAiChatEmail: (emailId) => set({ aiChatEmailId: emailId, aiChatMessages: [], currentView: 'aiChat' }),

  addAiChatMessage: (msg) => set((state) => ({
    aiChatMessages: [...state.aiChatMessages, msg]
  })),

  setAiChatLoading: (loading) => set({ isAiChatLoading: loading })
}))
