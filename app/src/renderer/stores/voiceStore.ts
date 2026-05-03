import { create } from 'zustand'

// Runtime-State für Voice-Features. Settings liegen im uiStore.speech.
// Runtime-State ist global, damit nie zwei TTS-Streams oder Recorder gleichzeitig laufen.

export type VoiceStatus = 'idle' | 'speaking' | 'recording' | 'transcribing' | 'loading'

interface VoiceState {
  status: VoiceStatus
  /** Eindeutige ID des aktuellen Sprechers/Hörers, damit Komponenten ihren eigenen Aktiv-Zustand erkennen können. */
  activeContextId: string | null
  /** Letzter Fehler, den die UI anzeigen kann. */
  lastError: string | null
  /** Beim ersten Modell-Download zeigt die UI einen Fortschrittsbalken (0–100). null = unbekannt/keine Aktion. */
  loadingProgress: number | null
  /** Frei beschreibender Status (z. B. "Lade whisper-base ..."), nur informativ. */
  loadingLabel: string | null

  setSpeaking: (contextId: string) => void
  setRecording: (contextId: string) => void
  setTranscribing: (contextId: string) => void
  setLoading: (label: string, progress: number | null) => void
  setIdle: () => void
  setError: (message: string | null) => void
  isActiveContext: (contextId: string) => boolean
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  status: 'idle',
  activeContextId: null,
  lastError: null,
  loadingProgress: null,
  loadingLabel: null,

  setSpeaking: (contextId) => set({ status: 'speaking', activeContextId: contextId, lastError: null }),
  setRecording: (contextId) => set({ status: 'recording', activeContextId: contextId, lastError: null }),
  setTranscribing: (contextId) => set({ status: 'transcribing', activeContextId: contextId, loadingProgress: null, loadingLabel: null }),
  setLoading: (label, progress) => set({ status: 'loading', loadingLabel: label, loadingProgress: progress }),
  setIdle: () => set({ status: 'idle', activeContextId: null, loadingProgress: null, loadingLabel: null }),
  setError: (message) => set({ lastError: message }),
  isActiveContext: (contextId) => {
    const s = get()
    return s.activeContextId === contextId && s.status !== 'idle'
  }
}))
