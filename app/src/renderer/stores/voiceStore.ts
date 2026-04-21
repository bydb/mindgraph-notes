import { create } from 'zustand'

// Runtime-State für Voice-Features. Settings liegen im uiStore.speech.
// Runtime-State ist global, damit nie zwei TTS-Streams oder Recorder gleichzeitig laufen.

export type VoiceStatus = 'idle' | 'speaking' | 'recording' | 'transcribing'

interface VoiceState {
  status: VoiceStatus
  /** Eindeutige ID des aktuellen Sprechers/Hörers, damit Komponenten ihren eigenen Aktiv-Zustand erkennen können. */
  activeContextId: string | null
  /** Letzter Fehler, den die UI anzeigen kann. */
  lastError: string | null

  setSpeaking: (contextId: string) => void
  setRecording: (contextId: string) => void
  setTranscribing: (contextId: string) => void
  setIdle: () => void
  setError: (message: string | null) => void
  isActiveContext: (contextId: string) => boolean
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  status: 'idle',
  activeContextId: null,
  lastError: null,

  setSpeaking: (contextId) => set({ status: 'speaking', activeContextId: contextId, lastError: null }),
  setRecording: (contextId) => set({ status: 'recording', activeContextId: contextId, lastError: null }),
  setTranscribing: (contextId) => set({ status: 'transcribing', activeContextId: contextId }),
  setIdle: () => set({ status: 'idle', activeContextId: null }),
  setError: (message) => set({ lastError: message }),
  isActiveContext: (contextId) => {
    const s = get()
    return s.activeContextId === contextId && s.status !== 'idle'
  }
}))
