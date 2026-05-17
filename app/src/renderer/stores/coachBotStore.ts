// Renderer-Store für den CoachBot (dauerhafter Q&A-Helfer im Header).
// Ephemer pro App-Start — Verlauf lebt im Speicher, geht beim Quit verloren.
// Unabhängig vom Onboarding-Coach (coachStore.ts) — keine Actions, keine
// Vault-Logik, nur Frage → Antwort.

import { create } from 'zustand'
import { useUIStore } from './uiStore'

export interface CoachBotMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface CoachBotState {
  messages: CoachBotMessage[]
  loading: boolean
  errorText: string | null
  backend: 'ollama' | 'anthropic' | null
  ask: (question: string) => Promise<void>
  clear: () => void
}

function makeId(): string {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const useCoachBotStore = create<CoachBotState>((set, get) => ({
  messages: [],
  loading: false,
  errorText: null,
  backend: null,

  ask: async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || get().loading) return

    const userMsg: CoachBotMessage = { id: makeId(), role: 'user', text: trimmed }
    set({ messages: [...get().messages, userMsg], loading: true, errorText: null })

    try {
      const language = useUIStore.getState().language === 'en' ? 'en' : 'de'
      const history = get().messages.map(m => ({ role: m.role, content: m.text }))

      const backend = useUIStore.getState().coachBotBackend
      const response = await window.electronAPI.coachAsk({
        question: trimmed,
        history,
        language,
        backend
      })

      if (!response.ok) {
        const errorText = language === 'de'
          ? `Hm, da ist etwas schiefgelaufen: ${response.error}. Vielleicht ist Ollama gerade aus, oder es ist kein Anthropic-Key in den Telegram-Settings hinterlegt.`
          : `Hm, something went wrong: ${response.error}. Maybe Ollama is off, or no Anthropic key is set in Telegram settings.`
        set({
          messages: [...get().messages, { id: makeId(), role: 'assistant', text: errorText }],
          loading: false,
          errorText: response.error
        })
        return
      }

      set({
        messages: [...get().messages, { id: makeId(), role: 'assistant', text: response.text }],
        loading: false,
        backend: response.backend
      })
    } catch (err) {
      set({
        loading: false,
        errorText: err instanceof Error ? err.message : String(err)
      })
    }
  },

  clear: () => set({ messages: [], errorText: null })
}))
