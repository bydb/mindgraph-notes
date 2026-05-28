// Coach-Session-Store. Ephemer (lebt nur während einer Onboarding-Session) —
// persistiert wird nichts; ein kleiner Endzustand wandert in den uiStore
// (coach.completed, coach.acceptedActionIds, coach.suggestedProfile).

import { create } from 'zustand'
import type { UserProfile } from './uiStore'
import { useUIStore } from './uiStore'

export type CoachActionType =
  | 'choose-vault'
  | 'set-editor-mode'
  | 'enable-module'
  | 'set-widgets'
  | 'suggest-profile'
  | 'create-folder'
  | 'create-note'
  | 'open-settings'
  | 'open-help'

export type CoachActionStatus = 'pending' | 'accepted' | 'declined' | 'executed' | 'failed'

export interface CoachAction {
  actionId: string
  type: CoachActionType
  title: string
  description: string
  payload: Record<string, unknown>
  status: CoachActionStatus
  error?: string
}

export interface CoachMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  actions?: CoachAction[]
  rawAssistantContent?: string  // Original-Response inkl. Action-Fence (für History an Backend)
}

export type CoachPhase = 'idle' | 'precheck' | 'asking' | 'planning' | 'done' | 'error'
export type CoachBackend = 'ollama' | 'none' | null

interface CoachState {
  phase: CoachPhase
  backend: CoachBackend
  backendDetail: string
  vaultReady: boolean
  conversation: CoachMessage[]
  suggestedProfile: UserProfile
  acceptedActions: CoachAction[]
  loading: boolean
  errorText: string | null

  precheckAndStart: (isRestart?: boolean) => Promise<void>
  sendUserText: (text: string) => Promise<void>
  decideAction: (messageId: string, actionId: string, accept: boolean) => Promise<void>
  /** Markiert eine Action als ausgeführt (von außen — Executor) bzw. failed. */
  reportActionResult: (messageId: string, actionId: string, status: 'executed' | 'failed', error?: string) => void
  /** Markiert vault-ready (wird vom Executor nach choose-vault gesetzt). */
  markVaultReady: () => void
  setSuggestedProfile: (profile: UserProfile) => void
  finish: () => void
  reset: () => void
}

function makeMessageId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// History-Aufbau für Backend: User-Text + Original-Assistant-Content (mit
// Action-Fence) als ChatMessage-Liste — das LLM sieht so seine eigene letzte
// Antwort und kann nahtlos weitermachen.
function buildBackendHistory(conversation: CoachMessage[]) {
  return conversation.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.role === 'assistant' ? (m.rawAssistantContent ?? m.text) : m.text
  }))
}

export const useCoachStore = create<CoachState>((set, get) => ({
  phase: 'idle',
  backend: null,
  backendDetail: '',
  vaultReady: false,
  conversation: [],
  suggestedProfile: null,
  acceptedActions: [],
  loading: false,
  errorText: null,

  precheckAndStart: async (isRestart = false) => {
    set({ phase: 'precheck', loading: true, errorText: null })
    try {
      const pre = await window.electronAPI.coachPrecheck()
      if (pre.backend === 'none') {
        set({
          phase: 'error',
          backend: 'none',
          backendDetail: pre.detail,
          loading: false,
          errorText: pre.detail
        })
        return
      }
      const language = useUIStore.getState().language === 'en' ? 'en' : 'de'
      const start = await window.electronAPI.coachStart({ language, isRestart })
      const greetMsg: CoachMessage = {
        id: makeMessageId(),
        role: 'assistant',
        text: start.greeting
      }
      // Bei Restart: vault gilt als bereit, choose-vault wird nicht erneut vorgeschlagen
      set({
        phase: 'asking',
        backend: start.backend === 'ollama' ? start.backend : null,
        backendDetail: pre.detail,
        conversation: [greetMsg],
        vaultReady: isRestart,
        loading: false
      })
    } catch (err) {
      set({
        phase: 'error',
        loading: false,
        errorText: err instanceof Error ? err.message : String(err)
      })
    }
  },

  sendUserText: async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || get().loading) return
    const userMsg: CoachMessage = { id: makeMessageId(), role: 'user', text: trimmed }
    const beforeSend = [...get().conversation, userMsg]
    set({ conversation: beforeSend, loading: true, errorText: null })

    try {
      const history = buildBackendHistory(get().conversation)
      const language = useUIStore.getState().language === 'en' ? 'en' : 'de'
      const response = await window.electronAPI.coachRespond({
        userText: trimmed,
        history,
        vaultReady: get().vaultReady,
        acceptedActionIds: get().acceptedActions.map(a => a.actionId),
        acceptedActionTypes: get().acceptedActions.map(a => a.type),
        language
      })

      if (!response.ok) {
        set({
          conversation: [...beforeSend, {
            id: makeMessageId(),
            role: 'assistant',
            text: language === 'de'
              ? `Es gab einen Fehler bei der KI-Antwort: ${response.error}`
              : `There was an error with the AI response: ${response.error}`
          }],
          loading: false,
          errorText: response.error
        })
        return
      }

      const assistantMsg: CoachMessage = {
        id: makeMessageId(),
        role: 'assistant',
        text: response.text || (language === 'de' ? '(leere Antwort)' : '(empty response)'),
        // Cast: IPC-Boundary verliert Discriminated-Union — der Main-Validator
        // hat die Werte schon gegen das CoachAction-Schema geprüft.
        actions: response.actions as CoachAction[],
        rawAssistantContent: undefined  // chatClient liefert in result.text bereits den vollen Output inkl. Fence — wir behalten den geparsten Text + Actions
      }
      set({
        conversation: [...beforeSend, assistantMsg],
        loading: false,
        phase: response.actions.length > 0 ? 'planning' : 'asking'
      })
    } catch (err) {
      set({
        loading: false,
        errorText: err instanceof Error ? err.message : String(err)
      })
    }
  },

  decideAction: async (messageId, actionId, accept) => {
    const state = get()
    const newConversation = state.conversation.map(m => {
      if (m.id !== messageId || !m.actions) return m
      return {
        ...m,
        actions: m.actions.map(a =>
          a.actionId === actionId
            ? { ...a, status: accept ? 'accepted' as const : 'declined' as const }
            : a
        )
      }
    })
    set({ conversation: newConversation })
    // Tatsächliche Ausführung passiert in coachActionExecutor.ts — der Caller
    // ruft executeAction() nach dem Accept-Decide auf und meldet das Ergebnis
    // via reportActionResult zurück.
  },

  reportActionResult: (messageId, actionId, status, error) => {
    const state = get()
    let movedToAccepted: CoachAction | null = null
    const newConversation = state.conversation.map(m => {
      if (m.id !== messageId || !m.actions) return m
      return {
        ...m,
        actions: m.actions.map(a => {
          if (a.actionId !== actionId) return a
          const updated: CoachAction = { ...a, status, error }
          if (status === 'executed') movedToAccepted = updated
          return updated
        })
      }
    })
    set({
      conversation: newConversation,
      acceptedActions: movedToAccepted
        ? [...state.acceptedActions, movedToAccepted]
        : state.acceptedActions
    })
  },

  markVaultReady: () => set({ vaultReady: true }),

  setSuggestedProfile: (profile) => set({ suggestedProfile: profile }),

  finish: () => {
    const s = get()
    // Endzustand in uiStore persistieren
    const ui = useUIStore.getState()
    ui.setCoachCompleted(true, {
      acceptedActionIds: s.acceptedActions.map(a => a.actionId),
      suggestedProfile: s.suggestedProfile,
      finishedAt: Date.now()
    })
    set({ phase: 'done' })
  },

  reset: () => set({
    phase: 'idle',
    backend: null,
    backendDetail: '',
    vaultReady: false,
    conversation: [],
    suggestedProfile: null,
    acceptedActions: [],
    loading: false,
    errorText: null
  })
}))
