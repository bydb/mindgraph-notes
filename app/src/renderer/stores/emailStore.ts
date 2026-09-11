import { create } from 'zustand'
import type { EmailMessage, EmailFilter, EmailFetchResult, EmailFolder, ComposeEmail, EmailSendResult, ComposeAttachment } from '../../shared/types'
import { isSentMail } from '../../shared/emailRelevance'
import { collectOwnAddresses, collectReplyAllRecipients, resolveReplyAccountId, resolveReplyTarget } from '../../shared/emailReply'
import { emailMatchesQuery } from '../../shared/emailSearch'
import { loadDrafts, saveDraft, removeDraft, draftHasContent, newDraftId, type EmailDraft } from '../utils/emailDrafts'
import { useUIStore } from './uiStore'
import { useNotesStore } from './notesStore'
import { createActiveMeasurement } from '../utils/activeTimeTracker'

interface EmailState {
  emails: EmailMessage[]
  lastFetchedAt: Record<string, string>
  isFetching: boolean
  isAnalyzing: boolean
  fetchProgress: { current: number; total: number; status: string } | null
  analysisProgress: { current: number; total: number } | null
  analysisError: string | null
  // Unbekannte Mails, die beim letzten Abruf wegen `maxEmailsPerFetch` liegen
  // blieben. Sichtbar machen statt still lassen — genau daran fehlten Mails.
  pendingBacklog: number
  /** Revision, auf der der Stand im Speicher aufbaut (Inhalts-Hash der Datei).
   *  Wird bei jedem Speichern als Basis mitgeschickt. `null` = noch nie geladen. */
  storeRevision: string | null
  /** Gesetzt, wenn ein Speichern abgelehnt wurde. Ein fremder Stand allein löst
   *  das nicht mehr aus — der wird eingearbeitet. Übrig bleibt die beschädigte
   *  Datei. Der Stand im Speicher bleibt erhalten; er darf NICHT still
   *  verworfen werden, sonst ist genau das weg, was der Nutzer gerade getan hat. */
  storeConflict: { detectedAt: string; rejectedWrites: number; message: string } | null
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
  /** Ergebnis des letzten Versands — lebt AUSSERHALB des Compose-Fensters.
   *  Das Fenster wird nach Erfolg sofort abgebaut; eine Warnung („gesendet,
   *  aber nicht unter Gesendet abgelegt") hatte dort nie einen sichtbaren Ort. */
  lastSendResult: { at: string; subject: string; appendWarning?: string } | null
  /** Konten, deren letzter Abruf fehlschlug (Passwort fehlt, Anmeldung
   *  abgelehnt, Zeitüberschreitung). Leer nach einem Abruf ohne Kontofehler. */
  lastFetchErrors: Array<{ accountId: string; folder: string; error: string }>
  /** Zeitpunkt des letzten erfolgreichen Abrufs je Konto (nur diese Sitzung). */
  lastSuccessfulFetchAt: Record<string, string>
  /** Gesicherte Entwürfe (localStorage pro Vault, siehe utils/emailDrafts.ts). */
  drafts: EmailDraft[]
  /** Letzter Fehler beim Sichern eines Entwurfs (Speicher voll/gesperrt).
   *  Wird angezeigt, statt eine Sicherung zu behaupten, die es nicht gibt. */
  draftSaveError: string | null
  // AI Chat
  aiChatMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  aiChatEmailId: string | null
  isAiChatLoading: boolean
  // View
  currentView: 'list' | 'detail' | 'compose' | 'aiChat'

  // Actions
  loadEmails: (vaultPath: string, skipAutoActions?: boolean) => Promise<void>
  saveEmails: (vaultPath: string) => Promise<void>
  /** Konflikt auflösen: den Stand von der Platte übernehmen und die eigenen,
   *  nicht gespeicherten Änderungen aufgeben. Nur auf ausdrücklichen Wunsch —
   *  deshalb gibt es dafür einen Knopf und keinen Automatismus. */
  reloadAfterStoreConflict: (vaultPath: string) => Promise<void>
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
  clearLastSendResult: () => void
  clearFetchErrors: () => void
  /** `bodyOverride`: fertiger Antworttext (z.B. aus dem KI-Chat) statt Zitat
   *  des Originals — Konto, Empfänger, Reply-To und Thread-Header laufen über
   *  denselben Weg wie eine normale Antwort. */
  startReply: (email: EmailMessage, bodyOverride?: string) => void
  startReplyAll: (email: EmailMessage) => void
  startForward: (email: EmailMessage) => void
  startNewEmail: () => void
  /** Compose schließen: angefasster Entwurf bleibt gesichert, unangefasster
   *  wird still verworfen. Kein Textverlust mehr durch X oder „Zurück". */
  closeCompose: () => void
  /** Entwurf ausdrücklich verwerfen (aus dem Compose-Fenster oder der Liste). */
  discardDraft: (draftId: string) => Promise<void>
  openDraft: (draftId: string) => void
  /** Gelesen/Ungelesen — lokal sofort, auf dem Server wenn die Mail eine UID hat.
   *  Schlägt der Server fehl, wird lokal zurückgenommen (kein Stand, der nur
   *  hier gilt und beim nächsten Abgleich wieder kippt). */
  setSeen: (vaultPath: string, emailId: string, seen: boolean) => Promise<{ success: boolean; error?: string }>
  /** Suche über ALLE Mails (alle Ordner, ohne Relevanz-/Ungelesen-Filter):
   *  Absender, Empfänger, Betreff, Text. */
  searchEmails: (query: string) => EmailMessage[]
  /** Lokale Kopien entfernen (Grabstein im Main-Prozess). Für Mails, die auf
   *  dem Server nicht mehr existieren oder nie dort lagen. Kein Server-Zugriff. */
  removeLocalEmails: (vaultPath: string, ids: string[]) => Promise<{ success: boolean; removed: number; error?: string }>
  // AI Chat actions
  setAiChatEmail: (emailId: string | null) => void
  addAiChatMessage: (msg: { role: 'user' | 'assistant'; content: string }) => void
  setAiChatLoading: (loading: boolean) => void
}

/** Gemeinsame Reply-Basis (Zitat, Betreff, Signatur, Thread-Header) für Antworten/Allen antworten. */
function buildReplyDraft(email: EmailMessage, bodyOverride?: string): Omit<ComposeEmail, 'to' | 'cc'> {
  const { email: emailSettings } = useUIStore.getState()
  const accountId = resolveReplyAccountId(email, emailSettings.accounts)
  const sig = emailSettings.signature ? `\n\n--\n${emailSettings.signature}` : ''
  const { redirect } = resolveReplyTarget(email)

  // Original-Email zitieren
  const date = email.date ? new Date(email.date).toLocaleString() : ''
  const sender = email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address
  const quotedHeader = `\n\nAm ${date} schrieb ${sender}:\n`
  const originalText = (email.bodyText || email.snippet || '').trim()
  const quotedBody = originalText.split('\n').map(line => `> ${line}`).join('\n')

  return {
    subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
    body: bodyOverride !== undefined ? bodyOverride + sig : sig + quotedHeader + quotedBody,
    inReplyTo: email.id,
    references: email.id,
    accountId,
    replyRedirect: redirect
  }
}

// Vault, unter dem Entwürfe abgelegt werden — gesetzt beim Laden der Mailliste.
let draftVaultPath = ''
// Die ausstehende Sicherung trägt ihren Vault SELBST. Vorher las der Timer das
// globale draftVaultPath — ein Vault-Wechsel innerhalb der 400 ms schrieb den
// Entwurf aus Vault A unter Vault B.
let pendingDraftSave: { vault: string; draftId: string; timer: ReturnType<typeof setTimeout> } | null = null

/** Sicherung sofort schreiben (Vault-Wechsel, Schließen, Senden). */
function flushPendingDraftSave(): void {
  if (!pendingDraftSave) return
  const { vault, draftId, timer } = pendingDraftSave
  clearTimeout(timer)
  pendingDraftSave = null
  const current = useEmailStore.getState().composeState
  if (!current || current.draftId !== draftId || !draftHasContent(current)) return
  applyDraftWrite(vault, saveDraft(window.localStorage, vault, current))
}

function applyDraftWrite(vault: string, res: ReturnType<typeof saveDraft>): void {
  const patch: Partial<EmailState> = { draftSaveError: res.ok ? null : (res.error || 'Entwurf konnte nicht gesichert werden') }
  if (vault === draftVaultPath) patch.drafts = res.drafts
  useEmailStore.setState(patch)
}

function persistDraftSoon(compose: ComposeEmail): void {
  const vault = draftVaultPath
  if (!vault || !compose.draftId || !draftHasContent(compose)) return
  if (pendingDraftSave) clearTimeout(pendingDraftSave.timer)
  const draftId = compose.draftId
  pendingDraftSave = {
    vault,
    draftId,
    timer: setTimeout(() => {
      pendingDraftSave = null
      const current = useEmailStore.getState().composeState
      if (!current || current.draftId !== draftId) return
      applyDraftWrite(vault, saveDraft(window.localStorage, vault, current))
    }, 400)
  }
}

/** Entwurf anhängen/aktualisieren — im offenen Fenster ODER in der Ablage des
 *  Vaults, falls das Fenster inzwischen geschlossen wurde. Liefert false, wenn
 *  der Entwurf nirgends mehr existiert (verworfen oder unangefasst geschlossen). */
function updateDraftAnywhere(vault: string, draftId: string, mutate: (c: ComposeEmail) => ComposeEmail): boolean {
  const state = useEmailStore.getState()
  const open = state.composeState
  if (open && open.draftId === draftId && vault === draftVaultPath) {
    const next = mutate(open)
    useEmailStore.setState({ composeState: next })
    if (draftHasContent(next)) persistDraftSoon(next)
    return true
  }
  const stored = loadDrafts(window.localStorage, vault).find(d => d.id === draftId)
  if (!stored) return false
  applyDraftWrite(vault, saveDraft(window.localStorage, vault, mutate(stored.compose)))
  return true
}

/** Originalanhänge einer Weiterleitung vom Server holen und an den Entwurf
 *  hängen. Läuft auch weiter, wenn das Fenster zwischendurch geschlossen wird:
 *  dann landet das Ergebnis im gesicherten Entwurf. Wird beim Wiederöffnen
 *  eines Entwurfs mit Status „loading" erneut angestoßen. */
function runForwardStaging(vault: string, draftId: string, email: EmailMessage): void {
  const { email: emailSettings } = useUIStore.getState()
  const account = emailSettings.accounts.find(a => a.id === email.accountId)
  const finish = (fa: NonNullable<ComposeEmail['forwardAttachments']>, attachments?: ComposeAttachment[]) => {
    const kept = updateDraftAnywhere(vault, draftId, c => ({
      ...c,
      forwardAttachments: { ...fa, sourceEmailId: email.id },
      attachments: attachments && attachments.length > 0 ? [...(c.attachments || []), ...attachments] : c.attachments
    }))
    // Entwurf existiert nicht mehr (verworfen): geladene Dateien wieder wegräumen.
    if (!kept && attachments && attachments.length > 0) {
      void window.electronAPI.emailDiscardStagedAttachments(attachments.map(a => a.path))
    }
  }
  if (!account) { finish({ status: 'failed', error: 'Account nicht gefunden', skipped: email.attachmentNames }); return }
  if (!email.uid) { finish({ status: 'failed', error: 'Mail hat keine IMAP-UID', skipped: email.attachmentNames }); return }
  void window.electronAPI.emailStageForwardAttachments({
    accountId: account.id,
    host: account.host,
    port: account.port,
    user: account.user,
    tls: account.tls,
    folder: email.folder || 'INBOX',
    uid: email.uid
  }).then(res => {
    if (!res.success) { finish({ status: 'failed', error: res.error, skipped: email.attachmentNames }); return }
    finish({ status: 'done', names: (res.attachments || []).map(a => a.filename), skipped: res.skipped }, res.attachments)
  }).catch(err => {
    finish({ status: 'failed', error: err instanceof Error ? err.message : String(err), skipped: email.attachmentNames })
  })
}

/** Pfade zwischengespeicherter Weiterleitungs-Anhänge (unter userData) aufräumen. */
async function discardStagedAttachments(compose: ComposeEmail | null | undefined): Promise<void> {
  const paths = (compose?.attachments || []).map(a => a.path).filter(p => p.includes('forward-attachments'))
  if (paths.length === 0) return
  try { await window.electronAPI.emailDiscardStagedAttachments(paths) } catch { /* Aufräumen ist Kür */ }
}

export const useEmailStore = create<EmailState>()((set, get) => ({
  emails: [],
  lastFetchedAt: {},
  isFetching: false,
  isAnalyzing: false,
  fetchProgress: null,
  analysisProgress: null,
  analysisError: null,
  pendingBacklog: 0,
  storeRevision: null,
  storeConflict: null,
  activeFilter: { onlyRelevant: true },
  unreadRelevantCount: 0,
  selectedEmailId: null,
  folders: {},
  foldersLoading: {},
  foldersError: {},
  composeState: null,
  isSending: false,
  lastSendResult: null,
  lastFetchErrors: [],
  lastSuccessfulFetchAt: {},
  drafts: [],
  draftSaveError: null,
  aiChatMessages: [],
  aiChatEmailId: null,
  isAiChatLoading: false,
  currentView: 'list' as const,

  loadEmails: async (vaultPath: string, skipAutoActions?: boolean) => {
    if (draftVaultPath !== vaultPath) {
      // Vault-Wechsel: erst den alten Vault abschließen — ausstehende Sicherung
      // schreiben und ein offenes Compose-Fenster dort ablegen (oder, wenn
      // unangefasst, verwerfen). Sonst wandert der Entwurf in den neuen Vault.
      if (draftVaultPath) {
        flushPendingDraftSave()
        const open = get().composeState
        if (open?.draftId) {
          if (draftHasContent(open)) saveDraft(window.localStorage, draftVaultPath, open)
          else { removeDraft(window.localStorage, draftVaultPath, open.draftId); void discardStagedAttachments(open) }
        }
        if (open) set({ composeState: null, currentView: 'list' })
      }
      draftVaultPath = vaultPath
      set({ drafts: loadDrafts(window.localStorage, vaultPath), draftSaveError: null })
    }
    try {
      const data = await window.electronAPI.emailLoad(vaultPath)

      if (data?.damaged) {
        // Beschädigte Datei: Der Stand im Speicher bleibt, wie er ist, und der
        // Hinweis geht hoch. Ohne ihn stünde der Nutzer vor einer leeren Inbox
        // ohne jede Erklärung — das schlechteste aller Verhalten.
        set({
          storeConflict: {
            detectedAt: new Date().toISOString(),
            rejectedWrites: get().storeConflict?.rejectedWrites ?? 0,
            message: data.damaged
          }
        })
        return
      }

      if (data) {
        // Steht ein Schreibkonflikt offen, darf NICHT nachgeladen werden: Der
        // Stand im Speicher enthält Änderungen, die noch nirgends gespeichert
        // sind, und ein Reload würde sie wortlos verschlucken. Genau dieses
        // stille Verwerfen ist der Fehler, den diese Absicherung verhindern soll.
        // Auflösen geht nur über `reloadAfterStoreConflict` — also auf Knopfdruck.
        if (get().storeConflict) {
          console.warn('[EmailStore] Nachladen übersprungen — es liegt ein ungelöster Schreibkonflikt vor.')
          return
        }
        set({
          emails: data.emails || [],
          lastFetchedAt: data.lastFetchedAt || {},
          storeRevision: data.revision ?? null,
          // Frisch geladen heißt: Der Stand im Speicher ist wieder deckungsgleich
          // mit der Platte — ein früherer Konflikt ist damit erledigt.
          storeConflict: null
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
      const { emails, lastFetchedAt, storeRevision, storeConflict } = get()
      const result = await window.electronAPI.emailSave(vaultPath, { emails, lastFetchedAt }, storeRevision)

      if (result?.success) {
        set({ storeRevision: result.revision ?? null, storeConflict: null })
        // Es lag ein fremder Stand vor und wurde eingearbeitet — nachladen,
        // sonst fehlen die eingearbeiteten Mails in der Anzeige, obwohl sie in
        // der Datei stehen. Verlustfrei: Der eigene Stand ist Teil der
        // Vereinigung, die gerade geschrieben wurde.
        if (result.merged) {
          await get().loadEmails(vaultPath, true)
        }
        return
      }

      if (result?.conflict) {
        // Übrig bleibt nur der nicht vereinbare Fall: Die Datei auf der Platte
        // ist beschädigt. Weder überschreiben (die Datei ist vielleicht noch zu
        // retten) noch stillschweigend weitermachen — der Stand im Speicher
        // bleibt, und der Nutzer erfährt davon.
        set({
          storeConflict: {
            detectedAt: new Date().toISOString(),
            rejectedWrites: (storeConflict?.rejectedWrites ?? 0) + 1,
            message: result.error || 'Die Mailliste wurde von anderer Stelle geändert.'
          }
        })
        console.warn('[EmailStore] Speichern abgelehnt — Mailliste wurde von anderer Stelle geändert.')
        return
      }

      console.error('[EmailStore] Failed to save emails:', result?.error)
    } catch (error) {
      console.error('[EmailStore] Failed to save emails:', error)
    }
  },

  reloadAfterStoreConflict: async (vaultPath: string) => {
    set({ storeConflict: null })
    await get().loadEmails(vaultPath, true)
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
      // Manuell (forceRefresh) = ganzes Aufbewahrungsfenster: Abgleich bekannter
      // Mails (Flags/Ordner/verschwunden) und ältere unbekannte Mails im Rahmen
      // des Kontingents. Automatik = ab dem Abruf-Merker. Der Merker geht immer
      // mit — vorher wurde `{}` übergeben und Main las das als Ersteinrichtung
      // mit drei Tagen Fenster.
      const mode = forceRefresh ? 'full' : 'incremental'
      // Jeder Account fetchet seinen aktiven Folder (Default INBOX).
      const accountsWithFolder = email.accounts.map(a => ({
        ...a,
        folder: email.activeFolders?.[a.id] || 'INBOX'
      }))
      const result = await window.electronAPI.emailFetch(
        vaultPath,
        accountsWithFolder,
        get().lastFetchedAt,
        email.maxEmailsPerFetch,
        mode
      )

      // Teilfehler sichtbar machen — unabhängig davon, ob der Gesamtabruf
      // als Erfolg gilt. Ein Konto mit abgelaufenem Passwort darf nicht hinter
      // „0 neu" verschwinden.
      const perAccount = result.accountResults || []
      const nowIso = new Date().toISOString()
      const successes: Record<string, string> = { ...get().lastSuccessfulFetchAt }
      for (const r of perAccount) if (r.ok) successes[r.accountId] = nowIso
      const errors = perAccount
        .filter(r => !r.ok)
        .map(r => ({ accountId: r.accountId, folder: r.folder, error: r.error || 'Abruf fehlgeschlagen' }))
      if (!result.success && result.error && errors.length === 0) {
        errors.push({ accountId: '', folder: '', error: result.error })
      }
      set({ lastFetchErrors: errors, lastSuccessfulFetchAt: successes })

      if (result.success) {
        set({ pendingBacklog: result.skippedCount || 0 })
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
      set({ lastFetchErrors: [{ accountId: '', folder: '', error: 'Abruf fehlgeschlagen' }] })
      return { success: false, newCount: 0, totalCount: 0, error: 'Abruf fehlgeschlagen' }
    } finally {
      set({ isFetching: false, fetchProgress: null })
    }
  },

  analyzeEmails: async (vaultPath: string, emailIds?: string[]) => {
    // Guard: Verhindere parallele Analyse-Durchläufe
    if (get().isAnalyzing) return

    const { email, ollama } = useUIStore.getState()
    const { cloudProviderForSentinel, isCloudProviderReady, CLOUD_PROVIDER_META } = await import('../../shared/llmBackend')

    // Das Analyse-Modell wird an EINER Stelle gewählt (Email-Tab → Analyse-Modell):
    // entweder ein lokales Ollama-Modell ODER ein Cloud-Sentinel („OpenRouter"/„LLMBase").
    // DIESER Wert ist allein autoritativ fürs Routing — kein zweites `cloudModules`-Gate
    // mehr (das lief mit analysisModel auseinander → Rückfall aufs alte Modell). Das
    // ⚠️-Opt-in passiert einmalig beim Auswählen im Picker (Settings). isCloudProviderReady
    // = gemeinsame Basis-Verfügbarkeitsprüfung (enabled + Key + Modell), wie Feature-Gates.
    const analysisChoice = email.analysisModel
    const sentinelProvider = cloudProviderForSentinel(analysisChoice)
    const providerSettings = sentinelProvider ? ollama[sentinelProvider] : undefined
    const useCloud = !!sentinelProvider && isCloudProviderReady(providerSettings)

    // Lokales Modell (Sentinel zählt NICHT als lokaler Name): Tab-Wahl → Modul-Override → global.
    const moduleOverride = ollama.moduleModelOverrides?.['task-extraction'] || ''
    const localChoice = analysisChoice && !sentinelProvider ? analysisChoice : ''
    const model = localChoice || moduleOverride || ollama.selectedModel

    const cloud = useCloud && sentinelProvider && providerSettings
      ? {
          model: providerSettings.moduleModelOverrides?.['task-extraction']?.trim() || providerSettings.model.trim(),
          provider: sentinelProvider
        }
      : null
    // Modellname für Fehler-/Status-Texte: bei Cloud das echte Provider-Modell.
    const displayModel = cloud ? `${cloud.provider}/${cloud.model}` : model

    // Lokales Modell ist nur Pflicht, wenn NICHT in die Cloud geroutet wird.
    if (!useCloud) {
      if (!model) {
        // Häufig: User stand auf einem Cloud-Sentinel, hat den Provider aber deaktiviert
        // → Sentinel ohne lokales Fallback-Modell. Nicht still scheitern — sichtbarer Hinweis.
        const msg = sentinelProvider
          ? `${CLOUD_PROVIDER_META[sentinelProvider].label} ist deaktiviert, aber als Analyse-Modell gewählt. Bitte im Email-Tab ein lokales Modell oder wieder einen Cloud-Provider wählen.`
          : 'Kein Analyse-Modell konfiguriert. Bitte in den Einstellungen ein Modell wählen.'
        console.warn(`[EmailStore] ${msg}`)
        set({ analysisError: msg })
        return
      }
      const { isHardLocked } = await import('../../shared/modelCompatibility')
      if (isHardLocked(model, 'task-extraction')) {
        const msg = `Modell „${model}" ist für die Mail-Analyse gesperrt (Prompt-Injection-Schutz). Bitte ein geeignetes Modell wählen.`
        console.warn(`[EmailStore] ${msg}`)
        set({ analysisError: msg })
        return
      }
    }

    set({ isAnalyzing: true, analysisProgress: { current: 0, total: 0 }, analysisError: null })

    window.electronAPI.onEmailAnalysisProgress((progress) => {
      set({ analysisProgress: progress })
    })

    // Wartezeit am Bildschirm während der Analyse — nur solange das Fenster vorn ist.
    // Genau hier wird der Modellunterschied sichtbar: Ein schnelles Cloud-Modell kostet
    // Sekunden, ein großes lokales Modell hält den Nutzer minutenlang fest.
    const warten = createActiveMeasurement()
    warten.begin()
    try {
      const result = await window.electronAPI.emailAnalyze(vaultPath, model, emailIds, email.lowPowerMode, cloud) as
        | {
            success: boolean; analyzed?: number; failed?: number; total?: number
            lastError?: string | null; error?: string
            impact?: { id: string }
          }
        | undefined
      const vordergrundMs = warten.end()
      // Der Eintrag selbst stammt aus dem Main-Prozess — hier wird ausschließlich die
      // Zeit nachgetragen, die nur das Fenster kennen kann.
      if (result?.success && result.impact?.id) {
        void window.electronAPI.activityForeground(vaultPath, result.impact.id, vordergrundMs).catch(() => undefined)
      }
      // Neu laden nach Analyse (skipAutoActions: verhindert erneuten analyzeEmails-Aufruf)
      await get().loadEmails(vaultPath, true)

      // Stilles Scheitern (OOM, fehlendes Modell, Timeout) sichtbar machen — sonst behält
      // die Mail still ein evtl. gesyncten Fremd-Modell-Datensatz und der Nutzer merkt nichts.
      if (result && result.success === false) {
        set({ analysisError: result.error || `Analyse mit „${displayModel}" fehlgeschlagen.` })
      } else if (result && typeof result.failed === 'number' && result.failed > 0) {
        const total = result.total ?? (result.failed + (result.analyzed || 0))
        const detail = result.lastError ? ` ${result.lastError}` : ''
        set({ analysisError: `${result.failed} von ${total} Mails konnten mit „${displayModel}" nicht analysiert werden.${detail}` })
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
      warten.cancel()
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

    // Aufbewahrungsfenster wirkt nur noch auf die ANZEIGE. Früher kürzte der
    // Ladevorgang damit die Datei und schrieb sie zurück — ein Gerät mit 30 Tagen
    // löschte so die 60-Tage-Historie des anderen, still und ohne Abruf.
    // Eine Anzeigeeinstellung darf keine Daten löschen.
    const retainDays = emailSettings.retainDays || 0
    const displayCutoff = retainDays > 0
      ? new Date(Date.now() - retainDays * 24 * 60 * 60 * 1000).toISOString()
      : null

    return emails.filter((email) => {
      if (displayCutoff && email.date && email.date < displayCutoff) {
        return false
      }

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

      // Nur relevante — rein über die User-Schwelle, NICHT über analysis.relevant:
      // das Flag ist mit der Scorer-Default-Schwelle (30) eingefroren und würde eine
      // höher gestellte Schwelle überstimmen (Liste ≠ Badge/Notiz-Erstellung).
      if (activeFilter.onlyRelevant) {
        if ((email.analysis?.relevanceScore ?? 0) < emailSettings.relevanceThreshold) {
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
          replyHandledAt: handled ? new Date().toISOString() : undefined,
          // Auch das Zurücknehmen bekommt einen Zeitstempel. Ohne ihn ließe sich
          // beim Zusammenführen zweier Geräte nur noch ODER bilden — und ein
          // „doch noch nicht beantwortet" wäre bei jedem Fremdstand wieder weg.
          replyHandledChangedAt: new Date().toISOString()
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
    // Jede Entscheidung bekommt einen Zeitstempel — auch das Zurücksetzen auf
    // automatische Zuordnung. Sonst lässt sich beim Zusammenführen zweier Geräte
    // nicht sagen, welche Wahl die spätere war, und der Wert pendelt.
    const changedAt = new Date().toISOString()
    const next = emails.map(e => e.id === emailId ? { ...e, userProject: folderRel, userProjectChangedAt: changedAt } : e)
    set({ emails: next })
    await get().saveEmails(vaultPath)
  },

  // Compose actions
  setComposeState: (state: ComposeEmail | null) => {
    if (!state) { set({ composeState: null }); return }
    // Jede Änderung über diesen Weg ist eine Nutzeränderung: Entwurf gilt als angefasst.
    const next = state.pristine ? { ...state, pristine: false } : state
    set({ composeState: next })
    persistDraftSoon(next)
  },

  setCurrentView: (view) => set({ currentView: view }),

  sendEmail: async (vaultPath: string) => {
    const { composeState, emails } = get()
    if (!composeState) return { success: false, error: 'Kein Entwurf' }
    // Solange Originalanhänge noch geladen werden, geht nichts raus — sonst
    // ginge die Weiterleitung ohne die Dateien, die sie ankündigt.
    if (composeState.forwardAttachments?.status === 'loading') {
      return { success: false, error: 'Anhänge werden noch geladen' }
    }

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
          uid: result.sentUid || 0,
          accountId: composeState.accountId,
          folder: result.sentMailbox || 'Sent',
          from: { name: '', address: account.user },
          to: composeState.to,
          cc: composeState.cc && composeState.cc.length > 0 ? composeState.cc : undefined,
          subject: composeState.subject,
          date: new Date().toISOString(),
          snippet: composeState.body.substring(0, 200),
          bodyText: composeState.body,
          flags: ['\\Seen'],
          fetchedAt: new Date().toISOString(),
          sent: true,
          // Eigene Anhänge in der lokalen Kopie festhalten — die Anhang-Anzeige
          // prüft diese Felder; APPENDUID allein macht sie nicht sichtbar.
          hasAttachments: (composeState.attachments?.length ?? 0) > 0 || undefined,
          attachmentNames: composeState.attachments && composeState.attachments.length > 0
            ? composeState.attachments.map(a => a.filename)
            : undefined
        }
        if (pendingDraftSave) { clearTimeout(pendingDraftSave.timer); pendingDraftSave = null }
        const drafts = composeState.draftId
          ? removeDraft(window.localStorage, vaultPath, composeState.draftId)
          : get().drafts
        set({
          emails: [...emails, sentEmail],
          composeState: null,
          currentView: 'list',
          drafts,
          lastSendResult: { at: new Date().toISOString(), subject: composeState.subject, appendWarning: result.appendWarning }
        })
        void discardStagedAttachments(composeState)
        await get().saveEmails(vaultPath)
      }
      return result
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Senden fehlgeschlagen' }
    } finally {
      set({ isSending: false })
    }
  },

  clearLastSendResult: () => set({ lastSendResult: null }),
  clearFetchErrors: () => set({ lastFetchErrors: [] }),

  startReply: (email: EmailMessage, bodyOverride?: string) => {
    set({
      composeState: {
        ...buildReplyDraft(email, bodyOverride),
        to: resolveReplyTarget(email).to.map(r => ({ name: r.name, address: r.address })),
        draftId: newDraftId(),
        // Ein KI-Entwurf ist bereits Inhalt, der verloren gehen könnte.
        pristine: bodyOverride === undefined
      },
      currentView: 'compose'
    })
  },

  startReplyAll: (email: EmailMessage) => {
    const { email: emailSettings } = useUIStore.getState()
    const { to, cc } = collectReplyAllRecipients(email, collectOwnAddresses(emailSettings.accounts))
    set({
      composeState: {
        ...buildReplyDraft(email),
        to,
        cc: cc.length > 0 ? cc : undefined,
        draftId: newDraftId(),
        pristine: true
      },
      currentView: 'compose'
    })
  },

  startForward: (email: EmailMessage) => {
    const { email: emailSettings } = useUIStore.getState()
    const accountId = resolveReplyAccountId(email, emailSettings.accounts)
    const sig = emailSettings.signature ? `\n\n--\n${emailSettings.signature}` : ''

    const date = email.date ? new Date(email.date).toLocaleString() : ''
    const sender = email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address
    const toLine = (email.to || []).map(r => r.name ? `${r.name} <${r.address}>` : r.address).join(', ')
    const header = `\n\n---------- Weitergeleitete Nachricht ----------\nVon: ${sender}\nDatum: ${date}\nBetreff: ${email.subject}\nAn: ${toLine}\n\n`
    const originalText = (email.bodyText || email.snippet || '').trim()
    const subject = /^fwd?:\s/i.test(email.subject) ? email.subject : `Fwd: ${email.subject}`
    const draftId = newDraftId()
    const hasAttachments = !!(email.hasAttachments || (email.attachmentNames && email.attachmentNames.length > 0))

    set({
      composeState: {
        to: [],
        subject,
        body: sig + header + originalText,
        accountId,
        draftId,
        pristine: true,
        // Originalanhänge werden vom Server geholt und als Dateien angehängt.
        // Vorher standen nur ihre Namen im Text — die Mail behauptete Anhänge,
        // die nicht mitgingen. Ohne Anhänge gibt es nichts zu laden.
        forwardAttachments: hasAttachments ? { status: 'loading', sourceEmailId: email.id } : undefined
      },
      currentView: 'compose'
    })

    if (!hasAttachments) return
    runForwardStaging(draftVaultPath, draftId, email)
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
        accountId: account?.id || '',
        draftId: newDraftId(),
        pristine: true
      },
      currentView: 'compose'
    })
  },

  closeCompose: () => {
    const { composeState, selectedEmailId } = get()
    if (pendingDraftSave) { clearTimeout(pendingDraftSave.timer); pendingDraftSave = null }
    let drafts = get().drafts
    let draftSaveError: string | null = null
    if (composeState?.draftId && draftVaultPath) {
      if (draftHasContent(composeState)) {
        const res = saveDraft(window.localStorage, draftVaultPath, composeState)
        drafts = res.drafts
        draftSaveError = res.ok ? null : (res.error || 'Entwurf konnte nicht gesichert werden')
      } else {
        drafts = removeDraft(window.localStorage, draftVaultPath, composeState.draftId)
        void discardStagedAttachments(composeState)
      }
    }
    set({ composeState: null, drafts, draftSaveError, currentView: selectedEmailId ? 'detail' : 'list' })
  },

  discardDraft: async (draftId: string) => {
    const { composeState, drafts, selectedEmailId } = get()
    const stored = drafts.find(d => d.id === draftId)?.compose
    if (pendingDraftSave?.draftId === draftId) { clearTimeout(pendingDraftSave.timer); pendingDraftSave = null }
    const next = draftVaultPath ? removeDraft(window.localStorage, draftVaultPath, draftId) : drafts.filter(d => d.id !== draftId)
    const closing = composeState?.draftId === draftId
    set(closing
      ? { drafts: next, composeState: null, currentView: selectedEmailId ? 'detail' : 'list' }
      : { drafts: next })
    await discardStagedAttachments(closing ? composeState : stored)
  },

  openDraft: (draftId: string) => {
    const draft = get().drafts.find(d => d.id === draftId)
    if (!draft) return
    set({ composeState: { ...draft.compose, draftId, pristine: false }, currentView: 'compose' })
    // Unterbrochener Anhang-Download (Fenster/App geschlossen): fortsetzen.
    const fa = draft.compose.forwardAttachments
    if (fa?.status === 'loading') {
      const source = fa.sourceEmailId ? get().emails.find(e => e.id === fa.sourceEmailId) : undefined
      if (source) runForwardStaging(draftVaultPath, draftId, source)
      else set({ composeState: { ...get().composeState!, forwardAttachments: { ...fa, status: 'failed', error: 'Quellmail nicht mehr vorhanden' } } })
    }
  },

  setSeen: async (vaultPath: string, emailId: string, seen: boolean) => {
    const { emails } = get()
    const email = emails.find(e => e.id === emailId)
    if (!email) return { success: false, error: 'Mail nicht gefunden' }
    const hasSeen = email.flags.includes('\\Seen')
    if (hasSeen === seen) return { success: true }
    const withFlag = (flags: string[]) => seen ? [...flags, '\\Seen'] : flags.filter(f => f !== '\\Seen')
    set({ emails: emails.map(e => e.id === emailId ? { ...e, flags: withFlag(e.flags) } : e) })
    get().updateUnreadRelevantCount()

    if (email.uid > 0) {
      const { email: emailSettings } = useUIStore.getState()
      const account = emailSettings.accounts.find(a => a.id === email.accountId)
      if (account) {
        try {
          const res = await window.electronAPI.emailSetFlags({
            accountId: account.id,
            host: account.host,
            port: account.port,
            user: account.user,
            tls: account.tls,
            folder: email.folder || 'INBOX',
            uid: email.uid,
            add: seen ? ['\\Seen'] : undefined,
            remove: seen ? undefined : ['\\Seen']
          })
          if (!res.success) {
            set({ emails: get().emails.map(e => e.id === emailId ? { ...e, flags: email.flags } : e) })
            get().updateUnreadRelevantCount()
            return { success: false, error: res.error }
          }
        } catch (error) {
          set({ emails: get().emails.map(e => e.id === emailId ? { ...e, flags: email.flags } : e) })
          get().updateUnreadRelevantCount()
          return { success: false, error: error instanceof Error ? error.message : 'Markierung fehlgeschlagen' }
        }
      }
    }
    await get().saveEmails(vaultPath)
    return { success: true }
  },

  removeLocalEmails: async (vaultPath: string, ids: string[]) => {
    if (ids.length === 0) return { success: true, removed: 0 }
    try {
      const res = await window.electronAPI.emailDeleteLocal(vaultPath, ids)
      if (!res.success) return { success: false, removed: 0, error: res.error }
      const gone = new Set(ids)
      const { selectedEmailId } = get()
      set({
        emails: get().emails.filter(e => !gone.has(e.id)),
        storeRevision: res.revision ?? get().storeRevision,
        ...(selectedEmailId && gone.has(selectedEmailId) ? { selectedEmailId: null, currentView: 'list' as const } : {})
      })
      get().updateUnreadRelevantCount()
      return { success: true, removed: res.removed }
    } catch (error) {
      console.error('[EmailStore] removeLocalEmails failed:', error)
      return { success: false, removed: 0, error: error instanceof Error ? error.message : 'Entfernen fehlgeschlagen' }
    }
  },

  searchEmails: (query: string) => {
    const q = query.trim()
    if (!q) return []
    return get().emails
      .filter(e => emailMatchesQuery(e, q))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  },

  // AI Chat actions
  setAiChatEmail: (emailId) => set({ aiChatEmailId: emailId, aiChatMessages: [], currentView: 'aiChat' }),

  addAiChatMessage: (msg) => set((state) => ({
    aiChatMessages: [...state.aiChatMessages, msg]
  })),

  setAiChatLoading: (loading) => set({ isAiChatLoading: loading })
}))
