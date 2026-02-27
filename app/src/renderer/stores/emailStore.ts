import { create } from 'zustand'
import type { EmailMessage, EmailFilter, EmailFetchResult } from '../../shared/types'
import { useUIStore } from './uiStore'
import { useNotesStore } from './notesStore'

interface EmailState {
  emails: EmailMessage[]
  lastFetchedAt: Record<string, string>
  isFetching: boolean
  isAnalyzing: boolean
  fetchProgress: { current: number; total: number; status: string } | null
  analysisProgress: { current: number; total: number } | null
  activeFilter: EmailFilter
  unreadRelevantCount: number
  selectedEmailId: string | null

  // Actions
  loadEmails: (vaultPath: string, skipAutoActions?: boolean) => Promise<void>
  saveEmails: (vaultPath: string) => Promise<void>
  fetchEmails: (vaultPath: string, forceRefresh?: boolean) => Promise<EmailFetchResult>
  analyzeEmails: (vaultPath: string, emailIds?: string[]) => Promise<void>
  setupEmail: (vaultPath: string) => Promise<boolean>
  createNotesForRelevantEmails: (vaultPath: string) => Promise<number>
  getFilteredEmails: () => EmailMessage[]
  setFilter: (filter: Partial<EmailFilter>) => void
  setSelectedEmail: (id: string | null) => void
  updateUnreadRelevantCount: () => void
}

export const useEmailStore = create<EmailState>()((set, get) => ({
  emails: [],
  lastFetchedAt: {},
  isFetching: false,
  isAnalyzing: false,
  fetchProgress: null,
  analysisProgress: null,
  activeFilter: { onlyRelevant: true },
  unreadRelevantCount: 0,
  selectedEmailId: null,

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
        const unanalyzed = (data.emails || []).filter((e: { analysis?: unknown }) => !e.analysis)
        if (!isCurrentlyAnalyzing && emailSettings.autoAnalyze && unanalyzed.length > 0) {
          setTimeout(() => get().analyzeEmails(vaultPath), 1000)
        }

        // Notizen für bereits analysierte relevante E-Mails erstellen (falls noch keine existieren)
        const analyzed = (data.emails || []).filter((e: { analysis?: { relevanceScore?: number } }) =>
          e.analysis && (e.analysis.relevanceScore || 0) >= emailSettings.relevanceThreshold
        )
        if (analyzed.length > 0) {
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
      const result = await window.electronAPI.emailFetch(
        vaultPath,
        email.accounts,
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
    const model = email.analysisModel || ollama.selectedModel
    if (!model) {
      console.warn('[EmailStore] No model configured for analysis')
      return
    }

    set({ isAnalyzing: true, analysisProgress: { current: 0, total: 0 } })

    window.electronAPI.onEmailAnalysisProgress((progress) => {
      set({ analysisProgress: progress })
    })

    try {
      await window.electronAPI.emailAnalyze(vaultPath, model, emailIds)
      // Neu laden nach Analyse (skipAutoActions: verhindert erneuten analyzeEmails-Aufruf)
      await get().loadEmails(vaultPath, true)

      // Notizen für relevante Emails erstellen
      const created = await get().createNotesForRelevantEmails(vaultPath)
      if (created > 0) {
        console.log(`[EmailStore] ${created} notes created from relevant emails`)
      }
    } catch (error) {
      console.error('[EmailStore] Analysis failed:', error)
    } finally {
      set({ isAnalyzing: false, analysisProgress: null })
    }
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

    const relevantEmails = emails.filter(e =>
      e.analysis &&
      e.analysis.relevanceScore >= emailSettings.relevanceThreshold
    )

    for (const email of relevantEmails) {
      try {
        const result = await window.electronAPI.emailCreateNote(vaultPath, email, emailSettings.inboxFolderName)
        if (result.success && !result.alreadyExists) {
          created++
        }
      } catch (error) {
        console.error('[EmailStore] Failed to create note for email:', email.subject, error)
      }
    }

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

    return emails.filter((email) => {
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

  updateUnreadRelevantCount: () => {
    const { emails } = get()
    const { email: emailSettings } = useUIStore.getState()

    const count = emails.filter((e) =>
      !e.flags.includes('\\Seen') &&
      e.analysis &&
      e.analysis.relevanceScore >= emailSettings.relevanceThreshold
    ).length

    set({ unreadRelevantCount: count })
  }
}))
